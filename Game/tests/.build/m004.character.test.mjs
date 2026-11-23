// tests/m004.character.test.ts
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
var editVersions = /* @__PURE__ */ new WeakMap();
function editVersion(world) {
  return editVersions.get(world) ?? 0;
}
function markEditsChanged(world) {
  editVersions.set(world, editVersion(world) + 1);
}
function residentChunkAt(world, x, z) {
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return null;
  return world.chunks.get(chunkKey(worldToChunkX(x), worldToChunkZ(z))) ?? null;
}
function residentVoxelAt(world, x, y, z) {
  if (y < Y_MIN) return MAT.BEDROCK;
  if (y >= Y_MAX) return MAT.AIR;
  const chunk = residentChunkAt(world, x, z);
  if (!chunk) return null;
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

// src/sim/terrain.ts
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

// src/sim/character.ts
var CHARACTER_RADIUS = 0.3;
var CHARACTER_HEIGHT = 1.7;
var FIXED_STEP = 1 / 30;
var WALK_SPEED = 4.2;
var RUN_SPEED = 7.5;
var WADE_SPEED = 2.4;
var SWIM_SPEED = 2;
var JUMP_SPEED = 6.6;
var GRAVITY = 22;
var STEP_HEIGHT = 1.05;
var SWIM_DEPTH = 1.25;
function createCharacter(x, y, z, heading = 0) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, heading, grounded: false, mode: "air", speed: 0 };
}
function blocked(world, x, y, z) {
  if (y < Y_MIN) return true;
  const m = residentVoxelAt(world, x, y, z);
  return m === null || isSolid(m);
}
function water(world, x, y, z) {
  return residentVoxelAt(world, x, y, z) === MAT.WATER;
}
function overlapsTerrain(world, x, y, z) {
  const r = CHARACTER_RADIUS - 1e-4;
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const z0 = Math.floor(z - r), z1 = Math.floor(z + r);
  const y0 = Math.floor(y + 1e-3), y1 = Math.floor(y + CHARACTER_HEIGHT - 1e-3);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (blocked(world, cx, cy, cz)) return true;
      }
    }
  }
  return false;
}
function overlapsStructures(world, x, y, z) {
  for (const s of world.structures.values()) {
    for (const m of s.modules) {
      if (m.kind === "crop_row") continue;
      let px = x - m.x, pz = z - m.z;
      if (m.rot) {
        const c = Math.cos(-m.rot), sn = Math.sin(-m.rot);
        const rx = px * c - pz * sn, rz = px * sn + pz * c;
        px = rx;
        pz = rz;
      }
      if (Math.abs(px) < m.w / 2 + CHARACTER_RADIUS && Math.abs(pz) < m.d / 2 + CHARACTER_RADIUS && y + 0.02 < m.y + m.h && y + CHARACTER_HEIGHT > m.y + 0.02) return true;
    }
  }
  return false;
}
function structureFloor(world, x, y, z) {
  let floor = -Infinity;
  for (const s of world.structures.values()) {
    for (const m of s.modules) {
      if (m.kind === "crop_row") continue;
      let px = x - m.x, pz = z - m.z;
      if (m.rot) {
        const c = Math.cos(-m.rot), sn = Math.sin(-m.rot);
        const rx = px * c - pz * sn, rz = px * sn + pz * c;
        px = rx;
        pz = rz;
      }
      if (Math.abs(px) < m.w / 2 + CHARACTER_RADIUS * 0.6 && Math.abs(pz) < m.d / 2 + CHARACTER_RADIUS * 0.6) {
        const top = m.y + m.h;
        if (top <= y + 0.05 && top > floor) floor = top;
      }
    }
  }
  return floor;
}
function overlaps(world, x, y, z) {
  return overlapsTerrain(world, x, y, z) || overlapsStructures(world, x, y, z);
}
function resolveEntities(world, s) {
  const cx = worldToChunkX(Math.floor(s.x)), cz = worldToChunkZ(Math.floor(s.z));
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ids = world.entityChunks.get(chunkKey(cx + dx, cz + dz));
      if (!ids) continue;
      for (const id of ids) {
        const e = world.entities.get(id);
        if (!e || e.harvested || isRetiredStoneKind(e.kind) || world.entityRemovals.has(id)) continue;
        const body = e.kind.startsWith("styl_tree_") ? 0.45 * e.scale : (OBSTRUCTION_RADIUS[e.kind] ?? 0.5) * 0.75 * e.scale;
        if (e.kind === "styl_shrub") continue;
        if (s.y > e.y + 3 || s.y + CHARACTER_HEIGHT < e.y) continue;
        const ox = s.x - e.x, oz = s.z - e.z;
        const d = Math.hypot(ox, oz);
        const min = body + CHARACTER_RADIUS;
        if (d >= min || d < 1e-6) continue;
        const push = min - d;
        const nx = s.x + ox / d * push, nz = s.z + oz / d * push;
        if (!overlaps(world, nx, s.y, nz)) {
          s.x = nx;
          s.z = nz;
        }
      }
    }
  }
}
function feetWaterDepth(world, x, y, z) {
  const fx = Math.floor(x), fz = Math.floor(z);
  let top = Math.floor(y + 0.05);
  if (!water(world, fx, top, fz)) return 0;
  while (water(world, fx, top + 1, fz) && top < y + 4) top++;
  return top + 1 - y;
}
function stepCharacter(world, prev, input, dt = FIXED_STEP) {
  const s = { ...prev };
  const depth = feetWaterDepth(world, s.x, s.y, s.z);
  const swimming = depth >= SWIM_DEPTH;
  const wading = !swimming && depth > 0.2;
  let mx = input.moveX, mz = input.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const target = swimming ? SWIM_SPEED : wading ? WADE_SPEED : input.run ? RUN_SPEED : WALK_SPEED;
  const accel = s.grounded || swimming ? 14 : 4;
  s.vx += (mx * target - s.vx) * Math.min(1, accel * dt);
  s.vz += (mz * target - s.vz) * Math.min(1, accel * dt);
  if (swimming) {
    const surface = s.y + depth;
    const goal = surface - 1.25;
    s.vy += ((goal - s.y) * 6 - s.vy) * Math.min(1, 5 * dt);
    if (input.jump) s.vy = Math.max(s.vy, 2.5);
  } else {
    if (input.jump && s.grounded) {
      s.vy = wading ? JUMP_SPEED * 0.7 : JUMP_SPEED;
      s.grounded = false;
    }
    s.vy -= GRAVITY * dt;
    if (s.vy < -40) s.vy = -40;
  }
  const wasGrounded = s.grounded;
  for (const axis of ["x", "z"]) {
    const delta = (axis === "x" ? s.vx : s.vz) * dt;
    if (delta === 0) continue;
    const nx = axis === "x" ? s.x + delta : s.x;
    const nz = axis === "z" ? s.z + delta : s.z;
    if (!overlaps(world, nx, s.y, nz)) {
      s.x = nx;
      s.z = nz;
      continue;
    }
    if (wasGrounded || swimming || wading) {
      const stepY = Math.floor(s.y + 1e-3) + 1;
      if (stepY - s.y <= STEP_HEIGHT && !overlaps(world, nx, stepY, nz)) {
        s.x = nx;
        s.z = nz;
        s.y = stepY;
        continue;
      }
      const top = structureFloor(world, nx, s.y + STEP_HEIGHT, nz);
      if (top > s.y && top - s.y <= STEP_HEIGHT && !overlaps(world, nx, top, nz)) {
        s.x = nx;
        s.z = nz;
        s.y = top;
        continue;
      }
    }
    if (axis === "x") s.vx = 0;
    else s.vz = 0;
  }
  const ny = s.y + s.vy * dt;
  if (!overlaps(world, s.x, ny, s.z)) {
    s.y = ny;
    s.grounded = false;
  } else if (s.vy <= 0) {
    let floor = Math.floor(s.y + 1e-3);
    while (floor > ny - 1 && overlaps(world, s.x, floor, s.z)) floor++;
    const structTop = structureFloor(world, s.x, s.y + 0.05, s.z);
    s.y = Math.max(floor, structTop > ny - 0.05 ? structTop : -Infinity);
    if (overlaps(world, s.x, s.y, s.z)) s.y = prev.y;
    s.vy = 0;
    s.grounded = true;
  } else {
    s.vy = 0;
  }
  if (!s.grounded && s.vy <= 0) {
    const top = structureFloor(world, s.x, s.y + 0.02, s.z);
    if (top > -Infinity && s.y - top < 0.06) {
      s.y = top;
      s.vy = 0;
      s.grounded = true;
    }
  }
  resolveEntities(world, s);
  const moved = Math.hypot(s.x - prev.x, s.z - prev.z) / dt;
  s.speed = moved;
  if (Math.hypot(mx, mz) > 0.1) {
    const want = Math.atan2(mx, mz);
    let d = want - s.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    s.heading += d * Math.min(1, 12 * dt);
  }
  const depthAfter = feetWaterDepth(world, s.x, s.y, s.z);
  s.mode = depthAfter >= SWIM_DEPTH ? "swim" : !s.grounded ? "air" : depthAfter > 0.2 ? "wade" : "ground";
  if (s.mode === "swim") s.grounded = false;
  return s;
}
function findStandingY(world, x, z, yHint = 120) {
  for (let y = Math.min(110, Math.floor(yHint)); y > Y_MIN; y--) {
    const m = residentVoxelAt(world, Math.floor(x), y - 1, Math.floor(z));
    if (m === null) return null;
    if (isSolid(m) && !overlapsTerrain(world, x, y, z)) return y;
  }
  return null;
}

