// tests/m004.fauna.test.ts
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
function residentChunkAt(world, x, z) {
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return null;
  return world.chunks.get(chunkKey(worldToChunkX(x), worldToChunkZ(z))) ?? null;
}
function residentSurfaceAt(world, x, z) {
  const chunk = residentChunkAt(world, x, z);
  if (!chunk) return null;
  return chunk.heights[worldToLocalZ(z) * CHUNK_SIZE + worldToLocalX(x)] + Y_MIN + 1;
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

// src/sim/fauna.ts
var SPECIES = {
  deer: {
    id: "deer",
    label: "Red deer",
    habitat: "forest_edge",
    length: 1.7,
    walkSpeed: 1.2,
    fleeSpeed: 8.5,
    wariness: 14,
    groupMin: 2,
    groupMax: 4,
    range: 28,
    yields: { food: 12, hide: 2 },
    diurnal: true
  },
  rabbit: {
    id: "rabbit",
    label: "Hare",
    habitat: "meadow",
    length: 0.45,
    walkSpeed: 0.9,
    fleeSpeed: 6.5,
    wariness: 6,
    groupMin: 1,
    groupMax: 3,
    range: 14,
    yields: { food: 2, hide: 1 },
    diurnal: true
  },
  trout: {
    id: "trout",
    label: "Brown trout",
    habitat: "water",
    length: 0.4,
    walkSpeed: 0.6,
    fleeSpeed: 3.5,
    wariness: 3.5,
    groupMin: 4,
    groupMax: 7,
    range: 10,
    yields: { food: 2 },
    diurnal: false
  },
  fox: {
    id: "fox",
    label: "Red fox",
    habitat: "forest_edge",
    length: 0.95,
    walkSpeed: 1.5,
    fleeSpeed: 7,
    wariness: 11,
    groupMin: 1,
    groupMax: 1,
    range: 30,
    yields: { food: 3, hide: 1 },
    diurnal: false,
    fearsSpecies: ["wolf"]
  },
  wolf: {
    id: "wolf",
    label: "Grey wolf",
    habitat: "forest_edge",
    length: 1.3,
    walkSpeed: 1.8,
    fleeSpeed: 8,
    wariness: 20,
    groupMin: 2,
    groupMax: 4,
    range: 40,
    yields: { food: 8, hide: 2 },
    diurnal: false
  }
};
var FEARS = {
  rabbit: ["fox", "wolf"],
  deer: ["wolf"],
  fox: ["wolf"]
};
var PREDATOR_ALARM = 9;
var FAUNA_STEP = 0.1;
function rand(c) {
  c.rng = c.rng + 1831565813 >>> 0;
  let t = c.rng;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function residentWaterAt(world, x, z) {
  const bed = residentSurfaceAt(world, x, z);
  if (bed === null) return null;
  let y = bed;
  while (y < bed + 24 && residentVoxelAt(world, x, y, z) === MAT.WATER) y++;
  return y > bed ? { bed, top: y } : null;
}
function landOk(world, x, z, maxSlope = 1) {
  const fx = Math.floor(x), fz = Math.floor(z);
  const h = residentSurfaceAt(world, fx, fz);
  if (h === null) return null;
  const top = residentVoxelAt(world, fx, h - 1, fz);
  if (top !== MAT.GRASS && top !== MAT.SOIL && top !== MAT.MOSS) return null;
  if (residentVoxelAt(world, fx, h, fz) !== MAT.AIR) return null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = residentSurfaceAt(world, fx + dx, fz + dz);
    if (n === null || Math.abs(n - h) > maxSlope) return null;
  }
  return h;
}
function spawnChunkFauna(world, cx, cz) {
  const key = chunkKey(cx, cz);
  if (!world.chunks.has(key)) return [];
  const seed = world.seed;
  const rnd = mulberry32(hash2i(cx, cz, seed + 7771) * 4294967296 >>> 0);
  const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
  const out = [];
  let index = 0;
  let trees = 0;
  for (const id of world.entityChunks.get(key) ?? []) {
    const e = world.entities.get(id);
    if (e && !e.harvested && !isRetiredStoneKind(e.kind) && e.kind.startsWith("styl_tree_")) trees++;
  }
  let water = 0, wx = 0, wz = 0;
  const grass = [];
  for (let lz = 2; lz < CHUNK_SIZE; lz += 4) {
    for (let lx = 2; lx < CHUNK_SIZE; lx += 4) {
      const x = ox + lx, z = oz + lz;
      const w = residentWaterAt(world, x, z);
      if (w && w.top - w.bed >= 1.2) {
        water++;
        wx += x;
        wz += z;
      } else if (landOk(world, x, z) !== null) grass.push({ x, z });
    }
  }
  const make = (species, x, z, y) => {
    const c = {
      id: `fauna:${species}:${key}:${index++}`,
      species,
      tier: "ambient",
      chunk: key,
      x,
      y,
      z,
      heading: rnd() * Math.PI * 2,
      homeX: x,
      homeZ: z,
      behaviour: species === "trout" ? "swim" : "graze",
      timer: 1 + rnd() * 4,
      goalX: x,
      goalZ: z,
      depthPref: 0.3 + rnd() * 0.5,
      speed: 0,
      rng: rnd() * 4294967296 >>> 0
    };
    return c;
  };
  if (water >= 8 && rnd() < 0.7) {
    const cxw = wx / water, czw = wz / water;
    const n = SPECIES.trout.groupMin + Math.floor(rnd() * (SPECIES.trout.groupMax - SPECIES.trout.groupMin + 1));
    for (let i = 0; i < n; i++) {
      const x = cxw + (rnd() - 0.5) * 4, z = czw + (rnd() - 0.5) * 4;
      const w = residentWaterAt(world, Math.floor(x), Math.floor(z));
      if (!w || w.top - w.bed < 1) continue;
      out.push(make("trout", x, z, w.bed + (w.top - w.bed) * 0.5));
    }
  }
  if (grass.length >= 6) {
    const species = trees >= 3 && rnd() < 0.42 ? "deer" : trees <= 2 && rnd() < 0.45 ? "rabbit" : null;
    if (species) {
      const def = SPECIES[species];
      const at = grass[Math.floor(rnd() * grass.length)];
      const n = def.groupMin + Math.floor(rnd() * (def.groupMax - def.groupMin + 1));
      for (let i = 0; i < n; i++) {
        const x = at.x + 0.5 + (rnd() - 0.5) * 6, z = at.z + 0.5 + (rnd() - 0.5) * 6;
        const h = landOk(world, x, z);
        if (h !== null) out.push(make(species, x, z, h));
      }
    }
  }
  if (grass.length >= 4) {
    const r2 = mulberry32(hash2i(cx, cz, seed + 7772) * 4294967296 >>> 0);
    const kind = trees >= 6 && r2() < 0.16 ? "wolf" : trees >= 2 && trees <= 5 && r2() < 0.26 ? "fox" : null;
    if (kind) {
      const def = SPECIES[kind];
      const at = grass[Math.floor(r2() * grass.length)];
      const n = def.groupMin + Math.floor(r2() * (def.groupMax - def.groupMin + 1));
      let leader;
      for (let i = 0; i < n; i++) {
        const x = at.x + 0.5 + (r2() - 0.5) * 4, z = at.z + 0.5 + (r2() - 0.5) * 4;
        const h = landOk(world, x, z);
        if (h === null) continue;
        const c = {
          id: `fauna:${kind}:${key}:${index++}`,
          species: kind,
          tier: "ambient",
          chunk: key,
          x,
          y: h,
          z,
          heading: r2() * Math.PI * 2,
          homeX: x,
          homeZ: z,
          behaviour: "rest",
          timer: 2 + r2() * 5,
          goalX: x,
          goalZ: z,
          depthPref: 0,
          speed: 0,
          rng: r2() * 4294967296 >>> 0
        };
        if (kind === "wolf") {
          if (leader) c.leader = leader;
          else leader = c.id;
        }
        out.push(c);
      }
    }
  }
  return out;
}
function nearestThreat(c, ctx) {
  let best = null;
  for (const t of ctx.threats) {
    const d = Math.hypot(t.x - c.x, t.z - c.z);
    if (!best || d < best.d) best = { d, x: t.x, z: t.z };
  }
  const fears = FEARS[c.species];
  if (fears && ctx.predators) {
    for (const p of ctx.predators) {
      if (!fears.includes(p.species)) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      const scaled = d * (SPECIES[c.species].wariness / PREDATOR_ALARM);
      if (d < PREDATOR_ALARM && (!best || scaled < best.d)) best = { d: scaled, x: p.x, z: p.z, predator: true };
    }
  }
  return best;
}
function stepCreature(world, c, ctx) {
  const def = SPECIES[c.species];
  const dt = FAUNA_STEP;
  const threat = nearestThreat(c, ctx);
  c.timer -= dt;
  if (def.habitat === "water") {
    stepFish(world, c, def, ctx, threat);
    return;
  }
  if (c.species === "fox") foxHunt(c, def, ctx, threat);
  if (threat && threat.d < def.wariness && c.behaviour !== "flee") {
    c.behaviour = "flee";
    c.timer = 2.5 + rand(c) * 2;
  } else if (c.behaviour === "stalk" || c.behaviour === "chase") {
  } else if (c.leader && ctx.leaders?.has(c.leader)) {
    packFollow(c, def, ctx.leaders.get(c.leader));
  } else if (c.timer <= 0) {
    const sleepy = def.diurnal && ctx.night;
    const r = rand(c);
    if (sleepy) {
      c.behaviour = "sleep";
      c.timer = 8 + r * 10;
    } else if (r < 0.45) {
      c.behaviour = "graze";
      c.timer = 3 + rand(c) * 5;
    } else if (r < 0.62) {
      c.behaviour = "rest";
      c.timer = 4 + rand(c) * 6;
    } else {
      c.behaviour = "wander";
      c.timer = 6;
      const a = rand(c) * Math.PI * 2, d = rand(c) * def.range;
      c.goalX = c.homeX + Math.cos(a) * d;
      c.goalZ = c.homeZ + Math.sin(a) * d;
    }
  }
  let tx = 0, tz = 0, speed = 0;
  if (c.behaviour === "flee" && threat) {
    const dx = c.x - threat.x, dz = c.z - threat.z, len = Math.hypot(dx, dz) || 1;
    tx = dx / len;
    tz = dz / len;
    speed = def.fleeSpeed;
    if (c.timer <= 0) {
      c.behaviour = "idle";
      c.timer = 1;
      c.homeX = c.x;
      c.homeZ = c.z;
    }
  } else if (c.behaviour === "stalk" || c.behaviour === "chase") {
    const dx = c.goalX - c.x, dz = c.goalZ - c.z, len = Math.hypot(dx, dz) || 1;
    tx = dx / len;
    tz = dz / len;
    speed = c.behaviour === "chase" ? def.fleeSpeed * 0.8 : def.walkSpeed * 0.7;
  } else if (c.behaviour === "follow") {
    const dx = c.goalX - c.x, dz = c.goalZ - c.z, len = Math.hypot(dx, dz) || 1;
    tx = dx / len;
    tz = dz / len;
    speed = def.walkSpeed * 1.4;
  } else if (c.behaviour === "wander") {
    const dx = c.goalX - c.x, dz = c.goalZ - c.z, len = Math.hypot(dx, dz);
    if (len < 0.5) {
      c.behaviour = "graze";
      c.timer = 2 + rand(c) * 3;
    } else {
      tx = dx / len;
      tz = dz / len;
      speed = def.walkSpeed;
    }
  } else if (c.behaviour === "graze" && rand(c) < 0.04) {
    const a = c.heading + (rand(c) - 0.5);
    tx = Math.sin(a);
    tz = Math.cos(a);
    speed = def.walkSpeed * 0.4;
  }
  if (speed > 0) {
    const base = Math.atan2(tx, tz);
    let moved = false;
    for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const a = base + off;
      const nx = c.x + Math.sin(a) * speed * dt, nz = c.z + Math.cos(a) * speed * dt;
      const h = landOk(world, nx, nz, 1);
      if (h === null) continue;
      c.x = nx;
      c.z = nz;
      c.y = h;
      c.heading = turn(c.heading, a, 8 * dt);
      moved = true;
      break;
    }
    if (!moved && c.behaviour === "wander") {
      c.behaviour = "idle";
      c.timer = 1;
    }
    c.speed = moved ? speed : 0;
  } else {
    c.speed = 0;
  }
}
function foxHunt(c, def, ctx, threat) {
  if (ctx.night === false && c.behaviour === "sleep") return;
  if (c.behaviour === "stalk" || c.behaviour === "chase") {
    let best = null;
    for (const p of ctx.prey ?? []) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (!best || d < best.d) best = { d, x: p.x, z: p.z };
    }
    if (!best || best.d > 20 || c.timer <= 0 || threat && threat.d < def.wariness * 0.5) {
      c.behaviour = "rest";
      c.timer = 4 + rand(c) * 4;
      return;
    }
    c.goalX = best.x;
    c.goalZ = best.z;
    if (c.behaviour === "stalk" && best.d < 3.5) {
      c.behaviour = "chase";
      c.timer = 2;
    }
    if (c.behaviour === "chase" && best.d < 0.6) {
      c.behaviour = "rest";
      c.timer = 6;
    }
    return;
  }
  if (c.timer <= 0 && ctx.prey && !(threat && threat.d < def.wariness)) {
    for (const p of ctx.prey) {
      if (Math.hypot(p.x - c.x, p.z - c.z) < 13 && rand(c) < 0.6) {
        c.behaviour = "stalk";
        c.timer = 12;
        c.goalX = p.x;
        c.goalZ = p.z;
        return;
      }
    }
  }
}
function packFollow(c, def, leader) {
  const d = Math.hypot(leader.x - c.x, leader.z - c.z);
  if (d > 5) {
    c.behaviour = "follow";
    const a = rand(c) * Math.PI * 2;
    c.goalX = leader.x + Math.cos(a) * 3;
    c.goalZ = leader.z + Math.sin(a) * 3;
    c.timer = 1;
  } else if (c.behaviour === "follow" || c.timer <= 0) {
    const calm = leader.behaviour === "rest" || leader.behaviour === "sleep" || leader.behaviour === "graze" || leader.behaviour === "idle";
    c.behaviour = calm ? leader.behaviour === "sleep" ? "sleep" : "rest" : "wander";
    c.timer = 3 + rand(c) * 4;
    c.goalX = leader.x + (rand(c) - 0.5) * 8;
    c.goalZ = leader.z + (rand(c) - 0.5) * 8;
  }
  void def;
}
function stepFish(world, c, def, ctx, threat) {
  const dt = FAUNA_STEP;
  const hydro = hydrologyFor(world.seed, world.params.generatorVersion);
  if (threat && threat.d < def.wariness) {
    c.behaviour = "scatter";
    c.timer = 1.5 + rand(c);
  } else if (c.timer <= 0) {
    c.behaviour = "swim";
    c.timer = 2 + rand(c) * 3;
    const a = rand(c) * Math.PI * 2, d = rand(c) * def.range;
    c.goalX = c.homeX + Math.cos(a) * d;
    c.goalZ = c.homeZ + Math.sin(a) * d;
    c.depthPref = 0.25 + rand(c) * 0.55;
  }
  let tx, tz, speed;
  if (c.behaviour === "scatter" && threat) {
    const dx = c.x - threat.x, dz = c.z - threat.z, len = Math.hypot(dx, dz) || 1;
    tx = dx / len;
    tz = dz / len;
    speed = def.fleeSpeed;
  } else {
    const dx = c.goalX - c.x, dz = c.goalZ - c.z, len = Math.hypot(dx, dz) || 1;
    tx = dx / len;
    tz = dz / len;
    speed = len < 0.4 ? 0 : def.walkSpeed;
    const w = residentWaterAt(world, Math.floor(c.x), Math.floor(c.z));
    if (w) {
      const f = hydro.flowAt(c.x, c.z, w.top);
      if (f.speed > 0.2) {
        tx = tx * 0.5 - f.dx * 0.5;
        tz = tz * 0.5 - f.dz * 0.5;
      }
    }
  }
  const base = Math.atan2(tx, tz);
  let moved = false;
  for (const off of [0, 0.6, -0.6, 1.3, -1.3, 2.2, -2.2]) {
    const a = base + off;
    const nx = c.x + Math.sin(a) * speed * dt, nz = c.z + Math.cos(a) * speed * dt;
    const w = residentWaterAt(world, Math.floor(nx), Math.floor(nz));
    if (!w || w.top - w.bed < 0.8) continue;
    c.x = nx;
    c.z = nz;
    const goalY = w.top - 0.35 - (w.top - w.bed - 0.7) * c.depthPref;
    c.y += (goalY - c.y) * Math.min(1, 3 * dt);
    c.y = Math.min(w.top - 0.25, Math.max(w.bed + 0.2, c.y));
    c.heading = turn(c.heading, a, 6 * dt);
    moved = true;
    break;
  }
  c.speed = moved ? speed : 0;
  if (!moved) {
    c.goalX = c.homeX;
    c.goalZ = c.homeZ;
  }
  void ctx;
}
function turn(from, to, rate) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * Math.min(1, rate);
}

