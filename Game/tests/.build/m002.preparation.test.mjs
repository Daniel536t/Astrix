// tests/m002.preparation.test.ts
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
function planPreparation(world, proposal2, options = {}) {
  const rect = normalizeRect(proposal2.rect);
  const validation = validateSite(world, proposal2);
  if (validation.state === "invalid") {
    return {
      ok: false,
      stage: "plan",
      code: "site_invalid",
      reasons: validation.reasons.map((r) => `${r.code}: ${r.message}`),
      validation
    };
  }
  const targets = sortedTargets(options.targets ?? defaultTargets(world, rect, proposal2.floorY));
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
    const reasons = targetRuleReasons(stats, proposal2.rules);
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
    siteId: proposal2.siteId,
    rect,
    floorY: proposal2.floorY,
    rules: proposal2.rules,
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
function prepareSite(world, authorizer, proposal2, options = {}) {
  const planned = planPreparation(world, proposal2, options);
  if (!planned.ok) return planned;
  const decision = authorizer.authorize(world, planned.plan);
  if (!decision.ok || !decision.authorization) {
    return fail("authorize", "not_authorized", decision.reasons);
  }
  return executePreparation(world, planned.plan, decision.authorization);
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

// tests/m002.preparation.test.ts
function fingerprint(world) {
  return {
    revision: world.revision,
    voxels: canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash,
    outside: canonicalRegionHash(world, M002_LAYOUT.protectedRegion, M002_LAYOUT.envelope).hash,
    entities: canonicalEntityHash(world, M002_LAYOUT.protectedRegion),
    inventory: canonicalInventoryHash(world)
  };
}
function proposal(siteId, rect = M002_LAYOUT.house.rect, floorY = M002_LAYOUT.house.floorY) {
  return { siteId, rect, floorY, rules: HOUSE_RULES };
}
function housePolicy() {
  return new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
}
test("planning is read-only, deterministic and bounded", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const first = planPreparation(world, proposal(layout.house.id));
  const second = planPreparation(world, proposal(layout.house.id));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.plan.targets.length, 48);
  assert.ok(first.plan.targets.every((t) => t.y === layout.house.floorY));
  assert.deepEqual(first.plan.clearEntityIds, []);
  assert.equal(first.plan.expected.cutVolume, 3);
  assert.equal(first.plan.expected.fillVolume, 18);
  assert.equal(first.plan.expected.obstructions, 0);
  assert.equal(planDigest(first.plan), planDigest(second.plan));
  assert.equal(first.plan.id, second.plan.id);
  assert.equal(first.plan.envelope.length, 1);
  const e = first.plan.envelope[0];
  assert.ok(e.x0 >= -62 && e.x1 <= -51 && e.z0 >= -48 && e.z1 <= -39);
  assert.ok(e.y0 >= 8 && e.y1 <= 16);
  assert.deepEqual(fingerprint(world), before);
  const rejected = planPreparation(world, proposal(
    layout.rejected.id,
    layout.rejected.rect,
    layout.rejected.floorY
  ));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.stage, "plan");
    assert.equal(rejected.code, "site_invalid");
    assert.ok(rejected.reasons.length >= 4);
  }
  assert.deepEqual(fingerprint(world), before);
});
test("house preparation applies exactly the planned voxel edits", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const authorizer = housePolicy();
  const planned = planPreparation(world, proposal(layout.house.id));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const decision = authorizer.authorize(world, planned.plan);
  assert.equal(decision.ok, true);
  assert.ok(decision.authorization);
  const result = executePreparation(world, planned.plan, decision.authorization);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { ledger } = result;
  assert.equal(ledger.authority, "local-stub");
  assert.equal(ledger.enforcement, "local-simulation-only");
  assert.equal(ledger.planDigest, planDigest(planned.plan));
  assert.equal(ledger.cutVolume, 3);
  assert.equal(ledger.fillVolume, 18);
  assert.equal(ledger.netSpoil, -15);
  assert.equal(ledger.borrowedFill, 15);
  assert.equal(ledger.voxelEdits, 21);
  assert.deepEqual(ledger.cutByMaterial, { grass: 3 });
  assert.deepEqual(ledger.fillByMaterial, { grass: 18 });
  assert.deepEqual(ledger.entitiesCleared, []);
  assert.deepEqual(ledger.resourcesGained, {});
  assert.deepEqual(ledger.inventoryBefore, {});
  assert.deepEqual(ledger.inventoryAfter, {});
  assert.equal(ledger.revisionAfter - ledger.revisionBefore, 21);
  assert.equal(ledger.chunkDeltas.length, 1);
  assert.deepEqual(ledger.chunkDeltas[0], {
    chunk: "30,30",
    changed: 21,
    added: 18,
    removed: 3
  });
  for (let z = layout.house.rect.z0; z <= layout.house.rect.z1; z++) {
    for (let x = layout.house.rect.x0; x <= layout.house.rect.x1; x++) {
      assert.equal(surfaceAt(world, x, z), layout.house.floorY, `column ${x},${z}`);
    }
  }
  const after = fingerprint(world);
  assert.equal(after.outside, before.outside);
  assert.equal(after.entities, before.entities);
  assert.equal(after.inventory, before.inventory);
  assert.notEqual(after.voxels, before.voxels);
  assert.deepEqual(editsOutsideEnvelope(world, layout.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, layout.protectedRegion), []);
  assert.ok(world.dirty.has("30,30"));
  const replay = executePreparation(world, planned.plan, decision.authorization);
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.code, "stale_authorization");
  assert.deepEqual(fingerprint(world), after);
});
test("preparation clears authorized obstructions and credits their resources", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const entityCount = world.entities.size;
  const authorizer = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
  const result = prepareSite(world, authorizer, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { ledger } = result;
  assert.equal(ledger.cutVolume, 41);
  assert.equal(ledger.fillVolume, 22);
  assert.equal(ledger.voxelEdits, 63);
  assert.deepEqual(ledger.entitiesCleared.map((e) => e.entityId), [
    "hero:styl_ore:-38:-42",
    "hero:styl_tree_blossom:-28:-38"
  ]);
  assert.deepEqual(ledger.resourcesGained, { ore: 8, wood: 12 });
  assert.deepEqual(ledger.inventoryAfter, { ore: 8, wood: 12 });
  assert.equal(world.entities.size, entityCount - 2);
  assert.equal(world.entities.has("hero:styl_ore:-38:-42"), false);
  assert.equal(world.entities.has("hero:styl_tree_blossom:-28:-38"), false);
  const chunkTotals = ledger.chunkDeltas.reduce((sum, d) => ({
    changed: sum.changed + d.changed,
    added: sum.added + d.added,
    removed: sum.removed + d.removed
  }), { changed: 0, added: 0, removed: 0 });
  assert.deepEqual(chunkTotals, { changed: 63, added: 22, removed: 41 });
  for (let z = layout.farm.rect.z0; z <= layout.farm.rect.z1; z++) {
    for (let x = layout.farm.rect.x0; x <= layout.farm.rect.x1; x++) {
      assert.equal(surfaceAt(world, x, z), 15, `column ${x},${z}`);
    }
  }
  const after = fingerprint(world);
  assert.equal(after.outside, before.outside);
  assert.notEqual(after.entities, before.entities);
  assert.notEqual(after.inventory, before.inventory);
  assert.deepEqual(editsOutsideEnvelope(world, layout.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, layout.protectedRegion), []);
});
test("execution rejects forged, stale or over-limit authorization before writing", () => {
  const { world, layout } = createM002Fixture();
  const planned = planPreparation(world, proposal(layout.house.id));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const authorizer = housePolicy();
  const decision = authorizer.authorize(world, planned.plan);
  assert.equal(decision.ok, true);
  const auth = decision.authorization;
  const before = fingerprint(world);
  const forgedDigest = executePreparation(world, planned.plan, {
    ...auth,
    planDigest: "0000000000000000"
  });
  assert.equal(forgedDigest.ok, false);
  if (!forgedDigest.ok) assert.equal(forgedDigest.code, "digest_mismatch");
  const forgedAuthority = executePreparation(world, planned.plan, {
    ...auth,
    authority: "magicblock"
  });
  assert.equal(forgedAuthority.ok, false);
  if (!forgedAuthority.ok) assert.equal(forgedAuthority.code, "unsupported_authority");
  const narrowed = executePreparation(world, planned.plan, {
    ...auth,
    envelope: [{ ...auth.envelope[0], y1: auth.envelope[0].y0 }]
  });
  assert.equal(narrowed.ok, false);
  if (!narrowed.ok) assert.equal(narrowed.code, "envelope_mismatch");
  const limited = new LocalAuthorizer({
    envelope: M002_LAYOUT.envelope,
    limits: { maxCutVolume: 1 }
  }).authorize(world, planned.plan);
  assert.equal(limited.ok, false);
  assert.ok(limited.reasons.some((r) => r.includes("cut 3 exceeds limit 1")));
  const outsidePolicy = new LocalAuthorizer({
    envelope: [M002_LAYOUT.envelope[2]]
  }).authorize(world, planned.plan);
  assert.equal(outsidePolicy.ok, false);
  assert.ok(outsidePolicy.reasons.some((r) => r.includes("outside the local policy")));
  assert.deepEqual(fingerprint(world), before);
  assert.equal(setVoxel(world, -45, surfaceAt(world, -45, -43), -43, MAT.STONE), true);
  const afterManualEdit = fingerprint(world);
  const stale = executePreparation(world, planned.plan, auth);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "stale_authorization");
  assert.deepEqual(fingerprint(world), afterManualEdit);
});
test("preparation is deterministic across independent replays", () => {
  const a = createM002Fixture();
  const b = createM002Fixture();
  const ra = prepareSite(a.world, housePolicy(), proposal(a.layout.house.id));
  const rb = prepareSite(b.world, housePolicy(), proposal(b.layout.house.id));
  assert.equal(ra.ok, true);
  assert.equal(rb.ok, true);
  if (!ra.ok || !rb.ok) return;
  assert.deepEqual(ra.ledger, rb.ledger);
  assert.equal(ra.authorization.id, rb.authorization.id);
  assert.deepEqual(
    canonicalRegionHash(a.world, a.layout.protectedRegion),
    canonicalRegionHash(b.world, b.layout.protectedRegion)
  );
  assert.equal(
    canonicalEntityHash(a.world, a.layout.protectedRegion),
    canonicalEntityHash(b.world, b.layout.protectedRegion)
  );
  assert.equal(canonicalInventoryHash(a.world), canonicalInventoryHash(b.world));
});
test("planning rejects malformed targets and uncleared obstructions", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const base = proposal(layout.house.id);
  const planned = planPreparation(world, base);
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const missing = planPreparation(world, base, {
    targets: planned.plan.targets.slice(0, -1)
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "target_count");
  const duplicate = planPreparation(world, base, {
    targets: planned.plan.targets.map((t, i) => i === 1 ? { ...planned.plan.targets[0] } : t)
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, "duplicate_target");
  const outside = planPreparation(world, base, {
    targets: planned.plan.targets.map((t, i) => i === 0 ? { ...t, x: t.x - 10 } : t)
  });
  assert.equal(outside.ok, false);
  if (!outside.ok) assert.equal(outside.code, "target_outside_footprint");
  const badHeight = planPreparation(world, base, {
    targets: planned.plan.targets.map((t, i) => i === 0 ? { ...t, y: 500 } : t)
  });
  assert.equal(badHeight.ok, false);
  if (!badHeight.ok) assert.equal(badHeight.code, "target_height");
  const uncleared = planPreparation(world, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  }, { clear: "none" });
  assert.equal(uncleared.ok, false);
  if (!uncleared.ok) assert.equal(uncleared.code, "uncleared_obstructions");
  assert.deepEqual(fingerprint(world), before);
});
test("executor refuses a plan whose obstruction set changed after authorization", () => {
  const { world, layout } = createM002Fixture();
  const planned = planPreparation(world, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const auth = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope }).authorize(world, planned.plan);
  assert.equal(auth.ok, true);
  if (!auth.ok) return;
  const extra = {
    id: "test:extra-rock",
    kind: "styl_ore",
    chunk: "30,30",
    x: -32.5,
    y: 16,
    z: -38.5,
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
  world.entities.set(extra.id, extra);
  world.entityChunks.get("30,30").push(extra.id);
  const before = fingerprint(world);
  const result = executePreparation(world, planned.plan, auth.authorization);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "unauthorized_edits");
  assert.deepEqual(fingerprint(world), before);
});
test("the execution guard rejects a plan that escapes its own envelope", () => {
  const { world, layout } = createM002Fixture();
  const planned = planPreparation(world, proposal(layout.house.id));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const auth = housePolicy().authorize(world, planned.plan);
  assert.equal(auth.ok, true);
  if (!auth.ok) return;
  const targets = planned.plan.targets.map((t, i) => i === 0 ? { ...t, x: -80 } : t);
  const forged = { ...planned.plan, targets };
  forged.id = `prep:${planDigest(forged)}`;
  const before = fingerprint(world);
  const result = executePreparation(world, forged, {
    ...auth.authorization,
    planDigest: planDigest(forged)
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "unauthorized_edits");
  assert.ok(result.reasons.some((r) => r.includes("outside the footprint") || r.includes("outside the authorized envelope")));
  assert.deepEqual(fingerprint(world), before);
});
test("authorized execution never touches voxels outside the work envelope", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const authorizer = housePolicy();
  const house = prepareSite(world, authorizer, proposal(layout.house.id));
  assert.equal(house.ok, true);
  const farm = prepareSite(world, authorizer, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  });
  assert.equal(farm.ok, true);
  assert.deepEqual(editsOutsideEnvelope(world, layout.envelope), []);
  assert.equal(
    canonicalRegionHash(world, layout.protectedRegion, layout.envelope).hash,
    before.outside
  );
  assert.equal(surfaceAt(world, layout.house.rect.x0, layout.house.rect.z0), 11);
  assert.equal(surfaceAt(world, layout.farm.rect.x0, layout.farm.rect.z0), 15);
  assert.equal(getVoxel(world, layout.house.rect.x0, 11, layout.house.rect.z0), MAT.AIR);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMi5wcmVwYXJhdGlvbi50ZXN0LnRzIiwgIi4uLy4uL3NyYy9zaW0vc3RvbmUtY29tcGF0LnRzIiwgIi4uLy4uL3NyYy9zaW0vbm9pc2UudHMiLCAiLi4vLi4vc3JjL3NpbS9oeWRyb2xvZ3kudHMiLCAiLi4vLi4vc3JjL3NpbS9tYXRlcmlhbHMudHMiLCAiLi4vLi4vc3JjL3NpbS90ZXJyYWluLXYyLnRzIiwgIi4uLy4uL3NyYy9zaW0vd29ybGQudHMiLCAiLi4vLi4vc3JjL3NpbS90ZXJyYWluLnRzIiwgIi4uLy4uL3NyYy9zaW0vY29uc3RydWN0aW9uLnRzIiwgIi4uLy4uL3NyYy9zaW0vcHJlcGFyYXRpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9jYW5vbmljYWwudHMiLCAiLi4vLi4vc3JjL3NpbS9tMDAyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBNMDAyIHN0YWdlIDMgZ2F0ZTogcGxhbiAtPiBhdXRob3JpemUgLT4gZXhlY3V0ZSwgd2l0aCBleGFjdCBsZWRnZXIsXG4vLyBjaHVuayBkZWx0YXMgYW5kIGEgbm8tZmxhdHRlbiBwcm9vZiBvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlLlxuaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCB7XG4gIE1BVCwgc3VyZmFjZUF0LCBzZXRWb3hlbCwgZ2V0Vm94ZWwsXG59IGZyb20gJy4uL3NyYy9zaW0vd29ybGQnO1xuaW1wb3J0IHtcbiAgY2Fub25pY2FsUmVnaW9uSGFzaCwgY2Fub25pY2FsRW50aXR5SGFzaCwgY2Fub25pY2FsSW52ZW50b3J5SGFzaCxcbiAgY2hlY2tEZXJpdmVkQ2FjaGVzLCBlZGl0c091dHNpZGVFbnZlbG9wZSxcbn0gZnJvbSAnLi4vc3JjL3NpbS9jYW5vbmljYWwnO1xuaW1wb3J0IHsgY3JlYXRlTTAwMkZpeHR1cmUsIE0wMDJfTEFZT1VUIH0gZnJvbSAnLi4vc3JjL3NpbS9tMDAyJztcbmltcG9ydCB7IEhPVVNFX1JVTEVTLCBGQVJNX1JVTEVTLCBTaXRlUHJvcG9zYWwgfSBmcm9tICcuLi9zcmMvc2ltL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBwbGFuUHJlcGFyYXRpb24sIHBsYW5EaWdlc3QsIHByZXBhcmVTaXRlLCBleGVjdXRlUHJlcGFyYXRpb24sXG4gIExvY2FsQXV0aG9yaXplciwgUHJlcGFyYXRpb25QbGFuLFxufSBmcm9tICcuLi9zcmMvc2ltL3ByZXBhcmF0aW9uJztcblxudHlwZSBXb3JsZCA9IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZU0wMDJGaXh0dXJlPlsnd29ybGQnXTtcblxuZnVuY3Rpb24gZmluZ2VycHJpbnQod29ybGQ6IFdvcmxkKSB7XG4gIHJldHVybiB7XG4gICAgcmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgIHZveGVsczogY2Fub25pY2FsUmVnaW9uSGFzaCh3b3JsZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uKS5oYXNoLFxuICAgIG91dHNpZGU6IGNhbm9uaWNhbFJlZ2lvbkhhc2god29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiwgTTAwMl9MQVlPVVQuZW52ZWxvcGUpLmhhc2gsXG4gICAgZW50aXRpZXM6IGNhbm9uaWNhbEVudGl0eUhhc2god29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiksXG4gICAgaW52ZW50b3J5OiBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKHdvcmxkKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gcHJvcG9zYWwoc2l0ZUlkOiBzdHJpbmcsIHJlY3QgPSBNMDAyX0xBWU9VVC5ob3VzZS5yZWN0LCBmbG9vclkgPSBNMDAyX0xBWU9VVC5ob3VzZS5mbG9vclkpOiBTaXRlUHJvcG9zYWwge1xuICByZXR1cm4geyBzaXRlSWQsIHJlY3QsIGZsb29yWSwgcnVsZXM6IEhPVVNFX1JVTEVTIH07XG59XG5cbmZ1bmN0aW9uIGhvdXNlUG9saWN5KCkge1xuICByZXR1cm4gbmV3IExvY2FsQXV0aG9yaXplcih7IGVudmVsb3BlOiBNMDAyX0xBWU9VVC5lbnZlbG9wZSB9KTtcbn1cblxudGVzdCgncGxhbm5pbmcgaXMgcmVhZC1vbmx5LCBkZXRlcm1pbmlzdGljIGFuZCBib3VuZGVkJywgKCkgPT4ge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG4gIGNvbnN0IGJlZm9yZSA9IGZpbmdlcnByaW50KHdvcmxkKTtcblxuICBjb25zdCBmaXJzdCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwobGF5b3V0LmhvdXNlLmlkKSk7XG4gIGNvbnN0IHNlY29uZCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwobGF5b3V0LmhvdXNlLmlkKSk7XG4gIGFzc2VydC5lcXVhbChmaXJzdC5vaywgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChzZWNvbmQub2ssIHRydWUpO1xuICBpZiAoIWZpcnN0Lm9rIHx8ICFzZWNvbmQub2spIHJldHVybjtcblxuICBhc3NlcnQuZXF1YWwoZmlyc3QucGxhbi50YXJnZXRzLmxlbmd0aCwgNDgpO1xuICBhc3NlcnQub2soZmlyc3QucGxhbi50YXJnZXRzLmV2ZXJ5KCh0KSA9PiB0LnkgPT09IGxheW91dC5ob3VzZS5mbG9vclkpKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChmaXJzdC5wbGFuLmNsZWFyRW50aXR5SWRzLCBbXSk7XG4gIGFzc2VydC5lcXVhbChmaXJzdC5wbGFuLmV4cGVjdGVkLmN1dFZvbHVtZSwgMyk7XG4gIGFzc2VydC5lcXVhbChmaXJzdC5wbGFuLmV4cGVjdGVkLmZpbGxWb2x1bWUsIDE4KTtcbiAgYXNzZXJ0LmVxdWFsKGZpcnN0LnBsYW4uZXhwZWN0ZWQub2JzdHJ1Y3Rpb25zLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKHBsYW5EaWdlc3QoZmlyc3QucGxhbiksIHBsYW5EaWdlc3Qoc2Vjb25kLnBsYW4pKTtcbiAgYXNzZXJ0LmVxdWFsKGZpcnN0LnBsYW4uaWQsIHNlY29uZC5wbGFuLmlkKTtcblxuICAvLyBUaGUgcGxhbiBlbnZlbG9wZSBpcyB0aWdodCBhbmQgaW5zaWRlIHRoZSBwaW5uZWQgTTAwMiB3b3JrIGVudmVsb3BlLlxuICBhc3NlcnQuZXF1YWwoZmlyc3QucGxhbi5lbnZlbG9wZS5sZW5ndGgsIDEpO1xuICBjb25zdCBlID0gZmlyc3QucGxhbi5lbnZlbG9wZVswXTtcbiAgYXNzZXJ0Lm9rKGUueDAgPj0gLTYyICYmIGUueDEgPD0gLTUxICYmIGUuejAgPj0gLTQ4ICYmIGUuejEgPD0gLTM5KTtcbiAgYXNzZXJ0Lm9rKGUueTAgPj0gOCAmJiBlLnkxIDw9IDE2KTtcblxuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYmVmb3JlKTtcblxuICAvLyBBIHJlamVjdGVkIHNpdGUgY2Fubm90IHByb2R1Y2UgYSBwbGFuIG9yIGFuIGVkaXQuXG4gIGNvbnN0IHJlamVjdGVkID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBwcm9wb3NhbChcbiAgICBsYXlvdXQucmVqZWN0ZWQuaWQsIGxheW91dC5yZWplY3RlZC5yZWN0LCBsYXlvdXQucmVqZWN0ZWQuZmxvb3JZLFxuICApKTtcbiAgYXNzZXJ0LmVxdWFsKHJlamVjdGVkLm9rLCBmYWxzZSk7XG4gIGlmICghcmVqZWN0ZWQub2spIHtcbiAgICBhc3NlcnQuZXF1YWwocmVqZWN0ZWQuc3RhZ2UsICdwbGFuJyk7XG4gICAgYXNzZXJ0LmVxdWFsKHJlamVjdGVkLmNvZGUsICdzaXRlX2ludmFsaWQnKTtcbiAgICBhc3NlcnQub2socmVqZWN0ZWQucmVhc29ucy5sZW5ndGggPj0gNCk7XG4gIH1cbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGJlZm9yZSk7XG59KTtcblxudGVzdCgnaG91c2UgcHJlcGFyYXRpb24gYXBwbGllcyBleGFjdGx5IHRoZSBwbGFubmVkIHZveGVsIGVkaXRzJywgKCkgPT4ge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG4gIGNvbnN0IGJlZm9yZSA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3QgYXV0aG9yaXplciA9IGhvdXNlUG9saWN5KCk7XG5cbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwobGF5b3V0LmhvdXNlLmlkKSk7XG4gIGFzc2VydC5lcXVhbChwbGFubmVkLm9rLCB0cnVlKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm47XG4gIGNvbnN0IGRlY2lzaW9uID0gYXV0aG9yaXplci5hdXRob3JpemUod29ybGQsIHBsYW5uZWQucGxhbik7XG4gIGFzc2VydC5lcXVhbChkZWNpc2lvbi5vaywgdHJ1ZSk7XG4gIGFzc2VydC5vayhkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcblxuICBjb25zdCByZXN1bHQgPSBleGVjdXRlUHJlcGFyYXRpb24od29ybGQsIHBsYW5uZWQucGxhbiwgZGVjaXNpb24uYXV0aG9yaXphdGlvbiEpO1xuICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCB0cnVlKTtcbiAgaWYgKCFyZXN1bHQub2spIHJldHVybjtcbiAgY29uc3QgeyBsZWRnZXIgfSA9IHJlc3VsdDtcblxuICBhc3NlcnQuZXF1YWwobGVkZ2VyLmF1dGhvcml0eSwgJ2xvY2FsLXN0dWInKTtcbiAgYXNzZXJ0LmVxdWFsKGxlZGdlci5lbmZvcmNlbWVudCwgJ2xvY2FsLXNpbXVsYXRpb24tb25seScpO1xuICBhc3NlcnQuZXF1YWwobGVkZ2VyLnBsYW5EaWdlc3QsIHBsYW5EaWdlc3QocGxhbm5lZC5wbGFuKSk7XG4gIGFzc2VydC5lcXVhbChsZWRnZXIuY3V0Vm9sdW1lLCAzKTtcbiAgYXNzZXJ0LmVxdWFsKGxlZGdlci5maWxsVm9sdW1lLCAxOCk7XG4gIGFzc2VydC5lcXVhbChsZWRnZXIubmV0U3BvaWwsIC0xNSk7XG4gIGFzc2VydC5lcXVhbChsZWRnZXIuYm9ycm93ZWRGaWxsLCAxNSk7XG4gIGFzc2VydC5lcXVhbChsZWRnZXIudm94ZWxFZGl0cywgMjEpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGxlZGdlci5jdXRCeU1hdGVyaWFsLCB7IGdyYXNzOiAzIH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGxlZGdlci5maWxsQnlNYXRlcmlhbCwgeyBncmFzczogMTggfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwobGVkZ2VyLmVudGl0aWVzQ2xlYXJlZCwgW10pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGxlZGdlci5yZXNvdXJjZXNHYWluZWQsIHt9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChsZWRnZXIuaW52ZW50b3J5QmVmb3JlLCB7fSk7XG4gIGFzc2VydC5kZWVwRXF1YWwobGVkZ2VyLmludmVudG9yeUFmdGVyLCB7fSk7XG4gIGFzc2VydC5lcXVhbChsZWRnZXIucmV2aXNpb25BZnRlciAtIGxlZGdlci5yZXZpc2lvbkJlZm9yZSwgMjEpO1xuXG4gIGFzc2VydC5lcXVhbChsZWRnZXIuY2h1bmtEZWx0YXMubGVuZ3RoLCAxKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChsZWRnZXIuY2h1bmtEZWx0YXNbMF0sIHtcbiAgICBjaHVuazogJzMwLDMwJywgY2hhbmdlZDogMjEsIGFkZGVkOiAxOCwgcmVtb3ZlZDogMyxcbiAgfSk7XG5cbiAgLy8gRXZlcnkgZm9vdHByaW50IGNvbHVtbiBub3cgaGFzIHRoZSBwcmVwYXJlZCB3YWxraW5nIGZsb29yLlxuICBmb3IgKGxldCB6ID0gbGF5b3V0LmhvdXNlLnJlY3QuejA7IHogPD0gbGF5b3V0LmhvdXNlLnJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSBsYXlvdXQuaG91c2UucmVjdC54MDsgeCA8PSBsYXlvdXQuaG91c2UucmVjdC54MTsgeCsrKSB7XG4gICAgICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KHdvcmxkLCB4LCB6KSwgbGF5b3V0LmhvdXNlLmZsb29yWSwgYGNvbHVtbiAke3h9LCR7en1gKTtcbiAgICB9XG4gIH1cblxuICAvLyBObyB0ZXJyYWluIG9yIHJlc291cmNlIGNoYW5nZSBvdXRzaWRlIHRoZSBjb21wbGV0ZSBhdXRob3JpemVkIGVudmVsb3BlLlxuICBjb25zdCBhZnRlciA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgYXNzZXJ0LmVxdWFsKGFmdGVyLm91dHNpZGUsIGJlZm9yZS5vdXRzaWRlKTtcbiAgYXNzZXJ0LmVxdWFsKGFmdGVyLmVudGl0aWVzLCBiZWZvcmUuZW50aXRpZXMpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIuaW52ZW50b3J5LCBiZWZvcmUuaW52ZW50b3J5KTtcbiAgYXNzZXJ0Lm5vdEVxdWFsKGFmdGVyLnZveGVscywgYmVmb3JlLnZveGVscyk7XG4gIGFzc2VydC5kZWVwRXF1YWwoZWRpdHNPdXRzaWRlRW52ZWxvcGUod29ybGQsIGxheW91dC5lbnZlbG9wZSksIFtdKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChjaGVja0Rlcml2ZWRDYWNoZXMod29ybGQsIGxheW91dC5wcm90ZWN0ZWRSZWdpb24pLCBbXSk7XG4gIGFzc2VydC5vayh3b3JsZC5kaXJ0eS5oYXMoJzMwLDMwJykpO1xuXG4gIC8vIFJlcGxheWluZyB0aGUgc2FtZSB0b2tlbiBpcyBhIHN0YWxlIG5vLW9wLCBub3QgYSBzZWNvbmQgZXhjYXZhdGlvbi5cbiAgY29uc3QgcmVwbGF5ID0gZXhlY3V0ZVByZXBhcmF0aW9uKHdvcmxkLCBwbGFubmVkLnBsYW4sIGRlY2lzaW9uLmF1dGhvcml6YXRpb24hKTtcbiAgYXNzZXJ0LmVxdWFsKHJlcGxheS5vaywgZmFsc2UpO1xuICBpZiAoIXJlcGxheS5vaykgYXNzZXJ0LmVxdWFsKHJlcGxheS5jb2RlLCAnc3RhbGVfYXV0aG9yaXphdGlvbicpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYWZ0ZXIpO1xufSk7XG5cbnRlc3QoJ3ByZXBhcmF0aW9uIGNsZWFycyBhdXRob3JpemVkIG9ic3RydWN0aW9ucyBhbmQgY3JlZGl0cyB0aGVpciByZXNvdXJjZXMnLCAoKSA9PiB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBlbnRpdHlDb3VudCA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGNvbnN0IGF1dGhvcml6ZXIgPSBuZXcgTG9jYWxBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pO1xuXG4gIGNvbnN0IHJlc3VsdCA9IHByZXBhcmVTaXRlKHdvcmxkLCBhdXRob3JpemVyLCB7XG4gICAgc2l0ZUlkOiBsYXlvdXQuZmFybS5pZCxcbiAgICByZWN0OiBsYXlvdXQuZmFybS5yZWN0LFxuICAgIGZsb29yWTogMTUsXG4gICAgcnVsZXM6IEZBUk1fUlVMRVMsXG4gIH0pO1xuICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCB0cnVlKTtcbiAgaWYgKCFyZXN1bHQub2spIHJldHVybjtcbiAgY29uc3QgeyBsZWRnZXIgfSA9IHJlc3VsdDtcblxuICBhc3NlcnQuZXF1YWwobGVkZ2VyLmN1dFZvbHVtZSwgNDEpO1xuICBhc3NlcnQuZXF1YWwobGVkZ2VyLmZpbGxWb2x1bWUsIDIyKTtcbiAgYXNzZXJ0LmVxdWFsKGxlZGdlci52b3hlbEVkaXRzLCA2Myk7XG4gIGFzc2VydC5kZWVwRXF1YWwobGVkZ2VyLmVudGl0aWVzQ2xlYXJlZC5tYXAoKGUpID0+IGUuZW50aXR5SWQpLCBbXG4gICAgJ2hlcm86c3R5bF9vcmU6LTM4Oi00MicsXG4gICAgJ2hlcm86c3R5bF90cmVlX2Jsb3Nzb206LTI4Oi0zOCcsXG4gIF0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGxlZGdlci5yZXNvdXJjZXNHYWluZWQsIHsgb3JlOiA4LCB3b29kOiAxMiB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChsZWRnZXIuaW52ZW50b3J5QWZ0ZXIsIHsgb3JlOiA4LCB3b29kOiAxMiB9KTtcbiAgYXNzZXJ0LmVxdWFsKHdvcmxkLmVudGl0aWVzLnNpemUsIGVudGl0eUNvdW50IC0gMik7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5lbnRpdGllcy5oYXMoJ2hlcm86c3R5bF9vcmU6LTM4Oi00MicpLCBmYWxzZSk7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5lbnRpdGllcy5oYXMoJ2hlcm86c3R5bF90cmVlX2Jsb3Nzb206LTI4Oi0zOCcpLCBmYWxzZSk7XG5cbiAgY29uc3QgY2h1bmtUb3RhbHMgPSBsZWRnZXIuY2h1bmtEZWx0YXMucmVkdWNlKChzdW0sIGQpID0+ICh7XG4gICAgY2hhbmdlZDogc3VtLmNoYW5nZWQgKyBkLmNoYW5nZWQsXG4gICAgYWRkZWQ6IHN1bS5hZGRlZCArIGQuYWRkZWQsXG4gICAgcmVtb3ZlZDogc3VtLnJlbW92ZWQgKyBkLnJlbW92ZWQsXG4gIH0pLCB7IGNoYW5nZWQ6IDAsIGFkZGVkOiAwLCByZW1vdmVkOiAwIH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGNodW5rVG90YWxzLCB7IGNoYW5nZWQ6IDYzLCBhZGRlZDogMjIsIHJlbW92ZWQ6IDQxIH0pO1xuXG4gIGZvciAobGV0IHogPSBsYXlvdXQuZmFybS5yZWN0LnowOyB6IDw9IGxheW91dC5mYXJtLnJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSBsYXlvdXQuZmFybS5yZWN0LngwOyB4IDw9IGxheW91dC5mYXJtLnJlY3QueDE7IHgrKykge1xuICAgICAgYXNzZXJ0LmVxdWFsKHN1cmZhY2VBdCh3b3JsZCwgeCwgeiksIDE1LCBgY29sdW1uICR7eH0sJHt6fWApO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGFmdGVyID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIub3V0c2lkZSwgYmVmb3JlLm91dHNpZGUpO1xuICBhc3NlcnQubm90RXF1YWwoYWZ0ZXIuZW50aXRpZXMsIGJlZm9yZS5lbnRpdGllcyk7XG4gIGFzc2VydC5ub3RFcXVhbChhZnRlci5pbnZlbnRvcnksIGJlZm9yZS5pbnZlbnRvcnkpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGVkaXRzT3V0c2lkZUVudmVsb3BlKHdvcmxkLCBsYXlvdXQuZW52ZWxvcGUpLCBbXSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoY2hlY2tEZXJpdmVkQ2FjaGVzKHdvcmxkLCBsYXlvdXQucHJvdGVjdGVkUmVnaW9uKSwgW10pO1xufSk7XG5cbnRlc3QoJ2V4ZWN1dGlvbiByZWplY3RzIGZvcmdlZCwgc3RhbGUgb3Igb3Zlci1saW1pdCBhdXRob3JpemF0aW9uIGJlZm9yZSB3cml0aW5nJywgKCkgPT4ge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUHJlcGFyYXRpb24od29ybGQsIHByb3Bvc2FsKGxheW91dC5ob3VzZS5pZCkpO1xuICBhc3NlcnQuZXF1YWwocGxhbm5lZC5vaywgdHJ1ZSk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuO1xuICBjb25zdCBhdXRob3JpemVyID0gaG91c2VQb2xpY3koKTtcbiAgY29uc3QgZGVjaXNpb24gPSBhdXRob3JpemVyLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgYXNzZXJ0LmVxdWFsKGRlY2lzaW9uLm9rLCB0cnVlKTtcbiAgY29uc3QgYXV0aCA9IGRlY2lzaW9uLmF1dGhvcml6YXRpb24hO1xuXG4gIGNvbnN0IGJlZm9yZSA9IGZpbmdlcnByaW50KHdvcmxkKTtcblxuICBjb25zdCBmb3JnZWREaWdlc3QgPSBleGVjdXRlUHJlcGFyYXRpb24od29ybGQsIHBsYW5uZWQucGxhbiwge1xuICAgIC4uLmF1dGgsIHBsYW5EaWdlc3Q6ICcwMDAwMDAwMDAwMDAwMDAwJyxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChmb3JnZWREaWdlc3Qub2ssIGZhbHNlKTtcbiAgaWYgKCFmb3JnZWREaWdlc3Qub2spIGFzc2VydC5lcXVhbChmb3JnZWREaWdlc3QuY29kZSwgJ2RpZ2VzdF9taXNtYXRjaCcpO1xuXG4gIGNvbnN0IGZvcmdlZEF1dGhvcml0eSA9IGV4ZWN1dGVQcmVwYXJhdGlvbih3b3JsZCwgcGxhbm5lZC5wbGFuLCB7XG4gICAgLi4uYXV0aCwgYXV0aG9yaXR5OiAnbWFnaWNibG9jaycgYXMgbmV2ZXIsXG4gIH0pO1xuICBhc3NlcnQuZXF1YWwoZm9yZ2VkQXV0aG9yaXR5Lm9rLCBmYWxzZSk7XG4gIGlmICghZm9yZ2VkQXV0aG9yaXR5Lm9rKSBhc3NlcnQuZXF1YWwoZm9yZ2VkQXV0aG9yaXR5LmNvZGUsICd1bnN1cHBvcnRlZF9hdXRob3JpdHknKTtcblxuICBjb25zdCBuYXJyb3dlZCA9IGV4ZWN1dGVQcmVwYXJhdGlvbih3b3JsZCwgcGxhbm5lZC5wbGFuLCB7XG4gICAgLi4uYXV0aCxcbiAgICBlbnZlbG9wZTogW3sgLi4uYXV0aC5lbnZlbG9wZVswXSwgeTE6IGF1dGguZW52ZWxvcGVbMF0ueTAgfV0sXG4gIH0pO1xuICBhc3NlcnQuZXF1YWwobmFycm93ZWQub2ssIGZhbHNlKTtcbiAgaWYgKCFuYXJyb3dlZC5vaykgYXNzZXJ0LmVxdWFsKG5hcnJvd2VkLmNvZGUsICdlbnZlbG9wZV9taXNtYXRjaCcpO1xuXG4gIGNvbnN0IGxpbWl0ZWQgPSBuZXcgTG9jYWxBdXRob3JpemVyKHtcbiAgICBlbnZlbG9wZTogTTAwMl9MQVlPVVQuZW52ZWxvcGUsXG4gICAgbGltaXRzOiB7IG1heEN1dFZvbHVtZTogMSB9LFxuICB9KS5hdXRob3JpemUod29ybGQsIHBsYW5uZWQucGxhbik7XG4gIGFzc2VydC5lcXVhbChsaW1pdGVkLm9rLCBmYWxzZSk7XG4gIGFzc2VydC5vayhsaW1pdGVkLnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnY3V0IDMgZXhjZWVkcyBsaW1pdCAxJykpKTtcblxuICBjb25zdCBvdXRzaWRlUG9saWN5ID0gbmV3IExvY2FsQXV0aG9yaXplcih7XG4gICAgZW52ZWxvcGU6IFtNMDAyX0xBWU9VVC5lbnZlbG9wZVsyXV0sXG4gIH0pLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgYXNzZXJ0LmVxdWFsKG91dHNpZGVQb2xpY3kub2ssIGZhbHNlKTtcbiAgYXNzZXJ0Lm9rKG91dHNpZGVQb2xpY3kucmVhc29ucy5zb21lKChyKSA9PiByLmluY2x1ZGVzKCdvdXRzaWRlIHRoZSBsb2NhbCBwb2xpY3knKSkpO1xuXG4gIGFzc2VydC5kZWVwRXF1YWwoZmluZ2VycHJpbnQod29ybGQpLCBiZWZvcmUpO1xuXG4gIC8vIEEgc3RhbGUgdG9rZW4gaXMgcmVqZWN0ZWQgZXZlbiB0aG91Z2ggaXQgd2FzIGdlbnVpbmVseSBpc3N1ZWQuXG4gIGFzc2VydC5lcXVhbChzZXRWb3hlbCh3b3JsZCwgLTQ1LCBzdXJmYWNlQXQod29ybGQsIC00NSwgLTQzKSwgLTQzLCBNQVQuU1RPTkUpLCB0cnVlKTtcbiAgY29uc3QgYWZ0ZXJNYW51YWxFZGl0ID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBzdGFsZSA9IGV4ZWN1dGVQcmVwYXJhdGlvbih3b3JsZCwgcGxhbm5lZC5wbGFuLCBhdXRoKTtcbiAgYXNzZXJ0LmVxdWFsKHN0YWxlLm9rLCBmYWxzZSk7XG4gIGlmICghc3RhbGUub2spIGFzc2VydC5lcXVhbChzdGFsZS5jb2RlLCAnc3RhbGVfYXV0aG9yaXphdGlvbicpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYWZ0ZXJNYW51YWxFZGl0KTtcbn0pO1xuXG50ZXN0KCdwcmVwYXJhdGlvbiBpcyBkZXRlcm1pbmlzdGljIGFjcm9zcyBpbmRlcGVuZGVudCByZXBsYXlzJywgKCkgPT4ge1xuICBjb25zdCBhID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgYiA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG5cbiAgY29uc3QgcmEgPSBwcmVwYXJlU2l0ZShhLndvcmxkLCBob3VzZVBvbGljeSgpLCBwcm9wb3NhbChhLmxheW91dC5ob3VzZS5pZCkpO1xuICBjb25zdCByYiA9IHByZXBhcmVTaXRlKGIud29ybGQsIGhvdXNlUG9saWN5KCksIHByb3Bvc2FsKGIubGF5b3V0LmhvdXNlLmlkKSk7XG4gIGFzc2VydC5lcXVhbChyYS5vaywgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChyYi5vaywgdHJ1ZSk7XG4gIGlmICghcmEub2sgfHwgIXJiLm9rKSByZXR1cm47XG5cbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5sZWRnZXIsIHJiLmxlZGdlcik7XG4gIGFzc2VydC5lcXVhbChyYS5hdXRob3JpemF0aW9uLmlkLCByYi5hdXRob3JpemF0aW9uLmlkKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChcbiAgICBjYW5vbmljYWxSZWdpb25IYXNoKGEud29ybGQsIGEubGF5b3V0LnByb3RlY3RlZFJlZ2lvbiksXG4gICAgY2Fub25pY2FsUmVnaW9uSGFzaChiLndvcmxkLCBiLmxheW91dC5wcm90ZWN0ZWRSZWdpb24pLFxuICApO1xuICBhc3NlcnQuZXF1YWwoXG4gICAgY2Fub25pY2FsRW50aXR5SGFzaChhLndvcmxkLCBhLmxheW91dC5wcm90ZWN0ZWRSZWdpb24pLFxuICAgIGNhbm9uaWNhbEVudGl0eUhhc2goYi53b3JsZCwgYi5sYXlvdXQucHJvdGVjdGVkUmVnaW9uKSxcbiAgKTtcbiAgYXNzZXJ0LmVxdWFsKGNhbm9uaWNhbEludmVudG9yeUhhc2goYS53b3JsZCksIGNhbm9uaWNhbEludmVudG9yeUhhc2goYi53b3JsZCkpO1xufSk7XG5cbnRlc3QoJ3BsYW5uaW5nIHJlamVjdHMgbWFsZm9ybWVkIHRhcmdldHMgYW5kIHVuY2xlYXJlZCBvYnN0cnVjdGlvbnMnLCAoKSA9PiB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBiYXNlID0gcHJvcG9zYWwobGF5b3V0LmhvdXNlLmlkKTtcblxuICBjb25zdCBwbGFubmVkID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBiYXNlKTtcbiAgYXNzZXJ0LmVxdWFsKHBsYW5uZWQub2ssIHRydWUpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybjtcblxuICBjb25zdCBtaXNzaW5nID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBiYXNlLCB7XG4gICAgdGFyZ2V0czogcGxhbm5lZC5wbGFuLnRhcmdldHMuc2xpY2UoMCwgLTEpLFxuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKG1pc3Npbmcub2ssIGZhbHNlKTtcbiAgaWYgKCFtaXNzaW5nLm9rKSBhc3NlcnQuZXF1YWwobWlzc2luZy5jb2RlLCAndGFyZ2V0X2NvdW50Jyk7XG5cbiAgY29uc3QgZHVwbGljYXRlID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBiYXNlLCB7XG4gICAgdGFyZ2V0czogcGxhbm5lZC5wbGFuLnRhcmdldHMubWFwKCh0LCBpKSA9PiAoaSA9PT0gMSA/IHsgLi4ucGxhbm5lZC5wbGFuLnRhcmdldHNbMF0gfSA6IHQpKSxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChkdXBsaWNhdGUub2ssIGZhbHNlKTtcbiAgaWYgKCFkdXBsaWNhdGUub2spIGFzc2VydC5lcXVhbChkdXBsaWNhdGUuY29kZSwgJ2R1cGxpY2F0ZV90YXJnZXQnKTtcblxuICBjb25zdCBvdXRzaWRlID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBiYXNlLCB7XG4gICAgdGFyZ2V0czogcGxhbm5lZC5wbGFuLnRhcmdldHMubWFwKCh0LCBpKSA9PiAoaSA9PT0gMCA/IHsgLi4udCwgeDogdC54IC0gMTAgfSA6IHQpKSxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChvdXRzaWRlLm9rLCBmYWxzZSk7XG4gIGlmICghb3V0c2lkZS5vaykgYXNzZXJ0LmVxdWFsKG91dHNpZGUuY29kZSwgJ3RhcmdldF9vdXRzaWRlX2Zvb3RwcmludCcpO1xuXG4gIGNvbnN0IGJhZEhlaWdodCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgYmFzZSwge1xuICAgIHRhcmdldHM6IHBsYW5uZWQucGxhbi50YXJnZXRzLm1hcCgodCwgaSkgPT4gKGkgPT09IDAgPyB7IC4uLnQsIHk6IDUwMCB9IDogdCkpLFxuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKGJhZEhlaWdodC5vaywgZmFsc2UpO1xuICBpZiAoIWJhZEhlaWdodC5vaykgYXNzZXJ0LmVxdWFsKGJhZEhlaWdodC5jb2RlLCAndGFyZ2V0X2hlaWdodCcpO1xuXG4gIGNvbnN0IHVuY2xlYXJlZCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwge1xuICAgIHNpdGVJZDogbGF5b3V0LmZhcm0uaWQsIHJlY3Q6IGxheW91dC5mYXJtLnJlY3QsIGZsb29yWTogMTUsIHJ1bGVzOiBGQVJNX1JVTEVTLFxuICB9LCB7IGNsZWFyOiAnbm9uZScgfSk7XG4gIGFzc2VydC5lcXVhbCh1bmNsZWFyZWQub2ssIGZhbHNlKTtcbiAgaWYgKCF1bmNsZWFyZWQub2spIGFzc2VydC5lcXVhbCh1bmNsZWFyZWQuY29kZSwgJ3VuY2xlYXJlZF9vYnN0cnVjdGlvbnMnKTtcblxuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYmVmb3JlKTtcbn0pO1xuXG50ZXN0KCdleGVjdXRvciByZWZ1c2VzIGEgcGxhbiB3aG9zZSBvYnN0cnVjdGlvbiBzZXQgY2hhbmdlZCBhZnRlciBhdXRob3JpemF0aW9uJywgKCkgPT4ge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUHJlcGFyYXRpb24od29ybGQsIHtcbiAgICBzaXRlSWQ6IGxheW91dC5mYXJtLmlkLCByZWN0OiBsYXlvdXQuZmFybS5yZWN0LCBmbG9vclk6IDE1LCBydWxlczogRkFSTV9SVUxFUyxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChwbGFubmVkLm9rLCB0cnVlKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm47XG4gIGNvbnN0IGF1dGggPSBuZXcgTG9jYWxBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pXG4gICAgLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgYXNzZXJ0LmVxdWFsKGF1dGgub2ssIHRydWUpO1xuICBpZiAoIWF1dGgub2spIHJldHVybjtcblxuICAvLyBBIG5ldyBvYnN0cnVjdGlvbiBhcHBlYXJzIG9uIHRoZSBmb290cHJpbnQgYWZ0ZXIgYXV0aG9yaXphdGlvbi4gUmV2aXNpb25cbiAgLy8gaXMgZGVsaWJlcmF0ZWx5IGxlZnQgdW50b3VjaGVkIHNvIHRoZSB0ZXN0IHJlYWNoZXMgdGhlIGV4ZWN1dG9yJ3Mgc2Vjb25kXG4gIC8vIGd1YXJkOiBpdCByZS1yZWFkcyB0aGUgb2JzdHJ1Y3Rpb24gc2V0IGluc3RlYWQgb2YgdHJ1c3RpbmcgdGhlIHRva2VuLlxuICBjb25zdCBleHRyYSA9IHtcbiAgICBpZDogJ3Rlc3Q6ZXh0cmEtcm9jaycsXG4gICAga2luZDogJ3N0eWxfb3JlJyBhcyBjb25zdCxcbiAgICBjaHVuazogJzMwLDMwJyxcbiAgICB4OiAtMzIuNSwgeTogMTYsIHo6IC0zOC41LFxuICAgIHJvdDogMCwgc2NhbGU6IDEsIHZhcmlhbnQ6IDAsXG4gICAgcmVzb3VyY2U6ICdvcmUnIGFzIGNvbnN0LCByZW1haW5pbmc6IDIsIHlpZWxkUGVySGFydmVzdDogMSxcbiAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogZmFsc2UsIGF1dGhvcmVkOiBmYWxzZSxcbiAgfTtcbiAgd29ybGQuZW50aXRpZXMuc2V0KGV4dHJhLmlkLCBleHRyYSk7XG4gIHdvcmxkLmVudGl0eUNodW5rcy5nZXQoJzMwLDMwJykhLnB1c2goZXh0cmEuaWQpO1xuXG4gIGNvbnN0IGJlZm9yZSA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3QgcmVzdWx0ID0gZXhlY3V0ZVByZXBhcmF0aW9uKHdvcmxkLCBwbGFubmVkLnBsYW4sIGF1dGguYXV0aG9yaXphdGlvbiEpO1xuICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCBmYWxzZSk7XG4gIGlmICghcmVzdWx0Lm9rKSBhc3NlcnQuZXF1YWwocmVzdWx0LmNvZGUsICd1bmF1dGhvcml6ZWRfZWRpdHMnKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGJlZm9yZSk7XG59KTtcblxudGVzdCgndGhlIGV4ZWN1dGlvbiBndWFyZCByZWplY3RzIGEgcGxhbiB0aGF0IGVzY2FwZXMgaXRzIG93biBlbnZlbG9wZScsICgpID0+IHtcbiAgY29uc3QgeyB3b3JsZCwgbGF5b3V0IH0gPSBjcmVhdGVNMDAyRml4dHVyZSgpO1xuICBjb25zdCBwbGFubmVkID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBwcm9wb3NhbChsYXlvdXQuaG91c2UuaWQpKTtcbiAgYXNzZXJ0LmVxdWFsKHBsYW5uZWQub2ssIHRydWUpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybjtcbiAgY29uc3QgYXV0aCA9IGhvdXNlUG9saWN5KCkuYXV0aG9yaXplKHdvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBhc3NlcnQuZXF1YWwoYXV0aC5vaywgdHJ1ZSk7XG4gIGlmICghYXV0aC5vaykgcmV0dXJuO1xuXG4gIC8vIEZvcmdlIGEgcGxhbiB3aXRoIG9uZSB0YXJnZXQgbW92ZWQgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZSB3aGlsZVxuICAvLyBrZWVwaW5nIHRoZSBkaWdlc3QgY29uc2lzdGVudCB3aXRoIHRoZSBmb3JnZWQgcGxhbi5cbiAgY29uc3QgdGFyZ2V0cyA9IHBsYW5uZWQucGxhbi50YXJnZXRzLm1hcCgodCwgaSkgPT4gKGkgPT09IDAgPyB7IC4uLnQsIHg6IC04MCB9IDogdCkpO1xuICBjb25zdCBmb3JnZWQ6IFByZXBhcmF0aW9uUGxhbiA9IHsgLi4ucGxhbm5lZC5wbGFuLCB0YXJnZXRzIH07XG4gIGZvcmdlZC5pZCA9IGBwcmVwOiR7cGxhbkRpZ2VzdChmb3JnZWQpfWA7XG4gIGNvbnN0IGJlZm9yZSA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3QgcmVzdWx0ID0gZXhlY3V0ZVByZXBhcmF0aW9uKHdvcmxkLCBmb3JnZWQsIHtcbiAgICAuLi5hdXRoLmF1dGhvcml6YXRpb24hLFxuICAgIHBsYW5EaWdlc3Q6IHBsYW5EaWdlc3QoZm9yZ2VkKSxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChyZXN1bHQub2ssIGZhbHNlKTtcbiAgaWYgKCFyZXN1bHQub2spIGFzc2VydC5lcXVhbChyZXN1bHQuY29kZSwgJ3VuYXV0aG9yaXplZF9lZGl0cycpO1xuICBhc3NlcnQub2socmVzdWx0LnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnb3V0c2lkZSB0aGUgZm9vdHByaW50JylcbiAgICB8fCByLmluY2x1ZGVzKCdvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlJykpKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGJlZm9yZSk7XG59KTtcblxudGVzdCgnYXV0aG9yaXplZCBleGVjdXRpb24gbmV2ZXIgdG91Y2hlcyB2b3hlbHMgb3V0c2lkZSB0aGUgd29yayBlbnZlbG9wZScsICgpID0+IHtcbiAgY29uc3QgeyB3b3JsZCwgbGF5b3V0IH0gPSBjcmVhdGVNMDAyRml4dHVyZSgpO1xuICBjb25zdCBiZWZvcmUgPSBmaW5nZXJwcmludCh3b3JsZCk7XG4gIGNvbnN0IGF1dGhvcml6ZXIgPSBob3VzZVBvbGljeSgpO1xuXG4gIC8vIEhvdXNlLCBwYXRoLWxpa2UgY29ycmlkb3IgYW5kIGZhcm0gYWxsIGluIG9uZSBzZXNzaW9uOiB0aGUgY29tcGxldGUgTTAwMlxuICAvLyBlbnZlbG9wZSBpcyB0aGUgdW5pb24sIHNvIGVhY2ggYWN0aW9uIG11c3Qgc3RheSBpbnNpZGUgaXRzIG93biBzdWJzZXQuXG4gIGNvbnN0IGhvdXNlID0gcHJlcGFyZVNpdGUod29ybGQsIGF1dGhvcml6ZXIsIHByb3Bvc2FsKGxheW91dC5ob3VzZS5pZCkpO1xuICBhc3NlcnQuZXF1YWwoaG91c2Uub2ssIHRydWUpO1xuICBjb25zdCBmYXJtID0gcHJlcGFyZVNpdGUod29ybGQsIGF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IGxheW91dC5mYXJtLmlkLCByZWN0OiBsYXlvdXQuZmFybS5yZWN0LCBmbG9vclk6IDE1LCBydWxlczogRkFSTV9SVUxFUyxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChmYXJtLm9rLCB0cnVlKTtcblxuICBhc3NlcnQuZGVlcEVxdWFsKGVkaXRzT3V0c2lkZUVudmVsb3BlKHdvcmxkLCBsYXlvdXQuZW52ZWxvcGUpLCBbXSk7XG4gIGFzc2VydC5lcXVhbChcbiAgICBjYW5vbmljYWxSZWdpb25IYXNoKHdvcmxkLCBsYXlvdXQucHJvdGVjdGVkUmVnaW9uLCBsYXlvdXQuZW52ZWxvcGUpLmhhc2gsXG4gICAgYmVmb3JlLm91dHNpZGUsXG4gICk7XG5cbiAgLy8gVGhlIGhvdXNlIHByZXBhcmF0aW9uIGlzIG5vdCBmbGF0dGVuZWQgaW50byB0aGUgZmFybSBhbmQgdmljZSB2ZXJzYS5cbiAgYXNzZXJ0LmVxdWFsKHN1cmZhY2VBdCh3b3JsZCwgbGF5b3V0LmhvdXNlLnJlY3QueDAsIGxheW91dC5ob3VzZS5yZWN0LnowKSwgMTEpO1xuICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KHdvcmxkLCBsYXlvdXQuZmFybS5yZWN0LngwLCBsYXlvdXQuZmFybS5yZWN0LnowKSwgMTUpO1xuICBhc3NlcnQuZXF1YWwoZ2V0Vm94ZWwod29ybGQsIGxheW91dC5ob3VzZS5yZWN0LngwLCAxMSwgbGF5b3V0LmhvdXNlLnJlY3QuejApLCBNQVQuQUlSKTtcbn0pO1xuIiwgIi8vIFByaXZhdGUgbWlncmF0aW9uIHJlcGxheSBvbmx5LiBSZXRpcmVkIGVudGl0aWVzIGxpdmUgaW4gdGhpcyBXb3JsZCB3aGlsZSBhblxuLy8gYWNjZXB0ZWQgaGlzdG9yaWNhbCBqb3VybmFsIGlzIGNoZWNrZWQ7IG5vIHB1YmxpYyBjb21tYW5kIGVuYWJsZXMgdGhpcyBtb2RlLlxuaW50ZXJmYWNlIFJlcGxheVN0YXRlIHtcbiAgYWN0aXZlOiBib29sZWFuO1xuICBoaXN0b3JpY2FsSGFzaDogYm9vbGVhbjtcbiAgbWlncmF0ZWQ6IGJvb2xlYW47XG59XG5cbmNvbnN0IHN0YXRlcyA9IG5ldyBXZWFrTWFwPG9iamVjdCwgUmVwbGF5U3RhdGU+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiByZXBsYXlTdG9uZVN0YXRlKHdvcmxkOiBvYmplY3QpOiBSZXBsYXlTdGF0ZSB7XG4gIGxldCBzdGF0ZSA9IHN0YXRlcy5nZXQod29ybGQpO1xuICBpZiAoIXN0YXRlKSB7IHN0YXRlID0geyBhY3RpdmU6IGZhbHNlLCBoaXN0b3JpY2FsSGFzaDogZmFsc2UsIG1pZ3JhdGVkOiBmYWxzZSB9OyBzdGF0ZXMuc2V0KHdvcmxkLCBzdGF0ZSk7IH1cbiAgcmV0dXJuIHN0YXRlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSB0cnVlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG4gIHN0YXRlLm1pZ3JhdGVkID0gZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5hY3RpdmUgPz8gZmFsc2U7XG59XG5cbi8qKiBTbmFwc2hvdCBoYXNoZXMgYmVmb3JlIGFuZCBkdXJpbmcgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkgaW5jbHVkZSBzdG9uZXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uaGlzdG9yaWNhbEhhc2ggPz8gZmFsc2U7XG59XG5cbi8qKiBBIG1pZ3JhdGVkIHNuYXBzaG90IGFscmVhZHkgaGFzIHJldGlyZW1lbnQgdG9tYnN0b25lcyBpbiBnZW5lcmF0ZWQgY2h1bmtzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtTdG9uZU1pZ3JhdGVkKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkubWlncmF0ZWQgPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZU1pZ3JhdGVkKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5taWdyYXRlZCA/PyBmYWxzZTtcbn1cblxuLyoqIEV4aXQgaGlzdG9yaWNhbCBtb2RlIGFmdGVyIGFsbCBhY2NlcHRlZCBjb21tYW5kcyBhbmQgaGFzaGVzIGhhdmUgcGFzc2VkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmlzaFN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gZmFsc2U7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gZmFsc2U7XG4gIHN0YXRlLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cbiIsICIvLyBEZXRlcm1pbmlzdGljIGhhc2gsIG5vaXNlIGFuZCBtYXRoIGhlbHBlcnMgc2hhcmVkIGJ5IHRoZSBzaW11bGF0aW9uIGxheWVyLlxuLy8gUHVyZSBUeXBlU2NyaXB0IChELTAwNSkuIEV4dHJhY3RlZCBmcm9tIHdvcmxkLnRzIHVuY2hhbmdlZCBzbyB0ZXJyYWluXG4vLyBnZW5lcmF0b3JzIG9mIGV2ZXJ5IHZlcnNpb24gdXNlIGlkZW50aWNhbCBwcmltaXRpdmVzLlxuZXhwb3J0IGNvbnN0IGNsYW1wID0gKHY6IG51bWJlciwgYTogbnVtYmVyLCBiOiBudW1iZXIpID0+ICh2IDwgYSA/IGEgOiB2ID4gYiA/IGIgOiB2KTtcbmV4cG9ydCBjb25zdCBsZXJwID0gKGE6IG51bWJlciwgYjogbnVtYmVyLCB0OiBudW1iZXIpID0+IGEgKyAoYiAtIGEpICogdDtcbmV4cG9ydCBjb25zdCBzbW9vdGhzdGVwID0gKGUwOiBudW1iZXIsIGUxOiBudW1iZXIsIHg6IG51bWJlcikgPT4ge1xuICBjb25zdCB0ID0gY2xhbXAoKHggLSBlMCkgLyAoZTEgLSBlMCksIDAsIDEpO1xuICByZXR1cm4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcbn07XG5cbi8vIC0tLS0tLS0tLS0gZGV0ZXJtaW5pc3RpYyBoYXNoIC8gbm9pc2UgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gyaSh4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzaDNpKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2MykgXiBNYXRoLmltdWwoeiwgMjI0NjgyMjUxOSk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG11bGJlcnJ5MzIoc2VlZDogbnVtYmVyKTogKCkgPT4gbnVtYmVyIHtcbiAgbGV0IGEgPSBzZWVkID4+PiAwO1xuICByZXR1cm4gKCkgPT4ge1xuICAgIGEgPSAoYSArIDB4NmQyYjc5ZjUpID4+PiAwO1xuICAgIGxldCB0ID0gYTtcbiAgICB0ID0gTWF0aC5pbXVsKHQgXiAodCA+Pj4gMTUpLCB0IHwgMSk7XG4gICAgdCBePSB0ICsgTWF0aC5pbXVsKHQgXiAodCA+Pj4gNyksIHQgfCA2MSk7XG4gICAgcmV0dXJuICgodCBeICh0ID4+PiAxNCkpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBzbW9vdGggPSAodDogbnVtYmVyKSA9PiB0ICogdCAqICgzIC0gMiAqIHQpO1xuXG5leHBvcnQgZnVuY3Rpb24gdmFsdWVOb2lzZTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpO1xuICBjb25zdCBhID0gaGFzaDJpKHhpLCB5aSwgc2VlZCksIGIgPSBoYXNoMmkoeGkgKyAxLCB5aSwgc2VlZCk7XG4gIGNvbnN0IGMgPSBoYXNoMmkoeGksIHlpICsgMSwgc2VlZCksIGQgPSBoYXNoMmkoeGkgKyAxLCB5aSArIDEsIHNlZWQpO1xuICBjb25zdCB0b3AgPSBhICsgKGIgLSBhKSAqIHhmO1xuICBjb25zdCBib3R0b20gPSBjICsgKGQgLSBjKSAqIHhmO1xuICByZXR1cm4gdG9wICsgKGJvdHRvbSAtIHRvcCkgKiB5Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTIoeCAqIGZyZXEsIHkgKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdmFsdWVOb2lzZTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSksIHppID0gTWF0aC5mbG9vcih6KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKSwgemYgPSBzbW9vdGgoeiAtIHppKTtcbiAgY29uc3QgYzAwMCA9IGhhc2gzaSh4aSwgeWksIHppLCBzZWVkKSwgYzEwMCA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSwgc2VlZCk7XG4gIGNvbnN0IGMwMTAgPSBoYXNoM2koeGksIHlpICsgMSwgemksIHNlZWQpLCBjMTEwID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSwgc2VlZCk7XG4gIGNvbnN0IGMwMDEgPSBoYXNoM2koeGksIHlpLCB6aSArIDEsIHNlZWQpLCBjMTAxID0gaGFzaDNpKHhpICsgMSwgeWksIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IGMwMTEgPSBoYXNoM2koeGksIHlpICsgMSwgemkgKyAxLCBzZWVkKSwgYzExMSA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgeDAwID0gYzAwMCArIChjMTAwIC0gYzAwMCkgKiB4ZjtcbiAgY29uc3QgeDEwID0gYzAxMCArIChjMTEwIC0gYzAxMCkgKiB4ZjtcbiAgY29uc3QgeDAxID0gYzAwMSArIChjMTAxIC0gYzAwMSkgKiB4ZjtcbiAgY29uc3QgeDExID0gYzAxMSArIChjMTExIC0gYzAxMSkgKiB4ZjtcbiAgY29uc3QgeTAgPSB4MDAgKyAoeDEwIC0geDAwKSAqIHlmO1xuICBjb25zdCB5MSA9IHgwMSArICh4MTEgLSB4MDEpICogeWY7XG4gIHJldHVybiB5MCArICh5MSAtIHkwKSAqIHpmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UzKHggKiBmcmVxLCB5ICogZnJlcSwgeiAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbiIsICIvLyBIeWRyb2xvZ3kgXHUyMDE0IHRoZSBkZXRlcm1pbmlzdGljIHdhdGVyIG5ldHdvcmsgb2YgYSB3b3JsZCAocHVyZSBUeXBlU2NyaXB0LCBELTAwNSkuXG4vL1xuLy8gVGhpcyBpcyBkZXJpdmVkICpzaW11bGF0aW9uIGRhdGEqLCBub3QgcHJlc2VudGF0aW9uOiBpdCBpcyBhIHB1cmUgZnVuY3Rpb24gb2Zcbi8vIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbikgYW5kIGlzIHdoYXQgdGVycmFpbiBjYXJ2aW5nLCB3YXRlciBmaWxsaW5nLCBmbG93XG4vLyBkaXJlY3Rpb24gYW5kIGZ1dHVyZSBmaXNoaW5nL2lycmlnYXRpb24vZmxvb2RpbmcgcnVsZXMgcmVhZC4gSXQgaXMgbmV2ZXJcbi8vIGpvdXJuYWxlZCBiZWNhdXNlIGl0IGNhbiBhbHdheXMgYmUgcmVnZW5lcmF0ZWQgZXhhY3RseS5cbi8vXG4vLyBOZXR3b3JrIChib3RoIGdlbmVyYXRvciB2ZXJzaW9ucyk6XG4vLyAgIGxha2UgIFx1MjAxNCB0aGUgdmFsbGV5IGxha2UgYmFzaW4sIGxvY2F0ZWQgZnJvbSB0aGUgYWN0dWFsIGdlbmVyYXRlZCB0ZXJyYWluLlxuLy8gICBsb3dlciBcdTIwMTQgdGhlIGxvd2xhbmQgcml2ZXIgZnJvbSB0aGUgbGFrZSB0byB0aGUgc291dGhlcm4gc2VhLCB0cmFjZWQgZnJvbVxuLy8gICAgICAgICAgIHRoZSBhY3R1YWwgY2FydmVkIGNoYW5uZWwgKHRoZSB2MSBjaGFubmVsIGlzIGNhcnZlZCBvbiAqd2FycGVkKlxuLy8gICAgICAgICAgIGNvb3JkaW5hdGVzLCBzbyBgcml2ZXJDZW50ZXJYYCBhbG9uZSBpcyB1cCB0byB+MTM1IG0gb2ZmKS5cbi8vIEdlbmVyYXRvciB2MiBhZGRzOlxuLy8gICB1cHBlciBcdTIwMTQgYSBtb3VudGFpbiByaXZlciBmcm9tIGEgaGlnaGxhbmQgdGFybiBkb3duIHRvIHRoZSBsYWtlLCB3aXRoIGFcbi8vICAgICAgICAgICB3YXRlci1zdXJmYWNlIGxldmVsIHRoYXQgbmV2ZXIgcmlzZXMgZG93bnN0cmVhbSwgY2FzY2FkZXMgYW5kIGZhbGxzLlxuLy9cbi8vIEZsb3cgYWx3YXlzIHBvaW50cyBkb3duc3RyZWFtOiB1cHBlciBcdTIxOTIgbGFrZSBcdTIxOTIgbG93ZXIgXHUyMTkyIHNlYS5cbmltcG9ydCB7IGNsYW1wLCBmYm0yLCBtdWxiZXJyeTMyLCBzbW9vdGhzdGVwIH0gZnJvbSAnLi9ub2lzZSc7XG5cbmV4cG9ydCB0eXBlIEhlaWdodFNhbXBsZXIgPSAoeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IG51bWJlcjtcblxuZXhwb3J0IGludGVyZmFjZSBSaXZlclBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIC8qKiBBcmMgbGVuZ3RoIGZyb20gdGhlIGRvd25zdHJlYW0gZW5kIG9mIHRoaXMgcmVhY2ggKG1ldHJlcykuICovXG4gIHM6IG51bWJlcjtcbiAgLyoqIFdhdGVyLXN1cmZhY2UgZWxldmF0aW9uIChtZXRyZXMsIG1heSBiZSBmcmFjdGlvbmFsKS4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgLyoqIENoYW5uZWwgaGFsZi13aWR0aCAobWV0cmVzKS4gKi9cbiAgd2lkdGg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWFjaEhpdCB7XG4gIC8qKiBIb3Jpem9udGFsIGRpc3RhbmNlIGZyb20gdGhlIGNlbnRyZWxpbmUuICovXG4gIGQ6IG51bWJlcjtcbiAgLyoqIEludGVycG9sYXRlZCB3YXRlciBsZXZlbCBhdCB0aGUgbmVhcmVzdCBjZW50cmVsaW5lIHBvaW50LiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICB3aWR0aDogbnVtYmVyO1xuICAvKiogVW5pdCBkb3duc3RyZWFtIGRpcmVjdGlvbi4gKi9cbiAgdHg6IG51bWJlcjtcbiAgdHo6IG51bWJlcjtcbiAgLyoqIFdhdGVyLXN1cmZhY2UgZHJvcCBwZXIgbWV0cmUgYWxvbmcgdGhlIGNoYW5uZWwgKD49IDApLiAqL1xuICBncmFkaWVudDogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBvZiB0aGUgbmVhcmVzdCBwb2ludCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZC4gKi9cbiAgczogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgcG9seWxpbmUgcmVhY2ggc3RvcmVkIGRvd25zdHJlYW0tZmlyc3QuIE5lYXJlc3Qtc2VnbWVudCBxdWVyaWVzIHVzZSBhXG4gKiB1bmlmb3JtIGdyaWQgd2hvc2UgY2VsbHMgbGlzdCBldmVyeSBzZWdtZW50IHdpdGhpbiBgcmVhY2hgIG1ldHJlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFJpdmVyUmVhY2gge1xuICByZWFkb25seSBwb2ludHM6IFJpdmVyUG9pbnRbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBjZWxsID0gMzI7XG4gIHByaXZhdGUgcmVhZG9ubHkgZ3JpZCA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXJbXT4oKTtcblxuICBjb25zdHJ1Y3Rvcihwb2ludHM6IFJpdmVyUG9pbnRbXSwgcmVhZG9ubHkgcmVhY2g6IG51bWJlcikge1xuICAgIHRoaXMucG9pbnRzID0gcG9pbnRzO1xuICAgIGZvciAobGV0IGkgPSAwOyBpICsgMSA8IHBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgYSA9IHBvaW50c1tpXSwgYiA9IHBvaW50c1tpICsgMV07XG4gICAgICBjb25zdCB4MCA9IE1hdGgubWluKGEueCwgYi54KSAtIHJlYWNoLCB4MSA9IE1hdGgubWF4KGEueCwgYi54KSArIHJlYWNoO1xuICAgICAgY29uc3QgejAgPSBNYXRoLm1pbihhLnosIGIueikgLSByZWFjaCwgejEgPSBNYXRoLm1heChhLnosIGIueikgKyByZWFjaDtcbiAgICAgIGZvciAobGV0IGN6ID0gTWF0aC5mbG9vcih6MCAvIHRoaXMuY2VsbCk7IGN6IDw9IE1hdGguZmxvb3IoejEgLyB0aGlzLmNlbGwpOyBjeisrKSB7XG4gICAgICAgIGZvciAobGV0IGN4ID0gTWF0aC5mbG9vcih4MCAvIHRoaXMuY2VsbCk7IGN4IDw9IE1hdGguZmxvb3IoeDEgLyB0aGlzLmNlbGwpOyBjeCsrKSB7XG4gICAgICAgICAgY29uc3Qga2V5ID0gY2VsbEtleShjeCwgY3opO1xuICAgICAgICAgIGxldCBsaXN0ID0gdGhpcy5ncmlkLmdldChrZXkpO1xuICAgICAgICAgIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHRoaXMuZ3JpZC5zZXQoa2V5LCBsaXN0KTsgfVxuICAgICAgICAgIGxpc3QucHVzaChpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBsZW5ndGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMucG9pbnRzW3RoaXMucG9pbnRzLmxlbmd0aCAtIDFdPy5zID8/IDA7IH1cblxuICAvKiogTmVhcmVzdCBjZW50cmVsaW5lIHBvaW50IHdpdGhpbiBgcmVhY2hgLCBvciBudWxsLiAqL1xuICBuZWFyZXN0KHg6IG51bWJlciwgejogbnVtYmVyKTogUmVhY2hIaXQgfCBudWxsIHtcbiAgICBjb25zdCBsaXN0ID0gdGhpcy5ncmlkLmdldChjZWxsS2V5KE1hdGguZmxvb3IoeCAvIHRoaXMuY2VsbCksIE1hdGguZmxvb3IoeiAvIHRoaXMuY2VsbCkpKTtcbiAgICBpZiAoIWxpc3QpIHJldHVybiBudWxsO1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJpID0gLTEsIGJ0ID0gMDtcbiAgICBmb3IgKGNvbnN0IGkgb2YgbGlzdCkge1xuICAgICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2ldLCBiID0gdGhpcy5wb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgZHggPSBiLnggLSBhLngsIGR6ID0gYi56IC0gYS56O1xuICAgICAgY29uc3QgbGVuMiA9IGR4ICogZHggKyBkeiAqIGR6IHx8IDE7XG4gICAgICBjb25zdCB0ID0gY2xhbXAoKCh4IC0gYS54KSAqIGR4ICsgKHogLSBhLnopICogZHopIC8gbGVuMiwgMCwgMSk7XG4gICAgICBjb25zdCBweCA9IGEueCArIGR4ICogdCwgcHogPSBhLnogKyBkeiAqIHQ7XG4gICAgICBjb25zdCBkMiA9ICh4IC0gcHgpICoqIDIgKyAoeiAtIHB6KSAqKiAyO1xuICAgICAgaWYgKGQyIDwgYmVzdCkgeyBiZXN0ID0gZDI7IGJpID0gaTsgYnQgPSB0OyB9XG4gICAgfVxuICAgIGlmIChiaSA8IDAgfHwgYmVzdCA+IHRoaXMucmVhY2ggKiB0aGlzLnJlYWNoKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBhID0gdGhpcy5wb2ludHNbYmldLCBiID0gdGhpcy5wb2ludHNbYmkgKyAxXTtcbiAgICBjb25zdCBzZWdMZW4gPSBNYXRoLm1heCgxZS02LCBiLnMgLSBhLnMpO1xuICAgIC8vIFBvaW50cyBhcmUgc3RvcmVkIGRvd25zdHJlYW0tZmlyc3QsIHNvIGRvd25zdHJlYW0gaXMgYSA8LSBiLlxuICAgIGNvbnN0IHR4ID0gKGEueCAtIGIueCkgLyBzZWdMZW4sIHR6ID0gKGEueiAtIGIueikgLyBzZWdMZW47XG4gICAgcmV0dXJuIHtcbiAgICAgIGQ6IE1hdGguc3FydChiZXN0KSxcbiAgICAgIGxldmVsOiBhLmxldmVsICsgKGIubGV2ZWwgLSBhLmxldmVsKSAqIGJ0LFxuICAgICAgd2lkdGg6IGEud2lkdGggKyAoYi53aWR0aCAtIGEud2lkdGgpICogYnQsXG4gICAgICB0eCwgdHosXG4gICAgICBncmFkaWVudDogTWF0aC5tYXgoMCwgKGIubGV2ZWwgLSBhLmxldmVsKSAvIHNlZ0xlbiksXG4gICAgICBzOiBhLnMgKyAoYi5zIC0gYS5zKSAqIGJ0LFxuICAgIH07XG4gIH1cbn1cblxuZnVuY3Rpb24gY2VsbEtleShjeDogbnVtYmVyLCBjejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIChjeCArIDQwOTYpICogODE5MiArIChjeiArIDQwOTYpO1xufVxuXG5leHBvcnQgdHlwZSBXYXRlckJvZHkgPSAncml2ZXInIHwgJ2xha2UnIHwgJ3NlYScgfCAnbm9uZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmxvd1NhbXBsZSB7XG4gIGJvZHk6IFdhdGVyQm9keTtcbiAgLyoqIFVuaXQgZmxvdyBkaXJlY3Rpb24gKHplcm8gZm9yIHN0aWxsIHdhdGVyKS4gKi9cbiAgZHg6IG51bWJlcjtcbiAgZHo6IG51bWJlcjtcbiAgLyoqIFN1cmZhY2UgY3VycmVudCBzcGVlZCBpbiBtL3MuICovXG4gIHNwZWVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSHlkcm9sb2d5T3B0aW9ucyB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgLyoqIEdlbmVyYXRvciB2ZXJzaW9uIHRoZSBuZXR3b3JrIGJlbG9uZ3MgdG8uICovXG4gIHZlcnNpb246IG51bWJlcjtcbiAgLyoqIEJhc2UgaGVpZ2h0IG9mIHRoZSAqdW5tb2RpZmllZCB2MSBzaGFwZSogKHVzZWQgdG8gbG9jYXRlIGxha2UvY2hhbm5lbCkuICovXG4gIHYxSGVpZ2h0OiBIZWlnaHRTYW1wbGVyO1xufVxuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ2ljYWwgbmV0d29yayBmb3Igb25lIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbikuICovXG5leHBvcnQgY2xhc3MgSHlkcm9sb2d5IHtcbiAgcmVhZG9ubHkgc2VlZDogbnVtYmVyO1xuICByZWFkb25seSB2ZXJzaW9uOiBudW1iZXI7XG4gIHJlYWRvbmx5IGxha2U6IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJ4OiBudW1iZXI7IHJ6OiBudW1iZXIgfTtcbiAgcmVhZG9ubHkgbG93ZXI6IFJpdmVyUmVhY2g7XG4gIHJlYWRvbmx5IHVwcGVyOiBSaXZlclJlYWNoIHwgbnVsbDtcbiAgLyoqIFVwcGVyLXJpdmVyIHNvdXJjZSB0YXJuICh2MiBvbmx5KS4gKi9cbiAgcmVhZG9ubHkgdGFybjogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcjogbnVtYmVyOyBsZXZlbDogbnVtYmVyIH0gfCBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKG9wdHM6IEh5ZHJvbG9neU9wdGlvbnMpIHtcbiAgICB0aGlzLnNlZWQgPSBvcHRzLnNlZWQ7XG4gICAgdGhpcy52ZXJzaW9uID0gb3B0cy52ZXJzaW9uO1xuICAgIHRoaXMubGFrZSA9IGxvY2F0ZUxha2Uob3B0cy52MUhlaWdodCk7XG4gICAgdGhpcy5sb3dlciA9IHRyYWNlTG93ZXJSaXZlcihvcHRzLnYxSGVpZ2h0LCB0aGlzLmxha2UpO1xuICAgIGlmIChvcHRzLnZlcnNpb24gPj0gMikge1xuICAgICAgY29uc3QgdXBwZXIgPSBhdXRob3JVcHBlclJpdmVyKG9wdHMuc2VlZCwgdGhpcy5sYWtlKTtcbiAgICAgIHRoaXMudXBwZXIgPSB1cHBlci5yZWFjaDtcbiAgICAgIHRoaXMudGFybiA9IHVwcGVyLnRhcm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudXBwZXIgPSBudWxsO1xuICAgICAgdGhpcy50YXJuID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3VyZmFjZSBjdXJyZW50IGZvciBhIHdhdGVyIGNvbHVtbi4gYGxldmVsYCBpcyB0aGUgY29sdW1uJ3Mgd2F0ZXIgc3VyZmFjZSxcbiAgICogdXNlZCB0byB0ZWxsIHNlYS1sZXZlbCB3YXRlciAobGFrZSwgbG93ZXIgcml2ZXIsIHNlYSkgZnJvbSB0aGUgdXBwZXIgcml2ZXIuXG4gICAqL1xuICBmbG93QXQoeDogbnVtYmVyLCB6OiBudW1iZXIsIGxldmVsOiBudW1iZXIpOiBGbG93U2FtcGxlIHtcbiAgICBpZiAodGhpcy51cHBlciAmJiBsZXZlbCA+IDAuNSkge1xuICAgICAgY29uc3QgaGl0ID0gdGhpcy51cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCAmJiBoaXQuZCA8PSBoaXQud2lkdGggKyAyKSB7XG4gICAgICAgIGNvbnN0IHNwZWVkID0gY2xhbXAoMC41NSArIGhpdC5ncmFkaWVudCAqIDksIDAuNCwgNC41KTtcbiAgICAgICAgcmV0dXJuIHsgYm9keTogJ3JpdmVyJywgZHg6IGhpdC50eCwgZHo6IGhpdC50eiwgc3BlZWQgfTtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLnRhcm4gJiYgTWF0aC5oeXBvdCh4IC0gdGhpcy50YXJuLngsIHogLSB0aGlzLnRhcm4ueikgPCB0aGlzLnRhcm4uciArIDQpIHtcbiAgICAgICAgcmV0dXJuIHsgYm9keTogJ2xha2UnLCAuLi50b3dhcmRzKHgsIHosIHRoaXMudXBwZXJTb3VyY2UoKSwgMC4wNikgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgbG93ID0gdGhpcy5sb3dlci5uZWFyZXN0KHgsIHopO1xuICAgIGlmIChsb3cgJiYgbG93LmQgPD0gbG93LndpZHRoICsgNikge1xuICAgICAgcmV0dXJuIHsgYm9keTogJ3JpdmVyJywgZHg6IGxvdy50eCwgZHo6IGxvdy50eiwgc3BlZWQ6IDAuMzUgKyAwLjI1ICogc21vb3Roc3RlcChsb3cud2lkdGggKyA2LCAwLCBsb3cuZCkgfTtcbiAgICB9XG4gICAgY29uc3QgbGQgPSBNYXRoLmh5cG90KCh4IC0gdGhpcy5sYWtlLngpIC8gdGhpcy5sYWtlLnJ4LCAoeiAtIHRoaXMubGFrZS56KSAvIHRoaXMubGFrZS5yeik7XG4gICAgaWYgKGxkIDwgMS4zNSkge1xuICAgICAgLy8gU2xvdyBkcmlmdCBmcm9tIHRoZSBpbmZsb3cgdG93YXJkIHRoZSBvdXRmbG93IGF0IHRoZSBoZWFkIG9mIHRoZSBsb3dlciByaXZlci5cbiAgICAgIGNvbnN0IGhlYWQgPSB0aGlzLmxvd2VyLnBvaW50c1t0aGlzLmxvd2VyLnBvaW50cy5sZW5ndGggLSAxXTtcbiAgICAgIGNvbnN0IGRyaWZ0ID0gdG93YXJkcyh4LCB6LCBoZWFkLCAwLjA4KTtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4uZHJpZnQgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgYm9keTogJ3NlYScsIGR4OiAwLCBkejogMCwgc3BlZWQ6IDAgfTtcbiAgfVxuXG4gIHByaXZhdGUgdXBwZXJTb3VyY2UoKTogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9IHtcbiAgICBjb25zdCBwdHMgPSB0aGlzLnVwcGVyIS5wb2ludHM7XG4gICAgcmV0dXJuIHB0c1twdHMubGVuZ3RoIC0gMV07XG4gIH1cbn1cblxuZnVuY3Rpb24gdG93YXJkcyh4OiBudW1iZXIsIHo6IG51bWJlciwgcDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9LCBzcGVlZDogbnVtYmVyKSB7XG4gIGNvbnN0IGR4ID0gcC54IC0geCwgZHogPSBwLnogLSB6O1xuICBjb25zdCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeikgfHwgMTtcbiAgcmV0dXJuIHsgZHg6IGR4IC8gbGVuLCBkejogZHogLyBsZW4sIHNwZWVkIH07XG59XG5cbi8qKiBGaW5kIHRoZSB2YWxsZXkgbGFrZSBmcm9tIHRoZSB0ZXJyYWluIGl0c2VsZjogdGhlIGRlZXAgYmFzaW4gTlcgb2YgdGhlIGZvdW5kZXIgdmFsbGV5LiAqL1xuZnVuY3Rpb24gbG9jYXRlTGFrZShoOiBIZWlnaHRTYW1wbGVyKTogSHlkcm9sb2d5WydsYWtlJ10ge1xuICBsZXQgc3ggPSAwLCBzeiA9IDAsIG4gPSAwLCBtaW5YID0gSW5maW5pdHksIG1heFggPSAtSW5maW5pdHksIG1pblogPSBJbmZpbml0eSwgbWF4WiA9IC1JbmZpbml0eTtcbiAgZm9yIChsZXQgeiA9IC00NjA7IHogPD0gLTEyMDsgeiArPSA0KSB7XG4gICAgZm9yIChsZXQgeCA9IC00ODA7IHggPD0gLTQwOyB4ICs9IDQpIHtcbiAgICAgIGlmIChoKHgsIHopID4gLTQpIGNvbnRpbnVlO1xuICAgICAgc3ggKz0geDsgc3ogKz0gejsgbisrO1xuICAgICAgbWluWCA9IE1hdGgubWluKG1pblgsIHgpOyBtYXhYID0gTWF0aC5tYXgobWF4WCwgeCk7XG4gICAgICBtaW5aID0gTWF0aC5taW4obWluWiwgeik7IG1heFogPSBNYXRoLm1heChtYXhaLCB6KTtcbiAgICB9XG4gIH1cbiAgaWYgKG4gPT09IDApIHJldHVybiB7IHg6IC0yNjAsIHo6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9O1xuICByZXR1cm4ge1xuICAgIHg6IHN4IC8gbiwgejogc3ogLyBuLFxuICAgIHJ4OiBNYXRoLm1heCgzMCwgKG1heFggLSBtaW5YKSAvIDIgKyAxMCksIHJ6OiBNYXRoLm1heCgzMCwgKG1heFogLSBtaW5aKSAvIDIgKyAxMCksXG4gIH07XG59XG5cbi8qKlxuICogVHJhY2UgdGhlIGNhcnZlZCBsb3dsYW5kIGNoYW5uZWwgZnJvbSB0aGUgbGFrZSBvdXRmbG93IHNvdXRoIHRvIHRoZSBzZWEuIEZvclxuICogZWFjaCA0IG0gcm93IHRoZSBjaGFubmVsIGlzIHRoZSBsb3dlc3QgY29sdW1uIG5lYXIgdGhlIHByZXZpb3VzIGNlbnRyZTsgdGhlXG4gKiB0cmFjZSBpcyBzbW9vdGhlZCBzbyB0aGUgZmxvdyBmaWVsZCBkb2VzIG5vdCBqaXR0ZXIgd2l0aCB0aGUgMSBtIHZveGVscy5cbiAqL1xuZnVuY3Rpb24gdHJhY2VMb3dlclJpdmVyKGg6IEhlaWdodFNhbXBsZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKTogUml2ZXJSZWFjaCB7XG4gIGNvbnN0IHJhdzogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBsZXQgY3ggPSBsYWtlLnggKyBsYWtlLnJ4ICogMC41NTtcbiAgbGV0IHogPSBNYXRoLnJvdW5kKGxha2UueiArIGxha2UucnogKiAwLjYpO1xuICAvLyBTdGFydCBhdCB0aGUgbGFrZSdzIHNvdXRoLWVhc3Qgb3V0ZmxvdyBhbmQgZm9sbG93IHRoZSBjaGFubmVsIGRvd25zdHJlYW0uXG4gIGZvciAoOyB6IDw9IDkwMDsgeiArPSA0KSB7XG4gICAgbGV0IGJlc3QgPSBJbmZpbml0eSwgYnggPSBjeDtcbiAgICBmb3IgKGxldCB4ID0gTWF0aC5yb3VuZChjeCAtIDQwKTsgeCA8PSBjeCArIDQwOyB4ICs9IDIpIHtcbiAgICAgIGNvbnN0IHYgPSBoKHgsIHopICsgTWF0aC5hYnMoeCAtIGN4KSAqIDAuMDI7XG4gICAgICBpZiAodiA8IGJlc3QpIHsgYmVzdCA9IHY7IGJ4ID0geDsgfVxuICAgIH1cbiAgICBjeCA9IGJ4O1xuICAgIHJhdy5wdXNoKHsgeDogYngsIHogfSk7XG4gICAgLy8gVGhlIHRyYWNlIGVuZHMgb25jZSBpdCByZWFjaGVzIG9wZW4gc2VhIGZvciBhIHN1c3RhaW5lZCBzdHJldGNoLlxuICAgIGlmIChiZXN0IDwgLTYgJiYgcmF3Lmxlbmd0aCA+IDIwICYmIGgoYngsIHogKyA4KSA8IC02ICYmIGgoYngsIHogKyAxNikgPCAtNikgYnJlYWs7XG4gIH1cbiAgY29uc3Qgc21vb3RoID0gcmF3Lm1hcCgocCwgaSkgPT4ge1xuICAgIGxldCBzeCA9IDAsIG4gPSAwO1xuICAgIGZvciAobGV0IGsgPSBNYXRoLm1heCgwLCBpIC0gNCk7IGsgPD0gTWF0aC5taW4ocmF3Lmxlbmd0aCAtIDEsIGkgKyA0KTsgaysrKSB7IHN4ICs9IHJhd1trXS54OyBuKys7IH1cbiAgICByZXR1cm4geyB4OiBzeCAvIG4sIHo6IHAueiB9O1xuICB9KTtcbiAgLy8gU3RvcmUgZG93bnN0cmVhbS1maXJzdDogaW5kZXggMCBpcyB0aGUgc2VhIG1vdXRoLlxuICBzbW9vdGgucmV2ZXJzZSgpO1xuICBjb25zdCBwb2ludHM6IFJpdmVyUG9pbnRbXSA9IFtdO1xuICBsZXQgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc21vb3RoLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGkgPiAwKSBzICs9IE1hdGguaHlwb3Qoc21vb3RoW2ldLnggLSBzbW9vdGhbaSAtIDFdLngsIHNtb290aFtpXS56IC0gc21vb3RoW2kgLSAxXS56KTtcbiAgICBwb2ludHMucHVzaCh7IHg6IHNtb290aFtpXS54LCB6OiBzbW9vdGhbaV0ueiwgcywgbGV2ZWw6IDAsIHdpZHRoOiA2IH0pO1xuICB9XG4gIHJldHVybiBuZXcgUml2ZXJSZWFjaChwb2ludHMsIDQwKTtcbn1cblxuLyoqIFdhdGVyLXN1cmZhY2UgZHJvcHMgYWxvbmcgdGhlIHVwcGVyIHJpdmVyLCBhcyAoZnJhY3Rpb24gb2YgbGVuZ3RoLCBtZXRyZXMpLiAqL1xuY29uc3QgRkFMTFM6IFJlYWRvbmx5QXJyYXk8cmVhZG9ubHkgW251bWJlciwgbnVtYmVyXT4gPSBbWzAuMiwgN10sIFswLjQ4LCAxMV0sIFswLjc0LCAxM11dO1xuY29uc3QgVVBQRVJfR1JBRElFTlQgPSAwLjAzO1xuXG4vKipcbiAqIEF1dGhvciB0aGUgdjIgbW91bnRhaW4gcml2ZXI6IGEgc2VlZGVkIG1lYW5kZXJpbmcgY2VudHJlbGluZSBmcm9tIHRoZSBsYWtlJ3NcbiAqIG5vcnRoIHNob3JlIHRvIGEgaGlnaGxhbmQgdGFybiwgd2l0aCBhIGxldmVsIHByb2ZpbGUgdGhhdCBvbmx5IHJpc2VzXG4gKiB1cHN0cmVhbSAoZ2VudGxlIGdyYWRpZW50IHBsdXMgdGhyZWUgY2FzY2FkZXMpLlxuICovXG5mdW5jdGlvbiBhdXRob3JVcHBlclJpdmVyKHNlZWQ6IG51bWJlciwgbGFrZTogSHlkcm9sb2d5WydsYWtlJ10pOiB7XG4gIHJlYWNoOiBSaXZlclJlYWNoOyB0YXJuOiBOb25OdWxsYWJsZTxIeWRyb2xvZ3lbJ3Rhcm4nXT47XG59IHtcbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoc2VlZCBeIDB4NWVlZDIpID4+PiAwKTtcbiAgY29uc3QgaiA9IChhOiBudW1iZXIpID0+IChybmQoKSAtIDAuNSkgKiAyICogYTtcbiAgY29uc3QgbW91dGggPSB7IHg6IGxha2UueCArIGxha2UucnggKiAwLjEsIHo6IGxha2UueiAtIGxha2UucnogKiAwLjU1IH07XG4gIGNvbnN0IGNvbnRyb2xzID0gW1xuICAgIG1vdXRoLFxuICAgIHsgeDogbGFrZS54ICsgMjAgKyBqKDIwKSwgejogLTQxMCArIGooMTUpIH0sXG4gICAgeyB4OiAtMTkwICsgaigzNSksIHo6IC01MjAgKyBqKDIwKSB9LFxuICAgIHsgeDogLTIxNSArIGooMzUpLCB6OiAtNjQwICsgaigyMCkgfSxcbiAgICB7IHg6IC0xNjUgKyBqKDMwKSwgejogLTc3MCArIGooMTUpIH0sXG4gIF07XG4gIC8vIENhdG11bGwtUm9tIHRocm91Z2ggdGhlIGNvbnRyb2xzLCB0aGVuIHJlc2FtcGxlIGF0IH44IG0gc3BhY2luZyB3aXRoIGFcbiAgLy8gc21hbGwgc2VlZGVkIG1lYW5kZXIgc28gdGhlIGNoYW5uZWwgaXMgbm90IGEgc21vb3RoIHNwbGluZS5cbiAgY29uc3QgZGVuc2U6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb250cm9scy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICBjb25zdCBwMCA9IGNvbnRyb2xzW01hdGgubWF4KDAsIGkgLSAxKV0sIHAxID0gY29udHJvbHNbaV07XG4gICAgY29uc3QgcDIgPSBjb250cm9sc1tpICsgMV0sIHAzID0gY29udHJvbHNbTWF0aC5taW4oY29udHJvbHMubGVuZ3RoIC0gMSwgaSArIDIpXTtcbiAgICBmb3IgKGxldCBrID0gMDsgayA8IDI0OyBrKyspIHtcbiAgICAgIGNvbnN0IHQgPSBrIC8gMjQsIHQyID0gdCAqIHQsIHQzID0gdDIgKiB0O1xuICAgICAgZGVuc2UucHVzaCh7XG4gICAgICAgIHg6IDAuNSAqICgyICogcDEueCArICgtcDAueCArIHAyLngpICogdCArICgyICogcDAueCAtIDUgKiBwMS54ICsgNCAqIHAyLnggLSBwMy54KSAqIHQyXG4gICAgICAgICAgKyAoLXAwLnggKyAzICogcDEueCAtIDMgKiBwMi54ICsgcDMueCkgKiB0MyksXG4gICAgICAgIHo6IDAuNSAqICgyICogcDEueiArICgtcDAueiArIHAyLnopICogdCArICgyICogcDAueiAtIDUgKiBwMS56ICsgNCAqIHAyLnogLSBwMy56KSAqIHQyXG4gICAgICAgICAgKyAoLXAwLnogKyAzICogcDEueiAtIDMgKiBwMi56ICsgcDMueikgKiB0MyksXG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgZGVuc2UucHVzaChjb250cm9sc1tjb250cm9scy5sZW5ndGggLSAxXSk7XG4gIGNvbnN0IHJlc2FtcGxlZDogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlcjsgczogbnVtYmVyIH0+ID0gW3sgLi4uZGVuc2VbMF0sIHM6IDAgfV07XG4gIGxldCBhY2MgPSAwLCBzID0gMDtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBkZW5zZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHN0ZXAgPSBNYXRoLmh5cG90KGRlbnNlW2ldLnggLSBkZW5zZVtpIC0gMV0ueCwgZGVuc2VbaV0ueiAtIGRlbnNlW2kgLSAxXS56KTtcbiAgICBhY2MgKz0gc3RlcDsgcyArPSBzdGVwO1xuICAgIGlmIChhY2MgPj0gOCB8fCBpID09PSBkZW5zZS5sZW5ndGggLSAxKSB7XG4gICAgICBjb25zdCBtID0gKGZibTIocyAvIDYwLCAzLjEsIHNlZWQgKyA4MDEsIDIpIC0gMC41KSAqIDE0O1xuICAgICAgcmVzYW1wbGVkLnB1c2goeyB4OiBkZW5zZVtpXS54ICsgbSwgejogZGVuc2VbaV0ueiwgcyB9KTtcbiAgICAgIGFjYyA9IDA7XG4gICAgfVxuICB9XG4gIGNvbnN0IHRvdGFsID0gcmVzYW1wbGVkW3Jlc2FtcGxlZC5sZW5ndGggLSAxXS5zO1xuICBjb25zdCBsZXZlbEF0ID0gKHN2OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGxldCBsZXZlbCA9IHN2ICogVVBQRVJfR1JBRElFTlQ7XG4gICAgZm9yIChjb25zdCBbZnJhYywgZHJvcF0gb2YgRkFMTFMpIHtcbiAgICAgIC8vIEVhY2ggZmFsbCBpcyBhIHNob3J0IGNhc2NhZGUgb3ZlciB+MTAgbSBvZiBjaGFubmVsLlxuICAgICAgbGV2ZWwgKz0gZHJvcCAqIHNtb290aHN0ZXAodG90YWwgKiBmcmFjIC0gNSwgdG90YWwgKiBmcmFjICsgNSwgc3YpO1xuICAgIH1cbiAgICAvLyBUaGUgZmlyc3QgNDAgbSBpbnRvIHRoZSBsYWtlIHN0YXlzIGF0IGxha2UgbGV2ZWwuXG4gICAgcmV0dXJuIHN2IDwgNDAgPyAwIDogbGV2ZWwgLSA0MCAqIFVQUEVSX0dSQURJRU5UO1xuICB9O1xuICBjb25zdCBwb2ludHM6IFJpdmVyUG9pbnRbXSA9IHJlc2FtcGxlZC5tYXAoKHApID0+ICh7XG4gICAgeDogcC54LCB6OiBwLnosIHM6IHAucywgbGV2ZWw6IE1hdGgubWF4KDAsIGxldmVsQXQocC5zKSksXG4gICAgd2lkdGg6IDMuMiArIDIuMiAqIGZibTIocC5zIC8gNzAsIDkuNywgc2VlZCArIDgwMiwgMikgKyAoMSAtIHAucyAvIHRvdGFsKSAqIDEuNSxcbiAgfSkpO1xuICBjb25zdCBzb3VyY2UgPSBwb2ludHNbcG9pbnRzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4ge1xuICAgIHJlYWNoOiBuZXcgUml2ZXJSZWFjaChwb2ludHMsIDExMCksXG4gICAgdGFybjogeyB4OiBzb3VyY2UueCwgejogc291cmNlLnosIHI6IDE4LCBsZXZlbDogc291cmNlLmxldmVsIH0sXG4gIH07XG59XG4iLCAiLy8gVm94ZWwgbWF0ZXJpYWwgaWRzLiBQdXJlIGRhdGEgc2hhcmVkIGJ5IHRoZSBzaW11bGF0aW9uIGxheWVyIChELTAwNSkuXG4vLyBJZHMgYXJlIHBlcnNpc3RlZCBpbiBzbmFwc2hvdCBlZGl0cywgc28gZXhpc3RpbmcgdmFsdWVzIG11c3QgbmV2ZXIgY2hhbmdlLlxuZXhwb3J0IGNvbnN0IE1BVCA9IHtcbiAgQUlSOiAwLFxuICBHUkFTUzogMSxcbiAgU09JTDogMixcbiAgU0FORDogMyxcbiAgR1JBVkVMOiA0LFxuICBTVE9ORTogNSxcbiAgT1JFOiA2LFxuICBXQVRFUjogNyxcbiAgQkVEUk9DSzogOCxcbiAgTU9TUzogOSxcbiAgLyoqIEdlbmVyYXRvciB2MiBoaWdobGFuZHMuIE5ldmVyIHByb2R1Y2VkIGJ5IGdlbmVyYXRvciB2MS4gKi9cbiAgU05PVzogMTAsXG59IGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgTWF0SWQgPSAodHlwZW9mIE1BVClba2V5b2YgdHlwZW9mIE1BVF07XG5cbmV4cG9ydCBjb25zdCBpc1NvbGlkID0gKG06IG51bWJlcik6IGJvb2xlYW4gPT4gbSAhPT0gTUFULkFJUiAmJiBtICE9PSBNQVQuV0FURVI7XG5leHBvcnQgY29uc3QgaXNPcGFxdWUgPSBpc1NvbGlkO1xuXG4vKiogSGlnaGVzdCBtYXRlcmlhbCBpZCB0aGF0IG1heSBhcHBlYXIgaW4gYSB2b3hlbCBlZGl0LiAqL1xuZXhwb3J0IGNvbnN0IE1BWF9NQVRfSUQgPSAxMDtcbiIsICIvLyBUZXJyYWluIGdlbmVyYXRvciB2MiBcdTIwMTQgdGhlIHZhbGxleS13aXRoLW1vdW50YWlucyBnZW9ncmFwaHkgKHB1cmUgVFMsIEQtMDA1KS5cbi8vXG4vLyBDb21wYXRpYmlsaXR5IGNvbnRyYWN0OiBpbnNpZGUgdGhlIGZvdW5kZXIgY29ycmlkb3IgKHRoZSBzZXR0bGVtZW50IHZhbGxleSxcbi8vIHRoZSBsYWtlIGFuZCB0aGUgbG93bGFuZCByaXZlcikgdjIgaGVpZ2h0cyBlcXVhbCB2MSBleGFjdGx5LCBzbyB0aGUgcGlubmVkXG4vLyBmb3VuZGVyIHByb2plY3RzLCB0aGVpciBwcmVwYXJhdGlvbiB0YXJnZXRzIGFuZCBuYXR1cmFsIGVudGl0aWVzIHRoZXJlIGFyZVxuLy8gdW5jaGFuZ2VkLiBPdXRzaWRlIGl0IHYyIGFkZHM6XG4vLyAgIC0gYSBub3J0aGVybiBtYXNzaWYgb24gYW4gZXh0ZW5kZWQgaXNsYW5kLCB3aXRoIHNub3cgYWJvdmUgdGhlIHNub3dsaW5lO1xuLy8gICAtIGZsYW5raW5nIHJhbmdlcyB3ZXN0IGFuZCBlYXN0IG9mIHRoZSB2YWxsZXksIHRlcnJhY2VkIGludG8gY2xpZmYgYmFuZHM7XG4vLyAgIC0gYSBtb3VudGFpbiByaXZlciBjYXJ2ZWQgaW50byB0aGUgbWFzc2lmIGZyb20gYSB0YXJuIGRvd24gdG8gdGhlIGxha2UsXG4vLyAgICAgd2hvc2Ugd2F0ZXIgc3VyZmFjZSBjb21lcyBmcm9tIEh5ZHJvbG9neSBhbmQgbmV2ZXIgcmlzZXMgZG93bnN0cmVhbTtcbi8vICAgLSBhIGNvbnRpbnVvdXMgbG93bGFuZCBjaGFubmVsICh2MSBoYXMgYSBkcnkgZm9yZCBzb3V0aCBvZiB0aGUgc2hlbGYpLlxuLy8gSGVpZ2h0cyBhcmUgaW50ZWdlcnMgaW4gWy0xNCwgMTA0XS5cbmltcG9ydCB7IGNsYW1wLCBmYm0yLCBsZXJwLCBzbW9vdGhzdGVwIH0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQgeyBNQVQsIE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuaW1wb3J0IHsgSHlkcm9sb2d5IH0gZnJvbSAnLi9oeWRyb2xvZ3knO1xuXG5leHBvcnQgY29uc3QgVjJfU05PV0xJTkUgPSA3NDtcbmV4cG9ydCBjb25zdCBWMl9NQVhfSEVJR0hUID0gMTA0O1xuXG5leHBvcnQgdHlwZSBWMUhlaWdodCA9IChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVjJDb2x1bW4ge1xuICAvKiogVG9wIHNvbGlkIHkgKyAxIChzYW1lIGNvbnZlbnRpb24gYXMgc3VyZmFjZUhlaWdodEF0KS4gKi9cbiAgaDogbnVtYmVyO1xuICAvKiogV2F0ZXIgc3VyZmFjZSBmb3IgdGhpcyBjb2x1bW46IGNlbGxzIFtoLCBsZXZlbCkgaG9sZCB3YXRlci4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgLyoqIFRydWUgd2hlbiB0aGlzIGNvbHVtbiBpcyBwYXJ0IG9mIHRoZSBjYXJ2ZWQgbW91bnRhaW4tcml2ZXIgY2hhbm5lbC4gKi9cbiAgY2hhbm5lbDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFRlcnJhaW5WMiB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHJlYWRvbmx5IHNlZWQ6IG51bWJlcixcbiAgICBwcml2YXRlIHJlYWRvbmx5IHYxOiBWMUhlaWdodCxcbiAgICByZWFkb25seSBoeWRyb2xvZ3k6IEh5ZHJvbG9neSxcbiAgKSB7fVxuXG4gIC8qKiAwID0gZXhhY3RseSB2MSAoZm91bmRlciBjb3JyaWRvcik7IDEgPSBmdWxsIHYyIHJlbGllZi4gKi9cbiAgcmVsaWVmTWFzayh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3Qgbm9ydGggPSBzbW9vdGhzdGVwKC0zOTAsIC00NzAsIHopO1xuICAgIC8vIFRoZSB3ZXN0IHJhbmdlIGtlZXBzIGNsZWFyIG9mIHRoZSBsYWtlIGJhc2luIHVudGlsIHRoZSBsYWtlIGlzIHBhc3NlZC5cbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UsIHdlc3RFZGdlIC0gOTAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDIzMCwgMzMwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgLyoqIDAgYXQgdGhlIHJhbmdlIGZyb250LCAxIGRlZXAgaW5zaWRlOiBmb290aGlsbHMgZmlyc3QsIHBlYWtzIGJlaGluZC4gKi9cbiAgcmFuZ2VEZXB0aCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3Qgbm9ydGggPSBzbW9vdGhzdGVwKC00MjAsIC03MDAsIHopO1xuICAgIGNvbnN0IHdlc3RFZGdlID0gbGVycCgtNDUwLCAtMzIwLCBzbW9vdGhzdGVwKC0yMjAsIC0xNDAsIHopKTtcbiAgICBjb25zdCB3ZXN0ID0gc21vb3Roc3RlcCh3ZXN0RWRnZSAtIDQwLCB3ZXN0RWRnZSAtIDMwMCwgeCk7XG4gICAgY29uc3QgZWFzdCA9IHNtb290aHN0ZXAoMjcwLCA1NjAsIHgpO1xuICAgIHJldHVybiBNYXRoLm1heChub3J0aCwgd2VzdCwgZWFzdCk7XG4gIH1cblxuICBjb2x1bW4oeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWMkNvbHVtbiB7XG4gICAgY29uc3Qgc2VlZCA9IHRoaXMuc2VlZDtcbiAgICBjb25zdCBiYXNlID0gdGhpcy52MShzZWVkLCB4LCB6KTtcbiAgICBjb25zdCBtYXNrID0gdGhpcy5yZWxpZWZNYXNrKHgsIHopO1xuICAgIGxldCBoID0gYmFzZTtcblxuICAgIGlmIChtYXNrID4gMCkge1xuICAgICAgLy8gRXh0ZW5kIHRoZSBpc2xhbmQgbm9ydGggc28gdGhlIG1hc3NpZiBoYXMgcm9vbSAodjEgY29hc3QgaXMgfnogLTYwMCkuXG4gICAgICBjb25zdCBub3J0aExhbmQgPSBzbW9vdGhzdGVwKC00MjAsIC01MjAsIHopO1xuICAgICAgY29uc3Qgc2hvcmUgPSAxIC0gTWF0aC5oeXBvdCgoeCArIDE1MCkgLyA1NjAsICh6ICsgNjkwKSAvIDMwMClcbiAgICAgICAgKyAoZmJtMih4IC8gMTYwLCB6IC8gMTYwLCBzZWVkICsgNzAxLCAzKSAtIDAuNSkgKiAwLjM7XG4gICAgICBjb25zdCBsYW5kTiA9IHNtb290aHN0ZXAoMC4wLCAwLjE0LCBzaG9yZSkgKiBub3J0aExhbmQ7XG4gICAgICBjb25zdCBncm91bmQgPSBsZXJwKGJhc2UsIE1hdGgubWF4KGJhc2UsIDUgKyA1ICogZmJtMih4IC8gOTAsIHogLyA5MCwgc2VlZCArIDcwMiwgMikpLCBsYW5kTik7XG5cbiAgICAgIC8vIFJpZGdlZCBtYXNzaWYgd2l0aCB0ZXJyYWNlZCBjbGlmZiBiYW5kcy5cbiAgICAgIGNvbnN0IHd4ID0geCArIChmYm0yKHggLyAyNjAsIHogLyAyNjAsIHNlZWQgKyA3MDMsIDMpIC0gMC41KSAqIDEyMDtcbiAgICAgIGNvbnN0IHd6ID0geiArIChmYm0yKHggLyAyNjAgKyA1LjEsIHogLyAyNjAgLSAyLjcsIHNlZWQgKyA3MDQsIDMpIC0gMC41KSAqIDEyMDtcbiAgICAgIGNvbnN0IHIxID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMjEwLCB3eiAvIDIxMCwgc2VlZCArIDcwNSwgNCkgLSAxKTtcbiAgICAgIGNvbnN0IHIyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODAsIHd6IC8gODAsIHNlZWQgKyA3MDYsIDMpIC0gMSk7XG4gICAgICBjb25zdCBsdW1wID0gZmJtMih3eCAvIDEyMCwgd3ogLyAxMjAsIHNlZWQgKyA3MDcsIDMpO1xuICAgICAgY29uc3QgZGVwdGggPSB0aGlzLnJhbmdlRGVwdGgoeCwgeik7XG4gICAgICBsZXQgbW91bnRhaW4gPSAxNiArICg4ICsgODAgKiBkZXB0aCkgKiAoMC41NSAqIHIxICogcjEgKyAwLjI4ICogcjIgKyAwLjE3ICogbHVtcClcbiAgICAgICAgKyAxOCAqIGRlcHRoICogc21vb3Roc3RlcCgwLjU1LCAwLjksIHIxKTtcbiAgICAgIGNvbnN0IGJhbmQgPSA2ICsgMiAqIGZibTIoeCAvIDE0MCwgeiAvIDE0MCwgc2VlZCArIDcwOCwgMik7XG4gICAgICBjb25zdCB0ID0gTWF0aC5mbG9vcihtb3VudGFpbiAvIGJhbmQpO1xuICAgICAgY29uc3QgZnJhYyA9IG1vdW50YWluIC8gYmFuZCAtIHQ7XG4gICAgICBtb3VudGFpbiA9ICh0ICsgc21vb3Roc3RlcCgwLjUsIDAuOCwgZnJhYykpICogYmFuZDtcblxuICAgICAgLy8gT25seSBsYW5kIHJpc2VzOyB0aGUgc2VhIHN0YXlzIHNlYSwgc28gcmFuZ2VzIGVuZCBpbiBjb2FzdGFsIGNsaWZmcy5cbiAgICAgIGNvbnN0IGxhbmRGYWN0b3IgPSBzbW9vdGhzdGVwKC0yLCA4LCBncm91bmQpO1xuICAgICAgaCA9IGxlcnAoZ3JvdW5kLCBNYXRoLm1heChncm91bmQsIG1vdW50YWluKSwgbWFzayAqIGxhbmRGYWN0b3IpO1xuICAgIH1cblxuICAgIGxldCBsZXZlbCA9IGggPCAwID8gMCA6IC1JbmZpbml0eTtcbiAgICBsZXQgY2hhbm5lbCA9IGZhbHNlO1xuXG4gICAgLy8gTW91bnRhaW4gcml2ZXI6IHZhbGxleSBmbG9vciwgYmFua3MgYW5kIGNoYW5uZWwgZm9sbG93IHRoZSB3YXRlciBsZXZlbC5cbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlcikge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgY29uc3QgcmFpc2VkID0gaGl0LmxldmVsID4gMC4yNTtcbiAgICAgICAgY29uc3QgdncgPSA1NSArIDI4ICogZmJtMihoaXQucyAvIDkwLCAxLjcsIHNlZWQgKyA3MDksIDIpO1xuICAgICAgICBjb25zdCBmbG9vciA9IGhpdC5sZXZlbCArIDEuNSArIDIuMiAqIGZibTIoeCAvIDQwLCB6IC8gNDAsIHNlZWQgKyA3MTAsIDIpICsgaGl0LmQgKiAwLjA2O1xuICAgICAgICBjb25zdCB0ID0gc21vb3Roc3RlcCh2dyAqIDAuMywgdncsIGhpdC5kKTtcbiAgICAgICAgaCA9IE1hdGgubWluKGgsIGxlcnAoZmxvb3IsIGgsIHQpKTtcbiAgICAgICAgY29uc3QgdyA9IGhpdC53aWR0aDtcbiAgICAgICAgaWYgKHJhaXNlZCAmJiBoaXQuZCA8IHcgKyAzKSB7XG4gICAgICAgICAgLy8gQmFua3MgaG9sZCBhIHJhaXNlZCByaXZlcjogbmV2ZXIgYmVsb3cgaXRzIHdhdGVyIHN1cmZhY2UuIEF0IGxha2VcbiAgICAgICAgICAvLyBsZXZlbCB0aGUgc2VhLWxldmVsIGZpbGwgYWxyZWFkeSBjb250YWlucyB0aGUgd2F0ZXIuXG4gICAgICAgICAgaCA9IE1hdGgubWF4KGgsIE1hdGguY2VpbChoaXQubGV2ZWwpICsgMSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGhpdC5kIDwgdykge1xuICAgICAgICAgIGNvbnN0IGJlZCA9IGhpdC5sZXZlbCAtICgxLjIgKyAxLjMgKiAoMSAtIGhpdC5kIC8gdykpO1xuICAgICAgICAgIGggPSBNYXRoLm1pbihoLCBiZWQpO1xuICAgICAgICAgIGlmIChyYWlzZWQpIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIE1hdGgucm91bmQoaGl0LmxldmVsKSk7XG4gICAgICAgICAgY2hhbm5lbCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IHRhcm4gPSB0aGlzLmh5ZHJvbG9neS50YXJuO1xuICAgICAgaWYgKHRhcm4pIHtcbiAgICAgICAgY29uc3QgdGQgPSBNYXRoLmh5cG90KHggLSB0YXJuLngsIHogLSB0YXJuLnopXG4gICAgICAgICAgKiAoMSArIDAuMiAqIChmYm0yKHggLyAzMCwgeiAvIDMwLCBzZWVkICsgNzExLCAyKSAtIDAuNSkpO1xuICAgICAgICBpZiAodGQgPCB0YXJuLnIgKyA2KSB7XG4gICAgICAgICAgY29uc3QgcmltID0gTWF0aC5jZWlsKHRhcm4ubGV2ZWwpICsgMTtcbiAgICAgICAgICBpZiAodGQgPj0gdGFybi5yKSBoID0gTWF0aC5tYXgoaCwgcmltKTtcbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGggPSBNYXRoLm1pbihNYXRoLm1heChoLCByaW0pLCB0YXJuLmxldmVsIC0gMSAtIDMgKiBzbW9vdGhzdGVwKHRhcm4uciwgMCwgdGQpKTtcbiAgICAgICAgICAgIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIE1hdGgucm91bmQodGFybi5sZXZlbCkpO1xuICAgICAgICAgICAgY2hhbm5lbCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gTG93bGFuZCBjaGFubmVsIGNvbnRpbnVpdHk6IHYxIGxlYXZlcyBhIGRyeSBmb3JkIHdoZXJlIHRoZSBzaGVsZiBtZWV0cyB0aGUgcml2ZXIuXG4gICAgY29uc3QgbG93ID0gdGhpcy5oeWRyb2xvZ3kubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDwgMi41ICYmIGggPj0gMCAmJiBiYXNlIDwgNCkgaCA9IC0xO1xuXG4gICAgaCA9IE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCBWMl9NQVhfSEVJR0hUKSk7XG4gICAgaWYgKGggPCAwKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCAwKTtcbiAgICByZXR1cm4geyBoLCBsZXZlbDogbGV2ZWwgPT09IC1JbmZpbml0eSA/IGggOiBsZXZlbCwgY2hhbm5lbCB9O1xuICB9XG5cbiAgaGVpZ2h0KHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5jb2x1bW4oeCwgeikuaDtcbiAgfVxuXG4gIC8qKiB2MiB0b3AgbWF0ZXJpYWwuIEZhbGxzIGJhY2sgdG8gdGhlIHYxIHJ1bGVzIGZvciB0aGUgdW5jaGFuZ2VkIGNvcnJpZG9yLiAqL1xuICB0b3BNYXRlcmlhbChcbiAgICB4OiBudW1iZXIsIHo6IG51bWJlciwgY29sOiBWMkNvbHVtbiwgc2xvcGU6IG51bWJlcixcbiAgICB2MVRvcDogKGg6IG51bWJlciwgc2xvcGU6IG51bWJlcikgPT4gTWF0SWQsXG4gICk6IE1hdElkIHtcbiAgICBjb25zdCBoID0gY29sLmg7XG4gICAgaWYgKGNvbC5jaGFubmVsICYmIGNvbC5sZXZlbCA+IGgpIHJldHVybiBNQVQuR1JBVkVMO1xuICAgIGNvbnN0IHVwcGVyID0gdGhpcy5oeWRyb2xvZ3kudXBwZXI7XG4gICAgaWYgKHVwcGVyICYmIGggPiAxKSB7XG4gICAgICBjb25zdCBoaXQgPSB1cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCAmJiBoaXQuZCA8IGhpdC53aWR0aCArIDIuNSAmJiBoaXQubGV2ZWwgPiAwLjI1KSB7XG4gICAgICAgIHJldHVybiBmYm0yKHggLyA2LCB6IC8gNiwgdGhpcy5zZWVkICsgNzEyLCAxKSA+IDAuNSA/IE1BVC5HUkFWRUwgOiBNQVQuU0FORDtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgc25vd2xpbmUgPSBWMl9TTk9XTElORSArIChmYm0yKHggLyA3MCwgeiAvIDcwLCB0aGlzLnNlZWQgKyA3MTMsIDMpIC0gMC41KSAqIDE2O1xuICAgIGlmIChoID49IHNub3dsaW5lICYmIHNsb3BlIDw9IDMpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAoaCA+PSBzbm93bGluZSAtIDYgJiYgc2xvcGUgPD0gMSAmJiBmYm0yKHggLyAyMCwgeiAvIDIwLCB0aGlzLnNlZWQgKyA3MTQsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TTk9XO1xuICAgIGlmICh0aGlzLnJlbGllZk1hc2soeCwgeikgPiAwLjUgJiYgaCA+IDMwICYmIHNsb3BlID49IDIpIHJldHVybiBNQVQuU1RPTkU7XG4gICAgcmV0dXJuIHYxVG9wKGgsIHNsb3BlKTtcbiAgfVxufVxuIiwgIi8vIFNpbXVsYXRpb24gbGF5ZXIgXHUyMDE0IHB1cmUgVHlwZVNjcmlwdCwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDEgd29ybGQgZm91bmRhdGlvbjogYSBjaHVua2VkLCBnZW51aW5lbHkgdGhyZWUtZGltZW5zaW9uYWwgdm94ZWwgd29ybGQuXG4vLyBUaGUgc3RvcmVkIHN0YXRlIGlzIG9uZSBtYXRlcmlhbCBieXRlIHBlciBjZWxsICgwID0gYWlyKTsgb2NjdXBhbmN5IGlzXG4vLyBpbXBsaWNpdC4gU3VyZmFjZSBoZWlnaHQgaXMgYSBkZXJpdmVkIHF1ZXJ5LCBub3QgdGhlIHN0b3JhZ2UuIFRoaXMgcmVwbGFjZXNcbi8vIHRoZSBmb3JtZXIgMjU2IHggMjU2IGhlaWdodGZpZWxkIChzZWUgSVItMDA1KS5cbi8vXG4vLyBXb3JsZCBtZXRyZXM6IHgveiBpbiBbLTEwMjQsIDEwMjQpLCB5IGluIFstMTYsIDExMiksIHNlYSBsZXZlbCAwLlxuLy8gQSBjaHVuayBpcyAzMiB4IDMyIHggMTI4IGNlbGxzLiBHZW5lcmF0aW9uIGlzIGEgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCxcbi8vIGdlbmVyYXRvciB2ZXJzaW9uLCBwYXJhbWV0ZXJzIGFuZCBjaHVuayBjb29yZGluYXRlczsgZWRpdHMgYXJlIHJlY29yZGVkXG4vLyBzZXBhcmF0ZWx5IGFuZCByZS1hcHBsaWVkIHdoZW4gYSBjaHVuayBpcyByZWdlbmVyYXRlZC5cbmltcG9ydCB0eXBlIHsgU3RydWN0dXJlIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB0eXBlIHsgTGlmZVN0YXRlIH0gZnJvbSAnLi9lY29ub215JztcbmltcG9ydCB0eXBlIHsgSG9tZXN0ZWFkU3RhdGUgfSBmcm9tICcuL2hvbWVzdGVhZCc7XG5pbXBvcnQgeyBpc1N0b25lUmVwbGF5IH0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuaW1wb3J0IHsgSHlkcm9sb2d5IH0gZnJvbSAnLi9oeWRyb2xvZ3knO1xuaW1wb3J0IHsgVGVycmFpblYyLCBWMkNvbHVtbiB9IGZyb20gJy4vdGVycmFpbi12Mic7XG5pbXBvcnQgeyB0cmVlVGltYmVyIH0gZnJvbSAnLi92ZWdldGF0aW9uJztcblxuZXhwb3J0IGNvbnN0IFdPUkxEX1NJWkUgPSAyMDQ4O1xuZXhwb3J0IGNvbnN0IEhBTEYgPSBXT1JMRF9TSVpFIC8gMjtcbmV4cG9ydCBjb25zdCBDSFVOS19TSVpFID0gMzI7XG5leHBvcnQgY29uc3QgQ0hVTktTX1BFUl9TSURFID0gV09STERfU0laRSAvIENIVU5LX1NJWkU7XG5leHBvcnQgY29uc3QgWV9NSU4gPSAtMTY7XG5leHBvcnQgY29uc3QgWV9NQVggPSAxMTI7XG5leHBvcnQgY29uc3QgV09STERfSEVJR0hUID0gWV9NQVggLSBZX01JTjtcbmV4cG9ydCBjb25zdCBTRUFfTEVWRUwgPSAwO1xuZXhwb3J0IGNvbnN0IFdBVEVSID0gU0VBX0xFVkVMO1xuLyoqIEdlbmVyYXRvciB2MTogdGhlIG9yaWdpbmFsIDIwNDggbSBpc2xhbmQuIERlZmF1bHQgZm9yIGNyZWF0ZVdvcmxkIGFuZCBhbGwgbGVnYWN5IHNhdmVzLiAqL1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WRVJTSU9OID0gMTtcbi8qKiBHZW5lcmF0b3IgdjI6IHZhbGxleS13aXRoLW1vdW50YWlucyBnZW9ncmFwaHkgd2l0aCBhIG1vdW50YWluIHJpdmVyIChzZWUgdGVycmFpbi12Mi50cykuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1YyID0gMjtcbi8qKiBUaGUgZ2VuZXJhdG9yIG5ldyBicm93c2VyIHdvcmxkcyB1c2UgYnkgZGVmYXVsdC4gKi9cbmV4cG9ydCBjb25zdCBMQVRFU1RfR0VORVJBVE9SX1ZFUlNJT04gPSBHRU5FUkFUT1JfVjI7XG5leHBvcnQgY29uc3QgU1VQUE9SVEVEX0dFTkVSQVRPUl9WRVJTSU9OUzogcmVhZG9ubHkgbnVtYmVyW10gPSBbR0VORVJBVE9SX1ZFUlNJT04sIEdFTkVSQVRPUl9WMl07XG5leHBvcnQgY29uc3QgaXNTdXBwb3J0ZWRHZW5lcmF0b3IgPSAodjogdW5rbm93bik6IHYgaXMgbnVtYmVyID0+XG4gIHR5cGVvZiB2ID09PSAnbnVtYmVyJyAmJiBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TLmluY2x1ZGVzKHYpO1xuZXhwb3J0IGNvbnN0IENIVU5LX1ZPTFVNRSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFICogV09STERfSEVJR0hUO1xuZXhwb3J0IGNvbnN0IENIVU5LX0FSRUEgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRTtcblxuZXhwb3J0IHsgTUFULCBpc1NvbGlkLCBpc09wYXF1ZSwgTUFYX01BVF9JRCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmV4cG9ydCB0eXBlIHsgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBNQVQsIGlzU29saWQsIE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuXG5leHBvcnQge1xuICBjbGFtcCwgbGVycCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIGZibTIsXG59IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHtcbiAgY2xhbXAsIGxlcnAsIHNtb290aHN0ZXAsIGhhc2gyaSwgaGFzaDNpLCBtdWxiZXJyeTMyLCB2YWx1ZU5vaXNlMywgZmJtMiwgZmJtMyxcbn0gZnJvbSAnLi9ub2lzZSc7XG5cbi8vIC0tLS0tLS0tLS0gd29ybGQgdHlwZXMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFBhcmFtcyB7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1BBUkFNUzogV29ybGRQYXJhbXMgPSB7XG4gIHNpemU6IFdPUkxEX1NJWkUsXG4gIGNodW5rU2l6ZTogQ0hVTktfU0laRSxcbiAgeU1pbjogWV9NSU4sXG4gIHlNYXg6IFlfTUFYLFxuICBzZWFMZXZlbDogU0VBX0xFVkVMLFxuICBnZW5lcmF0b3JWZXJzaW9uOiBHRU5FUkFUT1JfVkVSU0lPTixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIGtleTogc3RyaW5nO1xuICAvKiogeCArIHoqMzIgKyAoeS1ZX01JTikqMTAyNCAqL1xuICBkYXRhOiBVaW50OEFycmF5O1xuICAvKiogdG9wIHNvbGlkIHksIGVuY29kZWQgYXMgKHkgLSBZX01JTiksIDAuLjEyNzsgMCBtZWFucyBubyBzb2xpZC4gKi9cbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgLyoqIHRvcCBtYXRlcmlhbCBwZXIgY29sdW1uLiAqL1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xuICBkaXJ0eTogYm9vbGVhbjtcbiAgZ2VuZXJhdGVkQXQ6IG51bWJlcjtcbn1cblxuLy8gTmF0dXJhbCBhc3NldHMgYXJlIHRoZSBwcm9qZWN0J3MgU3R5bCAoYG5hdF9gKSBwaXBlbGluZSAoQVMtMDAxIHYyKSwgbm90XG4vLyBOb3hlbCBhcmNoaXRlY3R1cmUuIE5veGVsIHJlbWFpbnMgdGhlIGh1bWFuLW1hZGUga2l0L3dheXN0b25lL21hcmtlciBzeXN0ZW0uXG4vLyBSZXRpcmVkIG9ubHkgYXMgd29ybGQgY29udGVudC4gVGhlIG5hbWVzIHJlbWFpbiBpbiB0aGUgc2VyaWFsaXplZCB0eXBlIHNvXG4vLyBvbGQgc25hcHNob3RzIGFuZCBhY2NlcHRlZCBoYXJ2ZXN0IGpvdXJuYWxzIGNhbiBiZSBtaWdyYXRlZCB3aXRob3V0IHJlamVjdGluZ1xuLy8gb3RoZXJ3aXNlIHZhbGlkIHNhdmVzLiBHZW5lcmF0aW9uLCBjb2xsaXNpb24gYW5kIGluc3BlY3Rpb24gbmV2ZXIgdXNlIHRoZW0uXG5leHBvcnQgY29uc3QgUkVUSVJFRF9TVE9ORV9LSU5EUyA9IG5ldyBTZXQ8RW50aXR5S2luZD4oW1xuICAnc3R5bF9yb2NrX3NtYWxsJywgJ3N0eWxfcm9ja19tZWRpdW0nLCAnc3R5bF9yb2NrX2xhcmdlJyxcbl0pO1xuZXhwb3J0IGNvbnN0IGlzUmV0aXJlZFN0b25lS2luZCA9IChraW5kOiBFbnRpdHlLaW5kKTogYm9vbGVhbiA9PiBSRVRJUkVEX1NUT05FX0tJTkRTLmhhcyhraW5kKTtcbmV4cG9ydCB0eXBlIEFjdGl2ZUVudGl0eUtpbmQgPSBFeGNsdWRlPEVudGl0eUtpbmQsXG4gICdzdHlsX3JvY2tfc21hbGwnIHwgJ3N0eWxfcm9ja19tZWRpdW0nIHwgJ3N0eWxfcm9ja19sYXJnZSc+O1xuXG5mdW5jdGlvbiBsaXZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEVudGl0eSB8IG51bGwge1xuICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICByZXR1cm4gIWVudGl0eSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGlkKSA/IG51bGwgOiBlbnRpdHk7XG59XG5cbmV4cG9ydCB0eXBlIEVudGl0eUtpbmQgPVxuICB8ICdzdHlsX3RyZWVfc3BpcmUnXG4gIHwgJ3N0eWxfdHJlZV90YWJsZSdcbiAgfCAnc3R5bF90cmVlX2NsdXN0ZXInXG4gIHwgJ3N0eWxfdHJlZV9ibG9zc29tJ1xuICB8ICdzdHlsX3NocnViJ1xuICB8ICdzdHlsX3JvY2tfc21hbGwnXG4gIHwgJ3N0eWxfcm9ja19tZWRpdW0nXG4gIHwgJ3N0eWxfcm9ja19sYXJnZSdcbiAgfCAnc3R5bF9vcmUnXG4gIHwgJ3N0eWxfY2Fpcm4nXG4gIHwgJ3dheXN0b25lJ1xuICB8ICdtYXJrZXInO1xuXG5leHBvcnQgdHlwZSBSZXNvdXJjZVR5cGUgPSAnd29vZCcgfCAnc3RvbmUnIHwgJ29yZScgfCAnZmliZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVudGl0eSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIGNodW5rOiBzdHJpbmc7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBzY2FsZTogbnVtYmVyO1xuICB2YXJpYW50OiBudW1iZXI7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsO1xuICByZW1haW5pbmc6IG51bWJlcjtcbiAgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXI7XG4gIC8qKiBUcnVlIG9uY2UgdGhlIGVudGl0eSBpcyBmdWxseSBkZXBsZXRlZC4gKi9cbiAgaGFydmVzdGVkOiBib29sZWFuO1xuICAvKiogVHJ1ZSBhZnRlciB0aGUgZmlyc3Qgc3VjY2Vzc2Z1bCBoYXJ2ZXN0LCBldmVuIGlmIHlpZWxkIHJlbWFpbnMuICovXG4gIGhhcnZlc3RlZE9uY2U/OiBib29sZWFuO1xuICBwcm92aXNpb25hbDogYm9vbGVhbjtcbiAgYXV0aG9yZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm94ZWxTaXRlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgcHJvdmlzaW9uYWw6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVnaW9uSW5mbyB7XG4gIGlkOiBzdHJpbmc7XG4gIGxhYmVsOiBzdHJpbmc7XG4gIHR5cGU6ICdwbGFpbicgfCAnZm9yZXN0JyB8ICdoaWxscycgfCAnaGlnaGxhbmQnIHwgJ3dhdGVyJyB8ICdyaWRnZSc7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHJ4OiBudW1iZXI7XG4gIHJ6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRTdGF0cyB7XG4gIGNodW5rc0dlbmVyYXRlZDogbnVtYmVyO1xuICBjaHVua3NFdmljdGVkOiBudW1iZXI7XG4gIHZveGVsc0ZpbGxlZDogbnVtYmVyO1xuICBnZW5lcmF0aW9uTXM6IG51bWJlcjtcbiAgZW50aXRpZXM6IG51bWJlcjtcbiAgdHJlZXM6IG51bWJlcjtcbiAgcGlua1RyZWVzOiBudW1iZXI7XG4gIHBpbmtPdmVyZmxvdzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkIHtcbiAgc2VlZDogbnVtYmVyO1xuICBwYXJhbXM6IFdvcmxkUGFyYW1zO1xuICBjaHVua3M6IE1hcDxzdHJpbmcsIFZveGVsQ2h1bms+O1xuICBlbnRpdGllczogTWFwPHN0cmluZywgRW50aXR5PjtcbiAgZW50aXR5Q2h1bmtzOiBNYXA8c3RyaW5nLCBzdHJpbmdbXT47XG4gIC8qKiBDaHVua3Mgd2hvc2UgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWVudGl0eSBzdGF0ZSBoYXMgYmVlbiBjaGFuZ2VkLiAqL1xuICBlbnRpdHlDaGFuZ2VzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIFRvbWJzdG9uZXMgZm9yIHJlbW92ZWQgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsIGVudGl0aWVzLiAqL1xuICBlbnRpdHlSZW1vdmFsczogU2V0PHN0cmluZz47XG4gIC8qKiBBdXRob3JpdGF0aXZlIGJ1aWx0IHN0cnVjdHVyZXMgKGhvdXNlLCBwYXRoLCB0ZXJyYWNlcywgY3JvcHMpLiAqL1xuICBzdHJ1Y3R1cmVzOiBNYXA8c3RyaW5nLCBTdHJ1Y3R1cmU+O1xuICBzaXRlczogTm94ZWxTaXRlW107XG4gIHJlZ2lvbnM6IFJlZ2lvbkluZm9bXTtcbiAgLyoqIGNodW5rIGtleSAtPiBsb2NhbCB2b3hlbCBpbmRleCAtPiBtYXRlcmlhbC4gRHVyYWJsZSwgY29tcGFjdCBlZGl0cy4gKi9cbiAgZWRpdHM6IE1hcDxzdHJpbmcsIE1hcDxudW1iZXIsIG51bWJlcj4+O1xuICAvKiogR2xvYmFsIGxvY2FsLXBsYXllciBjYXJyaWVkIGJhZzsgYm91bmRlZCBpbiBzY2hlbWEgMywgbGVnYWN5IGluIDEvMi4gKi9cbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICAvKiogUHJlc2VudCBvbmx5IGFmdGVyIHNjaGVtYS0zIGdlbmVzaXMvcmVzdG9yYXRpb24uICovXG4gIGxpZmU/OiBMaWZlU3RhdGU7XG4gIC8qKiBNMDA2IGxpdmluZyBob21lc3RlYWQ7IHByZXNlbnQgb25jZSBmb3VuZGVkIChzY2hlbWEgMyBvbmx5KS4gKi9cbiAgaG9tZXN0ZWFkPzogSG9tZXN0ZWFkU3RhdGU7XG4gIGRpcnR5OiBTZXQ8c3RyaW5nPjtcbiAgc3RhdHM6IFdvcmxkU3RhdHM7XG4gIGF1dGhvcmVkUGxhY2VkOiBib29sZWFuO1xuICAvKipcbiAgICogTW9ub3RvbmljIHJldmlzaW9uIG9mIGF1dGhvcml0YXRpdmUgc3RhdGUgKHZveGVscyBhbmQgZW50aXRpZXMpLiBEZXJpdmVkXG4gICAqIGNhY2hlcyBrZXllZCBvbiB0aGlzIHZhbHVlIGFyZSBkaXNjYXJkZWQgYWZ0ZXIgYW4gZWRpdDsgbWVzaC9uYXZpZ2F0aW9uXG4gICAqIHJldmlzaW9ucyBhcmUgc2VwYXJhdGUgYmVjYXVzZSB0aGV5IGFyZSBkZXJpdmVkLCBub3Qgd29ybGQgc3RhdGUuXG4gICAqL1xuICByZXZpc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgY2h1bmtLZXkgPSAoY3g6IG51bWJlciwgY3o6IG51bWJlcikgPT4gYCR7Y3h9LCR7Y3p9YDtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblggPSAoY3g6IG51bWJlcikgPT4gY3ggKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblogPSAoY3o6IG51bWJlcikgPT4gY3ogKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBsb2NhbEluZGV4ID0gKGx4OiBudW1iZXIsIHlJbmRleDogbnVtYmVyLCBsejogbnVtYmVyKSA9PlxuICBseCArIGx6ICogQ0hVTktfU0laRSArIHlJbmRleCAqIENIVU5LX0FSRUE7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWCA9ICh4OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHggKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ogPSAoejogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh6ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxYID0gKHg6IG51bWJlcikgPT4geCAtICh3b3JsZFRvQ2h1bmtYKHgpICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFogPSAoejogbnVtYmVyKSA9PiB6IC0gKHdvcmxkVG9DaHVua1ooeikgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3QgeVRvSW5kZXggPSAoeTogbnVtYmVyKSA9PiB5IC0gWV9NSU47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXb3JsZChzZWVkID0gMTMzNywgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBpZiAoIWlzU3VwcG9ydGVkR2VuZXJhdG9yKGdlbmVyYXRvclZlcnNpb24pKSB0aHJvdyBuZXcgRXJyb3IoYHVuc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uICR7Z2VuZXJhdG9yVmVyc2lvbn1gKTtcbiAgcmV0dXJuIHtcbiAgICBzZWVkLFxuICAgIHBhcmFtczogeyAuLi5ERUZBVUxUX1BBUkFNUywgZ2VuZXJhdG9yVmVyc2lvbiB9LFxuICAgIGNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0aWVzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2hhbmdlczogbmV3IFNldCgpLFxuICAgIGVudGl0eVJlbW92YWxzOiBuZXcgU2V0KCksXG4gICAgc3RydWN0dXJlczogbmV3IE1hcCgpLFxuICAgIHNpdGVzOiBbXSxcbiAgICByZWdpb25zOiBSRUdJT05TLFxuICAgIGVkaXRzOiBuZXcgTWFwKCksXG4gICAgaW52ZW50b3J5OiB7fSxcbiAgICBkaXJ0eTogbmV3IFNldCgpLFxuICAgIHN0YXRzOiB7XG4gICAgICBjaHVua3NHZW5lcmF0ZWQ6IDAsIGNodW5rc0V2aWN0ZWQ6IDAsIHZveGVsc0ZpbGxlZDogMCwgZ2VuZXJhdGlvbk1zOiAwLFxuICAgICAgZW50aXRpZXM6IDAsIHRyZWVzOiAwLCBwaW5rVHJlZXM6IDAsIHBpbmtPdmVyZmxvdzogMCxcbiAgICB9LFxuICAgIGF1dGhvcmVkUGxhY2VkOiBmYWxzZSxcbiAgICByZXZpc2lvbjogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlV29ybGQoc2VlZCA9IDEzMzcsIGluaXRpYWxSYWRpdXMgPSAwLCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCwgZ2VuZXJhdG9yVmVyc2lvbik7XG4gIGNvbnN0IGNlbnRyZSA9IE1hdGguZmxvb3IoQ0hVTktTX1BFUl9TSURFIC8gMik7XG4gIGZvciAobGV0IGN6ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ogPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ggPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3grKykge1xuICAgICAgZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICB9XG4gIH1cbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuXG4vLyAtLS0tLS0tLS0tIGdlb2dyYXBoeSAtLS0tLS0tLS0tXG5leHBvcnQgY29uc3QgUkVHSU9OUzogUmVnaW9uSW5mb1tdID0gW1xuICB7IGlkOiAnZm91bmRlcicsIGxhYmVsOiAnRm91bmRlciB2YWxsZXknLCB0eXBlOiAncGxhaW4nLCBjeDogMCwgY3o6IDAsIHJ4OiAxMTAsIHJ6OiA4NSB9LFxuICB7IGlkOiAnZWFzdHdvb2QnLCBsYWJlbDogJ0Vhc3R3b29kJywgdHlwZTogJ2ZvcmVzdCcsIGN4OiAyMjAsIGN6OiAtMTEwLCByeDogMjYwLCByejogMjIwIH0sXG4gIHsgaWQ6ICdjcm93bicsIGxhYmVsOiAnQ3Jvd24gaGlnaGxhbmRzJywgdHlwZTogJ2hpZ2hsYW5kJywgY3g6IC0zNjAsIGN6OiAtMzAwLCByeDogMzgwLCByejogMzAwIH0sXG4gIHsgaWQ6ICdsYWtlJywgbGFiZWw6ICdNaXJyb3IgbGFrZScsIHR5cGU6ICd3YXRlcicsIGN4OiAtMjYwLCBjejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH0sXG4gIHsgaWQ6ICdzb3V0aGRvd25zJywgbGFiZWw6ICdTb3V0aCBkb3ducycsIHR5cGU6ICdoaWxscycsIGN4OiAxMjAsIGN6OiAzMzAsIHJ4OiAyNjAsIHJ6OiAxOTAgfSxcbiAgeyBpZDogJ3dlc3RyaXNlJywgbGFiZWw6ICdXZXN0IHJpc2UnLCB0eXBlOiAnaGlsbHMnLCBjeDogLTM2MCwgY3o6IDEyMCwgcng6IDIyMCwgcno6IDIxMCB9LFxuICB7IGlkOiAnY29hc3QnLCBsYWJlbDogJ0Jyb2tlbiBjb2FzdCcsIHR5cGU6ICdyaWRnZScsIGN4OiAwLCBjejogMCwgcng6IDc4MCwgcno6IDY2MCB9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyQ2VudGVyWCh6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUaGUgcml2ZXIgcnVucyBub3J0aFx1MjAxM3NvdXRoIGFib3V0IDcwXHUyMDEzMTEwIG0gd2VzdCBvZiB0aGUgZm91bmRlciBzaGVsZiwgc29cbiAgLy8gdGhlIGRlZmF1bHQgbm9ydGgtd2VzdCB2aWV3IGhhcyB3YXRlciwgYSBuZWFyIGJhbmsgYW5kIGEgZmFyIGJhbmsuXG4gIHJldHVybiAtOTAgKyA1NSAqIE1hdGguc2luKCh6ICsgMTAwKSAvIDI0MCkgKyAxOCAqIE1hdGguc2luKCh6IC0gMjApIC8gODApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLmFicyh4IC0gcml2ZXJDZW50ZXJYKHopKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxha2VEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLnNxcnQoKCh4ICsgMjYwKSAvIDEyMCkgKiogMiArICgoeiArIDIzMCkgLyA5NSkgKiogMik7XG59XG5cbi8qKlxuICogSW50ZWdlciB0b3Agc29saWQgeSBvZiB0aGUgYmFzZSBnZW5lcmF0ZWQgc3VyZmFjZSAobm8gZWRpdHMvb3ZlcmhhbmdzKS5cbiAqXG4gKiBUaGlzIGlzIHRoZSAqc2hhcGUqIHRoZSB2b3hlbCB2b2x1bWUgaXMgZmlsbGVkIGZyb20sIG5vdCB0aGUgc3RvcmVkIHdvcmxkLlxuICogVGhlIGltcG9ydGFudCBjb3JyZWN0aW9uIG92ZXIgdGhlIGZpcnN0IE0wMDEgcGFzcyBpcyB0aGF0IHRoZSBsYW5kc2NhcGUgaXNcbiAqIG5vdCBvbmUgc21vb3RoIHJhZGlhbCBib3dsOiBpdCBpcyBhIHdhcnBlZCBtdWx0aS1zY2FsZSBzdXJmYWNlIHdpdGggYSBicm9hZFxuICogcml2ZXIgdmFsbGV5LCBhIHNtYWxsIGJ1aWxkYWJsZSBzaGVsZiwgYW5kIHJpZGdlZCBoaWdobGFuZHMuIEEgc2hhbGxvd1xuICogc21vb3RoIHN1cmZhY2UgcXVhbnRpc2VkIHRvIDEgbSB2b3hlbHMgaXMgd2hhdCBwcm9kdWNlZCB0aGUgY29uY2VudHJpY1xuICogY29udG91ciByaW5nczsgdmFyaWVkIHJlbGllZiBhbmQgYSByaXZlciB2YWxsZXkgYnJlYWsgdGhlbSBuYXR1cmFsbHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlSGVpZ2h0QXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFR3by1zY2FsZSBkb21haW4gd2FycC4gVGhlIGJyb2FkIHdhcnAgbW92ZXMgY29hc3RsaW5lcyBhbmQgaGlsbHM7IHRoZVxuICAvLyBzbWFsbCB3YXJwIGtlZXBzIHRoZSAxIG0gcXVhbnRpc2F0aW9uIGZyb20gZm9sbG93aW5nIGNsZWFuIGNvbnRvdXJzLlxuICBjb25zdCB3eCA9IHhcbiAgICArIChmYm0yKHggLyA0MjAsIHogLyA0MjAsIHNlZWQgKyAxMDEsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1LCB6IC8gOTUsIHNlZWQgKyAxMDIsIDIpIC0gMC41KSAqIDMwO1xuICBjb25zdCB3eiA9IHpcbiAgICArIChmYm0yKHggLyA0MjAgKyA3LjMsIHogLyA0MjAgLSAzLjEsIHNlZWQgKyAxMDMsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1ICsgMy43LCB6IC8gOTUgLSA4LjEsIHNlZWQgKyAxMDQsIDIpIC0gMC41KSAqIDMwO1xuXG4gIGNvbnN0IHJhZGlhbCA9IE1hdGguc3FydCgod3ggLyA3ODApICoqIDIgKyAod3ogLyA2NjApICoqIDIpO1xuICBjb25zdCBjb2FzdE5vaXNlID0gKGZibTIod3ggLyAzMDAsIHd6IC8gMzAwLCBzZWVkICsgMTA1LCA0KSAtIDAuNSkgKiAwLjM0XG4gICAgKyAoZmJtMih3eCAvIDk1LCB3eiAvIDk1LCBzZWVkICsgMTA2LCAyKSAtIDAuNSkgKiAwLjEwO1xuICBjb25zdCBsYW5kbmVzcyA9IDEuMCAtIHJhZGlhbCArIGNvYXN0Tm9pc2U7XG4gIGNvbnN0IGlubGFuZCA9IHNtb290aHN0ZXAoLTAuMDMsIDAuMTIsIGxhbmRuZXNzKTtcblxuICBjb25zdCBvY2VhbkZsb29yID0gLTEzICsgNiAqIGZibTIod3ggLyAxNzAsIHd6IC8gMTcwLCBzZWVkICsgMTA3LCAzKTtcblxuICAvLyBSb2xsaW5nIGxhbmQgYXQgdGhyZWUgc2NhbGVzLiBUaGUgNDAgbSBhbmQgMTUgbSBjb21wb25lbnRzIGFyZSByZWFsXG4gIC8vIHN1cmZhY2UgaGVpZ2h0LCBub3QgYSByZW5kZXIgZGVjb3JhdGlvbiwgc28gdGhlIG1hY3JvIHNhbXBsZXIgYWdyZWVzLlxuICBjb25zdCBzd2VsbCA9IDQgKyAxMSAqIGZibTIod3ggLyAzNDAsIHd6IC8gMzQwLCBzZWVkICsgMTA4LCA0KTtcbiAgY29uc3QgaGlsbHMgPSA4ICogZmJtMih3eCAvIDExNSwgd3ogLyAxMTUsIHNlZWQgKyAxMDksIDMpO1xuICBjb25zdCBidW1wcyA9IDIuMiAqIGZibTIoeCAvIDQyLCB6IC8gNDIsIHNlZWQgKyAxMTAsIDIpXG4gICAgKyAwLjkgKiBmYm0yKHggLyAxNSwgeiAvIDE1LCBzZWVkICsgMTExLCAyKTtcblxuICAvLyBSaWRnZWQgaGlnaGxhbmRzLiBUaGUgbWFzc2lmIG1hc2sgaXMgcmVnaW9uYWwgYW5kIGJpYXNlZCB0byB0aGVcbiAgLy8gbm9ydGgtd2VzdDsgd2l0aG91dCB0aGUgcmVnaW9uYWwgZ2F0ZSB0aGUgZmlyc3QgTTAwMSBwYXNzIHJhaXNlZCBhIDQ4IG1cbiAgLy8gbW91bnRhaW4gZGlyZWN0bHkgdW5kZXIgdGhlIGZvdW5kZXIgc2hlbGYuXG4gIGNvbnN0IG1hc3NpZk5vaXNlID0gZmJtMih3eCAvIDQ4MCArIDExLCB3eiAvIDQ4MCAtIDcsIHNlZWQgKyAxMTIsIDQpO1xuICBjb25zdCBtYXNzaWZNYXNrID0gc21vb3Roc3RlcCgwLjYwLCAwLjc4LCBtYXNzaWZOb2lzZSk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMjMwLCB3eiAvIDIzMCwgc2VlZCArIDExMywgNCkgLSAxKTtcbiAgY29uc3QgcmlkZ2UyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTQsIDMpIC0gMSk7XG4gIGNvbnN0IG53QmlhcyA9IE1hdGguZXhwKC0oKCh3eCArIDM2MCkgLyAzODApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDMyMCkgKiogMikpO1xuICBjb25zdCBtb3VudCA9IE1hdGgubWluKDEsIG1hc3NpZk1hc2sgKiAoMC4zMCArIDAuNzAgKiBud0JpYXMpICsgMC4yMiAqIG53Qmlhcyk7XG5cbiAgbGV0IGggPSBzd2VsbCArIGhpbGxzICsgYnVtcHNcbiAgICArIG1vdW50ICogKDIwICsgNDAgKiByaWRnZSAqIHJpZGdlICsgMTIgKiByaWRnZTIpO1xuXG4gIC8vIFNwdXJzIGFuZCBndWxsaWVzIGF0IDMwXHUyMDEzOTAgbS4gV2l0aG91dCB0aGVzZSwgYSBzbW9vdGggaGlsbCBxdWFudGlzZWQgdG9cbiAgLy8gMSBtIHZveGVscyByZWFkcyBhcyBjb25jZW50cmljIGNvbnRvdXIgcmluZ3M7IHdpdGggdGhlbSwgdGhlIHNhbWUgaGlsbFxuICAvLyBicmVha3MgaW50byByaWRnZXMsIHNpZGUgdmFsbGV5cyBhbmQgcm9jayBmYWNlcy5cbiAgY29uc3Qgc3B1ciA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDg1LCB3eiAvIDg1LCBzZWVkICsgMTIwLCAzKSAtIDEpO1xuICBjb25zdCBndWxseSA9IE1hdGgucG93KDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDUyICsgMTMsIHd6IC8gNTIgLSA1LCBzZWVkICsgMTIxLCAzKSAtIDEpLCAyKTtcbiAgaCArPSAoc3B1ciAtIDAuNTUpICogNS4wIC0gZ3VsbHkgKiAzLjI7XG5cbiAgaCA9IG9jZWFuRmxvb3IgKyAoaCAtIG9jZWFuRmxvb3IpICogaW5sYW5kO1xuICBoICs9IDEuNiAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG5cbiAgLy8gQnJvYWQgcml2ZXIgdmFsbGV5LCB0aGVuIHRoZSBjaGFubmVsIGl0c2VsZi4gVGhlIHZhbGxleSBtYXNrIGlzIGdhdGVkIGJ5XG4gIC8vIGxhbmRuZXNzOiB3aXRob3V0IHRoZSBnYXRlIGl0IHB1bGxlZCB0aGUgb2NlYW4gZmxvb3IgdXAgdG8gdGhlIHZhbGxleVxuICAvLyBmbG9vciBvdXRzaWRlIHRoZSBpc2xhbmQsIHdoaWNoIHRoZSBtYXAgdmlldyBzaG93ZWQgYXMgcGFsZSByaXZlci1zaGFwZWRcbiAgLy8gYmFycyBydW5uaW5nIHRvIHRoZSBob3Jpem9uLlxuICBjb25zdCByZCA9IHJpdmVyRGlzdGFuY2Uod3gsIHd6KTtcbiAgY29uc3QgdmFsbGV5ID0gc21vb3Roc3RlcCg5NSwgMTAsIHJkKSAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG4gIGNvbnN0IHZhbGxleUZsb29yID0gMi41ICsgMS4wICogZmJtMih3eCAvIDYwLCB3eiAvIDYwLCBzZWVkICsgMTE1LCAyKTtcbiAgaCA9IGxlcnAoaCwgdmFsbGV5Rmxvb3IsIHZhbGxleSAqIDAuNzUpO1xuICBjb25zdCByaXZlclcgPSA1LjAgKyAzLjAgKiBmYm0yKHd4IC8gNDUsIHd6IC8gNDUsIHNlZWQgKyAxMTYsIDIpO1xuICAvLyBBIHdpZGUsIHNoYWxsb3cgY2hhbm5lbCBwcm9maWxlLiBUaGUgZmlyc3QgcGFzcyBjYXJ2ZWQgYSAxMiBtIHNsb3Qgd2l0aFxuICAvLyBuZWFyLXZlcnRpY2FsIGJhbmtzLCB3aGljaCByZWFkIGFzIGEgYnJpZ2h0IHN0b25lIHF1YXJyeSByYXRoZXIgdGhhbiBhXG4gIC8vIHJpdmVyLiBUaGUgb3V0ZXIgZWRnZSBpcyBub3cgfjI1IG0gZnJvbSB0aGUgY2VudHJlbGluZSwgYW5kIHRoZSBiZWQgaXNcbiAgLy8gb25seSAyIG0gYmVsb3cgc2VhIGxldmVsLlxuICBjb25zdCBjaGFubmVsID0gc21vb3Roc3RlcChyaXZlclcgKyAxOCwgcml2ZXJXICogMC40LCByZCk7XG4gIGlmIChsYW5kbmVzcyA+IDAuMCkgaCA9IGxlcnAoaCwgLTIuMCwgY2hhbm5lbCAqIDAuOTUpO1xuXG4gIC8vIExha2UgYmFzaW4gYXQgdGhlIGZvb3Qgb2YgdGhlIG5vcnRoLXdlc3QgaGlnaGxhbmRzLlxuICBjb25zdCBsYWtlRCA9IGxha2VEaXN0YW5jZSh3eCwgd3opXG4gICAgKiAoMSArIDAuMTggKiAoZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE3LCAyKSAtIDAuNSkgKiAyKTtcbiAgaWYgKGxha2VEIDwgMS4xNSkge1xuICAgIGNvbnN0IGxha2VNYXNrID0gc21vb3Roc3RlcCgxLjE1LCAwLjU1LCBsYWtlRCk7XG4gICAgaCA9IGxlcnAoaCwgLTYuNSwgbGFrZU1hc2sgKiAwLjk1KTtcbiAgfVxuXG4gIC8vIEZvdW5kZXIgc2hlbGY6IGEgc21hbGwsIGlycmVndWxhciBidWlsZGFibGUgdGVycmFjZSBvbiB0aGUgZWFzdCBiYW5rLlxuICAvLyBEZWxpYmVyYXRlbHkgbm90IGEgMjYwIG0gcmFkaWFsIGZsYXR0ZW47IHRoZSBwcmV2aW91cyBwYXNzIHNob3dlZCB0aGF0IGFcbiAgLy8gbGFyZ2UgZmxhdHRlbi10by1jb25zdGFudCBiZWNvbWVzIGEgdmlzaWJsZSBib3dsIG9mIGNvbnRvdXIgcmluZ3MuXG4gIGNvbnN0IHNoZWxmRCA9IE1hdGguc3FydCgoKHggKyA4KSAvIDYyKSAqKiAyICsgKCh6IC0gNCkgLyA0OCkgKiogMilcbiAgICArIChmYm0yKHggLyA0NSwgeiAvIDQ1LCBzZWVkICsgMTE4LCAyKSAtIDAuNSkgKiAwLjU1O1xuICBjb25zdCBzaGVsZiA9IHNtb290aHN0ZXAoMS4wNSwgMC41NSwgc2hlbGZEKTtcbiAgaWYgKHNoZWxmID4gMCkge1xuICAgIGNvbnN0IHRhcmdldCA9IDEzLjAgKyAxLjIgKiBmYm0yKHggLyAzNiwgeiAvIDM2LCBzZWVkICsgMTE5LCAyKSArIHggKiAwLjAxO1xuICAgIGggPSBsZXJwKGgsIHRhcmdldCwgc2hlbGYgKiAwLjc4KTtcbiAgfVxuXG4gIHJldHVybiBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgOTIpKTtcbn1cblxuZnVuY3Rpb24gc2xvcGVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAxKSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMSkpLFxuICApO1xufVxuXG5mdW5jdGlvbiB0b3BNYXRlcmlhbEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbik6IE1hdElkIHtcbiAgLy8gUml2ZXIgYmVkIGlzIGdyYXZlbDsgdGhlIGJlYWNoIGlzIGEgbmFycm93IHNhbmQgYmFuZCwgbm90IHRoZSB3aG9sZVxuICAvLyB2YWxsZXkgZmxvb3IuIFRoZSBmaXJzdCBwYXNzIG1hcmtlZCBldmVyeSBjZWxsIHdpdGhpbiA0IG0gb2Ygc2VhIGxldmVsXG4gIC8vIGFzIHNhbmQsIHdoaWNoIHByb2R1Y2VkIGEgY29uc3BpY3VvdXMgcGFsZSBzdHJpcCBhbG9uZyB0aGUgcml2ZXIuXG4gIGlmIChyaXZlckRpc3RhbmNlKHgsIHopIDwgMTIgJiYgaCA8IFNFQV9MRVZFTCArIDEpIHJldHVybiBNQVQuR1JBVkVMO1xuICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAwLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKG5lYXJXYXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbmVhcldhdGVyID1cbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAzKSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMykgPCBTRUFfTEVWRUwgKyAxO1xuICB9XG4gIGlmIChuZWFyV2F0ZXIgJiYgaCA8PSBTRUFfTEVWRUwgKyAxLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHNsb3BlID49IDMpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNTggJiYgZmJtMih4IC8gMTgsIHogLyAxOCwgc2VlZCArIDEyMCwgMikgPiAwLjQ1KSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQ4ICYmIHNsb3BlID49IDIpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDAgJiYgc2xvcGUgPj0gMiAmJiBmYm0yKHggLyAxMiwgeiAvIDEyLCBzZWVkICsgMTIxLCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU1RPTkU7XG4gIHJldHVybiBNQVQuR1JBU1M7XG5cbn1cblxuLyoqIFB1YmxpYyBiYXNlLW1hdGVyaWFsIHNlbGVjdG9yIGZvciBtYWNybyBMT0QgYW5kIHRlc3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbChcbiAgc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI6IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5mdW5jdGlvbiBzdWJzb2lsRm9yKHRvcDogTWF0SWQpOiBNYXRJZCB7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFTUyB8fCB0b3AgPT09IE1BVC5NT1NTKSByZXR1cm4gTUFULlNPSUw7XG4gIGlmICh0b3AgPT09IE1BVC5TTk9XKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAodG9wID09PSBNQVQuR1JBVkVMKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgcmV0dXJuIE1BVC5TVE9ORTtcbn1cblxuZnVuY3Rpb24gb3JlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsdXN0ZXIgPSBmYm0yKHggLyA1NSwgeiAvIDU1LCBzZWVkICsgMTMwLCAyKTtcbiAgaWYgKGNsdXN0ZXIgPCAwLjU3KSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IG4gPSB2YWx1ZU5vaXNlMyh4ICogMC4wOSwgeSAqIDAuMTMsIHogKiAwLjA5LCBzZWVkICsgMTMxKTtcbiAgY29uc3QgbjIgPSB2YWx1ZU5vaXNlMyh4ICogMC4yMiArIDUsIHkgKiAwLjMxLCB6ICogMC4yMiAtIDMsIHNlZWQgKyAxMzIpO1xuICByZXR1cm4gbiA+IDAuNzAgJiYgbjIgPiAwLjUwO1xufVxuXG5mdW5jdGlvbiBjYXZlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBmYm0zKHggKiAwLjA3NSwgeSAqIDAuMTEsIHogKiAwLjA3NSwgc2VlZCArIDE0MCwgMikgPiAwLjcyO1xufVxuXG5mdW5jdGlvbiBvdmVyaGFuZ0F0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gdmFsdWVOb2lzZTMoeCAqIDAuMTgsIHkgKiAwLjIyLCB6ICogMC4xOCwgc2VlZCArIDE0MSkgPiAwLjYyO1xufVxuXG4vLyAtLS0tLS0tLS0tIHZlcnNpb25lZCBnZW5lcmF0b3IgZGlzcGF0Y2ggLS0tLS0tLS0tLVxuY29uc3QgdjJDYWNoZSA9IG5ldyBNYXA8bnVtYmVyLCBUZXJyYWluVjI+KCk7XG5jb25zdCBoeWRyb0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIEh5ZHJvbG9neT4oKTtcblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2d5IG5ldHdvcmsgZm9yIGEgc2VlZCBhbmQgZ2VuZXJhdG9yIHZlcnNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gaHlkcm9sb2d5Rm9yKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyKTogSHlkcm9sb2d5IHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmh5ZHJvbG9neTtcbiAgY29uc3Qga2V5ID0gYCR7c2VlZH06JHt2ZXJzaW9ufWA7XG4gIGxldCBoeWRybyA9IGh5ZHJvQ2FjaGUuZ2V0KGtleSk7XG4gIGlmICghaHlkcm8pIHtcbiAgICBoeWRybyA9IG5ldyBIeWRyb2xvZ3koeyBzZWVkLCB2ZXJzaW9uLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBoeWRyb0NhY2hlLnNldChrZXksIGh5ZHJvKTtcbiAgfVxuICByZXR1cm4gaHlkcm87XG59XG5cbi8qKiBAaW50ZXJuYWwgVGhlIHYyIGdlbmVyYXRvciBmb3IgYSBzZWVkIChjYWNoZWQ7IHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRlcnJhaW5WMihzZWVkOiBudW1iZXIpOiBUZXJyYWluVjIge1xuICBsZXQgZ2VuID0gdjJDYWNoZS5nZXQoc2VlZCk7XG4gIGlmICghZ2VuKSB7XG4gICAgY29uc3QgaHlkcm9sb2d5ID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb246IEdFTkVSQVRPUl9WMiwgdjFIZWlnaHQ6ICh4LCB6KSA9PiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeikgfSk7XG4gICAgZ2VuID0gbmV3IFRlcnJhaW5WMihzZWVkLCBzdXJmYWNlSGVpZ2h0QXQsIGh5ZHJvbG9neSk7XG4gICAgdjJDYWNoZS5zZXQoc2VlZCwgZ2VuKTtcbiAgfVxuICByZXR1cm4gZ2VuO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgaGVpZ2h0ICh0b3Agc29saWQgKyAxKSBmb3IgYW55IHN1cHBvcnRlZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlSGVpZ2h0QXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpLmhlaWdodCh4LCB6KSA6IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbn1cblxuLyoqIEJhc2UgZ2VuZXJhdGVkIHdhdGVyIHN1cmZhY2U6IHdhdGVyIGZpbGxzIGNlbGxzIFtoZWlnaHQsIGxldmVsKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlV2F0ZXJMZXZlbEF0KHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikgcmV0dXJuIHRlcnJhaW5WMihzZWVkKS5jb2x1bW4oeCwgeikubGV2ZWw7XG4gIGNvbnN0IGggPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIDogaDtcbn1cblxuZnVuY3Rpb24gdmVyc2lvbmVkU2xvcGUoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4IC0gMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCArIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogLSAxKSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6ICsgMSkpLFxuICApO1xufVxuXG4vKiogQmFzZSB0b3AgbWF0ZXJpYWwgZm9yIGFueSBnZW5lcmF0b3IgdmVyc2lvbiAobWFjcm8gTE9ELCBlbnRpdHkgcGxhY2VtZW50KS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWxGb3IoXG4gIHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuLFxuKTogTWF0SWQge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHtcbiAgICBjb25zdCBnZW4gPSB0ZXJyYWluVjIoc2VlZCk7XG4gICAgcmV0dXJuIGdlbi50b3BNYXRlcmlhbCh4LCB6LCBnZW4uY29sdW1uKHgsIHopLCBzbG9wZSxcbiAgICAgIChoaCwgc3MpID0+IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaGgsIHNzLCBuZWFyV2F0ZXIpKTtcbiAgfVxuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeTogbnVtYmVyO1xuICB0b3A6IE1hdElkO1xuICBzbG9wZTogbnVtYmVyO1xufVxuXG4vKiogQmFzZSBzdXJmYWNlIHNhbXBsZSBmb3IgbWFjcm8gTE9ELiBEb2VzIG5vdCBpbmNsdWRlIHZveGVsIGVkaXRzL292ZXJoYW5ncy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVTdXJmYWNlKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBTdXJmYWNlU2FtcGxlIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgY29uc3Qgc2xvcGUgPSBzbG9wZUF0KHNlZWQsIHgsIHosIHkpO1xuICByZXR1cm4geyB5LCB0b3A6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgeSwgc2xvcGUpLCBzbG9wZSB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNodW5rIGdlbmVyYXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgcmV0dXJuIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChjaHVua0tleShjeCwgY3opKTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IGJhc2UgPSBnZW5lcmF0ZUJhc2VDaHVuayh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgY3gsIGN6KTtcbiAgcmV0dXJuIGluc3RhbGxCYXNlQ2h1bmsod29ybGQsIGJhc2UsIHBlcmZvcm1hbmNlLm5vdygpIC0gdDApO1xufVxuXG4vKipcbiAqIEJhc2UgZ2VuZXJhdGVkIGNvbnRlbnRzIG9mIGEgY2h1bmsgYmVmb3JlIGR1cmFibGUgZWRpdHMuIEEgcHVyZSBmdW5jdGlvbiBvZlxuICogKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uLCBjeCwgY3opOiBzYWZlIHRvIGNvbXB1dGUgaW4gYSBXZWIgV29ya2VyLCBhbmQgdGhlXG4gKiBieXRlcyBhcmUgaWRlbnRpY2FsIHdoZXJldmVyIGl0IHJ1bnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQmFzZUNodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgc2VlZDogbnVtYmVyO1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUJhc2VDaHVuayhzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IEJhc2VDaHVuayB7XG4gIGNvbnN0IGRhdGEgPSBuZXcgVWludDhBcnJheShDSFVOS19WT0xVTUUpO1xuICBjb25zdCBoZWlnaHRzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IHRvcE1hdGVyaWFscyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgY29uc3QgdjIgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMiA/IHRlcnJhaW5WMihzZWVkKSA6IG51bGw7XG5cbiAgLy8gUGFkZGVkIGhlaWdodCBjYWNoZTogYSB0aHJlZS1jZWxsIGJvcmRlciBjb3ZlcnMgc2xvcGUsIGJlYWNoIGFuZCBsZWRnZXMuXG4gIGNvbnN0IFAgPSAzO1xuICBjb25zdCBQVyA9IENIVU5LX1NJWkUgKyBQICogMjtcbiAgY29uc3QgYmFzZUggPSBuZXcgSW50MTZBcnJheShQVyAqIFBXKTtcbiAgY29uc3QgdjJDb2xzOiBWMkNvbHVtbltdIHwgbnVsbCA9IHYyID8gbmV3IEFycmF5KENIVU5LX0FSRUEpIDogbnVsbDtcbiAgZm9yIChsZXQgcHogPSAwOyBweiA8IFBXOyBweisrKSB7XG4gICAgZm9yIChsZXQgcHggPSAwOyBweCA8IFBXOyBweCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgcHggLSBQLCB3eiA9IG96ICsgcHogLSBQO1xuICAgICAgaWYgKHYyKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHYyLmNvbHVtbih3eCwgd3opO1xuICAgICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gY29sLmg7XG4gICAgICAgIGNvbnN0IGx4ID0gcHggLSBQLCBseiA9IHB6IC0gUDtcbiAgICAgICAgaWYgKGx4ID49IDAgJiYgbHogPj0gMCAmJiBseCA8IENIVU5LX1NJWkUgJiYgbHogPCBDSFVOS19TSVpFKSB2MkNvbHMhW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNvbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgd3gsIHd6KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBsZXQgbm9uQWlyID0gMDtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgY29uc3QgbmVhcldhdGVyID1cbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQIC0gMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCArIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxO1xuICAgICAgY29uc3QgdjJDb2wgPSB2MkNvbHMgPyB2MkNvbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIDogbnVsbDtcbiAgICAgIGNvbnN0IHRvcCA9IHYyICYmIHYyQ29sXG4gICAgICAgID8gdjIudG9wTWF0ZXJpYWwod3gsIHd6LCB2MkNvbCwgc2xvcGUsIChoaCwgc3MpID0+IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoaCwgc3MsIG5lYXJXYXRlcikpXG4gICAgICAgIDogdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xuICAgICAgY29uc3Qgc3ViID0gc3Vic29pbEZvcih0b3ApO1xuICAgICAgY29uc3Qgb3JlUG90ZW50aWFsID0gZmJtMih3eCAvIDU1LCB3eiAvIDU1LCBzZWVkICsgMTMwLCAyKSA+IDAuNTc7XG4gICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcblxuICAgICAgY29uc3Qgc3RhcnQgPSBZX01JTjtcbiAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgaCAtIDEpO1xuICAgICAgZm9yIChsZXQgeSA9IHN0YXJ0OyB5IDw9IGVuZDsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGRlcHRoID0gaCAtIDEgLSB5O1xuICAgICAgICBsZXQgbTogTWF0SWQ7XG4gICAgICAgIGlmICh5ID09PSBZX01JTikgbSA9IE1BVC5CRURST0NLO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA9PT0gMCkgbSA9IHRvcDtcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPD0gMikgbSA9IHN1YjtcbiAgICAgICAgZWxzZSBtID0gTUFULlNUT05FO1xuXG4gICAgICAgIGlmIChtID09PSBNQVQuU1RPTkUgJiYgZGVwdGggPiA0ICYmIG9yZVBvdGVudGlhbCAmJiBvcmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5PUkU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTcGFyc2UgM0Qgb3ZlcmhhbmdzL3VuZGVyY3V0cyBhdCBzdGVlcCBmYWNlcy4gVGhpcyBpcyBhIHJlYWxcbiAgICAgICAgLy8gb2NjdXBhbmN5IGNoYW5nZSwgbm90IGEgZGVjb3JhdGlvbiBvbiB0b3Agb2YgYSBoZWlnaHRmaWVsZC5cbiAgICAgICAgaWYgKGRlcHRoIDw9IDIgJiYgc2xvcGUgPj0gMiAmJiBvdmVyaGFuZ0F0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWVwIGNhdmVzLCBrZXB0IGF3YXkgZnJvbSB0aGUgc3VyZmFjZSBzbyB0aGV5IGRvIG5vdCBjcmVhdGUgaG9sZXMuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSICYmIGRlcHRoID4gNyAmJiBkZXB0aCA8IDI0ICYmIGNhdmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0gPSBtO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFdhdGVyIHZvbHVtZTogZXZlcnl0aGluZyBhYm92ZSB0aGUgc29saWQgc3VyZmFjZSB1cCB0byB0aGUgY29sdW1uJ3NcbiAgICAgIC8vIHdhdGVyIGxldmVsIChzZWEgbGV2ZWwgaW4gdjE7IHRoZSBoeWRyb2xvZ2ljYWwgbGV2ZWwgaW4gdjIpLlxuICAgICAgY29uc3Qgd2F0ZXJMZXZlbCA9IHYyQ29sID8gTWF0aC5taW4oWV9NQVgsIHYyQ29sLmxldmVsKSA6IFNFQV9MRVZFTDtcbiAgICAgIGlmIChoIDwgd2F0ZXJMZXZlbCkge1xuICAgICAgICBmb3IgKGxldCB5ID0gTWF0aC5tYXgoWV9NSU4sIGgpOyB5IDwgd2F0ZXJMZXZlbDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KTtcbiAgICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuV0FURVI7XG4gICAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9wU29saWQgPSBNYXRoLm1pbihZX01BWCAtIDEsIE1hdGgubWF4KFlfTUlOLCBoIC0gMSkpO1xuICAgICAgaGVpZ2h0c1tjb2xdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbY29sXSA9IHRvcDtcbiAgICB9XG4gIH1cblxuICAvLyBQcm90cnVkaW5nIGxlZGdlczogb25lIG9yIHR3byBzdG9uZSBibG9ja3MgZXh0ZW5kIGZyb20gYSBoaWdoIGNvbHVtbiBvdmVyXG4gIC8vIGEgbG93ZXIgbmVpZ2hib3VyLiBUaGV5IGNyZWF0ZSByZWFkYWJsZSBvdmVyaGFuZ3Mgd2l0aG91dCBhIGZ1bGwgY2F2ZSBwYXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgaWYgKHNsb3BlIDwgMikgY29udGludWU7XG4gICAgICBjb25zdCBkaXJzOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiA9IFtbLTEsIDBdLCBbMSwgMF0sIFswLCAtMV0sIFswLCAxXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIGRpcnMpIHtcbiAgICAgICAgY29uc3QgbnggPSBseCArIGR4LCBueiA9IGx6ICsgZHo7XG4gICAgICAgIGlmIChueCA8IDAgfHwgbnogPCAwIHx8IG54ID49IENIVU5LX1NJWkUgfHwgbnogPj0gQ0hVTktfU0laRSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IG5oID0gYmFzZUhbKG56ICsgUCkgKiBQVyArIChueCArIFApXTtcbiAgICAgICAgaWYgKGggLSBuaCA8IDIpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoaGFzaDNpKGx4LCBseiwgZHggKiAzICsgZHogKiA3LCBzZWVkICsgMTUwKSA8IDAuNTUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB5ID0gaCAtIDI7XG4gICAgICAgIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBoKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChueCwgeVRvSW5kZXgoeSksIG56KTtcbiAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5TVE9ORTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJlY29tcHV0ZSB0aGUgY29sdW1uIGNhY2hlIGFmdGVyIGxlZGdlcy9jYXZlcy4gVGhlIGV4cG9zZWQgdG9wIG1hdGVyaWFsXG4gIC8vIG11c3QgY29tZSBmcm9tIHRoZSBhY3R1YWwgdG9wIHNvbGlkIHZveGVsLCBub3QgdGhlIHByZS1jYXJ2ZSBndWVzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICBsZXQgdG9wTWF0OiBudW1iZXIgPSB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICAgICAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgICAgIGNvbnN0IG0gPSBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildO1xuICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICB9XG4gICAgICBoZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRvcE1hdDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBjeCwgY3osIHNlZWQsIHZlcnNpb24sIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyIH07XG59XG5cbi8qKlxuICogSW5zdGFsbCBiYXNlIGNvbnRlbnRzIGFzIGEgcmVzaWRlbnQgY2h1bms6IGFwcGx5IGR1cmFibGUgZWRpdHMsIHVwZGF0ZVxuICogc3RhdHMsIGFuZCBydW4gZGV0ZXJtaW5pc3RpYyBlbnRpdHkgZ2VuZXJhdGlvbi4gTWFpbi10aHJlYWQgb25seTsgdGhpcyBpc1xuICogdGhlIHNpbmdsZSB3cml0ZXIgb2YgV29ybGQuIFJldHVybnMgdGhlIGFscmVhZHktcmVzaWRlbnQgY2h1bmsgaWYgb25lIGV4aXN0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbGxCYXNlQ2h1bmsod29ybGQ6IFdvcmxkLCBiYXNlOiBCYXNlQ2h1bmssIGdlbmVyYXRpb25NcyA9IDApOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChiYXNlLnNlZWQgIT09IHdvcmxkLnNlZWQgfHwgYmFzZS52ZXJzaW9uICE9PSB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbikge1xuICAgIHRocm93IG5ldyBFcnJvcignYmFzZSBjaHVuayBiZWxvbmdzIHRvIGEgZGlmZmVyZW50IHdvcmxkIGNvbmZpZ3VyYXRpb24nKTtcbiAgfVxuICBjb25zdCB7IGN4LCBjeiwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIgfSA9IGJhc2U7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIGNvbnN0IGNodW5rOiBWb3hlbENodW5rID0ge1xuICAgIGN4LCBjeiwga2V5LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpcixcbiAgICBkaXJ0eTogdHJ1ZSxcbiAgICBnZW5lcmF0ZWRBdDogcGVyZm9ybWFuY2Uubm93KCksXG4gIH07XG5cbiAgLy8gQXBwbHkgZHVyYWJsZSBlZGl0cyBhZnRlciBiYXNlIGdlbmVyYXRpb24uXG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIGlmIChlZGl0cykge1xuICAgIGZvciAoY29uc3QgW2lkeCwgbV0gb2YgZWRpdHMpIHtcbiAgICAgIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gICAgfVxuICAgIC8vIFJlY29tcHV0ZSB0aGUgY2FjaGUgZm9yIGVkaXRlZCBjaHVua3MuXG4gICAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgbHgsIGx6KTtcbiAgICB9XG4gIH1cbiAgLy8gTm9uLWFpciBjb3VudHMgYXJlIGRlcml2ZWQgcmVuZGVyZXIgc3RhdGlzdGljcywgbm90IGR1cmFibGUgd29ybGQgc3RhdGUuXG4gIC8vIEVkaXRlZCBiYXNlIGFpciBtYXkgYmVjb21lIHNvbGlkIChhbmQgdmljZSB2ZXJzYSkgZHVyaW5nIHJlc3RvcmF0aW9uLlxuICBsZXQgZWRpdGVkTm9uQWlyID0gMDtcbiAgZm9yIChjb25zdCBtYXRlcmlhbCBvZiBjaHVuay5kYXRhKSBpZiAobWF0ZXJpYWwgIT09IE1BVC5BSVIpIGVkaXRlZE5vbkFpcisrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gZWRpdGVkTm9uQWlyIC0gbm9uQWlyO1xuXG4gIHdvcmxkLmNodW5rcy5zZXQoa2V5LCBjaHVuayk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCsrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gbm9uQWlyO1xuICB3b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgKz0gZ2VuZXJhdGlvbk1zO1xuICB3b3JsZC5kaXJ0eS5hZGQoa2V5KTtcblxuICBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkLCBjaHVuayk7XG4gIHJldHVybiBjaHVuaztcbn1cblxuLyoqIEEgYmFzZS10ZXJyYWluIGNhY2hlIHNoYXJlZCBieSBlZGl0ZWQgYW5kIHVuZWRpdGVkIHJlZ2VuZXJhdGlvbi4gTmF0dXJhbFxuICogc2NlbmVyeSBuZXZlciBkZXBlbmRzIG9uIGxhdGVyIHZveGVsIGVkaXRzOyB0aGlzIGFsc28gbGV0cyBhIHNuYXBzaG90IHJlc3RvcmVcbiAqIGEgaGFydmVzdGVkIGNodW5rIHdpdGhvdXQgbWF0ZXJpYWxpemluZyB1bnJlbGF0ZWQgbmVpZ2hib3VyaW5nIGNodW5rcy4gKi9cbmNvbnN0IGJhc2VDb2x1bW5DYWNoZSA9IG5ldyBXZWFrTWFwPFdvcmxkLCBNYXA8c3RyaW5nLCB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheSB9Pj4oKTtcblxuZXhwb3J0IGludGVyZmFjZSBCYXNlQ29sdW1ucyB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheTsgfVxuXG4vKiogQmFzZSAocHJlLWNhcnZlLCBwcmUtZWRpdCkgY29sdW1uIGhlaWdodHMvbWF0ZXJpYWxzIHVzZWQgZm9yIGVudGl0eSBwbGFjZW1lbnQuIFB1cmUuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZUJhc2VDb2x1bW5zKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQmFzZUNvbHVtbnMge1xuICBjb25zdCBjb2x1bW5zID0geyBoZWlnaHRzOiBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKSwgdG9wTWF0ZXJpYWxzOiBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKSB9O1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4LCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6KTtcbiAgICAgIGNvbnN0IHNsb3BlID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyB2ZXJzaW9uZWRTbG9wZShzZWVkLCB2ZXJzaW9uLCB4LCB6LCBoKSA6IHNsb3BlQXQoc2VlZCwgeCwgeiwgaCk7XG4gICAgICBjb25zdCBpbmRleCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5oZWlnaHRzW2luZGV4XSA9IGNsYW1wKGggLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICBjb2x1bW5zLnRvcE1hdGVyaWFsc1tpbmRleF0gPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IGJhc2VUb3BNYXRlcmlhbEZvcihzZWVkLCB2ZXJzaW9uLCB4LCB6LCBoLCBzbG9wZSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8qKiBQcm92aWRlIHByZWNvbXB1dGVkIGJhc2UgY29sdW1ucyAoZm9yIGV4YW1wbGUgZnJvbSBhIHdvcmtlcikgYmVmb3JlIGluc3RhbGxpbmcgYSBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWVkQmFzZUNvbHVtbnMod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZywgY29sdW1uczogQmFzZUNvbHVtbnMpOiB2b2lkIHtcbiAgbGV0IGNhY2hlID0gYmFzZUNvbHVtbkNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGUpIHsgY2FjaGUgPSBuZXcgTWFwKCk7IGJhc2VDb2x1bW5DYWNoZS5zZXQod29ybGQsIGNhY2hlKTsgfVxuICBpZiAoIWNhY2hlLmhhcyhrZXkpKSBjYWNoZS5zZXQoa2V5LCBjb2x1bW5zKTtcbn1cblxuZnVuY3Rpb24gYmFzZUNvbHVtbnMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IEJhc2VDb2x1bW5zIHtcbiAgbGV0IGNhY2hlID0gYmFzZUNvbHVtbkNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGUpIHsgY2FjaGUgPSBuZXcgTWFwKCk7IGJhc2VDb2x1bW5DYWNoZS5zZXQod29ybGQsIGNhY2hlKTsgfVxuICBjb25zdCBjYWNoZWQgPSBjYWNoZS5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGNhY2hlZDtcbiAgY29uc3QgY29sdW1ucyA9IGNvbXB1dGVCYXNlQ29sdW1ucyh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbiAgY2FjaGUuc2V0KGNodW5rLmtleSwgY29sdW1ucyk7XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG4vLyAtLS0tLS0tLS0tIGRlcml2ZWQgY2hhbmdlIHRyYWNraW5nIChub3QgYXV0aG9yaXRhdGl2ZSBzdGF0ZSkgLS0tLS0tLS0tLVxuLy8gUmVuZGVyZXJzIG5lZWQgdG8ga25vdyB3aGVuIHRoZSBlZGl0IG92ZXJsYXkgY2hhbmdlZCB3aXRob3V0IHdhbGtpbmcgZXZlcnlcbi8vIGVkaXQgZWFjaCBmcmFtZS4gVGhlIGNvdW50ZXIgbGl2ZXMgb3V0c2lkZSBXb3JsZCBzbyBpdCBuZXZlciBlbnRlcnMgYVxuLy8gc25hcHNob3Qgb3IgY2Fub25pY2FsIGhhc2guXG5jb25zdCBlZGl0VmVyc2lvbnMgPSBuZXcgV2Vha01hcDxXb3JsZCwgbnVtYmVyPigpO1xuXG4vKiogTW9ub3RvbmljIGNvdW50IG9mIGVkaXQtb3ZlcmxheSBjaGFuZ2VzIGZvciB0aGlzIFdvcmxkIG9iamVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0VmVyc2lvbih3b3JsZDogV29ybGQpOiBudW1iZXIge1xuICByZXR1cm4gZWRpdFZlcnNpb25zLmdldCh3b3JsZCkgPz8gMDtcbn1cblxuLyoqIENhbGwgYWZ0ZXIgcmVwbGFjaW5nIG9yIGJ1bGstY2hhbmdpbmcgYHdvcmxkLmVkaXRzYCBvdXRzaWRlIHNldFZveGVsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtFZGl0c0NoYW5nZWQod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGVkaXRWZXJzaW9ucy5zZXQod29ybGQsIGVkaXRWZXJzaW9uKHdvcmxkKSArIDEpO1xufVxuXG4vLyAtLS0tLS0tLS0tIG5vbi1nZW5lcmF0aW5nIHF1ZXJpZXMgLS0tLS0tLS0tLVxuLy8gTW92aW5nIHByZXNlbnRhdGlvbiAoY2hhcmFjdGVycywgYW5pbWFscywgY2FtZXJhKSBtdXN0IG5ldmVyIHRyaWdnZXIgY2h1bmtcbi8vIGdlbmVyYXRpb24gYXMgYSBzaWRlIGVmZmVjdCBvZiBhc2tpbmcgYWJvdXQgdGVycmFpbi4gVGhlc2UgcmV0dXJuIG51bGwgd2hlblxuLy8gdGhlIGNvbHVtbidzIGNodW5rIGlzIG5vdCByZXNpZGVudC5cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Q2h1bmtBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHdvcmxkLmNodW5rcy5nZXQoY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSkpID8/IG51bGw7XG59XG5cbi8qKiBMaWtlIHN1cmZhY2VBdCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHwgbnVsbCB7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbi8qKiBMaWtlIGdldFZveGVsLCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Vm94ZWxBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB8IG51bGwge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXZpY3RDaHVuayh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghd29ybGQuY2h1bmtzLmhhcyhrZXkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmNodW5rcy5kZWxldGUoa2V5KTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzRXZpY3RlZCsrO1xuICAvLyBDaHVuayBieXRlcyBhbmQgY29sdW1uIGNhY2hlcyBhcmUgcmVnZW5lcmF0ZWQgb24gZGVtYW5kLiBFbnRpdGllcyByZW1haW5cbiAgLy8gYXV0aG9yaXRhdGl2ZTogZXZpY3Rpb24gbXVzdCBub3QgZm9yZ2V0IHRoZWlyIHBlcnNpc3RlbnQgc3RhdGUuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyAtLS0tLS0tLS0tIHF1ZXJpZXMgLyBlZGl0cyAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZ2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBtOiBNYXRJZCk6IGJvb2xlYW4ge1xuICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gWV9NQVgpIHJldHVybiBmYWxzZTtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgaWR4ID0gbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIGNvbnN0IHByZXZpb3VzRWRpdCA9IHdvcmxkLmVkaXRzLmdldChjaHVua0tleShjeCwgY3opKT8uZ2V0KGlkeCk7XG4gIC8vIEEgY2h1bmsgZXZpY3RlZCBhZnRlciBhbiBlYXJsaWVyIGVkaXQgY2FuIHJlZ2VuZXJhdGUgd2l0aCB0aGF0IGR1cmFibGVcbiAgLy8gbWF0ZXJpYWwgYWxyZWFkeSBhcHBsaWVkLiBEcm9wcGluZyB0aGUgZWRpdCBoZXJlIHdvdWxkIG1ha2UgaXQgZGlzYXBwZWFyXG4gIC8vIG9uIHRoZSBuZXh0IGV2aWN0aW9uL3Jlc3RvcmF0aW9uLCBldmVuIHRob3VnaCB0aGUgY3VycmVudCB3cml0ZSBuby1vcHMuXG4gIGlmIChwcmV2aW91c0VkaXQgPT09IG0pIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIGZhbHNlO1xuICBsZXQgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKCFlZGl0cykgeyBlZGl0cyA9IG5ldyBNYXAoKTsgd29ybGQuZWRpdHMuc2V0KGNodW5rLmtleSwgZWRpdHMpOyB9XG4gIC8vIEFuIGlkZW1wb3RlbnQgd3JpdGUgbXVzdCBzdGlsbCByZXN0b3JlIGEgZHVyYWJsZSBkZWx0YSBkaXNjYXJkZWQgYnkgYW5cbiAgLy8gb2xkZXIgc25hcHNob3Qgb3IgZGVsdGEgZGVjb2Rlci4gSXQgaXMgbm90IGEgbmV3IGF1dGhvcml0YXRpdmUgcmV2aXNpb24uXG4gIGlmIChjaHVuay5kYXRhW2lkeF0gPT09IG0pIHtcbiAgICBpZiAoIWVkaXRzLmhhcyhpZHgpKSBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgZWRpdHMuc2V0KGlkeCwgbSk7XG4gIG1hcmtFZGl0c0NoYW5nZWQod29ybGQpO1xuICBjaHVuay5kaXJ0eSA9IHRydWU7XG4gIHdvcmxkLmRpcnR5LmFkZChjaHVuay5rZXkpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgd29ybGRUb0xvY2FsWCh4KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDb2x1bW5DYWNoZShjaHVuazogVm94ZWxDaHVuaywgbHg6IG51bWJlciwgbHo6IG51bWJlcik6IHZvaWQge1xuICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgaWYgKGlzU29saWQoY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSkpIHsgdG9wU29saWQgPSB5OyBicmVhazsgfVxuICB9XG4gIGNodW5rLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gIGNvbnN0IHRtID0gY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgaWYgKHRvcFNvbGlkID49IFlfTUlOKSB7XG4gICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgodG9wU29saWQpLCBseildO1xuICAgIGlmIChtICE9PSBNQVQuV0FURVIpIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBtO1xuICB9IGVsc2Uge1xuICAgIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0bTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSB5IGNvb3JkaW5hdGUgb2YgdGhlIGV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbiBhdCB4L3ouXG4gKiBBIHNvbGlkIHZveGVsIGF0IHkgb2NjdXBpZXMgW3ksIHkrMSksIHNvIHRoZSB3YWxrYWJsZSBzdXJmYWNlIGlzIHRvcFNvbGlkKzEuXG4gKiBUaGlzIGlzIGEgZGVyaXZlZCBxdWVyeTsgdGhlIGF1dGhvcml0YXRpdmUgc3RhdGUgcmVtYWlucyB0aGUgdm94ZWwgdm9sdW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gWV9NSU47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gWV9NSU47XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLnRvcE1hdGVyaWFsc1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAod29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24gPCBHRU5FUkFUT1JfVjIpIHtcbiAgICBjb25zdCBoID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCAtIGggOiAwO1xuICB9XG4gIHJldHVybiB3YXRlclN1cmZhY2VBdCh3b3JsZCwgeCwgeikgLSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG4vKipcbiAqIFRvcCBvZiB0aGUgd2F0ZXIgY29sdW1uIHN0YW5kaW5nIG9uIHRoZSBzb2xpZCBzdXJmYWNlIChlcXVhbCB0byB0aGUgc3VyZmFjZVxuICogd2hlbiBkcnkpLiBSZWFkcyB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbHMsIHNvIGVkaXRzIGFuZCBkdWcgcGl0cyBhcmUgZXhhY3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRlclN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICB3aGlsZSAoeSA8IFlfTUFYICYmIGdldFZveGVsKHdvcmxkLCB4LCB5LCB6KSA9PT0gTUFULldBVEVSKSB5Kys7XG4gIHJldHVybiB5O1xufVxuXG4vLyAtLS0tLS0tLS0tIGVudGl0aWVzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGFkZEVudGl0eSh3b3JsZDogV29ybGQsIGU6IEVudGl0eSk6IHZvaWQge1xuICBpZiAod29ybGQuZW50aXRpZXMuaGFzKGUuaWQpIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSByZXR1cm47XG4gIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBlKTtcbiAgbGV0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIGxpc3QpOyB9XG4gIGxpc3QucHVzaChlLmlkKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICAvLyBHZW5lcmF0aW9uIGlzIGRldGVybWluaXN0aWMgYW5kIGFkdmFuY2VzIG5vIHBsYXllci1jb21tYW5kIHByZWNvbmRpdGlvbi5cbiAgLy8gQXV0aG9yZWQgc2NhZmZvbGRpbmcgbWF5IHRyYW5zaWVudGx5IGNoYW5nZSBpdDsgdGhlIHNuYXBzaG90IHJlc3RvcmVzIHRoZVxuICAvLyBzYXZlZCByZXZpc2lvbiBhZnRlciBwbGFjaW5nIHRoYXQgc2NhZmZvbGRpbmcuXG59XG5cbi8qKlxuICogUmVtb3ZlIGFuIGVudGl0eSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHdvcmxkLiBVc2VkIHdoZW4gYSBzaXRlIGlzIGNsZWFyZWQ6XG4gKiB0aGUgcmVzb3VyY2UgeWllbGQgaXMgYWNjb3VudGVkIGZvciBieSB0aGUgY2FsbGVyLCBhbmQgdGhlIGVudGl0eSBtdXN0IHN0b3BcbiAqIGV4aXN0aW5nIGZvciBjb2xsaXNpb24sIG9ic3RydWN0aW9uIGFuZCBwZXJzaXN0ZW5jZSwgbm90IGp1c3QgYmUgaGlkZGVuIGJ5XG4gKiB0aGUgcmVuZGVyZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgY29uc3QgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmIChsaXN0KSB7XG4gICAgY29uc3QgaSA9IGxpc3QuaW5kZXhPZihpZCk7XG4gICAgaWYgKGkgPj0gMCkgbGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoaWQpO1xuICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlJZChjaHVuazogc3RyaW5nLCBpOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gYGU6JHtjaHVua306JHtpfWA7XG59XG5cbi8qKlxuICogUHVyZSBmb3Jlc3QtZGVuc2l0eSBmaWVsZCB1c2VkIGJ5IGVudGl0eSBnZW5lcmF0aW9uLiBFeHBvcnRlZCByZWFkLW9ubHkgZm9yXG4gKiByZW5kZXIgZGVjb3JhdGlvbiAocmVuZGVyL2dyb3VuZC1jb3Zlci50cyk7IGNoYW5naW5nIGl0IGNoYW5nZXMgd29ybGRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9yZXN0U2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgZWFzdCA9IE1hdGguZXhwKC0oKCh3eCAtIDIyMCkgLyAyNjApICoqIDIgKyAoKHd6ICsgMTEwKSAvIDIyMCkgKiogMikpO1xuICBjb25zdCBub3J0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDIwKSAvIDMwMCkgKiogMiArICgod3ogKyAzMDApIC8gMTkwKSAqKiAyKSk7XG4gIGNvbnN0IHdlc3QgPSBNYXRoLmV4cCgtKCgod3ggKyAzNDApIC8gMjAwKSAqKiAyICsgKCh3eiAtIDEyMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3Qgc291dGggPSBNYXRoLmV4cCgtKCgod3ggLSAxMjApIC8gMjQwKSAqKiAyICsgKCh3eiAtIDMzMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3QgbW9pc3R1cmUgPSBmYm0yKHd4IC8gMjYwLCB3eiAvIDI2MCwgc2VlZCArIDIwMSwgNCk7XG4gIGNvbnN0IHZhbGxleSA9IE1hdGguZXhwKC0oKHd4IC8gMTQwKSAqKiAyICsgKHd6IC8gMTA1KSAqKiAyKSk7XG4gIHJldHVybiBNYXRoLm1heChlYXN0LCBub3J0aCAqIDAuOTIsIHdlc3QgKiAwLjgwLCBzb3V0aCAqIDAuNzgpICogMC44MlxuICAgICsgbW9pc3R1cmUgKiAwLjM4IC0gMC4yMiAtIHZhbGxleSAqIDAuMzQ7XG59XG5cbi8qKiBQdXJlIHJvY2tpbmVzcyBmaWVsZCB1c2VkIGJ5IGVudGl0eSBnZW5lcmF0aW9uIChzYW1lIGNvbnRyYWN0IGFzIGZvcmVzdFNjb3JlKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiByb2NrU2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgbW91bnRhaW4gPSBmYm0yKHd4IC8gMzMwLCB3eiAvIDMzMCwgc2VlZCArIDIwMiwgMyk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMTQwLCB3eiAvIDE0MCwgc2VlZCArIDIwMywgMykgLSAxKTtcbiAgcmV0dXJuIG1vdW50YWluICogMC41NSArIHJpZGdlICogMC40NTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdGllcyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogdm9pZCB7XG4gIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQsIGNodW5rLmN4LCBjaHVuay5jeik7XG59XG5cbi8qKiBAaW50ZXJuYWwgUmVwbGF5cyBkZXRlcm1pbmlzdGljIGdlbmVyYXRpb24gZm9yIHNuYXBzaG90IGVudGl0eSBkZWx0YXMuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgaWYgKHdvcmxkLmVudGl0eUNodW5rcy5oYXMoa2V5KSkgcmV0dXJuO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm47XG5cbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoaGFzaDJpKGNodW5rLmN4LCBjaHVuay5jeiwgd29ybGQuc2VlZCArIDkwMCkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBjb2x1bW5zID0gYmFzZUNvbHVtbnMod29ybGQsIGNodW5rKTtcbiAgbGV0IG4gPSAwO1xuICBsZXQgbmF0dXJhbFRyZWVzID0gMDtcbiAgbGV0IG5hdHVyYWxQaW5rVHJlZXMgPSAwO1xuXG4gIGNvbnN0IGxvY2FsU3VyZmFjZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSArIFlfTUlOO1xuICB9O1xuICBjb25zdCBsb2NhbFRvcCA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogTWF0SWQgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gYXMgTWF0SWQ7XG4gIH07XG4gIGNvbnN0IGxvY2FsU2xvcGUgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgIHJldHVybiBNYXRoLm1heChcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggLSAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogLSAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgKTtcbiAgfTtcblxuICAvLyBBIGppdHRlcmVkIDggbSBsYXR0aWNlIGdpdmVzIGNvaGVyZW50IG1hc3NlcyBhbmQgYXZvaWRzIHBlci1mcmFtZSBzY2F0dGVyLlxuICBmb3IgKGxldCBneiA9IDA7IGd6IDwgQ0hVTktfU0laRTsgZ3ogKz0gOCkge1xuICAgIGZvciAobGV0IGd4ID0gMDsgZ3ggPCBDSFVOS19TSVpFOyBneCArPSA4KSB7XG4gICAgICBjb25zdCBseCA9IGNsYW1wKE1hdGguZmxvb3IoZ3ggKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCBseiA9IGNsYW1wKE1hdGguZmxvb3IoZ3ogKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICAgIGlmIChoIDw9IFNFQV9MRVZFTCArIDEpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgc2xvcGUgPSBsb2NhbFNsb3BlKGx4LCBseik7XG4gICAgICBjb25zdCB0b3AgPSBsb2NhbFRvcChseCwgbHopO1xuICAgICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGZvcmVzdCA9IGZvcmVzdFNjb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2NreSA9IHJvY2tTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9sbCA9IHJuZCgpO1xuXG4gICAgICBjb25zdCB0cmVlQ2hhbmNlID0gZm9yZXN0ID4gMC41MCA/IDAuNzIgOiBmb3Jlc3QgPiAwLjMwID8gMC4yNSA6IDAuMDU7XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMiAmJiByb2xsIDwgdHJlZUNoYW5jZSkge1xuICAgICAgICAvLyBUaGUgY2FwIGlzIGEgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWdlbmVyYXRpb24gcHJvcGVydHkuIEl0IGNhbm5vdFxuICAgICAgICAvLyBkZXBlbmQgb24gd2hpY2ggY2h1bmtzIGEgcmVuZGVyZXIgbG9hZGVkIGJlZm9yZSB0aGlzIG9uZS5cbiAgICAgICAgbGV0IGtpbmQ6IEVudGl0eUtpbmQ7XG4gICAgICAgIGxldCB2YXJpYW50OiBudW1iZXI7XG4gICAgICAgIGNvbnN0IHNwZWNpZXNSb2xsID0gcm5kKCk7XG4gICAgICAgIGlmIChzcGVjaWVzUm9sbCA8IDAuMTIpIHtcbiAgICAgICAgICBpZiAoKG5hdHVyYWxQaW5rVHJlZXMgKyAxKSA+IDAuMjUgKiAobmF0dXJhbFRyZWVzICsgMSkpIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtPdmVyZmxvdysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9ibG9zc29tJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMik7XG4gICAgICAgICAgICBuYXR1cmFsUGlua1RyZWVzKys7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjQwKSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfc3BpcmUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjc0KSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfdGFibGUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgfVxuICAgICAgICBuYXR1cmFsVHJlZXMrKztcbiAgICAgICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuODggKyBybmQoKSAqIDAuMjQsIHZhcmlhbnQsXG4gICAgICAgICAgcmVzb3VyY2U6ICd3b29kJywgcmVtYWluaW5nOiAxMiwgeWllbGRQZXJIYXJ2ZXN0OiA0LFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiByb2NreSA+IDAuNDYgJiYgcm9sbCA8IDAuMzgpIHtcbiAgICAgICAgLy8gQ29uc3VtZSB0aGUgcmV0aXJlZCBzdG9uZSBmb3JtJ3MgcmFuZG9tIGRyYXdzIGFuZCBhbGxvY2F0ZSBpdHMgb2xkXG4gICAgICAgIC8vIHNlcXVlbmNlIElELCBidXQgZG8gbm90IGluc2VydCBhbiBlbnRpdHkuIExhdGVyIG5hdHVyYWwgcGxhY2VtZW50c1xuICAgICAgICAvLyB0aGVyZWZvcmUgcmVtYWluIGJ5dGUtZm9yLWJ5dGUgY29tcGF0aWJsZSB3aXRoIHJlY29yZGVkIHNhdmVzLlxuICAgICAgICBjb25zdCBzaXplUm9sbCA9IHJuZCgpO1xuICAgICAgICBjb25zdCBraW5kOiBFbnRpdHlLaW5kID0gc2l6ZVJvbGwgPCAwLjU1ID8gJ3N0eWxfcm9ja19zbWFsbCdcbiAgICAgICAgICA6IHNpemVSb2xsIDwgMC45MCA/ICdzdHlsX3JvY2tfbWVkaXVtJyA6ICdzdHlsX3JvY2tfbGFyZ2UnO1xuICAgICAgICBjb25zdCBpZCA9IGVudGl0eUlkKGNodW5rLmtleSwgbisrKTtcbiAgICAgICAgY29uc3QgcmVjb3JkID0ge1xuICAgICAgICAgIGlkLCBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcmVzb3VyY2U6ICdzdG9uZScgYXMgY29uc3QsXG4gICAgICAgICAgcmVtYWluaW5nOiBraW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDQgOiBraW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyA4IDogMTIsXG4gICAgICAgICAgeWllbGRQZXJIYXJ2ZXN0OiAzLCBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICB9O1xuICAgICAgICAvLyBPbmx5IGVudGl0aWVzIHRoYXQgZXhpc3RlZCBpbiBhbiBhY2NlcHRlZCBvbGQgc2F2ZSBnZXQgdG9tYnN0b25lcyxcbiAgICAgICAgLy8gZHVyaW5nIGV4cGxpY2l0IG1pZ3JhdGlvbi4gT3JkaW5hcnkgZ2VuZXJhdGlvbiBtdXN0IHJlc3RvcmUgZXhhY3RseS5cbiAgICAgICAgaWYgKGlzU3RvbmVSZXBsYXkod29ybGQpKSBhZGRFbnRpdHkod29ybGQsIHJlY29yZCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULlNUT05FICYmIHJvY2t5ID4gMC41OCAmJiByb2xsIDwgMC4xOCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX29yZScsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAyKSxcbiAgICAgICAgICByZXNvdXJjZTogJ29yZScsIHJlbWFpbmluZzogOCwgeWllbGRQZXJIYXJ2ZXN0OiAyLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAxICYmIHJvbGwgPCAwLjMwKSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfc2hydWInLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOCArIHJuZCgpICogMC40LCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgICAgcmVzb3VyY2U6ICdmaWJlcicsIHJlbWFpbmluZzogNCwgeWllbGRQZXJIYXJ2ZXN0OiAxLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRBdXRob3JlZEVudGl0eSh3b3JsZDogV29ybGQsIGtpbmQ6IEVudGl0eUtpbmQsIHg6IG51bWJlciwgejogbnVtYmVyLCB2YXJpYW50OiBudW1iZXIsIHJvdDogbnVtYmVyLCBzY2FsZTogbnVtYmVyLCByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbCwgcmVtYWluaW5nOiBudW1iZXIsIHlpZWxkUGVySGFydmVzdDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoeSA8PSBTRUFfTEVWRUwpIHJldHVybjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIC8vIEEgaGVybyBhc3NldCBvd25zIGl0cyBzcG90OiBjbGVhciBhbnkgZ2VuZXJhdGVkIGVudGl0eSB0aGF0IHdvdWxkIG92ZXJsYXBcbiAgLy8gaXQsIHJhdGhlciB0aGFuIHNpbGVudGx5IGRyb3BwaW5nIHRoZSBhdXRob3JlZCBjb21wb3NpdGlvbi5cbiAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdO1xuICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgcmV0dXJuO1xuICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmIChlICYmIE1hdGguaHlwb3QoZS54IC0geCwgZS56IC0geikgPCAyLjYpIHtcbiAgICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gICAgICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gICAgICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgICB9XG4gIH1cbiAgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSk7XG4gIC8vIEF1dGhvcmVkIGNvbXBvc2l0aW9uIGlzIGR1cmFibGUgc3RhdGU6IGl0IGNhbiBjbGVhciBvdmVybGFwcGluZyBuYXR1cmFsXG4gIC8vIGVudGl0aWVzLCBzbyBzYXZlIHRoZSBjb21wbGV0ZSBhZmZlY3RlZCBjaHVuayByYXRoZXIgdGhhbiBvbmx5IGl0cyBoZXJvZXMuXG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG5cbiAgY29uc3QgaWQgPSBgaGVybzoke2tpbmR9OiR7TWF0aC5yb3VuZCh4KX06JHtNYXRoLnJvdW5kKHopfWA7XG4gIGNvbnN0IGJlZm9yZSA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGNvbnN0IGVudGl0eTogRW50aXR5ID0ge1xuICAgIGlkLCBraW5kLCBjaHVuazoga2V5LCB4OiB4ICsgMC41LCB5LCB6OiB6ICsgMC41LFxuICAgIHJvdCwgc2NhbGUsIHZhcmlhbnQsIHJlc291cmNlLCByZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdCxcbiAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IHRydWUsXG4gIH07XG4gIGFkZEVudGl0eSh3b3JsZCwgZW50aXR5KTtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLnNpemUgPiBiZWZvcmUgJiYga2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkge1xuICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkgcmV0dXJuO1xuICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG5cbiAgY29uc3Qgc2l0ZXM6IEFycmF5PHsga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcm90OiBudW1iZXIgfT4gPSBbXG4gICAgeyBraW5kOiAnd2F5c3RvbmUnLCB4OiAtMTAsIHo6IC0xNCwgcm90OiAwIH0sXG4gICAgeyBraW5kOiAnbWFya2VyJywgeDogLTMyLCB6OiAtOCwgcm90OiBNYXRoLlBJIC8gMiB9LFxuICBdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc2l0ZXMpIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKHkgPD0gU0VBX0xFVkVMKSBjb250aW51ZTtcbiAgICB3b3JsZC5zaXRlcy5wdXNoKHtcbiAgICAgIGlkOiBgc2l0ZToke3Mua2luZH1gLFxuICAgICAga2luZDogcy5raW5kLFxuICAgICAgeDogcy54ICsgMC41LCB5LCB6OiBzLnogKyAwLjUsXG4gICAgICByb3Q6IHMucm90LFxuICAgICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gICAgfSk7XG4gIH1cblxuICAvLyBBIGhlcm8gZ3JvdmUgY29tcG9zZWQgaW4gdGhlIGRlZmF1bHQgY2FtZXJhJ3MgdmlldyBkaXJlY3Rpb24uIFRoZXNlIGFyZVxuICAvLyBTdHlsIG5hdHVyYWwgYXNzZXRzIChBUy0wMDEgdjIpLCBub3QgTm94ZWwgYXJjaGl0ZWN0dXJlOyB0aGUgTm94ZWxcbiAgLy8gd2F5c3RvbmUvbWFya2VyIGFib3ZlIHJlbWFpbiB0aGUgaHVtYW4tbWFkZSBsYW5kbWFya3MuXG4gIGNvbnN0IGdyb3ZlOiBBcnJheTxbRW50aXR5S2luZCwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdPiA9IFtcbiAgICBbJ3N0eWxfdHJlZV9zcGlyZScsIC0yMiwgLTI2LCAwLCAxLjAwLCAwXSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC0zNCwgLTE4LCAxLCAwLjk1LCBNYXRoLlBJIC8gMTJdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTYsIC0zNCwgMiwgMS4wMCwgTWF0aC5QSSAvIDZdLFxuICAgIFsnc3R5bF90cmVlX2Jsb3Nzb20nLCAtMjgsIC0zOCwgMCwgMC45MCwgTWF0aC5QSSAvIDRdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTQwLCAtMzAsIDIsIDEuMDUsIE1hdGguUEkgLyAzXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTEyLCAtMjQsIDAsIDAuOTAsIE1hdGguUEkgLyAyLjRdLFxuICBdO1xuICBmb3IgKGNvbnN0IFtraW5kLCB4LCB6LCB2YXJpYW50LCBzY2FsZSwgcm90XSBvZiBncm92ZSkge1xuICAgIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCBraW5kLCB4LCB6LCB2YXJpYW50LCByb3QsIHNjYWxlLCAnd29vZCcsIDEyLCA0KTtcbiAgfVxuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfcm9ja19tZWRpdW0nLCAtNiwgLTEwLCAwLCAwLCAxLjAsICdzdG9uZScsIDgsIDMpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfc2hydWInLCAtMTQsIC04LCAxLCBNYXRoLlBJIC8gMTIsIDEuMSwgJ2ZpYmVyJywgNCwgMSk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9jYWlybicsIC0yMCwgLTYsIDAsIDAsIDEuMCwgJ3N0b25lJywgNiwgMik7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9vcmUnLCAtMzgsIC00MiwgMCwgTWF0aC5QSSAvIDQsIDEuMSwgJ29yZScsIDgsIDIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbmVhcmVzdEhhcnZlc3RhYmxlKFxuICB3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCByYWRpdXM6IG51bWJlciwgcmVzb3VyY2U/OiBSZXNvdXJjZVR5cGUsXG4pOiBFbnRpdHkgfCBudWxsIHtcbiAgbGV0IGJlc3Q6IEVudGl0eSB8IG51bGwgPSBudWxsO1xuICBsZXQgYmVzdEQgPSByYWRpdXMgKiByYWRpdXM7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZClcbiAgICAgIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIGNvbnRpbnVlO1xuICAgIGlmIChyZXNvdXJjZSAmJiBlLnJlc291cmNlICE9PSByZXNvdXJjZSkgY29udGludWU7XG4gICAgY29uc3QgZCA9IChlLnggLSB4KSAqKiAyICsgKGUueiAtIHopICoqIDI7XG4gICAgaWYgKGQgPCBiZXN0RCkgeyBiZXN0RCA9IGQ7IGJlc3QgPSBlOyB9XG4gIH1cbiAgcmV0dXJuIGJlc3Q7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdFJlc3VsdCB7IGVudGl0eTogRW50aXR5OyByZXNvdXJjZTogUmVzb3VyY2VUeXBlOyBhbW91bnQ6IG51bWJlcjsgfVxuXG4vKipcbiAqIFNldHRsZW1lbnQgcnVsZXMgdjIgKE0wMTApOiBncm93dGggc3RhZ2Ugc2V0cyB0cmVlIHlpZWxkIGFuZCBmb290cHJpbnQsIGFuZFxuICogdmlsbGFnZXJzIG5hdmlnYXRlLiBBY3RpdmUgb25jZSB0aGUgd29ybGQncyBob21lc3RlYWQgaXMgdmVyc2lvbiAyIChmb3VuZGVkXG4gKiBvciB1cGdyYWRlZCBieSBhIGpvdXJuYWxlZCBjb21tYW5kKTsgZWFybGllciB3b3JsZHMga2VlcCBsZWdhY3kgcnVsZXMsIHNvXG4gKiB0aGVpciByZXBsYXlzIGFuZCBoYXNoZXMgYXJlIHVuY2hhbmdlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0YWdlUnVsZXNBY3RpdmUod29ybGQ6IFdvcmxkKTogYm9vbGVhbiB7XG4gIHJldHVybiAod29ybGQuaG9tZXN0ZWFkPy52ZXJzaW9uID8/IDApID49IDI7XG59XG5cbi8qKlxuICogVW5kZXIgc3RhZ2UgcnVsZXMgYSB0cmVlJ3MgZmlyc3QgY3V0IHNldHMgaXRzIHJlY29yZCB0byB0aGUgc3RhZ2UncyB0aW1iZXJcbiAqIChhIHNhcGxpbmcgaG9sZHMgMiB3b29kLCBhbiBvbGQgdHJlZSAxNikuIElkZW1wb3RlbnQgYWZ0ZXIgdGhlIGZpcnN0IGN1dC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5U3RhZ2VUaW1iZXIod29ybGQ6IFdvcmxkLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaWYgKCFzdGFnZVJ1bGVzQWN0aXZlKHdvcmxkKSB8fCBlLmhhcnZlc3RlZE9uY2UpIHJldHVybjtcbiAgY29uc3QgdCA9IHRyZWVUaW1iZXIoZSk7XG4gIGlmICghdCkgcmV0dXJuO1xuICBlLnJlbWFpbmluZyA9IHQudG90YWw7XG4gIGUueWllbGRQZXJIYXJ2ZXN0ID0gdC5jdXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXJ2ZXN0RW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEhhcnZlc3RSZXN1bHQgfCBudWxsIHtcbiAgY29uc3QgZSA9IGxpdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsO1xuICAvLyBDYXBhY2l0eSBpcyBjaGVja2VkIGFnYWluc3QgdGhlIHN0YWdlIHlpZWxkLCB0aGVuIHRoZSByZWNvcmQgY2hhbmdlcy5cbiAgaWYgKHN0YWdlUnVsZXNBY3RpdmUod29ybGQpICYmICFlLmhhcnZlc3RlZE9uY2UgJiYgdHJlZVRpbWJlcihlKSkge1xuICAgIGNvbnN0IHQgPSB0cmVlVGltYmVyKGUpITtcbiAgICBpZiAod29ybGQubGlmZSAmJiBPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIG4pID0+IHN1bSArIG4sIDApICsgTWF0aC5taW4odC5jdXQsIHQudG90YWwpID4gMTIwKSByZXR1cm4gbnVsbDtcbiAgICBhcHBseVN0YWdlVGltYmVyKHdvcmxkLCBlKTtcbiAgfVxuICBjb25zdCBhbW91bnQgPSBNYXRoLm1pbihlLnlpZWxkUGVySGFydmVzdCwgZS5yZW1haW5pbmcpO1xuICBpZiAod29ybGQubGlmZSAmJiBPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIG4pID0+IHN1bSArIG4sIDApICsgYW1vdW50ID4gMTIwKSByZXR1cm4gbnVsbDtcbiAgZS5yZW1haW5pbmcgLT0gYW1vdW50O1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBlLmhhcnZlc3RlZE9uY2UgPSB0cnVlO1xuICBpZiAoZS5yZW1haW5pbmcgPD0gMCkgZS5oYXJ2ZXN0ZWQgPSB0cnVlO1xuICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBlbnRpdHk6IGUsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQgfTtcbn1cblxuLyoqIFJlbW92ZSBldmVyeSByZXRpcmVkIHNvdXJjZSBhZnRlciB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheS4gVGhpcyBtaWdyYXRpb25cbiAqIGNyZWF0ZXMgZGV0ZXJtaW5pc3RpYyB0b21ic3RvbmVzIGJ1dCBpcyBub3QgYSBwbGF5ZXIgY29tbWFuZCBvciByZXZpc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXRpcmVTdG9uZUVudGl0aWVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBmb3IgKGNvbnN0IGUgb2YgWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXSkge1xuICAgIGlmICghaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkpIGNvbnRpbnVlO1xuICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShlLmlkKTtcbiAgICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChlLmlkKTtcbiAgICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgICBpZiAoIXdvcmxkLmVudGl0eUNodW5rcy5oYXMoZS5jaHVuaykpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIGZvciAoY29uc3QgW2tleSwgaWRzXSBvZiB3b3JsZC5lbnRpdHlDaHVua3MpIHtcbiAgICBjb25zdCBhY3RpdmUgPSBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSk7XG4gICAgaWYgKGFjdGl2ZS5sZW5ndGggPiAwIHx8IHdvcmxkLmVudGl0eUNoYW5nZXMuaGFzKGtleSkpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBhY3RpdmUpO1xuICAgIGVsc2Ugd29ybGQuZW50aXR5Q2h1bmtzLmRlbGV0ZShrZXkpO1xuICB9XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwZXJzaXN0ZW5jZSAvIGF1dGhvcml0eSBib3VuZGFyeSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWFuaWZlc3Qge1xuICBzY2hlbWE6IDE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgcGFyYW1zSGFzaDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBmbnYxYSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgaCA9IDB4ODExYzlkYzU7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGggXj0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIGggPSBNYXRoLmltdWwoaCwgMHgwMTAwMDE5Myk7XG4gIH1cbiAgcmV0dXJuIChoID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkTWFuaWZlc3Qod29ybGQ6IFdvcmxkKTogV29ybGRNYW5pZmVzdCB7XG4gIGNvbnN0IHAgPSB3b3JsZC5wYXJhbXM7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIHNlZWQ6IHdvcmxkLnNlZWQsXG4gICAgZ2VuZXJhdG9yVmVyc2lvbjogcC5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIHNpemU6IHAuc2l6ZSxcbiAgICBjaHVua1NpemU6IHAuY2h1bmtTaXplLFxuICAgIHlNaW46IHAueU1pbixcbiAgICB5TWF4OiBwLnlNYXgsXG4gICAgc2VhTGV2ZWw6IHAuc2VhTGV2ZWwsXG4gICAgcGFyYW1zSGFzaDogZm52MWEoSlNPTi5zdHJpbmdpZnkocCkpLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsRWRpdCB7IGk6IG51bWJlcjsgbTogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBzY2hlbWE6IDE7XG4gIGtleTogc3RyaW5nO1xuICBiYXNlVmVyc2lvbjogbnVtYmVyO1xuICBlZGl0czogVm94ZWxFZGl0W107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBDaHVua0RlbHRhIHtcbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAga2V5LFxuICAgIGJhc2VWZXJzaW9uOiB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBlZGl0czogZWRpdHMgPyBbLi4uZWRpdHMuZW50cmllcygpXS5tYXAoKFtpLCBtXSkgPT4gKHsgaSwgbSB9KSkuc29ydCgoYSwgYikgPT4gYS5pIC0gYi5pKSA6IFtdLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwgZGVsdGE6IENodW5rRGVsdGEpOiB2b2lkIHtcbiAgY29uc3QgW2N4LCBjel0gPSBkZWx0YS5rZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgZm9yIChjb25zdCBlIG9mIGRlbHRhLmVkaXRzKSB7XG4gICAgY29uc3QgeUluZGV4ID0gTWF0aC5mbG9vcihlLmkgLyBDSFVOS19BUkVBKTtcbiAgICBjb25zdCByZW0gPSBlLmkgJSBDSFVOS19BUkVBO1xuICAgIGNvbnN0IGx6ID0gTWF0aC5mbG9vcihyZW0gLyBDSFVOS19TSVpFKTtcbiAgICBjb25zdCBseCA9IHJlbSAlIENIVU5LX1NJWkU7XG4gICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseDtcbiAgICBjb25zdCB5ID0gWV9NSU4gKyB5SW5kZXg7XG4gICAgY29uc3QgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICBzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgZS5tIGFzIE1hdElkKTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIHRpbWUgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBUaW1lU3RhdGUgeyB0OiBudW1iZXI7IGRheUxlbmd0aFNlYzogbnVtYmVyOyBwYXVzZWQ6IGJvb2xlYW47IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkdmFuY2VUaW1lKHM6IFRpbWVTdGF0ZSwgZHQ6IG51bWJlcik6IHZvaWQge1xuICBpZiAocy5wYXVzZWQpIHJldHVybjtcbiAgcy50ID0gKHMudCArIGR0IC8gcy5kYXlMZW5ndGhTZWMpICUgMTtcbn1cbiIsICIvLyBUZXJyYWluIHF1ZXJ5IGxheWVyIFx1MjAxNCBwdXJlIHNpbXVsYXRpb24sIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAyIFN5c3RlbSAxOiBvbmUgc2hhcmVkLCBjYWNoZWQgY29udHJhY3QgZm9yIGNvbnN0cnVjdGlvbiwgZmFybWluZyxcbi8vIG1vdmVtZW50LCBuYXZpZ2F0aW9uIGFuZCB0aGUgQUkgYWdlbnQuIFRoZXNlIHF1ZXJpZXMgZGVzY3JpYmUgdGhlXG4vLyBhdXRob3JpdGF0aXZlIHZveGVsIHZvbHVtZTsgdGhleSBuZXZlciBtdXRhdGUgaXQgYW5kIG5ldmVyIGNyZWF0ZSBhIHNlY29uZFxuLy8gdGVycmFpbiByZXByZXNlbnRhdGlvbi5cbi8vXG4vLyBDb252ZW50aW9uczpcbi8vICAgKiB4L3ogYXJlIGludGVnZXIgY29sdW1uIGNvb3JkaW5hdGVzIGluIFstMTAyNCwgMTAyNCkuXG4vLyAgICogeSBpcyBhbiBpbnRlZ2VyIHZveGVsIGNvb3JkaW5hdGUgaW4gWy0xNiwgMTEyKS5cbi8vICAgKiBzdXJmYWNlWSBpcyB0aGUgZXhwb3NlZCB0b3AgZmFjZSAodG9wU29saWQgKyAxKSwgbWF0Y2hpbmcgTTAwMS5cbi8vICAgKiBBIHJlY3QgaXMgaW5jbHVzaXZlIG9uIGFsbCBmb3VyIGVkZ2VzLlxuaW1wb3J0IHtcbiAgV29ybGQsIE1hdElkLCBNQVQsIFNFQV9MRVZFTCwgWV9NSU4sIFlfTUFYLCBIQUxGLFxuICBzdXJmYWNlQXQsIHRvcE1hdGVyaWFsQXRXb3JsZCwgZ2V0Vm94ZWwsIGlzU29saWQsXG4gIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBBY3RpdmVFbnRpdHlLaW5kLCBFbnRpdHlLaW5kLCBpc1JldGlyZWRTdG9uZUtpbmQsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcblxuZXhwb3J0IGludGVyZmFjZSBSZWN0IHtcbiAgeDA6IG51bWJlcjtcbiAgejA6IG51bWJlcjtcbiAgeDE6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbFJlZ2lvbiBleHRlbmRzIFJlY3Qge1xuICB5MDogbnVtYmVyO1xuICB5MTogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplUmVjdChyZWN0OiBSZWN0KTogUmVjdCB7XG4gIHJldHVybiB7XG4gICAgeDA6IE1hdGgubWluKHJlY3QueDAsIHJlY3QueDEpLFxuICAgIHowOiBNYXRoLm1pbihyZWN0LnowLCByZWN0LnoxKSxcbiAgICB4MTogTWF0aC5tYXgocmVjdC54MCwgcmVjdC54MSksXG4gICAgejE6IE1hdGgubWF4KHJlY3QuejAsIHJlY3QuejEpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdENvbHVtbnMocmVjdDogUmVjdCk6IG51bWJlciB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICByZXR1cm4gKHIueDEgLSByLngwICsgMSkgKiAoci56MSAtIHIuejAgKyAxKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RDb250YWlucyhyZWN0OiBSZWN0LCB4OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4geCA+PSByZWN0LngwICYmIHggPD0gcmVjdC54MSAmJiB6ID49IHJlY3QuejAgJiYgeiA8PSByZWN0LnoxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwYW5kUmVjdChyZWN0OiBSZWN0LCBhbW91bnQ6IG51bWJlcik6IFJlY3Qge1xuICByZXR1cm4ge1xuICAgIHgwOiByZWN0LngwIC0gYW1vdW50LFxuICAgIHowOiByZWN0LnowIC0gYW1vdW50LFxuICAgIHgxOiByZWN0LngxICsgYW1vdW50LFxuICAgIHoxOiByZWN0LnoxICsgYW1vdW50LFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdFRvUmVnaW9uKHJlY3Q6IFJlY3QsIHkwID0gWV9NSU4sIHkxID0gWV9NQVggLSAxKTogVm94ZWxSZWdpb24ge1xuICByZXR1cm4geyAuLi5ub3JtYWxpemVSZWN0KHJlY3QpLCB5MCwgeTEgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lvbnNPdmVybGFwKGE6IFZveGVsUmVnaW9uLCBiOiBWb3hlbFJlZ2lvbik6IGJvb2xlYW4ge1xuICByZXR1cm4gYS54MCA8PSBiLngxICYmIGEueDEgPj0gYi54MCAmJiBhLnowIDw9IGIuejEgJiYgYS56MSA+PSBiLnowXG4gICAgJiYgYS55MCA8PSBiLnkxICYmIGEueTEgPj0gYi55MDtcbn1cblxuLyoqIEluY2x1c2l2ZSBjb250YWlubWVudCBvZiBhIHZveGVsIGluIGEgd29yayBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbnZlbG9wZUNvbnRhaW5zKHJlY3RzOiByZWFkb25seSBWb3hlbFJlZ2lvbltdLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGZvciAoY29uc3QgciBvZiByZWN0cykge1xuICAgIGlmICh4ID49IHIueDAgJiYgeCA8PSByLngxICYmIHkgPj0gci55MCAmJiB5IDw9IHIueTEgJiYgeiA+PSByLnowICYmIHogPD0gci56MSkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRlcnJhaW5Db2x1bW4ge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgLyoqIEV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbjsgdGhlIGZpcnN0IGFpciBjZWxsIGFib3ZlIGl0LiAqL1xuICBzdXJmYWNlWTogbnVtYmVyO1xuICAvKiogVGhlIGhpZ2hlc3Qgc29saWQgdm94ZWwsIG9yIFlfTUlOIC0gMSBpZiB0aGUgY29sdW1uIGhhcyBubyBzb2xpZC4gKi9cbiAgdG9wU29saWRZOiBudW1iZXI7XG4gIHRvcE1hdGVyaWFsOiBNYXRJZDtcbiAgc29saWQ6IGJvb2xlYW47XG4gIC8qKiBXYXRlciBhYm92ZSB0aGUgc29saWQgc3VyZmFjZSwgdXAgdG8gc2VhIGxldmVsLiAwIG9uIGRyeSBsYW5kLiAqL1xuICB3YXRlckRlcHRoOiBudW1iZXI7XG4gIHVuZGVyd2F0ZXI6IGJvb2xlYW47XG4gIC8qKiBMYXJnZXN0IDQtbmVpZ2hib3VyIHN1cmZhY2Ugc3RlcCBpbiBtZXRyZXMgKDEgPSBhIHNpbmdsZSB2b3hlbCByaXNlcikuICovXG4gIHNsb3BlOiBudW1iZXI7XG4gIC8qKiBGcmVlIGFpciBjZWxscyBhYm92ZSB0aGUgc3VyZmFjZSwgY2FwcGVkIGF0IENMRUFSQU5DRV9QUk9CRS4gKi9cbiAgY2xlYXJhbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBDTEVBUkFOQ0VfUFJPQkUgPSA4O1xuXG5mdW5jdGlvbiBzdXJmYWNlQXRTYWZlKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGZhbGxiYWNrOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsbGJhY2s7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG4vKiogV2F0ZXIgZGVwdGggdGhhdCByZXNwZWN0cyBhIGRyeSBwaXQgYmVsb3cgc2VhIGxldmVsICh1bmxpa2UgaGVpZ2h0IGFsb25lKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXRDb2x1bW4od29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoc3VyZmFjZSA+PSBTRUFfTEVWRUwpIHJldHVybiAwO1xuICBpZiAoZ2V0Vm94ZWwod29ybGQsIHgsIFNFQV9MRVZFTCAtIDEsIHopICE9PSBNQVQuV0FURVIpIHJldHVybiAwO1xuICByZXR1cm4gU0VBX0xFVkVMIC0gc3VyZmFjZTtcbn1cblxuLyoqIFRydWUgd2hlbiBgaGVpZ2h0YCBhaXIgY2VsbHMgYWJvdmUgdGhlIHN1cmZhY2UgYXJlIGZyZWUgb2Ygc29saWQgb3Igd2F0ZXIuICovXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJhbmNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaGVpZ2h0OyBpKyspIHtcbiAgICBpZiAoZ2V0Vm94ZWwod29ybGQsIHgsIHN1cmZhY2UgKyBpLCB6KSAhPT0gTUFULkFJUikgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29sdW1uQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFRlcnJhaW5Db2x1bW4ge1xuICBjb25zdCBjeCA9IE1hdGguZmxvb3IoeCksIGN6ID0gTWF0aC5mbG9vcih6KTtcbiAgY29uc3Qgc3VyZmFjZVkgPSBzdXJmYWNlQXQod29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHRvcE1hdGVyaWFsID0gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCBzb2xpZCA9IHN1cmZhY2VZID4gWV9NSU4gJiYgaXNTb2xpZCh0b3BNYXRlcmlhbCk7XG4gIGNvbnN0IHdhdGVyRGVwdGggPSB3YXRlckRlcHRoQXRDb2x1bW4od29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCAtIDEsIGN6LCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3ggKyAxLCBjeiwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4LCBjeiAtIDEsIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCwgY3ogKyAxLCBzdXJmYWNlWSkpLFxuICApO1xuICBsZXQgY2xlYXJhbmNlID0gMDtcbiAgd2hpbGUgKGNsZWFyYW5jZSA8IENMRUFSQU5DRV9QUk9CRSAmJiBnZXRWb3hlbCh3b3JsZCwgY3gsIHN1cmZhY2VZICsgY2xlYXJhbmNlLCBjeikgPT09IE1BVC5BSVIpIHtcbiAgICBjbGVhcmFuY2UrKztcbiAgfVxuICByZXR1cm4ge1xuICAgIHg6IGN4LCB6OiBjeiwgc3VyZmFjZVksIHRvcFNvbGlkWTogc3VyZmFjZVkgLSAxLCB0b3BNYXRlcmlhbCxcbiAgICBzb2xpZCwgd2F0ZXJEZXB0aCwgdW5kZXJ3YXRlcjogd2F0ZXJEZXB0aCA+IDAsIHNsb3BlLCBjbGVhcmFuY2UsXG4gIH07XG59XG5cbi8vIEVudGl0eSBmb290cHJpbnRzIGFyZSBkZWxpYmVyYXRlbHkgZXhwbGljaXQuIEEgdHJlZSBvY2N1cGllcyBtb3JlIHNpdGUgdGhhblxuLy8gaXRzIHRydW5rOyBhIHBlYmJsZSBvY2N1cGllcyBsZXNzIHRoYW4gYSBib3VsZGVyLiBUaGVzZSBhcmUgc2ltdWxhdGlvblxuLy8gY2xlYXJhbmNlIHJhZGlpLCBub3QgcmVuZGVyIGJvdW5kcy5cbmV4cG9ydCBjb25zdCBPQlNUUlVDVElPTl9SQURJVVM6IFJlY29yZDxBY3RpdmVFbnRpdHlLaW5kLCBudW1iZXI+ID0ge1xuICBzdHlsX3RyZWVfc3BpcmU6IDEuNSxcbiAgc3R5bF90cmVlX3RhYmxlOiAxLjgsXG4gIHN0eWxfdHJlZV9jbHVzdGVyOiAxLjksXG4gIHN0eWxfdHJlZV9ibG9zc29tOiAxLjYsXG4gIHN0eWxfc2hydWI6IDAuNixcbiAgc3R5bF9vcmU6IDAuOSxcbiAgc3R5bF9jYWlybjogMC44LFxuICB3YXlzdG9uZTogMS40LFxuICBtYXJrZXI6IDAuNSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgT2JzdHJ1Y3Rpb24ge1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcmFkaXVzOiBudW1iZXI7XG4gIC8qKiBGb290cHJpbnQgY2VsbHMgb3ZlcmxhcHBlZCBieSB0aGlzIGVudGl0eS4gKi9cbiAgY2VsbHM6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZW50aXR5Q2h1bmtzRm9yUmVjdCh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAvLyBBIHJlY3Qgb3ducyB3aG9sZSB2b3hlbCBjZWxscy4gSW5jbHVkZSBldmVyeSBjaHVuayB3aG9zZSByb290IGNvdWxkIG92ZXJsYXBcbiAgLy8gdGhvc2UgY2VsbHMsIHdpdGhvdXQgc2Nhbm5pbmcgdGhlIGVudGlyZSAyMDQ4IG0gd29ybGQuXG4gIGNvbnN0IHJhZGl1cyA9IE1hdGgubWF4KC4uLk9iamVjdC52YWx1ZXMoT0JTVFJVQ1RJT05fUkFESVVTKSwgMS41KTtcbiAgY29uc3QgbWluQ2VsbFggPSBNYXRoLmZsb29yKHIueDAgKyAwLjUgLSByYWRpdXMpO1xuICBjb25zdCBtYXhDZWxsWCA9IE1hdGguY2VpbChyLngxICsgMC41ICsgcmFkaXVzKSAtIDE7XG4gIGNvbnN0IG1pbkNlbGxaID0gTWF0aC5mbG9vcihyLnowICsgMC41IC0gcmFkaXVzKTtcbiAgY29uc3QgbWF4Q2VsbFogPSBNYXRoLmNlaWwoci56MSArIDAuNSArIHJhZGl1cykgLSAxO1xuICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjeDAgPSBNYXRoLm1heCgwLCB3b3JsZFRvQ2h1bmtYKG1pbkNlbGxYKSksIGN4MSA9IHdvcmxkVG9DaHVua1gobWF4Q2VsbFgpO1xuICBjb25zdCBjejAgPSBNYXRoLm1heCgwLCB3b3JsZFRvQ2h1bmtaKG1pbkNlbGxaKSksIGN6MSA9IHdvcmxkVG9DaHVua1oobWF4Q2VsbFopO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICB9XG4gIHJldHVybiBrZXlzO1xufVxuXG4vKiogRW50aXRpZXMgd2hvc2Ugc2ltdWxhdGlvbiBmb290cHJpbnQgb3ZlcmxhcHMgdGhlIHJlY3QuICovXG5leHBvcnQgZnVuY3Rpb24gb2JzdHJ1Y3Rpb25zSW4od29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0KTogT2JzdHJ1Y3Rpb25bXSB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IG91dDogT2JzdHJ1Y3Rpb25bXSA9IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBlbnRpdHlDaHVua3NGb3JSZWN0KHdvcmxkLCByKSkge1xuICAgIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWlkcykgY29udGludWU7XG4gICAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICAgIGlmIChzZWVuLmhhcyhpZCkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSBjb250aW51ZTtcbiAgICAgIHNlZW4uYWRkKGlkKTtcbiAgICAgIGNvbnN0IHJhZGl1cyA9IGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpXG4gICAgICAgID8gZS5raW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDAuNiA6IGUua2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gMS4xIDogMS41XG4gICAgICAgIDogT0JTVFJVQ1RJT05fUkFESVVTW2Uua2luZCBhcyBBY3RpdmVFbnRpdHlLaW5kXTtcbiAgICAgIGxldCBjZWxscyA9IDA7XG4gICAgICBjb25zdCBleDAgPSBNYXRoLm1heChyLngwLCBNYXRoLmZsb29yKGUueCAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXgxID0gTWF0aC5taW4oci54MSwgTWF0aC5jZWlsKGUueCArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXowID0gTWF0aC5tYXgoci56MCwgTWF0aC5mbG9vcihlLnogLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MSA9IE1hdGgubWluKHIuejEsIE1hdGguY2VpbChlLnogKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGZvciAobGV0IHogPSBlejA7IHogPD0gZXoxOyB6KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IGV4MDsgeCA8PSBleDE7IHgrKykge1xuICAgICAgICAgIGlmIChNYXRoLmh5cG90KGUueCAtICh4ICsgMC41KSwgZS56IC0gKHogKyAwLjUpKSA8PSByYWRpdXMpIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjZWxscyA+IDApIHtcbiAgICAgICAgb3V0LnB1c2goeyBlbnRpdHlJZDogZS5pZCwga2luZDogZS5raW5kLCB4OiBlLngsIHo6IGUueiwgcmFkaXVzLCBjZWxscyB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgb3V0LnNvcnQoKGEsIGIpID0+IChhLmVudGl0eUlkIDwgYi5lbnRpdHlJZCA/IC0xIDogYS5lbnRpdHlJZCA+IGIuZW50aXR5SWQgPyAxIDogMCkpO1xuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFyZWFTdGF0cyB7XG4gIHJlY3Q6IFJlY3Q7XG4gIGNvbHVtbnM6IG51bWJlcjtcbiAgbWluWTogbnVtYmVyO1xuICBtYXhZOiBudW1iZXI7XG4gIG1lYW5ZOiBudW1iZXI7XG4gIHJlbGllZjogbnVtYmVyO1xuICBtYXhTdGVwOiBudW1iZXI7XG4gIHdhdGVyQ29sdW1uczogbnVtYmVyO1xuICBzdG9uZUNvbHVtbnM6IG51bWJlcjtcbiAgbWF0ZXJpYWxzOiBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+O1xuICBvYnN0cnVjdGlvbnM6IE9ic3RydWN0aW9uW107XG4gIG9ic3RydWN0ZWRDb2x1bW5zOiBudW1iZXI7XG4gIC8qKiBDdXQvZmlsbCByZWxhdGl2ZSB0byBmbG9vclkgd2hlbiBzdXBwbGllZCwgb3RoZXJ3aXNlIDAuICovXG4gIGZsb29yWTogbnVtYmVyIHwgbnVsbDtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXBwb3J0U3VtbWFyeSB7XG4gIHRvdGFsOiBudW1iZXI7XG4gIGxldmVsOiBudW1iZXI7XG4gIGN1dDogbnVtYmVyO1xuICBmaWxsOiBudW1iZXI7XG4gIHdhdGVyOiBudW1iZXI7XG4gIC8qKiBGaWxsIGRlZXBlciB0aGFuIDggbTsgYSB2YWxpZGF0b3IgbWF5IHJlamVjdCB0aGVzZSBhcyB1bnN1cHBvcnRlZC4gKi9cbiAgZGVlcEZpbGw6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGb290cHJpbnRRdWVyeSB7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBzdGF0czogQXJlYVN0YXRzO1xuICBzdXBwb3J0OiBTdXBwb3J0U3VtbWFyeTtcbiAgb2JzdHJ1Y3Rpb25zOiBPYnN0cnVjdGlvbltdO1xuICAvKiogQ2VsbHMgaW4gdGhlIGJ1aWxkaW5nIHZvbHVtZSBhYm92ZSB0aGUgcHJlcGFyZWQgZmxvb3IgdGhhdCBhcmUgbm90IGFpci4gKi9cbiAgb3ZlcmhhbmdDZWxsczogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyBtYXRlcmlhbDogTWF0SWQgfT47XG59XG5cbi8qKlxuICogQ2FjaGVkIHF1ZXJ5IGNvbnRleHQuIENhY2hlcyBhcmUga2V5ZWQgb24gd29ybGQucmV2aXNpb246IGEgdm94ZWwgb3IgZW50aXR5XG4gKiBlZGl0IGludmFsaWRhdGVzIHRoZW0sIHdoaWxlIG1lc2gvbmF2IHJlYnVpbGRzIGRvIG5vdC4gVXNlIG9uZSBjb250ZXh0IGZvciBhXG4gKiBzaXRlIHNlYXJjaCBvciBhIGZvb3RwcmludCBldmFsdWF0aW9uLCB0aGVuIGRpc2NhcmQgaXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXJyYWluUXVlcnkge1xuICBwcml2YXRlIGNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFRlcnJhaW5Db2x1bW4+KCk7XG4gIHByaXZhdGUgb2JzdHJ1Y3Rpb25DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBPYnN0cnVjdGlvbltdPigpO1xuICBwcml2YXRlIHJldmlzaW9uOiBudW1iZXI7XG5cbiAgY29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHdvcmxkOiBXb3JsZCkge1xuICAgIHRoaXMucmV2aXNpb24gPSB3b3JsZC5yZXZpc2lvbjtcbiAgfVxuXG4gIHByaXZhdGUgc3luYygpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5yZXZpc2lvbiAhPT0gdGhpcy53b3JsZC5yZXZpc2lvbikge1xuICAgICAgdGhpcy5jYWNoZS5jbGVhcigpO1xuICAgICAgdGhpcy5vYnN0cnVjdGlvbkNhY2hlLmNsZWFyKCk7XG4gICAgICB0aGlzLnJldmlzaW9uID0gdGhpcy53b3JsZC5yZXZpc2lvbjtcbiAgICB9XG4gIH1cblxuICAvKiogQ2FjaGVkIGVudGl0eSBvYnN0cnVjdGlvbnMgZm9yIG9uZSBmb290cHJpbnQuICovXG4gIG9ic3RydWN0aW9uc0ZvcihyZWN0OiBSZWN0KTogT2JzdHJ1Y3Rpb25bXSB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgY29uc3Qga2V5ID0gYCR7ci54MH0sJHtyLnowfSwke3IueDF9LCR7ci56MX1gO1xuICAgIGxldCBsaXN0ID0gdGhpcy5vYnN0cnVjdGlvbkNhY2hlLmdldChrZXkpO1xuICAgIGlmICghbGlzdCkge1xuICAgICAgbGlzdCA9IG9ic3RydWN0aW9uc0luKHRoaXMud29ybGQsIHIpO1xuICAgICAgdGhpcy5vYnN0cnVjdGlvbkNhY2hlLnNldChrZXksIGxpc3QpO1xuICAgIH1cbiAgICByZXR1cm4gbGlzdDtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFRlcnJhaW5Db2x1bW4ge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICAgIGNvbnN0IGtleSA9IGAke2N4fSwke2N6fWA7XG4gICAgbGV0IGNvbCA9IHRoaXMuY2FjaGUuZ2V0KGtleSk7XG4gICAgaWYgKCFjb2wpIHtcbiAgICAgIGNvbCA9IGNvbHVtbkF0KHRoaXMud29ybGQsIGN4LCBjeik7XG4gICAgICB0aGlzLmNhY2hlLnNldChrZXksIGNvbCk7XG4gICAgfVxuICAgIHJldHVybiBjb2w7XG4gIH1cblxuICBhcmVhKHJlY3Q6IFJlY3QsIGZsb29yWT86IG51bWJlcik6IEFyZWFTdGF0cyB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgbGV0IG1pblkgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gICAgbGV0IG1heFkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gICAgbGV0IHN1bSA9IDA7XG4gICAgbGV0IG1heFN0ZXAgPSAwO1xuICAgIGxldCB3YXRlckNvbHVtbnMgPSAwO1xuICAgIGxldCBzdG9uZUNvbHVtbnMgPSAwO1xuICAgIGxldCBjdXRWb2x1bWUgPSAwO1xuICAgIGxldCBmaWxsVm9sdW1lID0gMDtcbiAgICBsZXQgbWF4Q3V0ID0gMDtcbiAgICBsZXQgbWF4RmlsbCA9IDA7XG4gICAgY29uc3QgbWF0ZXJpYWxzOiBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+ID0ge307XG5cbiAgICBmb3IgKGxldCB6ID0gci56MDsgeiA8PSByLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByLngwOyB4IDw9IHIueDE7IHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSB0aGlzLmNvbHVtbih4LCB6KTtcbiAgICAgICAgbWluWSA9IE1hdGgubWluKG1pblksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIG1heFkgPSBNYXRoLm1heChtYXhZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBzdW0gKz0gY29sLnN1cmZhY2VZO1xuICAgICAgICBtYXhTdGVwID0gTWF0aC5tYXgobWF4U3RlcCwgY29sLnNsb3BlKTtcbiAgICAgICAgaWYgKGNvbC53YXRlckRlcHRoID4gMCkgd2F0ZXJDb2x1bW5zKys7XG4gICAgICAgIGlmIChjb2wudG9wTWF0ZXJpYWwgPT09IE1BVC5TVE9ORSkgc3RvbmVDb2x1bW5zKys7XG4gICAgICAgIG1hdGVyaWFsc1tjb2wudG9wTWF0ZXJpYWxdID0gKG1hdGVyaWFsc1tjb2wudG9wTWF0ZXJpYWxdID8/IDApICsgMTtcbiAgICAgICAgaWYgKGZsb29yWSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgY29uc3QgZHkgPSBjb2wuc3VyZmFjZVkgLSBmbG9vclk7XG4gICAgICAgICAgaWYgKGR5ID4gMCkge1xuICAgICAgICAgICAgY3V0Vm9sdW1lICs9IGR5O1xuICAgICAgICAgICAgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkeSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChkeSA8IDApIHtcbiAgICAgICAgICAgIGZpbGxWb2x1bWUgKz0gLWR5O1xuICAgICAgICAgICAgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIC1keSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gdGhpcy5vYnN0cnVjdGlvbnNGb3Iocik7XG4gICAgY29uc3Qgb2JzdHJ1Y3RlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgbyBvZiBvYnN0cnVjdGlvbnMpIHtcbiAgICAgIGNvbnN0IHJhZGl1cyA9IG8ucmFkaXVzO1xuICAgICAgY29uc3QgZXgwID0gTWF0aC5tYXgoci54MCwgTWF0aC5mbG9vcihvLnggLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV4MSA9IE1hdGgubWluKHIueDEsIE1hdGguY2VpbChvLnggKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MCA9IE1hdGgubWF4KHIuejAsIE1hdGguZmxvb3Ioby56IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejEgPSBNYXRoLm1pbihyLnoxLCBNYXRoLmNlaWwoby56ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBmb3IgKGxldCB6ID0gZXowOyB6IDw9IGV6MTsgeisrKSB7XG4gICAgICAgIGZvciAobGV0IHggPSBleDA7IHggPD0gZXgxOyB4KyspIHtcbiAgICAgICAgICBpZiAoTWF0aC5oeXBvdChvLnggLSAoeCArIDAuNSksIG8ueiAtICh6ICsgMC41KSkgPD0gcmFkaXVzKSBvYnN0cnVjdGVkLmFkZChgJHt4fSwke3p9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBjb2x1bW5zID0gKHIueDEgLSByLngwICsgMSkgKiAoci56MSAtIHIuejAgKyAxKTtcbiAgICByZXR1cm4ge1xuICAgICAgcmVjdDogcixcbiAgICAgIGNvbHVtbnMsXG4gICAgICBtaW5ZLCBtYXhZLFxuICAgICAgbWVhblk6IE1hdGgucm91bmQoKHN1bSAvIGNvbHVtbnMpICogMTAwMCkgLyAxMDAwLFxuICAgICAgcmVsaWVmOiBtYXhZIC0gbWluWSxcbiAgICAgIG1heFN0ZXAsXG4gICAgICB3YXRlckNvbHVtbnMsXG4gICAgICBzdG9uZUNvbHVtbnMsXG4gICAgICBtYXRlcmlhbHMsXG4gICAgICBvYnN0cnVjdGlvbnMsXG4gICAgICBvYnN0cnVjdGVkQ29sdW1uczogb2JzdHJ1Y3RlZC5zaXplLFxuICAgICAgZmxvb3JZOiBmbG9vclkgPz8gbnVsbCxcbiAgICAgIGN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQsXG4gICAgICBtYXhGaWxsLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogRXZhbHVhdGUgYSBjb21wbGV0ZSBidWlsZGluZyBmb290cHJpbnQuIGBmbG9vcllgIGlzIHRoZSBwcmVwYXJlZCB3YWxraW5nXG4gICAqIGZsb29yOiB0ZXJyYWluIGFib3ZlIGl0IGlzIGN1dCwgdGVycmFpbiBiZWxvdyBpdCBpcyBmaWxsZWQuIFRoZSByZXN1bHQgaXNcbiAgICogcmF3IHNpdGUgZGF0YTsgY29uc3RydWN0aW9uIHJ1bGVzIGxpdmUgaW4gY29uc3RydWN0aW9uLnRzLlxuICAgKi9cbiAgZm9vdHByaW50KHJlY3Q6IFJlY3QsIGZsb29yWTogbnVtYmVyKTogRm9vdHByaW50UXVlcnkge1xuICAgIGNvbnN0IHN0YXRzID0gdGhpcy5hcmVhKHJlY3QsIGZsb29yWSk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgY29uc3Qgc3VwcG9ydDogU3VwcG9ydFN1bW1hcnkgPSB7XG4gICAgICB0b3RhbDogc3RhdHMuY29sdW1ucywgbGV2ZWw6IDAsIGN1dDogMCwgZmlsbDogMCwgd2F0ZXI6IDAsIGRlZXBGaWxsOiAwLFxuICAgICAgbWF4Q3V0OiAwLCBtYXhGaWxsOiAwLCBjdXRWb2x1bWU6IDAsIGZpbGxWb2x1bWU6IDAsXG4gICAgfTtcbiAgICBjb25zdCBvdmVyaGFuZ0NlbGxzOiBGb290cHJpbnRRdWVyeVsnb3ZlcmhhbmdDZWxscyddID0gW107XG5cbiAgICBmb3IgKGxldCB6ID0gci56MDsgeiA8PSByLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByLngwOyB4IDw9IHIueDE7IHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSB0aGlzLmNvbHVtbih4LCB6KTtcbiAgICAgICAgY29uc3QgZHkgPSBjb2wuc3VyZmFjZVkgLSBmbG9vclk7XG4gICAgICAgIGlmIChkeSA+IDApIHtcbiAgICAgICAgICBzdXBwb3J0LmN1dCsrO1xuICAgICAgICAgIHN1cHBvcnQuY3V0Vm9sdW1lICs9IGR5O1xuICAgICAgICAgIHN1cHBvcnQubWF4Q3V0ID0gTWF0aC5tYXgoc3VwcG9ydC5tYXhDdXQsIGR5KTtcbiAgICAgICAgfSBlbHNlIGlmIChkeSA8IDApIHtcbiAgICAgICAgICBzdXBwb3J0LmZpbGwrKztcbiAgICAgICAgICBzdXBwb3J0LmZpbGxWb2x1bWUgKz0gLWR5O1xuICAgICAgICAgIHN1cHBvcnQubWF4RmlsbCA9IE1hdGgubWF4KHN1cHBvcnQubWF4RmlsbCwgLWR5KTtcbiAgICAgICAgICBpZiAoLWR5ID4gOCkgc3VwcG9ydC5kZWVwRmlsbCsrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN1cHBvcnQubGV2ZWwrKztcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29sLndhdGVyRGVwdGggPiAwKSBzdXBwb3J0LndhdGVyKys7XG5cbiAgICAgICAgLy8gQW4gb3ZlcmhhbmcgaXMgdGVycmFpbiBhYm92ZSB0aGUgZmxvb3IgdGhhdCBzdXJ2aXZlcyB0aGUgY3V0IHBsYW5lLlxuICAgICAgICAvLyBGb3IgYSBjb2x1bW4gYmVsb3cgdGhlIGZsb29yLCBpdHMgc29saWQgYm9keSBpcyBmaWxsLCBub3Qgb3ZlcmhhbmcuXG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gTWF0aC5tYXgoZmxvb3JZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPCBzdGFydCArIDQ7IHkrKykge1xuICAgICAgICAgIGNvbnN0IG0gPSBnZXRWb3hlbCh0aGlzLndvcmxkLCB4LCB5LCB6KSBhcyBNYXRJZDtcbiAgICAgICAgICBpZiAobSAhPT0gTUFULkFJUikgb3ZlcmhhbmdDZWxscy5wdXNoKHsgeCwgeSwgeiwgbWF0ZXJpYWw6IG0gfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyByZWN0OiByLCBmbG9vclksIHN0YXRzLCBzdXBwb3J0LCBvYnN0cnVjdGlvbnM6IHN0YXRzLm9ic3RydWN0aW9ucywgb3ZlcmhhbmdDZWxscyB9O1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gbW92ZW1lbnQgY29udHJhY3QgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXYWxrUGFyYW1zIHtcbiAgbWF4U3RlcFVwOiBudW1iZXI7XG4gIG1heFN0ZXBEb3duOiBudW1iZXI7XG4gIG1heFdhdGVyRGVwdGg6IG51bWJlcjtcbiAgLyoqIE1heGltdW0gYWRqYWNlbnQgc3VyZmFjZSBzdGVwOyAxLjAgaXMgYSA0NSBkZWdyZWUgdm94ZWwgcmlzZXIuICovXG4gIG1heFNsb3BlOiBudW1iZXI7XG4gIGNsZWFyYW5jZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9XQUxLOiBXYWxrUGFyYW1zID0ge1xuICBtYXhTdGVwVXA6IDEuMCxcbiAgbWF4U3RlcERvd246IDEuNSxcbiAgbWF4V2F0ZXJEZXB0aDogMC40LFxuICBtYXhTbG9wZTogMS4wLFxuICBjbGVhcmFuY2U6IDIuMCxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2Fsa1Jlc3VsdCB7XG4gIG9rOiBib29sZWFuO1xuICByZWFzb246ICdvaycgfCAnbm90X2FkamFjZW50JyB8ICdzdGVwX3VwJyB8ICdmYWxsJyB8ICd3YXRlcicgfCAnc2xvcGUnIHwgJ2NsZWFyYW5jZSc7XG4gIHN0ZXA6IG51bWJlcjtcbiAgd2F0ZXJEZXB0aDogbnVtYmVyO1xufVxuXG4vKiogRXZhbHVhdGUgb25lIGdyaWQgc3RlcC4gUGF0aHMgYXJlIHZhbGlkYXRlZCB3aXRoIHRoZSBzYW1lIGNvbnRyYWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhbGtTdGVwKFxuICB3b3JsZDogV29ybGQsIGZyb21YOiBudW1iZXIsIGZyb21aOiBudW1iZXIsIHRvWDogbnVtYmVyLCB0b1o6IG51bWJlcixcbiAgcGFyYW1zOiBXYWxrUGFyYW1zID0gREVGQVVMVF9XQUxLLFxuKTogV2Fsa1Jlc3VsdCB7XG4gIGNvbnN0IGR4ID0gTWF0aC5hYnMoTWF0aC5mbG9vcih0b1gpIC0gTWF0aC5mbG9vcihmcm9tWCkpO1xuICBjb25zdCBkeiA9IE1hdGguYWJzKE1hdGguZmxvb3IodG9aKSAtIE1hdGguZmxvb3IoZnJvbVopKTtcbiAgaWYgKGR4ICsgZHogIT09IDEpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ25vdF9hZGphY2VudCcsIHN0ZXA6IDAsIHdhdGVyRGVwdGg6IDAgfTtcbiAgfVxuICBjb25zdCBmcm9tID0gY29sdW1uQXQod29ybGQsIGZyb21YLCBmcm9tWik7XG4gIGNvbnN0IHRvID0gY29sdW1uQXQod29ybGQsIHRvWCwgdG9aKTtcbiAgY29uc3Qgc3RlcCA9IHRvLnN1cmZhY2VZIC0gZnJvbS5zdXJmYWNlWTtcbiAgaWYgKHN0ZXAgPiBwYXJhbXMubWF4U3RlcFVwKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3N0ZXBfdXAnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICgtc3RlcCA+IHBhcmFtcy5tYXhTdGVwRG93bikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdmYWxsJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAodG8ud2F0ZXJEZXB0aCA+IHBhcmFtcy5tYXhXYXRlckRlcHRoKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3dhdGVyJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAodG8uc2xvcGUgPiBwYXJhbXMubWF4U2xvcGUpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc2xvcGUnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICghY2xlYXJhbmNlQXQod29ybGQsIHRvWCwgdG9aLCBwYXJhbXMuY2xlYXJhbmNlKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnY2xlYXJhbmNlJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICB9XG4gIHJldHVybiB7IG9rOiB0cnVlLCByZWFzb246ICdvaycsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbn1cblxuLyoqIEVmZmVjdGl2ZSBncmFkZSBvZiBhIHN0cmFpZ2h0IHBhdGggc2VnbWVudCwgdXNlZCBieSBwYXRoIHZhbGlkYXRpb24uICovXG5leHBvcnQgZnVuY3Rpb24gZWZmZWN0aXZlR3JhZGUod29ybGQ6IFdvcmxkLCB4MDogbnVtYmVyLCB6MDogbnVtYmVyLCB4MTogbnVtYmVyLCB6MTogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgYSA9IGNvbHVtbkF0KHdvcmxkLCB4MCwgejApO1xuICBjb25zdCBiID0gY29sdW1uQXQod29ybGQsIHgxLCB6MSk7XG4gIGNvbnN0IHJ1biA9IE1hdGguaHlwb3QoeDEgLSB4MCwgejEgLSB6MCk7XG4gIGlmIChydW4gPT09IDApIHJldHVybiBNYXRoLmFicyhiLnN1cmZhY2VZIC0gYS5zdXJmYWNlWSk7XG4gIHJldHVybiBNYXRoLmFicyhiLnN1cmZhY2VZIC0gYS5zdXJmYWNlWSkgLyBydW47XG59XG4iLCAiLy8gTTAwMiBzaXRlIHZhbGlkYXRpb24sIGNhbmRpZGF0ZSBzZWFyY2ggYW5kIHByZXZpZXcgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbi5cbi8vXG4vLyBUaGlzIGlzIHRoZSBzaGFyZWQgZ2F0ZSBmb3IgdGhlIHBsYXllciBhbmQgdGhlIEFJIGFnZW50LiBOZWl0aGVyIG1heSBwbGFjZSBhXG4vLyBzdHJ1Y3R1cmUgYnkgYW55IG90aGVyIHBhdGg6IGJvdGggc3VibWl0IGEgU2l0ZVByb3Bvc2FsLCBib3RoIHJlY2VpdmUgdGhlXG4vLyBzYW1lIFNpdGVWYWxpZGF0aW9uLCBhbmQgYm90aCBtdXN0IHBhc3MgdGhlIEF1dGhvcml6ZXIgYmVmb3JlIGV4ZWN1dGlvbi5cbi8vXG4vLyBUaGUgdmFsaWRhdG9yIGRlc2NyaWJlcyB0aGUgc2l0ZSBhcyBpdCBpcy4gSXQgZG9lcyBub3QgZWRpdCB2b3hlbHMsIHJlbW92ZVxuLy8gZW50aXRpZXMgb3Igc3BlbmQgcmVzb3VyY2VzLiBQcmVwYXJhdGlvbiBpcyBhIHNlcGFyYXRlLCBhdXRob3JpemVkIHN0ZXAuXG5pbXBvcnQgeyBXb3JsZCwgSEFMRiwgWV9NSU4sIFlfTUFYLCBzdXJmYWNlQXQgfSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBGb290cHJpbnRRdWVyeSwgVGVycmFpblF1ZXJ5LCBBcmVhU3RhdHMsXG4gIG5vcm1hbGl6ZVJlY3QsIGV4cGFuZFJlY3QsIHJlY3RDb2x1bW5zLCBlZmZlY3RpdmVHcmFkZSwgd2Fsa1N0ZXAsIFdhbGtQYXJhbXMsXG4gIERFRkFVTFRfV0FMSywgY29sdW1uQXQsXG59IGZyb20gJy4vdGVycmFpbic7XG5cbmV4cG9ydCB0eXBlIFNpdGVTdGF0ZSA9ICd2YWxpZCcgfCAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicgfCAnaW52YWxpZCc7XG5cbmV4cG9ydCB0eXBlIFZhbGlkYXRpb25Db2RlID1cbiAgfCAnb3V0X29mX2JvdW5kcydcbiAgfCAnZm9vdHByaW50X21pc21hdGNoJ1xuICB8ICdzbG9wZV9leGNlZWRlZCdcbiAgfCAnc3RlcF9leGNlZWRlZCdcbiAgfCAnY3V0X2V4Y2VlZGVkJ1xuICB8ICdmaWxsX2V4Y2VlZGVkJ1xuICB8ICdjdXRfdm9sdW1lX2V4Y2VlZGVkJ1xuICB8ICdmaWxsX3ZvbHVtZV9leGNlZWRlZCdcbiAgfCAnZm9vdHByaW50X29ic3RydWN0ZWQnXG4gIHwgJ3dhdGVyJ1xuICB8ICdvdmVyaGFuZydcbiAgfCAnbmVlZHNfZ3JhZGluZydcbiAgfCAnbmVlZHNfY2xlYXJpbmcnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZhbGlkYXRpb25SZWFzb24ge1xuICBjb2RlOiBWYWxpZGF0aW9uQ29kZTtcbiAgc2V2ZXJpdHk6ICdlcnJvcicgfCAncHJlcGFyYXRpb24nO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIHZhbHVlPzogbnVtYmVyO1xuICBsaW1pdD86IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgRm91bmRhdGlvblR5cGUgPSAnZ3JhZGVkX3BhZCcgfCAnc3RlcHBlZF9wbGludGgnIHwgJ2RlY2snO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJ1aWxkaW5nUnVsZXMge1xuICBpZDogc3RyaW5nO1xuICB3aWR0aDogbnVtYmVyO1xuICBkZXB0aDogbnVtYmVyO1xuICB3YWxsSGVpZ2h0OiBudW1iZXI7XG4gIGNsZWFyYW5jZTogbnVtYmVyO1xuICAvKiogUmVsaWVmIGF0IG9yIGJlbG93IHRoaXMgbmVlZHMgbm8gZ3JhZGluZyB0byBiZSBjYWxsZWQgdmFsaWQuICovXG4gIG1heFJlbGllZk5vUHJlcDogbnVtYmVyO1xuICAvKiogUmVsaWVmIGFib3ZlIHRoaXMgY2Fubm90IGJlIHByZXBhcmVkIGJ5IHRoaXMgYnVpbGRpbmcgdHlwZS4gKi9cbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IG51bWJlcjtcbiAgbWF4U3RlcDogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBtYXhDdXRWb2x1bWU6IG51bWJlcjtcbiAgbWF4RmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhPYnN0cnVjdGlvbnM6IG51bWJlcjtcbiAgcmVxdWlyZXNEcnk6IGJvb2xlYW47XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25UeXBlO1xufVxuXG5leHBvcnQgY29uc3QgSE9VU0VfUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAnaG91c2UtOHg2JyxcbiAgd2lkdGg6IDgsXG4gIGRlcHRoOiA2LFxuICB3YWxsSGVpZ2h0OiAzLFxuICBjbGVhcmFuY2U6IDMsXG4gIG1heFJlbGllZk5vUHJlcDogMS4yLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNC4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDIsXG4gIG1heEZpbGw6IDIsXG4gIG1heEN1dFZvbHVtZTogNDgsXG4gIG1heEZpbGxWb2x1bWU6IDQ4LFxuICBtYXhPYnN0cnVjdGlvbnM6IDAsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnZ3JhZGVkX3BhZCcsXG59O1xuXG5leHBvcnQgY29uc3QgRkFSTV9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdmYXJtLTEyeDgnLFxuICB3aWR0aDogMTIsXG4gIGRlcHRoOiA4LFxuICB3YWxsSGVpZ2h0OiAwLFxuICBjbGVhcmFuY2U6IDEsXG4gIG1heFJlbGllZk5vUHJlcDogMS4yLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNi4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDIsXG4gIG1heEZpbGw6IDIsXG4gIG1heEN1dFZvbHVtZTogOTYsXG4gIG1heEZpbGxWb2x1bWU6IDk2LFxuICBtYXhPYnN0cnVjdGlvbnM6IDQsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnc3RlcHBlZF9wbGludGgnLFxufTtcblxuZXhwb3J0IGNvbnN0IFBBVEhfUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAncGF0aC05eDMnLFxuICB3aWR0aDogOSxcbiAgZGVwdGg6IDMsXG4gIHdhbGxIZWlnaHQ6IDAsXG4gIGNsZWFyYW5jZTogMSxcbiAgbWF4UmVsaWVmTm9QcmVwOiAyLjAsXG4gIG1heFJlbGllZlByZXBhcmVkOiA0LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMSxcbiAgbWF4RmlsbDogMSxcbiAgbWF4Q3V0Vm9sdW1lOiAzMixcbiAgbWF4RmlsbFZvbHVtZTogMzIsXG4gIG1heE9ic3RydWN0aW9uczogMixcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdkZWNrJyxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVByb3Bvc2FsIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblN1bW1hcnkge1xuICBuZWVkc0dyYWRpbmc6IGJvb2xlYW47XG4gIG5lZWRzQ2xlYXJpbmc6IGJvb2xlYW47XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uSWRzOiBzdHJpbmdbXTtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblR5cGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVZhbGlkYXRpb24ge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgc3RhdGU6IFNpdGVTdGF0ZTtcbiAgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdO1xuICBxdWVyeTogRm9vdHByaW50UXVlcnk7XG4gIHByZXBhcmF0aW9uOiBQcmVwYXJhdGlvblN1bW1hcnk7XG59XG5cbmZ1bmN0aW9uIGVycm9yKGNvZGU6IFZhbGlkYXRpb25Db2RlLCBtZXNzYWdlOiBzdHJpbmcsIHZhbHVlPzogbnVtYmVyLCBsaW1pdD86IG51bWJlcik6IFZhbGlkYXRpb25SZWFzb24ge1xuICByZXR1cm4geyBjb2RlLCBzZXZlcml0eTogJ2Vycm9yJywgbWVzc2FnZSwgdmFsdWUsIGxpbWl0IH07XG59XG5cbmZ1bmN0aW9uIHByZXAoY29kZTogVmFsaWRhdGlvbkNvZGUsIG1lc3NhZ2U6IHN0cmluZywgdmFsdWU/OiBudW1iZXIsIGxpbWl0PzogbnVtYmVyKTogVmFsaWRhdGlvblJlYXNvbiB7XG4gIHJldHVybiB7IGNvZGUsIHNldmVyaXR5OiAncHJlcGFyYXRpb24nLCBtZXNzYWdlLCB2YWx1ZSwgbGltaXQgfTtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZSBhIHByb3Bvc2VkIHNpdGUgYWdhaW5zdCBpdHMgYnVpbGRpbmcgcnVsZXMuIFB1cmU6IG5vIHZveGVscyxcbiAqIGVudGl0aWVzIG9yIHJlc291cmNlcyBjaGFuZ2UuIGBxdWVyeWAgbWF5IGJlIHN1cHBsaWVkIGJ5IGEgc2VhcmNoIHRvIHJldXNlXG4gKiB0aGUgY2FjaGVkIGNvbHVtbnMsIGFuZCBgZm9vdHByaW50YCBtYXkgYmUgc3VwcGxpZWQgd2hlbiB0aGUgY2FsbGVyIGFscmVhZHlcbiAqIGV2YWx1YXRlZCB0aGUgc2FtZSByZWN0L2Zsb29yIHBhaXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVNpdGUoXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKSxcbiAgZm9vdHByaW50PzogRm9vdHByaW50UXVlcnksXG4pOiBTaXRlVmFsaWRhdGlvbiB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCBydWxlcyA9IHByb3Bvc2FsLnJ1bGVzO1xuICBjb25zdCByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW10gPSBbXTtcbiAgY29uc3QgZnAgPSBmb290cHJpbnQgPz8gcXVlcnkuZm9vdHByaW50KHJlY3QsIHByb3Bvc2FsLmZsb29yWSk7XG4gIGNvbnN0IHN0YXRzID0gZnAuc3RhdHM7XG5cbiAgaWYgKHJlY3QueDAgPCAtSEFMRiB8fCByZWN0LnowIDwgLUhBTEYgfHwgcmVjdC54MSA+PSBIQUxGIHx8IHJlY3QuejEgPj0gSEFMRikge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcignb3V0X29mX2JvdW5kcycsIGBmb290cHJpbnQgJHtyZWN0LngwfSwke3JlY3QuejB9Li4ke3JlY3QueDF9LCR7cmVjdC56MX0gaXMgb3V0c2lkZSB0aGUgd29ybGRgKSk7XG4gIH1cbiAgaWYgKHJlY3QueDEgLSByZWN0LngwICsgMSAhPT0gcnVsZXMud2lkdGggfHwgcmVjdC56MSAtIHJlY3QuejAgKyAxICE9PSBydWxlcy5kZXB0aCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmb290cHJpbnRfbWlzbWF0Y2gnLFxuICAgICAgYGZvb3RwcmludCBpcyAke3JlY3QueDEgLSByZWN0LngwICsgMX0geCAke3JlY3QuejEgLSByZWN0LnowICsgMX0gbSwgJHtydWxlcy53aWR0aH0geCAke3J1bGVzLmRlcHRofSBtIHJlcXVpcmVkYCxcbiAgICApKTtcbiAgfVxuXG4gIGlmIChzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdzbG9wZV9leGNlZWRlZCcsXG4gICAgICBgcmVsaWVmICR7c3RhdHMucmVsaWVmfSBtIGV4Y2VlZHMgdGhlICR7cnVsZXMubWF4UmVsaWVmUHJlcGFyZWR9IG0gcHJlcGFyZWQgbGltaXRgLFxuICAgICAgc3RhdHMucmVsaWVmLCBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4U3RlcCA+IHJ1bGVzLm1heFN0ZXApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnc3RlcF9leGNlZWRlZCcsXG4gICAgICBgc3VyZmFjZSBzdGVwICR7c3RhdHMubWF4U3RlcH0gbSBleGNlZWRzICR7cnVsZXMubWF4U3RlcH0gbWAsXG4gICAgICBzdGF0cy5tYXhTdGVwLCBydWxlcy5tYXhTdGVwLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhDdXQgPiBydWxlcy5tYXhDdXQpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnY3V0X2V4Y2VlZGVkJyxcbiAgICAgIGBjdXQgJHtzdGF0cy5tYXhDdXR9IG0gZXhjZWVkcyAke3J1bGVzLm1heEN1dH0gbWAsXG4gICAgICBzdGF0cy5tYXhDdXQsIHJ1bGVzLm1heEN1dCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4RmlsbCA+IHJ1bGVzLm1heEZpbGwpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZmlsbF9leGNlZWRlZCcsXG4gICAgICBgZmlsbCAke3N0YXRzLm1heEZpbGx9IG0gZXhjZWVkcyAke3J1bGVzLm1heEZpbGx9IG1gLFxuICAgICAgc3RhdHMubWF4RmlsbCwgcnVsZXMubWF4RmlsbCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMuY3V0Vm9sdW1lID4gcnVsZXMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2N1dF92b2x1bWVfZXhjZWVkZWQnLFxuICAgICAgYGN1dCB2b2x1bWUgJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEN1dFZvbHVtZX0gbVx1MDBCM2AsXG4gICAgICBzdGF0cy5jdXRWb2x1bWUsIHJ1bGVzLm1heEN1dFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMuZmlsbFZvbHVtZSA+IHJ1bGVzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZmlsbF92b2x1bWVfZXhjZWVkZWQnLFxuICAgICAgYGZpbGwgdm9sdW1lICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4RmlsbFZvbHVtZX0gbVx1MDBCM2AsXG4gICAgICBzdGF0cy5maWxsVm9sdW1lLCBydWxlcy5tYXhGaWxsVm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChydWxlcy5yZXF1aXJlc0RyeSAmJiBzdGF0cy53YXRlckNvbHVtbnMgPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3dhdGVyJyxcbiAgICAgIGAke3N0YXRzLndhdGVyQ29sdW1uc30gZm9vdHByaW50IGNvbHVtbnMgYXJlIHVuZGVyd2F0ZXJgLFxuICAgICAgc3RhdHMud2F0ZXJDb2x1bW5zLCAwLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoID4gcnVsZXMubWF4T2JzdHJ1Y3Rpb25zKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2Zvb3RwcmludF9vYnN0cnVjdGVkJyxcbiAgICAgIGAke3N0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyBleGNlZWQgdGhlICR7cnVsZXMubWF4T2JzdHJ1Y3Rpb25zfSBhbGxvd2FuY2VgLFxuICAgICAgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCwgcnVsZXMubWF4T2JzdHJ1Y3Rpb25zLFxuICAgICkpO1xuICB9XG4gIGlmIChmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnb3ZlcmhhbmcnLFxuICAgICAgYCR7ZnAub3ZlcmhhbmdDZWxscy5sZW5ndGh9IGNlbGxzIGFib3ZlIHRoZSBmbG9vciBhcmUgYmxvY2tlZGAsXG4gICAgICBmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aCwgMCxcbiAgICApKTtcbiAgfVxuXG4gIGNvbnN0IG5lZWRzR3JhZGluZyA9IHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZk5vUHJlcFxuICAgIHx8IHN0YXRzLmN1dFZvbHVtZSA+IDAgfHwgc3RhdHMuZmlsbFZvbHVtZSA+IDA7XG4gIGNvbnN0IG5lZWRzQ2xlYXJpbmcgPSBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoID4gMFxuICAgICYmIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPD0gcnVsZXMubWF4T2JzdHJ1Y3Rpb25zO1xuXG4gIGlmIChuZWVkc0dyYWRpbmcpIHtcbiAgICByZWFzb25zLnB1c2gocHJlcChcbiAgICAgICduZWVkc19ncmFkaW5nJyxcbiAgICAgIGBncmFkaW5nIHJlcXVpcmVkOiAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBjdXQsICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBmaWxsYCxcbiAgICAgIHN0YXRzLmN1dFZvbHVtZSArIHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKG5lZWRzQ2xlYXJpbmcpIHtcbiAgICByZWFzb25zLnB1c2gocHJlcChcbiAgICAgICduZWVkc19jbGVhcmluZycsXG4gICAgICBgJHtzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgdG8gY2xlYXJgLFxuICAgICAgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCwgcnVsZXMubWF4T2JzdHJ1Y3Rpb25zLFxuICAgICkpO1xuICB9XG5cbiAgY29uc3QgaGFzRXJyb3IgPSByZWFzb25zLnNvbWUoKHIpID0+IHIuc2V2ZXJpdHkgPT09ICdlcnJvcicpO1xuICBjb25zdCBoYXNQcmVwID0gcmVhc29ucy5zb21lKChyKSA9PiByLnNldmVyaXR5ID09PSAncHJlcGFyYXRpb24nKTtcbiAgY29uc3Qgc3RhdGU6IFNpdGVTdGF0ZSA9IGhhc0Vycm9yID8gJ2ludmFsaWQnIDogaGFzUHJlcCA/ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJyA6ICd2YWxpZCc7XG5cbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICBzdGF0ZSxcbiAgICByZWFzb25zLFxuICAgIHF1ZXJ5OiBmcCxcbiAgICBwcmVwYXJhdGlvbjoge1xuICAgICAgbmVlZHNHcmFkaW5nLFxuICAgICAgbmVlZHNDbGVhcmluZyxcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICAgIG9ic3RydWN0aW9uSWRzOiBzdGF0cy5vYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSxcbiAgICAgIGZvdW5kYXRpb246IHJ1bGVzLmZvdW5kYXRpb24sXG4gICAgfSxcbiAgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBjYW5kaWRhdGUgc2VhcmNoIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU2VhcmNoT3B0aW9ucyB7XG4gIC8qKiBDYW5kaWRhdGUgZ3JpZCBzdGVwIGluIG1ldHJlcy4gRGVmYXVsdCAyLiAqL1xuICBzdGVwPzogbnVtYmVyO1xuICBtYXhSZXN1bHRzPzogbnVtYmVyO1xuICBhbmNob3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIG1heERpc3RhbmNlPzogbnVtYmVyO1xuICAvKiogSGFyZCBjb25zdHJhaW50OiBjYW5kaWRhdGUgY2VudHJlIG11c3QgbGllIHdpdGhpbiB0aGlzIHJhZGl1cyBvZiBhIHBvaW50LiAqL1xuICBuZWFyPzogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgbWF4RGlzdGFuY2U6IG51bWJlciB9O1xuICAvKiogRG8gbm90IHJldHVybiB0d28gY2FuZGlkYXRlcyB3aG9zZSBmb290cHJpbnRzIG92ZXJsYXAuIERlZmF1bHQgdHJ1ZS4gKi9cbiAgZGlzdGluY3Q/OiBib29sZWFuO1xuICAvKiogV2FsbC1jbG9jayBidWRnZXQgZm9yIHRoZSBzY2FuLiBEZWZhdWx0IDEwMCBtcy4gKi9cbiAgYnVkZ2V0TXM/OiBudW1iZXI7XG4gIHdhbGs/OiBXYWxrUGFyYW1zO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVDYW5kaWRhdGUge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHN0YXRlOiAndmFsaWQnIHwgJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nO1xuICB2YWxpZGF0aW9uOiBTaXRlVmFsaWRhdGlvbjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25Db3VudDogbnVtYmVyO1xuICBkaXN0YW5jZTogbnVtYmVyO1xuICBzY29yZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVTZWFyY2hSZXN1bHQge1xuICBjYW5kaWRhdGVzOiBTaXRlQ2FuZGlkYXRlW107XG4gIGV2YWx1YXRlZDogbnVtYmVyO1xuICByZWplY3RlZDogbnVtYmVyO1xuICBlbGFwc2VkTXM6IG51bWJlcjtcbiAgYnVkZ2V0TXM6IG51bWJlcjtcbiAgLyoqIFRydWUgd2hlbiB0aGUgd2FsbC1jbG9jayBidWRnZXQgc3RvcHBlZCB0aGUgc2NhbiBiZWZvcmUgdGhlIGFyZWEgd2FzIGV4aGF1c3RlZC4gKi9cbiAgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBmbG9vckNhbmRpZGF0ZXMoc3RhdHM6IEFyZWFTdGF0cyk6IG51bWJlcltdIHtcbiAgY29uc3QgbWVhbiA9IE1hdGgucm91bmQoc3RhdHMubWVhblkpO1xuICBjb25zdCBzZXQgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgZm9yIChsZXQgZCA9IC0xOyBkIDw9IDE7IGQrKykgc2V0LmFkZChtZWFuICsgZCk7XG4gIHNldC5hZGQoc3RhdHMubWluWSk7XG4gIHNldC5hZGQoc3RhdHMubWF4WSk7XG4gIHJldHVybiBbLi4uc2V0XS5maWx0ZXIoKHkpID0+IHkgPj0gWV9NSU4gJiYgeSA8IFlfTUFYKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG59XG5cbmZ1bmN0aW9uIG92ZXJsYXBzKGE6IFJlY3QsIGI6IFJlY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIGEueDAgPD0gYi54MSAmJiBhLngxID49IGIueDAgJiYgYS56MCA8PSBiLnoxICYmIGEuejEgPj0gYi56MDtcbn1cblxuZnVuY3Rpb24gY2FuZGlkYXRlU2NvcmUodjogU2l0ZVZhbGlkYXRpb24sIGRpc3RhbmNlOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBwcmVwUGVuYWx0eSA9IHYuc3RhdGUgPT09ICd2YWxpZCcgPyAwIDogMjU7XG4gIGNvbnN0IGdyYWRpbmcgPSB2LnByZXBhcmF0aW9uLmN1dFZvbHVtZSArIHYucHJlcGFyYXRpb24uZmlsbFZvbHVtZTtcbiAgY29uc3QgY2xlYXJpbmcgPSB2LnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzLmxlbmd0aCAqIDQ7XG4gIHJldHVybiBwcmVwUGVuYWx0eSArIGdyYWRpbmcgKyBjbGVhcmluZyArIGRpc3RhbmNlICogMC4yNTtcbn1cblxuLyoqXG4gKiBTZWFyY2ggYSBib3VuZGVkIGFyZWEgZm9yIHZpYWJsZSBmb290cHJpbnRzLiBUaGUgc2FtZSB2YWxpZGF0b3IgYW5kIHRoZSBzYW1lXG4gKiBmbG9vci1zZWxlY3Rpb24gcG9saWN5IGFyZSB1c2VkIGJ5IHRoZSBBSSBhZ2VudCBhbmQgdGhlIHBsYXllcidzIGJ1aWxkXG4gKiBwcmV2aWV3LiBTZWFyY2ggaXMgcmVhZC1vbmx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2VhcmNoU2l0ZXMoXG4gIHdvcmxkOiBXb3JsZCwgcnVsZXM6IEJ1aWxkaW5nUnVsZXMsIGFyZWE6IFJlY3QsIG9wdGlvbnM6IFNlYXJjaE9wdGlvbnMgPSB7fSxcbik6IFNpdGVTZWFyY2hSZXN1bHQge1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBzdGVwID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihvcHRpb25zLnN0ZXAgPz8gMikpO1xuICBjb25zdCBtYXhSZXN1bHRzID0gTWF0aC5tYXgoMSwgb3B0aW9ucy5tYXhSZXN1bHRzID8/IDgpO1xuICBjb25zdCBkaXN0aW5jdCA9IG9wdGlvbnMuZGlzdGluY3QgIT09IGZhbHNlO1xuICBjb25zdCBtYXhEaXN0YW5jZSA9IG9wdGlvbnMubWF4RGlzdGFuY2UgPz8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICBjb25zdCBidWRnZXRNcyA9IG9wdGlvbnMuYnVkZ2V0TXMgPz8gMTAwO1xuICBjb25zdCBhbmNob3IgPSBvcHRpb25zLmFuY2hvciA/PyB7IHg6IChhcmVhLngwICsgYXJlYS54MSkgLyAyLCB6OiAoYXJlYS56MCArIGFyZWEuejEpIC8gMiB9O1xuICBjb25zdCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpO1xuICBjb25zdCBhbGw6IFNpdGVDYW5kaWRhdGVbXSA9IFtdO1xuICBsZXQgZXZhbHVhdGVkID0gMDtcbiAgbGV0IHJlamVjdGVkID0gMDtcbiAgbGV0IHRydW5jYXRlZCA9IGZhbHNlO1xuXG4gIGNvbnN0IHgxTWF4ID0gYXJlYS54MSAtIHJ1bGVzLndpZHRoICsgMTtcbiAgY29uc3QgejFNYXggPSBhcmVhLnoxIC0gcnVsZXMuZGVwdGggKyAxO1xuICBzY2FuOiBmb3IgKGxldCB6ID0gYXJlYS56MDsgeiA8PSB6MU1heDsgeiArPSBzdGVwKSB7XG4gICAgZm9yIChsZXQgeCA9IGFyZWEueDA7IHggPD0geDFNYXg7IHggKz0gc3RlcCkge1xuICAgICAgY29uc3QgcmVjdCA9IHsgeDA6IHgsIHowOiB6LCB4MTogeCArIHJ1bGVzLndpZHRoIC0gMSwgejE6IHogKyBydWxlcy5kZXB0aCAtIDEgfTtcbiAgICAgIGNvbnN0IGN4ID0gKHJlY3QueDAgKyByZWN0LngxKSAvIDI7XG4gICAgICBjb25zdCBjeiA9IChyZWN0LnowICsgcmVjdC56MSkgLyAyO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLmh5cG90KGN4IC0gYW5jaG9yLngsIGN6IC0gYW5jaG9yLnopO1xuICAgICAgaWYgKGRpc3RhbmNlID4gbWF4RGlzdGFuY2UpIGNvbnRpbnVlO1xuICAgICAgaWYgKG9wdGlvbnMubmVhcikge1xuICAgICAgICBjb25zdCBuZWFyRGlzdGFuY2UgPSBNYXRoLmh5cG90KGN4IC0gb3B0aW9ucy5uZWFyLngsIGN6IC0gb3B0aW9ucy5uZWFyLnopO1xuICAgICAgICBpZiAobmVhckRpc3RhbmNlID4gb3B0aW9ucy5uZWFyLm1heERpc3RhbmNlKSBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RhdHMgPSBxdWVyeS5hcmVhKHJlY3QpO1xuICAgICAgbGV0IGJlc3Q6IFNpdGVDYW5kaWRhdGUgfCBudWxsID0gbnVsbDtcbiAgICAgIGZvciAoY29uc3QgZmxvb3JZIG9mIGZsb29yQ2FuZGlkYXRlcyhzdGF0cykpIHtcbiAgICAgICAgZXZhbHVhdGVkKys7XG4gICAgICAgIGNvbnN0IHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwgPSB7XG4gICAgICAgICAgc2l0ZUlkOiBgJHtydWxlcy5pZH06JHt4fSwke3p9LCR7Zmxvb3JZfWAsXG4gICAgICAgICAgcmVjdCwgZmxvb3JZLCBydWxlcyxcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgZm9vdHByaW50ID0gcXVlcnkuZm9vdHByaW50KHJlY3QsIGZsb29yWSk7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsLCBxdWVyeSwgZm9vdHByaW50KTtcbiAgICAgICAgaWYgKHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJykge1xuICAgICAgICAgIHJlamVjdGVkKys7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2NvcmUgPSBjYW5kaWRhdGVTY29yZSh2YWxpZGF0aW9uLCBkaXN0YW5jZSk7XG4gICAgICAgIGNvbnN0IGNhbmRpZGF0ZTogU2l0ZUNhbmRpZGF0ZSA9IHtcbiAgICAgICAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICAgICAgICByZWN0LFxuICAgICAgICAgIGZsb29yWSxcbiAgICAgICAgICBzdGF0ZTogdmFsaWRhdGlvbi5zdGF0ZSxcbiAgICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgICAgIGN1dFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUsXG4gICAgICAgICAgZmlsbFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lLFxuICAgICAgICAgIG9ic3RydWN0aW9uQ291bnQ6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHMubGVuZ3RoLFxuICAgICAgICAgIGRpc3RhbmNlLFxuICAgICAgICAgIHNjb3JlLFxuICAgICAgICB9O1xuICAgICAgICBpZiAoIWJlc3RcbiAgICAgICAgICB8fCAoY2FuZGlkYXRlLnN0YXRlID09PSAndmFsaWQnICYmIGJlc3Quc3RhdGUgIT09ICd2YWxpZCcpXG4gICAgICAgICAgfHwgKGNhbmRpZGF0ZS5zdGF0ZSA9PT0gYmVzdC5zdGF0ZSAmJiBjYW5kaWRhdGUuc2NvcmUgPCBiZXN0LnNjb3JlKSkge1xuICAgICAgICAgIGJlc3QgPSBjYW5kaWRhdGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChiZXN0KSBhbGwucHVzaChiZXN0KTtcbiAgICB9XG4gICAgaWYgKHBlcmZvcm1hbmNlLm5vdygpIC0gdDAgPiBidWRnZXRNcykge1xuICAgICAgdHJ1bmNhdGVkID0gdHJ1ZTtcbiAgICAgIGJyZWFrIHNjYW47XG4gICAgfVxuICB9XG5cbiAgYWxsLnNvcnQoKGEsIGIpID0+IGEuc2NvcmUgLSBiLnNjb3JlIHx8IGEuZGlzdGFuY2UgLSBiLmRpc3RhbmNlXG4gICAgfHwgYS5yZWN0LngwIC0gYi5yZWN0LngwIHx8IGEucmVjdC56MCAtIGIucmVjdC56MCk7XG4gIGNvbnN0IHNlbGVjdGVkOiBTaXRlQ2FuZGlkYXRlW10gPSBbXTtcbiAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgYWxsKSB7XG4gICAgaWYgKGRpc3RpbmN0ICYmIHNlbGVjdGVkLnNvbWUoKHMpID0+IG92ZXJsYXBzKHMucmVjdCwgY2FuZGlkYXRlLnJlY3QpKSkgY29udGludWU7XG4gICAgc2VsZWN0ZWQucHVzaChjYW5kaWRhdGUpO1xuICAgIGlmIChzZWxlY3RlZC5sZW5ndGggPj0gbWF4UmVzdWx0cykgYnJlYWs7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNhbmRpZGF0ZXM6IHNlbGVjdGVkLFxuICAgIGV2YWx1YXRlZCxcbiAgICByZWplY3RlZCxcbiAgICBlbGFwc2VkTXM6IE1hdGgucm91bmQoKHBlcmZvcm1hbmNlLm5vdygpIC0gdDApICogMTAwKSAvIDEwMCxcbiAgICBidWRnZXRNcyxcbiAgICB0cnVuY2F0ZWQsXG4gIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gcHJldmlldyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIEZvdW5kYXRpb25QcmV2aWV3IHtcbiAgdHlwZTogRm91bmRhdGlvblR5cGU7XG4gIC8qKiBTdG9uZSBmbG9vciBzbGFiIHBsdXMgZmlsbCB1bmRlciB0aGUgcHJlcGFyZWQgZmxvb3IuICovXG4gIHBsaW50aENlbGxzOiBudW1iZXI7XG4gIC8qKiBQZXJpbWV0ZXIgY2VsbHMgdGhhdCBuZWVkIGEgcmV0YWluaW5nIGZhY2UgYmVjYXVzZSBvZiBjdXQgb3IgZmlsbC4gKi9cbiAgcmV0YWluaW5nV2FsbENlbGxzOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQWNjZXNzUHJldmlldyB7XG4gIGRvb3I6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgZGlzdGFuY2U6IG51bWJlcjtcbiAgZ3JhZGU6IG51bWJlcjtcbiAgd2Fsa2FibGU6IGJvb2xlYW47XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVQcmV2aWV3IHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHN0YXRlOiBTaXRlU3RhdGU7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbiAgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdO1xuICB0ZXJyYWluOiB7XG4gICAgbWluWTogbnVtYmVyO1xuICAgIG1heFk6IG51bWJlcjtcbiAgICBtZWFuWTogbnVtYmVyO1xuICAgIHJlbGllZjogbnVtYmVyO1xuICAgIG1heFN0ZXA6IG51bWJlcjtcbiAgICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gICAgbWF4Q3V0OiBudW1iZXI7XG4gICAgbWF4RmlsbDogbnVtYmVyO1xuICB9O1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uUHJldmlldztcbiAgb2JzdHJ1Y3Rpb25zOiBBcnJheTx7XG4gICAgZW50aXR5SWQ6IHN0cmluZztcbiAgICBraW5kOiBzdHJpbmc7XG4gICAgeDogbnVtYmVyO1xuICAgIHo6IG51bWJlcjtcbiAgICBhY3Rpb246ICdjbGVhcicgfCAnYmxvY2tlZCc7XG4gIH0+O1xuICBhY2Nlc3M6IEFjY2Vzc1ByZXZpZXcgfCBudWxsO1xuICAvKiogQ29tcGxldGUgd29yayBlbnZlbG9wZSB0aGlzIHByZXZpZXcgd291bGQgYXV0aG9yaXplLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmV2aWV3T3B0aW9ucyB7XG4gIGRvb3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICB3YWxrPzogV2Fsa1BhcmFtcztcbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUgdGhyZWUtc3RhdGUgcHJldmlldy4gSXQgaXMgZGVsaWJlcmF0ZWx5IGRhdGEtb25seTogdGhlIHJlbmRlcmVyXG4gKiBjYW4gZHJhdyBpdCwgYnV0IGl0IG5ldmVyIGVkaXRzIHRlcnJhaW4gb3Igc3BlbmRzIHJlc291cmNlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXZpZXdTaXRlKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIG9wdGlvbnM6IFByZXZpZXdPcHRpb25zID0ge30sXG4pOiBTaXRlUHJldmlldyB7XG4gIGNvbnN0IHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCk7XG4gIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsLCBxdWVyeSk7XG4gIGNvbnN0IGZwID0gdmFsaWRhdGlvbi5xdWVyeTtcbiAgY29uc3Qgc3RhdHMgPSBmcC5zdGF0cztcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHJ1bGVzID0gcHJvcG9zYWwucnVsZXM7XG5cbiAgbGV0IHBlcmltZXRlciA9IDA7XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgICAgaWYgKHggIT09IHJlY3QueDAgJiYgeCAhPT0gcmVjdC54MSAmJiB6ICE9PSByZWN0LnowICYmIHogIT09IHJlY3QuejEpIGNvbnRpbnVlO1xuICAgICAgaWYgKGNvbHVtbkF0KHdvcmxkLCB4LCB6KS5zdXJmYWNlWSAhPT0gcHJvcG9zYWwuZmxvb3JZKSBwZXJpbWV0ZXIrKztcbiAgICB9XG4gIH1cbiAgY29uc3QgZm91bmRhdGlvbjogRm91bmRhdGlvblByZXZpZXcgPSB7XG4gICAgdHlwZTogcnVsZXMuZm91bmRhdGlvbixcbiAgICBwbGludGhDZWxsczogcmVjdENvbHVtbnMocmVjdCkgKyBzdGF0cy5maWxsVm9sdW1lLFxuICAgIHJldGFpbmluZ1dhbGxDZWxsczogcGVyaW1ldGVyLFxuICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gIH07XG5cbiAgbGV0IGFjY2VzczogQWNjZXNzUHJldmlldyB8IG51bGwgPSBudWxsO1xuICBpZiAob3B0aW9ucy5kb29yICYmIG9wdGlvbnMuYXBwcm9hY2gpIHtcbiAgICBjb25zdCBkb29yID0gb3B0aW9ucy5kb29yO1xuICAgIGNvbnN0IGFwcHJvYWNoID0gb3B0aW9ucy5hcHByb2FjaDtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5oeXBvdChkb29yLnggLSBhcHByb2FjaC54LCBkb29yLnogLSBhcHByb2FjaC56KTtcbiAgICBjb25zdCBzdGVwcyA9IE1hdGgubWF4KDEsIE1hdGguY2VpbChkaXN0YW5jZSkpO1xuICAgIGxldCBwcmV2WCA9IGFwcHJvYWNoLngsIHByZXZaID0gYXBwcm9hY2guejtcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBzdGVwczsgaSsrKSB7XG4gICAgICBjb25zdCB0ID0gaSAvIHN0ZXBzO1xuICAgICAgY29uc3QgeCA9IE1hdGgucm91bmQoYXBwcm9hY2gueCArIChkb29yLnggLSBhcHByb2FjaC54KSAqIHQpO1xuICAgICAgY29uc3QgeiA9IE1hdGgucm91bmQoYXBwcm9hY2gueiArIChkb29yLnogLSBhcHByb2FjaC56KSAqIHQpO1xuICAgICAgaWYgKHggPT09IHByZXZYICYmIHogPT09IHByZXZaKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHdhbGtTdGVwKHdvcmxkLCBwcmV2WCwgcHJldlosIHgsIHosIG9wdGlvbnMud2FsayA/PyBERUZBVUxUX1dBTEspO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJlYXNvbnMucHVzaChgJHtyZXN1bHQucmVhc29ufSBhdCAke3h9LCR7en1gKTtcbiAgICAgIHByZXZYID0geDsgcHJldlogPSB6O1xuICAgIH1cbiAgICBhY2Nlc3MgPSB7XG4gICAgICBkb29yLCBhcHByb2FjaCwgZGlzdGFuY2UsXG4gICAgICBncmFkZTogZWZmZWN0aXZlR3JhZGUod29ybGQsIGFwcHJvYWNoLngsIGFwcHJvYWNoLnosIGRvb3IueCwgZG9vci56KSxcbiAgICAgIHdhbGthYmxlOiByZWFzb25zLmxlbmd0aCA9PT0gMCxcbiAgICAgIHJlYXNvbnMsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHkwID0gcHJvcG9zYWwuZmxvb3JZIC0gTWF0aC5tYXgoMSwgc3RhdHMubWF4Q3V0KSAtIDE7XG4gIGNvbnN0IHkxID0gcHJvcG9zYWwuZmxvb3JZICsgTWF0aC5tYXgocnVsZXMud2FsbEhlaWdodCwgMSkgKyAxO1xuICBjb25zdCBlbnZlbG9wZTogVm94ZWxSZWdpb25bXSA9IFtcbiAgICB7XG4gICAgICAuLi5leHBhbmRSZWN0KHJlY3QsIDIpLFxuICAgICAgeTA6IE1hdGgubWF4KFlfTUlOLCB5MCksXG4gICAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCB5MSksXG4gICAgfSxcbiAgXTtcbiAgaWYgKGFjY2Vzcykge1xuICAgIGNvbnN0IGF4MCA9IE1hdGgubWluKGFjY2Vzcy5kb29yLngsIGFjY2Vzcy5hcHByb2FjaC54KSAtIDE7XG4gICAgY29uc3QgYXgxID0gTWF0aC5tYXgoYWNjZXNzLmRvb3IueCwgYWNjZXNzLmFwcHJvYWNoLngpICsgMTtcbiAgICBjb25zdCBhejAgPSBNYXRoLm1pbihhY2Nlc3MuZG9vci56LCBhY2Nlc3MuYXBwcm9hY2gueikgLSAxO1xuICAgIGNvbnN0IGF6MSA9IE1hdGgubWF4KGFjY2Vzcy5kb29yLnosIGFjY2Vzcy5hcHByb2FjaC56KSArIDE7XG4gICAgY29uc3QgYU1pbiA9IE1hdGgubWluKHN1cmZhY2VBdCh3b3JsZCwgYXgwLCBhejApLCBzdXJmYWNlQXQod29ybGQsIGF4MSwgYXoxKSk7XG4gICAgY29uc3QgYU1heCA9IE1hdGgubWF4KHN1cmZhY2VBdCh3b3JsZCwgYXgwLCBhejApLCBzdXJmYWNlQXQod29ybGQsIGF4MSwgYXoxKSk7XG4gICAgZW52ZWxvcGUucHVzaCh7XG4gICAgICB4MDogYXgwLCB4MTogYXgxLCB6MDogYXowLCB6MTogYXoxLFxuICAgICAgeTA6IE1hdGgubWF4KFlfTUlOLCBhTWluIC0gMiksXG4gICAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBhTWF4ICsgMiksXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHN0YXRlOiB2YWxpZGF0aW9uLnN0YXRlLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgcnVsZXMsXG4gICAgcmVhc29uczogdmFsaWRhdGlvbi5yZWFzb25zLFxuICAgIHRlcnJhaW46IHtcbiAgICAgIG1pblk6IHN0YXRzLm1pblksXG4gICAgICBtYXhZOiBzdGF0cy5tYXhZLFxuICAgICAgbWVhblk6IHN0YXRzLm1lYW5ZLFxuICAgICAgcmVsaWVmOiBzdGF0cy5yZWxpZWYsXG4gICAgICBtYXhTdGVwOiBzdGF0cy5tYXhTdGVwLFxuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgIH0sXG4gICAgZm91bmRhdGlvbixcbiAgICBvYnN0cnVjdGlvbnM6IHN0YXRzLm9ic3RydWN0aW9ucy5tYXAoKG8pID0+ICh7XG4gICAgICBlbnRpdHlJZDogby5lbnRpdHlJZCxcbiAgICAgIGtpbmQ6IG8ua2luZCxcbiAgICAgIHg6IG8ueCxcbiAgICAgIHo6IG8ueixcbiAgICAgIGFjdGlvbjogdmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnID8gJ2Jsb2NrZWQnIDogJ2NsZWFyJyxcbiAgICB9KSksXG4gICAgYWNjZXNzLFxuICAgIGVudmVsb3BlLFxuICB9O1xufVxuXG4iLCAiLy8gTTAwMiBzdGFnZSAzOiBib3VuZGVkLCBhdXRob3JpemVkIHRlcnJhaW4gcHJlcGFyYXRpb24uXG4vL1xuLy8gVGhlIHBpcGVsaW5lIGlzIGRlbGliZXJhdGVseSBvbmUtd2F5IGFuZCBzaGFyZWQgYnkgdGhlIHBsYXllciBhbmQgdGhlIEFJOlxuLy9cbi8vICAgcHJvcG9zYWwgLT4gdmFsaWRhdGVTaXRlIC0+IHBsYW5QcmVwYXJhdGlvbiAtPiBBdXRob3JpemVyIC0+IGV4ZWN1dGVcbi8vXG4vLyBgZXhlY3V0ZVByZXBhcmF0aW9uYCBpcyB0aGUgb25seSBmdW5jdGlvbiBpbiBNMDAyIHRoYXQgZWRpdHMgdGVycmFpbiBmb3Jcbi8vIGNvbnN0cnVjdGlvbi4gSXQgcmVmdXNlcyB0byBydW4gd2l0aG91dCBhbiBhdXRob3JpemF0aW9uIHRva2VuIHdob3NlIGRpZ2VzdFxuLy8gbWF0Y2hlcyB0aGUgcGxhbiwgd2hvc2UgZW52ZWxvcGUgY292ZXJzIGV2ZXJ5IHZveGVsIGl0IHdvdWxkIHRvdWNoLCBhbmQgd2hvc2Vcbi8vIGJhc2UgcmV2aXNpb24gc3RpbGwgbWF0Y2hlcyB0aGUgd29ybGQuIEFsbCBlZGl0cyBhcmUgY29tcHV0ZWQgYW5kIGNoZWNrZWRcbi8vIGJlZm9yZSB0aGUgZmlyc3QgYnl0ZSBpcyB3cml0dGVuLCBzbyBhIHJlamVjdGVkIHBsYW4gY2Fubm90IGxlYXZlIGEgcGFydGlhbFxuLy8gcGFkIGJlaGluZC5cbi8vXG4vLyBUaGUgYXV0aG9yaXplciBpbiB0aGlzIGZpbGUgaXMgYSBsb2NhbCBwb2xpY3kgc3R1Yi4gSXQgcHJvdmVzIHRoYXQgdGhlXG4vLyBwaXBlbGluZSBhbmQgdGhlIGVudmVsb3BlIGNoZWNrcyBleGlzdDsgaXQgaXMgTk9UIE1hZ2ljQmxvY2sgZW5mb3JjZW1lbnQuXG4vLyBObyBjaGFpbiBwcm9ncmFtLCBTREsgY2FsbCwgc2V0dGxlbWVudCBvciByb2xsYmFjayBndWFyYW50ZWUgaXMgcHJlc2VudC5cbmltcG9ydCB7XG4gIFdvcmxkLCBNQVQsIE1hdElkLCBZX01JTiwgWV9NQVgsIEhBTEYsIGlzU29saWQsXG4gIGdldFZveGVsLCBzZXRWb3hlbCwgcmVtb3ZlRW50aXR5LCBzdXJmYWNlQXQsXG4gIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBFbnRpdHlLaW5kLCBSZXNvdXJjZVR5cGUsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIG5vcm1hbGl6ZVJlY3QsIHJlY3RDb2x1bW5zLCBleHBhbmRSZWN0LFxuICBlbnZlbG9wZUNvbnRhaW5zLCBvYnN0cnVjdGlvbnNJbixcbn0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7XG4gIFNpdGVQcm9wb3NhbCwgU2l0ZVZhbGlkYXRpb24sIEJ1aWxkaW5nUnVsZXMsIHZhbGlkYXRlU2l0ZSxcbn0gZnJvbSAnLi9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHtcbiAgaW52ZW50b3J5U25hcHNob3QsIG5vcm1hbGl6ZUVudmVsb3BlLFxufSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBMT0NBTF9BVVRIT1JJVFkgPSAnbG9jYWwtc3R1YicgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgTE9DQUxfRU5GT1JDRU1FTlQgPSAnbG9jYWwtc2ltdWxhdGlvbi1vbmx5JyBhcyBjb25zdDtcblxuZXhwb3J0IGludGVyZmFjZSBDb2x1bW5UYXJnZXQge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBsYW5FeHBlY3RhdGlvbiB7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uczogbnVtYmVyO1xuICBzdXJmYWNlRWRpdHM6IG51bWJlcjtcbiAgdG90YWxFZGl0czogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uUGxhbiB7XG4gIGlkOiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIC8qKiBFeGFjdGx5IG9uZSB0YXJnZXQgd2Fsa2luZyBoZWlnaHQgcGVyIGZvb3RwcmludCBjb2x1bW4sIHNvcnRlZCBieSB6LCB4LiAqL1xuICB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXTtcbiAgLyoqIEF1dGhvcml0YXRpdmUgZW50aXR5IGlkcyB0aGlzIHBsYW4gbWF5IHJlbW92ZS4gKi9cbiAgY2xlYXJFbnRpdHlJZHM6IHN0cmluZ1tdO1xuICAvKiogTWF0ZXJpYWwgZm9yIHRoZSB0b3Agc29saWQgdm94ZWwgYWZ0ZXIgZ3JhZGluZywgb3IgbnVsbCB0byBrZWVwIGl0LiAqL1xuICBzdXJmYWNlTWF0ZXJpYWw6IE1hdElkIHwgbnVsbDtcbiAgLyoqIFRpZ2h0IGVudmVsb3BlIGNvdmVyaW5nIGV2ZXJ5IHBsYW5uZWQgdm94ZWwgY2hhbmdlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgZXhwZWN0ZWQ6IFBsYW5FeHBlY3RhdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbk9wdGlvbnMge1xuICAvKiogUGVyLWNvbHVtbiB0YXJnZXRzIGZvciB0ZXJyYWNlcyBvciBzdGVwcGVkIHBhdGhzLiBEZWZhdWx0cyB0byBmbG9vclkuICovXG4gIHRhcmdldHM/OiBDb2x1bW5UYXJnZXRbXTtcbiAgLyoqIGBub25lYCBpcyBvbmx5IGxlZ2FsIHdoZW4gdGhlIHNpdGUgaGFzIG5vIG9ic3RydWN0aW9ucy4gKi9cbiAgY2xlYXI/OiAnb2JzdHJ1Y3Rpb25zJyB8ICdub25lJztcbiAgLyoqIFNldCB0aGUgdG9wIHNvbGlkIHZveGVsIG9mIGV2ZXJ5IHRhcmdldCBjb2x1bW4gKHBhdGhzLCBmaWVsZHMpLiAqL1xuICBzdXJmYWNlTWF0ZXJpYWw/OiBNYXRJZDtcbiAgLyoqIEV4cGxpY2l0IHdvcmsgZW52ZWxvcGUuIERlZmF1bHRzIHRvIGEgdGlnaHQgZW52ZWxvcGUgYXJvdW5kIHRoZSBlZGl0cy4gKi9cbiAgZW52ZWxvcGU/OiBWb3hlbFJlZ2lvbltdO1xufVxuXG4vLyAtLS0tLS0tLS0tIHN0YWJsZSBkaWdlc3QgLS0tLS0tLS0tLVxuZnVuY3Rpb24gZGlnZXN0KGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzU7XG4gIGxldCBiID0gMHg5ZTM3NzliOTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbnB1dC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGMgPSBpbnB1dC5jaGFyQ29kZUF0KGkpO1xuICAgIGEgPSBNYXRoLmltdWwoYSBeIGMsIDB4MDEwMDAxOTMpO1xuICAgIGIgPSBNYXRoLmltdWwoYiBeIChjICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIGIgXj0gYiA+Pj4gMTM7XG4gIH1cbiAgcmV0dXJuIChhID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICsgKGIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG4vKiogRGlnZXN0IG9mIGV2ZXJ5dGhpbmcgdGhhdCBjaGFuZ2VzIHRoZSBzZXQgb2YgZWRpdHMgb3IgcmVtb3ZhbHMuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhbkRpZ2VzdChwbGFuOiBQcmVwYXJhdGlvblBsYW4pOiBzdHJpbmcge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXG4gICAgJ20wMDI6cHJlcC1wbGFuOnYxJyxcbiAgICBwbGFuLnNpdGVJZCxcbiAgICBgJHtwbGFuLnJlY3QueDB9LCR7cGxhbi5yZWN0LnowfSwke3BsYW4ucmVjdC54MX0sJHtwbGFuLnJlY3QuejF9YCxcbiAgICBTdHJpbmcocGxhbi5mbG9vclkpLFxuICAgIHBsYW4ucnVsZXMuaWQsXG4gICAgU3RyaW5nKHBsYW4udGFyZ2V0cy5sZW5ndGgpLFxuICAgIHBsYW4uc3VyZmFjZU1hdGVyaWFsID09PSBudWxsID8gJ3N1cmZhY2U6a2VlcCcgOiBgc3VyZmFjZToke3BsYW4uc3VyZmFjZU1hdGVyaWFsfWAsXG4gIF07XG4gIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIGxpbmVzLnB1c2goYHQ6JHt0Lnh9LCR7dC56fSwke3QueX1gKTtcbiAgY29uc3QgY2xlYXJzID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgbGluZXMucHVzaChgYzoke2NsZWFycy5sZW5ndGh9YCk7XG4gIGZvciAoY29uc3QgaWQgb2YgY2xlYXJzKSBsaW5lcy5wdXNoKGBjOiR7aWR9YCk7XG4gIGZvciAoY29uc3QgZSBvZiBub3JtYWxpemVFbnZlbG9wZShwbGFuLmVudmVsb3BlKSkge1xuICAgIGxpbmVzLnB1c2goYGU6JHtlLngwfSwke2UuejB9LCR7ZS55MH0sJHtlLngxfSwke2UuejF9LCR7ZS55MX1gKTtcbiAgfVxuICBjb25zdCB4ID0gcGxhbi5leHBlY3RlZDtcbiAgbGluZXMucHVzaChgeDoke3guY3V0Vm9sdW1lfSwke3guZmlsbFZvbHVtZX0sJHt4Lm1heEN1dH0sJHt4Lm1heEZpbGx9LCR7eC5vYnN0cnVjdGlvbnN9LCR7eC5zdXJmYWNlRWRpdHN9LCR7eC50b3RhbEVkaXRzfWApO1xuICByZXR1cm4gZGlnZXN0KGxpbmVzLmpvaW4oJ1xcbicpKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwbGFubmluZyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFBsYW5TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFByZXBhcmF0aW9uUGxhbjtcbiAgdmFsaWRhdGlvbjogU2l0ZVZhbGlkYXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25GYWlsdXJlIHtcbiAgb2s6IGZhbHNlO1xuICBzdGFnZTogJ3BsYW4nIHwgJ2F1dGhvcml6ZScgfCAnZXhlY3V0ZSc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG4gIHZhbGlkYXRpb24/OiBTaXRlVmFsaWRhdGlvbjtcbn1cblxuZXhwb3J0IHR5cGUgUGxhblJlc3VsdCA9IFBsYW5TdWNjZXNzIHwgUHJlcGFyYXRpb25GYWlsdXJlO1xuXG5mdW5jdGlvbiBkZWZhdWx0VGFyZ2V0cyh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QsIGZsb29yWTogbnVtYmVyKTogQ29sdW1uVGFyZ2V0W10ge1xuICBjb25zdCBvdXQ6IENvbHVtblRhcmdldFtdID0gW107XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgb3V0LnB1c2goeyB4LCB6LCB5OiBmbG9vclkgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gc29ydGVkVGFyZ2V0cyh0YXJnZXRzOiByZWFkb25seSBDb2x1bW5UYXJnZXRbXSk6IENvbHVtblRhcmdldFtdIHtcbiAgcmV0dXJuIFsuLi50YXJnZXRzXS5zb3J0KChhLCBiKSA9PiBhLnogLSBiLnogfHwgYS54IC0gYi54IHx8IGEueSAtIGIueSk7XG59XG5cbmludGVyZmFjZSBUYXJnZXRTdGF0cyB7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIHJlbGllZjogbnVtYmVyO1xufVxuXG4vKiogQ3V0L2ZpbGwgaW1wbGllZCBieSBleHBsaWNpdCB0YXJnZXRzLCBpbmRlcGVuZGVudCBvZiB0aGUgZmxhdCBmbG9vclkuICovXG5mdW5jdGlvbiB0YXJnZXRTdGF0cyh3b3JsZDogV29ybGQsIHRhcmdldHM6IHJlYWRvbmx5IENvbHVtblRhcmdldFtdKTogVGFyZ2V0U3RhdHMge1xuICBsZXQgY3V0Vm9sdW1lID0gMCwgZmlsbFZvbHVtZSA9IDAsIG1heEN1dCA9IDAsIG1heEZpbGwgPSAwO1xuICBsZXQgbWluWSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgbWF4WSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgbWluWSA9IE1hdGgubWluKG1pblksIHN1cmZhY2UsIHQueSk7XG4gICAgbWF4WSA9IE1hdGgubWF4KG1heFksIHN1cmZhY2UsIHQueSk7XG4gICAgaWYgKHN1cmZhY2UgPiB0LnkpIHtcbiAgICAgIGNvbnN0IGQgPSBzdXJmYWNlIC0gdC55O1xuICAgICAgY3V0Vm9sdW1lICs9IGQ7XG4gICAgICBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGQpO1xuICAgIH0gZWxzZSBpZiAoc3VyZmFjZSA8IHQueSkge1xuICAgICAgY29uc3QgZCA9IHQueSAtIHN1cmZhY2U7XG4gICAgICBmaWxsVm9sdW1lICs9IGQ7XG4gICAgICBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgZCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB7IGN1dFZvbHVtZSwgZmlsbFZvbHVtZSwgbWF4Q3V0LCBtYXhGaWxsLCByZWxpZWY6IG1heFkgLSBtaW5ZIH07XG59XG5cbmZ1bmN0aW9uIHRhcmdldFJ1bGVSZWFzb25zKHN0YXRzOiBUYXJnZXRTdGF0cywgcnVsZXM6IEJ1aWxkaW5nUnVsZXMpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGlmIChzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZQcmVwYXJlZCkge1xuICAgIHJlYXNvbnMucHVzaChgcmVsaWVmICR7c3RhdHMucmVsaWVmfSBtIGV4Y2VlZHMgdGhlICR7cnVsZXMubWF4UmVsaWVmUHJlcGFyZWR9IG0gcHJlcGFyZWQgbGltaXRgKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4Q3V0ID4gcnVsZXMubWF4Q3V0KSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgJHtzdGF0cy5tYXhDdXR9IG0gZXhjZWVkcyAke3J1bGVzLm1heEN1dH0gbWApO1xuICB9XG4gIGlmIChzdGF0cy5tYXhGaWxsID4gcnVsZXMubWF4RmlsbCkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCAke3N0YXRzLm1heEZpbGx9IG0gZXhjZWVkcyAke3J1bGVzLm1heEZpbGx9IG1gKTtcbiAgfVxuICBpZiAoc3RhdHMuY3V0Vm9sdW1lID4gcnVsZXMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgdm9sdW1lICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXRWb2x1bWV9IG1cdTAwQjNgKTtcbiAgfVxuICBpZiAoc3RhdHMuZmlsbFZvbHVtZSA+IHJ1bGVzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgdm9sdW1lICR7c3RhdHMuZmlsbFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4RmlsbFZvbHVtZX0gbVx1MDBCM2ApO1xuICB9XG4gIHJldHVybiByZWFzb25zO1xufVxuXG4vKipcbiAqIFR1cm4gYSBwcm9wb3NhbCBpbnRvIGFuIGV4cGxpY2l0LCBjaGVja2FibGUgcGxhbi4gUmVhZC1vbmx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhblByZXBhcmF0aW9uKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIG9wdGlvbnM6IFByZXBhcmF0aW9uT3B0aW9ucyA9IHt9LFxuKTogUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCk7XG5cbiAgaWYgKHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJykge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3NpdGVfaW52YWxpZCcsXG4gICAgICByZWFzb25zOiB2YWxpZGF0aW9uLnJlYXNvbnMubWFwKChyKSA9PiBgJHtyLmNvZGV9OiAke3IubWVzc2FnZX1gKSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHRhcmdldHMgPSBzb3J0ZWRUYXJnZXRzKG9wdGlvbnMudGFyZ2V0cyA/PyBkZWZhdWx0VGFyZ2V0cyh3b3JsZCwgcmVjdCwgcHJvcG9zYWwuZmxvb3JZKSk7XG4gIGNvbnN0IGNvbHVtbnMgPSByZWN0Q29sdW1ucyhyZWN0KTtcbiAgaWYgKHRhcmdldHMubGVuZ3RoICE9PSBjb2x1bW5zKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAndGFyZ2V0X2NvdW50JyxcbiAgICAgIHJlYXNvbnM6IFtgcGxhbiBoYXMgJHt0YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBmb3IgJHtjb2x1bW5zfSBjb2x1bW5zYF0sXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qga2V5ID0gYCR7dC54fSwke3Quen1gO1xuICAgIGlmIChzZWVuLmhhcyhrZXkpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICdkdXBsaWNhdGVfdGFyZ2V0JyxcbiAgICAgICAgcmVhc29uczogW2BkdXBsaWNhdGUgdGFyZ2V0IGF0ICR7a2V5fWBdLCB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gICAgc2Vlbi5hZGQoa2V5KTtcbiAgICBpZiAodC54IDwgcmVjdC54MCB8fCB0LnggPiByZWN0LngxIHx8IHQueiA8IHJlY3QuejAgfHwgdC56ID4gcmVjdC56MSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAndGFyZ2V0X291dHNpZGVfZm9vdHByaW50JyxcbiAgICAgICAgcmVhc29uczogW2B0YXJnZXQgJHtrZXl9IGlzIG91dHNpZGUgJHtyZWN0LngwfSwke3JlY3QuejB9Li4ke3JlY3QueDF9LCR7cmVjdC56MX1gXSxcbiAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcih0LnkpIHx8IHQueSA8IFlfTUlOIHx8IHQueSA+PSBZX01BWCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAndGFyZ2V0X2hlaWdodCcsXG4gICAgICAgIHJlYXNvbnM6IFtgdGFyZ2V0ICR7a2V5fSBoYXMgaW52YWxpZCBoZWlnaHQgJHt0Lnl9YF0sIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHM7XG4gIGNvbnN0IGNsZWFyID0gb3B0aW9ucy5jbGVhciA/PyAnb2JzdHJ1Y3Rpb25zJztcbiAgaWYgKGNsZWFyID09PSAnbm9uZScgJiYgb2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICd1bmNsZWFyZWRfb2JzdHJ1Y3Rpb25zJyxcbiAgICAgIHJlYXNvbnM6IFtgJHtvYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgd291bGQgcmVtYWluYF0sXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cbiAgY29uc3QgY2xlYXJFbnRpdHlJZHMgPSBjbGVhciA9PT0gJ25vbmUnID8gW10gOiBbLi4ubmV3IFNldChvYnN0cnVjdGlvbnMpXS5zb3J0KCk7XG4gIGNvbnN0IHN1cmZhY2VNYXRlcmlhbCA9IG9wdGlvbnMuc3VyZmFjZU1hdGVyaWFsID8/IG51bGw7XG5cbiAgY29uc3QgY3VzdG9tVGFyZ2V0cyA9IG9wdGlvbnMudGFyZ2V0cyAhPT0gdW5kZWZpbmVkO1xuICBjb25zdCBzdGF0cyA9IGN1c3RvbVRhcmdldHNcbiAgICA/IHRhcmdldFN0YXRzKHdvcmxkLCB0YXJnZXRzKVxuICAgIDoge1xuICAgICAgY3V0Vm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm1heEZpbGwsXG4gICAgICByZWxpZWY6IHZhbGlkYXRpb24ucXVlcnkuc3RhdHMucmVsaWVmLFxuICAgIH07XG4gIGlmIChjdXN0b21UYXJnZXRzKSB7XG4gICAgY29uc3QgcmVhc29ucyA9IHRhcmdldFJ1bGVSZWFzb25zKHN0YXRzLCBwcm9wb3NhbC5ydWxlcyk7XG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgICBjb2RlOiAndGFyZ2V0X3J1bGVzJyxcbiAgICAgICAgcmVhc29ucyxcbiAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgbGV0IGxvID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICBsZXQgaGkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIGxvID0gTWF0aC5taW4obG8sIHN1cmZhY2UsIHQueSk7XG4gICAgaGkgPSBNYXRoLm1heChoaSwgc3VyZmFjZSAtIDEsIHQueSAtIDEpO1xuICB9XG4gIGNvbnN0IGJ1ZmZlcmVkID0gZXhwYW5kUmVjdChyZWN0LCAxKTtcbiAgY29uc3QgZGVyaXZlZDogVm94ZWxSZWdpb24gPSB7XG4gICAgeDA6IE1hdGgubWF4KC1IQUxGLCBidWZmZXJlZC54MCksXG4gICAgejA6IE1hdGgubWF4KC1IQUxGLCBidWZmZXJlZC56MCksXG4gICAgeDE6IE1hdGgubWluKEhBTEYgLSAxLCBidWZmZXJlZC54MSksXG4gICAgejE6IE1hdGgubWluKEhBTEYgLSAxLCBidWZmZXJlZC56MSksXG4gICAgeTA6IE1hdGgubWF4KFlfTUlOLCBsbyAtIDEpLFxuICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIGhpICsgMSksXG4gIH07XG4gIC8vIEFuIGV4cGxpY2l0IGVudmVsb3BlIHJlcGxhY2VzIHRoZSBkZXJpdmVkIG9uZS4gQ2FsbGVycyB0aGF0IHBpbiBhbiBleGFjdFxuICAvLyB3b3JrIGVudmVsb3BlIChwYXRoIHByZXBhcmF0aW9uKSBtdXN0IG5vdCBzaWxlbnRseSB3aWRlbiBpdCB3aXRoIHRoZVxuICAvLyBkZWZhdWx0IDEgbSBidWZmZXIuXG4gIGNvbnN0IGVudmVsb3BlID0gbm9ybWFsaXplRW52ZWxvcGUob3B0aW9ucy5lbnZlbG9wZSA/PyBbZGVyaXZlZF0pO1xuICBjb25zdCBzdXJmYWNlRWRpdHMgPSBzdXJmYWNlTWF0ZXJpYWwgPT09IG51bGwgPyAwIDogdGFyZ2V0cy5sZW5ndGg7XG5cbiAgY29uc3QgcGxhbjogUHJlcGFyYXRpb25QbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIHJ1bGVzOiBwcm9wb3NhbC5ydWxlcyxcbiAgICB0YXJnZXRzLFxuICAgIGNsZWFyRW50aXR5SWRzLFxuICAgIHN1cmZhY2VNYXRlcmlhbCxcbiAgICBlbnZlbG9wZSxcbiAgICBleHBlY3RlZDoge1xuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgICAgb2JzdHJ1Y3Rpb25zOiBjbGVhckVudGl0eUlkcy5sZW5ndGgsXG4gICAgICBzdXJmYWNlRWRpdHMsXG4gICAgICB0b3RhbEVkaXRzOiBzdGF0cy5jdXRWb2x1bWUgKyBzdGF0cy5maWxsVm9sdW1lICsgc3VyZmFjZUVkaXRzLFxuICAgIH0sXG4gIH07XG4gIHBsYW4uaWQgPSBgcHJlcDoke3BsYW5EaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIHZhbGlkYXRpb24gfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBhdXRob3JpemF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvbkxpbWl0cyB7XG4gIG1heEN1dFZvbHVtZTogbnVtYmVyO1xuICBtYXhGaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heFZveGVsRWRpdHM6IG51bWJlcjtcbiAgbWF4RW50aXR5UmVtb3ZhbHM6IG51bWJlcjtcbiAgbWF4VGFyZ2V0czogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9MSU1JVFM6IEF1dGhvcml6YXRpb25MaW1pdHMgPSB7XG4gIG1heEN1dFZvbHVtZTogMjU2LFxuICBtYXhGaWxsVm9sdW1lOiAyNTYsXG4gIG1heFZveGVsRWRpdHM6IDEwMjQsXG4gIG1heEVudGl0eVJlbW92YWxzOiAxNixcbiAgbWF4VGFyZ2V0czogNTEyLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBXb3JrQXV0aG9yaXphdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgYmFzZVJldmlzaW9uOiBudW1iZXI7XG4gIGxpbWl0czogQXV0aG9yaXphdGlvbkxpbWl0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uRGVjaXNpb24ge1xuICBvazogYm9vbGVhbjtcbiAgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb24gfCBudWxsO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uUG9saWN5IHtcbiAgLyoqIFRoZSBvbmx5IHJlZ2lvbnMgdGhpcyBnb3Zlcm5vciBwZXJtaXRzIGZvciB0aGUgZmlyc3Qgc2xpY2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBsaW1pdHM/OiBQYXJ0aWFsPEF1dGhvcml6YXRpb25MaW1pdHM+O1xufVxuXG5mdW5jdGlvbiByZWdpb25Db250YWluZWQocmVnaW9uOiBWb3hlbFJlZ2lvbiwgcG9saWN5OiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogYm9vbGVhbiB7XG4gIHJldHVybiBwb2xpY3kuc29tZSgocCkgPT4gcmVnaW9uLngwID49IHAueDAgJiYgcmVnaW9uLngxIDw9IHAueDFcbiAgICAmJiByZWdpb24uejAgPj0gcC56MCAmJiByZWdpb24uejEgPD0gcC56MVxuICAgICYmIHJlZ2lvbi55MCA+PSBwLnkwICYmIHJlZ2lvbi55MSA8PSBwLnkxKTtcbn1cblxuLyoqXG4gKiBMb2NhbCBnb3Zlcm5vciBzdHViLiBJdCBlbmZvcmNlcyBhIGZpeGVkIGVudmVsb3BlIGFuZCBoYXJkIHZvbHVtZSBsaW1pdHMsXG4gKiBiaW5kcyBhIHRva2VuIHRvIHRoZSBleGFjdCBwbGFuIGRpZ2VzdCBhbmQgd29ybGQgcmV2aXNpb24sIGFuZCByZWZ1c2VzIHRvXG4gKiBwcmV0ZW5kIGl0IGlzIGFuIG9uLWNoYWluIGF1dGhvcml0eS5cbiAqL1xuZXhwb3J0IGNsYXNzIExvY2FsQXV0aG9yaXplciB7XG4gIHJlYWRvbmx5IGF1dGhvcml0eSA9IExPQ0FMX0FVVEhPUklUWTtcbiAgcmVhZG9ubHkgZW5mb3JjZW1lbnQgPSBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcmVhZG9ubHkgbGltaXRzOiBBdXRob3JpemF0aW9uTGltaXRzO1xuXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHBvbGljeTogQXV0aG9yaXphdGlvblBvbGljeSkge1xuICAgIHRoaXMubGltaXRzID0geyAuLi5ERUZBVUxUX0xJTUlUUywgLi4uKHBvbGljeS5saW1pdHMgPz8ge30pIH07XG4gIH1cblxuICBhdXRob3JpemUod29ybGQ6IFdvcmxkLCBwbGFuOiBQcmVwYXJhdGlvblBsYW4pOiBBdXRob3JpemF0aW9uRGVjaXNpb24ge1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocGxhbi5yZWN0KTtcblxuICAgIGlmIChwbGFuLnRhcmdldHMubGVuZ3RoICE9PSByZWN0Q29sdW1ucyhyZWN0KSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFuIGhhcyAke3BsYW4udGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZm9yICR7cmVjdENvbHVtbnMocmVjdCl9IGNvbHVtbnNgKTtcbiAgICB9XG4gICAgaWYgKHBsYW4udGFyZ2V0cy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhUYXJnZXRzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi50YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhUYXJnZXRzfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC5jdXRWb2x1bWUgPiB0aGlzLmxpbWl0cy5tYXhDdXRWb2x1bWUpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgY3V0ICR7cGxhbi5leHBlY3RlZC5jdXRWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhDdXRWb2x1bWV9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLmZpbGxWb2x1bWUgPiB0aGlzLmxpbWl0cy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgICByZWFzb25zLnB1c2goYGZpbGwgJHtwbGFuLmV4cGVjdGVkLmZpbGxWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhGaWxsVm9sdW1lfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC50b3RhbEVkaXRzID4gdGhpcy5saW1pdHMubWF4Vm94ZWxFZGl0cykge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFubmVkIGVkaXRzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heFZveGVsRWRpdHN9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCA+IHRoaXMubGltaXRzLm1heEVudGl0eVJlbW92YWxzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGh9IHJlbW92YWxzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heEVudGl0eVJlbW92YWxzfWApO1xuICAgIH1cbiAgICBpZiAobmV3IFNldChwbGFuLmNsZWFyRW50aXR5SWRzKS5zaXplICE9PSBwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdkdXBsaWNhdGUgZW50aXR5IHJlbW92YWwgaWRzJyk7XG4gICAgfVxuXG4gICAgaWYgKHBsYW4uZW52ZWxvcGUubGVuZ3RoID09PSAwKSB7XG4gICAgICByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIHdvcmsgZW52ZWxvcGUnKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCByZWdpb24gb2YgcGxhbi5lbnZlbG9wZSkge1xuICAgICAgaWYgKCFyZWdpb25Db250YWluZWQocmVnaW9uLCB0aGlzLnBvbGljeS5lbnZlbG9wZSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBlbnZlbG9wZSAke3JlZ2lvbi54MH0sJHtyZWdpb24uejB9LCR7cmVnaW9uLnkwfS4uJHtyZWdpb24ueDF9LCR7cmVnaW9uLnoxfSwke3JlZ2lvbi55MX0gaXMgb3V0c2lkZSB0aGUgbG9jYWwgcG9saWN5YCk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIHtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhwbGFuLmVudmVsb3BlLCB0LngsIHQueSwgdC56KVxuICAgICAgICB8fCAodC55ID4gWV9NSU4gJiYgIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgdC54LCB0LnkgLSAxLCB0LnopKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYHRhcmdldCAke3QueH0sJHt0Lnp9LCR7dC55fSBpcyBub3QgY292ZXJlZCBieSB0aGUgd29yayBlbnZlbG9wZWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEV2ZXJ5IG9ic3RydWN0aW9uIGN1cnJlbnRseSBvbiB0aGUgZm9vdHByaW50IG11c3QgYmUgaW4gdGhlIHBsYW4sIGFuZFxuICAgIC8vIHRoZSBwbGFuIG1heSBub3QgcmVtb3ZlIGFueXRoaW5nIHRoYXQgaXMgbm90IGFuIG9ic3RydWN0aW9uIHRoZXJlLlxuICAgIGNvbnN0IGN1cnJlbnQgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCkubWFwKChvKSA9PiBvLmVudGl0eUlkKS5zb3J0KCk7XG4gICAgY29uc3QgcGxhbm5lZCA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gICAgaWYgKGN1cnJlbnQubGVuZ3RoICE9PSBwbGFubmVkLmxlbmd0aCB8fCBjdXJyZW50LnNvbWUoKGlkLCBpKSA9PiBpZCAhPT0gcGxhbm5lZFtpXSkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbiByZW1vdmFscyBbJHtwbGFubmVkLmpvaW4oJywnKX1dIGRvIG5vdCBtYXRjaCBmb290cHJpbnQgb2JzdHJ1Y3Rpb25zIFske2N1cnJlbnQuam9pbignLCcpfV1gKTtcbiAgICB9XG5cbiAgICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4geyBvazogZmFsc2UsIGF1dGhvcml6YXRpb246IG51bGwsIHJlYXNvbnMgfTtcblxuICAgIGNvbnN0IHRva2VuOiBXb3JrQXV0aG9yaXphdGlvbiA9IHtcbiAgICAgIGlkOiBgbG9jYWwtc3R1Yjoke3BsYW5EaWdlc3QocGxhbil9YCxcbiAgICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgICAgcGxhbkRpZ2VzdDogcGxhbkRpZ2VzdChwbGFuKSxcbiAgICAgIGVudmVsb3BlOiBub3JtYWxpemVFbnZlbG9wZShwbGFuLmVudmVsb3BlKSxcbiAgICAgIGJhc2VSZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgICBsaW1pdHM6IHsgLi4udGhpcy5saW1pdHMgfSxcbiAgICB9O1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBhdXRob3JpemF0aW9uOiB0b2tlbiwgcmVhc29uczogW10gfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIGV4ZWN1dGlvbiAtLS0tLS0tLS0tXG5pbnRlcmZhY2UgUGVuZGluZ0VkaXQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBiZWZvcmU6IE1hdElkO1xuICBhZnRlcjogTWF0SWQ7XG4gIC8qKiBUcnVlIGZvciBhIG1hdGVyaWFsLW9ubHkgdG9wLXN1cmZhY2UgY2hhbmdlLiAqL1xuICBzdXJmYWNlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgY2h1bms6IHN0cmluZztcbiAgY2hhbmdlZDogbnVtYmVyO1xuICBhZGRlZDogbnVtYmVyO1xuICByZW1vdmVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2xlYXJlZEVudGl0eSB7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsO1xuICBhbW91bnQ6IG51bWJlcjtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbkxlZGdlciB7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgYXV0aG9yaXphdGlvbklkOiBzdHJpbmc7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBuZXRTcG9pbDogbnVtYmVyO1xuICBib3Jyb3dlZEZpbGw6IG51bWJlcjtcbiAgY3V0QnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgZmlsbEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIHZveGVsRWRpdHM6IG51bWJlcjtcbiAgc3VyZmFjZUVkaXRzOiBudW1iZXI7XG4gIGVudGl0aWVzQ2xlYXJlZDogQ2xlYXJlZEVudGl0eVtdO1xuICByZXNvdXJjZXNHYWluZWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGludmVudG9yeUJlZm9yZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaW52ZW50b3J5QWZ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGNodW5rRGVsdGFzOiBDaHVua0RlbHRhW107XG4gIHJldmlzaW9uQmVmb3JlOiBudW1iZXI7XG4gIHJldmlzaW9uQWZ0ZXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogUHJlcGFyYXRpb25QbGFuO1xuICBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbjtcbiAgbGVkZ2VyOiBQcmVwYXJhdGlvbkxlZGdlcjtcbn1cblxuZXhwb3J0IHR5cGUgUHJlcGFyYXRpb25PdXRjb21lID0gUHJlcGFyYXRpb25TdWNjZXNzIHwgUHJlcGFyYXRpb25GYWlsdXJlO1xuXG5jb25zdCBNQVRFUklBTF9OQU1FUzogUmVjb3JkPG51bWJlciwgc3RyaW5nPiA9IHtcbiAgW01BVC5HUkFTU106ICdncmFzcycsXG4gIFtNQVQuU09JTF06ICdzb2lsJyxcbiAgW01BVC5TQU5EXTogJ3NhbmQnLFxuICBbTUFULkdSQVZFTF06ICdncmF2ZWwnLFxuICBbTUFULlNUT05FXTogJ3N0b25lJyxcbiAgW01BVC5PUkVdOiAnb3JlJyxcbiAgW01BVC5XQVRFUl06ICd3YXRlcicsXG4gIFtNQVQuQkVEUk9DS106ICdiZWRyb2NrJyxcbiAgW01BVC5NT1NTXTogJ21vc3MnLFxufTtcblxuZnVuY3Rpb24gbWF0ZXJpYWxOYW1lKG06IE1hdElkKTogc3RyaW5nIHtcbiAgcmV0dXJuIE1BVEVSSUFMX05BTUVTW21dID8/IGBtYXRfJHttfWA7XG59XG5cbmZ1bmN0aW9uIGZpbGxNYXRlcmlhbCh5OiBudW1iZXIsIHRhcmdldDogbnVtYmVyKTogTWF0SWQge1xuICByZXR1cm4geSA9PT0gdGFyZ2V0IC0gMSA/IE1BVC5HUkFTUyA6IE1BVC5TT0lMO1xufVxuXG5mdW5jdGlvbiBmYWlsKHN0YWdlOiBQcmVwYXJhdGlvbkZhaWx1cmVbJ3N0YWdlJ10sIGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBQcmVwYXJhdGlvbkZhaWx1cmUge1xuICByZXR1cm4geyBvazogZmFsc2UsIHN0YWdlLCBjb2RlLCByZWFzb25zIH07XG59XG5cbi8qKlxuICogQXBwbHkgYW4gYXV0aG9yaXplZCBwbGFuLiBObyB2b3hlbCBpcyB3cml0dGVuIHVudGlsIGV2ZXJ5IGVkaXQgYW5kIHJlbW92YWxcbiAqIGhhcyBiZWVuIGNoZWNrZWQgYWdhaW5zdCB0aGUgdG9rZW4sIHRoZSBwbGFuIGVudmVsb3BlIGFuZCB0aGUgaGFyZCBsaW1pdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleGVjdXRlUHJlcGFyYXRpb24oXG4gIHdvcmxkOiBXb3JsZCwgcGxhbjogUHJlcGFyYXRpb25QbGFuLCBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbixcbik6IFByZXBhcmF0aW9uT3V0Y29tZSB7XG4gIGlmIChhdXRob3JpemF0aW9uLmF1dGhvcml0eSAhPT0gTE9DQUxfQVVUSE9SSVRZXG4gICAgfHwgYXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudCAhPT0gTE9DQUxfRU5GT1JDRU1FTlQpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bnN1cHBvcnRlZF9hdXRob3JpdHknLCBbXG4gICAgICBgYXV0aG9yaXR5ICR7YXV0aG9yaXphdGlvbi5hdXRob3JpdHl9LyR7YXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudH0gaXMgbm90IHRoZSBsb2NhbCBzdHViYCxcbiAgICBdKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0ICE9PSBwbGFuRGlnZXN0KHBsYW4pKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZGlnZXN0X21pc21hdGNoJywgWydhdXRob3JpemF0aW9uIGRvZXMgbm90IG1hdGNoIHRoaXMgcGxhbiddKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb24gIT09IHdvcmxkLnJldmlzaW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnc3RhbGVfYXV0aG9yaXphdGlvbicsIFtcbiAgICAgIGBhdXRob3JpemF0aW9uIHdhcyBpc3N1ZWQgYXQgcmV2aXNpb24gJHthdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbn0sIHdvcmxkIGlzIGF0ICR7d29ybGQucmV2aXNpb259YCxcbiAgICBdKTtcbiAgfVxuICBpZiAocGxhbi5lbnZlbG9wZS5zb21lKChyKSA9PiAhcmVnaW9uQ29udGFpbmVkKHIsIGF1dGhvcml6YXRpb24uZW52ZWxvcGUpKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2VudmVsb3BlX21pc21hdGNoJywgWydwbGFuIGVudmVsb3BlIGlzIHdpZGVyIHRoYW4gdGhlIGF1dGhvcml6YXRpb24nXSk7XG4gIH1cblxuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwbGFuLnJlY3QpO1xuICBjb25zdCBlZGl0czogUGVuZGluZ0VkaXRbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIGlmICh0LnkgPCBzdXJmYWNlKSB7XG4gICAgICBmb3IgKGxldCB5ID0gdC55OyB5IDwgc3VyZmFjZTsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHksIHQueik7XG4gICAgICAgIGlmIChpc1NvbGlkKGJlZm9yZSkpIGVkaXRzLnB1c2goeyB4OiB0LngsIHksIHo6IHQueiwgYmVmb3JlLCBhZnRlcjogTUFULkFJUiB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHQueSA+IHN1cmZhY2UpIHtcbiAgICAgIGZvciAobGV0IHkgPSBzdXJmYWNlOyB5IDwgdC55OyB5KyspIHtcbiAgICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgeSwgdC56KTtcbiAgICAgICAgaWYgKCFpc1NvbGlkKGJlZm9yZSkpIHtcbiAgICAgICAgICBjb25zdCBhZnRlciA9IHBsYW4uc3VyZmFjZU1hdGVyaWFsICE9PSBudWxsICYmIHkgPT09IHQueSAtIDFcbiAgICAgICAgICAgID8gcGxhbi5zdXJmYWNlTWF0ZXJpYWxcbiAgICAgICAgICAgIDogZmlsbE1hdGVyaWFsKHksIHQueSk7XG4gICAgICAgICAgZWRpdHMucHVzaCh7IHg6IHQueCwgeSwgejogdC56LCBiZWZvcmUsIGFmdGVyIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIE1hdGVyaWFsLW9ubHkgc3VyZmFjZSBjaGFuZ2UgZm9yIGN1dCBvciBhbHJlYWR5LWxldmVsIGNvbHVtbnMuIEZpbGxcbiAgICAvLyBjb2x1bW5zIGFscmVhZHkgcmVjZWl2ZSB0aGUgc3VyZmFjZSBtYXRlcmlhbCBpbiB0aGUgZmlsbCBsb29wIGFib3ZlLlxuICAgIGlmIChwbGFuLnN1cmZhY2VNYXRlcmlhbCAhPT0gbnVsbCkge1xuICAgICAgY29uc3QgdG9wWSA9IHQueSAtIDE7XG4gICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB0b3BZLCB0LnopO1xuICAgICAgaWYgKGlzU29saWQoYmVmb3JlKSAmJiBiZWZvcmUgIT09IHBsYW4uc3VyZmFjZU1hdGVyaWFsKSB7XG4gICAgICAgIGVkaXRzLnB1c2goe1xuICAgICAgICAgIHg6IHQueCwgeTogdG9wWSwgejogdC56LCBiZWZvcmUsIGFmdGVyOiBwbGFuLnN1cmZhY2VNYXRlcmlhbCwgc3VyZmFjZTogdHJ1ZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgZXZlcnkgZWRpdCBiZWZvcmUgbXV0YXRpbmcgYW55dGhpbmcuXG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgZSBvZiBlZGl0cykge1xuICAgIGlmIChlLnggPCByZWN0LngwIHx8IGUueCA+IHJlY3QueDEgfHwgZS56IDwgcmVjdC56MCB8fCBlLnogPiByZWN0LnoxKSB7XG4gICAgICByZWFzb25zLnB1c2goYGVkaXQgJHtlLnh9LCR7ZS55fSwke2Uuen0gaXMgb3V0c2lkZSB0aGUgZm9vdHByaW50YCk7XG4gICAgfVxuICAgIGlmICghZW52ZWxvcGVDb250YWlucyhhdXRob3JpemF0aW9uLmVudmVsb3BlLCBlLngsIGUueSwgZS56KSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBlZGl0ICR7ZS54fSwke2UueX0sJHtlLnp9IGlzIG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgZW52ZWxvcGVgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgY3V0Vm9sdW1lID0gZWRpdHMuZmlsdGVyKChlKSA9PiBlLmFmdGVyID09PSBNQVQuQUlSICYmIGlzU29saWQoZS5iZWZvcmUpKS5sZW5ndGg7XG4gIGNvbnN0IGZpbGxWb2x1bWUgPSBlZGl0cy5maWx0ZXIoKGUpID0+IGUuYWZ0ZXIgIT09IE1BVC5BSVIgJiYgIWlzU29saWQoZS5iZWZvcmUpKS5sZW5ndGg7XG4gIGlmIChjdXRWb2x1bWUgPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCAke2N1dFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEN1dFZvbHVtZX1gKTtcbiAgfVxuICBpZiAoZmlsbFZvbHVtZSA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgJHtmaWxsVm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4RmlsbFZvbHVtZX1gKTtcbiAgfVxuICBpZiAoZWRpdHMubGVuZ3RoID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4Vm94ZWxFZGl0cykge1xuICAgIHJlYXNvbnMucHVzaChgJHtlZGl0cy5sZW5ndGh9IGVkaXRzIGV4Y2VlZCBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heFZveGVsRWRpdHN9YCk7XG4gIH1cblxuICBjb25zdCBjdXJyZW50ID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpLm1hcCgobykgPT4gby5lbnRpdHlJZCkuc29ydCgpO1xuICBjb25zdCBwbGFubmVkID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgaWYgKGN1cnJlbnQubGVuZ3RoICE9PSBwbGFubmVkLmxlbmd0aCB8fCBjdXJyZW50LnNvbWUoKGlkLCBpKSA9PiBpZCAhPT0gcGxhbm5lZFtpXSkpIHtcbiAgICByZWFzb25zLnB1c2goJ2Zvb3RwcmludCBvYnN0cnVjdGlvbnMgY2hhbmdlZCBhZnRlciBhdXRob3JpemF0aW9uJyk7XG4gIH1cbiAgaWYgKHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHMpIHtcbiAgICByZWFzb25zLnB1c2goYCR7cGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGh9IHJlbW92YWxzIGV4Y2VlZCBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEVudGl0eVJlbW92YWxzfWApO1xuICB9XG4gIGZvciAoY29uc3QgaWQgb2YgcGxhbi5jbGVhckVudGl0eUlkcykge1xuICAgIGlmICghd29ybGQuZW50aXRpZXMuaGFzKGlkKSkgcmVhc29ucy5wdXNoKGBlbnRpdHkgJHtpZH0gbm8gbG9uZ2VyIGV4aXN0c2ApO1xuICB9XG4gIGlmICh3b3JsZC5saWZlKSB7XG4gICAgbGV0IHJlY292ZXJlZCA9IDA7XG4gICAgZm9yIChjb25zdCBpZCBvZiBwbGFuLmNsZWFyRW50aXR5SWRzKSB7XG4gICAgICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgaWYgKGVudGl0eT8ucmVzb3VyY2UgJiYgZW50aXR5LnJlbWFpbmluZyA+IDApIHJlY292ZXJlZCArPSBlbnRpdHkucmVtYWluaW5nO1xuICAgIH1cbiAgICAvLyBDaGVjayBiZWZvcmUgYW55IHZveGVsIG9yIGVudGl0eSBjaGFuZ2VzLCBwcmVzZXJ2aW5nIGxlZ2FjeSB1bmJvdW5kZWRcbiAgICAvLyBjb25zdHJ1Y3Rpb24gYmVoYXZpb3IgYW5kIHNjaGVtYS0zIGNhcnJpZWQtY2FwYWNpdHkgY29uc2VydmF0aW9uLlxuICAgIGlmIChPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIGFtb3VudCkgPT4gc3VtICsgYW1vdW50LCAwKSArIHJlY292ZXJlZCA+IDEyMCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdyZXNvdXJjZXMgcmVjb3ZlcmVkIGR1cmluZyBzaXRlIGNsZWFyaW5nIHdvdWxkIGV4Y2VlZCBjYXJyaWVkIGNhcGFjaXR5IDEyMCcpO1xuICAgIH1cbiAgfVxuICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bmF1dGhvcml6ZWRfZWRpdHMnLCByZWFzb25zKTtcblxuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IHJldmlzaW9uQmVmb3JlID0gd29ybGQucmV2aXNpb247XG4gIGNvbnN0IGNodW5rRGVsdGFzID0gbmV3IE1hcDxzdHJpbmcsIENodW5rRGVsdGE+KCk7XG4gIGNvbnN0IGN1dEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgY29uc3QgZmlsbEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgbGV0IGFwcGxpZWQgPSAwO1xuICBsZXQgc3VyZmFjZUVkaXRzID0gMDtcblxuICBmb3IgKGNvbnN0IGUgb2YgZWRpdHMpIHtcbiAgICBpZiAoIXNldFZveGVsKHdvcmxkLCBlLngsIGUueSwgZS56LCBlLmFmdGVyKSkgY29udGludWU7XG4gICAgYXBwbGllZCsrO1xuICAgIGlmIChlLnN1cmZhY2UpIHN1cmZhY2VFZGl0cysrO1xuICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KHdvcmxkVG9DaHVua1goZS54KSwgd29ybGRUb0NodW5rWihlLnopKTtcbiAgICBsZXQgZGVsdGEgPSBjaHVua0RlbHRhcy5nZXQoa2V5KTtcbiAgICBpZiAoIWRlbHRhKSB7XG4gICAgICBkZWx0YSA9IHsgY2h1bms6IGtleSwgY2hhbmdlZDogMCwgYWRkZWQ6IDAsIHJlbW92ZWQ6IDAgfTtcbiAgICAgIGNodW5rRGVsdGFzLnNldChrZXksIGRlbHRhKTtcbiAgICB9XG4gICAgZGVsdGEuY2hhbmdlZCsrO1xuICAgIGNvbnN0IHdhc1NvbGlkID0gaXNTb2xpZChlLmJlZm9yZSk7XG4gICAgY29uc3QgaXNOb3dTb2xpZCA9IGlzU29saWQoZS5hZnRlcik7XG4gICAgaWYgKCF3YXNTb2xpZCAmJiBpc05vd1NvbGlkKSBkZWx0YS5hZGRlZCsrO1xuICAgIGlmICh3YXNTb2xpZCAmJiAhaXNOb3dTb2xpZCkgZGVsdGEucmVtb3ZlZCsrO1xuICAgIGNvbnN0IG5hbWUgPSBtYXRlcmlhbE5hbWUoZS5iZWZvcmUpO1xuICAgIGlmICh3YXNTb2xpZCAmJiAhaXNOb3dTb2xpZCkgY3V0QnlNYXRlcmlhbFtuYW1lXSA9IChjdXRCeU1hdGVyaWFsW25hbWVdID8/IDApICsgMTtcbiAgICBpZiAoIXdhc1NvbGlkICYmIGlzTm93U29saWQpIGZpbGxCeU1hdGVyaWFsW21hdGVyaWFsTmFtZShlLmFmdGVyKV0gPSAoZmlsbEJ5TWF0ZXJpYWxbbWF0ZXJpYWxOYW1lKGUuYWZ0ZXIpXSA/PyAwKSArIDE7XG4gIH1cblxuICBjb25zdCBlbnRpdGllc0NsZWFyZWQ6IENsZWFyZWRFbnRpdHlbXSA9IFtdO1xuICBjb25zdCByZXNvdXJjZXNHYWluZWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7fTtcbiAgZm9yIChjb25zdCBpZCBvZiBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKCFlKSBjb250aW51ZTtcbiAgICBjb25zdCBhbW91bnQgPSBlLnJlc291cmNlICYmIGUucmVtYWluaW5nID4gMCA/IGUucmVtYWluaW5nIDogMDtcbiAgICBpZiAoZS5yZXNvdXJjZSAmJiBhbW91bnQgPiAwKSB7XG4gICAgICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgICAgcmVzb3VyY2VzR2FpbmVkW2UucmVzb3VyY2VdID0gKHJlc291cmNlc0dhaW5lZFtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgICB9XG4gICAgcmVtb3ZlRW50aXR5KHdvcmxkLCBpZCk7XG4gICAgZW50aXRpZXNDbGVhcmVkLnB1c2goe1xuICAgICAgZW50aXR5SWQ6IGlkLCBraW5kOiBlLmtpbmQsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQsIHg6IGUueCwgeTogZS55LCB6OiBlLnosXG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBjdXQgPSBhcHBsaWVkID4gMCA/IE9iamVjdC52YWx1ZXMoY3V0QnlNYXRlcmlhbCkucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgOiAwO1xuICBjb25zdCBmaWxsID0gYXBwbGllZCA+IDAgPyBPYmplY3QudmFsdWVzKGZpbGxCeU1hdGVyaWFsKS5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSA6IDA7XG4gIGNvbnN0IGxlZGdlcjogUHJlcGFyYXRpb25MZWRnZXIgPSB7XG4gICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgIGF1dGhvcml6YXRpb25JZDogYXV0aG9yaXphdGlvbi5pZCxcbiAgICBwbGFuRGlnZXN0OiBhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QsXG4gICAgc2l0ZUlkOiBwbGFuLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcGxhbi5mbG9vclksXG4gICAgY3V0Vm9sdW1lOiBjdXQsXG4gICAgZmlsbFZvbHVtZTogZmlsbCxcbiAgICBuZXRTcG9pbDogY3V0IC0gZmlsbCxcbiAgICBib3Jyb3dlZEZpbGw6IE1hdGgubWF4KDAsIGZpbGwgLSBjdXQpLFxuICAgIGN1dEJ5TWF0ZXJpYWwsXG4gICAgZmlsbEJ5TWF0ZXJpYWwsXG4gICAgdm94ZWxFZGl0czogYXBwbGllZCxcbiAgICBzdXJmYWNlRWRpdHMsXG4gICAgZW50aXRpZXNDbGVhcmVkLFxuICAgIHJlc291cmNlc0dhaW5lZCxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICBjaHVua0RlbHRhczogWy4uLmNodW5rRGVsdGFzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykpLFxuICAgIHJldmlzaW9uQmVmb3JlLFxuICAgIHJldmlzaW9uQWZ0ZXI6IHdvcmxkLnJldmlzaW9uLFxuICB9O1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiwgYXV0aG9yaXphdGlvbiwgbGVkZ2VyIH07XG59XG5cbi8qKlxuICogVGhlIHNoYXJlZCBwbGF5ZXIvQUkgZW50cnkgcG9pbnQuIFRoZXJlIGlzIG5vIG90aGVyIGNvbnN0cnVjdGlvbiBwYXRoLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJlcGFyZVNpdGUoXG4gIHdvcmxkOiBXb3JsZCxcbiAgYXV0aG9yaXplcjogTG9jYWxBdXRob3JpemVyLFxuICBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLFxuICBvcHRpb25zOiBQcmVwYXJhdGlvbk9wdGlvbnMgPSB7fSxcbik6IFByZXBhcmF0aW9uT3V0Y29tZSB7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUHJlcGFyYXRpb24od29ybGQsIHByb3Bvc2FsLCBvcHRpb25zKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgY29uc3QgZGVjaXNpb24gPSBhdXRob3JpemVyLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgaWYgKCFkZWNpc2lvbi5vayB8fCAhZGVjaXNpb24uYXV0aG9yaXphdGlvbikge1xuICAgIHJldHVybiBmYWlsKCdhdXRob3JpemUnLCAnbm90X2F1dGhvcml6ZWQnLCBkZWNpc2lvbi5yZWFzb25zKTtcbiAgfVxuICByZXR1cm4gZXhlY3V0ZVByZXBhcmF0aW9uKHdvcmxkLCBwbGFubmVkLnBsYW4sIGRlY2lzaW9uLmF1dGhvcml6YXRpb24pO1xufVxuIiwgIi8vIENhbm9uaWNhbCBzdGF0ZSBoYXNoaW5nIFx1MjAxNCBwdXJlIHNpbXVsYXRpb24sIG5vIHRocmVlLmpzIGltcG9ydHMuXG4vL1xuLy8gVGhlIG5vLWZsYXR0ZW4gcHJvb2YgY29tcGFyZXMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lIG91dHNpZGUgdGhlXG4vLyBjb21wbGV0ZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUuIEl0IGRlbGliZXJhdGVseSBkb2VzIG5vdCBoYXNoIGNodW5rXG4vLyBoZWlnaHRzL3RvcE1hdGVyaWFscyAoZGVyaXZlZCBjYWNoZXMpLCBtZXNoIGdlb21ldHJ5LCBzdHJlYW1pbmcgc3RhdGUgb3Jcbi8vIG5hdmlnYXRpb24gZGF0YS4gVGhvc2UgYXJlIGNoZWNrZWQgc2VwYXJhdGVseSBhcyBkZXJpdmVkIHN0YXRlLCBzbyBhIGNhY2hlXG4vLyBvciBtZXNoIHJlYnVpbGQgY2FuIG5ldmVyIGJlIG1pc3Rha2VuIGZvciBhIHRlcnJhaW4gbXV0YXRpb24uXG5pbXBvcnQge1xuICBXb3JsZCwgWV9NSU4sIFlfTUFYLCBIQUxGLCBDSFVOS19TSVpFLCBDSFVOS19BUkVBLFxuICBlbnN1cmVDaHVuaywgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCwgaXNTb2xpZCxcbiAgRW50aXR5LFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IFZveGVsUmVnaW9uLCBlbnZlbG9wZUNvbnRhaW5zIH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0YXRlSGFzaCB7XG4gIC8qKiAxNiBoZXggY2hhcmFjdGVyczogdHdvIGluZGVwZW5kZW50IDMyLWJpdCBsYW5lcy4gKi9cbiAgaGFzaDogc3RyaW5nO1xuICBjZWxsczogbnVtYmVyO1xuICBleGNsdWRlZENlbGxzOiBudW1iZXI7XG4gIGNodW5rczogbnVtYmVyO1xuICByZWdpb246IFZveGVsUmVnaW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlTWlzbWF0Y2gge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgZmllbGQ6ICdoZWlnaHQnIHwgJ21hdGVyaWFsJztcbiAgZXhwZWN0ZWQ6IG51bWJlcjtcbiAgYWN0dWFsOiBudW1iZXI7XG59XG5cbmNsYXNzIEhhc2hlciB7XG4gIHByaXZhdGUgYSA9IDB4ODExYzlkYzU7XG4gIHByaXZhdGUgYiA9IDB4OWUzNzc5Yjk7XG5cbiAgYnl0ZSh2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCB4ID0gdiAmIDB4ZmY7XG4gICAgdGhpcy5hID0gTWF0aC5pbXVsKHRoaXMuYSBeIHgsIDB4MDEwMDAxOTMpO1xuICAgIHRoaXMuYiA9IE1hdGguaW11bCh0aGlzLmIgXiAoeCArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICB0aGlzLmIgXj0gdGhpcy5iID4+PiAxMztcbiAgfVxuXG4gIHUzMih2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBsZXQgbiA9IHYgPj4+IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA0OyBpKyspIHtcbiAgICAgIHRoaXMuYnl0ZShuKTtcbiAgICAgIG4gPj4+PSA4O1xuICAgIH1cbiAgfVxuXG4gIHN0cmluZyhzOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLnUzMihzLmxlbmd0aCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSsrKSB0aGlzLmJ5dGUocy5jaGFyQ29kZUF0KGkpKTtcbiAgfVxuXG4gIGhleCgpOiBzdHJpbmcge1xuICAgIHJldHVybiAodGhpcy5hID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICAgKyAodGhpcy5iID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXBSZWdpb24ocmVnaW9uOiBWb3hlbFJlZ2lvbik6IFZveGVsUmVnaW9uIHtcbiAgY29uc3QgcjogVm94ZWxSZWdpb24gPSB7XG4gICAgeDA6IE1hdGgubWF4KC1IQUxGLCBNYXRoLmZsb29yKHJlZ2lvbi54MCkpLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgTWF0aC5mbG9vcihyZWdpb24uejApKSxcbiAgICB4MTogTWF0aC5taW4oSEFMRiAtIDEsIE1hdGguZmxvb3IocmVnaW9uLngxKSksXG4gICAgejE6IE1hdGgubWluKEhBTEYgLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi56MSkpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgTWF0aC5mbG9vcihyZWdpb24ueTApKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi55MSkpLFxuICB9O1xuICBpZiAoci54MCA+IHIueDEgfHwgci56MCA+IHIuejEgfHwgci55MCA+IHIueTEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYGVtcHR5IHZveGVsIHJlZ2lvbiAke0pTT04uc3RyaW5naWZ5KHJlZ2lvbil9YCk7XG4gIH1cbiAgcmV0dXJuIHI7XG59XG5cbi8qKiBTb3J0IGFuIGVudmVsb3BlIHNvIGl0cyBoYXNoIGlzIGluZGVwZW5kZW50IG9mIHJlY3Qgb3JkZXIuICovXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplRW52ZWxvcGUocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBWb3hlbFJlZ2lvbltdIHtcbiAgcmV0dXJuIHJlY3RzXG4gICAgLm1hcCgocikgPT4gKHtcbiAgICAgIHgwOiBNYXRoLmZsb29yKHIueDApLCB6MDogTWF0aC5mbG9vcihyLnowKSwgeDE6IE1hdGguZmxvb3Ioci54MSksIHoxOiBNYXRoLmZsb29yKHIuejEpLFxuICAgICAgeTA6IE1hdGguZmxvb3Ioci55MCksIHkxOiBNYXRoLmZsb29yKHIueTEpLFxuICAgIH0pKVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLngwIC0gYi54MCB8fCBhLnowIC0gYi56MCB8fCBhLnkwIC0gYi55MFxuICAgICAgfHwgYS54MSAtIGIueDEgfHwgYS56MSAtIGIuejEgfHwgYS55MSAtIGIueTEpO1xufVxuXG4vKiogTWF0ZXJpYWxpc2UgZXZlcnkgY2h1bmsgdGhhdCBvdmVybGFwcyB0aGUgcmVnaW9uIGFuZCByZXR1cm4gc29ydGVkIGtleXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IHdvcmxkVG9DaHVua1goci54MCksIGN4MSA9IHdvcmxkVG9DaHVua1goci54MSk7XG4gIGNvbnN0IGN6MCA9IHdvcmxkVG9DaHVua1ooci56MCksIGN6MSA9IHdvcmxkVG9DaHVua1ooci56MSk7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2N4fSwke2N6fSBpcyBvdXRzaWRlIHRoZSB3b3JsZGApO1xuICAgICAga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICAgIH1cbiAgfVxuICBrZXlzLnNvcnQoKTtcbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKlxuICogSGFzaCB0aGUgYXV0aG9yaXRhdGl2ZSBtYXRlcmlhbCBieXRlIG9mIGV2ZXJ5IHZveGVsIGluIGByZWdpb25gLCBleGNsdWRpbmdcbiAqIGV2ZXJ5IHZveGVsIGluc2lkZSBgZXhjbHVkZWAuIFR3byBjYWxscyB3aXRoIHRoZSBzYW1lIHJlZ2lvbiBhbmQgZW52ZWxvcGVcbiAqIGFyZSBkaXJlY3RseSBjb21wYXJhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsUmVnaW9uSGFzaChcbiAgd29ybGQ6IFdvcmxkLFxuICByZWdpb246IFZveGVsUmVnaW9uLFxuICBleGNsdWRlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdID0gW10sXG4pOiBTdGF0ZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3QgZW52ZWxvcGUgPSBub3JtYWxpemVFbnZlbG9wZShleGNsdWRlKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnZveGVsLXN0YXRlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpOyBoLnUzMihyLnkwKTsgaC51MzIoci55MSk7XG4gIGgudTMyKGVudmVsb3BlLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgZSBvZiBlbnZlbG9wZSkge1xuICAgIGgudTMyKGUueDApOyBoLnUzMihlLnowKTsgaC51MzIoZS54MSk7IGgudTMyKGUuejEpOyBoLnUzMihlLnkwKTsgaC51MzIoZS55MSk7XG4gIH1cblxuICBsZXQgY2VsbHMgPSAwO1xuICBsZXQgZXhjbHVkZWRDZWxscyA9IDA7XG4gIGNvbnN0IHlpMCA9IHIueTAgLSBZX01JTjtcbiAgY29uc3QgeWkxID0gci55MSAtIFlfTUlOO1xuXG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IHlpID0geWkwOyB5aSA8PSB5aTE7IHlpKyspIHtcbiAgICAgIGNvbnN0IHkgPSBZX01JTiArIHlpO1xuICAgICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgICBjb25zdCB6ID0gb3ogKyBsejtcbiAgICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICAgIGNvbnN0IHggPSBveCArIGx4O1xuICAgICAgICAgIGlmIChlbnZlbG9wZS5sZW5ndGggPiAwICYmIGVudmVsb3BlQ29udGFpbnMoZW52ZWxvcGUsIHgsIHksIHopKSB7XG4gICAgICAgICAgICBleGNsdWRlZENlbGxzKys7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaC5ieXRlKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeWksIGx6KV0pO1xuICAgICAgICAgIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjZWxscywgZXhjbHVkZWRDZWxscywgY2h1bmtzOiBrZXlzLmxlbmd0aCwgcmVnaW9uOiByIH07XG59XG5cbi8qKiBDYW5vbmljYWwgaW52ZW50b3J5IGhhc2g7IGtleSBvcmRlciBjYW5ub3QgYWZmZWN0IHRoZSByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjppbnZlbnRvcnk6djEnKTtcbiAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHdvcmxkLmludmVudG9yeSkuc29ydCgpO1xuICBoLnUzMihrZXlzLmxlbmd0aCk7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBoLnN0cmluZyhrZXkpO1xuICAgIGgudTMyKHdvcmxkLmludmVudG9yeVtrZXldKTtcbiAgfVxuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGludmVudG9yeVNuYXBzaG90KHdvcmxkOiBXb3JsZCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMod29ybGQuaW52ZW50b3J5KS5zb3J0KCkpIG91dFtrZXldID0gd29ybGQuaW52ZW50b3J5W2tleV07XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGhhc2hFbnRpdHkoaDogSGFzaGVyLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaC5zdHJpbmcoZS5pZCk7XG4gIGguc3RyaW5nKGUua2luZCk7XG4gIGguc3RyaW5nKGUuY2h1bmspO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueCAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnkgKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS56ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUucm90ICogMTAwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnNjYWxlICogMTAwMCkpO1xuICBoLnUzMihlLnZhcmlhbnQpO1xuICBoLnN0cmluZyhlLnJlc291cmNlID8/ICcnKTtcbiAgaC51MzIoZS5yZW1haW5pbmcpO1xuICBoLnUzMihlLmhhcnZlc3RlZCA/IDEgOiAwKTtcbiAgaC51MzIoZS5oYXJ2ZXN0ZWRPbmNlID8gMSA6IDApO1xufVxuXG4vKiogSGFzaCBlbnRpdHkgc3RhdGU7IHdpdGggYSByZWdpb24sIG9ubHkgZW50aXRpZXMgcm9vdGVkIGluc2lkZSBpdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkOiBXb3JsZCwgcmVnaW9uPzogVm94ZWxSZWdpb24pOiBzdHJpbmcge1xuICBsZXQgZW50aXRpZXM6IEVudGl0eVtdO1xuICBpZiAocmVnaW9uKSB7XG4gICAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gICAgZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgICBlbnRpdGllcyA9IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uZmlsdGVyKFxuICAgICAgKGUpID0+IGUueCA+PSByLngwICYmIGUueCA8IHIueDEgKyAxICYmIGUueiA+PSByLnowICYmIGUueiA8IHIuejEgKyAxLFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgZW50aXRpZXMgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldO1xuICB9XG4gIGVudGl0aWVzLnNvcnQoKGEsIGIpID0+IChhLmlkIDwgYi5pZCA/IC0xIDogYS5pZCA+IGIuaWQgPyAxIDogMCkpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjplbnRpdHktc3RhdGU6djEnKTtcbiAgaC51MzIoZW50aXRpZXMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBlIG9mIGVudGl0aWVzKSBoYXNoRW50aXR5KGgsIGUpO1xuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuLyoqXG4gKiBDYW5vbmljYWwgaGFzaCBvZiBidWlsdCBzdHJ1Y3R1cmVzLiBMYXlvdXQgbW9kdWxlcyBhbmQgcGFpZCBjb3N0cyBhcmVcbiAqIGF1dGhvcml0YXRpdmUgc2ltdWxhdGlvbiBzdGF0ZTsgcmVuZGVyZXIgbWVzaGVzIGFyZSBub3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoKHdvcmxkOiBXb3JsZCk6IHN0cmluZyB7XG4gIGNvbnN0IHN0cnVjdHVyZXMgPSBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV1cbiAgICAuc29ydCgoYSwgYikgPT4gKGEuaWQgPCBiLmlkID8gLTEgOiBhLmlkID4gYi5pZCA/IDEgOiAwKSk7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnN0cnVjdHVyZS1zdGF0ZTp2MScpO1xuICBoLnUzMihzdHJ1Y3R1cmVzLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgcyBvZiBzdHJ1Y3R1cmVzKSB7XG4gICAgaC5zdHJpbmcocy5pZCk7XG4gICAgaC5zdHJpbmcocy5raW5kKTtcbiAgICBoLnN0cmluZyhzLnNpdGVJZCk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnggKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnkgKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnogKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnJvdCAqIDEwMDAwKSk7XG4gICAgLy8gTGVnYWN5IGhhc2ggaW5wdXQgaXMgYnl0ZS1pZGVudGljYWwuIERlc2lnbiAyIGFkZHMgYW4gZXhwbGljaXQgdGFnLlxuICAgIGlmIChzLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIGguc3RyaW5nKCdkZXNpZ246MicpO1xuICAgIGgudTMyKHMubW9kdWxlcy5sZW5ndGgpO1xuICAgIGZvciAoY29uc3QgbSBvZiBzLm1vZHVsZXMpIHtcbiAgICAgIGguc3RyaW5nKG0ua2luZCk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS55ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnogKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0udyAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS5oICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLmQgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKChtLnJvdCA/PyAwKSAqIDEwMDAwKSk7XG4gICAgICBoLnN0cmluZyhtLnRvbmUgPz8gJycpO1xuICAgIH1cbiAgICBjb25zdCBjb3N0S2V5cyA9IE9iamVjdC5rZXlzKHMuY29zdCkuc29ydCgpO1xuICAgIGgudTMyKGNvc3RLZXlzLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgY29zdEtleXMpIHtcbiAgICAgIGguc3RyaW5nKGtleSk7XG4gICAgICBoLnUzMihzLmNvc3Rba2V5IGFzIGtleW9mIHR5cGVvZiBzLmNvc3RdID8/IDApO1xuICAgIH1cbiAgICBoLnUzMihzLmJ1aWx0UmV2aXNpb24pO1xuICB9XG4gIHJldHVybiBoLmhleCgpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlSGFzaCB7XG4gIGhhc2g6IHN0cmluZztcbiAgY29sdW1uczogbnVtYmVyO1xuICBjaHVua3M6IG51bWJlcjtcbn1cblxuLyoqIERlcml2ZWQgY29sdW1uLWNhY2hlIGhhc2guIE5vdCBhdXRob3JpdGF0aXZlIHRlcnJhaW4gc3RhdGUuICovXG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlZENhY2hlSGFzaCh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24pOiBDYWNoZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOmRlcml2ZWQtY29sdW1uLWNhY2hlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpO1xuICBsZXQgY29sdW1ucyA9IDA7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICAgIGgudTMyKGNodW5rLmhlaWdodHNbY29sXSk7XG4gICAgICAgIGgudTMyKGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdKTtcbiAgICAgICAgY29sdW1ucysrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjb2x1bW5zLCBjaHVua3M6IGtleXMubGVuZ3RoIH07XG59XG5cbi8qKlxuICogUmVjb21wdXRlIGV2ZXJ5IGNvbHVtbiBjYWNoZSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHZveGVsIGRhdGEgYW5kIHJlcG9ydFxuICogbWlzbWF0Y2hlcy4gVGhpcyBwcm92ZXMgaGVpZ2h0cy90b3BNYXRlcmlhbHMgYXJlIGRlcml2ZWQsIG5vdCBhIHNlY29uZFxuICogdGVycmFpbiByZXByZXNlbnRhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRGVyaXZlZENhY2hlcyh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24sIGxpbWl0ID0gNjQpOiBDYWNoZU1pc21hdGNoW10ge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IG91dDogQ2FjaGVNaXNtYXRjaFtdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSBjb250aW51ZTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgICAgbGV0IHRvcE1hdCA9IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdO1xuICAgICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXhwZWN0ZWRIZWlnaHQgPSB0b3BTb2xpZCAtIFlfTUlOO1xuICAgICAgICBpZiAoY2h1bmsuaGVpZ2h0c1tjb2xdICE9PSBleHBlY3RlZEhlaWdodCkge1xuICAgICAgICAgIG91dC5wdXNoKHsgeDogb3ggKyBseCwgejogb3ogKyBseiwgZmllbGQ6ICdoZWlnaHQnLCBleHBlY3RlZDogZXhwZWN0ZWRIZWlnaHQsIGFjdHVhbDogY2h1bmsuaGVpZ2h0c1tjb2xdIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjaHVuay50b3BNYXRlcmlhbHNbY29sXSAhPT0gdG9wTWF0KSB7XG4gICAgICAgICAgb3V0LnB1c2goeyB4OiBveCArIGx4LCB6OiBveiArIGx6LCBmaWVsZDogJ21hdGVyaWFsJywgZXhwZWN0ZWQ6IHRvcE1hdCwgYWN0dWFsOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3V0Lmxlbmd0aCA+PSBsaW1pdCkgcmV0dXJuIG91dDtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBFZGl0T3V0c2lkZSB7XG4gIGNodW5rOiBzdHJpbmc7XG4gIGluZGV4OiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIG1hdGVyaWFsOiBudW1iZXI7XG59XG5cbi8qKiBFdmVyeSByZWNvcmRlZCB2b3hlbCBlZGl0IG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0c091dHNpZGVFbnZlbG9wZSh3b3JsZDogV29ybGQsIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogRWRpdE91dHNpZGVbXSB7XG4gIGNvbnN0IG91dDogRWRpdE91dHNpZGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGVkaXRzXSBvZiB3b3JsZC5lZGl0cykge1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gICAgZm9yIChjb25zdCBbaW5kZXgsIG1hdGVyaWFsXSBvZiBlZGl0cykge1xuICAgICAgY29uc3QgbHggPSBpbmRleCAlIENIVU5LX1NJWkU7XG4gICAgICBjb25zdCBseiA9IE1hdGguZmxvb3IoKGluZGV4ICUgQ0hVTktfQVJFQSkgLyBDSFVOS19TSVpFKTtcbiAgICAgIGNvbnN0IHlpID0gTWF0aC5mbG9vcihpbmRleCAvIENIVU5LX0FSRUEpO1xuICAgICAgY29uc3QgeCA9IG94ICsgbHgsIHogPSBveiArIGx6LCB5ID0gWV9NSU4gKyB5aTtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhlbnZlbG9wZSwgeCwgeSwgeikpIHtcbiAgICAgICAgb3V0LnB1c2goeyBjaHVuazoga2V5LCBpbmRleCwgeCwgeSwgeiwgbWF0ZXJpYWwgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIG91dC5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykgfHwgYS5pbmRleCAtIGIuaW5kZXgpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vKiogTmV3IGNodW5rcyBnZW5lcmF0ZWQgc2luY2UgdGhlIGJhc2VsaW5lIHRoYXQgZG8gbm90IG92ZXJsYXAgdGhlIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5ld0NodW5rc091dHNpZGVFbnZlbG9wZShcbiAgd29ybGQ6IFdvcmxkLCBiYXNlbGluZUtleXM6IEl0ZXJhYmxlPHN0cmluZz4sIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdLFxuKTogc3RyaW5nW10ge1xuICBjb25zdCBiYXNlbGluZSA9IG5ldyBTZXQoYmFzZWxpbmVLZXlzKTtcbiAgY29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGNodW5rXSBvZiB3b3JsZC5jaHVua3MpIHtcbiAgICBpZiAoYmFzZWxpbmUuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IG92ZXJsYXBzID0gZW52ZWxvcGUuc29tZShcbiAgICAgIChyKSA9PiBveCA8PSByLngxICYmIG94ICsgQ0hVTktfU0laRSAtIDEgPj0gci54MCAmJiBveiA8PSByLnoxICYmIG96ICsgQ0hVTktfU0laRSAtIDEgPj0gci56MCxcbiAgICApO1xuICAgIGlmICghb3ZlcmxhcHMpIG91dC5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIG91dC5zb3J0KCk7XG59XG5cbi8qKiBBbGwgY2h1bmsga2V5cyBjdXJyZW50bHkgbWF0ZXJpYWxpc2VkLCBzb3J0ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gY2h1bmtLZXlzKHdvcmxkOiBXb3JsZCk6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIFsuLi53b3JsZC5jaHVua3Mua2V5cygpXS5zb3J0KCk7XG59XG5cbi8qKiBCb3VuZGluZyB2b3hlbCByZWdpb24gY292ZXJpbmcgZXZlcnkgbWF0ZXJpYWxpc2VkIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkQ2h1bmtSZWdpb24od29ybGQ6IFdvcmxkKTogVm94ZWxSZWdpb24ge1xuICBpZiAod29ybGQuY2h1bmtzLnNpemUgPT09IDApIHRocm93IG5ldyBFcnJvcignd29ybGQgaGFzIG5vIGNodW5rcycpO1xuICBsZXQgbWluQ3ggPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN4ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBsZXQgbWluQ3ogPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN6ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IGNodW5rIG9mIHdvcmxkLmNodW5rcy52YWx1ZXMoKSkge1xuICAgIG1pbkN4ID0gTWF0aC5taW4obWluQ3gsIGNodW5rLmN4KTsgbWF4Q3ggPSBNYXRoLm1heChtYXhDeCwgY2h1bmsuY3gpO1xuICAgIG1pbkN6ID0gTWF0aC5taW4obWluQ3osIGNodW5rLmN6KTsgbWF4Q3ogPSBNYXRoLm1heChtYXhDeiwgY2h1bmsuY3opO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDA6IGNodW5rT3JpZ2luWChtaW5DeCksXG4gICAgejA6IGNodW5rT3JpZ2luWihtaW5DeiksXG4gICAgeDE6IGNodW5rT3JpZ2luWChtYXhDeCkgKyBDSFVOS19TSVpFIC0gMSxcbiAgICB6MTogY2h1bmtPcmlnaW5aKG1heEN6KSArIENIVU5LX1NJWkUgLSAxLFxuICAgIHkwOiBZX01JTixcbiAgICB5MTogWV9NQVggLSAxLFxuICB9O1xufVxuIiwgIi8vIE0wMDIgZGV0ZXJtaW5pc3RpYyBmaXh0dXJlIGFuZCBsaXZlLXdvcmxkIGxheW91dC5cbi8vXG4vLyBUaGUgZml4dHVyZSBpcyBhIGJvdW5kZWQgc2xpY2Ugb2YgdGhlIHJlYWwgMjA0OCBtIHdvcmxkIChzZWVkIDEzMzcpLCBub3QgYVxuLy8gc3ludGhldGljIGhlaWdodGZpZWxkLiBJdCBjb250YWluczpcbi8vICAgKiBhIHJlamVjdGVkIGhvdXNlIHNpdGUgb24gYSA3IG0gcml2ZXItYmFuayBzbG9wZTtcbi8vICAgKiBhIHZpYWJsZSBob3VzZSBzaGVsZiAyMCBtIGF3YXkgd2l0aCAyIG0gcmVsaWVmIGFuZCBubyBjbGVhcmluZyBuZWVkZWQ7XG4vLyAgICogYSAzIG0gZmFybSBzbG9wZSAyNyBtIGZyb20gdGhlIGhvdXNlIHdpdGggYSBuYXR1cmFsIGJsb3Nzb20gdHJlZSBhbmQgb3JlLlxuLy9cbi8vIFRoZSBzYW1lIGNvb3JkaW5hdGVzLCBxdWVyaWVzIGFuZCB2YWxpZGF0b3JzIGFyZSB1c2VkIGJ5IHRoZSBsaXZlLXdvcmxkXG4vLyBhY2NlcHRhbmNlIHRlc3QuIFRoZSBvbmx5IGRpZmZlcmVuY2UgaXMgaG93IG1hbnkgY2h1bmtzIGFyZSBtYXRlcmlhbGlzZWQuXG5pbXBvcnQge1xuICBXb3JsZCwgY3JlYXRlV29ybGQsIGdlbmVyYXRlV29ybGQsIGdlbmVyYXRlQ2h1bmssIHBsYWNlQXV0aG9yZWRTaXRlcyxcbiAgWV9NSU4sIFlfTUFYLCBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWixcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBSZWN0LCBWb3hlbFJlZ2lvbiB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBjaHVua0tleXMgfSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBNMDAyX1NFRUQgPSAxMzM3O1xuXG4vKiogUGlubmVkIHBhdGggc2l0ZSBpZCBmb3IgdGhlIGRvb3ItdG8tYXBwcm9hY2ggY29ycmlkb3IuICovXG5leHBvcnQgY29uc3QgTTAwMl9QQVRIX1NJVEVfSUQgPSAncGF0aC1ob3VzZS1mYXJtJztcblxuLyoqXG4gKiBQaW5uZWQgc3RlcHBlZCBwcm9maWxlIGZvciB0aGUgOSBtIHBhdGggZnJvbSB0aGUgaG91c2UgZG9vciAoeCA9IC01MykgdG8gdGhlXG4gKiBhcHByb2FjaCAoeCA9IC00NSkuIFRoZSByaXNlIGlzIDIgbSBvdmVyIDggbTsgZXZlcnkgc3RlcCBpcyBhdCBtb3N0IDEgbS5cbiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfUEFUSF9QUk9GSUxFID0gWzExLCAxMSwgMTEsIDEyLCAxMiwgMTIsIDEyLCAxMywgMTNdIGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIFRlcnJhY2VCYW5kU3BlYyB7XG4gIHowOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuLyoqIFBpbm5lZCBmYXJtIHRlcnJhY2VzLCBoaWdoIHNpZGUgZmlyc3QuICovXG5leHBvcnQgY29uc3QgTTAwMl9URVJSQUNFX0JBTkRTOiByZWFkb25seSBUZXJyYWNlQmFuZFNwZWNbXSA9IFtcbiAgeyB6MDogLTQyLCB6MTogLTQwLCB5OiAxNiB9LFxuICB7IHowOiAtMzksIHoxOiAtMzcsIHk6IDE1IH0sXG4gIHsgejA6IC0zNiwgejE6IC0zNSwgeTogMTQgfSxcbl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVNwZWMge1xuICBpZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgZG9vcjogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZhcm1TcGVjIHtcbiAgaWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgdGVycmFjZXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyTGF5b3V0IHtcbiAgc2VlZDogbnVtYmVyO1xuICByZWplY3RlZDogU2l0ZVNwZWM7XG4gIGhvdXNlOiBTaXRlU3BlYztcbiAgZmFybTogRmFybVNwZWM7XG4gIHNlYXJjaEFyZWE6IFJlY3Q7XG4gIHdvcmtab25lOiBSZWN0O1xuICBmaXh0dXJlQ2h1bmtzOiB7IGN4MDogbnVtYmVyOyBjejA6IG51bWJlcjsgY3gxOiBudW1iZXI7IGN6MTogbnVtYmVyIH07XG4gIHByb3RlY3RlZFJlZ2lvbjogVm94ZWxSZWdpb247XG4gIC8qKiBDb21wbGV0ZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUgZm9yIHRoZSBmaXJzdCBzbGljZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG59XG5cbmNvbnN0IEZJWFRVUkVfQ0hVTktTID0geyBjeDA6IDI4LCBjejA6IDI5LCBjeDE6IDMyLCBjejE6IDMyIH0gYXMgY29uc3Q7XG5cbmV4cG9ydCBjb25zdCBNMDAyX0xBWU9VVDogTTAwMkxheW91dCA9IHtcbiAgc2VlZDogTTAwMl9TRUVELFxuICByZWplY3RlZDoge1xuICAgIGlkOiAnc2l0ZS1hLXJlamVjdGVkJyxcbiAgICByZWN0OiB7IHgwOiAtNzQsIHowOiAtNjYsIHgxOiAtNjcsIHoxOiAtNjEgfSxcbiAgICAvLyBBIG5haXZlIGxvdy1zaWRlIGZsb29yOiB0aGUgdXBoaWxsIGNvcm5lciB3b3VsZCBuZWVkIDUgbSBvZiBleGNhdmF0aW9uLlxuICAgIGZsb29yWTogMyxcbiAgICBkb29yOiB7IHg6IC02NywgejogLTYzIH0sXG4gICAgYXBwcm9hY2g6IHsgeDogLTYwLCB6OiAtNjMgfSxcbiAgfSxcbiAgaG91c2U6IHtcbiAgICBpZDogJ3NpdGUtYi1ob3VzZScsXG4gICAgcmVjdDogeyB4MDogLTYwLCB6MDogLTQ2LCB4MTogLTUzLCB6MTogLTQxIH0sXG4gICAgZmxvb3JZOiAxMSxcbiAgICBkb29yOiB7IHg6IC01MywgejogLTQzIH0sXG4gICAgYXBwcm9hY2g6IHsgeDogLTQ1LCB6OiAtNDMgfSxcbiAgfSxcbiAgZmFybToge1xuICAgIGlkOiAnZmllbGQtYycsXG4gICAgcmVjdDogeyB4MDogLTM4LCB6MDogLTQyLCB4MTogLTI3LCB6MTogLTM1IH0sXG4gICAgdGVycmFjZXM6IDMsXG4gIH0sXG4gIHNlYXJjaEFyZWE6IHsgeDA6IC03NiwgejA6IC02OCwgeDE6IC00MCwgejE6IC00MCB9LFxuICB3b3JrWm9uZTogeyB4MDogLTc2LCB6MDogLTY4LCB4MTogLTIzLCB6MTogLTMxIH0sXG4gIGZpeHR1cmVDaHVua3M6IEZJWFRVUkVfQ0hVTktTLFxuICBwcm90ZWN0ZWRSZWdpb246IHtcbiAgICB4MDogY2h1bmtPcmlnaW5YKEZJWFRVUkVfQ0hVTktTLmN4MCksXG4gICAgejA6IGNodW5rT3JpZ2luWihGSVhUVVJFX0NIVU5LUy5jejApLFxuICAgIHgxOiBjaHVua09yaWdpblgoRklYVFVSRV9DSFVOS1MuY3gxKSArIDMxLFxuICAgIHoxOiBjaHVua09yaWdpblooRklYVFVSRV9DSFVOS1MuY3oxKSArIDMxLFxuICAgIHkwOiBZX01JTixcbiAgICB5MTogWV9NQVggLSAxLFxuICB9LFxuICBlbnZlbG9wZTogW1xuICAgIC8vIEhvdXNlIGZvb3RwcmludCBwbHVzIGEgMiBtIHByZXBhcmF0aW9uIGJ1ZmZlci5cbiAgICB7IHgwOiAtNjIsIHowOiAtNDgsIHgxOiAtNTEsIHoxOiAtMzksIHkwOiA4LCB5MTogMTYgfSxcbiAgICAvLyBEb29yLXRvLWFwcHJvYWNoIHBhdGggY29ycmlkb3IgcGx1cyBhIDEgbSBidWZmZXIuXG4gICAgeyB4MDogLTU0LCB6MDogLTQ0LCB4MTogLTQ0LCB6MTogLTQyLCB5MDogOSwgeTE6IDE1IH0sXG4gICAgLy8gRmFybSBmb290cHJpbnQgcGx1cyBhIDIgbSBwcmVwYXJhdGlvbiBidWZmZXIuXG4gICAgeyB4MDogLTQwLCB6MDogLTQ0LCB4MTogLTI1LCB6MTogLTMzLCB5MDogMTAsIHkxOiAyMCB9LFxuICBdLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBNMDAyV29ybGQge1xuICB3b3JsZDogV29ybGQ7XG4gIGxheW91dDogTTAwMkxheW91dDtcbiAgLyoqIFNvcnRlZCBjaHVuayBrZXlzIG1hdGVyaWFsaXNlZCBhdCBmaXh0dXJlIGNyZWF0aW9uLiAqL1xuICBjaHVua0tleXM6IHN0cmluZ1tdO1xufVxuXG4vKipcbiAqIFNtYWxsIGRldGVybWluaXN0aWMgZml4dHVyZTogdGhlIDIwIGNodW5rcyBjb3ZlcmluZyB0aGUgd29yayB6b25lIGFuZCBpdHNcbiAqIHByb3RlY3RlZCBzdXJyb3VuZGluZ3MuIEZhc3QgZW5vdWdoIGZvciB0aGUgZnVsbCB0ZXN0IHN1aXRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTTAwMkZpeHR1cmUoc2VlZCA9IE0wMDJfU0VFRCk6IE0wMDJXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCk7XG4gIGNvbnN0IHsgY3gwLCBjejAsIGN4MSwgY3oxIH0gPSBNMDAyX0xBWU9VVC5maXh0dXJlQ2h1bmtzO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykgZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4geyB3b3JsZCwgbGF5b3V0OiBNMDAyX0xBWU9VVCwgY2h1bmtLZXlzOiBjaHVua0tleXMod29ybGQpIH07XG59XG5cbi8qKlxuICogTGl2ZS13b3JsZCBpbnRlZ3JhdGlvbiB0YXJnZXQ6IHRoZSBzYW1lIHNlZWQgYW5kIHNpdGVzIHdpdGggYSA5IHggOSBjaHVua1xuICogbmVpZ2hib3VyaG9vZCAoODEgY2h1bmtzKSBhcm91bmQgdGhlIGZvdW5kZXIgdmFsbGV5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTTAwMkxpdmUoc2VlZCA9IE0wMDJfU0VFRCwgcmFkaXVzID0gNCk6IE0wMDJXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gZ2VuZXJhdGVXb3JsZChzZWVkLCByYWRpdXMpO1xuICByZXR1cm4geyB3b3JsZCwgbGF5b3V0OiBNMDAyX0xBWU9VVCwgY2h1bmtLZXlzOiBjaHVua0tleXMod29ybGQpIH07XG59XG4iXSwKICAibWFw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STtBQUUxQixTQUFPLFVBQVUscUJBQXFCLE9BQU8sT0FBTyxRQUFRLEdBQUcsQ0FBQyxDQUFDO0FBQ2pFLFNBQU87QUFBQSxJQUNMLG9CQUFvQixPQUFPLE9BQU8saUJBQWlCLE9BQU8sUUFBUSxFQUFFO0FBQUEsSUFDcEUsT0FBTztBQUFBLEVBQ1Q7QUFHQSxTQUFPLE1BQU0sVUFBVSxPQUFPLE9BQU8sTUFBTSxLQUFLLElBQUksT0FBTyxNQUFNLEtBQUssRUFBRSxHQUFHLEVBQUU7QUFDN0UsU0FBTyxNQUFNLFVBQVUsT0FBTyxPQUFPLEtBQUssS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLEVBQUUsR0FBRyxFQUFFO0FBQzNFLFNBQU8sTUFBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLEtBQUssSUFBSSxJQUFJLE9BQU8sTUFBTSxLQUFLLEVBQUUsR0FBRyxJQUFJLEdBQUc7QUFDdkYsQ0FBQzsiLAogICJuYW1lcyI6IFsiYSIsICJiIiwgInNtb290aCIsICJpZCIsICJwcm9wb3NhbCIsICJwcm9wb3NhbCJdCn0K
