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
var AnimalBatch = class {
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
    this.mesh.frustumCulled = false;
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
  begin() {
    this.n = 0;
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
    this.anim.setXYZW(i, p.phase, p.legSwing, p.headPitch, p.tailWag);
    this.state.setXYZW(i, p.male ? 1 : 0, p.young ? 1 : 0, lie, p.extra);
    return true;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwNy5zbW9vdGgudGVzdC50cyIsICIuLi8uLi9zcmMvc2ltL3N0b25lLWNvbXBhdC50cyIsICIuLi8uLi9zcmMvc2ltL25vaXNlLnRzIiwgIi4uLy4uL3NyYy9zaW0vaHlkcm9sb2d5LnRzIiwgIi4uLy4uL3NyYy9zaW0vbWF0ZXJpYWxzLnRzIiwgIi4uLy4uL3NyYy9zaW0vdGVycmFpbi12Mi50cyIsICIuLi8uLi9zcmMvc2ltL3dvcmxkLnRzIiwgIi4uLy4uL3NyYy9zaW0vZmF1bmEudHMiLCAiLi4vLi4vc3JjL3JlbmRlci9mYXVuYS50cyIsICIuLi8uLi9zcmMvcmVuZGVyL2FuaW1hbC1raXQudHMiLCAiLi4vLi4vc3JjL2RhdGEvcGFsZXR0ZS5qc29uIiwgIi4uLy4uL3NyYy9yZW5kZXIvYW5pbWFsLW1vZGVscy50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3Ntb290aC50cyIsICIuLi8uLi9zcmMvYXBwL3NpbS1jbG9jay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCB7IEdFTkVSQVRPUl9WMiwgY3JlYXRlV29ybGQsIGVuc3VyZUNodW5rIH0gZnJvbSAnLi4vc3JjL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBGQVVOQV9TVEVQIH0gZnJvbSAnLi4vc3JjL3NpbS9mYXVuYSc7XG5pbXBvcnQgeyBGYXVuYVZpZXcgfSBmcm9tICcuLi9zcmMvcmVuZGVyL2ZhdW5hJztcbmltcG9ydCB7IFNOQVBfRElTVEFOQ0UsIFBvc2UsIGJsZW5kUG9zZSwgc2hvcnRlc3RBcmMsIHN0ZXBBbHBoYSwgdGlja0FscGhhIH0gZnJvbSAnLi4vc3JjL3JlbmRlci9zbW9vdGgnO1xuaW1wb3J0IHsgU2ltQ2xvY2ssIFRJQ0tfU0VDT05EUyB9IGZyb20gJy4uL3NyYy9hcHAvc2ltLWNsb2NrJztcblxuY29uc3QgUCA9ICh4OiBudW1iZXIsIHo6IG51bWJlciwgaGVhZGluZyA9IDAsIHkgPSAwKTogUG9zZSA9PiAoeyB4LCB5LCB6LCBoZWFkaW5nIH0pO1xuXG50ZXN0KCd0aWNrQWxwaGEgZm9sbG93cyB0aGUgY2xvY2sgYW5kIHN0YXlzIGluIFswLDFdJywgKCkgPT4ge1xuICBhc3NlcnQuZXF1YWwodGlja0FscGhhKFRJQ0tfU0VDT05EUywgVElDS19TRUNPTkRTKSwgMCk7XG4gIGFzc2VydC5lcXVhbCh0aWNrQWxwaGEoMCwgVElDS19TRUNPTkRTKSwgMSk7XG4gIGFzc2VydC5lcXVhbCh0aWNrQWxwaGEoVElDS19TRUNPTkRTIC8gMiwgVElDS19TRUNPTkRTKSwgMC41KTtcbiAgYXNzZXJ0LmVxdWFsKHRpY2tBbHBoYSgtMywgVElDS19TRUNPTkRTKSwgMSk7XG4gIGFzc2VydC5lcXVhbCh0aWNrQWxwaGEoOTksIFRJQ0tfU0VDT05EUyksIDApO1xuICBhc3NlcnQuZXF1YWwodGlja0FscGhhKE5hTiwgVElDS19TRUNPTkRTKSwgMSk7XG4gIGNvbnN0IGNsb2NrID0gbmV3IFNpbUNsb2NrKCk7XG4gIGNsb2NrLmFkdmFuY2UoMC41LCB0cnVlKTtcbiAgYXNzZXJ0LmVxdWFsKHRpY2tBbHBoYShjbG9jay5zZWNvbmRzVG9OZXh0LCBUSUNLX1NFQ09ORFMpLCAwLjI1KTtcbiAgYXNzZXJ0LmVxdWFsKHN0ZXBBbHBoYShGQVVOQV9TVEVQIC8gNCwgRkFVTkFfU1RFUCksIDAuMjUpO1xufSk7XG5cbnRlc3QoJ2JsZW5kIGlzIGNvbnRpbnVvdXMgYWNyb3NzIGEgdGljayBib3VuZGFyeSBhbmQgaXMgbm90IGEgc3RlcCBmdW5jdGlvbicsICgpID0+IHtcbiAgLy8gVHdvIGNvbnNlY3V0aXZlIHRpY2tzLCAxLjUgbSBlYWNoLiBTYW1wbGUgYXQgNjAgZnBzIGFjcm9zcyBib3RoLlxuICBjb25zdCBhID0gUCgwLCAwKSwgYiA9IFAoMS41LCAwKSwgYyA9IFAoMywgMCk7XG4gIGNvbnN0IG91dCA9IFAoMCwgMCk7XG4gIGNvbnN0IHhzOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBmcmFtZXMgPSBNYXRoLnJvdW5kKFRJQ0tfU0VDT05EUyAqIDYwKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmcmFtZXM7IGkrKykgeHMucHVzaChibGVuZFBvc2UoYSwgYiwgaSAvIGZyYW1lcywgb3V0KS54KTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmcmFtZXM7IGkrKykgeHMucHVzaChibGVuZFBvc2UoYiwgYywgaSAvIGZyYW1lcywgb3V0KS54KTtcbiAgeHMucHVzaChibGVuZFBvc2UoYiwgYywgMSwgb3V0KS54KTtcbiAgbGV0IG1heEp1bXAgPSAwO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IHhzLmxlbmd0aDsgaSsrKSBtYXhKdW1wID0gTWF0aC5tYXgobWF4SnVtcCwgTWF0aC5hYnMoeHNbaV0gLSB4c1tpIC0gMV0pKTtcbiAgYXNzZXJ0Lm9rKG1heEp1bXAgPD0gMS41IC8gZnJhbWVzICsgMWUtOSwgYHBlci1mcmFtZSBqdW1wICR7bWF4SnVtcH1gKTtcbiAgYXNzZXJ0Lm9rKHhzLmV2ZXJ5KCh4LCBpKSA9PiBpID09PSAwIHx8IHggPj0geHNbaSAtIDFdKSwgJ21vbm90b25pYycpO1xuICAvLyBXaXRob3V0IGludGVycG9sYXRpb24gKGFscGhhIGZvcmNlZCB0byAxKSB0aGUgc2FtZSB3YWxrIGp1bXBzIGEgd2hvbGUgdGljayBhdCBvbmNlLlxuICBjb25zdCByYXcgPSBbYmxlbmRQb3NlKGEsIGIsIDEsIG91dCkueCwgYmxlbmRQb3NlKGIsIGMsIDEsIG91dCkueF07XG4gIGFzc2VydC5vayhNYXRoLmFicyhyYXdbMV0gLSByYXdbMF0pID4gMTAwICogKDEuNSAvIGZyYW1lcykpO1xufSk7XG5cbnRlc3QoJ3lhdyB0YWtlcyB0aGUgc2hvcnRlc3QgYXJjIGFjcm9zcyB0aGUgKy1QSSBzZWFtJywgKCkgPT4ge1xuICBhc3NlcnQub2soTWF0aC5hYnMoc2hvcnRlc3RBcmMoMy4wLCAtMy4wKSAtIChNYXRoLlBJICogMiAtIDYpKSA8IDFlLTkpO1xuICBhc3NlcnQub2soTWF0aC5hYnMoc2hvcnRlc3RBcmMoLTMuMCwgMy4wKSArIChNYXRoLlBJICogMiAtIDYpKSA8IDFlLTkpO1xuICBjb25zdCBvdXQgPSBQKDAsIDApO1xuICBjb25zdCBtaWQgPSBibGVuZFBvc2UoUCgwLCAwLCAzLjApLCBQKDAsIDAsIC0zLjApLCAwLjUsIG91dCkuaGVhZGluZztcbiAgLy8gSGFsZndheSBpcyBvbiB0aGUgc2VhbSAobmVhciBQSSksIG5vdCBuZWFyIDAuXG4gIGFzc2VydC5vayhNYXRoLmFicyhNYXRoLmFicyhtaWQpIC0gTWF0aC5QSSkgPCAwLjAxIHx8IE1hdGguYWJzKG1pZCAtIE1hdGguUEkpIDwgMC4wMSwgYG1pZCAke21pZH1gKTtcbiAgYXNzZXJ0Lm9rKE1hdGguYWJzKHNob3J0ZXN0QXJjKDAsIDcgKiBNYXRoLlBJKSkgPD0gTWF0aC5QSSk7XG59KTtcblxudGVzdCgnbGFyZ2UganVtcHMgc25hcCBpbnN0ZWFkIG9mIHNsaWRpbmcnLCAoKSA9PiB7XG4gIGNvbnN0IG91dCA9IFAoMCwgMCk7XG4gIGJsZW5kUG9zZShQKDAsIDApLCBQKFNOQVBfRElTVEFOQ0UgKyAxLCAwLCAxKSwgMC4xLCBvdXQpO1xuICBhc3NlcnQuZXF1YWwob3V0LngsIFNOQVBfRElTVEFOQ0UgKyAxKTtcbiAgYXNzZXJ0LmVxdWFsKG91dC5oZWFkaW5nLCAxKTtcbiAgYmxlbmRQb3NlKFAoMCwgMCksIFAoU05BUF9ESVNUQU5DRSAtIDEsIDApLCAwLjUsIG91dCk7XG4gIGFzc2VydC5lcXVhbChvdXQueCwgKFNOQVBfRElTVEFOQ0UgLSAxKSAvIDIpO1xufSk7XG5cbnRlc3QoJ2JsZW5kIGRlcGVuZHMgb25seSBvbiBhbHBoYSwgbmV2ZXIgb24gaG93IG1hbnkgZnJhbWVzIGl0IHRvb2snLCAoKSA9PiB7XG4gIGNvbnN0IGEgPSBQKDIsIDMsIDAuNCwgNSksIGIgPSBQKDQsIDEsIDEuMiwgNiksIG8xID0gUCgwLCAwKSwgbzIgPSBQKDAsIDApO1xuICBmb3IgKGNvbnN0IHQgb2YgWzAsIDAuMTMsIDAuNSwgMC45OSwgMV0pIHtcbiAgICBibGVuZFBvc2UoYSwgYiwgdCwgbzEpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNzsgaSsrKSBibGVuZFBvc2UoYSwgYiwgdCwgbzIpO1xuICAgIGFzc2VydC5kZWVwRXF1YWwobzEsIG8yKTtcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIHBvcHVsYXRlZFZpZXcoKTogRmF1bmFWaWV3IHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCgxMzM3LCBHRU5FUkFUT1JfVjIpO1xuICBjb25zdCBrZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAobGV0IGN6ID0gMjg7IGN6IDw9IDMyOyBjeisrKSBmb3IgKGxldCBjeCA9IDI4OyBjeCA8PSAzMjsgY3grKykgeyBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTsga2V5cy5hZGQoYCR7Y3h9LCR7Y3p9YCk7IH1cbiAgY29uc3QgdmlldyA9IG5ldyBGYXVuYVZpZXcod29ybGQpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IDIwICYmIChpID09PSAwIHx8IHZpZXcucGVuZGluZ1NwYXduKTsgaSsrKSB2aWV3LnN5bmMoa2V5cyk7XG4gIHJldHVybiB2aWV3O1xufVxuY29uc3Qgc25hcHNob3QgPSAodjogRmF1bmFWaWV3KSA9PiBKU09OLnN0cmluZ2lmeSh2LmFsbCgpLm1hcCgoYykgPT4gW2MuaWQsIGMueCwgYy55LCBjLnosIGMuaGVhZGluZywgYy5iZWhhdmlvdXIsIGMucm5nXSkpO1xuY29uc3QgY3R4ID0geyB0aHJlYXRzOiBbXSwgbmlnaHQ6IGZhbHNlIH07XG5cbnRlc3QoJ3JlbmRlcmluZyBuZXZlciBjaGFuZ2VzIHNpbXVsYXRpb24gc3RhdGUnLCAoKSA9PiB7XG4gIC8vIFNhbWUgc2ltIHRpbWUsIGJ1dCBvbmUgdmlldyBpcyBhbHNvIGRyYXduIGV4dHJhIHRpbWVzICh1cGRhdGUoMCkpIGJldHdlZW4gc3RlcHMuXG4gIGNvbnN0IHBsYWluID0gcG9wdWxhdGVkVmlldygpLCBkcmF3biA9IHBvcHVsYXRlZFZpZXcoKTtcbiAgYXNzZXJ0Lm9rKHBsYWluLmNvdW50ID4gMCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgMTAwOyBpKyspIHBsYWluLnVwZGF0ZSgwLjEsIGN0eCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgMTAwOyBpKyspIHsgZHJhd24udXBkYXRlKDAuMSwgY3R4KTsgZHJhd24udXBkYXRlKDAsIGN0eCk7IGRyYXduLnVwZGF0ZSgwLCBjdHgpOyB9XG4gIGFzc2VydC5lcXVhbChzbmFwc2hvdChwbGFpbiksIHNuYXBzaG90KGRyYXduKSk7XG59KTtcblxudGVzdCgnZHJhd24gYW5pbWFscyBtb3ZlIGV2ZXJ5IGZyYW1lLCBub3Qgb25jZSBwZXIgMTAgSHogc2ltIHN0ZXAnLCAoKSA9PiB7XG4gIGNvbnN0IHZpZXcgPSBwb3B1bGF0ZWRWaWV3KCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgNjA7IGkrKykgdmlldy51cGRhdGUoMSAvIDYwLCBjdHgpO1xuICBjb25zdCBtZXNoZXMgPSB2aWV3Lmdyb3VwLmNoaWxkcmVuIGFzIHVua25vd24gYXMgQXJyYXk8eyBjb3VudDogbnVtYmVyOyBpbnN0YW5jZU1hdHJpeDogeyBhcnJheTogRmxvYXQzMkFycmF5IH0gfT47XG4gIGNvbnN0IHJlYWQgPSAoKSA9PiBtZXNoZXMuZmxhdE1hcCgobSkgPT4gQXJyYXkuZnJvbSh7IGxlbmd0aDogbS5jb3VudCB9LCAoXywgaSkgPT4gW20uaW5zdGFuY2VNYXRyaXguYXJyYXlbaSAqIDE2ICsgMTJdLCBtLmluc3RhbmNlTWF0cml4LmFycmF5W2kgKiAxNiArIDE0XV0pKTtcbiAgbGV0IHByZXYgPSByZWFkKCk7XG4gIGNvbnN0IHRvdGFsID0gcHJldi5tYXAoKCkgPT4gMCksIG1vdmVkID0gcHJldi5tYXAoKCkgPT4gMCksIGJpZ2dlc3QgPSBwcmV2Lm1hcCgoKSA9PiAwKTtcbiAgY29uc3QgRlJBTUVTID0gMTgwO1xuICBmb3IgKGxldCBmID0gMDsgZiA8IEZSQU1FUzsgZisrKSB7XG4gICAgdmlldy51cGRhdGUoMSAvIDYwLCBjdHgpO1xuICAgIGNvbnN0IG5vdyA9IHJlYWQoKTtcbiAgICBub3cuZm9yRWFjaCgocCwgaSkgPT4ge1xuICAgICAgY29uc3QgZCA9IE1hdGguaHlwb3QocFswXSAtIHByZXZbaV1bMF0sIHBbMV0gLSBwcmV2W2ldWzFdKTtcbiAgICAgIHRvdGFsW2ldICs9IGQ7IGlmIChkID4gMWUtNikgbW92ZWRbaV0rKzsgYmlnZ2VzdFtpXSA9IE1hdGgubWF4KGJpZ2dlc3RbaV0sIGQpO1xuICAgIH0pO1xuICAgIHByZXYgPSBub3c7XG4gIH1cbiAgY29uc3QgYmVzdCA9IHRvdGFsLmluZGV4T2YoTWF0aC5tYXgoLi4udG90YWwpKTtcbiAgYXNzZXJ0Lm9rKHRvdGFsW2Jlc3RdID4gMC41LCAnc29tZSBhbmltYWwgdHJhdmVsbGVkJyk7XG4gIC8vIEJsZW5kZWQ6IGEgd2Fsa2luZyBhbmltYWwgYWR2YW5jZXMgb24gbmVhcmx5IGV2ZXJ5IGZyYW1lIChhIHJhdyAxMCBIeiBzdGVwIG9ubHkgb24gZXZlcnkgNnRoKS5cbiAgYXNzZXJ0Lm9rKG1vdmVkW2Jlc3RdIC8gRlJBTUVTID4gMC42LCBgbW92ZWQgb24gJHttb3ZlZFtiZXN0XX0gb2YgJHtGUkFNRVN9IGZyYW1lc2ApO1xufSk7XG5cbnRlc3QoJ0ZhdW5hVmlldyBzcGF3bnMgYXQgbW9zdCBTUEFXTl9DSFVOS1NfUEVSX0ZSQU1FIGNodW5rcyBwZXIgc3luYyBhbmQgZmluaXNoZXMgb3ZlciBsYXRlciBmcmFtZXMnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoMTMzNywgR0VORVJBVE9SX1YyKTtcbiAgY29uc3Qga2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGxldCBjeCA9IDA7IGN4IDwgNTsgY3grKykgeyBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIDApOyBrZXlzLmFkZChgJHtjeH0sMGApOyB9XG4gIGNvbnN0IHZpZXcgPSBuZXcgRmF1bmFWaWV3KHdvcmxkKTtcbiAgY29uc3QgcHJpdiA9IHZpZXcgYXMgdW5rbm93biBhcyB7IGNyZWF0dXJlczogTWFwPHN0cmluZywgdW5rbm93bj4gfTtcbiAgY29uc3QgZnJhbWVzOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IDYgJiYgKGkgPT09IDAgfHwgdmlldy5wZW5kaW5nU3Bhd24pOyBpKyspIHtcbiAgICB2aWV3LnN5bmMoa2V5cyk7XG4gICAgZnJhbWVzLnB1c2gocHJpdi5jcmVhdHVyZXMuc2l6ZSk7XG4gIH1cbiAgYXNzZXJ0LmRlZXBFcXVhbChmcmFtZXMsIFsyLCA0LCA1XSk7XG4gIGFzc2VydC5lcXVhbCh2aWV3LnBlbmRpbmdTcGF3biwgZmFsc2UpO1xuICB2aWV3LnN5bmMoa2V5cyk7XG4gIGFzc2VydC5lcXVhbChwcml2LmNyZWF0dXJlcy5zaXplLCA1LCAnYSBzZXR0bGVkIHN5bmMgc3Bhd25zIG5vdGhpbmcgbW9yZScpO1xufSk7XG4iLCAiLy8gUHJpdmF0ZSBtaWdyYXRpb24gcmVwbGF5IG9ubHkuIFJldGlyZWQgZW50aXRpZXMgbGl2ZSBpbiB0aGlzIFdvcmxkIHdoaWxlIGFuXG4vLyBhY2NlcHRlZCBoaXN0b3JpY2FsIGpvdXJuYWwgaXMgY2hlY2tlZDsgbm8gcHVibGljIGNvbW1hbmQgZW5hYmxlcyB0aGlzIG1vZGUuXG5pbnRlcmZhY2UgUmVwbGF5U3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIGhpc3RvcmljYWxIYXNoOiBib29sZWFuO1xuICBtaWdyYXRlZDogYm9vbGVhbjtcbn1cblxuY29uc3Qgc3RhdGVzID0gbmV3IFdlYWtNYXA8b2JqZWN0LCBSZXBsYXlTdGF0ZT4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxheVN0b25lU3RhdGUod29ybGQ6IG9iamVjdCk6IFJlcGxheVN0YXRlIHtcbiAgbGV0IHN0YXRlID0gc3RhdGVzLmdldCh3b3JsZCk7XG4gIGlmICghc3RhdGUpIHsgc3RhdGUgPSB7IGFjdGl2ZTogZmFsc2UsIGhpc3RvcmljYWxIYXNoOiBmYWxzZSwgbWlncmF0ZWQ6IGZhbHNlIH07IHN0YXRlcy5zZXQod29ybGQsIHN0YXRlKTsgfVxuICByZXR1cm4gc3RhdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IHRydWU7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbiAgc3RhdGUubWlncmF0ZWQgPSBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/LmFjdGl2ZSA/PyBmYWxzZTtcbn1cblxuLyoqIFNuYXBzaG90IGhhc2hlcyBiZWZvcmUgYW5kIGR1cmluZyB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheSBpbmNsdWRlIHN0b25lcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5oaXN0b3JpY2FsSGFzaCA/PyBmYWxzZTtcbn1cblxuLyoqIEEgbWlncmF0ZWQgc25hcHNob3QgYWxyZWFkeSBoYXMgcmV0aXJlbWVudCB0b21ic3RvbmVzIGluIGdlbmVyYXRlZCBjaHVua3MuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5taWdyYXRlZCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lm1pZ3JhdGVkID8/IGZhbHNlO1xufVxuXG4vKiogRXhpdCBoaXN0b3JpY2FsIG1vZGUgYWZ0ZXIgYWxsIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBoYXNoZXMgaGF2ZSBwYXNzZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZmluaXNoU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSBmYWxzZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSBmYWxzZTtcbiAgc3RhdGUubWlncmF0ZWQgPSB0cnVlO1xufVxuIiwgIi8vIERldGVybWluaXN0aWMgaGFzaCwgbm9pc2UgYW5kIG1hdGggaGVscGVycyBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIuXG4vLyBQdXJlIFR5cGVTY3JpcHQgKEQtMDA1KS4gRXh0cmFjdGVkIGZyb20gd29ybGQudHMgdW5jaGFuZ2VkIHNvIHRlcnJhaW5cbi8vIGdlbmVyYXRvcnMgb2YgZXZlcnkgdmVyc2lvbiB1c2UgaWRlbnRpY2FsIHByaW1pdGl2ZXMuXG5leHBvcnQgY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuZXhwb3J0IGNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuZXhwb3J0IGNvbnN0IHNtb290aHN0ZXAgPSAoZTA6IG51bWJlciwgZTE6IG51bWJlciwgeDogbnVtYmVyKSA9PiB7XG4gIGNvbnN0IHQgPSBjbGFtcCgoeCAtIGUwKSAvIChlMSAtIGUwKSwgMCwgMSk7XG4gIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xufTtcblxuLy8gLS0tLS0tLS0tLSBkZXRlcm1pbmlzdGljIGhhc2ggLyBub2lzZSAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gaGFzaDJpKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoM2koeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKSBeIE1hdGguaW11bCh6LCAyMjQ2ODIyNTE5KTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbXVsYmVycnkzMihzZWVkOiBudW1iZXIpOiAoKSA9PiBudW1iZXIge1xuICBsZXQgYSA9IHNlZWQgPj4+IDA7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgYSA9IChhICsgMHg2ZDJiNzlmNSkgPj4+IDA7XG4gICAgbGV0IHQgPSBhO1xuICAgIHQgPSBNYXRoLmltdWwodCBeICh0ID4+PiAxNSksIHQgfCAxKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgdCB8IDYxKTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IHNtb290aCA9ICh0OiBudW1iZXIpID0+IHQgKiB0ICogKDMgLSAyICogdCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSk7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSk7XG4gIGNvbnN0IGEgPSBoYXNoMmkoeGksIHlpLCBzZWVkKSwgYiA9IGhhc2gyaSh4aSArIDEsIHlpLCBzZWVkKTtcbiAgY29uc3QgYyA9IGhhc2gyaSh4aSwgeWkgKyAxLCBzZWVkKSwgZCA9IGhhc2gyaSh4aSArIDEsIHlpICsgMSwgc2VlZCk7XG4gIGNvbnN0IHRvcCA9IGEgKyAoYiAtIGEpICogeGY7XG4gIGNvbnN0IGJvdHRvbSA9IGMgKyAoZCAtIGMpICogeGY7XG4gIHJldHVybiB0b3AgKyAoYm90dG9tIC0gdG9wKSAqIHlmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMih4ICogZnJlcSwgeSAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KSwgemkgPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpLCB6ZiA9IHNtb290aCh6IC0gemkpO1xuICBjb25zdCBjMDAwID0gaGFzaDNpKHhpLCB5aSwgemksIHNlZWQpLCBjMTAwID0gaGFzaDNpKHhpICsgMSwgeWksIHppLCBzZWVkKTtcbiAgY29uc3QgYzAxMCA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSwgc2VlZCksIGMxMTAgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppLCBzZWVkKTtcbiAgY29uc3QgYzAwMSA9IGhhc2gzaSh4aSwgeWksIHppICsgMSwgc2VlZCksIGMxMDEgPSBoYXNoM2koeGkgKyAxLCB5aSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgYzAxMSA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpLCBjMTExID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCB4MDAgPSBjMDAwICsgKGMxMDAgLSBjMDAwKSAqIHhmO1xuICBjb25zdCB4MTAgPSBjMDEwICsgKGMxMTAgLSBjMDEwKSAqIHhmO1xuICBjb25zdCB4MDEgPSBjMDAxICsgKGMxMDEgLSBjMDAxKSAqIHhmO1xuICBjb25zdCB4MTEgPSBjMDExICsgKGMxMTEgLSBjMDExKSAqIHhmO1xuICBjb25zdCB5MCA9IHgwMCArICh4MTAgLSB4MDApICogeWY7XG4gIGNvbnN0IHkxID0geDAxICsgKHgxMSAtIHgwMSkgKiB5ZjtcbiAgcmV0dXJuIHkwICsgKHkxIC0geTApICogemY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0zKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTMoeCAqIGZyZXEsIHkgKiBmcmVxLCB6ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuIiwgIi8vIEh5ZHJvbG9neSBcdTIwMTQgdGhlIGRldGVybWluaXN0aWMgd2F0ZXIgbmV0d29yayBvZiBhIHdvcmxkIChwdXJlIFR5cGVTY3JpcHQsIEQtMDA1KS5cbi8vXG4vLyBUaGlzIGlzIGRlcml2ZWQgKnNpbXVsYXRpb24gZGF0YSosIG5vdCBwcmVzZW50YXRpb246IGl0IGlzIGEgcHVyZSBmdW5jdGlvbiBvZlxuLy8gKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKSBhbmQgaXMgd2hhdCB0ZXJyYWluIGNhcnZpbmcsIHdhdGVyIGZpbGxpbmcsIGZsb3dcbi8vIGRpcmVjdGlvbiBhbmQgZnV0dXJlIGZpc2hpbmcvaXJyaWdhdGlvbi9mbG9vZGluZyBydWxlcyByZWFkLiBJdCBpcyBuZXZlclxuLy8gam91cm5hbGVkIGJlY2F1c2UgaXQgY2FuIGFsd2F5cyBiZSByZWdlbmVyYXRlZCBleGFjdGx5LlxuLy9cbi8vIE5ldHdvcmsgKGJvdGggZ2VuZXJhdG9yIHZlcnNpb25zKTpcbi8vICAgbGFrZSAgXHUyMDE0IHRoZSB2YWxsZXkgbGFrZSBiYXNpbiwgbG9jYXRlZCBmcm9tIHRoZSBhY3R1YWwgZ2VuZXJhdGVkIHRlcnJhaW4uXG4vLyAgIGxvd2VyIFx1MjAxNCB0aGUgbG93bGFuZCByaXZlciBmcm9tIHRoZSBsYWtlIHRvIHRoZSBzb3V0aGVybiBzZWEsIHRyYWNlZCBmcm9tXG4vLyAgICAgICAgICAgdGhlIGFjdHVhbCBjYXJ2ZWQgY2hhbm5lbCAodGhlIHYxIGNoYW5uZWwgaXMgY2FydmVkIG9uICp3YXJwZWQqXG4vLyAgICAgICAgICAgY29vcmRpbmF0ZXMsIHNvIGByaXZlckNlbnRlclhgIGFsb25lIGlzIHVwIHRvIH4xMzUgbSBvZmYpLlxuLy8gR2VuZXJhdG9yIHYyIGFkZHM6XG4vLyAgIHVwcGVyIFx1MjAxNCBhIG1vdW50YWluIHJpdmVyIGZyb20gYSBoaWdobGFuZCB0YXJuIGRvd24gdG8gdGhlIGxha2UsIHdpdGggYVxuLy8gICAgICAgICAgIHdhdGVyLXN1cmZhY2UgbGV2ZWwgdGhhdCBuZXZlciByaXNlcyBkb3duc3RyZWFtLCBjYXNjYWRlcyBhbmQgZmFsbHMuXG4vL1xuLy8gRmxvdyBhbHdheXMgcG9pbnRzIGRvd25zdHJlYW06IHVwcGVyIFx1MjE5MiBsYWtlIFx1MjE5MiBsb3dlciBcdTIxOTIgc2VhLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIG11bGJlcnJ5MzIsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcblxuZXhwb3J0IHR5cGUgSGVpZ2h0U2FtcGxlciA9ICh4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJpdmVyUG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQgb2YgdGhpcyByZWFjaCAobWV0cmVzKS4gKi9cbiAgczogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBlbGV2YXRpb24gKG1ldHJlcywgbWF5IGJlIGZyYWN0aW9uYWwpLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogQ2hhbm5lbCBoYWxmLXdpZHRoIChtZXRyZXMpLiAqL1xuICB3aWR0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWNoSGl0IHtcbiAgLyoqIEhvcml6b250YWwgZGlzdGFuY2UgZnJvbSB0aGUgY2VudHJlbGluZS4gKi9cbiAgZDogbnVtYmVyO1xuICAvKiogSW50ZXJwb2xhdGVkIHdhdGVyIGxldmVsIGF0IHRoZSBuZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIHdpZHRoOiBudW1iZXI7XG4gIC8qKiBVbml0IGRvd25zdHJlYW0gZGlyZWN0aW9uLiAqL1xuICB0eDogbnVtYmVyO1xuICB0ejogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBkcm9wIHBlciBtZXRyZSBhbG9uZyB0aGUgY2hhbm5lbCAoPj0gMCkuICovXG4gIGdyYWRpZW50OiBudW1iZXI7XG4gIC8qKiBBcmMgbGVuZ3RoIG9mIHRoZSBuZWFyZXN0IHBvaW50IGZyb20gdGhlIGRvd25zdHJlYW0gZW5kLiAqL1xuICBzOiBudW1iZXI7XG59XG5cbi8qKlxuICogQSBwb2x5bGluZSByZWFjaCBzdG9yZWQgZG93bnN0cmVhbS1maXJzdC4gTmVhcmVzdC1zZWdtZW50IHF1ZXJpZXMgdXNlIGFcbiAqIHVuaWZvcm0gZ3JpZCB3aG9zZSBjZWxscyBsaXN0IGV2ZXJ5IHNlZ21lbnQgd2l0aGluIGByZWFjaGAgbWV0cmVzLlxuICovXG5leHBvcnQgY2xhc3MgUml2ZXJSZWFjaCB7XG4gIHJlYWRvbmx5IHBvaW50czogUml2ZXJQb2ludFtdO1xuICBwcml2YXRlIHJlYWRvbmx5IGNlbGwgPSAzMjtcbiAgcHJpdmF0ZSByZWFkb25seSBncmlkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXG4gIGNvbnN0cnVjdG9yKHBvaW50czogUml2ZXJQb2ludFtdLCByZWFkb25seSByZWFjaDogbnVtYmVyKSB7XG4gICAgdGhpcy5wb2ludHMgPSBwb2ludHM7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgKyAxIDwgcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBhID0gcG9pbnRzW2ldLCBiID0gcG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IHgwID0gTWF0aC5taW4oYS54LCBiLngpIC0gcmVhY2gsIHgxID0gTWF0aC5tYXgoYS54LCBiLngpICsgcmVhY2g7XG4gICAgICBjb25zdCB6MCA9IE1hdGgubWluKGEueiwgYi56KSAtIHJlYWNoLCB6MSA9IE1hdGgubWF4KGEueiwgYi56KSArIHJlYWNoO1xuICAgICAgZm9yIChsZXQgY3ogPSBNYXRoLmZsb29yKHowIC8gdGhpcy5jZWxsKTsgY3ogPD0gTWF0aC5mbG9vcih6MSAvIHRoaXMuY2VsbCk7IGN6KyspIHtcbiAgICAgICAgZm9yIChsZXQgY3ggPSBNYXRoLmZsb29yKHgwIC8gdGhpcy5jZWxsKTsgY3ggPD0gTWF0aC5mbG9vcih4MSAvIHRoaXMuY2VsbCk7IGN4KyspIHtcbiAgICAgICAgICBjb25zdCBrZXkgPSBjZWxsS2V5KGN4LCBjeik7XG4gICAgICAgICAgbGV0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGtleSk7XG4gICAgICAgICAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgdGhpcy5ncmlkLnNldChrZXksIGxpc3QpOyB9XG4gICAgICAgICAgbGlzdC5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGxlbmd0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wb2ludHNbdGhpcy5wb2ludHMubGVuZ3RoIC0gMV0/LnMgPz8gMDsgfVxuXG4gIC8qKiBOZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQgd2l0aGluIGByZWFjaGAsIG9yIG51bGwuICovXG4gIG5lYXJlc3QoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBSZWFjaEhpdCB8IG51bGwge1xuICAgIGNvbnN0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGNlbGxLZXkoTWF0aC5mbG9vcih4IC8gdGhpcy5jZWxsKSwgTWF0aC5mbG9vcih6IC8gdGhpcy5jZWxsKSkpO1xuICAgIGlmICghbGlzdCkgcmV0dXJuIG51bGw7XG4gICAgbGV0IGJlc3QgPSBJbmZpbml0eSwgYmkgPSAtMSwgYnQgPSAwO1xuICAgIGZvciAoY29uc3QgaSBvZiBsaXN0KSB7XG4gICAgICBjb25zdCBhID0gdGhpcy5wb2ludHNbaV0sIGIgPSB0aGlzLnBvaW50c1tpICsgMV07XG4gICAgICBjb25zdCBkeCA9IGIueCAtIGEueCwgZHogPSBiLnogLSBhLno7XG4gICAgICBjb25zdCBsZW4yID0gZHggKiBkeCArIGR6ICogZHogfHwgMTtcbiAgICAgIGNvbnN0IHQgPSBjbGFtcCgoKHggLSBhLngpICogZHggKyAoeiAtIGEueikgKiBkeikgLyBsZW4yLCAwLCAxKTtcbiAgICAgIGNvbnN0IHB4ID0gYS54ICsgZHggKiB0LCBweiA9IGEueiArIGR6ICogdDtcbiAgICAgIGNvbnN0IGQyID0gKHggLSBweCkgKiogMiArICh6IC0gcHopICoqIDI7XG4gICAgICBpZiAoZDIgPCBiZXN0KSB7IGJlc3QgPSBkMjsgYmkgPSBpOyBidCA9IHQ7IH1cbiAgICB9XG4gICAgaWYgKGJpIDwgMCB8fCBiZXN0ID4gdGhpcy5yZWFjaCAqIHRoaXMucmVhY2gpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tiaV0sIGIgPSB0aGlzLnBvaW50c1tiaSArIDFdO1xuICAgIGNvbnN0IHNlZ0xlbiA9IE1hdGgubWF4KDFlLTYsIGIucyAtIGEucyk7XG4gICAgLy8gUG9pbnRzIGFyZSBzdG9yZWQgZG93bnN0cmVhbS1maXJzdCwgc28gZG93bnN0cmVhbSBpcyBhIDwtIGIuXG4gICAgY29uc3QgdHggPSAoYS54IC0gYi54KSAvIHNlZ0xlbiwgdHogPSAoYS56IC0gYi56KSAvIHNlZ0xlbjtcbiAgICByZXR1cm4ge1xuICAgICAgZDogTWF0aC5zcXJ0KGJlc3QpLFxuICAgICAgbGV2ZWw6IGEubGV2ZWwgKyAoYi5sZXZlbCAtIGEubGV2ZWwpICogYnQsXG4gICAgICB3aWR0aDogYS53aWR0aCArIChiLndpZHRoIC0gYS53aWR0aCkgKiBidCxcbiAgICAgIHR4LCB0eixcbiAgICAgIGdyYWRpZW50OiBNYXRoLm1heCgwLCAoYi5sZXZlbCAtIGEubGV2ZWwpIC8gc2VnTGVuKSxcbiAgICAgIHM6IGEucyArIChiLnMgLSBhLnMpICogYnQsXG4gICAgfTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjZWxsS2V5KGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKGN4ICsgNDA5NikgKiA4MTkyICsgKGN6ICsgNDA5Nik7XG59XG5cbmV4cG9ydCB0eXBlIFdhdGVyQm9keSA9ICdyaXZlcicgfCAnbGFrZScgfCAnc2VhJyB8ICdub25lJztcblxuZXhwb3J0IGludGVyZmFjZSBGbG93U2FtcGxlIHtcbiAgYm9keTogV2F0ZXJCb2R5O1xuICAvKiogVW5pdCBmbG93IGRpcmVjdGlvbiAoemVybyBmb3Igc3RpbGwgd2F0ZXIpLiAqL1xuICBkeDogbnVtYmVyO1xuICBkejogbnVtYmVyO1xuICAvKiogU3VyZmFjZSBjdXJyZW50IHNwZWVkIGluIG0vcy4gKi9cbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIeWRyb2xvZ3lPcHRpb25zIHtcbiAgc2VlZDogbnVtYmVyO1xuICAvKiogR2VuZXJhdG9yIHZlcnNpb24gdGhlIG5ldHdvcmsgYmVsb25ncyB0by4gKi9cbiAgdmVyc2lvbjogbnVtYmVyO1xuICAvKiogQmFzZSBoZWlnaHQgb2YgdGhlICp1bm1vZGlmaWVkIHYxIHNoYXBlKiAodXNlZCB0byBsb2NhdGUgbGFrZS9jaGFubmVsKS4gKi9cbiAgdjFIZWlnaHQ6IEhlaWdodFNhbXBsZXI7XG59XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9naWNhbCBuZXR3b3JrIGZvciBvbmUgKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKS4gKi9cbmV4cG9ydCBjbGFzcyBIeWRyb2xvZ3kge1xuICByZWFkb25seSBzZWVkOiBudW1iZXI7XG4gIHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcbiAgcmVhZG9ubHkgbGFrZTogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcng6IG51bWJlcjsgcno6IG51bWJlciB9O1xuICByZWFkb25seSBsb3dlcjogUml2ZXJSZWFjaDtcbiAgcmVhZG9ubHkgdXBwZXI6IFJpdmVyUmVhY2ggfCBudWxsO1xuICAvKiogVXBwZXItcml2ZXIgc291cmNlIHRhcm4gKHYyIG9ubHkpLiAqL1xuICByZWFkb25seSB0YXJuOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByOiBudW1iZXI7IGxldmVsOiBudW1iZXIgfSB8IG51bGw7XG5cbiAgY29uc3RydWN0b3Iob3B0czogSHlkcm9sb2d5T3B0aW9ucykge1xuICAgIHRoaXMuc2VlZCA9IG9wdHMuc2VlZDtcbiAgICB0aGlzLnZlcnNpb24gPSBvcHRzLnZlcnNpb247XG4gICAgdGhpcy5sYWtlID0gbG9jYXRlTGFrZShvcHRzLnYxSGVpZ2h0KTtcbiAgICB0aGlzLmxvd2VyID0gdHJhY2VMb3dlclJpdmVyKG9wdHMudjFIZWlnaHQsIHRoaXMubGFrZSk7XG4gICAgaWYgKG9wdHMudmVyc2lvbiA+PSAyKSB7XG4gICAgICBjb25zdCB1cHBlciA9IGF1dGhvclVwcGVyUml2ZXIob3B0cy5zZWVkLCB0aGlzLmxha2UpO1xuICAgICAgdGhpcy51cHBlciA9IHVwcGVyLnJlYWNoO1xuICAgICAgdGhpcy50YXJuID0gdXBwZXIudGFybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51cHBlciA9IG51bGw7XG4gICAgICB0aGlzLnRhcm4gPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdXJmYWNlIGN1cnJlbnQgZm9yIGEgd2F0ZXIgY29sdW1uLiBgbGV2ZWxgIGlzIHRoZSBjb2x1bW4ncyB3YXRlciBzdXJmYWNlLFxuICAgKiB1c2VkIHRvIHRlbGwgc2VhLWxldmVsIHdhdGVyIChsYWtlLCBsb3dlciByaXZlciwgc2VhKSBmcm9tIHRoZSB1cHBlciByaXZlci5cbiAgICovXG4gIGZsb3dBdCh4OiBudW1iZXIsIHo6IG51bWJlciwgbGV2ZWw6IG51bWJlcik6IEZsb3dTYW1wbGUge1xuICAgIGlmICh0aGlzLnVwcGVyICYmIGxldmVsID4gMC41KSB7XG4gICAgICBjb25zdCBoaXQgPSB0aGlzLnVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDw9IGhpdC53aWR0aCArIDIpIHtcbiAgICAgICAgY29uc3Qgc3BlZWQgPSBjbGFtcCgwLjU1ICsgaGl0LmdyYWRpZW50ICogOSwgMC40LCA0LjUpO1xuICAgICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogaGl0LnR4LCBkejogaGl0LnR6LCBzcGVlZCB9O1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMudGFybiAmJiBNYXRoLmh5cG90KHggLSB0aGlzLnRhcm4ueCwgeiAtIHRoaXMudGFybi56KSA8IHRoaXMudGFybi5yICsgNCkge1xuICAgICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLnRvd2FyZHMoeCwgeiwgdGhpcy51cHBlclNvdXJjZSgpLCAwLjA2KSB9O1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBsb3cgPSB0aGlzLmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8PSBsb3cud2lkdGggKyA2KSB7XG4gICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogbG93LnR4LCBkejogbG93LnR6LCBzcGVlZDogMC4zNSArIDAuMjUgKiBzbW9vdGhzdGVwKGxvdy53aWR0aCArIDYsIDAsIGxvdy5kKSB9O1xuICAgIH1cbiAgICBjb25zdCBsZCA9IE1hdGguaHlwb3QoKHggLSB0aGlzLmxha2UueCkgLyB0aGlzLmxha2UucngsICh6IC0gdGhpcy5sYWtlLnopIC8gdGhpcy5sYWtlLnJ6KTtcbiAgICBpZiAobGQgPCAxLjM1KSB7XG4gICAgICAvLyBTbG93IGRyaWZ0IGZyb20gdGhlIGluZmxvdyB0b3dhcmQgdGhlIG91dGZsb3cgYXQgdGhlIGhlYWQgb2YgdGhlIGxvd2VyIHJpdmVyLlxuICAgICAgY29uc3QgaGVhZCA9IHRoaXMubG93ZXIucG9pbnRzW3RoaXMubG93ZXIucG9pbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZHJpZnQgPSB0b3dhcmRzKHgsIHosIGhlYWQsIDAuMDgpO1xuICAgICAgcmV0dXJuIHsgYm9keTogJ2xha2UnLCAuLi5kcmlmdCB9O1xuICAgIH1cbiAgICByZXR1cm4geyBib2R5OiAnc2VhJywgZHg6IDAsIGR6OiAwLCBzcGVlZDogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSB1cHBlclNvdXJjZSgpOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0ge1xuICAgIGNvbnN0IHB0cyA9IHRoaXMudXBwZXIhLnBvaW50cztcbiAgICByZXR1cm4gcHRzW3B0cy5sZW5ndGggLSAxXTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b3dhcmRzKHg6IG51bWJlciwgejogbnVtYmVyLCBwOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0sIHNwZWVkOiBudW1iZXIpIHtcbiAgY29uc3QgZHggPSBwLnggLSB4LCBkeiA9IHAueiAtIHo7XG4gIGNvbnN0IGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KSB8fCAxO1xuICByZXR1cm4geyBkeDogZHggLyBsZW4sIGR6OiBkeiAvIGxlbiwgc3BlZWQgfTtcbn1cblxuLyoqIEZpbmQgdGhlIHZhbGxleSBsYWtlIGZyb20gdGhlIHRlcnJhaW4gaXRzZWxmOiB0aGUgZGVlcCBiYXNpbiBOVyBvZiB0aGUgZm91bmRlciB2YWxsZXkuICovXG5mdW5jdGlvbiBsb2NhdGVMYWtlKGg6IEhlaWdodFNhbXBsZXIpOiBIeWRyb2xvZ3lbJ2xha2UnXSB7XG4gIGxldCBzeCA9IDAsIHN6ID0gMCwgbiA9IDAsIG1pblggPSBJbmZpbml0eSwgbWF4WCA9IC1JbmZpbml0eSwgbWluWiA9IEluZmluaXR5LCBtYXhaID0gLUluZmluaXR5O1xuICBmb3IgKGxldCB6ID0gLTQ2MDsgeiA8PSAtMTIwOyB6ICs9IDQpIHtcbiAgICBmb3IgKGxldCB4ID0gLTQ4MDsgeCA8PSAtNDA7IHggKz0gNCkge1xuICAgICAgaWYgKGgoeCwgeikgPiAtNCkgY29udGludWU7XG4gICAgICBzeCArPSB4OyBzeiArPSB6OyBuKys7XG4gICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgeCk7IG1heFggPSBNYXRoLm1heChtYXhYLCB4KTtcbiAgICAgIG1pblogPSBNYXRoLm1pbihtaW5aLCB6KTsgbWF4WiA9IE1hdGgubWF4KG1heFosIHopO1xuICAgIH1cbiAgfVxuICBpZiAobiA9PT0gMCkgcmV0dXJuIHsgeDogLTI2MCwgejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH07XG4gIHJldHVybiB7XG4gICAgeDogc3ggLyBuLCB6OiBzeiAvIG4sXG4gICAgcng6IE1hdGgubWF4KDMwLCAobWF4WCAtIG1pblgpIC8gMiArIDEwKSwgcno6IE1hdGgubWF4KDMwLCAobWF4WiAtIG1pblopIC8gMiArIDEwKSxcbiAgfTtcbn1cblxuLyoqXG4gKiBUcmFjZSB0aGUgY2FydmVkIGxvd2xhbmQgY2hhbm5lbCBmcm9tIHRoZSBsYWtlIG91dGZsb3cgc291dGggdG8gdGhlIHNlYS4gRm9yXG4gKiBlYWNoIDQgbSByb3cgdGhlIGNoYW5uZWwgaXMgdGhlIGxvd2VzdCBjb2x1bW4gbmVhciB0aGUgcHJldmlvdXMgY2VudHJlOyB0aGVcbiAqIHRyYWNlIGlzIHNtb290aGVkIHNvIHRoZSBmbG93IGZpZWxkIGRvZXMgbm90IGppdHRlciB3aXRoIHRoZSAxIG0gdm94ZWxzLlxuICovXG5mdW5jdGlvbiB0cmFjZUxvd2VyUml2ZXIoaDogSGVpZ2h0U2FtcGxlciwgbGFrZTogSHlkcm9sb2d5WydsYWtlJ10pOiBSaXZlclJlYWNoIHtcbiAgY29uc3QgcmF3OiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGxldCBjeCA9IGxha2UueCArIGxha2UucnggKiAwLjU1O1xuICBsZXQgeiA9IE1hdGgucm91bmQobGFrZS56ICsgbGFrZS5yeiAqIDAuNik7XG4gIC8vIFN0YXJ0IGF0IHRoZSBsYWtlJ3Mgc291dGgtZWFzdCBvdXRmbG93IGFuZCBmb2xsb3cgdGhlIGNoYW5uZWwgZG93bnN0cmVhbS5cbiAgZm9yICg7IHogPD0gOTAwOyB6ICs9IDQpIHtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBieCA9IGN4O1xuICAgIGZvciAobGV0IHggPSBNYXRoLnJvdW5kKGN4IC0gNDApOyB4IDw9IGN4ICsgNDA7IHggKz0gMikge1xuICAgICAgY29uc3QgdiA9IGgoeCwgeikgKyBNYXRoLmFicyh4IC0gY3gpICogMC4wMjtcbiAgICAgIGlmICh2IDwgYmVzdCkgeyBiZXN0ID0gdjsgYnggPSB4OyB9XG4gICAgfVxuICAgIGN4ID0gYng7XG4gICAgcmF3LnB1c2goeyB4OiBieCwgeiB9KTtcbiAgICAvLyBUaGUgdHJhY2UgZW5kcyBvbmNlIGl0IHJlYWNoZXMgb3BlbiBzZWEgZm9yIGEgc3VzdGFpbmVkIHN0cmV0Y2guXG4gICAgaWYgKGJlc3QgPCAtNiAmJiByYXcubGVuZ3RoID4gMjAgJiYgaChieCwgeiArIDgpIDwgLTYgJiYgaChieCwgeiArIDE2KSA8IC02KSBicmVhaztcbiAgfVxuICBjb25zdCBzbW9vdGggPSByYXcubWFwKChwLCBpKSA9PiB7XG4gICAgbGV0IHN4ID0gMCwgbiA9IDA7XG4gICAgZm9yIChsZXQgayA9IE1hdGgubWF4KDAsIGkgLSA0KTsgayA8PSBNYXRoLm1pbihyYXcubGVuZ3RoIC0gMSwgaSArIDQpOyBrKyspIHsgc3ggKz0gcmF3W2tdLng7IG4rKzsgfVxuICAgIHJldHVybiB7IHg6IHN4IC8gbiwgejogcC56IH07XG4gIH0pO1xuICAvLyBTdG9yZSBkb3duc3RyZWFtLWZpcnN0OiBpbmRleCAwIGlzIHRoZSBzZWEgbW91dGguXG4gIHNtb290aC5yZXZlcnNlKCk7XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gW107XG4gIGxldCBzID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzbW9vdGgubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaSA+IDApIHMgKz0gTWF0aC5oeXBvdChzbW9vdGhbaV0ueCAtIHNtb290aFtpIC0gMV0ueCwgc21vb3RoW2ldLnogLSBzbW9vdGhbaSAtIDFdLnopO1xuICAgIHBvaW50cy5wdXNoKHsgeDogc21vb3RoW2ldLngsIHo6IHNtb290aFtpXS56LCBzLCBsZXZlbDogMCwgd2lkdGg6IDYgfSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBSaXZlclJlYWNoKHBvaW50cywgNDApO1xufVxuXG4vKiogV2F0ZXItc3VyZmFjZSBkcm9wcyBhbG9uZyB0aGUgdXBwZXIgcml2ZXIsIGFzIChmcmFjdGlvbiBvZiBsZW5ndGgsIG1ldHJlcykuICovXG5jb25zdCBGQUxMUzogUmVhZG9ubHlBcnJheTxyZWFkb25seSBbbnVtYmVyLCBudW1iZXJdPiA9IFtbMC4yLCA3XSwgWzAuNDgsIDExXSwgWzAuNzQsIDEzXV07XG5jb25zdCBVUFBFUl9HUkFESUVOVCA9IDAuMDM7XG5cbi8qKlxuICogQXV0aG9yIHRoZSB2MiBtb3VudGFpbiByaXZlcjogYSBzZWVkZWQgbWVhbmRlcmluZyBjZW50cmVsaW5lIGZyb20gdGhlIGxha2Unc1xuICogbm9ydGggc2hvcmUgdG8gYSBoaWdobGFuZCB0YXJuLCB3aXRoIGEgbGV2ZWwgcHJvZmlsZSB0aGF0IG9ubHkgcmlzZXNcbiAqIHVwc3RyZWFtIChnZW50bGUgZ3JhZGllbnQgcGx1cyB0aHJlZSBjYXNjYWRlcykuXG4gKi9cbmZ1bmN0aW9uIGF1dGhvclVwcGVyUml2ZXIoc2VlZDogbnVtYmVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IHtcbiAgcmVhY2g6IFJpdmVyUmVhY2g7IHRhcm46IE5vbk51bGxhYmxlPEh5ZHJvbG9neVsndGFybiddPjtcbn0ge1xuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChzZWVkIF4gMHg1ZWVkMikgPj4+IDApO1xuICBjb25zdCBqID0gKGE6IG51bWJlcikgPT4gKHJuZCgpIC0gMC41KSAqIDIgKiBhO1xuICBjb25zdCBtb3V0aCA9IHsgeDogbGFrZS54ICsgbGFrZS5yeCAqIDAuMSwgejogbGFrZS56IC0gbGFrZS5yeiAqIDAuNTUgfTtcbiAgY29uc3QgY29udHJvbHMgPSBbXG4gICAgbW91dGgsXG4gICAgeyB4OiBsYWtlLnggKyAyMCArIGooMjApLCB6OiAtNDEwICsgaigxNSkgfSxcbiAgICB7IHg6IC0xOTAgKyBqKDM1KSwgejogLTUyMCArIGooMjApIH0sXG4gICAgeyB4OiAtMjE1ICsgaigzNSksIHo6IC02NDAgKyBqKDIwKSB9LFxuICAgIHsgeDogLTE2NSArIGooMzApLCB6OiAtNzcwICsgaigxNSkgfSxcbiAgXTtcbiAgLy8gQ2F0bXVsbC1Sb20gdGhyb3VnaCB0aGUgY29udHJvbHMsIHRoZW4gcmVzYW1wbGUgYXQgfjggbSBzcGFjaW5nIHdpdGggYVxuICAvLyBzbWFsbCBzZWVkZWQgbWVhbmRlciBzbyB0aGUgY2hhbm5lbCBpcyBub3QgYSBzbW9vdGggc3BsaW5lLlxuICBjb25zdCBkZW5zZTogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbnRyb2xzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGNvbnN0IHAwID0gY29udHJvbHNbTWF0aC5tYXgoMCwgaSAtIDEpXSwgcDEgPSBjb250cm9sc1tpXTtcbiAgICBjb25zdCBwMiA9IGNvbnRyb2xzW2kgKyAxXSwgcDMgPSBjb250cm9sc1tNYXRoLm1pbihjb250cm9scy5sZW5ndGggLSAxLCBpICsgMildO1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgMjQ7IGsrKykge1xuICAgICAgY29uc3QgdCA9IGsgLyAyNCwgdDIgPSB0ICogdCwgdDMgPSB0MiAqIHQ7XG4gICAgICBkZW5zZS5wdXNoKHtcbiAgICAgICAgeDogMC41ICogKDIgKiBwMS54ICsgKC1wMC54ICsgcDIueCkgKiB0ICsgKDIgKiBwMC54IC0gNSAqIHAxLnggKyA0ICogcDIueCAtIHAzLngpICogdDJcbiAgICAgICAgICArICgtcDAueCArIDMgKiBwMS54IC0gMyAqIHAyLnggKyBwMy54KSAqIHQzKSxcbiAgICAgICAgejogMC41ICogKDIgKiBwMS56ICsgKC1wMC56ICsgcDIueikgKiB0ICsgKDIgKiBwMC56IC0gNSAqIHAxLnogKyA0ICogcDIueiAtIHAzLnopICogdDJcbiAgICAgICAgICArICgtcDAueiArIDMgKiBwMS56IC0gMyAqIHAyLnogKyBwMy56KSAqIHQzKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBkZW5zZS5wdXNoKGNvbnRyb2xzW2NvbnRyb2xzLmxlbmd0aCAtIDFdKTtcbiAgY29uc3QgcmVzYW1wbGVkOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyOyBzOiBudW1iZXIgfT4gPSBbeyAuLi5kZW5zZVswXSwgczogMCB9XTtcbiAgbGV0IGFjYyA9IDAsIHMgPSAwO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGRlbnNlLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgc3RlcCA9IE1hdGguaHlwb3QoZGVuc2VbaV0ueCAtIGRlbnNlW2kgLSAxXS54LCBkZW5zZVtpXS56IC0gZGVuc2VbaSAtIDFdLnopO1xuICAgIGFjYyArPSBzdGVwOyBzICs9IHN0ZXA7XG4gICAgaWYgKGFjYyA+PSA4IHx8IGkgPT09IGRlbnNlLmxlbmd0aCAtIDEpIHtcbiAgICAgIGNvbnN0IG0gPSAoZmJtMihzIC8gNjAsIDMuMSwgc2VlZCArIDgwMSwgMikgLSAwLjUpICogMTQ7XG4gICAgICByZXNhbXBsZWQucHVzaCh7IHg6IGRlbnNlW2ldLnggKyBtLCB6OiBkZW5zZVtpXS56LCBzIH0pO1xuICAgICAgYWNjID0gMDtcbiAgICB9XG4gIH1cbiAgY29uc3QgdG90YWwgPSByZXNhbXBsZWRbcmVzYW1wbGVkLmxlbmd0aCAtIDFdLnM7XG4gIGNvbnN0IGxldmVsQXQgPSAoc3Y6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgbGV0IGxldmVsID0gc3YgKiBVUFBFUl9HUkFESUVOVDtcbiAgICBmb3IgKGNvbnN0IFtmcmFjLCBkcm9wXSBvZiBGQUxMUykge1xuICAgICAgLy8gRWFjaCBmYWxsIGlzIGEgc2hvcnQgY2FzY2FkZSBvdmVyIH4xMCBtIG9mIGNoYW5uZWwuXG4gICAgICBsZXZlbCArPSBkcm9wICogc21vb3Roc3RlcCh0b3RhbCAqIGZyYWMgLSA1LCB0b3RhbCAqIGZyYWMgKyA1LCBzdik7XG4gICAgfVxuICAgIC8vIFRoZSBmaXJzdCA0MCBtIGludG8gdGhlIGxha2Ugc3RheXMgYXQgbGFrZSBsZXZlbC5cbiAgICByZXR1cm4gc3YgPCA0MCA/IDAgOiBsZXZlbCAtIDQwICogVVBQRVJfR1JBRElFTlQ7XG4gIH07XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gcmVzYW1wbGVkLm1hcCgocCkgPT4gKHtcbiAgICB4OiBwLngsIHo6IHAueiwgczogcC5zLCBsZXZlbDogTWF0aC5tYXgoMCwgbGV2ZWxBdChwLnMpKSxcbiAgICB3aWR0aDogMy4yICsgMi4yICogZmJtMihwLnMgLyA3MCwgOS43LCBzZWVkICsgODAyLCAyKSArICgxIC0gcC5zIC8gdG90YWwpICogMS41LFxuICB9KSk7XG4gIGNvbnN0IHNvdXJjZSA9IHBvaW50c1twb2ludHMubGVuZ3RoIC0gMV07XG4gIHJldHVybiB7XG4gICAgcmVhY2g6IG5ldyBSaXZlclJlYWNoKHBvaW50cywgMTEwKSxcbiAgICB0YXJuOiB7IHg6IHNvdXJjZS54LCB6OiBzb3VyY2UueiwgcjogMTgsIGxldmVsOiBzb3VyY2UubGV2ZWwgfSxcbiAgfTtcbn1cbiIsICIvLyBWb3hlbCBtYXRlcmlhbCBpZHMuIFB1cmUgZGF0YSBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIgKEQtMDA1KS5cbi8vIElkcyBhcmUgcGVyc2lzdGVkIGluIHNuYXBzaG90IGVkaXRzLCBzbyBleGlzdGluZyB2YWx1ZXMgbXVzdCBuZXZlciBjaGFuZ2UuXG5leHBvcnQgY29uc3QgTUFUID0ge1xuICBBSVI6IDAsXG4gIEdSQVNTOiAxLFxuICBTT0lMOiAyLFxuICBTQU5EOiAzLFxuICBHUkFWRUw6IDQsXG4gIFNUT05FOiA1LFxuICBPUkU6IDYsXG4gIFdBVEVSOiA3LFxuICBCRURST0NLOiA4LFxuICBNT1NTOiA5LFxuICAvKiogR2VuZXJhdG9yIHYyIGhpZ2hsYW5kcy4gTmV2ZXIgcHJvZHVjZWQgYnkgZ2VuZXJhdG9yIHYxLiAqL1xuICBTTk9XOiAxMCxcbn0gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBNYXRJZCA9ICh0eXBlb2YgTUFUKVtrZXlvZiB0eXBlb2YgTUFUXTtcblxuZXhwb3J0IGNvbnN0IGlzU29saWQgPSAobTogbnVtYmVyKTogYm9vbGVhbiA9PiBtICE9PSBNQVQuQUlSICYmIG0gIT09IE1BVC5XQVRFUjtcbmV4cG9ydCBjb25zdCBpc09wYXF1ZSA9IGlzU29saWQ7XG5cbi8qKiBIaWdoZXN0IG1hdGVyaWFsIGlkIHRoYXQgbWF5IGFwcGVhciBpbiBhIHZveGVsIGVkaXQuICovXG5leHBvcnQgY29uc3QgTUFYX01BVF9JRCA9IDEwO1xuIiwgIi8vIFRlcnJhaW4gZ2VuZXJhdG9yIHYyIFx1MjAxNCB0aGUgdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSAocHVyZSBUUywgRC0wMDUpLlxuLy9cbi8vIENvbXBhdGliaWxpdHkgY29udHJhY3Q6IGluc2lkZSB0aGUgZm91bmRlciBjb3JyaWRvciAodGhlIHNldHRsZW1lbnQgdmFsbGV5LFxuLy8gdGhlIGxha2UgYW5kIHRoZSBsb3dsYW5kIHJpdmVyKSB2MiBoZWlnaHRzIGVxdWFsIHYxIGV4YWN0bHksIHNvIHRoZSBwaW5uZWRcbi8vIGZvdW5kZXIgcHJvamVjdHMsIHRoZWlyIHByZXBhcmF0aW9uIHRhcmdldHMgYW5kIG5hdHVyYWwgZW50aXRpZXMgdGhlcmUgYXJlXG4vLyB1bmNoYW5nZWQuIE91dHNpZGUgaXQgdjIgYWRkczpcbi8vICAgLSBhIG5vcnRoZXJuIG1hc3NpZiBvbiBhbiBleHRlbmRlZCBpc2xhbmQsIHdpdGggc25vdyBhYm92ZSB0aGUgc25vd2xpbmU7XG4vLyAgIC0gZmxhbmtpbmcgcmFuZ2VzIHdlc3QgYW5kIGVhc3Qgb2YgdGhlIHZhbGxleSwgdGVycmFjZWQgaW50byBjbGlmZiBiYW5kcztcbi8vICAgLSBhIG1vdW50YWluIHJpdmVyIGNhcnZlZCBpbnRvIHRoZSBtYXNzaWYgZnJvbSBhIHRhcm4gZG93biB0byB0aGUgbGFrZSxcbi8vICAgICB3aG9zZSB3YXRlciBzdXJmYWNlIGNvbWVzIGZyb20gSHlkcm9sb2d5IGFuZCBuZXZlciByaXNlcyBkb3duc3RyZWFtO1xuLy8gICAtIGEgY29udGludW91cyBsb3dsYW5kIGNoYW5uZWwgKHYxIGhhcyBhIGRyeSBmb3JkIHNvdXRoIG9mIHRoZSBzaGVsZikuXG4vLyBIZWlnaHRzIGFyZSBpbnRlZ2VycyBpbiBbLTE0LCAxMDRdLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIGxlcnAsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7IE1BVCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5cbmV4cG9ydCBjb25zdCBWMl9TTk9XTElORSA9IDc0O1xuZXhwb3J0IGNvbnN0IFYyX01BWF9IRUlHSFQgPSAxMDQ7XG5cbmV4cG9ydCB0eXBlIFYxSGVpZ2h0ID0gKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IG51bWJlcjtcblxuZXhwb3J0IGludGVyZmFjZSBWMkNvbHVtbiB7XG4gIC8qKiBUb3Agc29saWQgeSArIDEgKHNhbWUgY29udmVudGlvbiBhcyBzdXJmYWNlSGVpZ2h0QXQpLiAqL1xuICBoOiBudW1iZXI7XG4gIC8qKiBXYXRlciBzdXJmYWNlIGZvciB0aGlzIGNvbHVtbjogY2VsbHMgW2gsIGxldmVsKSBob2xkIHdhdGVyLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogVHJ1ZSB3aGVuIHRoaXMgY29sdW1uIGlzIHBhcnQgb2YgdGhlIGNhcnZlZCBtb3VudGFpbi1yaXZlciBjaGFubmVsLiAqL1xuICBjaGFubmVsOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgVGVycmFpblYyIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcmVhZG9ubHkgc2VlZDogbnVtYmVyLFxuICAgIHByaXZhdGUgcmVhZG9ubHkgdjE6IFYxSGVpZ2h0LFxuICAgIHJlYWRvbmx5IGh5ZHJvbG9neTogSHlkcm9sb2d5LFxuICApIHt9XG5cbiAgLyoqIDAgPSBleGFjdGx5IHYxIChmb3VuZGVyIGNvcnJpZG9yKTsgMSA9IGZ1bGwgdjIgcmVsaWVmLiAqL1xuICByZWxpZWZNYXNrKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTM5MCwgLTQ3MCwgeik7XG4gICAgLy8gVGhlIHdlc3QgcmFuZ2Uga2VlcHMgY2xlYXIgb2YgdGhlIGxha2UgYmFzaW4gdW50aWwgdGhlIGxha2UgaXMgcGFzc2VkLlxuICAgIGNvbnN0IHdlc3RFZGdlID0gbGVycCgtNDUwLCAtMzIwLCBzbW9vdGhzdGVwKC0yMjAsIC0xNDAsIHopKTtcbiAgICBjb25zdCB3ZXN0ID0gc21vb3Roc3RlcCh3ZXN0RWRnZSwgd2VzdEVkZ2UgLSA5MCwgeCk7XG4gICAgY29uc3QgZWFzdCA9IHNtb290aHN0ZXAoMjMwLCAzMzAsIHgpO1xuICAgIHJldHVybiBNYXRoLm1heChub3J0aCwgd2VzdCwgZWFzdCk7XG4gIH1cblxuICAvKiogMCBhdCB0aGUgcmFuZ2UgZnJvbnQsIDEgZGVlcCBpbnNpZGU6IGZvb3RoaWxscyBmaXJzdCwgcGVha3MgYmVoaW5kLiAqL1xuICByYW5nZURlcHRoKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTQyMCwgLTcwMCwgeik7XG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlIC0gNDAsIHdlc3RFZGdlIC0gMzAwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyNzAsIDU2MCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFYyQ29sdW1uIHtcbiAgICBjb25zdCBzZWVkID0gdGhpcy5zZWVkO1xuICAgIGNvbnN0IGJhc2UgPSB0aGlzLnYxKHNlZWQsIHgsIHopO1xuICAgIGNvbnN0IG1hc2sgPSB0aGlzLnJlbGllZk1hc2soeCwgeik7XG4gICAgbGV0IGggPSBiYXNlO1xuXG4gICAgaWYgKG1hc2sgPiAwKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGlzbGFuZCBub3J0aCBzbyB0aGUgbWFzc2lmIGhhcyByb29tICh2MSBjb2FzdCBpcyB+eiAtNjAwKS5cbiAgICAgIGNvbnN0IG5vcnRoTGFuZCA9IHNtb290aHN0ZXAoLTQyMCwgLTUyMCwgeik7XG4gICAgICBjb25zdCBzaG9yZSA9IDEgLSBNYXRoLmh5cG90KCh4ICsgMTUwKSAvIDU2MCwgKHogKyA2OTApIC8gMzAwKVxuICAgICAgICArIChmYm0yKHggLyAxNjAsIHogLyAxNjAsIHNlZWQgKyA3MDEsIDMpIC0gMC41KSAqIDAuMztcbiAgICAgIGNvbnN0IGxhbmROID0gc21vb3Roc3RlcCgwLjAsIDAuMTQsIHNob3JlKSAqIG5vcnRoTGFuZDtcbiAgICAgIGNvbnN0IGdyb3VuZCA9IGxlcnAoYmFzZSwgTWF0aC5tYXgoYmFzZSwgNSArIDUgKiBmYm0yKHggLyA5MCwgeiAvIDkwLCBzZWVkICsgNzAyLCAyKSksIGxhbmROKTtcblxuICAgICAgLy8gUmlkZ2VkIG1hc3NpZiB3aXRoIHRlcnJhY2VkIGNsaWZmIGJhbmRzLlxuICAgICAgY29uc3Qgd3ggPSB4ICsgKGZibTIoeCAvIDI2MCwgeiAvIDI2MCwgc2VlZCArIDcwMywgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3Qgd3ogPSB6ICsgKGZibTIoeCAvIDI2MCArIDUuMSwgeiAvIDI2MCAtIDIuNywgc2VlZCArIDcwNCwgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3QgcjEgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMTAsIHd6IC8gMjEwLCBzZWVkICsgNzA1LCA0KSAtIDEpO1xuICAgICAgY29uc3QgcjIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4MCwgd3ogLyA4MCwgc2VlZCArIDcwNiwgMykgLSAxKTtcbiAgICAgIGNvbnN0IGx1bXAgPSBmYm0yKHd4IC8gMTIwLCB3eiAvIDEyMCwgc2VlZCArIDcwNywgMyk7XG4gICAgICBjb25zdCBkZXB0aCA9IHRoaXMucmFuZ2VEZXB0aCh4LCB6KTtcbiAgICAgIGxldCBtb3VudGFpbiA9IDE2ICsgKDggKyA4MCAqIGRlcHRoKSAqICgwLjU1ICogcjEgKiByMSArIDAuMjggKiByMiArIDAuMTcgKiBsdW1wKVxuICAgICAgICArIDE4ICogZGVwdGggKiBzbW9vdGhzdGVwKDAuNTUsIDAuOSwgcjEpO1xuICAgICAgY29uc3QgYmFuZCA9IDYgKyAyICogZmJtMih4IC8gMTQwLCB6IC8gMTQwLCBzZWVkICsgNzA4LCAyKTtcbiAgICAgIGNvbnN0IHQgPSBNYXRoLmZsb29yKG1vdW50YWluIC8gYmFuZCk7XG4gICAgICBjb25zdCBmcmFjID0gbW91bnRhaW4gLyBiYW5kIC0gdDtcbiAgICAgIG1vdW50YWluID0gKHQgKyBzbW9vdGhzdGVwKDAuNSwgMC44LCBmcmFjKSkgKiBiYW5kO1xuXG4gICAgICAvLyBPbmx5IGxhbmQgcmlzZXM7IHRoZSBzZWEgc3RheXMgc2VhLCBzbyByYW5nZXMgZW5kIGluIGNvYXN0YWwgY2xpZmZzLlxuICAgICAgY29uc3QgbGFuZEZhY3RvciA9IHNtb290aHN0ZXAoLTIsIDgsIGdyb3VuZCk7XG4gICAgICBoID0gbGVycChncm91bmQsIE1hdGgubWF4KGdyb3VuZCwgbW91bnRhaW4pLCBtYXNrICogbGFuZEZhY3Rvcik7XG4gICAgfVxuXG4gICAgbGV0IGxldmVsID0gaCA8IDAgPyAwIDogLUluZmluaXR5O1xuICAgIGxldCBjaGFubmVsID0gZmFsc2U7XG5cbiAgICAvLyBNb3VudGFpbiByaXZlcjogdmFsbGV5IGZsb29yLCBiYW5rcyBhbmQgY2hhbm5lbCBmb2xsb3cgdGhlIHdhdGVyIGxldmVsLlxuICAgIGNvbnN0IHVwcGVyID0gdGhpcy5oeWRyb2xvZ3kudXBwZXI7XG4gICAgaWYgKHVwcGVyKSB7XG4gICAgICBjb25zdCBoaXQgPSB1cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICBjb25zdCByYWlzZWQgPSBoaXQubGV2ZWwgPiAwLjI1O1xuICAgICAgICBjb25zdCB2dyA9IDU1ICsgMjggKiBmYm0yKGhpdC5zIC8gOTAsIDEuNywgc2VlZCArIDcwOSwgMik7XG4gICAgICAgIGNvbnN0IGZsb29yID0gaGl0LmxldmVsICsgMS41ICsgMi4yICogZmJtMih4IC8gNDAsIHogLyA0MCwgc2VlZCArIDcxMCwgMikgKyBoaXQuZCAqIDAuMDY7XG4gICAgICAgIGNvbnN0IHQgPSBzbW9vdGhzdGVwKHZ3ICogMC4zLCB2dywgaGl0LmQpO1xuICAgICAgICBoID0gTWF0aC5taW4oaCwgbGVycChmbG9vciwgaCwgdCkpO1xuICAgICAgICBjb25zdCB3ID0gaGl0LndpZHRoO1xuICAgICAgICBpZiAocmFpc2VkICYmIGhpdC5kIDwgdyArIDMpIHtcbiAgICAgICAgICAvLyBCYW5rcyBob2xkIGEgcmFpc2VkIHJpdmVyOiBuZXZlciBiZWxvdyBpdHMgd2F0ZXIgc3VyZmFjZS4gQXQgbGFrZVxuICAgICAgICAgIC8vIGxldmVsIHRoZSBzZWEtbGV2ZWwgZmlsbCBhbHJlYWR5IGNvbnRhaW5zIHRoZSB3YXRlci5cbiAgICAgICAgICBoID0gTWF0aC5tYXgoaCwgTWF0aC5jZWlsKGhpdC5sZXZlbCkgKyAxKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaGl0LmQgPCB3KSB7XG4gICAgICAgICAgY29uc3QgYmVkID0gaGl0LmxldmVsIC0gKDEuMiArIDEuMyAqICgxIC0gaGl0LmQgLyB3KSk7XG4gICAgICAgICAgaCA9IE1hdGgubWluKGgsIGJlZCk7XG4gICAgICAgICAgaWYgKHJhaXNlZCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZChoaXQubGV2ZWwpKTtcbiAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgdGFybiA9IHRoaXMuaHlkcm9sb2d5LnRhcm47XG4gICAgICBpZiAodGFybikge1xuICAgICAgICBjb25zdCB0ZCA9IE1hdGguaHlwb3QoeCAtIHRhcm4ueCwgeiAtIHRhcm4ueilcbiAgICAgICAgICAqICgxICsgMC4yICogKGZibTIoeCAvIDMwLCB6IC8gMzAsIHNlZWQgKyA3MTEsIDIpIC0gMC41KSk7XG4gICAgICAgIGlmICh0ZCA8IHRhcm4uciArIDYpIHtcbiAgICAgICAgICBjb25zdCByaW0gPSBNYXRoLmNlaWwodGFybi5sZXZlbCkgKyAxO1xuICAgICAgICAgIGlmICh0ZCA+PSB0YXJuLnIpIGggPSBNYXRoLm1heChoLCByaW0pO1xuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaCA9IE1hdGgubWluKE1hdGgubWF4KGgsIHJpbSksIHRhcm4ubGV2ZWwgLSAxIC0gMyAqIHNtb290aHN0ZXAodGFybi5yLCAwLCB0ZCkpO1xuICAgICAgICAgICAgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZCh0YXJuLmxldmVsKSk7XG4gICAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBMb3dsYW5kIGNoYW5uZWwgY29udGludWl0eTogdjEgbGVhdmVzIGEgZHJ5IGZvcmQgd2hlcmUgdGhlIHNoZWxmIG1lZXRzIHRoZSByaXZlci5cbiAgICBjb25zdCBsb3cgPSB0aGlzLmh5ZHJvbG9neS5sb3dlci5uZWFyZXN0KHgsIHopO1xuICAgIGlmIChsb3cgJiYgbG93LmQgPCAyLjUgJiYgaCA+PSAwICYmIGJhc2UgPCA0KSBoID0gLTE7XG5cbiAgICBoID0gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIFYyX01BWF9IRUlHSFQpKTtcbiAgICBpZiAoaCA8IDApIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIDApO1xuICAgIHJldHVybiB7IGgsIGxldmVsOiBsZXZlbCA9PT0gLUluZmluaXR5ID8gaCA6IGxldmVsLCBjaGFubmVsIH07XG4gIH1cblxuICBoZWlnaHQoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmNvbHVtbih4LCB6KS5oO1xuICB9XG5cbiAgLyoqIHYyIHRvcCBtYXRlcmlhbC4gRmFsbHMgYmFjayB0byB0aGUgdjEgcnVsZXMgZm9yIHRoZSB1bmNoYW5nZWQgY29ycmlkb3IuICovXG4gIHRvcE1hdGVyaWFsKFxuICAgIHg6IG51bWJlciwgejogbnVtYmVyLCBjb2w6IFYyQ29sdW1uLCBzbG9wZTogbnVtYmVyLFxuICAgIHYxVG9wOiAoaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyKSA9PiBNYXRJZCxcbiAgKTogTWF0SWQge1xuICAgIGNvbnN0IGggPSBjb2wuaDtcbiAgICBpZiAoY29sLmNoYW5uZWwgJiYgY29sLmxldmVsID4gaCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIgJiYgaCA+IDEpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDwgaGl0LndpZHRoICsgMi41ICYmIGhpdC5sZXZlbCA+IDAuMjUpIHtcbiAgICAgICAgcmV0dXJuIGZibTIoeCAvIDYsIHogLyA2LCB0aGlzLnNlZWQgKyA3MTIsIDEpID4gMC41ID8gTUFULkdSQVZFTCA6IE1BVC5TQU5EO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzbm93bGluZSA9IFYyX1NOT1dMSU5FICsgKGZibTIoeCAvIDcwLCB6IC8gNzAsIHRoaXMuc2VlZCArIDcxMywgMykgLSAwLjUpICogMTY7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgJiYgc2xvcGUgPD0gMykgcmV0dXJuIE1BVC5TTk9XO1xuICAgIGlmIChoID49IHNub3dsaW5lIC0gNiAmJiBzbG9wZSA8PSAxICYmIGZibTIoeCAvIDIwLCB6IC8gMjAsIHRoaXMuc2VlZCArIDcxNCwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKHRoaXMucmVsaWVmTWFzayh4LCB6KSA+IDAuNSAmJiBoID4gMzAgJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgICByZXR1cm4gdjFUb3AoaCwgc2xvcGUpO1xuICB9XG59XG4iLCAiLy8gU2ltdWxhdGlvbiBsYXllciBcdTIwMTQgcHVyZSBUeXBlU2NyaXB0LCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMSB3b3JsZCBmb3VuZGF0aW9uOiBhIGNodW5rZWQsIGdlbnVpbmVseSB0aHJlZS1kaW1lbnNpb25hbCB2b3hlbCB3b3JsZC5cbi8vIFRoZSBzdG9yZWQgc3RhdGUgaXMgb25lIG1hdGVyaWFsIGJ5dGUgcGVyIGNlbGwgKDAgPSBhaXIpOyBvY2N1cGFuY3kgaXNcbi8vIGltcGxpY2l0LiBTdXJmYWNlIGhlaWdodCBpcyBhIGRlcml2ZWQgcXVlcnksIG5vdCB0aGUgc3RvcmFnZS4gVGhpcyByZXBsYWNlc1xuLy8gdGhlIGZvcm1lciAyNTYgeCAyNTYgaGVpZ2h0ZmllbGQgKHNlZSBJUi0wMDUpLlxuLy9cbi8vIFdvcmxkIG1ldHJlczogeC96IGluIFstMTAyNCwgMTAyNCksIHkgaW4gWy0xNiwgMTEyKSwgc2VhIGxldmVsIDAuXG4vLyBBIGNodW5rIGlzIDMyIHggMzIgeCAxMjggY2VsbHMuIEdlbmVyYXRpb24gaXMgYSBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkLFxuLy8gZ2VuZXJhdG9yIHZlcnNpb24sIHBhcmFtZXRlcnMgYW5kIGNodW5rIGNvb3JkaW5hdGVzOyBlZGl0cyBhcmUgcmVjb3JkZWRcbi8vIHNlcGFyYXRlbHkgYW5kIHJlLWFwcGxpZWQgd2hlbiBhIGNodW5rIGlzIHJlZ2VuZXJhdGVkLlxuaW1wb3J0IHR5cGUgeyBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBMaWZlU3RhdGUgfSBmcm9tICcuL2Vjb25vbXknO1xuaW1wb3J0IHR5cGUgeyBIb21lc3RlYWRTdGF0ZSB9IGZyb20gJy4vaG9tZXN0ZWFkJztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5pbXBvcnQgeyBUZXJyYWluVjIsIFYyQ29sdW1uIH0gZnJvbSAnLi90ZXJyYWluLXYyJztcblxuZXhwb3J0IGNvbnN0IFdPUkxEX1NJWkUgPSAyMDQ4O1xuZXhwb3J0IGNvbnN0IEhBTEYgPSBXT1JMRF9TSVpFIC8gMjtcbmV4cG9ydCBjb25zdCBDSFVOS19TSVpFID0gMzI7XG5leHBvcnQgY29uc3QgQ0hVTktTX1BFUl9TSURFID0gV09STERfU0laRSAvIENIVU5LX1NJWkU7XG5leHBvcnQgY29uc3QgWV9NSU4gPSAtMTY7XG5leHBvcnQgY29uc3QgWV9NQVggPSAxMTI7XG5leHBvcnQgY29uc3QgV09STERfSEVJR0hUID0gWV9NQVggLSBZX01JTjtcbmV4cG9ydCBjb25zdCBTRUFfTEVWRUwgPSAwO1xuZXhwb3J0IGNvbnN0IFdBVEVSID0gU0VBX0xFVkVMO1xuLyoqIEdlbmVyYXRvciB2MTogdGhlIG9yaWdpbmFsIDIwNDggbSBpc2xhbmQuIERlZmF1bHQgZm9yIGNyZWF0ZVdvcmxkIGFuZCBhbGwgbGVnYWN5IHNhdmVzLiAqL1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WRVJTSU9OID0gMTtcbi8qKiBHZW5lcmF0b3IgdjI6IHZhbGxleS13aXRoLW1vdW50YWlucyBnZW9ncmFwaHkgd2l0aCBhIG1vdW50YWluIHJpdmVyIChzZWUgdGVycmFpbi12Mi50cykuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1YyID0gMjtcbi8qKiBUaGUgZ2VuZXJhdG9yIG5ldyBicm93c2VyIHdvcmxkcyB1c2UgYnkgZGVmYXVsdC4gKi9cbmV4cG9ydCBjb25zdCBMQVRFU1RfR0VORVJBVE9SX1ZFUlNJT04gPSBHRU5FUkFUT1JfVjI7XG5leHBvcnQgY29uc3QgU1VQUE9SVEVEX0dFTkVSQVRPUl9WRVJTSU9OUzogcmVhZG9ubHkgbnVtYmVyW10gPSBbR0VORVJBVE9SX1ZFUlNJT04sIEdFTkVSQVRPUl9WMl07XG5leHBvcnQgY29uc3QgaXNTdXBwb3J0ZWRHZW5lcmF0b3IgPSAodjogdW5rbm93bik6IHYgaXMgbnVtYmVyID0+XG4gIHR5cGVvZiB2ID09PSAnbnVtYmVyJyAmJiBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TLmluY2x1ZGVzKHYpO1xuZXhwb3J0IGNvbnN0IENIVU5LX1ZPTFVNRSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFICogV09STERfSEVJR0hUO1xuZXhwb3J0IGNvbnN0IENIVU5LX0FSRUEgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRTtcblxuZXhwb3J0IHsgTUFULCBpc1NvbGlkLCBpc09wYXF1ZSwgTUFYX01BVF9JRCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmV4cG9ydCB0eXBlIHsgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBNQVQsIGlzU29saWQsIE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuXG5leHBvcnQge1xuICBjbGFtcCwgbGVycCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIGZibTIsXG59IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHtcbiAgY2xhbXAsIGxlcnAsIHNtb290aHN0ZXAsIGhhc2gyaSwgaGFzaDNpLCBtdWxiZXJyeTMyLCB2YWx1ZU5vaXNlMywgZmJtMiwgZmJtMyxcbn0gZnJvbSAnLi9ub2lzZSc7XG5cbi8vIC0tLS0tLS0tLS0gd29ybGQgdHlwZXMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFBhcmFtcyB7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1BBUkFNUzogV29ybGRQYXJhbXMgPSB7XG4gIHNpemU6IFdPUkxEX1NJWkUsXG4gIGNodW5rU2l6ZTogQ0hVTktfU0laRSxcbiAgeU1pbjogWV9NSU4sXG4gIHlNYXg6IFlfTUFYLFxuICBzZWFMZXZlbDogU0VBX0xFVkVMLFxuICBnZW5lcmF0b3JWZXJzaW9uOiBHRU5FUkFUT1JfVkVSU0lPTixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIGtleTogc3RyaW5nO1xuICAvKiogeCArIHoqMzIgKyAoeS1ZX01JTikqMTAyNCAqL1xuICBkYXRhOiBVaW50OEFycmF5O1xuICAvKiogdG9wIHNvbGlkIHksIGVuY29kZWQgYXMgKHkgLSBZX01JTiksIDAuLjEyNzsgMCBtZWFucyBubyBzb2xpZC4gKi9cbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgLyoqIHRvcCBtYXRlcmlhbCBwZXIgY29sdW1uLiAqL1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xuICBkaXJ0eTogYm9vbGVhbjtcbiAgZ2VuZXJhdGVkQXQ6IG51bWJlcjtcbn1cblxuLy8gTmF0dXJhbCBhc3NldHMgYXJlIHRoZSBwcm9qZWN0J3MgU3R5bCAoYG5hdF9gKSBwaXBlbGluZSAoQVMtMDAxIHYyKSwgbm90XG4vLyBOb3hlbCBhcmNoaXRlY3R1cmUuIE5veGVsIHJlbWFpbnMgdGhlIGh1bWFuLW1hZGUga2l0L3dheXN0b25lL21hcmtlciBzeXN0ZW0uXG4vLyBSZXRpcmVkIG9ubHkgYXMgd29ybGQgY29udGVudC4gVGhlIG5hbWVzIHJlbWFpbiBpbiB0aGUgc2VyaWFsaXplZCB0eXBlIHNvXG4vLyBvbGQgc25hcHNob3RzIGFuZCBhY2NlcHRlZCBoYXJ2ZXN0IGpvdXJuYWxzIGNhbiBiZSBtaWdyYXRlZCB3aXRob3V0IHJlamVjdGluZ1xuLy8gb3RoZXJ3aXNlIHZhbGlkIHNhdmVzLiBHZW5lcmF0aW9uLCBjb2xsaXNpb24gYW5kIGluc3BlY3Rpb24gbmV2ZXIgdXNlIHRoZW0uXG5leHBvcnQgY29uc3QgUkVUSVJFRF9TVE9ORV9LSU5EUyA9IG5ldyBTZXQ8RW50aXR5S2luZD4oW1xuICAnc3R5bF9yb2NrX3NtYWxsJywgJ3N0eWxfcm9ja19tZWRpdW0nLCAnc3R5bF9yb2NrX2xhcmdlJyxcbl0pO1xuZXhwb3J0IGNvbnN0IGlzUmV0aXJlZFN0b25lS2luZCA9IChraW5kOiBFbnRpdHlLaW5kKTogYm9vbGVhbiA9PiBSRVRJUkVEX1NUT05FX0tJTkRTLmhhcyhraW5kKTtcbmV4cG9ydCB0eXBlIEFjdGl2ZUVudGl0eUtpbmQgPSBFeGNsdWRlPEVudGl0eUtpbmQsXG4gICdzdHlsX3JvY2tfc21hbGwnIHwgJ3N0eWxfcm9ja19tZWRpdW0nIHwgJ3N0eWxfcm9ja19sYXJnZSc+O1xuXG5mdW5jdGlvbiBsaXZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEVudGl0eSB8IG51bGwge1xuICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICByZXR1cm4gIWVudGl0eSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGlkKSA/IG51bGwgOiBlbnRpdHk7XG59XG5cbmV4cG9ydCB0eXBlIEVudGl0eUtpbmQgPVxuICB8ICdzdHlsX3RyZWVfc3BpcmUnXG4gIHwgJ3N0eWxfdHJlZV90YWJsZSdcbiAgfCAnc3R5bF90cmVlX2NsdXN0ZXInXG4gIHwgJ3N0eWxfdHJlZV9ibG9zc29tJ1xuICB8ICdzdHlsX3NocnViJ1xuICB8ICdzdHlsX3JvY2tfc21hbGwnXG4gIHwgJ3N0eWxfcm9ja19tZWRpdW0nXG4gIHwgJ3N0eWxfcm9ja19sYXJnZSdcbiAgfCAnc3R5bF9vcmUnXG4gIHwgJ3N0eWxfY2Fpcm4nXG4gIHwgJ3dheXN0b25lJ1xuICB8ICdtYXJrZXInO1xuXG5leHBvcnQgdHlwZSBSZXNvdXJjZVR5cGUgPSAnd29vZCcgfCAnc3RvbmUnIHwgJ29yZScgfCAnZmliZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVudGl0eSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIGNodW5rOiBzdHJpbmc7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBzY2FsZTogbnVtYmVyO1xuICB2YXJpYW50OiBudW1iZXI7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsO1xuICByZW1haW5pbmc6IG51bWJlcjtcbiAgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXI7XG4gIC8qKiBUcnVlIG9uY2UgdGhlIGVudGl0eSBpcyBmdWxseSBkZXBsZXRlZC4gKi9cbiAgaGFydmVzdGVkOiBib29sZWFuO1xuICAvKiogVHJ1ZSBhZnRlciB0aGUgZmlyc3Qgc3VjY2Vzc2Z1bCBoYXJ2ZXN0LCBldmVuIGlmIHlpZWxkIHJlbWFpbnMuICovXG4gIGhhcnZlc3RlZE9uY2U/OiBib29sZWFuO1xuICBwcm92aXNpb25hbDogYm9vbGVhbjtcbiAgYXV0aG9yZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm94ZWxTaXRlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgcHJvdmlzaW9uYWw6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVnaW9uSW5mbyB7XG4gIGlkOiBzdHJpbmc7XG4gIGxhYmVsOiBzdHJpbmc7XG4gIHR5cGU6ICdwbGFpbicgfCAnZm9yZXN0JyB8ICdoaWxscycgfCAnaGlnaGxhbmQnIHwgJ3dhdGVyJyB8ICdyaWRnZSc7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHJ4OiBudW1iZXI7XG4gIHJ6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRTdGF0cyB7XG4gIGNodW5rc0dlbmVyYXRlZDogbnVtYmVyO1xuICBjaHVua3NFdmljdGVkOiBudW1iZXI7XG4gIHZveGVsc0ZpbGxlZDogbnVtYmVyO1xuICBnZW5lcmF0aW9uTXM6IG51bWJlcjtcbiAgZW50aXRpZXM6IG51bWJlcjtcbiAgdHJlZXM6IG51bWJlcjtcbiAgcGlua1RyZWVzOiBudW1iZXI7XG4gIHBpbmtPdmVyZmxvdzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkIHtcbiAgc2VlZDogbnVtYmVyO1xuICBwYXJhbXM6IFdvcmxkUGFyYW1zO1xuICBjaHVua3M6IE1hcDxzdHJpbmcsIFZveGVsQ2h1bms+O1xuICBlbnRpdGllczogTWFwPHN0cmluZywgRW50aXR5PjtcbiAgZW50aXR5Q2h1bmtzOiBNYXA8c3RyaW5nLCBzdHJpbmdbXT47XG4gIC8qKiBDaHVua3Mgd2hvc2UgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWVudGl0eSBzdGF0ZSBoYXMgYmVlbiBjaGFuZ2VkLiAqL1xuICBlbnRpdHlDaGFuZ2VzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIFRvbWJzdG9uZXMgZm9yIHJlbW92ZWQgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsIGVudGl0aWVzLiAqL1xuICBlbnRpdHlSZW1vdmFsczogU2V0PHN0cmluZz47XG4gIC8qKiBBdXRob3JpdGF0aXZlIGJ1aWx0IHN0cnVjdHVyZXMgKGhvdXNlLCBwYXRoLCB0ZXJyYWNlcywgY3JvcHMpLiAqL1xuICBzdHJ1Y3R1cmVzOiBNYXA8c3RyaW5nLCBTdHJ1Y3R1cmU+O1xuICBzaXRlczogTm94ZWxTaXRlW107XG4gIHJlZ2lvbnM6IFJlZ2lvbkluZm9bXTtcbiAgLyoqIGNodW5rIGtleSAtPiBsb2NhbCB2b3hlbCBpbmRleCAtPiBtYXRlcmlhbC4gRHVyYWJsZSwgY29tcGFjdCBlZGl0cy4gKi9cbiAgZWRpdHM6IE1hcDxzdHJpbmcsIE1hcDxudW1iZXIsIG51bWJlcj4+O1xuICAvKiogR2xvYmFsIGxvY2FsLXBsYXllciBjYXJyaWVkIGJhZzsgYm91bmRlZCBpbiBzY2hlbWEgMywgbGVnYWN5IGluIDEvMi4gKi9cbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICAvKiogUHJlc2VudCBvbmx5IGFmdGVyIHNjaGVtYS0zIGdlbmVzaXMvcmVzdG9yYXRpb24uICovXG4gIGxpZmU/OiBMaWZlU3RhdGU7XG4gIC8qKiBNMDA2IGxpdmluZyBob21lc3RlYWQ7IHByZXNlbnQgb25jZSBmb3VuZGVkIChzY2hlbWEgMyBvbmx5KS4gKi9cbiAgaG9tZXN0ZWFkPzogSG9tZXN0ZWFkU3RhdGU7XG4gIGRpcnR5OiBTZXQ8c3RyaW5nPjtcbiAgc3RhdHM6IFdvcmxkU3RhdHM7XG4gIGF1dGhvcmVkUGxhY2VkOiBib29sZWFuO1xuICAvKipcbiAgICogTW9ub3RvbmljIHJldmlzaW9uIG9mIGF1dGhvcml0YXRpdmUgc3RhdGUgKHZveGVscyBhbmQgZW50aXRpZXMpLiBEZXJpdmVkXG4gICAqIGNhY2hlcyBrZXllZCBvbiB0aGlzIHZhbHVlIGFyZSBkaXNjYXJkZWQgYWZ0ZXIgYW4gZWRpdDsgbWVzaC9uYXZpZ2F0aW9uXG4gICAqIHJldmlzaW9ucyBhcmUgc2VwYXJhdGUgYmVjYXVzZSB0aGV5IGFyZSBkZXJpdmVkLCBub3Qgd29ybGQgc3RhdGUuXG4gICAqL1xuICByZXZpc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgY2h1bmtLZXkgPSAoY3g6IG51bWJlciwgY3o6IG51bWJlcikgPT4gYCR7Y3h9LCR7Y3p9YDtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblggPSAoY3g6IG51bWJlcikgPT4gY3ggKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblogPSAoY3o6IG51bWJlcikgPT4gY3ogKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBsb2NhbEluZGV4ID0gKGx4OiBudW1iZXIsIHlJbmRleDogbnVtYmVyLCBsejogbnVtYmVyKSA9PlxuICBseCArIGx6ICogQ0hVTktfU0laRSArIHlJbmRleCAqIENIVU5LX0FSRUE7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWCA9ICh4OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHggKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ogPSAoejogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh6ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxYID0gKHg6IG51bWJlcikgPT4geCAtICh3b3JsZFRvQ2h1bmtYKHgpICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFogPSAoejogbnVtYmVyKSA9PiB6IC0gKHdvcmxkVG9DaHVua1ooeikgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3QgeVRvSW5kZXggPSAoeTogbnVtYmVyKSA9PiB5IC0gWV9NSU47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXb3JsZChzZWVkID0gMTMzNywgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBpZiAoIWlzU3VwcG9ydGVkR2VuZXJhdG9yKGdlbmVyYXRvclZlcnNpb24pKSB0aHJvdyBuZXcgRXJyb3IoYHVuc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uICR7Z2VuZXJhdG9yVmVyc2lvbn1gKTtcbiAgcmV0dXJuIHtcbiAgICBzZWVkLFxuICAgIHBhcmFtczogeyAuLi5ERUZBVUxUX1BBUkFNUywgZ2VuZXJhdG9yVmVyc2lvbiB9LFxuICAgIGNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0aWVzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2hhbmdlczogbmV3IFNldCgpLFxuICAgIGVudGl0eVJlbW92YWxzOiBuZXcgU2V0KCksXG4gICAgc3RydWN0dXJlczogbmV3IE1hcCgpLFxuICAgIHNpdGVzOiBbXSxcbiAgICByZWdpb25zOiBSRUdJT05TLFxuICAgIGVkaXRzOiBuZXcgTWFwKCksXG4gICAgaW52ZW50b3J5OiB7fSxcbiAgICBkaXJ0eTogbmV3IFNldCgpLFxuICAgIHN0YXRzOiB7XG4gICAgICBjaHVua3NHZW5lcmF0ZWQ6IDAsIGNodW5rc0V2aWN0ZWQ6IDAsIHZveGVsc0ZpbGxlZDogMCwgZ2VuZXJhdGlvbk1zOiAwLFxuICAgICAgZW50aXRpZXM6IDAsIHRyZWVzOiAwLCBwaW5rVHJlZXM6IDAsIHBpbmtPdmVyZmxvdzogMCxcbiAgICB9LFxuICAgIGF1dGhvcmVkUGxhY2VkOiBmYWxzZSxcbiAgICByZXZpc2lvbjogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlV29ybGQoc2VlZCA9IDEzMzcsIGluaXRpYWxSYWRpdXMgPSAwLCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCwgZ2VuZXJhdG9yVmVyc2lvbik7XG4gIGNvbnN0IGNlbnRyZSA9IE1hdGguZmxvb3IoQ0hVTktTX1BFUl9TSURFIC8gMik7XG4gIGZvciAobGV0IGN6ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ogPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ggPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3grKykge1xuICAgICAgZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICB9XG4gIH1cbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuXG4vLyAtLS0tLS0tLS0tIGdlb2dyYXBoeSAtLS0tLS0tLS0tXG5leHBvcnQgY29uc3QgUkVHSU9OUzogUmVnaW9uSW5mb1tdID0gW1xuICB7IGlkOiAnZm91bmRlcicsIGxhYmVsOiAnRm91bmRlciB2YWxsZXknLCB0eXBlOiAncGxhaW4nLCBjeDogMCwgY3o6IDAsIHJ4OiAxMTAsIHJ6OiA4NSB9LFxuICB7IGlkOiAnZWFzdHdvb2QnLCBsYWJlbDogJ0Vhc3R3b29kJywgdHlwZTogJ2ZvcmVzdCcsIGN4OiAyMjAsIGN6OiAtMTEwLCByeDogMjYwLCByejogMjIwIH0sXG4gIHsgaWQ6ICdjcm93bicsIGxhYmVsOiAnQ3Jvd24gaGlnaGxhbmRzJywgdHlwZTogJ2hpZ2hsYW5kJywgY3g6IC0zNjAsIGN6OiAtMzAwLCByeDogMzgwLCByejogMzAwIH0sXG4gIHsgaWQ6ICdsYWtlJywgbGFiZWw6ICdNaXJyb3IgbGFrZScsIHR5cGU6ICd3YXRlcicsIGN4OiAtMjYwLCBjejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH0sXG4gIHsgaWQ6ICdzb3V0aGRvd25zJywgbGFiZWw6ICdTb3V0aCBkb3ducycsIHR5cGU6ICdoaWxscycsIGN4OiAxMjAsIGN6OiAzMzAsIHJ4OiAyNjAsIHJ6OiAxOTAgfSxcbiAgeyBpZDogJ3dlc3RyaXNlJywgbGFiZWw6ICdXZXN0IHJpc2UnLCB0eXBlOiAnaGlsbHMnLCBjeDogLTM2MCwgY3o6IDEyMCwgcng6IDIyMCwgcno6IDIxMCB9LFxuICB7IGlkOiAnY29hc3QnLCBsYWJlbDogJ0Jyb2tlbiBjb2FzdCcsIHR5cGU6ICdyaWRnZScsIGN4OiAwLCBjejogMCwgcng6IDc4MCwgcno6IDY2MCB9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyQ2VudGVyWCh6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUaGUgcml2ZXIgcnVucyBub3J0aFx1MjAxM3NvdXRoIGFib3V0IDcwXHUyMDEzMTEwIG0gd2VzdCBvZiB0aGUgZm91bmRlciBzaGVsZiwgc29cbiAgLy8gdGhlIGRlZmF1bHQgbm9ydGgtd2VzdCB2aWV3IGhhcyB3YXRlciwgYSBuZWFyIGJhbmsgYW5kIGEgZmFyIGJhbmsuXG4gIHJldHVybiAtOTAgKyA1NSAqIE1hdGguc2luKCh6ICsgMTAwKSAvIDI0MCkgKyAxOCAqIE1hdGguc2luKCh6IC0gMjApIC8gODApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLmFicyh4IC0gcml2ZXJDZW50ZXJYKHopKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxha2VEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLnNxcnQoKCh4ICsgMjYwKSAvIDEyMCkgKiogMiArICgoeiArIDIzMCkgLyA5NSkgKiogMik7XG59XG5cbi8qKlxuICogSW50ZWdlciB0b3Agc29saWQgeSBvZiB0aGUgYmFzZSBnZW5lcmF0ZWQgc3VyZmFjZSAobm8gZWRpdHMvb3ZlcmhhbmdzKS5cbiAqXG4gKiBUaGlzIGlzIHRoZSAqc2hhcGUqIHRoZSB2b3hlbCB2b2x1bWUgaXMgZmlsbGVkIGZyb20sIG5vdCB0aGUgc3RvcmVkIHdvcmxkLlxuICogVGhlIGltcG9ydGFudCBjb3JyZWN0aW9uIG92ZXIgdGhlIGZpcnN0IE0wMDEgcGFzcyBpcyB0aGF0IHRoZSBsYW5kc2NhcGUgaXNcbiAqIG5vdCBvbmUgc21vb3RoIHJhZGlhbCBib3dsOiBpdCBpcyBhIHdhcnBlZCBtdWx0aS1zY2FsZSBzdXJmYWNlIHdpdGggYSBicm9hZFxuICogcml2ZXIgdmFsbGV5LCBhIHNtYWxsIGJ1aWxkYWJsZSBzaGVsZiwgYW5kIHJpZGdlZCBoaWdobGFuZHMuIEEgc2hhbGxvd1xuICogc21vb3RoIHN1cmZhY2UgcXVhbnRpc2VkIHRvIDEgbSB2b3hlbHMgaXMgd2hhdCBwcm9kdWNlZCB0aGUgY29uY2VudHJpY1xuICogY29udG91ciByaW5nczsgdmFyaWVkIHJlbGllZiBhbmQgYSByaXZlciB2YWxsZXkgYnJlYWsgdGhlbSBuYXR1cmFsbHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlSGVpZ2h0QXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFR3by1zY2FsZSBkb21haW4gd2FycC4gVGhlIGJyb2FkIHdhcnAgbW92ZXMgY29hc3RsaW5lcyBhbmQgaGlsbHM7IHRoZVxuICAvLyBzbWFsbCB3YXJwIGtlZXBzIHRoZSAxIG0gcXVhbnRpc2F0aW9uIGZyb20gZm9sbG93aW5nIGNsZWFuIGNvbnRvdXJzLlxuICBjb25zdCB3eCA9IHhcbiAgICArIChmYm0yKHggLyA0MjAsIHogLyA0MjAsIHNlZWQgKyAxMDEsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1LCB6IC8gOTUsIHNlZWQgKyAxMDIsIDIpIC0gMC41KSAqIDMwO1xuICBjb25zdCB3eiA9IHpcbiAgICArIChmYm0yKHggLyA0MjAgKyA3LjMsIHogLyA0MjAgLSAzLjEsIHNlZWQgKyAxMDMsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1ICsgMy43LCB6IC8gOTUgLSA4LjEsIHNlZWQgKyAxMDQsIDIpIC0gMC41KSAqIDMwO1xuXG4gIGNvbnN0IHJhZGlhbCA9IE1hdGguc3FydCgod3ggLyA3ODApICoqIDIgKyAod3ogLyA2NjApICoqIDIpO1xuICBjb25zdCBjb2FzdE5vaXNlID0gKGZibTIod3ggLyAzMDAsIHd6IC8gMzAwLCBzZWVkICsgMTA1LCA0KSAtIDAuNSkgKiAwLjM0XG4gICAgKyAoZmJtMih3eCAvIDk1LCB3eiAvIDk1LCBzZWVkICsgMTA2LCAyKSAtIDAuNSkgKiAwLjEwO1xuICBjb25zdCBsYW5kbmVzcyA9IDEuMCAtIHJhZGlhbCArIGNvYXN0Tm9pc2U7XG4gIGNvbnN0IGlubGFuZCA9IHNtb290aHN0ZXAoLTAuMDMsIDAuMTIsIGxhbmRuZXNzKTtcblxuICBjb25zdCBvY2VhbkZsb29yID0gLTEzICsgNiAqIGZibTIod3ggLyAxNzAsIHd6IC8gMTcwLCBzZWVkICsgMTA3LCAzKTtcblxuICAvLyBSb2xsaW5nIGxhbmQgYXQgdGhyZWUgc2NhbGVzLiBUaGUgNDAgbSBhbmQgMTUgbSBjb21wb25lbnRzIGFyZSByZWFsXG4gIC8vIHN1cmZhY2UgaGVpZ2h0LCBub3QgYSByZW5kZXIgZGVjb3JhdGlvbiwgc28gdGhlIG1hY3JvIHNhbXBsZXIgYWdyZWVzLlxuICBjb25zdCBzd2VsbCA9IDQgKyAxMSAqIGZibTIod3ggLyAzNDAsIHd6IC8gMzQwLCBzZWVkICsgMTA4LCA0KTtcbiAgY29uc3QgaGlsbHMgPSA4ICogZmJtMih3eCAvIDExNSwgd3ogLyAxMTUsIHNlZWQgKyAxMDksIDMpO1xuICBjb25zdCBidW1wcyA9IDIuMiAqIGZibTIoeCAvIDQyLCB6IC8gNDIsIHNlZWQgKyAxMTAsIDIpXG4gICAgKyAwLjkgKiBmYm0yKHggLyAxNSwgeiAvIDE1LCBzZWVkICsgMTExLCAyKTtcblxuICAvLyBSaWRnZWQgaGlnaGxhbmRzLiBUaGUgbWFzc2lmIG1hc2sgaXMgcmVnaW9uYWwgYW5kIGJpYXNlZCB0byB0aGVcbiAgLy8gbm9ydGgtd2VzdDsgd2l0aG91dCB0aGUgcmVnaW9uYWwgZ2F0ZSB0aGUgZmlyc3QgTTAwMSBwYXNzIHJhaXNlZCBhIDQ4IG1cbiAgLy8gbW91bnRhaW4gZGlyZWN0bHkgdW5kZXIgdGhlIGZvdW5kZXIgc2hlbGYuXG4gIGNvbnN0IG1hc3NpZk5vaXNlID0gZmJtMih3eCAvIDQ4MCArIDExLCB3eiAvIDQ4MCAtIDcsIHNlZWQgKyAxMTIsIDQpO1xuICBjb25zdCBtYXNzaWZNYXNrID0gc21vb3Roc3RlcCgwLjYwLCAwLjc4LCBtYXNzaWZOb2lzZSk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMjMwLCB3eiAvIDIzMCwgc2VlZCArIDExMywgNCkgLSAxKTtcbiAgY29uc3QgcmlkZ2UyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTQsIDMpIC0gMSk7XG4gIGNvbnN0IG53QmlhcyA9IE1hdGguZXhwKC0oKCh3eCArIDM2MCkgLyAzODApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDMyMCkgKiogMikpO1xuICBjb25zdCBtb3VudCA9IE1hdGgubWluKDEsIG1hc3NpZk1hc2sgKiAoMC4zMCArIDAuNzAgKiBud0JpYXMpICsgMC4yMiAqIG53Qmlhcyk7XG5cbiAgbGV0IGggPSBzd2VsbCArIGhpbGxzICsgYnVtcHNcbiAgICArIG1vdW50ICogKDIwICsgNDAgKiByaWRnZSAqIHJpZGdlICsgMTIgKiByaWRnZTIpO1xuXG4gIC8vIFNwdXJzIGFuZCBndWxsaWVzIGF0IDMwXHUyMDEzOTAgbS4gV2l0aG91dCB0aGVzZSwgYSBzbW9vdGggaGlsbCBxdWFudGlzZWQgdG9cbiAgLy8gMSBtIHZveGVscyByZWFkcyBhcyBjb25jZW50cmljIGNvbnRvdXIgcmluZ3M7IHdpdGggdGhlbSwgdGhlIHNhbWUgaGlsbFxuICAvLyBicmVha3MgaW50byByaWRnZXMsIHNpZGUgdmFsbGV5cyBhbmQgcm9jayBmYWNlcy5cbiAgY29uc3Qgc3B1ciA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDg1LCB3eiAvIDg1LCBzZWVkICsgMTIwLCAzKSAtIDEpO1xuICBjb25zdCBndWxseSA9IE1hdGgucG93KDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDUyICsgMTMsIHd6IC8gNTIgLSA1LCBzZWVkICsgMTIxLCAzKSAtIDEpLCAyKTtcbiAgaCArPSAoc3B1ciAtIDAuNTUpICogNS4wIC0gZ3VsbHkgKiAzLjI7XG5cbiAgaCA9IG9jZWFuRmxvb3IgKyAoaCAtIG9jZWFuRmxvb3IpICogaW5sYW5kO1xuICBoICs9IDEuNiAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG5cbiAgLy8gQnJvYWQgcml2ZXIgdmFsbGV5LCB0aGVuIHRoZSBjaGFubmVsIGl0c2VsZi4gVGhlIHZhbGxleSBtYXNrIGlzIGdhdGVkIGJ5XG4gIC8vIGxhbmRuZXNzOiB3aXRob3V0IHRoZSBnYXRlIGl0IHB1bGxlZCB0aGUgb2NlYW4gZmxvb3IgdXAgdG8gdGhlIHZhbGxleVxuICAvLyBmbG9vciBvdXRzaWRlIHRoZSBpc2xhbmQsIHdoaWNoIHRoZSBtYXAgdmlldyBzaG93ZWQgYXMgcGFsZSByaXZlci1zaGFwZWRcbiAgLy8gYmFycyBydW5uaW5nIHRvIHRoZSBob3Jpem9uLlxuICBjb25zdCByZCA9IHJpdmVyRGlzdGFuY2Uod3gsIHd6KTtcbiAgY29uc3QgdmFsbGV5ID0gc21vb3Roc3RlcCg5NSwgMTAsIHJkKSAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG4gIGNvbnN0IHZhbGxleUZsb29yID0gMi41ICsgMS4wICogZmJtMih3eCAvIDYwLCB3eiAvIDYwLCBzZWVkICsgMTE1LCAyKTtcbiAgaCA9IGxlcnAoaCwgdmFsbGV5Rmxvb3IsIHZhbGxleSAqIDAuNzUpO1xuICBjb25zdCByaXZlclcgPSA1LjAgKyAzLjAgKiBmYm0yKHd4IC8gNDUsIHd6IC8gNDUsIHNlZWQgKyAxMTYsIDIpO1xuICAvLyBBIHdpZGUsIHNoYWxsb3cgY2hhbm5lbCBwcm9maWxlLiBUaGUgZmlyc3QgcGFzcyBjYXJ2ZWQgYSAxMiBtIHNsb3Qgd2l0aFxuICAvLyBuZWFyLXZlcnRpY2FsIGJhbmtzLCB3aGljaCByZWFkIGFzIGEgYnJpZ2h0IHN0b25lIHF1YXJyeSByYXRoZXIgdGhhbiBhXG4gIC8vIHJpdmVyLiBUaGUgb3V0ZXIgZWRnZSBpcyBub3cgfjI1IG0gZnJvbSB0aGUgY2VudHJlbGluZSwgYW5kIHRoZSBiZWQgaXNcbiAgLy8gb25seSAyIG0gYmVsb3cgc2VhIGxldmVsLlxuICBjb25zdCBjaGFubmVsID0gc21vb3Roc3RlcChyaXZlclcgKyAxOCwgcml2ZXJXICogMC40LCByZCk7XG4gIGlmIChsYW5kbmVzcyA+IDAuMCkgaCA9IGxlcnAoaCwgLTIuMCwgY2hhbm5lbCAqIDAuOTUpO1xuXG4gIC8vIExha2UgYmFzaW4gYXQgdGhlIGZvb3Qgb2YgdGhlIG5vcnRoLXdlc3QgaGlnaGxhbmRzLlxuICBjb25zdCBsYWtlRCA9IGxha2VEaXN0YW5jZSh3eCwgd3opXG4gICAgKiAoMSArIDAuMTggKiAoZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE3LCAyKSAtIDAuNSkgKiAyKTtcbiAgaWYgKGxha2VEIDwgMS4xNSkge1xuICAgIGNvbnN0IGxha2VNYXNrID0gc21vb3Roc3RlcCgxLjE1LCAwLjU1LCBsYWtlRCk7XG4gICAgaCA9IGxlcnAoaCwgLTYuNSwgbGFrZU1hc2sgKiAwLjk1KTtcbiAgfVxuXG4gIC8vIEZvdW5kZXIgc2hlbGY6IGEgc21hbGwsIGlycmVndWxhciBidWlsZGFibGUgdGVycmFjZSBvbiB0aGUgZWFzdCBiYW5rLlxuICAvLyBEZWxpYmVyYXRlbHkgbm90IGEgMjYwIG0gcmFkaWFsIGZsYXR0ZW47IHRoZSBwcmV2aW91cyBwYXNzIHNob3dlZCB0aGF0IGFcbiAgLy8gbGFyZ2UgZmxhdHRlbi10by1jb25zdGFudCBiZWNvbWVzIGEgdmlzaWJsZSBib3dsIG9mIGNvbnRvdXIgcmluZ3MuXG4gIGNvbnN0IHNoZWxmRCA9IE1hdGguc3FydCgoKHggKyA4KSAvIDYyKSAqKiAyICsgKCh6IC0gNCkgLyA0OCkgKiogMilcbiAgICArIChmYm0yKHggLyA0NSwgeiAvIDQ1LCBzZWVkICsgMTE4LCAyKSAtIDAuNSkgKiAwLjU1O1xuICBjb25zdCBzaGVsZiA9IHNtb290aHN0ZXAoMS4wNSwgMC41NSwgc2hlbGZEKTtcbiAgaWYgKHNoZWxmID4gMCkge1xuICAgIGNvbnN0IHRhcmdldCA9IDEzLjAgKyAxLjIgKiBmYm0yKHggLyAzNiwgeiAvIDM2LCBzZWVkICsgMTE5LCAyKSArIHggKiAwLjAxO1xuICAgIGggPSBsZXJwKGgsIHRhcmdldCwgc2hlbGYgKiAwLjc4KTtcbiAgfVxuXG4gIHJldHVybiBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgOTIpKTtcbn1cblxuZnVuY3Rpb24gc2xvcGVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAxKSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMSkpLFxuICApO1xufVxuXG5mdW5jdGlvbiB0b3BNYXRlcmlhbEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbik6IE1hdElkIHtcbiAgLy8gUml2ZXIgYmVkIGlzIGdyYXZlbDsgdGhlIGJlYWNoIGlzIGEgbmFycm93IHNhbmQgYmFuZCwgbm90IHRoZSB3aG9sZVxuICAvLyB2YWxsZXkgZmxvb3IuIFRoZSBmaXJzdCBwYXNzIG1hcmtlZCBldmVyeSBjZWxsIHdpdGhpbiA0IG0gb2Ygc2VhIGxldmVsXG4gIC8vIGFzIHNhbmQsIHdoaWNoIHByb2R1Y2VkIGEgY29uc3BpY3VvdXMgcGFsZSBzdHJpcCBhbG9uZyB0aGUgcml2ZXIuXG4gIGlmIChyaXZlckRpc3RhbmNlKHgsIHopIDwgMTIgJiYgaCA8IFNFQV9MRVZFTCArIDEpIHJldHVybiBNQVQuR1JBVkVMO1xuICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAwLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKG5lYXJXYXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbmVhcldhdGVyID1cbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAzKSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMykgPCBTRUFfTEVWRUwgKyAxO1xuICB9XG4gIGlmIChuZWFyV2F0ZXIgJiYgaCA8PSBTRUFfTEVWRUwgKyAxLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHNsb3BlID49IDMpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNTggJiYgZmJtMih4IC8gMTgsIHogLyAxOCwgc2VlZCArIDEyMCwgMikgPiAwLjQ1KSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQ4ICYmIHNsb3BlID49IDIpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDAgJiYgc2xvcGUgPj0gMiAmJiBmYm0yKHggLyAxMiwgeiAvIDEyLCBzZWVkICsgMTIxLCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU1RPTkU7XG4gIHJldHVybiBNQVQuR1JBU1M7XG5cbn1cblxuLyoqIFB1YmxpYyBiYXNlLW1hdGVyaWFsIHNlbGVjdG9yIGZvciBtYWNybyBMT0QgYW5kIHRlc3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbChcbiAgc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI6IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5mdW5jdGlvbiBzdWJzb2lsRm9yKHRvcDogTWF0SWQpOiBNYXRJZCB7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFTUyB8fCB0b3AgPT09IE1BVC5NT1NTKSByZXR1cm4gTUFULlNPSUw7XG4gIGlmICh0b3AgPT09IE1BVC5TTk9XKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAodG9wID09PSBNQVQuR1JBVkVMKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgcmV0dXJuIE1BVC5TVE9ORTtcbn1cblxuZnVuY3Rpb24gb3JlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsdXN0ZXIgPSBmYm0yKHggLyA1NSwgeiAvIDU1LCBzZWVkICsgMTMwLCAyKTtcbiAgaWYgKGNsdXN0ZXIgPCAwLjU3KSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IG4gPSB2YWx1ZU5vaXNlMyh4ICogMC4wOSwgeSAqIDAuMTMsIHogKiAwLjA5LCBzZWVkICsgMTMxKTtcbiAgY29uc3QgbjIgPSB2YWx1ZU5vaXNlMyh4ICogMC4yMiArIDUsIHkgKiAwLjMxLCB6ICogMC4yMiAtIDMsIHNlZWQgKyAxMzIpO1xuICByZXR1cm4gbiA+IDAuNzAgJiYgbjIgPiAwLjUwO1xufVxuXG5mdW5jdGlvbiBjYXZlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBmYm0zKHggKiAwLjA3NSwgeSAqIDAuMTEsIHogKiAwLjA3NSwgc2VlZCArIDE0MCwgMikgPiAwLjcyO1xufVxuXG5mdW5jdGlvbiBvdmVyaGFuZ0F0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gdmFsdWVOb2lzZTMoeCAqIDAuMTgsIHkgKiAwLjIyLCB6ICogMC4xOCwgc2VlZCArIDE0MSkgPiAwLjYyO1xufVxuXG4vLyAtLS0tLS0tLS0tIHZlcnNpb25lZCBnZW5lcmF0b3IgZGlzcGF0Y2ggLS0tLS0tLS0tLVxuY29uc3QgdjJDYWNoZSA9IG5ldyBNYXA8bnVtYmVyLCBUZXJyYWluVjI+KCk7XG5jb25zdCBoeWRyb0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIEh5ZHJvbG9neT4oKTtcblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2d5IG5ldHdvcmsgZm9yIGEgc2VlZCBhbmQgZ2VuZXJhdG9yIHZlcnNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gaHlkcm9sb2d5Rm9yKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyKTogSHlkcm9sb2d5IHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmh5ZHJvbG9neTtcbiAgY29uc3Qga2V5ID0gYCR7c2VlZH06JHt2ZXJzaW9ufWA7XG4gIGxldCBoeWRybyA9IGh5ZHJvQ2FjaGUuZ2V0KGtleSk7XG4gIGlmICghaHlkcm8pIHtcbiAgICBoeWRybyA9IG5ldyBIeWRyb2xvZ3koeyBzZWVkLCB2ZXJzaW9uLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBoeWRyb0NhY2hlLnNldChrZXksIGh5ZHJvKTtcbiAgfVxuICByZXR1cm4gaHlkcm87XG59XG5cbi8qKiBAaW50ZXJuYWwgVGhlIHYyIGdlbmVyYXRvciBmb3IgYSBzZWVkIChjYWNoZWQ7IHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRlcnJhaW5WMihzZWVkOiBudW1iZXIpOiBUZXJyYWluVjIge1xuICBsZXQgZ2VuID0gdjJDYWNoZS5nZXQoc2VlZCk7XG4gIGlmICghZ2VuKSB7XG4gICAgY29uc3QgaHlkcm9sb2d5ID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb246IEdFTkVSQVRPUl9WMiwgdjFIZWlnaHQ6ICh4LCB6KSA9PiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeikgfSk7XG4gICAgZ2VuID0gbmV3IFRlcnJhaW5WMihzZWVkLCBzdXJmYWNlSGVpZ2h0QXQsIGh5ZHJvbG9neSk7XG4gICAgdjJDYWNoZS5zZXQoc2VlZCwgZ2VuKTtcbiAgfVxuICByZXR1cm4gZ2VuO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgaGVpZ2h0ICh0b3Agc29saWQgKyAxKSBmb3IgYW55IHN1cHBvcnRlZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlSGVpZ2h0QXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpLmhlaWdodCh4LCB6KSA6IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbn1cblxuLyoqIEJhc2UgZ2VuZXJhdGVkIHdhdGVyIHN1cmZhY2U6IHdhdGVyIGZpbGxzIGNlbGxzIFtoZWlnaHQsIGxldmVsKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlV2F0ZXJMZXZlbEF0KHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikgcmV0dXJuIHRlcnJhaW5WMihzZWVkKS5jb2x1bW4oeCwgeikubGV2ZWw7XG4gIGNvbnN0IGggPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIDogaDtcbn1cblxuZnVuY3Rpb24gdmVyc2lvbmVkU2xvcGUoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4IC0gMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCArIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogLSAxKSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6ICsgMSkpLFxuICApO1xufVxuXG4vKiogQmFzZSB0b3AgbWF0ZXJpYWwgZm9yIGFueSBnZW5lcmF0b3IgdmVyc2lvbiAobWFjcm8gTE9ELCBlbnRpdHkgcGxhY2VtZW50KS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWxGb3IoXG4gIHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuLFxuKTogTWF0SWQge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHtcbiAgICBjb25zdCBnZW4gPSB0ZXJyYWluVjIoc2VlZCk7XG4gICAgcmV0dXJuIGdlbi50b3BNYXRlcmlhbCh4LCB6LCBnZW4uY29sdW1uKHgsIHopLCBzbG9wZSxcbiAgICAgIChoaCwgc3MpID0+IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaGgsIHNzLCBuZWFyV2F0ZXIpKTtcbiAgfVxuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeTogbnVtYmVyO1xuICB0b3A6IE1hdElkO1xuICBzbG9wZTogbnVtYmVyO1xufVxuXG4vKiogQmFzZSBzdXJmYWNlIHNhbXBsZSBmb3IgbWFjcm8gTE9ELiBEb2VzIG5vdCBpbmNsdWRlIHZveGVsIGVkaXRzL292ZXJoYW5ncy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVTdXJmYWNlKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBTdXJmYWNlU2FtcGxlIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgY29uc3Qgc2xvcGUgPSBzbG9wZUF0KHNlZWQsIHgsIHosIHkpO1xuICByZXR1cm4geyB5LCB0b3A6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgeSwgc2xvcGUpLCBzbG9wZSB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNodW5rIGdlbmVyYXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgcmV0dXJuIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChjaHVua0tleShjeCwgY3opKTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IGJhc2UgPSBnZW5lcmF0ZUJhc2VDaHVuayh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgY3gsIGN6KTtcbiAgcmV0dXJuIGluc3RhbGxCYXNlQ2h1bmsod29ybGQsIGJhc2UsIHBlcmZvcm1hbmNlLm5vdygpIC0gdDApO1xufVxuXG4vKipcbiAqIEJhc2UgZ2VuZXJhdGVkIGNvbnRlbnRzIG9mIGEgY2h1bmsgYmVmb3JlIGR1cmFibGUgZWRpdHMuIEEgcHVyZSBmdW5jdGlvbiBvZlxuICogKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uLCBjeCwgY3opOiBzYWZlIHRvIGNvbXB1dGUgaW4gYSBXZWIgV29ya2VyLCBhbmQgdGhlXG4gKiBieXRlcyBhcmUgaWRlbnRpY2FsIHdoZXJldmVyIGl0IHJ1bnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQmFzZUNodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgc2VlZDogbnVtYmVyO1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUJhc2VDaHVuayhzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IEJhc2VDaHVuayB7XG4gIGNvbnN0IGRhdGEgPSBuZXcgVWludDhBcnJheShDSFVOS19WT0xVTUUpO1xuICBjb25zdCBoZWlnaHRzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IHRvcE1hdGVyaWFscyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgY29uc3QgdjIgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMiA/IHRlcnJhaW5WMihzZWVkKSA6IG51bGw7XG5cbiAgLy8gUGFkZGVkIGhlaWdodCBjYWNoZTogYSB0aHJlZS1jZWxsIGJvcmRlciBjb3ZlcnMgc2xvcGUsIGJlYWNoIGFuZCBsZWRnZXMuXG4gIGNvbnN0IFAgPSAzO1xuICBjb25zdCBQVyA9IENIVU5LX1NJWkUgKyBQICogMjtcbiAgY29uc3QgYmFzZUggPSBuZXcgSW50MTZBcnJheShQVyAqIFBXKTtcbiAgY29uc3QgdjJDb2xzOiBWMkNvbHVtbltdIHwgbnVsbCA9IHYyID8gbmV3IEFycmF5KENIVU5LX0FSRUEpIDogbnVsbDtcbiAgZm9yIChsZXQgcHogPSAwOyBweiA8IFBXOyBweisrKSB7XG4gICAgZm9yIChsZXQgcHggPSAwOyBweCA8IFBXOyBweCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgcHggLSBQLCB3eiA9IG96ICsgcHogLSBQO1xuICAgICAgaWYgKHYyKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHYyLmNvbHVtbih3eCwgd3opO1xuICAgICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gY29sLmg7XG4gICAgICAgIGNvbnN0IGx4ID0gcHggLSBQLCBseiA9IHB6IC0gUDtcbiAgICAgICAgaWYgKGx4ID49IDAgJiYgbHogPj0gMCAmJiBseCA8IENIVU5LX1NJWkUgJiYgbHogPCBDSFVOS19TSVpFKSB2MkNvbHMhW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNvbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgd3gsIHd6KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBsZXQgbm9uQWlyID0gMDtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgY29uc3QgbmVhcldhdGVyID1cbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQIC0gMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCArIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxO1xuICAgICAgY29uc3QgdjJDb2wgPSB2MkNvbHMgPyB2MkNvbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIDogbnVsbDtcbiAgICAgIGNvbnN0IHRvcCA9IHYyICYmIHYyQ29sXG4gICAgICAgID8gdjIudG9wTWF0ZXJpYWwod3gsIHd6LCB2MkNvbCwgc2xvcGUsIChoaCwgc3MpID0+IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoaCwgc3MsIG5lYXJXYXRlcikpXG4gICAgICAgIDogdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xuICAgICAgY29uc3Qgc3ViID0gc3Vic29pbEZvcih0b3ApO1xuICAgICAgY29uc3Qgb3JlUG90ZW50aWFsID0gZmJtMih3eCAvIDU1LCB3eiAvIDU1LCBzZWVkICsgMTMwLCAyKSA+IDAuNTc7XG4gICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcblxuICAgICAgY29uc3Qgc3RhcnQgPSBZX01JTjtcbiAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgaCAtIDEpO1xuICAgICAgZm9yIChsZXQgeSA9IHN0YXJ0OyB5IDw9IGVuZDsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGRlcHRoID0gaCAtIDEgLSB5O1xuICAgICAgICBsZXQgbTogTWF0SWQ7XG4gICAgICAgIGlmICh5ID09PSBZX01JTikgbSA9IE1BVC5CRURST0NLO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA9PT0gMCkgbSA9IHRvcDtcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPD0gMikgbSA9IHN1YjtcbiAgICAgICAgZWxzZSBtID0gTUFULlNUT05FO1xuXG4gICAgICAgIGlmIChtID09PSBNQVQuU1RPTkUgJiYgZGVwdGggPiA0ICYmIG9yZVBvdGVudGlhbCAmJiBvcmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5PUkU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTcGFyc2UgM0Qgb3ZlcmhhbmdzL3VuZGVyY3V0cyBhdCBzdGVlcCBmYWNlcy4gVGhpcyBpcyBhIHJlYWxcbiAgICAgICAgLy8gb2NjdXBhbmN5IGNoYW5nZSwgbm90IGEgZGVjb3JhdGlvbiBvbiB0b3Agb2YgYSBoZWlnaHRmaWVsZC5cbiAgICAgICAgaWYgKGRlcHRoIDw9IDIgJiYgc2xvcGUgPj0gMiAmJiBvdmVyaGFuZ0F0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWVwIGNhdmVzLCBrZXB0IGF3YXkgZnJvbSB0aGUgc3VyZmFjZSBzbyB0aGV5IGRvIG5vdCBjcmVhdGUgaG9sZXMuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSICYmIGRlcHRoID4gNyAmJiBkZXB0aCA8IDI0ICYmIGNhdmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0gPSBtO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFdhdGVyIHZvbHVtZTogZXZlcnl0aGluZyBhYm92ZSB0aGUgc29saWQgc3VyZmFjZSB1cCB0byB0aGUgY29sdW1uJ3NcbiAgICAgIC8vIHdhdGVyIGxldmVsIChzZWEgbGV2ZWwgaW4gdjE7IHRoZSBoeWRyb2xvZ2ljYWwgbGV2ZWwgaW4gdjIpLlxuICAgICAgY29uc3Qgd2F0ZXJMZXZlbCA9IHYyQ29sID8gTWF0aC5taW4oWV9NQVgsIHYyQ29sLmxldmVsKSA6IFNFQV9MRVZFTDtcbiAgICAgIGlmIChoIDwgd2F0ZXJMZXZlbCkge1xuICAgICAgICBmb3IgKGxldCB5ID0gTWF0aC5tYXgoWV9NSU4sIGgpOyB5IDwgd2F0ZXJMZXZlbDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KTtcbiAgICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuV0FURVI7XG4gICAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9wU29saWQgPSBNYXRoLm1pbihZX01BWCAtIDEsIE1hdGgubWF4KFlfTUlOLCBoIC0gMSkpO1xuICAgICAgaGVpZ2h0c1tjb2xdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbY29sXSA9IHRvcDtcbiAgICB9XG4gIH1cblxuICAvLyBQcm90cnVkaW5nIGxlZGdlczogb25lIG9yIHR3byBzdG9uZSBibG9ja3MgZXh0ZW5kIGZyb20gYSBoaWdoIGNvbHVtbiBvdmVyXG4gIC8vIGEgbG93ZXIgbmVpZ2hib3VyLiBUaGV5IGNyZWF0ZSByZWFkYWJsZSBvdmVyaGFuZ3Mgd2l0aG91dCBhIGZ1bGwgY2F2ZSBwYXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgaWYgKHNsb3BlIDwgMikgY29udGludWU7XG4gICAgICBjb25zdCBkaXJzOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiA9IFtbLTEsIDBdLCBbMSwgMF0sIFswLCAtMV0sIFswLCAxXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIGRpcnMpIHtcbiAgICAgICAgY29uc3QgbnggPSBseCArIGR4LCBueiA9IGx6ICsgZHo7XG4gICAgICAgIGlmIChueCA8IDAgfHwgbnogPCAwIHx8IG54ID49IENIVU5LX1NJWkUgfHwgbnogPj0gQ0hVTktfU0laRSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IG5oID0gYmFzZUhbKG56ICsgUCkgKiBQVyArIChueCArIFApXTtcbiAgICAgICAgaWYgKGggLSBuaCA8IDIpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoaGFzaDNpKGx4LCBseiwgZHggKiAzICsgZHogKiA3LCBzZWVkICsgMTUwKSA8IDAuNTUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB5ID0gaCAtIDI7XG4gICAgICAgIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBoKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChueCwgeVRvSW5kZXgoeSksIG56KTtcbiAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5TVE9ORTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJlY29tcHV0ZSB0aGUgY29sdW1uIGNhY2hlIGFmdGVyIGxlZGdlcy9jYXZlcy4gVGhlIGV4cG9zZWQgdG9wIG1hdGVyaWFsXG4gIC8vIG11c3QgY29tZSBmcm9tIHRoZSBhY3R1YWwgdG9wIHNvbGlkIHZveGVsLCBub3QgdGhlIHByZS1jYXJ2ZSBndWVzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICBsZXQgdG9wTWF0OiBudW1iZXIgPSB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICAgICAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgICAgIGNvbnN0IG0gPSBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildO1xuICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICB9XG4gICAgICBoZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRvcE1hdDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBjeCwgY3osIHNlZWQsIHZlcnNpb24sIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyIH07XG59XG5cbi8qKlxuICogSW5zdGFsbCBiYXNlIGNvbnRlbnRzIGFzIGEgcmVzaWRlbnQgY2h1bms6IGFwcGx5IGR1cmFibGUgZWRpdHMsIHVwZGF0ZVxuICogc3RhdHMsIGFuZCBydW4gZGV0ZXJtaW5pc3RpYyBlbnRpdHkgZ2VuZXJhdGlvbi4gTWFpbi10aHJlYWQgb25seTsgdGhpcyBpc1xuICogdGhlIHNpbmdsZSB3cml0ZXIgb2YgV29ybGQuIFJldHVybnMgdGhlIGFscmVhZHktcmVzaWRlbnQgY2h1bmsgaWYgb25lIGV4aXN0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbGxCYXNlQ2h1bmsod29ybGQ6IFdvcmxkLCBiYXNlOiBCYXNlQ2h1bmssIGdlbmVyYXRpb25NcyA9IDApOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChiYXNlLnNlZWQgIT09IHdvcmxkLnNlZWQgfHwgYmFzZS52ZXJzaW9uICE9PSB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbikge1xuICAgIHRocm93IG5ldyBFcnJvcignYmFzZSBjaHVuayBiZWxvbmdzIHRvIGEgZGlmZmVyZW50IHdvcmxkIGNvbmZpZ3VyYXRpb24nKTtcbiAgfVxuICBjb25zdCB7IGN4LCBjeiwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIgfSA9IGJhc2U7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIGNvbnN0IGNodW5rOiBWb3hlbENodW5rID0ge1xuICAgIGN4LCBjeiwga2V5LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpcixcbiAgICBkaXJ0eTogdHJ1ZSxcbiAgICBnZW5lcmF0ZWRBdDogcGVyZm9ybWFuY2Uubm93KCksXG4gIH07XG5cbiAgLy8gQXBwbHkgZHVyYWJsZSBlZGl0cyBhZnRlciBiYXNlIGdlbmVyYXRpb24uXG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIGlmIChlZGl0cykge1xuICAgIGZvciAoY29uc3QgW2lkeCwgbV0gb2YgZWRpdHMpIHtcbiAgICAgIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gICAgfVxuICAgIC8vIFJlY29tcHV0ZSB0aGUgY2FjaGUgZm9yIGVkaXRlZCBjaHVua3MuXG4gICAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgbHgsIGx6KTtcbiAgICB9XG4gIH1cbiAgLy8gTm9uLWFpciBjb3VudHMgYXJlIGRlcml2ZWQgcmVuZGVyZXIgc3RhdGlzdGljcywgbm90IGR1cmFibGUgd29ybGQgc3RhdGUuXG4gIC8vIEVkaXRlZCBiYXNlIGFpciBtYXkgYmVjb21lIHNvbGlkIChhbmQgdmljZSB2ZXJzYSkgZHVyaW5nIHJlc3RvcmF0aW9uLlxuICBsZXQgZWRpdGVkTm9uQWlyID0gMDtcbiAgZm9yIChjb25zdCBtYXRlcmlhbCBvZiBjaHVuay5kYXRhKSBpZiAobWF0ZXJpYWwgIT09IE1BVC5BSVIpIGVkaXRlZE5vbkFpcisrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gZWRpdGVkTm9uQWlyIC0gbm9uQWlyO1xuXG4gIHdvcmxkLmNodW5rcy5zZXQoa2V5LCBjaHVuayk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCsrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gbm9uQWlyO1xuICB3b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgKz0gZ2VuZXJhdGlvbk1zO1xuICB3b3JsZC5kaXJ0eS5hZGQoa2V5KTtcblxuICBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkLCBjaHVuayk7XG4gIHJldHVybiBjaHVuaztcbn1cblxuLyoqIEEgYmFzZS10ZXJyYWluIGNhY2hlIHNoYXJlZCBieSBlZGl0ZWQgYW5kIHVuZWRpdGVkIHJlZ2VuZXJhdGlvbi4gTmF0dXJhbFxuICogc2NlbmVyeSBuZXZlciBkZXBlbmRzIG9uIGxhdGVyIHZveGVsIGVkaXRzOyB0aGlzIGFsc28gbGV0cyBhIHNuYXBzaG90IHJlc3RvcmVcbiAqIGEgaGFydmVzdGVkIGNodW5rIHdpdGhvdXQgbWF0ZXJpYWxpemluZyB1bnJlbGF0ZWQgbmVpZ2hib3VyaW5nIGNodW5rcy4gKi9cbmNvbnN0IGJhc2VDb2x1bW5DYWNoZSA9IG5ldyBXZWFrTWFwPFdvcmxkLCBNYXA8c3RyaW5nLCB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheSB9Pj4oKTtcblxuZXhwb3J0IGludGVyZmFjZSBCYXNlQ29sdW1ucyB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheTsgfVxuXG4vKiogQmFzZSAocHJlLWNhcnZlLCBwcmUtZWRpdCkgY29sdW1uIGhlaWdodHMvbWF0ZXJpYWxzIHVzZWQgZm9yIGVudGl0eSBwbGFjZW1lbnQuIFB1cmUuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZUJhc2VDb2x1bW5zKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQmFzZUNvbHVtbnMge1xuICBjb25zdCBjb2x1bW5zID0geyBoZWlnaHRzOiBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKSwgdG9wTWF0ZXJpYWxzOiBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKSB9O1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4LCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6KTtcbiAgICAgIGNvbnN0IHNsb3BlID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyB2ZXJzaW9uZWRTbG9wZShzZWVkLCB2ZXJzaW9uLCB4LCB6LCBoKSA6IHNsb3BlQXQoc2VlZCwgeCwgeiwgaCk7XG4gICAgICBjb25zdCBpbmRleCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5oZWlnaHRzW2luZGV4XSA9IGNsYW1wKGggLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICBjb2x1bW5zLnRvcE1hdGVyaWFsc1tpbmRleF0gPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IGJhc2VUb3BNYXRlcmlhbEZvcihzZWVkLCB2ZXJzaW9uLCB4LCB6LCBoLCBzbG9wZSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8qKiBQcm92aWRlIHByZWNvbXB1dGVkIGJhc2UgY29sdW1ucyAoZm9yIGV4YW1wbGUgZnJvbSBhIHdvcmtlcikgYmVmb3JlIGluc3RhbGxpbmcgYSBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWVkQmFzZUNvbHVtbnMod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZywgY29sdW1uczogQmFzZUNvbHVtbnMpOiB2b2lkIHtcbiAgbGV0IGNhY2hlID0gYmFzZUNvbHVtbkNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGUpIHsgY2FjaGUgPSBuZXcgTWFwKCk7IGJhc2VDb2x1bW5DYWNoZS5zZXQod29ybGQsIGNhY2hlKTsgfVxuICBpZiAoIWNhY2hlLmhhcyhrZXkpKSBjYWNoZS5zZXQoa2V5LCBjb2x1bW5zKTtcbn1cblxuZnVuY3Rpb24gYmFzZUNvbHVtbnMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IEJhc2VDb2x1bW5zIHtcbiAgbGV0IGNhY2hlID0gYmFzZUNvbHVtbkNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGUpIHsgY2FjaGUgPSBuZXcgTWFwKCk7IGJhc2VDb2x1bW5DYWNoZS5zZXQod29ybGQsIGNhY2hlKTsgfVxuICBjb25zdCBjYWNoZWQgPSBjYWNoZS5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGNhY2hlZDtcbiAgY29uc3QgY29sdW1ucyA9IGNvbXB1dGVCYXNlQ29sdW1ucyh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbiAgY2FjaGUuc2V0KGNodW5rLmtleSwgY29sdW1ucyk7XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG4vLyAtLS0tLS0tLS0tIGRlcml2ZWQgY2hhbmdlIHRyYWNraW5nIChub3QgYXV0aG9yaXRhdGl2ZSBzdGF0ZSkgLS0tLS0tLS0tLVxuLy8gUmVuZGVyZXJzIG5lZWQgdG8ga25vdyB3aGVuIHRoZSBlZGl0IG92ZXJsYXkgY2hhbmdlZCB3aXRob3V0IHdhbGtpbmcgZXZlcnlcbi8vIGVkaXQgZWFjaCBmcmFtZS4gVGhlIGNvdW50ZXIgbGl2ZXMgb3V0c2lkZSBXb3JsZCBzbyBpdCBuZXZlciBlbnRlcnMgYVxuLy8gc25hcHNob3Qgb3IgY2Fub25pY2FsIGhhc2guXG5jb25zdCBlZGl0VmVyc2lvbnMgPSBuZXcgV2Vha01hcDxXb3JsZCwgbnVtYmVyPigpO1xuXG4vKiogTW9ub3RvbmljIGNvdW50IG9mIGVkaXQtb3ZlcmxheSBjaGFuZ2VzIGZvciB0aGlzIFdvcmxkIG9iamVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0VmVyc2lvbih3b3JsZDogV29ybGQpOiBudW1iZXIge1xuICByZXR1cm4gZWRpdFZlcnNpb25zLmdldCh3b3JsZCkgPz8gMDtcbn1cblxuLyoqIENhbGwgYWZ0ZXIgcmVwbGFjaW5nIG9yIGJ1bGstY2hhbmdpbmcgYHdvcmxkLmVkaXRzYCBvdXRzaWRlIHNldFZveGVsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtFZGl0c0NoYW5nZWQod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGVkaXRWZXJzaW9ucy5zZXQod29ybGQsIGVkaXRWZXJzaW9uKHdvcmxkKSArIDEpO1xufVxuXG4vLyAtLS0tLS0tLS0tIG5vbi1nZW5lcmF0aW5nIHF1ZXJpZXMgLS0tLS0tLS0tLVxuLy8gTW92aW5nIHByZXNlbnRhdGlvbiAoY2hhcmFjdGVycywgYW5pbWFscywgY2FtZXJhKSBtdXN0IG5ldmVyIHRyaWdnZXIgY2h1bmtcbi8vIGdlbmVyYXRpb24gYXMgYSBzaWRlIGVmZmVjdCBvZiBhc2tpbmcgYWJvdXQgdGVycmFpbi4gVGhlc2UgcmV0dXJuIG51bGwgd2hlblxuLy8gdGhlIGNvbHVtbidzIGNodW5rIGlzIG5vdCByZXNpZGVudC5cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Q2h1bmtBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHdvcmxkLmNodW5rcy5nZXQoY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSkpID8/IG51bGw7XG59XG5cbi8qKiBMaWtlIHN1cmZhY2VBdCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHwgbnVsbCB7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbi8qKiBMaWtlIGdldFZveGVsLCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Vm94ZWxBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB8IG51bGwge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXZpY3RDaHVuayh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghd29ybGQuY2h1bmtzLmhhcyhrZXkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmNodW5rcy5kZWxldGUoa2V5KTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzRXZpY3RlZCsrO1xuICAvLyBDaHVuayBieXRlcyBhbmQgY29sdW1uIGNhY2hlcyBhcmUgcmVnZW5lcmF0ZWQgb24gZGVtYW5kLiBFbnRpdGllcyByZW1haW5cbiAgLy8gYXV0aG9yaXRhdGl2ZTogZXZpY3Rpb24gbXVzdCBub3QgZm9yZ2V0IHRoZWlyIHBlcnNpc3RlbnQgc3RhdGUuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyAtLS0tLS0tLS0tIHF1ZXJpZXMgLyBlZGl0cyAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZ2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBtOiBNYXRJZCk6IGJvb2xlYW4ge1xuICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gWV9NQVgpIHJldHVybiBmYWxzZTtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgaWR4ID0gbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIGNvbnN0IHByZXZpb3VzRWRpdCA9IHdvcmxkLmVkaXRzLmdldChjaHVua0tleShjeCwgY3opKT8uZ2V0KGlkeCk7XG4gIC8vIEEgY2h1bmsgZXZpY3RlZCBhZnRlciBhbiBlYXJsaWVyIGVkaXQgY2FuIHJlZ2VuZXJhdGUgd2l0aCB0aGF0IGR1cmFibGVcbiAgLy8gbWF0ZXJpYWwgYWxyZWFkeSBhcHBsaWVkLiBEcm9wcGluZyB0aGUgZWRpdCBoZXJlIHdvdWxkIG1ha2UgaXQgZGlzYXBwZWFyXG4gIC8vIG9uIHRoZSBuZXh0IGV2aWN0aW9uL3Jlc3RvcmF0aW9uLCBldmVuIHRob3VnaCB0aGUgY3VycmVudCB3cml0ZSBuby1vcHMuXG4gIGlmIChwcmV2aW91c0VkaXQgPT09IG0pIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIGZhbHNlO1xuICBsZXQgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKCFlZGl0cykgeyBlZGl0cyA9IG5ldyBNYXAoKTsgd29ybGQuZWRpdHMuc2V0KGNodW5rLmtleSwgZWRpdHMpOyB9XG4gIC8vIEFuIGlkZW1wb3RlbnQgd3JpdGUgbXVzdCBzdGlsbCByZXN0b3JlIGEgZHVyYWJsZSBkZWx0YSBkaXNjYXJkZWQgYnkgYW5cbiAgLy8gb2xkZXIgc25hcHNob3Qgb3IgZGVsdGEgZGVjb2Rlci4gSXQgaXMgbm90IGEgbmV3IGF1dGhvcml0YXRpdmUgcmV2aXNpb24uXG4gIGlmIChjaHVuay5kYXRhW2lkeF0gPT09IG0pIHtcbiAgICBpZiAoIWVkaXRzLmhhcyhpZHgpKSBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgZWRpdHMuc2V0KGlkeCwgbSk7XG4gIG1hcmtFZGl0c0NoYW5nZWQod29ybGQpO1xuICBjaHVuay5kaXJ0eSA9IHRydWU7XG4gIHdvcmxkLmRpcnR5LmFkZChjaHVuay5rZXkpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgd29ybGRUb0xvY2FsWCh4KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDb2x1bW5DYWNoZShjaHVuazogVm94ZWxDaHVuaywgbHg6IG51bWJlciwgbHo6IG51bWJlcik6IHZvaWQge1xuICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgaWYgKGlzU29saWQoY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSkpIHsgdG9wU29saWQgPSB5OyBicmVhazsgfVxuICB9XG4gIGNodW5rLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gIGNvbnN0IHRtID0gY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgaWYgKHRvcFNvbGlkID49IFlfTUlOKSB7XG4gICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgodG9wU29saWQpLCBseildO1xuICAgIGlmIChtICE9PSBNQVQuV0FURVIpIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBtO1xuICB9IGVsc2Uge1xuICAgIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0bTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSB5IGNvb3JkaW5hdGUgb2YgdGhlIGV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbiBhdCB4L3ouXG4gKiBBIHNvbGlkIHZveGVsIGF0IHkgb2NjdXBpZXMgW3ksIHkrMSksIHNvIHRoZSB3YWxrYWJsZSBzdXJmYWNlIGlzIHRvcFNvbGlkKzEuXG4gKiBUaGlzIGlzIGEgZGVyaXZlZCBxdWVyeTsgdGhlIGF1dGhvcml0YXRpdmUgc3RhdGUgcmVtYWlucyB0aGUgdm94ZWwgdm9sdW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gWV9NSU47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gWV9NSU47XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLnRvcE1hdGVyaWFsc1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAod29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24gPCBHRU5FUkFUT1JfVjIpIHtcbiAgICBjb25zdCBoID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCAtIGggOiAwO1xuICB9XG4gIHJldHVybiB3YXRlclN1cmZhY2VBdCh3b3JsZCwgeCwgeikgLSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG4vKipcbiAqIFRvcCBvZiB0aGUgd2F0ZXIgY29sdW1uIHN0YW5kaW5nIG9uIHRoZSBzb2xpZCBzdXJmYWNlIChlcXVhbCB0byB0aGUgc3VyZmFjZVxuICogd2hlbiBkcnkpLiBSZWFkcyB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbHMsIHNvIGVkaXRzIGFuZCBkdWcgcGl0cyBhcmUgZXhhY3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRlclN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICB3aGlsZSAoeSA8IFlfTUFYICYmIGdldFZveGVsKHdvcmxkLCB4LCB5LCB6KSA9PT0gTUFULldBVEVSKSB5Kys7XG4gIHJldHVybiB5O1xufVxuXG4vLyAtLS0tLS0tLS0tIGVudGl0aWVzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGFkZEVudGl0eSh3b3JsZDogV29ybGQsIGU6IEVudGl0eSk6IHZvaWQge1xuICBpZiAod29ybGQuZW50aXRpZXMuaGFzKGUuaWQpIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSByZXR1cm47XG4gIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBlKTtcbiAgbGV0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIGxpc3QpOyB9XG4gIGxpc3QucHVzaChlLmlkKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICAvLyBHZW5lcmF0aW9uIGlzIGRldGVybWluaXN0aWMgYW5kIGFkdmFuY2VzIG5vIHBsYXllci1jb21tYW5kIHByZWNvbmRpdGlvbi5cbiAgLy8gQXV0aG9yZWQgc2NhZmZvbGRpbmcgbWF5IHRyYW5zaWVudGx5IGNoYW5nZSBpdDsgdGhlIHNuYXBzaG90IHJlc3RvcmVzIHRoZVxuICAvLyBzYXZlZCByZXZpc2lvbiBhZnRlciBwbGFjaW5nIHRoYXQgc2NhZmZvbGRpbmcuXG59XG5cbi8qKlxuICogUmVtb3ZlIGFuIGVudGl0eSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHdvcmxkLiBVc2VkIHdoZW4gYSBzaXRlIGlzIGNsZWFyZWQ6XG4gKiB0aGUgcmVzb3VyY2UgeWllbGQgaXMgYWNjb3VudGVkIGZvciBieSB0aGUgY2FsbGVyLCBhbmQgdGhlIGVudGl0eSBtdXN0IHN0b3BcbiAqIGV4aXN0aW5nIGZvciBjb2xsaXNpb24sIG9ic3RydWN0aW9uIGFuZCBwZXJzaXN0ZW5jZSwgbm90IGp1c3QgYmUgaGlkZGVuIGJ5XG4gKiB0aGUgcmVuZGVyZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgY29uc3QgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmIChsaXN0KSB7XG4gICAgY29uc3QgaSA9IGxpc3QuaW5kZXhPZihpZCk7XG4gICAgaWYgKGkgPj0gMCkgbGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoaWQpO1xuICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlJZChjaHVuazogc3RyaW5nLCBpOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gYGU6JHtjaHVua306JHtpfWA7XG59XG5cbmZ1bmN0aW9uIGZvcmVzdFNjb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGVhc3QgPSBNYXRoLmV4cCgtKCgod3ggLSAyMjApIC8gMjYwKSAqKiAyICsgKCh3eiArIDExMCkgLyAyMjApICoqIDIpKTtcbiAgY29uc3Qgbm9ydGggPSBNYXRoLmV4cCgtKCgod3ggLSAyMCkgLyAzMDApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDE5MCkgKiogMikpO1xuICBjb25zdCB3ZXN0ID0gTWF0aC5leHAoLSgoKHd4ICsgMzQwKSAvIDIwMCkgKiogMiArICgod3ogLSAxMjApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IHNvdXRoID0gTWF0aC5leHAoLSgoKHd4IC0gMTIwKSAvIDI0MCkgKiogMiArICgod3ogLSAzMzApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IG1vaXN0dXJlID0gZmJtMih3eCAvIDI2MCwgd3ogLyAyNjAsIHNlZWQgKyAyMDEsIDQpO1xuICBjb25zdCB2YWxsZXkgPSBNYXRoLmV4cCgtKCh3eCAvIDE0MCkgKiogMiArICh3eiAvIDEwNSkgKiogMikpO1xuICByZXR1cm4gTWF0aC5tYXgoZWFzdCwgbm9ydGggKiAwLjkyLCB3ZXN0ICogMC44MCwgc291dGggKiAwLjc4KSAqIDAuODJcbiAgICArIG1vaXN0dXJlICogMC4zOCAtIDAuMjIgLSB2YWxsZXkgKiAwLjM0O1xufVxuXG5mdW5jdGlvbiByb2NrU2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgbW91bnRhaW4gPSBmYm0yKHd4IC8gMzMwLCB3eiAvIDMzMCwgc2VlZCArIDIwMiwgMyk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMTQwLCB3eiAvIDE0MCwgc2VlZCArIDIwMywgMykgLSAxKTtcbiAgcmV0dXJuIG1vdW50YWluICogMC41NSArIHJpZGdlICogMC40NTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdGllcyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogdm9pZCB7XG4gIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQsIGNodW5rLmN4LCBjaHVuay5jeik7XG59XG5cbi8qKiBAaW50ZXJuYWwgUmVwbGF5cyBkZXRlcm1pbmlzdGljIGdlbmVyYXRpb24gZm9yIHNuYXBzaG90IGVudGl0eSBkZWx0YXMuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgaWYgKHdvcmxkLmVudGl0eUNodW5rcy5oYXMoa2V5KSkgcmV0dXJuO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm47XG5cbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoaGFzaDJpKGNodW5rLmN4LCBjaHVuay5jeiwgd29ybGQuc2VlZCArIDkwMCkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBjb2x1bW5zID0gYmFzZUNvbHVtbnMod29ybGQsIGNodW5rKTtcbiAgbGV0IG4gPSAwO1xuICBsZXQgbmF0dXJhbFRyZWVzID0gMDtcbiAgbGV0IG5hdHVyYWxQaW5rVHJlZXMgPSAwO1xuXG4gIGNvbnN0IGxvY2FsU3VyZmFjZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSArIFlfTUlOO1xuICB9O1xuICBjb25zdCBsb2NhbFRvcCA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogTWF0SWQgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gYXMgTWF0SWQ7XG4gIH07XG4gIGNvbnN0IGxvY2FsU2xvcGUgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgIHJldHVybiBNYXRoLm1heChcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggLSAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogLSAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgKTtcbiAgfTtcblxuICAvLyBBIGppdHRlcmVkIDggbSBsYXR0aWNlIGdpdmVzIGNvaGVyZW50IG1hc3NlcyBhbmQgYXZvaWRzIHBlci1mcmFtZSBzY2F0dGVyLlxuICBmb3IgKGxldCBneiA9IDA7IGd6IDwgQ0hVTktfU0laRTsgZ3ogKz0gOCkge1xuICAgIGZvciAobGV0IGd4ID0gMDsgZ3ggPCBDSFVOS19TSVpFOyBneCArPSA4KSB7XG4gICAgICBjb25zdCBseCA9IGNsYW1wKE1hdGguZmxvb3IoZ3ggKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCBseiA9IGNsYW1wKE1hdGguZmxvb3IoZ3ogKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICAgIGlmIChoIDw9IFNFQV9MRVZFTCArIDEpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgc2xvcGUgPSBsb2NhbFNsb3BlKGx4LCBseik7XG4gICAgICBjb25zdCB0b3AgPSBsb2NhbFRvcChseCwgbHopO1xuICAgICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGZvcmVzdCA9IGZvcmVzdFNjb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2NreSA9IHJvY2tTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9sbCA9IHJuZCgpO1xuXG4gICAgICBjb25zdCB0cmVlQ2hhbmNlID0gZm9yZXN0ID4gMC41MCA/IDAuNzIgOiBmb3Jlc3QgPiAwLjMwID8gMC4yNSA6IDAuMDU7XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMiAmJiByb2xsIDwgdHJlZUNoYW5jZSkge1xuICAgICAgICAvLyBUaGUgY2FwIGlzIGEgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWdlbmVyYXRpb24gcHJvcGVydHkuIEl0IGNhbm5vdFxuICAgICAgICAvLyBkZXBlbmQgb24gd2hpY2ggY2h1bmtzIGEgcmVuZGVyZXIgbG9hZGVkIGJlZm9yZSB0aGlzIG9uZS5cbiAgICAgICAgbGV0IGtpbmQ6IEVudGl0eUtpbmQ7XG4gICAgICAgIGxldCB2YXJpYW50OiBudW1iZXI7XG4gICAgICAgIGNvbnN0IHNwZWNpZXNSb2xsID0gcm5kKCk7XG4gICAgICAgIGlmIChzcGVjaWVzUm9sbCA8IDAuMTIpIHtcbiAgICAgICAgICBpZiAoKG5hdHVyYWxQaW5rVHJlZXMgKyAxKSA+IDAuMjUgKiAobmF0dXJhbFRyZWVzICsgMSkpIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtPdmVyZmxvdysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9ibG9zc29tJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMik7XG4gICAgICAgICAgICBuYXR1cmFsUGlua1RyZWVzKys7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjQwKSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfc3BpcmUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjc0KSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfdGFibGUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgfVxuICAgICAgICBuYXR1cmFsVHJlZXMrKztcbiAgICAgICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuODggKyBybmQoKSAqIDAuMjQsIHZhcmlhbnQsXG4gICAgICAgICAgcmVzb3VyY2U6ICd3b29kJywgcmVtYWluaW5nOiAxMiwgeWllbGRQZXJIYXJ2ZXN0OiA0LFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiByb2NreSA+IDAuNDYgJiYgcm9sbCA8IDAuMzgpIHtcbiAgICAgICAgLy8gQ29uc3VtZSB0aGUgcmV0aXJlZCBzdG9uZSBmb3JtJ3MgcmFuZG9tIGRyYXdzIGFuZCBhbGxvY2F0ZSBpdHMgb2xkXG4gICAgICAgIC8vIHNlcXVlbmNlIElELCBidXQgZG8gbm90IGluc2VydCBhbiBlbnRpdHkuIExhdGVyIG5hdHVyYWwgcGxhY2VtZW50c1xuICAgICAgICAvLyB0aGVyZWZvcmUgcmVtYWluIGJ5dGUtZm9yLWJ5dGUgY29tcGF0aWJsZSB3aXRoIHJlY29yZGVkIHNhdmVzLlxuICAgICAgICBjb25zdCBzaXplUm9sbCA9IHJuZCgpO1xuICAgICAgICBjb25zdCBraW5kOiBFbnRpdHlLaW5kID0gc2l6ZVJvbGwgPCAwLjU1ID8gJ3N0eWxfcm9ja19zbWFsbCdcbiAgICAgICAgICA6IHNpemVSb2xsIDwgMC45MCA/ICdzdHlsX3JvY2tfbWVkaXVtJyA6ICdzdHlsX3JvY2tfbGFyZ2UnO1xuICAgICAgICBjb25zdCBpZCA9IGVudGl0eUlkKGNodW5rLmtleSwgbisrKTtcbiAgICAgICAgY29uc3QgcmVjb3JkID0ge1xuICAgICAgICAgIGlkLCBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcmVzb3VyY2U6ICdzdG9uZScgYXMgY29uc3QsXG4gICAgICAgICAgcmVtYWluaW5nOiBraW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDQgOiBraW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyA4IDogMTIsXG4gICAgICAgICAgeWllbGRQZXJIYXJ2ZXN0OiAzLCBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICB9O1xuICAgICAgICAvLyBPbmx5IGVudGl0aWVzIHRoYXQgZXhpc3RlZCBpbiBhbiBhY2NlcHRlZCBvbGQgc2F2ZSBnZXQgdG9tYnN0b25lcyxcbiAgICAgICAgLy8gZHVyaW5nIGV4cGxpY2l0IG1pZ3JhdGlvbi4gT3JkaW5hcnkgZ2VuZXJhdGlvbiBtdXN0IHJlc3RvcmUgZXhhY3RseS5cbiAgICAgICAgaWYgKGlzU3RvbmVSZXBsYXkod29ybGQpKSBhZGRFbnRpdHkod29ybGQsIHJlY29yZCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULlNUT05FICYmIHJvY2t5ID4gMC41OCAmJiByb2xsIDwgMC4xOCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX29yZScsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAyKSxcbiAgICAgICAgICByZXNvdXJjZTogJ29yZScsIHJlbWFpbmluZzogOCwgeWllbGRQZXJIYXJ2ZXN0OiAyLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAxICYmIHJvbGwgPCAwLjMwKSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfc2hydWInLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOCArIHJuZCgpICogMC40LCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgICAgcmVzb3VyY2U6ICdmaWJlcicsIHJlbWFpbmluZzogNCwgeWllbGRQZXJIYXJ2ZXN0OiAxLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRBdXRob3JlZEVudGl0eSh3b3JsZDogV29ybGQsIGtpbmQ6IEVudGl0eUtpbmQsIHg6IG51bWJlciwgejogbnVtYmVyLCB2YXJpYW50OiBudW1iZXIsIHJvdDogbnVtYmVyLCBzY2FsZTogbnVtYmVyLCByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbCwgcmVtYWluaW5nOiBudW1iZXIsIHlpZWxkUGVySGFydmVzdDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoeSA8PSBTRUFfTEVWRUwpIHJldHVybjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIC8vIEEgaGVybyBhc3NldCBvd25zIGl0cyBzcG90OiBjbGVhciBhbnkgZ2VuZXJhdGVkIGVudGl0eSB0aGF0IHdvdWxkIG92ZXJsYXBcbiAgLy8gaXQsIHJhdGhlciB0aGFuIHNpbGVudGx5IGRyb3BwaW5nIHRoZSBhdXRob3JlZCBjb21wb3NpdGlvbi5cbiAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdO1xuICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgcmV0dXJuO1xuICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmIChlICYmIE1hdGguaHlwb3QoZS54IC0geCwgZS56IC0geikgPCAyLjYpIHtcbiAgICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gICAgICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gICAgICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgICB9XG4gIH1cbiAgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSk7XG4gIC8vIEF1dGhvcmVkIGNvbXBvc2l0aW9uIGlzIGR1cmFibGUgc3RhdGU6IGl0IGNhbiBjbGVhciBvdmVybGFwcGluZyBuYXR1cmFsXG4gIC8vIGVudGl0aWVzLCBzbyBzYXZlIHRoZSBjb21wbGV0ZSBhZmZlY3RlZCBjaHVuayByYXRoZXIgdGhhbiBvbmx5IGl0cyBoZXJvZXMuXG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG5cbiAgY29uc3QgaWQgPSBgaGVybzoke2tpbmR9OiR7TWF0aC5yb3VuZCh4KX06JHtNYXRoLnJvdW5kKHopfWA7XG4gIGNvbnN0IGJlZm9yZSA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGNvbnN0IGVudGl0eTogRW50aXR5ID0ge1xuICAgIGlkLCBraW5kLCBjaHVuazoga2V5LCB4OiB4ICsgMC41LCB5LCB6OiB6ICsgMC41LFxuICAgIHJvdCwgc2NhbGUsIHZhcmlhbnQsIHJlc291cmNlLCByZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdCxcbiAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IHRydWUsXG4gIH07XG4gIGFkZEVudGl0eSh3b3JsZCwgZW50aXR5KTtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLnNpemUgPiBiZWZvcmUgJiYga2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkge1xuICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkgcmV0dXJuO1xuICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG5cbiAgY29uc3Qgc2l0ZXM6IEFycmF5PHsga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcm90OiBudW1iZXIgfT4gPSBbXG4gICAgeyBraW5kOiAnd2F5c3RvbmUnLCB4OiAtMTAsIHo6IC0xNCwgcm90OiAwIH0sXG4gICAgeyBraW5kOiAnbWFya2VyJywgeDogLTMyLCB6OiAtOCwgcm90OiBNYXRoLlBJIC8gMiB9LFxuICBdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc2l0ZXMpIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKHkgPD0gU0VBX0xFVkVMKSBjb250aW51ZTtcbiAgICB3b3JsZC5zaXRlcy5wdXNoKHtcbiAgICAgIGlkOiBgc2l0ZToke3Mua2luZH1gLFxuICAgICAga2luZDogcy5raW5kLFxuICAgICAgeDogcy54ICsgMC41LCB5LCB6OiBzLnogKyAwLjUsXG4gICAgICByb3Q6IHMucm90LFxuICAgICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gICAgfSk7XG4gIH1cblxuICAvLyBBIGhlcm8gZ3JvdmUgY29tcG9zZWQgaW4gdGhlIGRlZmF1bHQgY2FtZXJhJ3MgdmlldyBkaXJlY3Rpb24uIFRoZXNlIGFyZVxuICAvLyBTdHlsIG5hdHVyYWwgYXNzZXRzIChBUy0wMDEgdjIpLCBub3QgTm94ZWwgYXJjaGl0ZWN0dXJlOyB0aGUgTm94ZWxcbiAgLy8gd2F5c3RvbmUvbWFya2VyIGFib3ZlIHJlbWFpbiB0aGUgaHVtYW4tbWFkZSBsYW5kbWFya3MuXG4gIGNvbnN0IGdyb3ZlOiBBcnJheTxbRW50aXR5S2luZCwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdPiA9IFtcbiAgICBbJ3N0eWxfdHJlZV9zcGlyZScsIC0yMiwgLTI2LCAwLCAxLjAwLCAwXSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC0zNCwgLTE4LCAxLCAwLjk1LCBNYXRoLlBJIC8gMTJdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTYsIC0zNCwgMiwgMS4wMCwgTWF0aC5QSSAvIDZdLFxuICAgIFsnc3R5bF90cmVlX2Jsb3Nzb20nLCAtMjgsIC0zOCwgMCwgMC45MCwgTWF0aC5QSSAvIDRdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTQwLCAtMzAsIDIsIDEuMDUsIE1hdGguUEkgLyAzXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTEyLCAtMjQsIDAsIDAuOTAsIE1hdGguUEkgLyAyLjRdLFxuICBdO1xuICBmb3IgKGNvbnN0IFtraW5kLCB4LCB6LCB2YXJpYW50LCBzY2FsZSwgcm90XSBvZiBncm92ZSkge1xuICAgIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCBraW5kLCB4LCB6LCB2YXJpYW50LCByb3QsIHNjYWxlLCAnd29vZCcsIDEyLCA0KTtcbiAgfVxuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfcm9ja19tZWRpdW0nLCAtNiwgLTEwLCAwLCAwLCAxLjAsICdzdG9uZScsIDgsIDMpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfc2hydWInLCAtMTQsIC04LCAxLCBNYXRoLlBJIC8gMTIsIDEuMSwgJ2ZpYmVyJywgNCwgMSk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9jYWlybicsIC0yMCwgLTYsIDAsIDAsIDEuMCwgJ3N0b25lJywgNiwgMik7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9vcmUnLCAtMzgsIC00MiwgMCwgTWF0aC5QSSAvIDQsIDEuMSwgJ29yZScsIDgsIDIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbmVhcmVzdEhhcnZlc3RhYmxlKFxuICB3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCByYWRpdXM6IG51bWJlciwgcmVzb3VyY2U/OiBSZXNvdXJjZVR5cGUsXG4pOiBFbnRpdHkgfCBudWxsIHtcbiAgbGV0IGJlc3Q6IEVudGl0eSB8IG51bGwgPSBudWxsO1xuICBsZXQgYmVzdEQgPSByYWRpdXMgKiByYWRpdXM7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZClcbiAgICAgIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIGNvbnRpbnVlO1xuICAgIGlmIChyZXNvdXJjZSAmJiBlLnJlc291cmNlICE9PSByZXNvdXJjZSkgY29udGludWU7XG4gICAgY29uc3QgZCA9IChlLnggLSB4KSAqKiAyICsgKGUueiAtIHopICoqIDI7XG4gICAgaWYgKGQgPCBiZXN0RCkgeyBiZXN0RCA9IGQ7IGJlc3QgPSBlOyB9XG4gIH1cbiAgcmV0dXJuIGJlc3Q7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdFJlc3VsdCB7IGVudGl0eTogRW50aXR5OyByZXNvdXJjZTogUmVzb3VyY2VUeXBlOyBhbW91bnQ6IG51bWJlcjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBIYXJ2ZXN0UmVzdWx0IHwgbnVsbCB7XG4gIGNvbnN0IGUgPSBsaXZlRW50aXR5KHdvcmxkLCBpZCk7XG4gIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgYW1vdW50ID0gTWF0aC5taW4oZS55aWVsZFBlckhhcnZlc3QsIGUucmVtYWluaW5nKTtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIGFtb3VudCA+IDEyMCkgcmV0dXJuIG51bGw7XG4gIGUucmVtYWluaW5nIC09IGFtb3VudDtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgZS5oYXJ2ZXN0ZWRPbmNlID0gdHJ1ZTtcbiAgaWYgKGUucmVtYWluaW5nIDw9IDApIGUuaGFydmVzdGVkID0gdHJ1ZTtcbiAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgZW50aXR5OiBlLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbi8qKiBSZW1vdmUgZXZlcnkgcmV0aXJlZCBzb3VyY2UgYWZ0ZXIgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkuIFRoaXMgbWlncmF0aW9uXG4gKiBjcmVhdGVzIGRldGVybWluaXN0aWMgdG9tYnN0b25lcyBidXQgaXMgbm90IGEgcGxheWVyIGNvbW1hbmQgb3IgcmV2aXNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmV0aXJlU3RvbmVFbnRpdGllcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBlIG9mIFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0pIHtcbiAgICBpZiAoIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKSBjb250aW51ZTtcbiAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoZS5pZCk7XG4gICAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoZS5pZCk7XG4gICAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gICAgaWYgKCF3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGUuY2h1bmspKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtrZXksIGlkc10gb2Ygd29ybGQuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgYWN0aXZlID0gaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpO1xuICAgIGlmIChhY3RpdmUubGVuZ3RoID4gMCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhrZXkpKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgYWN0aXZlKTtcbiAgICBlbHNlIHdvcmxkLmVudGl0eUNodW5rcy5kZWxldGUoa2V5KTtcbiAgfVxuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGVyc2lzdGVuY2UgLyBhdXRob3JpdHkgYm91bmRhcnkgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1hbmlmZXN0IHtcbiAgc2NoZW1hOiAxO1xuICBzZWVkOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIHBhcmFtc0hhc2g6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZm52MWEodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGggPSAweDgxMWM5ZGM1O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBoID0gTWF0aC5pbXVsKGgsIDB4MDEwMDAxOTMpO1xuICB9XG4gIHJldHVybiAoaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZE1hbmlmZXN0KHdvcmxkOiBXb3JsZCk6IFdvcmxkTWFuaWZlc3Qge1xuICBjb25zdCBwID0gd29ybGQucGFyYW1zO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBzZWVkOiB3b3JsZC5zZWVkLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHAuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBzaXplOiBwLnNpemUsXG4gICAgY2h1bmtTaXplOiBwLmNodW5rU2l6ZSxcbiAgICB5TWluOiBwLnlNaW4sXG4gICAgeU1heDogcC55TWF4LFxuICAgIHNlYUxldmVsOiBwLnNlYUxldmVsLFxuICAgIHBhcmFtc0hhc2g6IGZudjFhKEpTT04uc3RyaW5naWZ5KHApKSxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbEVkaXQgeyBpOiBudW1iZXI7IG06IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgc2NoZW1hOiAxO1xuICBrZXk6IHN0cmluZztcbiAgYmFzZVZlcnNpb246IG51bWJlcjtcbiAgZWRpdHM6IFZveGVsRWRpdFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogQ2h1bmtEZWx0YSB7XG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIGtleSxcbiAgICBiYXNlVmVyc2lvbjogd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgZWRpdHM6IGVkaXRzID8gWy4uLmVkaXRzLmVudHJpZXMoKV0ubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSkgOiBbXSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGRlbHRhOiBDaHVua0RlbHRhKTogdm9pZCB7XG4gIGNvbnN0IFtjeCwgY3pdID0gZGVsdGEua2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGZvciAoY29uc3QgZSBvZiBkZWx0YS5lZGl0cykge1xuICAgIGNvbnN0IHlJbmRleCA9IE1hdGguZmxvb3IoZS5pIC8gQ0hVTktfQVJFQSk7XG4gICAgY29uc3QgcmVtID0gZS5pICUgQ0hVTktfQVJFQTtcbiAgICBjb25zdCBseiA9IE1hdGguZmxvb3IocmVtIC8gQ0hVTktfU0laRSk7XG4gICAgY29uc3QgbHggPSByZW0gJSBDSFVOS19TSVpFO1xuICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHg7XG4gICAgY29uc3QgeSA9IFlfTUlOICsgeUluZGV4O1xuICAgIGNvbnN0IHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIGUubSBhcyBNYXRJZCk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSB0aW1lIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgVGltZVN0YXRlIHsgdDogbnVtYmVyOyBkYXlMZW5ndGhTZWM6IG51bWJlcjsgcGF1c2VkOiBib29sZWFuOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBhZHZhbmNlVGltZShzOiBUaW1lU3RhdGUsIGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHMucGF1c2VkKSByZXR1cm47XG4gIHMudCA9IChzLnQgKyBkdCAvIHMuZGF5TGVuZ3RoU2VjKSAlIDE7XG59XG4iLCAiLy8gRmF1bmEgXHUyMDE0IHNwZWNpZXMsIGhhYml0YXQsIGRldGVybWluaXN0aWMgc3Bhd25pbmcgYW5kIGJlaGF2aW91ciAocHVyZSBUUywgRC0wMDUpLlxuLy9cbi8vIE9uZSBhcmNoaXRlY3R1cmUgZm9yIGV2ZXJ5IGNyZWF0dXJlIHRpZXI6XG4vLyAgICdhbWJpZW50JyAgICAgICBcdTIwMTQgbGl2aW5nIHNjZW5lcnkuIFNwYXduZWQgZGV0ZXJtaW5pc3RpY2FsbHkgcGVyIGNodW5rIGZyb21cbi8vICAgICAgICAgICAgICAgICAgICAgKHNlZWQsIGdlbmVyYXRvciwgY2h1bmspOyBub3Qgc2F2ZWQsIHJlLWNyZWF0ZWQgd2hlbiBhXG4vLyAgICAgICAgICAgICAgICAgICAgIGNodW5rIGxvYWRzLiBUaGlzIGlzIHRoZSB0aWVyIGltcGxlbWVudGVkIHRvZGF5LlxuLy8gICAnYXV0aG9yaXRhdGl2ZScgXHUyMDE0IGEgY3JlYXR1cmUgdGhlIGVjb25vbXkgY2FyZXMgYWJvdXQgKGh1bnRlZCwgY2F1Z2h0LFxuLy8gICAgICAgICAgICAgICAgICAgICB0YW1lZCwgYnJlZCwgdHJhZGVkKS4gU2FtZSByZWNvcmQgc2hhcGUsIGJ1dCBzdG9yZWQgaW4gdGhlXG4vLyAgICAgICAgICAgICAgICAgICAgIHdvcmxkIHNuYXBzaG90IGFuZCBjaGFuZ2VkIG9ubHkgYnkgam91cm5hbGVkIGNvbW1hbmRzLlxuLy8gUHJvbW90aW9uIGtlZXBzIHRoZSByZWNvcmQgaWQsIHNwZWNpZXMgYW5kIHBvc2l0aW9uLCBzbyBhIGh1bnRlZCBkZWVyIGlzIHRoZVxuLy8gc2FtZSBkZWVyIHRoZSBwbGF5ZXIgd2F0Y2hlZCBncmF6ZS4gTm90aGluZyBoZXJlIGltcG9ydHMgdGhyZWUuanMuXG4vL1xuLy8gQmVoYXZpb3VyIHVzZXMgcmVzaWRlbnQtb25seSB0ZXJyYWluIHF1ZXJpZXMsIHNvIGNyZWF0dXJlcyBuZXZlciBnZW5lcmF0ZVxuLy8gY2h1bmtzOyB0aGV5IHR1cm4gYmFjayBhdCB0aGUgZWRnZSBvZiB0aGUgbG9hZGVkIHdvcmxkLlxuaW1wb3J0IHtcbiAgV29ybGQsIE1BVCwgcmVzaWRlbnRTdXJmYWNlQXQsIHJlc2lkZW50Vm94ZWxBdCwgY2h1bmtLZXksIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLFxuICBDSFVOS19TSVpFLCBoeWRyb2xvZ3lGb3IsIGlzUmV0aXJlZFN0b25lS2luZCxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBoYXNoMmksIG11bGJlcnJ5MzIgfSBmcm9tICcuL25vaXNlJztcblxuZXhwb3J0IHR5cGUgSGFiaXRhdCA9ICdtZWFkb3cnIHwgJ2ZvcmVzdF9lZGdlJyB8ICd3YXRlcic7XG5leHBvcnQgdHlwZSBDcmVhdHVyZVRpZXIgPSAnYW1iaWVudCcgfCAnYXV0aG9yaXRhdGl2ZSc7XG5leHBvcnQgdHlwZSBCZWhhdmlvdXIgPSAnaWRsZScgfCAnZ3JhemUnIHwgJ3dhbmRlcicgfCAnZmxlZScgfCAncmVzdCcgfCAnc2xlZXAnIHwgJ3N3aW0nIHwgJ3NjYXR0ZXInIHwgJ3N0YWxrJyB8ICdjaGFzZScgfCAnZm9sbG93JztcblxuZXhwb3J0IGludGVyZmFjZSBTcGVjaWVzRGVmIHtcbiAgaWQ6ICdkZWVyJyB8ICdyYWJiaXQnIHwgJ3Ryb3V0JyB8ICdmb3gnIHwgJ3dvbGYnO1xuICAvKiogU3BlY2llcyB0aGlzIG9uZSBmbGVlcyBmcm9tIHdoZW4gdGhleSBjb21lIGNsb3NlLiAqL1xuICBmZWFyc1NwZWNpZXM/OiBSZWFkb25seUFycmF5PFNwZWNpZXNEZWZbJ2lkJ10+O1xuICBsYWJlbDogc3RyaW5nO1xuICBoYWJpdGF0OiBIYWJpdGF0O1xuICAvKiogQm9keSBsZW5ndGggKG0pLCB1c2VkIGJ5IHJlbmRlcmluZyBhbmQgY29sbGlzaW9uLiAqL1xuICBsZW5ndGg6IG51bWJlcjtcbiAgd2Fsa1NwZWVkOiBudW1iZXI7XG4gIGZsZWVTcGVlZDogbnVtYmVyO1xuICAvKiogRGlzdGFuY2UgYXQgd2hpY2ggdGhlIHNwZWNpZXMgbm90aWNlcyBhIHBlcnNvbiBhbmQgZmxlZXMuICovXG4gIHdhcmluZXNzOiBudW1iZXI7XG4gIGdyb3VwTWluOiBudW1iZXI7XG4gIGdyb3VwTWF4OiBudW1iZXI7XG4gIC8qKiBIb21lIHJhbmdlIHJhZGl1cyBhcm91bmQgdGhlIHNwYXduIHBvaW50IChtKS4gKi9cbiAgcmFuZ2U6IG51bWJlcjtcbiAgLyoqIFJlc291cmNlIGFuZCBhbW91bnQgYSBmdXR1cmUgaHVudGluZy9maXNoaW5nIGNvbW1hbmQgd291bGQgeWllbGQuICovXG4gIHlpZWxkczogUGFydGlhbDxSZWNvcmQ8J2Zvb2QnIHwgJ2hpZGUnIHwgJ2ZpYmVyJywgbnVtYmVyPj47XG4gIGRpdXJuYWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjb25zdCBTUEVDSUVTOiBSZWNvcmQ8U3BlY2llc0RlZlsnaWQnXSwgU3BlY2llc0RlZj4gPSB7XG4gIGRlZXI6IHtcbiAgICBpZDogJ2RlZXInLCBsYWJlbDogJ1JlZCBkZWVyJywgaGFiaXRhdDogJ2ZvcmVzdF9lZGdlJywgbGVuZ3RoOiAxLjcsIHdhbGtTcGVlZDogMS4yLCBmbGVlU3BlZWQ6IDguNSxcbiAgICB3YXJpbmVzczogMTQsIGdyb3VwTWluOiAyLCBncm91cE1heDogNCwgcmFuZ2U6IDI4LCB5aWVsZHM6IHsgZm9vZDogMTIsIGhpZGU6IDIgfSwgZGl1cm5hbDogdHJ1ZSxcbiAgfSxcbiAgcmFiYml0OiB7XG4gICAgaWQ6ICdyYWJiaXQnLCBsYWJlbDogJ0hhcmUnLCBoYWJpdGF0OiAnbWVhZG93JywgbGVuZ3RoOiAwLjQ1LCB3YWxrU3BlZWQ6IDAuOSwgZmxlZVNwZWVkOiA2LjUsXG4gICAgd2FyaW5lc3M6IDYsIGdyb3VwTWluOiAxLCBncm91cE1heDogMywgcmFuZ2U6IDE0LCB5aWVsZHM6IHsgZm9vZDogMiwgaGlkZTogMSB9LCBkaXVybmFsOiB0cnVlLFxuICB9LFxuICB0cm91dDoge1xuICAgIGlkOiAndHJvdXQnLCBsYWJlbDogJ0Jyb3duIHRyb3V0JywgaGFiaXRhdDogJ3dhdGVyJywgbGVuZ3RoOiAwLjQsIHdhbGtTcGVlZDogMC42LCBmbGVlU3BlZWQ6IDMuNSxcbiAgICB3YXJpbmVzczogMy41LCBncm91cE1pbjogNCwgZ3JvdXBNYXg6IDcsIHJhbmdlOiAxMCwgeWllbGRzOiB7IGZvb2Q6IDIgfSwgZGl1cm5hbDogZmFsc2UsXG4gIH0sXG4gIGZveDoge1xuICAgIGlkOiAnZm94JywgbGFiZWw6ICdSZWQgZm94JywgaGFiaXRhdDogJ2ZvcmVzdF9lZGdlJywgbGVuZ3RoOiAwLjk1LCB3YWxrU3BlZWQ6IDEuNSwgZmxlZVNwZWVkOiA3LFxuICAgIHdhcmluZXNzOiAxMSwgZ3JvdXBNaW46IDEsIGdyb3VwTWF4OiAxLCByYW5nZTogMzAsIHlpZWxkczogeyBmb29kOiAzLCBoaWRlOiAxIH0sIGRpdXJuYWw6IGZhbHNlLFxuICAgIGZlYXJzU3BlY2llczogWyd3b2xmJ10sXG4gIH0sXG4gIHdvbGY6IHtcbiAgICBpZDogJ3dvbGYnLCBsYWJlbDogJ0dyZXkgd29sZicsIGhhYml0YXQ6ICdmb3Jlc3RfZWRnZScsIGxlbmd0aDogMS4zLCB3YWxrU3BlZWQ6IDEuOCwgZmxlZVNwZWVkOiA4LFxuICAgIHdhcmluZXNzOiAyMCwgZ3JvdXBNaW46IDIsIGdyb3VwTWF4OiA0LCByYW5nZTogNDAsIHlpZWxkczogeyBmb29kOiA4LCBoaWRlOiAyIH0sIGRpdXJuYWw6IGZhbHNlLFxuICB9LFxufTtcbi8qKiBXaG8gZmxlZXMgd2hvbSAod2lsZGxpZmUgb25seTsgbGl2ZXN0b2NrIGVuY2xvc3VyZXMgYXJlIG5vdCBwYXJ0IG9mIHRoaXMgYW1iaWVudCB0aWVyKS4gKi9cbmNvbnN0IEZFQVJTOiBQYXJ0aWFsPFJlY29yZDxTcGVjaWVzRGVmWydpZCddLCBSZWFkb25seUFycmF5PFNwZWNpZXNEZWZbJ2lkJ10+Pj4gPSB7XG4gIHJhYmJpdDogWydmb3gnLCAnd29sZiddLCBkZWVyOiBbJ3dvbGYnXSwgZm94OiBbJ3dvbGYnXSxcbn07XG4vKiogSG93IGNsb3NlIGEgcHJlZGF0b3IgbXVzdCBiZSBiZWZvcmUgaXRzIHByZXkgYm9sdHMgKG1ldHJlcykuICovXG5jb25zdCBQUkVEQVRPUl9BTEFSTSA9IDk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ3JlYXR1cmUge1xuICAvKiogU3RhYmxlLCBkZXRlcm1pbmlzdGljIGlkOiBmYXVuYTo8c3BlY2llcz46PGNodW5rPjo8aW5kZXg+LiAqL1xuICBpZDogc3RyaW5nO1xuICBzcGVjaWVzOiBTcGVjaWVzRGVmWydpZCddO1xuICB0aWVyOiBDcmVhdHVyZVRpZXI7XG4gIGNodW5rOiBzdHJpbmc7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGhlYWRpbmc6IG51bWJlcjtcbiAgaG9tZVg6IG51bWJlcjtcbiAgaG9tZVo6IG51bWJlcjtcbiAgYmVoYXZpb3VyOiBCZWhhdmlvdXI7XG4gIC8qKiBTZWNvbmRzIGxlZnQgaW4gdGhlIGN1cnJlbnQgYmVoYXZpb3VyLiAqL1xuICB0aW1lcjogbnVtYmVyO1xuICBnb2FsWDogbnVtYmVyO1xuICBnb2FsWjogbnVtYmVyO1xuICAvKiogRmlzaCBvbmx5OiBwcmVmZXJyZWQgZGVwdGggZnJhY3Rpb24gKDAgPSBzdXJmYWNlLCAxID0gYmVkKS4gKi9cbiAgZGVwdGhQcmVmOiBudW1iZXI7XG4gIHNwZWVkOiBudW1iZXI7XG4gIC8qKiBEZXRlcm1pbmlzdGljIHBlci1jcmVhdHVyZSByYW5kb20gc3RyZWFtIHN0YXRlLiAqL1xuICBybmc6IG51bWJlcjtcbiAgLyoqIFBhY2sgbWVtYmVycyBmb2xsb3cgdGhpcyBjcmVhdHVyZSAod29sdmVzKS4gKi9cbiAgbGVhZGVyPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZhdW5hQ29udGV4dCB7XG4gIC8qKiBQb3NpdGlvbnMgb2YgcGVvcGxlIChwbGF5ZXIgY2hhcmFjdGVyLCBsYXRlciB2aWxsYWdlcnMpLiAqL1xuICB0aHJlYXRzOiBSZWFkb25seUFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IGluV2F0ZXI/OiBib29sZWFuIH0+O1xuICBuaWdodDogYm9vbGVhbjtcbiAgLyoqIEV2ZXJ5IHByZWRhdG9yIGluIHRoZSBsb2FkZWQgYXJlYSwgZm9yIHByZXkgdG8gZmxlZSBmcm9tLiAqL1xuICBwcmVkYXRvcnM/OiBSZWFkb25seUFycmF5PHsgc3BlY2llczogU3BlY2llc0RlZlsnaWQnXTsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT47XG4gIC8qKiBIYXJlcyBpbiB0aGUgbG9hZGVkIGFyZWEsIGZvciBmb3hlcyB0byBzdGFsay4gKi9cbiAgcHJleT86IFJlYWRvbmx5QXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PjtcbiAgLyoqIFBhY2sgbGVhZGVycyBieSBpZCwgZm9yIHdvbHZlcyB0byBmb2xsb3cuICovXG4gIGxlYWRlcnM/OiBSZWFkb25seU1hcDxzdHJpbmcsIENyZWF0dXJlPjtcbn1cblxuZXhwb3J0IGNvbnN0IEZBVU5BX1NURVAgPSAwLjE7XG5cbmZ1bmN0aW9uIHJhbmQoYzogQ3JlYXR1cmUpOiBudW1iZXIge1xuICBjLnJuZyA9IChjLnJuZyArIDB4NmQyYjc5ZjUpID4+PiAwO1xuICBsZXQgdCA9IGMucm5nO1xuICB0ID0gTWF0aC5pbXVsKHQgXiAodCA+Pj4gMTUpLCB0IHwgMSk7XG4gIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuLyoqIFRvcCBvZiBzdGFuZGluZyB3YXRlciBvbiBhIHJlc2lkZW50IGNvbHVtbiwgb3IgbnVsbCBpZiBkcnkgb3IgdW5sb2FkZWQuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRXYXRlckF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiB7IGJlZDogbnVtYmVyOyB0b3A6IG51bWJlciB9IHwgbnVsbCB7XG4gIGNvbnN0IGJlZCA9IHJlc2lkZW50U3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKGJlZCA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGxldCB5ID0gYmVkO1xuICB3aGlsZSAoeSA8IGJlZCArIDI0ICYmIHJlc2lkZW50Vm94ZWxBdCh3b3JsZCwgeCwgeSwgeikgPT09IE1BVC5XQVRFUikgeSsrO1xuICByZXR1cm4geSA+IGJlZCA/IHsgYmVkLCB0b3A6IHkgfSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGxhbmRPayh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBtYXhTbG9wZSA9IDEpOiBudW1iZXIgfCBudWxsIHtcbiAgY29uc3QgZnggPSBNYXRoLmZsb29yKHgpLCBmeiA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IGggPSByZXNpZGVudFN1cmZhY2VBdCh3b3JsZCwgZngsIGZ6KTtcbiAgaWYgKGggPT09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCB0b3AgPSByZXNpZGVudFZveGVsQXQod29ybGQsIGZ4LCBoIC0gMSwgZnopO1xuICBpZiAodG9wICE9PSBNQVQuR1JBU1MgJiYgdG9wICE9PSBNQVQuU09JTCAmJiB0b3AgIT09IE1BVC5NT1NTKSByZXR1cm4gbnVsbDtcbiAgaWYgKHJlc2lkZW50Vm94ZWxBdCh3b3JsZCwgZngsIGgsIGZ6KSAhPT0gTUFULkFJUikgcmV0dXJuIG51bGw7XG4gIGZvciAoY29uc3QgW2R4LCBkel0gb2YgW1sxLCAwXSwgWy0xLCAwXSwgWzAsIDFdLCBbMCwgLTFdXSkge1xuICAgIGNvbnN0IG4gPSByZXNpZGVudFN1cmZhY2VBdCh3b3JsZCwgZnggKyBkeCwgZnogKyBkeik7XG4gICAgaWYgKG4gPT09IG51bGwgfHwgTWF0aC5hYnMobiAtIGgpID4gbWF4U2xvcGUpIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiBoO1xufVxuXG4vKipcbiAqIERldGVybWluaXN0aWMgYW1iaWVudCBzcGF3biBmb3Igb25lIHJlc2lkZW50IGNodW5rLiBQdXJlIGZ1bmN0aW9uIG9mIHRoZVxuICogd29ybGQncyBzZWVkLCBnZW5lcmF0b3IgYW5kIHRoZSBjaHVuaydzIGdlbmVyYXRlZCB0ZXJyYWluIGFuZCB0cmVlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNwYXduQ2h1bmtGYXVuYSh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBDcmVhdHVyZVtdIHtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgaWYgKCF3b3JsZC5jaHVua3MuaGFzKGtleSkpIHJldHVybiBbXTtcbiAgY29uc3Qgc2VlZCA9IHdvcmxkLnNlZWQ7XG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKGhhc2gyaShjeCwgY3osIHNlZWQgKyA3NzcxKSAqIDQyOTQ5NjcyOTYpID4+PiAwKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGNvbnN0IG91dDogQ3JlYXR1cmVbXSA9IFtdO1xuICBsZXQgaW5kZXggPSAwO1xuXG4gIGxldCB0cmVlcyA9IDA7XG4gIGZvciAoY29uc3QgaWQgb2Ygd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKGUgJiYgIWUuaGFydmVzdGVkICYmICFpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiBlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlXycpKSB0cmVlcysrO1xuICB9XG4gIGxldCB3YXRlciA9IDAsIHd4ID0gMCwgd3ogPSAwO1xuICBjb25zdCBncmFzczogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBmb3IgKGxldCBseiA9IDI7IGx6IDwgQ0hVTktfU0laRTsgbHogKz0gNCkge1xuICAgIGZvciAobGV0IGx4ID0gMjsgbHggPCBDSFVOS19TSVpFOyBseCArPSA0KSB7XG4gICAgICBjb25zdCB4ID0gb3ggKyBseCwgeiA9IG96ICsgbHo7XG4gICAgICBjb25zdCB3ID0gcmVzaWRlbnRXYXRlckF0KHdvcmxkLCB4LCB6KTtcbiAgICAgIGlmICh3ICYmIHcudG9wIC0gdy5iZWQgPj0gMS4yKSB7IHdhdGVyKys7IHd4ICs9IHg7IHd6ICs9IHo7IH1cbiAgICAgIGVsc2UgaWYgKGxhbmRPayh3b3JsZCwgeCwgeikgIT09IG51bGwpIGdyYXNzLnB1c2goeyB4LCB6IH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG1ha2UgPSAoc3BlY2llczogU3BlY2llc0RlZlsnaWQnXSwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHk6IG51bWJlcik6IENyZWF0dXJlID0+IHtcbiAgICBjb25zdCBjOiBDcmVhdHVyZSA9IHtcbiAgICAgIGlkOiBgZmF1bmE6JHtzcGVjaWVzfToke2tleX06JHtpbmRleCsrfWAsIHNwZWNpZXMsIHRpZXI6ICdhbWJpZW50JywgY2h1bms6IGtleSxcbiAgICAgIHgsIHksIHosIGhlYWRpbmc6IHJuZCgpICogTWF0aC5QSSAqIDIsIGhvbWVYOiB4LCBob21lWjogeixcbiAgICAgIGJlaGF2aW91cjogc3BlY2llcyA9PT0gJ3Ryb3V0JyA/ICdzd2ltJyA6ICdncmF6ZScsIHRpbWVyOiAxICsgcm5kKCkgKiA0LFxuICAgICAgZ29hbFg6IHgsIGdvYWxaOiB6LCBkZXB0aFByZWY6IDAuMyArIHJuZCgpICogMC41LCBzcGVlZDogMCxcbiAgICAgIHJuZzogKHJuZCgpICogNDI5NDk2NzI5NikgPj4+IDAsXG4gICAgfTtcbiAgICByZXR1cm4gYztcbiAgfTtcblxuICAvLyBGaXNoIHNjaG9vbHMgaW4gZGVlcCBlbm91Z2ggd2F0ZXIuXG4gIGlmICh3YXRlciA+PSA4ICYmIHJuZCgpIDwgMC43KSB7XG4gICAgY29uc3QgY3h3ID0gd3ggLyB3YXRlciwgY3p3ID0gd3ogLyB3YXRlcjtcbiAgICBjb25zdCBuID0gU1BFQ0lFUy50cm91dC5ncm91cE1pbiArIE1hdGguZmxvb3Iocm5kKCkgKiAoU1BFQ0lFUy50cm91dC5ncm91cE1heCAtIFNQRUNJRVMudHJvdXQuZ3JvdXBNaW4gKyAxKSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgIGNvbnN0IHggPSBjeHcgKyAocm5kKCkgLSAwLjUpICogNCwgeiA9IGN6dyArIChybmQoKSAtIDAuNSkgKiA0O1xuICAgICAgY29uc3QgdyA9IHJlc2lkZW50V2F0ZXJBdCh3b3JsZCwgTWF0aC5mbG9vcih4KSwgTWF0aC5mbG9vcih6KSk7XG4gICAgICBpZiAoIXcgfHwgdy50b3AgLSB3LmJlZCA8IDEpIGNvbnRpbnVlO1xuICAgICAgb3V0LnB1c2gobWFrZSgndHJvdXQnLCB4LCB6LCB3LmJlZCArICh3LnRvcCAtIHcuYmVkKSAqIDAuNSkpO1xuICAgIH1cbiAgfVxuICAvLyBEZWVyIGF0IGZvcmVzdCBlZGdlcywgaGFyZXMgaW4gb3BlbiBtZWFkb3cuXG4gIGlmIChncmFzcy5sZW5ndGggPj0gNikge1xuICAgIGNvbnN0IHNwZWNpZXM6IFNwZWNpZXNEZWZbJ2lkJ10gfCBudWxsID0gdHJlZXMgPj0gMyAmJiBybmQoKSA8IDAuNDIgPyAnZGVlcidcbiAgICAgIDogdHJlZXMgPD0gMiAmJiBybmQoKSA8IDAuNDUgPyAncmFiYml0JyA6IG51bGw7XG4gICAgaWYgKHNwZWNpZXMpIHtcbiAgICAgIGNvbnN0IGRlZiA9IFNQRUNJRVNbc3BlY2llc107XG4gICAgICBjb25zdCBhdCA9IGdyYXNzW01hdGguZmxvb3Iocm5kKCkgKiBncmFzcy5sZW5ndGgpXTtcbiAgICAgIGNvbnN0IG4gPSBkZWYuZ3JvdXBNaW4gKyBNYXRoLmZsb29yKHJuZCgpICogKGRlZi5ncm91cE1heCAtIGRlZi5ncm91cE1pbiArIDEpKTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHggPSBhdC54ICsgMC41ICsgKHJuZCgpIC0gMC41KSAqIDYsIHogPSBhdC56ICsgMC41ICsgKHJuZCgpIC0gMC41KSAqIDY7XG4gICAgICAgIGNvbnN0IGggPSBsYW5kT2sod29ybGQsIHgsIHopO1xuICAgICAgICBpZiAoaCAhPT0gbnVsbCkgb3V0LnB1c2gobWFrZShzcGVjaWVzLCB4LCB6LCBoKSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIC8vIFByZWRhdG9ycyB1c2UgdGhlaXIgb3duIHJhbmRvbSBzdHJlYW0sIHNvIGFkZGluZyB0aGVtIG5ldmVyIG1vdmVzIHRoZVxuICAvLyBleGlzdGluZyBkZWVyLCBoYXJlcyBhbmQgZmlzaC5cbiAgaWYgKGdyYXNzLmxlbmd0aCA+PSA0KSB7XG4gICAgY29uc3QgcjIgPSBtdWxiZXJyeTMyKChoYXNoMmkoY3gsIGN6LCBzZWVkICsgNzc3MikgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCk7XG4gICAgY29uc3Qga2luZDogJ3dvbGYnIHwgJ2ZveCcgfCBudWxsID0gdHJlZXMgPj0gNiAmJiByMigpIDwgMC4xNiA/ICd3b2xmJyA6IHRyZWVzID49IDIgJiYgdHJlZXMgPD0gNSAmJiByMigpIDwgMC4yNiA/ICdmb3gnIDogbnVsbDtcbiAgICBpZiAoa2luZCkge1xuICAgICAgY29uc3QgZGVmID0gU1BFQ0lFU1traW5kXTtcbiAgICAgIGNvbnN0IGF0ID0gZ3Jhc3NbTWF0aC5mbG9vcihyMigpICogZ3Jhc3MubGVuZ3RoKV07XG4gICAgICBjb25zdCBuID0gZGVmLmdyb3VwTWluICsgTWF0aC5mbG9vcihyMigpICogKGRlZi5ncm91cE1heCAtIGRlZi5ncm91cE1pbiArIDEpKTtcbiAgICAgIGxldCBsZWFkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHggPSBhdC54ICsgMC41ICsgKHIyKCkgLSAwLjUpICogNCwgeiA9IGF0LnogKyAwLjUgKyAocjIoKSAtIDAuNSkgKiA0O1xuICAgICAgICBjb25zdCBoID0gbGFuZE9rKHdvcmxkLCB4LCB6KTtcbiAgICAgICAgaWYgKGggPT09IG51bGwpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBjOiBDcmVhdHVyZSA9IHtcbiAgICAgICAgICBpZDogYGZhdW5hOiR7a2luZH06JHtrZXl9OiR7aW5kZXgrK31gLCBzcGVjaWVzOiBraW5kLCB0aWVyOiAnYW1iaWVudCcsIGNodW5rOiBrZXksXG4gICAgICAgICAgeCwgeTogaCwgeiwgaGVhZGluZzogcjIoKSAqIE1hdGguUEkgKiAyLCBob21lWDogeCwgaG9tZVo6IHosIGJlaGF2aW91cjogJ3Jlc3QnLCB0aW1lcjogMiArIHIyKCkgKiA1LFxuICAgICAgICAgIGdvYWxYOiB4LCBnb2FsWjogeiwgZGVwdGhQcmVmOiAwLCBzcGVlZDogMCwgcm5nOiAocjIoKSAqIDQyOTQ5NjcyOTYpID4+PiAwLFxuICAgICAgICB9O1xuICAgICAgICBpZiAoa2luZCA9PT0gJ3dvbGYnKSB7IGlmIChsZWFkZXIpIGMubGVhZGVyID0gbGVhZGVyOyBlbHNlIGxlYWRlciA9IGMuaWQ7IH1cbiAgICAgICAgb3V0LnB1c2goYyk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIG5lYXJlc3RUaHJlYXQoYzogQ3JlYXR1cmUsIGN0eDogRmF1bmFDb250ZXh0KTogeyBkOiBudW1iZXI7IHg6IG51bWJlcjsgejogbnVtYmVyOyBwcmVkYXRvcj86IGJvb2xlYW4gfSB8IG51bGwge1xuICBsZXQgYmVzdDogeyBkOiBudW1iZXI7IHg6IG51bWJlcjsgejogbnVtYmVyOyBwcmVkYXRvcj86IGJvb2xlYW4gfSB8IG51bGwgPSBudWxsO1xuICBmb3IgKGNvbnN0IHQgb2YgY3R4LnRocmVhdHMpIHtcbiAgICBjb25zdCBkID0gTWF0aC5oeXBvdCh0LnggLSBjLngsIHQueiAtIGMueik7XG4gICAgaWYgKCFiZXN0IHx8IGQgPCBiZXN0LmQpIGJlc3QgPSB7IGQsIHg6IHQueCwgejogdC56IH07XG4gIH1cbiAgLy8gUHJleSBib2x0IGZyb20gdGhlIHByZWRhdG9ycyB0aGF0IGh1bnQgdGhlbSwgYXQgdGhlaXIgb3duIChzaG9ydGVyKSBhbGFybSBkaXN0YW5jZS5cbiAgY29uc3QgZmVhcnMgPSBGRUFSU1tjLnNwZWNpZXNdO1xuICBpZiAoZmVhcnMgJiYgY3R4LnByZWRhdG9ycykge1xuICAgIGZvciAoY29uc3QgcCBvZiBjdHgucHJlZGF0b3JzKSB7XG4gICAgICBpZiAoIWZlYXJzLmluY2x1ZGVzKHAuc3BlY2llcykpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZCA9IE1hdGguaHlwb3QocC54IC0gYy54LCBwLnogLSBjLnopO1xuICAgICAgLy8gU2NhbGUgc28gdGhlIGNhbGxlcidzIGBkIDwgd2FyaW5lc3NgIHRlc3QgZmlyZXMgYXQgUFJFREFUT1JfQUxBUk0uXG4gICAgICBjb25zdCBzY2FsZWQgPSBkICogKFNQRUNJRVNbYy5zcGVjaWVzXS53YXJpbmVzcyAvIFBSRURBVE9SX0FMQVJNKTtcbiAgICAgIGlmIChkIDwgUFJFREFUT1JfQUxBUk0gJiYgKCFiZXN0IHx8IHNjYWxlZCA8IGJlc3QuZCkpIGJlc3QgPSB7IGQ6IHNjYWxlZCwgeDogcC54LCB6OiBwLnosIHByZWRhdG9yOiB0cnVlIH07XG4gICAgfVxuICB9XG4gIHJldHVybiBiZXN0O1xufVxuXG4vKiogQWR2YW5jZSBvbmUgY3JlYXR1cmUgYnkgRkFVTkFfU1RFUC4gRGV0ZXJtaW5pc3RpYyBnaXZlbiAod29ybGQsIGNyZWF0dXJlLCBjb250ZXh0KS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGVwQ3JlYXR1cmUod29ybGQ6IFdvcmxkLCBjOiBDcmVhdHVyZSwgY3R4OiBGYXVuYUNvbnRleHQpOiB2b2lkIHtcbiAgY29uc3QgZGVmID0gU1BFQ0lFU1tjLnNwZWNpZXNdO1xuICBjb25zdCBkdCA9IEZBVU5BX1NURVA7XG4gIGNvbnN0IHRocmVhdCA9IG5lYXJlc3RUaHJlYXQoYywgY3R4KTtcbiAgYy50aW1lciAtPSBkdDtcblxuICBpZiAoZGVmLmhhYml0YXQgPT09ICd3YXRlcicpIHsgc3RlcEZpc2god29ybGQsIGMsIGRlZiwgY3R4LCB0aHJlYXQpOyByZXR1cm47IH1cblxuICAvLyBGb3hlcyBzdGFsayBoYXJlcyBhbmQgcG91bmNlOyBhIG1pc3MgZW5kcyBpbiBhIHJlc3QuXG4gIGlmIChjLnNwZWNpZXMgPT09ICdmb3gnKSBmb3hIdW50KGMsIGRlZiwgY3R4LCB0aHJlYXQpO1xuXG4gIC8vIERlY2lkZS5cbiAgaWYgKHRocmVhdCAmJiB0aHJlYXQuZCA8IGRlZi53YXJpbmVzcyAmJiBjLmJlaGF2aW91ciAhPT0gJ2ZsZWUnKSB7XG4gICAgYy5iZWhhdmlvdXIgPSAnZmxlZSc7XG4gICAgYy50aW1lciA9IDIuNSArIHJhbmQoYykgKiAyO1xuICB9IGVsc2UgaWYgKGMuYmVoYXZpb3VyID09PSAnc3RhbGsnIHx8IGMuYmVoYXZpb3VyID09PSAnY2hhc2UnKSB7XG4gICAgLy8gaGFuZGxlZCBieSBmb3hIdW50XG4gIH0gZWxzZSBpZiAoYy5sZWFkZXIgJiYgY3R4LmxlYWRlcnM/LmhhcyhjLmxlYWRlcikpIHtcbiAgICBwYWNrRm9sbG93KGMsIGRlZiwgY3R4LmxlYWRlcnMuZ2V0KGMubGVhZGVyKSEpO1xuICB9IGVsc2UgaWYgKGMudGltZXIgPD0gMCkge1xuICAgIGNvbnN0IHNsZWVweSA9IGRlZi5kaXVybmFsICYmIGN0eC5uaWdodDtcbiAgICBjb25zdCByID0gcmFuZChjKTtcbiAgICBpZiAoc2xlZXB5KSB7IGMuYmVoYXZpb3VyID0gJ3NsZWVwJzsgYy50aW1lciA9IDggKyByICogMTA7IH1cbiAgICBlbHNlIGlmIChyIDwgMC40NSkgeyBjLmJlaGF2aW91ciA9ICdncmF6ZSc7IGMudGltZXIgPSAzICsgcmFuZChjKSAqIDU7IH1cbiAgICBlbHNlIGlmIChyIDwgMC42MikgeyBjLmJlaGF2aW91ciA9ICdyZXN0JzsgYy50aW1lciA9IDQgKyByYW5kKGMpICogNjsgfVxuICAgIGVsc2Uge1xuICAgICAgYy5iZWhhdmlvdXIgPSAnd2FuZGVyJztcbiAgICAgIGMudGltZXIgPSA2O1xuICAgICAgY29uc3QgYSA9IHJhbmQoYykgKiBNYXRoLlBJICogMiwgZCA9IHJhbmQoYykgKiBkZWYucmFuZ2U7XG4gICAgICBjLmdvYWxYID0gYy5ob21lWCArIE1hdGguY29zKGEpICogZDtcbiAgICAgIGMuZ29hbFogPSBjLmhvbWVaICsgTWF0aC5zaW4oYSkgKiBkO1xuICAgIH1cbiAgfVxuXG4gIC8vIEFjdC5cbiAgbGV0IHR4ID0gMCwgdHogPSAwLCBzcGVlZCA9IDA7XG4gIGlmIChjLmJlaGF2aW91ciA9PT0gJ2ZsZWUnICYmIHRocmVhdCkge1xuICAgIGNvbnN0IGR4ID0gYy54IC0gdGhyZWF0LngsIGR6ID0gYy56IC0gdGhyZWF0LnosIGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KSB8fCAxO1xuICAgIHR4ID0gZHggLyBsZW47IHR6ID0gZHogLyBsZW47IHNwZWVkID0gZGVmLmZsZWVTcGVlZDtcbiAgICBpZiAoYy50aW1lciA8PSAwKSB7IGMuYmVoYXZpb3VyID0gJ2lkbGUnOyBjLnRpbWVyID0gMTsgYy5ob21lWCA9IGMueDsgYy5ob21lWiA9IGMuejsgfVxuICB9IGVsc2UgaWYgKGMuYmVoYXZpb3VyID09PSAnc3RhbGsnIHx8IGMuYmVoYXZpb3VyID09PSAnY2hhc2UnKSB7XG4gICAgY29uc3QgZHggPSBjLmdvYWxYIC0gYy54LCBkeiA9IGMuZ29hbFogLSBjLnosIGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KSB8fCAxO1xuICAgIHR4ID0gZHggLyBsZW47IHR6ID0gZHogLyBsZW47XG4gICAgc3BlZWQgPSBjLmJlaGF2aW91ciA9PT0gJ2NoYXNlJyA/IGRlZi5mbGVlU3BlZWQgKiAwLjggOiBkZWYud2Fsa1NwZWVkICogMC43O1xuICB9IGVsc2UgaWYgKGMuYmVoYXZpb3VyID09PSAnZm9sbG93Jykge1xuICAgIGNvbnN0IGR4ID0gYy5nb2FsWCAtIGMueCwgZHogPSBjLmdvYWxaIC0gYy56LCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeikgfHwgMTtcbiAgICB0eCA9IGR4IC8gbGVuOyB0eiA9IGR6IC8gbGVuOyBzcGVlZCA9IGRlZi53YWxrU3BlZWQgKiAxLjQ7XG4gIH0gZWxzZSBpZiAoYy5iZWhhdmlvdXIgPT09ICd3YW5kZXInKSB7XG4gICAgY29uc3QgZHggPSBjLmdvYWxYIC0gYy54LCBkeiA9IGMuZ29hbFogLSBjLnosIGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KTtcbiAgICBpZiAobGVuIDwgMC41KSB7IGMuYmVoYXZpb3VyID0gJ2dyYXplJzsgYy50aW1lciA9IDIgKyByYW5kKGMpICogMzsgfVxuICAgIGVsc2UgeyB0eCA9IGR4IC8gbGVuOyB0eiA9IGR6IC8gbGVuOyBzcGVlZCA9IGRlZi53YWxrU3BlZWQ7IH1cbiAgfSBlbHNlIGlmIChjLmJlaGF2aW91ciA9PT0gJ2dyYXplJyAmJiByYW5kKGMpIDwgMC4wNCkge1xuICAgIC8vIFNtYWxsIHNodWZmbGVzIHdoaWxlIGdyYXppbmcuXG4gICAgY29uc3QgYSA9IGMuaGVhZGluZyArIChyYW5kKGMpIC0gMC41KTtcbiAgICB0eCA9IE1hdGguc2luKGEpOyB0eiA9IE1hdGguY29zKGEpOyBzcGVlZCA9IGRlZi53YWxrU3BlZWQgKiAwLjQ7XG4gIH1cblxuICBpZiAoc3BlZWQgPiAwKSB7XG4gICAgLy8gU3RlZXIgYXJvdW5kIHVuc3VpdGFibGUgZ3JvdW5kIGJ5IHNhbXBsaW5nIGEgZmFuIG9mIGhlYWRpbmdzLlxuICAgIGNvbnN0IGJhc2UgPSBNYXRoLmF0YW4yKHR4LCB0eik7XG4gICAgbGV0IG1vdmVkID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBvZmYgb2YgWzAsIDAuNSwgLTAuNSwgMS4wLCAtMS4wLCAxLjYsIC0xLjZdKSB7XG4gICAgICBjb25zdCBhID0gYmFzZSArIG9mZjtcbiAgICAgIGNvbnN0IG54ID0gYy54ICsgTWF0aC5zaW4oYSkgKiBzcGVlZCAqIGR0LCBueiA9IGMueiArIE1hdGguY29zKGEpICogc3BlZWQgKiBkdDtcbiAgICAgIGNvbnN0IGggPSBsYW5kT2sod29ybGQsIG54LCBueiwgMSk7XG4gICAgICBpZiAoaCA9PT0gbnVsbCkgY29udGludWU7XG4gICAgICBjLnggPSBueDsgYy56ID0gbno7IGMueSA9IGg7XG4gICAgICBjLmhlYWRpbmcgPSB0dXJuKGMuaGVhZGluZywgYSwgOCAqIGR0KTtcbiAgICAgIG1vdmVkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBpZiAoIW1vdmVkICYmIGMuYmVoYXZpb3VyID09PSAnd2FuZGVyJykgeyBjLmJlaGF2aW91ciA9ICdpZGxlJzsgYy50aW1lciA9IDE7IH1cbiAgICBjLnNwZWVkID0gbW92ZWQgPyBzcGVlZCA6IDA7XG4gIH0gZWxzZSB7XG4gICAgYy5zcGVlZCA9IDA7XG4gIH1cbn1cblxuLyoqIEZveDogbm90aWNlIGEgaGFyZSwgY3JlZXAgdXAsIHBvdW5jZTsgZ2l2ZSB1cCAocmVzdCkgd2hlbiBpdCBlc2NhcGVzIG9yIHRoZSB0aW1lciBlbmRzLiAqL1xuZnVuY3Rpb24gZm94SHVudChjOiBDcmVhdHVyZSwgZGVmOiBTcGVjaWVzRGVmLCBjdHg6IEZhdW5hQ29udGV4dCwgdGhyZWF0OiB7IGQ6IG51bWJlciB9IHwgbnVsbCk6IHZvaWQge1xuICBpZiAoY3R4Lm5pZ2h0ID09PSBmYWxzZSAmJiBjLmJlaGF2aW91ciA9PT0gJ3NsZWVwJykgcmV0dXJuO1xuICBpZiAoYy5iZWhhdmlvdXIgPT09ICdzdGFsaycgfHwgYy5iZWhhdmlvdXIgPT09ICdjaGFzZScpIHtcbiAgICBsZXQgYmVzdDogeyBkOiBudW1iZXI7IHg6IG51bWJlcjsgejogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcbiAgICBmb3IgKGNvbnN0IHAgb2YgY3R4LnByZXkgPz8gW10pIHtcbiAgICAgIGNvbnN0IGQgPSBNYXRoLmh5cG90KHAueCAtIGMueCwgcC56IC0gYy56KTtcbiAgICAgIGlmICghYmVzdCB8fCBkIDwgYmVzdC5kKSBiZXN0ID0geyBkLCB4OiBwLngsIHo6IHAueiB9O1xuICAgIH1cbiAgICBpZiAoIWJlc3QgfHwgYmVzdC5kID4gMjAgfHwgYy50aW1lciA8PSAwIHx8ICh0aHJlYXQgJiYgdGhyZWF0LmQgPCBkZWYud2FyaW5lc3MgKiAwLjUpKSB7XG4gICAgICBjLmJlaGF2aW91ciA9ICdyZXN0JzsgYy50aW1lciA9IDQgKyByYW5kKGMpICogNDsgcmV0dXJuO1xuICAgIH1cbiAgICBjLmdvYWxYID0gYmVzdC54OyBjLmdvYWxaID0gYmVzdC56O1xuICAgIGlmIChjLmJlaGF2aW91ciA9PT0gJ3N0YWxrJyAmJiBiZXN0LmQgPCAzLjUpIHsgYy5iZWhhdmlvdXIgPSAnY2hhc2UnOyBjLnRpbWVyID0gMjsgfVxuICAgIGlmIChjLmJlaGF2aW91ciA9PT0gJ2NoYXNlJyAmJiBiZXN0LmQgPCAwLjYpIHsgYy5iZWhhdmlvdXIgPSAncmVzdCc7IGMudGltZXIgPSA2OyB9ICAgLy8gYSBuZWFyIG1pc3M6IHRoZSBoYXJlIGlzIGdvbmVcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGMudGltZXIgPD0gMCAmJiBjdHgucHJleSAmJiAhKHRocmVhdCAmJiB0aHJlYXQuZCA8IGRlZi53YXJpbmVzcykpIHtcbiAgICBmb3IgKGNvbnN0IHAgb2YgY3R4LnByZXkpIHtcbiAgICAgIGlmIChNYXRoLmh5cG90KHAueCAtIGMueCwgcC56IC0gYy56KSA8IDEzICYmIHJhbmQoYykgPCAwLjYpIHtcbiAgICAgICAgYy5iZWhhdmlvdXIgPSAnc3RhbGsnOyBjLnRpbWVyID0gMTI7IGMuZ29hbFggPSBwLng7IGMuZ29hbFogPSBwLno7IHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuLyoqIFBhY2sgbWVtYmVyOiBzdGF5IHdpdGggdGhlIGxlYWRlcjsgd2hlbiB0aGUgbGVhZGVyIHJlc3RzIG9yIGdyYXplcywgc28gZG8gdGhleS4gKi9cbmZ1bmN0aW9uIHBhY2tGb2xsb3coYzogQ3JlYXR1cmUsIGRlZjogU3BlY2llc0RlZiwgbGVhZGVyOiBDcmVhdHVyZSk6IHZvaWQge1xuICBjb25zdCBkID0gTWF0aC5oeXBvdChsZWFkZXIueCAtIGMueCwgbGVhZGVyLnogLSBjLnopO1xuICBpZiAoZCA+IDUpIHtcbiAgICBjLmJlaGF2aW91ciA9ICdmb2xsb3cnO1xuICAgIGNvbnN0IGEgPSByYW5kKGMpICogTWF0aC5QSSAqIDI7XG4gICAgYy5nb2FsWCA9IGxlYWRlci54ICsgTWF0aC5jb3MoYSkgKiAzOyBjLmdvYWxaID0gbGVhZGVyLnogKyBNYXRoLnNpbihhKSAqIDM7XG4gICAgYy50aW1lciA9IDE7XG4gIH0gZWxzZSBpZiAoYy5iZWhhdmlvdXIgPT09ICdmb2xsb3cnIHx8IGMudGltZXIgPD0gMCkge1xuICAgIGNvbnN0IGNhbG0gPSBsZWFkZXIuYmVoYXZpb3VyID09PSAncmVzdCcgfHwgbGVhZGVyLmJlaGF2aW91ciA9PT0gJ3NsZWVwJyB8fCBsZWFkZXIuYmVoYXZpb3VyID09PSAnZ3JhemUnIHx8IGxlYWRlci5iZWhhdmlvdXIgPT09ICdpZGxlJztcbiAgICBjLmJlaGF2aW91ciA9IGNhbG0gPyAobGVhZGVyLmJlaGF2aW91ciA9PT0gJ3NsZWVwJyA/ICdzbGVlcCcgOiAncmVzdCcpIDogJ3dhbmRlcic7XG4gICAgYy50aW1lciA9IDMgKyByYW5kKGMpICogNDtcbiAgICBjLmdvYWxYID0gbGVhZGVyLnggKyAocmFuZChjKSAtIDAuNSkgKiA4OyBjLmdvYWxaID0gbGVhZGVyLnogKyAocmFuZChjKSAtIDAuNSkgKiA4O1xuICB9XG4gIHZvaWQgZGVmO1xufVxuXG5mdW5jdGlvbiBzdGVwRmlzaCh3b3JsZDogV29ybGQsIGM6IENyZWF0dXJlLCBkZWY6IFNwZWNpZXNEZWYsIGN0eDogRmF1bmFDb250ZXh0LFxuICB0aHJlYXQ6IHsgZDogbnVtYmVyOyB4OiBudW1iZXI7IHo6IG51bWJlciB9IHwgbnVsbCk6IHZvaWQge1xuICBjb25zdCBkdCA9IEZBVU5BX1NURVA7XG4gIGNvbnN0IGh5ZHJvID0gaHlkcm9sb2d5Rm9yKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKTtcbiAgaWYgKHRocmVhdCAmJiB0aHJlYXQuZCA8IGRlZi53YXJpbmVzcykgeyBjLmJlaGF2aW91ciA9ICdzY2F0dGVyJzsgYy50aW1lciA9IDEuNSArIHJhbmQoYyk7IH1cbiAgZWxzZSBpZiAoYy50aW1lciA8PSAwKSB7XG4gICAgYy5iZWhhdmlvdXIgPSAnc3dpbSc7XG4gICAgYy50aW1lciA9IDIgKyByYW5kKGMpICogMztcbiAgICBjb25zdCBhID0gcmFuZChjKSAqIE1hdGguUEkgKiAyLCBkID0gcmFuZChjKSAqIGRlZi5yYW5nZTtcbiAgICBjLmdvYWxYID0gYy5ob21lWCArIE1hdGguY29zKGEpICogZDtcbiAgICBjLmdvYWxaID0gYy5ob21lWiArIE1hdGguc2luKGEpICogZDtcbiAgICBjLmRlcHRoUHJlZiA9IDAuMjUgKyByYW5kKGMpICogMC41NTtcbiAgfVxuICBsZXQgdHg6IG51bWJlciwgdHo6IG51bWJlciwgc3BlZWQ6IG51bWJlcjtcbiAgaWYgKGMuYmVoYXZpb3VyID09PSAnc2NhdHRlcicgJiYgdGhyZWF0KSB7XG4gICAgY29uc3QgZHggPSBjLnggLSB0aHJlYXQueCwgZHogPSBjLnogLSB0aHJlYXQueiwgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gICAgdHggPSBkeCAvIGxlbjsgdHogPSBkeiAvIGxlbjsgc3BlZWQgPSBkZWYuZmxlZVNwZWVkO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGR4ID0gYy5nb2FsWCAtIGMueCwgZHogPSBjLmdvYWxaIC0gYy56LCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeikgfHwgMTtcbiAgICB0eCA9IGR4IC8gbGVuOyB0eiA9IGR6IC8gbGVuOyBzcGVlZCA9IGxlbiA8IDAuNCA/IDAgOiBkZWYud2Fsa1NwZWVkO1xuICAgIC8vIFRyb3V0IGhvbGQgcG9zaXRpb24gYWdhaW5zdCB0aGUgY3VycmVudDogZmFjZSB1cHN0cmVhbSwgZHJpZnQgc2xpZ2h0bHkuXG4gICAgY29uc3QgdyA9IHJlc2lkZW50V2F0ZXJBdCh3b3JsZCwgTWF0aC5mbG9vcihjLngpLCBNYXRoLmZsb29yKGMueikpO1xuICAgIGlmICh3KSB7XG4gICAgICBjb25zdCBmID0gaHlkcm8uZmxvd0F0KGMueCwgYy56LCB3LnRvcCk7XG4gICAgICBpZiAoZi5zcGVlZCA+IDAuMikgeyB0eCA9IHR4ICogMC41IC0gZi5keCAqIDAuNTsgdHogPSB0eiAqIDAuNSAtIGYuZHogKiAwLjU7IH1cbiAgICB9XG4gIH1cbiAgY29uc3QgYmFzZSA9IE1hdGguYXRhbjIodHgsIHR6KTtcbiAgbGV0IG1vdmVkID0gZmFsc2U7XG4gIGZvciAoY29uc3Qgb2ZmIG9mIFswLCAwLjYsIC0wLjYsIDEuMywgLTEuMywgMi4yLCAtMi4yXSkge1xuICAgIGNvbnN0IGEgPSBiYXNlICsgb2ZmO1xuICAgIGNvbnN0IG54ID0gYy54ICsgTWF0aC5zaW4oYSkgKiBzcGVlZCAqIGR0LCBueiA9IGMueiArIE1hdGguY29zKGEpICogc3BlZWQgKiBkdDtcbiAgICBjb25zdCB3ID0gcmVzaWRlbnRXYXRlckF0KHdvcmxkLCBNYXRoLmZsb29yKG54KSwgTWF0aC5mbG9vcihueikpO1xuICAgIGlmICghdyB8fCB3LnRvcCAtIHcuYmVkIDwgMC44KSBjb250aW51ZTtcbiAgICBjLnggPSBueDsgYy56ID0gbno7XG4gICAgY29uc3QgZ29hbFkgPSB3LnRvcCAtIDAuMzUgLSAody50b3AgLSB3LmJlZCAtIDAuNykgKiBjLmRlcHRoUHJlZjtcbiAgICBjLnkgKz0gKGdvYWxZIC0gYy55KSAqIE1hdGgubWluKDEsIDMgKiBkdCk7XG4gICAgYy55ID0gTWF0aC5taW4ody50b3AgLSAwLjI1LCBNYXRoLm1heCh3LmJlZCArIDAuMiwgYy55KSk7XG4gICAgYy5oZWFkaW5nID0gdHVybihjLmhlYWRpbmcsIGEsIDYgKiBkdCk7XG4gICAgbW92ZWQgPSB0cnVlO1xuICAgIGJyZWFrO1xuICB9XG4gIGMuc3BlZWQgPSBtb3ZlZCA/IHNwZWVkIDogMDtcbiAgaWYgKCFtb3ZlZCkgeyBjLmdvYWxYID0gYy5ob21lWDsgYy5nb2FsWiA9IGMuaG9tZVo7IH1cbiAgdm9pZCBjdHg7XG59XG5cbmZ1bmN0aW9uIHR1cm4oZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyLCByYXRlOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgZCA9IHRvIC0gZnJvbTtcbiAgd2hpbGUgKGQgPiBNYXRoLlBJKSBkIC09IE1hdGguUEkgKiAyO1xuICB3aGlsZSAoZCA8IC1NYXRoLlBJKSBkICs9IE1hdGguUEkgKiAyO1xuICByZXR1cm4gZnJvbSArIGQgKiBNYXRoLm1pbigxLCByYXRlKTtcbn1cbiIsICIvLyBSZW5kZXIgbGF5ZXIgXHUyMDE0IGxpdmluZyB3aWxkbGlmZSAoYW1iaWVudCB0aWVyKSBvdmVyIHRoZSBzaW0gZmF1bmEgcnVsZXMuXG4vL1xuLy8gRmF1bmFWaWV3IG93bnMgdGhlIGFtYmllbnQgY3JlYXR1cmUgcmVjb3JkcyBmb3IgcmVzaWRlbnQgbmVhciBjaHVua3M6XG4vLyBzcGF3bmVkIGRldGVybWluaXN0aWNhbGx5IHdoZW4gYSBjaHVuayBsb2FkcywgZHJvcHBlZCB3aGVuIGl0IHVubG9hZHMsIGFuZFxuLy8gc3RlcHBlZCBhdCB0aGUgZml4ZWQgRkFVTkFfU1RFUCByYXRlLiBFYWNoIHNwZWNpZXMgaXMgb25lIGluc3RhbmNlZCBtZXNoXG4vLyB3aXRoIGFuIGFuaW1hdGVkIHJpZyAoc2VlIGFuaW1hbC1raXQudHMpLCBzbyBhIGZ1bGwgbmVhciByaW5nIG9mIHdpbGRsaWZlXG4vLyBjb3N0cyBmaXZlIGRyYXcgY2FsbHMuIFdpbGRsaWZlIGlzIHByZXNlbnRhdGlvbi10aWVyOiBub3Qgc2F2ZWQgb3Igam91cm5hbGVkLlxuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHsgV29ybGQgfSBmcm9tICcuLi9zaW0vd29ybGQnO1xuaW1wb3J0IHsgQ3JlYXR1cmUsIEZBVU5BX1NURVAsIEZhdW5hQ29udGV4dCwgU1BFQ0lFUywgc3Bhd25DaHVua0ZhdW5hLCBzdGVwQ3JlYXR1cmUgfSBmcm9tICcuLi9zaW0vZmF1bmEnO1xuaW1wb3J0IHsgQW5pbWFsQmF0Y2ggfSBmcm9tICcuL2FuaW1hbC1raXQnO1xuaW1wb3J0IHsgQU5JTUFMX01PREVMUyB9IGZyb20gJy4vYW5pbWFsLW1vZGVscyc7XG5pbXBvcnQgeyBQb3NlLCBibGVuZFBvc2UsIHN0ZXBBbHBoYSB9IGZyb20gJy4vc21vb3RoJztcblxudHlwZSBJZCA9IENyZWF0dXJlWydzcGVjaWVzJ107XG5jb25zdCBDQVA6IFJlY29yZDxJZCwgbnVtYmVyPiA9IHsgZGVlcjogNDgsIHJhYmJpdDogNDgsIHRyb3V0OiAxNjAsIGZveDogMjQsIHdvbGY6IDMyIH07XG5jb25zdCBJRFMgPSBPYmplY3Qua2V5cyhDQVApIGFzIElkW107XG5cbi8qKiBTdGFibGUgcGVyLWFuaW1hbCBjb2luIGZsaXAgKGFudGxlcnMgb24gc3RhZ3MsIGNvbWIgb24gY29ja3MpLiAqL1xuZnVuY3Rpb24gaXNNYWxlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgbGV0IGggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGlkLmxlbmd0aDsgaSsrKSBoID0gKE1hdGguaW11bChoLCAzMSkgKyBpZC5jaGFyQ29kZUF0KGkpKSB8IDA7XG4gIHJldHVybiAoaCAmIDEpID09PSAxO1xufVxuXG5leHBvcnQgY2xhc3MgRmF1bmFWaWV3IHtcbiAgcmVhZG9ubHkgZ3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBjcmVhdHVyZXMgPSBuZXcgTWFwPHN0cmluZywgQ3JlYXR1cmVbXT4oKTtcbiAgcHJpdmF0ZSBwaGFzZXMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICAvKiogUG9zZSBiZWZvcmUgdGhlIGxhdGVzdCBmaXhlZCBzdGVwLCBzbyBkcmF3aW5nIGNhbiBibGVuZCBiZXR3ZWVuIHN0ZXBzIChyZW5kZXIgb25seSkuICovXG4gIHByaXZhdGUgcHJldiA9IG5ldyBNYXA8c3RyaW5nLCBQb3NlPigpO1xuICBwcml2YXRlIHJlYWRvbmx5IHNob3duOiBQb3NlID0geyB4OiAwLCB5OiAwLCB6OiAwLCBoZWFkaW5nOiAwIH07XG4gIC8qKiBDaHVua3Mgd2hvc2UgY3JlYXR1cmVzIGFyZSBzcGF3bmVkIHBlciBmcmFtZTsgdGhlIHJlc3Qgd2FpdCBmb3IgdGhlIG5leHQgZnJhbWUuICovXG4gIHN0YXRpYyByZWFkb25seSBTUEFXTl9DSFVOS1NfUEVSX0ZSQU1FID0gMjtcbiAgcHJpdmF0ZSBhY2N1bXVsYXRvciA9IDA7XG4gIC8qKiBUcnVlIHdoaWxlIHN5bmMoKSBsZWZ0IGNodW5rcyB1bnNwYXduZWQ7IHRoZSBjYWxsZXIgc2hvdWxkIHN5bmMgYWdhaW4gbmV4dCBmcmFtZS4gKi9cbiAgcGVuZGluZ1NwYXduID0gZmFsc2U7XG4gIHByaXZhdGUgcmVhZG9ubHkgYmF0Y2hlcyA9IG5ldyBNYXA8SWQsIEFuaW1hbEJhdGNoPigpO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgd29ybGQ6IFdvcmxkKSB7XG4gICAgdGhpcy5ncm91cC5uYW1lID0gJ2ZhdW5hJztcbiAgICBmb3IgKGNvbnN0IGlkIG9mIElEUykge1xuICAgICAgY29uc3QgYiA9IG5ldyBBbmltYWxCYXRjaChBTklNQUxfTU9ERUxTW2lkXSwgQ0FQW2lkXSwgYGZhdW5hXyR7aWR9YCk7XG4gICAgICB0aGlzLmJhdGNoZXMuc2V0KGlkLCBiKTtcbiAgICAgIHRoaXMuZ3JvdXAuYWRkKGIubWVzaCk7XG4gICAgfVxuICB9XG5cbiAgLyoqIFJlY29uY2lsZSBjcmVhdHVyZSByZWNvcmRzIHdpdGggdGhlIHJlc2lkZW50IG5lYXItY2h1bmsgc2V0LiAqL1xuICBzeW5jKGxvYWRlZDogUmVhZG9ubHlTZXQ8c3RyaW5nPik6IHZvaWQge1xuICAgIGZvciAoY29uc3QgW2tleSwgbGlzdF0gb2YgWy4uLnRoaXMuY3JlYXR1cmVzXSkge1xuICAgICAgaWYgKGxvYWRlZC5oYXMoa2V5KSkgY29udGludWU7XG4gICAgICBmb3IgKGNvbnN0IGMgb2YgbGlzdCkgeyB0aGlzLnBoYXNlcy5kZWxldGUoYy5pZCk7IHRoaXMucHJldi5kZWxldGUoYy5pZCk7IH1cbiAgICAgIHRoaXMuY3JlYXR1cmVzLmRlbGV0ZShrZXkpO1xuICAgIH1cbiAgICBsZXQgc3Bhd25lZCA9IDA7XG4gICAgdGhpcy5wZW5kaW5nU3Bhd24gPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBsb2FkZWQpIHtcbiAgICAgIGlmICh0aGlzLmNyZWF0dXJlcy5oYXMoa2V5KSkgY29udGludWU7XG4gICAgICBpZiAoc3Bhd25lZCsrID49IEZhdW5hVmlldy5TUEFXTl9DSFVOS1NfUEVSX0ZSQU1FKSB7IHRoaXMucGVuZGluZ1NwYXduID0gdHJ1ZTsgYnJlYWs7IH1cbiAgICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgICB0aGlzLmNyZWF0dXJlcy5zZXQoa2V5LCBzcGF3bkNodW5rRmF1bmEodGhpcy53b3JsZCwgY3gsIGN6KSk7XG4gICAgfVxuICB9XG5cbiAgZ2V0IGNvdW50KCk6IG51bWJlciB7XG4gICAgbGV0IG4gPSAwO1xuICAgIGZvciAoY29uc3QgbGlzdCBvZiB0aGlzLmNyZWF0dXJlcy52YWx1ZXMoKSkgbiArPSBsaXN0Lmxlbmd0aDtcbiAgICByZXR1cm4gbjtcbiAgfVxuXG4gIGFsbCgpOiBDcmVhdHVyZVtdIHsgcmV0dXJuIFsuLi50aGlzLmNyZWF0dXJlcy52YWx1ZXMoKV0uZmxhdCgpOyB9XG5cbiAgdXBkYXRlKGR0OiBudW1iZXIsIGN0eDogRmF1bmFDb250ZXh0KTogdm9pZCB7XG4gICAgdGhpcy5hY2N1bXVsYXRvciA9IE1hdGgubWluKHRoaXMuYWNjdW11bGF0b3IgKyBkdCwgRkFVTkFfU1RFUCAqIDQpO1xuICAgIGlmICh0aGlzLmFjY3VtdWxhdG9yID49IEZBVU5BX1NURVApIHtcbiAgICAgIC8vIFJlbGF0aW9uc2hpcHMgYmV0d2VlbiBjcmVhdHVyZXMsIGdhdGhlcmVkIG9uY2UgcGVyIGZyYW1lLlxuICAgICAgY29uc3QgcHJlZGF0b3JzOiBBcnJheTx7IHNwZWNpZXM6IElkOyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICAgICAgY29uc3QgcHJleTogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICAgICAgY29uc3QgbGVhZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBDcmVhdHVyZT4oKTtcbiAgICAgIGZvciAoY29uc3QgbGlzdCBvZiB0aGlzLmNyZWF0dXJlcy52YWx1ZXMoKSkge1xuICAgICAgICBmb3IgKGNvbnN0IGMgb2YgbGlzdCkge1xuICAgICAgICAgIGlmIChjLnNwZWNpZXMgPT09ICdmb3gnIHx8IGMuc3BlY2llcyA9PT0gJ3dvbGYnKSBwcmVkYXRvcnMucHVzaCh7IHNwZWNpZXM6IGMuc3BlY2llcywgeDogYy54LCB6OiBjLnogfSk7XG4gICAgICAgICAgaWYgKGMuc3BlY2llcyA9PT0gJ3JhYmJpdCcpIHByZXkucHVzaCh7IHg6IGMueCwgejogYy56IH0pO1xuICAgICAgICAgIGlmIChjLnNwZWNpZXMgPT09ICd3b2xmJyAmJiAhYy5sZWFkZXIpIGxlYWRlcnMuc2V0KGMuaWQsIGMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBmdWxsOiBGYXVuYUNvbnRleHQgPSB7IC4uLmN0eCwgcHJlZGF0b3JzLCBwcmV5LCBsZWFkZXJzIH07XG4gICAgICB3aGlsZSAodGhpcy5hY2N1bXVsYXRvciA+PSBGQVVOQV9TVEVQKSB7XG4gICAgICAgIGZvciAoY29uc3QgbGlzdCBvZiB0aGlzLmNyZWF0dXJlcy52YWx1ZXMoKSkge1xuICAgICAgICAgIGZvciAoY29uc3QgYyBvZiBsaXN0KSB7XG4gICAgICAgICAgICBjb25zdCBwID0gdGhpcy5wcmV2LmdldChjLmlkKTtcbiAgICAgICAgICAgIGlmIChwKSB7IHAueCA9IGMueDsgcC55ID0gYy55OyBwLnogPSBjLno7IHAuaGVhZGluZyA9IGMuaGVhZGluZzsgfVxuICAgICAgICAgICAgZWxzZSB0aGlzLnByZXYuc2V0KGMuaWQsIHsgeDogYy54LCB5OiBjLnksIHo6IGMueiwgaGVhZGluZzogYy5oZWFkaW5nIH0pO1xuICAgICAgICAgICAgc3RlcENyZWF0dXJlKHRoaXMud29ybGQsIGMsIGZ1bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFjY3VtdWxhdG9yIC09IEZBVU5BX1NURVA7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMuZHJhdyhkdCk7XG4gIH1cblxuICBwcml2YXRlIGRyYXcoZHQ6IG51bWJlcik6IHZvaWQge1xuICAgIGZvciAoY29uc3QgYiBvZiB0aGlzLmJhdGNoZXMudmFsdWVzKCkpIGIuYmVnaW4oKTtcbiAgICBjb25zdCBub3cgPSBwZXJmb3JtYW5jZS5ub3coKSAvIDEwMDA7XG4gICAgY29uc3QgYWxwaGEgPSBzdGVwQWxwaGEodGhpcy5hY2N1bXVsYXRvciwgRkFVTkFfU1RFUCksIHNob3duID0gdGhpcy5zaG93bjtcbiAgICBmb3IgKGNvbnN0IGxpc3Qgb2YgdGhpcy5jcmVhdHVyZXMudmFsdWVzKCkpIHtcbiAgICAgIGZvciAoY29uc3QgYyBvZiBsaXN0KSB7XG4gICAgICAgIGNvbnN0IHNwID0gYy5zcGVjaWVzO1xuICAgICAgICBjb25zdCBiZWZvcmUgPSB0aGlzLnByZXYuZ2V0KGMuaWQpO1xuICAgICAgICBpZiAoYmVmb3JlKSBibGVuZFBvc2UoYmVmb3JlLCBjLCBhbHBoYSwgc2hvd24sIDMpO1xuICAgICAgICBlbHNlIHsgc2hvd24ueCA9IGMueDsgc2hvd24ueSA9IGMueTsgc2hvd24ueiA9IGMuejsgc2hvd24uaGVhZGluZyA9IGMuaGVhZGluZzsgfVxuICAgICAgICBjb25zdCBiYXRjaCA9IHRoaXMuYmF0Y2hlcy5nZXQoc3ApITtcbiAgICAgICAgY29uc3QgbW92aW5nID0gYy5zcGVlZCA+IDAuMDU7XG4gICAgICAgIGNvbnN0IHBoID0gKHRoaXMucGhhc2VzLmdldChjLmlkKSA/PyAwKSArIGR0ICogKG1vdmluZyA/IDMgKyBjLnNwZWVkICogKHNwID09PSAncmFiYml0JyA/IDQgOiBzcCA9PT0gJ3Ryb3V0JyA/IDggOiAyLjQpIDogMSk7XG4gICAgICAgIHRoaXMucGhhc2VzLnNldChjLmlkLCBwaCk7XG4gICAgICAgIGNvbnN0IGx5aW5nID0gKGMuYmVoYXZpb3VyID09PSAnc2xlZXAnIHx8IGMuYmVoYXZpb3VyID09PSAncmVzdCcpICYmIHNwICE9PSAndHJvdXQnO1xuICAgICAgICBjb25zdCBncmF6aW5nID0gYy5iZWhhdmlvdXIgPT09ICdncmF6ZSc7XG4gICAgICAgIGxldCBoZWFkID0gMCwgbGlmdCA9IDAsIHJvbGwgPSAwLCBwaXRjaCA9IDAsIHN3aW5nID0gbW92aW5nID8gTWF0aC5taW4oMC44NSwgMC4yNSArIGMuc3BlZWQgKiAwLjEpIDogMDtcbiAgICAgICAgaWYgKGdyYXppbmcpIGhlYWQgPSAwLjc1ICsgTWF0aC5zaW4obm93ICogMyArIGMueCkgKiAwLjE7XG4gICAgICAgIGVsc2UgaWYgKGx5aW5nKSBoZWFkID0gMC4zO1xuICAgICAgICBlbHNlIGlmIChjLmJlaGF2aW91ciA9PT0gJ3N0YWxrJykgeyBoZWFkID0gMC40NTsgc3dpbmcgPSAwLjM1OyB9XG4gICAgICAgIGVsc2UgaWYgKGMuYmVoYXZpb3VyID09PSAnY2hhc2UnIHx8IGMuYmVoYXZpb3VyID09PSAnZmxlZScpIGhlYWQgPSAtMC4xMjtcbiAgICAgICAgZWxzZSBpZiAoIW1vdmluZykgaGVhZCA9IE1hdGguc2luKG5vdyAqIDAuNyArIGMueikgKiAwLjA4O1xuICAgICAgICBpZiAoc3AgPT09ICdyYWJiaXQnICYmIG1vdmluZykgeyBsaWZ0ID0gTWF0aC5hYnMoTWF0aC5zaW4ocGgpKSAqIDAuMTg7IHN3aW5nID0gMC45OyB9XG4gICAgICAgIGlmIChzcCA9PT0gJ2RlZXInICYmIGMuc3BlZWQgPiAzKSBsaWZ0ID0gTWF0aC5hYnMoTWF0aC5zaW4ocGgpKSAqIDAuMTU7XG4gICAgICAgIGlmIChzcCA9PT0gJ3Ryb3V0JykgeyByb2xsID0gTWF0aC5zaW4ocGggKiAxLjUpICogMC4wNTsgc3dpbmcgPSAwOyB9XG4gICAgICAgIGJhdGNoLnB1c2goe1xuICAgICAgICAgIHg6IHNob3duLngsIHk6IHNob3duLnkgKyBsaWZ0LCB6OiBzaG93bi56LCBoZWFkaW5nOiBzaG93bi5oZWFkaW5nLCBzY2FsZTogMSxcbiAgICAgICAgICBwaGFzZTogcGgsIGxlZ1N3aW5nOiBzd2luZywgaGVhZFBpdGNoOiBoZWFkLFxuICAgICAgICAgIHRhaWxXYWc6IHNwID09PSAndHJvdXQnID8gKG1vdmluZyAmJiBjLnNwZWVkID4gMSA/IDAuNTUgOiAwLjMpIDogc3AgPT09ICdmb3gnIHx8IHNwID09PSAnd29sZicgPyAobHlpbmcgPyAwLjA1IDogMC4zKSA6IDAuMTUsXG4gICAgICAgICAgbWFsZTogaXNNYWxlKGMuaWQpLCB5b3VuZzogZmFsc2UsIGx5aW5nLCBleHRyYTogMSwgcGl0Y2gsIHJvbGwsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGIgb2YgdGhpcy5iYXRjaGVzLnZhbHVlcygpKSBiLmVuZCgpO1xuICB9XG5cbiAgbWV0cmljcygpOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7IHRvdGFsOiAwIH07XG4gICAgZm9yIChjb25zdCBjIG9mIHRoaXMuYWxsKCkpIHsgb3V0W2Muc3BlY2llc10gPSAob3V0W2Muc3BlY2llc10gPz8gMCkgKyAxOyBvdXQudG90YWwrKzsgfVxuICAgIHJldHVybiBvdXQ7XG4gIH1cbn1cblxuZXhwb3J0IHsgU1BFQ0lFUyB9O1xuIiwgIi8vIEJsb2NrLWJ1aWx0IGFuaW1hbHMgdGhhdCBtb3ZlLCBpbiBvbmUgaW5zdGFuY2VkIGRyYXcgY2FsbCBwZXIgc3BlY2llcy5cbi8vXG4vLyBBIG1vZGVsIGlzIGEgbGlzdCBvZiBib3hlcy4gRWFjaCBib3ggYmVsb25ncyB0byBhICpwYXJ0KiAoYm9keSwgbGVnLCBoZWFkLFxuLy8gdGFpbCwgd2luZywgd29vbCkgd2l0aCBhIHBpdm90LiBBIHNtYWxsIHZlcnRleC1zaGFkZXIgcGF0Y2ggc3dpbmdzIGxlZ3Ncbi8vIGFib3V0IHRoZSBoaXAsIHRpcHMgdGhlIGhlYWQgYWJvdXQgdGhlIG5lY2ssIHdhZ3MgdGhlIHRhaWwsIGZsYXBzIHdpbmdzIGFuZFxuLy8gc2NhbGVzIHdvb2wsIGFsbCBkcml2ZW4gYnkgdHdvIHBlci1pbnN0YW5jZSB2ZWM0cywgc28gYSB3aG9sZSBoZXJkIGFuaW1hdGVzXG4vLyB3aXRob3V0IHBlci1mcmFtZSBnZW9tZXRyeSB3b3JrIGFuZCB3aXRob3V0IGV4dHJhIGRyYXcgY2FsbHMuXG4vL1xuLy8gUGFydCBpZHMgKGFkZCAxMCB0byBtYWtlIGEgcGFydCBhcHBlYXIgb24gbWFsZXMgb25seTogaG9ybnMsIGFudGxlcnMsIGNvbWJzKTpcbi8vICAgMCBib2R5ICAgMSBsZWcgc2V0IEEgICAyIGxlZyBzZXQgQiAgIDMgaGVhZCAgIDQgdGFpbCAgIDYgd2luZyAgIDcgd29vbFxuLy8gSW5zdGFuY2UgZGF0YTpcbi8vICAgaUFuaW0gID0gKGdhaXQgcGhhc2UsIGxlZyBzd2luZywgaGVhZCBwaXRjaCAoKyA9IG5vc2UgZG93biksIHRhaWwgd2FnKVxuLy8gICBpU3RhdGUgPSAobWFsZSwgeW91bmcsIGx5aW5nLCB3aW5nIGZsYXAgLyB3b29sIGZ1bGxuZXNzKVxuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHsgbWVyZ2VHZW9tZXRyaWVzIH0gZnJvbSAndGhyZWUvZXhhbXBsZXMvanNtL3V0aWxzL0J1ZmZlckdlb21ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHBhbGV0dGUgZnJvbSAnLi4vZGF0YS9wYWxldHRlLmpzb24nO1xuXG5jb25zdCBNID0gcGFsZXR0ZS5tYXRlcmlhbHMgYXMgUmVjb3JkPHN0cmluZywgeyBoZXg6IHN0cmluZyB9PjtcbmNvbnN0IGNvbG91ciA9IChrOiBzdHJpbmcpID0+IG5ldyBUSFJFRS5Db2xvcihrLnN0YXJ0c1dpdGgoJyMnKSA/IGsgOiBNW2tdLmhleCk7XG5cbmV4cG9ydCBjb25zdCBQQVJUID0geyBib2R5OiAwLCBsZWdBOiAxLCBsZWdCOiAyLCBoZWFkOiAzLCB0YWlsOiA0LCB3aW5nOiA2LCB3b29sOiA3LCBtYWxlOiAxMCB9IGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIEFCb3gge1xuICB3OiBudW1iZXI7IGg6IG51bWJlcjsgZDogbnVtYmVyO1xuICAvKiogQm94IGNlbnRyZSAobWV0cmVzOyAreiBmb3J3YXJkLCB5IHVwLCBncm91bmQgYXQgMCkuICovXG4gIHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7XG4gIGM6IHN0cmluZztcbiAgcGFydD86IG51bWJlcjtcbiAgcGl2b3Q/OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG4gIHJ4PzogbnVtYmVyOyByeT86IG51bWJlcjsgcno/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBieCh3OiBudW1iZXIsIGg6IG51bWJlciwgZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBjOiBzdHJpbmcsXG4gIHBhcnQ6IG51bWJlciA9IFBBUlQuYm9keSwgcGl2b3Q/OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sIHJvdD86IHsgcng/OiBudW1iZXI7IHJ5PzogbnVtYmVyOyByej86IG51bWJlciB9KTogQUJveCB7XG4gIHJldHVybiB7IHcsIGgsIGQsIHgsIHksIHosIGMsIHBhcnQsIHBpdm90LCAuLi5yb3QgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBbmltYWxNb2RlbCB7XG4gIGlkOiBzdHJpbmc7XG4gIGJveGVzOiBBQm94W107XG4gIC8qKiBIaXAgaGVpZ2h0OiBhIGx5aW5nIGFuaW1hbCBsb3dlcnMgaXRzIGJvZHkgYnkgbW9zdCBvZiB0aGlzLiAqL1xuICBsZWdMZW46IG51bWJlcjtcbiAgLyoqIFRpbnQgYSB5b3VuZyBhbmltYWwgdG93YXJkcyB0aGlzIGNvbG91ciAoY2hpY2tzIGFyZSB5ZWxsb3cpLiAqL1xuICB5b3VuZ1RpbnQ/OiBzdHJpbmc7XG59XG5cbi8qKiBNZXJnZSB0aGUgYm94ZXMgaW50byBvbmUgZ2VvbWV0cnkgd2l0aCBwZXItdmVydGV4IGNvbG91ciBhbmQgcGFydCBkYXRhLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkQW5pbWFsR2VvbWV0cnkobW9kZWw6IEFuaW1hbE1vZGVsKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xuICBjb25zdCBnZW9zID0gbW9kZWwuYm94ZXMubWFwKChiKSA9PiB7XG4gICAgY29uc3QgZyA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShiLncsIGIuaCwgYi5kKS50b05vbkluZGV4ZWQoKTtcbiAgICBpZiAoYi5yeCB8fCBiLnJ5IHx8IGIucnopIGcuYXBwbHlNYXRyaXg0KG5ldyBUSFJFRS5NYXRyaXg0KCkubWFrZVJvdGF0aW9uRnJvbUV1bGVyKG5ldyBUSFJFRS5FdWxlcihiLnJ4ID8/IDAsIGIucnkgPz8gMCwgYi5yeiA/PyAwKSkpO1xuICAgIGcudHJhbnNsYXRlKGIueCwgYi55LCBiLnopO1xuICAgIGcuZGVsZXRlQXR0cmlidXRlKCd1dicpO1xuICAgIGNvbnN0IGNvbCA9IGNvbG91cihiLmMpLCBuID0gZy5hdHRyaWJ1dGVzLnBvc2l0aW9uLmNvdW50O1xuICAgIGNvbnN0IGNvbG9ycyA9IG5ldyBGbG9hdDMyQXJyYXkobiAqIDMpLCByaWcgPSBuZXcgRmxvYXQzMkFycmF5KG4gKiA0KTtcbiAgICBjb25zdCBwdiA9IGIucGl2b3QgPz8gW2IueCwgYi55LCBiLnpdO1xuICAgIGNvbnN0IG5vcm1hbHMgPSBnLmF0dHJpYnV0ZXMubm9ybWFsO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICBjb25zdCBueSA9IG5vcm1hbHMuZ2V0WShpKTtcbiAgICAgIGNvbnN0IGsgPSBueSA+IDAuNSA/IDEgOiBueSA8IC0wLjUgPyAwLjc0IDogMC44ODtcbiAgICAgIGNvbG9yc1tpICogM10gPSBjb2wuciAqIGs7IGNvbG9yc1tpICogMyArIDFdID0gY29sLmcgKiBrOyBjb2xvcnNbaSAqIDMgKyAyXSA9IGNvbC5iICogaztcbiAgICAgIHJpZ1tpICogNF0gPSBwdlswXTsgcmlnW2kgKiA0ICsgMV0gPSBwdlsxXTsgcmlnW2kgKiA0ICsgMl0gPSBwdlsyXTsgcmlnW2kgKiA0ICsgM10gPSBiLnBhcnQgPz8gMDtcbiAgICB9XG4gICAgZy5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShjb2xvcnMsIDMpKTtcbiAgICBnLnNldEF0dHJpYnV0ZSgnYVJpZycsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUocmlnLCA0KSk7XG4gICAgcmV0dXJuIGc7XG4gIH0pO1xuICBjb25zdCBtZXJnZWQgPSBtZXJnZUdlb21ldHJpZXMoZ2VvcykhO1xuICBmb3IgKGNvbnN0IGcgb2YgZ2VvcykgZy5kaXNwb3NlKCk7XG4gIHJldHVybiBtZXJnZWQ7XG59XG5cbmNvbnN0IFZFUlRFWF9IRUFEID0gLyogZ2xzbCAqL2BcbmF0dHJpYnV0ZSB2ZWM0IGFSaWc7XG5hdHRyaWJ1dGUgdmVjNCBpQW5pbTtcbmF0dHJpYnV0ZSB2ZWM0IGlTdGF0ZTtcbnZlYzMgcm90WCh2ZWMzIHAsIHZlYzMgYywgZmxvYXQgYSkgeyBmbG9hdCBzID0gc2luKGEpLCBrID0gY29zKGEpOyB2ZWMzIGQgPSBwIC0gYzsgcmV0dXJuIGMgKyB2ZWMzKGQueCwgZC55ICogayAtIGQueiAqIHMsIGQueSAqIHMgKyBkLnogKiBrKTsgfVxudmVjMyByb3RZKHZlYzMgcCwgdmVjMyBjLCBmbG9hdCBhKSB7IGZsb2F0IHMgPSBzaW4oYSksIGsgPSBjb3MoYSk7IHZlYzMgZCA9IHAgLSBjOyByZXR1cm4gYyArIHZlYzMoZC54ICogayArIGQueiAqIHMsIGQueSwgLWQueCAqIHMgKyBkLnogKiBrKTsgfVxudmVjMyByb3RaKHZlYzMgcCwgdmVjMyBjLCBmbG9hdCBhKSB7IGZsb2F0IHMgPSBzaW4oYSksIGsgPSBjb3MoYSk7IHZlYzMgZCA9IHAgLSBjOyByZXR1cm4gYyArIHZlYzMoZC54ICogayAtIGQueSAqIHMsIGQueCAqIHMgKyBkLnkgKiBrLCBkLnopOyB9XG5gO1xuXG5jb25zdCBWRVJURVhfQk9EWSA9IC8qIGdsc2wgKi9gXG52ZWMzIHRyYW5zZm9ybWVkID0gdmVjMyggcG9zaXRpb24gKTtcbntcbiAgdmVjMyBwdiA9IGFSaWcueHl6O1xuICBmbG9hdCBtYWxlID0gc3RlcCg5LjUsIGFSaWcudyk7XG4gIGZsb2F0IHBhcnQgPSBhUmlnLncgLSAxMC4wICogbWFsZTtcbiAgZmxvYXQgc3dpbmcgPSBzaW4oaUFuaW0ueCkgKiBpQW5pbS55O1xuICBpZiAobWFsZSA+IDAuNSAmJiBpU3RhdGUueCA8IDAuNSkge1xuICAgIHRyYW5zZm9ybWVkID0gcHY7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5vdCBvbiB0aGlzIGFuaW1hbFxuICB9IGVsc2UgaWYgKHBhcnQgPiAwLjUgJiYgcGFydCA8IDIuNSkgeyAgICAgICAgICAgICAgIC8vIGxlZ3M6IGZvbGQgd2hlbiBseWluZywgdGhlbiBzd2luZyBhYm91dCB0aGUgaGlwXG4gICAgdHJhbnNmb3JtZWQueSA9IHB2LnkgKyAodHJhbnNmb3JtZWQueSAtIHB2LnkpICogbWl4KDEuMCwgMC4zLCBpU3RhdGUueik7XG4gICAgdHJhbnNmb3JtZWQgPSByb3RYKHRyYW5zZm9ybWVkLCBwdiwgcGFydCA8IDEuNSA/IHN3aW5nIDogLXN3aW5nKTtcbiAgfSBlbHNlIGlmIChwYXJ0ID4gMi41ICYmIHBhcnQgPCAzLjUpIHsgICAgICAgICAgICAgICAvLyBoZWFkOiBiaWdnZXIgb24gdGhlIHlvdW5nLCB0aXBzIGFib3V0IHRoZSBuZWNrXG4gICAgdHJhbnNmb3JtZWQgPSBwdiArICh0cmFuc2Zvcm1lZCAtIHB2KSAqICgxLjAgKyAwLjMgKiBpU3RhdGUueSk7XG4gICAgdHJhbnNmb3JtZWQgPSByb3RYKHRyYW5zZm9ybWVkLCBwdiwgaUFuaW0ueik7XG4gIH0gZWxzZSBpZiAocGFydCA+IDMuNSAmJiBwYXJ0IDwgNC41KSB7ICAgICAgICAgICAgICAgLy8gdGFpbFxuICAgIHRyYW5zZm9ybWVkID0gcm90WSh0cmFuc2Zvcm1lZCwgcHYsIHNpbihpQW5pbS54ICogMC44KSAqIGlBbmltLncpO1xuICB9IGVsc2UgaWYgKHBhcnQgPiA1LjUgJiYgcGFydCA8IDYuNSkgeyAgICAgICAgICAgICAgIC8vIHdpbmdzIGZsYXAgYWJvdXQgdGhlIHNob3VsZGVyXG4gICAgdHJhbnNmb3JtZWQgPSByb3RaKHRyYW5zZm9ybWVkLCBwdiwgaVN0YXRlLncgKiBzaW4oaUFuaW0ueCAqIDMuMCkgKiBzaWduKHB2LngpICogMC45KTtcbiAgfSBlbHNlIGlmIChwYXJ0ID4gNi41ICYmIHBhcnQgPCA3LjUpIHsgICAgICAgICAgICAgICAvLyB3b29sIHRoaW5zIGFmdGVyIHNoZWFyaW5nXG4gICAgdHJhbnNmb3JtZWQgPSBwdiArICh0cmFuc2Zvcm1lZCAtIHB2KSAqIG1peCgwLjcsIDEuMCwgaVN0YXRlLncpO1xuICB9XG59XG4jaWZkZWYgVVNFX0NPTE9SXG4gICNpZmRlZiBZT1VOR19USU5UXG4gICAgdkNvbG9yLnJnYiA9IG1peCh2Q29sb3IucmdiLCBZT1VOR19USU5ULCBpU3RhdGUueSAqIDAuOSk7XG4gICNlbmRpZlxuI2VuZGlmXG5gO1xuXG4vKiogT25lIHNoYXJlZCBsb29rIGZvciBldmVyeSBhbmltYWw6IGZsYXQtc2hhZGVkIHZlcnRleCBjb2xvdXJzIHBsdXMgdGhlIHJpZyBwYXRjaC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhbmltYWxNYXRlcmlhbCh5b3VuZ1RpbnQ/OiBzdHJpbmcpOiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsIHtcbiAgY29uc3QgbWF0ID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoeyB2ZXJ0ZXhDb2xvcnM6IHRydWUsIGZsYXRTaGFkaW5nOiB0cnVlIH0pO1xuICBpZiAoeW91bmdUaW50KSB7XG4gICAgY29uc3QgdCA9IGNvbG91cih5b3VuZ1RpbnQpO1xuICAgIG1hdC5kZWZpbmVzID0geyBZT1VOR19USU5UOiBgdmVjMygke3Quci50b0ZpeGVkKDMpfSwgJHt0LmcudG9GaXhlZCgzKX0sICR7dC5iLnRvRml4ZWQoMyl9KWAgfTtcbiAgfVxuICBtYXQub25CZWZvcmVDb21waWxlID0gKHNoYWRlcikgPT4ge1xuICAgIHNoYWRlci52ZXJ0ZXhTaGFkZXIgPSBzaGFkZXIudmVydGV4U2hhZGVyXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCBgI2luY2x1ZGUgPGNvbW1vbj5cXG4ke1ZFUlRFWF9IRUFEfWApXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD4nLCBWRVJURVhfQk9EWSk7XG4gIH07XG4gIG1hdC5jdXN0b21Qcm9ncmFtQ2FjaGVLZXkgPSAoKSA9PiBgYW5pbWFsLXJpZy0ke3lvdW5nVGludCA/PyAnbm9uZSd9YDtcbiAgcmV0dXJuIG1hdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBbmltYWxQb3NlIHtcbiAgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgaGVhZGluZzogbnVtYmVyOyBzY2FsZTogbnVtYmVyO1xuICBwaGFzZTogbnVtYmVyOyBsZWdTd2luZzogbnVtYmVyOyBoZWFkUGl0Y2g6IG51bWJlcjsgdGFpbFdhZzogbnVtYmVyO1xuICBtYWxlOiBib29sZWFuOyB5b3VuZzogYm9vbGVhbjsgbHlpbmc6IGJvb2xlYW47XG4gIC8qKiBXaW5nIGZsYXAgYW1vdW50IChiaXJkcykgb3Igd29vbCBmdWxsbmVzcyAwLi4xIChzaGVlcCkuICovXG4gIGV4dHJhOiBudW1iZXI7XG4gIHBpdGNoPzogbnVtYmVyOyByb2xsPzogbnVtYmVyO1xufVxuXG4vKiogQWxsIGluc3RhbmNlcyBvZiBvbmUgc3BlY2llczogb25lIEluc3RhbmNlZE1lc2gsIG9uZSBkcmF3IGNhbGwuICovXG5leHBvcnQgY2xhc3MgQW5pbWFsQmF0Y2gge1xuICByZWFkb25seSBtZXNoOiBUSFJFRS5JbnN0YW5jZWRNZXNoO1xuICByZWFkb25seSBtb2RlbDogQW5pbWFsTW9kZWw7XG4gIHByaXZhdGUgcmVhZG9ubHkgYW5pbTogVEhSRUUuSW5zdGFuY2VkQnVmZmVyQXR0cmlidXRlO1xuICBwcml2YXRlIHJlYWRvbmx5IHN0YXRlOiBUSFJFRS5JbnN0YW5jZWRCdWZmZXJBdHRyaWJ1dGU7XG4gIHByaXZhdGUgbiA9IDA7XG4gIHByaXZhdGUgcmVhZG9ubHkgbSA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgcSA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgZSA9IG5ldyBUSFJFRS5FdWxlcigpO1xuICBwcml2YXRlIHJlYWRvbmx5IHYgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICBwcml2YXRlIHJlYWRvbmx5IHMgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuXG4gIGNvbnN0cnVjdG9yKG1vZGVsOiBBbmltYWxNb2RlbCwgcmVhZG9ubHkgY2FwYWNpdHk6IG51bWJlciwgbmFtZTogc3RyaW5nKSB7XG4gICAgdGhpcy5tb2RlbCA9IG1vZGVsO1xuICAgIGNvbnN0IGdlbyA9IGJ1aWxkQW5pbWFsR2VvbWV0cnkobW9kZWwpO1xuICAgIHRoaXMuYW5pbSA9IG5ldyBUSFJFRS5JbnN0YW5jZWRCdWZmZXJBdHRyaWJ1dGUobmV3IEZsb2F0MzJBcnJheShjYXBhY2l0eSAqIDQpLCA0KTtcbiAgICB0aGlzLnN0YXRlID0gbmV3IFRIUkVFLkluc3RhbmNlZEJ1ZmZlckF0dHJpYnV0ZShuZXcgRmxvYXQzMkFycmF5KGNhcGFjaXR5ICogNCksIDQpO1xuICAgIHRoaXMuYW5pbS5zZXRVc2FnZShUSFJFRS5EeW5hbWljRHJhd1VzYWdlKTtcbiAgICB0aGlzLnN0YXRlLnNldFVzYWdlKFRIUkVFLkR5bmFtaWNEcmF3VXNhZ2UpO1xuICAgIGdlby5zZXRBdHRyaWJ1dGUoJ2lBbmltJywgdGhpcy5hbmltKTtcbiAgICBnZW8uc2V0QXR0cmlidXRlKCdpU3RhdGUnLCB0aGlzLnN0YXRlKTtcbiAgICB0aGlzLm1lc2ggPSBuZXcgVEhSRUUuSW5zdGFuY2VkTWVzaChnZW8sIGFuaW1hbE1hdGVyaWFsKG1vZGVsLnlvdW5nVGludCksIGNhcGFjaXR5KTtcbiAgICB0aGlzLm1lc2gubmFtZSA9IG5hbWU7XG4gICAgdGhpcy5tZXNoLmNvdW50ID0gMDtcbiAgICB0aGlzLm1lc2guY2FzdFNoYWRvdyA9IHRydWU7XG4gICAgdGhpcy5tZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xuICAgIHRoaXMubWVzaC5mcnVzdHVtQ3VsbGVkID0gZmFsc2U7XG4gIH1cblxuICBiZWdpbigpOiB2b2lkIHsgdGhpcy5uID0gMDsgfVxuXG4gIHB1c2gocDogQW5pbWFsUG9zZSk6IGJvb2xlYW4ge1xuICAgIGlmICh0aGlzLm4gPj0gdGhpcy5jYXBhY2l0eSkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGkgPSB0aGlzLm4rKztcbiAgICBjb25zdCBsaWUgPSBwLmx5aW5nID8gMSA6IDA7XG4gICAgdGhpcy5lLnNldChwLnBpdGNoID8/IDAsIHAuaGVhZGluZywgcC5yb2xsID8/IDAsICdZWFonKTtcbiAgICB0aGlzLnEuc2V0RnJvbUV1bGVyKHRoaXMuZSk7XG4gICAgdGhpcy52LnNldChwLngsIHAueSAtIGxpZSAqIHRoaXMubW9kZWwubGVnTGVuICogMC43ICogcC5zY2FsZSwgcC56KTtcbiAgICB0aGlzLnMuc2V0KHAuc2NhbGUsIHAuc2NhbGUsIHAuc2NhbGUpO1xuICAgIHRoaXMubWVzaC5zZXRNYXRyaXhBdChpLCB0aGlzLm0uY29tcG9zZSh0aGlzLnYsIHRoaXMucSwgdGhpcy5zKSk7XG4gICAgdGhpcy5hbmltLnNldFhZWlcoaSwgcC5waGFzZSwgcC5sZWdTd2luZywgcC5oZWFkUGl0Y2gsIHAudGFpbFdhZyk7XG4gICAgdGhpcy5zdGF0ZS5zZXRYWVpXKGksIHAubWFsZSA/IDEgOiAwLCBwLnlvdW5nID8gMSA6IDAsIGxpZSwgcC5leHRyYSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBlbmQoKTogdm9pZCB7XG4gICAgdGhpcy5tZXNoLmNvdW50ID0gdGhpcy5uO1xuICAgIHRoaXMubWVzaC52aXNpYmxlID0gdGhpcy5uID4gMDtcbiAgICAvLyBVcGxvYWQgb25seSB0aGUgaW5zdGFuY2VzIGluIHVzZSwgbm90IHRoZSB3aG9sZSBjYXBhY2l0eS5cbiAgICBmb3IgKGNvbnN0IFthLCBzdHJpZGVdIG9mIFtbdGhpcy5tZXNoLmluc3RhbmNlTWF0cml4LCAxNl0sIFt0aGlzLmFuaW0sIDRdLCBbdGhpcy5zdGF0ZSwgNF1dIGFzIGNvbnN0KSB7XG4gICAgICBhLmNsZWFyVXBkYXRlUmFuZ2VzKCk7XG4gICAgICBpZiAodGhpcy5uID4gMCkgYS5hZGRVcGRhdGVSYW5nZSgwLCB0aGlzLm4gKiBzdHJpZGUpO1xuICAgICAgYS5uZWVkc1VwZGF0ZSA9IHRoaXMubiA+IDA7XG4gICAgfVxuICB9XG5cbiAgZ2V0IGNvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm47IH1cbn1cbiIsICJ7XG4gIFwic2NoZW1hXCI6IFwicGFsZXR0ZV92MlwiLFxuICBcImRhdGVcIjogXCIyMDI2LTEwLTIyXCIsXG4gIFwic3RhdHVzXCI6IFwicHJvcG9zZWRcIixcbiAgXCJzb3VyY2VcIjogXCJSRUYtMDAyIChoeWJyaWQgd29ybGQgcmVmZXJlbmNlKSwgdmFsdWVzIHNhbXBsZWQgYnkgZXllOyBudW1lcmljIHZlcmlmaWNhdGlvbiBwZW5kaW5nXCIsXG4gIFwibm90ZVwiOiBcIk9uZSBtYXRlcmlhbCBwYWxldHRlLiBUaW1lIG9mIGRheSBpcyBleHByZXNzZWQgYnkgdGhlIGxpZ2h0aW5nIHByZXNldHMgYmVsb3csIG5vdCBieSByZXBhaW50aW5nIG1hdGVyaWFscy5cIixcbiAgXCJtYXRlcmlhbHNcIjoge1xuICAgIFwiZ3Jhc3NfdG9wXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzc5Qjk0Q1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGxvdyBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19oaWdoXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhGQzk1RVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIG1pZCBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19wZWFrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlBRDA2QVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGhpZ2ggZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfY2FwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVFOTQ0MFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuMC0wLjQgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfb2NocmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQzk5QTVGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC40LTAuNjIgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfcnVzdFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCNDYzM0NcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjYyLTAuODAgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdG9uZV90b3BcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZERkNDXCIsXG4gICAgICBcInJvbGVcIjogXCJiYXJlIHN0b25lIHRvcCBzdXJmYWNlXCJcbiAgICB9LFxuICAgIFwic3RvbmVfYm9keV9hXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0RDRDNCRVwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBib2R5LCBldmVuIDQuNSBtIGJhbmRcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9ib2R5X2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDFDN0FGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJvZHksIG9kZCA0LjUgbSBiYW5kXCJcbiAgICB9LFxuICAgIFwic3RvbmVfc2hhZGVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjlBRTk2XCIsXG4gICAgICBcInJvbGVcIjogXCJjcmV2aWNlIC8gcmVjZXNzZWQgc3RvbmUgYWNjZW50XCJcbiAgICB9LFxuICAgIFwic2FuZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFM0QzQTZcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlIGNlbGxzXCJcbiAgICB9LFxuICAgIFwic25vd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNFRUYxRjVcIixcbiAgICAgIFwicm9sZVwiOiBcImdlbmVyYXRvciB2MiBzbm93ZmllbGRzIGFib3ZlIHRoZSBzbm93bGluZSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfc2tpblwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEOUE3N0VcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBza2luIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90dW5pY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNCMzRBM0NcIixcbiAgICAgIFwicm9sZVwiOiBcImZvdW5kZXIgdHVuaWMsIHdhcm0gcmVkIGFjY2VudCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfdHVuaWNfYWx0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJFOEM4NlwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZXIgdHVuaWMsIHRlYWwgYWNjZW50IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90cm91c2Vyc1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM1QjQ2MzZcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciB0cm91c2VycyAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfaGFpclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM0QTMzMjRcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBoYWlyIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9ib290c1wiOiB7XG4gICAgICBcImhleFwiOiBcIiMzMzI4MUZcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBib290cyBhbmQgYmVsdCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX2RlZXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEM1QjNBXCIsXG4gICAgICBcInJvbGVcIjogXCJyZWQgZGVlciBjb2F0IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfbGlnaHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRENDN0E0XCIsXG4gICAgICBcInJvbGVcIjogXCJkZWVyIGJlbGx5LCBoYXJlIHRhaWwsIGFudGxlciAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX2hhcmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUE4NjcwXCIsXG4gICAgICBcInJvbGVcIjogXCJoYXJlIGNvYXQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV90cm91dFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2RjdGNUVcIixcbiAgICAgIFwicm9sZVwiOiBcInRyb3V0IGJhY2sgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV90cm91dF9iZWxseVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEOEM5QTNcIixcbiAgICAgIFwicm9sZVwiOiBcInRyb3V0IGJlbGx5IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF9wbGFzdGVyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U4RERDNlwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSB3YWxsIHBsYXN0ZXIgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RpbWJlclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2QTQ1MzBcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgdGltYmVyIGZyYW1lIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aW1iZXJfbGlnaHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEE2MTQyXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIHBsYW5rcyBhbmQgZG9vcnMgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RoYXRjaFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNDN0EyNTdcIixcbiAgICAgIFwicm9sZVwiOiBcInRoYXRjaCByb29mIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aGF0Y2hfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QzdCM0NcIixcbiAgICAgIFwicm9sZVwiOiBcInRoYXRjaCByb29mIHNoYWRlIGNvdXJzZSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfc3RvbmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUI5QTkxXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIG1hc29ucnkgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3N0b25lX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNzQ3MzZDXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIG1hc29ucnkgam9pbnRzIGFuZCBwbGludGggKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJwcm9wX2lyb25cIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0EzQTNGXCIsXG4gICAgICBcInJvbGVcIjogXCJpcm9uIGZpdHRpbmdzIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwicHJvcF9nbG93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0ZGRDI3RlwiLFxuICAgICAgXCJyb2xlXCI6IFwibGFudGVybiBsaWdodCAoZW1pc3NpdmUsIGVmZmVjdCBvbmx5KSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcIndhdGVyX3NoYWxsb3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNjdDRkQ4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA8PSAwLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX21pZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzQUFGQzRcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoIH4xLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX2RlZXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkE4RkE4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA+PSA0LjAgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX3JpbVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCRkVBRjBcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlbGluZSByaW0gLyBmb2FtIHRpbnRcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fYVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1RkE4M0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGQjg0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM3RkMzNTZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgaGlnaGxpZ2h0IG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfcGlua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNGMkE2QzRcIixcbiAgICAgIFwicm9sZVwiOiBcImJsb3Nzb20gYWNjZW50IHNwZWNpZXMgb25seVwiXG4gICAgfSxcbiAgICBcImNhbm9weV9waW5rX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTg4RkIyXCIsXG4gICAgICBcInJvbGVcIjogXCJibG9zc29tIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJ0cnVua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM2QjRBMzNcIixcbiAgICAgIFwicm9sZVwiOiBcInRyZWUgdHJ1bmtzXCJcbiAgICB9LFxuICAgIFwiYmFya19kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRFMzYyNlwiLFxuICAgICAgXCJyb2xlXCI6IFwidHJ1bmsgc2hhZGUsIHN0dW1wc1wiXG4gICAgfSxcbiAgICBcIm9yZV9jcnlzdGFsXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzdCNUFENlwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGRlcG9zaXQgYWNjZW50IChwcm9wb3NlZCwgcmVwbGFjZXMgdGVhbClcIlxuICAgIH0sXG4gICAgXCJvcmVfY3J5c3RhbF9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlCN0JFOFwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGhpZ2hsaWdodCBmYWNldFwiXG4gICAgfSxcbiAgICBcIm5veGVsX3N0b25lXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2REZDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgYXJjaGl0ZWN0dXJlIG1haW4gc3RvbmVcIlxuICAgIH0sXG4gICAgXCJub3hlbF9zdG9uZV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QzQzlCNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgc2Vjb25kYXJ5IHN0b25lIC8gcmVjZXNzXCJcbiAgICB9LFxuICAgIFwiYWNjZW50X2JsdWVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0U3RkI4XCIsXG4gICAgICBcInJvbGVcIjogXCJiYW5uZXIgLyBjbG90aCBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJhY2NlbnRfdGVhbFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyRkE2QTBcIixcbiAgICAgIFwicm9sZVwiOiBcInNlY29uZGFyeSBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJlbWlzc2l2ZV9maXJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0ZGOUU0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2FtcGZpcmUgLyB3YXJtIGVtaXNzaXZlIChlZmZlY3RzIG9ubHkpXCJcbiAgICB9LFxuICAgIFwiZW1pc3NpdmVfbWFnaWNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDI0QkZGXCIsXG4gICAgICBcInJvbGVcIjogXCJyZXNlcnZlZDogbWFnaWMgZWZmZWN0cyBvbmx5LCBuZXZlciBtYXRlcmlhbHNcIlxuICAgIH1cbiAgfSxcbiAgXCJsaWdodGluZ1wiOiB7XG4gICAgXCJkYXduXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDEyLFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDEwNSxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZDNzlBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAyLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEZBNkM4XCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNEU1RjZFXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMC42LFxuICAgICAgXCJza3lcIjogXCIjQThCRUQ2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNBOEJFRDZcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNSxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4xXG4gICAgfSxcbiAgICBcIm5vb25cIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogMzgsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogNTAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGRjREQ1wiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMi43NSxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiNCRkQ5RjJcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM3QThGNTVcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAwLjU1LFxuICAgICAgXCJza3lcIjogXCIjOUVEMkVFXCIsXG4gICAgICBcImZvZ1wiOiBcIiNEQ0VGRjhcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMjgsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMDVcbiAgICB9LFxuICAgIFwiZHVza1wiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiA5LFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDI1MCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZCMjdBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAzLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEU3QzlFXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNUE0QTUwXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMS4xLFxuICAgICAgXCJza3lcIjogXCIjQzk4RTg2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNDMDkwOEFcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMzYsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMzJcbiAgICB9LFxuICAgIFwibmlnaHRcIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogNDAsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMjIwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNBRkM4RkZcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDEuMCxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiMzQTRDN0FcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiMxQzI1NDBcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAxLjA1LFxuICAgICAgXCJza3lcIjogXCIjMTAxNzM2XCIsXG4gICAgICBcImZvZ1wiOiBcIiMxNTFDM0NcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNDUsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuNVxuICAgIH1cbiAgfVxufSIsICIvLyBCbG9jayBtb2RlbHMgZm9yIGV2ZXJ5IGFuaW1hbCwgZnJvbSB0aGUgb3duZXIncyByZWZlcmVuY2Ugc2hlZXRzXG4vLyAoMDVfTm94ZWxfU3R1ZGlvL0Fzc2V0X1NoZWV0cy8yMDI2LTExLTI0X2FuaW1hbHMpLiBQbGFpbiBjb2xvdXJzIG9ubHksIHRocmVlXG4vLyB0byBmaXZlIHBlciBzcGVjaWVzLiBUd28gY29uc3RydWN0aW9uIHN0eWxlcywgYXMgdGhlIG93bmVyIGRlc2NyaWJlZDpcbi8vICAgZG9tZXN0aWM6IGNodW5reSwgYmlnIGhlYWRzLCBsYXJnZSByZWFkYWJsZSBibG9ja3MgKGNhdHRsZSwgZ29hdCwgcGlnLCBob3JzZSwgY2hpY2tlbilcbi8vICAgICAgICAgICAgIGFuZCBvbmUgY3ViZS1jbHVzdGVyIGNvYXQgKHNoZWVwKTtcbi8vICAgd2lsZGxpZmU6IG1vcmUgbmF0dXJhbCBwcm9wb3J0aW9ucyBmcm9tIHNtYWxsZXIgYmxvY2tzIChkZWVyLCBmb3gsIHdvbGYsIGhhcmUsIHRyb3V0KS5cbi8vIExvY2FsIHNwYWNlOiAreiBmb3J3YXJkLCB5IHVwLCBncm91bmQgYXQgMCwgbWV0cmVzLlxuaW1wb3J0IHsgQUJveCwgQW5pbWFsTW9kZWwsIFBBUlQsIGJ4IH0gZnJvbSAnLi9hbmltYWwta2l0JztcblxuY29uc3QgeyBib2R5LCBsZWdBLCBsZWdCLCBoZWFkLCB0YWlsLCB3aW5nLCB3b29sLCBtYWxlIH0gPSBQQVJUO1xuLyoqIERpYWdvbmFsIGdhaXQ6IGZyb250LWxlZnQgd2l0aCBiYWNrLXJpZ2h0LCBmcm9udC1yaWdodCB3aXRoIGJhY2stbGVmdC4gKi9cbmNvbnN0IGxlZ1NldCA9ICh4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gKHggPiAwKSA9PT0gKHogPiAwKSA/IGxlZ0EgOiBsZWdCO1xuXG4vKiogRm91ciBsZWdzOiBhIHNoYWZ0LCBhbiBvcHRpb25hbCBmb290IGJsb2NrLCBoaW5nZWQgYXQgdGhlIGhpcC4gKi9cbmZ1bmN0aW9uIGxlZ3Moc3BvdHM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+LCBoaXA6IG51bWJlciwgdzogbnVtYmVyLCBzaGFmdDogbnVtYmVyLCBzaGFmdENvbG91cjogc3RyaW5nLFxuICBmb290PzogeyBjOiBzdHJpbmc7IGg6IG51bWJlcjsgdz86IG51bWJlciB9KTogQUJveFtdIHtcbiAgY29uc3Qgb3V0OiBBQm94W10gPSBbXTtcbiAgZm9yIChjb25zdCBbeCwgel0gb2Ygc3BvdHMpIHtcbiAgICBjb25zdCBwYXJ0ID0gbGVnU2V0KHgsIHopLCBwdjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gW3gsIGhpcCwgel07XG4gICAgb3V0LnB1c2goYngodywgc2hhZnQsIHcsIHgsIGhpcCAtIHNoYWZ0IC8gMiwgeiwgc2hhZnRDb2xvdXIsIHBhcnQsIHB2KSk7XG4gICAgaWYgKGZvb3QpIG91dC5wdXNoKGJ4KGZvb3QudyA/PyB3ICsgMC4wMiwgZm9vdC5oLCAoZm9vdC53ID8/IHcgKyAwLjAyKSArIDAuMDIsIHgsIGZvb3QuaCAvIDIsIHogKyAwLjAxLCBmb290LmMsIHBhcnQsIHB2KSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuLy8gLS0tLS0tLS0tLSBkb21lc3RpYyAtLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGNhdHRsZSgpOiBBbmltYWxNb2RlbCB7XG4gIGNvbnN0IENPQVQgPSAnI0M1OEE0NycsIERBUksgPSAnIzhBNTQyOCcsIE1VWlpMRSA9ICcjRTdBRTkzJywgSE9STiA9ICcjRUJEN0I1JywgSE9PRiA9ICcjNEIyRjFFJztcbiAgY29uc3QgUDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gWzAsIDEuMywgMC43NV07XG4gIHJldHVybiB7XG4gICAgaWQ6ICdjYXR0bGUnLCBsZWdMZW46IDAuNjYsXG4gICAgYm94ZXM6IFtcbiAgICAgIGJ4KDAuOTIsIDAuNzgsIDEuNSwgMCwgMS4wLCAtMC4wNSwgQ09BVCksXG4gICAgICBieCgwLjk0LCAwLjIyLCAwLjgsIDAsIDEuMzIsIDAuMywgREFSSyksXG4gICAgICBieCgwLjcsIDAuMywgMC40LCAwLCAwLjc4LCAtMC42MiwgREFSSyksXG4gICAgICAuLi5sZWdzKFtbMC4zLCAwLjVdLCBbLTAuMywgMC41XSwgWzAuMywgLTAuNTVdLCBbLTAuMywgLTAuNTVdXSwgMC42NiwgMC4yNCwgMC41LCBDT0FULCB7IGM6IEhPT0YsIGg6IDAuMTQsIHc6IDAuMjYgfSksXG4gICAgICBieCgwLjYyLCAwLjU4LCAwLjUyLCAwLCAxLjI4LCAxLjEsIENPQVQsIGhlYWQsIFApLFxuICAgICAgYngoMC41LCAwLjMsIDAuMiwgMCwgMS4xMiwgMS40MiwgTVVaWkxFLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuNSwgMC4xMiwgMC4zNCwgMCwgMS42LCAxLjA1LCBEQVJLLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMTIsIDAuMTIsIDAuMDMsIDAuMTcsIDEuMzQsIDEuMzcsICcjRkZGRkZGJywgaGVhZCwgUCksIGJ4KDAuMTIsIDAuMTIsIDAuMDMsIC0wLjE3LCAxLjM0LCAxLjM3LCAnI0ZGRkZGRicsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNiwgMC4wOCwgMC4wMzUsIDAuMTcsIDEuMzMsIDEuMzksICcjMTQxNDE0JywgaGVhZCwgUCksIGJ4KDAuMDYsIDAuMDgsIDAuMDM1LCAtMC4xNywgMS4zMywgMS4zOSwgJyMxNDE0MTQnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDgsIDAuMDYsIDAuMDMsIDAuMTIsIDEuMTYsIDEuNTIsICcjOEE1QTRBJywgaGVhZCwgUCksIGJ4KDAuMDgsIDAuMDYsIDAuMDMsIC0wLjEyLCAxLjE2LCAxLjUyLCAnIzhBNUE0QScsIGhlYWQsIFApLFxuICAgICAgYngoMC4yMiwgMC4wOCwgMC4xNCwgMC40MiwgMS40MiwgMC45OCwgREFSSywgaGVhZCwgUCksIGJ4KDAuMjIsIDAuMDgsIDAuMTQsIC0wLjQyLCAxLjQyLCAwLjk4LCBEQVJLLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC4xLCAwLjE0LCAwLjM2LCAxLjUyLCAxLjAyLCBIT1JOLCBoZWFkLCBQKSwgYngoMC4xLCAwLjEsIDAuMTQsIC0wLjM2LCAxLjUyLCAxLjAyLCBIT1JOLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC4yNiwgMC4xLCAwLjQyLCAxLjcsIDEuMDIsIEhPUk4sIGhlYWQgKyBtYWxlLCBQKSwgYngoMC4xLCAwLjI2LCAwLjEsIC0wLjQyLCAxLjcsIDEuMDIsIEhPUk4sIGhlYWQgKyBtYWxlLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC41NSwgMC4xLCAwLCAxLjA1LCAtMC44NCwgREFSSywgdGFpbCwgWzAsIDEuMywgLTAuOF0pLFxuICAgICAgYngoMC4xNCwgMC4xNiwgMC4xNCwgMCwgMC43MiwgLTAuODQsIERBUkssIHRhaWwsIFswLCAxLjMsIC0wLjhdKSxcbiAgICBdLFxuICB9O1xufVxuXG5mdW5jdGlvbiBzaGVlcCgpOiBBbmltYWxNb2RlbCB7XG4gIGNvbnN0IEZBQ0UgPSAnI0U5RDlCOCcsIExFRyA9ICcjQ0RBQTdEJywgREFSSyA9ICcjM0EzMjJDJywgV09PTFMgPSBbJyNGNkY1RjAnLCAnI0VDRTlFMCcsICcjRkJGQUY3J107XG4gIGNvbnN0IFA6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFswLCAwLjk1LCAwLjVdO1xuICBjb25zdCBDOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbMCwgMC44MywgLTAuMTFdO1xuICBjb25zdCBib3hlczogQUJveFtdID0gW1xuICAgIGJ4KDAuNSwgMC40LCAwLjksIDAsIDAuODMsIC0wLjExLCAnI0RERDhDQicsIHdvb2wsIEMpLFxuICAgIC4uLmxlZ3MoW1swLjIsIDAuMzJdLCBbLTAuMiwgMC4zMl0sIFswLjIsIC0wLjM0XSwgWy0wLjIsIC0wLjM0XV0sIDAuNTgsIDAuMTEsIDAuNTgsIExFRyksXG4gIF07XG4gIC8vIFRoZSBjb2F0IGlzIGEgbG9vc2UgY2x1c3RlciBvZiBjdWJlcyB3aXRoIGdhcHMsIGxpa2UgdGhlIGN1YmUtYnVpbHQgcmVmZXJlbmNlLlxuICBjb25zdCBzID0gMC4yMywgeHMgPSBbLTAuMzQsIC0wLjExLCAwLjEyLCAwLjM1XSwgeXMgPSBbMC42MiwgMC44NSwgMS4wOF0sIHpzID0gWy0wLjU2LCAtMC4zMywgLTAuMSwgMC4xMywgMC4zNl07XG4gIGxldCBrID0gMDtcbiAgeHMuZm9yRWFjaCgoeCwgaXgpID0+IHlzLmZvckVhY2goKHksIGl5KSA9PiB6cy5mb3JFYWNoKCh6LCBpeikgPT4ge1xuICAgIGNvbnN0IHNoZWxsID0gaXggPT09IDAgfHwgaXggPT09IHhzLmxlbmd0aCAtIDEgfHwgaXkgPT09IDAgfHwgaXkgPT09IHlzLmxlbmd0aCAtIDEgfHwgaXogPT09IDAgfHwgaXogPT09IHpzLmxlbmd0aCAtIDE7XG4gICAgaWYgKCFzaGVsbCkgcmV0dXJuO1xuICAgIGsrKztcbiAgICBpZiAoaXkgPCB5cy5sZW5ndGggLSAxICYmIChrICogNzkxOSkgJSAxMSA9PT0gMCkgcmV0dXJuOyAgICAgIC8vIGdhcHMgaW4gdGhlIHNpZGVzXG4gICAgLy8gQ3ViZXMgc2l0IGEgbGl0dGxlIGluIG9yIG91dCBzbyB0aGUgY29hdCBoYXMgYSBzdGVwcGVkLCBjdWJlLWJ1aWx0IHN1cmZhY2UuXG4gICAgY29uc3QgaiA9IChuOiBudW1iZXIpID0+ICgoKGsgKiBuKSAlIDUpIC0gMikgKiAwLjAyNTtcbiAgICBib3hlcy5wdXNoKGJ4KHMsIHMsIHMsIHggKyAoaXggPT09IDAgfHwgaXggPT09IHhzLmxlbmd0aCAtIDEgPyBqKDEzKSA6IDApLCB5ICsgKGl5ID09PSB5cy5sZW5ndGggLSAxID8gaig3KSA6IDApLCB6ICsgKGl6ID09PSAwIHx8IGl6ID09PSB6cy5sZW5ndGggLSAxID8gaigxMSkgOiAwKSwgV09PTFNbKGsgKiAzMSkgJSAzXSwgd29vbCwgQykpO1xuICB9KSkpO1xuICBib3hlcy5wdXNoKFxuICAgIGJ4KDAuMywgMC4zMiwgMC4zNCwgMCwgMC45LCAwLjY2LCBGQUNFLCBoZWFkLCBQKSxcbiAgICBieCgwLjM0LCAwLjE0LCAwLjMyLCAwLCAxLjEsIDAuNiwgV09PTFNbMF0sIGhlYWQsIFApLFxuICAgIGJ4KDAuMTQsIDAuMTIsIDAuMDYsIDAsIDAuODUsIDAuODQ1LCBEQVJLLCBoZWFkLCBQKSxcbiAgICBieCgwLjA3LCAwLjA3LCAwLjAzLCAwLjA4LCAwLjk2LCAwLjgzNSwgREFSSywgaGVhZCwgUCksIGJ4KDAuMDcsIDAuMDcsIDAuMDMsIC0wLjA4LCAwLjk2LCAwLjgzNSwgREFSSywgaGVhZCwgUCksXG4gICAgYngoMC4xNiwgMC4wNiwgMC4xLCAwLjIsIDAuOTgsIDAuNiwgRkFDRSwgaGVhZCwgUCwgeyByejogLTAuNCB9KSwgYngoMC4xNiwgMC4wNiwgMC4xLCAtMC4yLCAwLjk4LCAwLjYsIEZBQ0UsIGhlYWQsIFAsIHsgcno6IDAuNCB9KSxcbiAgICBieCgwLjA5LCAwLjIsIDAuMDksIDAuMiwgMS4xLCAwLjYyLCAnI0I5QTA3QScsIGhlYWQgKyBtYWxlLCBQKSwgYngoMC4wOSwgMC4wOSwgMC4yLCAwLjIsIDEuMiwgMC41NCwgJyNCOUEwN0EnLCBoZWFkICsgbWFsZSwgUCksXG4gICAgYngoMC4wOSwgMC4yLCAwLjA5LCAtMC4yLCAxLjEsIDAuNjIsICcjQjlBMDdBJywgaGVhZCArIG1hbGUsIFApLCBieCgwLjA5LCAwLjA5LCAwLjIsIC0wLjIsIDEuMiwgMC41NCwgJyNCOUEwN0EnLCBoZWFkICsgbWFsZSwgUCksXG4gICAgYngoMC4xMywgMC4xMywgMC4xMywgMCwgMC44NSwgLTAuNywgV09PTFNbMV0sIHRhaWwsIFswLCAwLjg1LCAtMC42Nl0pLFxuICApO1xuICByZXR1cm4geyBpZDogJ3NoZWVwJywgbGVnTGVuOiAwLjU4LCBib3hlcyB9O1xufVxuXG5mdW5jdGlvbiBnb2F0KCk6IEFuaW1hbE1vZGVsIHtcbiAgY29uc3QgQ09BVCA9ICcjQjA5Qjc4JywgTElHSFQgPSAnI0Q3QzlBNScsIFBBTEUgPSAnI0U0RTBDOCcsIEhPUk4gPSAnIzRBNEE0QycsIFdISVRFID0gJyNGMkYwRTYnLCBQSU5LID0gJyNFODlBQTAnO1xuICBjb25zdCBQOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbMCwgMS4wLCAwLjVdO1xuICByZXR1cm4ge1xuICAgIGlkOiAnZ29hdCcsIGxlZ0xlbjogMC41NSxcbiAgICBib3hlczogW1xuICAgICAgYngoMC40MiwgMC40NiwgMS4wLCAwLCAwLjc4LCAtMC4wMiwgQ09BVCksXG4gICAgICBieCgwLjIsIDAuMDYsIDAuOTUsIDAsIDEuMDQsIC0wLjAyLCBMSUdIVCksXG4gICAgICBieCgwLjM2LCAwLjA2LCAwLjgsIDAsIDAuNTMsIDAsIFBBTEUpLFxuICAgICAgLi4ubGVncyhbWzAuMTUsIDAuMzRdLCBbLTAuMTUsIDAuMzRdLCBbMC4xNSwgLTAuMzhdLCBbLTAuMTUsIC0wLjM4XV0sIDAuNTUsIDAuMSwgMC40NiwgQ09BVCwgeyBjOiBXSElURSwgaDogMC4xIH0pLFxuICAgICAgYngoMC4yNCwgMC40LCAwLjI0LCAwLCAxLjEsIDAuNSwgQ09BVCwgaGVhZCwgUCksXG4gICAgICBieCgwLjMsIDAuMzIsIDAuMzQsIDAsIDEuMjgsIDAuNywgQ09BVCwgaGVhZCwgUCksXG4gICAgICBieCgwLjE4LCAwLjE4LCAwLjIsIDAsIDEuMTgsIDAuOTUsIExJR0hULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMTYsIDAuMDUsIDAuMDYsIDAsIDEuMDgsIDEuMDIsIFBJTkssIGhlYWQsIFApLFxuICAgICAgYngoMC4xLCAwLjA2LCAwLjA0LCAwLCAxLjI0LCAxLjA2LCAnIzFBMUExQScsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNywgMC4xNCwgMC4wNywgMCwgMC45OSwgMC45NywgV0hJVEUsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNywgMC4xMiwgMC4wNywgMCwgMC44OCwgMC45NywgV0hJVEUsIGhlYWQgKyBtYWxlLCBQKSxcbiAgICAgIGJ4KDAuMDUsIDAuMSwgMC4wMiwgMC4xLCAxLjMxLCAwLjg3NSwgJyNGRkZGRkYnLCBoZWFkLCBQKSwgYngoMC4wNSwgMC4xLCAwLjAyLCAtMC4xLCAxLjMxLCAwLjg3NSwgJyNGRkZGRkYnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDMsIDAuMSwgMC4wMywgMC4xLCAxLjMxLCAwLjg4NSwgJyMxNDE0MTQnLCBoZWFkLCBQKSwgYngoMC4wMywgMC4xLCAwLjAzLCAtMC4xLCAxLjMxLCAwLjg4NSwgJyMxNDE0MTQnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDcsIDAuMiwgMC4wNywgMC4wOSwgMS41NSwgMC42NCwgSE9STiwgaGVhZCwgUCksIGJ4KDAuMDcsIDAuMiwgMC4wNywgLTAuMDksIDEuNTUsIDAuNjQsIEhPUk4sIGhlYWQsIFApLFxuICAgICAgYngoMC4wNywgMC4wNywgMC4xNywgMC4wOSwgMS42NywgMC41OCwgSE9STiwgaGVhZCwgUCksIGJ4KDAuMDcsIDAuMDcsIDAuMTcsIC0wLjA5LCAxLjY3LCAwLjU4LCBIT1JOLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC4wNiwgMC4xNiwgMC4yLCAxLjMsIDAuNjYsIENPQVQsIGhlYWQsIFAsIHsgcno6IC0wLjM1IH0pLCBieCgwLjEsIDAuMDYsIDAuMTYsIC0wLjIsIDEuMywgMC42NiwgQ09BVCwgaGVhZCwgUCwgeyByejogMC4zNSB9KSxcbiAgICAgIGJ4KDAuMDgsIDAuMiwgMC4wOCwgMCwgMC45OCwgLTAuNTUsIENPQVQsIHRhaWwsIFswLCAwLjk1LCAtMC41Ml0pLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHBpZygpOiBBbmltYWxNb2RlbCB7XG4gIGNvbnN0IFBJTksgPSAnI0YyQTlBMycsIFNOT1VUID0gJyNFODgyN0QnLCBFQVIgPSAnI0U1OEI4NicsIElOTkVSID0gJyNGMDZCNjYnLCBIT09GID0gJyNFMDcwNkEnO1xuICBjb25zdCBQOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbMCwgMC43LCAwLjVdO1xuICByZXR1cm4ge1xuICAgIGlkOiAncGlnJywgbGVnTGVuOiAwLjM0LFxuICAgIGJveGVzOiBbXG4gICAgICBieCgwLjcsIDAuNTUsIDEuMCwgMCwgMC42MiwgLTAuMDUsIFBJTkspLFxuICAgICAgLi4ubGVncyhbWzAuMiwgMC4zXSwgWy0wLjIsIDAuM10sIFstMC4yLCAtMC4zMl0sIFswLjIsIC0wLjMyXV0sIDAuMzQsIDAuMTcsIDAuMjYsIFBJTkssIHsgYzogSE9PRiwgaDogMC4xIH0pLFxuICAgICAgYngoMC41MiwgMC40NiwgMC40NCwgMCwgMC42NiwgMC43LCBQSU5LLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMzQsIDAuMjQsIDAuMTYsIDAsIDAuNTgsIDAuOTgsIFNOT1VULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDUsIDAuMDgsIDAuMDMsIDAuMDcsIDAuNTgsIDEuMDc1LCAnI0I4NTA0QycsIGhlYWQsIFApLCBieCgwLjA1LCAwLjA4LCAwLjAzLCAtMC4wNywgMC41OCwgMS4wNzUsICcjQjg1MDRDJywgaGVhZCwgUCksXG4gICAgICBieCgwLjEsIDAuMTIsIDAuMDMsIDAuMTcsIDAuNzYsIDAuOTI1LCAnIzE0MTQxNCcsIGhlYWQsIFApLCBieCgwLjEsIDAuMTIsIDAuMDMsIC0wLjE3LCAwLjc2LCAwLjkyNSwgJyMxNDE0MTQnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMiwgMC4wNiwgMC4yLCAwLjIsIDAuOTQsIDAuNjQsIEVBUiwgaGVhZCwgUCksIGJ4KDAuMiwgMC4wNiwgMC4yLCAtMC4yLCAwLjk0LCAwLjY0LCBFQVIsIGhlYWQsIFApLFxuICAgICAgYngoMC4xMiwgMC4wMywgMC4xMiwgMC4yLCAwLjk3NSwgMC42NCwgSU5ORVIsIGhlYWQsIFApLCBieCgwLjEyLCAwLjAzLCAwLjEyLCAtMC4yLCAwLjk3NSwgMC42NCwgSU5ORVIsIGhlYWQsIFApLFxuICAgICAgYngoMC4wOCwgMC4xNCwgMC4wOCwgMCwgMC43OCwgLTAuNTgsIFBJTkssIHRhaWwsIFswLCAwLjcsIC0wLjU1XSksXG4gICAgICBieCgwLjEyLCAwLjA3LCAwLjA4LCAwLjA0LCAwLjg4LCAtMC42LCBQSU5LLCB0YWlsLCBbMCwgMC43LCAtMC41NV0pLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNoaWNrZW4oKTogQW5pbWFsTW9kZWwge1xuICBjb25zdCBXSElURSA9ICcjRjNGMUVBJywgU0hBREUgPSAnI0UzRTBENicsIFJFRCA9ICcjQjgyNDJCJywgT1JBTkdFID0gJyNGMjlBMkUnLCBMRUcgPSAnI0M5OEM1QScsIEZFQVRIRVIgPSAnIzNFNEI1Mic7XG4gIGNvbnN0IFA6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFswLCAwLjUsIDAuMl07XG4gIGNvbnN0IHdpbmdQaXZvdCA9ICh4OiBudW1iZXIpOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPT4gW3gsIDAuNDYsIC0wLjAyXTtcbiAgcmV0dXJuIHtcbiAgICBpZDogJ2NoaWNrZW4nLCBsZWdMZW46IDAuMTgsIHlvdW5nVGludDogJyNGM0Q5NEEnLFxuICAgIGJveGVzOiBbXG4gICAgICBieCgwLjM0LCAwLjMyLCAwLjQyLCAwLCAwLjM0LCAtMC4wMiwgV0hJVEUpLFxuICAgICAgYngoMC4zLCAwLjE0LCAwLjEsIDAsIDAuMjYsIDAuMiwgU0hBREUpLFxuICAgICAgYngoMC4wNCwgMC4xOCwgMC4wNCwgMC4wNywgMC4wOSwgMCwgTEVHLCBsZWdBLCBbMC4wNywgMC4xOCwgMF0pLCBieCgwLjA0LCAwLjE4LCAwLjA0LCAtMC4wNywgMC4wOSwgMCwgTEVHLCBsZWdCLCBbLTAuMDcsIDAuMTgsIDBdKSxcbiAgICAgIGJ4KDAuMSwgMC4wMywgMC4xMiwgMC4wNywgMC4wMTUsIDAuMDMsIExFRywgbGVnQSwgWzAuMDcsIDAuMTgsIDBdKSwgYngoMC4xLCAwLjAzLCAwLjEyLCAtMC4wNywgMC4wMTUsIDAuMDMsIExFRywgbGVnQiwgWy0wLjA3LCAwLjE4LCAwXSksXG4gICAgICBieCgwLjA1LCAwLjIsIDAuMjgsIDAuMiwgMC4zOCwgLTAuMDIsIFNIQURFLCB3aW5nLCB3aW5nUGl2b3QoMC4xOCkpLCBieCgwLjA1LCAwLjIsIDAuMjgsIC0wLjIsIDAuMzgsIC0wLjAyLCBTSEFERSwgd2luZywgd2luZ1Bpdm90KC0wLjE4KSksXG4gICAgICBieCgwLjIyLCAwLjI0LCAwLjIyLCAwLCAwLjYsIDAuMiwgV0hJVEUsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNiwgMC4wOCwgMC4xOCwgMCwgMC43NiwgMC4yLCBSRUQsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNywgMC4xNCwgMC4yMiwgMCwgMC44MiwgMC4yLCBSRUQsIGhlYWQgKyBtYWxlLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC4wNiwgMC4xLCAwLCAwLjU4LCAwLjM0LCBPUkFOR0UsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNSwgMC4wNywgMC4wNSwgMCwgMC41LCAwLjMyLCBSRUQsIGhlYWQsIFApLFxuICAgICAgYngoMC4wMywgMC4wNywgMC4wMiwgMC4wOCwgMC42NCwgMC4zMSwgJyMxNDE0MTQnLCBoZWFkLCBQKSwgYngoMC4wMywgMC4wNywgMC4wMiwgLTAuMDgsIDAuNjQsIDAuMzEsICcjMTQxNDE0JywgaGVhZCwgUCksXG4gICAgICBieCgwLjIsIDAuMTYsIDAuMDcsIDAsIDAuNDYsIC0wLjI1LCBXSElURSwgdGFpbCwgWzAsIDAuNCwgLTAuMjJdKSxcbiAgICAgIC4uLlstMC4wOSwgLTAuMDMsIDAuMDMsIDAuMDldLm1hcCgoeCwgaSkgPT4gYngoMC4wNCwgMC4zMiwgMC4wNCwgeCwgMC42NiwgLTAuMyAtIChpICUgMikgKiAwLjAzLCBGRUFUSEVSLCB0YWlsICsgbWFsZSwgWzAsIDAuNCwgLTAuMjJdKSksXG4gICAgXSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gaG9yc2UoKTogQW5pbWFsTW9kZWwge1xuICBjb25zdCBDT0FUID0gJyM4RTRGMjcnLCBNQU5FID0gJyMzQjIyMTgnLCBNVVpaTEUgPSAnIzVBMzMyMCcsIEhPT0YgPSAnIzMzMjAxQScsIFBJTksgPSAnI0U5QTNBMCc7XG4gIGNvbnN0IFA6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFswLCAxLjQ1LCAwLjhdO1xuICByZXR1cm4ge1xuICAgIGlkOiAnaG9yc2UnLCBsZWdMZW46IDAuOTUsXG4gICAgYm94ZXM6IFtcbiAgICAgIGJ4KDAuNjIsIDAuNjYsIDEuNSwgMCwgMS4yMiwgLTAuMDUsIENPQVQpLFxuICAgICAgYngoMC41LCAwLjEsIDEuMiwgMCwgMC45LCAtMC4wNSwgJyNBMDYyMzUnKSxcbiAgICAgIC4uLmxlZ3MoW1swLjIsIDAuNTVdLCBbLTAuMiwgMC41NV0sIFswLjIsIC0wLjZdLCBbLTAuMiwgLTAuNl1dLCAwLjk1LCAwLjE3LCAwLjgyLCBDT0FULCB7IGM6IEhPT0YsIGg6IDAuMTMsIHc6IDAuMTkgfSksXG4gICAgICBieCgwLjMsIDAuNywgMC4zNCwgMCwgMS43LCAwLjksIENPQVQsIGhlYWQsIFApLFxuICAgICAgYngoMC4zMiwgMC4zNiwgMC42MiwgMCwgMi4wLCAxLjE1LCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMywgMC4yNiwgMC4yLCAwLCAxLjg4LCAxLjUsIE1VWlpMRSwgaGVhZCwgUCksXG4gICAgICBieCgwLjA2LCAwLjA1LCAwLjAzLCAwLjA4LCAxLjkyLCAxLjYwNSwgJyMxNDE0MTQnLCBoZWFkLCBQKSwgYngoMC4wNiwgMC4wNSwgMC4wMywgLTAuMDgsIDEuOTIsIDEuNjA1LCAnIzE0MTQxNCcsIGhlYWQsIFApLFxuICAgICAgYngoMC4xLCAwLjEsIDAuMDMsIDAuMDksIDIuMDgsIDEuNDY1LCAnI0ZGRkZGRicsIGhlYWQsIFApLCBieCgwLjEsIDAuMSwgMC4wMywgLTAuMDksIDIuMDgsIDEuNDY1LCAnI0ZGRkZGRicsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNSwgMC4wNiwgMC4wMzUsIDAuMDksIDIuMDcsIDEuNDgsICcjMTQxNDE0JywgaGVhZCwgUCksIGJ4KDAuMDUsIDAuMDYsIDAuMDM1LCAtMC4wOSwgMi4wNywgMS40OCwgJyMxNDE0MTQnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC4yLCAwLjA4LCAwLjEsIDIuMjcsIDEuMCwgQ09BVCwgaGVhZCwgUCksIGJ4KDAuMSwgMC4yLCAwLjA4LCAtMC4xLCAyLjI3LCAxLjAsIENPQVQsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNSwgMC4xMiwgMC4wMiwgMC4xLCAyLjI2LCAxLjA0NSwgUElOSywgaGVhZCwgUCksIGJ4KDAuMDUsIDAuMTIsIDAuMDIsIC0wLjEsIDIuMjYsIDEuMDQ1LCBQSU5LLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMSwgMC43LCAwLjEyLCAwLCAxLjkyLCAwLjcsIE1BTkUsIGhlYWQsIFApLFxuICAgICAgYngoMC4xNCwgMC4xNCwgMC4xNCwgMCwgMi4yMiwgMS4xMiwgTUFORSwgaGVhZCwgUCksXG4gICAgICBieCgwLjEyLCAwLjc1LCAwLjEyLCAwLCAxLjAsIC0wLjg1LCBNQU5FLCB0YWlsLCBbMCwgMS41LCAtMC44XSksXG4gICAgXSxcbiAgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSB3aWxkbGlmZSAtLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGRlZXIoKTogQW5pbWFsTW9kZWwge1xuICBjb25zdCBDT0FUID0gJyNBNTYyMkUnLCBEQVJLID0gJyM3QzQ1MjEnLCBCRUxMWSA9ICcjRDhCOThBJywgQ1JFQU0gPSAnI0VCRDlCNCcsIEFOVExFUiA9ICcjRDlDQkE4JywgSE9PRiA9ICcjMkExQTEyJztcbiAgY29uc3QgUDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gWzAsIDEuMSwgMC40Ml07XG4gIHJldHVybiB7XG4gICAgaWQ6ICdkZWVyJywgbGVnTGVuOiAwLjg1LFxuICAgIGJveGVzOiBbXG4gICAgICBieCgwLjM0LCAwLjM4LCAwLjYyLCAwLCAxLjAsIDAuMTgsIENPQVQpLFxuICAgICAgYngoMC4zMiwgMC4zNiwgMC41LCAwLCAxLjAyLCAtMC4zNCwgQ09BVCksXG4gICAgICBieCgwLjIsIDAuMDYsIDAuOSwgMCwgMS4yMiwgLTAuMSwgREFSSyksXG4gICAgICBieCgwLjI2LCAwLjA4LCAwLjg1LCAwLCAwLjgyLCAtMC4wMywgQkVMTFkpLFxuICAgICAgYngoMC4yLCAwLjE0LCAwLjA0LCAwLCAxLjAyLCAtMC42LCBDUkVBTSksXG4gICAgICAuLi5bWzAuMSwgMC4zXSwgWy0wLjEsIDAuM10sIFswLjEsIC0wLjVdLCBbLTAuMSwgLTAuNV1dLmZsYXRNYXAoKFt4LCB6XSkgPT4ge1xuICAgICAgICBjb25zdCBwYXJ0ID0gbGVnU2V0KHgsIHopLCBwdjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gW3gsIDAuODUsIHpdO1xuICAgICAgICByZXR1cm4gW2J4KDAuMSwgMC40MiwgMC4xLCB4LCAwLjY0LCB6LCBDT0FULCBwYXJ0LCBwdiksIGJ4KDAuMDcsIDAuMzgsIDAuMDcsIHgsIDAuMjYsIHosIERBUkssIHBhcnQsIHB2KSwgYngoMC4wOCwgMC4wNywgMC4xLCB4LCAwLjAzNSwgeiArIDAuMDEsIEhPT0YsIHBhcnQsIHB2KV07XG4gICAgICB9KSxcbiAgICAgIGJ4KDAuMTYsIDAuNDIsIDAuMTgsIDAsIDEuMzYsIDAuNSwgQ09BVCwgaGVhZCwgUCwgeyByeDogLTAuMyB9KSxcbiAgICAgIGJ4KDAuMTgsIDAuMiwgMC4zLCAwLCAxLjYyLCAwLjY0LCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMTIsIDAuMTIsIDAuMTQsIDAsIDEuNTYsIDAuODQsIENSRUFNLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDgsIDAuMDYsIDAuMDQsIDAsIDEuNTksIDAuOTIsICcjMTQxNDE0JywgaGVhZCwgUCksXG4gICAgICBieCgwLjAzLCAwLjA1LCAwLjAzLCAwLjA4NSwgMS42NywgMC43MiwgJyMxNDE0MTQnLCBoZWFkLCBQKSwgYngoMC4wMywgMC4wNSwgMC4wMywgLTAuMDg1LCAxLjY3LCAwLjcyLCAnIzE0MTQxNCcsIGhlYWQsIFApLFxuICAgICAgYngoMC4wNiwgMC4xNCwgMC4wNCwgMC4xMiwgMS43NSwgMC41NiwgQ09BVCwgaGVhZCwgUCwgeyByejogLTAuMyB9KSwgYngoMC4wNiwgMC4xNCwgMC4wNCwgLTAuMTIsIDEuNzUsIDAuNTYsIENPQVQsIGhlYWQsIFAsIHsgcno6IDAuMyB9KSxcbiAgICAgIGJ4KDAuMDQsIDAuMywgMC4wNCwgMC4wNywgMS44OCwgMC41OCwgQU5UTEVSLCBoZWFkICsgbWFsZSwgUCksIGJ4KDAuMDQsIDAuMywgMC4wNCwgLTAuMDcsIDEuODgsIDAuNTgsIEFOVExFUiwgaGVhZCArIG1hbGUsIFApLFxuICAgICAgYngoMC4xNCwgMC4wNCwgMC4wNCwgMC4xMywgMS45NSwgMC41OCwgQU5UTEVSLCBoZWFkICsgbWFsZSwgUCksIGJ4KDAuMTQsIDAuMDQsIDAuMDQsIC0wLjEzLCAxLjk1LCAwLjU4LCBBTlRMRVIsIGhlYWQgKyBtYWxlLCBQKSxcbiAgICAgIGJ4KDAuMDQsIDAuMTYsIDAuMDQsIDAuMiwgMi4wMywgMC41OCwgQU5UTEVSLCBoZWFkICsgbWFsZSwgUCksIGJ4KDAuMDQsIDAuMTYsIDAuMDQsIC0wLjIsIDIuMDMsIDAuNTgsIEFOVExFUiwgaGVhZCArIG1hbGUsIFApLFxuICAgICAgYngoMC4wNCwgMC4xNCwgMC4wNCwgMC4wNywgMi4xMiwgMC41OCwgQU5UTEVSLCBoZWFkICsgbWFsZSwgUCksIGJ4KDAuMDQsIDAuMTQsIDAuMDQsIC0wLjA3LCAyLjEyLCAwLjU4LCBBTlRMRVIsIGhlYWQgKyBtYWxlLCBQKSxcbiAgICAgIGJ4KDAuMDgsIDAuMTIsIDAuMDgsIDAsIDEuMDgsIC0wLjYyLCBDUkVBTSwgdGFpbCwgWzAsIDEuMCwgLTAuNl0pLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGZveCgpOiBBbmltYWxNb2RlbCB7XG4gIGNvbnN0IENPQVQgPSAnI0Q5NkExRScsIENSRUFNID0gJyNGMUUyQzQnLCBEQVJLID0gJyMzQTIyMTgnO1xuICBjb25zdCBQOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbMCwgMC41LCAwLjMyXTtcbiAgY29uc3QgVDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gWzAsIDAuNDIsIC0wLjNdO1xuICByZXR1cm4ge1xuICAgIGlkOiAnZm94JywgbGVnTGVuOiAwLjMsXG4gICAgYm94ZXM6IFtcbiAgICAgIGJ4KDAuMjIsIDAuMiwgMC42MiwgMCwgMC40LCAwLCBDT0FUKSxcbiAgICAgIGJ4KDAuMiwgMC4xNCwgMC4xNCwgMCwgMC4zNCwgMC4zLCBDUkVBTSksXG4gICAgICAuLi5bWzAuMDgsIDAuMjJdLCBbLTAuMDgsIDAuMjJdLCBbMC4wOCwgLTAuMl0sIFstMC4wOCwgLTAuMl1dLmZsYXRNYXAoKFt4LCB6XSkgPT4ge1xuICAgICAgICBjb25zdCBwYXJ0ID0gbGVnU2V0KHgsIHopLCBwdjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gW3gsIDAuMywgel07XG4gICAgICAgIHJldHVybiBbYngoMC4wNywgMC4xNywgMC4wNywgeCwgMC4yMTUsIHosIENPQVQsIHBhcnQsIHB2KSwgYngoMC4wOCwgMC4xMywgMC4wOSwgeCwgMC4wNjUsIHogKyAwLjAxLCBEQVJLLCBwYXJ0LCBwdildO1xuICAgICAgfSksXG4gICAgICBieCgwLjIsIDAuMTgsIDAuMjIsIDAsIDAuNSwgMC40NSwgQ09BVCwgaGVhZCwgUCksXG4gICAgICBieCgwLjEyLCAwLjEsIDAuMTQsIDAsIDAuNDUsIDAuNjIsIENSRUFNLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDYsIDAuMDUsIDAuMDQsIDAsIDAuNDcsIDAuNywgJyMxMTExMTEnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDMsIDAuMDQsIDAuMDIsIDAuMDcsIDAuNTQsIDAuNTY1LCAnIzExMTExMScsIGhlYWQsIFApLCBieCgwLjAzLCAwLjA0LCAwLjAyLCAtMC4wNywgMC41NCwgMC41NjUsICcjMTExMTExJywgaGVhZCwgUCksXG4gICAgICBieCgwLjA2LCAwLjEyLCAwLjA0LCAwLjA4LCAwLjY2LCAwLjQsIENPQVQsIGhlYWQsIFApLCBieCgwLjA2LCAwLjEyLCAwLjA0LCAtMC4wOCwgMC42NiwgMC40LCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDYsIDAuMDQsIDAuMDQsIDAuMDgsIDAuNzQsIDAuNCwgREFSSywgaGVhZCwgUCksIGJ4KDAuMDYsIDAuMDQsIDAuMDQsIC0wLjA4LCAwLjc0LCAwLjQsIERBUkssIGhlYWQsIFApLFxuICAgICAgYngoMC4xMiwgMC4xMiwgMC4yLCAwLCAwLjQyLCAtMC40LCBDT0FULCB0YWlsLCBUKSwgYngoMC4xNSwgMC4xNSwgMC4yLCAwLCAwLjQsIC0wLjU4LCBDT0FULCB0YWlsLCBUKSwgYngoMC4xMiwgMC4xMiwgMC4xMiwgMCwgMC4zOCwgLTAuNzIsIENSRUFNLCB0YWlsLCBUKSxcbiAgICBdLFxuICB9O1xufVxuXG5mdW5jdGlvbiB3b2xmKCk6IEFuaW1hbE1vZGVsIHtcbiAgY29uc3QgQ09BVCA9ICcjN0I3Rjg2JywgREFSSyA9ICcjNEU1MjU4JywgTElHSFQgPSAnI0I4QkNDMicsIE5PU0UgPSAnIzE1MTcxQSc7XG4gIGNvbnN0IFA6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFswLCAwLjg1LCAwLjVdO1xuICBjb25zdCBUOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbMCwgMC43NSwgLTAuNDJdO1xuICByZXR1cm4ge1xuICAgIGlkOiAnd29sZicsIGxlZ0xlbjogMC41OCxcbiAgICBib3hlczogW1xuICAgICAgYngoMC4zLCAwLjM2LCAwLjg1LCAwLCAwLjc2LCAwLCBDT0FUKSxcbiAgICAgIGJ4KDAuMjYsIDAuMDgsIDAuOCwgMCwgMC45OCwgLTAuMDIsIERBUkspLFxuICAgICAgYngoMC4yNCwgMC4xLCAwLjcsIDAsIDAuNTcsIDAsIExJR0hUKSxcbiAgICAgIC4uLltbMC4xMSwgMC4zMl0sIFstMC4xMSwgMC4zMl0sIFswLjExLCAtMC4zXSwgWy0wLjExLCAtMC4zXV0uZmxhdE1hcCgoW3gsIHpdKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcnQgPSBsZWdTZXQoeCwgeiksIHB2OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbeCwgMC41OCwgel07XG4gICAgICAgIHJldHVybiBbYngoMC4xMSwgMC40NiwgMC4xMSwgeCwgMC4zNSwgeiwgQ09BVCwgcGFydCwgcHYpLCBieCgwLjEyLCAwLjA4LCAwLjE2LCB4LCAwLjA0LCB6ICsgMC4wMiwgTElHSFQsIHBhcnQsIHB2KV07XG4gICAgICB9KSxcbiAgICAgIGJ4KDAuMjIsIDAuMjgsIDAuMiwgMCwgMC45MiwgMC41LCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMjgsIDAuMjgsIDAuMywgMCwgMC45OCwgMC42OCwgQ09BVCwgaGVhZCwgUCksXG4gICAgICBieCgwLjE2LCAwLjE0LCAwLjIsIDAsIDAuOTIsIDAuOSwgTElHSFQsIGhlYWQsIFApLFxuICAgICAgYngoMC4wOCwgMC4wNiwgMC4wNCwgMCwgMC45NSwgMS4wMSwgTk9TRSwgaGVhZCwgUCksXG4gICAgICBieCgwLjA1LCAwLjA1LCAwLjAyLCAwLjA4LCAxLjAzLCAwLjgzLCAnI0UwQjA0MCcsIGhlYWQsIFApLCBieCgwLjA1LCAwLjA1LCAwLjAyLCAtMC4wOCwgMS4wMywgMC44MywgJyNFMEIwNDAnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDQsIDAuMDUsIDAuMDI1LCAwLjA4LCAxLjAzLCAwLjg0LCBOT1NFLCBoZWFkLCBQKSwgYngoMC4wNCwgMC4wNSwgMC4wMjUsIC0wLjA4LCAxLjAzLCAwLjg0LCBOT1NFLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDksIDAuMTIsIDAuMDYsIDAuMSwgMS4xNywgMC42LCBDT0FULCBoZWFkLCBQKSwgYngoMC4wOSwgMC4xMiwgMC4wNiwgLTAuMSwgMS4xNywgMC42LCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDUsIDAuMDgsIDAuMDQsIDAuMSwgMS4yNywgMC42LCBEQVJLLCBoZWFkLCBQKSwgYngoMC4wNSwgMC4wOCwgMC4wNCwgLTAuMSwgMS4yNywgMC42LCBEQVJLLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMTEsIDAuMTEsIDAuMzYsIDAsIDAuNywgLTAuNiwgQ09BVCwgdGFpbCwgVCksIGJ4KDAuMTEsIDAuMTEsIDAuMTQsIDAsIDAuNiwgLTAuODQsIERBUkssIHRhaWwsIFQpLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGhhcmUoKTogQW5pbWFsTW9kZWwge1xuICBjb25zdCBDT0FUID0gJyNBODhBNjInLCBMSUdIVCA9ICcjRThEQ0M0JywgUElOSyA9ICcjRTlBM0EwJztcbiAgY29uc3QgUDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gWzAsIDAuMjUsIDAuMTVdO1xuICByZXR1cm4ge1xuICAgIGlkOiAnaGFyZScsIGxlZ0xlbjogMC4xMixcbiAgICBib3hlczogW1xuICAgICAgYngoMC4yLCAwLjE4LCAwLjM0LCAwLCAwLjIsIC0wLjAyLCBDT0FUKSxcbiAgICAgIGJ4KDAuMjIsIDAuMiwgMC4yLCAwLCAwLjI0LCAtMC4xMiwgQ09BVCksXG4gICAgICBieCgwLjE2LCAwLjA1LCAwLjMsIDAsIDAuMTIsIDAsIExJR0hUKSxcbiAgICAgIGJ4KDAuMDUsIDAuMTIsIDAuMDUsIDAuMDYsIDAuMDcsIDAuMSwgQ09BVCwgbGVnQSwgWzAuMDYsIDAuMTQsIDAuMV0pLCBieCgwLjA1LCAwLjEyLCAwLjA1LCAtMC4wNiwgMC4wNywgMC4xLCBDT0FULCBsZWdCLCBbLTAuMDYsIDAuMTQsIDAuMV0pLFxuICAgICAgYngoMC4wNywgMC4xMiwgMC4xNiwgMC4wNywgMC4wNywgLTAuMTQsIENPQVQsIGxlZ0IsIFswLjA3LCAwLjE0LCAtMC4xNF0pLCBieCgwLjA3LCAwLjEyLCAwLjE2LCAtMC4wNywgMC4wNywgLTAuMTQsIENPQVQsIGxlZ0EsIFstMC4wNywgMC4xNCwgLTAuMTRdKSxcbiAgICAgIGJ4KDAuMTQsIDAuMTQsIDAuMTYsIDAsIDAuMywgMC4yNCwgQ09BVCwgaGVhZCwgUCksXG4gICAgICBieCgwLjEsIDAuMDgsIDAuMDYsIDAsIDAuMjYsIDAuMzMsIExJR0hULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDQsIDAuMDMsIDAuMDIsIDAsIDAuMjgsIDAuMzY1LCBQSU5LLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDI1LCAwLjA0LCAwLjAyLCAwLjA1NSwgMC4zNCwgMC4zMSwgJyMxNDE0MTQnLCBoZWFkLCBQKSwgYngoMC4wMjUsIDAuMDQsIDAuMDIsIC0wLjA1NSwgMC4zNCwgMC4zMSwgJyMxNDE0MTQnLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDQsIDAuMiwgMC4wNSwgMC4wNCwgMC40OCwgMC4yLCBDT0FULCBoZWFkLCBQKSwgYngoMC4wNCwgMC4yLCAwLjA1LCAtMC4wNCwgMC40OCwgMC4yLCBDT0FULCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDIsIDAuMTQsIDAuMDIsIDAuMDQsIDAuNDgsIDAuMjI1LCBQSU5LLCBoZWFkLCBQKSwgYngoMC4wMiwgMC4xNCwgMC4wMiwgLTAuMDQsIDAuNDgsIDAuMjI1LCBQSU5LLCBoZWFkLCBQKSxcbiAgICAgIGJ4KDAuMDksIDAuMDksIDAuMDksIDAsIDAuMjcsIC0wLjI3LCAnI0ZGRkZGRicsIHRhaWwsIFswLCAwLjI3LCAtMC4yNF0pLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHRyb3V0KCk6IEFuaW1hbE1vZGVsIHtcbiAgY29uc3QgVDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gWzAsIDAsIC0wLjFdO1xuICByZXR1cm4ge1xuICAgIGlkOiAndHJvdXQnLCBsZWdMZW46IDAsXG4gICAgYm94ZXM6IFtcbiAgICAgIGJ4KDAuMDgsIDAuMDksIDAuMjYsIDAsIDAsIDAuMDQsICdmYXVuYV90cm91dCcpLFxuICAgICAgYngoMC4wNywgMC4wNCwgMC4yNCwgMCwgLTAuMDM1LCAwLjA0LCAnZmF1bmFfdHJvdXRfYmVsbHknKSxcbiAgICAgIGJ4KDAuMDIsIDAuMDUsIDAuMDgsIDAsIDAuMDY1LCAwLjAyLCAnZmF1bmFfdHJvdXQnKSxcbiAgICAgIGJ4KDAuMDUsIDAuMDYsIDAuMSwgMCwgMCwgLTAuMTQsICdmYXVuYV90cm91dCcsIHRhaWwsIFQpLFxuICAgICAgYngoMC4wMiwgMC4xMSwgMC4wNiwgMCwgMCwgLTAuMiwgJ2ZhdW5hX3Ryb3V0JywgdGFpbCwgVCksXG4gICAgXSxcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IEFOSU1BTF9NT0RFTFMgPSB7XG4gIGNhdHRsZTogY2F0dGxlKCksIHNoZWVwOiBzaGVlcCgpLCBnb2F0OiBnb2F0KCksIHBpZzogcGlnKCksIGNoaWNrZW46IGNoaWNrZW4oKSwgaG9yc2U6IGhvcnNlKCksXG4gIGRlZXI6IGRlZXIoKSwgZm94OiBmb3goKSwgd29sZjogd29sZigpLCByYWJiaXQ6IGhhcmUoKSwgdHJvdXQ6IHRyb3V0KCksXG59IGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgQW5pbWFsTW9kZWxJZCA9IGtleW9mIHR5cGVvZiBBTklNQUxfTU9ERUxTO1xuIiwgIi8vIFJlbmRlci1vbmx5IHNtb290aGluZyBiZXR3ZWVuIHNpbXVsYXRpb24gc3RlcHMuIE5vdGhpbmcgaGVyZSByZWFkcyBvclxuLy8gd3JpdGVzIHNpbXVsYXRpb24gc3RhdGU6IGl0IGJsZW5kcyB0d28gYWxyZWFkeS1jb21wdXRlZCBwb3NlcyBieSBhbiBhbHBoYVxuLy8gZGVyaXZlZCBmcm9tIHJlYWwgdGltZSwgc28gdGhlIHBpY3R1cmUgaXMgaW5kZXBlbmRlbnQgb2YgZnJhbWUgcmF0ZS5cblxuZXhwb3J0IGludGVyZmFjZSBQb3NlIHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgaGVhZGluZzogbnVtYmVyIH1cblxuLyoqIEJleW9uZCB0aGlzIGRpc3RhbmNlIGJldHdlZW4gY29uc2VjdXRpdmUgc3RlcHMgdGhlIGNyZWF0dXJlIHRlbGVwb3J0ZWQgKHNwYXduLCByZXNldCk6IHNob3cgaXQsIGRvIG5vdCBzbGlkZSBpdC4gKi9cbmV4cG9ydCBjb25zdCBTTkFQX0RJU1RBTkNFID0gNjtcblxuLyoqIFNpZ25lZCBzaG9ydGVzdCByb3RhdGlvbiBmcm9tIGBmcm9tYCB0byBgdG9gLCBpbiAoLVBJLCBQSV0uICovXG5leHBvcnQgZnVuY3Rpb24gc2hvcnRlc3RBcmMoZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgVEFVID0gTWF0aC5QSSAqIDI7XG4gIGxldCBkID0gKHRvIC0gZnJvbSkgJSBUQVU7XG4gIGlmIChkID4gTWF0aC5QSSkgZCAtPSBUQVU7IGVsc2UgaWYgKGQgPD0gLU1hdGguUEkpIGQgKz0gVEFVO1xuICByZXR1cm4gZDtcbn1cblxuLyoqIEZyYWN0aW9uIG9mIHRoZSBjdXJyZW50IHRpY2sgdGhhdCBoYXMgZWxhcHNlZCwgZnJvbSB0aGUgY2xvY2sncyBzZWNvbmRzLXRvLW5leHQuIEluIFswLCAxXS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0aWNrQWxwaGEoc2Vjb25kc1RvTmV4dDogbnVtYmVyLCB0aWNrU2Vjb25kczogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKCEodGlja1NlY29uZHMgPiAwKSB8fCAhTnVtYmVyLmlzRmluaXRlKHNlY29uZHNUb05leHQpKSByZXR1cm4gMTtcbiAgcmV0dXJuIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIDEgLSBzZWNvbmRzVG9OZXh0IC8gdGlja1NlY29uZHMpKTtcbn1cblxuLyoqIEZyYWN0aW9uIG9mIHRoZSBjdXJyZW50IGZpeGVkIHN0ZXAgdGhhdCBoYXMgZWxhcHNlZCwgZnJvbSB0aGUgbGVmdG92ZXIgYWNjdW11bGF0b3IuICovXG5leHBvcnQgZnVuY3Rpb24gc3RlcEFscGhhKGFjY3VtdWxhdGVkOiBudW1iZXIsIHN0ZXA6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICghKHN0ZXAgPiAwKSkgcmV0dXJuIDE7XG4gIHJldHVybiBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCBhY2N1bXVsYXRlZCAvIHN0ZXApKTtcbn1cblxuLyoqIEJsZW5kIHByZXYgdG8gY3VyIGludG8gYG91dGAgKG5vIGFsbG9jYXRpb24pLiBTbmFwcyB0byBgY3VyYCB3aGVuIHRoZSBqdW1wIGV4Y2VlZHMgYHNuYXBgLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJsZW5kUG9zZShwcmV2OiBQb3NlLCBjdXI6IFBvc2UsIGFscGhhOiBudW1iZXIsIG91dDogUG9zZSwgc25hcCA9IFNOQVBfRElTVEFOQ0UpOiBQb3NlIHtcbiAgY29uc3QgYSA9IE1hdGgubWluKDEsIE1hdGgubWF4KDAsIGFscGhhKSk7XG4gIGlmIChNYXRoLmh5cG90KGN1ci54IC0gcHJldi54LCBjdXIueiAtIHByZXYueikgPiBzbmFwKSB7XG4gICAgb3V0LnggPSBjdXIueDsgb3V0LnkgPSBjdXIueTsgb3V0LnogPSBjdXIuejsgb3V0LmhlYWRpbmcgPSBjdXIuaGVhZGluZztcbiAgICByZXR1cm4gb3V0O1xuICB9XG4gIG91dC54ID0gcHJldi54ICsgKGN1ci54IC0gcHJldi54KSAqIGE7XG4gIG91dC55ID0gcHJldi55ICsgKGN1ci55IC0gcHJldi55KSAqIGE7XG4gIG91dC56ID0gcHJldi56ICsgKGN1ci56IC0gcHJldi56KSAqIGE7XG4gIG91dC5oZWFkaW5nID0gcHJldi5oZWFkaW5nICsgc2hvcnRlc3RBcmMocHJldi5oZWFkaW5nLCBjdXIuaGVhZGluZykgKiBhO1xuICByZXR1cm4gb3V0O1xufVxuIiwgIi8vIFJlYWwtdGltZSBzZXR0bGVtZW50IGNsb2NrLlxuLy9cbi8vIFRoZSBzaW11bGF0aW9uIHN0aWxsIG9ubHkgYWR2YW5jZXMgdGhyb3VnaCBhY2NlcHRlZCwgam91cm5hbGVkIGB0aWNrYFxuLy8gY29tbWFuZHM7IHRoaXMgY2xhc3MganVzdCBkZWNpZGVzICp3aGVuKiB0aGUgbG9jYWwgcGxheWVyJ3MgY2xpZW50IGlzc3Vlc1xuLy8gdGhlbTogb25lIHRpY2sgcGVyIFRJQ0tfU0VDT05EUyBvZiBhY3RpdmUgcGxheS4gUnVsZXM6XG4vLyAgIC0gYWN0aXZlIHBsYXkgb25seTogcGF1c2VkLCBoaWRkZW4vc3VzcGVuZGVkIHRhYiwgb3IgYSBub24tbGVhZGVyIHRhYlxuLy8gICAgIGFjY3VtdWxhdGVzIG5vdGhpbmcgKG5vIG9mZmxpbmUgY2F0Y2gtdXApO1xuLy8gICAtIGF0IG1vc3Qgb25lIHRpY2sgcGVyIGNhbGwsIGFuZCB0aGUgYWNjdW11bGF0b3IgaXMgY2FwcGVkLCBzbyByZXN1bWluZyBhXG4vLyAgICAgc3VzcGVuZGVkIHRhYiBuZXZlciBidXJzdHMgbWFueSB0aWNrcztcbi8vICAgLSBkZXRlcm1pbmlzdGljOiB0aGUgZWNvbm9taWMgcmVzdWx0IGRlcGVuZHMgb25seSBvbiB0aGUgam91cm5hbGVkIHRpY2tzLFxuLy8gICAgIG5ldmVyIG9uIGZyYW1lIHRpbWluZy5cblxuZXhwb3J0IGNvbnN0IFRJQ0tfU0VDT05EUyA9IDI7XG4vKiogTmV2ZXIgY2FycnkgbW9yZSB0aGFuIG9uZSBwZW5kaW5nIHRpY2sgYWNyb3NzIGEgbG9uZyBmcmFtZSBvciByZXN1bWUuICovXG5jb25zdCBNQVhfQUNDVU1VTEFURUQgPSBUSUNLX1NFQ09ORFMgKiAxLjU7XG5cbmV4cG9ydCBjbGFzcyBTaW1DbG9jayB7XG4gIHByaXZhdGUgYWNjdW11bGF0ZWQgPSAwO1xuICB0aWNrc0lzc3VlZCA9IDA7XG5cbiAgLyoqIFJldHVybnMgdHJ1ZSB3aGVuIGEgdGljayBpcyBkdWUuIGBkdGAgaXMgcmVhbCBlbGFwc2VkIHNlY29uZHMgc2luY2UgdGhlIGxhc3QgY2FsbC4gKi9cbiAgYWR2YW5jZShkdDogbnVtYmVyLCBhY3RpdmU6IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgICBpZiAoIWFjdGl2ZSB8fCAhTnVtYmVyLmlzRmluaXRlKGR0KSB8fCBkdCA8PSAwKSByZXR1cm4gZmFsc2U7XG4gICAgdGhpcy5hY2N1bXVsYXRlZCA9IE1hdGgubWluKE1BWF9BQ0NVTVVMQVRFRCwgdGhpcy5hY2N1bXVsYXRlZCArIE1hdGgubWluKGR0LCBUSUNLX1NFQ09ORFMpKTtcbiAgICBpZiAodGhpcy5hY2N1bXVsYXRlZCA8IFRJQ0tfU0VDT05EUykgcmV0dXJuIGZhbHNlO1xuICAgIHRoaXMuYWNjdW11bGF0ZWQgLT0gVElDS19TRUNPTkRTO1xuICAgIHRoaXMudGlja3NJc3N1ZWQrKztcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8qKiBGb3JnZXQgcGFydGlhbCBwcm9ncmVzcyAoYWZ0ZXIgcmVzdW1lIG9yIGEgbWFudWFsIHRpbWUgc2tpcCkuICovXG4gIHJlc2V0KCk6IHZvaWQgeyB0aGlzLmFjY3VtdWxhdGVkID0gMDsgfVxuXG4gIC8qKiBTZWNvbmRzIHVudGlsIHRoZSBuZXh0IHRpY2sgd2hpbGUgYWN0aXZlLiAqL1xuICBnZXQgc2Vjb25kc1RvTmV4dCgpOiBudW1iZXIgeyByZXR1cm4gTWF0aC5tYXgoMCwgVElDS19TRUNPTkRTIC0gdGhpcy5hY2N1bXVsYXRlZCk7IH1cbn1cblxuLyoqXG4gKiBUaHJvdHRsZWQgcGVyc2lzdGVuY2U6IHJlYWwtdGltZSB0aWNrcyBtYXJrIHRoZSBzZXNzaW9uIGRpcnR5OyBpdCBpcyBzYXZlZCBhdFxuICogbW9zdCBldmVyeSBgaW50ZXJ2YWxNc2AsIGFuZCBpbW1lZGlhdGVseSB3aGVuIHRoZSB0YWIgaGlkZXMgb3IgY2xvc2VzLlxuICovXG5leHBvcnQgY2xhc3MgU2F2ZVNjaGVkdWxlciB7XG4gIHByaXZhdGUgZGlydHlTaW5jZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbGFzdFNhdmUgPSAtSW5maW5pdHk7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgc2F2ZTogKCkgPT4gdm9pZCwgcHJpdmF0ZSByZWFkb25seSBpbnRlcnZhbE1zID0gMTBfMDAwKSB7fVxuICBtYXJrRGlydHkobm93OiBudW1iZXIpOiB2b2lkIHsgaWYgKHRoaXMuZGlydHlTaW5jZSA9PT0gbnVsbCkgdGhpcy5kaXJ0eVNpbmNlID0gbm93OyB9XG4gIC8qKiBDYWxsIGV2ZXJ5IGZyYW1lLiAqL1xuICBwb2xsKG5vdzogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuZGlydHlTaW5jZSAhPT0gbnVsbCAmJiBub3cgLSB0aGlzLmxhc3RTYXZlID49IHRoaXMuaW50ZXJ2YWxNcykgdGhpcy5mbHVzaChub3cpO1xuICB9XG4gIGZsdXNoKG5vdyA9IERhdGUubm93KCkpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5kaXJ0eVNpbmNlID09PSBudWxsKSByZXR1cm47XG4gICAgdGhpcy5kaXJ0eVNpbmNlID0gbnVsbDtcbiAgICB0aGlzLmxhc3RTYXZlID0gbm93O1xuICAgIHRoaXMuc2F2ZSgpO1xuICB9XG4gIC8qKiBBIHBsYXllciBjb21tYW5kIHNhdmVkIGltbWVkaWF0ZWx5OyBub3RoaW5nIGlzIHBlbmRpbmcuICovXG4gIHNhdmVkKG5vdzogbnVtYmVyKTogdm9pZCB7IHRoaXMuZGlydHlTaW5jZSA9IG51bGw7IHRoaXMubGFzdFNhdmUgPSBub3c7IH1cbiAgZ2V0IHBlbmRpbmcoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmRpcnR5U2luY2UgIT09IG51bGw7IH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBMb2NrU3RvcmFnZSB7XG4gIGdldEl0ZW0oa2V5OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsO1xuICBzZXRJdGVtKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZDtcbiAgcmVtb3ZlSXRlbShrZXk6IHN0cmluZyk6IHZvaWQ7XG59XG5cbi8qKlxuICogT25lIHdyaXRpbmcgdGFiIHBlciB3b3JsZC4gVHdvIHRhYnMgb24gdGhlIHNhbWUgc2F2ZSB3b3VsZCBlYWNoIHRpY2sgYW5kXG4gKiBvdmVyd3JpdGUgdGhlIG90aGVyJ3Mgam91cm5hbDsgdGhlIHNlY29uZCB0YWIgdGhlcmVmb3JlIHN0YXlzIHJlYWQtb25seSBmb3JcbiAqIHNpbXVsYXRpb24gdGltZSB1bnRpbCB0aGUgZmlyc3QgdGFiJ3MgaGVhcnRiZWF0IGxhcHNlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFRhYkxlYXNlIHtcbiAgcmVhZG9ubHkgaWQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyKSArIERhdGUubm93KCkudG9TdHJpbmcoMzYpO1xuICBwcml2YXRlIGxlYWRlciA9IGZhbHNlO1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2U6IExvY2tTdG9yYWdlIHwgbnVsbCwgcHJpdmF0ZSByZWFkb25seSBrZXk6IHN0cmluZyxcbiAgICBwcml2YXRlIHJlYWRvbmx5IHR0bE1zID0gNjAwMCkge31cblxuICAvKiogUmVmcmVzaCB0aGUgbGVhc2U7IHJldHVybnMgd2hldGhlciB0aGlzIHRhYiBtYXkgYWR2YW5jZSBhbmQgc2F2ZSB0aGUgd29ybGQuICovXG4gIGhlYXJ0YmVhdChub3cgPSBEYXRlLm5vdygpKTogYm9vbGVhbiB7XG4gICAgaWYgKCF0aGlzLnN0b3JhZ2UpIHsgdGhpcy5sZWFkZXIgPSB0cnVlOyByZXR1cm4gdHJ1ZTsgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2UuZ2V0SXRlbSh0aGlzLmtleSk7XG4gICAgICBjb25zdCBoZWxkID0gcmF3ID8gSlNPTi5wYXJzZShyYXcpIGFzIHsgaWQ6IHN0cmluZzsgYXQ6IG51bWJlciB9IDogbnVsbDtcbiAgICAgIGlmICghaGVsZCB8fCBoZWxkLmlkID09PSB0aGlzLmlkIHx8IG5vdyAtIGhlbGQuYXQgPiB0aGlzLnR0bE1zKSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5zZXRJdGVtKHRoaXMua2V5LCBKU09OLnN0cmluZ2lmeSh7IGlkOiB0aGlzLmlkLCBhdDogbm93IH0pKTtcbiAgICAgICAgdGhpcy5sZWFkZXIgPSBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZS5nZXRJdGVtKHRoaXMua2V5KSA/PyAne30nKS5pZCA9PT0gdGhpcy5pZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubGVhZGVyID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aGlzLmxlYWRlciA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmxlYWRlcjtcbiAgfVxuXG4gIGdldCBpc0xlYWRlcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMubGVhZGVyOyB9XG5cbiAgcmVsZWFzZSgpOiB2b2lkIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlPy5nZXRJdGVtKHRoaXMua2V5KTtcbiAgICAgIGlmIChyYXcgJiYgSlNPTi5wYXJzZShyYXcpLmlkID09PSB0aGlzLmlkKSB0aGlzLnN0b3JhZ2U/LnJlbW92ZUl0ZW0odGhpcy5rZXkpO1xuICAgIH0gY2F0Y2ggeyAvKiBiZXN0IGVmZm9ydCAqLyB9XG4gIH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxPQUFPLFVBQVU7QUFDakIsT0FBTyxZQUFZOzs7QUNPbkIsSUFBTSxTQUFTLG9CQUFJLFFBQTZCO0FBZXpDLFNBQVMsY0FBYyxPQUF3QjtBQUNwRCxTQUFPLE9BQU8sSUFBSSxLQUFLLEdBQUcsVUFBVTtBQUN0Qzs7O0FDdEJPLElBQU0sUUFBUSxDQUFDLEdBQVcsR0FBVyxNQUFlLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJO0FBQzVFLElBQU0sT0FBTyxDQUFDLEdBQVcsR0FBVyxNQUFjLEtBQUssSUFBSSxLQUFLO0FBQ2hFLElBQU0sYUFBYSxDQUFDLElBQVksSUFBWSxNQUFjO0FBQy9ELFFBQU0sSUFBSSxPQUFPLElBQUksT0FBTyxLQUFLLEtBQUssR0FBRyxDQUFDO0FBQzFDLFNBQU8sSUFBSSxLQUFLLElBQUksSUFBSTtBQUMxQjtBQUdPLFNBQVMsT0FBTyxHQUFXLEdBQVcsTUFBc0I7QUFDakUsTUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLEdBQUcsU0FBUyxJQUFJLEtBQUssS0FBSyxHQUFHLFNBQVM7QUFDL0QsTUFBSSxLQUFLLEtBQUssSUFBSyxNQUFNLElBQUssVUFBVTtBQUN4QyxXQUFTLElBQUssTUFBTSxRQUFTLEtBQUs7QUFDcEM7QUFFTyxTQUFTLE9BQU8sR0FBVyxHQUFXLEdBQVcsTUFBc0I7QUFDNUUsTUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLEdBQUcsU0FBUyxJQUFJLEtBQUssS0FBSyxHQUFHLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FB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LEdBQUcsTUFBTSxPQUFPLElBQUk7QUFBQSxNQUN0QyxHQUFHLEtBQUssQ0FBQyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDLEdBQUcsTUFBTSxNQUFNLEtBQUssTUFBTSxFQUFFLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxLQUFLLENBQUM7QUFBQSxNQUNwSCxHQUFHLE1BQU0sTUFBTSxNQUFNLEdBQUcsTUFBTSxLQUFLLE1BQU0sTUFBTUEsRUFBQztBQUFBLE1BQ2hELEdBQUcsS0FBSyxLQUFLLEtBQUssR0FBRyxNQUFNLE1BQU0sUUFBUSxNQUFNQSxFQUFDO0FBQUEsTUFDaEQsR0FBRyxLQUFLLE1BQU0sTUFBTSxHQUFHLEtBQUssTUFBTSxNQUFNLE1BQU1BLEVBQUM7QUFBQSxNQUMvQyxHQUFHLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQUcsR0FBRyxNQUFNLE1BQU0sTUFBTSxPQUFPLE1BQU0sTUFBTSxXQUFXLE1BQU1BLEVBQUM7QUFBQSxNQUN0SCxHQUFHLE1BQU0sTUFBTSxPQUFPLE1BQU0sTUFBTSxNQUFNLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQUcsR0FBRyxNQUFNLE1BQU0sT0FBTyxPQUFPLE1BQU0sTUFBTSxXQUFXLE1BQU1BLEVBQUM7QUFBQSxNQUN4SCxHQUFHLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQUcsR0FBRyxNQUFNLE1BQU0sTUFBTSxPQUFPLE1BQU0sTUFBTSxXQUFXLE1BQU1BLEVBQUM7QUFBQSxNQUN0SCxHQUFHLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTUEsRUFBQztBQUFBLE1BQUcsR0FBRyxNQUFNLE1BQU0sTUFBTSxPQUFPLE1BQU0sTUFBTSxNQUFNLE1BQU1BLEVBQUM7QUFBQSxNQUM1RyxHQUFHLEtBQUssS0FBSyxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTUEsRUFBQztBQUFBLE1BQUcsR0FBRyxLQUFLLEtBQUssTUFBTSxPQUFPLE1BQU0sTUFBTSxNQUFNLE1BQU1BLEVBQUM7QUFBQSxNQUN4RyxHQUFHLEtBQUssTUFBTSxLQUFLLE1BQU0sS0FBSyxNQUFNLE1BQU0sT0FBTyxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLEtBQUssTUFBTSxLQUFLLE9BQU8sS0FBSyxNQUFNLE1BQU0sT0FBTyxNQUFNQSxFQUFDO0FBQUEsTUFDcEgsR0FBRyxLQUFLLE1BQU0sS0FBSyxHQUFHLE1BQU0sT0FBTyxNQUFNLE1BQU0sQ0FBQyxHQUFHLEtBQUssSUFBSSxDQUFDO0FBQUEsTUFDN0QsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sT0FBTyxNQUFNLE1BQU0sQ0FBQyxHQUFHLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDakU7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxTQUFTLFFBQXFCO0FBQzVCLFFBQU0sT0FBTyxXQUFXLE1BQU0sV0FBVyxPQUFPLFdBQVcsUUFBUSxDQUFDLFdBQVcsV0FBVyxTQUFTO0FBQ25HLFFBQU1BLEtBQThCLENBQUMsR0FBRyxNQUFNLEdBQUc7QUFDakQsUUFBTSxJQUE4QixDQUFDLEdBQUcsTUFBTSxLQUFLO0FBQ25ELFFBQU0sUUFBZ0I7QUFBQSxJQUNwQixHQUFHLEtBQUssS0FBSyxLQUFLLEdBQUcsTUFBTSxPQUFPLFdBQVcsTUFBTSxDQUFDO0FBQUEsSUFDcEQsR0FBRyxLQUFLLENBQUMsQ0FBQyxLQUFLLElBQUksR0FBRyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUMsS0FBSyxLQUFLLEdBQUcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxHQUFHLE1BQU0sTUFBTSxNQUFNLEdBQUc7QUFBQSxFQUN6RjtBQUVBLFFBQU0sSUFBSSxNQUFNLEtBQUssQ0FBQyxPQUFPLE9BQU8sTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLE1BQU0sTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLE9BQU8sT0FBTyxNQUFNLE1BQU0sSUFBSTtBQUM5RyxNQUFJLElBQUk7QUFDUixLQUFHLFFBQVEsQ0FBQyxHQUFHLE9BQU8sR0FBRyxRQUFRLENBQUMsR0FBRyxPQUFPLEdBQUcsUUFBUSxDQUFDLEdBQUcsT0FBTztBQUNoRSxVQUFNLFFBQVEsT0FBTyxLQUFLLE9BQU8sR0FBRyxTQUFTLEtBQUssT0FBTyxLQUFLLE9BQU8sR0FBRyxTQUFTLEtBQUssT0FBTyxLQUFLLE9BQU8sR0FBRyxTQUFTO0FBQ3JILFFBQUksQ0FBQyxNQUFPO0FBQ1o7QUFDQSxRQUFJLEtBQUssR0FBRyxTQUFTLEtBQU0sSUFBSSxPQUFRLE9BQU8sRUFBRztBQUVqRCxVQUFNLElBQUksQ0FBQyxPQUFpQixJQUFJLElBQUssSUFBSyxLQUFLO0FBQy9DLFVBQU0sS0FBSyxHQUFHLEdBQUcsR0FBRyxHQUFHLEtBQUssT0FBTyxLQUFLLE9BQU8sR0FBRyxTQUFTLElBQUksRUFBRSxFQUFFLElBQUksSUFBSSxLQUFLLE9BQU8sR0FBRyxTQUFTLElBQUksRUFBRSxDQUFDLElBQUksSUFBSSxLQUFLLE9BQU8sS0FBSyxPQUFPLEdBQUcsU0FBUyxJQUFJLEVBQUUsRUFBRSxJQUFJLElBQUksTUFBTyxJQUFJLEtBQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDO0FBQUEsRUFDck0sQ0FBQyxDQUFDLENBQUM7QUFDSCxRQUFNO0FBQUEsSUFDSixHQUFHLEtBQUssTUFBTSxNQUFNLEdBQUcsS0FBSyxNQUFNLE1BQU0sTUFBTUEsRUFBQztBQUFBLElBQy9DLEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxLQUFLLEtBQUssTUFBTSxDQUFDLEdBQUcsTUFBTUEsRUFBQztBQUFBLElBQ25ELEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sTUFBTSxNQUFNQSxFQUFDO0FBQUEsSUFDbEQsR0FBRyxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLE1BQU1BLEVBQUM7QUFBQSxJQUFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLE9BQU8sTUFBTSxNQUFNQSxFQUFDO0FBQUEsSUFDOUcsR0FBRyxNQUFNLE1BQU0sS0FBSyxLQUFLLE1BQU0sS0FBSyxNQUFNLE1BQU1BLElBQUcsRUFBRSxJQUFJLEtBQUssQ0FBQztBQUFBLElBQUcsR0FBRyxNQUFNLE1BQU0sS0FBSyxNQUFNLE1BQU0sS0FBSyxNQUFNLE1BQU1BLElBQUcsRUFBRSxJQUFJLElBQUksQ0FBQztBQUFBLElBQ2pJLEdBQUcsTUFBTSxLQUFLLE1BQU0sS0FBSyxLQUFLLE1BQU0sV0FBVyxPQUFPLE1BQU1BLEVBQUM7QUFBQSxJQUFHLEdBQUcsTUFBTSxNQUFNLEtBQUssS0FBSyxLQUFLLE1BQU0sV0FBVyxPQUFPLE1BQU1BLEVBQUM7QUFBQSxJQUM3SCxHQUFHLE1BQU0sS0FBSyxNQUFNLE1BQU0sS0FBSyxNQUFNLFdBQVcsT0FBTyxNQUFNQSxFQUFDO0FBQUEsSUFBRyxHQUFHLE1BQU0sTUFBTSxLQUFLLE1BQU0sS0FBSyxNQUFNLFdBQVcsT0FBTyxNQUFNQSxFQUFDO0FBQUEsSUFDL0gsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxNQUFNLEtBQUssQ0FBQztBQUFBLEVBQ3RFO0FBQ0EsU0FBTyxFQUFFLElBQUksU0FBUyxRQUFRLE1BQU0sTUFBTTtBQUM1QztBQUVBLFNBQVMsT0FBb0I7QUFDM0IsUUFBTSxPQUFPLFdBQVcsUUFBUSxXQUFXLE9BQU8sV0FBVyxPQUFPLFdBQVcsUUFBUSxXQUFXLE9BQU87QUFDekcsUUFBTUEsS0FBOEIsQ0FBQyxHQUFHLEdBQUssR0FBRztBQUNoRCxTQUFPO0FBQUEsSUFDTCxJQUFJO0FBQUEsSUFBUSxRQUFRO0FBQUEsSUFDcEIsT0FBTztBQUFBLE1BQ0wsR0FBRyxNQUFNLE1BQU0sR0FBSyxHQUFHLE1BQU0sT0FBTyxJQUFJO0FBQUEsTUFDeEMsR0FBRyxLQUFLLE1BQU0sTUFBTSxHQUFHLE1BQU0sT0FBTyxLQUFLO0FBQUEsTUFDekMsR0FBRyxNQUFNLE1BQU0sS0FBSyxHQUFHLE1BQU0sR0FBRyxJQUFJO0FBQUEsTUFDcEMsR0FBRyxLQUFLLENBQUMsQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLE9BQU8sSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxPQUFPLEtBQUssQ0FBQyxHQUFHLE1BQU0sS0FBSyxNQUFNLE1BQU0sRUFBRSxHQUFHLE9BQU8sR0FBRyxJQUFJLENBQUM7QUFBQSxNQUNqSCxHQUFHLE1BQU0sS0FBSyxNQUFNLEdBQUcsS0FBSyxLQUFLLE1BQU0sTUFBTUEsRUFBQztBQUFBLE1BQzlDLEdBQUcsS0FBSyxNQUFNLE1BQU0sR0FBRyxNQUFNLEtBQUssTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFDL0MsR0FBRyxNQUFNLE1BQU0sS0FBSyxHQUFHLE1BQU0sTUFBTSxPQUFPLE1BQU1BLEVBQUM7QUFBQSxNQUNqRCxHQUFHLE1BQU0sTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLE1BQU0sTUFBTUEsRUFBQztBQUFBLE1BQ2pELEdBQUcsS0FBSyxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFDckQsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxPQUFPLE1BQU1BLEVBQUM7QUFBQSxNQUNsRCxHQUFHLE1BQU0sTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLE9BQU8sT0FBTyxNQUFNQSxFQUFDO0FBQUEsTUFDekQsR0FBRyxNQUFNLEtBQUssTUFBTSxLQUFLLE1BQU0sT0FBTyxXQUFXLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxLQUFLLE1BQU0sTUFBTSxNQUFNLE9BQU8sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFDcEgsR0FBRyxNQUFNLEtBQUssTUFBTSxLQUFLLE1BQU0sT0FBTyxXQUFXLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxLQUFLLE1BQU0sTUFBTSxNQUFNLE9BQU8sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFDcEgsR0FBRyxNQUFNLEtBQUssTUFBTSxN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WSxDQUFDLE1BQXdDLENBQUMsR0FBRyxNQUFNLEtBQUs7QUFDMUUsU0FBTztBQUFBLElBQ0wsSUFBSTtBQUFBLElBQVcsUUFBUTtBQUFBLElBQU0sV0FBVztBQUFBLElBQ3hDLE9BQU87QUFBQSxNQUNMLEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sS0FBSztBQUFBLE1BQzFDLEdBQUcsS0FBSyxNQUFNLEtBQUssR0FBRyxNQUFNLEtBQUssS0FBSztBQUFBLE1BQ3RDLEdBQUcsTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLEdBQUcsS0FBSyxNQUFNLENBQUMsTUFBTSxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQUcsR0FBRyxNQUFNLE1BQU0sTUFBTSxPQUFPLE1BQU0sR0FBRyxLQUFLLE1BQU0sQ0FBQyxPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDakksR0FBRyxLQUFLLE1BQU0sTUFBTSxNQUFNLE9BQU8sTUFBTSxLQUFLLE1BQU0sQ0FBQyxNQUFNLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFBRyxHQUFHLEtBQUssTUFBTSxNQUFNLE9BQU8sT0FBTyxNQUFNLEtBQUssTUFBTSxDQUFDLE9BQU8sTUFBTSxDQUFDLENBQUM7QUFBQSxNQUN2SSxHQUFHLE1BQU0sS0FBSyxNQUFNLEtBQUssTUFBTSxPQUFPLE9BQU8sTUFBTSxVQUFVLElBQUksQ0FBQztBQUFBLE1BQUcsR0FBRyxNQUFNLEtBQUssTUFBTSxNQUFNLE1BQU0sT0FBTyxPQUFPLE1BQU0sVUFBVSxLQUFLLENBQUM7QUFBQSxNQUN6SSxHQUFHLE1BQU0sTUFBTSxNQUFNLEdBQUcsS0FBSyxLQUFLLE9BQU8sTUFBTUEsRUFBQztBQUFBLE1BQ2hELEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxNQUFNLEtBQUssS0FBSyxNQUFNQSxFQUFDO0FBQUEsTUFDL0MsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sS0FBSyxLQUFLLE9BQU8sTUFBTUEsRUFBQztBQUFBLE1BQ3RELEdBQUcsS0FBSyxNQUFNLEtBQUssR0FBRyxNQUFNLE1BQU0sUUFBUSxNQUFNQSxFQUFDO0FBQUEsTUFDakQsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLEtBQUssTUFBTSxLQUFLLE1BQU1BLEVBQUM7QUFBQSxNQUMvQyxHQUFHLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQUcsR0FBRyxNQUFNLE1BQU0sTUFBTSxPQUFPLE1BQU0sTUFBTSxXQUFXLE1BQU1BLEVBQUM7QUFBQSxNQUN0SCxHQUFHLEtBQUssTUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPLE9BQU8sTUFBTSxDQUFDLEdBQUcsS0FBSyxLQUFLLENBQUM7QUFBQSxNQUNoRSxHQUFHLENBQUMsT0FBTyxPQUFPLE1BQU0sSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLE1BQU0sR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sT0FBUSxJQUFJLElBQUssTUFBTSxTQUFTLE9BQU8sTUFBTSxDQUFDLEdBQUcsS0FBSyxLQUFLLENBQUMsQ0FBQztBQUFBLElBQ3pJO0FBQUEsRUFDRjtBQUNGO0FBRUEsU0FBUyxRQUFxQjtBQUM1QixRQUFNLE9BQU8sV0FBVyxPQUFPLFdBQVcsU0FBUyxXQUFXLE9BQU8sV0FBVyxPQUFPO0FBQ3ZGLFFBQU1BLEtBQThCLENBQUMsR0FBRyxNQUFNLEdBQUc7QUFDakQsU0FBTztBQUFBLElBQ0wsSUFBSTtBQUFBLElBQVMsUUFBUTtBQUFBLElBQ3JCLE9BQU87QUFBQSxNQUNMLEdBQUcsTUFBTSxNQUFNLEtBQUssR0FBRyxNQUFNLE9BQU8sSUFBSTtBQUFBLE1BQ3hDLEdBQUcsS0FBSyxLQUFLLEtBQUssR0FBRyxLQUFLLE9BQU8sU0FBUztBQUFBLE1BQzFDLEdBQUcsS0FBSyxDQUFDLENBQUMsS0FBSyxJQUFJLEdBQUcsQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLEtBQUssSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsR0FBRyxNQUFNLE1BQU0sTUFBTSxNQUFNLEVBQUUsR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLEtBQUssQ0FBQztBQUFBLE1BQ3JILEdBQUcsS0FBSyxLQUFLLE1BQU0sR0FBRyxLQUFLLEtBQUssTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFDN0MsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLEdBQUssTUFBTSxNQUFNLE1BQU1BLEVBQUM7QUFBQSxNQUNoRCxHQUFHLEtBQUssTUFBTSxLQUFLLEdBQUcsTUFBTSxLQUFLLFFBQVEsTUFBTUEsRUFBQztBQUFBLE1BQ2hELEdBQUcsTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLE9BQU8sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sTUFBTSxNQUFNLE9BQU8sTUFBTSxPQUFPLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQ3hILEdBQUcsS0FBSyxLQUFLLE1BQU0sTUFBTSxNQUFNLE9BQU8sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLEtBQUssS0FBSyxNQUFNLE9BQU8sTUFBTSxPQUFPLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQ3BILEdBQUcsTUFBTSxNQUFNLE9BQU8sTUFBTSxNQUFNLE1BQU0sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sTUFBTSxPQUFPLE9BQU8sTUFBTSxNQUFNLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQ3hILEdBQUcsS0FBSyxLQUFLLE1BQU0sS0FBSyxNQUFNLEdBQUssTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLEtBQUssS0FBSyxNQUFNLE1BQU0sTUFBTSxHQUFLLE1BQU0sTUFBTUEsRUFBQztBQUFBLE1BQ3BHLEdBQUcsTUFBTSxNQUFNLE1BQU0sS0FBSyxNQUFNLE9BQU8sTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxPQUFPLE1BQU0sTUFBTUEsRUFBQztBQUFBLE1BQzVHLEdBQUcsS0FBSyxLQUFLLE1BQU0sR0FBRyxNQUFNLEtBQUssTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFDOUMsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxNQUFNLE1BQU1BLEVBQUM7QUFBQSxNQUNqRCxHQUFHLE1BQU0sTUFBTSxNQUFNLEdBQUcsR0FBSyxPQUFPLE1BQU0sTUFBTSxDQUFDLEdBQUcsS0FBSyxJQUFJLENBQUM7QUFBQSxJQUNoRTtBQUFBLEVBQ0Y7QUFDRjtBQUlBLFNBQVMsT0FBb0I7QUFDM0IsUUFBTSxPQUFPLFdBQVcsT0FBTyxXQUFXLFFBQVEsV0FBVyxRQUFRLFdBQVcsU0FBUyxXQUFXLE9BQU87QUFDM0csUUFBTUEsS0FBOEIsQ0FBQyxHQUFHLEtBQUssSUFBSTtBQUNqRCxTQUFPO0FBQUEsSUFDTCxJQUFJO0FBQUEsSUFBUSxRQUFRO0FBQUEsSUFDcEIsT0FBTztBQUFBLE1BQ0wsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLEdBQUssTUFBTSxJQUFJO0FBQUEsTUFDdkMsR0FBRyxNQUFNLE1BQU0sS0FBSyxHQUFHLE1BQU0sT0FBTyxJQUFJO0FBQUEsTUFDeEMsR0FBRyxLQUFLLE1BQU0sS0FBSyxHQUFHLE1BQU0sTUFBTSxJQUFJO0FBQUEsTUFDdEMsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sT0FBTyxLQUFLO0FBQUEsTUFDMUMsR0FBRyxLQUFLLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxLQUFLO0FBQUEsTUFDeEMsR0FBRyxDQUFDLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTTtBQUMxRSxjQUFNLE9BQU8sT0FBTyxHQUFHLENBQUMsR0FBRyxLQUErQixDQUFDLEdBQUcsTUFBTSxDQUFDO0FBQ3JFLGVBQU8sQ0FBQyxHQUFHLEtBQUssTUFBTSxLQUFLLEdBQUcsTUFBTSxHQUFHLE1BQU0sTUFBTSxFQUFFLEdBQUcsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLE1BQU0sRUFBRSxHQUFHLEdBQUcsTUFBTSxNQUFNLEtBQUssR0FBRyxPQUFPLElBQUksTUFBTSxNQUFNLE1BQU0sRUFBRSxDQUFDO0FBQUEsTUFDbkssQ0FBQztBQUFBLE1BQ0QsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sS0FBSyxNQUFNLE1BQU1BLElBQUcsRUFBRSxJQUFJLEtBQUssQ0FBQztBQUFBLE1BQzlELEdBQUcsTUFBTSxLQUFLLEtBQUssR0FBRyxNQUFNLE1BQU0sTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFDL0MsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxPQUFPLE1BQU1BLEVBQUM7QUFBQSxNQUNsRCxHQUFHLE1BQU0sTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQ3RELEdBQUcsTUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLE1BQU0sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sTUFBTSxNQUFNLFFBQVEsTUFBTSxNQUFNLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQ3hILEdBQUcsTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNQSxJQUFHLEVBQUUsSUFBSSxLQUFLLENBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLE1BQU0sTUFBTSxNQUFNQSxJQUFHLEVBQUUsSUFBSSxJQUFJLENBQUM7QUFBQSxNQUN2SSxHQUFHLE1BQU0sS0FBSyxNQUFNLE1BQU0sTUFBTSxNQUFNLFFBQVEsT0FBTyxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sS0FBSyxNQUFNLE9BQU8sTUFBTSxNQUFNLFFBQVEsT0FBTyxNQUFNQSxFQUFDO0FBQUEsTUFDNUgsR0FBRyxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxRQUFRLE9BQU8sTUFBTUEsRUFBQztBQUFBLE1BQUcsR0FBRyxNQUFNLE1BQU0sTUFBTSxPQUFPLE1BQU0sTUFBTSxRQUFRLE9BQU8sTUFBTUEsRUFBQztBQUFBLE1BQzlILEdBQUcsTUFBTSxNQUFNLE1BQU0sS0FBSyxNQUFNLE1BQU0sUUFBUSxPQUFPLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sUUFBUSxPQUFPLE1BQU1BLEVBQUM7QUFBQSxNQUM1SCxHQUFHLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLFFBQVEsT0FBTyxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sTUFBTSxNQUFNLE9BQU8sTUFBTSxNQUFNLFFBQVEsT0FBTyxNQUFNQSxFQUFDO0FBQUEsTUFDOUgsR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLE1BQU0sT0FBTyxPQUFPLE1BQU0sQ0FBQyxHQUFHLEdBQUssSUFBSSxDQUFDO0FBQUEsSUFDbEU7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxTQUFTLE1BQW1CO0FBQzFCLFFBQU0sT0FBTyxXQUFXLFFBQVEsV0FBVyxPQUFPO0FBQ2xELFFBQU1BLEtBQThCLENBQUMsR0FBRyxLQUFLLElBQUk7QUFDakQsUUFBTSxJQUE4QixDQUFDLEdBQUcsTUFBTSxJQUFJO0FBQ2xELFNBQU87QUFBQSxJQUNMLElBQUk7QUFBQSxJQUFPLFFBQVE7QUFBQSxJQUNuQixPQUFPO0FBQUEsTUFDTCxHQUFHLE1BQU0sS0FBSyxNQUFNLEdBQUcsS0FBSyxHQUFHLElBQUk7QUFBQSxNQUNuQyxHQUFHLEtBQUssTUFBTSxNQUFNLEdBQUcsTUFBTSxLQUFLLEtBQUs7QUFBQSxNQUN2QyxHQUFHLENBQUMsQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLE9BQU8sSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxPQUFPLElBQUksQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNO0FBQ2hGLGNBQU0sT0FBTyxPQUFPLEdBQUcsQ0FBQyxHQUFHLEtBQStCLENBQUMsR0FBRyxLQUFLLENBQUM7QUFDcEUsZUFBTyxDQUFDLEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxPQUFPLEdBQUcsTUFBTSxNQUFNLEVBQUUsR0FBRyxHQUFHLE1BQU0sTUFBTSxNQUFNLEdBQUcsT0FBTyxJQUFJLE1BQU0sTUFBTSxNQUFNLEVBQUUsQ0FBQztBQUFBLE1BQ3JILENBQUM7QUFBQSxNQUNELEdBQUcsS0FBSyxNQUFNLE1BQU0sR0FBRyxLQUFLLE1BQU0sTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFDL0MsR0FBRyxNQUFNLEtBQUssTUFBTSxHQUFHLE1BQU0sTUFBTSxPQUFPLE1BQU1BLEVBQUM7QUFBQSxNQUNqRCxHQUFHLE1BQU0sTUFBTSxNQUFNLEdBQUcsTUFBTSxLQUFLLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQ3JELEdBQUcsTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLE9BQU8sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sTUFBTSxNQUFNLE9BQU8sTUFBTSxPQUFPLFdBQVcsTUFBTUEsRUFBQztBQUFBLE1BQ3hILEdBQUcsTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLEtBQUssTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sTUFBTSxNQUFNLE9BQU8sTUFBTSxLQUFLLE1BQU0sTUFBTUEsRUFBQztBQUFBLE1BQzFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLEtBQUssTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFBRyxHQUFHLE1BQU0sTUFBTSxNQUFNLE9BQU8sTUFBTSxLQUFLLE1BQU0sTUFBTUEsRUFBQztBQUFBLE1BQzFHLEdBQUcsTUFBTSxNQUFNLEtBQUssR0FBRyxNQUFNLE1BQU0sTUFBTSxNQUFNLENBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxNQUFNLEtBQUssR0FBRyxLQUFLLE9BQU8sTUFBTSxNQUFNLENBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sT0FBTyxNQUFNLENBQUM7QUFBQSxJQUMzSjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLFNBQVMsT0FBb0I7QUFDM0IsUUFBTSxPQUFPLFdBQVcsT0FB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LE1BQU0sTUFBTSxLQUFLLEdBQUcsTUFBTSxHQUFHLEtBQUs7QUFBQSxNQUNyQyxHQUFHLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxLQUFLLE1BQU0sTUFBTSxDQUFDLE1BQU0sTUFBTSxHQUFHLENBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLEtBQUssTUFBTSxNQUFNLENBQUMsT0FBTyxNQUFNLEdBQUcsQ0FBQztBQUFBLE1BQzNJLEdBQUcsTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLE9BQU8sTUFBTSxNQUFNLENBQUMsTUFBTSxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQUcsR0FBRyxNQUFNLE1BQU0sTUFBTSxPQUFPLE1BQU0sT0FBTyxNQUFNLE1BQU0sQ0FBQyxPQUFPLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDbkosR0FBRyxNQUFNLE1BQU0sTUFBTSxHQUFHLEtBQUssTUFBTSxNQUFNLE1BQU1BLEVBQUM7QUFBQSxNQUNoRCxHQUFHLEtBQUssTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLE9BQU8sTUFBTUEsRUFBQztBQUFBLE1BQ2pELEdBQUcsTUFBTSxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFDbEQsR0FBRyxPQUFPLE1BQU0sTUFBTSxPQUFPLE1BQU0sTUFBTSxXQUFXLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsT0FBTyxNQUFNLE1BQU0sUUFBUSxNQUFNLE1BQU0sV0FBVyxNQUFNQSxFQUFDO0FBQUEsTUFDMUgsR0FBRyxNQUFNLEtBQUssTUFBTSxNQUFNLE1BQU0sS0FBSyxNQUFNLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxLQUFLLE1BQU0sT0FBTyxNQUFNLEtBQUssTUFBTSxNQUFNQSxFQUFDO0FBQUEsTUFDeEcsR0FBRyxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLE1BQU1BLEVBQUM7QUFBQSxNQUFHLEdBQUcsTUFBTSxNQUFNLE1BQU0sT0FBTyxNQUFNLE9BQU8sTUFB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TSxRQUFRLEtBQUssSUFBSSxHQUFHLEtBQUssQ0FBQztBQUM3QyxTQUFPLEdBQUcsTUFBTSxJQUFJLElBQUksS0FBSyx1QkFBdUI7QUFFcEQsU0FBTyxHQUFHLE1BQU0sSUFBSSxJQUFJLFNBQVMsS0FBSyxZQUFZLE1BQU0sSUFBSSxDQUFDLE9BQU8sTUFBTSxTQUFTO0FBQ3JGLENBQUM7QUFFRCxLQUFLLGtHQUFrRyxNQUFNO0FBQzNHLFFBQU0sUUFBUSxZQUFZLE1BQU0sWUFBWTtBQUM1QyxRQUFNLE9BQU8sb0JBQUksSUFBWTtBQUM3QixXQUFTLEtBQUssR0FBRyxLQUFLLEdBQUcsTUFBTTtBQUFFLGdCQUFZLE9BQU8sSUFBSSxDQUFDO0FBQUcsU0FBSyxJQUFJLEdBQUcsRUFBRSxJQUFJO0FBQUEsRUFBRztBQUNqRixRQUFNLE9BQU8sSUFBSSxVQUFVLEtBQUs7QUFDaEMsUUFBTSxPQUFPO0FBQ2IsUUFBTSxTQUFtQixDQUFDO0FBQzFCLFdBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxNQUFNLEtBQUssS0FBSyxlQUFlLEtBQUs7QUFDNUQsU0FBSyxLQUFLLElBQUk7QUFDZCxXQUFPLEtBQUssS0FBSyxVQUFVLElBQUk7QUFBQSxFQUNqQztBQUNBLFNBQU8sVUFBVSxRQUFRLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUNsQyxTQUFPLE1BQU0sS0FBSyxjQUFjLEtBQUs7QUFDckMsT0FBSyxLQUFLLElBQUk7QUFDZCxTQUFPLE1BQU0sS0FBSyxVQUFVLE1BQU0sR0FBRyxvQ0FBb0M7QUFDM0UsQ0FBQzsiLAogICJuYW1lcyI6IFsiYSIsICJiIiwgImhlYWQiLCAiYngiLCAic21vb3RoIiwgIlAiLCAiY3R4IiwgIlRIUkVFIiwgIlAiLCAiY3R4IiwgImhlYWQiXQp9Cg==
