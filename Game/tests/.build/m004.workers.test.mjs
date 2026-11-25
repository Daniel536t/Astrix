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
var _boxPoint = new THREE3.Vector3();

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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwNC53b3JrZXJzLnRlc3QudHMiLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS9ub2lzZS50cyIsICIuLi8uLi9zcmMvc2ltL2h5ZHJvbG9neS50cyIsICIuLi8uLi9zcmMvc2ltL21hdGVyaWFscy50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4tdjIudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3JlbmRlci93YXRlci50cyIsICIuLi8uLi9zcmMvZGF0YS9wYWxldHRlLmpzb24iLCAiLi4vLi4vc3JjL3JlbmRlci92b3hlbC1jb2xvcnMudHMiLCAiLi4vLi4vc3JjL3JlbmRlci9tZXNoZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB0ZXN0IGZyb20gJ25vZGU6dGVzdCc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCc7XG5pbXBvcnQge1xuICBHRU5FUkFUT1JfVjIsIEdFTkVSQVRPUl9WRVJTSU9OLCBNQVQsIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBjb21wdXRlQmFzZUNvbHVtbnMsIGNyZWF0ZVdvcmxkLCBlbnN1cmVDaHVuayxcbiAgZ2VuZXJhdGVCYXNlQ2h1bmssIGluc3RhbGxCYXNlQ2h1bmssIHNlZWRCYXNlQ29sdW1ucywgc2V0Vm94ZWwsIHN1cmZhY2VBdCwgY2h1bmtLZXksXG59IGZyb20gJy4uL3NyYy9zaW0vd29ybGQnO1xuaW1wb3J0IHsgbWVzaENodW5rLCBwYWRkZWRGb3IgfSBmcm9tICcuLi9zcmMvcmVuZGVyL3RlcnJhaW4nO1xuaW1wb3J0IHsgbWVzaFBhZGRlZCB9IGZyb20gJy4uL3NyYy9yZW5kZXIvbWVzaGVyJztcblxuLy8gVGhlIHdvcmtlciBydW5zIGV4YWN0bHkgdGhlc2UgcHVyZSBmdW5jdGlvbnM7IHRoaXMgdGVzdCBwcm92ZXMgdGhhdCB0aGVcbi8vIG9mZi10aHJlYWQgcGF0aCBpbnN0YWxscyB0aGUgc2FtZSBjaHVuaywgZW50aXRpZXMgYW5kIG1lc2ggYXMgdGhlXG4vLyBzeW5jaHJvbm91cyBwYXRoLCBpbmNsdWRpbmcgZHVyYWJsZSBlZGl0cyBtYWRlIGJlZm9yZSB0aGUgcmVzdWx0IGFycml2ZXMuXG5mb3IgKGNvbnN0IHZlcnNpb24gb2YgW0dFTkVSQVRPUl9WRVJTSU9OLCBHRU5FUkFUT1JfVjJdKSB7XG4gIHRlc3QoYHdvcmtlci1wYXRoIGdlbmVyYXRpb24gaXMgaWRlbnRpY2FsIHRvIHN5bmNocm9ub3VzIGdlbmVyYXRpb24gKHYke3ZlcnNpb259KWAsICgpID0+IHtcbiAgICBjb25zdCBzeW5jID0gY3JlYXRlV29ybGQoMTMzNywgdmVyc2lvbik7XG4gICAgY29uc3QgdmlhV29ya2VyID0gY3JlYXRlV29ybGQoMTMzNywgdmVyc2lvbik7XG4gICAgY29uc3QgY3ggPSAyOSwgY3ogPSAyOTtcbiAgICAvLyBBIGR1cmFibGUgZWRpdCByZWNvcmRlZCBiZWZvcmUgdGhlIGNodW5rIGJlY29tZXMgcmVzaWRlbnQuXG4gICAgZm9yIChjb25zdCB3IG9mIFtzeW5jLCB2aWFXb3JrZXJdKSB7XG4gICAgICBjb25zdCBwcm9iZSA9IGNyZWF0ZVdvcmxkKDEzMzcsIHZlcnNpb24pO1xuICAgICAgY29uc3QgeSA9IHN1cmZhY2VBdChwcm9iZSwgY2h1bmtPcmlnaW5YKGN4KSArIDUsIGNodW5rT3JpZ2luWihjeikgKyA1KTtcbiAgICAgIHcuZWRpdHMuc2V0KGNodW5rS2V5KGN4LCBjeiksIG5ldyBNYXAoKSk7XG4gICAgICBzZXRWb3hlbCh3LCBjaHVua09yaWdpblgoY3gpICsgNSwgeSwgY2h1bmtPcmlnaW5aKGN6KSArIDUsIE1BVC5TVE9ORSk7XG4gICAgICB3LmNodW5rcy5jbGVhcigpO1xuICAgICAgdy5lbnRpdGllcy5jbGVhcigpOyB3LmVudGl0eUNodW5rcy5jbGVhcigpO1xuICAgIH1cbiAgICBjb25zdCBhID0gZW5zdXJlQ2h1bmsoc3luYywgY3gsIGN6KSE7XG4gICAgY29uc3QgYmFzZSA9IGdlbmVyYXRlQmFzZUNodW5rKDEzMzcsIHZlcnNpb24sIGN4LCBjeik7XG4gICAgc2VlZEJhc2VDb2x1bW5zKHZpYVdvcmtlciwgY2h1bmtLZXkoY3gsIGN6KSwgY29tcHV0ZUJhc2VDb2x1bW5zKDEzMzcsIHZlcnNpb24sIGN4LCBjeikpO1xuICAgIGNvbnN0IGIgPSBpbnN0YWxsQmFzZUNodW5rKHZpYVdvcmtlciwgYmFzZSkhO1xuICAgIGFzc2VydC5kZWVwRXF1YWwoYi5kYXRhLCBhLmRhdGEpO1xuICAgIGFzc2VydC5kZWVwRXF1YWwoYi5oZWlnaHRzLCBhLmhlaWdodHMpO1xuICAgIGFzc2VydC5kZWVwRXF1YWwoYi50b3BNYXRlcmlhbHMsIGEudG9wTWF0ZXJpYWxzKTtcbiAgICBhc3NlcnQuZGVlcEVxdWFsKFsuLi52aWFXb3JrZXIuZW50aXRpZXMudmFsdWVzKCldLCBbLi4uc3luYy5lbnRpdGllcy52YWx1ZXMoKV0pO1xuICAgIGFzc2VydC5lcXVhbChpbnN0YWxsQmFzZUNodW5rKHZpYVdvcmtlciwgYmFzZSksIGIsICdhIHNlY29uZCByZXN1bHQgZm9yIGEgcmVzaWRlbnQgY2h1bmsgaXMgaWdub3JlZCcpO1xuICAgIGFzc2VydC50aHJvd3MoKCkgPT4gaW5zdGFsbEJhc2VDaHVuayhjcmVhdGVXb3JsZCg3LCB2ZXJzaW9uKSwgYmFzZSksIC9kaWZmZXJlbnQgd29ybGQvKTtcblxuICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIHsgZW5zdXJlQ2h1bmsoc3luYywgY3ggKyBkeCwgY3ogKyBkeik7IGVuc3VyZUNodW5rKHZpYVdvcmtlciwgY3ggKyBkeCwgY3ogKyBkeik7IH1cbiAgICBjb25zdCBtMSA9IG1lc2hDaHVuayhzeW5jLCBhKTtcbiAgICBjb25zdCBtMiA9IG1lc2hQYWRkZWQocGFkZGVkRm9yKHZpYVdvcmtlciwgYiksIGIuaGVpZ2h0cywgY2h1bmtPcmlnaW5YKGN4KSwgY2h1bmtPcmlnaW5aKGN6KSwgMTMzNyk7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChBcnJheS5mcm9tKG0yLnBvc2l0aW9ucyksIEFycmF5LmZyb20obTEuZ2VvbWV0cnkuZ2V0QXR0cmlidXRlKCdwb3NpdGlvbicpLmFycmF5KSk7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChBcnJheS5mcm9tKG0yLmluZGljZXMpLCBBcnJheS5mcm9tKG0xLmdlb21ldHJ5LmluZGV4IS5hcnJheSkpO1xuICB9KTtcbn1cbiIsICIvLyBQcml2YXRlIG1pZ3JhdGlvbiByZXBsYXkgb25seS4gUmV0aXJlZCBlbnRpdGllcyBsaXZlIGluIHRoaXMgV29ybGQgd2hpbGUgYW5cbi8vIGFjY2VwdGVkIGhpc3RvcmljYWwgam91cm5hbCBpcyBjaGVja2VkOyBubyBwdWJsaWMgY29tbWFuZCBlbmFibGVzIHRoaXMgbW9kZS5cbmludGVyZmFjZSBSZXBsYXlTdGF0ZSB7XG4gIGFjdGl2ZTogYm9vbGVhbjtcbiAgaGlzdG9yaWNhbEhhc2g6IGJvb2xlYW47XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBzdGF0ZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFJlcGxheVN0YXRlPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZDogb2JqZWN0KTogUmVwbGF5U3RhdGUge1xuICBsZXQgc3RhdGUgPSBzdGF0ZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzdGF0ZSkgeyBzdGF0ZSA9IHsgYWN0aXZlOiBmYWxzZSwgaGlzdG9yaWNhbEhhc2g6IGZhbHNlLCBtaWdyYXRlZDogZmFsc2UgfTsgc3RhdGVzLnNldCh3b3JsZCwgc3RhdGUpOyB9XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xuICBzdGF0ZS5taWdyYXRlZCA9IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uYWN0aXZlID8/IGZhbHNlO1xufVxuXG4vKiogU25hcHNob3QgaGFzaGVzIGJlZm9yZSBhbmQgZHVyaW5nIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5IGluY2x1ZGUgc3RvbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZUhpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lmhpc3RvcmljYWxIYXNoID8/IGZhbHNlO1xufVxuXG4vKiogQSBtaWdyYXRlZCBzbmFwc2hvdCBhbHJlYWR5IGhhcyByZXRpcmVtZW50IHRvbWJzdG9uZXMgaW4gZ2VuZXJhdGVkIGNodW5rcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8ubWlncmF0ZWQgPz8gZmFsc2U7XG59XG5cbi8qKiBFeGl0IGhpc3RvcmljYWwgbW9kZSBhZnRlciBhbGwgYWNjZXB0ZWQgY29tbWFuZHMgYW5kIGhhc2hlcyBoYXZlIHBhc3NlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IGZhbHNlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IGZhbHNlO1xuICBzdGF0ZS5taWdyYXRlZCA9IHRydWU7XG59XG4iLCAiLy8gRGV0ZXJtaW5pc3RpYyBoYXNoLCBub2lzZSBhbmQgbWF0aCBoZWxwZXJzIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllci5cbi8vIFB1cmUgVHlwZVNjcmlwdCAoRC0wMDUpLiBFeHRyYWN0ZWQgZnJvbSB3b3JsZC50cyB1bmNoYW5nZWQgc28gdGVycmFpblxuLy8gZ2VuZXJhdG9ycyBvZiBldmVyeSB2ZXJzaW9uIHVzZSBpZGVudGljYWwgcHJpbWl0aXZlcy5cbmV4cG9ydCBjb25zdCBjbGFtcCA9ICh2OiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiAodiA8IGEgPyBhIDogdiA+IGIgPyBiIDogdik7XG5leHBvcnQgY29uc3QgbGVycCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgdDogbnVtYmVyKSA9PiBhICsgKGIgLSBhKSAqIHQ7XG5leHBvcnQgY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5leHBvcnQgY29uc3Qgc21vb3RoID0gKHQ6IG51bWJlcikgPT4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UyKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKTtcbiAgY29uc3QgYSA9IGhhc2gyaSh4aSwgeWksIHNlZWQpLCBiID0gaGFzaDJpKHhpICsgMSwgeWksIHNlZWQpO1xuICBjb25zdCBjID0gaGFzaDJpKHhpLCB5aSArIDEsIHNlZWQpLCBkID0gaGFzaDJpKHhpICsgMSwgeWkgKyAxLCBzZWVkKTtcbiAgY29uc3QgdG9wID0gYSArIChiIC0gYSkgKiB4ZjtcbiAgY29uc3QgYm90dG9tID0gYyArIChkIC0gYykgKiB4ZjtcbiAgcmV0dXJuIHRvcCArIChib3R0b20gLSB0b3ApICogeWY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0yKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UyKHggKiBmcmVxLCB5ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMyh4ICogZnJlcSwgeSAqIGZyZXEsIHogKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG4iLCAiLy8gSHlkcm9sb2d5IFx1MjAxNCB0aGUgZGV0ZXJtaW5pc3RpYyB3YXRlciBuZXR3b3JrIG9mIGEgd29ybGQgKHB1cmUgVHlwZVNjcmlwdCwgRC0wMDUpLlxuLy9cbi8vIFRoaXMgaXMgZGVyaXZlZCAqc2ltdWxhdGlvbiBkYXRhKiwgbm90IHByZXNlbnRhdGlvbjogaXQgaXMgYSBwdXJlIGZ1bmN0aW9uIG9mXG4vLyAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pIGFuZCBpcyB3aGF0IHRlcnJhaW4gY2FydmluZywgd2F0ZXIgZmlsbGluZywgZmxvd1xuLy8gZGlyZWN0aW9uIGFuZCBmdXR1cmUgZmlzaGluZy9pcnJpZ2F0aW9uL2Zsb29kaW5nIHJ1bGVzIHJlYWQuIEl0IGlzIG5ldmVyXG4vLyBqb3VybmFsZWQgYmVjYXVzZSBpdCBjYW4gYWx3YXlzIGJlIHJlZ2VuZXJhdGVkIGV4YWN0bHkuXG4vL1xuLy8gTmV0d29yayAoYm90aCBnZW5lcmF0b3IgdmVyc2lvbnMpOlxuLy8gICBsYWtlICBcdTIwMTQgdGhlIHZhbGxleSBsYWtlIGJhc2luLCBsb2NhdGVkIGZyb20gdGhlIGFjdHVhbCBnZW5lcmF0ZWQgdGVycmFpbi5cbi8vICAgbG93ZXIgXHUyMDE0IHRoZSBsb3dsYW5kIHJpdmVyIGZyb20gdGhlIGxha2UgdG8gdGhlIHNvdXRoZXJuIHNlYSwgdHJhY2VkIGZyb21cbi8vICAgICAgICAgICB0aGUgYWN0dWFsIGNhcnZlZCBjaGFubmVsICh0aGUgdjEgY2hhbm5lbCBpcyBjYXJ2ZWQgb24gKndhcnBlZCpcbi8vICAgICAgICAgICBjb29yZGluYXRlcywgc28gYHJpdmVyQ2VudGVyWGAgYWxvbmUgaXMgdXAgdG8gfjEzNSBtIG9mZikuXG4vLyBHZW5lcmF0b3IgdjIgYWRkczpcbi8vICAgdXBwZXIgXHUyMDE0IGEgbW91bnRhaW4gcml2ZXIgZnJvbSBhIGhpZ2hsYW5kIHRhcm4gZG93biB0byB0aGUgbGFrZSwgd2l0aCBhXG4vLyAgICAgICAgICAgd2F0ZXItc3VyZmFjZSBsZXZlbCB0aGF0IG5ldmVyIHJpc2VzIGRvd25zdHJlYW0sIGNhc2NhZGVzIGFuZCBmYWxscy5cbi8vXG4vLyBGbG93IGFsd2F5cyBwb2ludHMgZG93bnN0cmVhbTogdXBwZXIgXHUyMTkyIGxha2UgXHUyMTkyIGxvd2VyIFx1MjE5MiBzZWEuXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbXVsYmVycnkzMiwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuXG5leHBvcnQgdHlwZSBIZWlnaHRTYW1wbGVyID0gKHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUml2ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZCBvZiB0aGlzIHJlYWNoIChtZXRyZXMpLiAqL1xuICBzOiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGVsZXZhdGlvbiAobWV0cmVzLCBtYXkgYmUgZnJhY3Rpb25hbCkuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBDaGFubmVsIGhhbGYtd2lkdGggKG1ldHJlcykuICovXG4gIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhY2hIaXQge1xuICAvKiogSG9yaXpvbnRhbCBkaXN0YW5jZSBmcm9tIHRoZSBjZW50cmVsaW5lLiAqL1xuICBkOiBudW1iZXI7XG4gIC8qKiBJbnRlcnBvbGF0ZWQgd2F0ZXIgbGV2ZWwgYXQgdGhlIG5lYXJlc3QgY2VudHJlbGluZSBwb2ludC4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgd2lkdGg6IG51bWJlcjtcbiAgLyoqIFVuaXQgZG93bnN0cmVhbSBkaXJlY3Rpb24uICovXG4gIHR4OiBudW1iZXI7XG4gIHR6OiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGRyb3AgcGVyIG1ldHJlIGFsb25nIHRoZSBjaGFubmVsICg+PSAwKS4gKi9cbiAgZ3JhZGllbnQ6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggb2YgdGhlIG5lYXJlc3QgcG9pbnQgZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQuICovXG4gIHM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHBvbHlsaW5lIHJlYWNoIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LiBOZWFyZXN0LXNlZ21lbnQgcXVlcmllcyB1c2UgYVxuICogdW5pZm9ybSBncmlkIHdob3NlIGNlbGxzIGxpc3QgZXZlcnkgc2VnbWVudCB3aXRoaW4gYHJlYWNoYCBtZXRyZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBSaXZlclJlYWNoIHtcbiAgcmVhZG9ubHkgcG9pbnRzOiBSaXZlclBvaW50W107XG4gIHByaXZhdGUgcmVhZG9ubHkgY2VsbCA9IDMyO1xuICBwcml2YXRlIHJlYWRvbmx5IGdyaWQgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyW10+KCk7XG5cbiAgY29uc3RydWN0b3IocG9pbnRzOiBSaXZlclBvaW50W10sIHJlYWRvbmx5IHJlYWNoOiBudW1iZXIpIHtcbiAgICB0aGlzLnBvaW50cyA9IHBvaW50cztcbiAgICBmb3IgKGxldCBpID0gMDsgaSArIDEgPCBwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGEgPSBwb2ludHNbaV0sIGIgPSBwb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgeDAgPSBNYXRoLm1pbihhLngsIGIueCkgLSByZWFjaCwgeDEgPSBNYXRoLm1heChhLngsIGIueCkgKyByZWFjaDtcbiAgICAgIGNvbnN0IHowID0gTWF0aC5taW4oYS56LCBiLnopIC0gcmVhY2gsIHoxID0gTWF0aC5tYXgoYS56LCBiLnopICsgcmVhY2g7XG4gICAgICBmb3IgKGxldCBjeiA9IE1hdGguZmxvb3IoejAgLyB0aGlzLmNlbGwpOyBjeiA8PSBNYXRoLmZsb29yKHoxIC8gdGhpcy5jZWxsKTsgY3orKykge1xuICAgICAgICBmb3IgKGxldCBjeCA9IE1hdGguZmxvb3IoeDAgLyB0aGlzLmNlbGwpOyBjeCA8PSBNYXRoLmZsb29yKHgxIC8gdGhpcy5jZWxsKTsgY3grKykge1xuICAgICAgICAgIGNvbnN0IGtleSA9IGNlbGxLZXkoY3gsIGN6KTtcbiAgICAgICAgICBsZXQgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoa2V5KTtcbiAgICAgICAgICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB0aGlzLmdyaWQuc2V0KGtleSwgbGlzdCk7IH1cbiAgICAgICAgICBsaXN0LnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnBvaW50c1t0aGlzLnBvaW50cy5sZW5ndGggLSAxXT8ucyA/PyAwOyB9XG5cbiAgLyoqIE5lYXJlc3QgY2VudHJlbGluZSBwb2ludCB3aXRoaW4gYHJlYWNoYCwgb3IgbnVsbC4gKi9cbiAgbmVhcmVzdCh4OiBudW1iZXIsIHo6IG51bWJlcik6IFJlYWNoSGl0IHwgbnVsbCB7XG4gICAgY29uc3QgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoY2VsbEtleShNYXRoLmZsb29yKHggLyB0aGlzLmNlbGwpLCBNYXRoLmZsb29yKHogLyB0aGlzLmNlbGwpKSk7XG4gICAgaWYgKCFsaXN0KSByZXR1cm4gbnVsbDtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBiaSA9IC0xLCBidCA9IDA7XG4gICAgZm9yIChjb25zdCBpIG9mIGxpc3QpIHtcbiAgICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tpXSwgYiA9IHRoaXMucG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IGR4ID0gYi54IC0gYS54LCBkeiA9IGIueiAtIGEuejtcbiAgICAgIGNvbnN0IGxlbjIgPSBkeCAqIGR4ICsgZHogKiBkeiB8fCAxO1xuICAgICAgY29uc3QgdCA9IGNsYW1wKCgoeCAtIGEueCkgKiBkeCArICh6IC0gYS56KSAqIGR6KSAvIGxlbjIsIDAsIDEpO1xuICAgICAgY29uc3QgcHggPSBhLnggKyBkeCAqIHQsIHB6ID0gYS56ICsgZHogKiB0O1xuICAgICAgY29uc3QgZDIgPSAoeCAtIHB4KSAqKiAyICsgKHogLSBweikgKiogMjtcbiAgICAgIGlmIChkMiA8IGJlc3QpIHsgYmVzdCA9IGQyOyBiaSA9IGk7IGJ0ID0gdDsgfVxuICAgIH1cbiAgICBpZiAoYmkgPCAwIHx8IGJlc3QgPiB0aGlzLnJlYWNoICogdGhpcy5yZWFjaCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2JpXSwgYiA9IHRoaXMucG9pbnRzW2JpICsgMV07XG4gICAgY29uc3Qgc2VnTGVuID0gTWF0aC5tYXgoMWUtNiwgYi5zIC0gYS5zKTtcbiAgICAvLyBQb2ludHMgYXJlIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LCBzbyBkb3duc3RyZWFtIGlzIGEgPC0gYi5cbiAgICBjb25zdCB0eCA9IChhLnggLSBiLngpIC8gc2VnTGVuLCB0eiA9IChhLnogLSBiLnopIC8gc2VnTGVuO1xuICAgIHJldHVybiB7XG4gICAgICBkOiBNYXRoLnNxcnQoYmVzdCksXG4gICAgICBsZXZlbDogYS5sZXZlbCArIChiLmxldmVsIC0gYS5sZXZlbCkgKiBidCxcbiAgICAgIHdpZHRoOiBhLndpZHRoICsgKGIud2lkdGggLSBhLndpZHRoKSAqIGJ0LFxuICAgICAgdHgsIHR6LFxuICAgICAgZ3JhZGllbnQ6IE1hdGgubWF4KDAsIChiLmxldmVsIC0gYS5sZXZlbCkgLyBzZWdMZW4pLFxuICAgICAgczogYS5zICsgKGIucyAtIGEucykgKiBidCxcbiAgICB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGNlbGxLZXkoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoY3ggKyA0MDk2KSAqIDgxOTIgKyAoY3ogKyA0MDk2KTtcbn1cblxuZXhwb3J0IHR5cGUgV2F0ZXJCb2R5ID0gJ3JpdmVyJyB8ICdsYWtlJyB8ICdzZWEnIHwgJ25vbmUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEZsb3dTYW1wbGUge1xuICBib2R5OiBXYXRlckJvZHk7XG4gIC8qKiBVbml0IGZsb3cgZGlyZWN0aW9uICh6ZXJvIGZvciBzdGlsbCB3YXRlcikuICovXG4gIGR4OiBudW1iZXI7XG4gIGR6OiBudW1iZXI7XG4gIC8qKiBTdXJmYWNlIGN1cnJlbnQgc3BlZWQgaW4gbS9zLiAqL1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEh5ZHJvbG9neU9wdGlvbnMge1xuICBzZWVkOiBudW1iZXI7XG4gIC8qKiBHZW5lcmF0b3IgdmVyc2lvbiB0aGUgbmV0d29yayBiZWxvbmdzIHRvLiAqL1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIC8qKiBCYXNlIGhlaWdodCBvZiB0aGUgKnVubW9kaWZpZWQgdjEgc2hhcGUqICh1c2VkIHRvIGxvY2F0ZSBsYWtlL2NoYW5uZWwpLiAqL1xuICB2MUhlaWdodDogSGVpZ2h0U2FtcGxlcjtcbn1cblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2dpY2FsIG5ldHdvcmsgZm9yIG9uZSAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pLiAqL1xuZXhwb3J0IGNsYXNzIEh5ZHJvbG9neSB7XG4gIHJlYWRvbmx5IHNlZWQ6IG51bWJlcjtcbiAgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuICByZWFkb25seSBsYWtlOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByeDogbnVtYmVyOyByejogbnVtYmVyIH07XG4gIHJlYWRvbmx5IGxvd2VyOiBSaXZlclJlYWNoO1xuICByZWFkb25seSB1cHBlcjogUml2ZXJSZWFjaCB8IG51bGw7XG4gIC8qKiBVcHBlci1yaXZlciBzb3VyY2UgdGFybiAodjIgb25seSkuICovXG4gIHJlYWRvbmx5IHRhcm46IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHI6IG51bWJlcjsgbGV2ZWw6IG51bWJlciB9IHwgbnVsbDtcblxuICBjb25zdHJ1Y3RvcihvcHRzOiBIeWRyb2xvZ3lPcHRpb25zKSB7XG4gICAgdGhpcy5zZWVkID0gb3B0cy5zZWVkO1xuICAgIHRoaXMudmVyc2lvbiA9IG9wdHMudmVyc2lvbjtcbiAgICB0aGlzLmxha2UgPSBsb2NhdGVMYWtlKG9wdHMudjFIZWlnaHQpO1xuICAgIHRoaXMubG93ZXIgPSB0cmFjZUxvd2VyUml2ZXIob3B0cy52MUhlaWdodCwgdGhpcy5sYWtlKTtcbiAgICBpZiAob3B0cy52ZXJzaW9uID49IDIpIHtcbiAgICAgIGNvbnN0IHVwcGVyID0gYXV0aG9yVXBwZXJSaXZlcihvcHRzLnNlZWQsIHRoaXMubGFrZSk7XG4gICAgICB0aGlzLnVwcGVyID0gdXBwZXIucmVhY2g7XG4gICAgICB0aGlzLnRhcm4gPSB1cHBlci50YXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVwcGVyID0gbnVsbDtcbiAgICAgIHRoaXMudGFybiA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN1cmZhY2UgY3VycmVudCBmb3IgYSB3YXRlciBjb2x1bW4uIGBsZXZlbGAgaXMgdGhlIGNvbHVtbidzIHdhdGVyIHN1cmZhY2UsXG4gICAqIHVzZWQgdG8gdGVsbCBzZWEtbGV2ZWwgd2F0ZXIgKGxha2UsIGxvd2VyIHJpdmVyLCBzZWEpIGZyb20gdGhlIHVwcGVyIHJpdmVyLlxuICAgKi9cbiAgZmxvd0F0KHg6IG51bWJlciwgejogbnVtYmVyLCBsZXZlbDogbnVtYmVyKTogRmxvd1NhbXBsZSB7XG4gICAgaWYgKHRoaXMudXBwZXIgJiYgbGV2ZWwgPiAwLjUpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHRoaXMudXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPD0gaGl0LndpZHRoICsgMikge1xuICAgICAgICBjb25zdCBzcGVlZCA9IGNsYW1wKDAuNTUgKyBoaXQuZ3JhZGllbnQgKiA5LCAwLjQsIDQuNSk7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBoaXQudHgsIGR6OiBoaXQudHosIHNwZWVkIH07XG4gICAgICB9XG4gICAgICBpZiAodGhpcy50YXJuICYmIE1hdGguaHlwb3QoeCAtIHRoaXMudGFybi54LCB6IC0gdGhpcy50YXJuLnopIDwgdGhpcy50YXJuLnIgKyA0KSB7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4udG93YXJkcyh4LCB6LCB0aGlzLnVwcGVyU291cmNlKCksIDAuMDYpIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGxvdyA9IHRoaXMubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDw9IGxvdy53aWR0aCArIDYpIHtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBsb3cudHgsIGR6OiBsb3cudHosIHNwZWVkOiAwLjM1ICsgMC4yNSAqIHNtb290aHN0ZXAobG93LndpZHRoICsgNiwgMCwgbG93LmQpIH07XG4gICAgfVxuICAgIGNvbnN0IGxkID0gTWF0aC5oeXBvdCgoeCAtIHRoaXMubGFrZS54KSAvIHRoaXMubGFrZS5yeCwgKHogLSB0aGlzLmxha2UueikgLyB0aGlzLmxha2UucnopO1xuICAgIGlmIChsZCA8IDEuMzUpIHtcbiAgICAgIC8vIFNsb3cgZHJpZnQgZnJvbSB0aGUgaW5mbG93IHRvd2FyZCB0aGUgb3V0ZmxvdyBhdCB0aGUgaGVhZCBvZiB0aGUgbG93ZXIgcml2ZXIuXG4gICAgICBjb25zdCBoZWFkID0gdGhpcy5sb3dlci5wb2ludHNbdGhpcy5sb3dlci5wb2ludHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBkcmlmdCA9IHRvd2FyZHMoeCwgeiwgaGVhZCwgMC4wOCk7XG4gICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLmRyaWZ0IH07XG4gICAgfVxuICAgIHJldHVybiB7IGJvZHk6ICdzZWEnLCBkeDogMCwgZHo6IDAsIHNwZWVkOiAwIH07XG4gIH1cblxuICBwcml2YXRlIHVwcGVyU291cmNlKCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gICAgY29uc3QgcHRzID0gdGhpcy51cHBlciEucG9pbnRzO1xuICAgIHJldHVybiBwdHNbcHRzLmxlbmd0aCAtIDFdO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvd2FyZHMoeDogbnVtYmVyLCB6OiBudW1iZXIsIHA6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgc3BlZWQ6IG51bWJlcikge1xuICBjb25zdCBkeCA9IHAueCAtIHgsIGR6ID0gcC56IC0gejtcbiAgY29uc3QgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gIHJldHVybiB7IGR4OiBkeCAvIGxlbiwgZHo6IGR6IC8gbGVuLCBzcGVlZCB9O1xufVxuXG4vKiogRmluZCB0aGUgdmFsbGV5IGxha2UgZnJvbSB0aGUgdGVycmFpbiBpdHNlbGY6IHRoZSBkZWVwIGJhc2luIE5XIG9mIHRoZSBmb3VuZGVyIHZhbGxleS4gKi9cbmZ1bmN0aW9uIGxvY2F0ZUxha2UoaDogSGVpZ2h0U2FtcGxlcik6IEh5ZHJvbG9neVsnbGFrZSddIHtcbiAgbGV0IHN4ID0gMCwgc3ogPSAwLCBuID0gMCwgbWluWCA9IEluZmluaXR5LCBtYXhYID0gLUluZmluaXR5LCBtaW5aID0gSW5maW5pdHksIG1heFogPSAtSW5maW5pdHk7XG4gIGZvciAobGV0IHogPSAtNDYwOyB6IDw9IC0xMjA7IHogKz0gNCkge1xuICAgIGZvciAobGV0IHggPSAtNDgwOyB4IDw9IC00MDsgeCArPSA0KSB7XG4gICAgICBpZiAoaCh4LCB6KSA+IC00KSBjb250aW51ZTtcbiAgICAgIHN4ICs9IHg7IHN6ICs9IHo7IG4rKztcbiAgICAgIG1pblggPSBNYXRoLm1pbihtaW5YLCB4KTsgbWF4WCA9IE1hdGgubWF4KG1heFgsIHgpO1xuICAgICAgbWluWiA9IE1hdGgubWluKG1pblosIHopOyBtYXhaID0gTWF0aC5tYXgobWF4Wiwgeik7XG4gICAgfVxuICB9XG4gIGlmIChuID09PSAwKSByZXR1cm4geyB4OiAtMjYwLCB6OiAtMjMwLCByeDogMTIwLCByejogOTUgfTtcbiAgcmV0dXJuIHtcbiAgICB4OiBzeCAvIG4sIHo6IHN6IC8gbixcbiAgICByeDogTWF0aC5tYXgoMzAsIChtYXhYIC0gbWluWCkgLyAyICsgMTApLCByejogTWF0aC5tYXgoMzAsIChtYXhaIC0gbWluWikgLyAyICsgMTApLFxuICB9O1xufVxuXG4vKipcbiAqIFRyYWNlIHRoZSBjYXJ2ZWQgbG93bGFuZCBjaGFubmVsIGZyb20gdGhlIGxha2Ugb3V0ZmxvdyBzb3V0aCB0byB0aGUgc2VhLiBGb3JcbiAqIGVhY2ggNCBtIHJvdyB0aGUgY2hhbm5lbCBpcyB0aGUgbG93ZXN0IGNvbHVtbiBuZWFyIHRoZSBwcmV2aW91cyBjZW50cmU7IHRoZVxuICogdHJhY2UgaXMgc21vb3RoZWQgc28gdGhlIGZsb3cgZmllbGQgZG9lcyBub3Qgaml0dGVyIHdpdGggdGhlIDEgbSB2b3hlbHMuXG4gKi9cbmZ1bmN0aW9uIHRyYWNlTG93ZXJSaXZlcihoOiBIZWlnaHRTYW1wbGVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IFJpdmVyUmVhY2gge1xuICBjb25zdCByYXc6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgbGV0IGN4ID0gbGFrZS54ICsgbGFrZS5yeCAqIDAuNTU7XG4gIGxldCB6ID0gTWF0aC5yb3VuZChsYWtlLnogKyBsYWtlLnJ6ICogMC42KTtcbiAgLy8gU3RhcnQgYXQgdGhlIGxha2UncyBzb3V0aC1lYXN0IG91dGZsb3cgYW5kIGZvbGxvdyB0aGUgY2hhbm5lbCBkb3duc3RyZWFtLlxuICBmb3IgKDsgeiA8PSA5MDA7IHogKz0gNCkge1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJ4ID0gY3g7XG4gICAgZm9yIChsZXQgeCA9IE1hdGgucm91bmQoY3ggLSA0MCk7IHggPD0gY3ggKyA0MDsgeCArPSAyKSB7XG4gICAgICBjb25zdCB2ID0gaCh4LCB6KSArIE1hdGguYWJzKHggLSBjeCkgKiAwLjAyO1xuICAgICAgaWYgKHYgPCBiZXN0KSB7IGJlc3QgPSB2OyBieCA9IHg7IH1cbiAgICB9XG4gICAgY3ggPSBieDtcbiAgICByYXcucHVzaCh7IHg6IGJ4LCB6IH0pO1xuICAgIC8vIFRoZSB0cmFjZSBlbmRzIG9uY2UgaXQgcmVhY2hlcyBvcGVuIHNlYSBmb3IgYSBzdXN0YWluZWQgc3RyZXRjaC5cbiAgICBpZiAoYmVzdCA8IC02ICYmIHJhdy5sZW5ndGggPiAyMCAmJiBoKGJ4LCB6ICsgOCkgPCAtNiAmJiBoKGJ4LCB6ICsgMTYpIDwgLTYpIGJyZWFrO1xuICB9XG4gIGNvbnN0IHNtb290aCA9IHJhdy5tYXAoKHAsIGkpID0+IHtcbiAgICBsZXQgc3ggPSAwLCBuID0gMDtcbiAgICBmb3IgKGxldCBrID0gTWF0aC5tYXgoMCwgaSAtIDQpOyBrIDw9IE1hdGgubWluKHJhdy5sZW5ndGggLSAxLCBpICsgNCk7IGsrKykgeyBzeCArPSByYXdba10ueDsgbisrOyB9XG4gICAgcmV0dXJuIHsgeDogc3ggLyBuLCB6OiBwLnogfTtcbiAgfSk7XG4gIC8vIFN0b3JlIGRvd25zdHJlYW0tZmlyc3Q6IGluZGV4IDAgaXMgdGhlIHNlYSBtb3V0aC5cbiAgc21vb3RoLnJldmVyc2UoKTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSBbXTtcbiAgbGV0IHMgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHNtb290aC5sZW5ndGg7IGkrKykge1xuICAgIGlmIChpID4gMCkgcyArPSBNYXRoLmh5cG90KHNtb290aFtpXS54IC0gc21vb3RoW2kgLSAxXS54LCBzbW9vdGhbaV0ueiAtIHNtb290aFtpIC0gMV0ueik7XG4gICAgcG9pbnRzLnB1c2goeyB4OiBzbW9vdGhbaV0ueCwgejogc21vb3RoW2ldLnosIHMsIGxldmVsOiAwLCB3aWR0aDogNiB9KTtcbiAgfVxuICByZXR1cm4gbmV3IFJpdmVyUmVhY2gocG9pbnRzLCA0MCk7XG59XG5cbi8qKiBXYXRlci1zdXJmYWNlIGRyb3BzIGFsb25nIHRoZSB1cHBlciByaXZlciwgYXMgKGZyYWN0aW9uIG9mIGxlbmd0aCwgbWV0cmVzKS4gKi9cbmNvbnN0IEZBTExTOiBSZWFkb25seUFycmF5PHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0+ID0gW1swLjIsIDddLCBbMC40OCwgMTFdLCBbMC43NCwgMTNdXTtcbmNvbnN0IFVQUEVSX0dSQURJRU5UID0gMC4wMztcblxuLyoqXG4gKiBBdXRob3IgdGhlIHYyIG1vdW50YWluIHJpdmVyOiBhIHNlZWRlZCBtZWFuZGVyaW5nIGNlbnRyZWxpbmUgZnJvbSB0aGUgbGFrZSdzXG4gKiBub3J0aCBzaG9yZSB0byBhIGhpZ2hsYW5kIHRhcm4sIHdpdGggYSBsZXZlbCBwcm9maWxlIHRoYXQgb25seSByaXNlc1xuICogdXBzdHJlYW0gKGdlbnRsZSBncmFkaWVudCBwbHVzIHRocmVlIGNhc2NhZGVzKS5cbiAqL1xuZnVuY3Rpb24gYXV0aG9yVXBwZXJSaXZlcihzZWVkOiBudW1iZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKToge1xuICByZWFjaDogUml2ZXJSZWFjaDsgdGFybjogTm9uTnVsbGFibGU8SHlkcm9sb2d5Wyd0YXJuJ10+O1xufSB7XG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKHNlZWQgXiAweDVlZWQyKSA+Pj4gMCk7XG4gIGNvbnN0IGogPSAoYTogbnVtYmVyKSA9PiAocm5kKCkgLSAwLjUpICogMiAqIGE7XG4gIGNvbnN0IG1vdXRoID0geyB4OiBsYWtlLnggKyBsYWtlLnJ4ICogMC4xLCB6OiBsYWtlLnogLSBsYWtlLnJ6ICogMC41NSB9O1xuICBjb25zdCBjb250cm9scyA9IFtcbiAgICBtb3V0aCxcbiAgICB7IHg6IGxha2UueCArIDIwICsgaigyMCksIHo6IC00MTAgKyBqKDE1KSB9LFxuICAgIHsgeDogLTE5MCArIGooMzUpLCB6OiAtNTIwICsgaigyMCkgfSxcbiAgICB7IHg6IC0yMTUgKyBqKDM1KSwgejogLTY0MCArIGooMjApIH0sXG4gICAgeyB4OiAtMTY1ICsgaigzMCksIHo6IC03NzAgKyBqKDE1KSB9LFxuICBdO1xuICAvLyBDYXRtdWxsLVJvbSB0aHJvdWdoIHRoZSBjb250cm9scywgdGhlbiByZXNhbXBsZSBhdCB+OCBtIHNwYWNpbmcgd2l0aCBhXG4gIC8vIHNtYWxsIHNlZWRlZCBtZWFuZGVyIHNvIHRoZSBjaGFubmVsIGlzIG5vdCBhIHNtb290aCBzcGxpbmUuXG4gIGNvbnN0IGRlbnNlOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29udHJvbHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgY29uc3QgcDAgPSBjb250cm9sc1tNYXRoLm1heCgwLCBpIC0gMSldLCBwMSA9IGNvbnRyb2xzW2ldO1xuICAgIGNvbnN0IHAyID0gY29udHJvbHNbaSArIDFdLCBwMyA9IGNvbnRyb2xzW01hdGgubWluKGNvbnRyb2xzLmxlbmd0aCAtIDEsIGkgKyAyKV07XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCAyNDsgaysrKSB7XG4gICAgICBjb25zdCB0ID0gayAvIDI0LCB0MiA9IHQgKiB0LCB0MyA9IHQyICogdDtcbiAgICAgIGRlbnNlLnB1c2goe1xuICAgICAgICB4OiAwLjUgKiAoMiAqIHAxLnggKyAoLXAwLnggKyBwMi54KSAqIHQgKyAoMiAqIHAwLnggLSA1ICogcDEueCArIDQgKiBwMi54IC0gcDMueCkgKiB0MlxuICAgICAgICAgICsgKC1wMC54ICsgMyAqIHAxLnggLSAzICogcDIueCArIHAzLngpICogdDMpLFxuICAgICAgICB6OiAwLjUgKiAoMiAqIHAxLnogKyAoLXAwLnogKyBwMi56KSAqIHQgKyAoMiAqIHAwLnogLSA1ICogcDEueiArIDQgKiBwMi56IC0gcDMueikgKiB0MlxuICAgICAgICAgICsgKC1wMC56ICsgMyAqIHAxLnogLSAzICogcDIueiArIHAzLnopICogdDMpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGRlbnNlLnB1c2goY29udHJvbHNbY29udHJvbHMubGVuZ3RoIC0gMV0pO1xuICBjb25zdCByZXNhbXBsZWQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHM6IG51bWJlciB9PiA9IFt7IC4uLmRlbnNlWzBdLCBzOiAwIH1dO1xuICBsZXQgYWNjID0gMCwgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgZGVuc2UubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5oeXBvdChkZW5zZVtpXS54IC0gZGVuc2VbaSAtIDFdLngsIGRlbnNlW2ldLnogLSBkZW5zZVtpIC0gMV0ueik7XG4gICAgYWNjICs9IHN0ZXA7IHMgKz0gc3RlcDtcbiAgICBpZiAoYWNjID49IDggfHwgaSA9PT0gZGVuc2UubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbSA9IChmYm0yKHMgLyA2MCwgMy4xLCBzZWVkICsgODAxLCAyKSAtIDAuNSkgKiAxNDtcbiAgICAgIHJlc2FtcGxlZC5wdXNoKHsgeDogZGVuc2VbaV0ueCArIG0sIHo6IGRlbnNlW2ldLnosIHMgfSk7XG4gICAgICBhY2MgPSAwO1xuICAgIH1cbiAgfVxuICBjb25zdCB0b3RhbCA9IHJlc2FtcGxlZFtyZXNhbXBsZWQubGVuZ3RoIC0gMV0ucztcbiAgY29uc3QgbGV2ZWxBdCA9IChzdjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBsZXQgbGV2ZWwgPSBzdiAqIFVQUEVSX0dSQURJRU5UO1xuICAgIGZvciAoY29uc3QgW2ZyYWMsIGRyb3BdIG9mIEZBTExTKSB7XG4gICAgICAvLyBFYWNoIGZhbGwgaXMgYSBzaG9ydCBjYXNjYWRlIG92ZXIgfjEwIG0gb2YgY2hhbm5lbC5cbiAgICAgIGxldmVsICs9IGRyb3AgKiBzbW9vdGhzdGVwKHRvdGFsICogZnJhYyAtIDUsIHRvdGFsICogZnJhYyArIDUsIHN2KTtcbiAgICB9XG4gICAgLy8gVGhlIGZpcnN0IDQwIG0gaW50byB0aGUgbGFrZSBzdGF5cyBhdCBsYWtlIGxldmVsLlxuICAgIHJldHVybiBzdiA8IDQwID8gMCA6IGxldmVsIC0gNDAgKiBVUFBFUl9HUkFESUVOVDtcbiAgfTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSByZXNhbXBsZWQubWFwKChwKSA9PiAoe1xuICAgIHg6IHAueCwgejogcC56LCBzOiBwLnMsIGxldmVsOiBNYXRoLm1heCgwLCBsZXZlbEF0KHAucykpLFxuICAgIHdpZHRoOiAzLjIgKyAyLjIgKiBmYm0yKHAucyAvIDcwLCA5LjcsIHNlZWQgKyA4MDIsIDIpICsgKDEgLSBwLnMgLyB0b3RhbCkgKiAxLjUsXG4gIH0pKTtcbiAgY29uc3Qgc291cmNlID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIHtcbiAgICByZWFjaDogbmV3IFJpdmVyUmVhY2gocG9pbnRzLCAxMTApLFxuICAgIHRhcm46IHsgeDogc291cmNlLngsIHo6IHNvdXJjZS56LCByOiAxOCwgbGV2ZWw6IHNvdXJjZS5sZXZlbCB9LFxuICB9O1xufVxuIiwgIi8vIFZveGVsIG1hdGVyaWFsIGlkcy4gUHVyZSBkYXRhIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllciAoRC0wMDUpLlxuLy8gSWRzIGFyZSBwZXJzaXN0ZWQgaW4gc25hcHNob3QgZWRpdHMsIHNvIGV4aXN0aW5nIHZhbHVlcyBtdXN0IG5ldmVyIGNoYW5nZS5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG4gIC8qKiBHZW5lcmF0b3IgdjIgaGlnaGxhbmRzLiBOZXZlciBwcm9kdWNlZCBieSBnZW5lcmF0b3IgdjEuICovXG4gIFNOT1c6IDEwLFxufSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIE1hdElkID0gKHR5cGVvZiBNQVQpW2tleW9mIHR5cGVvZiBNQVRdO1xuXG5leHBvcnQgY29uc3QgaXNTb2xpZCA9IChtOiBudW1iZXIpOiBib29sZWFuID0+IG0gIT09IE1BVC5BSVIgJiYgbSAhPT0gTUFULldBVEVSO1xuZXhwb3J0IGNvbnN0IGlzT3BhcXVlID0gaXNTb2xpZDtcblxuLyoqIEhpZ2hlc3QgbWF0ZXJpYWwgaWQgdGhhdCBtYXkgYXBwZWFyIGluIGEgdm94ZWwgZWRpdC4gKi9cbmV4cG9ydCBjb25zdCBNQVhfTUFUX0lEID0gMTA7XG4iLCAiLy8gVGVycmFpbiBnZW5lcmF0b3IgdjIgXHUyMDE0IHRoZSB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IChwdXJlIFRTLCBELTAwNSkuXG4vL1xuLy8gQ29tcGF0aWJpbGl0eSBjb250cmFjdDogaW5zaWRlIHRoZSBmb3VuZGVyIGNvcnJpZG9yICh0aGUgc2V0dGxlbWVudCB2YWxsZXksXG4vLyB0aGUgbGFrZSBhbmQgdGhlIGxvd2xhbmQgcml2ZXIpIHYyIGhlaWdodHMgZXF1YWwgdjEgZXhhY3RseSwgc28gdGhlIHBpbm5lZFxuLy8gZm91bmRlciBwcm9qZWN0cywgdGhlaXIgcHJlcGFyYXRpb24gdGFyZ2V0cyBhbmQgbmF0dXJhbCBlbnRpdGllcyB0aGVyZSBhcmVcbi8vIHVuY2hhbmdlZC4gT3V0c2lkZSBpdCB2MiBhZGRzOlxuLy8gICAtIGEgbm9ydGhlcm4gbWFzc2lmIG9uIGFuIGV4dGVuZGVkIGlzbGFuZCwgd2l0aCBzbm93IGFib3ZlIHRoZSBzbm93bGluZTtcbi8vICAgLSBmbGFua2luZyByYW5nZXMgd2VzdCBhbmQgZWFzdCBvZiB0aGUgdmFsbGV5LCB0ZXJyYWNlZCBpbnRvIGNsaWZmIGJhbmRzO1xuLy8gICAtIGEgbW91bnRhaW4gcml2ZXIgY2FydmVkIGludG8gdGhlIG1hc3NpZiBmcm9tIGEgdGFybiBkb3duIHRvIHRoZSBsYWtlLFxuLy8gICAgIHdob3NlIHdhdGVyIHN1cmZhY2UgY29tZXMgZnJvbSBIeWRyb2xvZ3kgYW5kIG5ldmVyIHJpc2VzIGRvd25zdHJlYW07XG4vLyAgIC0gYSBjb250aW51b3VzIGxvd2xhbmQgY2hhbm5lbCAodjEgaGFzIGEgZHJ5IGZvcmQgc291dGggb2YgdGhlIHNoZWxmKS5cbi8vIEhlaWdodHMgYXJlIGludGVnZXJzIGluIFstMTQsIDEwNF0uXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbGVycCwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHsgTUFULCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcblxuZXhwb3J0IGNvbnN0IFYyX1NOT1dMSU5FID0gNzQ7XG5leHBvcnQgY29uc3QgVjJfTUFYX0hFSUdIVCA9IDEwNDtcblxuZXhwb3J0IHR5cGUgVjFIZWlnaHQgPSAoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFYyQ29sdW1uIHtcbiAgLyoqIFRvcCBzb2xpZCB5ICsgMSAoc2FtZSBjb252ZW50aW9uIGFzIHN1cmZhY2VIZWlnaHRBdCkuICovXG4gIGg6IG51bWJlcjtcbiAgLyoqIFdhdGVyIHN1cmZhY2UgZm9yIHRoaXMgY29sdW1uOiBjZWxscyBbaCwgbGV2ZWwpIGhvbGQgd2F0ZXIuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBjb2x1bW4gaXMgcGFydCBvZiB0aGUgY2FydmVkIG1vdW50YWluLXJpdmVyIGNoYW5uZWwuICovXG4gIGNoYW5uZWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJyYWluVjIge1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSBzZWVkOiBudW1iZXIsXG4gICAgcHJpdmF0ZSByZWFkb25seSB2MTogVjFIZWlnaHQsXG4gICAgcmVhZG9ubHkgaHlkcm9sb2d5OiBIeWRyb2xvZ3ksXG4gICkge31cblxuICAvKiogMCA9IGV4YWN0bHkgdjEgKGZvdW5kZXIgY29ycmlkb3IpOyAxID0gZnVsbCB2MiByZWxpZWYuICovXG4gIHJlbGllZk1hc2soeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtMzkwLCAtNDcwLCB6KTtcbiAgICAvLyBUaGUgd2VzdCByYW5nZSBrZWVwcyBjbGVhciBvZiB0aGUgbGFrZSBiYXNpbiB1bnRpbCB0aGUgbGFrZSBpcyBwYXNzZWQuXG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlLCB3ZXN0RWRnZSAtIDkwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyMzAsIDMzMCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIC8qKiAwIGF0IHRoZSByYW5nZSBmcm9udCwgMSBkZWVwIGluc2lkZTogZm9vdGhpbGxzIGZpcnN0LCBwZWFrcyBiZWhpbmQuICovXG4gIHJhbmdlRGVwdGgoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtNDIwLCAtNzAwLCB6KTtcbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UgLSA0MCwgd2VzdEVkZ2UgLSAzMDAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDI3MCwgNTYwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVjJDb2x1bW4ge1xuICAgIGNvbnN0IHNlZWQgPSB0aGlzLnNlZWQ7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMudjEoc2VlZCwgeCwgeik7XG4gICAgY29uc3QgbWFzayA9IHRoaXMucmVsaWVmTWFzayh4LCB6KTtcbiAgICBsZXQgaCA9IGJhc2U7XG5cbiAgICBpZiAobWFzayA+IDApIHtcbiAgICAgIC8vIEV4dGVuZCB0aGUgaXNsYW5kIG5vcnRoIHNvIHRoZSBtYXNzaWYgaGFzIHJvb20gKHYxIGNvYXN0IGlzIH56IC02MDApLlxuICAgICAgY29uc3Qgbm9ydGhMYW5kID0gc21vb3Roc3RlcCgtNDIwLCAtNTIwLCB6KTtcbiAgICAgIGNvbnN0IHNob3JlID0gMSAtIE1hdGguaHlwb3QoKHggKyAxNTApIC8gNTYwLCAoeiArIDY5MCkgLyAzMDApXG4gICAgICAgICsgKGZibTIoeCAvIDE2MCwgeiAvIDE2MCwgc2VlZCArIDcwMSwgMykgLSAwLjUpICogMC4zO1xuICAgICAgY29uc3QgbGFuZE4gPSBzbW9vdGhzdGVwKDAuMCwgMC4xNCwgc2hvcmUpICogbm9ydGhMYW5kO1xuICAgICAgY29uc3QgZ3JvdW5kID0gbGVycChiYXNlLCBNYXRoLm1heChiYXNlLCA1ICsgNSAqIGZibTIoeCAvIDkwLCB6IC8gOTAsIHNlZWQgKyA3MDIsIDIpKSwgbGFuZE4pO1xuXG4gICAgICAvLyBSaWRnZWQgbWFzc2lmIHdpdGggdGVycmFjZWQgY2xpZmYgYmFuZHMuXG4gICAgICBjb25zdCB3eCA9IHggKyAoZmJtMih4IC8gMjYwLCB6IC8gMjYwLCBzZWVkICsgNzAzLCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCB3eiA9IHogKyAoZmJtMih4IC8gMjYwICsgNS4xLCB6IC8gMjYwIC0gMi43LCBzZWVkICsgNzA0LCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCByMSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIxMCwgd3ogLyAyMTAsIHNlZWQgKyA3MDUsIDQpIC0gMSk7XG4gICAgICBjb25zdCByMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDgwLCB3eiAvIDgwLCBzZWVkICsgNzA2LCAzKSAtIDEpO1xuICAgICAgY29uc3QgbHVtcCA9IGZibTIod3ggLyAxMjAsIHd6IC8gMTIwLCBzZWVkICsgNzA3LCAzKTtcbiAgICAgIGNvbnN0IGRlcHRoID0gdGhpcy5yYW5nZURlcHRoKHgsIHopO1xuICAgICAgbGV0IG1vdW50YWluID0gMTYgKyAoOCArIDgwICogZGVwdGgpICogKDAuNTUgKiByMSAqIHIxICsgMC4yOCAqIHIyICsgMC4xNyAqIGx1bXApXG4gICAgICAgICsgMTggKiBkZXB0aCAqIHNtb290aHN0ZXAoMC41NSwgMC45LCByMSk7XG4gICAgICBjb25zdCBiYW5kID0gNiArIDIgKiBmYm0yKHggLyAxNDAsIHogLyAxNDAsIHNlZWQgKyA3MDgsIDIpO1xuICAgICAgY29uc3QgdCA9IE1hdGguZmxvb3IobW91bnRhaW4gLyBiYW5kKTtcbiAgICAgIGNvbnN0IGZyYWMgPSBtb3VudGFpbiAvIGJhbmQgLSB0O1xuICAgICAgbW91bnRhaW4gPSAodCArIHNtb290aHN0ZXAoMC41LCAwLjgsIGZyYWMpKSAqIGJhbmQ7XG5cbiAgICAgIC8vIE9ubHkgbGFuZCByaXNlczsgdGhlIHNlYSBzdGF5cyBzZWEsIHNvIHJhbmdlcyBlbmQgaW4gY29hc3RhbCBjbGlmZnMuXG4gICAgICBjb25zdCBsYW5kRmFjdG9yID0gc21vb3Roc3RlcCgtMiwgOCwgZ3JvdW5kKTtcbiAgICAgIGggPSBsZXJwKGdyb3VuZCwgTWF0aC5tYXgoZ3JvdW5kLCBtb3VudGFpbiksIG1hc2sgKiBsYW5kRmFjdG9yKTtcbiAgICB9XG5cbiAgICBsZXQgbGV2ZWwgPSBoIDwgMCA/IDAgOiAtSW5maW5pdHk7XG4gICAgbGV0IGNoYW5uZWwgPSBmYWxzZTtcblxuICAgIC8vIE1vdW50YWluIHJpdmVyOiB2YWxsZXkgZmxvb3IsIGJhbmtzIGFuZCBjaGFubmVsIGZvbGxvdyB0aGUgd2F0ZXIgbGV2ZWwuXG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIGNvbnN0IHJhaXNlZCA9IGhpdC5sZXZlbCA+IDAuMjU7XG4gICAgICAgIGNvbnN0IHZ3ID0gNTUgKyAyOCAqIGZibTIoaGl0LnMgLyA5MCwgMS43LCBzZWVkICsgNzA5LCAyKTtcbiAgICAgICAgY29uc3QgZmxvb3IgPSBoaXQubGV2ZWwgKyAxLjUgKyAyLjIgKiBmYm0yKHggLyA0MCwgeiAvIDQwLCBzZWVkICsgNzEwLCAyKSArIGhpdC5kICogMC4wNjtcbiAgICAgICAgY29uc3QgdCA9IHNtb290aHN0ZXAodncgKiAwLjMsIHZ3LCBoaXQuZCk7XG4gICAgICAgIGggPSBNYXRoLm1pbihoLCBsZXJwKGZsb29yLCBoLCB0KSk7XG4gICAgICAgIGNvbnN0IHcgPSBoaXQud2lkdGg7XG4gICAgICAgIGlmIChyYWlzZWQgJiYgaGl0LmQgPCB3ICsgMykge1xuICAgICAgICAgIC8vIEJhbmtzIGhvbGQgYSByYWlzZWQgcml2ZXI6IG5ldmVyIGJlbG93IGl0cyB3YXRlciBzdXJmYWNlLiBBdCBsYWtlXG4gICAgICAgICAgLy8gbGV2ZWwgdGhlIHNlYS1sZXZlbCBmaWxsIGFscmVhZHkgY29udGFpbnMgdGhlIHdhdGVyLlxuICAgICAgICAgIGggPSBNYXRoLm1heChoLCBNYXRoLmNlaWwoaGl0LmxldmVsKSArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoaXQuZCA8IHcpIHtcbiAgICAgICAgICBjb25zdCBiZWQgPSBoaXQubGV2ZWwgLSAoMS4yICsgMS4zICogKDEgLSBoaXQuZCAvIHcpKTtcbiAgICAgICAgICBoID0gTWF0aC5taW4oaCwgYmVkKTtcbiAgICAgICAgICBpZiAocmFpc2VkKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKGhpdC5sZXZlbCkpO1xuICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCB0YXJuID0gdGhpcy5oeWRyb2xvZ3kudGFybjtcbiAgICAgIGlmICh0YXJuKSB7XG4gICAgICAgIGNvbnN0IHRkID0gTWF0aC5oeXBvdCh4IC0gdGFybi54LCB6IC0gdGFybi56KVxuICAgICAgICAgICogKDEgKyAwLjIgKiAoZmJtMih4IC8gMzAsIHogLyAzMCwgc2VlZCArIDcxMSwgMikgLSAwLjUpKTtcbiAgICAgICAgaWYgKHRkIDwgdGFybi5yICsgNikge1xuICAgICAgICAgIGNvbnN0IHJpbSA9IE1hdGguY2VpbCh0YXJuLmxldmVsKSArIDE7XG4gICAgICAgICAgaWYgKHRkID49IHRhcm4ucikgaCA9IE1hdGgubWF4KGgsIHJpbSk7XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBoID0gTWF0aC5taW4oTWF0aC5tYXgoaCwgcmltKSwgdGFybi5sZXZlbCAtIDEgLSAzICogc21vb3Roc3RlcCh0YXJuLnIsIDAsIHRkKSk7XG4gICAgICAgICAgICBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKHRhcm4ubGV2ZWwpKTtcbiAgICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExvd2xhbmQgY2hhbm5lbCBjb250aW51aXR5OiB2MSBsZWF2ZXMgYSBkcnkgZm9yZCB3aGVyZSB0aGUgc2hlbGYgbWVldHMgdGhlIHJpdmVyLlxuICAgIGNvbnN0IGxvdyA9IHRoaXMuaHlkcm9sb2d5Lmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8IDIuNSAmJiBoID49IDAgJiYgYmFzZSA8IDQpIGggPSAtMTtcblxuICAgIGggPSBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgVjJfTUFYX0hFSUdIVCkpO1xuICAgIGlmIChoIDwgMCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgMCk7XG4gICAgcmV0dXJuIHsgaCwgbGV2ZWw6IGxldmVsID09PSAtSW5maW5pdHkgPyBoIDogbGV2ZWwsIGNoYW5uZWwgfTtcbiAgfVxuXG4gIGhlaWdodCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY29sdW1uKHgsIHopLmg7XG4gIH1cblxuICAvKiogdjIgdG9wIG1hdGVyaWFsLiBGYWxscyBiYWNrIHRvIHRoZSB2MSBydWxlcyBmb3IgdGhlIHVuY2hhbmdlZCBjb3JyaWRvci4gKi9cbiAgdG9wTWF0ZXJpYWwoXG4gICAgeDogbnVtYmVyLCB6OiBudW1iZXIsIGNvbDogVjJDb2x1bW4sIHNsb3BlOiBudW1iZXIsXG4gICAgdjFUb3A6IChoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIpID0+IE1hdElkLFxuICApOiBNYXRJZCB7XG4gICAgY29uc3QgaCA9IGNvbC5oO1xuICAgIGlmIChjb2wuY2hhbm5lbCAmJiBjb2wubGV2ZWwgPiBoKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlciAmJiBoID4gMSkge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPCBoaXQud2lkdGggKyAyLjUgJiYgaGl0LmxldmVsID4gMC4yNSkge1xuICAgICAgICByZXR1cm4gZmJtMih4IC8gNiwgeiAvIDYsIHRoaXMuc2VlZCArIDcxMiwgMSkgPiAwLjUgPyBNQVQuR1JBVkVMIDogTUFULlNBTkQ7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNub3dsaW5lID0gVjJfU05PV0xJTkUgKyAoZmJtMih4IC8gNzAsIHogLyA3MCwgdGhpcy5zZWVkICsgNzEzLCAzKSAtIDAuNSkgKiAxNjtcbiAgICBpZiAoaCA+PSBzbm93bGluZSAmJiBzbG9wZSA8PSAzKSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgLSA2ICYmIHNsb3BlIDw9IDEgJiYgZmJtMih4IC8gMjAsIHogLyAyMCwgdGhpcy5zZWVkICsgNzE0LCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAodGhpcy5yZWxpZWZNYXNrKHgsIHopID4gMC41ICYmIGggPiAzMCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICAgIHJldHVybiB2MVRvcChoLCBzbG9wZSk7XG4gIH1cbn1cbiIsICIvLyBTaW11bGF0aW9uIGxheWVyIFx1MjAxNCBwdXJlIFR5cGVTY3JpcHQsIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAxIHdvcmxkIGZvdW5kYXRpb246IGEgY2h1bmtlZCwgZ2VudWluZWx5IHRocmVlLWRpbWVuc2lvbmFsIHZveGVsIHdvcmxkLlxuLy8gVGhlIHN0b3JlZCBzdGF0ZSBpcyBvbmUgbWF0ZXJpYWwgYnl0ZSBwZXIgY2VsbCAoMCA9IGFpcik7IG9jY3VwYW5jeSBpc1xuLy8gaW1wbGljaXQuIFN1cmZhY2UgaGVpZ2h0IGlzIGEgZGVyaXZlZCBxdWVyeSwgbm90IHRoZSBzdG9yYWdlLiBUaGlzIHJlcGxhY2VzXG4vLyB0aGUgZm9ybWVyIDI1NiB4IDI1NiBoZWlnaHRmaWVsZCAoc2VlIElSLTAwNSkuXG4vL1xuLy8gV29ybGQgbWV0cmVzOiB4L3ogaW4gWy0xMDI0LCAxMDI0KSwgeSBpbiBbLTE2LCAxMTIpLCBzZWEgbGV2ZWwgMC5cbi8vIEEgY2h1bmsgaXMgMzIgeCAzMiB4IDEyOCBjZWxscy4gR2VuZXJhdGlvbiBpcyBhIHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQsXG4vLyBnZW5lcmF0b3IgdmVyc2lvbiwgcGFyYW1ldGVycyBhbmQgY2h1bmsgY29vcmRpbmF0ZXM7IGVkaXRzIGFyZSByZWNvcmRlZFxuLy8gc2VwYXJhdGVseSBhbmQgcmUtYXBwbGllZCB3aGVuIGEgY2h1bmsgaXMgcmVnZW5lcmF0ZWQuXG5pbXBvcnQgdHlwZSB7IFN0cnVjdHVyZSB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQgdHlwZSB7IExpZmVTdGF0ZSB9IGZyb20gJy4vZWNvbm9teSc7XG5pbXBvcnQgdHlwZSB7IEhvbWVzdGVhZFN0YXRlIH0gZnJvbSAnLi9ob21lc3RlYWQnO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcbmltcG9ydCB7IFRlcnJhaW5WMiwgVjJDb2x1bW4gfSBmcm9tICcuL3RlcnJhaW4tdjInO1xuaW1wb3J0IHsgdHJlZVRpbWJlciB9IGZyb20gJy4vdmVnZXRhdGlvbic7XG5cbmV4cG9ydCBjb25zdCBXT1JMRF9TSVpFID0gMjA0ODtcbmV4cG9ydCBjb25zdCBIQUxGID0gV09STERfU0laRSAvIDI7XG5leHBvcnQgY29uc3QgQ0hVTktfU0laRSA9IDMyO1xuZXhwb3J0IGNvbnN0IENIVU5LU19QRVJfU0lERSA9IFdPUkxEX1NJWkUgLyBDSFVOS19TSVpFO1xuZXhwb3J0IGNvbnN0IFlfTUlOID0gLTE2O1xuZXhwb3J0IGNvbnN0IFlfTUFYID0gMTEyO1xuZXhwb3J0IGNvbnN0IFdPUkxEX0hFSUdIVCA9IFlfTUFYIC0gWV9NSU47XG5leHBvcnQgY29uc3QgU0VBX0xFVkVMID0gMDtcbmV4cG9ydCBjb25zdCBXQVRFUiA9IFNFQV9MRVZFTDtcbi8qKiBHZW5lcmF0b3IgdjE6IHRoZSBvcmlnaW5hbCAyMDQ4IG0gaXNsYW5kLiBEZWZhdWx0IGZvciBjcmVhdGVXb3JsZCBhbmQgYWxsIGxlZ2FjeSBzYXZlcy4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVkVSU0lPTiA9IDE7XG4vKiogR2VuZXJhdG9yIHYyOiB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IHdpdGggYSBtb3VudGFpbiByaXZlciAoc2VlIHRlcnJhaW4tdjIudHMpLiAqL1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WMiA9IDI7XG4vKiogVGhlIGdlbmVyYXRvciBuZXcgYnJvd3NlciB3b3JsZHMgdXNlIGJ5IGRlZmF1bHQuICovXG5leHBvcnQgY29uc3QgTEFURVNUX0dFTkVSQVRPUl9WRVJTSU9OID0gR0VORVJBVE9SX1YyO1xuZXhwb3J0IGNvbnN0IFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlM6IHJlYWRvbmx5IG51bWJlcltdID0gW0dFTkVSQVRPUl9WRVJTSU9OLCBHRU5FUkFUT1JfVjJdO1xuZXhwb3J0IGNvbnN0IGlzU3VwcG9ydGVkR2VuZXJhdG9yID0gKHY6IHVua25vd24pOiB2IGlzIG51bWJlciA9PlxuICB0eXBlb2YgdiA9PT0gJ251bWJlcicgJiYgU1VQUE9SVEVEX0dFTkVSQVRPUl9WRVJTSU9OUy5pbmNsdWRlcyh2KTtcbmV4cG9ydCBjb25zdCBDSFVOS19WT0xVTUUgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRSAqIFdPUkxEX0hFSUdIVDtcbmV4cG9ydCBjb25zdCBDSFVOS19BUkVBID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkU7XG5cbmV4cG9ydCB7IE1BVCwgaXNTb2xpZCwgaXNPcGFxdWUsIE1BWF9NQVRfSUQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5leHBvcnQgdHlwZSB7IE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuaW1wb3J0IHsgTUFULCBpc1NvbGlkLCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcblxuZXhwb3J0IHtcbiAgY2xhbXAsIGxlcnAsIGhhc2gyaSwgaGFzaDNpLCBtdWxiZXJyeTMyLCBmYm0yLFxufSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBzbW9vdGhzdGVwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgdmFsdWVOb2lzZTMsIGZibTIsIGZibTMsXG59IGZyb20gJy4vbm9pc2UnO1xuXG4vLyAtLS0tLS0tLS0tIHdvcmxkIHR5cGVzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRQYXJhbXMge1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9QQVJBTVM6IFdvcmxkUGFyYW1zID0ge1xuICBzaXplOiBXT1JMRF9TSVpFLFxuICBjaHVua1NpemU6IENIVU5LX1NJWkUsXG4gIHlNaW46IFlfTUlOLFxuICB5TWF4OiBZX01BWCxcbiAgc2VhTGV2ZWw6IFNFQV9MRVZFTCxcbiAgZ2VuZXJhdG9yVmVyc2lvbjogR0VORVJBVE9SX1ZFUlNJT04sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBrZXk6IHN0cmluZztcbiAgLyoqIHggKyB6KjMyICsgKHktWV9NSU4pKjEwMjQgKi9cbiAgZGF0YTogVWludDhBcnJheTtcbiAgLyoqIHRvcCBzb2xpZCB5LCBlbmNvZGVkIGFzICh5IC0gWV9NSU4pLCAwLi4xMjc7IDAgbWVhbnMgbm8gc29saWQuICovXG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3AgbWF0ZXJpYWwgcGVyIGNvbHVtbi4gKi9cbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbiAgZGlydHk6IGJvb2xlYW47XG4gIGdlbmVyYXRlZEF0OiBudW1iZXI7XG59XG5cbi8vIE5hdHVyYWwgYXNzZXRzIGFyZSB0aGUgcHJvamVjdCdzIFN0eWwgKGBuYXRfYCkgcGlwZWxpbmUgKEFTLTAwMSB2MiksIG5vdFxuLy8gTm94ZWwgYXJjaGl0ZWN0dXJlLiBOb3hlbCByZW1haW5zIHRoZSBodW1hbi1tYWRlIGtpdC93YXlzdG9uZS9tYXJrZXIgc3lzdGVtLlxuLy8gUmV0aXJlZCBvbmx5IGFzIHdvcmxkIGNvbnRlbnQuIFRoZSBuYW1lcyByZW1haW4gaW4gdGhlIHNlcmlhbGl6ZWQgdHlwZSBzb1xuLy8gb2xkIHNuYXBzaG90cyBhbmQgYWNjZXB0ZWQgaGFydmVzdCBqb3VybmFscyBjYW4gYmUgbWlncmF0ZWQgd2l0aG91dCByZWplY3Rpbmdcbi8vIG90aGVyd2lzZSB2YWxpZCBzYXZlcy4gR2VuZXJhdGlvbiwgY29sbGlzaW9uIGFuZCBpbnNwZWN0aW9uIG5ldmVyIHVzZSB0aGVtLlxuZXhwb3J0IGNvbnN0IFJFVElSRURfU1RPTkVfS0lORFMgPSBuZXcgU2V0PEVudGl0eUtpbmQ+KFtcbiAgJ3N0eWxfcm9ja19zbWFsbCcsICdzdHlsX3JvY2tfbWVkaXVtJywgJ3N0eWxfcm9ja19sYXJnZScsXG5dKTtcbmV4cG9ydCBjb25zdCBpc1JldGlyZWRTdG9uZUtpbmQgPSAoa2luZDogRW50aXR5S2luZCk6IGJvb2xlYW4gPT4gUkVUSVJFRF9TVE9ORV9LSU5EUy5oYXMoa2luZCk7XG5leHBvcnQgdHlwZSBBY3RpdmVFbnRpdHlLaW5kID0gRXhjbHVkZTxFbnRpdHlLaW5kLFxuICAnc3R5bF9yb2NrX3NtYWxsJyB8ICdzdHlsX3JvY2tfbWVkaXVtJyB8ICdzdHlsX3JvY2tfbGFyZ2UnPjtcblxuZnVuY3Rpb24gbGl2ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBFbnRpdHkgfCBudWxsIHtcbiAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgcmV0dXJuICFlbnRpdHkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhpZCkgPyBudWxsIDogZW50aXR5O1xufVxuXG5leHBvcnQgdHlwZSBFbnRpdHlLaW5kID1cbiAgfCAnc3R5bF90cmVlX3NwaXJlJ1xuICB8ICdzdHlsX3RyZWVfdGFibGUnXG4gIHwgJ3N0eWxfdHJlZV9jbHVzdGVyJ1xuICB8ICdzdHlsX3RyZWVfYmxvc3NvbSdcbiAgfCAnc3R5bF9zaHJ1YidcbiAgfCAnc3R5bF9yb2NrX3NtYWxsJ1xuICB8ICdzdHlsX3JvY2tfbWVkaXVtJ1xuICB8ICdzdHlsX3JvY2tfbGFyZ2UnXG4gIHwgJ3N0eWxfb3JlJ1xuICB8ICdzdHlsX2NhaXJuJ1xuICB8ICd3YXlzdG9uZSdcbiAgfCAnbWFya2VyJztcblxuZXhwb3J0IHR5cGUgUmVzb3VyY2VUeXBlID0gJ3dvb2QnIHwgJ3N0b25lJyB8ICdvcmUnIHwgJ2ZpYmVyJztcblxuZXhwb3J0IGludGVyZmFjZSBFbnRpdHkge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICBjaHVuazogc3RyaW5nO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgc2NhbGU6IG51bWJlcjtcbiAgdmFyaWFudDogbnVtYmVyO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgcmVtYWluaW5nOiBudW1iZXI7XG4gIHlpZWxkUGVySGFydmVzdDogbnVtYmVyO1xuICAvKiogVHJ1ZSBvbmNlIHRoZSBlbnRpdHkgaXMgZnVsbHkgZGVwbGV0ZWQuICovXG4gIGhhcnZlc3RlZDogYm9vbGVhbjtcbiAgLyoqIFRydWUgYWZ0ZXIgdGhlIGZpcnN0IHN1Y2Nlc3NmdWwgaGFydmVzdCwgZXZlbiBpZiB5aWVsZCByZW1haW5zLiAqL1xuICBoYXJ2ZXN0ZWRPbmNlPzogYm9vbGVhbjtcbiAgcHJvdmlzaW9uYWw6IGJvb2xlYW47XG4gIGF1dGhvcmVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5veGVsU2l0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHByb3Zpc2lvbmFsOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZ2lvbkluZm8ge1xuICBpZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICB0eXBlOiAncGxhaW4nIHwgJ2ZvcmVzdCcgfCAnaGlsbHMnIHwgJ2hpZ2hsYW5kJyB8ICd3YXRlcicgfCAncmlkZ2UnO1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICByeDogbnVtYmVyO1xuICByejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkU3RhdHMge1xuICBjaHVua3NHZW5lcmF0ZWQ6IG51bWJlcjtcbiAgY2h1bmtzRXZpY3RlZDogbnVtYmVyO1xuICB2b3hlbHNGaWxsZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGlvbk1zOiBudW1iZXI7XG4gIGVudGl0aWVzOiBudW1iZXI7XG4gIHRyZWVzOiBudW1iZXI7XG4gIHBpbmtUcmVlczogbnVtYmVyO1xuICBwaW5rT3ZlcmZsb3c6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcGFyYW1zOiBXb3JsZFBhcmFtcztcbiAgY2h1bmtzOiBNYXA8c3RyaW5nLCBWb3hlbENodW5rPjtcbiAgZW50aXRpZXM6IE1hcDxzdHJpbmcsIEVudGl0eT47XG4gIGVudGl0eUNodW5rczogTWFwPHN0cmluZywgc3RyaW5nW10+O1xuICAvKiogQ2h1bmtzIHdob3NlIGRldGVybWluaXN0aWMgbmF0dXJhbC1lbnRpdHkgc3RhdGUgaGFzIGJlZW4gY2hhbmdlZC4gKi9cbiAgZW50aXR5Q2hhbmdlczogU2V0PHN0cmluZz47XG4gIC8qKiBUb21ic3RvbmVzIGZvciByZW1vdmVkIGRldGVybWluaXN0aWMgbmF0dXJhbCBlbnRpdGllcy4gKi9cbiAgZW50aXR5UmVtb3ZhbHM6IFNldDxzdHJpbmc+O1xuICAvKiogQXV0aG9yaXRhdGl2ZSBidWlsdCBzdHJ1Y3R1cmVzIChob3VzZSwgcGF0aCwgdGVycmFjZXMsIGNyb3BzKS4gKi9cbiAgc3RydWN0dXJlczogTWFwPHN0cmluZywgU3RydWN0dXJlPjtcbiAgc2l0ZXM6IE5veGVsU2l0ZVtdO1xuICByZWdpb25zOiBSZWdpb25JbmZvW107XG4gIC8qKiBjaHVuayBrZXkgLT4gbG9jYWwgdm94ZWwgaW5kZXggLT4gbWF0ZXJpYWwuIER1cmFibGUsIGNvbXBhY3QgZWRpdHMuICovXG4gIGVkaXRzOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCBudW1iZXI+PjtcbiAgLyoqIEdsb2JhbCBsb2NhbC1wbGF5ZXIgY2FycmllZCBiYWc7IGJvdW5kZWQgaW4gc2NoZW1hIDMsIGxlZ2FjeSBpbiAxLzIuICovXG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgLyoqIFByZXNlbnQgb25seSBhZnRlciBzY2hlbWEtMyBnZW5lc2lzL3Jlc3RvcmF0aW9uLiAqL1xuICBsaWZlPzogTGlmZVN0YXRlO1xuICAvKiogTTAwNiBsaXZpbmcgaG9tZXN0ZWFkOyBwcmVzZW50IG9uY2UgZm91bmRlZCAoc2NoZW1hIDMgb25seSkuICovXG4gIGhvbWVzdGVhZD86IEhvbWVzdGVhZFN0YXRlO1xuICBkaXJ0eTogU2V0PHN0cmluZz47XG4gIHN0YXRzOiBXb3JsZFN0YXRzO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqXG4gICAqIE1vbm90b25pYyByZXZpc2lvbiBvZiBhdXRob3JpdGF0aXZlIHN0YXRlICh2b3hlbHMgYW5kIGVudGl0aWVzKS4gRGVyaXZlZFxuICAgKiBjYWNoZXMga2V5ZWQgb24gdGhpcyB2YWx1ZSBhcmUgZGlzY2FyZGVkIGFmdGVyIGFuIGVkaXQ7IG1lc2gvbmF2aWdhdGlvblxuICAgKiByZXZpc2lvbnMgYXJlIHNlcGFyYXRlIGJlY2F1c2UgdGhleSBhcmUgZGVyaXZlZCwgbm90IHdvcmxkIHN0YXRlLlxuICAgKi9cbiAgcmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGNodW5rS2V5ID0gKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpID0+IGAke2N4fSwke2N6fWA7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5YID0gKGN4OiBudW1iZXIpID0+IGN4ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5aID0gKGN6OiBudW1iZXIpID0+IGN6ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgbG9jYWxJbmRleCA9IChseDogbnVtYmVyLCB5SW5kZXg6IG51bWJlciwgbHo6IG51bWJlcikgPT5cbiAgbHggKyBseiAqIENIVU5LX1NJWkUgKyB5SW5kZXggKiBDSFVOS19BUkVBO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ggPSAoeDogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh4ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtaID0gKHo6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeiArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWCA9ICh4OiBudW1iZXIpID0+IHggLSAod29ybGRUb0NodW5rWCh4KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxaID0gKHo6IG51bWJlcikgPT4geiAtICh3b3JsZFRvQ2h1bmtaKHopICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHlUb0luZGV4ID0gKHk6IG51bWJlcikgPT4geSAtIFlfTUlOO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGQoc2VlZCA9IDEzMzcsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgaWYgKCFpc1N1cHBvcnRlZEdlbmVyYXRvcihnZW5lcmF0b3JWZXJzaW9uKSkgdGhyb3cgbmV3IEVycm9yKGB1bnN1cHBvcnRlZCBnZW5lcmF0b3IgdmVyc2lvbiAke2dlbmVyYXRvclZlcnNpb259YCk7XG4gIHJldHVybiB7XG4gICAgc2VlZCxcbiAgICBwYXJhbXM6IHsgLi4uREVGQVVMVF9QQVJBTVMsIGdlbmVyYXRvclZlcnNpb24gfSxcbiAgICBjaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdGllczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNoYW5nZXM6IG5ldyBTZXQoKSxcbiAgICBlbnRpdHlSZW1vdmFsczogbmV3IFNldCgpLFxuICAgIHN0cnVjdHVyZXM6IG5ldyBNYXAoKSxcbiAgICBzaXRlczogW10sXG4gICAgcmVnaW9uczogUkVHSU9OUyxcbiAgICBlZGl0czogbmV3IE1hcCgpLFxuICAgIGludmVudG9yeToge30sXG4gICAgZGlydHk6IG5ldyBTZXQoKSxcbiAgICBzdGF0czoge1xuICAgICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICAgIGVudGl0aWVzOiAwLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gICAgfSxcbiAgICBhdXRob3JlZFBsYWNlZDogZmFsc2UsXG4gICAgcmV2aXNpb246IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBpbml0aWFsUmFkaXVzID0gMCwgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQsIGdlbmVyYXRvclZlcnNpb24pO1xuICBjb25zdCBjZW50cmUgPSBNYXRoLmZsb29yKENIVU5LU19QRVJfU0lERSAvIDIpO1xuICBmb3IgKGxldCBjeiA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN6IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN4IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN4KyspIHtcbiAgICAgIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgfVxuICB9XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuLy8gLS0tLS0tLS0tLSBnZW9ncmFwaHkgLS0tLS0tLS0tLVxuZXhwb3J0IGNvbnN0IFJFR0lPTlM6IFJlZ2lvbkluZm9bXSA9IFtcbiAgeyBpZDogJ2ZvdW5kZXInLCBsYWJlbDogJ0ZvdW5kZXIgdmFsbGV5JywgdHlwZTogJ3BsYWluJywgY3g6IDAsIGN6OiAwLCByeDogMTEwLCByejogODUgfSxcbiAgeyBpZDogJ2Vhc3R3b29kJywgbGFiZWw6ICdFYXN0d29vZCcsIHR5cGU6ICdmb3Jlc3QnLCBjeDogMjIwLCBjejogLTExMCwgcng6IDI2MCwgcno6IDIyMCB9LFxuICB7IGlkOiAnY3Jvd24nLCBsYWJlbDogJ0Nyb3duIGhpZ2hsYW5kcycsIHR5cGU6ICdoaWdobGFuZCcsIGN4OiAtMzYwLCBjejogLTMwMCwgcng6IDM4MCwgcno6IDMwMCB9LFxuICB7IGlkOiAnbGFrZScsIGxhYmVsOiAnTWlycm9yIGxha2UnLCB0eXBlOiAnd2F0ZXInLCBjeDogLTI2MCwgY3o6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9LFxuICB7IGlkOiAnc291dGhkb3ducycsIGxhYmVsOiAnU291dGggZG93bnMnLCB0eXBlOiAnaGlsbHMnLCBjeDogMTIwLCBjejogMzMwLCByeDogMjYwLCByejogMTkwIH0sXG4gIHsgaWQ6ICd3ZXN0cmlzZScsIGxhYmVsOiAnV2VzdCByaXNlJywgdHlwZTogJ2hpbGxzJywgY3g6IC0zNjAsIGN6OiAxMjAsIHJ4OiAyMjAsIHJ6OiAyMTAgfSxcbiAgeyBpZDogJ2NvYXN0JywgbGFiZWw6ICdCcm9rZW4gY29hc3QnLCB0eXBlOiAncmlkZ2UnLCBjeDogMCwgY3o6IDAsIHJ4OiA3ODAsIHJ6OiA2NjAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckNlbnRlclgoejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVGhlIHJpdmVyIHJ1bnMgbm9ydGhcdTIwMTNzb3V0aCBhYm91dCA3MFx1MjAxMzExMCBtIHdlc3Qgb2YgdGhlIGZvdW5kZXIgc2hlbGYsIHNvXG4gIC8vIHRoZSBkZWZhdWx0IG5vcnRoLXdlc3QgdmlldyBoYXMgd2F0ZXIsIGEgbmVhciBiYW5rIGFuZCBhIGZhciBiYW5rLlxuICByZXR1cm4gLTkwICsgNTUgKiBNYXRoLnNpbigoeiArIDEwMCkgLyAyNDApICsgMTggKiBNYXRoLnNpbigoeiAtIDIwKSAvIDgwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5hYnMoeCAtIHJpdmVyQ2VudGVyWCh6KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsYWtlRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5zcXJ0KCgoeCArIDI2MCkgLyAxMjApICoqIDIgKyAoKHogKyAyMzApIC8gOTUpICoqIDIpO1xufVxuXG4vKipcbiAqIEludGVnZXIgdG9wIHNvbGlkIHkgb2YgdGhlIGJhc2UgZ2VuZXJhdGVkIHN1cmZhY2UgKG5vIGVkaXRzL292ZXJoYW5ncykuXG4gKlxuICogVGhpcyBpcyB0aGUgKnNoYXBlKiB0aGUgdm94ZWwgdm9sdW1lIGlzIGZpbGxlZCBmcm9tLCBub3QgdGhlIHN0b3JlZCB3b3JsZC5cbiAqIFRoZSBpbXBvcnRhbnQgY29ycmVjdGlvbiBvdmVyIHRoZSBmaXJzdCBNMDAxIHBhc3MgaXMgdGhhdCB0aGUgbGFuZHNjYXBlIGlzXG4gKiBub3Qgb25lIHNtb290aCByYWRpYWwgYm93bDogaXQgaXMgYSB3YXJwZWQgbXVsdGktc2NhbGUgc3VyZmFjZSB3aXRoIGEgYnJvYWRcbiAqIHJpdmVyIHZhbGxleSwgYSBzbWFsbCBidWlsZGFibGUgc2hlbGYsIGFuZCByaWRnZWQgaGlnaGxhbmRzLiBBIHNoYWxsb3dcbiAqIHNtb290aCBzdXJmYWNlIHF1YW50aXNlZCB0byAxIG0gdm94ZWxzIGlzIHdoYXQgcHJvZHVjZWQgdGhlIGNvbmNlbnRyaWNcbiAqIGNvbnRvdXIgcmluZ3M7IHZhcmllZCByZWxpZWYgYW5kIGEgcml2ZXIgdmFsbGV5IGJyZWFrIHRoZW0gbmF0dXJhbGx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUd28tc2NhbGUgZG9tYWluIHdhcnAuIFRoZSBicm9hZCB3YXJwIG1vdmVzIGNvYXN0bGluZXMgYW5kIGhpbGxzOyB0aGVcbiAgLy8gc21hbGwgd2FycCBrZWVwcyB0aGUgMSBtIHF1YW50aXNhdGlvbiBmcm9tIGZvbGxvd2luZyBjbGVhbiBjb250b3Vycy5cbiAgY29uc3Qgd3ggPSB4XG4gICAgKyAoZmJtMih4IC8gNDIwLCB6IC8gNDIwLCBzZWVkICsgMTAxLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSwgeiAvIDk1LCBzZWVkICsgMTAyLCAyKSAtIDAuNSkgKiAzMDtcbiAgY29uc3Qgd3ogPSB6XG4gICAgKyAoZmJtMih4IC8gNDIwICsgNy4zLCB6IC8gNDIwIC0gMy4xLCBzZWVkICsgMTAzLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSArIDMuNywgeiAvIDk1IC0gOC4xLCBzZWVkICsgMTA0LCAyKSAtIDAuNSkgKiAzMDtcblxuICBjb25zdCByYWRpYWwgPSBNYXRoLnNxcnQoKHd4IC8gNzgwKSAqKiAyICsgKHd6IC8gNjYwKSAqKiAyKTtcbiAgY29uc3QgY29hc3ROb2lzZSA9IChmYm0yKHd4IC8gMzAwLCB3eiAvIDMwMCwgc2VlZCArIDEwNSwgNCkgLSAwLjUpICogMC4zNFxuICAgICsgKGZibTIod3ggLyA5NSwgd3ogLyA5NSwgc2VlZCArIDEwNiwgMikgLSAwLjUpICogMC4xMDtcbiAgY29uc3QgbGFuZG5lc3MgPSAxLjAgLSByYWRpYWwgKyBjb2FzdE5vaXNlO1xuICBjb25zdCBpbmxhbmQgPSBzbW9vdGhzdGVwKC0wLjAzLCAwLjEyLCBsYW5kbmVzcyk7XG5cbiAgY29uc3Qgb2NlYW5GbG9vciA9IC0xMyArIDYgKiBmYm0yKHd4IC8gMTcwLCB3eiAvIDE3MCwgc2VlZCArIDEwNywgMyk7XG5cbiAgLy8gUm9sbGluZyBsYW5kIGF0IHRocmVlIHNjYWxlcy4gVGhlIDQwIG0gYW5kIDE1IG0gY29tcG9uZW50cyBhcmUgcmVhbFxuICAvLyBzdXJmYWNlIGhlaWdodCwgbm90IGEgcmVuZGVyIGRlY29yYXRpb24sIHNvIHRoZSBtYWNybyBzYW1wbGVyIGFncmVlcy5cbiAgY29uc3Qgc3dlbGwgPSA0ICsgMTEgKiBmYm0yKHd4IC8gMzQwLCB3eiAvIDM0MCwgc2VlZCArIDEwOCwgNCk7XG4gIGNvbnN0IGhpbGxzID0gOCAqIGZibTIod3ggLyAxMTUsIHd6IC8gMTE1LCBzZWVkICsgMTA5LCAzKTtcbiAgY29uc3QgYnVtcHMgPSAyLjIgKiBmYm0yKHggLyA0MiwgeiAvIDQyLCBzZWVkICsgMTEwLCAyKVxuICAgICsgMC45ICogZmJtMih4IC8gMTUsIHogLyAxNSwgc2VlZCArIDExMSwgMik7XG5cbiAgLy8gUmlkZ2VkIGhpZ2hsYW5kcy4gVGhlIG1hc3NpZiBtYXNrIGlzIHJlZ2lvbmFsIGFuZCBiaWFzZWQgdG8gdGhlXG4gIC8vIG5vcnRoLXdlc3Q7IHdpdGhvdXQgdGhlIHJlZ2lvbmFsIGdhdGUgdGhlIGZpcnN0IE0wMDEgcGFzcyByYWlzZWQgYSA0OCBtXG4gIC8vIG1vdW50YWluIGRpcmVjdGx5IHVuZGVyIHRoZSBmb3VuZGVyIHNoZWxmLlxuICBjb25zdCBtYXNzaWZOb2lzZSA9IGZibTIod3ggLyA0ODAgKyAxMSwgd3ogLyA0ODAgLSA3LCBzZWVkICsgMTEyLCA0KTtcbiAgY29uc3QgbWFzc2lmTWFzayA9IHNtb290aHN0ZXAoMC42MCwgMC43OCwgbWFzc2lmTm9pc2UpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIzMCwgd3ogLyAyMzAsIHNlZWQgKyAxMTMsIDQpIC0gMSk7XG4gIGNvbnN0IHJpZGdlMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE0LCAzKSAtIDEpO1xuICBjb25zdCBud0JpYXMgPSBNYXRoLmV4cCgtKCgod3ggKyAzNjApIC8gMzgwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAzMjApICoqIDIpKTtcbiAgY29uc3QgbW91bnQgPSBNYXRoLm1pbigxLCBtYXNzaWZNYXNrICogKDAuMzAgKyAwLjcwICogbndCaWFzKSArIDAuMjIgKiBud0JpYXMpO1xuXG4gIGxldCBoID0gc3dlbGwgKyBoaWxscyArIGJ1bXBzXG4gICAgKyBtb3VudCAqICgyMCArIDQwICogcmlkZ2UgKiByaWRnZSArIDEyICogcmlkZ2UyKTtcblxuICAvLyBTcHVycyBhbmQgZ3VsbGllcyBhdCAzMFx1MjAxMzkwIG0uIFdpdGhvdXQgdGhlc2UsIGEgc21vb3RoIGhpbGwgcXVhbnRpc2VkIHRvXG4gIC8vIDEgbSB2b3hlbHMgcmVhZHMgYXMgY29uY2VudHJpYyBjb250b3VyIHJpbmdzOyB3aXRoIHRoZW0sIHRoZSBzYW1lIGhpbGxcbiAgLy8gYnJlYWtzIGludG8gcmlkZ2VzLCBzaWRlIHZhbGxleXMgYW5kIHJvY2sgZmFjZXMuXG4gIGNvbnN0IHNwdXIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4NSwgd3ogLyA4NSwgc2VlZCArIDEyMCwgMykgLSAxKTtcbiAgY29uc3QgZ3VsbHkgPSBNYXRoLnBvdygxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA1MiArIDEzLCB3eiAvIDUyIC0gNSwgc2VlZCArIDEyMSwgMykgLSAxKSwgMik7XG4gIGggKz0gKHNwdXIgLSAwLjU1KSAqIDUuMCAtIGd1bGx5ICogMy4yO1xuXG4gIGggPSBvY2VhbkZsb29yICsgKGggLSBvY2VhbkZsb29yKSAqIGlubGFuZDtcbiAgaCArPSAxLjYgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuXG4gIC8vIEJyb2FkIHJpdmVyIHZhbGxleSwgdGhlbiB0aGUgY2hhbm5lbCBpdHNlbGYuIFRoZSB2YWxsZXkgbWFzayBpcyBnYXRlZCBieVxuICAvLyBsYW5kbmVzczogd2l0aG91dCB0aGUgZ2F0ZSBpdCBwdWxsZWQgdGhlIG9jZWFuIGZsb29yIHVwIHRvIHRoZSB2YWxsZXlcbiAgLy8gZmxvb3Igb3V0c2lkZSB0aGUgaXNsYW5kLCB3aGljaCB0aGUgbWFwIHZpZXcgc2hvd2VkIGFzIHBhbGUgcml2ZXItc2hhcGVkXG4gIC8vIGJhcnMgcnVubmluZyB0byB0aGUgaG9yaXpvbi5cbiAgY29uc3QgcmQgPSByaXZlckRpc3RhbmNlKHd4LCB3eik7XG4gIGNvbnN0IHZhbGxleSA9IHNtb290aHN0ZXAoOTUsIDEwLCByZCkgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuICBjb25zdCB2YWxsZXlGbG9vciA9IDIuNSArIDEuMCAqIGZibTIod3ggLyA2MCwgd3ogLyA2MCwgc2VlZCArIDExNSwgMik7XG4gIGggPSBsZXJwKGgsIHZhbGxleUZsb29yLCB2YWxsZXkgKiAwLjc1KTtcbiAgY29uc3Qgcml2ZXJXID0gNS4wICsgMy4wICogZmJtMih3eCAvIDQ1LCB3eiAvIDQ1LCBzZWVkICsgMTE2LCAyKTtcbiAgLy8gQSB3aWRlLCBzaGFsbG93IGNoYW5uZWwgcHJvZmlsZS4gVGhlIGZpcnN0IHBhc3MgY2FydmVkIGEgMTIgbSBzbG90IHdpdGhcbiAgLy8gbmVhci12ZXJ0aWNhbCBiYW5rcywgd2hpY2ggcmVhZCBhcyBhIGJyaWdodCBzdG9uZSBxdWFycnkgcmF0aGVyIHRoYW4gYVxuICAvLyByaXZlci4gVGhlIG91dGVyIGVkZ2UgaXMgbm93IH4yNSBtIGZyb20gdGhlIGNlbnRyZWxpbmUsIGFuZCB0aGUgYmVkIGlzXG4gIC8vIG9ubHkgMiBtIGJlbG93IHNlYSBsZXZlbC5cbiAgY29uc3QgY2hhbm5lbCA9IHNtb290aHN0ZXAocml2ZXJXICsgMTgsIHJpdmVyVyAqIDAuNCwgcmQpO1xuICBpZiAobGFuZG5lc3MgPiAwLjApIGggPSBsZXJwKGgsIC0yLjAsIGNoYW5uZWwgKiAwLjk1KTtcblxuICAvLyBMYWtlIGJhc2luIGF0IHRoZSBmb290IG9mIHRoZSBub3J0aC13ZXN0IGhpZ2hsYW5kcy5cbiAgY29uc3QgbGFrZUQgPSBsYWtlRGlzdGFuY2Uod3gsIHd6KVxuICAgICogKDEgKyAwLjE4ICogKGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNywgMikgLSAwLjUpICogMik7XG4gIGlmIChsYWtlRCA8IDEuMTUpIHtcbiAgICBjb25zdCBsYWtlTWFzayA9IHNtb290aHN0ZXAoMS4xNSwgMC41NSwgbGFrZUQpO1xuICAgIGggPSBsZXJwKGgsIC02LjUsIGxha2VNYXNrICogMC45NSk7XG4gIH1cblxuICAvLyBGb3VuZGVyIHNoZWxmOiBhIHNtYWxsLCBpcnJlZ3VsYXIgYnVpbGRhYmxlIHRlcnJhY2Ugb24gdGhlIGVhc3QgYmFuay5cbiAgLy8gRGVsaWJlcmF0ZWx5IG5vdCBhIDI2MCBtIHJhZGlhbCBmbGF0dGVuOyB0aGUgcHJldmlvdXMgcGFzcyBzaG93ZWQgdGhhdCBhXG4gIC8vIGxhcmdlIGZsYXR0ZW4tdG8tY29uc3RhbnQgYmVjb21lcyBhIHZpc2libGUgYm93bCBvZiBjb250b3VyIHJpbmdzLlxuICBjb25zdCBzaGVsZkQgPSBNYXRoLnNxcnQoKCh4ICsgOCkgLyA2MikgKiogMiArICgoeiAtIDQpIC8gNDgpICoqIDIpXG4gICAgKyAoZmJtMih4IC8gNDUsIHogLyA0NSwgc2VlZCArIDExOCwgMikgLSAwLjUpICogMC41NTtcbiAgY29uc3Qgc2hlbGYgPSBzbW9vdGhzdGVwKDEuMDUsIDAuNTUsIHNoZWxmRCk7XG4gIGlmIChzaGVsZiA+IDApIHtcbiAgICBjb25zdCB0YXJnZXQgPSAxMy4wICsgMS4yICogZmJtMih4IC8gMzYsIHogLyAzNiwgc2VlZCArIDExOSwgMikgKyB4ICogMC4wMTtcbiAgICBoID0gbGVycChoLCB0YXJnZXQsIHNoZWxmICogMC43OCk7XG4gIH1cblxuICByZXR1cm4gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIDkyKSk7XG59XG5cbmZ1bmN0aW9uIHNsb3BlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4pOiBNYXRJZCB7XG4gIC8vIFJpdmVyIGJlZCBpcyBncmF2ZWw7IHRoZSBiZWFjaCBpcyBhIG5hcnJvdyBzYW5kIGJhbmQsIG5vdCB0aGUgd2hvbGVcbiAgLy8gdmFsbGV5IGZsb29yLiBUaGUgZmlyc3QgcGFzcyBtYXJrZWQgZXZlcnkgY2VsbCB3aXRoaW4gNCBtIG9mIHNlYSBsZXZlbFxuICAvLyBhcyBzYW5kLCB3aGljaCBwcm9kdWNlZCBhIGNvbnNwaWN1b3VzIHBhbGUgc3RyaXAgYWxvbmcgdGhlIHJpdmVyLlxuICBpZiAocml2ZXJEaXN0YW5jZSh4LCB6KSA8IDEyICYmIGggPCBTRUFfTEVWRUwgKyAxKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgaWYgKGggPD0gU0VBX0xFVkVMICsgMC41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChuZWFyV2F0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgIG5lYXJXYXRlciA9XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMykgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDMpIDwgU0VBX0xFVkVMICsgMTtcbiAgfVxuICBpZiAobmVhcldhdGVyICYmIGggPD0gU0VBX0xFVkVMICsgMS41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChzbG9wZSA+PSAzKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDU4ICYmIGZibTIoeCAvIDE4LCB6IC8gMTgsIHNlZWQgKyAxMjAsIDIpID4gMC40NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0OCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQwICYmIHNsb3BlID49IDIgJiYgZmJtMih4IC8gMTIsIHogLyAxMiwgc2VlZCArIDEyMSwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNUT05FO1xuICByZXR1cm4gTUFULkdSQVNTO1xuXG59XG5cbi8qKiBQdWJsaWMgYmFzZS1tYXRlcmlhbCBzZWxlY3RvciBmb3IgbWFjcm8gTE9EIGFuZCB0ZXN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWwoXG4gIHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyOiBib29sZWFuLFxuKTogTWF0SWQge1xuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZnVuY3Rpb24gc3Vic29pbEZvcih0b3A6IE1hdElkKTogTWF0SWQge1xuICBpZiAodG9wID09PSBNQVQuR1JBU1MgfHwgdG9wID09PSBNQVQuTU9TUykgcmV0dXJuIE1BVC5TT0lMO1xuICBpZiAodG9wID09PSBNQVQuU05PVykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVZFTCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIHJldHVybiBNQVQuU1RPTkU7XG59XG5cbmZ1bmN0aW9uIG9yZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBjbHVzdGVyID0gZmJtMih4IC8gNTUsIHogLyA1NSwgc2VlZCArIDEzMCwgMik7XG4gIGlmIChjbHVzdGVyIDwgMC41NykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBuID0gdmFsdWVOb2lzZTMoeCAqIDAuMDksIHkgKiAwLjEzLCB6ICogMC4wOSwgc2VlZCArIDEzMSk7XG4gIGNvbnN0IG4yID0gdmFsdWVOb2lzZTMoeCAqIDAuMjIgKyA1LCB5ICogMC4zMSwgeiAqIDAuMjIgLSAzLCBzZWVkICsgMTMyKTtcbiAgcmV0dXJuIG4gPiAwLjcwICYmIG4yID4gMC41MDtcbn1cblxuZnVuY3Rpb24gY2F2ZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gZmJtMyh4ICogMC4wNzUsIHkgKiAwLjExLCB6ICogMC4wNzUsIHNlZWQgKyAxNDAsIDIpID4gMC43Mjtcbn1cblxuZnVuY3Rpb24gb3ZlcmhhbmdBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHZhbHVlTm9pc2UzKHggKiAwLjE4LCB5ICogMC4yMiwgeiAqIDAuMTgsIHNlZWQgKyAxNDEpID4gMC42Mjtcbn1cblxuLy8gLS0tLS0tLS0tLSB2ZXJzaW9uZWQgZ2VuZXJhdG9yIGRpc3BhdGNoIC0tLS0tLS0tLS1cbmNvbnN0IHYyQ2FjaGUgPSBuZXcgTWFwPG51bWJlciwgVGVycmFpblYyPigpO1xuY29uc3QgaHlkcm9DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBIeWRyb2xvZ3k+KCk7XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9neSBuZXR3b3JrIGZvciBhIHNlZWQgYW5kIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGh5ZHJvbG9neUZvcihzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlcik6IEh5ZHJvbG9neSB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikgcmV0dXJuIHRlcnJhaW5WMihzZWVkKS5oeWRyb2xvZ3k7XG4gIGNvbnN0IGtleSA9IGAke3NlZWR9OiR7dmVyc2lvbn1gO1xuICBsZXQgaHlkcm8gPSBoeWRyb0NhY2hlLmdldChrZXkpO1xuICBpZiAoIWh5ZHJvKSB7XG4gICAgaHlkcm8gPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbiwgdjFIZWlnaHQ6ICh4LCB6KSA9PiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeikgfSk7XG4gICAgaHlkcm9DYWNoZS5zZXQoa2V5LCBoeWRybyk7XG4gIH1cbiAgcmV0dXJuIGh5ZHJvO1xufVxuXG4vKiogQGludGVybmFsIFRoZSB2MiBnZW5lcmF0b3IgZm9yIGEgc2VlZCAoY2FjaGVkOyBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZXJyYWluVjIoc2VlZDogbnVtYmVyKTogVGVycmFpblYyIHtcbiAgbGV0IGdlbiA9IHYyQ2FjaGUuZ2V0KHNlZWQpO1xuICBpZiAoIWdlbikge1xuICAgIGNvbnN0IGh5ZHJvbG9neSA9IG5ldyBIeWRyb2xvZ3koeyBzZWVkLCB2ZXJzaW9uOiBHRU5FUkFUT1JfVjIsIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGdlbiA9IG5ldyBUZXJyYWluVjIoc2VlZCwgc3VyZmFjZUhlaWdodEF0LCBoeWRyb2xvZ3kpO1xuICAgIHYyQ2FjaGUuc2V0KHNlZWQsIGdlbik7XG4gIH1cbiAgcmV0dXJuIGdlbjtcbn1cblxuLyoqIEJhc2UgZ2VuZXJhdGVkIGhlaWdodCAodG9wIHNvbGlkICsgMSkgZm9yIGFueSBzdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMiA/IHRlcnJhaW5WMihzZWVkKS5oZWlnaHQoeCwgeikgOiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCB3YXRlciBzdXJmYWNlOiB3YXRlciBmaWxscyBjZWxscyBbaGVpZ2h0LCBsZXZlbCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVdhdGVyTGV2ZWxBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuY29sdW1uKHgsIHopLmxldmVsO1xuICBjb25zdCBoID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCA6IGg7XG59XG5cbmZ1bmN0aW9uIHZlcnNpb25lZFNsb3BlKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuLyoqIEJhc2UgdG9wIG1hdGVyaWFsIGZvciBhbnkgZ2VuZXJhdG9yIHZlcnNpb24gKG1hY3JvIExPRCwgZW50aXR5IHBsYWNlbWVudCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsRm9yKFxuICBzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgZ2VuID0gdGVycmFpblYyKHNlZWQpO1xuICAgIHJldHVybiBnZW4udG9wTWF0ZXJpYWwoeCwgeiwgZ2VuLmNvbHVtbih4LCB6KSwgc2xvcGUsXG4gICAgICAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGhoLCBzcywgbmVhcldhdGVyKSk7XG4gIH1cbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VyZmFjZVNhbXBsZSB7XG4gIHk6IG51bWJlcjtcbiAgdG9wOiBNYXRJZDtcbiAgc2xvcGU6IG51bWJlcjtcbn1cblxuLyoqIEJhc2Ugc3VyZmFjZSBzYW1wbGUgZm9yIG1hY3JvIExPRC4gRG9lcyBub3QgaW5jbHVkZSB2b3hlbCBlZGl0cy9vdmVyaGFuZ3MuICovXG5leHBvcnQgZnVuY3Rpb24gc2FtcGxlU3VyZmFjZShzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogU3VyZmFjZVNhbXBsZSB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIGNvbnN0IHNsb3BlID0gc2xvcGVBdChzZWVkLCB4LCB6LCB5KTtcbiAgcmV0dXJuIHsgeSwgdG9wOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIHksIHNsb3BlKSwgc2xvcGUgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBjaHVuayBnZW5lcmF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIHJldHVybiBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBiYXNlID0gZ2VuZXJhdGVCYXNlQ2h1bmsod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIGN4LCBjeik7XG4gIHJldHVybiBpbnN0YWxsQmFzZUNodW5rKHdvcmxkLCBiYXNlLCBwZXJmb3JtYW5jZS5ub3coKSAtIHQwKTtcbn1cblxuLyoqXG4gKiBCYXNlIGdlbmVyYXRlZCBjb250ZW50cyBvZiBhIGNodW5rIGJlZm9yZSBkdXJhYmxlIGVkaXRzLiBBIHB1cmUgZnVuY3Rpb24gb2ZcbiAqIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbiwgY3gsIGN6KTogc2FmZSB0byBjb21wdXRlIGluIGEgV2ViIFdvcmtlciwgYW5kIHRoZVxuICogYnl0ZXMgYXJlIGlkZW50aWNhbCB3aGVyZXZlciBpdCBydW5zLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHNlZWQ6IG51bWJlcjtcbiAgdmVyc2lvbjogbnVtYmVyO1xuICBkYXRhOiBVaW50OEFycmF5O1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVCYXNlQ2h1bmsoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ2h1bmsge1xuICBjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfVk9MVU1FKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCB0b3BNYXRlcmlhbHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGNvbnN0IHYyID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkgOiBudWxsO1xuXG4gIC8vIFBhZGRlZCBoZWlnaHQgY2FjaGU6IGEgdGhyZWUtY2VsbCBib3JkZXIgY292ZXJzIHNsb3BlLCBiZWFjaCBhbmQgbGVkZ2VzLlxuICBjb25zdCBQID0gMztcbiAgY29uc3QgUFcgPSBDSFVOS19TSVpFICsgUCAqIDI7XG4gIGNvbnN0IGJhc2VIID0gbmV3IEludDE2QXJyYXkoUFcgKiBQVyk7XG4gIGNvbnN0IHYyQ29sczogVjJDb2x1bW5bXSB8IG51bGwgPSB2MiA/IG5ldyBBcnJheShDSFVOS19BUkVBKSA6IG51bGw7XG4gIGZvciAobGV0IHB6ID0gMDsgcHogPCBQVzsgcHorKykge1xuICAgIGZvciAobGV0IHB4ID0gMDsgcHggPCBQVzsgcHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIHB4IC0gUCwgd3ogPSBveiArIHB6IC0gUDtcbiAgICAgIGlmICh2Mikge1xuICAgICAgICBjb25zdCBjb2wgPSB2Mi5jb2x1bW4od3gsIHd6KTtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IGNvbC5oO1xuICAgICAgICBjb25zdCBseCA9IHB4IC0gUCwgbHogPSBweiAtIFA7XG4gICAgICAgIGlmIChseCA+PSAwICYmIGx6ID49IDAgJiYgbHggPCBDSFVOS19TSVpFICYmIGx6IDwgQ0hVTktfU0laRSkgdjJDb2xzIVtseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjb2w7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHd4LCB3eik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgbGV0IG5vbkFpciA9IDA7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5lYXJXYXRlciA9XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCAtIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgKyAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMTtcbiAgICAgIGNvbnN0IHYyQ29sID0gdjJDb2xzID8gdjJDb2xzW2x6ICogQ0hVTktfU0laRSArIGx4XSA6IG51bGw7XG4gICAgICBjb25zdCB0b3AgPSB2MiAmJiB2MkNvbFxuICAgICAgICA/IHYyLnRvcE1hdGVyaWFsKHd4LCB3eiwgdjJDb2wsIHNsb3BlLCAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaGgsIHNzLCBuZWFyV2F0ZXIpKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICAgIGNvbnN0IHN1YiA9IHN1YnNvaWxGb3IodG9wKTtcbiAgICAgIGNvbnN0IG9yZVBvdGVudGlhbCA9IGZibTIod3ggLyA1NSwgd3ogLyA1NSwgc2VlZCArIDEzMCwgMikgPiAwLjU3O1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG5cbiAgICAgIGNvbnN0IHN0YXJ0ID0gWV9NSU47XG4gICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihZX01BWCAtIDEsIGggLSAxKTtcbiAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8PSBlbmQ7IHkrKykge1xuICAgICAgICBjb25zdCBkZXB0aCA9IGggLSAxIC0geTtcbiAgICAgICAgbGV0IG06IE1hdElkO1xuICAgICAgICBpZiAoeSA9PT0gWV9NSU4pIG0gPSBNQVQuQkVEUk9DSztcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPT09IDApIG0gPSB0b3A7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoIDw9IDIpIG0gPSBzdWI7XG4gICAgICAgIGVsc2UgbSA9IE1BVC5TVE9ORTtcblxuICAgICAgICBpZiAobSA9PT0gTUFULlNUT05FICYmIGRlcHRoID4gNCAmJiBvcmVQb3RlbnRpYWwgJiYgb3JlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuT1JFO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3BhcnNlIDNEIG92ZXJoYW5ncy91bmRlcmN1dHMgYXQgc3RlZXAgZmFjZXMuIFRoaXMgaXMgYSByZWFsXG4gICAgICAgIC8vIG9jY3VwYW5jeSBjaGFuZ2UsIG5vdCBhIGRlY29yYXRpb24gb24gdG9wIG9mIGEgaGVpZ2h0ZmllbGQuXG4gICAgICAgIGlmIChkZXB0aCA8PSAyICYmIHNsb3BlID49IDIgJiYgb3ZlcmhhbmdBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVlcCBjYXZlcywga2VwdCBhd2F5IGZyb20gdGhlIHN1cmZhY2Ugc28gdGhleSBkbyBub3QgY3JlYXRlIGhvbGVzLlxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUiAmJiBkZXB0aCA+IDcgJiYgZGVwdGggPCAyNCAmJiBjYXZlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildID0gbTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBXYXRlciB2b2x1bWU6IGV2ZXJ5dGhpbmcgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UgdXAgdG8gdGhlIGNvbHVtbidzXG4gICAgICAvLyB3YXRlciBsZXZlbCAoc2VhIGxldmVsIGluIHYxOyB0aGUgaHlkcm9sb2dpY2FsIGxldmVsIGluIHYyKS5cbiAgICAgIGNvbnN0IHdhdGVyTGV2ZWwgPSB2MkNvbCA/IE1hdGgubWluKFlfTUFYLCB2MkNvbC5sZXZlbCkgOiBTRUFfTEVWRUw7XG4gICAgICBpZiAoaCA8IHdhdGVyTGV2ZWwpIHtcbiAgICAgICAgZm9yIChsZXQgeSA9IE1hdGgubWF4KFlfTUlOLCBoKTsgeSA8IHdhdGVyTGV2ZWw7IHkrKykge1xuICAgICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseik7XG4gICAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgICAgZGF0YVtpZHhdID0gTUFULldBVEVSO1xuICAgICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvcFNvbGlkID0gTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLm1heChZX01JTiwgaCAtIDEpKTtcbiAgICAgIGhlaWdodHNbY29sXSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2NvbF0gPSB0b3A7XG4gICAgfVxuICB9XG5cbiAgLy8gUHJvdHJ1ZGluZyBsZWRnZXM6IG9uZSBvciB0d28gc3RvbmUgYmxvY2tzIGV4dGVuZCBmcm9tIGEgaGlnaCBjb2x1bW4gb3ZlclxuICAvLyBhIGxvd2VyIG5laWdoYm91ci4gVGhleSBjcmVhdGUgcmVhZGFibGUgb3ZlcmhhbmdzIHdpdGhvdXQgYSBmdWxsIGNhdmUgcGFzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGlmIChzbG9wZSA8IDIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZGlyczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBkaXJzKSB7XG4gICAgICAgIGNvbnN0IG54ID0gbHggKyBkeCwgbnogPSBseiArIGR6O1xuICAgICAgICBpZiAobnggPCAwIHx8IG56IDwgMCB8fCBueCA+PSBDSFVOS19TSVpFIHx8IG56ID49IENIVU5LX1NJWkUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBuaCA9IGJhc2VIWyhueiArIFApICogUFcgKyAobnggKyBQKV07XG4gICAgICAgIGlmIChoIC0gbmggPCAyKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGhhc2gzaShseCwgbHosIGR4ICogMyArIGR6ICogNywgc2VlZCArIDE1MCkgPCAwLjU1KSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgeSA9IGggLSAyO1xuICAgICAgICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gaCkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobngsIHlUb0luZGV4KHkpLCBueik7XG4gICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuU1RPTkU7XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZWNvbXB1dGUgdGhlIGNvbHVtbiBjYWNoZSBhZnRlciBsZWRnZXMvY2F2ZXMuIFRoZSBleHBvc2VkIHRvcCBtYXRlcmlhbFxuICAvLyBtdXN0IGNvbWUgZnJvbSB0aGUgYWN0dWFsIHRvcCBzb2xpZCB2b3hlbCwgbm90IHRoZSBwcmUtY2FydmUgZ3Vlc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgbGV0IHRvcE1hdDogbnVtYmVyID0gdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICBjb25zdCBtID0gZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgfVxuICAgICAgaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0b3BNYXQ7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgY3gsIGN6LCBzZWVkLCB2ZXJzaW9uLCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9O1xufVxuXG4vKipcbiAqIEluc3RhbGwgYmFzZSBjb250ZW50cyBhcyBhIHJlc2lkZW50IGNodW5rOiBhcHBseSBkdXJhYmxlIGVkaXRzLCB1cGRhdGVcbiAqIHN0YXRzLCBhbmQgcnVuIGRldGVybWluaXN0aWMgZW50aXR5IGdlbmVyYXRpb24uIE1haW4tdGhyZWFkIG9ubHk7IHRoaXMgaXNcbiAqIHRoZSBzaW5nbGUgd3JpdGVyIG9mIFdvcmxkLiBSZXR1cm5zIHRoZSBhbHJlYWR5LXJlc2lkZW50IGNodW5rIGlmIG9uZSBleGlzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsQmFzZUNodW5rKHdvcmxkOiBXb3JsZCwgYmFzZTogQmFzZUNodW5rLCBnZW5lcmF0aW9uTXMgPSAwKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoYmFzZS5zZWVkICE9PSB3b3JsZC5zZWVkIHx8IGJhc2UudmVyc2lvbiAhPT0gd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2Jhc2UgY2h1bmsgYmVsb25ncyB0byBhIGRpZmZlcmVudCB3b3JsZCBjb25maWd1cmF0aW9uJyk7XG4gIH1cbiAgY29uc3QgeyBjeCwgY3osIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyIH0gPSBiYXNlO1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICBjb25zdCBjaHVuazogVm94ZWxDaHVuayA9IHtcbiAgICBjeCwgY3osIGtleSwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIsXG4gICAgZGlydHk6IHRydWUsXG4gICAgZ2VuZXJhdGVkQXQ6IHBlcmZvcm1hbmNlLm5vdygpLFxuICB9O1xuXG4gIC8vIEFwcGx5IGR1cmFibGUgZWRpdHMgYWZ0ZXIgYmFzZSBnZW5lcmF0aW9uLlxuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICBpZiAoZWRpdHMpIHtcbiAgICBmb3IgKGNvbnN0IFtpZHgsIG1dIG9mIGVkaXRzKSB7XG4gICAgICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICAgIH1cbiAgICAvLyBSZWNvbXB1dGUgdGhlIGNhY2hlIGZvciBlZGl0ZWQgY2h1bmtzLlxuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIGx4LCBseik7XG4gICAgfVxuICB9XG4gIC8vIE5vbi1haXIgY291bnRzIGFyZSBkZXJpdmVkIHJlbmRlcmVyIHN0YXRpc3RpY3MsIG5vdCBkdXJhYmxlIHdvcmxkIHN0YXRlLlxuICAvLyBFZGl0ZWQgYmFzZSBhaXIgbWF5IGJlY29tZSBzb2xpZCAoYW5kIHZpY2UgdmVyc2EpIGR1cmluZyByZXN0b3JhdGlvbi5cbiAgbGV0IGVkaXRlZE5vbkFpciA9IDA7XG4gIGZvciAoY29uc3QgbWF0ZXJpYWwgb2YgY2h1bmsuZGF0YSkgaWYgKG1hdGVyaWFsICE9PSBNQVQuQUlSKSBlZGl0ZWROb25BaXIrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IGVkaXRlZE5vbkFpciAtIG5vbkFpcjtcblxuICB3b3JsZC5jaHVua3Muc2V0KGtleSwgY2h1bmspO1xuICB3b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IG5vbkFpcjtcbiAgd29ybGQuc3RhdHMuZ2VuZXJhdGlvbk1zICs9IGdlbmVyYXRpb25NcztcbiAgd29ybGQuZGlydHkuYWRkKGtleSk7XG5cbiAgZ2VuZXJhdGVFbnRpdGllcyh3b3JsZCwgY2h1bmspO1xuICByZXR1cm4gY2h1bms7XG59XG5cbi8qKiBBIGJhc2UtdGVycmFpbiBjYWNoZSBzaGFyZWQgYnkgZWRpdGVkIGFuZCB1bmVkaXRlZCByZWdlbmVyYXRpb24uIE5hdHVyYWxcbiAqIHNjZW5lcnkgbmV2ZXIgZGVwZW5kcyBvbiBsYXRlciB2b3hlbCBlZGl0czsgdGhpcyBhbHNvIGxldHMgYSBzbmFwc2hvdCByZXN0b3JlXG4gKiBhIGhhcnZlc3RlZCBjaHVuayB3aXRob3V0IG1hdGVyaWFsaXppbmcgdW5yZWxhdGVkIG5laWdoYm91cmluZyBjaHVua3MuICovXG5jb25zdCBiYXNlQ29sdW1uQ2FjaGUgPSBuZXcgV2Vha01hcDxXb3JsZCwgTWFwPHN0cmluZywgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXkgfT4+KCk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQmFzZUNvbHVtbnMgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7IH1cblxuLyoqIEJhc2UgKHByZS1jYXJ2ZSwgcHJlLWVkaXQpIGNvbHVtbiBoZWlnaHRzL21hdGVyaWFscyB1c2VkIGZvciBlbnRpdHkgcGxhY2VtZW50LiBQdXJlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVCYXNlQ29sdW1ucyhzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IEJhc2VDb2x1bW5zIHtcbiAgY29uc3QgY29sdW1ucyA9IHsgaGVpZ2h0czogbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSksIHRvcE1hdGVyaWFsczogbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSkgfTtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseCwgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeik7XG4gICAgICBjb25zdCBzbG9wZSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gdmVyc2lvbmVkU2xvcGUoc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCkgOiBzbG9wZUF0KHNlZWQsIHgsIHosIGgpO1xuICAgICAgY29uc3QgaW5kZXggPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbHVtbnMuaGVpZ2h0c1tpbmRleF0gPSBjbGFtcChoIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgY29sdW1ucy50b3BNYXRlcmlhbHNbaW5kZXhdID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyBiYXNlVG9wTWF0ZXJpYWxGb3Ioc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCwgc2xvcGUpXG4gICAgICAgIDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG4vKiogUHJvdmlkZSBwcmVjb21wdXRlZCBiYXNlIGNvbHVtbnMgKGZvciBleGFtcGxlIGZyb20gYSB3b3JrZXIpIGJlZm9yZSBpbnN0YWxsaW5nIGEgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gc2VlZEJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcsIGNvbHVtbnM6IEJhc2VDb2x1bW5zKTogdm9pZCB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgaWYgKCFjYWNoZS5oYXMoa2V5KSkgY2FjaGUuc2V0KGtleSwgY29sdW1ucyk7XG59XG5cbmZ1bmN0aW9uIGJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiBCYXNlQ29sdW1ucyB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgY29uc3QgY2FjaGVkID0gY2FjaGUuZ2V0KGNodW5rLmtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG4gIGNvbnN0IGNvbHVtbnMgPSBjb21wdXRlQmFzZUNvbHVtbnMod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIGNodW5rLmN4LCBjaHVuay5jeik7XG4gIGNhY2hlLnNldChjaHVuay5rZXksIGNvbHVtbnMpO1xuICByZXR1cm4gY29sdW1ucztcbn1cblxuLy8gLS0tLS0tLS0tLSBkZXJpdmVkIGNoYW5nZSB0cmFja2luZyAobm90IGF1dGhvcml0YXRpdmUgc3RhdGUpIC0tLS0tLS0tLS1cbi8vIFJlbmRlcmVycyBuZWVkIHRvIGtub3cgd2hlbiB0aGUgZWRpdCBvdmVybGF5IGNoYW5nZWQgd2l0aG91dCB3YWxraW5nIGV2ZXJ5XG4vLyBlZGl0IGVhY2ggZnJhbWUuIFRoZSBjb3VudGVyIGxpdmVzIG91dHNpZGUgV29ybGQgc28gaXQgbmV2ZXIgZW50ZXJzIGFcbi8vIHNuYXBzaG90IG9yIGNhbm9uaWNhbCBoYXNoLlxuY29uc3QgZWRpdFZlcnNpb25zID0gbmV3IFdlYWtNYXA8V29ybGQsIG51bWJlcj4oKTtcblxuLyoqIE1vbm90b25pYyBjb3VudCBvZiBlZGl0LW92ZXJsYXkgY2hhbmdlcyBmb3IgdGhpcyBXb3JsZCBvYmplY3QuICovXG5leHBvcnQgZnVuY3Rpb24gZWRpdFZlcnNpb24od29ybGQ6IFdvcmxkKTogbnVtYmVyIHtcbiAgcmV0dXJuIGVkaXRWZXJzaW9ucy5nZXQod29ybGQpID8/IDA7XG59XG5cbi8qKiBDYWxsIGFmdGVyIHJlcGxhY2luZyBvciBidWxrLWNoYW5naW5nIGB3b3JsZC5lZGl0c2Agb3V0c2lkZSBzZXRWb3hlbC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBlZGl0VmVyc2lvbnMuc2V0KHdvcmxkLCBlZGl0VmVyc2lvbih3b3JsZCkgKyAxKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBub24tZ2VuZXJhdGluZyBxdWVyaWVzIC0tLS0tLS0tLS1cbi8vIE1vdmluZyBwcmVzZW50YXRpb24gKGNoYXJhY3RlcnMsIGFuaW1hbHMsIGNhbWVyYSkgbXVzdCBuZXZlciB0cmlnZ2VyIGNodW5rXG4vLyBnZW5lcmF0aW9uIGFzIGEgc2lkZSBlZmZlY3Qgb2YgYXNraW5nIGFib3V0IHRlcnJhaW4uIFRoZXNlIHJldHVybiBudWxsIHdoZW5cbi8vIHRoZSBjb2x1bW4ncyBjaHVuayBpcyBub3QgcmVzaWRlbnQuXG5cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudENodW5rQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KHdvcmxkVG9DaHVua1goeCksIHdvcmxkVG9DaHVua1ooeikpKSA/PyBudWxsO1xufVxuXG4vKiogTGlrZSBzdXJmYWNlQXQsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB8IG51bGwge1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG4vKiogTGlrZSBnZXRWb3hlbCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFZveGVsQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQgfCBudWxsIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV2aWN0Q2h1bmsod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5jaHVua3MuZGVsZXRlKGtleSk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0V2aWN0ZWQrKztcbiAgLy8gQ2h1bmsgYnl0ZXMgYW5kIGNvbHVtbiBjYWNoZXMgYXJlIHJlZ2VuZXJhdGVkIG9uIGRlbWFuZC4gRW50aXRpZXMgcmVtYWluXG4gIC8vIGF1dGhvcml0YXRpdmU6IGV2aWN0aW9uIG11c3Qgbm90IGZvcmdldCB0aGVpciBwZXJzaXN0ZW50IHN0YXRlLlxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBxdWVyaWVzIC8gZWRpdHMgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGdldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgbTogTWF0SWQpOiBib29sZWFuIHtcbiAgaWYgKHkgPCBZX01JTiB8fCB5ID49IFlfTUFYKSByZXR1cm4gZmFsc2U7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpO1xuICBjb25zdCBwcmV2aW91c0VkaXQgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk/LmdldChpZHgpO1xuICAvLyBBIGNodW5rIGV2aWN0ZWQgYWZ0ZXIgYW4gZWFybGllciBlZGl0IGNhbiByZWdlbmVyYXRlIHdpdGggdGhhdCBkdXJhYmxlXG4gIC8vIG1hdGVyaWFsIGFscmVhZHkgYXBwbGllZC4gRHJvcHBpbmcgdGhlIGVkaXQgaGVyZSB3b3VsZCBtYWtlIGl0IGRpc2FwcGVhclxuICAvLyBvbiB0aGUgbmV4dCBldmljdGlvbi9yZXN0b3JhdGlvbiwgZXZlbiB0aG91Z2ggdGhlIGN1cnJlbnQgd3JpdGUgbm8tb3BzLlxuICBpZiAocHJldmlvdXNFZGl0ID09PSBtKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBmYWxzZTtcbiAgbGV0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rLmtleSk7XG4gIGlmICghZWRpdHMpIHsgZWRpdHMgPSBuZXcgTWFwKCk7IHdvcmxkLmVkaXRzLnNldChjaHVuay5rZXksIGVkaXRzKTsgfVxuICAvLyBBbiBpZGVtcG90ZW50IHdyaXRlIG11c3Qgc3RpbGwgcmVzdG9yZSBhIGR1cmFibGUgZGVsdGEgZGlzY2FyZGVkIGJ5IGFuXG4gIC8vIG9sZGVyIHNuYXBzaG90IG9yIGRlbHRhIGRlY29kZXIuIEl0IGlzIG5vdCBhIG5ldyBhdXRob3JpdGF0aXZlIHJldmlzaW9uLlxuICBpZiAoY2h1bmsuZGF0YVtpZHhdID09PSBtKSB7XG4gICAgaWYgKCFlZGl0cy5oYXMoaWR4KSkgZWRpdHMuc2V0KGlkeCwgbSk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gIGVkaXRzLnNldChpZHgsIG0pO1xuICBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkKTtcbiAgY2h1bmsuZGlydHkgPSB0cnVlO1xuICB3b3JsZC5kaXJ0eS5hZGQoY2h1bmsua2V5KTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIHdvcmxkVG9Mb2NhbFgoeCksIHdvcmxkVG9Mb2NhbFooeikpO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bms6IFZveGVsQ2h1bmssIGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgIGlmIChpc1NvbGlkKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0pKSB7IHRvcFNvbGlkID0geTsgYnJlYWs7IH1cbiAgfVxuICBjaHVuay5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICBjb25zdCB0bSA9IGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gIGlmICh0b3BTb2xpZCA+PSBZX01JTikge1xuICAgIGNvbnN0IG0gPSBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHRvcFNvbGlkKSwgbHopXTtcbiAgICBpZiAobSAhPT0gTUFULldBVEVSKSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gbTtcbiAgfSBlbHNlIHtcbiAgICBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG07XG4gIH1cbn1cblxuLyoqXG4gKiBUaGUgeSBjb29yZGluYXRlIG9mIHRoZSBleHBvc2VkIHRvcCBmYWNlIG9mIHRoZSBzb2xpZCBjb2x1bW4gYXQgeC96LlxuICogQSBzb2xpZCB2b3hlbCBhdCB5IG9jY3VwaWVzIFt5LCB5KzEpLCBzbyB0aGUgd2Fsa2FibGUgc3VyZmFjZSBpcyB0b3BTb2xpZCsxLlxuICogVGhpcyBpcyBhIGRlcml2ZWQgcXVlcnk7IHRoZSBhdXRob3JpdGF0aXZlIHN0YXRlIHJlbWFpbnMgdGhlIHZveGVsIHZvbHVtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIFlfTUlOO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIFlfTUlOO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay50b3BNYXRlcmlhbHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhlaWdodEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uIDwgR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgaCA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gICAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgLSBoIDogMDtcbiAgfVxuICByZXR1cm4gd2F0ZXJTdXJmYWNlQXQod29ybGQsIHgsIHopIC0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuLyoqXG4gKiBUb3Agb2YgdGhlIHdhdGVyIGNvbHVtbiBzdGFuZGluZyBvbiB0aGUgc29saWQgc3VyZmFjZSAoZXF1YWwgdG8gdGhlIHN1cmZhY2VcbiAqIHdoZW4gZHJ5KS4gUmVhZHMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWxzLCBzbyBlZGl0cyBhbmQgZHVnIHBpdHMgYXJlIGV4YWN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgd2hpbGUgKHkgPCBZX01BWCAmJiBnZXRWb3hlbCh3b3JsZCwgeCwgeSwgeikgPT09IE1BVC5XQVRFUikgeSsrO1xuICByZXR1cm4geTtcbn1cblxuLy8gLS0tLS0tLS0tLSBlbnRpdGllcyAtLS0tLS0tLS0tXG5mdW5jdGlvbiBhZGRFbnRpdHkod29ybGQ6IFdvcmxkLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLmhhcyhlLmlkKSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgcmV0dXJuO1xuICB3b3JsZC5lbnRpdGllcy5zZXQoZS5pZCwgZSk7XG4gIGxldCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBsaXN0KTsgfVxuICBsaXN0LnB1c2goZS5pZCk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgLy8gR2VuZXJhdGlvbiBpcyBkZXRlcm1pbmlzdGljIGFuZCBhZHZhbmNlcyBubyBwbGF5ZXItY29tbWFuZCBwcmVjb25kaXRpb24uXG4gIC8vIEF1dGhvcmVkIHNjYWZmb2xkaW5nIG1heSB0cmFuc2llbnRseSBjaGFuZ2UgaXQ7IHRoZSBzbmFwc2hvdCByZXN0b3JlcyB0aGVcbiAgLy8gc2F2ZWQgcmV2aXNpb24gYWZ0ZXIgcGxhY2luZyB0aGF0IHNjYWZmb2xkaW5nLlxufVxuXG4vKipcbiAqIFJlbW92ZSBhbiBlbnRpdHkgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB3b3JsZC4gVXNlZCB3aGVuIGEgc2l0ZSBpcyBjbGVhcmVkOlxuICogdGhlIHJlc291cmNlIHlpZWxkIGlzIGFjY291bnRlZCBmb3IgYnkgdGhlIGNhbGxlciwgYW5kIHRoZSBlbnRpdHkgbXVzdCBzdG9wXG4gKiBleGlzdGluZyBmb3IgY29sbGlzaW9uLCBvYnN0cnVjdGlvbiBhbmQgcGVyc2lzdGVuY2UsIG5vdCBqdXN0IGJlIGhpZGRlbiBieVxuICogdGhlIHJlbmRlcmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gIGNvbnN0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAobGlzdCkge1xuICAgIGNvbnN0IGkgPSBsaXN0LmluZGV4T2YoaWQpO1xuICAgIGlmIChpID49IDApIGxpc3Quc3BsaWNlKGksIDEpO1xuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGlkKTtcbiAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZW50aXR5SWQoY2h1bms6IHN0cmluZywgaTogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBlOiR7Y2h1bmt9OiR7aX1gO1xufVxuXG4vKipcbiAqIFB1cmUgZm9yZXN0LWRlbnNpdHkgZmllbGQgdXNlZCBieSBlbnRpdHkgZ2VuZXJhdGlvbi4gRXhwb3J0ZWQgcmVhZC1vbmx5IGZvclxuICogcmVuZGVyIGRlY29yYXRpb24gKHJlbmRlci9ncm91bmQtY292ZXIudHMpOyBjaGFuZ2luZyBpdCBjaGFuZ2VzIHdvcmxkcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcmVzdFNjb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGVhc3QgPSBNYXRoLmV4cCgtKCgod3ggLSAyMjApIC8gMjYwKSAqKiAyICsgKCh3eiArIDExMCkgLyAyMjApICoqIDIpKTtcbiAgY29uc3Qgbm9ydGggPSBNYXRoLmV4cCgtKCgod3ggLSAyMCkgLyAzMDApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDE5MCkgKiogMikpO1xuICBjb25zdCB3ZXN0ID0gTWF0aC5leHAoLSgoKHd4ICsgMzQwKSAvIDIwMCkgKiogMiArICgod3ogLSAxMjApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IHNvdXRoID0gTWF0aC5leHAoLSgoKHd4IC0gMTIwKSAvIDI0MCkgKiogMiArICgod3ogLSAzMzApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IG1vaXN0dXJlID0gZmJtMih3eCAvIDI2MCwgd3ogLyAyNjAsIHNlZWQgKyAyMDEsIDQpO1xuICBjb25zdCB2YWxsZXkgPSBNYXRoLmV4cCgtKCh3eCAvIDE0MCkgKiogMiArICh3eiAvIDEwNSkgKiogMikpO1xuICByZXR1cm4gTWF0aC5tYXgoZWFzdCwgbm9ydGggKiAwLjkyLCB3ZXN0ICogMC44MCwgc291dGggKiAwLjc4KSAqIDAuODJcbiAgICArIG1vaXN0dXJlICogMC4zOCAtIDAuMjIgLSB2YWxsZXkgKiAwLjM0O1xufVxuXG4vKiogUHVyZSByb2NraW5lc3MgZmllbGQgdXNlZCBieSBlbnRpdHkgZ2VuZXJhdGlvbiAoc2FtZSBjb250cmFjdCBhcyBmb3Jlc3RTY29yZSkuICovXG5leHBvcnQgZnVuY3Rpb24gcm9ja1Njb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IG1vdW50YWluID0gZmJtMih3eCAvIDMzMCwgd3ogLyAzMzAsIHNlZWQgKyAyMDIsIDMpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDE0MCwgd3ogLyAxNDAsIHNlZWQgKyAyMDMsIDMpIC0gMSk7XG4gIHJldHVybiBtb3VudGFpbiAqIDAuNTUgKyByaWRnZSAqIDAuNDU7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRW50aXRpZXMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHZvaWQge1xuICBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkLCBjaHVuay5jeCwgY2h1bmsuY3opO1xufVxuXG4vKiogQGludGVybmFsIFJlcGxheXMgZGV0ZXJtaW5pc3RpYyBnZW5lcmF0aW9uIGZvciBzbmFwc2hvdCBlbnRpdHkgZGVsdGFzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGlmICh3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGtleSkpIHJldHVybjtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuO1xuXG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKGhhc2gyaShjaHVuay5jeCwgY2h1bmsuY3osIHdvcmxkLnNlZWQgKyA5MDApICogNDI5NDk2NzI5NikgPj4+IDApO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgY29uc3QgY29sdW1ucyA9IGJhc2VDb2x1bW5zKHdvcmxkLCBjaHVuayk7XG4gIGxldCBuID0gMDtcbiAgbGV0IG5hdHVyYWxUcmVlcyA9IDA7XG4gIGxldCBuYXR1cmFsUGlua1RyZWVzID0gMDtcblxuICBjb25zdCBsb2NhbFN1cmZhY2UgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gKyBZX01JTjtcbiAgfTtcbiAgY29uc3QgbG9jYWxUb3AgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IE1hdElkID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIGFzIE1hdElkO1xuICB9O1xuICBjb25zdCBsb2NhbFNsb3BlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICByZXR1cm4gTWF0aC5tYXgoXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICk7XG4gIH07XG5cbiAgLy8gQSBqaXR0ZXJlZCA4IG0gbGF0dGljZSBnaXZlcyBjb2hlcmVudCBtYXNzZXMgYW5kIGF2b2lkcyBwZXItZnJhbWUgc2NhdHRlci5cbiAgZm9yIChsZXQgZ3ogPSAwOyBneiA8IENIVU5LX1NJWkU7IGd6ICs9IDgpIHtcbiAgICBmb3IgKGxldCBneCA9IDA7IGd4IDwgQ0hVTktfU0laRTsgZ3ggKz0gOCkge1xuICAgICAgY29uc3QgbHggPSBjbGFtcChNYXRoLmZsb29yKGd4ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3QgbHogPSBjbGFtcChNYXRoLmZsb29yKGd6ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAxKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHNsb3BlID0gbG9jYWxTbG9wZShseCwgbHopO1xuICAgICAgY29uc3QgdG9wID0gbG9jYWxUb3AobHgsIGx6KTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikgY29udGludWU7XG4gICAgICBjb25zdCBmb3Jlc3QgPSBmb3Jlc3RTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9ja3kgPSByb2NrU2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvbGwgPSBybmQoKTtcblxuICAgICAgY29uc3QgdHJlZUNoYW5jZSA9IGZvcmVzdCA+IDAuNTAgPyAwLjcyIDogZm9yZXN0ID4gMC4zMCA/IDAuMjUgOiAwLjA1O1xuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDIgJiYgcm9sbCA8IHRyZWVDaGFuY2UpIHtcbiAgICAgICAgLy8gVGhlIGNhcCBpcyBhIGRldGVybWluaXN0aWMgbmF0dXJhbC1nZW5lcmF0aW9uIHByb3BlcnR5LiBJdCBjYW5ub3RcbiAgICAgICAgLy8gZGVwZW5kIG9uIHdoaWNoIGNodW5rcyBhIHJlbmRlcmVyIGxvYWRlZCBiZWZvcmUgdGhpcyBvbmUuXG4gICAgICAgIGxldCBraW5kOiBFbnRpdHlLaW5kO1xuICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICBjb25zdCBzcGVjaWVzUm9sbCA9IHJuZCgpO1xuICAgICAgICBpZiAoc3BlY2llc1JvbGwgPCAwLjEyKSB7XG4gICAgICAgICAgaWYgKChuYXR1cmFsUGlua1RyZWVzICsgMSkgPiAwLjI1ICogKG5hdHVyYWxUcmVlcyArIDEpKSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rT3ZlcmZsb3crKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfYmxvc3NvbSc7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDIpO1xuICAgICAgICAgICAgbmF0dXJhbFBpbmtUcmVlcysrO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC40MCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3NwaXJlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC43NCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3RhYmxlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgIH1cbiAgICAgICAgbmF0dXJhbFRyZWVzKys7XG4gICAgICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjg4ICsgcm5kKCkgKiAwLjI0LCB2YXJpYW50LFxuICAgICAgICAgIHJlc291cmNlOiAnd29vZCcsIHJlbWFpbmluZzogMTIsIHlpZWxkUGVySGFydmVzdDogNCxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgcm9ja3kgPiAwLjQ2ICYmIHJvbGwgPCAwLjM4KSB7XG4gICAgICAgIC8vIENvbnN1bWUgdGhlIHJldGlyZWQgc3RvbmUgZm9ybSdzIHJhbmRvbSBkcmF3cyBhbmQgYWxsb2NhdGUgaXRzIG9sZFxuICAgICAgICAvLyBzZXF1ZW5jZSBJRCwgYnV0IGRvIG5vdCBpbnNlcnQgYW4gZW50aXR5LiBMYXRlciBuYXR1cmFsIHBsYWNlbWVudHNcbiAgICAgICAgLy8gdGhlcmVmb3JlIHJlbWFpbiBieXRlLWZvci1ieXRlIGNvbXBhdGlibGUgd2l0aCByZWNvcmRlZCBzYXZlcy5cbiAgICAgICAgY29uc3Qgc2l6ZVJvbGwgPSBybmQoKTtcbiAgICAgICAgY29uc3Qga2luZDogRW50aXR5S2luZCA9IHNpemVSb2xsIDwgMC41NSA/ICdzdHlsX3JvY2tfc21hbGwnXG4gICAgICAgICAgOiBzaXplUm9sbCA8IDAuOTAgPyAnc3R5bF9yb2NrX21lZGl1bScgOiAnc3R5bF9yb2NrX2xhcmdlJztcbiAgICAgICAgY29uc3QgaWQgPSBlbnRpdHlJZChjaHVuay5rZXksIG4rKyk7XG4gICAgICAgIGNvbnN0IHJlY29yZCA9IHtcbiAgICAgICAgICBpZCwga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJlc291cmNlOiAnc3RvbmUnIGFzIGNvbnN0LFxuICAgICAgICAgIHJlbWFpbmluZzoga2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyA0IDoga2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gOCA6IDEyLFxuICAgICAgICAgIHlpZWxkUGVySGFydmVzdDogMywgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gT25seSBlbnRpdGllcyB0aGF0IGV4aXN0ZWQgaW4gYW4gYWNjZXB0ZWQgb2xkIHNhdmUgZ2V0IHRvbWJzdG9uZXMsXG4gICAgICAgIC8vIGR1cmluZyBleHBsaWNpdCBtaWdyYXRpb24uIE9yZGluYXJ5IGdlbmVyYXRpb24gbXVzdCByZXN0b3JlIGV4YWN0bHkuXG4gICAgICAgIGlmIChpc1N0b25lUmVwbGF5KHdvcmxkKSkgYWRkRW50aXR5KHdvcmxkLCByZWNvcmQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSAmJiByb2NreSA+IDAuNTggJiYgcm9sbCA8IDAuMTgpIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9vcmUnLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMiksXG4gICAgICAgICAgcmVzb3VyY2U6ICdvcmUnLCByZW1haW5pbmc6IDgsIHlpZWxkUGVySGFydmVzdDogMixcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMSAmJiByb2xsIDwgMC4zMCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX3NocnViJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjggKyBybmQoKSAqIDAuNCwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICAgIHJlc291cmNlOiAnZmliZXInLCByZW1haW5pbmc6IDQsIHlpZWxkUGVySGFydmVzdDogMSxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkQXV0aG9yZWRFbnRpdHkod29ybGQ6IFdvcmxkLCBraW5kOiBFbnRpdHlLaW5kLCB4OiBudW1iZXIsIHo6IG51bWJlciwgdmFyaWFudDogbnVtYmVyLCByb3Q6IG51bWJlciwgc2NhbGU6IG51bWJlciwgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGwsIHJlbWFpbmluZzogbnVtYmVyLCB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHkgPD0gU0VBX0xFVkVMKSByZXR1cm47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAvLyBBIGhlcm8gYXNzZXQgb3ducyBpdHMgc3BvdDogY2xlYXIgYW55IGdlbmVyYXRlZCBlbnRpdHkgdGhhdCB3b3VsZCBvdmVybGFwXG4gIC8vIGl0LCByYXRoZXIgdGhhbiBzaWxlbnRseSBkcm9wcGluZyB0aGUgYXV0aG9yZWQgY29tcG9zaXRpb24uXG4gIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXTtcbiAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChraW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHJldHVybjtcbiAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoZSAmJiBNYXRoLmh5cG90KGUueCAtIHgsIGUueiAtIHopIDwgMi42KSB7XG4gICAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICAgICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICAgICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gICAgfVxuICB9XG4gIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSkpO1xuICAvLyBBdXRob3JlZCBjb21wb3NpdGlvbiBpcyBkdXJhYmxlIHN0YXRlOiBpdCBjYW4gY2xlYXIgb3ZlcmxhcHBpbmcgbmF0dXJhbFxuICAvLyBlbnRpdGllcywgc28gc2F2ZSB0aGUgY29tcGxldGUgYWZmZWN0ZWQgY2h1bmsgcmF0aGVyIHRoYW4gb25seSBpdHMgaGVyb2VzLlxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuXG4gIGNvbnN0IGlkID0gYGhlcm86JHtraW5kfToke01hdGgucm91bmQoeCl9OiR7TWF0aC5yb3VuZCh6KX1gO1xuICBjb25zdCBiZWZvcmUgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICBjb25zdCBlbnRpdHk6IEVudGl0eSA9IHtcbiAgICBpZCwga2luZCwgY2h1bms6IGtleSwgeDogeCArIDAuNSwgeSwgejogeiArIDAuNSxcbiAgICByb3QsIHNjYWxlLCB2YXJpYW50LCByZXNvdXJjZSwgcmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiB0cnVlLFxuICB9O1xuICBhZGRFbnRpdHkod29ybGQsIGVudGl0eSk7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5zaXplID4gYmVmb3JlICYmIGtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHtcbiAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgIGlmIChraW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBpZiAod29ybGQuYXV0aG9yZWRQbGFjZWQpIHJldHVybjtcbiAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSB0cnVlO1xuXG4gIGNvbnN0IHNpdGVzOiBBcnJheTx7IGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJzsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJvdDogbnVtYmVyIH0+ID0gW1xuICAgIHsga2luZDogJ3dheXN0b25lJywgeDogLTEwLCB6OiAtMTQsIHJvdDogMCB9LFxuICAgIHsga2luZDogJ21hcmtlcicsIHg6IC0zMiwgejogLTgsIHJvdDogTWF0aC5QSSAvIDIgfSxcbiAgXTtcbiAgZm9yIChjb25zdCBzIG9mIHNpdGVzKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgcy54LCBzLnopO1xuICAgIGlmICh5IDw9IFNFQV9MRVZFTCkgY29udGludWU7XG4gICAgd29ybGQuc2l0ZXMucHVzaCh7XG4gICAgICBpZDogYHNpdGU6JHtzLmtpbmR9YCxcbiAgICAgIGtpbmQ6IHMua2luZCxcbiAgICAgIHg6IHMueCArIDAuNSwgeSwgejogcy56ICsgMC41LFxuICAgICAgcm90OiBzLnJvdCxcbiAgICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gQSBoZXJvIGdyb3ZlIGNvbXBvc2VkIGluIHRoZSBkZWZhdWx0IGNhbWVyYSdzIHZpZXcgZGlyZWN0aW9uLiBUaGVzZSBhcmVcbiAgLy8gU3R5bCBuYXR1cmFsIGFzc2V0cyAoQVMtMDAxIHYyKSwgbm90IE5veGVsIGFyY2hpdGVjdHVyZTsgdGhlIE5veGVsXG4gIC8vIHdheXN0b25lL21hcmtlciBhYm92ZSByZW1haW4gdGhlIGh1bWFuLW1hZGUgbGFuZG1hcmtzLlxuICBjb25zdCBncm92ZTogQXJyYXk8W0VudGl0eUtpbmQsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXT4gPSBbXG4gICAgWydzdHlsX3RyZWVfc3BpcmUnLCAtMjIsIC0yNiwgMCwgMS4wMCwgMF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtMzQsIC0xOCwgMSwgMC45NSwgTWF0aC5QSSAvIDEyXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTE2LCAtMzQsIDIsIDEuMDAsIE1hdGguUEkgLyA2XSxcbiAgICBbJ3N0eWxfdHJlZV9ibG9zc29tJywgLTI4LCAtMzgsIDAsIDAuOTAsIE1hdGguUEkgLyA0XSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC00MCwgLTMwLCAyLCAxLjA1LCBNYXRoLlBJIC8gM10sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xMiwgLTI0LCAwLCAwLjkwLCBNYXRoLlBJIC8gMi40XSxcbiAgXTtcbiAgZm9yIChjb25zdCBba2luZCwgeCwgeiwgdmFyaWFudCwgc2NhbGUsIHJvdF0gb2YgZ3JvdmUpIHtcbiAgICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwga2luZCwgeCwgeiwgdmFyaWFudCwgcm90LCBzY2FsZSwgJ3dvb2QnLCAxMiwgNCk7XG4gIH1cbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3JvY2tfbWVkaXVtJywgLTYsIC0xMCwgMCwgMCwgMS4wLCAnc3RvbmUnLCA4LCAzKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3NocnViJywgLTE0LCAtOCwgMSwgTWF0aC5QSSAvIDEyLCAxLjEsICdmaWJlcicsIDQsIDEpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfY2Fpcm4nLCAtMjAsIC02LCAwLCAwLCAxLjAsICdzdG9uZScsIDYsIDIpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfb3JlJywgLTM4LCAtNDIsIDAsIE1hdGguUEkgLyA0LCAxLjEsICdvcmUnLCA4LCAyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5lYXJlc3RIYXJ2ZXN0YWJsZShcbiAgd29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgcmFkaXVzOiBudW1iZXIsIHJlc291cmNlPzogUmVzb3VyY2VUeXBlLFxuKTogRW50aXR5IHwgbnVsbCB7XG4gIGxldCBiZXN0OiBFbnRpdHkgfCBudWxsID0gbnVsbDtcbiAgbGV0IGJlc3REID0gcmFkaXVzICogcmFkaXVzO1xuICBmb3IgKGNvbnN0IGUgb2Ygd29ybGQuZW50aXRpZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpXG4gICAgICB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSBjb250aW51ZTtcbiAgICBpZiAocmVzb3VyY2UgJiYgZS5yZXNvdXJjZSAhPT0gcmVzb3VyY2UpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGQgPSAoZS54IC0geCkgKiogMiArIChlLnogLSB6KSAqKiAyO1xuICAgIGlmIChkIDwgYmVzdEQpIHsgYmVzdEQgPSBkOyBiZXN0ID0gZTsgfVxuICB9XG4gIHJldHVybiBiZXN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RSZXN1bHQgeyBlbnRpdHk6IEVudGl0eTsgcmVzb3VyY2U6IFJlc291cmNlVHlwZTsgYW1vdW50OiBudW1iZXI7IH1cblxuLyoqXG4gKiBTZXR0bGVtZW50IHJ1bGVzIHYyIChNMDEwKTogZ3Jvd3RoIHN0YWdlIHNldHMgdHJlZSB5aWVsZCBhbmQgZm9vdHByaW50LCBhbmRcbiAqIHZpbGxhZ2VycyBuYXZpZ2F0ZS4gQWN0aXZlIG9uY2UgdGhlIHdvcmxkJ3MgaG9tZXN0ZWFkIGlzIHZlcnNpb24gMiAoZm91bmRlZFxuICogb3IgdXBncmFkZWQgYnkgYSBqb3VybmFsZWQgY29tbWFuZCk7IGVhcmxpZXIgd29ybGRzIGtlZXAgbGVnYWN5IHJ1bGVzLCBzb1xuICogdGhlaXIgcmVwbGF5cyBhbmQgaGFzaGVzIGFyZSB1bmNoYW5nZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGFnZVJ1bGVzQWN0aXZlKHdvcmxkOiBXb3JsZCk6IGJvb2xlYW4ge1xuICByZXR1cm4gKHdvcmxkLmhvbWVzdGVhZD8udmVyc2lvbiA/PyAwKSA+PSAyO1xufVxuXG4vKipcbiAqIFVuZGVyIHN0YWdlIHJ1bGVzIGEgdHJlZSdzIGZpcnN0IGN1dCBzZXRzIGl0cyByZWNvcmQgdG8gdGhlIHN0YWdlJ3MgdGltYmVyXG4gKiAoYSBzYXBsaW5nIGhvbGRzIDIgd29vZCwgYW4gb2xkIHRyZWUgMTYpLiBJZGVtcG90ZW50IGFmdGVyIHRoZSBmaXJzdCBjdXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBseVN0YWdlVGltYmVyKHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICghc3RhZ2VSdWxlc0FjdGl2ZSh3b3JsZCkgfHwgZS5oYXJ2ZXN0ZWRPbmNlKSByZXR1cm47XG4gIGNvbnN0IHQgPSB0cmVlVGltYmVyKGUpO1xuICBpZiAoIXQpIHJldHVybjtcbiAgZS5yZW1haW5pbmcgPSB0LnRvdGFsO1xuICBlLnlpZWxkUGVySGFydmVzdCA9IHQuY3V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBIYXJ2ZXN0UmVzdWx0IHwgbnVsbCB7XG4gIGNvbnN0IGUgPSBsaXZlRW50aXR5KHdvcmxkLCBpZCk7XG4gIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSByZXR1cm4gbnVsbDtcbiAgLy8gQ2FwYWNpdHkgaXMgY2hlY2tlZCBhZ2FpbnN0IHRoZSBzdGFnZSB5aWVsZCwgdGhlbiB0aGUgcmVjb3JkIGNoYW5nZXMuXG4gIGlmIChzdGFnZVJ1bGVzQWN0aXZlKHdvcmxkKSAmJiAhZS5oYXJ2ZXN0ZWRPbmNlICYmIHRyZWVUaW1iZXIoZSkpIHtcbiAgICBjb25zdCB0ID0gdHJlZVRpbWJlcihlKSE7XG4gICAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIE1hdGgubWluKHQuY3V0LCB0LnRvdGFsKSA+IDEyMCkgcmV0dXJuIG51bGw7XG4gICAgYXBwbHlTdGFnZVRpbWJlcih3b3JsZCwgZSk7XG4gIH1cbiAgY29uc3QgYW1vdW50ID0gTWF0aC5taW4oZS55aWVsZFBlckhhcnZlc3QsIGUucmVtYWluaW5nKTtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIGFtb3VudCA+IDEyMCkgcmV0dXJuIG51bGw7XG4gIGUucmVtYWluaW5nIC09IGFtb3VudDtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgZS5oYXJ2ZXN0ZWRPbmNlID0gdHJ1ZTtcbiAgaWYgKGUucmVtYWluaW5nIDw9IDApIGUuaGFydmVzdGVkID0gdHJ1ZTtcbiAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgZW50aXR5OiBlLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbi8qKiBSZW1vdmUgZXZlcnkgcmV0aXJlZCBzb3VyY2UgYWZ0ZXIgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkuIFRoaXMgbWlncmF0aW9uXG4gKiBjcmVhdGVzIGRldGVybWluaXN0aWMgdG9tYnN0b25lcyBidXQgaXMgbm90IGEgcGxheWVyIGNvbW1hbmQgb3IgcmV2aXNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmV0aXJlU3RvbmVFbnRpdGllcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBlIG9mIFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0pIHtcbiAgICBpZiAoIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKSBjb250aW51ZTtcbiAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoZS5pZCk7XG4gICAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoZS5pZCk7XG4gICAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gICAgaWYgKCF3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGUuY2h1bmspKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtrZXksIGlkc10gb2Ygd29ybGQuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgYWN0aXZlID0gaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpO1xuICAgIGlmIChhY3RpdmUubGVuZ3RoID4gMCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhrZXkpKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgYWN0aXZlKTtcbiAgICBlbHNlIHdvcmxkLmVudGl0eUNodW5rcy5kZWxldGUoa2V5KTtcbiAgfVxuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGVyc2lzdGVuY2UgLyBhdXRob3JpdHkgYm91bmRhcnkgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1hbmlmZXN0IHtcbiAgc2NoZW1hOiAxO1xuICBzZWVkOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIHBhcmFtc0hhc2g6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZm52MWEodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGggPSAweDgxMWM5ZGM1O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBoID0gTWF0aC5pbXVsKGgsIDB4MDEwMDAxOTMpO1xuICB9XG4gIHJldHVybiAoaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZE1hbmlmZXN0KHdvcmxkOiBXb3JsZCk6IFdvcmxkTWFuaWZlc3Qge1xuICBjb25zdCBwID0gd29ybGQucGFyYW1zO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBzZWVkOiB3b3JsZC5zZWVkLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHAuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBzaXplOiBwLnNpemUsXG4gICAgY2h1bmtTaXplOiBwLmNodW5rU2l6ZSxcbiAgICB5TWluOiBwLnlNaW4sXG4gICAgeU1heDogcC55TWF4LFxuICAgIHNlYUxldmVsOiBwLnNlYUxldmVsLFxuICAgIHBhcmFtc0hhc2g6IGZudjFhKEpTT04uc3RyaW5naWZ5KHApKSxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbEVkaXQgeyBpOiBudW1iZXI7IG06IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgc2NoZW1hOiAxO1xuICBrZXk6IHN0cmluZztcbiAgYmFzZVZlcnNpb246IG51bWJlcjtcbiAgZWRpdHM6IFZveGVsRWRpdFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogQ2h1bmtEZWx0YSB7XG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIGtleSxcbiAgICBiYXNlVmVyc2lvbjogd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgZWRpdHM6IGVkaXRzID8gWy4uLmVkaXRzLmVudHJpZXMoKV0ubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSkgOiBbXSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGRlbHRhOiBDaHVua0RlbHRhKTogdm9pZCB7XG4gIGNvbnN0IFtjeCwgY3pdID0gZGVsdGEua2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGZvciAoY29uc3QgZSBvZiBkZWx0YS5lZGl0cykge1xuICAgIGNvbnN0IHlJbmRleCA9IE1hdGguZmxvb3IoZS5pIC8gQ0hVTktfQVJFQSk7XG4gICAgY29uc3QgcmVtID0gZS5pICUgQ0hVTktfQVJFQTtcbiAgICBjb25zdCBseiA9IE1hdGguZmxvb3IocmVtIC8gQ0hVTktfU0laRSk7XG4gICAgY29uc3QgbHggPSByZW0gJSBDSFVOS19TSVpFO1xuICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHg7XG4gICAgY29uc3QgeSA9IFlfTUlOICsgeUluZGV4O1xuICAgIGNvbnN0IHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIGUubSBhcyBNYXRJZCk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSB0aW1lIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgVGltZVN0YXRlIHsgdDogbnVtYmVyOyBkYXlMZW5ndGhTZWM6IG51bWJlcjsgcGF1c2VkOiBib29sZWFuOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBhZHZhbmNlVGltZShzOiBUaW1lU3RhdGUsIGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHMucGF1c2VkKSByZXR1cm47XG4gIHMudCA9IChzLnQgKyBkdCAvIHMuZGF5TGVuZ3RoU2VjKSAlIDE7XG59XG4iLCAiLy8gUmVuZGVyIGxheWVyIFx1MjAxNCBjaHVua2VkIDNEIHZveGVsIG1lc2hlciArIHN0cmVhbWluZyArIG1hY3JvIExPRC5cbi8vXG4vLyBUaGUgdmlzaWJsZSBzdXJmYWNlIGlzIGRlcml2ZWQgZnJvbSB0aGUgc2ltJ3Mgb2NjdXBhbmN5L21hdGVyaWFsIHZvbHVtZS5cbi8vIE5lYXIgY2h1bmtzIGFyZSBtZXNoZWQgYXQgMSBtIHdpdGggZ3JlZWR5IGZhY2UgbWVyZ2luZzsgdGhlIGZhciBsYW5kc2NhcGUgaXNcbi8vIGFuIDggbSAod29ybGQpIC8gOCBtIChtYXApIG1hY3JvIExPRCBzYW1wbGVkIGZyb20gdGhlIHNhbWUgZGV0ZXJtaW5pc3RpY1xuLy8gZ2VuZXJhdG9yLiBXYXRlciBpcyBhIHNpbmdsZSBzZWEtbGV2ZWwgc3VyZmFjZSBkZXJpdmVkIGZyb20gdGhlIHNlYWJlZCBkZXB0aC5cbi8vXG4vLyBObyBhcHJvbiwgaG9yaXpvbiByaW5nIG9yIGZvdW5kYXRpb24gc2tpcnQ6IHRoZSB3b3JsZCBlZGdlIGlzIG9jZWFuLCBhbmQgdGhlXG4vLyBvY2VhbiBzdXJmYWNlIGV4dGVuZHMgZmFyIGJleW9uZCB0aGUgMjA0OCBtIHBsYXlhYmxlIGlzbGFuZC5cbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCBwYWxldHRlIGZyb20gJy4uL2RhdGEvcGFsZXR0ZS5qc29uJztcbmltcG9ydCB7IG1lc2hDaHVua1dhdGVyLCBpbnN0YWxsRmFyV2F0ZXJIb2xlLCB3YXRlclRpbWUgfSBmcm9tICcuL3dhdGVyJztcbmltcG9ydCB7IE1lc2hBcnJheXMsIGJ1aWxkUGFkZGVkLCBtZXNoUGFkZGVkIH0gZnJvbSAnLi9tZXNoZXInO1xuaW1wb3J0IHR5cGUgeyBDaHVua1dvcmtlclBvb2wgfSBmcm9tICcuL2NodW5rLXBvb2wnO1xuaW1wb3J0IHtcbiAgV29ybGQsIFZveGVsQ2h1bmssIE1hdElkLCBTdXJmYWNlU2FtcGxlLCBHRU5FUkFUT1JfVkVSU0lPTixcbiAgV09STERfU0laRSwgSEFMRiwgQ0hVTktfU0laRSwgQ0hVTktTX1BFUl9TSURFLCBDSFVOS19BUkVBLCBXT1JMRF9IRUlHSFQsXG4gIFlfTUlOLCBZX01BWCwgU0VBX0xFVkVMLCBNQVQsIGlzT3BhcXVlLFxuICBjaHVua0tleSwgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosIGxvY2FsSW5kZXgsIHlUb0luZGV4LFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCB3b3JsZFRvTG9jYWxYLCB3b3JsZFRvTG9jYWxaLFxuICBnZXRWb3hlbCwgZW5zdXJlQ2h1bmssIGV2aWN0Q2h1bmssIGhhc2gyaSwgZmJtMixcbiAgZWRpdFZlcnNpb24sIGJhc2VIZWlnaHRBdCwgYmFzZVRvcE1hdGVyaWFsRm9yLCBpbnN0YWxsQmFzZUNodW5rLCBzZWVkQmFzZUNvbHVtbnMsXG59IGZyb20gJy4uL3NpbS93b3JsZCc7XG5cbmltcG9ydCB7XG4gIE0sIEgsIGNvbG9yQ2FjaGUsIGMsIENPTCwgU0hBREUsIE1BWF9QRVJGX1NBTVBMRVMsIHJlY29yZFNhbXBsZSwgcGVyY2VudGlsZSwgaGVpZ2h0QmFuZCwgc3RvbmVUb25lLCBzaGFkZUF0LCBrZXlGb3IsIGZhY2VDb2xvckNhY2hlLCBjb2xvckZvcktleSxcbn0gZnJvbSAnLi92b3hlbC1jb2xvcnMnO1xuXG5jb25zdCB0ZXJyYWluTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XG4gIHZlcnRleENvbG9yczogdHJ1ZSxcbiAgc2lkZTogVEhSRUUuRnJvbnRTaWRlLFxufSk7XG50ZXJyYWluTWF0ZXJpYWwub25CZWZvcmVDb21waWxlID0gKHNoYWRlcikgPT4ge1xuICBzaGFkZXIudmVydGV4U2hhZGVyID0gc2hhZGVyLnZlcnRleFNoYWRlclxuICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsICcjaW5jbHVkZSA8Y29tbW9uPlxcbmF0dHJpYnV0ZSBmbG9hdCBhTWF0O1xcbnZhcnlpbmcgdmVjMyB2V1BvcztcXG52YXJ5aW5nIHZlYzMgdldOcm07XFxudmFyeWluZyBmbG9hdCB2TWF0OycpXG4gICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+JywgJyNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+XFxudldQb3MgPSAobW9kZWxNYXRyaXggKiB2ZWM0KHRyYW5zZm9ybWVkLCAxLjApKS54eXo7XFxudldOcm0gPSBub3JtYWxpemUobWF0Myhtb2RlbE1hdHJpeCkgKiBvYmplY3ROb3JtYWwpO1xcbnZNYXQgPSBhTWF0OycpO1xuICBzaGFkZXIuZnJhZ21lbnRTaGFkZXIgPSBzaGFkZXIuZnJhZ21lbnRTaGFkZXJcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCBgI2luY2x1ZGUgPGNvbW1vbj5cbnZhcnlpbmcgdmVjMyB2V1BvcztcbnZhcnlpbmcgdmVjMyB2V05ybTtcbnZhcnlpbmcgZmxvYXQgdk1hdDtcbmZsb2F0IGgyMSh2ZWMyIHApIHsgcmV0dXJuIGZyYWN0KHNpbihkb3QocCwgdmVjMigxMjcuMSwgMzExLjcpKSkgKiA0Mzc1OC41NDUzMTIzKTsgfVxuZmxvYXQgdm4yKHZlYzIgcCkge1xuICB2ZWMyIGkgPSBmbG9vcihwKTsgdmVjMiBmID0gZnJhY3QocCk7IGYgPSBmICogZiAqICgzLjAgLSAyLjAgKiBmKTtcbiAgcmV0dXJuIG1peChtaXgoaDIxKGkpLCBoMjEoaSArIHZlYzIoMS4wLCAwLjApKSwgZi54KSxcbiAgICAgICAgICAgICBtaXgoaDIxKGkgKyB2ZWMyKDAuMCwgMS4wKSksIGgyMShpICsgdmVjMigxLjAsIDEuMCkpLCBmLngpLCBmLnkpO1xufWApXG4gICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb2xvcl9mcmFnbWVudD4nLCBgI2luY2x1ZGUgPGNvbG9yX2ZyYWdtZW50Plxue1xuICB2ZWMzIG4gPSBub3JtYWxpemUodldOcm0pO1xuICBmbG9hdCB2ZXJ0ID0gMS4wIC0gc21vb3Roc3RlcCgwLjM1LCAwLjcwLCBhYnMobi55KSk7XG4gIGZsb2F0IGlzR3Jhc3MgPSAoKHZNYXQgPiAwLjUgJiYgdk1hdCA8IDEuNSkgfHwgKHZNYXQgPiA4LjUgJiYgdk1hdCA8IDkuNSkpID8gMS4wIDogMC4wO1xuICBmbG9hdCBpc1N0b25lID0gKCh2TWF0ID4gNC41ICYmIHZNYXQgPCA2LjUpIHx8ICh2TWF0ID4gNy41ICYmIHZNYXQgPCA4LjUpKSA/IDEuMCA6IDAuMDtcblxuICBmbG9hdCBob3JpeiA9IGFicyhuLngpID4gYWJzKG4ueikgPyB2V1Bvcy56IDogdldQb3MueDtcbiAgZmxvYXQgcm93ID0gZmxvb3IodldQb3MueSk7XG4gIGZsb2F0IGNvbCA9IGZsb29yKGhvcml6KTtcbiAgZmxvYXQgaCA9IGgyMSh2ZWMyKGNvbCwgcm93KSk7XG4gIHZlYzIgZiA9IHZlYzIoZnJhY3QoaG9yaXopLCBmcmFjdCh2V1Bvcy55KSk7XG4gIGZsb2F0IGpvaW50ID0gc21vb3Roc3RlcCgwLjAsIDAuMDU1LCBtaW4oZi54LCAxLjAgLSBmLngpKVxuICAgICAgICAgICAgICAqIHNtb290aHN0ZXAoMC4wLCAwLjA1MCwgbWluKGYueSwgMS4wIC0gZi55KSk7XG4gIHZlYzMgc3RvbmUgPSBtaXgodmVjMygwLjYyLCAwLjYyLCAwLjU4KSwgdmVjMygxLjA0LCAxLjAyLCAwLjk1KSwgaCk7XG4gIHN0b25lICo9IG1peCgwLjkwLCAxLjAsIGpvaW50KTtcbiAgc3RvbmUgKj0gbWl4KDAuOTMsIDEuMCwgc21vb3Roc3RlcCgwLjAsIDAuMzAsIGYueSkpO1xuICBkaWZmdXNlQ29sb3IucmdiICo9IG1peCh2ZWMzKDEuMCksIHN0b25lLCB2ZXJ0ICogaXNTdG9uZSk7XG5cbiAgZmxvYXQgZ3kgPSBzbW9vdGhzdGVwKDAuNDUsIDAuODgsIGFicyhuLnkpKTtcbiAgZmxvYXQgZzEgPSB2bjIodldQb3MueHogKiAxLjM1KTtcbiAgZmxvYXQgZzIgPSB2bjIodldQb3MueHogKiAwLjExKTtcbiAgdmVjMyBncmFzcyA9IG1peCh2ZWMzKDAuODIsIDAuODYsIDAuNzIpLCB2ZWMzKDEuMDYsIDEuMDQsIDAuOTgpLCBnMSAqIDAuNDIgKyBnMiAqIDAuNDYgKyB2bjIodldQb3MueHogKiA0LjMpICogMC4xMik7XG4gIGZsb2F0IGNlbGwgPSBoMjEoZmxvb3IodldQb3MueHopICsgMTcuMCk7XG4gIGdyYXNzICo9IDAuOTUgKyAwLjEwICogY2VsbDtcbiAgZGlmZnVzZUNvbG9yLnJnYiAqPSBtaXgodmVjMygxLjApLCBncmFzcywgZ3kgKiBpc0dyYXNzKTtcbn1gKTtcbn07XG5cbmludGVyZmFjZSBNZXNoUmVzdWx0IHsgZ2VvbWV0cnk6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5OyB0cmlhbmdsZXM6IG51bWJlcjsgfVxuXG4vKiogQnVpbGQgYSBCdWZmZXJHZW9tZXRyeSBmcm9tIG1lc2hlciBvdXRwdXQgKG1haW4gdGhyZWFkKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW9tZXRyeUZyb21BcnJheXMoYTogTWVzaEFycmF5cyk6IE1lc2hSZXN1bHQge1xuICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhLnBvc2l0aW9ucywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ25vcm1hbCcsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYS5ub3JtYWxzLCAzKSk7XG4gIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEuY29sb3JzLCAzKSk7XG4gIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnYU1hdCcsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYS5tYXRzLCAxKSk7XG4gIGdlb21ldHJ5LnNldEluZGV4KG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYS5pbmRpY2VzLCAxKSk7XG4gIGdlb21ldHJ5LmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuICByZXR1cm4geyBnZW9tZXRyeSwgdHJpYW5nbGVzOiBhLnRyaWFuZ2xlcyB9O1xufVxuXG4vKiogUGFkZGVkIHZvbHVtZSBmb3IgYSByZXNpZGVudCBjaHVuazsgbmVpZ2hib3VycyBjb21lIGZyb20gdGhlIHdvcmxkICgzeDMgbXVzdCBiZSByZXNpZGVudCkuICovXG5leHBvcnQgZnVuY3Rpb24gcGFkZGVkRm9yKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiBVaW50OEFycmF5IHtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIHJldHVybiBidWlsZFBhZGRlZChjaHVuay5kYXRhLCAoeCwgeSwgeikgPT4gZ2V0Vm94ZWwod29ybGQsIG94ICsgeCwgWV9NSU4gKyB5LCBveiArIHopKTtcbn1cblxuLyoqXG4gKiBHcmVlZHkgM0QgZmFjZSBtZXNoZXIgKHN5bmNocm9ub3VzIHBhdGgpLiBBIGZhY2UgaXMgZW1pdHRlZCB3aGVuIGFuIG9wYXF1ZVxuICogdm94ZWwgdG91Y2hlcyBhIG5vbi1vcGFxdWUgY2VsbCAoYWlyIG9yIHdhdGVyKTsgd2F0ZXIgc3VyZmFjZXMgYXJlIG1lc2hlZFxuICogc2VwYXJhdGVseSBpbiB3YXRlci50cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lc2hDaHVuayh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogTWVzaFJlc3VsdCB7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICByZXR1cm4gZ2VvbWV0cnlGcm9tQXJyYXlzKG1lc2hQYWRkZWQocGFkZGVkRm9yKHdvcmxkLCBjaHVuayksIGNodW5rLmhlaWdodHMsIG94LCBveiwgd29ybGQuc2VlZCkpO1xufVxuXG4vKipcbiAqIEdyaWQgbGluZXMgb2YgdGhlIHNlYSBwbGFuZTogdGhlIG9yaWdpbmFsIGBzZWdtZW50c2AgbGF0dGljZSBvdmVyIHRoZVxuICogaXNsYW5kIHBsdXMgdHdvIGNlbGxzIG9mIG1hcmdpbiAoc2FtZSB2ZXJ0aWNlcywgc28gdGhlIHNhbWUgY29sb3VycyksIHRoZW5cbiAqIGxpbmVzIHRoYXQgZG91YmxlIHRoZWlyIHNwYWNpbmcgb3V0IHRvIHRoZSBwbGFuZSBlZGdlLiBPcGVuIG9jZWFuIGZhclxuICogYmV5b25kIHRoZSAyMDQ4IG0gaXNsYW5kIGlzIGZsYXQsIGZvZ2dlZCBhbmQgbmVlZHMgbm8gMjA4IG0gdmVydGV4IGdyaWQ7XG4gKiB0aGlzIGtlZXBzIHRoZSBuZWFyIHBhdHRlcm4gYW5kIGRyb3BzIGFib3V0IDkwJSBvZiB0aGUgdHJpYW5nbGVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJHcmlkTGluZXMoc2l6ZTogbnVtYmVyLCBzZWdtZW50czogbnVtYmVyKTogbnVtYmVyW10ge1xuICBjb25zdCBzZWcgPSBzaXplIC8gc2VnbWVudHMsIGNvb3JkID0gKGs6IG51bWJlcikgPT4gLXNpemUgLyAyICsgayAqIHNlZztcbiAgY29uc3QgaW5uZXI6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGsgPSAwOyBrIDw9IHNlZ21lbnRzOyBrKyspIGlmIChNYXRoLmFicyhjb29yZChrKSkgPD0gSEFMRiArIDIgKiBzZWcpIGlubmVyLnB1c2goayk7XG4gIGlmIChpbm5lci5sZW5ndGggPT09IDApIHJldHVybiBbMCwgc2VnbWVudHNdLm1hcChjb29yZCk7XG4gIGNvbnN0IGtlZXAgPSBuZXcgU2V0KGlubmVyKTtcbiAgZm9yIChsZXQgayA9IGlubmVyWzBdLCBzID0gMTsgayA+IDA7IHMgKj0gMikgeyBrID0gTWF0aC5tYXgoMCwgayAtIHMpOyBrZWVwLmFkZChrKTsgfVxuICBmb3IgKGxldCBrID0gaW5uZXJbaW5uZXIubGVuZ3RoIC0gMV0sIHMgPSAxOyBrIDwgc2VnbWVudHM7IHMgKj0gMikgeyBrID0gTWF0aC5taW4oc2VnbWVudHMsIGsgKyBzKTsga2VlcC5hZGQoayk7IH1cbiAgcmV0dXJuIFsuLi5rZWVwXS5zb3J0KChhLCBiKSA9PiBhIC0gYikubWFwKGNvb3JkKTtcbn1cblxuZnVuY3Rpb24gd2F0ZXJHcmlkR2VvbWV0cnkoc2l6ZTogbnVtYmVyLCBzZWdtZW50czogbnVtYmVyKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xuICBjb25zdCBsaW5lcyA9IHdhdGVyR3JpZExpbmVzKHNpemUsIHNlZ21lbnRzKSwgbiA9IGxpbmVzLmxlbmd0aDtcbiAgY29uc3QgcG9zaXRpb25zID0gbmV3IEZsb2F0MzJBcnJheShuICogbiAqIDMpLCBub3JtYWxzID0gbmV3IEZsb2F0MzJBcnJheShuICogbiAqIDMpO1xuICBmb3IgKGxldCBqID0gMDsgaiA8IG47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICBjb25zdCB2ID0gKGogKiBuICsgaSkgKiAzO1xuICAgICAgcG9zaXRpb25zW3ZdID0gbGluZXNbaV07IHBvc2l0aW9uc1t2ICsgMl0gPSBsaW5lc1tqXTtcbiAgICAgIG5vcm1hbHNbdiArIDFdID0gMTtcbiAgICB9XG4gIH1cbiAgY29uc3QgaW5kaWNlczogbnVtYmVyW10gPSBbXTtcbiAgZm9yIChsZXQgaiA9IDA7IGogPCBuIC0gMTsgaisrKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuIC0gMTsgaSsrKSB7XG4gICAgICBjb25zdCBhID0gaiAqIG4gKyBpLCBiID0gKGogKyAxKSAqIG4gKyBpLCBjID0gYSArIDEsIGQgPSBiICsgMTtcbiAgICAgIGluZGljZXMucHVzaChhLCBiLCBjLCBjLCBiLCBkKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgZ2VvID0gbmV3IFRIUkVFLkJ1ZmZlckdlb21ldHJ5KCk7XG4gIGdlby5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbnMsIDMpKTtcbiAgZ2VvLnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShub3JtYWxzLCAzKSk7XG4gIGdlby5zZXRJbmRleChpbmRpY2VzKTtcbiAgZ2VvLmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuICByZXR1cm4gZ2VvO1xufVxuXG4vKiogT25lIG9wYXF1ZSBzZWEtbGV2ZWwgc3VyZmFjZSBmb3IgdGhlIHdob2xlIHZpZXcuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRXYXRlclN1cmZhY2Uod29ybGQ6IFdvcmxkLCBzaXplID0gMjAwMDAsIHNlZ21lbnRzID0gOTYpOiBUSFJFRS5NZXNoIHtcbiAgY29uc3QgZ2VvID0gd2F0ZXJHcmlkR2VvbWV0cnkoc2l6ZSwgc2VnbWVudHMpO1xuICBjb25zdCBwb3MgPSBnZW8uYXR0cmlidXRlcy5wb3NpdGlvbjtcbiAgY29uc3QgY29sb3JzID0gbmV3IEZsb2F0MzJBcnJheShwb3MuY291bnQgKiAzKTtcbiAgY29uc3QgdG1wID0gbmV3IFRIUkVFLkNvbG9yKCk7XG4gIGNvbnN0IHNtb290aHN0ZXAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHg6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IHQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCAoeCAtIGEpIC8gKGIgLSBhKSkpO1xuICAgIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xuICB9O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHBvcy5jb3VudDsgaSsrKSB7XG4gICAgY29uc3QgeCA9IHBvcy5nZXRYKGkpLCB6ID0gcG9zLmdldFooaSk7XG4gICAgLy8gVGhlIHdhdGVyIHBsYW5lIHNhbXBsZXMgdGhlIHNlYWJlZCBvbmx5IGZvciBhIG5hcnJvdyBzaG9yZSByaW0uIEEgZGVwdGhcbiAgICAvLyByYW1wIG9uIGEgNDcgbSBncmlkIG1pc3NlZCB0aGUgMTAgbSByaXZlciBlbnRpcmVseSBhbmQgdHVybmVkIGl0IHdoaXRlO1xuICAgIC8vIHRoZSByaXZlciBhbmQgbGFrZSByZWFkIGJldHRlciBhcyB0aGUgc2FtZSBkZWVwIHdhdGVyIGFzIHRoZSBzZWEuXG4gICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgTWF0aC5yb3VuZCh4KSwgTWF0aC5yb3VuZCh6KSk7XG4gICAgY29uc3Qgc2hvcmUgPSBzbW9vdGhzdGVwKC0wLjksIC0wLjE1LCBoKSAqICgxIC0gc21vb3Roc3RlcCgtMC4xNSwgMC40LCBoKSk7XG4gICAgY29uc3QgbiA9IGhhc2gyaShNYXRoLmZsb29yKHggLyA0NSksIE1hdGguZmxvb3IoeiAvIDQ1KSwgd29ybGQuc2VlZCArIDUwMSk7XG4gICAgdG1wLmNvcHkoQ09MLndhdGVyTWlkKS5sZXJwKENPTC53YXRlckRlZXAsIDAuMzUgKyAwLjM1ICogbik7XG4gICAgLy8gQSB3ZWFrIHNob3JlIHRpbnQuIEEgc3Ryb25nIG9uZSwgc2FtcGxlZCBvbiBhIGNvYXJzZSBwbGFuZSwgcHJvZHVjZWRcbiAgICAvLyBwYWxlIHJlY3RhbmdsZXMgb3ZlciBvZmZzaG9yZSBzZWFtb3VudHMgaW4gdGhlIG1hcCB2aWV3LlxuICAgIHRtcC5sZXJwKENPTC53YXRlclJpbSwgc2hvcmUgKiAwLjE1KTtcbiAgICBjb2xvcnNbaSAqIDNdID0gdG1wLnI7IGNvbG9yc1tpICogMyArIDFdID0gdG1wLmc7IGNvbG9yc1tpICogMyArIDJdID0gdG1wLmI7XG4gIH1cbiAgZ2VvLnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGNvbG9ycywgMykpO1xuICAvLyBPcGFxdWU6IHRoZSBzZWEtbGV2ZWwgc3VyZmFjZSBpcyB0aGUgd2F0ZXIgcmVhZC4gQSB0cmFuc2x1Y2VudCBwbGFuZSBsZXRcbiAgLy8gdGhlIG1hY3JvIHNlYWJlZCBzaG93IHRocm91Z2gsIHdoaWNoIG1hZGUgdGhlIGZpbml0ZSAyMDQ4IG0gd29ybGQgZWRnZVxuICAvLyB2aXNpYmxlIGFzIGEgc3F1YXJlIGluIHRoZSBmaXJzdCBNMDAxIG1hcCBjYXB0dXJlLlxuICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvLCBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XG4gICAgdmVydGV4Q29sb3JzOiB0cnVlLFxuICB9KSk7XG4gIG1lc2gucG9zaXRpb24ueSA9IC0wLjA2O1xuICBtZXNoLnJlbmRlck9yZGVyID0gMTtcbiAgbWVzaC5uYW1lID0gJ3dhdGVyX3N1cmZhY2UnO1xuICBtZXNoLnJlY2VpdmVTaGFkb3cgPSBmYWxzZTtcbiAgcmV0dXJuIG1lc2g7XG59XG5cbmludGVyZmFjZSBNYWNyb0hvbGUgeyBtaW5YOiBudW1iZXI7IG1heFg6IG51bWJlcjsgbWluWjogbnVtYmVyOyBtYXhaOiBudW1iZXI7IH1cbi8qKlxuICogRGlzdGFuY2UgdGllcnMgb2YgdGhlIHdvcmxkLXZpZXcgbWFjcm8gbWVzaC4gQ2VsbHMgd2l0aGluIGBmaW5lYCBtZXRyZXNcbiAqIChDaGVieXNoZXYgZGlzdGFuY2Ugb2YgdGhlaXIgYmxvY2sgZnJvbSB0aGUgZm9jdXMpIGtlZXAgdGhlIGJhc2Ugc3RlcCxcbiAqIGNlbGxzIHdpdGhpbiBgbWlkYCBtZXRyZXMgbWVyZ2UgMngyLCBjZWxscyBiZXlvbmQgbWVyZ2UgNHg0LiBCbG9ja3MgYXJlXG4gKiA0IGJhc2UgY2VsbHMgd2lkZSwgc28gdGllciBib3VuZGFyaWVzIG5ldmVyIHNwbGl0IGEgY29hcnNlIGNlbGwuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTWFjcm9UaWVycyB7IGZpbmU6IG51bWJlcjsgbWlkOiBudW1iZXIgfVxuZXhwb3J0IGNvbnN0IERFRkFVTFRfTUFDUk9fVElFUlM6IE1hY3JvVGllcnMgPSB7IGZpbmU6IDQ0OCwgbWlkOiA4OTYgfTtcbi8qKiBTaWRlIChtKSBvZiBhIHdvcmxkLXZpZXcgbWFjcm8gdGlsZTsgdGlsZXMgb3V0c2lkZSB0aGUgY2FtZXJhIGZydXN0dW0gYXJlIG5vdCBkcmF3bi4gKi9cbmV4cG9ydCBjb25zdCBNQUNST19USUxFID0gMjU2O1xuXG5pbnRlcmZhY2UgTWFjcm9PcHRpb25zIHtcbiAgc3RlcDogbnVtYmVyO1xuICAvKiogUmVjdGFuZ3VsYXIgaG9sZSBjb3ZlcmVkIGJ5IHRoZSBuZWFyIDEgbSBjaHVuayByaW5nLiAqL1xuICBob2xlPzogTWFjcm9Ib2xlO1xuICAvKiogV29ybGQgdmlldyBmb2N1czsgd2l0aCBpdCwgZmFyIGNlbGxzIHVzZSBjb2Fyc2VyIHRpZXJzIChtYXAgbW9kZSBwYXNzZXMgbm9uZSkuICovXG4gIGZvY3VzPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICB0aWVycz86IE1hY3JvVGllcnM7XG59XG5cbmludGVyZmFjZSBNYWNyb1Jlc3VsdCB7XG4gIC8qKiBUaGUgd2hvbGUgbWVzaCB3aGVuIHVudGlsZWQgKG5vIGZvY3VzKTsgb3RoZXJ3aXNlIHRoZSBmaXJzdCB0aWxlLiAqL1xuICBtZXNoOiBUSFJFRS5NZXNoO1xuICAvKiogRXZlcnkgdGlsZSBtZXNoIChvbmUgd2hlbiB1bnRpbGVkKSwgZWFjaCB3aXRoIGEgYm91bmRpbmcgYm94IGZvciBjdWxsaW5nLiAqL1xuICBtZXNoZXM6IFRIUkVFLk1lc2hbXTtcbiAgdHJpYW5nbGVzOiBudW1iZXI7XG4gIHNhbXBsZU1zOiBudW1iZXI7XG4gIHRvdGFsTXM6IG51bWJlcjtcbiAgc2FtcGxlQ2FjaGVkOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgTWFjcm9TYW1wbGVDYWNoZSB7XG4gIE46IG51bWJlcjtcbiAgaGVpZ2h0czogSW50MTZBcnJheTtcbiAgdG9wczogVWludDhBcnJheTtcbiAgdW5kZXJ3YXRlcjogVWludDhBcnJheTtcbiAgc2FtcGxlTXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNYWNyb1RlcnJhaW5TYW1wbGUgeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IHRvcDogTWF0SWQ7IHVuZGVyd2F0ZXI6IGJvb2xlYW47IH1cblxuLy8gQ2FjaGUgdGhlIGRldGVybWluaXN0aWMgYmFzZSBncmlkIGFuZCB0aGUgYXV0aG9yaXRhdGl2ZSBlZGl0ZWQgZ3JpZCBzZXBhcmF0ZWx5LlxuLy8gQmFzZSBlbnRyaWVzIG5ldmVyIG5lZWQgaW52YWxpZGF0aW9uLiBFZGl0ZWQgZW50cmllcyBhcmUgc2NvcGVkIGJ5IFdvcmxkIGlkZW50aXR5XG4vLyAodHdvIHNhbWUtc2VlZCB3b3JsZHMgY2FuIGhhdmUgZGlmZmVyZW50IGVkaXRzKSBhbmQgYnkgYm90aCB0aGUgY29hcnNlIGVkaXRcbi8vIHJldmlzaW9uIGFuZCBjaHVuayBzdHJlYW1pbmcsIHNpbmNlIGV2aWN0aW5nL3JlZ2VuZXJhdGluZyBkYXRhIGFuZCBzbmFwc2hvdFxuLy8gcmVzdG9yYXRpb24gZG8gbm90IG5lY2Vzc2FyaWx5IHByb2R1Y2UgYSBuZXcgY29hcnNlIHJldmlzaW9uLiBPbmx5IGNodW5rcyB3aXRoXG4vLyBkdXJhYmxlIHZveGVsIGRlbHRhcyBhcmUgbWF0ZXJpYWxpemVkOyB0aGUgb3RoZXIgNjR4NjQgY2VsbHMgcmVtYWluIGJhc2Ugc2FtcGxlcy5cbmludGVyZmFjZSBNYWNyb1dvcmxkQ2FjaGVzIHtcbiAgYmFzZTogTWFwPG51bWJlciwgTWFjcm9TYW1wbGVDYWNoZT47XG4gIGVkaXRlZDogTWFwPHN0cmluZywgTWFjcm9TYW1wbGVDYWNoZT47XG4gIC8qKiBTcGFyc2UgYXV0aG9yaXRhdGl2ZSBjb2x1bW5zLCBpbmRlcGVuZGVudCBvZiB0aGUgbWVzaCBzYW1wbGluZyByZXNvbHV0aW9uLiAqL1xuICBjb2x1bW5zOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCB7IGhlaWdodDogbnVtYmVyOyB0b3A6IE1hdElkIH0+PjtcbiAgcmV2aXNpb246IG51bWJlcjtcbn1cbmNvbnN0IG1hY3JvU2FtcGxlQ2FjaGUgPSBuZXcgV2Vha01hcDxXb3JsZCwgTWFjcm9Xb3JsZENhY2hlcz4oKTtcblxuZnVuY3Rpb24gc3luY01hY3JvQ29sdW1ucyh3b3JsZDogV29ybGQsIGNhY2hlczogTWFjcm9Xb3JsZENhY2hlcyk6IHZvaWQge1xuICBpZiAod29ybGQucmV2aXNpb24gPT09IGNhY2hlcy5yZXZpc2lvbikgcmV0dXJuO1xuICAvLyBTbmFwc2hvdCByZXN0b3JlIHJlcGxhY2VzIGVkaXRzIGFuZCBjaHVua3MgYmVmb3JlIGFzc2lnbmluZyBpdHMgc2F2ZWRcbiAgLy8gcmV2aXNpb24uIE5ldmVyIG1peCByZW1lbWJlcmVkIGNvbHVtbnMgZnJvbSB0aGF0IHByZXZpb3VzIHdvcmxkIHN0YXRlLlxuICBjYWNoZXMuY29sdW1ucy5jbGVhcigpO1xuICAvLyBBIG5vcm1hbCBlZGl0IGhhcyBhbHJlYWR5IHVwZGF0ZWQgdGhlIGxvYWRlZCBjaHVuaywgc28gaXQgY29zdHMgb25seSB0aGVcbiAgLy8gZWRpdGVkIGNodW5rcy4gUmVzdG9yZWQvZXZpY3RlZCBlZGl0ZWQgY2h1bmtzIGFyZSBnZW5lcmF0ZWQgb24gZGVtYW5kLlxuICBmb3IgKGNvbnN0IFtrZXksIGVkaXRzXSBvZiB3b3JsZC5lZGl0cykge1xuICAgIGlmICghZWRpdHMuc2l6ZSB8fCAhd29ybGQuY2h1bmtzLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KSE7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgY29sdW1ucyA9IG5ldyBNYXA8bnVtYmVyLCB7IGhlaWdodDogbnVtYmVyOyB0b3A6IE1hdElkIH0+KCk7XG4gICAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBjb2x1bW5zLnNldCgob3ggKyBseCArIEhBTEYpICogV09STERfU0laRSArIG96ICsgbHogKyBIQUxGLCB7XG4gICAgICAgICAgaGVpZ2h0OiBjaHVuay5oZWlnaHRzW2NvbF0gKyBZX01JTiArIDEsXG4gICAgICAgICAgdG9wOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSBhcyBNYXRJZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIGNhY2hlcy5jb2x1bW5zLnNldChrZXksIGNvbHVtbnMpO1xuICB9XG4gIGNhY2hlcy5lZGl0ZWQuY2xlYXIoKTtcbiAgY2FjaGVzLnJldmlzaW9uID0gd29ybGQucmV2aXNpb247XG59XG5cbmZ1bmN0aW9uIG1hY3JvQ29sdW1uKHdvcmxkOiBXb3JsZCwgY2FjaGVzOiBNYWNyb1dvcmxkQ2FjaGVzLCBrZXk6IHN0cmluZywgaW5kZXg6IG51bWJlcikge1xuICBsZXQgY29sdW1ucyA9IGNhY2hlcy5jb2x1bW5zLmdldChrZXkpO1xuICBpZiAoY29sdW1ucykgcmV0dXJuIGNvbHVtbnMuZ2V0KGluZGV4KTtcbiAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgaWYgKCFlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgLy8gQ2FwdHVyZSBvbmNlIGFmdGVyIGxvYWRpbmcuIExvYWRlZCBjaHVua3MgYXJlIGNoZWFwIGFuZCBkbyBub3QgcmVxdWlyZVxuICAvLyB3YWxraW5nIGV2ZXJ5IHZveGVsOyB0aGlzIHJlbWFpbnMgTygzMngzMikgcGVyIGVkaXRlZCBjaHVuay5cbiAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSkhO1xuICBjb2x1bW5zID0gbmV3IE1hcCgpO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLnNldCgob3ggKyBseCArIEhBTEYpICogV09STERfU0laRSArIG96ICsgbHogKyBIQUxGLCB7XG4gICAgICAgIGhlaWdodDogY2h1bmsuaGVpZ2h0c1tjb2xdICsgWV9NSU4gKyAxLFxuICAgICAgICB0b3A6IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdIGFzIE1hdElkLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGNhY2hlcy5jb2x1bW5zLnNldChrZXksIGNvbHVtbnMpO1xuICByZXR1cm4gY29sdW1ucy5nZXQoaW5kZXgpO1xufVxuXG5jb25zdCBtYWNyb0VkaXRLZXlNZW1vID0gbmV3IFdlYWtNYXA8V29ybGQsIHsgdmVyc2lvbjogbnVtYmVyOyBrZXk6IHN0cmluZyB9PigpO1xuXG4vKiogTWVtb2l6ZWQgYnkgdGhlIHdvcmxkJ3MgZWRpdCB2ZXJzaW9uOiBPKDEpIHBlciBmcmFtZSB1bmxlc3MgZWRpdHMgY2hhbmdlZC4gKi9cbmZ1bmN0aW9uIG1hY3JvRWRpdEtleSh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCB2ZXJzaW9uID0gZWRpdFZlcnNpb24od29ybGQpO1xuICBjb25zdCBtZW1vID0gbWFjcm9FZGl0S2V5TWVtby5nZXQod29ybGQpO1xuICBpZiAobWVtbyAmJiBtZW1vLnZlcnNpb24gPT09IHZlcnNpb24pIHJldHVybiBtZW1vLmtleTtcbiAgY29uc3Qga2V5ID0gY29tcHV0ZU1hY3JvRWRpdEtleSh3b3JsZCk7XG4gIG1hY3JvRWRpdEtleU1lbW8uc2V0KHdvcmxkLCB7IHZlcnNpb24sIGtleSB9KTtcbiAgcmV0dXJuIGtleTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZU1hY3JvRWRpdEtleSh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICAvLyBJbmNsdWRlIGEgY29tbXV0YXRpdmUgY29udGVudCBmaW5nZXJwcmludCBhcyB3ZWxsIGFzIGNvdW50OiBldmljdGlvbiBhbmRcbiAgLy8gc25hcHNob3QgcmVzdG9yZSBieXBhc3MgdGhlIGNvYXJzZSBXb3JsZC5yZXZpc2lvbiBwYXRoLCBhbmQgYSByZXN0b3JlZFxuICAvLyBkZWx0YSBjYW4gaGF2ZSB0aGUgc2FtZSBudW1iZXIgb2YgY2VsbHMgd2l0aCBkaWZmZXJlbnQgaW5kaWNlcy9tYXRlcmlhbHMuXG4gIHJldHVybiBbLi4ud29ybGQuZWRpdHMuZW50cmllcygpXVxuICAgIC5maWx0ZXIoKFssIGVkaXRzXSkgPT4gZWRpdHMuc2l6ZSA+IDApXG4gICAgLm1hcCgoW2tleSwgZWRpdHNdKSA9PiB7XG4gICAgICBsZXQgc3VtID0gMDtcbiAgICAgIGxldCBtaXhlZCA9IDA7XG4gICAgICBmb3IgKGNvbnN0IFtpbmRleCwgbWF0ZXJpYWxdIG9mIGVkaXRzKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gTWF0aC5pbXVsKGluZGV4ICsgMSwgMzEpICsgbWF0ZXJpYWw7XG4gICAgICAgIHN1bSA9IChzdW0gKyB2YWx1ZSkgfCAwO1xuICAgICAgICBtaXhlZCA9IChtaXhlZCBeIE1hdGguaW11bCh2YWx1ZSwgMHg0NWQ5ZjNiKSkgfCAwO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAke2tleX06JHtlZGl0cy5zaXplfToke3N1bX06JHttaXhlZH1gO1xuICAgIH0pXG4gICAgLnNvcnQoKVxuICAgIC5qb2luKCd8Jyk7XG59XG5cbmZ1bmN0aW9uIGVkaXRlZE1hY3JvU2FtcGxlcyh3b3JsZDogV29ybGQsIHN0ZXA6IG51bWJlciwgY2FjaGU6IE1hY3JvU2FtcGxlQ2FjaGUpOiBNYWNyb1NhbXBsZUNhY2hlIHtcbiAgY29uc3QgY2FjaGVzID0gbWFjcm9TYW1wbGVDYWNoZS5nZXQod29ybGQpITtcbiAgY29uc3Qga2V5ID0gYCR7c3RlcH06JHttYWNyb0VkaXRLZXkod29ybGQpfWA7XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlcy5lZGl0ZWQuZ2V0KGtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG5cbiAgZm9yIChjb25zdCBbY2h1bmssIGVkaXRzXSBvZiB3b3JsZC5lZGl0cykge1xuICAgIGlmIChlZGl0cy5zaXplICYmICFjYWNoZXMuY29sdW1ucy5oYXMoY2h1bmspKSBtYWNyb0NvbHVtbih3b3JsZCwgY2FjaGVzLCBjaHVuaywgMCk7XG4gIH1cblxuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCB7IE4sIGhlaWdodHMsIHRvcHMsIHVuZGVyd2F0ZXIgfSA9IGNhY2hlO1xuICBjb25zdCBzYW1wbGUgPSB7XG4gICAgTixcbiAgICBoZWlnaHRzOiBuZXcgSW50MTZBcnJheShoZWlnaHRzKSxcbiAgICB0b3BzOiBuZXcgVWludDhBcnJheSh0b3BzKSxcbiAgICB1bmRlcndhdGVyOiBuZXcgVWludDhBcnJheSh1bmRlcndhdGVyKSxcbiAgICBzYW1wbGVNczogY2FjaGUuc2FtcGxlTXMsXG4gIH07XG4gIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgIGNvbnN0IHggPSBNYXRoLnJvdW5kKC1IQUxGICsgKGkgKyAwLjUpICogc3RlcCk7XG4gICAgICBjb25zdCB6ID0gTWF0aC5yb3VuZCgtSEFMRiArIChqICsgMC41KSAqIHN0ZXApO1xuICAgICAgY29uc3QgY2h1bmsgPSBjaHVua0tleSh3b3JsZFRvQ2h1bmtYKHgpLCB3b3JsZFRvQ2h1bmtaKHopKTtcbiAgICAgIGlmICghd29ybGQuZWRpdHMuZ2V0KGNodW5rKT8uc2l6ZSkgY29udGludWU7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBjb25zdCBlZGl0ZWQgPSBtYWNyb0NvbHVtbih3b3JsZCwgY2FjaGVzLCBjaHVuaywgKHggKyBIQUxGKSAqIFdPUkxEX1NJWkUgKyB6ICsgSEFMRik7XG4gICAgICBpZiAoIWVkaXRlZCkgY29udGludWU7XG4gICAgICBzYW1wbGUuaGVpZ2h0c1tpZHhdID0gZWRpdGVkLmhlaWdodDtcbiAgICAgIHNhbXBsZS50b3BzW2lkeF0gPSBlZGl0ZWQudG9wO1xuICAgICAgc2FtcGxlLnVuZGVyd2F0ZXJbaWR4XSA9IHNhbXBsZS5oZWlnaHRzW2lkeF0gPCBTRUFfTEVWRUwgPyAxIDogMDtcbiAgICB9XG4gIH1cbiAgc2FtcGxlLnNhbXBsZU1zID0gcGVyZm9ybWFuY2Uubm93KCkgLSB0MDtcbiAgY2FjaGVzLmVkaXRlZC5zZXQoa2V5LCBzYW1wbGUpO1xuICByZXR1cm4gc2FtcGxlO1xufVxuXG5mdW5jdGlvbiBtYWNyb1NhbXBsZXMod29ybGQ6IFdvcmxkLCBzdGVwOiBudW1iZXIpOiBNYWNyb1NhbXBsZUNhY2hlIHtcbiAgbGV0IGNhY2hlcyA9IG1hY3JvU2FtcGxlQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZXMpIHtcbiAgICBjYWNoZXMgPSB7IGJhc2U6IG5ldyBNYXAoKSwgZWRpdGVkOiBuZXcgTWFwKCksIGNvbHVtbnM6IG5ldyBNYXAoKSwgcmV2aXNpb246IC0xIH07XG4gICAgbWFjcm9TYW1wbGVDYWNoZS5zZXQod29ybGQsIGNhY2hlcyk7XG4gIH1cbiAgc3luY01hY3JvQ29sdW1ucyh3b3JsZCwgY2FjaGVzKTtcbiAgY29uc3QgY2FjaGVkID0gY2FjaGVzLmJhc2UuZ2V0KHN0ZXApO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gZWRpdGVkTWFjcm9TYW1wbGVzKHdvcmxkLCBzdGVwLCBjYWNoZWQpO1xuXG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IE4gPSBNYXRoLmNlaWwoV09STERfU0laRSAvIHN0ZXApO1xuICBjb25zdCBoZWlnaHRzID0gbmV3IEludDE2QXJyYXkoTiAqIE4pO1xuICBjb25zdCB0b3BzID0gbmV3IFVpbnQ4QXJyYXkoTiAqIE4pO1xuICBjb25zdCB1bmRlcndhdGVyID0gbmV3IFVpbnQ4QXJyYXkoTiAqIE4pO1xuICBjb25zdCBjZWxsWCA9IChpOiBudW1iZXIpID0+IC1IQUxGICsgKGkgKyAwLjUpICogc3RlcDtcbiAgY29uc3QgY2VsbFogPSAoajogbnVtYmVyKSA9PiAtSEFMRiArIChqICsgMC41KSAqIHN0ZXA7XG5cbiAgZm9yIChsZXQgaiA9IDA7IGogPCBOOyBqKyspIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgY29uc3QgeCA9IGNlbGxYKGkpLCB6ID0gY2VsbFooaik7XG4gICAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBNYXRoLnJvdW5kKHgpLCBNYXRoLnJvdW5kKHopKTtcbiAgICAgIGNvbnN0IGlkeCA9IGogKiBOICsgaTtcbiAgICAgIGhlaWdodHNbaWR4XSA9IGg7XG4gICAgICBpZiAoaCA8IFNFQV9MRVZFTCkgdW5kZXJ3YXRlcltpZHhdID0gMTtcbiAgICB9XG4gIH1cblxuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBpZiAodW5kZXJ3YXRlcltpZHhdKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGggPSBoZWlnaHRzW2lkeF07XG4gICAgICBjb25zdCB4ID0gY2VsbFgoaSksIHogPSBjZWxsWihqKTtcbiAgICAgIGxldCBzbG9wZSA9IDA7XG4gICAgICBsZXQgbmVhcldhdGVyID0gZmFsc2U7XG4gICAgICBjb25zdCBucyA9IFtbLTEsIDBdLCBbMSwgMF0sIFswLCAtMV0sIFswLCAxXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIG5zKSB7XG4gICAgICAgIGNvbnN0IG54ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oTiAtIDEsIGkgKyBkeCkpO1xuICAgICAgICBjb25zdCBueiA9IE1hdGgubWF4KDAsIE1hdGgubWluKE4gLSAxLCBqICsgZHopKTtcbiAgICAgICAgY29uc3QgbmggPSBoZWlnaHRzW256ICogTiArIG54XTtcbiAgICAgICAgc2xvcGUgPSBNYXRoLm1heChzbG9wZSwgTWF0aC5hYnMoaCAtIG5oKSk7XG4gICAgICAgIGlmIChuaCA8IFNFQV9MRVZFTCArIDEpIG5lYXJXYXRlciA9IHRydWU7XG4gICAgICB9XG4gICAgICB0b3BzW2lkeF0gPSBiYXNlVG9wTWF0ZXJpYWxGb3Iod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgICAgIE1hdGgucm91bmQoeCksIE1hdGgucm91bmQoeiksIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNhY2hlOiBNYWNyb1NhbXBsZUNhY2hlID0ge1xuICAgIE4sIGhlaWdodHMsIHRvcHMsIHVuZGVyd2F0ZXIsXG4gICAgc2FtcGxlTXM6IHBlcmZvcm1hbmNlLm5vdygpIC0gdDAsXG4gIH07XG4gIGNhY2hlcy5iYXNlLnNldChzdGVwLCBjYWNoZSk7XG4gIHJldHVybiBlZGl0ZWRNYWNyb1NhbXBsZXMod29ybGQsIHN0ZXAsIGNhY2hlKTtcbn1cblxuLyoqIEF1dGhvcml0YXRpdmUgbWFjcm8tZ3JpZCB2YWx1ZSBhdCBhIHdvcmxkIGNvbHVtbiAoc3RlcCBkZWZhdWx0cyB0byA4IG0pLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBzdGVwID0gOCk6IE1hY3JvVGVycmFpblNhbXBsZSB7XG4gIGNvbnN0IGNhY2hlID0gbWFjcm9TYW1wbGVzKHdvcmxkLCBzdGVwKTtcbiAgY29uc3QgaSA9IE1hdGgubWF4KDAsIE1hdGgubWluKGNhY2hlLk4gLSAxLCBNYXRoLmZsb29yKCh4ICsgSEFMRikgLyBzdGVwKSkpO1xuICBjb25zdCBqID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oY2FjaGUuTiAtIDEsIE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIHN0ZXApKSk7XG4gIGNvbnN0IGlkeCA9IGogKiBjYWNoZS5OICsgaTtcbiAgcmV0dXJuIHtcbiAgICB4OiAtSEFMRiArIChpICsgMC41KSAqIHN0ZXAsXG4gICAgejogLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwLFxuICAgIGhlaWdodDogY2FjaGUuaGVpZ2h0c1tpZHhdLCB0b3A6IGNhY2hlLnRvcHNbaWR4XSBhcyBNYXRJZCxcbiAgICB1bmRlcndhdGVyOiBjYWNoZS51bmRlcndhdGVyW2lkeF0gIT09IDAsXG4gIH07XG59XG5cbi8qKlxuICogRmFyIGxhbmRzY2FwZSBMT0QgZGVyaXZlZCBmcm9tIHRoZSBzYW1lIGRldGVybWluaXN0aWMgc3VyZmFjZSBzYW1wbGVyLlxuICogQ2VsbHMgYmVsb3cgc2VhIGxldmVsIGFyZSBvbWl0dGVkOiB0aGUgb3BhcXVlIHdhdGVyIHN1cmZhY2UgaXMgdGhlIG9ubHlcbiAqIHdhdGVyIHJlYWQsIHNvIHRoZSBmaW5pdGUgMjA0OCBtIHdvcmxkIGNhbm5vdCBhcHBlYXIgYXMgYSBzcXVhcmUgc2VhYmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRNYWNyb01lc2god29ybGQ6IFdvcmxkLCBvcHRzOiBNYWNyb09wdGlvbnMpOiBNYWNyb1Jlc3VsdCB7XG4gIGNvbnN0IHRvdGFsVDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgeyBzdGVwLCBob2xlIH0gPSBvcHRzO1xuICBjb25zdCBjYWNoZUtleSA9IGAke3N0ZXB9OiR7bWFjcm9FZGl0S2V5KHdvcmxkKX1gO1xuICBjb25zdCBzYW1wbGVDYWNoZWQgPSBtYWNyb1NhbXBsZUNhY2hlLmdldCh3b3JsZCk/LmVkaXRlZC5oYXMoY2FjaGVLZXkpID8/IGZhbHNlO1xuICBjb25zdCBjYWNoZSA9IG1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCk7XG4gIGNvbnN0IHsgTiwgaGVpZ2h0cywgdG9wcywgdW5kZXJ3YXRlciB9ID0gY2FjaGU7XG4gIGNvbnN0IGhvbGVDZWxsID0gbmV3IFVpbnQ4QXJyYXkoTiAqIE4pO1xuICBjb25zdCBjZWxsWCA9IChpOiBudW1iZXIpID0+IC1IQUxGICsgKGkgKyAwLjUpICogc3RlcDtcbiAgY29uc3QgY2VsbFogPSAoajogbnVtYmVyKSA9PiAtSEFMRiArIChqICsgMC41KSAqIHN0ZXA7XG5cbiAgaWYgKGhvbGUpIHtcbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgICAgY29uc3QgeCA9IGNlbGxYKGkpLCB6ID0gY2VsbFooaik7XG4gICAgICAgIGlmICh4ID4gaG9sZS5taW5YICYmIHggPCBob2xlLm1heFggJiYgeiA+IGhvbGUubWluWiAmJiB6IDwgaG9sZS5tYXhaKSB7XG4gICAgICAgICAgaG9sZUNlbGxbaiAqIE4gKyBpXSA9IDE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBzYW1wbGVNcyA9IHNhbXBsZUNhY2hlZCA/IDAgOiBjYWNoZS5zYW1wbGVNcztcbiAgLy8gV2l0aCBhIGZvY3VzIHRoZSBtZXNoIGlzIHNwbGl0IGludG8gTUFDUk9fVElMRSBzcXVhcmUgdGlsZXMgc28gdGhlIHZpZXdcbiAgLy8gY2FuIHNraXAgdGlsZXMgb3V0c2lkZSB0aGUgY2FtZXJhIGZydXN0dW0gKFZveGVsVGVycmFpblZpZXcuY3VsbE1hY3JvKS5cbiAgLy8gV2l0aG91dCBvbmUgKG1hcCBtb2RlLCB0ZXN0cykgaXQgc3RheXMgYSBzaW5nbGUgbWVzaC5cbiAgY29uc3QgdGlsZUNlbGxzID0gb3B0cy5mb2N1cyA/IE1hdGgubWF4KDEsIE1hdGgucm91bmQoTUFDUk9fVElMRSAvIHN0ZXApKSA6IE47XG4gIGNvbnN0IHRpbGVzUGVyU2lkZSA9IE1hdGguY2VpbChOIC8gdGlsZUNlbGxzKTtcbiAgdHlwZSBUaWxlQnVmZmVycyA9IHsgcG9zaXRpb25zOiBudW1iZXJbXTsgbm9ybWFsczogbnVtYmVyW107IGNvbG9yczogbnVtYmVyW107IGluZGljZXM6IG51bWJlcltdIH07XG4gIGNvbnN0IHRpbGVCdWZmZXJzOiBUaWxlQnVmZmVyc1tdID0gW107XG4gIGZvciAobGV0IHQgPSAwOyB0IDwgdGlsZXNQZXJTaWRlICogdGlsZXNQZXJTaWRlOyB0KyspIHRpbGVCdWZmZXJzLnB1c2goeyBwb3NpdGlvbnM6IFtdLCBub3JtYWxzOiBbXSwgY29sb3JzOiBbXSwgaW5kaWNlczogW10gfSk7XG4gIGxldCBidWYgPSB0aWxlQnVmZmVyc1swXTtcblxuICBjb25zdCBwdXNoUXVhZCA9IChwOiBudW1iZXJbXVtdLCBuOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sIGNvbG9yOiBUSFJFRS5Db2xvcikgPT4ge1xuICAgIGNvbnN0IHsgcG9zaXRpb25zLCBub3JtYWxzLCBjb2xvcnMsIGluZGljZXMgfSA9IGJ1ZjtcbiAgICBjb25zdCBiYXNlID0gcG9zaXRpb25zLmxlbmd0aCAvIDM7XG4gICAgZm9yIChjb25zdCB2IG9mIHApIHtcbiAgICAgIHBvc2l0aW9ucy5wdXNoKHZbMF0sIHZbMV0sIHZbMl0pO1xuICAgICAgbm9ybWFscy5wdXNoKG5bMF0sIG5bMV0sIG5bMl0pO1xuICAgICAgY29sb3JzLnB1c2goY29sb3IuciwgY29sb3IuZywgY29sb3IuYik7XG4gICAgfVxuICAgIGluZGljZXMucHVzaChiYXNlLCBiYXNlICsgMSwgYmFzZSArIDIsIGJhc2UsIGJhc2UgKyAyLCBiYXNlICsgMyk7XG4gIH07XG5cbiAgY29uc3QgY2VsbFNoYWRlID0gKGk6IG51bWJlciwgajogbnVtYmVyKSA9PiAwLjk0ICsgMC4xMiAqIGhhc2gyaShpLCBqLCB3b3JsZC5zZWVkICsgNDAxKTtcblxuICBjb25zdCB0b3BDb2xvciA9ICh0b3A6IE1hdElkLCBoOiBudW1iZXIsIGk6IG51bWJlciwgajogbnVtYmVyKTogVEhSRUUuQ29sb3IgPT4ge1xuICAgIGNvbnN0IHNoYWRlID0gY2VsbFNoYWRlKGksIGopO1xuICAgIGNvbnN0IG1vaXN0ID0gZmJtMihjZWxsWChpKSAvIDEzMCwgY2VsbFooaikgLyAxMzAsIHdvcmxkLnNlZWQgKyA2MDEsIDMpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gQ09MLnNhbmQuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihzaGFkZSAqIDAuOTApO1xuICAgIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBDT0wuZ3JhdmVsLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSkge1xuICAgICAgcmV0dXJuIENPTC5zdG9uZVNoYWRlLmNsb25lKCkubGVycChDT0wuc3RvbmVCLCAwLjM1ICsgMC4yNSAqIHNoYWRlKS5tdWx0aXBseVNjYWxhcihcbiAgICAgICAgKDAuODIgKyAwLjE0ICogTWF0aC5taW4oMSwgTWF0aC5tYXgoMCwgKGggKyA4KSAvIDcwKSkpICogKDAuOTIgKyAwLjA4ICogc2hhZGUpLFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHRvcCA9PT0gTUFULk9SRSkgcmV0dXJuIENPTC5vcmUuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihzaGFkZSk7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNOT1cpIHJldHVybiBDT0wuc25vdy5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKDAuOTQgKyAwLjA4ICogc2hhZGUpO1xuICAgIC8vIEZvcmVzdC1mbG9vciBwYXRjaGVzIGJyZWFrIHVwIHRoZSB1bmlmb3JtIGdyZWVuIG9mIHRoZSBmYXIgTE9ELiBUaGV5XG4gICAgLy8gYXJlIGEgY29sb3VyIGFwcHJveGltYXRpb24sIG5vdCBleHRyYSBnZW9tZXRyeTsgdGhlIG5lYXIgcmluZyBoYXMgcmVhbFxuICAgIC8vIFN0eWwgdHJlZXMuXG4gICAgcmV0dXJuIENPTC5ncmFzc1RvcFtoZWlnaHRCYW5kKGgpXS5jbG9uZSgpXG4gICAgICAubGVycChDT0wuZ3Jhc3NDYXAsIDAuMTIgKyAwLjM0ICogbW9pc3QpXG4gICAgICAubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICB9O1xuXG4gIGNvbnN0IHNpZGVDb2xvciA9ICh0b3A6IE1hdElkLCBoOiBudW1iZXIsIG5oOiBudW1iZXIsIGk6IG51bWJlciwgajogbnVtYmVyKTogVEhSRUUuQ29sb3IgPT4ge1xuICAgIGNvbnN0IGRyb3AgPSBoIC0gbmg7XG4gICAgY29uc3Qgc2hhZGUgPSAwLjkwICsgMC4xMCAqIGhhc2gyaShpLCBqLCB3b3JsZC5zZWVkICsgNDAyKTtcbiAgICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIENPTC5zYW5kLmNsb25lKCkubGVycChDT0wuc3RvbmVCLCBkcm9wID4gNSA/IDAuNTUgOiAwLjIpLm11bHRpcGx5U2NhbGFyKHNoYWRlICogMC45Mik7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNUT05FKSB7XG4gICAgICByZXR1cm4gQ09MLnN0b25lU2hhZGUuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihcbiAgICAgICAgKDAuODAgKyAwLjE2ICogTWF0aC5taW4oMSwgTWF0aC5tYXgoMCwgKGggKyA4KSAvIDcwKSkpICogc2hhZGUsXG4gICAgICApO1xuICAgIH1cbiAgICAvLyBBIGdyYXNzLXRvcHBlZCBiYW5rIGlzIG5vdCBhIHN0b25lIGNsaWZmLCBob3dldmVyIHRhbGwgdGhlIDggbSBtYWNyb1xuICAgIC8vIGNlbGwgbWFrZXMgaXQgbG9vay4gS2VlcGluZyB0aGUgc2lkZSBpbiB0aGUgc29pbCByYW5nZSByZW1vdmVkIHRoZVxuICAgIC8vIGJyaWdodCB3aGl0ZSBxdWFycnkgd2FsbHMgYXJvdW5kIHRoZSByaXZlciBhbmQgbGFrZSBpbiB0aGUgd2lkZSB2aWV3LlxuICAgIGlmIChkcm9wID4gNCkgcmV0dXJuIENPTC5ncmFzc0NhcC5jbG9uZSgpLmxlcnAoQ09MLm9jaHJlLCAwLjU1KS5tdWx0aXBseVNjYWxhcihzaGFkZSk7XG4gICAgcmV0dXJuIENPTC5ncmFzc0NhcC5jbG9uZSgpLmxlcnAoQ09MLnN0b25lQiwgMC4yMikubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICB9O1xuXG4gIC8vIENlbGwgbGF5b3V0LiBXaXRob3V0IGEgZm9jdXMgKG1hcCBtb2RlKSBldmVyeSBjZWxsIGlzIG9uZSBiYXNlIGNlbGwuIEluXG4gIC8vIHRoZSB3b3JsZCB2aWV3LCA0eDQtY2VsbCBibG9ja3MgZmFyIGZyb20gdGhlIGZvY3VzIG1lcmdlIGludG8gMngyIG9yIDR4NFxuICAvLyBjZWxsczogYSBmYXIgY2VsbCBjb3ZlcnMgdGhlIHNhbWUgZ3JvdW5kIHdpdGggb25lIHRvcCBhbmQgZmV3ZXIgc2lkZXMuXG4gIC8vIENvYXJzZSBjZWxscyB0YWtlIHRoZSBoaWdoZXN0IGxhbmQgaGVpZ2h0IChrZWVwcyByaWRnZXMgYW5kIHBlYWtzIG9uIHRoZVxuICAvLyBza3lsaW5lKSwgdGhlIG1hdGVyaWFsIG9mIHRoYXQgaGlnaGVzdCBzdWItY2VsbCBhbmQgdGhlIG1lYW4gdG9wIGNvbG91clxuICAvLyBvZiB0aGVpciBsYW5kIHN1Yi1jZWxsczsgYSBjb2Fyc2UgY2VsbCB0aGF0IGlzIG1vc3RseSBzZWEgc3RheXMgc2VhLlxuICBjb25zdCB0aWVycyA9IG9wdHMuZm9jdXMgPyAob3B0cy50aWVycyA/PyBERUZBVUxUX01BQ1JPX1RJRVJTKSA6IG51bGw7XG4gIGNvbnN0IEIgPSA0O1xuICBjb25zdCBsZXZlbE9mID0gKGJpOiBudW1iZXIsIGJqOiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGlmICghdGllcnMgfHwgIW9wdHMuZm9jdXMpIHJldHVybiAxO1xuICAgIGNvbnN0IGN4ID0gLUhBTEYgKyAoYmkgKyAwLjUpICogQiAqIHN0ZXAsIGN6ID0gLUhBTEYgKyAoYmogKyAwLjUpICogQiAqIHN0ZXA7XG4gICAgY29uc3QgZCA9IE1hdGgubWF4KE1hdGguYWJzKGN4IC0gb3B0cy5mb2N1cy54KSwgTWF0aC5hYnMoY3ogLSBvcHRzLmZvY3VzLnopKSAtIEIgKiBzdGVwIC8gMjtcbiAgICByZXR1cm4gZCA8PSB0aWVycy5maW5lID8gMSA6IGQgPD0gdGllcnMubWlkID8gMiA6IDQ7XG4gIH07XG4gIC8vIFJlbmRlciBoZWlnaHQgcGVyIGJhc2UgY2VsbCAob2YgdGhlIGNlbGwgdGhhdCBjb3ZlcnMgaXQpIGFuZCB3aGV0aGVyXG4gIC8vIHRoYXQgY2VsbCBpcyBkcmF3biBhcyBsYW5kLlxuICBjb25zdCByZW5kZXJIID0gbmV3IEZsb2F0MzJBcnJheShOICogTik7XG4gIGNvbnN0IHJlbmRlckxhbmQgPSBuZXcgVWludDhBcnJheShOICogTik7XG4gIHR5cGUgQ2VsbCA9IHsgaTogbnVtYmVyOyBqOiBudW1iZXI7IGs6IG51bWJlcjsgaDogbnVtYmVyOyB0b3A6IE1hdElkOyBjb2xvcjogVEhSRUUuQ29sb3IgfTtcbiAgY29uc3QgY2VsbHM6IENlbGxbXSA9IFtdO1xuICBjb25zdCBjb2xvckFjYyA9IG5ldyBUSFJFRS5Db2xvcigpO1xuICBmb3IgKGxldCBiaiA9IDA7IGJqIDwgTjsgYmogKz0gQikge1xuICAgIGZvciAobGV0IGJpID0gMDsgYmkgPCBOOyBiaSArPSBCKSB7XG4gICAgICBjb25zdCBrID0gbGV2ZWxPZihiaSAvIEIsIGJqIC8gQik7XG4gICAgICBmb3IgKGxldCBqMCA9IGJqOyBqMCA8IE1hdGgubWluKE4sIGJqICsgQik7IGowICs9IGspIHtcbiAgICAgICAgZm9yIChsZXQgaTAgPSBiaTsgaTAgPCBNYXRoLm1pbihOLCBiaSArIEIpOyBpMCArPSBrKSB7XG4gICAgICAgICAgbGV0IGxhbmQgPSAwLCB0b3RhbCA9IDAsIGJlc3QgPSAtMTtcbiAgICAgICAgICBjb2xvckFjYy5zZXRSR0IoMCwgMCwgMCk7XG4gICAgICAgICAgZm9yIChsZXQgaiA9IGowOyBqIDwgTWF0aC5taW4oTiwgajAgKyBrKTsgaisrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gaTA7IGkgPCBNYXRoLm1pbihOLCBpMCArIGspOyBpKyspIHtcbiAgICAgICAgICAgICAgY29uc3QgaWR4ID0gaiAqIE4gKyBpO1xuICAgICAgICAgICAgICB0b3RhbCsrO1xuICAgICAgICAgICAgICBpZiAoaG9sZUNlbGxbaWR4XSB8fCB1bmRlcndhdGVyW2lkeF0pIGNvbnRpbnVlO1xuICAgICAgICAgICAgICBsYW5kKys7XG4gICAgICAgICAgICAgIGlmIChiZXN0IDwgMCB8fCBoZWlnaHRzW2lkeF0gPiBoZWlnaHRzW2Jlc3RdKSBiZXN0ID0gaWR4O1xuICAgICAgICAgICAgICBpZiAoayA+IDEpIGNvbG9yQWNjLmFkZCh0b3BDb2xvcih0b3BzW2lkeF0gYXMgTWF0SWQsIGhlaWdodHNbaWR4XSwgaSwgaikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoYmVzdCA8IDAgfHwgbGFuZCAqIDIgPCB0b3RhbCkgY29udGludWU7XG4gICAgICAgICAgY29uc3QgaCA9IGhlaWdodHNbYmVzdF07XG4gICAgICAgICAgY29uc3QgdG9wID0gdG9wc1tiZXN0XSBhcyBNYXRJZDtcbiAgICAgICAgICBjb25zdCBjb2xvciA9IGsgPiAxID8gY29sb3JBY2MuY2xvbmUoKS5tdWx0aXBseVNjYWxhcigxIC8gbGFuZCkgOiB0b3BDb2xvcih0b3AsIGgsIGkwLCBqMCk7XG4gICAgICAgICAgY2VsbHMucHVzaCh7IGk6IGkwLCBqOiBqMCwgaywgaCwgdG9wLCBjb2xvciB9KTtcbiAgICAgICAgICBmb3IgKGxldCBqID0gajA7IGogPCBNYXRoLm1pbihOLCBqMCArIGspOyBqKyspIHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBpMDsgaSA8IE1hdGgubWluKE4sIGkwICsgayk7IGkrKykge1xuICAgICAgICAgICAgICByZW5kZXJIW2ogKiBOICsgaV0gPSBoO1xuICAgICAgICAgICAgICByZW5kZXJMYW5kW2ogKiBOICsgaV0gPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKiBIZWlnaHQgYSBzaWRlIGZhY2UgZHJvcHMgdG8gYmVzaWRlIGJhc2UgY2VsbCAobmksIG5qKSwgb3IgbnVsbCBmb3Igbm8gZmFjZS4gKi9cbiAgY29uc3QgbmVpZ2hib3VyRHJvcCA9IChuaTogbnVtYmVyLCBuajogbnVtYmVyKTogbnVtYmVyIHwgbnVsbCA9PiB7XG4gICAgLy8gVGhlIHdvcmxkIGVkZ2UgaXMgb2NlYW4uIERvIG5vdCBkcmF3IGEgc2lkZSBmYWNlIGRvd24gdG8gdGhlIHdhdGVyXG4gICAgLy8gaGVyZTsgdGhlIG9wYXF1ZSB3YXRlciBwbGFuZSBhbHJlYWR5IGNvdmVycyB0aGUgYm91bmRhcnkuXG4gICAgaWYgKG5pIDwgMCB8fCBuaiA8IDAgfHwgbmkgPj0gTiB8fCBuaiA+PSBOKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBuaWR4ID0gbmogKiBOICsgbmk7XG4gICAgaWYgKGhvbGVDZWxsW25pZHhdKSByZXR1cm4gbnVsbDtcbiAgICBpZiAocmVuZGVyTGFuZFtuaWR4XSkgcmV0dXJuIHJlbmRlckhbbmlkeF07XG4gICAgLy8gU2VhLCBvciBhIGxhbmQgc3ViLWNlbGwgb2YgYSBjb2Fyc2UgY2VsbCB0aGF0IGlzIG1vc3RseSBzZWE6IHRoZSBmYWNlXG4gICAgLy8gcnVucyBkb3duIHRvIHRoZSB3YXRlciBzbyBubyBzZWUtdGhyb3VnaCBnYXAgb3BlbnMgYWJvdmUgaXQuXG4gICAgcmV0dXJuIHVuZGVyd2F0ZXJbbmlkeF0gPyBNYXRoLm1heChTRUFfTEVWRUwgLSAwLjUsIGhlaWdodHNbbmlkeF0pIDogU0VBX0xFVkVMIC0gMC41O1xuICB9O1xuXG4gIGZvciAoY29uc3QgeyBpLCBqLCBrLCBoLCB0b3AsIGNvbG9yIH0gb2YgY2VsbHMpIHtcbiAgICBidWYgPSB0aWxlQnVmZmVyc1tNYXRoLmZsb29yKGogLyB0aWxlQ2VsbHMpICogdGlsZXNQZXJTaWRlICsgTWF0aC5mbG9vcihpIC8gdGlsZUNlbGxzKV07XG4gICAgY29uc3QgeDAgPSAtSEFMRiArIGkgKiBzdGVwLCB4MSA9IE1hdGgubWluKEhBTEYsIHgwICsgayAqIHN0ZXApO1xuICAgIGNvbnN0IHowID0gLUhBTEYgKyBqICogc3RlcCwgejEgPSBNYXRoLm1pbihIQUxGLCB6MCArIGsgKiBzdGVwKTtcbiAgICBjb25zdCBzcGFuID0gTWF0aC5taW4oaywgTiAtIGkpLCBzcGFuWiA9IE1hdGgubWluKGssIE4gLSBqKTtcblxuICAgIHB1c2hRdWFkKFxuICAgICAgW1t4MCwgaCwgejBdLCBbeDAsIGgsIHoxXSwgW3gxLCBoLCB6MV0sIFt4MSwgaCwgejBdXSxcbiAgICAgIFswLCAxLCAwXSxcbiAgICAgIGNvbG9yLFxuICAgICk7XG5cbiAgICAvLyBPbmUgc2lkZSBmYWNlIHBlciBydW4gb2YgZXF1YWwgZHJvcCBoZWlnaHQgYWxvbmcgZWFjaCBlZGdlLiBDb2Fyc2VcbiAgICAvLyBjZWxscyBiZXNpZGUgZmluZXIgb25lcyBnZXQgc2V2ZXJhbCBydW5zLCBzbyBubyBnYXAgb3BlbnMgYXQgYSB0aWVyXG4gICAgLy8gYm91bmRhcnk7IGVxdWFsLXNpemUgbmVpZ2hib3VycyBnaXZlIGV4YWN0bHkgb25lIGZhY2UgYXMgYmVmb3JlLlxuICAgIGNvbnN0IGVkZ2UgPSAoc2lkZTogMCB8IDEgfCAyIHwgMykgPT4ge1xuICAgICAgY29uc3QgbiA9IHNpZGUgPCAyID8gc3BhblogOiBzcGFuO1xuICAgICAgbGV0IHJ1blN0YXJ0ID0gMCwgcnVuSDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gICAgICBjb25zdCBmbHVzaCA9IChlbmQ6IG51bWJlcikgPT4ge1xuICAgICAgICBpZiAocnVuSCA9PT0gbnVsbCB8fCBoIDw9IHJ1bkgpIHJldHVybjtcbiAgICAgICAgY29uc3QgbmggPSBydW5IO1xuICAgICAgICBjb25zdCBjb2wgPSBzaWRlQ29sb3IodG9wLCBoLCBuaCwgaSwgaik7XG4gICAgICAgIGlmIChzaWRlID09PSAwKSB7XG4gICAgICAgICAgY29uc3QgemEgPSB6MCArIHJ1blN0YXJ0ICogc3RlcCwgemIgPSB6MCArIGVuZCAqIHN0ZXA7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MSwgbmgsIHphXSwgW3gxLCBoLCB6YV0sIFt4MSwgaCwgemJdLCBbeDEsIG5oLCB6Yl1dLCBbMSwgMCwgMF0sIGNvbCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2lkZSA9PT0gMSkge1xuICAgICAgICAgIGNvbnN0IHphID0gejAgKyBydW5TdGFydCAqIHN0ZXAsIHpiID0gejAgKyBlbmQgKiBzdGVwO1xuICAgICAgICAgIHB1c2hRdWFkKFtbeDAsIG5oLCB6YV0sIFt4MCwgbmgsIHpiXSwgW3gwLCBoLCB6Yl0sIFt4MCwgaCwgemFdXSwgWy0xLCAwLCAwXSwgY29sKTtcbiAgICAgICAgfSBlbHNlIGlmIChzaWRlID09PSAyKSB7XG4gICAgICAgICAgY29uc3QgeGEgPSB4MCArIHJ1blN0YXJ0ICogc3RlcCwgeGIgPSB4MCArIGVuZCAqIHN0ZXA7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4YSwgbmgsIHoxXSwgW3hiLCBuaCwgejFdLCBbeGIsIGgsIHoxXSwgW3hhLCBoLCB6MV1dLCBbMCwgMCwgMV0sIGNvbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgeGEgPSB4MCArIHJ1blN0YXJ0ICogc3RlcCwgeGIgPSB4MCArIGVuZCAqIHN0ZXA7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4YSwgbmgsIHowXSwgW3hhLCBoLCB6MF0sIFt4YiwgaCwgejBdLCBbeGIsIG5oLCB6MF1dLCBbMCwgMCwgLTFdLCBjb2wpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgZm9yIChsZXQgdCA9IDA7IHQgPCBuOyB0KyspIHtcbiAgICAgICAgY29uc3QgbmggPSBzaWRlID09PSAwID8gbmVpZ2hib3VyRHJvcChpICsgc3BhbiwgaiArIHQpXG4gICAgICAgICAgOiBzaWRlID09PSAxID8gbmVpZ2hib3VyRHJvcChpIC0gMSwgaiArIHQpXG4gICAgICAgICAgICA6IHNpZGUgPT09IDIgPyBuZWlnaGJvdXJEcm9wKGkgKyB0LCBqICsgc3BhblopXG4gICAgICAgICAgICAgIDogbmVpZ2hib3VyRHJvcChpICsgdCwgaiAtIDEpO1xuICAgICAgICBpZiAodCA+IDAgJiYgbmggPT09IHJ1bkgpIGNvbnRpbnVlO1xuICAgICAgICBmbHVzaCh0KTtcbiAgICAgICAgcnVuU3RhcnQgPSB0OyBydW5IID0gbmg7XG4gICAgICB9XG4gICAgICBmbHVzaChuKTtcbiAgICB9O1xuICAgIGVkZ2UoMCk7IGVkZ2UoMSk7IGVkZ2UoMik7IGVkZ2UoMyk7XG4gIH1cblxuICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHsgdmVydGV4Q29sb3JzOiB0cnVlLCBmbGF0U2hhZGluZzogdHJ1ZSB9KTtcbiAgY29uc3QgbWVzaGVzOiBUSFJFRS5NZXNoW10gPSBbXTtcbiAgbGV0IHRyaWFuZ2xlcyA9IDA7XG4gIGlmICh0aWxlQnVmZmVycy5sZW5ndGggPiAxKSB7XG4gICAgLy8gVGlsZWQ6IGV2ZXJ5IHRpbGUncyBxdWFkcyBnbyBpbnRvIE9ORSBzaGFyZWQgc2V0IG9mIHZlcnRleCBhbmQgaW5kZXhcbiAgICAvLyBidWZmZXJzLCB0aWxlIGFmdGVyIHRpbGUgaW4gcm93LW1ham9yIG9yZGVyLiBFYWNoIHRpbGUgbWVzaCBpcyBhIHZpZXdcbiAgICAvLyBvZiBpdHMgb3duIGluZGV4IHJhbmdlIChkcmF3UmFuZ2UpIHdpdGggaXRzIG93biBib3VuZGluZyBib3gsIHNvXG4gICAgLy8gY3VsbE1hY3JvIGNhbiBoaWRlIG9mZi1zY3JlZW4gdGlsZXMgYW5kIHRoZW4gZHJhdyBlYWNoIHJ1biBvZlxuICAgIC8vIGNvbnNlY3V0aXZlIHZpc2libGUgdGlsZXMgd2l0aCBhIHNpbmdsZSBjYWxsIGJ5IHdpZGVuaW5nIHRoZSBmaXJzdFxuICAgIC8vIHRpbGUncyByYW5nZS4gR1BVIG1lbW9yeSBpcyB0aGUgc2FtZSBhcyBvbmUgbWVzaC5cbiAgICBsZXQgdmVydGV4Q291bnQgPSAwLCBpbmRleENvdW50ID0gMDtcbiAgICBmb3IgKGNvbnN0IGIgb2YgdGlsZUJ1ZmZlcnMpIHsgdmVydGV4Q291bnQgKz0gYi5wb3NpdGlvbnMubGVuZ3RoIC8gMzsgaW5kZXhDb3VudCArPSBiLmluZGljZXMubGVuZ3RoOyB9XG4gICAgY29uc3QgcG9zaXRpb24gPSBuZXcgRmxvYXQzMkFycmF5KHZlcnRleENvdW50ICogMyksIG5vcm1hbCA9IG5ldyBGbG9hdDMyQXJyYXkodmVydGV4Q291bnQgKiAzKSwgY29sb3IgPSBuZXcgRmxvYXQzMkFycmF5KHZlcnRleENvdW50ICogMyk7XG4gICAgY29uc3QgaW5kZXggPSB2ZXJ0ZXhDb3VudCA+IDY1NTM1ID8gbmV3IFVpbnQzMkFycmF5KGluZGV4Q291bnQpIDogbmV3IFVpbnQxNkFycmF5KGluZGV4Q291bnQpO1xuICAgIGNvbnN0IHJhbmdlczogQXJyYXk8eyB0OiBudW1iZXI7IHN0YXJ0OiBudW1iZXI7IGNvdW50OiBudW1iZXI7IGJveDogVEhSRUUuQm94MyB9PiA9IFtdO1xuICAgIGxldCB2byA9IDAsIGlvID0gMDtcbiAgICBmb3IgKGxldCB0ID0gMDsgdCA8IHRpbGVCdWZmZXJzLmxlbmd0aDsgdCsrKSB7XG4gICAgICBjb25zdCBiID0gdGlsZUJ1ZmZlcnNbdF07XG4gICAgICBpZiAoYi5pbmRpY2VzLmxlbmd0aCA9PT0gMCkgY29udGludWU7XG4gICAgICBwb3NpdGlvbi5zZXQoYi5wb3NpdGlvbnMsIHZvICogMyk7XG4gICAgICBub3JtYWwuc2V0KGIubm9ybWFscywgdm8gKiAzKTtcbiAgICAgIGNvbG9yLnNldChiLmNvbG9ycywgdm8gKiAzKTtcbiAgICAgIGZvciAobGV0IGsgPSAwOyBrIDwgYi5pbmRpY2VzLmxlbmd0aDsgaysrKSBpbmRleFtpbyArIGtdID0gYi5pbmRpY2VzW2tdICsgdm87XG4gICAgICBjb25zdCBib3ggPSBuZXcgVEhSRUUuQm94MygpO1xuICAgICAgZm9yIChsZXQgayA9IDA7IGsgPCBiLnBvc2l0aW9ucy5sZW5ndGg7IGsgKz0gMykge1xuICAgICAgICBfYm94UG9pbnQuc2V0KGIucG9zaXRpb25zW2tdLCBiLnBvc2l0aW9uc1trICsgMV0sIGIucG9zaXRpb25zW2sgKyAyXSk7XG4gICAgICAgIGJveC5leHBhbmRCeVBvaW50KF9ib3hQb2ludCk7XG4gICAgICB9XG4gICAgICByYW5nZXMucHVzaCh7IHQsIHN0YXJ0OiBpbywgY291bnQ6IGIuaW5kaWNlcy5sZW5ndGgsIGJveCB9KTtcbiAgICAgIHZvICs9IGIucG9zaXRpb25zLmxlbmd0aCAvIDM7XG4gICAgICBpbyArPSBiLmluZGljZXMubGVuZ3RoO1xuICAgIH1cbiAgICBjb25zdCBzaGFyZWQgPSB7XG4gICAgICBwb3NpdGlvbjogbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbiwgMyksXG4gICAgICBub3JtYWw6IG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUobm9ybWFsLCAzKSxcbiAgICAgIGNvbG9yOiBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGNvbG9yLCAzKSxcbiAgICAgIGluZGV4OiBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGluZGV4LCAxKSxcbiAgICB9O1xuICAgIGZvciAoY29uc3QgciBvZiByYW5nZXMpIHtcbiAgICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJ1ZmZlckdlb21ldHJ5KCk7XG4gICAgICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgc2hhcmVkLnBvc2l0aW9uKTtcbiAgICAgIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgc2hhcmVkLm5vcm1hbCk7XG4gICAgICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgc2hhcmVkLmNvbG9yKTtcbiAgICAgIGdlb21ldHJ5LnNldEluZGV4KHNoYXJlZC5pbmRleCk7XG4gICAgICBnZW9tZXRyeS5zZXREcmF3UmFuZ2Uoci5zdGFydCwgci5jb3VudCk7XG4gICAgICBnZW9tZXRyeS5ib3VuZGluZ0JveCA9IHIuYm94O1xuICAgICAgZ2VvbWV0cnkuYm91bmRpbmdTcGhlcmUgPSByLmJveC5nZXRCb3VuZGluZ1NwaGVyZShuZXcgVEhSRUUuU3BoZXJlKCkpO1xuICAgICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XG4gICAgICBtZXNoLm5hbWUgPSBgbWFjcm9fbG9kX3RpbGVfJHtyLnQgJSB0aWxlc1BlclNpZGV9XyR7TWF0aC5mbG9vcihyLnQgLyB0aWxlc1BlclNpZGUpfWA7XG4gICAgICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgICAgIG1lc2gucmVjZWl2ZVNoYWRvdyA9IGZhbHNlO1xuICAgICAgLy8gY3VsbE1hY3JvIGRlY2lkZXMgdmlzaWJpbGl0eSBieSBib3g7IGEgd2lkZW5lZCBydW4gd291bGQgZmFpbFxuICAgICAgLy8gdGhyZWUncyBwZXItdGlsZSBzcGhlcmUgdGVzdC5cbiAgICAgIG1lc2guZnJ1c3R1bUN1bGxlZCA9IGZhbHNlO1xuICAgICAgbWVzaC51c2VyRGF0YS5tYWNyb1JhbmdlID0geyBzdGFydDogci5zdGFydCwgY291bnQ6IHIuY291bnQgfTtcbiAgICAgIG1lc2hlcy5wdXNoKG1lc2gpO1xuICAgICAgdHJpYW5nbGVzICs9IHIuY291bnQgLyAzO1xuICAgIH1cbiAgfVxuICBmb3IgKGxldCB0ID0gMDsgdCA8IHRpbGVCdWZmZXJzLmxlbmd0aCAmJiB0aWxlQnVmZmVycy5sZW5ndGggPT09IDE7IHQrKykge1xuICAgIGNvbnN0IHsgcG9zaXRpb25zLCBub3JtYWxzLCBjb2xvcnMsIGluZGljZXMgfSA9IHRpbGVCdWZmZXJzW3RdO1xuICAgIGlmIChpbmRpY2VzLmxlbmd0aCA9PT0gMCAmJiAodGlsZUJ1ZmZlcnMubGVuZ3RoID4gMSB8fCBtZXNoZXMubGVuZ3RoID4gMCkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJ1ZmZlckdlb21ldHJ5KCk7XG4gICAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHBvc2l0aW9ucywgMykpO1xuICAgIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUobm9ybWFscywgMykpO1xuICAgIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShjb2xvcnMsIDMpKTtcbiAgICBnZW9tZXRyeS5zZXRJbmRleChpbmRpY2VzKTtcbiAgICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdCb3goKTtcbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcbiAgICBtZXNoLm5hbWUgPSB0aWxlQnVmZmVycy5sZW5ndGggPiAxID8gYG1hY3JvX2xvZF90aWxlXyR7dCAlIHRpbGVzUGVyU2lkZX1fJHtNYXRoLmZsb29yKHQgLyB0aWxlc1BlclNpZGUpfWAgOiAnbWFjcm9fbG9kJztcbiAgICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSBmYWxzZTtcbiAgICBtZXNoZXMucHVzaChtZXNoKTtcbiAgICB0cmlhbmdsZXMgKz0gaW5kaWNlcy5sZW5ndGggLyAzO1xuICB9XG4gIGlmIChtZXNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgY29uc3QgZW1wdHkgPSBuZXcgVEhSRUUuTWVzaChuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKSwgbWF0ZXJpYWwpO1xuICAgIGVtcHR5Lm5hbWUgPSAnbWFjcm9fbG9kJztcbiAgICBtZXNoZXMucHVzaChlbXB0eSk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBtZXNoOiBtZXNoZXNbMF0sXG4gICAgbWVzaGVzLFxuICAgIHRyaWFuZ2xlcyxcbiAgICBzYW1wbGVNcyxcbiAgICB0b3RhbE1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHRvdGFsVDAsXG4gICAgc2FtcGxlQ2FjaGVkLFxuICB9O1xufVxuXG5leHBvcnQgdHlwZSBWaWV3TW9kZSA9ICd3b3JsZCcgfCAnbWFwJyB8ICdraXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsVGVycmFpblZpZXdPcHRpb25zIHtcbiAgbmVhclJhZGl1cz86IG51bWJlcjtcbiAgd29ybGRNYWNyb1N0ZXA/OiBudW1iZXI7XG4gIG1hcE1hY3JvU3RlcD86IG51bWJlcjtcbn1cblxuY29uc3QgX2N1bGxGcnVzdHVtID0gbmV3IFRIUkVFLkZydXN0dW0oKTtcbmNvbnN0IF9jdWxsTWF0cml4ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbmNvbnN0IF9ib3hQb2ludCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4vKipcbiAqIGN1bGxNYWNybyBqb2lucyB0d28gcnVucyBvZiB2aXNpYmxlIG1hY3JvIHRpbGVzIGFjcm9zcyBhbiBvZmYtc2NyZWVuIHRpbGVcbiAqIG9mIGF0IG1vc3QgdGhpcyBtYW55IHRyaWFuZ2xlcyAoaXQgaXMgZHJhd24gYW5kIGNsaXBwZWQgYnkgdGhlIEdQVSksIHRvXG4gKiBzYXZlIGEgZHJhdyBjYWxsLiBDb2FzdCBhbmQgc2VhIHRpbGVzIGFyZSBzbWFsbCwgc28gd2lkZSB2aWV3cyBjb2xsYXBzZSB0b1xuICogYSBmZXcgcnVucy5cbiAqL1xuZXhwb3J0IGNvbnN0IE1BQ1JPX0JSSURHRV9UUklBTkdMRVMgPSAxNTAwO1xuXG4vKipcbiAqIENhbWVyYSBkaXN0YW5jZXMgKG0pIHBhc3Qgd2hpY2ggdGhlIGRyYXduIG5lYXIgcmluZyBzaHJpbmtzIGJ5IG9uZSBtb3JlXG4gKiBjaHVuazogcmFkaXVzIC0gMSBiZXlvbmQgdGhlIGZpcnN0LCByYWRpdXMgLSAyIGJleW9uZCB0aGUgc2Vjb25kIChuZXZlclxuICogYmVsb3cgMSkuIFJldmlldyB2MTogYXQgYnVpbGRlciB6b29tIDMwMCBtIGFuZCBiZXlvbmQgdGhlIHdob2xlIDd4NyByaW5nIGlzXG4gKiBvbiBzY3JlZW4gYW5kIGl0cyA0OSBjaHVuayBtZXNoZXMgcGx1cyB3YXRlciBjb3N0IGFib3V0IDc1IGNhbGxzLCB3aGlsZSBvbmVcbiAqIHZveGVsIHRoZXJlIGNvdmVycyAyIHRvIDQgcGl4ZWxzLiBDaHVua3Mgc3RheSBsb2FkZWQgKHNpbSwgZmF1bmEgYW5kXG4gKiB2ZWdldGF0aW9uIHN0aWxsIHNlZSB0aGVtKTsgb25seSB0aGVpciBtZXNoZXMgYXJlIGhpZGRlbiBhbmQgdGhlIG1hY3JvXG4gKiBtZXNoIGZpbGxzIHRoZWlyIGFyZWEuXG4gKi9cbmV4cG9ydCBjb25zdCBORUFSX0RJU1BMQVlfRElTVEFOQ0VTOiByZWFkb25seSBudW1iZXJbXSA9IFsyMjAsIDQ1MF07XG4vKiogWm9vbWluZyBiYWNrIGluLCBhIGxldmVsIGlzIGtlcHQgdW50aWwgdGhlIGRpc3RhbmNlIGRyb3BzIGJlbG93IHRocmVzaG9sZCB4IHRoaXMuICovXG5leHBvcnQgY29uc3QgTkVBUl9ESVNQTEFZX0hZU1RFUkVTSVMgPSAwLjk7XG5cbi8qKlxuICogRHJhd24gbmVhciByaW5nIHJhZGl1cyAoY2h1bmtzKSBmb3IgYSBjYW1lcmEgYGRpc3RhbmNlYCAobSkgZnJvbSBpdHNcbiAqIHRhcmdldCwgd2l0aCBoeXN0ZXJlc2lzIGFnYWluc3QgdGhlIHByZXZpb3VzbHkgZHJhd24gcmFkaXVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbmVhckRpc3BsYXlSYWRpdXMoZGlzdGFuY2U6IG51bWJlciwgbmVhclJhZGl1czogbnVtYmVyLCBwcmV2aW91cyA9IG5lYXJSYWRpdXMpOiBudW1iZXIge1xuICBjb25zdCBwcmV2TGV2ZWwgPSBuZWFyUmFkaXVzIC0gcHJldmlvdXM7XG4gIGxldCBsZXZlbCA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgTkVBUl9ESVNQTEFZX0RJU1RBTkNFUy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHQgPSBORUFSX0RJU1BMQVlfRElTVEFOQ0VTW2ldICogKHByZXZMZXZlbCA+IGkgPyBORUFSX0RJU1BMQVlfSFlTVEVSRVNJUyA6IDEpO1xuICAgIGlmIChkaXN0YW5jZSA+IHQpIGxldmVsID0gaSArIDE7XG4gIH1cbiAgcmV0dXJuIE1hdGgubWF4KDEsIE1hdGgubWluKG5lYXJSYWRpdXMsIG5lYXJSYWRpdXMgLSBsZXZlbCkpO1xufVxuXG5pbnRlcmZhY2UgQ2h1bmtWaWV3IHsgbWVzaDogVEhSRUUuTWVzaDsgd2F0ZXI6IFRIUkVFLk1lc2ggfCBudWxsOyB0cmlhbmdsZXM6IG51bWJlcjsgfVxuXG4vKipcbiAqIE93bnMgdGhlIG5lYXIgY2h1bmsgbWVzaGVzLCBtYWNybyBMT0QgYW5kIHdhdGVyIHN1cmZhY2UuIEl0IHJlYWRzIHdvcmxkXG4gKiBzdGF0ZSBhbmQgbmV2ZXIgbXV0YXRlcyBnZW5lcmF0aW9uIHJ1bGVzOyBldmljdGlvbiBvbmx5IGZyZWVzIGRlcml2ZWQgZGF0YS5cbiAqL1xuZXhwb3J0IGNsYXNzIFZveGVsVGVycmFpblZpZXcge1xuICByZWFkb25seSBncm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBwcml2YXRlIG5lYXJHcm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBwcml2YXRlIG1hY3JvR3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSB3YXRlcjogVEhSRUUuTWVzaDtcbiAgcHJpdmF0ZSB3b3JsZDogV29ybGQ7XG4gIHByaXZhdGUgbmVhclJhZGl1czogbnVtYmVyO1xuICAvKiogUmFkaXVzIChjaHVua3MpIG9mIHRoZSBuZWFyIHJpbmcgYWN0dWFsbHkgZHJhd247IDw9IG5lYXJSYWRpdXMgKHNlZSBuZWFyRGlzcGxheVJhZGl1cykuICovXG4gIHByaXZhdGUgZGlzcGxheVJhZGl1czogbnVtYmVyO1xuICAvKiogTWFjcm8gaG9sZSBvZiB0aGUgbGFzdCB3b3JsZCByZWJ1aWxkLCBpbiBjaHVuayBjb29yZGluYXRlcyAoaW5jbHVzaXZlKS4gKi9cbiAgcHJpdmF0ZSBob2xlQ2h1bmtzID0geyBtaW5YOiAwLCBtYXhYOiAtMSwgbWluWjogMCwgbWF4WjogLTEgfTtcbiAgcHJpdmF0ZSBkaXNwbGF5ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgLyoqIGRpc3BsYXlSYWRpdXMgdGhlIG1hY3JvIGhvbGUgd2FzIGxhc3QgYnVpbHQgZm9yLiAqL1xuICBwcml2YXRlIG1hY3JvRGlzcGxheVJhZGl1cyA9IC0xO1xuICBwcml2YXRlIHdvcmxkTWFjcm9TdGVwOiBudW1iZXI7XG4gIHByaXZhdGUgbWFwTWFjcm9TdGVwOiBudW1iZXI7XG4gIHByaXZhdGUgY2h1bmtzID0gbmV3IE1hcDxzdHJpbmcsIENodW5rVmlldz4oKTtcbiAgcHJpdmF0ZSBsb2FkZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBtb2RlOiBWaWV3TW9kZSA9ICd3b3JsZCc7XG4gIHByaXZhdGUgbWFjcm86IFRIUkVFLk1lc2hbXSA9IFtdO1xuICBwcml2YXRlIG1hY3JvVmlzaWJpbGl0eTogYm9vbGVhbltdID0gW107XG4gIHByaXZhdGUgbWFjcm9JblZpZXcgPSAwO1xuICBwcml2YXRlIG1hY3JvVHJpYW5nbGVzID0gMDtcbiAgcHJpdmF0ZSBtYWNyb0ZvY3VzID0gbmV3IFRIUkVFLlZlY3RvcjMoMWU5LCAwLCAxZTkpO1xuICBwcml2YXRlIG1hY3JvTW9kZTogVmlld01vZGUgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBjaHVua0dlblNhbXBsZXM6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgY2h1bmtNZXNoU2FtcGxlczogbnVtYmVyW10gPSBbXTtcbiAgcHJpdmF0ZSBtYWNyb1NhbXBsZXM6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgbWFjcm9TYW1wbGVTYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIG1hY3JvQ2FjaGVIaXRzID0gMDtcbiAgcHJpdmF0ZSBtYWNyb0VkaXRLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAvKiogTWFpbi10aHJlYWQgbWlsbGlzZWNvbmRzIHBlciBmcmFtZSBmb3Igc3RyZWFtaW5nIGFuZCBkaXJ0eSByZS1tZXNoaW5nLiAqL1xuICBmcmFtZUJ1ZGdldE1zID0gNjtcbiAgcHJpdmF0ZSBwZW5kaW5nQ2h1bmtzID0gMDtcbiAgcHJpdmF0ZSBzd2VlcENvdW50ZXIgPSAwO1xuICBwcml2YXRlIHN3ZXB0Q2h1bmtzID0gMDtcbiAgcHJpdmF0ZSBwaW5uZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBwb29sOiBDaHVua1dvcmtlclBvb2wgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBnZW5lcmF0aW5nID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIC8qKiBMYXRlc3QgbWVzaCByZXF1ZXN0IHBlciBjaHVuazsgb2xkZXIgcmVzdWx0cyBhcmUgZGlzY2FyZGVkLiAqL1xuICBwcml2YXRlIG1lc2hTdGFtcCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgc3RhbXBDb3VudGVyID0gMDtcbiAgcHJpdmF0ZSB3b3JrZXJTdGF0cyA9IHsgZ2VuZXJhdGVkOiAwLCBtZXNoZWQ6IDAsIGRpc2NhcmRlZDogMCwgZ2VuTXM6IDAsIG1lc2hNczogMCB9O1xuICBwcml2YXRlIHdhdGVyR3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBmYXJXYXRlckhvbGU6IHsgdmFsdWU6IFRIUkVFLlZlY3RvcjQgfTtcbiAgb25DaHVua3NDaGFuZ2VkOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcblxuICBjb25zdHJ1Y3Rvcih3b3JsZDogV29ybGQsIHNjZW5lOiBUSFJFRS5TY2VuZSwgb3B0czogVm94ZWxUZXJyYWluVmlld09wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMud29ybGQgPSB3b3JsZDtcbiAgICB0aGlzLm5lYXJSYWRpdXMgPSBNYXRoLm1heCgxLCBvcHRzLm5lYXJSYWRpdXMgPz8gMyk7XG4gICAgdGhpcy5kaXNwbGF5UmFkaXVzID0gdGhpcy5uZWFyUmFkaXVzO1xuICAgIHRoaXMud29ybGRNYWNyb1N0ZXAgPSBNYXRoLm1heCg0LCBvcHRzLndvcmxkTWFjcm9TdGVwID8/IDgpO1xuICAgIHRoaXMubWFwTWFjcm9TdGVwID0gTWF0aC5tYXgoNCwgb3B0cy5tYXBNYWNyb1N0ZXAgPz8gOCk7XG4gICAgdGhpcy5ncm91cC5uYW1lID0gJ3ZveGVsX3dvcmxkJztcbiAgICB0aGlzLm5lYXJHcm91cC5uYW1lID0gJ3ZveGVsX2NodW5rcyc7XG4gICAgdGhpcy5tYWNyb0dyb3VwLm5hbWUgPSAnbWFjcm9fbG9kJztcbiAgICB0aGlzLmdyb3VwLmFkZCh0aGlzLm5lYXJHcm91cCwgdGhpcy5tYWNyb0dyb3VwKTtcbiAgICB0aGlzLndhdGVyID0gYnVpbGRXYXRlclN1cmZhY2Uod29ybGQpO1xuICAgIHRoaXMuZmFyV2F0ZXJIb2xlID0gaW5zdGFsbEZhcldhdGVySG9sZSh0aGlzLndhdGVyLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKTtcbiAgICB0aGlzLmdyb3VwLmFkZCh0aGlzLndhdGVyKTtcbiAgICB0aGlzLndhdGVyR3JvdXAubmFtZSA9ICduZWFyX3dhdGVyJztcbiAgICB0aGlzLmdyb3VwLmFkZCh0aGlzLndhdGVyR3JvdXApO1xuICAgIHNjZW5lLmFkZCh0aGlzLmdyb3VwKTtcbiAgfVxuXG4gIHByZWxvYWQoZm9jdXM6IFRIUkVFLlZlY3RvcjMpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGUgPSAnd29ybGQnO1xuICAgIHRoaXMuZW5zdXJlQ2h1bmtzKGZvY3VzLCB0cnVlKTtcbiAgICB0aGlzLnJlYnVpbGRNYWNybyhmb2N1cywgJ3dvcmxkJywgdHJ1ZSk7XG4gIH1cblxuICAvKiogQWR2YW5jZSBwcmVzZW50YXRpb24tb25seSB3YXRlciBhbmltYXRpb24gKHNlY29uZHMpLiAqL1xuICBzZXRXYXRlclRpbWUoc2Vjb25kczogbnVtYmVyKTogdm9pZCB7IHdhdGVyVGltZS52YWx1ZSA9IHNlY29uZHM7IH1cblxuICB1cGRhdGUoZm9jdXM6IFRIUkVFLlZlY3RvcjMsIG1vZGU6IFZpZXdNb2RlID0gJ3dvcmxkJyk6IHZvaWQge1xuICAgIGlmIChtb2RlICE9PSB0aGlzLm1vZGUpIHtcbiAgICAgIHRoaXMubW9kZSA9IG1vZGU7XG4gICAgICB0aGlzLm5lYXJHcm91cC52aXNpYmxlID0gbW9kZSAhPT0gJ21hcCc7XG4gICAgICB0aGlzLndhdGVyR3JvdXAudmlzaWJsZSA9IG1vZGUgIT09ICdtYXAnO1xuICAgICAgaWYgKG1vZGUgPT09ICdtYXAnKSB0aGlzLmZhcldhdGVySG9sZS52YWx1ZS5zZXQoMCwgMCwgMCwgMCk7XG4gICAgICB0aGlzLnJlYnVpbGRNYWNybyhmb2N1cywgbW9kZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgaWYgKG1vZGUgPT09ICdtYXAnKSB7XG4gICAgICBpZiAobWFjcm9FZGl0S2V5KHRoaXMud29ybGQpICE9PSB0aGlzLm1hY3JvRWRpdEtleSkgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsIG1vZGUsIHRydWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGZyYW1lU3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICB0aGlzLmVuc3VyZUNodW5rcyhmb2N1cywgZmFsc2UsIGZyYW1lU3RhcnQpO1xuICAgIHRoaXMucmVidWlsZERpcnR5KGZvY3VzLCBmcmFtZVN0YXJ0KTtcbiAgICBpZiAoKyt0aGlzLnN3ZWVwQ291bnRlciAlIDMwID09PSAwKSB0aGlzLnN3ZWVwUmVzaWRlbnQoZm9jdXMpO1xuXG4gICAgY29uc3QgbW92ZWQgPSBNYXRoLmh5cG90KGZvY3VzLnggLSB0aGlzLm1hY3JvRm9jdXMueCwgZm9jdXMueiAtIHRoaXMubWFjcm9Gb2N1cy56KTtcbiAgICBpZiAodGhpcy5tYWNyb0Rpc3BsYXlSYWRpdXMgIT09IHRoaXMuZGlzcGxheVJhZGl1cykge1xuICAgICAgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsIG1vZGUsIHRydWUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5tYWNyb01vZGUgIT09IG1vZGUgfHwgbW92ZWQgPiA0OCB8fCBtYWNyb0VkaXRLZXkodGhpcy53b3JsZCkgIT09IHRoaXMubWFjcm9FZGl0S2V5KSB7XG4gICAgICB0aGlzLnJlYnVpbGRNYWNybyhmb2N1cywgbW9kZSwgZmFsc2UpO1xuICAgIH1cbiAgICB0aGlzLmFwcGx5RGlzcGxheShmb2N1cyk7XG4gIH1cblxuICAvKipcbiAgICogUHJlc2VudGF0aW9uIG9ubHk6IHBpY2sgdGhlIGRyYXduIG5lYXIgcmluZyByYWRpdXMgZm9yIGEgY2FtZXJhIHRoaXMgZmFyXG4gICAqIChtKSBmcm9tIGl0cyB0YXJnZXQgKG5lYXJEaXNwbGF5UmFkaXVzKS4gVGFrZXMgZWZmZWN0IGF0IHRoZSBuZXh0IHVwZGF0ZSgpLlxuICAgKi9cbiAgc2V0Vmlld0Rpc3RhbmNlKGRpc3RhbmNlOiBudW1iZXIpOiB2b2lkIHtcbiAgICB0aGlzLmRpc3BsYXlSYWRpdXMgPSBuZWFyRGlzcGxheVJhZGl1cyhkaXN0YW5jZSwgdGhpcy5uZWFyUmFkaXVzLCB0aGlzLmRpc3BsYXlSYWRpdXMpO1xuICB9XG5cbiAgLyoqIFJhZGl1cyAoY2h1bmtzKSBvZiB0aGUgbmVhciByaW5nIGN1cnJlbnRseSBkcmF3bi4gKi9cbiAgZ2V0IGRpc3BsYXlSYWRpdXNDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZGlzcGxheVJhZGl1czsgfVxuXG4gIC8qKlxuICAgKiBTaG93IGEgbG9hZGVkIGNodW5rIHdoZW4gaXQgbGllcyBpbiB0aGUgbWFjcm8gaG9sZSAoc28gbm8gZ2FwIG9wZW5zKSBvclxuICAgKiB3aXRoaW4gZGlzcGxheVJhZGl1cyBvZiB0aGUgZm9jdXMgY2h1bmsgKGxlYWRpbmcgZWRnZSB3aGlsZSB0aGUgbWFjcm9cbiAgICogd2FpdHMgZm9yIGl0cyA0OCBtIHJlYnVpbGQpLiBXaXRoIHRoZSBmdWxsIHJhZGl1cyBldmVyeSBjaHVuayBpcyBkcmF3bixcbiAgICogZXhhY3RseSBhcyBiZWZvcmUuXG4gICAqL1xuICBwcml2YXRlIGFwcGx5RGlzcGxheShmb2N1czogVEhSRUUuVmVjdG9yMyk6IHZvaWQge1xuICAgIGNvbnN0IGFsbCA9IHRoaXMuZGlzcGxheVJhZGl1cyA+PSB0aGlzLm5lYXJSYWRpdXM7XG4gICAgY29uc3QgY2N4ID0gd29ybGRUb0NodW5rWChNYXRoLnJvdW5kKGZvY3VzLngpKTtcbiAgICBjb25zdCBjY3ogPSB3b3JsZFRvQ2h1bmtaKE1hdGgucm91bmQoZm9jdXMueikpO1xuICAgIGNvbnN0IGggPSB0aGlzLmhvbGVDaHVua3MsIHIgPSB0aGlzLmRpc3BsYXlSYWRpdXM7XG4gICAgdGhpcy5kaXNwbGF5ZWQuY2xlYXIoKTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHZpZXddIG9mIHRoaXMuY2h1bmtzKSB7XG4gICAgICBsZXQgc2hvdyA9IGFsbDtcbiAgICAgIGlmICghc2hvdykge1xuICAgICAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgICAgICBzaG93ID0gKGN4ID49IGgubWluWCAmJiBjeCA8PSBoLm1heFggJiYgY3ogPj0gaC5taW5aICYmIGN6IDw9IGgubWF4WilcbiAgICAgICAgICB8fCAoTWF0aC5hYnMoY3ggLSBjY3gpIDw9IHIgJiYgTWF0aC5hYnMoY3ogLSBjY3opIDw9IHIpO1xuICAgICAgfVxuICAgICAgdmlldy5tZXNoLnZpc2libGUgPSBzaG93O1xuICAgICAgaWYgKHZpZXcud2F0ZXIpIHZpZXcud2F0ZXIudmlzaWJsZSA9IHNob3c7XG4gICAgICBpZiAoc2hvdyAmJiB0aGlzLmxvYWRlZC5oYXMoa2V5KSkgdGhpcy5kaXNwbGF5ZWQuYWRkKGtleSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0cmVhbSB0aGUgbmVhciByaW5nIG5lYXJlc3QtZmlyc3Qgd2l0aGluIGEgcGVyLWZyYW1lIHRpbWUgYnVkZ2V0LiBBdCBsZWFzdFxuICAgKiBvbmUgY2h1bmsgaXMgYnVpbHQgcGVyIGZyYW1lIHNvIHN0cmVhbWluZyBhbHdheXMgbWFrZXMgcHJvZ3Jlc3MuXG4gICAqL1xuICAvKipcbiAgICogTW92ZSBzdHJlYW1pbmcgZ2VuZXJhdGlvbiBhbmQgbWVzaGluZyB0byB3b3JrZXJzLiBFeHBsaWNpdCByZWJ1aWxkc1xuICAgKiAoY29uc3RydWN0aW9uLCBlZGl0cyB2aWEgcmVidWlsZEFyb3VuZCkgYW5kIHByZWxvYWQgc3RheSBzeW5jaHJvbm91cyBzb1xuICAgKiBhdXRob3JpdGF0aXZlIGNoYW5nZXMgYXJlIHZpc2libGUgaW1tZWRpYXRlbHkuXG4gICAqL1xuICBlbmFibGVXb3JrZXJzKHBvb2w6IENodW5rV29ya2VyUG9vbCk6IHZvaWQgeyB0aGlzLnBvb2wgPSBwb29sOyB9XG5cbiAgZ2V0IHdvcmtlck1ldHJpY3MoKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB8IG51bGwge1xuICAgIGlmICghdGhpcy5wb29sKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4ge1xuICAgICAgd29ya2VyczogdGhpcy5wb29sLnNpemUsIGluRmxpZ2h0OiB0aGlzLnBvb2wuaW5GbGlnaHQsIC4uLnRoaXMud29ya2VyU3RhdHMsXG4gICAgICBnZW5Nc0F2ZzogdGhpcy53b3JrZXJTdGF0cy5nZW5lcmF0ZWQgPyBNYXRoLnJvdW5kKHRoaXMud29ya2VyU3RhdHMuZ2VuTXMgLyB0aGlzLndvcmtlclN0YXRzLmdlbmVyYXRlZCAqIDEwKSAvIDEwIDogMCxcbiAgICAgIG1lc2hNc0F2ZzogdGhpcy53b3JrZXJTdGF0cy5tZXNoZWQgPyBNYXRoLnJvdW5kKHRoaXMud29ya2VyU3RhdHMubWVzaE1zIC8gdGhpcy53b3JrZXJTdGF0cy5tZXNoZWQgKiAxMCkgLyAxMCA6IDAsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgcmVxdWVzdEdlbmVyYXRlKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAgIGlmICh0aGlzLndvcmxkLmNodW5rcy5oYXMoa2V5KSB8fCB0aGlzLmdlbmVyYXRpbmcuaGFzKGtleSkgfHwgIXRoaXMucG9vbCkgcmV0dXJuO1xuICAgIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybjtcbiAgICB0aGlzLmdlbmVyYXRpbmcuYWRkKGtleSk7XG4gICAgY29uc3QgeyBzZWVkIH0gPSB0aGlzLndvcmxkLCB2ZXJzaW9uID0gdGhpcy53b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbjtcbiAgICB2b2lkIHRoaXMucG9vbC5nZW5lcmF0ZShzZWVkLCB2ZXJzaW9uLCBjeCwgY3opLnRoZW4oKHIpID0+IHtcbiAgICAgIHRoaXMuZ2VuZXJhdGluZy5kZWxldGUoa2V5KTtcbiAgICAgIC8vIFRoZSBtYWluIHRocmVhZCBpcyB0aGUgb25seSBXb3JsZCB3cml0ZXI6IGluc3RhbGwgb25seSBpZiBzdGlsbCB3YW50ZWQuXG4gICAgICBpZiAodGhpcy53b3JsZC5zZWVkICE9PSBzZWVkIHx8IHRoaXMud29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24gIT09IHZlcnNpb25cbiAgICAgICAgfHwgdGhpcy53b3JsZC5jaHVua3MuaGFzKGtleSkpIHsgdGhpcy53b3JrZXJTdGF0cy5kaXNjYXJkZWQrKzsgcmV0dXJuOyB9XG4gICAgICBzZWVkQmFzZUNvbHVtbnModGhpcy53b3JsZCwga2V5LCByLmNvbHVtbnMpO1xuICAgICAgaW5zdGFsbEJhc2VDaHVuayh0aGlzLndvcmxkLCByLmJhc2UsIHIubXMpO1xuICAgICAgdGhpcy53b3JrZXJTdGF0cy5nZW5lcmF0ZWQrKztcbiAgICAgIHRoaXMud29ya2VyU3RhdHMuZ2VuTXMgKz0gci5tcztcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgcmVxdWVzdE1lc2goa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBjaHVuayA9IHRoaXMud29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghY2h1bmsgfHwgIXRoaXMucG9vbCkgcmV0dXJuO1xuICAgIGNvbnN0IHN0YW1wID0gKyt0aGlzLnN0YW1wQ291bnRlcjtcbiAgICB0aGlzLm1lc2hTdGFtcC5zZXQoa2V5LCBzdGFtcCk7XG4gICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBwYWRkZWQgPSBwYWRkZWRGb3IodGhpcy53b3JsZCwgY2h1bmspO1xuICAgIHZvaWQgdGhpcy5wb29sLm1lc2gocGFkZGVkLCBjaHVuay5oZWlnaHRzLCBveCwgb3osIHRoaXMud29ybGQuc2VlZCkudGhlbigocikgPT4ge1xuICAgICAgLy8gU3VwZXJzZWRlZCAobmV3ZXIgcmVxdWVzdCwgdW5sb2FkZWQgb3Igc3luY2hyb25vdXNseSByZWJ1aWx0KSByZXN1bHRzIGFyZSBkcm9wcGVkLlxuICAgICAgaWYgKHRoaXMubWVzaFN0YW1wLmdldChrZXkpICE9PSBzdGFtcCkgeyB0aGlzLndvcmtlclN0YXRzLmRpc2NhcmRlZCsrOyByZXR1cm47IH1cbiAgICAgIHRoaXMubWVzaFN0YW1wLmRlbGV0ZShrZXkpO1xuICAgICAgY29uc3QgY3VycmVudCA9IHRoaXMud29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgICAgaWYgKCFjdXJyZW50KSB7IHRoaXMud29ya2VyU3RhdHMuZGlzY2FyZGVkKys7IHJldHVybjsgfVxuICAgICAgLy8gQW4gZWRpdCB0byB0aGlzIGNodW5rIHdoaWxlIGluIGZsaWdodCByZS1tYXJrZWQgaXQgZGlydHk7IHRoZSByZXN1bHQgaXNcbiAgICAgIC8vIHN0aWxsIHNob3duIG5vdyBhbmQgcmVwbGFjZWQgYnkgdGhlIG5leHQgKGZyZXNoKSByZXF1ZXN0LlxuICAgICAgdGhpcy5hZG9wdE1lc2goa2V5LCBjdXJyZW50LCBnZW9tZXRyeUZyb21BcnJheXMoci5hcnJheXMpKTtcbiAgICAgIHRoaXMud29ya2VyU3RhdHMubWVzaGVkKys7XG4gICAgICB0aGlzLndvcmtlclN0YXRzLm1lc2hNcyArPSByLm1zO1xuICAgICAgdGhpcy5vbkNodW5rc0NoYW5nZWQ/LigpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhZG9wdE1lc2goa2V5OiBzdHJpbmcsIGNodW5rOiBWb3hlbENodW5rLCByZXN1bHQ6IE1lc2hSZXN1bHQpOiB2b2lkIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgdGhpcy5uZWFyR3JvdXAucmVtb3ZlKGV4aXN0aW5nLm1lc2gpO1xuICAgICAgZXhpc3RpbmcubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICBpZiAoZXhpc3Rpbmcud2F0ZXIpIHsgdGhpcy53YXRlckdyb3VwLnJlbW92ZShleGlzdGluZy53YXRlcik7IGV4aXN0aW5nLndhdGVyLmdlb21ldHJ5LmRpc3Bvc2UoKTsgfVxuICAgIH1cbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2gocmVzdWx0Lmdlb21ldHJ5LCB0ZXJyYWluTWF0ZXJpYWwpO1xuICAgIG1lc2gubmFtZSA9IGB2b3hlbF9jaHVua18ke2NodW5rLmN4fV8ke2NodW5rLmN6fWA7XG4gICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgICB0aGlzLm5lYXJHcm91cC5hZGQobWVzaCk7XG4gICAgY29uc3Qgd2F0ZXIgPSBtZXNoQ2h1bmtXYXRlcih0aGlzLndvcmxkLCBjaHVuayk7XG4gICAgaWYgKHdhdGVyKSB0aGlzLndhdGVyR3JvdXAuYWRkKHdhdGVyKTtcbiAgICB0aGlzLmNodW5rcy5zZXQoa2V5LCB7IG1lc2gsIHdhdGVyLCB0cmlhbmdsZXM6IHJlc3VsdC50cmlhbmdsZXMgKyAod2F0ZXI/LnVzZXJEYXRhLndhdGVyVHJpYW5nbGVzID8/IDApIH0pO1xuICAgIHRoaXMubG9hZGVkLmFkZChrZXkpO1xuICB9XG5cbiAgLyoqIFdvcmtlciBzdHJlYW1pbmc6IGdlbmVyYXRlIHRoZSAzeDMgbmVpZ2hib3VyaG9vZCwgdGhlbiBtZXNoLCBuZWFyZXN0IGZpcnN0LiAqL1xuICBwcml2YXRlIGVuc3VyZUNodW5rc0FzeW5jKG1pc3Npbmc6IEFycmF5PHsgY3g6IG51bWJlcjsgY3o6IG51bWJlcjsgZDogbnVtYmVyIH0+KTogdm9pZCB7XG4gICAgY29uc3QgcG9vbCA9IHRoaXMucG9vbCE7XG4gICAgY29uc3QgbWF4SW5GbGlnaHQgPSBwb29sLnNpemUgKiAzO1xuICAgIGZvciAoY29uc3QgbSBvZiBtaXNzaW5nKSB7XG4gICAgICBpZiAocG9vbC5pbkZsaWdodCA+PSBtYXhJbkZsaWdodCkgYnJlYWs7XG4gICAgICBjb25zdCBrZXkgPSBjaHVua0tleShtLmN4LCBtLmN6KTtcbiAgICAgIGlmICh0aGlzLm1lc2hTdGFtcC5oYXMoa2V5KSkgY29udGludWU7XG4gICAgICBsZXQgcmVhZHkgPSB0cnVlO1xuICAgICAgZm9yIChsZXQgZHogPSAtMTsgZHogPD0gMTsgZHorKykge1xuICAgICAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSAxOyBkeCsrKSB7XG4gICAgICAgICAgY29uc3QgY3ggPSBtLmN4ICsgZHgsIGN6ID0gbS5jeiArIGR6O1xuICAgICAgICAgIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIGNvbnRpbnVlO1xuICAgICAgICAgIGlmICghdGhpcy53b3JsZC5jaHVua3MuaGFzKGNodW5rS2V5KGN4LCBjeikpKSB7IHJlYWR5ID0gZmFsc2U7IHRoaXMucmVxdWVzdEdlbmVyYXRlKGN4LCBjeik7IH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHJlYWR5KSB0aGlzLnJlcXVlc3RNZXNoKGtleSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBlbnN1cmVDaHVua3MoZm9jdXM6IFRIUkVFLlZlY3RvcjMsIGltbWVkaWF0ZTogYm9vbGVhbiwgZnJhbWVTdGFydCA9IHBlcmZvcm1hbmNlLm5vdygpKTogdm9pZCB7XG4gICAgY29uc3QgY2N4ID0gd29ybGRUb0NodW5rWChNYXRoLnJvdW5kKGZvY3VzLngpKTtcbiAgICBjb25zdCBjY3ogPSB3b3JsZFRvQ2h1bmtaKE1hdGgucm91bmQoZm9jdXMueikpO1xuICAgIGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cbiAgICBjb25zdCBtaXNzaW5nOiBBcnJheTx7IGN4OiBudW1iZXI7IGN6OiBudW1iZXI7IGQ6IG51bWJlciB9PiA9IFtdO1xuICAgIGZvciAobGV0IGR6ID0gLXRoaXMubmVhclJhZGl1czsgZHogPD0gdGhpcy5uZWFyUmFkaXVzOyBkeisrKSB7XG4gICAgICBmb3IgKGxldCBkeCA9IC10aGlzLm5lYXJSYWRpdXM7IGR4IDw9IHRoaXMubmVhclJhZGl1czsgZHgrKykge1xuICAgICAgICBjb25zdCBjeCA9IGNjeCArIGR4LCBjeiA9IGNjeiArIGR6O1xuICAgICAgICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSBjb250aW51ZTtcbiAgICAgICAgaWYgKHRoaXMubG9hZGVkLmhhcyhjaHVua0tleShjeCwgY3opKSkgY29udGludWU7XG4gICAgICAgIG1pc3NpbmcucHVzaCh7IGN4LCBjeiwgZDogZHggKiBkeCArIGR6ICogZHogfSk7XG4gICAgICB9XG4gICAgfVxuICAgIG1pc3Npbmcuc29ydCgoYSwgYikgPT4gYS5kIC0gYi5kKTtcbiAgICBsZXQgYnVpbHQgPSAwO1xuICAgIGlmICh0aGlzLnBvb2wgJiYgIWltbWVkaWF0ZSAmJiAhdGhpcy5wb29sLmZhaWxlZCkge1xuICAgICAgdGhpcy5lbnN1cmVDaHVua3NBc3luYyhtaXNzaW5nKTtcbiAgICAgIG1pc3NpbmcubGVuZ3RoID0gMDtcbiAgICB9XG4gICAgZm9yIChjb25zdCBtIG9mIG1pc3NpbmcpIHtcbiAgICAgIGlmICghaW1tZWRpYXRlICYmIGJ1aWx0ID4gMCAmJiBwZXJmb3JtYW5jZS5ub3coKSAtIGZyYW1lU3RhcnQgPj0gdGhpcy5mcmFtZUJ1ZGdldE1zKSBicmVhaztcbiAgICAgIHRoaXMuYnVpbGRDaHVuayhtLmN4LCBtLmN6KTtcbiAgICAgIGJ1aWx0Kys7XG4gICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICB9XG4gICAgdGhpcy5wZW5kaW5nQ2h1bmtzID0gdGhpcy5wb29sICYmICFpbW1lZGlhdGUgPyB0aGlzLm1lc2hTdGFtcC5zaXplICsgdGhpcy5nZW5lcmF0aW5nLnNpemUgOiBtaXNzaW5nLmxlbmd0aCAtIGJ1aWx0O1xuXG4gICAgY29uc3QgbWFyZ2luID0gdGhpcy5uZWFyUmFkaXVzICsgMTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbLi4udGhpcy5sb2FkZWRdKSB7XG4gICAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgICAgaWYgKE1hdGguYWJzKGN4IC0gY2N4KSA+IG1hcmdpbiB8fCBNYXRoLmFicyhjeiAtIGNjeikgPiBtYXJnaW4pIHtcbiAgICAgICAgdGhpcy5kaXNwb3NlQ2h1bmsoa2V5KTtcbiAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGNoYW5nZWQpIHRoaXMub25DaHVua3NDaGFuZ2VkPy4oKTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRDaHVuayhjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgICBjb25zdCBnZW5CZWZvcmUgPSB0aGlzLndvcmxkLnN0YXRzLmdlbmVyYXRpb25NcztcbiAgICBjb25zdCBjaHVua3NCZWZvcmUgPSB0aGlzLndvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZDtcbiAgICAvLyBFbnN1cmUgdGhlIDN4MyBuZWlnaGJvdXJob29kIGV4aXN0cyBzbyBib3VuZGFyeSBmYWNlcyB1c2UgcmVhbCBkYXRhLlxuICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIHtcbiAgICAgIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIGVuc3VyZUNodW5rKHRoaXMud29ybGQsIGN4ICsgZHgsIGN6ICsgZHopO1xuICAgIH1cbiAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHRoaXMud29ybGQsIGN4LCBjeik7XG4gICAgaWYgKCFjaHVuaykgcmV0dXJuO1xuICAgIGNvbnN0IGdlbmVyYXRlZCA9IHRoaXMud29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkIC0gY2h1bmtzQmVmb3JlO1xuICAgIGlmIChnZW5lcmF0ZWQgPiAwKSB7XG4gICAgICByZWNvcmRTYW1wbGUodGhpcy5jaHVua0dlblNhbXBsZXMsICh0aGlzLndvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyAtIGdlbkJlZm9yZSkgLyBnZW5lcmF0ZWQpO1xuICAgIH1cblxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICB0aGlzLm5lYXJHcm91cC5yZW1vdmUoZXhpc3RpbmcubWVzaCk7XG4gICAgICBleGlzdGluZy5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAgIGlmIChleGlzdGluZy53YXRlcikgeyB0aGlzLndhdGVyR3JvdXAucmVtb3ZlKGV4aXN0aW5nLndhdGVyKTsgZXhpc3Rpbmcud2F0ZXIuZ2VvbWV0cnkuZGlzcG9zZSgpOyB9XG4gICAgfVxuXG4gICAgY29uc3QgbWVzaFQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgY29uc3QgeyBnZW9tZXRyeSwgdHJpYW5nbGVzIH0gPSBtZXNoQ2h1bmsodGhpcy53b3JsZCwgY2h1bmspO1xuICAgIHJlY29yZFNhbXBsZSh0aGlzLmNodW5rTWVzaFNhbXBsZXMsIHBlcmZvcm1hbmNlLm5vdygpIC0gbWVzaFQwKTtcbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIHRlcnJhaW5NYXRlcmlhbCk7XG4gICAgbWVzaC5uYW1lID0gYHZveGVsX2NodW5rXyR7Y3h9XyR7Y3p9YDtcbiAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xuICAgIG1lc2guY2FzdFNoYWRvdyA9IGZhbHNlO1xuICAgIHRoaXMubmVhckdyb3VwLmFkZChtZXNoKTtcbiAgICBjb25zdCB3YXRlciA9IG1lc2hDaHVua1dhdGVyKHRoaXMud29ybGQsIGNodW5rKTtcbiAgICBpZiAod2F0ZXIpIHRoaXMud2F0ZXJHcm91cC5hZGQod2F0ZXIpO1xuICAgIHRoaXMuY2h1bmtzLnNldChrZXksIHsgbWVzaCwgd2F0ZXIsIHRyaWFuZ2xlczogdHJpYW5nbGVzICsgKHdhdGVyPy51c2VyRGF0YS53YXRlclRyaWFuZ2xlcyA/PyAwKSB9KTtcbiAgICB0aGlzLmxvYWRlZC5hZGQoa2V5KTtcbiAgICB0aGlzLndvcmxkLmRpcnR5LmRlbGV0ZShrZXkpO1xuICB9XG5cbiAgcHJpdmF0ZSBkaXNwb3NlQ2h1bmsoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCB2aWV3ID0gdGhpcy5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKHZpZXcpIHtcbiAgICAgIHRoaXMubmVhckdyb3VwLnJlbW92ZSh2aWV3Lm1lc2gpO1xuICAgICAgdmlldy5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAgIGlmICh2aWV3LndhdGVyKSB7IHRoaXMud2F0ZXJHcm91cC5yZW1vdmUodmlldy53YXRlcik7IHZpZXcud2F0ZXIuZ2VvbWV0cnkuZGlzcG9zZSgpOyB9XG4gICAgICB0aGlzLmNodW5rcy5kZWxldGUoa2V5KTtcbiAgICB9XG4gICAgdGhpcy5sb2FkZWQuZGVsZXRlKGtleSk7XG4gICAgdGhpcy5tZXNoU3RhbXAuZGVsZXRlKGtleSk7XG4gICAgaWYgKHRoaXMucGlubmVkLmhhcyhrZXkpKSByZXR1cm47XG4gICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgICBldmljdENodW5rKHRoaXMud29ybGQsIGtleSk7XG4gIH1cblxuICBwcml2YXRlIHJlYnVpbGRDaHVuayhrZXk6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgdGhpcy5idWlsZENodW5rKGN4LCBjeik7XG4gIH1cblxuICAvKiogUmUtbWVzaCBkaXJ0eSBsb2FkZWQgY2h1bmtzIG5lYXJlc3QtZmlyc3QsIHNoYXJpbmcgdGhlIGZyYW1lIGJ1ZGdldC4gKi9cbiAgcHJpdmF0ZSByZWJ1aWxkRGlydHkoZm9jdXM6IFRIUkVFLlZlY3RvcjMsIGZyYW1lU3RhcnQ6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICBjb25zdCBkaXJ0eTogQXJyYXk8eyBrZXk6IHN0cmluZzsgZDogbnVtYmVyIH0+ID0gW107XG4gICAgZm9yIChjb25zdCBrZXkgb2YgdGhpcy5sb2FkZWQpIHtcbiAgICAgIGlmICghdGhpcy53b3JsZC5kaXJ0eS5oYXMoa2V5KSkgY29udGludWU7XG4gICAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgICAgZGlydHkucHVzaCh7IGtleSwgZDogKGN4IC0gY2N4KSAqKiAyICsgKGN6IC0gY2N6KSAqKiAyIH0pO1xuICAgIH1cbiAgICBpZiAoZGlydHkubGVuZ3RoID09PSAwKSByZXR1cm47XG4gICAgZGlydHkuc29ydCgoYSwgYikgPT4gYS5kIC0gYi5kKTtcbiAgICBpZiAodGhpcy5wb29sICYmICF0aGlzLnBvb2wuZmFpbGVkKSB7XG4gICAgICBmb3IgKGNvbnN0IHsga2V5IH0gb2YgZGlydHkpIGlmICghdGhpcy5tZXNoU3RhbXAuaGFzKGtleSkgfHwgdGhpcy53b3JsZC5kaXJ0eS5oYXMoa2V5KSkgdGhpcy5yZXF1ZXN0TWVzaChrZXkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgcmVidWlsdCA9IDA7XG4gICAgZm9yIChjb25zdCB7IGtleSB9IG9mIGRpcnR5KSB7XG4gICAgICBpZiAocmVidWlsdCA+IDAgJiYgcGVyZm9ybWFuY2Uubm93KCkgLSBmcmFtZVN0YXJ0ID49IHRoaXMuZnJhbWVCdWRnZXRNcykgYnJlYWs7XG4gICAgICB0aGlzLnJlYnVpbGRDaHVuayhrZXkpO1xuICAgICAgcmVidWlsdCsrO1xuICAgIH1cbiAgICBpZiAocmVidWlsdCA+IDApIHRoaXMub25DaHVua3NDaGFuZ2VkPy4oKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaHVuayBsaWZldGltZSBwb2xpY3kuIE1lc2hpbmcgZ2VuZXJhdGVzIGEgcmluZyBvZiBuZWlnaGJvdXIgY2h1bmtzLCBhbmRcbiAgICogc2ltdWxhdGlvbiBxdWVyaWVzIGNhbiBnZW5lcmF0ZSBtb3JlOyBub25lIG9mIHRob3NlIHdlcmUgZXZlciByZWxlYXNlZC5cbiAgICogUmVzaWRlbnQgY2h1bmsgYnl0ZXMgYXJlIGRlcml2ZWQgKHJlZ2VuZXJhdGVkIGZyb20gc2VlZCArIGR1cmFibGUgZWRpdHMpLFxuICAgKiBzbyBhbnl0aGluZyBvdXRzaWRlIHRoZSBrZWVwIHJhZGl1cyB0aGF0IGlzIG5vdCBsb2FkZWQgb3IgcGlubmVkIGlzIGZyZWVkLlxuICAgKi9cbiAgcHJpdmF0ZSBzd2VlcFJlc2lkZW50KGZvY3VzOiBUSFJFRS5WZWN0b3IzKTogdm9pZCB7XG4gICAgY29uc3QgY2N4ID0gd29ybGRUb0NodW5rWChNYXRoLnJvdW5kKGZvY3VzLngpKTtcbiAgICBjb25zdCBjY3ogPSB3b3JsZFRvQ2h1bmtaKE1hdGgucm91bmQoZm9jdXMueikpO1xuICAgIGNvbnN0IGtlZXAgPSB0aGlzLm5lYXJSYWRpdXMgKyAyO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIFsuLi50aGlzLndvcmxkLmNodW5rcy5rZXlzKCldKSB7XG4gICAgICBpZiAodGhpcy5sb2FkZWQuaGFzKGtleSkgfHwgdGhpcy5waW5uZWQuaGFzKGtleSkgfHwgdGhpcy5tZXNoU3RhbXAuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICAgIGlmIChNYXRoLmFicyhjeCAtIGNjeCkgPD0ga2VlcCAmJiBNYXRoLmFicyhjeiAtIGNjeikgPD0ga2VlcCkgY29udGludWU7XG4gICAgICBldmljdENodW5rKHRoaXMud29ybGQsIGtleSk7XG4gICAgICB0aGlzLndvcmxkLmRpcnR5LmRlbGV0ZShrZXkpO1xuICAgICAgdGhpcy5zd2VwdENodW5rcysrO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBLZWVwIHRoZSBjaHVua3MgdW5kZXIgYSB3b3JsZC1zcGFjZSByZWN0YW5nbGUgcmVzaWRlbnQgKGZvciBleGFtcGxlIHRoZVxuICAgKiBzZXR0bGVtZW50IGVudmVsb3BlIHRoYXQgY29uc3RydWN0aW9uIHByZXZpZXdzIHF1ZXJ5IHNldmVyYWwgdGltZXMgYSBzZWNvbmQpLlxuICAgKi9cbiAgcGluUmVjdChtaW5YOiBudW1iZXIsIG1pblo6IG51bWJlciwgbWF4WDogbnVtYmVyLCBtYXhaOiBudW1iZXIpOiB2b2lkIHtcbiAgICBmb3IgKGxldCBjeiA9IHdvcmxkVG9DaHVua1oobWluWikgLSAxOyBjeiA8PSB3b3JsZFRvQ2h1bmtaKG1heFopICsgMTsgY3orKykge1xuICAgICAgZm9yIChsZXQgY3ggPSB3b3JsZFRvQ2h1bmtYKG1pblgpIC0gMTsgY3ggPD0gd29ybGRUb0NodW5rWChtYXhYKSArIDE7IGN4KyspIHtcbiAgICAgICAgaWYgKGN4ID49IDAgJiYgY3ogPj0gMCAmJiBjeCA8IENIVU5LU19QRVJfU0lERSAmJiBjeiA8IENIVU5LU19QRVJfU0lERSkgdGhpcy5waW5uZWQuYWRkKGNodW5rS2V5KGN4LCBjeikpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCByZXNpZGVudENodW5rcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy53b3JsZC5jaHVua3Muc2l6ZTsgfVxuICBnZXQgcGVuZGluZ0NodW5rQnVpbGRzKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnBlbmRpbmdDaHVua3M7IH1cbiAgZ2V0IGV2aWN0ZWRCeVN3ZWVwKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnN3ZXB0Q2h1bmtzOyB9XG5cbiAgcmVidWlsZEFyb3VuZCh4OiBudW1iZXIsIHo6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIHtcbiAgICAgIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIHtcbiAgICAgICAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3ggKyBkeCwgY3ogKyBkeik7XG4gICAgICAgIHRoaXMubWVzaFN0YW1wLmRlbGV0ZShrZXkpO1xuICAgICAgICBpZiAodGhpcy5sb2FkZWQuaGFzKGtleSkpIHRoaXMucmVidWlsZENodW5rKGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMub25DaHVua3NDaGFuZ2VkPy4oKTtcbiAgICBpZiAodGhpcy5tYWNyby5sZW5ndGgpIHRoaXMucmVidWlsZE1hY3JvKHRoaXMubWFjcm9Gb2N1cywgdGhpcy5tb2RlLCB0cnVlKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVidWlsZE1hY3JvKGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBtb2RlOiBWaWV3TW9kZSwgZm9yY2U6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBpZiAoIWZvcmNlICYmIHRoaXMubWFjcm9Nb2RlID09PSBtb2RlKSB7XG4gICAgICBjb25zdCBtb3ZlZCA9IE1hdGguaHlwb3QoZm9jdXMueCAtIHRoaXMubWFjcm9Gb2N1cy54LCBmb2N1cy56IC0gdGhpcy5tYWNyb0ZvY3VzLnopO1xuICAgICAgaWYgKG1vZGUgPT09ICdtYXAnIHx8IG1vdmVkIDw9IDQ4KSByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG1hY3JvVDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICBmb3IgKGNvbnN0IHRpbGUgb2YgdGhpcy5tYWNybykge1xuICAgICAgdGhpcy5tYWNyb0dyb3VwLnJlbW92ZSh0aWxlKTtcbiAgICAgIC8vIFRpbGVzIHNoYXJlIHRoZWlyIGJ1ZmZlcnM7IGRpc3Bvc2luZyBlYWNoIHZpZXcgZnJlZXMgdGhlbSBvbmNlLlxuICAgICAgdGlsZS5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgfVxuICAgIHRoaXMubWFjcm8gPSBbXTtcbiAgICBjb25zdCBzdGVwID0gbW9kZSA9PT0gJ21hcCcgPyB0aGlzLm1hcE1hY3JvU3RlcCA6IHRoaXMud29ybGRNYWNyb1N0ZXA7XG4gICAgbGV0IGhvbGU6IE1hY3JvSG9sZSB8IHVuZGVmaW5lZDtcbiAgICBpZiAobW9kZSAhPT0gJ21hcCcpIHtcbiAgICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgICBjb25zdCBjY3ogPSB3b3JsZFRvQ2h1bmtaKE1hdGgucm91bmQoZm9jdXMueikpO1xuICAgICAgY29uc3QgciA9IHRoaXMuZGlzcGxheVJhZGl1cztcbiAgICAgIGhvbGUgPSB7XG4gICAgICAgIG1pblg6IGNodW5rT3JpZ2luWChjY3ggLSByKSxcbiAgICAgICAgbWF4WDogY2h1bmtPcmlnaW5YKGNjeCArIHIpICsgQ0hVTktfU0laRSxcbiAgICAgICAgbWluWjogY2h1bmtPcmlnaW5aKGNjeiAtIHIpLFxuICAgICAgICBtYXhaOiBjaHVua09yaWdpblooY2N6ICsgcikgKyBDSFVOS19TSVpFLFxuICAgICAgfTtcbiAgICAgIHRoaXMuaG9sZUNodW5rcyA9IHsgbWluWDogY2N4IC0gciwgbWF4WDogY2N4ICsgciwgbWluWjogY2N6IC0gciwgbWF4WjogY2N6ICsgciB9O1xuICAgICAgdGhpcy5mYXJXYXRlckhvbGUudmFsdWUuc2V0KGhvbGUubWluWCwgaG9sZS5taW5aLCBob2xlLm1heFgsIGhvbGUubWF4Wik7XG4gICAgfVxuICAgIHRoaXMubWFjcm9EaXNwbGF5UmFkaXVzID0gdGhpcy5kaXNwbGF5UmFkaXVzO1xuICAgIGNvbnN0IHJlc3VsdCA9IGJ1aWxkTWFjcm9NZXNoKHRoaXMud29ybGQsIHsgc3RlcCwgaG9sZSwgZm9jdXM6IG1vZGUgPT09ICdtYXAnID8gdW5kZWZpbmVkIDogZm9jdXMgfSk7XG4gICAgdGhpcy5tYWNybyA9IHJlc3VsdC5tZXNoZXM7XG4gICAgdGhpcy5tYWNyb1RyaWFuZ2xlcyA9IHJlc3VsdC50cmlhbmdsZXM7XG4gICAgdGhpcy5tYWNyb0dyb3VwLmFkZCguLi5yZXN1bHQubWVzaGVzKTtcbiAgICB0aGlzLm1hY3JvRm9jdXMuY29weShmb2N1cyk7XG4gICAgdGhpcy5tYWNyb01vZGUgPSBtb2RlO1xuICAgIHRoaXMubWFjcm9FZGl0S2V5ID0gbWFjcm9FZGl0S2V5KHRoaXMud29ybGQpO1xuICAgIHJlY29yZFNhbXBsZSh0aGlzLm1hY3JvU2FtcGxlcywgcGVyZm9ybWFuY2Uubm93KCkgLSBtYWNyb1QwKTtcbiAgICBpZiAocmVzdWx0LnNhbXBsZUNhY2hlZCkgdGhpcy5tYWNyb0NhY2hlSGl0cysrO1xuICAgIGVsc2UgcmVjb3JkU2FtcGxlKHRoaXMubWFjcm9TYW1wbGVTYW1wbGVzLCByZXN1bHQuc2FtcGxlTXMpO1xuICB9XG5cbiAgZ2V0IGxvYWRlZENodW5rcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5sb2FkZWQuc2l6ZTsgfVxuICBnZXQgbG9hZGVkQ2h1bmtLZXlzKCk6IFJlYWRvbmx5U2V0PHN0cmluZz4geyByZXR1cm4gdGhpcy5sb2FkZWQ7IH1cbiAgLyoqIExvYWRlZCBjaHVua3Mgd2hvc2UgbWVzaGVzIGFyZSBkcmF3biAoYWxsIG9mIHRoZW0gdW5sZXNzIHpvb21lZCBvdXQpLiAqL1xuICBnZXQgZGlzcGxheWVkQ2h1bmtLZXlzKCk6IFJlYWRvbmx5U2V0PHN0cmluZz4geyByZXR1cm4gdGhpcy5kaXNwbGF5UmFkaXVzID49IHRoaXMubmVhclJhZGl1cyA/IHRoaXMubG9hZGVkIDogdGhpcy5kaXNwbGF5ZWQ7IH1cbiAgZ2V0IGRpc3BsYXllZENodW5rcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5kaXNwbGF5ZWRDaHVua0tleXMuc2l6ZTsgfVxuICBnZXQgbmVhclRyaWFuZ2xlcygpOiBudW1iZXIge1xuICAgIGxldCB0ID0gMDtcbiAgICBmb3IgKGNvbnN0IHYgb2YgdGhpcy5jaHVua3MudmFsdWVzKCkpIHQgKz0gdi50cmlhbmdsZXM7XG4gICAgcmV0dXJuIHQ7XG4gIH1cbiAgLyoqIFRyaWFuZ2xlcyBvZiB0aGUgbmVhciBjaHVua3MgY3VycmVudGx5IGRyYXduIChzZWUgZGlzcGxheWVkQ2h1bmtLZXlzKS4gKi9cbiAgZ2V0IG5lYXJEaXNwbGF5ZWRUcmlhbmdsZXMoKTogbnVtYmVyIHtcbiAgICBsZXQgdCA9IDA7XG4gICAgZm9yIChjb25zdCB2IG9mIHRoaXMuY2h1bmtzLnZhbHVlcygpKSBpZiAodi5tZXNoLnZpc2libGUpIHQgKz0gdi50cmlhbmdsZXM7XG4gICAgcmV0dXJuIHQ7XG4gIH1cbiAgZ2V0IG1hY3JvVHJpYW5nbGVDb3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5tYWNyb1RyaWFuZ2xlczsgfVxuICAvKiogVHJpYW5nbGVzIHRoZSBtYWNybyBkcmF3cyBhZnRlciB0aGUgbGFzdCBjdWxsTWFjcm8gY2FsbCAocnVucywgaW5jbHVkaW5nIGJyaWRnZWQgdGlsZXMpLiAqL1xuICBnZXQgbWFjcm9WaXNpYmxlVHJpYW5nbGVzKCk6IG51bWJlciB7XG4gICAgbGV0IHQgPSAwO1xuICAgIGZvciAoY29uc3QgdGlsZSBvZiB0aGlzLm1hY3JvKSB7XG4gICAgICBpZiAoIXRpbGUudmlzaWJsZSkgY29udGludWU7XG4gICAgICBjb25zdCBnID0gdGlsZS5nZW9tZXRyeTtcbiAgICAgIHQgKz0gTWF0aC5taW4oZy5kcmF3UmFuZ2UuY291bnQsIGcuaW5kZXg/LmNvdW50ID8/IDApIC8gMztcbiAgICB9XG4gICAgcmV0dXJuIHQ7XG4gIH1cbiAgLyoqIE1hY3JvIHRpbGVzIHdob3NlIGJveCBpcyBpbnNpZGUgdGhlIGZydXN0dW0gYXQgdGhlIGxhc3QgY3VsbE1hY3JvIGNhbGwuICovXG4gIGdldCBtYWNyb1RpbGVzSW5WaWV3KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm1hY3JvSW5WaWV3OyB9XG5cbiAgLyoqXG4gICAqIEhpZGUgbWFjcm8gdGlsZXMgd2hvc2UgYm91bmRpbmcgYm94IGlzIG91dHNpZGUgdGhlIGNhbWVyYSBmcnVzdHVtLCB0aGVuXG4gICAqIGRyYXcgZWFjaCBydW4gb2YgY29uc2VjdXRpdmUgdmlzaWJsZSB0aWxlcyAocm93LW1ham9yLCBzaGFyaW5nIG9uZSBpbmRleFxuICAgKiBidWZmZXIpIGFzIG9uZSBjYWxsLiBUaHJlZSBvbmx5IGN1bGxzIGJ5IGJvdW5kaW5nIHNwaGVyZSwgd2hpY2ggbmV2ZXJcbiAgICogcmVqZWN0cyBhIDI1NiBtIHRpbGUgbmV4dCB0byB0aGUgY2FtZXJhOyB0aGUgYm94IHRlc3QgYWxzbyBkcm9wcyBmYXJcbiAgICogdGlsZXMgYmVsb3cgdGhlIGZydXN0dW0gd2hlbiB0aGUgY2FtZXJhIHBpdGNoZXMgZG93bi4gQSBydW4gY29udGludWVzXG4gICAqIGFjcm9zcyBhbiBvZmYtc2NyZWVuIHRpbGUgb2YgYXQgbW9zdCBNQUNST19CUklER0VfVFJJQU5HTEVTLiBSZXZpZXcgdjE6XG4gICAqIGF0IHRoZSAxNDAwIG0gYnVpbGRlciB6b29tIDQwIHRpbGVzIHdlcmUgb24gc2NyZWVuIGFuZCBlYWNoIGNvc3QgYSBjYWxsLlxuICAgKiBQcmVzZW50YXRpb24gb25seSwgY2FsbCBvbmNlIHBlciBmcmFtZSBiZWZvcmUgcmVuZGVyLlxuICAgKi9cbiAgY3VsbE1hY3JvKGNhbWVyYTogVEhSRUUuQ2FtZXJhKTogdm9pZCB7XG4gICAgaWYgKHRoaXMubWFjcm8ubGVuZ3RoIDw9IDEpIHtcbiAgICAgIGZvciAoY29uc3QgdGlsZSBvZiB0aGlzLm1hY3JvKSB0aWxlLnZpc2libGUgPSB0cnVlO1xuICAgICAgdGhpcy5tYWNyb0luVmlldyA9IHRoaXMubWFjcm8ubGVuZ3RoO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjYW1lcmEudXBkYXRlTWF0cml4V29ybGQoKTtcbiAgICBfY3VsbE1hdHJpeC5tdWx0aXBseU1hdHJpY2VzKGNhbWVyYS5wcm9qZWN0aW9uTWF0cml4LCBjYW1lcmEubWF0cml4V29ybGRJbnZlcnNlKTtcbiAgICBfY3VsbEZydXN0dW0uc2V0RnJvbVByb2plY3Rpb25NYXRyaXgoX2N1bGxNYXRyaXgpO1xuICAgIGNvbnN0IG4gPSB0aGlzLm1hY3JvLmxlbmd0aDtcbiAgICBjb25zdCBpblZpZXcgPSB0aGlzLm1hY3JvVmlzaWJpbGl0eS5sZW5ndGggPT09IG4gPyB0aGlzLm1hY3JvVmlzaWJpbGl0eSA6ICh0aGlzLm1hY3JvVmlzaWJpbGl0eSA9IG5ldyBBcnJheTxib29sZWFuPihuKSk7XG4gICAgbGV0IGNvdW50ID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgY29uc3QgYm94ID0gdGhpcy5tYWNyb1tpXS5nZW9tZXRyeS5ib3VuZGluZ0JveDtcbiAgICAgIGluVmlld1tpXSA9ICFib3ggfHwgX2N1bGxGcnVzdHVtLmludGVyc2VjdHNCb3goYm94KTtcbiAgICAgIGlmIChpblZpZXdbaV0pIGNvdW50Kys7XG4gICAgfVxuICAgIHRoaXMubWFjcm9JblZpZXcgPSBjb3VudDtcbiAgICBsZXQgaGVhZDogVEhSRUUuTWVzaCB8IG51bGwgPSBudWxsLCBoZWFkU3RhcnQgPSAwLCBnYXAgPSAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICBjb25zdCB0aWxlID0gdGhpcy5tYWNyb1tpXTtcbiAgICAgIGNvbnN0IHJhbmdlID0gdGlsZS51c2VyRGF0YS5tYWNyb1JhbmdlIGFzIHsgc3RhcnQ6IG51bWJlcjsgY291bnQ6IG51bWJlciB9O1xuICAgICAgdGlsZS52aXNpYmxlID0gZmFsc2U7XG4gICAgICBpZiAoIWluVmlld1tpXSkgeyBnYXAgKz0gcmFuZ2UuY291bnQgLyAzOyBjb250aW51ZTsgfVxuICAgICAgaWYgKGhlYWQgJiYgZ2FwIDw9IE1BQ1JPX0JSSURHRV9UUklBTkdMRVMpIHtcbiAgICAgICAgaGVhZC5nZW9tZXRyeS5zZXREcmF3UmFuZ2UoaGVhZFN0YXJ0LCByYW5nZS5zdGFydCArIHJhbmdlLmNvdW50IC0gaGVhZFN0YXJ0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGhlYWQgPSB0aWxlO1xuICAgICAgICBoZWFkU3RhcnQgPSByYW5nZS5zdGFydDtcbiAgICAgICAgdGlsZS52aXNpYmxlID0gdHJ1ZTtcbiAgICAgICAgdGlsZS5nZW9tZXRyeS5zZXREcmF3UmFuZ2UoaGVhZFN0YXJ0LCByYW5nZS5jb3VudCk7XG4gICAgICB9XG4gICAgICBnYXAgPSAwO1xuICAgIH1cbiAgfVxuICBnZXQgZHJhd0NhbGxzKCk6IG51bWJlciB7XG4gICAgbGV0IG5lYXIgPSAwLCB3YXRlciA9IDA7XG4gICAgZm9yIChjb25zdCBba2V5LCB2XSBvZiB0aGlzLmNodW5rcykge1xuICAgICAgaWYgKCF0aGlzLmxvYWRlZC5oYXMoa2V5KSB8fCAhdi5tZXNoLnZpc2libGUpIGNvbnRpbnVlO1xuICAgICAgbmVhcisrO1xuICAgICAgaWYgKHYud2F0ZXIpIHdhdGVyKys7XG4gICAgfVxuICAgIGxldCBtYWNybyA9IDA7XG4gICAgZm9yIChjb25zdCB0aWxlIG9mIHRoaXMubWFjcm8pIGlmICh0aWxlLnZpc2libGUpIG1hY3JvKys7XG4gICAgcmV0dXJuIG5lYXIgKyB3YXRlciArIG1hY3JvICsgMTtcbiAgfVxuICBnZXQgbmVhclJhZGl1c0NodW5rcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5uZWFyUmFkaXVzOyB9XG4gIC8qKiBDbGVhciB0aGUgcm9sbGluZyB0aW1pbmcgd2luZG93IGJlZm9yZSBhIG1lYXN1cmVtZW50IHJ1bi4gKi9cbiAgcmVzZXRQZXJmKCk6IHZvaWQge1xuICAgIHRoaXMuY2h1bmtHZW5TYW1wbGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5jaHVua01lc2hTYW1wbGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5tYWNyb1NhbXBsZXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcy5sZW5ndGggPSAwO1xuICAgIHRoaXMubWFjcm9DYWNoZUhpdHMgPSAwO1xuICB9XG4gIC8qKiBSb2xsaW5nIGJ1aWxkIHRpbWluZ3MgaW4gbWlsbGlzZWNvbmRzLCBmb3IgdGhlIHBlcmZvcm1hbmNlIGV2aWRlbmNlLiAqL1xuICBnZXQgc3RyZWFtUGVyZigpOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgICByZXR1cm4ge1xuICAgICAgY2h1bmtHZW5QNTA6IHBlcmNlbnRpbGUodGhpcy5jaHVua0dlblNhbXBsZXMsIDAuNSksXG4gICAgICBjaHVua0dlblA5NTogcGVyY2VudGlsZSh0aGlzLmNodW5rR2VuU2FtcGxlcywgMC45NSksXG4gICAgICBjaHVua0dlbk1heDogcGVyY2VudGlsZSh0aGlzLmNodW5rR2VuU2FtcGxlcywgMSksXG4gICAgICBjaHVua01lc2hQNTA6IHBlcmNlbnRpbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCAwLjUpLFxuICAgICAgY2h1bmtNZXNoUDk1OiBwZXJjZW50aWxlKHRoaXMuY2h1bmtNZXNoU2FtcGxlcywgMC45NSksXG4gICAgICBjaHVua01lc2hNYXg6IHBlcmNlbnRpbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCAxKSxcbiAgICAgIG1hY3JvUDUwOiBwZXJjZW50aWxlKHRoaXMubWFjcm9TYW1wbGVzLCAwLjUpLFxuICAgICAgbWFjcm9NYXg6IHBlcmNlbnRpbGUodGhpcy5tYWNyb1NhbXBsZXMsIDEpLFxuICAgICAgbWFjcm9TYW1wbGVQNTA6IHBlcmNlbnRpbGUodGhpcy5tYWNyb1NhbXBsZVNhbXBsZXMsIDAuNSksXG4gICAgICBtYWNyb1NhbXBsZU1heDogcGVyY2VudGlsZSh0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcywgMSksXG4gICAgICBtYWNyb0NhY2hlSGl0czogdGhpcy5tYWNyb0NhY2hlSGl0cyxcbiAgICAgIGNodW5rU2FtcGxlczogdGhpcy5jaHVua0dlblNhbXBsZXMubGVuZ3RoLFxuICAgICAgbWFjcm9TYW1wbGVzOiB0aGlzLm1hY3JvU2FtcGxlcy5sZW5ndGgsXG4gICAgfTtcbiAgfVxufVxuIiwgIi8vIFJlbmRlciBsYXllciBcdTIwMTQgbmVhciB3YXRlciBzdXJmYWNlcyBidWlsdCBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHdhdGVyIHZveGVscy5cbi8vXG4vLyBHZW9tZXRyeSBjb21lcyBmcm9tIHRoZSB2b3hlbCB2b2x1bWUgKHNvIGVkaXRzLCBkdWcgcGl0cyBhbmQgdGhlIHYyIG1vdW50YWluXG4vLyByaXZlciBhcmUgZXhhY3QpLiBFYWNoIHdhdGVyIGNvbHVtbidzIHRvcCBnZXRzIGEgcXVhZCBjYXJyeWluZzpcbi8vICAgYUZsb3cgIFx1MjAxNCBzdXJmYWNlIGN1cnJlbnQgKGRpcmVjdGlvbiAqIHNwZWVkLCBtL3MpIGZyb20gc2ltIEh5ZHJvbG9neSxcbi8vICAgYURlcHRoIFx1MjAxNCB3YXRlciBkZXB0aCB0byB0aGUgYmVkIChtZXRyZXMpLFxuLy8gICBhRm9hbSAgXHUyMDE0IHNob3JlIC8gY2FzY2FkZSBmb2FtIHdlaWdodC5cbi8vIFdoZXJlIGEgd2F0ZXIgc3VyZmFjZSBzdGFuZHMgYWJvdmUgYSBsb3dlciBuZWlnaGJvdXIgKGEgY2FzY2FkZSBvciBmYWxsKSwgYVxuLy8gdmVydGljYWwgc2hlZXQgaXMgZW1pdHRlZCBkb3duIHRvIHRoZSBuZWlnaGJvdXIncyBzdXJmYWNlLlxuLy9cbi8vIEh5ZHJvbG9neSBpcyBzaW11bGF0aW9uIGRhdGE7IHJpcHBsZXMsIGZvYW0gYW5kIHRyYW5zcGFyZW5jeSBoZXJlIGFyZVxuLy8gcHJlc2VudGF0aW9uIG9ubHkgYW5kIG5ldmVyIGZlZWQgYmFjayBpbnRvIHN0YXRlLlxuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHBhbGV0dGUgZnJvbSAnLi4vZGF0YS9wYWxldHRlLmpzb24nO1xuaW1wb3J0IHtcbiAgV29ybGQsIFZveGVsQ2h1bmssIE1BVCwgQ0hVTktfU0laRSwgWV9NSU4sIFlfTUFYLCBpc1NvbGlkLFxuICBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWiwgbG9jYWxJbmRleCwgeVRvSW5kZXgsIGdldFZveGVsLCBoeWRyb2xvZ3lGb3IsXG59IGZyb20gJy4uL3NpbS93b3JsZCc7XG5cbmNvbnN0IE0gPSBwYWxldHRlLm1hdGVyaWFscyBhcyBSZWNvcmQ8c3RyaW5nLCB7IGhleDogc3RyaW5nIH0+O1xuY29uc3QgSCA9IChrOiBzdHJpbmcpID0+IG5ldyBUSFJFRS5Db2xvcihNW2tdLmhleCk7XG5cbi8qKiBUaGUgZHJhd24gd2F0ZXIgc3VyZmFjZSBzaXRzIHRoaXMgZmFyIGJlbG93IHRoZSB0b3Agb2YgdGhlIHdhdGVyIHZveGVscyAodGhlIHNpbSBzdXJmYWNlKS4gKi9cbmV4cG9ydCBjb25zdCBXQVRFUl9EUkFXX0RST1AgPSAwLjE7XG5cbi8qKiBTaGFyZWQgdGltZSB1bmlmb3JtIGZvciBldmVyeSB3YXRlciBtYXRlcmlhbC4gKi9cbmV4cG9ydCBjb25zdCB3YXRlclRpbWUgPSB7IHZhbHVlOiAwIH07XG5cbmZ1bmN0aW9uIG1ha2VXYXRlck1hdGVyaWFsKCk6IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwge1xuICBjb25zdCBtYXQgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XG4gICAgdmVydGV4Q29sb3JzOiB0cnVlLCB0cmFuc3BhcmVudDogdHJ1ZSwgZGVwdGhXcml0ZTogZmFsc2UsIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUsXG4gIH0pO1xuICBtYXQub25CZWZvcmVDb21waWxlID0gKHNoYWRlcikgPT4ge1xuICAgIHNoYWRlci51bmlmb3Jtcy51VGltZSA9IHdhdGVyVGltZTtcbiAgICBzaGFkZXIudW5pZm9ybXMudVNoYWxsb3cgPSB7IHZhbHVlOiBIKCd3YXRlcl9zaGFsbG93JykgfTtcbiAgICBzaGFkZXIudW5pZm9ybXMudU1pZCA9IHsgdmFsdWU6IEgoJ3dhdGVyX21pZCcpIH07XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVEZWVwID0geyB2YWx1ZTogSCgnd2F0ZXJfZGVlcCcpIH07XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVSaW0gPSB7IHZhbHVlOiBIKCd3YXRlcl9yaW0nKSB9O1xuICAgIHNoYWRlci52ZXJ0ZXhTaGFkZXIgPSBzaGFkZXIudmVydGV4U2hhZGVyXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCBgI2luY2x1ZGUgPGNvbW1vbj5cbmF0dHJpYnV0ZSB2ZWMyIGFGbG93O1xuYXR0cmlidXRlIGZsb2F0IGFEZXB0aDtcbmF0dHJpYnV0ZSBmbG9hdCBhRm9hbTtcbmF0dHJpYnV0ZSBmbG9hdCBhU2hlZXQ7XG52YXJ5aW5nIHZlYzIgdkZsb3c7XG52YXJ5aW5nIGZsb2F0IHZEZXB0aDtcbnZhcnlpbmcgZmxvYXQgdkZvYW07XG52YXJ5aW5nIGZsb2F0IHZTaGVldDtcbnZhcnlpbmcgdmVjMyB2V29ybGRQb3NXO2ApXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD4nLCBgI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD5cbnZGbG93ID0gYUZsb3c7IHZEZXB0aCA9IGFEZXB0aDsgdkZvYW0gPSBhRm9hbTsgdlNoZWV0ID0gYVNoZWV0O1xudldvcmxkUG9zVyA9IChtb2RlbE1hdHJpeCAqIHZlYzQodHJhbnNmb3JtZWQsIDEuMCkpLnh5ejtgKTtcbiAgICBzaGFkZXIuZnJhZ21lbnRTaGFkZXIgPSBzaGFkZXIuZnJhZ21lbnRTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsIGAjaW5jbHVkZSA8Y29tbW9uPlxudW5pZm9ybSBmbG9hdCB1VGltZTtcbnVuaWZvcm0gdmVjMyB1U2hhbGxvdzsgdW5pZm9ybSB2ZWMzIHVNaWQ7IHVuaWZvcm0gdmVjMyB1RGVlcDsgdW5pZm9ybSB2ZWMzIHVSaW07XG52YXJ5aW5nIHZlYzIgdkZsb3c7XG52YXJ5aW5nIGZsb2F0IHZEZXB0aDtcbnZhcnlpbmcgZmxvYXQgdkZvYW07XG52YXJ5aW5nIGZsb2F0IHZTaGVldDtcbnZhcnlpbmcgdmVjMyB2V29ybGRQb3NXO1xuZmxvYXQgd0hhc2godmVjMiBwKSB7IHJldHVybiBmcmFjdChzaW4oZG90KHAsIHZlYzIoMTI3LjEsIDMxMS43KSkpICogNDM3NTguNTQ1Myk7IH1cbmZsb2F0IHdOb2lzZSh2ZWMyIHApIHtcbiAgdmVjMiBpID0gZmxvb3IocCksIGYgPSBmcmFjdChwKTtcbiAgZiA9IGYgKiBmICogKDMuMCAtIDIuMCAqIGYpO1xuICByZXR1cm4gbWl4KG1peCh3SGFzaChpKSwgd0hhc2goaSArIHZlYzIoMSwgMCkpLCBmLngpLCBtaXgod0hhc2goaSArIHZlYzIoMCwgMSkpLCB3SGFzaChpICsgdmVjMigxLCAxKSksIGYueCksIGYueSk7XG59YClcbiAgICAgIC5yZXBsYWNlKCd2ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UsIG9wYWNpdHkgKTsnLCBgXG5mbG9hdCBzcGVlZCA9IGxlbmd0aCh2Rmxvdyk7XG4vLyBBZHZlY3QgdGhlIHBhdHRlcm4gZG93bnN0cmVhbS4gUXVhbnRpc2VkIHRvIDAuMjUgbSBjZWxscyBzbyByaXBwbGVzIHJlYWQgYXNcbi8vIGJsb2NrLWJ1aWx0IGZhY2V0cyByYXRoZXIgdGhhbiBzbW9vdGggZ3JhZGllbnRzLlxudmVjMiBwID0gdldvcmxkUG9zVy54ejtcbnZlYzIgYWR2ID0gcCAtIHZGbG93ICogdVRpbWU7XG52ZWMyIGNlbGwgPSBmbG9vcihhZHYgKiA0LjApIC8gNC4wO1xuZmxvYXQgbjEgPSB3Tm9pc2UoY2VsbCAqIDAuNTUpO1xuZmxvYXQgbjIgPSB3Tm9pc2UoY2VsbCAqIDEuNyArIHZlYzIodVRpbWUgKiAwLjA3LCAtdVRpbWUgKiAwLjA1KSk7XG5mbG9hdCByaXBwbGUgPSBuMSAqIDAuNiArIG4yICogMC40O1xuLy8gU3RpbGwgd2F0ZXIgKHNlYSwgbGFrZSkgZ2V0cyBhIHNsb3cgc3dlbGwgaW5zdGVhZCBvZiBhIGN1cnJlbnQuXG5mbG9hdCBzd2VsbCA9IDAuNSArIDAuNSAqIHNpbihkb3QocCwgdmVjMigwLjExLCAwLjA3KSkgKyB1VGltZSAqIDAuNik7XG5yaXBwbGUgPSBtaXgobWl4KHJpcHBsZSwgc3dlbGwsIDAuNSksIHJpcHBsZSwgY2xhbXAoc3BlZWQgKiAyLjAsIDAuMCwgMS4wKSk7XG5mbG9hdCBkID0gY2xhbXAodkRlcHRoIC8gNC4wLCAwLjAsIDEuMCk7XG52ZWMzIHdhdGVyID0gbWl4KHVTaGFsbG93LCB1TWlkLCBzbW9vdGhzdGVwKDAuMCwgMC41LCBkKSk7XG53YXRlciA9IG1peCh3YXRlciwgdURlZXAsIHNtb290aHN0ZXAoMC41LCAxLjAsIGQpKTtcbndhdGVyICo9IDAuOSArIDAuMiAqIHJpcHBsZTtcbi8vIFN0cmVha3MgYWxvbmcgZmFzdCBjdXJyZW50LCBmb2FtIGF0IHNob3JlcyBhbmQgY2FzY2FkZXMuXG5mbG9hdCBzdHJlYWsgPSBzdGVwKDAuNzggLSBjbGFtcChzcGVlZCAqIDAuMDYsIDAuMCwgMC4yKSwgbjIpICogY2xhbXAoc3BlZWQgKiAwLjUsIDAuMCwgMS4wKTtcbmZsb2F0IGZvYW1Ob2lzZSA9IHN0ZXAoMC40NSwgd05vaXNlKGNlbGwgKiAyLjMgKyB1VGltZSAqIDAuMykpO1xuZmxvYXQgZm9hbSA9IGNsYW1wKHZGb2FtICogZm9hbU5vaXNlICsgc3RyZWFrICogMC42LCAwLjAsIDEuMCk7XG4vLyBGYWxsaW5nIHNoZWV0czogZmFzdCB2ZXJ0aWNhbCBzdHJlYWtzLlxuaWYgKHZTaGVldCA+IDAuNSkge1xuICBmbG9hdCBmYWxsID0gd05vaXNlKHZlYzIoZmxvb3IodldvcmxkUG9zVy54ICogNC4wICsgdldvcmxkUG9zVy56ICogNC4wKSwgZmxvb3IoKHZXb3JsZFBvc1cueSArIHVUaW1lICogMy41KSAqIDMuMCkpKTtcbiAgZm9hbSA9IG1heChmb2FtLCBzdGVwKDAuMzUsIGZhbGwpKTtcbn1cbnZlYzMgY29sID0gbWl4KHdhdGVyLCB1UmltICogMS4wOCwgZm9hbSk7XG5mbG9hdCBhbHBoYSA9IG1peCgwLjU1LCAwLjksIHNtb290aHN0ZXAoMC40LCAzLjAsIHZEZXB0aCkpO1xuYWxwaGEgPSBtYXgoYWxwaGEsIGZvYW0gKiAwLjk1KTtcbmlmICh2U2hlZXQgPiAwLjUpIGFscGhhID0gbWF4KGFscGhhLCAwLjgyKTtcbnZlYzQgZGlmZnVzZUNvbG9yID0gdmVjNCggZGlmZnVzZSAqIGNvbCwgYWxwaGEgKiBvcGFjaXR5ICk7YCk7XG4gIH07XG4gIHJldHVybiBtYXQ7XG59XG5cbmV4cG9ydCBjb25zdCBuZWFyV2F0ZXJNYXRlcmlhbCA9IG1ha2VXYXRlck1hdGVyaWFsKCk7XG5cbi8qKiBNZXNoIHRoZSB3YXRlciBzdXJmYWNlcyBvZiBvbmUgY2h1bms7IG51bGwgd2hlbiB0aGUgY2h1bmsgaG9sZHMgbm8gd2F0ZXIuICovXG5leHBvcnQgZnVuY3Rpb24gbWVzaENodW5rV2F0ZXIod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IFRIUkVFLk1lc2ggfCBudWxsIHtcbiAgY29uc3QgaHlkcm8gPSBoeWRyb2xvZ3lGb3Iod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24pO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgY29uc3QgbGV2ZWxzID0gbmV3IEludDE2QXJyYXkoQ0hVTktfU0laRSAqIENIVU5LX1NJWkUpLmZpbGwoLTk5OTkpO1xuICBjb25zdCBiZWRzID0gbmV3IEludDE2QXJyYXkoQ0hVTktfU0laRSAqIENIVU5LX1NJWkUpO1xuXG4gIC8vIFdhdGVyIHN1cmZhY2UgcGVyIGNvbHVtbjogdGhlIGZpcnN0IG5vbi13YXRlciBjZWxsIGFib3ZlIHRoZSB3YXRlciB0aGF0XG4gIC8vIHN0YW5kcyBvbiB0aGlzIGNvbHVtbidzIHNvbGlkIHN1cmZhY2UuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29uc3QgYmVkID0gY2h1bmsuaGVpZ2h0c1tjb2xdICsgWV9NSU4gKyAxO1xuICAgICAgbGV0IHkgPSBiZWQ7XG4gICAgICB3aGlsZSAoeSA8IFlfTUFYICYmIGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0gPT09IE1BVC5XQVRFUikgeSsrO1xuICAgICAgaWYgKHkgPiBiZWQpIHsgbGV2ZWxzW2NvbF0gPSB5OyBiZWRzW2NvbF0gPSBiZWQ7IH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBwb3M6IG51bWJlcltdID0gW10sIG5ybTogbnVtYmVyW10gPSBbXSwgY2xyOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBmbG93OiBudW1iZXJbXSA9IFtdLCBkZXB0aDogbnVtYmVyW10gPSBbXSwgZm9hbTogbnVtYmVyW10gPSBbXSwgc2hlZXQ6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGlkeDogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgcHVzaCA9ICh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBueDogbnVtYmVyLCBueTogbnVtYmVyLCBuejogbnVtYmVyLFxuICAgIGZ4OiBudW1iZXIsIGZ6OiBudW1iZXIsIGRlcDogbnVtYmVyLCBmbzogbnVtYmVyLCBzaDogbnVtYmVyKSA9PiB7XG4gICAgcG9zLnB1c2goeCwgeSwgeik7IG5ybS5wdXNoKG54LCBueSwgbnopOyBjbHIucHVzaCgxLCAxLCAxKTtcbiAgICBmbG93LnB1c2goZngsIGZ6KTsgZGVwdGgucHVzaChkZXApOyBmb2FtLnB1c2goZm8pOyBzaGVldC5wdXNoKHNoKTtcbiAgfTtcbiAgY29uc3QgcXVhZCA9IChiYXNlOiBudW1iZXIpID0+IHsgaWR4LnB1c2goYmFzZSwgYmFzZSArIDEsIGJhc2UgKyAyLCBiYXNlLCBiYXNlICsgMiwgYmFzZSArIDMpOyB9O1xuXG4gIGNvbnN0IGxldmVsQXQgPSAod3g6IG51bWJlciwgd3o6IG51bWJlciwgbHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgaWYgKGx4ID49IDAgJiYgbHogPj0gMCAmJiBseCA8IENIVU5LX1NJWkUgJiYgbHogPCBDSFVOS19TSVpFKSByZXR1cm4gbGV2ZWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgICAvLyBOZWlnaGJvdXIgY2h1bms6IHJlYWQgdGhlIHZveGVscyAoY2h1bmtzIGFyZSBnZW5lcmF0ZWQgaW4gM3gzIHJpbmdzIGZvciBtZXNoaW5nKS5cbiAgICBsZXQgeSA9IFlfTUFYIC0gMTtcbiAgICB3aGlsZSAoeSA+IFlfTUlOICYmICFpc1NvbGlkKGdldFZveGVsKHdvcmxkLCB3eCwgeSwgd3opKSAmJiBnZXRWb3hlbCh3b3JsZCwgd3gsIHksIHd6KSAhPT0gTUFULldBVEVSKSB5LS07XG4gICAgcmV0dXJuIGdldFZveGVsKHdvcmxkLCB3eCwgeSwgd3opID09PSBNQVQuV0FURVIgPyB5ICsgMSA6IC05OTk5O1xuICB9O1xuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29uc3QgbGV2ZWwgPSBsZXZlbHNbY29sXTtcbiAgICAgIGlmIChsZXZlbCA9PT0gLTk5OTkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgeCA9IG94ICsgbHgsIHogPSBveiArIGx6O1xuICAgICAgY29uc3QgZiA9IGh5ZHJvLmZsb3dBdCh4ICsgMC41LCB6ICsgMC41LCBsZXZlbCk7XG4gICAgICBjb25zdCBmeCA9IGYuZHggKiBmLnNwZWVkLCBmeiA9IGYuZHogKiBmLnNwZWVkO1xuICAgICAgY29uc3QgZGVwID0gbGV2ZWwgLSBiZWRzW2NvbF07XG4gICAgICBsZXQgc2hvcmUgPSAwO1xuICAgICAgY29uc3Qgc2lkZXM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1sxLCAwXSwgWy0xLCAwXSwgWzAsIDFdLCBbMCwgLTFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2Ygc2lkZXMpIHtcbiAgICAgICAgY29uc3QgbSA9IGdldFZveGVsKHdvcmxkLCB4ICsgZHgsIGxldmVsIC0gMSwgeiArIGR6KTtcbiAgICAgICAgaWYgKGlzU29saWQobSkpIHNob3JlID0gMTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHkgPSBsZXZlbCAtIFdBVEVSX0RSQVdfRFJPUDtcbiAgICAgIGNvbnN0IGJhc2UgPSBwb3MubGVuZ3RoIC8gMztcbiAgICAgIGNvbnN0IGZvID0gTWF0aC5tYXgoc2hvcmUgKiAwLjY1LCBNYXRoLm1pbigxLCBmLnNwZWVkIC8gMy41KSk7XG4gICAgICBwdXNoKHgsIHksIHosIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBwdXNoKHgsIHksIHogKyAxLCAwLCAxLCAwLCBmeCwgZnosIGRlcCwgZm8sIDApO1xuICAgICAgcHVzaCh4ICsgMSwgeSwgeiArIDEsIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBwdXNoKHggKyAxLCB5LCB6LCAwLCAxLCAwLCBmeCwgZnosIGRlcCwgZm8sIDApO1xuICAgICAgcXVhZChiYXNlKTtcblxuICAgICAgLy8gQ2FzY2FkZSBzaGVldHMgdG93YXJkIGxvd2VyIHdhdGVyIChvciBvcGVuIGFpcikgb24gYW55IHNpZGUuXG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIHNpZGVzKSB7XG4gICAgICAgIGNvbnN0IG5MZXZlbCA9IGxldmVsQXQoeCArIGR4LCB6ICsgZHosIGx4ICsgZHgsIGx6ICsgZHopO1xuICAgICAgICBpZiAobkxldmVsID09PSAtOTk5OSB8fCBuTGV2ZWwgPj0gbGV2ZWwpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoaXNTb2xpZChnZXRWb3hlbCh3b3JsZCwgeCArIGR4LCBsZXZlbCAtIDEsIHogKyBkeikpKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgdG9wID0gbGV2ZWwgLSBXQVRFUl9EUkFXX0RST1AsIGJvdHRvbSA9IG5MZXZlbCAtIFdBVEVSX0RSQVdfRFJPUDtcbiAgICAgICAgY29uc3QgYiA9IHBvcy5sZW5ndGggLyAzO1xuICAgICAgICAvLyBGYWNlIG9uIHRoZSBzaGFyZWQgZWRnZSwgb3JpZW50ZWQgdG93YXJkIHRoZSBsb3dlciBuZWlnaGJvdXIuXG4gICAgICAgIGNvbnN0IGV4ID0gZHggPiAwID8geCArIDEgOiBkeCA8IDAgPyB4IDogeCwgZXogPSBkeiA+IDAgPyB6ICsgMSA6IGR6IDwgMCA/IHogOiB6O1xuICAgICAgICBpZiAoZHggIT09IDApIHtcbiAgICAgICAgICBwdXNoKGV4LCB0b3AsIHosIGR4LCAwLCAwLCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKGV4LCB0b3AsIHogKyAxLCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaChleCwgYm90dG9tLCB6ICsgMSwgZHgsIDAsIDAsIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goZXgsIGJvdHRvbSwgeiwgZHgsIDAsIDAsIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHB1c2goeCwgdG9wLCBleiwgMCwgMCwgZHosIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goeCArIDEsIHRvcCwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKHggKyAxLCBib3R0b20sIGV6LCAwLCAwLCBkeiwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaCh4LCBib3R0b20sIGV6LCAwLCAwLCBkeiwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgIH1cbiAgICAgICAgcXVhZChiKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKGlkeC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICBjb25zdCBnID0gbmV3IFRIUkVFLkJ1ZmZlckdlb21ldHJ5KCk7XG4gIGcuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHBvcywgMykpO1xuICBnLnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUobnJtLCAzKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGNsciwgMykpO1xuICBnLnNldEF0dHJpYnV0ZSgnYUZsb3cnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShmbG93LCAyKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhRGVwdGgnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShkZXB0aCwgMSkpO1xuICBnLnNldEF0dHJpYnV0ZSgnYUZvYW0nLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShmb2FtLCAxKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhU2hlZXQnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShzaGVldCwgMSkpO1xuICBnLnNldEluZGV4KGlkeCk7XG4gIGcuY29tcHV0ZUJvdW5kaW5nU3BoZXJlKCk7XG4gIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnLCBuZWFyV2F0ZXJNYXRlcmlhbCk7XG4gIG1lc2gubmFtZSA9IGB3YXRlcl9jaHVua18ke2NodW5rLmN4fV8ke2NodW5rLmN6fWA7XG4gIG1lc2gucmVuZGVyT3JkZXIgPSAyO1xuICBtZXNoLnVzZXJEYXRhLndhdGVyVHJpYW5nbGVzID0gaWR4Lmxlbmd0aCAvIDM7XG4gIHJldHVybiBtZXNoO1xufVxuXG4vKipcbiAqIEN1dCBhIHJlY3Rhbmd1bGFyIGhvbGUgaW4gdGhlIGZhciAob3BhcXVlKSBzZWEgcGxhbmUgd2hlcmUgbmVhciBjaHVua3MgZHJhd1xuICogdGhlaXIgb3duIHRyYW5zcGFyZW50IHdhdGVyLCBzbyBzaGFsbG93cyBzaG93IHRoZSByZWFsIGJlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbGxGYXJXYXRlckhvbGUobWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsKTogeyB2YWx1ZTogVEhSRUUuVmVjdG9yNCB9IHtcbiAgY29uc3QgaG9sZSA9IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3I0KDAsIDAsIDAsIDApIH07XG4gIG1hdGVyaWFsLm9uQmVmb3JlQ29tcGlsZSA9IChzaGFkZXIpID0+IHtcbiAgICBzaGFkZXIudW5pZm9ybXMudUhvbGUgPSBob2xlO1xuICAgIHNoYWRlci52ZXJ0ZXhTaGFkZXIgPSBzaGFkZXIudmVydGV4U2hhZGVyXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCAnI2luY2x1ZGUgPGNvbW1vbj5cXG52YXJ5aW5nIHZlYzIgdkZhclhaOycpXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD4nLCAnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD5cXG52RmFyWFogPSAobW9kZWxNYXRyaXggKiB2ZWM0KHRyYW5zZm9ybWVkLCAxLjApKS54ejsnKTtcbiAgICBzaGFkZXIuZnJhZ21lbnRTaGFkZXIgPSBzaGFkZXIuZnJhZ21lbnRTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsICcjaW5jbHVkZSA8Y29tbW9uPlxcbnVuaWZvcm0gdmVjNCB1SG9sZTtcXG52YXJ5aW5nIHZlYzIgdkZhclhaOycpXG4gICAgICAucmVwbGFjZSgndmVjNCBkaWZmdXNlQ29sb3IgPSB2ZWM0KCBkaWZmdXNlLCBvcGFjaXR5ICk7JyxcbiAgICAgICAgJ2lmICh2RmFyWFoueCA+IHVIb2xlLnggJiYgdkZhclhaLnggPCB1SG9sZS56ICYmIHZGYXJYWi55ID4gdUhvbGUueSAmJiB2RmFyWFoueSA8IHVIb2xlLncpIGRpc2NhcmQ7XFxudmVjNCBkaWZmdXNlQ29sb3IgPSB2ZWM0KCBkaWZmdXNlLCBvcGFjaXR5ICk7Jyk7XG4gIH07XG4gIHJldHVybiBob2xlO1xufVxuIiwgIntcbiAgXCJzY2hlbWFcIjogXCJwYWxldHRlX3YyXCIsXG4gIFwiZGF0ZVwiOiBcIjIwMjYtMTAtMjJcIixcbiAgXCJzdGF0dXNcIjogXCJwcm9wb3NlZFwiLFxuICBcInNvdXJjZVwiOiBcIlJFRi0wMDIgKGh5YnJpZCB3b3JsZCByZWZlcmVuY2UpLCB2YWx1ZXMgc2FtcGxlZCBieSBleWU7IG51bWVyaWMgdmVyaWZpY2F0aW9uIHBlbmRpbmdcIixcbiAgXCJub3RlXCI6IFwiT25lIG1hdGVyaWFsIHBhbGV0dGUuIFRpbWUgb2YgZGF5IGlzIGV4cHJlc3NlZCBieSB0aGUgbGlnaHRpbmcgcHJlc2V0cyBiZWxvdywgbm90IGJ5IHJlcGFpbnRpbmcgbWF0ZXJpYWxzLlwiLFxuICBcIm1hdGVyaWFsc1wiOiB7XG4gICAgXCJncmFzc190b3BcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNzlCOTRDXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgbG93IGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX2hpZ2hcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEZDOTVFXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgbWlkIGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX3BlYWtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUFEMDZBXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgaGlnaCBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19jYXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUU5NDQwXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC4wLTAuNCBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0cmF0YV9vY2hyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNDOTlBNUZcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjQtMC42MiBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0cmF0YV9ydXN0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0I0NjMzQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuNjItMC44MCBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0b25lX3RvcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFNkRGQ0NcIixcbiAgICAgIFwicm9sZVwiOiBcImJhcmUgc3RvbmUgdG9wIHN1cmZhY2VcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9ib2R5X2FcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRENEM0JFXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJvZHksIGV2ZW4gNC41IG0gYmFuZFwiXG4gICAgfSxcbiAgICBcInN0b25lX2JvZHlfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEMUM3QUZcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYm9keSwgb2RkIDQuNSBtIGJhbmRcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9zaGFkZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCOUFFOTZcIixcbiAgICAgIFwicm9sZVwiOiBcImNyZXZpY2UgLyByZWNlc3NlZCBzdG9uZSBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJzYW5kXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0UzRDNBNlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2hvcmUgY2VsbHNcIlxuICAgIH0sXG4gICAgXCJzbm93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0VFRjFGNVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ2VuZXJhdG9yIHYyIHNub3dmaWVsZHMgYWJvdmUgdGhlIHNub3dsaW5lIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9za2luXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0Q5QTc3RVwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIHNraW4gKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3R1bmljXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0IzNEEzQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiZm91bmRlciB0dW5pYywgd2FybSByZWQgYWNjZW50IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90dW5pY19hbHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkU4Qzg2XCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlciB0dW5pYywgdGVhbCBhY2NlbnQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3Ryb3VzZXJzXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVCNDYzNlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIHRyb3VzZXJzIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9oYWlyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRBMzMyNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIGhhaXIgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX2Jvb3RzXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzMzMjgxRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIGJvb3RzIGFuZCBiZWx0IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfZGVlclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4QzVCM0FcIixcbiAgICAgIFwicm9sZVwiOiBcInJlZCBkZWVyIGNvYXQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV9saWdodFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEQ0M3QTRcIixcbiAgICAgIFwicm9sZVwiOiBcImRlZXIgYmVsbHksIGhhcmUgdGFpbCwgYW50bGVyIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfaGFyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QTg2NzBcIixcbiAgICAgIFwicm9sZVwiOiBcImhhcmUgY29hdCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX3Ryb3V0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGN0Y1RVwiLFxuICAgICAgXCJyb2xlXCI6IFwidHJvdXQgYmFjayAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX3Ryb3V0X2JlbGx5XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0Q4QzlBM1wiLFxuICAgICAgXCJyb2xlXCI6IFwidHJvdXQgYmVsbHkgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3BsYXN0ZXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRThEREM2XCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIHdhbGwgcGxhc3RlciAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGltYmVyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZBNDUzMFwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSB0aW1iZXIgZnJhbWUgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RpbWJlcl9saWdodFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4QTYxNDJcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgcGxhbmtzIGFuZCBkb29ycyAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGhhdGNoXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0M3QTI1N1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGhhdGNoIHJvb2YgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RoYXRjaF9kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlDN0IzQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGhhdGNoIHJvb2Ygc2hhZGUgY291cnNlIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF9zdG9uZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QjlBOTFcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgbWFzb25yeSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfc3RvbmVfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM3NDczNkNcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgbWFzb25yeSBqb2ludHMgYW5kIHBsaW50aCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcInByb3BfaXJvblwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzQTNBM0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImlyb24gZml0dGluZ3MgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJwcm9wX2dsb3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRkZEMjdGXCIsXG4gICAgICBcInJvbGVcIjogXCJsYW50ZXJuIGxpZ2h0IChlbWlzc2l2ZSwgZWZmZWN0IG9ubHkpIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfc2hhbGxvd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM2N0NGRDhcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoIDw9IDAuNSBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfbWlkXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNBQUZDNFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggfjEuNSBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfZGVlcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyQThGQThcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoID49IDQuMCBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfcmltXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0JGRUFGMFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2hvcmVsaW5lIHJpbSAvIGZvYW0gdGludFwiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9hXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVGQTgzRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBzaGFkZSBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkZCODRBXCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9jXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzdGQzM1NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBoaWdobGlnaHQgbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9waW5rXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0YyQTZDNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmxvc3NvbSBhY2NlbnQgc3BlY2llcyBvbmx5XCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X3BpbmtfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFODhGQjJcIixcbiAgICAgIFwicm9sZVwiOiBcImJsb3Nzb20gc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcInRydW5rXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZCNEEzM1wiLFxuICAgICAgXCJyb2xlXCI6IFwidHJlZSB0cnVua3NcIlxuICAgIH0sXG4gICAgXCJiYXJrX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNEUzNjI2XCIsXG4gICAgICBcInJvbGVcIjogXCJ0cnVuayBzaGFkZSwgc3R1bXBzXCJcbiAgICB9LFxuICAgIFwiY29uaWZlcl9waW5lXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRDOEE0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwicGluZSBuZWVkbGVzLCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjb25pZmVyX3BpbmVfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1QzlDNTNcIixcbiAgICAgIFwicm9sZVwiOiBcInBpbmUgbmVlZGxlcywgaGlnaGxpZ2h0XCJcbiAgICB9LFxuICAgIFwiY29uaWZlcl9zcHJ1Y2VcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkY2QjQ4XCIsXG4gICAgICBcInJvbGVcIjogXCJzcHJ1Y2UgbmVlZGxlcywgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiY29uaWZlcl9zcHJ1Y2VfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzRTdGNTZcIixcbiAgICAgIFwicm9sZVwiOiBcInNwcnVjZSBuZWVkbGVzLCBoaWdobGlnaHRcIlxuICAgIH0sXG4gICAgXCJiaXJjaF9iYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2RTFEM1wiLFxuICAgICAgXCJyb2xlXCI6IFwicGFsZSBiaXJjaCB0cnVua1wiXG4gICAgfSxcbiAgICBcImJpcmNoX21hcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0EzNTMwXCIsXG4gICAgICBcInJvbGVcIjogXCJkYXJrIGJpcmNoIGJhcmsgYmFuZFwiXG4gICAgfSxcbiAgICBcImJpcmNoX2xlYWZcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUNDOTVBXCIsXG4gICAgICBcInJvbGVcIjogXCJiaXJjaCBjYW5vcHksIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImJpcmNoX2xlYWZfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCM0Q3NkJcIixcbiAgICAgIFwicm9sZVwiOiBcImJpcmNoIGNhbm9weSwgaGlnaGxpZ2h0XCJcbiAgICB9LFxuICAgIFwiYmVlY2hfYmFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM4RTg5N0RcIixcbiAgICAgIFwicm9sZVwiOiBcInNtb290aCBncmV5IGJlZWNoIHRydW5rXCJcbiAgICB9LFxuICAgIFwiYmVlY2hfbGVhZlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1NThGM0FcIixcbiAgICAgIFwicm9sZVwiOiBcImJlZWNoIGNhbm9weSwgc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcImJlZWNoX2xlYWZfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2N0E0NDVcIixcbiAgICAgIFwicm9sZVwiOiBcImJlZWNoIGNhbm9weSwgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiYnVzaF9kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzQ2N0YzN1wiLFxuICAgICAgXCJyb2xlXCI6IFwiYmVycnkgYnVzaCBsZWF2ZXNcIlxuICAgIH0sXG4gICAgXCJiZXJyeV9yZWRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQzgzOTRBXCIsXG4gICAgICBcInJvbGVcIjogXCJiZXJyaWVzXCJcbiAgICB9LFxuICAgIFwiZmVybl9ncmVlblwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4NkJFNTVcIixcbiAgICAgIFwicm9sZVwiOiBcImZlcm4gZnJvbmRzLCBtYWluXCJcbiAgICB9LFxuICAgIFwiZmVybl9ncmVlbl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGQTc0NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZmVybiBmcm9uZHMsIHNoYWRlXCJcbiAgICB9LFxuICAgIFwiZmxvd2VyX3llbGxvd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNGMkNGNEFcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogbWVhZG93IGZsb3dlciBoZWFkc1wiXG4gICAgfSxcbiAgICBcImZsb3dlcl93aGl0ZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNGNEYxRTRcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogZGFpc3kgZmxvd2VyIGhlYWRzXCJcbiAgICB9LFxuICAgIFwiZmxvd2VyX3Zpb2xldFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QzdCRDZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogdmlvbGV0IGZsb3dlciBoZWFkc1wiXG4gICAgfSxcbiAgICBcIm11c2hyb29tX2NhcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCODQ4M0FcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogZm9yZXN0IG11c2hyb29tIGNhcFwiXG4gICAgfSxcbiAgICBcIm11c2hyb29tX3N0ZW1cIjoge1xuICAgICAgXCJoZXhcIjogXCIjRURFM0NDXCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IG11c2hyb29tIHN0ZW1cIlxuICAgIH0sXG4gICAgXCJtb3NzX2dyZWVuXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVDOEMzQVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiBtb3NzIG9uIGZhbGxlbiBsb2dzXCJcbiAgICB9LFxuICAgIFwib3JlX2NyeXN0YWxcIjoge1xuICAgICAgXCJoZXhcIjogXCIjN0I1QUQ2XCIsXG4gICAgICBcInJvbGVcIjogXCJvcmUgZGVwb3NpdCBhY2NlbnQgKHByb3Bvc2VkLCByZXBsYWNlcyB0ZWFsKVwiXG4gICAgfSxcbiAgICBcIm9yZV9jcnlzdGFsX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUI3QkU4XCIsXG4gICAgICBcInJvbGVcIjogXCJvcmUgaGlnaGxpZ2h0IGZhY2V0XCJcbiAgICB9LFxuICAgIFwibm94ZWxfc3RvbmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZERkNDXCIsXG4gICAgICBcInJvbGVcIjogXCJOb3hlbCBhcmNoaXRlY3R1cmUgbWFpbiBzdG9uZVwiXG4gICAgfSxcbiAgICBcIm5veGVsX3N0b25lX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDNDOUI0XCIsXG4gICAgICBcInJvbGVcIjogXCJOb3hlbCBzZWNvbmRhcnkgc3RvbmUgLyByZWNlc3NcIlxuICAgIH0sXG4gICAgXCJhY2NlbnRfYmx1ZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzRTdGQjhcIixcbiAgICAgIFwicm9sZVwiOiBcImJhbm5lciAvIGNsb3RoIGFjY2VudFwiXG4gICAgfSxcbiAgICBcImFjY2VudF90ZWFsXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJGQTZBMFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2Vjb25kYXJ5IGFjY2VudFwiXG4gICAgfSxcbiAgICBcImVtaXNzaXZlX2ZpcmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRkY5RTRBXCIsXG4gICAgICBcInJvbGVcIjogXCJjYW1wZmlyZSAvIHdhcm0gZW1pc3NpdmUgKGVmZmVjdHMgb25seSlcIlxuICAgIH0sXG4gICAgXCJlbWlzc2l2ZV9tYWdpY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNEMjRCRkZcIixcbiAgICAgIFwicm9sZVwiOiBcInJlc2VydmVkOiBtYWdpYyBlZmZlY3RzIG9ubHksIG5ldmVyIG1hdGVyaWFsc1wiXG4gICAgfVxuICB9LFxuICBcImxpZ2h0aW5nXCI6IHtcbiAgICBcImRhd25cIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogMTIsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMTA1LFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkM3OUFcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDIuMixcbiAgICAgIFwiaGVtaVNreVwiOiBcIiM4RkE2QzhcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM0RTVGNkVcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAwLjYsXG4gICAgICBcInNreVwiOiBcIiNBOEJFRDZcIixcbiAgICAgIFwiZm9nXCI6IFwiI0E4QkVENlwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDA1LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjFcbiAgICB9LFxuICAgIFwibm9vblwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiAzOCxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiA1MCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZGNERDXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAyLjc1LFxuICAgICAgXCJoZW1pU2t5XCI6IFwiI0JGRDlGMlwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzdBOEY1NVwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDAuNTUsXG4gICAgICBcInNreVwiOiBcIiM5RUQyRUVcIixcbiAgICAgIFwiZm9nXCI6IFwiI0RDRUZGOFwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDAyOCxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4wNVxuICAgIH0sXG4gICAgXCJkdXNrXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDksXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMjUwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkIyN0FcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDMuMixcbiAgICAgIFwiaGVtaVNreVwiOiBcIiM4RTdDOUVcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM1QTRBNTBcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAxLjEsXG4gICAgICBcInNreVwiOiBcIiNDOThFODZcIixcbiAgICAgIFwiZm9nXCI6IFwiI0MwOTA4QVwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDAzNixcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4zMlxuICAgIH0sXG4gICAgXCJuaWdodFwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiA0MCxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAyMjAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0FGQzhGRlwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMS4wLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzNBNEM3QVwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzFDMjU0MFwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDEuMDUsXG4gICAgICBcInNreVwiOiBcIiMxMDE3MzZcIixcbiAgICAgIFwiZm9nXCI6IFwiIzE1MUMzQ1wiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDA0NSxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS41XG4gICAgfVxuICB9XG59IiwgIi8vIFZveGVsIGZhY2UgY29sb3VycyBhbmQga2V5cyBzaGFyZWQgYnkgdGhlIG1haW4tdGhyZWFkIHRlcnJhaW4gdmlldyBhbmQgdGhlXG4vLyBjaHVuayB3b3JrZXIuIFB1cmUgZGF0YSArIFRIUkVFLkNvbG9yIG1hdGggKG5vIFdlYkdMIG9iamVjdHMpLlxuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHBhbGV0dGUgZnJvbSAnLi4vZGF0YS9wYWxldHRlLmpzb24nO1xuaW1wb3J0IHsgTUFULCBoYXNoMmkgfSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5leHBvcnQgY29uc3QgTSA9IHBhbGV0dGUubWF0ZXJpYWxzIGFzIFJlY29yZDxzdHJpbmcsIHsgaGV4OiBzdHJpbmcgfT47XG5leHBvcnQgY29uc3QgSCA9IChrOiBzdHJpbmcpID0+IE1ba10uaGV4O1xuXG5leHBvcnQgY29uc3QgY29sb3JDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBUSFJFRS5Db2xvcj4oKTtcbmV4cG9ydCBmdW5jdGlvbiBjKGhleDogc3RyaW5nKTogVEhSRUUuQ29sb3Ige1xuICBsZXQgb3V0ID0gY29sb3JDYWNoZS5nZXQoaGV4KTtcbiAgaWYgKCFvdXQpIHsgb3V0ID0gbmV3IFRIUkVFLkNvbG9yKGhleCk7IGNvbG9yQ2FjaGUuc2V0KGhleCwgb3V0KTsgfVxuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgY29uc3QgQ09MID0ge1xuICBncmFzc1RvcDogW2MoSCgnZ3Jhc3NfdG9wJykpLCBjKEgoJ2dyYXNzX2hpZ2gnKSksIGMoSCgnZ3Jhc3NfcGVhaycpKV0sXG4gIGdyYXNzQ2FwOiBjKEgoJ2dyYXNzX2NhcCcpKSxcbiAgc29pbDogYyhIKCdzdHJhdGFfb2NocmUnKSkuY2xvbmUoKS5tdWx0aXBseVNjYWxhcigwLjc4KSxcbiAgb2NocmU6IGMoSCgnc3RyYXRhX29jaHJlJykpLFxuICBydXN0OiBjKEgoJ3N0cmF0YV9ydXN0JykpLFxuICBzdG9uZVRvcDogYyhIKCdzdG9uZV90b3AnKSksXG4gIHN0b25lQTogYyhIKCdzdG9uZV9ib2R5X2EnKSksXG4gIHN0b25lQjogYyhIKCdzdG9uZV9ib2R5X2InKSksXG4gIHN0b25lU2hhZGU6IGMoSCgnc3RvbmVfc2hhZGUnKSksXG4gIHNhbmQ6IGMoSCgnc2FuZCcpKSxcbiAgZ3JhdmVsOiBjKEgoJ3N0b25lX2JvZHlfYicpKS5jbG9uZSgpLmxlcnAoYyhIKCdzYW5kJykpLCAwLjM1KSxcbiAgb3JlOiBjKEgoJ29yZV9jcnlzdGFsJykpLFxuICBtb3NzOiBjKEgoJ2dyYXNzX2NhcCcpKS5jbG9uZSgpLmxlcnAoYyhIKCdzdG9uZV9ib2R5X2InKSksIDAuMzUpLFxuICBzbm93OiBjKEgoJ3Nub3cnKSksXG4gIHNub3dTaGFkZTogYyhIKCdzbm93JykpLmNsb25lKCkubGVycChjKEgoJ3N0b25lX3NoYWRlJykpLCAwLjM1KSxcbiAgd2F0ZXJSaW06IGMoSCgnd2F0ZXJfcmltJykpLFxuICB3YXRlclNoYWxsb3c6IGMoSCgnd2F0ZXJfc2hhbGxvdycpKSxcbiAgd2F0ZXJNaWQ6IGMoSCgnd2F0ZXJfbWlkJykpLFxuICB3YXRlckRlZXA6IGMoSCgnd2F0ZXJfZGVlcCcpKSxcbn07XG5cbmV4cG9ydCBjb25zdCBTSEFERSA9IFswLjkwLCAwLjk2LCAxLjAsIDEuMDRdO1xuXG4vLyBLZWVwIGEgc21hbGwgcm9sbGluZyB3aW5kb3cgb2YgYnVpbGQgdGltaW5ncyBmb3IgdGhlIHBlcmZvcm1hbmNlIGV2aWRlbmNlLlxuLy8gVGhlc2UgYXJlIGluc3RydW1lbnRhdGlvbiwgbm90IHNpbXVsYXRpb24gc3RhdGUuXG5leHBvcnQgY29uc3QgTUFYX1BFUkZfU0FNUExFUyA9IDEyODtcbmV4cG9ydCBmdW5jdGlvbiByZWNvcmRTYW1wbGUoc2FtcGxlczogbnVtYmVyW10sIG1zOiBudW1iZXIpOiB2b2lkIHtcbiAgc2FtcGxlcy5wdXNoKG1zKTtcbiAgaWYgKHNhbXBsZXMubGVuZ3RoID4gTUFYX1BFUkZfU0FNUExFUykgc2FtcGxlcy5zaGlmdCgpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHBlcmNlbnRpbGUoc2FtcGxlczogbnVtYmVyW10sIHA6IG51bWJlcik6IG51bWJlciB7XG4gIGlmIChzYW1wbGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG4gIGNvbnN0IHNvcnRlZCA9IFsuLi5zYW1wbGVzXS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG4gIGNvbnN0IGkgPSBNYXRoLm1pbihzb3J0ZWQubGVuZ3RoIC0gMSwgTWF0aC5tYXgoMCwgTWF0aC5jZWlsKHAgKiBzb3J0ZWQubGVuZ3RoKSAtIDEpKTtcbiAgcmV0dXJuIE1hdGgucm91bmQoc29ydGVkW2ldICogMTAwKSAvIDEwMDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhlaWdodEJhbmQoeTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHkgPj0gNDUgPyAyIDogeSA+PSAxOCA/IDEgOiAwO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHN0b25lVG9uZSh5OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKCh5ICsgNjQpID4+IDMpICYgMTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBzaGFkZUF0KHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHN4ID0gTWF0aC5mbG9vcih4IC8gMikgKyBNYXRoLmZsb29yKHkgLyAzKSAqIDE3O1xuICBjb25zdCBzeiA9IE1hdGguZmxvb3IoeiAvIDIpO1xuICByZXR1cm4gTWF0aC5mbG9vcihoYXNoMmkoc3gsIHN6LCBzZWVkICsgMzAwKSAqIDQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24ga2V5Rm9yKG1hdDogbnVtYmVyLCB2YXJpYW50OiBudW1iZXIsIHNoYWRlOiBudW1iZXIsIGF4aXM6IG51bWJlciwgZGlyOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKG1hdCAmIDE1KSB8ICgodmFyaWFudCAmIDE1KSA8PCA0KSB8ICgoc2hhZGUgJiAzKSA8PCA4KSB8ICgoYXhpcyAmIDMpIDw8IDEwKSB8ICgoZGlyID4gMCA/IDEgOiAwKSA8PCAxMik7XG59XG5cbmV4cG9ydCBjb25zdCBmYWNlQ29sb3JDYWNoZSA9IG5ldyBNYXA8bnVtYmVyLCBUSFJFRS5Db2xvcj4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNvbG9yRm9yS2V5KGtleTogbnVtYmVyKTogVEhSRUUuQ29sb3Ige1xuICBjb25zdCBjYWNoZWQgPSBmYWNlQ29sb3JDYWNoZS5nZXQoa2V5KTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGNhY2hlZDtcbiAgY29uc3QgbWF0ID0ga2V5ICYgMTU7XG4gIGNvbnN0IHZhcmlhbnQgPSAoa2V5ID4+IDQpICYgMTU7XG4gIGNvbnN0IHNoYWRlID0gKGtleSA+PiA4KSAmIDM7XG4gIGNvbnN0IGF4aXMgPSAoa2V5ID4+IDEwKSAmIDM7XG4gIGNvbnN0IGRpciA9IChrZXkgPj4gMTIpICYgMTtcbiAgbGV0IGNvbG9yOiBUSFJFRS5Db2xvcjtcblxuICBpZiAoYXhpcyA9PT0gMSAmJiBkaXIgPT09IDEpIHtcbiAgICBjb25zdCBoYiA9IE1hdGgubWluKDIsIHZhcmlhbnQgJiAzKTtcbiAgICBpZiAobWF0ID09PSBNQVQuR1JBU1MpIGNvbG9yID0gQ09MLmdyYXNzVG9wW2hiXTtcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5TQU5EKSBjb2xvciA9IENPTC5zYW5kO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULkdSQVZFTCkgY29sb3IgPSBDT0wuZ3JhdmVsO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULlNPSUwpIGNvbG9yID0gQ09MLm9jaHJlO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULk9SRSkgY29sb3IgPSBDT0wub3JlO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULk1PU1MpIGNvbG9yID0gQ09MLm1vc3M7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuU05PVykgY29sb3IgPSBDT0wuc25vdztcbiAgICBlbHNlIGNvbG9yID0gQ09MLnN0b25lVG9wO1xuICB9IGVsc2UgaWYgKGF4aXMgPT09IDEgJiYgZGlyID09PSAwKSB7XG4gICAgY29sb3IgPSBDT0wuc3RvbmVTaGFkZTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBkZXB0aCA9IHZhcmlhbnQgJiA3O1xuICAgIGNvbnN0IHRvbmUgPSAodmFyaWFudCA+PiAzKSAmIDE7XG4gICAgY29uc3QgYm9keSA9IHRvbmUgPyBDT0wuc3RvbmVCIDogQ09MLnN0b25lQTtcbiAgICBpZiAobWF0ID09PSBNQVQuR1JBU1MgfHwgbWF0ID09PSBNQVQuTU9TUykge1xuICAgICAgaWYgKGRlcHRoID09PSAwKSBjb2xvciA9IG1hdCA9PT0gTUFULk1PU1MgPyBDT0wubW9zcyA6IENPTC5ncmFzc0NhcDtcbiAgICAgIGVsc2UgaWYgKGRlcHRoIDw9IDIpIGNvbG9yID0gQ09MLnNvaWw7XG4gICAgICBlbHNlIGlmIChkZXB0aCA9PT0gMykgY29sb3IgPSBDT0wucnVzdDtcbiAgICAgIGVsc2UgY29sb3IgPSBib2R5O1xuICAgIH0gZWxzZSBpZiAobWF0ID09PSBNQVQuU09JTCkge1xuICAgICAgY29sb3IgPSBkZXB0aCA8PSAxID8gQ09MLnNvaWwgOiBib2R5O1xuICAgIH0gZWxzZSBpZiAobWF0ID09PSBNQVQuU0FORCkge1xuICAgICAgY29sb3IgPSBkZXB0aCA8PSAxID8gQ09MLnNhbmQgOiBkZXB0aCA9PT0gMiA/IENPTC5vY2hyZSA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5HUkFWRUwpIHtcbiAgICAgIGNvbG9yID0gZGVwdGggPD0gMSA/IENPTC5ncmF2ZWwgOiBib2R5O1xuICAgIH0gZWxzZSBpZiAobWF0ID09PSBNQVQuT1JFKSB7XG4gICAgICBjb2xvciA9IENPTC5vcmU7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TTk9XKSB7XG4gICAgICBjb2xvciA9IGRlcHRoID09PSAwID8gQ09MLnNub3dTaGFkZSA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5CRURST0NLKSB7XG4gICAgICBjb2xvciA9IENPTC5zdG9uZVNoYWRlO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb2xvciA9IGJvZHk7XG4gICAgfVxuICB9XG5cbiAgY29uc3Qgb3V0ID0gY29sb3IuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihTSEFERVtzaGFkZV0pO1xuICBmYWNlQ29sb3JDYWNoZS5zZXQoa2V5LCBvdXQpO1xuICByZXR1cm4gb3V0O1xufVxuIiwgIi8vIFB1cmUgZ3JlZWR5IHZveGVsIG1lc2hlciBvdmVyIGEgcGFkZGVkIGNodW5rIHZvbHVtZS4gTm8gV29ybGQgYWNjZXNzIGFuZCBub1xuLy8gV2ViR0wgb2JqZWN0cywgc28gaXQgcnVucyBpZGVudGljYWxseSBvbiB0aGUgbWFpbiB0aHJlYWQgYW5kIGluIGEgd29ya2VyLlxuLy9cbi8vIFBhZGRlZCBsYXlvdXQ6IHggYW5kIHogcnVuIGZyb20gLTEgdG8gQ0hVTktfU0laRSAoMzQgY2VsbHMpIHNvIGZhY2VzIG9uIGNodW5rXG4vLyBib3JkZXJzIGNhbiBzZWUgdGhlaXIgbmVpZ2hib3VyczsgeSBydW5zIG92ZXIgdGhlIGZ1bGwgd29ybGQgaGVpZ2h0LiBPdXQgb2Zcbi8vIHJhbmdlIHkgc2FtcGxlcyBhcmUgYmVkcm9jayBiZWxvdyBhbmQgYWlyIGFib3ZlLCBhcyBpbiBnZXRWb3hlbC5cbmltcG9ydCB7XG4gIENIVU5LX1NJWkUsIFdPUkxEX0hFSUdIVCwgWV9NSU4sIE1BVCwgaXNPcGFxdWUsIGxvY2FsSW5kZXgsXG59IGZyb20gJy4uL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBjb2xvckZvcktleSwgaGVpZ2h0QmFuZCwga2V5Rm9yLCBzaGFkZUF0LCBzdG9uZVRvbmUgfSBmcm9tICcuL3ZveGVsLWNvbG9ycyc7XG5cbmV4cG9ydCBjb25zdCBQQUQgPSBDSFVOS19TSVpFICsgMjtcbmV4cG9ydCBjb25zdCBQQURERURfVk9MVU1FID0gUEFEICogUEFEICogV09STERfSEVJR0hUO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1lc2hBcnJheXMge1xuICBwb3NpdGlvbnM6IEZsb2F0MzJBcnJheTtcbiAgbm9ybWFsczogRmxvYXQzMkFycmF5O1xuICBjb2xvcnM6IEZsb2F0MzJBcnJheTtcbiAgbWF0czogRmxvYXQzMkFycmF5O1xuICBpbmRpY2VzOiBVaW50MzJBcnJheTtcbiAgdHJpYW5nbGVzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBwYWRkZWRJbmRleCA9ICh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyID0+XG4gICh4ICsgMSkgKyAoeiArIDEpICogUEFEICsgeSAqIFBBRCAqIFBBRDtcblxuLyoqIENvcHkgYSBjaHVuayBhbmQgaXRzIG9uZS1jZWxsIGJvcmRlciBpbnRvIGEgcGFkZGVkIHZvbHVtZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFBhZGRlZChcbiAgZGF0YTogVWludDhBcnJheSxcbiAgbmVpZ2hib3VyOiAobHg6IG51bWJlciwgeTogbnVtYmVyLCBsejogbnVtYmVyKSA9PiBudW1iZXIsXG4pOiBVaW50OEFycmF5IHtcbiAgY29uc3Qgb3V0ID0gbmV3IFVpbnQ4QXJyYXkoUEFEREVEX1ZPTFVNRSk7XG4gIGZvciAobGV0IHkgPSAwOyB5IDwgV09STERfSEVJR0hUOyB5KyspIHtcbiAgICBmb3IgKGxldCB6ID0gLTE7IHogPD0gQ0hVTktfU0laRTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gLTE7IHggPD0gQ0hVTktfU0laRTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGluc2lkZSA9IHggPj0gMCAmJiB6ID49IDAgJiYgeCA8IENIVU5LX1NJWkUgJiYgeiA8IENIVU5LX1NJWkU7XG4gICAgICAgIG91dFtwYWRkZWRJbmRleCh4LCB5LCB6KV0gPSBpbnNpZGUgPyBkYXRhW2xvY2FsSW5kZXgoeCwgeSwgeildIDogbmVpZ2hib3VyKHgsIHksIHopO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBwb3NGcm9tKGF4aXM6IG51bWJlciwgc2xpY2U6IG51bWJlciwgaTogbnVtYmVyLCBqOiBudW1iZXIsIG91dDogSW50MzJBcnJheSk6IHZvaWQge1xuICBpZiAoYXhpcyA9PT0gMCkgeyBvdXRbMF0gPSBzbGljZTsgb3V0WzFdID0gaTsgb3V0WzJdID0gajsgfVxuICBlbHNlIGlmIChheGlzID09PSAxKSB7IG91dFswXSA9IGo7IG91dFsxXSA9IHNsaWNlOyBvdXRbMl0gPSBpOyB9XG4gIGVsc2UgeyBvdXRbMF0gPSBpOyBvdXRbMV0gPSBqOyBvdXRbMl0gPSBzbGljZTsgfVxufVxuXG5jbGFzcyBHcm93YWJsZSB7XG4gIHByaXZhdGUgYnVmOiBGbG9hdDMyQXJyYXk7XG4gIGxlbmd0aCA9IDA7XG4gIGNvbnN0cnVjdG9yKG46IG51bWJlcikgeyB0aGlzLmJ1ZiA9IG5ldyBGbG9hdDMyQXJyYXkobik7IH1cbiAgcHVzaDMoYTogbnVtYmVyLCBiOiBudW1iZXIsIGM6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICh0aGlzLmxlbmd0aCArIDMgPiB0aGlzLmJ1Zi5sZW5ndGgpIHRoaXMuZ3JvdygpO1xuICAgIHRoaXMuYnVmW3RoaXMubGVuZ3RoKytdID0gYTsgdGhpcy5idWZbdGhpcy5sZW5ndGgrK10gPSBiOyB0aGlzLmJ1Zlt0aGlzLmxlbmd0aCsrXSA9IGM7XG4gIH1cbiAgcHVzaDEoYTogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMubGVuZ3RoICsgMSA+IHRoaXMuYnVmLmxlbmd0aCkgdGhpcy5ncm93KCk7XG4gICAgdGhpcy5idWZbdGhpcy5sZW5ndGgrK10gPSBhO1xuICB9XG4gIHByaXZhdGUgZ3JvdygpOiB2b2lkIHsgY29uc3QgbiA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5idWYubGVuZ3RoICogMik7IG4uc2V0KHRoaXMuYnVmKTsgdGhpcy5idWYgPSBuOyB9XG4gIGRvbmUoKTogRmxvYXQzMkFycmF5IHsgcmV0dXJuIHRoaXMuYnVmLnNsaWNlKDAsIHRoaXMubGVuZ3RoKTsgfVxufVxuXG4vKipcbiAqIEdyZWVkeSAzRCBmYWNlIG1lc2hlci4gQSBmYWNlIGlzIGVtaXR0ZWQgd2hlcmUgYW4gb3BhcXVlIHZveGVsIHRvdWNoZXMgYVxuICogbm9uLW9wYXF1ZSBjZWxsIChhaXIgb3Igd2F0ZXIpOyBvbmx5IHRoZSBjaHVuayB0aGF0IG93bnMgdGhlIHNvbGlkIHZveGVsXG4gKiBlbWl0cyBpdC4gT3V0cHV0IGlzIGlkZW50aWNhbCB0byB0aGUgZm9ybWVyIGluLXBsYWNlIG1lc2hlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lc2hQYWRkZWQoXG4gIHBhZGRlZDogVWludDhBcnJheSwgaGVpZ2h0czogVWludDhBcnJheSwgb3g6IG51bWJlciwgb3o6IG51bWJlciwgc2VlZDogbnVtYmVyLFxuKTogTWVzaEFycmF5cyB7XG4gIGNvbnN0IHNhbXBsZSA9ICh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBpZiAoeSA8IDApIHJldHVybiBNQVQuQkVEUk9DSztcbiAgICBpZiAoeSA+PSBXT1JMRF9IRUlHSFQpIHJldHVybiBNQVQuQUlSO1xuICAgIHJldHVybiBwYWRkZWRbcGFkZGVkSW5kZXgoeCwgeSwgeildO1xuICB9O1xuICBjb25zdCBwb3NpdGlvbnMgPSBuZXcgR3Jvd2FibGUoMSA8PCAxNSksIG5vcm1hbHMgPSBuZXcgR3Jvd2FibGUoMSA8PCAxNSk7XG4gIGNvbnN0IGNvbG9ycyA9IG5ldyBHcm93YWJsZSgxIDw8IDE1KSwgbWF0cyA9IG5ldyBHcm93YWJsZSgxIDw8IDEzKTtcbiAgbGV0IGluZGljZXMgPSBuZXcgVWludDMyQXJyYXkoMSA8PCAxNCk7XG4gIGxldCBpbmRleENvdW50ID0gMDtcbiAgbGV0IHZlcnRleENvdW50ID0gMDtcbiAgY29uc3QgZGltcyA9IFtDSFVOS19TSVpFLCBXT1JMRF9IRUlHSFQsIENIVU5LX1NJWkVdO1xuICBjb25zdCBwYSA9IG5ldyBJbnQzMkFycmF5KDMpLCBwYiA9IG5ldyBJbnQzMkFycmF5KDMpO1xuICBjb25zdCBjb3JuZXJzID0gbmV3IEZsb2F0MzJBcnJheSgxMik7XG5cbiAgY29uc3QgZW1pdFF1YWQgPSAoYXhpczogbnVtYmVyLCBkaXI6IG51bWJlciwgc2xpY2U6IG51bWJlcixcbiAgICBpMDogbnVtYmVyLCBqMDogbnVtYmVyLCB3OiBudW1iZXIsIGg6IG51bWJlciwga2V5OiBudW1iZXIpID0+IHtcbiAgICBjb25zdCBwbGFuZSA9IHNsaWNlICsgMTtcbiAgICBjb25zdCB1MCA9IGkwLCB1MSA9IGkwICsgdywgdjAgPSBqMCwgdjEgPSBqMCArIGg7XG4gICAgY29uc3Qgc2V0ID0gKGs6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcikgPT4geyBjb3JuZXJzW2sgKiAzXSA9IHg7IGNvcm5lcnNbayAqIDMgKyAxXSA9IHk7IGNvcm5lcnNbayAqIDMgKyAyXSA9IHo7IH07XG4gICAgaWYgKGF4aXMgPT09IDApIHtcbiAgICAgIGNvbnN0IHggPSBveCArIHBsYW5lLCB5MCA9IFlfTUlOICsgdTAsIHkxID0gWV9NSU4gKyB1MSwgejAgPSBveiArIHYwLCB6MSA9IG96ICsgdjE7XG4gICAgICBpZiAoZGlyID4gMCkgeyBzZXQoMCwgeCwgeTAsIHowKTsgc2V0KDEsIHgsIHkxLCB6MCk7IHNldCgyLCB4LCB5MSwgejEpOyBzZXQoMywgeCwgeTAsIHoxKTsgfVxuICAgICAgZWxzZSB7IHNldCgwLCB4LCB5MCwgejApOyBzZXQoMSwgeCwgeTAsIHoxKTsgc2V0KDIsIHgsIHkxLCB6MSk7IHNldCgzLCB4LCB5MSwgejApOyB9XG4gICAgfSBlbHNlIGlmIChheGlzID09PSAxKSB7XG4gICAgICBjb25zdCB5ID0gWV9NSU4gKyBwbGFuZSwgejAgPSBveiArIHUwLCB6MSA9IG96ICsgdTEsIHgwID0gb3ggKyB2MCwgeDEgPSBveCArIHYxO1xuICAgICAgaWYgKGRpciA+IDApIHsgc2V0KDAsIHgwLCB5LCB6MCk7IHNldCgxLCB4MCwgeSwgejEpOyBzZXQoMiwgeDEsIHksIHoxKTsgc2V0KDMsIHgxLCB5LCB6MCk7IH1cbiAgICAgIGVsc2UgeyBzZXQoMCwgeDAsIHksIHowKTsgc2V0KDEsIHgxLCB5LCB6MCk7IHNldCgyLCB4MSwgeSwgejEpOyBzZXQoMywgeDAsIHksIHoxKTsgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB6ID0gb3ogKyBwbGFuZSwgeDAgPSBveCArIHUwLCB4MSA9IG94ICsgdTEsIHkwID0gWV9NSU4gKyB2MCwgeTEgPSBZX01JTiArIHYxO1xuICAgICAgaWYgKGRpciA+IDApIHsgc2V0KDAsIHgwLCB5MCwgeik7IHNldCgxLCB4MSwgeTAsIHopOyBzZXQoMiwgeDEsIHkxLCB6KTsgc2V0KDMsIHgwLCB5MSwgeik7IH1cbiAgICAgIGVsc2UgeyBzZXQoMCwgeDAsIHkwLCB6KTsgc2V0KDEsIHgwLCB5MSwgeik7IHNldCgyLCB4MSwgeTEsIHopOyBzZXQoMywgeDEsIHkwLCB6KTsgfVxuICAgIH1cbiAgICBjb25zdCBjb2xvciA9IGNvbG9yRm9yS2V5KGtleSk7XG4gICAgY29uc3QgbWF0ID0ga2V5ICYgMTU7XG4gICAgY29uc3QgbnggPSBheGlzID09PSAwID8gZGlyIDogMCwgbnkgPSBheGlzID09PSAxID8gZGlyIDogMCwgbnogPSBheGlzID09PSAyID8gZGlyIDogMDtcbiAgICBjb25zdCBiYXNlID0gdmVydGV4Q291bnQ7XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCA0OyBrKyspIHtcbiAgICAgIHBvc2l0aW9ucy5wdXNoMyhjb3JuZXJzW2sgKiAzXSwgY29ybmVyc1trICogMyArIDFdLCBjb3JuZXJzW2sgKiAzICsgMl0pO1xuICAgICAgbm9ybWFscy5wdXNoMyhueCwgbnksIG56KTtcbiAgICAgIGNvbG9ycy5wdXNoMyhjb2xvci5yLCBjb2xvci5nLCBjb2xvci5iKTtcbiAgICAgIG1hdHMucHVzaDEobWF0KTtcbiAgICB9XG4gICAgdmVydGV4Q291bnQgKz0gNDtcbiAgICBpZiAoaW5kZXhDb3VudCArIDYgPiBpbmRpY2VzLmxlbmd0aCkgeyBjb25zdCBuID0gbmV3IFVpbnQzMkFycmF5KGluZGljZXMubGVuZ3RoICogMik7IG4uc2V0KGluZGljZXMpOyBpbmRpY2VzID0gbjsgfVxuICAgIGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2U7IGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2UgKyAxOyBpbmRpY2VzW2luZGV4Q291bnQrK10gPSBiYXNlICsgMjtcbiAgICBpbmRpY2VzW2luZGV4Q291bnQrK10gPSBiYXNlOyBpbmRpY2VzW2luZGV4Q291bnQrK10gPSBiYXNlICsgMjsgaW5kaWNlc1tpbmRleENvdW50KytdID0gYmFzZSArIDM7XG4gIH07XG5cbiAgZm9yIChsZXQgYXhpcyA9IDA7IGF4aXMgPCAzOyBheGlzKyspIHtcbiAgICBjb25zdCB1ID0gKGF4aXMgKyAxKSAlIDMsIHYgPSAoYXhpcyArIDIpICUgMztcbiAgICBjb25zdCBkdSA9IGRpbXNbdV0sIGR2ID0gZGltc1t2XSwgZGQgPSBkaW1zW2F4aXNdO1xuICAgIGNvbnN0IG1hc2sgPSBuZXcgVWludDE2QXJyYXkoZHUgKiBkdik7XG4gICAgZm9yIChsZXQgc2xpY2UgPSAtMTsgc2xpY2UgPCBkZDsgc2xpY2UrKykge1xuICAgICAgbWFzay5maWxsKDApO1xuICAgICAgbGV0IGFueSA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBkdjsgaisrKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZHU7IGkrKykge1xuICAgICAgICAgIHBvc0Zyb20oYXhpcywgc2xpY2UsIGksIGosIHBhKTtcbiAgICAgICAgICBwb3NGcm9tKGF4aXMsIHNsaWNlICsgMSwgaSwgaiwgcGIpO1xuICAgICAgICAgIGNvbnN0IGEgPSBzYW1wbGUocGFbMF0sIHBhWzFdLCBwYVsyXSk7XG4gICAgICAgICAgY29uc3QgYiA9IHNhbXBsZShwYlswXSwgcGJbMV0sIHBiWzJdKTtcbiAgICAgICAgICBjb25zdCBhbyA9IGlzT3BhcXVlKGEpLCBibyA9IGlzT3BhcXVlKGIpO1xuICAgICAgICAgIGlmIChhbyA9PT0gYm8pIGNvbnRpbnVlO1xuICAgICAgICAgIGNvbnN0IGFJbnNpZGUgPSBzbGljZSA+PSAwICYmIHNsaWNlIDwgZGQ7XG4gICAgICAgICAgY29uc3QgYkluc2lkZSA9IHNsaWNlICsgMSA+PSAwICYmIHNsaWNlICsgMSA8IGRkO1xuICAgICAgICAgIGxldCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBtYXQ6IG51bWJlciwgZGlyOiBudW1iZXI7XG4gICAgICAgICAgaWYgKGFvICYmICFibyAmJiBhSW5zaWRlKSB7IHggPSBwYVswXTsgeSA9IHBhWzFdOyB6ID0gcGFbMl07IG1hdCA9IGE7IGRpciA9IDE7IH1cbiAgICAgICAgICBlbHNlIGlmIChibyAmJiAhYW8gJiYgYkluc2lkZSkgeyB4ID0gcGJbMF07IHkgPSBwYlsxXTsgeiA9IHBiWzJdOyBtYXQgPSBiOyBkaXIgPSAtMTsgfVxuICAgICAgICAgIGVsc2UgY29udGludWU7XG4gICAgICAgICAgY29uc3Qgd3kgPSBZX01JTiArIHk7XG4gICAgICAgICAgY29uc3Qgc3VyZmFjZVkgPSBoZWlnaHRzW3ogKiBDSFVOS19TSVpFICsgeF0gKyBZX01JTjtcbiAgICAgICAgICBjb25zdCBkZXB0aCA9IHN1cmZhY2VZIC0gKHd5ICsgMSk7XG4gICAgICAgICAgbGV0IHZhcmlhbnQ6IG51bWJlcjtcbiAgICAgICAgICBpZiAoYXhpcyA9PT0gMSAmJiBkaXIgPiAwKSB2YXJpYW50ID0gaGVpZ2h0QmFuZCh3eSk7XG4gICAgICAgICAgZWxzZSBpZiAoYXhpcyA9PT0gMSAmJiBkaXIgPCAwKSB2YXJpYW50ID0gMTU7XG4gICAgICAgICAgZWxzZSB2YXJpYW50ID0gKE1hdGgubWF4KDAsIE1hdGgubWluKDcsIGRlcHRoKSkgJiA3KSB8IChzdG9uZVRvbmUod3kpIDw8IDMpO1xuICAgICAgICAgIG1hc2tbaiAqIGR1ICsgaV0gPSBrZXlGb3IobWF0LCB2YXJpYW50LCBzaGFkZUF0KG94ICsgeCwgd3ksIG96ICsgeiwgc2VlZCksIGF4aXMsIGRpcik7XG4gICAgICAgICAgYW55ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKCFhbnkpIGNvbnRpbnVlO1xuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBkdjsgaisrKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZHU7KSB7XG4gICAgICAgICAgY29uc3Qga2V5ID0gbWFza1tqICogZHUgKyBpXTtcbiAgICAgICAgICBpZiAoIWtleSkgeyBpKys7IGNvbnRpbnVlOyB9XG4gICAgICAgICAgbGV0IHcgPSAxO1xuICAgICAgICAgIHdoaWxlIChpICsgdyA8IGR1ICYmIG1hc2tbaiAqIGR1ICsgaSArIHddID09PSBrZXkpIHcrKztcbiAgICAgICAgICBsZXQgaCA9IDE7XG4gICAgICAgICAgb3V0ZXI6IHdoaWxlIChqICsgaCA8IGR2KSB7XG4gICAgICAgICAgICBmb3IgKGxldCBrID0gMDsgayA8IHc7IGsrKykgaWYgKG1hc2tbKGogKyBoKSAqIGR1ICsgaSArIGtdICE9PSBrZXkpIGJyZWFrIG91dGVyO1xuICAgICAgICAgICAgaCsrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBmb3IgKGxldCBqaiA9IDA7IGpqIDwgaDsgamorKykgZm9yIChsZXQgaWkgPSAwOyBpaSA8IHc7IGlpKyspIG1hc2tbKGogKyBqaikgKiBkdSArIGkgKyBpaV0gPSAwO1xuICAgICAgICAgIGVtaXRRdWFkKGF4aXMsIChrZXkgPj4gMTIpICYgMSA/IDEgOiAtMSwgc2xpY2UsIGksIGosIHcsIGgsIGtleSk7XG4gICAgICAgICAgaSArPSB3O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiB7XG4gICAgcG9zaXRpb25zOiBwb3NpdGlvbnMuZG9uZSgpLCBub3JtYWxzOiBub3JtYWxzLmRvbmUoKSwgY29sb3JzOiBjb2xvcnMuZG9uZSgpLCBtYXRzOiBtYXRzLmRvbmUoKSxcbiAgICBpbmRpY2VzOiBpbmRpY2VzLnNsaWNlKDAsIGluZGV4Q291bnQpLCB0cmlhbmdsZXM6IGluZGV4Q291bnQgLyAzLFxuICB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFBLE9BQU8sVUFBVTtBQUNqQixPQUFPLFlBQVk7OztBQ09uQixJQUFNLFNBQVMsb0JBQUksUUFBNkI7QUFlekMsU0FBUyxjQUFjLE9BQXdCO0FBQ3BELFNBQU8sT0FBTyxJQUFJLEtBQUssR0FBRyxVQUFVO0FBQ3RDOzs7QUN0Qk8sSUFBTSxRQUFRLENBQUMsR0FBVyxHQUFXLE1BQWUsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUk7QUFDNUUsSUFBTSxPQUFPLENBQUMsR0FBVyxHQUFXLE1BQWMsS0FBSyxJQUFJLEtBQUs7QUFDaEUsSUFBTSxhQUFhLENBQUMsSUFBWSxJQUFZLE1BQWM7QUFDL0QsUUFBTSxJQUFJLE9BQU8sSUFBSSxPQUFPLEtBQUssS0FB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RyxDQUFDLEdBQUcsS0FBSyxTQUFTLE9BQU8sQ0FBQyxDQUFDO0FBQzlFLFdBQU8sTUFBTSxpQkFBaUIsV0FBVyxJQUFJLEdBQUcsR0FBRyxpREFBaUQ7QUFDcEcsV0FBTyxPQUFPLE1BQU0saUJBQWlCLFlBQVksR0FBRyxPQUFPLEdBQUcsSUFBSSxHQUFHLGlCQUFpQjtBQUV0RixhQUFTLEtBQUssSUFBSSxNQUFNLEdBQUcsS0FBTSxVQUFTLEtBQUssSUFBSSxNQUFNLEdBQUcsTUFBTTtBQUFFLGtCQUFZLE1BQU0sS0FBSyxJQUFJLEtBQUssRUFBRTtBQUFHLGtCQUFZLFdBQVcsS0FBSyxJQUFJLEtBQUssRUFBRTtBQUFBLElBQUc7QUFDbkosVUFBTSxLQUFLLFVBQVUsTUFBTSxDQUFDO0FBQzVCLFVBQU0sS0FBSyxXQUFXLFVBQVUsV0FBVyxDQUFDLEdBQUcsRUFBRSxTQUFTLGFBQWEsRUFBRSxHQUFHLGFBQWEsRUFBRSxHQUFHLElBQUk7QUFDbEcsV0FBTyxVQUFVLE1BQU0sS0FBSyxHQUFHLFNBQVMsR0FBRyxNQUFNLEtBQUssR0FBRyxTQUFTLGFBQWEsVUFBVSxFQUFFLEtBQUssQ0FBQztBQUNqRyxXQUFPLFVBQVUsTUFBTSxLQUFLLEdBQUcsT0FBTyxHQUFHLE1BQU0sS0FBSyxHQUFHLFNBQVMsTUFBTyxLQUFLLENBQUM7QUFBQSxFQUMvRSxDQUFDO0FBQ0g7IiwKICAibmFtZXMiOiBbImMiLCAiYSIsICJiIiwgInNtb290aCIsICJUSFJFRSIsICJUSFJFRSIsICJNIiwgIkgiLCAiYyJdCn0K
