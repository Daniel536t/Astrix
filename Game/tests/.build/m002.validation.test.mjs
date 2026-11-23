// tests/m002.validation.test.ts
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
  const key = chunkKey(cx, cz);
  const existing = world.chunks.get(key);
  if (existing) return existing;
  const t0 = performance.now();
  const data = new Uint8Array(CHUNK_VOLUME);
  const heights = new Uint8Array(CHUNK_AREA);
  const topMaterials = new Uint8Array(CHUNK_AREA);
  const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
  const seed = world.seed;
  const v2 = world.params.generatorVersion >= GENERATOR_V2 ? terrainV2(seed) : null;
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
  world.stats.generationMs += performance.now() - t0;
  world.dirty.add(key);
  generateEntities(world, chunk);
  return chunk;
}
var baseColumnCache = /* @__PURE__ */ new WeakMap();
function baseColumns(world, chunk) {
  let cache = baseColumnCache.get(world);
  if (!cache) {
    cache = /* @__PURE__ */ new Map();
    baseColumnCache.set(world, cache);
  }
  const cached = cache.get(chunk.key);
  if (cached) return cached;
  const columns = { heights: new Uint8Array(chunk.heights), topMaterials: new Uint8Array(chunk.topMaterials) };
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = chunkOriginX(chunk.cx) + lx, z = chunkOriginZ(chunk.cz) + lz;
      const version = world.params.generatorVersion;
      const h = baseHeightAt(world.seed, version, x, z);
      const slope = version >= GENERATOR_V2 ? versionedSlope(world.seed, version, x, z, h) : slopeAt(world.seed, x, z, h);
      const index = lz * CHUNK_SIZE + lx;
      columns.heights[index] = clamp(h - Y_MIN, 0, WORLD_HEIGHT - 1);
      columns.topMaterials[index] = version >= GENERATOR_V2 ? baseTopMaterialFor(world.seed, version, x, z, h, slope) : topMaterialAt(world.seed, x, z, h, slope);
    }
  }
  cache.set(chunk.key, columns);
  return columns;
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
function clearanceAt(world, x, z, height) {
  const surface = surfaceAt(world, x, z);
  for (let i = 0; i < height; i++) {
    if (getVoxel(world, x, surface + i, z) !== MAT.AIR) return false;
  }
  return true;
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
var DEFAULT_WALK = {
  maxStepUp: 1,
  maxStepDown: 1.5,
  maxWaterDepth: 0.4,
  maxSlope: 1,
  clearance: 2
};
function walkStep(world, fromX, fromZ, toX, toZ, params = DEFAULT_WALK) {
  const dx = Math.abs(Math.floor(toX) - Math.floor(fromX));
  const dz = Math.abs(Math.floor(toZ) - Math.floor(fromZ));
  if (dx + dz !== 1) {
    return { ok: false, reason: "not_adjacent", step: 0, waterDepth: 0 };
  }
  const from = columnAt(world, fromX, fromZ);
  const to = columnAt(world, toX, toZ);
  const step = to.surfaceY - from.surfaceY;
  if (step > params.maxStepUp) return { ok: false, reason: "step_up", step, waterDepth: to.waterDepth };
  if (-step > params.maxStepDown) return { ok: false, reason: "fall", step, waterDepth: to.waterDepth };
  if (to.waterDepth > params.maxWaterDepth) return { ok: false, reason: "water", step, waterDepth: to.waterDepth };
  if (to.slope > params.maxSlope) return { ok: false, reason: "slope", step, waterDepth: to.waterDepth };
  if (!clearanceAt(world, toX, toZ, params.clearance)) {
    return { ok: false, reason: "clearance", step, waterDepth: to.waterDepth };
  }
  return { ok: true, reason: "ok", step, waterDepth: to.waterDepth };
}
function effectiveGrade(world, x0, z0, x1, z1) {
  const a = columnAt(world, x0, z0);
  const b = columnAt(world, x1, z1);
  const run = Math.hypot(x1 - x0, z1 - z0);
  if (run === 0) return Math.abs(b.surfaceY - a.surfaceY);
  return Math.abs(b.surfaceY - a.surfaceY) / run;
}

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
function error(code, message, value, limit) {
  return { code, severity: "error", message, value, limit };
}
function prep(code, message, value, limit) {
  return { code, severity: "preparation", message, value, limit };
}
function validateSite(world, proposal2, query = new TerrainQuery(world), footprint) {
  const rect = normalizeRect(proposal2.rect);
  const rules = proposal2.rules;
  const reasons = [];
  const fp = footprint ?? query.footprint(rect, proposal2.floorY);
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
    siteId: proposal2.siteId,
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
function floorCandidates(stats) {
  const mean = Math.round(stats.meanY);
  const set = /* @__PURE__ */ new Set();
  for (let d = -1; d <= 1; d++) set.add(mean + d);
  set.add(stats.minY);
  set.add(stats.maxY);
  return [...set].filter((y) => y >= Y_MIN && y < Y_MAX).sort((a, b) => a - b);
}
function overlaps(a, b) {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
}
function candidateScore(v, distance) {
  const prepPenalty = v.state === "valid" ? 0 : 25;
  const grading = v.preparation.cutVolume + v.preparation.fillVolume;
  const clearing = v.preparation.obstructionIds.length * 4;
  return prepPenalty + grading + clearing + distance * 0.25;
}
function searchSites(world, rules, area, options = {}) {
  const t0 = performance.now();
  const step = Math.max(1, Math.floor(options.step ?? 2));
  const maxResults = Math.max(1, options.maxResults ?? 8);
  const distinct = options.distinct !== false;
  const maxDistance = options.maxDistance ?? Number.POSITIVE_INFINITY;
  const budgetMs = options.budgetMs ?? 100;
  const anchor = options.anchor ?? { x: (area.x0 + area.x1) / 2, z: (area.z0 + area.z1) / 2 };
  const query = new TerrainQuery(world);
  const all = [];
  let evaluated = 0;
  let rejected = 0;
  let truncated = false;
  const x1Max = area.x1 - rules.width + 1;
  const z1Max = area.z1 - rules.depth + 1;
  scan: for (let z = area.z0; z <= z1Max; z += step) {
    for (let x = area.x0; x <= x1Max; x += step) {
      const rect = { x0: x, z0: z, x1: x + rules.width - 1, z1: z + rules.depth - 1 };
      const cx = (rect.x0 + rect.x1) / 2;
      const cz = (rect.z0 + rect.z1) / 2;
      const distance = Math.hypot(cx - anchor.x, cz - anchor.z);
      if (distance > maxDistance) continue;
      if (options.near) {
        const nearDistance = Math.hypot(cx - options.near.x, cz - options.near.z);
        if (nearDistance > options.near.maxDistance) continue;
      }
      const stats = query.area(rect);
      let best = null;
      for (const floorY of floorCandidates(stats)) {
        evaluated++;
        const proposal2 = {
          siteId: `${rules.id}:${x},${z},${floorY}`,
          rect,
          floorY,
          rules
        };
        const footprint = query.footprint(rect, floorY);
        const validation = validateSite(world, proposal2, query, footprint);
        if (validation.state === "invalid") {
          rejected++;
          continue;
        }
        const score = candidateScore(validation, distance);
        const candidate = {
          siteId: proposal2.siteId,
          rect,
          floorY,
          state: validation.state,
          validation,
          cutVolume: validation.preparation.cutVolume,
          fillVolume: validation.preparation.fillVolume,
          obstructionCount: validation.preparation.obstructionIds.length,
          distance,
          score
        };
        if (!best || candidate.state === "valid" && best.state !== "valid" || candidate.state === best.state && candidate.score < best.score) {
          best = candidate;
        }
      }
      if (best) all.push(best);
    }
    if (performance.now() - t0 > budgetMs) {
      truncated = true;
      break scan;
    }
  }
  all.sort((a, b) => a.score - b.score || a.distance - b.distance || a.rect.x0 - b.rect.x0 || a.rect.z0 - b.rect.z0);
  const selected = [];
  for (const candidate of all) {
    if (distinct && selected.some((s) => overlaps(s.rect, candidate.rect))) continue;
    selected.push(candidate);
    if (selected.length >= maxResults) break;
  }
  return {
    candidates: selected,
    evaluated,
    rejected,
    elapsedMs: Math.round((performance.now() - t0) * 100) / 100,
    budgetMs,
    truncated
  };
}
function previewSite(world, proposal2, options = {}) {
  const query = new TerrainQuery(world);
  const validation = validateSite(world, proposal2, query);
  const fp = validation.query;
  const stats = fp.stats;
  const rect = normalizeRect(proposal2.rect);
  const rules = proposal2.rules;
  let perimeter = 0;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (x !== rect.x0 && x !== rect.x1 && z !== rect.z0 && z !== rect.z1) continue;
      if (columnAt(world, x, z).surfaceY !== proposal2.floorY) perimeter++;
    }
  }
  const foundation = {
    type: rules.foundation,
    plinthCells: rectColumns(rect) + stats.fillVolume,
    retainingWallCells: perimeter,
    cutVolume: stats.cutVolume,
    fillVolume: stats.fillVolume
  };
  let access = null;
  if (options.door && options.approach) {
    const door = options.door;
    const approach = options.approach;
    const reasons = [];
    const distance = Math.hypot(door.x - approach.x, door.z - approach.z);
    const steps = Math.max(1, Math.ceil(distance));
    let prevX = approach.x, prevZ = approach.z;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(approach.x + (door.x - approach.x) * t);
      const z = Math.round(approach.z + (door.z - approach.z) * t);
      if (x === prevX && z === prevZ) continue;
      const result = walkStep(world, prevX, prevZ, x, z, options.walk ?? DEFAULT_WALK);
      if (!result.ok) reasons.push(`${result.reason} at ${x},${z}`);
      prevX = x;
      prevZ = z;
    }
    access = {
      door,
      approach,
      distance,
      grade: effectiveGrade(world, approach.x, approach.z, door.x, door.z),
      walkable: reasons.length === 0,
      reasons
    };
  }
  const y0 = proposal2.floorY - Math.max(1, stats.maxCut) - 1;
  const y1 = proposal2.floorY + Math.max(rules.wallHeight, 1) + 1;
  const envelope = [
    {
      ...expandRect(rect, 2),
      y0: Math.max(Y_MIN, y0),
      y1: Math.min(Y_MAX - 1, y1)
    }
  ];
  if (access) {
    const ax0 = Math.min(access.door.x, access.approach.x) - 1;
    const ax1 = Math.max(access.door.x, access.approach.x) + 1;
    const az0 = Math.min(access.door.z, access.approach.z) - 1;
    const az1 = Math.max(access.door.z, access.approach.z) + 1;
    const aMin = Math.min(surfaceAt(world, ax0, az0), surfaceAt(world, ax1, az1));
    const aMax = Math.max(surfaceAt(world, ax0, az0), surfaceAt(world, ax1, az1));
    envelope.push({
      x0: ax0,
      x1: ax1,
      z0: az0,
      z1: az1,
      y0: Math.max(Y_MIN, aMin - 2),
      y1: Math.min(Y_MAX - 1, aMax + 2)
    });
  }
  return {
    siteId: proposal2.siteId,
    state: validation.state,
    rect,
    floorY: proposal2.floorY,
    rules,
    reasons: validation.reasons,
    terrain: {
      minY: stats.minY,
      maxY: stats.maxY,
      meanY: stats.meanY,
      relief: stats.relief,
      maxStep: stats.maxStep,
      cutVolume: stats.cutVolume,
      fillVolume: stats.fillVolume,
      maxCut: stats.maxCut,
      maxFill: stats.maxFill
    },
    foundation,
    obstructions: stats.obstructions.map((o) => ({
      entityId: o.entityId,
      kind: o.kind,
      x: o.x,
      z: o.z,
      action: validation.state === "invalid" ? "blocked" : "clear"
    })),
    access,
    envelope
  };
}

// src/sim/preparation.ts
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
function chunkKeys(world) {
  return [...world.chunks.keys()].sort();
}

// src/sim/m002.ts
var M002_SEED = 1337;
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

// tests/m002.validation.test.ts
function fingerprint(world) {
  return {
    revision: world.revision,
    voxels: canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash,
    entities: canonicalEntityHash(world, M002_LAYOUT.protectedRegion),
    inventory: canonicalInventoryHash(world)
  };
}
function proposal(siteId, rect, floorY) {
  return { siteId, rect, floorY, rules: HOUSE_RULES };
}
function center(rect) {
  return { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
}
test("validator rejects the slope site with explicit rule errors", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const validation = validateSite(world, proposal(
    layout.rejected.id,
    layout.rejected.rect,
    layout.rejected.floorY
  ));
  assert.equal(validation.state, "invalid");
  const codes = validation.reasons.map((r) => r.code);
  for (const code of [
    "slope_exceeded",
    "cut_exceeded",
    "cut_volume_exceeded"
  ]) {
    assert.ok(codes.includes(code), `missing ${code}: ${codes.join(", ")}`);
  }
  assert.ok(validation.reasons.every((r) => r.severity === "error" || r.code === "needs_grading" || r.code === "needs_clearing"));
  assert.ok(validation.reasons.filter((r) => r.severity === "error").length >= 3);
  assert.ok(validation.query.stats.relief >= 5);
  assert.ok(validation.query.support.maxCut >= 5);
  assert.ok(validation.query.stats.cutVolume >= 40);
  assert.equal(validation.query.stats.obstructions.length, 0);
  assert.equal(validation.preparation.obstructionIds.length, 0);
  assert.deepEqual(fingerprint(world), before);
});
test("validator separates footprint errors from preparation work", () => {
  const { world } = createM002Fixture();
  const before = fingerprint(world);
  const wrong = validateSite(world, proposal(
    "wrong-size",
    { x0: -60, z0: -46, x1: -54, z1: -41 },
    11
  ));
  assert.equal(wrong.state, "invalid");
  assert.ok(wrong.reasons.some((r) => r.code === "footprint_mismatch"));
  const outside = validateSite(world, proposal(
    "outside",
    { x0: 1021, z0: 0, x1: 1028, z1: 5 },
    1
  ));
  assert.equal(outside.state, "invalid");
  assert.ok(outside.reasons.some((r) => r.code === "out_of_bounds"));
  assert.deepEqual(fingerprint(world), before);
});
test("validator accepts the house shelf with preparation only", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const site = proposal(layout.house.id, layout.house.rect, layout.house.floorY);
  const validation = validateSite(world, site);
  assert.equal(validation.state, "valid_with_preparation");
  assert.deepEqual(validation.reasons.map((r) => r.code), ["needs_grading"]);
  assert.equal(validation.reasons[0].severity, "preparation");
  assert.equal(validation.preparation.needsGrading, true);
  assert.equal(validation.preparation.needsClearing, false);
  assert.equal(validation.preparation.cutVolume, 3);
  assert.equal(validation.preparation.fillVolume, 18);
  assert.equal(validation.preparation.maxCut, 1);
  assert.equal(validation.preparation.maxFill, 1);
  assert.equal(validation.preparation.foundation, "graded_pad");
  assert.equal(validation.preparation.obstructionIds.length, 0);
  assert.equal(validation.query.support.total, rectColumns(layout.house.rect));
  assert.equal(validation.query.overhangCells.length, 0);
  const query = new TerrainQuery(world);
  const footprint = query.footprint(layout.house.rect, layout.house.floorY);
  const reused = validateSite(world, site, query, footprint);
  assert.deepEqual(reused, validation);
  assert.deepEqual(fingerprint(world), before);
});
test("validator accepts a flat footprint with no preparation", () => {
  const { world } = createM002Fixture();
  const before = fingerprint(world);
  const validation = validateSite(world, proposal(
    "flat-shelf",
    { x0: -14, z0: -60, x1: -7, z1: -55 },
    21
  ));
  assert.equal(validation.state, "valid");
  assert.equal(validation.reasons.length, 0);
  assert.equal(validation.preparation.needsGrading, false);
  assert.equal(validation.preparation.needsClearing, false);
  assert.equal(validation.preparation.cutVolume, 0);
  assert.equal(validation.preparation.fillVolume, 0);
  assert.equal(validation.query.stats.relief, 0);
  assert.deepEqual(fingerprint(world), before);
});
test("candidate search is cost-ranked, deterministic and inside its budget", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const anchor = center(layout.rejected.rect);
  const options = {
    step: 2,
    anchor,
    maxDistance: 32,
    maxResults: 6,
    budgetMs: 1e3
  };
  searchSites(world, HOUSE_RULES, layout.searchArea, options);
  const runs = [0, 1, 2].map(() => searchSites(world, HOUSE_RULES, layout.searchArea, options));
  const best = runs.reduce((a, b) => a.elapsedMs <= b.elapsedMs ? a : b);
  assert.equal(best.truncated, false);
  assert.ok(best.elapsedMs < 100, `search took ${best.elapsedMs} ms`);
  assert.ok(best.evaluated > 500, `only ${best.evaluated} evaluations`);
  assert.ok(best.rejected > 0);
  assert.ok(best.candidates.length >= 2);
  for (let i = 1; i < best.candidates.length; i++) {
    assert.ok(
      best.candidates[i - 1].score <= best.candidates[i].score,
      "candidates must be sorted by score"
    );
  }
  for (const candidate of best.candidates) {
    assert.ok(candidate.state === "valid" || candidate.state === "valid_with_preparation");
    assert.equal(candidate.validation.state, candidate.state);
    const direct = validateSite(world, proposal(
      candidate.siteId,
      candidate.rect,
      candidate.floorY
    ));
    assert.equal(direct.state, candidate.state);
    assert.deepEqual(direct.reasons, candidate.validation.reasons);
  }
  for (let i = 0; i < best.candidates.length; i++) {
    for (let j = i + 1; j < best.candidates.length; j++) {
      const a = best.candidates[i].rect;
      const b = best.candidates[j].rect;
      const overlaps2 = a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
      assert.equal(overlaps2, false, `candidates ${i} and ${j} overlap`);
    }
  }
  assert.deepEqual(best.candidates[0].rect, { x0: -64, z0: -68, x1: -57, z1: -63 });
  assert.equal(best.candidates[0].floorY, 10);
  assert.deepEqual(fingerprint(world), before);
});
test("search honours the wall-clock budget", () => {
  const { world, layout } = createM002Fixture();
  const result = searchSites(world, HOUSE_RULES, layout.searchArea, {
    step: 1,
    budgetMs: 1,
    maxResults: 8
  });
  assert.equal(result.truncated, true);
  assert.ok(result.elapsedMs < 1e3, `budget overshoot ${result.elapsedMs} ms`);
});
test("farm-proximity constraint selects the viable shelf near the field", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const anchor = center(layout.rejected.rect);
  const farmCenter = center(layout.farm.rect);
  const constrained = searchSites(world, HOUSE_RULES, layout.searchArea, {
    step: 2,
    anchor,
    maxDistance: 32,
    maxResults: 6,
    near: { ...farmCenter, maxDistance: 30 }
  });
  assert.ok(constrained.candidates.length >= 1);
  const pinnedHouse = constrained.candidates.find((candidate) => JSON.stringify(candidate.rect) === JSON.stringify(layout.house.rect));
  assert.ok(pinnedHouse, "the authored house shelf remains a viable constrained candidate");
  assert.equal(pinnedHouse.floorY, layout.house.floorY);
  assert.equal(pinnedHouse.state, "valid_with_preparation");
  for (const candidate of constrained.candidates) {
    const c = center(candidate.rect);
    const distance = Math.hypot(c.x - farmCenter.x, c.z - farmCenter.z);
    assert.ok(distance <= 30, `candidate ${candidate.siteId} is ${distance} m from the farm`);
  }
  const unconstrained = searchSites(world, HOUSE_RULES, layout.searchArea, {
    step: 2,
    anchor,
    maxDistance: 32,
    maxResults: 1
  });
  const top = unconstrained.candidates[0];
  const topCenter = center(top.rect);
  const topDistance = Math.hypot(topCenter.x - farmCenter.x, topCenter.z - farmCenter.z);
  assert.ok(topDistance > 30, `unconstrained winner is only ${topDistance} m from the farm`);
  assert.notDeepEqual(top.rect, pinnedHouse.rect);
  assert.deepEqual(fingerprint(world), before);
});
test("preview exposes valid, preparation and invalid states without mutating the world", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const rejected = previewSite(
    world,
    proposal(layout.rejected.id, layout.rejected.rect, layout.rejected.floorY),
    { door: layout.rejected.door, approach: layout.rejected.approach }
  );
  assert.equal(rejected.state, "invalid");
  assert.equal(rejected.obstructions.length, 0);
  assert.ok(rejected.foundation.cutVolume >= 40);
  assert.ok(rejected.foundation.retainingWallCells > 0);
  const house = previewSite(
    world,
    proposal(layout.house.id, layout.house.rect, layout.house.floorY),
    { door: layout.house.door, approach: layout.house.approach }
  );
  assert.equal(house.state, "valid_with_preparation");
  assert.deepEqual(house.reasons.map((r) => r.code), ["needs_grading"]);
  assert.equal(house.obstructions.length, 0);
  assert.equal(house.foundation.type, "graded_pad");
  assert.equal(house.foundation.cutVolume, 3);
  assert.equal(house.foundation.fillVolume, 18);
  assert.equal(house.foundation.plinthCells, rectColumns(layout.house.rect) + 18);
  assert.ok(house.access);
  assert.equal(house.access.walkable, true);
  assert.equal(house.access.distance, 8);
  assert.ok(Math.abs(house.access.grade - 0.25) < 1e-9);
  for (const [x, z] of [
    [layout.house.rect.x0, layout.house.rect.z0],
    [layout.house.rect.x1, layout.house.rect.z0],
    [layout.house.rect.x0, layout.house.rect.z1],
    [layout.house.rect.x1, layout.house.rect.z1]
  ]) {
    assert.equal(
      envelopeContains(house.envelope, x, layout.house.floorY, z),
      true,
      `envelope misses ${x},${layout.house.floorY},${z}`
    );
  }
  const flat = previewSite(
    world,
    proposal("flat-shelf", { x0: -14, z0: -60, x1: -7, z1: -55 }, 21),
    { door: { x: -7, z: -57 }, approach: { x: -1, z: -57 } }
  );
  assert.equal(flat.state, "valid");
  assert.equal(flat.reasons.length, 0);
  assert.equal(flat.foundation.cutVolume, 0);
  assert.equal(flat.foundation.fillVolume, 0);
  assert.equal(flat.foundation.retainingWallCells, 0);
  assert.equal(flat.access?.walkable, true);
  assert.deepEqual(fingerprint(world), before);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMi52YWxpZGF0aW9uLnRlc3QudHMiLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS9ub2lzZS50cyIsICIuLi8uLi9zcmMvc2ltL2h5ZHJvbG9neS50cyIsICIuLi8uLi9zcmMvc2ltL21hdGVyaWFscy50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4tdjIudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3NpbS9jb25zdHJ1Y3Rpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9wcmVwYXJhdGlvbi50cyIsICIuLi8uLi9zcmMvc2ltL2Nhbm9uaWNhbC50cyIsICIuLi8uLi9zcmMvc2ltL20wMDIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIE0wMDIgc3RhZ2UgMiBnYXRlOiBvbmUgc2hhcmVkIHZhbGlkYXRvciwgY29zdC1yYW5rZWQgc2VhcmNoLCB0aHJlZS1zdGF0ZVxuLy8gcHJldmlldy4gRXZlcnkgY2hlY2sgaXMgcmVhZC1vbmx5IHdpdGggcmVzcGVjdCB0byB0aGUgdm94ZWwgd29ybGQuXG5pbXBvcnQgdGVzdCBmcm9tICdub2RlOnRlc3QnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdub2RlOmFzc2VydC9zdHJpY3QnO1xuaW1wb3J0IHtcbiAgY2Fub25pY2FsUmVnaW9uSGFzaCwgY2Fub25pY2FsRW50aXR5SGFzaCwgY2Fub25pY2FsSW52ZW50b3J5SGFzaCxcbn0gZnJvbSAnLi4vc3JjL3NpbS9jYW5vbmljYWwnO1xuaW1wb3J0IHsgY3JlYXRlTTAwMkZpeHR1cmUsIE0wMDJfTEFZT1VUIH0gZnJvbSAnLi4vc3JjL3NpbS9tMDAyJztcbmltcG9ydCB7IFRlcnJhaW5RdWVyeSwgcmVjdENvbHVtbnMsIGVudmVsb3BlQ29udGFpbnMsIFJlY3QgfSBmcm9tICcuLi9zcmMvc2ltL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgSE9VU0VfUlVMRVMsIFNpdGVQcm9wb3NhbCwgdmFsaWRhdGVTaXRlLCBzZWFyY2hTaXRlcywgcHJldmlld1NpdGUsXG59IGZyb20gJy4uL3NyYy9zaW0vY29uc3RydWN0aW9uJztcblxudHlwZSBXb3JsZCA9IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZU0wMDJGaXh0dXJlPlsnd29ybGQnXTtcblxuZnVuY3Rpb24gZmluZ2VycHJpbnQod29ybGQ6IFdvcmxkKSB7XG4gIHJldHVybiB7XG4gICAgcmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgIHZveGVsczogY2Fub25pY2FsUmVnaW9uSGFzaCh3b3JsZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uKS5oYXNoLFxuICAgIGVudGl0aWVzOiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkLCBNMDAyX0xBWU9VVC5wcm90ZWN0ZWRSZWdpb24pLFxuICAgIGludmVudG9yeTogY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZCksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHByb3Bvc2FsKHNpdGVJZDogc3RyaW5nLCByZWN0OiBSZWN0LCBmbG9vclk6IG51bWJlcik6IFNpdGVQcm9wb3NhbCB7XG4gIHJldHVybiB7IHNpdGVJZCwgcmVjdCwgZmxvb3JZLCBydWxlczogSE9VU0VfUlVMRVMgfTtcbn1cblxuZnVuY3Rpb24gY2VudGVyKHJlY3Q6IFJlY3QpIHtcbiAgcmV0dXJuIHsgeDogKHJlY3QueDAgKyByZWN0LngxKSAvIDIsIHo6IChyZWN0LnowICsgcmVjdC56MSkgLyAyIH07XG59XG5cbnRlc3QoJ3ZhbGlkYXRvciByZWplY3RzIHRoZSBzbG9wZSBzaXRlIHdpdGggZXhwbGljaXQgcnVsZSBlcnJvcnMnLCAoKSA9PiB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuXG4gIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsKFxuICAgIGxheW91dC5yZWplY3RlZC5pZCwgbGF5b3V0LnJlamVjdGVkLnJlY3QsIGxheW91dC5yZWplY3RlZC5mbG9vclksXG4gICkpO1xuXG4gIGFzc2VydC5lcXVhbCh2YWxpZGF0aW9uLnN0YXRlLCAnaW52YWxpZCcpO1xuICBjb25zdCBjb2RlcyA9IHZhbGlkYXRpb24ucmVhc29ucy5tYXAoKHIpID0+IHIuY29kZSk7XG4gIGZvciAoY29uc3QgY29kZSBvZiBbXG4gICAgJ3Nsb3BlX2V4Y2VlZGVkJywgJ2N1dF9leGNlZWRlZCcsICdjdXRfdm9sdW1lX2V4Y2VlZGVkJyxcbiAgXSkge1xuICAgIGFzc2VydC5vayhjb2Rlcy5pbmNsdWRlcyhjb2RlIGFzIG5ldmVyKSwgYG1pc3NpbmcgJHtjb2RlfTogJHtjb2Rlcy5qb2luKCcsICcpfWApO1xuICB9XG4gIGFzc2VydC5vayh2YWxpZGF0aW9uLnJlYXNvbnMuZXZlcnkoKHIpID0+IHIuc2V2ZXJpdHkgPT09ICdlcnJvcidcbiAgICB8fCByLmNvZGUgPT09ICduZWVkc19ncmFkaW5nJyB8fCByLmNvZGUgPT09ICduZWVkc19jbGVhcmluZycpKTtcbiAgYXNzZXJ0Lm9rKHZhbGlkYXRpb24ucmVhc29ucy5maWx0ZXIoKHIpID0+IHIuc2V2ZXJpdHkgPT09ICdlcnJvcicpLmxlbmd0aCA+PSAzKTtcblxuICAvLyBUaGUgcmVqZWN0aW9uIGlzIGdyb3VuZGVkIGluIHJlYWwgdGVycmFpbiwgbm90IGEgc3ludGhldGljIHJ1bGUgZXhjZXB0aW9uLlxuICBhc3NlcnQub2sodmFsaWRhdGlvbi5xdWVyeS5zdGF0cy5yZWxpZWYgPj0gNSk7XG4gIGFzc2VydC5vayh2YWxpZGF0aW9uLnF1ZXJ5LnN1cHBvcnQubWF4Q3V0ID49IDUpO1xuICBhc3NlcnQub2sodmFsaWRhdGlvbi5xdWVyeS5zdGF0cy5jdXRWb2x1bWUgPj0gNDApO1xuICBhc3NlcnQuZXF1YWwodmFsaWRhdGlvbi5xdWVyeS5zdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRpb24ucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHMubGVuZ3RoLCAwKTtcblxuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYmVmb3JlKTtcbn0pO1xuXG50ZXN0KCd2YWxpZGF0b3Igc2VwYXJhdGVzIGZvb3RwcmludCBlcnJvcnMgZnJvbSBwcmVwYXJhdGlvbiB3b3JrJywgKCkgPT4ge1xuICBjb25zdCB7IHdvcmxkIH0gPSBjcmVhdGVNMDAyRml4dHVyZSgpO1xuICBjb25zdCBiZWZvcmUgPSBmaW5nZXJwcmludCh3b3JsZCk7XG5cbiAgY29uc3Qgd3JvbmcgPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsKFxuICAgICd3cm9uZy1zaXplJywgeyB4MDogLTYwLCB6MDogLTQ2LCB4MTogLTU0LCB6MTogLTQxIH0sIDExLFxuICApKTtcbiAgYXNzZXJ0LmVxdWFsKHdyb25nLnN0YXRlLCAnaW52YWxpZCcpO1xuICBhc3NlcnQub2sod3JvbmcucmVhc29ucy5zb21lKChyKSA9PiByLmNvZGUgPT09ICdmb290cHJpbnRfbWlzbWF0Y2gnKSk7XG5cbiAgY29uc3Qgb3V0c2lkZSA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwoXG4gICAgJ291dHNpZGUnLCB7IHgwOiAxMDIxLCB6MDogMCwgeDE6IDEwMjgsIHoxOiA1IH0sIDEsXG4gICkpO1xuICBhc3NlcnQuZXF1YWwob3V0c2lkZS5zdGF0ZSwgJ2ludmFsaWQnKTtcbiAgYXNzZXJ0Lm9rKG91dHNpZGUucmVhc29ucy5zb21lKChyKSA9PiByLmNvZGUgPT09ICdvdXRfb2ZfYm91bmRzJykpO1xuXG4gIGFzc2VydC5kZWVwRXF1YWwoZmluZ2VycHJpbnQod29ybGQpLCBiZWZvcmUpO1xufSk7XG5cbnRlc3QoJ3ZhbGlkYXRvciBhY2NlcHRzIHRoZSBob3VzZSBzaGVsZiB3aXRoIHByZXBhcmF0aW9uIG9ubHknLCAoKSA9PiB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBzaXRlID0gcHJvcG9zYWwobGF5b3V0LmhvdXNlLmlkLCBsYXlvdXQuaG91c2UucmVjdCwgbGF5b3V0LmhvdXNlLmZsb29yWSk7XG5cbiAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgc2l0ZSk7XG4gIGFzc2VydC5lcXVhbCh2YWxpZGF0aW9uLnN0YXRlLCAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHZhbGlkYXRpb24ucmVhc29ucy5tYXAoKHIpID0+IHIuY29kZSksIFsnbmVlZHNfZ3JhZGluZyddKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRpb24ucmVhc29uc1swXS5zZXZlcml0eSwgJ3ByZXBhcmF0aW9uJyk7XG4gIGFzc2VydC5lcXVhbCh2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm5lZWRzR3JhZGluZywgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbCh2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm5lZWRzQ2xlYXJpbmcsIGZhbHNlKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRpb24ucHJlcGFyYXRpb24uY3V0Vm9sdW1lLCAzKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZmlsbFZvbHVtZSwgMTgpO1xuICBhc3NlcnQuZXF1YWwodmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5tYXhDdXQsIDEpO1xuICBhc3NlcnQuZXF1YWwodmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5tYXhGaWxsLCAxKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZm91bmRhdGlvbiwgJ2dyYWRlZF9wYWQnKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRpb24ucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHMubGVuZ3RoLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRpb24ucXVlcnkuc3VwcG9ydC50b3RhbCwgcmVjdENvbHVtbnMobGF5b3V0LmhvdXNlLnJlY3QpKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRpb24ucXVlcnkub3ZlcmhhbmdDZWxscy5sZW5ndGgsIDApO1xuXG4gIC8vIEEgY2FsbGVyIHRoYXQgYWxyZWFkeSBldmFsdWF0ZWQgdGhlIGZvb3RwcmludCBnZXRzIHRoZSBpZGVudGljYWwgdmVyZGljdC5cbiAgY29uc3QgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKTtcbiAgY29uc3QgZm9vdHByaW50ID0gcXVlcnkuZm9vdHByaW50KGxheW91dC5ob3VzZS5yZWN0LCBsYXlvdXQuaG91c2UuZmxvb3JZKTtcbiAgY29uc3QgcmV1c2VkID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBzaXRlLCBxdWVyeSwgZm9vdHByaW50KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChyZXVzZWQsIHZhbGlkYXRpb24pO1xuXG4gIGFzc2VydC5kZWVwRXF1YWwoZmluZ2VycHJpbnQod29ybGQpLCBiZWZvcmUpO1xufSk7XG5cbnRlc3QoJ3ZhbGlkYXRvciBhY2NlcHRzIGEgZmxhdCBmb290cHJpbnQgd2l0aCBubyBwcmVwYXJhdGlvbicsICgpID0+IHtcbiAgY29uc3QgeyB3b3JsZCB9ID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuXG4gIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsKFxuICAgICdmbGF0LXNoZWxmJywgeyB4MDogLTE0LCB6MDogLTYwLCB4MTogLTcsIHoxOiAtNTUgfSwgMjEsXG4gICkpO1xuICBhc3NlcnQuZXF1YWwodmFsaWRhdGlvbi5zdGF0ZSwgJ3ZhbGlkJyk7XG4gIGFzc2VydC5lcXVhbCh2YWxpZGF0aW9uLnJlYXNvbnMubGVuZ3RoLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRpb24ucHJlcGFyYXRpb24ubmVlZHNHcmFkaW5nLCBmYWxzZSk7XG4gIGFzc2VydC5lcXVhbCh2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm5lZWRzQ2xlYXJpbmcsIGZhbHNlKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRpb24ucHJlcGFyYXRpb24uY3V0Vm9sdW1lLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZmlsbFZvbHVtZSwgMCk7XG4gIGFzc2VydC5lcXVhbCh2YWxpZGF0aW9uLnF1ZXJ5LnN0YXRzLnJlbGllZiwgMCk7XG5cbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGJlZm9yZSk7XG59KTtcblxudGVzdCgnY2FuZGlkYXRlIHNlYXJjaCBpcyBjb3N0LXJhbmtlZCwgZGV0ZXJtaW5pc3RpYyBhbmQgaW5zaWRlIGl0cyBidWRnZXQnLCAoKSA9PiB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBhbmNob3IgPSBjZW50ZXIobGF5b3V0LnJlamVjdGVkLnJlY3QpO1xuICBjb25zdCBvcHRpb25zID0ge1xuICAgIHN0ZXA6IDIsIGFuY2hvciwgbWF4RGlzdGFuY2U6IDMyLCBtYXhSZXN1bHRzOiA2LCBidWRnZXRNczogMTAwMCxcbiAgfTtcblxuICAvLyBXYXJtLXVwIHJ1biBwbHVzIHRocmVlIG1lYXN1cmVkIHJ1bnM7IHRoZSBmYXN0ZXN0IGlzIHRoZSBob25lc3QgbWFjaGluZVxuICAvLyB0aW1lLCBpbmRlcGVuZGVudCBvZiB0cmFuc2llbnQgbG9hZCBmcm9tIG90aGVyIHRlc3QgZmlsZXMuXG4gIHNlYXJjaFNpdGVzKHdvcmxkLCBIT1VTRV9SVUxFUywgbGF5b3V0LnNlYXJjaEFyZWEsIG9wdGlvbnMpO1xuICBjb25zdCBydW5zID0gWzAsIDEsIDJdLm1hcCgoKSA9PiBzZWFyY2hTaXRlcyh3b3JsZCwgSE9VU0VfUlVMRVMsIGxheW91dC5zZWFyY2hBcmVhLCBvcHRpb25zKSk7XG4gIGNvbnN0IGJlc3QgPSBydW5zLnJlZHVjZSgoYSwgYikgPT4gKGEuZWxhcHNlZE1zIDw9IGIuZWxhcHNlZE1zID8gYSA6IGIpKTtcblxuICBhc3NlcnQuZXF1YWwoYmVzdC50cnVuY2F0ZWQsIGZhbHNlKTtcbiAgYXNzZXJ0Lm9rKGJlc3QuZWxhcHNlZE1zIDwgMTAwLCBgc2VhcmNoIHRvb2sgJHtiZXN0LmVsYXBzZWRNc30gbXNgKTtcbiAgYXNzZXJ0Lm9rKGJlc3QuZXZhbHVhdGVkID4gNTAwLCBgb25seSAke2Jlc3QuZXZhbHVhdGVkfSBldmFsdWF0aW9uc2ApO1xuICBhc3NlcnQub2soYmVzdC5yZWplY3RlZCA+IDApO1xuICBhc3NlcnQub2soYmVzdC5jYW5kaWRhdGVzLmxlbmd0aCA+PSAyKTtcblxuICBmb3IgKGxldCBpID0gMTsgaSA8IGJlc3QuY2FuZGlkYXRlcy5sZW5ndGg7IGkrKykge1xuICAgIGFzc2VydC5vayhcbiAgICAgIGJlc3QuY2FuZGlkYXRlc1tpIC0gMV0uc2NvcmUgPD0gYmVzdC5jYW5kaWRhdGVzW2ldLnNjb3JlLFxuICAgICAgJ2NhbmRpZGF0ZXMgbXVzdCBiZSBzb3J0ZWQgYnkgc2NvcmUnLFxuICAgICk7XG4gIH1cbiAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgYmVzdC5jYW5kaWRhdGVzKSB7XG4gICAgYXNzZXJ0Lm9rKGNhbmRpZGF0ZS5zdGF0ZSA9PT0gJ3ZhbGlkJyB8fCBjYW5kaWRhdGUuc3RhdGUgPT09ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJyk7XG4gICAgYXNzZXJ0LmVxdWFsKGNhbmRpZGF0ZS52YWxpZGF0aW9uLnN0YXRlLCBjYW5kaWRhdGUuc3RhdGUpO1xuICAgIGNvbnN0IGRpcmVjdCA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwoXG4gICAgICBjYW5kaWRhdGUuc2l0ZUlkLCBjYW5kaWRhdGUucmVjdCwgY2FuZGlkYXRlLmZsb29yWSxcbiAgICApKTtcbiAgICBhc3NlcnQuZXF1YWwoZGlyZWN0LnN0YXRlLCBjYW5kaWRhdGUuc3RhdGUpO1xuICAgIGFzc2VydC5kZWVwRXF1YWwoZGlyZWN0LnJlYXNvbnMsIGNhbmRpZGF0ZS52YWxpZGF0aW9uLnJlYXNvbnMpO1xuICB9XG5cbiAgLy8gRGlzdGluY3QgcmVzdWx0cyBuZXZlciBvdmVybGFwLlxuICBmb3IgKGxldCBpID0gMDsgaSA8IGJlc3QuY2FuZGlkYXRlcy5sZW5ndGg7IGkrKykge1xuICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IGJlc3QuY2FuZGlkYXRlcy5sZW5ndGg7IGorKykge1xuICAgICAgY29uc3QgYSA9IGJlc3QuY2FuZGlkYXRlc1tpXS5yZWN0O1xuICAgICAgY29uc3QgYiA9IGJlc3QuY2FuZGlkYXRlc1tqXS5yZWN0O1xuICAgICAgY29uc3Qgb3ZlcmxhcHMgPSBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejA7XG4gICAgICBhc3NlcnQuZXF1YWwob3ZlcmxhcHMsIGZhbHNlLCBgY2FuZGlkYXRlcyAke2l9IGFuZCAke2p9IG92ZXJsYXBgKTtcbiAgICB9XG4gIH1cblxuICAvLyBSZXRpcmVkIHN0b25lcyBubyBsb25nZXIgb2JzdHJ1Y3Qgb3IgYWRkIHByZXBhcmF0aW9uIGNvc3Q7IHRoZSBuZXcgdG9wXG4gIC8vIHJlc3VsdCBpcyBzaW1wbHkgY2hlYXBlci4gVGVycmFpbiBhbmQgd29yay1lbnZlbG9wZSBydWxlcyBhcmUgdW5jaGFuZ2VkLlxuICBhc3NlcnQuZGVlcEVxdWFsKGJlc3QuY2FuZGlkYXRlc1swXS5yZWN0LCB7IHgwOiAtNjQsIHowOiAtNjgsIHgxOiAtNTcsIHoxOiAtNjMgfSk7XG4gIGFzc2VydC5lcXVhbChiZXN0LmNhbmRpZGF0ZXNbMF0uZmxvb3JZLCAxMCk7XG5cbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGJlZm9yZSk7XG59KTtcblxudGVzdCgnc2VhcmNoIGhvbm91cnMgdGhlIHdhbGwtY2xvY2sgYnVkZ2V0JywgKCkgPT4ge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG4gIGNvbnN0IHJlc3VsdCA9IHNlYXJjaFNpdGVzKHdvcmxkLCBIT1VTRV9SVUxFUywgbGF5b3V0LnNlYXJjaEFyZWEsIHtcbiAgICBzdGVwOiAxLCBidWRnZXRNczogMSwgbWF4UmVzdWx0czogOCxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChyZXN1bHQudHJ1bmNhdGVkLCB0cnVlKTtcbiAgYXNzZXJ0Lm9rKHJlc3VsdC5lbGFwc2VkTXMgPCAxMDAwLCBgYnVkZ2V0IG92ZXJzaG9vdCAke3Jlc3VsdC5lbGFwc2VkTXN9IG1zYCk7XG59KTtcblxudGVzdCgnZmFybS1wcm94aW1pdHkgY29uc3RyYWludCBzZWxlY3RzIHRoZSB2aWFibGUgc2hlbGYgbmVhciB0aGUgZmllbGQnLCAoKSA9PiB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBhbmNob3IgPSBjZW50ZXIobGF5b3V0LnJlamVjdGVkLnJlY3QpO1xuICBjb25zdCBmYXJtQ2VudGVyID0gY2VudGVyKGxheW91dC5mYXJtLnJlY3QpO1xuXG4gIGNvbnN0IGNvbnN0cmFpbmVkID0gc2VhcmNoU2l0ZXMod29ybGQsIEhPVVNFX1JVTEVTLCBsYXlvdXQuc2VhcmNoQXJlYSwge1xuICAgIHN0ZXA6IDIsIGFuY2hvciwgbWF4RGlzdGFuY2U6IDMyLCBtYXhSZXN1bHRzOiA2LFxuICAgIG5lYXI6IHsgLi4uZmFybUNlbnRlciwgbWF4RGlzdGFuY2U6IDMwIH0sXG4gIH0pO1xuXG4gIGFzc2VydC5vayhjb25zdHJhaW5lZC5jYW5kaWRhdGVzLmxlbmd0aCA+PSAxKTtcbiAgY29uc3QgcGlubmVkSG91c2UgPSBjb25zdHJhaW5lZC5jYW5kaWRhdGVzLmZpbmQoKGNhbmRpZGF0ZSkgPT5cbiAgICBKU09OLnN0cmluZ2lmeShjYW5kaWRhdGUucmVjdCkgPT09IEpTT04uc3RyaW5naWZ5KGxheW91dC5ob3VzZS5yZWN0KSk7XG4gIGFzc2VydC5vayhwaW5uZWRIb3VzZSwgJ3RoZSBhdXRob3JlZCBob3VzZSBzaGVsZiByZW1haW5zIGEgdmlhYmxlIGNvbnN0cmFpbmVkIGNhbmRpZGF0ZScpO1xuICBhc3NlcnQuZXF1YWwocGlubmVkSG91c2UuZmxvb3JZLCBsYXlvdXQuaG91c2UuZmxvb3JZKTtcbiAgYXNzZXJ0LmVxdWFsKHBpbm5lZEhvdXNlLnN0YXRlLCAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicpO1xuICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjb25zdHJhaW5lZC5jYW5kaWRhdGVzKSB7XG4gICAgY29uc3QgYyA9IGNlbnRlcihjYW5kaWRhdGUucmVjdCk7XG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLmh5cG90KGMueCAtIGZhcm1DZW50ZXIueCwgYy56IC0gZmFybUNlbnRlci56KTtcbiAgICBhc3NlcnQub2soZGlzdGFuY2UgPD0gMzAsIGBjYW5kaWRhdGUgJHtjYW5kaWRhdGUuc2l0ZUlkfSBpcyAke2Rpc3RhbmNlfSBtIGZyb20gdGhlIGZhcm1gKTtcbiAgfVxuXG4gIC8vIFRoZSB1bmNvbnN0cmFpbmVkIHdpbm5lciBpcyBmYXJ0aGVyIGF3YXksIHNvIHRoZSBwb2xpY3kgY2hhbmdlZCB0aGUgY2hvaWNlLlxuICBjb25zdCB1bmNvbnN0cmFpbmVkID0gc2VhcmNoU2l0ZXMod29ybGQsIEhPVVNFX1JVTEVTLCBsYXlvdXQuc2VhcmNoQXJlYSwge1xuICAgIHN0ZXA6IDIsIGFuY2hvciwgbWF4RGlzdGFuY2U6IDMyLCBtYXhSZXN1bHRzOiAxLFxuICB9KTtcbiAgY29uc3QgdG9wID0gdW5jb25zdHJhaW5lZC5jYW5kaWRhdGVzWzBdO1xuICBjb25zdCB0b3BDZW50ZXIgPSBjZW50ZXIodG9wLnJlY3QpO1xuICBjb25zdCB0b3BEaXN0YW5jZSA9IE1hdGguaHlwb3QodG9wQ2VudGVyLnggLSBmYXJtQ2VudGVyLngsIHRvcENlbnRlci56IC0gZmFybUNlbnRlci56KTtcbiAgYXNzZXJ0Lm9rKHRvcERpc3RhbmNlID4gMzAsIGB1bmNvbnN0cmFpbmVkIHdpbm5lciBpcyBvbmx5ICR7dG9wRGlzdGFuY2V9IG0gZnJvbSB0aGUgZmFybWApO1xuICBhc3NlcnQubm90RGVlcEVxdWFsKHRvcC5yZWN0LCBwaW5uZWRIb3VzZS5yZWN0KTtcblxuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYmVmb3JlKTtcbn0pO1xuXG50ZXN0KCdwcmV2aWV3IGV4cG9zZXMgdmFsaWQsIHByZXBhcmF0aW9uIGFuZCBpbnZhbGlkIHN0YXRlcyB3aXRob3V0IG11dGF0aW5nIHRoZSB3b3JsZCcsICgpID0+IHtcbiAgY29uc3QgeyB3b3JsZCwgbGF5b3V0IH0gPSBjcmVhdGVNMDAyRml4dHVyZSgpO1xuICBjb25zdCBiZWZvcmUgPSBmaW5nZXJwcmludCh3b3JsZCk7XG5cbiAgY29uc3QgcmVqZWN0ZWQgPSBwcmV2aWV3U2l0ZShcbiAgICB3b3JsZCxcbiAgICBwcm9wb3NhbChsYXlvdXQucmVqZWN0ZWQuaWQsIGxheW91dC5yZWplY3RlZC5yZWN0LCBsYXlvdXQucmVqZWN0ZWQuZmxvb3JZKSxcbiAgICB7IGRvb3I6IGxheW91dC5yZWplY3RlZC5kb29yLCBhcHByb2FjaDogbGF5b3V0LnJlamVjdGVkLmFwcHJvYWNoIH0sXG4gICk7XG4gIGFzc2VydC5lcXVhbChyZWplY3RlZC5zdGF0ZSwgJ2ludmFsaWQnKTtcbiAgYXNzZXJ0LmVxdWFsKHJlamVjdGVkLm9ic3RydWN0aW9ucy5sZW5ndGgsIDApO1xuICBhc3NlcnQub2socmVqZWN0ZWQuZm91bmRhdGlvbi5jdXRWb2x1bWUgPj0gNDApO1xuICBhc3NlcnQub2socmVqZWN0ZWQuZm91bmRhdGlvbi5yZXRhaW5pbmdXYWxsQ2VsbHMgPiAwKTtcblxuICBjb25zdCBob3VzZSA9IHByZXZpZXdTaXRlKFxuICAgIHdvcmxkLFxuICAgIHByb3Bvc2FsKGxheW91dC5ob3VzZS5pZCwgbGF5b3V0LmhvdXNlLnJlY3QsIGxheW91dC5ob3VzZS5mbG9vclkpLFxuICAgIHsgZG9vcjogbGF5b3V0LmhvdXNlLmRvb3IsIGFwcHJvYWNoOiBsYXlvdXQuaG91c2UuYXBwcm9hY2ggfSxcbiAgKTtcbiAgYXNzZXJ0LmVxdWFsKGhvdXNlLnN0YXRlLCAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGhvdXNlLnJlYXNvbnMubWFwKChyKSA9PiByLmNvZGUpLCBbJ25lZWRzX2dyYWRpbmcnXSk7XG4gIGFzc2VydC5lcXVhbChob3VzZS5vYnN0cnVjdGlvbnMubGVuZ3RoLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKGhvdXNlLmZvdW5kYXRpb24udHlwZSwgJ2dyYWRlZF9wYWQnKTtcbiAgYXNzZXJ0LmVxdWFsKGhvdXNlLmZvdW5kYXRpb24uY3V0Vm9sdW1lLCAzKTtcbiAgYXNzZXJ0LmVxdWFsKGhvdXNlLmZvdW5kYXRpb24uZmlsbFZvbHVtZSwgMTgpO1xuICBhc3NlcnQuZXF1YWwoaG91c2UuZm91bmRhdGlvbi5wbGludGhDZWxscywgcmVjdENvbHVtbnMobGF5b3V0LmhvdXNlLnJlY3QpICsgMTgpO1xuICBhc3NlcnQub2soaG91c2UuYWNjZXNzKTtcbiAgYXNzZXJ0LmVxdWFsKGhvdXNlLmFjY2VzcyEud2Fsa2FibGUsIHRydWUpO1xuICBhc3NlcnQuZXF1YWwoaG91c2UuYWNjZXNzIS5kaXN0YW5jZSwgOCk7XG4gIGFzc2VydC5vayhNYXRoLmFicyhob3VzZS5hY2Nlc3MhLmdyYWRlIC0gMC4yNSkgPCAxZS05KTtcblxuICAvLyBUaGUgcHJldmlldydzIGVudmVsb3BlIGNvdmVycyB0aGUgY29tcGxldGUgZm9vdHByaW50IGF0IGl0cyBmbG9vci5cbiAgZm9yIChjb25zdCBbeCwgel0gb2YgW1xuICAgIFtsYXlvdXQuaG91c2UucmVjdC54MCwgbGF5b3V0LmhvdXNlLnJlY3QuejBdLFxuICAgIFtsYXlvdXQuaG91c2UucmVjdC54MSwgbGF5b3V0LmhvdXNlLnJlY3QuejBdLFxuICAgIFtsYXlvdXQuaG91c2UucmVjdC54MCwgbGF5b3V0LmhvdXNlLnJlY3QuejFdLFxuICAgIFtsYXlvdXQuaG91c2UucmVjdC54MSwgbGF5b3V0LmhvdXNlLnJlY3QuejFdLFxuICBdKSB7XG4gICAgYXNzZXJ0LmVxdWFsKFxuICAgICAgZW52ZWxvcGVDb250YWlucyhob3VzZS5lbnZlbG9wZSwgeCwgbGF5b3V0LmhvdXNlLmZsb29yWSwgeiksXG4gICAgICB0cnVlLFxuICAgICAgYGVudmVsb3BlIG1pc3NlcyAke3h9LCR7bGF5b3V0LmhvdXNlLmZsb29yWX0sJHt6fWAsXG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IGZsYXQgPSBwcmV2aWV3U2l0ZShcbiAgICB3b3JsZCxcbiAgICBwcm9wb3NhbCgnZmxhdC1zaGVsZicsIHsgeDA6IC0xNCwgejA6IC02MCwgeDE6IC03LCB6MTogLTU1IH0sIDIxKSxcbiAgICB7IGRvb3I6IHsgeDogLTcsIHo6IC01NyB9LCBhcHByb2FjaDogeyB4OiAtMSwgejogLTU3IH0gfSxcbiAgKTtcbiAgYXNzZXJ0LmVxdWFsKGZsYXQuc3RhdGUsICd2YWxpZCcpO1xuICBhc3NlcnQuZXF1YWwoZmxhdC5yZWFzb25zLmxlbmd0aCwgMCk7XG4gIGFzc2VydC5lcXVhbChmbGF0LmZvdW5kYXRpb24uY3V0Vm9sdW1lLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKGZsYXQuZm91bmRhdGlvbi5maWxsVm9sdW1lLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKGZsYXQuZm91bmRhdGlvbi5yZXRhaW5pbmdXYWxsQ2VsbHMsIDApO1xuICBhc3NlcnQuZXF1YWwoZmxhdC5hY2Nlc3M/LndhbGthYmxlLCB0cnVlKTtcblxuICAvLyBQcmV2aWV3aW5nIGFueSBzdGF0ZSBsZWF2ZXMgdm94ZWxzLCBlbnRpdGllcyBhbmQgaW52ZW50b3J5IHVudG91Y2hlZC5cbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGJlZm9yZSk7XG59KTtcbiIsICIvLyBQcml2YXRlIG1pZ3JhdGlvbiByZXBsYXkgb25seS4gUmV0aXJlZCBlbnRpdGllcyBsaXZlIGluIHRoaXMgV29ybGQgd2hpbGUgYW5cbi8vIGFjY2VwdGVkIGhpc3RvcmljYWwgam91cm5hbCBpcyBjaGVja2VkOyBubyBwdWJsaWMgY29tbWFuZCBlbmFibGVzIHRoaXMgbW9kZS5cbmludGVyZmFjZSBSZXBsYXlTdGF0ZSB7XG4gIGFjdGl2ZTogYm9vbGVhbjtcbiAgaGlzdG9yaWNhbEhhc2g6IGJvb2xlYW47XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBzdGF0ZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFJlcGxheVN0YXRlPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZDogb2JqZWN0KTogUmVwbGF5U3RhdGUge1xuICBsZXQgc3RhdGUgPSBzdGF0ZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzdGF0ZSkgeyBzdGF0ZSA9IHsgYWN0aXZlOiBmYWxzZSwgaGlzdG9yaWNhbEhhc2g6IGZhbHNlLCBtaWdyYXRlZDogZmFsc2UgfTsgc3RhdGVzLnNldCh3b3JsZCwgc3RhdGUpOyB9XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xuICBzdGF0ZS5taWdyYXRlZCA9IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uYWN0aXZlID8/IGZhbHNlO1xufVxuXG4vKiogU25hcHNob3QgaGFzaGVzIGJlZm9yZSBhbmQgZHVyaW5nIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5IGluY2x1ZGUgc3RvbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZUhpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lmhpc3RvcmljYWxIYXNoID8/IGZhbHNlO1xufVxuXG4vKiogQSBtaWdyYXRlZCBzbmFwc2hvdCBhbHJlYWR5IGhhcyByZXRpcmVtZW50IHRvbWJzdG9uZXMgaW4gZ2VuZXJhdGVkIGNodW5rcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8ubWlncmF0ZWQgPz8gZmFsc2U7XG59XG5cbi8qKiBFeGl0IGhpc3RvcmljYWwgbW9kZSBhZnRlciBhbGwgYWNjZXB0ZWQgY29tbWFuZHMgYW5kIGhhc2hlcyBoYXZlIHBhc3NlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IGZhbHNlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IGZhbHNlO1xuICBzdGF0ZS5taWdyYXRlZCA9IHRydWU7XG59XG4iLCAiLy8gRGV0ZXJtaW5pc3RpYyBoYXNoLCBub2lzZSBhbmQgbWF0aCBoZWxwZXJzIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllci5cbi8vIFB1cmUgVHlwZVNjcmlwdCAoRC0wMDUpLiBFeHRyYWN0ZWQgZnJvbSB3b3JsZC50cyB1bmNoYW5nZWQgc28gdGVycmFpblxuLy8gZ2VuZXJhdG9ycyBvZiBldmVyeSB2ZXJzaW9uIHVzZSBpZGVudGljYWwgcHJpbWl0aXZlcy5cbmV4cG9ydCBjb25zdCBjbGFtcCA9ICh2OiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiAodiA8IGEgPyBhIDogdiA+IGIgPyBiIDogdik7XG5leHBvcnQgY29uc3QgbGVycCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgdDogbnVtYmVyKSA9PiBhICsgKGIgLSBhKSAqIHQ7XG5leHBvcnQgY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5leHBvcnQgY29uc3Qgc21vb3RoID0gKHQ6IG51bWJlcikgPT4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UyKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKTtcbiAgY29uc3QgYSA9IGhhc2gyaSh4aSwgeWksIHNlZWQpLCBiID0gaGFzaDJpKHhpICsgMSwgeWksIHNlZWQpO1xuICBjb25zdCBjID0gaGFzaDJpKHhpLCB5aSArIDEsIHNlZWQpLCBkID0gaGFzaDJpKHhpICsgMSwgeWkgKyAxLCBzZWVkKTtcbiAgY29uc3QgdG9wID0gYSArIChiIC0gYSkgKiB4ZjtcbiAgY29uc3QgYm90dG9tID0gYyArIChkIC0gYykgKiB4ZjtcbiAgcmV0dXJuIHRvcCArIChib3R0b20gLSB0b3ApICogeWY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0yKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UyKHggKiBmcmVxLCB5ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMyh4ICogZnJlcSwgeSAqIGZyZXEsIHogKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG4iLCAiLy8gSHlkcm9sb2d5IFx1MjAxNCB0aGUgZGV0ZXJtaW5pc3RpYyB3YXRlciBuZXR3b3JrIG9mIGEgd29ybGQgKHB1cmUgVHlwZVNjcmlwdCwgRC0wMDUpLlxuLy9cbi8vIFRoaXMgaXMgZGVyaXZlZCAqc2ltdWxhdGlvbiBkYXRhKiwgbm90IHByZXNlbnRhdGlvbjogaXQgaXMgYSBwdXJlIGZ1bmN0aW9uIG9mXG4vLyAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pIGFuZCBpcyB3aGF0IHRlcnJhaW4gY2FydmluZywgd2F0ZXIgZmlsbGluZywgZmxvd1xuLy8gZGlyZWN0aW9uIGFuZCBmdXR1cmUgZmlzaGluZy9pcnJpZ2F0aW9uL2Zsb29kaW5nIHJ1bGVzIHJlYWQuIEl0IGlzIG5ldmVyXG4vLyBqb3VybmFsZWQgYmVjYXVzZSBpdCBjYW4gYWx3YXlzIGJlIHJlZ2VuZXJhdGVkIGV4YWN0bHkuXG4vL1xuLy8gTmV0d29yayAoYm90aCBnZW5lcmF0b3IgdmVyc2lvbnMpOlxuLy8gICBsYWtlICBcdTIwMTQgdGhlIHZhbGxleSBsYWtlIGJhc2luLCBsb2NhdGVkIGZyb20gdGhlIGFjdHVhbCBnZW5lcmF0ZWQgdGVycmFpbi5cbi8vICAgbG93ZXIgXHUyMDE0IHRoZSBsb3dsYW5kIHJpdmVyIGZyb20gdGhlIGxha2UgdG8gdGhlIHNvdXRoZXJuIHNlYSwgdHJhY2VkIGZyb21cbi8vICAgICAgICAgICB0aGUgYWN0dWFsIGNhcnZlZCBjaGFubmVsICh0aGUgdjEgY2hhbm5lbCBpcyBjYXJ2ZWQgb24gKndhcnBlZCpcbi8vICAgICAgICAgICBjb29yZGluYXRlcywgc28gYHJpdmVyQ2VudGVyWGAgYWxvbmUgaXMgdXAgdG8gfjEzNSBtIG9mZikuXG4vLyBHZW5lcmF0b3IgdjIgYWRkczpcbi8vICAgdXBwZXIgXHUyMDE0IGEgbW91bnRhaW4gcml2ZXIgZnJvbSBhIGhpZ2hsYW5kIHRhcm4gZG93biB0byB0aGUgbGFrZSwgd2l0aCBhXG4vLyAgICAgICAgICAgd2F0ZXItc3VyZmFjZSBsZXZlbCB0aGF0IG5ldmVyIHJpc2VzIGRvd25zdHJlYW0sIGNhc2NhZGVzIGFuZCBmYWxscy5cbi8vXG4vLyBGbG93IGFsd2F5cyBwb2ludHMgZG93bnN0cmVhbTogdXBwZXIgXHUyMTkyIGxha2UgXHUyMTkyIGxvd2VyIFx1MjE5MiBzZWEuXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbXVsYmVycnkzMiwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuXG5leHBvcnQgdHlwZSBIZWlnaHRTYW1wbGVyID0gKHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUml2ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZCBvZiB0aGlzIHJlYWNoIChtZXRyZXMpLiAqL1xuICBzOiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGVsZXZhdGlvbiAobWV0cmVzLCBtYXkgYmUgZnJhY3Rpb25hbCkuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBDaGFubmVsIGhhbGYtd2lkdGggKG1ldHJlcykuICovXG4gIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhY2hIaXQge1xuICAvKiogSG9yaXpvbnRhbCBkaXN0YW5jZSBmcm9tIHRoZSBjZW50cmVsaW5lLiAqL1xuICBkOiBudW1iZXI7XG4gIC8qKiBJbnRlcnBvbGF0ZWQgd2F0ZXIgbGV2ZWwgYXQgdGhlIG5lYXJlc3QgY2VudHJlbGluZSBwb2ludC4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgd2lkdGg6IG51bWJlcjtcbiAgLyoqIFVuaXQgZG93bnN0cmVhbSBkaXJlY3Rpb24uICovXG4gIHR4OiBudW1iZXI7XG4gIHR6OiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGRyb3AgcGVyIG1ldHJlIGFsb25nIHRoZSBjaGFubmVsICg+PSAwKS4gKi9cbiAgZ3JhZGllbnQ6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggb2YgdGhlIG5lYXJlc3QgcG9pbnQgZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQuICovXG4gIHM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHBvbHlsaW5lIHJlYWNoIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LiBOZWFyZXN0LXNlZ21lbnQgcXVlcmllcyB1c2UgYVxuICogdW5pZm9ybSBncmlkIHdob3NlIGNlbGxzIGxpc3QgZXZlcnkgc2VnbWVudCB3aXRoaW4gYHJlYWNoYCBtZXRyZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBSaXZlclJlYWNoIHtcbiAgcmVhZG9ubHkgcG9pbnRzOiBSaXZlclBvaW50W107XG4gIHByaXZhdGUgcmVhZG9ubHkgY2VsbCA9IDMyO1xuICBwcml2YXRlIHJlYWRvbmx5IGdyaWQgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyW10+KCk7XG5cbiAgY29uc3RydWN0b3IocG9pbnRzOiBSaXZlclBvaW50W10sIHJlYWRvbmx5IHJlYWNoOiBudW1iZXIpIHtcbiAgICB0aGlzLnBvaW50cyA9IHBvaW50cztcbiAgICBmb3IgKGxldCBpID0gMDsgaSArIDEgPCBwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGEgPSBwb2ludHNbaV0sIGIgPSBwb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgeDAgPSBNYXRoLm1pbihhLngsIGIueCkgLSByZWFjaCwgeDEgPSBNYXRoLm1heChhLngsIGIueCkgKyByZWFjaDtcbiAgICAgIGNvbnN0IHowID0gTWF0aC5taW4oYS56LCBiLnopIC0gcmVhY2gsIHoxID0gTWF0aC5tYXgoYS56LCBiLnopICsgcmVhY2g7XG4gICAgICBmb3IgKGxldCBjeiA9IE1hdGguZmxvb3IoejAgLyB0aGlzLmNlbGwpOyBjeiA8PSBNYXRoLmZsb29yKHoxIC8gdGhpcy5jZWxsKTsgY3orKykge1xuICAgICAgICBmb3IgKGxldCBjeCA9IE1hdGguZmxvb3IoeDAgLyB0aGlzLmNlbGwpOyBjeCA8PSBNYXRoLmZsb29yKHgxIC8gdGhpcy5jZWxsKTsgY3grKykge1xuICAgICAgICAgIGNvbnN0IGtleSA9IGNlbGxLZXkoY3gsIGN6KTtcbiAgICAgICAgICBsZXQgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoa2V5KTtcbiAgICAgICAgICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB0aGlzLmdyaWQuc2V0KGtleSwgbGlzdCk7IH1cbiAgICAgICAgICBsaXN0LnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnBvaW50c1t0aGlzLnBvaW50cy5sZW5ndGggLSAxXT8ucyA/PyAwOyB9XG5cbiAgLyoqIE5lYXJlc3QgY2VudHJlbGluZSBwb2ludCB3aXRoaW4gYHJlYWNoYCwgb3IgbnVsbC4gKi9cbiAgbmVhcmVzdCh4OiBudW1iZXIsIHo6IG51bWJlcik6IFJlYWNoSGl0IHwgbnVsbCB7XG4gICAgY29uc3QgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoY2VsbEtleShNYXRoLmZsb29yKHggLyB0aGlzLmNlbGwpLCBNYXRoLmZsb29yKHogLyB0aGlzLmNlbGwpKSk7XG4gICAgaWYgKCFsaXN0KSByZXR1cm4gbnVsbDtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBiaSA9IC0xLCBidCA9IDA7XG4gICAgZm9yIChjb25zdCBpIG9mIGxpc3QpIHtcbiAgICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tpXSwgYiA9IHRoaXMucG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IGR4ID0gYi54IC0gYS54LCBkeiA9IGIueiAtIGEuejtcbiAgICAgIGNvbnN0IGxlbjIgPSBkeCAqIGR4ICsgZHogKiBkeiB8fCAxO1xuICAgICAgY29uc3QgdCA9IGNsYW1wKCgoeCAtIGEueCkgKiBkeCArICh6IC0gYS56KSAqIGR6KSAvIGxlbjIsIDAsIDEpO1xuICAgICAgY29uc3QgcHggPSBhLnggKyBkeCAqIHQsIHB6ID0gYS56ICsgZHogKiB0O1xuICAgICAgY29uc3QgZDIgPSAoeCAtIHB4KSAqKiAyICsgKHogLSBweikgKiogMjtcbiAgICAgIGlmIChkMiA8IGJlc3QpIHsgYmVzdCA9IGQyOyBiaSA9IGk7IGJ0ID0gdDsgfVxuICAgIH1cbiAgICBpZiAoYmkgPCAwIHx8IGJlc3QgPiB0aGlzLnJlYWNoICogdGhpcy5yZWFjaCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2JpXSwgYiA9IHRoaXMucG9pbnRzW2JpICsgMV07XG4gICAgY29uc3Qgc2VnTGVuID0gTWF0aC5tYXgoMWUtNiwgYi5zIC0gYS5zKTtcbiAgICAvLyBQb2ludHMgYXJlIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LCBzbyBkb3duc3RyZWFtIGlzIGEgPC0gYi5cbiAgICBjb25zdCB0eCA9IChhLnggLSBiLngpIC8gc2VnTGVuLCB0eiA9IChhLnogLSBiLnopIC8gc2VnTGVuO1xuICAgIHJldHVybiB7XG4gICAgICBkOiBNYXRoLnNxcnQoYmVzdCksXG4gICAgICBsZXZlbDogYS5sZXZlbCArIChiLmxldmVsIC0gYS5sZXZlbCkgKiBidCxcbiAgICAgIHdpZHRoOiBhLndpZHRoICsgKGIud2lkdGggLSBhLndpZHRoKSAqIGJ0LFxuICAgICAgdHgsIHR6LFxuICAgICAgZ3JhZGllbnQ6IE1hdGgubWF4KDAsIChiLmxldmVsIC0gYS5sZXZlbCkgLyBzZWdMZW4pLFxuICAgICAgczogYS5zICsgKGIucyAtIGEucykgKiBidCxcbiAgICB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGNlbGxLZXkoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoY3ggKyA0MDk2KSAqIDgxOTIgKyAoY3ogKyA0MDk2KTtcbn1cblxuZXhwb3J0IHR5cGUgV2F0ZXJCb2R5ID0gJ3JpdmVyJyB8ICdsYWtlJyB8ICdzZWEnIHwgJ25vbmUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEZsb3dTYW1wbGUge1xuICBib2R5OiBXYXRlckJvZHk7XG4gIC8qKiBVbml0IGZsb3cgZGlyZWN0aW9uICh6ZXJvIGZvciBzdGlsbCB3YXRlcikuICovXG4gIGR4OiBudW1iZXI7XG4gIGR6OiBudW1iZXI7XG4gIC8qKiBTdXJmYWNlIGN1cnJlbnQgc3BlZWQgaW4gbS9zLiAqL1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEh5ZHJvbG9neU9wdGlvbnMge1xuICBzZWVkOiBudW1iZXI7XG4gIC8qKiBHZW5lcmF0b3IgdmVyc2lvbiB0aGUgbmV0d29yayBiZWxvbmdzIHRvLiAqL1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIC8qKiBCYXNlIGhlaWdodCBvZiB0aGUgKnVubW9kaWZpZWQgdjEgc2hhcGUqICh1c2VkIHRvIGxvY2F0ZSBsYWtlL2NoYW5uZWwpLiAqL1xuICB2MUhlaWdodDogSGVpZ2h0U2FtcGxlcjtcbn1cblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2dpY2FsIG5ldHdvcmsgZm9yIG9uZSAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pLiAqL1xuZXhwb3J0IGNsYXNzIEh5ZHJvbG9neSB7XG4gIHJlYWRvbmx5IHNlZWQ6IG51bWJlcjtcbiAgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuICByZWFkb25seSBsYWtlOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByeDogbnVtYmVyOyByejogbnVtYmVyIH07XG4gIHJlYWRvbmx5IGxvd2VyOiBSaXZlclJlYWNoO1xuICByZWFkb25seSB1cHBlcjogUml2ZXJSZWFjaCB8IG51bGw7XG4gIC8qKiBVcHBlci1yaXZlciBzb3VyY2UgdGFybiAodjIgb25seSkuICovXG4gIHJlYWRvbmx5IHRhcm46IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHI6IG51bWJlcjsgbGV2ZWw6IG51bWJlciB9IHwgbnVsbDtcblxuICBjb25zdHJ1Y3RvcihvcHRzOiBIeWRyb2xvZ3lPcHRpb25zKSB7XG4gICAgdGhpcy5zZWVkID0gb3B0cy5zZWVkO1xuICAgIHRoaXMudmVyc2lvbiA9IG9wdHMudmVyc2lvbjtcbiAgICB0aGlzLmxha2UgPSBsb2NhdGVMYWtlKG9wdHMudjFIZWlnaHQpO1xuICAgIHRoaXMubG93ZXIgPSB0cmFjZUxvd2VyUml2ZXIob3B0cy52MUhlaWdodCwgdGhpcy5sYWtlKTtcbiAgICBpZiAob3B0cy52ZXJzaW9uID49IDIpIHtcbiAgICAgIGNvbnN0IHVwcGVyID0gYXV0aG9yVXBwZXJSaXZlcihvcHRzLnNlZWQsIHRoaXMubGFrZSk7XG4gICAgICB0aGlzLnVwcGVyID0gdXBwZXIucmVhY2g7XG4gICAgICB0aGlzLnRhcm4gPSB1cHBlci50YXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVwcGVyID0gbnVsbDtcbiAgICAgIHRoaXMudGFybiA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN1cmZhY2UgY3VycmVudCBmb3IgYSB3YXRlciBjb2x1bW4uIGBsZXZlbGAgaXMgdGhlIGNvbHVtbidzIHdhdGVyIHN1cmZhY2UsXG4gICAqIHVzZWQgdG8gdGVsbCBzZWEtbGV2ZWwgd2F0ZXIgKGxha2UsIGxvd2VyIHJpdmVyLCBzZWEpIGZyb20gdGhlIHVwcGVyIHJpdmVyLlxuICAgKi9cbiAgZmxvd0F0KHg6IG51bWJlciwgejogbnVtYmVyLCBsZXZlbDogbnVtYmVyKTogRmxvd1NhbXBsZSB7XG4gICAgaWYgKHRoaXMudXBwZXIgJiYgbGV2ZWwgPiAwLjUpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHRoaXMudXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPD0gaGl0LndpZHRoICsgMikge1xuICAgICAgICBjb25zdCBzcGVlZCA9IGNsYW1wKDAuNTUgKyBoaXQuZ3JhZGllbnQgKiA5LCAwLjQsIDQuNSk7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBoaXQudHgsIGR6OiBoaXQudHosIHNwZWVkIH07XG4gICAgICB9XG4gICAgICBpZiAodGhpcy50YXJuICYmIE1hdGguaHlwb3QoeCAtIHRoaXMudGFybi54LCB6IC0gdGhpcy50YXJuLnopIDwgdGhpcy50YXJuLnIgKyA0KSB7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4udG93YXJkcyh4LCB6LCB0aGlzLnVwcGVyU291cmNlKCksIDAuMDYpIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGxvdyA9IHRoaXMubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDw9IGxvdy53aWR0aCArIDYpIHtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBsb3cudHgsIGR6OiBsb3cudHosIHNwZWVkOiAwLjM1ICsgMC4yNSAqIHNtb290aHN0ZXAobG93LndpZHRoICsgNiwgMCwgbG93LmQpIH07XG4gICAgfVxuICAgIGNvbnN0IGxkID0gTWF0aC5oeXBvdCgoeCAtIHRoaXMubGFrZS54KSAvIHRoaXMubGFrZS5yeCwgKHogLSB0aGlzLmxha2UueikgLyB0aGlzLmxha2UucnopO1xuICAgIGlmIChsZCA8IDEuMzUpIHtcbiAgICAgIC8vIFNsb3cgZHJpZnQgZnJvbSB0aGUgaW5mbG93IHRvd2FyZCB0aGUgb3V0ZmxvdyBhdCB0aGUgaGVhZCBvZiB0aGUgbG93ZXIgcml2ZXIuXG4gICAgICBjb25zdCBoZWFkID0gdGhpcy5sb3dlci5wb2ludHNbdGhpcy5sb3dlci5wb2ludHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBkcmlmdCA9IHRvd2FyZHMoeCwgeiwgaGVhZCwgMC4wOCk7XG4gICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLmRyaWZ0IH07XG4gICAgfVxuICAgIHJldHVybiB7IGJvZHk6ICdzZWEnLCBkeDogMCwgZHo6IDAsIHNwZWVkOiAwIH07XG4gIH1cblxuICBwcml2YXRlIHVwcGVyU291cmNlKCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gICAgY29uc3QgcHRzID0gdGhpcy51cHBlciEucG9pbnRzO1xuICAgIHJldHVybiBwdHNbcHRzLmxlbmd0aCAtIDFdO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvd2FyZHMoeDogbnVtYmVyLCB6OiBudW1iZXIsIHA6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgc3BlZWQ6IG51bWJlcikge1xuICBjb25zdCBkeCA9IHAueCAtIHgsIGR6ID0gcC56IC0gejtcbiAgY29uc3QgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gIHJldHVybiB7IGR4OiBkeCAvIGxlbiwgZHo6IGR6IC8gbGVuLCBzcGVlZCB9O1xufVxuXG4vKiogRmluZCB0aGUgdmFsbGV5IGxha2UgZnJvbSB0aGUgdGVycmFpbiBpdHNlbGY6IHRoZSBkZWVwIGJhc2luIE5XIG9mIHRoZSBmb3VuZGVyIHZhbGxleS4gKi9cbmZ1bmN0aW9uIGxvY2F0ZUxha2UoaDogSGVpZ2h0U2FtcGxlcik6IEh5ZHJvbG9neVsnbGFrZSddIHtcbiAgbGV0IHN4ID0gMCwgc3ogPSAwLCBuID0gMCwgbWluWCA9IEluZmluaXR5LCBtYXhYID0gLUluZmluaXR5LCBtaW5aID0gSW5maW5pdHksIG1heFogPSAtSW5maW5pdHk7XG4gIGZvciAobGV0IHogPSAtNDYwOyB6IDw9IC0xMjA7IHogKz0gNCkge1xuICAgIGZvciAobGV0IHggPSAtNDgwOyB4IDw9IC00MDsgeCArPSA0KSB7XG4gICAgICBpZiAoaCh4LCB6KSA+IC00KSBjb250aW51ZTtcbiAgICAgIHN4ICs9IHg7IHN6ICs9IHo7IG4rKztcbiAgICAgIG1pblggPSBNYXRoLm1pbihtaW5YLCB4KTsgbWF4WCA9IE1hdGgubWF4KG1heFgsIHgpO1xuICAgICAgbWluWiA9IE1hdGgubWluKG1pblosIHopOyBtYXhaID0gTWF0aC5tYXgobWF4Wiwgeik7XG4gICAgfVxuICB9XG4gIGlmIChuID09PSAwKSByZXR1cm4geyB4OiAtMjYwLCB6OiAtMjMwLCByeDogMTIwLCByejogOTUgfTtcbiAgcmV0dXJuIHtcbiAgICB4OiBzeCAvIG4sIHo6IHN6IC8gbixcbiAgICByeDogTWF0aC5tYXgoMzAsIChtYXhYIC0gbWluWCkgLyAyICsgMTApLCByejogTWF0aC5tYXgoMzAsIChtYXhaIC0gbWluWikgLyAyICsgMTApLFxuICB9O1xufVxuXG4vKipcbiAqIFRyYWNlIHRoZSBjYXJ2ZWQgbG93bGFuZCBjaGFubmVsIGZyb20gdGhlIGxha2Ugb3V0ZmxvdyBzb3V0aCB0byB0aGUgc2VhLiBGb3JcbiAqIGVhY2ggNCBtIHJvdyB0aGUgY2hhbm5lbCBpcyB0aGUgbG93ZXN0IGNvbHVtbiBuZWFyIHRoZSBwcmV2aW91cyBjZW50cmU7IHRoZVxuICogdHJhY2UgaXMgc21vb3RoZWQgc28gdGhlIGZsb3cgZmllbGQgZG9lcyBub3Qgaml0dGVyIHdpdGggdGhlIDEgbSB2b3hlbHMuXG4gKi9cbmZ1bmN0aW9uIHRyYWNlTG93ZXJSaXZlcihoOiBIZWlnaHRTYW1wbGVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IFJpdmVyUmVhY2gge1xuICBjb25zdCByYXc6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgbGV0IGN4ID0gbGFrZS54ICsgbGFrZS5yeCAqIDAuNTU7XG4gIGxldCB6ID0gTWF0aC5yb3VuZChsYWtlLnogKyBsYWtlLnJ6ICogMC42KTtcbiAgLy8gU3RhcnQgYXQgdGhlIGxha2UncyBzb3V0aC1lYXN0IG91dGZsb3cgYW5kIGZvbGxvdyB0aGUgY2hhbm5lbCBkb3duc3RyZWFtLlxuICBmb3IgKDsgeiA8PSA5MDA7IHogKz0gNCkge1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJ4ID0gY3g7XG4gICAgZm9yIChsZXQgeCA9IE1hdGgucm91bmQoY3ggLSA0MCk7IHggPD0gY3ggKyA0MDsgeCArPSAyKSB7XG4gICAgICBjb25zdCB2ID0gaCh4LCB6KSArIE1hdGguYWJzKHggLSBjeCkgKiAwLjAyO1xuICAgICAgaWYgKHYgPCBiZXN0KSB7IGJlc3QgPSB2OyBieCA9IHg7IH1cbiAgICB9XG4gICAgY3ggPSBieDtcbiAgICByYXcucHVzaCh7IHg6IGJ4LCB6IH0pO1xuICAgIC8vIFRoZSB0cmFjZSBlbmRzIG9uY2UgaXQgcmVhY2hlcyBvcGVuIHNlYSBmb3IgYSBzdXN0YWluZWQgc3RyZXRjaC5cbiAgICBpZiAoYmVzdCA8IC02ICYmIHJhdy5sZW5ndGggPiAyMCAmJiBoKGJ4LCB6ICsgOCkgPCAtNiAmJiBoKGJ4LCB6ICsgMTYpIDwgLTYpIGJyZWFrO1xuICB9XG4gIGNvbnN0IHNtb290aCA9IHJhdy5tYXAoKHAsIGkpID0+IHtcbiAgICBsZXQgc3ggPSAwLCBuID0gMDtcbiAgICBmb3IgKGxldCBrID0gTWF0aC5tYXgoMCwgaSAtIDQpOyBrIDw9IE1hdGgubWluKHJhdy5sZW5ndGggLSAxLCBpICsgNCk7IGsrKykgeyBzeCArPSByYXdba10ueDsgbisrOyB9XG4gICAgcmV0dXJuIHsgeDogc3ggLyBuLCB6OiBwLnogfTtcbiAgfSk7XG4gIC8vIFN0b3JlIGRvd25zdHJlYW0tZmlyc3Q6IGluZGV4IDAgaXMgdGhlIHNlYSBtb3V0aC5cbiAgc21vb3RoLnJldmVyc2UoKTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSBbXTtcbiAgbGV0IHMgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHNtb290aC5sZW5ndGg7IGkrKykge1xuICAgIGlmIChpID4gMCkgcyArPSBNYXRoLmh5cG90KHNtb290aFtpXS54IC0gc21vb3RoW2kgLSAxXS54LCBzbW9vdGhbaV0ueiAtIHNtb290aFtpIC0gMV0ueik7XG4gICAgcG9pbnRzLnB1c2goeyB4OiBzbW9vdGhbaV0ueCwgejogc21vb3RoW2ldLnosIHMsIGxldmVsOiAwLCB3aWR0aDogNiB9KTtcbiAgfVxuICByZXR1cm4gbmV3IFJpdmVyUmVhY2gocG9pbnRzLCA0MCk7XG59XG5cbi8qKiBXYXRlci1zdXJmYWNlIGRyb3BzIGFsb25nIHRoZSB1cHBlciByaXZlciwgYXMgKGZyYWN0aW9uIG9mIGxlbmd0aCwgbWV0cmVzKS4gKi9cbmNvbnN0IEZBTExTOiBSZWFkb25seUFycmF5PHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0+ID0gW1swLjIsIDddLCBbMC40OCwgMTFdLCBbMC43NCwgMTNdXTtcbmNvbnN0IFVQUEVSX0dSQURJRU5UID0gMC4wMztcblxuLyoqXG4gKiBBdXRob3IgdGhlIHYyIG1vdW50YWluIHJpdmVyOiBhIHNlZWRlZCBtZWFuZGVyaW5nIGNlbnRyZWxpbmUgZnJvbSB0aGUgbGFrZSdzXG4gKiBub3J0aCBzaG9yZSB0byBhIGhpZ2hsYW5kIHRhcm4sIHdpdGggYSBsZXZlbCBwcm9maWxlIHRoYXQgb25seSByaXNlc1xuICogdXBzdHJlYW0gKGdlbnRsZSBncmFkaWVudCBwbHVzIHRocmVlIGNhc2NhZGVzKS5cbiAqL1xuZnVuY3Rpb24gYXV0aG9yVXBwZXJSaXZlcihzZWVkOiBudW1iZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKToge1xuICByZWFjaDogUml2ZXJSZWFjaDsgdGFybjogTm9uTnVsbGFibGU8SHlkcm9sb2d5Wyd0YXJuJ10+O1xufSB7XG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKHNlZWQgXiAweDVlZWQyKSA+Pj4gMCk7XG4gIGNvbnN0IGogPSAoYTogbnVtYmVyKSA9PiAocm5kKCkgLSAwLjUpICogMiAqIGE7XG4gIGNvbnN0IG1vdXRoID0geyB4OiBsYWtlLnggKyBsYWtlLnJ4ICogMC4xLCB6OiBsYWtlLnogLSBsYWtlLnJ6ICogMC41NSB9O1xuICBjb25zdCBjb250cm9scyA9IFtcbiAgICBtb3V0aCxcbiAgICB7IHg6IGxha2UueCArIDIwICsgaigyMCksIHo6IC00MTAgKyBqKDE1KSB9LFxuICAgIHsgeDogLTE5MCArIGooMzUpLCB6OiAtNTIwICsgaigyMCkgfSxcbiAgICB7IHg6IC0yMTUgKyBqKDM1KSwgejogLTY0MCArIGooMjApIH0sXG4gICAgeyB4OiAtMTY1ICsgaigzMCksIHo6IC03NzAgKyBqKDE1KSB9LFxuICBdO1xuICAvLyBDYXRtdWxsLVJvbSB0aHJvdWdoIHRoZSBjb250cm9scywgdGhlbiByZXNhbXBsZSBhdCB+OCBtIHNwYWNpbmcgd2l0aCBhXG4gIC8vIHNtYWxsIHNlZWRlZCBtZWFuZGVyIHNvIHRoZSBjaGFubmVsIGlzIG5vdCBhIHNtb290aCBzcGxpbmUuXG4gIGNvbnN0IGRlbnNlOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29udHJvbHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgY29uc3QgcDAgPSBjb250cm9sc1tNYXRoLm1heCgwLCBpIC0gMSldLCBwMSA9IGNvbnRyb2xzW2ldO1xuICAgIGNvbnN0IHAyID0gY29udHJvbHNbaSArIDFdLCBwMyA9IGNvbnRyb2xzW01hdGgubWluKGNvbnRyb2xzLmxlbmd0aCAtIDEsIGkgKyAyKV07XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCAyNDsgaysrKSB7XG4gICAgICBjb25zdCB0ID0gayAvIDI0LCB0MiA9IHQgKiB0LCB0MyA9IHQyICogdDtcbiAgICAgIGRlbnNlLnB1c2goe1xuICAgICAgICB4OiAwLjUgKiAoMiAqIHAxLnggKyAoLXAwLnggKyBwMi54KSAqIHQgKyAoMiAqIHAwLnggLSA1ICogcDEueCArIDQgKiBwMi54IC0gcDMueCkgKiB0MlxuICAgICAgICAgICsgKC1wMC54ICsgMyAqIHAxLnggLSAzICogcDIueCArIHAzLngpICogdDMpLFxuICAgICAgICB6OiAwLjUgKiAoMiAqIHAxLnogKyAoLXAwLnogKyBwMi56KSAqIHQgKyAoMiAqIHAwLnogLSA1ICogcDEueiArIDQgKiBwMi56IC0gcDMueikgKiB0MlxuICAgICAgICAgICsgKC1wMC56ICsgMyAqIHAxLnogLSAzICogcDIueiArIHAzLnopICogdDMpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGRlbnNlLnB1c2goY29udHJvbHNbY29udHJvbHMubGVuZ3RoIC0gMV0pO1xuICBjb25zdCByZXNhbXBsZWQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHM6IG51bWJlciB9PiA9IFt7IC4uLmRlbnNlWzBdLCBzOiAwIH1dO1xuICBsZXQgYWNjID0gMCwgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgZGVuc2UubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5oeXBvdChkZW5zZVtpXS54IC0gZGVuc2VbaSAtIDFdLngsIGRlbnNlW2ldLnogLSBkZW5zZVtpIC0gMV0ueik7XG4gICAgYWNjICs9IHN0ZXA7IHMgKz0gc3RlcDtcbiAgICBpZiAoYWNjID49IDggfHwgaSA9PT0gZGVuc2UubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbSA9IChmYm0yKHMgLyA2MCwgMy4xLCBzZWVkICsgODAxLCAyKSAtIDAuNSkgKiAxNDtcbiAgICAgIHJlc2FtcGxlZC5wdXNoKHsgeDogZGVuc2VbaV0ueCArIG0sIHo6IGRlbnNlW2ldLnosIHMgfSk7XG4gICAgICBhY2MgPSAwO1xuICAgIH1cbiAgfVxuICBjb25zdCB0b3RhbCA9IHJlc2FtcGxlZFtyZXNhbXBsZWQubGVuZ3RoIC0gMV0ucztcbiAgY29uc3QgbGV2ZWxBdCA9IChzdjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBsZXQgbGV2ZWwgPSBzdiAqIFVQUEVSX0dSQURJRU5UO1xuICAgIGZvciAoY29uc3QgW2ZyYWMsIGRyb3BdIG9mIEZBTExTKSB7XG4gICAgICAvLyBFYWNoIGZhbGwgaXMgYSBzaG9ydCBjYXNjYWRlIG92ZXIgfjEwIG0gb2YgY2hhbm5lbC5cbiAgICAgIGxldmVsICs9IGRyb3AgKiBzbW9vdGhzdGVwKHRvdGFsICogZnJhYyAtIDUsIHRvdGFsICogZnJhYyArIDUsIHN2KTtcbiAgICB9XG4gICAgLy8gVGhlIGZpcnN0IDQwIG0gaW50byB0aGUgbGFrZSBzdGF5cyBhdCBsYWtlIGxldmVsLlxuICAgIHJldHVybiBzdiA8IDQwID8gMCA6IGxldmVsIC0gNDAgKiBVUFBFUl9HUkFESUVOVDtcbiAgfTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSByZXNhbXBsZWQubWFwKChwKSA9PiAoe1xuICAgIHg6IHAueCwgejogcC56LCBzOiBwLnMsIGxldmVsOiBNYXRoLm1heCgwLCBsZXZlbEF0KHAucykpLFxuICAgIHdpZHRoOiAzLjIgKyAyLjIgKiBmYm0yKHAucyAvIDcwLCA5LjcsIHNlZWQgKyA4MDIsIDIpICsgKDEgLSBwLnMgLyB0b3RhbCkgKiAxLjUsXG4gIH0pKTtcbiAgY29uc3Qgc291cmNlID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIHtcbiAgICByZWFjaDogbmV3IFJpdmVyUmVhY2gocG9pbnRzLCAxMTApLFxuICAgIHRhcm46IHsgeDogc291cmNlLngsIHo6IHNvdXJjZS56LCByOiAxOCwgbGV2ZWw6IHNvdXJjZS5sZXZlbCB9LFxuICB9O1xufVxuIiwgIi8vIFZveGVsIG1hdGVyaWFsIGlkcy4gUHVyZSBkYXRhIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllciAoRC0wMDUpLlxuLy8gSWRzIGFyZSBwZXJzaXN0ZWQgaW4gc25hcHNob3QgZWRpdHMsIHNvIGV4aXN0aW5nIHZhbHVlcyBtdXN0IG5ldmVyIGNoYW5nZS5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG4gIC8qKiBHZW5lcmF0b3IgdjIgaGlnaGxhbmRzLiBOZXZlciBwcm9kdWNlZCBieSBnZW5lcmF0b3IgdjEuICovXG4gIFNOT1c6IDEwLFxufSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIE1hdElkID0gKHR5cGVvZiBNQVQpW2tleW9mIHR5cGVvZiBNQVRdO1xuXG5leHBvcnQgY29uc3QgaXNTb2xpZCA9IChtOiBudW1iZXIpOiBib29sZWFuID0+IG0gIT09IE1BVC5BSVIgJiYgbSAhPT0gTUFULldBVEVSO1xuZXhwb3J0IGNvbnN0IGlzT3BhcXVlID0gaXNTb2xpZDtcblxuLyoqIEhpZ2hlc3QgbWF0ZXJpYWwgaWQgdGhhdCBtYXkgYXBwZWFyIGluIGEgdm94ZWwgZWRpdC4gKi9cbmV4cG9ydCBjb25zdCBNQVhfTUFUX0lEID0gMTA7XG4iLCAiLy8gVGVycmFpbiBnZW5lcmF0b3IgdjIgXHUyMDE0IHRoZSB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IChwdXJlIFRTLCBELTAwNSkuXG4vL1xuLy8gQ29tcGF0aWJpbGl0eSBjb250cmFjdDogaW5zaWRlIHRoZSBmb3VuZGVyIGNvcnJpZG9yICh0aGUgc2V0dGxlbWVudCB2YWxsZXksXG4vLyB0aGUgbGFrZSBhbmQgdGhlIGxvd2xhbmQgcml2ZXIpIHYyIGhlaWdodHMgZXF1YWwgdjEgZXhhY3RseSwgc28gdGhlIHBpbm5lZFxuLy8gZm91bmRlciBwcm9qZWN0cywgdGhlaXIgcHJlcGFyYXRpb24gdGFyZ2V0cyBhbmQgbmF0dXJhbCBlbnRpdGllcyB0aGVyZSBhcmVcbi8vIHVuY2hhbmdlZC4gT3V0c2lkZSBpdCB2MiBhZGRzOlxuLy8gICAtIGEgbm9ydGhlcm4gbWFzc2lmIG9uIGFuIGV4dGVuZGVkIGlzbGFuZCwgd2l0aCBzbm93IGFib3ZlIHRoZSBzbm93bGluZTtcbi8vICAgLSBmbGFua2luZyByYW5nZXMgd2VzdCBhbmQgZWFzdCBvZiB0aGUgdmFsbGV5LCB0ZXJyYWNlZCBpbnRvIGNsaWZmIGJhbmRzO1xuLy8gICAtIGEgbW91bnRhaW4gcml2ZXIgY2FydmVkIGludG8gdGhlIG1hc3NpZiBmcm9tIGEgdGFybiBkb3duIHRvIHRoZSBsYWtlLFxuLy8gICAgIHdob3NlIHdhdGVyIHN1cmZhY2UgY29tZXMgZnJvbSBIeWRyb2xvZ3kgYW5kIG5ldmVyIHJpc2VzIGRvd25zdHJlYW07XG4vLyAgIC0gYSBjb250aW51b3VzIGxvd2xhbmQgY2hhbm5lbCAodjEgaGFzIGEgZHJ5IGZvcmQgc291dGggb2YgdGhlIHNoZWxmKS5cbi8vIEhlaWdodHMgYXJlIGludGVnZXJzIGluIFstMTQsIDEwNF0uXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbGVycCwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHsgTUFULCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcblxuZXhwb3J0IGNvbnN0IFYyX1NOT1dMSU5FID0gNzQ7XG5leHBvcnQgY29uc3QgVjJfTUFYX0hFSUdIVCA9IDEwNDtcblxuZXhwb3J0IHR5cGUgVjFIZWlnaHQgPSAoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFYyQ29sdW1uIHtcbiAgLyoqIFRvcCBzb2xpZCB5ICsgMSAoc2FtZSBjb252ZW50aW9uIGFzIHN1cmZhY2VIZWlnaHRBdCkuICovXG4gIGg6IG51bWJlcjtcbiAgLyoqIFdhdGVyIHN1cmZhY2UgZm9yIHRoaXMgY29sdW1uOiBjZWxscyBbaCwgbGV2ZWwpIGhvbGQgd2F0ZXIuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBjb2x1bW4gaXMgcGFydCBvZiB0aGUgY2FydmVkIG1vdW50YWluLXJpdmVyIGNoYW5uZWwuICovXG4gIGNoYW5uZWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJyYWluVjIge1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSBzZWVkOiBudW1iZXIsXG4gICAgcHJpdmF0ZSByZWFkb25seSB2MTogVjFIZWlnaHQsXG4gICAgcmVhZG9ubHkgaHlkcm9sb2d5OiBIeWRyb2xvZ3ksXG4gICkge31cblxuICAvKiogMCA9IGV4YWN0bHkgdjEgKGZvdW5kZXIgY29ycmlkb3IpOyAxID0gZnVsbCB2MiByZWxpZWYuICovXG4gIHJlbGllZk1hc2soeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtMzkwLCAtNDcwLCB6KTtcbiAgICAvLyBUaGUgd2VzdCByYW5nZSBrZWVwcyBjbGVhciBvZiB0aGUgbGFrZSBiYXNpbiB1bnRpbCB0aGUgbGFrZSBpcyBwYXNzZWQuXG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlLCB3ZXN0RWRnZSAtIDkwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyMzAsIDMzMCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIC8qKiAwIGF0IHRoZSByYW5nZSBmcm9udCwgMSBkZWVwIGluc2lkZTogZm9vdGhpbGxzIGZpcnN0LCBwZWFrcyBiZWhpbmQuICovXG4gIHJhbmdlRGVwdGgoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtNDIwLCAtNzAwLCB6KTtcbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UgLSA0MCwgd2VzdEVkZ2UgLSAzMDAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDI3MCwgNTYwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVjJDb2x1bW4ge1xuICAgIGNvbnN0IHNlZWQgPSB0aGlzLnNlZWQ7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMudjEoc2VlZCwgeCwgeik7XG4gICAgY29uc3QgbWFzayA9IHRoaXMucmVsaWVmTWFzayh4LCB6KTtcbiAgICBsZXQgaCA9IGJhc2U7XG5cbiAgICBpZiAobWFzayA+IDApIHtcbiAgICAgIC8vIEV4dGVuZCB0aGUgaXNsYW5kIG5vcnRoIHNvIHRoZSBtYXNzaWYgaGFzIHJvb20gKHYxIGNvYXN0IGlzIH56IC02MDApLlxuICAgICAgY29uc3Qgbm9ydGhMYW5kID0gc21vb3Roc3RlcCgtNDIwLCAtNTIwLCB6KTtcbiAgICAgIGNvbnN0IHNob3JlID0gMSAtIE1hdGguaHlwb3QoKHggKyAxNTApIC8gNTYwLCAoeiArIDY5MCkgLyAzMDApXG4gICAgICAgICsgKGZibTIoeCAvIDE2MCwgeiAvIDE2MCwgc2VlZCArIDcwMSwgMykgLSAwLjUpICogMC4zO1xuICAgICAgY29uc3QgbGFuZE4gPSBzbW9vdGhzdGVwKDAuMCwgMC4xNCwgc2hvcmUpICogbm9ydGhMYW5kO1xuICAgICAgY29uc3QgZ3JvdW5kID0gbGVycChiYXNlLCBNYXRoLm1heChiYXNlLCA1ICsgNSAqIGZibTIoeCAvIDkwLCB6IC8gOTAsIHNlZWQgKyA3MDIsIDIpKSwgbGFuZE4pO1xuXG4gICAgICAvLyBSaWRnZWQgbWFzc2lmIHdpdGggdGVycmFjZWQgY2xpZmYgYmFuZHMuXG4gICAgICBjb25zdCB3eCA9IHggKyAoZmJtMih4IC8gMjYwLCB6IC8gMjYwLCBzZWVkICsgNzAzLCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCB3eiA9IHogKyAoZmJtMih4IC8gMjYwICsgNS4xLCB6IC8gMjYwIC0gMi43LCBzZWVkICsgNzA0LCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCByMSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIxMCwgd3ogLyAyMTAsIHNlZWQgKyA3MDUsIDQpIC0gMSk7XG4gICAgICBjb25zdCByMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDgwLCB3eiAvIDgwLCBzZWVkICsgNzA2LCAzKSAtIDEpO1xuICAgICAgY29uc3QgbHVtcCA9IGZibTIod3ggLyAxMjAsIHd6IC8gMTIwLCBzZWVkICsgNzA3LCAzKTtcbiAgICAgIGNvbnN0IGRlcHRoID0gdGhpcy5yYW5nZURlcHRoKHgsIHopO1xuICAgICAgbGV0IG1vdW50YWluID0gMTYgKyAoOCArIDgwICogZGVwdGgpICogKDAuNTUgKiByMSAqIHIxICsgMC4yOCAqIHIyICsgMC4xNyAqIGx1bXApXG4gICAgICAgICsgMTggKiBkZXB0aCAqIHNtb290aHN0ZXAoMC41NSwgMC45LCByMSk7XG4gICAgICBjb25zdCBiYW5kID0gNiArIDIgKiBmYm0yKHggLyAxNDAsIHogLyAxNDAsIHNlZWQgKyA3MDgsIDIpO1xuICAgICAgY29uc3QgdCA9IE1hdGguZmxvb3IobW91bnRhaW4gLyBiYW5kKTtcbiAgICAgIGNvbnN0IGZyYWMgPSBtb3VudGFpbiAvIGJhbmQgLSB0O1xuICAgICAgbW91bnRhaW4gPSAodCArIHNtb290aHN0ZXAoMC41LCAwLjgsIGZyYWMpKSAqIGJhbmQ7XG5cbiAgICAgIC8vIE9ubHkgbGFuZCByaXNlczsgdGhlIHNlYSBzdGF5cyBzZWEsIHNvIHJhbmdlcyBlbmQgaW4gY29hc3RhbCBjbGlmZnMuXG4gICAgICBjb25zdCBsYW5kRmFjdG9yID0gc21vb3Roc3RlcCgtMiwgOCwgZ3JvdW5kKTtcbiAgICAgIGggPSBsZXJwKGdyb3VuZCwgTWF0aC5tYXgoZ3JvdW5kLCBtb3VudGFpbiksIG1hc2sgKiBsYW5kRmFjdG9yKTtcbiAgICB9XG5cbiAgICBsZXQgbGV2ZWwgPSBoIDwgMCA/IDAgOiAtSW5maW5pdHk7XG4gICAgbGV0IGNoYW5uZWwgPSBmYWxzZTtcblxuICAgIC8vIE1vdW50YWluIHJpdmVyOiB2YWxsZXkgZmxvb3IsIGJhbmtzIGFuZCBjaGFubmVsIGZvbGxvdyB0aGUgd2F0ZXIgbGV2ZWwuXG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIGNvbnN0IHJhaXNlZCA9IGhpdC5sZXZlbCA+IDAuMjU7XG4gICAgICAgIGNvbnN0IHZ3ID0gNTUgKyAyOCAqIGZibTIoaGl0LnMgLyA5MCwgMS43LCBzZWVkICsgNzA5LCAyKTtcbiAgICAgICAgY29uc3QgZmxvb3IgPSBoaXQubGV2ZWwgKyAxLjUgKyAyLjIgKiBmYm0yKHggLyA0MCwgeiAvIDQwLCBzZWVkICsgNzEwLCAyKSArIGhpdC5kICogMC4wNjtcbiAgICAgICAgY29uc3QgdCA9IHNtb290aHN0ZXAodncgKiAwLjMsIHZ3LCBoaXQuZCk7XG4gICAgICAgIGggPSBNYXRoLm1pbihoLCBsZXJwKGZsb29yLCBoLCB0KSk7XG4gICAgICAgIGNvbnN0IHcgPSBoaXQud2lkdGg7XG4gICAgICAgIGlmIChyYWlzZWQgJiYgaGl0LmQgPCB3ICsgMykge1xuICAgICAgICAgIC8vIEJhbmtzIGhvbGQgYSByYWlzZWQgcml2ZXI6IG5ldmVyIGJlbG93IGl0cyB3YXRlciBzdXJmYWNlLiBBdCBsYWtlXG4gICAgICAgICAgLy8gbGV2ZWwgdGhlIHNlYS1sZXZlbCBmaWxsIGFscmVhZHkgY29udGFpbnMgdGhlIHdhdGVyLlxuICAgICAgICAgIGggPSBNYXRoLm1heChoLCBNYXRoLmNlaWwoaGl0LmxldmVsKSArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoaXQuZCA8IHcpIHtcbiAgICAgICAgICBjb25zdCBiZWQgPSBoaXQubGV2ZWwgLSAoMS4yICsgMS4zICogKDEgLSBoaXQuZCAvIHcpKTtcbiAgICAgICAgICBoID0gTWF0aC5taW4oaCwgYmVkKTtcbiAgICAgICAgICBpZiAocmFpc2VkKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKGhpdC5sZXZlbCkpO1xuICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCB0YXJuID0gdGhpcy5oeWRyb2xvZ3kudGFybjtcbiAgICAgIGlmICh0YXJuKSB7XG4gICAgICAgIGNvbnN0IHRkID0gTWF0aC5oeXBvdCh4IC0gdGFybi54LCB6IC0gdGFybi56KVxuICAgICAgICAgICogKDEgKyAwLjIgKiAoZmJtMih4IC8gMzAsIHogLyAzMCwgc2VlZCArIDcxMSwgMikgLSAwLjUpKTtcbiAgICAgICAgaWYgKHRkIDwgdGFybi5yICsgNikge1xuICAgICAgICAgIGNvbnN0IHJpbSA9IE1hdGguY2VpbCh0YXJuLmxldmVsKSArIDE7XG4gICAgICAgICAgaWYgKHRkID49IHRhcm4ucikgaCA9IE1hdGgubWF4KGgsIHJpbSk7XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBoID0gTWF0aC5taW4oTWF0aC5tYXgoaCwgcmltKSwgdGFybi5sZXZlbCAtIDEgLSAzICogc21vb3Roc3RlcCh0YXJuLnIsIDAsIHRkKSk7XG4gICAgICAgICAgICBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKHRhcm4ubGV2ZWwpKTtcbiAgICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExvd2xhbmQgY2hhbm5lbCBjb250aW51aXR5OiB2MSBsZWF2ZXMgYSBkcnkgZm9yZCB3aGVyZSB0aGUgc2hlbGYgbWVldHMgdGhlIHJpdmVyLlxuICAgIGNvbnN0IGxvdyA9IHRoaXMuaHlkcm9sb2d5Lmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8IDIuNSAmJiBoID49IDAgJiYgYmFzZSA8IDQpIGggPSAtMTtcblxuICAgIGggPSBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgVjJfTUFYX0hFSUdIVCkpO1xuICAgIGlmIChoIDwgMCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgMCk7XG4gICAgcmV0dXJuIHsgaCwgbGV2ZWw6IGxldmVsID09PSAtSW5maW5pdHkgPyBoIDogbGV2ZWwsIGNoYW5uZWwgfTtcbiAgfVxuXG4gIGhlaWdodCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY29sdW1uKHgsIHopLmg7XG4gIH1cblxuICAvKiogdjIgdG9wIG1hdGVyaWFsLiBGYWxscyBiYWNrIHRvIHRoZSB2MSBydWxlcyBmb3IgdGhlIHVuY2hhbmdlZCBjb3JyaWRvci4gKi9cbiAgdG9wTWF0ZXJpYWwoXG4gICAgeDogbnVtYmVyLCB6OiBudW1iZXIsIGNvbDogVjJDb2x1bW4sIHNsb3BlOiBudW1iZXIsXG4gICAgdjFUb3A6IChoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIpID0+IE1hdElkLFxuICApOiBNYXRJZCB7XG4gICAgY29uc3QgaCA9IGNvbC5oO1xuICAgIGlmIChjb2wuY2hhbm5lbCAmJiBjb2wubGV2ZWwgPiBoKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlciAmJiBoID4gMSkge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPCBoaXQud2lkdGggKyAyLjUgJiYgaGl0LmxldmVsID4gMC4yNSkge1xuICAgICAgICByZXR1cm4gZmJtMih4IC8gNiwgeiAvIDYsIHRoaXMuc2VlZCArIDcxMiwgMSkgPiAwLjUgPyBNQVQuR1JBVkVMIDogTUFULlNBTkQ7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNub3dsaW5lID0gVjJfU05PV0xJTkUgKyAoZmJtMih4IC8gNzAsIHogLyA3MCwgdGhpcy5zZWVkICsgNzEzLCAzKSAtIDAuNSkgKiAxNjtcbiAgICBpZiAoaCA+PSBzbm93bGluZSAmJiBzbG9wZSA8PSAzKSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgLSA2ICYmIHNsb3BlIDw9IDEgJiYgZmJtMih4IC8gMjAsIHogLyAyMCwgdGhpcy5zZWVkICsgNzE0LCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAodGhpcy5yZWxpZWZNYXNrKHgsIHopID4gMC41ICYmIGggPiAzMCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICAgIHJldHVybiB2MVRvcChoLCBzbG9wZSk7XG4gIH1cbn1cbiIsICIvLyBTaW11bGF0aW9uIGxheWVyIFx1MjAxNCBwdXJlIFR5cGVTY3JpcHQsIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAxIHdvcmxkIGZvdW5kYXRpb246IGEgY2h1bmtlZCwgZ2VudWluZWx5IHRocmVlLWRpbWVuc2lvbmFsIHZveGVsIHdvcmxkLlxuLy8gVGhlIHN0b3JlZCBzdGF0ZSBpcyBvbmUgbWF0ZXJpYWwgYnl0ZSBwZXIgY2VsbCAoMCA9IGFpcik7IG9jY3VwYW5jeSBpc1xuLy8gaW1wbGljaXQuIFN1cmZhY2UgaGVpZ2h0IGlzIGEgZGVyaXZlZCBxdWVyeSwgbm90IHRoZSBzdG9yYWdlLiBUaGlzIHJlcGxhY2VzXG4vLyB0aGUgZm9ybWVyIDI1NiB4IDI1NiBoZWlnaHRmaWVsZCAoc2VlIElSLTAwNSkuXG4vL1xuLy8gV29ybGQgbWV0cmVzOiB4L3ogaW4gWy0xMDI0LCAxMDI0KSwgeSBpbiBbLTE2LCAxMTIpLCBzZWEgbGV2ZWwgMC5cbi8vIEEgY2h1bmsgaXMgMzIgeCAzMiB4IDEyOCBjZWxscy4gR2VuZXJhdGlvbiBpcyBhIHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQsXG4vLyBnZW5lcmF0b3IgdmVyc2lvbiwgcGFyYW1ldGVycyBhbmQgY2h1bmsgY29vcmRpbmF0ZXM7IGVkaXRzIGFyZSByZWNvcmRlZFxuLy8gc2VwYXJhdGVseSBhbmQgcmUtYXBwbGllZCB3aGVuIGEgY2h1bmsgaXMgcmVnZW5lcmF0ZWQuXG5pbXBvcnQgdHlwZSB7IFN0cnVjdHVyZSB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQgdHlwZSB7IExpZmVTdGF0ZSB9IGZyb20gJy4vZWNvbm9teSc7XG5pbXBvcnQgeyBpc1N0b25lUmVwbGF5IH0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuaW1wb3J0IHsgSHlkcm9sb2d5IH0gZnJvbSAnLi9oeWRyb2xvZ3knO1xuaW1wb3J0IHsgVGVycmFpblYyLCBWMkNvbHVtbiB9IGZyb20gJy4vdGVycmFpbi12Mic7XG5cbmV4cG9ydCBjb25zdCBXT1JMRF9TSVpFID0gMjA0ODtcbmV4cG9ydCBjb25zdCBIQUxGID0gV09STERfU0laRSAvIDI7XG5leHBvcnQgY29uc3QgQ0hVTktfU0laRSA9IDMyO1xuZXhwb3J0IGNvbnN0IENIVU5LU19QRVJfU0lERSA9IFdPUkxEX1NJWkUgLyBDSFVOS19TSVpFO1xuZXhwb3J0IGNvbnN0IFlfTUlOID0gLTE2O1xuZXhwb3J0IGNvbnN0IFlfTUFYID0gMTEyO1xuZXhwb3J0IGNvbnN0IFdPUkxEX0hFSUdIVCA9IFlfTUFYIC0gWV9NSU47XG5leHBvcnQgY29uc3QgU0VBX0xFVkVMID0gMDtcbmV4cG9ydCBjb25zdCBXQVRFUiA9IFNFQV9MRVZFTDtcbi8qKiBHZW5lcmF0b3IgdjE6IHRoZSBvcmlnaW5hbCAyMDQ4IG0gaXNsYW5kLiBEZWZhdWx0IGZvciBjcmVhdGVXb3JsZCBhbmQgYWxsIGxlZ2FjeSBzYXZlcy4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVkVSU0lPTiA9IDE7XG4vKiogR2VuZXJhdG9yIHYyOiB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IHdpdGggYSBtb3VudGFpbiByaXZlciAoc2VlIHRlcnJhaW4tdjIudHMpLiAqL1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WMiA9IDI7XG4vKiogVGhlIGdlbmVyYXRvciBuZXcgYnJvd3NlciB3b3JsZHMgdXNlIGJ5IGRlZmF1bHQuICovXG5leHBvcnQgY29uc3QgTEFURVNUX0dFTkVSQVRPUl9WRVJTSU9OID0gR0VORVJBVE9SX1YyO1xuZXhwb3J0IGNvbnN0IFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlM6IHJlYWRvbmx5IG51bWJlcltdID0gW0dFTkVSQVRPUl9WRVJTSU9OLCBHRU5FUkFUT1JfVjJdO1xuZXhwb3J0IGNvbnN0IGlzU3VwcG9ydGVkR2VuZXJhdG9yID0gKHY6IHVua25vd24pOiB2IGlzIG51bWJlciA9PlxuICB0eXBlb2YgdiA9PT0gJ251bWJlcicgJiYgU1VQUE9SVEVEX0dFTkVSQVRPUl9WRVJTSU9OUy5pbmNsdWRlcyh2KTtcbmV4cG9ydCBjb25zdCBDSFVOS19WT0xVTUUgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRSAqIFdPUkxEX0hFSUdIVDtcbmV4cG9ydCBjb25zdCBDSFVOS19BUkVBID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkU7XG5cbmV4cG9ydCB7IE1BVCwgaXNTb2xpZCwgaXNPcGFxdWUsIE1BWF9NQVRfSUQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5leHBvcnQgdHlwZSB7IE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuaW1wb3J0IHsgTUFULCBpc1NvbGlkLCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcblxuZXhwb3J0IHtcbiAgY2xhbXAsIGxlcnAsIGhhc2gyaSwgaGFzaDNpLCBtdWxiZXJyeTMyLCBmYm0yLFxufSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBzbW9vdGhzdGVwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgdmFsdWVOb2lzZTMsIGZibTIsIGZibTMsXG59IGZyb20gJy4vbm9pc2UnO1xuXG4vLyAtLS0tLS0tLS0tIHdvcmxkIHR5cGVzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRQYXJhbXMge1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9QQVJBTVM6IFdvcmxkUGFyYW1zID0ge1xuICBzaXplOiBXT1JMRF9TSVpFLFxuICBjaHVua1NpemU6IENIVU5LX1NJWkUsXG4gIHlNaW46IFlfTUlOLFxuICB5TWF4OiBZX01BWCxcbiAgc2VhTGV2ZWw6IFNFQV9MRVZFTCxcbiAgZ2VuZXJhdG9yVmVyc2lvbjogR0VORVJBVE9SX1ZFUlNJT04sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBrZXk6IHN0cmluZztcbiAgLyoqIHggKyB6KjMyICsgKHktWV9NSU4pKjEwMjQgKi9cbiAgZGF0YTogVWludDhBcnJheTtcbiAgLyoqIHRvcCBzb2xpZCB5LCBlbmNvZGVkIGFzICh5IC0gWV9NSU4pLCAwLi4xMjc7IDAgbWVhbnMgbm8gc29saWQuICovXG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3AgbWF0ZXJpYWwgcGVyIGNvbHVtbi4gKi9cbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbiAgZGlydHk6IGJvb2xlYW47XG4gIGdlbmVyYXRlZEF0OiBudW1iZXI7XG59XG5cbi8vIE5hdHVyYWwgYXNzZXRzIGFyZSB0aGUgcHJvamVjdCdzIFN0eWwgKGBuYXRfYCkgcGlwZWxpbmUgKEFTLTAwMSB2MiksIG5vdFxuLy8gTm94ZWwgYXJjaGl0ZWN0dXJlLiBOb3hlbCByZW1haW5zIHRoZSBodW1hbi1tYWRlIGtpdC93YXlzdG9uZS9tYXJrZXIgc3lzdGVtLlxuLy8gUmV0aXJlZCBvbmx5IGFzIHdvcmxkIGNvbnRlbnQuIFRoZSBuYW1lcyByZW1haW4gaW4gdGhlIHNlcmlhbGl6ZWQgdHlwZSBzb1xuLy8gb2xkIHNuYXBzaG90cyBhbmQgYWNjZXB0ZWQgaGFydmVzdCBqb3VybmFscyBjYW4gYmUgbWlncmF0ZWQgd2l0aG91dCByZWplY3Rpbmdcbi8vIG90aGVyd2lzZSB2YWxpZCBzYXZlcy4gR2VuZXJhdGlvbiwgY29sbGlzaW9uIGFuZCBpbnNwZWN0aW9uIG5ldmVyIHVzZSB0aGVtLlxuZXhwb3J0IGNvbnN0IFJFVElSRURfU1RPTkVfS0lORFMgPSBuZXcgU2V0PEVudGl0eUtpbmQ+KFtcbiAgJ3N0eWxfcm9ja19zbWFsbCcsICdzdHlsX3JvY2tfbWVkaXVtJywgJ3N0eWxfcm9ja19sYXJnZScsXG5dKTtcbmV4cG9ydCBjb25zdCBpc1JldGlyZWRTdG9uZUtpbmQgPSAoa2luZDogRW50aXR5S2luZCk6IGJvb2xlYW4gPT4gUkVUSVJFRF9TVE9ORV9LSU5EUy5oYXMoa2luZCk7XG5leHBvcnQgdHlwZSBBY3RpdmVFbnRpdHlLaW5kID0gRXhjbHVkZTxFbnRpdHlLaW5kLFxuICAnc3R5bF9yb2NrX3NtYWxsJyB8ICdzdHlsX3JvY2tfbWVkaXVtJyB8ICdzdHlsX3JvY2tfbGFyZ2UnPjtcblxuZnVuY3Rpb24gbGl2ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBFbnRpdHkgfCBudWxsIHtcbiAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgcmV0dXJuICFlbnRpdHkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhpZCkgPyBudWxsIDogZW50aXR5O1xufVxuXG5leHBvcnQgdHlwZSBFbnRpdHlLaW5kID1cbiAgfCAnc3R5bF90cmVlX3NwaXJlJ1xuICB8ICdzdHlsX3RyZWVfdGFibGUnXG4gIHwgJ3N0eWxfdHJlZV9jbHVzdGVyJ1xuICB8ICdzdHlsX3RyZWVfYmxvc3NvbSdcbiAgfCAnc3R5bF9zaHJ1YidcbiAgfCAnc3R5bF9yb2NrX3NtYWxsJ1xuICB8ICdzdHlsX3JvY2tfbWVkaXVtJ1xuICB8ICdzdHlsX3JvY2tfbGFyZ2UnXG4gIHwgJ3N0eWxfb3JlJ1xuICB8ICdzdHlsX2NhaXJuJ1xuICB8ICd3YXlzdG9uZSdcbiAgfCAnbWFya2VyJztcblxuZXhwb3J0IHR5cGUgUmVzb3VyY2VUeXBlID0gJ3dvb2QnIHwgJ3N0b25lJyB8ICdvcmUnIHwgJ2ZpYmVyJztcblxuZXhwb3J0IGludGVyZmFjZSBFbnRpdHkge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICBjaHVuazogc3RyaW5nO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgc2NhbGU6IG51bWJlcjtcbiAgdmFyaWFudDogbnVtYmVyO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgcmVtYWluaW5nOiBudW1iZXI7XG4gIHlpZWxkUGVySGFydmVzdDogbnVtYmVyO1xuICAvKiogVHJ1ZSBvbmNlIHRoZSBlbnRpdHkgaXMgZnVsbHkgZGVwbGV0ZWQuICovXG4gIGhhcnZlc3RlZDogYm9vbGVhbjtcbiAgLyoqIFRydWUgYWZ0ZXIgdGhlIGZpcnN0IHN1Y2Nlc3NmdWwgaGFydmVzdCwgZXZlbiBpZiB5aWVsZCByZW1haW5zLiAqL1xuICBoYXJ2ZXN0ZWRPbmNlPzogYm9vbGVhbjtcbiAgcHJvdmlzaW9uYWw6IGJvb2xlYW47XG4gIGF1dGhvcmVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5veGVsU2l0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHByb3Zpc2lvbmFsOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZ2lvbkluZm8ge1xuICBpZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICB0eXBlOiAncGxhaW4nIHwgJ2ZvcmVzdCcgfCAnaGlsbHMnIHwgJ2hpZ2hsYW5kJyB8ICd3YXRlcicgfCAncmlkZ2UnO1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICByeDogbnVtYmVyO1xuICByejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkU3RhdHMge1xuICBjaHVua3NHZW5lcmF0ZWQ6IG51bWJlcjtcbiAgY2h1bmtzRXZpY3RlZDogbnVtYmVyO1xuICB2b3hlbHNGaWxsZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGlvbk1zOiBudW1iZXI7XG4gIGVudGl0aWVzOiBudW1iZXI7XG4gIHRyZWVzOiBudW1iZXI7XG4gIHBpbmtUcmVlczogbnVtYmVyO1xuICBwaW5rT3ZlcmZsb3c6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcGFyYW1zOiBXb3JsZFBhcmFtcztcbiAgY2h1bmtzOiBNYXA8c3RyaW5nLCBWb3hlbENodW5rPjtcbiAgZW50aXRpZXM6IE1hcDxzdHJpbmcsIEVudGl0eT47XG4gIGVudGl0eUNodW5rczogTWFwPHN0cmluZywgc3RyaW5nW10+O1xuICAvKiogQ2h1bmtzIHdob3NlIGRldGVybWluaXN0aWMgbmF0dXJhbC1lbnRpdHkgc3RhdGUgaGFzIGJlZW4gY2hhbmdlZC4gKi9cbiAgZW50aXR5Q2hhbmdlczogU2V0PHN0cmluZz47XG4gIC8qKiBUb21ic3RvbmVzIGZvciByZW1vdmVkIGRldGVybWluaXN0aWMgbmF0dXJhbCBlbnRpdGllcy4gKi9cbiAgZW50aXR5UmVtb3ZhbHM6IFNldDxzdHJpbmc+O1xuICAvKiogQXV0aG9yaXRhdGl2ZSBidWlsdCBzdHJ1Y3R1cmVzIChob3VzZSwgcGF0aCwgdGVycmFjZXMsIGNyb3BzKS4gKi9cbiAgc3RydWN0dXJlczogTWFwPHN0cmluZywgU3RydWN0dXJlPjtcbiAgc2l0ZXM6IE5veGVsU2l0ZVtdO1xuICByZWdpb25zOiBSZWdpb25JbmZvW107XG4gIC8qKiBjaHVuayBrZXkgLT4gbG9jYWwgdm94ZWwgaW5kZXggLT4gbWF0ZXJpYWwuIER1cmFibGUsIGNvbXBhY3QgZWRpdHMuICovXG4gIGVkaXRzOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCBudW1iZXI+PjtcbiAgLyoqIEdsb2JhbCBsb2NhbC1wbGF5ZXIgY2FycmllZCBiYWc7IGJvdW5kZWQgaW4gc2NoZW1hIDMsIGxlZ2FjeSBpbiAxLzIuICovXG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgLyoqIFByZXNlbnQgb25seSBhZnRlciBzY2hlbWEtMyBnZW5lc2lzL3Jlc3RvcmF0aW9uLiAqL1xuICBsaWZlPzogTGlmZVN0YXRlO1xuICBkaXJ0eTogU2V0PHN0cmluZz47XG4gIHN0YXRzOiBXb3JsZFN0YXRzO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqXG4gICAqIE1vbm90b25pYyByZXZpc2lvbiBvZiBhdXRob3JpdGF0aXZlIHN0YXRlICh2b3hlbHMgYW5kIGVudGl0aWVzKS4gRGVyaXZlZFxuICAgKiBjYWNoZXMga2V5ZWQgb24gdGhpcyB2YWx1ZSBhcmUgZGlzY2FyZGVkIGFmdGVyIGFuIGVkaXQ7IG1lc2gvbmF2aWdhdGlvblxuICAgKiByZXZpc2lvbnMgYXJlIHNlcGFyYXRlIGJlY2F1c2UgdGhleSBhcmUgZGVyaXZlZCwgbm90IHdvcmxkIHN0YXRlLlxuICAgKi9cbiAgcmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGNodW5rS2V5ID0gKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpID0+IGAke2N4fSwke2N6fWA7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5YID0gKGN4OiBudW1iZXIpID0+IGN4ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5aID0gKGN6OiBudW1iZXIpID0+IGN6ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgbG9jYWxJbmRleCA9IChseDogbnVtYmVyLCB5SW5kZXg6IG51bWJlciwgbHo6IG51bWJlcikgPT5cbiAgbHggKyBseiAqIENIVU5LX1NJWkUgKyB5SW5kZXggKiBDSFVOS19BUkVBO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ggPSAoeDogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh4ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtaID0gKHo6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeiArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWCA9ICh4OiBudW1iZXIpID0+IHggLSAod29ybGRUb0NodW5rWCh4KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxaID0gKHo6IG51bWJlcikgPT4geiAtICh3b3JsZFRvQ2h1bmtaKHopICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHlUb0luZGV4ID0gKHk6IG51bWJlcikgPT4geSAtIFlfTUlOO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGQoc2VlZCA9IDEzMzcsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgaWYgKCFpc1N1cHBvcnRlZEdlbmVyYXRvcihnZW5lcmF0b3JWZXJzaW9uKSkgdGhyb3cgbmV3IEVycm9yKGB1bnN1cHBvcnRlZCBnZW5lcmF0b3IgdmVyc2lvbiAke2dlbmVyYXRvclZlcnNpb259YCk7XG4gIHJldHVybiB7XG4gICAgc2VlZCxcbiAgICBwYXJhbXM6IHsgLi4uREVGQVVMVF9QQVJBTVMsIGdlbmVyYXRvclZlcnNpb24gfSxcbiAgICBjaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdGllczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNoYW5nZXM6IG5ldyBTZXQoKSxcbiAgICBlbnRpdHlSZW1vdmFsczogbmV3IFNldCgpLFxuICAgIHN0cnVjdHVyZXM6IG5ldyBNYXAoKSxcbiAgICBzaXRlczogW10sXG4gICAgcmVnaW9uczogUkVHSU9OUyxcbiAgICBlZGl0czogbmV3IE1hcCgpLFxuICAgIGludmVudG9yeToge30sXG4gICAgZGlydHk6IG5ldyBTZXQoKSxcbiAgICBzdGF0czoge1xuICAgICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICAgIGVudGl0aWVzOiAwLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gICAgfSxcbiAgICBhdXRob3JlZFBsYWNlZDogZmFsc2UsXG4gICAgcmV2aXNpb246IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBpbml0aWFsUmFkaXVzID0gMCwgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQsIGdlbmVyYXRvclZlcnNpb24pO1xuICBjb25zdCBjZW50cmUgPSBNYXRoLmZsb29yKENIVU5LU19QRVJfU0lERSAvIDIpO1xuICBmb3IgKGxldCBjeiA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN6IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN4IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN4KyspIHtcbiAgICAgIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgfVxuICB9XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuLy8gLS0tLS0tLS0tLSBnZW9ncmFwaHkgLS0tLS0tLS0tLVxuZXhwb3J0IGNvbnN0IFJFR0lPTlM6IFJlZ2lvbkluZm9bXSA9IFtcbiAgeyBpZDogJ2ZvdW5kZXInLCBsYWJlbDogJ0ZvdW5kZXIgdmFsbGV5JywgdHlwZTogJ3BsYWluJywgY3g6IDAsIGN6OiAwLCByeDogMTEwLCByejogODUgfSxcbiAgeyBpZDogJ2Vhc3R3b29kJywgbGFiZWw6ICdFYXN0d29vZCcsIHR5cGU6ICdmb3Jlc3QnLCBjeDogMjIwLCBjejogLTExMCwgcng6IDI2MCwgcno6IDIyMCB9LFxuICB7IGlkOiAnY3Jvd24nLCBsYWJlbDogJ0Nyb3duIGhpZ2hsYW5kcycsIHR5cGU6ICdoaWdobGFuZCcsIGN4OiAtMzYwLCBjejogLTMwMCwgcng6IDM4MCwgcno6IDMwMCB9LFxuICB7IGlkOiAnbGFrZScsIGxhYmVsOiAnTWlycm9yIGxha2UnLCB0eXBlOiAnd2F0ZXInLCBjeDogLTI2MCwgY3o6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9LFxuICB7IGlkOiAnc291dGhkb3ducycsIGxhYmVsOiAnU291dGggZG93bnMnLCB0eXBlOiAnaGlsbHMnLCBjeDogMTIwLCBjejogMzMwLCByeDogMjYwLCByejogMTkwIH0sXG4gIHsgaWQ6ICd3ZXN0cmlzZScsIGxhYmVsOiAnV2VzdCByaXNlJywgdHlwZTogJ2hpbGxzJywgY3g6IC0zNjAsIGN6OiAxMjAsIHJ4OiAyMjAsIHJ6OiAyMTAgfSxcbiAgeyBpZDogJ2NvYXN0JywgbGFiZWw6ICdCcm9rZW4gY29hc3QnLCB0eXBlOiAncmlkZ2UnLCBjeDogMCwgY3o6IDAsIHJ4OiA3ODAsIHJ6OiA2NjAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckNlbnRlclgoejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVGhlIHJpdmVyIHJ1bnMgbm9ydGhcdTIwMTNzb3V0aCBhYm91dCA3MFx1MjAxMzExMCBtIHdlc3Qgb2YgdGhlIGZvdW5kZXIgc2hlbGYsIHNvXG4gIC8vIHRoZSBkZWZhdWx0IG5vcnRoLXdlc3QgdmlldyBoYXMgd2F0ZXIsIGEgbmVhciBiYW5rIGFuZCBhIGZhciBiYW5rLlxuICByZXR1cm4gLTkwICsgNTUgKiBNYXRoLnNpbigoeiArIDEwMCkgLyAyNDApICsgMTggKiBNYXRoLnNpbigoeiAtIDIwKSAvIDgwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5hYnMoeCAtIHJpdmVyQ2VudGVyWCh6KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsYWtlRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5zcXJ0KCgoeCArIDI2MCkgLyAxMjApICoqIDIgKyAoKHogKyAyMzApIC8gOTUpICoqIDIpO1xufVxuXG4vKipcbiAqIEludGVnZXIgdG9wIHNvbGlkIHkgb2YgdGhlIGJhc2UgZ2VuZXJhdGVkIHN1cmZhY2UgKG5vIGVkaXRzL292ZXJoYW5ncykuXG4gKlxuICogVGhpcyBpcyB0aGUgKnNoYXBlKiB0aGUgdm94ZWwgdm9sdW1lIGlzIGZpbGxlZCBmcm9tLCBub3QgdGhlIHN0b3JlZCB3b3JsZC5cbiAqIFRoZSBpbXBvcnRhbnQgY29ycmVjdGlvbiBvdmVyIHRoZSBmaXJzdCBNMDAxIHBhc3MgaXMgdGhhdCB0aGUgbGFuZHNjYXBlIGlzXG4gKiBub3Qgb25lIHNtb290aCByYWRpYWwgYm93bDogaXQgaXMgYSB3YXJwZWQgbXVsdGktc2NhbGUgc3VyZmFjZSB3aXRoIGEgYnJvYWRcbiAqIHJpdmVyIHZhbGxleSwgYSBzbWFsbCBidWlsZGFibGUgc2hlbGYsIGFuZCByaWRnZWQgaGlnaGxhbmRzLiBBIHNoYWxsb3dcbiAqIHNtb290aCBzdXJmYWNlIHF1YW50aXNlZCB0byAxIG0gdm94ZWxzIGlzIHdoYXQgcHJvZHVjZWQgdGhlIGNvbmNlbnRyaWNcbiAqIGNvbnRvdXIgcmluZ3M7IHZhcmllZCByZWxpZWYgYW5kIGEgcml2ZXIgdmFsbGV5IGJyZWFrIHRoZW0gbmF0dXJhbGx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUd28tc2NhbGUgZG9tYWluIHdhcnAuIFRoZSBicm9hZCB3YXJwIG1vdmVzIGNvYXN0bGluZXMgYW5kIGhpbGxzOyB0aGVcbiAgLy8gc21hbGwgd2FycCBrZWVwcyB0aGUgMSBtIHF1YW50aXNhdGlvbiBmcm9tIGZvbGxvd2luZyBjbGVhbiBjb250b3Vycy5cbiAgY29uc3Qgd3ggPSB4XG4gICAgKyAoZmJtMih4IC8gNDIwLCB6IC8gNDIwLCBzZWVkICsgMTAxLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSwgeiAvIDk1LCBzZWVkICsgMTAyLCAyKSAtIDAuNSkgKiAzMDtcbiAgY29uc3Qgd3ogPSB6XG4gICAgKyAoZmJtMih4IC8gNDIwICsgNy4zLCB6IC8gNDIwIC0gMy4xLCBzZWVkICsgMTAzLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSArIDMuNywgeiAvIDk1IC0gOC4xLCBzZWVkICsgMTA0LCAyKSAtIDAuNSkgKiAzMDtcblxuICBjb25zdCByYWRpYWwgPSBNYXRoLnNxcnQoKHd4IC8gNzgwKSAqKiAyICsgKHd6IC8gNjYwKSAqKiAyKTtcbiAgY29uc3QgY29hc3ROb2lzZSA9IChmYm0yKHd4IC8gMzAwLCB3eiAvIDMwMCwgc2VlZCArIDEwNSwgNCkgLSAwLjUpICogMC4zNFxuICAgICsgKGZibTIod3ggLyA5NSwgd3ogLyA5NSwgc2VlZCArIDEwNiwgMikgLSAwLjUpICogMC4xMDtcbiAgY29uc3QgbGFuZG5lc3MgPSAxLjAgLSByYWRpYWwgKyBjb2FzdE5vaXNlO1xuICBjb25zdCBpbmxhbmQgPSBzbW9vdGhzdGVwKC0wLjAzLCAwLjEyLCBsYW5kbmVzcyk7XG5cbiAgY29uc3Qgb2NlYW5GbG9vciA9IC0xMyArIDYgKiBmYm0yKHd4IC8gMTcwLCB3eiAvIDE3MCwgc2VlZCArIDEwNywgMyk7XG5cbiAgLy8gUm9sbGluZyBsYW5kIGF0IHRocmVlIHNjYWxlcy4gVGhlIDQwIG0gYW5kIDE1IG0gY29tcG9uZW50cyBhcmUgcmVhbFxuICAvLyBzdXJmYWNlIGhlaWdodCwgbm90IGEgcmVuZGVyIGRlY29yYXRpb24sIHNvIHRoZSBtYWNybyBzYW1wbGVyIGFncmVlcy5cbiAgY29uc3Qgc3dlbGwgPSA0ICsgMTEgKiBmYm0yKHd4IC8gMzQwLCB3eiAvIDM0MCwgc2VlZCArIDEwOCwgNCk7XG4gIGNvbnN0IGhpbGxzID0gOCAqIGZibTIod3ggLyAxMTUsIHd6IC8gMTE1LCBzZWVkICsgMTA5LCAzKTtcbiAgY29uc3QgYnVtcHMgPSAyLjIgKiBmYm0yKHggLyA0MiwgeiAvIDQyLCBzZWVkICsgMTEwLCAyKVxuICAgICsgMC45ICogZmJtMih4IC8gMTUsIHogLyAxNSwgc2VlZCArIDExMSwgMik7XG5cbiAgLy8gUmlkZ2VkIGhpZ2hsYW5kcy4gVGhlIG1hc3NpZiBtYXNrIGlzIHJlZ2lvbmFsIGFuZCBiaWFzZWQgdG8gdGhlXG4gIC8vIG5vcnRoLXdlc3Q7IHdpdGhvdXQgdGhlIHJlZ2lvbmFsIGdhdGUgdGhlIGZpcnN0IE0wMDEgcGFzcyByYWlzZWQgYSA0OCBtXG4gIC8vIG1vdW50YWluIGRpcmVjdGx5IHVuZGVyIHRoZSBmb3VuZGVyIHNoZWxmLlxuICBjb25zdCBtYXNzaWZOb2lzZSA9IGZibTIod3ggLyA0ODAgKyAxMSwgd3ogLyA0ODAgLSA3LCBzZWVkICsgMTEyLCA0KTtcbiAgY29uc3QgbWFzc2lmTWFzayA9IHNtb290aHN0ZXAoMC42MCwgMC43OCwgbWFzc2lmTm9pc2UpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIzMCwgd3ogLyAyMzAsIHNlZWQgKyAxMTMsIDQpIC0gMSk7XG4gIGNvbnN0IHJpZGdlMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE0LCAzKSAtIDEpO1xuICBjb25zdCBud0JpYXMgPSBNYXRoLmV4cCgtKCgod3ggKyAzNjApIC8gMzgwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAzMjApICoqIDIpKTtcbiAgY29uc3QgbW91bnQgPSBNYXRoLm1pbigxLCBtYXNzaWZNYXNrICogKDAuMzAgKyAwLjcwICogbndCaWFzKSArIDAuMjIgKiBud0JpYXMpO1xuXG4gIGxldCBoID0gc3dlbGwgKyBoaWxscyArIGJ1bXBzXG4gICAgKyBtb3VudCAqICgyMCArIDQwICogcmlkZ2UgKiByaWRnZSArIDEyICogcmlkZ2UyKTtcblxuICAvLyBTcHVycyBhbmQgZ3VsbGllcyBhdCAzMFx1MjAxMzkwIG0uIFdpdGhvdXQgdGhlc2UsIGEgc21vb3RoIGhpbGwgcXVhbnRpc2VkIHRvXG4gIC8vIDEgbSB2b3hlbHMgcmVhZHMgYXMgY29uY2VudHJpYyBjb250b3VyIHJpbmdzOyB3aXRoIHRoZW0sIHRoZSBzYW1lIGhpbGxcbiAgLy8gYnJlYWtzIGludG8gcmlkZ2VzLCBzaWRlIHZhbGxleXMgYW5kIHJvY2sgZmFjZXMuXG4gIGNvbnN0IHNwdXIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4NSwgd3ogLyA4NSwgc2VlZCArIDEyMCwgMykgLSAxKTtcbiAgY29uc3QgZ3VsbHkgPSBNYXRoLnBvdygxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA1MiArIDEzLCB3eiAvIDUyIC0gNSwgc2VlZCArIDEyMSwgMykgLSAxKSwgMik7XG4gIGggKz0gKHNwdXIgLSAwLjU1KSAqIDUuMCAtIGd1bGx5ICogMy4yO1xuXG4gIGggPSBvY2VhbkZsb29yICsgKGggLSBvY2VhbkZsb29yKSAqIGlubGFuZDtcbiAgaCArPSAxLjYgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuXG4gIC8vIEJyb2FkIHJpdmVyIHZhbGxleSwgdGhlbiB0aGUgY2hhbm5lbCBpdHNlbGYuIFRoZSB2YWxsZXkgbWFzayBpcyBnYXRlZCBieVxuICAvLyBsYW5kbmVzczogd2l0aG91dCB0aGUgZ2F0ZSBpdCBwdWxsZWQgdGhlIG9jZWFuIGZsb29yIHVwIHRvIHRoZSB2YWxsZXlcbiAgLy8gZmxvb3Igb3V0c2lkZSB0aGUgaXNsYW5kLCB3aGljaCB0aGUgbWFwIHZpZXcgc2hvd2VkIGFzIHBhbGUgcml2ZXItc2hhcGVkXG4gIC8vIGJhcnMgcnVubmluZyB0byB0aGUgaG9yaXpvbi5cbiAgY29uc3QgcmQgPSByaXZlckRpc3RhbmNlKHd4LCB3eik7XG4gIGNvbnN0IHZhbGxleSA9IHNtb290aHN0ZXAoOTUsIDEwLCByZCkgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuICBjb25zdCB2YWxsZXlGbG9vciA9IDIuNSArIDEuMCAqIGZibTIod3ggLyA2MCwgd3ogLyA2MCwgc2VlZCArIDExNSwgMik7XG4gIGggPSBsZXJwKGgsIHZhbGxleUZsb29yLCB2YWxsZXkgKiAwLjc1KTtcbiAgY29uc3Qgcml2ZXJXID0gNS4wICsgMy4wICogZmJtMih3eCAvIDQ1LCB3eiAvIDQ1LCBzZWVkICsgMTE2LCAyKTtcbiAgLy8gQSB3aWRlLCBzaGFsbG93IGNoYW5uZWwgcHJvZmlsZS4gVGhlIGZpcnN0IHBhc3MgY2FydmVkIGEgMTIgbSBzbG90IHdpdGhcbiAgLy8gbmVhci12ZXJ0aWNhbCBiYW5rcywgd2hpY2ggcmVhZCBhcyBhIGJyaWdodCBzdG9uZSBxdWFycnkgcmF0aGVyIHRoYW4gYVxuICAvLyByaXZlci4gVGhlIG91dGVyIGVkZ2UgaXMgbm93IH4yNSBtIGZyb20gdGhlIGNlbnRyZWxpbmUsIGFuZCB0aGUgYmVkIGlzXG4gIC8vIG9ubHkgMiBtIGJlbG93IHNlYSBsZXZlbC5cbiAgY29uc3QgY2hhbm5lbCA9IHNtb290aHN0ZXAocml2ZXJXICsgMTgsIHJpdmVyVyAqIDAuNCwgcmQpO1xuICBpZiAobGFuZG5lc3MgPiAwLjApIGggPSBsZXJwKGgsIC0yLjAsIGNoYW5uZWwgKiAwLjk1KTtcblxuICAvLyBMYWtlIGJhc2luIGF0IHRoZSBmb290IG9mIHRoZSBub3J0aC13ZXN0IGhpZ2hsYW5kcy5cbiAgY29uc3QgbGFrZUQgPSBsYWtlRGlzdGFuY2Uod3gsIHd6KVxuICAgICogKDEgKyAwLjE4ICogKGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNywgMikgLSAwLjUpICogMik7XG4gIGlmIChsYWtlRCA8IDEuMTUpIHtcbiAgICBjb25zdCBsYWtlTWFzayA9IHNtb290aHN0ZXAoMS4xNSwgMC41NSwgbGFrZUQpO1xuICAgIGggPSBsZXJwKGgsIC02LjUsIGxha2VNYXNrICogMC45NSk7XG4gIH1cblxuICAvLyBGb3VuZGVyIHNoZWxmOiBhIHNtYWxsLCBpcnJlZ3VsYXIgYnVpbGRhYmxlIHRlcnJhY2Ugb24gdGhlIGVhc3QgYmFuay5cbiAgLy8gRGVsaWJlcmF0ZWx5IG5vdCBhIDI2MCBtIHJhZGlhbCBmbGF0dGVuOyB0aGUgcHJldmlvdXMgcGFzcyBzaG93ZWQgdGhhdCBhXG4gIC8vIGxhcmdlIGZsYXR0ZW4tdG8tY29uc3RhbnQgYmVjb21lcyBhIHZpc2libGUgYm93bCBvZiBjb250b3VyIHJpbmdzLlxuICBjb25zdCBzaGVsZkQgPSBNYXRoLnNxcnQoKCh4ICsgOCkgLyA2MikgKiogMiArICgoeiAtIDQpIC8gNDgpICoqIDIpXG4gICAgKyAoZmJtMih4IC8gNDUsIHogLyA0NSwgc2VlZCArIDExOCwgMikgLSAwLjUpICogMC41NTtcbiAgY29uc3Qgc2hlbGYgPSBzbW9vdGhzdGVwKDEuMDUsIDAuNTUsIHNoZWxmRCk7XG4gIGlmIChzaGVsZiA+IDApIHtcbiAgICBjb25zdCB0YXJnZXQgPSAxMy4wICsgMS4yICogZmJtMih4IC8gMzYsIHogLyAzNiwgc2VlZCArIDExOSwgMikgKyB4ICogMC4wMTtcbiAgICBoID0gbGVycChoLCB0YXJnZXQsIHNoZWxmICogMC43OCk7XG4gIH1cblxuICByZXR1cm4gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIDkyKSk7XG59XG5cbmZ1bmN0aW9uIHNsb3BlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4pOiBNYXRJZCB7XG4gIC8vIFJpdmVyIGJlZCBpcyBncmF2ZWw7IHRoZSBiZWFjaCBpcyBhIG5hcnJvdyBzYW5kIGJhbmQsIG5vdCB0aGUgd2hvbGVcbiAgLy8gdmFsbGV5IGZsb29yLiBUaGUgZmlyc3QgcGFzcyBtYXJrZWQgZXZlcnkgY2VsbCB3aXRoaW4gNCBtIG9mIHNlYSBsZXZlbFxuICAvLyBhcyBzYW5kLCB3aGljaCBwcm9kdWNlZCBhIGNvbnNwaWN1b3VzIHBhbGUgc3RyaXAgYWxvbmcgdGhlIHJpdmVyLlxuICBpZiAocml2ZXJEaXN0YW5jZSh4LCB6KSA8IDEyICYmIGggPCBTRUFfTEVWRUwgKyAxKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgaWYgKGggPD0gU0VBX0xFVkVMICsgMC41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChuZWFyV2F0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgIG5lYXJXYXRlciA9XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMykgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDMpIDwgU0VBX0xFVkVMICsgMTtcbiAgfVxuICBpZiAobmVhcldhdGVyICYmIGggPD0gU0VBX0xFVkVMICsgMS41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChzbG9wZSA+PSAzKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDU4ICYmIGZibTIoeCAvIDE4LCB6IC8gMTgsIHNlZWQgKyAxMjAsIDIpID4gMC40NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0OCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQwICYmIHNsb3BlID49IDIgJiYgZmJtMih4IC8gMTIsIHogLyAxMiwgc2VlZCArIDEyMSwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNUT05FO1xuICByZXR1cm4gTUFULkdSQVNTO1xuXG59XG5cbi8qKiBQdWJsaWMgYmFzZS1tYXRlcmlhbCBzZWxlY3RvciBmb3IgbWFjcm8gTE9EIGFuZCB0ZXN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWwoXG4gIHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyOiBib29sZWFuLFxuKTogTWF0SWQge1xuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZnVuY3Rpb24gc3Vic29pbEZvcih0b3A6IE1hdElkKTogTWF0SWQge1xuICBpZiAodG9wID09PSBNQVQuR1JBU1MgfHwgdG9wID09PSBNQVQuTU9TUykgcmV0dXJuIE1BVC5TT0lMO1xuICBpZiAodG9wID09PSBNQVQuU05PVykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVZFTCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIHJldHVybiBNQVQuU1RPTkU7XG59XG5cbmZ1bmN0aW9uIG9yZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBjbHVzdGVyID0gZmJtMih4IC8gNTUsIHogLyA1NSwgc2VlZCArIDEzMCwgMik7XG4gIGlmIChjbHVzdGVyIDwgMC41NykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBuID0gdmFsdWVOb2lzZTMoeCAqIDAuMDksIHkgKiAwLjEzLCB6ICogMC4wOSwgc2VlZCArIDEzMSk7XG4gIGNvbnN0IG4yID0gdmFsdWVOb2lzZTMoeCAqIDAuMjIgKyA1LCB5ICogMC4zMSwgeiAqIDAuMjIgLSAzLCBzZWVkICsgMTMyKTtcbiAgcmV0dXJuIG4gPiAwLjcwICYmIG4yID4gMC41MDtcbn1cblxuZnVuY3Rpb24gY2F2ZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gZmJtMyh4ICogMC4wNzUsIHkgKiAwLjExLCB6ICogMC4wNzUsIHNlZWQgKyAxNDAsIDIpID4gMC43Mjtcbn1cblxuZnVuY3Rpb24gb3ZlcmhhbmdBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHZhbHVlTm9pc2UzKHggKiAwLjE4LCB5ICogMC4yMiwgeiAqIDAuMTgsIHNlZWQgKyAxNDEpID4gMC42Mjtcbn1cblxuLy8gLS0tLS0tLS0tLSB2ZXJzaW9uZWQgZ2VuZXJhdG9yIGRpc3BhdGNoIC0tLS0tLS0tLS1cbmNvbnN0IHYyQ2FjaGUgPSBuZXcgTWFwPG51bWJlciwgVGVycmFpblYyPigpO1xuY29uc3QgaHlkcm9DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBIeWRyb2xvZ3k+KCk7XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9neSBuZXR3b3JrIGZvciBhIHNlZWQgYW5kIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGh5ZHJvbG9neUZvcihzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlcik6IEh5ZHJvbG9neSB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikgcmV0dXJuIHRlcnJhaW5WMihzZWVkKS5oeWRyb2xvZ3k7XG4gIGNvbnN0IGtleSA9IGAke3NlZWR9OiR7dmVyc2lvbn1gO1xuICBsZXQgaHlkcm8gPSBoeWRyb0NhY2hlLmdldChrZXkpO1xuICBpZiAoIWh5ZHJvKSB7XG4gICAgaHlkcm8gPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbiwgdjFIZWlnaHQ6ICh4LCB6KSA9PiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeikgfSk7XG4gICAgaHlkcm9DYWNoZS5zZXQoa2V5LCBoeWRybyk7XG4gIH1cbiAgcmV0dXJuIGh5ZHJvO1xufVxuXG4vKiogQGludGVybmFsIFRoZSB2MiBnZW5lcmF0b3IgZm9yIGEgc2VlZCAoY2FjaGVkOyBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZXJyYWluVjIoc2VlZDogbnVtYmVyKTogVGVycmFpblYyIHtcbiAgbGV0IGdlbiA9IHYyQ2FjaGUuZ2V0KHNlZWQpO1xuICBpZiAoIWdlbikge1xuICAgIGNvbnN0IGh5ZHJvbG9neSA9IG5ldyBIeWRyb2xvZ3koeyBzZWVkLCB2ZXJzaW9uOiBHRU5FUkFUT1JfVjIsIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGdlbiA9IG5ldyBUZXJyYWluVjIoc2VlZCwgc3VyZmFjZUhlaWdodEF0LCBoeWRyb2xvZ3kpO1xuICAgIHYyQ2FjaGUuc2V0KHNlZWQsIGdlbik7XG4gIH1cbiAgcmV0dXJuIGdlbjtcbn1cblxuLyoqIEJhc2UgZ2VuZXJhdGVkIGhlaWdodCAodG9wIHNvbGlkICsgMSkgZm9yIGFueSBzdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMiA/IHRlcnJhaW5WMihzZWVkKS5oZWlnaHQoeCwgeikgOiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCB3YXRlciBzdXJmYWNlOiB3YXRlciBmaWxscyBjZWxscyBbaGVpZ2h0LCBsZXZlbCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVdhdGVyTGV2ZWxBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuY29sdW1uKHgsIHopLmxldmVsO1xuICBjb25zdCBoID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCA6IGg7XG59XG5cbmZ1bmN0aW9uIHZlcnNpb25lZFNsb3BlKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuLyoqIEJhc2UgdG9wIG1hdGVyaWFsIGZvciBhbnkgZ2VuZXJhdG9yIHZlcnNpb24gKG1hY3JvIExPRCwgZW50aXR5IHBsYWNlbWVudCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsRm9yKFxuICBzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgZ2VuID0gdGVycmFpblYyKHNlZWQpO1xuICAgIHJldHVybiBnZW4udG9wTWF0ZXJpYWwoeCwgeiwgZ2VuLmNvbHVtbih4LCB6KSwgc2xvcGUsXG4gICAgICAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGhoLCBzcywgbmVhcldhdGVyKSk7XG4gIH1cbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VyZmFjZVNhbXBsZSB7XG4gIHk6IG51bWJlcjtcbiAgdG9wOiBNYXRJZDtcbiAgc2xvcGU6IG51bWJlcjtcbn1cblxuLyoqIEJhc2Ugc3VyZmFjZSBzYW1wbGUgZm9yIG1hY3JvIExPRC4gRG9lcyBub3QgaW5jbHVkZSB2b3hlbCBlZGl0cy9vdmVyaGFuZ3MuICovXG5leHBvcnQgZnVuY3Rpb24gc2FtcGxlU3VyZmFjZShzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogU3VyZmFjZVNhbXBsZSB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIGNvbnN0IHNsb3BlID0gc2xvcGVBdChzZWVkLCB4LCB6LCB5KTtcbiAgcmV0dXJuIHsgeSwgdG9wOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIHksIHNsb3BlKSwgc2xvcGUgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBjaHVuayBnZW5lcmF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIHJldHVybiBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG5cbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KENIVU5LX1ZPTFVNRSk7XG4gIGNvbnN0IGhlaWdodHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3QgdG9wTWF0ZXJpYWxzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBjb25zdCBzZWVkID0gd29ybGQuc2VlZDtcbiAgY29uc3QgdjIgPSB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkgOiBudWxsO1xuXG4gIC8vIFBhZGRlZCBoZWlnaHQgY2FjaGU6IGEgdGhyZWUtY2VsbCBib3JkZXIgY292ZXJzIHNsb3BlLCBiZWFjaCBhbmQgbGVkZ2VzLlxuICBjb25zdCBQID0gMztcbiAgY29uc3QgUFcgPSBDSFVOS19TSVpFICsgUCAqIDI7XG4gIGNvbnN0IGJhc2VIID0gbmV3IEludDE2QXJyYXkoUFcgKiBQVyk7XG4gIGNvbnN0IHYyQ29sczogVjJDb2x1bW5bXSB8IG51bGwgPSB2MiA/IG5ldyBBcnJheShDSFVOS19BUkVBKSA6IG51bGw7XG4gIGZvciAobGV0IHB6ID0gMDsgcHogPCBQVzsgcHorKykge1xuICAgIGZvciAobGV0IHB4ID0gMDsgcHggPCBQVzsgcHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIHB4IC0gUCwgd3ogPSBveiArIHB6IC0gUDtcbiAgICAgIGlmICh2Mikge1xuICAgICAgICBjb25zdCBjb2wgPSB2Mi5jb2x1bW4od3gsIHd6KTtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IGNvbC5oO1xuICAgICAgICBjb25zdCBseCA9IHB4IC0gUCwgbHogPSBweiAtIFA7XG4gICAgICAgIGlmIChseCA+PSAwICYmIGx6ID49IDAgJiYgbHggPCBDSFVOS19TSVpFICYmIGx6IDwgQ0hVTktfU0laRSkgdjJDb2xzIVtseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjb2w7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHd4LCB3eik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgbGV0IG5vbkFpciA9IDA7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5lYXJXYXRlciA9XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCAtIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgKyAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMTtcbiAgICAgIGNvbnN0IHYyQ29sID0gdjJDb2xzID8gdjJDb2xzW2x6ICogQ0hVTktfU0laRSArIGx4XSA6IG51bGw7XG4gICAgICBjb25zdCB0b3AgPSB2MiAmJiB2MkNvbFxuICAgICAgICA/IHYyLnRvcE1hdGVyaWFsKHd4LCB3eiwgdjJDb2wsIHNsb3BlLCAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaGgsIHNzLCBuZWFyV2F0ZXIpKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICAgIGNvbnN0IHN1YiA9IHN1YnNvaWxGb3IodG9wKTtcbiAgICAgIGNvbnN0IG9yZVBvdGVudGlhbCA9IGZibTIod3ggLyA1NSwgd3ogLyA1NSwgc2VlZCArIDEzMCwgMikgPiAwLjU3O1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG5cbiAgICAgIGNvbnN0IHN0YXJ0ID0gWV9NSU47XG4gICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihZX01BWCAtIDEsIGggLSAxKTtcbiAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8PSBlbmQ7IHkrKykge1xuICAgICAgICBjb25zdCBkZXB0aCA9IGggLSAxIC0geTtcbiAgICAgICAgbGV0IG06IE1hdElkO1xuICAgICAgICBpZiAoeSA9PT0gWV9NSU4pIG0gPSBNQVQuQkVEUk9DSztcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPT09IDApIG0gPSB0b3A7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoIDw9IDIpIG0gPSBzdWI7XG4gICAgICAgIGVsc2UgbSA9IE1BVC5TVE9ORTtcblxuICAgICAgICBpZiAobSA9PT0gTUFULlNUT05FICYmIGRlcHRoID4gNCAmJiBvcmVQb3RlbnRpYWwgJiYgb3JlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuT1JFO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3BhcnNlIDNEIG92ZXJoYW5ncy91bmRlcmN1dHMgYXQgc3RlZXAgZmFjZXMuIFRoaXMgaXMgYSByZWFsXG4gICAgICAgIC8vIG9jY3VwYW5jeSBjaGFuZ2UsIG5vdCBhIGRlY29yYXRpb24gb24gdG9wIG9mIGEgaGVpZ2h0ZmllbGQuXG4gICAgICAgIGlmIChkZXB0aCA8PSAyICYmIHNsb3BlID49IDIgJiYgb3ZlcmhhbmdBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVlcCBjYXZlcywga2VwdCBhd2F5IGZyb20gdGhlIHN1cmZhY2Ugc28gdGhleSBkbyBub3QgY3JlYXRlIGhvbGVzLlxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUiAmJiBkZXB0aCA+IDcgJiYgZGVwdGggPCAyNCAmJiBjYXZlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildID0gbTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBXYXRlciB2b2x1bWU6IGV2ZXJ5dGhpbmcgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UgdXAgdG8gdGhlIGNvbHVtbidzXG4gICAgICAvLyB3YXRlciBsZXZlbCAoc2VhIGxldmVsIGluIHYxOyB0aGUgaHlkcm9sb2dpY2FsIGxldmVsIGluIHYyKS5cbiAgICAgIGNvbnN0IHdhdGVyTGV2ZWwgPSB2MkNvbCA/IE1hdGgubWluKFlfTUFYLCB2MkNvbC5sZXZlbCkgOiBTRUFfTEVWRUw7XG4gICAgICBpZiAoaCA8IHdhdGVyTGV2ZWwpIHtcbiAgICAgICAgZm9yIChsZXQgeSA9IE1hdGgubWF4KFlfTUlOLCBoKTsgeSA8IHdhdGVyTGV2ZWw7IHkrKykge1xuICAgICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseik7XG4gICAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgICAgZGF0YVtpZHhdID0gTUFULldBVEVSO1xuICAgICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvcFNvbGlkID0gTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLm1heChZX01JTiwgaCAtIDEpKTtcbiAgICAgIGhlaWdodHNbY29sXSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2NvbF0gPSB0b3A7XG4gICAgfVxuICB9XG5cbiAgLy8gUHJvdHJ1ZGluZyBsZWRnZXM6IG9uZSBvciB0d28gc3RvbmUgYmxvY2tzIGV4dGVuZCBmcm9tIGEgaGlnaCBjb2x1bW4gb3ZlclxuICAvLyBhIGxvd2VyIG5laWdoYm91ci4gVGhleSBjcmVhdGUgcmVhZGFibGUgb3ZlcmhhbmdzIHdpdGhvdXQgYSBmdWxsIGNhdmUgcGFzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGlmIChzbG9wZSA8IDIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZGlyczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBkaXJzKSB7XG4gICAgICAgIGNvbnN0IG54ID0gbHggKyBkeCwgbnogPSBseiArIGR6O1xuICAgICAgICBpZiAobnggPCAwIHx8IG56IDwgMCB8fCBueCA+PSBDSFVOS19TSVpFIHx8IG56ID49IENIVU5LX1NJWkUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBuaCA9IGJhc2VIWyhueiArIFApICogUFcgKyAobnggKyBQKV07XG4gICAgICAgIGlmIChoIC0gbmggPCAyKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGhhc2gzaShseCwgbHosIGR4ICogMyArIGR6ICogNywgc2VlZCArIDE1MCkgPCAwLjU1KSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgeSA9IGggLSAyO1xuICAgICAgICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gaCkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobngsIHlUb0luZGV4KHkpLCBueik7XG4gICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuU1RPTkU7XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZWNvbXB1dGUgdGhlIGNvbHVtbiBjYWNoZSBhZnRlciBsZWRnZXMvY2F2ZXMuIFRoZSBleHBvc2VkIHRvcCBtYXRlcmlhbFxuICAvLyBtdXN0IGNvbWUgZnJvbSB0aGUgYWN0dWFsIHRvcCBzb2xpZCB2b3hlbCwgbm90IHRoZSBwcmUtY2FydmUgZ3Vlc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgbGV0IHRvcE1hdDogbnVtYmVyID0gdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICBjb25zdCBtID0gZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgfVxuICAgICAgaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0b3BNYXQ7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY2h1bms6IFZveGVsQ2h1bmsgPSB7XG4gICAgY3gsIGN6LCBrZXksIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyLFxuICAgIGRpcnR5OiB0cnVlLFxuICAgIGdlbmVyYXRlZEF0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgfTtcblxuICAvLyBBcHBseSBkdXJhYmxlIGVkaXRzIGFmdGVyIGJhc2UgZ2VuZXJhdGlvbi5cbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgaWYgKGVkaXRzKSB7XG4gICAgZm9yIChjb25zdCBbaWR4LCBtXSBvZiBlZGl0cykge1xuICAgICAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgICB9XG4gICAgLy8gUmVjb21wdXRlIHRoZSBjYWNoZSBmb3IgZWRpdGVkIGNodW5rcy5cbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCBseCwgbHopO1xuICAgIH1cbiAgfVxuICAvLyBOb24tYWlyIGNvdW50cyBhcmUgZGVyaXZlZCByZW5kZXJlciBzdGF0aXN0aWNzLCBub3QgZHVyYWJsZSB3b3JsZCBzdGF0ZS5cbiAgLy8gRWRpdGVkIGJhc2UgYWlyIG1heSBiZWNvbWUgc29saWQgKGFuZCB2aWNlIHZlcnNhKSBkdXJpbmcgcmVzdG9yYXRpb24uXG4gIGxldCBlZGl0ZWROb25BaXIgPSAwO1xuICBmb3IgKGNvbnN0IG1hdGVyaWFsIG9mIGNodW5rLmRhdGEpIGlmIChtYXRlcmlhbCAhPT0gTUFULkFJUikgZWRpdGVkTm9uQWlyKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBlZGl0ZWROb25BaXIgLSBub25BaXI7XG5cbiAgd29ybGQuY2h1bmtzLnNldChrZXksIGNodW5rKTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBub25BaXI7XG4gIHdvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyArPSBwZXJmb3JtYW5jZS5ub3coKSAtIHQwO1xuICB3b3JsZC5kaXJ0eS5hZGQoa2V5KTtcblxuICBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkLCBjaHVuayk7XG4gIHJldHVybiBjaHVuaztcbn1cblxuLyoqIEEgYmFzZS10ZXJyYWluIGNhY2hlIHNoYXJlZCBieSBlZGl0ZWQgYW5kIHVuZWRpdGVkIHJlZ2VuZXJhdGlvbi4gTmF0dXJhbFxuICogc2NlbmVyeSBuZXZlciBkZXBlbmRzIG9uIGxhdGVyIHZveGVsIGVkaXRzOyB0aGlzIGFsc28gbGV0cyBhIHNuYXBzaG90IHJlc3RvcmVcbiAqIGEgaGFydmVzdGVkIGNodW5rIHdpdGhvdXQgbWF0ZXJpYWxpemluZyB1bnJlbGF0ZWQgbmVpZ2hib3VyaW5nIGNodW5rcy4gKi9cbmNvbnN0IGJhc2VDb2x1bW5DYWNoZSA9IG5ldyBXZWFrTWFwPFdvcmxkLCBNYXA8c3RyaW5nLCB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheSB9Pj4oKTtcblxuZnVuY3Rpb24gYmFzZUNvbHVtbnMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0ge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlLmdldChjaHVuay5rZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBjb2x1bW5zID0geyBoZWlnaHRzOiBuZXcgVWludDhBcnJheShjaHVuay5oZWlnaHRzKSwgdG9wTWF0ZXJpYWxzOiBuZXcgVWludDhBcnJheShjaHVuay50b3BNYXRlcmlhbHMpIH07XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpICsgbHgsIHogPSBjaHVua09yaWdpblooY2h1bmsuY3opICsgbHo7XG4gICAgICBjb25zdCB2ZXJzaW9uID0gd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb247XG4gICAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHdvcmxkLnNlZWQsIHZlcnNpb24sIHgsIHopO1xuICAgICAgY29uc3Qgc2xvcGUgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IHZlcnNpb25lZFNsb3BlKHdvcmxkLnNlZWQsIHZlcnNpb24sIHgsIHosIGgpIDogc2xvcGVBdCh3b3JsZC5zZWVkLCB4LCB6LCBoKTtcbiAgICAgIGNvbnN0IGluZGV4ID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLmhlaWdodHNbaW5kZXhdID0gY2xhbXAoaCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2luZGV4XSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gYmFzZVRvcE1hdGVyaWFsRm9yKHdvcmxkLnNlZWQsIHZlcnNpb24sIHgsIHosIGgsIHNsb3BlKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQod29ybGQuc2VlZCwgeCwgeiwgaCwgc2xvcGUpO1xuICAgIH1cbiAgfVxuICBjYWNoZS5zZXQoY2h1bmsua2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVyaXZlZCBjaGFuZ2UgdHJhY2tpbmcgKG5vdCBhdXRob3JpdGF0aXZlIHN0YXRlKSAtLS0tLS0tLS0tXG4vLyBSZW5kZXJlcnMgbmVlZCB0byBrbm93IHdoZW4gdGhlIGVkaXQgb3ZlcmxheSBjaGFuZ2VkIHdpdGhvdXQgd2Fsa2luZyBldmVyeVxuLy8gZWRpdCBlYWNoIGZyYW1lLiBUaGUgY291bnRlciBsaXZlcyBvdXRzaWRlIFdvcmxkIHNvIGl0IG5ldmVyIGVudGVycyBhXG4vLyBzbmFwc2hvdCBvciBjYW5vbmljYWwgaGFzaC5cbmNvbnN0IGVkaXRWZXJzaW9ucyA9IG5ldyBXZWFrTWFwPFdvcmxkLCBudW1iZXI+KCk7XG5cbi8qKiBNb25vdG9uaWMgY291bnQgb2YgZWRpdC1vdmVybGF5IGNoYW5nZXMgZm9yIHRoaXMgV29ybGQgb2JqZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVkaXRWZXJzaW9uKHdvcmxkOiBXb3JsZCk6IG51bWJlciB7XG4gIHJldHVybiBlZGl0VmVyc2lvbnMuZ2V0KHdvcmxkKSA/PyAwO1xufVxuXG4vKiogQ2FsbCBhZnRlciByZXBsYWNpbmcgb3IgYnVsay1jaGFuZ2luZyBgd29ybGQuZWRpdHNgIG91dHNpZGUgc2V0Vm94ZWwuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya0VkaXRzQ2hhbmdlZCh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZWRpdFZlcnNpb25zLnNldCh3b3JsZCwgZWRpdFZlcnNpb24od29ybGQpICsgMSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gbm9uLWdlbmVyYXRpbmcgcXVlcmllcyAtLS0tLS0tLS0tXG4vLyBNb3ZpbmcgcHJlc2VudGF0aW9uIChjaGFyYWN0ZXJzLCBhbmltYWxzLCBjYW1lcmEpIG11c3QgbmV2ZXIgdHJpZ2dlciBjaHVua1xuLy8gZ2VuZXJhdGlvbiBhcyBhIHNpZGUgZWZmZWN0IG9mIGFza2luZyBhYm91dCB0ZXJyYWluLiBUaGVzZSByZXR1cm4gbnVsbCB3aGVuXG4vLyB0aGUgY29sdW1uJ3MgY2h1bmsgaXMgbm90IHJlc2lkZW50LlxuXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRDaHVua0F0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBudWxsO1xuICByZXR1cm4gd29ybGQuY2h1bmtzLmdldChjaHVua0tleSh3b3JsZFRvQ2h1bmtYKHgpLCB3b3JsZFRvQ2h1bmtaKHopKSkgPz8gbnVsbDtcbn1cblxuLyoqIExpa2Ugc3VyZmFjZUF0LCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50U3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgfCBudWxsIHtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuLyoqIExpa2UgZ2V0Vm94ZWwsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRWb3hlbEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHwgbnVsbCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmljdENodW5rKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCF3b3JsZC5jaHVua3MuaGFzKGtleSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuY2h1bmtzLmRlbGV0ZShrZXkpO1xuICB3b3JsZC5zdGF0cy5jaHVua3NFdmljdGVkKys7XG4gIC8vIENodW5rIGJ5dGVzIGFuZCBjb2x1bW4gY2FjaGVzIGFyZSByZWdlbmVyYXRlZCBvbiBkZW1hbmQuIEVudGl0aWVzIHJlbWFpblxuICAvLyBhdXRob3JpdGF0aXZlOiBldmljdGlvbiBtdXN0IG5vdCBmb3JnZXQgdGhlaXIgcGVyc2lzdGVudCBzdGF0ZS5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcXVlcmllcyAvIGVkaXRzIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBnZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG06IE1hdElkKTogYm9vbGVhbiB7XG4gIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBZX01BWCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBpZHggPSBsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgY29uc3QgcHJldmlvdXNFZGl0ID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rS2V5KGN4LCBjeikpPy5nZXQoaWR4KTtcbiAgLy8gQSBjaHVuayBldmljdGVkIGFmdGVyIGFuIGVhcmxpZXIgZWRpdCBjYW4gcmVnZW5lcmF0ZSB3aXRoIHRoYXQgZHVyYWJsZVxuICAvLyBtYXRlcmlhbCBhbHJlYWR5IGFwcGxpZWQuIERyb3BwaW5nIHRoZSBlZGl0IGhlcmUgd291bGQgbWFrZSBpdCBkaXNhcHBlYXJcbiAgLy8gb24gdGhlIG5leHQgZXZpY3Rpb24vcmVzdG9yYXRpb24sIGV2ZW4gdGhvdWdoIHRoZSBjdXJyZW50IHdyaXRlIG5vLW9wcy5cbiAgaWYgKHByZXZpb3VzRWRpdCA9PT0gbSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gZmFsc2U7XG4gIGxldCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChjaHVuay5rZXkpO1xuICBpZiAoIWVkaXRzKSB7IGVkaXRzID0gbmV3IE1hcCgpOyB3b3JsZC5lZGl0cy5zZXQoY2h1bmsua2V5LCBlZGl0cyk7IH1cbiAgLy8gQW4gaWRlbXBvdGVudCB3cml0ZSBtdXN0IHN0aWxsIHJlc3RvcmUgYSBkdXJhYmxlIGRlbHRhIGRpc2NhcmRlZCBieSBhblxuICAvLyBvbGRlciBzbmFwc2hvdCBvciBkZWx0YSBkZWNvZGVyLiBJdCBpcyBub3QgYSBuZXcgYXV0aG9yaXRhdGl2ZSByZXZpc2lvbi5cbiAgaWYgKGNodW5rLmRhdGFbaWR4XSA9PT0gbSkge1xuICAgIGlmICghZWRpdHMuaGFzKGlkeCkpIGVkaXRzLnNldChpZHgsIG0pO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgbWFya0VkaXRzQ2hhbmdlZCh3b3JsZCk7XG4gIGNodW5rLmRpcnR5ID0gdHJ1ZTtcbiAgd29ybGQuZGlydHkuYWRkKGNodW5rLmtleSk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCB3b3JsZFRvTG9jYWxYKHgpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rOiBWb3hlbENodW5rLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogdm9pZCB7XG4gIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICBpZiAoaXNTb2xpZChjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildKSkgeyB0b3BTb2xpZCA9IHk7IGJyZWFrOyB9XG4gIH1cbiAgY2h1bmsuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgY29uc3QgdG0gPSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICBpZiAodG9wU29saWQgPj0gWV9NSU4pIHtcbiAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh0b3BTb2xpZCksIGx6KV07XG4gICAgaWYgKG0gIT09IE1BVC5XQVRFUikgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IG07XG4gIH0gZWxzZSB7XG4gICAgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRtO1xuICB9XG59XG5cbi8qKlxuICogVGhlIHkgY29vcmRpbmF0ZSBvZiB0aGUgZXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uIGF0IHgvei5cbiAqIEEgc29saWQgdm94ZWwgYXQgeSBvY2N1cGllcyBbeSwgeSsxKSwgc28gdGhlIHdhbGthYmxlIHN1cmZhY2UgaXMgdG9wU29saWQrMS5cbiAqIFRoaXMgaXMgYSBkZXJpdmVkIHF1ZXJ5OyB0aGUgYXV0aG9yaXRhdGl2ZSBzdGF0ZSByZW1haW5zIHRoZSB2b3hlbCB2b2x1bWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBZX01JTjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBZX01JTjtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsudG9wTWF0ZXJpYWxzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWlnaHRBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiA8IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGggPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICAgIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIC0gaCA6IDA7XG4gIH1cbiAgcmV0dXJuIHdhdGVyU3VyZmFjZUF0KHdvcmxkLCB4LCB6KSAtIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKlxuICogVG9wIG9mIHRoZSB3YXRlciBjb2x1bW4gc3RhbmRpbmcgb24gdGhlIHNvbGlkIHN1cmZhY2UgKGVxdWFsIHRvIHRoZSBzdXJmYWNlXG4gKiB3aGVuIGRyeSkuIFJlYWRzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVscywgc28gZWRpdHMgYW5kIGR1ZyBwaXRzIGFyZSBleGFjdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyU3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIHdoaWxlICh5IDwgWV9NQVggJiYgZ2V0Vm94ZWwod29ybGQsIHgsIHksIHopID09PSBNQVQuV0FURVIpIHkrKztcbiAgcmV0dXJuIHk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZW50aXRpZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gYWRkRW50aXR5KHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5oYXMoZS5pZCkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIHJldHVybjtcbiAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGUpO1xuICBsZXQgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgbGlzdCk7IH1cbiAgbGlzdC5wdXNoKGUuaWQpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIC8vIEdlbmVyYXRpb24gaXMgZGV0ZXJtaW5pc3RpYyBhbmQgYWR2YW5jZXMgbm8gcGxheWVyLWNvbW1hbmQgcHJlY29uZGl0aW9uLlxuICAvLyBBdXRob3JlZCBzY2FmZm9sZGluZyBtYXkgdHJhbnNpZW50bHkgY2hhbmdlIGl0OyB0aGUgc25hcHNob3QgcmVzdG9yZXMgdGhlXG4gIC8vIHNhdmVkIHJldmlzaW9uIGFmdGVyIHBsYWNpbmcgdGhhdCBzY2FmZm9sZGluZy5cbn1cblxuLyoqXG4gKiBSZW1vdmUgYW4gZW50aXR5IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd29ybGQuIFVzZWQgd2hlbiBhIHNpdGUgaXMgY2xlYXJlZDpcbiAqIHRoZSByZXNvdXJjZSB5aWVsZCBpcyBhY2NvdW50ZWQgZm9yIGJ5IHRoZSBjYWxsZXIsIGFuZCB0aGUgZW50aXR5IG11c3Qgc3RvcFxuICogZXhpc3RpbmcgZm9yIGNvbGxpc2lvbiwgb2JzdHJ1Y3Rpb24gYW5kIHBlcnNpc3RlbmNlLCBub3QganVzdCBiZSBoaWRkZW4gYnlcbiAqIHRoZSByZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICBjb25zdCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKGxpc3QpIHtcbiAgICBjb25zdCBpID0gbGlzdC5pbmRleE9mKGlkKTtcbiAgICBpZiAoaSA+PSAwKSBsaXN0LnNwbGljZShpLCAxKTtcbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChpZCk7XG4gIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUlkKGNodW5rOiBzdHJpbmcsIGk6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBgZToke2NodW5rfToke2l9YDtcbn1cblxuZnVuY3Rpb24gZm9yZXN0U2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgZWFzdCA9IE1hdGguZXhwKC0oKCh3eCAtIDIyMCkgLyAyNjApICoqIDIgKyAoKHd6ICsgMTEwKSAvIDIyMCkgKiogMikpO1xuICBjb25zdCBub3J0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDIwKSAvIDMwMCkgKiogMiArICgod3ogKyAzMDApIC8gMTkwKSAqKiAyKSk7XG4gIGNvbnN0IHdlc3QgPSBNYXRoLmV4cCgtKCgod3ggKyAzNDApIC8gMjAwKSAqKiAyICsgKCh3eiAtIDEyMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3Qgc291dGggPSBNYXRoLmV4cCgtKCgod3ggLSAxMjApIC8gMjQwKSAqKiAyICsgKCh3eiAtIDMzMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3QgbW9pc3R1cmUgPSBmYm0yKHd4IC8gMjYwLCB3eiAvIDI2MCwgc2VlZCArIDIwMSwgNCk7XG4gIGNvbnN0IHZhbGxleSA9IE1hdGguZXhwKC0oKHd4IC8gMTQwKSAqKiAyICsgKHd6IC8gMTA1KSAqKiAyKSk7XG4gIHJldHVybiBNYXRoLm1heChlYXN0LCBub3J0aCAqIDAuOTIsIHdlc3QgKiAwLjgwLCBzb3V0aCAqIDAuNzgpICogMC44MlxuICAgICsgbW9pc3R1cmUgKiAwLjM4IC0gMC4yMiAtIHZhbGxleSAqIDAuMzQ7XG59XG5cbmZ1bmN0aW9uIHJvY2tTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBtb3VudGFpbiA9IGZibTIod3ggLyAzMzAsIHd6IC8gMzMwLCBzZWVkICsgMjAyLCAzKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAxNDAsIHd6IC8gMTQwLCBzZWVkICsgMjAzLCAzKSAtIDEpO1xuICByZXR1cm4gbW91bnRhaW4gKiAwLjU1ICsgcmlkZ2UgKiAwLjQ1O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB2b2lkIHtcbiAgZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZCwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbn1cblxuLyoqIEBpbnRlcm5hbCBSZXBsYXlzIGRldGVybWluaXN0aWMgZ2VuZXJhdGlvbiBmb3Igc25hcHNob3QgZW50aXR5IGRlbHRhcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBpZiAod29ybGQuZW50aXR5Q2h1bmtzLmhhcyhrZXkpKSByZXR1cm47XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybjtcblxuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChoYXNoMmkoY2h1bmsuY3gsIGNodW5rLmN6LCB3b3JsZC5zZWVkICsgOTAwKSAqIDQyOTQ5NjcyOTYpID4+PiAwKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIGNvbnN0IGNvbHVtbnMgPSBiYXNlQ29sdW1ucyh3b3JsZCwgY2h1bmspO1xuICBsZXQgbiA9IDA7XG4gIGxldCBuYXR1cmFsVHJlZXMgPSAwO1xuICBsZXQgbmF0dXJhbFBpbmtUcmVlcyA9IDA7XG5cbiAgY29uc3QgbG9jYWxTdXJmYWNlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdICsgWV9NSU47XG4gIH07XG4gIGNvbnN0IGxvY2FsVG9wID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBNYXRJZCA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSBhcyBNYXRJZDtcbiAgfTtcbiAgY29uc3QgbG9jYWxTbG9wZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgcmV0dXJuIE1hdGgubWF4KFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggKyAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogKyAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICApO1xuICB9O1xuXG4gIC8vIEEgaml0dGVyZWQgOCBtIGxhdHRpY2UgZ2l2ZXMgY29oZXJlbnQgbWFzc2VzIGFuZCBhdm9pZHMgcGVyLWZyYW1lIHNjYXR0ZXIuXG4gIGZvciAobGV0IGd6ID0gMDsgZ3ogPCBDSFVOS19TSVpFOyBneiArPSA4KSB7XG4gICAgZm9yIChsZXQgZ3ggPSAwOyBneCA8IENIVU5LX1NJWkU7IGd4ICs9IDgpIHtcbiAgICAgIGNvbnN0IGx4ID0gY2xhbXAoTWF0aC5mbG9vcihneCArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IGx6ID0gY2xhbXAoTWF0aC5mbG9vcihneiArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgICAgaWYgKGggPD0gU0VBX0xFVkVMICsgMSkgY29udGludWU7XG4gICAgICBjb25zdCBzbG9wZSA9IGxvY2FsU2xvcGUobHgsIGx6KTtcbiAgICAgIGNvbnN0IHRvcCA9IGxvY2FsVG9wKGx4LCBseik7XG4gICAgICBpZiAodG9wID09PSBNQVQuV0FURVIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZm9yZXN0ID0gZm9yZXN0U2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvY2t5ID0gcm9ja1Njb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2xsID0gcm5kKCk7XG5cbiAgICAgIGNvbnN0IHRyZWVDaGFuY2UgPSBmb3Jlc3QgPiAwLjUwID8gMC43MiA6IGZvcmVzdCA+IDAuMzAgPyAwLjI1IDogMC4wNTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAyICYmIHJvbGwgPCB0cmVlQ2hhbmNlKSB7XG4gICAgICAgIC8vIFRoZSBjYXAgaXMgYSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZ2VuZXJhdGlvbiBwcm9wZXJ0eS4gSXQgY2Fubm90XG4gICAgICAgIC8vIGRlcGVuZCBvbiB3aGljaCBjaHVua3MgYSByZW5kZXJlciBsb2FkZWQgYmVmb3JlIHRoaXMgb25lLlxuICAgICAgICBsZXQga2luZDogRW50aXR5S2luZDtcbiAgICAgICAgbGV0IHZhcmlhbnQ6IG51bWJlcjtcbiAgICAgICAgY29uc3Qgc3BlY2llc1JvbGwgPSBybmQoKTtcbiAgICAgICAgaWYgKHNwZWNpZXNSb2xsIDwgMC4xMikge1xuICAgICAgICAgIGlmICgobmF0dXJhbFBpbmtUcmVlcyArIDEpID4gMC4yNSAqIChuYXR1cmFsVHJlZXMgKyAxKSkge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua092ZXJmbG93Kys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2Jsb3Nzb20nO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAyKTtcbiAgICAgICAgICAgIG5hdHVyYWxQaW5rVHJlZXMrKztcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNDApIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9zcGlyZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNzQpIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV90YWJsZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICB9XG4gICAgICAgIG5hdHVyYWxUcmVlcysrO1xuICAgICAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44OCArIHJuZCgpICogMC4yNCwgdmFyaWFudCxcbiAgICAgICAgICByZXNvdXJjZTogJ3dvb2QnLCByZW1haW5pbmc6IDEyLCB5aWVsZFBlckhhcnZlc3Q6IDQsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHJvY2t5ID4gMC40NiAmJiByb2xsIDwgMC4zOCkge1xuICAgICAgICAvLyBDb25zdW1lIHRoZSByZXRpcmVkIHN0b25lIGZvcm0ncyByYW5kb20gZHJhd3MgYW5kIGFsbG9jYXRlIGl0cyBvbGRcbiAgICAgICAgLy8gc2VxdWVuY2UgSUQsIGJ1dCBkbyBub3QgaW5zZXJ0IGFuIGVudGl0eS4gTGF0ZXIgbmF0dXJhbCBwbGFjZW1lbnRzXG4gICAgICAgIC8vIHRoZXJlZm9yZSByZW1haW4gYnl0ZS1mb3ItYnl0ZSBjb21wYXRpYmxlIHdpdGggcmVjb3JkZWQgc2F2ZXMuXG4gICAgICAgIGNvbnN0IHNpemVSb2xsID0gcm5kKCk7XG4gICAgICAgIGNvbnN0IGtpbmQ6IEVudGl0eUtpbmQgPSBzaXplUm9sbCA8IDAuNTUgPyAnc3R5bF9yb2NrX3NtYWxsJ1xuICAgICAgICAgIDogc2l6ZVJvbGwgPCAwLjkwID8gJ3N0eWxfcm9ja19tZWRpdW0nIDogJ3N0eWxfcm9ja19sYXJnZSc7XG4gICAgICAgIGNvbnN0IGlkID0gZW50aXR5SWQoY2h1bmsua2V5LCBuKyspO1xuICAgICAgICBjb25zdCByZWNvcmQgPSB7XG4gICAgICAgICAgaWQsIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByZXNvdXJjZTogJ3N0b25lJyBhcyBjb25zdCxcbiAgICAgICAgICByZW1haW5pbmc6IGtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gNCA6IGtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDggOiAxMixcbiAgICAgICAgICB5aWVsZFBlckhhcnZlc3Q6IDMsIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgIH07XG4gICAgICAgIC8vIE9ubHkgZW50aXRpZXMgdGhhdCBleGlzdGVkIGluIGFuIGFjY2VwdGVkIG9sZCBzYXZlIGdldCB0b21ic3RvbmVzLFxuICAgICAgICAvLyBkdXJpbmcgZXhwbGljaXQgbWlncmF0aW9uLiBPcmRpbmFyeSBnZW5lcmF0aW9uIG11c3QgcmVzdG9yZSBleGFjdGx5LlxuICAgICAgICBpZiAoaXNTdG9uZVJlcGxheSh3b3JsZCkpIGFkZEVudGl0eSh3b3JsZCwgcmVjb3JkKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuU1RPTkUgJiYgcm9ja3kgPiAwLjU4ICYmIHJvbGwgPCAwLjE4KSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfb3JlJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDIpLFxuICAgICAgICAgIHJlc291cmNlOiAnb3JlJywgcmVtYWluaW5nOiA4LCB5aWVsZFBlckhhcnZlc3Q6IDIsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDEgJiYgcm9sbCA8IDAuMzApIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9zaHJ1YicsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44ICsgcm5kKCkgKiAwLjQsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgICByZXNvdXJjZTogJ2ZpYmVyJywgcmVtYWluaW5nOiA0LCB5aWVsZFBlckhhcnZlc3Q6IDEsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkOiBXb3JsZCwga2luZDogRW50aXR5S2luZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgcm90OiBudW1iZXIsIHNjYWxlOiBudW1iZXIsIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsLCByZW1haW5pbmc6IG51bWJlciwgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmICh5IDw9IFNFQV9MRVZFTCkgcmV0dXJuO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgLy8gQSBoZXJvIGFzc2V0IG93bnMgaXRzIHNwb3Q6IGNsZWFyIGFueSBnZW5lcmF0ZWQgZW50aXR5IHRoYXQgd291bGQgb3ZlcmxhcFxuICAvLyBpdCwgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBpbmcgdGhlIGF1dGhvcmVkIGNvbXBvc2l0aW9uLlxuICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkgPz8gW107XG4gIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoa2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSByZXR1cm47XG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKGUgJiYgTWF0aC5oeXBvdChlLnggLSB4LCBlLnogLSB6KSA8IDIuNikge1xuICAgICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICAgIH1cbiAgfVxuICB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpKTtcbiAgLy8gQXV0aG9yZWQgY29tcG9zaXRpb24gaXMgZHVyYWJsZSBzdGF0ZTogaXQgY2FuIGNsZWFyIG92ZXJsYXBwaW5nIG5hdHVyYWxcbiAgLy8gZW50aXRpZXMsIHNvIHNhdmUgdGhlIGNvbXBsZXRlIGFmZmVjdGVkIGNodW5rIHJhdGhlciB0aGFuIG9ubHkgaXRzIGhlcm9lcy5cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcblxuICBjb25zdCBpZCA9IGBoZXJvOiR7a2luZH06JHtNYXRoLnJvdW5kKHgpfToke01hdGgucm91bmQoeil9YDtcbiAgY29uc3QgYmVmb3JlID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgY29uc3QgZW50aXR5OiBFbnRpdHkgPSB7XG4gICAgaWQsIGtpbmQsIGNodW5rOiBrZXksIHg6IHggKyAwLjUsIHksIHo6IHogKyAwLjUsXG4gICAgcm90LCBzY2FsZSwgdmFyaWFudCwgcmVzb3VyY2UsIHJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0LFxuICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogdHJ1ZSxcbiAgfTtcbiAgYWRkRW50aXR5KHdvcmxkLCBlbnRpdHkpO1xuICBpZiAod29ybGQuZW50aXRpZXMuc2l6ZSA+IGJlZm9yZSAmJiBraW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB7XG4gICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoa2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmF1dGhvcmVkUGxhY2VkKSByZXR1cm47XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gdHJ1ZTtcblxuICBjb25zdCBzaXRlczogQXJyYXk8eyBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7IHg6IG51bWJlcjsgejogbnVtYmVyOyByb3Q6IG51bWJlciB9PiA9IFtcbiAgICB7IGtpbmQ6ICd3YXlzdG9uZScsIHg6IC0xMCwgejogLTE0LCByb3Q6IDAgfSxcbiAgICB7IGtpbmQ6ICdtYXJrZXInLCB4OiAtMzIsIHo6IC04LCByb3Q6IE1hdGguUEkgLyAyIH0sXG4gIF07XG4gIGZvciAoY29uc3QgcyBvZiBzaXRlcykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoeSA8PSBTRUFfTEVWRUwpIGNvbnRpbnVlO1xuICAgIHdvcmxkLnNpdGVzLnB1c2goe1xuICAgICAgaWQ6IGBzaXRlOiR7cy5raW5kfWAsXG4gICAgICBraW5kOiBzLmtpbmQsXG4gICAgICB4OiBzLnggKyAwLjUsIHksIHo6IHMueiArIDAuNSxcbiAgICAgIHJvdDogcy5yb3QsXG4gICAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEEgaGVybyBncm92ZSBjb21wb3NlZCBpbiB0aGUgZGVmYXVsdCBjYW1lcmEncyB2aWV3IGRpcmVjdGlvbi4gVGhlc2UgYXJlXG4gIC8vIFN0eWwgbmF0dXJhbCBhc3NldHMgKEFTLTAwMSB2MiksIG5vdCBOb3hlbCBhcmNoaXRlY3R1cmU7IHRoZSBOb3hlbFxuICAvLyB3YXlzdG9uZS9tYXJrZXIgYWJvdmUgcmVtYWluIHRoZSBodW1hbi1tYWRlIGxhbmRtYXJrcy5cbiAgY29uc3QgZ3JvdmU6IEFycmF5PFtFbnRpdHlLaW5kLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0+ID0gW1xuICAgIFsnc3R5bF90cmVlX3NwaXJlJywgLTIyLCAtMjYsIDAsIDEuMDAsIDBdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTM0LCAtMTgsIDEsIDAuOTUsIE1hdGguUEkgLyAxMl0sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xNiwgLTM0LCAyLCAxLjAwLCBNYXRoLlBJIC8gNl0sXG4gICAgWydzdHlsX3RyZWVfYmxvc3NvbScsIC0yOCwgLTM4LCAwLCAwLjkwLCBNYXRoLlBJIC8gNF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtNDAsIC0zMCwgMiwgMS4wNSwgTWF0aC5QSSAvIDNdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTIsIC0yNCwgMCwgMC45MCwgTWF0aC5QSSAvIDIuNF0sXG4gIF07XG4gIGZvciAoY29uc3QgW2tpbmQsIHgsIHosIHZhcmlhbnQsIHNjYWxlLCByb3RdIG9mIGdyb3ZlKSB7XG4gICAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsIGtpbmQsIHgsIHosIHZhcmlhbnQsIHJvdCwgc2NhbGUsICd3b29kJywgMTIsIDQpO1xuICB9XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9yb2NrX21lZGl1bScsIC02LCAtMTAsIDAsIDAsIDEuMCwgJ3N0b25lJywgOCwgMyk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9zaHJ1YicsIC0xNCwgLTgsIDEsIE1hdGguUEkgLyAxMiwgMS4xLCAnZmliZXInLCA0LCAxKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX2NhaXJuJywgLTIwLCAtNiwgMCwgMCwgMS4wLCAnc3RvbmUnLCA2LCAyKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX29yZScsIC0zOCwgLTQyLCAwLCBNYXRoLlBJIC8gNCwgMS4xLCAnb3JlJywgOCwgMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBuZWFyZXN0SGFydmVzdGFibGUoXG4gIHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCByZXNvdXJjZT86IFJlc291cmNlVHlwZSxcbik6IEVudGl0eSB8IG51bGwge1xuICBsZXQgYmVzdDogRW50aXR5IHwgbnVsbCA9IG51bGw7XG4gIGxldCBiZXN0RCA9IHJhZGl1cyAqIHJhZGl1cztcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKVxuICAgICAgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgY29udGludWU7XG4gICAgaWYgKHJlc291cmNlICYmIGUucmVzb3VyY2UgIT09IHJlc291cmNlKSBjb250aW51ZTtcbiAgICBjb25zdCBkID0gKGUueCAtIHgpICoqIDIgKyAoZS56IC0geikgKiogMjtcbiAgICBpZiAoZCA8IGJlc3REKSB7IGJlc3REID0gZDsgYmVzdCA9IGU7IH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0UmVzdWx0IHsgZW50aXR5OiBFbnRpdHk7IHJlc291cmNlOiBSZXNvdXJjZVR5cGU7IGFtb3VudDogbnVtYmVyOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXJ2ZXN0RW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEhhcnZlc3RSZXN1bHQgfCBudWxsIHtcbiAgY29uc3QgZSA9IGxpdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsO1xuICBjb25zdCBhbW91bnQgPSBNYXRoLm1pbihlLnlpZWxkUGVySGFydmVzdCwgZS5yZW1haW5pbmcpO1xuICBpZiAod29ybGQubGlmZSAmJiBPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIG4pID0+IHN1bSArIG4sIDApICsgYW1vdW50ID4gMTIwKSByZXR1cm4gbnVsbDtcbiAgZS5yZW1haW5pbmcgLT0gYW1vdW50O1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBlLmhhcnZlc3RlZE9uY2UgPSB0cnVlO1xuICBpZiAoZS5yZW1haW5pbmcgPD0gMCkgZS5oYXJ2ZXN0ZWQgPSB0cnVlO1xuICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBlbnRpdHk6IGUsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQgfTtcbn1cblxuLyoqIFJlbW92ZSBldmVyeSByZXRpcmVkIHNvdXJjZSBhZnRlciB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheS4gVGhpcyBtaWdyYXRpb25cbiAqIGNyZWF0ZXMgZGV0ZXJtaW5pc3RpYyB0b21ic3RvbmVzIGJ1dCBpcyBub3QgYSBwbGF5ZXIgY29tbWFuZCBvciByZXZpc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXRpcmVTdG9uZUVudGl0aWVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBmb3IgKGNvbnN0IGUgb2YgWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXSkge1xuICAgIGlmICghaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkpIGNvbnRpbnVlO1xuICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShlLmlkKTtcbiAgICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChlLmlkKTtcbiAgICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgICBpZiAoIXdvcmxkLmVudGl0eUNodW5rcy5oYXMoZS5jaHVuaykpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIGZvciAoY29uc3QgW2tleSwgaWRzXSBvZiB3b3JsZC5lbnRpdHlDaHVua3MpIHtcbiAgICBjb25zdCBhY3RpdmUgPSBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSk7XG4gICAgaWYgKGFjdGl2ZS5sZW5ndGggPiAwIHx8IHdvcmxkLmVudGl0eUNoYW5nZXMuaGFzKGtleSkpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBhY3RpdmUpO1xuICAgIGVsc2Ugd29ybGQuZW50aXR5Q2h1bmtzLmRlbGV0ZShrZXkpO1xuICB9XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwZXJzaXN0ZW5jZSAvIGF1dGhvcml0eSBib3VuZGFyeSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWFuaWZlc3Qge1xuICBzY2hlbWE6IDE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgcGFyYW1zSGFzaDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBmbnYxYSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgaCA9IDB4ODExYzlkYzU7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGggXj0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIGggPSBNYXRoLmltdWwoaCwgMHgwMTAwMDE5Myk7XG4gIH1cbiAgcmV0dXJuIChoID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkTWFuaWZlc3Qod29ybGQ6IFdvcmxkKTogV29ybGRNYW5pZmVzdCB7XG4gIGNvbnN0IHAgPSB3b3JsZC5wYXJhbXM7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIHNlZWQ6IHdvcmxkLnNlZWQsXG4gICAgZ2VuZXJhdG9yVmVyc2lvbjogcC5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIHNpemU6IHAuc2l6ZSxcbiAgICBjaHVua1NpemU6IHAuY2h1bmtTaXplLFxuICAgIHlNaW46IHAueU1pbixcbiAgICB5TWF4OiBwLnlNYXgsXG4gICAgc2VhTGV2ZWw6IHAuc2VhTGV2ZWwsXG4gICAgcGFyYW1zSGFzaDogZm52MWEoSlNPTi5zdHJpbmdpZnkocCkpLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsRWRpdCB7IGk6IG51bWJlcjsgbTogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBzY2hlbWE6IDE7XG4gIGtleTogc3RyaW5nO1xuICBiYXNlVmVyc2lvbjogbnVtYmVyO1xuICBlZGl0czogVm94ZWxFZGl0W107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBDaHVua0RlbHRhIHtcbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAga2V5LFxuICAgIGJhc2VWZXJzaW9uOiB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBlZGl0czogZWRpdHMgPyBbLi4uZWRpdHMuZW50cmllcygpXS5tYXAoKFtpLCBtXSkgPT4gKHsgaSwgbSB9KSkuc29ydCgoYSwgYikgPT4gYS5pIC0gYi5pKSA6IFtdLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwgZGVsdGE6IENodW5rRGVsdGEpOiB2b2lkIHtcbiAgY29uc3QgW2N4LCBjel0gPSBkZWx0YS5rZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgZm9yIChjb25zdCBlIG9mIGRlbHRhLmVkaXRzKSB7XG4gICAgY29uc3QgeUluZGV4ID0gTWF0aC5mbG9vcihlLmkgLyBDSFVOS19BUkVBKTtcbiAgICBjb25zdCByZW0gPSBlLmkgJSBDSFVOS19BUkVBO1xuICAgIGNvbnN0IGx6ID0gTWF0aC5mbG9vcihyZW0gLyBDSFVOS19TSVpFKTtcbiAgICBjb25zdCBseCA9IHJlbSAlIENIVU5LX1NJWkU7XG4gICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseDtcbiAgICBjb25zdCB5ID0gWV9NSU4gKyB5SW5kZXg7XG4gICAgY29uc3QgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICBzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgZS5tIGFzIE1hdElkKTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIHRpbWUgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBUaW1lU3RhdGUgeyB0OiBudW1iZXI7IGRheUxlbmd0aFNlYzogbnVtYmVyOyBwYXVzZWQ6IGJvb2xlYW47IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkdmFuY2VUaW1lKHM6IFRpbWVTdGF0ZSwgZHQ6IG51bWJlcik6IHZvaWQge1xuICBpZiAocy5wYXVzZWQpIHJldHVybjtcbiAgcy50ID0gKHMudCArIGR0IC8gcy5kYXlMZW5ndGhTZWMpICUgMTtcbn1cbiIsICIvLyBUZXJyYWluIHF1ZXJ5IGxheWVyIFx1MjAxNCBwdXJlIHNpbXVsYXRpb24sIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAyIFN5c3RlbSAxOiBvbmUgc2hhcmVkLCBjYWNoZWQgY29udHJhY3QgZm9yIGNvbnN0cnVjdGlvbiwgZmFybWluZyxcbi8vIG1vdmVtZW50LCBuYXZpZ2F0aW9uIGFuZCB0aGUgQUkgYWdlbnQuIFRoZXNlIHF1ZXJpZXMgZGVzY3JpYmUgdGhlXG4vLyBhdXRob3JpdGF0aXZlIHZveGVsIHZvbHVtZTsgdGhleSBuZXZlciBtdXRhdGUgaXQgYW5kIG5ldmVyIGNyZWF0ZSBhIHNlY29uZFxuLy8gdGVycmFpbiByZXByZXNlbnRhdGlvbi5cbi8vXG4vLyBDb252ZW50aW9uczpcbi8vICAgKiB4L3ogYXJlIGludGVnZXIgY29sdW1uIGNvb3JkaW5hdGVzIGluIFstMTAyNCwgMTAyNCkuXG4vLyAgICogeSBpcyBhbiBpbnRlZ2VyIHZveGVsIGNvb3JkaW5hdGUgaW4gWy0xNiwgMTEyKS5cbi8vICAgKiBzdXJmYWNlWSBpcyB0aGUgZXhwb3NlZCB0b3AgZmFjZSAodG9wU29saWQgKyAxKSwgbWF0Y2hpbmcgTTAwMS5cbi8vICAgKiBBIHJlY3QgaXMgaW5jbHVzaXZlIG9uIGFsbCBmb3VyIGVkZ2VzLlxuaW1wb3J0IHtcbiAgV29ybGQsIE1hdElkLCBNQVQsIFNFQV9MRVZFTCwgWV9NSU4sIFlfTUFYLCBIQUxGLFxuICBzdXJmYWNlQXQsIHRvcE1hdGVyaWFsQXRXb3JsZCwgZ2V0Vm94ZWwsIGlzU29saWQsXG4gIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBBY3RpdmVFbnRpdHlLaW5kLCBFbnRpdHlLaW5kLCBpc1JldGlyZWRTdG9uZUtpbmQsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcblxuZXhwb3J0IGludGVyZmFjZSBSZWN0IHtcbiAgeDA6IG51bWJlcjtcbiAgejA6IG51bWJlcjtcbiAgeDE6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbFJlZ2lvbiBleHRlbmRzIFJlY3Qge1xuICB5MDogbnVtYmVyO1xuICB5MTogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplUmVjdChyZWN0OiBSZWN0KTogUmVjdCB7XG4gIHJldHVybiB7XG4gICAgeDA6IE1hdGgubWluKHJlY3QueDAsIHJlY3QueDEpLFxuICAgIHowOiBNYXRoLm1pbihyZWN0LnowLCByZWN0LnoxKSxcbiAgICB4MTogTWF0aC5tYXgocmVjdC54MCwgcmVjdC54MSksXG4gICAgejE6IE1hdGgubWF4KHJlY3QuejAsIHJlY3QuejEpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdENvbHVtbnMocmVjdDogUmVjdCk6IG51bWJlciB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICByZXR1cm4gKHIueDEgLSByLngwICsgMSkgKiAoci56MSAtIHIuejAgKyAxKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RDb250YWlucyhyZWN0OiBSZWN0LCB4OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4geCA+PSByZWN0LngwICYmIHggPD0gcmVjdC54MSAmJiB6ID49IHJlY3QuejAgJiYgeiA8PSByZWN0LnoxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwYW5kUmVjdChyZWN0OiBSZWN0LCBhbW91bnQ6IG51bWJlcik6IFJlY3Qge1xuICByZXR1cm4ge1xuICAgIHgwOiByZWN0LngwIC0gYW1vdW50LFxuICAgIHowOiByZWN0LnowIC0gYW1vdW50LFxuICAgIHgxOiByZWN0LngxICsgYW1vdW50LFxuICAgIHoxOiByZWN0LnoxICsgYW1vdW50LFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdFRvUmVnaW9uKHJlY3Q6IFJlY3QsIHkwID0gWV9NSU4sIHkxID0gWV9NQVggLSAxKTogVm94ZWxSZWdpb24ge1xuICByZXR1cm4geyAuLi5ub3JtYWxpemVSZWN0KHJlY3QpLCB5MCwgeTEgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lvbnNPdmVybGFwKGE6IFZveGVsUmVnaW9uLCBiOiBWb3hlbFJlZ2lvbik6IGJvb2xlYW4ge1xuICByZXR1cm4gYS54MCA8PSBiLngxICYmIGEueDEgPj0gYi54MCAmJiBhLnowIDw9IGIuejEgJiYgYS56MSA+PSBiLnowXG4gICAgJiYgYS55MCA8PSBiLnkxICYmIGEueTEgPj0gYi55MDtcbn1cblxuLyoqIEluY2x1c2l2ZSBjb250YWlubWVudCBvZiBhIHZveGVsIGluIGEgd29yayBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbnZlbG9wZUNvbnRhaW5zKHJlY3RzOiByZWFkb25seSBWb3hlbFJlZ2lvbltdLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGZvciAoY29uc3QgciBvZiByZWN0cykge1xuICAgIGlmICh4ID49IHIueDAgJiYgeCA8PSByLngxICYmIHkgPj0gci55MCAmJiB5IDw9IHIueTEgJiYgeiA+PSByLnowICYmIHogPD0gci56MSkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRlcnJhaW5Db2x1bW4ge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgLyoqIEV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbjsgdGhlIGZpcnN0IGFpciBjZWxsIGFib3ZlIGl0LiAqL1xuICBzdXJmYWNlWTogbnVtYmVyO1xuICAvKiogVGhlIGhpZ2hlc3Qgc29saWQgdm94ZWwsIG9yIFlfTUlOIC0gMSBpZiB0aGUgY29sdW1uIGhhcyBubyBzb2xpZC4gKi9cbiAgdG9wU29saWRZOiBudW1iZXI7XG4gIHRvcE1hdGVyaWFsOiBNYXRJZDtcbiAgc29saWQ6IGJvb2xlYW47XG4gIC8qKiBXYXRlciBhYm92ZSB0aGUgc29saWQgc3VyZmFjZSwgdXAgdG8gc2VhIGxldmVsLiAwIG9uIGRyeSBsYW5kLiAqL1xuICB3YXRlckRlcHRoOiBudW1iZXI7XG4gIHVuZGVyd2F0ZXI6IGJvb2xlYW47XG4gIC8qKiBMYXJnZXN0IDQtbmVpZ2hib3VyIHN1cmZhY2Ugc3RlcCBpbiBtZXRyZXMgKDEgPSBhIHNpbmdsZSB2b3hlbCByaXNlcikuICovXG4gIHNsb3BlOiBudW1iZXI7XG4gIC8qKiBGcmVlIGFpciBjZWxscyBhYm92ZSB0aGUgc3VyZmFjZSwgY2FwcGVkIGF0IENMRUFSQU5DRV9QUk9CRS4gKi9cbiAgY2xlYXJhbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBDTEVBUkFOQ0VfUFJPQkUgPSA4O1xuXG5mdW5jdGlvbiBzdXJmYWNlQXRTYWZlKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGZhbGxiYWNrOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsbGJhY2s7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG4vKiogV2F0ZXIgZGVwdGggdGhhdCByZXNwZWN0cyBhIGRyeSBwaXQgYmVsb3cgc2VhIGxldmVsICh1bmxpa2UgaGVpZ2h0IGFsb25lKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXRDb2x1bW4od29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoc3VyZmFjZSA+PSBTRUFfTEVWRUwpIHJldHVybiAwO1xuICBpZiAoZ2V0Vm94ZWwod29ybGQsIHgsIFNFQV9MRVZFTCAtIDEsIHopICE9PSBNQVQuV0FURVIpIHJldHVybiAwO1xuICByZXR1cm4gU0VBX0xFVkVMIC0gc3VyZmFjZTtcbn1cblxuLyoqIFRydWUgd2hlbiBgaGVpZ2h0YCBhaXIgY2VsbHMgYWJvdmUgdGhlIHN1cmZhY2UgYXJlIGZyZWUgb2Ygc29saWQgb3Igd2F0ZXIuICovXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJhbmNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaGVpZ2h0OyBpKyspIHtcbiAgICBpZiAoZ2V0Vm94ZWwod29ybGQsIHgsIHN1cmZhY2UgKyBpLCB6KSAhPT0gTUFULkFJUikgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29sdW1uQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFRlcnJhaW5Db2x1bW4ge1xuICBjb25zdCBjeCA9IE1hdGguZmxvb3IoeCksIGN6ID0gTWF0aC5mbG9vcih6KTtcbiAgY29uc3Qgc3VyZmFjZVkgPSBzdXJmYWNlQXQod29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHRvcE1hdGVyaWFsID0gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCBzb2xpZCA9IHN1cmZhY2VZID4gWV9NSU4gJiYgaXNTb2xpZCh0b3BNYXRlcmlhbCk7XG4gIGNvbnN0IHdhdGVyRGVwdGggPSB3YXRlckRlcHRoQXRDb2x1bW4od29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCAtIDEsIGN6LCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3ggKyAxLCBjeiwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4LCBjeiAtIDEsIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCwgY3ogKyAxLCBzdXJmYWNlWSkpLFxuICApO1xuICBsZXQgY2xlYXJhbmNlID0gMDtcbiAgd2hpbGUgKGNsZWFyYW5jZSA8IENMRUFSQU5DRV9QUk9CRSAmJiBnZXRWb3hlbCh3b3JsZCwgY3gsIHN1cmZhY2VZICsgY2xlYXJhbmNlLCBjeikgPT09IE1BVC5BSVIpIHtcbiAgICBjbGVhcmFuY2UrKztcbiAgfVxuICByZXR1cm4ge1xuICAgIHg6IGN4LCB6OiBjeiwgc3VyZmFjZVksIHRvcFNvbGlkWTogc3VyZmFjZVkgLSAxLCB0b3BNYXRlcmlhbCxcbiAgICBzb2xpZCwgd2F0ZXJEZXB0aCwgdW5kZXJ3YXRlcjogd2F0ZXJEZXB0aCA+IDAsIHNsb3BlLCBjbGVhcmFuY2UsXG4gIH07XG59XG5cbi8vIEVudGl0eSBmb290cHJpbnRzIGFyZSBkZWxpYmVyYXRlbHkgZXhwbGljaXQuIEEgdHJlZSBvY2N1cGllcyBtb3JlIHNpdGUgdGhhblxuLy8gaXRzIHRydW5rOyBhIHBlYmJsZSBvY2N1cGllcyBsZXNzIHRoYW4gYSBib3VsZGVyLiBUaGVzZSBhcmUgc2ltdWxhdGlvblxuLy8gY2xlYXJhbmNlIHJhZGlpLCBub3QgcmVuZGVyIGJvdW5kcy5cbmV4cG9ydCBjb25zdCBPQlNUUlVDVElPTl9SQURJVVM6IFJlY29yZDxBY3RpdmVFbnRpdHlLaW5kLCBudW1iZXI+ID0ge1xuICBzdHlsX3RyZWVfc3BpcmU6IDEuNSxcbiAgc3R5bF90cmVlX3RhYmxlOiAxLjgsXG4gIHN0eWxfdHJlZV9jbHVzdGVyOiAxLjksXG4gIHN0eWxfdHJlZV9ibG9zc29tOiAxLjYsXG4gIHN0eWxfc2hydWI6IDAuNixcbiAgc3R5bF9vcmU6IDAuOSxcbiAgc3R5bF9jYWlybjogMC44LFxuICB3YXlzdG9uZTogMS40LFxuICBtYXJrZXI6IDAuNSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgT2JzdHJ1Y3Rpb24ge1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcmFkaXVzOiBudW1iZXI7XG4gIC8qKiBGb290cHJpbnQgY2VsbHMgb3ZlcmxhcHBlZCBieSB0aGlzIGVudGl0eS4gKi9cbiAgY2VsbHM6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZW50aXR5Q2h1bmtzRm9yUmVjdCh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAvLyBBIHJlY3Qgb3ducyB3aG9sZSB2b3hlbCBjZWxscy4gSW5jbHVkZSBldmVyeSBjaHVuayB3aG9zZSByb290IGNvdWxkIG92ZXJsYXBcbiAgLy8gdGhvc2UgY2VsbHMsIHdpdGhvdXQgc2Nhbm5pbmcgdGhlIGVudGlyZSAyMDQ4IG0gd29ybGQuXG4gIGNvbnN0IHJhZGl1cyA9IE1hdGgubWF4KC4uLk9iamVjdC52YWx1ZXMoT0JTVFJVQ1RJT05fUkFESVVTKSwgMS41KTtcbiAgY29uc3QgbWluQ2VsbFggPSBNYXRoLmZsb29yKHIueDAgKyAwLjUgLSByYWRpdXMpO1xuICBjb25zdCBtYXhDZWxsWCA9IE1hdGguY2VpbChyLngxICsgMC41ICsgcmFkaXVzKSAtIDE7XG4gIGNvbnN0IG1pbkNlbGxaID0gTWF0aC5mbG9vcihyLnowICsgMC41IC0gcmFkaXVzKTtcbiAgY29uc3QgbWF4Q2VsbFogPSBNYXRoLmNlaWwoci56MSArIDAuNSArIHJhZGl1cykgLSAxO1xuICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjeDAgPSBNYXRoLm1heCgwLCB3b3JsZFRvQ2h1bmtYKG1pbkNlbGxYKSksIGN4MSA9IHdvcmxkVG9DaHVua1gobWF4Q2VsbFgpO1xuICBjb25zdCBjejAgPSBNYXRoLm1heCgwLCB3b3JsZFRvQ2h1bmtaKG1pbkNlbGxaKSksIGN6MSA9IHdvcmxkVG9DaHVua1oobWF4Q2VsbFopO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICB9XG4gIHJldHVybiBrZXlzO1xufVxuXG4vKiogRW50aXRpZXMgd2hvc2Ugc2ltdWxhdGlvbiBmb290cHJpbnQgb3ZlcmxhcHMgdGhlIHJlY3QuICovXG5leHBvcnQgZnVuY3Rpb24gb2JzdHJ1Y3Rpb25zSW4od29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0KTogT2JzdHJ1Y3Rpb25bXSB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IG91dDogT2JzdHJ1Y3Rpb25bXSA9IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBlbnRpdHlDaHVua3NGb3JSZWN0KHdvcmxkLCByKSkge1xuICAgIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWlkcykgY29udGludWU7XG4gICAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICAgIGlmIChzZWVuLmhhcyhpZCkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSBjb250aW51ZTtcbiAgICAgIHNlZW4uYWRkKGlkKTtcbiAgICAgIGNvbnN0IHJhZGl1cyA9IGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpXG4gICAgICAgID8gZS5raW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDAuNiA6IGUua2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gMS4xIDogMS41XG4gICAgICAgIDogT0JTVFJVQ1RJT05fUkFESVVTW2Uua2luZCBhcyBBY3RpdmVFbnRpdHlLaW5kXTtcbiAgICAgIGxldCBjZWxscyA9IDA7XG4gICAgICBjb25zdCBleDAgPSBNYXRoLm1heChyLngwLCBNYXRoLmZsb29yKGUueCAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXgxID0gTWF0aC5taW4oci54MSwgTWF0aC5jZWlsKGUueCArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXowID0gTWF0aC5tYXgoci56MCwgTWF0aC5mbG9vcihlLnogLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MSA9IE1hdGgubWluKHIuejEsIE1hdGguY2VpbChlLnogKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGZvciAobGV0IHogPSBlejA7IHogPD0gZXoxOyB6KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IGV4MDsgeCA8PSBleDE7IHgrKykge1xuICAgICAgICAgIGlmIChNYXRoLmh5cG90KGUueCAtICh4ICsgMC41KSwgZS56IC0gKHogKyAwLjUpKSA8PSByYWRpdXMpIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjZWxscyA+IDApIHtcbiAgICAgICAgb3V0LnB1c2goeyBlbnRpdHlJZDogZS5pZCwga2luZDogZS5raW5kLCB4OiBlLngsIHo6IGUueiwgcmFkaXVzLCBjZWxscyB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgb3V0LnNvcnQoKGEsIGIpID0+IChhLmVudGl0eUlkIDwgYi5lbnRpdHlJZCA/IC0xIDogYS5lbnRpdHlJZCA+IGIuZW50aXR5SWQgPyAxIDogMCkpO1xuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFyZWFTdGF0cyB7XG4gIHJlY3Q6IFJlY3Q7XG4gIGNvbHVtbnM6IG51bWJlcjtcbiAgbWluWTogbnVtYmVyO1xuICBtYXhZOiBudW1iZXI7XG4gIG1lYW5ZOiBudW1iZXI7XG4gIHJlbGllZjogbnVtYmVyO1xuICBtYXhTdGVwOiBudW1iZXI7XG4gIHdhdGVyQ29sdW1uczogbnVtYmVyO1xuICBzdG9uZUNvbHVtbnM6IG51bWJlcjtcbiAgbWF0ZXJpYWxzOiBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+O1xuICBvYnN0cnVjdGlvbnM6IE9ic3RydWN0aW9uW107XG4gIG9ic3RydWN0ZWRDb2x1bW5zOiBudW1iZXI7XG4gIC8qKiBDdXQvZmlsbCByZWxhdGl2ZSB0byBmbG9vclkgd2hlbiBzdXBwbGllZCwgb3RoZXJ3aXNlIDAuICovXG4gIGZsb29yWTogbnVtYmVyIHwgbnVsbDtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXBwb3J0U3VtbWFyeSB7XG4gIHRvdGFsOiBudW1iZXI7XG4gIGxldmVsOiBudW1iZXI7XG4gIGN1dDogbnVtYmVyO1xuICBmaWxsOiBudW1iZXI7XG4gIHdhdGVyOiBudW1iZXI7XG4gIC8qKiBGaWxsIGRlZXBlciB0aGFuIDggbTsgYSB2YWxpZGF0b3IgbWF5IHJlamVjdCB0aGVzZSBhcyB1bnN1cHBvcnRlZC4gKi9cbiAgZGVlcEZpbGw6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGb290cHJpbnRRdWVyeSB7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBzdGF0czogQXJlYVN0YXRzO1xuICBzdXBwb3J0OiBTdXBwb3J0U3VtbWFyeTtcbiAgb2JzdHJ1Y3Rpb25zOiBPYnN0cnVjdGlvbltdO1xuICAvKiogQ2VsbHMgaW4gdGhlIGJ1aWxkaW5nIHZvbHVtZSBhYm92ZSB0aGUgcHJlcGFyZWQgZmxvb3IgdGhhdCBhcmUgbm90IGFpci4gKi9cbiAgb3ZlcmhhbmdDZWxsczogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyBtYXRlcmlhbDogTWF0SWQgfT47XG59XG5cbi8qKlxuICogQ2FjaGVkIHF1ZXJ5IGNvbnRleHQuIENhY2hlcyBhcmUga2V5ZWQgb24gd29ybGQucmV2aXNpb246IGEgdm94ZWwgb3IgZW50aXR5XG4gKiBlZGl0IGludmFsaWRhdGVzIHRoZW0sIHdoaWxlIG1lc2gvbmF2IHJlYnVpbGRzIGRvIG5vdC4gVXNlIG9uZSBjb250ZXh0IGZvciBhXG4gKiBzaXRlIHNlYXJjaCBvciBhIGZvb3RwcmludCBldmFsdWF0aW9uLCB0aGVuIGRpc2NhcmQgaXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXJyYWluUXVlcnkge1xuICBwcml2YXRlIGNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFRlcnJhaW5Db2x1bW4+KCk7XG4gIHByaXZhdGUgb2JzdHJ1Y3Rpb25DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBPYnN0cnVjdGlvbltdPigpO1xuICBwcml2YXRlIHJldmlzaW9uOiBudW1iZXI7XG5cbiAgY29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHdvcmxkOiBXb3JsZCkge1xuICAgIHRoaXMucmV2aXNpb24gPSB3b3JsZC5yZXZpc2lvbjtcbiAgfVxuXG4gIHByaXZhdGUgc3luYygpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5yZXZpc2lvbiAhPT0gdGhpcy53b3JsZC5yZXZpc2lvbikge1xuICAgICAgdGhpcy5jYWNoZS5jbGVhcigpO1xuICAgICAgdGhpcy5vYnN0cnVjdGlvbkNhY2hlLmNsZWFyKCk7XG4gICAgICB0aGlzLnJldmlzaW9uID0gdGhpcy53b3JsZC5yZXZpc2lvbjtcbiAgICB9XG4gIH1cblxuICAvKiogQ2FjaGVkIGVudGl0eSBvYnN0cnVjdGlvbnMgZm9yIG9uZSBmb290cHJpbnQuICovXG4gIG9ic3RydWN0aW9uc0ZvcihyZWN0OiBSZWN0KTogT2JzdHJ1Y3Rpb25bXSB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgY29uc3Qga2V5ID0gYCR7ci54MH0sJHtyLnowfSwke3IueDF9LCR7ci56MX1gO1xuICAgIGxldCBsaXN0ID0gdGhpcy5vYnN0cnVjdGlvbkNhY2hlLmdldChrZXkpO1xuICAgIGlmICghbGlzdCkge1xuICAgICAgbGlzdCA9IG9ic3RydWN0aW9uc0luKHRoaXMud29ybGQsIHIpO1xuICAgICAgdGhpcy5vYnN0cnVjdGlvbkNhY2hlLnNldChrZXksIGxpc3QpO1xuICAgIH1cbiAgICByZXR1cm4gbGlzdDtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFRlcnJhaW5Db2x1bW4ge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICAgIGNvbnN0IGtleSA9IGAke2N4fSwke2N6fWA7XG4gICAgbGV0IGNvbCA9IHRoaXMuY2FjaGUuZ2V0KGtleSk7XG4gICAgaWYgKCFjb2wpIHtcbiAgICAgIGNvbCA9IGNvbHVtbkF0KHRoaXMud29ybGQsIGN4LCBjeik7XG4gICAgICB0aGlzLmNhY2hlLnNldChrZXksIGNvbCk7XG4gICAgfVxuICAgIHJldHVybiBjb2w7XG4gIH1cblxuICBhcmVhKHJlY3Q6IFJlY3QsIGZsb29yWT86IG51bWJlcik6IEFyZWFTdGF0cyB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgbGV0IG1pblkgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gICAgbGV0IG1heFkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gICAgbGV0IHN1bSA9IDA7XG4gICAgbGV0IG1heFN0ZXAgPSAwO1xuICAgIGxldCB3YXRlckNvbHVtbnMgPSAwO1xuICAgIGxldCBzdG9uZUNvbHVtbnMgPSAwO1xuICAgIGxldCBjdXRWb2x1bWUgPSAwO1xuICAgIGxldCBmaWxsVm9sdW1lID0gMDtcbiAgICBsZXQgbWF4Q3V0ID0gMDtcbiAgICBsZXQgbWF4RmlsbCA9IDA7XG4gICAgY29uc3QgbWF0ZXJpYWxzOiBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+ID0ge307XG5cbiAgICBmb3IgKGxldCB6ID0gci56MDsgeiA8PSByLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByLngwOyB4IDw9IHIueDE7IHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSB0aGlzLmNvbHVtbih4LCB6KTtcbiAgICAgICAgbWluWSA9IE1hdGgubWluKG1pblksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIG1heFkgPSBNYXRoLm1heChtYXhZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBzdW0gKz0gY29sLnN1cmZhY2VZO1xuICAgICAgICBtYXhTdGVwID0gTWF0aC5tYXgobWF4U3RlcCwgY29sLnNsb3BlKTtcbiAgICAgICAgaWYgKGNvbC53YXRlckRlcHRoID4gMCkgd2F0ZXJDb2x1bW5zKys7XG4gICAgICAgIGlmIChjb2wudG9wTWF0ZXJpYWwgPT09IE1BVC5TVE9ORSkgc3RvbmVDb2x1bW5zKys7XG4gICAgICAgIG1hdGVyaWFsc1tjb2wudG9wTWF0ZXJpYWxdID0gKG1hdGVyaWFsc1tjb2wudG9wTWF0ZXJpYWxdID8/IDApICsgMTtcbiAgICAgICAgaWYgKGZsb29yWSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgY29uc3QgZHkgPSBjb2wuc3VyZmFjZVkgLSBmbG9vclk7XG4gICAgICAgICAgaWYgKGR5ID4gMCkge1xuICAgICAgICAgICAgY3V0Vm9sdW1lICs9IGR5O1xuICAgICAgICAgICAgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkeSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChkeSA8IDApIHtcbiAgICAgICAgICAgIGZpbGxWb2x1bWUgKz0gLWR5O1xuICAgICAgICAgICAgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIC1keSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gdGhpcy5vYnN0cnVjdGlvbnNGb3Iocik7XG4gICAgY29uc3Qgb2JzdHJ1Y3RlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgbyBvZiBvYnN0cnVjdGlvbnMpIHtcbiAgICAgIGNvbnN0IHJhZGl1cyA9IG8ucmFkaXVzO1xuICAgICAgY29uc3QgZXgwID0gTWF0aC5tYXgoci54MCwgTWF0aC5mbG9vcihvLnggLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV4MSA9IE1hdGgubWluKHIueDEsIE1hdGguY2VpbChvLnggKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MCA9IE1hdGgubWF4KHIuejAsIE1hdGguZmxvb3Ioby56IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejEgPSBNYXRoLm1pbihyLnoxLCBNYXRoLmNlaWwoby56ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBmb3IgKGxldCB6ID0gZXowOyB6IDw9IGV6MTsgeisrKSB7XG4gICAgICAgIGZvciAobGV0IHggPSBleDA7IHggPD0gZXgxOyB4KyspIHtcbiAgICAgICAgICBpZiAoTWF0aC5oeXBvdChvLnggLSAoeCArIDAuNSksIG8ueiAtICh6ICsgMC41KSkgPD0gcmFkaXVzKSBvYnN0cnVjdGVkLmFkZChgJHt4fSwke3p9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBjb2x1bW5zID0gKHIueDEgLSByLngwICsgMSkgKiAoci56MSAtIHIuejAgKyAxKTtcbiAgICByZXR1cm4ge1xuICAgICAgcmVjdDogcixcbiAgICAgIGNvbHVtbnMsXG4gICAgICBtaW5ZLCBtYXhZLFxuICAgICAgbWVhblk6IE1hdGgucm91bmQoKHN1bSAvIGNvbHVtbnMpICogMTAwMCkgLyAxMDAwLFxuICAgICAgcmVsaWVmOiBtYXhZIC0gbWluWSxcbiAgICAgIG1heFN0ZXAsXG4gICAgICB3YXRlckNvbHVtbnMsXG4gICAgICBzdG9uZUNvbHVtbnMsXG4gICAgICBtYXRlcmlhbHMsXG4gICAgICBvYnN0cnVjdGlvbnMsXG4gICAgICBvYnN0cnVjdGVkQ29sdW1uczogb2JzdHJ1Y3RlZC5zaXplLFxuICAgICAgZmxvb3JZOiBmbG9vclkgPz8gbnVsbCxcbiAgICAgIGN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQsXG4gICAgICBtYXhGaWxsLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogRXZhbHVhdGUgYSBjb21wbGV0ZSBidWlsZGluZyBmb290cHJpbnQuIGBmbG9vcllgIGlzIHRoZSBwcmVwYXJlZCB3YWxraW5nXG4gICAqIGZsb29yOiB0ZXJyYWluIGFib3ZlIGl0IGlzIGN1dCwgdGVycmFpbiBiZWxvdyBpdCBpcyBmaWxsZWQuIFRoZSByZXN1bHQgaXNcbiAgICogcmF3IHNpdGUgZGF0YTsgY29uc3RydWN0aW9uIHJ1bGVzIGxpdmUgaW4gY29uc3RydWN0aW9uLnRzLlxuICAgKi9cbiAgZm9vdHByaW50KHJlY3Q6IFJlY3QsIGZsb29yWTogbnVtYmVyKTogRm9vdHByaW50UXVlcnkge1xuICAgIGNvbnN0IHN0YXRzID0gdGhpcy5hcmVhKHJlY3QsIGZsb29yWSk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgY29uc3Qgc3VwcG9ydDogU3VwcG9ydFN1bW1hcnkgPSB7XG4gICAgICB0b3RhbDogc3RhdHMuY29sdW1ucywgbGV2ZWw6IDAsIGN1dDogMCwgZmlsbDogMCwgd2F0ZXI6IDAsIGRlZXBGaWxsOiAwLFxuICAgICAgbWF4Q3V0OiAwLCBtYXhGaWxsOiAwLCBjdXRWb2x1bWU6IDAsIGZpbGxWb2x1bWU6IDAsXG4gICAgfTtcbiAgICBjb25zdCBvdmVyaGFuZ0NlbGxzOiBGb290cHJpbnRRdWVyeVsnb3ZlcmhhbmdDZWxscyddID0gW107XG5cbiAgICBmb3IgKGxldCB6ID0gci56MDsgeiA8PSByLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByLngwOyB4IDw9IHIueDE7IHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSB0aGlzLmNvbHVtbih4LCB6KTtcbiAgICAgICAgY29uc3QgZHkgPSBjb2wuc3VyZmFjZVkgLSBmbG9vclk7XG4gICAgICAgIGlmIChkeSA+IDApIHtcbiAgICAgICAgICBzdXBwb3J0LmN1dCsrO1xuICAgICAgICAgIHN1cHBvcnQuY3V0Vm9sdW1lICs9IGR5O1xuICAgICAgICAgIHN1cHBvcnQubWF4Q3V0ID0gTWF0aC5tYXgoc3VwcG9ydC5tYXhDdXQsIGR5KTtcbiAgICAgICAgfSBlbHNlIGlmIChkeSA8IDApIHtcbiAgICAgICAgICBzdXBwb3J0LmZpbGwrKztcbiAgICAgICAgICBzdXBwb3J0LmZpbGxWb2x1bWUgKz0gLWR5O1xuICAgICAgICAgIHN1cHBvcnQubWF4RmlsbCA9IE1hdGgubWF4KHN1cHBvcnQubWF4RmlsbCwgLWR5KTtcbiAgICAgICAgICBpZiAoLWR5ID4gOCkgc3VwcG9ydC5kZWVwRmlsbCsrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN1cHBvcnQubGV2ZWwrKztcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29sLndhdGVyRGVwdGggPiAwKSBzdXBwb3J0LndhdGVyKys7XG5cbiAgICAgICAgLy8gQW4gb3ZlcmhhbmcgaXMgdGVycmFpbiBhYm92ZSB0aGUgZmxvb3IgdGhhdCBzdXJ2aXZlcyB0aGUgY3V0IHBsYW5lLlxuICAgICAgICAvLyBGb3IgYSBjb2x1bW4gYmVsb3cgdGhlIGZsb29yLCBpdHMgc29saWQgYm9keSBpcyBmaWxsLCBub3Qgb3ZlcmhhbmcuXG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gTWF0aC5tYXgoZmxvb3JZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPCBzdGFydCArIDQ7IHkrKykge1xuICAgICAgICAgIGNvbnN0IG0gPSBnZXRWb3hlbCh0aGlzLndvcmxkLCB4LCB5LCB6KSBhcyBNYXRJZDtcbiAgICAgICAgICBpZiAobSAhPT0gTUFULkFJUikgb3ZlcmhhbmdDZWxscy5wdXNoKHsgeCwgeSwgeiwgbWF0ZXJpYWw6IG0gfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyByZWN0OiByLCBmbG9vclksIHN0YXRzLCBzdXBwb3J0LCBvYnN0cnVjdGlvbnM6IHN0YXRzLm9ic3RydWN0aW9ucywgb3ZlcmhhbmdDZWxscyB9O1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gbW92ZW1lbnQgY29udHJhY3QgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXYWxrUGFyYW1zIHtcbiAgbWF4U3RlcFVwOiBudW1iZXI7XG4gIG1heFN0ZXBEb3duOiBudW1iZXI7XG4gIG1heFdhdGVyRGVwdGg6IG51bWJlcjtcbiAgLyoqIE1heGltdW0gYWRqYWNlbnQgc3VyZmFjZSBzdGVwOyAxLjAgaXMgYSA0NSBkZWdyZWUgdm94ZWwgcmlzZXIuICovXG4gIG1heFNsb3BlOiBudW1iZXI7XG4gIGNsZWFyYW5jZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9XQUxLOiBXYWxrUGFyYW1zID0ge1xuICBtYXhTdGVwVXA6IDEuMCxcbiAgbWF4U3RlcERvd246IDEuNSxcbiAgbWF4V2F0ZXJEZXB0aDogMC40LFxuICBtYXhTbG9wZTogMS4wLFxuICBjbGVhcmFuY2U6IDIuMCxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2Fsa1Jlc3VsdCB7XG4gIG9rOiBib29sZWFuO1xuICByZWFzb246ICdvaycgfCAnbm90X2FkamFjZW50JyB8ICdzdGVwX3VwJyB8ICdmYWxsJyB8ICd3YXRlcicgfCAnc2xvcGUnIHwgJ2NsZWFyYW5jZSc7XG4gIHN0ZXA6IG51bWJlcjtcbiAgd2F0ZXJEZXB0aDogbnVtYmVyO1xufVxuXG4vKiogRXZhbHVhdGUgb25lIGdyaWQgc3RlcC4gUGF0aHMgYXJlIHZhbGlkYXRlZCB3aXRoIHRoZSBzYW1lIGNvbnRyYWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhbGtTdGVwKFxuICB3b3JsZDogV29ybGQsIGZyb21YOiBudW1iZXIsIGZyb21aOiBudW1iZXIsIHRvWDogbnVtYmVyLCB0b1o6IG51bWJlcixcbiAgcGFyYW1zOiBXYWxrUGFyYW1zID0gREVGQVVMVF9XQUxLLFxuKTogV2Fsa1Jlc3VsdCB7XG4gIGNvbnN0IGR4ID0gTWF0aC5hYnMoTWF0aC5mbG9vcih0b1gpIC0gTWF0aC5mbG9vcihmcm9tWCkpO1xuICBjb25zdCBkeiA9IE1hdGguYWJzKE1hdGguZmxvb3IodG9aKSAtIE1hdGguZmxvb3IoZnJvbVopKTtcbiAgaWYgKGR4ICsgZHogIT09IDEpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ25vdF9hZGphY2VudCcsIHN0ZXA6IDAsIHdhdGVyRGVwdGg6IDAgfTtcbiAgfVxuICBjb25zdCBmcm9tID0gY29sdW1uQXQod29ybGQsIGZyb21YLCBmcm9tWik7XG4gIGNvbnN0IHRvID0gY29sdW1uQXQod29ybGQsIHRvWCwgdG9aKTtcbiAgY29uc3Qgc3RlcCA9IHRvLnN1cmZhY2VZIC0gZnJvbS5zdXJmYWNlWTtcbiAgaWYgKHN0ZXAgPiBwYXJhbXMubWF4U3RlcFVwKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3N0ZXBfdXAnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICgtc3RlcCA+IHBhcmFtcy5tYXhTdGVwRG93bikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdmYWxsJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAodG8ud2F0ZXJEZXB0aCA+IHBhcmFtcy5tYXhXYXRlckRlcHRoKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3dhdGVyJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAodG8uc2xvcGUgPiBwYXJhbXMubWF4U2xvcGUpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc2xvcGUnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICghY2xlYXJhbmNlQXQod29ybGQsIHRvWCwgdG9aLCBwYXJhbXMuY2xlYXJhbmNlKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnY2xlYXJhbmNlJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICB9XG4gIHJldHVybiB7IG9rOiB0cnVlLCByZWFzb246ICdvaycsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbn1cblxuLyoqIEVmZmVjdGl2ZSBncmFkZSBvZiBhIHN0cmFpZ2h0IHBhdGggc2VnbWVudCwgdXNlZCBieSBwYXRoIHZhbGlkYXRpb24uICovXG5leHBvcnQgZnVuY3Rpb24gZWZmZWN0aXZlR3JhZGUod29ybGQ6IFdvcmxkLCB4MDogbnVtYmVyLCB6MDogbnVtYmVyLCB4MTogbnVtYmVyLCB6MTogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgYSA9IGNvbHVtbkF0KHdvcmxkLCB4MCwgejApO1xuICBjb25zdCBiID0gY29sdW1uQXQod29ybGQsIHgxLCB6MSk7XG4gIGNvbnN0IHJ1biA9IE1hdGguaHlwb3QoeDEgLSB4MCwgejEgLSB6MCk7XG4gIGlmIChydW4gPT09IDApIHJldHVybiBNYXRoLmFicyhiLnN1cmZhY2VZIC0gYS5zdXJmYWNlWSk7XG4gIHJldHVybiBNYXRoLmFicyhiLnN1cmZhY2VZIC0gYS5zdXJmYWNlWSkgLyBydW47XG59XG4iLCAiLy8gTTAwMiBzaXRlIHZhbGlkYXRpb24sIGNhbmRpZGF0ZSBzZWFyY2ggYW5kIHByZXZpZXcgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbi5cbi8vXG4vLyBUaGlzIGlzIHRoZSBzaGFyZWQgZ2F0ZSBmb3IgdGhlIHBsYXllciBhbmQgdGhlIEFJIGFnZW50LiBOZWl0aGVyIG1heSBwbGFjZSBhXG4vLyBzdHJ1Y3R1cmUgYnkgYW55IG90aGVyIHBhdGg6IGJvdGggc3VibWl0IGEgU2l0ZVByb3Bvc2FsLCBib3RoIHJlY2VpdmUgdGhlXG4vLyBzYW1lIFNpdGVWYWxpZGF0aW9uLCBhbmQgYm90aCBtdXN0IHBhc3MgdGhlIEF1dGhvcml6ZXIgYmVmb3JlIGV4ZWN1dGlvbi5cbi8vXG4vLyBUaGUgdmFsaWRhdG9yIGRlc2NyaWJlcyB0aGUgc2l0ZSBhcyBpdCBpcy4gSXQgZG9lcyBub3QgZWRpdCB2b3hlbHMsIHJlbW92ZVxuLy8gZW50aXRpZXMgb3Igc3BlbmQgcmVzb3VyY2VzLiBQcmVwYXJhdGlvbiBpcyBhIHNlcGFyYXRlLCBhdXRob3JpemVkIHN0ZXAuXG5pbXBvcnQgeyBXb3JsZCwgSEFMRiwgWV9NSU4sIFlfTUFYLCBzdXJmYWNlQXQgfSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBGb290cHJpbnRRdWVyeSwgVGVycmFpblF1ZXJ5LCBBcmVhU3RhdHMsXG4gIG5vcm1hbGl6ZVJlY3QsIGV4cGFuZFJlY3QsIHJlY3RDb2x1bW5zLCBlZmZlY3RpdmVHcmFkZSwgd2Fsa1N0ZXAsIFdhbGtQYXJhbXMsXG4gIERFRkFVTFRfV0FMSywgY29sdW1uQXQsXG59IGZyb20gJy4vdGVycmFpbic7XG5cbmV4cG9ydCB0eXBlIFNpdGVTdGF0ZSA9ICd2YWxpZCcgfCAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicgfCAnaW52YWxpZCc7XG5cbmV4cG9ydCB0eXBlIFZhbGlkYXRpb25Db2RlID1cbiAgfCAnb3V0X29mX2JvdW5kcydcbiAgfCAnZm9vdHByaW50X21pc21hdGNoJ1xuICB8ICdzbG9wZV9leGNlZWRlZCdcbiAgfCAnc3RlcF9leGNlZWRlZCdcbiAgfCAnY3V0X2V4Y2VlZGVkJ1xuICB8ICdmaWxsX2V4Y2VlZGVkJ1xuICB8ICdjdXRfdm9sdW1lX2V4Y2VlZGVkJ1xuICB8ICdmaWxsX3ZvbHVtZV9leGNlZWRlZCdcbiAgfCAnZm9vdHByaW50X29ic3RydWN0ZWQnXG4gIHwgJ3dhdGVyJ1xuICB8ICdvdmVyaGFuZydcbiAgfCAnbmVlZHNfZ3JhZGluZydcbiAgfCAnbmVlZHNfY2xlYXJpbmcnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZhbGlkYXRpb25SZWFzb24ge1xuICBjb2RlOiBWYWxpZGF0aW9uQ29kZTtcbiAgc2V2ZXJpdHk6ICdlcnJvcicgfCAncHJlcGFyYXRpb24nO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIHZhbHVlPzogbnVtYmVyO1xuICBsaW1pdD86IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgRm91bmRhdGlvblR5cGUgPSAnZ3JhZGVkX3BhZCcgfCAnc3RlcHBlZF9wbGludGgnIHwgJ2RlY2snO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJ1aWxkaW5nUnVsZXMge1xuICBpZDogc3RyaW5nO1xuICB3aWR0aDogbnVtYmVyO1xuICBkZXB0aDogbnVtYmVyO1xuICB3YWxsSGVpZ2h0OiBudW1iZXI7XG4gIGNsZWFyYW5jZTogbnVtYmVyO1xuICAvKiogUmVsaWVmIGF0IG9yIGJlbG93IHRoaXMgbmVlZHMgbm8gZ3JhZGluZyB0byBiZSBjYWxsZWQgdmFsaWQuICovXG4gIG1heFJlbGllZk5vUHJlcDogbnVtYmVyO1xuICAvKiogUmVsaWVmIGFib3ZlIHRoaXMgY2Fubm90IGJlIHByZXBhcmVkIGJ5IHRoaXMgYnVpbGRpbmcgdHlwZS4gKi9cbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IG51bWJlcjtcbiAgbWF4U3RlcDogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBtYXhDdXRWb2x1bWU6IG51bWJlcjtcbiAgbWF4RmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhPYnN0cnVjdGlvbnM6IG51bWJlcjtcbiAgcmVxdWlyZXNEcnk6IGJvb2xlYW47XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25UeXBlO1xufVxuXG5leHBvcnQgY29uc3QgSE9VU0VfUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAnaG91c2UtOHg2JyxcbiAgd2lkdGg6IDgsXG4gIGRlcHRoOiA2LFxuICB3YWxsSGVpZ2h0OiAzLFxuICBjbGVhcmFuY2U6IDMsXG4gIG1heFJlbGllZk5vUHJlcDogMS4yLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNC4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDIsXG4gIG1heEZpbGw6IDIsXG4gIG1heEN1dFZvbHVtZTogNDgsXG4gIG1heEZpbGxWb2x1bWU6IDQ4LFxuICBtYXhPYnN0cnVjdGlvbnM6IDAsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnZ3JhZGVkX3BhZCcsXG59O1xuXG5leHBvcnQgY29uc3QgRkFSTV9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdmYXJtLTEyeDgnLFxuICB3aWR0aDogMTIsXG4gIGRlcHRoOiA4LFxuICB3YWxsSGVpZ2h0OiAwLFxuICBjbGVhcmFuY2U6IDEsXG4gIG1heFJlbGllZk5vUHJlcDogMS4yLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNi4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDIsXG4gIG1heEZpbGw6IDIsXG4gIG1heEN1dFZvbHVtZTogOTYsXG4gIG1heEZpbGxWb2x1bWU6IDk2LFxuICBtYXhPYnN0cnVjdGlvbnM6IDQsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnc3RlcHBlZF9wbGludGgnLFxufTtcblxuZXhwb3J0IGNvbnN0IFBBVEhfUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAncGF0aC05eDMnLFxuICB3aWR0aDogOSxcbiAgZGVwdGg6IDMsXG4gIHdhbGxIZWlnaHQ6IDAsXG4gIGNsZWFyYW5jZTogMSxcbiAgbWF4UmVsaWVmTm9QcmVwOiAyLjAsXG4gIG1heFJlbGllZlByZXBhcmVkOiA0LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMSxcbiAgbWF4RmlsbDogMSxcbiAgbWF4Q3V0Vm9sdW1lOiAzMixcbiAgbWF4RmlsbFZvbHVtZTogMzIsXG4gIG1heE9ic3RydWN0aW9uczogMixcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdkZWNrJyxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVByb3Bvc2FsIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblN1bW1hcnkge1xuICBuZWVkc0dyYWRpbmc6IGJvb2xlYW47XG4gIG5lZWRzQ2xlYXJpbmc6IGJvb2xlYW47XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uSWRzOiBzdHJpbmdbXTtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblR5cGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVZhbGlkYXRpb24ge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgc3RhdGU6IFNpdGVTdGF0ZTtcbiAgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdO1xuICBxdWVyeTogRm9vdHByaW50UXVlcnk7XG4gIHByZXBhcmF0aW9uOiBQcmVwYXJhdGlvblN1bW1hcnk7XG59XG5cbmZ1bmN0aW9uIGVycm9yKGNvZGU6IFZhbGlkYXRpb25Db2RlLCBtZXNzYWdlOiBzdHJpbmcsIHZhbHVlPzogbnVtYmVyLCBsaW1pdD86IG51bWJlcik6IFZhbGlkYXRpb25SZWFzb24ge1xuICByZXR1cm4geyBjb2RlLCBzZXZlcml0eTogJ2Vycm9yJywgbWVzc2FnZSwgdmFsdWUsIGxpbWl0IH07XG59XG5cbmZ1bmN0aW9uIHByZXAoY29kZTogVmFsaWRhdGlvbkNvZGUsIG1lc3NhZ2U6IHN0cmluZywgdmFsdWU/OiBudW1iZXIsIGxpbWl0PzogbnVtYmVyKTogVmFsaWRhdGlvblJlYXNvbiB7XG4gIHJldHVybiB7IGNvZGUsIHNldmVyaXR5OiAncHJlcGFyYXRpb24nLCBtZXNzYWdlLCB2YWx1ZSwgbGltaXQgfTtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZSBhIHByb3Bvc2VkIHNpdGUgYWdhaW5zdCBpdHMgYnVpbGRpbmcgcnVsZXMuIFB1cmU6IG5vIHZveGVscyxcbiAqIGVudGl0aWVzIG9yIHJlc291cmNlcyBjaGFuZ2UuIGBxdWVyeWAgbWF5IGJlIHN1cHBsaWVkIGJ5IGEgc2VhcmNoIHRvIHJldXNlXG4gKiB0aGUgY2FjaGVkIGNvbHVtbnMsIGFuZCBgZm9vdHByaW50YCBtYXkgYmUgc3VwcGxpZWQgd2hlbiB0aGUgY2FsbGVyIGFscmVhZHlcbiAqIGV2YWx1YXRlZCB0aGUgc2FtZSByZWN0L2Zsb29yIHBhaXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVNpdGUoXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKSxcbiAgZm9vdHByaW50PzogRm9vdHByaW50UXVlcnksXG4pOiBTaXRlVmFsaWRhdGlvbiB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCBydWxlcyA9IHByb3Bvc2FsLnJ1bGVzO1xuICBjb25zdCByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW10gPSBbXTtcbiAgY29uc3QgZnAgPSBmb290cHJpbnQgPz8gcXVlcnkuZm9vdHByaW50KHJlY3QsIHByb3Bvc2FsLmZsb29yWSk7XG4gIGNvbnN0IHN0YXRzID0gZnAuc3RhdHM7XG5cbiAgaWYgKHJlY3QueDAgPCAtSEFMRiB8fCByZWN0LnowIDwgLUhBTEYgfHwgcmVjdC54MSA+PSBIQUxGIHx8IHJlY3QuejEgPj0gSEFMRikge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcignb3V0X29mX2JvdW5kcycsIGBmb290cHJpbnQgJHtyZWN0LngwfSwke3JlY3QuejB9Li4ke3JlY3QueDF9LCR7cmVjdC56MX0gaXMgb3V0c2lkZSB0aGUgd29ybGRgKSk7XG4gIH1cbiAgaWYgKHJlY3QueDEgLSByZWN0LngwICsgMSAhPT0gcnVsZXMud2lkdGggfHwgcmVjdC56MSAtIHJlY3QuejAgKyAxICE9PSBydWxlcy5kZXB0aCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmb290cHJpbnRfbWlzbWF0Y2gnLFxuICAgICAgYGZvb3RwcmludCBpcyAke3JlY3QueDEgLSByZWN0LngwICsgMX0geCAke3JlY3QuejEgLSByZWN0LnowICsgMX0gbSwgJHtydWxlcy53aWR0aH0geCAke3J1bGVzLmRlcHRofSBtIHJlcXVpcmVkYCxcbiAgICApKTtcbiAgfVxuXG4gIGlmIChzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdzbG9wZV9leGNlZWRlZCcsXG4gICAgICBgcmVsaWVmICR7c3RhdHMucmVsaWVmfSBtIGV4Y2VlZHMgdGhlICR7cnVsZXMubWF4UmVsaWVmUHJlcGFyZWR9IG0gcHJlcGFyZWQgbGltaXRgLFxuICAgICAgc3RhdHMucmVsaWVmLCBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4U3RlcCA+IHJ1bGVzLm1heFN0ZXApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnc3RlcF9leGNlZWRlZCcsXG4gICAgICBgc3VyZmFjZSBzdGVwICR7c3RhdHMubWF4U3RlcH0gbSBleGNlZWRzICR7cnVsZXMubWF4U3RlcH0gbWAsXG4gICAgICBzdGF0cy5tYXhTdGVwLCBydWxlcy5tYXhTdGVwLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhDdXQgPiBydWxlcy5tYXhDdXQpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnY3V0X2V4Y2VlZGVkJyxcbiAgICAgIGBjdXQgJHtzdGF0cy5tYXhDdXR9IG0gZXhjZWVkcyAke3J1bGVzLm1heEN1dH0gbWAsXG4gICAgICBzdGF0cy5tYXhDdXQsIHJ1bGVzLm1heEN1dCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4RmlsbCA+IHJ1bGVzLm1heEZpbGwpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZmlsbF9leGNlZWRlZCcsXG4gICAgICBgZmlsbCAke3N0YXRzLm1heEZpbGx9IG0gZXhjZWVkcyAke3J1bGVzLm1heEZpbGx9IG1gLFxuICAgICAgc3RhdHMubWF4RmlsbCwgcnVsZXMubWF4RmlsbCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMuY3V0Vm9sdW1lID4gcnVsZXMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2N1dF92b2x1bWVfZXhjZWVkZWQnLFxuICAgICAgYGN1dCB2b2x1bWUgJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEN1dFZvbHVtZX0gbVx1MDBCM2AsXG4gICAgICBzdGF0cy5jdXRWb2x1bWUsIHJ1bGVzLm1heEN1dFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMuZmlsbFZvbHVtZSA+IHJ1bGVzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZmlsbF92b2x1bWVfZXhjZWVkZWQnLFxuICAgICAgYGZpbGwgdm9sdW1lICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4RmlsbFZvbHVtZX0gbVx1MDBCM2AsXG4gICAgICBzdGF0cy5maWxsVm9sdW1lLCBydWxlcy5tYXhGaWxsVm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChydWxlcy5yZXF1aXJlc0RyeSAmJiBzdGF0cy53YXRlckNvbHVtbnMgPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3dhdGVyJyxcbiAgICAgIGAke3N0YXRzLndhdGVyQ29sdW1uc30gZm9vdHByaW50IGNvbHVtbnMgYXJlIHVuZGVyd2F0ZXJgLFxuICAgICAgc3RhdHMud2F0ZXJDb2x1bW5zLCAwLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoID4gcnVsZXMubWF4T2JzdHJ1Y3Rpb25zKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2Zvb3RwcmludF9vYnN0cnVjdGVkJyxcbiAgICAgIGAke3N0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyBleGNlZWQgdGhlICR7cnVsZXMubWF4T2JzdHJ1Y3Rpb25zfSBhbGxvd2FuY2VgLFxuICAgICAgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCwgcnVsZXMubWF4T2JzdHJ1Y3Rpb25zLFxuICAgICkpO1xuICB9XG4gIGlmIChmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnb3ZlcmhhbmcnLFxuICAgICAgYCR7ZnAub3ZlcmhhbmdDZWxscy5sZW5ndGh9IGNlbGxzIGFib3ZlIHRoZSBmbG9vciBhcmUgYmxvY2tlZGAsXG4gICAgICBmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aCwgMCxcbiAgICApKTtcbiAgfVxuXG4gIGNvbnN0IG5lZWRzR3JhZGluZyA9IHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZk5vUHJlcFxuICAgIHx8IHN0YXRzLmN1dFZvbHVtZSA+IDAgfHwgc3RhdHMuZmlsbFZvbHVtZSA+IDA7XG4gIGNvbnN0IG5lZWRzQ2xlYXJpbmcgPSBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoID4gMFxuICAgICYmIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPD0gcnVsZXMubWF4T2JzdHJ1Y3Rpb25zO1xuXG4gIGlmIChuZWVkc0dyYWRpbmcpIHtcbiAgICByZWFzb25zLnB1c2gocHJlcChcbiAgICAgICduZWVkc19ncmFkaW5nJyxcbiAgICAgIGBncmFkaW5nIHJlcXVpcmVkOiAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBjdXQsICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBmaWxsYCxcbiAgICAgIHN0YXRzLmN1dFZvbHVtZSArIHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKG5lZWRzQ2xlYXJpbmcpIHtcbiAgICByZWFzb25zLnB1c2gocHJlcChcbiAgICAgICduZWVkc19jbGVhcmluZycsXG4gICAgICBgJHtzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgdG8gY2xlYXJgLFxuICAgICAgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCwgcnVsZXMubWF4T2JzdHJ1Y3Rpb25zLFxuICAgICkpO1xuICB9XG5cbiAgY29uc3QgaGFzRXJyb3IgPSByZWFzb25zLnNvbWUoKHIpID0+IHIuc2V2ZXJpdHkgPT09ICdlcnJvcicpO1xuICBjb25zdCBoYXNQcmVwID0gcmVhc29ucy5zb21lKChyKSA9PiByLnNldmVyaXR5ID09PSAncHJlcGFyYXRpb24nKTtcbiAgY29uc3Qgc3RhdGU6IFNpdGVTdGF0ZSA9IGhhc0Vycm9yID8gJ2ludmFsaWQnIDogaGFzUHJlcCA/ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJyA6ICd2YWxpZCc7XG5cbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICBzdGF0ZSxcbiAgICByZWFzb25zLFxuICAgIHF1ZXJ5OiBmcCxcbiAgICBwcmVwYXJhdGlvbjoge1xuICAgICAgbmVlZHNHcmFkaW5nLFxuICAgICAgbmVlZHNDbGVhcmluZyxcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICAgIG9ic3RydWN0aW9uSWRzOiBzdGF0cy5vYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSxcbiAgICAgIGZvdW5kYXRpb246IHJ1bGVzLmZvdW5kYXRpb24sXG4gICAgfSxcbiAgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBjYW5kaWRhdGUgc2VhcmNoIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU2VhcmNoT3B0aW9ucyB7XG4gIC8qKiBDYW5kaWRhdGUgZ3JpZCBzdGVwIGluIG1ldHJlcy4gRGVmYXVsdCAyLiAqL1xuICBzdGVwPzogbnVtYmVyO1xuICBtYXhSZXN1bHRzPzogbnVtYmVyO1xuICBhbmNob3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIG1heERpc3RhbmNlPzogbnVtYmVyO1xuICAvKiogSGFyZCBjb25zdHJhaW50OiBjYW5kaWRhdGUgY2VudHJlIG11c3QgbGllIHdpdGhpbiB0aGlzIHJhZGl1cyBvZiBhIHBvaW50LiAqL1xuICBuZWFyPzogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgbWF4RGlzdGFuY2U6IG51bWJlciB9O1xuICAvKiogRG8gbm90IHJldHVybiB0d28gY2FuZGlkYXRlcyB3aG9zZSBmb290cHJpbnRzIG92ZXJsYXAuIERlZmF1bHQgdHJ1ZS4gKi9cbiAgZGlzdGluY3Q/OiBib29sZWFuO1xuICAvKiogV2FsbC1jbG9jayBidWRnZXQgZm9yIHRoZSBzY2FuLiBEZWZhdWx0IDEwMCBtcy4gKi9cbiAgYnVkZ2V0TXM/OiBudW1iZXI7XG4gIHdhbGs/OiBXYWxrUGFyYW1zO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVDYW5kaWRhdGUge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHN0YXRlOiAndmFsaWQnIHwgJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nO1xuICB2YWxpZGF0aW9uOiBTaXRlVmFsaWRhdGlvbjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25Db3VudDogbnVtYmVyO1xuICBkaXN0YW5jZTogbnVtYmVyO1xuICBzY29yZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVTZWFyY2hSZXN1bHQge1xuICBjYW5kaWRhdGVzOiBTaXRlQ2FuZGlkYXRlW107XG4gIGV2YWx1YXRlZDogbnVtYmVyO1xuICByZWplY3RlZDogbnVtYmVyO1xuICBlbGFwc2VkTXM6IG51bWJlcjtcbiAgYnVkZ2V0TXM6IG51bWJlcjtcbiAgLyoqIFRydWUgd2hlbiB0aGUgd2FsbC1jbG9jayBidWRnZXQgc3RvcHBlZCB0aGUgc2NhbiBiZWZvcmUgdGhlIGFyZWEgd2FzIGV4aGF1c3RlZC4gKi9cbiAgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBmbG9vckNhbmRpZGF0ZXMoc3RhdHM6IEFyZWFTdGF0cyk6IG51bWJlcltdIHtcbiAgY29uc3QgbWVhbiA9IE1hdGgucm91bmQoc3RhdHMubWVhblkpO1xuICBjb25zdCBzZXQgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgZm9yIChsZXQgZCA9IC0xOyBkIDw9IDE7IGQrKykgc2V0LmFkZChtZWFuICsgZCk7XG4gIHNldC5hZGQoc3RhdHMubWluWSk7XG4gIHNldC5hZGQoc3RhdHMubWF4WSk7XG4gIHJldHVybiBbLi4uc2V0XS5maWx0ZXIoKHkpID0+IHkgPj0gWV9NSU4gJiYgeSA8IFlfTUFYKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG59XG5cbmZ1bmN0aW9uIG92ZXJsYXBzKGE6IFJlY3QsIGI6IFJlY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIGEueDAgPD0gYi54MSAmJiBhLngxID49IGIueDAgJiYgYS56MCA8PSBiLnoxICYmIGEuejEgPj0gYi56MDtcbn1cblxuZnVuY3Rpb24gY2FuZGlkYXRlU2NvcmUodjogU2l0ZVZhbGlkYXRpb24sIGRpc3RhbmNlOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBwcmVwUGVuYWx0eSA9IHYuc3RhdGUgPT09ICd2YWxpZCcgPyAwIDogMjU7XG4gIGNvbnN0IGdyYWRpbmcgPSB2LnByZXBhcmF0aW9uLmN1dFZvbHVtZSArIHYucHJlcGFyYXRpb24uZmlsbFZvbHVtZTtcbiAgY29uc3QgY2xlYXJpbmcgPSB2LnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzLmxlbmd0aCAqIDQ7XG4gIHJldHVybiBwcmVwUGVuYWx0eSArIGdyYWRpbmcgKyBjbGVhcmluZyArIGRpc3RhbmNlICogMC4yNTtcbn1cblxuLyoqXG4gKiBTZWFyY2ggYSBib3VuZGVkIGFyZWEgZm9yIHZpYWJsZSBmb290cHJpbnRzLiBUaGUgc2FtZSB2YWxpZGF0b3IgYW5kIHRoZSBzYW1lXG4gKiBmbG9vci1zZWxlY3Rpb24gcG9saWN5IGFyZSB1c2VkIGJ5IHRoZSBBSSBhZ2VudCBhbmQgdGhlIHBsYXllcidzIGJ1aWxkXG4gKiBwcmV2aWV3LiBTZWFyY2ggaXMgcmVhZC1vbmx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2VhcmNoU2l0ZXMoXG4gIHdvcmxkOiBXb3JsZCwgcnVsZXM6IEJ1aWxkaW5nUnVsZXMsIGFyZWE6IFJlY3QsIG9wdGlvbnM6IFNlYXJjaE9wdGlvbnMgPSB7fSxcbik6IFNpdGVTZWFyY2hSZXN1bHQge1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBzdGVwID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihvcHRpb25zLnN0ZXAgPz8gMikpO1xuICBjb25zdCBtYXhSZXN1bHRzID0gTWF0aC5tYXgoMSwgb3B0aW9ucy5tYXhSZXN1bHRzID8/IDgpO1xuICBjb25zdCBkaXN0aW5jdCA9IG9wdGlvbnMuZGlzdGluY3QgIT09IGZhbHNlO1xuICBjb25zdCBtYXhEaXN0YW5jZSA9IG9wdGlvbnMubWF4RGlzdGFuY2UgPz8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICBjb25zdCBidWRnZXRNcyA9IG9wdGlvbnMuYnVkZ2V0TXMgPz8gMTAwO1xuICBjb25zdCBhbmNob3IgPSBvcHRpb25zLmFuY2hvciA/PyB7IHg6IChhcmVhLngwICsgYXJlYS54MSkgLyAyLCB6OiAoYXJlYS56MCArIGFyZWEuejEpIC8gMiB9O1xuICBjb25zdCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpO1xuICBjb25zdCBhbGw6IFNpdGVDYW5kaWRhdGVbXSA9IFtdO1xuICBsZXQgZXZhbHVhdGVkID0gMDtcbiAgbGV0IHJlamVjdGVkID0gMDtcbiAgbGV0IHRydW5jYXRlZCA9IGZhbHNlO1xuXG4gIGNvbnN0IHgxTWF4ID0gYXJlYS54MSAtIHJ1bGVzLndpZHRoICsgMTtcbiAgY29uc3QgejFNYXggPSBhcmVhLnoxIC0gcnVsZXMuZGVwdGggKyAxO1xuICBzY2FuOiBmb3IgKGxldCB6ID0gYXJlYS56MDsgeiA8PSB6MU1heDsgeiArPSBzdGVwKSB7XG4gICAgZm9yIChsZXQgeCA9IGFyZWEueDA7IHggPD0geDFNYXg7IHggKz0gc3RlcCkge1xuICAgICAgY29uc3QgcmVjdCA9IHsgeDA6IHgsIHowOiB6LCB4MTogeCArIHJ1bGVzLndpZHRoIC0gMSwgejE6IHogKyBydWxlcy5kZXB0aCAtIDEgfTtcbiAgICAgIGNvbnN0IGN4ID0gKHJlY3QueDAgKyByZWN0LngxKSAvIDI7XG4gICAgICBjb25zdCBjeiA9IChyZWN0LnowICsgcmVjdC56MSkgLyAyO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLmh5cG90KGN4IC0gYW5jaG9yLngsIGN6IC0gYW5jaG9yLnopO1xuICAgICAgaWYgKGRpc3RhbmNlID4gbWF4RGlzdGFuY2UpIGNvbnRpbnVlO1xuICAgICAgaWYgKG9wdGlvbnMubmVhcikge1xuICAgICAgICBjb25zdCBuZWFyRGlzdGFuY2UgPSBNYXRoLmh5cG90KGN4IC0gb3B0aW9ucy5uZWFyLngsIGN6IC0gb3B0aW9ucy5uZWFyLnopO1xuICAgICAgICBpZiAobmVhckRpc3RhbmNlID4gb3B0aW9ucy5uZWFyLm1heERpc3RhbmNlKSBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RhdHMgPSBxdWVyeS5hcmVhKHJlY3QpO1xuICAgICAgbGV0IGJlc3Q6IFNpdGVDYW5kaWRhdGUgfCBudWxsID0gbnVsbDtcbiAgICAgIGZvciAoY29uc3QgZmxvb3JZIG9mIGZsb29yQ2FuZGlkYXRlcyhzdGF0cykpIHtcbiAgICAgICAgZXZhbHVhdGVkKys7XG4gICAgICAgIGNvbnN0IHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwgPSB7XG4gICAgICAgICAgc2l0ZUlkOiBgJHtydWxlcy5pZH06JHt4fSwke3p9LCR7Zmxvb3JZfWAsXG4gICAgICAgICAgcmVjdCwgZmxvb3JZLCBydWxlcyxcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgZm9vdHByaW50ID0gcXVlcnkuZm9vdHByaW50KHJlY3QsIGZsb29yWSk7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsLCBxdWVyeSwgZm9vdHByaW50KTtcbiAgICAgICAgaWYgKHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJykge1xuICAgICAgICAgIHJlamVjdGVkKys7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2NvcmUgPSBjYW5kaWRhdGVTY29yZSh2YWxpZGF0aW9uLCBkaXN0YW5jZSk7XG4gICAgICAgIGNvbnN0IGNhbmRpZGF0ZTogU2l0ZUNhbmRpZGF0ZSA9IHtcbiAgICAgICAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICAgICAgICByZWN0LFxuICAgICAgICAgIGZsb29yWSxcbiAgICAgICAgICBzdGF0ZTogdmFsaWRhdGlvbi5zdGF0ZSxcbiAgICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgICAgIGN1dFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUsXG4gICAgICAgICAgZmlsbFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lLFxuICAgICAgICAgIG9ic3RydWN0aW9uQ291bnQ6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHMubGVuZ3RoLFxuICAgICAgICAgIGRpc3RhbmNlLFxuICAgICAgICAgIHNjb3JlLFxuICAgICAgICB9O1xuICAgICAgICBpZiAoIWJlc3RcbiAgICAgICAgICB8fCAoY2FuZGlkYXRlLnN0YXRlID09PSAndmFsaWQnICYmIGJlc3Quc3RhdGUgIT09ICd2YWxpZCcpXG4gICAgICAgICAgfHwgKGNhbmRpZGF0ZS5zdGF0ZSA9PT0gYmVzdC5zdGF0ZSAmJiBjYW5kaWRhdGUuc2NvcmUgPCBiZXN0LnNjb3JlKSkge1xuICAgICAgICAgIGJlc3QgPSBjYW5kaWRhdGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChiZXN0KSBhbGwucHVzaChiZXN0KTtcbiAgICB9XG4gICAgaWYgKHBlcmZvcm1hbmNlLm5vdygpIC0gdDAgPiBidWRnZXRNcykge1xuICAgICAgdHJ1bmNhdGVkID0gdHJ1ZTtcbiAgICAgIGJyZWFrIHNjYW47XG4gICAgfVxuICB9XG5cbiAgYWxsLnNvcnQoKGEsIGIpID0+IGEuc2NvcmUgLSBiLnNjb3JlIHx8IGEuZGlzdGFuY2UgLSBiLmRpc3RhbmNlXG4gICAgfHwgYS5yZWN0LngwIC0gYi5yZWN0LngwIHx8IGEucmVjdC56MCAtIGIucmVjdC56MCk7XG4gIGNvbnN0IHNlbGVjdGVkOiBTaXRlQ2FuZGlkYXRlW10gPSBbXTtcbiAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgYWxsKSB7XG4gICAgaWYgKGRpc3RpbmN0ICYmIHNlbGVjdGVkLnNvbWUoKHMpID0+IG92ZXJsYXBzKHMucmVjdCwgY2FuZGlkYXRlLnJlY3QpKSkgY29udGludWU7XG4gICAgc2VsZWN0ZWQucHVzaChjYW5kaWRhdGUpO1xuICAgIGlmIChzZWxlY3RlZC5sZW5ndGggPj0gbWF4UmVzdWx0cykgYnJlYWs7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNhbmRpZGF0ZXM6IHNlbGVjdGVkLFxuICAgIGV2YWx1YXRlZCxcbiAgICByZWplY3RlZCxcbiAgICBlbGFwc2VkTXM6IE1hdGgucm91bmQoKHBlcmZvcm1hbmNlLm5vdygpIC0gdDApICogMTAwKSAvIDEwMCxcbiAgICBidWRnZXRNcyxcbiAgICB0cnVuY2F0ZWQsXG4gIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gcHJldmlldyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIEZvdW5kYXRpb25QcmV2aWV3IHtcbiAgdHlwZTogRm91bmRhdGlvblR5cGU7XG4gIC8qKiBTdG9uZSBmbG9vciBzbGFiIHBsdXMgZmlsbCB1bmRlciB0aGUgcHJlcGFyZWQgZmxvb3IuICovXG4gIHBsaW50aENlbGxzOiBudW1iZXI7XG4gIC8qKiBQZXJpbWV0ZXIgY2VsbHMgdGhhdCBuZWVkIGEgcmV0YWluaW5nIGZhY2UgYmVjYXVzZSBvZiBjdXQgb3IgZmlsbC4gKi9cbiAgcmV0YWluaW5nV2FsbENlbGxzOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQWNjZXNzUHJldmlldyB7XG4gIGRvb3I6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgZGlzdGFuY2U6IG51bWJlcjtcbiAgZ3JhZGU6IG51bWJlcjtcbiAgd2Fsa2FibGU6IGJvb2xlYW47XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVQcmV2aWV3IHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHN0YXRlOiBTaXRlU3RhdGU7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbiAgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdO1xuICB0ZXJyYWluOiB7XG4gICAgbWluWTogbnVtYmVyO1xuICAgIG1heFk6IG51bWJlcjtcbiAgICBtZWFuWTogbnVtYmVyO1xuICAgIHJlbGllZjogbnVtYmVyO1xuICAgIG1heFN0ZXA6IG51bWJlcjtcbiAgICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gICAgbWF4Q3V0OiBudW1iZXI7XG4gICAgbWF4RmlsbDogbnVtYmVyO1xuICB9O1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uUHJldmlldztcbiAgb2JzdHJ1Y3Rpb25zOiBBcnJheTx7XG4gICAgZW50aXR5SWQ6IHN0cmluZztcbiAgICBraW5kOiBzdHJpbmc7XG4gICAgeDogbnVtYmVyO1xuICAgIHo6IG51bWJlcjtcbiAgICBhY3Rpb246ICdjbGVhcicgfCAnYmxvY2tlZCc7XG4gIH0+O1xuICBhY2Nlc3M6IEFjY2Vzc1ByZXZpZXcgfCBudWxsO1xuICAvKiogQ29tcGxldGUgd29yayBlbnZlbG9wZSB0aGlzIHByZXZpZXcgd291bGQgYXV0aG9yaXplLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmV2aWV3T3B0aW9ucyB7XG4gIGRvb3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICB3YWxrPzogV2Fsa1BhcmFtcztcbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUgdGhyZWUtc3RhdGUgcHJldmlldy4gSXQgaXMgZGVsaWJlcmF0ZWx5IGRhdGEtb25seTogdGhlIHJlbmRlcmVyXG4gKiBjYW4gZHJhdyBpdCwgYnV0IGl0IG5ldmVyIGVkaXRzIHRlcnJhaW4gb3Igc3BlbmRzIHJlc291cmNlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXZpZXdTaXRlKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIG9wdGlvbnM6IFByZXZpZXdPcHRpb25zID0ge30sXG4pOiBTaXRlUHJldmlldyB7XG4gIGNvbnN0IHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCk7XG4gIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsLCBxdWVyeSk7XG4gIGNvbnN0IGZwID0gdmFsaWRhdGlvbi5xdWVyeTtcbiAgY29uc3Qgc3RhdHMgPSBmcC5zdGF0cztcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHJ1bGVzID0gcHJvcG9zYWwucnVsZXM7XG5cbiAgbGV0IHBlcmltZXRlciA9IDA7XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgICAgaWYgKHggIT09IHJlY3QueDAgJiYgeCAhPT0gcmVjdC54MSAmJiB6ICE9PSByZWN0LnowICYmIHogIT09IHJlY3QuejEpIGNvbnRpbnVlO1xuICAgICAgaWYgKGNvbHVtbkF0KHdvcmxkLCB4LCB6KS5zdXJmYWNlWSAhPT0gcHJvcG9zYWwuZmxvb3JZKSBwZXJpbWV0ZXIrKztcbiAgICB9XG4gIH1cbiAgY29uc3QgZm91bmRhdGlvbjogRm91bmRhdGlvblByZXZpZXcgPSB7XG4gICAgdHlwZTogcnVsZXMuZm91bmRhdGlvbixcbiAgICBwbGludGhDZWxsczogcmVjdENvbHVtbnMocmVjdCkgKyBzdGF0cy5maWxsVm9sdW1lLFxuICAgIHJldGFpbmluZ1dhbGxDZWxsczogcGVyaW1ldGVyLFxuICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gIH07XG5cbiAgbGV0IGFjY2VzczogQWNjZXNzUHJldmlldyB8IG51bGwgPSBudWxsO1xuICBpZiAob3B0aW9ucy5kb29yICYmIG9wdGlvbnMuYXBwcm9hY2gpIHtcbiAgICBjb25zdCBkb29yID0gb3B0aW9ucy5kb29yO1xuICAgIGNvbnN0IGFwcHJvYWNoID0gb3B0aW9ucy5hcHByb2FjaDtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5oeXBvdChkb29yLnggLSBhcHByb2FjaC54LCBkb29yLnogLSBhcHByb2FjaC56KTtcbiAgICBjb25zdCBzdGVwcyA9IE1hdGgubWF4KDEsIE1hdGguY2VpbChkaXN0YW5jZSkpO1xuICAgIGxldCBwcmV2WCA9IGFwcHJvYWNoLngsIHByZXZaID0gYXBwcm9hY2guejtcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBzdGVwczsgaSsrKSB7XG4gICAgICBjb25zdCB0ID0gaSAvIHN0ZXBzO1xuICAgICAgY29uc3QgeCA9IE1hdGgucm91bmQoYXBwcm9hY2gueCArIChkb29yLnggLSBhcHByb2FjaC54KSAqIHQpO1xuICAgICAgY29uc3QgeiA9IE1hdGgucm91bmQoYXBwcm9hY2gueiArIChkb29yLnogLSBhcHByb2FjaC56KSAqIHQpO1xuICAgICAgaWYgKHggPT09IHByZXZYICYmIHogPT09IHByZXZaKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHdhbGtTdGVwKHdvcmxkLCBwcmV2WCwgcHJldlosIHgsIHosIG9wdGlvbnMud2FsayA/PyBERUZBVUxUX1dBTEspO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJlYXNvbnMucHVzaChgJHtyZXN1bHQucmVhc29ufSBhdCAke3h9LCR7en1gKTtcbiAgICAgIHByZXZYID0geDsgcHJldlogPSB6O1xuICAgIH1cbiAgICBhY2Nlc3MgPSB7XG4gICAgICBkb29yLCBhcHByb2FjaCwgZGlzdGFuY2UsXG4gICAgICBncmFkZTogZWZmZWN0aXZlR3JhZGUod29ybGQsIGFwcHJvYWNoLngsIGFwcHJvYWNoLnosIGRvb3IueCwgZG9vci56KSxcbiAgICAgIHdhbGthYmxlOiByZWFzb25zLmxlbmd0aCA9PT0gMCxcbiAgICAgIHJlYXNvbnMsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHkwID0gcHJvcG9zYWwuZmxvb3JZIC0gTWF0aC5tYXgoMSwgc3RhdHMubWF4Q3V0KSAtIDE7XG4gIGNvbnN0IHkxID0gcHJvcG9zYWwuZmxvb3JZICsgTWF0aC5tYXgocnVsZXMud2FsbEhlaWdodCwgMSkgKyAxO1xuICBjb25zdCBlbnZlbG9wZTogVm94ZWxSZWdpb25bXSA9IFtcbiAgICB7XG4gICAgICAuLi5leHBhbmRSZWN0KHJlY3QsIDIpLFxuICAgICAgeTA6IE1hdGgubWF4KFlfTUlOLCB5MCksXG4gICAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCB5MSksXG4gICAgfSxcbiAgXTtcbiAgaWYgKGFjY2Vzcykge1xuICAgIGNvbnN0IGF4MCA9IE1hdGgubWluKGFjY2Vzcy5kb29yLngsIGFjY2Vzcy5hcHByb2FjaC54KSAtIDE7XG4gICAgY29uc3QgYXgxID0gTWF0aC5tYXgoYWNjZXNzLmRvb3IueCwgYWNjZXNzLmFwcHJvYWNoLngpICsgMTtcbiAgICBjb25zdCBhejAgPSBNYXRoLm1pbihhY2Nlc3MuZG9vci56LCBhY2Nlc3MuYXBwcm9hY2gueikgLSAxO1xuICAgIGNvbnN0IGF6MSA9IE1hdGgubWF4KGFjY2Vzcy5kb29yLnosIGFjY2Vzcy5hcHByb2FjaC56KSArIDE7XG4gICAgY29uc3QgYU1pbiA9IE1hdGgubWluKHN1cmZhY2VBdCh3b3JsZCwgYXgwLCBhejApLCBzdXJmYWNlQXQod29ybGQsIGF4MSwgYXoxKSk7XG4gICAgY29uc3QgYU1heCA9IE1hdGgubWF4KHN1cmZhY2VBdCh3b3JsZCwgYXgwLCBhejApLCBzdXJmYWNlQXQod29ybGQsIGF4MSwgYXoxKSk7XG4gICAgZW52ZWxvcGUucHVzaCh7XG4gICAgICB4MDogYXgwLCB4MTogYXgxLCB6MDogYXowLCB6MTogYXoxLFxuICAgICAgeTA6IE1hdGgubWF4KFlfTUlOLCBhTWluIC0gMiksXG4gICAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBhTWF4ICsgMiksXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHN0YXRlOiB2YWxpZGF0aW9uLnN0YXRlLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgcnVsZXMsXG4gICAgcmVhc29uczogdmFsaWRhdGlvbi5yZWFzb25zLFxuICAgIHRlcnJhaW46IHtcbiAgICAgIG1pblk6IHN0YXRzLm1pblksXG4gICAgICBtYXhZOiBzdGF0cy5tYXhZLFxuICAgICAgbWVhblk6IHN0YXRzLm1lYW5ZLFxuICAgICAgcmVsaWVmOiBzdGF0cy5yZWxpZWYsXG4gICAgICBtYXhTdGVwOiBzdGF0cy5tYXhTdGVwLFxuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgIH0sXG4gICAgZm91bmRhdGlvbixcbiAgICBvYnN0cnVjdGlvbnM6IHN0YXRzLm9ic3RydWN0aW9ucy5tYXAoKG8pID0+ICh7XG4gICAgICBlbnRpdHlJZDogby5lbnRpdHlJZCxcbiAgICAgIGtpbmQ6IG8ua2luZCxcbiAgICAgIHg6IG8ueCxcbiAgICAgIHo6IG8ueixcbiAgICAgIGFjdGlvbjogdmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnID8gJ2Jsb2NrZWQnIDogJ2NsZWFyJyxcbiAgICB9KSksXG4gICAgYWNjZXNzLFxuICAgIGVudmVsb3BlLFxuICB9O1xufVxuXG4iLCAiLy8gTTAwMiBzdGFnZSAzOiBib3VuZGVkLCBhdXRob3JpemVkIHRlcnJhaW4gcHJlcGFyYXRpb24uXG4vL1xuLy8gVGhlIHBpcGVsaW5lIGlzIGRlbGliZXJhdGVseSBvbmUtd2F5IGFuZCBzaGFyZWQgYnkgdGhlIHBsYXllciBhbmQgdGhlIEFJOlxuLy9cbi8vICAgcHJvcG9zYWwgLT4gdmFsaWRhdGVTaXRlIC0+IHBsYW5QcmVwYXJhdGlvbiAtPiBBdXRob3JpemVyIC0+IGV4ZWN1dGVcbi8vXG4vLyBgZXhlY3V0ZVByZXBhcmF0aW9uYCBpcyB0aGUgb25seSBmdW5jdGlvbiBpbiBNMDAyIHRoYXQgZWRpdHMgdGVycmFpbiBmb3Jcbi8vIGNvbnN0cnVjdGlvbi4gSXQgcmVmdXNlcyB0byBydW4gd2l0aG91dCBhbiBhdXRob3JpemF0aW9uIHRva2VuIHdob3NlIGRpZ2VzdFxuLy8gbWF0Y2hlcyB0aGUgcGxhbiwgd2hvc2UgZW52ZWxvcGUgY292ZXJzIGV2ZXJ5IHZveGVsIGl0IHdvdWxkIHRvdWNoLCBhbmQgd2hvc2Vcbi8vIGJhc2UgcmV2aXNpb24gc3RpbGwgbWF0Y2hlcyB0aGUgd29ybGQuIEFsbCBlZGl0cyBhcmUgY29tcHV0ZWQgYW5kIGNoZWNrZWRcbi8vIGJlZm9yZSB0aGUgZmlyc3QgYnl0ZSBpcyB3cml0dGVuLCBzbyBhIHJlamVjdGVkIHBsYW4gY2Fubm90IGxlYXZlIGEgcGFydGlhbFxuLy8gcGFkIGJlaGluZC5cbi8vXG4vLyBUaGUgYXV0aG9yaXplciBpbiB0aGlzIGZpbGUgaXMgYSBsb2NhbCBwb2xpY3kgc3R1Yi4gSXQgcHJvdmVzIHRoYXQgdGhlXG4vLyBwaXBlbGluZSBhbmQgdGhlIGVudmVsb3BlIGNoZWNrcyBleGlzdDsgaXQgaXMgTk9UIE1hZ2ljQmxvY2sgZW5mb3JjZW1lbnQuXG4vLyBObyBjaGFpbiBwcm9ncmFtLCBTREsgY2FsbCwgc2V0dGxlbWVudCBvciByb2xsYmFjayBndWFyYW50ZWUgaXMgcHJlc2VudC5cbmltcG9ydCB7XG4gIFdvcmxkLCBNQVQsIE1hdElkLCBZX01JTiwgWV9NQVgsIEhBTEYsIGlzU29saWQsXG4gIGdldFZveGVsLCBzZXRWb3hlbCwgcmVtb3ZlRW50aXR5LCBzdXJmYWNlQXQsXG4gIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBFbnRpdHlLaW5kLCBSZXNvdXJjZVR5cGUsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIG5vcm1hbGl6ZVJlY3QsIHJlY3RDb2x1bW5zLCBleHBhbmRSZWN0LFxuICBlbnZlbG9wZUNvbnRhaW5zLCBvYnN0cnVjdGlvbnNJbixcbn0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7XG4gIFNpdGVQcm9wb3NhbCwgU2l0ZVZhbGlkYXRpb24sIEJ1aWxkaW5nUnVsZXMsIHZhbGlkYXRlU2l0ZSxcbn0gZnJvbSAnLi9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHtcbiAgaW52ZW50b3J5U25hcHNob3QsIG5vcm1hbGl6ZUVudmVsb3BlLFxufSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBMT0NBTF9BVVRIT1JJVFkgPSAnbG9jYWwtc3R1YicgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgTE9DQUxfRU5GT1JDRU1FTlQgPSAnbG9jYWwtc2ltdWxhdGlvbi1vbmx5JyBhcyBjb25zdDtcblxuZXhwb3J0IGludGVyZmFjZSBDb2x1bW5UYXJnZXQge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBsYW5FeHBlY3RhdGlvbiB7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uczogbnVtYmVyO1xuICBzdXJmYWNlRWRpdHM6IG51bWJlcjtcbiAgdG90YWxFZGl0czogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uUGxhbiB7XG4gIGlkOiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIC8qKiBFeGFjdGx5IG9uZSB0YXJnZXQgd2Fsa2luZyBoZWlnaHQgcGVyIGZvb3RwcmludCBjb2x1bW4sIHNvcnRlZCBieSB6LCB4LiAqL1xuICB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXTtcbiAgLyoqIEF1dGhvcml0YXRpdmUgZW50aXR5IGlkcyB0aGlzIHBsYW4gbWF5IHJlbW92ZS4gKi9cbiAgY2xlYXJFbnRpdHlJZHM6IHN0cmluZ1tdO1xuICAvKiogTWF0ZXJpYWwgZm9yIHRoZSB0b3Agc29saWQgdm94ZWwgYWZ0ZXIgZ3JhZGluZywgb3IgbnVsbCB0byBrZWVwIGl0LiAqL1xuICBzdXJmYWNlTWF0ZXJpYWw6IE1hdElkIHwgbnVsbDtcbiAgLyoqIFRpZ2h0IGVudmVsb3BlIGNvdmVyaW5nIGV2ZXJ5IHBsYW5uZWQgdm94ZWwgY2hhbmdlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgZXhwZWN0ZWQ6IFBsYW5FeHBlY3RhdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbk9wdGlvbnMge1xuICAvKiogUGVyLWNvbHVtbiB0YXJnZXRzIGZvciB0ZXJyYWNlcyBvciBzdGVwcGVkIHBhdGhzLiBEZWZhdWx0cyB0byBmbG9vclkuICovXG4gIHRhcmdldHM/OiBDb2x1bW5UYXJnZXRbXTtcbiAgLyoqIGBub25lYCBpcyBvbmx5IGxlZ2FsIHdoZW4gdGhlIHNpdGUgaGFzIG5vIG9ic3RydWN0aW9ucy4gKi9cbiAgY2xlYXI/OiAnb2JzdHJ1Y3Rpb25zJyB8ICdub25lJztcbiAgLyoqIFNldCB0aGUgdG9wIHNvbGlkIHZveGVsIG9mIGV2ZXJ5IHRhcmdldCBjb2x1bW4gKHBhdGhzLCBmaWVsZHMpLiAqL1xuICBzdXJmYWNlTWF0ZXJpYWw/OiBNYXRJZDtcbiAgLyoqIEV4cGxpY2l0IHdvcmsgZW52ZWxvcGUuIERlZmF1bHRzIHRvIGEgdGlnaHQgZW52ZWxvcGUgYXJvdW5kIHRoZSBlZGl0cy4gKi9cbiAgZW52ZWxvcGU/OiBWb3hlbFJlZ2lvbltdO1xufVxuXG4vLyAtLS0tLS0tLS0tIHN0YWJsZSBkaWdlc3QgLS0tLS0tLS0tLVxuZnVuY3Rpb24gZGlnZXN0KGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzU7XG4gIGxldCBiID0gMHg5ZTM3NzliOTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbnB1dC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGMgPSBpbnB1dC5jaGFyQ29kZUF0KGkpO1xuICAgIGEgPSBNYXRoLmltdWwoYSBeIGMsIDB4MDEwMDAxOTMpO1xuICAgIGIgPSBNYXRoLmltdWwoYiBeIChjICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIGIgXj0gYiA+Pj4gMTM7XG4gIH1cbiAgcmV0dXJuIChhID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICsgKGIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG4vKiogRGlnZXN0IG9mIGV2ZXJ5dGhpbmcgdGhhdCBjaGFuZ2VzIHRoZSBzZXQgb2YgZWRpdHMgb3IgcmVtb3ZhbHMuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhbkRpZ2VzdChwbGFuOiBQcmVwYXJhdGlvblBsYW4pOiBzdHJpbmcge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXG4gICAgJ20wMDI6cHJlcC1wbGFuOnYxJyxcbiAgICBwbGFuLnNpdGVJZCxcbiAgICBgJHtwbGFuLnJlY3QueDB9LCR7cGxhbi5yZWN0LnowfSwke3BsYW4ucmVjdC54MX0sJHtwbGFuLnJlY3QuejF9YCxcbiAgICBTdHJpbmcocGxhbi5mbG9vclkpLFxuICAgIHBsYW4ucnVsZXMuaWQsXG4gICAgU3RyaW5nKHBsYW4udGFyZ2V0cy5sZW5ndGgpLFxuICAgIHBsYW4uc3VyZmFjZU1hdGVyaWFsID09PSBudWxsID8gJ3N1cmZhY2U6a2VlcCcgOiBgc3VyZmFjZToke3BsYW4uc3VyZmFjZU1hdGVyaWFsfWAsXG4gIF07XG4gIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIGxpbmVzLnB1c2goYHQ6JHt0Lnh9LCR7dC56fSwke3QueX1gKTtcbiAgY29uc3QgY2xlYXJzID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgbGluZXMucHVzaChgYzoke2NsZWFycy5sZW5ndGh9YCk7XG4gIGZvciAoY29uc3QgaWQgb2YgY2xlYXJzKSBsaW5lcy5wdXNoKGBjOiR7aWR9YCk7XG4gIGZvciAoY29uc3QgZSBvZiBub3JtYWxpemVFbnZlbG9wZShwbGFuLmVudmVsb3BlKSkge1xuICAgIGxpbmVzLnB1c2goYGU6JHtlLngwfSwke2UuejB9LCR7ZS55MH0sJHtlLngxfSwke2UuejF9LCR7ZS55MX1gKTtcbiAgfVxuICBjb25zdCB4ID0gcGxhbi5leHBlY3RlZDtcbiAgbGluZXMucHVzaChgeDoke3guY3V0Vm9sdW1lfSwke3guZmlsbFZvbHVtZX0sJHt4Lm1heEN1dH0sJHt4Lm1heEZpbGx9LCR7eC5vYnN0cnVjdGlvbnN9LCR7eC5zdXJmYWNlRWRpdHN9LCR7eC50b3RhbEVkaXRzfWApO1xuICByZXR1cm4gZGlnZXN0KGxpbmVzLmpvaW4oJ1xcbicpKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwbGFubmluZyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFBsYW5TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFByZXBhcmF0aW9uUGxhbjtcbiAgdmFsaWRhdGlvbjogU2l0ZVZhbGlkYXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25GYWlsdXJlIHtcbiAgb2s6IGZhbHNlO1xuICBzdGFnZTogJ3BsYW4nIHwgJ2F1dGhvcml6ZScgfCAnZXhlY3V0ZSc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG4gIHZhbGlkYXRpb24/OiBTaXRlVmFsaWRhdGlvbjtcbn1cblxuZXhwb3J0IHR5cGUgUGxhblJlc3VsdCA9IFBsYW5TdWNjZXNzIHwgUHJlcGFyYXRpb25GYWlsdXJlO1xuXG5mdW5jdGlvbiBkZWZhdWx0VGFyZ2V0cyh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QsIGZsb29yWTogbnVtYmVyKTogQ29sdW1uVGFyZ2V0W10ge1xuICBjb25zdCBvdXQ6IENvbHVtblRhcmdldFtdID0gW107XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgb3V0LnB1c2goeyB4LCB6LCB5OiBmbG9vclkgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gc29ydGVkVGFyZ2V0cyh0YXJnZXRzOiByZWFkb25seSBDb2x1bW5UYXJnZXRbXSk6IENvbHVtblRhcmdldFtdIHtcbiAgcmV0dXJuIFsuLi50YXJnZXRzXS5zb3J0KChhLCBiKSA9PiBhLnogLSBiLnogfHwgYS54IC0gYi54IHx8IGEueSAtIGIueSk7XG59XG5cbmludGVyZmFjZSBUYXJnZXRTdGF0cyB7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIHJlbGllZjogbnVtYmVyO1xufVxuXG4vKiogQ3V0L2ZpbGwgaW1wbGllZCBieSBleHBsaWNpdCB0YXJnZXRzLCBpbmRlcGVuZGVudCBvZiB0aGUgZmxhdCBmbG9vclkuICovXG5mdW5jdGlvbiB0YXJnZXRTdGF0cyh3b3JsZDogV29ybGQsIHRhcmdldHM6IHJlYWRvbmx5IENvbHVtblRhcmdldFtdKTogVGFyZ2V0U3RhdHMge1xuICBsZXQgY3V0Vm9sdW1lID0gMCwgZmlsbFZvbHVtZSA9IDAsIG1heEN1dCA9IDAsIG1heEZpbGwgPSAwO1xuICBsZXQgbWluWSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgbWF4WSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgbWluWSA9IE1hdGgubWluKG1pblksIHN1cmZhY2UsIHQueSk7XG4gICAgbWF4WSA9IE1hdGgubWF4KG1heFksIHN1cmZhY2UsIHQueSk7XG4gICAgaWYgKHN1cmZhY2UgPiB0LnkpIHtcbiAgICAgIGNvbnN0IGQgPSBzdXJmYWNlIC0gdC55O1xuICAgICAgY3V0Vm9sdW1lICs9IGQ7XG4gICAgICBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGQpO1xuICAgIH0gZWxzZSBpZiAoc3VyZmFjZSA8IHQueSkge1xuICAgICAgY29uc3QgZCA9IHQueSAtIHN1cmZhY2U7XG4gICAgICBmaWxsVm9sdW1lICs9IGQ7XG4gICAgICBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgZCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB7IGN1dFZvbHVtZSwgZmlsbFZvbHVtZSwgbWF4Q3V0LCBtYXhGaWxsLCByZWxpZWY6IG1heFkgLSBtaW5ZIH07XG59XG5cbmZ1bmN0aW9uIHRhcmdldFJ1bGVSZWFzb25zKHN0YXRzOiBUYXJnZXRTdGF0cywgcnVsZXM6IEJ1aWxkaW5nUnVsZXMpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGlmIChzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCkge1xuICAgIHJlYXNvbnMucHVzaChgcmVsaWVmICR7c3RhdHMucmVsaWVmfSBtIGV4Y2VlZHMgdGhlICR7cnVsZXMubWF4UmVsaWVmUHJlcGFyZWR9IG0gcHJlcGFyZWQgbGltaXRgKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4Q3V0ID4gcnVsZXMubWF4Q3V0KSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgJHtzdGF0cy5tYXhDdXR9IG0gZXhjZWVkcyAke3J1bGVzLm1heEN1dH0gbWApO1xuICB9XG4gIGlmIChzdGF0cy5tYXhGaWxsID4gcnVsZXMubWF4RmlsbCkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCAke3N0YXRzLm1heEZpbGx9IG0gZXhjZWVkcyAke3J1bGVzLm1heEZpbGx9IG1gKTtcbiAgfVxuICBpZiAoc3RhdHMuY3V0Vm9sdW1lID4gcnVsZXMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgdm9sdW1lICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXRWb2x1bWV9IG1cdTAwQjNgKTtcbiAgfVxuICBpZiAoc3RhdHMuZmlsbFZvbHVtZSA+IHJ1bGVzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgdm9sdW1lICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4RmlsbFZvbHVtZX0gbVx1MDBCM2ApO1xuICB9XG4gIHJldHVybiByZWFzb25zO1xufVxuXG4vKipcbiAqIFR1cm4gYSBwcm9wb3NhbCBpbnRvIGFuIGV4cGxpY2l0LCBjaGVja2FibGUgcGxhbi4gUmVhZC1vbmx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhblByZXBhcmF0aW9uKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIG9wdGlvbnM6IFByZXBhcmF0aW9uT3B0aW9ucyA9IHt9LFxuKTogUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCk7XG5cbiAgaWYgKHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJykge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3NpdGVfaW52YWxpZCcsXG4gICAgICByZWFzb25zOiB2YWxpZGF0aW9uLnJlYXNvbnMubWFwKChyKSA9PiBgJHtyLmNvZGV9OiAke3IubWVzc2FnZX1gKSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHRhcmdldHMgPSBzb3J0ZWRUYXJnZXRzKG9wdGlvbnMudGFyZ2V0cyA/PyBkZWZhdWx0VGFyZ2V0cyh3b3JsZCwgcmVjdCwgcHJvcG9zYWwuZmxvb3JZKSk7XG4gIGNvbnN0IGNvbHVtbnMgPSByZWN0Q29sdW1ucyhyZWN0KTtcbiAgaWYgKHRhcmdldHMubGVuZ3RoICE9PSBjb2x1bW5zKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAndGFyZ2V0X2NvdW50JyxcbiAgICAgIHJlYXNvbnM6IFtgcGxhbiBoYXMgJHt0YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBmb3IgJHtjb2x1bW5zfSBjb2x1bW5zYF0sXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qga2V5ID0gYCR7dC54fSwke3Quen1gO1xuICAgIGlmIChzZWVuLmhhcyhrZXkpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICdkdXBsaWNhdGVfdGFyZ2V0JyxcbiAgICAgICAgcmVhc29uczogW2BkdXBsaWNhdGUgdGFyZ2V0IGF0ICR7a2V5fWBdLCB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gICAgc2Vlbi5hZGQoa2V5KTtcbiAgICBpZiAodC54IDwgcmVjdC54MCB8fCB0LnggPiByZWN0LngxIHx8IHQueiA8IHJlY3QuejAgfHwgdC56ID4gcmVjdC56MSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAndGFyZ2V0X291dHNpZGVfZm9vdHByaW50JyxcbiAgICAgICAgcmVhc29uczogW2B0YXJnZXQgJHtrZXl9IGlzIG91dHNpZGUgJHtyZWN0LngwfSwke3JlY3QuejB9Li4ke3JlY3QueDF9LCR7cmVjdC56MX1gXSxcbiAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcih0LnkpIHx8IHQueSA8IFlfTUlOIHx8IHQueSA+PSBZX01BWCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAndGFyZ2V0X2hlaWdodCcsXG4gICAgICAgIHJlYXNvbnM6IFtgdGFyZ2V0ICR7a2V5fSBoYXMgaW52YWxpZCBoZWlnaHQgJHt0Lnl9YF0sIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHM7XG4gIGNvbnN0IGNsZWFyID0gb3B0aW9ucy5jbGVhciA/PyAnb2JzdHJ1Y3Rpb25zJztcbiAgaWYgKGNsZWFyID09PSAnbm9uZScgJiYgb2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICd1bmNsZWFyZWRfb2JzdHJ1Y3Rpb25zJyxcbiAgICAgIHJlYXNvbnM6IFtgJHtvYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgd291bGQgcmVtYWluYF0sXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cbiAgY29uc3QgY2xlYXJFbnRpdHlJZHMgPSBjbGVhciA9PT0gJ25vbmUnID8gW10gOiBbLi4ubmV3IFNldChvYnN0cnVjdGlvbnMpXS5zb3J0KCk7XG4gIGNvbnN0IHN1cmZhY2VNYXRlcmlhbCA9IG9wdGlvbnMuc3VyZmFjZU1hdGVyaWFsID8/IG51bGw7XG5cbiAgY29uc3QgY3VzdG9tVGFyZ2V0cyA9IG9wdGlvbnMudGFyZ2V0cyAhPT0gdW5kZWZpbmVkO1xuICBjb25zdCBzdGF0cyA9IGN1c3RvbVRhcmdldHNcbiAgICA/IHRhcmdldFN0YXRzKHdvcmxkLCB0YXJnZXRzKVxuICAgIDoge1xuICAgICAgY3V0Vm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm1heEZpbGwsXG4gICAgICByZWxpZWY6IHZhbGlkYXRpb24ucXVlcnkuc3RhdHMucmVsaWVmLFxuICAgIH07XG4gIGlmIChjdXN0b21UYXJnZXRzKSB7XG4gICAgY29uc3QgcmVhc29ucyA9IHRhcmdldFJ1bGVSZWFzb25zKHN0YXRzLCBwcm9wb3NhbC5ydWxlcyk7XG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgICBjb2RlOiAndGFyZ2V0X3J1bGVzJyxcbiAgICAgICAgcmVhc29ucyxcbiAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgbGV0IGxvID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICBsZXQgaGkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIGxvID0gTWF0aC5taW4obG8sIHN1cmZhY2UsIHQueSk7XG4gICAgaGkgPSBNYXRoLm1heChoaSwgc3VyZmFjZSAtIDEsIHQueSAtIDEpO1xuICB9XG4gIGNvbnN0IGJ1ZmZlcmVkID0gZXhwYW5kUmVjdChyZWN0LCAxKTtcbiAgY29uc3QgZGVyaXZlZDogVm94ZWxSZWdpb24gPSB7XG4gICAgeDA6IE1hdGgubWF4KC1IQUxGLCBidWZmZXJlZC54MCksXG4gICAgejA6IE1hdGgubWF4KC1IQUxGLCBidWZmZXJlZC56MCksXG4gICAgeDE6IE1hdGgubWluKEhBTEYgLSAxLCBidWZmZXJlZC54MSksXG4gICAgejE6IE1hdGgubWluKEhBTEYgLSAxLCBidWZmZXJlZC56MSksXG4gICAgeTA6IE1hdGgubWF4KFlfTUlOLCBsbyAtIDEpLFxuICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIGhpICsgMSksXG4gIH07XG4gIC8vIEFuIGV4cGxpY2l0IGVudmVsb3BlIHJlcGxhY2VzIHRoZSBkZXJpdmVkIG9uZS4gQ2FsbGVycyB0aGF0IHBpbiBhbiBleGFjdFxuICAvLyB3b3JrIGVudmVsb3BlIChwYXRoIHByZXBhcmF0aW9uKSBtdXN0IG5vdCBzaWxlbnRseSB3aWRlbiBpdCB3aXRoIHRoZVxuICAvLyBkZWZhdWx0IDEgbSBidWZmZXIuXG4gIGNvbnN0IGVudmVsb3BlID0gbm9ybWFsaXplRW52ZWxvcGUob3B0aW9ucy5lbnZlbG9wZSA/PyBbZGVyaXZlZF0pO1xuICBjb25zdCBzdXJmYWNlRWRpdHMgPSBzdXJmYWNlTWF0ZXJpYWwgPT09IG51bGwgPyAwIDogdGFyZ2V0cy5sZW5ndGg7XG5cbiAgY29uc3QgcGxhbjogUHJlcGFyYXRpb25QbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIHJ1bGVzOiBwcm9wb3NhbC5ydWxlcyxcbiAgICB0YXJnZXRzLFxuICAgIGNsZWFyRW50aXR5SWRzLFxuICAgIHN1cmZhY2VNYXRlcmlhbCxcbiAgICBlbnZlbG9wZSxcbiAgICBleHBlY3RlZDoge1xuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgICAgb2JzdHJ1Y3Rpb25zOiBjbGVhckVudGl0eUlkcy5sZW5ndGgsXG4gICAgICBzdXJmYWNlRWRpdHMsXG4gICAgICB0b3RhbEVkaXRzOiBzdGF0cy5jdXRWb2x1bWUgKyBzdGF0cy5maWxsVm9sdW1lICsgc3VyZmFjZUVkaXRzLFxuICAgIH0sXG4gIH07XG4gIHBsYW4uaWQgPSBgcHJlcDoke3BsYW5EaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIHZhbGlkYXRpb24gfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBhdXRob3JpemF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvbkxpbWl0cyB7XG4gIG1heEN1dFZvbHVtZTogbnVtYmVyO1xuICBtYXhGaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heFZveGVsRWRpdHM6IG51bWJlcjtcbiAgbWF4RW50aXR5UmVtb3ZhbHM6IG51bWJlcjtcbiAgbWF4VGFyZ2V0czogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9MSU1JVFM6IEF1dGhvcml6YXRpb25MaW1pdHMgPSB7XG4gIG1heEN1dFZvbHVtZTogMjU2LFxuICBtYXhGaWxsVm9sdW1lOiAyNTYsXG4gIG1heFZveGVsRWRpdHM6IDEwMjQsXG4gIG1heEVudGl0eVJlbW92YWxzOiAxNixcbiAgbWF4VGFyZ2V0czogNTEyLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBXb3JrQXV0aG9yaXphdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgYmFzZVJldmlzaW9uOiBudW1iZXI7XG4gIGxpbWl0czogQXV0aG9yaXphdGlvbkxpbWl0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uRGVjaXNpb24ge1xuICBvazogYm9vbGVhbjtcbiAgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb24gfCBudWxsO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uUG9saWN5IHtcbiAgLyoqIFRoZSBvbmx5IHJlZ2lvbnMgdGhpcyBnb3Zlcm5vciBwZXJtaXRzIGZvciB0aGUgZmlyc3Qgc2xpY2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBsaW1pdHM/OiBQYXJ0aWFsPEF1dGhvcml6YXRpb25MaW1pdHM+O1xufVxuXG5mdW5jdGlvbiByZWdpb25Db250YWluZWQocmVnaW9uOiBWb3hlbFJlZ2lvbiwgcG9saWN5OiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogYm9vbGVhbiB7XG4gIHJldHVybiBwb2xpY3kuc29tZSgocCkgPT4gcmVnaW9uLngwID49IHAueDAgJiYgcmVnaW9uLngxIDw9IHAueDFcbiAgICAmJiByZWdpb24uejAgPj0gcC56MCAmJiByZWdpb24uejEgPD0gcC56MVxuICAgICYmIHJlZ2lvbi55MCA+PSBwLnkwICYmIHJlZ2lvbi55MSA8PSBwLnkxKTtcbn1cblxuLyoqXG4gKiBMb2NhbCBnb3Zlcm5vciBzdHViLiBJdCBlbmZvcmNlcyBhIGZpeGVkIGVudmVsb3BlIGFuZCBoYXJkIHZvbHVtZSBsaW1pdHMsXG4gKiBiaW5kcyBhIHRva2VuIHRvIHRoZSBleGFjdCBwbGFuIGRpZ2VzdCBhbmQgd29ybGQgcmV2aXNpb24sIGFuZCByZWZ1c2VzIHRvXG4gKiBwcmV0ZW5kIGl0IGlzIGFuIG9uLWNoYWluIGF1dGhvcml0eS5cbiAqL1xuZXhwb3J0IGNsYXNzIExvY2FsQXV0aG9yaXplciB7XG4gIHJlYWRvbmx5IGF1dGhvcml0eSA9IExPQ0FMX0FVVEhPUklUWTtcbiAgcmVhZG9ubHkgZW5mb3JjZW1lbnQgPSBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcmVhZG9ubHkgbGltaXRzOiBBdXRob3JpemF0aW9uTGltaXRzO1xuXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHBvbGljeTogQXV0aG9yaXphdGlvblBvbGljeSkge1xuICAgIHRoaXMubGltaXRzID0geyAuLi5ERUZBVUxUX0xJTUlUUywgLi4uKHBvbGljeS5saW1pdHMgPz8ge30pIH07XG4gIH1cblxuICBhdXRob3JpemUod29ybGQ6IFdvcmxkLCBwbGFuOiBQcmVwYXJhdGlvblBsYW4pOiBBdXRob3JpemF0aW9uRGVjaXNpb24ge1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocGxhbi5yZWN0KTtcblxuICAgIGlmIChwbGFuLnRhcmdldHMubGVuZ3RoICE9PSByZWN0Q29sdW1ucyhyZWN0KSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFuIGhhcyAke3BsYW4udGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZm9yICR7cmVjdENvbHVtbnMocmVjdCl9IGNvbHVtbnNgKTtcbiAgICB9XG4gICAgaWYgKHBsYW4udGFyZ2V0cy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhUYXJnZXRzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi50YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhUYXJnZXRzfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC5jdXRWb2x1bWUgPiB0aGlzLmxpbWl0cy5tYXhDdXRWb2x1bWUpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgY3V0ICR7cGxhbi5leHBlY3RlZC5jdXRWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhDdXRWb2x1bWV9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLmZpbGxWb2x1bWUgPiB0aGlzLmxpbWl0cy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgICByZWFzb25zLnB1c2goYGZpbGwgJHtwbGFuLmV4cGVjdGVkLmZpbGxWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhGaWxsVm9sdW1lfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC50b3RhbEVkaXRzID4gdGhpcy5saW1pdHMubWF4Vm94ZWxFZGl0cykge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFubmVkIGVkaXRzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heFZveGVsRWRpdHN9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCA+IHRoaXMubGltaXRzLm1heEVudGl0eVJlbW92YWxzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGh9IHJlbW92YWxzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heEVudGl0eVJlbW92YWxzfWApO1xuICAgIH1cbiAgICBpZiAobmV3IFNldChwbGFuLmNsZWFyRW50aXR5SWRzKS5zaXplICE9PSBwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdkdXBsaWNhdGUgZW50aXR5IHJlbW92YWwgaWRzJyk7XG4gICAgfVxuXG4gICAgaWYgKHBsYW4uZW52ZWxvcGUubGVuZ3RoID09PSAwKSB7XG4gICAgICByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIHdvcmsgZW52ZWxvcGUnKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCByZWdpb24gb2YgcGxhbi5lbnZlbG9wZSkge1xuICAgICAgaWYgKCFyZWdpb25Db250YWluZWQocmVnaW9uLCB0aGlzLnBvbGljeS5lbnZlbG9wZSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBlbnZlbG9wZSAke3JlZ2lvbi54MH0sJHtyZWdpb24uejB9LCR7cmVnaW9uLnkwfS4uJHtyZWdpb24ueDF9LCR7cmVnaW9uLnoxfSwke3JlZ2lvbi55MX0gaXMgb3V0c2lkZSB0aGUgbG9jYWwgcG9saWN5YCk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIHtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhwbGFuLmVudmVsb3BlLCB0LngsIHQueSwgdC56KVxuICAgICAgICB8fCAodC55ID4gWV9NSU4gJiYgIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgdC54LCB0LnkgLSAxLCB0LnopKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYHRhcmdldCAke3QueH0sJHt0Lnp9LCR7dC55fSBpcyBub3QgY292ZXJlZCBieSB0aGUgd29yayBlbnZlbG9wZWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEV2ZXJ5IG9ic3RydWN0aW9uIGN1cnJlbnRseSBvbiB0aGUgZm9vdHByaW50IG11c3QgYmUgaW4gdGhlIHBsYW4sIGFuZFxuICAgIC8vIHRoZSBwbGFuIG1heSBub3QgcmVtb3ZlIGFueXRoaW5nIHRoYXQgaXMgbm90IGFuIG9ic3RydWN0aW9uIHRoZXJlLlxuICAgIGNvbnN0IGN1cnJlbnQgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCkubWFwKChvKSA9PiBvLmVudGl0eUlkKS5zb3J0KCk7XG4gICAgY29uc3QgcGxhbm5lZCA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gICAgaWYgKGN1cnJlbnQubGVuZ3RoICE9PSBwbGFubmVkLmxlbmd0aCB8fCBjdXJyZW50LnNvbWUoKGlkLCBpKSA9PiBpZCAhPT0gcGxhbm5lZFtpXSkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbiByZW1vdmFscyBbJHtwbGFubmVkLmpvaW4oJywnKX1dIGRvIG5vdCBtYXRjaCBmb290cHJpbnQgb2JzdHJ1Y3Rpb25zIFske2N1cnJlbnQuam9pbignLCcpfV1gKTtcbiAgICB9XG5cbiAgICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4geyBvazogZmFsc2UsIGF1dGhvcml6YXRpb246IG51bGwsIHJlYXNvbnMgfTtcblxuICAgIGNvbnN0IHRva2VuOiBXb3JrQXV0aG9yaXphdGlvbiA9IHtcbiAgICAgIGlkOiBgbG9jYWwtc3R1Yjoke3BsYW5EaWdlc3QocGxhbil9YCxcbiAgICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgICAgcGxhbkRpZ2VzdDogcGxhbkRpZ2VzdChwbGFuKSxcbiAgICAgIGVudmVsb3BlOiBub3JtYWxpemVFbnZlbG9wZShwbGFuLmVudmVsb3BlKSxcbiAgICAgIGJhc2VSZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgICBsaW1pdHM6IHsgLi4udGhpcy5saW1pdHMgfSxcbiAgICB9O1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBhdXRob3JpemF0aW9uOiB0b2tlbiwgcmVhc29uczogW10gfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIGV4ZWN1dGlvbiAtLS0tLS0tLS0tXG5pbnRlcmZhY2UgUGVuZGluZ0VkaXQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBiZWZvcmU6IE1hdElkO1xuICBhZnRlcjogTWF0SWQ7XG4gIC8qKiBUcnVlIGZvciBhIG1hdGVyaWFsLW9ubHkgdG9wLXN1cmZhY2UgY2hhbmdlLiAqL1xuICBzdXJmYWNlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgY2h1bms6IHN0cmluZztcbiAgY2hhbmdlZDogbnVtYmVyO1xuICBhZGRlZDogbnVtYmVyO1xuICByZW1vdmVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2xlYXJlZEVudGl0eSB7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsO1xuICBhbW91bnQ6IG51bWJlcjtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbkxlZGdlciB7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgYXV0aG9yaXphdGlvbklkOiBzdHJpbmc7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBuZXRTcG9pbDogbnVtYmVyO1xuICBib3Jyb3dlZEZpbGw6IG51bWJlcjtcbiAgY3V0QnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgZmlsbEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIHZveGVsRWRpdHM6IG51bWJlcjtcbiAgc3VyZmFjZUVkaXRzOiBudW1iZXI7XG4gIGVudGl0aWVzQ2xlYXJlZDogQ2xlYXJlZEVudGl0eVtdO1xuICByZXNvdXJjZXNHYWluZWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGludmVudG9yeUJlZm9yZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaW52ZW50b3J5QWZ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGNodW5rRGVsdGFzOiBDaHVua0RlbHRhW107XG4gIHJldmlzaW9uQmVmb3JlOiBudW1iZXI7XG4gIHJldmlzaW9uQWZ0ZXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogUHJlcGFyYXRpb25QbGFuO1xuICBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbjtcbiAgbGVkZ2VyOiBQcmVwYXJhdGlvbkxlZGdlcjtcbn1cblxuZXhwb3J0IHR5cGUgUHJlcGFyYXRpb25PdXRjb21lID0gUHJlcGFyYXRpb25TdWNjZXNzIHwgUHJlcGFyYXRpb25GYWlsdXJlO1xuXG5jb25zdCBNQVRFUklBTF9OQU1FUzogUmVjb3JkPG51bWJlciwgc3RyaW5nPiA9IHtcbiAgW01BVC5HUkFTU106ICdncmFzcycsXG4gIFtNQVQuU09JTF06ICdzb2lsJyxcbiAgW01BVC5TQU5EXTogJ3NhbmQnLFxuICBbTUFULkdSQVZFTF06ICdncmF2ZWwnLFxuICBbTUFULlNUT05FXTogJ3N0b25lJyxcbiAgW01BVC5PUkVdOiAnb3JlJyxcbiAgW01BVC5XQVRFUl06ICd3YXRlcicsXG4gIFtNQVQuQkVEUk9DS106ICdiZWRyb2NrJyxcbiAgW01BVC5NT1NTXTogJ21vc3MnLFxufTtcblxuZnVuY3Rpb24gbWF0ZXJpYWxOYW1lKG06IE1hdElkKTogc3RyaW5nIHtcbiAgcmV0dXJuIE1BVEVSSUFMX05BTUVTW21dID8/IGBtYXRfJHttfWA7XG59XG5cbmZ1bmN0aW9uIGZpbGxNYXRlcmlhbCh5OiBudW1iZXIsIHRhcmdldDogbnVtYmVyKTogTWF0SWQge1xuICByZXR1cm4geSA9PT0gdGFyZ2V0IC0gMSA/IE1BVC5HUkFTUyA6IE1BVC5TT0lMO1xufVxuXG5mdW5jdGlvbiBmYWlsKHN0YWdlOiBQcmVwYXJhdGlvbkZhaWx1cmVbJ3N0YWdlJ10sIGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBQcmVwYXJhdGlvbkZhaWx1cmUge1xuICByZXR1cm4geyBvazogZmFsc2UsIHN0YWdlLCBjb2RlLCByZWFzb25zIH07XG59XG5cbi8qKlxuICogQXBwbHkgYW4gYXV0aG9yaXplZCBwbGFuLiBObyB2b3hlbCBpcyB3cml0dGVuIHVudGlsIGV2ZXJ5IGVkaXQgYW5kIHJlbW92YWxcbiAqIGhhcyBiZWVuIGNoZWNrZWQgYWdhaW5zdCB0aGUgdG9rZW4sIHRoZSBwbGFuIGVudmVsb3BlIGFuZCB0aGUgaGFyZCBsaW1pdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleGVjdXRlUHJlcGFyYXRpb24oXG4gIHdvcmxkOiBXb3JsZCwgcGxhbjogUHJlcGFyYXRpb25QbGFuLCBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbixcbik6IFByZXBhcmF0aW9uT3V0Y29tZSB7XG4gIGlmIChhdXRob3JpemF0aW9uLmF1dGhvcml0eSAhPT0gTE9DQUxfQVVUSE9SSVRZXG4gICAgfHwgYXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudCAhPT0gTE9DQUxfRU5GT1JDRU1FTlQpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bnN1cHBvcnRlZF9hdXRob3JpdHknLCBbXG4gICAgICBgYXV0aG9yaXR5ICR7YXV0aG9yaXphdGlvbi5hdXRob3JpdHl9LyR7YXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudH0gaXMgbm90IHRoZSBsb2NhbCBzdHViYCxcbiAgICBdKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0ICE9PSBwbGFuRGlnZXN0KHBsYW4pKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZGlnZXN0X21pc21hdGNoJywgWydhdXRob3JpemF0aW9uIGRvZXMgbm90IG1hdGNoIHRoaXMgcGxhbiddKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb24gIT09IHdvcmxkLnJldmlzaW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnc3RhbGVfYXV0aG9yaXphdGlvbicsIFtcbiAgICAgIGBhdXRob3JpemF0aW9uIHdhcyBpc3N1ZWQgYXQgcmV2aXNpb24gJHthdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbn0sIHdvcmxkIGlzIGF0ICR7d29ybGQucmV2aXNpb259YCxcbiAgICBdKTtcbiAgfVxuICBpZiAocGxhbi5lbnZlbG9wZS5zb21lKChyKSA9PiAhcmVnaW9uQ29udGFpbmVkKHIsIGF1dGhvcml6YXRpb24uZW52ZWxvcGUpKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2VudmVsb3BlX21pc21hdGNoJywgWydwbGFuIGVudmVsb3BlIGlzIHdpZGVyIHRoYW4gdGhlIGF1dGhvcml6YXRpb24nXSk7XG4gIH1cblxuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwbGFuLnJlY3QpO1xuICBjb25zdCBlZGl0czogUGVuZGluZ0VkaXRbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIGlmICh0LnkgPCBzdXJmYWNlKSB7XG4gICAgICBmb3IgKGxldCB5ID0gdC55OyB5IDwgc3VyZmFjZTsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHksIHQueik7XG4gICAgICAgIGlmIChpc1NvbGlkKGJlZm9yZSkpIGVkaXRzLnB1c2goeyB4OiB0LngsIHksIHo6IHQueiwgYmVmb3JlLCBhZnRlcjogTUFULkFJUiB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHQueSA+IHN1cmZhY2UpIHtcbiAgICAgIGZvciAobGV0IHkgPSBzdXJmYWNlOyB5IDwgdC55OyB5KyspIHtcbiAgICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgeSwgdC56KTtcbiAgICAgICAgaWYgKCFpc1NvbGlkKGJlZm9yZSkpIHtcbiAgICAgICAgICBjb25zdCBhZnRlciA9IHBsYW4uc3VyZmFjZU1hdGVyaWFsICE9PSBudWxsICYmIHkgPT09IHQueSAtIDFcbiAgICAgICAgICAgID8gcGxhbi5zdXJmYWNlTWF0ZXJpYWxcbiAgICAgICAgICAgIDogZmlsbE1hdGVyaWFsKHksIHQueSk7XG4gICAgICAgICAgZWRpdHMucHVzaCh7IHg6IHQueCwgeSwgejogdC56LCBiZWZvcmUsIGFmdGVyIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIE1hdGVyaWFsLW9ubHkgc3VyZmFjZSBjaGFuZ2UgZm9yIGN1dCBvciBhbHJlYWR5LWxldmVsIGNvbHVtbnMuIEZpbGxcbiAgICAvLyBjb2x1bW5zIGFscmVhZHkgcmVjZWl2ZSB0aGUgc3VyZmFjZSBtYXRlcmlhbCBpbiB0aGUgZmlsbCBsb29wIGFib3ZlLlxuICAgIGlmIChwbGFuLnN1cmZhY2VNYXRlcmlhbCAhPT0gbnVsbCkge1xuICAgICAgY29uc3QgdG9wWSA9IHQueSAtIDE7XG4gICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB0b3BZLCB0LnopO1xuICAgICAgaWYgKGlzU29saWQoYmVmb3JlKSAmJiBiZWZvcmUgIT09IHBsYW4uc3VyZmFjZU1hdGVyaWFsKSB7XG4gICAgICAgIGVkaXRzLnB1c2goe1xuICAgICAgICAgIHg6IHQueCwgeTogdG9wWSwgejogdC56LCBiZWZvcmUsIGFmdGVyOiBwbGFuLnN1cmZhY2VNYXRlcmlhbCwgc3VyZmFjZTogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgZXZlcnkgZWRpdCBiZWZvcmUgbXV0YXRpbmcgYW55dGhpbmcuXG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgZSBvZiBlZGl0cykge1xuICAgIGlmIChlLnggPCByZWN0LngwIHx8IGUueCA+IHJlY3QueDEgfHwgZS56IDwgcmVjdC56MCB8fCBlLnogPiByZWN0LnoxKSB7XG4gICAgICByZWFzb25zLnB1c2goYGVkaXQgJHtlLnh9LCR7ZS55fSwke2Uuen0gaXMgb3V0c2lkZSB0aGUgZm9vdHByaW50YCk7XG4gICAgfVxuICAgIGlmICghZW52ZWxvcGVDb250YWlucyhhdXRob3JpemF0aW9uLmVudmVsb3BlLCBlLngsIGUueSwgZS56KSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBlZGl0ICR7ZS54fSwke2UueX0sJHtlLnp9IGlzIG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgZW52ZWxvcGVgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgY3V0Vm9sdW1lID0gZWRpdHMuZmlsdGVyKChlKSA9PiBlLmFmdGVyID09PSBNQVQuQUlSICYmIGlzU29saWQoZS5iZWZvcmUpKS5sZW5ndGg7XG4gIGNvbnN0IGZpbGxWb2x1bWUgPSBlZGl0cy5maWx0ZXIoKGUpID0+IGUuYWZ0ZXIgIT09IE1BVC5BSVIgJiYgIWlzU29saWQoZS5iZWZvcmUpKS5sZW5ndGg7XG4gIGlmIChjdXRWb2x1bWUgPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCAke2N1dFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEN1dFZvbHVtZX1gKTtcbiAgfVxuICBpZiAoZmlsbFZvbHVtZSA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgJHtmaWxsVm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4RmlsbFZvbHVtZX1gKTtcbiAgfVxuICBpZiAoZWRpdHMubGVuZ3RoID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4Vm94ZWxFZGl0cykge1xuICAgIHJlYXNvbnMucHVzaChgJHtlZGl0cy5sZW5ndGh9IGVkaXRzIGV4Y2VlZCBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heFZveGVsRWRpdHN9YCk7XG4gIH1cblxuICBjb25zdCBjdXJyZW50ID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpLm1hcCgobykgPT4gby5lbnRpdHlJZCkuc29ydCgpO1xuICBjb25zdCBwbGFubmVkID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgaWYgKGN1cnJlbnQubGVuZ3RoICE9PSBwbGFubmVkLmxlbmd0aCB8fCBjdXJyZW50LnNvbWUoKGlkLCBpKSA9PiBpZCAhPT0gcGxhbm5lZFtpXSkpIHtcbiAgICByZWFzb25zLnB1c2goJ2Zvb3RwcmludCBvYnN0cnVjdGlvbnMgY2hhbmdlZCBhZnRlciBhdXRob3JpemF0aW9uJyk7XG4gIH1cbiAgaWYgKHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHMpIHtcbiAgICByZWFzb25zLnB1c2goYCR7cGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGh9IHJlbW92YWxzIGV4Y2VlZCBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEVudGl0eVJlbW92YWxzfWApO1xuICB9XG4gIGZvciAoY29uc3QgaWQgb2YgcGxhbi5jbGVhckVudGl0eUlkcykge1xuICAgIGlmICghd29ybGQuZW50aXRpZXMuaGFzKGlkKSkgcmVhc29ucy5wdXNoKGBlbnRpdHkgJHtpZH0gbm8gbG9uZ2VyIGV4aXN0c2ApO1xuICB9XG4gIGlmICh3b3JsZC5saWZlKSB7XG4gICAgbGV0IHJlY292ZXJlZCA9IDA7XG4gICAgZm9yIChjb25zdCBpZCBvZiBwbGFuLmNsZWFyRW50aXR5SWRzKSB7XG4gICAgICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgaWYgKGVudGl0eT8ucmVzb3VyY2UgJiYgZW50aXR5LnJlbWFpbmluZyA+IDApIHJlY292ZXJlZCArPSBlbnRpdHkucmVtYWluaW5nO1xuICAgIH1cbiAgICAvLyBDaGVjayBiZWZvcmUgYW55IHZveGVsIG9yIGVudGl0eSBjaGFuZ2VzLCBwcmVzZXJ2aW5nIGxlZ2FjeSB1bmJvdW5kZWRcbiAgICAvLyBjb25zdHJ1Y3Rpb24gYmVoYXZpb3IgYW5kIHNjaGVtYS0zIGNhcnJpZWQtY2FwYWNpdHkgY29uc2VydmF0aW9uLlxuICAgIGlmIChPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIGFtb3VudCkgPT4gc3VtICsgYW1vdW50LCAwKSArIHJlY292ZXJlZCA+IDEyMCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdyZXNvdXJjZXMgcmVjb3ZlcmVkIGR1cmluZyBzaXRlIGNsZWFyaW5nIHdvdWxkIGV4Y2VlZCBjYXJyaWVkIGNhcGFjaXR5IDEyMCcpO1xuICAgIH1cbiAgfVxuICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bmF1dGhvcml6ZWRfZWRpdHMnLCByZWFzb25zKTtcblxuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IHJldmlzaW9uQmVmb3JlID0gd29ybGQucmV2aXNpb247XG4gIGNvbnN0IGNodW5rRGVsdGFzID0gbmV3IE1hcDxzdHJpbmcsIENodW5rRGVsdGE+KCk7XG4gIGNvbnN0IGN1dEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgY29uc3QgZmlsbEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgbGV0IGFwcGxpZWQgPSAwO1xuICBsZXQgc3VyZmFjZUVkaXRzID0gMDtcblxuICBmb3IgKGNvbnN0IGUgb2YgZWRpdHMpIHtcbiAgICBpZiAoIXNldFZveGVsKHdvcmxkLCBlLngsIGUueSwgZS56LCBlLmFmdGVyKSkgY29udGludWU7XG4gICAgYXBwbGllZCsrO1xuICAgIGlmIChlLnN1cmZhY2UpIHN1cmZhY2VFZGl0cysrO1xuICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KHdvcmxkVG9DaHVua1goZS54KSwgd29ybGRUb0NodW5rWihlLnopKTtcbiAgICBsZXQgZGVsdGEgPSBjaHVua0RlbHRhcy5nZXQoa2V5KTtcbiAgICBpZiAoIWRlbHRhKSB7XG4gICAgICBkZWx0YSA9IHsgY2h1bms6IGtleSwgY2hhbmdlZDogMCwgYWRkZWQ6IDAsIHJlbW92ZWQ6IDAgfTtcbiAgICAgIGNodW5rRGVsdGFzLnNldChrZXksIGRlbHRhKTtcbiAgICB9XG4gICAgZGVsdGEuY2hhbmdlZCsrO1xuICAgIGNvbnN0IHdhc1NvbGlkID0gaXNTb2xpZChlLmJlZm9yZSk7XG4gICAgY29uc3QgaXNOb3dTb2xpZCA9IGlzU29saWQoZS5hZnRlcik7XG4gICAgaWYgKCF3YXNTb2xpZCAmJiBpc05vd1NvbGlkKSBkZWx0YS5hZGRlZCsrO1xuICAgIGlmICh3YXNTb2xpZCAmJiAhaXNOb3dTb2xpZCkgZGVsdGEucmVtb3ZlZCsrO1xuICAgIGNvbnN0IG5hbWUgPSBtYXRlcmlhbE5hbWUoZS5iZWZvcmUpO1xuICAgIGlmICh3YXNTb2xpZCAmJiAhaXNOb3dTb2xpZCkgY3V0QnlNYXRlcmlhbFtuYW1lXSA9IChjdXRCeU1hdGVyaWFsW25hbWVdID8/IDApICsgMTtcbiAgICBpZiAoIXdhc1NvbGlkICYmIGlzTm93U29saWQpIGZpbGxCeU1hdGVyaWFsW21hdGVyaWFsTmFtZShlLmFmdGVyKV0gPSAoZmlsbEJ5TWF0ZXJpYWxbbWF0ZXJpYWxOYW1lKGUuYWZ0ZXIpXSA/PyAwKSArIDE7XG4gIH1cblxuICBjb25zdCBlbnRpdGllc0NsZWFyZWQ6IENsZWFyZWRFbnRpdHlbXSA9IFtdO1xuICBjb25zdCByZXNvdXJjZXNHYWluZWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7fTtcbiAgZm9yIChjb25zdCBpZCBvZiBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKCFlKSBjb250aW51ZTtcbiAgICBjb25zdCBhbW91bnQgPSBlLnJlc291cmNlICYmIGUucmVtYWluaW5nID4gMCA/IGUucmVtYWluaW5nIDogMDtcbiAgICBpZiAoZS5yZXNvdXJjZSAmJiBhbW91bnQgPiAwKSB7XG4gICAgICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgICAgcmVzb3VyY2VzR2FpbmVkW2UucmVzb3VyY2VdID0gKHJlc291cmNlc0dhaW5lZFtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgICB9XG4gICAgcmVtb3ZlRW50aXR5KHdvcmxkLCBpZCk7XG4gICAgZW50aXRpZXNDbGVhcmVkLnB1c2goe1xuICAgICAgZW50aXR5SWQ6IGlkLCBraW5kOiBlLmtpbmQsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQsIHg6IGUueCwgeTogZS55LCB6OiBlLnosXG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBjdXQgPSBhcHBsaWVkID4gMCA/IE9iamVjdC52YWx1ZXMoY3V0QnlNYXRlcmlhbCkucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgOiAwO1xuICBjb25zdCBmaWxsID0gYXBwbGllZCA+IDAgPyBPYmplY3QudmFsdWVzKGZpbGxCeU1hdGVyaWFsKS5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSA6IDA7XG4gIGNvbnN0IGxlZGdlcjogUHJlcGFyYXRpb25MZWRnZXIgPSB7XG4gICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgIGF1dGhvcml6YXRpb25JZDogYXV0aG9yaXphdGlvbi5pZCxcbiAgICBwbGFuRGlnZXN0OiBhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QsXG4gICAgc2l0ZUlkOiBwbGFuLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcGxhbi5mbG9vclksXG4gICAgY3V0Vm9sdW1lOiBjdXQsXG4gICAgZmlsbFZvbHVtZTogZmlsbCxcbiAgICBuZXRTcG9pbDogY3V0IC0gZmlsbCxcbiAgICBib3Jyb3dlZEZpbGw6IE1hdGgubWF4KDAsIGZpbGwgLSBjdXQpLFxuICAgIGN1dEJ5TWF0ZXJpYWwsXG4gICAgZmlsbEJ5TWF0ZXJpYWwsXG4gICAgdm94ZWxFZGl0czogYXBwbGllZCxcbiAgICBzdXJmYWNlRWRpdHMsXG4gICAgZW50aXRpZXNDbGVhcmVkLFxuICAgIHJlc291cmNlc0dhaW5lZCxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICBjaHVua0RlbHRhczogWy4uLmNodW5rRGVsdGFzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykpLFxuICAgIHJldmlzaW9uQmVmb3JlLFxuICAgIHJldmlzaW9uQWZ0ZXI6IHdvcmxkLnJldmlzaW9uLFxuICB9O1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiwgYXV0aG9yaXphdGlvbiwgbGVkZ2VyIH07XG59XG5cbi8qKlxuICogVGhlIHNoYXJlZCBwbGF5ZXIvQUkgZW50cnkgcG9pbnQuIFRoZXJlIGlzIG5vIG90aGVyIGNvbnN0cnVjdGlvbiBwYXRoLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJlcGFyZVNpdGUoXG4gIHdvcmxkOiBXb3JsZCxcbiAgYXV0aG9yaXplcjogTG9jYWxBdXRob3JpemVyLFxuICBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLFxuICBvcHRpb25zOiBQcmVwYXJhdGlvbk9wdGlvbnMgPSB7fSxcbik6IFByZXBhcmF0aW9uT3V0Y29tZSB7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUHJlcGFyYXRpb24od29ybGQsIHByb3Bvc2FsLCBvcHRpb25zKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgY29uc3QgZGVjaXNpb24gPSBhdXRob3JpemVyLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgaWYgKCFkZWNpc2lvbi5vayB8fCAhZGVjaXNpb24uYXV0aG9yaXphdGlvbikge1xuICAgIHJldHVybiBmYWlsKCdhdXRob3JpemUnLCAnbm90X2F1dGhvcml6ZWQnLCBkZWNpc2lvbi5yZWFzb25zKTtcbiAgfVxuICByZXR1cm4gZXhlY3V0ZVByZXBhcmF0aW9uKHdvcmxkLCBwbGFubmVkLnBsYW4sIGRlY2lzaW9uLmF1dGhvcml6YXRpb24pO1xufVxuIiwgIi8vIENhbm9uaWNhbCBzdGF0ZSBoYXNoaW5nIFx1MjAxNCBwdXJlIHNpbXVsYXRpb24sIG5vIHRocmVlLmpzIGltcG9ydHMuXG4vL1xuLy8gVGhlIG5vLWZsYXR0ZW4gcHJvb2YgY29tcGFyZXMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lIG91dHNpZGUgdGhlXG4vLyBjb21wbGV0ZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUuIEl0IGRlbGliZXJhdGVseSBkb2VzIG5vdCBoYXNoIGNodW5rXG4vLyBoZWlnaHRzL3RvcE1hdGVyaWFscyAoZGVyaXZlZCBjYWNoZXMpLCBtZXNoIGdlb21ldHJ5LCBzdHJlYW1pbmcgc3RhdGUgb3Jcbi8vIG5hdmlnYXRpb24gZGF0YS4gVGhvc2UgYXJlIGNoZWNrZWQgc2VwYXJhdGVseSBhcyBkZXJpdmVkIHN0YXRlLCBzbyBhIGNhY2hlXG4vLyBvciBtZXNoIHJlYnVpbGQgY2FuIG5ldmVyIGJlIG1pc3Rha2VuIGZvciBhIHRlcnJhaW4gbXV0YXRpb24uXG5pbXBvcnQge1xuICBXb3JsZCwgWV9NSU4sIFlfTUFYLCBIQUxGLCBDSFVOS19TSVpFLCBDSFVOS19BUkVBLFxuICBlbnN1cmVDaHVuaywgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCwgaXNTb2xpZCxcbiAgRW50aXR5LFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IFZveGVsUmVnaW9uLCBlbnZlbG9wZUNvbnRhaW5zIH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0YXRlSGFzaCB7XG4gIC8qKiAxNiBoZXggY2hhcmFjdGVyczogdHdvIGluZGVwZW5kZW50IDMyLWJpdCBsYW5lcy4gKi9cbiAgaGFzaDogc3RyaW5nO1xuICBjZWxsczogbnVtYmVyO1xuICBleGNsdWRlZENlbGxzOiBudW1iZXI7XG4gIGNodW5rczogbnVtYmVyO1xuICByZWdpb246IFZveGVsUmVnaW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlTWlzbWF0Y2gge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgZmllbGQ6ICdoZWlnaHQnIHwgJ21hdGVyaWFsJztcbiAgZXhwZWN0ZWQ6IG51bWJlcjtcbiAgYWN0dWFsOiBudW1iZXI7XG59XG5cbmNsYXNzIEhhc2hlciB7XG4gIHByaXZhdGUgYSA9IDB4ODExYzlkYzU7XG4gIHByaXZhdGUgYiA9IDB4OWUzNzc5Yjk7XG5cbiAgYnl0ZSh2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCB4ID0gdiAmIDB4ZmY7XG4gICAgdGhpcy5hID0gTWF0aC5pbXVsKHRoaXMuYSBeIHgsIDB4MDEwMDAxOTMpO1xuICAgIHRoaXMuYiA9IE1hdGguaW11bCh0aGlzLmIgXiAoeCArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICB0aGlzLmIgXj0gdGhpcy5iID4+PiAxMztcbiAgfVxuXG4gIHUzMih2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBsZXQgbiA9IHYgPj4+IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA0OyBpKyspIHtcbiAgICAgIHRoaXMuYnl0ZShuKTtcbiAgICAgIG4gPj4+PSA4O1xuICAgIH1cbiAgfVxuXG4gIHN0cmluZyhzOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLnUzMihzLmxlbmd0aCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSsrKSB0aGlzLmJ5dGUocy5jaGFyQ29kZUF0KGkpKTtcbiAgfVxuXG4gIGhleCgpOiBzdHJpbmcge1xuICAgIHJldHVybiAodGhpcy5hID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICAgKyAodGhpcy5iID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXBSZWdpb24ocmVnaW9uOiBWb3hlbFJlZ2lvbik6IFZveGVsUmVnaW9uIHtcbiAgY29uc3QgcjogVm94ZWxSZWdpb24gPSB7XG4gICAgeDA6IE1hdGgubWF4KC1IQUxGLCBNYXRoLmZsb29yKHJlZ2lvbi54MCkpLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgTWF0aC5mbG9vcihyZWdpb24uejApKSxcbiAgICB4MTogTWF0aC5taW4oSEFMRiAtIDEsIE1hdGguZmxvb3IocmVnaW9uLngxKSksXG4gICAgejE6IE1hdGgubWluKEhBTEYgLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi56MSkpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgTWF0aC5mbG9vcihyZWdpb24ueTApKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi55MSkpLFxuICB9O1xuICBpZiAoci54MCA+IHIueDEgfHwgci56MCA+IHIuejEgfHwgci55MCA+IHIueTEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYGVtcHR5IHZveGVsIHJlZ2lvbiAke0pTT04uc3RyaW5naWZ5KHJlZ2lvbil9YCk7XG4gIH1cbiAgcmV0dXJuIHI7XG59XG5cbi8qKiBTb3J0IGFuIGVudmVsb3BlIHNvIGl0cyBoYXNoIGlzIGluZGVwZW5kZW50IG9mIHJlY3Qgb3JkZXIuICovXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplRW52ZWxvcGUocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBWb3hlbFJlZ2lvbltdIHtcbiAgcmV0dXJuIHJlY3RzXG4gICAgLm1hcCgocikgPT4gKHtcbiAgICAgIHgwOiBNYXRoLmZsb29yKHIueDApLCB6MDogTWF0aC5mbG9vcihyLnowKSwgeDE6IE1hdGguZmxvb3Ioci54MSksIHoxOiBNYXRoLmZsb29yKHIuejEpLFxuICAgICAgeTA6IE1hdGguZmxvb3Ioci55MCksIHkxOiBNYXRoLmZsb29yKHIueTEpLFxuICAgIH0pKVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLngwIC0gYi54MCB8fCBhLnowIC0gYi56MCB8fCBhLnkwIC0gYi55MFxuICAgICAgfHwgYS54MSAtIGIueDEgfHwgYS56MSAtIGIuejEgfHwgYS55MSAtIGIueTEpO1xufVxuXG4vKiogTWF0ZXJpYWxpc2UgZXZlcnkgY2h1bmsgdGhhdCBvdmVybGFwcyB0aGUgcmVnaW9uIGFuZCByZXR1cm4gc29ydGVkIGtleXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IHdvcmxkVG9DaHVua1goci54MCksIGN4MSA9IHdvcmxkVG9DaHVua1goci54MSk7XG4gIGNvbnN0IGN6MCA9IHdvcmxkVG9DaHVua1ooci56MCksIGN6MSA9IHdvcmxkVG9DaHVua1ooci56MSk7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2N4fSwke2N6fSBpcyBvdXRzaWRlIHRoZSB3b3JsZGApO1xuICAgICAga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICAgIH1cbiAgfVxuICBrZXlzLnNvcnQoKTtcbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKlxuICogSGFzaCB0aGUgYXV0aG9yaXRhdGl2ZSBtYXRlcmlhbCBieXRlIG9mIGV2ZXJ5IHZveGVsIGluIGByZWdpb25gLCBleGNsdWRpbmdcbiAqIGV2ZXJ5IHZveGVsIGluc2lkZSBgZXhjbHVkZWAuIFR3byBjYWxscyB3aXRoIHRoZSBzYW1lIHJlZ2lvbiBhbmQgZW52ZWxvcGVcbiAqIGFyZSBkaXJlY3RseSBjb21wYXJhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsUmVnaW9uSGFzaChcbiAgd29ybGQ6IFdvcmxkLFxuICByZWdpb246IFZveGVsUmVnaW9uLFxuICBleGNsdWRlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdID0gW10sXG4pOiBTdGF0ZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3QgZW52ZWxvcGUgPSBub3JtYWxpemVFbnZlbG9wZShleGNsdWRlKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnZveGVsLXN0YXRlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpOyBoLnUzMihyLnkwKTsgaC51MzIoci55MSk7XG4gIGgudTMyKGVudmVsb3BlLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgZSBvZiBlbnZlbG9wZSkge1xuICAgIGgudTMyKGUueDApOyBoLnUzMihlLnowKTsgaC51MzIoZS54MSk7IGgudTMyKGUuejEpOyBoLnUzMihlLnkwKTsgaC51MzIoZS55MSk7XG4gIH1cblxuICBsZXQgY2VsbHMgPSAwO1xuICBsZXQgZXhjbHVkZWRDZWxscyA9IDA7XG4gIGNvbnN0IHlpMCA9IHIueTAgLSBZX01JTjtcbiAgY29uc3QgeWkxID0gci55MSAtIFlfTUlOO1xuXG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IHlpID0geWkwOyB5aSA8PSB5aTE7IHlpKyspIHtcbiAgICAgIGNvbnN0IHkgPSBZX01JTiArIHlpO1xuICAgICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgICBjb25zdCB6ID0gb3ogKyBsejtcbiAgICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICAgIGNvbnN0IHggPSBveCArIGx4O1xuICAgICAgICAgIGlmIChlbnZlbG9wZS5sZW5ndGggPiAwICYmIGVudmVsb3BlQ29udGFpbnMoZW52ZWxvcGUsIHgsIHksIHopKSB7XG4gICAgICAgICAgICBleGNsdWRlZENlbGxzKys7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaC5ieXRlKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeWksIGx6KV0pO1xuICAgICAgICAgIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjZWxscywgZXhjbHVkZWRDZWxscywgY2h1bmtzOiBrZXlzLmxlbmd0aCwgcmVnaW9uOiByIH07XG59XG5cbi8qKiBDYW5vbmljYWwgaW52ZW50b3J5IGhhc2g7IGtleSBvcmRlciBjYW5ub3QgYWZmZWN0IHRoZSByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjppbnZlbnRvcnk6djEnKTtcbiAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHdvcmxkLmludmVudG9yeSkuc29ydCgpO1xuICBoLnUzMihrZXlzLmxlbmd0aCk7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBoLnN0cmluZyhrZXkpO1xuICAgIGgudTMyKHdvcmxkLmludmVudG9yeVtrZXldKTtcbiAgfVxuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGludmVudG9yeVNuYXBzaG90KHdvcmxkOiBXb3JsZCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMod29ybGQuaW52ZW50b3J5KS5zb3J0KCkpIG91dFtrZXldID0gd29ybGQuaW52ZW50b3J5W2tleV07XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGhhc2hFbnRpdHkoaDogSGFzaGVyLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaC5zdHJpbmcoZS5pZCk7XG4gIGguc3RyaW5nKGUua2luZCk7XG4gIGguc3RyaW5nKGUuY2h1bmspO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueCAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnkgKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS56ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUucm90ICogMTAwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnNjYWxlICogMTAwMCkpO1xuICBoLnUzMihlLnZhcmlhbnQpO1xuICBoLnN0cmluZyhlLnJlc291cmNlID8/ICcnKTtcbiAgaC51MzIoZS5yZW1haW5pbmcpO1xuICBoLnUzMihlLmhhcnZlc3RlZCA/IDEgOiAwKTtcbiAgaC51MzIoZS5oYXJ2ZXN0ZWRPbmNlID8gMSA6IDApO1xufVxuXG4vKiogSGFzaCBlbnRpdHkgc3RhdGU7IHdpdGggYSByZWdpb24sIG9ubHkgZW50aXRpZXMgcm9vdGVkIGluc2lkZSBpdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkOiBXb3JsZCwgcmVnaW9uPzogVm94ZWxSZWdpb24pOiBzdHJpbmcge1xuICBsZXQgZW50aXRpZXM6IEVudGl0eVtdO1xuICBpZiAocmVnaW9uKSB7XG4gICAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gICAgZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgICBlbnRpdGllcyA9IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uZmlsdGVyKFxuICAgICAgKGUpID0+IGUueCA+PSByLngwICYmIGUueCA8IHIueDEgKyAxICYmIGUueiA+PSByLnowICYmIGUueiA8IHIuejEgKyAxLFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgZW50aXRpZXMgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldO1xuICB9XG4gIGVudGl0aWVzLnNvcnQoKGEsIGIpID0+IChhLmlkIDwgYi5pZCA/IC0xIDogYS5pZCA+IGIuaWQgPyAxIDogMCkpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjplbnRpdHktc3RhdGU6djEnKTtcbiAgaC51MzIoZW50aXRpZXMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBlIG9mIGVudGl0aWVzKSBoYXNoRW50aXR5KGgsIGUpO1xuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuLyoqXG4gKiBDYW5vbmljYWwgaGFzaCBvZiBidWlsdCBzdHJ1Y3R1cmVzLiBMYXlvdXQgbW9kdWxlcyBhbmQgcGFpZCBjb3N0cyBhcmVcbiAqIGF1dGhvcml0YXRpdmUgc2ltdWxhdGlvbiBzdGF0ZTsgcmVuZGVyZXIgbWVzaGVzIGFyZSBub3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoKHdvcmxkOiBXb3JsZCk6IHN0cmluZyB7XG4gIGNvbnN0IHN0cnVjdHVyZXMgPSBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV1cbiAgICAuc29ydCgoYSwgYikgPT4gKGEuaWQgPCBiLmlkID8gLTEgOiBhLmlkID4gYi5pZCA/IDEgOiAwKSk7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnN0cnVjdHVyZS1zdGF0ZTp2MScpO1xuICBoLnUzMihzdHJ1Y3R1cmVzLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgcyBvZiBzdHJ1Y3R1cmVzKSB7XG4gICAgaC5zdHJpbmcocy5pZCk7XG4gICAgaC5zdHJpbmcocy5raW5kKTtcbiAgICBoLnN0cmluZyhzLnNpdGVJZCk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnggKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnkgKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnogKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnJvdCAqIDEwMDAwKSk7XG4gICAgLy8gTGVnYWN5IGhhc2ggaW5wdXQgaXMgYnl0ZS1pZGVudGljYWwuIERlc2lnbiAyIGFkZHMgYW4gZXhwbGljaXQgdGFnLlxuICAgIGlmIChzLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIGguc3RyaW5nKCdkZXNpZ246MicpO1xuICAgIGgudTMyKHMubW9kdWxlcy5sZW5ndGgpO1xuICAgIGZvciAoY29uc3QgbSBvZiBzLm1vZHVsZXMpIHtcbiAgICAgIGguc3RyaW5nKG0ua2luZCk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS55ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnogKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0udyAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS5oICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLmQgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKChtLnJvdCA/PyAwKSAqIDEwMDAwKSk7XG4gICAgICBoLnN0cmluZyhtLnRvbmUgPz8gJycpO1xuICAgIH1cbiAgICBjb25zdCBjb3N0S2V5cyA9IE9iamVjdC5rZXlzKHMuY29zdCkuc29ydCgpO1xuICAgIGgudTMyKGNvc3RLZXlzLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgY29zdEtleXMpIHtcbiAgICAgIGguc3RyaW5nKGtleSk7XG4gICAgICBoLnUzMihzLmNvc3Rba2V5IGFzIGtleW9mIHR5cGVvZiBzLmNvc3RdID8/IDApO1xuICAgIH1cbiAgICBoLnUzMihzLmJ1aWx0UmV2aXNpb24pO1xuICB9XG4gIHJldHVybiBoLmhleCgpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlSGFzaCB7XG4gIGhhc2g6IHN0cmluZztcbiAgY29sdW1uczogbnVtYmVyO1xuICBjaHVua3M6IG51bWJlcjtcbn1cblxuLyoqIERlcml2ZWQgY29sdW1uLWNhY2hlIGhhc2guIE5vdCBhdXRob3JpdGF0aXZlIHRlcnJhaW4gc3RhdGUuICovXG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlZENhY2hlSGFzaCh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24pOiBDYWNoZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOmRlcml2ZWQtY29sdW1uLWNhY2hlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpO1xuICBsZXQgY29sdW1ucyA9IDA7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICAgIGgudTMyKGNodW5rLmhlaWdodHNbY29sXSk7XG4gICAgICAgIGgudTMyKGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdKTtcbiAgICAgICAgY29sdW1ucysrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjb2x1bW5zLCBjaHVua3M6IGtleXMubGVuZ3RoIH07XG59XG5cbi8qKlxuICogUmVjb21wdXRlIGV2ZXJ5IGNvbHVtbiBjYWNoZSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHZveGVsIGRhdGEgYW5kIHJlcG9ydFxuICogbWlzbWF0Y2hlcy4gVGhpcyBwcm92ZXMgaGVpZ2h0cy90b3BNYXRlcmlhbHMgYXJlIGRlcml2ZWQsIG5vdCBhIHNlY29uZFxuICogdGVycmFpbiByZXByZXNlbnRhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRGVyaXZlZENhY2hlcyh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24sIGxpbWl0ID0gNjQpOiBDYWNoZU1pc21hdGNoW10ge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IG91dDogQ2FjaGVNaXNtYXRjaFtdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSBjb250aW51ZTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgICAgbGV0IHRvcE1hdCA9IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdO1xuICAgICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXhwZWN0ZWRIZWlnaHQgPSB0b3BTb2xpZCAtIFlfTUlOO1xuICAgICAgICBpZiAoY2h1bmsuaGVpZ2h0c1tjb2xdICE9PSBleHBlY3RlZEhlaWdodCkge1xuICAgICAgICAgIG91dC5wdXNoKHsgeDogb3ggKyBseCwgejogb3ogKyBseiwgZmllbGQ6ICdoZWlnaHQnLCBleHBlY3RlZDogZXhwZWN0ZWRIZWlnaHQsIGFjdHVhbDogY2h1bmsuaGVpZ2h0c1tjb2xdIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjaHVuay50b3BNYXRlcmlhbHNbY29sXSAhPT0gdG9wTWF0KSB7XG4gICAgICAgICAgb3V0LnB1c2goeyB4OiBveCArIGx4LCB6OiBveiArIGx6LCBmaWVsZDogJ21hdGVyaWFsJywgZXhwZWN0ZWQ6IHRvcE1hdCwgYWN0dWFsOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3V0Lmxlbmd0aCA+PSBsaW1pdCkgcmV0dXJuIG91dDtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBFZGl0T3V0c2lkZSB7XG4gIGNodW5rOiBzdHJpbmc7XG4gIGluZGV4OiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIG1hdGVyaWFsOiBudW1iZXI7XG59XG5cbi8qKiBFdmVyeSByZWNvcmRlZCB2b3hlbCBlZGl0IG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0c091dHNpZGVFbnZlbG9wZSh3b3JsZDogV29ybGQsIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogRWRpdE91dHNpZGVbXSB7XG4gIGNvbnN0IG91dDogRWRpdE91dHNpZGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGVkaXRzXSBvZiB3b3JsZC5lZGl0cykge1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gICAgZm9yIChjb25zdCBbaW5kZXgsIG1hdGVyaWFsXSBvZiBlZGl0cykge1xuICAgICAgY29uc3QgbHggPSBpbmRleCAlIENIVU5LX1NJWkU7XG4gICAgICBjb25zdCBseiA9IE1hdGguZmxvb3IoKGluZGV4ICUgQ0hVTktfQVJFQSkgLyBDSFVOS19TSVpFKTtcbiAgICAgIGNvbnN0IHlpID0gTWF0aC5mbG9vcihpbmRleCAvIENIVU5LX0FSRUEpO1xuICAgICAgY29uc3QgeCA9IG94ICsgbHgsIHogPSBveiArIGx6LCB5ID0gWV9NSU4gKyB5aTtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhlbnZlbG9wZSwgeCwgeSwgeikpIHtcbiAgICAgICAgb3V0LnB1c2goeyBjaHVuazoga2V5LCBpbmRleCwgeCwgeSwgeiwgbWF0ZXJpYWwgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIG91dC5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykgfHwgYS5pbmRleCAtIGIuaW5kZXgpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vKiogTmV3IGNodW5rcyBnZW5lcmF0ZWQgc2luY2UgdGhlIGJhc2VsaW5lIHRoYXQgZG8gbm90IG92ZXJsYXAgdGhlIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5ld0NodW5rc091dHNpZGVFbnZlbG9wZShcbiAgd29ybGQ6IFdvcmxkLCBiYXNlbGluZUtleXM6IEl0ZXJhYmxlPHN0cmluZz4sIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdLFxuKTogc3RyaW5nW10ge1xuICBjb25zdCBiYXNlbGluZSA9IG5ldyBTZXQoYmFzZWxpbmVLZXlzKTtcbiAgY29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGNodW5rXSBvZiB3b3JsZC5jaHVua3MpIHtcbiAgICBpZiAoYmFzZWxpbmUuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IG92ZXJsYXBzID0gZW52ZWxvcGUuc29tZShcbiAgICAgIChyKSA9PiBveCA8PSByLngxICYmIG94ICsgQ0hVTktfU0laRSAtIDEgPj0gci54MCAmJiBveiA8PSByLnoxICYmIG96ICsgQ0hVTktfU0laRSAtIDEgPj0gci56MCxcbiAgICApO1xuICAgIGlmICghb3ZlcmxhcHMpIG91dC5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIG91dC5zb3J0KCk7XG59XG5cbi8qKiBBbGwgY2h1bmsga2V5cyBjdXJyZW50bHkgbWF0ZXJpYWxpc2VkLCBzb3J0ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gY2h1bmtLZXlzKHdvcmxkOiBXb3JsZCk6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIFsuLi53b3JsZC5jaHVua3Mua2V5cygpXS5zb3J0KCk7XG59XG5cbi8qKiBCb3VuZGluZyB2b3hlbCByZWdpb24gY292ZXJpbmcgZXZlcnkgbWF0ZXJpYWxpc2VkIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkQ2h1bmtSZWdpb24od29ybGQ6IFdvcmxkKTogVm94ZWxSZWdpb24ge1xuICBpZiAod29ybGQuY2h1bmtzLnNpemUgPT09IDApIHRocm93IG5ldyBFcnJvcignd29ybGQgaGFzIG5vIGNodW5rcycpO1xuICBsZXQgbWluQ3ggPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN4ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBsZXQgbWluQ3ogPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN6ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IGNodW5rIG9mIHdvcmxkLmNodW5rcy52YWx1ZXMoKSkge1xuICAgIG1pbkN4ID0gTWF0aC5taW4obWluQ3gsIGNodW5rLmN4KTsgbWF4Q3ggPSBNYXRoLm1heChtYXhDeCwgY2h1bmsuY3gpO1xuICAgIG1pbkN6ID0gTWF0aC5taW4obWluQ3osIGNodW5rLmN6KTsgbWF4Q3ogPSBNYXRoLm1heChtYXhDeiwgY2h1bmsuY3opO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDA6IGNodW5rT3JpZ2luWChtaW5DeCksXG4gICAgejA6IGNodW5rT3JpZ2luWihtaW5DeiksXG4gICAgeDE6IGNodW5rT3JpZ2luWChtYXhDeCkgKyBDSFVOS19TSVpFIC0gMSxcbiAgICB6MTogY2h1bmtPcmlnaW5aKG1heEN6KSArIENIVU5LX1NJWkUgLSAxLFxuICAgIHkwOiBZX01JTixcbiAgICB5MTogWV9NQVggLSAxLFxuICB9O1xufVxuIiwgIi8vIE0wMDIgZGV0ZXJtaW5pc3RpYyBmaXh0dXJlIGFuZCBsaXZlLXdvcmxkIGxheW91dC5cbi8vXG4vLyBUaGUgZml4dHVyZSBpcyBhIGJvdW5kZWQgc2xpY2Ugb2YgdGhlIHJlYWwgMjA0OCBtIHdvcmxkIChzZWVkIDEzMzcpLCBub3QgYVxuLy8gc3ludGhldGljIGhlaWdodGZpZWxkLiBJdCBjb250YWluczpcbi8vICAgKiBhIHJlamVjdGVkIGhvdXNlIHNpdGUgb24gYSA3IG0gcml2ZXItYmFuayBzbG9wZTtcbi8vICAgKiBhIHZpYWJsZSBob3VzZSBzaGVsZiAyMCBtIGF3YXkgd2l0aCAyIG0gcmVsaWVmIGFuZCBubyBjbGVhcmluZyBuZWVkZWQ7XG4vLyAgICogYSAzIG0gZmFybSBzbG9wZSAyNyBtIGZyb20gdGhlIGhvdXNlIHdpdGggYSBuYXR1cmFsIGJsb3Nzb20gdHJlZSBhbmQgb3JlLlxuLy9cbi8vIFRoZSBzYW1lIGNvb3JkaW5hdGVzLCBxdWVyaWVzIGFuZCB2YWxpZGF0b3JzIGFyZSB1c2VkIGJ5IHRoZSBsaXZlLXdvcmxkXG4vLyBhY2NlcHRhbmNlIHRlc3QuIFRoZSBvbmx5IGRpZmZlcmVuY2UgaXMgaG93IG1hbnkgY2h1bmtzIGFyZSBtYXRlcmlhbGlzZWQuXG5pbXBvcnQge1xuICBXb3JsZCwgY3JlYXRlV29ybGQsIGdlbmVyYXRlV29ybGQsIGdlbmVyYXRlQ2h1bmssIHBsYWNlQXV0aG9yZWRTaXRlcyxcbiAgWV9NSU4sIFlfTUFYLCBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWixcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBSZWN0LCBWb3hlbFJlZ2lvbiB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBjaHVua0tleXMgfSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBNMDAyX1NFRUQgPSAxMzM3O1xuXG4vKiogUGlubmVkIHBhdGggc2l0ZSBpZCBmb3IgdGhlIGRvb3ItdG8tYXBwcm9hY2ggY29ycmlkb3IuICovXG5leHBvcnQgY29uc3QgTTAwMl9QQVRIX1NJVEVfSUQgPSAncGF0aC1ob3VzZS1mYXJtJztcblxuLyoqXG4gKiBQaW5uZWQgc3RlcHBlZCBwcm9maWxlIGZvciB0aGUgOSBtIHBhdGggZnJvbSB0aGUgaG91c2UgZG9vciAoeCA9IC01MykgdG8gdGhlXG4gKiBhcHByb2FjaCAoeCA9IC00NSkuIFRoZSByaXNlIGlzIDIgbSBvdmVyIDggbTsgZXZlcnkgc3RlcCBpcyBhdCBtb3N0IDEgbS5cbiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfUEFUSF9QUk9GSUxFID0gWzExLCAxMSwgMTEsIDEyLCAxMiwgMTIsIDEyLCAxMywgMTNdIGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIFRlcnJhY2VCYW5kU3BlYyB7XG4gIHowOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuLyoqIFBpbm5lZCBmYXJtIHRlcnJhY2VzLCBoaWdoIHNpZGUgZmlyc3QuICovXG5leHBvcnQgY29uc3QgTTAwMl9URVJSQUNFX0JBTkRTOiByZWFkb25seSBUZXJyYWNlQmFuZFNwZWNbXSA9IFtcbiAgeyB6MDogLTQyLCB6MTogLTQwLCB5OiAxNiB9LFxuICB7IHowOiAtMzksIHoxOiAtMzcsIHk6IDE1IH0sXG4gIHsgejA6IC0zNiwgejE6IC0zNSwgeTogMTQgfSxcbl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVNwZWMge1xuICBpZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgZG9vcjogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZhcm1TcGVjIHtcbiAgaWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgdGVycmFjZXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyTGF5b3V0IHtcbiAgc2VlZDogbnVtYmVyO1xuICByZWplY3RlZDogU2l0ZVNwZWM7XG4gIGhvdXNlOiBTaXRlU3BlYztcbiAgZmFybTogRmFybVNwZWM7XG4gIHNlYXJjaEFyZWE6IFJlY3Q7XG4gIHdvcmtab25lOiBSZWN0O1xuICBmaXh0dXJlQ2h1bmtzOiB7IGN4MDogbnVtYmVyOyBjejA6IG51bWJlcjsgY3gxOiBudW1iZXI7IGN6MTogbnVtYmVyIH07XG4gIHByb3RlY3RlZFJlZ2lvbjogVm94ZWxSZWdpb247XG4gIC8qKiBDb21wbGV0ZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUgZm9yIHRoZSBmaXJzdCBzbGljZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG59XG5cbmNvbnN0IEZJWFRVUkVfQ0hVTktTID0geyBjeDA6IDI4LCBjejA6IDI5LCBjeDE6IDMyLCBjejE6IDMyIH0gYXMgY29uc3Q7XG5cbmV4cG9ydCBjb25zdCBNMDAyX0xBWU9VVDogTTAwMkxheW91dCA9IHtcbiAgc2VlZDogTTAwMl9TRUVELFxuICByZWplY3RlZDoge1xuICAgIGlkOiAnc2l0ZS1hLXJlamVjdGVkJyxcbiAgICByZWN0OiB7IHgwOiAtNzQsIHowOiAtNjYsIHgxOiAtNjcsIHoxOiAtNjEgfSxcbiAgICAvLyBBIG5haXZlIGxvdy1zaWRlIGZsb29yOiB0aGUgdXBoaWxsIGNvcm5lciB3b3VsZCBuZWVkIDUgbSBvZiBleGNhdmF0aW9uLlxuICAgIGZsb29yWTogMyxcbiAgICBkb29yOiB7IHg6IC02NywgejogLTYzIH0sXG4gICAgYXBwcm9hY2g6IHsgeDogLTYwLCB6OiAtNjMgfSxcbiAgfSxcbiAgaG91c2U6IHtcbiAgICBpZDogJ3NpdGUtYi1ob3VzZScsXG4gICAgcmVjdDogeyB4MDogLTYwLCB6MDogLTQ2LCB4MTogLTUzLCB6MTogLTQxIH0sXG4gICAgZmxvb3JZOiAxMSxcbiAgICBkb29yOiB7IHg6IC01MywgejogLTQzIH0sXG4gICAgYXBwcm9hY2g6IHsgeDogLTQ1LCB6OiAtNDMgfSxcbiAgfSxcbiAgZmFybToge1xuICAgIGlkOiAnZmllbGQtYycsXG4gICAgcmVjdDogeyB4MDogLTM4LCB6MDogLTQyLCB4MTogLTI3LCB6MTogLTM1IH0sXG4gICAgdGVycmFjZXM6IDMsXG4gIH0sXG4gIHNlYXJjaEFyZWE6IHsgeDA6IC03NiwgejA6IC02OCwgeDE6IC00MCwgejE6IC00MCB9LFxuICB3b3JrWm9uZTogeyB4MDogLTc2LCB6MDogLTY4LCB4MTogLTIzLCB6MTogLTMxIH0sXG4gIGZpeHR1cmVDaHVua3M6IEZJWFRVUkVfQ0hVTktTLFxuICBwcm90ZWN0ZWRSZWdpb246IHtcbiAgICB4MDogY2h1bmtPcmlnaW5YKEZJWFRVUkVfQ0hVTktTLmN4MCksXG4gICAgejA6IGNodW5rT3JpZ2luWihGSVhUVVJFX0NIVU5LUy5jejApLFxuICAgIHgxOiBjaHVua09yaWdpblgoRklYVFVSRV9DSFVOS1MuY3gxKSArIDMxLFxuICAgIHoxOiBjaHVua09yaWdpblooRklYVFVSRV9DSFVOS1MuY3oxKSArIDMxLFxuICAgIHkwOiBZX01JTixcbiAgICB5MTogWV9NQVggLSAxLFxuICB9LFxuICBlbnZlbG9wZTogW1xuICAgIC8vIEhvdXNlIGZvb3RwcmludCBwbHVzIGEgMiBtIHByZXBhcmF0aW9uIGJ1ZmZlci5cbiAgICB7IHgwOiAtNjIsIHowOiAtNDgsIHgxOiAtNTEsIHoxOiAtMzksIHkwOiA4LCB5MTogMTYgfSxcbiAgICAvLyBEb29yLXRvLWFwcHJvYWNoIHBhdGggY29ycmlkb3IgcGx1cyBhIDEgbSBidWZmZXIuXG4gICAgeyB4MDogLTU0LCB6MDogLTQ0LCB4MTogLTQ0LCB6MTogLTQyLCB5MDogOSwgeTE6IDE1IH0sXG4gICAgLy8gRmFybSBmb290cHJpbnQgcGx1cyBhIDIgbSBwcmVwYXJhdGlvbiBidWZmZXIuXG4gICAgeyB4MDogLTQwLCB6MDogLTQ0LCB4MTogLTI1LCB6MTogLTMzLCB5MDogMTAsIHkxOiAyMCB9LFxuICBdLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBNMDAyV29ybGQge1xuICB3b3JsZDogV29ybGQ7XG4gIGxheW91dDogTTAwMkxheW91dDtcbiAgLyoqIFNvcnRlZCBjaHVuayBrZXlzIG1hdGVyaWFsaXNlZCBhdCBmaXh0dXJlIGNyZWF0aW9uLiAqL1xuICBjaHVua0tleXM6IHN0cmluZ1tdO1xufVxuXG4vKipcbiAqIFNtYWxsIGRldGVybWluaXN0aWMgZml4dHVyZTogdGhlIDIwIGNodW5rcyBjb3ZlcmluZyB0aGUgd29yayB6b25lIGFuZCBpdHNcbiAqIHByb3RlY3RlZCBzdXJyb3VuZGluZ3MuIEZhc3QgZW5vdWdoIGZvciB0aGUgZnVsbCB0ZXN0IHN1aXRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTTAwMkZpeHR1cmUoc2VlZCA9IE0wMDJfU0VFRCk6IE0wMDJXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCk7XG4gIGNvbnN0IHsgY3gwLCBjejAsIGN4MSwgY3oxIH0gPSBNMDAyX0xBWU9VVC5maXh0dXJlQ2h1bmtzO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykgZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4geyB3b3JsZCwgbGF5b3V0OiBNMDAyX0xBWU9VVCwgY2h1bmtLZXlzOiBjaHVua0tleXMod29ybGQpIH07XG59XG5cbi8qKlxuICogTGl2ZS13b3JsZCBpbnRlZ3JhdGlvbiB0YXJnZXQ6IHRoZSBzYW1lIHNlZWQgYW5kIHNpdGVzIHdpdGggYSA5IHggOSBjaHVua1xuICogbmVpZ2hib3VyaG9vZCAoODEgY2h1bmtzKSBhcm91bmQgdGhlIGZvdW5kZXIgdmFsbGV5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTTAwMkxpdmUoc2VlZCA9IE0wMDJfU0VFRCwgcmFkaXVzID0gNCk6IE0wMDJXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gZ2VuZXJhdGVXb3JsZChzZWVkLCByYWRpdXMpO1xuICByZXR1cm4geyB3b3JsZCwgbGF5b3V0OiBNMDAyX0xBWU9VVCwgY2h1bmtLZXlzOiBjaHVua0tleXMod29ybGQpIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBRUEsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTs7O0FDS25CLElBQU0sU0FBUyxvQkFBSSxRQUE2QjtBQWV6QyxTQUFTLGNBQWMsT0FBd0I7QUFDcEQsU0FBTyxPQUFPLElBQUksS0FBSyxHQUFHLFVBQVU7QUFDdEM7OztBQ3RCTyxJQUFNLFFBQVEsQ0FBQyxHQUFXLEdBQVcsTUFBZSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksSUFBSTtBQUM1RSxJQUFNLE9BQU8sQ0FBQyxHQUFXLEdBQVcsTUFBYyxLQUFLLElBQUksS0FBSztBQUNoRSxJQUFNLGFBQWEsQ0FBQyxJQUFZLElBQVksTUFBYztBQUMvRCxRQUFNLElBQUksT0FBTyxJQUFJLE9BQU8sS0FBSyxLQUFLLEdBQUcsQ0FBQztBQUMxQyxTQUFPLElBQUksS0FBSyxJQUFJLElBQUk7QUFDMUI7QUFHTyxTQUFTLE9BQU8sR0FBVyxHQUFXLE1BQXNCO0FBQ2pFLE1BQUksSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FBRyxTQUFTO0FBQy9ELE1BQUksS0FBSyxLQUFLLElBQUssTUFBTSxJQUFLLFVBQVU7QUFDeEMsV0FBUyxJQUFLLE1BQU0sUUFBUyxLQUFLO0FBQ3BDO0FBRU8sU0FBUyxPQUFPLEdBQVcsR0FBVyxHQUFXLE1BQXNCO0FBQzVFLE1BQUksSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FBRyxTQUFTLElBQUksS0FBSyxL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QU8sTUFBTSxLQUFLLElBQUksT0FBTyxNQUFNLEtBQUssRUFBRTtBQUFBLEVBQzdDLEdBQUc7QUFDRCxXQUFPO0FBQUEsTUFDTCxpQkFBaUIsTUFBTSxVQUFVLEdBQUcsT0FBTyxNQUFNLFFBQVEsQ0FBQztBQUFBLE1BQzFEO0FBQUEsTUFDQSxtQkFBbUIsQ0FBQyxJQUFJLE9BQU8sTUFBTSxNQUFNLElBQUksQ0FBQztBQUFBLElBQ2xEO0FBQUEsRUFDRjtBQUVBLFFBQU0sT0FBTztBQUFBLElBQ1g7QUFBQSxJQUNBLFNBQVMsY0FBYyxFQUFFLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxHQUFHLEVBQUU7QUFBQSxJQUNoRSxFQUFFLE1BQU0sRUFBRSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsVUFBVSxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLEVBQ3pEO0FBQ0EsU0FBTyxNQUFNLEtBQUssT0FBTyxPQUFPO0FBQ2hDLFNBQU8sTUFBTSxLQUFLLFFBQVEsUUFBUSxDQUFDO0FBQ25DLFNBQU8sTUFBTSxLQUFLLFdBQVcsV0FBVyxDQUFDO0FBQ3pDLFNBQU8sTUFBTSxLQUFLLFdBQVcsWUFBWSxDQUFDO0FBQzFDLFNBQU8sTUFBTSxLQUFLLFdBQVcsb0JBQW9CLENBQUM7QUFDbEQsU0FBTyxNQUFNLEtBQUssUUFBUSxVQUFVLElBQUk7QUFHeEMsU0FBTyxVQUFVLFlBQVksS0FBSyxHQUFHLE1BQU07QUFDN0MsQ0FBQzsiLAogICJuYW1lcyI6IFsiYSIsICJiIiwgInNtb290aCIsICJpZCIsICJwcm9wb3NhbCIsICJvdmVybGFwcyJdCn0K
