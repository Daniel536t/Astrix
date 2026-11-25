// tests/m007.smooth.test.ts
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
      const head2 = this.lower.points[this.lower.points.length - 1];
      const drift = towards(x, z, head2, 0.08);
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
    let best = Infinity, bx2 = cx;
    for (let x = Math.round(cx - 40); x <= cx + 40; x += 2) {
      const v = h(x, z) + Math.abs(x - cx) * 0.02;
      if (v < best) {
        best = v;
        bx2 = x;
      }
    }
    cx = bx2;
    raw.push({ x: bx2, z });
    if (best < -6 && raw.length > 20 && h(bx2, z + 8) < -6 && h(bx2, z + 16) < -6) break;
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
  const P2 = 3;
  const PW = CHUNK_SIZE + P2 * 2;
  const baseH = new Int16Array(PW * PW);
  const v2Cols = v2 ? new Array(CHUNK_AREA) : null;
  for (let pz = 0; pz < PW; pz++) {
    for (let px = 0; px < PW; px++) {
      const wx = ox + px - P2, wz = oz + pz - P2;
      if (v2) {
        const col = v2.column(wx, wz);
        baseH[pz * PW + px] = col.h;
        const lx = px - P2, lz = pz - P2;
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
      const h = baseH[(lz + P2) * PW + (lx + P2)];
      const slope = Math.max(
        Math.abs(h - baseH[(lz + P2) * PW + (lx + P2 - 1)]),
        Math.abs(h - baseH[(lz + P2) * PW + (lx + P2 + 1)]),
        Math.abs(h - baseH[(lz + P2 - 1) * PW + (lx + P2)]),
        Math.abs(h - baseH[(lz + P2 + 1) * PW + (lx + P2)])
      );
      const nearWater = baseH[(lz + P2) * PW + (lx + P2 - 3)] < SEA_LEVEL + 1 || baseH[(lz + P2) * PW + (lx + P2 + 3)] < SEA_LEVEL + 1 || baseH[(lz + P2 - 3) * PW + (lx + P2)] < SEA_LEVEL + 1 || baseH[(lz + P2 + 3) * PW + (lx + P2)] < SEA_LEVEL + 1;
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
      const h = baseH[(lz + P2) * PW + (lx + P2)];
      const slope = Math.max(
        Math.abs(h - baseH[(lz + P2) * PW + (lx + P2 - 1)]),
        Math.abs(h - baseH[(lz + P2) * PW + (lx + P2 + 1)]),
        Math.abs(h - baseH[(lz + P2 - 1) * PW + (lx + P2)]),
        Math.abs(h - baseH[(lz + P2 + 1) * PW + (lx + P2)])
      );
      if (slope < 2) continue;
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dz] of dirs) {
        const nx = lx + dx, nz = lz + dz;
        if (nx < 0 || nz < 0 || nx >= CHUNK_SIZE || nz >= CHUNK_SIZE) continue;
        const nh = baseH[(nz + P2) * PW + (nx + P2)];
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
function nearestThreat(c, ctx2) {
  let best = null;
  for (const t of ctx2.threats) {
    const d = Math.hypot(t.x - c.x, t.z - c.z);
    if (!best || d < best.d) best = { d, x: t.x, z: t.z };
  }
  const fears = FEARS[c.species];
  if (fears && ctx2.predators) {
    for (const p of ctx2.predators) {
      if (!fears.includes(p.species)) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      const scaled = d * (SPECIES[c.species].wariness / PREDATOR_ALARM);
      if (d < PREDATOR_ALARM && (!best || scaled < best.d)) best = { d: scaled, x: p.x, z: p.z, predator: true };
    }
  }
  return best;
}
function stepCreature(world, c, ctx2) {
  const def = SPECIES[c.species];
  const dt = FAUNA_STEP;
  const threat = nearestThreat(c, ctx2);
  c.timer -= dt;
  if (def.habitat === "water") {
    stepFish(world, c, def, ctx2, threat);
    return;
  }
  if (c.species === "fox") foxHunt(c, def, ctx2, threat);
  if (threat && threat.d < def.wariness && c.behaviour !== "flee") {
    c.behaviour = "flee";
    c.timer = 2.5 + rand(c) * 2;
  } else if (c.behaviour === "stalk" || c.behaviour === "chase") {
  } else if (c.leader && ctx2.leaders?.has(c.leader)) {
    packFollow(c, def, ctx2.leaders.get(c.leader));
  } else if (c.timer <= 0) {
    const sleepy = def.diurnal && ctx2.night;
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
function foxHunt(c, def, ctx2, threat) {
  if (ctx2.night === false && c.behaviour === "sleep") return;
  if (c.behaviour === "stalk" || c.behaviour === "chase") {
    let best = null;
    for (const p of ctx2.prey ?? []) {
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
  if (c.timer <= 0 && ctx2.prey && !(threat && threat.d < def.wariness)) {
    for (const p of ctx2.prey) {
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
function stepFish(world, c, def, ctx2, threat) {
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
  void ctx2;
}
function turn(from, to, rate) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * Math.min(1, rate);
}

// src/render/fauna.ts
import * as THREE2 from "three";

// src/render/animal-kit.ts
import * as THREE from "three";
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

// src/render/animal-kit.ts
var M = palette_default.materials;
var colour = (k) => new THREE.Color(k.startsWith("#") ? k : M[k].hex);
var PART = { body: 0, legA: 1, legB: 2, head: 3, tail: 4, wing: 6, wool: 7, male: 10 };
function bx(w, h, d, x, y, z, c, part = PART.body, pivot, rot) {
  return { w, h, d, x, y, z, c, part, pivot, ...rot };
}
function buildAnimalGeometry(model) {
  const geos = model.boxes.map((b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    if (b.rx || b.ry || b.rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0)));
    g.translate(b.x, b.y, b.z);
    g.deleteAttribute("uv");
    const col = colour(b.c), n = g.attributes.position.count;
    const colors = new Float32Array(n * 3), rig = new Float32Array(n * 4);
    const pv = b.pivot ?? [b.x, b.y, b.z];
    const normals = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      const ny = normals.getY(i);
      const k = ny > 0.5 ? 1 : ny < -0.5 ? 0.74 : 0.88;
      colors[i * 3] = col.r * k;
      colors[i * 3 + 1] = col.g * k;
      colors[i * 3 + 2] = col.b * k;
      rig[i * 4] = pv[0];
      rig[i * 4 + 1] = pv[1];
      rig[i * 4 + 2] = pv[2];
      rig[i * 4 + 3] = b.part ?? 0;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("aRig", new THREE.BufferAttribute(rig, 4));
    return g;
  });
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  return merged;
}
var VERTEX_HEAD = (
  /* glsl */
  `
attribute vec4 aRig;
attribute vec4 iAnim;
attribute vec4 iState;
vec3 rotX(vec3 p, vec3 c, float a) { float s = sin(a), k = cos(a); vec3 d = p - c; return c + vec3(d.x, d.y * k - d.z * s, d.y * s + d.z * k); }
vec3 rotY(vec3 p, vec3 c, float a) { float s = sin(a), k = cos(a); vec3 d = p - c; return c + vec3(d.x * k + d.z * s, d.y, -d.x * s + d.z * k); }
vec3 rotZ(vec3 p, vec3 c, float a) { float s = sin(a), k = cos(a); vec3 d = p - c; return c + vec3(d.x * k - d.y * s, d.x * s + d.y * k, d.z); }
`
);
var VERTEX_BODY = (
  /* glsl */
  `
vec3 transformed = vec3( position );
{
  vec3 pv = aRig.xyz;
  float male = step(9.5, aRig.w);
  float part = aRig.w - 10.0 * male;
  float swing = sin(iAnim.x) * iAnim.y;
  if (male > 0.5 && iState.x < 0.5) {
    transformed = pv;                                  // not on this animal
  } else if (part > 0.5 && part < 2.5) {               // legs: fold when lying, then swing about the hip
    transformed.y = pv.y + (transformed.y - pv.y) * mix(1.0, 0.3, iState.z);
    transformed = rotX(transformed, pv, part < 1.5 ? swing : -swing);
  } else if (part > 2.5 && part < 3.5) {               // head: bigger on the young, tips about the neck
    transformed = pv + (transformed - pv) * (1.0 + 0.3 * iState.y);
    transformed = rotX(transformed, pv, iAnim.z);
  } else if (part > 3.5 && part < 4.5) {               // tail
    transformed = rotY(transformed, pv, sin(iAnim.x * 0.8) * iAnim.w);
  } else if (part > 5.5 && part < 6.5) {               // wings flap about the shoulder
    transformed = rotZ(transformed, pv, iState.w * sin(iAnim.x * 3.0) * sign(pv.x) * 0.9);
  } else if (part > 6.5 && part < 7.5) {               // wool thins after shearing
    transformed = pv + (transformed - pv) * mix(0.7, 1.0, iState.w);
  }
}
#ifdef USE_COLOR
  #ifdef YOUNG_TINT
    vColor.rgb = mix(vColor.rgb, YOUNG_TINT, iState.y * 0.9);
  #endif
#endif
`
);
function animalMaterial(youngTint) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  if (youngTint) {
    const t = colour(youngTint);
    mat.defines = { YOUNG_TINT: `vec3(${t.r.toFixed(3)}, ${t.g.toFixed(3)}, ${t.b.toFixed(3)})` };
  }
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
${VERTEX_HEAD}`).replace("#include <begin_vertex>", VERTEX_BODY);
  };
  mat.customProgramCacheKey = () => `animal-rig-${youngTint ?? "none"}`;
  return mat;
}
var AnimalBatch = class _AnimalBatch {
  constructor(model, capacity, name) {
    this.capacity = capacity;
    this.model = model;
    const geo = buildAnimalGeometry(model);
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    this.state.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iAnim", this.anim);
    geo.setAttribute("iState", this.state);
    this.mesh = new THREE.InstancedMesh(geo, animalMaterial(model.youngTint), capacity);
    this.mesh.name = name;
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
  }
  capacity;
  mesh;
  model;
  anim;
  state;
  n = 0;
  m = new THREE.Matrix4();
  q = new THREE.Quaternion();
  e = new THREE.Euler();
  v = new THREE.Vector3();
  s = new THREE.Vector3();
  /** Margin (m) around instance origins covering the largest model and pose. */
  static BOUNDS_MARGIN = 4;
  lo = new THREE.Vector3();
  hi = new THREE.Vector3();
  begin() {
    this.n = 0;
    this.lo.set(Infinity, Infinity, Infinity);
    this.hi.set(-Infinity, -Infinity, -Infinity);
  }
  push(p) {
    if (this.n >= this.capacity) return false;
    const i = this.n++;
    const lie = p.lying ? 1 : 0;
    this.e.set(p.pitch ?? 0, p.heading, p.roll ?? 0, "YXZ");
    this.q.setFromEuler(this.e);
    this.v.set(p.x, p.y - lie * this.model.legLen * 0.7 * p.scale, p.z);
    this.s.set(p.scale, p.scale, p.scale);
    this.mesh.setMatrixAt(i, this.m.compose(this.v, this.q, this.s));
    this.lo.min(this.v);
    this.hi.max(this.v);
    this.anim.setXYZW(i, p.phase, p.legSwing, p.headPitch, p.tailWag);
    this.state.setXYZW(i, p.male ? 1 : 0, p.young ? 1 : 0, lie, p.extra);
    return true;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    const sphere = this.mesh.boundingSphere;
    if (this.n > 0) {
      sphere.center.addVectors(this.lo, this.hi).multiplyScalar(0.5);
      sphere.radius = this.lo.distanceTo(this.hi) / 2 + _AnimalBatch.BOUNDS_MARGIN;
    }
    for (const [a, stride] of [[this.mesh.instanceMatrix, 16], [this.anim, 4], [this.state, 4]]) {
      a.clearUpdateRanges();
      if (this.n > 0) a.addUpdateRange(0, this.n * stride);
      a.needsUpdate = this.n > 0;
    }
  }
  get count() {
    return this.n;
  }
};

// src/render/animal-models.ts
var { body, legA, legB, head, tail, wing, wool, male } = PART;
var legSet = (x, z) => x > 0 === z > 0 ? legA : legB;
function legs(spots, hip, w, shaft, shaftColour, foot) {
  const out = [];
  for (const [x, z] of spots) {
    const part = legSet(x, z), pv = [x, hip, z];
    out.push(bx(w, shaft, w, x, hip - shaft / 2, z, shaftColour, part, pv));
    if (foot) out.push(bx(foot.w ?? w + 0.02, foot.h, (foot.w ?? w + 0.02) + 0.02, x, foot.h / 2, z + 0.01, foot.c, part, pv));
  }
  return out;
}
function cattle() {
  const COAT = "#C58A47", DARK = "#8A5428", MUZZLE = "#E7AE93", HORN = "#EBD7B5", HOOF = "#4B2F1E";
  const P2 = [0, 1.3, 0.75];
  return {
    id: "cattle",
    legLen: 0.66,
    boxes: [
      bx(0.92, 0.78, 1.5, 0, 1, -0.05, COAT),
      bx(0.94, 0.22, 0.8, 0, 1.32, 0.3, DARK),
      bx(0.7, 0.3, 0.4, 0, 0.78, -0.62, DARK),
      ...legs([[0.3, 0.5], [-0.3, 0.5], [0.3, -0.55], [-0.3, -0.55]], 0.66, 0.24, 0.5, COAT, { c: HOOF, h: 0.14, w: 0.26 }),
      bx(0.62, 0.58, 0.52, 0, 1.28, 1.1, COAT, head, P2),
      bx(0.5, 0.3, 0.2, 0, 1.12, 1.42, MUZZLE, head, P2),
      bx(0.5, 0.12, 0.34, 0, 1.6, 1.05, DARK, head, P2),
      bx(0.12, 0.12, 0.03, 0.17, 1.34, 1.37, "#FFFFFF", head, P2),
      bx(0.12, 0.12, 0.03, -0.17, 1.34, 1.37, "#FFFFFF", head, P2),
      bx(0.06, 0.08, 0.035, 0.17, 1.33, 1.39, "#141414", head, P2),
      bx(0.06, 0.08, 0.035, -0.17, 1.33, 1.39, "#141414", head, P2),
      bx(0.08, 0.06, 0.03, 0.12, 1.16, 1.52, "#8A5A4A", head, P2),
      bx(0.08, 0.06, 0.03, -0.12, 1.16, 1.52, "#8A5A4A", head, P2),
      bx(0.22, 0.08, 0.14, 0.42, 1.42, 0.98, DARK, head, P2),
      bx(0.22, 0.08, 0.14, -0.42, 1.42, 0.98, DARK, head, P2),
      bx(0.1, 0.1, 0.14, 0.36, 1.52, 1.02, HORN, head, P2),
      bx(0.1, 0.1, 0.14, -0.36, 1.52, 1.02, HORN, head, P2),
      bx(0.1, 0.26, 0.1, 0.42, 1.7, 1.02, HORN, head + male, P2),
      bx(0.1, 0.26, 0.1, -0.42, 1.7, 1.02, HORN, head + male, P2),
      bx(0.1, 0.55, 0.1, 0, 1.05, -0.84, DARK, tail, [0, 1.3, -0.8]),
      bx(0.14, 0.16, 0.14, 0, 0.72, -0.84, DARK, tail, [0, 1.3, -0.8])
    ]
  };
}
function sheep() {
  const FACE = "#E9D9B8", LEG = "#CDAA7D", DARK = "#3A322C", WOOLS = ["#F6F5F0", "#ECE9E0", "#FBFAF7"];
  const P2 = [0, 0.95, 0.5];
  const C = [0, 0.83, -0.11];
  const boxes = [
    bx(0.5, 0.4, 0.9, 0, 0.83, -0.11, "#DDD8CB", wool, C),
    ...legs([[0.2, 0.32], [-0.2, 0.32], [0.2, -0.34], [-0.2, -0.34]], 0.58, 0.11, 0.58, LEG)
  ];
  const s = 0.23, xs = [-0.34, -0.11, 0.12, 0.35], ys = [0.62, 0.85, 1.08], zs = [-0.56, -0.33, -0.1, 0.13, 0.36];
  let k = 0;
  xs.forEach((x, ix) => ys.forEach((y, iy) => zs.forEach((z, iz) => {
    const shell = ix === 0 || ix === xs.length - 1 || iy === 0 || iy === ys.length - 1 || iz === 0 || iz === zs.length - 1;
    if (!shell) return;
    k++;
    if (iy < ys.length - 1 && k * 7919 % 11 === 0) return;
    const j = (n) => (k * n % 5 - 2) * 0.025;
    boxes.push(bx(s, s, s, x + (ix === 0 || ix === xs.length - 1 ? j(13) : 0), y + (iy === ys.length - 1 ? j(7) : 0), z + (iz === 0 || iz === zs.length - 1 ? j(11) : 0), WOOLS[k * 31 % 3], wool, C));
  })));
  boxes.push(
    bx(0.3, 0.32, 0.34, 0, 0.9, 0.66, FACE, head, P2),
    bx(0.34, 0.14, 0.32, 0, 1.1, 0.6, WOOLS[0], head, P2),
    bx(0.14, 0.12, 0.06, 0, 0.85, 0.845, DARK, head, P2),
    bx(0.07, 0.07, 0.03, 0.08, 0.96, 0.835, DARK, head, P2),
    bx(0.07, 0.07, 0.03, -0.08, 0.96, 0.835, DARK, head, P2),
    bx(0.16, 0.06, 0.1, 0.2, 0.98, 0.6, FACE, head, P2, { rz: -0.4 }),
    bx(0.16, 0.06, 0.1, -0.2, 0.98, 0.6, FACE, head, P2, { rz: 0.4 }),
    bx(0.09, 0.2, 0.09, 0.2, 1.1, 0.62, "#B9A07A", head + male, P2),
    bx(0.09, 0.09, 0.2, 0.2, 1.2, 0.54, "#B9A07A", head + male, P2),
    bx(0.09, 0.2, 0.09, -0.2, 1.1, 0.62, "#B9A07A", head + male, P2),
    bx(0.09, 0.09, 0.2, -0.2, 1.2, 0.54, "#B9A07A", head + male, P2),
    bx(0.13, 0.13, 0.13, 0, 0.85, -0.7, WOOLS[1], tail, [0, 0.85, -0.66])
  );
  return { id: "sheep", legLen: 0.58, boxes };
}
function goat() {
  const COAT = "#B09B78", LIGHT = "#D7C9A5", PALE = "#E4E0C8", HORN = "#4A4A4C", WHITE = "#F2F0E6", PINK = "#E89AA0";
  const P2 = [0, 1, 0.5];
  return {
    id: "goat",
    legLen: 0.55,
    boxes: [
      bx(0.42, 0.46, 1, 0, 0.78, -0.02, COAT),
      bx(0.2, 0.06, 0.95, 0, 1.04, -0.02, LIGHT),
      bx(0.36, 0.06, 0.8, 0, 0.53, 0, PALE),
      ...legs([[0.15, 0.34], [-0.15, 0.34], [0.15, -0.38], [-0.15, -0.38]], 0.55, 0.1, 0.46, COAT, { c: WHITE, h: 0.1 }),
      bx(0.24, 0.4, 0.24, 0, 1.1, 0.5, COAT, head, P2),
      bx(0.3, 0.32, 0.34, 0, 1.28, 0.7, COAT, head, P2),
      bx(0.18, 0.18, 0.2, 0, 1.18, 0.95, LIGHT, head, P2),
      bx(0.16, 0.05, 0.06, 0, 1.08, 1.02, PINK, head, P2),
      bx(0.1, 0.06, 0.04, 0, 1.24, 1.06, "#1A1A1A", head, P2),
      bx(0.07, 0.14, 0.07, 0, 0.99, 0.97, WHITE, head, P2),
      bx(0.07, 0.12, 0.07, 0, 0.88, 0.97, WHITE, head + male, P2),
      bx(0.05, 0.1, 0.02, 0.1, 1.31, 0.875, "#FFFFFF", head, P2),
      bx(0.05, 0.1, 0.02, -0.1, 1.31, 0.875, "#FFFFFF", head, P2),
      bx(0.03, 0.1, 0.03, 0.1, 1.31, 0.885, "#141414", head, P2),
      bx(0.03, 0.1, 0.03, -0.1, 1.31, 0.885, "#141414", head, P2),
      bx(0.07, 0.2, 0.07, 0.09, 1.55, 0.64, HORN, head, P2),
      bx(0.07, 0.2, 0.07, -0.09, 1.55, 0.64, HORN, head, P2),
      bx(0.07, 0.07, 0.17, 0.09, 1.67, 0.58, HORN, head, P2),
      bx(0.07, 0.07, 0.17, -0.09, 1.67, 0.58, HORN, head, P2),
      bx(0.1, 0.06, 0.16, 0.2, 1.3, 0.66, COAT, head, P2, { rz: -0.35 }),
      bx(0.1, 0.06, 0.16, -0.2, 1.3, 0.66, COAT, head, P2, { rz: 0.35 }),
      bx(0.08, 0.2, 0.08, 0, 0.98, -0.55, COAT, tail, [0, 0.95, -0.52])
    ]
  };
}
function pig() {
  const PINK = "#F2A9A3", SNOUT = "#E8827D", EAR = "#E58B86", INNER = "#F06B66", HOOF = "#E0706A";
  const P2 = [0, 0.7, 0.5];
  return {
    id: "pig",
    legLen: 0.34,
    boxes: [
      bx(0.7, 0.55, 1, 0, 0.62, -0.05, PINK),
      ...legs([[0.2, 0.3], [-0.2, 0.3], [-0.2, -0.32], [0.2, -0.32]], 0.34, 0.17, 0.26, PINK, { c: HOOF, h: 0.1 }),
      bx(0.52, 0.46, 0.44, 0, 0.66, 0.7, PINK, head, P2),
      bx(0.34, 0.24, 0.16, 0, 0.58, 0.98, SNOUT, head, P2),
      bx(0.05, 0.08, 0.03, 0.07, 0.58, 1.075, "#B8504C", head, P2),
      bx(0.05, 0.08, 0.03, -0.07, 0.58, 1.075, "#B8504C", head, P2),
      bx(0.1, 0.12, 0.03, 0.17, 0.76, 0.925, "#141414", head, P2),
      bx(0.1, 0.12, 0.03, -0.17, 0.76, 0.925, "#141414", head, P2),
      bx(0.2, 0.06, 0.2, 0.2, 0.94, 0.64, EAR, head, P2),
      bx(0.2, 0.06, 0.2, -0.2, 0.94, 0.64, EAR, head, P2),
      bx(0.12, 0.03, 0.12, 0.2, 0.975, 0.64, INNER, head, P2),
      bx(0.12, 0.03, 0.12, -0.2, 0.975, 0.64, INNER, head, P2),
      bx(0.08, 0.14, 0.08, 0, 0.78, -0.58, PINK, tail, [0, 0.7, -0.55]),
      bx(0.12, 0.07, 0.08, 0.04, 0.88, -0.6, PINK, tail, [0, 0.7, -0.55])
    ]
  };
}
function chicken() {
  const WHITE = "#F3F1EA", SHADE = "#E3E0D6", RED = "#B8242B", ORANGE = "#F29A2E", LEG = "#C98C5A", FEATHER = "#3E4B52";
  const P2 = [0, 0.5, 0.2];
  const wingPivot = (x) => [x, 0.46, -0.02];
  return {
    id: "chicken",
    legLen: 0.18,
    youngTint: "#F3D94A",
    boxes: [
      bx(0.34, 0.32, 0.42, 0, 0.34, -0.02, WHITE),
      bx(0.3, 0.14, 0.1, 0, 0.26, 0.2, SHADE),
      bx(0.04, 0.18, 0.04, 0.07, 0.09, 0, LEG, legA, [0.07, 0.18, 0]),
      bx(0.04, 0.18, 0.04, -0.07, 0.09, 0, LEG, legB, [-0.07, 0.18, 0]),
      bx(0.1, 0.03, 0.12, 0.07, 0.015, 0.03, LEG, legA, [0.07, 0.18, 0]),
      bx(0.1, 0.03, 0.12, -0.07, 0.015, 0.03, LEG, legB, [-0.07, 0.18, 0]),
      bx(0.05, 0.2, 0.28, 0.2, 0.38, -0.02, SHADE, wing, wingPivot(0.18)),
      bx(0.05, 0.2, 0.28, -0.2, 0.38, -0.02, SHADE, wing, wingPivot(-0.18)),
      bx(0.22, 0.24, 0.22, 0, 0.6, 0.2, WHITE, head, P2),
      bx(0.06, 0.08, 0.18, 0, 0.76, 0.2, RED, head, P2),
      bx(0.07, 0.14, 0.22, 0, 0.82, 0.2, RED, head + male, P2),
      bx(0.1, 0.06, 0.1, 0, 0.58, 0.34, ORANGE, head, P2),
      bx(0.05, 0.07, 0.05, 0, 0.5, 0.32, RED, head, P2),
      bx(0.03, 0.07, 0.02, 0.08, 0.64, 0.31, "#141414", head, P2),
      bx(0.03, 0.07, 0.02, -0.08, 0.64, 0.31, "#141414", head, P2),
      bx(0.2, 0.16, 0.07, 0, 0.46, -0.25, WHITE, tail, [0, 0.4, -0.22]),
      ...[-0.09, -0.03, 0.03, 0.09].map((x, i) => bx(0.04, 0.32, 0.04, x, 0.66, -0.3 - i % 2 * 0.03, FEATHER, tail + male, [0, 0.4, -0.22]))
    ]
  };
}
function horse() {
  const COAT = "#8E4F27", MANE = "#3B2218", MUZZLE = "#5A3320", HOOF = "#33201A", PINK = "#E9A3A0";
  const P2 = [0, 1.45, 0.8];
  return {
    id: "horse",
    legLen: 0.95,
    boxes: [
      bx(0.62, 0.66, 1.5, 0, 1.22, -0.05, COAT),
      bx(0.5, 0.1, 1.2, 0, 0.9, -0.05, "#A06235"),
      ...legs([[0.2, 0.55], [-0.2, 0.55], [0.2, -0.6], [-0.2, -0.6]], 0.95, 0.17, 0.82, COAT, { c: HOOF, h: 0.13, w: 0.19 }),
      bx(0.3, 0.7, 0.34, 0, 1.7, 0.9, COAT, head, P2),
      bx(0.32, 0.36, 0.62, 0, 2, 1.15, COAT, head, P2),
      bx(0.3, 0.26, 0.2, 0, 1.88, 1.5, MUZZLE, head, P2),
      bx(0.06, 0.05, 0.03, 0.08, 1.92, 1.605, "#141414", head, P2),
      bx(0.06, 0.05, 0.03, -0.08, 1.92, 1.605, "#141414", head, P2),
      bx(0.1, 0.1, 0.03, 0.09, 2.08, 1.465, "#FFFFFF", head, P2),
      bx(0.1, 0.1, 0.03, -0.09, 2.08, 1.465, "#FFFFFF", head, P2),
      bx(0.05, 0.06, 0.035, 0.09, 2.07, 1.48, "#141414", head, P2),
      bx(0.05, 0.06, 0.035, -0.09, 2.07, 1.48, "#141414", head, P2),
      bx(0.1, 0.2, 0.08, 0.1, 2.27, 1, COAT, head, P2),
      bx(0.1, 0.2, 0.08, -0.1, 2.27, 1, COAT, head, P2),
      bx(0.05, 0.12, 0.02, 0.1, 2.26, 1.045, PINK, head, P2),
      bx(0.05, 0.12, 0.02, -0.1, 2.26, 1.045, PINK, head, P2),
      bx(0.1, 0.7, 0.12, 0, 1.92, 0.7, MANE, head, P2),
      bx(0.14, 0.14, 0.14, 0, 2.22, 1.12, MANE, head, P2),
      bx(0.12, 0.75, 0.12, 0, 1, -0.85, MANE, tail, [0, 1.5, -0.8])
    ]
  };
}
function deer() {
  const COAT = "#A5622E", DARK = "#7C4521", BELLY = "#D8B98A", CREAM = "#EBD9B4", ANTLER = "#D9CBA8", HOOF = "#2A1A12";
  const P2 = [0, 1.1, 0.42];
  return {
    id: "deer",
    legLen: 0.85,
    boxes: [
      bx(0.34, 0.38, 0.62, 0, 1, 0.18, COAT),
      bx(0.32, 0.36, 0.5, 0, 1.02, -0.34, COAT),
      bx(0.2, 0.06, 0.9, 0, 1.22, -0.1, DARK),
      bx(0.26, 0.08, 0.85, 0, 0.82, -0.03, BELLY),
      bx(0.2, 0.14, 0.04, 0, 1.02, -0.6, CREAM),
      ...[[0.1, 0.3], [-0.1, 0.3], [0.1, -0.5], [-0.1, -0.5]].flatMap(([x, z]) => {
        const part = legSet(x, z), pv = [x, 0.85, z];
        return [bx(0.1, 0.42, 0.1, x, 0.64, z, COAT, part, pv), bx(0.07, 0.38, 0.07, x, 0.26, z, DARK, part, pv), bx(0.08, 0.07, 0.1, x, 0.035, z + 0.01, HOOF, part, pv)];
      }),
      bx(0.16, 0.42, 0.18, 0, 1.36, 0.5, COAT, head, P2, { rx: -0.3 }),
      bx(0.18, 0.2, 0.3, 0, 1.62, 0.64, COAT, head, P2),
      bx(0.12, 0.12, 0.14, 0, 1.56, 0.84, CREAM, head, P2),
      bx(0.08, 0.06, 0.04, 0, 1.59, 0.92, "#141414", head, P2),
      bx(0.03, 0.05, 0.03, 0.085, 1.67, 0.72, "#141414", head, P2),
      bx(0.03, 0.05, 0.03, -0.085, 1.67, 0.72, "#141414", head, P2),
      bx(0.06, 0.14, 0.04, 0.12, 1.75, 0.56, COAT, head, P2, { rz: -0.3 }),
      bx(0.06, 0.14, 0.04, -0.12, 1.75, 0.56, COAT, head, P2, { rz: 0.3 }),
      bx(0.04, 0.3, 0.04, 0.07, 1.88, 0.58, ANTLER, head + male, P2),
      bx(0.04, 0.3, 0.04, -0.07, 1.88, 0.58, ANTLER, head + male, P2),
      bx(0.14, 0.04, 0.04, 0.13, 1.95, 0.58, ANTLER, head + male, P2),
      bx(0.14, 0.04, 0.04, -0.13, 1.95, 0.58, ANTLER, head + male, P2),
      bx(0.04, 0.16, 0.04, 0.2, 2.03, 0.58, ANTLER, head + male, P2),
      bx(0.04, 0.16, 0.04, -0.2, 2.03, 0.58, ANTLER, head + male, P2),
      bx(0.04, 0.14, 0.04, 0.07, 2.12, 0.58, ANTLER, head + male, P2),
      bx(0.04, 0.14, 0.04, -0.07, 2.12, 0.58, ANTLER, head + male, P2),
      bx(0.08, 0.12, 0.08, 0, 1.08, -0.62, CREAM, tail, [0, 1, -0.6])
    ]
  };
}
function fox() {
  const COAT = "#D96A1E", CREAM = "#F1E2C4", DARK = "#3A2218";
  const P2 = [0, 0.5, 0.32];
  const T = [0, 0.42, -0.3];
  return {
    id: "fox",
    legLen: 0.3,
    boxes: [
      bx(0.22, 0.2, 0.62, 0, 0.4, 0, COAT),
      bx(0.2, 0.14, 0.14, 0, 0.34, 0.3, CREAM),
      ...[[0.08, 0.22], [-0.08, 0.22], [0.08, -0.2], [-0.08, -0.2]].flatMap(([x, z]) => {
        const part = legSet(x, z), pv = [x, 0.3, z];
        return [bx(0.07, 0.17, 0.07, x, 0.215, z, COAT, part, pv), bx(0.08, 0.13, 0.09, x, 0.065, z + 0.01, DARK, part, pv)];
      }),
      bx(0.2, 0.18, 0.22, 0, 0.5, 0.45, COAT, head, P2),
      bx(0.12, 0.1, 0.14, 0, 0.45, 0.62, CREAM, head, P2),
      bx(0.06, 0.05, 0.04, 0, 0.47, 0.7, "#111111", head, P2),
      bx(0.03, 0.04, 0.02, 0.07, 0.54, 0.565, "#111111", head, P2),
      bx(0.03, 0.04, 0.02, -0.07, 0.54, 0.565, "#111111", head, P2),
      bx(0.06, 0.12, 0.04, 0.08, 0.66, 0.4, COAT, head, P2),
      bx(0.06, 0.12, 0.04, -0.08, 0.66, 0.4, COAT, head, P2),
      bx(0.06, 0.04, 0.04, 0.08, 0.74, 0.4, DARK, head, P2),
      bx(0.06, 0.04, 0.04, -0.08, 0.74, 0.4, DARK, head, P2),
      bx(0.12, 0.12, 0.2, 0, 0.42, -0.4, COAT, tail, T),
      bx(0.15, 0.15, 0.2, 0, 0.4, -0.58, COAT, tail, T),
      bx(0.12, 0.12, 0.12, 0, 0.38, -0.72, CREAM, tail, T)
    ]
  };
}
function wolf() {
  const COAT = "#7B7F86", DARK = "#4E5258", LIGHT = "#B8BCC2", NOSE = "#15171A";
  const P2 = [0, 0.85, 0.5];
  const T = [0, 0.75, -0.42];
  return {
    id: "wolf",
    legLen: 0.58,
    boxes: [
      bx(0.3, 0.36, 0.85, 0, 0.76, 0, COAT),
      bx(0.26, 0.08, 0.8, 0, 0.98, -0.02, DARK),
      bx(0.24, 0.1, 0.7, 0, 0.57, 0, LIGHT),
      ...[[0.11, 0.32], [-0.11, 0.32], [0.11, -0.3], [-0.11, -0.3]].flatMap(([x, z]) => {
        const part = legSet(x, z), pv = [x, 0.58, z];
        return [bx(0.11, 0.46, 0.11, x, 0.35, z, COAT, part, pv), bx(0.12, 0.08, 0.16, x, 0.04, z + 0.02, LIGHT, part, pv)];
      }),
      bx(0.22, 0.28, 0.2, 0, 0.92, 0.5, COAT, head, P2),
      bx(0.28, 0.28, 0.3, 0, 0.98, 0.68, COAT, head, P2),
      bx(0.16, 0.14, 0.2, 0, 0.92, 0.9, LIGHT, head, P2),
      bx(0.08, 0.06, 0.04, 0, 0.95, 1.01, NOSE, head, P2),
      bx(0.05, 0.05, 0.02, 0.08, 1.03, 0.83, "#E0B040", head, P2),
      bx(0.05, 0.05, 0.02, -0.08, 1.03, 0.83, "#E0B040", head, P2),
      bx(0.04, 0.05, 0.025, 0.08, 1.03, 0.84, NOSE, head, P2),
      bx(0.04, 0.05, 0.025, -0.08, 1.03, 0.84, NOSE, head, P2),
      bx(0.09, 0.12, 0.06, 0.1, 1.17, 0.6, COAT, head, P2),
      bx(0.09, 0.12, 0.06, -0.1, 1.17, 0.6, COAT, head, P2),
      bx(0.05, 0.08, 0.04, 0.1, 1.27, 0.6, DARK, head, P2),
      bx(0.05, 0.08, 0.04, -0.1, 1.27, 0.6, DARK, head, P2),
      bx(0.11, 0.11, 0.36, 0, 0.7, -0.6, COAT, tail, T),
      bx(0.11, 0.11, 0.14, 0, 0.6, -0.84, DARK, tail, T)
    ]
  };
}
function hare() {
  const COAT = "#A88A62", LIGHT = "#E8DCC4", PINK = "#E9A3A0";
  const P2 = [0, 0.25, 0.15];
  return {
    id: "hare",
    legLen: 0.12,
    boxes: [
      bx(0.2, 0.18, 0.34, 0, 0.2, -0.02, COAT),
      bx(0.22, 0.2, 0.2, 0, 0.24, -0.12, COAT),
      bx(0.16, 0.05, 0.3, 0, 0.12, 0, LIGHT),
      bx(0.05, 0.12, 0.05, 0.06, 0.07, 0.1, COAT, legA, [0.06, 0.14, 0.1]),
      bx(0.05, 0.12, 0.05, -0.06, 0.07, 0.1, COAT, legB, [-0.06, 0.14, 0.1]),
      bx(0.07, 0.12, 0.16, 0.07, 0.07, -0.14, COAT, legB, [0.07, 0.14, -0.14]),
      bx(0.07, 0.12, 0.16, -0.07, 0.07, -0.14, COAT, legA, [-0.07, 0.14, -0.14]),
      bx(0.14, 0.14, 0.16, 0, 0.3, 0.24, COAT, head, P2),
      bx(0.1, 0.08, 0.06, 0, 0.26, 0.33, LIGHT, head, P2),
      bx(0.04, 0.03, 0.02, 0, 0.28, 0.365, PINK, head, P2),
      bx(0.025, 0.04, 0.02, 0.055, 0.34, 0.31, "#141414", head, P2),
      bx(0.025, 0.04, 0.02, -0.055, 0.34, 0.31, "#141414", head, P2),
      bx(0.04, 0.2, 0.05, 0.04, 0.48, 0.2, COAT, head, P2),
      bx(0.04, 0.2, 0.05, -0.04, 0.48, 0.2, COAT, head, P2),
      bx(0.02, 0.14, 0.02, 0.04, 0.48, 0.225, PINK, head, P2),
      bx(0.02, 0.14, 0.02, -0.04, 0.48, 0.225, PINK, head, P2),
      bx(0.09, 0.09, 0.09, 0, 0.27, -0.27, "#FFFFFF", tail, [0, 0.27, -0.24])
    ]
  };
}
function trout() {
  const T = [0, 0, -0.1];
  return {
    id: "trout",
    legLen: 0,
    boxes: [
      bx(0.08, 0.09, 0.26, 0, 0, 0.04, "fauna_trout"),
      bx(0.07, 0.04, 0.24, 0, -0.035, 0.04, "fauna_trout_belly"),
      bx(0.02, 0.05, 0.08, 0, 0.065, 0.02, "fauna_trout"),
      bx(0.05, 0.06, 0.1, 0, 0, -0.14, "fauna_trout", tail, T),
      bx(0.02, 0.11, 0.06, 0, 0, -0.2, "fauna_trout", tail, T)
    ]
  };
}
var ANIMAL_MODELS = {
  cattle: cattle(),
  sheep: sheep(),
  goat: goat(),
  pig: pig(),
  chicken: chicken(),
  horse: horse(),
  deer: deer(),
  fox: fox(),
  wolf: wolf(),
  rabbit: hare(),
  trout: trout()
};

// src/render/smooth.ts
var SNAP_DISTANCE = 6;
function shortestArc(from, to) {
  const TAU = Math.PI * 2;
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}
function tickAlpha(secondsToNext, tickSeconds) {
  if (!(tickSeconds > 0) || !Number.isFinite(secondsToNext)) return 1;
  return Math.min(1, Math.max(0, 1 - secondsToNext / tickSeconds));
}
function stepAlpha(accumulated, step) {
  if (!(step > 0)) return 1;
  return Math.min(1, Math.max(0, accumulated / step));
}
function blendPose(prev, cur, alpha, out, snap = SNAP_DISTANCE) {
  const a = Math.min(1, Math.max(0, alpha));
  if (Math.hypot(cur.x - prev.x, cur.z - prev.z) > snap) {
    out.x = cur.x;
    out.y = cur.y;
    out.z = cur.z;
    out.heading = cur.heading;
    return out;
  }
  out.x = prev.x + (cur.x - prev.x) * a;
  out.y = prev.y + (cur.y - prev.y) * a;
  out.z = prev.z + (cur.z - prev.z) * a;
  out.heading = prev.heading + shortestArc(prev.heading, cur.heading) * a;
  return out;
}

// src/render/fauna.ts
var CAP = { deer: 48, rabbit: 48, trout: 160, fox: 24, wolf: 32 };
var IDS = Object.keys(CAP);
function isMale(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h, 31) + id.charCodeAt(i) | 0;
  return (h & 1) === 1;
}
var FaunaView = class _FaunaView {
  constructor(world) {
    this.world = world;
    this.group.name = "fauna";
    for (const id of IDS) {
      const b = new AnimalBatch(ANIMAL_MODELS[id], CAP[id], `fauna_${id}`);
      this.batches.set(id, b);
      this.group.add(b.mesh);
    }
  }
  world;
  group = new THREE2.Group();
  creatures = /* @__PURE__ */ new Map();
  phases = /* @__PURE__ */ new Map();
  /** Pose before the latest fixed step, so drawing can blend between steps (render only). */
  prev = /* @__PURE__ */ new Map();
  shown = { x: 0, y: 0, z: 0, heading: 0 };
  /** Chunks whose creatures are spawned per frame; the rest wait for the next frame. */
  static SPAWN_CHUNKS_PER_FRAME = 2;
  accumulator = 0;
  /** True while sync() left chunks unspawned; the caller should sync again next frame. */
  pendingSpawn = false;
  batches = /* @__PURE__ */ new Map();
  /** Reconcile creature records with the resident near-chunk set. */
  sync(loaded) {
    for (const [key, list] of [...this.creatures]) {
      if (loaded.has(key)) continue;
      for (const c of list) {
        this.phases.delete(c.id);
        this.prev.delete(c.id);
      }
      this.creatures.delete(key);
    }
    let spawned = 0;
    this.pendingSpawn = false;
    for (const key of loaded) {
      if (this.creatures.has(key)) continue;
      if (spawned++ >= _FaunaView.SPAWN_CHUNKS_PER_FRAME) {
        this.pendingSpawn = true;
        break;
      }
      const [cx, cz] = key.split(",").map(Number);
      this.creatures.set(key, spawnChunkFauna(this.world, cx, cz));
    }
  }
  get count() {
    let n = 0;
    for (const list of this.creatures.values()) n += list.length;
    return n;
  }
  all() {
    return [...this.creatures.values()].flat();
  }
  update(dt, ctx2) {
    this.accumulator = Math.min(this.accumulator + dt, FAUNA_STEP * 4);
    if (this.accumulator >= FAUNA_STEP) {
      const predators = [];
      const prey = [];
      const leaders = /* @__PURE__ */ new Map();
      for (const list of this.creatures.values()) {
        for (const c of list) {
          if (c.species === "fox" || c.species === "wolf") predators.push({ species: c.species, x: c.x, z: c.z });
          if (c.species === "rabbit") prey.push({ x: c.x, z: c.z });
          if (c.species === "wolf" && !c.leader) leaders.set(c.id, c);
        }
      }
      const full = { ...ctx2, predators, prey, leaders };
      while (this.accumulator >= FAUNA_STEP) {
        for (const list of this.creatures.values()) {
          for (const c of list) {
            const p = this.prev.get(c.id);
            if (p) {
              p.x = c.x;
              p.y = c.y;
              p.z = c.z;
              p.heading = c.heading;
            } else this.prev.set(c.id, { x: c.x, y: c.y, z: c.z, heading: c.heading });
            stepCreature(this.world, c, full);
          }
        }
        this.accumulator -= FAUNA_STEP;
      }
    }
    this.draw(dt);
  }
  draw(dt) {
    for (const b of this.batches.values()) b.begin();
    const now = performance.now() / 1e3;
    const alpha = stepAlpha(this.accumulator, FAUNA_STEP), shown = this.shown;
    for (const list of this.creatures.values()) {
      for (const c of list) {
        const sp = c.species;
        const before = this.prev.get(c.id);
        if (before) blendPose(before, c, alpha, shown, 3);
        else {
          shown.x = c.x;
          shown.y = c.y;
          shown.z = c.z;
          shown.heading = c.heading;
        }
        const batch = this.batches.get(sp);
        const moving = c.speed > 0.05;
        const ph = (this.phases.get(c.id) ?? 0) + dt * (moving ? 3 + c.speed * (sp === "rabbit" ? 4 : sp === "trout" ? 8 : 2.4) : 1);
        this.phases.set(c.id, ph);
        const lying = (c.behaviour === "sleep" || c.behaviour === "rest") && sp !== "trout";
        const grazing = c.behaviour === "graze";
        let head2 = 0, lift = 0, roll = 0, pitch = 0, swing = moving ? Math.min(0.85, 0.25 + c.speed * 0.1) : 0;
        if (grazing) head2 = 0.75 + Math.sin(now * 3 + c.x) * 0.1;
        else if (lying) head2 = 0.3;
        else if (c.behaviour === "stalk") {
          head2 = 0.45;
          swing = 0.35;
        } else if (c.behaviour === "chase" || c.behaviour === "flee") head2 = -0.12;
        else if (!moving) head2 = Math.sin(now * 0.7 + c.z) * 0.08;
        if (sp === "rabbit" && moving) {
          lift = Math.abs(Math.sin(ph)) * 0.18;
          swing = 0.9;
        }
        if (sp === "deer" && c.speed > 3) lift = Math.abs(Math.sin(ph)) * 0.15;
        if (sp === "trout") {
          roll = Math.sin(ph * 1.5) * 0.05;
          swing = 0;
        }
        batch.push({
          x: shown.x,
          y: shown.y + lift,
          z: shown.z,
          heading: shown.heading,
          scale: 1,
          phase: ph,
          legSwing: swing,
          headPitch: head2,
          tailWag: sp === "trout" ? moving && c.speed > 1 ? 0.55 : 0.3 : sp === "fox" || sp === "wolf" ? lying ? 0.05 : 0.3 : 0.15,
          male: isMale(c.id),
          young: false,
          lying,
          extra: 1,
          pitch,
          roll
        });
      }
    }
    for (const b of this.batches.values()) b.end();
  }
  metrics() {
    const out = { total: 0 };
    for (const c of this.all()) {
      out[c.species] = (out[c.species] ?? 0) + 1;
      out.total++;
    }
    return out;
  }
};

// src/app/sim-clock.ts
var TICK_SECONDS = 2;
var MAX_ACCUMULATED = TICK_SECONDS * 1.5;
var SimClock = class {
  accumulated = 0;
  ticksIssued = 0;
  /** Returns true when a tick is due. `dt` is real elapsed seconds since the last call. */
  advance(dt, active) {
    if (!active || !Number.isFinite(dt) || dt <= 0) return false;
    this.accumulated = Math.min(MAX_ACCUMULATED, this.accumulated + Math.min(dt, TICK_SECONDS));
    if (this.accumulated < TICK_SECONDS) return false;
    this.accumulated -= TICK_SECONDS;
    this.ticksIssued++;
    return true;
  }
  /** Forget partial progress (after resume or a manual time skip). */
  reset() {
    this.accumulated = 0;
  }
  /** Seconds until the next tick while active. */
  get secondsToNext() {
    return Math.max(0, TICK_SECONDS - this.accumulated);
  }
};

// tests/m007.smooth.test.ts
var P = (x, z, heading = 0, y = 0) => ({ x, y, z, heading });
test("tickAlpha follows the clock and stays in [0,1]", () => {
  assert.equal(tickAlpha(TICK_SECONDS, TICK_SECONDS), 0);
  assert.equal(tickAlpha(0, TICK_SECONDS), 1);
  assert.equal(tickAlpha(TICK_SECONDS / 2, TICK_SECONDS), 0.5);
  assert.equal(tickAlpha(-3, TICK_SECONDS), 1);
  assert.equal(tickAlpha(99, TICK_SECONDS), 0);
  assert.equal(tickAlpha(NaN, TICK_SECONDS), 1);
  const clock = new SimClock();
  clock.advance(0.5, true);
  assert.equal(tickAlpha(clock.secondsToNext, TICK_SECONDS), 0.25);
  assert.equal(stepAlpha(FAUNA_STEP / 4, FAUNA_STEP), 0.25);
});
test("blend is continuous across a tick boundary and is not a step function", () => {
  const a = P(0, 0), b = P(1.5, 0), c = P(3, 0);
  const out = P(0, 0);
  const xs = [];
  const frames = Math.round(TICK_SECONDS * 60);
  for (let i = 0; i < frames; i++) xs.push(blendPose(a, b, i / frames, out).x);
  for (let i = 0; i < frames; i++) xs.push(blendPose(b, c, i / frames, out).x);
  xs.push(blendPose(b, c, 1, out).x);
  let maxJump = 0;
  for (let i = 1; i < xs.length; i++) maxJump = Math.max(maxJump, Math.abs(xs[i] - xs[i - 1]));
  assert.ok(maxJump <= 1.5 / frames + 1e-9, `per-frame jump ${maxJump}`);
  assert.ok(xs.every((x, i) => i === 0 || x >= xs[i - 1]), "monotonic");
  const raw = [blendPose(a, b, 1, out).x, blendPose(b, c, 1, out).x];
  assert.ok(Math.abs(raw[1] - raw[0]) > 100 * (1.5 / frames));
});
test("yaw takes the shortest arc across the +-PI seam", () => {
  assert.ok(Math.abs(shortestArc(3, -3) - (Math.PI * 2 - 6)) < 1e-9);
  assert.ok(Math.abs(shortestArc(-3, 3) + (Math.PI * 2 - 6)) < 1e-9);
  const out = P(0, 0);
  const mid = blendPose(P(0, 0, 3), P(0, 0, -3), 0.5, out).heading;
  assert.ok(Math.abs(Math.abs(mid) - Math.PI) < 0.01 || Math.abs(mid - Math.PI) < 0.01, `mid ${mid}`);
  assert.ok(Math.abs(shortestArc(0, 7 * Math.PI)) <= Math.PI);
});
test("large jumps snap instead of sliding", () => {
  const out = P(0, 0);
  blendPose(P(0, 0), P(SNAP_DISTANCE + 1, 0, 1), 0.1, out);
  assert.equal(out.x, SNAP_DISTANCE + 1);
  assert.equal(out.heading, 1);
  blendPose(P(0, 0), P(SNAP_DISTANCE - 1, 0), 0.5, out);
  assert.equal(out.x, (SNAP_DISTANCE - 1) / 2);
});
test("blend depends only on alpha, never on how many frames it took", () => {
  const a = P(2, 3, 0.4, 5), b = P(4, 1, 1.2, 6), o1 = P(0, 0), o2 = P(0, 0);
  for (const t of [0, 0.13, 0.5, 0.99, 1]) {
    blendPose(a, b, t, o1);
    for (let i = 0; i < 7; i++) blendPose(a, b, t, o2);
    assert.deepEqual(o1, o2);
  }
});
function populatedView() {
  const world = createWorld(1337, GENERATOR_V2);
  const keys = /* @__PURE__ */ new Set();
  for (let cz = 28; cz <= 32; cz++) for (let cx = 28; cx <= 32; cx++) {
    ensureChunk(world, cx, cz);
    keys.add(`${cx},${cz}`);
  }
  const view = new FaunaView(world);
  for (let i = 0; i < 20 && (i === 0 || view.pendingSpawn); i++) view.sync(keys);
  return view;
}
var snapshot = (v) => JSON.stringify(v.all().map((c) => [c.id, c.x, c.y, c.z, c.heading, c.behaviour, c.rng]));
var ctx = { threats: [], night: false };
test("rendering never changes simulation state", () => {
  const plain = populatedView(), drawn = populatedView();
  assert.ok(plain.count > 0);
  for (let i = 0; i < 100; i++) plain.update(0.1, ctx);
  for (let i = 0; i < 100; i++) {
    drawn.update(0.1, ctx);
    drawn.update(0, ctx);
    drawn.update(0, ctx);
  }
  assert.equal(snapshot(plain), snapshot(drawn));
});
test("drawn animals move every frame, not once per 10 Hz sim step", () => {
  const view = populatedView();
  for (let i = 0; i < 60; i++) view.update(1 / 60, ctx);
  const meshes = view.group.children;
  const read = () => meshes.flatMap((m) => Array.from({ length: m.count }, (_, i) => [m.instanceMatrix.array[i * 16 + 12], m.instanceMatrix.array[i * 16 + 14]]));
  let prev = read();
  const total = prev.map(() => 0), moved = prev.map(() => 0), biggest = prev.map(() => 0);
  const FRAMES = 180;
  for (let f = 0; f < FRAMES; f++) {
    view.update(1 / 60, ctx);
    const now = read();
    now.forEach((p, i) => {
      const d = Math.hypot(p[0] - prev[i][0], p[1] - prev[i][1]);
      total[i] += d;
      if (d > 1e-6) moved[i]++;
      biggest[i] = Math.max(biggest[i], d);
    });
    prev = now;
  }
  const best = total.indexOf(Math.max(...total));
  assert.ok(total[best] > 0.5, "some animal travelled");
  assert.ok(moved[best] / FRAMES > 0.6, `moved on ${moved[best]} of ${FRAMES} frames`);
});
test("FaunaView spawns at most SPAWN_CHUNKS_PER_FRAME chunks per sync and finishes over later frames", () => {
  const world = createWorld(1337, GENERATOR_V2);
  const keys = /* @__PURE__ */ new Set();
  for (let cx = 0; cx < 5; cx++) {
    ensureChunk(world, cx, 0);
    keys.add(`${cx},0`);
  }
  const view = new FaunaView(world);
  const priv = view;
  const frames = [];
  for (let i = 0; i < 6 && (i === 0 || view.pendingSpawn); i++) {
    view.sync(keys);
    frames.push(priv.creatures.size);
  }
  assert.deepEqual(frames, [2, 4, 5]);
  assert.equal(view.pendingSpawn, false);
  view.sync(keys);
  assert.equal(priv.creatures.size, 5, "a settled sync spawns nothing more");
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwNy5zbW9vdGgudGVzdC50cyIsICIuLi8uLi9zcmMvc2ltL3N0b25lLWNvbXBhdC50cyIsICIuLi8uLi9zcmMvc2ltL25vaXNlLnRzIiwgIi4uLy4uL3NyYy9zaW0vaHlkcm9sb2d5LnRzIiwgIi4uLy4uL3NyYy9zaW0vbWF0ZXJpYWxzLnRzIiwgIi4uLy4uL3NyYy9zaW0vdGVycmFpbi12Mi50cyIsICIuLi8uLi9zcmMvc2ltL3dvcmxkLnRzIiwgIi4uLy4uL3NyYy9zaW0vZmF1bmEudHMiLCAiLi4vLi4vc3JjL3JlbmRlci9mYXVuYS50cyIsICIuLi8uLi9zcmMvcmVuZGVyL2FuaW1hbC1raXQudHMiLCAiLi4vLi4vc3JjL2RhdGEvcGFsZXR0ZS5qc29uIiwgIi4uLy4uL3NyYy9yZW5kZXIvYW5pbWFsLW1vZGVscy50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3Ntb290aC50cyIsICIuLi8uLi9zcmMvYXBwL3NpbS1jbG9jay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCB7IEdFTkVSQVRPUl9WMiwgY3JlYXRlV29ybGQsIGVuc3VyZUNodW5rIH0gZnJvbSAnLi4vc3JjL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBGQVVOQV9TVEVQIH0gZnJvbSAnLi4vc3JjL3NpbS9mYXVuYSc7XG5pbXBvcnQgeyBGYXVuYVZpZXcgfSBmcm9tICcuLi9zcmMvcmVuZGVyL2ZhdW5hJztcbmltcG9ydCB7IFNOQVBfRElTVEFOQ0UsIFBvc2UsIGJsZW5kUG9zZSwgc2hvcnRlc3RBcmMsIHN0ZXBBbHBoYSwgdGlja0FscGhhIH0gZnJvbSAnLi4vc3JjL3JlbmRlci9zbW9vdGgnO1xuaW1wb3J0IHsgU2ltQ2xvY2ssIFRJQ0tfU0VDT05EUyB9IGZyb20gJy4uL3NyYy9hcHAvc2ltLWNsb2NrJztcblxuY29uc3QgUCA9ICh4OiBudW1iZXIsIHo6IG51bWJlciwgaGVhZGluZyA9IDAsIHkgPSAwKTogUG9zZSA9PiAoeyB4LCB5LCB6LCBoZWFkaW5nIH0pO1xuXG50ZXN0KCd0aWNrQWxwaGEgZm9sbG93cyB0aGUgY2xvY2sgYW5kIHN0YXlzIGluIFswLDFdJywgKCkgPT4ge1xuICBhc3NlcnQuZXF1YWwodGlja0FscGhhKFRJQ0tfU0VDT05EUywgVElDS19TRUNPTkRTKSwgMCk7XG4gIGFzc2VydC5lcXVhbCh0aWNrQWxwaGEoMCwgVElDS19TRUNPTkRTKSwgMSk7XG4gIGFzc2VydC5lcXVhbCh0aWNrQWxwaGEoVElDS19TRUNPTkRTIC8gMiwgVElDS19TRUNPTkRTKSwgMC41KTtcbiAgYXNzZXJ0LmVxdWFsKHRpY2tBbHBoYSgtMywgVElDS19TRUNPTkRTKSwgMSk7XG4gIGFzc2VydC5lcXVhbCh0aWNrQWxwaGEoOTksIFRJQ0tfU0VDT05EUyksIDApO1xuICBhc3NlcnQuZXF1YWwodGlja0FscGhhKE5hTiwgVElDS19TRUNPTkRTKSwgMSk7XG4gIGNvbnN0IGNsb2NrID0gbmV3IFNpbUNsb2NrKCk7XG4gIGNsb2NrLmFkdmFuY2UoMC41LCB0cnVlKTtcbiAgYXNzZXJ0LmVxdWFsKHRpY2tBbHBoYShjbG9jay5zZWNvbmRzVG9OZXh0LCBUSUNLX1NFQ09ORFMpLCAwLjI1KTtcbiAgYXNzZXJ0LmVxdWFsKHN0ZXBBbHBoYShGQVVOQV9TVEVQIC8gNCwgRkFVTkFfU1RFUCksIDAuMjUpO1xufSk7XG5cbnRlc3QoJ2JsZW5kIGlzIGNvbnRpbnVvdXMgYWNyb3NzIGEgdGljayBib3VuZGFyeSBhbmQgaXMgbm90IGEgc3RlcCBmdW5jdGlvbicsICgpID0+IHtcbiAgLy8gVHdvIGNvbnNlY3V0aXZlIHRpY2tzLCAxLjUgbSBlYWNoLiBTYW1wbGUgYXQgNjAgZnBzIGFjcm9zcyBib3RoLlxuICBjb25zdCBhID0gUCgwLCAwKSwgYiA9IFAoMS41LCAwKSwgYyA9IFAoMywgMCk7XG4gIGNvbnN0IG91dCA9IFAoMCwgMCk7XG4gIGNvbnN0IHhzOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBmcmFtZXMgPSBNYXRoLnJvdW5kKFRJQ0tfU0VDT05EUyAqIDYwKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmcmFtZXM7IGkrKykgeHMucHVzaChibGVuZFBvc2UoYSwgYiwgaSAvIGZyYW1lcywgb3V0KS54KTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmcmFtZXM7IGkrKykgeHMucHVzaChibGVuZFBvc2UoYiwgYywgaSAvIGZyYW1lcywgb3V0KS54KTtcbiAgeHMucHVzaChibGVuZFBvc2UoYiwgYywgMSwgb3V0KS54KTtcbiAgbGV0IG1heEp1bXAgPSAwO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IHhzLmxlbmd0aDsgaSsrKSBtYXhKdW1wID0gTWF0aC5tYXgobWF4SnVtcCwgTWF0aC5hYnMoeHNbaV0gLSB4c1tpIC0gMV0pKTtcbiAgYXNzZXJ0Lm9rKG1heEp1bXAgPD0gMS41IC8gZnJhbWVzICsgMWUtOSwgYHBlci1mcmFtZSBqdW1wICR7bWF4SnVtcH1gKTtcbiAgYXNzZXJ0Lm9rKHhzLmV2ZXJ5KCh4LCBpKSA9PiBpID09PSAwIHx8IHggPj0geHNbaSAtIDFdKSwgJ21vbm90b25pYycpO1xuICAvLyBXaXRob3V0IGludGVycG9sYXRpb24gKGFscGhhIGZvcmNlZCB0byAxKSB0aGUgc2FtZSB3YWxrIGp1bXBzIGEgd2hvbGUgdGljayBhdCBvbmNlLlxuICBjb25zdCByYXcgPSBbYmxlbmRQb3NlKGEsIGIsIDEsIG91dCkueCwgYmxlbmRQb3NlKGIsIGMsIDEsIG91dCkueF07XG4gIGFzc2VydC5vayhNYXRoLmFicyhyYXdbMV0gLSByYXdbMF0pID4gMTAwICogKDEuNSAvIGZyYW1lcykpO1xufSk7XG5cbnRlc3QoJ3lhdyB0YWtlcyB0aGUgc2hvcnRlc3QgYXJjIGFjcm9zcyB0aGUgKy1QSSBzZWFtJywgKCkgPT4ge1xuICBhc3NlcnQub2soTWF0aC5hYnMoc2hvcnRlc3RBcmMoMy4wLCAtMy4wKSAtIChNYXRoLlBJICogMiAtIDYpKSA8IDFlLTkpO1xuICBhc3NlcnQub2soTWF0aC5hYnMoc2hvcnRlc3RBcmMoLTMuMCwgMy4wKSArIChNYXRoLlBJICogMiAtIDYpKSA8IDFlLTkpO1xuICBjb25zdCBvdXQgPSBQKDAsIDApO1xuICBjb25zdCBtaWQgPSBibGVuZFBvc2UoUCgwLCAwLCAzLjApLCBQKDAsIDAsIC0zLjApLCAwLjUsIG91dCkuaGVhZGluZztcbiAgLy8gSGFsZndheSBpcyBvbiB0aGUgc2VhbSAobmVhciBQSSksIG5vdCBuZWFyIDAuXG4gIGFzc2VydC5vayhNYXRoLmFicyhNYXRoLmFicyhtaWQpIC0gTWF0aC5QSSkgPCAwLjAxIHx8IE1hdGguYWJzKG1pZCAtIE1hdGguUEkpIDwgMC4wMSwgYG1pZCAke21pZH1gKTtcbiAgYXNzZXJ0Lm9rKE1hdGguYWJzKHNob3J0ZXN0QXJjKDAsIDcgKiBNYXRoLlBJKSkgPD0gTWF0aC5QSSk7XG59KTtcblxudGVzdCgnbGFyZ2UganVtcHMgc25hcCBpbnN0ZWFkIG9mIHNsaWRpbmcnLCAoKSA9PiB7XG4gIGNvbnN0IG91dCA9IFAoMCwgMCk7XG4gIGJsZW5kUG9zZShQKDAsIDApLCBQKFNOQVBfRElTVEFOQ0UgKyAxLCAwLCAxKSwgMC4xLCBvdXQpO1xuICBhc3NlcnQuZXF1YWwob3V0LngsIFNOQVBfRElTVEFOQ0UgKyAxKTtcbiAgYXNzZXJ0LmVxdWFsKG91dC5oZWFkaW5nLCAxKTtcbiAgYmxlbmRQb3NlKFAoMCwgMCksIFAoU05BUF9ESVNUQU5DRSAtIDEsIDApLCAwLjUsIG91dCk7XG4gIGFzc2VydC5lcXVhbChvdXQueCwgKFNOQVBfRElTVEFOQ0UgLSAxKSAvIDIpO1xufSk7XG5cbnRlc3QoJ2JsZW5kIGRlcGVuZHMgb25seSBvbiBhbHBoYSwgbmV2ZXIgb24gaG93IG1hbnkgZnJhbWVzIGl0IHRvb2snLCAoKSA9PiB7XG4gIGNvbnN0IGEgPSBQKDIsIDMsIDAuNCwgNSksIGIgPSBQKDQsIDEsIDEuMiwgNiksIG8xID0gUCgwLCAwKSwgbzIgPSBQKDAsIDApO1xuICBmb3IgKGNvbnN0IHQgb2YgWzAsIDAuMTMsIDAuNSwgMC45OSwgMV0pIHtcbiAgICBibGVuZFBvc2UoYSwgYiwgdCwgbzEpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNzsgaSsrKSBibGVuZFBvc2UoYSwgYiwgdCwgbzIpO1xuICAgIGFzc2VydC5kZWVwRXF1YWwobzEsIG8yKTtcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIHBvcHVsYXRlZFZpZXcoKTogRmF1bmFWaWV3IHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCgxMzM3LCBHRU5FUkFUT1JfVjIpO1xuICBjb25zdCBrZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAobGV0IGN6ID0gMjg7IGN6IDw9IDMyOyBjeisrKSBmb3IgKGxldCBjeCA9IDI4OyBjeCA8PSAzMjsgY3grKykgeyBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTsga2V5cy5hZGQoYCR7Y3h9LCR7Y3p9YCk7IH1cbiAgY29uc3QgdmlldyA9IG5ldyBGYXVuYVZpZXcod29ybGQpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IDIwICYmIChpID09PSAwIHx8IHZpZXcucGVuZGluZ1NwYXduKTsgaSsrKSB2aWV3LnN5bmMoa2V5cyk7XG4gIHJldHVybiB2aWV3O1xufVxuY29uc3Qgc25hcHNob3QgPSAodjogRmF1bmFWaWV3KSA9PiBKU09OLnN0cmluZ2lmeSh2LmFsbCgpLm1hcCgoYykgPT4gW2MuaWQsIGMueCwgYy55LCBjLnosIGMuaGVhZGluZywgYy5iZWhhdmlvdXIsIGMucm5nXSkpO1xuY29uc3QgY3R4ID0geyB0aHJlYXRzOiBbXSwgbmlnaHQ6IGZhbHNlIH07XG5cbnRlc3QoJ3JlbmRlcmluZyBuZXZlciBjaGFuZ2VzIHNpbXVsYXRpb24gc3RhdGUnLCAoKSA9PiB7XG4gIC8vIFNhbWUgc2ltIHRpbWUsIGJ1dCBvbmUgdmlldyBpcyBhbHNvIGRyYXduIGV4dHJhIHRpbWVzICh1cGRhdGUoMCkpIGJldHdlZW4gc3RlcHMuXG4gIGNvbnN0IHBsYWluID0gcG9wdWxhdGVkVmlldygpLCBkcmF3biA9IHBvcHVsYXRlZFZpZXcoKTtcbiAgYXNzZXJ0Lm9rKHBsYWluLmNvdW50ID4gMCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgMTAwOyBpKyspIHBsYWluLnVwZGF0ZSgwLjEsIGN0eCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgMTAwOyBpKyspIHsgZHJhd24udXBkYXRlKDAuMSwgY3R4KTsgZHJhd24udXBkYXRlKDAsIGN0eCk7IGRyYXduLnVwZGF0ZSgwLCBjdHgpOyB9XG4gIGFzc2VydC5lcXVhbChzbmFwc2hvdChwbGFpbiksIHNuYXBzaG90KGRyYXduKSk7XG59KTtcblxudGVzdCgnZHJhd24gYW5pbWFscyBtb3ZlIGV2ZXJ5IGZyYW1lLCBub3Qgb25jZSBwZXIgMTAgSHogc2ltIHN0ZXAnLCAoKSA9PiB7XG4gIGNvbnN0IHZpZXcgPSBwb3B1bGF0ZWRWaWV3KCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgNjA7IGkrKykgdmlldy51cGRhdGUoMSAvIDYwLCBjdHgpO1xuICBjb25zdCBtZXNoZXMgPSB2aWV3Lmdyb3VwLmNoaWxkcmVuIGFzIHVua25vd24gYXMgQXJyYXk8eyBjb3VudDogbnVtYmVyOyBpbnN0YW5jZU1hdHJpeDogeyBhcnJheTogRmxvYXQzMkFycmF5IH0gfT47XG4gIGNvbnN0IHJlYWQgPSAoKSA9PiBtZXNoZXMuZmxhdE1hcCgobSkgPT4gQXJyYXkuZnJvbSh7IGxlbmd0aDogbS5jb3VudCB9LCAoXywgaSkgPT4gW20uaW5zdGFuY2VNYXRyaXguYXJyYXlbaSAqIDE2ICsgMTJdLCBtLmluc3RhbmNlTWF0cml4LmFycmF5W2kgKiAxNiArIDE0XV0pKTtcbiAgbGV0IHByZXYgPSByZWFkKCk7XG4gIGNvbnN0IHRvdGFsID0gcHJldi5tYXAoKCkgPT4gMCksIG1vdmVkID0gcHJldi5tYXAoKCkgPT4gMCksIGJpZ2dlc3QgPSBwcmV2Lm1hcCgoKSA9PiAwKTtcbiAgY29uc3QgRlJBTUVTID0gMTgwO1xuICBmb3IgKGxldCBmID0gMDsgZiA8IEZSQU1FUzsgZisrKSB7XG4gICAgdmlldy51cGRhdGUoMSAvIDYwLCBjdHgpO1xuICAgIGNvbnN0IG5vdyA9IHJlYWQoKTtcbiAgICBub3cuZm9yRWFjaCgocCwgaSkgPT4ge1xuICAgICAgY29uc3QgZCA9IE1hdGguaHlwb3QocFswXSAtIHByZXZbaV1bMF0sIHBbMV0gLSBwcmV2W2ldWzFdKTtcbiAgICAgIHRvdGFsW2ldICs9IGQ7IGlmIChkID4gMWUtNikgbW92ZWRbaV0rKzsgYmlnZ2VzdFtpXSA9IE1hdGgubWF4KGJpZ2dlc3RbaV0sIGQpO1xuICAgIH0pO1xuICAgIHByZXYgPSBub3c7XG4gIH1cbiAgY29uc3QgYmVzdCA9IHRvdGFsLmluZGV4T2YoTWF0aC5tYXgoLi4udG90YWwpKTtcbiAgYXNzZXJ0Lm9rKHRvdGFsW2Jlc3RdID4gMC41LCAnc29tZSBhbmltYWwgdHJhdmVsbGVkJyk7XG4gIC8vIEJsZW5kZWQ6IGEgd2Fsa2luZyBhbmltYWwgYWR2YW5jZXMgb24gbmVhcmx5IGV2ZXJ5IGZyYW1lIChhIHJhdyAxMCBIeiBzdGVwIG9ubHkgb24gZXZlcnkgNnRoKS5cbiAgYXNzZXJ0Lm9rKG1vdmVkW2Jlc3RdIC8gRlJBTUVTID4gMC42LCBgbW92ZWQgb24gJHttb3ZlZFtiZXN0XX0gb2YgJHtGUkFNRVN9IGZyYW1lc2ApO1xufSk7XG5cbnRlc3QoJ0ZhdW5hVmlldyBzcGF3bnMgYXQgbW9zdCBTUEFXTl9DSFVOS1NfUEVSX0ZSQU1FIGNodW5rcyBwZXIgc3luYyBhbmQgZmluaXNoZXMgb3ZlciBsYXRlciBmcmFtZXMnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoMTMzNywgR0VORVJBVE9SX1YyKTtcbiAgY29uc3Qga2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGxldCBjeCA9IDA7IGN4IDwgNTsgY3grKykgeyBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIDApOyBrZXlzLmFkZChgJHtjeH0sMGApOyB9XG4gIGNvbnN0IHZpZXcgPSBuZXcgRmF1bmFWaWV3KHdvcmxkKTtcbiAgY29uc3QgcHJpdiA9IHZpZXcgYXMgdW5rbm93biBhcyB7IGNyZWF0dXJlczogTWFwPHN0cmluZywgdW5rbm93bj4gfTtcbiAgY29uc3QgZnJhbWVzOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IDYgJiYgKGkgPT09IDAgfHwgdmlldy5wZW5kaW5nU3Bhd24pOyBpKyspIHtcbiAgICB2aWV3LnN5bmMoa2V5cyk7XG4gICAgZnJhbWVzLnB1c2gocHJpdi5jcmVhdHVyZXMuc2l6ZSk7XG4gIH1cbiAgYXNzZXJ0LmRlZXBFcXVhbChmcmFtZXMsIFsyLCA0LCA1XSk7XG4gIGFzc2VydC5lcXVhbCh2aWV3LnBlbmRpbmdTcGF3biwgZmFsc2UpO1xuICB2aWV3LnN5bmMoa2V5cyk7XG4gIGFzc2VydC5lcXVhbChwcml2LmNyZWF0dXJlcy5zaXplLCA1LCAnYSBzZXR0bGVkIHN5bmMgc3Bhd25zIG5vdGhpbmcgbW9yZScpO1xufSk7XG4iLCAiLy8gUHJpdmF0ZSBtaWdyYXRpb24gcmVwbGF5IG9ubHkuIFJldGlyZWQgZW50aXRpZXMgbGl2ZSBpbiB0aGlzIFdvcmxkIHdoaWxlIGFuXG4vLyBhY2NlcHRlZCBoaXN0b3JpY2FsIGpvdXJuYWwgaXMgY2hlY2tlZDsgbm8gcHVibGljIGNvbW1hbmQgZW5hYmxlcyB0aGlzIG1vZGUuXG5pbnRlcmZhY2UgUmVwbGF5U3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIGhpc3RvcmljYWxIYXNoOiBib29sZWFuO1xuICBtaWdyYXRlZDogYm9vbGVhbjtcbn1cblxuY29uc3Qgc3RhdGVzID0gbmV3IFdlYWtNYXA8b2JqZWN0LCBSZXBsYXlTdGF0ZT4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxheVN0b25lU3RhdGUod29ybGQ6IG9iamVjdCk6IFJlcGxheVN0YXRlIHtcbiAgbGV0IHN0YXRlID0gc3RhdGVzLmdldCh3b3JsZCk7XG4gIGlmICghc3RhdGUpIHsgc3RhdGUgPSB7IGFjdGl2ZTogZmFsc2UsIGhpc3RvcmljYWxIYXNoOiBmYWxzZSwgbWlncmF0ZWQ6IGZhbHNlIH07IHN0YXRlcy5zZXQod29ybGQsIHN0YXRlKTsgfVxuICByZXR1cm4gc3RhdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IHRydWU7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbiAgc3RhdGUubWlncmF0ZWQgPSBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/LmFjdGl2ZSA/PyBmYWxzZTtcbn1cblxuLyoqIFNuYXBzaG90IGhhc2hlcyBiZWZvcmUgYW5kIGR1cmluZyB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheSBpbmNsdWRlIHN0b25lcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5oaXN0b3JpY2FsSGFzaCA/PyBmYWxzZTtcbn1cblxuLyoqIEEgbWlncmF0ZWQgc25hcHNob3QgYWxyZWFkeSBoYXMgcmV0aXJlbWVudCB0b21ic3RvbmVzIGluIGdlbmVyYXRlZCBjaHVua3MuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5taWdyYXRlZCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lm1pZ3JhdGVkID8/IGZhbHNlO1xufVxuXG4vKiogRXhpdCBoaXN0b3JpY2FsIG1vZGUgYWZ0ZXIgYWxsIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBoYXNoZXMgaGF2ZSBwYXNzZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZmluaXNoU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSBmYWxzZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSBmYWxzZTtcbiAgc3RhdGUubWlncmF0ZWQgPSB0cnVlO1xufVxuIiwgIi8vIERldGVybWluaXN0aWMgaGFzaCwgbm9pc2UgYW5kIG1hdGggaGVscGVycyBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIuXG4vLyBQdXJlIFR5cGVTY3JpcHQgKEQtMDA1KS4gRXh0cmFjdGVkIGZyb20gd29ybGQudHMgdW5jaGFuZ2VkIHNvIHRlcnJhaW5cbi8vIGdlbmVyYXRvcnMgb2YgZXZlcnkgdmVyc2lvbiB1c2UgaWRlbnRpY2FsIHByaW1pdGl2ZXMuXG5leHBvcnQgY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuZXhwb3J0IGNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuZXhwb3J0IGNvbnN0IHNtb290aHN0ZXAgPSAoZTA6IG51bWJlciwgZTE6IG51bWJlciwgeDogbnVtYmVyKSA9PiB7XG4gIGNvbnN0IHQgPSBjbGFtcCgoeCAtIGUwKSAvIChlMSAtIGUwKSwgMCwgMSk7XG4gIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xufTtcblxuLy8gLS0tLS0tLS0tLSBkZXRlcm1pbmlzdGljIGhhc2ggLyBub2lzZSAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gaGFzaDJpKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoM2koeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKSBeIE1hdGguaW11bCh6LCAyMjQ2ODIyNTE5KTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbXVsYmVycnkzMihzZWVkOiBudW1iZXIpOiAoKSA9PiBudW1iZXIge1xuICBsZXQgYSA9IHNlZWQgPj4+IDA7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgYSA9IChhICsgMHg2ZDJiNzlmNSkgPj4+IDA7XG4gICAgbGV0IHQgPSBhO1xuICAgIHQgPSBNYXRoLmltdWwodCBeICh0ID4+PiAxNSksIHQgfCAxKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgdCB8IDYxKTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IHNtb290aCA9ICh0OiBudW1iZXIpID0+IHQgKiB0ICogKDMgLSAyICogdCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSk7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSk7XG4gIGNvbnN0IGEgPSBoYXNoMmkoeGksIHlpLCBzZWVkKSwgYiA9IGhhc2gyaSh4aSArIDEsIHlpLCBzZWVkKTtcbiAgY29uc3QgYyA9IGhhc2gyaSh4aSwgeWkgKyAxLCBzZWVkKSwgZCA9IGhhc2gyaSh4aSArIDEsIHlpICsgMSwgc2VlZCk7XG4gIGNvbnN0IHRvcCA9IGEgKyAoYiAtIGEpICogeGY7XG4gIGNvbnN0IGJvdHRvbSA9IGMgKyAoZCAtIGMpICogeGY7XG4gIHJldHVybiB0b3AgKyAoYm90dG9tIC0gdG9wKSAqIHlmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMih4ICogZnJlcSwgeSAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KSwgemkgPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpLCB6ZiA9IHNtb290aCh6IC0gemkpO1xuICBjb25zdCBjMDAwID0gaGFzaDNpKHhpLCB5aSwgemksIHNlZWQpLCBjMTAwID0gaGFzaDNpKHhpICsgMSwgeWksIHppLCBzZWVkKTtcbiAgY29uc3QgYzAxMCA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSwgc2VlZCksIGMxMTAgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppLCBzZWVkKTtcbiAgY29uc3QgYzAwMSA9IGhhc2gzaSh4aSwgeWksIHppICsgMSwgc2VlZCksIGMxMDEgPSBoYXNoM2koeGkgKyAxLCB5aSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgYzAxMSA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpLCBjMTExID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCB4MDAgPSBjMDAwICsgKGMxMDAgLSBjMDAwKSAqIHhmO1xuICBjb25zdCB4MTAgPSBjMDEwICsgKGMxMTAgLSBjMDEwKSAqIHhmO1xuICBjb25zdCB4MDEgPSBjMDAxICsgKGMxMDEgLSBjMDAxKSAqIHhmO1xuICBjb25zdCB4MTEgPSBjMDExICsgKGMxMTEgLSBjMDExKSAqIHhmO1xuICBjb25zdCB5MCA9IHgwMCArICh4MTAgLSB4MDApICogeWY7XG4gIGNvbnN0IHkxID0geDAxICsgKHgxMSAtIHgwMSkgKiB5ZjtcbiAgcmV0dXJuIHkwICsgKHkxIC0geTApICogemY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0zKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTMoeCAqIGZyZXEsIHkgKiBmcmVxLCB6ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuIiwgIi8vIEh5ZHJvbG9neSBcdTIwMTQgdGhlIGRldGVybWluaXN0aWMgd2F0ZXIgbmV0d29yayBvZiBhIHdvcmxkIChwdXJlIFR5cGVTY3JpcHQsIEQtMDA1KS5cbi8vXG4vLyBUaGlzIGlzIGRlcml2ZWQgKnNpbXVsYXRpb24gZGF0YSosIG5vdCBwcmVzZW50YXRpb246IGl0IGlzIGEgcHVyZSBmdW5jdGlvbiBvZlxuLy8gKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKSBhbmQgaXMgd2hhdCB0ZXJyYWluIGNhcnZpbmcsIHdhdGVyIGZpbGxpbmcsIGZsb3dcbi8vIGRpcmVjdGlvbiBhbmQgZnV0dXJlIGZpc2hpbmcvaXJyaWdhdGlvbi9mbG9vZGluZyBydWxlcyByZWFkLiBJdCBpcyBuZXZlclxuLy8gam91cm5hbGVkIGJlY2F1c2UgaXQgY2FuIGFsd2F5cyBiZSByZWdlbmVyYXRlZCBleGFjdGx5LlxuLy9cbi8vIE5ldHdvcmsgKGJvdGggZ2VuZXJhdG9yIHZlcnNpb25zKTpcbi8vICAgbGFrZSAgXHUyMDE0IHRoZSB2YWxsZXkgbGFrZSBiYXNpbiwgbG9jYXRlZCBmcm9tIHRoZSBhY3R1YWwgZ2VuZXJhdGVkIHRlcnJhaW4uXG4vLyAgIGxvd2VyIFx1MjAxNCB0aGUgbG93bGFuZCByaXZlciBmcm9tIHRoZSBsYWtlIHRvIHRoZSBzb3V0aGVybiBzZWEsIHRyYWNlZCBmcm9tXG4vLyAgICAgICAgICAgdGhlIGFjdHVhbCBjYXJ2ZWQgY2hhbm5lbCAodGhlIHYxIGNoYW5uZWwgaXMgY2FydmVkIG9uICp3YXJwZWQqXG4vLyAgICAgICAgICAgY29vcmRpbmF0ZXMsIHNvIGByaXZlckNlbnRlclhgIGFsb25lIGlzIHVwIHRvIH4xMzUgbSBvZmYpLlxuLy8gR2VuZXJhdG9yIHYyIGFkZHM6XG4vLyAgIHVwcGVyIFx1MjAxNCBhIG1vdW50YWluIHJpdmVyIGZyb20gYSBoaWdobGFuZCB0YXJuIGRvd24gdG8gdGhlIGxha2UsIHdpdGggYVxuLy8gICAgICAgICAgIHdhdGVyLXN1cmZhY2UgbGV2ZWwgdGhhdCBuZXZlciByaXNlcyBkb3duc3RyZWFtLCBjYXNjYWRlcyBhbmQgZmFsbHMuXG4vL1xuLy8gRmxvdyBhbHdheXMgcG9pbnRzIGRvd25zdHJlYW06IHVwcGVyIFx1MjE5MiBsYWtlIFx1MjE5MiBsb3dlciBcdTIxOTIgc2VhLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIG11bGJlcnJ5MzIsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcblxuZXhwb3J0IHR5cGUgSGVpZ2h0U2FtcGxlciA9ICh4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJpdmVyUG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQgb2YgdGhpcyByZWFjaCAobWV0cmVzKS4gKi9cbiAgczogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBlbGV2YXRpb24gKG1ldHJlcywgbWF5IGJlIGZyYWN0aW9uYWwpLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogQ2hhbm5lbCBoYWxmLXdpZHRoIChtZXRyZXMpLiAqL1xuICB3aWR0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWNoSGl0IHtcbiAgLyoqIEhvcml6b250YWwgZGlzdGFuY2UgZnJvbSB0aGUgY2VudHJlbGluZS4gKi9cbiAgZDogbnVtYmVyO1xuICAvKiogSW50ZXJwb2xhdGVkIHdhdGVyIGxldmVsIGF0IHRoZSBuZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIHdpZHRoOiBudW1iZXI7XG4gIC8qKiBVbml0IGRvd25zdHJlYW0gZGlyZWN0aW9uLiAqL1xuICB0eDogbnVtYmVyO1xuICB0ejogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBkcm9wIHBlciBtZXRyZSBhbG9uZyB0aGUgY2hhbm5lbCAoPj0gMCkuICovXG4gIGdyYWRpZW50OiBudW1iZXI7XG4gIC8qKiBBcmMgbGVuZ3RoIG9mIHRoZSBuZWFyZXN0IHBvaW50IGZyb20gdGhlIGRvd25zdHJlYW0gZW5kLiAqL1xuICBzOiBudW1iZXI7XG59XG5cbi8qKlxuICogQSBwb2x5bGluZSByZWFjaCBzdG9yZWQgZG93bnN0cmVhbS1maXJzdC4gTmVhcmVzdC1zZWdtZW50IHF1ZXJpZXMgdXNlIGFcbiAqIHVuaWZvcm0gZ3JpZCB3aG9zZSBjZWxscyBsaXN0IGV2ZXJ5IHNlZ21lbnQgd2l0aGluIGByZWFjaGAgbWV0cmVzLlxuICovXG5leHBvcnQgY2xhc3MgUml2ZXJSZWFjaCB7XG4gIHJlYWRvbmx5IHBvaW50czogUml2ZXJQb2ludFtdO1xuICBwcml2YXRlIHJlYWRvbmx5IGNlbGwgPSAzMjtcbiAgcHJpdmF0ZSByZWFkb25seSBncmlkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXG4gIGNvbnN0cnVjdG9yKHBvaW50czogUml2ZXJQb2ludFtdLCByZWFkb25seSByZWFjaDogbnVtYmVyKSB7XG4gICAgdGhpcy5wb2ludHMgPSBwb2ludHM7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgKyAxIDwgcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBhID0gcG9pbnRzW2ldLCBiID0gcG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IHgwID0gTWF0aC5taW4oYS54LCBiLngpIC0gcmVhY2gsIHgxID0gTWF0aC5tYXgoYS54LCBiLngpICsgcmVhY2g7XG4gICAgICBjb25zdCB6MCA9IE1hdGgubWluKGEueiwgYi56KSAtIHJlYWNoLCB6MSA9IE1hdGgubWF4KGEueiwgYi56KSArIHJlYWNoO1xuICAgICAgZm9yIChsZXQgY3ogPSBNYXRoLmZsb29yKHowIC8gdGhpcy5jZWxsKTsgY3ogPD0gTWF0aC5mbG9vcih6MSAvIHRoaXMuY2VsbCk7IGN6KyspIHtcbiAgICAgICAgZm9yIChsZXQgY3ggPSBNYXRoLmZsb29yKHgwIC8gdGhpcy5jZWxsKTsgY3ggPD0gTWF0aC5mbG9vcih4MSAvIHRoaXMuY2VsbCk7IGN4KyspIHtcbiAgICAgICAgICBjb25zdCBrZXkgPSBjZWxsS2V5KGN4LCBjeik7XG4gICAgICAgICAgbGV0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGtleSk7XG4gICAgICAgICAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgdGhpcy5ncmlkLnNldChrZXksIGxpc3QpOyB9XG4gICAgICAgICAgbGlzdC5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGxlbmd0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wb2ludHNbdGhpcy5wb2ludHMubGVuZ3RoIC0gMV0/LnMgPz8gMDsgfVxuXG4gIC8qKiBOZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQgd2l0aGluIGByZWFjaGAsIG9yIG51bGwuICovXG4gIG5lYXJlc3QoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBSZWFjaEhpdCB8IG51bGwge1xuICAgIGNvbnN0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGNlbGxLZXkoTWF0aC5mbG9vcih4IC8gdGhpcy5jZWxsKSwgTWF0aC5mbG9vcih6IC8gdGhpcy5jZWxsKSkpO1xuICAgIGlmICghbGlzdCkgcmV0dXJuIG51bGw7XG4gICAgbGV0IGJlc3QgPSBJbmZpbml0eSwgYmkgPSAtMSwgYnQgPSAwO1xuICAgIGZvciAoY29uc3QgaSBvZiBsaXN0KSB7XG4gICAgICBjb25zdCBhID0gdGhpcy5wb2ludHNbaV0sIGIgPSB0aGlzLnBvaW50c1tpICsgMV07XG4gICAgICBjb25zdCBkeCA9IGIueCAtIGEueCwgZHogPSBiLnogLSBhLno7XG4gICAgICBjb25zdCBsZW4yID0gZHggKiBkeCArIGR6ICogZHogfHwgMTtcbiAgICAgIGNvbnN0IHQgPSBjbGFtcCgoKHggLSBhLngpICogZHggKyAoeiAtIGEueikgKiBkeikgLyBsZW4yLCAwLCAxKTtcbiAgICAgIGNvbnN0IHB4ID0gYS54ICsgZHggKiB0LCBweiA9IGEueiArIGR6ICogdDtcbiAgICAgIGNvbnN0IGQyID0gKHggLSBweCkgKiogMiArICh6IC0gcHopICoqIDI7XG4gICAgICBpZiAoZDIgPCBiZXN0KSB7IGJlc3QgPSBkMjsgYmkgPSBpOyBidCA9IHQ7IH1cbiAgICB9XG4gICAgaWYgKGJpIDwgMCB8fCBiZXN0ID4gdGhpcy5yZWFjaCAqIHRoaXMucmVhY2gpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tiaV0sIGIgPSB0aGlzLnBvaW50c1tiaSArIDFdO1xuICAgIGNvbnN0IHNlZ0xlbiA9IE1hdGgubWF4KDFlLTYsIGIucyAtIGEucyk7XG4gICAgLy8gUG9pbnRzIGFyZSBzdG9yZWQgZG93bnN0cmVhbS1maXJzdCwgc28gZG93bnN0cmVhbSBpcyBhIDwtIGIuXG4gICAgY29uc3QgdHggPSAoYS54IC0gYi54KSAvIHNlZ0xlbiwgdHogPSAoYS56IC0gYi56KSAvIHNlZ0xlbjtcbiAgICByZXR1cm4ge1xuICAgICAgZDogTWF0aC5zcXJ0KGJlc3QpLFxuICAgICAgbGV2ZWw6IGEubGV2ZWwgKyAoYi5sZXZlbCAtIGEubGV2ZWwpICogYnQsXG4gICAgICB3aWR0aDogYS53aWR0aCArIChiLndpZHRoIC0gYS53aWR0aCkgKiBidCxcbiAgICAgIHR4LCB0eixcbiAgICAgIGdyYWRpZW50OiBNYXRoLm1heCgwLCAoYi5sZXZlbCAtIGEubGV2ZWwpIC8gc2VnTGVuKSxcbiAgICAgIHM6IGEucyArIChiLnMgLSBhLnMpICogYnQsXG4gICAgfTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjZWxsS2V5KGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKGN4ICsgNDA5NikgKiA4MTkyICsgKGN6ICsgNDA5Nik7XG59XG5cbmV4cG9ydCB0eXBlIFdhdGVyQm9keSA9ICdyaXZlcicgfCAnbGFrZScgfCAnc2VhJyB8ICdub25lJztcblxuZXhwb3J0IGludGVyZmFjZSBGbG93U2FtcGxlIHtcbiAgYm9keTogV2F0ZXJCb2R5O1xuICAvKiogVW5pdCBmbG93IGRpcmVjdGlvbiAoemVybyBmb3Igc3RpbGwgd2F0ZXIpLiAqL1xuICBkeDogbnVtYmVyO1xuICBkejogbnVtYmVyO1xuICAvKiogU3VyZmFjZSBjdXJyZW50IHNwZWVkIGluIG0vcy4gKi9cbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIeWRyb2xvZ3lPcHRpb25zIHtcbiAgc2VlZDogbnVtYmVyO1xuICAvKiogR2VuZXJhdG9yIHZlcnNpb24gdGhlIG5ldHdvcmsgYmVsb25ncyB0by4gKi9cbiAgdmVyc2lvbjogbnVtYmVyO1xuICAvKiogQmFzZSBoZWlnaHQgb2YgdGhlICp1bm1vZGlmaWVkIHYxIHNoYXBlKiAodXNlZCB0byBsb2NhdGUgbGFrZS9jaGFubmVsKS4gKi9cbiAgdjFIZWlnaHQ6IEhlaWdodFNhbXBsZXI7XG59XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9naWNhbCBuZXR3b3JrIGZvciBvbmUgKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKS4gKi9cbmV4cG9ydCBjbGFzcyBIeWRyb2xvZ3kge1xuICByZWFkb25seSBzZWVkOiBudW1iZXI7XG4gIHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcbiAgcmVhZG9ubHkgbGFrZTogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcng6IG51bWJlcjsgcno6IG51bWJlciB9O1xuICByZWFkb25seSBsb3dlcjogUml2ZXJSZWFjaDtcbiAgcmVhZG9ubHkgdXBwZXI6IFJpdmVyUmVhY2ggfCBudWxsO1xuICAvKiogVXBwZXItcml2ZXIgc291cmNlIHRhcm4gKHYyIG9ubHkpLiAqL1xuICByZWFkb25seSB0YXJuOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByOiBudW1iZXI7IGxldmVsOiBudW1iZXIgfSB8IG51bGw7XG5cbiAgY29uc3RydWN0b3Iob3B0czogSHlkcm9sb2d5T3B0aW9ucykge1xuICAgIHRoaXMuc2VlZCA9IG9wdHMuc2VlZDtcbiAgICB0aGlzLnZlcnNpb24gPSBvcHRzLnZlcnNpb247XG4gICAgdGhpcy5sYWtlID0gbG9jYXRlTGFrZShvcHRzLnYxSGVpZ2h0KTtcbiAgICB0aGlzLmxvd2VyID0gdHJhY2VMb3dlclJpdmVyKG9wdHMudjFIZWlnaHQsIHRoaXMubGFrZSk7XG4gICAgaWYgKG9wdHMudmVyc2lvbiA+PSAyKSB7XG4gICAgICBjb25zdCB1cHBlciA9IGF1dGhvclVwcGVyUml2ZXIob3B0cy5zZWVkLCB0aGlzLmxha2UpO1xuICAgICAgdGhpcy51cHBlciA9IHVwcGVyLnJlYWNoO1xuICAgICAgdGhpcy50YXJuID0gdXBwZXIudGFybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51cHBlciA9IG51bGw7XG4gICAgICB0aGlzLnRhcm4gPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdXJmYWNlIGN1cnJlbnQgZm9yIGEgd2F0ZXIgY29sdW1uLiBgbGV2ZWxgIGlzIHRoZSBjb2x1bW4ncyB3YXRlciBzdXJmYWNlLFxuICAgKiB1c2VkIHRvIHRlbGwgc2VhLWxldmVsIHdhdGVyIChsYWtlLCBsb3dlciByaXZlciwgc2VhKSBmcm9tIHRoZSB1cHBlciByaXZlci5cbiAgICovXG4gIGZsb3dBdCh4OiBudW1iZXIsIHo6IG51bWJlciwgbGV2ZWw6IG51bWJlcik6IEZsb3dTYW1wbGUge1xuICAgIGlmICh0aGlzLnVwcGVyICYmIGxldmVsID4gMC41KSB7XG4gICAgICBjb25zdCBoaXQgPSB0aGlzLnVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDw9IGhpdC53aWR0aCArIDIpIHtcbiAgICAgICAgY29uc3Qgc3BlZWQgPSBjbGFtcCgwLjU1ICsgaGl0LmdyYWRpZW50ICogOSwgMC40LCA0LjUpO1xuICAgICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogaGl0LnR4LCBkejogaGl0LnR6LCBzcGVlZCB9O1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMudGFybiAmJiBNYXRoLmh5cG90KHggLSB0aGlzLnRhcm4ueCwgeiAtIHRoaXMudGFybi56KSA8IHRoaXMudGFybi5yICsgNCkge1xuICAgICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLnRvd2FyZHMoeCwgeiwgdGhpcy51cHBlclNvdXJjZSgpLCAwLjA2KSB9O1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBsb3cgPSB0aGlzLmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8PSBsb3cud2lkdGggKyA2KSB7XG4gICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogbG93LnR4LCBkejogbG93LnR6LCBzcGVlZDogMC4zNSArIDAuMjUgKiBzbW9vdGhzdGVwKGxvdy53aWR0aCArIDYsIDAsIGxvdy5kKSB9O1xuICAgIH1cbiAgICBjb25zdCBsZCA9IE1hdGguaHlwb3QoKHggLSB0aGlzLmxha2UueCkgLyB0aGlzLmxha2UucngsICh6IC0gdGhpcy5sYWtlLnopIC8gdGhpcy5sYWtlLnJ6KTtcbiAgICBpZiAobGQgPCAxLjM1KSB7XG4gICAgICAvLyBTbG93IGRyaWZ0IGZyb20gdGhlIGluZmxvdyB0b3dhcmQgdGhlIG91dGZsb3cgYXQgdGhlIGhlYWQgb2YgdGhlIGxvd2VyIHJpdmVyLlxuICAgICAgY29uc3QgaGVhZCA9IHRoaXMubG93ZXIucG9pbnRzW3RoaXMubG93ZXIucG9pbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZHJpZnQgPSB0b3dhcmRzKHgsIHosIGhlYWQsIDAuMDgpO1xuICAgICAgcmV0dXJuIHsgYm9keTogJ2xha2UnLCAuLi5kcmlmdCB9O1xuICAgIH1cbiAgICByZXR1cm4geyBib2R5OiAnc2VhJywgZHg6IDAsIGR6OiAwLCBzcGVlZDogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSB1cHBlclNvdXJjZSgpOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0ge1xuICAgIGNvbnN0IHB0cyA9IHRoaXMudXBwZXIhLnBvaW50cztcbiAgICByZXR1cm4gcHRzW3B0cy5sZW5ndGggLSAxXTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b3dhcmRzKHg6IG51bWJlciwgejogbnVtYmVyLCBwOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0sIHNwZWVkOiBudW1iZXIpIHtcbiAgY29uc3QgZHggPSBwLnggLSB4LCBkeiA9IHAueiAtIHo7XG4gIGNvbnN0IGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KSB8fCAxO1xuICByZXR1cm4geyBkeDogZHggLyBsZW4sIGR6OiBkeiAvIGxlbiwgc3BlZWQgfTtcbn1cblxuLyoqIEZpbmQgdGhlIHZhbGxleSBsYWtlIGZyb20gdGhlIHRlcnJhaW4gaXRzZWxmOiB0aGUgZGVlcCBiYXNpbiBOVyBvZiB0aGUgZm91bmRlciB2YWxsZXkuICovXG5mdW5jdGlvbiBsb2NhdGVMYWtlKGg6IEhlaWdodFNhbXBsZXIpOiBIeWRyb2xvZ3lbJ2xha2UnXSB7XG4gIGxldCBzeCA9IDAsIHN6ID0gMCwgbiA9IDAsIG1pblggPSBJbmZpbml0eSwgbWF4WCA9IC1JbmZpbml0eSwgbWluWiA9IEluZmluaXR5LCBtYXhaID0gLUluZmluaXR5O1xuICBmb3IgKGxldCB6ID0gLTQ2MDsgeiA8PSAtMTIwOyB6ICs9IDQpIHtcbiAgICBmb3IgKGxldCB4ID0gLTQ4MDsgeCA8PSAtNDA7IHggKz0gNCkge1xuICAgICAgaWYgKGgoeCwgeikgPiAtNCkgY29udGludWU7XG4gICAgICBzeCArPSB4OyBzeiArPSB6OyBuKys7XG4gICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgeCk7IG1heFggPSBNYXRoLm1heChtYXhYLCB4KTtcbiAgICAgIG1pblogPSBNYXRoLm1pbihtaW5aLCB6KTsgbWF4WiA9IE1hdGgubWF4KG1heFosIHopO1xuICAgIH1cbiAgfVxuICBpZiAobiA9PT0gMCkgcmV0dXJuIHsgeDogLTI2MCwgejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH07XG4gIHJldHVybiB7XG4gICAgeDogc3ggLyBuLCB6OiBzeiAvIG4sXG4gICAgcng6IE1hdGgubWF4KDMwLCAobWF4WCAtIG1pblgpIC8gMiArIDEwKSwgcno6IE1hdGgubWF4KDMwLCAobWF4WiAtIG1pblopIC8gMiArIDEwKSxcbiAgfTtcbn1cblxuLyoqXG4gKiBUcmFjZSB0aGUgY2FydmVkIGxvd2xhbmQgY2hhbm5lbCBmcm9tIHRoZSBsYWtlIG91dGZsb3cgc291dGggdG8gdGhlIHNlYS4gRm9yXG4gKiBlYWNoIDQgbSByb3cgdGhlIGNoYW5uZWwgaXMgdGhlIGxvd2VzdCBjb2x1bW4gbmVhciB0aGUgcHJldmlvdXMgY2VudHJlOyB0aGVcbiAqIHRyYWNlIGlzIHNtb290aGVkIHNvIHRoZSBmbG93IGZpZWxkIGRvZXMgbm90IGppdHRlciB3aXRoIHRoZSAxIG0gdm94ZWxzLlxuICovXG5mdW5jdGlvbiB0cmFjZUxvd2VyUml2ZXIoaDogSGVpZ2h0U2FtcGxlciwgbGFrZTogSHlkcm9sb2d5WydsYWtlJ10pOiBSaXZlclJlYWNoIHtcbiAgY29uc3QgcmF3OiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGxldCBjeCA9IGxha2UueCArIGxha2UucnggKiAwLjU1O1xuICBsZXQgeiA9IE1hdGgucm91bmQobGFrZS56ICsgbGFrZS5yeiAqIDAuNik7XG4gIC8vIFN0YXJ0IGF0IHRoZSBsYWtlJ3Mgc291dGgtZWFzdCBvdXRmbG93IGFuZCBmb2xsb3cgdGhlIGNoYW5uZWwgZG93bnN0cmVhbS5cbiAgZm9yICg7IHogPD0gOTAwOyB6ICs9IDQpIHtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBieCA9IGN4O1xuICAgIGZvciAobGV0IHggPSBNYXRoLnJvdW5kKGN4IC0gNDApOyB4IDw9IGN4ICsgNDA7IHggKz0gMikge1xuICAgICAgY29uc3QgdiA9IGgoeCwgeikgKyBNYXRoLmFicyh4IC0gY3gpICogMC4wMjtcbiAgICAgIGlmICh2IDwgYmVzdCkgeyBiZXN0ID0gdjsgYnggPSB4OyB9XG4gICAgfVxuICAgIGN4ID0gYng7XG4gICAgcmF3LnB1c2goeyB4OiBieCwgeiB9KTtcbiAgICAvLyBUaGUgdHJhY2UgZW5kcyBvbmNlIGl0IHJlYWNoZXMgb3BlbiBzZWEgZm9yIGEgc3VzdGFpbmVkIHN0cmV0Y2guXG4gICAgaWYgKGJlc3QgPCAtNiAmJiByYXcubGVuZ3RoID4gMjAgJiYgaChieCwgeiArIDgpIDwgLTYgJiYgaChieCwgeiArIDE2KSA8IC02KSBicmVhaztcbiAgfVxuICBjb25zdCBzbW9vdGggPSByYXcubWFwKChwLCBpKSA9PiB7XG4gICAgbGV0IHN4ID0gMCwgbiA9IDA7XG4gICAgZm9yIChsZXQgayA9IE1hdGgubWF4KDAsIGkgLSA0KTsgayA8PSBNYXRoLm1pbihyYXcubGVuZ3RoIC0gMSwgaSArIDQpOyBrKyspIHsgc3ggKz0gcmF3W2tdLng7IG4rKzsgfVxuICAgIHJldHVybiB7IHg6IHN4IC8gbiwgejogcC56IH07XG4gIH0pO1xuICAvLyBTdG9yZSBkb3duc3RyZWFtLWZpcnN0OiBpbmRleCAwIGlzIHRoZSBzZWEgbW91dGguXG4gIHNtb290aC5yZXZlcnNlKCk7XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gW107XG4gIGxldCBzID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzbW9vdGgubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaSA+IDApIHMgKz0gTWF0aC5oeXBvdChzbW9vdGhbaV0ueCAtIHNtb290aFtpIC0gMV0ueCwgc21vb3RoW2ldLnogLSBzbW9vdGhbaSAtIDFdLnopO1xuICAgIHBvaW50cy5wdXNoKHsgeDogc21vb3RoW2ldLngsIHo6IHNtb290aFtpXS56LCBzLCBsZXZlbDogMCwgd2lkdGg6IDYgfSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBSaXZlclJlYWNoKHBvaW50cywgNDApO1xufVxuXG4vKiogV2F0ZXItc3VyZmFjZSBkcm9wcyBhbG9uZyB0aGUgdXBwZXIgcml2ZXIsIGFzIChmcmFjdGlvbiBvZiBsZW5ndGgsIG1ldHJlcykuICovXG5jb25zdCBGQUxMUzogUmVhZG9ubHlBcnJheTxyZWFkb25seSBbbnVtYmVyLCBudW1iZXJdPiA9IFtbMC4yLCA3XSwgWzAuNDgsIDExXSwgWzAuNzQsIDEzXV07XG5jb25zdCBVUFBFUl9HUkFESUVOVCA9IDAuMDM7XG5cbi8qKlxuICogQXV0aG9yIHRoZSB2MiBtb3VudGFpbiByaXZlcjogYSBzZWVkZWQgbWVhbmRlcmluZyBjZW50cmVsaW5lIGZyb20gdGhlIGxha2Unc1xuICogbm9ydGggc2hvcmUgdG8gYSBoaWdobGFuZCB0YXJuLCB3aXRoIGEgbGV2ZWwgcHJvZmlsZSB0aGF0IG9ubHkgcmlzZXNcbiAqIHVwc3RyZWFtIChnZW50bGUgZ3JhZGllbnQgcGx1cyB0aHJlZSBjYXNjYWRlcykuXG4gKi9cbmZ1bmN0aW9uIGF1dGhvclVwcGVyUml2ZXIoc2VlZDogbnVtYmVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IHtcbiAgcmVhY2g6IFJpdmVyUmVhY2g7IHRhcm46IE5vbk51bGxhYmxlPEh5ZHJvbG9neVsndGFybiddPjtcbn0ge1xuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChzZWVkIF4gMHg1ZWVkMikgPj4+IDApO1xuICBjb25zdCBqID0gKGE6IG51bWJlcikgPT4gKHJuZCgpIC0gMC41KSAqIDIgKiBhO1xuICBjb25zdCBtb3V0aCA9IHsgeDogbGFrZS54ICsgbGFrZS5yeCAqIDAuMSwgejogbGFrZS56IC0gbGFrZS5yeiAqIDAuNTUgfTtcbiAgY29uc3QgY29udHJvbHMgPSBbXG4gICAgbW91dGgsXG4gICAgeyB4OiBsYWtlLnggKyAyMCArIGooMjApLCB6OiAtNDEwICsgaigxNSkgfSxcbiAgICB7IHg6IC0xOTAgKyBqKDM1KSwgejogLTUyMCArIGooMjApIH0sXG4gICAgeyB4OiAtMjE1ICsgaigzNSksIHo6IC02NDAgKyBqKDIwKSB9LFxuICAgIHsgeDogLTE2NSArIGooMzApLCB6OiAtNzcwICsgaigxNSkgfSxcbiAgXTtcbiAgLy8gQ2F0bXVsbC1Sb20gdGhyb3VnaCB0aGUgY29udHJvbHMsIHRoZW4gcmVzYW1wbGUgYXQgfjggbSBzcGFjaW5nIHdpdGggYVxuICAvLyBzbWFsbCBzZWVkZWQgbWVhbmRlciBzbyB0aGUgY2hhbm5lbCBpcyBub3QgYSBzbW9vdGggc3BsaW5lLlxuICBjb25zdCBkZW5zZTogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbnRyb2xzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGNvbnN0IHAwID0gY29udHJvbHNbTWF0aC5tYXgoMCwgaSAtIDEpXSwgcDEgPSBjb250cm9sc1tpXTtcbiAgICBjb25zdCBwMiA9IGNvbnRyb2xzW2kgKyAxXSwgcDMgPSBjb250cm9sc1tNYXRoLm1pbihjb250cm9scy5sZW5ndGggLSAxLCBpICsgMildO1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgMjQ7IGsrKykge1xuICAgICAgY29uc3QgdCA9IGsgLyAyNCwgdDIgPSB0ICogdCwgdDMgPSB0MiAqIHQ7XG4gICAgICBkZW5zZS5wdXNoKHtcbiAgICAgICAgeDogMC41ICogKDIgKiBwMS54ICsgKC1wMC54ICsgcDIueCkgKiB0ICsgKDIgKiBwMC54IC0gNSAqIHAxLnggKyA0ICogcDIueCAtIHAzLngpICogdDJcbiAgICAgICAgICArICgtcDAueCArIDMgKiBwMS54IC0gMyAqIHAyLnggKyBwMy54KSAqIHQzKSxcbiAgICAgICAgejogMC41ICogKDIgKiBwMS56ICsgKC1wMC56ICsgcDIueikgKiB0ICsgKDIgKiBwMC56IC0gNSAqIHAxLnogKyA0ICogcDIueiAtIHAzLnopICogdDJcbiAgICAgICAgICArICgtcDAueiArIDMgKiBwMS56IC0gMyAqIHAyLnogKyBwMy56KSAqIHQzKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBkZW5zZS5wdXNoKGNvbnRyb2xzW2NvbnRyb2xzLmxlbmd0aCAtIDFdKTtcbiAgY29uc3QgcmVzYW1wbGVkOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyOyBzOiBudW1iZXIgfT4gPSBbeyAuLi5kZW5zZVswXSwgczogMCB9XTtcbiAgbGV0IGFjYyA9IDAsIHMgPSAwO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGRlbnNlLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgc3RlcCA9IE1hdGguaHlwb3QoZGVuc2VbaV0ueCAtIGRlbnNlW2kgLSAxXS54LCBkZW5zZVtpXS56IC0gZGVuc2VbaSAtIDFdLnopO1xuICAgIGFjYyArPSBzdGVwOyBzICs9IHN0ZXA7XG4gICAgaWYgKGFjYyA+PSA4IHx8IGkgPT09IGRlbnNlLmxlbmd0aCAtIDEpIHtcbiAgICAgIGNvbnN0IG0gPSAoZmJtMihzIC8gNjAsIDMuMSwgc2VlZCArIDgwMSwgMikgLSAwLjUpICogMTQ7XG4gICAgICByZXNhbXBsZWQucHVzaCh7IHg6IGRlbnNlW2ldLnggKyBtLCB6OiBkZW5zZVtpXS56LCBzIH0pO1xuICAgICAgYWNjID0gMDtcbiAgICB9XG4gIH1cbiAgY29uc3QgdG90YWwgPSByZXNhbXBsZWRbcmVzYW1wbGVkLmxlbmd0aCAtIDFdLnM7XG4gIGNvbnN0IGxldmVsQXQgPSAoc3Y6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgbGV0IGxldmVsID0gc3YgKiBVUFBFUl9HUkFESUVOVDtcbiAgICBmb3IgKGNvbnN0IFtmcmFjLCBkcm9wXSBvZiBGQUxMUykge1xuICAgICAgLy8gRWFjaCBmYWxsIGlzIGEgc2hvcnQgY2FzY2FkZSBvdmVyIH4xMCBtIG9mIGNoYW5uZWwuXG4gICAgICBsZXZlbCArPSBkcm9wICogc21vb3Roc3RlcCh0b3RhbCAqIGZyYWMgLSA1LCB0b3RhbCAqIGZyYWMgKyA1LCBzdik7XG4gICAgfVxuICAgIC8vIFRoZSBmaXJzdCA0MCBtIGludG8gdGhlIGxha2Ugc3RheXMgYXQgbGFrZSBsZXZlbC5cbiAgICByZXR1cm4gc3YgPCA0MCA/IDAgOiBsZXZlbCAtIDQwICogVVBQRVJfR1JBRElFTlQ7XG4gIH07XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gcmVzYW1wbGVkLm1hcCgocCkgPT4gKHtcbiAgICB4OiBwLngsIHo6IHAueiwgczogcC5zLCBsZXZlbDogTWF0aC5tYXgoMCwgbGV2ZWxBdChwLnMpKSxcbiAgICB3aWR0aDogMy4yICsgMi4yICogZmJtMihwLnMgLyA3MCwgOS43LCBzZWVkICsgODAyLCAyKSArICgxIC0gcC5zIC8gdG90YWwpICogMS41LFxuICB9KSk7XG4gIGNvbnN0IHNvdXJjZSA9IHBvaW50c1twb2ludHMubGVuZ3RoIC0gMV07XG4gIHJldHVybiB7XG4gICAgcmVhY2g6IG5ldyBSaXZlclJlYWNoKHBvaW50cywgMTEwKSxcbiAgICB0YXJuOiB7IHg6IHNvdXJjZS54LCB6OiBzb3VyY2UueiwgcjogMTgsIGxldmVsOiBzb3VyY2UubGV2ZWwgfSxcbiAgfTtcbn1cbiIsICIvLyBWb3hlbCBtYXRlcmlhbCBpZHMuIFB1cmUgZGF0YSBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIgKEQtMDA1KS5cbi8vIElkcyBhcmUgcGVyc2lzdGVkIGluIHNuYXBzaG90IGVkaXRzLCBzbyBleGlzdGluZyB2YWx1ZXMgbXVzdCBuZXZlciBjaGFuZ2UuXG5leHBvcnQgY29uc3QgTUFUID0ge1xuICBBSVI6IDAsXG4gIEdSQVNTOiAxLFxuICBTT0lMOiAyLFxuICBTQU5EOiAzLFxuICBHUkFWRUw6IDQsXG4gIFNUT05FOiA1LFxuICBPUkU6IDYsXG4gIFdBVEVSOiA3LFxuICBCRURST0NLOiA4LFxuICBNT1NTOiA5LFxuICAvKiogR2VuZXJhdG9yIHYyIGhpZ2hsYW5kcy4gTmV2ZXIgcHJvZHVjZWQgYnkgZ2VuZXJhdG9yIHYxLiAqL1xuICBTTk9XOiAxMCxcbn0gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBNYXRJZCA9ICh0eXBlb2YgTUFUKVtrZXlvZiB0eXBlb2YgTUFUXTtcblxuZXhwb3J0IGNvbnN0IGlzU29saWQgPSAobTogbnVtYmVyKTogYm9vbGVhbiA9PiBtICE9PSBNQVQuQUlSICYmIG0gIT09IE1BVC5XQVRFUjtcbmV4cG9ydCBjb25zdCBpc09wYXF1ZSA9IGlzU29saWQ7XG5cbi8qKiBIaWdoZXN0IG1hdGVyaWFsIGlkIHRoYXQgbWF5IGFwcGVhciBpbiBhIHZveGVsIGVkaXQuICovXG5leHBvcnQgY29uc3QgTUFYX01BVF9JRCA9IDEwO1xuIiwgIi8vIFRlcnJhaW4gZ2VuZXJhdG9yIHYyIFx1MjAxNCB0aGUgdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSAocHVyZSBUUywgRC0wMDUpLlxuLy9cbi8vIENvbXBhdGliaWxpdHkgY29udHJhY3Q6IGluc2lkZSB0aGUgZm91bmRlciBjb3JyaWRvciAodGhlIHNldHRsZW1lbnQgdmFsbGV5LFxuLy8gdGhlIGxha2UgYW5kIHRoZSBsb3dsYW5kIHJpdmVyKSB2MiBoZWlnaHRzIGVxdWFsIHYxIGV4YWN0bHksIHNvIHRoZSBwaW5uZWRcbi8vIGZvdW5kZXIgcHJvamVjdHMsIHRoZWlyIHByZXBhcmF0aW9uIHRhcmdldHMgYW5kIG5hdHVyYWwgZW50aXRpZXMgdGhlcmUgYXJlXG4vLyB1bmNoYW5nZWQuIE91dHNpZGUgaXQgdjIgYWRkczpcbi8vICAgLSBhIG5vcnRoZXJuIG1hc3NpZiBvbiBhbiBleHRlbmRlZCBpc2xhbmQsIHdpdGggc25vdyBhYm92ZSB0aGUgc25vd2xpbmU7XG4vLyAgIC0gZmxhbmtpbmcgcmFuZ2VzIHdlc3QgYW5kIGVhc3Qgb2YgdGhlIHZhbGxleSwgdGVycmFjZWQgaW50byBjbGlmZiBiYW5kcztcbi8vICAgLSBhIG1vdW50YWluIHJpdmVyIGNhcnZlZCBpbnRvIHRoZSBtYXNzaWYgZnJvbSBhIHRhcm4gZG93biB0byB0aGUgbGFrZSxcbi8vICAgICB3aG9zZSB3YXRlciBzdXJmYWNlIGNvbWVzIGZyb20gSHlkcm9sb2d5IGFuZCBuZXZlciByaXNlcyBkb3duc3RyZWFtO1xuLy8gICAtIGEgY29udGludW91cyBsb3dsYW5kIGNoYW5uZWwgKHYxIGhhcyBhIGRyeSBmb3JkIHNvdXRoIG9mIHRoZSBzaGVsZikuXG4vLyBIZWlnaHRzIGFyZSBpbnRlZ2VycyBpbiBbLTE0LCAxMDRdLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIGxlcnAsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7IE1BVCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5cbmV4cG9ydCBjb25zdCBWMl9TTk9XTElORSA9IDc0O1xuZXhwb3J0IGNvbnN0IFYyX01BWF9IRUlHSFQgPSAxMDQ7XG5cbmV4cG9ydCB0eXBlIFYxSGVpZ2h0ID0gKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IG51bWJlcjtcblxuZXhwb3J0IGludGVyZmFjZSBWMkNvbHVtbiB7XG4gIC8qKiBUb3Agc29saWQgeSArIDEgKHNhbWUgY29udmVudGlvbiBhcyBzdXJmYWNlSGVpZ2h0QXQpLiAqL1xuICBoOiBudW1iZXI7XG4gIC8qKiBXYXRlciBzdXJmYWNlIGZvciB0aGlzIGNvbHVtbjogY2VsbHMgW2gsIGxldmVsKSBob2xkIHdhdGVyLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogVHJ1ZSB3aGVuIHRoaXMgY29sdW1uIGlzIHBhcnQgb2YgdGhlIGNhcnZlZCBtb3VudGFpbi1yaXZlciBjaGFubmVsLiAqL1xuICBjaGFubmVsOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgVGVycmFpblYyIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcmVhZG9ubHkgc2VlZDogbnVtYmVyLFxuICAgIHByaXZhdGUgcmVhZG9ubHkgdjE6IFYxSGVpZ2h0LFxuICAgIHJlYWRvbmx5IGh5ZHJvbG9neTogSHlkcm9sb2d5LFxuICApIHt9XG5cbiAgLyoqIDAgPSBleGFjdGx5IHYxIChmb3VuZGVyIGNvcnJpZG9yKTsgMSA9IGZ1bGwgdjIgcmVsaWVmLiAqL1xuICByZWxpZWZNYXNrKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTM5MCwgLTQ3MCwgeik7XG4gICAgLy8gVGhlIHdlc3QgcmFuZ2Uga2VlcHMgY2xlYXIgb2YgdGhlIGxha2UgYmFzaW4gdW50aWwgdGhlIGxha2UgaXMgcGFzc2VkLlxuICAgIGNvbnN0IHdlc3RFZGdlID0gbGVycCgtNDUwLCAtMzIwLCBzbW9vdGhzdGVwKC0yMjAsIC0xNDAsIHopKTtcbiAgICBjb25zdCB3ZXN0ID0gc21vb3Roc3RlcCh3ZXN0RWRnZSwgd2VzdEVkZ2UgLSA5MCwgeCk7XG4gICAgY29uc3QgZWFzdCA9IHNtb290aHN0ZXAoMjMwLCAzMzAsIHgpO1xuICAgIHJldHVybiBNYXRoLm1heChub3J0aCwgd2VzdCwgZWFzdCk7XG4gIH1cblxuICAvKiogMCBhdCB0aGUgcmFuZ2UgZnJvbnQsIDEgZGVlcCBpbnNpZGU6IGZvb3RoaWxscyBmaXJzdCwgcGVha3MgYmVoaW5kLiAqL1xuICByYW5nZURlcHRoKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTQyMCwgLTcwMCwgeik7XG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlIC0gNDAsIHdlc3RFZGdlIC0gMzAwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyNzAsIDU2MCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFYyQ29sdW1uIHtcbiAgICBjb25zdCBzZWVkID0gdGhpcy5zZWVkO1xuICAgIGNvbnN0IGJhc2UgPSB0aGlzLnYxKHNlZWQsIHgsIHopO1xuICAgIGNvbnN0IG1hc2sgPSB0aGlzLnJlbGllZk1hc2soeCwgeik7XG4gICAgbGV0IGggPSBiYXNlO1xuXG4gICAgaWYgKG1hc2sgPiAwKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGlzbGFuZCBub3J0aCBzbyB0aGUgbWFzc2lmIGhhcyByb29tICh2MSBjb2FzdCBpcyB+eiAtNjAwKS5cbiAgICAgIGNvbnN0IG5vcnRoTGFuZCA9IHNtb290aHN0ZXAoLTQyMCwgLTUyMCwgeik7XG4gICAgICBjb25zdCBzaG9yZSA9IDEgLSBNYXRoLmh5cG90KCh4ICsgMTUwKSAvIDU2MCwgKHogKyA2OTApIC8gMzAwKVxuICAgICAgICArIChmYm0yKHggLyAxNjAsIHogLyAxNjAsIHNlZWQgKyA3MDEsIDMpIC0gMC41KSAqIDAuMztcbiAgICAgIGNvbnN0IGxhbmROID0gc21vb3Roc3RlcCgwLjAsIDAuMTQsIHNob3JlKSAqIG5vcnRoTGFuZDtcbiAgICAgIGNvbnN0IGdyb3VuZCA9IGxlcnAoYmFzZSwgTWF0aC5tYXgoYmFzZSwgNSArIDUgKiBmYm0yKHggLyA5MCwgeiAvIDkwLCBzZWVkICsgNzAyLCAyKSksIGxhbmROKTtcblxuICAgICAgLy8gUmlkZ2VkIG1hc3NpZiB3aXRoIHRlcnJhY2VkIGNsaWZmIGJhbmRzLlxuICAgICAgY29uc3Qgd3ggPSB4ICsgKGZibTIoeCAvIDI2MCwgeiAvIDI2MCwgc2VlZCArIDcwMywgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3Qgd3ogPSB6ICsgKGZibTIoeCAvIDI2MCArIDUuMSwgeiAvIDI2MCAtIDIuNywgc2VlZCArIDcwNCwgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3QgcjEgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMTAsIHd6IC8gMjEwLCBzZWVkICsgNzA1LCA0KSAtIDEpO1xuICAgICAgY29uc3QgcjIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4MCwgd3ogLyA4MCwgc2VlZCArIDcwNiwgMykgLSAxKTtcbiAgICAgIGNvbnN0IGx1bXAgPSBmYm0yKHd4IC8gMTIwLCB3eiAvIDEyMCwgc2VlZCArIDcwNywgMyk7XG4gICAgICBjb25zdCBkZXB0aCA9IHRoaXMucmFuZ2VEZXB0aCh4LCB6KTtcbiAgICAgIGxldCBtb3VudGFpbiA9IDE2ICsgKDggKyA4MCAqIGRlcHRoKSAqICgwLjU1ICogcjEgKiByMSArIDAuMjggKiByMiArIDAuMTcgKiBsdW1wKVxuICAgICAgICArIDE4ICogZGVwdGggKiBzbW9vdGhzdGVwKDAuNTUsIDAuOSwgcjEpO1xuICAgICAgY29uc3QgYmFuZCA9IDYgKyAyICogZmJtMih4IC8gMTQwLCB6IC8gMTQwLCBzZWVkICsgNzA4LCAyKTtcbiAgICAgIGNvbnN0IHQgPSBNYXRoLmZsb29yKG1vdW50YWluIC8gYmFuZCk7XG4gICAgICBjb25zdCBmcmFjID0gbW91bnRhaW4gLyBiYW5kIC0gdDtcbiAgICAgIG1vdW50YWluID0gKHQgKyBzbW9vdGhzdGVwKDAuNSwgMC44LCBmcmFjKSkgKiBiYW5kO1xuXG4gICAgICAvLyBPbmx5IGxhbmQgcmlzZXM7IHRoZSBzZWEgc3RheXMgc2VhLCBzbyByYW5nZXMgZW5kIGluIGNvYXN0YWwgY2xpZmZzLlxuICAgICAgY29uc3QgbGFuZEZhY3RvciA9IHNtb290aHN0ZXAoLTIsIDgsIGdyb3VuZCk7XG4gICAgICBoID0gbGVycChncm91bmQsIE1hdGgubWF4KGdyb3VuZCwgbW91bnRhaW4pLCBtYXNrICogbGFuZEZhY3Rvcik7XG4gICAgfVxuXG4gICAgbGV0IGxldmVsID0gaCA8IDAgPyAwIDogLUluZmluaXR5O1xuICAgIGxldCBjaGFubmVsID0gZmFsc2U7XG5cbiAgICAvLyBNb3VudGFpbiByaXZlcjogdmFsbGV5IGZsb29yLCBiYW5rcyBhbmQgY2hhbm5lbCBmb2xsb3cgdGhlIHdhdGVyIGxldmVsLlxuICAgIGNvbnN0IHVwcGVyID0gdGhpcy5oeWRyb2xvZ3kudXBwZXI7XG4gICAgaWYgKHVwcGVyKSB7XG4gICAgICBjb25zdCBoaXQgPSB1cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICBjb25zdCByYWlzZWQgPSBoaXQubGV2ZWwgPiAwLjI1O1xuICAgICAgICBjb25zdCB2dyA9IDU1ICsgMjggKiBmYm0yKGhpdC5zIC8gOTAsIDEuNywgc2VlZCArIDcwOSwgMik7XG4gICAgICAgIGNvbnN0IGZsb29yID0gaGl0LmxldmVsICsgMS41ICsgMi4yICogZmJtMih4IC8gNDAsIHogLyA0MCwgc2VlZCArIDcxMCwgMikgKyBoaXQuZCAqIDAuMDY7XG4gICAgICAgIGNvbnN0IHQgPSBzbW9vdGhzdGVwKHZ3ICogMC4zLCB2dywgaGl0LmQpO1xuICAgICAgICBoID0gTWF0aC5taW4oaCwgbGVycChmbG9vciwgaCwgdCkpO1xuICAgICAgICBjb25zdCB3ID0gaGl0LndpZHRoO1xuICAgICAgICBpZiAocmFpc2VkICYmIGhpdC5kIDwgdyArIDMpIHtcbiAgICAgICAgICAvLyBCYW5rcyBob2xkIGEgcmFpc2VkIHJpdmVyOiBuZXZlciBiZWxvdyBpdHMgd2F0ZXIgc3VyZmFjZS4gQXQgbGFrZVxuICAgICAgICAgIC8vIGxldmVsIHRoZSBzZWEtbGV2ZWwgZmlsbCBhbHJlYWR5IGNvbnRhaW5zIHRoZSB3YXRlci5cbiAgICAgICAgICBoID0gTWF0aC5tYXgoaCwgTWF0aC5jZWlsKGhpdC5sZXZlbCkgKyAxKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaGl0LmQgPCB3KSB7XG4gICAgICAgICAgY29uc3QgYmVkID0gaGl0LmxldmVsIC0gKDEuMiArIDEuMyAqICgxIC0gaGl0LmQgLyB3KSk7XG4gICAgICAgICAgaCA9IE1hdGgubWluKGgsIGJlZCk7XG4gICAgICAgICAgaWYgKHJhaXNlZCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZChoaXQubGV2ZWwpKTtcbiAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgdGFybiA9IHRoaXMuaHlkcm9sb2d5LnRhcm47XG4gICAgICBpZiAodGFybikge1xuICAgICAgICBjb25zdCB0ZCA9IE1hdGguaHlwb3QoeCAtIHRhcm4ueCwgeiAtIHRhcm4ueilcbiAgICAgICAgICAqICgxICsgMC4yICogKGZibTIoeCAvIDMwLCB6IC8gMzAsIHNlZWQgKyA3MTEsIDIpIC0gMC41KSk7XG4gICAgICAgIGlmICh0ZCA8IHRhcm4uciArIDYpIHtcbiAgICAgICAgICBjb25zdCByaW0gPSBNYXRoLmNlaWwodGFybi5sZXZlbCkgKyAxO1xuICAgICAgICAgIGlmICh0ZCA+PSB0YXJuLnIpIGggPSBNYXRoLm1heChoLCByaW0pO1xuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaCA9IE1hdGgubWluKE1hdGgubWF4KGgsIHJpbSksIHRhcm4ubGV2ZWwgLSAxIC0gMyAqIHNtb290aHN0ZXAodGFybi5yLCAwLCB0ZCkpO1xuICAgICAgICAgICAgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZCh0YXJuLmxldmVsKSk7XG4gICAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBMb3dsYW5kIGNoYW5uZWwgY29udGludWl0eTogdjEgbGVhdmVzIGEgZHJ5IGZvcmQgd2hlcmUgdGhlIHNoZWxmIG1lZXRzIHRoZSByaXZlci5cbiAgICBjb25zdCBsb3cgPSB0aGlzLmh5ZHJvbG9neS5sb3dlci5uZWFyZXN0KHgsIHopO1xuICAgIGlmIChsb3cgJiYgbG93LmQgPCAyLjUgJiYgaCA+PSAwICYmIGJhc2UgPCA0KSBoID0gLTE7XG5cbiAgICBoID0gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIFYyX01BWF9IRUlHSFQpKTtcbiAgICBpZiAoaCA8IDApIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIDApO1xuICAgIHJldHVybiB7IGgsIGxldmVsOiBsZXZlbCA9PT0gLUluZmluaXR5ID8gaCA6IGxldmVsLCBjaGFubmVsIH07XG4gIH1cblxuICBoZWlnaHQoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmNvbHVtbih4LCB6KS5oO1xuICB9XG5cbiAgLyoqIHYyIHRvcCBtYXRlcmlhbC4gRmFsbHMgYmFjayB0byB0aGUgdjEgcnVsZXMgZm9yIHRoZSB1bmNoYW5nZWQgY29ycmlkb3IuICovXG4gIHRvcE1hdGVyaWFsKFxuICAgIHg6IG51bWJlciwgejogbnVtYmVyLCBjb2w6IFYyQ29sdW1uLCBzbG9wZTogbnVtYmVyLFxuICAgIHYxVG9wOiAoaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyKSA9PiBNYXRJZCxcbiAgKTogTWF0SWQge1xuICAgIGNvbnN0IGggPSBjb2wuaDtcbiAgICBpZiAoY29sLmNoYW5uZWwgJiYgY29sLmxldmVsID4gaCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIgJiYgaCA+IDEpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDwgaGl0LndpZHRoICsgMi41ICYmIGhpdC5sZXZlbCA+IDAuMjUpIHtcbiAgICAgICAgcmV0dXJuIGZibTIoeCAvIDYsIHogLyA2LCB0aGlzLnNlZWQgKyA3MTIsIDEpID4gMC41ID8gTUFULkdSQVZFTCA6IE1BVC5TQU5EO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzbm93bGluZSA9IFYyX1NOT1dMSU5FICsgKGZibTIoeCAvIDcwLCB6IC8gNzAsIHRoaXMuc2VlZCArIDcxMywgMykgLSAwLjUpICogMTY7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgJiYgc2xvcGUgPD0gMykgcmV0dXJuIE1BVC5TTk9XO1xuICAgIGlmIChoID49IHNub3dsaW5lIC0gNiAmJiBzbG9wZSA8PSAxICYmIGZibTIoeCAvIDIwLCB6IC8gMjAsIHRoaXMuc2VlZCArIDcxNCwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKHRoaXMucmVsaWVmTWFzayh4LCB6KSA+IDAuNSAmJiBoID4gMzAgJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgICByZXR1cm4gdjFUb3AoaCwgc2xvcGUpO1xuICB9XG59XG4iLCAiLy8gU2ltdWxhdGlvbiBsYXllciBcdTIwMTQgcHVyZSBUeXBlU2NyaXB0LCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMSB3b3JsZCBmb3VuZGF0aW9uOiBhIGNodW5rZWQsIGdlbnVpbmVseSB0aHJlZS1kaW1lbnNpb25hbCB2b3hlbCB3b3JsZC5cbi8vIFRoZSBzdG9yZWQgc3RhdGUgaXMgb25lIG1hdGVyaWFsIGJ5dGUgcGVyIGNlbGwgKDAgPSBhaXIpOyBvY2N1cGFuY3kgaXNcbi8vIGltcGxpY2l0LiBTdXJmYWNlIGhlaWdodCBpcyBhIGRlcml2ZWQgcXVlcnksIG5vdCB0aGUgc3RvcmFnZS4gVGhpcyByZXBsYWNlc1xuLy8gdGhlIGZvcm1lciAyNTYgeCAyNTYgaGVpZ2h0ZmllbGQgKHNlZSBJUi0wMDUpLlxuLy9cbi8vIFdvcmxkIG1ldHJlczogeC96IGluIFstMTAyNCwgMTAyNCksIHkgaW4gWy0xNiwgMTEyKSwgc2VhIGxldmVsIDAuXG4vLyBBIGNodW5rIGlzIDMyIHggMzIgeCAxMjggY2VsbHMuIEdlbmVyYXRpb24gaXMgYSBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkLFxuLy8gZ2VuZXJhdG9yIHZlcnNpb24sIHBhcmFtZXRlcnMgYW5kIGNodW5rIGNvb3JkaW5hdGVzOyBlZGl0cyBhcmUgcmVjb3JkZWRcbi8vIHNlcGFyYXRlbHkgYW5kIHJlLWFwcGxpZWQgd2hlbiBhIGNodW5rIGlzIHJlZ2VuZXJhdGVkLlxuaW1wb3J0IHR5cGUgeyBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBMaWZlU3RhdGUgfSBmcm9tICcuL2Vjb25vbXknO1xuaW1wb3J0IHR5cGUgeyBIb21lc3RlYWRTdGF0ZSB9IGZyb20gJy4vaG9tZXN0ZWFkJztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5pbXBvcnQgeyBUZXJyYWluVjIsIFYyQ29sdW1uIH0gZnJvbSAnLi90ZXJyYWluLXYyJztcbmltcG9ydCB7IHRyZWVUaW1iZXIgfSBmcm9tICcuL3ZlZ2V0YXRpb24nO1xuXG5leHBvcnQgY29uc3QgV09STERfU0laRSA9IDIwNDg7XG5leHBvcnQgY29uc3QgSEFMRiA9IFdPUkxEX1NJWkUgLyAyO1xuZXhwb3J0IGNvbnN0IENIVU5LX1NJWkUgPSAzMjtcbmV4cG9ydCBjb25zdCBDSFVOS1NfUEVSX1NJREUgPSBXT1JMRF9TSVpFIC8gQ0hVTktfU0laRTtcbmV4cG9ydCBjb25zdCBZX01JTiA9IC0xNjtcbmV4cG9ydCBjb25zdCBZX01BWCA9IDExMjtcbmV4cG9ydCBjb25zdCBXT1JMRF9IRUlHSFQgPSBZX01BWCAtIFlfTUlOO1xuZXhwb3J0IGNvbnN0IFNFQV9MRVZFTCA9IDA7XG5leHBvcnQgY29uc3QgV0FURVIgPSBTRUFfTEVWRUw7XG4vKiogR2VuZXJhdG9yIHYxOiB0aGUgb3JpZ2luYWwgMjA0OCBtIGlzbGFuZC4gRGVmYXVsdCBmb3IgY3JlYXRlV29ybGQgYW5kIGFsbCBsZWdhY3kgc2F2ZXMuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1ZFUlNJT04gPSAxO1xuLyoqIEdlbmVyYXRvciB2MjogdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSB3aXRoIGEgbW91bnRhaW4gcml2ZXIgKHNlZSB0ZXJyYWluLXYyLnRzKS4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVjIgPSAyO1xuLyoqIFRoZSBnZW5lcmF0b3IgbmV3IGJyb3dzZXIgd29ybGRzIHVzZSBieSBkZWZhdWx0LiAqL1xuZXhwb3J0IGNvbnN0IExBVEVTVF9HRU5FUkFUT1JfVkVSU0lPTiA9IEdFTkVSQVRPUl9WMjtcbmV4cG9ydCBjb25zdCBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TOiByZWFkb25seSBudW1iZXJbXSA9IFtHRU5FUkFUT1JfVkVSU0lPTiwgR0VORVJBVE9SX1YyXTtcbmV4cG9ydCBjb25zdCBpc1N1cHBvcnRlZEdlbmVyYXRvciA9ICh2OiB1bmtub3duKTogdiBpcyBudW1iZXIgPT5cbiAgdHlwZW9mIHYgPT09ICdudW1iZXInICYmIFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlMuaW5jbHVkZXModik7XG5leHBvcnQgY29uc3QgQ0hVTktfVk9MVU1FID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkUgKiBXT1JMRF9IRUlHSFQ7XG5leHBvcnQgY29uc3QgQ0hVTktfQVJFQSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFO1xuXG5leHBvcnQgeyBNQVQsIGlzU29saWQsIGlzT3BhcXVlLCBNQVhfTUFUX0lEIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuZXhwb3J0IHR5cGUgeyBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IE1BVCwgaXNTb2xpZCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5cbmV4cG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgZmJtMixcbn0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQge1xuICBjbGFtcCwgbGVycCwgc21vb3Roc3RlcCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIHZhbHVlTm9pc2UzLCBmYm0yLCBmYm0zLFxufSBmcm9tICcuL25vaXNlJztcblxuLy8gLS0tLS0tLS0tLSB3b3JsZCB0eXBlcyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkUGFyYW1zIHtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEFSQU1TOiBXb3JsZFBhcmFtcyA9IHtcbiAgc2l6ZTogV09STERfU0laRSxcbiAgY2h1bmtTaXplOiBDSFVOS19TSVpFLFxuICB5TWluOiBZX01JTixcbiAgeU1heDogWV9NQVgsXG4gIHNlYUxldmVsOiBTRUFfTEVWRUwsXG4gIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbENodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAga2V5OiBzdHJpbmc7XG4gIC8qKiB4ICsgeiozMiArICh5LVlfTUlOKSoxMDI0ICovXG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3Agc29saWQgeSwgZW5jb2RlZCBhcyAoeSAtIFlfTUlOKSwgMC4uMTI3OyAwIG1lYW5zIG5vIHNvbGlkLiAqL1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICAvKiogdG9wIG1hdGVyaWFsIHBlciBjb2x1bW4uICovXG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG4gIGRpcnR5OiBib29sZWFuO1xuICBnZW5lcmF0ZWRBdDogbnVtYmVyO1xufVxuXG4vLyBOYXR1cmFsIGFzc2V0cyBhcmUgdGhlIHByb2plY3QncyBTdHlsIChgbmF0X2ApIHBpcGVsaW5lIChBUy0wMDEgdjIpLCBub3Rcbi8vIE5veGVsIGFyY2hpdGVjdHVyZS4gTm94ZWwgcmVtYWlucyB0aGUgaHVtYW4tbWFkZSBraXQvd2F5c3RvbmUvbWFya2VyIHN5c3RlbS5cbi8vIFJldGlyZWQgb25seSBhcyB3b3JsZCBjb250ZW50LiBUaGUgbmFtZXMgcmVtYWluIGluIHRoZSBzZXJpYWxpemVkIHR5cGUgc29cbi8vIG9sZCBzbmFwc2hvdHMgYW5kIGFjY2VwdGVkIGhhcnZlc3Qgam91cm5hbHMgY2FuIGJlIG1pZ3JhdGVkIHdpdGhvdXQgcmVqZWN0aW5nXG4vLyBvdGhlcndpc2UgdmFsaWQgc2F2ZXMuIEdlbmVyYXRpb24sIGNvbGxpc2lvbiBhbmQgaW5zcGVjdGlvbiBuZXZlciB1c2UgdGhlbS5cbmV4cG9ydCBjb25zdCBSRVRJUkVEX1NUT05FX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuXSk7XG5leHBvcnQgY29uc3QgaXNSZXRpcmVkU3RvbmVLaW5kID0gKGtpbmQ6IEVudGl0eUtpbmQpOiBib29sZWFuID0+IFJFVElSRURfU1RPTkVfS0lORFMuaGFzKGtpbmQpO1xuZXhwb3J0IHR5cGUgQWN0aXZlRW50aXR5S2luZCA9IEV4Y2x1ZGU8RW50aXR5S2luZCxcbiAgJ3N0eWxfcm9ja19zbWFsbCcgfCAnc3R5bF9yb2NrX21lZGl1bScgfCAnc3R5bF9yb2NrX2xhcmdlJz47XG5cbmZ1bmN0aW9uIGxpdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogRW50aXR5IHwgbnVsbCB7XG4gIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIHJldHVybiAhZW50aXR5IHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpID8gbnVsbCA6IGVudGl0eTtcbn1cblxuZXhwb3J0IHR5cGUgRW50aXR5S2luZCA9XG4gIHwgJ3N0eWxfdHJlZV9zcGlyZSdcbiAgfCAnc3R5bF90cmVlX3RhYmxlJ1xuICB8ICdzdHlsX3RyZWVfY2x1c3RlcidcbiAgfCAnc3R5bF90cmVlX2Jsb3Nzb20nXG4gIHwgJ3N0eWxfc2hydWInXG4gIHwgJ3N0eWxfcm9ja19zbWFsbCdcbiAgfCAnc3R5bF9yb2NrX21lZGl1bSdcbiAgfCAnc3R5bF9yb2NrX2xhcmdlJ1xuICB8ICdzdHlsX29yZSdcbiAgfCAnc3R5bF9jYWlybidcbiAgfCAnd2F5c3RvbmUnXG4gIHwgJ21hcmtlcic7XG5cbmV4cG9ydCB0eXBlIFJlc291cmNlVHlwZSA9ICd3b29kJyB8ICdzdG9uZScgfCAnb3JlJyB8ICdmaWJlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW50aXR5IHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgY2h1bms6IHN0cmluZztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHNjYWxlOiBudW1iZXI7XG4gIHZhcmlhbnQ6IG51bWJlcjtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIHJlbWFpbmluZzogbnVtYmVyO1xuICB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcjtcbiAgLyoqIFRydWUgb25jZSB0aGUgZW50aXR5IGlzIGZ1bGx5IGRlcGxldGVkLiAqL1xuICBoYXJ2ZXN0ZWQ6IGJvb2xlYW47XG4gIC8qKiBUcnVlIGFmdGVyIHRoZSBmaXJzdCBzdWNjZXNzZnVsIGhhcnZlc3QsIGV2ZW4gaWYgeWllbGQgcmVtYWlucy4gKi9cbiAgaGFydmVzdGVkT25jZT86IGJvb2xlYW47XG4gIHByb3Zpc2lvbmFsOiBib29sZWFuO1xuICBhdXRob3JlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3hlbFNpdGUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWdpb25JbmZvIHtcbiAgaWQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdHlwZTogJ3BsYWluJyB8ICdmb3Jlc3QnIHwgJ2hpbGxzJyB8ICdoaWdobGFuZCcgfCAnd2F0ZXInIHwgJ3JpZGdlJztcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgcng6IG51bWJlcjtcbiAgcno6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFN0YXRzIHtcbiAgY2h1bmtzR2VuZXJhdGVkOiBudW1iZXI7XG4gIGNodW5rc0V2aWN0ZWQ6IG51bWJlcjtcbiAgdm94ZWxzRmlsbGVkOiBudW1iZXI7XG4gIGdlbmVyYXRpb25NczogbnVtYmVyO1xuICBlbnRpdGllczogbnVtYmVyO1xuICB0cmVlczogbnVtYmVyO1xuICBwaW5rVHJlZXM6IG51bWJlcjtcbiAgcGlua092ZXJmbG93OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGQge1xuICBzZWVkOiBudW1iZXI7XG4gIHBhcmFtczogV29ybGRQYXJhbXM7XG4gIGNodW5rczogTWFwPHN0cmluZywgVm94ZWxDaHVuaz47XG4gIGVudGl0aWVzOiBNYXA8c3RyaW5nLCBFbnRpdHk+O1xuICBlbnRpdHlDaHVua3M6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPjtcbiAgLyoqIENodW5rcyB3aG9zZSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZW50aXR5IHN0YXRlIGhhcyBiZWVuIGNoYW5nZWQuICovXG4gIGVudGl0eUNoYW5nZXM6IFNldDxzdHJpbmc+O1xuICAvKiogVG9tYnN0b25lcyBmb3IgcmVtb3ZlZCBkZXRlcm1pbmlzdGljIG5hdHVyYWwgZW50aXRpZXMuICovXG4gIGVudGl0eVJlbW92YWxzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIEF1dGhvcml0YXRpdmUgYnVpbHQgc3RydWN0dXJlcyAoaG91c2UsIHBhdGgsIHRlcnJhY2VzLCBjcm9wcykuICovXG4gIHN0cnVjdHVyZXM6IE1hcDxzdHJpbmcsIFN0cnVjdHVyZT47XG4gIHNpdGVzOiBOb3hlbFNpdGVbXTtcbiAgcmVnaW9uczogUmVnaW9uSW5mb1tdO1xuICAvKiogY2h1bmsga2V5IC0+IGxvY2FsIHZveGVsIGluZGV4IC0+IG1hdGVyaWFsLiBEdXJhYmxlLCBjb21wYWN0IGVkaXRzLiAqL1xuICBlZGl0czogTWFwPHN0cmluZywgTWFwPG51bWJlciwgbnVtYmVyPj47XG4gIC8qKiBHbG9iYWwgbG9jYWwtcGxheWVyIGNhcnJpZWQgYmFnOyBib3VuZGVkIGluIHNjaGVtYSAzLCBsZWdhY3kgaW4gMS8yLiAqL1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQcmVzZW50IG9ubHkgYWZ0ZXIgc2NoZW1hLTMgZ2VuZXNpcy9yZXN0b3JhdGlvbi4gKi9cbiAgbGlmZT86IExpZmVTdGF0ZTtcbiAgLyoqIE0wMDYgbGl2aW5nIGhvbWVzdGVhZDsgcHJlc2VudCBvbmNlIGZvdW5kZWQgKHNjaGVtYSAzIG9ubHkpLiAqL1xuICBob21lc3RlYWQ/OiBIb21lc3RlYWRTdGF0ZTtcbiAgZGlydHk6IFNldDxzdHJpbmc+O1xuICBzdGF0czogV29ybGRTdGF0cztcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKlxuICAgKiBNb25vdG9uaWMgcmV2aXNpb24gb2YgYXV0aG9yaXRhdGl2ZSBzdGF0ZSAodm94ZWxzIGFuZCBlbnRpdGllcykuIERlcml2ZWRcbiAgICogY2FjaGVzIGtleWVkIG9uIHRoaXMgdmFsdWUgYXJlIGRpc2NhcmRlZCBhZnRlciBhbiBlZGl0OyBtZXNoL25hdmlnYXRpb25cbiAgICogcmV2aXNpb25zIGFyZSBzZXBhcmF0ZSBiZWNhdXNlIHRoZXkgYXJlIGRlcml2ZWQsIG5vdCB3b3JsZCBzdGF0ZS5cbiAgICovXG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBjaHVua0tleSA9IChjeDogbnVtYmVyLCBjejogbnVtYmVyKSA9PiBgJHtjeH0sJHtjen1gO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWCA9IChjeDogbnVtYmVyKSA9PiBjeCAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWiA9IChjejogbnVtYmVyKSA9PiBjeiAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGxvY2FsSW5kZXggPSAobHg6IG51bWJlciwgeUluZGV4OiBudW1iZXIsIGx6OiBudW1iZXIpID0+XG4gIGx4ICsgbHogKiBDSFVOS19TSVpFICsgeUluZGV4ICogQ0hVTktfQVJFQTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtYID0gKHg6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWiA9ICh6OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFggPSAoeDogbnVtYmVyKSA9PiB4IC0gKHdvcmxkVG9DaHVua1goeCkgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWiA9ICh6OiBudW1iZXIpID0+IHogLSAod29ybGRUb0NodW5rWih6KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB5VG9JbmRleCA9ICh5OiBudW1iZXIpID0+IHkgLSBZX01JTjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGlmICghaXNTdXBwb3J0ZWRHZW5lcmF0b3IoZ2VuZXJhdG9yVmVyc2lvbikpIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24gJHtnZW5lcmF0b3JWZXJzaW9ufWApO1xuICByZXR1cm4ge1xuICAgIHNlZWQsXG4gICAgcGFyYW1zOiB7IC4uLkRFRkFVTFRfUEFSQU1TLCBnZW5lcmF0b3JWZXJzaW9uIH0sXG4gICAgY2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXRpZXM6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaGFuZ2VzOiBuZXcgU2V0KCksXG4gICAgZW50aXR5UmVtb3ZhbHM6IG5ldyBTZXQoKSxcbiAgICBzdHJ1Y3R1cmVzOiBuZXcgTWFwKCksXG4gICAgc2l0ZXM6IFtdLFxuICAgIHJlZ2lvbnM6IFJFR0lPTlMsXG4gICAgZWRpdHM6IG5ldyBNYXAoKSxcbiAgICBpbnZlbnRvcnk6IHt9LFxuICAgIGRpcnR5OiBuZXcgU2V0KCksXG4gICAgc3RhdHM6IHtcbiAgICAgIGNodW5rc0dlbmVyYXRlZDogMCwgY2h1bmtzRXZpY3RlZDogMCwgdm94ZWxzRmlsbGVkOiAwLCBnZW5lcmF0aW9uTXM6IDAsXG4gICAgICBlbnRpdGllczogMCwgdHJlZXM6IDAsIHBpbmtUcmVlczogMCwgcGlua092ZXJmbG93OiAwLFxuICAgIH0sXG4gICAgYXV0aG9yZWRQbGFjZWQ6IGZhbHNlLFxuICAgIHJldmlzaW9uOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVXb3JsZChzZWVkID0gMTMzNywgaW5pdGlhbFJhZGl1cyA9IDAsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkLCBnZW5lcmF0b3JWZXJzaW9uKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNOT1cpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBNQVQuR1JBVkVMO1xuICByZXR1cm4gTUFULlNUT05FO1xufVxuXG5mdW5jdGlvbiBvcmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgY2x1c3RlciA9IGZibTIoeCAvIDU1LCB6IC8gNTUsIHNlZWQgKyAxMzAsIDIpO1xuICBpZiAoY2x1c3RlciA8IDAuNTcpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgbiA9IHZhbHVlTm9pc2UzKHggKiAwLjA5LCB5ICogMC4xMywgeiAqIDAuMDksIHNlZWQgKyAxMzEpO1xuICBjb25zdCBuMiA9IHZhbHVlTm9pc2UzKHggKiAwLjIyICsgNSwgeSAqIDAuMzEsIHogKiAwLjIyIC0gMywgc2VlZCArIDEzMik7XG4gIHJldHVybiBuID4gMC43MCAmJiBuMiA+IDAuNTA7XG59XG5cbmZ1bmN0aW9uIGNhdmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGZibTMoeCAqIDAuMDc1LCB5ICogMC4xMSwgeiAqIDAuMDc1LCBzZWVkICsgMTQwLCAyKSA+IDAuNzI7XG59XG5cbmZ1bmN0aW9uIG92ZXJoYW5nQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWx1ZU5vaXNlMyh4ICogMC4xOCwgeSAqIDAuMjIsIHogKiAwLjE4LCBzZWVkICsgMTQxKSA+IDAuNjI7XG59XG5cbi8vIC0tLS0tLS0tLS0gdmVyc2lvbmVkIGdlbmVyYXRvciBkaXNwYXRjaCAtLS0tLS0tLS0tXG5jb25zdCB2MkNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRlcnJhaW5WMj4oKTtcbmNvbnN0IGh5ZHJvQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSHlkcm9sb2d5PigpO1xuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ3kgbmV0d29yayBmb3IgYSBzZWVkIGFuZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyb2xvZ3lGb3Ioc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIpOiBIeWRyb2xvZ3kge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuaHlkcm9sb2d5O1xuICBjb25zdCBrZXkgPSBgJHtzZWVkfToke3ZlcnNpb259YDtcbiAgbGV0IGh5ZHJvID0gaHlkcm9DYWNoZS5nZXQoa2V5KTtcbiAgaWYgKCFoeWRybykge1xuICAgIGh5ZHJvID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb24sIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGh5ZHJvQ2FjaGUuc2V0KGtleSwgaHlkcm8pO1xuICB9XG4gIHJldHVybiBoeWRybztcbn1cblxuLyoqIEBpbnRlcm5hbCBUaGUgdjIgZ2VuZXJhdG9yIGZvciBhIHNlZWQgKGNhY2hlZDsgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCkuICovXG5leHBvcnQgZnVuY3Rpb24gdGVycmFpblYyKHNlZWQ6IG51bWJlcik6IFRlcnJhaW5WMiB7XG4gIGxldCBnZW4gPSB2MkNhY2hlLmdldChzZWVkKTtcbiAgaWYgKCFnZW4pIHtcbiAgICBjb25zdCBoeWRyb2xvZ3kgPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbjogR0VORVJBVE9SX1YyLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBnZW4gPSBuZXcgVGVycmFpblYyKHNlZWQsIHN1cmZhY2VIZWlnaHRBdCwgaHlkcm9sb2d5KTtcbiAgICB2MkNhY2hlLnNldChzZWVkLCBnZW4pO1xuICB9XG4gIHJldHVybiBnZW47XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCBoZWlnaHQgKHRvcCBzb2xpZCArIDEpIGZvciBhbnkgc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkuaGVpZ2h0KHgsIHopIDogc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgd2F0ZXIgc3VyZmFjZTogd2F0ZXIgZmlsbHMgY2VsbHMgW2hlaWdodCwgbGV2ZWwpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VXYXRlckxldmVsQXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmNvbHVtbih4LCB6KS5sZXZlbDtcbiAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgOiBoO1xufVxuXG5mdW5jdGlvbiB2ZXJzaW9uZWRTbG9wZShzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogKyAxKSksXG4gICk7XG59XG5cbi8qKiBCYXNlIHRvcCBtYXRlcmlhbCBmb3IgYW55IGdlbmVyYXRvciB2ZXJzaW9uIChtYWNybyBMT0QsIGVudGl0eSBwbGFjZW1lbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbEZvcihcbiAgc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGdlbiA9IHRlcnJhaW5WMihzZWVkKTtcbiAgICByZXR1cm4gZ2VuLnRvcE1hdGVyaWFsKHgsIHosIGdlbi5jb2x1bW4oeCwgeiksIHNsb3BlLFxuICAgICAgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoaCwgc3MsIG5lYXJXYXRlcikpO1xuICB9XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB5OiBudW1iZXI7XG4gIHRvcDogTWF0SWQ7XG4gIHNsb3BlOiBudW1iZXI7XG59XG5cbi8qKiBCYXNlIHN1cmZhY2Ugc2FtcGxlIGZvciBtYWNybyBMT0QuIERvZXMgbm90IGluY2x1ZGUgdm94ZWwgZWRpdHMvb3ZlcmhhbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZVN1cmZhY2Uoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFN1cmZhY2VTYW1wbGUge1xuICBjb25zdCB5ID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICBjb25zdCBzbG9wZSA9IHNsb3BlQXQoc2VlZCwgeCwgeiwgeSk7XG4gIHJldHVybiB7IHksIHRvcDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCB5LCBzbG9wZSksIHNsb3BlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2h1bmsgZ2VuZXJhdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICByZXR1cm4gZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KGN4LCBjeikpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgYmFzZSA9IGdlbmVyYXRlQmFzZUNodW5rKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjeCwgY3opO1xuICByZXR1cm4gaW5zdGFsbEJhc2VDaHVuayh3b3JsZCwgYmFzZSwgcGVyZm9ybWFuY2Uubm93KCkgLSB0MCk7XG59XG5cbi8qKlxuICogQmFzZSBnZW5lcmF0ZWQgY29udGVudHMgb2YgYSBjaHVuayBiZWZvcmUgZHVyYWJsZSBlZGl0cy4gQSBwdXJlIGZ1bmN0aW9uIG9mXG4gKiAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24sIGN4LCBjeik6IHNhZmUgdG8gY29tcHV0ZSBpbiBhIFdlYiBXb3JrZXIsIGFuZCB0aGVcbiAqIGJ5dGVzIGFyZSBpZGVudGljYWwgd2hlcmV2ZXIgaXQgcnVucy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBCYXNlQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBzZWVkOiBudW1iZXI7XG4gIHZlcnNpb246IG51bWJlcjtcbiAgZGF0YTogVWludDhBcnJheTtcbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQmFzZUNodW5rKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQmFzZUNodW5rIHtcbiAgY29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KENIVU5LX1ZPTFVNRSk7XG4gIGNvbnN0IGhlaWdodHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3QgdG9wTWF0ZXJpYWxzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBjb25zdCB2MiA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpIDogbnVsbDtcblxuICAvLyBQYWRkZWQgaGVpZ2h0IGNhY2hlOiBhIHRocmVlLWNlbGwgYm9yZGVyIGNvdmVycyBzbG9wZSwgYmVhY2ggYW5kIGxlZGdlcy5cbiAgY29uc3QgUCA9IDM7XG4gIGNvbnN0IFBXID0gQ0hVTktfU0laRSArIFAgKiAyO1xuICBjb25zdCBiYXNlSCA9IG5ldyBJbnQxNkFycmF5KFBXICogUFcpO1xuICBjb25zdCB2MkNvbHM6IFYyQ29sdW1uW10gfCBudWxsID0gdjIgPyBuZXcgQXJyYXkoQ0hVTktfQVJFQSkgOiBudWxsO1xuICBmb3IgKGxldCBweiA9IDA7IHB6IDwgUFc7IHB6KyspIHtcbiAgICBmb3IgKGxldCBweCA9IDA7IHB4IDwgUFc7IHB4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBweCAtIFAsIHd6ID0gb3ogKyBweiAtIFA7XG4gICAgICBpZiAodjIpIHtcbiAgICAgICAgY29uc3QgY29sID0gdjIuY29sdW1uKHd4LCB3eik7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBjb2wuaDtcbiAgICAgICAgY29uc3QgbHggPSBweCAtIFAsIGx6ID0gcHogLSBQO1xuICAgICAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHYyQ29scyFbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY29sO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB3eCwgd3opO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB2MkNvbCA9IHYyQ29scyA/IHYyQ29sc1tseiAqIENIVU5LX1NJWkUgKyBseF0gOiBudWxsO1xuICAgICAgY29uc3QgdG9wID0gdjIgJiYgdjJDb2xcbiAgICAgICAgPyB2Mi50b3BNYXRlcmlhbCh3eCwgd3osIHYyQ29sLCBzbG9wZSwgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGhoLCBzcywgbmVhcldhdGVyKSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHRoZSBjb2x1bW4nc1xuICAgICAgLy8gd2F0ZXIgbGV2ZWwgKHNlYSBsZXZlbCBpbiB2MTsgdGhlIGh5ZHJvbG9naWNhbCBsZXZlbCBpbiB2MikuXG4gICAgICBjb25zdCB3YXRlckxldmVsID0gdjJDb2wgPyBNYXRoLm1pbihZX01BWCwgdjJDb2wubGV2ZWwpIDogU0VBX0xFVkVMO1xuICAgICAgaWYgKGggPCB3YXRlckxldmVsKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCB3YXRlckxldmVsOyB5KyspIHtcbiAgICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopO1xuICAgICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5XQVRFUjtcbiAgICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b3BTb2xpZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5tYXgoWV9NSU4sIGggLSAxKSk7XG4gICAgICBoZWlnaHRzW2NvbF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tjb2xdID0gdG9wO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb3RydWRpbmcgbGVkZ2VzOiBvbmUgb3IgdHdvIHN0b25lIGJsb2NrcyBleHRlbmQgZnJvbSBhIGhpZ2ggY29sdW1uIG92ZXJcbiAgLy8gYSBsb3dlciBuZWlnaGJvdXIuIFRoZXkgY3JlYXRlIHJlYWRhYmxlIG92ZXJoYW5ncyB3aXRob3V0IGEgZnVsbCBjYXZlIHBhc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBpZiAoc2xvcGUgPCAyKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRpcnM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1stMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWzAsIDFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2YgZGlycykge1xuICAgICAgICBjb25zdCBueCA9IGx4ICsgZHgsIG56ID0gbHogKyBkejtcbiAgICAgICAgaWYgKG54IDwgMCB8fCBueiA8IDAgfHwgbnggPj0gQ0hVTktfU0laRSB8fCBueiA+PSBDSFVOS19TSVpFKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbmggPSBiYXNlSFsobnogKyBQKSAqIFBXICsgKG54ICsgUCldO1xuICAgICAgICBpZiAoaCAtIG5oIDwgMikgY29udGludWU7XG4gICAgICAgIGlmIChoYXNoM2kobHgsIGx6LCBkeCAqIDMgKyBkeiAqIDcsIHNlZWQgKyAxNTApIDwgMC41NSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHkgPSBoIC0gMjtcbiAgICAgICAgaWYgKHkgPCBZX01JTiB8fCB5ID49IGgpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KG54LCB5VG9JbmRleCh5KSwgbnopO1xuICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtpZHhdID0gTUFULlNUT05FO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmVjb21wdXRlIHRoZSBjb2x1bW4gY2FjaGUgYWZ0ZXIgbGVkZ2VzL2NhdmVzLiBUaGUgZXhwb3NlZCB0b3AgbWF0ZXJpYWxcbiAgLy8gbXVzdCBjb21lIGZyb20gdGhlIGFjdHVhbCB0b3Agc29saWQgdm94ZWwsIG5vdCB0aGUgcHJlLWNhcnZlIGd1ZXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgIGxldCB0b3BNYXQ6IG51bWJlciA9IHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgY29uc3QgbSA9IGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICAgIGhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG9wTWF0O1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGN4LCBjeiwgc2VlZCwgdmVyc2lvbiwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIgfTtcbn1cblxuLyoqXG4gKiBJbnN0YWxsIGJhc2UgY29udGVudHMgYXMgYSByZXNpZGVudCBjaHVuazogYXBwbHkgZHVyYWJsZSBlZGl0cywgdXBkYXRlXG4gKiBzdGF0cywgYW5kIHJ1biBkZXRlcm1pbmlzdGljIGVudGl0eSBnZW5lcmF0aW9uLiBNYWluLXRocmVhZCBvbmx5OyB0aGlzIGlzXG4gKiB0aGUgc2luZ2xlIHdyaXRlciBvZiBXb3JsZC4gUmV0dXJucyB0aGUgYWxyZWFkeS1yZXNpZGVudCBjaHVuayBpZiBvbmUgZXhpc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbEJhc2VDaHVuayh3b3JsZDogV29ybGQsIGJhc2U6IEJhc2VDaHVuaywgZ2VuZXJhdGlvbk1zID0gMCk6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGJhc2Uuc2VlZCAhPT0gd29ybGQuc2VlZCB8fCBiYXNlLnZlcnNpb24gIT09IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdiYXNlIGNodW5rIGJlbG9uZ3MgdG8gYSBkaWZmZXJlbnQgd29ybGQgY29uZmlndXJhdGlvbicpO1xuICB9XG4gIGNvbnN0IHsgY3gsIGN6LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9ID0gYmFzZTtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgY2h1bms6IFZveGVsQ2h1bmsgPSB7XG4gICAgY3gsIGN6LCBrZXksIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyLFxuICAgIGRpcnR5OiB0cnVlLFxuICAgIGdlbmVyYXRlZEF0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgfTtcblxuICAvLyBBcHBseSBkdXJhYmxlIGVkaXRzIGFmdGVyIGJhc2UgZ2VuZXJhdGlvbi5cbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgaWYgKGVkaXRzKSB7XG4gICAgZm9yIChjb25zdCBbaWR4LCBtXSBvZiBlZGl0cykge1xuICAgICAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgICB9XG4gICAgLy8gUmVjb21wdXRlIHRoZSBjYWNoZSBmb3IgZWRpdGVkIGNodW5rcy5cbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCBseCwgbHopO1xuICAgIH1cbiAgfVxuICAvLyBOb24tYWlyIGNvdW50cyBhcmUgZGVyaXZlZCByZW5kZXJlciBzdGF0aXN0aWNzLCBub3QgZHVyYWJsZSB3b3JsZCBzdGF0ZS5cbiAgLy8gRWRpdGVkIGJhc2UgYWlyIG1heSBiZWNvbWUgc29saWQgKGFuZCB2aWNlIHZlcnNhKSBkdXJpbmcgcmVzdG9yYXRpb24uXG4gIGxldCBlZGl0ZWROb25BaXIgPSAwO1xuICBmb3IgKGNvbnN0IG1hdGVyaWFsIG9mIGNodW5rLmRhdGEpIGlmIChtYXRlcmlhbCAhPT0gTUFULkFJUikgZWRpdGVkTm9uQWlyKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBlZGl0ZWROb25BaXIgLSBub25BaXI7XG5cbiAgd29ybGQuY2h1bmtzLnNldChrZXksIGNodW5rKTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBub25BaXI7XG4gIHdvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyArPSBnZW5lcmF0aW9uTXM7XG4gIHdvcmxkLmRpcnR5LmFkZChrZXkpO1xuXG4gIGdlbmVyYXRlRW50aXRpZXMod29ybGQsIGNodW5rKTtcbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vKiogQSBiYXNlLXRlcnJhaW4gY2FjaGUgc2hhcmVkIGJ5IGVkaXRlZCBhbmQgdW5lZGl0ZWQgcmVnZW5lcmF0aW9uLiBOYXR1cmFsXG4gKiBzY2VuZXJ5IG5ldmVyIGRlcGVuZHMgb24gbGF0ZXIgdm94ZWwgZWRpdHM7IHRoaXMgYWxzbyBsZXRzIGEgc25hcHNob3QgcmVzdG9yZVxuICogYSBoYXJ2ZXN0ZWQgY2h1bmsgd2l0aG91dCBtYXRlcmlhbGl6aW5nIHVucmVsYXRlZCBuZWlnaGJvdXJpbmcgY2h1bmtzLiAqL1xuY29uc3QgYmFzZUNvbHVtbkNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hcDxzdHJpbmcsIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0+PigpO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDb2x1bW5zIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5OyB9XG5cbi8qKiBCYXNlIChwcmUtY2FydmUsIHByZS1lZGl0KSBjb2x1bW4gaGVpZ2h0cy9tYXRlcmlhbHMgdXNlZCBmb3IgZW50aXR5IHBsYWNlbWVudC4gUHVyZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlQmFzZUNvbHVtbnMoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ29sdW1ucyB7XG4gIGNvbnN0IGNvbHVtbnMgPSB7IGhlaWdodHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpLCB0b3BNYXRlcmlhbHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpIH07XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHgsIHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHopO1xuICAgICAgY29uc3Qgc2xvcGUgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IHZlcnNpb25lZFNsb3BlKHNlZWQsIHZlcnNpb24sIHgsIHosIGgpIDogc2xvcGVBdChzZWVkLCB4LCB6LCBoKTtcbiAgICAgIGNvbnN0IGluZGV4ID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLmhlaWdodHNbaW5kZXhdID0gY2xhbXAoaCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2luZGV4XSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gYmFzZVRvcE1hdGVyaWFsRm9yKHNlZWQsIHZlcnNpb24sIHgsIHosIGgsIHNsb3BlKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29sdW1ucztcbn1cblxuLyoqIFByb3ZpZGUgcHJlY29tcHV0ZWQgYmFzZSBjb2x1bW5zIChmb3IgZXhhbXBsZSBmcm9tIGEgd29ya2VyKSBiZWZvcmUgaW5zdGFsbGluZyBhIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlZWRCYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nLCBjb2x1bW5zOiBCYXNlQ29sdW1ucyk6IHZvaWQge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGlmICghY2FjaGUuaGFzKGtleSkpIGNhY2hlLnNldChrZXksIGNvbHVtbnMpO1xufVxuXG5mdW5jdGlvbiBiYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogQmFzZUNvbHVtbnMge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlLmdldChjaHVuay5rZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBjb2x1bW5zID0gY29tcHV0ZUJhc2VDb2x1bW5zKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjaHVuay5jeCwgY2h1bmsuY3opO1xuICBjYWNoZS5zZXQoY2h1bmsua2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVyaXZlZCBjaGFuZ2UgdHJhY2tpbmcgKG5vdCBhdXRob3JpdGF0aXZlIHN0YXRlKSAtLS0tLS0tLS0tXG4vLyBSZW5kZXJlcnMgbmVlZCB0byBrbm93IHdoZW4gdGhlIGVkaXQgb3ZlcmxheSBjaGFuZ2VkIHdpdGhvdXQgd2Fsa2luZyBldmVyeVxuLy8gZWRpdCBlYWNoIGZyYW1lLiBUaGUgY291bnRlciBsaXZlcyBvdXRzaWRlIFdvcmxkIHNvIGl0IG5ldmVyIGVudGVycyBhXG4vLyBzbmFwc2hvdCBvciBjYW5vbmljYWwgaGFzaC5cbmNvbnN0IGVkaXRWZXJzaW9ucyA9IG5ldyBXZWFrTWFwPFdvcmxkLCBudW1iZXI+KCk7XG5cbi8qKiBNb25vdG9uaWMgY291bnQgb2YgZWRpdC1vdmVybGF5IGNoYW5nZXMgZm9yIHRoaXMgV29ybGQgb2JqZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVkaXRWZXJzaW9uKHdvcmxkOiBXb3JsZCk6IG51bWJlciB7XG4gIHJldHVybiBlZGl0VmVyc2lvbnMuZ2V0KHdvcmxkKSA/PyAwO1xufVxuXG4vKiogQ2FsbCBhZnRlciByZXBsYWNpbmcgb3IgYnVsay1jaGFuZ2luZyBgd29ybGQuZWRpdHNgIG91dHNpZGUgc2V0Vm94ZWwuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya0VkaXRzQ2hhbmdlZCh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZWRpdFZlcnNpb25zLnNldCh3b3JsZCwgZWRpdFZlcnNpb24od29ybGQpICsgMSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gbm9uLWdlbmVyYXRpbmcgcXVlcmllcyAtLS0tLS0tLS0tXG4vLyBNb3ZpbmcgcHJlc2VudGF0aW9uIChjaGFyYWN0ZXJzLCBhbmltYWxzLCBjYW1lcmEpIG11c3QgbmV2ZXIgdHJpZ2dlciBjaHVua1xuLy8gZ2VuZXJhdGlvbiBhcyBhIHNpZGUgZWZmZWN0IG9mIGFza2luZyBhYm91dCB0ZXJyYWluLiBUaGVzZSByZXR1cm4gbnVsbCB3aGVuXG4vLyB0aGUgY29sdW1uJ3MgY2h1bmsgaXMgbm90IHJlc2lkZW50LlxuXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRDaHVua0F0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBudWxsO1xuICByZXR1cm4gd29ybGQuY2h1bmtzLmdldChjaHVua0tleSh3b3JsZFRvQ2h1bmtYKHgpLCB3b3JsZFRvQ2h1bmtaKHopKSkgPz8gbnVsbDtcbn1cblxuLyoqIExpa2Ugc3VyZmFjZUF0LCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50U3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgfCBudWxsIHtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuLyoqIExpa2UgZ2V0Vm94ZWwsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRWb3hlbEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHwgbnVsbCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmljdENodW5rKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCF3b3JsZC5jaHVua3MuaGFzKGtleSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuY2h1bmtzLmRlbGV0ZShrZXkpO1xuICB3b3JsZC5zdGF0cy5jaHVua3NFdmljdGVkKys7XG4gIC8vIENodW5rIGJ5dGVzIGFuZCBjb2x1bW4gY2FjaGVzIGFyZSByZWdlbmVyYXRlZCBvbiBkZW1hbmQuIEVudGl0aWVzIHJlbWFpblxuICAvLyBhdXRob3JpdGF0aXZlOiBldmljdGlvbiBtdXN0IG5vdCBmb3JnZXQgdGhlaXIgcGVyc2lzdGVudCBzdGF0ZS5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcXVlcmllcyAvIGVkaXRzIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBnZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG06IE1hdElkKTogYm9vbGVhbiB7XG4gIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBZX01BWCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBpZHggPSBsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgY29uc3QgcHJldmlvdXNFZGl0ID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rS2V5KGN4LCBjeikpPy5nZXQoaWR4KTtcbiAgLy8gQSBjaHVuayBldmljdGVkIGFmdGVyIGFuIGVhcmxpZXIgZWRpdCBjYW4gcmVnZW5lcmF0ZSB3aXRoIHRoYXQgZHVyYWJsZVxuICAvLyBtYXRlcmlhbCBhbHJlYWR5IGFwcGxpZWQuIERyb3BwaW5nIHRoZSBlZGl0IGhlcmUgd291bGQgbWFrZSBpdCBkaXNhcHBlYXJcbiAgLy8gb24gdGhlIG5leHQgZXZpY3Rpb24vcmVzdG9yYXRpb24sIGV2ZW4gdGhvdWdoIHRoZSBjdXJyZW50IHdyaXRlIG5vLW9wcy5cbiAgaWYgKHByZXZpb3VzRWRpdCA9PT0gbSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gZmFsc2U7XG4gIGxldCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChjaHVuay5rZXkpO1xuICBpZiAoIWVkaXRzKSB7IGVkaXRzID0gbmV3IE1hcCgpOyB3b3JsZC5lZGl0cy5zZXQoY2h1bmsua2V5LCBlZGl0cyk7IH1cbiAgLy8gQW4gaWRlbXBvdGVudCB3cml0ZSBtdXN0IHN0aWxsIHJlc3RvcmUgYSBkdXJhYmxlIGRlbHRhIGRpc2NhcmRlZCBieSBhblxuICAvLyBvbGRlciBzbmFwc2hvdCBvciBkZWx0YSBkZWNvZGVyLiBJdCBpcyBub3QgYSBuZXcgYXV0aG9yaXRhdGl2ZSByZXZpc2lvbi5cbiAgaWYgKGNodW5rLmRhdGFbaWR4XSA9PT0gbSkge1xuICAgIGlmICghZWRpdHMuaGFzKGlkeCkpIGVkaXRzLnNldChpZHgsIG0pO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgbWFya0VkaXRzQ2hhbmdlZCh3b3JsZCk7XG4gIGNodW5rLmRpcnR5ID0gdHJ1ZTtcbiAgd29ybGQuZGlydHkuYWRkKGNodW5rLmtleSk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCB3b3JsZFRvTG9jYWxYKHgpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rOiBWb3hlbENodW5rLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogdm9pZCB7XG4gIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICBpZiAoaXNTb2xpZChjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildKSkgeyB0b3BTb2xpZCA9IHk7IGJyZWFrOyB9XG4gIH1cbiAgY2h1bmsuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgY29uc3QgdG0gPSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICBpZiAodG9wU29saWQgPj0gWV9NSU4pIHtcbiAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh0b3BTb2xpZCksIGx6KV07XG4gICAgaWYgKG0gIT09IE1BVC5XQVRFUikgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IG07XG4gIH0gZWxzZSB7XG4gICAgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRtO1xuICB9XG59XG5cbi8qKlxuICogVGhlIHkgY29vcmRpbmF0ZSBvZiB0aGUgZXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uIGF0IHgvei5cbiAqIEEgc29saWQgdm94ZWwgYXQgeSBvY2N1cGllcyBbeSwgeSsxKSwgc28gdGhlIHdhbGthYmxlIHN1cmZhY2UgaXMgdG9wU29saWQrMS5cbiAqIFRoaXMgaXMgYSBkZXJpdmVkIHF1ZXJ5OyB0aGUgYXV0aG9yaXRhdGl2ZSBzdGF0ZSByZW1haW5zIHRoZSB2b3hlbCB2b2x1bWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBZX01JTjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBZX01JTjtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsudG9wTWF0ZXJpYWxzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWlnaHRBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiA8IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGggPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICAgIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIC0gaCA6IDA7XG4gIH1cbiAgcmV0dXJuIHdhdGVyU3VyZmFjZUF0KHdvcmxkLCB4LCB6KSAtIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKlxuICogVG9wIG9mIHRoZSB3YXRlciBjb2x1bW4gc3RhbmRpbmcgb24gdGhlIHNvbGlkIHN1cmZhY2UgKGVxdWFsIHRvIHRoZSBzdXJmYWNlXG4gKiB3aGVuIGRyeSkuIFJlYWRzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVscywgc28gZWRpdHMgYW5kIGR1ZyBwaXRzIGFyZSBleGFjdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyU3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIHdoaWxlICh5IDwgWV9NQVggJiYgZ2V0Vm94ZWwod29ybGQsIHgsIHksIHopID09PSBNQVQuV0FURVIpIHkrKztcbiAgcmV0dXJuIHk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZW50aXRpZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gYWRkRW50aXR5KHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5oYXMoZS5pZCkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIHJldHVybjtcbiAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGUpO1xuICBsZXQgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgbGlzdCk7IH1cbiAgbGlzdC5wdXNoKGUuaWQpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIC8vIEdlbmVyYXRpb24gaXMgZGV0ZXJtaW5pc3RpYyBhbmQgYWR2YW5jZXMgbm8gcGxheWVyLWNvbW1hbmQgcHJlY29uZGl0aW9uLlxuICAvLyBBdXRob3JlZCBzY2FmZm9sZGluZyBtYXkgdHJhbnNpZW50bHkgY2hhbmdlIGl0OyB0aGUgc25hcHNob3QgcmVzdG9yZXMgdGhlXG4gIC8vIHNhdmVkIHJldmlzaW9uIGFmdGVyIHBsYWNpbmcgdGhhdCBzY2FmZm9sZGluZy5cbn1cblxuLyoqXG4gKiBSZW1vdmUgYW4gZW50aXR5IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd29ybGQuIFVzZWQgd2hlbiBhIHNpdGUgaXMgY2xlYXJlZDpcbiAqIHRoZSByZXNvdXJjZSB5aWVsZCBpcyBhY2NvdW50ZWQgZm9yIGJ5IHRoZSBjYWxsZXIsIGFuZCB0aGUgZW50aXR5IG11c3Qgc3RvcFxuICogZXhpc3RpbmcgZm9yIGNvbGxpc2lvbiwgb2JzdHJ1Y3Rpb24gYW5kIHBlcnNpc3RlbmNlLCBub3QganVzdCBiZSBoaWRkZW4gYnlcbiAqIHRoZSByZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICBjb25zdCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKGxpc3QpIHtcbiAgICBjb25zdCBpID0gbGlzdC5pbmRleE9mKGlkKTtcbiAgICBpZiAoaSA+PSAwKSBsaXN0LnNwbGljZShpLCAxKTtcbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChpZCk7XG4gIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUlkKGNodW5rOiBzdHJpbmcsIGk6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBgZToke2NodW5rfToke2l9YDtcbn1cblxuLyoqXG4gKiBQdXJlIGZvcmVzdC1kZW5zaXR5IGZpZWxkIHVzZWQgYnkgZW50aXR5IGdlbmVyYXRpb24uIEV4cG9ydGVkIHJlYWQtb25seSBmb3JcbiAqIHJlbmRlciBkZWNvcmF0aW9uIChyZW5kZXIvZ3JvdW5kLWNvdmVyLnRzKTsgY2hhbmdpbmcgaXQgY2hhbmdlcyB3b3JsZHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3Jlc3RTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBlYXN0ID0gTWF0aC5leHAoLSgoKHd4IC0gMjIwKSAvIDI2MCkgKiogMiArICgod3ogKyAxMTApIC8gMjIwKSAqKiAyKSk7XG4gIGNvbnN0IG5vcnRoID0gTWF0aC5leHAoLSgoKHd4IC0gMjApIC8gMzAwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAxOTApICoqIDIpKTtcbiAgY29uc3Qgd2VzdCA9IE1hdGguZXhwKC0oKCh3eCArIDM0MCkgLyAyMDApICoqIDIgKyAoKHd6IC0gMTIwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBzb3V0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDEyMCkgLyAyNDApICoqIDIgKyAoKHd6IC0gMzMwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBtb2lzdHVyZSA9IGZibTIod3ggLyAyNjAsIHd6IC8gMjYwLCBzZWVkICsgMjAxLCA0KTtcbiAgY29uc3QgdmFsbGV5ID0gTWF0aC5leHAoLSgod3ggLyAxNDApICoqIDIgKyAod3ogLyAxMDUpICoqIDIpKTtcbiAgcmV0dXJuIE1hdGgubWF4KGVhc3QsIG5vcnRoICogMC45Miwgd2VzdCAqIDAuODAsIHNvdXRoICogMC43OCkgKiAwLjgyXG4gICAgKyBtb2lzdHVyZSAqIDAuMzggLSAwLjIyIC0gdmFsbGV5ICogMC4zNDtcbn1cblxuLyoqIFB1cmUgcm9ja2luZXNzIGZpZWxkIHVzZWQgYnkgZW50aXR5IGdlbmVyYXRpb24gKHNhbWUgY29udHJhY3QgYXMgZm9yZXN0U2NvcmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJvY2tTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBtb3VudGFpbiA9IGZibTIod3ggLyAzMzAsIHd6IC8gMzMwLCBzZWVkICsgMjAyLCAzKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAxNDAsIHd6IC8gMTQwLCBzZWVkICsgMjAzLCAzKSAtIDEpO1xuICByZXR1cm4gbW91bnRhaW4gKiAwLjU1ICsgcmlkZ2UgKiAwLjQ1O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB2b2lkIHtcbiAgZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZCwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbn1cblxuLyoqIEBpbnRlcm5hbCBSZXBsYXlzIGRldGVybWluaXN0aWMgZ2VuZXJhdGlvbiBmb3Igc25hcHNob3QgZW50aXR5IGRlbHRhcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBpZiAod29ybGQuZW50aXR5Q2h1bmtzLmhhcyhrZXkpKSByZXR1cm47XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybjtcblxuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChoYXNoMmkoY2h1bmsuY3gsIGNodW5rLmN6LCB3b3JsZC5zZWVkICsgOTAwKSAqIDQyOTQ5NjcyOTYpID4+PiAwKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIGNvbnN0IGNvbHVtbnMgPSBiYXNlQ29sdW1ucyh3b3JsZCwgY2h1bmspO1xuICBsZXQgbiA9IDA7XG4gIGxldCBuYXR1cmFsVHJlZXMgPSAwO1xuICBsZXQgbmF0dXJhbFBpbmtUcmVlcyA9IDA7XG5cbiAgY29uc3QgbG9jYWxTdXJmYWNlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdICsgWV9NSU47XG4gIH07XG4gIGNvbnN0IGxvY2FsVG9wID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBNYXRJZCA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSBhcyBNYXRJZDtcbiAgfTtcbiAgY29uc3QgbG9jYWxTbG9wZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgcmV0dXJuIE1hdGgubWF4KFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggKyAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogKyAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICApO1xuICB9O1xuXG4gIC8vIEEgaml0dGVyZWQgOCBtIGxhdHRpY2UgZ2l2ZXMgY29oZXJlbnQgbWFzc2VzIGFuZCBhdm9pZHMgcGVyLWZyYW1lIHNjYXR0ZXIuXG4gIGZvciAobGV0IGd6ID0gMDsgZ3ogPCBDSFVOS19TSVpFOyBneiArPSA4KSB7XG4gICAgZm9yIChsZXQgZ3ggPSAwOyBneCA8IENIVU5LX1NJWkU7IGd4ICs9IDgpIHtcbiAgICAgIGNvbnN0IGx4ID0gY2xhbXAoTWF0aC5mbG9vcihneCArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IGx6ID0gY2xhbXAoTWF0aC5mbG9vcihneiArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgICAgaWYgKGggPD0gU0VBX0xFVkVMICsgMSkgY29udGludWU7XG4gICAgICBjb25zdCBzbG9wZSA9IGxvY2FsU2xvcGUobHgsIGx6KTtcbiAgICAgIGNvbnN0IHRvcCA9IGxvY2FsVG9wKGx4LCBseik7XG4gICAgICBpZiAodG9wID09PSBNQVQuV0FURVIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZm9yZXN0ID0gZm9yZXN0U2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvY2t5ID0gcm9ja1Njb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2xsID0gcm5kKCk7XG5cbiAgICAgIGNvbnN0IHRyZWVDaGFuY2UgPSBmb3Jlc3QgPiAwLjUwID8gMC43MiA6IGZvcmVzdCA+IDAuMzAgPyAwLjI1IDogMC4wNTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAyICYmIHJvbGwgPCB0cmVlQ2hhbmNlKSB7XG4gICAgICAgIC8vIFRoZSBjYXAgaXMgYSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZ2VuZXJhdGlvbiBwcm9wZXJ0eS4gSXQgY2Fubm90XG4gICAgICAgIC8vIGRlcGVuZCBvbiB3aGljaCBjaHVua3MgYSByZW5kZXJlciBsb2FkZWQgYmVmb3JlIHRoaXMgb25lLlxuICAgICAgICBsZXQga2luZDogRW50aXR5S2luZDtcbiAgICAgICAgbGV0IHZhcmlhbnQ6IG51bWJlcjtcbiAgICAgICAgY29uc3Qgc3BlY2llc1JvbGwgPSBybmQoKTtcbiAgICAgICAgaWYgKHNwZWNpZXNSb2xsIDwgMC4xMikge1xuICAgICAgICAgIGlmICgobmF0dXJhbFBpbmtUcmVlcyArIDEpID4gMC4yNSAqIChuYXR1cmFsVHJlZXMgKyAxKSkge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua092ZXJmbG93Kys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2Jsb3Nzb20nO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAyKTtcbiAgICAgICAgICAgIG5hdHVyYWxQaW5rVHJlZXMrKztcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNDApIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9zcGlyZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNzQpIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV90YWJsZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICB9XG4gICAgICAgIG5hdHVyYWxUcmVlcysrO1xuICAgICAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44OCArIHJuZCgpICogMC4yNCwgdmFyaWFudCxcbiAgICAgICAgICByZXNvdXJjZTogJ3dvb2QnLCByZW1haW5pbmc6IDEyLCB5aWVsZFBlckhhcnZlc3Q6IDQsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHJvY2t5ID4gMC40NiAmJiByb2xsIDwgMC4zOCkge1xuICAgICAgICAvLyBDb25zdW1lIHRoZSByZXRpcmVkIHN0b25lIGZvcm0ncyByYW5kb20gZHJhd3MgYW5kIGFsbG9jYXRlIGl0cyBvbGRcbiAgICAgICAgLy8gc2VxdWVuY2UgSUQsIGJ1dCBkbyBub3QgaW5zZXJ0IGFuIGVudGl0eS4gTGF0ZXIgbmF0dXJhbCBwbGFjZW1lbnRzXG4gICAgICAgIC8vIHRoZXJlZm9yZSByZW1haW4gYnl0ZS1mb3ItYnl0ZSBjb21wYXRpYmxlIHdpdGggcmVjb3JkZWQgc2F2ZXMuXG4gICAgICAgIGNvbnN0IHNpemVSb2xsID0gcm5kKCk7XG4gICAgICAgIGNvbnN0IGtpbmQ6IEVudGl0eUtpbmQgPSBzaXplUm9sbCA8IDAuNTUgPyAnc3R5bF9yb2NrX3NtYWxsJ1xuICAgICAgICAgIDogc2l6ZVJvbGwgPCAwLjkwID8gJ3N0eWxfcm9ja19tZWRpdW0nIDogJ3N0eWxfcm9ja19sYXJnZSc7XG4gICAgICAgIGNvbnN0IGlkID0gZW50aXR5SWQoY2h1bmsua2V5LCBuKyspO1xuICAgICAgICBjb25zdCByZWNvcmQgPSB7XG4gICAgICAgICAgaWQsIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByZXNvdXJjZTogJ3N0b25lJyBhcyBjb25zdCxcbiAgICAgICAgICByZW1haW5pbmc6IGtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gNCA6IGtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDggOiAxMixcbiAgICAgICAgICB5aWVsZFBlckhhcnZlc3Q6IDMsIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgIH07XG4gICAgICAgIC8vIE9ubHkgZW50aXRpZXMgdGhhdCBleGlzdGVkIGluIGFuIGFjY2VwdGVkIG9sZCBzYXZlIGdldCB0b21ic3RvbmVzLFxuICAgICAgICAvLyBkdXJpbmcgZXhwbGljaXQgbWlncmF0aW9uLiBPcmRpbmFyeSBnZW5lcmF0aW9uIG11c3QgcmVzdG9yZSBleGFjdGx5LlxuICAgICAgICBpZiAoaXNTdG9uZVJlcGxheSh3b3JsZCkpIGFkZEVudGl0eSh3b3JsZCwgcmVjb3JkKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuU1RPTkUgJiYgcm9ja3kgPiAwLjU4ICYmIHJvbGwgPCAwLjE4KSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfb3JlJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDIpLFxuICAgICAgICAgIHJlc291cmNlOiAnb3JlJywgcmVtYWluaW5nOiA4LCB5aWVsZFBlckhhcnZlc3Q6IDIsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDEgJiYgcm9sbCA8IDAuMzApIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9zaHJ1YicsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44ICsgcm5kKCkgKiAwLjQsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgICByZXNvdXJjZTogJ2ZpYmVyJywgcmVtYWluaW5nOiA0LCB5aWVsZFBlckhhcnZlc3Q6IDEsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkOiBXb3JsZCwga2luZDogRW50aXR5S2luZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgcm90OiBudW1iZXIsIHNjYWxlOiBudW1iZXIsIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsLCByZW1haW5pbmc6IG51bWJlciwgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmICh5IDw9IFNFQV9MRVZFTCkgcmV0dXJuO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgLy8gQSBoZXJvIGFzc2V0IG93bnMgaXRzIHNwb3Q6IGNsZWFyIGFueSBnZW5lcmF0ZWQgZW50aXR5IHRoYXQgd291bGQgb3ZlcmxhcFxuICAvLyBpdCwgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBpbmcgdGhlIGF1dGhvcmVkIGNvbXBvc2l0aW9uLlxuICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkgPz8gW107XG4gIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoa2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSByZXR1cm47XG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKGUgJiYgTWF0aC5oeXBvdChlLnggLSB4LCBlLnogLSB6KSA8IDIuNikge1xuICAgICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICAgIH1cbiAgfVxuICB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpKTtcbiAgLy8gQXV0aG9yZWQgY29tcG9zaXRpb24gaXMgZHVyYWJsZSBzdGF0ZTogaXQgY2FuIGNsZWFyIG92ZXJsYXBwaW5nIG5hdHVyYWxcbiAgLy8gZW50aXRpZXMsIHNvIHNhdmUgdGhlIGNvbXBsZXRlIGFmZmVjdGVkIGNodW5rIHJhdGhlciB0aGFuIG9ubHkgaXRzIGhlcm9lcy5cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcblxuICBjb25zdCBpZCA9IGBoZXJvOiR7a2luZH06JHtNYXRoLnJvdW5kKHgpfToke01hdGgucm91bmQoeil9YDtcbiAgY29uc3QgYmVmb3JlID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgY29uc3QgZW50aXR5OiBFbnRpdHkgPSB7XG4gICAgaWQsIGtpbmQsIGNodW5rOiBrZXksIHg6IHggKyAwLjUsIHksIHo6IHogKyAwLjUsXG4gICAgcm90LCBzY2FsZSwgdmFyaWFudCwgcmVzb3VyY2UsIHJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0LFxuICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogdHJ1ZSxcbiAgfTtcbiAgYWRkRW50aXR5KHdvcmxkLCBlbnRpdHkpO1xuICBpZiAod29ybGQuZW50aXRpZXMuc2l6ZSA+IGJlZm9yZSAmJiBraW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB7XG4gICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoa2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmF1dGhvcmVkUGxhY2VkKSByZXR1cm47XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gdHJ1ZTtcblxuICBjb25zdCBzaXRlczogQXJyYXk8eyBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7IHg6IG51bWJlcjsgejogbnVtYmVyOyByb3Q6IG51bWJlciB9PiA9IFtcbiAgICB7IGtpbmQ6ICd3YXlzdG9uZScsIHg6IC0xMCwgejogLTE0LCByb3Q6IDAgfSxcbiAgICB7IGtpbmQ6ICdtYXJrZXInLCB4OiAtMzIsIHo6IC04LCByb3Q6IE1hdGguUEkgLyAyIH0sXG4gIF07XG4gIGZvciAoY29uc3QgcyBvZiBzaXRlcykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoeSA8PSBTRUFfTEVWRUwpIGNvbnRpbnVlO1xuICAgIHdvcmxkLnNpdGVzLnB1c2goe1xuICAgICAgaWQ6IGBzaXRlOiR7cy5raW5kfWAsXG4gICAgICBraW5kOiBzLmtpbmQsXG4gICAgICB4OiBzLnggKyAwLjUsIHksIHo6IHMueiArIDAuNSxcbiAgICAgIHJvdDogcy5yb3QsXG4gICAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEEgaGVybyBncm92ZSBjb21wb3NlZCBpbiB0aGUgZGVmYXVsdCBjYW1lcmEncyB2aWV3IGRpcmVjdGlvbi4gVGhlc2UgYXJlXG4gIC8vIFN0eWwgbmF0dXJhbCBhc3NldHMgKEFTLTAwMSB2MiksIG5vdCBOb3hlbCBhcmNoaXRlY3R1cmU7IHRoZSBOb3hlbFxuICAvLyB3YXlzdG9uZS9tYXJrZXIgYWJvdmUgcmVtYWluIHRoZSBodW1hbi1tYWRlIGxhbmRtYXJrcy5cbiAgY29uc3QgZ3JvdmU6IEFycmF5PFtFbnRpdHlLaW5kLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0+ID0gW1xuICAgIFsnc3R5bF90cmVlX3NwaXJlJywgLTIyLCAtMjYsIDAsIDEuMDAsIDBdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTM0LCAtMTgsIDEsIDAuOTUsIE1hdGguUEkgLyAxMl0sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xNiwgLTM0LCAyLCAxLjAwLCBNYXRoLlBJIC8gNl0sXG4gICAgWydzdHlsX3RyZWVfYmxvc3NvbScsIC0yOCwgLTM4LCAwLCAwLjkwLCBNYXRoLlBJIC8gNF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtNDAsIC0zMCwgMiwgMS4wNSwgTWF0aC5QSSAvIDNdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTIsIC0yNCwgMCwgMC45MCwgTWF0aC5QSSAvIDIuNF0sXG4gIF07XG4gIGZvciAoY29uc3QgW2tpbmQsIHgsIHosIHZhcmlhbnQsIHNjYWxlLCByb3RdIG9mIGdyb3ZlKSB7XG4gICAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsIGtpbmQsIHgsIHosIHZhcmlhbnQsIHJvdCwgc2NhbGUsICd3b29kJywgMTIsIDQpO1xuICB9XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9yb2NrX21lZGl1bScsIC02LCAtMTAsIDAsIDAsIDEuMCwgJ3N0b25lJywgOCwgMyk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9zaHJ1YicsIC0xNCwgLTgsIDEsIE1hdGguUEkgLyAxMiwgMS4xLCAnZmliZXInLCA0LCAxKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX2NhaXJuJywgLTIwLCAtNiwgMCwgMCwgMS4wLCAnc3RvbmUnLCA2LCAyKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX29yZScsIC0zOCwgLTQyLCAwLCBNYXRoLlBJIC8gNCwgMS4xLCAnb3JlJywgOCwgMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBuZWFyZXN0SGFydmVzdGFibGUoXG4gIHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCByZXNvdXJjZT86IFJlc291cmNlVHlwZSxcbik6IEVudGl0eSB8IG51bGwge1xuICBsZXQgYmVzdDogRW50aXR5IHwgbnVsbCA9IG51bGw7XG4gIGxldCBiZXN0RCA9IHJhZGl1cyAqIHJhZGl1cztcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKVxuICAgICAgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgY29udGludWU7XG4gICAgaWYgKHJlc291cmNlICYmIGUucmVzb3VyY2UgIT09IHJlc291cmNlKSBjb250aW51ZTtcbiAgICBjb25zdCBkID0gKGUueCAtIHgpICoqIDIgKyAoZS56IC0geikgKiogMjtcbiAgICBpZiAoZCA8IGJlc3REKSB7IGJlc3REID0gZDsgYmVzdCA9IGU7IH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0UmVzdWx0IHsgZW50aXR5OiBFbnRpdHk7IHJlc291cmNlOiBSZXNvdXJjZVR5cGU7IGFtb3VudDogbnVtYmVyOyB9XG5cbi8qKlxuICogU2V0dGxlbWVudCBydWxlcyB2MiAoTTAxMCk6IGdyb3d0aCBzdGFnZSBzZXRzIHRyZWUgeWllbGQgYW5kIGZvb3RwcmludCwgYW5kXG4gKiB2aWxsYWdlcnMgbmF2aWdhdGUuIEFjdGl2ZSBvbmNlIHRoZSB3b3JsZCdzIGhvbWVzdGVhZCBpcyB2ZXJzaW9uIDIgKGZvdW5kZWRcbiAqIG9yIHVwZ3JhZGVkIGJ5IGEgam91cm5hbGVkIGNvbW1hbmQpOyBlYXJsaWVyIHdvcmxkcyBrZWVwIGxlZ2FjeSBydWxlcywgc29cbiAqIHRoZWlyIHJlcGxheXMgYW5kIGhhc2hlcyBhcmUgdW5jaGFuZ2VkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RhZ2VSdWxlc0FjdGl2ZSh3b3JsZDogV29ybGQpOiBib29sZWFuIHtcbiAgcmV0dXJuICh3b3JsZC5ob21lc3RlYWQ/LnZlcnNpb24gPz8gMCkgPj0gMjtcbn1cblxuLyoqXG4gKiBVbmRlciBzdGFnZSBydWxlcyBhIHRyZWUncyBmaXJzdCBjdXQgc2V0cyBpdHMgcmVjb3JkIHRvIHRoZSBzdGFnZSdzIHRpbWJlclxuICogKGEgc2FwbGluZyBob2xkcyAyIHdvb2QsIGFuIG9sZCB0cmVlIDE2KS4gSWRlbXBvdGVudCBhZnRlciB0aGUgZmlyc3QgY3V0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlTdGFnZVRpbWJlcih3b3JsZDogV29ybGQsIGU6IEVudGl0eSk6IHZvaWQge1xuICBpZiAoIXN0YWdlUnVsZXNBY3RpdmUod29ybGQpIHx8IGUuaGFydmVzdGVkT25jZSkgcmV0dXJuO1xuICBjb25zdCB0ID0gdHJlZVRpbWJlcihlKTtcbiAgaWYgKCF0KSByZXR1cm47XG4gIGUucmVtYWluaW5nID0gdC50b3RhbDtcbiAgZS55aWVsZFBlckhhcnZlc3QgPSB0LmN1dDtcbn1cblxuLyoqXG4gKiBPbmUgY3V0IGZyb20gYW4gZW50aXR5OiB0aGUgc2luZ2xlIHJ1bGUgZm9yIGRlcGxldGluZyBhIHRyZWUsIGJ1c2ggb3JcbiAqIGRlcG9zaXQsIHNoYXJlZCBieSB0aGUgcGxheWVyJ3MgaGFydmVzdCBhbmQgKE0wMTIgcnVsZXMgdjQpIHRoZSB3b29kY3V0dGVyLlxuICogYHJvb21gIGlzIGhvdyBtdWNoIHRoZSByZWNlaXZpbmcgYmFnIG9yIGxvYWQgY2FuIHN0aWxsIHRha2U7IG5vdGhpbmcgY2hhbmdlc1xuICogd2hlbiB0aGUgY3V0IGRvZXMgbm90IGZpdC4gVGhlIGNhbGxlciBwdXRzIGBhbW91bnRgIGludG8gdGhhdCBiYWcgb3IgbG9hZC5cbiAqIEEgZGVwbGV0ZWQgZW50aXR5IGlzIGBoYXJ2ZXN0ZWRgOiBpdCBzdG9wcyBiZWluZyBkcmF3biBhbmQgbGVhdmVzIHRoZVxuICogd2Fsa2luZyBncmlkIG9uIGl0cyBuZXh0IHJlYnVpbGQgKHRoZSByZXZpc2lvbiBjaGFuZ2VzKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGN1dEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcsIHJvb206IG51bWJlcik6IEhhcnZlc3RSZXN1bHQgfCBudWxsIHtcbiAgY29uc3QgZSA9IGxpdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsO1xuICAvLyBDYXBhY2l0eSBpcyBjaGVja2VkIGFnYWluc3QgdGhlIHN0YWdlIHlpZWxkLCB0aGVuIHRoZSByZWNvcmQgY2hhbmdlcy5cbiAgaWYgKHN0YWdlUnVsZXNBY3RpdmUod29ybGQpICYmICFlLmhhcnZlc3RlZE9uY2UgJiYgdHJlZVRpbWJlcihlKSkge1xuICAgIGNvbnN0IHQgPSB0cmVlVGltYmVyKGUpITtcbiAgICBpZiAoTWF0aC5taW4odC5jdXQsIHQudG90YWwpID4gcm9vbSkgcmV0dXJuIG51bGw7XG4gICAgYXBwbHlTdGFnZVRpbWJlcih3b3JsZCwgZSk7XG4gIH1cbiAgY29uc3QgYW1vdW50ID0gTWF0aC5taW4oZS55aWVsZFBlckhhcnZlc3QsIGUucmVtYWluaW5nKTtcbiAgaWYgKGFtb3VudCA+IHJvb20pIHJldHVybiBudWxsO1xuICBlLnJlbWFpbmluZyAtPSBhbW91bnQ7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGUuaGFydmVzdGVkT25jZSA9IHRydWU7XG4gIGlmIChlLnJlbWFpbmluZyA8PSAwKSBlLmhhcnZlc3RlZCA9IHRydWU7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IGVudGl0eTogZSwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBIYXJ2ZXN0UmVzdWx0IHwgbnVsbCB7XG4gIGNvbnN0IHJvb20gPSB3b3JsZC5saWZlID8gMTIwIC0gT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSA6IEluZmluaXR5O1xuICBjb25zdCByID0gY3V0RW50aXR5KHdvcmxkLCBpZCwgcm9vbSk7XG4gIGlmIChyKSB3b3JsZC5pbnZlbnRvcnlbci5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W3IucmVzb3VyY2VdID8/IDApICsgci5hbW91bnQ7XG4gIHJldHVybiByO1xufVxuXG4vKiogUmVtb3ZlIGV2ZXJ5IHJldGlyZWQgc291cmNlIGFmdGVyIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5LiBUaGlzIG1pZ3JhdGlvblxuICogY3JlYXRlcyBkZXRlcm1pbmlzdGljIHRvbWJzdG9uZXMgYnV0IGlzIG5vdCBhIHBsYXllciBjb21tYW5kIG9yIHJldmlzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJldGlyZVN0b25lRW50aXRpZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZSBvZiBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldKSB7XG4gICAgaWYgKCFpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSkgY29udGludWU7XG4gICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGUuaWQpO1xuICAgIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGUuaWQpO1xuICAgIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICAgIGlmICghd29ybGQuZW50aXR5Q2h1bmtzLmhhcyhlLmNodW5rKSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgZm9yIChjb25zdCBba2V5LCBpZHNdIG9mIHdvcmxkLmVudGl0eUNodW5rcykge1xuICAgIGNvbnN0IGFjdGl2ZSA9IGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKTtcbiAgICBpZiAoYWN0aXZlLmxlbmd0aCA+IDAgfHwgd29ybGQuZW50aXR5Q2hhbmdlcy5oYXMoa2V5KSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGFjdGl2ZSk7XG4gICAgZWxzZSB3b3JsZC5lbnRpdHlDaHVua3MuZGVsZXRlKGtleSk7XG4gIH1cbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBlcnNpc3RlbmNlIC8gYXV0aG9yaXR5IGJvdW5kYXJ5IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNYW5pZmVzdCB7XG4gIHNjaGVtYTogMTtcbiAgc2VlZDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBwYXJhbXNIYXNoOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGZudjFhKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoID0gMHg4MTFjOWRjNTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgaCBePSB0ZXh0LmNoYXJDb2RlQXQoaSk7XG4gICAgaCA9IE1hdGguaW11bChoLCAweDAxMDAwMTkzKTtcbiAgfVxuICByZXR1cm4gKGggPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ybGRNYW5pZmVzdCh3b3JsZDogV29ybGQpOiBXb3JsZE1hbmlmZXN0IHtcbiAgY29uc3QgcCA9IHdvcmxkLnBhcmFtcztcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAgc2VlZDogd29ybGQuc2VlZCxcbiAgICBnZW5lcmF0b3JWZXJzaW9uOiBwLmdlbmVyYXRvclZlcnNpb24sXG4gICAgc2l6ZTogcC5zaXplLFxuICAgIGNodW5rU2l6ZTogcC5jaHVua1NpemUsXG4gICAgeU1pbjogcC55TWluLFxuICAgIHlNYXg6IHAueU1heCxcbiAgICBzZWFMZXZlbDogcC5zZWFMZXZlbCxcbiAgICBwYXJhbXNIYXNoOiBmbnYxYShKU09OLnN0cmluZ2lmeShwKSksXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxFZGl0IHsgaTogbnVtYmVyOyBtOiBudW1iZXI7IH1cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIHNjaGVtYTogMTtcbiAga2V5OiBzdHJpbmc7XG4gIGJhc2VWZXJzaW9uOiBudW1iZXI7XG4gIGVkaXRzOiBWb3hlbEVkaXRbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cG9ydENodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IENodW5rRGVsdGEge1xuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBrZXksXG4gICAgYmFzZVZlcnNpb246IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIGVkaXRzOiBlZGl0cyA/IFsuLi5lZGl0cy5lbnRyaWVzKCldLm1hcCgoW2ksIG1dKSA9PiAoeyBpLCBtIH0pKS5zb3J0KChhLCBiKSA9PiBhLmkgLSBiLmkpIDogW10sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBkZWx0YTogQ2h1bmtEZWx0YSk6IHZvaWQge1xuICBjb25zdCBbY3gsIGN6XSA9IGRlbHRhLmtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICBmb3IgKGNvbnN0IGUgb2YgZGVsdGEuZWRpdHMpIHtcbiAgICBjb25zdCB5SW5kZXggPSBNYXRoLmZsb29yKGUuaSAvIENIVU5LX0FSRUEpO1xuICAgIGNvbnN0IHJlbSA9IGUuaSAlIENIVU5LX0FSRUE7XG4gICAgY29uc3QgbHogPSBNYXRoLmZsb29yKHJlbSAvIENIVU5LX1NJWkUpO1xuICAgIGNvbnN0IGx4ID0gcmVtICUgQ0hVTktfU0laRTtcbiAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4O1xuICAgIGNvbnN0IHkgPSBZX01JTiArIHlJbmRleDtcbiAgICBjb25zdCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgIHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBlLm0gYXMgTWF0SWQpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gdGltZSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFRpbWVTdGF0ZSB7IHQ6IG51bWJlcjsgZGF5TGVuZ3RoU2VjOiBudW1iZXI7IHBhdXNlZDogYm9vbGVhbjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpbWUoczogVGltZVN0YXRlLCBkdDogbnVtYmVyKTogdm9pZCB7XG4gIGlmIChzLnBhdXNlZCkgcmV0dXJuO1xuICBzLnQgPSAocy50ICsgZHQgLyBzLmRheUxlbmd0aFNlYykgJSAxO1xufVxuIiwgIi8vIEZhdW5hIFx1MjAxNCBzcGVjaWVzLCBoYWJpdGF0LCBkZXRlcm1pbmlzdGljIHNwYXduaW5nIGFuZCBiZWhhdmlvdXIgKHB1cmUgVFMsIEQtMDA1KS5cbi8vXG4vLyBPbmUgYXJjaGl0ZWN0dXJlIGZvciBldmVyeSBjcmVhdHVyZSB0aWVyOlxuLy8gICAnYW1iaWVudCcgICAgICAgXHUyMDE0IGxpdmluZyBzY2VuZXJ5LiBTcGF3bmVkIGRldGVybWluaXN0aWNhbGx5IHBlciBjaHVuayBmcm9tXG4vLyAgICAgICAgICAgICAgICAgICAgIChzZWVkLCBnZW5lcmF0b3IsIGNodW5rKTsgbm90IHNhdmVkLCByZS1jcmVhdGVkIHdoZW4gYVxuLy8gICAgICAgICAgICAgICAgICAgICBjaHVuayBsb2Fkcy4gVGhpcyBpcyB0aGUgdGllciBpbXBsZW1lbnRlZCB0b2RheS5cbi8vICAgJ2F1dGhvcml0YXRpdmUnIFx1MjAxNCBhIGNyZWF0dXJlIHRoZSBlY29ub215IGNhcmVzIGFib3V0IChodW50ZWQsIGNhdWdodCxcbi8vICAgICAgICAgICAgICAgICAgICAgdGFtZWQsIGJyZWQsIHRyYWRlZCkuIFNhbWUgcmVjb3JkIHNoYXBlLCBidXQgc3RvcmVkIGluIHRoZVxuLy8gICAgICAgICAgICAgICAgICAgICB3b3JsZCBzbmFwc2hvdCBhbmQgY2hhbmdlZCBvbmx5IGJ5IGpvdXJuYWxlZCBjb21tYW5kcy5cbi8vIFByb21vdGlvbiBrZWVwcyB0aGUgcmVjb3JkIGlkLCBzcGVjaWVzIGFuZCBwb3NpdGlvbiwgc28gYSBodW50ZWQgZGVlciBpcyB0aGVcbi8vIHNhbWUgZGVlciB0aGUgcGxheWVyIHdhdGNoZWQgZ3JhemUuIE5vdGhpbmcgaGVyZSBpbXBvcnRzIHRocmVlLmpzLlxuLy9cbi8vIEJlaGF2aW91ciB1c2VzIHJlc2lkZW50LW9ubHkgdGVycmFpbiBxdWVyaWVzLCBzbyBjcmVhdHVyZXMgbmV2ZXIgZ2VuZXJhdGVcbi8vIGNodW5rczsgdGhleSB0dXJuIGJhY2sgYXQgdGhlIGVkZ2Ugb2YgdGhlIGxvYWRlZCB3b3JsZC5cbmltcG9ydCB7XG4gIFdvcmxkLCBNQVQsIHJlc2lkZW50U3VyZmFjZUF0LCByZXNpZGVudFZveGVsQXQsIGNodW5rS2V5LCBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWixcbiAgQ0hVTktfU0laRSwgaHlkcm9sb2d5Rm9yLCBpc1JldGlyZWRTdG9uZUtpbmQsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgaGFzaDJpLCBtdWxiZXJyeTMyIH0gZnJvbSAnLi9ub2lzZSc7XG5cbmV4cG9ydCB0eXBlIEhhYml0YXQgPSAnbWVhZG93JyB8ICdmb3Jlc3RfZWRnZScgfCAnd2F0ZXInO1xuZXhwb3J0IHR5cGUgQ3JlYXR1cmVUaWVyID0gJ2FtYmllbnQnIHwgJ2F1dGhvcml0YXRpdmUnO1xuZXhwb3J0IHR5cGUgQmVoYXZpb3VyID0gJ2lkbGUnIHwgJ2dyYXplJyB8ICd3YW5kZXInIHwgJ2ZsZWUnIHwgJ3Jlc3QnIHwgJ3NsZWVwJyB8ICdzd2ltJyB8ICdzY2F0dGVyJyB8ICdzdGFsaycgfCAnY2hhc2UnIHwgJ2ZvbGxvdyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3BlY2llc0RlZiB7XG4gIGlkOiAnZGVlcicgfCAncmFiYml0JyB8ICd0cm91dCcgfCAnZm94JyB8ICd3b2xmJztcbiAgLyoqIFNwZWNpZXMgdGhpcyBvbmUgZmxlZXMgZnJvbSB3aGVuIHRoZXkgY29tZSBjbG9zZS4gKi9cbiAgZmVhcnNTcGVjaWVzPzogUmVhZG9ubHlBcnJheTxTcGVjaWVzRGVmWydpZCddPjtcbiAgbGFiZWw6IHN0cmluZztcbiAgaGFiaXRhdDogSGFiaXRhdDtcbiAgLyoqIEJvZHkgbGVuZ3RoIChtKSwgdXNlZCBieSByZW5kZXJpbmcgYW5kIGNvbGxpc2lvbi4gKi9cbiAgbGVuZ3RoOiBudW1iZXI7XG4gIHdhbGtTcGVlZDogbnVtYmVyO1xuICBmbGVlU3BlZWQ6IG51bWJlcjtcbiAgLyoqIERpc3RhbmNlIGF0IHdoaWNoIHRoZSBzcGVjaWVzIG5vdGljZXMgYSBwZXJzb24gYW5kIGZsZWVzLiAqL1xuICB3YXJpbmVzczogbnVtYmVyO1xuICBncm91cE1pbjogbnVtYmVyO1xuICBncm91cE1heDogbnVtYmVyO1xuICAvKiogSG9tZSByYW5nZSByYWRpdXMgYXJvdW5kIHRoZSBzcGF3biBwb2ludCAobSkuICovXG4gIHJhbmdlOiBudW1iZXI7XG4gIC8qKiBSZXNvdXJjZSBhbmQgYW1vdW50IGEgZnV0dXJlIGh1bnRpbmcvZmlzaGluZyBjb21tYW5kIHdvdWxkIHlpZWxkLiAqL1xuICB5aWVsZHM6IFBhcnRpYWw8UmVjb3JkPCdmb29kJyB8ICdoaWRlJyB8ICdmaWJlcicsIG51bWJlcj4+O1xuICBkaXVybmFsOiBib29sZWFuO1xufVxuXG5leHBvcnQgY29uc3QgU1BFQ0lFUzogUmVjb3JkPFNwZWNpZXNEZWZbJ2lkJ10sIFNwZWNpZXNEZWY+ID0ge1xuICBkZWVyOiB7XG4gICAgaWQ6ICdkZWVyJywgbGFiZWw6ICdSZWQgZGVlcicsIGhhYml0YXQ6ICdmb3Jlc3RfZWRnZScsIGxlbmd0aDogMS43LCB3YWxrU3BlZWQ6IDEuMiwgZmxlZVNwZWVkOiA4LjUsXG4gICAgd2FyaW5lc3M6IDE0LCBncm91cE1pbjogMiwgZ3JvdXBNYXg6IDQsIHJhbmdlOiAyOCwgeWllbGRzOiB7IGZvb2Q6IDEyLCBoaWRlOiAyIH0sIGRpdXJuYWw6IHRydWUsXG4gIH0sXG4gIHJhYmJpdDoge1xuICAgIGlkOiAncmFiYml0JywgbGFiZWw6ICdIYXJlJywgaGFiaXRhdDogJ21lYWRvdycsIGxlbmd0aDogMC40NSwgd2Fsa1NwZWVkOiAwLjksIGZsZWVTcGVlZDogNi41LFxuICAgIHdhcmluZXNzOiA2LCBncm91cE1pbjogMSwgZ3JvdXBNYXg6IDMsIHJhbmdlOiAxNCwgeWllbGRzOiB7IGZvb2Q6IDIsIGhpZGU6IDEgfSwgZGl1cm5hbDogdHJ1ZSxcbiAgfSxcbiAgdHJvdXQ6IHtcbiAgICBpZDogJ3Ryb3V0JywgbGFiZWw6ICdCcm93biB0cm91dCcsIGhhYml0YXQ6ICd3YXRlcicsIGxlbmd0aDogMC40LCB3YWxrU3BlZWQ6IDAuNiwgZmxlZVNwZWVkOiAzLjUsXG4gICAgd2FyaW5lc3M6IDMuNSwgZ3JvdXBNaW46IDQsIGdyb3VwTWF4OiA3LCByYW5nZTogMTAsIHlpZWxkczogeyBmb29kOiAyIH0sIGRpdXJuYWw6IGZhbHNlLFxuICB9LFxuICBmb3g6IHtcbiAgICBpZDogJ2ZveCcsIGxhYmVsOiAnUmVkIGZveCcsIGhhYml0YXQ6ICdmb3Jlc3RfZWRnZScsIGxlbmd0aDogMC45NSwgd2Fsa1NwZWVkOiAxLjUsIGZsZWVTcGVlZDogNyxcbiAgICB3YXJpbmVzczogMTEsIGdyb3VwTWluOiAxLCBncm91cE1heDogMSwgcmFuZ2U6IDMwLCB5aWVsZHM6IHsgZm9vZDogMywgaGlkZTogMSB9LCBkaXVybmFsOiBmYWxzZSxcbiAgICBmZWFyc1NwZWNpZXM6IFsnd29sZiddLFxuICB9LFxuICB3b2xmOiB7XG4gICAgaWQ6ICd3b2xmJywgbGFiZWw6ICdHcmV5IHdvbGYnLCBoYWJpdGF0OiAnZm9yZXN0X2VkZ2UnLCBsZW5ndGg6IDEuMywgd2Fsa1NwZWVkOiAxLjgsIGZsZWVTcGVlZDogOCxcbiAgICB3YXJpbmVzczogMjAsIGdyb3VwTWluOiAyLCBncm91cE1heDogNCwgcmFuZ2U6IDQwLCB5aWVsZHM6IHsgZm9vZDogOCwgaGlkZTogMiB9LCBkaXVybmFsOiBmYWxzZSxcbiAgfSxcbn07XG4vKiogV2hvIGZsZWVzIHdob20gKHdpbGRsaWZlIG9ubHk7IGxpdmVzdG9jayBlbmNsb3N1cmVzIGFyZSBub3QgcGFydCBvZiB0aGlzIGFtYmllbnQgdGllcikuICovXG5jb25zdCBGRUFSUzogUGFydGlhbDxSZWNvcmQ8U3BlY2llc0RlZlsnaWQnXSwgUmVhZG9ubHlBcnJheTxTcGVjaWVzRGVmWydpZCddPj4+ID0ge1xuICByYWJiaXQ6IFsnZm94JywgJ3dvbGYnXSwgZGVlcjogWyd3b2xmJ10sIGZveDogWyd3b2xmJ10sXG59O1xuLyoqIEhvdyBjbG9zZSBhIHByZWRhdG9yIG11c3QgYmUgYmVmb3JlIGl0cyBwcmV5IGJvbHRzIChtZXRyZXMpLiAqL1xuY29uc3QgUFJFREFUT1JfQUxBUk0gPSA5O1xuXG5leHBvcnQgaW50ZXJmYWNlIENyZWF0dXJlIHtcbiAgLyoqIFN0YWJsZSwgZGV0ZXJtaW5pc3RpYyBpZDogZmF1bmE6PHNwZWNpZXM+OjxjaHVuaz46PGluZGV4Pi4gKi9cbiAgaWQ6IHN0cmluZztcbiAgc3BlY2llczogU3BlY2llc0RlZlsnaWQnXTtcbiAgdGllcjogQ3JlYXR1cmVUaWVyO1xuICBjaHVuazogc3RyaW5nO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBoZWFkaW5nOiBudW1iZXI7XG4gIGhvbWVYOiBudW1iZXI7XG4gIGhvbWVaOiBudW1iZXI7XG4gIGJlaGF2aW91cjogQmVoYXZpb3VyO1xuICAvKiogU2Vjb25kcyBsZWZ0IGluIHRoZSBjdXJyZW50IGJlaGF2aW91ci4gKi9cbiAgdGltZXI6IG51bWJlcjtcbiAgZ29hbFg6IG51bWJlcjtcbiAgZ29hbFo6IG51bWJlcjtcbiAgLyoqIEZpc2ggb25seTogcHJlZmVycmVkIGRlcHRoIGZyYWN0aW9uICgwID0gc3VyZmFjZSwgMSA9IGJlZCkuICovXG4gIGRlcHRoUHJlZjogbnVtYmVyO1xuICBzcGVlZDogbnVtYmVyO1xuICAvKiogRGV0ZXJtaW5pc3RpYyBwZXItY3JlYXR1cmUgcmFuZG9tIHN0cmVhbSBzdGF0ZS4gKi9cbiAgcm5nOiBudW1iZXI7XG4gIC8qKiBQYWNrIG1lbWJlcnMgZm9sbG93IHRoaXMgY3JlYXR1cmUgKHdvbHZlcykuICovXG4gIGxlYWRlcj86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGYXVuYUNvbnRleHQge1xuICAvKiogUG9zaXRpb25zIG9mIHBlb3BsZSAocGxheWVyIGNoYXJhY3RlciwgbGF0ZXIgdmlsbGFnZXJzKS4gKi9cbiAgdGhyZWF0czogUmVhZG9ubHlBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyOyBpbldhdGVyPzogYm9vbGVhbiB9PjtcbiAgbmlnaHQ6IGJvb2xlYW47XG4gIC8qKiBFdmVyeSBwcmVkYXRvciBpbiB0aGUgbG9hZGVkIGFyZWEsIGZvciBwcmV5IHRvIGZsZWUgZnJvbS4gKi9cbiAgcHJlZGF0b3JzPzogUmVhZG9ubHlBcnJheTx7IHNwZWNpZXM6IFNwZWNpZXNEZWZbJ2lkJ107IHg6IG51bWJlcjsgejogbnVtYmVyIH0+O1xuICAvKiogSGFyZXMgaW4gdGhlIGxvYWRlZCBhcmVhLCBmb3IgZm94ZXMgdG8gc3RhbGsuICovXG4gIHByZXk/OiBSZWFkb25seUFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT47XG4gIC8qKiBQYWNrIGxlYWRlcnMgYnkgaWQsIGZvciB3b2x2ZXMgdG8gZm9sbG93LiAqL1xuICBsZWFkZXJzPzogUmVhZG9ubHlNYXA8c3RyaW5nLCBDcmVhdHVyZT47XG59XG5cbmV4cG9ydCBjb25zdCBGQVVOQV9TVEVQID0gMC4xO1xuXG5mdW5jdGlvbiByYW5kKGM6IENyZWF0dXJlKTogbnVtYmVyIHtcbiAgYy5ybmcgPSAoYy5ybmcgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgbGV0IHQgPSBjLnJuZztcbiAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgdCB8IDYxKTtcbiAgcmV0dXJuICgodCBeICh0ID4+PiAxNCkpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbi8qKiBUb3Agb2Ygc3RhbmRpbmcgd2F0ZXIgb24gYSByZXNpZGVudCBjb2x1bW4sIG9yIG51bGwgaWYgZHJ5IG9yIHVubG9hZGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50V2F0ZXJBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogeyBiZWQ6IG51bWJlcjsgdG9wOiBudW1iZXIgfSB8IG51bGwge1xuICBjb25zdCBiZWQgPSByZXNpZGVudFN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmIChiZWQgPT09IG51bGwpIHJldHVybiBudWxsO1xuICBsZXQgeSA9IGJlZDtcbiAgd2hpbGUgKHkgPCBiZWQgKyAyNCAmJiByZXNpZGVudFZveGVsQXQod29ybGQsIHgsIHksIHopID09PSBNQVQuV0FURVIpIHkrKztcbiAgcmV0dXJuIHkgPiBiZWQgPyB7IGJlZCwgdG9wOiB5IH0gOiBudWxsO1xufVxuXG5mdW5jdGlvbiBsYW5kT2sod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgbWF4U2xvcGUgPSAxKTogbnVtYmVyIHwgbnVsbCB7XG4gIGNvbnN0IGZ4ID0gTWF0aC5mbG9vcih4KSwgZnogPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCBoID0gcmVzaWRlbnRTdXJmYWNlQXQod29ybGQsIGZ4LCBmeik7XG4gIGlmIChoID09PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgdG9wID0gcmVzaWRlbnRWb3hlbEF0KHdvcmxkLCBmeCwgaCAtIDEsIGZ6KTtcbiAgaWYgKHRvcCAhPT0gTUFULkdSQVNTICYmIHRvcCAhPT0gTUFULlNPSUwgJiYgdG9wICE9PSBNQVQuTU9TUykgcmV0dXJuIG51bGw7XG4gIGlmIChyZXNpZGVudFZveGVsQXQod29ybGQsIGZ4LCBoLCBmeikgIT09IE1BVC5BSVIpIHJldHVybiBudWxsO1xuICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIFtbMSwgMF0sIFstMSwgMF0sIFswLCAxXSwgWzAsIC0xXV0pIHtcbiAgICBjb25zdCBuID0gcmVzaWRlbnRTdXJmYWNlQXQod29ybGQsIGZ4ICsgZHgsIGZ6ICsgZHopO1xuICAgIGlmIChuID09PSBudWxsIHx8IE1hdGguYWJzKG4gLSBoKSA+IG1heFNsb3BlKSByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gaDtcbn1cblxuLyoqXG4gKiBEZXRlcm1pbmlzdGljIGFtYmllbnQgc3Bhd24gZm9yIG9uZSByZXNpZGVudCBjaHVuay4gUHVyZSBmdW5jdGlvbiBvZiB0aGVcbiAqIHdvcmxkJ3Mgc2VlZCwgZ2VuZXJhdG9yIGFuZCB0aGUgY2h1bmsncyBnZW5lcmF0ZWQgdGVycmFpbiBhbmQgdHJlZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzcGF3bkNodW5rRmF1bmEod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQ3JlYXR1cmVbXSB7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGlmICghd29ybGQuY2h1bmtzLmhhcyhrZXkpKSByZXR1cm4gW107XG4gIGNvbnN0IHNlZWQgPSB3b3JsZC5zZWVkO1xuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChoYXNoMmkoY3gsIGN6LCBzZWVkICsgNzc3MSkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBjb25zdCBvdXQ6IENyZWF0dXJlW10gPSBbXTtcbiAgbGV0IGluZGV4ID0gMDtcblxuICBsZXQgdHJlZXMgPSAwO1xuICBmb3IgKGNvbnN0IGlkIG9mIHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXSkge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmIChlICYmICFlLmhhcnZlc3RlZCAmJiAhaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZV8nKSkgdHJlZXMrKztcbiAgfVxuICBsZXQgd2F0ZXIgPSAwLCB3eCA9IDAsIHd6ID0gMDtcbiAgY29uc3QgZ3Jhc3M6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgZm9yIChsZXQgbHogPSAyOyBseiA8IENIVU5LX1NJWkU7IGx6ICs9IDQpIHtcbiAgICBmb3IgKGxldCBseCA9IDI7IGx4IDwgQ0hVTktfU0laRTsgbHggKz0gNCkge1xuICAgICAgY29uc3QgeCA9IG94ICsgbHgsIHogPSBveiArIGx6O1xuICAgICAgY29uc3QgdyA9IHJlc2lkZW50V2F0ZXJBdCh3b3JsZCwgeCwgeik7XG4gICAgICBpZiAodyAmJiB3LnRvcCAtIHcuYmVkID49IDEuMikgeyB3YXRlcisrOyB3eCArPSB4OyB3eiArPSB6OyB9XG4gICAgICBlbHNlIGlmIChsYW5kT2sod29ybGQsIHgsIHopICE9PSBudWxsKSBncmFzcy5wdXNoKHsgeCwgeiB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBtYWtlID0gKHNwZWNpZXM6IFNwZWNpZXNEZWZbJ2lkJ10sIHg6IG51bWJlciwgejogbnVtYmVyLCB5OiBudW1iZXIpOiBDcmVhdHVyZSA9PiB7XG4gICAgY29uc3QgYzogQ3JlYXR1cmUgPSB7XG4gICAgICBpZDogYGZhdW5hOiR7c3BlY2llc306JHtrZXl9OiR7aW5kZXgrK31gLCBzcGVjaWVzLCB0aWVyOiAnYW1iaWVudCcsIGNodW5rOiBrZXksXG4gICAgICB4LCB5LCB6LCBoZWFkaW5nOiBybmQoKSAqIE1hdGguUEkgKiAyLCBob21lWDogeCwgaG9tZVo6IHosXG4gICAgICBiZWhhdmlvdXI6IHNwZWNpZXMgPT09ICd0cm91dCcgPyAnc3dpbScgOiAnZ3JhemUnLCB0aW1lcjogMSArIHJuZCgpICogNCxcbiAgICAgIGdvYWxYOiB4LCBnb2FsWjogeiwgZGVwdGhQcmVmOiAwLjMgKyBybmQoKSAqIDAuNSwgc3BlZWQ6IDAsXG4gICAgICBybmc6IChybmQoKSAqIDQyOTQ5NjcyOTYpID4+PiAwLFxuICAgIH07XG4gICAgcmV0dXJuIGM7XG4gIH07XG5cbiAgLy8gRmlzaCBzY2hvb2xzIGluIGRlZXAgZW5vdWdoIHdhdGVyLlxuICBpZiAod2F0ZXIgPj0gOCAmJiBybmQoKSA8IDAuNykge1xuICAgIGNvbnN0IGN4dyA9IHd4IC8gd2F0ZXIsIGN6dyA9IHd6IC8gd2F0ZXI7XG4gICAgY29uc3QgbiA9IFNQRUNJRVMudHJvdXQuZ3JvdXBNaW4gKyBNYXRoLmZsb29yKHJuZCgpICogKFNQRUNJRVMudHJvdXQuZ3JvdXBNYXggLSBTUEVDSUVTLnRyb3V0Lmdyb3VwTWluICsgMSkpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICBjb25zdCB4ID0gY3h3ICsgKHJuZCgpIC0gMC41KSAqIDQsIHogPSBjencgKyAocm5kKCkgLSAwLjUpICogNDtcbiAgICAgIGNvbnN0IHcgPSByZXNpZGVudFdhdGVyQXQod29ybGQsIE1hdGguZmxvb3IoeCksIE1hdGguZmxvb3IoeikpO1xuICAgICAgaWYgKCF3IHx8IHcudG9wIC0gdy5iZWQgPCAxKSBjb250aW51ZTtcbiAgICAgIG91dC5wdXNoKG1ha2UoJ3Ryb3V0JywgeCwgeiwgdy5iZWQgKyAody50b3AgLSB3LmJlZCkgKiAwLjUpKTtcbiAgICB9XG4gIH1cbiAgLy8gRGVlciBhdCBmb3Jlc3QgZWRnZXMsIGhhcmVzIGluIG9wZW4gbWVhZG93LlxuICBpZiAoZ3Jhc3MubGVuZ3RoID49IDYpIHtcbiAgICBjb25zdCBzcGVjaWVzOiBTcGVjaWVzRGVmWydpZCddIHwgbnVsbCA9IHRyZWVzID49IDMgJiYgcm5kKCkgPCAwLjQyID8gJ2RlZXInXG4gICAgICA6IHRyZWVzIDw9IDIgJiYgcm5kKCkgPCAwLjQ1ID8gJ3JhYmJpdCcgOiBudWxsO1xuICAgIGlmIChzcGVjaWVzKSB7XG4gICAgICBjb25zdCBkZWYgPSBTUEVDSUVTW3NwZWNpZXNdO1xuICAgICAgY29uc3QgYXQgPSBncmFzc1tNYXRoLmZsb29yKHJuZCgpICogZ3Jhc3MubGVuZ3RoKV07XG4gICAgICBjb25zdCBuID0gZGVmLmdyb3VwTWluICsgTWF0aC5mbG9vcihybmQoKSAqIChkZWYuZ3JvdXBNYXggLSBkZWYuZ3JvdXBNaW4gKyAxKSk7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICBjb25zdCB4ID0gYXQueCArIDAuNSArIChybmQoKSAtIDAuNSkgKiA2LCB6ID0gYXQueiArIDAuNSArIChybmQoKSAtIDAuNSkgKiA2O1xuICAgICAgICBjb25zdCBoID0gbGFuZE9rKHdvcmxkLCB4LCB6KTtcbiAgICAgICAgaWYgKGggIT09IG51bGwpIG91dC5wdXNoKG1ha2Uoc3BlY2llcywgeCwgeiwgaCkpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICAvLyBQcmVkYXRvcnMgdXNlIHRoZWlyIG93biByYW5kb20gc3RyZWFtLCBzbyBhZGRpbmcgdGhlbSBuZXZlciBtb3ZlcyB0aGVcbiAgLy8gZXhpc3RpbmcgZGVlciwgaGFyZXMgYW5kIGZpc2guXG4gIGlmIChncmFzcy5sZW5ndGggPj0gNCkge1xuICAgIGNvbnN0IHIyID0gbXVsYmVycnkzMigoaGFzaDJpKGN4LCBjeiwgc2VlZCArIDc3NzIpICogNDI5NDk2NzI5NikgPj4+IDApO1xuICAgIGNvbnN0IGtpbmQ6ICd3b2xmJyB8ICdmb3gnIHwgbnVsbCA9IHRyZWVzID49IDYgJiYgcjIoKSA8IDAuMTYgPyAnd29sZicgOiB0cmVlcyA+PSAyICYmIHRyZWVzIDw9IDUgJiYgcjIoKSA8IDAuMjYgPyAnZm94JyA6IG51bGw7XG4gICAgaWYgKGtpbmQpIHtcbiAgICAgIGNvbnN0IGRlZiA9IFNQRUNJRVNba2luZF07XG4gICAgICBjb25zdCBhdCA9IGdyYXNzW01hdGguZmxvb3IocjIoKSAqIGdyYXNzLmxlbmd0aCldO1xuICAgICAgY29uc3QgbiA9IGRlZi5ncm91cE1pbiArIE1hdGguZmxvb3IocjIoKSAqIChkZWYuZ3JvdXBNYXggLSBkZWYuZ3JvdXBNaW4gKyAxKSk7XG4gICAgICBsZXQgbGVhZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICBjb25zdCB4ID0gYXQueCArIDAuNSArIChyMigpIC0gMC41KSAqIDQsIHogPSBhdC56ICsgMC41ICsgKHIyKCkgLSAwLjUpICogNDtcbiAgICAgICAgY29uc3QgaCA9IGxhbmRPayh3b3JsZCwgeCwgeik7XG4gICAgICAgIGlmIChoID09PSBudWxsKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgYzogQ3JlYXR1cmUgPSB7XG4gICAgICAgICAgaWQ6IGBmYXVuYToke2tpbmR9OiR7a2V5fToke2luZGV4Kyt9YCwgc3BlY2llczoga2luZCwgdGllcjogJ2FtYmllbnQnLCBjaHVuazoga2V5LFxuICAgICAgICAgIHgsIHk6IGgsIHosIGhlYWRpbmc6IHIyKCkgKiBNYXRoLlBJICogMiwgaG9tZVg6IHgsIGhvbWVaOiB6LCBiZWhhdmlvdXI6ICdyZXN0JywgdGltZXI6IDIgKyByMigpICogNSxcbiAgICAgICAgICBnb2FsWDogeCwgZ29hbFo6IHosIGRlcHRoUHJlZjogMCwgc3BlZWQ6IDAsIHJuZzogKHIyKCkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGtpbmQgPT09ICd3b2xmJykgeyBpZiAobGVhZGVyKSBjLmxlYWRlciA9IGxlYWRlcjsgZWxzZSBsZWFkZXIgPSBjLmlkOyB9XG4gICAgICAgIG91dC5wdXNoKGMpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBuZWFyZXN0VGhyZWF0KGM6IENyZWF0dXJlLCBjdHg6IEZhdW5hQ29udGV4dCk6IHsgZDogbnVtYmVyOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcHJlZGF0b3I/OiBib29sZWFuIH0gfCBudWxsIHtcbiAgbGV0IGJlc3Q6IHsgZDogbnVtYmVyOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcHJlZGF0b3I/OiBib29sZWFuIH0gfCBudWxsID0gbnVsbDtcbiAgZm9yIChjb25zdCB0IG9mIGN0eC50aHJlYXRzKSB7XG4gICAgY29uc3QgZCA9IE1hdGguaHlwb3QodC54IC0gYy54LCB0LnogLSBjLnopO1xuICAgIGlmICghYmVzdCB8fCBkIDwgYmVzdC5kKSBiZXN0ID0geyBkLCB4OiB0LngsIHo6IHQueiB9O1xuICB9XG4gIC8vIFByZXkgYm9sdCBmcm9tIHRoZSBwcmVkYXRvcnMgdGhhdCBodW50IHRoZW0sIGF0IHRoZWlyIG93biAoc2hvcnRlcikgYWxhcm0gZGlzdGFuY2UuXG4gIGNvbnN0IGZlYXJzID0gRkVBUlNbYy5zcGVjaWVzXTtcbiAgaWYgKGZlYXJzICYmIGN0eC5wcmVkYXRvcnMpIHtcbiAgICBmb3IgKGNvbnN0IHAgb2YgY3R4LnByZWRhdG9ycykge1xuICAgICAgaWYgKCFmZWFycy5pbmNsdWRlcyhwLnNwZWNpZXMpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGQgPSBNYXRoLmh5cG90KHAueCAtIGMueCwgcC56IC0gYy56KTtcbiAgICAgIC8vIFNjYWxlIHNvIHRoZSBjYWxsZXIncyBgZCA8IHdhcmluZXNzYCB0ZXN0IGZpcmVzIGF0IFBSRURBVE9SX0FMQVJNLlxuICAgICAgY29uc3Qgc2NhbGVkID0gZCAqIChTUEVDSUVTW2Muc3BlY2llc10ud2FyaW5lc3MgLyBQUkVEQVRPUl9BTEFSTSk7XG4gICAgICBpZiAoZCA8IFBSRURBVE9SX0FMQVJNICYmICghYmVzdCB8fCBzY2FsZWQgPCBiZXN0LmQpKSBiZXN0ID0geyBkOiBzY2FsZWQsIHg6IHAueCwgejogcC56LCBwcmVkYXRvcjogdHJ1ZSB9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuLyoqIEFkdmFuY2Ugb25lIGNyZWF0dXJlIGJ5IEZBVU5BX1NURVAuIERldGVybWluaXN0aWMgZ2l2ZW4gKHdvcmxkLCBjcmVhdHVyZSwgY29udGV4dCkuICovXG5leHBvcnQgZnVuY3Rpb24gc3RlcENyZWF0dXJlKHdvcmxkOiBXb3JsZCwgYzogQ3JlYXR1cmUsIGN0eDogRmF1bmFDb250ZXh0KTogdm9pZCB7XG4gIGNvbnN0IGRlZiA9IFNQRUNJRVNbYy5zcGVjaWVzXTtcbiAgY29uc3QgZHQgPSBGQVVOQV9TVEVQO1xuICBjb25zdCB0aHJlYXQgPSBuZWFyZXN0VGhyZWF0KGMsIGN0eCk7XG4gIGMudGltZXIgLT0gZHQ7XG5cbiAgaWYgKGRlZi5oYWJpdGF0ID09PSAnd2F0ZXInKSB7IHN0ZXBGaXNoKHdvcmxkLCBjLCBkZWYsIGN0eCwgdGhyZWF0KTsgcmV0dXJuOyB9XG5cbiAgLy8gRm94ZXMgc3RhbGsgaGFyZXMgYW5kIHBvdW5jZTsgYSBtaXNzIGVuZHMgaW4gYSByZXN0LlxuICBpZiAoYy5zcGVjaWVzID09PSAnZm94JykgZm94SHVudChjLCBkZWYsIGN0eCwgdGhyZWF0KTtcblxuICAvLyBEZWNpZGUuXG4gIGlmICh0aHJlYXQgJiYgdGhyZWF0LmQgPCBkZWYud2FyaW5lc3MgJiYgYy5iZWhhdmlvdXIgIT09ICdmbGVlJykge1xuICAgIGMuYmVoYXZpb3VyID0gJ2ZsZWUnO1xuICAgIGMudGltZXIgPSAyLjUgKyByYW5kKGMpICogMjtcbiAgfSBlbHNlIGlmIChjLmJlaGF2aW91ciA9PT0gJ3N0YWxrJyB8fCBjLmJlaGF2aW91ciA9PT0gJ2NoYXNlJykge1xuICAgIC8vIGhhbmRsZWQgYnkgZm94SHVudFxuICB9IGVsc2UgaWYgKGMubGVhZGVyICYmIGN0eC5sZWFkZXJzPy5oYXMoYy5sZWFkZXIpKSB7XG4gICAgcGFja0ZvbGxvdyhjLCBkZWYsIGN0eC5sZWFkZXJzLmdldChjLmxlYWRlcikhKTtcbiAgfSBlbHNlIGlmIChjLnRpbWVyIDw9IDApIHtcbiAgICBjb25zdCBzbGVlcHkgPSBkZWYuZGl1cm5hbCAmJiBjdHgubmlnaHQ7XG4gICAgY29uc3QgciA9IHJhbmQoYyk7XG4gICAgaWYgKHNsZWVweSkgeyBjLmJlaGF2aW91ciA9ICdzbGVlcCc7IGMudGltZXIgPSA4ICsgciAqIDEwOyB9XG4gICAgZWxzZSBpZiAociA8IDAuNDUpIHsgYy5iZWhhdmlvdXIgPSAnZ3JhemUnOyBjLnRpbWVyID0gMyArIHJhbmQoYykgKiA1OyB9XG4gICAgZWxzZSBpZiAociA8IDAuNjIpIHsgYy5iZWhhdmlvdXIgPSAncmVzdCc7IGMudGltZXIgPSA0ICsgcmFuZChjKSAqIDY7IH1cbiAgICBlbHNlIHtcbiAgICAgIGMuYmVoYXZpb3VyID0gJ3dhbmRlcic7XG4gICAgICBjLnRpbWVyID0gNjtcbiAgICAgIGNvbnN0IGEgPSByYW5kKGMpICogTWF0aC5QSSAqIDIsIGQgPSByYW5kKGMpICogZGVmLnJhbmdlO1xuICAgICAgYy5nb2FsWCA9IGMuaG9tZVggKyBNYXRoLmNvcyhhKSAqIGQ7XG4gICAgICBjLmdvYWxaID0gYy5ob21lWiArIE1hdGguc2luKGEpICogZDtcbiAgICB9XG4gIH1cblxuICAvLyBBY3QuXG4gIGxldCB0eCA9IDAsIHR6ID0gMCwgc3BlZWQgPSAwO1xuICBpZiAoYy5iZWhhdmlvdXIgPT09ICdmbGVlJyAmJiB0aHJlYXQpIHtcbiAgICBjb25zdCBkeCA9IGMueCAtIHRocmVhdC54LCBkeiA9IGMueiAtIHRocmVhdC56LCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeikgfHwgMTtcbiAgICB0eCA9IGR4IC8gbGVuOyB0eiA9IGR6IC8gbGVuOyBzcGVlZCA9IGRlZi5mbGVlU3BlZWQ7XG4gICAgaWYgKGMudGltZXIgPD0gMCkgeyBjLmJlaGF2aW91ciA9ICdpZGxlJzsgYy50aW1lciA9IDE7IGMuaG9tZVggPSBjLng7IGMuaG9tZVogPSBjLno7IH1cbiAgfSBlbHNlIGlmIChjLmJlaGF2aW91ciA9PT0gJ3N0YWxrJyB8fCBjLmJlaGF2aW91ciA9PT0gJ2NoYXNlJykge1xuICAgIGNvbnN0IGR4ID0gYy5nb2FsWCAtIGMueCwgZHogPSBjLmdvYWxaIC0gYy56LCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeikgfHwgMTtcbiAgICB0eCA9IGR4IC8gbGVuOyB0eiA9IGR6IC8gbGVuO1xuICAgIHNwZWVkID0gYy5iZWhhdmlvdXIgPT09ICdjaGFzZScgPyBkZWYuZmxlZVNwZWVkICogMC44IDogZGVmLndhbGtTcGVlZCAqIDAuNztcbiAgfSBlbHNlIGlmIChjLmJlaGF2aW91ciA9PT0gJ2ZvbGxvdycpIHtcbiAgICBjb25zdCBkeCA9IGMuZ29hbFggLSBjLngsIGR6ID0gYy5nb2FsWiAtIGMueiwgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gICAgdHggPSBkeCAvIGxlbjsgdHogPSBkeiAvIGxlbjsgc3BlZWQgPSBkZWYud2Fsa1NwZWVkICogMS40O1xuICB9IGVsc2UgaWYgKGMuYmVoYXZpb3VyID09PSAnd2FuZGVyJykge1xuICAgIGNvbnN0IGR4ID0gYy5nb2FsWCAtIGMueCwgZHogPSBjLmdvYWxaIC0gYy56LCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeik7XG4gICAgaWYgKGxlbiA8IDAuNSkgeyBjLmJlaGF2aW91ciA9ICdncmF6ZSc7IGMudGltZXIgPSAyICsgcmFuZChjKSAqIDM7IH1cbiAgICBlbHNlIHsgdHggPSBkeCAvIGxlbjsgdHogPSBkeiAvIGxlbjsgc3BlZWQgPSBkZWYud2Fsa1NwZWVkOyB9XG4gIH0gZWxzZSBpZiAoYy5iZWhhdmlvdXIgPT09ICdncmF6ZScgJiYgcmFuZChjKSA8IDAuMDQpIHtcbiAgICAvLyBTbWFsbCBzaHVmZmxlcyB3aGlsZSBncmF6aW5nLlxuICAgIGNvbnN0IGEgPSBjLmhlYWRpbmcgKyAocmFuZChjKSAtIDAuNSk7XG4gICAgdHggPSBNYXRoLnNpbihhKTsgdHogPSBNYXRoLmNvcyhhKTsgc3BlZWQgPSBkZWYud2Fsa1NwZWVkICogMC40O1xuICB9XG5cbiAgaWYgKHNwZWVkID4gMCkge1xuICAgIC8vIFN0ZWVyIGFyb3VuZCB1bnN1aXRhYmxlIGdyb3VuZCBieSBzYW1wbGluZyBhIGZhbiBvZiBoZWFkaW5ncy5cbiAgICBjb25zdCBiYXNlID0gTWF0aC5hdGFuMih0eCwgdHopO1xuICAgIGxldCBtb3ZlZCA9IGZhbHNlO1xuICAgIGZvciAoY29uc3Qgb2ZmIG9mIFswLCAwLjUsIC0wLjUsIDEuMCwgLTEuMCwgMS42LCAtMS42XSkge1xuICAgICAgY29uc3QgYSA9IGJhc2UgKyBvZmY7XG4gICAgICBjb25zdCBueCA9IGMueCArIE1hdGguc2luKGEpICogc3BlZWQgKiBkdCwgbnogPSBjLnogKyBNYXRoLmNvcyhhKSAqIHNwZWVkICogZHQ7XG4gICAgICBjb25zdCBoID0gbGFuZE9rKHdvcmxkLCBueCwgbnosIDEpO1xuICAgICAgaWYgKGggPT09IG51bGwpIGNvbnRpbnVlO1xuICAgICAgYy54ID0gbng7IGMueiA9IG56OyBjLnkgPSBoO1xuICAgICAgYy5oZWFkaW5nID0gdHVybihjLmhlYWRpbmcsIGEsIDggKiBkdCk7XG4gICAgICBtb3ZlZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgaWYgKCFtb3ZlZCAmJiBjLmJlaGF2aW91ciA9PT0gJ3dhbmRlcicpIHsgYy5iZWhhdmlvdXIgPSAnaWRsZSc7IGMudGltZXIgPSAxOyB9XG4gICAgYy5zcGVlZCA9IG1vdmVkID8gc3BlZWQgOiAwO1xuICB9IGVsc2Uge1xuICAgIGMuc3BlZWQgPSAwO1xuICB9XG59XG5cbi8qKiBGb3g6IG5vdGljZSBhIGhhcmUsIGNyZWVwIHVwLCBwb3VuY2U7IGdpdmUgdXAgKHJlc3QpIHdoZW4gaXQgZXNjYXBlcyBvciB0aGUgdGltZXIgZW5kcy4gKi9cbmZ1bmN0aW9uIGZveEh1bnQoYzogQ3JlYXR1cmUsIGRlZjogU3BlY2llc0RlZiwgY3R4OiBGYXVuYUNvbnRleHQsIHRocmVhdDogeyBkOiBudW1iZXIgfSB8IG51bGwpOiB2b2lkIHtcbiAgaWYgKGN0eC5uaWdodCA9PT0gZmFsc2UgJiYgYy5iZWhhdmlvdXIgPT09ICdzbGVlcCcpIHJldHVybjtcbiAgaWYgKGMuYmVoYXZpb3VyID09PSAnc3RhbGsnIHx8IGMuYmVoYXZpb3VyID09PSAnY2hhc2UnKSB7XG4gICAgbGV0IGJlc3Q6IHsgZDogbnVtYmVyOyB4OiBudW1iZXI7IHo6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG4gICAgZm9yIChjb25zdCBwIG9mIGN0eC5wcmV5ID8/IFtdKSB7XG4gICAgICBjb25zdCBkID0gTWF0aC5oeXBvdChwLnggLSBjLngsIHAueiAtIGMueik7XG4gICAgICBpZiAoIWJlc3QgfHwgZCA8IGJlc3QuZCkgYmVzdCA9IHsgZCwgeDogcC54LCB6OiBwLnogfTtcbiAgICB9XG4gICAgaWYgKCFiZXN0IHx8IGJlc3QuZCA+IDIwIHx8IGMudGltZXIgPD0gMCB8fCAodGhyZWF0ICYmIHRocmVhdC5kIDwgZGVmLndhcmluZXNzICogMC41KSkge1xuICAgICAgYy5iZWhhdmlvdXIgPSAncmVzdCc7IGMudGltZXIgPSA0ICsgcmFuZChjKSAqIDQ7IHJldHVybjtcbiAgICB9XG4gICAgYy5nb2FsWCA9IGJlc3QueDsgYy5nb2FsWiA9IGJlc3QuejtcbiAgICBpZiAoYy5iZWhhdmlvdXIgPT09ICdzdGFsaycgJiYgYmVzdC5kIDwgMy41KSB7IGMuYmVoYXZpb3VyID0gJ2NoYXNlJzsgYy50aW1lciA9IDI7IH1cbiAgICBpZiAoYy5iZWhhdmlvdXIgPT09ICdjaGFzZScgJiYgYmVzdC5kIDwgMC42KSB7IGMuYmVoYXZpb3VyID0gJ3Jlc3QnOyBjLnRpbWVyID0gNjsgfSAgIC8vIGEgbmVhciBtaXNzOiB0aGUgaGFyZSBpcyBnb25lXG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChjLnRpbWVyIDw9IDAgJiYgY3R4LnByZXkgJiYgISh0aHJlYXQgJiYgdGhyZWF0LmQgPCBkZWYud2FyaW5lc3MpKSB7XG4gICAgZm9yIChjb25zdCBwIG9mIGN0eC5wcmV5KSB7XG4gICAgICBpZiAoTWF0aC5oeXBvdChwLnggLSBjLngsIHAueiAtIGMueikgPCAxMyAmJiByYW5kKGMpIDwgMC42KSB7XG4gICAgICAgIGMuYmVoYXZpb3VyID0gJ3N0YWxrJzsgYy50aW1lciA9IDEyOyBjLmdvYWxYID0gcC54OyBjLmdvYWxaID0gcC56OyByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbi8qKiBQYWNrIG1lbWJlcjogc3RheSB3aXRoIHRoZSBsZWFkZXI7IHdoZW4gdGhlIGxlYWRlciByZXN0cyBvciBncmF6ZXMsIHNvIGRvIHRoZXkuICovXG5mdW5jdGlvbiBwYWNrRm9sbG93KGM6IENyZWF0dXJlLCBkZWY6IFNwZWNpZXNEZWYsIGxlYWRlcjogQ3JlYXR1cmUpOiB2b2lkIHtcbiAgY29uc3QgZCA9IE1hdGguaHlwb3QobGVhZGVyLnggLSBjLngsIGxlYWRlci56IC0gYy56KTtcbiAgaWYgKGQgPiA1KSB7XG4gICAgYy5iZWhhdmlvdXIgPSAnZm9sbG93JztcbiAgICBjb25zdCBhID0gcmFuZChjKSAqIE1hdGguUEkgKiAyO1xuICAgIGMuZ29hbFggPSBsZWFkZXIueCArIE1hdGguY29zKGEpICogMzsgYy5nb2FsWiA9IGxlYWRlci56ICsgTWF0aC5zaW4oYSkgKiAzO1xuICAgIGMudGltZXIgPSAxO1xuICB9IGVsc2UgaWYgKGMuYmVoYXZpb3VyID09PSAnZm9sbG93JyB8fCBjLnRpbWVyIDw9IDApIHtcbiAgICBjb25zdCBjYWxtID0gbGVhZGVyLmJlaGF2aW91ciA9PT0gJ3Jlc3QnIHx8IGxlYWRlci5iZWhhdmlvdXIgPT09ICdzbGVlcCcgfHwgbGVhZGVyLmJlaGF2aW91ciA9PT0gJ2dyYXplJyB8fCBsZWFkZXIuYmVoYXZpb3VyID09PSAnaWRsZSc7XG4gICAgYy5iZWhhdmlvdXIgPSBjYWxtID8gKGxlYWRlci5iZWhhdmlvdXIgPT09ICdzbGVlcCcgPyAnc2xlZXAnIDogJ3Jlc3QnKSA6ICd3YW5kZXInO1xuICAgIGMudGltZXIgPSAzICsgcmFuZChjKSAqIDQ7XG4gICAgYy5nb2FsWCA9IGxlYWRlci54ICsgKHJhbmQoYykgLSAwLjUpICogODsgYy5nb2FsWiA9IGxlYWRlci56ICsgKHJhbmQoYykgLSAwLjUpICogODtcbiAgfVxuICB2b2lkIGRlZjtcbn1cblxuZnVuY3Rpb24gc3RlcEZpc2god29ybGQ6IFdvcmxkLCBjOiBDcmVhdHVyZSwgZGVmOiBTcGVjaWVzRGVmLCBjdHg6IEZhdW5hQ29udGV4dCxcbiAgdGhyZWF0OiB7IGQ6IG51bWJlcjsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB8IG51bGwpOiB2b2lkIHtcbiAgY29uc3QgZHQgPSBGQVVOQV9TVEVQO1xuICBjb25zdCBoeWRybyA9IGh5ZHJvbG9neUZvcih3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbik7XG4gIGlmICh0aHJlYXQgJiYgdGhyZWF0LmQgPCBkZWYud2FyaW5lc3MpIHsgYy5iZWhhdmlvdXIgPSAnc2NhdHRlcic7IGMudGltZXIgPSAxLjUgKyByYW5kKGMpOyB9XG4gIGVsc2UgaWYgKGMudGltZXIgPD0gMCkge1xuICAgIGMuYmVoYXZpb3VyID0gJ3N3aW0nO1xuICAgIGMudGltZXIgPSAyICsgcmFuZChjKSAqIDM7XG4gICAgY29uc3QgYSA9IHJhbmQoYykgKiBNYXRoLlBJICogMiwgZCA9IHJhbmQoYykgKiBkZWYucmFuZ2U7XG4gICAgYy5nb2FsWCA9IGMuaG9tZVggKyBNYXRoLmNvcyhhKSAqIGQ7XG4gICAgYy5nb2FsWiA9IGMuaG9tZVogKyBNYXRoLnNpbihhKSAqIGQ7XG4gICAgYy5kZXB0aFByZWYgPSAwLjI1ICsgcmFuZChjKSAqIDAuNTU7XG4gIH1cbiAgbGV0IHR4OiBudW1iZXIsIHR6OiBudW1iZXIsIHNwZWVkOiBudW1iZXI7XG4gIGlmIChjLmJlaGF2aW91ciA9PT0gJ3NjYXR0ZXInICYmIHRocmVhdCkge1xuICAgIGNvbnN0IGR4ID0gYy54IC0gdGhyZWF0LngsIGR6ID0gYy56IC0gdGhyZWF0LnosIGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KSB8fCAxO1xuICAgIHR4ID0gZHggLyBsZW47IHR6ID0gZHogLyBsZW47IHNwZWVkID0gZGVmLmZsZWVTcGVlZDtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBkeCA9IGMuZ29hbFggLSBjLngsIGR6ID0gYy5nb2FsWiAtIGMueiwgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gICAgdHggPSBkeCAvIGxlbjsgdHogPSBkeiAvIGxlbjsgc3BlZWQgPSBsZW4gPCAwLjQgPyAwIDogZGVmLndhbGtTcGVlZDtcbiAgICAvLyBUcm91dCBob2xkIHBvc2l0aW9uIGFnYWluc3QgdGhlIGN1cnJlbnQ6IGZhY2UgdXBzdHJlYW0sIGRyaWZ0IHNsaWdodGx5LlxuICAgIGNvbnN0IHcgPSByZXNpZGVudFdhdGVyQXQod29ybGQsIE1hdGguZmxvb3IoYy54KSwgTWF0aC5mbG9vcihjLnopKTtcbiAgICBpZiAodykge1xuICAgICAgY29uc3QgZiA9IGh5ZHJvLmZsb3dBdChjLngsIGMueiwgdy50b3ApO1xuICAgICAgaWYgKGYuc3BlZWQgPiAwLjIpIHsgdHggPSB0eCAqIDAuNSAtIGYuZHggKiAwLjU7IHR6ID0gdHogKiAwLjUgLSBmLmR6ICogMC41OyB9XG4gICAgfVxuICB9XG4gIGNvbnN0IGJhc2UgPSBNYXRoLmF0YW4yKHR4LCB0eik7XG4gIGxldCBtb3ZlZCA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IG9mZiBvZiBbMCwgMC42LCAtMC42LCAxLjMsIC0xLjMsIDIuMiwgLTIuMl0pIHtcbiAgICBjb25zdCBhID0gYmFzZSArIG9mZjtcbiAgICBjb25zdCBueCA9IGMueCArIE1hdGguc2luKGEpICogc3BlZWQgKiBkdCwgbnogPSBjLnogKyBNYXRoLmNvcyhhKSAqIHNwZWVkICogZHQ7XG4gICAgY29uc3QgdyA9IHJlc2lkZW50V2F0ZXJBdCh3b3JsZCwgTWF0aC5mbG9vcihueCksIE1hdGguZmxvb3IobnopKTtcbiAgICBpZiAoIXcgfHwgdy50b3AgLSB3LmJlZCA8IDAuOCkgY29udGludWU7XG4gICAgYy54ID0gbng7IGMueiA9IG56O1xuICAgIGNvbnN0IGdvYWxZID0gdy50b3AgLSAwLjM1IC0gKHcudG9wIC0gdy5iZWQgLSAwLjcpICogYy5kZXB0aFByZWY7XG4gICAgYy55ICs9IChnb2FsWSAtIGMueSkgKiBNYXRoLm1pbigxLCAzICogZHQpO1xuICAgIGMueSA9IE1hdGgubWluKHcudG9wIC0gMC4yNSwgTWF0aC5tYXgody5iZWQgKyAwLjIsIGMueSkpO1xuICAgIGMuaGVhZGluZyA9IHR1cm4oYy5oZWFkaW5nLCBhLCA2ICogZHQpO1xuICAgIG1vdmVkID0gdHJ1ZTtcbiAgICBicmVhaztcbiAgfVxuICBjLnNwZWVkID0gbW92ZWQgPyBzcGVlZCA6IDA7XG4gIGlmICghbW92ZWQpIHsgYy5nb2FsWCA9IGMuaG9tZVg7IGMuZ29hbFogPSBjLmhvbWVaOyB9XG4gIHZvaWQgY3R4O1xufVxuXG5mdW5jdGlvbiB0dXJuKGZyb206IG51bWJlciwgdG86IG51bWJlciwgcmF0ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGQgPSB0byAtIGZyb207XG4gIHdoaWxlIChkID4gTWF0aC5QSSkgZCAtPSBNYXRoLlBJICogMjtcbiAgd2hpbGUgKGQgPCAtTWF0aC5QSSkgZCArPSBNYXRoLlBJICogMjtcbiAgcmV0dXJuIGZyb20gKyBkICogTWF0aC5taW4oMSwgcmF0ZSk7XG59XG4iLCAiLy8gUmVuZGVyIGxheWVyIFx1MjAxNCBsaXZpbmcgd2lsZGxpZmUgKGFtYmllbnQgdGllcikgb3ZlciB0aGUgc2ltIGZhdW5hIHJ1bGVzLlxuLy9cbi8vIEZhdW5hVmlldyBvd25zIHRoZSBhbWJpZW50IGNyZWF0dXJlIHJlY29yZHMgZm9yIHJlc2lkZW50IG5lYXIgY2h1bmtzOlxuLy8gc3Bhd25lZCBkZXRlcm1pbmlzdGljYWxseSB3aGVuIGEgY2h1bmsgbG9hZHMsIGRyb3BwZWQgd2hlbiBpdCB1bmxvYWRzLCBhbmRcbi8vIHN0ZXBwZWQgYXQgdGhlIGZpeGVkIEZBVU5BX1NURVAgcmF0ZS4gRWFjaCBzcGVjaWVzIGlzIG9uZSBpbnN0YW5jZWQgbWVzaFxuLy8gd2l0aCBhbiBhbmltYXRlZCByaWcgKHNlZSBhbmltYWwta2l0LnRzKSwgc28gYSBmdWxsIG5lYXIgcmluZyBvZiB3aWxkbGlmZVxuLy8gY29zdHMgZml2ZSBkcmF3IGNhbGxzLiBXaWxkbGlmZSBpcyBwcmVzZW50YXRpb24tdGllcjogbm90IHNhdmVkIG9yIGpvdXJuYWxlZC5cbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCB7IFdvcmxkIH0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IENyZWF0dXJlLCBGQVVOQV9TVEVQLCBGYXVuYUNvbnRleHQsIFNQRUNJRVMsIHNwYXduQ2h1bmtGYXVuYSwgc3RlcENyZWF0dXJlIH0gZnJvbSAnLi4vc2ltL2ZhdW5hJztcbmltcG9ydCB7IEFuaW1hbEJhdGNoIH0gZnJvbSAnLi9hbmltYWwta2l0JztcbmltcG9ydCB7IEFOSU1BTF9NT0RFTFMgfSBmcm9tICcuL2FuaW1hbC1tb2RlbHMnO1xuaW1wb3J0IHsgUG9zZSwgYmxlbmRQb3NlLCBzdGVwQWxwaGEgfSBmcm9tICcuL3Ntb290aCc7XG5cbnR5cGUgSWQgPSBDcmVhdHVyZVsnc3BlY2llcyddO1xuY29uc3QgQ0FQOiBSZWNvcmQ8SWQsIG51bWJlcj4gPSB7IGRlZXI6IDQ4LCByYWJiaXQ6IDQ4LCB0cm91dDogMTYwLCBmb3g6IDI0LCB3b2xmOiAzMiB9O1xuY29uc3QgSURTID0gT2JqZWN0LmtleXMoQ0FQKSBhcyBJZFtdO1xuXG4vKiogU3RhYmxlIHBlci1hbmltYWwgY29pbiBmbGlwIChhbnRsZXJzIG9uIHN0YWdzLCBjb21iIG9uIGNvY2tzKS4gKi9cbmZ1bmN0aW9uIGlzTWFsZShpZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGxldCBoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBpZC5sZW5ndGg7IGkrKykgaCA9IChNYXRoLmltdWwoaCwgMzEpICsgaWQuY2hhckNvZGVBdChpKSkgfCAwO1xuICByZXR1cm4gKGggJiAxKSA9PT0gMTtcbn1cblxuZXhwb3J0IGNsYXNzIEZhdW5hVmlldyB7XG4gIHJlYWRvbmx5IGdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIHByaXZhdGUgY3JlYXR1cmVzID0gbmV3IE1hcDxzdHJpbmcsIENyZWF0dXJlW10+KCk7XG4gIHByaXZhdGUgcGhhc2VzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgLyoqIFBvc2UgYmVmb3JlIHRoZSBsYXRlc3QgZml4ZWQgc3RlcCwgc28gZHJhd2luZyBjYW4gYmxlbmQgYmV0d2VlbiBzdGVwcyAocmVuZGVyIG9ubHkpLiAqL1xuICBwcml2YXRlIHByZXYgPSBuZXcgTWFwPHN0cmluZywgUG9zZT4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBzaG93bjogUG9zZSA9IHsgeDogMCwgeTogMCwgejogMCwgaGVhZGluZzogMCB9O1xuICAvKiogQ2h1bmtzIHdob3NlIGNyZWF0dXJlcyBhcmUgc3Bhd25lZCBwZXIgZnJhbWU7IHRoZSByZXN0IHdhaXQgZm9yIHRoZSBuZXh0IGZyYW1lLiAqL1xuICBzdGF0aWMgcmVhZG9ubHkgU1BBV05fQ0hVTktTX1BFUl9GUkFNRSA9IDI7XG4gIHByaXZhdGUgYWNjdW11bGF0b3IgPSAwO1xuICAvKiogVHJ1ZSB3aGlsZSBzeW5jKCkgbGVmdCBjaHVua3MgdW5zcGF3bmVkOyB0aGUgY2FsbGVyIHNob3VsZCBzeW5jIGFnYWluIG5leHQgZnJhbWUuICovXG4gIHBlbmRpbmdTcGF3biA9IGZhbHNlO1xuICBwcml2YXRlIHJlYWRvbmx5IGJhdGNoZXMgPSBuZXcgTWFwPElkLCBBbmltYWxCYXRjaD4oKTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHdvcmxkOiBXb3JsZCkge1xuICAgIHRoaXMuZ3JvdXAubmFtZSA9ICdmYXVuYSc7XG4gICAgZm9yIChjb25zdCBpZCBvZiBJRFMpIHtcbiAgICAgIGNvbnN0IGIgPSBuZXcgQW5pbWFsQmF0Y2goQU5JTUFMX01PREVMU1tpZF0sIENBUFtpZF0sIGBmYXVuYV8ke2lkfWApO1xuICAgICAgdGhpcy5iYXRjaGVzLnNldChpZCwgYik7XG4gICAgICB0aGlzLmdyb3VwLmFkZChiLm1lc2gpO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBSZWNvbmNpbGUgY3JlYXR1cmUgcmVjb3JkcyB3aXRoIHRoZSByZXNpZGVudCBuZWFyLWNodW5rIHNldC4gKi9cbiAgc3luYyhsb2FkZWQ6IFJlYWRvbmx5U2V0PHN0cmluZz4pOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IFtrZXksIGxpc3RdIG9mIFsuLi50aGlzLmNyZWF0dXJlc10pIHtcbiAgICAgIGlmIChsb2FkZWQuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgICAgZm9yIChjb25zdCBjIG9mIGxpc3QpIHsgdGhpcy5waGFzZXMuZGVsZXRlKGMuaWQpOyB0aGlzLnByZXYuZGVsZXRlKGMuaWQpOyB9XG4gICAgICB0aGlzLmNyZWF0dXJlcy5kZWxldGUoa2V5KTtcbiAgICB9XG4gICAgbGV0IHNwYXduZWQgPSAwO1xuICAgIHRoaXMucGVuZGluZ1NwYXduID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgbG9hZGVkKSB7XG4gICAgICBpZiAodGhpcy5jcmVhdHVyZXMuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgICAgaWYgKHNwYXduZWQrKyA+PSBGYXVuYVZpZXcuU1BBV05fQ0hVTktTX1BFUl9GUkFNRSkgeyB0aGlzLnBlbmRpbmdTcGF3biA9IHRydWU7IGJyZWFrOyB9XG4gICAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgICAgdGhpcy5jcmVhdHVyZXMuc2V0KGtleSwgc3Bhd25DaHVua0ZhdW5hKHRoaXMud29ybGQsIGN4LCBjeikpO1xuICAgIH1cbiAgfVxuXG4gIGdldCBjb3VudCgpOiBudW1iZXIge1xuICAgIGxldCBuID0gMDtcbiAgICBmb3IgKGNvbnN0IGxpc3Qgb2YgdGhpcy5jcmVhdHVyZXMudmFsdWVzKCkpIG4gKz0gbGlzdC5sZW5ndGg7XG4gICAgcmV0dXJuIG47XG4gIH1cblxuICBhbGwoKTogQ3JlYXR1cmVbXSB7IHJldHVybiBbLi4udGhpcy5jcmVhdHVyZXMudmFsdWVzKCldLmZsYXQoKTsgfVxuXG4gIHVwZGF0ZShkdDogbnVtYmVyLCBjdHg6IEZhdW5hQ29udGV4dCk6IHZvaWQge1xuICAgIHRoaXMuYWNjdW11bGF0b3IgPSBNYXRoLm1pbih0aGlzLmFjY3VtdWxhdG9yICsgZHQsIEZBVU5BX1NURVAgKiA0KTtcbiAgICBpZiAodGhpcy5hY2N1bXVsYXRvciA+PSBGQVVOQV9TVEVQKSB7XG4gICAgICAvLyBSZWxhdGlvbnNoaXBzIGJldHdlZW4gY3JlYXR1cmVzLCBnYXRoZXJlZCBvbmNlIHBlciBmcmFtZS5cbiAgICAgIGNvbnN0IHByZWRhdG9yczogQXJyYXk8eyBzcGVjaWVzOiBJZDsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgICAgIGNvbnN0IHByZXk6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgICAgIGNvbnN0IGxlYWRlcnMgPSBuZXcgTWFwPHN0cmluZywgQ3JlYXR1cmU+KCk7XG4gICAgICBmb3IgKGNvbnN0IGxpc3Qgb2YgdGhpcy5jcmVhdHVyZXMudmFsdWVzKCkpIHtcbiAgICAgICAgZm9yIChjb25zdCBjIG9mIGxpc3QpIHtcbiAgICAgICAgICBpZiAoYy5zcGVjaWVzID09PSAnZm94JyB8fCBjLnNwZWNpZXMgPT09ICd3b2xmJykgcHJlZGF0b3JzLnB1c2goeyBzcGVjaWVzOiBjLnNwZWNpZXMsIHg6IGMueCwgejogYy56IH0pO1xuICAgICAgICAgIGlmIChjLnNwZWNpZXMgPT09ICdyYWJiaXQnKSBwcmV5LnB1c2goeyB4OiBjLngsIHo6IGMueiB9KTtcbiAgICAgICAgICBpZiAoYy5zcGVjaWVzID09PSAnd29sZicgJiYgIWMubGVhZGVyKSBsZWFkZXJzLnNldChjLmlkLCBjKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgZnVsbDogRmF1bmFDb250ZXh0ID0geyAuLi5jdHgsIHByZWRhdG9ycywgcHJleSwgbGVhZGVycyB9O1xuICAgICAgd2hpbGUgKHRoaXMuYWNjdW11bGF0b3IgPj0gRkFVTkFfU1RFUCkge1xuICAgICAgICBmb3IgKGNvbnN0IGxpc3Qgb2YgdGhpcy5jcmVhdHVyZXMudmFsdWVzKCkpIHtcbiAgICAgICAgICBmb3IgKGNvbnN0IGMgb2YgbGlzdCkge1xuICAgICAgICAgICAgY29uc3QgcCA9IHRoaXMucHJldi5nZXQoYy5pZCk7XG4gICAgICAgICAgICBpZiAocCkgeyBwLnggPSBjLng7IHAueSA9IGMueTsgcC56ID0gYy56OyBwLmhlYWRpbmcgPSBjLmhlYWRpbmc7IH1cbiAgICAgICAgICAgIGVsc2UgdGhpcy5wcmV2LnNldChjLmlkLCB7IHg6IGMueCwgeTogYy55LCB6OiBjLnosIGhlYWRpbmc6IGMuaGVhZGluZyB9KTtcbiAgICAgICAgICAgIHN0ZXBDcmVhdHVyZSh0aGlzLndvcmxkLCBjLCBmdWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hY2N1bXVsYXRvciAtPSBGQVVOQV9TVEVQO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLmRyYXcoZHQpO1xuICB9XG5cbiAgcHJpdmF0ZSBkcmF3KGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IGIgb2YgdGhpcy5iYXRjaGVzLnZhbHVlcygpKSBiLmJlZ2luKCk7XG4gICAgY29uc3Qgbm93ID0gcGVyZm9ybWFuY2Uubm93KCkgLyAxMDAwO1xuICAgIGNvbnN0IGFscGhhID0gc3RlcEFscGhhKHRoaXMuYWNjdW11bGF0b3IsIEZBVU5BX1NURVApLCBzaG93biA9IHRoaXMuc2hvd247XG4gICAgZm9yIChjb25zdCBsaXN0IG9mIHRoaXMuY3JlYXR1cmVzLnZhbHVlcygpKSB7XG4gICAgICBmb3IgKGNvbnN0IGMgb2YgbGlzdCkge1xuICAgICAgICBjb25zdCBzcCA9IGMuc3BlY2llcztcbiAgICAgICAgY29uc3QgYmVmb3JlID0gdGhpcy5wcmV2LmdldChjLmlkKTtcbiAgICAgICAgaWYgKGJlZm9yZSkgYmxlbmRQb3NlKGJlZm9yZSwgYywgYWxwaGEsIHNob3duLCAzKTtcbiAgICAgICAgZWxzZSB7IHNob3duLnggPSBjLng7IHNob3duLnkgPSBjLnk7IHNob3duLnogPSBjLno7IHNob3duLmhlYWRpbmcgPSBjLmhlYWRpbmc7IH1cbiAgICAgICAgY29uc3QgYmF0Y2ggPSB0aGlzLmJhdGNoZXMuZ2V0KHNwKSE7XG4gICAgICAgIGNvbnN0IG1vdmluZyA9IGMuc3BlZWQgPiAwLjA1O1xuICAgICAgICBjb25zdCBwaCA9ICh0aGlzLnBoYXNlcy5nZXQoYy5pZCkgPz8gMCkgKyBkdCAqIChtb3ZpbmcgPyAzICsgYy5zcGVlZCAqIChzcCA9PT0gJ3JhYmJpdCcgPyA0IDogc3AgPT09ICd0cm91dCcgPyA4IDogMi40KSA6IDEpO1xuICAgICAgICB0aGlzLnBoYXNlcy5zZXQoYy5pZCwgcGgpO1xuICAgICAgICBjb25zdCBseWluZyA9IChjLmJlaGF2aW91ciA9PT0gJ3NsZWVwJyB8fCBjLmJlaGF2aW91ciA9PT0gJ3Jlc3QnKSAmJiBzcCAhPT0gJ3Ryb3V0JztcbiAgICAgICAgY29uc3QgZ3JhemluZyA9IGMuYmVoYXZpb3VyID09PSAnZ3JhemUnO1xuICAgICAgICBsZXQgaGVhZCA9IDAsIGxpZnQgPSAwLCByb2xsID0gMCwgcGl0Y2ggPSAwLCBzd2luZyA9IG1vdmluZyA/IE1hdGgubWluKDAuODUsIDAuMjUgKyBjLnNwZWVkICogMC4xKSA6IDA7XG4gICAgICAgIGlmIChncmF6aW5nKSBoZWFkID0gMC43NSArIE1hdGguc2luKG5vdyAqIDMgKyBjLngpICogMC4xO1xuICAgICAgICBlbHNlIGlmIChseWluZykgaGVhZCA9IDAuMztcbiAgICAgICAgZWxzZSBpZiAoYy5iZWhhdmlvdXIgPT09ICdzdGFsaycpIHsgaGVhZCA9IDAuNDU7IHN3aW5nID0gMC4zNTsgfVxuICAgICAgICBlbHNlIGlmIChjLmJlaGF2aW91ciA9PT0gJ2NoYXNlJyB8fCBjLmJlaGF2aW91ciA9PT0gJ2ZsZWUnKSBoZWFkID0gLTAuMTI7XG4gICAgICAgIGVsc2UgaWYgKCFtb3ZpbmcpIGhlYWQgPSBNYXRoLnNpbihub3cgKiAwLjcgKyBjLnopICogMC4wODtcbiAgICAgICAgaWYgKHNwID09PSAncmFiYml0JyAmJiBtb3ZpbmcpIHsgbGlmdCA9IE1hdGguYWJzKE1hdGguc2luKHBoKSkgKiAwLjE4OyBzd2luZyA9IDAuOTsgfVxuICAgICAgICBpZiAoc3AgPT09ICdkZWVyJyAmJiBjLnNwZWVkID4gMykgbGlmdCA9IE1hdGguYWJzKE1hdGguc2luKHBoKSkgKiAwLjE1O1xuICAgICAgICBpZiAoc3AgPT09ICd0cm91dCcpIHsgcm9sbCA9IE1hdGguc2luKHBoICogMS41KSAqIDAuMDU7IHN3aW5nID0gMDsgfVxuICAgICAgICBiYXRjaC5wdXNoKHtcbiAgICAgICAgICB4OiBzaG93bi54LCB5OiBzaG93bi55ICsgbGlmdCwgejogc2hvd24ueiwgaGVhZGluZzogc2hvd24uaGVhZGluZywgc2NhbGU6IDEsXG4gICAgICAgICAgcGhhc2U6IHBoLCBsZWdTd2luZzogc3dpbmcsIGhlYWRQaXRjaDogaGVhZCxcbiAgICAgICAgICB0YWlsV2FnOiBzcCA9PT0gJ3Ryb3V0JyA/IChtb3ZpbmcgJiYgYy5zcGVlZCA+IDEgPyAwLjU1IDogMC4zKSA6IHNwID09PSAnZm94JyB8fCBzcCA9PT0gJ3dvbGYnID8gKGx5aW5nID8gMC4wNSA6IDAuMykgOiAwLjE1LFxuICAgICAgICAgIG1hbGU6IGlzTWFsZShjLmlkKSwgeW91bmc6IGZhbHNlLCBseWluZywgZXh0cmE6IDEsIHBpdGNoLCByb2xsLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBiIG9mIHRoaXMuYmF0Y2hlcy52YWx1ZXMoKSkgYi5lbmQoKTtcbiAgfVxuXG4gIG1ldHJpY3MoKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gICAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0geyB0b3RhbDogMCB9O1xuICAgIGZvciAoY29uc3QgYyBvZiB0aGlzLmFsbCgpKSB7IG91dFtjLnNwZWNpZXNdID0gKG91dFtjLnNwZWNpZXNdID8/IDApICsgMTsgb3V0LnRvdGFsKys7IH1cbiAgICByZXR1cm4gb3V0O1xuICB9XG59XG5cbmV4cG9ydCB7IFNQRUNJRVMgfTtcbiIsICIvLyBCbG9jay1idWlsdCBhbmltYWxzIHRoYXQgbW92ZSwgaW4gb25lIGluc3RhbmNlZCBkcmF3IGNhbGwgcGVyIHNwZWNpZXMuXG4vL1xuLy8gQSBtb2RlbCBpcyBhIGxpc3Qgb2YgYm94ZXMuIEVhY2ggYm94IGJlbG9uZ3MgdG8gYSAqcGFydCogKGJvZHksIGxlZywgaGVhZCxcbi8vIHRhaWwsIHdpbmcsIHdvb2wpIHdpdGggYSBwaXZvdC4gQSBzbWFsbCB2ZXJ0ZXgtc2hhZGVyIHBhdGNoIHN3aW5ncyBsZWdzXG4vLyBhYm91dCB0aGUgaGlwLCB0aXBzIHRoZSBoZWFkIGFib3V0IHRoZSBuZWNrLCB3YWdzIHRoZSB0YWlsLCBmbGFwcyB3aW5ncyBhbmRcbi8vIHNjYWxlcyB3b29sLCBhbGwgZHJpdmVuIGJ5IHR3byBwZXItaW5zdGFuY2UgdmVjNHMsIHNvIGEgd2hvbGUgaGVyZCBhbmltYXRlc1xuLy8gd2l0aG91dCBwZXItZnJhbWUgZ2VvbWV0cnkgd29yayBhbmQgd2l0aG91dCBleHRyYSBkcmF3IGNhbGxzLlxuLy9cbi8vIFBhcnQgaWRzIChhZGQgMTAgdG8gbWFrZSBhIHBhcnQgYXBwZWFyIG9uIG1hbGVzIG9ubHk6IGhvcm5zLCBhbnRsZXJzLCBjb21icyk6XG4vLyAgIDAgYm9keSAgIDEgbGVnIHNldCBBICAgMiBsZWcgc2V0IEIgICAzIGhlYWQgICA0IHRhaWwgICA2IHdpbmcgICA3IHdvb2xcbi8vIEluc3RhbmNlIGRhdGE6XG4vLyAgIGlBbmltICA9IChnYWl0IHBoYXNlLCBsZWcgc3dpbmcsIGhlYWQgcGl0Y2ggKCsgPSBub3NlIGRvd24pLCB0YWlsIHdhZylcbi8vICAgaVN0YXRlID0gKG1hbGUsIHlvdW5nLCBseWluZywgd2luZyBmbGFwIC8gd29vbCBmdWxsbmVzcylcbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCB7IG1lcmdlR2VvbWV0cmllcyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS91dGlscy9CdWZmZXJHZW9tZXRyeVV0aWxzLmpzJztcbmltcG9ydCBwYWxldHRlIGZyb20gJy4uL2RhdGEvcGFsZXR0ZS5qc29uJztcblxuY29uc3QgTSA9IHBhbGV0dGUubWF0ZXJpYWxzIGFzIFJlY29yZDxzdHJpbmcsIHsgaGV4OiBzdHJpbmcgfT47XG5jb25zdCBjb2xvdXIgPSAoazogc3RyaW5nKSA9PiBuZXcgVEhSRUUuQ29sb3Ioay5zdGFydHNXaXRoKCcjJykgPyBrIDogTVtrXS5oZXgpO1xuXG5leHBvcnQgY29uc3QgUEFSVCA9IHsgYm9keTogMCwgbGVnQTogMSwgbGVnQjogMiwgaGVhZDogMywgdGFpbDogNCwgd2luZzogNiwgd29vbDogNywgbWFsZTogMTAgfSBhcyBjb25zdDtcblxuZXhwb3J0IGludGVyZmFjZSBBQm94IHtcbiAgdzogbnVtYmVyOyBoOiBudW1iZXI7IGQ6IG51bWJlcjtcbiAgLyoqIEJveCBjZW50cmUgKG1ldHJlczsgK3ogZm9yd2FyZCwgeSB1cCwgZ3JvdW5kIGF0IDApLiAqL1xuICB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyO1xuICBjOiBzdHJpbmc7XG4gIHBhcnQ/OiBudW1iZXI7XG4gIHBpdm90PzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuICByeD86IG51bWJlcjsgcnk/OiBudW1iZXI7IHJ6PzogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYngodzogbnVtYmVyLCBoOiBudW1iZXIsIGQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgYzogc3RyaW5nLFxuICBwYXJ0OiBudW1iZXIgPSBQQVJULmJvZHksIHBpdm90PzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdLCByb3Q/OiB7IHJ4PzogbnVtYmVyOyByeT86IG51bWJlcjsgcno/OiBudW1iZXIgfSk6IEFCb3gge1xuICByZXR1cm4geyB3LCBoLCBkLCB4LCB5LCB6LCBjLCBwYXJ0LCBwaXZvdCwgLi4ucm90IH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQW5pbWFsTW9kZWwge1xuICBpZDogc3RyaW5nO1xuICBib3hlczogQUJveFtdO1xuICAvKiogSGlwIGhlaWdodDogYSBseWluZyBhbmltYWwgbG93ZXJzIGl0cyBib2R5IGJ5IG1vc3Qgb2YgdGhpcy4gKi9cbiAgbGVnTGVuOiBudW1iZXI7XG4gIC8qKiBUaW50IGEgeW91bmcgYW5pbWFsIHRvd2FyZHMgdGhpcyBjb2xvdXIgKGNoaWNrcyBhcmUgeWVsbG93KS4gKi9cbiAgeW91bmdUaW50Pzogc3RyaW5nO1xufVxuXG4vKiogTWVyZ2UgdGhlIGJveGVzIGludG8gb25lIGdlb21ldHJ5IHdpdGggcGVyLXZlcnRleCBjb2xvdXIgYW5kIHBhcnQgZGF0YS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEFuaW1hbEdlb21ldHJ5KG1vZGVsOiBBbmltYWxNb2RlbCk6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3QgZ2VvcyA9IG1vZGVsLmJveGVzLm1hcCgoYikgPT4ge1xuICAgIGNvbnN0IGcgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoYi53LCBiLmgsIGIuZCkudG9Ob25JbmRleGVkKCk7XG4gICAgaWYgKGIucnggfHwgYi5yeSB8fCBiLnJ6KSBnLmFwcGx5TWF0cml4NChuZXcgVEhSRUUuTWF0cml4NCgpLm1ha2VSb3RhdGlvbkZyb21FdWxlcihuZXcgVEhSRUUuRXVsZXIoYi5yeCA/PyAwLCBiLnJ5ID8/IDAsIGIucnogPz8gMCkpKTtcbiAgICBnLnRyYW5zbGF0ZShiLngsIGIueSwgYi56KTtcbiAgICBnLmRlbGV0ZUF0dHJpYnV0ZSgndXYnKTtcbiAgICBjb25zdCBjb2wgPSBjb2xvdXIoYi5jKSwgbiA9IGcuYXR0cmlidXRlcy5wb3NpdGlvbi5jb3VudDtcbiAgICBjb25zdCBjb2xvcnMgPSBuZXcgRmxvYXQzMkFycmF5KG4gKiAzKSwgcmlnID0gbmV3IEZsb2F0MzJBcnJheShuICogNCk7XG4gICAgY29uc3QgcHYgPSBiLnBpdm90ID8/IFtiLngsIGIueSwgYi56XTtcbiAgICBjb25zdCBub3JtYWxzID0gZy5hdHRyaWJ1dGVzLm5vcm1hbDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgY29uc3QgbnkgPSBub3JtYWxzLmdldFkoaSk7XG4gICAgICBjb25zdCBrID0gbnkgPiAwLjUgPyAxIDogbnkgPCAtMC41ID8gMC43NCA6IDAuODg7XG4gICAgICBjb2xvcnNbaSAqIDNdID0gY29sLnIgKiBrOyBjb2xvcnNbaSAqIDMgKyAxXSA9IGNvbC5nICogazsgY29sb3JzW2kgKiAzICsgMl0gPSBjb2wuYiAqIGs7XG4gICAgICByaWdbaSAqIDRdID0gcHZbMF07IHJpZ1tpICogNCArIDFdID0gcHZbMV07IHJpZ1tpICogNCArIDJdID0gcHZbMl07IHJpZ1tpICogNCArIDNdID0gYi5wYXJ0ID8/IDA7XG4gICAgfVxuICAgIGcuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoY29sb3JzLCAzKSk7XG4gICAgZy5zZXRBdHRyaWJ1dGUoJ2FSaWcnLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKHJpZywgNCkpO1xuICAgIHJldHVybiBnO1xuICB9KTtcbiAgY29uc3QgbWVyZ2VkID0gbWVyZ2VHZW9tZXRyaWVzKGdlb3MpITtcbiAgZm9yIChjb25zdCBnIG9mIGdlb3MpIGcuZGlzcG9zZSgpO1xuICByZXR1cm4gbWVyZ2VkO1xufVxuXG5jb25zdCBWRVJURVhfSEVBRCA9IC8qIGdsc2wgKi9gXG5hdHRyaWJ1dGUgdmVjNCBhUmlnO1xuYXR0cmlidXRlIHZlYzQgaUFuaW07XG5hdHRyaWJ1dGUgdmVjNCBpU3RhdGU7XG52ZWMzIHJvdFgodmVjMyBwLCB2ZWMzIGMsIGZsb2F0IGEpIHsgZmxvYXQgcyA9IHNpbihhKSwgayA9IGNvcyhhKTsgdmVjMyBkID0gcCAtIGM7IHJldHVybiBjICsgdmVjMyhkLngsIGQueSAqIGsgLSBkLnogKiBzLCBkLnkgKiBzICsgZC56ICogayk7IH1cbnZlYzMgcm90WSh2ZWMzIHAsIHZlYzMgYywgZmxvYXQgYSkgeyBmbG9hdCBzID0gc2luKGEpLCBrID0gY29zKGEpOyB2ZWMzIGQgPSBwIC0gYzsgcmV0dXJuIGMgKyB2ZWMzKGQueCAqIGsgKyBkLnogKiBzLCBkLnksIC1kLnggKiBzICsgZC56ICogayk7IH1cbnZlYzMgcm90Wih2ZWMzIHAsIHZlYzMgYywgZmxvYXQgYSkgeyBmbG9hdCBzID0gc2luKGEpLCBrID0gY29zKGEpOyB2ZWMzIGQgPSBwIC0gYzsgcmV0dXJuIGMgKyB2ZWMzKGQueCAqIGsgLSBkLnkgKiBzLCBkLnggKiBzICsgZC55ICogaywgZC56KTsgfVxuYDtcblxuY29uc3QgVkVSVEVYX0JPRFkgPSAvKiBnbHNsICovYFxudmVjMyB0cmFuc2Zvcm1lZCA9IHZlYzMoIHBvc2l0aW9uICk7XG57XG4gIHZlYzMgcHYgPSBhUmlnLnh5ejtcbiAgZmxvYXQgbWFsZSA9IHN0ZXAoOS41LCBhUmlnLncpO1xuICBmbG9hdCBwYXJ0ID0gYVJpZy53IC0gMTAuMCAqIG1hbGU7XG4gIGZsb2F0IHN3aW5nID0gc2luKGlBbmltLngpICogaUFuaW0ueTtcbiAgaWYgKG1hbGUgPiAwLjUgJiYgaVN0YXRlLnggPCAwLjUpIHtcbiAgICB0cmFuc2Zvcm1lZCA9IHB2OyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBub3Qgb24gdGhpcyBhbmltYWxcbiAgfSBlbHNlIGlmIChwYXJ0ID4gMC41ICYmIHBhcnQgPCAyLjUpIHsgICAgICAgICAgICAgICAvLyBsZWdzOiBmb2xkIHdoZW4gbHlpbmcsIHRoZW4gc3dpbmcgYWJvdXQgdGhlIGhpcFxuICAgIHRyYW5zZm9ybWVkLnkgPSBwdi55ICsgKHRyYW5zZm9ybWVkLnkgLSBwdi55KSAqIG1peCgxLjAsIDAuMywgaVN0YXRlLnopO1xuICAgIHRyYW5zZm9ybWVkID0gcm90WCh0cmFuc2Zvcm1lZCwgcHYsIHBhcnQgPCAxLjUgPyBzd2luZyA6IC1zd2luZyk7XG4gIH0gZWxzZSBpZiAocGFydCA+IDIuNSAmJiBwYXJ0IDwgMy41KSB7ICAgICAgICAgICAgICAgLy8gaGVhZDogYmlnZ2VyIG9uIHRoZSB5b3VuZywgdGlwcyBhYm91dCB0aGUgbmVja1xuICAgIHRyYW5zZm9ybWVkID0gcHYgKyAodHJhbnNmb3JtZWQgLSBwdikgKiAoMS4wICsgMC4zICogaVN0YXRlLnkpO1xuICAgIHRyYW5zZm9ybWVkID0gcm90WCh0cmFuc2Zvcm1lZCwgcHYsIGlBbmltLnopO1xuICB9IGVsc2UgaWYgKHBhcnQgPiAzLjUgJiYgcGFydCA8IDQuNSkgeyAgICAgICAgICAgICAgIC8vIHRhaWxcbiAgICB0cmFuc2Zvcm1lZCA9IHJvdFkodHJhbnNmb3JtZWQsIHB2LCBzaW4oaUFuaW0ueCAqIDAuOCkgKiBpQW5pbS53KTtcbiAgfSBlbHNlIGlmIChwYXJ0ID4gNS41ICYmIHBhcnQgPCA2LjUpIHsgICAgICAgICAgICAgICAvLyB3aW5ncyBmbGFwIGFib3V0IHRoZSBzaG91bGRlclxuICAgIHRyYW5zZm9ybWVkID0gcm90Wih0cmFuc2Zvcm1lZCwgcHYsIGlTdGF0ZS53ICogc2luKGlBbmltLnggKiAzLjApICogc2lnbihwdi54KSAqIDAuOSk7XG4gIH0gZWxzZSBpZiAocGFydCA+IDYuNSAmJiBwYXJ0IDwgNy41KSB7ICAgICAgICAgICAgICAgLy8gd29vbCB0aGlucyBhZnRlciBzaGVhcmluZ1xuICAgIHRyYW5zZm9ybWVkID0gcHYgKyAodHJhbnNmb3JtZWQgLSBwdikgKiBtaXgoMC43LCAxLjAsIGlTdGF0ZS53KTtcbiAgfVxufVxuI2lmZGVmIFVTRV9DT0xPUlxuICAjaWZkZWYgWU9VTkdfVElOVFxuICAgIHZDb2xvci5yZ2IgPSBtaXgodkNvbG9yLnJnYiwgWU9VTkdfVElOVCwgaVN0YXRlLnkgKiAwLjkpO1xuICAjZW5kaWZcbiNlbmRpZlxuYDtcblxuLyoqIE9uZSBzaGFyZWQgbG9vayBmb3IgZXZlcnkgYW5pbWFsOiBmbGF0LXNoYWRlZCB2ZXJ0ZXggY29sb3VycyBwbHVzIHRoZSByaWcgcGF0Y2guICovXG5leHBvcnQgZnVuY3Rpb24gYW5pbWFsTWF0ZXJpYWwoeW91bmdUaW50Pzogc3RyaW5nKTogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCB7XG4gIGNvbnN0IG1hdCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHsgdmVydGV4Q29sb3JzOiB0cnVlLCBmbGF0U2hhZGluZzogdHJ1ZSB9KTtcbiAgaWYgKHlvdW5nVGludCkge1xuICAgIGNvbnN0IHQgPSBjb2xvdXIoeW91bmdUaW50KTtcbiAgICBtYXQuZGVmaW5lcyA9IHsgWU9VTkdfVElOVDogYHZlYzMoJHt0LnIudG9GaXhlZCgzKX0sICR7dC5nLnRvRml4ZWQoMyl9LCAke3QuYi50b0ZpeGVkKDMpfSlgIH07XG4gIH1cbiAgbWF0Lm9uQmVmb3JlQ29tcGlsZSA9IChzaGFkZXIpID0+IHtcbiAgICBzaGFkZXIudmVydGV4U2hhZGVyID0gc2hhZGVyLnZlcnRleFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgYCNpbmNsdWRlIDxjb21tb24+XFxuJHtWRVJURVhfSEVBRH1gKVxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+JywgVkVSVEVYX0JPRFkpO1xuICB9O1xuICBtYXQuY3VzdG9tUHJvZ3JhbUNhY2hlS2V5ID0gKCkgPT4gYGFuaW1hbC1yaWctJHt5b3VuZ1RpbnQgPz8gJ25vbmUnfWA7XG4gIHJldHVybiBtYXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQW5pbWFsUG9zZSB7XG4gIHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IGhlYWRpbmc6IG51bWJlcjsgc2NhbGU6IG51bWJlcjtcbiAgcGhhc2U6IG51bWJlcjsgbGVnU3dpbmc6IG51bWJlcjsgaGVhZFBpdGNoOiBudW1iZXI7IHRhaWxXYWc6IG51bWJlcjtcbiAgbWFsZTogYm9vbGVhbjsgeW91bmc6IGJvb2xlYW47IGx5aW5nOiBib29sZWFuO1xuICAvKiogV2luZyBmbGFwIGFtb3VudCAoYmlyZHMpIG9yIHdvb2wgZnVsbG5lc3MgMC4uMSAoc2hlZXApLiAqL1xuICBleHRyYTogbnVtYmVyO1xuICBwaXRjaD86IG51bWJlcjsgcm9sbD86IG51bWJlcjtcbn1cblxuLyoqIEFsbCBpbnN0YW5jZXMgb2Ygb25lIHNwZWNpZXM6IG9uZSBJbnN0YW5jZWRNZXNoLCBvbmUgZHJhdyBjYWxsLiAqL1xuZXhwb3J0IGNsYXNzIEFuaW1hbEJhdGNoIHtcbiAgcmVhZG9ubHkgbWVzaDogVEhSRUUuSW5zdGFuY2VkTWVzaDtcbiAgcmVhZG9ubHkgbW9kZWw6IEFuaW1hbE1vZGVsO1xuICBwcml2YXRlIHJlYWRvbmx5IGFuaW06IFRIUkVFLkluc3RhbmNlZEJ1ZmZlckF0dHJpYnV0ZTtcbiAgcHJpdmF0ZSByZWFkb25seSBzdGF0ZTogVEhSRUUuSW5zdGFuY2VkQnVmZmVyQXR0cmlidXRlO1xuICBwcml2YXRlIG4gPSAwO1xuICBwcml2YXRlIHJlYWRvbmx5IG0gPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBwcml2YXRlIHJlYWRvbmx5IHEgPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpO1xuICBwcml2YXRlIHJlYWRvbmx5IGUgPSBuZXcgVEhSRUUuRXVsZXIoKTtcbiAgcHJpdmF0ZSByZWFkb25seSB2ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgcHJpdmF0ZSByZWFkb25seSBzID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcblxuICBjb25zdHJ1Y3Rvcihtb2RlbDogQW5pbWFsTW9kZWwsIHJlYWRvbmx5IGNhcGFjaXR5OiBudW1iZXIsIG5hbWU6IHN0cmluZykge1xuICAgIHRoaXMubW9kZWwgPSBtb2RlbDtcbiAgICBjb25zdCBnZW8gPSBidWlsZEFuaW1hbEdlb21ldHJ5KG1vZGVsKTtcbiAgICB0aGlzLmFuaW0gPSBuZXcgVEhSRUUuSW5zdGFuY2VkQnVmZmVyQXR0cmlidXRlKG5ldyBGbG9hdDMyQXJyYXkoY2FwYWNpdHkgKiA0KSwgNCk7XG4gICAgdGhpcy5zdGF0ZSA9IG5ldyBUSFJFRS5JbnN0YW5jZWRCdWZmZXJBdHRyaWJ1dGUobmV3IEZsb2F0MzJBcnJheShjYXBhY2l0eSAqIDQpLCA0KTtcbiAgICB0aGlzLmFuaW0uc2V0VXNhZ2UoVEhSRUUuRHluYW1pY0RyYXdVc2FnZSk7XG4gICAgdGhpcy5zdGF0ZS5zZXRVc2FnZShUSFJFRS5EeW5hbWljRHJhd1VzYWdlKTtcbiAgICBnZW8uc2V0QXR0cmlidXRlKCdpQW5pbScsIHRoaXMuYW5pbSk7XG4gICAgZ2VvLnNldEF0dHJpYnV0ZSgnaVN0YXRlJywgdGhpcy5zdGF0ZSk7XG4gICAgdGhpcy5tZXNoID0gbmV3IFRIUkVFLkluc3RhbmNlZE1lc2goZ2VvLCBhbmltYWxNYXRlcmlhbChtb2RlbC55b3VuZ1RpbnQpLCBjYXBhY2l0eSk7XG4gICAgdGhpcy5tZXNoLm5hbWUgPSBuYW1lO1xuICAgIHRoaXMubWVzaC5jb3VudCA9IDA7XG4gICAgdGhpcy5tZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xuICAgIHRoaXMubWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICAvLyBDdWxsZWQgYXMgYSB3aG9sZSBieSBhIHNwaGVyZSBhcm91bmQgdGhpcyBmcmFtZSdzIGluc3RhbmNlcyAoZW5kKCkpLFxuICAgIC8vIHNvIGEgaGVyZCB0aGF0IGlzIG9mZiBzY3JlZW4gb3Igb3V0c2lkZSB0aGUgc3VuJ3Mgc2hhZG93IGJveCBjb3N0cyBub1xuICAgIC8vIGRyYXcgY2FsbC4gRXZlcnkgYW5pbWFsIHN0aWxsIGV4aXN0cyBhbmQgbW92ZXMgaW4gdGhlIHNpbXVsYXRpb24uXG4gICAgdGhpcy5tZXNoLmZydXN0dW1DdWxsZWQgPSB0cnVlO1xuICAgIHRoaXMubWVzaC5ib3VuZGluZ1NwaGVyZSA9IG5ldyBUSFJFRS5TcGhlcmUobmV3IFRIUkVFLlZlY3RvcjMoKSwgMCk7XG4gIH1cblxuICAvKiogTWFyZ2luIChtKSBhcm91bmQgaW5zdGFuY2Ugb3JpZ2lucyBjb3ZlcmluZyB0aGUgbGFyZ2VzdCBtb2RlbCBhbmQgcG9zZS4gKi9cbiAgc3RhdGljIHJlYWRvbmx5IEJPVU5EU19NQVJHSU4gPSA0O1xuICBwcml2YXRlIHJlYWRvbmx5IGxvID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgcHJpdmF0ZSByZWFkb25seSBoaSA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5cbiAgYmVnaW4oKTogdm9pZCB7IHRoaXMubiA9IDA7IHRoaXMubG8uc2V0KEluZmluaXR5LCBJbmZpbml0eSwgSW5maW5pdHkpOyB0aGlzLmhpLnNldCgtSW5maW5pdHksIC1JbmZpbml0eSwgLUluZmluaXR5KTsgfVxuXG4gIHB1c2gocDogQW5pbWFsUG9zZSk6IGJvb2xlYW4ge1xuICAgIGlmICh0aGlzLm4gPj0gdGhpcy5jYXBhY2l0eSkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGkgPSB0aGlzLm4rKztcbiAgICBjb25zdCBsaWUgPSBwLmx5aW5nID8gMSA6IDA7XG4gICAgdGhpcy5lLnNldChwLnBpdGNoID8/IDAsIHAuaGVhZGluZywgcC5yb2xsID8/IDAsICdZWFonKTtcbiAgICB0aGlzLnEuc2V0RnJvbUV1bGVyKHRoaXMuZSk7XG4gICAgdGhpcy52LnNldChwLngsIHAueSAtIGxpZSAqIHRoaXMubW9kZWwubGVnTGVuICogMC43ICogcC5zY2FsZSwgcC56KTtcbiAgICB0aGlzLnMuc2V0KHAuc2NhbGUsIHAuc2NhbGUsIHAuc2NhbGUpO1xuICAgIHRoaXMubWVzaC5zZXRNYXRyaXhBdChpLCB0aGlzLm0uY29tcG9zZSh0aGlzLnYsIHRoaXMucSwgdGhpcy5zKSk7XG4gICAgdGhpcy5sby5taW4odGhpcy52KTsgdGhpcy5oaS5tYXgodGhpcy52KTtcbiAgICB0aGlzLmFuaW0uc2V0WFlaVyhpLCBwLnBoYXNlLCBwLmxlZ1N3aW5nLCBwLmhlYWRQaXRjaCwgcC50YWlsV2FnKTtcbiAgICB0aGlzLnN0YXRlLnNldFhZWlcoaSwgcC5tYWxlID8gMSA6IDAsIHAueW91bmcgPyAxIDogMCwgbGllLCBwLmV4dHJhKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGVuZCgpOiB2b2lkIHtcbiAgICB0aGlzLm1lc2guY291bnQgPSB0aGlzLm47XG4gICAgdGhpcy5tZXNoLnZpc2libGUgPSB0aGlzLm4gPiAwO1xuICAgIGNvbnN0IHNwaGVyZSA9IHRoaXMubWVzaC5ib3VuZGluZ1NwaGVyZSE7XG4gICAgaWYgKHRoaXMubiA+IDApIHtcbiAgICAgIHNwaGVyZS5jZW50ZXIuYWRkVmVjdG9ycyh0aGlzLmxvLCB0aGlzLmhpKS5tdWx0aXBseVNjYWxhcigwLjUpO1xuICAgICAgc3BoZXJlLnJhZGl1cyA9IHRoaXMubG8uZGlzdGFuY2VUbyh0aGlzLmhpKSAvIDIgKyBBbmltYWxCYXRjaC5CT1VORFNfTUFSR0lOO1xuICAgIH1cbiAgICAvLyBVcGxvYWQgb25seSB0aGUgaW5zdGFuY2VzIGluIHVzZSwgbm90IHRoZSB3aG9sZSBjYXBhY2l0eS5cbiAgICBmb3IgKGNvbnN0IFthLCBzdHJpZGVdIG9mIFtbdGhpcy5tZXNoLmluc3RhbmNlTWF0cml4LCAxNl0sIFt0aGlzLmFuaW0sIDRdLCBbdGhpcy5zdGF0ZSwgNF1dIGFzIGNvbnN0KSB7XG4gICAgICBhLmNsZWFyVXBkYXRlUmFuZ2VzKCk7XG4gICAgICBpZiAodGhpcy5uID4gMCkgYS5hZGRVcGRhdGVSYW5nZSgwLCB0aGlzLm4gKiBzdHJpZGUpO1xuICAgICAgYS5uZWVkc1VwZGF0ZSA9IHRoaXMubiA+IDA7XG4gICAgfVxuICB9XG5cbiAgZ2V0IGNvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm47IH1cbn1cbiIsICJ7XG4gIFwic2NoZW1hXCI6IFwicGFsZXR0ZV92MlwiLFxuICBcImRhdGVcIjogXCIyMDI2LTEwLTIyXCIsXG4gIFwic3RhdHVzXCI6IFwicHJvcG9zZWRcIixcbiAgXCJzb3VyY2VcIjogXCJSRUYtMDAyIChoeWJyaWQgd29ybGQgcmVmZXJlbmNlKSwgdmFsdWVzIHNhbXBsZWQgYnkgZXllOyBudW1lcmljIHZlcmlmaWNhdGlvbiBwZW5kaW5nXCIsXG4gIFwibm90ZVwiOiBcIk9uZSBtYXRlcmlhbCBwYWxldHRlLiBUaW1lIG9mIGRheSBpcyBleHByZXNzZWQgYnkgdGhlIGxpZ2h0aW5nIHByZXNldHMgYmVsb3csIG5vdCBieSByZXBhaW50aW5nIG1hdGVyaWFscy5cIixcbiAgXCJtYXRlcmlhbHNcIjoge1xuICAgIFwiZ3Jhc3NfdG9wXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzc5Qjk0Q1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGxvdyBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19oaWdoXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhGQzk1RVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIG1pZCBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19wZWFrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlBRDA2QVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGhpZ2ggZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfY2FwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVFOTQ0MFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuMC0wLjQgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfb2NocmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQzk5QTVGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC40LTAuNjIgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfcnVzdFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCNDYzM0NcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjYyLTAuODAgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdG9uZV90b3BcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZERkNDXCIsXG4gICAgICBcInJvbGVcIjogXCJiYXJlIHN0b25lIHRvcCBzdXJmYWNlXCJcbiAgICB9LFxuICAgIFwic3RvbmVfYm9keV9hXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0RDRDNCRVwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBib2R5LCBldmVuIDQuNSBtIGJhbmRcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9ib2R5X2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDFDN0FGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJvZHksIG9kZCA0LjUgbSBiYW5kXCJcbiAgICB9LFxuICAgIFwic3RvbmVfc2hhZGVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjlBRTk2XCIsXG4gICAgICBcInJvbGVcIjogXCJjcmV2aWNlIC8gcmVjZXNzZWQgc3RvbmUgYWNjZW50XCJcbiAgICB9LFxuICAgIFwic2FuZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFM0QzQTZcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlIGNlbGxzXCJcbiAgICB9LFxuICAgIFwic25vd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNFRUYxRjVcIixcbiAgICAgIFwicm9sZVwiOiBcImdlbmVyYXRvciB2MiBzbm93ZmllbGRzIGFib3ZlIHRoZSBzbm93bGluZSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfc2tpblwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEOUE3N0VcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBza2luIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90dW5pY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNCMzRBM0NcIixcbiAgICAgIFwicm9sZVwiOiBcImZvdW5kZXIgdHVuaWMsIHdhcm0gcmVkIGFjY2VudCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfdHVuaWNfYWx0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJFOEM4NlwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZXIgdHVuaWMsIHRlYWwgYWNjZW50IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90cm91c2Vyc1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM1QjQ2MzZcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciB0cm91c2VycyAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfaGFpclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM0QTMzMjRcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBoYWlyIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9ib290c1wiOiB7XG4gICAgICBcImhleFwiOiBcIiMzMzI4MUZcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBib290cyBhbmQgYmVsdCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX2RlZXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEM1QjNBXCIsXG4gICAgICBcInJvbGVcIjogXCJyZWQgZGVlciBjb2F0IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfbGlnaHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRENDN0E0XCIsXG4gICAgICBcInJvbGVcIjogXCJkZWVyIGJlbGx5LCBoYXJlIHRhaWwsIGFudGxlciAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX2hhcmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUE4NjcwXCIsXG4gICAgICBcInJvbGVcIjogXCJoYXJlIGNvYXQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV90cm91dFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2RjdGNUVcIixcbiAgICAgIFwicm9sZVwiOiBcInRyb3V0IGJhY2sgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV90cm91dF9iZWxseVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEOEM5QTNcIixcbiAgICAgIFwicm9sZVwiOiBcInRyb3V0IGJlbGx5IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF9wbGFzdGVyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U4RERDNlwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSB3YWxsIHBsYXN0ZXIgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RpbWJlclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2QTQ1MzBcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgdGltYmVyIGZyYW1lIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aW1iZXJfbGlnaHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEE2MTQyXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIHBsYW5rcyBhbmQgZG9vcnMgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RoYXRjaFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNDN0EyNTdcIixcbiAgICAgIFwicm9sZVwiOiBcInRoYXRjaCByb29mIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aGF0Y2hfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QzdCM0NcIixcbiAgICAgIFwicm9sZVwiOiBcInRoYXRjaCByb29mIHNoYWRlIGNvdXJzZSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfc3RvbmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUI5QTkxXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIG1hc29ucnkgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3N0b25lX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNzQ3MzZDXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIG1hc29ucnkgam9pbnRzIGFuZCBwbGludGggKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJwcm9wX2lyb25cIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0EzQTNGXCIsXG4gICAgICBcInJvbGVcIjogXCJpcm9uIGZpdHRpbmdzIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwicHJvcF9nbG93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0ZGRDI3RlwiLFxuICAgICAgXCJyb2xlXCI6IFwibGFudGVybiBsaWdodCAoZW1pc3NpdmUsIGVmZmVjdCBvbmx5KSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcIndhdGVyX3NoYWxsb3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNjdDRkQ4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA8PSAwLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX21pZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzQUFGQzRcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoIH4xLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX2RlZXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkE4RkE4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA+PSA0LjAgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX3JpbVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCRkVBRjBcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlbGluZSByaW0gLyBmb2FtIHRpbnRcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fYVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1RkE4M0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGQjg0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM3RkMzNTZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgaGlnaGxpZ2h0IG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfcGlua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNGMkE2QzRcIixcbiAgICAgIFwicm9sZVwiOiBcImJsb3Nzb20gYWNjZW50IHNwZWNpZXMgb25seVwiXG4gICAgfSxcbiAgICBcImNhbm9weV9waW5rX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTg4RkIyXCIsXG4gICAgICBcInJvbGVcIjogXCJibG9zc29tIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJ0cnVua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM2QjRBMzNcIixcbiAgICAgIFwicm9sZVwiOiBcInRyZWUgdHJ1bmtzXCJcbiAgICB9LFxuICAgIFwiYmFya19kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRFMzYyNlwiLFxuICAgICAgXCJyb2xlXCI6IFwidHJ1bmsgc2hhZGUsIHN0dW1wc1wiXG4gICAgfSxcbiAgICBcImNvbmlmZXJfcGluZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM0QzhBNEFcIixcbiAgICAgIFwicm9sZVwiOiBcInBpbmUgbmVlZGxlcywgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiY29uaWZlcl9waW5lX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUM5QzUzXCIsXG4gICAgICBcInJvbGVcIjogXCJwaW5lIG5lZWRsZXMsIGhpZ2hsaWdodFwiXG4gICAgfSxcbiAgICBcImNvbmlmZXJfc3BydWNlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJGNkI0OFwiLFxuICAgICAgXCJyb2xlXCI6IFwic3BydWNlIG5lZWRsZXMsIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImNvbmlmZXJfc3BydWNlX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0U3RjU2XCIsXG4gICAgICBcInJvbGVcIjogXCJzcHJ1Y2UgbmVlZGxlcywgaGlnaGxpZ2h0XCJcbiAgICB9LFxuICAgIFwiYmlyY2hfYmFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNFNkUxRDNcIixcbiAgICAgIFwicm9sZVwiOiBcInBhbGUgYmlyY2ggdHJ1bmtcIlxuICAgIH0sXG4gICAgXCJiaXJjaF9tYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNBMzUzMFwiLFxuICAgICAgXCJyb2xlXCI6IFwiZGFyayBiaXJjaCBiYXJrIGJhbmRcIlxuICAgIH0sXG4gICAgXCJiaXJjaF9sZWFmXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlDQzk1QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmlyY2ggY2Fub3B5LCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJiaXJjaF9sZWFmX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjNENzZCXCIsXG4gICAgICBcInJvbGVcIjogXCJiaXJjaCBjYW5vcHksIGhpZ2hsaWdodFwiXG4gICAgfSxcbiAgICBcImJlZWNoX2JhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEU4OTdEXCIsXG4gICAgICBcInJvbGVcIjogXCJzbW9vdGggZ3JleSBiZWVjaCB0cnVua1wiXG4gICAgfSxcbiAgICBcImJlZWNoX2xlYWZcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNTU4RjNBXCIsXG4gICAgICBcInJvbGVcIjogXCJiZWVjaCBjYW5vcHksIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJiZWVjaF9sZWFmX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNjdBNDQ1XCIsXG4gICAgICBcInJvbGVcIjogXCJiZWVjaCBjYW5vcHksIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImJ1c2hfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM0NjdGMzdcIixcbiAgICAgIFwicm9sZVwiOiBcImJlcnJ5IGJ1c2ggbGVhdmVzXCJcbiAgICB9LFxuICAgIFwiYmVycnlfcmVkXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0M4Mzk0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmVycmllc1wiXG4gICAgfSxcbiAgICBcImZlcm5fZ3JlZW5cIjoge1xuICAgICAgXCJoZXhcIjogXCIjODZCRTU1XCIsXG4gICAgICBcInJvbGVcIjogXCJmZXJuIGZyb25kcywgbWFpblwiXG4gICAgfSxcbiAgICBcImZlcm5fZ3JlZW5fYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2RkE3NDZcIixcbiAgICAgIFwicm9sZVwiOiBcImZlcm4gZnJvbmRzLCBzaGFkZVwiXG4gICAgfSxcbiAgICBcImZsb3dlcl95ZWxsb3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRjJDRjRBXCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IG1lYWRvdyBmbG93ZXIgaGVhZHNcIlxuICAgIH0sXG4gICAgXCJmbG93ZXJfd2hpdGVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRjRGMUU0XCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IGRhaXN5IGZsb3dlciBoZWFkc1wiXG4gICAgfSxcbiAgICBcImZsb3dlcl92aW9sZXRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUM3QkQ2XCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IHZpb2xldCBmbG93ZXIgaGVhZHNcIlxuICAgIH0sXG4gICAgXCJtdXNocm9vbV9jYXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjg0ODNBXCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IGZvcmVzdCBtdXNocm9vbSBjYXBcIlxuICAgIH0sXG4gICAgXCJtdXNocm9vbV9zdGVtXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0VERTNDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiBtdXNocm9vbSBzdGVtXCJcbiAgICB9LFxuICAgIFwibW9zc19ncmVlblwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1QzhDM0FcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogbW9zcyBvbiBmYWxsZW4gbG9nc1wiXG4gICAgfSxcbiAgICBcIm9yZV9jcnlzdGFsXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzdCNUFENlwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGRlcG9zaXQgYWNjZW50IChwcm9wb3NlZCwgcmVwbGFjZXMgdGVhbClcIlxuICAgIH0sXG4gICAgXCJvcmVfY3J5c3RhbF9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlCN0JFOFwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGhpZ2hsaWdodCBmYWNldFwiXG4gICAgfSxcbiAgICBcIm5veGVsX3N0b25lXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2REZDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgYXJjaGl0ZWN0dXJlIG1haW4gc3RvbmVcIlxuICAgIH0sXG4gICAgXCJub3hlbF9zdG9uZV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QzQzlCNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgc2Vjb25kYXJ5IHN0b25lIC8gcmVjZXNzXCJcbiAgICB9LFxuICAgIFwiYWNjZW50X2JsdWVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0U3RkI4XCIsXG4gICAgICBcInJvbGVcIjogXCJiYW5uZXIgLyBjbG90aCBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJhY2NlbnRfdGVhbFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyRkE2QTBcIixcbiAgICAgIFwicm9sZVwiOiBcInNlY29uZGFyeSBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJlbWlzc2l2ZV9maXJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0ZGOUU0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2FtcGZpcmUgLyB3YXJtIGVtaXNzaXZlIChlZmZlY3RzIG9ubHkpXCJcbiAgICB9LFxuICAgIFwiZW1pc3NpdmVfbWFnaWNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDI0QkZGXCIsXG4gICAgICBcInJvbGVcIjogXCJyZXNlcnZlZDogbWFnaWMgZWZmZWN0cyBvbmx5LCBuZXZlciBtYXRlcmlhbHNcIlxuICAgIH1cbiAgfSxcbiAgXCJsaWdodGluZ1wiOiB7XG4gICAgXCJkYXduXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDEyLFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDEwNSxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZDNzlBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAyLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEZBNkM4XCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNEU1RjZFXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMC42LFxuICAgICAgXCJza3lcIjogXCIjQThCRUQ2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNBOEJFRDZcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNSxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4xXG4gICAgfSxcbiAgICBcIm5vb25cIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogMzgsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogNTAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGRjREQ1wiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMi43NSxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiNCRkQ5RjJcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM3QThGNTVcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAwLjU1LFxuICAgICAgXCJza3lcIjogXCIjOUVEMkVFXCIsXG4gICAgICBcImZvZ1wiOiBcIiNEQ0VGRjhcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMjgsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMDVcbiAgICB9LFxuICAgIFwiZHVza1wiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiA5LFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDI1MCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZCMjdBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAzLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEU3QzlFXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNUE0QTUwXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMS4xLFxuICAgICAgXCJza3lcIjogXCIjQzk4RTg2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNDMDkwOEFcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMzYsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMzJcbiAgICB9LFxuICAgIFwibmlnaHRcIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogNDAsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMjIwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNBRkM4RkZcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDEuMCxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiMzQTRDN0FcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiMxQzI1NDBcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAxLjA1LFxuICAgICAgXCJza3lcIjogXCIjMTAxNzM2XCIsXG4gICAgICBcImZvZ1wiOiBcIiMxNTFDM0NcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNDUsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuNVxuICAgIH1cbiAgfVxufSIsICIvLyBCbG9jayBtb2RlbHMgZm9yIGV2ZXJ5IGFuaW1hbCwgZnJvbSB0aGUgb3duZXIncyByZWZlcmVuY2Ugc2hlZXRzXG4vLyAoMDVfTm94ZWxfU3R1ZGlvL0Fzc2V0X1NoZWV0cy8yMDI2LTExLTI0X2FuaW1hbHMpLiBQbGFpbiBjb2xvdXJzIG9ubHksIHRocmVlXG4vLyB0byBmaXZlIHBlciBzcGVjaWVzLiBUd28gY29uc3RydWN0aW9uIHN0eWxlcywgYXMgdGhlIG93bmVyIGRlc2NyaWJlZDpcbi8vICAgZG9tZXN0aWM6IGNodW5reSwgYmlnIGhlYWRzLCBsYXJnZSByZWFkYWJsZSBibG9ja3MgKGNhdHRsZSwgZ29hdCwgcGlnLCBob3JzZSwgY2hpY2tlbilcbi8vICAgICAgICAgICAgIGFuZCBvbmUgY3ViZS1jbHVzdGVyIGNvYXQgKHNoZWVwKTtcbi8vICAgd2lsZGxpZmU6IG1vcmUgbmF0dXJhbCBwcm9wb3J0aW9ucyBmcm9tIHNtYWxsZXIgYmxvY2tzIChkZWVyLCBmb3gsIHdvbGYsIGhhcmUsIHRyb3V0KS5cbi8vIExvY2FsIHNwYWNlOiAreiBmb3J3YXJkLCB5IHVwLCBncm91bmQgYXQgMCwgbWV0cmVzLlxuaW1wb3J0IHsgQUJveCwgQW5pbWFsTW9kZWwsIFBBUlQsIGJ4IH0gZnJvbSAnLi9hbmltYWwta2l0JztcblxuY29uc3QgeyBib2R5LCBsZWdBLCBsZWdCLCBoZWFkLCB0YWlsLCB3aW5nLCB3b29sLCBtYWxlIH0gPSBQQVJUO1xuLyoqIERpYWdvbmFsIGdhaXQ6IGZyb250LWxlZnQgd2l0aCBiYWNrLXJpZ2h0LCBmcm9udC1yaWdodCB3aXRoIGJhY2stbGVmdC4gKi9cbmNvbnN0IGxlZ1NldCA9ICh4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gKHggPiAwKSA9PT0gKHogPiAwKSA/IGxlZ0EgOiBsZWdCO1xuXG4vKiogRm91ciBsZWdzOiBhIHNoYWZ0LCBhbiBvcHRpb25hbCBmb290IGJsb2NrLCBoaW5nZWQgYXQgdGhlIGhpcC4gKi9cbmZ1bmN0aW9uIGxlZ3Moc3BvdHM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+LCBoaXA6IG51bWJlciwgdzogbnVtYmVyLCBzaGFmdDogbnVtYmVyLCBzaGFmdENvbG91cjogc3RyaW5nLFxuICBmb290PzogeyBjOiBzdHJpbmc7IGg6IG51bWJlcjsgdz86IG51bWJlciB9KTogQUJveFtdIHtcbiAgY29uc3Qgb3V0OiBBQm94W10gPSBbXTtcbiAgZm9yIChjb25zdCBbeCwgel0gb2Ygc3BvdHMpIHtcbiAgICBjb25zdCBwYXJ0ID0gbGVnU2V0KHgsIHopLCBwdjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gW3gsIGhpcCwgel07XG4gICAgb3V0LnB1c2goYngodywgc2hhZnQsIHcsIHgsIGhpcCAtIHNoYWZ0IC8gMiwgeiwgc2hhZnRDb2xvdXIsIHBhcnQsIHB2KSk7XG4gICAgaWYgKGZvb3QpIG91dC5wdXNoKGJ4KGZvb3QudyA/PyB3ICsgMC4wMiwgZm9vdC5oLCAoZm9vdC53ID8/IHcgKyAwLjAyKSArIDAuMDIsIHgsIGZvb3QuaCAvIDIsIHogKyAwLjAxLCBmb290LmMsIHBhcnQsIHB2KSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuLy8gLS0tLS0tLS0tLSBkb21lc3RpYyAtLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGNhdHRsZSgpOiBBbmltYWxNb2RlbCB7XG4gIGNvbnN0IENPQVQgPSAnI0M1OEE0NycsIERBUksgPSAnIzhBNTQyOCcsIE1VWlpMRSA9ICcjRTdBRTkzJywgSE9STiA9ICcjRUJEN0I1JywgSE9PRiA9ICcjNEIyRjFFJztcbiAgY29uc3QgUDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gWzAsIDEuMywgMC43NV07XG4gIHJldHVybiB7XG4gICAgaWQ6ICdjYXR0bGUnLCBsZWdMZW46IDAuNjYsXG4gICAgYm94ZXM6IFtcbiAgICAgIGJ4KDAuOTIsIDAuNzgsIDEuNSwgMCwgMS4wLCAtMC4wNSwgQ09BVCksXG4gICAgICBieCgwLjk0LCAwLjIyLCAwLjgsIDAsIDEuMzIsIDAuMywgREFSSyksXG4gICAgICBieCgwLjcsIDAuMywgMC40LCAwLCAwLjc4LCAtMC42MiwgREFSSyksXG4gICAgICAuLi5sZWdzKFtbMC4zLCAwLjVdLCBbLTAuMywgMC41XSwgWzAuMywgLTAuNTVdLCBbLTAuMywgLTAuNTVdXSwgMC42NiwgMC4yNCwgMC41LCBDT0FULCB7IGM6IEhPT0YsIGg6IDAuMTQsIHc6IDAuMjYgfSksXG4gICAgICBieCgwLjYyLCAwLjU4LCAwLjUyLCAwLCAxLjI4LCAxLjEsIENPQVQsIGhlYWQsIFApLFxuICAgICAgYngoMC41LCAwLjMsIDAuMiwgMCwgMS4xMiwgMS40MiwgTVVaWkxFLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuNSwgMC4xMiwgMC4zNCwgMCwgMS42LCAxLjA1LCBEQVJLLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMTIsIDAuMTIsIDAuMDMsIDAuMTcsIDEuMzQsIDEuMzcsICcjRkZGRkZGJywgaGVhZCwgUCksIGJ4KDAuMTIsIDAuMTIsIDAuMDMsIC0wLjE3LCAxLjM0LCAxLjM3LCAnI0ZGRkZGRicsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNiwgMC4wOCwgMC4wMzUsIDAuMTcsIDEuMzMsIDEuMzksICcjMTQxNDE0JywgaGVhZCwgUCksIGJ4KDAuMDYsIDAuMDgsIDAuMDM1LCAtMC4xNywgMS4zMywgMS4zOSwgJyMxNDE0MTQnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDgsIDAuMDYsIDAuMDMsIDAuMTIsIDEuMTYsIDEuNTIsICcjOEE1QTRBJywgaGVhZCwgUCksIGJ4KDAuMDgsIDAuMDYsIDAuMDMsIC0wLjEyLCAxLjE2LCAxLjUyLCAnIzhBNUE0QScsIGhlYWQsIFApLFxuICAgICAgYngoMC4yMiwgMC4wOCwgMC4xNCwgMC40MiwgMS40MiwgMC45OCwgREFSSywgaGVhZCwgUCksIGJ4KDAuMjIsIDAuMDgsIDAuMTQsIC0wLjQyLCAxLjQyLCAwLjk4LCBEQVJLLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC4xLCAwLjE0LCAwLjM2LCAxLjUyLCAxLjAyLCBIT1JOLCBoZWFkLCBQKSwgYngoMC4xLCAwLjEsIDAuMTQsIC0wLjM2LCAxLjUyLCAxLjAyLCBIT1JOLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC4yNiwgMC4xLCAwLjQyLCAxLjcsIDEuMDIsIEhPUk4sIGhlYWQgKyBtYWxlLCBQKSwgYngoMC4xLCAwLjI2LCAwLjEsIC0wLjQyLCAxLjcsIDEuMDIsIEhPUk4sIGhlYWQgKyBtYWxlLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC41NSwgMC4xLCAwLCAxLjA1LCAtMC44NCwgREFSSywgdGFpbCwgWzAsIDEuMywgLTAuOF0pLFxuICAgICAgYngoMC4xNCwgMC4xNiwgMC4xNCwgMCwgMC43MiwgLTAuODQsIERBUkssIHRhaWwsIFswLCAxLjMsIC0wLjhdKSxcbiAgICBdLFxuICB9O1xufVxuXG5mdW5jdGlvbiBzaGVlcCgpOiBBbmltYWxNb2RlbCB7XG4gIGNvbnN0IEZBQ0UgPSAnI0U5RDlCOCcsIExFRyA9ICcjQ0RBQTdEJywgREFSSyA9ICcjM0EzMjJDJywgV09PTFMgPSBbJyNGNkY1RjAnLCAnI0VDRTlFMCcsICcjRkJGQUY3J107XG4gIGNvbnN0IFA6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFswLCAwLjk1LCAwLjVdO1xuICBjb25zdCBDOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbMCwgMC44MywgLTAuMTFdO1xuICBjb25zdCBib3hlczogQUJveFtdID0gW1xuICAgIGJ4KDAuNSwgMC40LCAwLjksIDAsIDAuODMsIC0wLjExLCAnI0RERDhDQicsIHdvb2wsIEMpLFxuICAgIC4uLmxlZ3MoW1swLjIsIDAuMzJdLCBbLTAuMiwgMC4zMl0sIFswLjIsIC0wLjM0XSwgWy0wLjIsIC0wLjM0XV0sIDAuNTgsIDAuMTEsIDAuNTgsIExFRyksXG4gIF07XG4gIC8vIFRoZSBjb2F0IGlzIGEgbG9vc2UgY2x1c3RlciBvZiBjdWJlcyB3aXRoIGdhcHMsIGxpa2UgdGhlIGN1YmUtYnVpbHQgcmVmZXJlbmNlLlxuICBjb25zdCBzID0gMC4yMywgeHMgPSBbLTAuMzQsIC0wLjExLCAwLjEyLCAwLjM1XSwgeXMgPSBbMC42MiwgMC44NSwgMS4wOF0sIHpzID0gWy0wLjU2LCAtMC4zMywgLTAuMSwgMC4xMywgMC4zNl07XG4gIGxldCBrID0gMDtcbiAgeHMuZm9yRWFjaCgoeCwgaXgpID0+IHlzLmZvckVhY2goKHksIGl5KSA9PiB6cy5mb3JFYWNoKCh6LCBpeikgPT4ge1xuICAgIGNvbnN0IHNoZWxsID0gaXggPT09IDAgfHwgaXggPT09IHhzLmxlbmd0aCAtIDEgfHwgaXkgPT09IDAgfHwgaXkgPT09IHlzLmxlbmd0aCAtIDEgfHwgaXogPT09IDAgfHwgaXogPT09IHpzLmxlbmd0aCAtIDE7XG4gICAgaWYgKCFzaGVsbCkgcmV0dXJuO1xuICAgIGsrKztcbiAgICBpZiAoaXkgPCB5cy5sZW5ndGggLSAxICYmIChrICogNzkxOSkgJSAxMSA9PT0gMCkgcmV0dXJuOyAgICAgIC8vIGdhcHMgaW4gdGhlIHNpZGVzXG4gICAgLy8gQ3ViZXMgc2l0IGEgbGl0dGxlIGluIG9yIG91dCBzbyB0aGUgY29hdCBoYXMgYSBzdGVwcGVkLCBjdWJlLWJ1aWx0IHN1cmZhY2UuXG4gICAgY29uc3QgaiA9IChuOiBudW1iZXIpID0+ICgoKGsgKiBuKSAlIDUpIC0gMikgKiAwLjAyNTtcbiAgICBib3hlcy5wdXNoKGJ4KHMsIHMsIHMsIHggKyAoaXggPT09IDAgfHwgaXggPT09IHhzLmxlbmd0aCAtIDEgPyBqKDEzKSA6IDApLCB5ICsgKGl5ID09PSB5cy5sZW5ndGggLSAxID8gaig3KSA6IDApLCB6ICsgKGl6ID09PSAwIHx8IGl6ID09PSB6cy5sZW5ndGggLSAxID8gaigxMSkgOiAwKSwgV09PTFNbKGsgKiAzMSkgJSAzXSwgd29vbCwgQykpO1xuICB9KSkpO1xuICBib3hlcy5wdXNoKFxuICAgIGJ4KDAuMywgMC4zMiwgMC4zNCwgMCwgMC45LCAwLjY2LCBGQUNFLCBoZWFkLCBQKSxcbiAgICBieCgwLjM0LCAwLjE0LCAwLjMyLCAwLCAxLjEsIDAuNiwgV09PTFNbMF0sIGhlYWQsIFApLFxuICAgIGJ4KDAuMTQsIDAuMTIsIDAuMDYsIDAsIDAuODUsIDAuODQ1LCBEQVJLLCBoZWFkLCBQKSxcbiAgICBieCgwLjA3LCAwLjA3LCAwLjAzLCAwLjA4LCAwLjk2LCAwLjgzNSwgREFSSywgaGVhZCwgUCksIGJ4KDAuMDcsIDAuMDcsIDAuMDMsIC0wLjA4LCAwLjk2LCAwLjgzNSwgREFSSywgaGVhZCwgUCksXG4gICAgYngoMC4xNiwgMC4wNiwgMC4xLCAwLjIsIDAuOTgsIDAuNiwgRkFDRSwgaGVhZCwgUCwgeyByejogLTAuNCB9KSwgYngoMC4xNiwgMC4wNiwgMC4xLCAtMC4yLCAwLjk4LCAwLjYsIEZBQ0UsIGhlYWQsIFAsIHsgcno6IDAuNCB9KSxcbiAgICBieCgwLjA5LCAwLjIsIDAuMDksIDAuMiwgMS4xLCAwLjYyLCAnI0I5QTA3QScsIGhlYWQgKyBtYWxlLCBQKSwgYngoMC4wOSwgMC4wOSwgMC4yLCAwLjIsIDEuMiwgMC41NCwgJyNCOUEwN0EnLCBoZWFkICsgbWFsZSwgUCksXG4gICAgYngoMC4wOSwgMC4yLCAwLjA5LCAtMC4yLCAxLjEsIDAuNjIsICcjQjlBMDdBJywgaGVhZCArIG1hbGUsIFApLCBieCgwLjA5LCAwLjA5LCAwLjIsIC0wLjIsIDEuMiwgMC41NCwgJyNCOUEwN0EnLCBoZWFkICsgbWFsZSwgUCksXG4gICAgYngoMC4xMywgMC4xMywgMC4xMywgMCwgMC44NSwgLTAuNywgV09PTFNbMV0sIHRhaWwsIFswLCAwLjg1LCAtMC42Nl0pLFxuICApO1xuICByZXR1cm4geyBpZDogJ3NoZWVwJywgbGVnTGVuOiAwLjU4LCBib3hlcyB9O1xufVxuXG5mdW5jdGlvbiBnb2F0KCk6IEFuaW1hbE1vZGVsIHtcbiAgY29uc3QgQ09BVCA9ICcjQjA5Qjc4JywgTElHSFQgPSAnI0Q3QzlBNScsIFBBTEUgPSAnI0U0RTBDOCcsIEhPUk4gPSAnIzRBNEE0QycsIFdISVRFID0gJyNGMkYwRTYnLCBQSU5LID0gJyNFODlBQTAnO1xuICBjb25zdCBQOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbMCwgMS4wLCAwLjVdO1xuICByZXR1cm4ge1xuICAgIGlkOiAnZ29hdCcsIGxlZ0xlbjogMC41NSxcbiAgICBib3hlczogW1xuICAgICAgYngoMC40MiwgMC40NiwgMS4wLCAwLCAwLjc4LCAtMC4wMiwgQ09BVCksXG4gICAgICBieCgwLjIsIDAuMDYsIDAuOTUsIDAsIDEuMDQsIC0wLjAyLCBMSUdIVCksXG4gICAgICBieCgwLjM2LCAwLjA2LCAwLjgsIDAsIDAuNTMsIDAsIFBBTEUpLFxuICAgICAgLi4ubGVncyhbWzAuMTUsIDAuMzRdLCBbLTAuMTUsIDAuMzRdLCBbMC4xNSwgLTAuMzhdLCBbLTAuMTUsIC0wLjM4XV0sIDAuNTUsIDAuMSwgMC40NiwgQ09BVCwgeyBjOiBXSElURSwgaDogMC4xIH0pLFxuICAgICAgYngoMC4yNCwgMC40LCAwLjI0LCAwLCAxLjEsIDAuNSwgQ09BVCwgaGVhZCwgUCksXG4gICAgICBieCgwLjMsIDAuMzIsIDAuMzQsIDAsIDEuMjgsIDAuNywgQ09BVCwgaGVhZCwgUCksXG4gICAgICBieCgwLjE4LCAwLjE4LCAwLjIsIDAsIDEuMTgsIDAuOTUsIExJR0hULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMTYsIDAuMDUsIDAuMDYsIDAsIDEuMDgsIDEuMDIsIFBJTkssIGhlYWQsIFApLFxuICAgICAgYngoMC4xLCAwLjA2LCAwLjA0LCAwLCAxLjI0LCAxLjA2LCAnIzFBMUExQScsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNywgMC4xNCwgMC4wNywgMCwgMC45OSwgMC45NywgV0hJVEUsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNywgMC4xMiwgMC4wNywgMCwgMC44OCwgMC45NywgV0hJVEUsIGhlYWQgKyBtYWxlLCBQKSxcbiAgICAgIGJ4KDAuMDUsIDAuMSwgMC4wMiwgMC4xLCAxLjMxLCAwLjg3NSwgJyNGRkZGRkYnLCBoZWFkLCBQKSwgYngoMC4wNSwgMC4xLCAwLjAyLCAtMC4xLCAxLjMxLCAwLjg3NSwgJyNGRkZGRkYnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDMsIDAuMSwgMC4wMywgMC4xLCAxLjMxLCAwLjg4NSwgJyMxNDE0MTQnLCBoZWFkLCBQKSwgYngoMC4wMywgMC4xLCAwLjAzLCAtMC4xLCAxLjMxLCAwLjg4NSwgJyMxNDE0MTQnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDcsIDAuMiwgMC4wNywgMC4wOSwgMS41NSwgMC42NCwgSE9STiwgaGVhZCwgUCksIGJ4KDAuMDcsIDAuMiwgMC4wNywgLTAuMDksIDEuNTUsIDAuNjQsIEhPUk4sIGhlYWQsIFApLFxuICAgICAgYngoMC4wNywgMC4wNywgMC4xNywgMC4wOSwgMS42NywgMC41OCwgSE9STiwgaGVhZCwgUCksIGJ4KDAuMDcsIDAuMDcsIDAuMTcsIC0wLjA5LCAxLjY3LCAwLjU4LCBIT1JOLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC4wNiwgMC4xNiwgMC4yLCAxLjMsIDAuNjYsIENPQVQsIGhlYWQsIFAsIHsgcno6IC0wLjM1IH0pLCBieCgwLjEsIDAuMDYsIDAuMTYsIC0wLjIsIDEuMywgMC42NiwgQ09BVCwgaGVhZCwgUCwgeyByejogMC4zNSB9KSxcbiAgICAgIGJ4KDAuMDgsIDAuMiwgMC4wOCwgMCwgMC45OCwgLTAuNTUsIENPQVQsIHRhaWwsIFswLCAwLjk1LCAtMC41Ml0pLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHBpZygpOiBBbmltYWxNb2RlbCB7XG4gIGNvbnN0IFBJTksgPSAnI0YyQTlBMycsIFNOT1VUID0gJyNFODgyN0QnLCBFQVIgPSAnI0U1OEI4NicsIElOTkVSID0gJyNGMDZCNjYnLCBIT09GID0gJyNFMDcwNkEnO1xuICBjb25zdCBQOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbMCwgMC43LCAwLjVdO1xuICByZXR1cm4ge1xuICAgIGlkOiAncGlnJywgbGVnTGVuOiAwLjM0LFxuICAgIGJveGVzOiBbXG4gICAgICBieCgwLjcsIDAuNTUsIDEuMCwgMCwgMC42MiwgLTAuMDUsIFBJTkspLFxuICAgICAgLi4ubGVncyhbWzAuMiwgMC4zXSwgWy0wLjIsIDAuM10sIFstMC4yLCAtMC4zMl0sIFswLjIsIC0wLjMyXV0sIDAuMzQsIDAuMTcsIDAuMjYsIFBJTkssIHsgYzogSE9PRiwgaDogMC4xIH0pLFxuICAgICAgYngoMC41MiwgMC40NiwgMC40NCwgMCwgMC42NiwgMC43LCBQSU5LLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMzQsIDAuMjQsIDAuMTYsIDAsIDAuNTgsIDAuOTgsIFNOT1VULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDUsIDAuMDgsIDAuMDMsIDAuMDcsIDAuNTgsIDEuMDc1LCAnI0I4NTA0QycsIGhlYWQsIFApLCBieCgwLjA1LCAwLjA4LCAwLjAzLCAtMC4wNywgMC41OCwgMS4wNzUsICcjQjg1MDRDJywgaGVhZCwgUCksXG4gICAgICBieCgwLjEsIDAuMTIsIDAuMDMsIDAuMTcsIDAuNzYsIDAuOTI1LCAnIzE0MTQxNCcsIGhlYWQsIFApLCBieCgwLjEsIDAuMTIsIDAuMDMsIC0wLjE3LCAwLjc2LCAwLjkyNSwgJyMxNDE0MTQnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMiwgMC4wNiwgMC4yLCAwLjIsIDAuOTQsIDAuNjQsIEVBUiwgaGVhZCwgUCksIGJ4KDAuMiwgMC4wNiwgMC4yLCAtMC4yLCAwLjk0LCAwLjY0LCBFQVIsIGhlYWQsIFApLFxuICAgICAgYngoMC4xMiwgMC4wMywgMC4xMiwgMC4yLCAwLjk3NSwgMC42NCwgSU5ORVIsIGhlYWQsIFApLCBieCgwLjEyLCAwLjAzLCAwLjEyLCAtMC4yLCAwLjk3NSwgMC42NCwgSU5ORVIsIGhlYWQsIFApLFxuICAgICAgYngoMC4wOCwgMC4xNCwgMC4wOCwgMCwgMC43OCwgLTAuNTgsIFBJTkssIHRhaWwsIFswLCAwLjcsIC0wLjU1XSksXG4gICAgICBieCgwLjEyLCAwLjA3LCAwLjA4LCAwLjA0LCAwLjg4LCAtMC42LCBQSU5LLCB0YWlsLCBbMCwgMC43LCAtMC41NV0pLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNoaWNrZW4oKTogQW5pbWFsTW9kZWwge1xuICBjb25zdCBXSElURSA9ICcjRjNGMUVBJywgU0hBREUgPSAnI0UzRTBENicsIFJFRCA9ICcjQjgyNDJCJywgT1JBTkdFID0gJyNGMjlBMkUnLCBMRUcgPSAnI0M5OEM1QScsIEZFQVRIRVIgPSAnIzNFNEI1Mic7XG4gIGNvbnN0IFA6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFswLCAwLjUsIDAuMl07XG4gIGNvbnN0IHdpbmdQaXZvdCA9ICh4OiBudW1iZXIpOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPT4gW3gsIDAuNDYsIC0wLjAyXTtcbiAgcmV0dXJuIHtcbiAgICBpZDogJ2NoaWNrZW4nLCBsZWdMZW46IDAuMTgsIHlvdW5nVGludDogJyNGM0Q5NEEnLFxuICAgIGJveGVzOiBbXG4gICAgICBieCgwLjM0LCAwLjMyLCAwLjQyLCAwLCAwLjM0LCAtMC4wMiwgV0hJVEUpLFxuICAgICAgYngoMC4zLCAwLjE0LCAwLjEsIDAsIDAuMjYsIDAuMiwgU0hBREUpLFxuICAgICAgYngoMC4wNCwgMC4xOCwgMC4wNCwgMC4wNywgMC4wOSwgMCwgTEVHLCBsZWdBLCBbMC4wNywgMC4xOCwgMF0pLCBieCgwLjA0LCAwLjE4LCAwLjA0LCAtMC4wNywgMC4wOSwgMCwgTEVHLCBsZWdCLCBbLTAuMDcsIDAuMTgsIDBdKSxcbiAgICAgIGJ4KDAuMSwgMC4wMywgMC4xMiwgMC4wNywgMC4wMTUsIDAuMDMsIExFRywgbGVnQSwgWzAuMDcsIDAuMTgsIDBdKSwgYngoMC4xLCAwLjAzLCAwLjEyLCAtMC4wNywgMC4wMTUsIDAuMDMsIExFRywgbGVnQiwgWy0wLjA3LCAwLjE4LCAwXSksXG4gICAgICBieCgwLjA1LCAwLjIsIDAuMjgsIDAuMiwgMC4zOCwgLTAuMDIsIFNIQURFLCB3aW5nLCB3aW5nUGl2b3QoMC4xOCkpLCBieCgwLjA1LCAwLjIsIDAuMjgsIC0wLjIsIDAuMzgsIC0wLjAyLCBTSEFERSwgd2luZywgd2luZ1Bpdm90KC0wLjE4KSksXG4gICAgICBieCgwLjIyLCAwLjI0LCAwLjIyLCAwLCAwLjYsIDAuMiwgV0hJVEUsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNiwgMC4wOCwgMC4xOCwgMCwgMC43NiwgMC4yLCBSRUQsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNywgMC4xNCwgMC4yMiwgMCwgMC44MiwgMC4yLCBSRUQsIGhlYWQgKyBtYWxlLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC4wNiwgMC4xLCAwLCAwLjU4LCAwLjM0LCBPUkFOR0UsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNSwgMC4wNywgMC4wNSwgMCwgMC41LCAwLjMyLCBSRUQsIGhlYWQsIFApLFxuICAgICAgYngoMC4wMywgMC4wNywgMC4wMiwgMC4wOCwgMC42NCwgMC4zMSwgJyMxNDE0MTQnLCBoZWFkLCBQKSwgYngoMC4wMywgMC4wNywgMC4wMiwgLTAuMDgsIDAuNjQsIDAuMzEsICcjMTQxNDE0JywgaGVhZCwgUCksXG4gICAgICBieCgwLjIsIDAuMTYsIDAuMDcsIDAsIDAuNDYsIC0wLjI1LCBXSElURSwgdGFpbCwgWzAsIDAuNCwgLTAuMjJdKSxcbiAgICAgIC4uLlstMC4wOSwgLTAuMDMsIDAuMDMsIDAuMDldLm1hcCgoeCwgaSkgPT4gYngoMC4wNCwgMC4zMiwgMC4wNCwgeCwgMC42NiwgLTAuMyAtIChpICUgMikgKiAwLjAzLCBGRUFUSEVSLCB0YWlsICsgbWFsZSwgWzAsIDAuNCwgLTAuMjJdKSksXG4gICAgXSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gaG9yc2UoKTogQW5pbWFsTW9kZWwge1xuICBjb25zdCBDT0FUID0gJyM4RTRGMjcnLCBNQU5FID0gJyMzQjIyMTgnLCBNVVpaTEUgPSAnIzVBMzMyMCcsIEhPT0YgPSAnIzMzMjAxQScsIFBJTksgPSAnI0U5QTNBMCc7XG4gIGNvbnN0IFA6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFswLCAxLjQ1LCAwLjhdO1xuICByZXR1cm4ge1xuICAgIGlkOiAnaG9yc2UnLCBsZWdMZW46IDAuOTUsXG4gICAgYm94ZXM6IFtcbiAgICAgIGJ4KDAuNjIsIDAuNjYsIDEuNSwgMCwgMS4yMiwgLTAuMDUsIENPQVQpLFxuICAgICAgYngoMC41LCAwLjEsIDEuMiwgMCwgMC45LCAtMC4wNSwgJyNBMDYyMzUnKSxcbiAgICAgIC4uLmxlZ3MoW1swLjIsIDAuNTVdLCBbLTAuMiwgMC41NV0sIFswLjIsIC0wLjZdLCBbLTAuMiwgLTAuNl1dLCAwLjk1LCAwLjE3LCAwLjgyLCBDT0FULCB7IGM6IEhPT0YsIGg6IDAuMTMsIHc6IDAuMTkgfSksXG4gICAgICBieCgwLjMsIDAuNywgMC4zNCwgMCwgMS43LCAwLjksIENPQVQsIGhlYWQsIFApLFxuICAgICAgYngoMC4zMiwgMC4zNiwgMC42MiwgMCwgMi4wLCAxLjE1LCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMywgMC4yNiwgMC4yLCAwLCAxLjg4LCAxLjUsIE1VWlpMRSwgaGVhZCwgUCksXG4gICAgICBieCgwLjA2LCAwLjA1LCAwLjAzLCAwLjA4LCAxLjkyLCAxLjYwNSwgJyMxNDE0MTQnLCBoZWFkLCBQKSwgYngoMC4wNiwgMC4wNSwgMC4wMywgLTAuMDgsIDEuOTIsIDEuNjA1LCAnIzE0MTQxNCcsIGhlYWQsIFApLFxuICAgICAgYngoMC4xLCAwLjEsIDAuMDMsIDAuMDksIDIuMDgsIDEuNDY1LCAnI0ZGRkZGRicsIGhlYWQsIFApLCBieCgwLjEsIDAuMSwgMC4wMywgLTAuMDksIDIuMDgsIDEuNDY1LCAnI0ZGRkZGRicsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNSwgMC4wNiwgMC4wMzUsIDAuMDksIDIuMDcsIDEuNDgsICcjMTQxNDE0JywgaGVhZCwgUCksIGJ4KDAuMDUsIDAuMDYsIDAuMDM1LCAtMC4wOSwgMi4wNywgMS40OCwgJyMxNDE0MTQnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC4yLCAwLjA4LCAwLjEsIDIuMjcsIDEuMCwgQ09BVCwgaGVhZCwgUCksIGJ4KDAuMSwgMC4yLCAwLjA4LCAtMC4xLCAyLjI3LCAxLjAsIENPQVQsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNSwgMC4xMiwgMC4wMiwgMC4xLCAyLjI2LCAxLjA0NSwgUElOSywgaGVhZCwgUCksIGJ4KDAuMDUsIDAuMTIsIDAuMDIsIC0wLjEsIDIuMjYsIDEuMDQ1LCBQSU5LLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC43LCAwLjEyLCAwLCAxLjkyLCAwLjcsIE1BTkUsIGhlYWQsIFApLFxuICAgICAgYngoMC4xNCwgMC4xNCwgMC4xNCwgMCwgMi4yMiwgMS4xMiwgTUFORSwgaGVhZCwgUCksXG4gICAgICBieCgwLjEyLCAwLjc1LCAwLjEyLCAwLCAxLjAsIC0wLjg1LCBNQU5FLCB0YWlsLCBbMCwgMS41LCAtMC44XSksXG4gICAgXSxcbiAgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSB3aWxkbGlmZSAtLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGRlZXIoKTogQW5pbWFsTW9kZWwge1xuICBjb25zdCBDT0FUID0gJyNBNTYyMkUnLCBEQVJLID0gJyM3QzQ1MjEnLCBCRUxMWSA9ICcjRDhCOThBJywgQ1JFQU0gPSAnI0VCRDlCNCcsIEFOVExFUiA9ICcjRDlDQkE4JywgSE9PRiA9ICcjMkExQTEyJztcbiAgY29uc3QgUDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gWzAsIDEuMSwgMC40Ml07XG4gIHJldHVybiB7XG4gICAgaWQ6ICdkZWVyJywgbGVnTGVuOiAwLjg1LFxuICAgIGJveGVzOiBbXG4gICAgICBieCgwLjM0LCAwLjM4LCAwLjYyLCAwLCAxLjAsIDAuMTgsIENPQVQpLFxuICAgICAgYngoMC4zMiwgMC4zNiwgMC41LCAwLCAxLjAyLCAtMC4zNCwgQ09BVCksXG4gICAgICBieCgwLjIsIDAuMDYsIDAuOSwgMCwgMS4yMiwgLTAuMSwgREFSSyksXG4gICAgICBieCgwLjI2LCAwLjA4LCAwLjg1LCAwLCAwLjgyLCAtMC4wMywgQkVMTFkpLFxuICAgICAgYngoMC4yLCAwLjE0LCAwLjA0LCAwLCAxLjAyLCAtMC42LCBDUkVBTSksXG4gICAgICAuLi5bWzAuMSwgMC4zXSwgWy0wLjEsIDAuM10sIFswLjEsIC0wLjVdLCBbLTAuMSwgLTAuNV1dLmZsYXRNYXAoKFt4LCB6XSkgPT4ge1xuICAgICAgICBjb25zdCBwYXJ0ID0gbGVnU2V0KHgsIHopLCBwdjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gW3gsIDAuODUsIHpdO1xuICAgICAgICByZXR1cm4gW2J4KDAuMSwgMC40MiwgMC4xLCB4LCAwLjY0LCB6LCBDT0FULCBwYXJ0LCBwdiksIGJ4KDAuMDcsIDAuMzgsIDAuMDcsIHgsIDAuMjYsIHosIERBUkssIHBhcnQsIHB2KSwgYngoMC4wOCwgMC4wNywgMC4xLCB4LCAwLjAzNSwgeiArIDAuMDEsIEhPT0YsIHBhcnQsIHB2KV07XG4gICAgICB9KSxcbiAgICAgIGJ4KDAuMTYsIDAuNDIsIDAuMTgsIDAsIDEuMzYsIDAuNSwgQ09BVCwgaGVhZCwgUCwgeyByeDogLTAuMyB9KSxcbiAgICAgIGJ4KDAuMTgsIDAuMiwgMC4zLCAwLCAxLjYyLCAwLjY0LCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMTIsIDAuMTIsIDAuMTQsIDAsIDEuNTYsIDAuODQsIENSRUFNLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDgsIDAuMDYsIDAuMDQsIDAsIDEuNTksIDAuOTIsICcjMTQxNDE0JywgaGVhZCwgUCksXG4gICAgICBieCgwLjAzLCAwLjA1LCAwLjAzLCAwLjA4NSwgMS42NywgMC43MiwgJyMxNDE0MTQnLCBoZWFkLCBQKSwgYngoMC4wMywgMC4wNSwgMC4wMywgLTAuMDg1LCAxLjY3LCAwLjcyLCAnIzE0MTQxNCcsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNiwgMC4xNCwgMC4wNCwgMC4xMiwgMS43NSwgMC41NiwgQ09BVCwgaGVhZCwgUCwgeyByejogLTAuMyB9KSwgYngoMC4wNiwgMC4xNCwgMC4wNCwgLTAuMTIsIDEuNzUsIDAuNTYsIENPQVQsIGhlYWQsIFAsIHsgcno6IDAuMyB9KSxcbiAgICAgIGJ4KDAuMDQsIDAuMywgMC4wNCwgMC4wNywgMS44OCwgMC41OCwgQU5UTEVSLCBoZWFkICsgbWFsZSwgUCksIGJ4KDAuMDQsIDAuMywgMC4wNCwgLTAuMDcsIDEuODgsIDAuNTgsIEFOVExFUiwgaGVhZCArIG1hbGUsIFApLFxuICAgICAgYngoMC4xNCwgMC4wNCwgMC4wNCwgMC4xMywgMS45NSwgMC41OCwgQU5UTEVSLCBoZWFkICsgbWFsZSwgUCksIGJ4KDAuMTQsIDAuMDQsIDAuMDQsIC0wLjEzLCAxLjk1LCAwLjU4LCBBTlRMRVIsIGhlYWQgKyBtYWxlLCBQKSxcbiAgICAgIGJ4KDAuMDQsIDAuMTYsIDAuMDQsIDAuMiwgMi4wMywgMC41OCwgQU5UTEVSLCBoZWFkICsgbWFsZSwgUCksIGJ4KDAuMDQsIDAuMTYsIDAuMDQsIC0wLjIsIDIuMDMsIDAuNTgsIEFOVExFUiwgaGVhZCArIG1hbGUsIFApLFxuICAgICAgYngoMC4wNCwgMC4xNCwgMC4wNCwgMC4wNywgMi4xMiwgMC41OCwgQU5UTEVSLCBoZWFkICsgbWFsZSwgUCksIGJ4KDAuMDQsIDAuMTQsIDAuMDQsIC0wLjA3LCAyLjEyLCAwLjU4LCBBTlRMRVIsIGhlYWQgKyBtYWxlLCBQKSxcbiAgICAgIGJ4KDAuMDgsIDAuMTIsIDAuMDgsIDAsIDEuMDgsIC0wLjYyLCBDUkVBTSwgdGFpbCwgWzAsIDEuMCwgLTAuNl0pLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGZveCgpOiBBbmltYWxNb2RlbCB7XG4gIGNvbnN0IENPQVQgPSAnI0Q5NkExRScsIENSRUFNID0gJyNGMUUyQzQnLCBEQVJLID0gJyMzQTIyMTgnO1xuICBjb25zdCBQOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbMCwgMC41LCAwLjMyXTtcbiAgY29uc3QgVDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gWzAsIDAuNDIsIC0wLjNdO1xuICByZXR1cm4ge1xuICAgIGlkOiAnZm94JywgbGVnTGVuOiAwLjMsXG4gICAgYm94ZXM6IFtcbiAgICAgIGJ4KDAuMjIsIDAuMiwgMC42MiwgMCwgMC40LCAwLCBDT0FUKSxcbiAgICAgIGJ4KDAuMiwgMC4xNCwgMC4xNCwgMCwgMC4zNCwgMC4zLCBDUkVBTSksXG4gICAgICAuLi5bWzAuMDgsIDAuMjJdLCBbLTAuMDgsIDAuMjJdLCBbMC4wOCwgLTAuMl0sIFstMC4wOCwgLTAuMl1dLmZsYXRNYXAoKFt4LCB6XSkgPT4ge1xuICAgICAgICBjb25zdCBwYXJ0ID0gbGVnU2V0KHgsIHopLCBwdjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gW3gsIDAuMywgel07XG4gICAgICAgIHJldHVybiBbYngoMC4wNywgMC4xNywgMC4wNywgeCwgMC4yMTUsIHosIENPQVQsIHBhcnQsIHB2KSwgYngoMC4wOCwgMC4xMywgMC4wOSwgeCwgMC4wNjUsIHogKyAwLjAxLCBEQVJLLCBwYXJ0LCBwdildO1xuICAgICAgfSksXG4gICAgICBieCgwLjIsIDAuMTgsIDAuMjIsIDAsIDAuNSwgMC40NSwgQ09BVCwgaGVhZCwgUCksXG4gICAgICBieCgwLjEyLCAwLjEsIDAuMTQsIDAsIDAuNDUsIDAuNjIsIENSRUFNLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDYsIDAuMDUsIDAuMDQsIDAsIDAuNDcsIDAuNywgJyMxMTExMTEnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDMsIDAuMDQsIDAuMDIsIDAuMDcsIDAuNTQsIDAuNTY1LCAnIzExMTExMScsIGhlYWQsIFApLCBieCgwLjAzLCAwLjA0LCAwLjAyLCAtMC4wNywgMC41NCwgMC41NjUsICcjMTExMTExJywgaGVhZCwgUCksXG4gICAgICBieCgwLjA2LCAwLjEyLCAwLjA0LCAwLjA4LCAwLjY2LCAwLjQsIENPQVQsIGhlYWQsIFApLCBieCgwLjA2LCAwLjEyLCAwLjA0LCAtMC4wOCwgMC42NiwgMC40LCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDYsIDAuMDQsIDAuMDQsIDAuMDgsIDAuNzQsIDAuNCwgREFSSywgaGVhZCwgUCksIGJ4KDAuMDYsIDAuMDQsIDAuMDQsIC0wLjA4LCAwLjc0LCAwLjQsIERBUkssIGhlYWQsIFApLFxuICAgICAgYngoMC4xMiwgMC4xMiwgMC4yLCAwLCAwLjQyLCAtMC40LCBDT0FULCB0YWlsLCBUKSwgYngoMC4xNSwgMC4xNSwgMC4yLCAwLCAwLjQsIC0wLjU4LCBDT0FULCB0YWlsLCBUKSwgYngoMC4xMiwgMC4xMiwgMC4xMiwgMCwgMC4zOCwgLTAuNzIsIENSRUFNLCB0YWlsLCBUKSxcbiAgICBdLFxuICB9O1xufVxuXG5mdW5jdGlvbiB3b2xmKCk6IEFuaW1hbE1vZGVsIHtcbiAgY29uc3QgQ09BVCA9ICcjN0I3Rjg2JywgREFSSyA9ICcjNEU1MjU4JywgTElHSFQgPSAnI0I4QkNDMicsIE5PU0UgPSAnIzE1MTcxQSc7XG4gIGNvbnN0IFA6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFswLCAwLjg1LCAwLjVdO1xuICBjb25zdCBUOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbMCwgMC43NSwgLTAuNDJdO1xuICByZXR1cm4ge1xuICAgIGlkOiAnd29sZicsIGxlZ0xlbjogMC41OCxcbiAgICBib3hlczogW1xuICAgICAgYngoMC4zLCAwLjM2LCAwLjg1LCAwLCAwLjc2LCAwLCBDT0FUKSxcbiAgICAgIGJ4KDAuMjYsIDAuMDgsIDAuOCwgMCwgMC45OCwgLTAuMDIsIERBUkspLFxuICAgICAgYngoMC4yNCwgMC4xLCAwLjcsIDAsIDAuNTcsIDAsIExJR0hUKSxcbiAgICAgIC4uLltbMC4xMSwgMC4zMl0sIFstMC4xMSwgMC4zMl0sIFswLjExLCAtMC4zXSwgWy0wLjExLCAtMC4zXV0uZmxhdE1hcCgoW3gsIHpdKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcnQgPSBsZWdTZXQoeCwgeiksIHB2OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbeCwgMC41OCwgel07XG4gICAgICAgIHJldHVybiBbYngoMC4xMSwgMC40NiwgMC4xMSwgeCwgMC4zNSwgeiwgQ09BVCwgcGFydCwgcHYpLCBieCgwLjEyLCAwLjA4LCAwLjE2LCB4LCAwLjA0LCB6ICsgMC4wMiwgTElHSFQsIHBhcnQsIHB2KV07XG4gICAgICB9KSxcbiAgICAgIGJ4KDAuMjIsIDAuMjgsIDAuMiwgMCwgMC45MiwgMC41LCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMjgsIDAuMjgsIDAuMywgMCwgMC45OCwgMC42OCwgQ09BVCwgaGVhZCwgUCksXG4gICAgICBieCgwLjE2LCAwLjE0LCAwLjIsIDAsIDAuOTIsIDAuOSwgTElHSFQsIGhlYWQsIFApLFxuICAgICAgYngoMC4wOCwgMC4wNiwgMC4wNCwgMCwgMC45NSwgMS4wMSwgTk9TRSwgaGVhZCwgUCksXG4gICAgICBieCgwLjA1LCAwLjA1LCAwLjAyLCAwLjA4LCAxLjAzLCAwLjgzLCAnI0UwQjA0MCcsIGhlYWQsIFApLCBieCgwLjA1LCAwLjA1LCAwLjAyLCAtMC4wOCwgMS4wMywgMC44MywgJyNFMEIwNDAnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDQsIDAuMDUsIDAuMDI1LCAwLjA4LCAxLjAzLCAwLjg0LCBOT1NFLCBoZWFkLCBQKSwgYngoMC4wNCwgMC4wNSwgMC4wMjUsIC0wLjA4LCAxLjAzLCAwLjg0LCBOT1NFLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDksIDAuMTIsIDAuMDYsIDAuMSwgMS4xNywgMC42LCBDT0FULCBoZWFkLCBQKSwgYngoMC4wOSwgMC4xMiwgMC4wNiwgLTAuMSwgMS4xNywgMC42LCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDUsIDAuMDgsIDAuMDQsIDAuMSwgMS4yNywgMC42LCBEQVJLLCBoZWFkLCBQKSwgYngoMC4wNSwgMC4wOCwgMC4wNCwgLTAuMSwgMS4yNywgMC42LCBEQVJLLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMTEsIDAuMTEsIDAuMzYsIDAsIDAuNywgLTAuNiwgQ09BVCwgdGFpbCwgVCksIGJ4KDAuMTEsIDAuMTEsIDAuMTQsIDAsIDAuNiwgLTAuODQsIERBUkssIHRhaWwsIFQpLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGhhcmUoKTogQW5pbWFsTW9kZWwge1xuICBjb25zdCBDT0FUID0gJyNBODhBNjInLCBMSUdIVCA9ICcjRThEQ0M0JywgUElOSyA9ICcjRTlBM0EwJztcbiAgY29uc3QgUDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gWzAsIDAuMjUsIDAuMTVdO1xuICByZXR1cm4ge1xuICAgIGlkOiAnaGFyZScsIGxlZ0xlbjogMC4xMixcbiAgICBib3hlczogW1xuICAgICAgYngoMC4yLCAwLjE4LCAwLjM0LCAwLCAwLjIsIC0wLjAyLCBDT0FUKSxcbiAgICAgIGJ4KDAuMjIsIDAuMiwgMC4yLCAwLCAwLjI0LCAtMC4xMiwgQ09BVCksXG4gICAgICBieCgwLjE2LCAwLjA1LCAwLjMsIDAsIDAuMTIsIDAsIExJR0hUKSxcbiAgICAgIGJ4KDAuMDUsIDAuMTIsIDAuMDUsIDAuMDYsIDAuMDcsIDAuMSwgQ09BVCwgbGVnQSwgWzAuMDYsIDAuMTQsIDAuMV0pLCBieCgwLjA1LCAwLjEyLCAwLjA1LCAtMC4wNiwgMC4wNywgMC4xLCBDT0FULCBsZWdCLCBbLTAuMDYsIDAuMTQsIDAuMV0pLFxuICAgICAgYngoMC4wNywgMC4xMiwgMC4xNiwgMC4wNywgMC4wNywgLTAuMTQsIENPQVQsIGxlZ0IsIFswLjA3LCAwLjE0LCAtMC4xNF0pLCBieCgwLjA3LCAwLjEyLCAwLjE2LCAtMC4wNywgMC4wNywgLTAuMTQsIENPQVQsIGxlZ0EsIFstMC4wNywgMC4xNCwgLTAuMTRdKSxcbiAgICAgIGJ4KDAuMTQsIDAuMTQsIDAuMTYsIDAsIDAuMywgMC4yNCwgQ09BVCwgaGVhZCwgUCksXG4gICAgICBieCgwLjEsIDAuMDgsIDAuMDYsIDAsIDAuMjYsIDAuMzMsIExJR0hULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDQsIDAuMDMsIDAuMDIsIDAsIDAuMjgsIDAuMzY1LCBQSU5LLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDI1LCAwLjA0LCAwLjAyLCAwLjA1NSwgMC4zNCwgMC4zMSwgJyMxNDE0MTQnLCBoZWFkLCBQKSwgYngoMC4wMjUsIDAuMDQsIDAuMDIsIC0wLjA1NSwgMC4zNCwgMC4zMSwgJyMxNDE0MTQnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDQsIDAuMiwgMC4wNSwgMC4wNCwgMC40OCwgMC4yLCBDT0FULCBoZWFkLCBQKSwgYngoMC4wNCwgMC4yLCAwLjA1LCAtMC4wNCwgMC40OCwgMC4yLCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDIsIDAuMTQsIDAuMDIsIDAuMDQsIDAuNDgsIDAuMjI1LCBQSU5LLCBoZWFkLCBQKSwgYngoMC4wMiwgMC4xNCwgMC4wMiwgLTAuMDQsIDAuNDgsIDAuMjI1LCBQSU5LLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDksIDAuMDksIDAuMDksIDAsIDAuMjcsIC0wLjI3LCAnI0ZGRkZGRicsIHRhaWwsIFswLCAwLjI3LCAtMC4yNF0pLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHRyb3V0KCk6IEFuaW1hbE1vZGVsIHtcbiAgY29uc3QgVDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gWzAsIDAsIC0wLjFdO1xuICByZXR1cm4ge1xuICAgIGlkOiAndHJvdXQnLCBsZWdMZW46IDAsXG4gICAgYm94ZXM6IFtcbiAgICAgIGJ4KDAuMDgsIDAuMDksIDAuMjYsIDAsIDAsIDAuMDQsICdmYXVuYV90cm91dCcpLFxuICAgICAgYngoMC4wNywgMC4wNCwgMC4yNCwgMCwgLTAuMDM1LCAwLjA0LCAnZmF1bmFfdHJvdXRfYmVsbHknKSxcbiAgICAgIGJ4KDAuMDIsIDAuMDUsIDAuMDgsIDAsIDAuMDY1LCAwLjAyLCAnZmF1bmFfdHJvdXQnKSxcbiAgICAgIGJ4KDAuMDUsIDAuMDYsIDAuMSwgMCwgMCwgLTAuMTQsICdmYXVuYV90cm91dCcsIHRhaWwsIFQpLFxuICAgICAgYngoMC4wMiwgMC4xMSwgMC4wNiwgMCwgMCwgLTAuMiwgJ2ZhdW5hX3Ryb3V0JywgdGFpbCwgVCksXG4gICAgXSxcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IEFOSU1BTF9NT0RFTFMgPSB7XG4gIGNhdHRsZTogY2F0dGxlKCksIHNoZWVwOiBzaGVlcCgpLCBnb2F0OiBnb2F0KCksIHBpZzogcGlnKCksIGNoaWNrZW46IGNoaWNrZW4oKSwgaG9yc2U6IGhvcnNlKCksXG4gIGRlZXI6IGRlZXIoKSwgZm94OiBmb3goKSwgd29sZjogd29sZigpLCByYWJiaXQ6IGhhcmUoKSwgdHJvdXQ6IHRyb3V0KCksXG59IGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgQW5pbWFsTW9kZWxJZCA9IGtleW9mIHR5cGVvZiBBTklNQUxfTU9ERUxTO1xuIiwgIi8vIFJlbmRlci1vbmx5IHNtb290aGluZyBiZXR3ZWVuIHNpbXVsYXRpb24gc3RlcHMuIE5vdGhpbmcgaGVyZSByZWFkcyBvclxuLy8gd3JpdGVzIHNpbXVsYXRpb24gc3RhdGU6IGl0IGJsZW5kcyB0d28gYWxyZWFkeS1jb21wdXRlZCBwb3NlcyBieSBhbiBhbHBoYVxuLy8gZGVyaXZlZCBmcm9tIHJlYWwgdGltZSwgc28gdGhlIHBpY3R1cmUgaXMgaW5kZXBlbmRlbnQgb2YgZnJhbWUgcmF0ZS5cblxuZXhwb3J0IGludGVyZmFjZSBQb3NlIHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgaGVhZGluZzogbnVtYmVyIH1cblxuLyoqIEJleW9uZCB0aGlzIGRpc3RhbmNlIGJldHdlZW4gY29uc2VjdXRpdmUgc3RlcHMgdGhlIGNyZWF0dXJlIHRlbGVwb3J0ZWQgKHNwYXduLCByZXNldCk6IHNob3cgaXQsIGRvIG5vdCBzbGlkZSBpdC4gKi9cbmV4cG9ydCBjb25zdCBTTkFQX0RJU1RBTkNFID0gNjtcblxuLyoqIFNpZ25lZCBzaG9ydGVzdCByb3RhdGlvbiBmcm9tIGBmcm9tYCB0byBgdG9gLCBpbiAoLVBJLCBQSV0uICovXG5leHBvcnQgZnVuY3Rpb24gc2hvcnRlc3RBcmMoZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgVEFVID0gTWF0aC5QSSAqIDI7XG4gIGxldCBkID0gKHRvIC0gZnJvbSkgJSBUQVU7XG4gIGlmIChkID4gTWF0aC5QSSkgZCAtPSBUQVU7IGVsc2UgaWYgKGQgPD0gLU1hdGguUEkpIGQgKz0gVEFVO1xuICByZXR1cm4gZDtcbn1cblxuLyoqIEZyYWN0aW9uIG9mIHRoZSBjdXJyZW50IHRpY2sgdGhhdCBoYXMgZWxhcHNlZCwgZnJvbSB0aGUgY2xvY2sncyBzZWNvbmRzLXRvLW5leHQuIEluIFswLCAxXS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0aWNrQWxwaGEoc2Vjb25kc1RvTmV4dDogbnVtYmVyLCB0aWNrU2Vjb25kczogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKCEodGlja1NlY29uZHMgPiAwKSB8fCAhTnVtYmVyLmlzRmluaXRlKHNlY29uZHNUb05leHQpKSByZXR1cm4gMTtcbiAgcmV0dXJuIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIDEgLSBzZWNvbmRzVG9OZXh0IC8gdGlja1NlY29uZHMpKTtcbn1cblxuLyoqIEZyYWN0aW9uIG9mIHRoZSBjdXJyZW50IGZpeGVkIHN0ZXAgdGhhdCBoYXMgZWxhcHNlZCwgZnJvbSB0aGUgbGVmdG92ZXIgYWNjdW11bGF0b3IuICovXG5leHBvcnQgZnVuY3Rpb24gc3RlcEFscGhhKGFjY3VtdWxhdGVkOiBudW1iZXIsIHN0ZXA6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICghKHN0ZXAgPiAwKSkgcmV0dXJuIDE7XG4gIHJldHVybiBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCBhY2N1bXVsYXRlZCAvIHN0ZXApKTtcbn1cblxuLyoqIEJsZW5kIHByZXYgdG8gY3VyIGludG8gYG91dGAgKG5vIGFsbG9jYXRpb24pLiBTbmFwcyB0byBgY3VyYCB3aGVuIHRoZSBqdW1wIGV4Y2VlZHMgYHNuYXBgLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJsZW5kUG9zZShwcmV2OiBQb3NlLCBjdXI6IFBvc2UsIGFscGhhOiBudW1iZXIsIG91dDogUG9zZSwgc25hcCA9IFNOQVBfRElTVEFOQ0UpOiBQb3NlIHtcbiAgY29uc3QgYSA9IE1hdGgubWluKDEsIE1hdGgubWF4KDAsIGFscGhhKSk7XG4gIGlmIChNYXRoLmh5cG90KGN1ci54IC0gcHJldi54LCBjdXIueiAtIHByZXYueikgPiBzbmFwKSB7XG4gICAgb3V0LnggPSBjdXIueDsgb3V0LnkgPSBjdXIueTsgb3V0LnogPSBjdXIuejsgb3V0LmhlYWRpbmcgPSBjdXIuaGVhZGluZztcbiAgICByZXR1cm4gb3V0O1xuICB9XG4gIG91dC54ID0gcHJldi54ICsgKGN1ci54IC0gcHJldi54KSAqIGE7XG4gIG91dC55ID0gcHJldi55ICsgKGN1ci55IC0gcHJldi55KSAqIGE7XG4gIG91dC56ID0gcHJldi56ICsgKGN1ci56IC0gcHJldi56KSAqIGE7XG4gIG91dC5oZWFkaW5nID0gcHJldi5oZWFkaW5nICsgc2hvcnRlc3RBcmMocHJldi5oZWFkaW5nLCBjdXIuaGVhZGluZykgKiBhO1xuICByZXR1cm4gb3V0O1xufVxuIiwgIi8vIFJlYWwtdGltZSBzZXR0bGVtZW50IGNsb2NrLlxuLy9cbi8vIFRoZSBzaW11bGF0aW9uIHN0aWxsIG9ubHkgYWR2YW5jZXMgdGhyb3VnaCBhY2NlcHRlZCwgam91cm5hbGVkIGB0aWNrYFxuLy8gY29tbWFuZHM7IHRoaXMgY2xhc3MganVzdCBkZWNpZGVzICp3aGVuKiB0aGUgbG9jYWwgcGxheWVyJ3MgY2xpZW50IGlzc3Vlc1xuLy8gdGhlbTogb25lIHRpY2sgcGVyIFRJQ0tfU0VDT05EUyBvZiBhY3RpdmUgcGxheS4gUnVsZXM6XG4vLyAgIC0gYWN0aXZlIHBsYXkgb25seTogcGF1c2VkLCBoaWRkZW4vc3VzcGVuZGVkIHRhYiwgb3IgYSBub24tbGVhZGVyIHRhYlxuLy8gICAgIGFjY3VtdWxhdGVzIG5vdGhpbmcgKG5vIG9mZmxpbmUgY2F0Y2gtdXApO1xuLy8gICAtIGF0IG1vc3Qgb25lIHRpY2sgcGVyIGNhbGwsIGFuZCB0aGUgYWNjdW11bGF0b3IgaXMgY2FwcGVkLCBzbyByZXN1bWluZyBhXG4vLyAgICAgc3VzcGVuZGVkIHRhYiBuZXZlciBidXJzdHMgbWFueSB0aWNrcztcbi8vICAgLSBkZXRlcm1pbmlzdGljOiB0aGUgZWNvbm9taWMgcmVzdWx0IGRlcGVuZHMgb25seSBvbiB0aGUgam91cm5hbGVkIHRpY2tzLFxuLy8gICAgIG5ldmVyIG9uIGZyYW1lIHRpbWluZy5cblxuZXhwb3J0IGNvbnN0IFRJQ0tfU0VDT05EUyA9IDI7XG4vKiogTmV2ZXIgY2FycnkgbW9yZSB0aGFuIG9uZSBwZW5kaW5nIHRpY2sgYWNyb3NzIGEgbG9uZyBmcmFtZSBvciByZXN1bWUuICovXG5jb25zdCBNQVhfQUNDVU1VTEFURUQgPSBUSUNLX1NFQ09ORFMgKiAxLjU7XG5cbmV4cG9ydCBjbGFzcyBTaW1DbG9jayB7XG4gIHByaXZhdGUgYWNjdW11bGF0ZWQgPSAwO1xuICB0aWNrc0lzc3VlZCA9IDA7XG5cbiAgLyoqIFJldHVybnMgdHJ1ZSB3aGVuIGEgdGljayBpcyBkdWUuIGBkdGAgaXMgcmVhbCBlbGFwc2VkIHNlY29uZHMgc2luY2UgdGhlIGxhc3QgY2FsbC4gKi9cbiAgYWR2YW5jZShkdDogbnVtYmVyLCBhY3RpdmU6IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgICBpZiAoIWFjdGl2ZSB8fCAhTnVtYmVyLmlzRmluaXRlKGR0KSB8fCBkdCA8PSAwKSByZXR1cm4gZmFsc2U7XG4gICAgdGhpcy5hY2N1bXVsYXRlZCA9IE1hdGgubWluKE1BWF9BQ0NVTVVMQVRFRCwgdGhpcy5hY2N1bXVsYXRlZCArIE1hdGgubWluKGR0LCBUSUNLX1NFQ09ORFMpKTtcbiAgICBpZiAodGhpcy5hY2N1bXVsYXRlZCA8IFRJQ0tfU0VDT05EUykgcmV0dXJuIGZhbHNlO1xuICAgIHRoaXMuYWNjdW11bGF0ZWQgLT0gVElDS19TRUNPTkRTO1xuICAgIHRoaXMudGlja3NJc3N1ZWQrKztcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8qKiBGb3JnZXQgcGFydGlhbCBwcm9ncmVzcyAoYWZ0ZXIgcmVzdW1lIG9yIGEgbWFudWFsIHRpbWUgc2tpcCkuICovXG4gIHJlc2V0KCk6IHZvaWQgeyB0aGlzLmFjY3VtdWxhdGVkID0gMDsgfVxuXG4gIC8qKiBTZWNvbmRzIHVudGlsIHRoZSBuZXh0IHRpY2sgd2hpbGUgYWN0aXZlLiAqL1xuICBnZXQgc2Vjb25kc1RvTmV4dCgpOiBudW1iZXIgeyByZXR1cm4gTWF0aC5tYXgoMCwgVElDS19TRUNPTkRTIC0gdGhpcy5hY2N1bXVsYXRlZCk7IH1cbn1cblxuLyoqXG4gKiBUaHJvdHRsZWQgcGVyc2lzdGVuY2U6IHJlYWwtdGltZSB0aWNrcyBtYXJrIHRoZSBzZXNzaW9uIGRpcnR5OyBpdCBpcyBzYXZlZCBhdFxuICogbW9zdCBldmVyeSBgaW50ZXJ2YWxNc2AsIGFuZCBpbW1lZGlhdGVseSB3aGVuIHRoZSB0YWIgaGlkZXMgb3IgY2xvc2VzLlxuICovXG5leHBvcnQgY2xhc3MgU2F2ZVNjaGVkdWxlciB7XG4gIHByaXZhdGUgZGlydHlTaW5jZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbGFzdFNhdmUgPSAtSW5maW5pdHk7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgc2F2ZTogKCkgPT4gdm9pZCwgcHJpdmF0ZSByZWFkb25seSBpbnRlcnZhbE1zID0gMTBfMDAwKSB7fVxuICBtYXJrRGlydHkobm93OiBudW1iZXIpOiB2b2lkIHsgaWYgKHRoaXMuZGlydHlTaW5jZSA9PT0gbnVsbCkgdGhpcy5kaXJ0eVNpbmNlID0gbm93OyB9XG4gIC8qKiBDYWxsIGV2ZXJ5IGZyYW1lLiAqL1xuICBwb2xsKG5vdzogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuZGlydHlTaW5jZSAhPT0gbnVsbCAmJiBub3cgLSB0aGlzLmxhc3RTYXZlID49IHRoaXMuaW50ZXJ2YWxNcykgdGhpcy5mbHVzaChub3cpO1xuICB9XG4gIGZsdXNoKG5vdyA9IERhdGUubm93KCkpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5kaXJ0eVNpbmNlID09PSBudWxsKSByZXR1cm47XG4gICAgdGhpcy5kaXJ0eVNpbmNlID0gbnVsbDtcbiAgICB0aGlzLmxhc3RTYXZlID0gbm93O1xuICAgIHRoaXMuc2F2ZSgpO1xuICB9XG4gIC8qKiBBIHBsYXllciBjb21tYW5kIHNhdmVkIGltbWVkaWF0ZWx5OyBub3RoaW5nIGlzIHBlbmRpbmcuICovXG4gIHNhdmVkKG5vdzogbnVtYmVyKTogdm9pZCB7IHRoaXMuZGlydHlTaW5jZSA9IG51bGw7IHRoaXMubGFzdFNhdmUgPSBub3c7IH1cbiAgZ2V0IHBlbmRpbmcoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmRpcnR5U2luY2UgIT09IG51bGw7IH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBMb2NrU3RvcmFnZSB7XG4gIGdldEl0ZW0oa2V5OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsO1xuICBzZXRJdGVtKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZDtcbiAgcmVtb3ZlSXRlbShrZXk6IHN0cmluZyk6IHZvaWQ7XG59XG5cbi8qKlxuICogT25lIHdyaXRpbmcgdGFiIHBlciB3b3JsZC4gVHdvIHRhYnMgb24gdGhlIHNhbWUgc2F2ZSB3b3VsZCBlYWNoIHRpY2sgYW5kXG4gKiBvdmVyd3JpdGUgdGhlIG90aGVyJ3Mgam91cm5hbDsgdGhlIHNlY29uZCB0YWIgdGhlcmVmb3JlIHN0YXlzIHJlYWQtb25seSBmb3JcbiAqIHNpbXVsYXRpb24gdGltZSB1bnRpbCB0aGUgZmlyc3QgdGFiJ3MgaGVhcnRiZWF0IGxhcHNlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFRhYkxlYXNlIHtcbiAgcmVhZG9ubHkgaWQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyKSArIERhdGUubm93KCkudG9TdHJpbmcoMzYpO1xuICBwcml2YXRlIGxlYWRlciA9IGZhbHNlO1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2U6IExvY2tTdG9yYWdlIHwgbnVsbCwgcHJpdmF0ZSByZWFkb25seSBrZXk6IHN0cmluZyxcbiAgICBwcml2YXRlIHJlYWRvbmx5IHR0bE1zID0gNjAwMCkge31cblxuICAvKiogUmVmcmVzaCB0aGUgbGVhc2U7IHJldHVybnMgd2hldGhlciB0aGlzIHRhYiBtYXkgYWR2YW5jZSBhbmQgc2F2ZSB0aGUgd29ybGQuICovXG4gIGhlYXJ0YmVhdChub3cgPSBEYXRlLm5vdygpKTogYm9vbGVhbiB7XG4gICAgaWYgKCF0aGlzLnN0b3JhZ2UpIHsgdGhpcy5sZWFkZXIgPSB0cnVlOyByZXR1cm4gdHJ1ZTsgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2UuZ2V0SXRlbSh0aGlzLmtleSk7XG4gICAgICBjb25zdCBoZWxkID0gcmF3ID8gSlNPTi5wYXJzZShyYXcpIGFzIHsgaWQ6IHN0cmluZzsgYXQ6IG51bWJlciB9IDogbnVsbDtcbiAgICAgIGlmICghaGVsZCB8fCBoZWxkLmlkID09PSB0aGlzLmlkIHx8IG5vdyAtIGhlbGQuYXQgPiB0aGlzLnR0bE1zKSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5zZXRJdGVtKHRoaXMua2V5LCBKU09OLnN0cmluZ2lmeSh7IGlkOiB0aGlzLmlkLCBhdDogbm93IH0pKTtcbiAgICAgICAgdGhpcy5sZWFkZXIgPSBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZS5nZXRJdGVtKHRoaXMua2V5KSA/PyAne30nKS5pZCA9PT0gdGhpcy5pZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubGVhZGVyID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aGlzLmxlYWRlciA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmxlYWRlcjtcbiAgfVxuXG4gIGdldCBpc0xlYWRlcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMubGVhZGVyOyB9XG5cbiAgcmVsZWFzZSgpOiB2b2lkIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlPy5nZXRJdGVtKHRoaXMua2V5KTtcbiAgICAgIGlmIChyYXcgJiYgSlNPTi5wYXJzZShyYXcpLmlkID09PSB0aGlzLmlkKSB0aGlzLnN0b3JhZ2U/LnJlbW92ZUl0ZW0odGhpcy5rZXkpO1xuICAgIH0gY2F0Y2ggeyAvKiBiZXN0IGVmZm9ydCAqLyB9XG4gIH1cbn1cbiJdLAogICJt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QUFNLE1BQU0sTUFBTSxXQUFXLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLE1BQU0sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFDdEgsR0FBRyxNQUFNLE1BQU0sT0FBTyxNQUFNLE1BQU0sTUFBTSxXQUFXLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxNQUFNLE9BQU8sT0FBTyxNQUFNLE1BQU0sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFDeEgsR0FBRyxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxXQUFXLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLE1BQU0sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFDdEgsR0FBRyxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLE1BQU0sTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFDNUcsR0FBRyxLQUFLLEtBQUssTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsS0FBSyxLQUFLLE1BQU0sT0FBTyxNQUFNLE1BQU0sTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFDeEcsR0FBRyxLQUFLLE1BQU0sS0FBSyxNQUFNLEtBQUssTUFBTSxNQUFNLE9BQU8sTUFBTUEsRUFBQztBQUFBLE1BQUcsR0FBRyxLQUFLLE1BQU0sS0FBSyxPQUFPLEtBQUssTUFBTSxNQUFNLE9BQU8sTUFBTUEsRUFBQztBQUFBLE1BQ3BILEdBQUcsS0FBSyxNQUFNLEtBQUssR0FBRyxNQUFNLE9BQU8sTUFBTSxNQUFNLENBQUMsR0FBRyxLQUFLLElBQUksQ0FBQztBQUFBLE1BQzdELEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sTUFBTSxNQUFNLENBQUMsR0FBRyxLQUFLLElBQUksQ0FBQztBQUFBLElBQ2pFO0FBQUEsRUFDRjtB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TUFBTSxNQUFNLE1BQU1BLEVBQUM7QUFBQSxNQUNqRCxHQUFHLEtBQUssTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQ3JELEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sT0FBTyxNQUFNQSxFQUFDO0FBQUEsTUFDbEQsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxPQUFPLE9BQU8sTUFBTUEsRUFBQztBQUFBLE1BQ3pELEdBQUcsTUFBTSxLQUFLLE1BQU0sS0FBSyxNQUFNLE9BQU8sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sS0FBSyxNQUFNLE1BQU0sTUFBTSxPQUFPLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQ3BILEdBQUcsTUFBTSxLQUFLLE1BQU0sS0FBSyxNQUFNLE9BQU8sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sS0FBSyxNQUFNLE1BQU0sTUFBTSxPQUFPLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQ3BILEdBQUcsTUFBTSxLQUFLLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sS0FBSyxNQUFNLE9BQU8sTUFBTSxNQUFNLE1BQU0sTUFBTUEsRUFBQztBQUFBLE1BQzFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sTUFBTSxNQUFNLE9BQU8sTUFBTSxNQUFNLE1BQU0sTUFBTUEsRUFBQztBQUFBLE1BQzVHLEdBQUcsS0FBSyxNQUFNLE1BQU0sS0FBSyxLQUFLLE1BQU0sTUFBTSxNQUFNQSxJQUFHLEVBQUUsSUFBSSxNQUFNLENBQUM7QUFBQSxNQUFHLEdBQUcsS0FBSyxNQUFNLE1BQU0sTUFBTSxLQUFLLE1BQU0sTUFBTSxNQUFNQSxJQUFHLEVBQUUsSUFBSSxLQUFLLENBQUM7QUFBQSxNQUNuSSxHQUFHLE1BQU0sS0FBSyxNQUFNLEdB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QU0sS0FBSyxNQUFNLENBQUMsTUFBTSxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQUcsR0FBRyxLQUFLLE1BQU0sTUFBTSxPQUFPLE9BQU8sTUFBTSxLQUFLLE1BQU0sQ0FBQyxPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDdkksR0FBRyxNQUFNLEtBQUssTUFBTSxLQUFLLE1BQU0sT0FBTyxPQUFPLE1BQU0sVUFBVSxJQUFJLENBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxLQUFLLE1BQU0sTUFBTSxNQUFNLE9BQU8sT0FBTyxNQUFNLFVBQVUsS0FBSyxDQUFDO0FBQUEsTUFDekksR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLEtBQUssS0FBSyxPQUFPLE1BQU1BLEVBQUM7QUFBQSxNQUNoRCxHQUFHLE1BQU0sTUFBTSxNQUFNLEdBQUcsTUFBTSxLQUFLLEtBQUssTUFBTUEsRUFBQztBQUFBLE1BQy9DLEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxNQUFNLEtBQUssS0FBSyxPQUFPLE1BQU1BLEVBQUM7QUFBQSxNQUN0RCxHQUFHLEtBQUssTUFBTSxLQUFLLEdBQUcsTUFBTSxNQUFNLFFBQVEsTUFBTUEsRUFBQztBQUFBLE1BQ2pELEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxLQUFLLE1BQU0sS0FBSyxNQUFNQSxFQUFDO0FBQUEsTUFDL0MsR0FBRyxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxXQUFXLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLE1BQU0sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFDdEgsR0FBRyxLQUFLLE1BQU0sTUFBTSxHQUFHLE1BQU0sT0FBTyxPQUFPLE1BQU0sQ0FBQyxHQUFHLEtBQUssS0FBSyxDQUFDO0FBQUEsTUFDaEUsR0FBRyxDQUFDLE9BQU8sT0FBTyxNQUFNLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxNQUFNLEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQVEsSUFBSSxJQUFLLE1BQU0sU0FBUyxP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QUNoQixRQUFNLFFBQVEsS0FBSyxJQUFJLE1BQU0sQ0FBQyxHQUFHLFFBQVEsS0FBSyxJQUFJLE1BQU0sQ0FBQyxHQUFHLFVBQVUsS0FBSyxJQUFJLE1BQU0sQ0FBQztBQUN0RixRQUFNLFNBQVM7QUFDZixXQUFTLElBQUksR0FBRyxJQUFJLFFBQVEsS0FBSztBQUMvQixTQUFLLE9BQU8sSUFBSSxJQUFJLEdBQUc7QUFDdkIsVUFBTSxNQUFNLEtBQUs7QUFDakIsUUFBSSxRQUFRLENBQUMsR0FBRyxNQUFNO0FBQ3BCLFlBQU0sSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN6RCxZQUFNLENBQUMsS0FBSztBQUFHLFVBQUksSUFBSSxLQUFNLE9BQU0sQ0FBQztBQUFLLGNBQVEsQ0FBQyxJQUFJLEtBQUssSUFBSSxRQUFRLENBQUMsR0FBRyxDQUFDO0FBQUEsSUFDOUUsQ0FBQztBQUNELFdBQU87QUFBQSxFQUNUO0FBQ0EsUUFBTSxPQUFPLE1BQU0sUUFBUSxLQUFLLElBQUksR0FBRyxLQUFLLENBQUM7QUFDN0MsU0FBTyxHQUFHLE1BQU0sSUFBSSxJQUFJLEtBQUssdUJBQXVCO0FBRXBELFNBQU8sR0FBRyxNQUFNLElBQUksSUFBSSxTQUFTLEtBQUssWUFBWSxNQUFNLElBQUksQ0FBQyxPQUFPLE1BQU0sU0FBUztBQUNyRixDQUFDO0FBRUQsS0FBSyxrR0FBa0csTUFBTTtBQUMzRyxRQUFNLFFBQVEsWUFBWSxNQUFNLFlBQVk7QUFDNUMsUUFBTSxPQUFPLG9CQUFJLElBQVk7QUFDN0IsV0FBUyxLQUFLLEdBQUcsS0FBSyxHQUFHLE1BQU07QUFBRSxnQkFBWSxPQUFPLElBQUksQ0FBQztBQUFHLFNBQUssSUFBSSxHQUFHLEVBQUUsSUFBSTtBQUFBLEVBQUc7QUFDakYsUUFBTSxPQUFPLElBQUksVUFBVSxLQUFLO0FBQ2hDLFFBQU0sT0FBTztBQUNiLFFBQU0sU0FBbUIsQ0FBQztBQUMxQixXQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sTUFBTSxLQUFLLEtBQUssZUFBZSxLQUFLO0FBQzVELFNBQUssS0FBSyxJQUFJO0FBQ2QsV0FBTyxLQUFLLEtBQUssVUFBVSxJQUFJO0FBQUEsRUFDakM7QUFDQSxTQUFPLFVBQVUsUUFBUSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDbEMsU0FBTyxNQUFNLEtBQUssY0FBYyxLQUFLO0FBQ3JDLE9BQUssS0FBSyxJQUFJO0FBQ2QsU0FBTyxNQUFNLEtBQUssVUFBVSxNQUFNLEdBQUcsb0NBQW9DO0FBQzNFLENBQUM7IiwKICAibmFtZXMiOiBbImEiLCAiYiIsICJoZWFkIiwgImJ4IiwgInNtb290aCIsICJQIiwgImN0eCIsICJUSFJFRSIsICJQIiwgImN0eCIsICJoZWFkIl0KfQo=
