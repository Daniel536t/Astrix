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
var _cullFrustum = new THREE3.Frustum();
var _cullMatrix = new THREE3.Matrix4();

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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwNC53b3JrZXJzLnRlc3QudHMiLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS9ub2lzZS50cyIsICIuLi8uLi9zcmMvc2ltL2h5ZHJvbG9neS50cyIsICIuLi8uLi9zcmMvc2ltL21hdGVyaWFscy50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4tdjIudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3JlbmRlci93YXRlci50cyIsICIuLi8uLi9zcmMvZGF0YS9wYWxldHRlLmpzb24iLCAiLi4vLi4vc3JjL3JlbmRlci92b3hlbC1jb2xvcnMudHMiLCAiLi4vLi4vc3JjL3JlbmRlci9tZXNoZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB0ZXN0IGZyb20gJ25vZGU6dGVzdCc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCc7XG5pbXBvcnQge1xuICBHRU5FUkFUT1JfVjIsIEdFTkVSQVRPUl9WRVJTSU9OLCBNQVQsIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBjb21wdXRlQmFzZUNvbHVtbnMsIGNyZWF0ZVdvcmxkLCBlbnN1cmVDaHVuayxcbiAgZ2VuZXJhdGVCYXNlQ2h1bmssIGluc3RhbGxCYXNlQ2h1bmssIHNlZWRCYXNlQ29sdW1ucywgc2V0Vm94ZWwsIHN1cmZhY2VBdCwgY2h1bmtLZXksXG59IGZyb20gJy4uL3NyYy9zaW0vd29ybGQnO1xuaW1wb3J0IHsgbWVzaENodW5rLCBwYWRkZWRGb3IgfSBmcm9tICcuLi9zcmMvcmVuZGVyL3RlcnJhaW4nO1xuaW1wb3J0IHsgbWVzaFBhZGRlZCB9IGZyb20gJy4uL3NyYy9yZW5kZXIvbWVzaGVyJztcblxuLy8gVGhlIHdvcmtlciBydW5zIGV4YWN0bHkgdGhlc2UgcHVyZSBmdW5jdGlvbnM7IHRoaXMgdGVzdCBwcm92ZXMgdGhhdCB0aGVcbi8vIG9mZi10aHJlYWQgcGF0aCBpbnN0YWxscyB0aGUgc2FtZSBjaHVuaywgZW50aXRpZXMgYW5kIG1lc2ggYXMgdGhlXG4vLyBzeW5jaHJvbm91cyBwYXRoLCBpbmNsdWRpbmcgZHVyYWJsZSBlZGl0cyBtYWRlIGJlZm9yZSB0aGUgcmVzdWx0IGFycml2ZXMuXG5mb3IgKGNvbnN0IHZlcnNpb24gb2YgW0dFTkVSQVRPUl9WRVJTSU9OLCBHRU5FUkFUT1JfVjJdKSB7XG4gIHRlc3QoYHdvcmtlci1wYXRoIGdlbmVyYXRpb24gaXMgaWRlbnRpY2FsIHRvIHN5bmNocm9ub3VzIGdlbmVyYXRpb24gKHYke3ZlcnNpb259KWAsICgpID0+IHtcbiAgICBjb25zdCBzeW5jID0gY3JlYXRlV29ybGQoMTMzNywgdmVyc2lvbik7XG4gICAgY29uc3QgdmlhV29ya2VyID0gY3JlYXRlV29ybGQoMTMzNywgdmVyc2lvbik7XG4gICAgY29uc3QgY3ggPSAyOSwgY3ogPSAyOTtcbiAgICAvLyBBIGR1cmFibGUgZWRpdCByZWNvcmRlZCBiZWZvcmUgdGhlIGNodW5rIGJlY29tZXMgcmVzaWRlbnQuXG4gICAgZm9yIChjb25zdCB3IG9mIFtzeW5jLCB2aWFXb3JrZXJdKSB7XG4gICAgICBjb25zdCBwcm9iZSA9IGNyZWF0ZVdvcmxkKDEzMzcsIHZlcnNpb24pO1xuICAgICAgY29uc3QgeSA9IHN1cmZhY2VBdChwcm9iZSwgY2h1bmtPcmlnaW5YKGN4KSArIDUsIGNodW5rT3JpZ2luWihjeikgKyA1KTtcbiAgICAgIHcuZWRpdHMuc2V0KGNodW5rS2V5KGN4LCBjeiksIG5ldyBNYXAoKSk7XG4gICAgICBzZXRWb3hlbCh3LCBjaHVua09yaWdpblgoY3gpICsgNSwgeSwgY2h1bmtPcmlnaW5aKGN6KSArIDUsIE1BVC5TVE9ORSk7XG4gICAgICB3LmNodW5rcy5jbGVhcigpO1xuICAgICAgdy5lbnRpdGllcy5jbGVhcigpOyB3LmVudGl0eUNodW5rcy5jbGVhcigpO1xuICAgIH1cbiAgICBjb25zdCBhID0gZW5zdXJlQ2h1bmsoc3luYywgY3gsIGN6KSE7XG4gICAgY29uc3QgYmFzZSA9IGdlbmVyYXRlQmFzZUNodW5rKDEzMzcsIHZlcnNpb24sIGN4LCBjeik7XG4gICAgc2VlZEJhc2VDb2x1bW5zKHZpYVdvcmtlciwgY2h1bmtLZXkoY3gsIGN6KSwgY29tcHV0ZUJhc2VDb2x1bW5zKDEzMzcsIHZlcnNpb24sIGN4LCBjeikpO1xuICAgIGNvbnN0IGIgPSBpbnN0YWxsQmFzZUNodW5rKHZpYVdvcmtlciwgYmFzZSkhO1xuICAgIGFzc2VydC5kZWVwRXF1YWwoYi5kYXRhLCBhLmRhdGEpO1xuICAgIGFzc2VydC5kZWVwRXF1YWwoYi5oZWlnaHRzLCBhLmhlaWdodHMpO1xuICAgIGFzc2VydC5kZWVwRXF1YWwoYi50b3BNYXRlcmlhbHMsIGEudG9wTWF0ZXJpYWxzKTtcbiAgICBhc3NlcnQuZGVlcEVxdWFsKFsuLi52aWFXb3JrZXIuZW50aXRpZXMudmFsdWVzKCldLCBbLi4uc3luYy5lbnRpdGllcy52YWx1ZXMoKV0pO1xuICAgIGFzc2VydC5lcXVhbChpbnN0YWxsQmFzZUNodW5rKHZpYVdvcmtlciwgYmFzZSksIGIsICdhIHNlY29uZCByZXN1bHQgZm9yIGEgcmVzaWRlbnQgY2h1bmsgaXMgaWdub3JlZCcpO1xuICAgIGFzc2VydC50aHJvd3MoKCkgPT4gaW5zdGFsbEJhc2VDaHVuayhjcmVhdGVXb3JsZCg3LCB2ZXJzaW9uKSwgYmFzZSksIC9kaWZmZXJlbnQgd29ybGQvKTtcblxuICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIHsgZW5zdXJlQ2h1bmsoc3luYywgY3ggKyBkeCwgY3ogKyBkeik7IGVuc3VyZUNodW5rKHZpYVdvcmtlciwgY3ggKyBkeCwgY3ogKyBkeik7IH1cbiAgICBjb25zdCBtMSA9IG1lc2hDaHVuayhzeW5jLCBhKTtcbiAgICBjb25zdCBtMiA9IG1lc2hQYWRkZWQocGFkZGVkRm9yKHZpYVdvcmtlciwgYiksIGIuaGVpZ2h0cywgY2h1bmtPcmlnaW5YKGN4KSwgY2h1bmtPcmlnaW5aKGN6KSwgMTMzNyk7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChBcnJheS5mcm9tKG0yLnBvc2l0aW9ucyksIEFycmF5LmZyb20obTEuZ2VvbWV0cnkuZ2V0QXR0cmlidXRlKCdwb3NpdGlvbicpLmFycmF5KSk7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChBcnJheS5mcm9tKG0yLmluZGljZXMpLCBBcnJheS5mcm9tKG0xLmdlb21ldHJ5LmluZGV4IS5hcnJheSkpO1xuICB9KTtcbn1cbiIsICIvLyBQcml2YXRlIG1pZ3JhdGlvbiByZXBsYXkgb25seS4gUmV0aXJlZCBlbnRpdGllcyBsaXZlIGluIHRoaXMgV29ybGQgd2hpbGUgYW5cbi8vIGFjY2VwdGVkIGhpc3RvcmljYWwgam91cm5hbCBpcyBjaGVja2VkOyBubyBwdWJsaWMgY29tbWFuZCBlbmFibGVzIHRoaXMgbW9kZS5cbmludGVyZmFjZSBSZXBsYXlTdGF0ZSB7XG4gIGFjdGl2ZTogYm9vbGVhbjtcbiAgaGlzdG9yaWNhbEhhc2g6IGJvb2xlYW47XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBzdGF0ZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFJlcGxheVN0YXRlPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZDogb2JqZWN0KTogUmVwbGF5U3RhdGUge1xuICBsZXQgc3RhdGUgPSBzdGF0ZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzdGF0ZSkgeyBzdGF0ZSA9IHsgYWN0aXZlOiBmYWxzZSwgaGlzdG9yaWNhbEhhc2g6IGZhbHNlLCBtaWdyYXRlZDogZmFsc2UgfTsgc3RhdGVzLnNldCh3b3JsZCwgc3RhdGUpOyB9XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xuICBzdGF0ZS5taWdyYXRlZCA9IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uYWN0aXZlID8/IGZhbHNlO1xufVxuXG4vKiogU25hcHNob3QgaGFzaGVzIGJlZm9yZSBhbmQgZHVyaW5nIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5IGluY2x1ZGUgc3RvbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZUhpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lmhpc3RvcmljYWxIYXNoID8/IGZhbHNlO1xufVxuXG4vKiogQSBtaWdyYXRlZCBzbmFwc2hvdCBhbHJlYWR5IGhhcyByZXRpcmVtZW50IHRvbWJzdG9uZXMgaW4gZ2VuZXJhdGVkIGNodW5rcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8ubWlncmF0ZWQgPz8gZmFsc2U7XG59XG5cbi8qKiBFeGl0IGhpc3RvcmljYWwgbW9kZSBhZnRlciBhbGwgYWNjZXB0ZWQgY29tbWFuZHMgYW5kIGhhc2hlcyBoYXZlIHBhc3NlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IGZhbHNlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IGZhbHNlO1xuICBzdGF0ZS5taWdyYXRlZCA9IHRydWU7XG59XG4iLCAiLy8gRGV0ZXJtaW5pc3RpYyBoYXNoLCBub2lzZSBhbmQgbWF0aCBoZWxwZXJzIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllci5cbi8vIFB1cmUgVHlwZVNjcmlwdCAoRC0wMDUpLiBFeHRyYWN0ZWQgZnJvbSB3b3JsZC50cyB1bmNoYW5nZWQgc28gdGVycmFpblxuLy8gZ2VuZXJhdG9ycyBvZiBldmVyeSB2ZXJzaW9uIHVzZSBpZGVudGljYWwgcHJpbWl0aXZlcy5cbmV4cG9ydCBjb25zdCBjbGFtcCA9ICh2OiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiAodiA8IGEgPyBhIDogdiA+IGIgPyBiIDogdik7XG5leHBvcnQgY29uc3QgbGVycCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgdDogbnVtYmVyKSA9PiBhICsgKGIgLSBhKSAqIHQ7XG5leHBvcnQgY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5leHBvcnQgY29uc3Qgc21vb3RoID0gKHQ6IG51bWJlcikgPT4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UyKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKTtcbiAgY29uc3QgYSA9IGhhc2gyaSh4aSwgeWksIHNlZWQpLCBiID0gaGFzaDJpKHhpICsgMSwgeWksIHNlZWQpO1xuICBjb25zdCBjID0gaGFzaDJpKHhpLCB5aSArIDEsIHNlZWQpLCBkID0gaGFzaDJpKHhpICsgMSwgeWkgKyAxLCBzZWVkKTtcbiAgY29uc3QgdG9wID0gYSArIChiIC0gYSkgKiB4ZjtcbiAgY29uc3QgYm90dG9tID0gYyArIChkIC0gYykgKiB4ZjtcbiAgcmV0dXJuIHRvcCArIChib3R0b20gLSB0b3ApICogeWY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0yKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UyKHggKiBmcmVxLCB5ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMyh4ICogZnJlcSwgeSAqIGZyZXEsIHogKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG4iLCAiLy8gSHlkcm9sb2d5IFx1MjAxNCB0aGUgZGV0ZXJtaW5pc3RpYyB3YXRlciBuZXR3b3JrIG9mIGEgd29ybGQgKHB1cmUgVHlwZVNjcmlwdCwgRC0wMDUpLlxuLy9cbi8vIFRoaXMgaXMgZGVyaXZlZCAqc2ltdWxhdGlvbiBkYXRhKiwgbm90IHByZXNlbnRhdGlvbjogaXQgaXMgYSBwdXJlIGZ1bmN0aW9uIG9mXG4vLyAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pIGFuZCBpcyB3aGF0IHRlcnJhaW4gY2FydmluZywgd2F0ZXIgZmlsbGluZywgZmxvd1xuLy8gZGlyZWN0aW9uIGFuZCBmdXR1cmUgZmlzaGluZy9pcnJpZ2F0aW9uL2Zsb29kaW5nIHJ1bGVzIHJlYWQuIEl0IGlzIG5ldmVyXG4vLyBqb3VybmFsZWQgYmVjYXVzZSBpdCBjYW4gYWx3YXlzIGJlIHJlZ2VuZXJhdGVkIGV4YWN0bHkuXG4vL1xuLy8gTmV0d29yayAoYm90aCBnZW5lcmF0b3IgdmVyc2lvbnMpOlxuLy8gICBsYWtlICBcdTIwMTQgdGhlIHZhbGxleSBsYWtlIGJhc2luLCBsb2NhdGVkIGZyb20gdGhlIGFjdHVhbCBnZW5lcmF0ZWQgdGVycmFpbi5cbi8vICAgbG93ZXIgXHUyMDE0IHRoZSBsb3dsYW5kIHJpdmVyIGZyb20gdGhlIGxha2UgdG8gdGhlIHNvdXRoZXJuIHNlYSwgdHJhY2VkIGZyb21cbi8vICAgICAgICAgICB0aGUgYWN0dWFsIGNhcnZlZCBjaGFubmVsICh0aGUgdjEgY2hhbm5lbCBpcyBjYXJ2ZWQgb24gKndhcnBlZCpcbi8vICAgICAgICAgICBjb29yZGluYXRlcywgc28gYHJpdmVyQ2VudGVyWGAgYWxvbmUgaXMgdXAgdG8gfjEzNSBtIG9mZikuXG4vLyBHZW5lcmF0b3IgdjIgYWRkczpcbi8vICAgdXBwZXIgXHUyMDE0IGEgbW91bnRhaW4gcml2ZXIgZnJvbSBhIGhpZ2hsYW5kIHRhcm4gZG93biB0byB0aGUgbGFrZSwgd2l0aCBhXG4vLyAgICAgICAgICAgd2F0ZXItc3VyZmFjZSBsZXZlbCB0aGF0IG5ldmVyIHJpc2VzIGRvd25zdHJlYW0sIGNhc2NhZGVzIGFuZCBmYWxscy5cbi8vXG4vLyBGbG93IGFsd2F5cyBwb2ludHMgZG93bnN0cmVhbTogdXBwZXIgXHUyMTkyIGxha2UgXHUyMTkyIGxvd2VyIFx1MjE5MiBzZWEuXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbXVsYmVycnkzMiwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuXG5leHBvcnQgdHlwZSBIZWlnaHRTYW1wbGVyID0gKHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUml2ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZCBvZiB0aGlzIHJlYWNoIChtZXRyZXMpLiAqL1xuICBzOiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGVsZXZhdGlvbiAobWV0cmVzLCBtYXkgYmUgZnJhY3Rpb25hbCkuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBDaGFubmVsIGhhbGYtd2lkdGggKG1ldHJlcykuICovXG4gIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhY2hIaXQge1xuICAvKiogSG9yaXpvbnRhbCBkaXN0YW5jZSBmcm9tIHRoZSBjZW50cmVsaW5lLiAqL1xuICBkOiBudW1iZXI7XG4gIC8qKiBJbnRlcnBvbGF0ZWQgd2F0ZXIgbGV2ZWwgYXQgdGhlIG5lYXJlc3QgY2VudHJlbGluZSBwb2ludC4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgd2lkdGg6IG51bWJlcjtcbiAgLyoqIFVuaXQgZG93bnN0cmVhbSBkaXJlY3Rpb24uICovXG4gIHR4OiBudW1iZXI7XG4gIHR6OiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGRyb3AgcGVyIG1ldHJlIGFsb25nIHRoZSBjaGFubmVsICg+PSAwKS4gKi9cbiAgZ3JhZGllbnQ6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggb2YgdGhlIG5lYXJlc3QgcG9pbnQgZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQuICovXG4gIHM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHBvbHlsaW5lIHJlYWNoIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LiBOZWFyZXN0LXNlZ21lbnQgcXVlcmllcyB1c2UgYVxuICogdW5pZm9ybSBncmlkIHdob3NlIGNlbGxzIGxpc3QgZXZlcnkgc2VnbWVudCB3aXRoaW4gYHJlYWNoYCBtZXRyZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBSaXZlclJlYWNoIHtcbiAgcmVhZG9ubHkgcG9pbnRzOiBSaXZlclBvaW50W107XG4gIHByaXZhdGUgcmVhZG9ubHkgY2VsbCA9IDMyO1xuICBwcml2YXRlIHJlYWRvbmx5IGdyaWQgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyW10+KCk7XG5cbiAgY29uc3RydWN0b3IocG9pbnRzOiBSaXZlclBvaW50W10sIHJlYWRvbmx5IHJlYWNoOiBudW1iZXIpIHtcbiAgICB0aGlzLnBvaW50cyA9IHBvaW50cztcbiAgICBmb3IgKGxldCBpID0gMDsgaSArIDEgPCBwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGEgPSBwb2ludHNbaV0sIGIgPSBwb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgeDAgPSBNYXRoLm1pbihhLngsIGIueCkgLSByZWFjaCwgeDEgPSBNYXRoLm1heChhLngsIGIueCkgKyByZWFjaDtcbiAgICAgIGNvbnN0IHowID0gTWF0aC5taW4oYS56LCBiLnopIC0gcmVhY2gsIHoxID0gTWF0aC5tYXgoYS56LCBiLnopICsgcmVhY2g7XG4gICAgICBmb3IgKGxldCBjeiA9IE1hdGguZmxvb3IoejAgLyB0aGlzLmNlbGwpOyBjeiA8PSBNYXRoLmZsb29yKHoxIC8gdGhpcy5jZWxsKTsgY3orKykge1xuICAgICAgICBmb3IgKGxldCBjeCA9IE1hdGguZmxvb3IoeDAgLyB0aGlzLmNlbGwpOyBjeCA8PSBNYXRoLmZsb29yKHgxIC8gdGhpcy5jZWxsKTsgY3grKykge1xuICAgICAgICAgIGNvbnN0IGtleSA9IGNlbGxLZXkoY3gsIGN6KTtcbiAgICAgICAgICBsZXQgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoa2V5KTtcbiAgICAgICAgICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB0aGlzLmdyaWQuc2V0KGtleSwgbGlzdCk7IH1cbiAgICAgICAgICBsaXN0LnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnBvaW50c1t0aGlzLnBvaW50cy5sZW5ndGggLSAxXT8ucyA/PyAwOyB9XG5cbiAgLyoqIE5lYXJlc3QgY2VudHJlbGluZSBwb2ludCB3aXRoaW4gYHJlYWNoYCwgb3IgbnVsbC4gKi9cbiAgbmVhcmVzdCh4OiBudW1iZXIsIHo6IG51bWJlcik6IFJlYWNoSGl0IHwgbnVsbCB7XG4gICAgY29uc3QgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoY2VsbEtleShNYXRoLmZsb29yKHggLyB0aGlzLmNlbGwpLCBNYXRoLmZsb29yKHogLyB0aGlzLmNlbGwpKSk7XG4gICAgaWYgKCFsaXN0KSByZXR1cm4gbnVsbDtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBiaSA9IC0xLCBidCA9IDA7XG4gICAgZm9yIChjb25zdCBpIG9mIGxpc3QpIHtcbiAgICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tpXSwgYiA9IHRoaXMucG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IGR4ID0gYi54IC0gYS54LCBkeiA9IGIueiAtIGEuejtcbiAgICAgIGNvbnN0IGxlbjIgPSBkeCAqIGR4ICsgZHogKiBkeiB8fCAxO1xuICAgICAgY29uc3QgdCA9IGNsYW1wKCgoeCAtIGEueCkgKiBkeCArICh6IC0gYS56KSAqIGR6KSAvIGxlbjIsIDAsIDEpO1xuICAgICAgY29uc3QgcHggPSBhLnggKyBkeCAqIHQsIHB6ID0gYS56ICsgZHogKiB0O1xuICAgICAgY29uc3QgZDIgPSAoeCAtIHB4KSAqKiAyICsgKHogLSBweikgKiogMjtcbiAgICAgIGlmIChkMiA8IGJlc3QpIHsgYmVzdCA9IGQyOyBiaSA9IGk7IGJ0ID0gdDsgfVxuICAgIH1cbiAgICBpZiAoYmkgPCAwIHx8IGJlc3QgPiB0aGlzLnJlYWNoICogdGhpcy5yZWFjaCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2JpXSwgYiA9IHRoaXMucG9pbnRzW2JpICsgMV07XG4gICAgY29uc3Qgc2VnTGVuID0gTWF0aC5tYXgoMWUtNiwgYi5zIC0gYS5zKTtcbiAgICAvLyBQb2ludHMgYXJlIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LCBzbyBkb3duc3RyZWFtIGlzIGEgPC0gYi5cbiAgICBjb25zdCB0eCA9IChhLnggLSBiLngpIC8gc2VnTGVuLCB0eiA9IChhLnogLSBiLnopIC8gc2VnTGVuO1xuICAgIHJldHVybiB7XG4gICAgICBkOiBNYXRoLnNxcnQoYmVzdCksXG4gICAgICBsZXZlbDogYS5sZXZlbCArIChiLmxldmVsIC0gYS5sZXZlbCkgKiBidCxcbiAgICAgIHdpZHRoOiBhLndpZHRoICsgKGIud2lkdGggLSBhLndpZHRoKSAqIGJ0LFxuICAgICAgdHgsIHR6LFxuICAgICAgZ3JhZGllbnQ6IE1hdGgubWF4KDAsIChiLmxldmVsIC0gYS5sZXZlbCkgLyBzZWdMZW4pLFxuICAgICAgczogYS5zICsgKGIucyAtIGEucykgKiBidCxcbiAgICB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGNlbGxLZXkoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoY3ggKyA0MDk2KSAqIDgxOTIgKyAoY3ogKyA0MDk2KTtcbn1cblxuZXhwb3J0IHR5cGUgV2F0ZXJCb2R5ID0gJ3JpdmVyJyB8ICdsYWtlJyB8ICdzZWEnIHwgJ25vbmUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEZsb3dTYW1wbGUge1xuICBib2R5OiBXYXRlckJvZHk7XG4gIC8qKiBVbml0IGZsb3cgZGlyZWN0aW9uICh6ZXJvIGZvciBzdGlsbCB3YXRlcikuICovXG4gIGR4OiBudW1iZXI7XG4gIGR6OiBudW1iZXI7XG4gIC8qKiBTdXJmYWNlIGN1cnJlbnQgc3BlZWQgaW4gbS9zLiAqL1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEh5ZHJvbG9neU9wdGlvbnMge1xuICBzZWVkOiBudW1iZXI7XG4gIC8qKiBHZW5lcmF0b3IgdmVyc2lvbiB0aGUgbmV0d29yayBiZWxvbmdzIHRvLiAqL1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIC8qKiBCYXNlIGhlaWdodCBvZiB0aGUgKnVubW9kaWZpZWQgdjEgc2hhcGUqICh1c2VkIHRvIGxvY2F0ZSBsYWtlL2NoYW5uZWwpLiAqL1xuICB2MUhlaWdodDogSGVpZ2h0U2FtcGxlcjtcbn1cblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2dpY2FsIG5ldHdvcmsgZm9yIG9uZSAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pLiAqL1xuZXhwb3J0IGNsYXNzIEh5ZHJvbG9neSB7XG4gIHJlYWRvbmx5IHNlZWQ6IG51bWJlcjtcbiAgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuICByZWFkb25seSBsYWtlOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByeDogbnVtYmVyOyByejogbnVtYmVyIH07XG4gIHJlYWRvbmx5IGxvd2VyOiBSaXZlclJlYWNoO1xuICByZWFkb25seSB1cHBlcjogUml2ZXJSZWFjaCB8IG51bGw7XG4gIC8qKiBVcHBlci1yaXZlciBzb3VyY2UgdGFybiAodjIgb25seSkuICovXG4gIHJlYWRvbmx5IHRhcm46IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHI6IG51bWJlcjsgbGV2ZWw6IG51bWJlciB9IHwgbnVsbDtcblxuICBjb25zdHJ1Y3RvcihvcHRzOiBIeWRyb2xvZ3lPcHRpb25zKSB7XG4gICAgdGhpcy5zZWVkID0gb3B0cy5zZWVkO1xuICAgIHRoaXMudmVyc2lvbiA9IG9wdHMudmVyc2lvbjtcbiAgICB0aGlzLmxha2UgPSBsb2NhdGVMYWtlKG9wdHMudjFIZWlnaHQpO1xuICAgIHRoaXMubG93ZXIgPSB0cmFjZUxvd2VyUml2ZXIob3B0cy52MUhlaWdodCwgdGhpcy5sYWtlKTtcbiAgICBpZiAob3B0cy52ZXJzaW9uID49IDIpIHtcbiAgICAgIGNvbnN0IHVwcGVyID0gYXV0aG9yVXBwZXJSaXZlcihvcHRzLnNlZWQsIHRoaXMubGFrZSk7XG4gICAgICB0aGlzLnVwcGVyID0gdXBwZXIucmVhY2g7XG4gICAgICB0aGlzLnRhcm4gPSB1cHBlci50YXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVwcGVyID0gbnVsbDtcbiAgICAgIHRoaXMudGFybiA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN1cmZhY2UgY3VycmVudCBmb3IgYSB3YXRlciBjb2x1bW4uIGBsZXZlbGAgaXMgdGhlIGNvbHVtbidzIHdhdGVyIHN1cmZhY2UsXG4gICAqIHVzZWQgdG8gdGVsbCBzZWEtbGV2ZWwgd2F0ZXIgKGxha2UsIGxvd2VyIHJpdmVyLCBzZWEpIGZyb20gdGhlIHVwcGVyIHJpdmVyLlxuICAgKi9cbiAgZmxvd0F0KHg6IG51bWJlciwgejogbnVtYmVyLCBsZXZlbDogbnVtYmVyKTogRmxvd1NhbXBsZSB7XG4gICAgaWYgKHRoaXMudXBwZXIgJiYgbGV2ZWwgPiAwLjUpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHRoaXMudXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPD0gaGl0LndpZHRoICsgMikge1xuICAgICAgICBjb25zdCBzcGVlZCA9IGNsYW1wKDAuNTUgKyBoaXQuZ3JhZGllbnQgKiA5LCAwLjQsIDQuNSk7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBoaXQudHgsIGR6OiBoaXQudHosIHNwZWVkIH07XG4gICAgICB9XG4gICAgICBpZiAodGhpcy50YXJuICYmIE1hdGguaHlwb3QoeCAtIHRoaXMudGFybi54LCB6IC0gdGhpcy50YXJuLnopIDwgdGhpcy50YXJuLnIgKyA0KSB7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4udG93YXJkcyh4LCB6LCB0aGlzLnVwcGVyU291cmNlKCksIDAuMDYpIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGxvdyA9IHRoaXMubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDw9IGxvdy53aWR0aCArIDYpIHtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBsb3cudHgsIGR6OiBsb3cudHosIHNwZWVkOiAwLjM1ICsgMC4yNSAqIHNtb290aHN0ZXAobG93LndpZHRoICsgNiwgMCwgbG93LmQpIH07XG4gICAgfVxuICAgIGNvbnN0IGxkID0gTWF0aC5oeXBvdCgoeCAtIHRoaXMubGFrZS54KSAvIHRoaXMubGFrZS5yeCwgKHogLSB0aGlzLmxha2UueikgLyB0aGlzLmxha2UucnopO1xuICAgIGlmIChsZCA8IDEuMzUpIHtcbiAgICAgIC8vIFNsb3cgZHJpZnQgZnJvbSB0aGUgaW5mbG93IHRvd2FyZCB0aGUgb3V0ZmxvdyBhdCB0aGUgaGVhZCBvZiB0aGUgbG93ZXIgcml2ZXIuXG4gICAgICBjb25zdCBoZWFkID0gdGhpcy5sb3dlci5wb2ludHNbdGhpcy5sb3dlci5wb2ludHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBkcmlmdCA9IHRvd2FyZHMoeCwgeiwgaGVhZCwgMC4wOCk7XG4gICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLmRyaWZ0IH07XG4gICAgfVxuICAgIHJldHVybiB7IGJvZHk6ICdzZWEnLCBkeDogMCwgZHo6IDAsIHNwZWVkOiAwIH07XG4gIH1cblxuICBwcml2YXRlIHVwcGVyU291cmNlKCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gICAgY29uc3QgcHRzID0gdGhpcy51cHBlciEucG9pbnRzO1xuICAgIHJldHVybiBwdHNbcHRzLmxlbmd0aCAtIDFdO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvd2FyZHMoeDogbnVtYmVyLCB6OiBudW1iZXIsIHA6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgc3BlZWQ6IG51bWJlcikge1xuICBjb25zdCBkeCA9IHAueCAtIHgsIGR6ID0gcC56IC0gejtcbiAgY29uc3QgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gIHJldHVybiB7IGR4OiBkeCAvIGxlbiwgZHo6IGR6IC8gbGVuLCBzcGVlZCB9O1xufVxuXG4vKiogRmluZCB0aGUgdmFsbGV5IGxha2UgZnJvbSB0aGUgdGVycmFpbiBpdHNlbGY6IHRoZSBkZWVwIGJhc2luIE5XIG9mIHRoZSBmb3VuZGVyIHZhbGxleS4gKi9cbmZ1bmN0aW9uIGxvY2F0ZUxha2UoaDogSGVpZ2h0U2FtcGxlcik6IEh5ZHJvbG9neVsnbGFrZSddIHtcbiAgbGV0IHN4ID0gMCwgc3ogPSAwLCBuID0gMCwgbWluWCA9IEluZmluaXR5LCBtYXhYID0gLUluZmluaXR5LCBtaW5aID0gSW5maW5pdHksIG1heFogPSAtSW5maW5pdHk7XG4gIGZvciAobGV0IHogPSAtNDYwOyB6IDw9IC0xMjA7IHogKz0gNCkge1xuICAgIGZvciAobGV0IHggPSAtNDgwOyB4IDw9IC00MDsgeCArPSA0KSB7XG4gICAgICBpZiAoaCh4LCB6KSA+IC00KSBjb250aW51ZTtcbiAgICAgIHN4ICs9IHg7IHN6ICs9IHo7IG4rKztcbiAgICAgIG1pblggPSBNYXRoLm1pbihtaW5YLCB4KTsgbWF4WCA9IE1hdGgubWF4KG1heFgsIHgpO1xuICAgICAgbWluWiA9IE1hdGgubWluKG1pblosIHopOyBtYXhaID0gTWF0aC5tYXgobWF4Wiwgeik7XG4gICAgfVxuICB9XG4gIGlmIChuID09PSAwKSByZXR1cm4geyB4OiAtMjYwLCB6OiAtMjMwLCByeDogMTIwLCByejogOTUgfTtcbiAgcmV0dXJuIHtcbiAgICB4OiBzeCAvIG4sIHo6IHN6IC8gbixcbiAgICByeDogTWF0aC5tYXgoMzAsIChtYXhYIC0gbWluWCkgLyAyICsgMTApLCByejogTWF0aC5tYXgoMzAsIChtYXhaIC0gbWluWikgLyAyICsgMTApLFxuICB9O1xufVxuXG4vKipcbiAqIFRyYWNlIHRoZSBjYXJ2ZWQgbG93bGFuZCBjaGFubmVsIGZyb20gdGhlIGxha2Ugb3V0ZmxvdyBzb3V0aCB0byB0aGUgc2VhLiBGb3JcbiAqIGVhY2ggNCBtIHJvdyB0aGUgY2hhbm5lbCBpcyB0aGUgbG93ZXN0IGNvbHVtbiBuZWFyIHRoZSBwcmV2aW91cyBjZW50cmU7IHRoZVxuICogdHJhY2UgaXMgc21vb3RoZWQgc28gdGhlIGZsb3cgZmllbGQgZG9lcyBub3Qgaml0dGVyIHdpdGggdGhlIDEgbSB2b3hlbHMuXG4gKi9cbmZ1bmN0aW9uIHRyYWNlTG93ZXJSaXZlcihoOiBIZWlnaHRTYW1wbGVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IFJpdmVyUmVhY2gge1xuICBjb25zdCByYXc6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgbGV0IGN4ID0gbGFrZS54ICsgbGFrZS5yeCAqIDAuNTU7XG4gIGxldCB6ID0gTWF0aC5yb3VuZChsYWtlLnogKyBsYWtlLnJ6ICogMC42KTtcbiAgLy8gU3RhcnQgYXQgdGhlIGxha2UncyBzb3V0aC1lYXN0IG91dGZsb3cgYW5kIGZvbGxvdyB0aGUgY2hhbm5lbCBkb3duc3RyZWFtLlxuICBmb3IgKDsgeiA8PSA5MDA7IHogKz0gNCkge1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJ4ID0gY3g7XG4gICAgZm9yIChsZXQgeCA9IE1hdGgucm91bmQoY3ggLSA0MCk7IHggPD0gY3ggKyA0MDsgeCArPSAyKSB7XG4gICAgICBjb25zdCB2ID0gaCh4LCB6KSArIE1hdGguYWJzKHggLSBjeCkgKiAwLjAyO1xuICAgICAgaWYgKHYgPCBiZXN0KSB7IGJlc3QgPSB2OyBieCA9IHg7IH1cbiAgICB9XG4gICAgY3ggPSBieDtcbiAgICByYXcucHVzaCh7IHg6IGJ4LCB6IH0pO1xuICAgIC8vIFRoZSB0cmFjZSBlbmRzIG9uY2UgaXQgcmVhY2hlcyBvcGVuIHNlYSBmb3IgYSBzdXN0YWluZWQgc3RyZXRjaC5cbiAgICBpZiAoYmVzdCA8IC02ICYmIHJhdy5sZW5ndGggPiAyMCAmJiBoKGJ4LCB6ICsgOCkgPCAtNiAmJiBoKGJ4LCB6ICsgMTYpIDwgLTYpIGJyZWFrO1xuICB9XG4gIGNvbnN0IHNtb290aCA9IHJhdy5tYXAoKHAsIGkpID0+IHtcbiAgICBsZXQgc3ggPSAwLCBuID0gMDtcbiAgICBmb3IgKGxldCBrID0gTWF0aC5tYXgoMCwgaSAtIDQpOyBrIDw9IE1hdGgubWluKHJhdy5sZW5ndGggLSAxLCBpICsgNCk7IGsrKykgeyBzeCArPSByYXdba10ueDsgbisrOyB9XG4gICAgcmV0dXJuIHsgeDogc3ggLyBuLCB6OiBwLnogfTtcbiAgfSk7XG4gIC8vIFN0b3JlIGRvd25zdHJlYW0tZmlyc3Q6IGluZGV4IDAgaXMgdGhlIHNlYSBtb3V0aC5cbiAgc21vb3RoLnJldmVyc2UoKTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSBbXTtcbiAgbGV0IHMgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHNtb290aC5sZW5ndGg7IGkrKykge1xuICAgIGlmIChpID4gMCkgcyArPSBNYXRoLmh5cG90KHNtb290aFtpXS54IC0gc21vb3RoW2kgLSAxXS54LCBzbW9vdGhbaV0ueiAtIHNtb290aFtpIC0gMV0ueik7XG4gICAgcG9pbnRzLnB1c2goeyB4OiBzbW9vdGhbaV0ueCwgejogc21vb3RoW2ldLnosIHMsIGxldmVsOiAwLCB3aWR0aDogNiB9KTtcbiAgfVxuICByZXR1cm4gbmV3IFJpdmVyUmVhY2gocG9pbnRzLCA0MCk7XG59XG5cbi8qKiBXYXRlci1zdXJmYWNlIGRyb3BzIGFsb25nIHRoZSB1cHBlciByaXZlciwgYXMgKGZyYWN0aW9uIG9mIGxlbmd0aCwgbWV0cmVzKS4gKi9cbmNvbnN0IEZBTExTOiBSZWFkb25seUFycmF5PHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0+ID0gW1swLjIsIDddLCBbMC40OCwgMTFdLCBbMC43NCwgMTNdXTtcbmNvbnN0IFVQUEVSX0dSQURJRU5UID0gMC4wMztcblxuLyoqXG4gKiBBdXRob3IgdGhlIHYyIG1vdW50YWluIHJpdmVyOiBhIHNlZWRlZCBtZWFuZGVyaW5nIGNlbnRyZWxpbmUgZnJvbSB0aGUgbGFrZSdzXG4gKiBub3J0aCBzaG9yZSB0byBhIGhpZ2hsYW5kIHRhcm4sIHdpdGggYSBsZXZlbCBwcm9maWxlIHRoYXQgb25seSByaXNlc1xuICogdXBzdHJlYW0gKGdlbnRsZSBncmFkaWVudCBwbHVzIHRocmVlIGNhc2NhZGVzKS5cbiAqL1xuZnVuY3Rpb24gYXV0aG9yVXBwZXJSaXZlcihzZWVkOiBudW1iZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKToge1xuICByZWFjaDogUml2ZXJSZWFjaDsgdGFybjogTm9uTnVsbGFibGU8SHlkcm9sb2d5Wyd0YXJuJ10+O1xufSB7XG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKHNlZWQgXiAweDVlZWQyKSA+Pj4gMCk7XG4gIGNvbnN0IGogPSAoYTogbnVtYmVyKSA9PiAocm5kKCkgLSAwLjUpICogMiAqIGE7XG4gIGNvbnN0IG1vdXRoID0geyB4OiBsYWtlLnggKyBsYWtlLnJ4ICogMC4xLCB6OiBsYWtlLnogLSBsYWtlLnJ6ICogMC41NSB9O1xuICBjb25zdCBjb250cm9scyA9IFtcbiAgICBtb3V0aCxcbiAgICB7IHg6IGxha2UueCArIDIwICsgaigyMCksIHo6IC00MTAgKyBqKDE1KSB9LFxuICAgIHsgeDogLTE5MCArIGooMzUpLCB6OiAtNTIwICsgaigyMCkgfSxcbiAgICB7IHg6IC0yMTUgKyBqKDM1KSwgejogLTY0MCArIGooMjApIH0sXG4gICAgeyB4OiAtMTY1ICsgaigzMCksIHo6IC03NzAgKyBqKDE1KSB9LFxuICBdO1xuICAvLyBDYXRtdWxsLVJvbSB0aHJvdWdoIHRoZSBjb250cm9scywgdGhlbiByZXNhbXBsZSBhdCB+OCBtIHNwYWNpbmcgd2l0aCBhXG4gIC8vIHNtYWxsIHNlZWRlZCBtZWFuZGVyIHNvIHRoZSBjaGFubmVsIGlzIG5vdCBhIHNtb290aCBzcGxpbmUuXG4gIGNvbnN0IGRlbnNlOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29udHJvbHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgY29uc3QgcDAgPSBjb250cm9sc1tNYXRoLm1heCgwLCBpIC0gMSldLCBwMSA9IGNvbnRyb2xzW2ldO1xuICAgIGNvbnN0IHAyID0gY29udHJvbHNbaSArIDFdLCBwMyA9IGNvbnRyb2xzW01hdGgubWluKGNvbnRyb2xzLmxlbmd0aCAtIDEsIGkgKyAyKV07XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCAyNDsgaysrKSB7XG4gICAgICBjb25zdCB0ID0gayAvIDI0LCB0MiA9IHQgKiB0LCB0MyA9IHQyICogdDtcbiAgICAgIGRlbnNlLnB1c2goe1xuICAgICAgICB4OiAwLjUgKiAoMiAqIHAxLnggKyAoLXAwLnggKyBwMi54KSAqIHQgKyAoMiAqIHAwLnggLSA1ICogcDEueCArIDQgKiBwMi54IC0gcDMueCkgKiB0MlxuICAgICAgICAgICsgKC1wMC54ICsgMyAqIHAxLnggLSAzICogcDIueCArIHAzLngpICogdDMpLFxuICAgICAgICB6OiAwLjUgKiAoMiAqIHAxLnogKyAoLXAwLnogKyBwMi56KSAqIHQgKyAoMiAqIHAwLnogLSA1ICogcDEueiArIDQgKiBwMi56IC0gcDMueikgKiB0MlxuICAgICAgICAgICsgKC1wMC56ICsgMyAqIHAxLnogLSAzICogcDIueiArIHAzLnopICogdDMpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGRlbnNlLnB1c2goY29udHJvbHNbY29udHJvbHMubGVuZ3RoIC0gMV0pO1xuICBjb25zdCByZXNhbXBsZWQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHM6IG51bWJlciB9PiA9IFt7IC4uLmRlbnNlWzBdLCBzOiAwIH1dO1xuICBsZXQgYWNjID0gMCwgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgZGVuc2UubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5oeXBvdChkZW5zZVtpXS54IC0gZGVuc2VbaSAtIDFdLngsIGRlbnNlW2ldLnogLSBkZW5zZVtpIC0gMV0ueik7XG4gICAgYWNjICs9IHN0ZXA7IHMgKz0gc3RlcDtcbiAgICBpZiAoYWNjID49IDggfHwgaSA9PT0gZGVuc2UubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbSA9IChmYm0yKHMgLyA2MCwgMy4xLCBzZWVkICsgODAxLCAyKSAtIDAuNSkgKiAxNDtcbiAgICAgIHJlc2FtcGxlZC5wdXNoKHsgeDogZGVuc2VbaV0ueCArIG0sIHo6IGRlbnNlW2ldLnosIHMgfSk7XG4gICAgICBhY2MgPSAwO1xuICAgIH1cbiAgfVxuICBjb25zdCB0b3RhbCA9IHJlc2FtcGxlZFtyZXNhbXBsZWQubGVuZ3RoIC0gMV0ucztcbiAgY29uc3QgbGV2ZWxBdCA9IChzdjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBsZXQgbGV2ZWwgPSBzdiAqIFVQUEVSX0dSQURJRU5UO1xuICAgIGZvciAoY29uc3QgW2ZyYWMsIGRyb3BdIG9mIEZBTExTKSB7XG4gICAgICAvLyBFYWNoIGZhbGwgaXMgYSBzaG9ydCBjYXNjYWRlIG92ZXIgfjEwIG0gb2YgY2hhbm5lbC5cbiAgICAgIGxldmVsICs9IGRyb3AgKiBzbW9vdGhzdGVwKHRvdGFsICogZnJhYyAtIDUsIHRvdGFsICogZnJhYyArIDUsIHN2KTtcbiAgICB9XG4gICAgLy8gVGhlIGZpcnN0IDQwIG0gaW50byB0aGUgbGFrZSBzdGF5cyBhdCBsYWtlIGxldmVsLlxuICAgIHJldHVybiBzdiA8IDQwID8gMCA6IGxldmVsIC0gNDAgKiBVUFBFUl9HUkFESUVOVDtcbiAgfTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSByZXNhbXBsZWQubWFwKChwKSA9PiAoe1xuICAgIHg6IHAueCwgejogcC56LCBzOiBwLnMsIGxldmVsOiBNYXRoLm1heCgwLCBsZXZlbEF0KHAucykpLFxuICAgIHdpZHRoOiAzLjIgKyAyLjIgKiBmYm0yKHAucyAvIDcwLCA5LjcsIHNlZWQgKyA4MDIsIDIpICsgKDEgLSBwLnMgLyB0b3RhbCkgKiAxLjUsXG4gIH0pKTtcbiAgY29uc3Qgc291cmNlID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIHtcbiAgICByZWFjaDogbmV3IFJpdmVyUmVhY2gocG9pbnRzLCAxMTApLFxuICAgIHRhcm46IHsgeDogc291cmNlLngsIHo6IHNvdXJjZS56LCByOiAxOCwgbGV2ZWw6IHNvdXJjZS5sZXZlbCB9LFxuICB9O1xufVxuIiwgIi8vIFZveGVsIG1hdGVyaWFsIGlkcy4gUHVyZSBkYXRhIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllciAoRC0wMDUpLlxuLy8gSWRzIGFyZSBwZXJzaXN0ZWQgaW4gc25hcHNob3QgZWRpdHMsIHNvIGV4aXN0aW5nIHZhbHVlcyBtdXN0IG5ldmVyIGNoYW5nZS5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG4gIC8qKiBHZW5lcmF0b3IgdjIgaGlnaGxhbmRzLiBOZXZlciBwcm9kdWNlZCBieSBnZW5lcmF0b3IgdjEuICovXG4gIFNOT1c6IDEwLFxufSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIE1hdElkID0gKHR5cGVvZiBNQVQpW2tleW9mIHR5cGVvZiBNQVRdO1xuXG5leHBvcnQgY29uc3QgaXNTb2xpZCA9IChtOiBudW1iZXIpOiBib29sZWFuID0+IG0gIT09IE1BVC5BSVIgJiYgbSAhPT0gTUFULldBVEVSO1xuZXhwb3J0IGNvbnN0IGlzT3BhcXVlID0gaXNTb2xpZDtcblxuLyoqIEhpZ2hlc3QgbWF0ZXJpYWwgaWQgdGhhdCBtYXkgYXBwZWFyIGluIGEgdm94ZWwgZWRpdC4gKi9cbmV4cG9ydCBjb25zdCBNQVhfTUFUX0lEID0gMTA7XG4iLCAiLy8gVGVycmFpbiBnZW5lcmF0b3IgdjIgXHUyMDE0IHRoZSB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IChwdXJlIFRTLCBELTAwNSkuXG4vL1xuLy8gQ29tcGF0aWJpbGl0eSBjb250cmFjdDogaW5zaWRlIHRoZSBmb3VuZGVyIGNvcnJpZG9yICh0aGUgc2V0dGxlbWVudCB2YWxsZXksXG4vLyB0aGUgbGFrZSBhbmQgdGhlIGxvd2xhbmQgcml2ZXIpIHYyIGhlaWdodHMgZXF1YWwgdjEgZXhhY3RseSwgc28gdGhlIHBpbm5lZFxuLy8gZm91bmRlciBwcm9qZWN0cywgdGhlaXIgcHJlcGFyYXRpb24gdGFyZ2V0cyBhbmQgbmF0dXJhbCBlbnRpdGllcyB0aGVyZSBhcmVcbi8vIHVuY2hhbmdlZC4gT3V0c2lkZSBpdCB2MiBhZGRzOlxuLy8gICAtIGEgbm9ydGhlcm4gbWFzc2lmIG9uIGFuIGV4dGVuZGVkIGlzbGFuZCwgd2l0aCBzbm93IGFib3ZlIHRoZSBzbm93bGluZTtcbi8vICAgLSBmbGFua2luZyByYW5nZXMgd2VzdCBhbmQgZWFzdCBvZiB0aGUgdmFsbGV5LCB0ZXJyYWNlZCBpbnRvIGNsaWZmIGJhbmRzO1xuLy8gICAtIGEgbW91bnRhaW4gcml2ZXIgY2FydmVkIGludG8gdGhlIG1hc3NpZiBmcm9tIGEgdGFybiBkb3duIHRvIHRoZSBsYWtlLFxuLy8gICAgIHdob3NlIHdhdGVyIHN1cmZhY2UgY29tZXMgZnJvbSBIeWRyb2xvZ3kgYW5kIG5ldmVyIHJpc2VzIGRvd25zdHJlYW07XG4vLyAgIC0gYSBjb250aW51b3VzIGxvd2xhbmQgY2hhbm5lbCAodjEgaGFzIGEgZHJ5IGZvcmQgc291dGggb2YgdGhlIHNoZWxmKS5cbi8vIEhlaWdodHMgYXJlIGludGVnZXJzIGluIFstMTQsIDEwNF0uXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbGVycCwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHsgTUFULCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcblxuZXhwb3J0IGNvbnN0IFYyX1NOT1dMSU5FID0gNzQ7XG5leHBvcnQgY29uc3QgVjJfTUFYX0hFSUdIVCA9IDEwNDtcblxuZXhwb3J0IHR5cGUgVjFIZWlnaHQgPSAoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFYyQ29sdW1uIHtcbiAgLyoqIFRvcCBzb2xpZCB5ICsgMSAoc2FtZSBjb252ZW50aW9uIGFzIHN1cmZhY2VIZWlnaHRBdCkuICovXG4gIGg6IG51bWJlcjtcbiAgLyoqIFdhdGVyIHN1cmZhY2UgZm9yIHRoaXMgY29sdW1uOiBjZWxscyBbaCwgbGV2ZWwpIGhvbGQgd2F0ZXIuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBjb2x1bW4gaXMgcGFydCBvZiB0aGUgY2FydmVkIG1vdW50YWluLXJpdmVyIGNoYW5uZWwuICovXG4gIGNoYW5uZWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJyYWluVjIge1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSBzZWVkOiBudW1iZXIsXG4gICAgcHJpdmF0ZSByZWFkb25seSB2MTogVjFIZWlnaHQsXG4gICAgcmVhZG9ubHkgaHlkcm9sb2d5OiBIeWRyb2xvZ3ksXG4gICkge31cblxuICAvKiogMCA9IGV4YWN0bHkgdjEgKGZvdW5kZXIgY29ycmlkb3IpOyAxID0gZnVsbCB2MiByZWxpZWYuICovXG4gIHJlbGllZk1hc2soeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtMzkwLCAtNDcwLCB6KTtcbiAgICAvLyBUaGUgd2VzdCByYW5nZSBrZWVwcyBjbGVhciBvZiB0aGUgbGFrZSBiYXNpbiB1bnRpbCB0aGUgbGFrZSBpcyBwYXNzZWQuXG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlLCB3ZXN0RWRnZSAtIDkwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyMzAsIDMzMCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIC8qKiAwIGF0IHRoZSByYW5nZSBmcm9udCwgMSBkZWVwIGluc2lkZTogZm9vdGhpbGxzIGZpcnN0LCBwZWFrcyBiZWhpbmQuICovXG4gIHJhbmdlRGVwdGgoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtNDIwLCAtNzAwLCB6KTtcbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UgLSA0MCwgd2VzdEVkZ2UgLSAzMDAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDI3MCwgNTYwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVjJDb2x1bW4ge1xuICAgIGNvbnN0IHNlZWQgPSB0aGlzLnNlZWQ7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMudjEoc2VlZCwgeCwgeik7XG4gICAgY29uc3QgbWFzayA9IHRoaXMucmVsaWVmTWFzayh4LCB6KTtcbiAgICBsZXQgaCA9IGJhc2U7XG5cbiAgICBpZiAobWFzayA+IDApIHtcbiAgICAgIC8vIEV4dGVuZCB0aGUgaXNsYW5kIG5vcnRoIHNvIHRoZSBtYXNzaWYgaGFzIHJvb20gKHYxIGNvYXN0IGlzIH56IC02MDApLlxuICAgICAgY29uc3Qgbm9ydGhMYW5kID0gc21vb3Roc3RlcCgtNDIwLCAtNTIwLCB6KTtcbiAgICAgIGNvbnN0IHNob3JlID0gMSAtIE1hdGguaHlwb3QoKHggKyAxNTApIC8gNTYwLCAoeiArIDY5MCkgLyAzMDApXG4gICAgICAgICsgKGZibTIoeCAvIDE2MCwgeiAvIDE2MCwgc2VlZCArIDcwMSwgMykgLSAwLjUpICogMC4zO1xuICAgICAgY29uc3QgbGFuZE4gPSBzbW9vdGhzdGVwKDAuMCwgMC4xNCwgc2hvcmUpICogbm9ydGhMYW5kO1xuICAgICAgY29uc3QgZ3JvdW5kID0gbGVycChiYXNlLCBNYXRoLm1heChiYXNlLCA1ICsgNSAqIGZibTIoeCAvIDkwLCB6IC8gOTAsIHNlZWQgKyA3MDIsIDIpKSwgbGFuZE4pO1xuXG4gICAgICAvLyBSaWRnZWQgbWFzc2lmIHdpdGggdGVycmFjZWQgY2xpZmYgYmFuZHMuXG4gICAgICBjb25zdCB3eCA9IHggKyAoZmJtMih4IC8gMjYwLCB6IC8gMjYwLCBzZWVkICsgNzAzLCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCB3eiA9IHogKyAoZmJtMih4IC8gMjYwICsgNS4xLCB6IC8gMjYwIC0gMi43LCBzZWVkICsgNzA0LCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCByMSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIxMCwgd3ogLyAyMTAsIHNlZWQgKyA3MDUsIDQpIC0gMSk7XG4gICAgICBjb25zdCByMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDgwLCB3eiAvIDgwLCBzZWVkICsgNzA2LCAzKSAtIDEpO1xuICAgICAgY29uc3QgbHVtcCA9IGZibTIod3ggLyAxMjAsIHd6IC8gMTIwLCBzZWVkICsgNzA3LCAzKTtcbiAgICAgIGNvbnN0IGRlcHRoID0gdGhpcy5yYW5nZURlcHRoKHgsIHopO1xuICAgICAgbGV0IG1vdW50YWluID0gMTYgKyAoOCArIDgwICogZGVwdGgpICogKDAuNTUgKiByMSAqIHIxICsgMC4yOCAqIHIyICsgMC4xNyAqIGx1bXApXG4gICAgICAgICsgMTggKiBkZXB0aCAqIHNtb290aHN0ZXAoMC41NSwgMC45LCByMSk7XG4gICAgICBjb25zdCBiYW5kID0gNiArIDIgKiBmYm0yKHggLyAxNDAsIHogLyAxNDAsIHNlZWQgKyA3MDgsIDIpO1xuICAgICAgY29uc3QgdCA9IE1hdGguZmxvb3IobW91bnRhaW4gLyBiYW5kKTtcbiAgICAgIGNvbnN0IGZyYWMgPSBtb3VudGFpbiAvIGJhbmQgLSB0O1xuICAgICAgbW91bnRhaW4gPSAodCArIHNtb290aHN0ZXAoMC41LCAwLjgsIGZyYWMpKSAqIGJhbmQ7XG5cbiAgICAgIC8vIE9ubHkgbGFuZCByaXNlczsgdGhlIHNlYSBzdGF5cyBzZWEsIHNvIHJhbmdlcyBlbmQgaW4gY29hc3RhbCBjbGlmZnMuXG4gICAgICBjb25zdCBsYW5kRmFjdG9yID0gc21vb3Roc3RlcCgtMiwgOCwgZ3JvdW5kKTtcbiAgICAgIGggPSBsZXJwKGdyb3VuZCwgTWF0aC5tYXgoZ3JvdW5kLCBtb3VudGFpbiksIG1hc2sgKiBsYW5kRmFjdG9yKTtcbiAgICB9XG5cbiAgICBsZXQgbGV2ZWwgPSBoIDwgMCA/IDAgOiAtSW5maW5pdHk7XG4gICAgbGV0IGNoYW5uZWwgPSBmYWxzZTtcblxuICAgIC8vIE1vdW50YWluIHJpdmVyOiB2YWxsZXkgZmxvb3IsIGJhbmtzIGFuZCBjaGFubmVsIGZvbGxvdyB0aGUgd2F0ZXIgbGV2ZWwuXG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIGNvbnN0IHJhaXNlZCA9IGhpdC5sZXZlbCA+IDAuMjU7XG4gICAgICAgIGNvbnN0IHZ3ID0gNTUgKyAyOCAqIGZibTIoaGl0LnMgLyA5MCwgMS43LCBzZWVkICsgNzA5LCAyKTtcbiAgICAgICAgY29uc3QgZmxvb3IgPSBoaXQubGV2ZWwgKyAxLjUgKyAyLjIgKiBmYm0yKHggLyA0MCwgeiAvIDQwLCBzZWVkICsgNzEwLCAyKSArIGhpdC5kICogMC4wNjtcbiAgICAgICAgY29uc3QgdCA9IHNtb290aHN0ZXAodncgKiAwLjMsIHZ3LCBoaXQuZCk7XG4gICAgICAgIGggPSBNYXRoLm1pbihoLCBsZXJwKGZsb29yLCBoLCB0KSk7XG4gICAgICAgIGNvbnN0IHcgPSBoaXQud2lkdGg7XG4gICAgICAgIGlmIChyYWlzZWQgJiYgaGl0LmQgPCB3ICsgMykge1xuICAgICAgICAgIC8vIEJhbmtzIGhvbGQgYSByYWlzZWQgcml2ZXI6IG5ldmVyIGJlbG93IGl0cyB3YXRlciBzdXJmYWNlLiBBdCBsYWtlXG4gICAgICAgICAgLy8gbGV2ZWwgdGhlIHNlYS1sZXZlbCBmaWxsIGFscmVhZHkgY29udGFpbnMgdGhlIHdhdGVyLlxuICAgICAgICAgIGggPSBNYXRoLm1heChoLCBNYXRoLmNlaWwoaGl0LmxldmVsKSArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoaXQuZCA8IHcpIHtcbiAgICAgICAgICBjb25zdCBiZWQgPSBoaXQubGV2ZWwgLSAoMS4yICsgMS4zICogKDEgLSBoaXQuZCAvIHcpKTtcbiAgICAgICAgICBoID0gTWF0aC5taW4oaCwgYmVkKTtcbiAgICAgICAgICBpZiAocmFpc2VkKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKGhpdC5sZXZlbCkpO1xuICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCB0YXJuID0gdGhpcy5oeWRyb2xvZ3kudGFybjtcbiAgICAgIGlmICh0YXJuKSB7XG4gICAgICAgIGNvbnN0IHRkID0gTWF0aC5oeXBvdCh4IC0gdGFybi54LCB6IC0gdGFybi56KVxuICAgICAgICAgICogKDEgKyAwLjIgKiAoZmJtMih4IC8gMzAsIHogLyAzMCwgc2VlZCArIDcxMSwgMikgLSAwLjUpKTtcbiAgICAgICAgaWYgKHRkIDwgdGFybi5yICsgNikge1xuICAgICAgICAgIGNvbnN0IHJpbSA9IE1hdGguY2VpbCh0YXJuLmxldmVsKSArIDE7XG4gICAgICAgICAgaWYgKHRkID49IHRhcm4ucikgaCA9IE1hdGgubWF4KGgsIHJpbSk7XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBoID0gTWF0aC5taW4oTWF0aC5tYXgoaCwgcmltKSwgdGFybi5sZXZlbCAtIDEgLSAzICogc21vb3Roc3RlcCh0YXJuLnIsIDAsIHRkKSk7XG4gICAgICAgICAgICBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKHRhcm4ubGV2ZWwpKTtcbiAgICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExvd2xhbmQgY2hhbm5lbCBjb250aW51aXR5OiB2MSBsZWF2ZXMgYSBkcnkgZm9yZCB3aGVyZSB0aGUgc2hlbGYgbWVldHMgdGhlIHJpdmVyLlxuICAgIGNvbnN0IGxvdyA9IHRoaXMuaHlkcm9sb2d5Lmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8IDIuNSAmJiBoID49IDAgJiYgYmFzZSA8IDQpIGggPSAtMTtcblxuICAgIGggPSBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgVjJfTUFYX0hFSUdIVCkpO1xuICAgIGlmIChoIDwgMCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgMCk7XG4gICAgcmV0dXJuIHsgaCwgbGV2ZWw6IGxldmVsID09PSAtSW5maW5pdHkgPyBoIDogbGV2ZWwsIGNoYW5uZWwgfTtcbiAgfVxuXG4gIGhlaWdodCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY29sdW1uKHgsIHopLmg7XG4gIH1cblxuICAvKiogdjIgdG9wIG1hdGVyaWFsLiBGYWxscyBiYWNrIHRvIHRoZSB2MSBydWxlcyBmb3IgdGhlIHVuY2hhbmdlZCBjb3JyaWRvci4gKi9cbiAgdG9wTWF0ZXJpYWwoXG4gICAgeDogbnVtYmVyLCB6OiBudW1iZXIsIGNvbDogVjJDb2x1bW4sIHNsb3BlOiBudW1iZXIsXG4gICAgdjFUb3A6IChoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIpID0+IE1hdElkLFxuICApOiBNYXRJZCB7XG4gICAgY29uc3QgaCA9IGNvbC5oO1xuICAgIGlmIChjb2wuY2hhbm5lbCAmJiBjb2wubGV2ZWwgPiBoKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlciAmJiBoID4gMSkge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPCBoaXQud2lkdGggKyAyLjUgJiYgaGl0LmxldmVsID4gMC4yNSkge1xuICAgICAgICByZXR1cm4gZmJtMih4IC8gNiwgeiAvIDYsIHRoaXMuc2VlZCArIDcxMiwgMSkgPiAwLjUgPyBNQVQuR1JBVkVMIDogTUFULlNBTkQ7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNub3dsaW5lID0gVjJfU05PV0xJTkUgKyAoZmJtMih4IC8gNzAsIHogLyA3MCwgdGhpcy5zZWVkICsgNzEzLCAzKSAtIDAuNSkgKiAxNjtcbiAgICBpZiAoaCA+PSBzbm93bGluZSAmJiBzbG9wZSA8PSAzKSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgLSA2ICYmIHNsb3BlIDw9IDEgJiYgZmJtMih4IC8gMjAsIHogLyAyMCwgdGhpcy5zZWVkICsgNzE0LCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAodGhpcy5yZWxpZWZNYXNrKHgsIHopID4gMC41ICYmIGggPiAzMCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICAgIHJldHVybiB2MVRvcChoLCBzbG9wZSk7XG4gIH1cbn1cbiIsICIvLyBTaW11bGF0aW9uIGxheWVyIFx1MjAxNCBwdXJlIFR5cGVTY3JpcHQsIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAxIHdvcmxkIGZvdW5kYXRpb246IGEgY2h1bmtlZCwgZ2VudWluZWx5IHRocmVlLWRpbWVuc2lvbmFsIHZveGVsIHdvcmxkLlxuLy8gVGhlIHN0b3JlZCBzdGF0ZSBpcyBvbmUgbWF0ZXJpYWwgYnl0ZSBwZXIgY2VsbCAoMCA9IGFpcik7IG9jY3VwYW5jeSBpc1xuLy8gaW1wbGljaXQuIFN1cmZhY2UgaGVpZ2h0IGlzIGEgZGVyaXZlZCBxdWVyeSwgbm90IHRoZSBzdG9yYWdlLiBUaGlzIHJlcGxhY2VzXG4vLyB0aGUgZm9ybWVyIDI1NiB4IDI1NiBoZWlnaHRmaWVsZCAoc2VlIElSLTAwNSkuXG4vL1xuLy8gV29ybGQgbWV0cmVzOiB4L3ogaW4gWy0xMDI0LCAxMDI0KSwgeSBpbiBbLTE2LCAxMTIpLCBzZWEgbGV2ZWwgMC5cbi8vIEEgY2h1bmsgaXMgMzIgeCAzMiB4IDEyOCBjZWxscy4gR2VuZXJhdGlvbiBpcyBhIHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQsXG4vLyBnZW5lcmF0b3IgdmVyc2lvbiwgcGFyYW1ldGVycyBhbmQgY2h1bmsgY29vcmRpbmF0ZXM7IGVkaXRzIGFyZSByZWNvcmRlZFxuLy8gc2VwYXJhdGVseSBhbmQgcmUtYXBwbGllZCB3aGVuIGEgY2h1bmsgaXMgcmVnZW5lcmF0ZWQuXG5pbXBvcnQgdHlwZSB7IFN0cnVjdHVyZSB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQgdHlwZSB7IExpZmVTdGF0ZSB9IGZyb20gJy4vZWNvbm9teSc7XG5pbXBvcnQgdHlwZSB7IEhvbWVzdGVhZFN0YXRlIH0gZnJvbSAnLi9ob21lc3RlYWQnO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcbmltcG9ydCB7IFRlcnJhaW5WMiwgVjJDb2x1bW4gfSBmcm9tICcuL3RlcnJhaW4tdjInO1xuXG5leHBvcnQgY29uc3QgV09STERfU0laRSA9IDIwNDg7XG5leHBvcnQgY29uc3QgSEFMRiA9IFdPUkxEX1NJWkUgLyAyO1xuZXhwb3J0IGNvbnN0IENIVU5LX1NJWkUgPSAzMjtcbmV4cG9ydCBjb25zdCBDSFVOS1NfUEVSX1NJREUgPSBXT1JMRF9TSVpFIC8gQ0hVTktfU0laRTtcbmV4cG9ydCBjb25zdCBZX01JTiA9IC0xNjtcbmV4cG9ydCBjb25zdCBZX01BWCA9IDExMjtcbmV4cG9ydCBjb25zdCBXT1JMRF9IRUlHSFQgPSBZX01BWCAtIFlfTUlOO1xuZXhwb3J0IGNvbnN0IFNFQV9MRVZFTCA9IDA7XG5leHBvcnQgY29uc3QgV0FURVIgPSBTRUFfTEVWRUw7XG4vKiogR2VuZXJhdG9yIHYxOiB0aGUgb3JpZ2luYWwgMjA0OCBtIGlzbGFuZC4gRGVmYXVsdCBmb3IgY3JlYXRlV29ybGQgYW5kIGFsbCBsZWdhY3kgc2F2ZXMuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1ZFUlNJT04gPSAxO1xuLyoqIEdlbmVyYXRvciB2MjogdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSB3aXRoIGEgbW91bnRhaW4gcml2ZXIgKHNlZSB0ZXJyYWluLXYyLnRzKS4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVjIgPSAyO1xuLyoqIFRoZSBnZW5lcmF0b3IgbmV3IGJyb3dzZXIgd29ybGRzIHVzZSBieSBkZWZhdWx0LiAqL1xuZXhwb3J0IGNvbnN0IExBVEVTVF9HRU5FUkFUT1JfVkVSU0lPTiA9IEdFTkVSQVRPUl9WMjtcbmV4cG9ydCBjb25zdCBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TOiByZWFkb25seSBudW1iZXJbXSA9IFtHRU5FUkFUT1JfVkVSU0lPTiwgR0VORVJBVE9SX1YyXTtcbmV4cG9ydCBjb25zdCBpc1N1cHBvcnRlZEdlbmVyYXRvciA9ICh2OiB1bmtub3duKTogdiBpcyBudW1iZXIgPT5cbiAgdHlwZW9mIHYgPT09ICdudW1iZXInICYmIFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlMuaW5jbHVkZXModik7XG5leHBvcnQgY29uc3QgQ0hVTktfVk9MVU1FID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkUgKiBXT1JMRF9IRUlHSFQ7XG5leHBvcnQgY29uc3QgQ0hVTktfQVJFQSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFO1xuXG5leHBvcnQgeyBNQVQsIGlzU29saWQsIGlzT3BhcXVlLCBNQVhfTUFUX0lEIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuZXhwb3J0IHR5cGUgeyBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IE1BVCwgaXNTb2xpZCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5cbmV4cG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgZmJtMixcbn0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQge1xuICBjbGFtcCwgbGVycCwgc21vb3Roc3RlcCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIHZhbHVlTm9pc2UzLCBmYm0yLCBmYm0zLFxufSBmcm9tICcuL25vaXNlJztcblxuLy8gLS0tLS0tLS0tLSB3b3JsZCB0eXBlcyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkUGFyYW1zIHtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEFSQU1TOiBXb3JsZFBhcmFtcyA9IHtcbiAgc2l6ZTogV09STERfU0laRSxcbiAgY2h1bmtTaXplOiBDSFVOS19TSVpFLFxuICB5TWluOiBZX01JTixcbiAgeU1heDogWV9NQVgsXG4gIHNlYUxldmVsOiBTRUFfTEVWRUwsXG4gIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbENodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAga2V5OiBzdHJpbmc7XG4gIC8qKiB4ICsgeiozMiArICh5LVlfTUlOKSoxMDI0ICovXG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3Agc29saWQgeSwgZW5jb2RlZCBhcyAoeSAtIFlfTUlOKSwgMC4uMTI3OyAwIG1lYW5zIG5vIHNvbGlkLiAqL1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICAvKiogdG9wIG1hdGVyaWFsIHBlciBjb2x1bW4uICovXG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG4gIGRpcnR5OiBib29sZWFuO1xuICBnZW5lcmF0ZWRBdDogbnVtYmVyO1xufVxuXG4vLyBOYXR1cmFsIGFzc2V0cyBhcmUgdGhlIHByb2plY3QncyBTdHlsIChgbmF0X2ApIHBpcGVsaW5lIChBUy0wMDEgdjIpLCBub3Rcbi8vIE5veGVsIGFyY2hpdGVjdHVyZS4gTm94ZWwgcmVtYWlucyB0aGUgaHVtYW4tbWFkZSBraXQvd2F5c3RvbmUvbWFya2VyIHN5c3RlbS5cbi8vIFJldGlyZWQgb25seSBhcyB3b3JsZCBjb250ZW50LiBUaGUgbmFtZXMgcmVtYWluIGluIHRoZSBzZXJpYWxpemVkIHR5cGUgc29cbi8vIG9sZCBzbmFwc2hvdHMgYW5kIGFjY2VwdGVkIGhhcnZlc3Qgam91cm5hbHMgY2FuIGJlIG1pZ3JhdGVkIHdpdGhvdXQgcmVqZWN0aW5nXG4vLyBvdGhlcndpc2UgdmFsaWQgc2F2ZXMuIEdlbmVyYXRpb24sIGNvbGxpc2lvbiBhbmQgaW5zcGVjdGlvbiBuZXZlciB1c2UgdGhlbS5cbmV4cG9ydCBjb25zdCBSRVRJUkVEX1NUT05FX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuXSk7XG5leHBvcnQgY29uc3QgaXNSZXRpcmVkU3RvbmVLaW5kID0gKGtpbmQ6IEVudGl0eUtpbmQpOiBib29sZWFuID0+IFJFVElSRURfU1RPTkVfS0lORFMuaGFzKGtpbmQpO1xuZXhwb3J0IHR5cGUgQWN0aXZlRW50aXR5S2luZCA9IEV4Y2x1ZGU8RW50aXR5S2luZCxcbiAgJ3N0eWxfcm9ja19zbWFsbCcgfCAnc3R5bF9yb2NrX21lZGl1bScgfCAnc3R5bF9yb2NrX2xhcmdlJz47XG5cbmZ1bmN0aW9uIGxpdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogRW50aXR5IHwgbnVsbCB7XG4gIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIHJldHVybiAhZW50aXR5IHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpID8gbnVsbCA6IGVudGl0eTtcbn1cblxuZXhwb3J0IHR5cGUgRW50aXR5S2luZCA9XG4gIHwgJ3N0eWxfdHJlZV9zcGlyZSdcbiAgfCAnc3R5bF90cmVlX3RhYmxlJ1xuICB8ICdzdHlsX3RyZWVfY2x1c3RlcidcbiAgfCAnc3R5bF90cmVlX2Jsb3Nzb20nXG4gIHwgJ3N0eWxfc2hydWInXG4gIHwgJ3N0eWxfcm9ja19zbWFsbCdcbiAgfCAnc3R5bF9yb2NrX21lZGl1bSdcbiAgfCAnc3R5bF9yb2NrX2xhcmdlJ1xuICB8ICdzdHlsX29yZSdcbiAgfCAnc3R5bF9jYWlybidcbiAgfCAnd2F5c3RvbmUnXG4gIHwgJ21hcmtlcic7XG5cbmV4cG9ydCB0eXBlIFJlc291cmNlVHlwZSA9ICd3b29kJyB8ICdzdG9uZScgfCAnb3JlJyB8ICdmaWJlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW50aXR5IHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgY2h1bms6IHN0cmluZztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHNjYWxlOiBudW1iZXI7XG4gIHZhcmlhbnQ6IG51bWJlcjtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIHJlbWFpbmluZzogbnVtYmVyO1xuICB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcjtcbiAgLyoqIFRydWUgb25jZSB0aGUgZW50aXR5IGlzIGZ1bGx5IGRlcGxldGVkLiAqL1xuICBoYXJ2ZXN0ZWQ6IGJvb2xlYW47XG4gIC8qKiBUcnVlIGFmdGVyIHRoZSBmaXJzdCBzdWNjZXNzZnVsIGhhcnZlc3QsIGV2ZW4gaWYgeWllbGQgcmVtYWlucy4gKi9cbiAgaGFydmVzdGVkT25jZT86IGJvb2xlYW47XG4gIHByb3Zpc2lvbmFsOiBib29sZWFuO1xuICBhdXRob3JlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3hlbFNpdGUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWdpb25JbmZvIHtcbiAgaWQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdHlwZTogJ3BsYWluJyB8ICdmb3Jlc3QnIHwgJ2hpbGxzJyB8ICdoaWdobGFuZCcgfCAnd2F0ZXInIHwgJ3JpZGdlJztcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgcng6IG51bWJlcjtcbiAgcno6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFN0YXRzIHtcbiAgY2h1bmtzR2VuZXJhdGVkOiBudW1iZXI7XG4gIGNodW5rc0V2aWN0ZWQ6IG51bWJlcjtcbiAgdm94ZWxzRmlsbGVkOiBudW1iZXI7XG4gIGdlbmVyYXRpb25NczogbnVtYmVyO1xuICBlbnRpdGllczogbnVtYmVyO1xuICB0cmVlczogbnVtYmVyO1xuICBwaW5rVHJlZXM6IG51bWJlcjtcbiAgcGlua092ZXJmbG93OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGQge1xuICBzZWVkOiBudW1iZXI7XG4gIHBhcmFtczogV29ybGRQYXJhbXM7XG4gIGNodW5rczogTWFwPHN0cmluZywgVm94ZWxDaHVuaz47XG4gIGVudGl0aWVzOiBNYXA8c3RyaW5nLCBFbnRpdHk+O1xuICBlbnRpdHlDaHVua3M6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPjtcbiAgLyoqIENodW5rcyB3aG9zZSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZW50aXR5IHN0YXRlIGhhcyBiZWVuIGNoYW5nZWQuICovXG4gIGVudGl0eUNoYW5nZXM6IFNldDxzdHJpbmc+O1xuICAvKiogVG9tYnN0b25lcyBmb3IgcmVtb3ZlZCBkZXRlcm1pbmlzdGljIG5hdHVyYWwgZW50aXRpZXMuICovXG4gIGVudGl0eVJlbW92YWxzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIEF1dGhvcml0YXRpdmUgYnVpbHQgc3RydWN0dXJlcyAoaG91c2UsIHBhdGgsIHRlcnJhY2VzLCBjcm9wcykuICovXG4gIHN0cnVjdHVyZXM6IE1hcDxzdHJpbmcsIFN0cnVjdHVyZT47XG4gIHNpdGVzOiBOb3hlbFNpdGVbXTtcbiAgcmVnaW9uczogUmVnaW9uSW5mb1tdO1xuICAvKiogY2h1bmsga2V5IC0+IGxvY2FsIHZveGVsIGluZGV4IC0+IG1hdGVyaWFsLiBEdXJhYmxlLCBjb21wYWN0IGVkaXRzLiAqL1xuICBlZGl0czogTWFwPHN0cmluZywgTWFwPG51bWJlciwgbnVtYmVyPj47XG4gIC8qKiBHbG9iYWwgbG9jYWwtcGxheWVyIGNhcnJpZWQgYmFnOyBib3VuZGVkIGluIHNjaGVtYSAzLCBsZWdhY3kgaW4gMS8yLiAqL1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQcmVzZW50IG9ubHkgYWZ0ZXIgc2NoZW1hLTMgZ2VuZXNpcy9yZXN0b3JhdGlvbi4gKi9cbiAgbGlmZT86IExpZmVTdGF0ZTtcbiAgLyoqIE0wMDYgbGl2aW5nIGhvbWVzdGVhZDsgcHJlc2VudCBvbmNlIGZvdW5kZWQgKHNjaGVtYSAzIG9ubHkpLiAqL1xuICBob21lc3RlYWQ/OiBIb21lc3RlYWRTdGF0ZTtcbiAgZGlydHk6IFNldDxzdHJpbmc+O1xuICBzdGF0czogV29ybGRTdGF0cztcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKlxuICAgKiBNb25vdG9uaWMgcmV2aXNpb24gb2YgYXV0aG9yaXRhdGl2ZSBzdGF0ZSAodm94ZWxzIGFuZCBlbnRpdGllcykuIERlcml2ZWRcbiAgICogY2FjaGVzIGtleWVkIG9uIHRoaXMgdmFsdWUgYXJlIGRpc2NhcmRlZCBhZnRlciBhbiBlZGl0OyBtZXNoL25hdmlnYXRpb25cbiAgICogcmV2aXNpb25zIGFyZSBzZXBhcmF0ZSBiZWNhdXNlIHRoZXkgYXJlIGRlcml2ZWQsIG5vdCB3b3JsZCBzdGF0ZS5cbiAgICovXG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBjaHVua0tleSA9IChjeDogbnVtYmVyLCBjejogbnVtYmVyKSA9PiBgJHtjeH0sJHtjen1gO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWCA9IChjeDogbnVtYmVyKSA9PiBjeCAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWiA9IChjejogbnVtYmVyKSA9PiBjeiAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGxvY2FsSW5kZXggPSAobHg6IG51bWJlciwgeUluZGV4OiBudW1iZXIsIGx6OiBudW1iZXIpID0+XG4gIGx4ICsgbHogKiBDSFVOS19TSVpFICsgeUluZGV4ICogQ0hVTktfQVJFQTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtYID0gKHg6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWiA9ICh6OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFggPSAoeDogbnVtYmVyKSA9PiB4IC0gKHdvcmxkVG9DaHVua1goeCkgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWiA9ICh6OiBudW1iZXIpID0+IHogLSAod29ybGRUb0NodW5rWih6KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB5VG9JbmRleCA9ICh5OiBudW1iZXIpID0+IHkgLSBZX01JTjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGlmICghaXNTdXBwb3J0ZWRHZW5lcmF0b3IoZ2VuZXJhdG9yVmVyc2lvbikpIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24gJHtnZW5lcmF0b3JWZXJzaW9ufWApO1xuICByZXR1cm4ge1xuICAgIHNlZWQsXG4gICAgcGFyYW1zOiB7IC4uLkRFRkFVTFRfUEFSQU1TLCBnZW5lcmF0b3JWZXJzaW9uIH0sXG4gICAgY2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXRpZXM6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaGFuZ2VzOiBuZXcgU2V0KCksXG4gICAgZW50aXR5UmVtb3ZhbHM6IG5ldyBTZXQoKSxcbiAgICBzdHJ1Y3R1cmVzOiBuZXcgTWFwKCksXG4gICAgc2l0ZXM6IFtdLFxuICAgIHJlZ2lvbnM6IFJFR0lPTlMsXG4gICAgZWRpdHM6IG5ldyBNYXAoKSxcbiAgICBpbnZlbnRvcnk6IHt9LFxuICAgIGRpcnR5OiBuZXcgU2V0KCksXG4gICAgc3RhdHM6IHtcbiAgICAgIGNodW5rc0dlbmVyYXRlZDogMCwgY2h1bmtzRXZpY3RlZDogMCwgdm94ZWxzRmlsbGVkOiAwLCBnZW5lcmF0aW9uTXM6IDAsXG4gICAgICBlbnRpdGllczogMCwgdHJlZXM6IDAsIHBpbmtUcmVlczogMCwgcGlua092ZXJmbG93OiAwLFxuICAgIH0sXG4gICAgYXV0aG9yZWRQbGFjZWQ6IGZhbHNlLFxuICAgIHJldmlzaW9uOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVXb3JsZChzZWVkID0gMTMzNywgaW5pdGlhbFJhZGl1cyA9IDAsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkLCBnZW5lcmF0b3JWZXJzaW9uKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNOT1cpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBNQVQuR1JBVkVMO1xuICByZXR1cm4gTUFULlNUT05FO1xufVxuXG5mdW5jdGlvbiBvcmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgY2x1c3RlciA9IGZibTIoeCAvIDU1LCB6IC8gNTUsIHNlZWQgKyAxMzAsIDIpO1xuICBpZiAoY2x1c3RlciA8IDAuNTcpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgbiA9IHZhbHVlTm9pc2UzKHggKiAwLjA5LCB5ICogMC4xMywgeiAqIDAuMDksIHNlZWQgKyAxMzEpO1xuICBjb25zdCBuMiA9IHZhbHVlTm9pc2UzKHggKiAwLjIyICsgNSwgeSAqIDAuMzEsIHogKiAwLjIyIC0gMywgc2VlZCArIDEzMik7XG4gIHJldHVybiBuID4gMC43MCAmJiBuMiA+IDAuNTA7XG59XG5cbmZ1bmN0aW9uIGNhdmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGZibTMoeCAqIDAuMDc1LCB5ICogMC4xMSwgeiAqIDAuMDc1LCBzZWVkICsgMTQwLCAyKSA+IDAuNzI7XG59XG5cbmZ1bmN0aW9uIG92ZXJoYW5nQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWx1ZU5vaXNlMyh4ICogMC4xOCwgeSAqIDAuMjIsIHogKiAwLjE4LCBzZWVkICsgMTQxKSA+IDAuNjI7XG59XG5cbi8vIC0tLS0tLS0tLS0gdmVyc2lvbmVkIGdlbmVyYXRvciBkaXNwYXRjaCAtLS0tLS0tLS0tXG5jb25zdCB2MkNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRlcnJhaW5WMj4oKTtcbmNvbnN0IGh5ZHJvQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSHlkcm9sb2d5PigpO1xuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ3kgbmV0d29yayBmb3IgYSBzZWVkIGFuZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyb2xvZ3lGb3Ioc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIpOiBIeWRyb2xvZ3kge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuaHlkcm9sb2d5O1xuICBjb25zdCBrZXkgPSBgJHtzZWVkfToke3ZlcnNpb259YDtcbiAgbGV0IGh5ZHJvID0gaHlkcm9DYWNoZS5nZXQoa2V5KTtcbiAgaWYgKCFoeWRybykge1xuICAgIGh5ZHJvID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb24sIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGh5ZHJvQ2FjaGUuc2V0KGtleSwgaHlkcm8pO1xuICB9XG4gIHJldHVybiBoeWRybztcbn1cblxuLyoqIEBpbnRlcm5hbCBUaGUgdjIgZ2VuZXJhdG9yIGZvciBhIHNlZWQgKGNhY2hlZDsgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCkuICovXG5leHBvcnQgZnVuY3Rpb24gdGVycmFpblYyKHNlZWQ6IG51bWJlcik6IFRlcnJhaW5WMiB7XG4gIGxldCBnZW4gPSB2MkNhY2hlLmdldChzZWVkKTtcbiAgaWYgKCFnZW4pIHtcbiAgICBjb25zdCBoeWRyb2xvZ3kgPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbjogR0VORVJBVE9SX1YyLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBnZW4gPSBuZXcgVGVycmFpblYyKHNlZWQsIHN1cmZhY2VIZWlnaHRBdCwgaHlkcm9sb2d5KTtcbiAgICB2MkNhY2hlLnNldChzZWVkLCBnZW4pO1xuICB9XG4gIHJldHVybiBnZW47XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCBoZWlnaHQgKHRvcCBzb2xpZCArIDEpIGZvciBhbnkgc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkuaGVpZ2h0KHgsIHopIDogc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgd2F0ZXIgc3VyZmFjZTogd2F0ZXIgZmlsbHMgY2VsbHMgW2hlaWdodCwgbGV2ZWwpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VXYXRlckxldmVsQXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmNvbHVtbih4LCB6KS5sZXZlbDtcbiAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgOiBoO1xufVxuXG5mdW5jdGlvbiB2ZXJzaW9uZWRTbG9wZShzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogKyAxKSksXG4gICk7XG59XG5cbi8qKiBCYXNlIHRvcCBtYXRlcmlhbCBmb3IgYW55IGdlbmVyYXRvciB2ZXJzaW9uIChtYWNybyBMT0QsIGVudGl0eSBwbGFjZW1lbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbEZvcihcbiAgc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGdlbiA9IHRlcnJhaW5WMihzZWVkKTtcbiAgICByZXR1cm4gZ2VuLnRvcE1hdGVyaWFsKHgsIHosIGdlbi5jb2x1bW4oeCwgeiksIHNsb3BlLFxuICAgICAgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoaCwgc3MsIG5lYXJXYXRlcikpO1xuICB9XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB5OiBudW1iZXI7XG4gIHRvcDogTWF0SWQ7XG4gIHNsb3BlOiBudW1iZXI7XG59XG5cbi8qKiBCYXNlIHN1cmZhY2Ugc2FtcGxlIGZvciBtYWNybyBMT0QuIERvZXMgbm90IGluY2x1ZGUgdm94ZWwgZWRpdHMvb3ZlcmhhbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZVN1cmZhY2Uoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFN1cmZhY2VTYW1wbGUge1xuICBjb25zdCB5ID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICBjb25zdCBzbG9wZSA9IHNsb3BlQXQoc2VlZCwgeCwgeiwgeSk7XG4gIHJldHVybiB7IHksIHRvcDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCB5LCBzbG9wZSksIHNsb3BlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2h1bmsgZ2VuZXJhdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICByZXR1cm4gZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KGN4LCBjeikpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgYmFzZSA9IGdlbmVyYXRlQmFzZUNodW5rKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjeCwgY3opO1xuICByZXR1cm4gaW5zdGFsbEJhc2VDaHVuayh3b3JsZCwgYmFzZSwgcGVyZm9ybWFuY2Uubm93KCkgLSB0MCk7XG59XG5cbi8qKlxuICogQmFzZSBnZW5lcmF0ZWQgY29udGVudHMgb2YgYSBjaHVuayBiZWZvcmUgZHVyYWJsZSBlZGl0cy4gQSBwdXJlIGZ1bmN0aW9uIG9mXG4gKiAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24sIGN4LCBjeik6IHNhZmUgdG8gY29tcHV0ZSBpbiBhIFdlYiBXb3JrZXIsIGFuZCB0aGVcbiAqIGJ5dGVzIGFyZSBpZGVudGljYWwgd2hlcmV2ZXIgaXQgcnVucy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBCYXNlQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBzZWVkOiBudW1iZXI7XG4gIHZlcnNpb246IG51bWJlcjtcbiAgZGF0YTogVWludDhBcnJheTtcbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQmFzZUNodW5rKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQmFzZUNodW5rIHtcbiAgY29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KENIVU5LX1ZPTFVNRSk7XG4gIGNvbnN0IGhlaWdodHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3QgdG9wTWF0ZXJpYWxzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBjb25zdCB2MiA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpIDogbnVsbDtcblxuICAvLyBQYWRkZWQgaGVpZ2h0IGNhY2hlOiBhIHRocmVlLWNlbGwgYm9yZGVyIGNvdmVycyBzbG9wZSwgYmVhY2ggYW5kIGxlZGdlcy5cbiAgY29uc3QgUCA9IDM7XG4gIGNvbnN0IFBXID0gQ0hVTktfU0laRSArIFAgKiAyO1xuICBjb25zdCBiYXNlSCA9IG5ldyBJbnQxNkFycmF5KFBXICogUFcpO1xuICBjb25zdCB2MkNvbHM6IFYyQ29sdW1uW10gfCBudWxsID0gdjIgPyBuZXcgQXJyYXkoQ0hVTktfQVJFQSkgOiBudWxsO1xuICBmb3IgKGxldCBweiA9IDA7IHB6IDwgUFc7IHB6KyspIHtcbiAgICBmb3IgKGxldCBweCA9IDA7IHB4IDwgUFc7IHB4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBweCAtIFAsIHd6ID0gb3ogKyBweiAtIFA7XG4gICAgICBpZiAodjIpIHtcbiAgICAgICAgY29uc3QgY29sID0gdjIuY29sdW1uKHd4LCB3eik7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBjb2wuaDtcbiAgICAgICAgY29uc3QgbHggPSBweCAtIFAsIGx6ID0gcHogLSBQO1xuICAgICAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHYyQ29scyFbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY29sO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB3eCwgd3opO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB2MkNvbCA9IHYyQ29scyA/IHYyQ29sc1tseiAqIENIVU5LX1NJWkUgKyBseF0gOiBudWxsO1xuICAgICAgY29uc3QgdG9wID0gdjIgJiYgdjJDb2xcbiAgICAgICAgPyB2Mi50b3BNYXRlcmlhbCh3eCwgd3osIHYyQ29sLCBzbG9wZSwgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGhoLCBzcywgbmVhcldhdGVyKSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHRoZSBjb2x1bW4nc1xuICAgICAgLy8gd2F0ZXIgbGV2ZWwgKHNlYSBsZXZlbCBpbiB2MTsgdGhlIGh5ZHJvbG9naWNhbCBsZXZlbCBpbiB2MikuXG4gICAgICBjb25zdCB3YXRlckxldmVsID0gdjJDb2wgPyBNYXRoLm1pbihZX01BWCwgdjJDb2wubGV2ZWwpIDogU0VBX0xFVkVMO1xuICAgICAgaWYgKGggPCB3YXRlckxldmVsKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCB3YXRlckxldmVsOyB5KyspIHtcbiAgICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopO1xuICAgICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5XQVRFUjtcbiAgICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b3BTb2xpZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5tYXgoWV9NSU4sIGggLSAxKSk7XG4gICAgICBoZWlnaHRzW2NvbF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tjb2xdID0gdG9wO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb3RydWRpbmcgbGVkZ2VzOiBvbmUgb3IgdHdvIHN0b25lIGJsb2NrcyBleHRlbmQgZnJvbSBhIGhpZ2ggY29sdW1uIG92ZXJcbiAgLy8gYSBsb3dlciBuZWlnaGJvdXIuIFRoZXkgY3JlYXRlIHJlYWRhYmxlIG92ZXJoYW5ncyB3aXRob3V0IGEgZnVsbCBjYXZlIHBhc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBpZiAoc2xvcGUgPCAyKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRpcnM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1stMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWzAsIDFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2YgZGlycykge1xuICAgICAgICBjb25zdCBueCA9IGx4ICsgZHgsIG56ID0gbHogKyBkejtcbiAgICAgICAgaWYgKG54IDwgMCB8fCBueiA8IDAgfHwgbnggPj0gQ0hVTktfU0laRSB8fCBueiA+PSBDSFVOS19TSVpFKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbmggPSBiYXNlSFsobnogKyBQKSAqIFBXICsgKG54ICsgUCldO1xuICAgICAgICBpZiAoaCAtIG5oIDwgMikgY29udGludWU7XG4gICAgICAgIGlmIChoYXNoM2kobHgsIGx6LCBkeCAqIDMgKyBkeiAqIDcsIHNlZWQgKyAxNTApIDwgMC41NSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHkgPSBoIC0gMjtcbiAgICAgICAgaWYgKHkgPCBZX01JTiB8fCB5ID49IGgpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KG54LCB5VG9JbmRleCh5KSwgbnopO1xuICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtpZHhdID0gTUFULlNUT05FO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmVjb21wdXRlIHRoZSBjb2x1bW4gY2FjaGUgYWZ0ZXIgbGVkZ2VzL2NhdmVzLiBUaGUgZXhwb3NlZCB0b3AgbWF0ZXJpYWxcbiAgLy8gbXVzdCBjb21lIGZyb20gdGhlIGFjdHVhbCB0b3Agc29saWQgdm94ZWwsIG5vdCB0aGUgcHJlLWNhcnZlIGd1ZXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgIGxldCB0b3BNYXQ6IG51bWJlciA9IHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgY29uc3QgbSA9IGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICAgIGhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG9wTWF0O1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGN4LCBjeiwgc2VlZCwgdmVyc2lvbiwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIgfTtcbn1cblxuLyoqXG4gKiBJbnN0YWxsIGJhc2UgY29udGVudHMgYXMgYSByZXNpZGVudCBjaHVuazogYXBwbHkgZHVyYWJsZSBlZGl0cywgdXBkYXRlXG4gKiBzdGF0cywgYW5kIHJ1biBkZXRlcm1pbmlzdGljIGVudGl0eSBnZW5lcmF0aW9uLiBNYWluLXRocmVhZCBvbmx5OyB0aGlzIGlzXG4gKiB0aGUgc2luZ2xlIHdyaXRlciBvZiBXb3JsZC4gUmV0dXJucyB0aGUgYWxyZWFkeS1yZXNpZGVudCBjaHVuayBpZiBvbmUgZXhpc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbEJhc2VDaHVuayh3b3JsZDogV29ybGQsIGJhc2U6IEJhc2VDaHVuaywgZ2VuZXJhdGlvbk1zID0gMCk6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGJhc2Uuc2VlZCAhPT0gd29ybGQuc2VlZCB8fCBiYXNlLnZlcnNpb24gIT09IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdiYXNlIGNodW5rIGJlbG9uZ3MgdG8gYSBkaWZmZXJlbnQgd29ybGQgY29uZmlndXJhdGlvbicpO1xuICB9XG4gIGNvbnN0IHsgY3gsIGN6LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9ID0gYmFzZTtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgY2h1bms6IFZveGVsQ2h1bmsgPSB7XG4gICAgY3gsIGN6LCBrZXksIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyLFxuICAgIGRpcnR5OiB0cnVlLFxuICAgIGdlbmVyYXRlZEF0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgfTtcblxuICAvLyBBcHBseSBkdXJhYmxlIGVkaXRzIGFmdGVyIGJhc2UgZ2VuZXJhdGlvbi5cbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgaWYgKGVkaXRzKSB7XG4gICAgZm9yIChjb25zdCBbaWR4LCBtXSBvZiBlZGl0cykge1xuICAgICAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgICB9XG4gICAgLy8gUmVjb21wdXRlIHRoZSBjYWNoZSBmb3IgZWRpdGVkIGNodW5rcy5cbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCBseCwgbHopO1xuICAgIH1cbiAgfVxuICAvLyBOb24tYWlyIGNvdW50cyBhcmUgZGVyaXZlZCByZW5kZXJlciBzdGF0aXN0aWNzLCBub3QgZHVyYWJsZSB3b3JsZCBzdGF0ZS5cbiAgLy8gRWRpdGVkIGJhc2UgYWlyIG1heSBiZWNvbWUgc29saWQgKGFuZCB2aWNlIHZlcnNhKSBkdXJpbmcgcmVzdG9yYXRpb24uXG4gIGxldCBlZGl0ZWROb25BaXIgPSAwO1xuICBmb3IgKGNvbnN0IG1hdGVyaWFsIG9mIGNodW5rLmRhdGEpIGlmIChtYXRlcmlhbCAhPT0gTUFULkFJUikgZWRpdGVkTm9uQWlyKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBlZGl0ZWROb25BaXIgLSBub25BaXI7XG5cbiAgd29ybGQuY2h1bmtzLnNldChrZXksIGNodW5rKTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBub25BaXI7XG4gIHdvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyArPSBnZW5lcmF0aW9uTXM7XG4gIHdvcmxkLmRpcnR5LmFkZChrZXkpO1xuXG4gIGdlbmVyYXRlRW50aXRpZXMod29ybGQsIGNodW5rKTtcbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vKiogQSBiYXNlLXRlcnJhaW4gY2FjaGUgc2hhcmVkIGJ5IGVkaXRlZCBhbmQgdW5lZGl0ZWQgcmVnZW5lcmF0aW9uLiBOYXR1cmFsXG4gKiBzY2VuZXJ5IG5ldmVyIGRlcGVuZHMgb24gbGF0ZXIgdm94ZWwgZWRpdHM7IHRoaXMgYWxzbyBsZXRzIGEgc25hcHNob3QgcmVzdG9yZVxuICogYSBoYXJ2ZXN0ZWQgY2h1bmsgd2l0aG91dCBtYXRlcmlhbGl6aW5nIHVucmVsYXRlZCBuZWlnaGJvdXJpbmcgY2h1bmtzLiAqL1xuY29uc3QgYmFzZUNvbHVtbkNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hcDxzdHJpbmcsIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0+PigpO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDb2x1bW5zIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5OyB9XG5cbi8qKiBCYXNlIChwcmUtY2FydmUsIHByZS1lZGl0KSBjb2x1bW4gaGVpZ2h0cy9tYXRlcmlhbHMgdXNlZCBmb3IgZW50aXR5IHBsYWNlbWVudC4gUHVyZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlQmFzZUNvbHVtbnMoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ29sdW1ucyB7XG4gIGNvbnN0IGNvbHVtbnMgPSB7IGhlaWdodHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpLCB0b3BNYXRlcmlhbHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpIH07XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHgsIHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHopO1xuICAgICAgY29uc3Qgc2xvcGUgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IHZlcnNpb25lZFNsb3BlKHNlZWQsIHZlcnNpb24sIHgsIHosIGgpIDogc2xvcGVBdChzZWVkLCB4LCB6LCBoKTtcbiAgICAgIGNvbnN0IGluZGV4ID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLmhlaWdodHNbaW5kZXhdID0gY2xhbXAoaCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2luZGV4XSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gYmFzZVRvcE1hdGVyaWFsRm9yKHNlZWQsIHZlcnNpb24sIHgsIHosIGgsIHNsb3BlKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29sdW1ucztcbn1cblxuLyoqIFByb3ZpZGUgcHJlY29tcHV0ZWQgYmFzZSBjb2x1bW5zIChmb3IgZXhhbXBsZSBmcm9tIGEgd29ya2VyKSBiZWZvcmUgaW5zdGFsbGluZyBhIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlZWRCYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nLCBjb2x1bW5zOiBCYXNlQ29sdW1ucyk6IHZvaWQge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGlmICghY2FjaGUuaGFzKGtleSkpIGNhY2hlLnNldChrZXksIGNvbHVtbnMpO1xufVxuXG5mdW5jdGlvbiBiYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogQmFzZUNvbHVtbnMge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlLmdldChjaHVuay5rZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBjb2x1bW5zID0gY29tcHV0ZUJhc2VDb2x1bW5zKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjaHVuay5jeCwgY2h1bmsuY3opO1xuICBjYWNoZS5zZXQoY2h1bmsua2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVyaXZlZCBjaGFuZ2UgdHJhY2tpbmcgKG5vdCBhdXRob3JpdGF0aXZlIHN0YXRlKSAtLS0tLS0tLS0tXG4vLyBSZW5kZXJlcnMgbmVlZCB0byBrbm93IHdoZW4gdGhlIGVkaXQgb3ZlcmxheSBjaGFuZ2VkIHdpdGhvdXQgd2Fsa2luZyBldmVyeVxuLy8gZWRpdCBlYWNoIGZyYW1lLiBUaGUgY291bnRlciBsaXZlcyBvdXRzaWRlIFdvcmxkIHNvIGl0IG5ldmVyIGVudGVycyBhXG4vLyBzbmFwc2hvdCBvciBjYW5vbmljYWwgaGFzaC5cbmNvbnN0IGVkaXRWZXJzaW9ucyA9IG5ldyBXZWFrTWFwPFdvcmxkLCBudW1iZXI+KCk7XG5cbi8qKiBNb25vdG9uaWMgY291bnQgb2YgZWRpdC1vdmVybGF5IGNoYW5nZXMgZm9yIHRoaXMgV29ybGQgb2JqZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVkaXRWZXJzaW9uKHdvcmxkOiBXb3JsZCk6IG51bWJlciB7XG4gIHJldHVybiBlZGl0VmVyc2lvbnMuZ2V0KHdvcmxkKSA/PyAwO1xufVxuXG4vKiogQ2FsbCBhZnRlciByZXBsYWNpbmcgb3IgYnVsay1jaGFuZ2luZyBgd29ybGQuZWRpdHNgIG91dHNpZGUgc2V0Vm94ZWwuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya0VkaXRzQ2hhbmdlZCh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZWRpdFZlcnNpb25zLnNldCh3b3JsZCwgZWRpdFZlcnNpb24od29ybGQpICsgMSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gbm9uLWdlbmVyYXRpbmcgcXVlcmllcyAtLS0tLS0tLS0tXG4vLyBNb3ZpbmcgcHJlc2VudGF0aW9uIChjaGFyYWN0ZXJzLCBhbmltYWxzLCBjYW1lcmEpIG11c3QgbmV2ZXIgdHJpZ2dlciBjaHVua1xuLy8gZ2VuZXJhdGlvbiBhcyBhIHNpZGUgZWZmZWN0IG9mIGFza2luZyBhYm91dCB0ZXJyYWluLiBUaGVzZSByZXR1cm4gbnVsbCB3aGVuXG4vLyB0aGUgY29sdW1uJ3MgY2h1bmsgaXMgbm90IHJlc2lkZW50LlxuXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRDaHVua0F0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBudWxsO1xuICByZXR1cm4gd29ybGQuY2h1bmtzLmdldChjaHVua0tleSh3b3JsZFRvQ2h1bmtYKHgpLCB3b3JsZFRvQ2h1bmtaKHopKSkgPz8gbnVsbDtcbn1cblxuLyoqIExpa2Ugc3VyZmFjZUF0LCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50U3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgfCBudWxsIHtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuLyoqIExpa2UgZ2V0Vm94ZWwsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRWb3hlbEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHwgbnVsbCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmljdENodW5rKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCF3b3JsZC5jaHVua3MuaGFzKGtleSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuY2h1bmtzLmRlbGV0ZShrZXkpO1xuICB3b3JsZC5zdGF0cy5jaHVua3NFdmljdGVkKys7XG4gIC8vIENodW5rIGJ5dGVzIGFuZCBjb2x1bW4gY2FjaGVzIGFyZSByZWdlbmVyYXRlZCBvbiBkZW1hbmQuIEVudGl0aWVzIHJlbWFpblxuICAvLyBhdXRob3JpdGF0aXZlOiBldmljdGlvbiBtdXN0IG5vdCBmb3JnZXQgdGhlaXIgcGVyc2lzdGVudCBzdGF0ZS5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcXVlcmllcyAvIGVkaXRzIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBnZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG06IE1hdElkKTogYm9vbGVhbiB7XG4gIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBZX01BWCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBpZHggPSBsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgY29uc3QgcHJldmlvdXNFZGl0ID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rS2V5KGN4LCBjeikpPy5nZXQoaWR4KTtcbiAgLy8gQSBjaHVuayBldmljdGVkIGFmdGVyIGFuIGVhcmxpZXIgZWRpdCBjYW4gcmVnZW5lcmF0ZSB3aXRoIHRoYXQgZHVyYWJsZVxuICAvLyBtYXRlcmlhbCBhbHJlYWR5IGFwcGxpZWQuIERyb3BwaW5nIHRoZSBlZGl0IGhlcmUgd291bGQgbWFrZSBpdCBkaXNhcHBlYXJcbiAgLy8gb24gdGhlIG5leHQgZXZpY3Rpb24vcmVzdG9yYXRpb24sIGV2ZW4gdGhvdWdoIHRoZSBjdXJyZW50IHdyaXRlIG5vLW9wcy5cbiAgaWYgKHByZXZpb3VzRWRpdCA9PT0gbSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gZmFsc2U7XG4gIGxldCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChjaHVuay5rZXkpO1xuICBpZiAoIWVkaXRzKSB7IGVkaXRzID0gbmV3IE1hcCgpOyB3b3JsZC5lZGl0cy5zZXQoY2h1bmsua2V5LCBlZGl0cyk7IH1cbiAgLy8gQW4gaWRlbXBvdGVudCB3cml0ZSBtdXN0IHN0aWxsIHJlc3RvcmUgYSBkdXJhYmxlIGRlbHRhIGRpc2NhcmRlZCBieSBhblxuICAvLyBvbGRlciBzbmFwc2hvdCBvciBkZWx0YSBkZWNvZGVyLiBJdCBpcyBub3QgYSBuZXcgYXV0aG9yaXRhdGl2ZSByZXZpc2lvbi5cbiAgaWYgKGNodW5rLmRhdGFbaWR4XSA9PT0gbSkge1xuICAgIGlmICghZWRpdHMuaGFzKGlkeCkpIGVkaXRzLnNldChpZHgsIG0pO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgbWFya0VkaXRzQ2hhbmdlZCh3b3JsZCk7XG4gIGNodW5rLmRpcnR5ID0gdHJ1ZTtcbiAgd29ybGQuZGlydHkuYWRkKGNodW5rLmtleSk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCB3b3JsZFRvTG9jYWxYKHgpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rOiBWb3hlbENodW5rLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogdm9pZCB7XG4gIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICBpZiAoaXNTb2xpZChjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildKSkgeyB0b3BTb2xpZCA9IHk7IGJyZWFrOyB9XG4gIH1cbiAgY2h1bmsuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgY29uc3QgdG0gPSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICBpZiAodG9wU29saWQgPj0gWV9NSU4pIHtcbiAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh0b3BTb2xpZCksIGx6KV07XG4gICAgaWYgKG0gIT09IE1BVC5XQVRFUikgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IG07XG4gIH0gZWxzZSB7XG4gICAgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRtO1xuICB9XG59XG5cbi8qKlxuICogVGhlIHkgY29vcmRpbmF0ZSBvZiB0aGUgZXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uIGF0IHgvei5cbiAqIEEgc29saWQgdm94ZWwgYXQgeSBvY2N1cGllcyBbeSwgeSsxKSwgc28gdGhlIHdhbGthYmxlIHN1cmZhY2UgaXMgdG9wU29saWQrMS5cbiAqIFRoaXMgaXMgYSBkZXJpdmVkIHF1ZXJ5OyB0aGUgYXV0aG9yaXRhdGl2ZSBzdGF0ZSByZW1haW5zIHRoZSB2b3hlbCB2b2x1bWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBZX01JTjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBZX01JTjtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsudG9wTWF0ZXJpYWxzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWlnaHRBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiA8IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGggPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICAgIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIC0gaCA6IDA7XG4gIH1cbiAgcmV0dXJuIHdhdGVyU3VyZmFjZUF0KHdvcmxkLCB4LCB6KSAtIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKlxuICogVG9wIG9mIHRoZSB3YXRlciBjb2x1bW4gc3RhbmRpbmcgb24gdGhlIHNvbGlkIHN1cmZhY2UgKGVxdWFsIHRvIHRoZSBzdXJmYWNlXG4gKiB3aGVuIGRyeSkuIFJlYWRzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVscywgc28gZWRpdHMgYW5kIGR1ZyBwaXRzIGFyZSBleGFjdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyU3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIHdoaWxlICh5IDwgWV9NQVggJiYgZ2V0Vm94ZWwod29ybGQsIHgsIHksIHopID09PSBNQVQuV0FURVIpIHkrKztcbiAgcmV0dXJuIHk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZW50aXRpZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gYWRkRW50aXR5KHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5oYXMoZS5pZCkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIHJldHVybjtcbiAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGUpO1xuICBsZXQgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgbGlzdCk7IH1cbiAgbGlzdC5wdXNoKGUuaWQpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIC8vIEdlbmVyYXRpb24gaXMgZGV0ZXJtaW5pc3RpYyBhbmQgYWR2YW5jZXMgbm8gcGxheWVyLWNvbW1hbmQgcHJlY29uZGl0aW9uLlxuICAvLyBBdXRob3JlZCBzY2FmZm9sZGluZyBtYXkgdHJhbnNpZW50bHkgY2hhbmdlIGl0OyB0aGUgc25hcHNob3QgcmVzdG9yZXMgdGhlXG4gIC8vIHNhdmVkIHJldmlzaW9uIGFmdGVyIHBsYWNpbmcgdGhhdCBzY2FmZm9sZGluZy5cbn1cblxuLyoqXG4gKiBSZW1vdmUgYW4gZW50aXR5IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd29ybGQuIFVzZWQgd2hlbiBhIHNpdGUgaXMgY2xlYXJlZDpcbiAqIHRoZSByZXNvdXJjZSB5aWVsZCBpcyBhY2NvdW50ZWQgZm9yIGJ5IHRoZSBjYWxsZXIsIGFuZCB0aGUgZW50aXR5IG11c3Qgc3RvcFxuICogZXhpc3RpbmcgZm9yIGNvbGxpc2lvbiwgb2JzdHJ1Y3Rpb24gYW5kIHBlcnNpc3RlbmNlLCBub3QganVzdCBiZSBoaWRkZW4gYnlcbiAqIHRoZSByZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICBjb25zdCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKGxpc3QpIHtcbiAgICBjb25zdCBpID0gbGlzdC5pbmRleE9mKGlkKTtcbiAgICBpZiAoaSA+PSAwKSBsaXN0LnNwbGljZShpLCAxKTtcbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChpZCk7XG4gIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUlkKGNodW5rOiBzdHJpbmcsIGk6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBgZToke2NodW5rfToke2l9YDtcbn1cblxuLyoqXG4gKiBQdXJlIGZvcmVzdC1kZW5zaXR5IGZpZWxkIHVzZWQgYnkgZW50aXR5IGdlbmVyYXRpb24uIEV4cG9ydGVkIHJlYWQtb25seSBmb3JcbiAqIHJlbmRlciBkZWNvcmF0aW9uIChyZW5kZXIvZ3JvdW5kLWNvdmVyLnRzKTsgY2hhbmdpbmcgaXQgY2hhbmdlcyB3b3JsZHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3Jlc3RTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBlYXN0ID0gTWF0aC5leHAoLSgoKHd4IC0gMjIwKSAvIDI2MCkgKiogMiArICgod3ogKyAxMTApIC8gMjIwKSAqKiAyKSk7XG4gIGNvbnN0IG5vcnRoID0gTWF0aC5leHAoLSgoKHd4IC0gMjApIC8gMzAwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAxOTApICoqIDIpKTtcbiAgY29uc3Qgd2VzdCA9IE1hdGguZXhwKC0oKCh3eCArIDM0MCkgLyAyMDApICoqIDIgKyAoKHd6IC0gMTIwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBzb3V0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDEyMCkgLyAyNDApICoqIDIgKyAoKHd6IC0gMzMwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBtb2lzdHVyZSA9IGZibTIod3ggLyAyNjAsIHd6IC8gMjYwLCBzZWVkICsgMjAxLCA0KTtcbiAgY29uc3QgdmFsbGV5ID0gTWF0aC5leHAoLSgod3ggLyAxNDApICoqIDIgKyAod3ogLyAxMDUpICoqIDIpKTtcbiAgcmV0dXJuIE1hdGgubWF4KGVhc3QsIG5vcnRoICogMC45Miwgd2VzdCAqIDAuODAsIHNvdXRoICogMC43OCkgKiAwLjgyXG4gICAgKyBtb2lzdHVyZSAqIDAuMzggLSAwLjIyIC0gdmFsbGV5ICogMC4zNDtcbn1cblxuLyoqIFB1cmUgcm9ja2luZXNzIGZpZWxkIHVzZWQgYnkgZW50aXR5IGdlbmVyYXRpb24gKHNhbWUgY29udHJhY3QgYXMgZm9yZXN0U2NvcmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJvY2tTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBtb3VudGFpbiA9IGZibTIod3ggLyAzMzAsIHd6IC8gMzMwLCBzZWVkICsgMjAyLCAzKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAxNDAsIHd6IC8gMTQwLCBzZWVkICsgMjAzLCAzKSAtIDEpO1xuICByZXR1cm4gbW91bnRhaW4gKiAwLjU1ICsgcmlkZ2UgKiAwLjQ1O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB2b2lkIHtcbiAgZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZCwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbn1cblxuLyoqIEBpbnRlcm5hbCBSZXBsYXlzIGRldGVybWluaXN0aWMgZ2VuZXJhdGlvbiBmb3Igc25hcHNob3QgZW50aXR5IGRlbHRhcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBpZiAod29ybGQuZW50aXR5Q2h1bmtzLmhhcyhrZXkpKSByZXR1cm47XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybjtcblxuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChoYXNoMmkoY2h1bmsuY3gsIGNodW5rLmN6LCB3b3JsZC5zZWVkICsgOTAwKSAqIDQyOTQ5NjcyOTYpID4+PiAwKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIGNvbnN0IGNvbHVtbnMgPSBiYXNlQ29sdW1ucyh3b3JsZCwgY2h1bmspO1xuICBsZXQgbiA9IDA7XG4gIGxldCBuYXR1cmFsVHJlZXMgPSAwO1xuICBsZXQgbmF0dXJhbFBpbmtUcmVlcyA9IDA7XG5cbiAgY29uc3QgbG9jYWxTdXJmYWNlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdICsgWV9NSU47XG4gIH07XG4gIGNvbnN0IGxvY2FsVG9wID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBNYXRJZCA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSBhcyBNYXRJZDtcbiAgfTtcbiAgY29uc3QgbG9jYWxTbG9wZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgcmV0dXJuIE1hdGgubWF4KFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggKyAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogKyAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICApO1xuICB9O1xuXG4gIC8vIEEgaml0dGVyZWQgOCBtIGxhdHRpY2UgZ2l2ZXMgY29oZXJlbnQgbWFzc2VzIGFuZCBhdm9pZHMgcGVyLWZyYW1lIHNjYXR0ZXIuXG4gIGZvciAobGV0IGd6ID0gMDsgZ3ogPCBDSFVOS19TSVpFOyBneiArPSA4KSB7XG4gICAgZm9yIChsZXQgZ3ggPSAwOyBneCA8IENIVU5LX1NJWkU7IGd4ICs9IDgpIHtcbiAgICAgIGNvbnN0IGx4ID0gY2xhbXAoTWF0aC5mbG9vcihneCArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IGx6ID0gY2xhbXAoTWF0aC5mbG9vcihneiArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgICAgaWYgKGggPD0gU0VBX0xFVkVMICsgMSkgY29udGludWU7XG4gICAgICBjb25zdCBzbG9wZSA9IGxvY2FsU2xvcGUobHgsIGx6KTtcbiAgICAgIGNvbnN0IHRvcCA9IGxvY2FsVG9wKGx4LCBseik7XG4gICAgICBpZiAodG9wID09PSBNQVQuV0FURVIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZm9yZXN0ID0gZm9yZXN0U2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvY2t5ID0gcm9ja1Njb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2xsID0gcm5kKCk7XG5cbiAgICAgIGNvbnN0IHRyZWVDaGFuY2UgPSBmb3Jlc3QgPiAwLjUwID8gMC43MiA6IGZvcmVzdCA+IDAuMzAgPyAwLjI1IDogMC4wNTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAyICYmIHJvbGwgPCB0cmVlQ2hhbmNlKSB7XG4gICAgICAgIC8vIFRoZSBjYXAgaXMgYSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZ2VuZXJhdGlvbiBwcm9wZXJ0eS4gSXQgY2Fubm90XG4gICAgICAgIC8vIGRlcGVuZCBvbiB3aGljaCBjaHVua3MgYSByZW5kZXJlciBsb2FkZWQgYmVmb3JlIHRoaXMgb25lLlxuICAgICAgICBsZXQga2luZDogRW50aXR5S2luZDtcbiAgICAgICAgbGV0IHZhcmlhbnQ6IG51bWJlcjtcbiAgICAgICAgY29uc3Qgc3BlY2llc1JvbGwgPSBybmQoKTtcbiAgICAgICAgaWYgKHNwZWNpZXNSb2xsIDwgMC4xMikge1xuICAgICAgICAgIGlmICgobmF0dXJhbFBpbmtUcmVlcyArIDEpID4gMC4yNSAqIChuYXR1cmFsVHJlZXMgKyAxKSkge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua092ZXJmbG93Kys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2Jsb3Nzb20nO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAyKTtcbiAgICAgICAgICAgIG5hdHVyYWxQaW5rVHJlZXMrKztcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNDApIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9zcGlyZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNzQpIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV90YWJsZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICB9XG4gICAgICAgIG5hdHVyYWxUcmVlcysrO1xuICAgICAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44OCArIHJuZCgpICogMC4yNCwgdmFyaWFudCxcbiAgICAgICAgICByZXNvdXJjZTogJ3dvb2QnLCByZW1haW5pbmc6IDEyLCB5aWVsZFBlckhhcnZlc3Q6IDQsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHJvY2t5ID4gMC40NiAmJiByb2xsIDwgMC4zOCkge1xuICAgICAgICAvLyBDb25zdW1lIHRoZSByZXRpcmVkIHN0b25lIGZvcm0ncyByYW5kb20gZHJhd3MgYW5kIGFsbG9jYXRlIGl0cyBvbGRcbiAgICAgICAgLy8gc2VxdWVuY2UgSUQsIGJ1dCBkbyBub3QgaW5zZXJ0IGFuIGVudGl0eS4gTGF0ZXIgbmF0dXJhbCBwbGFjZW1lbnRzXG4gICAgICAgIC8vIHRoZXJlZm9yZSByZW1haW4gYnl0ZS1mb3ItYnl0ZSBjb21wYXRpYmxlIHdpdGggcmVjb3JkZWQgc2F2ZXMuXG4gICAgICAgIGNvbnN0IHNpemVSb2xsID0gcm5kKCk7XG4gICAgICAgIGNvbnN0IGtpbmQ6IEVudGl0eUtpbmQgPSBzaXplUm9sbCA8IDAuNTUgPyAnc3R5bF9yb2NrX3NtYWxsJ1xuICAgICAgICAgIDogc2l6ZVJvbGwgPCAwLjkwID8gJ3N0eWxfcm9ja19tZWRpdW0nIDogJ3N0eWxfcm9ja19sYXJnZSc7XG4gICAgICAgIGNvbnN0IGlkID0gZW50aXR5SWQoY2h1bmsua2V5LCBuKyspO1xuICAgICAgICBjb25zdCByZWNvcmQgPSB7XG4gICAgICAgICAgaWQsIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByZXNvdXJjZTogJ3N0b25lJyBhcyBjb25zdCxcbiAgICAgICAgICByZW1haW5pbmc6IGtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gNCA6IGtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDggOiAxMixcbiAgICAgICAgICB5aWVsZFBlckhhcnZlc3Q6IDMsIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgIH07XG4gICAgICAgIC8vIE9ubHkgZW50aXRpZXMgdGhhdCBleGlzdGVkIGluIGFuIGFjY2VwdGVkIG9sZCBzYXZlIGdldCB0b21ic3RvbmVzLFxuICAgICAgICAvLyBkdXJpbmcgZXhwbGljaXQgbWlncmF0aW9uLiBPcmRpbmFyeSBnZW5lcmF0aW9uIG11c3QgcmVzdG9yZSBleGFjdGx5LlxuICAgICAgICBpZiAoaXNTdG9uZVJlcGxheSh3b3JsZCkpIGFkZEVudGl0eSh3b3JsZCwgcmVjb3JkKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuU1RPTkUgJiYgcm9ja3kgPiAwLjU4ICYmIHJvbGwgPCAwLjE4KSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfb3JlJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDIpLFxuICAgICAgICAgIHJlc291cmNlOiAnb3JlJywgcmVtYWluaW5nOiA4LCB5aWVsZFBlckhhcnZlc3Q6IDIsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDEgJiYgcm9sbCA8IDAuMzApIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9zaHJ1YicsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44ICsgcm5kKCkgKiAwLjQsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgICByZXNvdXJjZTogJ2ZpYmVyJywgcmVtYWluaW5nOiA0LCB5aWVsZFBlckhhcnZlc3Q6IDEsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkOiBXb3JsZCwga2luZDogRW50aXR5S2luZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgcm90OiBudW1iZXIsIHNjYWxlOiBudW1iZXIsIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsLCByZW1haW5pbmc6IG51bWJlciwgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmICh5IDw9IFNFQV9MRVZFTCkgcmV0dXJuO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgLy8gQSBoZXJvIGFzc2V0IG93bnMgaXRzIHNwb3Q6IGNsZWFyIGFueSBnZW5lcmF0ZWQgZW50aXR5IHRoYXQgd291bGQgb3ZlcmxhcFxuICAvLyBpdCwgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBpbmcgdGhlIGF1dGhvcmVkIGNvbXBvc2l0aW9uLlxuICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkgPz8gW107XG4gIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoa2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSByZXR1cm47XG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKGUgJiYgTWF0aC5oeXBvdChlLnggLSB4LCBlLnogLSB6KSA8IDIuNikge1xuICAgICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICAgIH1cbiAgfVxuICB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpKTtcbiAgLy8gQXV0aG9yZWQgY29tcG9zaXRpb24gaXMgZHVyYWJsZSBzdGF0ZTogaXQgY2FuIGNsZWFyIG92ZXJsYXBwaW5nIG5hdHVyYWxcbiAgLy8gZW50aXRpZXMsIHNvIHNhdmUgdGhlIGNvbXBsZXRlIGFmZmVjdGVkIGNodW5rIHJhdGhlciB0aGFuIG9ubHkgaXRzIGhlcm9lcy5cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcblxuICBjb25zdCBpZCA9IGBoZXJvOiR7a2luZH06JHtNYXRoLnJvdW5kKHgpfToke01hdGgucm91bmQoeil9YDtcbiAgY29uc3QgYmVmb3JlID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgY29uc3QgZW50aXR5OiBFbnRpdHkgPSB7XG4gICAgaWQsIGtpbmQsIGNodW5rOiBrZXksIHg6IHggKyAwLjUsIHksIHo6IHogKyAwLjUsXG4gICAgcm90LCBzY2FsZSwgdmFyaWFudCwgcmVzb3VyY2UsIHJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0LFxuICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogdHJ1ZSxcbiAgfTtcbiAgYWRkRW50aXR5KHdvcmxkLCBlbnRpdHkpO1xuICBpZiAod29ybGQuZW50aXRpZXMuc2l6ZSA+IGJlZm9yZSAmJiBraW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB7XG4gICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoa2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmF1dGhvcmVkUGxhY2VkKSByZXR1cm47XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gdHJ1ZTtcblxuICBjb25zdCBzaXRlczogQXJyYXk8eyBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7IHg6IG51bWJlcjsgejogbnVtYmVyOyByb3Q6IG51bWJlciB9PiA9IFtcbiAgICB7IGtpbmQ6ICd3YXlzdG9uZScsIHg6IC0xMCwgejogLTE0LCByb3Q6IDAgfSxcbiAgICB7IGtpbmQ6ICdtYXJrZXInLCB4OiAtMzIsIHo6IC04LCByb3Q6IE1hdGguUEkgLyAyIH0sXG4gIF07XG4gIGZvciAoY29uc3QgcyBvZiBzaXRlcykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoeSA8PSBTRUFfTEVWRUwpIGNvbnRpbnVlO1xuICAgIHdvcmxkLnNpdGVzLnB1c2goe1xuICAgICAgaWQ6IGBzaXRlOiR7cy5raW5kfWAsXG4gICAgICBraW5kOiBzLmtpbmQsXG4gICAgICB4OiBzLnggKyAwLjUsIHksIHo6IHMueiArIDAuNSxcbiAgICAgIHJvdDogcy5yb3QsXG4gICAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEEgaGVybyBncm92ZSBjb21wb3NlZCBpbiB0aGUgZGVmYXVsdCBjYW1lcmEncyB2aWV3IGRpcmVjdGlvbi4gVGhlc2UgYXJlXG4gIC8vIFN0eWwgbmF0dXJhbCBhc3NldHMgKEFTLTAwMSB2MiksIG5vdCBOb3hlbCBhcmNoaXRlY3R1cmU7IHRoZSBOb3hlbFxuICAvLyB3YXlzdG9uZS9tYXJrZXIgYWJvdmUgcmVtYWluIHRoZSBodW1hbi1tYWRlIGxhbmRtYXJrcy5cbiAgY29uc3QgZ3JvdmU6IEFycmF5PFtFbnRpdHlLaW5kLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0+ID0gW1xuICAgIFsnc3R5bF90cmVlX3NwaXJlJywgLTIyLCAtMjYsIDAsIDEuMDAsIDBdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTM0LCAtMTgsIDEsIDAuOTUsIE1hdGguUEkgLyAxMl0sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xNiwgLTM0LCAyLCAxLjAwLCBNYXRoLlBJIC8gNl0sXG4gICAgWydzdHlsX3RyZWVfYmxvc3NvbScsIC0yOCwgLTM4LCAwLCAwLjkwLCBNYXRoLlBJIC8gNF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtNDAsIC0zMCwgMiwgMS4wNSwgTWF0aC5QSSAvIDNdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTIsIC0yNCwgMCwgMC45MCwgTWF0aC5QSSAvIDIuNF0sXG4gIF07XG4gIGZvciAoY29uc3QgW2tpbmQsIHgsIHosIHZhcmlhbnQsIHNjYWxlLCByb3RdIG9mIGdyb3ZlKSB7XG4gICAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsIGtpbmQsIHgsIHosIHZhcmlhbnQsIHJvdCwgc2NhbGUsICd3b29kJywgMTIsIDQpO1xuICB9XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9yb2NrX21lZGl1bScsIC02LCAtMTAsIDAsIDAsIDEuMCwgJ3N0b25lJywgOCwgMyk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9zaHJ1YicsIC0xNCwgLTgsIDEsIE1hdGguUEkgLyAxMiwgMS4xLCAnZmliZXInLCA0LCAxKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX2NhaXJuJywgLTIwLCAtNiwgMCwgMCwgMS4wLCAnc3RvbmUnLCA2LCAyKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX29yZScsIC0zOCwgLTQyLCAwLCBNYXRoLlBJIC8gNCwgMS4xLCAnb3JlJywgOCwgMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBuZWFyZXN0SGFydmVzdGFibGUoXG4gIHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCByZXNvdXJjZT86IFJlc291cmNlVHlwZSxcbik6IEVudGl0eSB8IG51bGwge1xuICBsZXQgYmVzdDogRW50aXR5IHwgbnVsbCA9IG51bGw7XG4gIGxldCBiZXN0RCA9IHJhZGl1cyAqIHJhZGl1cztcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKVxuICAgICAgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgY29udGludWU7XG4gICAgaWYgKHJlc291cmNlICYmIGUucmVzb3VyY2UgIT09IHJlc291cmNlKSBjb250aW51ZTtcbiAgICBjb25zdCBkID0gKGUueCAtIHgpICoqIDIgKyAoZS56IC0geikgKiogMjtcbiAgICBpZiAoZCA8IGJlc3REKSB7IGJlc3REID0gZDsgYmVzdCA9IGU7IH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0UmVzdWx0IHsgZW50aXR5OiBFbnRpdHk7IHJlc291cmNlOiBSZXNvdXJjZVR5cGU7IGFtb3VudDogbnVtYmVyOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXJ2ZXN0RW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEhhcnZlc3RSZXN1bHQgfCBudWxsIHtcbiAgY29uc3QgZSA9IGxpdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsO1xuICBjb25zdCBhbW91bnQgPSBNYXRoLm1pbihlLnlpZWxkUGVySGFydmVzdCwgZS5yZW1haW5pbmcpO1xuICBpZiAod29ybGQubGlmZSAmJiBPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIG4pID0+IHN1bSArIG4sIDApICsgYW1vdW50ID4gMTIwKSByZXR1cm4gbnVsbDtcbiAgZS5yZW1haW5pbmcgLT0gYW1vdW50O1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBlLmhhcnZlc3RlZE9uY2UgPSB0cnVlO1xuICBpZiAoZS5yZW1haW5pbmcgPD0gMCkgZS5oYXJ2ZXN0ZWQgPSB0cnVlO1xuICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBlbnRpdHk6IGUsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQgfTtcbn1cblxuLyoqIFJlbW92ZSBldmVyeSByZXRpcmVkIHNvdXJjZSBhZnRlciB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheS4gVGhpcyBtaWdyYXRpb25cbiAqIGNyZWF0ZXMgZGV0ZXJtaW5pc3RpYyB0b21ic3RvbmVzIGJ1dCBpcyBub3QgYSBwbGF5ZXIgY29tbWFuZCBvciByZXZpc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXRpcmVTdG9uZUVudGl0aWVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBmb3IgKGNvbnN0IGUgb2YgWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXSkge1xuICAgIGlmICghaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkpIGNvbnRpbnVlO1xuICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShlLmlkKTtcbiAgICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChlLmlkKTtcbiAgICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgICBpZiAoIXdvcmxkLmVudGl0eUNodW5rcy5oYXMoZS5jaHVuaykpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIGZvciAoY29uc3QgW2tleSwgaWRzXSBvZiB3b3JsZC5lbnRpdHlDaHVua3MpIHtcbiAgICBjb25zdCBhY3RpdmUgPSBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSk7XG4gICAgaWYgKGFjdGl2ZS5sZW5ndGggPiAwIHx8IHdvcmxkLmVudGl0eUNoYW5nZXMuaGFzKGtleSkpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBhY3RpdmUpO1xuICAgIGVsc2Ugd29ybGQuZW50aXR5Q2h1bmtzLmRlbGV0ZShrZXkpO1xuICB9XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwZXJzaXN0ZW5jZSAvIGF1dGhvcml0eSBib3VuZGFyeSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWFuaWZlc3Qge1xuICBzY2hlbWE6IDE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgcGFyYW1zSGFzaDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBmbnYxYSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgaCA9IDB4ODExYzlkYzU7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGggXj0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIGggPSBNYXRoLmltdWwoaCwgMHgwMTAwMDE5Myk7XG4gIH1cbiAgcmV0dXJuIChoID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkTWFuaWZlc3Qod29ybGQ6IFdvcmxkKTogV29ybGRNYW5pZmVzdCB7XG4gIGNvbnN0IHAgPSB3b3JsZC5wYXJhbXM7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIHNlZWQ6IHdvcmxkLnNlZWQsXG4gICAgZ2VuZXJhdG9yVmVyc2lvbjogcC5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIHNpemU6IHAuc2l6ZSxcbiAgICBjaHVua1NpemU6IHAuY2h1bmtTaXplLFxuICAgIHlNaW46IHAueU1pbixcbiAgICB5TWF4OiBwLnlNYXgsXG4gICAgc2VhTGV2ZWw6IHAuc2VhTGV2ZWwsXG4gICAgcGFyYW1zSGFzaDogZm52MWEoSlNPTi5zdHJpbmdpZnkocCkpLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsRWRpdCB7IGk6IG51bWJlcjsgbTogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBzY2hlbWE6IDE7XG4gIGtleTogc3RyaW5nO1xuICBiYXNlVmVyc2lvbjogbnVtYmVyO1xuICBlZGl0czogVm94ZWxFZGl0W107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBDaHVua0RlbHRhIHtcbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAga2V5LFxuICAgIGJhc2VWZXJzaW9uOiB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBlZGl0czogZWRpdHMgPyBbLi4uZWRpdHMuZW50cmllcygpXS5tYXAoKFtpLCBtXSkgPT4gKHsgaSwgbSB9KSkuc29ydCgoYSwgYikgPT4gYS5pIC0gYi5pKSA6IFtdLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwgZGVsdGE6IENodW5rRGVsdGEpOiB2b2lkIHtcbiAgY29uc3QgW2N4LCBjel0gPSBkZWx0YS5rZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgZm9yIChjb25zdCBlIG9mIGRlbHRhLmVkaXRzKSB7XG4gICAgY29uc3QgeUluZGV4ID0gTWF0aC5mbG9vcihlLmkgLyBDSFVOS19BUkVBKTtcbiAgICBjb25zdCByZW0gPSBlLmkgJSBDSFVOS19BUkVBO1xuICAgIGNvbnN0IGx6ID0gTWF0aC5mbG9vcihyZW0gLyBDSFVOS19TSVpFKTtcbiAgICBjb25zdCBseCA9IHJlbSAlIENIVU5LX1NJWkU7XG4gICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseDtcbiAgICBjb25zdCB5ID0gWV9NSU4gKyB5SW5kZXg7XG4gICAgY29uc3QgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICBzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgZS5tIGFzIE1hdElkKTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIHRpbWUgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBUaW1lU3RhdGUgeyB0OiBudW1iZXI7IGRheUxlbmd0aFNlYzogbnVtYmVyOyBwYXVzZWQ6IGJvb2xlYW47IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkdmFuY2VUaW1lKHM6IFRpbWVTdGF0ZSwgZHQ6IG51bWJlcik6IHZvaWQge1xuICBpZiAocy5wYXVzZWQpIHJldHVybjtcbiAgcy50ID0gKHMudCArIGR0IC8gcy5kYXlMZW5ndGhTZWMpICUgMTtcbn1cbiIsICIvLyBSZW5kZXIgbGF5ZXIgXHUyMDE0IGNodW5rZWQgM0Qgdm94ZWwgbWVzaGVyICsgc3RyZWFtaW5nICsgbWFjcm8gTE9ELlxuLy9cbi8vIFRoZSB2aXNpYmxlIHN1cmZhY2UgaXMgZGVyaXZlZCBmcm9tIHRoZSBzaW0ncyBvY2N1cGFuY3kvbWF0ZXJpYWwgdm9sdW1lLlxuLy8gTmVhciBjaHVua3MgYXJlIG1lc2hlZCBhdCAxIG0gd2l0aCBncmVlZHkgZmFjZSBtZXJnaW5nOyB0aGUgZmFyIGxhbmRzY2FwZSBpc1xuLy8gYW4gOCBtICh3b3JsZCkgLyA4IG0gKG1hcCkgbWFjcm8gTE9EIHNhbXBsZWQgZnJvbSB0aGUgc2FtZSBkZXRlcm1pbmlzdGljXG4vLyBnZW5lcmF0b3IuIFdhdGVyIGlzIGEgc2luZ2xlIHNlYS1sZXZlbCBzdXJmYWNlIGRlcml2ZWQgZnJvbSB0aGUgc2VhYmVkIGRlcHRoLlxuLy9cbi8vIE5vIGFwcm9uLCBob3Jpem9uIHJpbmcgb3IgZm91bmRhdGlvbiBza2lydDogdGhlIHdvcmxkIGVkZ2UgaXMgb2NlYW4sIGFuZCB0aGVcbi8vIG9jZWFuIHN1cmZhY2UgZXh0ZW5kcyBmYXIgYmV5b25kIHRoZSAyMDQ4IG0gcGxheWFibGUgaXNsYW5kLlxuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHBhbGV0dGUgZnJvbSAnLi4vZGF0YS9wYWxldHRlLmpzb24nO1xuaW1wb3J0IHsgbWVzaENodW5rV2F0ZXIsIGluc3RhbGxGYXJXYXRlckhvbGUsIHdhdGVyVGltZSB9IGZyb20gJy4vd2F0ZXInO1xuaW1wb3J0IHsgTWVzaEFycmF5cywgYnVpbGRQYWRkZWQsIG1lc2hQYWRkZWQgfSBmcm9tICcuL21lc2hlcic7XG5pbXBvcnQgdHlwZSB7IENodW5rV29ya2VyUG9vbCB9IGZyb20gJy4vY2h1bmstcG9vbCc7XG5pbXBvcnQge1xuICBXb3JsZCwgVm94ZWxDaHVuaywgTWF0SWQsIFN1cmZhY2VTYW1wbGUsIEdFTkVSQVRPUl9WRVJTSU9OLFxuICBXT1JMRF9TSVpFLCBIQUxGLCBDSFVOS19TSVpFLCBDSFVOS1NfUEVSX1NJREUsIENIVU5LX0FSRUEsIFdPUkxEX0hFSUdIVCxcbiAgWV9NSU4sIFlfTUFYLCBTRUFfTEVWRUwsIE1BVCwgaXNPcGFxdWUsXG4gIGNodW5rS2V5LCBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWiwgbG9jYWxJbmRleCwgeVRvSW5kZXgsXG4gIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIHdvcmxkVG9Mb2NhbFgsIHdvcmxkVG9Mb2NhbFosXG4gIGdldFZveGVsLCBlbnN1cmVDaHVuaywgZXZpY3RDaHVuaywgaGFzaDJpLCBmYm0yLFxuICBlZGl0VmVyc2lvbiwgYmFzZUhlaWdodEF0LCBiYXNlVG9wTWF0ZXJpYWxGb3IsIGluc3RhbGxCYXNlQ2h1bmssIHNlZWRCYXNlQ29sdW1ucyxcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcblxuaW1wb3J0IHtcbiAgTSwgSCwgY29sb3JDYWNoZSwgYywgQ09MLCBTSEFERSwgTUFYX1BFUkZfU0FNUExFUywgcmVjb3JkU2FtcGxlLCBwZXJjZW50aWxlLCBoZWlnaHRCYW5kLCBzdG9uZVRvbmUsIHNoYWRlQXQsIGtleUZvciwgZmFjZUNvbG9yQ2FjaGUsIGNvbG9yRm9yS2V5LFxufSBmcm9tICcuL3ZveGVsLWNvbG9ycyc7XG5cbmNvbnN0IHRlcnJhaW5NYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgdmVydGV4Q29sb3JzOiB0cnVlLFxuICBzaWRlOiBUSFJFRS5Gcm9udFNpZGUsXG59KTtcbnRlcnJhaW5NYXRlcmlhbC5vbkJlZm9yZUNvbXBpbGUgPSAoc2hhZGVyKSA9PiB7XG4gIHNoYWRlci52ZXJ0ZXhTaGFkZXIgPSBzaGFkZXIudmVydGV4U2hhZGVyXG4gICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgJyNpbmNsdWRlIDxjb21tb24+XFxuYXR0cmlidXRlIGZsb2F0IGFNYXQ7XFxudmFyeWluZyB2ZWMzIHZXUG9zO1xcbnZhcnlpbmcgdmVjMyB2V05ybTtcXG52YXJ5aW5nIGZsb2F0IHZNYXQ7JylcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD4nLCAnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD5cXG52V1BvcyA9IChtb2RlbE1hdHJpeCAqIHZlYzQodHJhbnNmb3JtZWQsIDEuMCkpLnh5ejtcXG52V05ybSA9IG5vcm1hbGl6ZShtYXQzKG1vZGVsTWF0cml4KSAqIG9iamVjdE5vcm1hbCk7XFxudk1hdCA9IGFNYXQ7Jyk7XG4gIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsIGAjaW5jbHVkZSA8Y29tbW9uPlxudmFyeWluZyB2ZWMzIHZXUG9zO1xudmFyeWluZyB2ZWMzIHZXTnJtO1xudmFyeWluZyBmbG9hdCB2TWF0O1xuZmxvYXQgaDIxKHZlYzIgcCkgeyByZXR1cm4gZnJhY3Qoc2luKGRvdChwLCB2ZWMyKDEyNy4xLCAzMTEuNykpKSAqIDQzNzU4LjU0NTMxMjMpOyB9XG5mbG9hdCB2bjIodmVjMiBwKSB7XG4gIHZlYzIgaSA9IGZsb29yKHApOyB2ZWMyIGYgPSBmcmFjdChwKTsgZiA9IGYgKiBmICogKDMuMCAtIDIuMCAqIGYpO1xuICByZXR1cm4gbWl4KG1peChoMjEoaSksIGgyMShpICsgdmVjMigxLjAsIDAuMCkpLCBmLngpLFxuICAgICAgICAgICAgIG1peChoMjEoaSArIHZlYzIoMC4wLCAxLjApKSwgaDIxKGkgKyB2ZWMyKDEuMCwgMS4wKSksIGYueCksIGYueSk7XG59YClcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbG9yX2ZyYWdtZW50PicsIGAjaW5jbHVkZSA8Y29sb3JfZnJhZ21lbnQ+XG57XG4gIHZlYzMgbiA9IG5vcm1hbGl6ZSh2V05ybSk7XG4gIGZsb2F0IHZlcnQgPSAxLjAgLSBzbW9vdGhzdGVwKDAuMzUsIDAuNzAsIGFicyhuLnkpKTtcbiAgZmxvYXQgaXNHcmFzcyA9ICgodk1hdCA+IDAuNSAmJiB2TWF0IDwgMS41KSB8fCAodk1hdCA+IDguNSAmJiB2TWF0IDwgOS41KSkgPyAxLjAgOiAwLjA7XG4gIGZsb2F0IGlzU3RvbmUgPSAoKHZNYXQgPiA0LjUgJiYgdk1hdCA8IDYuNSkgfHwgKHZNYXQgPiA3LjUgJiYgdk1hdCA8IDguNSkpID8gMS4wIDogMC4wO1xuXG4gIGZsb2F0IGhvcml6ID0gYWJzKG4ueCkgPiBhYnMobi56KSA/IHZXUG9zLnogOiB2V1Bvcy54O1xuICBmbG9hdCByb3cgPSBmbG9vcih2V1Bvcy55KTtcbiAgZmxvYXQgY29sID0gZmxvb3IoaG9yaXopO1xuICBmbG9hdCBoID0gaDIxKHZlYzIoY29sLCByb3cpKTtcbiAgdmVjMiBmID0gdmVjMihmcmFjdChob3JpeiksIGZyYWN0KHZXUG9zLnkpKTtcbiAgZmxvYXQgam9pbnQgPSBzbW9vdGhzdGVwKDAuMCwgMC4wNTUsIG1pbihmLngsIDEuMCAtIGYueCkpXG4gICAgICAgICAgICAgICogc21vb3Roc3RlcCgwLjAsIDAuMDUwLCBtaW4oZi55LCAxLjAgLSBmLnkpKTtcbiAgdmVjMyBzdG9uZSA9IG1peCh2ZWMzKDAuNjIsIDAuNjIsIDAuNTgpLCB2ZWMzKDEuMDQsIDEuMDIsIDAuOTUpLCBoKTtcbiAgc3RvbmUgKj0gbWl4KDAuOTAsIDEuMCwgam9pbnQpO1xuICBzdG9uZSAqPSBtaXgoMC45MywgMS4wLCBzbW9vdGhzdGVwKDAuMCwgMC4zMCwgZi55KSk7XG4gIGRpZmZ1c2VDb2xvci5yZ2IgKj0gbWl4KHZlYzMoMS4wKSwgc3RvbmUsIHZlcnQgKiBpc1N0b25lKTtcblxuICBmbG9hdCBneSA9IHNtb290aHN0ZXAoMC40NSwgMC44OCwgYWJzKG4ueSkpO1xuICBmbG9hdCBnMSA9IHZuMih2V1Bvcy54eiAqIDEuMzUpO1xuICBmbG9hdCBnMiA9IHZuMih2V1Bvcy54eiAqIDAuMTEpO1xuICB2ZWMzIGdyYXNzID0gbWl4KHZlYzMoMC44MiwgMC44NiwgMC43MiksIHZlYzMoMS4wNiwgMS4wNCwgMC45OCksIGcxICogMC40MiArIGcyICogMC40NiArIHZuMih2V1Bvcy54eiAqIDQuMykgKiAwLjEyKTtcbiAgZmxvYXQgY2VsbCA9IGgyMShmbG9vcih2V1Bvcy54eikgKyAxNy4wKTtcbiAgZ3Jhc3MgKj0gMC45NSArIDAuMTAgKiBjZWxsO1xuICBkaWZmdXNlQ29sb3IucmdiICo9IG1peCh2ZWMzKDEuMCksIGdyYXNzLCBneSAqIGlzR3Jhc3MpO1xufWApO1xufTtcblxuaW50ZXJmYWNlIE1lc2hSZXN1bHQgeyBnZW9tZXRyeTogVEhSRUUuQnVmZmVyR2VvbWV0cnk7IHRyaWFuZ2xlczogbnVtYmVyOyB9XG5cbi8qKiBCdWlsZCBhIEJ1ZmZlckdlb21ldHJ5IGZyb20gbWVzaGVyIG91dHB1dCAobWFpbiB0aHJlYWQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlb21ldHJ5RnJvbUFycmF5cyhhOiBNZXNoQXJyYXlzKTogTWVzaFJlc3VsdCB7XG4gIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJ1ZmZlckdlb21ldHJ5KCk7XG4gIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgncG9zaXRpb24nLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEucG9zaXRpb25zLCAzKSk7XG4gIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhLm5vcm1hbHMsIDMpKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYS5jb2xvcnMsIDMpKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdhTWF0JywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhLm1hdHMsIDEpKTtcbiAgZ2VvbWV0cnkuc2V0SW5kZXgobmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhLmluZGljZXMsIDEpKTtcbiAgZ2VvbWV0cnkuY29tcHV0ZUJvdW5kaW5nU3BoZXJlKCk7XG4gIHJldHVybiB7IGdlb21ldHJ5LCB0cmlhbmdsZXM6IGEudHJpYW5nbGVzIH07XG59XG5cbi8qKiBQYWRkZWQgdm9sdW1lIGZvciBhIHJlc2lkZW50IGNodW5rOyBuZWlnaGJvdXJzIGNvbWUgZnJvbSB0aGUgd29ybGQgKDN4MyBtdXN0IGJlIHJlc2lkZW50KS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYWRkZWRGb3Iod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgcmV0dXJuIGJ1aWxkUGFkZGVkKGNodW5rLmRhdGEsICh4LCB5LCB6KSA9PiBnZXRWb3hlbCh3b3JsZCwgb3ggKyB4LCBZX01JTiArIHksIG96ICsgeikpO1xufVxuXG4vKipcbiAqIEdyZWVkeSAzRCBmYWNlIG1lc2hlciAoc3luY2hyb25vdXMgcGF0aCkuIEEgZmFjZSBpcyBlbWl0dGVkIHdoZW4gYW4gb3BhcXVlXG4gKiB2b3hlbCB0b3VjaGVzIGEgbm9uLW9wYXF1ZSBjZWxsIChhaXIgb3Igd2F0ZXIpOyB3YXRlciBzdXJmYWNlcyBhcmUgbWVzaGVkXG4gKiBzZXBhcmF0ZWx5IGluIHdhdGVyLnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWVzaENodW5rKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiBNZXNoUmVzdWx0IHtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIHJldHVybiBnZW9tZXRyeUZyb21BcnJheXMobWVzaFBhZGRlZChwYWRkZWRGb3Iod29ybGQsIGNodW5rKSwgY2h1bmsuaGVpZ2h0cywgb3gsIG96LCB3b3JsZC5zZWVkKSk7XG59XG5cbi8qKlxuICogR3JpZCBsaW5lcyBvZiB0aGUgc2VhIHBsYW5lOiB0aGUgb3JpZ2luYWwgYHNlZ21lbnRzYCBsYXR0aWNlIG92ZXIgdGhlXG4gKiBpc2xhbmQgcGx1cyB0d28gY2VsbHMgb2YgbWFyZ2luIChzYW1lIHZlcnRpY2VzLCBzbyB0aGUgc2FtZSBjb2xvdXJzKSwgdGhlblxuICogbGluZXMgdGhhdCBkb3VibGUgdGhlaXIgc3BhY2luZyBvdXQgdG8gdGhlIHBsYW5lIGVkZ2UuIE9wZW4gb2NlYW4gZmFyXG4gKiBiZXlvbmQgdGhlIDIwNDggbSBpc2xhbmQgaXMgZmxhdCwgZm9nZ2VkIGFuZCBuZWVkcyBubyAyMDggbSB2ZXJ0ZXggZ3JpZDtcbiAqIHRoaXMga2VlcHMgdGhlIG5lYXIgcGF0dGVybiBhbmQgZHJvcHMgYWJvdXQgOTAlIG9mIHRoZSB0cmlhbmdsZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckdyaWRMaW5lcyhzaXplOiBudW1iZXIsIHNlZ21lbnRzOiBudW1iZXIpOiBudW1iZXJbXSB7XG4gIGNvbnN0IHNlZyA9IHNpemUgLyBzZWdtZW50cywgY29vcmQgPSAoazogbnVtYmVyKSA9PiAtc2l6ZSAvIDIgKyBrICogc2VnO1xuICBjb25zdCBpbm5lcjogbnVtYmVyW10gPSBbXTtcbiAgZm9yIChsZXQgayA9IDA7IGsgPD0gc2VnbWVudHM7IGsrKykgaWYgKE1hdGguYWJzKGNvb3JkKGspKSA8PSBIQUxGICsgMiAqIHNlZykgaW5uZXIucHVzaChrKTtcbiAgaWYgKGlubmVyLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFswLCBzZWdtZW50c10ubWFwKGNvb3JkKTtcbiAgY29uc3Qga2VlcCA9IG5ldyBTZXQoaW5uZXIpO1xuICBmb3IgKGxldCBrID0gaW5uZXJbMF0sIHMgPSAxOyBrID4gMDsgcyAqPSAyKSB7IGsgPSBNYXRoLm1heCgwLCBrIC0gcyk7IGtlZXAuYWRkKGspOyB9XG4gIGZvciAobGV0IGsgPSBpbm5lcltpbm5lci5sZW5ndGggLSAxXSwgcyA9IDE7IGsgPCBzZWdtZW50czsgcyAqPSAyKSB7IGsgPSBNYXRoLm1pbihzZWdtZW50cywgayArIHMpOyBrZWVwLmFkZChrKTsgfVxuICByZXR1cm4gWy4uLmtlZXBdLnNvcnQoKGEsIGIpID0+IGEgLSBiKS5tYXAoY29vcmQpO1xufVxuXG5mdW5jdGlvbiB3YXRlckdyaWRHZW9tZXRyeShzaXplOiBudW1iZXIsIHNlZ21lbnRzOiBudW1iZXIpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGxpbmVzID0gd2F0ZXJHcmlkTGluZXMoc2l6ZSwgc2VnbWVudHMpLCBuID0gbGluZXMubGVuZ3RoO1xuICBjb25zdCBwb3NpdGlvbnMgPSBuZXcgRmxvYXQzMkFycmF5KG4gKiBuICogMyksIG5vcm1hbHMgPSBuZXcgRmxvYXQzMkFycmF5KG4gKiBuICogMyk7XG4gIGZvciAobGV0IGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgIGNvbnN0IHYgPSAoaiAqIG4gKyBpKSAqIDM7XG4gICAgICBwb3NpdGlvbnNbdl0gPSBsaW5lc1tpXTsgcG9zaXRpb25zW3YgKyAyXSA9IGxpbmVzW2pdO1xuICAgICAgbm9ybWFsc1t2ICsgMV0gPSAxO1xuICAgIH1cbiAgfVxuICBjb25zdCBpbmRpY2VzOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBqID0gMDsgaiA8IG4gLSAxOyBqKyspIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG4gLSAxOyBpKyspIHtcbiAgICAgIGNvbnN0IGEgPSBqICogbiArIGksIGIgPSAoaiArIDEpICogbiArIGksIGMgPSBhICsgMSwgZCA9IGIgKyAxO1xuICAgICAgaW5kaWNlcy5wdXNoKGEsIGIsIGMsIGMsIGIsIGQpO1xuICAgIH1cbiAgfVxuICBjb25zdCBnZW8gPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZ2VvLnNldEF0dHJpYnV0ZSgncG9zaXRpb24nLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKHBvc2l0aW9ucywgMykpO1xuICBnZW8uc2V0QXR0cmlidXRlKCdub3JtYWwnLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKG5vcm1hbHMsIDMpKTtcbiAgZ2VvLnNldEluZGV4KGluZGljZXMpO1xuICBnZW8uY29tcHV0ZUJvdW5kaW5nU3BoZXJlKCk7XG4gIHJldHVybiBnZW87XG59XG5cbi8qKiBPbmUgb3BhcXVlIHNlYS1sZXZlbCBzdXJmYWNlIGZvciB0aGUgd2hvbGUgdmlldy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFdhdGVyU3VyZmFjZSh3b3JsZDogV29ybGQsIHNpemUgPSAyMDAwMCwgc2VnbWVudHMgPSA5Nik6IFRIUkVFLk1lc2gge1xuICBjb25zdCBnZW8gPSB3YXRlckdyaWRHZW9tZXRyeShzaXplLCBzZWdtZW50cyk7XG4gIGNvbnN0IHBvcyA9IGdlby5hdHRyaWJ1dGVzLnBvc2l0aW9uO1xuICBjb25zdCBjb2xvcnMgPSBuZXcgRmxvYXQzMkFycmF5KHBvcy5jb3VudCAqIDMpO1xuICBjb25zdCB0bXAgPSBuZXcgVEhSRUUuQ29sb3IoKTtcbiAgY29uc3Qgc21vb3Roc3RlcCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgeDogbnVtYmVyKSA9PiB7XG4gICAgY29uc3QgdCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEsICh4IC0gYSkgLyAoYiAtIGEpKSk7XG4gICAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG4gIH07XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcG9zLmNvdW50OyBpKyspIHtcbiAgICBjb25zdCB4ID0gcG9zLmdldFgoaSksIHogPSBwb3MuZ2V0WihpKTtcbiAgICAvLyBUaGUgd2F0ZXIgcGxhbmUgc2FtcGxlcyB0aGUgc2VhYmVkIG9ubHkgZm9yIGEgbmFycm93IHNob3JlIHJpbS4gQSBkZXB0aFxuICAgIC8vIHJhbXAgb24gYSA0NyBtIGdyaWQgbWlzc2VkIHRoZSAxMCBtIHJpdmVyIGVudGlyZWx5IGFuZCB0dXJuZWQgaXQgd2hpdGU7XG4gICAgLy8gdGhlIHJpdmVyIGFuZCBsYWtlIHJlYWQgYmV0dGVyIGFzIHRoZSBzYW1lIGRlZXAgd2F0ZXIgYXMgdGhlIHNlYS5cbiAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBNYXRoLnJvdW5kKHgpLCBNYXRoLnJvdW5kKHopKTtcbiAgICBjb25zdCBzaG9yZSA9IHNtb290aHN0ZXAoLTAuOSwgLTAuMTUsIGgpICogKDEgLSBzbW9vdGhzdGVwKC0wLjE1LCAwLjQsIGgpKTtcbiAgICBjb25zdCBuID0gaGFzaDJpKE1hdGguZmxvb3IoeCAvIDQ1KSwgTWF0aC5mbG9vcih6IC8gNDUpLCB3b3JsZC5zZWVkICsgNTAxKTtcbiAgICB0bXAuY29weShDT0wud2F0ZXJNaWQpLmxlcnAoQ09MLndhdGVyRGVlcCwgMC4zNSArIDAuMzUgKiBuKTtcbiAgICAvLyBBIHdlYWsgc2hvcmUgdGludC4gQSBzdHJvbmcgb25lLCBzYW1wbGVkIG9uIGEgY29hcnNlIHBsYW5lLCBwcm9kdWNlZFxuICAgIC8vIHBhbGUgcmVjdGFuZ2xlcyBvdmVyIG9mZnNob3JlIHNlYW1vdW50cyBpbiB0aGUgbWFwIHZpZXcuXG4gICAgdG1wLmxlcnAoQ09MLndhdGVyUmltLCBzaG9yZSAqIDAuMTUpO1xuICAgIGNvbG9yc1tpICogM10gPSB0bXAucjsgY29sb3JzW2kgKiAzICsgMV0gPSB0bXAuZzsgY29sb3JzW2kgKiAzICsgMl0gPSB0bXAuYjtcbiAgfVxuICBnZW8uc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoY29sb3JzLCAzKSk7XG4gIC8vIE9wYXF1ZTogdGhlIHNlYS1sZXZlbCBzdXJmYWNlIGlzIHRoZSB3YXRlciByZWFkLiBBIHRyYW5zbHVjZW50IHBsYW5lIGxldFxuICAvLyB0aGUgbWFjcm8gc2VhYmVkIHNob3cgdGhyb3VnaCwgd2hpY2ggbWFkZSB0aGUgZmluaXRlIDIwNDggbSB3b3JsZCBlZGdlXG4gIC8vIHZpc2libGUgYXMgYSBzcXVhcmUgaW4gdGhlIGZpcnN0IE0wMDEgbWFwIGNhcHR1cmUuXG4gIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW8sIG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICB2ZXJ0ZXhDb2xvcnM6IHRydWUsXG4gIH0pKTtcbiAgbWVzaC5wb3NpdGlvbi55ID0gLTAuMDY7XG4gIG1lc2gucmVuZGVyT3JkZXIgPSAxO1xuICBtZXNoLm5hbWUgPSAnd2F0ZXJfc3VyZmFjZSc7XG4gIG1lc2gucmVjZWl2ZVNoYWRvdyA9IGZhbHNlO1xuICByZXR1cm4gbWVzaDtcbn1cblxuaW50ZXJmYWNlIE1hY3JvSG9sZSB7IG1pblg6IG51bWJlcjsgbWF4WDogbnVtYmVyOyBtaW5aOiBudW1iZXI7IG1heFo6IG51bWJlcjsgfVxuLyoqXG4gKiBEaXN0YW5jZSB0aWVycyBvZiB0aGUgd29ybGQtdmlldyBtYWNybyBtZXNoLiBDZWxscyB3aXRoaW4gYGZpbmVgIG1ldHJlc1xuICogKENoZWJ5c2hldiBkaXN0YW5jZSBvZiB0aGVpciBibG9jayBmcm9tIHRoZSBmb2N1cykga2VlcCB0aGUgYmFzZSBzdGVwLFxuICogY2VsbHMgd2l0aGluIGBtaWRgIG1ldHJlcyBtZXJnZSAyeDIsIGNlbGxzIGJleW9uZCBtZXJnZSA0eDQuIEJsb2NrcyBhcmVcbiAqIDQgYmFzZSBjZWxscyB3aWRlLCBzbyB0aWVyIGJvdW5kYXJpZXMgbmV2ZXIgc3BsaXQgYSBjb2Fyc2UgY2VsbC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBNYWNyb1RpZXJzIHsgZmluZTogbnVtYmVyOyBtaWQ6IG51bWJlciB9XG5leHBvcnQgY29uc3QgREVGQVVMVF9NQUNST19USUVSUzogTWFjcm9UaWVycyA9IHsgZmluZTogNDQ4LCBtaWQ6IDg5NiB9O1xuLyoqIFNpZGUgKG0pIG9mIGEgd29ybGQtdmlldyBtYWNybyB0aWxlOyB0aWxlcyBvdXRzaWRlIHRoZSBjYW1lcmEgZnJ1c3R1bSBhcmUgbm90IGRyYXduLiAqL1xuZXhwb3J0IGNvbnN0IE1BQ1JPX1RJTEUgPSAyNTY7XG5cbmludGVyZmFjZSBNYWNyb09wdGlvbnMge1xuICBzdGVwOiBudW1iZXI7XG4gIC8qKiBSZWN0YW5ndWxhciBob2xlIGNvdmVyZWQgYnkgdGhlIG5lYXIgMSBtIGNodW5rIHJpbmcuICovXG4gIGhvbGU/OiBNYWNyb0hvbGU7XG4gIC8qKiBXb3JsZCB2aWV3IGZvY3VzOyB3aXRoIGl0LCBmYXIgY2VsbHMgdXNlIGNvYXJzZXIgdGllcnMgKG1hcCBtb2RlIHBhc3NlcyBub25lKS4gKi9cbiAgZm9jdXM/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHRpZXJzPzogTWFjcm9UaWVycztcbn1cblxuaW50ZXJmYWNlIE1hY3JvUmVzdWx0IHtcbiAgLyoqIFRoZSB3aG9sZSBtZXNoIHdoZW4gdW50aWxlZCAobm8gZm9jdXMpOyBvdGhlcndpc2UgdGhlIGZpcnN0IHRpbGUuICovXG4gIG1lc2g6IFRIUkVFLk1lc2g7XG4gIC8qKiBFdmVyeSB0aWxlIG1lc2ggKG9uZSB3aGVuIHVudGlsZWQpLCBlYWNoIHdpdGggYSBib3VuZGluZyBib3ggZm9yIGN1bGxpbmcuICovXG4gIG1lc2hlczogVEhSRUUuTWVzaFtdO1xuICB0cmlhbmdsZXM6IG51bWJlcjtcbiAgc2FtcGxlTXM6IG51bWJlcjtcbiAgdG90YWxNczogbnVtYmVyO1xuICBzYW1wbGVDYWNoZWQ6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBNYWNyb1NhbXBsZUNhY2hlIHtcbiAgTjogbnVtYmVyO1xuICBoZWlnaHRzOiBJbnQxNkFycmF5O1xuICB0b3BzOiBVaW50OEFycmF5O1xuICB1bmRlcndhdGVyOiBVaW50OEFycmF5O1xuICBzYW1wbGVNczogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1hY3JvVGVycmFpblNhbXBsZSB7IHg6IG51bWJlcjsgejogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgdG9wOiBNYXRJZDsgdW5kZXJ3YXRlcjogYm9vbGVhbjsgfVxuXG4vLyBDYWNoZSB0aGUgZGV0ZXJtaW5pc3RpYyBiYXNlIGdyaWQgYW5kIHRoZSBhdXRob3JpdGF0aXZlIGVkaXRlZCBncmlkIHNlcGFyYXRlbHkuXG4vLyBCYXNlIGVudHJpZXMgbmV2ZXIgbmVlZCBpbnZhbGlkYXRpb24uIEVkaXRlZCBlbnRyaWVzIGFyZSBzY29wZWQgYnkgV29ybGQgaWRlbnRpdHlcbi8vICh0d28gc2FtZS1zZWVkIHdvcmxkcyBjYW4gaGF2ZSBkaWZmZXJlbnQgZWRpdHMpIGFuZCBieSBib3RoIHRoZSBjb2Fyc2UgZWRpdFxuLy8gcmV2aXNpb24gYW5kIGNodW5rIHN0cmVhbWluZywgc2luY2UgZXZpY3RpbmcvcmVnZW5lcmF0aW5nIGRhdGEgYW5kIHNuYXBzaG90XG4vLyByZXN0b3JhdGlvbiBkbyBub3QgbmVjZXNzYXJpbHkgcHJvZHVjZSBhIG5ldyBjb2Fyc2UgcmV2aXNpb24uIE9ubHkgY2h1bmtzIHdpdGhcbi8vIGR1cmFibGUgdm94ZWwgZGVsdGFzIGFyZSBtYXRlcmlhbGl6ZWQ7IHRoZSBvdGhlciA2NHg2NCBjZWxscyByZW1haW4gYmFzZSBzYW1wbGVzLlxuaW50ZXJmYWNlIE1hY3JvV29ybGRDYWNoZXMge1xuICBiYXNlOiBNYXA8bnVtYmVyLCBNYWNyb1NhbXBsZUNhY2hlPjtcbiAgZWRpdGVkOiBNYXA8c3RyaW5nLCBNYWNyb1NhbXBsZUNhY2hlPjtcbiAgLyoqIFNwYXJzZSBhdXRob3JpdGF0aXZlIGNvbHVtbnMsIGluZGVwZW5kZW50IG9mIHRoZSBtZXNoIHNhbXBsaW5nIHJlc29sdXRpb24uICovXG4gIGNvbHVtbnM6IE1hcDxzdHJpbmcsIE1hcDxudW1iZXIsIHsgaGVpZ2h0OiBudW1iZXI7IHRvcDogTWF0SWQgfT4+O1xuICByZXZpc2lvbjogbnVtYmVyO1xufVxuY29uc3QgbWFjcm9TYW1wbGVDYWNoZSA9IG5ldyBXZWFrTWFwPFdvcmxkLCBNYWNyb1dvcmxkQ2FjaGVzPigpO1xuXG5mdW5jdGlvbiBzeW5jTWFjcm9Db2x1bW5zKHdvcmxkOiBXb3JsZCwgY2FjaGVzOiBNYWNyb1dvcmxkQ2FjaGVzKTogdm9pZCB7XG4gIGlmICh3b3JsZC5yZXZpc2lvbiA9PT0gY2FjaGVzLnJldmlzaW9uKSByZXR1cm47XG4gIC8vIFNuYXBzaG90IHJlc3RvcmUgcmVwbGFjZXMgZWRpdHMgYW5kIGNodW5rcyBiZWZvcmUgYXNzaWduaW5nIGl0cyBzYXZlZFxuICAvLyByZXZpc2lvbi4gTmV2ZXIgbWl4IHJlbWVtYmVyZWQgY29sdW1ucyBmcm9tIHRoYXQgcHJldmlvdXMgd29ybGQgc3RhdGUuXG4gIGNhY2hlcy5jb2x1bW5zLmNsZWFyKCk7XG4gIC8vIEEgbm9ybWFsIGVkaXQgaGFzIGFscmVhZHkgdXBkYXRlZCB0aGUgbG9hZGVkIGNodW5rLCBzbyBpdCBjb3N0cyBvbmx5IHRoZVxuICAvLyBlZGl0ZWQgY2h1bmtzLiBSZXN0b3JlZC9ldmljdGVkIGVkaXRlZCBjaHVua3MgYXJlIGdlbmVyYXRlZCBvbiBkZW1hbmQuXG4gIGZvciAoY29uc3QgW2tleSwgZWRpdHNdIG9mIHdvcmxkLmVkaXRzKSB7XG4gICAgaWYgKCFlZGl0cy5zaXplIHx8ICF3b3JsZC5jaHVua3MuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpITtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBjb2x1bW5zID0gbmV3IE1hcDxudW1iZXIsIHsgaGVpZ2h0OiBudW1iZXI7IHRvcDogTWF0SWQgfT4oKTtcbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICAgIGNvbHVtbnMuc2V0KChveCArIGx4ICsgSEFMRikgKiBXT1JMRF9TSVpFICsgb3ogKyBseiArIEhBTEYsIHtcbiAgICAgICAgICBoZWlnaHQ6IGNodW5rLmhlaWdodHNbY29sXSArIFlfTUlOICsgMSxcbiAgICAgICAgICB0b3A6IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdIGFzIE1hdElkLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgY2FjaGVzLmNvbHVtbnMuc2V0KGtleSwgY29sdW1ucyk7XG4gIH1cbiAgY2FjaGVzLmVkaXRlZC5jbGVhcigpO1xuICBjYWNoZXMucmV2aXNpb24gPSB3b3JsZC5yZXZpc2lvbjtcbn1cblxuZnVuY3Rpb24gbWFjcm9Db2x1bW4od29ybGQ6IFdvcmxkLCBjYWNoZXM6IE1hY3JvV29ybGRDYWNoZXMsIGtleTogc3RyaW5nLCBpbmRleDogbnVtYmVyKSB7XG4gIGxldCBjb2x1bW5zID0gY2FjaGVzLmNvbHVtbnMuZ2V0KGtleSk7XG4gIGlmIChjb2x1bW5zKSByZXR1cm4gY29sdW1ucy5nZXQoaW5kZXgpO1xuICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICBpZiAoIWVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opKSByZXR1cm4gdW5kZWZpbmVkO1xuICAvLyBDYXB0dXJlIG9uY2UgYWZ0ZXIgbG9hZGluZy4gTG9hZGVkIGNodW5rcyBhcmUgY2hlYXAgYW5kIGRvIG5vdCByZXF1aXJlXG4gIC8vIHdhbGtpbmcgZXZlcnkgdm94ZWw7IHRoaXMgcmVtYWlucyBPKDMyeDMyKSBwZXIgZWRpdGVkIGNodW5rLlxuICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KSE7XG4gIGNvbHVtbnMgPSBuZXcgTWFwKCk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbHVtbnMuc2V0KChveCArIGx4ICsgSEFMRikgKiBXT1JMRF9TSVpFICsgb3ogKyBseiArIEhBTEYsIHtcbiAgICAgICAgaGVpZ2h0OiBjaHVuay5oZWlnaHRzW2NvbF0gKyBZX01JTiArIDEsXG4gICAgICAgIHRvcDogY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gYXMgTWF0SWQsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgY2FjaGVzLmNvbHVtbnMuc2V0KGtleSwgY29sdW1ucyk7XG4gIHJldHVybiBjb2x1bW5zLmdldChpbmRleCk7XG59XG5cbmNvbnN0IG1hY3JvRWRpdEtleU1lbW8gPSBuZXcgV2Vha01hcDxXb3JsZCwgeyB2ZXJzaW9uOiBudW1iZXI7IGtleTogc3RyaW5nIH0+KCk7XG5cbi8qKiBNZW1vaXplZCBieSB0aGUgd29ybGQncyBlZGl0IHZlcnNpb246IE8oMSkgcGVyIGZyYW1lIHVubGVzcyBlZGl0cyBjaGFuZ2VkLiAqL1xuZnVuY3Rpb24gbWFjcm9FZGl0S2V5KHdvcmxkOiBXb3JsZCk6IHN0cmluZyB7XG4gIGNvbnN0IHZlcnNpb24gPSBlZGl0VmVyc2lvbih3b3JsZCk7XG4gIGNvbnN0IG1lbW8gPSBtYWNyb0VkaXRLZXlNZW1vLmdldCh3b3JsZCk7XG4gIGlmIChtZW1vICYmIG1lbW8udmVyc2lvbiA9PT0gdmVyc2lvbikgcmV0dXJuIG1lbW8ua2V5O1xuICBjb25zdCBrZXkgPSBjb21wdXRlTWFjcm9FZGl0S2V5KHdvcmxkKTtcbiAgbWFjcm9FZGl0S2V5TWVtby5zZXQod29ybGQsIHsgdmVyc2lvbiwga2V5IH0pO1xuICByZXR1cm4ga2V5O1xufVxuXG5mdW5jdGlvbiBjb21wdXRlTWFjcm9FZGl0S2V5KHdvcmxkOiBXb3JsZCk6IHN0cmluZyB7XG4gIC8vIEluY2x1ZGUgYSBjb21tdXRhdGl2ZSBjb250ZW50IGZpbmdlcnByaW50IGFzIHdlbGwgYXMgY291bnQ6IGV2aWN0aW9uIGFuZFxuICAvLyBzbmFwc2hvdCByZXN0b3JlIGJ5cGFzcyB0aGUgY29hcnNlIFdvcmxkLnJldmlzaW9uIHBhdGgsIGFuZCBhIHJlc3RvcmVkXG4gIC8vIGRlbHRhIGNhbiBoYXZlIHRoZSBzYW1lIG51bWJlciBvZiBjZWxscyB3aXRoIGRpZmZlcmVudCBpbmRpY2VzL21hdGVyaWFscy5cbiAgcmV0dXJuIFsuLi53b3JsZC5lZGl0cy5lbnRyaWVzKCldXG4gICAgLmZpbHRlcigoWywgZWRpdHNdKSA9PiBlZGl0cy5zaXplID4gMClcbiAgICAubWFwKChba2V5LCBlZGl0c10pID0+IHtcbiAgICAgIGxldCBzdW0gPSAwO1xuICAgICAgbGV0IG1peGVkID0gMDtcbiAgICAgIGZvciAoY29uc3QgW2luZGV4LCBtYXRlcmlhbF0gb2YgZWRpdHMpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBNYXRoLmltdWwoaW5kZXggKyAxLCAzMSkgKyBtYXRlcmlhbDtcbiAgICAgICAgc3VtID0gKHN1bSArIHZhbHVlKSB8IDA7XG4gICAgICAgIG1peGVkID0gKG1peGVkIF4gTWF0aC5pbXVsKHZhbHVlLCAweDQ1ZDlmM2IpKSB8IDA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYCR7a2V5fToke2VkaXRzLnNpemV9OiR7c3VtfToke21peGVkfWA7XG4gICAgfSlcbiAgICAuc29ydCgpXG4gICAgLmpvaW4oJ3wnKTtcbn1cblxuZnVuY3Rpb24gZWRpdGVkTWFjcm9TYW1wbGVzKHdvcmxkOiBXb3JsZCwgc3RlcDogbnVtYmVyLCBjYWNoZTogTWFjcm9TYW1wbGVDYWNoZSk6IE1hY3JvU2FtcGxlQ2FjaGUge1xuICBjb25zdCBjYWNoZXMgPSBtYWNyb1NhbXBsZUNhY2hlLmdldCh3b3JsZCkhO1xuICBjb25zdCBrZXkgPSBgJHtzdGVwfToke21hY3JvRWRpdEtleSh3b3JsZCl9YDtcbiAgY29uc3QgY2FjaGVkID0gY2FjaGVzLmVkaXRlZC5nZXQoa2V5KTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGNhY2hlZDtcblxuICBmb3IgKGNvbnN0IFtjaHVuaywgZWRpdHNdIG9mIHdvcmxkLmVkaXRzKSB7XG4gICAgaWYgKGVkaXRzLnNpemUgJiYgIWNhY2hlcy5jb2x1bW5zLmhhcyhjaHVuaykpIG1hY3JvQ29sdW1uKHdvcmxkLCBjYWNoZXMsIGNodW5rLCAwKTtcbiAgfVxuXG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IHsgTiwgaGVpZ2h0cywgdG9wcywgdW5kZXJ3YXRlciB9ID0gY2FjaGU7XG4gIGNvbnN0IHNhbXBsZSA9IHtcbiAgICBOLFxuICAgIGhlaWdodHM6IG5ldyBJbnQxNkFycmF5KGhlaWdodHMpLFxuICAgIHRvcHM6IG5ldyBVaW50OEFycmF5KHRvcHMpLFxuICAgIHVuZGVyd2F0ZXI6IG5ldyBVaW50OEFycmF5KHVuZGVyd2F0ZXIpLFxuICAgIHNhbXBsZU1zOiBjYWNoZS5zYW1wbGVNcyxcbiAgfTtcbiAgZm9yIChsZXQgaiA9IDA7IGogPCBOOyBqKyspIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgY29uc3QgeCA9IE1hdGgucm91bmQoLUhBTEYgKyAoaSArIDAuNSkgKiBzdGVwKTtcbiAgICAgIGNvbnN0IHogPSBNYXRoLnJvdW5kKC1IQUxGICsgKGogKyAwLjUpICogc3RlcCk7XG4gICAgICBjb25zdCBjaHVuayA9IGNodW5rS2V5KHdvcmxkVG9DaHVua1goeCksIHdvcmxkVG9DaHVua1ooeikpO1xuICAgICAgaWYgKCF3b3JsZC5lZGl0cy5nZXQoY2h1bmspPy5zaXplKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGlkeCA9IGogKiBOICsgaTtcbiAgICAgIGNvbnN0IGVkaXRlZCA9IG1hY3JvQ29sdW1uKHdvcmxkLCBjYWNoZXMsIGNodW5rLCAoeCArIEhBTEYpICogV09STERfU0laRSArIHogKyBIQUxGKTtcbiAgICAgIGlmICghZWRpdGVkKSBjb250aW51ZTtcbiAgICAgIHNhbXBsZS5oZWlnaHRzW2lkeF0gPSBlZGl0ZWQuaGVpZ2h0O1xuICAgICAgc2FtcGxlLnRvcHNbaWR4XSA9IGVkaXRlZC50b3A7XG4gICAgICBzYW1wbGUudW5kZXJ3YXRlcltpZHhdID0gc2FtcGxlLmhlaWdodHNbaWR4XSA8IFNFQV9MRVZFTCA/IDEgOiAwO1xuICAgIH1cbiAgfVxuICBzYW1wbGUuc2FtcGxlTXMgPSBwZXJmb3JtYW5jZS5ub3coKSAtIHQwO1xuICBjYWNoZXMuZWRpdGVkLnNldChrZXksIHNhbXBsZSk7XG4gIHJldHVybiBzYW1wbGU7XG59XG5cbmZ1bmN0aW9uIG1hY3JvU2FtcGxlcyh3b3JsZDogV29ybGQsIHN0ZXA6IG51bWJlcik6IE1hY3JvU2FtcGxlQ2FjaGUge1xuICBsZXQgY2FjaGVzID0gbWFjcm9TYW1wbGVDYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlcykge1xuICAgIGNhY2hlcyA9IHsgYmFzZTogbmV3IE1hcCgpLCBlZGl0ZWQ6IG5ldyBNYXAoKSwgY29sdW1uczogbmV3IE1hcCgpLCByZXZpc2lvbjogLTEgfTtcbiAgICBtYWNyb1NhbXBsZUNhY2hlLnNldCh3b3JsZCwgY2FjaGVzKTtcbiAgfVxuICBzeW5jTWFjcm9Db2x1bW5zKHdvcmxkLCBjYWNoZXMpO1xuICBjb25zdCBjYWNoZWQgPSBjYWNoZXMuYmFzZS5nZXQoc3RlcCk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBlZGl0ZWRNYWNyb1NhbXBsZXMod29ybGQsIHN0ZXAsIGNhY2hlZCk7XG5cbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgTiA9IE1hdGguY2VpbChXT1JMRF9TSVpFIC8gc3RlcCk7XG4gIGNvbnN0IGhlaWdodHMgPSBuZXcgSW50MTZBcnJheShOICogTik7XG4gIGNvbnN0IHRvcHMgPSBuZXcgVWludDhBcnJheShOICogTik7XG4gIGNvbnN0IHVuZGVyd2F0ZXIgPSBuZXcgVWludDhBcnJheShOICogTik7XG4gIGNvbnN0IGNlbGxYID0gKGk6IG51bWJlcikgPT4gLUhBTEYgKyAoaSArIDAuNSkgKiBzdGVwO1xuICBjb25zdCBjZWxsWiA9IChqOiBudW1iZXIpID0+IC1IQUxGICsgKGogKyAwLjUpICogc3RlcDtcblxuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCB4ID0gY2VsbFgoaSksIHogPSBjZWxsWihqKTtcbiAgICAgIGNvbnN0IGggPSBiYXNlSGVpZ2h0QXQod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIE1hdGgucm91bmQoeCksIE1hdGgucm91bmQoeikpO1xuICAgICAgY29uc3QgaWR4ID0gaiAqIE4gKyBpO1xuICAgICAgaGVpZ2h0c1tpZHhdID0gaDtcbiAgICAgIGlmIChoIDwgU0VBX0xFVkVMKSB1bmRlcndhdGVyW2lkeF0gPSAxO1xuICAgIH1cbiAgfVxuXG4gIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgIGNvbnN0IGlkeCA9IGogKiBOICsgaTtcbiAgICAgIGlmICh1bmRlcndhdGVyW2lkeF0pIGNvbnRpbnVlO1xuICAgICAgY29uc3QgaCA9IGhlaWdodHNbaWR4XTtcbiAgICAgIGNvbnN0IHggPSBjZWxsWChpKSwgeiA9IGNlbGxaKGopO1xuICAgICAgbGV0IHNsb3BlID0gMDtcbiAgICAgIGxldCBuZWFyV2F0ZXIgPSBmYWxzZTtcbiAgICAgIGNvbnN0IG5zID0gW1stMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWzAsIDFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2YgbnMpIHtcbiAgICAgICAgY29uc3QgbnggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihOIC0gMSwgaSArIGR4KSk7XG4gICAgICAgIGNvbnN0IG56ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oTiAtIDEsIGogKyBkeikpO1xuICAgICAgICBjb25zdCBuaCA9IGhlaWdodHNbbnogKiBOICsgbnhdO1xuICAgICAgICBzbG9wZSA9IE1hdGgubWF4KHNsb3BlLCBNYXRoLmFicyhoIC0gbmgpKTtcbiAgICAgICAgaWYgKG5oIDwgU0VBX0xFVkVMICsgMSkgbmVhcldhdGVyID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIHRvcHNbaWR4XSA9IGJhc2VUb3BNYXRlcmlhbEZvcih3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICAgICAgTWF0aC5yb3VuZCh4KSwgTWF0aC5yb3VuZCh6KSwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY2FjaGU6IE1hY3JvU2FtcGxlQ2FjaGUgPSB7XG4gICAgTiwgaGVpZ2h0cywgdG9wcywgdW5kZXJ3YXRlcixcbiAgICBzYW1wbGVNczogcGVyZm9ybWFuY2Uubm93KCkgLSB0MCxcbiAgfTtcbiAgY2FjaGVzLmJhc2Uuc2V0KHN0ZXAsIGNhY2hlKTtcbiAgcmV0dXJuIGVkaXRlZE1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCwgY2FjaGUpO1xufVxuXG4vKiogQXV0aG9yaXRhdGl2ZSBtYWNyby1ncmlkIHZhbHVlIGF0IGEgd29ybGQgY29sdW1uIChzdGVwIGRlZmF1bHRzIHRvIDggbSkuICovXG5leHBvcnQgZnVuY3Rpb24gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHN0ZXAgPSA4KTogTWFjcm9UZXJyYWluU2FtcGxlIHtcbiAgY29uc3QgY2FjaGUgPSBtYWNyb1NhbXBsZXMod29ybGQsIHN0ZXApO1xuICBjb25zdCBpID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oY2FjaGUuTiAtIDEsIE1hdGguZmxvb3IoKHggKyBIQUxGKSAvIHN0ZXApKSk7XG4gIGNvbnN0IGogPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjYWNoZS5OIC0gMSwgTWF0aC5mbG9vcigoeiArIEhBTEYpIC8gc3RlcCkpKTtcbiAgY29uc3QgaWR4ID0gaiAqIGNhY2hlLk4gKyBpO1xuICByZXR1cm4ge1xuICAgIHg6IC1IQUxGICsgKGkgKyAwLjUpICogc3RlcCxcbiAgICB6OiAtSEFMRiArIChqICsgMC41KSAqIHN0ZXAsXG4gICAgaGVpZ2h0OiBjYWNoZS5oZWlnaHRzW2lkeF0sIHRvcDogY2FjaGUudG9wc1tpZHhdIGFzIE1hdElkLFxuICAgIHVuZGVyd2F0ZXI6IGNhY2hlLnVuZGVyd2F0ZXJbaWR4XSAhPT0gMCxcbiAgfTtcbn1cblxuLyoqXG4gKiBGYXIgbGFuZHNjYXBlIExPRCBkZXJpdmVkIGZyb20gdGhlIHNhbWUgZGV0ZXJtaW5pc3RpYyBzdXJmYWNlIHNhbXBsZXIuXG4gKiBDZWxscyBiZWxvdyBzZWEgbGV2ZWwgYXJlIG9taXR0ZWQ6IHRoZSBvcGFxdWUgd2F0ZXIgc3VyZmFjZSBpcyB0aGUgb25seVxuICogd2F0ZXIgcmVhZCwgc28gdGhlIGZpbml0ZSAyMDQ4IG0gd29ybGQgY2Fubm90IGFwcGVhciBhcyBhIHNxdWFyZSBzZWFiZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZE1hY3JvTWVzaCh3b3JsZDogV29ybGQsIG9wdHM6IE1hY3JvT3B0aW9ucyk6IE1hY3JvUmVzdWx0IHtcbiAgY29uc3QgdG90YWxUMCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCB7IHN0ZXAsIGhvbGUgfSA9IG9wdHM7XG4gIGNvbnN0IGNhY2hlS2V5ID0gYCR7c3RlcH06JHttYWNyb0VkaXRLZXkod29ybGQpfWA7XG4gIGNvbnN0IHNhbXBsZUNhY2hlZCA9IG1hY3JvU2FtcGxlQ2FjaGUuZ2V0KHdvcmxkKT8uZWRpdGVkLmhhcyhjYWNoZUtleSkgPz8gZmFsc2U7XG4gIGNvbnN0IGNhY2hlID0gbWFjcm9TYW1wbGVzKHdvcmxkLCBzdGVwKTtcbiAgY29uc3QgeyBOLCBoZWlnaHRzLCB0b3BzLCB1bmRlcndhdGVyIH0gPSBjYWNoZTtcbiAgY29uc3QgaG9sZUNlbGwgPSBuZXcgVWludDhBcnJheShOICogTik7XG4gIGNvbnN0IGNlbGxYID0gKGk6IG51bWJlcikgPT4gLUhBTEYgKyAoaSArIDAuNSkgKiBzdGVwO1xuICBjb25zdCBjZWxsWiA9IChqOiBudW1iZXIpID0+IC1IQUxGICsgKGogKyAwLjUpICogc3RlcDtcblxuICBpZiAoaG9sZSkge1xuICAgIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgICBjb25zdCB4ID0gY2VsbFgoaSksIHogPSBjZWxsWihqKTtcbiAgICAgICAgaWYgKHggPiBob2xlLm1pblggJiYgeCA8IGhvbGUubWF4WCAmJiB6ID4gaG9sZS5taW5aICYmIHogPCBob2xlLm1heFopIHtcbiAgICAgICAgICBob2xlQ2VsbFtqICogTiArIGldID0gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHNhbXBsZU1zID0gc2FtcGxlQ2FjaGVkID8gMCA6IGNhY2hlLnNhbXBsZU1zO1xuICAvLyBXaXRoIGEgZm9jdXMgdGhlIG1lc2ggaXMgc3BsaXQgaW50byBNQUNST19USUxFIHNxdWFyZSB0aWxlcyBzbyB0aGUgdmlld1xuICAvLyBjYW4gc2tpcCB0aWxlcyBvdXRzaWRlIHRoZSBjYW1lcmEgZnJ1c3R1bSAoVm94ZWxUZXJyYWluVmlldy5jdWxsTWFjcm8pLlxuICAvLyBXaXRob3V0IG9uZSAobWFwIG1vZGUsIHRlc3RzKSBpdCBzdGF5cyBhIHNpbmdsZSBtZXNoLlxuICBjb25zdCB0aWxlQ2VsbHMgPSBvcHRzLmZvY3VzID8gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChNQUNST19USUxFIC8gc3RlcCkpIDogTjtcbiAgY29uc3QgdGlsZXNQZXJTaWRlID0gTWF0aC5jZWlsKE4gLyB0aWxlQ2VsbHMpO1xuICB0eXBlIFRpbGVCdWZmZXJzID0geyBwb3NpdGlvbnM6IG51bWJlcltdOyBub3JtYWxzOiBudW1iZXJbXTsgY29sb3JzOiBudW1iZXJbXTsgaW5kaWNlczogbnVtYmVyW10gfTtcbiAgY29uc3QgdGlsZUJ1ZmZlcnM6IFRpbGVCdWZmZXJzW10gPSBbXTtcbiAgZm9yIChsZXQgdCA9IDA7IHQgPCB0aWxlc1BlclNpZGUgKiB0aWxlc1BlclNpZGU7IHQrKykgdGlsZUJ1ZmZlcnMucHVzaCh7IHBvc2l0aW9uczogW10sIG5vcm1hbHM6IFtdLCBjb2xvcnM6IFtdLCBpbmRpY2VzOiBbXSB9KTtcbiAgbGV0IGJ1ZiA9IHRpbGVCdWZmZXJzWzBdO1xuXG4gIGNvbnN0IHB1c2hRdWFkID0gKHA6IG51bWJlcltdW10sIG46IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSwgY29sb3I6IFRIUkVFLkNvbG9yKSA9PiB7XG4gICAgY29uc3QgeyBwb3NpdGlvbnMsIG5vcm1hbHMsIGNvbG9ycywgaW5kaWNlcyB9ID0gYnVmO1xuICAgIGNvbnN0IGJhc2UgPSBwb3NpdGlvbnMubGVuZ3RoIC8gMztcbiAgICBmb3IgKGNvbnN0IHYgb2YgcCkge1xuICAgICAgcG9zaXRpb25zLnB1c2godlswXSwgdlsxXSwgdlsyXSk7XG4gICAgICBub3JtYWxzLnB1c2goblswXSwgblsxXSwgblsyXSk7XG4gICAgICBjb2xvcnMucHVzaChjb2xvci5yLCBjb2xvci5nLCBjb2xvci5iKTtcbiAgICB9XG4gICAgaW5kaWNlcy5wdXNoKGJhc2UsIGJhc2UgKyAxLCBiYXNlICsgMiwgYmFzZSwgYmFzZSArIDIsIGJhc2UgKyAzKTtcbiAgfTtcblxuICBjb25zdCBjZWxsU2hhZGUgPSAoaTogbnVtYmVyLCBqOiBudW1iZXIpID0+IDAuOTQgKyAwLjEyICogaGFzaDJpKGksIGosIHdvcmxkLnNlZWQgKyA0MDEpO1xuXG4gIGNvbnN0IHRvcENvbG9yID0gKHRvcDogTWF0SWQsIGg6IG51bWJlciwgaTogbnVtYmVyLCBqOiBudW1iZXIpOiBUSFJFRS5Db2xvciA9PiB7XG4gICAgY29uc3Qgc2hhZGUgPSBjZWxsU2hhZGUoaSwgaik7XG4gICAgY29uc3QgbW9pc3QgPSBmYm0yKGNlbGxYKGkpIC8gMTMwLCBjZWxsWihqKSAvIDEzMCwgd29ybGQuc2VlZCArIDYwMSwgMyk7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBDT0wuc2FuZC5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKHNoYWRlICogMC45MCk7XG4gICAgaWYgKHRvcCA9PT0gTUFULkdSQVZFTCkgcmV0dXJuIENPTC5ncmF2ZWwuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihzaGFkZSk7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNUT05FKSB7XG4gICAgICByZXR1cm4gQ09MLnN0b25lU2hhZGUuY2xvbmUoKS5sZXJwKENPTC5zdG9uZUIsIDAuMzUgKyAwLjI1ICogc2hhZGUpLm11bHRpcGx5U2NhbGFyKFxuICAgICAgICAoMC44MiArIDAuMTQgKiBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCAoaCArIDgpIC8gNzApKSkgKiAoMC45MiArIDAuMDggKiBzaGFkZSksXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAodG9wID09PSBNQVQuT1JFKSByZXR1cm4gQ09MLm9yZS5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgICBpZiAodG9wID09PSBNQVQuU05PVykgcmV0dXJuIENPTC5zbm93LmNsb25lKCkubXVsdGlwbHlTY2FsYXIoMC45NCArIDAuMDggKiBzaGFkZSk7XG4gICAgLy8gRm9yZXN0LWZsb29yIHBhdGNoZXMgYnJlYWsgdXAgdGhlIHVuaWZvcm0gZ3JlZW4gb2YgdGhlIGZhciBMT0QuIFRoZXlcbiAgICAvLyBhcmUgYSBjb2xvdXIgYXBwcm94aW1hdGlvbiwgbm90IGV4dHJhIGdlb21ldHJ5OyB0aGUgbmVhciByaW5nIGhhcyByZWFsXG4gICAgLy8gU3R5bCB0cmVlcy5cbiAgICByZXR1cm4gQ09MLmdyYXNzVG9wW2hlaWdodEJhbmQoaCldLmNsb25lKClcbiAgICAgIC5sZXJwKENPTC5ncmFzc0NhcCwgMC4xMiArIDAuMzQgKiBtb2lzdClcbiAgICAgIC5tdWx0aXBseVNjYWxhcihzaGFkZSk7XG4gIH07XG5cbiAgY29uc3Qgc2lkZUNvbG9yID0gKHRvcDogTWF0SWQsIGg6IG51bWJlciwgbmg6IG51bWJlciwgaTogbnVtYmVyLCBqOiBudW1iZXIpOiBUSFJFRS5Db2xvciA9PiB7XG4gICAgY29uc3QgZHJvcCA9IGggLSBuaDtcbiAgICBjb25zdCBzaGFkZSA9IDAuOTAgKyAwLjEwICogaGFzaDJpKGksIGosIHdvcmxkLnNlZWQgKyA0MDIpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gQ09MLnNhbmQuY2xvbmUoKS5sZXJwKENPTC5zdG9uZUIsIGRyb3AgPiA1ID8gMC41NSA6IDAuMikubXVsdGlwbHlTY2FsYXIoc2hhZGUgKiAwLjkyKTtcbiAgICBpZiAodG9wID09PSBNQVQuU1RPTkUpIHtcbiAgICAgIHJldHVybiBDT0wuc3RvbmVTaGFkZS5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKFxuICAgICAgICAoMC44MCArIDAuMTYgKiBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCAoaCArIDgpIC8gNzApKSkgKiBzaGFkZSxcbiAgICAgICk7XG4gICAgfVxuICAgIC8vIEEgZ3Jhc3MtdG9wcGVkIGJhbmsgaXMgbm90IGEgc3RvbmUgY2xpZmYsIGhvd2V2ZXIgdGFsbCB0aGUgOCBtIG1hY3JvXG4gICAgLy8gY2VsbCBtYWtlcyBpdCBsb29rLiBLZWVwaW5nIHRoZSBzaWRlIGluIHRoZSBzb2lsIHJhbmdlIHJlbW92ZWQgdGhlXG4gICAgLy8gYnJpZ2h0IHdoaXRlIHF1YXJyeSB3YWxscyBhcm91bmQgdGhlIHJpdmVyIGFuZCBsYWtlIGluIHRoZSB3aWRlIHZpZXcuXG4gICAgaWYgKGRyb3AgPiA0KSByZXR1cm4gQ09MLmdyYXNzQ2FwLmNsb25lKCkubGVycChDT0wub2NocmUsIDAuNTUpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgICByZXR1cm4gQ09MLmdyYXNzQ2FwLmNsb25lKCkubGVycChDT0wuc3RvbmVCLCAwLjIyKS5tdWx0aXBseVNjYWxhcihzaGFkZSk7XG4gIH07XG5cbiAgLy8gQ2VsbCBsYXlvdXQuIFdpdGhvdXQgYSBmb2N1cyAobWFwIG1vZGUpIGV2ZXJ5IGNlbGwgaXMgb25lIGJhc2UgY2VsbC4gSW5cbiAgLy8gdGhlIHdvcmxkIHZpZXcsIDR4NC1jZWxsIGJsb2NrcyBmYXIgZnJvbSB0aGUgZm9jdXMgbWVyZ2UgaW50byAyeDIgb3IgNHg0XG4gIC8vIGNlbGxzOiBhIGZhciBjZWxsIGNvdmVycyB0aGUgc2FtZSBncm91bmQgd2l0aCBvbmUgdG9wIGFuZCBmZXdlciBzaWRlcy5cbiAgLy8gQ29hcnNlIGNlbGxzIHRha2UgdGhlIGhpZ2hlc3QgbGFuZCBoZWlnaHQgKGtlZXBzIHJpZGdlcyBhbmQgcGVha3Mgb24gdGhlXG4gIC8vIHNreWxpbmUpLCB0aGUgbWF0ZXJpYWwgb2YgdGhhdCBoaWdoZXN0IHN1Yi1jZWxsIGFuZCB0aGUgbWVhbiB0b3AgY29sb3VyXG4gIC8vIG9mIHRoZWlyIGxhbmQgc3ViLWNlbGxzOyBhIGNvYXJzZSBjZWxsIHRoYXQgaXMgbW9zdGx5IHNlYSBzdGF5cyBzZWEuXG4gIGNvbnN0IHRpZXJzID0gb3B0cy5mb2N1cyA/IChvcHRzLnRpZXJzID8/IERFRkFVTFRfTUFDUk9fVElFUlMpIDogbnVsbDtcbiAgY29uc3QgQiA9IDQ7XG4gIGNvbnN0IGxldmVsT2YgPSAoYmk6IG51bWJlciwgYmo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgaWYgKCF0aWVycyB8fCAhb3B0cy5mb2N1cykgcmV0dXJuIDE7XG4gICAgY29uc3QgY3ggPSAtSEFMRiArIChiaSArIDAuNSkgKiBCICogc3RlcCwgY3ogPSAtSEFMRiArIChiaiArIDAuNSkgKiBCICogc3RlcDtcbiAgICBjb25zdCBkID0gTWF0aC5tYXgoTWF0aC5hYnMoY3ggLSBvcHRzLmZvY3VzLngpLCBNYXRoLmFicyhjeiAtIG9wdHMuZm9jdXMueikpIC0gQiAqIHN0ZXAgLyAyO1xuICAgIHJldHVybiBkIDw9IHRpZXJzLmZpbmUgPyAxIDogZCA8PSB0aWVycy5taWQgPyAyIDogNDtcbiAgfTtcbiAgLy8gUmVuZGVyIGhlaWdodCBwZXIgYmFzZSBjZWxsIChvZiB0aGUgY2VsbCB0aGF0IGNvdmVycyBpdCkgYW5kIHdoZXRoZXJcbiAgLy8gdGhhdCBjZWxsIGlzIGRyYXduIGFzIGxhbmQuXG4gIGNvbnN0IHJlbmRlckggPSBuZXcgRmxvYXQzMkFycmF5KE4gKiBOKTtcbiAgY29uc3QgcmVuZGVyTGFuZCA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgdHlwZSBDZWxsID0geyBpOiBudW1iZXI7IGo6IG51bWJlcjsgazogbnVtYmVyOyBoOiBudW1iZXI7IHRvcDogTWF0SWQ7IGNvbG9yOiBUSFJFRS5Db2xvciB9O1xuICBjb25zdCBjZWxsczogQ2VsbFtdID0gW107XG4gIGNvbnN0IGNvbG9yQWNjID0gbmV3IFRIUkVFLkNvbG9yKCk7XG4gIGZvciAobGV0IGJqID0gMDsgYmogPCBOOyBiaiArPSBCKSB7XG4gICAgZm9yIChsZXQgYmkgPSAwOyBiaSA8IE47IGJpICs9IEIpIHtcbiAgICAgIGNvbnN0IGsgPSBsZXZlbE9mKGJpIC8gQiwgYmogLyBCKTtcbiAgICAgIGZvciAobGV0IGowID0gYmo7IGowIDwgTWF0aC5taW4oTiwgYmogKyBCKTsgajAgKz0gaykge1xuICAgICAgICBmb3IgKGxldCBpMCA9IGJpOyBpMCA8IE1hdGgubWluKE4sIGJpICsgQik7IGkwICs9IGspIHtcbiAgICAgICAgICBsZXQgbGFuZCA9IDAsIHRvdGFsID0gMCwgYmVzdCA9IC0xO1xuICAgICAgICAgIGNvbG9yQWNjLnNldFJHQigwLCAwLCAwKTtcbiAgICAgICAgICBmb3IgKGxldCBqID0gajA7IGogPCBNYXRoLm1pbihOLCBqMCArIGspOyBqKyspIHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBpMDsgaSA8IE1hdGgubWluKE4sIGkwICsgayk7IGkrKykge1xuICAgICAgICAgICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICAgICAgICAgIHRvdGFsKys7XG4gICAgICAgICAgICAgIGlmIChob2xlQ2VsbFtpZHhdIHx8IHVuZGVyd2F0ZXJbaWR4XSkgY29udGludWU7XG4gICAgICAgICAgICAgIGxhbmQrKztcbiAgICAgICAgICAgICAgaWYgKGJlc3QgPCAwIHx8IGhlaWdodHNbaWR4XSA+IGhlaWdodHNbYmVzdF0pIGJlc3QgPSBpZHg7XG4gICAgICAgICAgICAgIGlmIChrID4gMSkgY29sb3JBY2MuYWRkKHRvcENvbG9yKHRvcHNbaWR4XSBhcyBNYXRJZCwgaGVpZ2h0c1tpZHhdLCBpLCBqKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChiZXN0IDwgMCB8fCBsYW5kICogMiA8IHRvdGFsKSBjb250aW51ZTtcbiAgICAgICAgICBjb25zdCBoID0gaGVpZ2h0c1tiZXN0XTtcbiAgICAgICAgICBjb25zdCB0b3AgPSB0b3BzW2Jlc3RdIGFzIE1hdElkO1xuICAgICAgICAgIGNvbnN0IGNvbG9yID0gayA+IDEgPyBjb2xvckFjYy5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKDEgLyBsYW5kKSA6IHRvcENvbG9yKHRvcCwgaCwgaTAsIGowKTtcbiAgICAgICAgICBjZWxscy5wdXNoKHsgaTogaTAsIGo6IGowLCBrLCBoLCB0b3AsIGNvbG9yIH0pO1xuICAgICAgICAgIGZvciAobGV0IGogPSBqMDsgaiA8IE1hdGgubWluKE4sIGowICsgayk7IGorKykge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGkwOyBpIDwgTWF0aC5taW4oTiwgaTAgKyBrKTsgaSsrKSB7XG4gICAgICAgICAgICAgIHJlbmRlckhbaiAqIE4gKyBpXSA9IGg7XG4gICAgICAgICAgICAgIHJlbmRlckxhbmRbaiAqIE4gKyBpXSA9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqIEhlaWdodCBhIHNpZGUgZmFjZSBkcm9wcyB0byBiZXNpZGUgYmFzZSBjZWxsIChuaSwgbmopLCBvciBudWxsIGZvciBubyBmYWNlLiAqL1xuICBjb25zdCBuZWlnaGJvdXJEcm9wID0gKG5pOiBudW1iZXIsIG5qOiBudW1iZXIpOiBudW1iZXIgfCBudWxsID0+IHtcbiAgICAvLyBUaGUgd29ybGQgZWRnZSBpcyBvY2Vhbi4gRG8gbm90IGRyYXcgYSBzaWRlIGZhY2UgZG93biB0byB0aGUgd2F0ZXJcbiAgICAvLyBoZXJlOyB0aGUgb3BhcXVlIHdhdGVyIHBsYW5lIGFscmVhZHkgY292ZXJzIHRoZSBib3VuZGFyeS5cbiAgICBpZiAobmkgPCAwIHx8IG5qIDwgMCB8fCBuaSA+PSBOIHx8IG5qID49IE4pIHJldHVybiBudWxsO1xuICAgIGNvbnN0IG5pZHggPSBuaiAqIE4gKyBuaTtcbiAgICBpZiAoaG9sZUNlbGxbbmlkeF0pIHJldHVybiBudWxsO1xuICAgIGlmIChyZW5kZXJMYW5kW25pZHhdKSByZXR1cm4gcmVuZGVySFtuaWR4XTtcbiAgICAvLyBTZWEsIG9yIGEgbGFuZCBzdWItY2VsbCBvZiBhIGNvYXJzZSBjZWxsIHRoYXQgaXMgbW9zdGx5IHNlYTogdGhlIGZhY2VcbiAgICAvLyBydW5zIGRvd24gdG8gdGhlIHdhdGVyIHNvIG5vIHNlZS10aHJvdWdoIGdhcCBvcGVucyBhYm92ZSBpdC5cbiAgICByZXR1cm4gdW5kZXJ3YXRlcltuaWR4XSA/IE1hdGgubWF4KFNFQV9MRVZFTCAtIDAuNSwgaGVpZ2h0c1tuaWR4XSkgOiBTRUFfTEVWRUwgLSAwLjU7XG4gIH07XG5cbiAgZm9yIChjb25zdCB7IGksIGosIGssIGgsIHRvcCwgY29sb3IgfSBvZiBjZWxscykge1xuICAgIGJ1ZiA9IHRpbGVCdWZmZXJzW01hdGguZmxvb3IoaiAvIHRpbGVDZWxscykgKiB0aWxlc1BlclNpZGUgKyBNYXRoLmZsb29yKGkgLyB0aWxlQ2VsbHMpXTtcbiAgICBjb25zdCB4MCA9IC1IQUxGICsgaSAqIHN0ZXAsIHgxID0gTWF0aC5taW4oSEFMRiwgeDAgKyBrICogc3RlcCk7XG4gICAgY29uc3QgejAgPSAtSEFMRiArIGogKiBzdGVwLCB6MSA9IE1hdGgubWluKEhBTEYsIHowICsgayAqIHN0ZXApO1xuICAgIGNvbnN0IHNwYW4gPSBNYXRoLm1pbihrLCBOIC0gaSksIHNwYW5aID0gTWF0aC5taW4oaywgTiAtIGopO1xuXG4gICAgcHVzaFF1YWQoXG4gICAgICBbW3gwLCBoLCB6MF0sIFt4MCwgaCwgejFdLCBbeDEsIGgsIHoxXSwgW3gxLCBoLCB6MF1dLFxuICAgICAgWzAsIDEsIDBdLFxuICAgICAgY29sb3IsXG4gICAgKTtcblxuICAgIC8vIE9uZSBzaWRlIGZhY2UgcGVyIHJ1biBvZiBlcXVhbCBkcm9wIGhlaWdodCBhbG9uZyBlYWNoIGVkZ2UuIENvYXJzZVxuICAgIC8vIGNlbGxzIGJlc2lkZSBmaW5lciBvbmVzIGdldCBzZXZlcmFsIHJ1bnMsIHNvIG5vIGdhcCBvcGVucyBhdCBhIHRpZXJcbiAgICAvLyBib3VuZGFyeTsgZXF1YWwtc2l6ZSBuZWlnaGJvdXJzIGdpdmUgZXhhY3RseSBvbmUgZmFjZSBhcyBiZWZvcmUuXG4gICAgY29uc3QgZWRnZSA9IChzaWRlOiAwIHwgMSB8IDIgfCAzKSA9PiB7XG4gICAgICBjb25zdCBuID0gc2lkZSA8IDIgPyBzcGFuWiA6IHNwYW47XG4gICAgICBsZXQgcnVuU3RhcnQgPSAwLCBydW5IOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgICAgIGNvbnN0IGZsdXNoID0gKGVuZDogbnVtYmVyKSA9PiB7XG4gICAgICAgIGlmIChydW5IID09PSBudWxsIHx8IGggPD0gcnVuSCkgcmV0dXJuO1xuICAgICAgICBjb25zdCBuaCA9IHJ1bkg7XG4gICAgICAgIGNvbnN0IGNvbCA9IHNpZGVDb2xvcih0b3AsIGgsIG5oLCBpLCBqKTtcbiAgICAgICAgaWYgKHNpZGUgPT09IDApIHtcbiAgICAgICAgICBjb25zdCB6YSA9IHowICsgcnVuU3RhcnQgKiBzdGVwLCB6YiA9IHowICsgZW5kICogc3RlcDtcbiAgICAgICAgICBwdXNoUXVhZChbW3gxLCBuaCwgemFdLCBbeDEsIGgsIHphXSwgW3gxLCBoLCB6Yl0sIFt4MSwgbmgsIHpiXV0sIFsxLCAwLCAwXSwgY29sKTtcbiAgICAgICAgfSBlbHNlIGlmIChzaWRlID09PSAxKSB7XG4gICAgICAgICAgY29uc3QgemEgPSB6MCArIHJ1blN0YXJ0ICogc3RlcCwgemIgPSB6MCArIGVuZCAqIHN0ZXA7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MCwgbmgsIHphXSwgW3gwLCBuaCwgemJdLCBbeDAsIGgsIHpiXSwgW3gwLCBoLCB6YV1dLCBbLTEsIDAsIDBdLCBjb2wpO1xuICAgICAgICB9IGVsc2UgaWYgKHNpZGUgPT09IDIpIHtcbiAgICAgICAgICBjb25zdCB4YSA9IHgwICsgcnVuU3RhcnQgKiBzdGVwLCB4YiA9IHgwICsgZW5kICogc3RlcDtcbiAgICAgICAgICBwdXNoUXVhZChbW3hhLCBuaCwgejFdLCBbeGIsIG5oLCB6MV0sIFt4YiwgaCwgejFdLCBbeGEsIGgsIHoxXV0sIFswLCAwLCAxXSwgY29sKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCB4YSA9IHgwICsgcnVuU3RhcnQgKiBzdGVwLCB4YiA9IHgwICsgZW5kICogc3RlcDtcbiAgICAgICAgICBwdXNoUXVhZChbW3hhLCBuaCwgejBdLCBbeGEsIGgsIHowXSwgW3hiLCBoLCB6MF0sIFt4YiwgbmgsIHowXV0sIFswLCAwLCAtMV0sIGNvbCk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBmb3IgKGxldCB0ID0gMDsgdCA8IG47IHQrKykge1xuICAgICAgICBjb25zdCBuaCA9IHNpZGUgPT09IDAgPyBuZWlnaGJvdXJEcm9wKGkgKyBzcGFuLCBqICsgdClcbiAgICAgICAgICA6IHNpZGUgPT09IDEgPyBuZWlnaGJvdXJEcm9wKGkgLSAxLCBqICsgdClcbiAgICAgICAgICAgIDogc2lkZSA9PT0gMiA/IG5laWdoYm91ckRyb3AoaSArIHQsIGogKyBzcGFuWilcbiAgICAgICAgICAgICAgOiBuZWlnaGJvdXJEcm9wKGkgKyB0LCBqIC0gMSk7XG4gICAgICAgIGlmICh0ID4gMCAmJiBuaCA9PT0gcnVuSCkgY29udGludWU7XG4gICAgICAgIGZsdXNoKHQpO1xuICAgICAgICBydW5TdGFydCA9IHQ7IHJ1bkggPSBuaDtcbiAgICAgIH1cbiAgICAgIGZsdXNoKG4pO1xuICAgIH07XG4gICAgZWRnZSgwKTsgZWRnZSgxKTsgZWRnZSgyKTsgZWRnZSgzKTtcbiAgfVxuXG4gIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoeyB2ZXJ0ZXhDb2xvcnM6IHRydWUsIGZsYXRTaGFkaW5nOiB0cnVlIH0pO1xuICBjb25zdCBtZXNoZXM6IFRIUkVFLk1lc2hbXSA9IFtdO1xuICBsZXQgdHJpYW5nbGVzID0gMDtcbiAgZm9yIChsZXQgdCA9IDA7IHQgPCB0aWxlQnVmZmVycy5sZW5ndGg7IHQrKykge1xuICAgIGNvbnN0IHsgcG9zaXRpb25zLCBub3JtYWxzLCBjb2xvcnMsIGluZGljZXMgfSA9IHRpbGVCdWZmZXJzW3RdO1xuICAgIGlmIChpbmRpY2VzLmxlbmd0aCA9PT0gMCAmJiAodGlsZUJ1ZmZlcnMubGVuZ3RoID4gMSB8fCBtZXNoZXMubGVuZ3RoID4gMCkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJ1ZmZlckdlb21ldHJ5KCk7XG4gICAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHBvc2l0aW9ucywgMykpO1xuICAgIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUobm9ybWFscywgMykpO1xuICAgIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShjb2xvcnMsIDMpKTtcbiAgICBnZW9tZXRyeS5zZXRJbmRleChpbmRpY2VzKTtcbiAgICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdCb3goKTtcbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcbiAgICBtZXNoLm5hbWUgPSB0aWxlQnVmZmVycy5sZW5ndGggPiAxID8gYG1hY3JvX2xvZF90aWxlXyR7dCAlIHRpbGVzUGVyU2lkZX1fJHtNYXRoLmZsb29yKHQgLyB0aWxlc1BlclNpZGUpfWAgOiAnbWFjcm9fbG9kJztcbiAgICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSBmYWxzZTtcbiAgICBtZXNoZXMucHVzaChtZXNoKTtcbiAgICB0cmlhbmdsZXMgKz0gaW5kaWNlcy5sZW5ndGggLyAzO1xuICB9XG4gIGlmIChtZXNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgY29uc3QgZW1wdHkgPSBuZXcgVEhSRUUuTWVzaChuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKSwgbWF0ZXJpYWwpO1xuICAgIGVtcHR5Lm5hbWUgPSAnbWFjcm9fbG9kJztcbiAgICBtZXNoZXMucHVzaChlbXB0eSk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBtZXNoOiBtZXNoZXNbMF0sXG4gICAgbWVzaGVzLFxuICAgIHRyaWFuZ2xlcyxcbiAgICBzYW1wbGVNcyxcbiAgICB0b3RhbE1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHRvdGFsVDAsXG4gICAgc2FtcGxlQ2FjaGVkLFxuICB9O1xufVxuXG5leHBvcnQgdHlwZSBWaWV3TW9kZSA9ICd3b3JsZCcgfCAnbWFwJyB8ICdraXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsVGVycmFpblZpZXdPcHRpb25zIHtcbiAgbmVhclJhZGl1cz86IG51bWJlcjtcbiAgd29ybGRNYWNyb1N0ZXA/OiBudW1iZXI7XG4gIG1hcE1hY3JvU3RlcD86IG51bWJlcjtcbn1cblxuY29uc3QgX2N1bGxGcnVzdHVtID0gbmV3IFRIUkVFLkZydXN0dW0oKTtcbmNvbnN0IF9jdWxsTWF0cml4ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcblxuaW50ZXJmYWNlIENodW5rVmlldyB7IG1lc2g6IFRIUkVFLk1lc2g7IHdhdGVyOiBUSFJFRS5NZXNoIHwgbnVsbDsgdHJpYW5nbGVzOiBudW1iZXI7IH1cblxuLyoqXG4gKiBPd25zIHRoZSBuZWFyIGNodW5rIG1lc2hlcywgbWFjcm8gTE9EIGFuZCB3YXRlciBzdXJmYWNlLiBJdCByZWFkcyB3b3JsZFxuICogc3RhdGUgYW5kIG5ldmVyIG11dGF0ZXMgZ2VuZXJhdGlvbiBydWxlczsgZXZpY3Rpb24gb25seSBmcmVlcyBkZXJpdmVkIGRhdGEuXG4gKi9cbmV4cG9ydCBjbGFzcyBWb3hlbFRlcnJhaW5WaWV3IHtcbiAgcmVhZG9ubHkgZ3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBuZWFyR3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBtYWNyb0dyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIHByaXZhdGUgd2F0ZXI6IFRIUkVFLk1lc2g7XG4gIHByaXZhdGUgd29ybGQ6IFdvcmxkO1xuICBwcml2YXRlIG5lYXJSYWRpdXM6IG51bWJlcjtcbiAgcHJpdmF0ZSB3b3JsZE1hY3JvU3RlcDogbnVtYmVyO1xuICBwcml2YXRlIG1hcE1hY3JvU3RlcDogbnVtYmVyO1xuICBwcml2YXRlIGNodW5rcyA9IG5ldyBNYXA8c3RyaW5nLCBDaHVua1ZpZXc+KCk7XG4gIHByaXZhdGUgbG9hZGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbW9kZTogVmlld01vZGUgPSAnd29ybGQnO1xuICBwcml2YXRlIG1hY3JvOiBUSFJFRS5NZXNoW10gPSBbXTtcbiAgcHJpdmF0ZSBtYWNyb1RyaWFuZ2xlcyA9IDA7XG4gIHByaXZhdGUgbWFjcm9Gb2N1cyA9IG5ldyBUSFJFRS5WZWN0b3IzKDFlOSwgMCwgMWU5KTtcbiAgcHJpdmF0ZSBtYWNyb01vZGU6IFZpZXdNb2RlIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgY2h1bmtHZW5TYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIGNodW5rTWVzaFNhbXBsZXM6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgbWFjcm9TYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIG1hY3JvU2FtcGxlU2FtcGxlczogbnVtYmVyW10gPSBbXTtcbiAgcHJpdmF0ZSBtYWNyb0NhY2hlSGl0cyA9IDA7XG4gIHByaXZhdGUgbWFjcm9FZGl0S2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgLyoqIE1haW4tdGhyZWFkIG1pbGxpc2Vjb25kcyBwZXIgZnJhbWUgZm9yIHN0cmVhbWluZyBhbmQgZGlydHkgcmUtbWVzaGluZy4gKi9cbiAgZnJhbWVCdWRnZXRNcyA9IDY7XG4gIHByaXZhdGUgcGVuZGluZ0NodW5rcyA9IDA7XG4gIHByaXZhdGUgc3dlZXBDb3VudGVyID0gMDtcbiAgcHJpdmF0ZSBzd2VwdENodW5rcyA9IDA7XG4gIHByaXZhdGUgcGlubmVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgcG9vbDogQ2h1bmtXb3JrZXJQb29sIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgZ2VuZXJhdGluZyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAvKiogTGF0ZXN0IG1lc2ggcmVxdWVzdCBwZXIgY2h1bms7IG9sZGVyIHJlc3VsdHMgYXJlIGRpc2NhcmRlZC4gKi9cbiAgcHJpdmF0ZSBtZXNoU3RhbXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHN0YW1wQ291bnRlciA9IDA7XG4gIHByaXZhdGUgd29ya2VyU3RhdHMgPSB7IGdlbmVyYXRlZDogMCwgbWVzaGVkOiAwLCBkaXNjYXJkZWQ6IDAsIGdlbk1zOiAwLCBtZXNoTXM6IDAgfTtcbiAgcHJpdmF0ZSB3YXRlckdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIHByaXZhdGUgZmFyV2F0ZXJIb2xlOiB7IHZhbHVlOiBUSFJFRS5WZWN0b3I0IH07XG4gIG9uQ2h1bmtzQ2hhbmdlZDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3Iod29ybGQ6IFdvcmxkLCBzY2VuZTogVEhSRUUuU2NlbmUsIG9wdHM6IFZveGVsVGVycmFpblZpZXdPcHRpb25zID0ge30pIHtcbiAgICB0aGlzLndvcmxkID0gd29ybGQ7XG4gICAgdGhpcy5uZWFyUmFkaXVzID0gTWF0aC5tYXgoMSwgb3B0cy5uZWFyUmFkaXVzID8/IDMpO1xuICAgIHRoaXMud29ybGRNYWNyb1N0ZXAgPSBNYXRoLm1heCg0LCBvcHRzLndvcmxkTWFjcm9TdGVwID8/IDgpO1xuICAgIHRoaXMubWFwTWFjcm9TdGVwID0gTWF0aC5tYXgoNCwgb3B0cy5tYXBNYWNyb1N0ZXAgPz8gOCk7XG4gICAgdGhpcy5ncm91cC5uYW1lID0gJ3ZveGVsX3dvcmxkJztcbiAgICB0aGlzLm5lYXJHcm91cC5uYW1lID0gJ3ZveGVsX2NodW5rcyc7XG4gICAgdGhpcy5tYWNyb0dyb3VwLm5hbWUgPSAnbWFjcm9fbG9kJztcbiAgICB0aGlzLmdyb3VwLmFkZCh0aGlzLm5lYXJHcm91cCwgdGhpcy5tYWNyb0dyb3VwKTtcbiAgICB0aGlzLndhdGVyID0gYnVpbGRXYXRlclN1cmZhY2Uod29ybGQpO1xuICAgIHRoaXMuZmFyV2F0ZXJIb2xlID0gaW5zdGFsbEZhcldhdGVySG9sZSh0aGlzLndhdGVyLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKTtcbiAgICB0aGlzLmdyb3VwLmFkZCh0aGlzLndhdGVyKTtcbiAgICB0aGlzLndhdGVyR3JvdXAubmFtZSA9ICduZWFyX3dhdGVyJztcbiAgICB0aGlzLmdyb3VwLmFkZCh0aGlzLndhdGVyR3JvdXApO1xuICAgIHNjZW5lLmFkZCh0aGlzLmdyb3VwKTtcbiAgfVxuXG4gIHByZWxvYWQoZm9jdXM6IFRIUkVFLlZlY3RvcjMpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGUgPSAnd29ybGQnO1xuICAgIHRoaXMuZW5zdXJlQ2h1bmtzKGZvY3VzLCB0cnVlKTtcbiAgICB0aGlzLnJlYnVpbGRNYWNybyhmb2N1cywgJ3dvcmxkJywgdHJ1ZSk7XG4gIH1cblxuICAvKiogQWR2YW5jZSBwcmVzZW50YXRpb24tb25seSB3YXRlciBhbmltYXRpb24gKHNlY29uZHMpLiAqL1xuICBzZXRXYXRlclRpbWUoc2Vjb25kczogbnVtYmVyKTogdm9pZCB7IHdhdGVyVGltZS52YWx1ZSA9IHNlY29uZHM7IH1cblxuICB1cGRhdGUoZm9jdXM6IFRIUkVFLlZlY3RvcjMsIG1vZGU6IFZpZXdNb2RlID0gJ3dvcmxkJyk6IHZvaWQge1xuICAgIGlmIChtb2RlICE9PSB0aGlzLm1vZGUpIHtcbiAgICAgIHRoaXMubW9kZSA9IG1vZGU7XG4gICAgICB0aGlzLm5lYXJHcm91cC52aXNpYmxlID0gbW9kZSAhPT0gJ21hcCc7XG4gICAgICB0aGlzLndhdGVyR3JvdXAudmlzaWJsZSA9IG1vZGUgIT09ICdtYXAnO1xuICAgICAgaWYgKG1vZGUgPT09ICdtYXAnKSB0aGlzLmZhcldhdGVySG9sZS52YWx1ZS5zZXQoMCwgMCwgMCwgMCk7XG4gICAgICB0aGlzLnJlYnVpbGRNYWNybyhmb2N1cywgbW9kZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgaWYgKG1vZGUgPT09ICdtYXAnKSB7XG4gICAgICBpZiAobWFjcm9FZGl0S2V5KHRoaXMud29ybGQpICE9PSB0aGlzLm1hY3JvRWRpdEtleSkgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsIG1vZGUsIHRydWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGZyYW1lU3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICB0aGlzLmVuc3VyZUNodW5rcyhmb2N1cywgZmFsc2UsIGZyYW1lU3RhcnQpO1xuICAgIHRoaXMucmVidWlsZERpcnR5KGZvY3VzLCBmcmFtZVN0YXJ0KTtcbiAgICBpZiAoKyt0aGlzLnN3ZWVwQ291bnRlciAlIDMwID09PSAwKSB0aGlzLnN3ZWVwUmVzaWRlbnQoZm9jdXMpO1xuXG4gICAgY29uc3QgbW92ZWQgPSBNYXRoLmh5cG90KGZvY3VzLnggLSB0aGlzLm1hY3JvRm9jdXMueCwgZm9jdXMueiAtIHRoaXMubWFjcm9Gb2N1cy56KTtcbiAgICBpZiAodGhpcy5tYWNyb01vZGUgIT09IG1vZGUgfHwgbW92ZWQgPiA0OCB8fCBtYWNyb0VkaXRLZXkodGhpcy53b3JsZCkgIT09IHRoaXMubWFjcm9FZGl0S2V5KSB7XG4gICAgICB0aGlzLnJlYnVpbGRNYWNybyhmb2N1cywgbW9kZSwgZmFsc2UpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdHJlYW0gdGhlIG5lYXIgcmluZyBuZWFyZXN0LWZpcnN0IHdpdGhpbiBhIHBlci1mcmFtZSB0aW1lIGJ1ZGdldC4gQXQgbGVhc3RcbiAgICogb25lIGNodW5rIGlzIGJ1aWx0IHBlciBmcmFtZSBzbyBzdHJlYW1pbmcgYWx3YXlzIG1ha2VzIHByb2dyZXNzLlxuICAgKi9cbiAgLyoqXG4gICAqIE1vdmUgc3RyZWFtaW5nIGdlbmVyYXRpb24gYW5kIG1lc2hpbmcgdG8gd29ya2Vycy4gRXhwbGljaXQgcmVidWlsZHNcbiAgICogKGNvbnN0cnVjdGlvbiwgZWRpdHMgdmlhIHJlYnVpbGRBcm91bmQpIGFuZCBwcmVsb2FkIHN0YXkgc3luY2hyb25vdXMgc29cbiAgICogYXV0aG9yaXRhdGl2ZSBjaGFuZ2VzIGFyZSB2aXNpYmxlIGltbWVkaWF0ZWx5LlxuICAgKi9cbiAgZW5hYmxlV29ya2Vycyhwb29sOiBDaHVua1dvcmtlclBvb2wpOiB2b2lkIHsgdGhpcy5wb29sID0gcG9vbDsgfVxuXG4gIGdldCB3b3JrZXJNZXRyaWNzKCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCBudWxsIHtcbiAgICBpZiAoIXRoaXMucG9vbCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgIHdvcmtlcnM6IHRoaXMucG9vbC5zaXplLCBpbkZsaWdodDogdGhpcy5wb29sLmluRmxpZ2h0LCAuLi50aGlzLndvcmtlclN0YXRzLFxuICAgICAgZ2VuTXNBdmc6IHRoaXMud29ya2VyU3RhdHMuZ2VuZXJhdGVkID8gTWF0aC5yb3VuZCh0aGlzLndvcmtlclN0YXRzLmdlbk1zIC8gdGhpcy53b3JrZXJTdGF0cy5nZW5lcmF0ZWQgKiAxMCkgLyAxMCA6IDAsXG4gICAgICBtZXNoTXNBdmc6IHRoaXMud29ya2VyU3RhdHMubWVzaGVkID8gTWF0aC5yb3VuZCh0aGlzLndvcmtlclN0YXRzLm1lc2hNcyAvIHRoaXMud29ya2VyU3RhdHMubWVzaGVkICogMTApIC8gMTAgOiAwLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHJlcXVlc3RHZW5lcmF0ZShjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgICBpZiAodGhpcy53b3JsZC5jaHVua3MuaGFzKGtleSkgfHwgdGhpcy5nZW5lcmF0aW5nLmhhcyhrZXkpIHx8ICF0aGlzLnBvb2wpIHJldHVybjtcbiAgICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm47XG4gICAgdGhpcy5nZW5lcmF0aW5nLmFkZChrZXkpO1xuICAgIGNvbnN0IHsgc2VlZCB9ID0gdGhpcy53b3JsZCwgdmVyc2lvbiA9IHRoaXMud29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb247XG4gICAgdm9pZCB0aGlzLnBvb2wuZ2VuZXJhdGUoc2VlZCwgdmVyc2lvbiwgY3gsIGN6KS50aGVuKChyKSA9PiB7XG4gICAgICB0aGlzLmdlbmVyYXRpbmcuZGVsZXRlKGtleSk7XG4gICAgICAvLyBUaGUgbWFpbiB0aHJlYWQgaXMgdGhlIG9ubHkgV29ybGQgd3JpdGVyOiBpbnN0YWxsIG9ubHkgaWYgc3RpbGwgd2FudGVkLlxuICAgICAgaWYgKHRoaXMud29ybGQuc2VlZCAhPT0gc2VlZCB8fCB0aGlzLndvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uICE9PSB2ZXJzaW9uXG4gICAgICAgIHx8IHRoaXMud29ybGQuY2h1bmtzLmhhcyhrZXkpKSB7IHRoaXMud29ya2VyU3RhdHMuZGlzY2FyZGVkKys7IHJldHVybjsgfVxuICAgICAgc2VlZEJhc2VDb2x1bW5zKHRoaXMud29ybGQsIGtleSwgci5jb2x1bW5zKTtcbiAgICAgIGluc3RhbGxCYXNlQ2h1bmsodGhpcy53b3JsZCwgci5iYXNlLCByLm1zKTtcbiAgICAgIHRoaXMud29ya2VyU3RhdHMuZ2VuZXJhdGVkKys7XG4gICAgICB0aGlzLndvcmtlclN0YXRzLmdlbk1zICs9IHIubXM7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHJlcXVlc3RNZXNoKGtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgY2h1bmsgPSB0aGlzLndvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rIHx8ICF0aGlzLnBvb2wpIHJldHVybjtcbiAgICBjb25zdCBzdGFtcCA9ICsrdGhpcy5zdGFtcENvdW50ZXI7XG4gICAgdGhpcy5tZXNoU3RhbXAuc2V0KGtleSwgc3RhbXApO1xuICAgIHRoaXMud29ybGQuZGlydHkuZGVsZXRlKGtleSk7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgcGFkZGVkID0gcGFkZGVkRm9yKHRoaXMud29ybGQsIGNodW5rKTtcbiAgICB2b2lkIHRoaXMucG9vbC5tZXNoKHBhZGRlZCwgY2h1bmsuaGVpZ2h0cywgb3gsIG96LCB0aGlzLndvcmxkLnNlZWQpLnRoZW4oKHIpID0+IHtcbiAgICAgIC8vIFN1cGVyc2VkZWQgKG5ld2VyIHJlcXVlc3QsIHVubG9hZGVkIG9yIHN5bmNocm9ub3VzbHkgcmVidWlsdCkgcmVzdWx0cyBhcmUgZHJvcHBlZC5cbiAgICAgIGlmICh0aGlzLm1lc2hTdGFtcC5nZXQoa2V5KSAhPT0gc3RhbXApIHsgdGhpcy53b3JrZXJTdGF0cy5kaXNjYXJkZWQrKzsgcmV0dXJuOyB9XG4gICAgICB0aGlzLm1lc2hTdGFtcC5kZWxldGUoa2V5KTtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLndvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICAgIGlmICghY3VycmVudCkgeyB0aGlzLndvcmtlclN0YXRzLmRpc2NhcmRlZCsrOyByZXR1cm47IH1cbiAgICAgIC8vIEFuIGVkaXQgdG8gdGhpcyBjaHVuayB3aGlsZSBpbiBmbGlnaHQgcmUtbWFya2VkIGl0IGRpcnR5OyB0aGUgcmVzdWx0IGlzXG4gICAgICAvLyBzdGlsbCBzaG93biBub3cgYW5kIHJlcGxhY2VkIGJ5IHRoZSBuZXh0IChmcmVzaCkgcmVxdWVzdC5cbiAgICAgIHRoaXMuYWRvcHRNZXNoKGtleSwgY3VycmVudCwgZ2VvbWV0cnlGcm9tQXJyYXlzKHIuYXJyYXlzKSk7XG4gICAgICB0aGlzLndvcmtlclN0YXRzLm1lc2hlZCsrO1xuICAgICAgdGhpcy53b3JrZXJTdGF0cy5tZXNoTXMgKz0gci5tcztcbiAgICAgIHRoaXMub25DaHVua3NDaGFuZ2VkPy4oKTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgYWRvcHRNZXNoKGtleTogc3RyaW5nLCBjaHVuazogVm94ZWxDaHVuaywgcmVzdWx0OiBNZXNoUmVzdWx0KTogdm9pZCB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHRoaXMubmVhckdyb3VwLnJlbW92ZShleGlzdGluZy5tZXNoKTtcbiAgICAgIGV4aXN0aW5nLm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICAgICAgaWYgKGV4aXN0aW5nLndhdGVyKSB7IHRoaXMud2F0ZXJHcm91cC5yZW1vdmUoZXhpc3Rpbmcud2F0ZXIpOyBleGlzdGluZy53YXRlci5nZW9tZXRyeS5kaXNwb3NlKCk7IH1cbiAgICB9XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKHJlc3VsdC5nZW9tZXRyeSwgdGVycmFpbk1hdGVyaWFsKTtcbiAgICBtZXNoLm5hbWUgPSBgdm94ZWxfY2h1bmtfJHtjaHVuay5jeH1fJHtjaHVuay5jen1gO1xuICAgIG1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gICAgbWVzaC5jYXN0U2hhZG93ID0gZmFsc2U7XG4gICAgdGhpcy5uZWFyR3JvdXAuYWRkKG1lc2gpO1xuICAgIGNvbnN0IHdhdGVyID0gbWVzaENodW5rV2F0ZXIodGhpcy53b3JsZCwgY2h1bmspO1xuICAgIGlmICh3YXRlcikgdGhpcy53YXRlckdyb3VwLmFkZCh3YXRlcik7XG4gICAgdGhpcy5jaHVua3Muc2V0KGtleSwgeyBtZXNoLCB3YXRlciwgdHJpYW5nbGVzOiByZXN1bHQudHJpYW5nbGVzICsgKHdhdGVyPy51c2VyRGF0YS53YXRlclRyaWFuZ2xlcyA/PyAwKSB9KTtcbiAgICB0aGlzLmxvYWRlZC5hZGQoa2V5KTtcbiAgfVxuXG4gIC8qKiBXb3JrZXIgc3RyZWFtaW5nOiBnZW5lcmF0ZSB0aGUgM3gzIG5laWdoYm91cmhvb2QsIHRoZW4gbWVzaCwgbmVhcmVzdCBmaXJzdC4gKi9cbiAgcHJpdmF0ZSBlbnN1cmVDaHVua3NBc3luYyhtaXNzaW5nOiBBcnJheTx7IGN4OiBudW1iZXI7IGN6OiBudW1iZXI7IGQ6IG51bWJlciB9Pik6IHZvaWQge1xuICAgIGNvbnN0IHBvb2wgPSB0aGlzLnBvb2whO1xuICAgIGNvbnN0IG1heEluRmxpZ2h0ID0gcG9vbC5zaXplICogMztcbiAgICBmb3IgKGNvbnN0IG0gb2YgbWlzc2luZykge1xuICAgICAgaWYgKHBvb2wuaW5GbGlnaHQgPj0gbWF4SW5GbGlnaHQpIGJyZWFrO1xuICAgICAgY29uc3Qga2V5ID0gY2h1bmtLZXkobS5jeCwgbS5jeik7XG4gICAgICBpZiAodGhpcy5tZXNoU3RhbXAuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgICAgbGV0IHJlYWR5ID0gdHJ1ZTtcbiAgICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIHtcbiAgICAgICAgZm9yIChsZXQgZHggPSAtMTsgZHggPD0gMTsgZHgrKykge1xuICAgICAgICAgIGNvbnN0IGN4ID0gbS5jeCArIGR4LCBjeiA9IG0uY3ogKyBkejtcbiAgICAgICAgICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSBjb250aW51ZTtcbiAgICAgICAgICBpZiAoIXRoaXMud29ybGQuY2h1bmtzLmhhcyhjaHVua0tleShjeCwgY3opKSkgeyByZWFkeSA9IGZhbHNlOyB0aGlzLnJlcXVlc3RHZW5lcmF0ZShjeCwgY3opOyB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChyZWFkeSkgdGhpcy5yZXF1ZXN0TWVzaChrZXkpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZW5zdXJlQ2h1bmtzKGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBpbW1lZGlhdGU6IGJvb2xlYW4sIGZyYW1lU3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKSk6IHZvaWQge1xuICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICBsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXG4gICAgY29uc3QgbWlzc2luZzogQXJyYXk8eyBjeDogbnVtYmVyOyBjejogbnVtYmVyOyBkOiBudW1iZXIgfT4gPSBbXTtcbiAgICBmb3IgKGxldCBkeiA9IC10aGlzLm5lYXJSYWRpdXM7IGR6IDw9IHRoaXMubmVhclJhZGl1czsgZHorKykge1xuICAgICAgZm9yIChsZXQgZHggPSAtdGhpcy5uZWFyUmFkaXVzOyBkeCA8PSB0aGlzLm5lYXJSYWRpdXM7IGR4KyspIHtcbiAgICAgICAgY29uc3QgY3ggPSBjY3ggKyBkeCwgY3ogPSBjY3ogKyBkejtcbiAgICAgICAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgY29udGludWU7XG4gICAgICAgIGlmICh0aGlzLmxvYWRlZC5oYXMoY2h1bmtLZXkoY3gsIGN6KSkpIGNvbnRpbnVlO1xuICAgICAgICBtaXNzaW5nLnB1c2goeyBjeCwgY3osIGQ6IGR4ICogZHggKyBkeiAqIGR6IH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBtaXNzaW5nLnNvcnQoKGEsIGIpID0+IGEuZCAtIGIuZCk7XG4gICAgbGV0IGJ1aWx0ID0gMDtcbiAgICBpZiAodGhpcy5wb29sICYmICFpbW1lZGlhdGUgJiYgIXRoaXMucG9vbC5mYWlsZWQpIHtcbiAgICAgIHRoaXMuZW5zdXJlQ2h1bmtzQXN5bmMobWlzc2luZyk7XG4gICAgICBtaXNzaW5nLmxlbmd0aCA9IDA7XG4gICAgfVxuICAgIGZvciAoY29uc3QgbSBvZiBtaXNzaW5nKSB7XG4gICAgICBpZiAoIWltbWVkaWF0ZSAmJiBidWlsdCA+IDAgJiYgcGVyZm9ybWFuY2Uubm93KCkgLSBmcmFtZVN0YXJ0ID49IHRoaXMuZnJhbWVCdWRnZXRNcykgYnJlYWs7XG4gICAgICB0aGlzLmJ1aWxkQ2h1bmsobS5jeCwgbS5jeik7XG4gICAgICBidWlsdCsrO1xuICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgfVxuICAgIHRoaXMucGVuZGluZ0NodW5rcyA9IHRoaXMucG9vbCAmJiAhaW1tZWRpYXRlID8gdGhpcy5tZXNoU3RhbXAuc2l6ZSArIHRoaXMuZ2VuZXJhdGluZy5zaXplIDogbWlzc2luZy5sZW5ndGggLSBidWlsdDtcblxuICAgIGNvbnN0IG1hcmdpbiA9IHRoaXMubmVhclJhZGl1cyArIDE7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgWy4uLnRoaXMubG9hZGVkXSkge1xuICAgICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICAgIGlmIChNYXRoLmFicyhjeCAtIGNjeCkgPiBtYXJnaW4gfHwgTWF0aC5hYnMoY3ogLSBjY3opID4gbWFyZ2luKSB7XG4gICAgICAgIHRoaXMuZGlzcG9zZUNodW5rKGtleSk7XG4gICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjaGFuZ2VkKSB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ2h1bmsoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gICAgY29uc3QgZ2VuQmVmb3JlID0gdGhpcy53b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXM7XG4gICAgY29uc3QgY2h1bmtzQmVmb3JlID0gdGhpcy53b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQ7XG4gICAgLy8gRW5zdXJlIHRoZSAzeDMgbmVpZ2hib3VyaG9vZCBleGlzdHMgc28gYm91bmRhcnkgZmFjZXMgdXNlIHJlYWwgZGF0YS5cbiAgICBmb3IgKGxldCBkeiA9IC0xOyBkeiA8PSAxOyBkeisrKSB7XG4gICAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSAxOyBkeCsrKSBlbnN1cmVDaHVuayh0aGlzLndvcmxkLCBjeCArIGR4LCBjeiArIGR6KTtcbiAgICB9XG4gICAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh0aGlzLndvcmxkLCBjeCwgY3opO1xuICAgIGlmICghY2h1bmspIHJldHVybjtcbiAgICBjb25zdCBnZW5lcmF0ZWQgPSB0aGlzLndvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCAtIGNodW5rc0JlZm9yZTtcbiAgICBpZiAoZ2VuZXJhdGVkID4gMCkge1xuICAgICAgcmVjb3JkU2FtcGxlKHRoaXMuY2h1bmtHZW5TYW1wbGVzLCAodGhpcy53b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgLSBnZW5CZWZvcmUpIC8gZ2VuZXJhdGVkKTtcbiAgICB9XG5cbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgdGhpcy5uZWFyR3JvdXAucmVtb3ZlKGV4aXN0aW5nLm1lc2gpO1xuICAgICAgZXhpc3RpbmcubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICBpZiAoZXhpc3Rpbmcud2F0ZXIpIHsgdGhpcy53YXRlckdyb3VwLnJlbW92ZShleGlzdGluZy53YXRlcik7IGV4aXN0aW5nLndhdGVyLmdlb21ldHJ5LmRpc3Bvc2UoKTsgfVxuICAgIH1cblxuICAgIGNvbnN0IG1lc2hUMCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIGNvbnN0IHsgZ2VvbWV0cnksIHRyaWFuZ2xlcyB9ID0gbWVzaENodW5rKHRoaXMud29ybGQsIGNodW5rKTtcbiAgICByZWNvcmRTYW1wbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCBwZXJmb3JtYW5jZS5ub3coKSAtIG1lc2hUMCk7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCB0ZXJyYWluTWF0ZXJpYWwpO1xuICAgIG1lc2gubmFtZSA9IGB2b3hlbF9jaHVua18ke2N4fV8ke2N6fWA7XG4gICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgICB0aGlzLm5lYXJHcm91cC5hZGQobWVzaCk7XG4gICAgY29uc3Qgd2F0ZXIgPSBtZXNoQ2h1bmtXYXRlcih0aGlzLndvcmxkLCBjaHVuayk7XG4gICAgaWYgKHdhdGVyKSB0aGlzLndhdGVyR3JvdXAuYWRkKHdhdGVyKTtcbiAgICB0aGlzLmNodW5rcy5zZXQoa2V5LCB7IG1lc2gsIHdhdGVyLCB0cmlhbmdsZXM6IHRyaWFuZ2xlcyArICh3YXRlcj8udXNlckRhdGEud2F0ZXJUcmlhbmdsZXMgPz8gMCkgfSk7XG4gICAgdGhpcy5sb2FkZWQuYWRkKGtleSk7XG4gICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgfVxuXG4gIHByaXZhdGUgZGlzcG9zZUNodW5rKGtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgdmlldyA9IHRoaXMuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICh2aWV3KSB7XG4gICAgICB0aGlzLm5lYXJHcm91cC5yZW1vdmUodmlldy5tZXNoKTtcbiAgICAgIHZpZXcubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICBpZiAodmlldy53YXRlcikgeyB0aGlzLndhdGVyR3JvdXAucmVtb3ZlKHZpZXcud2F0ZXIpOyB2aWV3LndhdGVyLmdlb21ldHJ5LmRpc3Bvc2UoKTsgfVxuICAgICAgdGhpcy5jaHVua3MuZGVsZXRlKGtleSk7XG4gICAgfVxuICAgIHRoaXMubG9hZGVkLmRlbGV0ZShrZXkpO1xuICAgIHRoaXMubWVzaFN0YW1wLmRlbGV0ZShrZXkpO1xuICAgIGlmICh0aGlzLnBpbm5lZC5oYXMoa2V5KSkgcmV0dXJuO1xuICAgIHRoaXMud29ybGQuZGlydHkuZGVsZXRlKGtleSk7XG4gICAgZXZpY3RDaHVuayh0aGlzLndvcmxkLCBrZXkpO1xuICB9XG5cbiAgcHJpdmF0ZSByZWJ1aWxkQ2h1bmsoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgIHRoaXMuYnVpbGRDaHVuayhjeCwgY3opO1xuICB9XG5cbiAgLyoqIFJlLW1lc2ggZGlydHkgbG9hZGVkIGNodW5rcyBuZWFyZXN0LWZpcnN0LCBzaGFyaW5nIHRoZSBmcmFtZSBidWRnZXQuICovXG4gIHByaXZhdGUgcmVidWlsZERpcnR5KGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBmcmFtZVN0YXJ0OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBjY3ggPSB3b3JsZFRvQ2h1bmtYKE1hdGgucm91bmQoZm9jdXMueCkpO1xuICAgIGNvbnN0IGNjeiA9IHdvcmxkVG9DaHVua1ooTWF0aC5yb3VuZChmb2N1cy56KSk7XG4gICAgY29uc3QgZGlydHk6IEFycmF5PHsga2V5OiBzdHJpbmc7IGQ6IG51bWJlciB9PiA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHRoaXMubG9hZGVkKSB7XG4gICAgICBpZiAoIXRoaXMud29ybGQuZGlydHkuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICAgIGRpcnR5LnB1c2goeyBrZXksIGQ6IChjeCAtIGNjeCkgKiogMiArIChjeiAtIGNjeikgKiogMiB9KTtcbiAgICB9XG4gICAgaWYgKGRpcnR5Lmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgIGRpcnR5LnNvcnQoKGEsIGIpID0+IGEuZCAtIGIuZCk7XG4gICAgaWYgKHRoaXMucG9vbCAmJiAhdGhpcy5wb29sLmZhaWxlZCkge1xuICAgICAgZm9yIChjb25zdCB7IGtleSB9IG9mIGRpcnR5KSBpZiAoIXRoaXMubWVzaFN0YW1wLmhhcyhrZXkpIHx8IHRoaXMud29ybGQuZGlydHkuaGFzKGtleSkpIHRoaXMucmVxdWVzdE1lc2goa2V5KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHJlYnVpbHQgPSAwO1xuICAgIGZvciAoY29uc3QgeyBrZXkgfSBvZiBkaXJ0eSkge1xuICAgICAgaWYgKHJlYnVpbHQgPiAwICYmIHBlcmZvcm1hbmNlLm5vdygpIC0gZnJhbWVTdGFydCA+PSB0aGlzLmZyYW1lQnVkZ2V0TXMpIGJyZWFrO1xuICAgICAgdGhpcy5yZWJ1aWxkQ2h1bmsoa2V5KTtcbiAgICAgIHJlYnVpbHQrKztcbiAgICB9XG4gICAgaWYgKHJlYnVpbHQgPiAwKSB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gIH1cblxuICAvKipcbiAgICogQ2h1bmsgbGlmZXRpbWUgcG9saWN5LiBNZXNoaW5nIGdlbmVyYXRlcyBhIHJpbmcgb2YgbmVpZ2hib3VyIGNodW5rcywgYW5kXG4gICAqIHNpbXVsYXRpb24gcXVlcmllcyBjYW4gZ2VuZXJhdGUgbW9yZTsgbm9uZSBvZiB0aG9zZSB3ZXJlIGV2ZXIgcmVsZWFzZWQuXG4gICAqIFJlc2lkZW50IGNodW5rIGJ5dGVzIGFyZSBkZXJpdmVkIChyZWdlbmVyYXRlZCBmcm9tIHNlZWQgKyBkdXJhYmxlIGVkaXRzKSxcbiAgICogc28gYW55dGhpbmcgb3V0c2lkZSB0aGUga2VlcCByYWRpdXMgdGhhdCBpcyBub3QgbG9hZGVkIG9yIHBpbm5lZCBpcyBmcmVlZC5cbiAgICovXG4gIHByaXZhdGUgc3dlZXBSZXNpZGVudChmb2N1czogVEhSRUUuVmVjdG9yMyk6IHZvaWQge1xuICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICBjb25zdCBrZWVwID0gdGhpcy5uZWFyUmFkaXVzICsgMjtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbLi4udGhpcy53b3JsZC5jaHVua3Mua2V5cygpXSkge1xuICAgICAgaWYgKHRoaXMubG9hZGVkLmhhcyhrZXkpIHx8IHRoaXMucGlubmVkLmhhcyhrZXkpIHx8IHRoaXMubWVzaFN0YW1wLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgICBpZiAoTWF0aC5hYnMoY3ggLSBjY3gpIDw9IGtlZXAgJiYgTWF0aC5hYnMoY3ogLSBjY3opIDw9IGtlZXApIGNvbnRpbnVlO1xuICAgICAgZXZpY3RDaHVuayh0aGlzLndvcmxkLCBrZXkpO1xuICAgICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgICAgIHRoaXMuc3dlcHRDaHVua3MrKztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogS2VlcCB0aGUgY2h1bmtzIHVuZGVyIGEgd29ybGQtc3BhY2UgcmVjdGFuZ2xlIHJlc2lkZW50IChmb3IgZXhhbXBsZSB0aGVcbiAgICogc2V0dGxlbWVudCBlbnZlbG9wZSB0aGF0IGNvbnN0cnVjdGlvbiBwcmV2aWV3cyBxdWVyeSBzZXZlcmFsIHRpbWVzIGEgc2Vjb25kKS5cbiAgICovXG4gIHBpblJlY3QobWluWDogbnVtYmVyLCBtaW5aOiBudW1iZXIsIG1heFg6IG51bWJlciwgbWF4WjogbnVtYmVyKTogdm9pZCB7XG4gICAgZm9yIChsZXQgY3ogPSB3b3JsZFRvQ2h1bmtaKG1pblopIC0gMTsgY3ogPD0gd29ybGRUb0NodW5rWihtYXhaKSArIDE7IGN6KyspIHtcbiAgICAgIGZvciAobGV0IGN4ID0gd29ybGRUb0NodW5rWChtaW5YKSAtIDE7IGN4IDw9IHdvcmxkVG9DaHVua1gobWF4WCkgKyAxOyBjeCsrKSB7XG4gICAgICAgIGlmIChjeCA+PSAwICYmIGN6ID49IDAgJiYgY3ggPCBDSFVOS1NfUEVSX1NJREUgJiYgY3ogPCBDSFVOS1NfUEVSX1NJREUpIHRoaXMucGlubmVkLmFkZChjaHVua0tleShjeCwgY3opKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgcmVzaWRlbnRDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMud29ybGQuY2h1bmtzLnNpemU7IH1cbiAgZ2V0IHBlbmRpbmdDaHVua0J1aWxkcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wZW5kaW5nQ2h1bmtzOyB9XG4gIGdldCBldmljdGVkQnlTd2VlcCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5zd2VwdENodW5rczsgfVxuXG4gIHJlYnVpbGRBcm91bmQoeDogbnVtYmVyLCB6OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgICBmb3IgKGxldCBkeiA9IC0xOyBkeiA8PSAxOyBkeisrKSB7XG4gICAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSAxOyBkeCsrKSB7XG4gICAgICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4ICsgZHgsIGN6ICsgZHopO1xuICAgICAgICB0aGlzLm1lc2hTdGFtcC5kZWxldGUoa2V5KTtcbiAgICAgICAgaWYgKHRoaXMubG9hZGVkLmhhcyhrZXkpKSB0aGlzLnJlYnVpbGRDaHVuayhrZXkpO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gICAgaWYgKHRoaXMubWFjcm8ubGVuZ3RoKSB0aGlzLnJlYnVpbGRNYWNybyh0aGlzLm1hY3JvRm9jdXMsIHRoaXMubW9kZSwgdHJ1ZSk7XG4gIH1cblxuICBwcml2YXRlIHJlYnVpbGRNYWNybyhmb2N1czogVEhSRUUuVmVjdG9yMywgbW9kZTogVmlld01vZGUsIGZvcmNlOiBib29sZWFuKTogdm9pZCB7XG4gICAgaWYgKCFmb3JjZSAmJiB0aGlzLm1hY3JvTW9kZSA9PT0gbW9kZSkge1xuICAgICAgY29uc3QgbW92ZWQgPSBNYXRoLmh5cG90KGZvY3VzLnggLSB0aGlzLm1hY3JvRm9jdXMueCwgZm9jdXMueiAtIHRoaXMubWFjcm9Gb2N1cy56KTtcbiAgICAgIGlmIChtb2RlID09PSAnbWFwJyB8fCBtb3ZlZCA8PSA0OCkgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBtYWNyb1QwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgZm9yIChjb25zdCB0aWxlIG9mIHRoaXMubWFjcm8pIHtcbiAgICAgIHRoaXMubWFjcm9Hcm91cC5yZW1vdmUodGlsZSk7XG4gICAgICB0aWxlLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICB9XG4gICAgdGhpcy5tYWNybyA9IFtdO1xuICAgIGNvbnN0IHN0ZXAgPSBtb2RlID09PSAnbWFwJyA/IHRoaXMubWFwTWFjcm9TdGVwIDogdGhpcy53b3JsZE1hY3JvU3RlcDtcbiAgICBsZXQgaG9sZTogTWFjcm9Ib2xlIHwgdW5kZWZpbmVkO1xuICAgIGlmIChtb2RlICE9PSAnbWFwJykge1xuICAgICAgY29uc3QgY2N4ID0gd29ybGRUb0NodW5rWChNYXRoLnJvdW5kKGZvY3VzLngpKTtcbiAgICAgIGNvbnN0IGNjeiA9IHdvcmxkVG9DaHVua1ooTWF0aC5yb3VuZChmb2N1cy56KSk7XG4gICAgICBob2xlID0ge1xuICAgICAgICBtaW5YOiBjaHVua09yaWdpblgoY2N4IC0gdGhpcy5uZWFyUmFkaXVzKSxcbiAgICAgICAgbWF4WDogY2h1bmtPcmlnaW5YKGNjeCArIHRoaXMubmVhclJhZGl1cykgKyBDSFVOS19TSVpFLFxuICAgICAgICBtaW5aOiBjaHVua09yaWdpblooY2N6IC0gdGhpcy5uZWFyUmFkaXVzKSxcbiAgICAgICAgbWF4WjogY2h1bmtPcmlnaW5aKGNjeiArIHRoaXMubmVhclJhZGl1cykgKyBDSFVOS19TSVpFLFxuICAgICAgfTtcbiAgICAgIHRoaXMuZmFyV2F0ZXJIb2xlLnZhbHVlLnNldChob2xlLm1pblgsIGhvbGUubWluWiwgaG9sZS5tYXhYLCBob2xlLm1heFopO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBidWlsZE1hY3JvTWVzaCh0aGlzLndvcmxkLCB7IHN0ZXAsIGhvbGUsIGZvY3VzOiBtb2RlID09PSAnbWFwJyA/IHVuZGVmaW5lZCA6IGZvY3VzIH0pO1xuICAgIHRoaXMubWFjcm8gPSByZXN1bHQubWVzaGVzO1xuICAgIHRoaXMubWFjcm9UcmlhbmdsZXMgPSByZXN1bHQudHJpYW5nbGVzO1xuICAgIHRoaXMubWFjcm9Hcm91cC5hZGQoLi4ucmVzdWx0Lm1lc2hlcyk7XG4gICAgdGhpcy5tYWNyb0ZvY3VzLmNvcHkoZm9jdXMpO1xuICAgIHRoaXMubWFjcm9Nb2RlID0gbW9kZTtcbiAgICB0aGlzLm1hY3JvRWRpdEtleSA9IG1hY3JvRWRpdEtleSh0aGlzLndvcmxkKTtcbiAgICByZWNvcmRTYW1wbGUodGhpcy5tYWNyb1NhbXBsZXMsIHBlcmZvcm1hbmNlLm5vdygpIC0gbWFjcm9UMCk7XG4gICAgaWYgKHJlc3VsdC5zYW1wbGVDYWNoZWQpIHRoaXMubWFjcm9DYWNoZUhpdHMrKztcbiAgICBlbHNlIHJlY29yZFNhbXBsZSh0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcywgcmVzdWx0LnNhbXBsZU1zKTtcbiAgfVxuXG4gIGdldCBsb2FkZWRDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubG9hZGVkLnNpemU7IH1cbiAgZ2V0IGxvYWRlZENodW5rS2V5cygpOiBSZWFkb25seVNldDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMubG9hZGVkOyB9XG4gIGdldCBuZWFyVHJpYW5nbGVzKCk6IG51bWJlciB7XG4gICAgbGV0IHQgPSAwO1xuICAgIGZvciAoY29uc3QgdiBvZiB0aGlzLmNodW5rcy52YWx1ZXMoKSkgdCArPSB2LnRyaWFuZ2xlcztcbiAgICByZXR1cm4gdDtcbiAgfVxuICBnZXQgbWFjcm9UcmlhbmdsZUNvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm1hY3JvVHJpYW5nbGVzOyB9XG4gIC8qKiBUcmlhbmdsZXMgb2YgdGhlIG1hY3JvIHRpbGVzIGxlZnQgdmlzaWJsZSBieSB0aGUgbGFzdCBjdWxsTWFjcm8gY2FsbC4gKi9cbiAgZ2V0IG1hY3JvVmlzaWJsZVRyaWFuZ2xlcygpOiBudW1iZXIge1xuICAgIGxldCB0ID0gMDtcbiAgICBmb3IgKGNvbnN0IHRpbGUgb2YgdGhpcy5tYWNybykgaWYgKHRpbGUudmlzaWJsZSkgdCArPSAodGlsZS5nZW9tZXRyeS5pbmRleD8uY291bnQgPz8gMCkgLyAzO1xuICAgIHJldHVybiB0O1xuICB9XG5cbiAgLyoqXG4gICAqIEhpZGUgbWFjcm8gdGlsZXMgd2hvc2UgYm91bmRpbmcgYm94IGlzIG91dHNpZGUgdGhlIGNhbWVyYSBmcnVzdHVtLiBUaHJlZVxuICAgKiBvbmx5IGN1bGxzIGJ5IGJvdW5kaW5nIHNwaGVyZSwgd2hpY2ggbmV2ZXIgcmVqZWN0cyBhIDI1NiBtIHRpbGUgbmV4dCB0b1xuICAgKiB0aGUgY2FtZXJhOyB0aGUgYm94IHRlc3QgYWxzbyBkcm9wcyBmYXIgdGlsZXMgYmVsb3cgdGhlIGZydXN0dW0gd2hlbiB0aGVcbiAgICogY2FtZXJhIHBpdGNoZXMgZG93bi4gUHJlc2VudGF0aW9uIG9ubHksIGNhbGwgb25jZSBwZXIgZnJhbWUgYmVmb3JlIHJlbmRlci5cbiAgICovXG4gIGN1bGxNYWNybyhjYW1lcmE6IFRIUkVFLkNhbWVyYSk6IHZvaWQge1xuICAgIGlmICh0aGlzLm1hY3JvLmxlbmd0aCA8PSAxKSB7IGZvciAoY29uc3QgdGlsZSBvZiB0aGlzLm1hY3JvKSB0aWxlLnZpc2libGUgPSB0cnVlOyByZXR1cm47IH1cbiAgICBjYW1lcmEudXBkYXRlTWF0cml4V29ybGQoKTtcbiAgICBfY3VsbE1hdHJpeC5tdWx0aXBseU1hdHJpY2VzKGNhbWVyYS5wcm9qZWN0aW9uTWF0cml4LCBjYW1lcmEubWF0cml4V29ybGRJbnZlcnNlKTtcbiAgICBfY3VsbEZydXN0dW0uc2V0RnJvbVByb2plY3Rpb25NYXRyaXgoX2N1bGxNYXRyaXgpO1xuICAgIGZvciAoY29uc3QgdGlsZSBvZiB0aGlzLm1hY3JvKSB7XG4gICAgICBjb25zdCBib3ggPSB0aWxlLmdlb21ldHJ5LmJvdW5kaW5nQm94O1xuICAgICAgdGlsZS52aXNpYmxlID0gIWJveCB8fCBfY3VsbEZydXN0dW0uaW50ZXJzZWN0c0JveChib3gpO1xuICAgIH1cbiAgfVxuICBnZXQgZHJhd0NhbGxzKCk6IG51bWJlciB7XG4gICAgbGV0IHdhdGVyID0gMDtcbiAgICBmb3IgKGNvbnN0IHYgb2YgdGhpcy5jaHVua3MudmFsdWVzKCkpIGlmICh2LndhdGVyKSB3YXRlcisrO1xuICAgIGxldCBtYWNybyA9IDA7XG4gICAgZm9yIChjb25zdCB0aWxlIG9mIHRoaXMubWFjcm8pIGlmICh0aWxlLnZpc2libGUpIG1hY3JvKys7XG4gICAgcmV0dXJuIHRoaXMubG9hZGVkLnNpemUgKyB3YXRlciArIG1hY3JvICsgMTtcbiAgfVxuICBnZXQgbmVhclJhZGl1c0NodW5rcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5uZWFyUmFkaXVzOyB9XG4gIC8qKiBDbGVhciB0aGUgcm9sbGluZyB0aW1pbmcgd2luZG93IGJlZm9yZSBhIG1lYXN1cmVtZW50IHJ1bi4gKi9cbiAgcmVzZXRQZXJmKCk6IHZvaWQge1xuICAgIHRoaXMuY2h1bmtHZW5TYW1wbGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5jaHVua01lc2hTYW1wbGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5tYWNyb1NhbXBsZXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcy5sZW5ndGggPSAwO1xuICAgIHRoaXMubWFjcm9DYWNoZUhpdHMgPSAwO1xuICB9XG4gIC8qKiBSb2xsaW5nIGJ1aWxkIHRpbWluZ3MgaW4gbWlsbGlzZWNvbmRzLCBmb3IgdGhlIHBlcmZvcm1hbmNlIGV2aWRlbmNlLiAqL1xuICBnZXQgc3RyZWFtUGVyZigpOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgICByZXR1cm4ge1xuICAgICAgY2h1bmtHZW5QNTA6IHBlcmNlbnRpbGUodGhpcy5jaHVua0dlblNhbXBsZXMsIDAuNSksXG4gICAgICBjaHVua0dlblA5NTogcGVyY2VudGlsZSh0aGlzLmNodW5rR2VuU2FtcGxlcywgMC45NSksXG4gICAgICBjaHVua0dlbk1heDogcGVyY2VudGlsZSh0aGlzLmNodW5rR2VuU2FtcGxlcywgMSksXG4gICAgICBjaHVua01lc2hQNTA6IHBlcmNlbnRpbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCAwLjUpLFxuICAgICAgY2h1bmtNZXNoUDk1OiBwZXJjZW50aWxlKHRoaXMuY2h1bmtNZXNoU2FtcGxlcywgMC45NSksXG4gICAgICBjaHVua01lc2hNYXg6IHBlcmNlbnRpbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCAxKSxcbiAgICAgIG1hY3JvUDUwOiBwZXJjZW50aWxlKHRoaXMubWFjcm9TYW1wbGVzLCAwLjUpLFxuICAgICAgbWFjcm9NYXg6IHBlcmNlbnRpbGUodGhpcy5tYWNyb1NhbXBsZXMsIDEpLFxuICAgICAgbWFjcm9TYW1wbGVQNTA6IHBlcmNlbnRpbGUodGhpcy5tYWNyb1NhbXBsZVNhbXBsZXMsIDAuNSksXG4gICAgICBtYWNyb1NhbXBsZU1heDogcGVyY2VudGlsZSh0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcywgMSksXG4gICAgICBtYWNyb0NhY2hlSGl0czogdGhpcy5tYWNyb0NhY2hlSGl0cyxcbiAgICAgIGNodW5rU2FtcGxlczogdGhpcy5jaHVua0dlblNhbXBsZXMubGVuZ3RoLFxuICAgICAgbWFjcm9TYW1wbGVzOiB0aGlzLm1hY3JvU2FtcGxlcy5sZW5ndGgsXG4gICAgfTtcbiAgfVxufVxuIiwgIi8vIFJlbmRlciBsYXllciBcdTIwMTQgbmVhciB3YXRlciBzdXJmYWNlcyBidWlsdCBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHdhdGVyIHZveGVscy5cbi8vXG4vLyBHZW9tZXRyeSBjb21lcyBmcm9tIHRoZSB2b3hlbCB2b2x1bWUgKHNvIGVkaXRzLCBkdWcgcGl0cyBhbmQgdGhlIHYyIG1vdW50YWluXG4vLyByaXZlciBhcmUgZXhhY3QpLiBFYWNoIHdhdGVyIGNvbHVtbidzIHRvcCBnZXRzIGEgcXVhZCBjYXJyeWluZzpcbi8vICAgYUZsb3cgIFx1MjAxNCBzdXJmYWNlIGN1cnJlbnQgKGRpcmVjdGlvbiAqIHNwZWVkLCBtL3MpIGZyb20gc2ltIEh5ZHJvbG9neSxcbi8vICAgYURlcHRoIFx1MjAxNCB3YXRlciBkZXB0aCB0byB0aGUgYmVkIChtZXRyZXMpLFxuLy8gICBhRm9hbSAgXHUyMDE0IHNob3JlIC8gY2FzY2FkZSBmb2FtIHdlaWdodC5cbi8vIFdoZXJlIGEgd2F0ZXIgc3VyZmFjZSBzdGFuZHMgYWJvdmUgYSBsb3dlciBuZWlnaGJvdXIgKGEgY2FzY2FkZSBvciBmYWxsKSwgYVxuLy8gdmVydGljYWwgc2hlZXQgaXMgZW1pdHRlZCBkb3duIHRvIHRoZSBuZWlnaGJvdXIncyBzdXJmYWNlLlxuLy9cbi8vIEh5ZHJvbG9neSBpcyBzaW11bGF0aW9uIGRhdGE7IHJpcHBsZXMsIGZvYW0gYW5kIHRyYW5zcGFyZW5jeSBoZXJlIGFyZVxuLy8gcHJlc2VudGF0aW9uIG9ubHkgYW5kIG5ldmVyIGZlZWQgYmFjayBpbnRvIHN0YXRlLlxuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHBhbGV0dGUgZnJvbSAnLi4vZGF0YS9wYWxldHRlLmpzb24nO1xuaW1wb3J0IHtcbiAgV29ybGQsIFZveGVsQ2h1bmssIE1BVCwgQ0hVTktfU0laRSwgWV9NSU4sIFlfTUFYLCBpc1NvbGlkLFxuICBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWiwgbG9jYWxJbmRleCwgeVRvSW5kZXgsIGdldFZveGVsLCBoeWRyb2xvZ3lGb3IsXG59IGZyb20gJy4uL3NpbS93b3JsZCc7XG5cbmNvbnN0IE0gPSBwYWxldHRlLm1hdGVyaWFscyBhcyBSZWNvcmQ8c3RyaW5nLCB7IGhleDogc3RyaW5nIH0+O1xuY29uc3QgSCA9IChrOiBzdHJpbmcpID0+IG5ldyBUSFJFRS5Db2xvcihNW2tdLmhleCk7XG5cbi8qKiBTaGFyZWQgdGltZSB1bmlmb3JtIGZvciBldmVyeSB3YXRlciBtYXRlcmlhbC4gKi9cbmV4cG9ydCBjb25zdCB3YXRlclRpbWUgPSB7IHZhbHVlOiAwIH07XG5cbmZ1bmN0aW9uIG1ha2VXYXRlck1hdGVyaWFsKCk6IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwge1xuICBjb25zdCBtYXQgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XG4gICAgdmVydGV4Q29sb3JzOiB0cnVlLCB0cmFuc3BhcmVudDogdHJ1ZSwgZGVwdGhXcml0ZTogZmFsc2UsIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUsXG4gIH0pO1xuICBtYXQub25CZWZvcmVDb21waWxlID0gKHNoYWRlcikgPT4ge1xuICAgIHNoYWRlci51bmlmb3Jtcy51VGltZSA9IHdhdGVyVGltZTtcbiAgICBzaGFkZXIudW5pZm9ybXMudVNoYWxsb3cgPSB7IHZhbHVlOiBIKCd3YXRlcl9zaGFsbG93JykgfTtcbiAgICBzaGFkZXIudW5pZm9ybXMudU1pZCA9IHsgdmFsdWU6IEgoJ3dhdGVyX21pZCcpIH07XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVEZWVwID0geyB2YWx1ZTogSCgnd2F0ZXJfZGVlcCcpIH07XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVSaW0gPSB7IHZhbHVlOiBIKCd3YXRlcl9yaW0nKSB9O1xuICAgIHNoYWRlci52ZXJ0ZXhTaGFkZXIgPSBzaGFkZXIudmVydGV4U2hhZGVyXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCBgI2luY2x1ZGUgPGNvbW1vbj5cbmF0dHJpYnV0ZSB2ZWMyIGFGbG93O1xuYXR0cmlidXRlIGZsb2F0IGFEZXB0aDtcbmF0dHJpYnV0ZSBmbG9hdCBhRm9hbTtcbmF0dHJpYnV0ZSBmbG9hdCBhU2hlZXQ7XG52YXJ5aW5nIHZlYzIgdkZsb3c7XG52YXJ5aW5nIGZsb2F0IHZEZXB0aDtcbnZhcnlpbmcgZmxvYXQgdkZvYW07XG52YXJ5aW5nIGZsb2F0IHZTaGVldDtcbnZhcnlpbmcgdmVjMyB2V29ybGRQb3NXO2ApXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD4nLCBgI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD5cbnZGbG93ID0gYUZsb3c7IHZEZXB0aCA9IGFEZXB0aDsgdkZvYW0gPSBhRm9hbTsgdlNoZWV0ID0gYVNoZWV0O1xudldvcmxkUG9zVyA9IChtb2RlbE1hdHJpeCAqIHZlYzQodHJhbnNmb3JtZWQsIDEuMCkpLnh5ejtgKTtcbiAgICBzaGFkZXIuZnJhZ21lbnRTaGFkZXIgPSBzaGFkZXIuZnJhZ21lbnRTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsIGAjaW5jbHVkZSA8Y29tbW9uPlxudW5pZm9ybSBmbG9hdCB1VGltZTtcbnVuaWZvcm0gdmVjMyB1U2hhbGxvdzsgdW5pZm9ybSB2ZWMzIHVNaWQ7IHVuaWZvcm0gdmVjMyB1RGVlcDsgdW5pZm9ybSB2ZWMzIHVSaW07XG52YXJ5aW5nIHZlYzIgdkZsb3c7XG52YXJ5aW5nIGZsb2F0IHZEZXB0aDtcbnZhcnlpbmcgZmxvYXQgdkZvYW07XG52YXJ5aW5nIGZsb2F0IHZTaGVldDtcbnZhcnlpbmcgdmVjMyB2V29ybGRQb3NXO1xuZmxvYXQgd0hhc2godmVjMiBwKSB7IHJldHVybiBmcmFjdChzaW4oZG90KHAsIHZlYzIoMTI3LjEsIDMxMS43KSkpICogNDM3NTguNTQ1Myk7IH1cbmZsb2F0IHdOb2lzZSh2ZWMyIHApIHtcbiAgdmVjMiBpID0gZmxvb3IocCksIGYgPSBmcmFjdChwKTtcbiAgZiA9IGYgKiBmICogKDMuMCAtIDIuMCAqIGYpO1xuICByZXR1cm4gbWl4KG1peCh3SGFzaChpKSwgd0hhc2goaSArIHZlYzIoMSwgMCkpLCBmLngpLCBtaXgod0hhc2goaSArIHZlYzIoMCwgMSkpLCB3SGFzaChpICsgdmVjMigxLCAxKSksIGYueCksIGYueSk7XG59YClcbiAgICAgIC5yZXBsYWNlKCd2ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UsIG9wYWNpdHkgKTsnLCBgXG5mbG9hdCBzcGVlZCA9IGxlbmd0aCh2Rmxvdyk7XG4vLyBBZHZlY3QgdGhlIHBhdHRlcm4gZG93bnN0cmVhbS4gUXVhbnRpc2VkIHRvIDAuMjUgbSBjZWxscyBzbyByaXBwbGVzIHJlYWQgYXNcbi8vIGJsb2NrLWJ1aWx0IGZhY2V0cyByYXRoZXIgdGhhbiBzbW9vdGggZ3JhZGllbnRzLlxudmVjMiBwID0gdldvcmxkUG9zVy54ejtcbnZlYzIgYWR2ID0gcCAtIHZGbG93ICogdVRpbWU7XG52ZWMyIGNlbGwgPSBmbG9vcihhZHYgKiA0LjApIC8gNC4wO1xuZmxvYXQgbjEgPSB3Tm9pc2UoY2VsbCAqIDAuNTUpO1xuZmxvYXQgbjIgPSB3Tm9pc2UoY2VsbCAqIDEuNyArIHZlYzIodVRpbWUgKiAwLjA3LCAtdVRpbWUgKiAwLjA1KSk7XG5mbG9hdCByaXBwbGUgPSBuMSAqIDAuNiArIG4yICogMC40O1xuLy8gU3RpbGwgd2F0ZXIgKHNlYSwgbGFrZSkgZ2V0cyBhIHNsb3cgc3dlbGwgaW5zdGVhZCBvZiBhIGN1cnJlbnQuXG5mbG9hdCBzd2VsbCA9IDAuNSArIDAuNSAqIHNpbihkb3QocCwgdmVjMigwLjExLCAwLjA3KSkgKyB1VGltZSAqIDAuNik7XG5yaXBwbGUgPSBtaXgobWl4KHJpcHBsZSwgc3dlbGwsIDAuNSksIHJpcHBsZSwgY2xhbXAoc3BlZWQgKiAyLjAsIDAuMCwgMS4wKSk7XG5mbG9hdCBkID0gY2xhbXAodkRlcHRoIC8gNC4wLCAwLjAsIDEuMCk7XG52ZWMzIHdhdGVyID0gbWl4KHVTaGFsbG93LCB1TWlkLCBzbW9vdGhzdGVwKDAuMCwgMC41LCBkKSk7XG53YXRlciA9IG1peCh3YXRlciwgdURlZXAsIHNtb290aHN0ZXAoMC41LCAxLjAsIGQpKTtcbndhdGVyICo9IDAuOSArIDAuMiAqIHJpcHBsZTtcbi8vIFN0cmVha3MgYWxvbmcgZmFzdCBjdXJyZW50LCBmb2FtIGF0IHNob3JlcyBhbmQgY2FzY2FkZXMuXG5mbG9hdCBzdHJlYWsgPSBzdGVwKDAuNzggLSBjbGFtcChzcGVlZCAqIDAuMDYsIDAuMCwgMC4yKSwgbjIpICogY2xhbXAoc3BlZWQgKiAwLjUsIDAuMCwgMS4wKTtcbmZsb2F0IGZvYW1Ob2lzZSA9IHN0ZXAoMC40NSwgd05vaXNlKGNlbGwgKiAyLjMgKyB1VGltZSAqIDAuMykpO1xuZmxvYXQgZm9hbSA9IGNsYW1wKHZGb2FtICogZm9hbU5vaXNlICsgc3RyZWFrICogMC42LCAwLjAsIDEuMCk7XG4vLyBGYWxsaW5nIHNoZWV0czogZmFzdCB2ZXJ0aWNhbCBzdHJlYWtzLlxuaWYgKHZTaGVldCA+IDAuNSkge1xuICBmbG9hdCBmYWxsID0gd05vaXNlKHZlYzIoZmxvb3IodldvcmxkUG9zVy54ICogNC4wICsgdldvcmxkUG9zVy56ICogNC4wKSwgZmxvb3IoKHZXb3JsZFBvc1cueSArIHVUaW1lICogMy41KSAqIDMuMCkpKTtcbiAgZm9hbSA9IG1heChmb2FtLCBzdGVwKDAuMzUsIGZhbGwpKTtcbn1cbnZlYzMgY29sID0gbWl4KHdhdGVyLCB1UmltICogMS4wOCwgZm9hbSk7XG5mbG9hdCBhbHBoYSA9IG1peCgwLjU1LCAwLjksIHNtb290aHN0ZXAoMC40LCAzLjAsIHZEZXB0aCkpO1xuYWxwaGEgPSBtYXgoYWxwaGEsIGZvYW0gKiAwLjk1KTtcbmlmICh2U2hlZXQgPiAwLjUpIGFscGhhID0gbWF4KGFscGhhLCAwLjgyKTtcbnZlYzQgZGlmZnVzZUNvbG9yID0gdmVjNCggZGlmZnVzZSAqIGNvbCwgYWxwaGEgKiBvcGFjaXR5ICk7YCk7XG4gIH07XG4gIHJldHVybiBtYXQ7XG59XG5cbmV4cG9ydCBjb25zdCBuZWFyV2F0ZXJNYXRlcmlhbCA9IG1ha2VXYXRlck1hdGVyaWFsKCk7XG5cbi8qKiBNZXNoIHRoZSB3YXRlciBzdXJmYWNlcyBvZiBvbmUgY2h1bms7IG51bGwgd2hlbiB0aGUgY2h1bmsgaG9sZHMgbm8gd2F0ZXIuICovXG5leHBvcnQgZnVuY3Rpb24gbWVzaENodW5rV2F0ZXIod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IFRIUkVFLk1lc2ggfCBudWxsIHtcbiAgY29uc3QgaHlkcm8gPSBoeWRyb2xvZ3lGb3Iod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24pO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgY29uc3QgbGV2ZWxzID0gbmV3IEludDE2QXJyYXkoQ0hVTktfU0laRSAqIENIVU5LX1NJWkUpLmZpbGwoLTk5OTkpO1xuICBjb25zdCBiZWRzID0gbmV3IEludDE2QXJyYXkoQ0hVTktfU0laRSAqIENIVU5LX1NJWkUpO1xuXG4gIC8vIFdhdGVyIHN1cmZhY2UgcGVyIGNvbHVtbjogdGhlIGZpcnN0IG5vbi13YXRlciBjZWxsIGFib3ZlIHRoZSB3YXRlciB0aGF0XG4gIC8vIHN0YW5kcyBvbiB0aGlzIGNvbHVtbidzIHNvbGlkIHN1cmZhY2UuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29uc3QgYmVkID0gY2h1bmsuaGVpZ2h0c1tjb2xdICsgWV9NSU4gKyAxO1xuICAgICAgbGV0IHkgPSBiZWQ7XG4gICAgICB3aGlsZSAoeSA8IFlfTUFYICYmIGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0gPT09IE1BVC5XQVRFUikgeSsrO1xuICAgICAgaWYgKHkgPiBiZWQpIHsgbGV2ZWxzW2NvbF0gPSB5OyBiZWRzW2NvbF0gPSBiZWQ7IH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBwb3M6IG51bWJlcltdID0gW10sIG5ybTogbnVtYmVyW10gPSBbXSwgY2xyOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBmbG93OiBudW1iZXJbXSA9IFtdLCBkZXB0aDogbnVtYmVyW10gPSBbXSwgZm9hbTogbnVtYmVyW10gPSBbXSwgc2hlZXQ6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGlkeDogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgcHVzaCA9ICh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBueDogbnVtYmVyLCBueTogbnVtYmVyLCBuejogbnVtYmVyLFxuICAgIGZ4OiBudW1iZXIsIGZ6OiBudW1iZXIsIGRlcDogbnVtYmVyLCBmbzogbnVtYmVyLCBzaDogbnVtYmVyKSA9PiB7XG4gICAgcG9zLnB1c2goeCwgeSwgeik7IG5ybS5wdXNoKG54LCBueSwgbnopOyBjbHIucHVzaCgxLCAxLCAxKTtcbiAgICBmbG93LnB1c2goZngsIGZ6KTsgZGVwdGgucHVzaChkZXApOyBmb2FtLnB1c2goZm8pOyBzaGVldC5wdXNoKHNoKTtcbiAgfTtcbiAgY29uc3QgcXVhZCA9IChiYXNlOiBudW1iZXIpID0+IHsgaWR4LnB1c2goYmFzZSwgYmFzZSArIDEsIGJhc2UgKyAyLCBiYXNlLCBiYXNlICsgMiwgYmFzZSArIDMpOyB9O1xuXG4gIGNvbnN0IGxldmVsQXQgPSAod3g6IG51bWJlciwgd3o6IG51bWJlciwgbHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgaWYgKGx4ID49IDAgJiYgbHogPj0gMCAmJiBseCA8IENIVU5LX1NJWkUgJiYgbHogPCBDSFVOS19TSVpFKSByZXR1cm4gbGV2ZWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgICAvLyBOZWlnaGJvdXIgY2h1bms6IHJlYWQgdGhlIHZveGVscyAoY2h1bmtzIGFyZSBnZW5lcmF0ZWQgaW4gM3gzIHJpbmdzIGZvciBtZXNoaW5nKS5cbiAgICBsZXQgeSA9IFlfTUFYIC0gMTtcbiAgICB3aGlsZSAoeSA+IFlfTUlOICYmICFpc1NvbGlkKGdldFZveGVsKHdvcmxkLCB3eCwgeSwgd3opKSAmJiBnZXRWb3hlbCh3b3JsZCwgd3gsIHksIHd6KSAhPT0gTUFULldBVEVSKSB5LS07XG4gICAgcmV0dXJuIGdldFZveGVsKHdvcmxkLCB3eCwgeSwgd3opID09PSBNQVQuV0FURVIgPyB5ICsgMSA6IC05OTk5O1xuICB9O1xuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29uc3QgbGV2ZWwgPSBsZXZlbHNbY29sXTtcbiAgICAgIGlmIChsZXZlbCA9PT0gLTk5OTkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgeCA9IG94ICsgbHgsIHogPSBveiArIGx6O1xuICAgICAgY29uc3QgZiA9IGh5ZHJvLmZsb3dBdCh4ICsgMC41LCB6ICsgMC41LCBsZXZlbCk7XG4gICAgICBjb25zdCBmeCA9IGYuZHggKiBmLnNwZWVkLCBmeiA9IGYuZHogKiBmLnNwZWVkO1xuICAgICAgY29uc3QgZGVwID0gbGV2ZWwgLSBiZWRzW2NvbF07XG4gICAgICBsZXQgc2hvcmUgPSAwO1xuICAgICAgY29uc3Qgc2lkZXM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1sxLCAwXSwgWy0xLCAwXSwgWzAsIDFdLCBbMCwgLTFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2Ygc2lkZXMpIHtcbiAgICAgICAgY29uc3QgbSA9IGdldFZveGVsKHdvcmxkLCB4ICsgZHgsIGxldmVsIC0gMSwgeiArIGR6KTtcbiAgICAgICAgaWYgKGlzU29saWQobSkpIHNob3JlID0gMTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHkgPSBsZXZlbCAtIDAuMTtcbiAgICAgIGNvbnN0IGJhc2UgPSBwb3MubGVuZ3RoIC8gMztcbiAgICAgIGNvbnN0IGZvID0gTWF0aC5tYXgoc2hvcmUgKiAwLjY1LCBNYXRoLm1pbigxLCBmLnNwZWVkIC8gMy41KSk7XG4gICAgICBwdXNoKHgsIHksIHosIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBwdXNoKHgsIHksIHogKyAxLCAwLCAxLCAwLCBmeCwgZnosIGRlcCwgZm8sIDApO1xuICAgICAgcHVzaCh4ICsgMSwgeSwgeiArIDEsIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBwdXNoKHggKyAxLCB5LCB6LCAwLCAxLCAwLCBmeCwgZnosIGRlcCwgZm8sIDApO1xuICAgICAgcXVhZChiYXNlKTtcblxuICAgICAgLy8gQ2FzY2FkZSBzaGVldHMgdG93YXJkIGxvd2VyIHdhdGVyIChvciBvcGVuIGFpcikgb24gYW55IHNpZGUuXG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIHNpZGVzKSB7XG4gICAgICAgIGNvbnN0IG5MZXZlbCA9IGxldmVsQXQoeCArIGR4LCB6ICsgZHosIGx4ICsgZHgsIGx6ICsgZHopO1xuICAgICAgICBpZiAobkxldmVsID09PSAtOTk5OSB8fCBuTGV2ZWwgPj0gbGV2ZWwpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoaXNTb2xpZChnZXRWb3hlbCh3b3JsZCwgeCArIGR4LCBsZXZlbCAtIDEsIHogKyBkeikpKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgdG9wID0gbGV2ZWwgLSAwLjEsIGJvdHRvbSA9IG5MZXZlbCAtIDAuMTtcbiAgICAgICAgY29uc3QgYiA9IHBvcy5sZW5ndGggLyAzO1xuICAgICAgICAvLyBGYWNlIG9uIHRoZSBzaGFyZWQgZWRnZSwgb3JpZW50ZWQgdG93YXJkIHRoZSBsb3dlciBuZWlnaGJvdXIuXG4gICAgICAgIGNvbnN0IGV4ID0gZHggPiAwID8geCArIDEgOiBkeCA8IDAgPyB4IDogeCwgZXogPSBkeiA+IDAgPyB6ICsgMSA6IGR6IDwgMCA/IHogOiB6O1xuICAgICAgICBpZiAoZHggIT09IDApIHtcbiAgICAgICAgICBwdXNoKGV4LCB0b3AsIHosIGR4LCAwLCAwLCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKGV4LCB0b3AsIHogKyAxLCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaChleCwgYm90dG9tLCB6ICsgMSwgZHgsIDAsIDAsIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goZXgsIGJvdHRvbSwgeiwgZHgsIDAsIDAsIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHB1c2goeCwgdG9wLCBleiwgMCwgMCwgZHosIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goeCArIDEsIHRvcCwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKHggKyAxLCBib3R0b20sIGV6LCAwLCAwLCBkeiwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaCh4LCBib3R0b20sIGV6LCAwLCAwLCBkeiwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgIH1cbiAgICAgICAgcXVhZChiKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKGlkeC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICBjb25zdCBnID0gbmV3IFRIUkVFLkJ1ZmZlckdlb21ldHJ5KCk7XG4gIGcuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHBvcywgMykpO1xuICBnLnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUobnJtLCAzKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGNsciwgMykpO1xuICBnLnNldEF0dHJpYnV0ZSgnYUZsb3cnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShmbG93LCAyKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhRGVwdGgnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShkZXB0aCwgMSkpO1xuICBnLnNldEF0dHJpYnV0ZSgnYUZvYW0nLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShmb2FtLCAxKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhU2hlZXQnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShzaGVldCwgMSkpO1xuICBnLnNldEluZGV4KGlkeCk7XG4gIGcuY29tcHV0ZUJvdW5kaW5nU3BoZXJlKCk7XG4gIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnLCBuZWFyV2F0ZXJNYXRlcmlhbCk7XG4gIG1lc2gubmFtZSA9IGB3YXRlcl9jaHVua18ke2NodW5rLmN4fV8ke2NodW5rLmN6fWA7XG4gIG1lc2gucmVuZGVyT3JkZXIgPSAyO1xuICBtZXNoLnVzZXJEYXRhLndhdGVyVHJpYW5nbGVzID0gaWR4Lmxlbmd0aCAvIDM7XG4gIHJldHVybiBtZXNoO1xufVxuXG4vKipcbiAqIEN1dCBhIHJlY3Rhbmd1bGFyIGhvbGUgaW4gdGhlIGZhciAob3BhcXVlKSBzZWEgcGxhbmUgd2hlcmUgbmVhciBjaHVua3MgZHJhd1xuICogdGhlaXIgb3duIHRyYW5zcGFyZW50IHdhdGVyLCBzbyBzaGFsbG93cyBzaG93IHRoZSByZWFsIGJlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbGxGYXJXYXRlckhvbGUobWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsKTogeyB2YWx1ZTogVEhSRUUuVmVjdG9yNCB9IHtcbiAgY29uc3QgaG9sZSA9IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3I0KDAsIDAsIDAsIDApIH07XG4gIG1hdGVyaWFsLm9uQmVmb3JlQ29tcGlsZSA9IChzaGFkZXIpID0+IHtcbiAgICBzaGFkZXIudW5pZm9ybXMudUhvbGUgPSBob2xlO1xuICAgIHNoYWRlci52ZXJ0ZXhTaGFkZXIgPSBzaGFkZXIudmVydGV4U2hhZGVyXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCAnI2luY2x1ZGUgPGNvbW1vbj5cXG52YXJ5aW5nIHZlYzIgdkZhclhaOycpXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD4nLCAnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD5cXG52RmFyWFogPSAobW9kZWxNYXRyaXggKiB2ZWM0KHRyYW5zZm9ybWVkLCAxLjApKS54ejsnKTtcbiAgICBzaGFkZXIuZnJhZ21lbnRTaGFkZXIgPSBzaGFkZXIuZnJhZ21lbnRTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsICcjaW5jbHVkZSA8Y29tbW9uPlxcbnVuaWZvcm0gdmVjNCB1SG9sZTtcXG52YXJ5aW5nIHZlYzIgdkZhclhaOycpXG4gICAgICAucmVwbGFjZSgndmVjNCBkaWZmdXNlQ29sb3IgPSB2ZWM0KCBkaWZmdXNlLCBvcGFjaXR5ICk7JyxcbiAgICAgICAgJ2lmICh2RmFyWFoueCA+IHVIb2xlLnggJiYgdkZhclhaLnggPCB1SG9sZS56ICYmIHZGYXJYWi55ID4gdUhvbGUueSAmJiB2RmFyWFoueSA8IHVIb2xlLncpIGRpc2NhcmQ7XFxudmVjNCBkaWZmdXNlQ29sb3IgPSB2ZWM0KCBkaWZmdXNlLCBvcGFjaXR5ICk7Jyk7XG4gIH07XG4gIHJldHVybiBob2xlO1xufVxuIiwgIntcbiAgXCJzY2hlbWFcIjogXCJwYWxldHRlX3YyXCIsXG4gIFwiZGF0ZVwiOiBcIjIwMjYtMTAtMjJcIixcbiAgXCJzdGF0dXNcIjogXCJwcm9wb3NlZFwiLFxuICBcInNvdXJjZVwiOiBcIlJFRi0wMDIgKGh5YnJpZCB3b3JsZCByZWZlcmVuY2UpLCB2YWx1ZXMgc2FtcGxlZCBieSBleWU7IG51bWVyaWMgdmVyaWZpY2F0aW9uIHBlbmRpbmdcIixcbiAgXCJub3RlXCI6IFwiT25lIG1hdGVyaWFsIHBhbGV0dGUuIFRpbWUgb2YgZGF5IGlzIGV4cHJlc3NlZCBieSB0aGUgbGlnaHRpbmcgcHJlc2V0cyBiZWxvdywgbm90IGJ5IHJlcGFpbnRpbmcgbWF0ZXJpYWxzLlwiLFxuICBcIm1hdGVyaWFsc1wiOiB7XG4gICAgXCJncmFzc190b3BcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNzlCOTRDXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgbG93IGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX2hpZ2hcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEZDOTVFXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgbWlkIGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX3BlYWtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUFEMDZBXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgaGlnaCBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19jYXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUU5NDQwXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC4wLTAuNCBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0cmF0YV9vY2hyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNDOTlBNUZcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjQtMC42MiBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0cmF0YV9ydXN0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0I0NjMzQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuNjItMC44MCBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0b25lX3RvcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFNkRGQ0NcIixcbiAgICAgIFwicm9sZVwiOiBcImJhcmUgc3RvbmUgdG9wIHN1cmZhY2VcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9ib2R5X2FcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRENEM0JFXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJvZHksIGV2ZW4gNC41IG0gYmFuZFwiXG4gICAgfSxcbiAgICBcInN0b25lX2JvZHlfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEMUM3QUZcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYm9keSwgb2RkIDQuNSBtIGJhbmRcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9zaGFkZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCOUFFOTZcIixcbiAgICAgIFwicm9sZVwiOiBcImNyZXZpY2UgLyByZWNlc3NlZCBzdG9uZSBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJzYW5kXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0UzRDNBNlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2hvcmUgY2VsbHNcIlxuICAgIH0sXG4gICAgXCJzbm93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0VFRjFGNVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ2VuZXJhdG9yIHYyIHNub3dmaWVsZHMgYWJvdmUgdGhlIHNub3dsaW5lIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9za2luXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0Q5QTc3RVwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIHNraW4gKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3R1bmljXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0IzNEEzQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiZm91bmRlciB0dW5pYywgd2FybSByZWQgYWNjZW50IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90dW5pY19hbHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkU4Qzg2XCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlciB0dW5pYywgdGVhbCBhY2NlbnQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3Ryb3VzZXJzXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVCNDYzNlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIHRyb3VzZXJzIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9oYWlyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRBMzMyNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIGhhaXIgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX2Jvb3RzXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzMzMjgxRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIGJvb3RzIGFuZCBiZWx0IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfZGVlclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4QzVCM0FcIixcbiAgICAgIFwicm9sZVwiOiBcInJlZCBkZWVyIGNvYXQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV9saWdodFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEQ0M3QTRcIixcbiAgICAgIFwicm9sZVwiOiBcImRlZXIgYmVsbHksIGhhcmUgdGFpbCwgYW50bGVyIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfaGFyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QTg2NzBcIixcbiAgICAgIFwicm9sZVwiOiBcImhhcmUgY29hdCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX3Ryb3V0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGN0Y1RVwiLFxuICAgICAgXCJyb2xlXCI6IFwidHJvdXQgYmFjayAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX3Ryb3V0X2JlbGx5XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0Q4QzlBM1wiLFxuICAgICAgXCJyb2xlXCI6IFwidHJvdXQgYmVsbHkgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3BsYXN0ZXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRThEREM2XCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIHdhbGwgcGxhc3RlciAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGltYmVyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZBNDUzMFwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSB0aW1iZXIgZnJhbWUgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RpbWJlcl9saWdodFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4QTYxNDJcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgcGxhbmtzIGFuZCBkb29ycyAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGhhdGNoXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0M3QTI1N1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGhhdGNoIHJvb2YgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RoYXRjaF9kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlDN0IzQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGhhdGNoIHJvb2Ygc2hhZGUgY291cnNlIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF9zdG9uZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QjlBOTFcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgbWFzb25yeSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfc3RvbmVfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM3NDczNkNcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgbWFzb25yeSBqb2ludHMgYW5kIHBsaW50aCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcInByb3BfaXJvblwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzQTNBM0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImlyb24gZml0dGluZ3MgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJwcm9wX2dsb3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRkZEMjdGXCIsXG4gICAgICBcInJvbGVcIjogXCJsYW50ZXJuIGxpZ2h0IChlbWlzc2l2ZSwgZWZmZWN0IG9ubHkpIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfc2hhbGxvd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM2N0NGRDhcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoIDw9IDAuNSBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfbWlkXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNBQUZDNFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggfjEuNSBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfZGVlcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyQThGQThcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoID49IDQuMCBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfcmltXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0JGRUFGMFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2hvcmVsaW5lIHJpbSAvIGZvYW0gdGludFwiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9hXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVGQTgzRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBzaGFkZSBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkZCODRBXCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9jXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzdGQzM1NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBoaWdobGlnaHQgbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9waW5rXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0YyQTZDNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmxvc3NvbSBhY2NlbnQgc3BlY2llcyBvbmx5XCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X3BpbmtfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFODhGQjJcIixcbiAgICAgIFwicm9sZVwiOiBcImJsb3Nzb20gc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcInRydW5rXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZCNEEzM1wiLFxuICAgICAgXCJyb2xlXCI6IFwidHJlZSB0cnVua3NcIlxuICAgIH0sXG4gICAgXCJiYXJrX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNEUzNjI2XCIsXG4gICAgICBcInJvbGVcIjogXCJ0cnVuayBzaGFkZSwgc3R1bXBzXCJcbiAgICB9LFxuICAgIFwiY29uaWZlcl9waW5lXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRDOEE0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwicGluZSBuZWVkbGVzLCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjb25pZmVyX3BpbmVfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1QzlDNTNcIixcbiAgICAgIFwicm9sZVwiOiBcInBpbmUgbmVlZGxlcywgaGlnaGxpZ2h0XCJcbiAgICB9LFxuICAgIFwiY29uaWZlcl9zcHJ1Y2VcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkY2QjQ4XCIsXG4gICAgICBcInJvbGVcIjogXCJzcHJ1Y2UgbmVlZGxlcywgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiY29uaWZlcl9zcHJ1Y2VfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzRTdGNTZcIixcbiAgICAgIFwicm9sZVwiOiBcInNwcnVjZSBuZWVkbGVzLCBoaWdobGlnaHRcIlxuICAgIH0sXG4gICAgXCJiaXJjaF9iYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2RTFEM1wiLFxuICAgICAgXCJyb2xlXCI6IFwicGFsZSBiaXJjaCB0cnVua1wiXG4gICAgfSxcbiAgICBcImJpcmNoX21hcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0EzNTMwXCIsXG4gICAgICBcInJvbGVcIjogXCJkYXJrIGJpcmNoIGJhcmsgYmFuZFwiXG4gICAgfSxcbiAgICBcImJpcmNoX2xlYWZcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUNDOTVBXCIsXG4gICAgICBcInJvbGVcIjogXCJiaXJjaCBjYW5vcHksIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImJpcmNoX2xlYWZfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCM0Q3NkJcIixcbiAgICAgIFwicm9sZVwiOiBcImJpcmNoIGNhbm9weSwgaGlnaGxpZ2h0XCJcbiAgICB9LFxuICAgIFwiYmVlY2hfYmFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM4RTg5N0RcIixcbiAgICAgIFwicm9sZVwiOiBcInNtb290aCBncmV5IGJlZWNoIHRydW5rXCJcbiAgICB9LFxuICAgIFwiYmVlY2hfbGVhZlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1NThGM0FcIixcbiAgICAgIFwicm9sZVwiOiBcImJlZWNoIGNhbm9weSwgc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcImJlZWNoX2xlYWZfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2N0E0NDVcIixcbiAgICAgIFwicm9sZVwiOiBcImJlZWNoIGNhbm9weSwgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiYnVzaF9kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzQ2N0YzN1wiLFxuICAgICAgXCJyb2xlXCI6IFwiYmVycnkgYnVzaCBsZWF2ZXNcIlxuICAgIH0sXG4gICAgXCJiZXJyeV9yZWRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQzgzOTRBXCIsXG4gICAgICBcInJvbGVcIjogXCJiZXJyaWVzXCJcbiAgICB9LFxuICAgIFwiZmVybl9ncmVlblwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4NkJFNTVcIixcbiAgICAgIFwicm9sZVwiOiBcImZlcm4gZnJvbmRzLCBtYWluXCJcbiAgICB9LFxuICAgIFwiZmVybl9ncmVlbl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGQTc0NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZmVybiBmcm9uZHMsIHNoYWRlXCJcbiAgICB9LFxuICAgIFwiZmxvd2VyX3llbGxvd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNGMkNGNEFcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogbWVhZG93IGZsb3dlciBoZWFkc1wiXG4gICAgfSxcbiAgICBcImZsb3dlcl93aGl0ZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNGNEYxRTRcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogZGFpc3kgZmxvd2VyIGhlYWRzXCJcbiAgICB9LFxuICAgIFwiZmxvd2VyX3Zpb2xldFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QzdCRDZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogdmlvbGV0IGZsb3dlciBoZWFkc1wiXG4gICAgfSxcbiAgICBcIm11c2hyb29tX2NhcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCODQ4M0FcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogZm9yZXN0IG11c2hyb29tIGNhcFwiXG4gICAgfSxcbiAgICBcIm11c2hyb29tX3N0ZW1cIjoge1xuICAgICAgXCJoZXhcIjogXCIjRURFM0NDXCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IG11c2hyb29tIHN0ZW1cIlxuICAgIH0sXG4gICAgXCJtb3NzX2dyZWVuXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVDOEMzQVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiBtb3NzIG9uIGZhbGxlbiBsb2dzXCJcbiAgICB9LFxuICAgIFwib3JlX2NyeXN0YWxcIjoge1xuICAgICAgXCJoZXhcIjogXCIjN0I1QUQ2XCIsXG4gICAgICBcInJvbGVcIjogXCJvcmUgZGVwb3NpdCBhY2NlbnQgKHByb3Bvc2VkLCByZXBsYWNlcyB0ZWFsKVwiXG4gICAgfSxcbiAgICBcIm9yZV9jcnlzdGFsX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUI3QkU4XCIsXG4gICAgICBcInJvbGVcIjogXCJvcmUgaGlnaGxpZ2h0IGZhY2V0XCJcbiAgICB9LFxuICAgIFwibm94ZWxfc3RvbmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZERkNDXCIsXG4gICAgICBcInJvbGVcIjogXCJOb3hlbCBhcmNoaXRlY3R1cmUgbWFpbiBzdG9uZVwiXG4gICAgfSxcbiAgICBcIm5veGVsX3N0b25lX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDNDOUI0XCIsXG4gICAgICBcInJvbGVcIjogXCJOb3hlbCBzZWNvbmRhcnkgc3RvbmUgLyByZWNlc3NcIlxuICAgIH0sXG4gICAgXCJhY2NlbnRfYmx1ZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzRTdGQjhcIixcbiAgICAgIFwicm9sZVwiOiBcImJhbm5lciAvIGNsb3RoIGFjY2VudFwiXG4gICAgfSxcbiAgICBcImFjY2VudF90ZWFsXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJGQTZBMFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2Vjb25kYXJ5IGFjY2VudFwiXG4gICAgfSxcbiAgICBcImVtaXNzaXZlX2ZpcmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRkY5RTRBXCIsXG4gICAgICBcInJvbGVcIjogXCJjYW1wZmlyZSAvIHdhcm0gZW1pc3NpdmUgKGVmZmVjdHMgb25seSlcIlxuICAgIH0sXG4gICAgXCJlbWlzc2l2ZV9tYWdpY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNEMjRCRkZcIixcbiAgICAgIFwicm9sZVwiOiBcInJlc2VydmVkOiBtYWdpYyBlZmZlY3RzIG9ubHksIG5ldmVyIG1hdGVyaWFsc1wiXG4gICAgfVxuICB9LFxuICBcImxpZ2h0aW5nXCI6IHtcbiAgICBcImRhd25cIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogMTIsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMTA1LFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkM3OUFcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDIuMixcbiAgICAgIFwiaGVtaVNreVwiOiBcIiM4RkE2QzhcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM0RTVGNkVcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAwLjYsXG4gICAgICBcInNreVwiOiBcIiNBOEJFRDZcIixcbiAgICAgIFwiZm9nXCI6IFwiI0E4QkVENlwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDA1LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjFcbiAgICB9LFxuICAgIFwibm9vblwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiAzOCxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiA1MCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZGNERDXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAyLjc1LFxuICAgICAgXCJoZW1pU2t5XCI6IFwiI0JGRDlGMlwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzdBOEY1NVwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDAuNTUsXG4gICAgICBcInNreVwiOiBcIiM5RUQyRUVcIixcbiAgICAgIFwiZm9nXCI6IFwiI0RDRUZGOFwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDAyOCxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4wNVxuICAgIH0sXG4gICAgXCJkdXNrXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDksXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMjUwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkIyN0FcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDMuMixcbiAgICAgIFwiaGVtaVNreVwiOiBcIiM4RTdDOUVcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM1QTRBNTBcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAxLjEsXG4gICAgICBcInNreVwiOiBcIiNDOThFODZcIixcbiAgICAgIFwiZm9nXCI6IFwiI0MwOTA4QVwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDAzNixcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4zMlxuICAgIH0sXG4gICAgXCJuaWdodFwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiA0MCxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAyMjAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0FGQzhGRlwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMS4wLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzNBNEM3QVwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzFDMjU0MFwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDEuMDUsXG4gICAgICBcInNreVwiOiBcIiMxMDE3MzZcIixcbiAgICAgIFwiZm9nXCI6IFwiIzE1MUMzQ1wiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDA0NSxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS41XG4gICAgfVxuICB9XG59IiwgIi8vIFZveGVsIGZhY2UgY29sb3VycyBhbmQga2V5cyBzaGFyZWQgYnkgdGhlIG1haW4tdGhyZWFkIHRlcnJhaW4gdmlldyBhbmQgdGhlXG4vLyBjaHVuayB3b3JrZXIuIFB1cmUgZGF0YSArIFRIUkVFLkNvbG9yIG1hdGggKG5vIFdlYkdMIG9iamVjdHMpLlxuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHBhbGV0dGUgZnJvbSAnLi4vZGF0YS9wYWxldHRlLmpzb24nO1xuaW1wb3J0IHsgTUFULCBoYXNoMmkgfSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5leHBvcnQgY29uc3QgTSA9IHBhbGV0dGUubWF0ZXJpYWxzIGFzIFJlY29yZDxzdHJpbmcsIHsgaGV4OiBzdHJpbmcgfT47XG5leHBvcnQgY29uc3QgSCA9IChrOiBzdHJpbmcpID0+IE1ba10uaGV4O1xuXG5leHBvcnQgY29uc3QgY29sb3JDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBUSFJFRS5Db2xvcj4oKTtcbmV4cG9ydCBmdW5jdGlvbiBjKGhleDogc3RyaW5nKTogVEhSRUUuQ29sb3Ige1xuICBsZXQgb3V0ID0gY29sb3JDYWNoZS5nZXQoaGV4KTtcbiAgaWYgKCFvdXQpIHsgb3V0ID0gbmV3IFRIUkVFLkNvbG9yKGhleCk7IGNvbG9yQ2FjaGUuc2V0KGhleCwgb3V0KTsgfVxuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgY29uc3QgQ09MID0ge1xuICBncmFzc1RvcDogW2MoSCgnZ3Jhc3NfdG9wJykpLCBjKEgoJ2dyYXNzX2hpZ2gnKSksIGMoSCgnZ3Jhc3NfcGVhaycpKV0sXG4gIGdyYXNzQ2FwOiBjKEgoJ2dyYXNzX2NhcCcpKSxcbiAgc29pbDogYyhIKCdzdHJhdGFfb2NocmUnKSkuY2xvbmUoKS5tdWx0aXBseVNjYWxhcigwLjc4KSxcbiAgb2NocmU6IGMoSCgnc3RyYXRhX29jaHJlJykpLFxuICBydXN0OiBjKEgoJ3N0cmF0YV9ydXN0JykpLFxuICBzdG9uZVRvcDogYyhIKCdzdG9uZV90b3AnKSksXG4gIHN0b25lQTogYyhIKCdzdG9uZV9ib2R5X2EnKSksXG4gIHN0b25lQjogYyhIKCdzdG9uZV9ib2R5X2InKSksXG4gIHN0b25lU2hhZGU6IGMoSCgnc3RvbmVfc2hhZGUnKSksXG4gIHNhbmQ6IGMoSCgnc2FuZCcpKSxcbiAgZ3JhdmVsOiBjKEgoJ3N0b25lX2JvZHlfYicpKS5jbG9uZSgpLmxlcnAoYyhIKCdzYW5kJykpLCAwLjM1KSxcbiAgb3JlOiBjKEgoJ29yZV9jcnlzdGFsJykpLFxuICBtb3NzOiBjKEgoJ2dyYXNzX2NhcCcpKS5jbG9uZSgpLmxlcnAoYyhIKCdzdG9uZV9ib2R5X2InKSksIDAuMzUpLFxuICBzbm93OiBjKEgoJ3Nub3cnKSksXG4gIHNub3dTaGFkZTogYyhIKCdzbm93JykpLmNsb25lKCkubGVycChjKEgoJ3N0b25lX3NoYWRlJykpLCAwLjM1KSxcbiAgd2F0ZXJSaW06IGMoSCgnd2F0ZXJfcmltJykpLFxuICB3YXRlclNoYWxsb3c6IGMoSCgnd2F0ZXJfc2hhbGxvdycpKSxcbiAgd2F0ZXJNaWQ6IGMoSCgnd2F0ZXJfbWlkJykpLFxuICB3YXRlckRlZXA6IGMoSCgnd2F0ZXJfZGVlcCcpKSxcbn07XG5cbmV4cG9ydCBjb25zdCBTSEFERSA9IFswLjkwLCAwLjk2LCAxLjAsIDEuMDRdO1xuXG4vLyBLZWVwIGEgc21hbGwgcm9sbGluZyB3aW5kb3cgb2YgYnVpbGQgdGltaW5ncyBmb3IgdGhlIHBlcmZvcm1hbmNlIGV2aWRlbmNlLlxuLy8gVGhlc2UgYXJlIGluc3RydW1lbnRhdGlvbiwgbm90IHNpbXVsYXRpb24gc3RhdGUuXG5leHBvcnQgY29uc3QgTUFYX1BFUkZfU0FNUExFUyA9IDEyODtcbmV4cG9ydCBmdW5jdGlvbiByZWNvcmRTYW1wbGUoc2FtcGxlczogbnVtYmVyW10sIG1zOiBudW1iZXIpOiB2b2lkIHtcbiAgc2FtcGxlcy5wdXNoKG1zKTtcbiAgaWYgKHNhbXBsZXMubGVuZ3RoID4gTUFYX1BFUkZfU0FNUExFUykgc2FtcGxlcy5zaGlmdCgpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHBlcmNlbnRpbGUoc2FtcGxlczogbnVtYmVyW10sIHA6IG51bWJlcik6IG51bWJlciB7XG4gIGlmIChzYW1wbGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG4gIGNvbnN0IHNvcnRlZCA9IFsuLi5zYW1wbGVzXS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG4gIGNvbnN0IGkgPSBNYXRoLm1pbihzb3J0ZWQubGVuZ3RoIC0gMSwgTWF0aC5tYXgoMCwgTWF0aC5jZWlsKHAgKiBzb3J0ZWQubGVuZ3RoKSAtIDEpKTtcbiAgcmV0dXJuIE1hdGgucm91bmQoc29ydGVkW2ldICogMTAwKSAvIDEwMDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhlaWdodEJhbmQoeTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHkgPj0gNDUgPyAyIDogeSA+PSAxOCA/IDEgOiAwO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHN0b25lVG9uZSh5OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKCh5ICsgNjQpID4+IDMpICYgMTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBzaGFkZUF0KHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHN4ID0gTWF0aC5mbG9vcih4IC8gMikgKyBNYXRoLmZsb29yKHkgLyAzKSAqIDE3O1xuICBjb25zdCBzeiA9IE1hdGguZmxvb3IoeiAvIDIpO1xuICByZXR1cm4gTWF0aC5mbG9vcihoYXNoMmkoc3gsIHN6LCBzZWVkICsgMzAwKSAqIDQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24ga2V5Rm9yKG1hdDogbnVtYmVyLCB2YXJpYW50OiBudW1iZXIsIHNoYWRlOiBudW1iZXIsIGF4aXM6IG51bWJlciwgZGlyOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKG1hdCAmIDE1KSB8ICgodmFyaWFudCAmIDE1KSA8PCA0KSB8ICgoc2hhZGUgJiAzKSA8PCA4KSB8ICgoYXhpcyAmIDMpIDw8IDEwKSB8ICgoZGlyID4gMCA/IDEgOiAwKSA8PCAxMik7XG59XG5cbmV4cG9ydCBjb25zdCBmYWNlQ29sb3JDYWNoZSA9IG5ldyBNYXA8bnVtYmVyLCBUSFJFRS5Db2xvcj4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNvbG9yRm9yS2V5KGtleTogbnVtYmVyKTogVEhSRUUuQ29sb3Ige1xuICBjb25zdCBjYWNoZWQgPSBmYWNlQ29sb3JDYWNoZS5nZXQoa2V5KTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGNhY2hlZDtcbiAgY29uc3QgbWF0ID0ga2V5ICYgMTU7XG4gIGNvbnN0IHZhcmlhbnQgPSAoa2V5ID4+IDQpICYgMTU7XG4gIGNvbnN0IHNoYWRlID0gKGtleSA+PiA4KSAmIDM7XG4gIGNvbnN0IGF4aXMgPSAoa2V5ID4+IDEwKSAmIDM7XG4gIGNvbnN0IGRpciA9IChrZXkgPj4gMTIpICYgMTtcbiAgbGV0IGNvbG9yOiBUSFJFRS5Db2xvcjtcblxuICBpZiAoYXhpcyA9PT0gMSAmJiBkaXIgPT09IDEpIHtcbiAgICBjb25zdCBoYiA9IE1hdGgubWluKDIsIHZhcmlhbnQgJiAzKTtcbiAgICBpZiAobWF0ID09PSBNQVQuR1JBU1MpIGNvbG9yID0gQ09MLmdyYXNzVG9wW2hiXTtcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5TQU5EKSBjb2xvciA9IENPTC5zYW5kO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULkdSQVZFTCkgY29sb3IgPSBDT0wuZ3JhdmVsO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULlNPSUwpIGNvbG9yID0gQ09MLm9jaHJlO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULk9SRSkgY29sb3IgPSBDT0wub3JlO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULk1PU1MpIGNvbG9yID0gQ09MLm1vc3M7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuU05PVykgY29sb3IgPSBDT0wuc25vdztcbiAgICBlbHNlIGNvbG9yID0gQ09MLnN0b25lVG9wO1xuICB9IGVsc2UgaWYgKGF4aXMgPT09IDEgJiYgZGlyID09PSAwKSB7XG4gICAgY29sb3IgPSBDT0wuc3RvbmVTaGFkZTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBkZXB0aCA9IHZhcmlhbnQgJiA3O1xuICAgIGNvbnN0IHRvbmUgPSAodmFyaWFudCA+PiAzKSAmIDE7XG4gICAgY29uc3QgYm9keSA9IHRvbmUgPyBDT0wuc3RvbmVCIDogQ09MLnN0b25lQTtcbiAgICBpZiAobWF0ID09PSBNQVQuR1JBU1MgfHwgbWF0ID09PSBNQVQuTU9TUykge1xuICAgICAgaWYgKGRlcHRoID09PSAwKSBjb2xvciA9IG1hdCA9PT0gTUFULk1PU1MgPyBDT0wubW9zcyA6IENPTC5ncmFzc0NhcDtcbiAgICAgIGVsc2UgaWYgKGRlcHRoIDw9IDIpIGNvbG9yID0gQ09MLnNvaWw7XG4gICAgICBlbHNlIGlmIChkZXB0aCA9PT0gMykgY29sb3IgPSBDT0wucnVzdDtcbiAgICAgIGVsc2UgY29sb3IgPSBib2R5O1xuICAgIH0gZWxzZSBpZiAobWF0ID09PSBNQVQuU09JTCkge1xuICAgICAgY29sb3IgPSBkZXB0aCA8PSAxID8gQ09MLnNvaWwgOiBib2R5O1xuICAgIH0gZWxzZSBpZiAobWF0ID09PSBNQVQuU0FORCkge1xuICAgICAgY29sb3IgPSBkZXB0aCA8PSAxID8gQ09MLnNhbmQgOiBkZXB0aCA9PT0gMiA/IENPTC5vY2hyZSA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5HUkFWRUwpIHtcbiAgICAgIGNvbG9yID0gZGVwdGggPD0gMSA/IENPTC5ncmF2ZWwgOiBib2R5O1xuICAgIH0gZWxzZSBpZiAobWF0ID09PSBNQVQuT1JFKSB7XG4gICAgICBjb2xvciA9IENPTC5vcmU7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TTk9XKSB7XG4gICAgICBjb2xvciA9IGRlcHRoID09PSAwID8gQ09MLnNub3dTaGFkZSA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5CRURST0NLKSB7XG4gICAgICBjb2xvciA9IENPTC5zdG9uZVNoYWRlO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb2xvciA9IGJvZHk7XG4gICAgfVxuICB9XG5cbiAgY29uc3Qgb3V0ID0gY29sb3IuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihTSEFERVtzaGFkZV0pO1xuICBmYWNlQ29sb3JDYWNoZS5zZXQoa2V5LCBvdXQpO1xuICByZXR1cm4gb3V0O1xufVxuIiwgIi8vIFB1cmUgZ3JlZWR5IHZveGVsIG1lc2hlciBvdmVyIGEgcGFkZGVkIGNodW5rIHZvbHVtZS4gTm8gV29ybGQgYWNjZXNzIGFuZCBub1xuLy8gV2ViR0wgb2JqZWN0cywgc28gaXQgcnVucyBpZGVudGljYWxseSBvbiB0aGUgbWFpbiB0aHJlYWQgYW5kIGluIGEgd29ya2VyLlxuLy9cbi8vIFBhZGRlZCBsYXlvdXQ6IHggYW5kIHogcnVuIGZyb20gLTEgdG8gQ0hVTktfU0laRSAoMzQgY2VsbHMpIHNvIGZhY2VzIG9uIGNodW5rXG4vLyBib3JkZXJzIGNhbiBzZWUgdGhlaXIgbmVpZ2hib3VyczsgeSBydW5zIG92ZXIgdGhlIGZ1bGwgd29ybGQgaGVpZ2h0LiBPdXQgb2Zcbi8vIHJhbmdlIHkgc2FtcGxlcyBhcmUgYmVkcm9jayBiZWxvdyBhbmQgYWlyIGFib3ZlLCBhcyBpbiBnZXRWb3hlbC5cbmltcG9ydCB7XG4gIENIVU5LX1NJWkUsIFdPUkxEX0hFSUdIVCwgWV9NSU4sIE1BVCwgaXNPcGFxdWUsIGxvY2FsSW5kZXgsXG59IGZyb20gJy4uL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBjb2xvckZvcktleSwgaGVpZ2h0QmFuZCwga2V5Rm9yLCBzaGFkZUF0LCBzdG9uZVRvbmUgfSBmcm9tICcuL3ZveGVsLWNvbG9ycyc7XG5cbmV4cG9ydCBjb25zdCBQQUQgPSBDSFVOS19TSVpFICsgMjtcbmV4cG9ydCBjb25zdCBQQURERURfVk9MVU1FID0gUEFEICogUEFEICogV09STERfSEVJR0hUO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1lc2hBcnJheXMge1xuICBwb3NpdGlvbnM6IEZsb2F0MzJBcnJheTtcbiAgbm9ybWFsczogRmxvYXQzMkFycmF5O1xuICBjb2xvcnM6IEZsb2F0MzJBcnJheTtcbiAgbWF0czogRmxvYXQzMkFycmF5O1xuICBpbmRpY2VzOiBVaW50MzJBcnJheTtcbiAgdHJpYW5nbGVzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBwYWRkZWRJbmRleCA9ICh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyID0+XG4gICh4ICsgMSkgKyAoeiArIDEpICogUEFEICsgeSAqIFBBRCAqIFBBRDtcblxuLyoqIENvcHkgYSBjaHVuayBhbmQgaXRzIG9uZS1jZWxsIGJvcmRlciBpbnRvIGEgcGFkZGVkIHZvbHVtZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFBhZGRlZChcbiAgZGF0YTogVWludDhBcnJheSxcbiAgbmVpZ2hib3VyOiAobHg6IG51bWJlciwgeTogbnVtYmVyLCBsejogbnVtYmVyKSA9PiBudW1iZXIsXG4pOiBVaW50OEFycmF5IHtcbiAgY29uc3Qgb3V0ID0gbmV3IFVpbnQ4QXJyYXkoUEFEREVEX1ZPTFVNRSk7XG4gIGZvciAobGV0IHkgPSAwOyB5IDwgV09STERfSEVJR0hUOyB5KyspIHtcbiAgICBmb3IgKGxldCB6ID0gLTE7IHogPD0gQ0hVTktfU0laRTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gLTE7IHggPD0gQ0hVTktfU0laRTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGluc2lkZSA9IHggPj0gMCAmJiB6ID49IDAgJiYgeCA8IENIVU5LX1NJWkUgJiYgeiA8IENIVU5LX1NJWkU7XG4gICAgICAgIG91dFtwYWRkZWRJbmRleCh4LCB5LCB6KV0gPSBpbnNpZGUgPyBkYXRhW2xvY2FsSW5kZXgoeCwgeSwgeildIDogbmVpZ2hib3VyKHgsIHksIHopO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBwb3NGcm9tKGF4aXM6IG51bWJlciwgc2xpY2U6IG51bWJlciwgaTogbnVtYmVyLCBqOiBudW1iZXIsIG91dDogSW50MzJBcnJheSk6IHZvaWQge1xuICBpZiAoYXhpcyA9PT0gMCkgeyBvdXRbMF0gPSBzbGljZTsgb3V0WzFdID0gaTsgb3V0WzJdID0gajsgfVxuICBlbHNlIGlmIChheGlzID09PSAxKSB7IG91dFswXSA9IGo7IG91dFsxXSA9IHNsaWNlOyBvdXRbMl0gPSBpOyB9XG4gIGVsc2UgeyBvdXRbMF0gPSBpOyBvdXRbMV0gPSBqOyBvdXRbMl0gPSBzbGljZTsgfVxufVxuXG5jbGFzcyBHcm93YWJsZSB7XG4gIHByaXZhdGUgYnVmOiBGbG9hdDMyQXJyYXk7XG4gIGxlbmd0aCA9IDA7XG4gIGNvbnN0cnVjdG9yKG46IG51bWJlcikgeyB0aGlzLmJ1ZiA9IG5ldyBGbG9hdDMyQXJyYXkobik7IH1cbiAgcHVzaDMoYTogbnVtYmVyLCBiOiBudW1iZXIsIGM6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICh0aGlzLmxlbmd0aCArIDMgPiB0aGlzLmJ1Zi5sZW5ndGgpIHRoaXMuZ3JvdygpO1xuICAgIHRoaXMuYnVmW3RoaXMubGVuZ3RoKytdID0gYTsgdGhpcy5idWZbdGhpcy5sZW5ndGgrK10gPSBiOyB0aGlzLmJ1Zlt0aGlzLmxlbmd0aCsrXSA9IGM7XG4gIH1cbiAgcHVzaDEoYTogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMubGVuZ3RoICsgMSA+IHRoaXMuYnVmLmxlbmd0aCkgdGhpcy5ncm93KCk7XG4gICAgdGhpcy5idWZbdGhpcy5sZW5ndGgrK10gPSBhO1xuICB9XG4gIHByaXZhdGUgZ3JvdygpOiB2b2lkIHsgY29uc3QgbiA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5idWYubGVuZ3RoICogMik7IG4uc2V0KHRoaXMuYnVmKTsgdGhpcy5idWYgPSBuOyB9XG4gIGRvbmUoKTogRmxvYXQzMkFycmF5IHsgcmV0dXJuIHRoaXMuYnVmLnNsaWNlKDAsIHRoaXMubGVuZ3RoKTsgfVxufVxuXG4vKipcbiAqIEdyZWVkeSAzRCBmYWNlIG1lc2hlci4gQSBmYWNlIGlzIGVtaXR0ZWQgd2hlcmUgYW4gb3BhcXVlIHZveGVsIHRvdWNoZXMgYVxuICogbm9uLW9wYXF1ZSBjZWxsIChhaXIgb3Igd2F0ZXIpOyBvbmx5IHRoZSBjaHVuayB0aGF0IG93bnMgdGhlIHNvbGlkIHZveGVsXG4gKiBlbWl0cyBpdC4gT3V0cHV0IGlzIGlkZW50aWNhbCB0byB0aGUgZm9ybWVyIGluLXBsYWNlIG1lc2hlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lc2hQYWRkZWQoXG4gIHBhZGRlZDogVWludDhBcnJheSwgaGVpZ2h0czogVWludDhBcnJheSwgb3g6IG51bWJlciwgb3o6IG51bWJlciwgc2VlZDogbnVtYmVyLFxuKTogTWVzaEFycmF5cyB7XG4gIGNvbnN0IHNhbXBsZSA9ICh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBpZiAoeSA8IDApIHJldHVybiBNQVQuQkVEUk9DSztcbiAgICBpZiAoeSA+PSBXT1JMRF9IRUlHSFQpIHJldHVybiBNQVQuQUlSO1xuICAgIHJldHVybiBwYWRkZWRbcGFkZGVkSW5kZXgoeCwgeSwgeildO1xuICB9O1xuICBjb25zdCBwb3NpdGlvbnMgPSBuZXcgR3Jvd2FibGUoMSA8PCAxNSksIG5vcm1hbHMgPSBuZXcgR3Jvd2FibGUoMSA8PCAxNSk7XG4gIGNvbnN0IGNvbG9ycyA9IG5ldyBHcm93YWJsZSgxIDw8IDE1KSwgbWF0cyA9IG5ldyBHcm93YWJsZSgxIDw8IDEzKTtcbiAgbGV0IGluZGljZXMgPSBuZXcgVWludDMyQXJyYXkoMSA8PCAxNCk7XG4gIGxldCBpbmRleENvdW50ID0gMDtcbiAgbGV0IHZlcnRleENvdW50ID0gMDtcbiAgY29uc3QgZGltcyA9IFtDSFVOS19TSVpFLCBXT1JMRF9IRUlHSFQsIENIVU5LX1NJWkVdO1xuICBjb25zdCBwYSA9IG5ldyBJbnQzMkFycmF5KDMpLCBwYiA9IG5ldyBJbnQzMkFycmF5KDMpO1xuICBjb25zdCBjb3JuZXJzID0gbmV3IEZsb2F0MzJBcnJheSgxMik7XG5cbiAgY29uc3QgZW1pdFF1YWQgPSAoYXhpczogbnVtYmVyLCBkaXI6IG51bWJlciwgc2xpY2U6IG51bWJlcixcbiAgICBpMDogbnVtYmVyLCBqMDogbnVtYmVyLCB3OiBudW1iZXIsIGg6IG51bWJlciwga2V5OiBudW1iZXIpID0+IHtcbiAgICBjb25zdCBwbGFuZSA9IHNsaWNlICsgMTtcbiAgICBjb25zdCB1MCA9IGkwLCB1MSA9IGkwICsgdywgdjAgPSBqMCwgdjEgPSBqMCArIGg7XG4gICAgY29uc3Qgc2V0ID0gKGs6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcikgPT4geyBjb3JuZXJzW2sgKiAzXSA9IHg7IGNvcm5lcnNbayAqIDMgKyAxXSA9IHk7IGNvcm5lcnNbayAqIDMgKyAyXSA9IHo7IH07XG4gICAgaWYgKGF4aXMgPT09IDApIHtcbiAgICAgIGNvbnN0IHggPSBveCArIHBsYW5lLCB5MCA9IFlfTUlOICsgdTAsIHkxID0gWV9NSU4gKyB1MSwgejAgPSBveiArIHYwLCB6MSA9IG96ICsgdjE7XG4gICAgICBpZiAoZGlyID4gMCkgeyBzZXQoMCwgeCwgeTAsIHowKTsgc2V0KDEsIHgsIHkxLCB6MCk7IHNldCgyLCB4LCB5MSwgejEpOyBzZXQoMywgeCwgeTAsIHoxKTsgfVxuICAgICAgZWxzZSB7IHNldCgwLCB4LCB5MCwgejApOyBzZXQoMSwgeCwgeTAsIHoxKTsgc2V0KDIsIHgsIHkxLCB6MSk7IHNldCgzLCB4LCB5MSwgejApOyB9XG4gICAgfSBlbHNlIGlmIChheGlzID09PSAxKSB7XG4gICAgICBjb25zdCB5ID0gWV9NSU4gKyBwbGFuZSwgejAgPSBveiArIHUwLCB6MSA9IG96ICsgdTEsIHgwID0gb3ggKyB2MCwgeDEgPSBveCArIHYxO1xuICAgICAgaWYgKGRpciA+IDApIHsgc2V0KDAsIHgwLCB5LCB6MCk7IHNldCgxLCB4MCwgeSwgejEpOyBzZXQoMiwgeDEsIHksIHoxKTsgc2V0KDMsIHgxLCB5LCB6MCk7IH1cbiAgICAgIGVsc2UgeyBzZXQoMCwgeDAsIHksIHowKTsgc2V0KDEsIHgxLCB5LCB6MCk7IHNldCgyLCB4MSwgeSwgejEpOyBzZXQoMywgeDAsIHksIHoxKTsgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB6ID0gb3ogKyBwbGFuZSwgeDAgPSBveCArIHUwLCB4MSA9IG94ICsgdTEsIHkwID0gWV9NSU4gKyB2MCwgeTEgPSBZX01JTiArIHYxO1xuICAgICAgaWYgKGRpciA+IDApIHsgc2V0KDAsIHgwLCB5MCwgeik7IHNldCgxLCB4MSwgeTAsIHopOyBzZXQoMiwgeDEsIHkxLCB6KTsgc2V0KDMsIHgwLCB5MSwgeik7IH1cbiAgICAgIGVsc2UgeyBzZXQoMCwgeDAsIHkwLCB6KTsgc2V0KDEsIHgwLCB5MSwgeik7IHNldCgyLCB4MSwgeTEsIHopOyBzZXQoMywgeDEsIHkwLCB6KTsgfVxuICAgIH1cbiAgICBjb25zdCBjb2xvciA9IGNvbG9yRm9yS2V5KGtleSk7XG4gICAgY29uc3QgbWF0ID0ga2V5ICYgMTU7XG4gICAgY29uc3QgbnggPSBheGlzID09PSAwID8gZGlyIDogMCwgbnkgPSBheGlzID09PSAxID8gZGlyIDogMCwgbnogPSBheGlzID09PSAyID8gZGlyIDogMDtcbiAgICBjb25zdCBiYXNlID0gdmVydGV4Q291bnQ7XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCA0OyBrKyspIHtcbiAgICAgIHBvc2l0aW9ucy5wdXNoMyhjb3JuZXJzW2sgKiAzXSwgY29ybmVyc1trICogMyArIDFdLCBjb3JuZXJzW2sgKiAzICsgMl0pO1xuICAgICAgbm9ybWFscy5wdXNoMyhueCwgbnksIG56KTtcbiAgICAgIGNvbG9ycy5wdXNoMyhjb2xvci5yLCBjb2xvci5nLCBjb2xvci5iKTtcbiAgICAgIG1hdHMucHVzaDEobWF0KTtcbiAgICB9XG4gICAgdmVydGV4Q291bnQgKz0gNDtcbiAgICBpZiAoaW5kZXhDb3VudCArIDYgPiBpbmRpY2VzLmxlbmd0aCkgeyBjb25zdCBuID0gbmV3IFVpbnQzMkFycmF5KGluZGljZXMubGVuZ3RoICogMik7IG4uc2V0KGluZGljZXMpOyBpbmRpY2VzID0gbjsgfVxuICAgIGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2U7IGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2UgKyAxOyBpbmRpY2VzW2luZGV4Q291bnQrK10gPSBiYXNlICsgMjtcbiAgICBpbmRpY2VzW2luZGV4Q291bnQrK10gPSBiYXNlOyBpbmRpY2VzW2luZGV4Q291bnQrK10gPSBiYXNlICsgMjsgaW5kaWNlc1tpbmRleENvdW50KytdID0gYmFzZSArIDM7XG4gIH07XG5cbiAgZm9yIChsZXQgYXhpcyA9IDA7IGF4aXMgPCAzOyBheGlzKyspIHtcbiAgICBjb25zdCB1ID0gKGF4aXMgKyAxKSAlIDMsIHYgPSAoYXhpcyArIDIpICUgMztcbiAgICBjb25zdCBkdSA9IGRpbXNbdV0sIGR2ID0gZGltc1t2XSwgZGQgPSBkaW1zW2F4aXNdO1xuICAgIGNvbnN0IG1hc2sgPSBuZXcgVWludDE2QXJyYXkoZHUgKiBkdik7XG4gICAgZm9yIChsZXQgc2xpY2UgPSAtMTsgc2xpY2UgPCBkZDsgc2xpY2UrKykge1xuICAgICAgbWFzay5maWxsKDApO1xuICAgICAgbGV0IGFueSA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBkdjsgaisrKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZHU7IGkrKykge1xuICAgICAgICAgIHBvc0Zyb20oYXhpcywgc2xpY2UsIGksIGosIHBhKTtcbiAgICAgICAgICBwb3NGcm9tKGF4aXMsIHNsaWNlICsgMSwgaSwgaiwgcGIpO1xuICAgICAgICAgIGNvbnN0IGEgPSBzYW1wbGUocGFbMF0sIHBhWzFdLCBwYVsyXSk7XG4gICAgICAgICAgY29uc3QgYiA9IHNhbXBsZShwYlswXSwgcGJbMV0sIHBiWzJdKTtcbiAgICAgICAgICBjb25zdCBhbyA9IGlzT3BhcXVlKGEpLCBibyA9IGlzT3BhcXVlKGIpO1xuICAgICAgICAgIGlmIChhbyA9PT0gYm8pIGNvbnRpbnVlO1xuICAgICAgICAgIGNvbnN0IGFJbnNpZGUgPSBzbGljZSA+PSAwICYmIHNsaWNlIDwgZGQ7XG4gICAgICAgICAgY29uc3QgYkluc2lkZSA9IHNsaWNlICsgMSA+PSAwICYmIHNsaWNlICsgMSA8IGRkO1xuICAgICAgICAgIGxldCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBtYXQ6IG51bWJlciwgZGlyOiBudW1iZXI7XG4gICAgICAgICAgaWYgKGFvICYmICFibyAmJiBhSW5zaWRlKSB7IHggPSBwYVswXTsgeSA9IHBhWzFdOyB6ID0gcGFbMl07IG1hdCA9IGE7IGRpciA9IDE7IH1cbiAgICAgICAgICBlbHNlIGlmIChibyAmJiAhYW8gJiYgYkluc2lkZSkgeyB4ID0gcGJbMF07IHkgPSBwYlsxXTsgeiA9IHBiWzJdOyBtYXQgPSBiOyBkaXIgPSAtMTsgfVxuICAgICAgICAgIGVsc2UgY29udGludWU7XG4gICAgICAgICAgY29uc3Qgd3kgPSBZX01JTiArIHk7XG4gICAgICAgICAgY29uc3Qgc3VyZmFjZVkgPSBoZWlnaHRzW3ogKiBDSFVOS19TSVpFICsgeF0gKyBZX01JTjtcbiAgICAgICAgICBjb25zdCBkZXB0aCA9IHN1cmZhY2VZIC0gKHd5ICsgMSk7XG4gICAgICAgICAgbGV0IHZhcmlhbnQ6IG51bWJlcjtcbiAgICAgICAgICBpZiAoYXhpcyA9PT0gMSAmJiBkaXIgPiAwKSB2YXJpYW50ID0gaGVpZ2h0QmFuZCh3eSk7XG4gICAgICAgICAgZWxzZSBpZiAoYXhpcyA9PT0gMSAmJiBkaXIgPCAwKSB2YXJpYW50ID0gMTU7XG4gICAgICAgICAgZWxzZSB2YXJpYW50ID0gKE1hdGgubWF4KDAsIE1hdGgubWluKDcsIGRlcHRoKSkgJiA3KSB8IChzdG9uZVRvbmUod3kpIDw8IDMpO1xuICAgICAgICAgIG1hc2tbaiAqIGR1ICsgaV0gPSBrZXlGb3IobWF0LCB2YXJpYW50LCBzaGFkZUF0KG94ICsgeCwgd3ksIG96ICsgeiwgc2VlZCksIGF4aXMsIGRpcik7XG4gICAgICAgICAgYW55ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKCFhbnkpIGNvbnRpbnVlO1xuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBkdjsgaisrKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZHU7KSB7XG4gICAgICAgICAgY29uc3Qga2V5ID0gbWFza1tqICogZHUgKyBpXTtcbiAgICAgICAgICBpZiAoIWtleSkgeyBpKys7IGNvbnRpbnVlOyB9XG4gICAgICAgICAgbGV0IHcgPSAxO1xuICAgICAgICAgIHdoaWxlIChpICsgdyA8IGR1ICYmIG1hc2tbaiAqIGR1ICsgaSArIHddID09PSBrZXkpIHcrKztcbiAgICAgICAgICBsZXQgaCA9IDE7XG4gICAgICAgICAgb3V0ZXI6IHdoaWxlIChqICsgaCA8IGR2KSB7XG4gICAgICAgICAgICBmb3IgKGxldCBrID0gMDsgayA8IHc7IGsrKykgaWYgKG1hc2tbKGogKyBoKSAqIGR1ICsgaSArIGtdICE9PSBrZXkpIGJyZWFrIG91dGVyO1xuICAgICAgICAgICAgaCsrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBmb3IgKGxldCBqaiA9IDA7IGpqIDwgaDsgamorKykgZm9yIChsZXQgaWkgPSAwOyBpaSA8IHc7IGlpKyspIG1hc2tbKGogKyBqaikgKiBkdSArIGkgKyBpaV0gPSAwO1xuICAgICAgICAgIGVtaXRRdWFkKGF4aXMsIChrZXkgPj4gMTIpICYgMSA/IDEgOiAtMSwgc2xpY2UsIGksIGosIHcsIGgsIGtleSk7XG4gICAgICAgICAgaSArPSB3O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiB7XG4gICAgcG9zaXRpb25zOiBwb3NpdGlvbnMuZG9uZSgpLCBub3JtYWxzOiBub3JtYWxzLmRvbmUoKSwgY29sb3JzOiBjb2xvcnMuZG9uZSgpLCBtYXRzOiBtYXRzLmRvbmUoKSxcbiAgICBpbmRpY2VzOiBpbmRpY2VzLnNsaWNlKDAsIGluZGV4Q291bnQpLCB0cmlhbmdsZXM6IGluZGV4Q291bnQgLyAzLFxuICB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFBLE9BQU8sVUFBVTtBQUNqQixPQUFPLFlBQVk7OztBQ09uQixJQUFNLFNBQVMsb0JBQUksUUFBNkI7QUFlekMsU0FBUyxjQUFjLE9BQXdCO0FBQ3BELFNBQU8sT0FBTyxJQUFJLEtBQUssR0FBRyxVQUFVO0FBQ3RDOzs7QUN0Qk8sSUFBTSxRQUFRLENBQUMsR0FBVyxHQUFXLE1BQWUsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUk7QUFDNUUsSUFBTSxPQUFPLENBQUMsR0FBVyxHQUFXLE1BQWMsS0FBSyxJQUFJLEtBQUs7QUFDaEUsSUFBTSxhQUFhLENBQUMsSUFBWSxJQUFZLE1BQWM7QUFDL0QsUUFBTSxJQUFJLE9BQU8sSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLENBQUM7QUFDMUMsU0FBTyxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQzFCO0FBR08sU0FBUyxPQUFPLEdBQVcsR0FBVyxNQUFzQjtBQUNqRSxNQUFJLElBQUksT0FBTyxLQUFLLEtBQUssR0FBRyxTQUFTLElBQUksS0FBSyxLQUFLLEdBQUcsU0FBUztBQUMvRCxNQUFJLEtBQUssS0FBSyxJQUFLLE1BQU0sSUFBSyxVQUFVO0FBQ3hDLFdBQVMsSUFBSyxNQUFNLFFBQVMsS0FBSztBQUNwQztBQUVPLFNBQVMsT0FBTyxHQUFXLEdBQVcsR0FBVyxNQUFzQjtBQUM1RSxNQUFJLElBQUksT0FBTyxLQUFLLEtBQUssR0FBRyxTQUFTLElBQUksS0FBSyxLQUFLLEdBQUcsU0FBUyxJQUFJLEtBQUssS0FBSyxHQUFHLFVBQVU7QUFDMUYsTUFBSSxLQUFLLEtBQUssSUFBSyxNQUFNLElBQUssVUFBVTtBQUN4QyxXQUFTLElBQUssTUFBTSxRQUFTLEtBQUs7QUFDcEM7QUFFTyxTQUFTLFdBQVcsTUFB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SSxHQUFHLElBQUksS0FBSztBQUNwRSxRQUFFLE9BQU8sTUFBTTtBQUNmLFFBQUUsU0FBUyxNQUFNO0FBQUcsUUFBRSxhQUFhLE1BQU07QUFBQSxJQUMzQztBQUNBLFVBQU0sSUFBSSxZQUFZLE1BQU0sSUFBSSxFQUFFO0FBQ2xDLFVBQU0sT0FBTyxrQkFBa0IsTUFBTSxTQUFTLElBQUksRUFBRTtBQUNwRCxvQkFBZ0IsV0FBVyxTQUFTLElBQUksRUFBRSxHQUFHLG1CQUFtQixNQUFNLFNBQVMsSUFBSSxFQUFFLENBQUM7QUFDdEYsVUFBTSxJQUFJLGlCQUFpQixXQUFXLElBQUk7QUFDMUMsV0FBTyxVQUFVLEVBQUUsTUFBTSxFQUFFLElBQUk7QUFDL0IsV0FBTyxVQUFVLEVBQUUsU0FBUyxFQUFFLE9BQU87QUFDckMsV0FBTyxVQUFVLEVBQUUsY0FBYyxFQUFFLFlBQVk7QUFDL0MsV0FBTyxVQUFVLENBQUMsR0FBRyxVQUFVLFNBQVMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssU0FBUyxPQUFPLENBQUMsQ0FBQztBQUM5RSxXQUFPLE1BQU0saUJBQWlCLFdBQVcsSUFBSSxHQUFHLEdBQUcsaURBQWlEO0FBQ3BHLFdBQU8sT0FBTyxNQUFNLGlCQUFpQixZQUFZLEdBQUcsT0FBTyxHQUFHLElBQUksR0FBRyxpQkFBaUI7QUFFdEYsYUFBUyxLQUFLLElBQUksTUFBTSxHQUFHLEtBQU0sVUFBUyxLQUFLLElBQUksTUFBTSxHQUFHLE1BQU07QUFBRSxrQkFBWSxNQUFNLEtBQUssSUFBSSxLQUFLLEVBQUU7QUFBRyxrQkFBWSxXQUFXLEtBQUssSUFBSSxLQUFLLEVBQUU7QUFBQSxJQUFHO0FBQ25KLFVBQU0sS0FBSyxVQUFVLE1BQU0sQ0FBQztBQUM1QixVQUFNLEtBQUssV0FBVyxVQUFVLFdBQVcsQ0FBQyxHQUFHLEVBQUUsU0FBUyxhQUFhLEVBQUUsR0FBRyxhQUFhLEVBQUUsR0FBRyxJQUFJO0FBQ2xHLFdBQU8sVUFBVSxNQUFNLEtBQUssR0FBRyxTQUFTLEdBQUcsTUFBTSxLQUFLLEdBQUcsU0FBUyxhQUFhLFVBQVUsRUFBRSxLQUFLLENBQUM7QUFDakcsV0FBTyxVQUFVLE1BQU0sS0FBSyxHQUFHLE9BQU8sR0FBRyxNQUFNLEtBQUssR0FBRyxTQUFTLE1BQU8sS0FBSyxDQUFDO0FBQUEsRUFDL0UsQ0FBQztBQUNIOyIsCiAgIm5hbWVzIjogWyJjIiwgImEiLCAiYiIsICJzbW9vdGgiLCAiVEhSRUUiLCAiVEhSRUUiLCAiTSIsICJIIiwgImMiXQp9Cg==
