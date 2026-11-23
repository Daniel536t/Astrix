// tests/m002.structures.test.ts
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
          const m = getVoxel(this.world, x, y, z);
          if (m !== MAT.AIR) overhangCells.push({ x, y, z, material: m });
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
function materialName(m) {
  return MATERIAL_NAMES[m] ?? `mat_${m}`;
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
  for (const m of plan.modules) {
    lines.push(`m:${m.kind},${m.x},${m.y},${m.z},${m.w},${m.h},${m.d},${m.rot ?? 0},${m.tone ?? ""}`);
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
function moduleBounds(m) {
  const r = Math.hypot(m.w, m.d) / 2;
  const halfW = (m.rot ?? 0) === 0 ? m.w / 2 : r;
  const halfD = (m.rot ?? 0) === 0 ? m.d / 2 : r;
  return {
    x0: m.x - halfW,
    x1: m.x + halfW,
    y0: m.y,
    y1: m.y + m.h,
    z0: m.z - halfD,
    z1: m.z + halfD
  };
}
function moduleInsideEnvelope(m, envelope) {
  const b = moduleBounds(m);
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
      (m) => `column ${m.x},${m.z} is at ${m.actual}, expected ${m.expected}`
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
      (m) => `column ${m.x},${m.z} is at ${m.actual}, expected ${m.expected}`
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
      (m) => `column ${m.x},${m.z} is at ${m.actual}, expected ${m.expected}`
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
  const heights = planned.plan.modules.filter((m) => m.kind === "path").map((m) => m.y);
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
    for (const m of plan.modules) {
      if (!moduleInsideEnvelope(m, plan.envelope)) {
        reasons.push(`module ${m.kind} at ${m.x},${m.y},${m.z} is outside the plan envelope`);
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
  for (const m of plan.modules) {
    if (!moduleInsideEnvelope(m, authorization.envelope)) {
      reasons.push(`module ${m.kind} at ${m.x},${m.y},${m.z} is outside the authorized envelope`);
    }
  }
  const mismatches = surfaceMismatches(world, plan.surface);
  if (mismatches.length > 0) {
    reasons.push(...mismatches.slice(0, 4).map(
      (m) => `column ${m.x},${m.z} is at ${m.actual}, expected ${m.expected}`
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
    modules: plan.modules.map((m) => ({ ...m })),
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
    for (const m of s.modules) {
      h.string(m.kind);
      h.u32(Math.round(m.x * 1e3));
      h.u32(Math.round(m.y * 1e3));
      h.u32(Math.round(m.z * 1e3));
      h.u32(Math.round(m.w * 1e3));
      h.u32(Math.round(m.h * 1e3));
      h.u32(Math.round(m.d * 1e3));
      h.u32(Math.round((m.rot ?? 0) * 1e4));
      h.string(m.tone ?? "");
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
function checkDerivedCaches(world, region, limit = 64) {
  const r = clampRegion(region);
  const keys = ensureRegionChunks(world, r);
  const out = [];
  for (const key of keys) {
    const chunk = world.chunks.get(key);
    if (!chunk) continue;
    const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
    const lx0 = Math.max(0, r.x0 - ox), lx1 = Math.min(CHUNK_SIZE - 1, r.x1 - ox);
    const lz0 = Math.max(0, r.z0 - oz), lz1 = Math.min(CHUNK_SIZE - 1, r.z1 - oz);
    for (let lz = lz0; lz <= lz1; lz++) {
      for (let lx = lx0; lx <= lx1; lx++) {
        const col = lz * CHUNK_SIZE + lx;
        let topSolid = Y_MIN;
        let topMat = chunk.topMaterials[col];
        for (let y = Y_MAX - 1; y >= Y_MIN; y--) {
          const m = chunk.data[localIndex(lx, yToIndex(y), lz)];
          if (isSolid(m)) {
            topSolid = y;
            topMat = m;
            break;
          }
        }
        const expectedHeight = topSolid - Y_MIN;
        if (chunk.heights[col] !== expectedHeight) {
          out.push({ x: ox + lx, z: oz + lz, field: "height", expected: expectedHeight, actual: chunk.heights[col] });
        }
        if (chunk.topMaterials[col] !== topMat) {
          out.push({ x: ox + lx, z: oz + lz, field: "material", expected: topMat, actual: chunk.topMaterials[col] });
        }
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
function editsOutsideEnvelope(world, envelope) {
  const out = [];
  for (const [key, edits] of world.edits) {
    const [cx, cz] = key.split(",").map(Number);
    const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
    for (const [index, material] of edits) {
      const lx = index % CHUNK_SIZE;
      const lz = Math.floor(index % CHUNK_AREA / CHUNK_SIZE);
      const yi = Math.floor(index / CHUNK_AREA);
      const x = ox + lx, z = oz + lz, y = Y_MIN + yi;
      if (!envelopeContains(envelope, x, y, z)) {
        out.push({ chunk: key, index, x, y, z, material });
      }
    }
  }
  out.sort((a, b) => a.chunk.localeCompare(b.chunk) || a.index - b.index);
  return out;
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
function emptySite() {
  return { preparation: null, structure: null };
}
function describeFailure(result) {
  return `${result.code}: ${result.reasons.join("; ")}`;
}
function runM002Scenario(m002, options = {}) {
  const { world, layout } = m002;
  const starter = options.inventory ?? M002_STARTER_INVENTORY;
  world.inventory = {};
  for (const [resource, amount] of Object.entries(starter)) {
    if ((amount ?? 0) > 0) world.inventory[resource] = amount;
  }
  const prepAuthorizer2 = new LocalAuthorizer({ envelope: layout.envelope });
  const structureAuthorizer2 = new LocalStructureAuthorizer({ envelope: layout.envelope });
  const inventoryBefore = inventorySnapshot(world);
  const errors = [];
  const house = emptySite();
  const path = emptySite();
  const farm = emptySite();
  const housePrep = prepareSite(world, prepAuthorizer2, {
    siteId: layout.house.id,
    rect: layout.house.rect,
    floorY: layout.house.floorY,
    rules: HOUSE_RULES
  });
  if (!housePrep.ok) {
    errors.push(`house preparation: ${describeFailure(housePrep)}`);
  } else {
    house.preparation = housePrep.ledger;
    const houseBuild = buildStructure(world, structureAuthorizer2, {
      siteId: layout.house.id,
      kind: "house",
      rect: layout.house.rect,
      floorY: layout.house.floorY,
      door: layout.house.door
    });
    if (!houseBuild.ok) {
      errors.push(`house structure: ${describeFailure(houseBuild)}`);
    } else {
      house.structure = houseBuild.ledger;
    }
  }
  const pathRect = m002PathRect();
  const pathPrep = prepareSite(world, prepAuthorizer2, {
    siteId: M002_PATH_SITE_ID,
    rect: pathRect,
    floorY: 12,
    rules: PATH_RULES
  }, {
    targets: m002PathTargets(),
    surfaceMaterial: MAT.GRAVEL,
    envelope: [layout.envelope[1]]
  });
  if (!pathPrep.ok) {
    errors.push(`path preparation: ${describeFailure(pathPrep)}`);
  } else {
    path.preparation = pathPrep.ledger;
    const pathBuild = buildStructure(world, structureAuthorizer2, {
      siteId: M002_PATH_SITE_ID,
      kind: "path",
      rect: pathRect,
      floorY: 12
    });
    if (!pathBuild.ok) {
      errors.push(`path structure: ${describeFailure(pathBuild)}`);
    } else {
      path.structure = pathBuild.ledger;
    }
  }
  const farmPrep = prepareSite(world, prepAuthorizer2, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  }, {
    targets: m002FarmTargets(),
    surfaceMaterial: MAT.SOIL,
    envelope: [layout.envelope[2]]
  });
  if (!farmPrep.ok) {
    errors.push(`farm preparation: ${describeFailure(farmPrep)}`);
  } else {
    farm.preparation = farmPrep.ledger;
    const farmBuild = buildStructure(world, structureAuthorizer2, {
      siteId: layout.farm.id,
      kind: "terrace",
      rect: layout.farm.rect,
      floorY: 15,
      terraces: layout.farm.terraces
    });
    if (!farmBuild.ok) {
      errors.push(`farm structure: ${describeFailure(farmBuild)}`);
    } else {
      farm.structure = farmBuild.ledger;
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    house,
    path,
    farm,
    inventoryBefore,
    inventoryAfter: inventorySnapshot(world),
    hashes: {
      voxels: canonicalRegionHash(world, layout.protectedRegion).hash,
      structures: canonicalStructureHash(world),
      inventory: canonicalInventoryHash(world),
      entities: canonicalEntityHash(world, layout.protectedRegion)
    }
  };
}
function m002StructureCosts(result) {
  const total = {};
  for (const site of [result.house, result.path, result.farm]) {
    for (const [resource, amount] of Object.entries(site.structure?.costPaid ?? {})) {
      total[resource] = (total[resource] ?? 0) + (amount ?? 0);
    }
  }
  return total;
}

// tests/m002.structures.test.ts
function fixture() {
  const m = createM002Fixture();
  m.world.inventory = { ...M002_STARTER_INVENTORY };
  return m;
}
function prepAuthorizer() {
  return new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
}
function structureAuthorizer() {
  return new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope });
}
function fingerprint(world) {
  return {
    revision: world.revision,
    voxels: canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash,
    structures: canonicalStructureHash(world),
    inventory: canonicalInventoryHash(world),
    entities: canonicalEntityHash(world, M002_LAYOUT.protectedRegion)
  };
}
function prepareHouse(m) {
  const result = prepareSite(m.world, prepAuthorizer(), {
    siteId: m.layout.house.id,
    rect: m.layout.house.rect,
    floorY: m.layout.house.floorY,
    rules: HOUSE_RULES
  });
  assert.equal(result.ok, true, result.ok ? "" : result.reasons.join("; "));
  if (!result.ok) throw new Error("house preparation failed");
  return result;
}
function preparePath(m, gravel) {
  const result = prepareSite(m.world, prepAuthorizer(), {
    siteId: M002_PATH_SITE_ID,
    rect: m002PathRect(),
    floorY: 12,
    rules: PATH_RULES
  }, {
    targets: m002PathTargets(),
    surfaceMaterial: gravel ? MAT.GRAVEL : void 0,
    envelope: [m.layout.envelope[1]]
  });
  assert.equal(result.ok, true, result.ok ? "" : result.reasons.join("; "));
  if (!result.ok) throw new Error("path preparation failed");
  return result;
}
function prepareFarm(m, soil) {
  const result = prepareSite(m.world, prepAuthorizer(), {
    siteId: m.layout.farm.id,
    rect: m.layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  }, {
    targets: m002FarmTargets(),
    surfaceMaterial: soil ? MAT.SOIL : void 0,
    envelope: [m.layout.envelope[2]]
  });
  assert.equal(result.ok, true, result.ok ? "" : result.reasons.join("; "));
  if (!result.ok) throw new Error("farm preparation failed");
  return result;
}
function houseProposal(m) {
  return {
    siteId: m.layout.house.id,
    kind: "house",
    rect: m.layout.house.rect,
    floorY: m.layout.house.floorY,
    door: m.layout.house.door
  };
}
function pathProposal(m) {
  return {
    siteId: M002_PATH_SITE_ID,
    kind: "path",
    rect: m002PathRect(),
    floorY: 12
  };
}
function farmProposal(m) {
  return {
    siteId: m.layout.farm.id,
    kind: "terrace",
    rect: m.layout.farm.rect,
    floorY: 15,
    terraces: m.layout.farm.terraces
  };
}
test("structure plans refuse unprepared ground and wrong surface materials", () => {
  const m = fixture();
  const before = fingerprint(m.world);
  const rawHouse = planStructure(m.world, houseProposal(m));
  assert.equal(rawHouse.ok, false);
  if (!rawHouse.ok) {
    assert.equal(rawHouse.stage, "plan");
    assert.equal(rawHouse.code, "site_not_prepared");
    assert.ok(rawHouse.reasons.length >= 1);
  }
  const rawFarm = planStructure(m.world, farmProposal(m));
  assert.equal(rawFarm.ok, false);
  if (!rawFarm.ok) {
    assert.equal(rawFarm.code, "terrace_earthwork");
    assert.ok(rawFarm.reasons[0].includes("cut 108"));
  }
  assert.deepEqual(fingerprint(m.world), before);
  assert.equal(m.world.structures.size, 0);
  const pathPrep = preparePath(m, false);
  assert.equal(pathPrep.ledger.cutVolume, 13);
  assert.equal(pathPrep.ledger.surfaceEdits, 0);
  const grassPath = planStructure(m.world, pathProposal(m));
  assert.equal(grassPath.ok, false);
  if (!grassPath.ok) {
    assert.equal(grassPath.code, "path_surface");
    assert.ok(grassPath.reasons[0].includes("expected gravel"));
  }
  const farmPrep = prepareFarm(m, false);
  assert.equal(farmPrep.ledger.cutVolume, 40);
  assert.equal(farmPrep.ledger.fillVolume, 33);
  assert.equal(farmPrep.ledger.surfaceEdits, 0);
  const grassFarm = planStructure(m.world, farmProposal(m));
  assert.equal(grassFarm.ok, false);
  if (!grassFarm.ok) {
    assert.equal(grassFarm.code, "terrace_surface");
    assert.ok(grassFarm.reasons[0].includes("expected soil"));
  }
  assert.equal(canonicalStructureHash(m.world), before.structures);
  assert.equal(m.world.structures.size, 0);
});
test("house build pays its exact cost and changes no terrain voxels", () => {
  const m = fixture();
  const prep2 = prepareHouse(m);
  assert.equal(prep2.ledger.cutVolume, 3);
  assert.equal(prep2.ledger.fillVolume, 18);
  assert.equal(prep2.ledger.voxelEdits, 21);
  const world = m.world;
  const before = fingerprint(world);
  const planned = planStructure(world, houseProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;
  assert.equal(plan.modules.length, 17);
  assert.deepEqual(plan.cost, { wood: 10, stone: 18 });
  assert.deepEqual(plan.origin, { x: -56, y: 11, z: -43 });
  assert.equal(plan.surface.length, 48);
  assert.equal(plan.modules.filter((mod) => mod.kind === "floor").length, 1);
  assert.equal(plan.modules.filter((mod) => mod.kind === "roof").length, 1);
  assert.equal(plan.modules.filter((mod) => mod.kind === "door").length, 2);
  assert.equal(plan.modules.filter((mod) => mod.kind === "window").length, 2);
  const decision = structureAuthorizer().authorize(world, plan);
  assert.equal(decision.ok, true, decision.reasons.join("; "));
  if (!decision.ok || !decision.authorization) return;
  assert.equal(decision.authorization.authority, "local-stub");
  assert.equal(decision.authorization.enforcement, "local-simulation-only");
  assert.equal(decision.authorization.planDigest, structureDigest(plan));
  const result = executeStructure(world, plan, decision.authorization);
  assert.equal(result.ok, true, result.ok ? "" : result.reasons.join("; "));
  if (!result.ok) return;
  const { ledger } = result;
  assert.equal(ledger.kind, "house");
  assert.equal(ledger.moduleCount, 17);
  assert.deepEqual(ledger.costPaid, { wood: 10, stone: 18 });
  assert.deepEqual(ledger.inventoryBefore, { stone: 48, wood: 24 });
  assert.deepEqual(ledger.inventoryAfter, { stone: 30, wood: 14 });
  assert.equal(ledger.revisionAfter, ledger.revisionBefore + 1);
  const after = fingerprint(world);
  assert.equal(after.voxels, before.voxels, "structure build must not edit voxels");
  assert.equal(after.entities, before.entities);
  assert.notEqual(after.inventory, before.inventory);
  assert.notEqual(after.structures, before.structures);
  assert.equal(world.structures.size, 1);
  const stored = world.structures.get(plan.id);
  assert.ok(stored);
  assert.equal(stored.kind, "house");
  assert.equal(stored.modules.length, 17);
  assert.equal(stored.builtRevision, world.revision);
  assert.equal(stored.provisional, true);
  const replay = buildStructure(world, structureAuthorizer(), houseProposal(m));
  assert.equal(replay.ok, false);
  if (!replay.ok) {
    assert.equal(replay.code, "unauthorized_structure");
    assert.ok(replay.reasons.some((r) => r.includes("already exists")));
  }
  assert.deepEqual(fingerprint(world), after);
});
test("path preparation uses its exact envelope and requires a gravel top", () => {
  const m = fixture();
  const world = m.world;
  assert.deepEqual(m002PathRect(), { x0: -53, z0: -44, x1: -45, z1: -42 });
  const implicit = prepareSite(world, prepAuthorizer(), {
    siteId: M002_PATH_SITE_ID,
    rect: m002PathRect(),
    floorY: 12,
    rules: PATH_RULES
  }, { targets: m002PathTargets(), surfaceMaterial: MAT.GRAVEL });
  assert.equal(implicit.ok, false);
  if (!implicit.ok) {
    assert.equal(implicit.stage, "authorize");
    assert.equal(implicit.code, "not_authorized");
    assert.ok(implicit.reasons.some((r) => r.includes("outside the local policy")));
  }
  prepareHouse(m);
  const outsideBefore = canonicalRegionHash(
    world,
    M002_LAYOUT.protectedRegion,
    [M002_LAYOUT.envelope[1]]
  ).hash;
  const prep2 = preparePath(m, true);
  assert.equal(prep2.plan.envelope.length, 1);
  assert.deepEqual(prep2.plan.envelope[0], M002_LAYOUT.envelope[1]);
  assert.equal(prep2.ledger.cutVolume, 12);
  assert.equal(prep2.ledger.fillVolume, 0);
  assert.equal(prep2.ledger.voxelEdits, 39);
  assert.equal(prep2.ledger.surfaceEdits, 27);
  assert.deepEqual(prep2.ledger.resourcesGained, {});
  for (let i = 0; i < M002_PATH_PROFILE.length; i++) {
    for (let z = -44; z <= -42; z++) {
      const x = -53 + i;
      assert.equal(surfaceAt(world, x, z), M002_PATH_PROFILE[i], `column ${x},${z}`);
      assert.equal(topMaterialAtWorld(world, x, z), MAT.GRAVEL, `top ${x},${z}`);
    }
  }
  assert.equal(
    canonicalRegionHash(world, M002_LAYOUT.protectedRegion, [M002_LAYOUT.envelope[1]]).hash,
    outsideBefore,
    "path preparation must stay inside its exact envelope"
  );
  const planned = planStructure(world, pathProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;
  assert.equal(plan.modules.length, 27);
  assert.deepEqual(plan.cost, { stone: 9 });
  const pathModules = plan.modules.filter((mod) => mod.kind === "path");
  assert.equal(pathModules.length, 9);
  assert.deepEqual(pathModules.map((mod) => mod.y), [...M002_PATH_PROFILE]);
  for (let i = 1; i < pathModules.length; i++) {
    assert.ok(Math.abs(pathModules[i].y - pathModules[i - 1].y) <= 1);
  }
  assert.equal(plan.modules.filter((mod) => mod.kind === "curb").length, 18);
  const beforeBuild = fingerprint(world);
  const built = buildStructure(world, structureAuthorizer(), pathProposal(m));
  assert.equal(built.ok, true, built.ok ? "" : built.reasons.join("; "));
  if (!built.ok) return;
  assert.equal(built.ledger.moduleCount, 27);
  assert.deepEqual(built.ledger.costPaid, { stone: 9 });
  assert.equal(built.ledger.inventoryBefore.stone, 48);
  assert.equal(built.ledger.inventoryAfter.stone, 39);
  const afterBuild = fingerprint(world);
  assert.equal(afterBuild.voxels, beforeBuild.voxels);
  assert.equal(afterBuild.entities, beforeBuild.entities);
  assert.notEqual(afterBuild.inventory, beforeBuild.inventory);
  assert.equal(world.structures.get(plan.id)?.kind, "path");
  assert.deepEqual(editsOutsideEnvelope(world, M002_LAYOUT.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, M002_LAYOUT.protectedRegion), []);
});
test("terraces plan from pinned bands, require soil, and pay exact costs", () => {
  const m = fixture();
  const world = m.world;
  const outsideBefore = canonicalRegionHash(
    world,
    M002_LAYOUT.protectedRegion,
    [M002_LAYOUT.envelope[2]]
  ).hash;
  const prep2 = prepareFarm(m, true);
  assert.equal(prep2.ledger.cutVolume, 40);
  assert.equal(prep2.ledger.fillVolume, 33);
  assert.equal(prep2.ledger.voxelEdits, 107);
  assert.equal(prep2.ledger.surfaceEdits, 34);
  assert.deepEqual(prep2.ledger.entitiesCleared.map((e) => e.entityId), [
    "hero:styl_ore:-38:-42",
    "hero:styl_tree_blossom:-28:-38"
  ]);
  assert.deepEqual(prep2.ledger.resourcesGained, { ore: 8, wood: 12 });
  assert.deepEqual(prep2.ledger.inventoryAfter, { ore: 8, stone: 48, wood: 36 });
  assert.equal(
    canonicalRegionHash(world, M002_LAYOUT.protectedRegion, [M002_LAYOUT.envelope[2]]).hash,
    outsideBefore,
    "farm preparation must stay inside its exact envelope"
  );
  for (const band of M002_TERRACE_BANDS) {
    for (let z = band.z0; z <= band.z1; z++) {
      for (let x = m.layout.farm.rect.x0; x <= m.layout.farm.rect.x1; x++) {
        assert.equal(surfaceAt(world, x, z), band.y, `column ${x},${z}`);
        assert.equal(topMaterialAtWorld(world, x, z), MAT.SOIL, `top ${x},${z}`);
      }
    }
  }
  const planned = planStructure(world, farmProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;
  assert.equal(plan.modules.length, 14);
  assert.deepEqual(plan.cost, { wood: 6, stone: 12 });
  assert.deepEqual(plan.terraces, M002_TERRACE_BANDS);
  assert.deepEqual(plan.envelope, [
    { x0: -39, z0: -43, x1: -26, z1: -34, y0: 13, y1: 18 }
  ]);
  const beds = plan.modules.filter((mod) => mod.kind === "soil_bed");
  const rows = plan.modules.filter((mod) => mod.kind === "crop_row");
  const walls = plan.modules.filter((mod) => mod.kind === "retaining_wall");
  assert.equal(beds.length, 3);
  assert.equal(rows.length, 9);
  assert.equal(walls.length, 2);
  assert.deepEqual(beds.map((mod) => mod.y), [16, 15, 14]);
  for (const row of rows) {
    assert.ok([16.18, 15.18, 14.18].includes(row.y));
  }
  for (const wall of walls) {
    assert.equal(wall.h, 1);
  }
  const beforeBuild = fingerprint(world);
  const built = buildStructure(world, structureAuthorizer(), farmProposal(m));
  assert.equal(built.ok, true, built.ok ? "" : built.reasons.join("; "));
  if (!built.ok) return;
  assert.equal(built.ledger.moduleCount, 14);
  assert.deepEqual(built.ledger.costPaid, { wood: 6, stone: 12 });
  assert.deepEqual(built.ledger.inventoryBefore, { ore: 8, stone: 48, wood: 36 });
  assert.deepEqual(built.ledger.inventoryAfter, { ore: 8, stone: 36, wood: 30 });
  const afterBuild = fingerprint(world);
  assert.equal(afterBuild.voxels, beforeBuild.voxels);
  assert.notEqual(afterBuild.inventory, beforeBuild.inventory);
  assert.equal(world.structures.get(plan.id)?.kind, "terrace");
  assert.deepEqual(editsOutsideEnvelope(world, M002_LAYOUT.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, M002_LAYOUT.protectedRegion), []);
});
test("structure authorization rejects forged, stale, poor and out-of-envelope work", () => {
  const m = fixture();
  prepareHouse(m);
  const world = m.world;
  const planned = planStructure(world, houseProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;
  const decision = structureAuthorizer().authorize(world, plan);
  assert.equal(decision.ok, true);
  if (!decision.ok || !decision.authorization) return;
  const token = decision.authorization;
  const before = fingerprint(world);
  const forgedDigest = executeStructure(world, plan, {
    ...token,
    planDigest: "0000000000000000"
  });
  assert.equal(forgedDigest.ok, false);
  if (!forgedDigest.ok) assert.equal(forgedDigest.code, "digest_mismatch");
  const forgedAuthority = executeStructure(world, plan, {
    ...token,
    authority: "magicblock"
  });
  assert.equal(forgedAuthority.ok, false);
  if (!forgedAuthority.ok) assert.equal(forgedAuthority.code, "unsupported_authority");
  const narrowed = executeStructure(world, plan, {
    ...token,
    envelope: [{ ...token.envelope[0], x0: token.envelope[0].x0 + 1 }]
  });
  assert.equal(narrowed.ok, false);
  if (!narrowed.ok) assert.equal(narrowed.code, "envelope_mismatch");
  const limitedModules = new LocalStructureAuthorizer(
    { envelope: M002_LAYOUT.envelope },
    { maxModules: 10 }
  ).authorize(world, plan);
  assert.equal(limitedModules.ok, false);
  assert.ok(limitedModules.reasons.some((r) => r.includes("17 modules exceed limit 10")));
  const limitedCost = new LocalStructureAuthorizer(
    { envelope: M002_LAYOUT.envelope },
    { maxCost: 10 }
  ).authorize(world, plan);
  assert.equal(limitedCost.ok, false);
  assert.ok(limitedCost.reasons.some((r) => r.includes("cost 28 exceeds limit 10")));
  const forged = {
    ...plan,
    modules: plan.modules.map((mod, i) => i === 0 ? { ...mod, x: mod.x + 20 } : mod)
  };
  forged.id = `structure:${structureDigest(forged)}`;
  const outside = structureAuthorizer().authorize(world, forged);
  assert.equal(outside.ok, false);
  assert.ok(outside.reasons.some((r) => r.includes("outside the plan envelope") || r.includes("outside the local policy")));
  const forgedExecution = executeStructure(world, forged, {
    ...token,
    planDigest: structureDigest(forged)
  });
  assert.equal(forgedExecution.ok, false);
  if (!forgedExecution.ok) {
    assert.equal(forgedExecution.code, "unauthorized_structure");
    assert.ok(forgedExecution.reasons.some((r) => r.includes("outside the authorized envelope")));
  }
  assert.deepEqual(fingerprint(world), before);
  assert.equal(setVoxel(world, -56, 11, -43, MAT.STONE), true);
  const afterManualEdit = fingerprint(world);
  const stale = executeStructure(world, plan, token);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "stale_authorization");
  assert.deepEqual(fingerprint(world), afterManualEdit);
});
test("executor re-checks surface and obstructions before charging resources", () => {
  const m = fixture();
  prepareHouse(m);
  const world = m.world;
  const surfacePlan = planStructure(world, houseProposal(m));
  assert.equal(surfacePlan.ok, true);
  if (!surfacePlan.ok) return;
  const raised = {
    ...surfacePlan.plan,
    surface: surfacePlan.plan.surface.map((s, i) => i === 0 ? { ...s, y: s.y + 1 } : s)
  };
  raised.id = `structure:${structureDigest(raised)}`;
  const raisedToken = structureAuthorizer().authorize(world, raised);
  assert.equal(raisedToken.ok, true);
  if (!raisedToken.ok || !raisedToken.authorization) return;
  const beforeRaised = fingerprint(world);
  const onRaised = executeStructure(world, raised, raisedToken.authorization);
  assert.equal(onRaised.ok, false);
  if (!onRaised.ok) {
    assert.equal(onRaised.code, "unauthorized_structure");
    assert.ok(onRaised.reasons.some((r) => r.includes("expected 12")));
  }
  assert.deepEqual(fingerprint(world), beforeRaised);
  const blocked = fixture();
  prepareHouse(blocked);
  const planned = planStructure(blocked.world, houseProposal(blocked));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const token = structureAuthorizer().authorize(blocked.world, planned.plan);
  assert.equal(token.ok, true);
  if (!token.ok || !token.authorization) return;
  const extra = {
    id: "test:house-rock",
    kind: "styl_ore",
    chunk: "30,30",
    x: -56.5,
    y: 11,
    z: -43.5,
    rot: 0,
    scale: 1,
    variant: 0,
    resource: "ore",
    remaining: 2,
    yieldPerHarvest: 1,
    harvested: false,
    provisional: false,
    authored: false
  };
  blocked.world.entities.set(extra.id, extra);
  blocked.world.entityChunks.get("30,30").push(extra.id);
  const beforeBlocked = fingerprint(blocked.world);
  const onBlocked = executeStructure(blocked.world, planned.plan, token.authorization);
  assert.equal(onBlocked.ok, false);
  if (!onBlocked.ok) {
    assert.equal(onBlocked.code, "unauthorized_structure");
    assert.ok(onBlocked.reasons.some((r) => r.includes("footprint has 1 obstructions")));
  }
  assert.deepEqual(fingerprint(blocked.world), beforeBlocked);
});
test("the pinned M002 scenario is deterministic and leaves outside terrain alone", () => {
  const a = createM002Fixture();
  const b = createM002Fixture();
  const ra = runM002Scenario(a);
  const rb = runM002Scenario(b);
  assert.equal(ra.ok, true, ra.errors.join("; "));
  assert.equal(rb.ok, true, rb.errors.join("; "));
  assert.deepEqual(ra.errors, []);
  assert.deepEqual(ra.house.preparation, rb.house.preparation);
  assert.deepEqual(ra.path.preparation, rb.path.preparation);
  assert.deepEqual(ra.farm.preparation, rb.farm.preparation);
  assert.deepEqual(ra.house.structure, rb.house.structure);
  assert.deepEqual(ra.path.structure, rb.path.structure);
  assert.deepEqual(ra.farm.structure, rb.farm.structure);
  assert.equal(ra.house.preparation?.cutVolume, 3);
  assert.equal(ra.house.preparation?.fillVolume, 18);
  assert.equal(ra.house.preparation?.voxelEdits, 21);
  assert.equal(ra.path.preparation?.cutVolume, 12);
  assert.equal(ra.path.preparation?.fillVolume, 0);
  assert.equal(ra.path.preparation?.voxelEdits, 39);
  assert.equal(ra.path.preparation?.surfaceEdits, 27);
  assert.equal(ra.farm.preparation?.cutVolume, 40);
  assert.equal(ra.farm.preparation?.fillVolume, 33);
  assert.equal(ra.farm.preparation?.voxelEdits, 107);
  assert.equal(ra.farm.preparation?.surfaceEdits, 34);
  assert.equal(ra.house.structure?.moduleCount, 17);
  assert.equal(ra.path.structure?.moduleCount, 27);
  assert.equal(ra.farm.structure?.moduleCount, 14);
  assert.deepEqual(ra.house.structure?.costPaid, { wood: 10, stone: 18 });
  assert.deepEqual(ra.path.structure?.costPaid, { stone: 9 });
  assert.deepEqual(ra.farm.structure?.costPaid, { wood: 6, stone: 12 });
  assert.deepEqual(m002StructureCosts(ra), { wood: 16, stone: 39 });
  assert.deepEqual(ra.inventoryBefore, { stone: 48, wood: 24 });
  assert.deepEqual(ra.inventoryAfter, { ore: 8, stone: 9, wood: 20 });
  assert.equal(a.world.structures.size, 3);
  assert.deepEqual([...a.world.structures.keys()], [
    "structure:7f2ab549e46d8ddb",
    "structure:0e68d6af974d7a55",
    "structure:8c4a68c0e8536323"
  ]);
  const housePrep = ra.house.preparation;
  const houseBuild = ra.house.structure;
  const pathPrep = ra.path.preparation;
  const pathBuild = ra.path.structure;
  const farmPrep = ra.farm.preparation;
  const farmBuild = ra.farm.structure;
  assert.equal(housePrep.revisionAfter - housePrep.revisionBefore, 21);
  assert.equal(houseBuild.revisionAfter - houseBuild.revisionBefore, 1);
  assert.equal(pathPrep.revisionAfter - pathPrep.revisionBefore, 39);
  assert.equal(pathBuild.revisionAfter - pathBuild.revisionBefore, 1);
  assert.equal(farmPrep.revisionAfter - farmPrep.revisionBefore, 109);
  assert.equal(farmBuild.revisionAfter - farmBuild.revisionBefore, 1);
  assert.equal(
    a.world.revision - housePrep.revisionBefore,
    172,
    "21 + 1 + 39 + 1 + 109 + 1 revision steps"
  );
  assert.deepEqual(ra.hashes, rb.hashes);
  assert.equal(
    canonicalRegionHash(a.world, a.layout.protectedRegion).hash,
    canonicalRegionHash(b.world, b.layout.protectedRegion).hash
  );
  assert.equal(
    canonicalEntityHash(a.world, a.layout.protectedRegion),
    canonicalEntityHash(b.world, b.layout.protectedRegion)
  );
  assert.equal(canonicalInventoryHash(a.world), canonicalInventoryHash(b.world));
  assert.deepEqual(editsOutsideEnvelope(a.world, a.layout.envelope), []);
  assert.deepEqual(checkDerivedCaches(a.world, a.layout.protectedRegion), []);
  assert.equal(surfaceAt(a.world, -56, -43), 11);
  assert.equal(topMaterialAtWorld(a.world, -49, -43), MAT.GRAVEL);
  assert.equal(surfaceAt(a.world, -32, -41), 16);
  assert.equal(surfaceAt(a.world, -32, -38), 15);
  assert.equal(surfaceAt(a.world, -32, -36), 14);
  assert.equal(topMaterialAtWorld(a.world, -32, -36), MAT.SOIL);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMi5zdHJ1Y3R1cmVzLnRlc3QudHMiLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS9ub2lzZS50cyIsICIuLi8uLi9zcmMvc2ltL2h5ZHJvbG9neS50cyIsICIuLi8uLi9zcmMvc2ltL21hdGVyaWFscy50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4tdjIudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3NpbS9jb25zdHJ1Y3Rpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9wcmVwYXJhdGlvbi50cyIsICIuLi8uLi9zcmMvc2ltL3N0cnVjdHVyZXMudHMiLCAiLi4vLi4vc3JjL3NpbS9jYW5vbmljYWwudHMiLCAiLi4vLi4vc3JjL3NpbS9tMDAyLnRzIiwgIi4uLy4uL3NyYy9zaW0vc2NlbmFyaW8udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIE0wMDIgc3RhZ2UgNCBnYXRlOiBhdXRob3JpdGF0aXZlIGhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlIHN0cnVjdHVyZXMuXG4vL1xuLy8gVGhlc2UgdGVzdHMgcGluIHRoZSBzdHJ1Y3R1cmUgcGxhbnMsIHRoZWlyIGV4YWN0IHJlc291cmNlIGNvc3RzLCB0aGVcbi8vIG1hdGVyaWFsIHJlYWRpbmVzcyBvZiBwcmVwYXJlZCBncm91bmQsIHRoZSBsb2NhbCBhdXRob3JpemVyJ3MgcmVmdXNhbCBwYXRocyxcbi8vIGFuZCB0aGUgZmFjdCB0aGF0IGJ1aWxkaW5nIGEgc3RydWN0dXJlIG5ldmVyIG11dGF0ZXMgdGVycmFpbiB2b3hlbHMuXG5pbXBvcnQgdGVzdCBmcm9tICdub2RlOnRlc3QnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdub2RlOmFzc2VydC9zdHJpY3QnO1xuaW1wb3J0IHtcbiAgTUFULCBzdXJmYWNlQXQsIHRvcE1hdGVyaWFsQXRXb3JsZCwgc2V0Vm94ZWwsXG59IGZyb20gJy4uL3NyYy9zaW0vd29ybGQnO1xuaW1wb3J0IHtcbiAgY2Fub25pY2FsUmVnaW9uSGFzaCwgY2Fub25pY2FsRW50aXR5SGFzaCwgY2Fub25pY2FsSW52ZW50b3J5SGFzaCxcbiAgY2Fub25pY2FsU3RydWN0dXJlSGFzaCwgY2hlY2tEZXJpdmVkQ2FjaGVzLCBlZGl0c091dHNpZGVFbnZlbG9wZSxcbn0gZnJvbSAnLi4vc3JjL3NpbS9jYW5vbmljYWwnO1xuaW1wb3J0IHtcbiAgY3JlYXRlTTAwMkZpeHR1cmUsIE0wMDJfTEFZT1VULCBNMDAyX1BBVEhfUFJPRklMRSwgTTAwMl9QQVRIX1NJVEVfSUQsXG4gIE0wMDJfVEVSUkFDRV9CQU5EUyxcbn0gZnJvbSAnLi4vc3JjL3NpbS9tMDAyJztcbmltcG9ydCB7IEhPVVNFX1JVTEVTLCBQQVRIX1JVTEVTLCBGQVJNX1JVTEVTIH0gZnJvbSAnLi4vc3JjL3NpbS9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHsgcHJlcGFyZVNpdGUsIExvY2FsQXV0aG9yaXplciB9IGZyb20gJy4uL3NyYy9zaW0vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHtcbiAgcGxhblN0cnVjdHVyZSwgYnVpbGRTdHJ1Y3R1cmUsIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgc3RydWN0dXJlRGlnZXN0LFxuICBleGVjdXRlU3RydWN0dXJlLCBTdHJ1Y3R1cmVQbGFuLFxufSBmcm9tICcuLi9zcmMvc2ltL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHtcbiAgcnVuTTAwMlNjZW5hcmlvLCBtMDAyUGF0aFJlY3QsIG0wMDJQYXRoVGFyZ2V0cywgbTAwMkZhcm1UYXJnZXRzLFxuICBNMDAyX1NUQVJURVJfSU5WRU5UT1JZLCBtMDAyU3RydWN0dXJlQ29zdHMsXG59IGZyb20gJy4uL3NyYy9zaW0vc2NlbmFyaW8nO1xuXG50eXBlIE0wMDIgPSBSZXR1cm5UeXBlPHR5cGVvZiBjcmVhdGVNMDAyRml4dHVyZT47XG50eXBlIFdvcmxkID0gTTAwMlsnd29ybGQnXTtcblxuZnVuY3Rpb24gZml4dHVyZSgpOiBNMDAyIHtcbiAgY29uc3QgbSA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG4gIG0ud29ybGQuaW52ZW50b3J5ID0geyAuLi5NMDAyX1NUQVJURVJfSU5WRU5UT1JZIH07XG4gIHJldHVybiBtO1xufVxuXG5mdW5jdGlvbiBwcmVwQXV0aG9yaXplcigpIHtcbiAgcmV0dXJuIG5ldyBMb2NhbEF1dGhvcml6ZXIoeyBlbnZlbG9wZTogTTAwMl9MQVlPVVQuZW52ZWxvcGUgfSk7XG59XG5cbmZ1bmN0aW9uIHN0cnVjdHVyZUF1dGhvcml6ZXIoKSB7XG4gIHJldHVybiBuZXcgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pO1xufVxuXG5mdW5jdGlvbiBmaW5nZXJwcmludCh3b3JsZDogV29ybGQpIHtcbiAgcmV0dXJuIHtcbiAgICByZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgdm94ZWxzOiBjYW5vbmljYWxSZWdpb25IYXNoKHdvcmxkLCBNMDAyX0xBWU9VVC5wcm90ZWN0ZWRSZWdpb24pLmhhc2gsXG4gICAgc3RydWN0dXJlczogY2Fub25pY2FsU3RydWN0dXJlSGFzaCh3b3JsZCksXG4gICAgaW52ZW50b3J5OiBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKHdvcmxkKSxcbiAgICBlbnRpdGllczogY2Fub25pY2FsRW50aXR5SGFzaCh3b3JsZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gcHJlcGFyZUhvdXNlKG06IE0wMDIpIHtcbiAgY29uc3QgcmVzdWx0ID0gcHJlcGFyZVNpdGUobS53b3JsZCwgcHJlcEF1dGhvcml6ZXIoKSwge1xuICAgIHNpdGVJZDogbS5sYXlvdXQuaG91c2UuaWQsXG4gICAgcmVjdDogbS5sYXlvdXQuaG91c2UucmVjdCxcbiAgICBmbG9vclk6IG0ubGF5b3V0LmhvdXNlLmZsb29yWSxcbiAgICBydWxlczogSE9VU0VfUlVMRVMsXG4gIH0pO1xuICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCB0cnVlLCByZXN1bHQub2sgPyAnJyA6IHJlc3VsdC5yZWFzb25zLmpvaW4oJzsgJykpO1xuICBpZiAoIXJlc3VsdC5vaykgdGhyb3cgbmV3IEVycm9yKCdob3VzZSBwcmVwYXJhdGlvbiBmYWlsZWQnKTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gcHJlcGFyZVBhdGgobTogTTAwMiwgZ3JhdmVsOiBib29sZWFuKSB7XG4gIGNvbnN0IHJlc3VsdCA9IHByZXBhcmVTaXRlKG0ud29ybGQsIHByZXBBdXRob3JpemVyKCksIHtcbiAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgIHJlY3Q6IG0wMDJQYXRoUmVjdCgpLFxuICAgIGZsb29yWTogMTIsXG4gICAgcnVsZXM6IFBBVEhfUlVMRVMsXG4gIH0sIHtcbiAgICB0YXJnZXRzOiBtMDAyUGF0aFRhcmdldHMoKSxcbiAgICBzdXJmYWNlTWF0ZXJpYWw6IGdyYXZlbCA/IE1BVC5HUkFWRUwgOiB1bmRlZmluZWQsXG4gICAgZW52ZWxvcGU6IFttLmxheW91dC5lbnZlbG9wZVsxXV0sXG4gIH0pO1xuICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCB0cnVlLCByZXN1bHQub2sgPyAnJyA6IHJlc3VsdC5yZWFzb25zLmpvaW4oJzsgJykpO1xuICBpZiAoIXJlc3VsdC5vaykgdGhyb3cgbmV3IEVycm9yKCdwYXRoIHByZXBhcmF0aW9uIGZhaWxlZCcpO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBwcmVwYXJlRmFybShtOiBNMDAyLCBzb2lsOiBib29sZWFuKSB7XG4gIGNvbnN0IHJlc3VsdCA9IHByZXBhcmVTaXRlKG0ud29ybGQsIHByZXBBdXRob3JpemVyKCksIHtcbiAgICBzaXRlSWQ6IG0ubGF5b3V0LmZhcm0uaWQsXG4gICAgcmVjdDogbS5sYXlvdXQuZmFybS5yZWN0LFxuICAgIGZsb29yWTogMTUsXG4gICAgcnVsZXM6IEZBUk1fUlVMRVMsXG4gIH0sIHtcbiAgICB0YXJnZXRzOiBtMDAyRmFybVRhcmdldHMoKSxcbiAgICBzdXJmYWNlTWF0ZXJpYWw6IHNvaWwgPyBNQVQuU09JTCA6IHVuZGVmaW5lZCxcbiAgICBlbnZlbG9wZTogW20ubGF5b3V0LmVudmVsb3BlWzJdXSxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChyZXN1bHQub2ssIHRydWUsIHJlc3VsdC5vayA/ICcnIDogcmVzdWx0LnJlYXNvbnMuam9pbignOyAnKSk7XG4gIGlmICghcmVzdWx0Lm9rKSB0aHJvdyBuZXcgRXJyb3IoJ2Zhcm0gcHJlcGFyYXRpb24gZmFpbGVkJyk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGhvdXNlUHJvcG9zYWwobTogTTAwMikge1xuICByZXR1cm4ge1xuICAgIHNpdGVJZDogbS5sYXlvdXQuaG91c2UuaWQsXG4gICAga2luZDogJ2hvdXNlJyBhcyBjb25zdCxcbiAgICByZWN0OiBtLmxheW91dC5ob3VzZS5yZWN0LFxuICAgIGZsb29yWTogbS5sYXlvdXQuaG91c2UuZmxvb3JZLFxuICAgIGRvb3I6IG0ubGF5b3V0LmhvdXNlLmRvb3IsXG4gIH07XG59XG5cbmZ1bmN0aW9uIHBhdGhQcm9wb3NhbChtOiBNMDAyKSB7XG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICBraW5kOiAncGF0aCcgYXMgY29uc3QsXG4gICAgcmVjdDogbTAwMlBhdGhSZWN0KCksXG4gICAgZmxvb3JZOiAxMixcbiAgfTtcbn1cblxuZnVuY3Rpb24gZmFybVByb3Bvc2FsKG06IE0wMDIpIHtcbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IG0ubGF5b3V0LmZhcm0uaWQsXG4gICAga2luZDogJ3RlcnJhY2UnIGFzIGNvbnN0LFxuICAgIHJlY3Q6IG0ubGF5b3V0LmZhcm0ucmVjdCxcbiAgICBmbG9vclk6IDE1LFxuICAgIHRlcnJhY2VzOiBtLmxheW91dC5mYXJtLnRlcnJhY2VzLFxuICB9O1xufVxuXG50ZXN0KCdzdHJ1Y3R1cmUgcGxhbnMgcmVmdXNlIHVucHJlcGFyZWQgZ3JvdW5kIGFuZCB3cm9uZyBzdXJmYWNlIG1hdGVyaWFscycsICgpID0+IHtcbiAgY29uc3QgbSA9IGZpeHR1cmUoKTtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQobS53b3JsZCk7XG5cbiAgY29uc3QgcmF3SG91c2UgPSBwbGFuU3RydWN0dXJlKG0ud29ybGQsIGhvdXNlUHJvcG9zYWwobSkpO1xuICBhc3NlcnQuZXF1YWwocmF3SG91c2Uub2ssIGZhbHNlKTtcbiAgaWYgKCFyYXdIb3VzZS5vaykge1xuICAgIGFzc2VydC5lcXVhbChyYXdIb3VzZS5zdGFnZSwgJ3BsYW4nKTtcbiAgICBhc3NlcnQuZXF1YWwocmF3SG91c2UuY29kZSwgJ3NpdGVfbm90X3ByZXBhcmVkJyk7XG4gICAgYXNzZXJ0Lm9rKHJhd0hvdXNlLnJlYXNvbnMubGVuZ3RoID49IDEpO1xuICB9XG5cbiAgY29uc3QgcmF3RmFybSA9IHBsYW5TdHJ1Y3R1cmUobS53b3JsZCwgZmFybVByb3Bvc2FsKG0pKTtcbiAgYXNzZXJ0LmVxdWFsKHJhd0Zhcm0ub2ssIGZhbHNlKTtcbiAgaWYgKCFyYXdGYXJtLm9rKSB7XG4gICAgYXNzZXJ0LmVxdWFsKHJhd0Zhcm0uY29kZSwgJ3RlcnJhY2VfZWFydGh3b3JrJyk7XG4gICAgYXNzZXJ0Lm9rKHJhd0Zhcm0ucmVhc29uc1swXS5pbmNsdWRlcygnY3V0IDEwOCcpKTtcbiAgfVxuXG4gIC8vIFBsYW5uaW5nIGlzIHJlYWQtb25seSwgaW5jbHVkaW5nIG9uIHJlamVjdGVkIHByb3Bvc2Fscy5cbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludChtLndvcmxkKSwgYmVmb3JlKTtcbiAgYXNzZXJ0LmVxdWFsKG0ud29ybGQuc3RydWN0dXJlcy5zaXplLCAwKTtcblxuICAvLyBBIHBhdGggd2hvc2UgaGVpZ2h0cyBhcmUgcHJlcGFyZWQgYnV0IHdob3NlIHRvcCBpcyBzdGlsbCBncmFzcyBpcyBub3QgYVxuICAvLyBwYXRoLiBUaGUgbWF0ZXJpYWwgY2hlY2sgbXVzdCBiZSBleHBsaWNpdCwgbm90IGluZmVycmVkIGZyb20gaGVpZ2h0LlxuICBjb25zdCBwYXRoUHJlcCA9IHByZXBhcmVQYXRoKG0sIGZhbHNlKTtcbiAgYXNzZXJ0LmVxdWFsKHBhdGhQcmVwLmxlZGdlci5jdXRWb2x1bWUsIDEzKTtcbiAgYXNzZXJ0LmVxdWFsKHBhdGhQcmVwLmxlZGdlci5zdXJmYWNlRWRpdHMsIDApO1xuICBjb25zdCBncmFzc1BhdGggPSBwbGFuU3RydWN0dXJlKG0ud29ybGQsIHBhdGhQcm9wb3NhbChtKSk7XG4gIGFzc2VydC5lcXVhbChncmFzc1BhdGgub2ssIGZhbHNlKTtcbiAgaWYgKCFncmFzc1BhdGgub2spIHtcbiAgICBhc3NlcnQuZXF1YWwoZ3Jhc3NQYXRoLmNvZGUsICdwYXRoX3N1cmZhY2UnKTtcbiAgICBhc3NlcnQub2soZ3Jhc3NQYXRoLnJlYXNvbnNbMF0uaW5jbHVkZXMoJ2V4cGVjdGVkIGdyYXZlbCcpKTtcbiAgfVxuXG4gIC8vIFNhbWUgZm9yIHRlcnJhY2VzOiBjb3JyZWN0IGJhbmRzLCB3cm9uZyB0b3AgbWF0ZXJpYWwuXG4gIGNvbnN0IGZhcm1QcmVwID0gcHJlcGFyZUZhcm0obSwgZmFsc2UpO1xuICBhc3NlcnQuZXF1YWwoZmFybVByZXAubGVkZ2VyLmN1dFZvbHVtZSwgNDApO1xuICBhc3NlcnQuZXF1YWwoZmFybVByZXAubGVkZ2VyLmZpbGxWb2x1bWUsIDMzKTtcbiAgYXNzZXJ0LmVxdWFsKGZhcm1QcmVwLmxlZGdlci5zdXJmYWNlRWRpdHMsIDApO1xuICBjb25zdCBncmFzc0Zhcm0gPSBwbGFuU3RydWN0dXJlKG0ud29ybGQsIGZhcm1Qcm9wb3NhbChtKSk7XG4gIGFzc2VydC5lcXVhbChncmFzc0Zhcm0ub2ssIGZhbHNlKTtcbiAgaWYgKCFncmFzc0Zhcm0ub2spIHtcbiAgICBhc3NlcnQuZXF1YWwoZ3Jhc3NGYXJtLmNvZGUsICd0ZXJyYWNlX3N1cmZhY2UnKTtcbiAgICBhc3NlcnQub2soZ3Jhc3NGYXJtLnJlYXNvbnNbMF0uaW5jbHVkZXMoJ2V4cGVjdGVkIHNvaWwnKSk7XG4gIH1cblxuICBhc3NlcnQuZXF1YWwoY2Fub25pY2FsU3RydWN0dXJlSGFzaChtLndvcmxkKSwgYmVmb3JlLnN0cnVjdHVyZXMpO1xuICBhc3NlcnQuZXF1YWwobS53b3JsZC5zdHJ1Y3R1cmVzLnNpemUsIDApO1xufSk7XG5cbnRlc3QoJ2hvdXNlIGJ1aWxkIHBheXMgaXRzIGV4YWN0IGNvc3QgYW5kIGNoYW5nZXMgbm8gdGVycmFpbiB2b3hlbHMnLCAoKSA9PiB7XG4gIGNvbnN0IG0gPSBmaXh0dXJlKCk7XG4gIGNvbnN0IHByZXAgPSBwcmVwYXJlSG91c2UobSk7XG4gIGFzc2VydC5lcXVhbChwcmVwLmxlZGdlci5jdXRWb2x1bWUsIDMpO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIuZmlsbFZvbHVtZSwgMTgpO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIudm94ZWxFZGl0cywgMjEpO1xuXG4gIGNvbnN0IHdvcmxkID0gbS53b3JsZDtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBwbGFubmVkID0gcGxhblN0cnVjdHVyZSh3b3JsZCwgaG91c2VQcm9wb3NhbChtKSk7XG4gIGFzc2VydC5lcXVhbChwbGFubmVkLm9rLCB0cnVlKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm47XG4gIGNvbnN0IHBsYW4gPSBwbGFubmVkLnBsYW47XG5cbiAgYXNzZXJ0LmVxdWFsKHBsYW4ubW9kdWxlcy5sZW5ndGgsIDE3KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChwbGFuLmNvc3QsIHsgd29vZDogMTAsIHN0b25lOiAxOCB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChwbGFuLm9yaWdpbiwgeyB4OiAtNTYsIHk6IDExLCB6OiAtNDMgfSk7XG4gIGFzc2VydC5lcXVhbChwbGFuLnN1cmZhY2UubGVuZ3RoLCA0OCk7XG4gIGFzc2VydC5lcXVhbChwbGFuLm1vZHVsZXMuZmlsdGVyKChtb2QpID0+IG1vZC5raW5kID09PSAnZmxvb3InKS5sZW5ndGgsIDEpO1xuICBhc3NlcnQuZXF1YWwocGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ3Jvb2YnKS5sZW5ndGgsIDEpO1xuICBhc3NlcnQuZXF1YWwocGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ2Rvb3InKS5sZW5ndGgsIDIpO1xuICBhc3NlcnQuZXF1YWwocGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ3dpbmRvdycpLmxlbmd0aCwgMik7XG5cbiAgY29uc3QgZGVjaXNpb24gPSBzdHJ1Y3R1cmVBdXRob3JpemVyKCkuYXV0aG9yaXplKHdvcmxkLCBwbGFuKTtcbiAgYXNzZXJ0LmVxdWFsKGRlY2lzaW9uLm9rLCB0cnVlLCBkZWNpc2lvbi5yZWFzb25zLmpvaW4oJzsgJykpO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSByZXR1cm47XG4gIGFzc2VydC5lcXVhbChkZWNpc2lvbi5hdXRob3JpemF0aW9uLmF1dGhvcml0eSwgJ2xvY2FsLXN0dWInKTtcbiAgYXNzZXJ0LmVxdWFsKGRlY2lzaW9uLmF1dGhvcml6YXRpb24uZW5mb3JjZW1lbnQsICdsb2NhbC1zaW11bGF0aW9uLW9ubHknKTtcbiAgYXNzZXJ0LmVxdWFsKGRlY2lzaW9uLmF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCwgc3RydWN0dXJlRGlnZXN0KHBsYW4pKTtcblxuICBjb25zdCByZXN1bHQgPSBleGVjdXRlU3RydWN0dXJlKHdvcmxkLCBwbGFuLCBkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcbiAgYXNzZXJ0LmVxdWFsKHJlc3VsdC5vaywgdHJ1ZSwgcmVzdWx0Lm9rID8gJycgOiByZXN1bHQucmVhc29ucy5qb2luKCc7ICcpKTtcbiAgaWYgKCFyZXN1bHQub2spIHJldHVybjtcbiAgY29uc3QgeyBsZWRnZXIgfSA9IHJlc3VsdDtcblxuICBhc3NlcnQuZXF1YWwobGVkZ2VyLmtpbmQsICdob3VzZScpO1xuICBhc3NlcnQuZXF1YWwobGVkZ2VyLm1vZHVsZUNvdW50LCAxNyk7XG4gIGFzc2VydC5kZWVwRXF1YWwobGVkZ2VyLmNvc3RQYWlkLCB7IHdvb2Q6IDEwLCBzdG9uZTogMTggfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwobGVkZ2VyLmludmVudG9yeUJlZm9yZSwgeyBzdG9uZTogNDgsIHdvb2Q6IDI0IH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGxlZGdlci5pbnZlbnRvcnlBZnRlciwgeyBzdG9uZTogMzAsIHdvb2Q6IDE0IH0pO1xuICBhc3NlcnQuZXF1YWwobGVkZ2VyLnJldmlzaW9uQWZ0ZXIsIGxlZGdlci5yZXZpc2lvbkJlZm9yZSArIDEpO1xuXG4gIGNvbnN0IGFmdGVyID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIudm94ZWxzLCBiZWZvcmUudm94ZWxzLCAnc3RydWN0dXJlIGJ1aWxkIG11c3Qgbm90IGVkaXQgdm94ZWxzJyk7XG4gIGFzc2VydC5lcXVhbChhZnRlci5lbnRpdGllcywgYmVmb3JlLmVudGl0aWVzKTtcbiAgYXNzZXJ0Lm5vdEVxdWFsKGFmdGVyLmludmVudG9yeSwgYmVmb3JlLmludmVudG9yeSk7XG4gIGFzc2VydC5ub3RFcXVhbChhZnRlci5zdHJ1Y3R1cmVzLCBiZWZvcmUuc3RydWN0dXJlcyk7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5zdHJ1Y3R1cmVzLnNpemUsIDEpO1xuXG4gIGNvbnN0IHN0b3JlZCA9IHdvcmxkLnN0cnVjdHVyZXMuZ2V0KHBsYW4uaWQpO1xuICBhc3NlcnQub2soc3RvcmVkKTtcbiAgYXNzZXJ0LmVxdWFsKHN0b3JlZC5raW5kLCAnaG91c2UnKTtcbiAgYXNzZXJ0LmVxdWFsKHN0b3JlZC5tb2R1bGVzLmxlbmd0aCwgMTcpO1xuICBhc3NlcnQuZXF1YWwoc3RvcmVkLmJ1aWx0UmV2aXNpb24sIHdvcmxkLnJldmlzaW9uKTtcbiAgYXNzZXJ0LmVxdWFsKHN0b3JlZC5wcm92aXNpb25hbCwgdHJ1ZSk7XG5cbiAgLy8gQSBzZWNvbmQgYnVpbGQgcmUtcGxhbnMgdGhlIHNhbWUgaWQsIGdldHMgYSBmcmVzaCB0b2tlbiwgYW5kIGlzIHJlZnVzZWQgYnlcbiAgLy8gdGhlIGV4ZWN1dG9yIHdpdGhvdXQgY2hhcmdpbmcgYWdhaW4uXG4gIGNvbnN0IHJlcGxheSA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyKCksIGhvdXNlUHJvcG9zYWwobSkpO1xuICBhc3NlcnQuZXF1YWwocmVwbGF5Lm9rLCBmYWxzZSk7XG4gIGlmICghcmVwbGF5Lm9rKSB7XG4gICAgYXNzZXJ0LmVxdWFsKHJlcGxheS5jb2RlLCAndW5hdXRob3JpemVkX3N0cnVjdHVyZScpO1xuICAgIGFzc2VydC5vayhyZXBsYXkucmVhc29ucy5zb21lKChyKSA9PiByLmluY2x1ZGVzKCdhbHJlYWR5IGV4aXN0cycpKSk7XG4gIH1cbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGFmdGVyKTtcbn0pO1xuXG50ZXN0KCdwYXRoIHByZXBhcmF0aW9uIHVzZXMgaXRzIGV4YWN0IGVudmVsb3BlIGFuZCByZXF1aXJlcyBhIGdyYXZlbCB0b3AnLCAoKSA9PiB7XG4gIGNvbnN0IG0gPSBmaXh0dXJlKCk7XG4gIGNvbnN0IHdvcmxkID0gbS53b3JsZDtcbiAgYXNzZXJ0LmRlZXBFcXVhbChtMDAyUGF0aFJlY3QoKSwgeyB4MDogLTUzLCB6MDogLTQ0LCB4MTogLTQ1LCB6MTogLTQyIH0pO1xuXG4gIC8vIFRoZSBkZWZhdWx0IGRlcml2ZWQgZW52ZWxvcGUgYWRkcyBhIDEgbSBidWZmZXIgYW5kIGVzY2FwZXMgdGhlIHBpbm5lZFxuICAvLyBwb2xpY3kuIEl0IG11c3QgYmUgcmVqZWN0ZWQsIG5vdCBzaWxlbnRseSB3aWRlbmVkLlxuICBjb25zdCBpbXBsaWNpdCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplcigpLCB7XG4gICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICByZWN0OiBtMDAyUGF0aFJlY3QoKSxcbiAgICBmbG9vclk6IDEyLFxuICAgIHJ1bGVzOiBQQVRIX1JVTEVTLFxuICB9LCB7IHRhcmdldHM6IG0wMDJQYXRoVGFyZ2V0cygpLCBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5HUkFWRUwgfSk7XG4gIGFzc2VydC5lcXVhbChpbXBsaWNpdC5vaywgZmFsc2UpO1xuICBpZiAoIWltcGxpY2l0Lm9rKSB7XG4gICAgYXNzZXJ0LmVxdWFsKGltcGxpY2l0LnN0YWdlLCAnYXV0aG9yaXplJyk7XG4gICAgYXNzZXJ0LmVxdWFsKGltcGxpY2l0LmNvZGUsICdub3RfYXV0aG9yaXplZCcpO1xuICAgIGFzc2VydC5vayhpbXBsaWNpdC5yZWFzb25zLnNvbWUoKHIpID0+IHIuaW5jbHVkZXMoJ291dHNpZGUgdGhlIGxvY2FsIHBvbGljeScpKSk7XG4gIH1cblxuICAvLyBQcmVwYXJlIHRoZSBzaGFyZWQgaG91c2UgZG9vciBjb2x1bW4gZmlyc3QsIGFzIHRoZSBwaW5uZWQgc2NlbmFyaW8gZG9lcy5cbiAgcHJlcGFyZUhvdXNlKG0pO1xuICBjb25zdCBvdXRzaWRlQmVmb3JlID0gY2Fub25pY2FsUmVnaW9uSGFzaChcbiAgICB3b3JsZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uLCBbTTAwMl9MQVlPVVQuZW52ZWxvcGVbMV1dLFxuICApLmhhc2g7XG4gIGNvbnN0IHByZXAgPSBwcmVwYXJlUGF0aChtLCB0cnVlKTtcblxuICBhc3NlcnQuZXF1YWwocHJlcC5wbGFuLmVudmVsb3BlLmxlbmd0aCwgMSk7XG4gIGFzc2VydC5kZWVwRXF1YWwocHJlcC5wbGFuLmVudmVsb3BlWzBdLCBNMDAyX0xBWU9VVC5lbnZlbG9wZVsxXSk7XG4gIGFzc2VydC5lcXVhbChwcmVwLmxlZGdlci5jdXRWb2x1bWUsIDEyKTtcbiAgYXNzZXJ0LmVxdWFsKHByZXAubGVkZ2VyLmZpbGxWb2x1bWUsIDApO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIudm94ZWxFZGl0cywgMzkpO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIuc3VyZmFjZUVkaXRzLCAyNyk7XG4gIGFzc2VydC5kZWVwRXF1YWwocHJlcC5sZWRnZXIucmVzb3VyY2VzR2FpbmVkLCB7fSk7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBNMDAyX1BBVEhfUFJPRklMRS5sZW5ndGg7IGkrKykge1xuICAgIGZvciAobGV0IHogPSAtNDQ7IHogPD0gLTQyOyB6KyspIHtcbiAgICAgIGNvbnN0IHggPSAtNTMgKyBpO1xuICAgICAgYXNzZXJ0LmVxdWFsKHN1cmZhY2VBdCh3b3JsZCwgeCwgeiksIE0wMDJfUEFUSF9QUk9GSUxFW2ldLCBgY29sdW1uICR7eH0sJHt6fWApO1xuICAgICAgYXNzZXJ0LmVxdWFsKHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZCwgeCwgeiksIE1BVC5HUkFWRUwsIGB0b3AgJHt4fSwke3p9YCk7XG4gICAgfVxuICB9XG4gIGFzc2VydC5lcXVhbChcbiAgICBjYW5vbmljYWxSZWdpb25IYXNoKHdvcmxkLCBNMDAyX0xBWU9VVC5wcm90ZWN0ZWRSZWdpb24sIFtNMDAyX0xBWU9VVC5lbnZlbG9wZVsxXV0pLmhhc2gsXG4gICAgb3V0c2lkZUJlZm9yZSxcbiAgICAncGF0aCBwcmVwYXJhdGlvbiBtdXN0IHN0YXkgaW5zaWRlIGl0cyBleGFjdCBlbnZlbG9wZScsXG4gICk7XG5cbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5TdHJ1Y3R1cmUod29ybGQsIHBhdGhQcm9wb3NhbChtKSk7XG4gIGFzc2VydC5lcXVhbChwbGFubmVkLm9rLCB0cnVlKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm47XG4gIGNvbnN0IHBsYW4gPSBwbGFubmVkLnBsYW47XG4gIGFzc2VydC5lcXVhbChwbGFuLm1vZHVsZXMubGVuZ3RoLCAyNyk7XG4gIGFzc2VydC5kZWVwRXF1YWwocGxhbi5jb3N0LCB7IHN0b25lOiA5IH0pO1xuXG4gIGNvbnN0IHBhdGhNb2R1bGVzID0gcGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ3BhdGgnKTtcbiAgYXNzZXJ0LmVxdWFsKHBhdGhNb2R1bGVzLmxlbmd0aCwgOSk7XG4gIGFzc2VydC5kZWVwRXF1YWwocGF0aE1vZHVsZXMubWFwKChtb2QpID0+IG1vZC55KSwgWy4uLk0wMDJfUEFUSF9QUk9GSUxFXSk7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgcGF0aE1vZHVsZXMubGVuZ3RoOyBpKyspIHtcbiAgICBhc3NlcnQub2soTWF0aC5hYnMocGF0aE1vZHVsZXNbaV0ueSAtIHBhdGhNb2R1bGVzW2kgLSAxXS55KSA8PSAxKTtcbiAgfVxuICBhc3NlcnQuZXF1YWwocGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ2N1cmInKS5sZW5ndGgsIDE4KTtcblxuICBjb25zdCBiZWZvcmVCdWlsZCA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3QgYnVpbHQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplcigpLCBwYXRoUHJvcG9zYWwobSkpO1xuICBhc3NlcnQuZXF1YWwoYnVpbHQub2ssIHRydWUsIGJ1aWx0Lm9rID8gJycgOiBidWlsdC5yZWFzb25zLmpvaW4oJzsgJykpO1xuICBpZiAoIWJ1aWx0Lm9rKSByZXR1cm47XG4gIGFzc2VydC5lcXVhbChidWlsdC5sZWRnZXIubW9kdWxlQ291bnQsIDI3KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChidWlsdC5sZWRnZXIuY29zdFBhaWQsIHsgc3RvbmU6IDkgfSk7XG4gIGFzc2VydC5lcXVhbChidWlsdC5sZWRnZXIuaW52ZW50b3J5QmVmb3JlLnN0b25lLCA0OCk7XG4gIGFzc2VydC5lcXVhbChidWlsdC5sZWRnZXIuaW52ZW50b3J5QWZ0ZXIuc3RvbmUsIDM5KTtcblxuICBjb25zdCBhZnRlckJ1aWxkID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXJCdWlsZC52b3hlbHMsIGJlZm9yZUJ1aWxkLnZveGVscyk7XG4gIGFzc2VydC5lcXVhbChhZnRlckJ1aWxkLmVudGl0aWVzLCBiZWZvcmVCdWlsZC5lbnRpdGllcyk7XG4gIGFzc2VydC5ub3RFcXVhbChhZnRlckJ1aWxkLmludmVudG9yeSwgYmVmb3JlQnVpbGQuaW52ZW50b3J5KTtcbiAgYXNzZXJ0LmVxdWFsKHdvcmxkLnN0cnVjdHVyZXMuZ2V0KHBsYW4uaWQpPy5raW5kLCAncGF0aCcpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGVkaXRzT3V0c2lkZUVudmVsb3BlKHdvcmxkLCBNMDAyX0xBWU9VVC5lbnZlbG9wZSksIFtdKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChjaGVja0Rlcml2ZWRDYWNoZXMod29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiksIFtdKTtcbn0pO1xuXG50ZXN0KCd0ZXJyYWNlcyBwbGFuIGZyb20gcGlubmVkIGJhbmRzLCByZXF1aXJlIHNvaWwsIGFuZCBwYXkgZXhhY3QgY29zdHMnLCAoKSA9PiB7XG4gIGNvbnN0IG0gPSBmaXh0dXJlKCk7XG4gIGNvbnN0IHdvcmxkID0gbS53b3JsZDtcbiAgY29uc3Qgb3V0c2lkZUJlZm9yZSA9IGNhbm9uaWNhbFJlZ2lvbkhhc2goXG4gICAgd29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiwgW00wMDJfTEFZT1VULmVudmVsb3BlWzJdXSxcbiAgKS5oYXNoO1xuICBjb25zdCBwcmVwID0gcHJlcGFyZUZhcm0obSwgdHJ1ZSk7XG5cbiAgYXNzZXJ0LmVxdWFsKHByZXAubGVkZ2VyLmN1dFZvbHVtZSwgNDApO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIuZmlsbFZvbHVtZSwgMzMpO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIudm94ZWxFZGl0cywgMTA3KTtcbiAgYXNzZXJ0LmVxdWFsKHByZXAubGVkZ2VyLnN1cmZhY2VFZGl0cywgMzQpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHByZXAubGVkZ2VyLmVudGl0aWVzQ2xlYXJlZC5tYXAoKGUpID0+IGUuZW50aXR5SWQpLCBbXG4gICAgJ2hlcm86c3R5bF9vcmU6LTM4Oi00MicsXG4gICAgJ2hlcm86c3R5bF90cmVlX2Jsb3Nzb206LTI4Oi0zOCcsXG4gIF0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKHByZXAubGVkZ2VyLnJlc291cmNlc0dhaW5lZCwgeyBvcmU6IDgsIHdvb2Q6IDEyIH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKHByZXAubGVkZ2VyLmludmVudG9yeUFmdGVyLCB7IG9yZTogOCwgc3RvbmU6IDQ4LCB3b29kOiAzNiB9KTtcbiAgYXNzZXJ0LmVxdWFsKFxuICAgIGNhbm9uaWNhbFJlZ2lvbkhhc2god29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiwgW00wMDJfTEFZT1VULmVudmVsb3BlWzJdXSkuaGFzaCxcbiAgICBvdXRzaWRlQmVmb3JlLFxuICAgICdmYXJtIHByZXBhcmF0aW9uIG11c3Qgc3RheSBpbnNpZGUgaXRzIGV4YWN0IGVudmVsb3BlJyxcbiAgKTtcblxuICBmb3IgKGNvbnN0IGJhbmQgb2YgTTAwMl9URVJSQUNFX0JBTkRTKSB7XG4gICAgZm9yIChsZXQgeiA9IGJhbmQuejA7IHogPD0gYmFuZC56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gbS5sYXlvdXQuZmFybS5yZWN0LngwOyB4IDw9IG0ubGF5b3V0LmZhcm0ucmVjdC54MTsgeCsrKSB7XG4gICAgICAgIGFzc2VydC5lcXVhbChzdXJmYWNlQXQod29ybGQsIHgsIHopLCBiYW5kLnksIGBjb2x1bW4gJHt4fSwke3p9YCk7XG4gICAgICAgIGFzc2VydC5lcXVhbCh0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIHgsIHopLCBNQVQuU09JTCwgYHRvcCAke3h9LCR7en1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBwbGFubmVkID0gcGxhblN0cnVjdHVyZSh3b3JsZCwgZmFybVByb3Bvc2FsKG0pKTtcbiAgYXNzZXJ0LmVxdWFsKHBsYW5uZWQub2ssIHRydWUpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybjtcbiAgY29uc3QgcGxhbiA9IHBsYW5uZWQucGxhbjtcbiAgYXNzZXJ0LmVxdWFsKHBsYW4ubW9kdWxlcy5sZW5ndGgsIDE0KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChwbGFuLmNvc3QsIHsgd29vZDogNiwgc3RvbmU6IDEyIH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKHBsYW4udGVycmFjZXMsIE0wMDJfVEVSUkFDRV9CQU5EUyk7XG4gIGFzc2VydC5kZWVwRXF1YWwocGxhbi5lbnZlbG9wZSwgW1xuICAgIHsgeDA6IC0zOSwgejA6IC00MywgeDE6IC0yNiwgejE6IC0zNCwgeTA6IDEzLCB5MTogMTggfSxcbiAgXSk7XG5cbiAgY29uc3QgYmVkcyA9IHBsYW4ubW9kdWxlcy5maWx0ZXIoKG1vZCkgPT4gbW9kLmtpbmQgPT09ICdzb2lsX2JlZCcpO1xuICBjb25zdCByb3dzID0gcGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ2Nyb3Bfcm93Jyk7XG4gIGNvbnN0IHdhbGxzID0gcGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ3JldGFpbmluZ193YWxsJyk7XG4gIGFzc2VydC5lcXVhbChiZWRzLmxlbmd0aCwgMyk7XG4gIGFzc2VydC5lcXVhbChyb3dzLmxlbmd0aCwgOSk7XG4gIGFzc2VydC5lcXVhbCh3YWxscy5sZW5ndGgsIDIpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGJlZHMubWFwKChtb2QpID0+IG1vZC55KSwgWzE2LCAxNSwgMTRdKTtcbiAgZm9yIChjb25zdCByb3cgb2Ygcm93cykge1xuICAgIGFzc2VydC5vayhbMTYuMTgsIDE1LjE4LCAxNC4xOF0uaW5jbHVkZXMocm93LnkpKTtcbiAgfVxuICBmb3IgKGNvbnN0IHdhbGwgb2Ygd2FsbHMpIHtcbiAgICBhc3NlcnQuZXF1YWwod2FsbC5oLCAxKTtcbiAgfVxuXG4gIGNvbnN0IGJlZm9yZUJ1aWxkID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBidWlsdCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyKCksIGZhcm1Qcm9wb3NhbChtKSk7XG4gIGFzc2VydC5lcXVhbChidWlsdC5vaywgdHJ1ZSwgYnVpbHQub2sgPyAnJyA6IGJ1aWx0LnJlYXNvbnMuam9pbignOyAnKSk7XG4gIGlmICghYnVpbHQub2spIHJldHVybjtcbiAgYXNzZXJ0LmVxdWFsKGJ1aWx0LmxlZGdlci5tb2R1bGVDb3VudCwgMTQpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGJ1aWx0LmxlZGdlci5jb3N0UGFpZCwgeyB3b29kOiA2LCBzdG9uZTogMTIgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoYnVpbHQubGVkZ2VyLmludmVudG9yeUJlZm9yZSwgeyBvcmU6IDgsIHN0b25lOiA0OCwgd29vZDogMzYgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoYnVpbHQubGVkZ2VyLmludmVudG9yeUFmdGVyLCB7IG9yZTogOCwgc3RvbmU6IDM2LCB3b29kOiAzMCB9KTtcblxuICBjb25zdCBhZnRlckJ1aWxkID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXJCdWlsZC52b3hlbHMsIGJlZm9yZUJ1aWxkLnZveGVscyk7XG4gIGFzc2VydC5ub3RFcXVhbChhZnRlckJ1aWxkLmludmVudG9yeSwgYmVmb3JlQnVpbGQuaW52ZW50b3J5KTtcbiAgYXNzZXJ0LmVxdWFsKHdvcmxkLnN0cnVjdHVyZXMuZ2V0KHBsYW4uaWQpPy5raW5kLCAndGVycmFjZScpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGVkaXRzT3V0c2lkZUVudmVsb3BlKHdvcmxkLCBNMDAyX0xBWU9VVC5lbnZlbG9wZSksIFtdKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChjaGVja0Rlcml2ZWRDYWNoZXMod29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiksIFtdKTtcbn0pO1xuXG50ZXN0KCdzdHJ1Y3R1cmUgYXV0aG9yaXphdGlvbiByZWplY3RzIGZvcmdlZCwgc3RhbGUsIHBvb3IgYW5kIG91dC1vZi1lbnZlbG9wZSB3b3JrJywgKCkgPT4ge1xuICBjb25zdCBtID0gZml4dHVyZSgpO1xuICBwcmVwYXJlSG91c2UobSk7XG4gIGNvbnN0IHdvcmxkID0gbS53b3JsZDtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5TdHJ1Y3R1cmUod29ybGQsIGhvdXNlUHJvcG9zYWwobSkpO1xuICBhc3NlcnQuZXF1YWwocGxhbm5lZC5vaywgdHJ1ZSk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuO1xuICBjb25zdCBwbGFuID0gcGxhbm5lZC5wbGFuO1xuICBjb25zdCBkZWNpc2lvbiA9IHN0cnVjdHVyZUF1dGhvcml6ZXIoKS5hdXRob3JpemUod29ybGQsIHBsYW4pO1xuICBhc3NlcnQuZXF1YWwoZGVjaXNpb24ub2ssIHRydWUpO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSByZXR1cm47XG4gIGNvbnN0IHRva2VuID0gZGVjaXNpb24uYXV0aG9yaXphdGlvbjtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuXG4gIGNvbnN0IGZvcmdlZERpZ2VzdCA9IGV4ZWN1dGVTdHJ1Y3R1cmUod29ybGQsIHBsYW4sIHtcbiAgICAuLi50b2tlbiwgcGxhbkRpZ2VzdDogJzAwMDAwMDAwMDAwMDAwMDAnLFxuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKGZvcmdlZERpZ2VzdC5vaywgZmFsc2UpO1xuICBpZiAoIWZvcmdlZERpZ2VzdC5vaykgYXNzZXJ0LmVxdWFsKGZvcmdlZERpZ2VzdC5jb2RlLCAnZGlnZXN0X21pc21hdGNoJyk7XG5cbiAgY29uc3QgZm9yZ2VkQXV0aG9yaXR5ID0gZXhlY3V0ZVN0cnVjdHVyZSh3b3JsZCwgcGxhbiwge1xuICAgIC4uLnRva2VuLCBhdXRob3JpdHk6ICdtYWdpY2Jsb2NrJyBhcyBuZXZlcixcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChmb3JnZWRBdXRob3JpdHkub2ssIGZhbHNlKTtcbiAgaWYgKCFmb3JnZWRBdXRob3JpdHkub2spIGFzc2VydC5lcXVhbChmb3JnZWRBdXRob3JpdHkuY29kZSwgJ3Vuc3VwcG9ydGVkX2F1dGhvcml0eScpO1xuXG4gIGNvbnN0IG5hcnJvd2VkID0gZXhlY3V0ZVN0cnVjdHVyZSh3b3JsZCwgcGxhbiwge1xuICAgIC4uLnRva2VuLFxuICAgIGVudmVsb3BlOiBbeyAuLi50b2tlbi5lbnZlbG9wZVswXSwgeDA6IHRva2VuLmVudmVsb3BlWzBdLngwICsgMSB9XSxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChuYXJyb3dlZC5vaywgZmFsc2UpO1xuICBpZiAoIW5hcnJvd2VkLm9rKSBhc3NlcnQuZXF1YWwobmFycm93ZWQuY29kZSwgJ2VudmVsb3BlX21pc21hdGNoJyk7XG5cbiAgY29uc3QgbGltaXRlZE1vZHVsZXMgPSBuZXcgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyKFxuICAgIHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0sIHsgbWF4TW9kdWxlczogMTAgfSxcbiAgKS5hdXRob3JpemUod29ybGQsIHBsYW4pO1xuICBhc3NlcnQuZXF1YWwobGltaXRlZE1vZHVsZXMub2ssIGZhbHNlKTtcbiAgYXNzZXJ0Lm9rKGxpbWl0ZWRNb2R1bGVzLnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnMTcgbW9kdWxlcyBleGNlZWQgbGltaXQgMTAnKSkpO1xuXG4gIGNvbnN0IGxpbWl0ZWRDb3N0ID0gbmV3IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcihcbiAgICB7IGVudmVsb3BlOiBNMDAyX0xBWU9VVC5lbnZlbG9wZSB9LCB7IG1heENvc3Q6IDEwIH0sXG4gICkuYXV0aG9yaXplKHdvcmxkLCBwbGFuKTtcbiAgYXNzZXJ0LmVxdWFsKGxpbWl0ZWRDb3N0Lm9rLCBmYWxzZSk7XG4gIGFzc2VydC5vayhsaW1pdGVkQ29zdC5yZWFzb25zLnNvbWUoKHIpID0+IHIuaW5jbHVkZXMoJ2Nvc3QgMjggZXhjZWVkcyBsaW1pdCAxMCcpKSk7XG5cbiAgLy8gQSBtb2R1bGUgcHVzaGVkIG91dHNpZGUgdGhlIHBsYW4gZW52ZWxvcGUgaXMgcmVmdXNlZCBiZWZvcmUgZXhlY3V0aW9uLlxuICBjb25zdCBmb3JnZWQ6IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgLi4ucGxhbixcbiAgICBtb2R1bGVzOiBwbGFuLm1vZHVsZXMubWFwKChtb2QsIGkpID0+IChpID09PSAwID8geyAuLi5tb2QsIHg6IG1vZC54ICsgMjAgfSA6IG1vZCkpLFxuICB9O1xuICBmb3JnZWQuaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KGZvcmdlZCl9YDtcbiAgY29uc3Qgb3V0c2lkZSA9IHN0cnVjdHVyZUF1dGhvcml6ZXIoKS5hdXRob3JpemUod29ybGQsIGZvcmdlZCk7XG4gIGFzc2VydC5lcXVhbChvdXRzaWRlLm9rLCBmYWxzZSk7XG4gIGFzc2VydC5vayhvdXRzaWRlLnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnb3V0c2lkZSB0aGUgcGxhbiBlbnZlbG9wZScpXG4gICAgfHwgci5pbmNsdWRlcygnb3V0c2lkZSB0aGUgbG9jYWwgcG9saWN5JykpKTtcblxuICAvLyBFdmVuIGEgdG9rZW4gd2l0aCB0aGUgZm9yZ2VkIGRpZ2VzdCBjYW5ub3QgZ2V0IHBhc3QgdGhlIGV4ZWN1dG9yJ3Mgb3duXG4gIC8vIG1vZHVsZS1pbi1lbnZlbG9wZSBjaGVjay5cbiAgY29uc3QgZm9yZ2VkRXhlY3V0aW9uID0gZXhlY3V0ZVN0cnVjdHVyZSh3b3JsZCwgZm9yZ2VkLCB7XG4gICAgLi4udG9rZW4sIHBsYW5EaWdlc3Q6IHN0cnVjdHVyZURpZ2VzdChmb3JnZWQpLFxuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKGZvcmdlZEV4ZWN1dGlvbi5vaywgZmFsc2UpO1xuICBpZiAoIWZvcmdlZEV4ZWN1dGlvbi5vaykge1xuICAgIGFzc2VydC5lcXVhbChmb3JnZWRFeGVjdXRpb24uY29kZSwgJ3VuYXV0aG9yaXplZF9zdHJ1Y3R1cmUnKTtcbiAgICBhc3NlcnQub2soZm9yZ2VkRXhlY3V0aW9uLnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZScpKSk7XG4gIH1cblxuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYmVmb3JlKTtcblxuICAvLyBBIGdlbnVpbmUgdG9rZW4gZ29lcyBzdGFsZSBhZnRlciBhbnkgd29ybGQgcmV2aXNpb24gY2hhbmdlLlxuICBhc3NlcnQuZXF1YWwoc2V0Vm94ZWwod29ybGQsIC01NiwgMTEsIC00MywgTUFULlNUT05FKSwgdHJ1ZSk7XG4gIGNvbnN0IGFmdGVyTWFudWFsRWRpdCA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3Qgc3RhbGUgPSBleGVjdXRlU3RydWN0dXJlKHdvcmxkLCBwbGFuLCB0b2tlbik7XG4gIGFzc2VydC5lcXVhbChzdGFsZS5vaywgZmFsc2UpO1xuICBpZiAoIXN0YWxlLm9rKSBhc3NlcnQuZXF1YWwoc3RhbGUuY29kZSwgJ3N0YWxlX2F1dGhvcml6YXRpb24nKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGFmdGVyTWFudWFsRWRpdCk7XG59KTtcblxudGVzdCgnZXhlY3V0b3IgcmUtY2hlY2tzIHN1cmZhY2UgYW5kIG9ic3RydWN0aW9ucyBiZWZvcmUgY2hhcmdpbmcgcmVzb3VyY2VzJywgKCkgPT4ge1xuICBjb25zdCBtID0gZml4dHVyZSgpO1xuICBwcmVwYXJlSG91c2UobSk7XG4gIGNvbnN0IHdvcmxkID0gbS53b3JsZDtcblxuICAvLyBBIHBsYW4gd2hvc2Ugc3VyZmFjZSBzYW1wbGVzIGRpc2FncmVlIHdpdGggdGhlIGN1cnJlbnQgd29ybGQgaXMgcmVmdXNlZFxuICAvLyBldmVuIHdoZW4gaXRzIGRpZ2VzdCBhbmQgYXV0aG9yaXphdGlvbiBhcmUgaW50ZXJuYWxseSBjb25zaXN0ZW50LiBUaGVcbiAgLy8gYXV0aG9yaXplciBjaGVja3MgZW52ZWxvcGVzLCBub3QgdGVycmFpbjsgdGhlIGV4ZWN1dG9yIG11c3QgcmUtcmVhZCBpdC5cbiAgY29uc3Qgc3VyZmFjZVBsYW4gPSBwbGFuU3RydWN0dXJlKHdvcmxkLCBob3VzZVByb3Bvc2FsKG0pKTtcbiAgYXNzZXJ0LmVxdWFsKHN1cmZhY2VQbGFuLm9rLCB0cnVlKTtcbiAgaWYgKCFzdXJmYWNlUGxhbi5vaykgcmV0dXJuO1xuICBjb25zdCByYWlzZWQ6IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgLi4uc3VyZmFjZVBsYW4ucGxhbixcbiAgICBzdXJmYWNlOiBzdXJmYWNlUGxhbi5wbGFuLnN1cmZhY2UubWFwKChzLCBpKSA9PiAoaSA9PT0gMCA/IHsgLi4ucywgeTogcy55ICsgMSB9IDogcykpLFxuICB9O1xuICByYWlzZWQuaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHJhaXNlZCl9YDtcbiAgY29uc3QgcmFpc2VkVG9rZW4gPSBzdHJ1Y3R1cmVBdXRob3JpemVyKCkuYXV0aG9yaXplKHdvcmxkLCByYWlzZWQpO1xuICBhc3NlcnQuZXF1YWwocmFpc2VkVG9rZW4ub2ssIHRydWUpO1xuICBpZiAoIXJhaXNlZFRva2VuLm9rIHx8ICFyYWlzZWRUb2tlbi5hdXRob3JpemF0aW9uKSByZXR1cm47XG4gIGNvbnN0IGJlZm9yZVJhaXNlZCA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3Qgb25SYWlzZWQgPSBleGVjdXRlU3RydWN0dXJlKHdvcmxkLCByYWlzZWQsIHJhaXNlZFRva2VuLmF1dGhvcml6YXRpb24pO1xuICBhc3NlcnQuZXF1YWwob25SYWlzZWQub2ssIGZhbHNlKTtcbiAgaWYgKCFvblJhaXNlZC5vaykge1xuICAgIGFzc2VydC5lcXVhbChvblJhaXNlZC5jb2RlLCAndW5hdXRob3JpemVkX3N0cnVjdHVyZScpO1xuICAgIGFzc2VydC5vayhvblJhaXNlZC5yZWFzb25zLnNvbWUoKHIpID0+IHIuaW5jbHVkZXMoJ2V4cGVjdGVkIDEyJykpKTtcbiAgfVxuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYmVmb3JlUmFpc2VkKTtcblxuICAvLyBBIG5ldyBvYnN0cnVjdGlvbiBvbiB0aGUgZm9vdHByaW50IGlzIGNhdWdodCBieSB0aGUgZXhlY3V0b3IgZXZlbiB0aG91Z2hcbiAgLy8gdGhlIHJldmlzaW9uIGFuZCBzdXJmYWNlIGFyZSB1bmNoYW5nZWQuXG4gIGNvbnN0IGJsb2NrZWQgPSBmaXh0dXJlKCk7XG4gIHByZXBhcmVIb3VzZShibG9ja2VkKTtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5TdHJ1Y3R1cmUoYmxvY2tlZC53b3JsZCwgaG91c2VQcm9wb3NhbChibG9ja2VkKSk7XG4gIGFzc2VydC5lcXVhbChwbGFubmVkLm9rLCB0cnVlKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm47XG4gIGNvbnN0IHRva2VuID0gc3RydWN0dXJlQXV0aG9yaXplcigpLmF1dGhvcml6ZShibG9ja2VkLndvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBhc3NlcnQuZXF1YWwodG9rZW4ub2ssIHRydWUpO1xuICBpZiAoIXRva2VuLm9rIHx8ICF0b2tlbi5hdXRob3JpemF0aW9uKSByZXR1cm47XG4gIGNvbnN0IGV4dHJhID0ge1xuICAgIGlkOiAndGVzdDpob3VzZS1yb2NrJyxcbiAgICBraW5kOiAnc3R5bF9vcmUnIGFzIGNvbnN0LFxuICAgIGNodW5rOiAnMzAsMzAnLFxuICAgIHg6IC01Ni41LCB5OiAxMSwgejogLTQzLjUsXG4gICAgcm90OiAwLCBzY2FsZTogMSwgdmFyaWFudDogMCxcbiAgICByZXNvdXJjZTogJ29yZScgYXMgY29uc3QsIHJlbWFpbmluZzogMiwgeWllbGRQZXJIYXJ2ZXN0OiAxLFxuICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiBmYWxzZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICB9O1xuICBibG9ja2VkLndvcmxkLmVudGl0aWVzLnNldChleHRyYS5pZCwgZXh0cmEpO1xuICBibG9ja2VkLndvcmxkLmVudGl0eUNodW5rcy5nZXQoJzMwLDMwJykhLnB1c2goZXh0cmEuaWQpO1xuICBjb25zdCBiZWZvcmVCbG9ja2VkID0gZmluZ2VycHJpbnQoYmxvY2tlZC53b3JsZCk7XG4gIGNvbnN0IG9uQmxvY2tlZCA9IGV4ZWN1dGVTdHJ1Y3R1cmUoYmxvY2tlZC53b3JsZCwgcGxhbm5lZC5wbGFuLCB0b2tlbi5hdXRob3JpemF0aW9uKTtcbiAgYXNzZXJ0LmVxdWFsKG9uQmxvY2tlZC5vaywgZmFsc2UpO1xuICBpZiAoIW9uQmxvY2tlZC5vaykge1xuICAgIGFzc2VydC5lcXVhbChvbkJsb2NrZWQuY29kZSwgJ3VuYXV0aG9yaXplZF9zdHJ1Y3R1cmUnKTtcbiAgICBhc3NlcnQub2sob25CbG9ja2VkLnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnZm9vdHByaW50IGhhcyAxIG9ic3RydWN0aW9ucycpKSk7XG4gIH1cbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludChibG9ja2VkLndvcmxkKSwgYmVmb3JlQmxvY2tlZCk7XG59KTtcblxudGVzdCgndGhlIHBpbm5lZCBNMDAyIHNjZW5hcmlvIGlzIGRldGVybWluaXN0aWMgYW5kIGxlYXZlcyBvdXRzaWRlIHRlcnJhaW4gYWxvbmUnLCAoKSA9PiB7XG4gIGNvbnN0IGEgPSBjcmVhdGVNMDAyRml4dHVyZSgpO1xuICBjb25zdCBiID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgcmEgPSBydW5NMDAyU2NlbmFyaW8oYSk7XG4gIGNvbnN0IHJiID0gcnVuTTAwMlNjZW5hcmlvKGIpO1xuXG4gIGFzc2VydC5lcXVhbChyYS5vaywgdHJ1ZSwgcmEuZXJyb3JzLmpvaW4oJzsgJykpO1xuICBhc3NlcnQuZXF1YWwocmIub2ssIHRydWUsIHJiLmVycm9ycy5qb2luKCc7ICcpKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5lcnJvcnMsIFtdKTtcblxuICBhc3NlcnQuZGVlcEVxdWFsKHJhLmhvdXNlLnByZXBhcmF0aW9uLCByYi5ob3VzZS5wcmVwYXJhdGlvbik7XG4gIGFzc2VydC5kZWVwRXF1YWwocmEucGF0aC5wcmVwYXJhdGlvbiwgcmIucGF0aC5wcmVwYXJhdGlvbik7XG4gIGFzc2VydC5kZWVwRXF1YWwocmEuZmFybS5wcmVwYXJhdGlvbiwgcmIuZmFybS5wcmVwYXJhdGlvbik7XG4gIGFzc2VydC5kZWVwRXF1YWwocmEuaG91c2Uuc3RydWN0dXJlLCByYi5ob3VzZS5zdHJ1Y3R1cmUpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHJhLnBhdGguc3RydWN0dXJlLCByYi5wYXRoLnN0cnVjdHVyZSk7XG4gIGFzc2VydC5kZWVwRXF1YWwocmEuZmFybS5zdHJ1Y3R1cmUsIHJiLmZhcm0uc3RydWN0dXJlKTtcblxuICBhc3NlcnQuZXF1YWwocmEuaG91c2UucHJlcGFyYXRpb24/LmN1dFZvbHVtZSwgMyk7XG4gIGFzc2VydC5lcXVhbChyYS5ob3VzZS5wcmVwYXJhdGlvbj8uZmlsbFZvbHVtZSwgMTgpO1xuICBhc3NlcnQuZXF1YWwocmEuaG91c2UucHJlcGFyYXRpb24/LnZveGVsRWRpdHMsIDIxKTtcbiAgYXNzZXJ0LmVxdWFsKHJhLnBhdGgucHJlcGFyYXRpb24/LmN1dFZvbHVtZSwgMTIpO1xuICBhc3NlcnQuZXF1YWwocmEucGF0aC5wcmVwYXJhdGlvbj8uZmlsbFZvbHVtZSwgMCk7XG4gIGFzc2VydC5lcXVhbChyYS5wYXRoLnByZXBhcmF0aW9uPy52b3hlbEVkaXRzLCAzOSk7XG4gIGFzc2VydC5lcXVhbChyYS5wYXRoLnByZXBhcmF0aW9uPy5zdXJmYWNlRWRpdHMsIDI3KTtcbiAgYXNzZXJ0LmVxdWFsKHJhLmZhcm0ucHJlcGFyYXRpb24/LmN1dFZvbHVtZSwgNDApO1xuICBhc3NlcnQuZXF1YWwocmEuZmFybS5wcmVwYXJhdGlvbj8uZmlsbFZvbHVtZSwgMzMpO1xuICBhc3NlcnQuZXF1YWwocmEuZmFybS5wcmVwYXJhdGlvbj8udm94ZWxFZGl0cywgMTA3KTtcbiAgYXNzZXJ0LmVxdWFsKHJhLmZhcm0ucHJlcGFyYXRpb24/LnN1cmZhY2VFZGl0cywgMzQpO1xuXG4gIGFzc2VydC5lcXVhbChyYS5ob3VzZS5zdHJ1Y3R1cmU/Lm1vZHVsZUNvdW50LCAxNyk7XG4gIGFzc2VydC5lcXVhbChyYS5wYXRoLnN0cnVjdHVyZT8ubW9kdWxlQ291bnQsIDI3KTtcbiAgYXNzZXJ0LmVxdWFsKHJhLmZhcm0uc3RydWN0dXJlPy5tb2R1bGVDb3VudCwgMTQpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHJhLmhvdXNlLnN0cnVjdHVyZT8uY29zdFBhaWQsIHsgd29vZDogMTAsIHN0b25lOiAxOCB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5wYXRoLnN0cnVjdHVyZT8uY29zdFBhaWQsIHsgc3RvbmU6IDkgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwocmEuZmFybS5zdHJ1Y3R1cmU/LmNvc3RQYWlkLCB7IHdvb2Q6IDYsIHN0b25lOiAxMiB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChtMDAyU3RydWN0dXJlQ29zdHMocmEpLCB7IHdvb2Q6IDE2LCBzdG9uZTogMzkgfSk7XG5cbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5pbnZlbnRvcnlCZWZvcmUsIHsgc3RvbmU6IDQ4LCB3b29kOiAyNCB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5pbnZlbnRvcnlBZnRlciwgeyBvcmU6IDgsIHN0b25lOiA5LCB3b29kOiAyMCB9KTtcbiAgYXNzZXJ0LmVxdWFsKGEud29ybGQuc3RydWN0dXJlcy5zaXplLCAzKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChbLi4uYS53b3JsZC5zdHJ1Y3R1cmVzLmtleXMoKV0sIFtcbiAgICAnc3RydWN0dXJlOjdmMmFiNTQ5ZTQ2ZDhkZGInLFxuICAgICdzdHJ1Y3R1cmU6MGU2OGQ2YWY5NzRkN2E1NScsXG4gICAgJ3N0cnVjdHVyZTo4YzRhNjhjMGU4NTM2MzIzJyxcbiAgXSk7XG4gIC8vIFJldmlzaW9uIHN0ZXBzOiAyMSBob3VzZSBlZGl0cywgMzkgcGF0aCBlZGl0cywgMTA3IGZhcm0gZWRpdHMsIHR3byBlbnRpdHlcbiAgLy8gcmVtb3ZhbHMgZHVyaW5nIGZhcm0gcHJlcGFyYXRpb24sIGFuZCBvbmUgY29tbWl0IHBlciBzdHJ1Y3R1cmUuXG4gIGNvbnN0IGhvdXNlUHJlcCA9IHJhLmhvdXNlLnByZXBhcmF0aW9uITtcbiAgY29uc3QgaG91c2VCdWlsZCA9IHJhLmhvdXNlLnN0cnVjdHVyZSE7XG4gIGNvbnN0IHBhdGhQcmVwID0gcmEucGF0aC5wcmVwYXJhdGlvbiE7XG4gIGNvbnN0IHBhdGhCdWlsZCA9IHJhLnBhdGguc3RydWN0dXJlITtcbiAgY29uc3QgZmFybVByZXAgPSByYS5mYXJtLnByZXBhcmF0aW9uITtcbiAgY29uc3QgZmFybUJ1aWxkID0gcmEuZmFybS5zdHJ1Y3R1cmUhO1xuICBhc3NlcnQuZXF1YWwoaG91c2VQcmVwLnJldmlzaW9uQWZ0ZXIgLSBob3VzZVByZXAucmV2aXNpb25CZWZvcmUsIDIxKTtcbiAgYXNzZXJ0LmVxdWFsKGhvdXNlQnVpbGQucmV2aXNpb25BZnRlciAtIGhvdXNlQnVpbGQucmV2aXNpb25CZWZvcmUsIDEpO1xuICBhc3NlcnQuZXF1YWwocGF0aFByZXAucmV2aXNpb25BZnRlciAtIHBhdGhQcmVwLnJldmlzaW9uQmVmb3JlLCAzOSk7XG4gIGFzc2VydC5lcXVhbChwYXRoQnVpbGQucmV2aXNpb25BZnRlciAtIHBhdGhCdWlsZC5yZXZpc2lvbkJlZm9yZSwgMSk7XG4gIGFzc2VydC5lcXVhbChmYXJtUHJlcC5yZXZpc2lvbkFmdGVyIC0gZmFybVByZXAucmV2aXNpb25CZWZvcmUsIDEwOSk7XG4gIGFzc2VydC5lcXVhbChmYXJtQnVpbGQucmV2aXNpb25BZnRlciAtIGZhcm1CdWlsZC5yZXZpc2lvbkJlZm9yZSwgMSk7XG4gIGFzc2VydC5lcXVhbChcbiAgICBhLndvcmxkLnJldmlzaW9uIC0gaG91c2VQcmVwLnJldmlzaW9uQmVmb3JlLFxuICAgIDE3MixcbiAgICAnMjEgKyAxICsgMzkgKyAxICsgMTA5ICsgMSByZXZpc2lvbiBzdGVwcycsXG4gICk7XG5cbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5oYXNoZXMsIHJiLmhhc2hlcyk7XG4gIGFzc2VydC5lcXVhbChcbiAgICBjYW5vbmljYWxSZWdpb25IYXNoKGEud29ybGQsIGEubGF5b3V0LnByb3RlY3RlZFJlZ2lvbikuaGFzaCxcbiAgICBjYW5vbmljYWxSZWdpb25IYXNoKGIud29ybGQsIGIubGF5b3V0LnByb3RlY3RlZFJlZ2lvbikuaGFzaCxcbiAgKTtcbiAgYXNzZXJ0LmVxdWFsKFxuICAgIGNhbm9uaWNhbEVudGl0eUhhc2goYS53b3JsZCwgYS5sYXlvdXQucHJvdGVjdGVkUmVnaW9uKSxcbiAgICBjYW5vbmljYWxFbnRpdHlIYXNoKGIud29ybGQsIGIubGF5b3V0LnByb3RlY3RlZFJlZ2lvbiksXG4gICk7XG4gIGFzc2VydC5lcXVhbChjYW5vbmljYWxJbnZlbnRvcnlIYXNoKGEud29ybGQpLCBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKGIud29ybGQpKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChlZGl0c091dHNpZGVFbnZlbG9wZShhLndvcmxkLCBhLmxheW91dC5lbnZlbG9wZSksIFtdKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChjaGVja0Rlcml2ZWRDYWNoZXMoYS53b3JsZCwgYS5sYXlvdXQucHJvdGVjdGVkUmVnaW9uKSwgW10pO1xuXG4gIC8vIEhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlcyBhcmUgYWxsIHByZXNlbnQgb24gcHJlcGFyZWQsIHJlYWwgdGVycmFpbi5cbiAgYXNzZXJ0LmVxdWFsKHN1cmZhY2VBdChhLndvcmxkLCAtNTYsIC00MyksIDExKTtcbiAgYXNzZXJ0LmVxdWFsKHRvcE1hdGVyaWFsQXRXb3JsZChhLndvcmxkLCAtNDksIC00MyksIE1BVC5HUkFWRUwpO1xuICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KGEud29ybGQsIC0zMiwgLTQxKSwgMTYpO1xuICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KGEud29ybGQsIC0zMiwgLTM4KSwgMTUpO1xuICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KGEud29ybGQsIC0zMiwgLTM2KSwgMTQpO1xuICBhc3NlcnQuZXF1YWwodG9wTWF0ZXJpYWxBdFdvcmxkKGEud29ybGQsIC0zMiwgLTM2KSwgTUFULlNPSUwpO1xufSk7XG4iLCAiLy8gUHJpdmF0ZSBtaWdyYXRpb24gcmVwbGF5IG9ubHkuIFJldGlyZWQgZW50aXRpZXMgbGl2ZSBpbiB0aGlzIFdvcmxkIHdoaWxlIGFuXG4vLyBhY2NlcHRlZCBoaXN0b3JpY2FsIGpvdXJuYWwgaXMgY2hlY2tlZDsgbm8gcHVibGljIGNvbW1hbmQgZW5hYmxlcyB0aGlzIG1vZGUuXG5pbnRlcmZhY2UgUmVwbGF5U3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIGhpc3RvcmljYWxIYXNoOiBib29sZWFuO1xuICBtaWdyYXRlZDogYm9vbGVhbjtcbn1cblxuY29uc3Qgc3RhdGVzID0gbmV3IFdlYWtNYXA8b2JqZWN0LCBSZXBsYXlTdGF0ZT4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxheVN0b25lU3RhdGUod29ybGQ6IG9iamVjdCk6IFJlcGxheVN0YXRlIHtcbiAgbGV0IHN0YXRlID0gc3RhdGVzLmdldCh3b3JsZCk7XG4gIGlmICghc3RhdGUpIHsgc3RhdGUgPSB7IGFjdGl2ZTogZmFsc2UsIGhpc3RvcmljYWxIYXNoOiBmYWxzZSwgbWlncmF0ZWQ6IGZhbHNlIH07IHN0YXRlcy5zZXQod29ybGQsIHN0YXRlKTsgfVxuICByZXR1cm4gc3RhdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IHRydWU7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbiAgc3RhdGUubWlncmF0ZWQgPSBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/LmFjdGl2ZSA/PyBmYWxzZTtcbn1cblxuLyoqIFNuYXBzaG90IGhhc2hlcyBiZWZvcmUgYW5kIGR1cmluZyB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheSBpbmNsdWRlIHN0b25lcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5oaXN0b3JpY2FsSGFzaCA/PyBmYWxzZTtcbn1cblxuLyoqIEEgbWlncmF0ZWQgc25hcHNob3QgYWxyZWFkeSBoYXMgcmV0aXJlbWVudCB0b21ic3RvbmVzIGluIGdlbmVyYXRlZCBjaHVua3MuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5taWdyYXRlZCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lm1pZ3JhdGVkID8/IGZhbHNlO1xufVxuXG4vKiogRXhpdCBoaXN0b3JpY2FsIG1vZGUgYWZ0ZXIgYWxsIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBoYXNoZXMgaGF2ZSBwYXNzZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZmluaXNoU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSBmYWxzZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSBmYWxzZTtcbiAgc3RhdGUubWlncmF0ZWQgPSB0cnVlO1xufVxuIiwgIi8vIERldGVybWluaXN0aWMgaGFzaCwgbm9pc2UgYW5kIG1hdGggaGVscGVycyBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIuXG4vLyBQdXJlIFR5cGVTY3JpcHQgKEQtMDA1KS4gRXh0cmFjdGVkIGZyb20gd29ybGQudHMgdW5jaGFuZ2VkIHNvIHRlcnJhaW5cbi8vIGdlbmVyYXRvcnMgb2YgZXZlcnkgdmVyc2lvbiB1c2UgaWRlbnRpY2FsIHByaW1pdGl2ZXMuXG5leHBvcnQgY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuZXhwb3J0IGNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuZXhwb3J0IGNvbnN0IHNtb290aHN0ZXAgPSAoZTA6IG51bWJlciwgZTE6IG51bWJlciwgeDogbnVtYmVyKSA9PiB7XG4gIGNvbnN0IHQgPSBjbGFtcCgoeCAtIGUwKSAvIChlMSAtIGUwKSwgMCwgMSk7XG4gIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xufTtcblxuLy8gLS0tLS0tLS0tLSBkZXRlcm1pbmlzdGljIGhhc2ggLyBub2lzZSAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gaGFzaDJpKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoM2koeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKSBeIE1hdGguaW11bCh6LCAyMjQ2ODIyNTE5KTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbXVsYmVycnkzMihzZWVkOiBudW1iZXIpOiAoKSA9PiBudW1iZXIge1xuICBsZXQgYSA9IHNlZWQgPj4+IDA7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgYSA9IChhICsgMHg2ZDJiNzlmNSkgPj4+IDA7XG4gICAgbGV0IHQgPSBhO1xuICAgIHQgPSBNYXRoLmltdWwodCBeICh0ID4+PiAxNSksIHQgfCAxKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgdCB8IDYxKTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IHNtb290aCA9ICh0OiBudW1iZXIpID0+IHQgKiB0ICogKDMgLSAyICogdCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSk7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSk7XG4gIGNvbnN0IGEgPSBoYXNoMmkoeGksIHlpLCBzZWVkKSwgYiA9IGhhc2gyaSh4aSArIDEsIHlpLCBzZWVkKTtcbiAgY29uc3QgYyA9IGhhc2gyaSh4aSwgeWkgKyAxLCBzZWVkKSwgZCA9IGhhc2gyaSh4aSArIDEsIHlpICsgMSwgc2VlZCk7XG4gIGNvbnN0IHRvcCA9IGEgKyAoYiAtIGEpICogeGY7XG4gIGNvbnN0IGJvdHRvbSA9IGMgKyAoZCAtIGMpICogeGY7XG4gIHJldHVybiB0b3AgKyAoYm90dG9tIC0gdG9wKSAqIHlmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMih4ICogZnJlcSwgeSAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KSwgemkgPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpLCB6ZiA9IHNtb290aCh6IC0gemkpO1xuICBjb25zdCBjMDAwID0gaGFzaDNpKHhpLCB5aSwgemksIHNlZWQpLCBjMTAwID0gaGFzaDNpKHhpICsgMSwgeWksIHppLCBzZWVkKTtcbiAgY29uc3QgYzAxMCA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSwgc2VlZCksIGMxMTAgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppLCBzZWVkKTtcbiAgY29uc3QgYzAwMSA9IGhhc2gzaSh4aSwgeWksIHppICsgMSwgc2VlZCksIGMxMDEgPSBoYXNoM2koeGkgKyAxLCB5aSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgYzAxMSA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpLCBjMTExID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCB4MDAgPSBjMDAwICsgKGMxMDAgLSBjMDAwKSAqIHhmO1xuICBjb25zdCB4MTAgPSBjMDEwICsgKGMxMTAgLSBjMDEwKSAqIHhmO1xuICBjb25zdCB4MDEgPSBjMDAxICsgKGMxMDEgLSBjMDAxKSAqIHhmO1xuICBjb25zdCB4MTEgPSBjMDExICsgKGMxMTEgLSBjMDExKSAqIHhmO1xuICBjb25zdCB5MCA9IHgwMCArICh4MTAgLSB4MDApICogeWY7XG4gIGNvbnN0IHkxID0geDAxICsgKHgxMSAtIHgwMSkgKiB5ZjtcbiAgcmV0dXJuIHkwICsgKHkxIC0geTApICogemY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0zKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTMoeCAqIGZyZXEsIHkgKiBmcmVxLCB6ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuIiwgIi8vIEh5ZHJvbG9neSBcdTIwMTQgdGhlIGRldGVybWluaXN0aWMgd2F0ZXIgbmV0d29yayBvZiBhIHdvcmxkIChwdXJlIFR5cGVTY3JpcHQsIEQtMDA1KS5cbi8vXG4vLyBUaGlzIGlzIGRlcml2ZWQgKnNpbXVsYXRpb24gZGF0YSosIG5vdCBwcmVzZW50YXRpb246IGl0IGlzIGEgcHVyZSBmdW5jdGlvbiBvZlxuLy8gKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKSBhbmQgaXMgd2hhdCB0ZXJyYWluIGNhcnZpbmcsIHdhdGVyIGZpbGxpbmcsIGZsb3dcbi8vIGRpcmVjdGlvbiBhbmQgZnV0dXJlIGZpc2hpbmcvaXJyaWdhdGlvbi9mbG9vZGluZyBydWxlcyByZWFkLiBJdCBpcyBuZXZlclxuLy8gam91cm5hbGVkIGJlY2F1c2UgaXQgY2FuIGFsd2F5cyBiZSByZWdlbmVyYXRlZCBleGFjdGx5LlxuLy9cbi8vIE5ldHdvcmsgKGJvdGggZ2VuZXJhdG9yIHZlcnNpb25zKTpcbi8vICAgbGFrZSAgXHUyMDE0IHRoZSB2YWxsZXkgbGFrZSBiYXNpbiwgbG9jYXRlZCBmcm9tIHRoZSBhY3R1YWwgZ2VuZXJhdGVkIHRlcnJhaW4uXG4vLyAgIGxvd2VyIFx1MjAxNCB0aGUgbG93bGFuZCByaXZlciBmcm9tIHRoZSBsYWtlIHRvIHRoZSBzb3V0aGVybiBzZWEsIHRyYWNlZCBmcm9tXG4vLyAgICAgICAgICAgdGhlIGFjdHVhbCBjYXJ2ZWQgY2hhbm5lbCAodGhlIHYxIGNoYW5uZWwgaXMgY2FydmVkIG9uICp3YXJwZWQqXG4vLyAgICAgICAgICAgY29vcmRpbmF0ZXMsIHNvIGByaXZlckNlbnRlclhgIGFsb25lIGlzIHVwIHRvIH4xMzUgbSBvZmYpLlxuLy8gR2VuZXJhdG9yIHYyIGFkZHM6XG4vLyAgIHVwcGVyIFx1MjAxNCBhIG1vdW50YWluIHJpdmVyIGZyb20gYSBoaWdobGFuZCB0YXJuIGRvd24gdG8gdGhlIGxha2UsIHdpdGggYVxuLy8gICAgICAgICAgIHdhdGVyLXN1cmZhY2UgbGV2ZWwgdGhhdCBuZXZlciByaXNlcyBkb3duc3RyZWFtLCBjYXNjYWRlcyBhbmQgZmFsbHMuXG4vL1xuLy8gRmxvdyBhbHdheXMgcG9pbnRzIGRvd25zdHJlYW06IHVwcGVyIFx1MjE5MiBsYWtlIFx1MjE5MiBsb3dlciBcdTIxOTIgc2VhLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIG11bGJlcnJ5MzIsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcblxuZXhwb3J0IHR5cGUgSGVpZ2h0U2FtcGxlciA9ICh4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJpdmVyUG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQgb2YgdGhpcyByZWFjaCAobWV0cmVzKS4gKi9cbiAgczogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBlbGV2YXRpb24gKG1ldHJlcywgbWF5IGJlIGZyYWN0aW9uYWwpLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogQ2hhbm5lbCBoYWxmLXdpZHRoIChtZXRyZXMpLiAqL1xuICB3aWR0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWNoSGl0IHtcbiAgLyoqIEhvcml6b250YWwgZGlzdGFuY2UgZnJvbSB0aGUgY2VudHJlbGluZS4gKi9cbiAgZDogbnVtYmVyO1xuICAvKiogSW50ZXJwb2xhdGVkIHdhdGVyIGxldmVsIGF0IHRoZSBuZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIHdpZHRoOiBudW1iZXI7XG4gIC8qKiBVbml0IGRvd25zdHJlYW0gZGlyZWN0aW9uLiAqL1xuICB0eDogbnVtYmVyO1xuICB0ejogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBkcm9wIHBlciBtZXRyZSBhbG9uZyB0aGUgY2hhbm5lbCAoPj0gMCkuICovXG4gIGdyYWRpZW50OiBudW1iZXI7XG4gIC8qKiBBcmMgbGVuZ3RoIG9mIHRoZSBuZWFyZXN0IHBvaW50IGZyb20gdGhlIGRvd25zdHJlYW0gZW5kLiAqL1xuICBzOiBudW1iZXI7XG59XG5cbi8qKlxuICogQSBwb2x5bGluZSByZWFjaCBzdG9yZWQgZG93bnN0cmVhbS1maXJzdC4gTmVhcmVzdC1zZWdtZW50IHF1ZXJpZXMgdXNlIGFcbiAqIHVuaWZvcm0gZ3JpZCB3aG9zZSBjZWxscyBsaXN0IGV2ZXJ5IHNlZ21lbnQgd2l0aGluIGByZWFjaGAgbWV0cmVzLlxuICovXG5leHBvcnQgY2xhc3MgUml2ZXJSZWFjaCB7XG4gIHJlYWRvbmx5IHBvaW50czogUml2ZXJQb2ludFtdO1xuICBwcml2YXRlIHJlYWRvbmx5IGNlbGwgPSAzMjtcbiAgcHJpdmF0ZSByZWFkb25seSBncmlkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXG4gIGNvbnN0cnVjdG9yKHBvaW50czogUml2ZXJQb2ludFtdLCByZWFkb25seSByZWFjaDogbnVtYmVyKSB7XG4gICAgdGhpcy5wb2ludHMgPSBwb2ludHM7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgKyAxIDwgcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBhID0gcG9pbnRzW2ldLCBiID0gcG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IHgwID0gTWF0aC5taW4oYS54LCBiLngpIC0gcmVhY2gsIHgxID0gTWF0aC5tYXgoYS54LCBiLngpICsgcmVhY2g7XG4gICAgICBjb25zdCB6MCA9IE1hdGgubWluKGEueiwgYi56KSAtIHJlYWNoLCB6MSA9IE1hdGgubWF4KGEueiwgYi56KSArIHJlYWNoO1xuICAgICAgZm9yIChsZXQgY3ogPSBNYXRoLmZsb29yKHowIC8gdGhpcy5jZWxsKTsgY3ogPD0gTWF0aC5mbG9vcih6MSAvIHRoaXMuY2VsbCk7IGN6KyspIHtcbiAgICAgICAgZm9yIChsZXQgY3ggPSBNYXRoLmZsb29yKHgwIC8gdGhpcy5jZWxsKTsgY3ggPD0gTWF0aC5mbG9vcih4MSAvIHRoaXMuY2VsbCk7IGN4KyspIHtcbiAgICAgICAgICBjb25zdCBrZXkgPSBjZWxsS2V5KGN4LCBjeik7XG4gICAgICAgICAgbGV0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGtleSk7XG4gICAgICAgICAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgdGhpcy5ncmlkLnNldChrZXksIGxpc3QpOyB9XG4gICAgICAgICAgbGlzdC5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGxlbmd0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wb2ludHNbdGhpcy5wb2ludHMubGVuZ3RoIC0gMV0/LnMgPz8gMDsgfVxuXG4gIC8qKiBOZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQgd2l0aGluIGByZWFjaGAsIG9yIG51bGwuICovXG4gIG5lYXJlc3QoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBSZWFjaEhpdCB8IG51bGwge1xuICAgIGNvbnN0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGNlbGxLZXkoTWF0aC5mbG9vcih4IC8gdGhpcy5jZWxsKSwgTWF0aC5mbG9vcih6IC8gdGhpcy5jZWxsKSkpO1xuICAgIGlmICghbGlzdCkgcmV0dXJuIG51bGw7XG4gICAgbGV0IGJlc3QgPSBJbmZpbml0eSwgYmkgPSAtMSwgYnQgPSAwO1xuICAgIGZvciAoY29uc3QgaSBvZiBsaXN0KSB7XG4gICAgICBjb25zdCBhID0gdGhpcy5wb2ludHNbaV0sIGIgPSB0aGlzLnBvaW50c1tpICsgMV07XG4gICAgICBjb25zdCBkeCA9IGIueCAtIGEueCwgZHogPSBiLnogLSBhLno7XG4gICAgICBjb25zdCBsZW4yID0gZHggKiBkeCArIGR6ICogZHogfHwgMTtcbiAgICAgIGNvbnN0IHQgPSBjbGFtcCgoKHggLSBhLngpICogZHggKyAoeiAtIGEueikgKiBkeikgLyBsZW4yLCAwLCAxKTtcbiAgICAgIGNvbnN0IHB4ID0gYS54ICsgZHggKiB0LCBweiA9IGEueiArIGR6ICogdDtcbiAgICAgIGNvbnN0IGQyID0gKHggLSBweCkgKiogMiArICh6IC0gcHopICoqIDI7XG4gICAgICBpZiAoZDIgPCBiZXN0KSB7IGJlc3QgPSBkMjsgYmkgPSBpOyBidCA9IHQ7IH1cbiAgICB9XG4gICAgaWYgKGJpIDwgMCB8fCBiZXN0ID4gdGhpcy5yZWFjaCAqIHRoaXMucmVhY2gpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tiaV0sIGIgPSB0aGlzLnBvaW50c1tiaSArIDFdO1xuICAgIGNvbnN0IHNlZ0xlbiA9IE1hdGgubWF4KDFlLTYsIGIucyAtIGEucyk7XG4gICAgLy8gUG9pbnRzIGFyZSBzdG9yZWQgZG93bnN0cmVhbS1maXJzdCwgc28gZG93bnN0cmVhbSBpcyBhIDwtIGIuXG4gICAgY29uc3QgdHggPSAoYS54IC0gYi54KSAvIHNlZ0xlbiwgdHogPSAoYS56IC0gYi56KSAvIHNlZ0xlbjtcbiAgICByZXR1cm4ge1xuICAgICAgZDogTWF0aC5zcXJ0KGJlc3QpLFxuICAgICAgbGV2ZWw6IGEubGV2ZWwgKyAoYi5sZXZlbCAtIGEubGV2ZWwpICogYnQsXG4gICAgICB3aWR0aDogYS53aWR0aCArIChiLndpZHRoIC0gYS53aWR0aCkgKiBidCxcbiAgICAgIHR4LCB0eixcbiAgICAgIGdyYWRpZW50OiBNYXRoLm1heCgwLCAoYi5sZXZlbCAtIGEubGV2ZWwpIC8gc2VnTGVuKSxcbiAgICAgIHM6IGEucyArIChiLnMgLSBhLnMpICogYnQsXG4gICAgfTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjZWxsS2V5KGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKGN4ICsgNDA5NikgKiA4MTkyICsgKGN6ICsgNDA5Nik7XG59XG5cbmV4cG9ydCB0eXBlIFdhdGVyQm9keSA9ICdyaXZlcicgfCAnbGFrZScgfCAnc2VhJyB8ICdub25lJztcblxuZXhwb3J0IGludGVyZmFjZSBGbG93U2FtcGxlIHtcbiAgYm9keTogV2F0ZXJCb2R5O1xuICAvKiogVW5pdCBmbG93IGRpcmVjdGlvbiAoemVybyBmb3Igc3RpbGwgd2F0ZXIpLiAqL1xuICBkeDogbnVtYmVyO1xuICBkejogbnVtYmVyO1xuICAvKiogU3VyZmFjZSBjdXJyZW50IHNwZWVkIGluIG0vcy4gKi9cbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIeWRyb2xvZ3lPcHRpb25zIHtcbiAgc2VlZDogbnVtYmVyO1xuICAvKiogR2VuZXJhdG9yIHZlcnNpb24gdGhlIG5ldHdvcmsgYmVsb25ncyB0by4gKi9cbiAgdmVyc2lvbjogbnVtYmVyO1xuICAvKiogQmFzZSBoZWlnaHQgb2YgdGhlICp1bm1vZGlmaWVkIHYxIHNoYXBlKiAodXNlZCB0byBsb2NhdGUgbGFrZS9jaGFubmVsKS4gKi9cbiAgdjFIZWlnaHQ6IEhlaWdodFNhbXBsZXI7XG59XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9naWNhbCBuZXR3b3JrIGZvciBvbmUgKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKS4gKi9cbmV4cG9ydCBjbGFzcyBIeWRyb2xvZ3kge1xuICByZWFkb25seSBzZWVkOiBudW1iZXI7XG4gIHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcbiAgcmVhZG9ubHkgbGFrZTogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcng6IG51bWJlcjsgcno6IG51bWJlciB9O1xuICByZWFkb25seSBsb3dlcjogUml2ZXJSZWFjaDtcbiAgcmVhZG9ubHkgdXBwZXI6IFJpdmVyUmVhY2ggfCBudWxsO1xuICAvKiogVXBwZXItcml2ZXIgc291cmNlIHRhcm4gKHYyIG9ubHkpLiAqL1xuICByZWFkb25seSB0YXJuOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByOiBudW1iZXI7IGxldmVsOiBudW1iZXIgfSB8IG51bGw7XG5cbiAgY29uc3RydWN0b3Iob3B0czogSHlkcm9sb2d5T3B0aW9ucykge1xuICAgIHRoaXMuc2VlZCA9IG9wdHMuc2VlZDtcbiAgICB0aGlzLnZlcnNpb24gPSBvcHRzLnZlcnNpb247XG4gICAgdGhpcy5sYWtlID0gbG9jYXRlTGFrZShvcHRzLnYxSGVpZ2h0KTtcbiAgICB0aGlzLmxvd2VyID0gdHJhY2VMb3dlclJpdmVyKG9wdHMudjFIZWlnaHQsIHRoaXMubGFrZSk7XG4gICAgaWYgKG9wdHMudmVyc2lvbiA+PSAyKSB7XG4gICAgICBjb25zdCB1cHBlciA9IGF1dGhvclVwcGVyUml2ZXIob3B0cy5zZWVkLCB0aGlzLmxha2UpO1xuICAgICAgdGhpcy51cHBlciA9IHVwcGVyLnJlYWNoO1xuICAgICAgdGhpcy50YXJuID0gdXBwZXIudGFybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51cHBlciA9IG51bGw7XG4gICAgICB0aGlzLnRhcm4gPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdXJmYWNlIGN1cnJlbnQgZm9yIGEgd2F0ZXIgY29sdW1uLiBgbGV2ZWxgIGlzIHRoZSBjb2x1bW4ncyB3YXRlciBzdXJmYWNlLFxuICAgKiB1c2VkIHRvIHRlbGwgc2VhLWxldmVsIHdhdGVyIChsYWtlLCBsb3dlciByaXZlciwgc2VhKSBmcm9tIHRoZSB1cHBlciByaXZlci5cbiAgICovXG4gIGZsb3dBdCh4OiBudW1iZXIsIHo6IG51bWJlciwgbGV2ZWw6IG51bWJlcik6IEZsb3dTYW1wbGUge1xuICAgIGlmICh0aGlzLnVwcGVyICYmIGxldmVsID4gMC41KSB7XG4gICAgICBjb25zdCBoaXQgPSB0aGlzLnVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDw9IGhpdC53aWR0aCArIDIpIHtcbiAgICAgICAgY29uc3Qgc3BlZWQgPSBjbGFtcCgwLjU1ICsgaGl0LmdyYWRpZW50ICogOSwgMC40LCA0LjUpO1xuICAgICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogaGl0LnR4LCBkejogaGl0LnR6LCBzcGVlZCB9O1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMudGFybiAmJiBNYXRoLmh5cG90KHggLSB0aGlzLnRhcm4ueCwgeiAtIHRoaXMudGFybi56KSA8IHRoaXMudGFybi5yICsgNCkge1xuICAgICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLnRvd2FyZHMoeCwgeiwgdGhpcy51cHBlclNvdXJjZSgpLCAwLjA2KSB9O1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBsb3cgPSB0aGlzLmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8PSBsb3cud2lkdGggKyA2KSB7XG4gICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogbG93LnR4LCBkejogbG93LnR6LCBzcGVlZDogMC4zNSArIDAuMjUgKiBzbW9vdGhzdGVwKGxvdy53aWR0aCArIDYsIDAsIGxvdy5kKSB9O1xuICAgIH1cbiAgICBjb25zdCBsZCA9IE1hdGguaHlwb3QoKHggLSB0aGlzLmxha2UueCkgLyB0aGlzLmxha2UucngsICh6IC0gdGhpcy5sYWtlLnopIC8gdGhpcy5sYWtlLnJ6KTtcbiAgICBpZiAobGQgPCAxLjM1KSB7XG4gICAgICAvLyBTbG93IGRyaWZ0IGZyb20gdGhlIGluZmxvdyB0b3dhcmQgdGhlIG91dGZsb3cgYXQgdGhlIGhlYWQgb2YgdGhlIGxvd2VyIHJpdmVyLlxuICAgICAgY29uc3QgaGVhZCA9IHRoaXMubG93ZXIucG9pbnRzW3RoaXMubG93ZXIucG9pbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZHJpZnQgPSB0b3dhcmRzKHgsIHosIGhlYWQsIDAuMDgpO1xuICAgICAgcmV0dXJuIHsgYm9keTogJ2xha2UnLCAuLi5kcmlmdCB9O1xuICAgIH1cbiAgICByZXR1cm4geyBib2R5OiAnc2VhJywgZHg6IDAsIGR6OiAwLCBzcGVlZDogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSB1cHBlclNvdXJjZSgpOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0ge1xuICAgIGNvbnN0IHB0cyA9IHRoaXMudXBwZXIhLnBvaW50cztcbiAgICByZXR1cm4gcHRzW3B0cy5sZW5ndGggLSAxXTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b3dhcmRzKHg6IG51bWJlciwgejogbnVtYmVyLCBwOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0sIHNwZWVkOiBudW1iZXIpIHtcbiAgY29uc3QgZHggPSBwLnggLSB4LCBkeiA9IHAueiAtIHo7XG4gIGNvbnN0IGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KSB8fCAxO1xuICByZXR1cm4geyBkeDogZHggLyBsZW4sIGR6OiBkeiAvIGxlbiwgc3BlZWQgfTtcbn1cblxuLyoqIEZpbmQgdGhlIHZhbGxleSBsYWtlIGZyb20gdGhlIHRlcnJhaW4gaXRzZWxmOiB0aGUgZGVlcCBiYXNpbiBOVyBvZiB0aGUgZm91bmRlciB2YWxsZXkuICovXG5mdW5jdGlvbiBsb2NhdGVMYWtlKGg6IEhlaWdodFNhbXBsZXIpOiBIeWRyb2xvZ3lbJ2xha2UnXSB7XG4gIGxldCBzeCA9IDAsIHN6ID0gMCwgbiA9IDAsIG1pblggPSBJbmZpbml0eSwgbWF4WCA9IC1JbmZpbml0eSwgbWluWiA9IEluZmluaXR5LCBtYXhaID0gLUluZmluaXR5O1xuICBmb3IgKGxldCB6ID0gLTQ2MDsgeiA8PSAtMTIwOyB6ICs9IDQpIHtcbiAgICBmb3IgKGxldCB4ID0gLTQ4MDsgeCA8PSAtNDA7IHggKz0gNCkge1xuICAgICAgaWYgKGgoeCwgeikgPiAtNCkgY29udGludWU7XG4gICAgICBzeCArPSB4OyBzeiArPSB6OyBuKys7XG4gICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgeCk7IG1heFggPSBNYXRoLm1heChtYXhYLCB4KTtcbiAgICAgIG1pblogPSBNYXRoLm1pbihtaW5aLCB6KTsgbWF4WiA9IE1hdGgubWF4KG1heFosIHopO1xuICAgIH1cbiAgfVxuICBpZiAobiA9PT0gMCkgcmV0dXJuIHsgeDogLTI2MCwgejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH07XG4gIHJldHVybiB7XG4gICAgeDogc3ggLyBuLCB6OiBzeiAvIG4sXG4gICAgcng6IE1hdGgubWF4KDMwLCAobWF4WCAtIG1pblgpIC8gMiArIDEwKSwgcno6IE1hdGgubWF4KDMwLCAobWF4WiAtIG1pblopIC8gMiArIDEwKSxcbiAgfTtcbn1cblxuLyoqXG4gKiBUcmFjZSB0aGUgY2FydmVkIGxvd2xhbmQgY2hhbm5lbCBmcm9tIHRoZSBsYWtlIG91dGZsb3cgc291dGggdG8gdGhlIHNlYS4gRm9yXG4gKiBlYWNoIDQgbSByb3cgdGhlIGNoYW5uZWwgaXMgdGhlIGxvd2VzdCBjb2x1bW4gbmVhciB0aGUgcHJldmlvdXMgY2VudHJlOyB0aGVcbiAqIHRyYWNlIGlzIHNtb290aGVkIHNvIHRoZSBmbG93IGZpZWxkIGRvZXMgbm90IGppdHRlciB3aXRoIHRoZSAxIG0gdm94ZWxzLlxuICovXG5mdW5jdGlvbiB0cmFjZUxvd2VyUml2ZXIoaDogSGVpZ2h0U2FtcGxlciwgbGFrZTogSHlkcm9sb2d5WydsYWtlJ10pOiBSaXZlclJlYWNoIHtcbiAgY29uc3QgcmF3OiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGxldCBjeCA9IGxha2UueCArIGxha2UucnggKiAwLjU1O1xuICBsZXQgeiA9IE1hdGgucm91bmQobGFrZS56ICsgbGFrZS5yeiAqIDAuNik7XG4gIC8vIFN0YXJ0IGF0IHRoZSBsYWtlJ3Mgc291dGgtZWFzdCBvdXRmbG93IGFuZCBmb2xsb3cgdGhlIGNoYW5uZWwgZG93bnN0cmVhbS5cbiAgZm9yICg7IHogPD0gOTAwOyB6ICs9IDQpIHtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBieCA9IGN4O1xuICAgIGZvciAobGV0IHggPSBNYXRoLnJvdW5kKGN4IC0gNDApOyB4IDw9IGN4ICsgNDA7IHggKz0gMikge1xuICAgICAgY29uc3QgdiA9IGgoeCwgeikgKyBNYXRoLmFicyh4IC0gY3gpICogMC4wMjtcbiAgICAgIGlmICh2IDwgYmVzdCkgeyBiZXN0ID0gdjsgYnggPSB4OyB9XG4gICAgfVxuICAgIGN4ID0gYng7XG4gICAgcmF3LnB1c2goeyB4OiBieCwgeiB9KTtcbiAgICAvLyBUaGUgdHJhY2UgZW5kcyBvbmNlIGl0IHJlYWNoZXMgb3BlbiBzZWEgZm9yIGEgc3VzdGFpbmVkIHN0cmV0Y2guXG4gICAgaWYgKGJlc3QgPCAtNiAmJiByYXcubGVuZ3RoID4gMjAgJiYgaChieCwgeiArIDgpIDwgLTYgJiYgaChieCwgeiArIDE2KSA8IC02KSBicmVhaztcbiAgfVxuICBjb25zdCBzbW9vdGggPSByYXcubWFwKChwLCBpKSA9PiB7XG4gICAgbGV0IHN4ID0gMCwgbiA9IDA7XG4gICAgZm9yIChsZXQgayA9IE1hdGgubWF4KDAsIGkgLSA0KTsgayA8PSBNYXRoLm1pbihyYXcubGVuZ3RoIC0gMSwgaSArIDQpOyBrKyspIHsgc3ggKz0gcmF3W2tdLng7IG4rKzsgfVxuICAgIHJldHVybiB7IHg6IHN4IC8gbiwgejogcC56IH07XG4gIH0pO1xuICAvLyBTdG9yZSBkb3duc3RyZWFtLWZpcnN0OiBpbmRleCAwIGlzIHRoZSBzZWEgbW91dGguXG4gIHNtb290aC5yZXZlcnNlKCk7XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gW107XG4gIGxldCBzID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzbW9vdGgubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaSA+IDApIHMgKz0gTWF0aC5oeXBvdChzbW9vdGhbaV0ueCAtIHNtb290aFtpIC0gMV0ueCwgc21vb3RoW2ldLnogLSBzbW9vdGhbaSAtIDFdLnopO1xuICAgIHBvaW50cy5wdXNoKHsgeDogc21vb3RoW2ldLngsIHo6IHNtb290aFtpXS56LCBzLCBsZXZlbDogMCwgd2lkdGg6IDYgfSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBSaXZlclJlYWNoKHBvaW50cywgNDApO1xufVxuXG4vKiogV2F0ZXItc3VyZmFjZSBkcm9wcyBhbG9uZyB0aGUgdXBwZXIgcml2ZXIsIGFzIChmcmFjdGlvbiBvZiBsZW5ndGgsIG1ldHJlcykuICovXG5jb25zdCBGQUxMUzogUmVhZG9ubHlBcnJheTxyZWFkb25seSBbbnVtYmVyLCBudW1iZXJdPiA9IFtbMC4yLCA3XSwgWzAuNDgsIDExXSwgWzAuNzQsIDEzXV07XG5jb25zdCBVUFBFUl9HUkFESUVOVCA9IDAuMDM7XG5cbi8qKlxuICogQXV0aG9yIHRoZSB2MiBtb3VudGFpbiByaXZlcjogYSBzZWVkZWQgbWVhbmRlcmluZyBjZW50cmVsaW5lIGZyb20gdGhlIGxha2Unc1xuICogbm9ydGggc2hvcmUgdG8gYSBoaWdobGFuZCB0YXJuLCB3aXRoIGEgbGV2ZWwgcHJvZmlsZSB0aGF0IG9ubHkgcmlzZXNcbiAqIHVwc3RyZWFtIChnZW50bGUgZ3JhZGllbnQgcGx1cyB0aHJlZSBjYXNjYWRlcykuXG4gKi9cbmZ1bmN0aW9uIGF1dGhvclVwcGVyUml2ZXIoc2VlZDogbnVtYmVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IHtcbiAgcmVhY2g6IFJpdmVyUmVhY2g7IHRhcm46IE5vbk51bGxhYmxlPEh5ZHJvbG9neVsndGFybiddPjtcbn0ge1xuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChzZWVkIF4gMHg1ZWVkMikgPj4+IDApO1xuICBjb25zdCBqID0gKGE6IG51bWJlcikgPT4gKHJuZCgpIC0gMC41KSAqIDIgKiBhO1xuICBjb25zdCBtb3V0aCA9IHsgeDogbGFrZS54ICsgbGFrZS5yeCAqIDAuMSwgejogbGFrZS56IC0gbGFrZS5yeiAqIDAuNTUgfTtcbiAgY29uc3QgY29udHJvbHMgPSBbXG4gICAgbW91dGgsXG4gICAgeyB4OiBsYWtlLnggKyAyMCArIGooMjApLCB6OiAtNDEwICsgaigxNSkgfSxcbiAgICB7IHg6IC0xOTAgKyBqKDM1KSwgejogLTUyMCArIGooMjApIH0sXG4gICAgeyB4OiAtMjE1ICsgaigzNSksIHo6IC02NDAgKyBqKDIwKSB9LFxuICAgIHsgeDogLTE2NSArIGooMzApLCB6OiAtNzcwICsgaigxNSkgfSxcbiAgXTtcbiAgLy8gQ2F0bXVsbC1Sb20gdGhyb3VnaCB0aGUgY29udHJvbHMsIHRoZW4gcmVzYW1wbGUgYXQgfjggbSBzcGFjaW5nIHdpdGggYVxuICAvLyBzbWFsbCBzZWVkZWQgbWVhbmRlciBzbyB0aGUgY2hhbm5lbCBpcyBub3QgYSBzbW9vdGggc3BsaW5lLlxuICBjb25zdCBkZW5zZTogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbnRyb2xzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGNvbnN0IHAwID0gY29udHJvbHNbTWF0aC5tYXgoMCwgaSAtIDEpXSwgcDEgPSBjb250cm9sc1tpXTtcbiAgICBjb25zdCBwMiA9IGNvbnRyb2xzW2kgKyAxXSwgcDMgPSBjb250cm9sc1tNYXRoLm1pbihjb250cm9scy5sZW5ndGggLSAxLCBpICsgMildO1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgMjQ7IGsrKykge1xuICAgICAgY29uc3QgdCA9IGsgLyAyNCwgdDIgPSB0ICogdCwgdDMgPSB0MiAqIHQ7XG4gICAgICBkZW5zZS5wdXNoKHtcbiAgICAgICAgeDogMC41ICogKDIgKiBwMS54ICsgKC1wMC54ICsgcDIueCkgKiB0ICsgKDIgKiBwMC54IC0gNSAqIHAxLnggKyA0ICogcDIueCAtIHAzLngpICogdDJcbiAgICAgICAgICArICgtcDAueCArIDMgKiBwMS54IC0gMyAqIHAyLnggKyBwMy54KSAqIHQzKSxcbiAgICAgICAgejogMC41ICogKDIgKiBwMS56ICsgKC1wMC56ICsgcDIueikgKiB0ICsgKDIgKiBwMC56IC0gNSAqIHAxLnogKyA0ICogcDIueiAtIHAzLnopICogdDJcbiAgICAgICAgICArICgtcDAueiArIDMgKiBwMS56IC0gMyAqIHAyLnogKyBwMy56KSAqIHQzKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBkZW5zZS5wdXNoKGNvbnRyb2xzW2NvbnRyb2xzLmxlbmd0aCAtIDFdKTtcbiAgY29uc3QgcmVzYW1wbGVkOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyOyBzOiBudW1iZXIgfT4gPSBbeyAuLi5kZW5zZVswXSwgczogMCB9XTtcbiAgbGV0IGFjYyA9IDAsIHMgPSAwO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGRlbnNlLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgc3RlcCA9IE1hdGguaHlwb3QoZGVuc2VbaV0ueCAtIGRlbnNlW2kgLSAxXS54LCBkZW5zZVtpXS56IC0gZGVuc2VbaSAtIDFdLnopO1xuICAgIGFjYyArPSBzdGVwOyBzICs9IHN0ZXA7XG4gICAgaWYgKGFjYyA+PSA4IHx8IGkgPT09IGRlbnNlLmxlbmd0aCAtIDEpIHtcbiAgICAgIGNvbnN0IG0gPSAoZmJtMihzIC8gNjAsIDMuMSwgc2VlZCArIDgwMSwgMikgLSAwLjUpICogMTQ7XG4gICAgICByZXNhbXBsZWQucHVzaCh7IHg6IGRlbnNlW2ldLnggKyBtLCB6OiBkZW5zZVtpXS56LCBzIH0pO1xuICAgICAgYWNjID0gMDtcbiAgICB9XG4gIH1cbiAgY29uc3QgdG90YWwgPSByZXNhbXBsZWRbcmVzYW1wbGVkLmxlbmd0aCAtIDFdLnM7XG4gIGNvbnN0IGxldmVsQXQgPSAoc3Y6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgbGV0IGxldmVsID0gc3YgKiBVUFBFUl9HUkFESUVOVDtcbiAgICBmb3IgKGNvbnN0IFtmcmFjLCBkcm9wXSBvZiBGQUxMUykge1xuICAgICAgLy8gRWFjaCBmYWxsIGlzIGEgc2hvcnQgY2FzY2FkZSBvdmVyIH4xMCBtIG9mIGNoYW5uZWwuXG4gICAgICBsZXZlbCArPSBkcm9wICogc21vb3Roc3RlcCh0b3RhbCAqIGZyYWMgLSA1LCB0b3RhbCAqIGZyYWMgKyA1LCBzdik7XG4gICAgfVxuICAgIC8vIFRoZSBmaXJzdCA0MCBtIGludG8gdGhlIGxha2Ugc3RheXMgYXQgbGFrZSBsZXZlbC5cbiAgICByZXR1cm4gc3YgPCA0MCA/IDAgOiBsZXZlbCAtIDQwICogVVBQRVJfR1JBRElFTlQ7XG4gIH07XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gcmVzYW1wbGVkLm1hcCgocCkgPT4gKHtcbiAgICB4OiBwLngsIHo6IHAueiwgczogcC5zLCBsZXZlbDogTWF0aC5tYXgoMCwgbGV2ZWxBdChwLnMpKSxcbiAgICB3aWR0aDogMy4yICsgMi4yICogZmJtMihwLnMgLyA3MCwgOS43LCBzZWVkICsgODAyLCAyKSArICgxIC0gcC5zIC8gdG90YWwpICogMS41LFxuICB9KSk7XG4gIGNvbnN0IHNvdXJjZSA9IHBvaW50c1twb2ludHMubGVuZ3RoIC0gMV07XG4gIHJldHVybiB7XG4gICAgcmVhY2g6IG5ldyBSaXZlclJlYWNoKHBvaW50cywgMTEwKSxcbiAgICB0YXJuOiB7IHg6IHNvdXJjZS54LCB6OiBzb3VyY2UueiwgcjogMTgsIGxldmVsOiBzb3VyY2UubGV2ZWwgfSxcbiAgfTtcbn1cbiIsICIvLyBWb3hlbCBtYXRlcmlhbCBpZHMuIFB1cmUgZGF0YSBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIgKEQtMDA1KS5cbi8vIElkcyBhcmUgcGVyc2lzdGVkIGluIHNuYXBzaG90IGVkaXRzLCBzbyBleGlzdGluZyB2YWx1ZXMgbXVzdCBuZXZlciBjaGFuZ2UuXG5leHBvcnQgY29uc3QgTUFUID0ge1xuICBBSVI6IDAsXG4gIEdSQVNTOiAxLFxuICBTT0lMOiAyLFxuICBTQU5EOiAzLFxuICBHUkFWRUw6IDQsXG4gIFNUT05FOiA1LFxuICBPUkU6IDYsXG4gIFdBVEVSOiA3LFxuICBCRURST0NLOiA4LFxuICBNT1NTOiA5LFxuICAvKiogR2VuZXJhdG9yIHYyIGhpZ2hsYW5kcy4gTmV2ZXIgcHJvZHVjZWQgYnkgZ2VuZXJhdG9yIHYxLiAqL1xuICBTTk9XOiAxMCxcbn0gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBNYXRJZCA9ICh0eXBlb2YgTUFUKVtrZXlvZiB0eXBlb2YgTUFUXTtcblxuZXhwb3J0IGNvbnN0IGlzU29saWQgPSAobTogbnVtYmVyKTogYm9vbGVhbiA9PiBtICE9PSBNQVQuQUlSICYmIG0gIT09IE1BVC5XQVRFUjtcbmV4cG9ydCBjb25zdCBpc09wYXF1ZSA9IGlzU29saWQ7XG5cbi8qKiBIaWdoZXN0IG1hdGVyaWFsIGlkIHRoYXQgbWF5IGFwcGVhciBpbiBhIHZveGVsIGVkaXQuICovXG5leHBvcnQgY29uc3QgTUFYX01BVF9JRCA9IDEwO1xuIiwgIi8vIFRlcnJhaW4gZ2VuZXJhdG9yIHYyIFx1MjAxNCB0aGUgdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSAocHVyZSBUUywgRC0wMDUpLlxuLy9cbi8vIENvbXBhdGliaWxpdHkgY29udHJhY3Q6IGluc2lkZSB0aGUgZm91bmRlciBjb3JyaWRvciAodGhlIHNldHRsZW1lbnQgdmFsbGV5LFxuLy8gdGhlIGxha2UgYW5kIHRoZSBsb3dsYW5kIHJpdmVyKSB2MiBoZWlnaHRzIGVxdWFsIHYxIGV4YWN0bHksIHNvIHRoZSBwaW5uZWRcbi8vIGZvdW5kZXIgcHJvamVjdHMsIHRoZWlyIHByZXBhcmF0aW9uIHRhcmdldHMgYW5kIG5hdHVyYWwgZW50aXRpZXMgdGhlcmUgYXJlXG4vLyB1bmNoYW5nZWQuIE91dHNpZGUgaXQgdjIgYWRkczpcbi8vICAgLSBhIG5vcnRoZXJuIG1hc3NpZiBvbiBhbiBleHRlbmRlZCBpc2xhbmQsIHdpdGggc25vdyBhYm92ZSB0aGUgc25vd2xpbmU7XG4vLyAgIC0gZmxhbmtpbmcgcmFuZ2VzIHdlc3QgYW5kIGVhc3Qgb2YgdGhlIHZhbGxleSwgdGVycmFjZWQgaW50byBjbGlmZiBiYW5kcztcbi8vICAgLSBhIG1vdW50YWluIHJpdmVyIGNhcnZlZCBpbnRvIHRoZSBtYXNzaWYgZnJvbSBhIHRhcm4gZG93biB0byB0aGUgbGFrZSxcbi8vICAgICB3aG9zZSB3YXRlciBzdXJmYWNlIGNvbWVzIGZyb20gSHlkcm9sb2d5IGFuZCBuZXZlciByaXNlcyBkb3duc3RyZWFtO1xuLy8gICAtIGEgY29udGludW91cyBsb3dsYW5kIGNoYW5uZWwgKHYxIGhhcyBhIGRyeSBmb3JkIHNvdXRoIG9mIHRoZSBzaGVsZikuXG4vLyBIZWlnaHRzIGFyZSBpbnRlZ2VycyBpbiBbLTE0LCAxMDRdLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIGxlcnAsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7IE1BVCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5cbmV4cG9ydCBjb25zdCBWMl9TTk9XTElORSA9IDc0O1xuZXhwb3J0IGNvbnN0IFYyX01BWF9IRUlHSFQgPSAxMDQ7XG5cbmV4cG9ydCB0eXBlIFYxSGVpZ2h0ID0gKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IG51bWJlcjtcblxuZXhwb3J0IGludGVyZmFjZSBWMkNvbHVtbiB7XG4gIC8qKiBUb3Agc29saWQgeSArIDEgKHNhbWUgY29udmVudGlvbiBhcyBzdXJmYWNlSGVpZ2h0QXQpLiAqL1xuICBoOiBudW1iZXI7XG4gIC8qKiBXYXRlciBzdXJmYWNlIGZvciB0aGlzIGNvbHVtbjogY2VsbHMgW2gsIGxldmVsKSBob2xkIHdhdGVyLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogVHJ1ZSB3aGVuIHRoaXMgY29sdW1uIGlzIHBhcnQgb2YgdGhlIGNhcnZlZCBtb3VudGFpbi1yaXZlciBjaGFubmVsLiAqL1xuICBjaGFubmVsOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgVGVycmFpblYyIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcmVhZG9ubHkgc2VlZDogbnVtYmVyLFxuICAgIHByaXZhdGUgcmVhZG9ubHkgdjE6IFYxSGVpZ2h0LFxuICAgIHJlYWRvbmx5IGh5ZHJvbG9neTogSHlkcm9sb2d5LFxuICApIHt9XG5cbiAgLyoqIDAgPSBleGFjdGx5IHYxIChmb3VuZGVyIGNvcnJpZG9yKTsgMSA9IGZ1bGwgdjIgcmVsaWVmLiAqL1xuICByZWxpZWZNYXNrKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTM5MCwgLTQ3MCwgeik7XG4gICAgLy8gVGhlIHdlc3QgcmFuZ2Uga2VlcHMgY2xlYXIgb2YgdGhlIGxha2UgYmFzaW4gdW50aWwgdGhlIGxha2UgaXMgcGFzc2VkLlxuICAgIGNvbnN0IHdlc3RFZGdlID0gbGVycCgtNDUwLCAtMzIwLCBzbW9vdGhzdGVwKC0yMjAsIC0xNDAsIHopKTtcbiAgICBjb25zdCB3ZXN0ID0gc21vb3Roc3RlcCh3ZXN0RWRnZSwgd2VzdEVkZ2UgLSA5MCwgeCk7XG4gICAgY29uc3QgZWFzdCA9IHNtb290aHN0ZXAoMjMwLCAzMzAsIHgpO1xuICAgIHJldHVybiBNYXRoLm1heChub3J0aCwgd2VzdCwgZWFzdCk7XG4gIH1cblxuICAvKiogMCBhdCB0aGUgcmFuZ2UgZnJvbnQsIDEgZGVlcCBpbnNpZGU6IGZvb3RoaWxscyBmaXJzdCwgcGVha3MgYmVoaW5kLiAqL1xuICByYW5nZURlcHRoKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTQyMCwgLTcwMCwgeik7XG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlIC0gNDAsIHdlc3RFZGdlIC0gMzAwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyNzAsIDU2MCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFYyQ29sdW1uIHtcbiAgICBjb25zdCBzZWVkID0gdGhpcy5zZWVkO1xuICAgIGNvbnN0IGJhc2UgPSB0aGlzLnYxKHNlZWQsIHgsIHopO1xuICAgIGNvbnN0IG1hc2sgPSB0aGlzLnJlbGllZk1hc2soeCwgeik7XG4gICAgbGV0IGggPSBiYXNlO1xuXG4gICAgaWYgKG1hc2sgPiAwKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGlzbGFuZCBub3J0aCBzbyB0aGUgbWFzc2lmIGhhcyByb29tICh2MSBjb2FzdCBpcyB+eiAtNjAwKS5cbiAgICAgIGNvbnN0IG5vcnRoTGFuZCA9IHNtb290aHN0ZXAoLTQyMCwgLTUyMCwgeik7XG4gICAgICBjb25zdCBzaG9yZSA9IDEgLSBNYXRoLmh5cG90KCh4ICsgMTUwKSAvIDU2MCwgKHogKyA2OTApIC8gMzAwKVxuICAgICAgICArIChmYm0yKHggLyAxNjAsIHogLyAxNjAsIHNlZWQgKyA3MDEsIDMpIC0gMC41KSAqIDAuMztcbiAgICAgIGNvbnN0IGxhbmROID0gc21vb3Roc3RlcCgwLjAsIDAuMTQsIHNob3JlKSAqIG5vcnRoTGFuZDtcbiAgICAgIGNvbnN0IGdyb3VuZCA9IGxlcnAoYmFzZSwgTWF0aC5tYXgoYmFzZSwgNSArIDUgKiBmYm0yKHggLyA5MCwgeiAvIDkwLCBzZWVkICsgNzAyLCAyKSksIGxhbmROKTtcblxuICAgICAgLy8gUmlkZ2VkIG1hc3NpZiB3aXRoIHRlcnJhY2VkIGNsaWZmIGJhbmRzLlxuICAgICAgY29uc3Qgd3ggPSB4ICsgKGZibTIoeCAvIDI2MCwgeiAvIDI2MCwgc2VlZCArIDcwMywgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3Qgd3ogPSB6ICsgKGZibTIoeCAvIDI2MCArIDUuMSwgeiAvIDI2MCAtIDIuNywgc2VlZCArIDcwNCwgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3QgcjEgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMTAsIHd6IC8gMjEwLCBzZWVkICsgNzA1LCA0KSAtIDEpO1xuICAgICAgY29uc3QgcjIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4MCwgd3ogLyA4MCwgc2VlZCArIDcwNiwgMykgLSAxKTtcbiAgICAgIGNvbnN0IGx1bXAgPSBmYm0yKHd4IC8gMTIwLCB3eiAvIDEyMCwgc2VlZCArIDcwNywgMyk7XG4gICAgICBjb25zdCBkZXB0aCA9IHRoaXMucmFuZ2VEZXB0aCh4LCB6KTtcbiAgICAgIGxldCBtb3VudGFpbiA9IDE2ICsgKDggKyA4MCAqIGRlcHRoKSAqICgwLjU1ICogcjEgKiByMSArIDAuMjggKiByMiArIDAuMTcgKiBsdW1wKVxuICAgICAgICArIDE4ICogZGVwdGggKiBzbW9vdGhzdGVwKDAuNTUsIDAuOSwgcjEpO1xuICAgICAgY29uc3QgYmFuZCA9IDYgKyAyICogZmJtMih4IC8gMTQwLCB6IC8gMTQwLCBzZWVkICsgNzA4LCAyKTtcbiAgICAgIGNvbnN0IHQgPSBNYXRoLmZsb29yKG1vdW50YWluIC8gYmFuZCk7XG4gICAgICBjb25zdCBmcmFjID0gbW91bnRhaW4gLyBiYW5kIC0gdDtcbiAgICAgIG1vdW50YWluID0gKHQgKyBzbW9vdGhzdGVwKDAuNSwgMC44LCBmcmFjKSkgKiBiYW5kO1xuXG4gICAgICAvLyBPbmx5IGxhbmQgcmlzZXM7IHRoZSBzZWEgc3RheXMgc2VhLCBzbyByYW5nZXMgZW5kIGluIGNvYXN0YWwgY2xpZmZzLlxuICAgICAgY29uc3QgbGFuZEZhY3RvciA9IHNtb290aHN0ZXAoLTIsIDgsIGdyb3VuZCk7XG4gICAgICBoID0gbGVycChncm91bmQsIE1hdGgubWF4KGdyb3VuZCwgbW91bnRhaW4pLCBtYXNrICogbGFuZEZhY3Rvcik7XG4gICAgfVxuXG4gICAgbGV0IGxldmVsID0gaCA8IDAgPyAwIDogLUluZmluaXR5O1xuICAgIGxldCBjaGFubmVsID0gZmFsc2U7XG5cbiAgICAvLyBNb3VudGFpbiByaXZlcjogdmFsbGV5IGZsb29yLCBiYW5rcyBhbmQgY2hhbm5lbCBmb2xsb3cgdGhlIHdhdGVyIGxldmVsLlxuICAgIGNvbnN0IHVwcGVyID0gdGhpcy5oeWRyb2xvZ3kudXBwZXI7XG4gICAgaWYgKHVwcGVyKSB7XG4gICAgICBjb25zdCBoaXQgPSB1cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICBjb25zdCByYWlzZWQgPSBoaXQubGV2ZWwgPiAwLjI1O1xuICAgICAgICBjb25zdCB2dyA9IDU1ICsgMjggKiBmYm0yKGhpdC5zIC8gOTAsIDEuNywgc2VlZCArIDcwOSwgMik7XG4gICAgICAgIGNvbnN0IGZsb29yID0gaGl0LmxldmVsICsgMS41ICsgMi4yICogZmJtMih4IC8gNDAsIHogLyA0MCwgc2VlZCArIDcxMCwgMikgKyBoaXQuZCAqIDAuMDY7XG4gICAgICAgIGNvbnN0IHQgPSBzbW9vdGhzdGVwKHZ3ICogMC4zLCB2dywgaGl0LmQpO1xuICAgICAgICBoID0gTWF0aC5taW4oaCwgbGVycChmbG9vciwgaCwgdCkpO1xuICAgICAgICBjb25zdCB3ID0gaGl0LndpZHRoO1xuICAgICAgICBpZiAocmFpc2VkICYmIGhpdC5kIDwgdyArIDMpIHtcbiAgICAgICAgICAvLyBCYW5rcyBob2xkIGEgcmFpc2VkIHJpdmVyOiBuZXZlciBiZWxvdyBpdHMgd2F0ZXIgc3VyZmFjZS4gQXQgbGFrZVxuICAgICAgICAgIC8vIGxldmVsIHRoZSBzZWEtbGV2ZWwgZmlsbCBhbHJlYWR5IGNvbnRhaW5zIHRoZSB3YXRlci5cbiAgICAgICAgICBoID0gTWF0aC5tYXgoaCwgTWF0aC5jZWlsKGhpdC5sZXZlbCkgKyAxKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaGl0LmQgPCB3KSB7XG4gICAgICAgICAgY29uc3QgYmVkID0gaGl0LmxldmVsIC0gKDEuMiArIDEuMyAqICgxIC0gaGl0LmQgLyB3KSk7XG4gICAgICAgICAgaCA9IE1hdGgubWluKGgsIGJlZCk7XG4gICAgICAgICAgaWYgKHJhaXNlZCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZChoaXQubGV2ZWwpKTtcbiAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgdGFybiA9IHRoaXMuaHlkcm9sb2d5LnRhcm47XG4gICAgICBpZiAodGFybikge1xuICAgICAgICBjb25zdCB0ZCA9IE1hdGguaHlwb3QoeCAtIHRhcm4ueCwgeiAtIHRhcm4ueilcbiAgICAgICAgICAqICgxICsgMC4yICogKGZibTIoeCAvIDMwLCB6IC8gMzAsIHNlZWQgKyA3MTEsIDIpIC0gMC41KSk7XG4gICAgICAgIGlmICh0ZCA8IHRhcm4uciArIDYpIHtcbiAgICAgICAgICBjb25zdCByaW0gPSBNYXRoLmNlaWwodGFybi5sZXZlbCkgKyAxO1xuICAgICAgICAgIGlmICh0ZCA+PSB0YXJuLnIpIGggPSBNYXRoLm1heChoLCByaW0pO1xuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaCA9IE1hdGgubWluKE1hdGgubWF4KGgsIHJpbSksIHRhcm4ubGV2ZWwgLSAxIC0gMyAqIHNtb290aHN0ZXAodGFybi5yLCAwLCB0ZCkpO1xuICAgICAgICAgICAgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZCh0YXJuLmxldmVsKSk7XG4gICAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBMb3dsYW5kIGNoYW5uZWwgY29udGludWl0eTogdjEgbGVhdmVzIGEgZHJ5IGZvcmQgd2hlcmUgdGhlIHNoZWxmIG1lZXRzIHRoZSByaXZlci5cbiAgICBjb25zdCBsb3cgPSB0aGlzLmh5ZHJvbG9neS5sb3dlci5uZWFyZXN0KHgsIHopO1xuICAgIGlmIChsb3cgJiYgbG93LmQgPCAyLjUgJiYgaCA+PSAwICYmIGJhc2UgPCA0KSBoID0gLTE7XG5cbiAgICBoID0gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIFYyX01BWF9IRUlHSFQpKTtcbiAgICBpZiAoaCA8IDApIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIDApO1xuICAgIHJldHVybiB7IGgsIGxldmVsOiBsZXZlbCA9PT0gLUluZmluaXR5ID8gaCA6IGxldmVsLCBjaGFubmVsIH07XG4gIH1cblxuICBoZWlnaHQoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmNvbHVtbih4LCB6KS5oO1xuICB9XG5cbiAgLyoqIHYyIHRvcCBtYXRlcmlhbC4gRmFsbHMgYmFjayB0byB0aGUgdjEgcnVsZXMgZm9yIHRoZSB1bmNoYW5nZWQgY29ycmlkb3IuICovXG4gIHRvcE1hdGVyaWFsKFxuICAgIHg6IG51bWJlciwgejogbnVtYmVyLCBjb2w6IFYyQ29sdW1uLCBzbG9wZTogbnVtYmVyLFxuICAgIHYxVG9wOiAoaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyKSA9PiBNYXRJZCxcbiAgKTogTWF0SWQge1xuICAgIGNvbnN0IGggPSBjb2wuaDtcbiAgICBpZiAoY29sLmNoYW5uZWwgJiYgY29sLmxldmVsID4gaCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIgJiYgaCA+IDEpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDwgaGl0LndpZHRoICsgMi41ICYmIGhpdC5sZXZlbCA+IDAuMjUpIHtcbiAgICAgICAgcmV0dXJuIGZibTIoeCAvIDYsIHogLyA2LCB0aGlzLnNlZWQgKyA3MTIsIDEpID4gMC41ID8gTUFULkdSQVZFTCA6IE1BVC5TQU5EO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzbm93bGluZSA9IFYyX1NOT1dMSU5FICsgKGZibTIoeCAvIDcwLCB6IC8gNzAsIHRoaXMuc2VlZCArIDcxMywgMykgLSAwLjUpICogMTY7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgJiYgc2xvcGUgPD0gMykgcmV0dXJuIE1BVC5TTk9XO1xuICAgIGlmIChoID49IHNub3dsaW5lIC0gNiAmJiBzbG9wZSA8PSAxICYmIGZibTIoeCAvIDIwLCB6IC8gMjAsIHRoaXMuc2VlZCArIDcxNCwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKHRoaXMucmVsaWVmTWFzayh4LCB6KSA+IDAuNSAmJiBoID4gMzAgJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgICByZXR1cm4gdjFUb3AoaCwgc2xvcGUpO1xuICB9XG59XG4iLCAiLy8gU2ltdWxhdGlvbiBsYXllciBcdTIwMTQgcHVyZSBUeXBlU2NyaXB0LCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMSB3b3JsZCBmb3VuZGF0aW9uOiBhIGNodW5rZWQsIGdlbnVpbmVseSB0aHJlZS1kaW1lbnNpb25hbCB2b3hlbCB3b3JsZC5cbi8vIFRoZSBzdG9yZWQgc3RhdGUgaXMgb25lIG1hdGVyaWFsIGJ5dGUgcGVyIGNlbGwgKDAgPSBhaXIpOyBvY2N1cGFuY3kgaXNcbi8vIGltcGxpY2l0LiBTdXJmYWNlIGhlaWdodCBpcyBhIGRlcml2ZWQgcXVlcnksIG5vdCB0aGUgc3RvcmFnZS4gVGhpcyByZXBsYWNlc1xuLy8gdGhlIGZvcm1lciAyNTYgeCAyNTYgaGVpZ2h0ZmllbGQgKHNlZSBJUi0wMDUpLlxuLy9cbi8vIFdvcmxkIG1ldHJlczogeC96IGluIFstMTAyNCwgMTAyNCksIHkgaW4gWy0xNiwgMTEyKSwgc2VhIGxldmVsIDAuXG4vLyBBIGNodW5rIGlzIDMyIHggMzIgeCAxMjggY2VsbHMuIEdlbmVyYXRpb24gaXMgYSBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkLFxuLy8gZ2VuZXJhdG9yIHZlcnNpb24sIHBhcmFtZXRlcnMgYW5kIGNodW5rIGNvb3JkaW5hdGVzOyBlZGl0cyBhcmUgcmVjb3JkZWRcbi8vIHNlcGFyYXRlbHkgYW5kIHJlLWFwcGxpZWQgd2hlbiBhIGNodW5rIGlzIHJlZ2VuZXJhdGVkLlxuaW1wb3J0IHR5cGUgeyBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBMaWZlU3RhdGUgfSBmcm9tICcuL2Vjb25vbXknO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcbmltcG9ydCB7IFRlcnJhaW5WMiwgVjJDb2x1bW4gfSBmcm9tICcuL3RlcnJhaW4tdjInO1xuXG5leHBvcnQgY29uc3QgV09STERfU0laRSA9IDIwNDg7XG5leHBvcnQgY29uc3QgSEFMRiA9IFdPUkxEX1NJWkUgLyAyO1xuZXhwb3J0IGNvbnN0IENIVU5LX1NJWkUgPSAzMjtcbmV4cG9ydCBjb25zdCBDSFVOS1NfUEVSX1NJREUgPSBXT1JMRF9TSVpFIC8gQ0hVTktfU0laRTtcbmV4cG9ydCBjb25zdCBZX01JTiA9IC0xNjtcbmV4cG9ydCBjb25zdCBZX01BWCA9IDExMjtcbmV4cG9ydCBjb25zdCBXT1JMRF9IRUlHSFQgPSBZX01BWCAtIFlfTUlOO1xuZXhwb3J0IGNvbnN0IFNFQV9MRVZFTCA9IDA7XG5leHBvcnQgY29uc3QgV0FURVIgPSBTRUFfTEVWRUw7XG4vKiogR2VuZXJhdG9yIHYxOiB0aGUgb3JpZ2luYWwgMjA0OCBtIGlzbGFuZC4gRGVmYXVsdCBmb3IgY3JlYXRlV29ybGQgYW5kIGFsbCBsZWdhY3kgc2F2ZXMuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1ZFUlNJT04gPSAxO1xuLyoqIEdlbmVyYXRvciB2MjogdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSB3aXRoIGEgbW91bnRhaW4gcml2ZXIgKHNlZSB0ZXJyYWluLXYyLnRzKS4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVjIgPSAyO1xuLyoqIFRoZSBnZW5lcmF0b3IgbmV3IGJyb3dzZXIgd29ybGRzIHVzZSBieSBkZWZhdWx0LiAqL1xuZXhwb3J0IGNvbnN0IExBVEVTVF9HRU5FUkFUT1JfVkVSU0lPTiA9IEdFTkVSQVRPUl9WMjtcbmV4cG9ydCBjb25zdCBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TOiByZWFkb25seSBudW1iZXJbXSA9IFtHRU5FUkFUT1JfVkVSU0lPTiwgR0VORVJBVE9SX1YyXTtcbmV4cG9ydCBjb25zdCBpc1N1cHBvcnRlZEdlbmVyYXRvciA9ICh2OiB1bmtub3duKTogdiBpcyBudW1iZXIgPT5cbiAgdHlwZW9mIHYgPT09ICdudW1iZXInICYmIFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlMuaW5jbHVkZXModik7XG5leHBvcnQgY29uc3QgQ0hVTktfVk9MVU1FID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkUgKiBXT1JMRF9IRUlHSFQ7XG5leHBvcnQgY29uc3QgQ0hVTktfQVJFQSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFO1xuXG5leHBvcnQgeyBNQVQsIGlzU29saWQsIGlzT3BhcXVlLCBNQVhfTUFUX0lEIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuZXhwb3J0IHR5cGUgeyBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IE1BVCwgaXNTb2xpZCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5cbmV4cG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgZmJtMixcbn0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQge1xuICBjbGFtcCwgbGVycCwgc21vb3Roc3RlcCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIHZhbHVlTm9pc2UzLCBmYm0yLCBmYm0zLFxufSBmcm9tICcuL25vaXNlJztcblxuLy8gLS0tLS0tLS0tLSB3b3JsZCB0eXBlcyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkUGFyYW1zIHtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEFSQU1TOiBXb3JsZFBhcmFtcyA9IHtcbiAgc2l6ZTogV09STERfU0laRSxcbiAgY2h1bmtTaXplOiBDSFVOS19TSVpFLFxuICB5TWluOiBZX01JTixcbiAgeU1heDogWV9NQVgsXG4gIHNlYUxldmVsOiBTRUFfTEVWRUwsXG4gIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbENodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAga2V5OiBzdHJpbmc7XG4gIC8qKiB4ICsgeiozMiArICh5LVlfTUlOKSoxMDI0ICovXG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3Agc29saWQgeSwgZW5jb2RlZCBhcyAoeSAtIFlfTUlOKSwgMC4uMTI3OyAwIG1lYW5zIG5vIHNvbGlkLiAqL1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICAvKiogdG9wIG1hdGVyaWFsIHBlciBjb2x1bW4uICovXG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG4gIGRpcnR5OiBib29sZWFuO1xuICBnZW5lcmF0ZWRBdDogbnVtYmVyO1xufVxuXG4vLyBOYXR1cmFsIGFzc2V0cyBhcmUgdGhlIHByb2plY3QncyBTdHlsIChgbmF0X2ApIHBpcGVsaW5lIChBUy0wMDEgdjIpLCBub3Rcbi8vIE5veGVsIGFyY2hpdGVjdHVyZS4gTm94ZWwgcmVtYWlucyB0aGUgaHVtYW4tbWFkZSBraXQvd2F5c3RvbmUvbWFya2VyIHN5c3RlbS5cbi8vIFJldGlyZWQgb25seSBhcyB3b3JsZCBjb250ZW50LiBUaGUgbmFtZXMgcmVtYWluIGluIHRoZSBzZXJpYWxpemVkIHR5cGUgc29cbi8vIG9sZCBzbmFwc2hvdHMgYW5kIGFjY2VwdGVkIGhhcnZlc3Qgam91cm5hbHMgY2FuIGJlIG1pZ3JhdGVkIHdpdGhvdXQgcmVqZWN0aW5nXG4vLyBvdGhlcndpc2UgdmFsaWQgc2F2ZXMuIEdlbmVyYXRpb24sIGNvbGxpc2lvbiBhbmQgaW5zcGVjdGlvbiBuZXZlciB1c2UgdGhlbS5cbmV4cG9ydCBjb25zdCBSRVRJUkVEX1NUT05FX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuXSk7XG5leHBvcnQgY29uc3QgaXNSZXRpcmVkU3RvbmVLaW5kID0gKGtpbmQ6IEVudGl0eUtpbmQpOiBib29sZWFuID0+IFJFVElSRURfU1RPTkVfS0lORFMuaGFzKGtpbmQpO1xuZXhwb3J0IHR5cGUgQWN0aXZlRW50aXR5S2luZCA9IEV4Y2x1ZGU8RW50aXR5S2luZCxcbiAgJ3N0eWxfcm9ja19zbWFsbCcgfCAnc3R5bF9yb2NrX21lZGl1bScgfCAnc3R5bF9yb2NrX2xhcmdlJz47XG5cbmZ1bmN0aW9uIGxpdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogRW50aXR5IHwgbnVsbCB7XG4gIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIHJldHVybiAhZW50aXR5IHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpID8gbnVsbCA6IGVudGl0eTtcbn1cblxuZXhwb3J0IHR5cGUgRW50aXR5S2luZCA9XG4gIHwgJ3N0eWxfdHJlZV9zcGlyZSdcbiAgfCAnc3R5bF90cmVlX3RhYmxlJ1xuICB8ICdzdHlsX3RyZWVfY2x1c3RlcidcbiAgfCAnc3R5bF90cmVlX2Jsb3Nzb20nXG4gIHwgJ3N0eWxfc2hydWInXG4gIHwgJ3N0eWxfcm9ja19zbWFsbCdcbiAgfCAnc3R5bF9yb2NrX21lZGl1bSdcbiAgfCAnc3R5bF9yb2NrX2xhcmdlJ1xuICB8ICdzdHlsX29yZSdcbiAgfCAnc3R5bF9jYWlybidcbiAgfCAnd2F5c3RvbmUnXG4gIHwgJ21hcmtlcic7XG5cbmV4cG9ydCB0eXBlIFJlc291cmNlVHlwZSA9ICd3b29kJyB8ICdzdG9uZScgfCAnb3JlJyB8ICdmaWJlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW50aXR5IHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgY2h1bms6IHN0cmluZztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHNjYWxlOiBudW1iZXI7XG4gIHZhcmlhbnQ6IG51bWJlcjtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIHJlbWFpbmluZzogbnVtYmVyO1xuICB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcjtcbiAgLyoqIFRydWUgb25jZSB0aGUgZW50aXR5IGlzIGZ1bGx5IGRlcGxldGVkLiAqL1xuICBoYXJ2ZXN0ZWQ6IGJvb2xlYW47XG4gIC8qKiBUcnVlIGFmdGVyIHRoZSBmaXJzdCBzdWNjZXNzZnVsIGhhcnZlc3QsIGV2ZW4gaWYgeWllbGQgcmVtYWlucy4gKi9cbiAgaGFydmVzdGVkT25jZT86IGJvb2xlYW47XG4gIHByb3Zpc2lvbmFsOiBib29sZWFuO1xuICBhdXRob3JlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3hlbFNpdGUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWdpb25JbmZvIHtcbiAgaWQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdHlwZTogJ3BsYWluJyB8ICdmb3Jlc3QnIHwgJ2hpbGxzJyB8ICdoaWdobGFuZCcgfCAnd2F0ZXInIHwgJ3JpZGdlJztcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgcng6IG51bWJlcjtcbiAgcno6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFN0YXRzIHtcbiAgY2h1bmtzR2VuZXJhdGVkOiBudW1iZXI7XG4gIGNodW5rc0V2aWN0ZWQ6IG51bWJlcjtcbiAgdm94ZWxzRmlsbGVkOiBudW1iZXI7XG4gIGdlbmVyYXRpb25NczogbnVtYmVyO1xuICBlbnRpdGllczogbnVtYmVyO1xuICB0cmVlczogbnVtYmVyO1xuICBwaW5rVHJlZXM6IG51bWJlcjtcbiAgcGlua092ZXJmbG93OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGQge1xuICBzZWVkOiBudW1iZXI7XG4gIHBhcmFtczogV29ybGRQYXJhbXM7XG4gIGNodW5rczogTWFwPHN0cmluZywgVm94ZWxDaHVuaz47XG4gIGVudGl0aWVzOiBNYXA8c3RyaW5nLCBFbnRpdHk+O1xuICBlbnRpdHlDaHVua3M6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPjtcbiAgLyoqIENodW5rcyB3aG9zZSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZW50aXR5IHN0YXRlIGhhcyBiZWVuIGNoYW5nZWQuICovXG4gIGVudGl0eUNoYW5nZXM6IFNldDxzdHJpbmc+O1xuICAvKiogVG9tYnN0b25lcyBmb3IgcmVtb3ZlZCBkZXRlcm1pbmlzdGljIG5hdHVyYWwgZW50aXRpZXMuICovXG4gIGVudGl0eVJlbW92YWxzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIEF1dGhvcml0YXRpdmUgYnVpbHQgc3RydWN0dXJlcyAoaG91c2UsIHBhdGgsIHRlcnJhY2VzLCBjcm9wcykuICovXG4gIHN0cnVjdHVyZXM6IE1hcDxzdHJpbmcsIFN0cnVjdHVyZT47XG4gIHNpdGVzOiBOb3hlbFNpdGVbXTtcbiAgcmVnaW9uczogUmVnaW9uSW5mb1tdO1xuICAvKiogY2h1bmsga2V5IC0+IGxvY2FsIHZveGVsIGluZGV4IC0+IG1hdGVyaWFsLiBEdXJhYmxlLCBjb21wYWN0IGVkaXRzLiAqL1xuICBlZGl0czogTWFwPHN0cmluZywgTWFwPG51bWJlciwgbnVtYmVyPj47XG4gIC8qKiBHbG9iYWwgbG9jYWwtcGxheWVyIGNhcnJpZWQgYmFnOyBib3VuZGVkIGluIHNjaGVtYSAzLCBsZWdhY3kgaW4gMS8yLiAqL1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQcmVzZW50IG9ubHkgYWZ0ZXIgc2NoZW1hLTMgZ2VuZXNpcy9yZXN0b3JhdGlvbi4gKi9cbiAgbGlmZT86IExpZmVTdGF0ZTtcbiAgZGlydHk6IFNldDxzdHJpbmc+O1xuICBzdGF0czogV29ybGRTdGF0cztcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKlxuICAgKiBNb25vdG9uaWMgcmV2aXNpb24gb2YgYXV0aG9yaXRhdGl2ZSBzdGF0ZSAodm94ZWxzIGFuZCBlbnRpdGllcykuIERlcml2ZWRcbiAgICogY2FjaGVzIGtleWVkIG9uIHRoaXMgdmFsdWUgYXJlIGRpc2NhcmRlZCBhZnRlciBhbiBlZGl0OyBtZXNoL25hdmlnYXRpb25cbiAgICogcmV2aXNpb25zIGFyZSBzZXBhcmF0ZSBiZWNhdXNlIHRoZXkgYXJlIGRlcml2ZWQsIG5vdCB3b3JsZCBzdGF0ZS5cbiAgICovXG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBjaHVua0tleSA9IChjeDogbnVtYmVyLCBjejogbnVtYmVyKSA9PiBgJHtjeH0sJHtjen1gO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWCA9IChjeDogbnVtYmVyKSA9PiBjeCAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWiA9IChjejogbnVtYmVyKSA9PiBjeiAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGxvY2FsSW5kZXggPSAobHg6IG51bWJlciwgeUluZGV4OiBudW1iZXIsIGx6OiBudW1iZXIpID0+XG4gIGx4ICsgbHogKiBDSFVOS19TSVpFICsgeUluZGV4ICogQ0hVTktfQVJFQTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtYID0gKHg6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWiA9ICh6OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFggPSAoeDogbnVtYmVyKSA9PiB4IC0gKHdvcmxkVG9DaHVua1goeCkgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWiA9ICh6OiBudW1iZXIpID0+IHogLSAod29ybGRUb0NodW5rWih6KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB5VG9JbmRleCA9ICh5OiBudW1iZXIpID0+IHkgLSBZX01JTjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGlmICghaXNTdXBwb3J0ZWRHZW5lcmF0b3IoZ2VuZXJhdG9yVmVyc2lvbikpIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24gJHtnZW5lcmF0b3JWZXJzaW9ufWApO1xuICByZXR1cm4ge1xuICAgIHNlZWQsXG4gICAgcGFyYW1zOiB7IC4uLkRFRkFVTFRfUEFSQU1TLCBnZW5lcmF0b3JWZXJzaW9uIH0sXG4gICAgY2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXRpZXM6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaGFuZ2VzOiBuZXcgU2V0KCksXG4gICAgZW50aXR5UmVtb3ZhbHM6IG5ldyBTZXQoKSxcbiAgICBzdHJ1Y3R1cmVzOiBuZXcgTWFwKCksXG4gICAgc2l0ZXM6IFtdLFxuICAgIHJlZ2lvbnM6IFJFR0lPTlMsXG4gICAgZWRpdHM6IG5ldyBNYXAoKSxcbiAgICBpbnZlbnRvcnk6IHt9LFxuICAgIGRpcnR5OiBuZXcgU2V0KCksXG4gICAgc3RhdHM6IHtcbiAgICAgIGNodW5rc0dlbmVyYXRlZDogMCwgY2h1bmtzRXZpY3RlZDogMCwgdm94ZWxzRmlsbGVkOiAwLCBnZW5lcmF0aW9uTXM6IDAsXG4gICAgICBlbnRpdGllczogMCwgdHJlZXM6IDAsIHBpbmtUcmVlczogMCwgcGlua092ZXJmbG93OiAwLFxuICAgIH0sXG4gICAgYXV0aG9yZWRQbGFjZWQ6IGZhbHNlLFxuICAgIHJldmlzaW9uOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVXb3JsZChzZWVkID0gMTMzNywgaW5pdGlhbFJhZGl1cyA9IDAsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkLCBnZW5lcmF0b3JWZXJzaW9uKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNOT1cpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBNQVQuR1JBVkVMO1xuICByZXR1cm4gTUFULlNUT05FO1xufVxuXG5mdW5jdGlvbiBvcmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgY2x1c3RlciA9IGZibTIoeCAvIDU1LCB6IC8gNTUsIHNlZWQgKyAxMzAsIDIpO1xuICBpZiAoY2x1c3RlciA8IDAuNTcpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgbiA9IHZhbHVlTm9pc2UzKHggKiAwLjA5LCB5ICogMC4xMywgeiAqIDAuMDksIHNlZWQgKyAxMzEpO1xuICBjb25zdCBuMiA9IHZhbHVlTm9pc2UzKHggKiAwLjIyICsgNSwgeSAqIDAuMzEsIHogKiAwLjIyIC0gMywgc2VlZCArIDEzMik7XG4gIHJldHVybiBuID4gMC43MCAmJiBuMiA+IDAuNTA7XG59XG5cbmZ1bmN0aW9uIGNhdmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGZibTMoeCAqIDAuMDc1LCB5ICogMC4xMSwgeiAqIDAuMDc1LCBzZWVkICsgMTQwLCAyKSA+IDAuNzI7XG59XG5cbmZ1bmN0aW9uIG92ZXJoYW5nQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWx1ZU5vaXNlMyh4ICogMC4xOCwgeSAqIDAuMjIsIHogKiAwLjE4LCBzZWVkICsgMTQxKSA+IDAuNjI7XG59XG5cbi8vIC0tLS0tLS0tLS0gdmVyc2lvbmVkIGdlbmVyYXRvciBkaXNwYXRjaCAtLS0tLS0tLS0tXG5jb25zdCB2MkNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRlcnJhaW5WMj4oKTtcbmNvbnN0IGh5ZHJvQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSHlkcm9sb2d5PigpO1xuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ3kgbmV0d29yayBmb3IgYSBzZWVkIGFuZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyb2xvZ3lGb3Ioc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIpOiBIeWRyb2xvZ3kge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuaHlkcm9sb2d5O1xuICBjb25zdCBrZXkgPSBgJHtzZWVkfToke3ZlcnNpb259YDtcbiAgbGV0IGh5ZHJvID0gaHlkcm9DYWNoZS5nZXQoa2V5KTtcbiAgaWYgKCFoeWRybykge1xuICAgIGh5ZHJvID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb24sIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGh5ZHJvQ2FjaGUuc2V0KGtleSwgaHlkcm8pO1xuICB9XG4gIHJldHVybiBoeWRybztcbn1cblxuLyoqIEBpbnRlcm5hbCBUaGUgdjIgZ2VuZXJhdG9yIGZvciBhIHNlZWQgKGNhY2hlZDsgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCkuICovXG5leHBvcnQgZnVuY3Rpb24gdGVycmFpblYyKHNlZWQ6IG51bWJlcik6IFRlcnJhaW5WMiB7XG4gIGxldCBnZW4gPSB2MkNhY2hlLmdldChzZWVkKTtcbiAgaWYgKCFnZW4pIHtcbiAgICBjb25zdCBoeWRyb2xvZ3kgPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbjogR0VORVJBVE9SX1YyLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBnZW4gPSBuZXcgVGVycmFpblYyKHNlZWQsIHN1cmZhY2VIZWlnaHRBdCwgaHlkcm9sb2d5KTtcbiAgICB2MkNhY2hlLnNldChzZWVkLCBnZW4pO1xuICB9XG4gIHJldHVybiBnZW47XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCBoZWlnaHQgKHRvcCBzb2xpZCArIDEpIGZvciBhbnkgc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkuaGVpZ2h0KHgsIHopIDogc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgd2F0ZXIgc3VyZmFjZTogd2F0ZXIgZmlsbHMgY2VsbHMgW2hlaWdodCwgbGV2ZWwpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VXYXRlckxldmVsQXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmNvbHVtbih4LCB6KS5sZXZlbDtcbiAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgOiBoO1xufVxuXG5mdW5jdGlvbiB2ZXJzaW9uZWRTbG9wZShzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogKyAxKSksXG4gICk7XG59XG5cbi8qKiBCYXNlIHRvcCBtYXRlcmlhbCBmb3IgYW55IGdlbmVyYXRvciB2ZXJzaW9uIChtYWNybyBMT0QsIGVudGl0eSBwbGFjZW1lbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbEZvcihcbiAgc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGdlbiA9IHRlcnJhaW5WMihzZWVkKTtcbiAgICByZXR1cm4gZ2VuLnRvcE1hdGVyaWFsKHgsIHosIGdlbi5jb2x1bW4oeCwgeiksIHNsb3BlLFxuICAgICAgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoaCwgc3MsIG5lYXJXYXRlcikpO1xuICB9XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB5OiBudW1iZXI7XG4gIHRvcDogTWF0SWQ7XG4gIHNsb3BlOiBudW1iZXI7XG59XG5cbi8qKiBCYXNlIHN1cmZhY2Ugc2FtcGxlIGZvciBtYWNybyBMT0QuIERvZXMgbm90IGluY2x1ZGUgdm94ZWwgZWRpdHMvb3ZlcmhhbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZVN1cmZhY2Uoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFN1cmZhY2VTYW1wbGUge1xuICBjb25zdCB5ID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICBjb25zdCBzbG9wZSA9IHNsb3BlQXQoc2VlZCwgeCwgeiwgeSk7XG4gIHJldHVybiB7IHksIHRvcDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCB5LCBzbG9wZSksIHNsb3BlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2h1bmsgZ2VuZXJhdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICByZXR1cm4gZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KGN4LCBjeikpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgYmFzZSA9IGdlbmVyYXRlQmFzZUNodW5rKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjeCwgY3opO1xuICByZXR1cm4gaW5zdGFsbEJhc2VDaHVuayh3b3JsZCwgYmFzZSwgcGVyZm9ybWFuY2Uubm93KCkgLSB0MCk7XG59XG5cbi8qKlxuICogQmFzZSBnZW5lcmF0ZWQgY29udGVudHMgb2YgYSBjaHVuayBiZWZvcmUgZHVyYWJsZSBlZGl0cy4gQSBwdXJlIGZ1bmN0aW9uIG9mXG4gKiAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24sIGN4LCBjeik6IHNhZmUgdG8gY29tcHV0ZSBpbiBhIFdlYiBXb3JrZXIsIGFuZCB0aGVcbiAqIGJ5dGVzIGFyZSBpZGVudGljYWwgd2hlcmV2ZXIgaXQgcnVucy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBCYXNlQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBzZWVkOiBudW1iZXI7XG4gIHZlcnNpb246IG51bWJlcjtcbiAgZGF0YTogVWludDhBcnJheTtcbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQmFzZUNodW5rKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQmFzZUNodW5rIHtcbiAgY29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KENIVU5LX1ZPTFVNRSk7XG4gIGNvbnN0IGhlaWdodHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3QgdG9wTWF0ZXJpYWxzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBjb25zdCB2MiA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpIDogbnVsbDtcblxuICAvLyBQYWRkZWQgaGVpZ2h0IGNhY2hlOiBhIHRocmVlLWNlbGwgYm9yZGVyIGNvdmVycyBzbG9wZSwgYmVhY2ggYW5kIGxlZGdlcy5cbiAgY29uc3QgUCA9IDM7XG4gIGNvbnN0IFBXID0gQ0hVTktfU0laRSArIFAgKiAyO1xuICBjb25zdCBiYXNlSCA9IG5ldyBJbnQxNkFycmF5KFBXICogUFcpO1xuICBjb25zdCB2MkNvbHM6IFYyQ29sdW1uW10gfCBudWxsID0gdjIgPyBuZXcgQXJyYXkoQ0hVTktfQVJFQSkgOiBudWxsO1xuICBmb3IgKGxldCBweiA9IDA7IHB6IDwgUFc7IHB6KyspIHtcbiAgICBmb3IgKGxldCBweCA9IDA7IHB4IDwgUFc7IHB4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBweCAtIFAsIHd6ID0gb3ogKyBweiAtIFA7XG4gICAgICBpZiAodjIpIHtcbiAgICAgICAgY29uc3QgY29sID0gdjIuY29sdW1uKHd4LCB3eik7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBjb2wuaDtcbiAgICAgICAgY29uc3QgbHggPSBweCAtIFAsIGx6ID0gcHogLSBQO1xuICAgICAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHYyQ29scyFbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY29sO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB3eCwgd3opO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB2MkNvbCA9IHYyQ29scyA/IHYyQ29sc1tseiAqIENIVU5LX1NJWkUgKyBseF0gOiBudWxsO1xuICAgICAgY29uc3QgdG9wID0gdjIgJiYgdjJDb2xcbiAgICAgICAgPyB2Mi50b3BNYXRlcmlhbCh3eCwgd3osIHYyQ29sLCBzbG9wZSwgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGhoLCBzcywgbmVhcldhdGVyKSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHRoZSBjb2x1bW4nc1xuICAgICAgLy8gd2F0ZXIgbGV2ZWwgKHNlYSBsZXZlbCBpbiB2MTsgdGhlIGh5ZHJvbG9naWNhbCBsZXZlbCBpbiB2MikuXG4gICAgICBjb25zdCB3YXRlckxldmVsID0gdjJDb2wgPyBNYXRoLm1pbihZX01BWCwgdjJDb2wubGV2ZWwpIDogU0VBX0xFVkVMO1xuICAgICAgaWYgKGggPCB3YXRlckxldmVsKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCB3YXRlckxldmVsOyB5KyspIHtcbiAgICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopO1xuICAgICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5XQVRFUjtcbiAgICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b3BTb2xpZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5tYXgoWV9NSU4sIGggLSAxKSk7XG4gICAgICBoZWlnaHRzW2NvbF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tjb2xdID0gdG9wO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb3RydWRpbmcgbGVkZ2VzOiBvbmUgb3IgdHdvIHN0b25lIGJsb2NrcyBleHRlbmQgZnJvbSBhIGhpZ2ggY29sdW1uIG92ZXJcbiAgLy8gYSBsb3dlciBuZWlnaGJvdXIuIFRoZXkgY3JlYXRlIHJlYWRhYmxlIG92ZXJoYW5ncyB3aXRob3V0IGEgZnVsbCBjYXZlIHBhc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBpZiAoc2xvcGUgPCAyKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRpcnM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1stMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWzAsIDFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2YgZGlycykge1xuICAgICAgICBjb25zdCBueCA9IGx4ICsgZHgsIG56ID0gbHogKyBkejtcbiAgICAgICAgaWYgKG54IDwgMCB8fCBueiA8IDAgfHwgbnggPj0gQ0hVTktfU0laRSB8fCBueiA+PSBDSFVOS19TSVpFKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbmggPSBiYXNlSFsobnogKyBQKSAqIFBXICsgKG54ICsgUCldO1xuICAgICAgICBpZiAoaCAtIG5oIDwgMikgY29udGludWU7XG4gICAgICAgIGlmIChoYXNoM2kobHgsIGx6LCBkeCAqIDMgKyBkeiAqIDcsIHNlZWQgKyAxNTApIDwgMC41NSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHkgPSBoIC0gMjtcbiAgICAgICAgaWYgKHkgPCBZX01JTiB8fCB5ID49IGgpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KG54LCB5VG9JbmRleCh5KSwgbnopO1xuICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtpZHhdID0gTUFULlNUT05FO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmVjb21wdXRlIHRoZSBjb2x1bW4gY2FjaGUgYWZ0ZXIgbGVkZ2VzL2NhdmVzLiBUaGUgZXhwb3NlZCB0b3AgbWF0ZXJpYWxcbiAgLy8gbXVzdCBjb21lIGZyb20gdGhlIGFjdHVhbCB0b3Agc29saWQgdm94ZWwsIG5vdCB0aGUgcHJlLWNhcnZlIGd1ZXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgIGxldCB0b3BNYXQ6IG51bWJlciA9IHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgY29uc3QgbSA9IGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICAgIGhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG9wTWF0O1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGN4LCBjeiwgc2VlZCwgdmVyc2lvbiwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIgfTtcbn1cblxuLyoqXG4gKiBJbnN0YWxsIGJhc2UgY29udGVudHMgYXMgYSByZXNpZGVudCBjaHVuazogYXBwbHkgZHVyYWJsZSBlZGl0cywgdXBkYXRlXG4gKiBzdGF0cywgYW5kIHJ1biBkZXRlcm1pbmlzdGljIGVudGl0eSBnZW5lcmF0aW9uLiBNYWluLXRocmVhZCBvbmx5OyB0aGlzIGlzXG4gKiB0aGUgc2luZ2xlIHdyaXRlciBvZiBXb3JsZC4gUmV0dXJucyB0aGUgYWxyZWFkeS1yZXNpZGVudCBjaHVuayBpZiBvbmUgZXhpc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbEJhc2VDaHVuayh3b3JsZDogV29ybGQsIGJhc2U6IEJhc2VDaHVuaywgZ2VuZXJhdGlvbk1zID0gMCk6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGJhc2Uuc2VlZCAhPT0gd29ybGQuc2VlZCB8fCBiYXNlLnZlcnNpb24gIT09IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdiYXNlIGNodW5rIGJlbG9uZ3MgdG8gYSBkaWZmZXJlbnQgd29ybGQgY29uZmlndXJhdGlvbicpO1xuICB9XG4gIGNvbnN0IHsgY3gsIGN6LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9ID0gYmFzZTtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgY2h1bms6IFZveGVsQ2h1bmsgPSB7XG4gICAgY3gsIGN6LCBrZXksIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyLFxuICAgIGRpcnR5OiB0cnVlLFxuICAgIGdlbmVyYXRlZEF0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgfTtcblxuICAvLyBBcHBseSBkdXJhYmxlIGVkaXRzIGFmdGVyIGJhc2UgZ2VuZXJhdGlvbi5cbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgaWYgKGVkaXRzKSB7XG4gICAgZm9yIChjb25zdCBbaWR4LCBtXSBvZiBlZGl0cykge1xuICAgICAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgICB9XG4gICAgLy8gUmVjb21wdXRlIHRoZSBjYWNoZSBmb3IgZWRpdGVkIGNodW5rcy5cbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCBseCwgbHopO1xuICAgIH1cbiAgfVxuICAvLyBOb24tYWlyIGNvdW50cyBhcmUgZGVyaXZlZCByZW5kZXJlciBzdGF0aXN0aWNzLCBub3QgZHVyYWJsZSB3b3JsZCBzdGF0ZS5cbiAgLy8gRWRpdGVkIGJhc2UgYWlyIG1heSBiZWNvbWUgc29saWQgKGFuZCB2aWNlIHZlcnNhKSBkdXJpbmcgcmVzdG9yYXRpb24uXG4gIGxldCBlZGl0ZWROb25BaXIgPSAwO1xuICBmb3IgKGNvbnN0IG1hdGVyaWFsIG9mIGNodW5rLmRhdGEpIGlmIChtYXRlcmlhbCAhPT0gTUFULkFJUikgZWRpdGVkTm9uQWlyKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBlZGl0ZWROb25BaXIgLSBub25BaXI7XG5cbiAgd29ybGQuY2h1bmtzLnNldChrZXksIGNodW5rKTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBub25BaXI7XG4gIHdvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyArPSBnZW5lcmF0aW9uTXM7XG4gIHdvcmxkLmRpcnR5LmFkZChrZXkpO1xuXG4gIGdlbmVyYXRlRW50aXRpZXMod29ybGQsIGNodW5rKTtcbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vKiogQSBiYXNlLXRlcnJhaW4gY2FjaGUgc2hhcmVkIGJ5IGVkaXRlZCBhbmQgdW5lZGl0ZWQgcmVnZW5lcmF0aW9uLiBOYXR1cmFsXG4gKiBzY2VuZXJ5IG5ldmVyIGRlcGVuZHMgb24gbGF0ZXIgdm94ZWwgZWRpdHM7IHRoaXMgYWxzbyBsZXRzIGEgc25hcHNob3QgcmVzdG9yZVxuICogYSBoYXJ2ZXN0ZWQgY2h1bmsgd2l0aG91dCBtYXRlcmlhbGl6aW5nIHVucmVsYXRlZCBuZWlnaGJvdXJpbmcgY2h1bmtzLiAqL1xuY29uc3QgYmFzZUNvbHVtbkNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hcDxzdHJpbmcsIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0+PigpO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDb2x1bW5zIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5OyB9XG5cbi8qKiBCYXNlIChwcmUtY2FydmUsIHByZS1lZGl0KSBjb2x1bW4gaGVpZ2h0cy9tYXRlcmlhbHMgdXNlZCBmb3IgZW50aXR5IHBsYWNlbWVudC4gUHVyZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlQmFzZUNvbHVtbnMoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ29sdW1ucyB7XG4gIGNvbnN0IGNvbHVtbnMgPSB7IGhlaWdodHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpLCB0b3BNYXRlcmlhbHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpIH07XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHgsIHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHopO1xuICAgICAgY29uc3Qgc2xvcGUgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IHZlcnNpb25lZFNsb3BlKHNlZWQsIHZlcnNpb24sIHgsIHosIGgpIDogc2xvcGVBdChzZWVkLCB4LCB6LCBoKTtcbiAgICAgIGNvbnN0IGluZGV4ID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLmhlaWdodHNbaW5kZXhdID0gY2xhbXAoaCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2luZGV4XSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gYmFzZVRvcE1hdGVyaWFsRm9yKHNlZWQsIHZlcnNpb24sIHgsIHosIGgsIHNsb3BlKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29sdW1ucztcbn1cblxuLyoqIFByb3ZpZGUgcHJlY29tcHV0ZWQgYmFzZSBjb2x1bW5zIChmb3IgZXhhbXBsZSBmcm9tIGEgd29ya2VyKSBiZWZvcmUgaW5zdGFsbGluZyBhIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlZWRCYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nLCBjb2x1bW5zOiBCYXNlQ29sdW1ucyk6IHZvaWQge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGlmICghY2FjaGUuaGFzKGtleSkpIGNhY2hlLnNldChrZXksIGNvbHVtbnMpO1xufVxuXG5mdW5jdGlvbiBiYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogQmFzZUNvbHVtbnMge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlLmdldChjaHVuay5rZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBjb2x1bW5zID0gY29tcHV0ZUJhc2VDb2x1bW5zKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjaHVuay5jeCwgY2h1bmsuY3opO1xuICBjYWNoZS5zZXQoY2h1bmsua2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVyaXZlZCBjaGFuZ2UgdHJhY2tpbmcgKG5vdCBhdXRob3JpdGF0aXZlIHN0YXRlKSAtLS0tLS0tLS0tXG4vLyBSZW5kZXJlcnMgbmVlZCB0byBrbm93IHdoZW4gdGhlIGVkaXQgb3ZlcmxheSBjaGFuZ2VkIHdpdGhvdXQgd2Fsa2luZyBldmVyeVxuLy8gZWRpdCBlYWNoIGZyYW1lLiBUaGUgY291bnRlciBsaXZlcyBvdXRzaWRlIFdvcmxkIHNvIGl0IG5ldmVyIGVudGVycyBhXG4vLyBzbmFwc2hvdCBvciBjYW5vbmljYWwgaGFzaC5cbmNvbnN0IGVkaXRWZXJzaW9ucyA9IG5ldyBXZWFrTWFwPFdvcmxkLCBudW1iZXI+KCk7XG5cbi8qKiBNb25vdG9uaWMgY291bnQgb2YgZWRpdC1vdmVybGF5IGNoYW5nZXMgZm9yIHRoaXMgV29ybGQgb2JqZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVkaXRWZXJzaW9uKHdvcmxkOiBXb3JsZCk6IG51bWJlciB7XG4gIHJldHVybiBlZGl0VmVyc2lvbnMuZ2V0KHdvcmxkKSA/PyAwO1xufVxuXG4vKiogQ2FsbCBhZnRlciByZXBsYWNpbmcgb3IgYnVsay1jaGFuZ2luZyBgd29ybGQuZWRpdHNgIG91dHNpZGUgc2V0Vm94ZWwuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya0VkaXRzQ2hhbmdlZCh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZWRpdFZlcnNpb25zLnNldCh3b3JsZCwgZWRpdFZlcnNpb24od29ybGQpICsgMSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gbm9uLWdlbmVyYXRpbmcgcXVlcmllcyAtLS0tLS0tLS0tXG4vLyBNb3ZpbmcgcHJlc2VudGF0aW9uIChjaGFyYWN0ZXJzLCBhbmltYWxzLCBjYW1lcmEpIG11c3QgbmV2ZXIgdHJpZ2dlciBjaHVua1xuLy8gZ2VuZXJhdGlvbiBhcyBhIHNpZGUgZWZmZWN0IG9mIGFza2luZyBhYm91dCB0ZXJyYWluLiBUaGVzZSByZXR1cm4gbnVsbCB3aGVuXG4vLyB0aGUgY29sdW1uJ3MgY2h1bmsgaXMgbm90IHJlc2lkZW50LlxuXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRDaHVua0F0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBudWxsO1xuICByZXR1cm4gd29ybGQuY2h1bmtzLmdldChjaHVua0tleSh3b3JsZFRvQ2h1bmtYKHgpLCB3b3JsZFRvQ2h1bmtaKHopKSkgPz8gbnVsbDtcbn1cblxuLyoqIExpa2Ugc3VyZmFjZUF0LCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50U3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgfCBudWxsIHtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuLyoqIExpa2UgZ2V0Vm94ZWwsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRWb3hlbEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHwgbnVsbCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmljdENodW5rKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCF3b3JsZC5jaHVua3MuaGFzKGtleSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuY2h1bmtzLmRlbGV0ZShrZXkpO1xuICB3b3JsZC5zdGF0cy5jaHVua3NFdmljdGVkKys7XG4gIC8vIENodW5rIGJ5dGVzIGFuZCBjb2x1bW4gY2FjaGVzIGFyZSByZWdlbmVyYXRlZCBvbiBkZW1hbmQuIEVudGl0aWVzIHJlbWFpblxuICAvLyBhdXRob3JpdGF0aXZlOiBldmljdGlvbiBtdXN0IG5vdCBmb3JnZXQgdGhlaXIgcGVyc2lzdGVudCBzdGF0ZS5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcXVlcmllcyAvIGVkaXRzIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBnZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG06IE1hdElkKTogYm9vbGVhbiB7XG4gIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBZX01BWCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBpZHggPSBsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgY29uc3QgcHJldmlvdXNFZGl0ID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rS2V5KGN4LCBjeikpPy5nZXQoaWR4KTtcbiAgLy8gQSBjaHVuayBldmljdGVkIGFmdGVyIGFuIGVhcmxpZXIgZWRpdCBjYW4gcmVnZW5lcmF0ZSB3aXRoIHRoYXQgZHVyYWJsZVxuICAvLyBtYXRlcmlhbCBhbHJlYWR5IGFwcGxpZWQuIERyb3BwaW5nIHRoZSBlZGl0IGhlcmUgd291bGQgbWFrZSBpdCBkaXNhcHBlYXJcbiAgLy8gb24gdGhlIG5leHQgZXZpY3Rpb24vcmVzdG9yYXRpb24sIGV2ZW4gdGhvdWdoIHRoZSBjdXJyZW50IHdyaXRlIG5vLW9wcy5cbiAgaWYgKHByZXZpb3VzRWRpdCA9PT0gbSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gZmFsc2U7XG4gIGxldCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChjaHVuay5rZXkpO1xuICBpZiAoIWVkaXRzKSB7IGVkaXRzID0gbmV3IE1hcCgpOyB3b3JsZC5lZGl0cy5zZXQoY2h1bmsua2V5LCBlZGl0cyk7IH1cbiAgLy8gQW4gaWRlbXBvdGVudCB3cml0ZSBtdXN0IHN0aWxsIHJlc3RvcmUgYSBkdXJhYmxlIGRlbHRhIGRpc2NhcmRlZCBieSBhblxuICAvLyBvbGRlciBzbmFwc2hvdCBvciBkZWx0YSBkZWNvZGVyLiBJdCBpcyBub3QgYSBuZXcgYXV0aG9yaXRhdGl2ZSByZXZpc2lvbi5cbiAgaWYgKGNodW5rLmRhdGFbaWR4XSA9PT0gbSkge1xuICAgIGlmICghZWRpdHMuaGFzKGlkeCkpIGVkaXRzLnNldChpZHgsIG0pO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgbWFya0VkaXRzQ2hhbmdlZCh3b3JsZCk7XG4gIGNodW5rLmRpcnR5ID0gdHJ1ZTtcbiAgd29ybGQuZGlydHkuYWRkKGNodW5rLmtleSk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCB3b3JsZFRvTG9jYWxYKHgpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rOiBWb3hlbENodW5rLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogdm9pZCB7XG4gIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICBpZiAoaXNTb2xpZChjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildKSkgeyB0b3BTb2xpZCA9IHk7IGJyZWFrOyB9XG4gIH1cbiAgY2h1bmsuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgY29uc3QgdG0gPSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICBpZiAodG9wU29saWQgPj0gWV9NSU4pIHtcbiAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh0b3BTb2xpZCksIGx6KV07XG4gICAgaWYgKG0gIT09IE1BVC5XQVRFUikgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IG07XG4gIH0gZWxzZSB7XG4gICAgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRtO1xuICB9XG59XG5cbi8qKlxuICogVGhlIHkgY29vcmRpbmF0ZSBvZiB0aGUgZXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uIGF0IHgvei5cbiAqIEEgc29saWQgdm94ZWwgYXQgeSBvY2N1cGllcyBbeSwgeSsxKSwgc28gdGhlIHdhbGthYmxlIHN1cmZhY2UgaXMgdG9wU29saWQrMS5cbiAqIFRoaXMgaXMgYSBkZXJpdmVkIHF1ZXJ5OyB0aGUgYXV0aG9yaXRhdGl2ZSBzdGF0ZSByZW1haW5zIHRoZSB2b3hlbCB2b2x1bWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBZX01JTjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBZX01JTjtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsudG9wTWF0ZXJpYWxzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWlnaHRBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiA8IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGggPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICAgIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIC0gaCA6IDA7XG4gIH1cbiAgcmV0dXJuIHdhdGVyU3VyZmFjZUF0KHdvcmxkLCB4LCB6KSAtIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKlxuICogVG9wIG9mIHRoZSB3YXRlciBjb2x1bW4gc3RhbmRpbmcgb24gdGhlIHNvbGlkIHN1cmZhY2UgKGVxdWFsIHRvIHRoZSBzdXJmYWNlXG4gKiB3aGVuIGRyeSkuIFJlYWRzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVscywgc28gZWRpdHMgYW5kIGR1ZyBwaXRzIGFyZSBleGFjdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyU3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIHdoaWxlICh5IDwgWV9NQVggJiYgZ2V0Vm94ZWwod29ybGQsIHgsIHksIHopID09PSBNQVQuV0FURVIpIHkrKztcbiAgcmV0dXJuIHk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZW50aXRpZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gYWRkRW50aXR5KHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5oYXMoZS5pZCkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIHJldHVybjtcbiAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGUpO1xuICBsZXQgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgbGlzdCk7IH1cbiAgbGlzdC5wdXNoKGUuaWQpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIC8vIEdlbmVyYXRpb24gaXMgZGV0ZXJtaW5pc3RpYyBhbmQgYWR2YW5jZXMgbm8gcGxheWVyLWNvbW1hbmQgcHJlY29uZGl0aW9uLlxuICAvLyBBdXRob3JlZCBzY2FmZm9sZGluZyBtYXkgdHJhbnNpZW50bHkgY2hhbmdlIGl0OyB0aGUgc25hcHNob3QgcmVzdG9yZXMgdGhlXG4gIC8vIHNhdmVkIHJldmlzaW9uIGFmdGVyIHBsYWNpbmcgdGhhdCBzY2FmZm9sZGluZy5cbn1cblxuLyoqXG4gKiBSZW1vdmUgYW4gZW50aXR5IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd29ybGQuIFVzZWQgd2hlbiBhIHNpdGUgaXMgY2xlYXJlZDpcbiAqIHRoZSByZXNvdXJjZSB5aWVsZCBpcyBhY2NvdW50ZWQgZm9yIGJ5IHRoZSBjYWxsZXIsIGFuZCB0aGUgZW50aXR5IG11c3Qgc3RvcFxuICogZXhpc3RpbmcgZm9yIGNvbGxpc2lvbiwgb2JzdHJ1Y3Rpb24gYW5kIHBlcnNpc3RlbmNlLCBub3QganVzdCBiZSBoaWRkZW4gYnlcbiAqIHRoZSByZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICBjb25zdCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKGxpc3QpIHtcbiAgICBjb25zdCBpID0gbGlzdC5pbmRleE9mKGlkKTtcbiAgICBpZiAoaSA+PSAwKSBsaXN0LnNwbGljZShpLCAxKTtcbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChpZCk7XG4gIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUlkKGNodW5rOiBzdHJpbmcsIGk6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBgZToke2NodW5rfToke2l9YDtcbn1cblxuZnVuY3Rpb24gZm9yZXN0U2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgZWFzdCA9IE1hdGguZXhwKC0oKCh3eCAtIDIyMCkgLyAyNjApICoqIDIgKyAoKHd6ICsgMTEwKSAvIDIyMCkgKiogMikpO1xuICBjb25zdCBub3J0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDIwKSAvIDMwMCkgKiogMiArICgod3ogKyAzMDApIC8gMTkwKSAqKiAyKSk7XG4gIGNvbnN0IHdlc3QgPSBNYXRoLmV4cCgtKCgod3ggKyAzNDApIC8gMjAwKSAqKiAyICsgKCh3eiAtIDEyMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3Qgc291dGggPSBNYXRoLmV4cCgtKCgod3ggLSAxMjApIC8gMjQwKSAqKiAyICsgKCh3eiAtIDMzMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3QgbW9pc3R1cmUgPSBmYm0yKHd4IC8gMjYwLCB3eiAvIDI2MCwgc2VlZCArIDIwMSwgNCk7XG4gIGNvbnN0IHZhbGxleSA9IE1hdGguZXhwKC0oKHd4IC8gMTQwKSAqKiAyICsgKHd6IC8gMTA1KSAqKiAyKSk7XG4gIHJldHVybiBNYXRoLm1heChlYXN0LCBub3J0aCAqIDAuOTIsIHdlc3QgKiAwLjgwLCBzb3V0aCAqIDAuNzgpICogMC44MlxuICAgICsgbW9pc3R1cmUgKiAwLjM4IC0gMC4yMiAtIHZhbGxleSAqIDAuMzQ7XG59XG5cbmZ1bmN0aW9uIHJvY2tTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBtb3VudGFpbiA9IGZibTIod3ggLyAzMzAsIHd6IC8gMzMwLCBzZWVkICsgMjAyLCAzKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAxNDAsIHd6IC8gMTQwLCBzZWVkICsgMjAzLCAzKSAtIDEpO1xuICByZXR1cm4gbW91bnRhaW4gKiAwLjU1ICsgcmlkZ2UgKiAwLjQ1O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB2b2lkIHtcbiAgZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZCwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbn1cblxuLyoqIEBpbnRlcm5hbCBSZXBsYXlzIGRldGVybWluaXN0aWMgZ2VuZXJhdGlvbiBmb3Igc25hcHNob3QgZW50aXR5IGRlbHRhcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBpZiAod29ybGQuZW50aXR5Q2h1bmtzLmhhcyhrZXkpKSByZXR1cm47XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybjtcblxuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChoYXNoMmkoY2h1bmsuY3gsIGNodW5rLmN6LCB3b3JsZC5zZWVkICsgOTAwKSAqIDQyOTQ5NjcyOTYpID4+PiAwKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIGNvbnN0IGNvbHVtbnMgPSBiYXNlQ29sdW1ucyh3b3JsZCwgY2h1bmspO1xuICBsZXQgbiA9IDA7XG4gIGxldCBuYXR1cmFsVHJlZXMgPSAwO1xuICBsZXQgbmF0dXJhbFBpbmtUcmVlcyA9IDA7XG5cbiAgY29uc3QgbG9jYWxTdXJmYWNlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdICsgWV9NSU47XG4gIH07XG4gIGNvbnN0IGxvY2FsVG9wID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBNYXRJZCA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSBhcyBNYXRJZDtcbiAgfTtcbiAgY29uc3QgbG9jYWxTbG9wZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgcmV0dXJuIE1hdGgubWF4KFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggKyAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogKyAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICApO1xuICB9O1xuXG4gIC8vIEEgaml0dGVyZWQgOCBtIGxhdHRpY2UgZ2l2ZXMgY29oZXJlbnQgbWFzc2VzIGFuZCBhdm9pZHMgcGVyLWZyYW1lIHNjYXR0ZXIuXG4gIGZvciAobGV0IGd6ID0gMDsgZ3ogPCBDSFVOS19TSVpFOyBneiArPSA4KSB7XG4gICAgZm9yIChsZXQgZ3ggPSAwOyBneCA8IENIVU5LX1NJWkU7IGd4ICs9IDgpIHtcbiAgICAgIGNvbnN0IGx4ID0gY2xhbXAoTWF0aC5mbG9vcihneCArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IGx6ID0gY2xhbXAoTWF0aC5mbG9vcihneiArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgICAgaWYgKGggPD0gU0VBX0xFVkVMICsgMSkgY29udGludWU7XG4gICAgICBjb25zdCBzbG9wZSA9IGxvY2FsU2xvcGUobHgsIGx6KTtcbiAgICAgIGNvbnN0IHRvcCA9IGxvY2FsVG9wKGx4LCBseik7XG4gICAgICBpZiAodG9wID09PSBNQVQuV0FURVIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZm9yZXN0ID0gZm9yZXN0U2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvY2t5ID0gcm9ja1Njb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2xsID0gcm5kKCk7XG5cbiAgICAgIGNvbnN0IHRyZWVDaGFuY2UgPSBmb3Jlc3QgPiAwLjUwID8gMC43MiA6IGZvcmVzdCA+IDAuMzAgPyAwLjI1IDogMC4wNTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAyICYmIHJvbGwgPCB0cmVlQ2hhbmNlKSB7XG4gICAgICAgIC8vIFRoZSBjYXAgaXMgYSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZ2VuZXJhdGlvbiBwcm9wZXJ0eS4gSXQgY2Fubm90XG4gICAgICAgIC8vIGRlcGVuZCBvbiB3aGljaCBjaHVua3MgYSByZW5kZXJlciBsb2FkZWQgYmVmb3JlIHRoaXMgb25lLlxuICAgICAgICBsZXQga2luZDogRW50aXR5S2luZDtcbiAgICAgICAgbGV0IHZhcmlhbnQ6IG51bWJlcjtcbiAgICAgICAgY29uc3Qgc3BlY2llc1JvbGwgPSBybmQoKTtcbiAgICAgICAgaWYgKHNwZWNpZXNSb2xsIDwgMC4xMikge1xuICAgICAgICAgIGlmICgobmF0dXJhbFBpbmtUcmVlcyArIDEpID4gMC4yNSAqIChuYXR1cmFsVHJlZXMgKyAxKSkge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua092ZXJmbG93Kys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2Jsb3Nzb20nO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAyKTtcbiAgICAgICAgICAgIG5hdHVyYWxQaW5rVHJlZXMrKztcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNDApIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9zcGlyZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNzQpIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV90YWJsZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICB9XG4gICAgICAgIG5hdHVyYWxUcmVlcysrO1xuICAgICAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44OCArIHJuZCgpICogMC4yNCwgdmFyaWFudCxcbiAgICAgICAgICByZXNvdXJjZTogJ3dvb2QnLCByZW1haW5pbmc6IDEyLCB5aWVsZFBlckhhcnZlc3Q6IDQsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHJvY2t5ID4gMC40NiAmJiByb2xsIDwgMC4zOCkge1xuICAgICAgICAvLyBDb25zdW1lIHRoZSByZXRpcmVkIHN0b25lIGZvcm0ncyByYW5kb20gZHJhd3MgYW5kIGFsbG9jYXRlIGl0cyBvbGRcbiAgICAgICAgLy8gc2VxdWVuY2UgSUQsIGJ1dCBkbyBub3QgaW5zZXJ0IGFuIGVudGl0eS4gTGF0ZXIgbmF0dXJhbCBwbGFjZW1lbnRzXG4gICAgICAgIC8vIHRoZXJlZm9yZSByZW1haW4gYnl0ZS1mb3ItYnl0ZSBjb21wYXRpYmxlIHdpdGggcmVjb3JkZWQgc2F2ZXMuXG4gICAgICAgIGNvbnN0IHNpemVSb2xsID0gcm5kKCk7XG4gICAgICAgIGNvbnN0IGtpbmQ6IEVudGl0eUtpbmQgPSBzaXplUm9sbCA8IDAuNTUgPyAnc3R5bF9yb2NrX3NtYWxsJ1xuICAgICAgICAgIDogc2l6ZVJvbGwgPCAwLjkwID8gJ3N0eWxfcm9ja19tZWRpdW0nIDogJ3N0eWxfcm9ja19sYXJnZSc7XG4gICAgICAgIGNvbnN0IGlkID0gZW50aXR5SWQoY2h1bmsua2V5LCBuKyspO1xuICAgICAgICBjb25zdCByZWNvcmQgPSB7XG4gICAgICAgICAgaWQsIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByZXNvdXJjZTogJ3N0b25lJyBhcyBjb25zdCxcbiAgICAgICAgICByZW1haW5pbmc6IGtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gNCA6IGtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDggOiAxMixcbiAgICAgICAgICB5aWVsZFBlckhhcnZlc3Q6IDMsIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgIH07XG4gICAgICAgIC8vIE9ubHkgZW50aXRpZXMgdGhhdCBleGlzdGVkIGluIGFuIGFjY2VwdGVkIG9sZCBzYXZlIGdldCB0b21ic3RvbmVzLFxuICAgICAgICAvLyBkdXJpbmcgZXhwbGljaXQgbWlncmF0aW9uLiBPcmRpbmFyeSBnZW5lcmF0aW9uIG11c3QgcmVzdG9yZSBleGFjdGx5LlxuICAgICAgICBpZiAoaXNTdG9uZVJlcGxheSh3b3JsZCkpIGFkZEVudGl0eSh3b3JsZCwgcmVjb3JkKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuU1RPTkUgJiYgcm9ja3kgPiAwLjU4ICYmIHJvbGwgPCAwLjE4KSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfb3JlJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDIpLFxuICAgICAgICAgIHJlc291cmNlOiAnb3JlJywgcmVtYWluaW5nOiA4LCB5aWVsZFBlckhhcnZlc3Q6IDIsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDEgJiYgcm9sbCA8IDAuMzApIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9zaHJ1YicsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44ICsgcm5kKCkgKiAwLjQsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgICByZXNvdXJjZTogJ2ZpYmVyJywgcmVtYWluaW5nOiA0LCB5aWVsZFBlckhhcnZlc3Q6IDEsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkOiBXb3JsZCwga2luZDogRW50aXR5S2luZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgcm90OiBudW1iZXIsIHNjYWxlOiBudW1iZXIsIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsLCByZW1haW5pbmc6IG51bWJlciwgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmICh5IDw9IFNFQV9MRVZFTCkgcmV0dXJuO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgLy8gQSBoZXJvIGFzc2V0IG93bnMgaXRzIHNwb3Q6IGNsZWFyIGFueSBnZW5lcmF0ZWQgZW50aXR5IHRoYXQgd291bGQgb3ZlcmxhcFxuICAvLyBpdCwgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBpbmcgdGhlIGF1dGhvcmVkIGNvbXBvc2l0aW9uLlxuICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkgPz8gW107XG4gIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoa2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSByZXR1cm47XG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKGUgJiYgTWF0aC5oeXBvdChlLnggLSB4LCBlLnogLSB6KSA8IDIuNikge1xuICAgICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICAgIH1cbiAgfVxuICB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpKTtcbiAgLy8gQXV0aG9yZWQgY29tcG9zaXRpb24gaXMgZHVyYWJsZSBzdGF0ZTogaXQgY2FuIGNsZWFyIG92ZXJsYXBwaW5nIG5hdHVyYWxcbiAgLy8gZW50aXRpZXMsIHNvIHNhdmUgdGhlIGNvbXBsZXRlIGFmZmVjdGVkIGNodW5rIHJhdGhlciB0aGFuIG9ubHkgaXRzIGhlcm9lcy5cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcblxuICBjb25zdCBpZCA9IGBoZXJvOiR7a2luZH06JHtNYXRoLnJvdW5kKHgpfToke01hdGgucm91bmQoeil9YDtcbiAgY29uc3QgYmVmb3JlID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgY29uc3QgZW50aXR5OiBFbnRpdHkgPSB7XG4gICAgaWQsIGtpbmQsIGNodW5rOiBrZXksIHg6IHggKyAwLjUsIHksIHo6IHogKyAwLjUsXG4gICAgcm90LCBzY2FsZSwgdmFyaWFudCwgcmVzb3VyY2UsIHJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0LFxuICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogdHJ1ZSxcbiAgfTtcbiAgYWRkRW50aXR5KHdvcmxkLCBlbnRpdHkpO1xuICBpZiAod29ybGQuZW50aXRpZXMuc2l6ZSA+IGJlZm9yZSAmJiBraW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB7XG4gICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoa2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmF1dGhvcmVkUGxhY2VkKSByZXR1cm47XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gdHJ1ZTtcblxuICBjb25zdCBzaXRlczogQXJyYXk8eyBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7IHg6IG51bWJlcjsgejogbnVtYmVyOyByb3Q6IG51bWJlciB9PiA9IFtcbiAgICB7IGtpbmQ6ICd3YXlzdG9uZScsIHg6IC0xMCwgejogLTE0LCByb3Q6IDAgfSxcbiAgICB7IGtpbmQ6ICdtYXJrZXInLCB4OiAtMzIsIHo6IC04LCByb3Q6IE1hdGguUEkgLyAyIH0sXG4gIF07XG4gIGZvciAoY29uc3QgcyBvZiBzaXRlcykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoeSA8PSBTRUFfTEVWRUwpIGNvbnRpbnVlO1xuICAgIHdvcmxkLnNpdGVzLnB1c2goe1xuICAgICAgaWQ6IGBzaXRlOiR7cy5raW5kfWAsXG4gICAgICBraW5kOiBzLmtpbmQsXG4gICAgICB4OiBzLnggKyAwLjUsIHksIHo6IHMueiArIDAuNSxcbiAgICAgIHJvdDogcy5yb3QsXG4gICAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEEgaGVybyBncm92ZSBjb21wb3NlZCBpbiB0aGUgZGVmYXVsdCBjYW1lcmEncyB2aWV3IGRpcmVjdGlvbi4gVGhlc2UgYXJlXG4gIC8vIFN0eWwgbmF0dXJhbCBhc3NldHMgKEFTLTAwMSB2MiksIG5vdCBOb3hlbCBhcmNoaXRlY3R1cmU7IHRoZSBOb3hlbFxuICAvLyB3YXlzdG9uZS9tYXJrZXIgYWJvdmUgcmVtYWluIHRoZSBodW1hbi1tYWRlIGxhbmRtYXJrcy5cbiAgY29uc3QgZ3JvdmU6IEFycmF5PFtFbnRpdHlLaW5kLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0+ID0gW1xuICAgIFsnc3R5bF90cmVlX3NwaXJlJywgLTIyLCAtMjYsIDAsIDEuMDAsIDBdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTM0LCAtMTgsIDEsIDAuOTUsIE1hdGguUEkgLyAxMl0sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xNiwgLTM0LCAyLCAxLjAwLCBNYXRoLlBJIC8gNl0sXG4gICAgWydzdHlsX3RyZWVfYmxvc3NvbScsIC0yOCwgLTM4LCAwLCAwLjkwLCBNYXRoLlBJIC8gNF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtNDAsIC0zMCwgMiwgMS4wNSwgTWF0aC5QSSAvIDNdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTIsIC0yNCwgMCwgMC45MCwgTWF0aC5QSSAvIDIuNF0sXG4gIF07XG4gIGZvciAoY29uc3QgW2tpbmQsIHgsIHosIHZhcmlhbnQsIHNjYWxlLCByb3RdIG9mIGdyb3ZlKSB7XG4gICAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsIGtpbmQsIHgsIHosIHZhcmlhbnQsIHJvdCwgc2NhbGUsICd3b29kJywgMTIsIDQpO1xuICB9XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9yb2NrX21lZGl1bScsIC02LCAtMTAsIDAsIDAsIDEuMCwgJ3N0b25lJywgOCwgMyk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9zaHJ1YicsIC0xNCwgLTgsIDEsIE1hdGguUEkgLyAxMiwgMS4xLCAnZmliZXInLCA0LCAxKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX2NhaXJuJywgLTIwLCAtNiwgMCwgMCwgMS4wLCAnc3RvbmUnLCA2LCAyKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX29yZScsIC0zOCwgLTQyLCAwLCBNYXRoLlBJIC8gNCwgMS4xLCAnb3JlJywgOCwgMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBuZWFyZXN0SGFydmVzdGFibGUoXG4gIHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCByZXNvdXJjZT86IFJlc291cmNlVHlwZSxcbik6IEVudGl0eSB8IG51bGwge1xuICBsZXQgYmVzdDogRW50aXR5IHwgbnVsbCA9IG51bGw7XG4gIGxldCBiZXN0RCA9IHJhZGl1cyAqIHJhZGl1cztcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKVxuICAgICAgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgY29udGludWU7XG4gICAgaWYgKHJlc291cmNlICYmIGUucmVzb3VyY2UgIT09IHJlc291cmNlKSBjb250aW51ZTtcbiAgICBjb25zdCBkID0gKGUueCAtIHgpICoqIDIgKyAoZS56IC0geikgKiogMjtcbiAgICBpZiAoZCA8IGJlc3REKSB7IGJlc3REID0gZDsgYmVzdCA9IGU7IH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0UmVzdWx0IHsgZW50aXR5OiBFbnRpdHk7IHJlc291cmNlOiBSZXNvdXJjZVR5cGU7IGFtb3VudDogbnVtYmVyOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXJ2ZXN0RW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEhhcnZlc3RSZXN1bHQgfCBudWxsIHtcbiAgY29uc3QgZSA9IGxpdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsO1xuICBjb25zdCBhbW91bnQgPSBNYXRoLm1pbihlLnlpZWxkUGVySGFydmVzdCwgZS5yZW1haW5pbmcpO1xuICBpZiAod29ybGQubGlmZSAmJiBPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIG4pID0+IHN1bSArIG4sIDApICsgYW1vdW50ID4gMTIwKSByZXR1cm4gbnVsbDtcbiAgZS5yZW1haW5pbmcgLT0gYW1vdW50O1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBlLmhhcnZlc3RlZE9uY2UgPSB0cnVlO1xuICBpZiAoZS5yZW1haW5pbmcgPD0gMCkgZS5oYXJ2ZXN0ZWQgPSB0cnVlO1xuICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBlbnRpdHk6IGUsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQgfTtcbn1cblxuLyoqIFJlbW92ZSBldmVyeSByZXRpcmVkIHNvdXJjZSBhZnRlciB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheS4gVGhpcyBtaWdyYXRpb25cbiAqIGNyZWF0ZXMgZGV0ZXJtaW5pc3RpYyB0b21ic3RvbmVzIGJ1dCBpcyBub3QgYSBwbGF5ZXIgY29tbWFuZCBvciByZXZpc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXRpcmVTdG9uZUVudGl0aWVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBmb3IgKGNvbnN0IGUgb2YgWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXSkge1xuICAgIGlmICghaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkpIGNvbnRpbnVlO1xuICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShlLmlkKTtcbiAgICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChlLmlkKTtcbiAgICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgICBpZiAoIXdvcmxkLmVudGl0eUNodW5rcy5oYXMoZS5jaHVuaykpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIGZvciAoY29uc3QgW2tleSwgaWRzXSBvZiB3b3JsZC5lbnRpdHlDaHVua3MpIHtcbiAgICBjb25zdCBhY3RpdmUgPSBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSk7XG4gICAgaWYgKGFjdGl2ZS5sZW5ndGggPiAwIHx8IHdvcmxkLmVudGl0eUNoYW5nZXMuaGFzKGtleSkpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBhY3RpdmUpO1xuICAgIGVsc2Ugd29ybGQuZW50aXR5Q2h1bmtzLmRlbGV0ZShrZXkpO1xuICB9XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwZXJzaXN0ZW5jZSAvIGF1dGhvcml0eSBib3VuZGFyeSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWFuaWZlc3Qge1xuICBzY2hlbWE6IDE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgcGFyYW1zSGFzaDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBmbnYxYSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgaCA9IDB4ODExYzlkYzU7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGggXj0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIGggPSBNYXRoLmltdWwoaCwgMHgwMTAwMDE5Myk7XG4gIH1cbiAgcmV0dXJuIChoID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkTWFuaWZlc3Qod29ybGQ6IFdvcmxkKTogV29ybGRNYW5pZmVzdCB7XG4gIGNvbnN0IHAgPSB3b3JsZC5wYXJhbXM7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIHNlZWQ6IHdvcmxkLnNlZWQsXG4gICAgZ2VuZXJhdG9yVmVyc2lvbjogcC5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIHNpemU6IHAuc2l6ZSxcbiAgICBjaHVua1NpemU6IHAuY2h1bmtTaXplLFxuICAgIHlNaW46IHAueU1pbixcbiAgICB5TWF4OiBwLnlNYXgsXG4gICAgc2VhTGV2ZWw6IHAuc2VhTGV2ZWwsXG4gICAgcGFyYW1zSGFzaDogZm52MWEoSlNPTi5zdHJpbmdpZnkocCkpLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsRWRpdCB7IGk6IG51bWJlcjsgbTogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBzY2hlbWE6IDE7XG4gIGtleTogc3RyaW5nO1xuICBiYXNlVmVyc2lvbjogbnVtYmVyO1xuICBlZGl0czogVm94ZWxFZGl0W107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBDaHVua0RlbHRhIHtcbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAga2V5LFxuICAgIGJhc2VWZXJzaW9uOiB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBlZGl0czogZWRpdHMgPyBbLi4uZWRpdHMuZW50cmllcygpXS5tYXAoKFtpLCBtXSkgPT4gKHsgaSwgbSB9KSkuc29ydCgoYSwgYikgPT4gYS5pIC0gYi5pKSA6IFtdLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwgZGVsdGE6IENodW5rRGVsdGEpOiB2b2lkIHtcbiAgY29uc3QgW2N4LCBjel0gPSBkZWx0YS5rZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgZm9yIChjb25zdCBlIG9mIGRlbHRhLmVkaXRzKSB7XG4gICAgY29uc3QgeUluZGV4ID0gTWF0aC5mbG9vcihlLmkgLyBDSFVOS19BUkVBKTtcbiAgICBjb25zdCByZW0gPSBlLmkgJSBDSFVOS19BUkVBO1xuICAgIGNvbnN0IGx6ID0gTWF0aC5mbG9vcihyZW0gLyBDSFVOS19TSVpFKTtcbiAgICBjb25zdCBseCA9IHJlbSAlIENIVU5LX1NJWkU7XG4gICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseDtcbiAgICBjb25zdCB5ID0gWV9NSU4gKyB5SW5kZXg7XG4gICAgY29uc3QgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICBzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgZS5tIGFzIE1hdElkKTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIHRpbWUgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBUaW1lU3RhdGUgeyB0OiBudW1iZXI7IGRheUxlbmd0aFNlYzogbnVtYmVyOyBwYXVzZWQ6IGJvb2xlYW47IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkdmFuY2VUaW1lKHM6IFRpbWVTdGF0ZSwgZHQ6IG51bWJlcik6IHZvaWQge1xuICBpZiAocy5wYXVzZWQpIHJldHVybjtcbiAgcy50ID0gKHMudCArIGR0IC8gcy5kYXlMZW5ndGhTZWMpICUgMTtcbn1cbiIsICIvLyBUZXJyYWluIHF1ZXJ5IGxheWVyIFx1MjAxNCBwdXJlIHNpbXVsYXRpb24sIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAyIFN5c3RlbSAxOiBvbmUgc2hhcmVkLCBjYWNoZWQgY29udHJhY3QgZm9yIGNvbnN0cnVjdGlvbiwgZmFybWluZyxcbi8vIG1vdmVtZW50LCBuYXZpZ2F0aW9uIGFuZCB0aGUgQUkgYWdlbnQuIFRoZXNlIHF1ZXJpZXMgZGVzY3JpYmUgdGhlXG4vLyBhdXRob3JpdGF0aXZlIHZveGVsIHZvbHVtZTsgdGhleSBuZXZlciBtdXRhdGUgaXQgYW5kIG5ldmVyIGNyZWF0ZSBhIHNlY29uZFxuLy8gdGVycmFpbiByZXByZXNlbnRhdGlvbi5cbi8vXG4vLyBDb252ZW50aW9uczpcbi8vICAgKiB4L3ogYXJlIGludGVnZXIgY29sdW1uIGNvb3JkaW5hdGVzIGluIFstMTAyNCwgMTAyNCkuXG4vLyAgICogeSBpcyBhbiBpbnRlZ2VyIHZveGVsIGNvb3JkaW5hdGUgaW4gWy0xNiwgMTEyKS5cbi8vICAgKiBzdXJmYWNlWSBpcyB0aGUgZXhwb3NlZCB0b3AgZmFjZSAodG9wU29saWQgKyAxKSwgbWF0Y2hpbmcgTTAwMS5cbi8vICAgKiBBIHJlY3QgaXMgaW5jbHVzaXZlIG9uIGFsbCBmb3VyIGVkZ2VzLlxuaW1wb3J0IHtcbiAgV29ybGQsIE1hdElkLCBNQVQsIFNFQV9MRVZFTCwgWV9NSU4sIFlfTUFYLCBIQUxGLFxuICBzdXJmYWNlQXQsIHRvcE1hdGVyaWFsQXRXb3JsZCwgZ2V0Vm94ZWwsIGlzU29saWQsXG4gIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBBY3RpdmVFbnRpdHlLaW5kLCBFbnRpdHlLaW5kLCBpc1JldGlyZWRTdG9uZUtpbmQsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcblxuZXhwb3J0IGludGVyZmFjZSBSZWN0IHtcbiAgeDA6IG51bWJlcjtcbiAgejA6IG51bWJlcjtcbiAgeDE6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbFJlZ2lvbiBleHRlbmRzIFJlY3Qge1xuICB5MDogbnVtYmVyO1xuICB5MTogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplUmVjdChyZWN0OiBSZWN0KTogUmVjdCB7XG4gIHJldHVybiB7XG4gICAgeDA6IE1hdGgubWluKHJlY3QueDAsIHJlY3QueDEpLFxuICAgIHowOiBNYXRoLm1pbihyZWN0LnowLCByZWN0LnoxKSxcbiAgICB4MTogTWF0aC5tYXgocmVjdC54MCwgcmVjdC54MSksXG4gICAgejE6IE1hdGgubWF4KHJlY3QuejAsIHJlY3QuejEpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdENvbHVtbnMocmVjdDogUmVjdCk6IG51bWJlciB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICByZXR1cm4gKHIueDEgLSByLngwICsgMSkgKiAoci56MSAtIHIuejAgKyAxKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RDb250YWlucyhyZWN0OiBSZWN0LCB4OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4geCA+PSByZWN0LngwICYmIHggPD0gcmVjdC54MSAmJiB6ID49IHJlY3QuejAgJiYgeiA8PSByZWN0LnoxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwYW5kUmVjdChyZWN0OiBSZWN0LCBhbW91bnQ6IG51bWJlcik6IFJlY3Qge1xuICByZXR1cm4ge1xuICAgIHgwOiByZWN0LngwIC0gYW1vdW50LFxuICAgIHowOiByZWN0LnowIC0gYW1vdW50LFxuICAgIHgxOiByZWN0LngxICsgYW1vdW50LFxuICAgIHoxOiByZWN0LnoxICsgYW1vdW50LFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdFRvUmVnaW9uKHJlY3Q6IFJlY3QsIHkwID0gWV9NSU4sIHkxID0gWV9NQVggLSAxKTogVm94ZWxSZWdpb24ge1xuICByZXR1cm4geyAuLi5ub3JtYWxpemVSZWN0KHJlY3QpLCB5MCwgeTEgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lvbnNPdmVybGFwKGE6IFZveGVsUmVnaW9uLCBiOiBWb3hlbFJlZ2lvbik6IGJvb2xlYW4ge1xuICByZXR1cm4gYS54MCA8PSBiLngxICYmIGEueDEgPj0gYi54MCAmJiBhLnowIDw9IGIuejEgJiYgYS56MSA+PSBiLnowXG4gICAgJiYgYS55MCA8PSBiLnkxICYmIGEueTEgPj0gYi55MDtcbn1cblxuLyoqIEluY2x1c2l2ZSBjb250YWlubWVudCBvZiBhIHZveGVsIGluIGEgd29yayBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbnZlbG9wZUNvbnRhaW5zKHJlY3RzOiByZWFkb25seSBWb3hlbFJlZ2lvbltdLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGZvciAoY29uc3QgciBvZiByZWN0cykge1xuICAgIGlmICh4ID49IHIueDAgJiYgeCA8PSByLngxICYmIHkgPj0gci55MCAmJiB5IDw9IHIueTEgJiYgeiA+PSByLnowICYmIHogPD0gci56MSkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRlcnJhaW5Db2x1bW4ge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgLyoqIEV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbjsgdGhlIGZpcnN0IGFpciBjZWxsIGFib3ZlIGl0LiAqL1xuICBzdXJmYWNlWTogbnVtYmVyO1xuICAvKiogVGhlIGhpZ2hlc3Qgc29saWQgdm94ZWwsIG9yIFlfTUlOIC0gMSBpZiB0aGUgY29sdW1uIGhhcyBubyBzb2xpZC4gKi9cbiAgdG9wU29saWRZOiBudW1iZXI7XG4gIHRvcE1hdGVyaWFsOiBNYXRJZDtcbiAgc29saWQ6IGJvb2xlYW47XG4gIC8qKiBXYXRlciBhYm92ZSB0aGUgc29saWQgc3VyZmFjZSwgdXAgdG8gc2VhIGxldmVsLiAwIG9uIGRyeSBsYW5kLiAqL1xuICB3YXRlckRlcHRoOiBudW1iZXI7XG4gIHVuZGVyd2F0ZXI6IGJvb2xlYW47XG4gIC8qKiBMYXJnZXN0IDQtbmVpZ2hib3VyIHN1cmZhY2Ugc3RlcCBpbiBtZXRyZXMgKDEgPSBhIHNpbmdsZSB2b3hlbCByaXNlcikuICovXG4gIHNsb3BlOiBudW1iZXI7XG4gIC8qKiBGcmVlIGFpciBjZWxscyBhYm92ZSB0aGUgc3VyZmFjZSwgY2FwcGVkIGF0IENMRUFSQU5DRV9QUk9CRS4gKi9cbiAgY2xlYXJhbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBDTEVBUkFOQ0VfUFJPQkUgPSA4O1xuXG5mdW5jdGlvbiBzdXJmYWNlQXRTYWZlKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGZhbGxiYWNrOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsbGJhY2s7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG4vKiogV2F0ZXIgZGVwdGggdGhhdCByZXNwZWN0cyBhIGRyeSBwaXQgYmVsb3cgc2VhIGxldmVsICh1bmxpa2UgaGVpZ2h0IGFsb25lKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXRDb2x1bW4od29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoc3VyZmFjZSA+PSBTRUFfTEVWRUwpIHJldHVybiAwO1xuICBpZiAoZ2V0Vm94ZWwod29ybGQsIHgsIFNFQV9MRVZFTCAtIDEsIHopICE9PSBNQVQuV0FURVIpIHJldHVybiAwO1xuICByZXR1cm4gU0VBX0xFVkVMIC0gc3VyZmFjZTtcbn1cblxuLyoqIFRydWUgd2hlbiBgaGVpZ2h0YCBhaXIgY2VsbHMgYWJvdmUgdGhlIHN1cmZhY2UgYXJlIGZyZWUgb2Ygc29saWQgb3Igd2F0ZXIuICovXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJhbmNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaGVpZ2h0OyBpKyspIHtcbiAgICBpZiAoZ2V0Vm94ZWwod29ybGQsIHgsIHN1cmZhY2UgKyBpLCB6KSAhPT0gTUFULkFJUikgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29sdW1uQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFRlcnJhaW5Db2x1bW4ge1xuICBjb25zdCBjeCA9IE1hdGguZmxvb3IoeCksIGN6ID0gTWF0aC5mbG9vcih6KTtcbiAgY29uc3Qgc3VyZmFjZVkgPSBzdXJmYWNlQXQod29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHRvcE1hdGVyaWFsID0gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCBzb2xpZCA9IHN1cmZhY2VZID4gWV9NSU4gJiYgaXNTb2xpZCh0b3BNYXRlcmlhbCk7XG4gIGNvbnN0IHdhdGVyRGVwdGggPSB3YXRlckRlcHRoQXRDb2x1bW4od29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCAtIDEsIGN6LCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3ggKyAxLCBjeiwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4LCBjeiAtIDEsIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCwgY3ogKyAxLCBzdXJmYWNlWSkpLFxuICApO1xuICBsZXQgY2xlYXJhbmNlID0gMDtcbiAgd2hpbGUgKGNsZWFyYW5jZSA8IENMRUFSQU5DRV9QUk9CRSAmJiBnZXRWb3hlbCh3b3JsZCwgY3gsIHN1cmZhY2VZICsgY2xlYXJhbmNlLCBjeikgPT09IE1BVC5BSVIpIHtcbiAgICBjbGVhcmFuY2UrKztcbiAgfVxuICByZXR1cm4ge1xuICAgIHg6IGN4LCB6OiBjeiwgc3VyZmFjZVksIHRvcFNvbGlkWTogc3VyZmFjZVkgLSAxLCB0b3BNYXRlcmlhbCxcbiAgICBzb2xpZCwgd2F0ZXJEZXB0aCwgdW5kZXJ3YXRlcjogd2F0ZXJEZXB0aCA+IDAsIHNsb3BlLCBjbGVhcmFuY2UsXG4gIH07XG59XG5cbi8vIEVudGl0eSBmb290cHJpbnRzIGFyZSBkZWxpYmVyYXRlbHkgZXhwbGljaXQuIEEgdHJlZSBvY2N1cGllcyBtb3JlIHNpdGUgdGhhblxuLy8gaXRzIHRydW5rOyBhIHBlYmJsZSBvY2N1cGllcyBsZXNzIHRoYW4gYSBib3VsZGVyLiBUaGVzZSBhcmUgc2ltdWxhdGlvblxuLy8gY2xlYXJhbmNlIHJhZGlpLCBub3QgcmVuZGVyIGJvdW5kcy5cbmV4cG9ydCBjb25zdCBPQlNUUlVDVElPTl9SQURJVVM6IFJlY29yZDxBY3RpdmVFbnRpdHlLaW5kLCBudW1iZXI+ID0ge1xuICBzdHlsX3RyZWVfc3BpcmU6IDEuNSxcbiAgc3R5bF90cmVlX3RhYmxlOiAxLjgsXG4gIHN0eWxfdHJlZV9jbHVzdGVyOiAxLjksXG4gIHN0eWxfdHJlZV9ibG9zc29tOiAxLjYsXG4gIHN0eWxfc2hydWI6IDAuNixcbiAgc3R5bF9vcmU6IDAuOSxcbiAgc3R5bF9jYWlybjogMC44LFxuICB3YXlzdG9uZTogMS40LFxuICBtYXJrZXI6IDAuNSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgT2JzdHJ1Y3Rpb24ge1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcmFkaXVzOiBudW1iZXI7XG4gIC8qKiBGb290cHJpbnQgY2VsbHMgb3ZlcmxhcHBlZCBieSB0aGlzIGVudGl0eS4gKi9cbiAgY2VsbHM6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZW50aXR5Q2h1bmtzRm9yUmVjdCh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAvLyBBIHJlY3Qgb3ducyB3aG9sZSB2b3hlbCBjZWxscy4gSW5jbHVkZSBldmVyeSBjaHVuayB3aG9zZSByb290IGNvdWxkIG92ZXJsYXBcbiAgLy8gdGhvc2UgY2VsbHMsIHdpdGhvdXQgc2Nhbm5pbmcgdGhlIGVudGlyZSAyMDQ4IG0gd29ybGQuXG4gIGNvbnN0IHJhZGl1cyA9IE1hdGgubWF4KC4uLk9iamVjdC52YWx1ZXMoT0JTVFJVQ1RJT05fUkFESVVTKSwgMS41KTtcbiAgY29uc3QgbWluQ2VsbFggPSBNYXRoLmZsb29yKHIueDAgKyAwLjUgLSByYWRpdXMpO1xuICBjb25zdCBtYXhDZWxsWCA9IE1hdGguY2VpbChyLngxICsgMC41ICsgcmFkaXVzKSAtIDE7XG4gIGNvbnN0IG1pbkNlbGxaID0gTWF0aC5mbG9vcihyLnowICsgMC41IC0gcmFkaXVzKTtcbiAgY29uc3QgbWF4Q2VsbFogPSBNYXRoLmNlaWwoci56MSArIDAuNSArIHJhZGl1cykgLSAxO1xuICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjeDAgPSBNYXRoLm1heCgwLCB3b3JsZFRvQ2h1bmtYKG1pbkNlbGxYKSksIGN4MSA9IHdvcmxkVG9DaHVua1gobWF4Q2VsbFgpO1xuICBjb25zdCBjejAgPSBNYXRoLm1heCgwLCB3b3JsZFRvQ2h1bmtaKG1pbkNlbGxaKSksIGN6MSA9IHdvcmxkVG9DaHVua1oobWF4Q2VsbFopO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICB9XG4gIHJldHVybiBrZXlzO1xufVxuXG4vKiogRW50aXRpZXMgd2hvc2Ugc2ltdWxhdGlvbiBmb290cHJpbnQgb3ZlcmxhcHMgdGhlIHJlY3QuICovXG5leHBvcnQgZnVuY3Rpb24gb2JzdHJ1Y3Rpb25zSW4od29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0KTogT2JzdHJ1Y3Rpb25bXSB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IG91dDogT2JzdHJ1Y3Rpb25bXSA9IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBlbnRpdHlDaHVua3NGb3JSZWN0KHdvcmxkLCByKSkge1xuICAgIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWlkcykgY29udGludWU7XG4gICAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICAgIGlmIChzZWVuLmhhcyhpZCkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSBjb250aW51ZTtcbiAgICAgIHNlZW4uYWRkKGlkKTtcbiAgICAgIGNvbnN0IHJhZGl1cyA9IGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpXG4gICAgICAgID8gZS5raW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDAuNiA6IGUua2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gMS4xIDogMS41XG4gICAgICAgIDogT0JTVFJVQ1RJT05fUkFESVVTW2Uua2luZCBhcyBBY3RpdmVFbnRpdHlLaW5kXTtcbiAgICAgIGxldCBjZWxscyA9IDA7XG4gICAgICBjb25zdCBleDAgPSBNYXRoLm1heChyLngwLCBNYXRoLmZsb29yKGUueCAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXgxID0gTWF0aC5taW4oci54MSwgTWF0aC5jZWlsKGUueCArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXowID0gTWF0aC5tYXgoci56MCwgTWF0aC5mbG9vcihlLnogLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MSA9IE1hdGgubWluKHIuejEsIE1hdGguY2VpbChlLnogKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGZvciAobGV0IHogPSBlejA7IHogPD0gZXoxOyB6KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IGV4MDsgeCA8PSBleDE7IHgrKykge1xuICAgICAgICAgIGlmIChNYXRoLmh5cG90KGUueCAtICh4ICsgMC41KSwgZS56IC0gKHogKyAwLjUpKSA8PSByYWRpdXMpIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjZWxscyA+IDApIHtcbiAgICAgICAgb3V0LnB1c2goeyBlbnRpdHlJZDogZS5pZCwga2luZDogZS5raW5kLCB4OiBlLngsIHo6IGUueiwgcmFkaXVzLCBjZWxscyB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgb3V0LnNvcnQoKGEsIGIpID0+IChhLmVudGl0eUlkIDwgYi5lbnRpdHlJZCA/IC0xIDogYS5lbnRpdHlJZCA+IGIuZW50aXR5SWQgPyAxIDogMCkpO1xuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFyZWFTdGF0cyB7XG4gIHJlY3Q6IFJlY3Q7XG4gIGNvbHVtbnM6IG51bWJlcjtcbiAgbWluWTogbnVtYmVyO1xuICBtYXhZOiBudW1iZXI7XG4gIG1lYW5ZOiBudW1iZXI7XG4gIHJlbGllZjogbnVtYmVyO1xuICBtYXhTdGVwOiBudW1iZXI7XG4gIHdhdGVyQ29sdW1uczogbnVtYmVyO1xuICBzdG9uZUNvbHVtbnM6IG51bWJlcjtcbiAgbWF0ZXJpYWxzOiBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+O1xuICBvYnN0cnVjdGlvbnM6IE9ic3RydWN0aW9uW107XG4gIG9ic3RydWN0ZWRDb2x1bW5zOiBudW1iZXI7XG4gIC8qKiBDdXQvZmlsbCByZWxhdGl2ZSB0byBmbG9vclkgd2hlbiBzdXBwbGllZCwgb3RoZXJ3aXNlIDAuICovXG4gIGZsb29yWTogbnVtYmVyIHwgbnVsbDtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXBwb3J0U3VtbWFyeSB7XG4gIHRvdGFsOiBudW1iZXI7XG4gIGxldmVsOiBudW1iZXI7XG4gIGN1dDogbnVtYmVyO1xuICBmaWxsOiBudW1iZXI7XG4gIHdhdGVyOiBudW1iZXI7XG4gIC8qKiBGaWxsIGRlZXBlciB0aGFuIDggbTsgYSB2YWxpZGF0b3IgbWF5IHJlamVjdCB0aGVzZSBhcyB1bnN1cHBvcnRlZC4gKi9cbiAgZGVlcEZpbGw6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGb290cHJpbnRRdWVyeSB7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBzdGF0czogQXJlYVN0YXRzO1xuICBzdXBwb3J0OiBTdXBwb3J0U3VtbWFyeTtcbiAgb2JzdHJ1Y3Rpb25zOiBPYnN0cnVjdGlvbltdO1xuICAvKiogQ2VsbHMgaW4gdGhlIGJ1aWxkaW5nIHZvbHVtZSBhYm92ZSB0aGUgcHJlcGFyZWQgZmxvb3IgdGhhdCBhcmUgbm90IGFpci4gKi9cbiAgb3ZlcmhhbmdDZWxsczogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyBtYXRlcmlhbDogTWF0SWQgfT47XG59XG5cbi8qKlxuICogQ2FjaGVkIHF1ZXJ5IGNvbnRleHQuIENhY2hlcyBhcmUga2V5ZWQgb24gd29ybGQucmV2aXNpb246IGEgdm94ZWwgb3IgZW50aXR5XG4gKiBlZGl0IGludmFsaWRhdGVzIHRoZW0sIHdoaWxlIG1lc2gvbmF2IHJlYnVpbGRzIGRvIG5vdC4gVXNlIG9uZSBjb250ZXh0IGZvciBhXG4gKiBzaXRlIHNlYXJjaCBvciBhIGZvb3RwcmludCBldmFsdWF0aW9uLCB0aGVuIGRpc2NhcmQgaXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXJyYWluUXVlcnkge1xuICBwcml2YXRlIGNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFRlcnJhaW5Db2x1bW4+KCk7XG4gIHByaXZhdGUgb2JzdHJ1Y3Rpb25DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBPYnN0cnVjdGlvbltdPigpO1xuICBwcml2YXRlIHJldmlzaW9uOiBudW1iZXI7XG5cbiAgY29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHdvcmxkOiBXb3JsZCkge1xuICAgIHRoaXMucmV2aXNpb24gPSB3b3JsZC5yZXZpc2lvbjtcbiAgfVxuXG4gIHByaXZhdGUgc3luYygpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5yZXZpc2lvbiAhPT0gdGhpcy53b3JsZC5yZXZpc2lvbikge1xuICAgICAgdGhpcy5jYWNoZS5jbGVhcigpO1xuICAgICAgdGhpcy5vYnN0cnVjdGlvbkNhY2hlLmNsZWFyKCk7XG4gICAgICB0aGlzLnJldmlzaW9uID0gdGhpcy53b3JsZC5yZXZpc2lvbjtcbiAgICB9XG4gIH1cblxuICAvKiogQ2FjaGVkIGVudGl0eSBvYnN0cnVjdGlvbnMgZm9yIG9uZSBmb290cHJpbnQuICovXG4gIG9ic3RydWN0aW9uc0ZvcihyZWN0OiBSZWN0KTogT2JzdHJ1Y3Rpb25bXSB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgY29uc3Qga2V5ID0gYCR7ci54MH0sJHtyLnowfSwke3IueDF9LCR7ci56MX1gO1xuICAgIGxldCBsaXN0ID0gdGhpcy5vYnN0cnVjdGlvbkNhY2hlLmdldChrZXkpO1xuICAgIGlmICghbGlzdCkge1xuICAgICAgbGlzdCA9IG9ic3RydWN0aW9uc0luKHRoaXMud29ybGQsIHIpO1xuICAgICAgdGhpcy5vYnN0cnVjdGlvbkNhY2hlLnNldChrZXksIGxpc3QpO1xuICAgIH1cbiAgICByZXR1cm4gbGlzdDtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFRlcnJhaW5Db2x1bW4ge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICAgIGNvbnN0IGtleSA9IGAke2N4fSwke2N6fWA7XG4gICAgbGV0IGNvbCA9IHRoaXMuY2FjaGUuZ2V0KGtleSk7XG4gICAgaWYgKCFjb2wpIHtcbiAgICAgIGNvbCA9IGNvbHVtbkF0KHRoaXMud29ybGQsIGN4LCBjeik7XG4gICAgICB0aGlzLmNhY2hlLnNldChrZXksIGNvbCk7XG4gICAgfVxuICAgIHJldHVybiBjb2w7XG4gIH1cblxuICBhcmVhKHJlY3Q6IFJlY3QsIGZsb29yWT86IG51bWJlcik6IEFyZWFTdGF0cyB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgbGV0IG1pblkgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gICAgbGV0IG1heFkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gICAgbGV0IHN1bSA9IDA7XG4gICAgbGV0IG1heFN0ZXAgPSAwO1xuICAgIGxldCB3YXRlckNvbHVtbnMgPSAwO1xuICAgIGxldCBzdG9uZUNvbHVtbnMgPSAwO1xuICAgIGxldCBjdXRWb2x1bWUgPSAwO1xuICAgIGxldCBmaWxsVm9sdW1lID0gMDtcbiAgICBsZXQgbWF4Q3V0ID0gMDtcbiAgICBsZXQgbWF4RmlsbCA9IDA7XG4gICAgY29uc3QgbWF0ZXJpYWxzOiBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+ID0ge307XG5cbiAgICBmb3IgKGxldCB6ID0gci56MDsgeiA8PSByLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByLngwOyB4IDw9IHIueDE7IHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSB0aGlzLmNvbHVtbih4LCB6KTtcbiAgICAgICAgbWluWSA9IE1hdGgubWluKG1pblksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIG1heFkgPSBNYXRoLm1heChtYXhZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBzdW0gKz0gY29sLnN1cmZhY2VZO1xuICAgICAgICBtYXhTdGVwID0gTWF0aC5tYXgobWF4U3RlcCwgY29sLnNsb3BlKTtcbiAgICAgICAgaWYgKGNvbC53YXRlckRlcHRoID4gMCkgd2F0ZXJDb2x1bW5zKys7XG4gICAgICAgIGlmIChjb2wudG9wTWF0ZXJpYWwgPT09IE1BVC5TVE9ORSkgc3RvbmVDb2x1bW5zKys7XG4gICAgICAgIG1hdGVyaWFsc1tjb2wudG9wTWF0ZXJpYWxdID0gKG1hdGVyaWFsc1tjb2wudG9wTWF0ZXJpYWxdID8/IDApICsgMTtcbiAgICAgICAgaWYgKGZsb29yWSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgY29uc3QgZHkgPSBjb2wuc3VyZmFjZVkgLSBmbG9vclk7XG4gICAgICAgICAgaWYgKGR5ID4gMCkge1xuICAgICAgICAgICAgY3V0Vm9sdW1lICs9IGR5O1xuICAgICAgICAgICAgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkeSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChkeSA8IDApIHtcbiAgICAgICAgICAgIGZpbGxWb2x1bWUgKz0gLWR5O1xuICAgICAgICAgICAgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIC1keSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gdGhpcy5vYnN0cnVjdGlvbnNGb3Iocik7XG4gICAgY29uc3Qgb2JzdHJ1Y3RlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgbyBvZiBvYnN0cnVjdGlvbnMpIHtcbiAgICAgIGNvbnN0IHJhZGl1cyA9IG8ucmFkaXVzO1xuICAgICAgY29uc3QgZXgwID0gTWF0aC5tYXgoci54MCwgTWF0aC5mbG9vcihvLnggLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV4MSA9IE1hdGgubWluKHIueDEsIE1hdGguY2VpbChvLnggKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MCA9IE1hdGgubWF4KHIuejAsIE1hdGguZmxvb3Ioby56IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejEgPSBNYXRoLm1pbihyLnoxLCBNYXRoLmNlaWwoby56ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBmb3IgKGxldCB6ID0gZXowOyB6IDw9IGV6MTsgeisrKSB7XG4gICAgICAgIGZvciAobGV0IHggPSBleDA7IHggPD0gZXgxOyB4KyspIHtcbiAgICAgICAgICBpZiAoTWF0aC5oeXBvdChvLnggLSAoeCArIDAuNSksIG8ueiAtICh6ICsgMC41KSkgPD0gcmFkaXVzKSBvYnN0cnVjdGVkLmFkZChgJHt4fSwke3p9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBjb2x1bW5zID0gKHIueDEgLSByLngwICsgMSkgKiAoci56MSAtIHIuejAgKyAxKTtcbiAgICByZXR1cm4ge1xuICAgICAgcmVjdDogcixcbiAgICAgIGNvbHVtbnMsXG4gICAgICBtaW5ZLCBtYXhZLFxuICAgICAgbWVhblk6IE1hdGgucm91bmQoKHN1bSAvIGNvbHVtbnMpICogMTAwMCkgLyAxMDAwLFxuICAgICAgcmVsaWVmOiBtYXhZIC0gbWluWSxcbiAgICAgIG1heFN0ZXAsXG4gICAgICB3YXRlckNvbHVtbnMsXG4gICAgICBzdG9uZUNvbHVtbnMsXG4gICAgICBtYXRlcmlhbHMsXG4gICAgICBvYnN0cnVjdGlvbnMsXG4gICAgICBvYnN0cnVjdGVkQ29sdW1uczogb2JzdHJ1Y3RlZC5zaXplLFxuICAgICAgZmxvb3JZOiBmbG9vclkgPz8gbnVsbCxcbiAgICAgIGN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQsXG4gICAgICBtYXhGaWxsLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogRXZhbHVhdGUgYSBjb21wbGV0ZSBidWlsZGluZyBmb290cHJpbnQuIGBmbG9vcllgIGlzIHRoZSBwcmVwYXJlZCB3YWxraW5nXG4gICAqIGZsb29yOiB0ZXJyYWluIGFib3ZlIGl0IGlzIGN1dCwgdGVycmFpbiBiZWxvdyBpdCBpcyBmaWxsZWQuIFRoZSByZXN1bHQgaXNcbiAgICogcmF3IHNpdGUgZGF0YTsgY29uc3RydWN0aW9uIHJ1bGVzIGxpdmUgaW4gY29uc3RydWN0aW9uLnRzLlxuICAgKi9cbiAgZm9vdHByaW50KHJlY3Q6IFJlY3QsIGZsb29yWTogbnVtYmVyKTogRm9vdHByaW50UXVlcnkge1xuICAgIGNvbnN0IHN0YXRzID0gdGhpcy5hcmVhKHJlY3QsIGZsb29yWSk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgY29uc3Qgc3VwcG9ydDogU3VwcG9ydFN1bW1hcnkgPSB7XG4gICAgICB0b3RhbDogc3RhdHMuY29sdW1ucywgbGV2ZWw6IDAsIGN1dDogMCwgZmlsbDogMCwgd2F0ZXI6IDAsIGRlZXBGaWxsOiAwLFxuICAgICAgbWF4Q3V0OiAwLCBtYXhGaWxsOiAwLCBjdXRWb2x1bWU6IDAsIGZpbGxWb2x1bWU6IDAsXG4gICAgfTtcbiAgICBjb25zdCBvdmVyaGFuZ0NlbGxzOiBGb290cHJpbnRRdWVyeVsnb3ZlcmhhbmdDZWxscyddID0gW107XG5cbiAgICBmb3IgKGxldCB6ID0gci56MDsgeiA8PSByLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByLngwOyB4IDw9IHIueDE7IHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSB0aGlzLmNvbHVtbih4LCB6KTtcbiAgICAgICAgY29uc3QgZHkgPSBjb2wuc3VyZmFjZVkgLSBmbG9vclk7XG4gICAgICAgIGlmIChkeSA+IDApIHtcbiAgICAgICAgICBzdXBwb3J0LmN1dCsrO1xuICAgICAgICAgIHN1cHBvcnQuY3V0Vm9sdW1lICs9IGR5O1xuICAgICAgICAgIHN1cHBvcnQubWF4Q3V0ID0gTWF0aC5tYXgoc3VwcG9ydC5tYXhDdXQsIGR5KTtcbiAgICAgICAgfSBlbHNlIGlmIChkeSA8IDApIHtcbiAgICAgICAgICBzdXBwb3J0LmZpbGwrKztcbiAgICAgICAgICBzdXBwb3J0LmZpbGxWb2x1bWUgKz0gLWR5O1xuICAgICAgICAgIHN1cHBvcnQubWF4RmlsbCA9IE1hdGgubWF4KHN1cHBvcnQubWF4RmlsbCwgLWR5KTtcbiAgICAgICAgICBpZiAoLWR5ID4gOCkgc3VwcG9ydC5kZWVwRmlsbCsrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN1cHBvcnQubGV2ZWwrKztcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29sLndhdGVyRGVwdGggPiAwKSBzdXBwb3J0LndhdGVyKys7XG5cbiAgICAgICAgLy8gQW4gb3ZlcmhhbmcgaXMgdGVycmFpbiBhYm92ZSB0aGUgZmxvb3IgdGhhdCBzdXJ2aXZlcyB0aGUgY3V0IHBsYW5lLlxuICAgICAgICAvLyBGb3IgYSBjb2x1bW4gYmVsb3cgdGhlIGZsb29yLCBpdHMgc29saWQgYm9keSBpcyBmaWxsLCBub3Qgb3ZlcmhhbmcuXG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gTWF0aC5tYXgoZmxvb3JZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPCBzdGFydCArIDQ7IHkrKykge1xuICAgICAgICAgIGNvbnN0IG0gPSBnZXRWb3hlbCh0aGlzLndvcmxkLCB4LCB5LCB6KSBhcyBNYXRJZDtcbiAgICAgICAgICBpZiAobSAhPT0gTUFULkFJUikgb3ZlcmhhbmdDZWxscy5wdXNoKHsgeCwgeSwgeiwgbWF0ZXJpYWw6IG0gfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyByZWN0OiByLCBmbG9vclksIHN0YXRzLCBzdXBwb3J0LCBvYnN0cnVjdGlvbnM6IHN0YXRzLm9ic3RydWN0aW9ucywgb3ZlcmhhbmdDZWxscyB9O1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gbW92ZW1lbnQgY29udHJhY3QgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXYWxrUGFyYW1zIHtcbiAgbWF4U3RlcFVwOiBudW1iZXI7XG4gIG1heFN0ZXBEb3duOiBudW1iZXI7XG4gIG1heFdhdGVyRGVwdGg6IG51bWJlcjtcbiAgLyoqIE1heGltdW0gYWRqYWNlbnQgc3VyZmFjZSBzdGVwOyAxLjAgaXMgYSA0NSBkZWdyZWUgdm94ZWwgcmlzZXIuICovXG4gIG1heFNsb3BlOiBudW1iZXI7XG4gIGNsZWFyYW5jZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9XQUxLOiBXYWxrUGFyYW1zID0ge1xuICBtYXhTdGVwVXA6IDEuMCxcbiAgbWF4U3RlcERvd246IDEuNSxcbiAgbWF4V2F0ZXJEZXB0aDogMC40LFxuICBtYXhTbG9wZTogMS4wLFxuICBjbGVhcmFuY2U6IDIuMCxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2Fsa1Jlc3VsdCB7XG4gIG9rOiBib29sZWFuO1xuICByZWFzb246ICdvaycgfCAnbm90X2FkamFjZW50JyB8ICdzdGVwX3VwJyB8ICdmYWxsJyB8ICd3YXRlcicgfCAnc2xvcGUnIHwgJ2NsZWFyYW5jZSc7XG4gIHN0ZXA6IG51bWJlcjtcbiAgd2F0ZXJEZXB0aDogbnVtYmVyO1xufVxuXG4vKiogRXZhbHVhdGUgb25lIGdyaWQgc3RlcC4gUGF0aHMgYXJlIHZhbGlkYXRlZCB3aXRoIHRoZSBzYW1lIGNvbnRyYWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhbGtTdGVwKFxuICB3b3JsZDogV29ybGQsIGZyb21YOiBudW1iZXIsIGZyb21aOiBudW1iZXIsIHRvWDogbnVtYmVyLCB0b1o6IG51bWJlcixcbiAgcGFyYW1zOiBXYWxrUGFyYW1zID0gREVGQVVMVF9XQUxLLFxuKTogV2Fsa1Jlc3VsdCB7XG4gIGNvbnN0IGR4ID0gTWF0aC5hYnMoTWF0aC5mbG9vcih0b1gpIC0gTWF0aC5mbG9vcihmcm9tWCkpO1xuICBjb25zdCBkeiA9IE1hdGguYWJzKE1hdGguZmxvb3IodG9aKSAtIE1hdGguZmxvb3IoZnJvbVopKTtcbiAgaWYgKGR4ICsgZHogIT09IDEpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ25vdF9hZGphY2VudCcsIHN0ZXA6IDAsIHdhdGVyRGVwdGg6IDAgfTtcbiAgfVxuICBjb25zdCBmcm9tID0gY29sdW1uQXQod29ybGQsIGZyb21YLCBmcm9tWik7XG4gIGNvbnN0IHRvID0gY29sdW1uQXQod29ybGQsIHRvWCwgdG9aKTtcbiAgY29uc3Qgc3RlcCA9IHRvLnN1cmZhY2VZIC0gZnJvbS5zdXJmYWNlWTtcbiAgaWYgKHN0ZXAgPiBwYXJhbXMubWF4U3RlcFVwKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3N0ZXBfdXAnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICgtc3RlcCA+IHBhcmFtcy5tYXhTdGVwRG93bikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdmYWxsJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAodG8ud2F0ZXJEZXB0aCA+IHBhcmFtcy5tYXhXYXRlckRlcHRoKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3dhdGVyJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAodG8uc2xvcGUgPiBwYXJhbXMubWF4U2xvcGUpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc2xvcGUnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICghY2xlYXJhbmNlQXQod29ybGQsIHRvWCwgdG9aLCBwYXJhbXMuY2xlYXJhbmNlKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnY2xlYXJhbmNlJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICB9XG4gIHJldHVybiB7IG9rOiB0cnVlLCByZWFzb246ICdvaycsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbn1cblxuLyoqIEVmZmVjdGl2ZSBncmFkZSBvZiBhIHN0cmFpZ2h0IHBhdGggc2VnbWVudCwgdXNlZCBieSBwYXRoIHZhbGlkYXRpb24uICovXG5leHBvcnQgZnVuY3Rpb24gZWZmZWN0aXZlR3JhZGUod29ybGQ6IFdvcmxkLCB4MDogbnVtYmVyLCB6MDogbnVtYmVyLCB4MTogbnVtYmVyLCB6MTogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgYSA9IGNvbHVtbkF0KHdvcmxkLCB4MCwgejApO1xuICBjb25zdCBiID0gY29sdW1uQXQod29ybGQsIHgxLCB6MSk7XG4gIGNvbnN0IHJ1biA9IE1hdGguaHlwb3QoeDEgLSB4MCwgejEgLSB6MCk7XG4gIGlmIChydW4gPT09IDApIHJldHVybiBNYXRoLmFicyhiLnN1cmZhY2VZIC0gYS5zdXJmYWNlWSk7XG4gIHJldHVybiBNYXRoLmFicyhiLnN1cmZhY2VZIC0gYS5zdXJmYWNlWSkgLyBydW47XG59XG4iLCAiLy8gTTAwMiBzaXRlIHZhbGlkYXRpb24sIGNhbmRpZGF0ZSBzZWFyY2ggYW5kIHByZXZpZXcgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbi5cbi8vXG4vLyBUaGlzIGlzIHRoZSBzaGFyZWQgZ2F0ZSBmb3IgdGhlIHBsYXllciBhbmQgdGhlIEFJIGFnZW50LiBOZWl0aGVyIG1heSBwbGFjZSBhXG4vLyBzdHJ1Y3R1cmUgYnkgYW55IG90aGVyIHBhdGg6IGJvdGggc3VibWl0IGEgU2l0ZVByb3Bvc2FsLCBib3RoIHJlY2VpdmUgdGhlXG4vLyBzYW1lIFNpdGVWYWxpZGF0aW9uLCBhbmQgYm90aCBtdXN0IHBhc3MgdGhlIEF1dGhvcml6ZXIgYmVmb3JlIGV4ZWN1dGlvbi5cbi8vXG4vLyBUaGUgdmFsaWRhdG9yIGRlc2NyaWJlcyB0aGUgc2l0ZSBhcyBpdCBpcy4gSXQgZG9lcyBub3QgZWRpdCB2b3hlbHMsIHJlbW92ZVxuLy8gZW50aXRpZXMgb3Igc3BlbmQgcmVzb3VyY2VzLiBQcmVwYXJhdGlvbiBpcyBhIHNlcGFyYXRlLCBhdXRob3JpemVkIHN0ZXAuXG5pbXBvcnQgeyBXb3JsZCwgSEFMRiwgWV9NSU4sIFlfTUFYLCBzdXJmYWNlQXQgfSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBGb290cHJpbnRRdWVyeSwgVGVycmFpblF1ZXJ5LCBBcmVhU3RhdHMsXG4gIG5vcm1hbGl6ZVJlY3QsIGV4cGFuZFJlY3QsIHJlY3RDb2x1bW5zLCBlZmZlY3RpdmVHcmFkZSwgd2Fsa1N0ZXAsIFdhbGtQYXJhbXMsXG4gIERFRkFVTFRfV0FMSywgY29sdW1uQXQsXG59IGZyb20gJy4vdGVycmFpbic7XG5cbmV4cG9ydCB0eXBlIFNpdGVTdGF0ZSA9ICd2YWxpZCcgfCAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicgfCAnaW52YWxpZCc7XG5cbmV4cG9ydCB0eXBlIFZhbGlkYXRpb25Db2RlID1cbiAgfCAnb3V0X29mX2JvdW5kcydcbiAgfCAnZm9vdHByaW50X21pc21hdGNoJ1xuICB8ICdzbG9wZV9leGNlZWRlZCdcbiAgfCAnc3RlcF9leGNlZWRlZCdcbiAgfCAnY3V0X2V4Y2VlZGVkJ1xuICB8ICdmaWxsX2V4Y2VlZGVkJ1xuICB8ICdjdXRfdm9sdW1lX2V4Y2VlZGVkJ1xuICB8ICdmaWxsX3ZvbHVtZV9leGNlZWRlZCdcbiAgfCAnZm9vdHByaW50X29ic3RydWN0ZWQnXG4gIHwgJ3dhdGVyJ1xuICB8ICdvdmVyaGFuZydcbiAgfCAnbmVlZHNfZ3JhZGluZydcbiAgfCAnbmVlZHNfY2xlYXJpbmcnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZhbGlkYXRpb25SZWFzb24ge1xuICBjb2RlOiBWYWxpZGF0aW9uQ29kZTtcbiAgc2V2ZXJpdHk6ICdlcnJvcicgfCAncHJlcGFyYXRpb24nO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIHZhbHVlPzogbnVtYmVyO1xuICBsaW1pdD86IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgRm91bmRhdGlvblR5cGUgPSAnZ3JhZGVkX3BhZCcgfCAnc3RlcHBlZF9wbGludGgnIHwgJ2RlY2snO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJ1aWxkaW5nUnVsZXMge1xuICBpZDogc3RyaW5nO1xuICB3aWR0aDogbnVtYmVyO1xuICBkZXB0aDogbnVtYmVyO1xuICB3YWxsSGVpZ2h0OiBudW1iZXI7XG4gIGNsZWFyYW5jZTogbnVtYmVyO1xuICAvKiogUmVsaWVmIGF0IG9yIGJlbG93IHRoaXMgbmVlZHMgbm8gZ3JhZGluZyB0byBiZSBjYWxsZWQgdmFsaWQuICovXG4gIG1heFJlbGllZk5vUHJlcDogbnVtYmVyO1xuICAvKiogUmVsaWVmIGFib3ZlIHRoaXMgY2Fubm90IGJlIHByZXBhcmVkIGJ5IHRoaXMgYnVpbGRpbmcgdHlwZS4gKi9cbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IG51bWJlcjtcbiAgbWF4U3RlcDogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBtYXhDdXRWb2x1bWU6IG51bWJlcjtcbiAgbWF4RmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhPYnN0cnVjdGlvbnM6IG51bWJlcjtcbiAgcmVxdWlyZXNEcnk6IGJvb2xlYW47XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25UeXBlO1xufVxuXG5leHBvcnQgY29uc3QgSE9VU0VfUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAnaG91c2UtOHg2JyxcbiAgd2lkdGg6IDgsXG4gIGRlcHRoOiA2LFxuICB3YWxsSGVpZ2h0OiAzLFxuICBjbGVhcmFuY2U6IDMsXG4gIG1heFJlbGllZk5vUHJlcDogMS4yLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNC4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDIsXG4gIG1heEZpbGw6IDIsXG4gIG1heEN1dFZvbHVtZTogNDgsXG4gIG1heEZpbGxWb2x1bWU6IDQ4LFxuICBtYXhPYnN0cnVjdGlvbnM6IDAsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnZ3JhZGVkX3BhZCcsXG59O1xuXG5leHBvcnQgY29uc3QgRkFSTV9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdmYXJtLTEyeDgnLFxuICB3aWR0aDogMTIsXG4gIGRlcHRoOiA4LFxuICB3YWxsSGVpZ2h0OiAwLFxuICBjbGVhcmFuY2U6IDEsXG4gIG1heFJlbGllZk5vUHJlcDogMS4yLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNi4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDIsXG4gIG1heEZpbGw6IDIsXG4gIG1heEN1dFZvbHVtZTogOTYsXG4gIG1heEZpbGxWb2x1bWU6IDk2LFxuICBtYXhPYnN0cnVjdGlvbnM6IDQsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnc3RlcHBlZF9wbGludGgnLFxufTtcblxuZXhwb3J0IGNvbnN0IFBBVEhfUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAncGF0aC05eDMnLFxuICB3aWR0aDogOSxcbiAgZGVwdGg6IDMsXG4gIHdhbGxIZWlnaHQ6IDAsXG4gIGNsZWFyYW5jZTogMSxcbiAgbWF4UmVsaWVmTm9QcmVwOiAyLjAsXG4gIG1heFJlbGllZlByZXBhcmVkOiA0LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMSxcbiAgbWF4RmlsbDogMSxcbiAgbWF4Q3V0Vm9sdW1lOiAzMixcbiAgbWF4RmlsbFZvbHVtZTogMzIsXG4gIG1heE9ic3RydWN0aW9uczogMixcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdkZWNrJyxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVByb3Bvc2FsIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblN1bW1hcnkge1xuICBuZWVkc0dyYWRpbmc6IGJvb2xlYW47XG4gIG5lZWRzQ2xlYXJpbmc6IGJvb2xlYW47XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uSWRzOiBzdHJpbmdbXTtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblR5cGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVZhbGlkYXRpb24ge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgc3RhdGU6IFNpdGVTdGF0ZTtcbiAgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdO1xuICBxdWVyeTogRm9vdHByaW50UXVlcnk7XG4gIHByZXBhcmF0aW9uOiBQcmVwYXJhdGlvblN1bW1hcnk7XG59XG5cbmZ1bmN0aW9uIGVycm9yKGNvZGU6IFZhbGlkYXRpb25Db2RlLCBtZXNzYWdlOiBzdHJpbmcsIHZhbHVlPzogbnVtYmVyLCBsaW1pdD86IG51bWJlcik6IFZhbGlkYXRpb25SZWFzb24ge1xuICByZXR1cm4geyBjb2RlLCBzZXZlcml0eTogJ2Vycm9yJywgbWVzc2FnZSwgdmFsdWUsIGxpbWl0IH07XG59XG5cbmZ1bmN0aW9uIHByZXAoY29kZTogVmFsaWRhdGlvbkNvZGUsIG1lc3NhZ2U6IHN0cmluZywgdmFsdWU/OiBudW1iZXIsIGxpbWl0PzogbnVtYmVyKTogVmFsaWRhdGlvblJlYXNvbiB7XG4gIHJldHVybiB7IGNvZGUsIHNldmVyaXR5OiAncHJlcGFyYXRpb24nLCBtZXNzYWdlLCB2YWx1ZSwgbGltaXQgfTtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZSBhIHByb3Bvc2VkIHNpdGUgYWdhaW5zdCBpdHMgYnVpbGRpbmcgcnVsZXMuIFB1cmU6IG5vIHZveGVscyxcbiAqIGVudGl0aWVzIG9yIHJlc291cmNlcyBjaGFuZ2UuIGBxdWVyeWAgbWF5IGJlIHN1cHBsaWVkIGJ5IGEgc2VhcmNoIHRvIHJldXNlXG4gKiB0aGUgY2FjaGVkIGNvbHVtbnMsIGFuZCBgZm9vdHByaW50YCBtYXkgYmUgc3VwcGxpZWQgd2hlbiB0aGUgY2FsbGVyIGFscmVhZHlcbiAqIGV2YWx1YXRlZCB0aGUgc2FtZSByZWN0L2Zsb29yIHBhaXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVNpdGUoXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKSxcbiAgZm9vdHByaW50PzogRm9vdHByaW50UXVlcnksXG4pOiBTaXRlVmFsaWRhdGlvbiB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCBydWxlcyA9IHByb3Bvc2FsLnJ1bGVzO1xuICBjb25zdCByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW10gPSBbXTtcbiAgY29uc3QgZnAgPSBmb290cHJpbnQgPz8gcXVlcnkuZm9vdHByaW50KHJlY3QsIHByb3Bvc2FsLmZsb29yWSk7XG4gIGNvbnN0IHN0YXRzID0gZnAuc3RhdHM7XG5cbiAgaWYgKHJlY3QueDAgPCAtSEFMRiB8fCByZWN0LnowIDwgLUhBTEYgfHwgcmVjdC54MSA+PSBIQUxGIHx8IHJlY3QuejEgPj0gSEFMRikge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcignb3V0X29mX2JvdW5kcycsIGBmb290cHJpbnQgJHtyZWN0LngwfSwke3JlY3QuejB9Li4ke3JlY3QueDF9LCR7cmVjdC56MX0gaXMgb3V0c2lkZSB0aGUgd29ybGRgKSk7XG4gIH1cbiAgaWYgKHJlY3QueDEgLSByZWN0LngwICsgMSAhPT0gcnVsZXMud2lkdGggfHwgcmVjdC56MSAtIHJlY3QuejAgKyAxICE9PSBydWxlcy5kZXB0aCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmb290cHJpbnRfbWlzbWF0Y2gnLFxuICAgICAgYGZvb3RwcmludCBpcyAke3JlY3QueDEgLSByZWN0LngwICsgMX0geCAke3JlY3QuejEgLSByZWN0LnowICsgMX0gbSwgJHtydWxlcy53aWR0aH0geCAke3J1bGVzLmRlcHRofSBtIHJlcXVpcmVkYCxcbiAgICApKTtcbiAgfVxuXG4gIGlmIChzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdzbG9wZV9leGNlZWRlZCcsXG4gICAgICBgcmVsaWVmICR7c3RhdHMucmVsaWVmfSBtIGV4Y2VlZHMgdGhlICR7cnVsZXMubWF4UmVsaWVmUHJlcGFyZWR9IG0gcHJlcGFyZWQgbGltaXRgLFxuICAgICAgc3RhdHMucmVsaWVmLCBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4U3RlcCA+IHJ1bGVzLm1heFN0ZXApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnc3RlcF9leGNlZWRlZCcsXG4gICAgICBgc3VyZmFjZSBzdGVwICR7c3RhdHMubWF4U3RlcH0gbSBleGNlZWRzICR7cnVsZXMubWF4U3RlcH0gbWAsXG4gICAgICBzdGF0cy5tYXhTdGVwLCBydWxlcy5tYXhTdGVwLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhDdXQgPiBydWxlcy5tYXhDdXQpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnY3V0X2V4Y2VlZGVkJyxcbiAgICAgIGBjdXQgJHtzdGF0cy5tYXhDdXR9IG0gZXhjZWVkcyAke3J1bGVzLm1heEN1dH0gbWAsXG4gICAgICBzdGF0cy5tYXhDdXQsIHJ1bGVzLm1heEN1dCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4RmlsbCA+IHJ1bGVzLm1heEZpbGwpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZmlsbF9leGNlZWRlZCcsXG4gICAgICBgZmlsbCAke3N0YXRzLm1heEZpbGx9IG0gZXhjZWVkcyAke3J1bGVzLm1heEZpbGx9IG1gLFxuICAgICAgc3RhdHMubWF4RmlsbCwgcnVsZXMubWF4RmlsbCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMuY3V0Vm9sdW1lID4gcnVsZXMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2N1dF92b2x1bWVfZXhjZWVkZWQnLFxuICAgICAgYGN1dCB2b2x1bWUgJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEN1dFZvbHVtZX0gbVx1MDBCM2AsXG4gICAgICBzdGF0cy5jdXRWb2x1bWUsIHJ1bGVzLm1heEN1dFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMuZmlsbFZvbHVtZSA+IHJ1bGVzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZmlsbF92b2x1bWVfZXhjZWVkZWQnLFxuICAgICAgYGZpbGwgdm9sdW1lICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4RmlsbFZvbHVtZX0gbVx1MDBCM2AsXG4gICAgICBzdGF0cy5maWxsVm9sdW1lLCBydWxlcy5tYXhGaWxsVm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChydWxlcy5yZXF1aXJlc0RyeSAmJiBzdGF0cy53YXRlckNvbHVtbnMgPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3dhdGVyJyxcbiAgICAgIGAke3N0YXRzLndhdGVyQ29sdW1uc30gZm9vdHByaW50IGNvbHVtbnMgYXJlIHVuZGVyd2F0ZXJgLFxuICAgICAgc3RhdHMud2F0ZXJDb2x1bW5zLCAwLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoID4gcnVsZXMubWF4T2JzdHJ1Y3Rpb25zKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2Zvb3RwcmludF9vYnN0cnVjdGVkJyxcbiAgICAgIGAke3N0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyBleGNlZWQgdGhlICR7cnVsZXMubWF4T2JzdHJ1Y3Rpb25zfSBhbGxvd2FuY2VgLFxuICAgICAgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCwgcnVsZXMubWF4T2JzdHJ1Y3Rpb25zLFxuICAgICkpO1xuICB9XG4gIGlmIChmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnb3ZlcmhhbmcnLFxuICAgICAgYCR7ZnAub3ZlcmhhbmdDZWxscy5sZW5ndGh9IGNlbGxzIGFib3ZlIHRoZSBmbG9vciBhcmUgYmxvY2tlZGAsXG4gICAgICBmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aCwgMCxcbiAgICApKTtcbiAgfVxuXG4gIGNvbnN0IG5lZWRzR3JhZGluZyA9IHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZk5vUHJlcFxuICAgIHx8IHN0YXRzLmN1dFZvbHVtZSA+IDAgfHwgc3RhdHMuZmlsbFZvbHVtZSA+IDA7XG4gIGNvbnN0IG5lZWRzQ2xlYXJpbmcgPSBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoID4gMFxuICAgICYmIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPD0gcnVsZXMubWF4T2JzdHJ1Y3Rpb25zO1xuXG4gIGlmIChuZWVkc0dyYWRpbmcpIHtcbiAgICByZWFzb25zLnB1c2gocHJlcChcbiAgICAgICduZWVkc19ncmFkaW5nJyxcbiAgICAgIGBncmFkaW5nIHJlcXVpcmVkOiAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBjdXQsICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBmaWxsYCxcbiAgICAgIHN0YXRzLmN1dFZvbHVtZSArIHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKG5lZWRzQ2xlYXJpbmcpIHtcbiAgICByZWFzb25zLnB1c2gocHJlcChcbiAgICAgICduZWVkc19jbGVhcmluZycsXG4gICAgICBgJHtzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgdG8gY2xlYXJgLFxuICAgICAgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCwgcnVsZXMubWF4T2JzdHJ1Y3Rpb25zLFxuICAgICkpO1xuICB9XG5cbiAgY29uc3QgaGFzRXJyb3IgPSByZWFzb25zLnNvbWUoKHIpID0+IHIuc2V2ZXJpdHkgPT09ICdlcnJvcicpO1xuICBjb25zdCBoYXNQcmVwID0gcmVhc29ucy5zb21lKChyKSA9PiByLnNldmVyaXR5ID09PSAncHJlcGFyYXRpb24nKTtcbiAgY29uc3Qgc3RhdGU6IFNpdGVTdGF0ZSA9IGhhc0Vycm9yID8gJ2ludmFsaWQnIDogaGFzUHJlcCA/ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJyA6ICd2YWxpZCc7XG5cbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICBzdGF0ZSxcbiAgICByZWFzb25zLFxuICAgIHF1ZXJ5OiBmcCxcbiAgICBwcmVwYXJhdGlvbjoge1xuICAgICAgbmVlZHNHcmFkaW5nLFxuICAgICAgbmVlZHNDbGVhcmluZyxcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICAgIG9ic3RydWN0aW9uSWRzOiBzdGF0cy5vYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSxcbiAgICAgIGZvdW5kYXRpb246IHJ1bGVzLmZvdW5kYXRpb24sXG4gICAgfSxcbiAgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBjYW5kaWRhdGUgc2VhcmNoIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU2VhcmNoT3B0aW9ucyB7XG4gIC8qKiBDYW5kaWRhdGUgZ3JpZCBzdGVwIGluIG1ldHJlcy4gRGVmYXVsdCAyLiAqL1xuICBzdGVwPzogbnVtYmVyO1xuICBtYXhSZXN1bHRzPzogbnVtYmVyO1xuICBhbmNob3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIG1heERpc3RhbmNlPzogbnVtYmVyO1xuICAvKiogSGFyZCBjb25zdHJhaW50OiBjYW5kaWRhdGUgY2VudHJlIG11c3QgbGllIHdpdGhpbiB0aGlzIHJhZGl1cyBvZiBhIHBvaW50LiAqL1xuICBuZWFyPzogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgbWF4RGlzdGFuY2U6IG51bWJlciB9O1xuICAvKiogRG8gbm90IHJldHVybiB0d28gY2FuZGlkYXRlcyB3aG9zZSBmb290cHJpbnRzIG92ZXJsYXAuIERlZmF1bHQgdHJ1ZS4gKi9cbiAgZGlzdGluY3Q/OiBib29sZWFuO1xuICAvKiogV2FsbC1jbG9jayBidWRnZXQgZm9yIHRoZSBzY2FuLiBEZWZhdWx0IDEwMCBtcy4gKi9cbiAgYnVkZ2V0TXM/OiBudW1iZXI7XG4gIHdhbGs/OiBXYWxrUGFyYW1zO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVDYW5kaWRhdGUge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHN0YXRlOiAndmFsaWQnIHwgJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nO1xuICB2YWxpZGF0aW9uOiBTaXRlVmFsaWRhdGlvbjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25Db3VudDogbnVtYmVyO1xuICBkaXN0YW5jZTogbnVtYmVyO1xuICBzY29yZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVTZWFyY2hSZXN1bHQge1xuICBjYW5kaWRhdGVzOiBTaXRlQ2FuZGlkYXRlW107XG4gIGV2YWx1YXRlZDogbnVtYmVyO1xuICByZWplY3RlZDogbnVtYmVyO1xuICBlbGFwc2VkTXM6IG51bWJlcjtcbiAgYnVkZ2V0TXM6IG51bWJlcjtcbiAgLyoqIFRydWUgd2hlbiB0aGUgd2FsbC1jbG9jayBidWRnZXQgc3RvcHBlZCB0aGUgc2NhbiBiZWZvcmUgdGhlIGFyZWEgd2FzIGV4aGF1c3RlZC4gKi9cbiAgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBmbG9vckNhbmRpZGF0ZXMoc3RhdHM6IEFyZWFTdGF0cyk6IG51bWJlcltdIHtcbiAgY29uc3QgbWVhbiA9IE1hdGgucm91bmQoc3RhdHMubWVhblkpO1xuICBjb25zdCBzZXQgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgZm9yIChsZXQgZCA9IC0xOyBkIDw9IDE7IGQrKykgc2V0LmFkZChtZWFuICsgZCk7XG4gIHNldC5hZGQoc3RhdHMubWluWSk7XG4gIHNldC5hZGQoc3RhdHMubWF4WSk7XG4gIHJldHVybiBbLi4uc2V0XS5maWx0ZXIoKHkpID0+IHkgPj0gWV9NSU4gJiYgeSA8IFlfTUFYKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG59XG5cbmZ1bmN0aW9uIG92ZXJsYXBzKGE6IFJlY3QsIGI6IFJlY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIGEueDAgPD0gYi54MSAmJiBhLngxID49IGIueDAgJiYgYS56MCA8PSBiLnoxICYmIGEuejEgPj0gYi56MDtcbn1cblxuZnVuY3Rpb24gY2FuZGlkYXRlU2NvcmUodjogU2l0ZVZhbGlkYXRpb24sIGRpc3RhbmNlOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBwcmVwUGVuYWx0eSA9IHYuc3RhdGUgPT09ICd2YWxpZCcgPyAwIDogMjU7XG4gIGNvbnN0IGdyYWRpbmcgPSB2LnByZXBhcmF0aW9uLmN1dFZvbHVtZSArIHYucHJlcGFyYXRpb24uZmlsbFZvbHVtZTtcbiAgY29uc3QgY2xlYXJpbmcgPSB2LnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzLmxlbmd0aCAqIDQ7XG4gIHJldHVybiBwcmVwUGVuYWx0eSArIGdyYWRpbmcgKyBjbGVhcmluZyArIGRpc3RhbmNlICogMC4yNTtcbn1cblxuLyoqXG4gKiBTZWFyY2ggYSBib3VuZGVkIGFyZWEgZm9yIHZpYWJsZSBmb290cHJpbnRzLiBUaGUgc2FtZSB2YWxpZGF0b3IgYW5kIHRoZSBzYW1lXG4gKiBmbG9vci1zZWxlY3Rpb24gcG9saWN5IGFyZSB1c2VkIGJ5IHRoZSBBSSBhZ2VudCBhbmQgdGhlIHBsYXllcidzIGJ1aWxkXG4gKiBwcmV2aWV3LiBTZWFyY2ggaXMgcmVhZC1vbmx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2VhcmNoU2l0ZXMoXG4gIHdvcmxkOiBXb3JsZCwgcnVsZXM6IEJ1aWxkaW5nUnVsZXMsIGFyZWE6IFJlY3QsIG9wdGlvbnM6IFNlYXJjaE9wdGlvbnMgPSB7fSxcbik6IFNpdGVTZWFyY2hSZXN1bHQge1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBzdGVwID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihvcHRpb25zLnN0ZXAgPz8gMikpO1xuICBjb25zdCBtYXhSZXN1bHRzID0gTWF0aC5tYXgoMSwgb3B0aW9ucy5tYXhSZXN1bHRzID8/IDgpO1xuICBjb25zdCBkaXN0aW5jdCA9IG9wdGlvbnMuZGlzdGluY3QgIT09IGZhbHNlO1xuICBjb25zdCBtYXhEaXN0YW5jZSA9IG9wdGlvbnMubWF4RGlzdGFuY2UgPz8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICBjb25zdCBidWRnZXRNcyA9IG9wdGlvbnMuYnVkZ2V0TXMgPz8gMTAwO1xuICBjb25zdCBhbmNob3IgPSBvcHRpb25zLmFuY2hvciA/PyB7IHg6IChhcmVhLngwICsgYXJlYS54MSkgLyAyLCB6OiAoYXJlYS56MCArIGFyZWEuejEpIC8gMiB9O1xuICBjb25zdCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpO1xuICBjb25zdCBhbGw6IFNpdGVDYW5kaWRhdGVbXSA9IFtdO1xuICBsZXQgZXZhbHVhdGVkID0gMDtcbiAgbGV0IHJlamVjdGVkID0gMDtcbiAgbGV0IHRydW5jYXRlZCA9IGZhbHNlO1xuXG4gIGNvbnN0IHgxTWF4ID0gYXJlYS54MSAtIHJ1bGVzLndpZHRoICsgMTtcbiAgY29uc3QgejFNYXggPSBhcmVhLnoxIC0gcnVsZXMuZGVwdGggKyAxO1xuICBzY2FuOiBmb3IgKGxldCB6ID0gYXJlYS56MDsgeiA8PSB6MU1heDsgeiArPSBzdGVwKSB7XG4gICAgZm9yIChsZXQgeCA9IGFyZWEueDA7IHggPD0geDFNYXg7IHggKz0gc3RlcCkge1xuICAgICAgY29uc3QgcmVjdCA9IHsgeDA6IHgsIHowOiB6LCB4MTogeCArIHJ1bGVzLndpZHRoIC0gMSwgejE6IHogKyBydWxlcy5kZXB0aCAtIDEgfTtcbiAgICAgIGNvbnN0IGN4ID0gKHJlY3QueDAgKyByZWN0LngxKSAvIDI7XG4gICAgICBjb25zdCBjeiA9IChyZWN0LnowICsgcmVjdC56MSkgLyAyO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLmh5cG90KGN4IC0gYW5jaG9yLngsIGN6IC0gYW5jaG9yLnopO1xuICAgICAgaWYgKGRpc3RhbmNlID4gbWF4RGlzdGFuY2UpIGNvbnRpbnVlO1xuICAgICAgaWYgKG9wdGlvbnMubmVhcikge1xuICAgICAgICBjb25zdCBuZWFyRGlzdGFuY2UgPSBNYXRoLmh5cG90KGN4IC0gb3B0aW9ucy5uZWFyLngsIGN6IC0gb3B0aW9ucy5uZWFyLnopO1xuICAgICAgICBpZiAobmVhckRpc3RhbmNlID4gb3B0aW9ucy5uZWFyLm1heERpc3RhbmNlKSBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RhdHMgPSBxdWVyeS5hcmVhKHJlY3QpO1xuICAgICAgbGV0IGJlc3Q6IFNpdGVDYW5kaWRhdGUgfCBudWxsID0gbnVsbDtcbiAgICAgIGZvciAoY29uc3QgZmxvb3JZIG9mIGZsb29yQ2FuZGlkYXRlcyhzdGF0cykpIHtcbiAgICAgICAgZXZhbHVhdGVkKys7XG4gICAgICAgIGNvbnN0IHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwgPSB7XG4gICAgICAgICAgc2l0ZUlkOiBgJHtydWxlcy5pZH06JHt4fSwke3p9LCR7Zmxvb3JZfWAsXG4gICAgICAgICAgcmVjdCwgZmxvb3JZLCBydWxlcyxcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgZm9vdHByaW50ID0gcXVlcnkuZm9vdHByaW50KHJlY3QsIGZsb29yWSk7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsLCBxdWVyeSwgZm9vdHByaW50KTtcbiAgICAgICAgaWYgKHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJykge1xuICAgICAgICAgIHJlamVjdGVkKys7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2NvcmUgPSBjYW5kaWRhdGVTY29yZSh2YWxpZGF0aW9uLCBkaXN0YW5jZSk7XG4gICAgICAgIGNvbnN0IGNhbmRpZGF0ZTogU2l0ZUNhbmRpZGF0ZSA9IHtcbiAgICAgICAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICAgICAgICByZWN0LFxuICAgICAgICAgIGZsb29yWSxcbiAgICAgICAgICBzdGF0ZTogdmFsaWRhdGlvbi5zdGF0ZSxcbiAgICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgICAgIGN1dFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUsXG4gICAgICAgICAgZmlsbFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lLFxuICAgICAgICAgIG9ic3RydWN0aW9uQ291bnQ6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHMubGVuZ3RoLFxuICAgICAgICAgIGRpc3RhbmNlLFxuICAgICAgICAgIHNjb3JlLFxuICAgICAgICB9O1xuICAgICAgICBpZiAoIWJlc3RcbiAgICAgICAgICB8fCAoY2FuZGlkYXRlLnN0YXRlID09PSAndmFsaWQnICYmIGJlc3Quc3RhdGUgIT09ICd2YWxpZCcpXG4gICAgICAgICAgfHwgKGNhbmRpZGF0ZS5zdGF0ZSA9PT0gYmVzdC5zdGF0ZSAmJiBjYW5kaWRhdGUuc2NvcmUgPCBiZXN0LnNjb3JlKSkge1xuICAgICAgICAgIGJlc3QgPSBjYW5kaWRhdGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChiZXN0KSBhbGwucHVzaChiZXN0KTtcbiAgICB9XG4gICAgaWYgKHBlcmZvcm1hbmNlLm5vdygpIC0gdDAgPiBidWRnZXRNcykge1xuICAgICAgdHJ1bmNhdGVkID0gdHJ1ZTtcbiAgICAgIGJyZWFrIHNjYW47XG4gICAgfVxuICB9XG5cbiAgYWxsLnNvcnQoKGEsIGIpID0+IGEuc2NvcmUgLSBiLnNjb3JlIHx8IGEuZGlzdGFuY2UgLSBiLmRpc3RhbmNlXG4gICAgfHwgYS5yZWN0LngwIC0gYi5yZWN0LngwIHx8IGEucmVjdC56MCAtIGIucmVjdC56MCk7XG4gIGNvbnN0IHNlbGVjdGVkOiBTaXRlQ2FuZGlkYXRlW10gPSBbXTtcbiAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgYWxsKSB7XG4gICAgaWYgKGRpc3RpbmN0ICYmIHNlbGVjdGVkLnNvbWUoKHMpID0+IG92ZXJsYXBzKHMucmVjdCwgY2FuZGlkYXRlLnJlY3QpKSkgY29udGludWU7XG4gICAgc2VsZWN0ZWQucHVzaChjYW5kaWRhdGUpO1xuICAgIGlmIChzZWxlY3RlZC5sZW5ndGggPj0gbWF4UmVzdWx0cykgYnJlYWs7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNhbmRpZGF0ZXM6IHNlbGVjdGVkLFxuICAgIGV2YWx1YXRlZCxcbiAgICByZWplY3RlZCxcbiAgICBlbGFwc2VkTXM6IE1hdGgucm91bmQoKHBlcmZvcm1hbmNlLm5vdygpIC0gdDApICogMTAwKSAvIDEwMCxcbiAgICBidWRnZXRNcyxcbiAgICB0cnVuY2F0ZWQsXG4gIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gcHJldmlldyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIEZvdW5kYXRpb25QcmV2aWV3IHtcbiAgdHlwZTogRm91bmRhdGlvblR5cGU7XG4gIC8qKiBTdG9uZSBmbG9vciBzbGFiIHBsdXMgZmlsbCB1bmRlciB0aGUgcHJlcGFyZWQgZmxvb3IuICovXG4gIHBsaW50aENlbGxzOiBudW1iZXI7XG4gIC8qKiBQZXJpbWV0ZXIgY2VsbHMgdGhhdCBuZWVkIGEgcmV0YWluaW5nIGZhY2UgYmVjYXVzZSBvZiBjdXQgb3IgZmlsbC4gKi9cbiAgcmV0YWluaW5nV2FsbENlbGxzOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQWNjZXNzUHJldmlldyB7XG4gIGRvb3I6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgZGlzdGFuY2U6IG51bWJlcjtcbiAgZ3JhZGU6IG51bWJlcjtcbiAgd2Fsa2FibGU6IGJvb2xlYW47XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVQcmV2aWV3IHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHN0YXRlOiBTaXRlU3RhdGU7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbiAgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdO1xuICB0ZXJyYWluOiB7XG4gICAgbWluWTogbnVtYmVyO1xuICAgIG1heFk6IG51bWJlcjtcbiAgICBtZWFuWTogbnVtYmVyO1xuICAgIHJlbGllZjogbnVtYmVyO1xuICAgIG1heFN0ZXA6IG51bWJlcjtcbiAgICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gICAgbWF4Q3V0OiBudW1iZXI7XG4gICAgbWF4RmlsbDogbnVtYmVyO1xuICB9O1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uUHJldmlldztcbiAgb2JzdHJ1Y3Rpb25zOiBBcnJheTx7XG4gICAgZW50aXR5SWQ6IHN0cmluZztcbiAgICBraW5kOiBzdHJpbmc7XG4gICAgeDogbnVtYmVyO1xuICAgIHo6IG51bWJlcjtcbiAgICBhY3Rpb246ICdjbGVhcicgfCAnYmxvY2tlZCc7XG4gIH0+O1xuICBhY2Nlc3M6IEFjY2Vzc1ByZXZpZXcgfCBudWxsO1xuICAvKiogQ29tcGxldGUgd29yayBlbnZlbG9wZSB0aGlzIHByZXZpZXcgd291bGQgYXV0aG9yaXplLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmV2aWV3T3B0aW9ucyB7XG4gIGRvb3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICB3YWxrPzogV2Fsa1BhcmFtcztcbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUgdGhyZWUtc3RhdGUgcHJldmlldy4gSXQgaXMgZGVsaWJlcmF0ZWx5IGRhdGEtb25seTogdGhlIHJlbmRlcmVyXG4gKiBjYW4gZHJhdyBpdCwgYnV0IGl0IG5ldmVyIGVkaXRzIHRlcnJhaW4gb3Igc3BlbmRzIHJlc291cmNlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXZpZXdTaXRlKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIG9wdGlvbnM6IFByZXZpZXdPcHRpb25zID0ge30sXG4pOiBTaXRlUHJldmlldyB7XG4gIGNvbnN0IHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCk7XG4gIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsLCBxdWVyeSk7XG4gIGNvbnN0IGZwID0gdmFsaWRhdGlvbi5xdWVyeTtcbiAgY29uc3Qgc3RhdHMgPSBmcC5zdGF0cztcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHJ1bGVzID0gcHJvcG9zYWwucnVsZXM7XG5cbiAgbGV0IHBlcmltZXRlciA9IDA7XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgICAgaWYgKHggIT09IHJlY3QueDAgJiYgeCAhPT0gcmVjdC54MSAmJiB6ICE9PSByZWN0LnowICYmIHogIT09IHJlY3QuejEpIGNvbnRpbnVlO1xuICAgICAgaWYgKGNvbHVtbkF0KHdvcmxkLCB4LCB6KS5zdXJmYWNlWSAhPT0gcHJvcG9zYWwuZmxvb3JZKSBwZXJpbWV0ZXIrKztcbiAgICB9XG4gIH1cbiAgY29uc3QgZm91bmRhdGlvbjogRm91bmRhdGlvblByZXZpZXcgPSB7XG4gICAgdHlwZTogcnVsZXMuZm91bmRhdGlvbixcbiAgICBwbGludGhDZWxsczogcmVjdENvbHVtbnMocmVjdCkgKyBzdGF0cy5maWxsVm9sdW1lLFxuICAgIHJldGFpbmluZ1dhbGxDZWxsczogcGVyaW1ldGVyLFxuICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gIH07XG5cbiAgbGV0IGFjY2VzczogQWNjZXNzUHJldmlldyB8IG51bGwgPSBudWxsO1xuICBpZiAob3B0aW9ucy5kb29yICYmIG9wdGlvbnMuYXBwcm9hY2gpIHtcbiAgICBjb25zdCBkb29yID0gb3B0aW9ucy5kb29yO1xuICAgIGNvbnN0IGFwcHJvYWNoID0gb3B0aW9ucy5hcHByb2FjaDtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5oeXBvdChkb29yLnggLSBhcHByb2FjaC54LCBkb29yLnogLSBhcHByb2FjaC56KTtcbiAgICBjb25zdCBzdGVwcyA9IE1hdGgubWF4KDEsIE1hdGguY2VpbChkaXN0YW5jZSkpO1xuICAgIGxldCBwcmV2WCA9IGFwcHJvYWNoLngsIHByZXZaID0gYXBwcm9hY2guejtcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBzdGVwczsgaSsrKSB7XG4gICAgICBjb25zdCB0ID0gaSAvIHN0ZXBzO1xuICAgICAgY29uc3QgeCA9IE1hdGgucm91bmQoYXBwcm9hY2gueCArIChkb29yLnggLSBhcHByb2FjaC54KSAqIHQpO1xuICAgICAgY29uc3QgeiA9IE1hdGgucm91bmQoYXBwcm9hY2gueiArIChkb29yLnogLSBhcHByb2FjaC56KSAqIHQpO1xuICAgICAgaWYgKHggPT09IHByZXZYICYmIHogPT09IHByZXZaKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHdhbGtTdGVwKHdvcmxkLCBwcmV2WCwgcHJldlosIHgsIHosIG9wdGlvbnMud2FsayA/PyBERUZBVUxUX1dBTEspO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJlYXNvbnMucHVzaChgJHtyZXN1bHQucmVhc29ufSBhdCAke3h9LCR7en1gKTtcbiAgICAgIHByZXZYID0geDsgcHJldlogPSB6O1xuICAgIH1cbiAgICBhY2Nlc3MgPSB7XG4gICAgICBkb29yLCBhcHByb2FjaCwgZGlzdGFuY2UsXG4gICAgICBncmFkZTogZWZmZWN0aXZlR3JhZGUod29ybGQsIGFwcHJvYWNoLngsIGFwcHJvYWNoLnosIGRvb3IueCwgZG9vci56KSxcbiAgICAgIHdhbGthYmxlOiByZWFzb25zLmxlbmd0aCA9PT0gMCxcbiAgICAgIHJlYXNvbnMsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHkwID0gcHJvcG9zYWwuZmxvb3JZIC0gTWF0aC5tYXgoMSwgc3RhdHMubWF4Q3V0KSAtIDE7XG4gIGNvbnN0IHkxID0gcHJvcG9zYWwuZmxvb3JZICsgTWF0aC5tYXgocnVsZXMud2FsbEhlaWdodCwgMSkgKyAxO1xuICBjb25zdCBlbnZlbG9wZTogVm94ZWxSZWdpb25bXSA9IFtcbiAgICB7XG4gICAgICAuLi5leHBhbmRSZWN0KHJlY3QsIDIpLFxuICAgICAgeTA6IE1hdGgubWF4KFlfTUlOLCB5MCksXG4gICAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCB5MSksXG4gICAgfSxcbiAgXTtcbiAgaWYgKGFjY2Vzcykge1xuICAgIGNvbnN0IGF4MCA9IE1hdGgubWluKGFjY2Vzcy5kb29yLngsIGFjY2Vzcy5hcHByb2FjaC54KSAtIDE7XG4gICAgY29uc3QgYXgxID0gTWF0aC5tYXgoYWNjZXNzLmRvb3IueCwgYWNjZXNzLmFwcHJvYWNoLngpICsgMTtcbiAgICBjb25zdCBhejAgPSBNYXRoLm1pbihhY2Nlc3MuZG9vci56LCBhY2Nlc3MuYXBwcm9hY2gueikgLSAxO1xuICAgIGNvbnN0IGF6MSA9IE1hdGgubWF4KGFjY2Vzcy5kb29yLnosIGFjY2Vzcy5hcHByb2FjaC56KSArIDE7XG4gICAgY29uc3QgYU1pbiA9IE1hdGgubWluKHN1cmZhY2VBdCh3b3JsZCwgYXgwLCBhejApLCBzdXJmYWNlQXQod29ybGQsIGF4MSwgYXoxKSk7XG4gICAgY29uc3QgYU1heCA9IE1hdGgubWF4KHN1cmZhY2VBdCh3b3JsZCwgYXgwLCBhejApLCBzdXJmYWNlQXQod29ybGQsIGF4MSwgYXoxKSk7XG4gICAgZW52ZWxvcGUucHVzaCh7XG4gICAgICB4MDogYXgwLCB4MTogYXgxLCB6MDogYXowLCB6MTogYXoxLFxuICAgICAgeTA6IE1hdGgubWF4KFlfTUlOLCBhTWluIC0gMiksXG4gICAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBhTWF4ICsgMiksXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHN0YXRlOiB2YWxpZGF0aW9uLnN0YXRlLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgcnVsZXMsXG4gICAgcmVhc29uczogdmFsaWRhdGlvbi5yZWFzb25zLFxuICAgIHRlcnJhaW46IHtcbiAgICAgIG1pblk6IHN0YXRzLm1pblksXG4gICAgICBtYXhZOiBzdGF0cy5tYXhZLFxuICAgICAgbWVhblk6IHN0YXRzLm1lYW5ZLFxuICAgICAgcmVsaWVmOiBzdGF0cy5yZWxpZWYsXG4gICAgICBtYXhTdGVwOiBzdGF0cy5tYXhTdGVwLFxuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgIH0sXG4gICAgZm91bmRhdGlvbixcbiAgICBvYnN0cnVjdGlvbnM6IHN0YXRzLm9ic3RydWN0aW9ucy5tYXAoKG8pID0+ICh7XG4gICAgICBlbnRpdHlJZDogby5lbnRpdHlJZCxcbiAgICAgIGtpbmQ6IG8ua2luZCxcbiAgICAgIHg6IG8ueCxcbiAgICAgIHo6IG8ueixcbiAgICAgIGFjdGlvbjogdmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnID8gJ2Jsb2NrZWQnIDogJ2NsZWFyJyxcbiAgICB9KSksXG4gICAgYWNjZXNzLFxuICAgIGVudmVsb3BlLFxuICB9O1xufVxuXG4iLCAiLy8gTTAwMiBzdGFnZSAzOiBib3VuZGVkLCBhdXRob3JpemVkIHRlcnJhaW4gcHJlcGFyYXRpb24uXG4vL1xuLy8gVGhlIHBpcGVsaW5lIGlzIGRlbGliZXJhdGVseSBvbmUtd2F5IGFuZCBzaGFyZWQgYnkgdGhlIHBsYXllciBhbmQgdGhlIEFJOlxuLy9cbi8vICAgcHJvcG9zYWwgLT4gdmFsaWRhdGVTaXRlIC0+IHBsYW5QcmVwYXJhdGlvbiAtPiBBdXRob3JpemVyIC0+IGV4ZWN1dGVcbi8vXG4vLyBgZXhlY3V0ZVByZXBhcmF0aW9uYCBpcyB0aGUgb25seSBmdW5jdGlvbiBpbiBNMDAyIHRoYXQgZWRpdHMgdGVycmFpbiBmb3Jcbi8vIGNvbnN0cnVjdGlvbi4gSXQgcmVmdXNlcyB0byBydW4gd2l0aG91dCBhbiBhdXRob3JpemF0aW9uIHRva2VuIHdob3NlIGRpZ2VzdFxuLy8gbWF0Y2hlcyB0aGUgcGxhbiwgd2hvc2UgZW52ZWxvcGUgY292ZXJzIGV2ZXJ5IHZveGVsIGl0IHdvdWxkIHRvdWNoLCBhbmQgd2hvc2Vcbi8vIGJhc2UgcmV2aXNpb24gc3RpbGwgbWF0Y2hlcyB0aGUgd29ybGQuIEFsbCBlZGl0cyBhcmUgY29tcHV0ZWQgYW5kIGNoZWNrZWRcbi8vIGJlZm9yZSB0aGUgZmlyc3QgYnl0ZSBpcyB3cml0dGVuLCBzbyBhIHJlamVjdGVkIHBsYW4gY2Fubm90IGxlYXZlIGEgcGFydGlhbFxuLy8gcGFkIGJlaGluZC5cbi8vXG4vLyBUaGUgYXV0aG9yaXplciBpbiB0aGlzIGZpbGUgaXMgYSBsb2NhbCBwb2xpY3kgc3R1Yi4gSXQgcHJvdmVzIHRoYXQgdGhlXG4vLyBwaXBlbGluZSBhbmQgdGhlIGVudmVsb3BlIGNoZWNrcyBleGlzdDsgaXQgaXMgTk9UIE1hZ2ljQmxvY2sgZW5mb3JjZW1lbnQuXG4vLyBObyBjaGFpbiBwcm9ncmFtLCBTREsgY2FsbCwgc2V0dGxlbWVudCBvciByb2xsYmFjayBndWFyYW50ZWUgaXMgcHJlc2VudC5cbmltcG9ydCB7XG4gIFdvcmxkLCBNQVQsIE1hdElkLCBZX01JTiwgWV9NQVgsIEhBTEYsIGlzU29saWQsXG4gIGdldFZveGVsLCBzZXRWb3hlbCwgcmVtb3ZlRW50aXR5LCBzdXJmYWNlQXQsXG4gIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBFbnRpdHlLaW5kLCBSZXNvdXJjZVR5cGUsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIG5vcm1hbGl6ZVJlY3QsIHJlY3RDb2x1bW5zLCBleHBhbmRSZWN0LFxuICBlbnZlbG9wZUNvbnRhaW5zLCBvYnN0cnVjdGlvbnNJbixcbn0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7XG4gIFNpdGVQcm9wb3NhbCwgU2l0ZVZhbGlkYXRpb24sIEJ1aWxkaW5nUnVsZXMsIHZhbGlkYXRlU2l0ZSxcbn0gZnJvbSAnLi9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHtcbiAgaW52ZW50b3J5U25hcHNob3QsIG5vcm1hbGl6ZUVudmVsb3BlLFxufSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBMT0NBTF9BVVRIT1JJVFkgPSAnbG9jYWwtc3R1YicgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgTE9DQUxfRU5GT1JDRU1FTlQgPSAnbG9jYWwtc2ltdWxhdGlvbi1vbmx5JyBhcyBjb25zdDtcblxuZXhwb3J0IGludGVyZmFjZSBDb2x1bW5UYXJnZXQge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBsYW5FeHBlY3RhdGlvbiB7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uczogbnVtYmVyO1xuICBzdXJmYWNlRWRpdHM6IG51bWJlcjtcbiAgdG90YWxFZGl0czogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uUGxhbiB7XG4gIGlkOiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIC8qKiBFeGFjdGx5IG9uZSB0YXJnZXQgd2Fsa2luZyBoZWlnaHQgcGVyIGZvb3RwcmludCBjb2x1bW4sIHNvcnRlZCBieSB6LCB4LiAqL1xuICB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXTtcbiAgLyoqIEF1dGhvcml0YXRpdmUgZW50aXR5IGlkcyB0aGlzIHBsYW4gbWF5IHJlbW92ZS4gKi9cbiAgY2xlYXJFbnRpdHlJZHM6IHN0cmluZ1tdO1xuICAvKiogTWF0ZXJpYWwgZm9yIHRoZSB0b3Agc29saWQgdm94ZWwgYWZ0ZXIgZ3JhZGluZywgb3IgbnVsbCB0byBrZWVwIGl0LiAqL1xuICBzdXJmYWNlTWF0ZXJpYWw6IE1hdElkIHwgbnVsbDtcbiAgLyoqIFRpZ2h0IGVudmVsb3BlIGNvdmVyaW5nIGV2ZXJ5IHBsYW5uZWQgdm94ZWwgY2hhbmdlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgZXhwZWN0ZWQ6IFBsYW5FeHBlY3RhdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbk9wdGlvbnMge1xuICAvKiogUGVyLWNvbHVtbiB0YXJnZXRzIGZvciB0ZXJyYWNlcyBvciBzdGVwcGVkIHBhdGhzLiBEZWZhdWx0cyB0byBmbG9vclkuICovXG4gIHRhcmdldHM/OiBDb2x1bW5UYXJnZXRbXTtcbiAgLyoqIGBub25lYCBpcyBvbmx5IGxlZ2FsIHdoZW4gdGhlIHNpdGUgaGFzIG5vIG9ic3RydWN0aW9ucy4gKi9cbiAgY2xlYXI/OiAnb2JzdHJ1Y3Rpb25zJyB8ICdub25lJztcbiAgLyoqIFNldCB0aGUgdG9wIHNvbGlkIHZveGVsIG9mIGV2ZXJ5IHRhcmdldCBjb2x1bW4gKHBhdGhzLCBmaWVsZHMpLiAqL1xuICBzdXJmYWNlTWF0ZXJpYWw/OiBNYXRJZDtcbiAgLyoqIEV4cGxpY2l0IHdvcmsgZW52ZWxvcGUuIERlZmF1bHRzIHRvIGEgdGlnaHQgZW52ZWxvcGUgYXJvdW5kIHRoZSBlZGl0cy4gKi9cbiAgZW52ZWxvcGU/OiBWb3hlbFJlZ2lvbltdO1xufVxuXG4vLyAtLS0tLS0tLS0tIHN0YWJsZSBkaWdlc3QgLS0tLS0tLS0tLVxuZnVuY3Rpb24gZGlnZXN0KGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzU7XG4gIGxldCBiID0gMHg5ZTM3NzliOTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbnB1dC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGMgPSBpbnB1dC5jaGFyQ29kZUF0KGkpO1xuICAgIGEgPSBNYXRoLmltdWwoYSBeIGMsIDB4MDEwMDAxOTMpO1xuICAgIGIgPSBNYXRoLmltdWwoYiBeIChjICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIGIgXj0gYiA+Pj4gMTM7XG4gIH1cbiAgcmV0dXJuIChhID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICsgKGIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG4vKiogRGlnZXN0IG9mIGV2ZXJ5dGhpbmcgdGhhdCBjaGFuZ2VzIHRoZSBzZXQgb2YgZWRpdHMgb3IgcmVtb3ZhbHMuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhbkRpZ2VzdChwbGFuOiBQcmVwYXJhdGlvblBsYW4pOiBzdHJpbmcge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXG4gICAgJ20wMDI6cHJlcC1wbGFuOnYxJyxcbiAgICBwbGFuLnNpdGVJZCxcbiAgICBgJHtwbGFuLnJlY3QueDB9LCR7cGxhbi5yZWN0LnowfSwke3BsYW4ucmVjdC54MX0sJHtwbGFuLnJlY3QuejF9YCxcbiAgICBTdHJpbmcocGxhbi5mbG9vclkpLFxuICAgIHBsYW4ucnVsZXMuaWQsXG4gICAgU3RyaW5nKHBsYW4udGFyZ2V0cy5sZW5ndGgpLFxuICAgIHBsYW4uc3VyZmFjZU1hdGVyaWFsID09PSBudWxsID8gJ3N1cmZhY2U6a2VlcCcgOiBgc3VyZmFjZToke3BsYW4uc3VyZmFjZU1hdGVyaWFsfWAsXG4gIF07XG4gIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIGxpbmVzLnB1c2goYHQ6JHt0Lnh9LCR7dC56fSwke3QueX1gKTtcbiAgY29uc3QgY2xlYXJzID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgbGluZXMucHVzaChgYzoke2NsZWFycy5sZW5ndGh9YCk7XG4gIGZvciAoY29uc3QgaWQgb2YgY2xlYXJzKSBsaW5lcy5wdXNoKGBjOiR7aWR9YCk7XG4gIGZvciAoY29uc3QgZSBvZiBub3JtYWxpemVFbnZlbG9wZShwbGFuLmVudmVsb3BlKSkge1xuICAgIGxpbmVzLnB1c2goYGU6JHtlLngwfSwke2UuejB9LCR7ZS55MH0sJHtlLngxfSwke2UuejF9LCR7ZS55MX1gKTtcbiAgfVxuICBjb25zdCB4ID0gcGxhbi5leHBlY3RlZDtcbiAgbGluZXMucHVzaChgeDoke3guY3V0Vm9sdW1lfSwke3guZmlsbFZvbHVtZX0sJHt4Lm1heEN1dH0sJHt4Lm1heEZpbGx9LCR7eC5vYnN0cnVjdGlvbnN9LCR7eC5zdXJmYWNlRWRpdHN9LCR7eC50b3RhbEVkaXRzfWApO1xuICByZXR1cm4gZGlnZXN0KGxpbmVzLmpvaW4oJ1xcbicpKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwbGFubmluZyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFBsYW5TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFByZXBhcmF0aW9uUGxhbjtcbiAgdmFsaWRhdGlvbjogU2l0ZVZhbGlkYXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25GYWlsdXJlIHtcbiAgb2s6IGZhbHNlO1xuICBzdGFnZTogJ3BsYW4nIHwgJ2F1dGhvcml6ZScgfCAnZXhlY3V0ZSc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG4gIHZhbGlkYXRpb24/OiBTaXRlVmFsaWRhdGlvbjtcbn1cblxuZXhwb3J0IHR5cGUgUGxhblJlc3VsdCA9IFBsYW5TdWNjZXNzIHwgUHJlcGFyYXRpb25GYWlsdXJlO1xuXG5mdW5jdGlvbiBkZWZhdWx0VGFyZ2V0cyh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QsIGZsb29yWTogbnVtYmVyKTogQ29sdW1uVGFyZ2V0W10ge1xuICBjb25zdCBvdXQ6IENvbHVtblRhcmdldFtdID0gW107XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgb3V0LnB1c2goeyB4LCB6LCB5OiBmbG9vclkgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gc29ydGVkVGFyZ2V0cyh0YXJnZXRzOiByZWFkb25seSBDb2x1bW5UYXJnZXRbXSk6IENvbHVtblRhcmdldFtdIHtcbiAgcmV0dXJuIFsuLi50YXJnZXRzXS5zb3J0KChhLCBiKSA9PiBhLnogLSBiLnogfHwgYS54IC0gYi54IHx8IGEueSAtIGIueSk7XG59XG5cbmludGVyZmFjZSBUYXJnZXRTdGF0cyB7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIHJlbGllZjogbnVtYmVyO1xufVxuXG4vKiogQ3V0L2ZpbGwgaW1wbGllZCBieSBleHBsaWNpdCB0YXJnZXRzLCBpbmRlcGVuZGVudCBvZiB0aGUgZmxhdCBmbG9vclkuICovXG5mdW5jdGlvbiB0YXJnZXRTdGF0cyh3b3JsZDogV29ybGQsIHRhcmdldHM6IHJlYWRvbmx5IENvbHVtblRhcmdldFtdKTogVGFyZ2V0U3RhdHMge1xuICBsZXQgY3V0Vm9sdW1lID0gMCwgZmlsbFZvbHVtZSA9IDAsIG1heEN1dCA9IDAsIG1heEZpbGwgPSAwO1xuICBsZXQgbWluWSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgbWF4WSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgbWluWSA9IE1hdGgubWluKG1pblksIHN1cmZhY2UsIHQueSk7XG4gICAgbWF4WSA9IE1hdGgubWF4KG1heFksIHN1cmZhY2UsIHQueSk7XG4gICAgaWYgKHN1cmZhY2UgPiB0LnkpIHtcbiAgICAgIGNvbnN0IGQgPSBzdXJmYWNlIC0gdC55O1xuICAgICAgY3V0Vm9sdW1lICs9IGQ7XG4gICAgICBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGQpO1xuICAgIH0gZWxzZSBpZiAoc3VyZmFjZSA8IHQueSkge1xuICAgICAgY29uc3QgZCA9IHQueSAtIHN1cmZhY2U7XG4gICAgICBmaWxsVm9sdW1lICs9IGQ7XG4gICAgICBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgZCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB7IGN1dFZvbHVtZSwgZmlsbFZvbHVtZSwgbWF4Q3V0LCBtYXhGaWxsLCByZWxpZWY6IG1heFkgLSBtaW5ZIH07XG59XG5cbmZ1bmN0aW9uIHRhcmdldFJ1bGVSZWFzb25zKHN0YXRzOiBUYXJnZXRTdGF0cywgcnVsZXM6IEJ1aWxkaW5nUnVsZXMpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGlmIChzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCkge1xuICAgIHJlYXNvbnMucHVzaChgcmVsaWVmICR7c3RhdHMucmVsaWVmfSBtIGV4Y2VlZHMgdGhlICR7cnVsZXMubWF4UmVsaWVmUHJlcGFyZWR9IG0gcHJlcGFyZWQgbGltaXRgKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4Q3V0ID4gcnVsZXMubWF4Q3V0KSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgJHtzdGF0cy5tYXhDdXR9IG0gZXhjZWVkcyAke3J1bGVzLm1heEN1dH0gbWApO1xuICB9XG4gIGlmIChzdGF0cy5tYXhGaWxsID4gcnVsZXMubWF4RmlsbCkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCAke3N0YXRzLm1heEZpbGx9IG0gZXhjZWVkcyAke3J1bGVzLm1heEZpbGx9IG1gKTtcbiAgfVxuICBpZiAoc3RhdHMuY3V0Vm9sdW1lID4gcnVsZXMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgdm9sdW1lICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXRWb2x1bWV9IG1cdTAwQjNgKTtcbiAgfVxuICBpZiAoc3RhdHMuZmlsbFZvbHVtZSA+IHJ1bGVzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgdm9sdW1lICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4RmlsbFZvbHVtZX0gbVx1MDBCM2ApO1xuICB9XG4gIHJldHVybiByZWFzb25zO1xufVxuXG4vKipcbiAqIFR1cm4gYSBwcm9wb3NhbCBpbnRvIGFuIGV4cGxpY2l0LCBjaGVja2FibGUgcGxhbi4gUmVhZC1vbmx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhblByZXBhcmF0aW9uKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIG9wdGlvbnM6IFByZXBhcmF0aW9uT3B0aW9ucyA9IHt9LFxuKTogUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCk7XG5cbiAgaWYgKHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJykge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3NpdGVfaW52YWxpZCcsXG4gICAgICByZWFzb25zOiB2YWxpZGF0aW9uLnJlYXNvbnMubWFwKChyKSA9PiBgJHtyLmNvZGV9OiAke3IubWVzc2FnZX1gKSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHRhcmdldHMgPSBzb3J0ZWRUYXJnZXRzKG9wdGlvbnMudGFyZ2V0cyA/PyBkZWZhdWx0VGFyZ2V0cyh3b3JsZCwgcmVjdCwgcHJvcG9zYWwuZmxvb3JZKSk7XG4gIGNvbnN0IGNvbHVtbnMgPSByZWN0Q29sdW1ucyhyZWN0KTtcbiAgaWYgKHRhcmdldHMubGVuZ3RoICE9PSBjb2x1bW5zKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAndGFyZ2V0X2NvdW50JyxcbiAgICAgIHJlYXNvbnM6IFtgcGxhbiBoYXMgJHt0YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBmb3IgJHtjb2x1bW5zfSBjb2x1bW5zYF0sXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qga2V5ID0gYCR7dC54fSwke3Quen1gO1xuICAgIGlmIChzZWVuLmhhcyhrZXkpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICdkdXBsaWNhdGVfdGFyZ2V0JyxcbiAgICAgICAgcmVhc29uczogW2BkdXBsaWNhdGUgdGFyZ2V0IGF0ICR7a2V5fWBdLCB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gICAgc2Vlbi5hZGQoa2V5KTtcbiAgICBpZiAodC54IDwgcmVjdC54MCB8fCB0LnggPiByZWN0LngxIHx8IHQueiA8IHJlY3QuejAgfHwgdC56ID4gcmVjdC56MSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAndGFyZ2V0X291dHNpZGVfZm9vdHByaW50JyxcbiAgICAgICAgcmVhc29uczogW2B0YXJnZXQgJHtrZXl9IGlzIG91dHNpZGUgJHtyZWN0LngwfSwke3JlY3QuejB9Li4ke3JlY3QueDF9LCR7cmVjdC56MX1gXSxcbiAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcih0LnkpIHx8IHQueSA8IFlfTUlOIHx8IHQueSA+PSBZX01BWCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAndGFyZ2V0X2hlaWdodCcsXG4gICAgICAgIHJlYXNvbnM6IFtgdGFyZ2V0ICR7a2V5fSBoYXMgaW52YWxpZCBoZWlnaHQgJHt0Lnl9YF0sIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHM7XG4gIGNvbnN0IGNsZWFyID0gb3B0aW9ucy5jbGVhciA/PyAnb2JzdHJ1Y3Rpb25zJztcbiAgaWYgKGNsZWFyID09PSAnbm9uZScgJiYgb2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICd1bmNsZWFyZWRfb2JzdHJ1Y3Rpb25zJyxcbiAgICAgIHJlYXNvbnM6IFtgJHtvYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgd291bGQgcmVtYWluYF0sXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cbiAgY29uc3QgY2xlYXJFbnRpdHlJZHMgPSBjbGVhciA9PT0gJ25vbmUnID8gW10gOiBbLi4ubmV3IFNldChvYnN0cnVjdGlvbnMpXS5zb3J0KCk7XG4gIGNvbnN0IHN1cmZhY2VNYXRlcmlhbCA9IG9wdGlvbnMuc3VyZmFjZU1hdGVyaWFsID8/IG51bGw7XG5cbiAgY29uc3QgY3VzdG9tVGFyZ2V0cyA9IG9wdGlvbnMudGFyZ2V0cyAhPT0gdW5kZWZpbmVkO1xuICBjb25zdCBzdGF0cyA9IGN1c3RvbVRhcmdldHNcbiAgICA/IHRhcmdldFN0YXRzKHdvcmxkLCB0YXJnZXRzKVxuICAgIDoge1xuICAgICAgY3V0Vm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm1heEZpbGwsXG4gICAgICByZWxpZWY6IHZhbGlkYXRpb24ucXVlcnkuc3RhdHMucmVsaWVmLFxuICAgIH07XG4gIGlmIChjdXN0b21UYXJnZXRzKSB7XG4gICAgY29uc3QgcmVhc29ucyA9IHRhcmdldFJ1bGVSZWFzb25zKHN0YXRzLCBwcm9wb3NhbC5ydWxlcyk7XG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgICBjb2RlOiAndGFyZ2V0X3J1bGVzJyxcbiAgICAgICAgcmVhc29ucyxcbiAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgbGV0IGxvID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICBsZXQgaGkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIGxvID0gTWF0aC5taW4obG8sIHN1cmZhY2UsIHQueSk7XG4gICAgaGkgPSBNYXRoLm1heChoaSwgc3VyZmFjZSAtIDEsIHQueSAtIDEpO1xuICB9XG4gIGNvbnN0IGJ1ZmZlcmVkID0gZXhwYW5kUmVjdChyZWN0LCAxKTtcbiAgY29uc3QgZGVyaXZlZDogVm94ZWxSZWdpb24gPSB7XG4gICAgeDA6IE1hdGgubWF4KC1IQUxGLCBidWZmZXJlZC54MCksXG4gICAgejA6IE1hdGgubWF4KC1IQUxGLCBidWZmZXJlZC56MCksXG4gICAgeDE6IE1hdGgubWluKEhBTEYgLSAxLCBidWZmZXJlZC54MSksXG4gICAgejE6IE1hdGgubWluKEhBTEYgLSAxLCBidWZmZXJlZC56MSksXG4gICAgeTA6IE1hdGgubWF4KFlfTUlOLCBsbyAtIDEpLFxuICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIGhpICsgMSksXG4gIH07XG4gIC8vIEFuIGV4cGxpY2l0IGVudmVsb3BlIHJlcGxhY2VzIHRoZSBkZXJpdmVkIG9uZS4gQ2FsbGVycyB0aGF0IHBpbiBhbiBleGFjdFxuICAvLyB3b3JrIGVudmVsb3BlIChwYXRoIHByZXBhcmF0aW9uKSBtdXN0IG5vdCBzaWxlbnRseSB3aWRlbiBpdCB3aXRoIHRoZVxuICAvLyBkZWZhdWx0IDEgbSBidWZmZXIuXG4gIGNvbnN0IGVudmVsb3BlID0gbm9ybWFsaXplRW52ZWxvcGUob3B0aW9ucy5lbnZlbG9wZSA/PyBbZGVyaXZlZF0pO1xuICBjb25zdCBzdXJmYWNlRWRpdHMgPSBzdXJmYWNlTWF0ZXJpYWwgPT09IG51bGwgPyAwIDogdGFyZ2V0cy5sZW5ndGg7XG5cbiAgY29uc3QgcGxhbjogUHJlcGFyYXRpb25QbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIHJ1bGVzOiBwcm9wb3NhbC5ydWxlcyxcbiAgICB0YXJnZXRzLFxuICAgIGNsZWFyRW50aXR5SWRzLFxuICAgIHN1cmZhY2VNYXRlcmlhbCxcbiAgICBlbnZlbG9wZSxcbiAgICBleHBlY3RlZDoge1xuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgICAgb2JzdHJ1Y3Rpb25zOiBjbGVhckVudGl0eUlkcy5sZW5ndGgsXG4gICAgICBzdXJmYWNlRWRpdHMsXG4gICAgICB0b3RhbEVkaXRzOiBzdGF0cy5jdXRWb2x1bWUgKyBzdGF0cy5maWxsVm9sdW1lICsgc3VyZmFjZUVkaXRzLFxuICAgIH0sXG4gIH07XG4gIHBsYW4uaWQgPSBgcHJlcDoke3BsYW5EaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIHZhbGlkYXRpb24gfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBhdXRob3JpemF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvbkxpbWl0cyB7XG4gIG1heEN1dFZvbHVtZTogbnVtYmVyO1xuICBtYXhGaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heFZveGVsRWRpdHM6IG51bWJlcjtcbiAgbWF4RW50aXR5UmVtb3ZhbHM6IG51bWJlcjtcbiAgbWF4VGFyZ2V0czogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9MSU1JVFM6IEF1dGhvcml6YXRpb25MaW1pdHMgPSB7XG4gIG1heEN1dFZvbHVtZTogMjU2LFxuICBtYXhGaWxsVm9sdW1lOiAyNTYsXG4gIG1heFZveGVsRWRpdHM6IDEwMjQsXG4gIG1heEVudGl0eVJlbW92YWxzOiAxNixcbiAgbWF4VGFyZ2V0czogNTEyLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBXb3JrQXV0aG9yaXphdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgYmFzZVJldmlzaW9uOiBudW1iZXI7XG4gIGxpbWl0czogQXV0aG9yaXphdGlvbkxpbWl0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uRGVjaXNpb24ge1xuICBvazogYm9vbGVhbjtcbiAgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb24gfCBudWxsO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uUG9saWN5IHtcbiAgLyoqIFRoZSBvbmx5IHJlZ2lvbnMgdGhpcyBnb3Zlcm5vciBwZXJtaXRzIGZvciB0aGUgZmlyc3Qgc2xpY2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBsaW1pdHM/OiBQYXJ0aWFsPEF1dGhvcml6YXRpb25MaW1pdHM+O1xufVxuXG5mdW5jdGlvbiByZWdpb25Db250YWluZWQocmVnaW9uOiBWb3hlbFJlZ2lvbiwgcG9saWN5OiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogYm9vbGVhbiB7XG4gIHJldHVybiBwb2xpY3kuc29tZSgocCkgPT4gcmVnaW9uLngwID49IHAueDAgJiYgcmVnaW9uLngxIDw9IHAueDFcbiAgICAmJiByZWdpb24uejAgPj0gcC56MCAmJiByZWdpb24uejEgPD0gcC56MVxuICAgICYmIHJlZ2lvbi55MCA+PSBwLnkwICYmIHJlZ2lvbi55MSA8PSBwLnkxKTtcbn1cblxuLyoqXG4gKiBMb2NhbCBnb3Zlcm5vciBzdHViLiBJdCBlbmZvcmNlcyBhIGZpeGVkIGVudmVsb3BlIGFuZCBoYXJkIHZvbHVtZSBsaW1pdHMsXG4gKiBiaW5kcyBhIHRva2VuIHRvIHRoZSBleGFjdCBwbGFuIGRpZ2VzdCBhbmQgd29ybGQgcmV2aXNpb24sIGFuZCByZWZ1c2VzIHRvXG4gKiBwcmV0ZW5kIGl0IGlzIGFuIG9uLWNoYWluIGF1dGhvcml0eS5cbiAqL1xuZXhwb3J0IGNsYXNzIExvY2FsQXV0aG9yaXplciB7XG4gIHJlYWRvbmx5IGF1dGhvcml0eSA9IExPQ0FMX0FVVEhPUklUWTtcbiAgcmVhZG9ubHkgZW5mb3JjZW1lbnQgPSBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcmVhZG9ubHkgbGltaXRzOiBBdXRob3JpemF0aW9uTGltaXRzO1xuXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHBvbGljeTogQXV0aG9yaXphdGlvblBvbGljeSkge1xuICAgIHRoaXMubGltaXRzID0geyAuLi5ERUZBVUxUX0xJTUlUUywgLi4uKHBvbGljeS5saW1pdHMgPz8ge30pIH07XG4gIH1cblxuICBhdXRob3JpemUod29ybGQ6IFdvcmxkLCBwbGFuOiBQcmVwYXJhdGlvblBsYW4pOiBBdXRob3JpemF0aW9uRGVjaXNpb24ge1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocGxhbi5yZWN0KTtcblxuICAgIGlmIChwbGFuLnRhcmdldHMubGVuZ3RoICE9PSByZWN0Q29sdW1ucyhyZWN0KSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFuIGhhcyAke3BsYW4udGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZm9yICR7cmVjdENvbHVtbnMocmVjdCl9IGNvbHVtbnNgKTtcbiAgICB9XG4gICAgaWYgKHBsYW4udGFyZ2V0cy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhUYXJnZXRzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi50YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhUYXJnZXRzfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC5jdXRWb2x1bWUgPiB0aGlzLmxpbWl0cy5tYXhDdXRWb2x1bWUpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgY3V0ICR7cGxhbi5leHBlY3RlZC5jdXRWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhDdXRWb2x1bWV9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLmZpbGxWb2x1bWUgPiB0aGlzLmxpbWl0cy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgICByZWFzb25zLnB1c2goYGZpbGwgJHtwbGFuLmV4cGVjdGVkLmZpbGxWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhGaWxsVm9sdW1lfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC50b3RhbEVkaXRzID4gdGhpcy5saW1pdHMubWF4Vm94ZWxFZGl0cykge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFubmVkIGVkaXRzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heFZveGVsRWRpdHN9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCA+IHRoaXMubGltaXRzLm1heEVudGl0eVJlbW92YWxzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGh9IHJlbW92YWxzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heEVudGl0eVJlbW92YWxzfWApO1xuICAgIH1cbiAgICBpZiAobmV3IFNldChwbGFuLmNsZWFyRW50aXR5SWRzKS5zaXplICE9PSBwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdkdXBsaWNhdGUgZW50aXR5IHJlbW92YWwgaWRzJyk7XG4gICAgfVxuXG4gICAgaWYgKHBsYW4uZW52ZWxvcGUubGVuZ3RoID09PSAwKSB7XG4gICAgICByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIHdvcmsgZW52ZWxvcGUnKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCByZWdpb24gb2YgcGxhbi5lbnZlbG9wZSkge1xuICAgICAgaWYgKCFyZWdpb25Db250YWluZWQocmVnaW9uLCB0aGlzLnBvbGljeS5lbnZlbG9wZSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBlbnZlbG9wZSAke3JlZ2lvbi54MH0sJHtyZWdpb24uejB9LCR7cmVnaW9uLnkwfS4uJHtyZWdpb24ueDF9LCR7cmVnaW9uLnoxfSwke3JlZ2lvbi55MX0gaXMgb3V0c2lkZSB0aGUgbG9jYWwgcG9saWN5YCk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIHtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhwbGFuLmVudmVsb3BlLCB0LngsIHQueSwgdC56KVxuICAgICAgICB8fCAodC55ID4gWV9NSU4gJiYgIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgdC54LCB0LnkgLSAxLCB0LnopKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYHRhcmdldCAke3QueH0sJHt0Lnp9LCR7dC55fSBpcyBub3QgY292ZXJlZCBieSB0aGUgd29yayBlbnZlbG9wZWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEV2ZXJ5IG9ic3RydWN0aW9uIGN1cnJlbnRseSBvbiB0aGUgZm9vdHByaW50IG11c3QgYmUgaW4gdGhlIHBsYW4sIGFuZFxuICAgIC8vIHRoZSBwbGFuIG1heSBub3QgcmVtb3ZlIGFueXRoaW5nIHRoYXQgaXMgbm90IGFuIG9ic3RydWN0aW9uIHRoZXJlLlxuICAgIGNvbnN0IGN1cnJlbnQgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCkubWFwKChvKSA9PiBvLmVudGl0eUlkKS5zb3J0KCk7XG4gICAgY29uc3QgcGxhbm5lZCA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gICAgaWYgKGN1cnJlbnQubGVuZ3RoICE9PSBwbGFubmVkLmxlbmd0aCB8fCBjdXJyZW50LnNvbWUoKGlkLCBpKSA9PiBpZCAhPT0gcGxhbm5lZFtpXSkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbiByZW1vdmFscyBbJHtwbGFubmVkLmpvaW4oJywnKX1dIGRvIG5vdCBtYXRjaCBmb290cHJpbnQgb2JzdHJ1Y3Rpb25zIFske2N1cnJlbnQuam9pbignLCcpfV1gKTtcbiAgICB9XG5cbiAgICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4geyBvazogZmFsc2UsIGF1dGhvcml6YXRpb246IG51bGwsIHJlYXNvbnMgfTtcblxuICAgIGNvbnN0IHRva2VuOiBXb3JrQXV0aG9yaXphdGlvbiA9IHtcbiAgICAgIGlkOiBgbG9jYWwtc3R1Yjoke3BsYW5EaWdlc3QocGxhbil9YCxcbiAgICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgICAgcGxhbkRpZ2VzdDogcGxhbkRpZ2VzdChwbGFuKSxcbiAgICAgIGVudmVsb3BlOiBub3JtYWxpemVFbnZlbG9wZShwbGFuLmVudmVsb3BlKSxcbiAgICAgIGJhc2VSZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgICBsaW1pdHM6IHsgLi4udGhpcy5saW1pdHMgfSxcbiAgICB9O1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBhdXRob3JpemF0aW9uOiB0b2tlbiwgcmVhc29uczogW10gfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIGV4ZWN1dGlvbiAtLS0tLS0tLS0tXG5pbnRlcmZhY2UgUGVuZGluZ0VkaXQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBiZWZvcmU6IE1hdElkO1xuICBhZnRlcjogTWF0SWQ7XG4gIC8qKiBUcnVlIGZvciBhIG1hdGVyaWFsLW9ubHkgdG9wLXN1cmZhY2UgY2hhbmdlLiAqL1xuICBzdXJmYWNlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgY2h1bms6IHN0cmluZztcbiAgY2hhbmdlZDogbnVtYmVyO1xuICBhZGRlZDogbnVtYmVyO1xuICByZW1vdmVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2xlYXJlZEVudGl0eSB7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsO1xuICBhbW91bnQ6IG51bWJlcjtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbkxlZGdlciB7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgYXV0aG9yaXphdGlvbklkOiBzdHJpbmc7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBuZXRTcG9pbDogbnVtYmVyO1xuICBib3Jyb3dlZEZpbGw6IG51bWJlcjtcbiAgY3V0QnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgZmlsbEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIHZveGVsRWRpdHM6IG51bWJlcjtcbiAgc3VyZmFjZUVkaXRzOiBudW1iZXI7XG4gIGVudGl0aWVzQ2xlYXJlZDogQ2xlYXJlZEVudGl0eVtdO1xuICByZXNvdXJjZXNHYWluZWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGludmVudG9yeUJlZm9yZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaW52ZW50b3J5QWZ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGNodW5rRGVsdGFzOiBDaHVua0RlbHRhW107XG4gIHJldmlzaW9uQmVmb3JlOiBudW1iZXI7XG4gIHJldmlzaW9uQWZ0ZXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogUHJlcGFyYXRpb25QbGFuO1xuICBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbjtcbiAgbGVkZ2VyOiBQcmVwYXJhdGlvbkxlZGdlcjtcbn1cblxuZXhwb3J0IHR5cGUgUHJlcGFyYXRpb25PdXRjb21lID0gUHJlcGFyYXRpb25TdWNjZXNzIHwgUHJlcGFyYXRpb25GYWlsdXJlO1xuXG5jb25zdCBNQVRFUklBTF9OQU1FUzogUmVjb3JkPG51bWJlciwgc3RyaW5nPiA9IHtcbiAgW01BVC5HUkFTU106ICdncmFzcycsXG4gIFtNQVQuU09JTF06ICdzb2lsJyxcbiAgW01BVC5TQU5EXTogJ3NhbmQnLFxuICBbTUFULkdSQVZFTF06ICdncmF2ZWwnLFxuICBbTUFULlNUT05FXTogJ3N0b25lJyxcbiAgW01BVC5PUkVdOiAnb3JlJyxcbiAgW01BVC5XQVRFUl06ICd3YXRlcicsXG4gIFtNQVQuQkVEUk9DS106ICdiZWRyb2NrJyxcbiAgW01BVC5NT1NTXTogJ21vc3MnLFxufTtcblxuZnVuY3Rpb24gbWF0ZXJpYWxOYW1lKG06IE1hdElkKTogc3RyaW5nIHtcbiAgcmV0dXJuIE1BVEVSSUFMX05BTUVTW21dID8/IGBtYXRfJHttfWA7XG59XG5cbmZ1bmN0aW9uIGZpbGxNYXRlcmlhbCh5OiBudW1iZXIsIHRhcmdldDogbnVtYmVyKTogTWF0SWQge1xuICByZXR1cm4geSA9PT0gdGFyZ2V0IC0gMSA/IE1BVC5HUkFTUyA6IE1BVC5TT0lMO1xufVxuXG5mdW5jdGlvbiBmYWlsKHN0YWdlOiBQcmVwYXJhdGlvbkZhaWx1cmVbJ3N0YWdlJ10sIGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBQcmVwYXJhdGlvbkZhaWx1cmUge1xuICByZXR1cm4geyBvazogZmFsc2UsIHN0YWdlLCBjb2RlLCByZWFzb25zIH07XG59XG5cbi8qKlxuICogQXBwbHkgYW4gYXV0aG9yaXplZCBwbGFuLiBObyB2b3hlbCBpcyB3cml0dGVuIHVudGlsIGV2ZXJ5IGVkaXQgYW5kIHJlbW92YWxcbiAqIGhhcyBiZWVuIGNoZWNrZWQgYWdhaW5zdCB0aGUgdG9rZW4sIHRoZSBwbGFuIGVudmVsb3BlIGFuZCB0aGUgaGFyZCBsaW1pdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleGVjdXRlUHJlcGFyYXRpb24oXG4gIHdvcmxkOiBXb3JsZCwgcGxhbjogUHJlcGFyYXRpb25QbGFuLCBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbixcbik6IFByZXBhcmF0aW9uT3V0Y29tZSB7XG4gIGlmIChhdXRob3JpemF0aW9uLmF1dGhvcml0eSAhPT0gTE9DQUxfQVVUSE9SSVRZXG4gICAgfHwgYXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudCAhPT0gTE9DQUxfRU5GT1JDRU1FTlQpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bnN1cHBvcnRlZF9hdXRob3JpdHknLCBbXG4gICAgICBgYXV0aG9yaXR5ICR7YXV0aG9yaXphdGlvbi5hdXRob3JpdHl9LyR7YXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudH0gaXMgbm90IHRoZSBsb2NhbCBzdHViYCxcbiAgICBdKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0ICE9PSBwbGFuRGlnZXN0KHBsYW4pKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZGlnZXN0X21pc21hdGNoJywgWydhdXRob3JpemF0aW9uIGRvZXMgbm90IG1hdGNoIHRoaXMgcGxhbiddKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb24gIT09IHdvcmxkLnJldmlzaW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnc3RhbGVfYXV0aG9yaXphdGlvbicsIFtcbiAgICAgIGBhdXRob3JpemF0aW9uIHdhcyBpc3N1ZWQgYXQgcmV2aXNpb24gJHthdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbn0sIHdvcmxkIGlzIGF0ICR7d29ybGQucmV2aXNpb259YCxcbiAgICBdKTtcbiAgfVxuICBpZiAocGxhbi5lbnZlbG9wZS5zb21lKChyKSA9PiAhcmVnaW9uQ29udGFpbmVkKHIsIGF1dGhvcml6YXRpb24uZW52ZWxvcGUpKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2VudmVsb3BlX21pc21hdGNoJywgWydwbGFuIGVudmVsb3BlIGlzIHdpZGVyIHRoYW4gdGhlIGF1dGhvcml6YXRpb24nXSk7XG4gIH1cblxuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwbGFuLnJlY3QpO1xuICBjb25zdCBlZGl0czogUGVuZGluZ0VkaXRbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIGlmICh0LnkgPCBzdXJmYWNlKSB7XG4gICAgICBmb3IgKGxldCB5ID0gdC55OyB5IDwgc3VyZmFjZTsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHksIHQueik7XG4gICAgICAgIGlmIChpc1NvbGlkKGJlZm9yZSkpIGVkaXRzLnB1c2goeyB4OiB0LngsIHksIHo6IHQueiwgYmVmb3JlLCBhZnRlcjogTUFULkFJUiB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHQueSA+IHN1cmZhY2UpIHtcbiAgICAgIGZvciAobGV0IHkgPSBzdXJmYWNlOyB5IDwgdC55OyB5KyspIHtcbiAgICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgeSwgdC56KTtcbiAgICAgICAgaWYgKCFpc1NvbGlkKGJlZm9yZSkpIHtcbiAgICAgICAgICBjb25zdCBhZnRlciA9IHBsYW4uc3VyZmFjZU1hdGVyaWFsICE9PSBudWxsICYmIHkgPT09IHQueSAtIDFcbiAgICAgICAgICAgID8gcGxhbi5zdXJmYWNlTWF0ZXJpYWxcbiAgICAgICAgICAgIDogZmlsbE1hdGVyaWFsKHksIHQueSk7XG4gICAgICAgICAgZWRpdHMucHVzaCh7IHg6IHQueCwgeSwgejogdC56LCBiZWZvcmUsIGFmdGVyIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIE1hdGVyaWFsLW9ubHkgc3VyZmFjZSBjaGFuZ2UgZm9yIGN1dCBvciBhbHJlYWR5LWxldmVsIGNvbHVtbnMuIEZpbGxcbiAgICAvLyBjb2x1bW5zIGFscmVhZHkgcmVjZWl2ZSB0aGUgc3VyZmFjZSBtYXRlcmlhbCBpbiB0aGUgZmlsbCBsb29wIGFib3ZlLlxuICAgIGlmIChwbGFuLnN1cmZhY2VNYXRlcmlhbCAhPT0gbnVsbCkge1xuICAgICAgY29uc3QgdG9wWSA9IHQueSAtIDE7XG4gICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB0b3BZLCB0LnopO1xuICAgICAgaWYgKGlzU29saWQoYmVmb3JlKSAmJiBiZWZvcmUgIT09IHBsYW4uc3VyZmFjZU1hdGVyaWFsKSB7XG4gICAgICAgIGVkaXRzLnB1c2goe1xuICAgICAgICAgIHg6IHQueCwgeTogdG9wWSwgejogdC56LCBiZWZvcmUsIGFmdGVyOiBwbGFuLnN1cmZhY2VNYXRlcmlhbCwgc3VyZmFjZTogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgZXZlcnkgZWRpdCBiZWZvcmUgbXV0YXRpbmcgYW55dGhpbmcuXG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgZSBvZiBlZGl0cykge1xuICAgIGlmIChlLnggPCByZWN0LngwIHx8IGUueCA+IHJlY3QueDEgfHwgZS56IDwgcmVjdC56MCB8fCBlLnogPiByZWN0LnoxKSB7XG4gICAgICByZWFzb25zLnB1c2goYGVkaXQgJHtlLnh9LCR7ZS55fSwke2Uuen0gaXMgb3V0c2lkZSB0aGUgZm9vdHByaW50YCk7XG4gICAgfVxuICAgIGlmICghZW52ZWxvcGVDb250YWlucyhhdXRob3JpemF0aW9uLmVudmVsb3BlLCBlLngsIGUueSwgZS56KSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBlZGl0ICR7ZS54fSwke2UueX0sJHtlLnp9IGlzIG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgZW52ZWxvcGVgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgY3V0Vm9sdW1lID0gZWRpdHMuZmlsdGVyKChlKSA9PiBlLmFmdGVyID09PSBNQVQuQUlSICYmIGlzU29saWQoZS5iZWZvcmUpKS5sZW5ndGg7XG4gIGNvbnN0IGZpbGxWb2x1bWUgPSBlZGl0cy5maWx0ZXIoKGUpID0+IGUuYWZ0ZXIgIT09IE1BVC5BSVIgJiYgIWlzU29saWQoZS5iZWZvcmUpKS5sZW5ndGg7XG4gIGlmIChjdXRWb2x1bWUgPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCAke2N1dFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEN1dFZvbHVtZX1gKTtcbiAgfVxuICBpZiAoZmlsbFZvbHVtZSA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgJHtmaWxsVm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4RmlsbFZvbHVtZX1gKTtcbiAgfVxuICBpZiAoZWRpdHMubGVuZ3RoID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4Vm94ZWxFZGl0cykge1xuICAgIHJlYXNvbnMucHVzaChgJHtlZGl0cy5sZW5ndGh9IGVkaXRzIGV4Y2VlZCBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heFZveGVsRWRpdHN9YCk7XG4gIH1cblxuICBjb25zdCBjdXJyZW50ID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpLm1hcCgobykgPT4gby5lbnRpdHlJZCkuc29ydCgpO1xuICBjb25zdCBwbGFubmVkID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgaWYgKGN1cnJlbnQubGVuZ3RoICE9PSBwbGFubmVkLmxlbmd0aCB8fCBjdXJyZW50LnNvbWUoKGlkLCBpKSA9PiBpZCAhPT0gcGxhbm5lZFtpXSkpIHtcbiAgICByZWFzb25zLnB1c2goJ2Zvb3RwcmludCBvYnN0cnVjdGlvbnMgY2hhbmdlZCBhZnRlciBhdXRob3JpemF0aW9uJyk7XG4gIH1cbiAgaWYgKHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHMpIHtcbiAgICByZWFzb25zLnB1c2goYCR7cGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGh9IHJlbW92YWxzIGV4Y2VlZCBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEVudGl0eVJlbW92YWxzfWApO1xuICB9XG4gIGZvciAoY29uc3QgaWQgb2YgcGxhbi5jbGVhckVudGl0eUlkcykge1xuICAgIGlmICghd29ybGQuZW50aXRpZXMuaGFzKGlkKSkgcmVhc29ucy5wdXNoKGBlbnRpdHkgJHtpZH0gbm8gbG9uZ2VyIGV4aXN0c2ApO1xuICB9XG4gIGlmICh3b3JsZC5saWZlKSB7XG4gICAgbGV0IHJlY292ZXJlZCA9IDA7XG4gICAgZm9yIChjb25zdCBpZCBvZiBwbGFuLmNsZWFyRW50aXR5SWRzKSB7XG4gICAgICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgaWYgKGVudGl0eT8ucmVzb3VyY2UgJiYgZW50aXR5LnJlbWFpbmluZyA+IDApIHJlY292ZXJlZCArPSBlbnRpdHkucmVtYWluaW5nO1xuICAgIH1cbiAgICAvLyBDaGVjayBiZWZvcmUgYW55IHZveGVsIG9yIGVudGl0eSBjaGFuZ2VzLCBwcmVzZXJ2aW5nIGxlZ2FjeSB1bmJvdW5kZWRcbiAgICAvLyBjb25zdHJ1Y3Rpb24gYmVoYXZpb3IgYW5kIHNjaGVtYS0zIGNhcnJpZWQtY2FwYWNpdHkgY29uc2VydmF0aW9uLlxuICAgIGlmIChPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIGFtb3VudCkgPT4gc3VtICsgYW1vdW50LCAwKSArIHJlY292ZXJlZCA+IDEyMCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdyZXNvdXJjZXMgcmVjb3ZlcmVkIGR1cmluZyBzaXRlIGNsZWFyaW5nIHdvdWxkIGV4Y2VlZCBjYXJyaWVkIGNhcGFjaXR5IDEyMCcpO1xuICAgIH1cbiAgfVxuICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bmF1dGhvcml6ZWRfZWRpdHMnLCByZWFzb25zKTtcblxuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IHJldmlzaW9uQmVmb3JlID0gd29ybGQucmV2aXNpb247XG4gIGNvbnN0IGNodW5rRGVsdGFzID0gbmV3IE1hcDxzdHJpbmcsIENodW5rRGVsdGE+KCk7XG4gIGNvbnN0IGN1dEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgY29uc3QgZmlsbEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgbGV0IGFwcGxpZWQgPSAwO1xuICBsZXQgc3VyZmFjZUVkaXRzID0gMDtcblxuICBmb3IgKGNvbnN0IGUgb2YgZWRpdHMpIHtcbiAgICBpZiAoIXNldFZveGVsKHdvcmxkLCBlLngsIGUueSwgZS56LCBlLmFmdGVyKSkgY29udGludWU7XG4gICAgYXBwbGllZCsrO1xuICAgIGlmIChlLnN1cmZhY2UpIHN1cmZhY2VFZGl0cysrO1xuICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KHdvcmxkVG9DaHVua1goZS54KSwgd29ybGRUb0NodW5rWihlLnopKTtcbiAgICBsZXQgZGVsdGEgPSBjaHVua0RlbHRhcy5nZXQoa2V5KTtcbiAgICBpZiAoIWRlbHRhKSB7XG4gICAgICBkZWx0YSA9IHsgY2h1bms6IGtleSwgY2hhbmdlZDogMCwgYWRkZWQ6IDAsIHJlbW92ZWQ6IDAgfTtcbiAgICAgIGNodW5rRGVsdGFzLnNldChrZXksIGRlbHRhKTtcbiAgICB9XG4gICAgZGVsdGEuY2hhbmdlZCsrO1xuICAgIGNvbnN0IHdhc1NvbGlkID0gaXNTb2xpZChlLmJlZm9yZSk7XG4gICAgY29uc3QgaXNOb3dTb2xpZCA9IGlzU29saWQoZS5hZnRlcik7XG4gICAgaWYgKCF3YXNTb2xpZCAmJiBpc05vd1NvbGlkKSBkZWx0YS5hZGRlZCsrO1xuICAgIGlmICh3YXNTb2xpZCAmJiAhaXNOb3dTb2xpZCkgZGVsdGEucmVtb3ZlZCsrO1xuICAgIGNvbnN0IG5hbWUgPSBtYXRlcmlhbE5hbWUoZS5iZWZvcmUpO1xuICAgIGlmICh3YXNTb2xpZCAmJiAhaXNOb3dTb2xpZCkgY3V0QnlNYXRlcmlhbFtuYW1lXSA9IChjdXRCeU1hdGVyaWFsW25hbWVdID8/IDApICsgMTtcbiAgICBpZiAoIXdhc1NvbGlkICYmIGlzTm93U29saWQpIGZpbGxCeU1hdGVyaWFsW21hdGVyaWFsTmFtZShlLmFmdGVyKV0gPSAoZmlsbEJ5TWF0ZXJpYWxbbWF0ZXJpYWxOYW1lKGUuYWZ0ZXIpXSA/PyAwKSArIDE7XG4gIH1cblxuICBjb25zdCBlbnRpdGllc0NsZWFyZWQ6IENsZWFyZWRFbnRpdHlbXSA9IFtdO1xuICBjb25zdCByZXNvdXJjZXNHYWluZWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7fTtcbiAgZm9yIChjb25zdCBpZCBvZiBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKCFlKSBjb250aW51ZTtcbiAgICBjb25zdCBhbW91bnQgPSBlLnJlc291cmNlICYmIGUucmVtYWluaW5nID4gMCA/IGUucmVtYWluaW5nIDogMDtcbiAgICBpZiAoZS5yZXNvdXJjZSAmJiBhbW91bnQgPiAwKSB7XG4gICAgICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgICAgcmVzb3VyY2VzR2FpbmVkW2UucmVzb3VyY2VdID0gKHJlc291cmNlc0dhaW5lZFtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgICB9XG4gICAgcmVtb3ZlRW50aXR5KHdvcmxkLCBpZCk7XG4gICAgZW50aXRpZXNDbGVhcmVkLnB1c2goe1xuICAgICAgZW50aXR5SWQ6IGlkLCBraW5kOiBlLmtpbmQsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQsIHg6IGUueCwgeTogZS55LCB6OiBlLnosXG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBjdXQgPSBhcHBsaWVkID4gMCA/IE9iamVjdC52YWx1ZXMoY3V0QnlNYXRlcmlhbCkucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgOiAwO1xuICBjb25zdCBmaWxsID0gYXBwbGllZCA+IDAgPyBPYmplY3QudmFsdWVzKGZpbGxCeU1hdGVyaWFsKS5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSA6IDA7XG4gIGNvbnN0IGxlZGdlcjogUHJlcGFyYXRpb25MZWRnZXIgPSB7XG4gICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgIGF1dGhvcml6YXRpb25JZDogYXV0aG9yaXphdGlvbi5pZCxcbiAgICBwbGFuRGlnZXN0OiBhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QsXG4gICAgc2l0ZUlkOiBwbGFuLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcGxhbi5mbG9vclksXG4gICAgY3V0Vm9sdW1lOiBjdXQsXG4gICAgZmlsbFZvbHVtZTogZmlsbCxcbiAgICBuZXRTcG9pbDogY3V0IC0gZmlsbCxcbiAgICBib3Jyb3dlZEZpbGw6IE1hdGgubWF4KDAsIGZpbGwgLSBjdXQpLFxuICAgIGN1dEJ5TWF0ZXJpYWwsXG4gICAgZmlsbEJ5TWF0ZXJpYWwsXG4gICAgdm94ZWxFZGl0czogYXBwbGllZCxcbiAgICBzdXJmYWNlRWRpdHMsXG4gICAgZW50aXRpZXNDbGVhcmVkLFxuICAgIHJlc291cmNlc0dhaW5lZCxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICBjaHVua0RlbHRhczogWy4uLmNodW5rRGVsdGFzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykpLFxuICAgIHJldmlzaW9uQmVmb3JlLFxuICAgIHJldmlzaW9uQWZ0ZXI6IHdvcmxkLnJldmlzaW9uLFxuICB9O1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiwgYXV0aG9yaXphdGlvbiwgbGVkZ2VyIH07XG59XG5cbi8qKlxuICogVGhlIHNoYXJlZCBwbGF5ZXIvQUkgZW50cnkgcG9pbnQuIFRoZXJlIGlzIG5vIG90aGVyIGNvbnN0cnVjdGlvbiBwYXRoLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJlcGFyZVNpdGUoXG4gIHdvcmxkOiBXb3JsZCxcbiAgYXV0aG9yaXplcjogTG9jYWxBdXRob3JpemVyLFxuICBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLFxuICBvcHRpb25zOiBQcmVwYXJhdGlvbk9wdGlvbnMgPSB7fSxcbik6IFByZXBhcmF0aW9uT3V0Y29tZSB7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUHJlcGFyYXRpb24od29ybGQsIHByb3Bvc2FsLCBvcHRpb25zKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgY29uc3QgZGVjaXNpb24gPSBhdXRob3JpemVyLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgaWYgKCFkZWNpc2lvbi5vayB8fCAhZGVjaXNpb24uYXV0aG9yaXphdGlvbikge1xuICAgIHJldHVybiBmYWlsKCdhdXRob3JpemUnLCAnbm90X2F1dGhvcml6ZWQnLCBkZWNpc2lvbi5yZWFzb25zKTtcbiAgfVxuICByZXR1cm4gZXhlY3V0ZVByZXBhcmF0aW9uKHdvcmxkLCBwbGFubmVkLnBsYW4sIGRlY2lzaW9uLmF1dGhvcml6YXRpb24pO1xufVxuIiwgIi8vIE0wMDIgc3RhZ2UgNDogYXV0aG9yaXRhdGl2ZSBob3VzZSwgcGF0aCBhbmQgdGVycmFjZSBzdHJ1Y3R1cmVzLlxuLy9cbi8vIFN0cnVjdHVyZXMgYXJlIHNpbXVsYXRpb24gcmVjb3Jkcywgbm90IHJlbmRlcmVyLW9ubHkgbWVzaGVzLiBBIHN0cnVjdHVyZSBpc1xuLy8gcGxhbm5lZCBmcm9tIHRoZSBwcmVwYXJlZCB0ZXJyYWluLCBhdXRob3JpemVkIGFnYWluc3QgdGhlIHNhbWUgbG9jYWwgcG9saWN5XG4vLyBlbnZlbG9wZSBhcyB0ZXJyYWluIHByZXBhcmF0aW9uLCBwYWlkIGZvciBmcm9tIGludmVudG9yeSwgYW5kIHRoZW4gc3RvcmVkIGluXG4vLyBXb3JsZC5zdHJ1Y3R1cmVzLiBUaGUgcmVuZGVyZXIgcmVhZHMgdGhvc2UgcmVjb3JkczsgaXQgbmV2ZXIgaW52ZW50cyBhXG4vLyBidWlsZGluZyB0aGF0IHRoZSBzaW11bGF0aW9uIGRvZXMgbm90IG93bi5cbmltcG9ydCB7XG4gIFdvcmxkLCBSZXNvdXJjZVR5cGUsIE1BVCwgc3VyZmFjZUF0LCBnZXRWb3hlbCxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBSZWN0LCBWb3hlbFJlZ2lvbiwgbm9ybWFsaXplUmVjdCwgZXhwYW5kUmVjdCxcbiAgZW52ZWxvcGVDb250YWlucywgb2JzdHJ1Y3Rpb25zSW4sXG59IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQge1xuICBBdXRob3JpemF0aW9uUG9saWN5LCBMT0NBTF9BVVRIT1JJVFksIExPQ0FMX0VORk9SQ0VNRU5ULFxufSBmcm9tICcuL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7IEZBUk1fUlVMRVMgfSBmcm9tICcuL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQgeyBpbnZlbnRvcnlTbmFwc2hvdCB9IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IHR5cGUgU3RydWN0dXJlS2luZCA9ICdob3VzZScgfCAncGF0aCcgfCAndGVycmFjZSc7XG4vKiogTTAwMiBkZXNpZ24gMSBpcyBpbW11dGFibGUgcmVwbGF5IGNvbnRlbnQ7IGRlc2lnbiAyIGlzIHRoZSBmb3VuZGVyIGNhbmRpZGF0ZS4gKi9cbmV4cG9ydCBjb25zdCBGT1VOREVSX0RFU0lHTl9WRVJTSU9OID0gMiBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIFN0cnVjdHVyZURlc2lnblZlcnNpb24gPSB0eXBlb2YgRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcblxuZXhwb3J0IHR5cGUgTW9kdWxlS2luZCA9XG4gIHwgJ2Zsb29yJ1xuICB8ICd3YWxsJ1xuICB8ICdwb3N0J1xuICB8ICdsaW50ZWwnXG4gIHwgJ3Jvb2YnXG4gIHwgJ3BhcmFwZXQnXG4gIHwgJ3dpbmRvdydcbiAgfCAnZG9vcidcbiAgfCAndGhyZXNob2xkJ1xuICB8ICdwYXRoJ1xuICB8ICdjdXJiJ1xuICB8ICdzb2lsX2JlZCdcbiAgfCAncmV0YWluaW5nX3dhbGwnXG4gIHwgJ2Nyb3Bfcm93JztcblxuZXhwb3J0IHR5cGUgTW9kdWxlVG9uZSA9XG4gIHwgJ3N0b25lJ1xuICB8ICdzdG9uZV9iJ1xuICB8ICdvY2hyZSdcbiAgfCAndGltYmVyJ1xuICB8ICdhY2NlbnQnXG4gIHwgJ3NvaWwnXG4gIHwgJ2Nyb3AnXG4gIHwgJ2dyYXZlbCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlTW9kdWxlIHtcbiAga2luZDogTW9kdWxlS2luZDtcbiAgLyoqIENlbnRyZSBpbiB3b3JsZCB4L3osIGJvdHRvbSBpbiB3b3JsZCB5LiAqL1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICB3OiBudW1iZXI7XG4gIGg6IG51bWJlcjtcbiAgZDogbnVtYmVyO1xuICByb3Q/OiBudW1iZXI7XG4gIHRvbmU/OiBNb2R1bGVUb25lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIHNpdGVJZDogc3RyaW5nO1xuICAvKiogT3JpZ2luOiBjZW50cmUgb2YgdGhlIHByZXBhcmVkIGZvb3RwcmludCBhdCBmbG9vciBoZWlnaHQuICovXG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXTtcbiAgY29zdDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgYnVpbHRSZXZpc2lvbjogbnVtYmVyO1xuICAvKiogQWJzZW50IG1lYW5zIGxlZ2FjeSBNMDAyIGRlc2lnbiAxOyBuZXZlciBpbmZlciBpdCBmcm9tIHRoZSByZW5kZXJlci4gKi9cbiAgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb247XG4gIHByb3Zpc2lvbmFsOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRlcnJhY2VCYW5kIHtcbiAgejA6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVByb3Bvc2FsIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICAvKiogUmVxdWlyZWQgZm9yIGhvdXNlczogdm94ZWwgY29sdW1uIG9mIHRoZSBkb29yIG9uIHRoZSBlYXN0IHdhbGwuICovXG4gIGRvb3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIC8qKiBPcHRpb25hbCBwYXRoIG1ldGFkYXRhOyB0aGUgcGF0aCBpcyBsYWlkIGFsb25nIHRoZSByZWN0IGNlbnRyZWxpbmUuICovXG4gIGFwcHJvYWNoPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICB0ZXJyYWNlcz86IG51bWJlcjtcbiAgLyoqIERlbGliZXJhdGUgY29udGVudCBzZWxlY3Rpb24gY2FycmllZCBieSBzY2hlbWEtMiBjb21tYW5kcy4gKi9cbiAgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb247XG59XG5cbi8qKlxuICogU2luZ2xlIHNvdXJjZSBvZiB0cnV0aCBmb3Igc3RydWN0dXJlIGNvc3RzLiBUaGUgcGxhbm5lcnMgYW5kIHRoZSBidWlsZCBVSVxuICogYm90aCByZWFkIHRoZXNlOyBhIGJ1aWxkaW5nIGNhbm5vdCBhZHZlcnRpc2Ugb25lIHByaWNlIGFuZCBjaGFyZ2UgYW5vdGhlci5cbiAqL1xuZXhwb3J0IGNvbnN0IEhPVVNFX0NPU1Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7IHdvb2Q6IDEwLCBzdG9uZTogMTggfTtcbmV4cG9ydCBjb25zdCBURVJSQUNFX0NPU1Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7IHdvb2Q6IDYsIHN0b25lOiAxMiB9O1xuXG4vKiogQSBwYXRoIHBheXMgb25lIHN0b25lIHBlciBtZXRyZSBvZiBjb3JyaWRvciB3aWR0aC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXRoQ29zdCh3aWR0aDogbnVtYmVyKTogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiB7XG4gIHJldHVybiB7IHN0b25lOiB3aWR0aCB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVBsYW4ge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIG9yaWdpbjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHJvdDogbnVtYmVyO1xuICBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXTtcbiAgY29zdDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIC8qKiBFeHBlY3RlZCBwcmVwYXJlZCBzdXJmYWNlLCBjaGVja2VkIGFnYWluIGF0IGV4ZWN1dGlvbiB0aW1lLiAqL1xuICBzdXJmYWNlOiBTdXJmYWNlU2FtcGxlW107XG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uO1xuICB0ZXJyYWNlcz86IFRlcnJhY2VCYW5kW107XG59XG5cbi8vIC0tLS0tLS0tLS0gc3RhYmxlIGRpZ2VzdCAtLS0tLS0tLS0tXG5mdW5jdGlvbiBkaWdlc3QoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBhID0gMHg4MTFjOWRjNTtcbiAgbGV0IGIgPSAweDllMzc3OWI5O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYyA9IGlucHV0LmNoYXJDb2RlQXQoaSk7XG4gICAgYSA9IE1hdGguaW11bChhIF4gYywgMHgwMTAwMDE5Myk7XG4gICAgYiA9IE1hdGguaW11bChiIF4gKGMgKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgYiBePSBiID4+PiAxMztcbiAgfVxuICByZXR1cm4gKGEgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpXG4gICAgKyAoYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdHJ1Y3R1cmVEaWdlc3QocGxhbjogU3RydWN0dXJlUGxhbik6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtcbiAgICAnbTAwMjpzdHJ1Y3R1cmUtcGxhbjp2MScsXG4gICAgcGxhbi5raW5kLFxuICAgIHBsYW4uc2l0ZUlkLFxuICAgIGAke3BsYW4ucmVjdC54MH0sJHtwbGFuLnJlY3QuejB9LCR7cGxhbi5yZWN0LngxfSwke3BsYW4ucmVjdC56MX1gLFxuICAgIFN0cmluZyhwbGFuLmZsb29yWSksXG4gICAgYCR7cGxhbi5vcmlnaW4ueH0sJHtwbGFuLm9yaWdpbi55fSwke3BsYW4ub3JpZ2luLnp9YCxcbiAgICBTdHJpbmcocGxhbi5yb3QpLFxuICAgIC4uLihwbGFuLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gPyBbJ2Rlc2lnbjoyJ10gOiBbXSksXG4gICAgYG06JHtwbGFuLm1vZHVsZXMubGVuZ3RofWAsXG4gIF07XG4gIGZvciAoY29uc3QgbSBvZiBwbGFuLm1vZHVsZXMpIHtcbiAgICBsaW5lcy5wdXNoKGBtOiR7bS5raW5kfSwke20ueH0sJHttLnl9LCR7bS56fSwke20ud30sJHttLmh9LCR7bS5kfSwke20ucm90ID8/IDB9LCR7bS50b25lID8/ICcnfWApO1xuICB9XG4gIGNvbnN0IGNvc3RLZXlzID0gT2JqZWN0LmtleXMocGxhbi5jb3N0KS5zb3J0KCk7XG4gIGxpbmVzLnB1c2goYGNvc3Q6JHtjb3N0S2V5cy5sZW5ndGh9YCk7XG4gIGZvciAoY29uc3Qga2V5IG9mIGNvc3RLZXlzKSBsaW5lcy5wdXNoKGBjb3N0OiR7a2V5fSwke3BsYW4uY29zdFtrZXkgYXMgUmVzb3VyY2VUeXBlXSA/PyAwfWApO1xuICBmb3IgKGNvbnN0IHMgb2YgcGxhbi5zdXJmYWNlKSBsaW5lcy5wdXNoKGBzOiR7cy54fSwke3Muen0sJHtzLnl9YCk7XG4gIGZvciAoY29uc3QgdCBvZiBwbGFuLnRlcnJhY2VzID8/IFtdKSBsaW5lcy5wdXNoKGB0OiR7dC56MH0sJHt0LnoxfSwke3QueX1gKTtcbiAgcmV0dXJuIGRpZ2VzdChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGxhbm5pbmcgaGVscGVycyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZUZhaWx1cmUge1xuICBvazogZmFsc2U7XG4gIHN0YWdlOiAncGxhbicgfCAnYXV0aG9yaXplJyB8ICdleGVjdXRlJztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVQbGFuU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBTdHJ1Y3R1cmVQbGFuO1xufVxuXG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVQbGFuUmVzdWx0ID0gU3RydWN0dXJlUGxhblN1Y2Nlc3MgfCBTdHJ1Y3R1cmVGYWlsdXJlO1xuXG5mdW5jdGlvbiBmYWlsKHN0YWdlOiBTdHJ1Y3R1cmVGYWlsdXJlWydzdGFnZSddLCBjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogU3RydWN0dXJlRmFpbHVyZSB7XG4gIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhZ2UsIGNvZGUsIHJlYXNvbnMgfTtcbn1cblxuZnVuY3Rpb24gc3VyZmFjZU1pc21hdGNoZXMod29ybGQ6IFdvcmxkLCBzYW1wbGVzOiByZWFkb25seSBTdXJmYWNlU2FtcGxlW10pIHtcbiAgY29uc3Qgb3V0OiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyOyBleHBlY3RlZDogbnVtYmVyOyBhY3R1YWw6IG51bWJlciB9PiA9IFtdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc2FtcGxlcykge1xuICAgIGNvbnN0IGFjdHVhbCA9IHN1cmZhY2VBdCh3b3JsZCwgcy54LCBzLnopO1xuICAgIGlmIChhY3R1YWwgIT09IHMueSkgb3V0LnB1c2goeyB4OiBzLngsIHo6IHMueiwgZXhwZWN0ZWQ6IHMueSwgYWN0dWFsIH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGZvb3RwcmludFN1cmZhY2Uod29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0LCB5OiBudW1iZXIpOiBTdXJmYWNlU2FtcGxlW10ge1xuICBjb25zdCBvdXQ6IFN1cmZhY2VTYW1wbGVbXSA9IFtdO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIG91dC5wdXNoKHsgeCwgeiwgeSB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBmb290cHJpbnRFbnZlbG9wZShyZWN0OiBSZWN0LCB5MDogbnVtYmVyLCB5MTogbnVtYmVyLCBtYXJnaW4gPSAxKTogVm94ZWxSZWdpb25bXSB7XG4gIGNvbnN0IHIgPSBleHBhbmRSZWN0KHJlY3QsIG1hcmdpbik7XG4gIHJldHVybiBbeyAuLi5yLCB5MCwgeTEgfV07XG59XG5cbmZ1bmN0aW9uIG1vZHVsZUJvdW5kcyhtOiBTdHJ1Y3R1cmVNb2R1bGUpOiB7IHgwOiBudW1iZXI7IHgxOiBudW1iZXI7IHkwOiBudW1iZXI7IHkxOiBudW1iZXI7IHowOiBudW1iZXI7IHoxOiBudW1iZXIgfSB7XG4gIGNvbnN0IHIgPSBNYXRoLmh5cG90KG0udywgbS5kKSAvIDI7XG4gIGNvbnN0IGhhbGZXID0gKG0ucm90ID8/IDApID09PSAwID8gbS53IC8gMiA6IHI7XG4gIGNvbnN0IGhhbGZEID0gKG0ucm90ID8/IDApID09PSAwID8gbS5kIC8gMiA6IHI7XG4gIHJldHVybiB7XG4gICAgeDA6IG0ueCAtIGhhbGZXLCB4MTogbS54ICsgaGFsZlcsXG4gICAgeTA6IG0ueSwgeTE6IG0ueSArIG0uaCxcbiAgICB6MDogbS56IC0gaGFsZkQsIHoxOiBtLnogKyBoYWxmRCxcbiAgfTtcbn1cblxuZnVuY3Rpb24gbW9kdWxlSW5zaWRlRW52ZWxvcGUobTogU3RydWN0dXJlTW9kdWxlLCBlbnZlbG9wZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IGJvb2xlYW4ge1xuICBjb25zdCBiID0gbW9kdWxlQm91bmRzKG0pO1xuICByZXR1cm4gZW52ZWxvcGUuc29tZSgoZSkgPT4gYi54MCA+PSBlLngwIC0gMWUtNiAmJiBiLngxIDw9IGUueDEgKyAxICsgMWUtNlxuICAgICYmIGIueTAgPj0gZS55MCAtIDFlLTYgJiYgYi55MSA8PSBlLnkxICsgMSArIDFlLTZcbiAgICAmJiBiLnowID49IGUuejAgLSAxZS02ICYmIGIuejEgPD0gZS56MSArIDEgKyAxZS02KTtcbn1cblxuZnVuY3Rpb24gY29zdFRvdGFsKGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4pOiBudW1iZXIge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyhjb3N0KS5yZWR1Y2UoKGEsIGIpID0+IGEgKyAoYiA/PyAwKSwgMCk7XG59XG5cbmZ1bmN0aW9uIG1lZGlhbih2YWx1ZXM6IG51bWJlcltdKTogbnVtYmVyIHtcbiAgY29uc3Qgc29ydGVkID0gWy4uLnZhbHVlc10uc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuICByZXR1cm4gc29ydGVkW01hdGguZmxvb3Ioc29ydGVkLmxlbmd0aCAvIDIpXTtcbn1cblxuLy8gLS0tLS0tLS0tLSBob3VzZSAtLS0tLS0tLS0tXG5mdW5jdGlvbiBwbGFuSG91c2Uod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHdpZHRoID0gcmVjdC54MSAtIHJlY3QueDAgKyAxO1xuICBjb25zdCBkZXB0aCA9IHJlY3QuejEgLSByZWN0LnowICsgMTtcbiAgaWYgKHdpZHRoICE9PSA4IHx8IGRlcHRoICE9PSA2KSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnZm9vdHByaW50X21pc21hdGNoJywgW2Bob3VzZSBuZWVkcyA4IHggNiBtLCBnb3QgJHt3aWR0aH0geCAke2RlcHRofSBtYF0pO1xuICB9XG4gIGlmICghcHJvcG9zYWwuZG9vcikge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ21pc3NpbmdfZG9vcicsIFsnaG91c2UgcGxhbiBuZWVkcyBhIGRvb3IgY29sdW1uJ10pO1xuICB9XG4gIGlmIChwcm9wb3NhbC5kb29yLnogPCByZWN0LnowIHx8IHByb3Bvc2FsLmRvb3IueiA+IHJlY3QuejEpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdkb29yX291dHNpZGUnLCBbYGRvb3IgeiAke3Byb3Bvc2FsLmRvb3Iuen0gaXMgb3V0c2lkZSAke3JlY3QuejB9Li4ke3JlY3QuejF9YF0pO1xuICB9XG5cbiAgY29uc3Qgc3VyZmFjZSA9IGZvb3RwcmludFN1cmZhY2Uod29ybGQsIHJlY3QsIHByb3Bvc2FsLmZsb29yWSk7XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX25vdF9wcmVwYXJlZCcsIG1pc21hdGNoZXMuc2xpY2UoMCwgNCkubWFwKFxuICAgICAgKG0pID0+IGBjb2x1bW4gJHttLnh9LCR7bS56fSBpcyBhdCAke20uYWN0dWFsfSwgZXhwZWN0ZWQgJHttLmV4cGVjdGVkfWAsXG4gICAgKSk7XG4gIH1cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX29ic3RydWN0ZWQnLCBvYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSk7XG4gIH1cblxuICBjb25zdCBmbG9vclkgPSBwcm9wb3NhbC5mbG9vclk7XG4gIGNvbnN0IHgwID0gcmVjdC54MCwgeDEgPSByZWN0LngxICsgMTtcbiAgY29uc3QgejAgPSByZWN0LnowLCB6MSA9IHJlY3QuejEgKyAxO1xuICBjb25zdCBjeCA9ICh4MCArIHgxKSAvIDI7XG4gIGNvbnN0IGN6ID0gKHowICsgejEpIC8gMjtcbiAgY29uc3QgZG9vclogPSBwcm9wb3NhbC5kb29yLnogKyAwLjU7XG4gIGNvbnN0IGRvb3JIYWxmID0gMC42O1xuICBjb25zdCB3YWxsSCA9IDMuMDtcbiAgY29uc3Qgd2FsbFQgPSAwLjU7XG4gIGNvbnN0IGRvb3JIID0gMi4yO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuXG4gIC8vIEZsb29yIHNsYWIgYW5kIHJvb2YgcGxhdGUuXG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdmbG9vcicsIHg6IGN4LCB5OiBmbG9vclksIHo6IGN6LCB3OiA4LjAsIGg6IDAuMywgZDogNi4wLCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdyb29mJywgeDogY3gsIHk6IGZsb29yWSArIHdhbGxILCB6OiBjeiwgdzogOC40LCBoOiAwLjMsIGQ6IDYuNCwgdG9uZTogJ3N0b25lJyB9KTtcblxuICAvLyBOb3J0aCBhbmQgc291dGggd2FsbHMuXG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICd3YWxsJywgeDogY3gsIHk6IGZsb29yWSwgejogejAgKyB3YWxsVCAvIDIsIHc6IDguMCwgaDogd2FsbEgsIGQ6IHdhbGxULCB0b25lOiAnc3RvbmUnIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnd2FsbCcsIHg6IGN4LCB5OiBmbG9vclksIHo6IHoxIC0gd2FsbFQgLyAyLCB3OiA4LjAsIGg6IHdhbGxILCBkOiB3YWxsVCwgdG9uZTogJ3N0b25lJyB9KTtcblxuICAvLyBXZXN0IHdhbGwuXG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICd3YWxsJywgeDogeDAgKyB3YWxsVCAvIDIsIHk6IGZsb29yWSwgejogY3osIHc6IHdhbGxULCBoOiB3YWxsSCwgZDogNi4wLCB0b25lOiAnc3RvbmUnIH0pO1xuXG4gIC8vIEVhc3Qgd2FsbCB3aXRoIGEgcmVhbCBkb29yd2F5IGdhcC5cbiAgY29uc3QgZWFzdFggPSB4MSAtIHdhbGxUIC8gMjtcbiAgY29uc3QgZ2FwMCA9IGRvb3JaIC0gZG9vckhhbGY7XG4gIGNvbnN0IGdhcDEgPSBkb29yWiArIGRvb3JIYWxmO1xuICBjb25zdCBsZWZ0TGVuID0gZ2FwMCAtIHowO1xuICBjb25zdCByaWdodExlbiA9IHoxIC0gZ2FwMTtcbiAgaWYgKGxlZnRMZW4gPiAwLjA1KSB7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICd3YWxsJywgeDogZWFzdFgsIHk6IGZsb29yWSwgejogejAgKyBsZWZ0TGVuIC8gMixcbiAgICAgIHc6IHdhbGxULCBoOiB3YWxsSCwgZDogbGVmdExlbiwgdG9uZTogJ3N0b25lJyxcbiAgICB9KTtcbiAgfVxuICBpZiAocmlnaHRMZW4gPiAwLjA1KSB7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICd3YWxsJywgeDogZWFzdFgsIHk6IGZsb29yWSwgejogZ2FwMSArIHJpZ2h0TGVuIC8gMixcbiAgICAgIHc6IHdhbGxULCBoOiB3YWxsSCwgZDogcmlnaHRMZW4sIHRvbmU6ICdzdG9uZScsXG4gICAgfSk7XG4gIH1cbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAnbGludGVsJywgeDogZWFzdFgsIHk6IGZsb29yWSArIGRvb3JILCB6OiBkb29yWixcbiAgICB3OiB3YWxsVCwgaDogd2FsbEggLSBkb29ySCwgZDogZG9vckhhbGYgKiAyLCB0b25lOiAnc3RvbmVfYicsXG4gIH0pO1xuICBtb2R1bGVzLnB1c2goe1xuICAgIGtpbmQ6ICdkb29yJywgeDogZWFzdFgsIHk6IGZsb29yWSwgejogZ2FwMCxcbiAgICB3OiAwLjE4LCBoOiBkb29ySCwgZDogMC4xNiwgdG9uZTogJ3RpbWJlcicsXG4gIH0pO1xuICBtb2R1bGVzLnB1c2goe1xuICAgIGtpbmQ6ICdkb29yJywgeDogZWFzdFgsIHk6IGZsb29yWSwgejogZ2FwMSxcbiAgICB3OiAwLjE4LCBoOiBkb29ySCwgZDogMC4xNiwgdG9uZTogJ3RpbWJlcicsXG4gIH0pO1xuICBtb2R1bGVzLnB1c2goe1xuICAgIGtpbmQ6ICd0aHJlc2hvbGQnLCB4OiB4MSArIDAuMzUsIHk6IGZsb29yWSwgejogZG9vclosXG4gICAgdzogMC45LCBoOiAwLjE2LCBkOiAxLjMsIHRvbmU6ICdvY2hyZScsXG4gIH0pO1xuXG4gIC8vIFR3byB3aW5kb3dzIG9uIHRoZSBzb3V0aCB3YWxsLCBzbGlnaHRseSBwcm91ZCBvZiB0aGUgb3V0ZXIgZmFjZS5cbiAgZm9yIChjb25zdCB3eCBvZiBbY3ggLSAyLjIsIGN4ICsgMi4yXSkge1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnd2luZG93JywgeDogd3gsIHk6IGZsb29yWSArIDEuNDUsIHo6IHoxIC0gMC4wMixcbiAgICAgIHc6IDEuMCwgaDogMS4wLCBkOiAwLjA4LCB0b25lOiAnYWNjZW50JyxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFBhcmFwZXQgYXJvdW5kIHRoZSBmbGF0IE5veGVsIHJvb2YuXG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3gsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiAtIDMuMDUsIHc6IDguNCwgaDogMC40LCBkOiAwLjMsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6ICsgMy4wNSwgdzogOC40LCBoOiAwLjQsIGQ6IDAuMywgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4IC0gNC4wNSwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6LCB3OiAwLjMsIGg6IDAuNCwgZDogNi40LCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3ggKyA0LjA1LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3osIHc6IDAuMywgaDogMC40LCBkOiA2LjQsIHRvbmU6ICdzdG9uZV9iJyB9KTtcblxuICBjb25zdCBwbGFuOiBTdHJ1Y3R1cmVQbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBraW5kOiAnaG91c2UnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZLFxuICAgIG9yaWdpbjogeyB4OiBjeCwgeTogZmxvb3JZLCB6OiBjeiB9LFxuICAgIHJvdDogMCxcbiAgICBtb2R1bGVzLFxuICAgIGNvc3Q6IHsgLi4uSE9VU0VfQ09TVCB9LFxuICAgIGVudmVsb3BlOiBmb290cHJpbnRFbnZlbG9wZShyZWN0LCBmbG9vclksIGZsb29yWSArIDQsIDIpLFxuICAgIHN1cmZhY2UsXG4gIH07XG4gIHBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gcGF0aCAtLS0tLS0tLS0tXG5mdW5jdGlvbiBwbGFuUGF0aCh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3Qgd2lkdGggPSByZWN0LngxIC0gcmVjdC54MCArIDE7XG4gIGNvbnN0IGRlcHRoID0gcmVjdC56MSAtIHJlY3QuejAgKyAxO1xuICBpZiAoZGVwdGggIT09IDMgfHwgd2lkdGggPCAzKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnZm9vdHByaW50X21pc21hdGNoJywgW2BwYXRoIG5lZWRzIGEgMyBtIHdpZGUgY29ycmlkb3IsIGdvdCAke3dpZHRofSB4ICR7ZGVwdGh9IG1gXSk7XG4gIH1cblxuICBjb25zdCBjZW50ZXJaID0gcmVjdC56MCArIDE7XG4gIGNvbnN0IHN1cmZhY2U6IFN1cmZhY2VTYW1wbGVbXSA9IFtdO1xuICBjb25zdCBoZWlnaHRzOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCBjZW50ZXJaKTtcbiAgICBoZWlnaHRzLnB1c2goeSk7XG4gICAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSBzdXJmYWNlLnB1c2goeyB4LCB6LCB5IH0pO1xuICB9XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX25vdF9wcmVwYXJlZCcsIG1pc21hdGNoZXMuc2xpY2UoMCwgNCkubWFwKFxuICAgICAgKG0pID0+IGBjb2x1bW4gJHttLnh9LCR7bS56fSBpcyBhdCAke20uYWN0dWFsfSwgZXhwZWN0ZWQgJHttLmV4cGVjdGVkfWAsXG4gICAgKSk7XG4gIH1cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBoZWlnaHRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgc3RlcCA9IGhlaWdodHNbaV0gLSBoZWlnaHRzW2kgLSAxXTtcbiAgICBpZiAoTWF0aC5hYnMoc3RlcCkgPiAxKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX3N0ZXAnLCBbYHN0ZXAgJHtzdGVwfSBtIGF0IHg9JHtyZWN0LngwICsgaX1gXSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgcyBvZiBzdXJmYWNlKSB7XG4gICAgY29uc3QgdG9wID0gZ2V0Vm94ZWwod29ybGQsIHMueCwgcy55IC0gMSwgcy56KTtcbiAgICBpZiAodG9wID09PSBNQVQuV0FURVIpIHtcbiAgICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfd2V0JywgW2Bjb2x1bW4gJHtzLnh9LCR7cy56fSBpcyB3ZXRgXSk7XG4gICAgfVxuICAgIGlmICh0b3AgIT09IE1BVC5HUkFWRUwpIHtcbiAgICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfc3VyZmFjZScsIFtcbiAgICAgICAgYGNvbHVtbiAke3MueH0sJHtzLnp9IHRvcCBpcyAke3RvcH0sIGV4cGVjdGVkIGdyYXZlbGAsXG4gICAgICBdKTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX29ic3RydWN0ZWQnLCBvYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSk7XG4gIH1cblxuICBjb25zdCBjeiA9IGNlbnRlclogKyAwLjU7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG4gIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIGNlbnRlclopO1xuICAgIGNvbnN0IG14ID0geCArIDAuNTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGF0aCcsIHg6IG14LCB5LCB6OiBjeiwgdzogMS4wLCBoOiAwLjEyLCBkOiAzLjAsIHRvbmU6ICdncmF2ZWwnIH0pO1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdjdXJiJywgeDogbXgsIHksIHo6IHJlY3QuejAgKyAwLjA3NSwgdzogMS4wLCBoOiAwLjIyLCBkOiAwLjE1LCB0b25lOiAnc3RvbmVfYicgfSk7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2N1cmInLCB4OiBteCwgeSwgejogcmVjdC56MSArIDEgLSAwLjA3NSwgdzogMS4wLCBoOiAwLjIyLCBkOiAwLjE1LCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIH1cblxuICBjb25zdCBtaW5ZID0gTWF0aC5taW4oLi4uaGVpZ2h0cyk7XG4gIGNvbnN0IG1heFkgPSBNYXRoLm1heCguLi5oZWlnaHRzKTtcbiAgY29uc3QgcGxhbjogU3RydWN0dXJlUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAga2luZDogJ3BhdGgnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgb3JpZ2luOiB7IHg6IChyZWN0LngwICsgcmVjdC54MSArIDEpIC8gMiwgeTogbWluWSwgejogY3ogfSxcbiAgICByb3Q6IDAsXG4gICAgbW9kdWxlcyxcbiAgICBjb3N0OiBwYXRoQ29zdCh3aWR0aCksXG4gICAgZW52ZWxvcGU6IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIG1pblkgLSAxLCBtYXhZICsgMiwgMCksXG4gICAgc3VyZmFjZSxcbiAgfTtcbiAgcGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4gfTtcbn1cblxuLy8gLS0tLS0tLS0tLSB0ZXJyYWNlcyAtLS0tLS0tLS0tXG5mdW5jdGlvbiBwbGFuVGVycmFjZXMod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHdpZHRoID0gcmVjdC54MSAtIHJlY3QueDAgKyAxO1xuICBjb25zdCBkZXB0aCA9IHJlY3QuejEgLSByZWN0LnowICsgMTtcbiAgY29uc3QgY291bnQgPSBwcm9wb3NhbC50ZXJyYWNlcyA/PyAzO1xuICBpZiAod2lkdGggIT09IDEyIHx8IGRlcHRoICE9PSA4KSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnZm9vdHByaW50X21pc21hdGNoJywgW2B0ZXJyYWNlcyBuZWVkIDEyIHggOCBtLCBnb3QgJHt3aWR0aH0geCAke2RlcHRofSBtYF0pO1xuICB9XG4gIGlmIChjb3VudCA8IDIgfHwgY291bnQgPiA0KSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndGVycmFjZV9jb3VudCcsIFtgJHtjb3VudH0gdGVycmFjZXMgaXMgb3V0c2lkZSAyLi40YF0pO1xuICB9XG5cbiAgLy8gU3BsaXQgZGVwdGggaW50byBuZWFyLWVxdWFsIGJhbmRzLCBoaWdoIHNpZGUgZmlyc3QuXG4gIGNvbnN0IGJhc2UgPSBNYXRoLmZsb29yKGRlcHRoIC8gY291bnQpO1xuICBjb25zdCBleHRyYSA9IGRlcHRoICUgY291bnQ7XG4gIGNvbnN0IGJhbmRzOiBUZXJyYWNlQmFuZFtdID0gW107XG4gIGxldCB6ID0gcmVjdC56MDtcbiAgY29uc3QgbWVkaWFuczogbnVtYmVyW10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgY29uc3Qgc2l6ZSA9IGJhc2UgKyAoaSA8IGV4dHJhID8gMSA6IDApO1xuICAgIGNvbnN0IHowID0geiwgejEgPSB6ICsgc2l6ZSAtIDE7XG4gICAgY29uc3QgdmFsdWVzOiBudW1iZXJbXSA9IFtdO1xuICAgIGZvciAobGV0IGJ6ID0gejA7IGJ6IDw9IHoxOyBieisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHZhbHVlcy5wdXNoKHN1cmZhY2VBdCh3b3JsZCwgeCwgYnopKTtcbiAgICB9XG4gICAgbWVkaWFucy5wdXNoKG1lZGlhbih2YWx1ZXMpKTtcbiAgICBiYW5kcy5wdXNoKHsgejAsIHoxLCB5OiAwIH0pO1xuICAgIHogPSB6MSArIDE7XG4gIH1cbiAgLy8gRWFjaCB0ZXJyYWNlIHNpdHMgZXhhY3RseSBvbmUgbWV0cmUgYmVsb3cgdGhlIHByZXZpb3VzIG9uZS5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBiYW5kcy5sZW5ndGg7IGkrKykge1xuICAgIGJhbmRzW2ldLnkgPSBpID09PSAwID8gbWVkaWFuc1swXSA6IE1hdGgubWluKG1lZGlhbnNbaV0sIGJhbmRzW2kgLSAxXS55IC0gMSk7XG4gIH1cblxuICBsZXQgbWF4Q3V0ID0gMCwgbWF4RmlsbCA9IDAsIGN1dFZvbHVtZSA9IDAsIGZpbGxWb2x1bWUgPSAwO1xuICBjb25zdCBzdXJmYWNlOiBTdXJmYWNlU2FtcGxlW10gPSBbXTtcbiAgZm9yIChjb25zdCBiIG9mIGJhbmRzKSB7XG4gICAgZm9yIChsZXQgYnogPSBiLnowOyBieiA8PSBiLnoxOyBieisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICAgICAgY29uc3QgcyA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgYnopO1xuICAgICAgICBzdXJmYWNlLnB1c2goeyB4LCB6OiBieiwgeTogYi55IH0pO1xuICAgICAgICBjb25zdCBkID0gcyAtIGIueTtcbiAgICAgICAgaWYgKGQgPiAwKSB7IGN1dFZvbHVtZSArPSBkOyBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGQpOyB9XG4gICAgICAgIGlmIChkIDwgMCkgeyBmaWxsVm9sdW1lICs9IC1kOyBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgLWQpOyB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChtYXhDdXQgPiBGQVJNX1JVTEVTLm1heEN1dCB8fCBtYXhGaWxsID4gRkFSTV9SVUxFUy5tYXhGaWxsXG4gICAgfHwgY3V0Vm9sdW1lID4gRkFSTV9SVUxFUy5tYXhDdXRWb2x1bWUgfHwgZmlsbFZvbHVtZSA+IEZBUk1fUlVMRVMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3RlcnJhY2VfZWFydGh3b3JrJywgW1xuICAgICAgYGN1dCAke2N1dFZvbHVtZX0gbVx1MDBCMyAvIGZpbGwgJHtmaWxsVm9sdW1lfSBtXHUwMEIzLCBtYXggJHttYXhDdXR9LyR7bWF4RmlsbH0gbWAsXG4gICAgXSk7XG4gIH1cbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBzdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfbm90X3ByZXBhcmVkJywgbWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfb2JzdHJ1Y3RlZCcsIG9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpKTtcbiAgfVxuICBmb3IgKGNvbnN0IHMgb2Ygc3VyZmFjZSkge1xuICAgIGNvbnN0IHRvcCA9IGdldFZveGVsKHdvcmxkLCBzLngsIHMueSAtIDEsIHMueik7XG4gICAgaWYgKHRvcCAhPT0gTUFULlNPSUwpIHtcbiAgICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3RlcnJhY2Vfc3VyZmFjZScsIFtcbiAgICAgICAgYGNvbHVtbiAke3MueH0sJHtzLnp9IHRvcCBpcyAke3RvcH0sIGV4cGVjdGVkIHNvaWxgLFxuICAgICAgXSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY3ggPSAocmVjdC54MCArIHJlY3QueDEgKyAxKSAvIDI7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG4gIGZvciAoY29uc3QgYiBvZiBiYW5kcykge1xuICAgIGNvbnN0IGJ6ID0gKGIuejAgKyBiLnoxICsgMSkgLyAyO1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnc29pbF9iZWQnLCB4OiBjeCwgeTogYi55LCB6OiBieixcbiAgICAgIHc6IHdpZHRoLCBoOiAwLjE4LCBkOiBiLnoxIC0gYi56MCArIDEsIHRvbmU6ICdzb2lsJyxcbiAgICB9KTtcbiAgICAvLyBUaHJlZSBjcm9wIHJvd3MgcGVyIHRlcnJhY2UsIGluc2V0IGZyb20gdGhlIHJldGFpbmluZyB3YWxscy5cbiAgICBjb25zdCByb3dEZXB0aCA9IGIuejEgLSBiLnowICsgMTtcbiAgICBmb3IgKGxldCByID0gMDsgciA8IDM7IHIrKykge1xuICAgICAgY29uc3QgdCA9IChyICsgMSkgLyA0O1xuICAgICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgICAga2luZDogJ2Nyb3Bfcm93JywgeDogY3gsIHk6IGIueSArIDAuMTgsIHo6IGIuejAgKyByb3dEZXB0aCAqIHQsXG4gICAgICAgIHc6IHdpZHRoIC0gMS4yLCBoOiAwLjI4LCBkOiAwLjM2LCB0b25lOiAnY3JvcCcsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBiYW5kcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHVwcGVyID0gYmFuZHNbaSAtIDFdO1xuICAgIGNvbnN0IGxvd2VyID0gYmFuZHNbaV07XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICdyZXRhaW5pbmdfd2FsbCcsIHg6IGN4LCB5OiBsb3dlci55LCB6OiB1cHBlci56MSArIDAuNSxcbiAgICAgIHc6IHdpZHRoLCBoOiB1cHBlci55IC0gbG93ZXIueSwgZDogMC40LCB0b25lOiAnc3RvbmVfYicsXG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBtaW5ZID0gTWF0aC5taW4oLi4uYmFuZHMubWFwKChiKSA9PiBiLnkpKTtcbiAgY29uc3QgbWF4WSA9IE1hdGgubWF4KC4uLmJhbmRzLm1hcCgoYikgPT4gYi55KSk7XG4gIGNvbnN0IHBsYW46IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIGtpbmQ6ICd0ZXJyYWNlJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIG9yaWdpbjogeyB4OiBjeCwgeTogbWluWSwgejogKHJlY3QuejAgKyByZWN0LnoxICsgMSkgLyAyIH0sXG4gICAgcm90OiAwLFxuICAgIG1vZHVsZXMsXG4gICAgY29zdDogeyAuLi5URVJSQUNFX0NPU1QgfSxcbiAgICBlbnZlbG9wZTogZm9vdHByaW50RW52ZWxvcGUocmVjdCwgbWluWSAtIDEsIG1heFkgKyAyLCAxKSxcbiAgICBzdXJmYWNlLFxuICAgIHRlcnJhY2VzOiBiYW5kcyxcbiAgfTtcbiAgcGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4gfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYW5TdHJ1Y3R1cmUod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgaWYgKHByb3Bvc2FsLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIHJldHVybiBwbGFuRm91bmRlckRlc2lnbih3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAocHJvcG9zYWwuZGVzaWduVmVyc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndW5zdXBwb3J0ZWRfZGVzaWduJywgW2B1bnN1cHBvcnRlZCBzdHJ1Y3R1cmUgZGVzaWduICR7U3RyaW5nKHByb3Bvc2FsLmRlc2lnblZlcnNpb24pfWBdKTtcbiAgfVxuICBpZiAocHJvcG9zYWwua2luZCA9PT0gJ2hvdXNlJykgcmV0dXJuIHBsYW5Ib3VzZSh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAocHJvcG9zYWwua2luZCA9PT0gJ3BhdGgnKSByZXR1cm4gcGxhblBhdGgod29ybGQsIHByb3Bvc2FsKTtcbiAgcmV0dXJuIHBsYW5UZXJyYWNlcyh3b3JsZCwgcHJvcG9zYWwpO1xufVxuXG4vLyAtLS0tLS0tLS0tIGRlc2lnbiAyOiBib3VuZGVkIGZvdW5kZXIgY2FuZGlkYXRlIC0tLS0tLS0tLS1cbi8vIFRoaXMgZGVsaWJlcmF0ZWx5IGxlYXZlcyBldmVyeSBsZWdhY3kgcGxhbm5lciBhYm92ZSB1bnRvdWNoZWQuIFRoZSBleHRyYSB3YWxsXG4vLyBwcmltaXRpdmVzIHJlcHJlc2VudCB2b2lkcywgbm90IGRlY29yYXRpdmUgd2luZG93czsgdGhlaXIgYXNzZXQtbGV2ZWwgdm9sdW1lXG4vLyBpbnRlcnByZXRhdGlvbiByZW1haW5zIFJldmlldyBSZXF1aXJlZCAodGhlIGZvdW5kZXIgNFx1MjAxMzkgdm9sdW1lIHRhcmdldCkuXG5mdW5jdGlvbiBwbGFuRm91bmRlckRlc2lnbih3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBpZiAocHJvcG9zYWwua2luZCA9PT0gJ3BhdGgnKSByZXR1cm4gcGxhbkZvdW5kZXJQYXRoKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGNvbnN0IHBsYW5uZWQgPSBwcm9wb3NhbC5raW5kID09PSAnaG91c2UnID8gcGxhbkhvdXNlKHdvcmxkLCBwcm9wb3NhbCkgOiBwbGFuVGVycmFjZXMod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICd0ZXJyYWNlJykge1xuICAgIC8vIENyb3Agcm93cyBzdGF5IGNvbXBhY3QgYXV0aG9yaXRhdGl2ZSBhZ2dyZWdhdGVzLiBUaGVpciBmYWNldGVkIGZvbGlhZ2UgaXNcbiAgICAvLyBkZXJpdmVkIHByZXNlbnRhdGlvbiBvbmx5OyBubyBwbGFudC1sZXZlbCBleGlzdGVuY2Ugb3IgeWllbGQgaXMgaW52ZW50ZWQuXG4gICAgcGxhbm5lZC5wbGFuLmRlc2lnblZlcnNpb24gPSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuICAgIHBsYW5uZWQucGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbm5lZC5wbGFuKX1gO1xuICAgIHJldHVybiBwbGFubmVkO1xuICB9XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB4MCA9IHJlY3QueDAsIHgxID0gcmVjdC54MSArIDE7XG4gIGNvbnN0IHowID0gcmVjdC56MCwgejEgPSByZWN0LnoxICsgMTtcbiAgY29uc3QgeSA9IHByb3Bvc2FsLmZsb29yWSwgY3ggPSAoeDAgKyB4MSkgLyAyLCBjeiA9ICh6MCArIHoxKSAvIDI7XG4gIGNvbnN0IHQgPSAwLjYsIGggPSAzLjI7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG4gIC8vIE9uZSBzdHJ1Y3R1cmFsIHN0b25lIGZhbWlseTogbGlnaHRpbmcsIG5vdCBwYWludGVkIGZhY2UgdmFyaWF0aW9uLCBzaGFkZXMgaXQuXG4gIGNvbnN0IHdhbGwgPSAoeDogbnVtYmVyLCBib3R0b206IG51bWJlciwgejogbnVtYmVyLCB3OiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBkOiBudW1iZXIsIGtpbmQ6IFN0cnVjdHVyZU1vZHVsZVsna2luZCddID0gJ3dhbGwnKSA9PiB7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZCwgeCwgeTogYm90dG9tLCB6LCB3LCBoOiBoZWlnaHQsIGQsIHRvbmU6ICdzdG9uZScgfSk7XG4gIH07XG4gIHdhbGwoY3gsIHkgLSAwLjQsIGN6LCA4LCAwLjQsIDYsICdmbG9vcicpO1xuICB3YWxsKGN4LCB5LCB6MCArIHQgLyAyLCA4LCBoLCB0KTtcbiAgY29uc3QgaW5uZXJaMCA9IHowICsgdCwgaW5uZXJaMSA9IHoxIC0gdDtcbiAgd2FsbCh4MCArIHQgLyAyLCB5LCAoaW5uZXJaMCArIGlubmVyWjEpIC8gMiwgdCwgaCwgaW5uZXJaMSAtIGlubmVyWjApO1xuICBjb25zdCBkb29yWiA9IChwcm9wb3NhbC5kb29yPy56ID8/IHJlY3QuejApICsgMC41O1xuICBjb25zdCBkb29yMCA9IGRvb3JaIC0gMC42LCBkb29yMSA9IGRvb3JaICsgMC42O1xuICBjb25zdCBlYXN0WCA9IHgxIC0gdCAvIDI7XG4gIHdhbGwoZWFzdFgsIHksIChpbm5lclowICsgZG9vcjApIC8gMiwgdCwgaCwgZG9vcjAgLSBpbm5lclowKTtcbiAgd2FsbChlYXN0WCwgeSwgKGRvb3IxICsgaW5uZXJaMSkgLyAyLCB0LCBoLCBpbm5lcloxIC0gZG9vcjEpO1xuICB3YWxsKGVhc3RYLCB5ICsgMi4yLCBkb29yWiwgdCwgMC40LCAxLjIsICdsaW50ZWwnKTtcbiAgd2FsbChlYXN0WCwgeSArIDIuNiwgZG9vclosIHQsIDAuNiwgMS4yKTtcbiAgY29uc3Qgc291dGhaID0gejEgLSB0IC8gMjtcbiAgZm9yIChjb25zdCBbYSwgYl0gb2YgW1t4MCArIHQsIGN4IC0gMi42XSwgW2N4IC0gMS40LCBjeCArIDEuNF0sIFtjeCArIDIuNiwgeDEgLSB0XV0pIHtcbiAgICB3YWxsKChhICsgYikgLyAyLCB5LCBzb3V0aFosIGIgLSBhLCBoLCB0KTtcbiAgfVxuICBmb3IgKGNvbnN0IHd4IG9mIFtjeCAtIDIsIGN4ICsgMl0pIHtcbiAgICB3YWxsKHd4LCB5LCBzb3V0aFosIDEuMiwgMSwgdCk7XG4gICAgd2FsbCh3eCwgeSArIDIuNCwgc291dGhaLCAxLjIsIDAuOCwgdCwgJ2xpbnRlbCcpO1xuICB9XG4gIHdhbGwoY3gsIHkgKyBoLCBjeiwgOCwgMC40LCA2LCAncm9vZicpO1xuICB3YWxsKGN4LCB5ICsgaCArIDAuNCwgejAgKyAwLjE1LCA4LCAwLjMsIDAuMywgJ3BhcmFwZXQnKTtcbiAgd2FsbChjeCwgeSArIGggKyAwLjQsIHoxIC0gMC4xNSwgOCwgMC4zLCAwLjMsICdwYXJhcGV0Jyk7XG4gIHdhbGwoY3ggLSAzLjg1LCB5ICsgaCArIDAuNCwgY3osIDAuMywgMC4zLCA1LjQsICdwYXJhcGV0Jyk7XG4gIHdhbGwoY3ggKyAzLjg1LCB5ICsgaCArIDAuNCwgY3osIDAuMywgMC4zLCA1LjQsICdwYXJhcGV0Jyk7XG4gIHBsYW5uZWQucGxhbi5tb2R1bGVzID0gbW9kdWxlcztcbiAgcGxhbm5lZC5wbGFuLmRlc2lnblZlcnNpb24gPSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuICBwbGFubmVkLnBsYW4uZW52ZWxvcGUgPSBmb290cHJpbnRFbnZlbG9wZShyZWN0LCB5IC0gMSwgeSArIDQsIDIpO1xuICBwbGFubmVkLnBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW5uZWQucGxhbil9YDtcbiAgcmV0dXJuIHBsYW5uZWQ7XG59XG5cbmZ1bmN0aW9uIHBsYW5Gb3VuZGVyUGF0aCh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCBwbGFubmVkID0gcGxhblBhdGgod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgY29uc3QgaGVpZ2h0cyA9IHBsYW5uZWQucGxhbi5tb2R1bGVzLmZpbHRlcigobSkgPT4gbS5raW5kID09PSAncGF0aCcpLm1hcCgobSkgPT4gbS55KTtcbiAgY29uc3QgejAgPSBwbGFubmVkLnBsYW4ucmVjdC56MCwgejEgPSBwbGFubmVkLnBsYW4ucmVjdC56MSArIDE7XG4gIGxldCBzdGFydCA9IDA7XG4gIGZvciAobGV0IGVuZCA9IDE7IGVuZCA8PSBoZWlnaHRzLmxlbmd0aDsgZW5kKyspIHtcbiAgICBpZiAoZW5kIDwgaGVpZ2h0cy5sZW5ndGggJiYgaGVpZ2h0c1tlbmRdID09PSBoZWlnaHRzW3N0YXJ0XSkgY29udGludWU7XG4gICAgY29uc3QgeCA9IHBsYW5uZWQucGxhbi5yZWN0LngwICsgc3RhcnQsIHdpZHRoID0gZW5kIC0gc3RhcnQ7XG4gICAgY29uc3QgY3ggPSB4ICsgd2lkdGggLyAyLCB5ID0gaGVpZ2h0c1tzdGFydF07XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhdGgnLCB4OiBjeCwgeSwgejogKHowICsgejEpIC8gMiwgdzogd2lkdGgsIGg6IDAuMTIsIGQ6IDMsIHRvbmU6ICdncmF2ZWwnIH0pO1xuICAgIGZvciAoY29uc3QgeiBvZiBbejAgKyAwLjA3NSwgejEgLSAwLjA3NV0pIHtcbiAgICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdjdXJiJywgeDogY3gsIHksIHosIHc6IHdpZHRoLCBoOiAwLjIyLCBkOiAwLjE1LCB0b25lOiAnc3RvbmUnIH0pO1xuICAgIH1cbiAgICBzdGFydCA9IGVuZDtcbiAgfVxuICBwbGFubmVkLnBsYW4ubW9kdWxlcyA9IG1vZHVsZXM7XG4gIHBsYW5uZWQucGxhbi5kZXNpZ25WZXJzaW9uID0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbiAgcGxhbm5lZC5wbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFubmVkLnBsYW4pfWA7XG4gIHJldHVybiBwbGFubmVkO1xufVxuXG5cbi8vIC0tLS0tLS0tLS0gYXV0aG9yaXphdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZUxpbWl0cyB7XG4gIG1heE1vZHVsZXM6IG51bWJlcjtcbiAgbWF4Q29zdDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TVFJVQ1RVUkVfTElNSVRTOiBTdHJ1Y3R1cmVMaW1pdHMgPSB7XG4gIG1heE1vZHVsZXM6IDY0LFxuICBtYXhDb3N0OiAxMjgsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZUF1dGhvcml6YXRpb24ge1xuICBpZDogc3RyaW5nO1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGJhc2VSZXZpc2lvbjogbnVtYmVyO1xuICBsaW1pdHM6IFN0cnVjdHVyZUxpbWl0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVEZWNpc2lvbiB7XG4gIG9rOiBib29sZWFuO1xuICBhdXRob3JpemF0aW9uOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uIHwgbnVsbDtcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBjbGFzcyBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIge1xuICByZWFkb25seSBhdXRob3JpdHkgPSBMT0NBTF9BVVRIT1JJVFk7XG4gIHJlYWRvbmx5IGVuZm9yY2VtZW50ID0gTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHJlYWRvbmx5IGxpbWl0czogU3RydWN0dXJlTGltaXRzO1xuXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHBvbGljeTogQXV0aG9yaXphdGlvblBvbGljeSwgbGltaXRzOiBQYXJ0aWFsPFN0cnVjdHVyZUxpbWl0cz4gPSB7fSkge1xuICAgIHRoaXMubGltaXRzID0geyAuLi5ERUZBVUxUX1NUUlVDVFVSRV9MSU1JVFMsIC4uLmxpbWl0cyB9O1xuICB9XG5cbiAgYXV0aG9yaXplKHdvcmxkOiBXb3JsZCwgcGxhbjogU3RydWN0dXJlUGxhbik6IFN0cnVjdHVyZURlY2lzaW9uIHtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChwbGFuLm1vZHVsZXMubGVuZ3RoID09PSAwKSByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIG1vZHVsZXMnKTtcbiAgICBpZiAocGxhbi5tb2R1bGVzLmxlbmd0aCA+IHRoaXMubGltaXRzLm1heE1vZHVsZXMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLm1vZHVsZXMubGVuZ3RofSBtb2R1bGVzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heE1vZHVsZXN9YCk7XG4gICAgfVxuICAgIGlmIChjb3N0VG90YWwocGxhbi5jb3N0KSA+IHRoaXMubGltaXRzLm1heENvc3QpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgY29zdCAke2Nvc3RUb3RhbChwbGFuLmNvc3QpfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4Q29zdH1gKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocGxhbi5jb3N0KSkge1xuICAgICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKGFtb3VudCkgfHwgKGFtb3VudCA/PyAwKSA8IDApIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBjb3N0ICR7cmVzb3VyY2V9PSR7YW1vdW50fSBpcyBub3QgYSBub24tbmVnYXRpdmUgaW50ZWdlcmApO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAocGxhbi5lbnZlbG9wZS5sZW5ndGggPT09IDApIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gd29yayBlbnZlbG9wZScpO1xuICAgIGZvciAoY29uc3QgcmVnaW9uIG9mIHBsYW4uZW52ZWxvcGUpIHtcbiAgICAgIGlmICghdGhpcy5wb2xpY3kuZW52ZWxvcGUuc29tZSgocCkgPT4gcmVnaW9uLngwID49IHAueDAgJiYgcmVnaW9uLngxIDw9IHAueDFcbiAgICAgICAgJiYgcmVnaW9uLnowID49IHAuejAgJiYgcmVnaW9uLnoxIDw9IHAuejFcbiAgICAgICAgJiYgcmVnaW9uLnkwID49IHAueTAgJiYgcmVnaW9uLnkxIDw9IHAueTEpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgZW52ZWxvcGUgJHtyZWdpb24ueDB9LCR7cmVnaW9uLnowfSwke3JlZ2lvbi55MH0uLiR7cmVnaW9uLngxfSwke3JlZ2lvbi56MX0sJHtyZWdpb24ueTF9IGlzIG91dHNpZGUgdGhlIGxvY2FsIHBvbGljeWApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IG0gb2YgcGxhbi5tb2R1bGVzKSB7XG4gICAgICBpZiAoIW1vZHVsZUluc2lkZUVudmVsb3BlKG0sIHBsYW4uZW52ZWxvcGUpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgbW9kdWxlICR7bS5raW5kfSBhdCAke20ueH0sJHttLnl9LCR7bS56fSBpcyBvdXRzaWRlIHRoZSBwbGFuIGVudmVsb3BlYCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChwbGFuLnN1cmZhY2UubGVuZ3RoID09PSAwKSByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIHN1cmZhY2Ugc2FtcGxlcycpO1xuICAgIGZvciAoY29uc3QgcyBvZiBwbGFuLnN1cmZhY2UpIHtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhwbGFuLmVudmVsb3BlLCBzLngsIHMueSwgcy56KSkge1xuICAgICAgICByZWFzb25zLnB1c2goYHN1cmZhY2UgJHtzLnh9LCR7cy56fSwke3MueX0gaXMgb3V0c2lkZSB0aGUgcGxhbiBlbnZlbG9wZWApO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4geyBvazogZmFsc2UsIGF1dGhvcml6YXRpb246IG51bGwsIHJlYXNvbnMgfTtcblxuICAgIGNvbnN0IHRva2VuOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uID0ge1xuICAgICAgaWQ6IGBsb2NhbC1zdHViOnN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gLFxuICAgICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgICBwbGFuRGlnZXN0OiBzdHJ1Y3R1cmVEaWdlc3QocGxhbiksXG4gICAgICBlbnZlbG9wZTogcGxhbi5lbnZlbG9wZS5tYXAoKGUpID0+ICh7IC4uLmUgfSkpLFxuICAgICAgYmFzZVJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICAgIGxpbWl0czogeyAuLi50aGlzLmxpbWl0cyB9LFxuICAgIH07XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIGF1dGhvcml6YXRpb246IHRva2VuLCByZWFzb25zOiBbXSB9O1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gZXhlY3V0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlTGVkZ2VyIHtcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBhdXRob3JpemF0aW9uSWQ6IHN0cmluZztcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBzdHJ1Y3R1cmVJZDogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgbW9kdWxlQ291bnQ6IG51bWJlcjtcbiAgY29zdFBhaWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGludmVudG9yeUJlZm9yZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaW52ZW50b3J5QWZ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIHJldmlzaW9uQmVmb3JlOiBudW1iZXI7XG4gIHJldmlzaW9uQWZ0ZXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVTdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFN0cnVjdHVyZVBsYW47XG4gIGF1dGhvcml6YXRpb246IFN0cnVjdHVyZUF1dGhvcml6YXRpb247XG4gIGxlZGdlcjogU3RydWN0dXJlTGVkZ2VyO1xufVxuXG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVPdXRjb21lID0gU3RydWN0dXJlU3VjY2VzcyB8IFN0cnVjdHVyZUZhaWx1cmU7XG5cbmV4cG9ydCBmdW5jdGlvbiBleGVjdXRlU3RydWN0dXJlKFxuICB3b3JsZDogV29ybGQsIHBsYW46IFN0cnVjdHVyZVBsYW4sIGF1dGhvcml6YXRpb246IFN0cnVjdHVyZUF1dGhvcml6YXRpb24sXG4pOiBTdHJ1Y3R1cmVPdXRjb21lIHtcbiAgaWYgKGF1dGhvcml6YXRpb24uYXV0aG9yaXR5ICE9PSBMT0NBTF9BVVRIT1JJVFlcbiAgICB8fCBhdXRob3JpemF0aW9uLmVuZm9yY2VtZW50ICE9PSBMT0NBTF9FTkZPUkNFTUVOVCkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3Vuc3VwcG9ydGVkX2F1dGhvcml0eScsIFtcbiAgICAgIGBhdXRob3JpdHkgJHthdXRob3JpemF0aW9uLmF1dGhvcml0eX0vJHthdXRob3JpemF0aW9uLmVuZm9yY2VtZW50fSBpcyBub3QgdGhlIGxvY2FsIHN0dWJgLFxuICAgIF0pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QgIT09IHN0cnVjdHVyZURpZ2VzdChwbGFuKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2RpZ2VzdF9taXNtYXRjaCcsIFsnYXV0aG9yaXphdGlvbiBkb2VzIG5vdCBtYXRjaCB0aGlzIHN0cnVjdHVyZSBwbGFuJ10pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbiAhPT0gd29ybGQucmV2aXNpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdzdGFsZV9hdXRob3JpemF0aW9uJywgW1xuICAgICAgYGF1dGhvcml6YXRpb24gd2FzIGlzc3VlZCBhdCByZXZpc2lvbiAke2F1dGhvcml6YXRpb24uYmFzZVJldmlzaW9ufSwgd29ybGQgaXMgYXQgJHt3b3JsZC5yZXZpc2lvbn1gLFxuICAgIF0pO1xuICB9XG4gIGlmIChwbGFuLmVudmVsb3BlLnNvbWUoKHIpID0+ICFhdXRob3JpemF0aW9uLmVudmVsb3BlLnNvbWUoKGEpID0+IHIueDAgPj0gYS54MFxuICAgICYmIHIueDEgPD0gYS54MSAmJiByLnowID49IGEuejAgJiYgci56MSA8PSBhLnoxICYmIHIueTAgPj0gYS55MCAmJiByLnkxIDw9IGEueTEpKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2VudmVsb3BlX21pc21hdGNoJywgWydwbGFuIGVudmVsb3BlIGlzIHdpZGVyIHRoYW4gdGhlIGF1dGhvcml6YXRpb24nXSk7XG4gIH1cblxuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IG0gb2YgcGxhbi5tb2R1bGVzKSB7XG4gICAgaWYgKCFtb2R1bGVJbnNpZGVFbnZlbG9wZShtLCBhdXRob3JpemF0aW9uLmVudmVsb3BlKSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBtb2R1bGUgJHttLmtpbmR9IGF0ICR7bS54fSwke20ueX0sJHttLnp9IGlzIG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgZW52ZWxvcGVgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBwbGFuLnN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKC4uLm1pc21hdGNoZXMuc2xpY2UoMCwgNCkubWFwKFxuICAgICAgKG0pID0+IGBjb2x1bW4gJHttLnh9LCR7bS56fSBpcyBhdCAke20uYWN0dWFsfSwgZXhwZWN0ZWQgJHttLmV4cGVjdGVkfWAsXG4gICAgKSk7XG4gIH1cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHBsYW4ucmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJlYXNvbnMucHVzaChgZm9vdHByaW50IGhhcyAke29ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9uc2ApO1xuICB9XG4gIGlmICh3b3JsZC5zdHJ1Y3R1cmVzLmhhcyhwbGFuLmlkKSkge1xuICAgIHJlYXNvbnMucHVzaChgc3RydWN0dXJlICR7cGxhbi5pZH0gYWxyZWFkeSBleGlzdHNgKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhwbGFuLmNvc3QpKSB7XG4gICAgY29uc3QgaGF2ZSA9IHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMDtcbiAgICBpZiAoaGF2ZSA8IChhbW91bnQgPz8gMCkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgbmVlZCAke2Ftb3VudH0gJHtyZXNvdXJjZX0sIGhhdmUgJHtoYXZlfWApO1xuICAgIH1cbiAgfVxuICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bmF1dGhvcml6ZWRfc3RydWN0dXJlJywgcmVhc29ucyk7XG5cbiAgY29uc3QgaW52ZW50b3J5QmVmb3JlID0gaW52ZW50b3J5U25hcHNob3Qod29ybGQpO1xuICBjb25zdCByZXZpc2lvbkJlZm9yZSA9IHdvcmxkLnJldmlzaW9uO1xuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhwbGFuLmNvc3QpKSB7XG4gICAgY29uc3QgbGVmdCA9ICh3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApIC0gKGFtb3VudCA/PyAwKTtcbiAgICBpZiAobGVmdCA+IDApIHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPSBsZWZ0O1xuICAgIGVsc2UgZGVsZXRlIHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV07XG4gIH1cblxuICB3b3JsZC5yZXZpc2lvbisrO1xuICBjb25zdCBzdHJ1Y3R1cmU6IFN0cnVjdHVyZSA9IHtcbiAgICBpZDogcGxhbi5pZCxcbiAgICBraW5kOiBwbGFuLmtpbmQsXG4gICAgc2l0ZUlkOiBwbGFuLnNpdGVJZCxcbiAgICB4OiBwbGFuLm9yaWdpbi54LFxuICAgIHk6IHBsYW4ub3JpZ2luLnksXG4gICAgejogcGxhbi5vcmlnaW4ueixcbiAgICByb3Q6IHBsYW4ucm90LFxuICAgIG1vZHVsZXM6IHBsYW4ubW9kdWxlcy5tYXAoKG0pID0+ICh7IC4uLm0gfSkpLFxuICAgIGNvc3Q6IHsgLi4ucGxhbi5jb3N0IH0sXG4gICAgYnVpbHRSZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgLi4uKHBsYW4uZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTiA/IHsgZGVzaWduVmVyc2lvbjogRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9IDoge30pLFxuICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICB9O1xuICB3b3JsZC5zdHJ1Y3R1cmVzLnNldChzdHJ1Y3R1cmUuaWQsIHN0cnVjdHVyZSk7XG5cbiAgY29uc3QgbGVkZ2VyOiBTdHJ1Y3R1cmVMZWRnZXIgPSB7XG4gICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgIGF1dGhvcml6YXRpb25JZDogYXV0aG9yaXphdGlvbi5pZCxcbiAgICBwbGFuRGlnZXN0OiBhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QsXG4gICAgc3RydWN0dXJlSWQ6IHN0cnVjdHVyZS5pZCxcbiAgICBzaXRlSWQ6IHBsYW4uc2l0ZUlkLFxuICAgIGtpbmQ6IHBsYW4ua2luZCxcbiAgICBtb2R1bGVDb3VudDogc3RydWN0dXJlLm1vZHVsZXMubGVuZ3RoLFxuICAgIGNvc3RQYWlkOiB7IC4uLnBsYW4uY29zdCB9LFxuICAgIGludmVudG9yeUJlZm9yZSxcbiAgICBpbnZlbnRvcnlBZnRlcjogaW52ZW50b3J5U25hcHNob3Qod29ybGQpLFxuICAgIHJldmlzaW9uQmVmb3JlLFxuICAgIHJldmlzaW9uQWZ0ZXI6IHdvcmxkLnJldmlzaW9uLFxuICB9O1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiwgYXV0aG9yaXphdGlvbiwgbGVkZ2VyIH07XG59XG5cbi8qKlxuICogVGhlIHNoYXJlZCBwbGF5ZXIvQUkgc3RydWN0dXJlIGVudHJ5IHBvaW50LiBUZXJyYWluIG11c3QgYWxyZWFkeSBiZSBwcmVwYXJlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkU3RydWN0dXJlKFxuICB3b3JsZDogV29ybGQsXG4gIGF1dGhvcml6ZXI6IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcixcbiAgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsLFxuKTogU3RydWN0dXJlT3V0Y29tZSB7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuU3RydWN0dXJlKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGNvbnN0IGRlY2lzaW9uID0gYXV0aG9yaXplci5hdXRob3JpemUod29ybGQsIHBsYW5uZWQucGxhbik7XG4gIGlmICghZGVjaXNpb24ub2sgfHwgIWRlY2lzaW9uLmF1dGhvcml6YXRpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnYXV0aG9yaXplJywgJ25vdF9hdXRob3JpemVkJywgZGVjaXNpb24ucmVhc29ucyk7XG4gIH1cbiAgcmV0dXJuIGV4ZWN1dGVTdHJ1Y3R1cmUod29ybGQsIHBsYW5uZWQucGxhbiwgZGVjaXNpb24uYXV0aG9yaXphdGlvbik7XG59XG4iLCAiLy8gQ2Fub25pY2FsIHN0YXRlIGhhc2hpbmcgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbiwgbm8gdGhyZWUuanMgaW1wb3J0cy5cbi8vXG4vLyBUaGUgbm8tZmxhdHRlbiBwcm9vZiBjb21wYXJlcyB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbCB2b2x1bWUgb3V0c2lkZSB0aGVcbi8vIGNvbXBsZXRlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZS4gSXQgZGVsaWJlcmF0ZWx5IGRvZXMgbm90IGhhc2ggY2h1bmtcbi8vIGhlaWdodHMvdG9wTWF0ZXJpYWxzIChkZXJpdmVkIGNhY2hlcyksIG1lc2ggZ2VvbWV0cnksIHN0cmVhbWluZyBzdGF0ZSBvclxuLy8gbmF2aWdhdGlvbiBkYXRhLiBUaG9zZSBhcmUgY2hlY2tlZCBzZXBhcmF0ZWx5IGFzIGRlcml2ZWQgc3RhdGUsIHNvIGEgY2FjaGVcbi8vIG9yIG1lc2ggcmVidWlsZCBjYW4gbmV2ZXIgYmUgbWlzdGFrZW4gZm9yIGEgdGVycmFpbiBtdXRhdGlvbi5cbmltcG9ydCB7XG4gIFdvcmxkLCBZX01JTiwgWV9NQVgsIEhBTEYsIENIVU5LX1NJWkUsIENIVU5LX0FSRUEsXG4gIGVuc3VyZUNodW5rLCB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosIGxvY2FsSW5kZXgsIHlUb0luZGV4LCBpc1NvbGlkLFxuICBFbnRpdHksXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgVm94ZWxSZWdpb24sIGVudmVsb3BlQ29udGFpbnMgfSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHsgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RhdGVIYXNoIHtcbiAgLyoqIDE2IGhleCBjaGFyYWN0ZXJzOiB0d28gaW5kZXBlbmRlbnQgMzItYml0IGxhbmVzLiAqL1xuICBoYXNoOiBzdHJpbmc7XG4gIGNlbGxzOiBudW1iZXI7XG4gIGV4Y2x1ZGVkQ2VsbHM6IG51bWJlcjtcbiAgY2h1bmtzOiBudW1iZXI7XG4gIHJlZ2lvbjogVm94ZWxSZWdpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FjaGVNaXNtYXRjaCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBmaWVsZDogJ2hlaWdodCcgfCAnbWF0ZXJpYWwnO1xuICBleHBlY3RlZDogbnVtYmVyO1xuICBhY3R1YWw6IG51bWJlcjtcbn1cblxuY2xhc3MgSGFzaGVyIHtcbiAgcHJpdmF0ZSBhID0gMHg4MTFjOWRjNTtcbiAgcHJpdmF0ZSBiID0gMHg5ZTM3NzliOTtcblxuICBieXRlKHY6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHggPSB2ICYgMHhmZjtcbiAgICB0aGlzLmEgPSBNYXRoLmltdWwodGhpcy5hIF4geCwgMHgwMTAwMDE5Myk7XG4gICAgdGhpcy5iID0gTWF0aC5pbXVsKHRoaXMuYiBeICh4ICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIHRoaXMuYiBePSB0aGlzLmIgPj4+IDEzO1xuICB9XG5cbiAgdTMyKHY6IG51bWJlcik6IHZvaWQge1xuICAgIGxldCBuID0gdiA+Pj4gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IDQ7IGkrKykge1xuICAgICAgdGhpcy5ieXRlKG4pO1xuICAgICAgbiA+Pj49IDg7XG4gICAgfVxuICB9XG5cbiAgc3RyaW5nKHM6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMudTMyKHMubGVuZ3RoKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHMubGVuZ3RoOyBpKyspIHRoaXMuYnl0ZShzLmNoYXJDb2RlQXQoaSkpO1xuICB9XG5cbiAgaGV4KCk6IHN0cmluZyB7XG4gICAgcmV0dXJuICh0aGlzLmEgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpXG4gICAgICArICh0aGlzLmIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGFtcFJlZ2lvbihyZWdpb246IFZveGVsUmVnaW9uKTogVm94ZWxSZWdpb24ge1xuICBjb25zdCByOiBWb3hlbFJlZ2lvbiA9IHtcbiAgICB4MDogTWF0aC5tYXgoLUhBTEYsIE1hdGguZmxvb3IocmVnaW9uLngwKSksXG4gICAgejA6IE1hdGgubWF4KC1IQUxGLCBNYXRoLmZsb29yKHJlZ2lvbi56MCkpLFxuICAgIHgxOiBNYXRoLm1pbihIQUxGIC0gMSwgTWF0aC5mbG9vcihyZWdpb24ueDEpKSxcbiAgICB6MTogTWF0aC5taW4oSEFMRiAtIDEsIE1hdGguZmxvb3IocmVnaW9uLnoxKSksXG4gICAgeTA6IE1hdGgubWF4KFlfTUlOLCBNYXRoLmZsb29yKHJlZ2lvbi55MCkpLFxuICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIE1hdGguZmxvb3IocmVnaW9uLnkxKSksXG4gIH07XG4gIGlmIChyLngwID4gci54MSB8fCByLnowID4gci56MSB8fCByLnkwID4gci55MSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgZW1wdHkgdm94ZWwgcmVnaW9uICR7SlNPTi5zdHJpbmdpZnkocmVnaW9uKX1gKTtcbiAgfVxuICByZXR1cm4gcjtcbn1cblxuLyoqIFNvcnQgYW4gZW52ZWxvcGUgc28gaXRzIGhhc2ggaXMgaW5kZXBlbmRlbnQgb2YgcmVjdCBvcmRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVFbnZlbG9wZShyZWN0czogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IFZveGVsUmVnaW9uW10ge1xuICByZXR1cm4gcmVjdHNcbiAgICAubWFwKChyKSA9PiAoe1xuICAgICAgeDA6IE1hdGguZmxvb3Ioci54MCksIHowOiBNYXRoLmZsb29yKHIuejApLCB4MTogTWF0aC5mbG9vcihyLngxKSwgejE6IE1hdGguZmxvb3Ioci56MSksXG4gICAgICB5MDogTWF0aC5mbG9vcihyLnkwKSwgeTE6IE1hdGguZmxvb3Ioci55MSksXG4gICAgfSkpXG4gICAgLnNvcnQoKGEsIGIpID0+IGEueDAgLSBiLngwIHx8IGEuejAgLSBiLnowIHx8IGEueTAgLSBiLnkwXG4gICAgICB8fCBhLngxIC0gYi54MSB8fCBhLnoxIC0gYi56MSB8fCBhLnkxIC0gYi55MSk7XG59XG5cbi8qKiBNYXRlcmlhbGlzZSBldmVyeSBjaHVuayB0aGF0IG92ZXJsYXBzIHRoZSByZWdpb24gYW5kIHJldHVybiBzb3J0ZWQga2V5cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQ6IFdvcmxkLCByZWdpb246IFZveGVsUmVnaW9uKTogc3RyaW5nW10ge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgY3gwID0gd29ybGRUb0NodW5rWChyLngwKSwgY3gxID0gd29ybGRUb0NodW5rWChyLngxKTtcbiAgY29uc3QgY3owID0gd29ybGRUb0NodW5rWihyLnowKSwgY3oxID0gd29ybGRUb0NodW5rWihyLnoxKTtcbiAgZm9yIChsZXQgY3ogPSBjejA7IGN6IDw9IGN6MTsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY3gwOyBjeCA8PSBjeDE7IGN4KyspIHtcbiAgICAgIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7Y3h9LCR7Y3p9IGlzIG91dHNpZGUgdGhlIHdvcmxkYCk7XG4gICAgICBrZXlzLnB1c2goY2h1bmtLZXkoY3gsIGN6KSk7XG4gICAgfVxuICB9XG4gIGtleXMuc29ydCgpO1xuICByZXR1cm4ga2V5cztcbn1cblxuLyoqXG4gKiBIYXNoIHRoZSBhdXRob3JpdGF0aXZlIG1hdGVyaWFsIGJ5dGUgb2YgZXZlcnkgdm94ZWwgaW4gYHJlZ2lvbmAsIGV4Y2x1ZGluZ1xuICogZXZlcnkgdm94ZWwgaW5zaWRlIGBleGNsdWRlYC4gVHdvIGNhbGxzIHdpdGggdGhlIHNhbWUgcmVnaW9uIGFuZCBlbnZlbG9wZVxuICogYXJlIGRpcmVjdGx5IGNvbXBhcmFibGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxSZWdpb25IYXNoKFxuICB3b3JsZDogV29ybGQsXG4gIHJlZ2lvbjogVm94ZWxSZWdpb24sXG4gIGV4Y2x1ZGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10gPSBbXSxcbik6IFN0YXRlSGFzaCB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBlbnZlbG9wZSA9IG5vcm1hbGl6ZUVudmVsb3BlKGV4Y2x1ZGUpO1xuICBjb25zdCBrZXlzID0gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6dm94ZWwtc3RhdGU6djEnKTtcbiAgaC51MzIoci54MCk7IGgudTMyKHIuejApOyBoLnUzMihyLngxKTsgaC51MzIoci56MSk7IGgudTMyKHIueTApOyBoLnUzMihyLnkxKTtcbiAgaC51MzIoZW52ZWxvcGUubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBlIG9mIGVudmVsb3BlKSB7XG4gICAgaC51MzIoZS54MCk7IGgudTMyKGUuejApOyBoLnUzMihlLngxKTsgaC51MzIoZS56MSk7IGgudTMyKGUueTApOyBoLnUzMihlLnkxKTtcbiAgfVxuXG4gIGxldCBjZWxscyA9IDA7XG4gIGxldCBleGNsdWRlZENlbGxzID0gMDtcbiAgY29uc3QgeWkwID0gci55MCAtIFlfTUlOO1xuICBjb25zdCB5aTEgPSByLnkxIC0gWV9NSU47XG5cbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgY2h1bmsgJHtrZXl9IHdhcyBub3QgZ2VuZXJhdGVkYCk7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgbHgwID0gTWF0aC5tYXgoMCwgci54MCAtIG94KSwgbHgxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIueDEgLSBveCk7XG4gICAgY29uc3QgbHowID0gTWF0aC5tYXgoMCwgci56MCAtIG96KSwgbHoxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIuejEgLSBveik7XG4gICAgaC5zdHJpbmcoJ2NodW5rJyk7XG4gICAgaC51MzIoY2h1bmsuY3gpOyBoLnUzMihjaHVuay5jeik7XG4gICAgZm9yIChsZXQgeWkgPSB5aTA7IHlpIDw9IHlpMTsgeWkrKykge1xuICAgICAgY29uc3QgeSA9IFlfTUlOICsgeWk7XG4gICAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICAgIGNvbnN0IHogPSBveiArIGx6O1xuICAgICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgICAgY29uc3QgeCA9IG94ICsgbHg7XG4gICAgICAgICAgaWYgKGVudmVsb3BlLmxlbmd0aCA+IDAgJiYgZW52ZWxvcGVDb250YWlucyhlbnZlbG9wZSwgeCwgeSwgeikpIHtcbiAgICAgICAgICAgIGV4Y2x1ZGVkQ2VsbHMrKztcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBoLmJ5dGUoY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5aSwgbHopXSk7XG4gICAgICAgICAgY2VsbHMrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGhhc2g6IGguaGV4KCksIGNlbGxzLCBleGNsdWRlZENlbGxzLCBjaHVua3M6IGtleXMubGVuZ3RoLCByZWdpb246IHIgfTtcbn1cblxuLyoqIENhbm9uaWNhbCBpbnZlbnRvcnkgaGFzaDsga2V5IG9yZGVyIGNhbm5vdCBhZmZlY3QgdGhlIHJlc3VsdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKHdvcmxkOiBXb3JsZCk6IHN0cmluZyB7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOmludmVudG9yeTp2MScpO1xuICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMod29ybGQuaW52ZW50b3J5KS5zb3J0KCk7XG4gIGgudTMyKGtleXMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIGguc3RyaW5nKGtleSk7XG4gICAgaC51MzIod29ybGQuaW52ZW50b3J5W2tleV0pO1xuICB9XG4gIHJldHVybiBoLmhleCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW52ZW50b3J5U25hcHNob3Qod29ybGQ6IFdvcmxkKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh3b3JsZC5pbnZlbnRvcnkpLnNvcnQoKSkgb3V0W2tleV0gPSB3b3JsZC5pbnZlbnRvcnlba2V5XTtcbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gaGFzaEVudGl0eShoOiBIYXNoZXIsIGU6IEVudGl0eSk6IHZvaWQge1xuICBoLnN0cmluZyhlLmlkKTtcbiAgaC5zdHJpbmcoZS5raW5kKTtcbiAgaC5zdHJpbmcoZS5jaHVuayk7XG4gIGgudTMyKE1hdGgucm91bmQoZS54ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueSAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnogKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS5yb3QgKiAxMDAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUuc2NhbGUgKiAxMDAwKSk7XG4gIGgudTMyKGUudmFyaWFudCk7XG4gIGguc3RyaW5nKGUucmVzb3VyY2UgPz8gJycpO1xuICBoLnUzMihlLnJlbWFpbmluZyk7XG4gIGgudTMyKGUuaGFydmVzdGVkID8gMSA6IDApO1xuICBoLnUzMihlLmhhcnZlc3RlZE9uY2UgPyAxIDogMCk7XG59XG5cbi8qKiBIYXNoIGVudGl0eSBzdGF0ZTsgd2l0aCBhIHJlZ2lvbiwgb25seSBlbnRpdGllcyByb290ZWQgaW5zaWRlIGl0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbEVudGl0eUhhc2god29ybGQ6IFdvcmxkLCByZWdpb24/OiBWb3hlbFJlZ2lvbik6IHN0cmluZyB7XG4gIGxldCBlbnRpdGllczogRW50aXR5W107XG4gIGlmIChyZWdpb24pIHtcbiAgICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgICBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICAgIGVudGl0aWVzID0gWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXS5maWx0ZXIoXG4gICAgICAoZSkgPT4gZS54ID49IHIueDAgJiYgZS54IDwgci54MSArIDEgJiYgZS56ID49IHIuejAgJiYgZS56IDwgci56MSArIDEsXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICBlbnRpdGllcyA9IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV07XG4gIH1cbiAgZW50aXRpZXMuc29ydCgoYSwgYikgPT4gKGEuaWQgPCBiLmlkID8gLTEgOiBhLmlkID4gYi5pZCA/IDEgOiAwKSk7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOmVudGl0eS1zdGF0ZTp2MScpO1xuICBoLnUzMihlbnRpdGllcy5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IGUgb2YgZW50aXRpZXMpIGhhc2hFbnRpdHkoaCwgZSk7XG4gIHJldHVybiBoLmhleCgpO1xufVxuXG4vKipcbiAqIENhbm9uaWNhbCBoYXNoIG9mIGJ1aWx0IHN0cnVjdHVyZXMuIExheW91dCBtb2R1bGVzIGFuZCBwYWlkIGNvc3RzIGFyZVxuICogYXV0aG9yaXRhdGl2ZSBzaW11bGF0aW9uIHN0YXRlOyByZW5kZXJlciBtZXNoZXMgYXJlIG5vdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbFN0cnVjdHVyZUhhc2god29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgY29uc3Qgc3RydWN0dXJlcyA9IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXVxuICAgIC5zb3J0KChhLCBiKSA9PiAoYS5pZCA8IGIuaWQgPyAtMSA6IGEuaWQgPiBiLmlkID8gMSA6IDApKTtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6c3RydWN0dXJlLXN0YXRlOnYxJyk7XG4gIGgudTMyKHN0cnVjdHVyZXMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBzIG9mIHN0cnVjdHVyZXMpIHtcbiAgICBoLnN0cmluZyhzLmlkKTtcbiAgICBoLnN0cmluZyhzLmtpbmQpO1xuICAgIGguc3RyaW5nKHMuc2l0ZUlkKTtcbiAgICBoLnUzMihNYXRoLnJvdW5kKHMueCAqIDEwMDApKTtcbiAgICBoLnUzMihNYXRoLnJvdW5kKHMueSAqIDEwMDApKTtcbiAgICBoLnUzMihNYXRoLnJvdW5kKHMueiAqIDEwMDApKTtcbiAgICBoLnUzMihNYXRoLnJvdW5kKHMucm90ICogMTAwMDApKTtcbiAgICAvLyBMZWdhY3kgaGFzaCBpbnB1dCBpcyBieXRlLWlkZW50aWNhbC4gRGVzaWduIDIgYWRkcyBhbiBleHBsaWNpdCB0YWcuXG4gICAgaWYgKHMuZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTikgaC5zdHJpbmcoJ2Rlc2lnbjoyJyk7XG4gICAgaC51MzIocy5tb2R1bGVzLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCBtIG9mIHMubW9kdWxlcykge1xuICAgICAgaC5zdHJpbmcobS5raW5kKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS54ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnkgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueiAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS53ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLmggKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0uZCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQoKG0ucm90ID8/IDApICogMTAwMDApKTtcbiAgICAgIGguc3RyaW5nKG0udG9uZSA/PyAnJyk7XG4gICAgfVxuICAgIGNvbnN0IGNvc3RLZXlzID0gT2JqZWN0LmtleXMocy5jb3N0KS5zb3J0KCk7XG4gICAgaC51MzIoY29zdEtleXMubGVuZ3RoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBjb3N0S2V5cykge1xuICAgICAgaC5zdHJpbmcoa2V5KTtcbiAgICAgIGgudTMyKHMuY29zdFtrZXkgYXMga2V5b2YgdHlwZW9mIHMuY29zdF0gPz8gMCk7XG4gICAgfVxuICAgIGgudTMyKHMuYnVpbHRSZXZpc2lvbik7XG4gIH1cbiAgcmV0dXJuIGguaGV4KCk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FjaGVIYXNoIHtcbiAgaGFzaDogc3RyaW5nO1xuICBjb2x1bW5zOiBudW1iZXI7XG4gIGNodW5rczogbnVtYmVyO1xufVxuXG4vKiogRGVyaXZlZCBjb2x1bW4tY2FjaGUgaGFzaC4gTm90IGF1dGhvcml0YXRpdmUgdGVycmFpbiBzdGF0ZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXJpdmVkQ2FjaGVIYXNoKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbik6IENhY2hlSGFzaCB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBrZXlzID0gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6ZGVyaXZlZC1jb2x1bW4tY2FjaGU6djEnKTtcbiAgaC51MzIoci54MCk7IGgudTMyKHIuejApOyBoLnUzMihyLngxKTsgaC51MzIoci56MSk7XG4gIGxldCBjb2x1bW5zID0gMDtcbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgY2h1bmsgJHtrZXl9IHdhcyBub3QgZ2VuZXJhdGVkYCk7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgbHgwID0gTWF0aC5tYXgoMCwgci54MCAtIG94KSwgbHgxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIueDEgLSBveCk7XG4gICAgY29uc3QgbHowID0gTWF0aC5tYXgoMCwgci56MCAtIG96KSwgbHoxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIuejEgLSBveik7XG4gICAgaC5zdHJpbmcoJ2NodW5rJyk7XG4gICAgaC51MzIoY2h1bmsuY3gpOyBoLnUzMihjaHVuay5jeik7XG4gICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgICAgaC51MzIoY2h1bmsuaGVpZ2h0c1tjb2xdKTtcbiAgICAgICAgaC51MzIoY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0pO1xuICAgICAgICBjb2x1bW5zKys7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiB7IGhhc2g6IGguaGV4KCksIGNvbHVtbnMsIGNodW5rczoga2V5cy5sZW5ndGggfTtcbn1cblxuLyoqXG4gKiBSZWNvbXB1dGUgZXZlcnkgY29sdW1uIGNhY2hlIGZyb20gdGhlIGF1dGhvcml0YXRpdmUgdm94ZWwgZGF0YSBhbmQgcmVwb3J0XG4gKiBtaXNtYXRjaGVzLiBUaGlzIHByb3ZlcyBoZWlnaHRzL3RvcE1hdGVyaWFscyBhcmUgZGVyaXZlZCwgbm90IGEgc2Vjb25kXG4gKiB0ZXJyYWluIHJlcHJlc2VudGF0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hlY2tEZXJpdmVkQ2FjaGVzKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbiwgbGltaXQgPSA2NCk6IENhY2hlTWlzbWF0Y2hbXSB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBrZXlzID0gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgY29uc3Qgb3V0OiBDYWNoZU1pc21hdGNoW10gPSBbXTtcbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghY2h1bmspIGNvbnRpbnVlO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgICBsZXQgdG9wTWF0ID0gY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF07XG4gICAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICAgIGNvbnN0IG0gPSBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildO1xuICAgICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBleHBlY3RlZEhlaWdodCA9IHRvcFNvbGlkIC0gWV9NSU47XG4gICAgICAgIGlmIChjaHVuay5oZWlnaHRzW2NvbF0gIT09IGV4cGVjdGVkSGVpZ2h0KSB7XG4gICAgICAgICAgb3V0LnB1c2goeyB4OiBveCArIGx4LCB6OiBveiArIGx6LCBmaWVsZDogJ2hlaWdodCcsIGV4cGVjdGVkOiBleHBlY3RlZEhlaWdodCwgYWN0dWFsOiBjaHVuay5oZWlnaHRzW2NvbF0gfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdICE9PSB0b3BNYXQpIHtcbiAgICAgICAgICBvdXQucHVzaCh7IHg6IG94ICsgbHgsIHo6IG96ICsgbHosIGZpZWxkOiAnbWF0ZXJpYWwnLCBleHBlY3RlZDogdG9wTWF0LCBhY3R1YWw6IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvdXQubGVuZ3RoID49IGxpbWl0KSByZXR1cm4gb3V0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEVkaXRPdXRzaWRlIHtcbiAgY2h1bms6IHN0cmluZztcbiAgaW5kZXg6IG51bWJlcjtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgbWF0ZXJpYWw6IG51bWJlcjtcbn1cblxuLyoqIEV2ZXJ5IHJlY29yZGVkIHZveGVsIGVkaXQgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVkaXRzT3V0c2lkZUVudmVsb3BlKHdvcmxkOiBXb3JsZCwgZW52ZWxvcGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBFZGl0T3V0c2lkZVtdIHtcbiAgY29uc3Qgb3V0OiBFZGl0T3V0c2lkZVtdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgZWRpdHNdIG9mIHdvcmxkLmVkaXRzKSB7XG4gICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgICBmb3IgKGNvbnN0IFtpbmRleCwgbWF0ZXJpYWxdIG9mIGVkaXRzKSB7XG4gICAgICBjb25zdCBseCA9IGluZGV4ICUgQ0hVTktfU0laRTtcbiAgICAgIGNvbnN0IGx6ID0gTWF0aC5mbG9vcigoaW5kZXggJSBDSFVOS19BUkVBKSAvIENIVU5LX1NJWkUpO1xuICAgICAgY29uc3QgeWkgPSBNYXRoLmZsb29yKGluZGV4IC8gQ0hVTktfQVJFQSk7XG4gICAgICBjb25zdCB4ID0gb3ggKyBseCwgeiA9IG96ICsgbHosIHkgPSBZX01JTiArIHlpO1xuICAgICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKGVudmVsb3BlLCB4LCB5LCB6KSkge1xuICAgICAgICBvdXQucHVzaCh7IGNodW5rOiBrZXksIGluZGV4LCB4LCB5LCB6LCBtYXRlcmlhbCB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgb3V0LnNvcnQoKGEsIGIpID0+IGEuY2h1bmsubG9jYWxlQ29tcGFyZShiLmNodW5rKSB8fCBhLmluZGV4IC0gYi5pbmRleCk7XG4gIHJldHVybiBvdXQ7XG59XG5cbi8qKiBOZXcgY2h1bmtzIGdlbmVyYXRlZCBzaW5jZSB0aGUgYmFzZWxpbmUgdGhhdCBkbyBub3Qgb3ZlcmxhcCB0aGUgZW52ZWxvcGUuICovXG5leHBvcnQgZnVuY3Rpb24gbmV3Q2h1bmtzT3V0c2lkZUVudmVsb3BlKFxuICB3b3JsZDogV29ybGQsIGJhc2VsaW5lS2V5czogSXRlcmFibGU8c3RyaW5nPiwgZW52ZWxvcGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10sXG4pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IGJhc2VsaW5lID0gbmV3IFNldChiYXNlbGluZUtleXMpO1xuICBjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgY2h1bmtdIG9mIHdvcmxkLmNodW5rcykge1xuICAgIGlmIChiYXNlbGluZS5oYXMoa2V5KSkgY29udGludWU7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3Qgb3ZlcmxhcHMgPSBlbnZlbG9wZS5zb21lKFxuICAgICAgKHIpID0+IG94IDw9IHIueDEgJiYgb3ggKyBDSFVOS19TSVpFIC0gMSA+PSByLngwICYmIG96IDw9IHIuejEgJiYgb3ogKyBDSFVOS19TSVpFIC0gMSA+PSByLnowLFxuICAgICk7XG4gICAgaWYgKCFvdmVybGFwcykgb3V0LnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4gb3V0LnNvcnQoKTtcbn1cblxuLyoqIEFsbCBjaHVuayBrZXlzIGN1cnJlbnRseSBtYXRlcmlhbGlzZWQsIHNvcnRlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaHVua0tleXMod29ybGQ6IFdvcmxkKTogc3RyaW5nW10ge1xuICByZXR1cm4gWy4uLndvcmxkLmNodW5rcy5rZXlzKCldLnNvcnQoKTtcbn1cblxuLyoqIEJvdW5kaW5nIHZveGVsIHJlZ2lvbiBjb3ZlcmluZyBldmVyeSBtYXRlcmlhbGlzZWQgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gd29ybGRDaHVua1JlZ2lvbih3b3JsZDogV29ybGQpOiBWb3hlbFJlZ2lvbiB7XG4gIGlmICh3b3JsZC5jaHVua3Muc2l6ZSA9PT0gMCkgdGhyb3cgbmV3IEVycm9yKCd3b3JsZCBoYXMgbm8gY2h1bmtzJyk7XG4gIGxldCBtaW5DeCA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgbWF4Q3ggPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGxldCBtaW5DeiA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgbWF4Q3ogPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgY2h1bmsgb2Ygd29ybGQuY2h1bmtzLnZhbHVlcygpKSB7XG4gICAgbWluQ3ggPSBNYXRoLm1pbihtaW5DeCwgY2h1bmsuY3gpOyBtYXhDeCA9IE1hdGgubWF4KG1heEN4LCBjaHVuay5jeCk7XG4gICAgbWluQ3ogPSBNYXRoLm1pbihtaW5DeiwgY2h1bmsuY3opOyBtYXhDeiA9IE1hdGgubWF4KG1heEN6LCBjaHVuay5jeik7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICB4MDogY2h1bmtPcmlnaW5YKG1pbkN4KSxcbiAgICB6MDogY2h1bmtPcmlnaW5aKG1pbkN6KSxcbiAgICB4MTogY2h1bmtPcmlnaW5YKG1heEN4KSArIENIVU5LX1NJWkUgLSAxLFxuICAgIHoxOiBjaHVua09yaWdpbloobWF4Q3opICsgQ0hVTktfU0laRSAtIDEsXG4gICAgeTA6IFlfTUlOLFxuICAgIHkxOiBZX01BWCAtIDEsXG4gIH07XG59XG4iLCAiLy8gTTAwMiBkZXRlcm1pbmlzdGljIGZpeHR1cmUgYW5kIGxpdmUtd29ybGQgbGF5b3V0LlxuLy9cbi8vIFRoZSBmaXh0dXJlIGlzIGEgYm91bmRlZCBzbGljZSBvZiB0aGUgcmVhbCAyMDQ4IG0gd29ybGQgKHNlZWQgMTMzNyksIG5vdCBhXG4vLyBzeW50aGV0aWMgaGVpZ2h0ZmllbGQuIEl0IGNvbnRhaW5zOlxuLy8gICAqIGEgcmVqZWN0ZWQgaG91c2Ugc2l0ZSBvbiBhIDcgbSByaXZlci1iYW5rIHNsb3BlO1xuLy8gICAqIGEgdmlhYmxlIGhvdXNlIHNoZWxmIDIwIG0gYXdheSB3aXRoIDIgbSByZWxpZWYgYW5kIG5vIGNsZWFyaW5nIG5lZWRlZDtcbi8vICAgKiBhIDMgbSBmYXJtIHNsb3BlIDI3IG0gZnJvbSB0aGUgaG91c2Ugd2l0aCBhIG5hdHVyYWwgYmxvc3NvbSB0cmVlIGFuZCBvcmUuXG4vL1xuLy8gVGhlIHNhbWUgY29vcmRpbmF0ZXMsIHF1ZXJpZXMgYW5kIHZhbGlkYXRvcnMgYXJlIHVzZWQgYnkgdGhlIGxpdmUtd29ybGRcbi8vIGFjY2VwdGFuY2UgdGVzdC4gVGhlIG9ubHkgZGlmZmVyZW5jZSBpcyBob3cgbWFueSBjaHVua3MgYXJlIG1hdGVyaWFsaXNlZC5cbmltcG9ydCB7XG4gIFdvcmxkLCBjcmVhdGVXb3JsZCwgZ2VuZXJhdGVXb3JsZCwgZ2VuZXJhdGVDaHVuaywgcGxhY2VBdXRob3JlZFNpdGVzLFxuICBZX01JTiwgWV9NQVgsIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IFJlY3QsIFZveGVsUmVnaW9uIH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IGNodW5rS2V5cyB9IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IGNvbnN0IE0wMDJfU0VFRCA9IDEzMzc7XG5cbi8qKiBQaW5uZWQgcGF0aCBzaXRlIGlkIGZvciB0aGUgZG9vci10by1hcHByb2FjaCBjb3JyaWRvci4gKi9cbmV4cG9ydCBjb25zdCBNMDAyX1BBVEhfU0lURV9JRCA9ICdwYXRoLWhvdXNlLWZhcm0nO1xuXG4vKipcbiAqIFBpbm5lZCBzdGVwcGVkIHByb2ZpbGUgZm9yIHRoZSA5IG0gcGF0aCBmcm9tIHRoZSBob3VzZSBkb29yICh4ID0gLTUzKSB0byB0aGVcbiAqIGFwcHJvYWNoICh4ID0gLTQ1KS4gVGhlIHJpc2UgaXMgMiBtIG92ZXIgOCBtOyBldmVyeSBzdGVwIGlzIGF0IG1vc3QgMSBtLlxuICovXG5leHBvcnQgY29uc3QgTTAwMl9QQVRIX1BST0ZJTEUgPSBbMTEsIDExLCAxMSwgMTIsIDEyLCAxMiwgMTIsIDEzLCAxM10gYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFjZUJhbmRTcGVjIHtcbiAgejA6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG4vKiogUGlubmVkIGZhcm0gdGVycmFjZXMsIGhpZ2ggc2lkZSBmaXJzdC4gKi9cbmV4cG9ydCBjb25zdCBNMDAyX1RFUlJBQ0VfQkFORFM6IHJlYWRvbmx5IFRlcnJhY2VCYW5kU3BlY1tdID0gW1xuICB7IHowOiAtNDIsIHoxOiAtNDAsIHk6IDE2IH0sXG4gIHsgejA6IC0zOSwgejE6IC0zNywgeTogMTUgfSxcbiAgeyB6MDogLTM2LCB6MTogLTM1LCB5OiAxNCB9LFxuXTtcblxuZXhwb3J0IGludGVyZmFjZSBTaXRlU3BlYyB7XG4gIGlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBkb29yOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmFybVNwZWMge1xuICBpZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICB0ZXJyYWNlczogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJMYXlvdXQge1xuICBzZWVkOiBudW1iZXI7XG4gIHJlamVjdGVkOiBTaXRlU3BlYztcbiAgaG91c2U6IFNpdGVTcGVjO1xuICBmYXJtOiBGYXJtU3BlYztcbiAgc2VhcmNoQXJlYTogUmVjdDtcbiAgd29ya1pvbmU6IFJlY3Q7XG4gIGZpeHR1cmVDaHVua3M6IHsgY3gwOiBudW1iZXI7IGN6MDogbnVtYmVyOyBjeDE6IG51bWJlcjsgY3oxOiBudW1iZXIgfTtcbiAgcHJvdGVjdGVkUmVnaW9uOiBWb3hlbFJlZ2lvbjtcbiAgLyoqIENvbXBsZXRlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZSBmb3IgdGhlIGZpcnN0IHNsaWNlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbn1cblxuY29uc3QgRklYVFVSRV9DSFVOS1MgPSB7IGN4MDogMjgsIGN6MDogMjksIGN4MTogMzIsIGN6MTogMzIgfSBhcyBjb25zdDtcblxuZXhwb3J0IGNvbnN0IE0wMDJfTEFZT1VUOiBNMDAyTGF5b3V0ID0ge1xuICBzZWVkOiBNMDAyX1NFRUQsXG4gIHJlamVjdGVkOiB7XG4gICAgaWQ6ICdzaXRlLWEtcmVqZWN0ZWQnLFxuICAgIHJlY3Q6IHsgeDA6IC03NCwgejA6IC02NiwgeDE6IC02NywgejE6IC02MSB9LFxuICAgIC8vIEEgbmFpdmUgbG93LXNpZGUgZmxvb3I6IHRoZSB1cGhpbGwgY29ybmVyIHdvdWxkIG5lZWQgNSBtIG9mIGV4Y2F2YXRpb24uXG4gICAgZmxvb3JZOiAzLFxuICAgIGRvb3I6IHsgeDogLTY3LCB6OiAtNjMgfSxcbiAgICBhcHByb2FjaDogeyB4OiAtNjAsIHo6IC02MyB9LFxuICB9LFxuICBob3VzZToge1xuICAgIGlkOiAnc2l0ZS1iLWhvdXNlJyxcbiAgICByZWN0OiB7IHgwOiAtNjAsIHowOiAtNDYsIHgxOiAtNTMsIHoxOiAtNDEgfSxcbiAgICBmbG9vclk6IDExLFxuICAgIGRvb3I6IHsgeDogLTUzLCB6OiAtNDMgfSxcbiAgICBhcHByb2FjaDogeyB4OiAtNDUsIHo6IC00MyB9LFxuICB9LFxuICBmYXJtOiB7XG4gICAgaWQ6ICdmaWVsZC1jJyxcbiAgICByZWN0OiB7IHgwOiAtMzgsIHowOiAtNDIsIHgxOiAtMjcsIHoxOiAtMzUgfSxcbiAgICB0ZXJyYWNlczogMyxcbiAgfSxcbiAgc2VhcmNoQXJlYTogeyB4MDogLTc2LCB6MDogLTY4LCB4MTogLTQwLCB6MTogLTQwIH0sXG4gIHdvcmtab25lOiB7IHgwOiAtNzYsIHowOiAtNjgsIHgxOiAtMjMsIHoxOiAtMzEgfSxcbiAgZml4dHVyZUNodW5rczogRklYVFVSRV9DSFVOS1MsXG4gIHByb3RlY3RlZFJlZ2lvbjoge1xuICAgIHgwOiBjaHVua09yaWdpblgoRklYVFVSRV9DSFVOS1MuY3gwKSxcbiAgICB6MDogY2h1bmtPcmlnaW5aKEZJWFRVUkVfQ0hVTktTLmN6MCksXG4gICAgeDE6IGNodW5rT3JpZ2luWChGSVhUVVJFX0NIVU5LUy5jeDEpICsgMzEsXG4gICAgejE6IGNodW5rT3JpZ2luWihGSVhUVVJFX0NIVU5LUy5jejEpICsgMzEsXG4gICAgeTA6IFlfTUlOLFxuICAgIHkxOiBZX01BWCAtIDEsXG4gIH0sXG4gIGVudmVsb3BlOiBbXG4gICAgLy8gSG91c2UgZm9vdHByaW50IHBsdXMgYSAyIG0gcHJlcGFyYXRpb24gYnVmZmVyLlxuICAgIHsgeDA6IC02MiwgejA6IC00OCwgeDE6IC01MSwgejE6IC0zOSwgeTA6IDgsIHkxOiAxNiB9LFxuICAgIC8vIERvb3ItdG8tYXBwcm9hY2ggcGF0aCBjb3JyaWRvciBwbHVzIGEgMSBtIGJ1ZmZlci5cbiAgICB7IHgwOiAtNTQsIHowOiAtNDQsIHgxOiAtNDQsIHoxOiAtNDIsIHkwOiA5LCB5MTogMTUgfSxcbiAgICAvLyBGYXJtIGZvb3RwcmludCBwbHVzIGEgMiBtIHByZXBhcmF0aW9uIGJ1ZmZlci5cbiAgICB7IHgwOiAtNDAsIHowOiAtNDQsIHgxOiAtMjUsIHoxOiAtMzMsIHkwOiAxMCwgeTE6IDIwIH0sXG4gIF0sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJXb3JsZCB7XG4gIHdvcmxkOiBXb3JsZDtcbiAgbGF5b3V0OiBNMDAyTGF5b3V0O1xuICAvKiogU29ydGVkIGNodW5rIGtleXMgbWF0ZXJpYWxpc2VkIGF0IGZpeHR1cmUgY3JlYXRpb24uICovXG4gIGNodW5rS2V5czogc3RyaW5nW107XG59XG5cbi8qKlxuICogU21hbGwgZGV0ZXJtaW5pc3RpYyBmaXh0dXJlOiB0aGUgMjAgY2h1bmtzIGNvdmVyaW5nIHRoZSB3b3JrIHpvbmUgYW5kIGl0c1xuICogcHJvdGVjdGVkIHN1cnJvdW5kaW5ncy4gRmFzdCBlbm91Z2ggZm9yIHRoZSBmdWxsIHRlc3Qgc3VpdGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNMDAyRml4dHVyZShzZWVkID0gTTAwMl9TRUVEKTogTTAwMldvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkKTtcbiAgY29uc3QgeyBjeDAsIGN6MCwgY3gxLCBjejEgfSA9IE0wMDJfTEFZT1VULmZpeHR1cmVDaHVua3M7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICB9XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHJldHVybiB7IHdvcmxkLCBsYXlvdXQ6IE0wMDJfTEFZT1VULCBjaHVua0tleXM6IGNodW5rS2V5cyh3b3JsZCkgfTtcbn1cblxuLyoqXG4gKiBMaXZlLXdvcmxkIGludGVncmF0aW9uIHRhcmdldDogdGhlIHNhbWUgc2VlZCBhbmQgc2l0ZXMgd2l0aCBhIDkgeCA5IGNodW5rXG4gKiBuZWlnaGJvdXJob29kICg4MSBjaHVua3MpIGFyb3VuZCB0aGUgZm91bmRlciB2YWxsZXkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNMDAyTGl2ZShzZWVkID0gTTAwMl9TRUVELCByYWRpdXMgPSA0KTogTTAwMldvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBnZW5lcmF0ZVdvcmxkKHNlZWQsIHJhZGl1cyk7XG4gIHJldHVybiB7IHdvcmxkLCBsYXlvdXQ6IE0wMDJfTEFZT1VULCBjaHVua0tleXM6IGNodW5rS2V5cyh3b3JsZCkgfTtcbn1cbiIsICIvLyBNMDAyIHN0YWdlIDcgc2NlbmFyaW8gd2lyaW5nOiB0aGUgcGlubmVkIGZpcnN0IHNsaWNlLCBydW4gdGhyb3VnaCB0aGUgc2FtZVxuLy8gcHVibGljIHNpbXVsYXRpb24gcGlwZWxpbmUgdXNlZCBieSB0aGUgcGxheWVyLCB0aGUgQUkgYW5kIHRoZSB0ZXN0cy5cbi8vXG4vLyBUaGUgc2NlbmFyaW8gaXMgZGVsaWJlcmF0ZWx5IHBsYWluIGRhdGEgaW4gLyBkYXRhIG91dC4gSXQgZG9lcyBub3QgdG91Y2ggdGhlXG4vLyByZW5kZXJlciwgYW5kIGV2ZXJ5IHRlcnJhaW4gZWRpdCBzdGlsbCBnb2VzIHRocm91Z2ggcHJlcGFyZVNpdGUgLT5cbi8vIExvY2FsQXV0aG9yaXplciAtPiBleGVjdXRlUHJlcGFyYXRpb24uIFN0cnVjdHVyZXMgc3RpbGwgZ28gdGhyb3VnaFxuLy8gYnVpbGRTdHJ1Y3R1cmUgLT4gTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyIC0+IGV4ZWN1dGVTdHJ1Y3R1cmUuXG5pbXBvcnQgeyBNQVQsIFJlc291cmNlVHlwZSB9IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgTTAwMldvcmxkLCBNMDAyX0xBWU9VVCwgTTAwMl9QQVRIX1BST0ZJTEUsIE0wMDJfUEFUSF9TSVRFX0lELFxuICBNMDAyX1RFUlJBQ0VfQkFORFMsXG59IGZyb20gJy4vbTAwMic7XG5pbXBvcnQgeyBSZWN0IH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IEhPVVNFX1JVTEVTLCBQQVRIX1JVTEVTLCBGQVJNX1JVTEVTIH0gZnJvbSAnLi9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHtcbiAgQ29sdW1uVGFyZ2V0LCBMb2NhbEF1dGhvcml6ZXIsIHByZXBhcmVTaXRlLCBQcmVwYXJhdGlvbkxlZGdlcixcbn0gZnJvbSAnLi9wcmVwYXJhdGlvbic7XG5pbXBvcnQge1xuICBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsIGJ1aWxkU3RydWN0dXJlLCBTdHJ1Y3R1cmVMZWRnZXIsXG59IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQge1xuICBjYW5vbmljYWxFbnRpdHlIYXNoLCBjYW5vbmljYWxJbnZlbnRvcnlIYXNoLCBjYW5vbmljYWxSZWdpb25IYXNoLFxuICBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoLCBpbnZlbnRvcnlTbmFwc2hvdCxcbn0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTTAwMl9TVEFSVEVSX0lOVkVOVE9SWTogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgbnVtYmVyPj4gPSB7XG4gIHdvb2Q6IDI0LFxuICBzdG9uZTogNDgsXG59O1xuXG4vKiogVGhlIDkgeCAzIG0gY29ycmlkb3IgZnJvbSB0aGUgaG91c2UgZG9vciB0byB0aGUgYXBwcm9hY2guICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMlBhdGhSZWN0KCk6IFJlY3Qge1xuICBjb25zdCBkb29yID0gTTAwMl9MQVlPVVQuaG91c2UuZG9vcjtcbiAgY29uc3QgYXBwcm9hY2ggPSBNMDAyX0xBWU9VVC5ob3VzZS5hcHByb2FjaDtcbiAgcmV0dXJuIHtcbiAgICB4MDogZG9vci54LFxuICAgIHowOiBkb29yLnogLSAxLFxuICAgIHgxOiBhcHByb2FjaC54LFxuICAgIHoxOiBkb29yLnogKyAxLFxuICB9O1xufVxuXG4vKiogT25lIHRhcmdldCBwZXIgcGF0aCBjb2x1bW4sIHVzaW5nIHRoZSBwaW5uZWQgc3RlcHBlZCBwcm9maWxlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJQYXRoVGFyZ2V0cygpOiBDb2x1bW5UYXJnZXRbXSB7XG4gIGNvbnN0IHJlY3QgPSBtMDAyUGF0aFJlY3QoKTtcbiAgY29uc3QgdGFyZ2V0czogQ29sdW1uVGFyZ2V0W10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBNMDAyX1BBVEhfUFJPRklMRS5sZW5ndGg7IGkrKykge1xuICAgIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgICAgdGFyZ2V0cy5wdXNoKHsgeDogcmVjdC54MCArIGksIHosIHk6IE0wMDJfUEFUSF9QUk9GSUxFW2ldIH0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGFyZ2V0cztcbn1cblxuLyoqIE9uZSB0YXJnZXQgcGVyIGZhcm0gY29sdW1uLCB1c2luZyB0aGUgcGlubmVkIHRlcnJhY2UgYmFuZHMuICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMkZhcm1UYXJnZXRzKCk6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3QgcmVjdCA9IE0wMDJfTEFZT1VULmZhcm0ucmVjdDtcbiAgY29uc3QgdGFyZ2V0czogQ29sdW1uVGFyZ2V0W10gPSBbXTtcbiAgZm9yIChjb25zdCBiYW5kIG9mIE0wMDJfVEVSUkFDRV9CQU5EUykge1xuICAgIGZvciAobGV0IHogPSBiYW5kLnowOyB6IDw9IGJhbmQuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgICAgIHRhcmdldHMucHVzaCh7IHgsIHosIHk6IGJhbmQueSB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRhcmdldHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMlNjZW5hcmlvT3B0aW9ucyB7XG4gIC8qKiBTdGFydGVyIHJlc291cmNlcyBiZWZvcmUgdGhlIHNsaWNlIHJ1bnMuIERlZmF1bHRzIHRvIHdvb2QgMjQgLyBzdG9uZSA0OC4gKi9cbiAgaW52ZW50b3J5PzogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+Pjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyU2NlbmFyaW9TaXRlIHtcbiAgcHJlcGFyYXRpb246IFByZXBhcmF0aW9uTGVkZ2VyIHwgbnVsbDtcbiAgc3RydWN0dXJlOiBTdHJ1Y3R1cmVMZWRnZXIgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJTY2VuYXJpb1Jlc3VsdCB7XG4gIG9rOiBib29sZWFuO1xuICBlcnJvcnM6IHN0cmluZ1tdO1xuICBob3VzZTogTTAwMlNjZW5hcmlvU2l0ZTtcbiAgcGF0aDogTTAwMlNjZW5hcmlvU2l0ZTtcbiAgZmFybTogTTAwMlNjZW5hcmlvU2l0ZTtcbiAgaW52ZW50b3J5QmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBpbnZlbnRvcnlBZnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaGFzaGVzOiB7XG4gICAgdm94ZWxzOiBzdHJpbmc7XG4gICAgc3RydWN0dXJlczogc3RyaW5nO1xuICAgIGludmVudG9yeTogc3RyaW5nO1xuICAgIGVudGl0aWVzOiBzdHJpbmc7XG4gIH07XG59XG5cbmZ1bmN0aW9uIGVtcHR5U2l0ZSgpOiBNMDAyU2NlbmFyaW9TaXRlIHtcbiAgcmV0dXJuIHsgcHJlcGFyYXRpb246IG51bGwsIHN0cnVjdHVyZTogbnVsbCB9O1xufVxuXG5mdW5jdGlvbiBkZXNjcmliZUZhaWx1cmUocmVzdWx0OiB7IGNvZGU6IHN0cmluZzsgcmVhc29uczogc3RyaW5nW10gfSk6IHN0cmluZyB7XG4gIHJldHVybiBgJHtyZXN1bHQuY29kZX06ICR7cmVzdWx0LnJlYXNvbnMuam9pbignOyAnKX1gO1xufVxuXG4vKipcbiAqIFJ1biBob3VzZSwgcGF0aCBhbmQgdGVycmFjZWQgZmFybSBpbiB0aGVpciBwaW5uZWQgb3JkZXIuIEEgZmFpbGVkIHN0ZXAgaXNcbiAqIHJlY29yZGVkIGFuZCBsYXRlciBpbmRlcGVuZGVudCBzdGVwcyBzdGlsbCBydW47IGEgc3RydWN0dXJlIGlzIG5ldmVyIGJ1aWx0XG4gKiB1bmxlc3MgaXRzIG93biB0ZXJyYWluIHByZXBhcmF0aW9uIHN1Y2NlZWRlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJ1bk0wMDJTY2VuYXJpbyhcbiAgbTAwMjogTTAwMldvcmxkLCBvcHRpb25zOiBNMDAyU2NlbmFyaW9PcHRpb25zID0ge30sXG4pOiBNMDAyU2NlbmFyaW9SZXN1bHQge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IG0wMDI7XG4gIGNvbnN0IHN0YXJ0ZXIgPSBvcHRpb25zLmludmVudG9yeSA/PyBNMDAyX1NUQVJURVJfSU5WRU5UT1JZO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7fTtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMoc3RhcnRlcikpIHtcbiAgICBpZiAoKGFtb3VudCA/PyAwKSA+IDApIHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPSBhbW91bnQgYXMgbnVtYmVyO1xuICB9XG5cbiAgY29uc3QgcHJlcEF1dGhvcml6ZXIgPSBuZXcgTG9jYWxBdXRob3JpemVyKHsgZW52ZWxvcGU6IGxheW91dC5lbnZlbG9wZSB9KTtcbiAgY29uc3Qgc3RydWN0dXJlQXV0aG9yaXplciA9IG5ldyBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIoeyBlbnZlbG9wZTogbGF5b3V0LmVudmVsb3BlIH0pO1xuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgaG91c2UgPSBlbXB0eVNpdGUoKTtcbiAgY29uc3QgcGF0aCA9IGVtcHR5U2l0ZSgpO1xuICBjb25zdCBmYXJtID0gZW1wdHlTaXRlKCk7XG5cbiAgY29uc3QgaG91c2VQcmVwID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCB7XG4gICAgc2l0ZUlkOiBsYXlvdXQuaG91c2UuaWQsXG4gICAgcmVjdDogbGF5b3V0LmhvdXNlLnJlY3QsXG4gICAgZmxvb3JZOiBsYXlvdXQuaG91c2UuZmxvb3JZLFxuICAgIHJ1bGVzOiBIT1VTRV9SVUxFUyxcbiAgfSk7XG4gIGlmICghaG91c2VQcmVwLm9rKSB7XG4gICAgZXJyb3JzLnB1c2goYGhvdXNlIHByZXBhcmF0aW9uOiAke2Rlc2NyaWJlRmFpbHVyZShob3VzZVByZXApfWApO1xuICB9IGVsc2Uge1xuICAgIGhvdXNlLnByZXBhcmF0aW9uID0gaG91c2VQcmVwLmxlZGdlcjtcbiAgICBjb25zdCBob3VzZUJ1aWxkID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHtcbiAgICAgIHNpdGVJZDogbGF5b3V0LmhvdXNlLmlkLFxuICAgICAga2luZDogJ2hvdXNlJyxcbiAgICAgIHJlY3Q6IGxheW91dC5ob3VzZS5yZWN0LFxuICAgICAgZmxvb3JZOiBsYXlvdXQuaG91c2UuZmxvb3JZLFxuICAgICAgZG9vcjogbGF5b3V0LmhvdXNlLmRvb3IsXG4gICAgfSk7XG4gICAgaWYgKCFob3VzZUJ1aWxkLm9rKSB7XG4gICAgICBlcnJvcnMucHVzaChgaG91c2Ugc3RydWN0dXJlOiAke2Rlc2NyaWJlRmFpbHVyZShob3VzZUJ1aWxkKX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaG91c2Uuc3RydWN0dXJlID0gaG91c2VCdWlsZC5sZWRnZXI7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcGF0aFJlY3QgPSBtMDAyUGF0aFJlY3QoKTtcbiAgY29uc3QgcGF0aFByZXAgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgIHJlY3Q6IHBhdGhSZWN0LFxuICAgIGZsb29yWTogMTIsXG4gICAgcnVsZXM6IFBBVEhfUlVMRVMsXG4gIH0sIHtcbiAgICB0YXJnZXRzOiBtMDAyUGF0aFRhcmdldHMoKSxcbiAgICBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5HUkFWRUwsXG4gICAgZW52ZWxvcGU6IFtsYXlvdXQuZW52ZWxvcGVbMV1dLFxuICB9KTtcbiAgaWYgKCFwYXRoUHJlcC5vaykge1xuICAgIGVycm9ycy5wdXNoKGBwYXRoIHByZXBhcmF0aW9uOiAke2Rlc2NyaWJlRmFpbHVyZShwYXRoUHJlcCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgcGF0aC5wcmVwYXJhdGlvbiA9IHBhdGhQcmVwLmxlZGdlcjtcbiAgICBjb25zdCBwYXRoQnVpbGQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwge1xuICAgICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICAgIGtpbmQ6ICdwYXRoJyxcbiAgICAgIHJlY3Q6IHBhdGhSZWN0LFxuICAgICAgZmxvb3JZOiAxMixcbiAgICB9KTtcbiAgICBpZiAoIXBhdGhCdWlsZC5vaykge1xuICAgICAgZXJyb3JzLnB1c2goYHBhdGggc3RydWN0dXJlOiAke2Rlc2NyaWJlRmFpbHVyZShwYXRoQnVpbGQpfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYXRoLnN0cnVjdHVyZSA9IHBhdGhCdWlsZC5sZWRnZXI7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZmFybVByZXAgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IGxheW91dC5mYXJtLmlkLFxuICAgIHJlY3Q6IGxheW91dC5mYXJtLnJlY3QsXG4gICAgZmxvb3JZOiAxNSxcbiAgICBydWxlczogRkFSTV9SVUxFUyxcbiAgfSwge1xuICAgIHRhcmdldHM6IG0wMDJGYXJtVGFyZ2V0cygpLFxuICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULlNPSUwsXG4gICAgZW52ZWxvcGU6IFtsYXlvdXQuZW52ZWxvcGVbMl1dLFxuICB9KTtcbiAgaWYgKCFmYXJtUHJlcC5vaykge1xuICAgIGVycm9ycy5wdXNoKGBmYXJtIHByZXBhcmF0aW9uOiAke2Rlc2NyaWJlRmFpbHVyZShmYXJtUHJlcCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgZmFybS5wcmVwYXJhdGlvbiA9IGZhcm1QcmVwLmxlZGdlcjtcbiAgICBjb25zdCBmYXJtQnVpbGQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwge1xuICAgICAgc2l0ZUlkOiBsYXlvdXQuZmFybS5pZCxcbiAgICAgIGtpbmQ6ICd0ZXJyYWNlJyxcbiAgICAgIHJlY3Q6IGxheW91dC5mYXJtLnJlY3QsXG4gICAgICBmbG9vclk6IDE1LFxuICAgICAgdGVycmFjZXM6IGxheW91dC5mYXJtLnRlcnJhY2VzLFxuICAgIH0pO1xuICAgIGlmICghZmFybUJ1aWxkLm9rKSB7XG4gICAgICBlcnJvcnMucHVzaChgZmFybSBzdHJ1Y3R1cmU6ICR7ZGVzY3JpYmVGYWlsdXJlKGZhcm1CdWlsZCl9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZhcm0uc3RydWN0dXJlID0gZmFybUJ1aWxkLmxlZGdlcjtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG9rOiBlcnJvcnMubGVuZ3RoID09PSAwLFxuICAgIGVycm9ycyxcbiAgICBob3VzZSxcbiAgICBwYXRoLFxuICAgIGZhcm0sXG4gICAgaW52ZW50b3J5QmVmb3JlLFxuICAgIGludmVudG9yeUFmdGVyOiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCksXG4gICAgaGFzaGVzOiB7XG4gICAgICB2b3hlbHM6IGNhbm9uaWNhbFJlZ2lvbkhhc2god29ybGQsIGxheW91dC5wcm90ZWN0ZWRSZWdpb24pLmhhc2gsXG4gICAgICBzdHJ1Y3R1cmVzOiBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoKHdvcmxkKSxcbiAgICAgIGludmVudG9yeTogY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZCksXG4gICAgICBlbnRpdGllczogY2Fub25pY2FsRW50aXR5SGFzaCh3b3JsZCwgbGF5b3V0LnByb3RlY3RlZFJlZ2lvbiksXG4gICAgfSxcbiAgfTtcbn1cblxuLyoqIFRvdGFsIHJlc291cmNlcyBwYWlkIHRvIHN0cnVjdHVyZXMgaW4gYSBzY2VuYXJpbyByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMlN0cnVjdHVyZUNvc3RzKHJlc3VsdDogTTAwMlNjZW5hcmlvUmVzdWx0KTogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiB7XG4gIGNvbnN0IHRvdGFsOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0ge307XG4gIGZvciAoY29uc3Qgc2l0ZSBvZiBbcmVzdWx0LmhvdXNlLCByZXN1bHQucGF0aCwgcmVzdWx0LmZhcm1dKSB7XG4gICAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMoc2l0ZS5zdHJ1Y3R1cmU/LmNvc3RQYWlkID8/IHt9KSkge1xuICAgICAgdG90YWxbcmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlXSA9ICh0b3RhbFtyZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGVdID8/IDApICsgKGFtb3VudCA/PyAwKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRvdGFsO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUtBLE9BQU8sVUFBVTtBQUNqQixPQUFPLFlBQVk7OztBQ0VuQixJQUFNLFNBQVMsb0JBQUksUUFBNkI7QUFlekMsU0FBUyxjQUFjLE9BQXdCO0FBQ3BELFNBQU8sT0FBTyxJ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QUFLO0FBQ3pCLFFBQU0sWUFBWSxHQUFHLEtBQUs7QUFDMUIsU0FBTyxNQUFNLFVBQVUsZ0JBQWdCLFVBQVUsZ0JBQWdCLEVBQUU7QUFDbkUsU0FBTyxNQUFNLFdBQVcsZ0JBQWdCLFdBQVcsZ0JBQWdCLENBQUM7QUFDcEUsU0FBTyxNQUFNLFNBQVMsZ0JBQWdCLFNBQVMsZ0JBQWdCLEVBQUU7QUFDakUsU0FBTyxNQUFNLFVBQVUsZ0JBQWdCLFVBQVUsZ0JBQWdCLENBQUM7QUFDbEUsU0FBTyxNQUFNLFNBQVMsZ0JBQWdCLFNBQVMsZ0JBQWdCLEdBQUc7QUFDbEUsU0FBTyxNQUFNLFVBQVUsZ0JBQWdCLFVBQVUsZ0JBQWdCLENBQUM7QUFDbEUsU0FBTztBQUFBLElBQ0wsRUFBRSxNQUFNLFdBQVcsVUFBVTtBQUFBLElBQzdCO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFFQSxTQUFPLFVBQVUsR0FBRyxRQUFRLEdBQUcsTUFBTTtBQUNyQyxTQUFPO0FBQUEsSUFDTCxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsT0FBTyxlQUFlLEVBQUU7QUFBQSxJQUN2RCxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsT0FBTyxlQUFlLEVBQUU7QUFBQSxFQUN6RDtBQUNBLFNBQU87QUFBQSxJQUNMLG9CQUFvQixFQUFFLE9BQU8sRUFBRSxPQUFPLGVBQWU7QUFBQSxJQUNyRCxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsT0FBTyxlQUFlO0FBQUEsRUFDdkQ7QUFDQSxTQUFPLE1BQU0sdUJBQXVCLEVBQUUsS0FBSyxHQUFHLHVCQUF1QixFQUFFLEtBQUssQ0FBQztBQUM3RSxTQUFPLFVBQVUscUJBQXFCLEVBQUUsT0FBTyxFQUFFLE9BQU8sUUFBUSxHQUFHLENBQUMsQ0FBQztBQUNyRSxTQUFPLFVBQVUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLE9BQU8sZUFBZSxHQUFHLENBQUMsQ0FBQztBQUcxRSxTQUFPLE1BQU0sVUFBVSxFQUFFLE9BQU8sS0FBSyxHQUFHLEdBQUcsRUFBRTtBQUM3QyxTQUFPLE1BQU0sbUJBQW1CLEVBQUUsT0FBTyxLQUFLLEdBQUcsR0FBRyxJQUFJLE1BQU07QUFDOUQsU0FBTyxNQUFNLFVBQVUsRUFBRSxPQUFPLEtBQUssR0FBRyxHQUFHLEVBQUU7QUFDN0MsU0FBTyxNQUFNLFVBQVUsRUFBRSxPQUFPLEtBQUssR0FBRyxHQUFHLEVBQUU7QUFDN0MsU0FBTyxNQUFNLFVBQVUsRUFBRSxPQUFPLEtBQUssR0FBRyxHQUFHLEVBQUU7QUFDN0MsU0FBTyxNQUFNLG1CQUFtQixFQUFFLE9BQU8sS0FBSyxHQUFHLEdBQUcsSUFBSSxJQUFJO0FBQzlELENBQUM7IiwKICAibmFtZXMiOiBbImEiLCAiYiIsICJzbW9vdGgiLCAiaWQiLCAiZGlnZXN0IiwgImZhaWwiLCAicHJlcEF1dGhvcml6ZXIiLCAic3RydWN0dXJlQXV0aG9yaXplciIsICJwcmVwIl0KfQo=