// tests/m004.character.test.ts
function residentAround(world, x, z, r = 1) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) ensureChunk(world, worldToChunkX(x) + dx, worldToChunkZ(z) + dz);
}
function run(world, s, steps, input) {
  for (let i = 0; i < steps; i++) s = stepCharacter(world, s, { moveX: 0, moveZ: 0, run: false, jump: false, ...input });
  return s;
}
function flatPad() {
  const world = createWorld(1337);
  residentAround(world, 0, 0);
  for (let z = -10; z <= 10; z++) for (let x = -10; x <= 10; x++) {
    for (let y = surfaceAt(world, x, z); y <= 40; y++) setVoxel(world, x, y, z, MAT.AIR);
    setVoxel(world, x, 30, z, MAT.STONE);
  }
  return world;
}
test("character lands, walks and runs at the rule speeds on flat ground", () => {
  const world = flatPad();
  let s = createCharacter(0.5, 33, 0.5);
  s = run(world, s, 30, {});
  assert.equal(s.grounded, true);
  assert.equal(s.y, 31);
  s = run(world, s, 20, { moveZ: 1 });
  assert.ok(Math.abs(s.speed - WALK_SPEED) < 0.2, `walk ${s.speed}`);
  s = run(world, s, 15, { moveZ: 1, run: true });
  assert.ok(Math.abs(s.speed - RUN_SPEED) < 0.3, `run ${s.speed}`);
  assert.equal(s.y, 31, "stays on the ground");
});
test("character steps up one voxel, is blocked by two, and can jump", () => {
  const world = flatPad();
  for (let z = -10; z <= 10; z++) for (let x = 3; x <= 10; x++) setVoxel(world, x, 31, z, MAT.STONE);
  for (let z = -10; z <= 10; z++) for (let x = 7; x <= 10; x++) {
    setVoxel(world, x, 32, z, MAT.STONE);
    setVoxel(world, x, 33, z, MAT.STONE);
  }
  let s = run(world, createCharacter(0.5, 31, 0.5), 10, {});
  s = run(world, s, 30, { moveX: 1 });
  assert.equal(s.y, 32, "climbed the one-voxel ledge");
  s = run(world, s, 60, { moveX: 1 });
  assert.ok(s.x < 7 - 0.29, `a two-voxel wall blocks walking (x=${s.x.toFixed(2)})`);
  const grounded = run(world, s, 5, {});
  const jumped = run(world, grounded, 8, { jump: true });
  assert.ok(jumped.y > grounded.y + 0.5, "jump leaves the ground");
  assert.equal(run(world, jumped, 60, {}).y, grounded.y, "and lands again");
});
test("movement never generates chunks; unloaded terrain acts as a wall", () => {
  const world = flatPad();
  const before = world.chunks.size;
  let s = run(world, createCharacter(0.5, 31, 0.5), 10, {});
  s = run(world, s, 600, { moveX: 1, run: true });
  assert.equal(world.chunks.size, before, "no chunk generation during movement");
  assert.ok(s.x < 64 + 0.5, `stops at the resident edge (x=${s.x.toFixed(1)})`);
  assert.equal(findStandingY(world, 900, 900), null);
});
test("stepping is deterministic", () => {
  const world = flatPad();
  const a = run(world, createCharacter(0.5, 33, 0.5), 200, { moveX: 0.6, moveZ: 0.8, run: true });
  const b = run(world, createCharacter(0.5, 33, 0.5), 200, { moveX: 0.6, moveZ: 0.8, run: true });
  assert.deepEqual(a, b);
  assert.ok(FIXED_STEP > 0);
});
test("character swims in the deep mountain river instead of sinking", () => {
  const world = createWorld(1337, GENERATOR_V2);
  const p = hydrologyFor(1337, GENERATOR_V2).upper.points.find((q) => q.level > 20);
  residentAround(world, p.x, p.z);
  const level = Math.round(p.level);
  let s = createCharacter(Math.floor(p.x) + 0.5, level + 0.5, Math.floor(p.z) + 0.5);
  s = run(world, s, 90, {});
  assert.ok(s.y >= surfaceAt(world, Math.floor(s.x), Math.floor(s.z)) - 1e-6, "never below the bed");
  assert.ok(["swim", "wade", "ground"].includes(s.mode));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwNC5jaGFyYWN0ZXIudGVzdC50cyIsICIuLi8uLi9zcmMvc2ltL3N0b25lLWNvbXBhdC50cyIsICIuLi8uLi9zcmMvc2ltL25vaXNlLnRzIiwgIi4uLy4uL3NyYy9zaW0vaHlkcm9sb2d5LnRzIiwgIi4uLy4uL3NyYy9zaW0vbWF0ZXJpYWxzLnRzIiwgIi4uLy4uL3NyYy9zaW0vdGVycmFpbi12Mi50cyIsICIuLi8uLi9zcmMvc2ltL3dvcmxkLnRzIiwgIi4uLy4uL3NyYy9zaW0vdGVycmFpbi50cyIsICIuLi8uLi9zcmMvc2ltL2NoYXJhY3Rlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCB7IEdFTkVSQVRPUl9WMiwgTUFULCBjcmVhdGVXb3JsZCwgZW5zdXJlQ2h1bmssIGh5ZHJvbG9neUZvciwgc2V0Vm94ZWwsIHN1cmZhY2VBdCwgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiB9IGZyb20gJy4uL3NyYy9zaW0vd29ybGQnO1xuaW1wb3J0IHtcbiAgQ2hhcmFjdGVyU3RhdGUsIEZJWEVEX1NURVAsIFJVTl9TUEVFRCwgV0FMS19TUEVFRCwgY3JlYXRlQ2hhcmFjdGVyLCBmaW5kU3RhbmRpbmdZLCBzdGVwQ2hhcmFjdGVyLFxufSBmcm9tICcuLi9zcmMvc2ltL2NoYXJhY3Rlcic7XG5cbmZ1bmN0aW9uIHJlc2lkZW50QXJvdW5kKHdvcmxkOiBSZXR1cm5UeXBlPHR5cGVvZiBjcmVhdGVXb3JsZD4sIHg6IG51bWJlciwgejogbnVtYmVyLCByID0gMSkge1xuICBmb3IgKGxldCBkeiA9IC1yOyBkeiA8PSByOyBkeisrKSBmb3IgKGxldCBkeCA9IC1yOyBkeCA8PSByOyBkeCsrKSBlbnN1cmVDaHVuayh3b3JsZCwgd29ybGRUb0NodW5rWCh4KSArIGR4LCB3b3JsZFRvQ2h1bmtaKHopICsgZHopO1xufVxuXG5mdW5jdGlvbiBydW4od29ybGQ6IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZVdvcmxkPiwgczogQ2hhcmFjdGVyU3RhdGUsIHN0ZXBzOiBudW1iZXIsIGlucHV0OiBQYXJ0aWFsPHsgbW92ZVg6IG51bWJlcjsgbW92ZVo6IG51bWJlcjsgcnVuOiBib29sZWFuOyBqdW1wOiBib29sZWFuIH0+KSB7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc3RlcHM7IGkrKykgcyA9IHN0ZXBDaGFyYWN0ZXIod29ybGQsIHMsIHsgbW92ZVg6IDAsIG1vdmVaOiAwLCBydW46IGZhbHNlLCBqdW1wOiBmYWxzZSwgLi4uaW5wdXQgfSk7XG4gIHJldHVybiBzO1xufVxuXG4vKiogQSBmbGF0IDIwIHggMjAgc3RvbmUgcGFkIGF0IHkgPSAzMCAodG9wIGZhY2UgeSA9IDMxKSwgY2xlYXIgYWJvdmUuICovXG5mdW5jdGlvbiBmbGF0UGFkKCkge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKDEzMzcpO1xuICByZXNpZGVudEFyb3VuZCh3b3JsZCwgMCwgMCk7XG4gIGZvciAobGV0IHogPSAtMTA7IHogPD0gMTA7IHorKykgZm9yIChsZXQgeCA9IC0xMDsgeCA8PSAxMDsgeCsrKSB7XG4gICAgZm9yIChsZXQgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7IHkgPD0gNDA7IHkrKykgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIE1BVC5BSVIpO1xuICAgIHNldFZveGVsKHdvcmxkLCB4LCAzMCwgeiwgTUFULlNUT05FKTtcbiAgfVxuICByZXR1cm4gd29ybGQ7XG59XG5cbnRlc3QoJ2NoYXJhY3RlciBsYW5kcywgd2Fsa3MgYW5kIHJ1bnMgYXQgdGhlIHJ1bGUgc3BlZWRzIG9uIGZsYXQgZ3JvdW5kJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGZsYXRQYWQoKTtcbiAgbGV0IHMgPSBjcmVhdGVDaGFyYWN0ZXIoMC41LCAzMywgMC41KTtcbiAgcyA9IHJ1bih3b3JsZCwgcywgMzAsIHt9KTtcbiAgYXNzZXJ0LmVxdWFsKHMuZ3JvdW5kZWQsIHRydWUpO1xuICBhc3NlcnQuZXF1YWwocy55LCAzMSk7XG4gIHMgPSBydW4od29ybGQsIHMsIDIwLCB7IG1vdmVaOiAxIH0pO1xuICBhc3NlcnQub2soTWF0aC5hYnMocy5zcGVlZCAtIFdBTEtfU1BFRUQpIDwgMC4yLCBgd2FsayAke3Muc3BlZWR9YCk7XG4gIHMgPSBydW4od29ybGQsIHMsIDE1LCB7IG1vdmVaOiAxLCBydW46IHRydWUgfSk7XG4gIGFzc2VydC5vayhNYXRoLmFicyhzLnNwZWVkIC0gUlVOX1NQRUVEKSA8IDAuMywgYHJ1biAke3Muc3BlZWR9YCk7XG4gIGFzc2VydC5lcXVhbChzLnksIDMxLCAnc3RheXMgb24gdGhlIGdyb3VuZCcpO1xufSk7XG5cbnRlc3QoJ2NoYXJhY3RlciBzdGVwcyB1cCBvbmUgdm94ZWwsIGlzIGJsb2NrZWQgYnkgdHdvLCBhbmQgY2FuIGp1bXAnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gZmxhdFBhZCgpO1xuICBmb3IgKGxldCB6ID0gLTEwOyB6IDw9IDEwOyB6KyspIGZvciAobGV0IHggPSAzOyB4IDw9IDEwOyB4KyspIHNldFZveGVsKHdvcmxkLCB4LCAzMSwgeiwgTUFULlNUT05FKTtcbiAgZm9yIChsZXQgeiA9IC0xMDsgeiA8PSAxMDsgeisrKSBmb3IgKGxldCB4ID0gNzsgeCA8PSAxMDsgeCsrKSB7IHNldFZveGVsKHdvcmxkLCB4LCAzMiwgeiwgTUFULlNUT05FKTsgc2V0Vm94ZWwod29ybGQsIHgsIDMzLCB6LCBNQVQuU1RPTkUpOyB9XG4gIGxldCBzID0gcnVuKHdvcmxkLCBjcmVhdGVDaGFyYWN0ZXIoMC41LCAzMSwgMC41KSwgMTAsIHt9KTtcbiAgcyA9IHJ1bih3b3JsZCwgcywgMzAsIHsgbW92ZVg6IDEgfSk7XG4gIGFzc2VydC5lcXVhbChzLnksIDMyLCAnY2xpbWJlZCB0aGUgb25lLXZveGVsIGxlZGdlJyk7XG4gIHMgPSBydW4od29ybGQsIHMsIDYwLCB7IG1vdmVYOiAxIH0pO1xuICBhc3NlcnQub2socy54IDwgNyAtIDAuMjksIGBhIHR3by12b3hlbCB3YWxsIGJsb2NrcyB3YWxraW5nICh4PSR7cy54LnRvRml4ZWQoMil9KWApO1xuICBjb25zdCBncm91bmRlZCA9IHJ1bih3b3JsZCwgcywgNSwge30pO1xuICBjb25zdCBqdW1wZWQgPSBydW4od29ybGQsIGdyb3VuZGVkLCA4LCB7IGp1bXA6IHRydWUgfSk7XG4gIGFzc2VydC5vayhqdW1wZWQueSA+IGdyb3VuZGVkLnkgKyAwLjUsICdqdW1wIGxlYXZlcyB0aGUgZ3JvdW5kJyk7XG4gIGFzc2VydC5lcXVhbChydW4od29ybGQsIGp1bXBlZCwgNjAsIHt9KS55LCBncm91bmRlZC55LCAnYW5kIGxhbmRzIGFnYWluJyk7XG59KTtcblxudGVzdCgnbW92ZW1lbnQgbmV2ZXIgZ2VuZXJhdGVzIGNodW5rczsgdW5sb2FkZWQgdGVycmFpbiBhY3RzIGFzIGEgd2FsbCcsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBmbGF0UGFkKCk7XG4gIGNvbnN0IGJlZm9yZSA9IHdvcmxkLmNodW5rcy5zaXplO1xuICBsZXQgcyA9IHJ1bih3b3JsZCwgY3JlYXRlQ2hhcmFjdGVyKDAuNSwgMzEsIDAuNSksIDEwLCB7fSk7XG4gIHMgPSBydW4od29ybGQsIHMsIDYwMCwgeyBtb3ZlWDogMSwgcnVuOiB0cnVlIH0pO1xuICBhc3NlcnQuZXF1YWwod29ybGQuY2h1bmtzLnNpemUsIGJlZm9yZSwgJ25vIGNodW5rIGdlbmVyYXRpb24gZHVyaW5nIG1vdmVtZW50Jyk7XG4gIGFzc2VydC5vayhzLnggPCA2NCArIDAuNSwgYHN0b3BzIGF0IHRoZSByZXNpZGVudCBlZGdlICh4PSR7cy54LnRvRml4ZWQoMSl9KWApO1xuICBhc3NlcnQuZXF1YWwoZmluZFN0YW5kaW5nWSh3b3JsZCwgOTAwLCA5MDApLCBudWxsKTtcbn0pO1xuXG50ZXN0KCdzdGVwcGluZyBpcyBkZXRlcm1pbmlzdGljJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGZsYXRQYWQoKTtcbiAgY29uc3QgYSA9IHJ1bih3b3JsZCwgY3JlYXRlQ2hhcmFjdGVyKDAuNSwgMzMsIDAuNSksIDIwMCwgeyBtb3ZlWDogMC42LCBtb3ZlWjogMC44LCBydW46IHRydWUgfSk7XG4gIGNvbnN0IGIgPSBydW4od29ybGQsIGNyZWF0ZUNoYXJhY3RlcigwLjUsIDMzLCAwLjUpLCAyMDAsIHsgbW92ZVg6IDAuNiwgbW92ZVo6IDAuOCwgcnVuOiB0cnVlIH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGEsIGIpO1xuICBhc3NlcnQub2soRklYRURfU1RFUCA+IDApO1xufSk7XG5cbnRlc3QoJ2NoYXJhY3RlciBzd2ltcyBpbiB0aGUgZGVlcCBtb3VudGFpbiByaXZlciBpbnN0ZWFkIG9mIHNpbmtpbmcnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoMTMzNywgR0VORVJBVE9SX1YyKTtcbiAgY29uc3QgcCA9IGh5ZHJvbG9neUZvcigxMzM3LCBHRU5FUkFUT1JfVjIpLnVwcGVyIS5wb2ludHMuZmluZCgocSkgPT4gcS5sZXZlbCA+IDIwKSE7XG4gIHJlc2lkZW50QXJvdW5kKHdvcmxkLCBwLngsIHAueik7XG4gIGNvbnN0IGxldmVsID0gTWF0aC5yb3VuZChwLmxldmVsKTtcbiAgbGV0IHMgPSBjcmVhdGVDaGFyYWN0ZXIoTWF0aC5mbG9vcihwLngpICsgMC41LCBsZXZlbCArIDAuNSwgTWF0aC5mbG9vcihwLnopICsgMC41KTtcbiAgcyA9IHJ1bih3b3JsZCwgcywgOTAsIHt9KTtcbiAgYXNzZXJ0Lm9rKHMueSA+PSBzdXJmYWNlQXQod29ybGQsIE1hdGguZmxvb3Iocy54KSwgTWF0aC5mbG9vcihzLnopKSAtIDFlLTYsICduZXZlciBiZWxvdyB0aGUgYmVkJyk7XG4gIGFzc2VydC5vayhbJ3N3aW0nLCAnd2FkZScsICdncm91bmQnXS5pbmNsdWRlcyhzLm1vZGUpKTtcbn0pO1xuIiwgIi8vIFByaXZhdGUgbWlncmF0aW9uIHJlcGxheSBvbmx5LiBSZXRpcmVkIGVudGl0aWVzIGxpdmUgaW4gdGhpcyBXb3JsZCB3aGlsZSBhblxuLy8gYWNjZXB0ZWQgaGlzdG9yaWNhbCBqb3VybmFsIGlzIGNoZWNrZWQ7IG5vIHB1YmxpYyBjb21tYW5kIGVuYWJsZXMgdGhpcyBtb2RlLlxuaW50ZXJmYWNlIFJlcGxheVN0YXRlIHtcbiAgYWN0aXZlOiBib29sZWFuO1xuICBoaXN0b3JpY2FsSGFzaDogYm9vbGVhbjtcbiAgbWlncmF0ZWQ6IGJvb2xlYW47XG59XG5cbmNvbnN0IHN0YXRlcyA9IG5ldyBXZWFrTWFwPG9iamVjdCwgUmVwbGF5U3RhdGU+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiByZXBsYXlTdG9uZVN0YXRlKHdvcmxkOiBvYmplY3QpOiBSZXBsYXlTdGF0ZSB7XG4gIGxldCBzdGF0ZSA9IHN0YXRlcy5nZXQod29ybGQpO1xuICBpZiAoIXN0YXRlKSB7IHN0YXRlID0geyBhY3RpdmU6IGZhbHNlLCBoaXN0b3JpY2FsSGFzaDogZmFsc2UsIG1pZ3JhdGVkOiBmYWxzZSB9OyBzdGF0ZXMuc2V0KHdvcmxkLCBzdGF0ZSk7IH1cbiAgcmV0dXJuIHN0YXRlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSB0cnVlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG4gIHN0YXRlLm1pZ3JhdGVkID0gZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5hY3RpdmUgPz8gZmFsc2U7XG59XG5cbi8qKiBTbmFwc2hvdCBoYXNoZXMgYmVmb3JlIGFuZCBkdXJpbmcgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkgaW5jbHVkZSBzdG9uZXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uaGlzdG9yaWNhbEhhc2ggPz8gZmFsc2U7XG59XG5cbi8qKiBBIG1pZ3JhdGVkIHNuYXBzaG90IGFscmVhZHkgaGFzIHJldGlyZW1lbnQgdG9tYnN0b25lcyBpbiBnZW5lcmF0ZWQgY2h1bmtzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtTdG9uZU1pZ3JhdGVkKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkubWlncmF0ZWQgPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZU1pZ3JhdGVkKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5taWdyYXRlZCA/PyBmYWxzZTtcbn1cblxuLyoqIEV4aXQgaGlzdG9yaWNhbCBtb2RlIGFmdGVyIGFsbCBhY2NlcHRlZCBjb21tYW5kcyBhbmQgaGFzaGVzIGhhdmUgcGFzc2VkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmlzaFN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gZmFsc2U7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gZmFsc2U7XG4gIHN0YXRlLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cbiIsICIvLyBEZXRlcm1pbmlzdGljIGhhc2gsIG5vaXNlIGFuZCBtYXRoIGhlbHBlcnMgc2hhcmVkIGJ5IHRoZSBzaW11bGF0aW9uIGxheWVyLlxuLy8gUHVyZSBUeXBlU2NyaXB0IChELTAwNSkuIEV4dHJhY3RlZCBmcm9tIHdvcmxkLnRzIHVuY2hhbmdlZCBzbyB0ZXJyYWluXG4vLyBnZW5lcmF0b3JzIG9mIGV2ZXJ5IHZlcnNpb24gdXNlIGlkZW50aWNhbCBwcmltaXRpdmVzLlxuZXhwb3J0IGNvbnN0IGNsYW1wID0gKHY6IG51bWJlciwgYTogbnVtYmVyLCBiOiBudW1iZXIpID0+ICh2IDwgYSA/IGEgOiB2ID4gYiA/IGIgOiB2KTtcbmV4cG9ydCBjb25zdCBsZXJwID0gKGE6IG51bWJlciwgYjogbnVtYmVyLCB0OiBudW1iZXIpID0+IGEgKyAoYiAtIGEpICogdDtcbmV4cG9ydCBjb25zdCBzbW9vdGhzdGVwID0gKGUwOiBudW1iZXIsIGUxOiBudW1iZXIsIHg6IG51bWJlcikgPT4ge1xuICBjb25zdCB0ID0gY2xhbXAoKHggLSBlMCkgLyAoZTEgLSBlMCksIDAsIDEpO1xuICByZXR1cm4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcbn07XG5cbi8vIC0tLS0tLS0tLS0gZGV0ZXJtaW5pc3RpYyBoYXNoIC8gbm9pc2UgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gyaSh4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzaDNpKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2MykgXiBNYXRoLmltdWwoeiwgMjI0NjgyMjUxOSk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG11bGJlcnJ5MzIoc2VlZDogbnVtYmVyKTogKCkgPT4gbnVtYmVyIHtcbiAgbGV0IGEgPSBzZWVkID4+PiAwO1xuICByZXR1cm4gKCkgPT4ge1xuICAgIGEgPSAoYSArIDB4NmQyYjc5ZjUpID4+PiAwO1xuICAgIGxldCB0ID0gYTtcbiAgICB0ID0gTWF0aC5pbXVsKHQgXiAodCA+Pj4gMTUpLCB0IHwgMSk7XG4gICAgdCBePSB0ICsgTWF0aC5pbXVsKHQgXiAodCA+Pj4gNyksIHQgfCA2MSk7XG4gICAgcmV0dXJuICgodCBeICh0ID4+PiAxNCkpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBzbW9vdGggPSAodDogbnVtYmVyKSA9PiB0ICogdCAqICgzIC0gMiAqIHQpO1xuXG5leHBvcnQgZnVuY3Rpb24gdmFsdWVOb2lzZTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpO1xuICBjb25zdCBhID0gaGFzaDJpKHhpLCB5aSwgc2VlZCksIGIgPSBoYXNoMmkoeGkgKyAxLCB5aSwgc2VlZCk7XG4gIGNvbnN0IGMgPSBoYXNoMmkoeGksIHlpICsgMSwgc2VlZCksIGQgPSBoYXNoMmkoeGkgKyAxLCB5aSArIDEsIHNlZWQpO1xuICBjb25zdCB0b3AgPSBhICsgKGIgLSBhKSAqIHhmO1xuICBjb25zdCBib3R0b20gPSBjICsgKGQgLSBjKSAqIHhmO1xuICByZXR1cm4gdG9wICsgKGJvdHRvbSAtIHRvcCkgKiB5Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTIoeCAqIGZyZXEsIHkgKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdmFsdWVOb2lzZTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSksIHppID0gTWF0aC5mbG9vcih6KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKSwgemYgPSBzbW9vdGgoeiAtIHppKTtcbiAgY29uc3QgYzAwMCA9IGhhc2gzaSh4aSwgeWksIHppLCBzZWVkKSwgYzEwMCA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSwgc2VlZCk7XG4gIGNvbnN0IGMwMTAgPSBoYXNoM2koeGksIHlpICsgMSwgemksIHNlZWQpLCBjMTEwID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSwgc2VlZCk7XG4gIGNvbnN0IGMwMDEgPSBoYXNoM2koeGksIHlpLCB6aSArIDEsIHNlZWQpLCBjMTAxID0gaGFzaDNpKHhpICsgMSwgeWksIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IGMwMTEgPSBoYXNoM2koeGksIHlpICsgMSwgemkgKyAxLCBzZWVkKSwgYzExMSA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgeDAwID0gYzAwMCArIChjMTAwIC0gYzAwMCkgKiB4ZjtcbiAgY29uc3QgeDEwID0gYzAxMCArIChjMTEwIC0gYzAxMCkgKiB4ZjtcbiAgY29uc3QgeDAxID0gYzAwMSArIChjMTAxIC0gYzAwMSkgKiB4ZjtcbiAgY29uc3QgeDExID0gYzAxMSArIChjMTExIC0gYzAxMSkgKiB4ZjtcbiAgY29uc3QgeTAgPSB4MDAgKyAoeDEwIC0geDAwKSAqIHlmO1xuICBjb25zdCB5MSA9IHgwMSArICh4MTEgLSB4MDEpICogeWY7XG4gIHJldHVybiB5MCArICh5MSAtIHkwKSAqIHpmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UzKHggKiBmcmVxLCB5ICogZnJlcSwgeiAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbiIsICIvLyBIeWRyb2xvZ3kgXHUyMDE0IHRoZSBkZXRlcm1pbmlzdGljIHdhdGVyIG5ldHdvcmsgb2YgYSB3b3JsZCAocHVyZSBUeXBlU2NyaXB0LCBELTAwNSkuXG4vL1xuLy8gVGhpcyBpcyBkZXJpdmVkICpzaW11bGF0aW9uIGRhdGEqLCBub3QgcHJlc2VudGF0aW9uOiBpdCBpcyBhIHB1cmUgZnVuY3Rpb24gb2Zcbi8vIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbikgYW5kIGlzIHdoYXQgdGVycmFpbiBjYXJ2aW5nLCB3YXRlciBmaWxsaW5nLCBmbG93XG4vLyBkaXJlY3Rpb24gYW5kIGZ1dHVyZSBmaXNoaW5nL2lycmlnYXRpb24vZmxvb2RpbmcgcnVsZXMgcmVhZC4gSXQgaXMgbmV2ZXJcbi8vIGpvdXJuYWxlZCBiZWNhdXNlIGl0IGNhbiBhbHdheXMgYmUgcmVnZW5lcmF0ZWQgZXhhY3RseS5cbi8vXG4vLyBOZXR3b3JrIChib3RoIGdlbmVyYXRvciB2ZXJzaW9ucyk6XG4vLyAgIGxha2UgIFx1MjAxNCB0aGUgdmFsbGV5IGxha2UgYmFzaW4sIGxvY2F0ZWQgZnJvbSB0aGUgYWN0dWFsIGdlbmVyYXRlZCB0ZXJyYWluLlxuLy8gICBsb3dlciBcdTIwMTQgdGhlIGxvd2xhbmQgcml2ZXIgZnJvbSB0aGUgbGFrZSB0byB0aGUgc291dGhlcm4gc2VhLCB0cmFjZWQgZnJvbVxuLy8gICAgICAgICAgIHRoZSBhY3R1YWwgY2FydmVkIGNoYW5uZWwgKHRoZSB2MSBjaGFubmVsIGlzIGNhcnZlZCBvbiAqd2FycGVkKlxuLy8gICAgICAgICAgIGNvb3JkaW5hdGVzLCBzbyBgcml2ZXJDZW50ZXJYYCBhbG9uZSBpcyB1cCB0byB+MTM1IG0gb2ZmKS5cbi8vIEdlbmVyYXRvciB2MiBhZGRzOlxuLy8gICB1cHBlciBcdTIwMTQgYSBtb3VudGFpbiByaXZlciBmcm9tIGEgaGlnaGxhbmQgdGFybiBkb3duIHRvIHRoZSBsYWtlLCB3aXRoIGFcbi8vICAgICAgICAgICB3YXRlci1zdXJmYWNlIGxldmVsIHRoYXQgbmV2ZXIgcmlzZXMgZG93bnN0cmVhbSwgY2FzY2FkZXMgYW5kIGZhbGxzLlxuLy9cbi8vIEZsb3cgYWx3YXlzIHBvaW50cyBkb3duc3RyZWFtOiB1cHBlciBcdTIxOTIgbGFrZSBcdTIxOTIgbG93ZXIgXHUyMTkyIHNlYS5cbmltcG9ydCB7IGNsYW1wLCBmYm0yLCBtdWxiZXJyeTMyLCBzbW9vdGhzdGVwIH0gZnJvbSAnLi9ub2lzZSc7XG5cbmV4cG9ydCB0eXBlIEhlaWdodFNhbXBsZXIgPSAoeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IG51bWJlcjtcblxuZXhwb3J0IGludGVyZmFjZSBSaXZlclBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIC8qKiBBcmMgbGVuZ3RoIGZyb20gdGhlIGRvd25zdHJlYW0gZW5kIG9mIHRoaXMgcmVhY2ggKG1ldHJlcykuICovXG4gIHM6IG51bWJlcjtcbiAgLyoqIFdhdGVyLXN1cmZhY2UgZWxldmF0aW9uIChtZXRyZXMsIG1heSBiZSBmcmFjdGlvbmFsKS4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgLyoqIENoYW5uZWwgaGFsZi13aWR0aCAobWV0cmVzKS4gKi9cbiAgd2lkdGg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWFjaEhpdCB7XG4gIC8qKiBIb3Jpem9udGFsIGRpc3RhbmNlIGZyb20gdGhlIGNlbnRyZWxpbmUuICovXG4gIGQ6IG51bWJlcjtcbiAgLyoqIEludGVycG9sYXRlZCB3YXRlciBsZXZlbCBhdCB0aGUgbmVhcmVzdCBjZW50cmVsaW5lIHBvaW50LiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICB3aWR0aDogbnVtYmVyO1xuICAvKiogVW5pdCBkb3duc3RyZWFtIGRpcmVjdGlvbi4gKi9cbiAgdHg6IG51bWJlcjtcbiAgdHo6IG51bWJlcjtcbiAgLyoqIFdhdGVyLXN1cmZhY2UgZHJvcCBwZXIgbWV0cmUgYWxvbmcgdGhlIGNoYW5uZWwgKD49IDApLiAqL1xuICBncmFkaWVudDogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBvZiB0aGUgbmVhcmVzdCBwb2ludCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZC4gKi9cbiAgczogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgcG9seWxpbmUgcmVhY2ggc3RvcmVkIGRvd25zdHJlYW0tZmlyc3QuIE5lYXJlc3Qtc2VnbWVudCBxdWVyaWVzIHVzZSBhXG4gKiB1bmlmb3JtIGdyaWQgd2hvc2UgY2VsbHMgbGlzdCBldmVyeSBzZWdtZW50IHdpdGhpbiBgcmVhY2hgIG1ldHJlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFJpdmVyUmVhY2gge1xuICByZWFkb25seSBwb2ludHM6IFJpdmVyUG9pbnRbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBjZWxsID0gMzI7XG4gIHByaXZhdGUgcmVhZG9ubHkgZ3JpZCA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXJbXT4oKTtcblxuICBjb25zdHJ1Y3Rvcihwb2ludHM6IFJpdmVyUG9pbnRbXSwgcmVhZG9ubHkgcmVhY2g6IG51bWJlcikge1xuICAgIHRoaXMucG9pbnRzID0gcG9pbnRzO1xuICAgIGZvciAobGV0IGkgPSAwOyBpICsgMSA8IHBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgYSA9IHBvaW50c1tpXSwgYiA9IHBvaW50c1tpICsgMV07XG4gICAgICBjb25zdCB4MCA9IE1hdGgubWluKGEueCwgYi54KSAtIHJlYWNoLCB4MSA9IE1hdGgubWF4KGEueCwgYi54KSArIHJlYWNoO1xuICAgICAgY29uc3QgejAgPSBNYXRoLm1pbihhLnosIGIueikgLSByZWFjaCwgejEgPSBNYXRoLm1heChhLnosIGIueikgKyByZWFjaDtcbiAgICAgIGZvciAobGV0IGN6ID0gTWF0aC5mbG9vcih6MCAvIHRoaXMuY2VsbCk7IGN6IDw9IE1hdGguZmxvb3IoejEgLyB0aGlzLmNlbGwpOyBjeisrKSB7XG4gICAgICAgIGZvciAobGV0IGN4ID0gTWF0aC5mbG9vcih4MCAvIHRoaXMuY2VsbCk7IGN4IDw9IE1hdGguZmxvb3IoeDEgLyB0aGlzLmNlbGwpOyBjeCsrKSB7XG4gICAgICAgICAgY29uc3Qga2V5ID0gY2VsbEtleShjeCwgY3opO1xuICAgICAgICAgIGxldCBsaXN0ID0gdGhpcy5ncmlkLmdldChrZXkpO1xuICAgICAgICAgIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHRoaXMuZ3JpZC5zZXQoa2V5LCBsaXN0KTsgfVxuICAgICAgICAgIGxpc3QucHVzaChpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBsZW5ndGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMucG9pbnRzW3RoaXMucG9pbnRzLmxlbmd0aCAtIDFdPy5zID8/IDA7IH1cblxuICAvKiogTmVhcmVzdCBjZW50cmVsaW5lIHBvaW50IHdpdGhpbiBgcmVhY2hgLCBvciBudWxsLiAqL1xuICBuZWFyZXN0KHg6IG51bWJlciwgejogbnVtYmVyKTogUmVhY2hIaXQgfCBudWxsIHtcbiAgICBjb25zdCBsaXN0ID0gdGhpcy5ncmlkLmdldChjZWxsS2V5KE1hdGguZmxvb3IoeCAvIHRoaXMuY2VsbCksIE1hdGguZmxvb3IoeiAvIHRoaXMuY2VsbCkpKTtcbiAgICBpZiAoIWxpc3QpIHJldHVybiBudWxsO1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJpID0gLTEsIGJ0ID0gMDtcbiAgICBmb3IgKGNvbnN0IGkgb2YgbGlzdCkge1xuICAgICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2ldLCBiID0gdGhpcy5wb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgZHggPSBiLnggLSBhLngsIGR6ID0gYi56IC0gYS56O1xuICAgICAgY29uc3QgbGVuMiA9IGR4ICogZHggKyBkeiAqIGR6IHx8IDE7XG4gICAgICBjb25zdCB0ID0gY2xhbXAoKCh4IC0gYS54KSAqIGR4ICsgKHogLSBhLnopICogZHopIC8gbGVuMiwgMCwgMSk7XG4gICAgICBjb25zdCBweCA9IGEueCArIGR4ICogdCwgcHogPSBhLnogKyBkeiAqIHQ7XG4gICAgICBjb25zdCBkMiA9ICh4IC0gcHgpICoqIDIgKyAoeiAtIHB6KSAqKiAyO1xuICAgICAgaWYgKGQyIDwgYmVzdCkgeyBiZXN0ID0gZDI7IGJpID0gaTsgYnQgPSB0OyB9XG4gICAgfVxuICAgIGlmIChiaSA8IDAgfHwgYmVzdCA+IHRoaXMucmVhY2ggKiB0aGlzLnJlYWNoKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBhID0gdGhpcy5wb2ludHNbYmldLCBiID0gdGhpcy5wb2ludHNbYmkgKyAxXTtcbiAgICBjb25zdCBzZWdMZW4gPSBNYXRoLm1heCgxZS02LCBiLnMgLSBhLnMpO1xuICAgIC8vIFBvaW50cyBhcmUgc3RvcmVkIGRvd25zdHJlYW0tZmlyc3QsIHNvIGRvd25zdHJlYW0gaXMgYSA8LSBiLlxuICAgIGNvbnN0IHR4ID0gKGEueCAtIGIueCkgLyBzZWdMZW4sIHR6ID0gKGEueiAtIGIueikgLyBzZWdMZW47XG4gICAgcmV0dXJuIHtcbiAgICAgIGQ6IE1hdGguc3FydChiZXN0KSxcbiAgICAgIGxldmVsOiBhLmxldmVsICsgKGIubGV2ZWwgLSBhLmxldmVsKSAqIGJ0LFxuICAgICAgd2lkdGg6IGEud2lkdGggKyAoYi53aWR0aCAtIGEud2lkdGgpICogYnQsXG4gICAgICB0eCwgdHosXG4gICAgICBncmFkaWVudDogTWF0aC5tYXgoMCwgKGIubGV2ZWwgLSBhLmxldmVsKSAvIHNlZ0xlbiksXG4gICAgICBzOiBhLnMgKyAoYi5zIC0gYS5zKSAqIGJ0LFxuICAgIH07XG4gIH1cbn1cblxuZnVuY3Rpb24gY2VsbEtleShjeDogbnVtYmVyLCBjejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIChjeCArIDQwOTYpICogODE5MiArIChjeiArIDQwOTYpO1xufVxuXG5leHBvcnQgdHlwZSBXYXRlckJvZHkgPSAncml2ZXInIHwgJ2xha2UnIHwgJ3NlYScgfCAnbm9uZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmxvd1NhbXBsZSB7XG4gIGJvZHk6IFdhdGVyQm9keTtcbiAgLyoqIFVuaXQgZmxvdyBkaXJlY3Rpb24gKHplcm8gZm9yIHN0aWxsIHdhdGVyKS4gKi9cbiAgZHg6IG51bWJlcjtcbiAgZHo6IG51bWJlcjtcbiAgLyoqIFN1cmZhY2UgY3VycmVudCBzcGVlZCBpbiBtL3MuICovXG4gIHNwZWVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSHlkcm9sb2d5T3B0aW9ucyB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgLyoqIEdlbmVyYXRvciB2ZXJzaW9uIHRoZSBuZXR3b3JrIGJlbG9uZ3MgdG8uICovXG4gIHZlcnNpb246IG51bWJlcjtcbiAgLyoqIEJhc2UgaGVpZ2h0IG9mIHRoZSAqdW5tb2RpZmllZCB2MSBzaGFwZSogKHVzZWQgdG8gbG9jYXRlIGxha2UvY2hhbm5lbCkuICovXG4gIHYxSGVpZ2h0OiBIZWlnaHRTYW1wbGVyO1xufVxuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ2ljYWwgbmV0d29yayBmb3Igb25lIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbikuICovXG5leHBvcnQgY2xhc3MgSHlkcm9sb2d5IHtcbiAgcmVhZG9ubHkgc2VlZDogbnVtYmVyO1xuICByZWFkb25seSB2ZXJzaW9uOiBudW1iZXI7XG4gIHJlYWRvbmx5IGxha2U6IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJ4OiBudW1iZXI7IHJ6OiBudW1iZXIgfTtcbiAgcmVhZG9ubHkgbG93ZXI6IFJpdmVyUmVhY2g7XG4gIHJlYWRvbmx5IHVwcGVyOiBSaXZlclJlYWNoIHwgbnVsbDtcbiAgLyoqIFVwcGVyLXJpdmVyIHNvdXJjZSB0YXJuICh2MiBvbmx5KS4gKi9cbiAgcmVhZG9ubHkgdGFybjogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcjogbnVtYmVyOyBsZXZlbDogbnVtYmVyIH0gfCBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKG9wdHM6IEh5ZHJvbG9neU9wdGlvbnMpIHtcbiAgICB0aGlzLnNlZWQgPSBvcHRzLnNlZWQ7XG4gICAgdGhpcy52ZXJzaW9uID0gb3B0cy52ZXJzaW9uO1xuICAgIHRoaXMubGFrZSA9IGxvY2F0ZUxha2Uob3B0cy52MUhlaWdodCk7XG4gICAgdGhpcy5sb3dlciA9IHRyYWNlTG93ZXJSaXZlcihvcHRzLnYxSGVpZ2h0LCB0aGlzLmxha2UpO1xuICAgIGlmIChvcHRzLnZlcnNpb24gPj0gMikge1xuICAgICAgY29uc3QgdXBwZXIgPSBhdXRob3JVcHBlclJpdmVyKG9wdHMuc2VlZCwgdGhpcy5sYWtlKTtcbiAgICAgIHRoaXMudXBwZXIgPSB1cHBlci5yZWFjaDtcbiAgICAgIHRoaXMudGFybiA9IHVwcGVyLnRhcm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudXBwZXIgPSBudWxsO1xuICAgICAgdGhpcy50YXJuID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3VyZmFjZSBjdXJyZW50IGZvciBhIHdhdGVyIGNvbHVtbi4gYGxldmVsYCBpcyB0aGUgY29sdW1uJ3Mgd2F0ZXIgc3VyZmFjZSxcbiAgICogdXNlZCB0byB0ZWxsIHNlYS1sZXZlbCB3YXRlciAobGFrZSwgbG93ZXIgcml2ZXIsIHNlYSkgZnJvbSB0aGUgdXBwZXIgcml2ZXIuXG4gICAqL1xuICBmbG93QXQoeDogbnVtYmVyLCB6OiBudW1iZXIsIGxldmVsOiBudW1iZXIpOiBGbG93U2FtcGxlIHtcbiAgICBpZiAodGhpcy51cHBlciAmJiBsZXZlbCA+IDAuNSkge1xuICAgICAgY29uc3QgaGl0ID0gdGhpcy51cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCAmJiBoaXQuZCA8PSBoaXQud2lkdGggKyAyKSB7XG4gICAgICAgIGNvbnN0IHNwZWVkID0gY2xhbXAoMC41NSArIGhpdC5ncmFkaWVudCAqIDksIDAuNCwgNC41KTtcbiAgICAgICAgcmV0dXJuIHsgYm9keTogJ3JpdmVyJywgZHg6IGhpdC50eCwgZHo6IGhpdC50eiwgc3BlZWQgfTtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLnRhcm4gJiYgTWF0aC5oeXBvdCh4IC0gdGhpcy50YXJuLngsIHogLSB0aGlzLnRhcm4ueikgPCB0aGlzLnRhcm4uciArIDQpIHtcbiAgICAgICAgcmV0dXJuIHsgYm9keTogJ2xha2UnLCAuLi50b3dhcmRzKHgsIHosIHRoaXMudXBwZXJTb3VyY2UoKSwgMC4wNikgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgbG93ID0gdGhpcy5sb3dlci5uZWFyZXN0KHgsIHopO1xuICAgIGlmIChsb3cgJiYgbG93LmQgPD0gbG93LndpZHRoICsgNikge1xuICAgICAgcmV0dXJuIHsgYm9keTogJ3JpdmVyJywgZHg6IGxvdy50eCwgZHo6IGxvdy50eiwgc3BlZWQ6IDAuMzUgKyAwLjI1ICogc21vb3Roc3RlcChsb3cud2lkdGggKyA2LCAwLCBsb3cuZCkgfTtcbiAgICB9XG4gICAgY29uc3QgbGQgPSBNYXRoLmh5cG90KCh4IC0gdGhpcy5sYWtlLngpIC8gdGhpcy5sYWtlLnJ4LCAoeiAtIHRoaXMubGFrZS56KSAvIHRoaXMubGFrZS5yeik7XG4gICAgaWYgKGxkIDwgMS4zNSkge1xuICAgICAgLy8gU2xvdyBkcmlmdCBmcm9tIHRoZSBpbmZsb3cgdG93YXJkIHRoZSBvdXRmbG93IGF0IHRoZSBoZWFkIG9mIHRoZSBsb3dlciByaXZlci5cbiAgICAgIGNvbnN0IGhlYWQgPSB0aGlzLmxvd2VyLnBvaW50c1t0aGlzLmxvd2VyLnBvaW50cy5sZW5ndGggLSAxXTtcbiAgICAgIGNvbnN0IGRyaWZ0ID0gdG93YXJkcyh4LCB6LCBoZWFkLCAwLjA4KTtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4uZHJpZnQgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgYm9keTogJ3NlYScsIGR4OiAwLCBkejogMCwgc3BlZWQ6IDAgfTtcbiAgfVxuXG4gIHByaXZhdGUgdXBwZXJTb3VyY2UoKTogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9IHtcbiAgICBjb25zdCBwdHMgPSB0aGlzLnVwcGVyIS5wb2ludHM7XG4gICAgcmV0dXJuIHB0c1twdHMubGVuZ3RoIC0gMV07XG4gIH1cbn1cblxuZnVuY3Rpb24gdG93YXJkcyh4OiBudW1iZXIsIHo6IG51bWJlciwgcDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9LCBzcGVlZDogbnVtYmVyKSB7XG4gIGNvbnN0IGR4ID0gcC54IC0geCwgZHogPSBwLnogLSB6O1xuICBjb25zdCBsZW4gPSBNYXRoLmh5cG90KGR4LCBkeikgfHwgMTtcbiAgcmV0dXJuIHsgZHg6IGR4IC8gbGVuLCBkejogZHogLyBsZW4sIHNwZWVkIH07XG59XG5cbi8qKiBGaW5kIHRoZSB2YWxsZXkgbGFrZSBmcm9tIHRoZSB0ZXJyYWluIGl0c2VsZjogdGhlIGRlZXAgYmFzaW4gTlcgb2YgdGhlIGZvdW5kZXIgdmFsbGV5LiAqL1xuZnVuY3Rpb24gbG9jYXRlTGFrZShoOiBIZWlnaHRTYW1wbGVyKTogSHlkcm9sb2d5WydsYWtlJ10ge1xuICBsZXQgc3ggPSAwLCBzeiA9IDAsIG4gPSAwLCBtaW5YID0gSW5maW5pdHksIG1heFggPSAtSW5maW5pdHksIG1pblogPSBJbmZpbml0eSwgbWF4WiA9IC1JbmZpbml0eTtcbiAgZm9yIChsZXQgeiA9IC00NjA7IHogPD0gLTEyMDsgeiArPSA0KSB7XG4gICAgZm9yIChsZXQgeCA9IC00ODA7IHggPD0gLTQwOyB4ICs9IDQpIHtcbiAgICAgIGlmIChoKHgsIHopID4gLTQpIGNvbnRpbnVlO1xuICAgICAgc3ggKz0geDsgc3ogKz0gejsgbisrO1xuICAgICAgbWluWCA9IE1hdGgubWluKG1pblgsIHgpOyBtYXhYID0gTWF0aC5tYXgobWF4WCwgeCk7XG4gICAgICBtaW5aID0gTWF0aC5taW4obWluWiwgeik7IG1heFogPSBNYXRoLm1heChtYXhaLCB6KTtcbiAgICB9XG4gIH1cbiAgaWYgKG4gPT09IDApIHJldHVybiB7IHg6IC0yNjAsIHo6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9O1xuICByZXR1cm4ge1xuICAgIHg6IHN4IC8gbiwgejogc3ogLyBuLFxuICAgIHJ4OiBNYXRoLm1heCgzMCwgKG1heFggLSBtaW5YKSAvIDIgKyAxMCksIHJ6OiBNYXRoLm1heCgzMCwgKG1heFogLSBtaW5aKSAvIDIgKyAxMCksXG4gIH07XG59XG5cbi8qKlxuICogVHJhY2UgdGhlIGNhcnZlZCBsb3dsYW5kIGNoYW5uZWwgZnJvbSB0aGUgbGFrZSBvdXRmbG93IHNvdXRoIHRvIHRoZSBzZWEuIEZvclxuICogZWFjaCA0IG0gcm93IHRoZSBjaGFubmVsIGlzIHRoZSBsb3dlc3QgY29sdW1uIG5lYXIgdGhlIHByZXZpb3VzIGNlbnRyZTsgdGhlXG4gKiB0cmFjZSBpcyBzbW9vdGhlZCBzbyB0aGUgZmxvdyBmaWVsZCBkb2VzIG5vdCBqaXR0ZXIgd2l0aCB0aGUgMSBtIHZveGVscy5cbiAqL1xuZnVuY3Rpb24gdHJhY2VMb3dlclJpdmVyKGg6IEhlaWdodFNhbXBsZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKTogUml2ZXJSZWFjaCB7XG4gIGNvbnN0IHJhdzogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBsZXQgY3ggPSBsYWtlLnggKyBsYWtlLnJ4ICogMC41NTtcbiAgbGV0IHogPSBNYXRoLnJvdW5kKGxha2UueiArIGxha2UucnogKiAwLjYpO1xuICAvLyBTdGFydCBhdCB0aGUgbGFrZSdzIHNvdXRoLWVhc3Qgb3V0ZmxvdyBhbmQgZm9sbG93IHRoZSBjaGFubmVsIGRvd25zdHJlYW0uXG4gIGZvciAoOyB6IDw9IDkwMDsgeiArPSA0KSB7XG4gICAgbGV0IGJlc3QgPSBJbmZpbml0eSwgYnggPSBjeDtcbiAgICBmb3IgKGxldCB4ID0gTWF0aC5yb3VuZChjeCAtIDQwKTsgeCA8PSBjeCArIDQwOyB4ICs9IDIpIHtcbiAgICAgIGNvbnN0IHYgPSBoKHgsIHopICsgTWF0aC5hYnMoeCAtIGN4KSAqIDAuMDI7XG4gICAgICBpZiAodiA8IGJlc3QpIHsgYmVzdCA9IHY7IGJ4ID0geDsgfVxuICAgIH1cbiAgICBjeCA9IGJ4O1xuICAgIHJhdy5wdXNoKHsgeDogYngsIHogfSk7XG4gICAgLy8gVGhlIHRyYWNlIGVuZHMgb25jZSBpdCByZWFjaGVzIG9wZW4gc2VhIGZvciBhIHN1c3RhaW5lZCBzdHJldGNoLlxuICAgIGlmIChiZXN0IDwgLTYgJiYgcmF3Lmxlbmd0aCA+IDIwICYmIGgoYngsIHogKyA4KSA8IC02ICYmIGgoYngsIHogKyAxNikgPCAtNikgYnJlYWs7XG4gIH1cbiAgY29uc3Qgc21vb3RoID0gcmF3Lm1hcCgocCwgaSkgPT4ge1xuICAgIGxldCBzeCA9IDAsIG4gPSAwO1xuICAgIGZvciAobGV0IGsgPSBNYXRoLm1heCgwLCBpIC0gNCk7IGsgPD0gTWF0aC5taW4ocmF3Lmxlbmd0aCAtIDEsIGkgKyA0KTsgaysrKSB7IHN4ICs9IHJhd1trXS54OyBuKys7IH1cbiAgICByZXR1cm4geyB4OiBzeCAvIG4sIHo6IHAueiB9O1xuICB9KTtcbiAgLy8gU3RvcmUgZG93bnN0cmVhbS1maXJzdDogaW5kZXggMCBpcyB0aGUgc2VhIG1vdXRoLlxuICBzbW9vdGgucmV2ZXJzZSgpO1xuICBjb25zdCBwb2ludHM6IFJpdmVyUG9pbnRbXSA9IFtdO1xuICBsZXQgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc21vb3RoLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGkgPiAwKSBzICs9IE1hdGguaHlwb3Qoc21vb3RoW2ldLnggLSBzbW9vdGhbaSAtIDFdLngsIHNtb290aFtpXS56IC0gc21vb3RoW2kgLSAxXS56KTtcbiAgICBwb2ludHMucHVzaCh7IHg6IHNtb290aFtpXS54LCB6OiBzbW9vdGhbaV0ueiwgcywgbGV2ZWw6IDAsIHdpZHRoOiA2IH0pO1xuICB9XG4gIHJldHVybiBuZXcgUml2ZXJSZWFjaChwb2ludHMsIDQwKTtcbn1cblxuLyoqIFdhdGVyLXN1cmZhY2UgZHJvcHMgYWxvbmcgdGhlIHVwcGVyIHJpdmVyLCBhcyAoZnJhY3Rpb24gb2YgbGVuZ3RoLCBtZXRyZXMpLiAqL1xuY29uc3QgRkFMTFM6IFJlYWRvbmx5QXJyYXk8cmVhZG9ubHkgW251bWJlciwgbnVtYmVyXT4gPSBbWzAuMiwgN10sIFswLjQ4LCAxMV0sIFswLjc0LCAxM11dO1xuY29uc3QgVVBQRVJfR1JBRElFTlQgPSAwLjAzO1xuXG4vKipcbiAqIEF1dGhvciB0aGUgdjIgbW91bnRhaW4gcml2ZXI6IGEgc2VlZGVkIG1lYW5kZXJpbmcgY2VudHJlbGluZSBmcm9tIHRoZSBsYWtlJ3NcbiAqIG5vcnRoIHNob3JlIHRvIGEgaGlnaGxhbmQgdGFybiwgd2l0aCBhIGxldmVsIHByb2ZpbGUgdGhhdCBvbmx5IHJpc2VzXG4gKiB1cHN0cmVhbSAoZ2VudGxlIGdyYWRpZW50IHBsdXMgdGhyZWUgY2FzY2FkZXMpLlxuICovXG5mdW5jdGlvbiBhdXRob3JVcHBlclJpdmVyKHNlZWQ6IG51bWJlciwgbGFrZTogSHlkcm9sb2d5WydsYWtlJ10pOiB7XG4gIHJlYWNoOiBSaXZlclJlYWNoOyB0YXJuOiBOb25OdWxsYWJsZTxIeWRyb2xvZ3lbJ3Rhcm4nXT47XG59IHtcbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoc2VlZCBeIDB4NWVlZDIpID4+PiAwKTtcbiAgY29uc3QgaiA9IChhOiBudW1iZXIpID0+IChybmQoKSAtIDAuNSkgKiAyICogYTtcbiAgY29uc3QgbW91dGggPSB7IHg6IGxha2UueCArIGxha2UucnggKiAwLjEsIHo6IGxha2UueiAtIGxha2UucnogKiAwLjU1IH07XG4gIGNvbnN0IGNvbnRyb2xzID0gW1xuICAgIG1vdXRoLFxuICAgIHsgeDogbGFrZS54ICsgMjAgKyBqKDIwKSwgejogLTQxMCArIGooMTUpIH0sXG4gICAgeyB4OiAtMTkwICsgaigzNSksIHo6IC01MjAgKyBqKDIwKSB9LFxuICAgIHsgeDogLTIxNSArIGooMzUpLCB6OiAtNjQwICsgaigyMCkgfSxcbiAgICB7IHg6IC0xNjUgKyBqKDMwKSwgejogLTc3MCArIGooMTUpIH0sXG4gIF07XG4gIC8vIENhdG11bGwtUm9tIHRocm91Z2ggdGhlIGNvbnRyb2xzLCB0aGVuIHJlc2FtcGxlIGF0IH44IG0gc3BhY2luZyB3aXRoIGFcbiAgLy8gc21hbGwgc2VlZGVkIG1lYW5kZXIgc28gdGhlIGNoYW5uZWwgaXMgbm90IGEgc21vb3RoIHNwbGluZS5cbiAgY29uc3QgZGVuc2U6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb250cm9scy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICBjb25zdCBwMCA9IGNvbnRyb2xzW01hdGgubWF4KDAsIGkgLSAxKV0sIHAxID0gY29udHJvbHNbaV07XG4gICAgY29uc3QgcDIgPSBjb250cm9sc1tpICsgMV0sIHAzID0gY29udHJvbHNbTWF0aC5taW4oY29udHJvbHMubGVuZ3RoIC0gMSwgaSArIDIpXTtcbiAgICBmb3IgKGxldCBrID0gMDsgayA8IDI0OyBrKyspIHtcbiAgICAgIGNvbnN0IHQgPSBrIC8gMjQsIHQyID0gdCAqIHQsIHQzID0gdDIgKiB0O1xuICAgICAgZGVuc2UucHVzaCh7XG4gICAgICAgIHg6IDAuNSAqICgyICogcDEueCArICgtcDAueCArIHAyLngpICogdCArICgyICogcDAueCAtIDUgKiBwMS54ICsgNCAqIHAyLnggLSBwMy54KSAqIHQyXG4gICAgICAgICAgKyAoLXAwLnggKyAzICogcDEueCAtIDMgKiBwMi54ICsgcDMueCkgKiB0MyksXG4gICAgICAgIHo6IDAuNSAqICgyICogcDEueiArICgtcDAueiArIHAyLnopICogdCArICgyICogcDAueiAtIDUgKiBwMS56ICsgNCAqIHAyLnogLSBwMy56KSAqIHQyXG4gICAgICAgICAgKyAoLXAwLnogKyAzICogcDEueiAtIDMgKiBwMi56ICsgcDMueikgKiB0MyksXG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgZGVuc2UucHVzaChjb250cm9sc1tjb250cm9scy5sZW5ndGggLSAxXSk7XG4gIGNvbnN0IHJlc2FtcGxlZDogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlcjsgczogbnVtYmVyIH0+ID0gW3sgLi4uZGVuc2VbMF0sIHM6IDAgfV07XG4gIGxldCBhY2MgPSAwLCBzID0gMDtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBkZW5zZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHN0ZXAgPSBNYXRoLmh5cG90KGRlbnNlW2ldLnggLSBkZW5zZVtpIC0gMV0ueCwgZGVuc2VbaV0ueiAtIGRlbnNlW2kgLSAxXS56KTtcbiAgICBhY2MgKz0gc3RlcDsgcyArPSBzdGVwO1xuICAgIGlmIChhY2MgPj0gOCB8fCBpID09PSBkZW5zZS5sZW5ndGggLSAxKSB7XG4gICAgICBjb25zdCBtID0gKGZibTIocyAvIDYwLCAzLjEsIHNlZWQgKyA4MDEsIDIpIC0gMC41KSAqIDE0O1xuICAgICAgcmVzYW1wbGVkLnB1c2goeyB4OiBkZW5zZVtpXS54ICsgbSwgejogZGVuc2VbaV0ueiwgcyB9KTtcbiAgICAgIGFjYyA9IDA7XG4gICAgfVxuICB9XG4gIGNvbnN0IHRvdGFsID0gcmVzYW1wbGVkW3Jlc2FtcGxlZC5sZW5ndGggLSAxXS5zO1xuICBjb25zdCBsZXZlbEF0ID0gKHN2OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGxldCBsZXZlbCA9IHN2ICogVVBQRVJfR1JBRElFTlQ7XG4gICAgZm9yIChjb25zdCBbZnJhYywgZHJvcF0gb2YgRkFMTFMpIHtcbiAgICAgIC8vIEVhY2ggZmFsbCBpcyBhIHNob3J0IGNhc2NhZGUgb3ZlciB+MTAgbSBvZiBjaGFubmVsLlxuICAgICAgbGV2ZWwgKz0gZHJvcCAqIHNtb290aHN0ZXAodG90YWwgKiBmcmFjIC0gNSwgdG90YWwgKiBmcmFjICsgNSwgc3YpO1xuICAgIH1cbiAgICAvLyBUaGUgZmlyc3QgNDAgbSBpbnRvIHRoZSBsYWtlIHN0YXlzIGF0IGxha2UgbGV2ZWwuXG4gICAgcmV0dXJuIHN2IDwgNDAgPyAwIDogbGV2ZWwgLSA0MCAqIFVQUEVSX0dSQURJRU5UO1xuICB9O1xuICBjb25zdCBwb2ludHM6IFJpdmVyUG9pbnRbXSA9IHJlc2FtcGxlZC5tYXAoKHApID0+ICh7XG4gICAgeDogcC54LCB6OiBwLnosIHM6IHAucywgbGV2ZWw6IE1hdGgubWF4KDAsIGxldmVsQXQocC5zKSksXG4gICAgd2lkdGg6IDMuMiArIDIuMiAqIGZibTIocC5zIC8gNzAsIDkuNywgc2VlZCArIDgwMiwgMikgKyAoMSAtIHAucyAvIHRvdGFsKSAqIDEuNSxcbiAgfSkpO1xuICBjb25zdCBzb3VyY2UgPSBwb2ludHNbcG9pbnRzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4ge1xuICAgIHJlYWNoOiBuZXcgUml2ZXJSZWFjaChwb2ludHMsIDExMCksXG4gICAgdGFybjogeyB4OiBzb3VyY2UueCwgejogc291cmNlLnosIHI6IDE4LCBsZXZlbDogc291cmNlLmxldmVsIH0sXG4gIH07XG59XG4iLCAiLy8gVm94ZWwgbWF0ZXJpYWwgaWRzLiBQdXJlIGRhdGEgc2hhcmVkIGJ5IHRoZSBzaW11bGF0aW9uIGxheWVyIChELTAwNSkuXG4vLyBJZHMgYXJlIHBlcnNpc3RlZCBpbiBzbmFwc2hvdCBlZGl0cywgc28gZXhpc3RpbmcgdmFsdWVzIG11c3QgbmV2ZXIgY2hhbmdlLlxuZXhwb3J0IGNvbnN0IE1BVCA9IHtcbiAgQUlSOiAwLFxuICBHUkFTUzogMSxcbiAgU09JTDogMixcbiAgU0FORDogMyxcbiAgR1JBVkVMOiA0LFxuICBTVE9ORTogNSxcbiAgT1JFOiA2LFxuICBXQVRFUjogNyxcbiAgQkVEUk9DSzogOCxcbiAgTU9TUzogOSxcbiAgLyoqIEdlbmVyYXRvciB2MiBoaWdobGFuZHMuIE5ldmVyIHByb2R1Y2VkIGJ5IGdlbmVyYXRvciB2MS4gKi9cbiAgU05PVzogMTAsXG59IGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgTWF0SWQgPSAodHlwZW9mIE1BVClba2V5b2YgdHlwZW9mIE1BVF07XG5cbmV4cG9ydCBjb25zdCBpc1NvbGlkID0gKG06IG51bWJlcik6IGJvb2xlYW4gPT4gbSAhPT0gTUFULkFJUiAmJiBtICE9PSBNQVQuV0FURVI7XG5leHBvcnQgY29uc3QgaXNPcGFxdWUgPSBpc1NvbGlkO1xuXG4vKiogSGlnaGVzdCBtYXRlcmlhbCBpZCB0aGF0IG1heSBhcHBlYXIgaW4gYSB2b3hlbCBlZGl0LiAqL1xuZXhwb3J0IGNvbnN0IE1BWF9NQVRfSUQgPSAxMDtcbiIsICIvLyBUZXJyYWluIGdlbmVyYXRvciB2MiBcdTIwMTQgdGhlIHZhbGxleS13aXRoLW1vdW50YWlucyBnZW9ncmFwaHkgKHB1cmUgVFMsIEQtMDA1KS5cbi8vXG4vLyBDb21wYXRpYmlsaXR5IGNvbnRyYWN0OiBpbnNpZGUgdGhlIGZvdW5kZXIgY29ycmlkb3IgKHRoZSBzZXR0bGVtZW50IHZhbGxleSxcbi8vIHRoZSBsYWtlIGFuZCB0aGUgbG93bGFuZCByaXZlcikgdjIgaGVpZ2h0cyBlcXVhbCB2MSBleGFjdGx5LCBzbyB0aGUgcGlubmVkXG4vLyBmb3VuZGVyIHByb2plY3RzLCB0aGVpciBwcmVwYXJhdGlvbiB0YXJnZXRzIGFuZCBuYXR1cmFsIGVudGl0aWVzIHRoZXJlIGFyZVxuLy8gdW5jaGFuZ2VkLiBPdXRzaWRlIGl0IHYyIGFkZHM6XG4vLyAgIC0gYSBub3J0aGVybiBtYXNzaWYgb24gYW4gZXh0ZW5kZWQgaXNsYW5kLCB3aXRoIHNub3cgYWJvdmUgdGhlIHNub3dsaW5lO1xuLy8gICAtIGZsYW5raW5nIHJhbmdlcyB3ZXN0IGFuZCBlYXN0IG9mIHRoZSB2YWxsZXksIHRlcnJhY2VkIGludG8gY2xpZmYgYmFuZHM7XG4vLyAgIC0gYSBtb3VudGFpbiByaXZlciBjYXJ2ZWQgaW50byB0aGUgbWFzc2lmIGZyb20gYSB0YXJuIGRvd24gdG8gdGhlIGxha2UsXG4vLyAgICAgd2hvc2Ugd2F0ZXIgc3VyZmFjZSBjb21lcyBmcm9tIEh5ZHJvbG9neSBhbmQgbmV2ZXIgcmlzZXMgZG93bnN0cmVhbTtcbi8vICAgLSBhIGNvbnRpbnVvdXMgbG93bGFuZCBjaGFubmVsICh2MSBoYXMgYSBkcnkgZm9yZCBzb3V0aCBvZiB0aGUgc2hlbGYpLlxuLy8gSGVpZ2h0cyBhcmUgaW50ZWdlcnMgaW4gWy0xNCwgMTA0XS5cbmltcG9ydCB7IGNsYW1wLCBmYm0yLCBsZXJwLCBzbW9vdGhzdGVwIH0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQgeyBNQVQsIE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuaW1wb3J0IHsgSHlkcm9sb2d5IH0gZnJvbSAnLi9oeWRyb2xvZ3knO1xuXG5leHBvcnQgY29uc3QgVjJfU05PV0xJTkUgPSA3NDtcbmV4cG9ydCBjb25zdCBWMl9NQVhfSEVJR0hUID0gMTA0O1xuXG5leHBvcnQgdHlwZSBWMUhlaWdodCA9IChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVjJDb2x1bW4ge1xuICAvKiogVG9wIHNvbGlkIHkgKyAxIChzYW1lIGNvbnZlbnRpb24gYXMgc3VyZmFjZUhlaWdodEF0KS4gKi9cbiAgaDogbnVtYmVyO1xuICAvKiogV2F0ZXIgc3VyZmFjZSBmb3IgdGhpcyBjb2x1bW46IGNlbGxzIFtoLCBsZXZlbCkgaG9sZCB3YXRlci4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgLyoqIFRydWUgd2hlbiB0aGlzIGNvbHVtbiBpcyBwYXJ0IG9mIHRoZSBjYXJ2ZWQgbW91bnRhaW4tcml2ZXIgY2hhbm5lbC4gKi9cbiAgY2hhbm5lbDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFRlcnJhaW5WMiB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHJlYWRvbmx5IHNlZWQ6IG51bWJlcixcbiAgICBwcml2YXRlIHJlYWRvbmx5IHYxOiBWMUhlaWdodCxcbiAgICByZWFkb25seSBoeWRyb2xvZ3k6IEh5ZHJvbG9neSxcbiAgKSB7fVxuXG4gIC8qKiAwID0gZXhhY3RseSB2MSAoZm91bmRlciBjb3JyaWRvcik7IDEgPSBmdWxsIHYyIHJlbGllZi4gKi9cbiAgcmVsaWVmTWFzayh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3Qgbm9ydGggPSBzbW9vdGhzdGVwKC0zOTAsIC00NzAsIHopO1xuICAgIC8vIFRoZSB3ZXN0IHJhbmdlIGtlZXBzIGNsZWFyIG9mIHRoZSBsYWtlIGJhc2luIHVudGlsIHRoZSBsYWtlIGlzIHBhc3NlZC5cbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UsIHdlc3RFZGdlIC0gOTAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDIzMCwgMzMwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgLyoqIDAgYXQgdGhlIHJhbmdlIGZyb250LCAxIGRlZXAgaW5zaWRlOiBmb290aGlsbHMgZmlyc3QsIHBlYWtzIGJlaGluZC4gKi9cbiAgcmFuZ2VEZXB0aCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3Qgbm9ydGggPSBzbW9vdGhzdGVwKC00MjAsIC03MDAsIHopO1xuICAgIGNvbnN0IHdlc3RFZGdlID0gbGVycCgtNDUwLCAtMzIwLCBzbW9vdGhzdGVwKC0yMjAsIC0xNDAsIHopKTtcbiAgICBjb25zdCB3ZXN0ID0gc21vb3Roc3RlcCh3ZXN0RWRnZSAtIDQwLCB3ZXN0RWRnZSAtIDMwMCwgeCk7XG4gICAgY29uc3QgZWFzdCA9IHNtb290aHN0ZXAoMjcwLCA1NjAsIHgpO1xuICAgIHJldHVybiBNYXRoLm1heChub3J0aCwgd2VzdCwgZWFzdCk7XG4gIH1cblxuICBjb2x1bW4oeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWMkNvbHVtbiB7XG4gICAgY29uc3Qgc2VlZCA9IHRoaXMuc2VlZDtcbiAgICBjb25zdCBiYXNlID0gdGhpcy52MShzZWVkLCB4LCB6KTtcbiAgICBjb25zdCBtYXNrID0gdGhpcy5yZWxpZWZNYXNrKHgsIHopO1xuICAgIGxldCBoID0gYmFzZTtcblxuICAgIGlmIChtYXNrID4gMCkge1xuICAgICAgLy8gRXh0ZW5kIHRoZSBpc2xhbmQgbm9ydGggc28gdGhlIG1hc3NpZiBoYXMgcm9vbSAodjEgY29hc3QgaXMgfnogLTYwMCkuXG4gICAgICBjb25zdCBub3J0aExhbmQgPSBzbW9vdGhzdGVwKC00MjAsIC01MjAsIHopO1xuICAgICAgY29uc3Qgc2hvcmUgPSAxIC0gTWF0aC5oeXBvdCgoeCArIDE1MCkgLyA1NjAsICh6ICsgNjkwKSAvIDMwMClcbiAgICAgICAgKyAoZmJtMih4IC8gMTYwLCB6IC8gMTYwLCBzZWVkICsgNzAxLCAzKSAtIDAuNSkgKiAwLjM7XG4gICAgICBjb25zdCBsYW5kTiA9IHNtb290aHN0ZXAoMC4wLCAwLjE0LCBzaG9yZSkgKiBub3J0aExhbmQ7XG4gICAgICBjb25zdCBncm91bmQgPSBsZXJwKGJhc2UsIE1hdGgubWF4KGJhc2UsIDUgKyA1ICogZmJtMih4IC8gOTAsIHogLyA5MCwgc2VlZCArIDcwMiwgMikpLCBsYW5kTik7XG5cbiAgICAgIC8vIFJpZGdlZCBtYXNzaWYgd2l0aCB0ZXJyYWNlZCBjbGlmZiBiYW5kcy5cbiAgICAgIGNvbnN0IHd4ID0geCArIChmYm0yKHggLyAyNjAsIHogLyAyNjAsIHNlZWQgKyA3MDMsIDMpIC0gMC41KSAqIDEyMDtcbiAgICAgIGNvbnN0IHd6ID0geiArIChmYm0yKHggLyAyNjAgKyA1LjEsIHogLyAyNjAgLSAyLjcsIHNlZWQgKyA3MDQsIDMpIC0gMC41KSAqIDEyMDtcbiAgICAgIGNvbnN0IHIxID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMjEwLCB3eiAvIDIxMCwgc2VlZCArIDcwNSwgNCkgLSAxKTtcbiAgICAgIGNvbnN0IHIyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODAsIHd6IC8gODAsIHNlZWQgKyA3MDYsIDMpIC0gMSk7XG4gICAgICBjb25zdCBsdW1wID0gZmJtMih3eCAvIDEyMCwgd3ogLyAxMjAsIHNlZWQgKyA3MDcsIDMpO1xuICAgICAgY29uc3QgZGVwdGggPSB0aGlzLnJhbmdlRGVwdGgoeCwgeik7XG4gICAgICBsZXQgbW91bnRhaW4gPSAxNiArICg4ICsgODAgKiBkZXB0aCkgKiAoMC41NSAqIHIxICogcjEgKyAwLjI4ICogcjIgKyAwLjE3ICogbHVtcClcbiAgICAgICAgKyAxOCAqIGRlcHRoICogc21vb3Roc3RlcCgwLjU1LCAwLjksIHIxKTtcbiAgICAgIGNvbnN0IGJhbmQgPSA2ICsgMiAqIGZibTIoeCAvIDE0MCwgeiAvIDE0MCwgc2VlZCArIDcwOCwgMik7XG4gICAgICBjb25zdCB0ID0gTWF0aC5mbG9vcihtb3VudGFpbiAvIGJhbmQpO1xuICAgICAgY29uc3QgZnJhYyA9IG1vdW50YWluIC8gYmFuZCAtIHQ7XG4gICAgICBtb3VudGFpbiA9ICh0ICsgc21vb3Roc3RlcCgwLjUsIDAuOCwgZnJhYykpICogYmFuZDtcblxuICAgICAgLy8gT25seSBsYW5kIHJpc2VzOyB0aGUgc2VhIHN0YXlzIHNlYSwgc28gcmFuZ2VzIGVuZCBpbiBjb2FzdGFsIGNsaWZmcy5cbiAgICAgIGNvbnN0IGxhbmRGYWN0b3IgPSBzbW9vdGhzdGVwKC0yLCA4LCBncm91bmQpO1xuICAgICAgaCA9IGxlcnAoZ3JvdW5kLCBNYXRoLm1heChncm91bmQsIG1vdW50YWluKSwgbWFzayAqIGxhbmRGYWN0b3IpO1xuICAgIH1cblxuICAgIGxldCBsZXZlbCA9IGggPCAwID8gMCA6IC1JbmZpbml0eTtcbiAgICBsZXQgY2hhbm5lbCA9IGZhbHNlO1xuXG4gICAgLy8gTW91bnRhaW4gcml2ZXI6IHZhbGxleSBmbG9vciwgYmFua3MgYW5kIGNoYW5uZWwgZm9sbG93IHRoZSB3YXRlciBsZXZlbC5cbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlcikge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgY29uc3QgcmFpc2VkID0gaGl0LmxldmVsID4gMC4yNTtcbiAgICAgICAgY29uc3QgdncgPSA1NSArIDI4ICogZmJtMihoaXQucyAvIDkwLCAxLjcsIHNlZWQgKyA3MDksIDIpO1xuICAgICAgICBjb25zdCBmbG9vciA9IGhpdC5sZXZlbCArIDEuNSArIDIuMiAqIGZibTIoeCAvIDQwLCB6IC8gNDAsIHNlZWQgKyA3MTAsIDIpICsgaGl0LmQgKiAwLjA2O1xuICAgICAgICBjb25zdCB0ID0gc21vb3Roc3RlcCh2dyAqIDAuMywgdncsIGhpdC5kKTtcbiAgICAgICAgaCA9IE1hdGgubWluKGgsIGxlcnAoZmxvb3IsIGgsIHQpKTtcbiAgICAgICAgY29uc3QgdyA9IGhpdC53aWR0aDtcbiAgICAgICAgaWYgKHJhaXNlZCAmJiBoaXQuZCA8IHcgKyAzKSB7XG4gICAgICAgICAgLy8gQmFua3MgaG9sZCBhIHJhaXNlZCByaXZlcjogbmV2ZXIgYmVsb3cgaXRzIHdhdGVyIHN1cmZhY2UuIEF0IGxha2VcbiAgICAgICAgICAvLyBsZXZlbCB0aGUgc2VhLWxldmVsIGZpbGwgYWxyZWFkeSBjb250YWlucyB0aGUgd2F0ZXIuXG4gICAgICAgICAgaCA9IE1hdGgubWF4KGgsIE1hdGguY2VpbChoaXQubGV2ZWwpICsgMSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGhpdC5kIDwgdykge1xuICAgICAgICAgIGNvbnN0IGJlZCA9IGhpdC5sZXZlbCAtICgxLjIgKyAxLjMgKiAoMSAtIGhpdC5kIC8gdykpO1xuICAgICAgICAgIGggPSBNYXRoLm1pbihoLCBiZWQpO1xuICAgICAgICAgIGlmIChyYWlzZWQpIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIE1hdGgucm91bmQoaGl0LmxldmVsKSk7XG4gICAgICAgICAgY2hhbm5lbCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IHRhcm4gPSB0aGlzLmh5ZHJvbG9neS50YXJuO1xuICAgICAgaWYgKHRhcm4pIHtcbiAgICAgICAgY29uc3QgdGQgPSBNYXRoLmh5cG90KHggLSB0YXJuLngsIHogLSB0YXJuLnopXG4gICAgICAgICAgKiAoMSArIDAuMiAqIChmYm0yKHggLyAzMCwgeiAvIDMwLCBzZWVkICsgNzExLCAyKSAtIDAuNSkpO1xuICAgICAgICBpZiAodGQgPCB0YXJuLnIgKyA2KSB7XG4gICAgICAgICAgY29uc3QgcmltID0gTWF0aC5jZWlsKHRhcm4ubGV2ZWwpICsgMTtcbiAgICAgICAgICBpZiAodGQgPj0gdGFybi5yKSBoID0gTWF0aC5tYXgoaCwgcmltKTtcbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGggPSBNYXRoLm1pbihNYXRoLm1heChoLCByaW0pLCB0YXJuLmxldmVsIC0gMSAtIDMgKiBzbW9vdGhzdGVwKHRhcm4uciwgMCwgdGQpKTtcbiAgICAgICAgICAgIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIE1hdGgucm91bmQodGFybi5sZXZlbCkpO1xuICAgICAgICAgICAgY2hhbm5lbCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gTG93bGFuZCBjaGFubmVsIGNvbnRpbnVpdHk6IHYxIGxlYXZlcyBhIGRyeSBmb3JkIHdoZXJlIHRoZSBzaGVsZiBtZWV0cyB0aGUgcml2ZXIuXG4gICAgY29uc3QgbG93ID0gdGhpcy5oeWRyb2xvZ3kubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDwgMi41ICYmIGggPj0gMCAmJiBiYXNlIDwgNCkgaCA9IC0xO1xuXG4gICAgaCA9IE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCBWMl9NQVhfSEVJR0hUKSk7XG4gICAgaWYgKGggPCAwKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCAwKTtcbiAgICByZXR1cm4geyBoLCBsZXZlbDogbGV2ZWwgPT09IC1JbmZpbml0eSA/IGggOiBsZXZlbCwgY2hhbm5lbCB9O1xuICB9XG5cbiAgaGVpZ2h0KHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5jb2x1bW4oeCwgeikuaDtcbiAgfVxuXG4gIC8qKiB2MiB0b3AgbWF0ZXJpYWwuIEZhbGxzIGJhY2sgdG8gdGhlIHYxIHJ1bGVzIGZvciB0aGUgdW5jaGFuZ2VkIGNvcnJpZG9yLiAqL1xuICB0b3BNYXRlcmlhbChcbiAgICB4OiBudW1iZXIsIHo6IG51bWJlciwgY29sOiBWMkNvbHVtbiwgc2xvcGU6IG51bWJlcixcbiAgICB2MVRvcDogKGg6IG51bWJlciwgc2xvcGU6IG51bWJlcikgPT4gTWF0SWQsXG4gICk6IE1hdElkIHtcbiAgICBjb25zdCBoID0gY29sLmg7XG4gICAgaWYgKGNvbC5jaGFubmVsICYmIGNvbC5sZXZlbCA+IGgpIHJldHVybiBNQVQuR1JBVkVMO1xuICAgIGNvbnN0IHVwcGVyID0gdGhpcy5oeWRyb2xvZ3kudXBwZXI7XG4gICAgaWYgKHVwcGVyICYmIGggPiAxKSB7XG4gICAgICBjb25zdCBoaXQgPSB1cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCAmJiBoaXQuZCA8IGhpdC53aWR0aCArIDIuNSAmJiBoaXQubGV2ZWwgPiAwLjI1KSB7XG4gICAgICAgIHJldHVybiBmYm0yKHggLyA2LCB6IC8gNiwgdGhpcy5zZWVkICsgNzEyLCAxKSA+IDAuNSA/IE1BVC5HUkFWRUwgOiBNQVQuU0FORDtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgc25vd2xpbmUgPSBWMl9TTk9XTElORSArIChmYm0yKHggLyA3MCwgeiAvIDcwLCB0aGlzLnNlZWQgKyA3MTMsIDMpIC0gMC41KSAqIDE2O1xuICAgIGlmIChoID49IHNub3dsaW5lICYmIHNsb3BlIDw9IDMpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAoaCA+PSBzbm93bGluZSAtIDYgJiYgc2xvcGUgPD0gMSAmJiBmYm0yKHggLyAyMCwgeiAvIDIwLCB0aGlzLnNlZWQgKyA3MTQsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TTk9XO1xuICAgIGlmICh0aGlzLnJlbGllZk1hc2soeCwgeikgPiAwLjUgJiYgaCA+IDMwICYmIHNsb3BlID49IDIpIHJldHVybiBNQVQuU1RPTkU7XG4gICAgcmV0dXJuIHYxVG9wKGgsIHNsb3BlKTtcbiAgfVxufVxuIiwgIi8vIFNpbXVsYXRpb24gbGF5ZXIgXHUyMDE0IHB1cmUgVHlwZVNjcmlwdCwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDEgd29ybGQgZm91bmRhdGlvbjogYSBjaHVua2VkLCBnZW51aW5lbHkgdGhyZWUtZGltZW5zaW9uYWwgdm94ZWwgd29ybGQuXG4vLyBUaGUgc3RvcmVkIHN0YXRlIGlzIG9uZSBtYXRlcmlhbCBieXRlIHBlciBjZWxsICgwID0gYWlyKTsgb2NjdXBhbmN5IGlzXG4vLyBpbXBsaWNpdC4gU3VyZmFjZSBoZWlnaHQgaXMgYSBkZXJpdmVkIHF1ZXJ5LCBub3QgdGhlIHN0b3JhZ2UuIFRoaXMgcmVwbGFjZXNcbi8vIHRoZSBmb3JtZXIgMjU2IHggMjU2IGhlaWdodGZpZWxkIChzZWUgSVItMDA1KS5cbi8vXG4vLyBXb3JsZCBtZXRyZXM6IHgveiBpbiBbLTEwMjQsIDEwMjQpLCB5IGluIFstMTYsIDExMiksIHNlYSBsZXZlbCAwLlxuLy8gQSBjaHVuayBpcyAzMiB4IDMyIHggMTI4IGNlbGxzLiBHZW5lcmF0aW9uIGlzIGEgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCxcbi8vIGdlbmVyYXRvciB2ZXJzaW9uLCBwYXJhbWV0ZXJzIGFuZCBjaHVuayBjb29yZGluYXRlczsgZWRpdHMgYXJlIHJlY29yZGVkXG4vLyBzZXBhcmF0ZWx5IGFuZCByZS1hcHBsaWVkIHdoZW4gYSBjaHVuayBpcyByZWdlbmVyYXRlZC5cbmltcG9ydCB0eXBlIHsgU3RydWN0dXJlIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB0eXBlIHsgTGlmZVN0YXRlIH0gZnJvbSAnLi9lY29ub215JztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5pbXBvcnQgeyBUZXJyYWluVjIsIFYyQ29sdW1uIH0gZnJvbSAnLi90ZXJyYWluLXYyJztcblxuZXhwb3J0IGNvbnN0IFdPUkxEX1NJWkUgPSAyMDQ4O1xuZXhwb3J0IGNvbnN0IEhBTEYgPSBXT1JMRF9TSVpFIC8gMjtcbmV4cG9ydCBjb25zdCBDSFVOS19TSVpFID0gMzI7XG5leHBvcnQgY29uc3QgQ0hVTktTX1BFUl9TSURFID0gV09STERfU0laRSAvIENIVU5LX1NJWkU7XG5leHBvcnQgY29uc3QgWV9NSU4gPSAtMTY7XG5leHBvcnQgY29uc3QgWV9NQVggPSAxMTI7XG5leHBvcnQgY29uc3QgV09STERfSEVJR0hUID0gWV9NQVggLSBZX01JTjtcbmV4cG9ydCBjb25zdCBTRUFfTEVWRUwgPSAwO1xuZXhwb3J0IGNvbnN0IFdBVEVSID0gU0VBX0xFVkVMO1xuLyoqIEdlbmVyYXRvciB2MTogdGhlIG9yaWdpbmFsIDIwNDggbSBpc2xhbmQuIERlZmF1bHQgZm9yIGNyZWF0ZVdvcmxkIGFuZCBhbGwgbGVnYWN5IHNhdmVzLiAqL1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WRVJTSU9OID0gMTtcbi8qKiBHZW5lcmF0b3IgdjI6IHZhbGxleS13aXRoLW1vdW50YWlucyBnZW9ncmFwaHkgd2l0aCBhIG1vdW50YWluIHJpdmVyIChzZWUgdGVycmFpbi12Mi50cykuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1YyID0gMjtcbi8qKiBUaGUgZ2VuZXJhdG9yIG5ldyBicm93c2VyIHdvcmxkcyB1c2UgYnkgZGVmYXVsdC4gKi9cbmV4cG9ydCBjb25zdCBMQVRFU1RfR0VORVJBVE9SX1ZFUlNJT04gPSBHRU5FUkFUT1JfVjI7XG5leHBvcnQgY29uc3QgU1VQUE9SVEVEX0dFTkVSQVRPUl9WRVJTSU9OUzogcmVhZG9ubHkgbnVtYmVyW10gPSBbR0VORVJBVE9SX1ZFUlNJT04sIEdFTkVSQVRPUl9WMl07XG5leHBvcnQgY29uc3QgaXNTdXBwb3J0ZWRHZW5lcmF0b3IgPSAodjogdW5rbm93bik6IHYgaXMgbnVtYmVyID0+XG4gIHR5cGVvZiB2ID09PSAnbnVtYmVyJyAmJiBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TLmluY2x1ZGVzKHYpO1xuZXhwb3J0IGNvbnN0IENIVU5LX1ZPTFVNRSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFICogV09STERfSEVJR0hUO1xuZXhwb3J0IGNvbnN0IENIVU5LX0FSRUEgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRTtcblxuZXhwb3J0IHsgTUFULCBpc1NvbGlkLCBpc09wYXF1ZSwgTUFYX01BVF9JRCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmV4cG9ydCB0eXBlIHsgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBNQVQsIGlzU29saWQsIE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuXG5leHBvcnQge1xuICBjbGFtcCwgbGVycCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIGZibTIsXG59IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHtcbiAgY2xhbXAsIGxlcnAsIHNtb290aHN0ZXAsIGhhc2gyaSwgaGFzaDNpLCBtdWxiZXJyeTMyLCB2YWx1ZU5vaXNlMywgZmJtMiwgZmJtMyxcbn0gZnJvbSAnLi9ub2lzZSc7XG5cbi8vIC0tLS0tLS0tLS0gd29ybGQgdHlwZXMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFBhcmFtcyB7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1BBUkFNUzogV29ybGRQYXJhbXMgPSB7XG4gIHNpemU6IFdPUkxEX1NJWkUsXG4gIGNodW5rU2l6ZTogQ0hVTktfU0laRSxcbiAgeU1pbjogWV9NSU4sXG4gIHlNYXg6IFlfTUFYLFxuICBzZWFMZXZlbDogU0VBX0xFVkVMLFxuICBnZW5lcmF0b3JWZXJzaW9uOiBHRU5FUkFUT1JfVkVSU0lPTixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIGtleTogc3RyaW5nO1xuICAvKiogeCArIHoqMzIgKyAoeS1ZX01JTikqMTAyNCAqL1xuICBkYXRhOiBVaW50OEFycmF5O1xuICAvKiogdG9wIHNvbGlkIHksIGVuY29kZWQgYXMgKHkgLSBZX01JTiksIDAuLjEyNzsgMCBtZWFucyBubyBzb2xpZC4gKi9cbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgLyoqIHRvcCBtYXRlcmlhbCBwZXIgY29sdW1uLiAqL1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xuICBkaXJ0eTogYm9vbGVhbjtcbiAgZ2VuZXJhdGVkQXQ6IG51bWJlcjtcbn1cblxuLy8gTmF0dXJhbCBhc3NldHMgYXJlIHRoZSBwcm9qZWN0J3MgU3R5bCAoYG5hdF9gKSBwaXBlbGluZSAoQVMtMDAxIHYyKSwgbm90XG4vLyBOb3hlbCBhcmNoaXRlY3R1cmUuIE5veGVsIHJlbWFpbnMgdGhlIGh1bWFuLW1hZGUga2l0L3dheXN0b25lL21hcmtlciBzeXN0ZW0uXG4vLyBSZXRpcmVkIG9ubHkgYXMgd29ybGQgY29udGVudC4gVGhlIG5hbWVzIHJlbWFpbiBpbiB0aGUgc2VyaWFsaXplZCB0eXBlIHNvXG4vLyBvbGQgc25hcHNob3RzIGFuZCBhY2NlcHRlZCBoYXJ2ZXN0IGpvdXJuYWxzIGNhbiBiZSBtaWdyYXRlZCB3aXRob3V0IHJlamVjdGluZ1xuLy8gb3RoZXJ3aXNlIHZhbGlkIHNhdmVzLiBHZW5lcmF0aW9uLCBjb2xsaXNpb24gYW5kIGluc3BlY3Rpb24gbmV2ZXIgdXNlIHRoZW0uXG5leHBvcnQgY29uc3QgUkVUSVJFRF9TVE9ORV9LSU5EUyA9IG5ldyBTZXQ8RW50aXR5S2luZD4oW1xuICAnc3R5bF9yb2NrX3NtYWxsJywgJ3N0eWxfcm9ja19tZWRpdW0nLCAnc3R5bF9yb2NrX2xhcmdlJyxcbl0pO1xuZXhwb3J0IGNvbnN0IGlzUmV0aXJlZFN0b25lS2luZCA9IChraW5kOiBFbnRpdHlLaW5kKTogYm9vbGVhbiA9PiBSRVRJUkVEX1NUT05FX0tJTkRTLmhhcyhraW5kKTtcbmV4cG9ydCB0eXBlIEFjdGl2ZUVudGl0eUtpbmQgPSBFeGNsdWRlPEVudGl0eUtpbmQsXG4gICdzdHlsX3JvY2tfc21hbGwnIHwgJ3N0eWxfcm9ja19tZWRpdW0nIHwgJ3N0eWxfcm9ja19sYXJnZSc+O1xuXG5mdW5jdGlvbiBsaXZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEVudGl0eSB8IG51bGwge1xuICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICByZXR1cm4gIWVudGl0eSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGlkKSA/IG51bGwgOiBlbnRpdHk7XG59XG5cbmV4cG9ydCB0eXBlIEVudGl0eUtpbmQgPVxuICB8ICdzdHlsX3RyZWVfc3BpcmUnXG4gIHwgJ3N0eWxfdHJlZV90YWJsZSdcbiAgfCAnc3R5bF90cmVlX2NsdXN0ZXInXG4gIHwgJ3N0eWxfdHJlZV9ibG9zc29tJ1xuICB8ICdzdHlsX3NocnViJ1xuICB8ICdzdHlsX3JvY2tfc21hbGwnXG4gIHwgJ3N0eWxfcm9ja19tZWRpdW0nXG4gIHwgJ3N0eWxfcm9ja19sYXJnZSdcbiAgfCAnc3R5bF9vcmUnXG4gIHwgJ3N0eWxfY2Fpcm4nXG4gIHwgJ3dheXN0b25lJ1xuICB8ICdtYXJrZXInO1xuXG5leHBvcnQgdHlwZSBSZXNvdXJjZVR5cGUgPSAnd29vZCcgfCAnc3RvbmUnIHwgJ29yZScgfCAnZmliZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVudGl0eSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIGNodW5rOiBzdHJpbmc7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBzY2FsZTogbnVtYmVyO1xuICB2YXJpYW50OiBudW1iZXI7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsO1xuICByZW1haW5pbmc6IG51bWJlcjtcbiAgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXI7XG4gIC8qKiBUcnVlIG9uY2UgdGhlIGVudGl0eSBpcyBmdWxseSBkZXBsZXRlZC4gKi9cbiAgaGFydmVzdGVkOiBib29sZWFuO1xuICAvKiogVHJ1ZSBhZnRlciB0aGUgZmlyc3Qgc3VjY2Vzc2Z1bCBoYXJ2ZXN0LCBldmVuIGlmIHlpZWxkIHJlbWFpbnMuICovXG4gIGhhcnZlc3RlZE9uY2U/OiBib29sZWFuO1xuICBwcm92aXNpb25hbDogYm9vbGVhbjtcbiAgYXV0aG9yZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm94ZWxTaXRlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgcHJvdmlzaW9uYWw6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVnaW9uSW5mbyB7XG4gIGlkOiBzdHJpbmc7XG4gIGxhYmVsOiBzdHJpbmc7XG4gIHR5cGU6ICdwbGFpbicgfCAnZm9yZXN0JyB8ICdoaWxscycgfCAnaGlnaGxhbmQnIHwgJ3dhdGVyJyB8ICdyaWRnZSc7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHJ4OiBudW1iZXI7XG4gIHJ6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRTdGF0cyB7XG4gIGNodW5rc0dlbmVyYXRlZDogbnVtYmVyO1xuICBjaHVua3NFdmljdGVkOiBudW1iZXI7XG4gIHZveGVsc0ZpbGxlZDogbnVtYmVyO1xuICBnZW5lcmF0aW9uTXM6IG51bWJlcjtcbiAgZW50aXRpZXM6IG51bWJlcjtcbiAgdHJlZXM6IG51bWJlcjtcbiAgcGlua1RyZWVzOiBudW1iZXI7XG4gIHBpbmtPdmVyZmxvdzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkIHtcbiAgc2VlZDogbnVtYmVyO1xuICBwYXJhbXM6IFdvcmxkUGFyYW1zO1xuICBjaHVua3M6IE1hcDxzdHJpbmcsIFZveGVsQ2h1bms+O1xuICBlbnRpdGllczogTWFwPHN0cmluZywgRW50aXR5PjtcbiAgZW50aXR5Q2h1bmtzOiBNYXA8c3RyaW5nLCBzdHJpbmdbXT47XG4gIC8qKiBDaHVua3Mgd2hvc2UgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWVudGl0eSBzdGF0ZSBoYXMgYmVlbiBjaGFuZ2VkLiAqL1xuICBlbnRpdHlDaGFuZ2VzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIFRvbWJzdG9uZXMgZm9yIHJlbW92ZWQgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsIGVudGl0aWVzLiAqL1xuICBlbnRpdHlSZW1vdmFsczogU2V0PHN0cmluZz47XG4gIC8qKiBBdXRob3JpdGF0aXZlIGJ1aWx0IHN0cnVjdHVyZXMgKGhvdXNlLCBwYXRoLCB0ZXJyYWNlcywgY3JvcHMpLiAqL1xuICBzdHJ1Y3R1cmVzOiBNYXA8c3RyaW5nLCBTdHJ1Y3R1cmU+O1xuICBzaXRlczogTm94ZWxTaXRlW107XG4gIHJlZ2lvbnM6IFJlZ2lvbkluZm9bXTtcbiAgLyoqIGNodW5rIGtleSAtPiBsb2NhbCB2b3hlbCBpbmRleCAtPiBtYXRlcmlhbC4gRHVyYWJsZSwgY29tcGFjdCBlZGl0cy4gKi9cbiAgZWRpdHM6IE1hcDxzdHJpbmcsIE1hcDxudW1iZXIsIG51bWJlcj4+O1xuICAvKiogR2xvYmFsIGxvY2FsLXBsYXllciBjYXJyaWVkIGJhZzsgYm91bmRlZCBpbiBzY2hlbWEgMywgbGVnYWN5IGluIDEvMi4gKi9cbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICAvKiogUHJlc2VudCBvbmx5IGFmdGVyIHNjaGVtYS0zIGdlbmVzaXMvcmVzdG9yYXRpb24uICovXG4gIGxpZmU/OiBMaWZlU3RhdGU7XG4gIGRpcnR5OiBTZXQ8c3RyaW5nPjtcbiAgc3RhdHM6IFdvcmxkU3RhdHM7XG4gIGF1dGhvcmVkUGxhY2VkOiBib29sZWFuO1xuICAvKipcbiAgICogTW9ub3RvbmljIHJldmlzaW9uIG9mIGF1dGhvcml0YXRpdmUgc3RhdGUgKHZveGVscyBhbmQgZW50aXRpZXMpLiBEZXJpdmVkXG4gICAqIGNhY2hlcyBrZXllZCBvbiB0aGlzIHZhbHVlIGFyZSBkaXNjYXJkZWQgYWZ0ZXIgYW4gZWRpdDsgbWVzaC9uYXZpZ2F0aW9uXG4gICAqIHJldmlzaW9ucyBhcmUgc2VwYXJhdGUgYmVjYXVzZSB0aGV5IGFyZSBkZXJpdmVkLCBub3Qgd29ybGQgc3RhdGUuXG4gICAqL1xuICByZXZpc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgY2h1bmtLZXkgPSAoY3g6IG51bWJlciwgY3o6IG51bWJlcikgPT4gYCR7Y3h9LCR7Y3p9YDtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblggPSAoY3g6IG51bWJlcikgPT4gY3ggKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblogPSAoY3o6IG51bWJlcikgPT4gY3ogKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBsb2NhbEluZGV4ID0gKGx4OiBudW1iZXIsIHlJbmRleDogbnVtYmVyLCBsejogbnVtYmVyKSA9PlxuICBseCArIGx6ICogQ0hVTktfU0laRSArIHlJbmRleCAqIENIVU5LX0FSRUE7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWCA9ICh4OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHggKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ogPSAoejogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh6ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxYID0gKHg6IG51bWJlcikgPT4geCAtICh3b3JsZFRvQ2h1bmtYKHgpICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFogPSAoejogbnVtYmVyKSA9PiB6IC0gKHdvcmxkVG9DaHVua1ooeikgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3QgeVRvSW5kZXggPSAoeTogbnVtYmVyKSA9PiB5IC0gWV9NSU47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXb3JsZChzZWVkID0gMTMzNywgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBpZiAoIWlzU3VwcG9ydGVkR2VuZXJhdG9yKGdlbmVyYXRvclZlcnNpb24pKSB0aHJvdyBuZXcgRXJyb3IoYHVuc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uICR7Z2VuZXJhdG9yVmVyc2lvbn1gKTtcbiAgcmV0dXJuIHtcbiAgICBzZWVkLFxuICAgIHBhcmFtczogeyAuLi5ERUZBVUxUX1BBUkFNUywgZ2VuZXJhdG9yVmVyc2lvbiB9LFxuICAgIGNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0aWVzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2hhbmdlczogbmV3IFNldCgpLFxuICAgIGVudGl0eVJlbW92YWxzOiBuZXcgU2V0KCksXG4gICAgc3RydWN0dXJlczogbmV3IE1hcCgpLFxuICAgIHNpdGVzOiBbXSxcbiAgICByZWdpb25zOiBSRUdJT05TLFxuICAgIGVkaXRzOiBuZXcgTWFwKCksXG4gICAgaW52ZW50b3J5OiB7fSxcbiAgICBkaXJ0eTogbmV3IFNldCgpLFxuICAgIHN0YXRzOiB7XG4gICAgICBjaHVua3NHZW5lcmF0ZWQ6IDAsIGNodW5rc0V2aWN0ZWQ6IDAsIHZveGVsc0ZpbGxlZDogMCwgZ2VuZXJhdGlvbk1zOiAwLFxuICAgICAgZW50aXRpZXM6IDAsIHRyZWVzOiAwLCBwaW5rVHJlZXM6IDAsIHBpbmtPdmVyZmxvdzogMCxcbiAgICB9LFxuICAgIGF1dGhvcmVkUGxhY2VkOiBmYWxzZSxcbiAgICByZXZpc2lvbjogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlV29ybGQoc2VlZCA9IDEzMzcsIGluaXRpYWxSYWRpdXMgPSAwLCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCwgZ2VuZXJhdG9yVmVyc2lvbik7XG4gIGNvbnN0IGNlbnRyZSA9IE1hdGguZmxvb3IoQ0hVTktTX1BFUl9TSURFIC8gMik7XG4gIGZvciAobGV0IGN6ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ogPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ggPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3grKykge1xuICAgICAgZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICB9XG4gIH1cbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuXG4vLyAtLS0tLS0tLS0tIGdlb2dyYXBoeSAtLS0tLS0tLS0tXG5leHBvcnQgY29uc3QgUkVHSU9OUzogUmVnaW9uSW5mb1tdID0gW1xuICB7IGlkOiAnZm91bmRlcicsIGxhYmVsOiAnRm91bmRlciB2YWxsZXknLCB0eXBlOiAncGxhaW4nLCBjeDogMCwgY3o6IDAsIHJ4OiAxMTAsIHJ6OiA4NSB9LFxuICB7IGlkOiAnZWFzdHdvb2QnLCBsYWJlbDogJ0Vhc3R3b29kJywgdHlwZTogJ2ZvcmVzdCcsIGN4OiAyMjAsIGN6OiAtMTEwLCByeDogMjYwLCByejogMjIwIH0sXG4gIHsgaWQ6ICdjcm93bicsIGxhYmVsOiAnQ3Jvd24gaGlnaGxhbmRzJywgdHlwZTogJ2hpZ2hsYW5kJywgY3g6IC0zNjAsIGN6OiAtMzAwLCByeDogMzgwLCByejogMzAwIH0sXG4gIHsgaWQ6ICdsYWtlJywgbGFiZWw6ICdNaXJyb3IgbGFrZScsIHR5cGU6ICd3YXRlcicsIGN4OiAtMjYwLCBjejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH0sXG4gIHsgaWQ6ICdzb3V0aGRvd25zJywgbGFiZWw6ICdTb3V0aCBkb3ducycsIHR5cGU6ICdoaWxscycsIGN4OiAxMjAsIGN6OiAzMzAsIHJ4OiAyNjAsIHJ6OiAxOTAgfSxcbiAgeyBpZDogJ3dlc3RyaXNlJywgbGFiZWw6ICdXZXN0IHJpc2UnLCB0eXBlOiAnaGlsbHMnLCBjeDogLTM2MCwgY3o6IDEyMCwgcng6IDIyMCwgcno6IDIxMCB9LFxuICB7IGlkOiAnY29hc3QnLCBsYWJlbDogJ0Jyb2tlbiBjb2FzdCcsIHR5cGU6ICdyaWRnZScsIGN4OiAwLCBjejogMCwgcng6IDc4MCwgcno6IDY2MCB9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyQ2VudGVyWCh6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUaGUgcml2ZXIgcnVucyBub3J0aFx1MjAxM3NvdXRoIGFib3V0IDcwXHUyMDEzMTEwIG0gd2VzdCBvZiB0aGUgZm91bmRlciBzaGVsZiwgc29cbiAgLy8gdGhlIGRlZmF1bHQgbm9ydGgtd2VzdCB2aWV3IGhhcyB3YXRlciwgYSBuZWFyIGJhbmsgYW5kIGEgZmFyIGJhbmsuXG4gIHJldHVybiAtOTAgKyA1NSAqIE1hdGguc2luKCh6ICsgMTAwKSAvIDI0MCkgKyAxOCAqIE1hdGguc2luKCh6IC0gMjApIC8gODApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLmFicyh4IC0gcml2ZXJDZW50ZXJYKHopKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxha2VEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLnNxcnQoKCh4ICsgMjYwKSAvIDEyMCkgKiogMiArICgoeiArIDIzMCkgLyA5NSkgKiogMik7XG59XG5cbi8qKlxuICogSW50ZWdlciB0b3Agc29saWQgeSBvZiB0aGUgYmFzZSBnZW5lcmF0ZWQgc3VyZmFjZSAobm8gZWRpdHMvb3ZlcmhhbmdzKS5cbiAqXG4gKiBUaGlzIGlzIHRoZSAqc2hhcGUqIHRoZSB2b3hlbCB2b2x1bWUgaXMgZmlsbGVkIGZyb20sIG5vdCB0aGUgc3RvcmVkIHdvcmxkLlxuICogVGhlIGltcG9ydGFudCBjb3JyZWN0aW9uIG92ZXIgdGhlIGZpcnN0IE0wMDEgcGFzcyBpcyB0aGF0IHRoZSBsYW5kc2NhcGUgaXNcbiAqIG5vdCBvbmUgc21vb3RoIHJhZGlhbCBib3dsOiBpdCBpcyBhIHdhcnBlZCBtdWx0aS1zY2FsZSBzdXJmYWNlIHdpdGggYSBicm9hZFxuICogcml2ZXIgdmFsbGV5LCBhIHNtYWxsIGJ1aWxkYWJsZSBzaGVsZiwgYW5kIHJpZGdlZCBoaWdobGFuZHMuIEEgc2hhbGxvd1xuICogc21vb3RoIHN1cmZhY2UgcXVhbnRpc2VkIHRvIDEgbSB2b3hlbHMgaXMgd2hhdCBwcm9kdWNlZCB0aGUgY29uY2VudHJpY1xuICogY29udG91ciByaW5nczsgdmFyaWVkIHJlbGllZiBhbmQgYSByaXZlciB2YWxsZXkgYnJlYWsgdGhlbSBuYXR1cmFsbHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlSGVpZ2h0QXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFR3by1zY2FsZSBkb21haW4gd2FycC4gVGhlIGJyb2FkIHdhcnAgbW92ZXMgY29hc3RsaW5lcyBhbmQgaGlsbHM7IHRoZVxuICAvLyBzbWFsbCB3YXJwIGtlZXBzIHRoZSAxIG0gcXVhbnRpc2F0aW9uIGZyb20gZm9sbG93aW5nIGNsZWFuIGNvbnRvdXJzLlxuICBjb25zdCB3eCA9IHhcbiAgICArIChmYm0yKHggLyA0MjAsIHogLyA0MjAsIHNlZWQgKyAxMDEsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1LCB6IC8gOTUsIHNlZWQgKyAxMDIsIDIpIC0gMC41KSAqIDMwO1xuICBjb25zdCB3eiA9IHpcbiAgICArIChmYm0yKHggLyA0MjAgKyA3LjMsIHogLyA0MjAgLSAzLjEsIHNlZWQgKyAxMDMsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1ICsgMy43LCB6IC8gOTUgLSA4LjEsIHNlZWQgKyAxMDQsIDIpIC0gMC41KSAqIDMwO1xuXG4gIGNvbnN0IHJhZGlhbCA9IE1hdGguc3FydCgod3ggLyA3ODApICoqIDIgKyAod3ogLyA2NjApICoqIDIpO1xuICBjb25zdCBjb2FzdE5vaXNlID0gKGZibTIod3ggLyAzMDAsIHd6IC8gMzAwLCBzZWVkICsgMTA1LCA0KSAtIDAuNSkgKiAwLjM0XG4gICAgKyAoZmJtMih3eCAvIDk1LCB3eiAvIDk1LCBzZWVkICsgMTA2LCAyKSAtIDAuNSkgKiAwLjEwO1xuICBjb25zdCBsYW5kbmVzcyA9IDEuMCAtIHJhZGlhbCArIGNvYXN0Tm9pc2U7XG4gIGNvbnN0IGlubGFuZCA9IHNtb290aHN0ZXAoLTAuMDMsIDAuMTIsIGxhbmRuZXNzKTtcblxuICBjb25zdCBvY2VhbkZsb29yID0gLTEzICsgNiAqIGZibTIod3ggLyAxNzAsIHd6IC8gMTcwLCBzZWVkICsgMTA3LCAzKTtcblxuICAvLyBSb2xsaW5nIGxhbmQgYXQgdGhyZWUgc2NhbGVzLiBUaGUgNDAgbSBhbmQgMTUgbSBjb21wb25lbnRzIGFyZSByZWFsXG4gIC8vIHN1cmZhY2UgaGVpZ2h0LCBub3QgYSByZW5kZXIgZGVjb3JhdGlvbiwgc28gdGhlIG1hY3JvIHNhbXBsZXIgYWdyZWVzLlxuICBjb25zdCBzd2VsbCA9IDQgKyAxMSAqIGZibTIod3ggLyAzNDAsIHd6IC8gMzQwLCBzZWVkICsgMTA4LCA0KTtcbiAgY29uc3QgaGlsbHMgPSA4ICogZmJtMih3eCAvIDExNSwgd3ogLyAxMTUsIHNlZWQgKyAxMDksIDMpO1xuICBjb25zdCBidW1wcyA9IDIuMiAqIGZibTIoeCAvIDQyLCB6IC8gNDIsIHNlZWQgKyAxMTAsIDIpXG4gICAgKyAwLjkgKiBmYm0yKHggLyAxNSwgeiAvIDE1LCBzZWVkICsgMTExLCAyKTtcblxuICAvLyBSaWRnZWQgaGlnaGxhbmRzLiBUaGUgbWFzc2lmIG1hc2sgaXMgcmVnaW9uYWwgYW5kIGJpYXNlZCB0byB0aGVcbiAgLy8gbm9ydGgtd2VzdDsgd2l0aG91dCB0aGUgcmVnaW9uYWwgZ2F0ZSB0aGUgZmlyc3QgTTAwMSBwYXNzIHJhaXNlZCBhIDQ4IG1cbiAgLy8gbW91bnRhaW4gZGlyZWN0bHkgdW5kZXIgdGhlIGZvdW5kZXIgc2hlbGYuXG4gIGNvbnN0IG1hc3NpZk5vaXNlID0gZmJtMih3eCAvIDQ4MCArIDExLCB3eiAvIDQ4MCAtIDcsIHNlZWQgKyAxMTIsIDQpO1xuICBjb25zdCBtYXNzaWZNYXNrID0gc21vb3Roc3RlcCgwLjYwLCAwLjc4LCBtYXNzaWZOb2lzZSk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMjMwLCB3eiAvIDIzMCwgc2VlZCArIDExMywgNCkgLSAxKTtcbiAgY29uc3QgcmlkZ2UyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTQsIDMpIC0gMSk7XG4gIGNvbnN0IG53QmlhcyA9IE1hdGguZXhwKC0oKCh3eCArIDM2MCkgLyAzODApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDMyMCkgKiogMikpO1xuICBjb25zdCBtb3VudCA9IE1hdGgubWluKDEsIG1hc3NpZk1hc2sgKiAoMC4zMCArIDAuNzAgKiBud0JpYXMpICsgMC4yMiAqIG53Qmlhcyk7XG5cbiAgbGV0IGggPSBzd2VsbCArIGhpbGxzICsgYnVtcHNcbiAgICArIG1vdW50ICogKDIwICsgNDAgKiByaWRnZSAqIHJpZGdlICsgMTIgKiByaWRnZTIpO1xuXG4gIC8vIFNwdXJzIGFuZCBndWxsaWVzIGF0IDMwXHUyMDEzOTAgbS4gV2l0aG91dCB0aGVzZSwgYSBzbW9vdGggaGlsbCBxdWFudGlzZWQgdG9cbiAgLy8gMSBtIHZveGVscyByZWFkcyBhcyBjb25jZW50cmljIGNvbnRvdXIgcmluZ3M7IHdpdGggdGhlbSwgdGhlIHNhbWUgaGlsbFxuICAvLyBicmVha3MgaW50byByaWRnZXMsIHNpZGUgdmFsbGV5cyBhbmQgcm9jayBmYWNlcy5cbiAgY29uc3Qgc3B1ciA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDg1LCB3eiAvIDg1LCBzZWVkICsgMTIwLCAzKSAtIDEpO1xuICBjb25zdCBndWxseSA9IE1hdGgucG93KDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDUyICsgMTMsIHd6IC8gNTIgLSA1LCBzZWVkICsgMTIxLCAzKSAtIDEpLCAyKTtcbiAgaCArPSAoc3B1ciAtIDAuNTUpICogNS4wIC0gZ3VsbHkgKiAzLjI7XG5cbiAgaCA9IG9jZWFuRmxvb3IgKyAoaCAtIG9jZWFuRmxvb3IpICogaW5sYW5kO1xuICBoICs9IDEuNiAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG5cbiAgLy8gQnJvYWQgcml2ZXIgdmFsbGV5LCB0aGVuIHRoZSBjaGFubmVsIGl0c2VsZi4gVGhlIHZhbGxleSBtYXNrIGlzIGdhdGVkIGJ5XG4gIC8vIGxhbmRuZXNzOiB3aXRob3V0IHRoZSBnYXRlIGl0IHB1bGxlZCB0aGUgb2NlYW4gZmxvb3IgdXAgdG8gdGhlIHZhbGxleVxuICAvLyBmbG9vciBvdXRzaWRlIHRoZSBpc2xhbmQsIHdoaWNoIHRoZSBtYXAgdmlldyBzaG93ZWQgYXMgcGFsZSByaXZlci1zaGFwZWRcbiAgLy8gYmFycyBydW5uaW5nIHRvIHRoZSBob3Jpem9uLlxuICBjb25zdCByZCA9IHJpdmVyRGlzdGFuY2Uod3gsIHd6KTtcbiAgY29uc3QgdmFsbGV5ID0gc21vb3Roc3RlcCg5NSwgMTAsIHJkKSAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG4gIGNvbnN0IHZhbGxleUZsb29yID0gMi41ICsgMS4wICogZmJtMih3eCAvIDYwLCB3eiAvIDYwLCBzZWVkICsgMTE1LCAyKTtcbiAgaCA9IGxlcnAoaCwgdmFsbGV5Rmxvb3IsIHZhbGxleSAqIDAuNzUpO1xuICBjb25zdCByaXZlclcgPSA1LjAgKyAzLjAgKiBmYm0yKHd4IC8gNDUsIHd6IC8gNDUsIHNlZWQgKyAxMTYsIDIpO1xuICAvLyBBIHdpZGUsIHNoYWxsb3cgY2hhbm5lbCBwcm9maWxlLiBUaGUgZmlyc3QgcGFzcyBjYXJ2ZWQgYSAxMiBtIHNsb3Qgd2l0aFxuICAvLyBuZWFyLXZlcnRpY2FsIGJhbmtzLCB3aGljaCByZWFkIGFzIGEgYnJpZ2h0IHN0b25lIHF1YXJyeSByYXRoZXIgdGhhbiBhXG4gIC8vIHJpdmVyLiBUaGUgb3V0ZXIgZWRnZSBpcyBub3cgfjI1IG0gZnJvbSB0aGUgY2VudHJlbGluZSwgYW5kIHRoZSBiZWQgaXNcbiAgLy8gb25seSAyIG0gYmVsb3cgc2VhIGxldmVsLlxuICBjb25zdCBjaGFubmVsID0gc21vb3Roc3RlcChyaXZlclcgKyAxOCwgcml2ZXJXICogMC40LCByZCk7XG4gIGlmIChsYW5kbmVzcyA+IDAuMCkgaCA9IGxlcnAoaCwgLTIuMCwgY2hhbm5lbCAqIDAuOTUpO1xuXG4gIC8vIExha2UgYmFzaW4gYXQgdGhlIGZvb3Qgb2YgdGhlIG5vcnRoLXdlc3QgaGlnaGxhbmRzLlxuICBjb25zdCBsYWtlRCA9IGxha2VEaXN0YW5jZSh3eCwgd3opXG4gICAgKiAoMSArIDAuMTggKiAoZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE3LCAyKSAtIDAuNSkgKiAyKTtcbiAgaWYgKGxha2VEIDwgMS4xNSkge1xuICAgIGNvbnN0IGxha2VNYXNrID0gc21vb3Roc3RlcCgxLjE1LCAwLjU1LCBsYWtlRCk7XG4gICAgaCA9IGxlcnAoaCwgLTYuNSwgbGFrZU1hc2sgKiAwLjk1KTtcbiAgfVxuXG4gIC8vIEZvdW5kZXIgc2hlbGY6IGEgc21hbGwsIGlycmVndWxhciBidWlsZGFibGUgdGVycmFjZSBvbiB0aGUgZWFzdCBiYW5rLlxuICAvLyBEZWxpYmVyYXRlbHkgbm90IGEgMjYwIG0gcmFkaWFsIGZsYXR0ZW47IHRoZSBwcmV2aW91cyBwYXNzIHNob3dlZCB0aGF0IGFcbiAgLy8gbGFyZ2UgZmxhdHRlbi10by1jb25zdGFudCBiZWNvbWVzIGEgdmlzaWJsZSBib3dsIG9mIGNvbnRvdXIgcmluZ3MuXG4gIGNvbnN0IHNoZWxmRCA9IE1hdGguc3FydCgoKHggKyA4KSAvIDYyKSAqKiAyICsgKCh6IC0gNCkgLyA0OCkgKiogMilcbiAgICArIChmYm0yKHggLyA0NSwgeiAvIDQ1LCBzZWVkICsgMTE4LCAyKSAtIDAuNSkgKiAwLjU1O1xuICBjb25zdCBzaGVsZiA9IHNtb290aHN0ZXAoMS4wNSwgMC41NSwgc2hlbGZEKTtcbiAgaWYgKHNoZWxmID4gMCkge1xuICAgIGNvbnN0IHRhcmdldCA9IDEzLjAgKyAxLjIgKiBmYm0yKHggLyAzNiwgeiAvIDM2LCBzZWVkICsgMTE5LCAyKSArIHggKiAwLjAxO1xuICAgIGggPSBsZXJwKGgsIHRhcmdldCwgc2hlbGYgKiAwLjc4KTtcbiAgfVxuXG4gIHJldHVybiBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgOTIpKTtcbn1cblxuZnVuY3Rpb24gc2xvcGVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAxKSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMSkpLFxuICApO1xufVxuXG5mdW5jdGlvbiB0b3BNYXRlcmlhbEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbik6IE1hdElkIHtcbiAgLy8gUml2ZXIgYmVkIGlzIGdyYXZlbDsgdGhlIGJlYWNoIGlzIGEgbmFycm93IHNhbmQgYmFuZCwgbm90IHRoZSB3aG9sZVxuICAvLyB2YWxsZXkgZmxvb3IuIFRoZSBmaXJzdCBwYXNzIG1hcmtlZCBldmVyeSBjZWxsIHdpdGhpbiA0IG0gb2Ygc2VhIGxldmVsXG4gIC8vIGFzIHNhbmQsIHdoaWNoIHByb2R1Y2VkIGEgY29uc3BpY3VvdXMgcGFsZSBzdHJpcCBhbG9uZyB0aGUgcml2ZXIuXG4gIGlmIChyaXZlckRpc3RhbmNlKHgsIHopIDwgMTIgJiYgaCA8IFNFQV9MRVZFTCArIDEpIHJldHVybiBNQVQuR1JBVkVMO1xuICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAwLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKG5lYXJXYXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbmVhcldhdGVyID1cbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAzKSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMykgPCBTRUFfTEVWRUwgKyAxO1xuICB9XG4gIGlmIChuZWFyV2F0ZXIgJiYgaCA8PSBTRUFfTEVWRUwgKyAxLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHNsb3BlID49IDMpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNTggJiYgZmJtMih4IC8gMTgsIHogLyAxOCwgc2VlZCArIDEyMCwgMikgPiAwLjQ1KSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQ4ICYmIHNsb3BlID49IDIpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDAgJiYgc2xvcGUgPj0gMiAmJiBmYm0yKHggLyAxMiwgeiAvIDEyLCBzZWVkICsgMTIxLCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU1RPTkU7XG4gIHJldHVybiBNQVQuR1JBU1M7XG5cbn1cblxuLyoqIFB1YmxpYyBiYXNlLW1hdGVyaWFsIHNlbGVjdG9yIGZvciBtYWNybyBMT0QgYW5kIHRlc3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbChcbiAgc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI6IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5mdW5jdGlvbiBzdWJzb2lsRm9yKHRvcDogTWF0SWQpOiBNYXRJZCB7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFTUyB8fCB0b3AgPT09IE1BVC5NT1NTKSByZXR1cm4gTUFULlNPSUw7XG4gIGlmICh0b3AgPT09IE1BVC5TTk9XKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAodG9wID09PSBNQVQuR1JBVkVMKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgcmV0dXJuIE1BVC5TVE9ORTtcbn1cblxuZnVuY3Rpb24gb3JlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsdXN0ZXIgPSBmYm0yKHggLyA1NSwgeiAvIDU1LCBzZWVkICsgMTMwLCAyKTtcbiAgaWYgKGNsdXN0ZXIgPCAwLjU3KSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IG4gPSB2YWx1ZU5vaXNlMyh4ICogMC4wOSwgeSAqIDAuMTMsIHogKiAwLjA5LCBzZWVkICsgMTMxKTtcbiAgY29uc3QgbjIgPSB2YWx1ZU5vaXNlMyh4ICogMC4yMiArIDUsIHkgKiAwLjMxLCB6ICogMC4yMiAtIDMsIHNlZWQgKyAxMzIpO1xuICByZXR1cm4gbiA+IDAuNzAgJiYgbjIgPiAwLjUwO1xufVxuXG5mdW5jdGlvbiBjYXZlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBmYm0zKHggKiAwLjA3NSwgeSAqIDAuMTEsIHogKiAwLjA3NSwgc2VlZCArIDE0MCwgMikgPiAwLjcyO1xufVxuXG5mdW5jdGlvbiBvdmVyaGFuZ0F0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gdmFsdWVOb2lzZTMoeCAqIDAuMTgsIHkgKiAwLjIyLCB6ICogMC4xOCwgc2VlZCArIDE0MSkgPiAwLjYyO1xufVxuXG4vLyAtLS0tLS0tLS0tIHZlcnNpb25lZCBnZW5lcmF0b3IgZGlzcGF0Y2ggLS0tLS0tLS0tLVxuY29uc3QgdjJDYWNoZSA9IG5ldyBNYXA8bnVtYmVyLCBUZXJyYWluVjI+KCk7XG5jb25zdCBoeWRyb0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIEh5ZHJvbG9neT4oKTtcblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2d5IG5ldHdvcmsgZm9yIGEgc2VlZCBhbmQgZ2VuZXJhdG9yIHZlcnNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gaHlkcm9sb2d5Rm9yKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyKTogSHlkcm9sb2d5IHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmh5ZHJvbG9neTtcbiAgY29uc3Qga2V5ID0gYCR7c2VlZH06JHt2ZXJzaW9ufWA7XG4gIGxldCBoeWRybyA9IGh5ZHJvQ2FjaGUuZ2V0KGtleSk7XG4gIGlmICghaHlkcm8pIHtcbiAgICBoeWRybyA9IG5ldyBIeWRyb2xvZ3koeyBzZWVkLCB2ZXJzaW9uLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBoeWRyb0NhY2hlLnNldChrZXksIGh5ZHJvKTtcbiAgfVxuICByZXR1cm4gaHlkcm87XG59XG5cbi8qKiBAaW50ZXJuYWwgVGhlIHYyIGdlbmVyYXRvciBmb3IgYSBzZWVkIChjYWNoZWQ7IHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRlcnJhaW5WMihzZWVkOiBudW1iZXIpOiBUZXJyYWluVjIge1xuICBsZXQgZ2VuID0gdjJDYWNoZS5nZXQoc2VlZCk7XG4gIGlmICghZ2VuKSB7XG4gICAgY29uc3QgaHlkcm9sb2d5ID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb246IEdFTkVSQVRPUl9WMiwgdjFIZWlnaHQ6ICh4LCB6KSA9PiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeikgfSk7XG4gICAgZ2VuID0gbmV3IFRlcnJhaW5WMihzZWVkLCBzdXJmYWNlSGVpZ2h0QXQsIGh5ZHJvbG9neSk7XG4gICAgdjJDYWNoZS5zZXQoc2VlZCwgZ2VuKTtcbiAgfVxuICByZXR1cm4gZ2VuO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgaGVpZ2h0ICh0b3Agc29saWQgKyAxKSBmb3IgYW55IHN1cHBvcnRlZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlSGVpZ2h0QXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpLmhlaWdodCh4LCB6KSA6IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbn1cblxuLyoqIEJhc2UgZ2VuZXJhdGVkIHdhdGVyIHN1cmZhY2U6IHdhdGVyIGZpbGxzIGNlbGxzIFtoZWlnaHQsIGxldmVsKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlV2F0ZXJMZXZlbEF0KHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikgcmV0dXJuIHRlcnJhaW5WMihzZWVkKS5jb2x1bW4oeCwgeikubGV2ZWw7XG4gIGNvbnN0IGggPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIDogaDtcbn1cblxuZnVuY3Rpb24gdmVyc2lvbmVkU2xvcGUoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4IC0gMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCArIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogLSAxKSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6ICsgMSkpLFxuICApO1xufVxuXG4vKiogQmFzZSB0b3AgbWF0ZXJpYWwgZm9yIGFueSBnZW5lcmF0b3IgdmVyc2lvbiAobWFjcm8gTE9ELCBlbnRpdHkgcGxhY2VtZW50KS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWxGb3IoXG4gIHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuLFxuKTogTWF0SWQge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHtcbiAgICBjb25zdCBnZW4gPSB0ZXJyYWluVjIoc2VlZCk7XG4gICAgcmV0dXJuIGdlbi50b3BNYXRlcmlhbCh4LCB6LCBnZW4uY29sdW1uKHgsIHopLCBzbG9wZSxcbiAgICAgIChoaCwgc3MpID0+IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaGgsIHNzLCBuZWFyV2F0ZXIpKTtcbiAgfVxuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeTogbnVtYmVyO1xuICB0b3A6IE1hdElkO1xuICBzbG9wZTogbnVtYmVyO1xufVxuXG4vKiogQmFzZSBzdXJmYWNlIHNhbXBsZSBmb3IgbWFjcm8gTE9ELiBEb2VzIG5vdCBpbmNsdWRlIHZveGVsIGVkaXRzL292ZXJoYW5ncy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVTdXJmYWNlKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBTdXJmYWNlU2FtcGxlIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgY29uc3Qgc2xvcGUgPSBzbG9wZUF0KHNlZWQsIHgsIHosIHkpO1xuICByZXR1cm4geyB5LCB0b3A6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgeSwgc2xvcGUpLCBzbG9wZSB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNodW5rIGdlbmVyYXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgcmV0dXJuIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcblxuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfVk9MVU1FKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCB0b3BNYXRlcmlhbHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGNvbnN0IHNlZWQgPSB3b3JsZC5zZWVkO1xuICBjb25zdCB2MiA9IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uID49IEdFTkVSQVRPUl9WMiA/IHRlcnJhaW5WMihzZWVkKSA6IG51bGw7XG5cbiAgLy8gUGFkZGVkIGhlaWdodCBjYWNoZTogYSB0aHJlZS1jZWxsIGJvcmRlciBjb3ZlcnMgc2xvcGUsIGJlYWNoIGFuZCBsZWRnZXMuXG4gIGNvbnN0IFAgPSAzO1xuICBjb25zdCBQVyA9IENIVU5LX1NJWkUgKyBQICogMjtcbiAgY29uc3QgYmFzZUggPSBuZXcgSW50MTZBcnJheShQVyAqIFBXKTtcbiAgY29uc3QgdjJDb2xzOiBWMkNvbHVtbltdIHwgbnVsbCA9IHYyID8gbmV3IEFycmF5KENIVU5LX0FSRUEpIDogbnVsbDtcbiAgZm9yIChsZXQgcHogPSAwOyBweiA8IFBXOyBweisrKSB7XG4gICAgZm9yIChsZXQgcHggPSAwOyBweCA8IFBXOyBweCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgcHggLSBQLCB3eiA9IG96ICsgcHogLSBQO1xuICAgICAgaWYgKHYyKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHYyLmNvbHVtbih3eCwgd3opO1xuICAgICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gY29sLmg7XG4gICAgICAgIGNvbnN0IGx4ID0gcHggLSBQLCBseiA9IHB6IC0gUDtcbiAgICAgICAgaWYgKGx4ID49IDAgJiYgbHogPj0gMCAmJiBseCA8IENIVU5LX1NJWkUgJiYgbHogPCBDSFVOS19TSVpFKSB2MkNvbHMhW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNvbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgd3gsIHd6KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBsZXQgbm9uQWlyID0gMDtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgY29uc3QgbmVhcldhdGVyID1cbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQIC0gMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCArIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxO1xuICAgICAgY29uc3QgdjJDb2wgPSB2MkNvbHMgPyB2MkNvbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIDogbnVsbDtcbiAgICAgIGNvbnN0IHRvcCA9IHYyICYmIHYyQ29sXG4gICAgICAgID8gdjIudG9wTWF0ZXJpYWwod3gsIHd6LCB2MkNvbCwgc2xvcGUsIChoaCwgc3MpID0+IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoaCwgc3MsIG5lYXJXYXRlcikpXG4gICAgICAgIDogdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xuICAgICAgY29uc3Qgc3ViID0gc3Vic29pbEZvcih0b3ApO1xuICAgICAgY29uc3Qgb3JlUG90ZW50aWFsID0gZmJtMih3eCAvIDU1LCB3eiAvIDU1LCBzZWVkICsgMTMwLCAyKSA+IDAuNTc7XG4gICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcblxuICAgICAgY29uc3Qgc3RhcnQgPSBZX01JTjtcbiAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgaCAtIDEpO1xuICAgICAgZm9yIChsZXQgeSA9IHN0YXJ0OyB5IDw9IGVuZDsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGRlcHRoID0gaCAtIDEgLSB5O1xuICAgICAgICBsZXQgbTogTWF0SWQ7XG4gICAgICAgIGlmICh5ID09PSBZX01JTikgbSA9IE1BVC5CRURST0NLO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA9PT0gMCkgbSA9IHRvcDtcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPD0gMikgbSA9IHN1YjtcbiAgICAgICAgZWxzZSBtID0gTUFULlNUT05FO1xuXG4gICAgICAgIGlmIChtID09PSBNQVQuU1RPTkUgJiYgZGVwdGggPiA0ICYmIG9yZVBvdGVudGlhbCAmJiBvcmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5PUkU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTcGFyc2UgM0Qgb3ZlcmhhbmdzL3VuZGVyY3V0cyBhdCBzdGVlcCBmYWNlcy4gVGhpcyBpcyBhIHJlYWxcbiAgICAgICAgLy8gb2NjdXBhbmN5IGNoYW5nZSwgbm90IGEgZGVjb3JhdGlvbiBvbiB0b3Agb2YgYSBoZWlnaHRmaWVsZC5cbiAgICAgICAgaWYgKGRlcHRoIDw9IDIgJiYgc2xvcGUgPj0gMiAmJiBvdmVyaGFuZ0F0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWVwIGNhdmVzLCBrZXB0IGF3YXkgZnJvbSB0aGUgc3VyZmFjZSBzbyB0aGV5IGRvIG5vdCBjcmVhdGUgaG9sZXMuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSICYmIGRlcHRoID4gNyAmJiBkZXB0aCA8IDI0ICYmIGNhdmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0gPSBtO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFdhdGVyIHZvbHVtZTogZXZlcnl0aGluZyBhYm92ZSB0aGUgc29saWQgc3VyZmFjZSB1cCB0byB0aGUgY29sdW1uJ3NcbiAgICAgIC8vIHdhdGVyIGxldmVsIChzZWEgbGV2ZWwgaW4gdjE7IHRoZSBoeWRyb2xvZ2ljYWwgbGV2ZWwgaW4gdjIpLlxuICAgICAgY29uc3Qgd2F0ZXJMZXZlbCA9IHYyQ29sID8gTWF0aC5taW4oWV9NQVgsIHYyQ29sLmxldmVsKSA6IFNFQV9MRVZFTDtcbiAgICAgIGlmIChoIDwgd2F0ZXJMZXZlbCkge1xuICAgICAgICBmb3IgKGxldCB5ID0gTWF0aC5tYXgoWV9NSU4sIGgpOyB5IDwgd2F0ZXJMZXZlbDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KTtcbiAgICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuV0FURVI7XG4gICAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9wU29saWQgPSBNYXRoLm1pbihZX01BWCAtIDEsIE1hdGgubWF4KFlfTUlOLCBoIC0gMSkpO1xuICAgICAgaGVpZ2h0c1tjb2xdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbY29sXSA9IHRvcDtcbiAgICB9XG4gIH1cblxuICAvLyBQcm90cnVkaW5nIGxlZGdlczogb25lIG9yIHR3byBzdG9uZSBibG9ja3MgZXh0ZW5kIGZyb20gYSBoaWdoIGNvbHVtbiBvdmVyXG4gIC8vIGEgbG93ZXIgbmVpZ2hib3VyLiBUaGV5IGNyZWF0ZSByZWFkYWJsZSBvdmVyaGFuZ3Mgd2l0aG91dCBhIGZ1bGwgY2F2ZSBwYXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgaWYgKHNsb3BlIDwgMikgY29udGludWU7XG4gICAgICBjb25zdCBkaXJzOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiA9IFtbLTEsIDBdLCBbMSwgMF0sIFswLCAtMV0sIFswLCAxXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIGRpcnMpIHtcbiAgICAgICAgY29uc3QgbnggPSBseCArIGR4LCBueiA9IGx6ICsgZHo7XG4gICAgICAgIGlmIChueCA8IDAgfHwgbnogPCAwIHx8IG54ID49IENIVU5LX1NJWkUgfHwgbnogPj0gQ0hVTktfU0laRSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IG5oID0gYmFzZUhbKG56ICsgUCkgKiBQVyArIChueCArIFApXTtcbiAgICAgICAgaWYgKGggLSBuaCA8IDIpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoaGFzaDNpKGx4LCBseiwgZHggKiAzICsgZHogKiA3LCBzZWVkICsgMTUwKSA8IDAuNTUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB5ID0gaCAtIDI7XG4gICAgICAgIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBoKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChueCwgeVRvSW5kZXgoeSksIG56KTtcbiAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5TVE9ORTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJlY29tcHV0ZSB0aGUgY29sdW1uIGNhY2hlIGFmdGVyIGxlZGdlcy9jYXZlcy4gVGhlIGV4cG9zZWQgdG9wIG1hdGVyaWFsXG4gIC8vIG11c3QgY29tZSBmcm9tIHRoZSBhY3R1YWwgdG9wIHNvbGlkIHZveGVsLCBub3QgdGhlIHByZS1jYXJ2ZSBndWVzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICBsZXQgdG9wTWF0OiBudW1iZXIgPSB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICAgICAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgICAgIGNvbnN0IG0gPSBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildO1xuICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICB9XG4gICAgICBoZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRvcE1hdDtcbiAgICB9XG4gIH1cblxuICBjb25zdCBjaHVuazogVm94ZWxDaHVuayA9IHtcbiAgICBjeCwgY3osIGtleSwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIsXG4gICAgZGlydHk6IHRydWUsXG4gICAgZ2VuZXJhdGVkQXQ6IHBlcmZvcm1hbmNlLm5vdygpLFxuICB9O1xuXG4gIC8vIEFwcGx5IGR1cmFibGUgZWRpdHMgYWZ0ZXIgYmFzZSBnZW5lcmF0aW9uLlxuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICBpZiAoZWRpdHMpIHtcbiAgICBmb3IgKGNvbnN0IFtpZHgsIG1dIG9mIGVkaXRzKSB7XG4gICAgICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICAgIH1cbiAgICAvLyBSZWNvbXB1dGUgdGhlIGNhY2hlIGZvciBlZGl0ZWQgY2h1bmtzLlxuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIGx4LCBseik7XG4gICAgfVxuICB9XG4gIC8vIE5vbi1haXIgY291bnRzIGFyZSBkZXJpdmVkIHJlbmRlcmVyIHN0YXRpc3RpY3MsIG5vdCBkdXJhYmxlIHdvcmxkIHN0YXRlLlxuICAvLyBFZGl0ZWQgYmFzZSBhaXIgbWF5IGJlY29tZSBzb2xpZCAoYW5kIHZpY2UgdmVyc2EpIGR1cmluZyByZXN0b3JhdGlvbi5cbiAgbGV0IGVkaXRlZE5vbkFpciA9IDA7XG4gIGZvciAoY29uc3QgbWF0ZXJpYWwgb2YgY2h1bmsuZGF0YSkgaWYgKG1hdGVyaWFsICE9PSBNQVQuQUlSKSBlZGl0ZWROb25BaXIrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IGVkaXRlZE5vbkFpciAtIG5vbkFpcjtcblxuICB3b3JsZC5jaHVua3Muc2V0KGtleSwgY2h1bmspO1xuICB3b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IG5vbkFpcjtcbiAgd29ybGQuc3RhdHMuZ2VuZXJhdGlvbk1zICs9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gIHdvcmxkLmRpcnR5LmFkZChrZXkpO1xuXG4gIGdlbmVyYXRlRW50aXRpZXMod29ybGQsIGNodW5rKTtcbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vKiogQSBiYXNlLXRlcnJhaW4gY2FjaGUgc2hhcmVkIGJ5IGVkaXRlZCBhbmQgdW5lZGl0ZWQgcmVnZW5lcmF0aW9uLiBOYXR1cmFsXG4gKiBzY2VuZXJ5IG5ldmVyIGRlcGVuZHMgb24gbGF0ZXIgdm94ZWwgZWRpdHM7IHRoaXMgYWxzbyBsZXRzIGEgc25hcHNob3QgcmVzdG9yZVxuICogYSBoYXJ2ZXN0ZWQgY2h1bmsgd2l0aG91dCBtYXRlcmlhbGl6aW5nIHVucmVsYXRlZCBuZWlnaGJvdXJpbmcgY2h1bmtzLiAqL1xuY29uc3QgYmFzZUNvbHVtbkNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hcDxzdHJpbmcsIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0+PigpO1xuXG5mdW5jdGlvbiBiYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXkgfSB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgY29uc3QgY2FjaGVkID0gY2FjaGUuZ2V0KGNodW5rLmtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG4gIGNvbnN0IGNvbHVtbnMgPSB7IGhlaWdodHM6IG5ldyBVaW50OEFycmF5KGNodW5rLmhlaWdodHMpLCB0b3BNYXRlcmlhbHM6IG5ldyBVaW50OEFycmF5KGNodW5rLnRvcE1hdGVyaWFscykgfTtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCkgKyBseCwgeiA9IGNodW5rT3JpZ2luWihjaHVuay5jeikgKyBsejtcbiAgICAgIGNvbnN0IHZlcnNpb24gPSB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbjtcbiAgICAgIGNvbnN0IGggPSBiYXNlSGVpZ2h0QXQod29ybGQuc2VlZCwgdmVyc2lvbiwgeCwgeik7XG4gICAgICBjb25zdCBzbG9wZSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gdmVyc2lvbmVkU2xvcGUod29ybGQuc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCkgOiBzbG9wZUF0KHdvcmxkLnNlZWQsIHgsIHosIGgpO1xuICAgICAgY29uc3QgaW5kZXggPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbHVtbnMuaGVpZ2h0c1tpbmRleF0gPSBjbGFtcChoIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgY29sdW1ucy50b3BNYXRlcmlhbHNbaW5kZXhdID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyBiYXNlVG9wTWF0ZXJpYWxGb3Iod29ybGQuc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCwgc2xvcGUpXG4gICAgICAgIDogdG9wTWF0ZXJpYWxBdCh3b3JsZC5zZWVkLCB4LCB6LCBoLCBzbG9wZSk7XG4gICAgfVxuICB9XG4gIGNhY2hlLnNldChjaHVuay5rZXksIGNvbHVtbnMpO1xuICByZXR1cm4gY29sdW1ucztcbn1cblxuLy8gLS0tLS0tLS0tLSBkZXJpdmVkIGNoYW5nZSB0cmFja2luZyAobm90IGF1dGhvcml0YXRpdmUgc3RhdGUpIC0tLS0tLS0tLS1cbi8vIFJlbmRlcmVycyBuZWVkIHRvIGtub3cgd2hlbiB0aGUgZWRpdCBvdmVybGF5IGNoYW5nZWQgd2l0aG91dCB3YWxraW5nIGV2ZXJ5XG4vLyBlZGl0IGVhY2ggZnJhbWUuIFRoZSBjb3VudGVyIGxpdmVzIG91dHNpZGUgV29ybGQgc28gaXQgbmV2ZXIgZW50ZXJzIGFcbi8vIHNuYXBzaG90IG9yIGNhbm9uaWNhbCBoYXNoLlxuY29uc3QgZWRpdFZlcnNpb25zID0gbmV3IFdlYWtNYXA8V29ybGQsIG51bWJlcj4oKTtcblxuLyoqIE1vbm90b25pYyBjb3VudCBvZiBlZGl0LW92ZXJsYXkgY2hhbmdlcyBmb3IgdGhpcyBXb3JsZCBvYmplY3QuICovXG5leHBvcnQgZnVuY3Rpb24gZWRpdFZlcnNpb24od29ybGQ6IFdvcmxkKTogbnVtYmVyIHtcbiAgcmV0dXJuIGVkaXRWZXJzaW9ucy5nZXQod29ybGQpID8/IDA7XG59XG5cbi8qKiBDYWxsIGFmdGVyIHJlcGxhY2luZyBvciBidWxrLWNoYW5naW5nIGB3b3JsZC5lZGl0c2Agb3V0c2lkZSBzZXRWb3hlbC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBlZGl0VmVyc2lvbnMuc2V0KHdvcmxkLCBlZGl0VmVyc2lvbih3b3JsZCkgKyAxKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBub24tZ2VuZXJhdGluZyBxdWVyaWVzIC0tLS0tLS0tLS1cbi8vIE1vdmluZyBwcmVzZW50YXRpb24gKGNoYXJhY3RlcnMsIGFuaW1hbHMsIGNhbWVyYSkgbXVzdCBuZXZlciB0cmlnZ2VyIGNodW5rXG4vLyBnZW5lcmF0aW9uIGFzIGEgc2lkZSBlZmZlY3Qgb2YgYXNraW5nIGFib3V0IHRlcnJhaW4uIFRoZXNlIHJldHVybiBudWxsIHdoZW5cbi8vIHRoZSBjb2x1bW4ncyBjaHVuayBpcyBub3QgcmVzaWRlbnQuXG5cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudENodW5rQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KHdvcmxkVG9DaHVua1goeCksIHdvcmxkVG9DaHVua1ooeikpKSA/PyBudWxsO1xufVxuXG4vKiogTGlrZSBzdXJmYWNlQXQsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB8IG51bGwge1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG4vKiogTGlrZSBnZXRWb3hlbCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFZveGVsQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQgfCBudWxsIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV2aWN0Q2h1bmsod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5jaHVua3MuZGVsZXRlKGtleSk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0V2aWN0ZWQrKztcbiAgLy8gQ2h1bmsgYnl0ZXMgYW5kIGNvbHVtbiBjYWNoZXMgYXJlIHJlZ2VuZXJhdGVkIG9uIGRlbWFuZC4gRW50aXRpZXMgcmVtYWluXG4gIC8vIGF1dGhvcml0YXRpdmU6IGV2aWN0aW9uIG11c3Qgbm90IGZvcmdldCB0aGVpciBwZXJzaXN0ZW50IHN0YXRlLlxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBxdWVyaWVzIC8gZWRpdHMgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGdldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgbTogTWF0SWQpOiBib29sZWFuIHtcbiAgaWYgKHkgPCBZX01JTiB8fCB5ID49IFlfTUFYKSByZXR1cm4gZmFsc2U7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpO1xuICBjb25zdCBwcmV2aW91c0VkaXQgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk/LmdldChpZHgpO1xuICAvLyBBIGNodW5rIGV2aWN0ZWQgYWZ0ZXIgYW4gZWFybGllciBlZGl0IGNhbiByZWdlbmVyYXRlIHdpdGggdGhhdCBkdXJhYmxlXG4gIC8vIG1hdGVyaWFsIGFscmVhZHkgYXBwbGllZC4gRHJvcHBpbmcgdGhlIGVkaXQgaGVyZSB3b3VsZCBtYWtlIGl0IGRpc2FwcGVhclxuICAvLyBvbiB0aGUgbmV4dCBldmljdGlvbi9yZXN0b3JhdGlvbiwgZXZlbiB0aG91Z2ggdGhlIGN1cnJlbnQgd3JpdGUgbm8tb3BzLlxuICBpZiAocHJldmlvdXNFZGl0ID09PSBtKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBmYWxzZTtcbiAgbGV0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rLmtleSk7XG4gIGlmICghZWRpdHMpIHsgZWRpdHMgPSBuZXcgTWFwKCk7IHdvcmxkLmVkaXRzLnNldChjaHVuay5rZXksIGVkaXRzKTsgfVxuICAvLyBBbiBpZGVtcG90ZW50IHdyaXRlIG11c3Qgc3RpbGwgcmVzdG9yZSBhIGR1cmFibGUgZGVsdGEgZGlzY2FyZGVkIGJ5IGFuXG4gIC8vIG9sZGVyIHNuYXBzaG90IG9yIGRlbHRhIGRlY29kZXIuIEl0IGlzIG5vdCBhIG5ldyBhdXRob3JpdGF0aXZlIHJldmlzaW9uLlxuICBpZiAoY2h1bmsuZGF0YVtpZHhdID09PSBtKSB7XG4gICAgaWYgKCFlZGl0cy5oYXMoaWR4KSkgZWRpdHMuc2V0KGlkeCwgbSk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gIGVkaXRzLnNldChpZHgsIG0pO1xuICBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkKTtcbiAgY2h1bmsuZGlydHkgPSB0cnVlO1xuICB3b3JsZC5kaXJ0eS5hZGQoY2h1bmsua2V5KTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIHdvcmxkVG9Mb2NhbFgoeCksIHdvcmxkVG9Mb2NhbFooeikpO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bms6IFZveGVsQ2h1bmssIGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgIGlmIChpc1NvbGlkKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0pKSB7IHRvcFNvbGlkID0geTsgYnJlYWs7IH1cbiAgfVxuICBjaHVuay5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICBjb25zdCB0bSA9IGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gIGlmICh0b3BTb2xpZCA+PSBZX01JTikge1xuICAgIGNvbnN0IG0gPSBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHRvcFNvbGlkKSwgbHopXTtcbiAgICBpZiAobSAhPT0gTUFULldBVEVSKSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gbTtcbiAgfSBlbHNlIHtcbiAgICBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG07XG4gIH1cbn1cblxuLyoqXG4gKiBUaGUgeSBjb29yZGluYXRlIG9mIHRoZSBleHBvc2VkIHRvcCBmYWNlIG9mIHRoZSBzb2xpZCBjb2x1bW4gYXQgeC96LlxuICogQSBzb2xpZCB2b3hlbCBhdCB5IG9jY3VwaWVzIFt5LCB5KzEpLCBzbyB0aGUgd2Fsa2FibGUgc3VyZmFjZSBpcyB0b3BTb2xpZCsxLlxuICogVGhpcyBpcyBhIGRlcml2ZWQgcXVlcnk7IHRoZSBhdXRob3JpdGF0aXZlIHN0YXRlIHJlbWFpbnMgdGhlIHZveGVsIHZvbHVtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIFlfTUlOO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIFlfTUlOO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay50b3BNYXRlcmlhbHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhlaWdodEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uIDwgR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgaCA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gICAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgLSBoIDogMDtcbiAgfVxuICByZXR1cm4gd2F0ZXJTdXJmYWNlQXQod29ybGQsIHgsIHopIC0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuLyoqXG4gKiBUb3Agb2YgdGhlIHdhdGVyIGNvbHVtbiBzdGFuZGluZyBvbiB0aGUgc29saWQgc3VyZmFjZSAoZXF1YWwgdG8gdGhlIHN1cmZhY2VcbiAqIHdoZW4gZHJ5KS4gUmVhZHMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWxzLCBzbyBlZGl0cyBhbmQgZHVnIHBpdHMgYXJlIGV4YWN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgd2hpbGUgKHkgPCBZX01BWCAmJiBnZXRWb3hlbCh3b3JsZCwgeCwgeSwgeikgPT09IE1BVC5XQVRFUikgeSsrO1xuICByZXR1cm4geTtcbn1cblxuLy8gLS0tLS0tLS0tLSBlbnRpdGllcyAtLS0tLS0tLS0tXG5mdW5jdGlvbiBhZGRFbnRpdHkod29ybGQ6IFdvcmxkLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLmhhcyhlLmlkKSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgcmV0dXJuO1xuICB3b3JsZC5lbnRpdGllcy5zZXQoZS5pZCwgZSk7XG4gIGxldCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBsaXN0KTsgfVxuICBsaXN0LnB1c2goZS5pZCk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgLy8gR2VuZXJhdGlvbiBpcyBkZXRlcm1pbmlzdGljIGFuZCBhZHZhbmNlcyBubyBwbGF5ZXItY29tbWFuZCBwcmVjb25kaXRpb24uXG4gIC8vIEF1dGhvcmVkIHNjYWZmb2xkaW5nIG1heSB0cmFuc2llbnRseSBjaGFuZ2UgaXQ7IHRoZSBzbmFwc2hvdCByZXN0b3JlcyB0aGVcbiAgLy8gc2F2ZWQgcmV2aXNpb24gYWZ0ZXIgcGxhY2luZyB0aGF0IHNjYWZmb2xkaW5nLlxufVxuXG4vKipcbiAqIFJlbW92ZSBhbiBlbnRpdHkgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB3b3JsZC4gVXNlZCB3aGVuIGEgc2l0ZSBpcyBjbGVhcmVkOlxuICogdGhlIHJlc291cmNlIHlpZWxkIGlzIGFjY291bnRlZCBmb3IgYnkgdGhlIGNhbGxlciwgYW5kIHRoZSBlbnRpdHkgbXVzdCBzdG9wXG4gKiBleGlzdGluZyBmb3IgY29sbGlzaW9uLCBvYnN0cnVjdGlvbiBhbmQgcGVyc2lzdGVuY2UsIG5vdCBqdXN0IGJlIGhpZGRlbiBieVxuICogdGhlIHJlbmRlcmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gIGNvbnN0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAobGlzdCkge1xuICAgIGNvbnN0IGkgPSBsaXN0LmluZGV4T2YoaWQpO1xuICAgIGlmIChpID49IDApIGxpc3Quc3BsaWNlKGksIDEpO1xuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGlkKTtcbiAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZW50aXR5SWQoY2h1bms6IHN0cmluZywgaTogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBlOiR7Y2h1bmt9OiR7aX1gO1xufVxuXG5mdW5jdGlvbiBmb3Jlc3RTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBlYXN0ID0gTWF0aC5leHAoLSgoKHd4IC0gMjIwKSAvIDI2MCkgKiogMiArICgod3ogKyAxMTApIC8gMjIwKSAqKiAyKSk7XG4gIGNvbnN0IG5vcnRoID0gTWF0aC5leHAoLSgoKHd4IC0gMjApIC8gMzAwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAxOTApICoqIDIpKTtcbiAgY29uc3Qgd2VzdCA9IE1hdGguZXhwKC0oKCh3eCArIDM0MCkgLyAyMDApICoqIDIgKyAoKHd6IC0gMTIwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBzb3V0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDEyMCkgLyAyNDApICoqIDIgKyAoKHd6IC0gMzMwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBtb2lzdHVyZSA9IGZibTIod3ggLyAyNjAsIHd6IC8gMjYwLCBzZWVkICsgMjAxLCA0KTtcbiAgY29uc3QgdmFsbGV5ID0gTWF0aC5leHAoLSgod3ggLyAxNDApICoqIDIgKyAod3ogLyAxMDUpICoqIDIpKTtcbiAgcmV0dXJuIE1hdGgubWF4KGVhc3QsIG5vcnRoICogMC45Miwgd2VzdCAqIDAuODAsIHNvdXRoICogMC43OCkgKiAwLjgyXG4gICAgKyBtb2lzdHVyZSAqIDAuMzggLSAwLjIyIC0gdmFsbGV5ICogMC4zNDtcbn1cblxuZnVuY3Rpb24gcm9ja1Njb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IG1vdW50YWluID0gZmJtMih3eCAvIDMzMCwgd3ogLyAzMzAsIHNlZWQgKyAyMDIsIDMpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDE0MCwgd3ogLyAxNDAsIHNlZWQgKyAyMDMsIDMpIC0gMSk7XG4gIHJldHVybiBtb3VudGFpbiAqIDAuNTUgKyByaWRnZSAqIDAuNDU7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRW50aXRpZXMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHZvaWQge1xuICBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkLCBjaHVuay5jeCwgY2h1bmsuY3opO1xufVxuXG4vKiogQGludGVybmFsIFJlcGxheXMgZGV0ZXJtaW5pc3RpYyBnZW5lcmF0aW9uIGZvciBzbmFwc2hvdCBlbnRpdHkgZGVsdGFzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGlmICh3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGtleSkpIHJldHVybjtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuO1xuXG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKGhhc2gyaShjaHVuay5jeCwgY2h1bmsuY3osIHdvcmxkLnNlZWQgKyA5MDApICogNDI5NDk2NzI5NikgPj4+IDApO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgY29uc3QgY29sdW1ucyA9IGJhc2VDb2x1bW5zKHdvcmxkLCBjaHVuayk7XG4gIGxldCBuID0gMDtcbiAgbGV0IG5hdHVyYWxUcmVlcyA9IDA7XG4gIGxldCBuYXR1cmFsUGlua1RyZWVzID0gMDtcblxuICBjb25zdCBsb2NhbFN1cmZhY2UgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gKyBZX01JTjtcbiAgfTtcbiAgY29uc3QgbG9jYWxUb3AgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IE1hdElkID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIGFzIE1hdElkO1xuICB9O1xuICBjb25zdCBsb2NhbFNsb3BlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICByZXR1cm4gTWF0aC5tYXgoXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICk7XG4gIH07XG5cbiAgLy8gQSBqaXR0ZXJlZCA4IG0gbGF0dGljZSBnaXZlcyBjb2hlcmVudCBtYXNzZXMgYW5kIGF2b2lkcyBwZXItZnJhbWUgc2NhdHRlci5cbiAgZm9yIChsZXQgZ3ogPSAwOyBneiA8IENIVU5LX1NJWkU7IGd6ICs9IDgpIHtcbiAgICBmb3IgKGxldCBneCA9IDA7IGd4IDwgQ0hVTktfU0laRTsgZ3ggKz0gOCkge1xuICAgICAgY29uc3QgbHggPSBjbGFtcChNYXRoLmZsb29yKGd4ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3QgbHogPSBjbGFtcChNYXRoLmZsb29yKGd6ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAxKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHNsb3BlID0gbG9jYWxTbG9wZShseCwgbHopO1xuICAgICAgY29uc3QgdG9wID0gbG9jYWxUb3AobHgsIGx6KTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikgY29udGludWU7XG4gICAgICBjb25zdCBmb3Jlc3QgPSBmb3Jlc3RTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9ja3kgPSByb2NrU2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvbGwgPSBybmQoKTtcblxuICAgICAgY29uc3QgdHJlZUNoYW5jZSA9IGZvcmVzdCA+IDAuNTAgPyAwLjcyIDogZm9yZXN0ID4gMC4zMCA/IDAuMjUgOiAwLjA1O1xuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDIgJiYgcm9sbCA8IHRyZWVDaGFuY2UpIHtcbiAgICAgICAgLy8gVGhlIGNhcCBpcyBhIGRldGVybWluaXN0aWMgbmF0dXJhbC1nZW5lcmF0aW9uIHByb3BlcnR5LiBJdCBjYW5ub3RcbiAgICAgICAgLy8gZGVwZW5kIG9uIHdoaWNoIGNodW5rcyBhIHJlbmRlcmVyIGxvYWRlZCBiZWZvcmUgdGhpcyBvbmUuXG4gICAgICAgIGxldCBraW5kOiBFbnRpdHlLaW5kO1xuICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICBjb25zdCBzcGVjaWVzUm9sbCA9IHJuZCgpO1xuICAgICAgICBpZiAoc3BlY2llc1JvbGwgPCAwLjEyKSB7XG4gICAgICAgICAgaWYgKChuYXR1cmFsUGlua1RyZWVzICsgMSkgPiAwLjI1ICogKG5hdHVyYWxUcmVlcyArIDEpKSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rT3ZlcmZsb3crKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfYmxvc3NvbSc7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDIpO1xuICAgICAgICAgICAgbmF0dXJhbFBpbmtUcmVlcysrO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC40MCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3NwaXJlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC43NCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3RhYmxlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgIH1cbiAgICAgICAgbmF0dXJhbFRyZWVzKys7XG4gICAgICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjg4ICsgcm5kKCkgKiAwLjI0LCB2YXJpYW50LFxuICAgICAgICAgIHJlc291cmNlOiAnd29vZCcsIHJlbWFpbmluZzogMTIsIHlpZWxkUGVySGFydmVzdDogNCxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgcm9ja3kgPiAwLjQ2ICYmIHJvbGwgPCAwLjM4KSB7XG4gICAgICAgIC8vIENvbnN1bWUgdGhlIHJldGlyZWQgc3RvbmUgZm9ybSdzIHJhbmRvbSBkcmF3cyBhbmQgYWxsb2NhdGUgaXRzIG9sZFxuICAgICAgICAvLyBzZXF1ZW5jZSBJRCwgYnV0IGRvIG5vdCBpbnNlcnQgYW4gZW50aXR5LiBMYXRlciBuYXR1cmFsIHBsYWNlbWVudHNcbiAgICAgICAgLy8gdGhlcmVmb3JlIHJlbWFpbiBieXRlLWZvci1ieXRlIGNvbXBhdGlibGUgd2l0aCByZWNvcmRlZCBzYXZlcy5cbiAgICAgICAgY29uc3Qgc2l6ZVJvbGwgPSBybmQoKTtcbiAgICAgICAgY29uc3Qga2luZDogRW50aXR5S2luZCA9IHNpemVSb2xsIDwgMC41NSA/ICdzdHlsX3JvY2tfc21hbGwnXG4gICAgICAgICAgOiBzaXplUm9sbCA8IDAuOTAgPyAnc3R5bF9yb2NrX21lZGl1bScgOiAnc3R5bF9yb2NrX2xhcmdlJztcbiAgICAgICAgY29uc3QgaWQgPSBlbnRpdHlJZChjaHVuay5rZXksIG4rKyk7XG4gICAgICAgIGNvbnN0IHJlY29yZCA9IHtcbiAgICAgICAgICBpZCwga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJlc291cmNlOiAnc3RvbmUnIGFzIGNvbnN0LFxuICAgICAgICAgIHJlbWFpbmluZzoga2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyA0IDoga2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gOCA6IDEyLFxuICAgICAgICAgIHlpZWxkUGVySGFydmVzdDogMywgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gT25seSBlbnRpdGllcyB0aGF0IGV4aXN0ZWQgaW4gYW4gYWNjZXB0ZWQgb2xkIHNhdmUgZ2V0IHRvbWJzdG9uZXMsXG4gICAgICAgIC8vIGR1cmluZyBleHBsaWNpdCBtaWdyYXRpb24uIE9yZGluYXJ5IGdlbmVyYXRpb24gbXVzdCByZXN0b3JlIGV4YWN0bHkuXG4gICAgICAgIGlmIChpc1N0b25lUmVwbGF5KHdvcmxkKSkgYWRkRW50aXR5KHdvcmxkLCByZWNvcmQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSAmJiByb2NreSA+IDAuNTggJiYgcm9sbCA8IDAuMTgpIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9vcmUnLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMiksXG4gICAgICAgICAgcmVzb3VyY2U6ICdvcmUnLCByZW1haW5pbmc6IDgsIHlpZWxkUGVySGFydmVzdDogMixcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMSAmJiByb2xsIDwgMC4zMCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX3NocnViJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjggKyBybmQoKSAqIDAuNCwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICAgIHJlc291cmNlOiAnZmliZXInLCByZW1haW5pbmc6IDQsIHlpZWxkUGVySGFydmVzdDogMSxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkQXV0aG9yZWRFbnRpdHkod29ybGQ6IFdvcmxkLCBraW5kOiBFbnRpdHlLaW5kLCB4OiBudW1iZXIsIHo6IG51bWJlciwgdmFyaWFudDogbnVtYmVyLCByb3Q6IG51bWJlciwgc2NhbGU6IG51bWJlciwgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGwsIHJlbWFpbmluZzogbnVtYmVyLCB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHkgPD0gU0VBX0xFVkVMKSByZXR1cm47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAvLyBBIGhlcm8gYXNzZXQgb3ducyBpdHMgc3BvdDogY2xlYXIgYW55IGdlbmVyYXRlZCBlbnRpdHkgdGhhdCB3b3VsZCBvdmVybGFwXG4gIC8vIGl0LCByYXRoZXIgdGhhbiBzaWxlbnRseSBkcm9wcGluZyB0aGUgYXV0aG9yZWQgY29tcG9zaXRpb24uXG4gIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXTtcbiAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChraW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHJldHVybjtcbiAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoZSAmJiBNYXRoLmh5cG90KGUueCAtIHgsIGUueiAtIHopIDwgMi42KSB7XG4gICAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICAgICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICAgICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gICAgfVxuICB9XG4gIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSkpO1xuICAvLyBBdXRob3JlZCBjb21wb3NpdGlvbiBpcyBkdXJhYmxlIHN0YXRlOiBpdCBjYW4gY2xlYXIgb3ZlcmxhcHBpbmcgbmF0dXJhbFxuICAvLyBlbnRpdGllcywgc28gc2F2ZSB0aGUgY29tcGxldGUgYWZmZWN0ZWQgY2h1bmsgcmF0aGVyIHRoYW4gb25seSBpdHMgaGVyb2VzLlxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuXG4gIGNvbnN0IGlkID0gYGhlcm86JHtraW5kfToke01hdGgucm91bmQoeCl9OiR7TWF0aC5yb3VuZCh6KX1gO1xuICBjb25zdCBiZWZvcmUgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICBjb25zdCBlbnRpdHk6IEVudGl0eSA9IHtcbiAgICBpZCwga2luZCwgY2h1bms6IGtleSwgeDogeCArIDAuNSwgeSwgejogeiArIDAuNSxcbiAgICByb3QsIHNjYWxlLCB2YXJpYW50LCByZXNvdXJjZSwgcmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiB0cnVlLFxuICB9O1xuICBhZGRFbnRpdHkod29ybGQsIGVudGl0eSk7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5zaXplID4gYmVmb3JlICYmIGtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHtcbiAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgIGlmIChraW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBpZiAod29ybGQuYXV0aG9yZWRQbGFjZWQpIHJldHVybjtcbiAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSB0cnVlO1xuXG4gIGNvbnN0IHNpdGVzOiBBcnJheTx7IGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJzsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJvdDogbnVtYmVyIH0+ID0gW1xuICAgIHsga2luZDogJ3dheXN0b25lJywgeDogLTEwLCB6OiAtMTQsIHJvdDogMCB9LFxuICAgIHsga2luZDogJ21hcmtlcicsIHg6IC0zMiwgejogLTgsIHJvdDogTWF0aC5QSSAvIDIgfSxcbiAgXTtcbiAgZm9yIChjb25zdCBzIG9mIHNpdGVzKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgcy54LCBzLnopO1xuICAgIGlmICh5IDw9IFNFQV9MRVZFTCkgY29udGludWU7XG4gICAgd29ybGQuc2l0ZXMucHVzaCh7XG4gICAgICBpZDogYHNpdGU6JHtzLmtpbmR9YCxcbiAgICAgIGtpbmQ6IHMua2luZCxcbiAgICAgIHg6IHMueCArIDAuNSwgeSwgejogcy56ICsgMC41LFxuICAgICAgcm90OiBzLnJvdCxcbiAgICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gQSBoZXJvIGdyb3ZlIGNvbXBvc2VkIGluIHRoZSBkZWZhdWx0IGNhbWVyYSdzIHZpZXcgZGlyZWN0aW9uLiBUaGVzZSBhcmVcbiAgLy8gU3R5bCBuYXR1cmFsIGFzc2V0cyAoQVMtMDAxIHYyKSwgbm90IE5veGVsIGFyY2hpdGVjdHVyZTsgdGhlIE5veGVsXG4gIC8vIHdheXN0b25lL21hcmtlciBhYm92ZSByZW1haW4gdGhlIGh1bWFuLW1hZGUgbGFuZG1hcmtzLlxuICBjb25zdCBncm92ZTogQXJyYXk8W0VudGl0eUtpbmQsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXT4gPSBbXG4gICAgWydzdHlsX3RyZWVfc3BpcmUnLCAtMjIsIC0yNiwgMCwgMS4wMCwgMF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtMzQsIC0xOCwgMSwgMC45NSwgTWF0aC5QSSAvIDEyXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTE2LCAtMzQsIDIsIDEuMDAsIE1hdGguUEkgLyA2XSxcbiAgICBbJ3N0eWxfdHJlZV9ibG9zc29tJywgLTI4LCAtMzgsIDAsIDAuOTAsIE1hdGguUEkgLyA0XSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC00MCwgLTMwLCAyLCAxLjA1LCBNYXRoLlBJIC8gM10sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xMiwgLTI0LCAwLCAwLjkwLCBNYXRoLlBJIC8gMi40XSxcbiAgXTtcbiAgZm9yIChjb25zdCBba2luZCwgeCwgeiwgdmFyaWFudCwgc2NhbGUsIHJvdF0gb2YgZ3JvdmUpIHtcbiAgICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwga2luZCwgeCwgeiwgdmFyaWFudCwgcm90LCBzY2FsZSwgJ3dvb2QnLCAxMiwgNCk7XG4gIH1cbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3JvY2tfbWVkaXVtJywgLTYsIC0xMCwgMCwgMCwgMS4wLCAnc3RvbmUnLCA4LCAzKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3NocnViJywgLTE0LCAtOCwgMSwgTWF0aC5QSSAvIDEyLCAxLjEsICdmaWJlcicsIDQsIDEpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfY2Fpcm4nLCAtMjAsIC02LCAwLCAwLCAxLjAsICdzdG9uZScsIDYsIDIpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfb3JlJywgLTM4LCAtNDIsIDAsIE1hdGguUEkgLyA0LCAxLjEsICdvcmUnLCA4LCAyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5lYXJlc3RIYXJ2ZXN0YWJsZShcbiAgd29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgcmFkaXVzOiBudW1iZXIsIHJlc291cmNlPzogUmVzb3VyY2VUeXBlLFxuKTogRW50aXR5IHwgbnVsbCB7XG4gIGxldCBiZXN0OiBFbnRpdHkgfCBudWxsID0gbnVsbDtcbiAgbGV0IGJlc3REID0gcmFkaXVzICogcmFkaXVzO1xuICBmb3IgKGNvbnN0IGUgb2Ygd29ybGQuZW50aXRpZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpXG4gICAgICB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSBjb250aW51ZTtcbiAgICBpZiAocmVzb3VyY2UgJiYgZS5yZXNvdXJjZSAhPT0gcmVzb3VyY2UpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGQgPSAoZS54IC0geCkgKiogMiArIChlLnogLSB6KSAqKiAyO1xuICAgIGlmIChkIDwgYmVzdEQpIHsgYmVzdEQgPSBkOyBiZXN0ID0gZTsgfVxuICB9XG4gIHJldHVybiBiZXN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RSZXN1bHQgeyBlbnRpdHk6IEVudGl0eTsgcmVzb3VyY2U6IFJlc291cmNlVHlwZTsgYW1vdW50OiBudW1iZXI7IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogSGFydmVzdFJlc3VsdCB8IG51bGwge1xuICBjb25zdCBlID0gbGl2ZUVudGl0eSh3b3JsZCwgaWQpO1xuICBpZiAoIWUgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGFtb3VudCA9IE1hdGgubWluKGUueWllbGRQZXJIYXJ2ZXN0LCBlLnJlbWFpbmluZyk7XG4gIGlmICh3b3JsZC5saWZlICYmIE9iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgbikgPT4gc3VtICsgbiwgMCkgKyBhbW91bnQgPiAxMjApIHJldHVybiBudWxsO1xuICBlLnJlbWFpbmluZyAtPSBhbW91bnQ7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGUuaGFydmVzdGVkT25jZSA9IHRydWU7XG4gIGlmIChlLnJlbWFpbmluZyA8PSAwKSBlLmhhcnZlc3RlZCA9IHRydWU7XG4gIHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA9ICh3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IGVudGl0eTogZSwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCB9O1xufVxuXG4vKiogUmVtb3ZlIGV2ZXJ5IHJldGlyZWQgc291cmNlIGFmdGVyIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5LiBUaGlzIG1pZ3JhdGlvblxuICogY3JlYXRlcyBkZXRlcm1pbmlzdGljIHRvbWJzdG9uZXMgYnV0IGlzIG5vdCBhIHBsYXllciBjb21tYW5kIG9yIHJldmlzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJldGlyZVN0b25lRW50aXRpZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZSBvZiBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldKSB7XG4gICAgaWYgKCFpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSkgY29udGludWU7XG4gICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGUuaWQpO1xuICAgIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGUuaWQpO1xuICAgIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICAgIGlmICghd29ybGQuZW50aXR5Q2h1bmtzLmhhcyhlLmNodW5rKSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgZm9yIChjb25zdCBba2V5LCBpZHNdIG9mIHdvcmxkLmVudGl0eUNodW5rcykge1xuICAgIGNvbnN0IGFjdGl2ZSA9IGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKTtcbiAgICBpZiAoYWN0aXZlLmxlbmd0aCA+IDAgfHwgd29ybGQuZW50aXR5Q2hhbmdlcy5oYXMoa2V5KSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGFjdGl2ZSk7XG4gICAgZWxzZSB3b3JsZC5lbnRpdHlDaHVua3MuZGVsZXRlKGtleSk7XG4gIH1cbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBlcnNpc3RlbmNlIC8gYXV0aG9yaXR5IGJvdW5kYXJ5IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNYW5pZmVzdCB7XG4gIHNjaGVtYTogMTtcbiAgc2VlZDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBwYXJhbXNIYXNoOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGZudjFhKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoID0gMHg4MTFjOWRjNTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgaCBePSB0ZXh0LmNoYXJDb2RlQXQoaSk7XG4gICAgaCA9IE1hdGguaW11bChoLCAweDAxMDAwMTkzKTtcbiAgfVxuICByZXR1cm4gKGggPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ybGRNYW5pZmVzdCh3b3JsZDogV29ybGQpOiBXb3JsZE1hbmlmZXN0IHtcbiAgY29uc3QgcCA9IHdvcmxkLnBhcmFtcztcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAgc2VlZDogd29ybGQuc2VlZCxcbiAgICBnZW5lcmF0b3JWZXJzaW9uOiBwLmdlbmVyYXRvclZlcnNpb24sXG4gICAgc2l6ZTogcC5zaXplLFxuICAgIGNodW5rU2l6ZTogcC5jaHVua1NpemUsXG4gICAgeU1pbjogcC55TWluLFxuICAgIHlNYXg6IHAueU1heCxcbiAgICBzZWFMZXZlbDogcC5zZWFMZXZlbCxcbiAgICBwYXJhbXNIYXNoOiBmbnYxYShKU09OLnN0cmluZ2lmeShwKSksXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxFZGl0IHsgaTogbnVtYmVyOyBtOiBudW1iZXI7IH1cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIHNjaGVtYTogMTtcbiAga2V5OiBzdHJpbmc7XG4gIGJhc2VWZXJzaW9uOiBudW1iZXI7XG4gIGVkaXRzOiBWb3hlbEVkaXRbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cG9ydENodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IENodW5rRGVsdGEge1xuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBrZXksXG4gICAgYmFzZVZlcnNpb246IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIGVkaXRzOiBlZGl0cyA/IFsuLi5lZGl0cy5lbnRyaWVzKCldLm1hcCgoW2ksIG1dKSA9PiAoeyBpLCBtIH0pKS5zb3J0KChhLCBiKSA9PiBhLmkgLSBiLmkpIDogW10sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBkZWx0YTogQ2h1bmtEZWx0YSk6IHZvaWQge1xuICBjb25zdCBbY3gsIGN6XSA9IGRlbHRhLmtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICBmb3IgKGNvbnN0IGUgb2YgZGVsdGEuZWRpdHMpIHtcbiAgICBjb25zdCB5SW5kZXggPSBNYXRoLmZsb29yKGUuaSAvIENIVU5LX0FSRUEpO1xuICAgIGNvbnN0IHJlbSA9IGUuaSAlIENIVU5LX0FSRUE7XG4gICAgY29uc3QgbHogPSBNYXRoLmZsb29yKHJlbSAvIENIVU5LX1NJWkUpO1xuICAgIGNvbnN0IGx4ID0gcmVtICUgQ0hVTktfU0laRTtcbiAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4O1xuICAgIGNvbnN0IHkgPSBZX01JTiArIHlJbmRleDtcbiAgICBjb25zdCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgIHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBlLm0gYXMgTWF0SWQpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gdGltZSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFRpbWVTdGF0ZSB7IHQ6IG51bWJlcjsgZGF5TGVuZ3RoU2VjOiBudW1iZXI7IHBhdXNlZDogYm9vbGVhbjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpbWUoczogVGltZVN0YXRlLCBkdDogbnVtYmVyKTogdm9pZCB7XG4gIGlmIChzLnBhdXNlZCkgcmV0dXJuO1xuICBzLnQgPSAocy50ICsgZHQgLyBzLmRheUxlbmd0aFNlYykgJSAxO1xufVxuIiwgIi8vIFRlcnJhaW4gcXVlcnkgbGF5ZXIgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbiwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDIgU3lzdGVtIDE6IG9uZSBzaGFyZWQsIGNhY2hlZCBjb250cmFjdCBmb3IgY29uc3RydWN0aW9uLCBmYXJtaW5nLFxuLy8gbW92ZW1lbnQsIG5hdmlnYXRpb24gYW5kIHRoZSBBSSBhZ2VudC4gVGhlc2UgcXVlcmllcyBkZXNjcmliZSB0aGVcbi8vIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lOyB0aGV5IG5ldmVyIG11dGF0ZSBpdCBhbmQgbmV2ZXIgY3JlYXRlIGEgc2Vjb25kXG4vLyB0ZXJyYWluIHJlcHJlc2VudGF0aW9uLlxuLy9cbi8vIENvbnZlbnRpb25zOlxuLy8gICAqIHgveiBhcmUgaW50ZWdlciBjb2x1bW4gY29vcmRpbmF0ZXMgaW4gWy0xMDI0LCAxMDI0KS5cbi8vICAgKiB5IGlzIGFuIGludGVnZXIgdm94ZWwgY29vcmRpbmF0ZSBpbiBbLTE2LCAxMTIpLlxuLy8gICAqIHN1cmZhY2VZIGlzIHRoZSBleHBvc2VkIHRvcCBmYWNlICh0b3BTb2xpZCArIDEpLCBtYXRjaGluZyBNMDAxLlxuLy8gICAqIEEgcmVjdCBpcyBpbmNsdXNpdmUgb24gYWxsIGZvdXIgZWRnZXMuXG5pbXBvcnQge1xuICBXb3JsZCwgTWF0SWQsIE1BVCwgU0VBX0xFVkVMLCBZX01JTiwgWV9NQVgsIEhBTEYsXG4gIHN1cmZhY2VBdCwgdG9wTWF0ZXJpYWxBdFdvcmxkLCBnZXRWb3hlbCwgaXNTb2xpZCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIEFjdGl2ZUVudGl0eUtpbmQsIEVudGl0eUtpbmQsIGlzUmV0aXJlZFN0b25lS2luZCxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBpc1N0b25lUmVwbGF5IH0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlY3Qge1xuICB4MDogbnVtYmVyO1xuICB6MDogbnVtYmVyO1xuICB4MTogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsUmVnaW9uIGV4dGVuZHMgUmVjdCB7XG4gIHkwOiBudW1iZXI7XG4gIHkxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVSZWN0KHJlY3Q6IFJlY3QpOiBSZWN0IHtcbiAgcmV0dXJuIHtcbiAgICB4MDogTWF0aC5taW4ocmVjdC54MCwgcmVjdC54MSksXG4gICAgejA6IE1hdGgubWluKHJlY3QuejAsIHJlY3QuejEpLFxuICAgIHgxOiBNYXRoLm1heChyZWN0LngwLCByZWN0LngxKSxcbiAgICB6MTogTWF0aC5tYXgocmVjdC56MCwgcmVjdC56MSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0Q29sdW1ucyhyZWN0OiBSZWN0KTogbnVtYmVyIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIHJldHVybiAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdENvbnRhaW5zKHJlY3Q6IFJlY3QsIHg6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB4ID49IHJlY3QueDAgJiYgeCA8PSByZWN0LngxICYmIHogPj0gcmVjdC56MCAmJiB6IDw9IHJlY3QuejE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBhbmRSZWN0KHJlY3Q6IFJlY3QsIGFtb3VudDogbnVtYmVyKTogUmVjdCB7XG4gIHJldHVybiB7XG4gICAgeDA6IHJlY3QueDAgLSBhbW91bnQsXG4gICAgejA6IHJlY3QuejAgLSBhbW91bnQsXG4gICAgeDE6IHJlY3QueDEgKyBhbW91bnQsXG4gICAgejE6IHJlY3QuejEgKyBhbW91bnQsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0VG9SZWdpb24ocmVjdDogUmVjdCwgeTAgPSBZX01JTiwgeTEgPSBZX01BWCAtIDEpOiBWb3hlbFJlZ2lvbiB7XG4gIHJldHVybiB7IC4uLm5vcm1hbGl6ZVJlY3QocmVjdCksIHkwLCB5MSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaW9uc092ZXJsYXAoYTogVm94ZWxSZWdpb24sIGI6IFZveGVsUmVnaW9uKTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejBcbiAgICAmJiBhLnkwIDw9IGIueTEgJiYgYS55MSA+PSBiLnkwO1xufVxuXG4vKiogSW5jbHVzaXZlIGNvbnRhaW5tZW50IG9mIGEgdm94ZWwgaW4gYSB3b3JrIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVudmVsb3BlQ29udGFpbnMocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10sIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCByIG9mIHJlY3RzKSB7XG4gICAgaWYgKHggPj0gci54MCAmJiB4IDw9IHIueDEgJiYgeSA+PSByLnkwICYmIHkgPD0gci55MSAmJiB6ID49IHIuejAgJiYgeiA8PSByLnoxKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFpbkNvbHVtbiB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogRXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uOyB0aGUgZmlyc3QgYWlyIGNlbGwgYWJvdmUgaXQuICovXG4gIHN1cmZhY2VZOiBudW1iZXI7XG4gIC8qKiBUaGUgaGlnaGVzdCBzb2xpZCB2b3hlbCwgb3IgWV9NSU4gLSAxIGlmIHRoZSBjb2x1bW4gaGFzIG5vIHNvbGlkLiAqL1xuICB0b3BTb2xpZFk6IG51bWJlcjtcbiAgdG9wTWF0ZXJpYWw6IE1hdElkO1xuICBzb2xpZDogYm9vbGVhbjtcbiAgLyoqIFdhdGVyIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlLCB1cCB0byBzZWEgbGV2ZWwuIDAgb24gZHJ5IGxhbmQuICovXG4gIHdhdGVyRGVwdGg6IG51bWJlcjtcbiAgdW5kZXJ3YXRlcjogYm9vbGVhbjtcbiAgLyoqIExhcmdlc3QgNC1uZWlnaGJvdXIgc3VyZmFjZSBzdGVwIGluIG1ldHJlcyAoMSA9IGEgc2luZ2xlIHZveGVsIHJpc2VyKS4gKi9cbiAgc2xvcGU6IG51bWJlcjtcbiAgLyoqIEZyZWUgYWlyIGNlbGxzIGFib3ZlIHRoZSBzdXJmYWNlLCBjYXBwZWQgYXQgQ0xFQVJBTkNFX1BST0JFLiAqL1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IENMRUFSQU5DRV9QUk9CRSA9IDg7XG5cbmZ1bmN0aW9uIHN1cmZhY2VBdFNhZmUod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgZmFsbGJhY2s6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxsYmFjaztcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKiBXYXRlciBkZXB0aCB0aGF0IHJlc3BlY3RzIGEgZHJ5IHBpdCBiZWxvdyBzZWEgbGV2ZWwgKHVubGlrZSBoZWlnaHQgYWxvbmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmIChzdXJmYWNlID49IFNFQV9MRVZFTCkgcmV0dXJuIDA7XG4gIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgU0VBX0xFVkVMIC0gMSwgeikgIT09IE1BVC5XQVRFUikgcmV0dXJuIDA7XG4gIHJldHVybiBTRUFfTEVWRUwgLSBzdXJmYWNlO1xufVxuXG4vKiogVHJ1ZSB3aGVuIGBoZWlnaHRgIGFpciBjZWxscyBhYm92ZSB0aGUgc3VyZmFjZSBhcmUgZnJlZSBvZiBzb2xpZCBvciB3YXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGVhcmFuY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBoZWlnaHQ7IGkrKykge1xuICAgIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgc3VyZmFjZSArIGksIHopICE9PSBNQVQuQUlSKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2x1bW5BdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCBzdXJmYWNlWSA9IHN1cmZhY2VBdCh3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3QgdG9wTWF0ZXJpYWwgPSB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHNvbGlkID0gc3VyZmFjZVkgPiBZX01JTiAmJiBpc1NvbGlkKHRvcE1hdGVyaWFsKTtcbiAgY29uc3Qgd2F0ZXJEZXB0aCA9IHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4IC0gMSwgY3osIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCArIDEsIGN6LCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3gsIGN6IC0gMSwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4LCBjeiArIDEsIHN1cmZhY2VZKSksXG4gICk7XG4gIGxldCBjbGVhcmFuY2UgPSAwO1xuICB3aGlsZSAoY2xlYXJhbmNlIDwgQ0xFQVJBTkNFX1BST0JFICYmIGdldFZveGVsKHdvcmxkLCBjeCwgc3VyZmFjZVkgKyBjbGVhcmFuY2UsIGN6KSA9PT0gTUFULkFJUikge1xuICAgIGNsZWFyYW5jZSsrO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDogY3gsIHo6IGN6LCBzdXJmYWNlWSwgdG9wU29saWRZOiBzdXJmYWNlWSAtIDEsIHRvcE1hdGVyaWFsLFxuICAgIHNvbGlkLCB3YXRlckRlcHRoLCB1bmRlcndhdGVyOiB3YXRlckRlcHRoID4gMCwgc2xvcGUsIGNsZWFyYW5jZSxcbiAgfTtcbn1cblxuLy8gRW50aXR5IGZvb3RwcmludHMgYXJlIGRlbGliZXJhdGVseSBleHBsaWNpdC4gQSB0cmVlIG9jY3VwaWVzIG1vcmUgc2l0ZSB0aGFuXG4vLyBpdHMgdHJ1bms7IGEgcGViYmxlIG9jY3VwaWVzIGxlc3MgdGhhbiBhIGJvdWxkZXIuIFRoZXNlIGFyZSBzaW11bGF0aW9uXG4vLyBjbGVhcmFuY2UgcmFkaWksIG5vdCByZW5kZXIgYm91bmRzLlxuZXhwb3J0IGNvbnN0IE9CU1RSVUNUSU9OX1JBRElVUzogUmVjb3JkPEFjdGl2ZUVudGl0eUtpbmQsIG51bWJlcj4gPSB7XG4gIHN0eWxfdHJlZV9zcGlyZTogMS41LFxuICBzdHlsX3RyZWVfdGFibGU6IDEuOCxcbiAgc3R5bF90cmVlX2NsdXN0ZXI6IDEuOSxcbiAgc3R5bF90cmVlX2Jsb3Nzb206IDEuNixcbiAgc3R5bF9zaHJ1YjogMC42LFxuICBzdHlsX29yZTogMC45LFxuICBzdHlsX2NhaXJuOiAwLjgsXG4gIHdheXN0b25lOiAxLjQsXG4gIG1hcmtlcjogMC41LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBPYnN0cnVjdGlvbiB7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByYWRpdXM6IG51bWJlcjtcbiAgLyoqIEZvb3RwcmludCBjZWxscyBvdmVybGFwcGVkIGJ5IHRoaXMgZW50aXR5LiAqL1xuICBjZWxsczogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlDaHVua3NGb3JSZWN0KHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCk6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIC8vIEEgcmVjdCBvd25zIHdob2xlIHZveGVsIGNlbGxzLiBJbmNsdWRlIGV2ZXJ5IGNodW5rIHdob3NlIHJvb3QgY291bGQgb3ZlcmxhcFxuICAvLyB0aG9zZSBjZWxscywgd2l0aG91dCBzY2FubmluZyB0aGUgZW50aXJlIDIwNDggbSB3b3JsZC5cbiAgY29uc3QgcmFkaXVzID0gTWF0aC5tYXgoLi4uT2JqZWN0LnZhbHVlcyhPQlNUUlVDVElPTl9SQURJVVMpLCAxLjUpO1xuICBjb25zdCBtaW5DZWxsWCA9IE1hdGguZmxvb3Ioci54MCArIDAuNSAtIHJhZGl1cyk7XG4gIGNvbnN0IG1heENlbGxYID0gTWF0aC5jZWlsKHIueDEgKyAwLjUgKyByYWRpdXMpIC0gMTtcbiAgY29uc3QgbWluQ2VsbFogPSBNYXRoLmZsb29yKHIuejAgKyAwLjUgLSByYWRpdXMpO1xuICBjb25zdCBtYXhDZWxsWiA9IE1hdGguY2VpbChyLnoxICsgMC41ICsgcmFkaXVzKSAtIDE7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1gobWluQ2VsbFgpKSwgY3gxID0gd29ybGRUb0NodW5rWChtYXhDZWxsWCk7XG4gIGNvbnN0IGN6MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1oobWluQ2VsbFopKSwgY3oxID0gd29ybGRUb0NodW5rWihtYXhDZWxsWik7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSBrZXlzLnB1c2goY2h1bmtLZXkoY3gsIGN6KSk7XG4gIH1cbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKiBFbnRpdGllcyB3aG9zZSBzaW11bGF0aW9uIGZvb3RwcmludCBvdmVybGFwcyB0aGUgcmVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvYnN0cnVjdGlvbnNJbih3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgb3V0OiBPYnN0cnVjdGlvbltdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGVudGl0eUNodW5rc0ZvclJlY3Qod29ybGQsIHIpKSB7XG4gICAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghaWRzKSBjb250aW51ZTtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgICAgaWYgKHNlZW4uaGFzKGlkKSkgY29udGludWU7XG4gICAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIGNvbnRpbnVlO1xuICAgICAgc2Vlbi5hZGQoaWQpO1xuICAgICAgY29uc3QgcmFkaXVzID0gaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZClcbiAgICAgICAgPyBlLmtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gMC42IDogZS5raW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyAxLjEgOiAxLjVcbiAgICAgICAgOiBPQlNUUlVDVElPTl9SQURJVVNbZS5raW5kIGFzIEFjdGl2ZUVudGl0eUtpbmRdO1xuICAgICAgbGV0IGNlbGxzID0gMDtcbiAgICAgIGNvbnN0IGV4MCA9IE1hdGgubWF4KHIueDAsIE1hdGguZmxvb3IoZS54IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBleDEgPSBNYXRoLm1pbihyLngxLCBNYXRoLmNlaWwoZS54ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejAgPSBNYXRoLm1heChyLnowLCBNYXRoLmZsb29yKGUueiAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXoxID0gTWF0aC5taW4oci56MSwgTWF0aC5jZWlsKGUueiArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgZm9yIChsZXQgeiA9IGV6MDsgeiA8PSBlejE7IHorKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gZXgwOyB4IDw9IGV4MTsgeCsrKSB7XG4gICAgICAgICAgaWYgKE1hdGguaHlwb3QoZS54IC0gKHggKyAwLjUpLCBlLnogLSAoeiArIDAuNSkpIDw9IHJhZGl1cykgY2VsbHMrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGNlbGxzID4gMCkge1xuICAgICAgICBvdXQucHVzaCh7IGVudGl0eUlkOiBlLmlkLCBraW5kOiBlLmtpbmQsIHg6IGUueCwgejogZS56LCByYWRpdXMsIGNlbGxzIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBvdXQuc29ydCgoYSwgYikgPT4gKGEuZW50aXR5SWQgPCBiLmVudGl0eUlkID8gLTEgOiBhLmVudGl0eUlkID4gYi5lbnRpdHlJZCA/IDEgOiAwKSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXJlYVN0YXRzIHtcbiAgcmVjdDogUmVjdDtcbiAgY29sdW1uczogbnVtYmVyO1xuICBtaW5ZOiBudW1iZXI7XG4gIG1heFk6IG51bWJlcjtcbiAgbWVhblk6IG51bWJlcjtcbiAgcmVsaWVmOiBudW1iZXI7XG4gIG1heFN0ZXA6IG51bWJlcjtcbiAgd2F0ZXJDb2x1bW5zOiBudW1iZXI7XG4gIHN0b25lQ29sdW1uczogbnVtYmVyO1xuICBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj47XG4gIG9ic3RydWN0aW9uczogT2JzdHJ1Y3Rpb25bXTtcbiAgb2JzdHJ1Y3RlZENvbHVtbnM6IG51bWJlcjtcbiAgLyoqIEN1dC9maWxsIHJlbGF0aXZlIHRvIGZsb29yWSB3aGVuIHN1cHBsaWVkLCBvdGhlcndpc2UgMC4gKi9cbiAgZmxvb3JZOiBudW1iZXIgfCBudWxsO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cHBvcnRTdW1tYXJ5IHtcbiAgdG90YWw6IG51bWJlcjtcbiAgbGV2ZWw6IG51bWJlcjtcbiAgY3V0OiBudW1iZXI7XG4gIGZpbGw6IG51bWJlcjtcbiAgd2F0ZXI6IG51bWJlcjtcbiAgLyoqIEZpbGwgZGVlcGVyIHRoYW4gOCBtOyBhIHZhbGlkYXRvciBtYXkgcmVqZWN0IHRoZXNlIGFzIHVuc3VwcG9ydGVkLiAqL1xuICBkZWVwRmlsbDogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZvb3RwcmludFF1ZXJ5IHtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHN0YXRzOiBBcmVhU3RhdHM7XG4gIHN1cHBvcnQ6IFN1cHBvcnRTdW1tYXJ5O1xuICBvYnN0cnVjdGlvbnM6IE9ic3RydWN0aW9uW107XG4gIC8qKiBDZWxscyBpbiB0aGUgYnVpbGRpbmcgdm9sdW1lIGFib3ZlIHRoZSBwcmVwYXJlZCBmbG9vciB0aGF0IGFyZSBub3QgYWlyLiAqL1xuICBvdmVyaGFuZ0NlbGxzOiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IG1hdGVyaWFsOiBNYXRJZCB9Pjtcbn1cblxuLyoqXG4gKiBDYWNoZWQgcXVlcnkgY29udGV4dC4gQ2FjaGVzIGFyZSBrZXllZCBvbiB3b3JsZC5yZXZpc2lvbjogYSB2b3hlbCBvciBlbnRpdHlcbiAqIGVkaXQgaW52YWxpZGF0ZXMgdGhlbSwgd2hpbGUgbWVzaC9uYXYgcmVidWlsZHMgZG8gbm90LiBVc2Ugb25lIGNvbnRleHQgZm9yIGFcbiAqIHNpdGUgc2VhcmNoIG9yIGEgZm9vdHByaW50IGV2YWx1YXRpb24sIHRoZW4gZGlzY2FyZCBpdC5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlcnJhaW5RdWVyeSB7XG4gIHByaXZhdGUgY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgVGVycmFpbkNvbHVtbj4oKTtcbiAgcHJpdmF0ZSBvYnN0cnVjdGlvbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIE9ic3RydWN0aW9uW10+KCk7XG4gIHByaXZhdGUgcmV2aXNpb246IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgd29ybGQ6IFdvcmxkKSB7XG4gICAgdGhpcy5yZXZpc2lvbiA9IHdvcmxkLnJldmlzaW9uO1xuICB9XG5cbiAgcHJpdmF0ZSBzeW5jKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnJldmlzaW9uICE9PSB0aGlzLndvcmxkLnJldmlzaW9uKSB7XG4gICAgICB0aGlzLmNhY2hlLmNsZWFyKCk7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuY2xlYXIoKTtcbiAgICAgIHRoaXMucmV2aXNpb24gPSB0aGlzLndvcmxkLnJldmlzaW9uO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBDYWNoZWQgZW50aXR5IG9ic3RydWN0aW9ucyBmb3Igb25lIGZvb3RwcmludC4gKi9cbiAgb2JzdHJ1Y3Rpb25zRm9yKHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBrZXkgPSBgJHtyLngwfSwke3IuejB9LCR7ci54MX0sJHtyLnoxfWA7XG4gICAgbGV0IGxpc3QgPSB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuZ2V0KGtleSk7XG4gICAgaWYgKCFsaXN0KSB7XG4gICAgICBsaXN0ID0gb2JzdHJ1Y3Rpb25zSW4odGhpcy53b3JsZCwgcik7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuc2V0KGtleSwgbGlzdCk7XG4gICAgfVxuICAgIHJldHVybiBsaXN0O1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgY3ggPSBNYXRoLmZsb29yKHgpLCBjeiA9IE1hdGguZmxvb3Ioeik7XG4gICAgY29uc3Qga2V5ID0gYCR7Y3h9LCR7Y3p9YDtcbiAgICBsZXQgY29sID0gdGhpcy5jYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAoIWNvbCkge1xuICAgICAgY29sID0gY29sdW1uQXQodGhpcy53b3JsZCwgY3gsIGN6KTtcbiAgICAgIHRoaXMuY2FjaGUuc2V0KGtleSwgY29sKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbDtcbiAgfVxuXG4gIGFyZWEocmVjdDogUmVjdCwgZmxvb3JZPzogbnVtYmVyKTogQXJlYVN0YXRzIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBsZXQgbWluWSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgICBsZXQgbWF4WSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgICBsZXQgc3VtID0gMDtcbiAgICBsZXQgbWF4U3RlcCA9IDA7XG4gICAgbGV0IHdhdGVyQ29sdW1ucyA9IDA7XG4gICAgbGV0IHN0b25lQ29sdW1ucyA9IDA7XG4gICAgbGV0IGN1dFZvbHVtZSA9IDA7XG4gICAgbGV0IGZpbGxWb2x1bWUgPSAwO1xuICAgIGxldCBtYXhDdXQgPSAwO1xuICAgIGxldCBtYXhGaWxsID0gMDtcbiAgICBjb25zdCBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj4gPSB7fTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgbWF4WSA9IE1hdGgubWF4KG1heFksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIHN1bSArPSBjb2wuc3VyZmFjZVk7XG4gICAgICAgIG1heFN0ZXAgPSBNYXRoLm1heChtYXhTdGVwLCBjb2wuc2xvcGUpO1xuICAgICAgICBpZiAoY29sLndhdGVyRGVwdGggPiAwKSB3YXRlckNvbHVtbnMrKztcbiAgICAgICAgaWYgKGNvbC50b3BNYXRlcmlhbCA9PT0gTUFULlNUT05FKSBzdG9uZUNvbHVtbnMrKztcbiAgICAgICAgbWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPSAobWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPz8gMCkgKyAxO1xuICAgICAgICBpZiAoZmxvb3JZICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgICBpZiAoZHkgPiAwKSB7XG4gICAgICAgICAgICBjdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgICBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGR5KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgICAgZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgICBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgLWR5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBvYnN0cnVjdGlvbnMgPSB0aGlzLm9ic3RydWN0aW9uc0ZvcihyKTtcbiAgICBjb25zdCBvYnN0cnVjdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBvIG9mIG9ic3RydWN0aW9ucykge1xuICAgICAgY29uc3QgcmFkaXVzID0gby5yYWRpdXM7XG4gICAgICBjb25zdCBleDAgPSBNYXRoLm1heChyLngwLCBNYXRoLmZsb29yKG8ueCAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXgxID0gTWF0aC5taW4oci54MSwgTWF0aC5jZWlsKG8ueCArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXowID0gTWF0aC5tYXgoci56MCwgTWF0aC5mbG9vcihvLnogLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MSA9IE1hdGgubWluKHIuejEsIE1hdGguY2VpbChvLnogKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGZvciAobGV0IHogPSBlejA7IHogPD0gZXoxOyB6KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IGV4MDsgeCA8PSBleDE7IHgrKykge1xuICAgICAgICAgIGlmIChNYXRoLmh5cG90KG8ueCAtICh4ICsgMC41KSwgby56IC0gKHogKyAwLjUpKSA8PSByYWRpdXMpIG9ic3RydWN0ZWQuYWRkKGAke3h9LCR7en1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNvbHVtbnMgPSAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xuICAgIHJldHVybiB7XG4gICAgICByZWN0OiByLFxuICAgICAgY29sdW1ucyxcbiAgICAgIG1pblksIG1heFksXG4gICAgICBtZWFuWTogTWF0aC5yb3VuZCgoc3VtIC8gY29sdW1ucykgKiAxMDAwKSAvIDEwMDAsXG4gICAgICByZWxpZWY6IG1heFkgLSBtaW5ZLFxuICAgICAgbWF4U3RlcCxcbiAgICAgIHdhdGVyQ29sdW1ucyxcbiAgICAgIHN0b25lQ29sdW1ucyxcbiAgICAgIG1hdGVyaWFscyxcbiAgICAgIG9ic3RydWN0aW9ucyxcbiAgICAgIG9ic3RydWN0ZWRDb2x1bW5zOiBvYnN0cnVjdGVkLnNpemUsXG4gICAgICBmbG9vclk6IGZsb29yWSA/PyBudWxsLFxuICAgICAgY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dCxcbiAgICAgIG1heEZpbGwsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFdmFsdWF0ZSBhIGNvbXBsZXRlIGJ1aWxkaW5nIGZvb3RwcmludC4gYGZsb29yWWAgaXMgdGhlIHByZXBhcmVkIHdhbGtpbmdcbiAgICogZmxvb3I6IHRlcnJhaW4gYWJvdmUgaXQgaXMgY3V0LCB0ZXJyYWluIGJlbG93IGl0IGlzIGZpbGxlZC4gVGhlIHJlc3VsdCBpc1xuICAgKiByYXcgc2l0ZSBkYXRhOyBjb25zdHJ1Y3Rpb24gcnVsZXMgbGl2ZSBpbiBjb25zdHJ1Y3Rpb24udHMuXG4gICAqL1xuICBmb290cHJpbnQocmVjdDogUmVjdCwgZmxvb3JZOiBudW1iZXIpOiBGb290cHJpbnRRdWVyeSB7XG4gICAgY29uc3Qgc3RhdHMgPSB0aGlzLmFyZWEocmVjdCwgZmxvb3JZKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBzdXBwb3J0OiBTdXBwb3J0U3VtbWFyeSA9IHtcbiAgICAgIHRvdGFsOiBzdGF0cy5jb2x1bW5zLCBsZXZlbDogMCwgY3V0OiAwLCBmaWxsOiAwLCB3YXRlcjogMCwgZGVlcEZpbGw6IDAsXG4gICAgICBtYXhDdXQ6IDAsIG1heEZpbGw6IDAsIGN1dFZvbHVtZTogMCwgZmlsbFZvbHVtZTogMCxcbiAgICB9O1xuICAgIGNvbnN0IG92ZXJoYW5nQ2VsbHM6IEZvb3RwcmludFF1ZXJ5WydvdmVyaGFuZ0NlbGxzJ10gPSBbXTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgaWYgKGR5ID4gMCkge1xuICAgICAgICAgIHN1cHBvcnQuY3V0Kys7XG4gICAgICAgICAgc3VwcG9ydC5jdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhDdXQgPSBNYXRoLm1heChzdXBwb3J0Lm1heEN1dCwgZHkpO1xuICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgIHN1cHBvcnQuZmlsbCsrO1xuICAgICAgICAgIHN1cHBvcnQuZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhGaWxsID0gTWF0aC5tYXgoc3VwcG9ydC5tYXhGaWxsLCAtZHkpO1xuICAgICAgICAgIGlmICgtZHkgPiA4KSBzdXBwb3J0LmRlZXBGaWxsKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VwcG9ydC5sZXZlbCsrO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb2wud2F0ZXJEZXB0aCA+IDApIHN1cHBvcnQud2F0ZXIrKztcblxuICAgICAgICAvLyBBbiBvdmVyaGFuZyBpcyB0ZXJyYWluIGFib3ZlIHRoZSBmbG9vciB0aGF0IHN1cnZpdmVzIHRoZSBjdXQgcGxhbmUuXG4gICAgICAgIC8vIEZvciBhIGNvbHVtbiBiZWxvdyB0aGUgZmxvb3IsIGl0cyBzb2xpZCBib2R5IGlzIGZpbGwsIG5vdCBvdmVyaGFuZy5cbiAgICAgICAgY29uc3Qgc3RhcnQgPSBNYXRoLm1heChmbG9vclksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8IHN0YXJ0ICsgNDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgbSA9IGdldFZveGVsKHRoaXMud29ybGQsIHgsIHksIHopIGFzIE1hdElkO1xuICAgICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSBvdmVyaGFuZ0NlbGxzLnB1c2goeyB4LCB5LCB6LCBtYXRlcmlhbDogbSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IHJlY3Q6IHIsIGZsb29yWSwgc3RhdHMsIHN1cHBvcnQsIG9ic3RydWN0aW9uczogc3RhdHMub2JzdHJ1Y3Rpb25zLCBvdmVyaGFuZ0NlbGxzIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBtb3ZlbWVudCBjb250cmFjdCAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdhbGtQYXJhbXMge1xuICBtYXhTdGVwVXA6IG51bWJlcjtcbiAgbWF4U3RlcERvd246IG51bWJlcjtcbiAgbWF4V2F0ZXJEZXB0aDogbnVtYmVyO1xuICAvKiogTWF4aW11bSBhZGphY2VudCBzdXJmYWNlIHN0ZXA7IDEuMCBpcyBhIDQ1IGRlZ3JlZSB2b3hlbCByaXNlci4gKi9cbiAgbWF4U2xvcGU6IG51bWJlcjtcbiAgY2xlYXJhbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1dBTEs6IFdhbGtQYXJhbXMgPSB7XG4gIG1heFN0ZXBVcDogMS4wLFxuICBtYXhTdGVwRG93bjogMS41LFxuICBtYXhXYXRlckRlcHRoOiAwLjQsXG4gIG1heFNsb3BlOiAxLjAsXG4gIGNsZWFyYW5jZTogMi4wLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBXYWxrUmVzdWx0IHtcbiAgb2s6IGJvb2xlYW47XG4gIHJlYXNvbjogJ29rJyB8ICdub3RfYWRqYWNlbnQnIHwgJ3N0ZXBfdXAnIHwgJ2ZhbGwnIHwgJ3dhdGVyJyB8ICdzbG9wZScgfCAnY2xlYXJhbmNlJztcbiAgc3RlcDogbnVtYmVyO1xuICB3YXRlckRlcHRoOiBudW1iZXI7XG59XG5cbi8qKiBFdmFsdWF0ZSBvbmUgZ3JpZCBzdGVwLiBQYXRocyBhcmUgdmFsaWRhdGVkIHdpdGggdGhlIHNhbWUgY29udHJhY3QuICovXG5leHBvcnQgZnVuY3Rpb24gd2Fsa1N0ZXAoXG4gIHdvcmxkOiBXb3JsZCwgZnJvbVg6IG51bWJlciwgZnJvbVo6IG51bWJlciwgdG9YOiBudW1iZXIsIHRvWjogbnVtYmVyLFxuICBwYXJhbXM6IFdhbGtQYXJhbXMgPSBERUZBVUxUX1dBTEssXG4pOiBXYWxrUmVzdWx0IHtcbiAgY29uc3QgZHggPSBNYXRoLmFicyhNYXRoLmZsb29yKHRvWCkgLSBNYXRoLmZsb29yKGZyb21YKSk7XG4gIGNvbnN0IGR6ID0gTWF0aC5hYnMoTWF0aC5mbG9vcih0b1opIC0gTWF0aC5mbG9vcihmcm9tWikpO1xuICBpZiAoZHggKyBkeiAhPT0gMSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnbm90X2FkamFjZW50Jywgc3RlcDogMCwgd2F0ZXJEZXB0aDogMCB9O1xuICB9XG4gIGNvbnN0IGZyb20gPSBjb2x1bW5BdCh3b3JsZCwgZnJvbVgsIGZyb21aKTtcbiAgY29uc3QgdG8gPSBjb2x1bW5BdCh3b3JsZCwgdG9YLCB0b1opO1xuICBjb25zdCBzdGVwID0gdG8uc3VyZmFjZVkgLSBmcm9tLnN1cmZhY2VZO1xuICBpZiAoc3RlcCA+IHBhcmFtcy5tYXhTdGVwVXApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RlcF91cCcsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKC1zdGVwID4gcGFyYW1zLm1heFN0ZXBEb3duKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2ZhbGwnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by53YXRlckRlcHRoID4gcGFyYW1zLm1heFdhdGVyRGVwdGgpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnd2F0ZXInLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by5zbG9wZSA+IHBhcmFtcy5tYXhTbG9wZSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzbG9wZScsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKCFjbGVhcmFuY2VBdCh3b3JsZCwgdG9YLCB0b1osIHBhcmFtcy5jbGVhcmFuY2UpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdjbGVhcmFuY2UnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIHJlYXNvbjogJ29rJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xufVxuXG4vKiogRWZmZWN0aXZlIGdyYWRlIG9mIGEgc3RyYWlnaHQgcGF0aCBzZWdtZW50LCB1c2VkIGJ5IHBhdGggdmFsaWRhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZmZlY3RpdmVHcmFkZSh3b3JsZDogV29ybGQsIHgwOiBudW1iZXIsIHowOiBudW1iZXIsIHgxOiBudW1iZXIsIHoxOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBhID0gY29sdW1uQXQod29ybGQsIHgwLCB6MCk7XG4gIGNvbnN0IGIgPSBjb2x1bW5BdCh3b3JsZCwgeDEsIHoxKTtcbiAgY29uc3QgcnVuID0gTWF0aC5oeXBvdCh4MSAtIHgwLCB6MSAtIHowKTtcbiAgaWYgKHJ1biA9PT0gMCkgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKTtcbiAgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKSAvIHJ1bjtcbn1cbiIsICIvLyBDaGFyYWN0ZXIgbW92ZW1lbnQgcnVsZXMgXHUyMDE0IHB1cmUgVHlwZVNjcmlwdCwgbm8gdGhyZWUuanMgKEQtMDA1KS5cbi8vXG4vLyBBIGNoYXJhY3RlciBpcyBhIHZlcnRpY2FsIGJveCAocmFkaXVzIDAuMyBtLCBoZWlnaHQgMS43IG0pIG1vdmluZyB0aHJvdWdoXG4vLyB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbCB2b2x1bWUsIG5hdHVyYWwgZW50aXRpZXMgYW5kIHN0cnVjdHVyZSBtb2R1bGVzLlxuLy8gU3RlcHBpbmcgaXMgYSBkZXRlcm1pbmlzdGljIGZpeGVkLXN0ZXAgZnVuY3Rpb24gb2YgKHN0YXRlLCBpbnB1dCwgd29ybGQpOlxuLy8gcHJlc2VudGF0aW9uIChtZXNoZXMsIGFuaW1hdGlvbiwgY2FtZXJhKSBvbmx5ICpyZWFkcyogdGhlIHJlc3VsdGluZyBzdGF0ZS5cbi8vXG4vLyBNb3ZlbWVudCBuZXZlciBnZW5lcmF0ZXMgdGVycmFpbi4gRXZlcnkgcXVlcnkgZ29lcyB0aHJvdWdoIHRoZSByZXNpZGVudC1vbmx5XG4vLyB2b3hlbCBhY2Nlc3NvcnM7IGFuIHVubG9hZGVkIGNvbHVtbiBpcyB0cmVhdGVkIGFzIGEgd2FsbCwgc28gYSBjaGFyYWN0ZXJcbi8vIGNhbm5vdCBvdXRydW4gc3RyZWFtaW5nIG9yIGNhdXNlIHVuYm91bmRlZCBjaHVuayBnZW5lcmF0aW9uLlxuLy9cbi8vIE1vdmVtZW50IGlzIGxvY2FsIHByZXNlbnRhdGlvbi10aWVyIHN0YXRlIGZvciBub3cgKHRoZSBsb2NhbCBmb3VuZGVyKS4gV2hlblxuLy8gcG9zaXRpb25zIHN0YXJ0IHRvIGdhdGUgZ2FtZXBsYXkgKHJlYWNoIGNoZWNrcywgTlBDIHdvcmssIG11bHRpcGxheWVyKSwgdGhlXG4vLyBzYW1lIHN0ZXAgZnVuY3Rpb24gYmVjb21lcyB0aGUgYXV0aG9yaXRhdGl2ZSBydWxlLCBkcml2ZW4gYnkgam91cm5hbGVkIGlucHV0LlxuaW1wb3J0IHtcbiAgV29ybGQsIE1BVCwgaXNTb2xpZCwgcmVzaWRlbnRWb3hlbEF0LCBjaHVua0tleSwgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWixcbiAgaXNSZXRpcmVkU3RvbmVLaW5kLCBZX01JTixcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgdHlwZSB7IEFjdGl2ZUVudGl0eUtpbmQgfSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IE9CU1RSVUNUSU9OX1JBRElVUyB9IGZyb20gJy4vdGVycmFpbic7XG5cbmV4cG9ydCBjb25zdCBDSEFSQUNURVJfUkFESVVTID0gMC4zO1xuZXhwb3J0IGNvbnN0IENIQVJBQ1RFUl9IRUlHSFQgPSAxLjc7XG5leHBvcnQgY29uc3QgRklYRURfU1RFUCA9IDEgLyAzMDtcbmV4cG9ydCBjb25zdCBXQUxLX1NQRUVEID0gNC4yO1xuZXhwb3J0IGNvbnN0IFJVTl9TUEVFRCA9IDcuNTtcbmV4cG9ydCBjb25zdCBXQURFX1NQRUVEID0gMi40O1xuZXhwb3J0IGNvbnN0IFNXSU1fU1BFRUQgPSAyLjA7XG5leHBvcnQgY29uc3QgSlVNUF9TUEVFRCA9IDYuNjtcbmV4cG9ydCBjb25zdCBHUkFWSVRZID0gMjI7XG4vKiogSGlnaGVzdCBsZWRnZSBjbGltYmVkIHdpdGhvdXQganVtcGluZyAob25lIHZveGVsIHBsdXMgdG9sZXJhbmNlKS4gKi9cbmV4cG9ydCBjb25zdCBTVEVQX0hFSUdIVCA9IDEuMDU7XG4vKiogV2F0ZXIgZGVlcGVyIHRoYW4gdGhpcyBhdCB0aGUgZmVldCBtYWtlcyB0aGUgY2hhcmFjdGVyIHN3aW0uICovXG5leHBvcnQgY29uc3QgU1dJTV9ERVBUSCA9IDEuMjU7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2hhcmFjdGVyU3RhdGUge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICB2ejogbnVtYmVyO1xuICAvKiogRmFjaW5nIGFuZ2xlIChyYWRpYW5zLCAwID0gK3opLCB0dXJucyB0b3dhcmQgbW90aW9uLiAqL1xuICBoZWFkaW5nOiBudW1iZXI7XG4gIGdyb3VuZGVkOiBib29sZWFuO1xuICAvKiogJ2dyb3VuZCcgfCAnd2FkZScgfCAnc3dpbScgfCAnYWlyJyBcdTIwMTQgdGhlIGxvY29tb3Rpb24gcmVnaW1lIHRoaXMgc3RlcC4gKi9cbiAgbW9kZTogJ2dyb3VuZCcgfCAnd2FkZScgfCAnc3dpbScgfCAnYWlyJztcbiAgLyoqIEhvcml6b250YWwgc3BlZWQgYWN0dWFsbHkgYWNoaWV2ZWQgdGhpcyBzdGVwIChtL3MpLCBmb3IgYW5pbWF0aW9uLiAqL1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENoYXJhY3RlcklucHV0IHtcbiAgLyoqIFdvcmxkLXNwYWNlIGRlc2lyZWQgZGlyZWN0aW9uIChuZWVkIG5vdCBiZSBub3JtYWxpc2VkOyBsZW5ndGggPD0gMSBzY2FsZXMgc3BlZWQpLiAqL1xuICBtb3ZlWDogbnVtYmVyO1xuICBtb3ZlWjogbnVtYmVyO1xuICBydW46IGJvb2xlYW47XG4gIGp1bXA6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDaGFyYWN0ZXIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgaGVhZGluZyA9IDApOiBDaGFyYWN0ZXJTdGF0ZSB7XG4gIHJldHVybiB7IHgsIHksIHosIHZ4OiAwLCB2eTogMCwgdno6IDAsIGhlYWRpbmcsIGdyb3VuZGVkOiBmYWxzZSwgbW9kZTogJ2FpcicsIHNwZWVkOiAwIH07XG59XG5cbi8qKiBTb2xpZCBmb3IgbW92ZW1lbnQ6IHZveGVscywgbWlzc2luZyAodW5sb2FkZWQpIHRlcnJhaW4sIG9yIHRoZSB3b3JsZCBmbG9vci4gKi9cbmZ1bmN0aW9uIGJsb2NrZWQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiB0cnVlO1xuICBjb25zdCBtID0gcmVzaWRlbnRWb3hlbEF0KHdvcmxkLCB4LCB5LCB6KTtcbiAgcmV0dXJuIG0gPT09IG51bGwgfHwgaXNTb2xpZChtKTtcbn1cblxuZnVuY3Rpb24gd2F0ZXIod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiByZXNpZGVudFZveGVsQXQod29ybGQsIHgsIHksIHopID09PSBNQVQuV0FURVI7XG59XG5cbi8qKiBUcnVlIHdoZW4gdGhlIGNoYXJhY3RlcidzIGJveCBhdCAoeCwgeSwgeikgb3ZlcmxhcHMgc29saWQgdm94ZWxzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG92ZXJsYXBzVGVycmFpbih3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgciA9IENIQVJBQ1RFUl9SQURJVVMgLSAxZS00O1xuICBjb25zdCB4MCA9IE1hdGguZmxvb3IoeCAtIHIpLCB4MSA9IE1hdGguZmxvb3IoeCArIHIpO1xuICBjb25zdCB6MCA9IE1hdGguZmxvb3IoeiAtIHIpLCB6MSA9IE1hdGguZmxvb3IoeiArIHIpO1xuICBjb25zdCB5MCA9IE1hdGguZmxvb3IoeSArIDFlLTMpLCB5MSA9IE1hdGguZmxvb3IoeSArIENIQVJBQ1RFUl9IRUlHSFQgLSAxZS0zKTtcbiAgZm9yIChsZXQgY3kgPSB5MDsgY3kgPD0geTE7IGN5KyspIHtcbiAgICBmb3IgKGxldCBjeiA9IHowOyBjeiA8PSB6MTsgY3orKykge1xuICAgICAgZm9yIChsZXQgY3ggPSB4MDsgY3ggPD0geDE7IGN4KyspIHtcbiAgICAgICAgaWYgKGJsb2NrZWQod29ybGQsIGN4LCBjeSwgY3opKSByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKiogU3RydWN0dXJlIG1vZHVsZXMgYXJlIGJveGVzICh4L3ogY2VudHJlLCB5IGJvdHRvbSk7IG9wdGlvbmFsIHlhdyByb3RhdGlvbi4gKi9cbmZ1bmN0aW9uIG92ZXJsYXBzU3RydWN0dXJlcyh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCBzIG9mIHdvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCkpIHtcbiAgICBmb3IgKGNvbnN0IG0gb2Ygcy5tb2R1bGVzKSB7XG4gICAgICBpZiAobS5raW5kID09PSAnY3JvcF9yb3cnKSBjb250aW51ZTtcbiAgICAgIGxldCBweCA9IHggLSBtLngsIHB6ID0geiAtIG0uejtcbiAgICAgIGlmIChtLnJvdCkge1xuICAgICAgICBjb25zdCBjID0gTWF0aC5jb3MoLW0ucm90KSwgc24gPSBNYXRoLnNpbigtbS5yb3QpO1xuICAgICAgICBjb25zdCByeCA9IHB4ICogYyAtIHB6ICogc24sIHJ6ID0gcHggKiBzbiArIHB6ICogYztcbiAgICAgICAgcHggPSByeDsgcHogPSByejtcbiAgICAgIH1cbiAgICAgIGlmIChNYXRoLmFicyhweCkgPCBtLncgLyAyICsgQ0hBUkFDVEVSX1JBRElVUyAmJiBNYXRoLmFicyhweikgPCBtLmQgLyAyICsgQ0hBUkFDVEVSX1JBRElVU1xuICAgICAgICAmJiB5ICsgMC4wMiA8IG0ueSArIG0uaCAmJiB5ICsgQ0hBUkFDVEVSX0hFSUdIVCA+IG0ueSArIDAuMDIpIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKiBIaWdoZXN0IHN0cnVjdHVyZSB0b3AgdW5kZXIgdGhlIGNoYXJhY3RlcidzIGZvb3RwcmludCBhdCBvciBiZWxvdyBgeSArIFNURVBfSEVJR0hUYC4gKi9cbmZ1bmN0aW9uIHN0cnVjdHVyZUZsb29yKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBmbG9vciA9IC1JbmZpbml0eTtcbiAgZm9yIChjb25zdCBzIG9mIHdvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCkpIHtcbiAgICBmb3IgKGNvbnN0IG0gb2Ygcy5tb2R1bGVzKSB7XG4gICAgICBpZiAobS5raW5kID09PSAnY3JvcF9yb3cnKSBjb250aW51ZTtcbiAgICAgIGxldCBweCA9IHggLSBtLngsIHB6ID0geiAtIG0uejtcbiAgICAgIGlmIChtLnJvdCkge1xuICAgICAgICBjb25zdCBjID0gTWF0aC5jb3MoLW0ucm90KSwgc24gPSBNYXRoLnNpbigtbS5yb3QpO1xuICAgICAgICBjb25zdCByeCA9IHB4ICogYyAtIHB6ICogc24sIHJ6ID0gcHggKiBzbiArIHB6ICogYztcbiAgICAgICAgcHggPSByeDsgcHogPSByejtcbiAgICAgIH1cbiAgICAgIGlmIChNYXRoLmFicyhweCkgPCBtLncgLyAyICsgQ0hBUkFDVEVSX1JBRElVUyAqIDAuNiAmJiBNYXRoLmFicyhweikgPCBtLmQgLyAyICsgQ0hBUkFDVEVSX1JBRElVUyAqIDAuNikge1xuICAgICAgICBjb25zdCB0b3AgPSBtLnkgKyBtLmg7XG4gICAgICAgIGlmICh0b3AgPD0geSArIDAuMDUgJiYgdG9wID4gZmxvb3IpIGZsb29yID0gdG9wO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gZmxvb3I7XG59XG5cbmZ1bmN0aW9uIG92ZXJsYXBzKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gb3ZlcmxhcHNUZXJyYWluKHdvcmxkLCB4LCB5LCB6KSB8fCBvdmVybGFwc1N0cnVjdHVyZXMod29ybGQsIHgsIHksIHopO1xufVxuXG4vKiogUHVzaCB0aGUgY2hhcmFjdGVyIG91dCBvZiB0cmVlIHRydW5rcywgb3JlIGFuZCBvdGhlciBuYXR1cmFsIG9ic3RydWN0aW9ucy4gKi9cbmZ1bmN0aW9uIHJlc29sdmVFbnRpdGllcyh3b3JsZDogV29ybGQsIHM6IENoYXJhY3RlclN0YXRlKTogdm9pZCB7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWChNYXRoLmZsb29yKHMueCkpLCBjeiA9IHdvcmxkVG9DaHVua1ooTWF0aC5mbG9vcihzLnopKTtcbiAgZm9yIChsZXQgZHogPSAtMTsgZHogPD0gMTsgZHorKykge1xuICAgIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIHtcbiAgICAgIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoY2h1bmtLZXkoY3ggKyBkeCwgY3ogKyBkeikpO1xuICAgICAgaWYgKCFpZHMpIGNvbnRpbnVlO1xuICAgICAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICAgICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICAgIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCBpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpKSBjb250aW51ZTtcbiAgICAgICAgLy8gQ29sbGlkZSB3aXRoIHRoZSB0cnVuayBvciBib2R5LCBub3QgdGhlIGNhbm9weSBmb290cHJpbnQgdXNlZCBmb3IgY2xlYXJhbmNlLlxuICAgICAgICBjb25zdCBib2R5ID0gZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZV8nKSA/IDAuNDUgKiBlLnNjYWxlXG4gICAgICAgICAgOiAoT0JTVFJVQ1RJT05fUkFESVVTW2Uua2luZCBhcyBBY3RpdmVFbnRpdHlLaW5kXSA/PyAwLjUpICogMC43NSAqIGUuc2NhbGU7XG4gICAgICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3NocnViJykgY29udGludWU7XG4gICAgICAgIGlmIChzLnkgPiBlLnkgKyAzIHx8IHMueSArIENIQVJBQ1RFUl9IRUlHSFQgPCBlLnkpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBveCA9IHMueCAtIGUueCwgb3ogPSBzLnogLSBlLno7XG4gICAgICAgIGNvbnN0IGQgPSBNYXRoLmh5cG90KG94LCBveik7XG4gICAgICAgIGNvbnN0IG1pbiA9IGJvZHkgKyBDSEFSQUNURVJfUkFESVVTO1xuICAgICAgICBpZiAoZCA+PSBtaW4gfHwgZCA8IDFlLTYpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBwdXNoID0gbWluIC0gZDtcbiAgICAgICAgY29uc3QgbnggPSBzLnggKyAob3ggLyBkKSAqIHB1c2gsIG56ID0gcy56ICsgKG96IC8gZCkgKiBwdXNoO1xuICAgICAgICBpZiAoIW92ZXJsYXBzKHdvcmxkLCBueCwgcy55LCBueikpIHsgcy54ID0gbng7IHMueiA9IG56OyB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbi8qKiBEZXB0aCBvZiB3YXRlciBzdGFuZGluZyBhdCB0aGUgY2hhcmFjdGVyJ3MgZmVldCBjb2x1bW4uICovXG5mdW5jdGlvbiBmZWV0V2F0ZXJEZXB0aCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBmeCA9IE1hdGguZmxvb3IoeCksIGZ6ID0gTWF0aC5mbG9vcih6KTtcbiAgbGV0IHRvcCA9IE1hdGguZmxvb3IoeSArIDAuMDUpO1xuICBpZiAoIXdhdGVyKHdvcmxkLCBmeCwgdG9wLCBmeikpIHJldHVybiAwO1xuICB3aGlsZSAod2F0ZXIod29ybGQsIGZ4LCB0b3AgKyAxLCBmeikgJiYgdG9wIDwgeSArIDQpIHRvcCsrO1xuICByZXR1cm4gdG9wICsgMSAtIHk7XG59XG5cbi8qKlxuICogQWR2YW5jZSBvbmUgZml4ZWQgc3RlcC4gRGV0ZXJtaW5pc3RpYzogdGhlIHNhbWUgd29ybGQsIHN0YXRlIGFuZCBpbnB1dCBnaXZlXG4gKiB0aGUgc2FtZSByZXN1bHQgb24gZXZlcnkgbWFjaGluZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0ZXBDaGFyYWN0ZXIod29ybGQ6IFdvcmxkLCBwcmV2OiBDaGFyYWN0ZXJTdGF0ZSwgaW5wdXQ6IENoYXJhY3RlcklucHV0LCBkdCA9IEZJWEVEX1NURVApOiBDaGFyYWN0ZXJTdGF0ZSB7XG4gIGNvbnN0IHM6IENoYXJhY3RlclN0YXRlID0geyAuLi5wcmV2IH07XG4gIGNvbnN0IGRlcHRoID0gZmVldFdhdGVyRGVwdGgod29ybGQsIHMueCwgcy55LCBzLnopO1xuICBjb25zdCBzd2ltbWluZyA9IGRlcHRoID49IFNXSU1fREVQVEg7XG4gIGNvbnN0IHdhZGluZyA9ICFzd2ltbWluZyAmJiBkZXB0aCA+IDAuMjtcblxuICBsZXQgbXggPSBpbnB1dC5tb3ZlWCwgbXogPSBpbnB1dC5tb3ZlWjtcbiAgY29uc3QgbGVuID0gTWF0aC5oeXBvdChteCwgbXopO1xuICBpZiAobGVuID4gMSkgeyBteCAvPSBsZW47IG16IC89IGxlbjsgfVxuICBjb25zdCB0YXJnZXQgPSBzd2ltbWluZyA/IFNXSU1fU1BFRUQgOiB3YWRpbmcgPyBXQURFX1NQRUVEIDogaW5wdXQucnVuID8gUlVOX1NQRUVEIDogV0FMS19TUEVFRDtcbiAgY29uc3QgYWNjZWwgPSBzLmdyb3VuZGVkIHx8IHN3aW1taW5nID8gMTQgOiA0O1xuICBzLnZ4ICs9IChteCAqIHRhcmdldCAtIHMudngpICogTWF0aC5taW4oMSwgYWNjZWwgKiBkdCk7XG4gIHMudnogKz0gKG16ICogdGFyZ2V0IC0gcy52eikgKiBNYXRoLm1pbigxLCBhY2NlbCAqIGR0KTtcblxuICBpZiAoc3dpbW1pbmcpIHtcbiAgICAvLyBGbG9hdCB3aXRoIHRoZSBoZWFkIGFib3ZlIHRoZSBzdXJmYWNlOyBhIGp1bXAgcHJlc3Mgc3Ryb2tlcyB1cHdhcmQuXG4gICAgY29uc3Qgc3VyZmFjZSA9IHMueSArIGRlcHRoO1xuICAgIGNvbnN0IGdvYWwgPSBzdXJmYWNlIC0gMS4yNTtcbiAgICBzLnZ5ICs9ICgoZ29hbCAtIHMueSkgKiA2IC0gcy52eSkgKiBNYXRoLm1pbigxLCA1ICogZHQpO1xuICAgIGlmIChpbnB1dC5qdW1wKSBzLnZ5ID0gTWF0aC5tYXgocy52eSwgMi41KTtcbiAgfSBlbHNlIHtcbiAgICBpZiAoaW5wdXQuanVtcCAmJiBzLmdyb3VuZGVkKSB7IHMudnkgPSB3YWRpbmcgPyBKVU1QX1NQRUVEICogMC43IDogSlVNUF9TUEVFRDsgcy5ncm91bmRlZCA9IGZhbHNlOyB9XG4gICAgcy52eSAtPSBHUkFWSVRZICogZHQ7XG4gICAgaWYgKHMudnkgPCAtNDApIHMudnkgPSAtNDA7XG4gIH1cblxuICAvLyBIb3Jpem9udGFsOiBheGlzLXNlcGFyYXRlZCB3aXRoIGF1dG9tYXRpYyBzdGVwLXVwIG9udG8gbGVkZ2VzLlxuICBjb25zdCB3YXNHcm91bmRlZCA9IHMuZ3JvdW5kZWQ7XG4gIGZvciAoY29uc3QgYXhpcyBvZiBbJ3gnLCAneiddIGFzIGNvbnN0KSB7XG4gICAgY29uc3QgZGVsdGEgPSAoYXhpcyA9PT0gJ3gnID8gcy52eCA6IHMudnopICogZHQ7XG4gICAgaWYgKGRlbHRhID09PSAwKSBjb250aW51ZTtcbiAgICBjb25zdCBueCA9IGF4aXMgPT09ICd4JyA/IHMueCArIGRlbHRhIDogcy54O1xuICAgIGNvbnN0IG56ID0gYXhpcyA9PT0gJ3onID8gcy56ICsgZGVsdGEgOiBzLno7XG4gICAgaWYgKCFvdmVybGFwcyh3b3JsZCwgbngsIHMueSwgbnopKSB7IHMueCA9IG54OyBzLnogPSBuejsgY29udGludWU7IH1cbiAgICBpZiAod2FzR3JvdW5kZWQgfHwgc3dpbW1pbmcgfHwgd2FkaW5nKSB7XG4gICAgICBjb25zdCBzdGVwWSA9IE1hdGguZmxvb3Iocy55ICsgMWUtMykgKyAxO1xuICAgICAgaWYgKHN0ZXBZIC0gcy55IDw9IFNURVBfSEVJR0hUICYmICFvdmVybGFwcyh3b3JsZCwgbngsIHN0ZXBZLCBueikpIHtcbiAgICAgICAgcy54ID0gbng7IHMueiA9IG56OyBzLnkgPSBzdGVwWTsgY29udGludWU7XG4gICAgICB9XG4gICAgICAvLyBTdHJ1Y3R1cmUgdG9wcyAoc2xhYnMsIHRlcnJhY2VzKSBhcmUgbm90IG9uIHRoZSB2b3hlbCBncmlkLlxuICAgICAgY29uc3QgdG9wID0gc3RydWN0dXJlRmxvb3Iod29ybGQsIG54LCBzLnkgKyBTVEVQX0hFSUdIVCwgbnopO1xuICAgICAgaWYgKHRvcCA+IHMueSAmJiB0b3AgLSBzLnkgPD0gU1RFUF9IRUlHSFQgJiYgIW92ZXJsYXBzKHdvcmxkLCBueCwgdG9wLCBueikpIHtcbiAgICAgICAgcy54ID0gbng7IHMueiA9IG56OyBzLnkgPSB0b3A7IGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoYXhpcyA9PT0gJ3gnKSBzLnZ4ID0gMDsgZWxzZSBzLnZ6ID0gMDtcbiAgfVxuXG4gIC8vIFZlcnRpY2FsLlxuICBjb25zdCBueSA9IHMueSArIHMudnkgKiBkdDtcbiAgaWYgKCFvdmVybGFwcyh3b3JsZCwgcy54LCBueSwgcy56KSkge1xuICAgIHMueSA9IG55O1xuICAgIHMuZ3JvdW5kZWQgPSBmYWxzZTtcbiAgfSBlbHNlIGlmIChzLnZ5IDw9IDApIHtcbiAgICAvLyBMYW5kIG9uIHRoZSBoaWdoZXN0IHN1cHBvcnQgYmV0d2VlbiBueSBhbmQgdGhlIGN1cnJlbnQgZmVldC5cbiAgICBsZXQgZmxvb3IgPSBNYXRoLmZsb29yKHMueSArIDFlLTMpO1xuICAgIHdoaWxlIChmbG9vciA+IG55IC0gMSAmJiBvdmVybGFwcyh3b3JsZCwgcy54LCBmbG9vciwgcy56KSkgZmxvb3IrKztcbiAgICBjb25zdCBzdHJ1Y3RUb3AgPSBzdHJ1Y3R1cmVGbG9vcih3b3JsZCwgcy54LCBzLnkgKyAwLjA1LCBzLnopO1xuICAgIHMueSA9IE1hdGgubWF4KGZsb29yLCBzdHJ1Y3RUb3AgPiBueSAtIDAuMDUgPyBzdHJ1Y3RUb3AgOiAtSW5maW5pdHkpO1xuICAgIGlmIChvdmVybGFwcyh3b3JsZCwgcy54LCBzLnksIHMueikpIHMueSA9IHByZXYueTtcbiAgICBzLnZ5ID0gMDtcbiAgICBzLmdyb3VuZGVkID0gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICBzLnZ5ID0gMDtcbiAgfVxuICAvLyBTdXBwb3J0ZWQgYnkgYSBzdHJ1Y3R1cmUgdG9wIGp1c3QgYmVsb3cgKHBhdGggc2xhYnMsIGZsb29ycykuXG4gIGlmICghcy5ncm91bmRlZCAmJiBzLnZ5IDw9IDApIHtcbiAgICBjb25zdCB0b3AgPSBzdHJ1Y3R1cmVGbG9vcih3b3JsZCwgcy54LCBzLnkgKyAwLjAyLCBzLnopO1xuICAgIGlmICh0b3AgPiAtSW5maW5pdHkgJiYgcy55IC0gdG9wIDwgMC4wNikgeyBzLnkgPSB0b3A7IHMudnkgPSAwOyBzLmdyb3VuZGVkID0gdHJ1ZTsgfVxuICB9XG5cbiAgcmVzb2x2ZUVudGl0aWVzKHdvcmxkLCBzKTtcblxuICBjb25zdCBtb3ZlZCA9IE1hdGguaHlwb3Qocy54IC0gcHJldi54LCBzLnogLSBwcmV2LnopIC8gZHQ7XG4gIHMuc3BlZWQgPSBtb3ZlZDtcbiAgaWYgKE1hdGguaHlwb3QobXgsIG16KSA+IDAuMSkge1xuICAgIGNvbnN0IHdhbnQgPSBNYXRoLmF0YW4yKG14LCBteik7XG4gICAgbGV0IGQgPSB3YW50IC0gcy5oZWFkaW5nO1xuICAgIHdoaWxlIChkID4gTWF0aC5QSSkgZCAtPSBNYXRoLlBJICogMjtcbiAgICB3aGlsZSAoZCA8IC1NYXRoLlBJKSBkICs9IE1hdGguUEkgKiAyO1xuICAgIHMuaGVhZGluZyArPSBkICogTWF0aC5taW4oMSwgMTIgKiBkdCk7XG4gIH1cbiAgY29uc3QgZGVwdGhBZnRlciA9IGZlZXRXYXRlckRlcHRoKHdvcmxkLCBzLngsIHMueSwgcy56KTtcbiAgcy5tb2RlID0gZGVwdGhBZnRlciA+PSBTV0lNX0RFUFRIID8gJ3N3aW0nIDogIXMuZ3JvdW5kZWQgPyAnYWlyJyA6IGRlcHRoQWZ0ZXIgPiAwLjIgPyAnd2FkZScgOiAnZ3JvdW5kJztcbiAgaWYgKHMubW9kZSA9PT0gJ3N3aW0nKSBzLmdyb3VuZGVkID0gZmFsc2U7XG4gIHJldHVybiBzO1xufVxuXG4vKiogSGlnaGVzdCBzdGFuZGFibGUgZmVldCBwb3NpdGlvbiBpbiBhIGNvbHVtbiBuZWFyIGB5SGludGAsIG9yIG51bGwgaWYgbm90IHJlc2lkZW50LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmRTdGFuZGluZ1kod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgeUhpbnQgPSAxMjApOiBudW1iZXIgfCBudWxsIHtcbiAgZm9yIChsZXQgeSA9IE1hdGgubWluKDExMCwgTWF0aC5mbG9vcih5SGludCkpOyB5ID4gWV9NSU47IHktLSkge1xuICAgIGNvbnN0IG0gPSByZXNpZGVudFZveGVsQXQod29ybGQsIE1hdGguZmxvb3IoeCksIHkgLSAxLCBNYXRoLmZsb29yKHopKTtcbiAgICBpZiAobSA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgaWYgKGlzU29saWQobSkgJiYgIW92ZXJsYXBzVGVycmFpbih3b3JsZCwgeCwgeSwgeikpIHJldHVybiB5O1xuICB9XG4gIHJldHVy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