// tests/m004.fauna.test.ts
function region(seed, cx0, cz0, r) {
  const world = createWorld(seed, GENERATOR_V2);
  for (let cz = cz0 - r - 1; cz <= cz0 + r + 1; cz++) for (let cx = cx0 - r - 1; cx <= cx0 + r + 1; cx++) ensureChunk(world, cx, cz);
  const creatures = [];
  for (let cz = cz0 - r; cz <= cz0 + r; cz++) for (let cx = cx0 - r; cx <= cx0 + r; cx++) creatures.push(...spawnChunkFauna(world, cx, cz));
  return { world, creatures };
}
test("ambient fauna spawns deterministically with stable ids and valid habitat", () => {
  const a = region(1337, 29, 29, 3), b = region(1337, 29, 29, 3);
  assert.deepEqual(a.creatures, b.creatures);
  const species = new Set(a.creatures.map((c) => c.species));
  assert.ok(a.creatures.length > 10, `creatures ${a.creatures.length}`);
  assert.ok(species.has("trout"), "fish in the river/lake");
  assert.ok(species.has("deer") || species.has("rabbit"), "land animals");
  for (const c of a.creatures) {
    assert.match(c.id, /^fauna:(deer|rabbit|trout|fox|wolf):\d+,\d+:\d+$/);
    assert.equal(c.tier, "ambient");
    if (c.species === "trout") {
      const w = residentWaterAt(a.world, Math.floor(c.x), Math.floor(c.z));
      assert.ok(w && c.y > w.bed && c.y < w.top, `fish ${c.id} is in water`);
    } else {
      const h = residentSurfaceAt(a.world, Math.floor(c.x), Math.floor(c.z));
      assert.equal(c.y, h);
      assert.notEqual(getVoxel(a.world, Math.floor(c.x), h - 1, Math.floor(c.z)), MAT.WATER);
    }
  }
});
test("creatures stay in habitat, never generate chunks, and flee from people", () => {
  const { world, creatures } = region(1337, 29, 29, 2);
  const before = world.chunks.size;
  const land = creatures.find((c) => c.species !== "trout");
  const fish = creatures.find((c) => c.species === "trout");
  assert.ok(land && fish);
  for (let i = 0; i < 600; i++) for (const c of creatures) stepCreature(world, c, { threats: [], night: false });
  assert.equal(world.chunks.size, before, "behaviour must not materialize chunks");
  for (const c of creatures) {
    if (c.species === "trout") {
      const w = residentWaterAt(world, Math.floor(c.x), Math.floor(c.z));
      assert.ok(w, `${c.id} left the water`);
    } else {
      assert.ok(residentSurfaceAt(world, Math.floor(c.x), Math.floor(c.z)) !== null);
      assert.ok(Math.hypot(c.x - c.homeX, c.z - c.homeZ) <= SPECIES[c.species].range * 2 + 20, `${c.id} strayed`);
    }
  }
  const threat = { x: land.x + 2, z: land.z };
  const start = Math.hypot(land.x - threat.x, land.z - threat.z);
  for (let i = 0; i < 20; i++) stepCreature(world, land, { threats: [threat], night: false });
  assert.equal(land.behaviour, "flee");
  assert.ok(Math.hypot(land.x - threat.x, land.z - threat.z) > start + 3, "the animal ran away");
});
test("diurnal animals sleep at night", () => {
  const { world, creatures } = region(1337, 29, 29, 2);
  const land = creatures.filter((c) => c.species !== "trout");
  for (let i = 0; i < 400; i++) for (const c of land) stepCreature(world, c, { threats: [], night: true });
  assert.ok(land.filter((c) => c.behaviour === "sleep").length >= Math.ceil(land.length / 2));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwNC5mYXVuYS50ZXN0LnRzIiwgIi4uLy4uL3NyYy9zaW0vc3RvbmUtY29tcGF0LnRzIiwgIi4uLy4uL3NyYy9zaW0vbm9pc2UudHMiLCAiLi4vLi4vc3JjL3NpbS9oeWRyb2xvZ3kudHMiLCAiLi4vLi4vc3JjL3NpbS9tYXRlcmlhbHMudHMiLCAiLi4vLi4vc3JjL3NpbS90ZXJyYWluLXYyLnRzIiwgIi4uLy4uL3NyYy9zaW0vd29ybGQudHMiLCAiLi4vLi4vc3JjL3NpbS9mYXVuYS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCB7IEdFTkVSQVRPUl9WMiwgTUFULCBjcmVhdGVXb3JsZCwgZW5zdXJlQ2h1bmssIGdldFZveGVsLCByZXNpZGVudFN1cmZhY2VBdCB9IGZyb20gJy4uL3NyYy9zaW0vd29ybGQnO1xuaW1wb3J0IHsgU1BFQ0lFUywgcmVzaWRlbnRXYXRlckF0LCBzcGF3bkNodW5rRmF1bmEsIHN0ZXBDcmVhdHVyZSwgQ3JlYXR1cmUgfSBmcm9tICcuLi9zcmMvc2ltL2ZhdW5hJztcblxuZnVuY3Rpb24gcmVnaW9uKHNlZWQ6IG51bWJlciwgY3gwOiBudW1iZXIsIGN6MDogbnVtYmVyLCByOiBudW1iZXIpIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkLCBHRU5FUkFUT1JfVjIpO1xuICBmb3IgKGxldCBjeiA9IGN6MCAtIHIgLSAxOyBjeiA8PSBjejAgKyByICsgMTsgY3orKykgZm9yIChsZXQgY3ggPSBjeDAgLSByIC0gMTsgY3ggPD0gY3gwICsgciArIDE7IGN4KyspIGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCBjcmVhdHVyZXM6IENyZWF0dXJlW10gPSBbXTtcbiAgZm9yIChsZXQgY3ogPSBjejAgLSByOyBjeiA8PSBjejAgKyByOyBjeisrKSBmb3IgKGxldCBjeCA9IGN4MCAtIHI7IGN4IDw9IGN4MCArIHI7IGN4KyspIGNyZWF0dXJlcy5wdXNoKC4uLnNwYXduQ2h1bmtGYXVuYSh3b3JsZCwgY3gsIGN6KSk7XG4gIHJldHVybiB7IHdvcmxkLCBjcmVhdHVyZXMgfTtcbn1cblxudGVzdCgnYW1iaWVudCBmYXVuYSBzcGF3bnMgZGV0ZXJtaW5pc3RpY2FsbHkgd2l0aCBzdGFibGUgaWRzIGFuZCB2YWxpZCBoYWJpdGF0JywgKCkgPT4ge1xuICAvLyBGb3VuZGVyIHZhbGxleSAocml2ZXIsIGxha2Ugc2hvcmUsIGZvcmVzdCkgYXJvdW5kIGNodW5rICgzMCwgMzApLlxuICBjb25zdCBhID0gcmVnaW9uKDEzMzcsIDI5LCAyOSwgMyksIGIgPSByZWdpb24oMTMzNywgMjksIDI5LCAzKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChhLmNyZWF0dXJlcywgYi5jcmVhdHVyZXMpO1xuICBjb25zdCBzcGVjaWVzID0gbmV3IFNldChhLmNyZWF0dXJlcy5tYXAoKGMpID0+IGMuc3BlY2llcykpO1xuICBhc3NlcnQub2soYS5jcmVhdHVyZXMubGVuZ3RoID4gMTAsIGBjcmVhdHVyZXMgJHthLmNyZWF0dXJlcy5sZW5ndGh9YCk7XG4gIGFzc2VydC5vayhzcGVjaWVzLmhhcygndHJvdXQnKSwgJ2Zpc2ggaW4gdGhlIHJpdmVyL2xha2UnKTtcbiAgYXNzZXJ0Lm9rKHNwZWNpZXMuaGFzKCdkZWVyJykgfHwgc3BlY2llcy5oYXMoJ3JhYmJpdCcpLCAnbGFuZCBhbmltYWxzJyk7XG4gIGZvciAoY29uc3QgYyBvZiBhLmNyZWF0dXJlcykge1xuICAgIGFzc2VydC5tYXRjaChjLmlkLCAvXmZhdW5hOihkZWVyfHJhYmJpdHx0cm91dHxmb3h8d29sZik6XFxkKyxcXGQrOlxcZCskLyk7XG4gICAgYXNzZXJ0LmVxdWFsKGMudGllciwgJ2FtYmllbnQnKTtcbiAgICBpZiAoYy5zcGVjaWVzID09PSAndHJvdXQnKSB7XG4gICAgICBjb25zdCB3ID0gcmVzaWRlbnRXYXRlckF0KGEud29ybGQsIE1hdGguZmxvb3IoYy54KSwgTWF0aC5mbG9vcihjLnopKTtcbiAgICAgIGFzc2VydC5vayh3ICYmIGMueSA+IHcuYmVkICYmIGMueSA8IHcudG9wLCBgZmlzaCAke2MuaWR9IGlzIGluIHdhdGVyYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGggPSByZXNpZGVudFN1cmZhY2VBdChhLndvcmxkLCBNYXRoLmZsb29yKGMueCksIE1hdGguZmxvb3IoYy56KSkhO1xuICAgICAgYXNzZXJ0LmVxdWFsKGMueSwgaCk7XG4gICAgICBhc3NlcnQubm90RXF1YWwoZ2V0Vm94ZWwoYS53b3JsZCwgTWF0aC5mbG9vcihjLngpLCBoIC0gMSwgTWF0aC5mbG9vcihjLnopKSwgTUFULldBVEVSKTtcbiAgICB9XG4gIH1cbn0pO1xuXG50ZXN0KCdjcmVhdHVyZXMgc3RheSBpbiBoYWJpdGF0LCBuZXZlciBnZW5lcmF0ZSBjaHVua3MsIGFuZCBmbGVlIGZyb20gcGVvcGxlJywgKCkgPT4ge1xuICBjb25zdCB7IHdvcmxkLCBjcmVhdHVyZXMgfSA9IHJlZ2lvbigxMzM3LCAyOSwgMjksIDIpO1xuICBjb25zdCBiZWZvcmUgPSB3b3JsZC5jaHVua3Muc2l6ZTtcbiAgY29uc3QgbGFuZCA9IGNyZWF0dXJlcy5maW5kKChjKSA9PiBjLnNwZWNpZXMgIT09ICd0cm91dCcpITtcbiAgY29uc3QgZmlzaCA9IGNyZWF0dXJlcy5maW5kKChjKSA9PiBjLnNwZWNpZXMgPT09ICd0cm91dCcpITtcbiAgYXNzZXJ0Lm9rKGxhbmQgJiYgZmlzaCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgNjAwOyBpKyspIGZvciAoY29uc3QgYyBvZiBjcmVhdHVyZXMpIHN0ZXBDcmVhdHVyZSh3b3JsZCwgYywgeyB0aHJlYXRzOiBbXSwgbmlnaHQ6IGZhbHNlIH0pO1xuICBhc3NlcnQuZXF1YWwod29ybGQuY2h1bmtzLnNpemUsIGJlZm9yZSwgJ2JlaGF2aW91ciBtdXN0IG5vdCBtYXRlcmlhbGl6ZSBjaHVua3MnKTtcbiAgZm9yIChjb25zdCBjIG9mIGNyZWF0dXJlcykge1xuICAgIGlmIChjLnNwZWNpZXMgPT09ICd0cm91dCcpIHtcbiAgICAgIGNvbnN0IHcgPSByZXNpZGVudFdhdGVyQXQod29ybGQsIE1hdGguZmxvb3IoYy54KSwgTWF0aC5mbG9vcihjLnopKTtcbiAgICAgIGFzc2VydC5vayh3LCBgJHtjLmlkfSBsZWZ0IHRoZSB3YXRlcmApO1xuICAgIH0gZWxzZSB7XG4gICAgICBhc3NlcnQub2socmVzaWRlbnRTdXJmYWNlQXQod29ybGQsIE1hdGguZmxvb3IoYy54KSwgTWF0aC5mbG9vcihjLnopKSAhPT0gbnVsbCk7XG4gICAgICBhc3NlcnQub2soTWF0aC5oeXBvdChjLnggLSBjLmhvbWVYLCBjLnogLSBjLmhvbWVaKSA8PSBTUEVDSUVTW2Muc3BlY2llc10ucmFuZ2UgKiAyICsgMjAsIGAke2MuaWR9IHN0cmF5ZWRgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgdGhyZWF0ID0geyB4OiBsYW5kLnggKyAyLCB6OiBsYW5kLnogfTtcbiAgY29uc3Qgc3RhcnQgPSBNYXRoLmh5cG90KGxhbmQueCAtIHRocmVhdC54LCBsYW5kLnogLSB0aHJlYXQueik7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgMjA7IGkrKykgc3RlcENyZWF0dXJlKHdvcmxkLCBsYW5kLCB7IHRocmVhdHM6IFt0aHJlYXRdLCBuaWdodDogZmFsc2UgfSk7XG4gIGFzc2VydC5lcXVhbChsYW5kLmJlaGF2aW91ciwgJ2ZsZWUnKTtcbiAgYXNzZXJ0Lm9rKE1hdGguaHlwb3QobGFuZC54IC0gdGhyZWF0LngsIGxhbmQueiAtIHRocmVhdC56KSA+IHN0YXJ0ICsgMywgJ3RoZSBhbmltYWwgcmFuIGF3YXknKTtcbn0pO1xuXG50ZXN0KCdkaXVybmFsIGFuaW1hbHMgc2xlZXAgYXQgbmlnaHQnLCAoKSA9PiB7XG4gIGNvbnN0IHsgd29ybGQsIGNyZWF0dXJlcyB9ID0gcmVnaW9uKDEzMzcsIDI5LCAyOSwgMik7XG4gIGNvbnN0IGxhbmQgPSBjcmVhdHVyZXMuZmlsdGVyKChjKSA9PiBjLnNwZWNpZXMgIT09ICd0cm91dCcpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IDQwMDsgaSsrKSBmb3IgKGNvbnN0IGMgb2YgbGFuZCkgc3RlcENyZWF0dXJlKHdvcmxkLCBjLCB7IHRocmVhdHM6IFtdLCBuaWdodDogdHJ1ZSB9KTtcbiAgYXNzZXJ0Lm9rKGxhbmQuZmlsdGVyKChjKSA9PiBjLmJlaGF2aW91ciA9PT0gJ3NsZWVwJykubGVuZ3RoID49IE1hdGguY2VpbChsYW5kLmxlbmd0aCAvIDIpKTtcbn0pO1xuIiwgIi8vIFByaXZhdGUgbWlncmF0aW9uIHJlcGxheSBvbmx5LiBSZXRpcmVkIGVudGl0aWVzIGxpdmUgaW4gdGhpcyBXb3JsZCB3aGlsZSBhblxuLy8gYWNjZXB0ZWQgaGlzdG9yaWNhbCBqb3VybmFsIGlzIGNoZWNrZWQ7IG5vIHB1YmxpYyBjb21tYW5kIGVuYWJsZXMgdGhpcyBtb2RlLlxuaW50ZXJmYWNlIFJlcGxheVN0YXRlIHtcbiAgYWN0aXZlOiBib29sZWFuO1xuICBoaXN0b3JpY2FsSGFzaDogYm9vbGVhbjtcbiAgbWlncmF0ZWQ6IGJvb2xlYW47XG59XG5cbmNvbnN0IHN0YXRlcyA9IG5ldyBXZWFrTWFwPG9iamVjdCwgUmVwbGF5U3RhdGU+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiByZXBsYXlTdG9uZVN0YXRlKHdvcmxkOiBvYmplY3QpOiBSZXBsYXlTdGF0ZSB7XG4gIGxldCBzdGF0ZSA9IHN0YXRlcy5nZXQod29ybGQpO1xuICBpZiAoIXN0YXRlKSB7IHN0YXRlID0geyBhY3RpdmU6IGZhbHNlLCBoaXN0b3JpY2FsSGFzaDogZmFsc2UsIG1pZ3JhdGVkOiBmYWxzZSB9OyBzdGF0ZXMuc2V0KHdvcmxkLCBzdGF0ZSk7IH1cbiAgcmV0dXJuIHN0YXRlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSB0cnVlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG4gIHN0YXRlLm1pZ3JhdGVkID0gZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5hY3RpdmUgPz8gZmFsc2U7XG59XG5cbi8qKiBTbmFwc2hvdCBoYXNoZXMgYmVmb3JlIGFuZCBkdXJpbmcgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkgaW5jbHVkZSBzdG9uZXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uaGlzdG9yaWNhbEhhc2ggPz8gZmFsc2U7XG59XG5cbi8qKiBBIG1pZ3JhdGVkIHNuYXBzaG90IGFscmVhZHkgaGFzIHJldGlyZW1lbnQgdG9tYnN0b25lcyBpbiBnZW5lcmF0ZWQgY2h1bmtzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtTdG9uZU1pZ3JhdGVkKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkubWlncmF0ZWQgPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZU1pZ3JhdGVkKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5taWdyYXRlZCA/PyBmYWxzZTtcbn1cblxuLyoqIEV4aXQgaGlzdG9yaWNhbCBtb2RlIGFmdGVyIGFsbCBhY2NlcHRlZCBjb21tYW5kcyBhbmQgaGFzaGVzIGhhdmUgcGFzc2VkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmlzaFN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gZmFsc2U7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gZmFsc2U7XG4gIHN0YXRlLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cbiIsICIvLyBEZXRlcm1pbmlzdGljIGhhc2gsIG5vaXNlIGFuZCBtYXRoIGhlbHBlcnMgc2hhcmVkIGJ5IHRoZSBzaW11bGF0aW9uIGxheWVyLlxuLy8gUHVyZSBUeXBlU2NyaXB0IChELTAwNSkuIEV4dHJhY3RlZCBmcm9tIHdvcmxkLnRzIHVuY2hhbmdlZCBzbyB0ZXJyYWluXG4vLyBnZW5lcmF0b3JzIG9mIGV2ZXJ5IHZlcnNpb24gdXNlIGlkZW50aWNhbCBwcmltaXRpdmVzLlxuZXhwb3J0IGNvbnN0IGNsYW1wID0gKHY6IG51bWJlciwgYTogbnVtYmVyLCBiOiBudW1iZXIpID0+ICh2IDwgYSA/IGEgOiB2ID4gYiA/IGIgOiB2KTtcbmV4cG9ydCBjb25zdCBsZXJwID0gKGE6IG51bWJlciwgYjogbnVtYmVyLCB0OiBudW1iZXIpID0+IGEgKyAoYiAtIGEpICogdDtcbmV4cG9ydCBjb25zdCBzbW9vdGhzdGVwID0gKGUwOiBudW1iZXIsIGUxOiBudW1iZXIsIHg6IG51bWJlcikgPT4ge1xuICBjb25zdCB0ID0gY2xhbXAoKHggLSBlMCkgLyAoZTEgLSBlMCksIDAsIDEpO1xuICByZXR1cm4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcbn07XG5cbi8vIC0tLS0tLS0tLS0gZGV0ZXJtaW5pc3RpYyBoYXNoIC8gbm9pc2UgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gyaSh4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzaDNpKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2MykgXiBNYXRoLmltdWwoeiwgMjI0NjgyMjUxOSk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG11bGJlcnJ5MzIoc2VlZDogbnVtYmVyKTogKCkgPT4gbnVtYmVyIHtcbiAgbGV0IGEgPSBzZWVkID4+PiAwO1xuICByZXR1cm4gKCkgPT4ge1xuICAgIGEgPSAoYSArIDB4NmQyYjc5ZjUpID4+PiAwO1xuICAgIGxldCB0ID0gYTtcbiAgICB0ID0gTWF0aC5pbXVsKHQgXiAodCA+Pj4gMTUpLCB0IHwgMSk7XG4gICAgdCBePSB0ICsgTWF0aC5pbXVsKHQgXiAodCA+Pj4gNyksIHQgfCA2MSk7XG4gICAgcmV0dXJuICgodCBeICh0ID4+PiAxNCkpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBzbW9vdGggPSAodDogbnVtYmVyKSA9PiB0ICogdCAqICgzIC0gMiAqIHQpO1xuXG5leHBvcnQgZnVuY3Rpb24gdmFsdWVOb2lzZTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpO1xuICBjb25zdCBhID0gaGFzaDJpKHhpLCB5aSwgc2VlZCksIGIgPSBoYXNoMmkoeGkgKyAxLCB5aSwgc2VlZCk7XG4gIGNvbnN0IGMgPSBoYXNoMmkoeGksIHlpICsgMSwgc2VlZCksIGQgPSBoYXNoMmkoeGkgKyAxLCB5aSArIDEsIHNlZWQpO1xuICBjb25zdCB0b3AgPSBhICsgKGIgLSBhKSAqIHhmO1xuICBjb25zdCBib3R0b20gPSBjICsgKGQgLSBjKSAqIHhmO1xuICByZXR1cm4gdG9wICsgKGJvdHRvbSAtIHRvcCkgKiB5Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTIoeCAqIGZyZXEsIHkgKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdmFsdWVOb2lzZTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSksIHppID0gTWF0aC5mbG9vcih6KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKSwgemYgPSBzbW9vdGgoeiAtIHppKTtcbiAgY29uc3QgYzAwMCA9IGhhc2gzaSh4aSwgeWksIHppLCBzZWVkKSwgYzEwMCA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSwgc2VlZCk7XG4gIGNvbnN0IGMwMTAgPSBoYXNoM2koeGksIHlpICsgMSwgemksIHNlZWQpLCBjMTEwID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSwgc2VlZCk7XG4gIGNvbnN0IGMwMDEgPSBoYXNoM2koeGksIHlpLCB6aSArIDEsIHNlZWQpLCBjMTAxID0gaGFzaDNpKHhpICsgMSwgeWksIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IGMwMTEgPSBoYXNoM2koeGksIHlpICsgMSwgemkgKyAxLCBzZWVkKSwgYzExMSA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgeDAwID0gYzAwMCArIChjMTAwIC0gYzAwMCkgKiB4ZjtcbiAgY29uc3QgeDEwID0gYzAxMCArIChjMTEwIC0gYzAxMCkgKiB4ZjtcbiAgY29uc3QgeDAxID0gYzAwMSArIChjMTAxIC0gYzAwMSkgKiB4ZjtcbiAgY29uc3QgeDExID0gYzAxMSArIChjMTExIC0gYzAxMSkgKiB4ZjtcbiAgY29uc3QgeTAgPSB4MDAgKyAoeDEwIC0geDAwKSAqIHlmO1xuICBjb25zdCB5MSA9IHgwMSArICh4MTEgLSB4MDEpICogeWY7XG4gIHJldHVybiB5MCArICh5MSAtIHkwKSAqIHpmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UzKHggKiBmcmVxLCB5ICogZnJlcSwgeiAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbiIsICIvLyBIeWRyb2xvZ3kgXHUyMDE0IHRoZSBkZXRlcm1pbmlzdGljIHdhdGVyIG5ldHdvcmsgb2YgYSB3b3JsZCAocHVyZSBUeXBlU2NyaXB0LCBELTAwNSkuXG4vL1xuLy8gVGhpcyBpcyBkZXJpdmVkICpzaW11bGF0aW9uIGRhdGEqLCBub3QgcHJlc2VudGF0aW9uOiBpdCBpcyBhIHB1cmUgZnVuY3Rpb24gb2Zcbi8vIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbikgYW5kIGlzIHdoYXQgdGVycmFpbiBjYXJ2aW5nLCB3YXRlciBmaWxsaW5nLCBmbG93XG4vLyBkaXJlY3Rpb24gYW5kIGZ1dHVyZSBmaXNoaW5nL2lycmlnYXRpb24vZmxvb2RpbmcgcnVsZXMgcmVhZC4gSXQgaXMgbmV2ZXJcbi8vIGpvdXJuYWxlZCBiZWNhdXNlIGl0IGNhbiBhbHdheXMgYmUgcmVnZW5lcmF0ZWQgZXhhY3RseS5cbi8vXG4vLyBOZXR3b3JrIChib3RoIGdlbmVyYXRvciB2ZXJzaW9ucyk6XG4vLyAgIGxha2UgIFx1MjAxNCB0aGUgdmFsbGV5IGxha2UgYmFzaW4sIGxvY2F0ZWQgZnJvbSB0aGUgYWN0dWFsIGdlbmVyYXRlZCB0ZXJyYWluLlxuLy8gICBsb3dlciBcdTIwMTQgdGhlIGxvd2xhbmQgcml2ZXIgZnJvbSB0aGUgbGFrZSB0byB0aGUgc291dGhlcm4gc2VhLCB0cmFjZWQgZnJvbVxuLy8gICAgICAgICAgIHRoZSBhY3R1YWwgY2FydmVkIGNoYW5uZWwgKHRoZSB2MSBjaGFubmVsIGlzIGNhcnZlZCBvbiAqd2FycGVkKlxuLy8gICAgICAgICAgIGNvb3JkaW5hdGVzLCBzbyBgcml2ZXJDZW50ZXJYYCBhbG9uZSBpcyB1cCB0byB+MTM1IG0gb2ZmKS5cbi8vIEdlbmVyYXRvciB2MiBhZGRzOlxuLy8gICB1cHBlciBcdTIwMTQgYSBtb3VudGFpbiByaXZlciBmcm9tIGEgaGlnaGxhbmQgdGFybiBkb3duIHRvIHRoZSBsYWtlLCB3aXRoIGFcbi8vICAgICAgICAgICB3YXRlci1zdXJmYWNlIGxldmVsIHRoYXQgbmV2ZXIgcmlzZXMgZG93bnN0cmVhbSwgY2FzY2FkZXMgYW5kIGZhbGxzLlxuLy9cbi8vIEZsb3cgYWx3YXlzIHBvaW50cyBkb3duc3RyZWFtOiB1cHBlciBcdTIxOTIgbGFrZSBcdTIxOTIgbG93ZXIgXHUyMTkyIHNlYS5cbmltcG9ydCB7IGNsYW1wLCBmYm0yLCBtdWxiZXJyeTMyLCBzbW9vdGhzdGVwIH0gZnJvbSAnLi9ub2lzZSc7XG5cbmV4cG9ydCB0eXBlIEhlaWdodFNhbXBsZXIgPSAoeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IG51bWJlcjtcblxuZXhwb3J0IGludGVyZmFjZSBSaXZlclBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIC8qKiBBcmMgbGVuZ3RoIGZyb20gdGhlIGRvd25zdHJlYW0gZW5kIG9mIHRoaXMgcmVhY2ggKG1ldHJlcykuICovXG4gIHM6IG51bWJlcjtcbiAgLyoqIFdhdGVyLXN1cmZhY2UgZWxldmF0aW9uIChtZXRyZXMsIG1heSBiZSBmcmFjdGlvbmFsKS4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgLyoqIENoYW5uZWwgaGFsZi13aWR0aCAobWV0cmVzKS4gKi9cbiAgd2lkdGg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWFjaEhpdCB7XG4gIC8qKiBIb3Jpem9udGFsIGRpc3RhbmNlIGZyb20gdGhlIGNlbnRyZWxpbmUuICovXG4gIGQ6IG51bWJlcjtcbiAgLyoqIEludGVycG9sYXRlZCB3YXRlciBsZXZlbCBhdCB0aGUgbmVhcmVzdCBjZW50cmVsaW5lIHBvaW50LiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICB3aWR0aDogbnVtYmVyO1xuICAvKiogVW5pdCBkb3duc3RyZWFtIGRpcmVjdGlvbi4gKi9cbiAgdHg6IG51bWJlcjtcbiAgdHo6IG51bWJlcjtcbiAgLyoqIFdhdGVyLXN1cmZhY2UgZHJvcCBwZXIgbWV0cmUgYWxvbmcgdGhlIGNoYW5uZWwgKD49IDApLiAqL1xuICBncmFkaWVudDogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBvZiB0aGUgbmVhcmVzdCBwb2ludCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZC4gKi9cbiAgczogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgcG9seWxpbmUgcmVhY2ggc3RvcmVkIGRvd25zdHJlYW0tZmlyc3QuIE5lYXJlc3Qtc2VnbWVudCBxdWVyaWVzIHVzZSBhXG4gKiB1bmlmb3JtIGdyaWQgd2hvc2UgY2VsbHMgbGlzdCBldmVyeSBzZWdtZW50IHdpdGhpbiBgcmVhY2hgIG1ldHJlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFJpdmVyUmVhY2gge1xuICByZWFkb25seSBwb2ludHM6IFJpdmVyUG9pbnRbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBjZWxsID0gMzI7XG4gIHByaXZhdGUgcmVhZG9ubHkgZ3JpZCA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXJbXT4oKTtcblxuICBjb25zdHJ1Y3Rvcihwb2ludHM6IFJpdmVyUG9pbnRbXSwgcmVhZG9ubHkgcmVhY2g6IG51bWJlcikge1xuICAgIHRoaXMucG9pbnRzID0gcG9pbnRzO1xuICAgIGZvciAobGV0IGkgPSAwOyBpICsgMSA8IHBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgYSA9IHBvaW50c1tpXSwgYiA9IHBvaW50c1tpICsgMV07XG4gICAgICBjb25zdCB4MCA9IE1hdGgubWluKGEueCwgYi54KSAtIHJlYWNoLCB4MSA9IE1hdGgubWF4KGEueCwgYi54KSArIHJlYWNoO1xuICAgICAgY29uc3QgejAgPSBNYXRoLm1pbihhLnosIGIueikgLSByZWFjaCwgejEgPSBNYXRoLm1heChhLnosIGIueikgKyByZWFjaDtcbiAgICAgIGZvciAobGV0IGN6ID0gTWF0aC5mbG9vcih6MCAvIHRoaXMuY2VsbCk7IGN6IDw9IE1hdGguZmxvb3IoejEgLyB0aGlzLmNlbGwpOyBjeisrKSB7XG4gICAgICAgIGZvciAobGV0IGN4ID0gTWF0aC5mbG9vcih4MCAvIHRoaXMuY2VsbCk7IGN4IDw9IE1hdGguZmxvb3IoeDEgLyB0aGlzLmNlbGwpOyBjeCsrKSB7XG4gICAgICAgICAgY29uc3Qga2V5ID0gY2VsbEtleShjeCwgY3opO1xuICAgICAgICAgIGxldCBsaXN0ID0gdGhpcy5ncmlkLmdldChrZXkpO1xuICAgICAgICAgIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHRoaXMuZ3JpZC5zZXQoa2V5LCBsaXN0KTsgfVxuICAgICAgICAgIGxpc3QucHVzaChpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBsZW5ndGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMucG9pbnRzW3RoaXMucG9pbnRzLmxlbmd0aCAtIDFdPy5zID8/IDA7IH1cblxuICAvKiogTmVhcmVzdCBjZW50cmVsaW5lIHBvaW50IHdpdGhpbiBgcmVhY2hgLCBvciBudWxsLiAqL1xuICBuZWFyZXN0KHg6IG51bWJlciwgejogbnVtYmVyKTogUmVhY2hIaXQgfCBudWxsIHtcbiAgICBjb25zdCBsaXN0ID0gdGhpcy5ncmlkLmdldChjZWxsS2V5KE1hdGguZmxvb3IoeCAvIHRoaXMuY2VsbCksIE1hdGguZmxvb3IoeiAvIHRoaXMuY2VsbCkpKTtcbiAgICBpZiAoIWxpc3QpIHJldHVybiBudWxsO1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJpID0gLTEsIGJ0ID0gMDtcbiAgICBmb3IgKGNvbnN0IGkgb2YgbGlzdCkge1xuICAgICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2ldLCBiID0gdGhpcy5wb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgZHggPSBiLnggLSBhLngsIGR6ID0gYi56IC0gYS56O1xuICAgICAgY29uc3QgbGVuMiA9IGR4ICogZHggKyBkeiAqIGR6IHx8IDE7XG4gICAgICBjb25zdCB0ID0gY2xhbXAoKCh4IC0gYS54KSAqIGR4ICsgKHogLSBhLnopICogZHopIC8gbGVuMiwgMCwgMSk7XG4gICAgICBjb25zdCBweCA9IGEueCArIGR4ICogdCwgcHogPSBhLnogKyBkeiAqIHQ7XG4gICAgICBjb25zdCBkMiA9ICh4IC0gcHgpICoqIDIgKyAoeiAtIHB6KSAqKiAyO1xuICAgICAgaWYgKGQyIDwgYmVzdCkgeyBiZXN0ID0gZDI7IGJpID0gaTsgYnQgPSB0OyB9XG4gICAgfVxuICAgIGlmIChiaSA8IDAgfHwgYmVzdCA+IHRoaXMucmVhY2ggKiB0aGlzLnJlYWNoKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBhID0gdGhpcy5wb2ludHNbYmldLCBiID0gdGhpcy5wb2ludHNbYmkgKyAxXTtcbiAgICBjb25zdCBzZWdMZW4gPSBNYXRoLm1heCgxZS02LCBiLnMgLSBhLnMpO1xuICAgIC8vIFBvaW50cyBhcmUgc3RvcmVkIGRvd25zdHJlYW0tZmlyc3QsIHNvIGRvd25zdHJlYW0gaXMgYSA8LSBiLlxuICAgIGNvbnN0IHR4ID0gKGEueCAtIGIueCkgLyBzZWdMZW4sIHR6ID0gKGEueiAtIGIueikgLyBzZWdMZW47XG4gICAgcmV0dXJuIHtcbiAgICAgIGQ6IE1hdGguc3FydChiZXN0KSxcbiAgICAgIGxldmVsOiBhLmxldmVsICsgKGIubGV2ZWwgLSBhLmxldmVsKSAqIGJ0LFxuICAgICAgd2lkdGg6IGEud2lkdGggKyAoYi53aWR0aCAtIGEud2lkdGgpICogYnQsXG4gICAgICB0eCwgdHosXG4gICAgICBncmFkaWVudDogTWF0aC5tYXgoMCwgKGIubGV2ZWwgLSBhLmxldmVsKSAvIHNlZ0xlbiksXG4gICAgICBzOiBhLnMgKyAoYi5zIC0gYS5zKSAqIGJ0LFxuICAgIH07XG4gIH1cbn1cblxuZnVuY3Rpb24gY2VsbEtleShjeDogbnVtYmVyLCBjejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIChjeCArIDQwOTYpICogODE5MiArIChjeiArIDQwOTYpO1xufVxuXG5leHBvcnQgdHlwZSBXYXRlckJvZHkgPSAncml2ZXInIHwgJ2xha2UnIHwgJ3NlYScgfCAnbm9uZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmxvd1NhbXBsZSB7XG4gIGJvZHk6IFdhdGVyQm9keTtcbiAgLyoqIFVuaXQgZmxvdyBkaXJlY3Rpb24gKHplcm8gZm9yIHN0aWxsIHdhdGVyKS4gKi9cbiAgZHg6IG51bWJlcjtcbiAgZHo6IG51bWJlcjtcbiAgLyoqIFN1cmZhY2UgY3VycmVudCBzcGVlZCBpbiBtL3MuICovXG4gIHNwZWVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSHlkcm9sb2d5T3B0aW9ucyB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgLyoqIEdlbmVyYXRvciB2ZXJzaW9uIHRoZSBuZXR3b3JrIGJlbG9uZ3MgdG8uICovXG4gIHZlcnNpb246IG51bWJlcjtcbiAgLyoqIEJhc2UgaGVpZ2h0IG9mIHRoZSAqdW5tb2RpZmllZCB2MSBzaGFwZSogKHVzZWQgdG8gbG9jYXRlIGxha2UvY2hhbm5lbCkuICovXG4gIHYxSGVpZ2h0OiBIZWlnaHRTYW1wbGVyO1xufVxuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ2ljYWwgbmV0d29yayBmb3Igb25lIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbikuICovXG5leHBvcnQgY2xhc3MgSHlkcm9sb2d5IHtcbiAgcmVhZG9ubHkgc2VlZDogbnVtYmVyO1xuICByZWFkb25seSB2ZXJzaW9uOiBudW1iZXI7XG4gIHJlYWRvbmx5IGxha2U6IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJ4OiBudW1iZXI7IHJ6OiBudW1iZXIgfTtcbiAgcmVhZG9ubHkgbG93ZXI6IFJpdmVyUmVhY2g7XG4gIHJlYWRvbmx5IHVwcGVyOiBSaXZlclJlYWNoIHwgbnVsbDtcbiAgLyoqIFVwcGVyLXJpdmVyIHNvdXJjZSB0YXJuICh2MiBvbmx5KS4gKi9cbiAgcmVhZG9ubHkgdGFybjogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcjogbnVtYmVyOyBsZXZlbDogbnVtYmVyIH0gfCBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKG9wdHM6IEh5ZHJvbG9neU9wdGlvbnMpIHtcbiAgICB0aGlzLnNlZWQgPSBvcHRzLnNlZWQ7XG4gICAgdGhpcy52ZXJzaW9uID0gb3B0cy52ZXJzaW9uO1xuICAgIHRoaXMubGFrZSA9IGxvY2F0ZUxha2Uob3B0cy52MUhlaWdodCk7XG4gICAgdGhpcy5sb3dlciA9IHRyYWNlTG93ZXJSaXZlcihvcHRzLnYxSGVpZ2h0LCB0aGlzLmxha2UpO1xuICAgIGlmIChvcHRzLnZlcnNpb24gPj0gMikge1xuICAgICAgY29uc3QgdXBwZXIgPSBhdXRob3JVcHBlclJpdmVyKG9wdHMuc2VlZCwgdGhpcy5sYWtlKTtcbiAgICAgIHRoaXMudXBwZXIgPSB1cHBlci5yZWFjaDtcbiAgICAgIHRoaXMudGFybiA9IHVwcGVyLnRhcm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudXBwZXIgPSBudWxsO1xuICAgICAgdGhpcy50YXJuID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3VyZmFjZSBjdXJyZW50IGZvciBhIHdhdGVyIGNvbHVtbi4gYGxldmVsYCBpcyB0aGUgY29sdW1uJ3Mgd2F0ZXIgc3VyZmFjZSxcbiAgICogdXNlZCB0byB0ZWxsIHNlYS1sZXZlbCB3YXRlciAobGFrZSwgbG93ZXIgcml2ZXIsIHNlYSkgZnJvbSB0aGUgdXBwZXIgcml2ZXIuXG4gICAqL1xuICBmbG93QXQoeDogbnVtYmVyLCB6OiBudW1iZXIsIGxldmVsOiBudW1iZXIpOiBGbG93U2FtcGxlIHtcbiAgICBpZiAodGhpcy51cHBlciAmJiBsZXZlbCA+IDAuNSkge1xuICAgICAgY29uc3QgaGl0ID0gdGhpcy51cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCAmJiBoaXQuZCA8PSBoaXQud2lkdGggKyAyKSB7XG4gICAgICAgIGNvbnN0IHNwZWVkID0gY2xhbXAoMC41NSArIGhpdC5ncmFkaWVudCAqIDksIDAuNCwgNC41KTtcbiAgICAgICAgcmV0dXJuIHsgYm9keTogJ3JpdmVyJywgZHg6IGhpdC50eCwgZHo6IGhpdC50eiwgc3BlZWQgfTtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLnRhcm4gJiYgTWF0aC5oeXBvdCh4IC0gdGhpcy50YXJuLngsIHogLSB0aGlzLnRhcm4ueikgPCB0aGlzLnRhcm4uciArIDQpIHtcbiAgICAgICAgcmV0dXJuIHsgYm9keTogJ2xha2UnLCAuLi50b3dhcmRzKHgsIHosIHRoaXMudXBwZXJTb3VyY2UoKSwgMC4wNikgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgbG93ID0gdGhpcy5sb3dlci5uZWFyZXN0KHgsIHopO1xuICAgIGlmIChsb3cgJiYgbG93LmQgPD0gbG93LndpZHRoICsgNikge1xuICAgICAgcmV0dXJuIHsgYm9keTogJ3JpdmVyJywgZHg6IGxvdy50eCwgZHo6IGxvdy50eiwgc3BlZWQ6IDAuMzUgKyAwLjI1ICogc21vb3Roc3RlcChsb3cud2lkdGggKyA2LCAwLCBsb3cuZCkgfTtcbiAgICB9XG4gICAgY29uc3QgbGQgPSBNYXRoLmh5cG90KCh4IC0gdGhpcy5sYWtlLngpIC8gdGhpcy5sYWtlLnJ4LCAoeiAtIHRoaXMubGFrZS56KSAvIHRoaXMubGFrZS5yeik7XG4gICAgaWYgKGxkIDwgMS4zNSkge1xuICAgICAgLy8gU2xvdyBkcmlmdCBmcm9tIHRoZSBpbmZsb3cgdG93YXJkIHRoZSBvdXRmbG93IGF0IHRoZSBoZWFkIG9mIHRoZSBsb3dlciByaXZlci5cbiAgICAgIGNvbnN0IGhlYWQgPSB0aGlzLmxvd2VyLnBvaW50c1t0aGlzLmxvd2VyLnBvaW50cy5sZW5ndGggLSAxXTtcbiAgICAgIGNvbnN0IGRyaWZ0ID0gdG93YXJkcyh4LCB6LCBoZWFkLCAwLjA4KTtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4uZHJpZnQgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgYm9keTogJ3NlYScsIGR4OiAwLCBkejogMCwgc3BlZWQ6IDAgfTtcbiAgfVxuXG4gIHByaXZhdGUgdXBwZXJTb3VyY2UoKTogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9IHtcbiAgICBjb25zdCBwdHMgPSB0aGlzLnVwcGVyIS5wb2ludHM7XG4gICAgcmV0dXJuIHB0c1twdHMubGVuZ3RoIC0gMV07XG4gIH1cbn1cblxuZnVuY3Rpb24gdG93YXJkcyh4OiBudW1iZXIsIHo6IG51bWJlciwgcDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9LCBzcGVlZDogbnVtYmVyKSB7XG4gIGNvbnN0IGR4ID0gcC54IC0geCwgZHogPSBwLnogLSB6O1xuICBjb25zdCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeikgfHwgMTtcbiAgcmV0dXJuIHsgZHg6IGR4IC8gbGVuLCBkejogZHogLyBsZW4sIHNwZWVkIH07XG59XG5cbi8qKiBGaW5kIHRoZSB2YWxsZXkgbGFrZSBmcm9tIHRoZSB0ZXJyYWluIGl0c2VsZjogdGhlIGRlZXAgYmFzaW4gTlcgb2YgdGhlIGZvdW5kZXIgdmFsbGV5LiAqL1xuZnVuY3Rpb24gbG9jYXRlTGFrZShoOiBIZWlnaHRTYW1wbGVyKTogSHlkcm9sb2d5WydsYWtlJ10ge1xuICBsZXQgc3ggPSAwLCBzeiA9IDAsIG4gPSAwLCBtaW5YID0gSW5maW5pdHksIG1heFggPSAtSW5maW5pdHksIG1pblogPSBJbmZpbml0eSwgbWF4WiA9IC1JbmZpbml0eTtcbiAgZm9yIChsZXQgeiA9IC00NjA7IHogPD0gLTEyMDsgeiArPSA0KSB7XG4gICAgZm9yIChsZXQgeCA9IC00ODA7IHggPD0gLTQwOyB4ICs9IDQpIHtcbiAgICAgIGlmIChoKHgsIHopID4gLTQpIGNvbnRpbnVlO1xuICAgICAgc3ggKz0geDsgc3ogKz0gejsgbisrO1xuICAgICAgbWluWCA9IE1hdGgubWluKG1pblgsIHgpOyBtYXhYID0gTWF0aC5tYXgobWF4WCwgeCk7XG4gICAgICBtaW5aID0gTWF0aC5taW4obWluWiwgeik7IG1heFogPSBNYXRoLm1heChtYXhaLCB6KTtcbiAgICB9XG4gIH1cbiAgaWYgKG4gPT09IDApIHJldHVybiB7IHg6IC0yNjAsIHo6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9O1xuICByZXR1cm4ge1xuICAgIHg6IHN4IC8gbiwgejogc3ogLyBuLFxuICAgIHJ4OiBNYXRoLm1heCgzMCwgKG1heFggLSBtaW5YKSAvIDIgKyAxMCksIHJ6OiBNYXRoLm1heCgzMCwgKG1heFogLSBtaW5aKSAvIDIgKyAxMCksXG4gIH07XG59XG5cbi8qKlxuICogVHJhY2UgdGhlIGNhcnZlZCBsb3dsYW5kIGNoYW5uZWwgZnJvbSB0aGUgbGFrZSBvdXRmbG93IHNvdXRoIHRvIHRoZSBzZWEuIEZvclxuICogZWFjaCA0IG0gcm93IHRoZSBjaGFubmVsIGlzIHRoZSBsb3dlc3QgY29sdW1uIG5lYXIgdGhlIHByZXZpb3VzIGNlbnRyZTsgdGhlXG4gKiB0cmFjZSBpcyBzbW9vdGhlZCBzbyB0aGUgZmxvdyBmaWVsZCBkb2VzIG5vdCBqaXR0ZXIgd2l0aCB0aGUgMSBtIHZveGVscy5cbiAqL1xuZnVuY3Rpb24gdHJhY2VMb3dlclJpdmVyKGg6IEhlaWdodFNhbXBsZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKTogUml2ZXJSZWFjaCB7XG4gIGNvbnN0IHJhdzogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBsZXQgY3ggPSBsYWtlLnggKyBsYWtlLnJ4ICogMC41NTtcbiAgbGV0IHogPSBNYXRoLnJvdW5kKGxha2UueiArIGxha2UucnogKiAwLjYpO1xuICAvLyBTdGFydCBhdCB0aGUgbGFrZSdzIHNvdXRoLWVhc3Qgb3V0ZmxvdyBhbmQgZm9sbG93IHRoZSBjaGFubmVsIGRvd25zdHJlYW0uXG4gIGZvciAoOyB6IDw9IDkwMDsgeiArPSA0KSB7XG4gICAgbGV0IGJlc3QgPSBJbmZpbml0eSwgYnggPSBjeDtcbiAgICBmb3IgKGxldCB4ID0gTWF0aC5yb3VuZChjeCAtIDQwKTsgeCA8PSBjeCArIDQwOyB4ICs9IDIpIHtcbiAgICAgIGNvbnN0IHYgPSBoKHgsIHopICsgTWF0aC5hYnMoeCAtIGN4KSAqIDAuMDI7XG4gICAgICBpZiAodiA8IGJlc3QpIHsgYmVzdCA9IHY7IGJ4ID0geDsgfVxuICAgIH1cbiAgICBjeCA9IGJ4O1xuICAgIHJhdy5wdXNoKHsgeDogYngsIHogfSk7XG4gICAgLy8gVGhlIHRyYWNlIGVuZHMgb25jZSBpdCByZWFjaGVzIG9wZW4gc2VhIGZvciBhIHN1c3RhaW5lZCBzdHJldGNoLlxuICAgIGlmIChiZXN0IDwgLTYgJiYgcmF3Lmxlbmd0aCA+IDIwICYmIGgoYngsIHogKyA4KSA8IC02ICYmIGgoYngsIHogKyAxNikgPCAtNikgYnJlYWs7XG4gIH1cbiAgY29uc3Qgc21vb3RoID0gcmF3Lm1hcCgocCwgaSkgPT4ge1xuICAgIGxldCBzeCA9IDAsIG4gPSAwO1xuICAgIGZvciAobGV0IGsgPSBNYXRoLm1heCgwLCBpIC0gNCk7IGsgPD0gTWF0aC5taW4ocmF3Lmxlbmd0aCAtIDEsIGkgKyA0KTsgaysrKSB7IHN4ICs9IHJhd1trXS54OyBuKys7IH1cbiAgICByZXR1cm4geyB4OiBzeCAvIG4sIHo6IHAueiB9O1xuICB9KTtcbiAgLy8gU3RvcmUgZG93bnN0cmVhbS1maXJzdDogaW5kZXggMCBpcyB0aGUgc2VhIG1vdXRoLlxuICBzbW9vdGgucmV2ZXJzZSgpO1xuICBjb25zdCBwb2ludHM6IFJpdmVyUG9pbnRbXSA9IFtdO1xuICBsZXQgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc21vb3RoLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGkgPiAwKSBzICs9IE1hdGguaHlwb3Qoc21vb3RoW2ldLnggLSBzbW9vdGhbaSAtIDFdLngsIHNtb290aFtpXS56IC0gc21vb3RoW2kgLSAxXS56KTtcbiAgICBwb2ludHMucHVzaCh7IHg6IHNtb290aFtpXS54LCB6OiBzbW9vdGhbaV0ueiwgcywgbGV2ZWw6IDAsIHdpZHRoOiA2IH0pO1xuICB9XG4gIHJldHVybiBuZXcgUml2ZXJSZWFjaChwb2ludHMsIDQwKTtcbn1cblxuLyoqIFdhdGVyLXN1cmZhY2UgZHJvcHMgYWxvbmcgdGhlIHVwcGVyIHJpdmVyLCBhcyAoZnJhY3Rpb24gb2YgbGVuZ3RoLCBtZXRyZXMpLiAqL1xuY29uc3QgRkFMTFM6IFJlYWRvbmx5QXJyYXk8cmVhZG9ubHkgW251bWJlciwgbnVtYmVyXT4gPSBbWzAuMiwgN10sIFswLjQ4LCAxMV0sIFswLjc0LCAxM11dO1xuY29uc3QgVVBQRVJfR1JBRElFTlQgPSAwLjAzO1xuXG4vKipcbiAqIEF1dGhvciB0aGUgdjIgbW91bnRhaW4gcml2ZXI6IGEgc2VlZGVkIG1lYW5kZXJpbmcgY2VudHJlbGluZSBmcm9tIHRoZSBsYWtlJ3NcbiAqIG5vcnRoIHNob3JlIHRvIGEgaGlnaGxhbmQgdGFybiwgd2l0aCBhIGxldmVsIHByb2ZpbGUgdGhhdCBvbmx5IHJpc2VzXG4gKiB1cHN0cmVhbSAoZ2VudGxlIGdyYWRpZW50IHBsdXMgdGhyZWUgY2FzY2FkZXMpLlxuICovXG5mdW5jdGlvbiBhdXRob3JVcHBlclJpdmVyKHNlZWQ6IG51bWJlciwgbGFrZTogSHlkcm9sb2d5WydsYWtlJ10pOiB7XG4gIHJlYWNoOiBSaXZlclJlYWNoOyB0YXJuOiBOb25OdWxsYWJsZTxIeWRyb2xvZ3lbJ3Rhcm4nXT47XG59IHtcbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoc2VlZCBeIDB4NWVlZDIpID4+PiAwKTtcbiAgY29uc3QgaiA9IChhOiBudW1iZXIpID0+IChybmQoKSAtIDAuNSkgKiAyICogYTtcbiAgY29uc3QgbW91dGggPSB7IHg6IGxha2UueCArIGxha2UucnggKiAwLjEsIHo6IGxha2UueiAtIGxha2UucnogKiAwLjU1IH07XG4gIGNvbnN0IGNvbnRyb2xzID0gW1xuICAgIG1vdXRoLFxuICAgIHsgeDogbGFrZS54ICsgMjAgKyBqKDIwKSwgejogLTQxMCArIGooMTUpIH0sXG4gICAgeyB4OiAtMTkwICsgaigzNSksIHo6IC01MjAgKyBqKDIwKSB9LFxuICAgIHsgeDogLTIxNSArIGooMzUpLCB6OiAtNjQwICsgaigyMCkgfSxcbiAgICB7IHg6IC0xNjUgKyBqKDMwKSwgejogLTc3MCArIGooMTUpIH0sXG4gIF07XG4gIC8vIENhdG11bGwtUm9tIHRocm91Z2ggdGhlIGNvbnRyb2xzLCB0aGVuIHJlc2FtcGxlIGF0IH44IG0gc3BhY2luZyB3aXRoIGFcbiAgLy8gc21hbGwgc2VlZGVkIG1lYW5kZXIgc28gdGhlIGNoYW5uZWwgaXMgbm90IGEgc21vb3RoIHNwbGluZS5cbiAgY29uc3QgZGVuc2U6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb250cm9scy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICBjb25zdCBwMCA9IGNvbnRyb2xzW01hdGgubWF4KDAsIGkgLSAxKV0sIHAxID0gY29udHJvbHNbaV07XG4gICAgY29uc3QgcDIgPSBjb250cm9sc1tpICsgMV0sIHAzID0gY29udHJvbHNbTWF0aC5taW4oY29udHJvbHMubGVuZ3RoIC0gMSwgaSArIDIpXTtcbiAgICBmb3IgKGxldCBrID0gMDsgayA8IDI0OyBrKyspIHtcbiAgICAgIGNvbnN0IHQgPSBrIC8gMjQsIHQyID0gdCAqIHQsIHQzID0gdDIgKiB0O1xuICAgICAgZGVuc2UucHVzaCh7XG4gICAgICAgIHg6IDAuNSAqICgyICogcDEueCArICgtcDAueCArIHAyLngpICogdCArICgyICogcDAueCAtIDUgKiBwMS54ICsgNCAqIHAyLnggLSBwMy54KSAqIHQyXG4gICAgICAgICAgKyAoLXAwLnggKyAzICogcDEueCAtIDMgKiBwMi54ICsgcDMueCkgKiB0MyksXG4gICAgICAgIHo6IDAuNSAqICgyICogcDEueiArICgtcDAueiArIHAyLnopICogdCArICgyICogcDAueiAtIDUgKiBwMS56ICsgNCAqIHAyLnogLSBwMy56KSAqIHQyXG4gICAgICAgICAgKyAoLXAwLnogKyAzICogcDEueiAtIDMgKiBwMi56ICsgcDMueikgKiB0MyksXG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgZGVuc2UucHVzaChjb250cm9sc1tjb250cm9scy5sZW5ndGggLSAxXSk7XG4gIGNvbnN0IHJlc2FtcGxlZDogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlcjsgczogbnVtYmVyIH0+ID0gW3sgLi4uZGVuc2VbMF0sIHM6IDAgfV07XG4gIGxldCBhY2MgPSAwLCBzID0gMDtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBkZW5zZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHN0ZXAgPSBNYXRoLmh5cG90KGRlbnNlW2ldLnggLSBkZW5zZVtpIC0gMV0ueCwgZGVuc2VbaV0ueiAtIGRlbnNlW2kgLSAxXS56KTtcbiAgICBhY2MgKz0gc3RlcDsgcyArPSBzdGVwO1xuICAgIGlmIChhY2MgPj0gOCB8fCBpID09PSBkZW5zZS5sZW5ndGggLSAxKSB7XG4gICAgICBjb25zdCBtID0gKGZibTIocyAvIDYwLCAzLjEsIHNlZWQgKyA4MDEsIDIpIC0gMC41KSAqIDE0O1xuICAgICAgcmVzYW1wbGVkLnB1c2goeyB4OiBkZW5zZVtpXS54ICsgbSwgejogZGVuc2VbaV0ueiwgcyB9KTtcbiAgICAgIGFjYyA9IDA7XG4gICAgfVxuICB9XG4gIGNvbnN0IHRvdGFsID0gcmVzYW1wbGVkW3Jlc2FtcGxlZC5sZW5ndGggLSAxXS5zO1xuICBjb25zdCBsZXZlbEF0ID0gKHN2OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGxldCBsZXZlbCA9IHN2ICogVVBQRVJfR1JBRElFTlQ7XG4gICAgZm9yIChjb25zdCBbZnJhYywgZHJvcF0gb2YgRkFMTFMpIHtcbiAgICAgIC8vIEVhY2ggZmFsbCBpcyBhIHNob3J0IGNhc2NhZGUgb3ZlciB+MTAgbSBvZiBjaGFubmVsLlxuICAgICAgbGV2ZWwgKz0gZHJvcCAqIHNtb290aHN0ZXAodG90YWwgKiBmcmFjIC0gNSwgdG90YWwgKiBmcmFjICsgNSwgc3YpO1xuICAgIH1cbiAgICAvLyBUaGUgZmlyc3QgNDAgbSBpbnRvIHRoZSBsYWtlIHN0YXlzIGF0IGxha2UgbGV2ZWwuXG4gICAgcmV0dXJuIHN2IDwgNDAgPyAwIDogbGV2ZWwgLSA0MCAqIFVQUEVSX0dSQURJRU5UO1xuICB9O1xuICBjb25zdCBwb2ludHM6IFJpdmVyUG9pbnRbXSA9IHJlc2FtcGxlZC5tYXAoKHApID0+ICh7XG4gICAgeDogcC54LCB6OiBwLnosIHM6IHAucywgbGV2ZWw6IE1hdGgubWF4KDAsIGxldmVsQXQocC5zKSksXG4gICAgd2lkdGg6IDMuMiArIDIuMiAqIGZibTIocC5zIC8gNzAsIDkuNywgc2VlZCArIDgwMiwgMikgKyAoMSAtIHAucyAvIHRvdGFsKSAqIDEuNSxcbiAgfSkpO1xuICBjb25zdCBzb3VyY2UgPSBwb2ludHNbcG9pbnRzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4ge1xuICAgIHJlYWNoOiBuZXcgUml2ZXJSZWFjaChwb2ludHMsIDExMCksXG4gICAgdGFybjogeyB4OiBzb3VyY2UueCwgejogc291cmNlLnosIHI6IDE4LCBsZXZlbDogc291cmNlLmxldmVsIH0sXG4gIH07XG59XG4iLCAiLy8gVm94ZWwgbWF0ZXJpYWwgaWRzLiBQdXJlIGRhdGEgc2hhcmVkIGJ5IHRoZSBzaW11bGF0aW9uIGxheWVyIChELTAwNSkuXG4vLyBJZHMgYXJlIHBlcnNpc3RlZCBpbiBzbmFwc2hvdCBlZGl0cywgc28gZXhpc3RpbmcgdmFsdWVzIG11c3QgbmV2ZXIgY2hhbmdlLlxuZXhwb3J0IGNvbnN0IE1BVCA9IHtcbiAgQUlSOiAwLFxuICBHUkFTUzogMSxcbiAgU09JTDogMixcbiAgU0FORDogMyxcbiAgR1JBVkVMOiA0LFxuICBTVE9ORTogNSxcbiAgT1JFOiA2LFxuICBXQVRFUjogNyxcbiAgQkVEUk9DSzogOCxcbiAgTU9TUzogOSxcbiAgLyoqIEdlbmVyYXRvciB2MiBoaWdobGFuZHMuIE5ldmVyIHByb2R1Y2VkIGJ5IGdlbmVyYXRvciB2MS4gKi9cbiAgU05PVzogMTAsXG59IGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgTWF0SWQgPSAodHlwZW9mIE1BVClba2V5b2YgdHlwZW9mIE1BVF07XG5cbmV4cG9ydCBjb25zdCBpc1NvbGlkID0gKG06IG51bWJlcik6IGJvb2xlYW4gPT4gbSAhPT0gTUFULkFJUiAmJiBtICE9PSBNQVQuV0FURVI7XG5leHBvcnQgY29uc3QgaXNPcGFxdWUgPSBpc1NvbGlkO1xuXG4vKiogSGlnaGVzdCBtYXRlcmlhbCBpZCB0aGF0IG1heSBhcHBlYXIgaW4gYSB2b3hlbCBlZGl0LiAqL1xuZXhwb3J0IGNvbnN0IE1BWF9NQVRfSUQgPSAxMDtcbiIsICIvLyBUZXJyYWluIGdlbmVyYXRvciB2MiBcdTIwMTQgdGhlIHZhbGxleS13aXRoLW1vdW50YWlucyBnZW9ncmFwaHkgKHB1cmUgVFMsIEQtMDA1KS5cbi8vXG4vLyBDb21wYXRpYmlsaXR5IGNvbnRyYWN0OiBpbnNpZGUgdGhlIGZvdW5kZXIgY29ycmlkb3IgKHRoZSBzZXR0bGVtZW50IHZhbGxleSxcbi8vIHRoZSBsYWtlIGFuZCB0aGUgbG93bGFuZCByaXZlcikgdjIgaGVpZ2h0cyBlcXVhbCB2MSBleGFjdGx5LCBzbyB0aGUgcGlubmVkXG4vLyBmb3VuZGVyIHByb2plY3RzLCB0aGVpciBwcmVwYXJhdGlvbiB0YXJnZXRzIGFuZCBuYXR1cmFsIGVudGl0aWVzIHRoZXJlIGFyZVxuLy8gdW5jaGFuZ2VkLiBPdXRzaWRlIGl0IHYyIGFkZHM6XG4vLyAgIC0gYSBub3J0aGVybiBtYXNzaWYgb24gYW4gZXh0ZW5kZWQgaXNsYW5kLCB3aXRoIHNub3cgYWJvdmUgdGhlIHNub3dsaW5lO1xuLy8gICAtIGZsYW5raW5nIHJhbmdlcyB3ZXN0IGFuZCBlYXN0IG9mIHRoZSB2YWxsZXksIHRlcnJhY2VkIGludG8gY2xpZmYgYmFuZHM7XG4vLyAgIC0gYSBtb3VudGFpbiByaXZlciBjYXJ2ZWQgaW50byB0aGUgbWFzc2lmIGZyb20gYSB0YXJuIGRvd24gdG8gdGhlIGxha2UsXG4vLyAgICAgd2hvc2Ugd2F0ZXIgc3VyZmFjZSBjb21lcyBmcm9tIEh5ZHJvbG9neSBhbmQgbmV2ZXIgcmlzZXMgZG93bnN0cmVhbTtcbi8vICAgLSBhIGNvbnRpbnVvdXMgbG93bGFuZCBjaGFubmVsICh2MSBoYXMgYSBkcnkgZm9yZCBzb3V0aCBvZiB0aGUgc2hlbGYpLlxuLy8gSGVpZ2h0cyBhcmUgaW50ZWdlcnMgaW4gWy0xNCwgMTA0XS5cbmltcG9ydCB7IGNsYW1wLCBmYm0yLCBsZXJwLCBzbW9vdGhzdGVwIH0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQgeyBNQVQsIE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuaW1wb3J0IHsgSHlkcm9sb2d5IH0gZnJvbSAnLi9oeWRyb2xvZ3knO1xuXG5leHBvcnQgY29uc3QgVjJfU05PV0xJTkUgPSA3NDtcbmV4cG9ydCBjb25zdCBWMl9NQVhfSEVJR0hUID0gMTA0O1xuXG5leHBvcnQgdHlwZSBWMUhlaWdodCA9IChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVjJDb2x1bW4ge1xuICAvKiogVG9wIHNvbGlkIHkgKyAxIChzYW1lIGNvbnZlbnRpb24gYXMgc3VyZmFjZUhlaWdodEF0KS4gKi9cbiAgaDogbnVtYmVyO1xuICAvKiogV2F0ZXIgc3VyZmFjZSBmb3IgdGhpcyBjb2x1bW46IGNlbGxzIFtoLCBsZXZlbCkgaG9sZCB3YXRlci4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgLyoqIFRydWUgd2hlbiB0aGlzIGNvbHVtbiBpcyBwYXJ0IG9mIHRoZSBjYXJ2ZWQgbW91bnRhaW4tcml2ZXIgY2hhbm5lbC4gKi9cbiAgY2hhbm5lbDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFRlcnJhaW5WMiB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHJlYWRvbmx5IHNlZWQ6IG51bWJlcixcbiAgICBwcml2YXRlIHJlYWRvbmx5IHYxOiBWMUhlaWdodCxcbiAgICByZWFkb25seSBoeWRyb2xvZ3k6IEh5ZHJvbG9neSxcbiAgKSB7fVxuXG4gIC8qKiAwID0gZXhhY3RseSB2MSAoZm91bmRlciBjb3JyaWRvcik7IDEgPSBmdWxsIHYyIHJlbGllZi4gKi9cbiAgcmVsaWVmTWFzayh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3Qgbm9ydGggPSBzbW9vdGhzdGVwKC0zOTAsIC00NzAsIHopO1xuICAgIC8vIFRoZSB3ZXN0IHJhbmdlIGtlZXBzIGNsZWFyIG9mIHRoZSBsYWtlIGJhc2luIHVudGlsIHRoZSBsYWtlIGlzIHBhc3NlZC5cbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UsIHdlc3RFZGdlIC0gOTAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDIzMCwgMzMwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgLyoqIDAgYXQgdGhlIHJhbmdlIGZyb250LCAxIGRlZXAgaW5zaWRlOiBmb290aGlsbHMgZmlyc3QsIHBlYWtzIGJlaGluZC4gKi9cbiAgcmFuZ2VEZXB0aCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3Qgbm9ydGggPSBzbW9vdGhzdGVwKC00MjAsIC03MDAsIHopO1xuICAgIGNvbnN0IHdlc3RFZGdlID0gbGVycCgtNDUwLCAtMzIwLCBzbW9vdGhzdGVwKC0yMjAsIC0xNDAsIHopKTtcbiAgICBjb25zdCB3ZXN0ID0gc21vb3Roc3RlcCh3ZXN0RWRnZSAtIDQwLCB3ZXN0RWRnZSAtIDMwMCwgeCk7XG4gICAgY29uc3QgZWFzdCA9IHNtb290aHN0ZXAoMjcwLCA1NjAsIHgpO1xuICAgIHJldHVybiBNYXRoLm1heChub3J0aCwgd2VzdCwgZWFzdCk7XG4gIH1cblxuICBjb2x1bW4oeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWMkNvbHVtbiB7XG4gICAgY29uc3Qgc2VlZCA9IHRoaXMuc2VlZDtcbiAgICBjb25zdCBiYXNlID0gdGhpcy52MShzZWVkLCB4LCB6KTtcbiAgICBjb25zdCBtYXNrID0gdGhpcy5yZWxpZWZNYXNrKHgsIHopO1xuICAgIGxldCBoID0gYmFzZTtcblxuICAgIGlmIChtYXNrID4gMCkge1xuICAgICAgLy8gRXh0ZW5kIHRoZSBpc2xhbmQgbm9ydGggc28gdGhlIG1hc3NpZiBoYXMgcm9vbSAodjEgY29hc3QgaXMgfnogLTYwMCkuXG4gICAgICBjb25zdCBub3J0aExhbmQgPSBzbW9vdGhzdGVwKC00MjAsIC01MjAsIHopO1xuICAgICAgY29uc3Qgc2hvcmUgPSAxIC0gTWF0aC5oeXBvdCgoeCArIDE1MCkgLyA1NjAsICh6ICsgNjkwKSAvIDMwMClcbiAgICAgICAgKyAoZmJtMih4IC8gMTYwLCB6IC8gMTYwLCBzZWVkICsgNzAxLCAzKSAtIDAuNSkgKiAwLjM7XG4gICAgICBjb25zdCBsYW5kTiA9IHNtb290aHN0ZXAoMC4wLCAwLjE0LCBzaG9yZSkgKiBub3J0aExhbmQ7XG4gICAgICBjb25zdCBncm91bmQgPSBsZXJwKGJhc2UsIE1hdGgubWF4KGJhc2UsIDUgKyA1ICogZmJtMih4IC8gOTAsIHogLyA5MCwgc2VlZCArIDcwMiwgMikpLCBsYW5kTik7XG5cbiAgICAgIC8vIFJpZGdlZCBtYXNzaWYgd2l0aCB0ZXJyYWNlZCBjbGlmZiBiYW5kcy5cbiAgICAgIGNvbnN0IHd4ID0geCArIChmYm0yKHggLyAyNjAsIHogLyAyNjAsIHNlZWQgKyA3MDMsIDMpIC0gMC41KSAqIDEyMDtcbiAgICAgIGNvbnN0IHd6ID0geiArIChmYm0yKHggLyAyNjAgKyA1LjEsIHogLyAyNjAgLSAyLjcsIHNlZWQgKyA3MDQsIDMpIC0gMC41KSAqIDEyMDtcbiAgICAgIGNvbnN0IHIxID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMjEwLCB3eiAvIDIxMCwgc2VlZCArIDcwNSwgNCkgLSAxKTtcbiAgICAgIGNvbnN0IHIyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODAsIHd6IC8gODAsIHNlZWQgKyA3MDYsIDMpIC0gMSk7XG4gICAgICBjb25zdCBsdW1wID0gZmJtMih3eCAvIDEyMCwgd3ogLyAxMjAsIHNlZWQgKyA3MDcsIDMpO1xuICAgICAgY29uc3QgZGVwdGggPSB0aGlzLnJhbmdlRGVwdGgoeCwgeik7XG4gICAgICBsZXQgbW91bnRhaW4gPSAxNiArICg4ICsgODAgKiBkZXB0aCkgKiAoMC41NSAqIHIxICogcjEgKyAwLjI4ICogcjIgKyAwLjE3ICogbHVtcClcbiAgICAgICAgKyAxOCAqIGRlcHRoICogc21vb3Roc3RlcCgwLjU1LCAwLjksIHIxKTtcbiAgICAgIGNvbnN0IGJhbmQgPSA2ICsgMiAqIGZibTIoeCAvIDE0MCwgeiAvIDE0MCwgc2VlZCArIDcwOCwgMik7XG4gICAgICBjb25zdCB0ID0gTWF0aC5mbG9vcihtb3VudGFpbiAvIGJhbmQpO1xuICAgICAgY29uc3QgZnJhYyA9IG1vdW50YWluIC8gYmFuZCAtIHQ7XG4gICAgICBtb3VudGFpbiA9ICh0ICsgc21vb3Roc3RlcCgwLjUsIDAuOCwgZnJhYykpICogYmFuZDtcblxuICAgICAgLy8gT25seSBsYW5kIHJpc2VzOyB0aGUgc2VhIHN0YXlzIHNlYSwgc28gcmFuZ2VzIGVuZCBpbiBjb2FzdGFsIGNsaWZmcy5cbiAgICAgIGNvbnN0IGxhbmRGYWN0b3IgPSBzbW9vdGhzdGVwKC0yLCA4LCBncm91bmQpO1xuICAgICAgaCA9IGxlcnAoZ3JvdW5kLCBNYXRoLm1heChncm91bmQsIG1vdW50YWluKSwgbWFzayAqIGxhbmRGYWN0b3IpO1xuICAgIH1cblxuICAgIGxldCBsZXZlbCA9IGggPCAwID8gMCA6IC1JbmZpbml0eTtcbiAgICBsZXQgY2hhbm5lbCA9IGZhbHNlO1xuXG4gICAgLy8gTW91bnRhaW4gcml2ZXI6IHZhbGxleSBmbG9vciwgYmFua3MgYW5kIGNoYW5uZWwgZm9sbG93IHRoZSB3YXRlciBsZXZlbC5cbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlcikge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgY29uc3QgcmFpc2VkID0gaGl0LmxldmVsID4gMC4yNTtcbiAgICAgICAgY29uc3QgdncgPSA1NSArIDI4ICogZmJtMihoaXQucyAvIDkwLCAxLjcsIHNlZWQgKyA3MDksIDIpO1xuICAgICAgICBjb25zdCBmbG9vciA9IGhpdC5sZXZlbCArIDEuNSArIDIuMiAqIGZibTIoeCAvIDQwLCB6IC8gNDAsIHNlZWQgKyA3MTAsIDIpICsgaGl0LmQgKiAwLjA2O1xuICAgICAgICBjb25zdCB0ID0gc21vb3Roc3RlcCh2dyAqIDAuMywgdncsIGhpdC5kKTtcbiAgICAgICAgaCA9IE1hdGgubWluKGgsIGxlcnAoZmxvb3IsIGgsIHQpKTtcbiAgICAgICAgY29uc3QgdyA9IGhpdC53aWR0aDtcbiAgICAgICAgaWYgKHJhaXNlZCAmJiBoaXQuZCA8IHcgKyAzKSB7XG4gICAgICAgICAgLy8gQmFua3MgaG9sZCBhIHJhaXNlZCByaXZlcjogbmV2ZXIgYmVsb3cgaXRzIHdhdGVyIHN1cmZhY2UuIEF0IGxha2VcbiAgICAgICAgICAvLyBsZXZlbCB0aGUgc2VhLWxldmVsIGZpbGwgYWxyZWFkeSBjb250YWlucyB0aGUgd2F0ZXIuXG4gICAgICAgICAgaCA9IE1hdGgubWF4KGgsIE1hdGguY2VpbChoaXQubGV2ZWwpICsgMSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGhpdC5kIDwgdykge1xuICAgICAgICAgIGNvbnN0IGJlZCA9IGhpdC5sZXZlbCAtICgxLjIgKyAxLjMgKiAoMSAtIGhpdC5kIC8gdykpO1xuICAgICAgICAgIGggPSBNYXRoLm1pbihoLCBiZWQpO1xuICAgICAgICAgIGlmIChyYWlzZWQpIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIE1hdGgucm91bmQoaGl0LmxldmVsKSk7XG4gICAgICAgICAgY2hhbm5lbCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IHRhcm4gPSB0aGlzLmh5ZHJvbG9neS50YXJuO1xuICAgICAgaWYgKHRhcm4pIHtcbiAgICAgICAgY29uc3QgdGQgPSBNYXRoLmh5cG90KHggLSB0YXJuLngsIHogLSB0YXJuLnopXG4gICAgICAgICAgKiAoMSArIDAuMiAqIChmYm0yKHggLyAzMCwgeiAvIDMwLCBzZWVkICsgNzExLCAyKSAtIDAuNSkpO1xuICAgICAgICBpZiAodGQgPCB0YXJuLnIgKyA2KSB7XG4gICAgICAgICAgY29uc3QgcmltID0gTWF0aC5jZWlsKHRhcm4ubGV2ZWwpICsgMTtcbiAgICAgICAgICBpZiAodGQgPj0gdGFybi5yKSBoID0gTWF0aC5tYXgoaCwgcmltKTtcbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGggPSBNYXRoLm1pbihNYXRoLm1heChoLCByaW0pLCB0YXJuLmxldmVsIC0gMSAtIDMgKiBzbW9vdGhzdGVwKHRhcm4uciwgMCwgdGQpKTtcbiAgICAgICAgICAgIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIE1hdGgucm91bmQodGFybi5sZXZlbCkpO1xuICAgICAgICAgICAgY2hhbm5lbCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gTG93bGFuZCBjaGFubmVsIGNvbnRpbnVpdHk6IHYxIGxlYXZlcyBhIGRyeSBmb3JkIHdoZXJlIHRoZSBzaGVsZiBtZWV0cyB0aGUgcml2ZXIuXG4gICAgY29uc3QgbG93ID0gdGhpcy5oeWRyb2xvZ3kubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDwgMi41ICYmIGggPj0gMCAmJiBiYXNlIDwgNCkgaCA9IC0xO1xuXG4gICAgaCA9IE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCBWMl9NQVhfSEVJR0hUKSk7XG4gICAgaWYgKGggPCAwKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCAwKTtcbiAgICByZXR1cm4geyBoLCBsZXZlbDogbGV2ZWwgPT09IC1JbmZpbml0eSA/IGggOiBsZXZlbCwgY2hhbm5lbCB9O1xuICB9XG5cbiAgaGVpZ2h0KHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5jb2x1bW4oeCwgeikuaDtcbiAgfVxuXG4gIC8qKiB2MiB0b3AgbWF0ZXJpYWwuIEZhbGxzIGJhY2sgdG8gdGhlIHYxIHJ1bGVzIGZvciB0aGUgdW5jaGFuZ2VkIGNvcnJpZG9yLiAqL1xuICB0b3BNYXRlcmlhbChcbiAgICB4OiBudW1iZXIsIHo6IG51bWJlciwgY29sOiBWMkNvbHVtbiwgc2xvcGU6IG51bWJlcixcbiAgICB2MVRvcDogKGg6IG51bWJlciwgc2xvcGU6IG51bWJlcikgPT4gTWF0SWQsXG4gICk6IE1hdElkIHtcbiAgICBjb25zdCBoID0gY29sLmg7XG4gICAgaWYgKGNvbC5jaGFubmVsICYmIGNvbC5sZXZlbCA+IGgpIHJldHVybiBNQVQuR1JBVkVMO1xuICAgIGNvbnN0IHVwcGVyID0gdGhpcy5oeWRyb2xvZ3kudXBwZXI7XG4gICAgaWYgKHVwcGVyICYmIGggPiAxKSB7XG4gICAgICBjb25zdCBoaXQgPSB1cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCAmJiBoaXQuZCA8IGhpdC53aWR0aCArIDIuNSAmJiBoaXQubGV2ZWwgPiAwLjI1KSB7XG4gICAgICAgIHJldHVybiBmYm0yKHggLyA2LCB6IC8gNiwgdGhpcy5zZWVkICsgNzEyLCAxKSA+IDAuNSA/IE1BVC5HUkFWRUwgOiBNQVQuU0FORDtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgc25vd2xpbmUgPSBWMl9TTk9XTElORSArIChmYm0yKHggLyA3MCwgeiAvIDcwLCB0aGlzLnNlZWQgKyA3MTMsIDMpIC0gMC41KSAqIDE2O1xuICAgIGlmIChoID49IHNub3dsaW5lICYmIHNsb3BlIDw9IDMpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAoaCA+PSBzbm93bGluZSAtIDYgJiYgc2xvcGUgPD0gMSAmJiBmYm0yKHggLyAyMCwgeiAvIDIwLCB0aGlzLnNlZWQgKyA3MTQsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TTk9XO1xuICAgIGlmICh0aGlzLnJlbGllZk1hc2soeCwgeikgPiAwLjUgJiYgaCA+IDMwICYmIHNsb3BlID49IDIpIHJldHVybiBNQVQuU1RPTkU7XG4gICAgcmV0dXJuIHYxVG9wKGgsIHNsb3BlKTtcbiAgfVxufVxuIiwgIi8vIFNpbXVsYXRpb24gbGF5ZXIgXHUyMDE0IHB1cmUgVHlwZVNjcmlwdCwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDEgd29ybGQgZm91bmRhdGlvbjogYSBjaHVua2VkLCBnZW51aW5lbHkgdGhyZWUtZGltZW5zaW9uYWwgdm94ZWwgd29ybGQuXG4vLyBUaGUgc3RvcmVkIHN0YXRlIGlzIG9uZSBtYXRlcmlhbCBieXRlIHBlciBjZWxsICgwID0gYWlyKTsgb2NjdXBhbmN5IGlzXG4vLyBpbXBsaWNpdC4gU3VyZmFjZSBoZWlnaHQgaXMgYSBkZXJpdmVkIHF1ZXJ5LCBub3QgdGhlIHN0b3JhZ2UuIFRoaXMgcmVwbGFjZXNcbi8vIHRoZSBmb3JtZXIgMjU2IHggMjU2IGhlaWdodGZpZWxkIChzZWUgSVItMDA1KS5cbi8vXG4vLyBXb3JsZCBtZXRyZXM6IHgveiBpbiBbLTEwMjQsIDEwMjQpLCB5IGluIFstMTYsIDExMiksIHNlYSBsZXZlbCAwLlxuLy8gQSBjaHVuayBpcyAzMiB4IDMyIHggMTI4IGNlbGxzLiBHZW5lcmF0aW9uIGlzIGEgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCxcbi8vIGdlbmVyYXRvciB2ZXJzaW9uLCBwYXJhbWV0ZXJzIGFuZCBjaHVuayBjb29yZGluYXRlczsgZWRpdHMgYXJlIHJlY29yZGVkXG4vLyBzZXBhcmF0ZWx5IGFuZCByZS1hcHBsaWVkIHdoZW4gYSBjaHVuayBpcyByZWdlbmVyYXRlZC5cbmltcG9ydCB0eXBlIHsgU3RydWN0dXJlIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB0eXBlIHsgTGlmZVN0YXRlIH0gZnJvbSAnLi9lY29ub215JztcbmltcG9ydCB0eXBlIHsgSG9tZXN0ZWFkU3RhdGUgfSBmcm9tICcuL2hvbWVzdGVhZCc7XG5pbXBvcnQgeyBpc1N0b25lUmVwbGF5IH0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuaW1wb3J0IHsgSHlkcm9sb2d5IH0gZnJvbSAnLi9oeWRyb2xvZ3knO1xuaW1wb3J0IHsgVGVycmFpblYyLCBWMkNvbHVtbiB9IGZyb20gJy4vdGVycmFpbi12Mic7XG5cbmV4cG9ydCBjb25zdCBXT1JMRF9TSVpFID0gMjA0ODtcbmV4cG9ydCBjb25zdCBIQUxGID0gV09STERfU0laRSAvIDI7XG5leHBvcnQgY29uc3QgQ0hVTktfU0laRSA9IDMyO1xuZXhwb3J0IGNvbnN0IENIVU5LU19QRVJfU0lERSA9IFdPUkxEX1NJWkUgLyBDSFVOS19TSVpFO1xuZXhwb3J0IGNvbnN0IFlfTUlOID0gLTE2O1xuZXhwb3J0IGNvbnN0IFlfTUFYID0gMTEyO1xuZXhwb3J0IGNvbnN0IFdPUkxEX0hFSUdIVCA9IFlfTUFYIC0gWV9NSU47XG5leHBvcnQgY29uc3QgU0VBX0xFVkVMID0gMDtcbmV4cG9ydCBjb25zdCBXQVRFUiA9IFNFQV9MRVZFTDtcbi8qKiBHZW5lcmF0b3IgdjE6IHRoZSBvcmlnaW5hbCAyMDQ4IG0gaXNsYW5kLiBEZWZhdWx0IGZvciBjcmVhdGVXb3JsZCBhbmQgYWxsIGxlZ2FjeSBzYXZlcy4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVkVSU0lPTiA9IDE7XG4vKiogR2VuZXJhdG9yIHYyOiB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IHdpdGggYSBtb3VudGFpbiByaXZlciAoc2VlIHRlcnJhaW4tdjIudHMpLiAqL1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WMiA9IDI7XG4vKiogVGhlIGdlbmVyYXRvciBuZXcgYnJvd3NlciB3b3JsZHMgdXNlIGJ5IGRlZmF1bHQuICovXG5leHBvcnQgY29uc3QgTEFURVNUX0dFTkVSQVRPUl9WRVJTSU9OID0gR0VORVJBVE9SX1YyO1xuZXhwb3J0IGNvbnN0IFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlM6IHJlYWRvbmx5IG51bWJlcltdID0gW0dFTkVSQVRPUl9WRVJTSU9OLCBHRU5FUkFUT1JfVjJdO1xuZXhwb3J0IGNvbnN0IGlzU3VwcG9ydGVkR2VuZXJhdG9yID0gKHY6IHVua25vd24pOiB2IGlzIG51bWJlciA9PlxuICB0eXBlb2YgdiA9PT0gJ251bWJlcicgJiYgU1VQUE9SVEVEX0dFTkVSQVRPUl9WRVJTSU9OUy5pbmNsdWRlcyh2KTtcbmV4cG9ydCBjb25zdCBDSFVOS19WT0xVTUUgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRSAqIFdPUkxEX0hFSUdIVDtcbmV4cG9ydCBjb25zdCBDSFVOS19BUkVBID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkU7XG5cbmV4cG9ydCB7IE1BVCwgaXNTb2xpZCwgaXNPcGFxdWUsIE1BWF9NQVRfSUQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5leHBvcnQgdHlwZSB7IE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuaW1wb3J0IHsgTUFULCBpc1NvbGlkLCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcblxuZXhwb3J0IHtcbiAgY2xhbXAsIGxlcnAsIGhhc2gyaSwgaGFzaDNpLCBtdWxiZXJyeTMyLCBmYm0yLFxufSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBzbW9vdGhzdGVwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgdmFsdWVOb2lzZTMsIGZibTIsIGZibTMsXG59IGZyb20gJy4vbm9pc2UnO1xuXG4vLyAtLS0tLS0tLS0tIHdvcmxkIHR5cGVzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRQYXJhbXMge1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9QQVJBTVM6IFdvcmxkUGFyYW1zID0ge1xuICBzaXplOiBXT1JMRF9TSVpFLFxuICBjaHVua1NpemU6IENIVU5LX1NJWkUsXG4gIHlNaW46IFlfTUlOLFxuICB5TWF4OiBZX01BWCxcbiAgc2VhTGV2ZWw6IFNFQV9MRVZFTCxcbiAgZ2VuZXJhdG9yVmVyc2lvbjogR0VORVJBVE9SX1ZFUlNJT04sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBrZXk6IHN0cmluZztcbiAgLyoqIHggKyB6KjMyICsgKHktWV9NSU4pKjEwMjQgKi9cbiAgZGF0YTogVWludDhBcnJheTtcbiAgLyoqIHRvcCBzb2xpZCB5LCBlbmNvZGVkIGFzICh5IC0gWV9NSU4pLCAwLi4xMjc7IDAgbWVhbnMgbm8gc29saWQuICovXG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3AgbWF0ZXJpYWwgcGVyIGNvbHVtbi4gKi9cbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbiAgZGlydHk6IGJvb2xlYW47XG4gIGdlbmVyYXRlZEF0OiBudW1iZXI7XG59XG5cbi8vIE5hdHVyYWwgYXNzZXRzIGFyZSB0aGUgcHJvamVjdCdzIFN0eWwgKGBuYXRfYCkgcGlwZWxpbmUgKEFTLTAwMSB2MiksIG5vdFxuLy8gTm94ZWwgYXJjaGl0ZWN0dXJlLiBOb3hlbCByZW1haW5zIHRoZSBodW1hbi1tYWRlIGtpdC93YXlzdG9uZS9tYXJrZXIgc3lzdGVtLlxuLy8gUmV0aXJlZCBvbmx5IGFzIHdvcmxkIGNvbnRlbnQuIFRoZSBuYW1lcyByZW1haW4gaW4gdGhlIHNlcmlhbGl6ZWQgdHlwZSBzb1xuLy8gb2xkIHNuYXBzaG90cyBhbmQgYWNjZXB0ZWQgaGFydmVzdCBqb3VybmFscyBjYW4gYmUgbWlncmF0ZWQgd2l0aG91dCByZWplY3Rpbmdcbi8vIG90aGVyd2lzZSB2YWxpZCBzYXZlcy4gR2VuZXJhdGlvbiwgY29sbGlzaW9uIGFuZCBpbnNwZWN0aW9uIG5ldmVyIHVzZSB0aGVtLlxuZXhwb3J0IGNvbnN0IFJFVElSRURfU1RPTkVfS0lORFMgPSBuZXcgU2V0PEVudGl0eUtpbmQ+KFtcbiAgJ3N0eWxfcm9ja19zbWFsbCcsICdzdHlsX3JvY2tfbWVkaXVtJywgJ3N0eWxfcm9ja19sYXJnZScsXG5dKTtcbmV4cG9ydCBjb25zdCBpc1JldGlyZWRTdG9uZUtpbmQgPSAoa2luZDogRW50aXR5S2luZCk6IGJvb2xlYW4gPT4gUkVUSVJFRF9TVE9ORV9LSU5EUy5oYXMoa2luZCk7XG5leHBvcnQgdHlwZSBBY3RpdmVFbnRpdHlLaW5kID0gRXhjbHVkZTxFbnRpdHlLaW5kLFxuICAnc3R5bF9yb2NrX3NtYWxsJyB8ICdzdHlsX3JvY2tfbWVkaXVtJyB8ICdzdHlsX3JvY2tfbGFyZ2UnPjtcblxuZnVuY3Rpb24gbGl2ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBFbnRpdHkgfCBudWxsIHtcbiAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgcmV0dXJuICFlbnRpdHkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhpZCkgPyBudWxsIDogZW50aXR5O1xufVxuXG5leHBvcnQgdHlwZSBFbnRpdHlLaW5kID1cbiAgfCAnc3R5bF90cmVlX3NwaXJlJ1xuICB8ICdzdHlsX3RyZWVfdGFibGUnXG4gIHwgJ3N0eWxfdHJlZV9jbHVzdGVyJ1xuICB8ICdzdHlsX3RyZWVfYmxvc3NvbSdcbiAgfCAnc3R5bF9zaHJ1YidcbiAgfCAnc3R5bF9yb2NrX3NtYWxsJ1xuICB8ICdzdHlsX3JvY2tfbWVkaXVtJ1xuICB8ICdzdHlsX3JvY2tfbGFyZ2UnXG4gIHwgJ3N0eWxfb3JlJ1xuICB8ICdzdHlsX2NhaXJuJ1xuICB8ICd3YXlzdG9uZSdcbiAgfCAnbWFya2VyJztcblxuZXhwb3J0IHR5cGUgUmVzb3VyY2VUeXBlID0gJ3dvb2QnIHwgJ3N0b25lJyB8ICdvcmUnIHwgJ2ZpYmVyJztcblxuZXhwb3J0IGludGVyZmFjZSBFbnRpdHkge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICBjaHVuazogc3RyaW5nO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgc2NhbGU6IG51bWJlcjtcbiAgdmFyaWFudDogbnVtYmVyO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgcmVtYWluaW5nOiBudW1iZXI7XG4gIHlpZWxkUGVySGFydmVzdDogbnVtYmVyO1xuICAvKiogVHJ1ZSBvbmNlIHRoZSBlbnRpdHkgaXMgZnVsbHkgZGVwbGV0ZWQuICovXG4gIGhhcnZlc3RlZDogYm9vbGVhbjtcbiAgLyoqIFRydWUgYWZ0ZXIgdGhlIGZpcnN0IHN1Y2Nlc3NmdWwgaGFydmVzdCwgZXZlbiBpZiB5aWVsZCByZW1haW5zLiAqL1xuICBoYXJ2ZXN0ZWRPbmNlPzogYm9vbGVhbjtcbiAgcHJvdmlzaW9uYWw6IGJvb2xlYW47XG4gIGF1dGhvcmVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5veGVsU2l0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHByb3Zpc2lvbmFsOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZ2lvbkluZm8ge1xuICBpZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICB0eXBlOiAncGxhaW4nIHwgJ2ZvcmVzdCcgfCAnaGlsbHMnIHwgJ2hpZ2hsYW5kJyB8ICd3YXRlcicgfCAncmlkZ2UnO1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICByeDogbnVtYmVyO1xuICByejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkU3RhdHMge1xuICBjaHVua3NHZW5lcmF0ZWQ6IG51bWJlcjtcbiAgY2h1bmtzRXZpY3RlZDogbnVtYmVyO1xuICB2b3hlbHNGaWxsZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGlvbk1zOiBudW1iZXI7XG4gIGVudGl0aWVzOiBudW1iZXI7XG4gIHRyZWVzOiBudW1iZXI7XG4gIHBpbmtUcmVlczogbnVtYmVyO1xuICBwaW5rT3ZlcmZsb3c6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcGFyYW1zOiBXb3JsZFBhcmFtcztcbiAgY2h1bmtzOiBNYXA8c3RyaW5nLCBWb3hlbENodW5rPjtcbiAgZW50aXRpZXM6IE1hcDxzdHJpbmcsIEVudGl0eT47XG4gIGVudGl0eUNodW5rczogTWFwPHN0cmluZywgc3RyaW5nW10+O1xuICAvKiogQ2h1bmtzIHdob3NlIGRldGVybWluaXN0aWMgbmF0dXJhbC1lbnRpdHkgc3RhdGUgaGFzIGJlZW4gY2hhbmdlZC4gKi9cbiAgZW50aXR5Q2hhbmdlczogU2V0PHN0cmluZz47XG4gIC8qKiBUb21ic3RvbmVzIGZvciByZW1vdmVkIGRldGVybWluaXN0aWMgbmF0dXJhbCBlbnRpdGllcy4gKi9cbiAgZW50aXR5UmVtb3ZhbHM6IFNldDxzdHJpbmc+O1xuICAvKiogQXV0aG9yaXRhdGl2ZSBidWlsdCBzdHJ1Y3R1cmVzIChob3VzZSwgcGF0aCwgdGVycmFjZXMsIGNyb3BzKS4gKi9cbiAgc3RydWN0dXJlczogTWFwPHN0cmluZywgU3RydWN0dXJlPjtcbiAgc2l0ZXM6IE5veGVsU2l0ZVtdO1xuICByZWdpb25zOiBSZWdpb25JbmZvW107XG4gIC8qKiBjaHVuayBrZXkgLT4gbG9jYWwgdm94ZWwgaW5kZXggLT4gbWF0ZXJpYWwuIER1cmFibGUsIGNvbXBhY3QgZWRpdHMuICovXG4gIGVkaXRzOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCBudW1iZXI+PjtcbiAgLyoqIEdsb2JhbCBsb2NhbC1wbGF5ZXIgY2FycmllZCBiYWc7IGJvdW5kZWQgaW4gc2NoZW1hIDMsIGxlZ2FjeSBpbiAxLzIuICovXG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgLyoqIFByZXNlbnQgb25seSBhZnRlciBzY2hlbWEtMyBnZW5lc2lzL3Jlc3RvcmF0aW9uLiAqL1xuICBsaWZlPzogTGlmZVN0YXRlO1xuICAvKiogTTAwNiBsaXZpbmcgaG9tZXN0ZWFkOyBwcmVzZW50IG9uY2UgZm91bmRlZCAoc2NoZW1hIDMgb25seSkuICovXG4gIGhvbWVzdGVhZD86IEhvbWVzdGVhZFN0YXRlO1xuICBkaXJ0eTogU2V0PHN0cmluZz47XG4gIHN0YXRzOiBXb3JsZFN0YXRzO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqXG4gICAqIE1vbm90b25pYyByZXZpc2lvbiBvZiBhdXRob3JpdGF0aXZlIHN0YXRlICh2b3hlbHMgYW5kIGVudGl0aWVzKS4gRGVyaXZlZFxuICAgKiBjYWNoZXMga2V5ZWQgb24gdGhpcyB2YWx1ZSBhcmUgZGlzY2FyZGVkIGFmdGVyIGFuIGVkaXQ7IG1lc2gvbmF2aWdhdGlvblxuICAgKiByZXZpc2lvbnMgYXJlIHNlcGFyYXRlIGJlY2F1c2UgdGhleSBhcmUgZGVyaXZlZCwgbm90IHdvcmxkIHN0YXRlLlxuICAgKi9cbiAgcmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGNodW5rS2V5ID0gKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpID0+IGAke2N4fSwke2N6fWA7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5YID0gKGN4OiBudW1iZXIpID0+IGN4ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5aID0gKGN6OiBudW1iZXIpID0+IGN6ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgbG9jYWxJbmRleCA9IChseDogbnVtYmVyLCB5SW5kZXg6IG51bWJlciwgbHo6IG51bWJlcikgPT5cbiAgbHggKyBseiAqIENIVU5LX1NJWkUgKyB5SW5kZXggKiBDSFVOS19BUkVBO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ggPSAoeDogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh4ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtaID0gKHo6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeiArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWCA9ICh4OiBudW1iZXIpID0+IHggLSAod29ybGRUb0NodW5rWCh4KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxaID0gKHo6IG51bWJlcikgPT4geiAtICh3b3JsZFRvQ2h1bmtaKHopICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHlUb0luZGV4ID0gKHk6IG51bWJlcikgPT4geSAtIFlfTUlOO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGQoc2VlZCA9IDEzMzcsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgaWYgKCFpc1N1cHBvcnRlZEdlbmVyYXRvcihnZW5lcmF0b3JWZXJzaW9uKSkgdGhyb3cgbmV3IEVycm9yKGB1bnN1cHBvcnRlZCBnZW5lcmF0b3IgdmVyc2lvbiAke2dlbmVyYXRvclZlcnNpb259YCk7XG4gIHJldHVybiB7XG4gICAgc2VlZCxcbiAgICBwYXJhbXM6IHsgLi4uREVGQVVMVF9QQVJBTVMsIGdlbmVyYXRvclZlcnNpb24gfSxcbiAgICBjaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdGllczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNoYW5nZXM6IG5ldyBTZXQoKSxcbiAgICBlbnRpdHlSZW1vdmFsczogbmV3IFNldCgpLFxuICAgIHN0cnVjdHVyZXM6IG5ldyBNYXAoKSxcbiAgICBzaXRlczogW10sXG4gICAgcmVnaW9uczogUkVHSU9OUyxcbiAgICBlZGl0czogbmV3IE1hcCgpLFxuICAgIGludmVudG9yeToge30sXG4gICAgZGlydHk6IG5ldyBTZXQoKSxcbiAgICBzdGF0czoge1xuICAgICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICAgIGVudGl0aWVzOiAwLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gICAgfSxcbiAgICBhdXRob3JlZFBsYWNlZDogZmFsc2UsXG4gICAgcmV2aXNpb246IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBpbml0aWFsUmFkaXVzID0gMCwgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQsIGdlbmVyYXRvclZlcnNpb24pO1xuICBjb25zdCBjZW50cmUgPSBNYXRoLmZsb29yKENIVU5LU19QRVJfU0lERSAvIDIpO1xuICBmb3IgKGxldCBjeiA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN6IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN4IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN4KyspIHtcbiAgICAgIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgfVxuICB9XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuLy8gLS0tLS0tLS0tLSBnZW9ncmFwaHkgLS0tLS0tLS0tLVxuZXhwb3J0IGNvbnN0IFJFR0lPTlM6IFJlZ2lvbkluZm9bXSA9IFtcbiAgeyBpZDogJ2ZvdW5kZXInLCBsYWJlbDogJ0ZvdW5kZXIgdmFsbGV5JywgdHlwZTogJ3BsYWluJywgY3g6IDAsIGN6OiAwLCByeDogMTEwLCByejogODUgfSxcbiAgeyBpZDogJ2Vhc3R3b29kJywgbGFiZWw6ICdFYXN0d29vZCcsIHR5cGU6ICdmb3Jlc3QnLCBjeDogMjIwLCBjejogLTExMCwgcng6IDI2MCwgcno6IDIyMCB9LFxuICB7IGlkOiAnY3Jvd24nLCBsYWJlbDogJ0Nyb3duIGhpZ2hsYW5kcycsIHR5cGU6ICdoaWdobGFuZCcsIGN4OiAtMzYwLCBjejogLTMwMCwgcng6IDM4MCwgcno6IDMwMCB9LFxuICB7IGlkOiAnbGFrZScsIGxhYmVsOiAnTWlycm9yIGxha2UnLCB0eXBlOiAnd2F0ZXInLCBjeDogLTI2MCwgY3o6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9LFxuICB7IGlkOiAnc291dGhkb3ducycsIGxhYmVsOiAnU291dGggZG93bnMnLCB0eXBlOiAnaGlsbHMnLCBjeDogMTIwLCBjejogMzMwLCByeDogMjYwLCByejogMTkwIH0sXG4gIHsgaWQ6ICd3ZXN0cmlzZScsIGxhYmVsOiAnV2VzdCByaXNlJywgdHlwZTogJ2hpbGxzJywgY3g6IC0zNjAsIGN6OiAxMjAsIHJ4OiAyMjAsIHJ6OiAyMTAgfSxcbiAgeyBpZDogJ2NvYXN0JywgbGFiZWw6ICdCcm9rZW4gY29hc3QnLCB0eXBlOiAncmlkZ2UnLCBjeDogMCwgY3o6IDAsIHJ4OiA3ODAsIHJ6OiA2NjAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckNlbnRlclgoejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVGhlIHJpdmVyIHJ1bnMgbm9ydGhcdTIwMTNzb3V0aCBhYm91dCA3MFx1MjAxMzExMCBtIHdlc3Qgb2YgdGhlIGZvdW5kZXIgc2hlbGYsIHNvXG4gIC8vIHRoZSBkZWZhdWx0IG5vcnRoLXdlc3QgdmlldyBoYXMgd2F0ZXIsIGEgbmVhciBiYW5rIGFuZCBhIGZhciBiYW5rLlxuICByZXR1cm4gLTkwICsgNTUgKiBNYXRoLnNpbigoeiArIDEwMCkgLyAyNDApICsgMTggKiBNYXRoLnNpbigoeiAtIDIwKSAvIDgwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5hYnMoeCAtIHJpdmVyQ2VudGVyWCh6KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsYWtlRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5zcXJ0KCgoeCArIDI2MCkgLyAxMjApICoqIDIgKyAoKHogKyAyMzApIC8gOTUpICoqIDIpO1xufVxuXG4vKipcbiAqIEludGVnZXIgdG9wIHNvbGlkIHkgb2YgdGhlIGJhc2UgZ2VuZXJhdGVkIHN1cmZhY2UgKG5vIGVkaXRzL292ZXJoYW5ncykuXG4gKlxuICogVGhpcyBpcyB0aGUgKnNoYXBlKiB0aGUgdm94ZWwgdm9sdW1lIGlzIGZpbGxlZCBmcm9tLCBub3QgdGhlIHN0b3JlZCB3b3JsZC5cbiAqIFRoZSBpbXBvcnRhbnQgY29ycmVjdGlvbiBvdmVyIHRoZSBmaXJzdCBNMDAxIHBhc3MgaXMgdGhhdCB0aGUgbGFuZHNjYXBlIGlzXG4gKiBub3Qgb25lIHNtb290aCByYWRpYWwgYm93bDogaXQgaXMgYSB3YXJwZWQgbXVsdGktc2NhbGUgc3VyZmFjZSB3aXRoIGEgYnJvYWRcbiAqIHJpdmVyIHZhbGxleSwgYSBzbWFsbCBidWlsZGFibGUgc2hlbGYsIGFuZCByaWRnZWQgaGlnaGxhbmRzLiBBIHNoYWxsb3dcbiAqIHNtb290aCBzdXJmYWNlIHF1YW50aXNlZCB0byAxIG0gdm94ZWxzIGlzIHdoYXQgcHJvZHVjZWQgdGhlIGNvbmNlbnRyaWNcbiAqIGNvbnRvdXIgcmluZ3M7IHZhcmllZCByZWxpZWYgYW5kIGEgcml2ZXIgdmFsbGV5IGJyZWFrIHRoZW0gbmF0dXJhbGx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUd28tc2NhbGUgZG9tYWluIHdhcnAuIFRoZSBicm9hZCB3YXJwIG1vdmVzIGNvYXN0bGluZXMgYW5kIGhpbGxzOyB0aGVcbiAgLy8gc21hbGwgd2FycCBrZWVwcyB0aGUgMSBtIHF1YW50aXNhdGlvbiBmcm9tIGZvbGxvd2luZyBjbGVhbiBjb250b3Vycy5cbiAgY29uc3Qgd3ggPSB4XG4gICAgKyAoZmJtMih4IC8gNDIwLCB6IC8gNDIwLCBzZWVkICsgMTAxLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSwgeiAvIDk1LCBzZWVkICsgMTAyLCAyKSAtIDAuNSkgKiAzMDtcbiAgY29uc3Qgd3ogPSB6XG4gICAgKyAoZmJtMih4IC8gNDIwICsgNy4zLCB6IC8gNDIwIC0gMy4xLCBzZWVkICsgMTAzLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSArIDMuNywgeiAvIDk1IC0gOC4xLCBzZWVkICsgMTA0LCAyKSAtIDAuNSkgKiAzMDtcblxuICBjb25zdCByYWRpYWwgPSBNYXRoLnNxcnQoKHd4IC8gNzgwKSAqKiAyICsgKHd6IC8gNjYwKSAqKiAyKTtcbiAgY29uc3QgY29hc3ROb2lzZSA9IChmYm0yKHd4IC8gMzAwLCB3eiAvIDMwMCwgc2VlZCArIDEwNSwgNCkgLSAwLjUpICogMC4zNFxuICAgICsgKGZibTIod3ggLyA5NSwgd3ogLyA5NSwgc2VlZCArIDEwNiwgMikgLSAwLjUpICogMC4xMDtcbiAgY29uc3QgbGFuZG5lc3MgPSAxLjAgLSByYWRpYWwgKyBjb2FzdE5vaXNlO1xuICBjb25zdCBpbmxhbmQgPSBzbW9vdGhzdGVwKC0wLjAzLCAwLjEyLCBsYW5kbmVzcyk7XG5cbiAgY29uc3Qgb2NlYW5GbG9vciA9IC0xMyArIDYgKiBmYm0yKHd4IC8gMTcwLCB3eiAvIDE3MCwgc2VlZCArIDEwNywgMyk7XG5cbiAgLy8gUm9sbGluZyBsYW5kIGF0IHRocmVlIHNjYWxlcy4gVGhlIDQwIG0gYW5kIDE1IG0gY29tcG9uZW50cyBhcmUgcmVhbFxuICAvLyBzdXJmYWNlIGhlaWdodCwgbm90IGEgcmVuZGVyIGRlY29yYXRpb24sIHNvIHRoZSBtYWNybyBzYW1wbGVyIGFncmVlcy5cbiAgY29uc3Qgc3dlbGwgPSA0ICsgMTEgKiBmYm0yKHd4IC8gMzQwLCB3eiAvIDM0MCwgc2VlZCArIDEwOCwgNCk7XG4gIGNvbnN0IGhpbGxzID0gOCAqIGZibTIod3ggLyAxMTUsIHd6IC8gMTE1LCBzZWVkICsgMTA5LCAzKTtcbiAgY29uc3QgYnVtcHMgPSAyLjIgKiBmYm0yKHggLyA0MiwgeiAvIDQyLCBzZWVkICsgMTEwLCAyKVxuICAgICsgMC45ICogZmJtMih4IC8gMTUsIHogLyAxNSwgc2VlZCArIDExMSwgMik7XG5cbiAgLy8gUmlkZ2VkIGhpZ2hsYW5kcy4gVGhlIG1hc3NpZiBtYXNrIGlzIHJlZ2lvbmFsIGFuZCBiaWFzZWQgdG8gdGhlXG4gIC8vIG5vcnRoLXdlc3Q7IHdpdGhvdXQgdGhlIHJlZ2lvbmFsIGdhdGUgdGhlIGZpcnN0IE0wMDEgcGFzcyByYWlzZWQgYSA0OCBtXG4gIC8vIG1vdW50YWluIGRpcmVjdGx5IHVuZGVyIHRoZSBmb3VuZGVyIHNoZWxmLlxuICBjb25zdCBtYXNzaWZOb2lzZSA9IGZibTIod3ggLyA0ODAgKyAxMSwgd3ogLyA0ODAgLSA3LCBzZWVkICsgMTEyLCA0KTtcbiAgY29uc3QgbWFzc2lmTWFzayA9IHNtb290aHN0ZXAoMC42MCwgMC43OCwgbWFzc2lmTm9pc2UpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIzMCwgd3ogLyAyMzAsIHNlZWQgKyAxMTMsIDQpIC0gMSk7XG4gIGNvbnN0IHJpZGdlMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE0LCAzKSAtIDEpO1xuICBjb25zdCBud0JpYXMgPSBNYXRoLmV4cCgtKCgod3ggKyAzNjApIC8gMzgwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAzMjApICoqIDIpKTtcbiAgY29uc3QgbW91bnQgPSBNYXRoLm1pbigxLCBtYXNzaWZNYXNrICogKDAuMzAgKyAwLjcwICogbndCaWFzKSArIDAuMjIgKiBud0JpYXMpO1xuXG4gIGxldCBoID0gc3dlbGwgKyBoaWxscyArIGJ1bXBzXG4gICAgKyBtb3VudCAqICgyMCArIDQwICogcmlkZ2UgKiByaWRnZSArIDEyICogcmlkZ2UyKTtcblxuICAvLyBTcHVycyBhbmQgZ3VsbGllcyBhdCAzMFx1MjAxMzkwIG0uIFdpdGhvdXQgdGhlc2UsIGEgc21vb3RoIGhpbGwgcXVhbnRpc2VkIHRvXG4gIC8vIDEgbSB2b3hlbHMgcmVhZHMgYXMgY29uY2VudHJpYyBjb250b3VyIHJpbmdzOyB3aXRoIHRoZW0sIHRoZSBzYW1lIGhpbGxcbiAgLy8gYnJlYWtzIGludG8gcmlkZ2VzLCBzaWRlIHZhbGxleXMgYW5kIHJvY2sgZmFjZXMuXG4gIGNvbnN0IHNwdXIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4NSwgd3ogLyA4NSwgc2VlZCArIDEyMCwgMykgLSAxKTtcbiAgY29uc3QgZ3VsbHkgPSBNYXRoLnBvdygxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA1MiArIDEzLCB3eiAvIDUyIC0gNSwgc2VlZCArIDEyMSwgMykgLSAxKSwgMik7XG4gIGggKz0gKHNwdXIgLSAwLjU1KSAqIDUuMCAtIGd1bGx5ICogMy4yO1xuXG4gIGggPSBvY2VhbkZsb29yICsgKGggLSBvY2VhbkZsb29yKSAqIGlubGFuZDtcbiAgaCArPSAxLjYgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuXG4gIC8vIEJyb2FkIHJpdmVyIHZhbGxleSwgdGhlbiB0aGUgY2hhbm5lbCBpdHNlbGYuIFRoZSB2YWxsZXkgbWFzayBpcyBnYXRlZCBieVxuICAvLyBsYW5kbmVzczogd2l0aG91dCB0aGUgZ2F0ZSBpdCBwdWxsZWQgdGhlIG9jZWFuIGZsb29yIHVwIHRvIHRoZSB2YWxsZXlcbiAgLy8gZmxvb3Igb3V0c2lkZSB0aGUgaXNsYW5kLCB3aGljaCB0aGUgbWFwIHZpZXcgc2hvd2VkIGFzIHBhbGUgcml2ZXItc2hhcGVkXG4gIC8vIGJhcnMgcnVubmluZyB0byB0aGUgaG9yaXpvbi5cbiAgY29uc3QgcmQgPSByaXZlckRpc3RhbmNlKHd4LCB3eik7XG4gIGNvbnN0IHZhbGxleSA9IHNtb290aHN0ZXAoOTUsIDEwLCByZCkgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuICBjb25zdCB2YWxsZXlGbG9vciA9IDIuNSArIDEuMCAqIGZibTIod3ggLyA2MCwgd3ogLyA2MCwgc2VlZCArIDExNSwgMik7XG4gIGggPSBsZXJwKGgsIHZhbGxleUZsb29yLCB2YWxsZXkgKiAwLjc1KTtcbiAgY29uc3Qgcml2ZXJXID0gNS4wICsgMy4wICogZmJtMih3eCAvIDQ1LCB3eiAvIDQ1LCBzZWVkICsgMTE2LCAyKTtcbiAgLy8gQSB3aWRlLCBzaGFsbG93IGNoYW5uZWwgcHJvZmlsZS4gVGhlIGZpcnN0IHBhc3MgY2FydmVkIGEgMTIgbSBzbG90IHdpdGhcbiAgLy8gbmVhci12ZXJ0aWNhbCBiYW5rcywgd2hpY2ggcmVhZCBhcyBhIGJyaWdodCBzdG9uZSBxdWFycnkgcmF0aGVyIHRoYW4gYVxuICAvLyByaXZlci4gVGhlIG91dGVyIGVkZ2UgaXMgbm93IH4yNSBtIGZyb20gdGhlIGNlbnRyZWxpbmUsIGFuZCB0aGUgYmVkIGlzXG4gIC8vIG9ubHkgMiBtIGJlbG93IHNlYSBsZXZlbC5cbiAgY29uc3QgY2hhbm5lbCA9IHNtb290aHN0ZXAocml2ZXJXICsgMTgsIHJpdmVyVyAqIDAuNCwgcmQpO1xuICBpZiAobGFuZG5lc3MgPiAwLjApIGggPSBsZXJwKGgsIC0yLjAsIGNoYW5uZWwgKiAwLjk1KTtcblxuICAvLyBMYWtlIGJhc2luIGF0IHRoZSBmb290IG9mIHRoZSBub3J0aC13ZXN0IGhpZ2hsYW5kcy5cbiAgY29uc3QgbGFrZUQgPSBsYWtlRGlzdGFuY2Uod3gsIHd6KVxuICAgICogKDEgKyAwLjE4ICogKGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNywgMikgLSAwLjUpICogMik7XG4gIGlmIChsYWtlRCA8IDEuMTUpIHtcbiAgICBjb25zdCBsYWtlTWFzayA9IHNtb290aHN0ZXAoMS4xNSwgMC41NSwgbGFrZUQpO1xuICAgIGggPSBsZXJwKGgsIC02LjUsIGxha2VNYXNrICogMC45NSk7XG4gIH1cblxuICAvLyBGb3VuZGVyIHNoZWxmOiBhIHNtYWxsLCBpcnJlZ3VsYXIgYnVpbGRhYmxlIHRlcnJhY2Ugb24gdGhlIGVhc3QgYmFuay5cbiAgLy8gRGVsaWJlcmF0ZWx5IG5vdCBhIDI2MCBtIHJhZGlhbCBmbGF0dGVuOyB0aGUgcHJldmlvdXMgcGFzcyBzaG93ZWQgdGhhdCBhXG4gIC8vIGxhcmdlIGZsYXR0ZW4tdG8tY29uc3RhbnQgYmVjb21lcyBhIHZpc2libGUgYm93bCBvZiBjb250b3VyIHJpbmdzLlxuICBjb25zdCBzaGVsZkQgPSBNYXRoLnNxcnQoKCh4ICsgOCkgLyA2MikgKiogMiArICgoeiAtIDQpIC8gNDgpICoqIDIpXG4gICAgKyAoZmJtMih4IC8gNDUsIHogLyA0NSwgc2VlZCArIDExOCwgMikgLSAwLjUpICogMC41NTtcbiAgY29uc3Qgc2hlbGYgPSBzbW9vdGhzdGVwKDEuMDUsIDAuNTUsIHNoZWxmRCk7XG4gIGlmIChzaGVsZiA+IDApIHtcbiAgICBjb25zdCB0YXJnZXQgPSAxMy4wICsgMS4yICogZmJtMih4IC8gMzYsIHogLyAzNiwgc2VlZCArIDExOSwgMikgKyB4ICogMC4wMTtcbiAgICBoID0gbGVycChoLCB0YXJnZXQsIHNoZWxmICogMC43OCk7XG4gIH1cblxuICByZXR1cm4gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIDkyKSk7XG59XG5cbmZ1bmN0aW9uIHNsb3BlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4pOiBNYXRJZCB7XG4gIC8vIFJpdmVyIGJlZCBpcyBncmF2ZWw7IHRoZSBiZWFjaCBpcyBhIG5hcnJvdyBzYW5kIGJhbmQsIG5vdCB0aGUgd2hvbGVcbiAgLy8gdmFsbGV5IGZsb29yLiBUaGUgZmlyc3QgcGFzcyBtYXJrZWQgZXZlcnkgY2VsbCB3aXRoaW4gNCBtIG9mIHNlYSBsZXZlbFxuICAvLyBhcyBzYW5kLCB3aGljaCBwcm9kdWNlZCBhIGNvbnNwaWN1b3VzIHBhbGUgc3RyaXAgYWxvbmcgdGhlIHJpdmVyLlxuICBpZiAocml2ZXJEaXN0YW5jZSh4LCB6KSA8IDEyICYmIGggPCBTRUFfTEVWRUwgKyAxKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgaWYgKGggPD0gU0VBX0xFVkVMICsgMC41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChuZWFyV2F0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgIG5lYXJXYXRlciA9XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMykgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDMpIDwgU0VBX0xFVkVMICsgMTtcbiAgfVxuICBpZiAobmVhcldhdGVyICYmIGggPD0gU0VBX0xFVkVMICsgMS41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChzbG9wZSA+PSAzKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDU4ICYmIGZibTIoeCAvIDE4LCB6IC8gMTgsIHNlZWQgKyAxMjAsIDIpID4gMC40NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0OCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQwICYmIHNsb3BlID49IDIgJiYgZmJtMih4IC8gMTIsIHogLyAxMiwgc2VlZCArIDEyMSwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNUT05FO1xuICByZXR1cm4gTUFULkdSQVNTO1xuXG59XG5cbi8qKiBQdWJsaWMgYmFzZS1tYXRlcmlhbCBzZWxlY3RvciBmb3IgbWFjcm8gTE9EIGFuZCB0ZXN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWwoXG4gIHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyOiBib29sZWFuLFxuKTogTWF0SWQge1xuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZnVuY3Rpb24gc3Vic29pbEZvcih0b3A6IE1hdElkKTogTWF0SWQge1xuICBpZiAodG9wID09PSBNQVQuR1JBU1MgfHwgdG9wID09PSBNQVQuTU9TUykgcmV0dXJuIE1BVC5TT0lMO1xuICBpZiAodG9wID09PSBNQVQuU05PVykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVZFTCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIHJldHVybiBNQVQuU1RPTkU7XG59XG5cbmZ1bmN0aW9uIG9yZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBjbHVzdGVyID0gZmJtMih4IC8gNTUsIHogLyA1NSwgc2VlZCArIDEzMCwgMik7XG4gIGlmIChjbHVzdGVyIDwgMC41NykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBuID0gdmFsdWVOb2lzZTMoeCAqIDAuMDksIHkgKiAwLjEzLCB6ICogMC4wOSwgc2VlZCArIDEzMSk7XG4gIGNvbnN0IG4yID0gdmFsdWVOb2lzZTMoeCAqIDAuMjIgKyA1LCB5ICogMC4zMSwgeiAqIDAuMjIgLSAzLCBzZWVkICsgMTMyKTtcbiAgcmV0dXJuIG4gPiAwLjcwICYmIG4yID4gMC41MDtcbn1cblxuZnVuY3Rpb24gY2F2ZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gZmJtMyh4ICogMC4wNzUsIHkgKiAwLjExLCB6ICogMC4wNzUsIHNlZWQgKyAxNDAsIDIpID4gMC43Mjtcbn1cblxuZnVuY3Rpb24gb3ZlcmhhbmdBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHZhbHVlTm9pc2UzKHggKiAwLjE4LCB5ICogMC4yMiwgeiAqIDAuMTgsIHNlZWQgKyAxNDEpID4gMC42Mjtcbn1cblxuLy8gLS0tLS0tLS0tLSB2ZXJzaW9uZWQgZ2VuZXJhdG9yIGRpc3BhdGNoIC0tLS0tLS0tLS1cbmNvbnN0IHYyQ2FjaGUgPSBuZXcgTWFwPG51bWJlciwgVGVycmFpblYyPigpO1xuY29uc3QgaHlkcm9DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBIeWRyb2xvZ3k+KCk7XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9neSBuZXR3b3JrIGZvciBhIHNlZWQgYW5kIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGh5ZHJvbG9neUZvcihzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlcik6IEh5ZHJvbG9neSB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikgcmV0dXJuIHRlcnJhaW5WMihzZWVkKS5oeWRyb2xvZ3k7XG4gIGNvbnN0IGtleSA9IGAke3NlZWR9OiR7dmVyc2lvbn1gO1xuICBsZXQgaHlkcm8gPSBoeWRyb0NhY2hlLmdldChrZXkpO1xuICBpZiAoIWh5ZHJvKSB7XG4gICAgaHlkcm8gPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbiwgdjFIZWlnaHQ6ICh4LCB6KSA9PiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeikgfSk7XG4gICAgaHlkcm9DYWNoZS5zZXQoa2V5LCBoeWRybyk7XG4gIH1cbiAgcmV0dXJuIGh5ZHJvO1xufVxuXG4vKiogQGludGVybmFsIFRoZSB2MiBnZW5lcmF0b3IgZm9yIGEgc2VlZCAoY2FjaGVkOyBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZXJyYWluVjIoc2VlZDogbnVtYmVyKTogVGVycmFpblYyIHtcbiAgbGV0IGdlbiA9IHYyQ2FjaGUuZ2V0KHNlZWQpO1xuICBpZiAoIWdlbikge1xuICAgIGNvbnN0IGh5ZHJvbG9neSA9IG5ldyBIeWRyb2xvZ3koeyBzZWVkLCB2ZXJzaW9uOiBHRU5FUkFUT1JfVjIsIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGdlbiA9IG5ldyBUZXJyYWluVjIoc2VlZCwgc3VyZmFjZUhlaWdodEF0LCBoeWRyb2xvZ3kpO1xuICAgIHYyQ2FjaGUuc2V0KHNlZWQsIGdlbik7XG4gIH1cbiAgcmV0dXJuIGdlbjtcbn1cblxuLyoqIEJhc2UgZ2VuZXJhdGVkIGhlaWdodCAodG9wIHNvbGlkICsgMSkgZm9yIGFueSBzdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMiA/IHRlcnJhaW5WMihzZWVkKS5oZWlnaHQoeCwgeikgOiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCB3YXRlciBzdXJmYWNlOiB3YXRlciBmaWxscyBjZWxscyBbaGVpZ2h0LCBsZXZlbCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVdhdGVyTGV2ZWxBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuY29sdW1uKHgsIHopLmxldmVsO1xuICBjb25zdCBoID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCA6IGg7XG59XG5cbmZ1bmN0aW9uIHZlcnNpb25lZFNsb3BlKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuLyoqIEJhc2UgdG9wIG1hdGVyaWFsIGZvciBhbnkgZ2VuZXJhdG9yIHZlcnNpb24gKG1hY3JvIExPRCwgZW50aXR5IHBsYWNlbWVudCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsRm9yKFxuICBzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgZ2VuID0gdGVycmFpblYyKHNlZWQpO1xuICAgIHJldHVybiBnZW4udG9wTWF0ZXJpYWwoeCwgeiwgZ2VuLmNvbHVtbih4LCB6KSwgc2xvcGUsXG4gICAgICAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGhoLCBzcywgbmVhcldhdGVyKSk7XG4gIH1cbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VyZmFjZVNhbXBsZSB7XG4gIHk6IG51bWJlcjtcbiAgdG9wOiBNYXRJZDtcbiAgc2xvcGU6IG51bWJlcjtcbn1cblxuLyoqIEJhc2Ugc3VyZmFjZSBzYW1wbGUgZm9yIG1hY3JvIExPRC4gRG9lcyBub3QgaW5jbHVkZSB2b3hlbCBlZGl0cy9vdmVyaGFuZ3MuICovXG5leHBvcnQgZnVuY3Rpb24gc2FtcGxlU3VyZmFjZShzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogU3VyZmFjZVNhbXBsZSB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIGNvbnN0IHNsb3BlID0gc2xvcGVBdChzZWVkLCB4LCB6LCB5KTtcbiAgcmV0dXJuIHsgeSwgdG9wOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIHksIHNsb3BlKSwgc2xvcGUgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBjaHVuayBnZW5lcmF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIHJldHVybiBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBiYXNlID0gZ2VuZXJhdGVCYXNlQ2h1bmsod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIGN4LCBjeik7XG4gIHJldHVybiBpbnN0YWxsQmFzZUNodW5rKHdvcmxkLCBiYXNlLCBwZXJmb3JtYW5jZS5ub3coKSAtIHQwKTtcbn1cblxuLyoqXG4gKiBCYXNlIGdlbmVyYXRlZCBjb250ZW50cyBvZiBhIGNodW5rIGJlZm9yZSBkdXJhYmxlIGVkaXRzLiBBIHB1cmUgZnVuY3Rpb24gb2ZcbiAqIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbiwgY3gsIGN6KTogc2FmZSB0byBjb21wdXRlIGluIGEgV2ViIFdvcmtlciwgYW5kIHRoZVxuICogYnl0ZXMgYXJlIGlkZW50aWNhbCB3aGVyZXZlciBpdCBydW5zLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHNlZWQ6IG51bWJlcjtcbiAgdmVyc2lvbjogbnVtYmVyO1xuICBkYXRhOiBVaW50OEFycmF5O1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVCYXNlQ2h1bmsoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ2h1bmsge1xuICBjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfVk9MVU1FKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCB0b3BNYXRlcmlhbHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGNvbnN0IHYyID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkgOiBudWxsO1xuXG4gIC8vIFBhZGRlZCBoZWlnaHQgY2FjaGU6IGEgdGhyZWUtY2VsbCBib3JkZXIgY292ZXJzIHNsb3BlLCBiZWFjaCBhbmQgbGVkZ2VzLlxuICBjb25zdCBQID0gMztcbiAgY29uc3QgUFcgPSBDSFVOS19TSVpFICsgUCAqIDI7XG4gIGNvbnN0IGJhc2VIID0gbmV3IEludDE2QXJyYXkoUFcgKiBQVyk7XG4gIGNvbnN0IHYyQ29sczogVjJDb2x1bW5bXSB8IG51bGwgPSB2MiA/IG5ldyBBcnJheShDSFVOS19BUkVBKSA6IG51bGw7XG4gIGZvciAobGV0IHB6ID0gMDsgcHogPCBQVzsgcHorKykge1xuICAgIGZvciAobGV0IHB4ID0gMDsgcHggPCBQVzsgcHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIHB4IC0gUCwgd3ogPSBveiArIHB6IC0gUDtcbiAgICAgIGlmICh2Mikge1xuICAgICAgICBjb25zdCBjb2wgPSB2Mi5jb2x1bW4od3gsIHd6KTtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IGNvbC5oO1xuICAgICAgICBjb25zdCBseCA9IHB4IC0gUCwgbHogPSBweiAtIFA7XG4gICAgICAgIGlmIChseCA+PSAwICYmIGx6ID49IDAgJiYgbHggPCBDSFVOS19TSVpFICYmIGx6IDwgQ0hVTktfU0laRSkgdjJDb2xzIVtseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjb2w7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHd4LCB3eik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgbGV0IG5vbkFpciA9IDA7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5lYXJXYXRlciA9XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCAtIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgKyAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMTtcbiAgICAgIGNvbnN0IHYyQ29sID0gdjJDb2xzID8gdjJDb2xzW2x6ICogQ0hVTktfU0laRSArIGx4XSA6IG51bGw7XG4gICAgICBjb25zdCB0b3AgPSB2MiAmJiB2MkNvbFxuICAgICAgICA/IHYyLnRvcE1hdGVyaWFsKHd4LCB3eiwgdjJDb2wsIHNsb3BlLCAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaGgsIHNzLCBuZWFyV2F0ZXIpKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICAgIGNvbnN0IHN1YiA9IHN1YnNvaWxGb3IodG9wKTtcbiAgICAgIGNvbnN0IG9yZVBvdGVudGlhbCA9IGZibTIod3ggLyA1NSwgd3ogLyA1NSwgc2VlZCArIDEzMCwgMikgPiAwLjU3O1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG5cbiAgICAgIGNvbnN0IHN0YXJ0ID0gWV9NSU47XG4gICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihZX01BWCAtIDEsIGggLSAxKTtcbiAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8PSBlbmQ7IHkrKykge1xuICAgICAgICBjb25zdCBkZXB0aCA9IGggLSAxIC0geTtcbiAgICAgICAgbGV0IG06IE1hdElkO1xuICAgICAgICBpZiAoeSA9PT0gWV9NSU4pIG0gPSBNQVQuQkVEUk9DSztcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPT09IDApIG0gPSB0b3A7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoIDw9IDIpIG0gPSBzdWI7XG4gICAgICAgIGVsc2UgbSA9IE1BVC5TVE9ORTtcblxuICAgICAgICBpZiAobSA9PT0gTUFULlNUT05FICYmIGRlcHRoID4gNCAmJiBvcmVQb3RlbnRpYWwgJiYgb3JlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuT1JFO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3BhcnNlIDNEIG92ZXJoYW5ncy91bmRlcmN1dHMgYXQgc3RlZXAgZmFjZXMuIFRoaXMgaXMgYSByZWFsXG4gICAgICAgIC8vIG9jY3VwYW5jeSBjaGFuZ2UsIG5vdCBhIGRlY29yYXRpb24gb24gdG9wIG9mIGEgaGVpZ2h0ZmllbGQuXG4gICAgICAgIGlmIChkZXB0aCA8PSAyICYmIHNsb3BlID49IDIgJiYgb3ZlcmhhbmdBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVlcCBjYXZlcywga2VwdCBhd2F5IGZyb20gdGhlIHN1cmZhY2Ugc28gdGhleSBkbyBub3QgY3JlYXRlIGhvbGVzLlxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUiAmJiBkZXB0aCA+IDcgJiYgZGVwdGggPCAyNCAmJiBjYXZlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildID0gbTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBXYXRlciB2b2x1bWU6IGV2ZXJ5dGhpbmcgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UgdXAgdG8gdGhlIGNvbHVtbidzXG4gICAgICAvLyB3YXRlciBsZXZlbCAoc2VhIGxldmVsIGluIHYxOyB0aGUgaHlkcm9sb2dpY2FsIGxldmVsIGluIHYyKS5cbiAgICAgIGNvbnN0IHdhdGVyTGV2ZWwgPSB2MkNvbCA/IE1hdGgubWluKFlfTUFYLCB2MkNvbC5sZXZlbCkgOiBTRUFfTEVWRUw7XG4gICAgICBpZiAoaCA8IHdhdGVyTGV2ZWwpIHtcbiAgICAgICAgZm9yIChsZXQgeSA9IE1hdGgubWF4KFlfTUlOLCBoKTsgeSA8IHdhdGVyTGV2ZWw7IHkrKykge1xuICAgICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseik7XG4gICAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgICAgZGF0YVtpZHhdID0gTUFULldBVEVSO1xuICAgICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvcFNvbGlkID0gTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLm1heChZX01JTiwgaCAtIDEpKTtcbiAgICAgIGhlaWdodHNbY29sXSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2NvbF0gPSB0b3A7XG4gICAgfVxuICB9XG5cbiAgLy8gUHJvdHJ1ZGluZyBsZWRnZXM6IG9uZSBvciB0d28gc3RvbmUgYmxvY2tzIGV4dGVuZCBmcm9tIGEgaGlnaCBjb2x1bW4gb3ZlclxuICAvLyBhIGxvd2VyIG5laWdoYm91ci4gVGhleSBjcmVhdGUgcmVhZGFibGUgb3ZlcmhhbmdzIHdpdGhvdXQgYSBmdWxsIGNhdmUgcGFzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGlmIChzbG9wZSA8IDIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZGlyczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBkaXJzKSB7XG4gICAgICAgIGNvbnN0IG54ID0gbHggKyBkeCwgbnogPSBseiArIGR6O1xuICAgICAgICBpZiAobnggPCAwIHx8IG56IDwgMCB8fCBueCA+PSBDSFVOS19TSVpFIHx8IG56ID49IENIVU5LX1NJWkUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBuaCA9IGJhc2VIWyhueiArIFApICogUFcgKyAobnggKyBQKV07XG4gICAgICAgIGlmIChoIC0gbmggPCAyKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGhhc2gzaShseCwgbHosIGR4ICogMyArIGR6ICogNywgc2VlZCArIDE1MCkgPCAwLjU1KSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgeSA9IGggLSAyO1xuICAgICAgICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gaCkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobngsIHlUb0luZGV4KHkpLCBueik7XG4gICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuU1RPTkU7XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZWNvbXB1dGUgdGhlIGNvbHVtbiBjYWNoZSBhZnRlciBsZWRnZXMvY2F2ZXMuIFRoZSBleHBvc2VkIHRvcCBtYXRlcmlhbFxuICAvLyBtdXN0IGNvbWUgZnJvbSB0aGUgYWN0dWFsIHRvcCBzb2xpZCB2b3hlbCwgbm90IHRoZSBwcmUtY2FydmUgZ3Vlc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgbGV0IHRvcE1hdDogbnVtYmVyID0gdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICBjb25zdCBtID0gZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgfVxuICAgICAgaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0b3BNYXQ7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgY3gsIGN6LCBzZWVkLCB2ZXJzaW9uLCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9O1xufVxuXG4vKipcbiAqIEluc3RhbGwgYmFzZSBjb250ZW50cyBhcyBhIHJlc2lkZW50IGNodW5rOiBhcHBseSBkdXJhYmxlIGVkaXRzLCB1cGRhdGVcbiAqIHN0YXRzLCBhbmQgcnVuIGRldGVybWluaXN0aWMgZW50aXR5IGdlbmVyYXRpb24uIE1haW4tdGhyZWFkIG9ubHk7IHRoaXMgaXNcbiAqIHRoZSBzaW5nbGUgd3JpdGVyIG9mIFdvcmxkLiBSZXR1cm5zIHRoZSBhbHJlYWR5LXJlc2lkZW50IGNodW5rIGlmIG9uZSBleGlzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsQmFzZUNodW5rKHdvcmxkOiBXb3JsZCwgYmFzZTogQmFzZUNodW5rLCBnZW5lcmF0aW9uTXMgPSAwKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoYmFzZS5zZWVkICE9PSB3b3JsZC5zZWVkIHx8IGJhc2UudmVyc2lvbiAhPT0gd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2Jhc2UgY2h1bmsgYmVsb25ncyB0byBhIGRpZmZlcmVudCB3b3JsZCBjb25maWd1cmF0aW9uJyk7XG4gIH1cbiAgY29uc3QgeyBjeCwgY3osIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyIH0gPSBiYXNlO1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICBjb25zdCBjaHVuazogVm94ZWxDaHVuayA9IHtcbiAgICBjeCwgY3osIGtleSwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIsXG4gICAgZGlydHk6IHRydWUsXG4gICAgZ2VuZXJhdGVkQXQ6IHBlcmZvcm1hbmNlLm5vdygpLFxuICB9O1xuXG4gIC8vIEFwcGx5IGR1cmFibGUgZWRpdHMgYWZ0ZXIgYmFzZSBnZW5lcmF0aW9uLlxuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICBpZiAoZWRpdHMpIHtcbiAgICBmb3IgKGNvbnN0IFtpZHgsIG1dIG9mIGVkaXRzKSB7XG4gICAgICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICAgIH1cbiAgICAvLyBSZWNvbXB1dGUgdGhlIGNhY2hlIGZvciBlZGl0ZWQgY2h1bmtzLlxuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIGx4LCBseik7XG4gICAgfVxuICB9XG4gIC8vIE5vbi1haXIgY291bnRzIGFyZSBkZXJpdmVkIHJlbmRlcmVyIHN0YXRpc3RpY3MsIG5vdCBkdXJhYmxlIHdvcmxkIHN0YXRlLlxuICAvLyBFZGl0ZWQgYmFzZSBhaXIgbWF5IGJlY29tZSBzb2xpZCAoYW5kIHZpY2UgdmVyc2EpIGR1cmluZyByZXN0b3JhdGlvbi5cbiAgbGV0IGVkaXRlZE5vbkFpciA9IDA7XG4gIGZvciAoY29uc3QgbWF0ZXJpYWwgb2YgY2h1bmsuZGF0YSkgaWYgKG1hdGVyaWFsICE9PSBNQVQuQUlSKSBlZGl0ZWROb25BaXIrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IGVkaXRlZE5vbkFpciAtIG5vbkFpcjtcblxuICB3b3JsZC5jaHVua3Muc2V0KGtleSwgY2h1bmspO1xuICB3b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IG5vbkFpcjtcbiAgd29ybGQuc3RhdHMuZ2VuZXJhdGlvbk1zICs9IGdlbmVyYXRpb25NcztcbiAgd29ybGQuZGlydHkuYWRkKGtleSk7XG5cbiAgZ2VuZXJhdGVFbnRpdGllcyh3b3JsZCwgY2h1bmspO1xuICByZXR1cm4gY2h1bms7XG59XG5cbi8qKiBBIGJhc2UtdGVycmFpbiBjYWNoZSBzaGFyZWQgYnkgZWRpdGVkIGFuZCB1bmVkaXRlZCByZWdlbmVyYXRpb24uIE5hdHVyYWxcbiAqIHNjZW5lcnkgbmV2ZXIgZGVwZW5kcyBvbiBsYXRlciB2b3hlbCBlZGl0czsgdGhpcyBhbHNvIGxldHMgYSBzbmFwc2hvdCByZXN0b3JlXG4gKiBhIGhhcnZlc3RlZCBjaHVuayB3aXRob3V0IG1hdGVyaWFsaXppbmcgdW5yZWxhdGVkIG5laWdoYm91cmluZyBjaHVua3MuICovXG5jb25zdCBiYXNlQ29sdW1uQ2FjaGUgPSBuZXcgV2Vha01hcDxXb3JsZCwgTWFwPHN0cmluZywgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXkgfT4+KCk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQmFzZUNvbHVtbnMgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7IH1cblxuLyoqIEJhc2UgKHByZS1jYXJ2ZSwgcHJlLWVkaXQpIGNvbHVtbiBoZWlnaHRzL21hdGVyaWFscyB1c2VkIGZvciBlbnRpdHkgcGxhY2VtZW50LiBQdXJlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVCYXNlQ29sdW1ucyhzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IEJhc2VDb2x1bW5zIHtcbiAgY29uc3QgY29sdW1ucyA9IHsgaGVpZ2h0czogbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSksIHRvcE1hdGVyaWFsczogbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSkgfTtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseCwgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeik7XG4gICAgICBjb25zdCBzbG9wZSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gdmVyc2lvbmVkU2xvcGUoc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCkgOiBzbG9wZUF0KHNlZWQsIHgsIHosIGgpO1xuICAgICAgY29uc3QgaW5kZXggPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbHVtbnMuaGVpZ2h0c1tpbmRleF0gPSBjbGFtcChoIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgY29sdW1ucy50b3BNYXRlcmlhbHNbaW5kZXhdID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyBiYXNlVG9wTWF0ZXJpYWxGb3Ioc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCwgc2xvcGUpXG4gICAgICAgIDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG4vKiogUHJvdmlkZSBwcmVjb21wdXRlZCBiYXNlIGNvbHVtbnMgKGZvciBleGFtcGxlIGZyb20gYSB3b3JrZXIpIGJlZm9yZSBpbnN0YWxsaW5nIGEgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gc2VlZEJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcsIGNvbHVtbnM6IEJhc2VDb2x1bW5zKTogdm9pZCB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgaWYgKCFjYWNoZS5oYXMoa2V5KSkgY2FjaGUuc2V0KGtleSwgY29sdW1ucyk7XG59XG5cbmZ1bmN0aW9uIGJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiBCYXNlQ29sdW1ucyB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgY29uc3QgY2FjaGVkID0gY2FjaGUuZ2V0KGNodW5rLmtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG4gIGNvbnN0IGNvbHVtbnMgPSBjb21wdXRlQmFzZUNvbHVtbnMod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIGNodW5rLmN4LCBjaHVuay5jeik7XG4gIGNhY2hlLnNldChjaHVuay5rZXksIGNvbHVtbnMpO1xuICByZXR1cm4gY29sdW1ucztcbn1cblxuLy8gLS0tLS0tLS0tLSBkZXJpdmVkIGNoYW5nZSB0cmFja2luZyAobm90IGF1dGhvcml0YXRpdmUgc3RhdGUpIC0tLS0tLS0tLS1cbi8vIFJlbmRlcmVycyBuZWVkIHRvIGtub3cgd2hlbiB0aGUgZWRpdCBvdmVybGF5IGNoYW5nZWQgd2l0aG91dCB3YWxraW5nIGV2ZXJ5XG4vLyBlZGl0IGVhY2ggZnJhbWUuIFRoZSBjb3VudGVyIGxpdmVzIG91dHNpZGUgV29ybGQgc28gaXQgbmV2ZXIgZW50ZXJzIGFcbi8vIHNuYXBzaG90IG9yIGNhbm9uaWNhbCBoYXNoLlxuY29uc3QgZWRpdFZlcnNpb25zID0gbmV3IFdlYWtNYXA8V29ybGQsIG51bWJlcj4oKTtcblxuLyoqIE1vbm90b25pYyBjb3VudCBvZiBlZGl0LW92ZXJsYXkgY2hhbmdlcyBmb3IgdGhpcyBXb3JsZCBvYmplY3QuICovXG5leHBvcnQgZnVuY3Rpb24gZWRpdFZlcnNpb24od29ybGQ6IFdvcmxkKTogbnVtYmVyIHtcbiAgcmV0dXJuIGVkaXRWZXJzaW9ucy5nZXQod29ybGQpID8/IDA7XG59XG5cbi8qKiBDYWxsIGFmdGVyIHJlcGxhY2luZyBvciBidWxrLWNoYW5naW5nIGB3b3JsZC5lZGl0c2Agb3V0c2lkZSBzZXRWb3hlbC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBlZGl0VmVyc2lvbnMuc2V0KHdvcmxkLCBlZGl0VmVyc2lvbih3b3JsZCkgKyAxKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBub24tZ2VuZXJhdGluZyBxdWVyaWVzIC0tLS0tLS0tLS1cbi8vIE1vdmluZyBwcmVzZW50YXRpb24gKGNoYXJhY3RlcnMsIGFuaW1hbHMsIGNhbWVyYSkgbXVzdCBuZXZlciB0cmlnZ2VyIGNodW5rXG4vLyBnZW5lcmF0aW9uIGFzIGEgc2lkZSBlZmZlY3Qgb2YgYXNraW5nIGFib3V0IHRlcnJhaW4uIFRoZXNlIHJldHVybiBudWxsIHdoZW5cbi8vIHRoZSBjb2x1bW4ncyBjaHVuayBpcyBub3QgcmVzaWRlbnQuXG5cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudENodW5rQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KHdvcmxkVG9DaHVua1goeCksIHdvcmxkVG9DaHVua1ooeikpKSA/PyBudWxsO1xufVxuXG4vKiogTGlrZSBzdXJmYWNlQXQsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB8IG51bGwge1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG4vKiogTGlrZSBnZXRWb3hlbCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFZveGVsQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQgfCBudWxsIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV2aWN0Q2h1bmsod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5jaHVua3MuZGVsZXRlKGtleSk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0V2aWN0ZWQrKztcbiAgLy8gQ2h1bmsgYnl0ZXMgYW5kIGNvbHVtbiBjYWNoZXMgYXJlIHJlZ2VuZXJhdGVkIG9uIGRlbWFuZC4gRW50aXRpZXMgcmVtYWluXG4gIC8vIGF1dGhvcml0YXRpdmU6IGV2aWN0aW9uIG11c3Qgbm90IGZvcmdldCB0aGVpciBwZXJzaXN0ZW50IHN0YXRlLlxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBxdWVyaWVzIC8gZWRpdHMgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGdldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgbTogTWF0SWQpOiBib29sZWFuIHtcbiAgaWYgKHkgPCBZX01JTiB8fCB5ID49IFlfTUFYKSByZXR1cm4gZmFsc2U7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpO1xuICBjb25zdCBwcmV2aW91c0VkaXQgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk/LmdldChpZHgpO1xuICAvLyBBIGNodW5rIGV2aWN0ZWQgYWZ0ZXIgYW4gZWFybGllciBlZGl0IGNhbiByZWdlbmVyYXRlIHdpdGggdGhhdCBkdXJhYmxlXG4gIC8vIG1hdGVyaWFsIGFscmVhZHkgYXBwbGllZC4gRHJvcHBpbmcgdGhlIGVkaXQgaGVyZSB3b3VsZCBtYWtlIGl0IGRpc2FwcGVhclxuICAvLyBvbiB0aGUgbmV4dCBldmljdGlvbi9yZXN0b3JhdGlvbiwgZXZlbiB0aG91Z2ggdGhlIGN1cnJlbnQgd3JpdGUgbm8tb3BzLlxuICBpZiAocHJldmlvdXNFZGl0ID09PSBtKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBmYWxzZTtcbiAgbGV0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rLmtleSk7XG4gIGlmICghZWRpdHMpIHsgZWRpdHMgPSBuZXcgTWFwKCk7IHdvcmxkLmVkaXRzLnNldChjaHVuay5rZXksIGVkaXRzKTsgfVxuICAvLyBBbiBpZGVtcG90ZW50IHdyaXRlIG11c3Qgc3RpbGwgcmVzdG9yZSBhIGR1cmFibGUgZGVsdGEgZGlzY2FyZGVkIGJ5IGFuXG4gIC8vIG9sZGVyIHNuYXBzaG90IG9yIGRlbHRhIGRlY29kZXIuIEl0IGlzIG5vdCBhIG5ldyBhdXRob3JpdGF0aXZlIHJldmlzaW9uLlxuICBpZiAoY2h1bmsuZGF0YVtpZHhdID09PSBtKSB7XG4gICAgaWYgKCFlZGl0cy5oYXMoaWR4KSkgZWRpdHMuc2V0KGlkeCwgbSk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gIGVkaXRzLnNldChpZHgsIG0pO1xuICBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkKTtcbiAgY2h1bmsuZGlydHkgPSB0cnVlO1xuICB3b3JsZC5kaXJ0eS5hZGQoY2h1bmsua2V5KTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIHdvcmxkVG9Mb2NhbFgoeCksIHdvcmxkVG9Mb2NhbFooeikpO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bms6IFZveGVsQ2h1bmssIGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgIGlmIChpc1NvbGlkKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0pKSB7IHRvcFNvbGlkID0geTsgYnJlYWs7IH1cbiAgfVxuICBjaHVuay5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICBjb25zdCB0bSA9IGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gIGlmICh0b3BTb2xpZCA+PSBZX01JTikge1xuICAgIGNvbnN0IG0gPSBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHRvcFNvbGlkKSwgbHopXTtcbiAgICBpZiAobSAhPT0gTUFULldBVEVSKSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gbTtcbiAgfSBlbHNlIHtcbiAgICBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG07XG4gIH1cbn1cblxuLyoqXG4gKiBUaGUgeSBjb29yZGluYXRlIG9mIHRoZSBleHBvc2VkIHRvcCBmYWNlIG9mIHRoZSBzb2xpZCBjb2x1bW4gYXQgeC96LlxuICogQSBzb2xpZCB2b3hlbCBhdCB5IG9jY3VwaWVzIFt5LCB5KzEpLCBzbyB0aGUgd2Fsa2FibGUgc3VyZmFjZSBpcyB0b3BTb2xpZCsxLlxuICogVGhpcyBpcyBhIGRlcml2ZWQgcXVlcnk7IHRoZSBhdXRob3JpdGF0aXZlIHN0YXRlIHJlbWFpbnMgdGhlIHZveGVsIHZvbHVtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIFlfTUlOO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIFlfTUlOO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay50b3BNYXRlcmlhbHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhlaWdodEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uIDwgR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgaCA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gICAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgLSBoIDogMDtcbiAgfVxuICByZXR1cm4gd2F0ZXJTdXJmYWNlQXQod29ybGQsIHgsIHopIC0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuLyoqXG4gKiBUb3Agb2YgdGhlIHdhdGVyIGNvbHVtbiBzdGFuZGluZyBvbiB0aGUgc29saWQgc3VyZmFjZSAoZXF1YWwgdG8gdGhlIHN1cmZhY2VcbiAqIHdoZW4gZHJ5KS4gUmVhZHMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWxzLCBzbyBlZGl0cyBhbmQgZHVnIHBpdHMgYXJlIGV4YWN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgd2hpbGUgKHkgPCBZX01BWCAmJiBnZXRWb3hlbCh3b3JsZCwgeCwgeSwgeikgPT09IE1BVC5XQVRFUikgeSsrO1xuICByZXR1cm4geTtcbn1cblxuLy8gLS0tLS0tLS0tLSBlbnRpdGllcyAtLS0tLS0tLS0tXG5mdW5jdGlvbiBhZGRFbnRpdHkod29ybGQ6IFdvcmxkLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLmhhcyhlLmlkKSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgcmV0dXJuO1xuICB3b3JsZC5lbnRpdGllcy5zZXQoZS5pZCwgZSk7XG4gIGxldCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBsaXN0KTsgfVxuICBsaXN0LnB1c2goZS5pZCk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgLy8gR2VuZXJhdGlvbiBpcyBkZXRlcm1pbmlzdGljIGFuZCBhZHZhbmNlcyBubyBwbGF5ZXItY29tbWFuZCBwcmVjb25kaXRpb24uXG4gIC8vIEF1dGhvcmVkIHNjYWZmb2xkaW5nIG1heSB0cmFuc2llbnRseSBjaGFuZ2UgaXQ7IHRoZSBzbmFwc2hvdCByZXN0b3JlcyB0aGVcbiAgLy8gc2F2ZWQgcmV2aXNpb24gYWZ0ZXIgcGxhY2luZyB0aGF0IHNjYWZmb2xkaW5nLlxufVxuXG4vKipcbiAqIFJlbW92ZSBhbiBlbnRpdHkgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB3b3JsZC4gVXNlZCB3aGVuIGEgc2l0ZSBpcyBjbGVhcmVkOlxuICogdGhlIHJlc291cmNlIHlpZWxkIGlzIGFjY291bnRlZCBmb3IgYnkgdGhlIGNhbGxlciwgYW5kIHRoZSBlbnRpdHkgbXVzdCBzdG9wXG4gKiBleGlzdGluZyBmb3IgY29sbGlzaW9uLCBvYnN0cnVjdGlvbiBhbmQgcGVyc2lzdGVuY2UsIG5vdCBqdXN0IGJlIGhpZGRlbiBieVxuICogdGhlIHJlbmRlcmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gIGNvbnN0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAobGlzdCkge1xuICAgIGNvbnN0IGkgPSBsaXN0LmluZGV4T2YoaWQpO1xuICAgIGlmIChpID49IDApIGxpc3Quc3BsaWNlKGksIDEpO1xuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGlkKTtcbiAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZW50aXR5SWQoY2h1bms6IHN0cmluZywgaTogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBlOiR7Y2h1bmt9OiR7aX1gO1xufVxuXG4vKipcbiAqIFB1cmUgZm9yZXN0LWRlbnNpdHkgZmllbGQgdXNlZCBieSBlbnRpdHkgZ2VuZXJhdGlvbi4gRXhwb3J0ZWQgcmVhZC1vbmx5IGZvclxuICogcmVuZGVyIGRlY29yYXRpb24gKHJlbmRlci9ncm91bmQtY292ZXIudHMpOyBjaGFuZ2luZyBpdCBjaGFuZ2VzIHdvcmxkcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcmVzdFNjb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGVhc3QgPSBNYXRoLmV4cCgtKCgod3ggLSAyMjApIC8gMjYwKSAqKiAyICsgKCh3eiArIDExMCkgLyAyMjApICoqIDIpKTtcbiAgY29uc3Qgbm9ydGggPSBNYXRoLmV4cCgtKCgod3ggLSAyMCkgLyAzMDApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDE5MCkgKiogMikpO1xuICBjb25zdCB3ZXN0ID0gTWF0aC5leHAoLSgoKHd4ICsgMzQwKSAvIDIwMCkgKiogMiArICgod3ogLSAxMjApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IHNvdXRoID0gTWF0aC5leHAoLSgoKHd4IC0gMTIwKSAvIDI0MCkgKiogMiArICgod3ogLSAzMzApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IG1vaXN0dXJlID0gZmJtMih3eCAvIDI2MCwgd3ogLyAyNjAsIHNlZWQgKyAyMDEsIDQpO1xuICBjb25zdCB2YWxsZXkgPSBNYXRoLmV4cCgtKCh3eCAvIDE0MCkgKiogMiArICh3eiAvIDEwNSkgKiogMikpO1xuICByZXR1cm4gTWF0aC5tYXgoZWFzdCwgbm9ydGggKiAwLjkyLCB3ZXN0ICogMC44MCwgc291dGggKiAwLjc4KSAqIDAuODJcbiAgICArIG1vaXN0dXJlICogMC4zOCAtIDAuMjIgLSB2YWxsZXkgKiAwLjM0O1xufVxuXG4vKiogUHVyZSByb2NraW5lc3MgZmllbGQgdXNlZCBieSBlbnRpdHkgZ2VuZXJhdGlvbiAoc2FtZSBjb250cmFjdCBhcyBmb3Jlc3RTY29yZSkuICovXG5leHBvcnQgZnVuY3Rpb24gcm9ja1Njb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IG1vdW50YWluID0gZmJtMih3eCAvIDMzMCwgd3ogLyAzMzAsIHNlZWQgKyAyMDIsIDMpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDE0MCwgd3ogLyAxNDAsIHNlZWQgKyAyMDMsIDMpIC0gMSk7XG4gIHJldHVybiBtb3VudGFpbiAqIDAuNTUgKyByaWRnZSAqIDAuNDU7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRW50aXRpZXMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHZvaWQge1xuICBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkLCBjaHVuay5jeCwgY2h1bmsuY3opO1xufVxuXG4vKiogQGludGVybmFsIFJlcGxheXMgZGV0ZXJtaW5pc3RpYyBnZW5lcmF0aW9uIGZvciBzbmFwc2hvdCBlbnRpdHkgZGVsdGFzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGlmICh3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGtleSkpIHJldHVybjtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuO1xuXG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKGhhc2gyaShjaHVuay5jeCwgY2h1bmsuY3osIHdvcmxkLnNlZWQgKyA5MDApICogNDI5NDk2NzI5NikgPj4+IDApO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgY29uc3QgY29sdW1ucyA9IGJhc2VDb2x1bW5zKHdvcmxkLCBjaHVuayk7XG4gIGxldCBuID0gMDtcbiAgbGV0IG5hdHVyYWxUcmVlcyA9IDA7XG4gIGxldCBuYXR1cmFsUGlua1RyZWVzID0gMDtcblxuICBjb25zdCBsb2NhbFN1cmZhY2UgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gKyBZX01JTjtcbiAgfTtcbiAgY29uc3QgbG9jYWxUb3AgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IE1hdElkID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIGFzIE1hdElkO1xuICB9O1xuICBjb25zdCBsb2NhbFNsb3BlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICByZXR1cm4gTWF0aC5tYXgoXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICk7XG4gIH07XG5cbiAgLy8gQSBqaXR0ZXJlZCA4IG0gbGF0dGljZSBnaXZlcyBjb2hlcmVudCBtYXNzZXMgYW5kIGF2b2lkcyBwZXItZnJhbWUgc2NhdHRlci5cbiAgZm9yIChsZXQgZ3ogPSAwOyBneiA8IENIVU5LX1NJWkU7IGd6ICs9IDgpIHtcbiAgICBmb3IgKGxldCBneCA9IDA7IGd4IDwgQ0hVTktfU0laRTsgZ3ggKz0gOCkge1xuICAgICAgY29uc3QgbHggPSBjbGFtcChNYXRoLmZsb29yKGd4ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3QgbHogPSBjbGFtcChNYXRoLmZsb29yKGd6ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAxKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHNsb3BlID0gbG9jYWxTbG9wZShseCwgbHopO1xuICAgICAgY29uc3QgdG9wID0gbG9jYWxUb3AobHgsIGx6KTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikgY29udGludWU7XG4gICAgICBjb25zdCBmb3Jlc3QgPSBmb3Jlc3RTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9ja3kgPSByb2NrU2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvbGwgPSBybmQoKTtcblxuICAgICAgY29uc3QgdHJlZUNoYW5jZSA9IGZvcmVzdCA+IDAuNTAgPyAwLjcyIDogZm9yZXN0ID4gMC4zMCA/IDAuMjUgOiAwLjA1O1xuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDIgJiYgcm9sbCA8IHRyZWVDaGFuY2UpIHtcbiAgICAgICAgLy8gVGhlIGNhcCBpcyBhIGRldGVybWluaXN0aWMgbmF0dXJhbC1nZW5lcmF0aW9uIHByb3BlcnR5LiBJdCBjYW5ub3RcbiAgICAgICAgLy8gZGVwZW5kIG9uIHdoaWNoIGNodW5rcyBhIHJlbmRlcmVyIGxvYWRlZCBiZWZvcmUgdGhpcyBvbmUuXG4gICAgICAgIGxldCBraW5kOiBFbnRpdHlLaW5kO1xuICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICBjb25zdCBzcGVjaWVzUm9sbCA9IHJuZCgpO1xuICAgICAgICBpZiAoc3BlY2llc1JvbGwgPCAwLjEyKSB7XG4gICAgICAgICAgaWYgKChuYXR1cmFsUGlua1RyZWVzICsgMSkgPiAwLjI1ICogKG5hdHVyYWxUcmVlcyArIDEpKSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rT3ZlcmZsb3crKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfYmxvc3NvbSc7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDIpO1xuICAgICAgICAgICAgbmF0dXJhbFBpbmtUcmVlcysrO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC40MCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3NwaXJlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC43NCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3RhYmxlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgIH1cbiAgICAgICAgbmF0dXJhbFRyZWVzKys7XG4gICAgICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjg4ICsgcm5kKCkgKiAwLjI0LCB2YXJpYW50LFxuICAgICAgICAgIHJlc291cmNlOiAnd29vZCcsIHJlbWFpbmluZzogMTIsIHlpZWxkUGVySGFydmVzdDogNCxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgcm9ja3kgPiAwLjQ2ICYmIHJvbGwgPCAwLjM4KSB7XG4gICAgICAgIC8vIENvbnN1bWUgdGhlIHJldGlyZWQgc3RvbmUgZm9ybSdzIHJhbmRvbSBkcmF3cyBhbmQgYWxsb2NhdGUgaXRzIG9sZFxuICAgICAgICAvLyBzZXF1ZW5jZSBJRCwgYnV0IGRvIG5vdCBpbnNlcnQgYW4gZW50aXR5LiBMYXRlciBuYXR1cmFsIHBsYWNlbWVudHNcbiAgICAgICAgLy8gdGhlcmVmb3JlIHJlbWFpbiBieXRlLWZvci1ieXRlIGNvbXBhdGlibGUgd2l0aCByZWNvcmRlZCBzYXZlcy5cbiAgICAgICAgY29uc3Qgc2l6ZVJvbGwgPSBybmQoKTtcbiAgICAgICAgY29uc3Qga2luZDogRW50aXR5S2luZCA9IHNpemVSb2xsIDwgMC41NSA/ICdzdHlsX3JvY2tfc21hbGwnXG4gICAgICAgICAgOiBzaXplUm9sbCA8IDAuOTAgPyAnc3R5bF9yb2NrX21lZGl1bScgOiAnc3R5bF9yb2NrX2xhcmdlJztcbiAgICAgICAgY29uc3QgaWQgPSBlbnRpdHlJZChjaHVuay5rZXksIG4rKyk7XG4gICAgICAgIGNvbnN0IHJlY29yZCA9IHtcbiAgICAgICAgICBpZCwga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJlc291cmNlOiAnc3RvbmUnIGFzIGNvbnN0LFxuICAgICAgICAgIHJlbWFpbmluZzoga2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyA0IDoga2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gOCA6IDEyLFxuICAgICAgICAgIHlpZWxkUGVySGFydmVzdDogMywgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gT25seSBlbnRpdGllcyB0aGF0IGV4aXN0ZWQgaW4gYW4gYWNjZXB0ZWQgb2xkIHNhdmUgZ2V0IHRvbWJzdG9uZXMsXG4gICAgICAgIC8vIGR1cmluZyBleHBsaWNpdCBtaWdyYXRpb24uIE9yZGluYXJ5IGdlbmVyYXRpb24gbXVzdCByZXN0b3JlIGV4YWN0bHkuXG4gICAgICAgIGlmIChpc1N0b25lUmVwbGF5KHdvcmxkKSkgYWRkRW50aXR5KHdvcmxkLCByZWNvcmQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSAmJiByb2NreSA+IDAuNTggJiYgcm9sbCA8IDAuMTgpIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9vcmUnLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMiksXG4gICAgICAgICAgcmVzb3VyY2U6ICdvcmUnLCByZW1haW5pbmc6IDgsIHlpZWxkUGVySGFydmVzdDogMixcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMSAmJiByb2xsIDwgMC4zMCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX3NocnViJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjggKyBybmQoKSAqIDAuNCwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICAgIHJlc291cmNlOiAnZmliZXInLCByZW1haW5pbmc6IDQsIHlpZWxkUGVySGFydmVzdDogMSxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkQXV0aG9yZWRFbnRpdHkod29ybGQ6IFdvcmxkLCBraW5kOiBFbnRpdHlLaW5kLCB4OiBudW1iZXIsIHo6IG51bWJlciwgdmFyaWFudDogbnVtYmVyLCByb3Q6IG51bWJlciwgc2NhbGU6IG51bWJlciwgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGwsIHJlbWFpbmluZzogbnVtYmVyLCB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHkgPD0gU0VBX0xFVkVMKSByZXR1cm47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAvLyBBIGhlcm8gYXNzZXQgb3ducyBpdHMgc3BvdDogY2xlYXIgYW55IGdlbmVyYXRlZCBlbnRpdHkgdGhhdCB3b3VsZCBvdmVybGFwXG4gIC8vIGl0LCByYXRoZXIgdGhhbiBzaWxlbnRseSBkcm9wcGluZyB0aGUgYXV0aG9yZWQgY29tcG9zaXRpb24uXG4gIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXTtcbiAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChraW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHJldHVybjtcbiAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoZSAmJiBNYXRoLmh5cG90KGUueCAtIHgsIGUueiAtIHopIDwgMi42KSB7XG4gICAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICAgICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICAgICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gICAgfVxuICB9XG4gIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSkpO1xuICAvLyBBdXRob3JlZCBjb21wb3NpdGlvbiBpcyBkdXJhYmxlIHN0YXRlOiBpdCBjYW4gY2xlYXIgb3ZlcmxhcHBpbmcgbmF0dXJhbFxuICAvLyBlbnRpdGllcywgc28gc2F2ZSB0aGUgY29tcGxldGUgYWZmZWN0ZWQgY2h1bmsgcmF0aGVyIHRoYW4gb25seSBpdHMgaGVyb2VzLlxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuXG4gIGNvbnN0IGlkID0gYGhlcm86JHtraW5kfToke01hdGgucm91bmQoeCl9OiR7TWF0aC5yb3VuZCh6KX1gO1xuICBjb25zdCBiZWZvcmUgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICBjb25zdCBlbnRpdHk6IEVudGl0eSA9IHtcbiAgICBpZCwga2luZCwgY2h1bms6IGtleSwgeDogeCArIDAuNSwgeSwgejogeiArIDAuNSxcbiAgICByb3QsIHNjYWxlLCB2YXJpYW50LCByZXNvdXJjZSwgcmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiB0cnVlLFxuICB9O1xuICBhZGRFbnRpdHkod29ybGQsIGVudGl0eSk7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5zaXplID4gYmVmb3JlICYmIGtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHtcbiAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgIGlmIChraW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBpZiAod29ybGQuYXV0aG9yZWRQbGFjZWQpIHJldHVybjtcbiAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSB0cnVlO1xuXG4gIGNvbnN0IHNpdGVzOiBBcnJheTx7IGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJzsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJvdDogbnVtYmVyIH0+ID0gW1xuICAgIHsga2luZDogJ3dheXN0b25lJywgeDogLTEwLCB6OiAtMTQsIHJvdDogMCB9LFxuICAgIHsga2luZDogJ21hcmtlcicsIHg6IC0zMiwgejogLTgsIHJvdDogTWF0aC5QSSAvIDIgfSxcbiAgXTtcbiAgZm9yIChjb25zdCBzIG9mIHNpdGVzKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgcy54LCBzLnopO1xuICAgIGlmICh5IDw9IFNFQV9MRVZFTCkgY29udGludWU7XG4gICAgd29ybGQuc2l0ZXMucHVzaCh7XG4gICAgICBpZDogYHNpdGU6JHtzLmtpbmR9YCxcbiAgICAgIGtpbmQ6IHMua2luZCxcbiAgICAgIHg6IHMueCArIDAuNSwgeSwgejogcy56ICsgMC41LFxuICAgICAgcm90OiBzLnJvdCxcbiAgICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gQSBoZXJvIGdyb3ZlIGNvbXBvc2VkIGluIHRoZSBkZWZhdWx0IGNhbWVyYSdzIHZpZXcgZGlyZWN0aW9uLiBUaGVzZSBhcmVcbiAgLy8gU3R5bCBuYXR1cmFsIGFzc2V0cyAoQVMtMDAxIHYyKSwgbm90IE5veGVsIGFyY2hpdGVjdHVyZTsgdGhlIE5veGVsXG4gIC8vIHdheXN0b25lL21hcmtlciBhYm92ZSByZW1haW4gdGhlIGh1bWFuLW1hZGUgbGFuZG1hcmtzLlxuICBjb25zdCBncm92ZTogQXJyYXk8W0VudGl0eUtpbmQsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXT4gPSBbXG4gICAgWydzdHlsX3RyZWVfc3BpcmUnLCAtMjIsIC0yNiwgMCwgMS4wMCwgMF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtMzQsIC0xOCwgMSwgMC45NSwgTWF0aC5QSSAvIDEyXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTE2LCAtMzQsIDIsIDEuMDAsIE1hdGguUEkgLyA2XSxcbiAgICBbJ3N0eWxfdHJlZV9ibG9zc29tJywgLTI4LCAtMzgsIDAsIDAuOTAsIE1hdGguUEkgLyA0XSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC00MCwgLTMwLCAyLCAxLjA1LCBNYXRoLlBJIC8gM10sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xMiwgLTI0LCAwLCAwLjkwLCBNYXRoLlBJIC8gMi40XSxcbiAgXTtcbiAgZm9yIChjb25zdCBba2luZCwgeCwgeiwgdmFyaWFudCwgc2NhbGUsIHJvdF0gb2YgZ3JvdmUpIHtcbiAgICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwga2luZCwgeCwgeiwgdmFyaWFudCwgcm90LCBzY2FsZSwgJ3dvb2QnLCAxMiwgNCk7XG4gIH1cbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3JvY2tfbWVkaXVtJywgLTYsIC0xMCwgMCwgMCwgMS4wLCAnc3RvbmUnLCA4LCAzKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3NocnViJywgLTE0LCAtOCwgMSwgTWF0aC5QSSAvIDEyLCAxLjEsICdmaWJlcicsIDQsIDEpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfY2Fpcm4nLCAtMjAsIC02LCAwLCAwLCAxLjAsICdzdG9uZScsIDYsIDIpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfb3JlJywgLTM4LCAtNDIsIDAsIE1hdGguUEkgLyA0LCAxLjEsICdvcmUnLCA4LCAyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5lYXJlc3RIYXJ2ZXN0YWJsZShcbiAgd29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgcmFkaXVzOiBudW1iZXIsIHJlc291cmNlPzogUmVzb3VyY2VUeXBlLFxuKTogRW50aXR5IHwgbnVsbCB7XG4gIGxldCBiZXN0OiBFbnRpdHkgfCBudWxsID0gbnVsbDtcbiAgbGV0IGJlc3REID0gcmFkaXVzICogcmFkaXVzO1xuICBmb3IgKGNvbnN0IGUgb2Ygd29ybGQuZW50aXRpZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpXG4gICAgICB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSBjb250aW51ZTtcbiAgICBpZiAocmVzb3VyY2UgJiYgZS5yZXNvdXJjZSAhPT0gcmVzb3VyY2UpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGQgPSAoZS54IC0geCkgKiogMiArIChlLnogLSB6KSAqKiAyO1xuICAgIGlmIChkIDwgYmVzdEQpIHsgYmVzdEQgPSBkOyBiZXN0ID0gZTsgfVxuICB9XG4gIHJldHVybiBiZXN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RSZXN1bHQgeyBlbnRpdHk6IEVudGl0eTsgcmVzb3VyY2U6IFJlc291cmNlVHlwZTsgYW1vdW50OiBudW1iZXI7IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogSGFydmVzdFJlc3VsdCB8IG51bGwge1xuICBjb25zdCBlID0gbGl2ZUVudGl0eSh3b3JsZCwgaWQpO1xuICBpZiAoIWUgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGFtb3VudCA9IE1hdGgubWluKGUueWllbGRQZXJIYXJ2ZXN0LCBlLnJlbWFpbmluZyk7XG4gIGlmICh3b3JsZC5saWZlICYmIE9iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgbikgPT4gc3VtICsgbiwgMCkgKyBhbW91bnQgPiAxMjApIHJldHVybiBudWxsO1xuICBlLnJlbWFpbmluZyAtPSBhbW91bnQ7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGUuaGFydmVzdGVkT25jZSA9IHRydWU7XG4gIGlmIChlLnJlbWFpbmluZyA8PSAwKSBlLmhhcnZlc3RlZCA9IHRydWU7XG4gIHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA9ICh3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IGVudGl0eTogZSwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCB9O1xufVxuXG4vKiogUmVtb3ZlIGV2ZXJ5IHJldGlyZWQgc291cmNlIGFmdGVyIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5LiBUaGlzIG1pZ3JhdGlvblxuICogY3JlYXRlcyBkZXRlcm1pbmlzdGljIHRvbWJzdG9uZXMgYnV0IGlzIG5vdCBhIHBsYXllciBjb21tYW5kIG9yIHJldmlzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJldGlyZVN0b25lRW50aXRpZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZSBvZiBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldKSB7XG4gICAgaWYgKCFpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSkgY29udGludWU7XG4gICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGUuaWQpO1xuICAgIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGUuaWQpO1xuICAgIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICAgIGlmICghd29ybGQuZW50aXR5Q2h1bmtzLmhhcyhlLmNodW5rKSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgZm9yIChjb25zdCBba2V5LCBpZHNdIG9mIHdvcmxkLmVudGl0eUNodW5rcykge1xuICAgIGNvbnN0IGFjdGl2ZSA9IGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKTtcbiAgICBpZiAoYWN0aXZlLmxlbmd0aCA+IDAgfHwgd29ybGQuZW50aXR5Q2hhbmdlcy5oYXMoa2V5KSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGFjdGl2ZSk7XG4gICAgZWxzZSB3b3JsZC5lbnRpdHlDaHVua3MuZGVsZXRlKGtleSk7XG4gIH1cbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBlcnNpc3RlbmNlIC8gYXV0aG9yaXR5IGJvdW5kYXJ5IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNYW5pZmVzdCB7XG4gIHNjaGVtYTogMTtcbiAgc2VlZDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBwYXJhbXNIYXNoOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGZudjFhKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoID0gMHg4MTFjOWRjNTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgaCBePSB0ZXh0LmNoYXJDb2RlQXQoaSk7XG4gICAgaCA9IE1hdGguaW11bChoLCAweDAxMDAwMTkzKTtcbiAgfVxuICByZXR1cm4gKGggPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ybGRNYW5pZmVzdCh3b3JsZDogV29ybGQpOiBXb3JsZE1hbmlmZXN0IHtcbiAgY29uc3QgcCA9IHdvcmxkLnBhcmFtcztcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAgc2VlZDogd29ybGQuc2VlZCxcbiAgICBnZW5lcmF0b3JWZXJzaW9uOiBwLmdlbmVyYXRvclZlcnNpb24sXG4gICAgc2l6ZTogcC5zaXplLFxuICAgIGNodW5rU2l6ZTogcC5jaHVua1NpemUsXG4gICAgeU1pbjogcC55TWluLFxuICAgIHlNYXg6IHAueU1heCxcbiAgICBzZWFMZXZlbDogcC5zZWFMZXZlbCxcbiAgICBwYXJhbXNIYXNoOiBmbnYxYShKU09OLnN0cmluZ2lmeShwKSksXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxFZGl0IHsgaTogbnVtYmVyOyBtOiBudW1iZXI7IH1cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIHNjaGVtYTogMTtcbiAga2V5OiBzdHJpbmc7XG4gIGJhc2VWZXJzaW9uOiBudW1iZXI7XG4gIGVkaXRzOiBWb3hlbEVkaXRbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cG9ydENodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IENodW5rRGVsdGEge1xuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBrZXksXG4gICAgYmFzZVZlcnNpb246IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIGVkaXRzOiBlZGl0cyA/IFsuLi5lZGl0cy5lbnRyaWVzKCldLm1hcCgoW2ksIG1dKSA9PiAoeyBpLCBtIH0pKS5zb3J0KChhLCBiKSA9PiBhLmkgLSBiLmkpIDogW10sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBkZWx0YTogQ2h1bmtEZWx0YSk6IHZvaWQge1xuICBjb25zdCBbY3gsIGN6XSA9IGRlbHRhLmtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICBmb3IgKGNvbnN0IGUgb2YgZGVsdGEuZWRpdHMpIHtcbiAgICBjb25zdCB5SW5kZXggPSBNYXRoLmZsb29yKGUuaSAvIENIVU5LX0FSRUEpO1xuICAgIGNvbnN0IHJlbSA9IGUuaSAlIENIVU5LX0FSRUE7XG4gICAgY29uc3QgbHogPSBNYXRoLmZsb29yKHJlbSAvIENIVU5LX1NJWkUpO1xuICAgIGNvbnN0IGx4ID0gcmVtICUgQ0hVTktfU0laRTtcbiAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4O1xuICAgIGNvbnN0IHkgPSBZX01JTiArIHlJbmRleDtcbiAgICBjb25zdCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgIHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBlLm0gYXMgTWF0SWQpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gdGltZSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFRpbWVTdGF0ZSB7IHQ6IG51bWJlcjsgZGF5TGVuZ3RoU2VjOiBudW1iZXI7IHBhdXNlZDogYm9vbGVhbjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpbWUoczogVGltZVN0YXRlLCBkdDogbnVtYmVyKTogdm9pZCB7XG4gIGlmIChzLnBhdXNlZCkgcmV0dXJuO1xuICBzLnQgPSAocy50ICsgZHQgLyBzLmRheUxlbmd0aFNlYykgJSAxO1xufVxuIiwgIi8vIEZhdW5hIFx1MjAxNCBzcGVjaWVzLCBoYWJpdGF0LCBkZXRlcm1pbmlzdGljIHNwYXduaW5nIGFuZCBiZWhhdmlvdXIgKHB1cmUgVFMsIEQtMDA1KS5cbi8vXG4vLyBPbmUgYXJjaGl0ZWN0dXJlIGZvciBldmVyeSBjcmVhdHVyZSB0aWVyOlxuLy8gICAnYW1iaWVudCcgICAgICAgXHUyMDE0IGxpdmluZyBzY2VuZXJ5LiBTcGF3bmVkIGRldGVybWluaXN0aWNhbGx5IHBlciBjaHVuayBmcm9tXG4vLyAgICAgICAgICAgICAgICAgICAgIChzZWVkLCBnZW5lcmF0b3IsIGNodW5rKTsgbm90IHNhdmVkLCByZS1jcmVhdGVkIHdoZW4gYVxuLy8gICAgICAgICAgICAgICAgICAgICBjaHVuayBsb2Fkcy4gVGhpcyBpcyB0aGUgdGllciBpbXBsZW1lbnRlZCB0b2RheS5cbi8vICAgJ2F1dGhvcml0YXRpdmUnIFx1MjAxNCBhIGNyZWF0dXJlIHRoZSBlY29ub215IGNhcmVzIGFib3V0IChodW50ZWQsIGNhdWdodCxcbi8vICAgICAgICAgICAgICAgICAgICAgdGFtZWQsIGJyZWQsIHRyYWRlZCkuIFNhbWUgcmVjb3JkIHNoYXBlLCBidXQgc3RvcmVkIGluIHRoZVxuLy8gICAgICAgICAgICAgICAgICAgICB3b3JsZCBzbmFwc2hvdCBhbmQgY2hhbmdlZCBvbmx5IGJ5IGpvdXJuYWxlZCBjb21tYW5kcy5cbi8vIFByb21vdGlvbiBrZWVwcyB0aGUgcmVjb3JkIGlkLCBzcGVjaWVzIGFuZCBwb3NpdGlvbiwgc28gYSBodW50ZWQgZGVlciBpcyB0aGVcbi8vIHNhbWUgZGVlciB0aGUgcGxheWVyIHdhdGNoZWQgZ3JhemUuIE5vdGhpbmcgaGVyZSBpbXBvcnRzIHRocmVlLmpzLlxuLy9cbi8vIEJlaGF2aW91ciB1c2VzIHJlc2lkZW50LW9ubHkgdGVycmFpbiBxdWVyaWVzLCBzbyBjcmVhdHVyZXMgbmV2ZXIgZ2VuZXJhdGVcbi8vIGNodW5rczsgdGhleSB0dXJuIGJhY2sgYXQgdGhlIGVkZ2Ugb2YgdGhlIGxvYWRlZCB3b3JsZC5cbmltcG9ydCB7XG4gIFdvcmxkLCBNQVQsIHJlc2lkZW50U3VyZmFjZUF0LCByZXNpZGVudFZveGVsQXQsIGNodW5rS2V5LCBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWixcbiAgQ0hVTktfU0laRSwgaHlkcm9sb2d5Rm9yLCBpc1JldGlyZWRTdG9uZUtpbmQsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgaGFzaDJpLCBtdWxiZXJyeTMyIH0gZnJvbSAnLi9ub2lzZSc7XG5cbmV4cG9ydCB0eXBlIEhhYml0YXQgPSAnbWVhZG93JyB8ICdmb3Jlc3RfZWRnZScgfCAnd2F0ZXInO1xuZXhwb3J0IHR5cGUgQ3JlYXR1cmVUaWVyID0gJ2FtYmllbnQnIHwgJ2F1dGhvcml0YXRpdmUnO1xuZXhwb3J0IHR5cGUgQmVoYXZpb3VyID0gJ2lkbGUnIHwgJ2dyYXplJyB8ICd3YW5kZXInIHwgJ2ZsZWUnIHwgJ3Jlc3QnIHwgJ3NsZWVwJyB8ICdzd2ltJyB8ICdzY2F0dGVyJyB8ICdzdGFsaycgfCAnY2hhc2UnIHwgJ2ZvbGxvdyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3BlY2llc0RlZiB7XG4gIGlkOiAnZGVlcicgfCAncmFiYml0JyB8ICd0cm91dCcgfCAnZm94JyB8ICd3b2xmJztcbiAgLyoqIFNwZWNpZXMgdGhpcyBvbmUgZmxlZXMgZnJvbSB3aGVuIHRoZXkgY29tZSBjbG9zZS4gKi9cbiAgZmVhcnNTcGVjaWVzPzogUmVhZG9ubHlBcnJheTxTcGVjaWVzRGVmWydpZCddPjtcbiAgbGFiZWw6IHN0cmluZztcbiAgaGFiaXRhdDogSGFiaXRhdDtcbiAgLyoqIEJvZHkgbGVuZ3RoIChtKSwgdXNlZCBieSByZW5kZXJpbmcgYW5kIGNvbGxpc2lvbi4gKi9cbiAgbGVuZ3RoOiBudW1iZXI7XG4gIHdhbGtTcGVlZDogbnVtYmVyO1xuICBmbGVlU3BlZWQ6IG51bWJlcjtcbiAgLyoqIERpc3RhbmNlIGF0IHdoaWNoIHRoZSBzcGVjaWVzIG5vdGljZXMgYSBwZXJzb24gYW5kIGZsZWVzLiAqL1xuICB3YXJpbmVzczogbnVtYmVyO1xuICBncm91cE1pbjogbnVtYmVyO1xuICBncm91cE1heDogbnVtYmVyO1xuICAvKiogSG9tZSByYW5nZSByYWRpdXMgYXJvdW5kIHRoZSBzcGF3biBwb2ludCAobSkuICovXG4gIHJhbmdlOiBudW1iZXI7XG4gIC8qKiBSZXNvdXJjZSBhbmQgYW1vdW50IGEgZnV0dXJlIGh1bnRpbmcvZmlzaGluZyBjb21tYW5kIHdvdWxkIHlpZWxkLiAqL1xuICB5aWVsZHM6IFBhcnRpYWw8UmVjb3JkPCdmb29kJyB8ICdoaWRlJyB8ICdmaWJlcicsIG51bWJlcj4+O1xuICBkaXVybmFsOiBib29sZWFuO1xufVxuXG5leHBvcnQgY29uc3QgU1BFQ0lFUzogUmVjb3JkPFNwZWNpZXNEZWZbJ2lkJ10sIFNwZWNpZXNEZWY+ID0ge1xuICBkZWVyOiB7XG4gICAgaWQ6ICdkZWVyJywgbGFiZWw6ICdSZWQgZGVlcicsIGhhYml0YXQ6ICdmb3Jlc3RfZWRnZScsIGxlbmd0aDogMS43LCB3YWxrU3BlZWQ6IDEuMiwgZmxlZVNwZWVkOiA4LjUsXG4gICAgd2FyaW5lc3M6IDE0LCBncm91cE1pbjogMiwgZ3JvdXBNYXg6IDQsIHJhbmdlOiAyOCwgeWllbGRzOiB7IGZvb2Q6IDEyLCBoaWRlOiAyIH0sIGRpdXJuYWw6IHRydWUsXG4gIH0sXG4gIHJhYmJpdDoge1xuICAgIGlkOiAncmFiYml0JywgbGFiZWw6ICdIYXJlJywgaGFiaXRhdDogJ21lYWRvdycsIGxlbmd0aDogMC40NSwgd2Fsa1NwZWVkOiAwLjksIGZsZWVTcGVlZDogNi41LFxuICAgIHdhcmluZXNzOiA2LCBncm91cE1pbjogMSwgZ3JvdXBNYXg6IDMsIHJhbmdlOiAxNCwgeWllbGRzOiB7IGZvb2Q6IDIsIGhpZGU6IDEgfSwgZGl1cm5hbDogdHJ1ZSxcbiAgfSxcbiAgdHJvdXQ6IHtcbiAgICBpZDogJ3Ryb3V0JywgbGFiZWw6ICdCcm93biB0cm91dCcsIGhhYml0YXQ6ICd3YXRlcicsIGxlbmd0aDogMC40LCB3YWxrU3BlZWQ6IDAuNiwgZmxlZVNwZWVkOiAzLjUsXG4gICAgd2FyaW5lc3M6IDMuNSwgZ3JvdXBNaW46IDQsIGdyb3VwTWF4OiA3LCByYW5nZTogMTAsIHlpZWxkczogeyBmb29kOiAyIH0sIGRpdXJuYWw6IGZhbHNlLFxuICB9LFxuICBmb3g6IHtcbiAgICBpZDogJ2ZveCcsIGxhYmVsOiAnUmVkIGZveCcsIGhhYml0YXQ6ICdmb3Jlc3RfZWRnZScsIGxlbmd0aDogMC45NSwgd2Fsa1NwZWVkOiAxLjUsIGZsZWVTcGVlZDogNyxcbiAgICB3YXJpbmVzczogMTEsIGdyb3VwTWluOiAxLCBncm91cE1heDogMSwgcmFuZ2U6IDMwLCB5aWVsZHM6IHsgZm9vZDogMywgaGlkZTogMSB9LCBkaXVybmFsOiBmYWxzZSxcbiAgICBmZWFyc1NwZWNpZXM6IFsnd29sZiddLFxuICB9LFxuICB3b2xmOiB7XG4gICAgaWQ6ICd3b2xmJywgbGFiZWw6ICdHcmV5IHdvbGYnLCBoYWJpdGF0OiAnZm9yZXN0X2VkZ2UnLCBsZW5ndGg6IDEuMywgd2Fsa1NwZWVkOiAxLjgsIGZsZWVTcGVlZDogOCxcbiAgICB3YXJpbmVzczogMjAsIGdyb3VwTWluOiAyLCBncm91cE1heDogNCwgcmFuZ2U6IDQwLCB5aWVsZHM6IHsgZm9vZDogOCwgaGlkZTogMiB9LCBkaXVybmFsOiBmYWxzZSxcbiAgfSxcbn07XG4vKiogV2hvIGZsZWVzIHdob20gKHdpbGRsaWZlIG9ubHk7IGxpdmVzdG9jayBlbmNsb3N1cmVzIGFyZSBub3QgcGFydCBvZiB0aGlzIGFtYmllbnQgdGllcikuICovXG5jb25zdCBGRUFSUzogUGFydGlhbDxSZWNvcmQ8U3BlY2llc0RlZlsnaWQnXSwgUmVhZG9ubHlBcnJheTxTcGVjaWVzRGVmWydpZCddPj4+ID0ge1xuICByYWJiaXQ6IFsnZm94JywgJ3dvbGYnXSwgZGVlcjogWyd3b2xmJ10sIGZveDogWyd3b2xmJ10sXG59O1xuLyoqIEhvdyBjbG9zZSBhIHByZWRhdG9yIG11c3QgYmUgYmVmb3JlIGl0cyBwcmV5IGJvbHRzIChtZXRyZXMpLiAqL1xuY29uc3QgUFJFREFUT1JfQUxBUk0gPSA5O1xuXG5leHBvcnQgaW50ZXJmYWNlIENyZWF0dXJlIHtcbiAgLyoqIFN0YWJsZSwgZGV0ZXJtaW5pc3RpYyBpZDogZmF1bmE6PHNwZWNpZXM+OjxjaHVuaz46PGluZGV4Pi4gKi9cbiAgaWQ6IHN0cmluZztcbiAgc3BlY2llczogU3BlY2llc0RlZlsnaWQnXTtcbiAgdGllcjogQ3JlYXR1cmVUaWVyO1xuICBjaHVuazogc3RyaW5nO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBoZWFkaW5nOiBudW1iZXI7XG4gIGhvbWVYOiBudW1iZXI7XG4gIGhvbWVaOiBudW1iZXI7XG4gIGJlaGF2aW91cjogQmVoYXZpb3VyO1xuICAvKiogU2Vjb25kcyBsZWZ0IGluIHRoZSBjdXJyZW50IGJlaGF2aW91ci4gKi9cbiAgdGltZXI6IG51bWJlcjtcbiAgZ29hbFg6IG51bWJlcjtcbiAgZ29hbFo6IG51bWJlcjtcbiAgLyoqIEZpc2ggb25seTogcHJlZmVycmVkIGRlcHRoIGZyYWN0aW9uICgwID0gc3VyZmFjZSwgMSA9IGJlZCkuICovXG4gIGRlcHRoUHJlZjogbnVtYmVyO1xuICBzcGVlZDogbnVtYmVyO1xuICAvKiogRGV0ZXJtaW5pc3RpYyBwZXItY3JlYXR1cmUgcmFuZG9tIHN0cmVhbSBzdGF0ZS4gKi9cbiAgcm5nOiBudW1iZXI7XG4gIC8qKiBQYWNrIG1lbWJlcnMgZm9sbG93IHRoaXMgY3JlYXR1cmUgKHdvbHZlcykuICovXG4gIGxlYWRlcj86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGYXVuYUNvbnRleHQge1xuICAvKiogUG9zaXRpb25zIG9mIHBlb3BsZSAocGxheWVyIGNoYXJhY3RlciwgbGF0ZXIgdmlsbGFnZXJzKS4gKi9cbiAgdGhyZWF0czogUmVhZG9ubHlBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyOyBpbldhdGVyPzogYm9vbGVhbiB9PjtcbiAgbmlnaHQ6IGJvb2xlYW47XG4gIC8qKiBFdmVyeSBwcmVkYXRvciBpbiB0aGUgbG9hZGVkIGFyZWEsIGZvciBwcmV5IHRvIGZsZWUgZnJvbS4gKi9cbiAgcHJlZGF0b3JzPzogUmVhZG9ubHlBcnJheTx7IHNwZWNpZXM6IFNwZWNpZXNEZWZbJ2lkJ107IHg6IG51bWJlcjsgejogbnVtYmVyIH0+O1xuICAvKiogSGFyZXMgaW4gdGhlIGxvYWRlZCBhcmVhLCBmb3IgZm94ZXMgdG8gc3RhbGsuICovXG4gIHByZXk/OiBSZWFkb25seUFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT47XG4gIC8qKiBQYWNrIGxlYWRlcnMgYnkgaWQsIGZvciB3b2x2ZXMgdG8gZm9sbG93LiAqL1xuICBsZWFkZXJzPzogUmVhZG9ubHlNYXA8c3RyaW5nLCBDcmVhdHVyZT47XG59XG5cbmV4cG9ydCBjb25zdCBGQVVOQV9TVEVQID0gMC4xO1xuXG5mdW5jdGlvbiByYW5kKGM6IENyZWF0dXJlKTogbnVtYmVyIHtcbiAgYy5ybmcgPSAoYy5ybmcgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgbGV0IHQgPSBjLnJuZztcbiAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgdCB8IDYxKTtcbiAgcmV0dXJuICgodCBeICh0ID4+PiAxNCkpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbi8qKiBUb3Agb2Ygc3RhbmRpbmcgd2F0ZXIgb24gYSByZXNpZGVudCBjb2x1bW4sIG9yIG51bGwgaWYgZHJ5IG9yIHVubG9hZGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50V2F0ZXJBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogeyBiZWQ6IG51bWJlcjsgdG9wOiBudW1iZXIgfSB8IG51bGwge1xuICBjb25zdCBiZWQgPSByZXNpZGVudFN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmIChiZWQgPT09IG51bGwpIHJldHVybiBudWxsO1xuICBsZXQgeSA9IGJlZDtcbiAgd2hpbGUgKHkgPCBiZWQgKyAyNCAmJiByZXNpZGVudFZveGVsQXQod29ybGQsIHgsIHksIHopID09PSBNQVQuV0FURVIpIHkrKztcbiAgcmV0dXJuIHkgPiBiZWQgPyB7IGJlZCwgdG9wOiB5IH0gOiBudWxsO1xufVxuXG5mdW5jdGlvbiBsYW5kT2sod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgbWF4U2xvcGUgPSAxKTogbnVtYmVyIHwgbnVsbCB7XG4gIGNvbnN0IGZ4ID0gTWF0aC5mbG9vcih4KSwgZnogPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCBoID0gcmVzaWRlbnRTdXJmYWNlQXQod29ybGQsIGZ4LCBmeik7XG4gIGlmIChoID09PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgdG9wID0gcmVzaWRlbnRWb3hlbEF0KHdvcmxkLCBmeCwgaCAtIDEsIGZ6KTtcbiAgaWYgKHRvcCAhPT0gTUFULkdSQVNTICYmIHRvcCAhPT0gTUFULlNPSUwgJiYgdG9wICE9PSBNQVQuTU9TUykgcmV0dXJuIG51bGw7XG4gIGlmIChyZXNpZGVudFZveGVsQXQod29ybGQsIGZ4LCBoLCBmeikgIT09IE1BVC5BSVIpIHJldHVybiBudWxsO1xuICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIFtbMSwgMF0sIFstMSwgMF0sIFswLCAxXSwgWzAsIC0xXV0pIHtcbiAgICBjb25zdCBuID0gcmVzaWRlbnRTdXJmYWNlQXQod29ybGQsIGZ4ICsgZHgsIGZ6ICsgZHopO1xuICAgIGlmIChuID09PSBudWxsIHx8IE1hdGguYWJzKG4gLSBoKSA+IG1heFNsb3BlKSByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gaDtcbn1cblxuLyoqXG4gKiBEZXRlcm1pbmlzdGljIGFtYmllbnQgc3Bhd24gZm9yIG9uZSByZXNpZGVudCBjaHVuay4gUHVyZSBmdW5jdGlvbiBvZiB0aGVcbiAqIHdvcmxkJ3Mgc2VlZCwgZ2VuZXJhdG9yIGFuZCB0aGUgY2h1bmsncyBnZW5lcmF0ZWQgdGVycmFpbiBhbmQgdHJlZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzcGF3bkNodW5rRmF1bmEod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQ3JlYXR1cmVbXSB7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGlmICghd29ybGQuY2h1bmtzLmhhcyhrZXkpKSByZXR1cm4gW107XG4gIGNvbnN0IHNlZWQgPSB3b3JsZC5zZWVkO1xuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChoYXNoMmkoY3gsIGN6LCBzZWVkICsgNzc3MSkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBjb25zdCBvdXQ6IENyZWF0dXJlW10gPSBbXTtcbiAgbGV0IGluZGV4ID0gMDtcblxuICBsZXQgdHJlZXMgPSAwO1xuICBmb3IgKGNvbnN0IGlkIG9mIHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXSkge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmIChlICYmICFlLmhhcnZlc3RlZCAmJiAhaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZV8nKSkgdHJlZXMrKztcbiAgfVxuICBsZXQgd2F0ZXIgPSAwLCB3eCA9IDAsIHd6ID0gMDtcbiAgY29uc3QgZ3Jhc3M6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgZm9yIChsZXQgbHogPSAyOyBseiA8IENIVU5LX1NJWkU7IGx6ICs9IDQpIHtcbiAgICBmb3IgKGxldCBseCA9IDI7IGx4IDwgQ0hVTktfU0laRTsgbHggKz0gNCkge1xuICAgICAgY29uc3QgeCA9IG94ICsgbHgsIHogPSBveiArIGx6O1xuICAgICAgY29uc3QgdyA9IHJlc2lkZW50V2F0ZXJBdCh3b3JsZCwgeCwgeik7XG4gICAgICBpZiAodyAmJiB3LnRvcCAtIHcuYmVkID49IDEuMikgeyB3YXRlcisrOyB3eCArPSB4OyB3eiArPSB6OyB9XG4gICAgICBlbHNlIGlmIChsYW5kT2sod29ybGQsIHgsIHopICE9PSBudWxsKSBncmFzcy5wdXNoKHsgeCwgeiB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBtYWtlID0gKHNwZWNpZXM6IFNwZWNpZXNEZWZbJ2lkJ10sIHg6IG51bWJlciwgejogbnVtYmVyLCB5OiBudW1iZXIpOiBDcmVhdHVyZSA9PiB7XG4gICAgY29uc3QgYzogQ3JlYXR1cmUgPSB7XG4gICAgICBpZDogYGZhdW5hOiR7c3BlY2llc306JHtrZXl9OiR7aW5kZXgrK31gLCBzcGVjaWVzLCB0aWVyOiAnYW1iaWVudCcsIGNodW5rOiBrZXksXG4gICAgICB4LCB5LCB6LCBoZWFkaW5nOiBybmQoKSAqIE1hdGguUEkgKiAyLCBob21lWDogeCwgaG9tZVo6IHosXG4gICAgICBiZWhhdmlvdXI6IHNwZWNpZXMgPT09ICd0cm91dCcgPyAnc3dpbScgOiAnZ3JhemUnLCB0aW1lcjogMSArIHJuZCgpICogNCxcbiAgICAgIGdvYWxYOiB4LCBnb2FsWjogeiwgZGVwdGhQcmVmOiAwLjMgKyBybmQoKSAqIDAuNSwgc3BlZWQ6IDAsXG4gICAgICBybmc6IChybmQoKSAqIDQyOTQ5NjcyOTYpID4+PiAwLFxuICAgIH07XG4gICAgcmV0dXJuIGM7XG4gIH07XG5cbiAgLy8gRmlzaCBzY2hvb2xzIGluIGRlZXAgZW5vdWdoIHdhdGVyLlxuICBpZiAod2F0ZXIgPj0gOCAmJiBybmQoKSA8IDAuNykge1xuICAgIGNvbnN0IGN4dyA9IHd4IC8gd2F0ZXIsIGN6dyA9IHd6IC8gd2F0ZXI7XG4gICAgY29uc3QgbiA9IFNQRUNJRVMudHJvdXQuZ3JvdXBNaW4gKyBNYXRoLmZsb29yKHJuZCgpICogKFNQRUNJRVMudHJvdXQuZ3JvdXBNYXggLSBTUEVDSUVTLnRyb3V0Lmdyb3VwTWluICsgMSkpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICBjb25zdCB4ID0gY3h3ICsgKHJuZCgpIC0gMC41KSAqIDQsIHogPSBjencgKyAocm5kKCkgLSAwLjUpICogNDtcbiAgICAgIGNvbnN0IHcgPSByZXNpZGVudFdhdGVyQXQod29ybGQsIE1hdGguZmxvb3IoeCksIE1hdGguZmxvb3IoeikpO1xuICAgICAgaWYgKCF3IHx8IHcudG9wIC0gdy5iZWQgPCAxKSBjb250aW51ZTtcbiAgICAgIG91dC5wdXNoKG1ha2UoJ3Ryb3V0JywgeCwgeiwgdy5iZWQgKyAody50b3AgLSB3LmJlZCkgKiAwLjUpKTtcbiAgICB9XG4gIH1cbiAgLy8gRGVlciBhdCBmb3Jlc3QgZWRnZXMsIGhhcmVzIGluIG9wZW4gbWVhZG93LlxuICBpZiAoZ3Jhc3MubGVuZ3RoID49IDYpIHtcbiAgICBjb25zdCBzcGVjaWVzOiBTcGVjaWVzRGVmWydpZCddIHwgbnVsbCA9IHRyZWVzID49IDMgJiYgcm5kKCkgPCAwLjQyID8gJ2RlZXInXG4gICAgICA6IHRyZWVzIDw9IDIgJiYgcm5kKCkgPCAwLjQ1ID8gJ3JhYmJpdCcgOiBudWxsO1xuICAgIGlmIChzcGVjaWVzKSB7XG4gICAgICBjb25zdCBkZWYgPSBTUEVDSUVTW3NwZWNpZXNdO1xuICAgICAgY29uc3QgYXQgPSBncmFzc1tNYXRoLmZsb29yKHJuZCgpICogZ3Jhc3MubGVuZ3RoKV07XG4gICAgICBjb25zdCBuID0gZGVmLmdyb3VwTWluICsgTWF0aC5mbG9vcihybmQoKSAqIChkZWYuZ3JvdXBNYXggLSBkZWYuZ3JvdXBNaW4gKyAxKSk7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICBjb25zdCB4ID0gYXQueCArIDAuNSArIChybmQoKSAtIDAuNSkgKiA2LCB6ID0gYXQueiArIDAuNSArIChybmQoKSAtIDAuNSkgKiA2O1xuICAgICAgICBjb25zdCBoID0gbGFuZE9rKHdvcmxkLCB4LCB6KTtcbiAgICAgICAgaWYgKGggIT09IG51bGwpIG91dC5wdXNoKG1ha2Uoc3BlY2llcywgeCwgeiwgaCkpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICAvLyBQcmVkYXRvcnMgdXNlIHRoZWlyIG93biByYW5kb20gc3RyZWFtLCBzbyBhZGRpbmcgdGhlbSBuZXZlciBtb3ZlcyB0aGVcbiAgLy8gZXhpc3RpbmcgZGVlciwgaGFyZXMgYW5kIGZpc2guXG4gIGlmIChncmFzcy5sZW5ndGggPj0gNCkge1xuICAgIGNvbnN0IHIyID0gbXVsYmVycnkzMigoaGFzaDJpKGN4LCBjeiwgc2VlZCArIDc3NzIpICogNDI5NDk2NzI5NikgPj4+IDApO1xuICAgIGNvbnN0IGtpbmQ6ICd3b2xmJyB8ICdmb3gnIHwgbnVsbCA9IHRyZWVzID49IDYgJiYgcjIoKSA8IDAuMTYgPyAnd29sZicgOiB0cmVlcyA+PSAyICYmIHRyZWVzIDw9IDUgJiYgcjIoKSA8IDAuMjYgPyAnZm94JyA6IG51bGw7XG4gICAgaWYgKGtpbmQpIHtcbiAgICAgIGNvbnN0IGRlZiA9IFNQRUNJRVNba2luZF07XG4gICAgICBjb25zdCBhdCA9IGdyYXNzW01hdGguZmxvb3IocjIoKSAqIGdyYXNzLmxlbmd0aCldO1xuICAgICAgY29uc3QgbiA9IGRlZi5ncm91cE1pbiArIE1hdGguZmxvb3IocjIoKSAqIChkZWYuZ3JvdXBNYXggLSBkZWYuZ3JvdXBNaW4gKyAxKSk7XG4gICAgICBsZXQgbGVhZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICBjb25zdCB4ID0gYXQueCArIDAuNSArIChyMigpIC0gMC41KSAqIDQsIHogPSBhdC56ICsgMC41ICsgKHIyKCkgLSAwLjUpICogNDtcbiAgICAgICAgY29uc3QgaCA9IGxhbmRPayh3b3JsZCwgeCwgeik7XG4gICAgICAgIGlmIChoID09PSBudWxsKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgYzogQ3JlYXR1cmUgPSB7XG4gICAgICAgICAgaWQ6IGBmYXVuYToke2tpbmR9OiR7a2V5fToke2luZGV4Kyt9YCwgc3BlY2llczoga2luZCwgdGllcjogJ2FtYmllbnQnLCBjaHVuazoga2V5LFxuICAgICAgICAgIHgsIHk6IGgsIHosIGhlYWRpbmc6IHIyKCkgKiBNYXRoLlBJICogMiwgaG9tZVg6IHgsIGhvbWVaOiB6LCBiZWhhdmlvdXI6ICdyZXN0JywgdGltZXI6IDIgKyByMigpICogNSxcbiAgICAgICAgICBnb2FsWDogeCwgZ29hbFo6IHosIGRlcHRoUHJlZjogMCwgc3BlZWQ6IDAsIHJuZzogKHIyKCkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGtpbmQgPT09ICd3b2xmJykgeyBpZiAobGVhZGVyKSBjLmxlYWRlciA9IGxlYWRlcjsgZWxzZSBsZWFkZXIgPSBjLmlkOyB9XG4gICAgICAgIG91dC5wdXNoKGMpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBuZWFyZXN0VGhyZWF0KGM6IENyZWF0dXJlLCBjdHg6IEZhdW5hQ29udGV4dCk6IHsgZDogbnVtYmVyOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcHJlZGF0b3I/OiBib29sZWFuIH0gfCBudWxsIHtcbiAgbGV0IGJlc3Q6IHsgZDogbnVtYmVyOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcHJlZGF0b3I/OiBib29sZWFuIH0gfCBudWxsID0gbnVsbDtcbiAgZm9yIChjb25zdCB0IG9mIGN0eC50aHJlYXRzKSB7XG4gICAgY29uc3QgZCA9IE1hdGguaHlwb3QodC54IC0gYy54LCB0LnogLSBjLnopO1xuICAgIGlmICghYmVzdCB8fCBkIDwgYmVzdC5kKSBiZXN0ID0geyBkLCB4OiB0LngsIHo6IHQueiB9O1xuICB9XG4gIC8vIFByZXkgYm9sdCBmcm9tIHRoZSBwcmVkYXRvcnMgdGhhdCBodW50IHRoZW0sIGF0IHRoZWlyIG93biAoc2hvcnRlcikgYWxhcm0gZGlzdGFuY2UuXG4gIGNvbnN0IGZlYXJzID0gRkVBUlNbYy5zcGVjaWVzXTtcbiAgaWYgKGZlYXJzICYmIGN0eC5wcmVkYXRvcnMpIHtcbiAgICBmb3IgKGNvbnN0IHAgb2YgY3R4LnByZWRhdG9ycykge1xuICAgICAgaWYgKCFmZWFycy5pbmNsdWRlcyhwLnNwZWNpZXMpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGQgPSBNYXRoLmh5cG90KHAueCAtIGMueCwgcC56IC0gYy56KTtcbiAgICAgIC8vIFNjYWxlIHNvIHRoZSBjYWxsZXIncyBgZCA8IHdhcmluZXNzYCB0ZXN0IGZpcmVzIGF0IFBSRURBVE9SX0FMQVJNLlxuICAgICAgY29uc3Qgc2NhbGVkID0gZCAqIChTUEVDSUVTW2Muc3BlY2llc10ud2FyaW5lc3MgLyBQUkVEQVRPUl9BTEFSTSk7XG4gICAgICBpZiAoZCA8IFBSRURBVE9SX0FMQVJNICYmICghYmVzdCB8fCBzY2FsZWQgPCBiZXN0LmQpKSBiZXN0ID0geyBkOiBzY2FsZWQsIHg6IHAueCwgejogcC56LCBwcmVkYXRvcjogdHJ1ZSB9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuLyoqIEFkdmFuY2Ugb25lIGNyZWF0dXJlIGJ5IEZBVU5BX1NURVAuIERldGVybWluaXN0aWMgZ2l2ZW4gKHdvcmxkLCBjcmVhdHVyZSwgY29udGV4dCkuICovXG5leHBvcnQgZnVuY3Rpb24gc3RlcENyZWF0dXJlKHdvcmxkOiBXb3JsZCwgYzogQ3JlYXR1cmUsIGN0eDogRmF1bmFDb250ZXh0KTogdm9pZCB7XG4gIGNvbnN0IGRlZiA9IFNQRUNJRVNbYy5zcGVjaWVzXTtcbiAgY29uc3QgZHQgPSBGQVVOQV9TVEVQO1xuICBjb25zdCB0aHJlYXQgPSBuZWFyZXN0VGhyZWF0KGMsIGN0eCk7XG4gIGMudGltZXIgLT0gZHQ7XG5cbiAgaWYgKGRlZi5oYWJpdGF0ID09PSAnd2F0ZXInKSB7IHN0ZXBGaXNoKHdvcmxkLCBjLCBkZWYsIGN0eCwgdGhyZWF0KTsgcmV0dXJuOyB9XG5cbiAgLy8gRm94ZXMgc3RhbGsgaGFyZXMgYW5kIHBvdW5jZTsgYSBtaXNzIGVuZHMgaW4gYSByZXN0LlxuICBpZiAoYy5zcGVjaWVzID09PSAnZm94JykgZm94SHVudChjLCBkZWYsIGN0eCwgdGhyZWF0KTtcblxuICAvLyBEZWNpZGUuXG4gIGlmICh0aHJlYXQgJiYgdGhyZWF0LmQgPCBkZWYud2FyaW5lc3MgJiYgYy5iZWhhdmlvdXIgIT09ICdmbGVlJykge1xuICAgIGMuYmVoYXZpb3VyID0gJ2ZsZWUnO1xuICAgIGMudGltZXIgPSAyLjUgKyByYW5kKGMpICogMjtcbiAgfSBlbHNlIGlmIChjLmJlaGF2aW91ciA9PT0gJ3N0YWxrJyB8fCBjLmJlaGF2aW91ciA9PT0gJ2NoYXNlJykge1xuICAgIC8vIGhhbmRsZWQgYnkgZm94SHVudFxuICB9IGVsc2UgaWYgKGMubGVhZGVyICYmIGN0eC5sZWFkZXJzPy5oYXMoYy5sZWFkZXIpKSB7XG4gICAgcGFja0ZvbGxvdyhjLCBkZWYsIGN0eC5sZWFkZXJzLmdldChjLmxlYWRlcikhKTtcbiAgfSBlbHNlIGlmIChjLnRpbWVyIDw9IDApIHtcbiAgICBjb25zdCBzbGVlcHkgPSBkZWYuZGl1cm5hbCAmJiBjdHgubmlnaHQ7XG4gICAgY29uc3QgciA9IHJhbmQoYyk7XG4gICAgaWYgKHNsZWVweSkgeyBjLmJlaGF2aW91ciA9ICdzbGVlcCc7IGMudGltZXIgPSA4ICsgciAqIDEwOyB9XG4gICAgZWxzZSBpZiAociA8IDAuNDUpIHsgYy5iZWhhdmlvdXIgPSAnZ3JhemUnOyBjLnRpbWVyID0gMyArIHJhbmQoYykgKiA1OyB9XG4gICAgZWxzZSBpZiAociA8IDAuNjIpIHsgYy5iZWhhdmlvdXIgPSAncmVzdCc7IGMudGltZXIgPSA0ICsgcmFuZChjKSAqIDY7IH1cbiAgICBlbHNlIHtcbiAgICAgIGMuYmVoYXZpb3VyID0gJ3dhbmRlcic7XG4gICAgICBjLnRpbWVyID0gNjtcbiAgICAgIGNvbnN0IGEgPSByYW5kKGMpICogTWF0aC5QSSAqIDIsIGQgPSByYW5kKGMpICogZGVmLnJhbmdlO1xuICAgICAgYy5nb2FsWCA9IGMuaG9tZVggKyBNYXRoLmNvcyhhKSAqIGQ7XG4gICAgICBjLmdvYWxaID0gYy5ob21lWiArIE1hdGguc2luKGEpICogZDtcbiAgICB9XG4gIH1cblxuICAvLyBBY3QuXG4gIGxldCB0eCA9IDAsIHR6ID0gMCwgc3BlZWQgPSAwO1xuICBpZiAoYy5iZWhhdmlvdXIgPT09ICdmbGVlJyAmJiB0aHJlYXQpIHtcbiAgICBjb25zdCBkeCA9IGMueCAtIHRocmVhdC54LCBkeiA9IGMueiAtIHRocmVhdC56LCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeikgfHwgMTtcbiAgICB0eCA9IGR4IC8gbGVuOyB0eiA9IGR6IC8gbGVuOyBzcGVlZCA9IGRlZi5mbGVlU3BlZWQ7XG4gICAgaWYgKGMudGltZXIgPD0gMCkgeyBjLmJlaGF2aW91ciA9ICdpZGxlJzsgYy50aW1lciA9IDE7IGMuaG9tZVggPSBjLng7IGMuaG9tZVogPSBjLno7IH1cbiAgfSBlbHNlIGlmIChjLmJlaGF2aW91ciA9PT0gJ3N0YWxrJyB8fCBjLmJlaGF2aW91ciA9PT0gJ2NoYXNlJykge1xuICAgIGNvbnN0IGR4ID0gYy5nb2FsWCAtIGMueCwgZHogPSBjLmdvYWxaIC0gYy56LCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeikgfHwgMTtcbiAgICB0eCA9IGR4IC8gbGVuOyB0eiA9IGR6IC8gbGVuO1xuICAgIHNwZWVkID0gYy5iZWhhdmlvdXIgPT09ICdjaGFzZScgPyBkZWYuZmxlZVNwZWVkICogMC44IDogZGVmLndhbGtTcGVlZCAqIDAuNztcbiAgfSBlbHNlIGlmIChjLmJlaGF2aW91ciA9PT0gJ2ZvbGxvdycpIHtcbiAgICBjb25zdCBkeCA9IGMuZ29hbFggLSBjLngsIGR6ID0gYy5nb2FsWiAtIGMueiwgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gICAgdHggPSBkeCAvIGxlbjsgdHogPSBkeiAvIGxlbjsgc3BlZWQgPSBkZWYud2Fsa1NwZWVkICogMS40O1xuICB9IGVsc2UgaWYgKGMuYmVoYXZpb3VyID09PSAnd2FuZGVyJykge1xuICAgIGNvbnN0IGR4ID0gYy5nb2FsWCAtIGMueCwgZHogPSBjLmdvYWxaIC0gYy56LCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeik7XG4gICAgaWYgKGxlbiA8IDAuNSkgeyBjLmJlaGF2aW91ciA9ICdncmF6ZSc7IGMudGltZXIgPSAyICsgcmFuZChjKSAqIDM7IH1cbiAgICBlbHNlIHsgdHggPSBkeCAvIGxlbjsgdHogPSBkeiAvIGxlbjsgc3BlZWQgPSBkZWYud2Fsa1NwZWVkOyB9XG4gIH0gZWxzZSBpZiAoYy5iZWhhdmlvdXIgPT09ICdncmF6ZScgJiYgcmFuZChjKSA8IDAuMDQpIHtcbiAgICAvLyBTbWFsbCBzaHVmZmxlcyB3aGlsZSBncmF6aW5nLlxuICAgIGNvbnN0IGEgPSBjLmhlYWRpbmcgKyAocmFuZChjKSAtIDAuNSk7XG4gICAgdHggPSBNYXRoLnNpbihhKTsgdHogPSBNYXRoLmNvcyhhKTsgc3BlZWQgPSBkZWYud2Fsa1NwZWVkICogMC40O1xuICB9XG5cbiAgaWYgKHNwZWVkID4gMCkge1xuICAgIC8vIFN0ZWVyIGFyb3VuZCB1bnN1aXRhYmxlIGdyb3VuZCBieSBzYW1wbGluZyBhIGZhbiBvZiBoZWFkaW5ncy5cbiAgICBjb25zdCBiYXNlID0gTWF0aC5hdGFuMih0eCwgdHopO1xuICAgIGxldCBtb3ZlZCA9IGZhbHNlO1xuICAgIGZvciAoY29uc3Qgb2ZmIG9mIFswLCAwLjUsIC0wLjUsIDEuMCwgLTEuMCwgMS42LCAtMS42XSkge1xuICAgICAgY29uc3QgYSA9IGJhc2UgKyBvZmY7XG4gICAgICBjb25zdCBueCA9IGMueCArIE1hdGguc2luKGEpICogc3BlZWQgKiBkdCwgbnogPSBjLnogKyBNYXRoLmNvcyhhKSAqIHNwZWVkICogZHQ7XG4gICAgICBjb25zdCBoID0gbGFuZE9rKHdvcmxkLCBueCwgbnosIDEpO1xuICAgICAgaWYgKGggPT09IG51bGwpIGNvbnRpbnVlO1xuICAgICAgYy54ID0gbng7IGMueiA9IG56OyBjLnkgPSBoO1xuICAgICAgYy5oZWFkaW5nID0gdHVybihjLmhlYWRpbmcsIGEsIDggKiBkdCk7XG4gICAgICBtb3ZlZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgaWYgKCFtb3ZlZCAmJiBjLmJlaGF2aW91ciA9PT0gJ3dhbmRlcicpIHsgYy5iZWhhdmlvdXIgPSAnaWRsZSc7IGMudGltZXIgPSAxOyB9XG4gICAgYy5zcGVlZCA9IG1vdmVkID8gc3BlZWQgOiAwO1xuICB9IGVsc2Uge1xuICAgIGMuc3BlZWQgPSAwO1xuICB9XG59XG5cbi8qKiBGb3g6IG5vdGljZSBhIGhhcmUsIGNyZWVwIHVwLCBwb3VuY2U7IGdpdmUgdXAgKHJlc3QpIHdoZW4gaXQgZXNjYXBlcyBvciB0aGUgdGltZXIgZW5kcy4gKi9cbmZ1bmN0aW9uIGZveEh1bnQoYzogQ3JlYXR1cmUsIGRlZjogU3BlY2llc0RlZiwgY3R4OiBGYXVuYUNvbnRleHQsIHRocmVhdDogeyBkOiBudW1iZXIgfSB8IG51bGwpOiB2b2lkIHtcbiAgaWYgKGN0eC5uaWdodCA9PT0gZmFsc2UgJiYgYy5iZWhhdmlvdXIgPT09ICdzbGVlcCcpIHJldHVybjtcbiAgaWYgKGMuYmVoYXZpb3VyID09PSAnc3RhbGsnIHx8IGMuYmVoYXZpb3VyID09PSAnY2hhc2UnKSB7XG4gICAgbGV0IGJlc3Q6IHsgZDogbnVtYmVyOyB4OiBudW1iZXI7IHo6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG4gICAgZm9yIChjb25zdCBwIG9mIGN0eC5wcmV5ID8/IFtdKSB7XG4gICAgICBjb25zdCBkID0gTWF0aC5oeXBvdChwLnggLSBjLngsIHAueiAtIGMueik7XG4gICAgICBpZiAoIWJlc3QgfHwgZCA8IGJlc3QuZCkgYmVzdCA9IHsgZCwgeDogcC54LCB6OiBwLnogfTtcbiAgICB9XG4gICAgaWYgKCFiZXN0IHx8IGJlc3QuZCA+IDIwIHx8IGMudGltZXIgPD0gMCB8fCAodGhyZWF0ICYmIHRocmVhdC5kIDwgZGVmLndhcmluZXNzICogMC41KSkge1xuICAgICAgYy5iZWhhdmlvdXIgPSAncmVzdCc7IGMudGltZXIgPSA0ICsgcmFuZChjKSAqIDQ7IHJldHVybjtcbiAgICB9XG4gICAgYy5nb2FsWCA9IGJlc3QueDsgYy5nb2FsWiA9IGJlc3QuejtcbiAgICBpZiAoYy5iZWhhdmlvdXIgPT09ICdzdGFsaycgJiYgYmVzdC5kIDwgMy41KSB7IGMuYmVoYXZpb3VyID0gJ2NoYXNlJzsgYy50aW1lciA9IDI7IH1cbiAgICBpZiAoYy5iZWhhdmlvdXIgPT09ICdjaGFzZScgJiYgYmVzdC5kIDwgMC42KSB7IGMuYmVoYXZpb3VyID0gJ3Jlc3QnOyBjLnRpbWVyID0gNjsgfSAgIC8vIGEgbmVhciBtaXNzOiB0aGUgaGFyZSBpcyBnb25lXG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChjLnRpbWVyIDw9IDAgJiYgY3R4LnByZXkgJiYgISh0aHJlYXQgJiYgdGhyZWF0LmQgPCBkZWYud2FyaW5lc3MpKSB7XG4gICAgZm9yIChjb25zdCBwIG9mIGN0eC5wcmV5KSB7XG4gICAgICBpZiAoTWF0aC5oeXBvdChwLnggLSBjLngsIHAueiAtIGMueikgPCAxMyAmJiByYW5kKGMpIDwgMC42KSB7XG4gICAgICAgIGMuYmVoYXZpb3VyID0gJ3N0YWxrJzsgYy50aW1lciA9IDEyOyBjLmdvYWxYID0gcC54OyBjLmdvYWxaID0gcC56OyByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbi8qKiBQYWNrIG1lbWJlcjogc3RheSB3aXRoIHRoZSBsZWFkZXI7IHdoZW4gdGhlIGxlYWRlciByZXN0cyBvciBncmF6ZXMsIHNvIGRvIHRoZXkuICovXG5mdW5jdGlvbiBwYWNrRm9sbG93KGM6IENyZWF0dXJlLCBkZWY6IFNwZWNpZXNEZWYsIGxlYWRlcjogQ3JlYXR1cmUpOiB2b2lkIHtcbiAgY29uc3QgZCA9IE1hdGguaHlwb3QobGVhZGVyLnggLSBjLngsIGxlYWRlci56IC0gYy56KTtcbiAgaWYgKGQgPiA1KSB7XG4gICAgYy5iZWhhdmlvdXIgPSAnZm9sbG93JztcbiAgICBjb25zdCBhID0gcmFuZChjKSAqIE1hdGguUEkgKiAyO1xuICAgIGMuZ29hbFggPSBsZWFkZXIueCArIE1hdGguY29zKGEpICogMzsgYy5nb2FsWiA9IGxlYWRlci56ICsgTWF0aC5zaW4oYSkgKiAzO1xuICAgIGMudGltZXIgPSAxO1xuICB9IGVsc2UgaWYgKGMuYmVoYXZpb3VyID09PSAnZm9sbG93JyB8fCBjLnRpbWVyIDw9IDApIHtcbiAgICBjb25zdCBjYWxtID0gbGVhZGVyLmJlaGF2aW91ciA9PT0gJ3Jlc3QnIHx8IGxlYWRlci5iZWhhdmlvdXIgPT09ICdzbGVlcCcgfHwgbGVhZGVyLmJlaGF2aW91ciA9PT0gJ2dyYXplJyB8fCBsZWFkZXIuYmVoYXZpb3VyID09PSAnaWRsZSc7XG4gICAgYy5iZWhhdmlvdXIgPSBjYWxtID8gKGxlYWRlci5iZWhhdmlvdXIgPT09ICdzbGVlcCcgPyAnc2xlZXAnIDogJ3Jlc3QnKSA6ICd3YW5kZXInO1xuICAgIGMudGltZXIgPSAzICsgcmFuZChjKSAqIDQ7XG4gICAgYy5nb2FsWCA9IGxlYWRlci54ICsgKHJhbmQoYykgLSAwLjUpICogODsgYy5nb2FsWiA9IGxlYWRlci56ICsgKHJhbmQoYykgLSAwLjUpICogODtcbiAgfVxuICB2b2lkIGRlZjtcbn1cblxuZnVuY3Rpb24gc3RlcEZpc2god29ybGQ6IFdvcmxkLCBjOiBDcmVhdHVyZSwgZGVmOiBTcGVjaWVzRGVmLCBjdHg6IEZhdW5hQ29udGV4dCxcbiAgdGhyZWF0OiB7IGQ6IG51bWJlcjsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB8IG51bGwpOiB2b2lkIHtcbiAgY29uc3QgZHQgPSBGQVVOQV9TVEVQO1xuICBjb25zdCBoeWRybyA9IGh5ZHJvbG9neUZvcih3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbik7XG4gIGlmICh0aHJlYXQgJiYgdGhyZWF0LmQgPCBkZWYud2FyaW5lc3MpIHsgYy5iZWhhdmlvdXIgPSAnc2NhdHRlcic7IGMudGltZXIgPSAxLjUgKyByYW5kKGMpOyB9XG4gIGVsc2UgaWYgKGMudGltZXIgPD0gMCkge1xuICAgIGMuYmVoYXZpb3VyID0gJ3N3aW0nO1xuICAgIGMudGltZXIgPSAyICsgcmFuZChjKSAqIDM7XG4gICAgY29uc3QgYSA9IHJhbmQoYykgKiBNYXRoLlBJICogMiwgZCA9IHJhbmQoYykgKiBkZWYucmFuZ2U7XG4gICAgYy5nb2FsWCA9IGMuaG9tZVggKyBNYXRoLmNvcyhhKSAqIGQ7XG4gICAgYy5nb2FsWiA9IGMuaG9tZVogKyBNYXRoLnNpbihhKSAqIGQ7XG4gICAgYy5kZXB0aFByZWYgPSAwLjI1ICsgcmFuZChjKSAqIDAuNTU7XG4gIH1cbiAgbGV0IHR4OiBudW1iZXIsIHR6OiBudW1iZXIsIHNwZWVkOiBudW1iZXI7XG4gIGlmIChjLmJlaGF2aW91ciA9PT0gJ3NjYXR0ZXInICYmIHRocmVhdCkge1xuICAgIGNvbnN0IGR4ID0gYy54IC0gdGhyZWF0LngsIGR6ID0gYy56IC0gdGhyZWF0LnosIGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KSB8fCAxO1xuICAgIHR4ID0gZHggLyBsZW47IHR6ID0gZHogLyBsZW47IHNwZWVkID0gZGVmLmZsZWVTcGVlZDtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBkeCA9IGMuZ29hbFggLSBjLngsIGR6ID0gYy5nb2FsWiAtIGMueiwgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gICAgdHggPSBkeCAvIGxlbjsgdHogPSBkeiAvIGxlbjsgc3BlZWQgPSBsZW4gPCAwLjQgPyAwIDogZGVmLndhbGtTcGVlZDtcbiAgICAvLyBUcm91dCBob2xkIHBvc2l0aW9uIGFnYWluc3QgdGhlIGN1cnJlbnQ6IGZhY2UgdXBzdHJlYW0sIGRyaWZ0IHNsaWdodGx5LlxuICAgIGNvbnN0IHcgPSByZXNpZGVudFdhdGVyQXQod29ybGQsIE1hdGguZmxvb3IoYy54KSwgTWF0aC5mbG9vcihjLnopKTtcbiAgICBpZiAodykge1xuICAgICAgY29uc3QgZiA9IGh5ZHJvLmZsb3dBdChjLngsIGMueiwgdy50b3ApO1xuICAgICAgaWYgKGYuc3BlZWQgPiAwLjIpIHsgdHggPSB0eCAqIDAuNSAtIGYuZHggKiAwLjU7IHR6ID0gdHogKiAwLjUgLSBmLmR6ICogMC41OyB9XG4gICAgfVxuICB9XG4gIGNvbnN0IGJhc2UgPSBNYXRoLmF0YW4yKHR4LCB0eik7XG4gIGxldCBtb3ZlZCA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IG9mZiBvZiBbMCwgMC42LCAtMC42LCAxLjMsIC0xLjMsIDIuMiwgLTIuMl0pIHtcbiAgICBjb25zdCBhID0gYmFzZSArIG9mZjtcbiAgICBjb25zdCBueCA9IGMueCArIE1hdGguc2luKGEpICogc3BlZWQgKiBkdCwgbnogPSBjLnogKyBNYXRoLmNvcyhhKSAqIHNwZWVkICogZHQ7XG4gICAgY29uc3QgdyA9IHJlc2lkZW50V2F0ZXJBdCh3b3JsZCwgTWF0aC5mbG9vcihueCksIE1hdGguZmxvb3IobnopKTtcbiAgICBpZiAoIXcgfHwgdy50b3AgLSB3LmJlZCA8IDAuOCkgY29udGludWU7XG4gICAgYy54ID0gbng7IGMueiA9IG56O1xuICAgIGNvbnN0IGdvYWxZID0gdy50b3AgLSAwLjM1IC0gKHcudG9wIC0gdy5iZWQgLSAwLjcpICogYy5kZXB0aFByZWY7XG4gICAgYy55ICs9IChnb2FsWSAtIGMueSkgKiBNYXRoLm1pbigxLCAzICogZHQpO1xuICAgIGMueSA9IE1hdGgubWluKHcudG9wIC0gMC4yNSwgTWF0aC5tYXgody5iZWQgKyAwLjIsIGMueSkpO1xuICAgIGMuaGVhZGluZyA9IHR1cm4oYy5oZWFkaW5nLCBhLCA2ICogZHQpO1xuICAgIG1vdmVkID0gdHJ1ZTtcbiAgICBicmVhaztcbiAgfVxuICBjLnNwZWVkID0gbW92ZWQgPyBzcGVlZCA6IDA7XG4gIGlmICghbW92ZWQpIHsgYy5nb2FsWCA9IGMuaG9tZVg7IGMuZ29hbFogPSBjLmhvbWVaOyB9XG4gIHZvaWQgY3R4O1xufVxuXG5mdW5jdGlvbiB0dXJuKGZyb206IG51bWJlciwgdG86IG51bWJlciwgcmF0ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGQgPSB0byAtIGZyb207XG4gIHdoaWxlIChkID4gTWF0aC5QSSkgZCAtPSBNYXRoLlBJICogMjtcbiAgd2hpbGUgKGQgPCAtTWF0aC5QSSkgZCArPSBNYXRoLlBJICogMjtcbiAgcmV0dXJuIGZyb20gKyBkICogTWF0aC5taW4oMSwgcmF0ZSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTs7O0FDT25CLElBQU0sU0FBUyxvQkFBSSxRQUE2QjtBQWV6QyxTQUFTLGNBQWMsT0FBd0I7QUFDcEQsU0FBTyxPQUFPLElBQUksS0FBSyxHQUFHLFVBQVU7QUFDdEM7OztBQ3RCTyxJQUFNLFFBQVEsQ0FBQyxHQUFXLEdBQVcsTUFBZSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksSUFBSTtBQUM1RSxJQUFNLE9BQU8sQ0FBQyxHQUFXLEdBQVcsTUFBYyxLQUFLLElBQUksS0FBSztBQUNoRSxJQUFNLGFBQWEsQ0FBQyxJQUFZLElBQVksTUFBYztBQUMvRCxRQUFNLElBQUksT0FBTyxJQUFJLE9BQU8sS0FBSyxLQUFLLEdBQUcsQ0FBQztBQUMxQyxTQUFPLElBQUksS0FBSyxJQUFJLElBQUk7QUFDMUI7QUFHTyxTQUFTLE9BQU8sR0FBVyxHQUFXLE1BQXNCO0FBQ2pFLE1BQUksSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FBRyxTQUFTO0FBQy9ELE1BQUksS0FBSyxLQUFLLElBQUssTUFBTSxJQUFLLFVBQVU7QUFDeEMsV0FBUyxJQUFLLE1BQU0sUUFBUyxLQUFLO0FBQ3BDO0FBRU8sU0FBUyxPQUFPLEdBQVcsR0FBVyxHQUFXLE1BQXNCO0FBQzVFLE1BQUksSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FBRyxTQUFTLElBQUksS0FBSyxLQUFLLEdBQUcsVUFBVTtBQUMxRixNQUFJLEtBQUssS0FBSyxJQUFLLE1BQU0sSUFBSyxVQUFV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
