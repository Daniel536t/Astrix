// tests/m002.journal.test.ts
import assert from "node:assert/strict";
import test from "node:test";

// src/sim/stone-compat.ts
var states = /* @__PURE__ */ new WeakMap();
function replayStoneState(world) {
  let state = states.get(world);
  if (!state) {
    state = { active: false, historicalHash: false, migrated: false };
    states.set(world, state);
  }
  return state;
}
function enableStoneReplay(world) {
  const state = replayStoneState(world);
  state.active = true;
  state.historicalHash = true;
  state.migrated = false;
}
function isStoneReplay(world) {
  return states.get(world)?.active ?? false;
}
function isHistoricalStoneHash(world) {
  return states.get(world)?.historicalHash ?? false;
}
function finishStoneReplay(world) {
  const state = replayStoneState(world);
  state.active = false;
  state.historicalHash = false;
  state.migrated = true;
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
  const total2 = resampled[resampled.length - 1].s;
  const levelAt = (sv) => {
    let level = sv * UPPER_GRADIENT;
    for (const [frac, drop] of FALLS) {
      level += drop * smoothstep(total2 * frac - 5, total2 * frac + 5, sv);
    }
    return sv < 40 ? 0 : level - 40 * UPPER_GRADIENT;
  };
  const points = resampled.map((p) => ({
    x: p.x,
    z: p.z,
    s: p.s,
    level: Math.max(0, levelAt(p.s)),
    width: 3.2 + 2.2 * fbm2(p.s / 70, 9.7, seed + 802, 2) + (1 - p.s / total2) * 1.5
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
var MAX_MAT_ID = 10;

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
function liveEntity(world, id2) {
  const entity = world.entities.get(id2);
  return !entity || isRetiredStoneKind(entity.kind) && !isStoneReplay(world) || world.entityRemovals.has(id2) ? null : entity;
}
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
function generateWorld(seed = 1337, initialRadius = 0, generatorVersion = GENERATOR_VERSION) {
  const world = createWorld(seed, generatorVersion);
  const centre = Math.floor(CHUNKS_PER_SIDE / 2);
  for (let cz = centre - initialRadius; cz <= centre + initialRadius; cz++) {
    for (let cx = centre - initialRadius; cx <= centre + initialRadius; cx++) {
      generateChunk(world, cx, cz);
    }
  }
  placeAuthoredSites(world);
  return world;
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
var editVersions = /* @__PURE__ */ new WeakMap();
function editVersion(world) {
  return editVersions.get(world) ?? 0;
}
function markEditsChanged(world) {
  editVersions.set(world, editVersion(world) + 1);
}
function evictChunk(world, key) {
  if (!world.chunks.has(key)) return false;
  world.chunks.delete(key);
  world.stats.chunksEvicted++;
  return true;
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
function removeEntity(world, id2) {
  const e = world.entities.get(id2);
  if (!e || isRetiredStoneKind(e.kind) && !isStoneReplay(world)) return false;
  world.entities.delete(id2);
  const list = world.entityChunks.get(e.chunk);
  if (list) {
    const i = list.indexOf(id2);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) world.entityChunks.set(e.chunk, []);
  }
  world.entityChanges.add(e.chunk);
  if (!e.authored) world.entityRemovals.add(id2);
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
        const id2 = entityId(chunk.key, n++);
        const record = {
          id: id2,
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
  for (const id3 of ids) {
    const e = world.entities.get(id3);
    if (e && Math.hypot(e.x - x, e.z - z) < 2.6) {
      world.entities.delete(id3);
      if (e.kind.startsWith("styl_tree")) world.stats.trees = Math.max(0, world.stats.trees - 1);
      if (e.kind === "styl_tree_blossom") world.stats.pinkTrees = Math.max(0, world.stats.pinkTrees - 1);
    }
  }
  world.entityChunks.set(key, ids.filter((id3) => world.entities.has(id3)));
  world.entityChanges.add(key);
  const id2 = `hero:${kind}:${Math.round(x)}:${Math.round(z)}`;
  const before = world.entities.size;
  const entity = {
    id: id2,
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
function nearestHarvestable(world, x, z, radius, resource) {
  let best = null;
  let bestD = radius * radius;
  for (const e of world.entities.values()) {
    if (isRetiredStoneKind(e.kind) || world.entityRemovals.has(e.id) || e.harvested || !e.resource || e.remaining <= 0) continue;
    if (resource && e.resource !== resource) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}
function harvestEntity(world, id2) {
  const e = liveEntity(world, id2);
  if (!e || e.harvested || !e.resource || e.remaining <= 0) return null;
  const amount = Math.min(e.yieldPerHarvest, e.remaining);
  if (world.life && Object.values(world.inventory).reduce((sum, n) => sum + n, 0) + amount > 120) return null;
  e.remaining -= amount;
  if (!e.authored) world.entityChanges.add(e.chunk);
  e.harvestedOnce = true;
  if (e.remaining <= 0) e.harvested = true;
  world.inventory[e.resource] = (world.inventory[e.resource] ?? 0) + amount;
  world.revision++;
  return { entity: e, resource: e.resource, amount };
}
function retireStoneEntities(world) {
  for (const e of [...world.entities.values()]) {
    if (!isRetiredStoneKind(e.kind)) continue;
    world.entities.delete(e.id);
    if (!e.authored) world.entityRemovals.add(e.id);
    world.entityChanges.add(e.chunk);
    if (!world.entityChunks.has(e.chunk)) world.entityChunks.set(e.chunk, []);
  }
  for (const [key, ids] of world.entityChunks) {
    const active = ids.filter((id2) => world.entities.has(id2));
    if (active.length > 0 || world.entityChanges.has(key)) world.entityChunks.set(key, active);
    else world.entityChunks.delete(key);
  }
  world.stats.entities = world.entities.size;
}
function fnv1a(text2) {
  let h = 2166136261;
  for (let i = 0; i < text2.length; i++) {
    h ^= text2.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function worldManifest(world) {
  const p = world.params;
  return {
    schema: 1,
    seed: world.seed,
    generatorVersion: p.generatorVersion,
    size: p.size,
    chunkSize: p.chunkSize,
    yMin: p.yMin,
    yMax: p.yMax,
    seaLevel: p.seaLevel,
    paramsHash: fnv1a(JSON.stringify(p))
  };
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
    for (const id2 of ids) {
      if (seen.has(id2)) continue;
      const e = world.entities.get(id2);
      if (!e || isRetiredStoneKind(e.kind) && !isStoneReplay(world) || world.entityRemovals.has(e.id)) continue;
      seen.add(id2);
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
  for (const id2 of clears) lines.push(`c:${id2}`);
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
    if (current.length !== planned.length || current.some((id2, i) => id2 !== planned[i])) {
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
  if (current.length !== planned.length || current.some((id2, i) => id2 !== planned[i])) {
    reasons.push("footprint obstructions changed after authorization");
  }
  if (plan.clearEntityIds.length > authorization.limits.maxEntityRemovals) {
    reasons.push(`${plan.clearEntityIds.length} removals exceed limit ${authorization.limits.maxEntityRemovals}`);
  }
  for (const id2 of plan.clearEntityIds) {
    if (!world.entities.has(id2)) reasons.push(`entity ${id2} no longer exists`);
  }
  if (world.life) {
    let recovered = 0;
    for (const id2 of plan.clearEntityIds) {
      const entity = world.entities.get(id2);
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
  for (const id2 of [...plan.clearEntityIds].sort()) {
    const e = world.entities.get(id2);
    if (!e) continue;
    const amount = e.resource && e.remaining > 0 ? e.remaining : 0;
    if (e.resource && amount > 0) {
      world.inventory[e.resource] = (world.inventory[e.resource] ?? 0) + amount;
      resourcesGained[e.resource] = (resourcesGained[e.resource] ?? 0) + amount;
    }
    removeEntity(world, id2);
    entitiesCleared.push({
      entityId: id2,
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

// src/sim/economy.ts
var LIFE_RESOURCES = ["fiber", "food", "ore", "rations", "seed", "stone", "wood"];
var CARRIED_CAPACITY = 120;
var STOCKPILE_CAPACITY = 200;
var MAX_PRODUCTION_JOBS = 16;
var MAX_TICKS_PER_COMMAND = 64;
var CROP_GROWTH_TICKS = 4;
var CROP_YIELD = { food: 6, fiber: 1 };
var CROP_YIELD_LABEL = `${CROP_YIELD.food} food + ${CROP_YIELD.fiber} fiber`;
var FOUNDER_STOCKPILE_ID = "stockpile:founder";
var FOUNDER_STOCKPILE = { id: FOUNDER_STOCKPILE_ID, x: -50, z: -32, capacity: STOCKPILE_CAPACITY };
var RECIPES = {
  seed: { input: { fiber: 2 }, output: { seed: 3 }, ticks: 1 },
  rations: { input: { food: 2 }, output: { rations: 3 }, ticks: 2 }
};
var CROP_PLOT_IDS = Array.from({ length: 9 }, (_, i) => `crop:${i}`);
function createLifeState() {
  return {
    stockpiles: /* @__PURE__ */ new Map([[FOUNDER_STOCKPILE_ID, {
      id: FOUNDER_STOCKPILE_ID,
      x: FOUNDER_STOCKPILE.x,
      z: FOUNDER_STOCKPILE.z,
      capacity: STOCKPILE_CAPACITY,
      inventory: {}
    }]]),
    jobs: /* @__PURE__ */ new Map(),
    crops: /* @__PURE__ */ new Map(),
    tick: 0
  };
}
function total(bag) {
  return Object.values(bag).reduce((sum, amount) => sum + amount, 0);
}
function cloneBag(bag) {
  return Object.fromEntries(Object.entries(bag).filter(([, amount]) => amount > 0).sort(([a], [b]) => a.localeCompare(b)));
}
function lifeState(world) {
  if (!world.life) throw new Error("life-loop commands require a schema-3 world");
  return world.life;
}
function rejectLife(code, reasons) {
  return { ok: false, code, reasons };
}
function requireAmount(bag) {
  const entries = Object.entries(bag);
  if (entries.length !== 1) return { ok: false, reasons: ["transfer exactly one resource at a time"] };
  const [resource, amount] = entries[0];
  if (!LIFE_RESOURCES.includes(resource) || !Number.isSafeInteger(amount) || (amount ?? 0) <= 0) {
    return { ok: false, reasons: ["resource amount must be a positive integer"] };
  }
  return { ok: true, resource, amount };
}
function move(world, from, to, requested, toCapacity) {
  const checked = requireAmount(requested);
  if (!checked.ok) return rejectLife("invalid_transfer", [checked.reasons[0]]);
  const { resource, amount } = checked;
  if ((from[resource] ?? 0) < amount) return rejectLife("insufficient_resources", [`need ${amount} ${String(resource)}, have ${from[resource] ?? 0}`]);
  if (total(to) + amount > toCapacity) return rejectLife("capacity_exceeded", [`destination capacity ${toCapacity} would be exceeded`]);
  from[resource] = (from[resource] ?? 0) - amount;
  if (from[resource] === 0) delete from[resource];
  to[resource] = (to[resource] ?? 0) + amount;
  world.revision++;
  return { ok: true, value: { [resource]: amount } };
}
function transfer(world, kind, bag) {
  const life = lifeState(world);
  const stock = life.stockpiles.get(FOUNDER_STOCKPILE_ID);
  if (!stock) return rejectLife("missing_stockpile", ["founder stockpile is absent"]);
  return kind === "deposit" ? move(world, world.inventory, stock.inventory, bag, stock.capacity) : move(world, stock.inventory, world.inventory, bag, CARRIED_CAPACITY);
}
function startProduction(world, recipeId, jobId) {
  const life = lifeState(world);
  const stock = life.stockpiles.get(FOUNDER_STOCKPILE_ID);
  if (!stock) return rejectLife("missing_stockpile", ["founder stockpile is absent"]);
  if (life.jobs.has(jobId)) return rejectLife("duplicate_job", ["production job already exists"]);
  if (life.jobs.size >= MAX_PRODUCTION_JOBS) return rejectLife("job_limit", [`at most ${MAX_PRODUCTION_JOBS} jobs may be active`]);
  const recipe = RECIPES[recipeId];
  for (const [resource, amount] of Object.entries(recipe.input)) {
    if ((stock.inventory[resource] ?? 0) < (amount ?? 0)) {
      return rejectLife("insufficient_resources", [`need ${amount} ${String(resource)}, have ${stock.inventory[resource] ?? 0}`]);
    }
  }
  const reservedOutput = [...life.jobs.values()].filter((j) => j.stockpileId === stock.id).reduce((sum, job2) => sum + total(cloneBag(RECIPES[job2.recipe].output)), 0);
  if (total(stock.inventory) - total(cloneBag(recipe.input)) + reservedOutput + total(cloneBag(recipe.output)) > stock.capacity) {
    return rejectLife("capacity_exceeded", ["reserved production output would exceed stockpile capacity"]);
  }
  for (const [resource, amount] of Object.entries(recipe.input)) {
    stock.inventory[resource] = (stock.inventory[resource] ?? 0) - (amount ?? 0);
    if (stock.inventory[resource] === 0) delete stock.inventory[resource];
  }
  const job = { id: jobId, stockpileId: stock.id, recipe: recipeId, remainingTicks: recipe.ticks };
  life.jobs.set(job.id, job);
  world.revision++;
  return { ok: true, value: { ...job } };
}
function plantCrop(world, plotId) {
  const life = lifeState(world);
  if (!CROP_PLOT_IDS.includes(plotId)) return rejectLife("invalid_plot", ["unknown crop plot"]);
  if (![...world.structures.values()].some((s) => s.kind === "terrace")) {
    return rejectLife("farm_required", ["build the founder terraced farm before planting"]);
  }
  if (life.crops.has(plotId)) return rejectLife("plot_occupied", ["crop plot is already planted"]);
  const stock = life.stockpiles.get(FOUNDER_STOCKPILE_ID);
  if (!stock || (stock.inventory.seed ?? 0) < 1) return rejectLife("insufficient_resources", ["need 1 seed in the founder stockpile"]);
  stock.inventory.seed--;
  if (stock.inventory.seed === 0) delete stock.inventory.seed;
  const crop = { id: plotId, plantedTick: life.tick, growthTicks: CROP_GROWTH_TICKS };
  life.crops.set(plotId, crop);
  world.revision++;
  return { ok: true, value: { ...crop } };
}
function cropReady(crop, tick) {
  return tick - crop.plantedTick >= crop.growthTicks;
}
function harvestCrop(world, plotId) {
  const life = lifeState(world);
  const crop = life.crops.get(plotId);
  if (!crop) return rejectLife("not_planted", ["crop plot is empty"]);
  if (!cropReady(crop, life.tick)) return rejectLife("crop_not_ready", [`crop needs ${crop.growthTicks - (life.tick - crop.plantedTick)} more ticks`]);
  const yieldBag = { food: CROP_YIELD.food, fiber: CROP_YIELD.fiber };
  if (total(world.inventory) + yieldBag.food + yieldBag.fiber > CARRIED_CAPACITY) {
    return rejectLife("capacity_exceeded", [`carried capacity ${CARRIED_CAPACITY} would be exceeded`]);
  }
  world.inventory.food = (world.inventory.food ?? 0) + yieldBag.food;
  world.inventory.fiber = (world.inventory.fiber ?? 0) + yieldBag.fiber;
  life.crops.delete(plotId);
  world.revision++;
  return { ok: true, value: yieldBag };
}
function advanceTicks(world, count) {
  const life = lifeState(world);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_TICKS_PER_COMMAND) {
    return rejectLife("invalid_tick_count", [`ticks must be an integer from 1 to ${MAX_TICKS_PER_COMMAND}`]);
  }
  const completed = [];
  const fromTick = life.tick;
  for (let step = 0; step < count; step++) {
    life.tick++;
    for (const job of [...life.jobs.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      job.remainingTicks--;
      if (job.remainingTicks > 0) continue;
      const stock = life.stockpiles.get(job.stockpileId);
      if (!stock) throw new Error("active production references a missing stockpile");
      const output = cloneBag(RECIPES[job.recipe].output);
      if (total(stock.inventory) + total(output) > stock.capacity) throw new Error("reserved production output exceeds capacity");
      for (const [resource, amount] of Object.entries(output)) stock.inventory[resource] = (stock.inventory[resource] ?? 0) + amount;
      life.jobs.delete(job.id);
      completed.push({ id: job.id, recipe: job.recipe, output });
    }
  }
  const readyCrops = [...life.crops.values()].filter((crop) => cropReady(crop, life.tick) && crop.plantedTick + crop.growthTicks > fromTick).map((crop) => crop.id).sort();
  world.revision++;
  return { ok: true, value: { fromTick, toTick: life.tick, completedJobs: completed, readyCrops } };
}

// src/sim/snapshot.ts
var SNAPSHOT_SCHEMA = 1;
var DESIGN_SNAPSHOT_SCHEMA = 2;
var CURRENT_SNAPSHOT_SCHEMA = 3;
var MAX_SNAPSHOT_EDITS = 1e6;
var MAX_SNAPSHOT_ENTITIES = 5e5;
function cloneEntity(e) {
  return {
    id: e.id,
    kind: e.kind,
    chunk: e.chunk,
    x: e.x,
    y: e.y,
    z: e.z,
    rot: e.rot,
    scale: e.scale,
    variant: e.variant,
    resource: e.resource,
    remaining: e.remaining,
    yieldPerHarvest: e.yieldPerHarvest,
    harvested: e.harvested,
    ...e.harvestedOnce === void 0 ? {} : { harvestedOnce: e.harvestedOnce },
    provisional: e.provisional,
    authored: e.authored
  };
}
function cloneStructure(s) {
  return {
    ...s,
    modules: s.modules.map((m) => ({ ...m })),
    cost: Object.fromEntries(Object.entries(s.cost).filter(([, amount]) => (amount ?? 0) > 0).sort(([a], [b]) => a.localeCompare(b)))
  };
}
function createWorldSnapshot(world, nextSequence = 0, schema = world.life ? CURRENT_SNAPSHOT_SCHEMA : [...world.structures.values()].some((s) => s.designVersion === FOUNDER_DESIGN_VERSION) ? DESIGN_SNAPSHOT_SCHEMA : SNAPSHOT_SCHEMA) {
  if (schema !== CURRENT_SNAPSHOT_SCHEMA && (world.life || [...world.structures.values()].some(
    (s) => schema === SNAPSHOT_SCHEMA && s.designVersion !== void 0
  ))) throw new Error("legacy snapshots cannot contain newer authoritative state");
  const base = {
    schema,
    manifest: worldManifest(world),
    revision: world.revision,
    edits: [...world.edits.entries()].sort(([a], [b]) => a.localeCompare(b)).map(
      ([chunk, cells]) => ({
        chunk,
        cells: [...cells.entries()].sort(([a], [b]) => a - b).map(([i, m]) => ({ i, m }))
      })
    ),
    entities: [...world.entities.values()].filter((e) => (isHistoricalStoneHash(world) || !isRetiredStoneKind(e.kind)) && (e.authored || world.entityChanges.has(e.chunk))).sort((a, b) => a.id.localeCompare(b.id)).map(cloneEntity),
    entityChunks: [...world.entityChanges].sort((a, b) => a.localeCompare(b)),
    entityRemovals: [...world.entityRemovals].sort((a, b) => a.localeCompare(b)),
    inventory: Object.fromEntries(Object.entries(world.inventory).filter(([, amount]) => amount > 0).sort(([a], [b]) => a.localeCompare(b))),
    structures: [...world.structures.values()].sort((a, b) => a.id.localeCompare(b.id)).map(cloneStructure),
    authoredPlaced: world.authoredPlaced,
    nextSequence
  };
  if (schema !== CURRENT_SNAPSHOT_SCHEMA) return { ...base, schema };
  if (!world.life) throw new Error("schema-3 snapshot requires life state");
  return {
    ...base,
    schema,
    tick: world.life.tick,
    stockpiles: [...world.life.stockpiles.values()].sort((a, b) => a.id.localeCompare(b.id)).map((s) => ({
      id: s.id,
      x: s.x,
      z: s.z,
      capacity: s.capacity,
      inventory: Object.fromEntries(Object.entries(s.inventory).filter(([, amount]) => amount > 0).sort(([a], [b]) => a.localeCompare(b)))
    })),
    jobs: [...world.life.jobs.values()].sort((a, b) => a.id.localeCompare(b.id)).map((j) => ({ ...j })),
    crops: [...world.life.crops.values()].sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({ ...c }))
  };
}
function canonicalHash(text2) {
  let a = 2166136261, b = 2654435769;
  for (let i = 0; i < text2.length; i++) {
    const c = text2.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c + 158, 2246822507);
    b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
function canonicalWorldHash(world, nextSequence = 0, schema = DESIGN_SNAPSHOT_SCHEMA) {
  return canonicalHash(JSON.stringify(createWorldSnapshot(world, nextSequence, schema)));
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function uint(value, maximum) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}
function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function text(value, maximum = 256) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}
function validChunk(key) {
  if (typeof key !== "string" || !/^-?\d+,-?\d+$/.test(key)) return false;
  const [cx, cz] = key.split(",").map(Number);
  return Number.isInteger(cx) && Number.isInteger(cz) && cx >= 0 && cz >= 0 && cx < CHUNKS_PER_SIDE && cz < CHUNKS_PER_SIDE;
}
function legacyStoneHash(snapshot) {
  return canonicalHash(JSON.stringify(snapshot));
}
function migrateStoneSnapshot(snapshot) {
  const removals = new Set(snapshot.entityRemovals);
  for (const entity of snapshot.entities) {
    if (isRetiredStoneKind(entity.kind) && !entity.authored) removals.add(entity.id);
  }
  const entityChunks = new Set(snapshot.entityChunks);
  for (const entity of snapshot.entities) {
    if (isRetiredStoneKind(entity.kind)) {
      entityChunks.add(entity.chunk);
      if (!entity.authored) removals.add(entity.id);
    }
  }
  return {
    ...snapshot,
    entities: snapshot.entities.filter((entity) => !isRetiredStoneKind(entity.kind)),
    entityChunks: [...entityChunks].sort((a, b) => a.localeCompare(b)),
    entityRemovals: [...removals].sort((a, b) => a.localeCompare(b))
  };
}
var ENTITY_KINDS = /* @__PURE__ */ new Set([
  "styl_tree_spire",
  "styl_tree_table",
  "styl_tree_cluster",
  "styl_tree_blossom",
  "styl_shrub",
  "styl_rock_small",
  "styl_rock_medium",
  "styl_rock_large",
  "styl_ore",
  "styl_cairn",
  "waystone",
  "marker"
]);
var RESOURCES = /* @__PURE__ */ new Set(["wood", "stone", "ore", "fiber"]);
var RECORD_RESOURCES = new Set(LIFE_RESOURCES);
var STRUCTURE_KINDS = /* @__PURE__ */ new Set(["house", "path", "terrace"]);
var MODULE_KINDS = /* @__PURE__ */ new Set([
  "floor",
  "wall",
  "post",
  "lintel",
  "roof",
  "parapet",
  "window",
  "door",
  "threshold",
  "path",
  "curb",
  "soil_bed",
  "retaining_wall",
  "crop_row"
]);
var MODULE_TONES = /* @__PURE__ */ new Set(["stone", "stone_b", "ochre", "timber", "accent", "soil", "crop", "gravel"]);
function validateEntity(value, ids) {
  if (!isObject(value) || !text(value.id) || ids.has(value.id) || !text(value.kind) || !ENTITY_KINDS.has(value.kind) || !validChunk(value.chunk) || !finite(value.x) || !finite(value.y) || !finite(value.z) || value.x < -HALF || value.x >= HALF || value.z < -HALF || value.z >= HALF || !finite(value.rot) || !finite(value.scale) || !uint(value.variant, 1e3) || value.resource !== null && !(typeof value.resource === "string" && RESOURCES.has(value.resource)) || !uint(value.remaining, 1e6) || !uint(value.yieldPerHarvest, 1e6) || typeof value.harvested !== "boolean" || typeof value.provisional !== "boolean" || typeof value.authored !== "boolean" || value.harvestedOnce !== void 0 && typeof value.harvestedOnce !== "boolean") {
    throw new Error("snapshot contains an invalid or duplicate entity");
  }
  ids.add(value.id);
  return {
    id: value.id,
    kind: value.kind,
    chunk: value.chunk,
    x: value.x,
    y: value.y,
    z: value.z,
    rot: value.rot,
    scale: value.scale,
    variant: value.variant,
    resource: value.resource,
    remaining: value.remaining,
    yieldPerHarvest: value.yieldPerHarvest,
    harvested: value.harvested,
    ...value.harvestedOnce === void 0 ? {} : { harvestedOnce: value.harvestedOnce },
    provisional: value.provisional,
    authored: value.authored
  };
}
function validateInventory(value) {
  if (!isObject(value)) throw new Error("snapshot inventory is invalid");
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (!RECORD_RESOURCES.has(key) || !uint(value[key], 1e9)) {
      throw new Error(`snapshot has invalid inventory resource ${key}`);
    }
    if (value[key] > 0) out[key] = value[key];
  }
  return out;
}
function stockTotal(value) {
  return Object.values(value).reduce((sum, amount) => sum + amount, 0);
}
function validateLifeFields(value) {
  if (!uint(value.tick, Number.MAX_SAFE_INTEGER) || !Array.isArray(value.stockpiles) || value.stockpiles.length !== 1 || !Array.isArray(value.jobs) || value.jobs.length > MAX_PRODUCTION_JOBS || !Array.isArray(value.crops) || value.crops.length > CROP_PLOT_IDS.length) {
    throw new Error("snapshot has invalid life-loop fields");
  }
  const stockpiles = [];
  for (const raw of value.stockpiles) {
    if (!isObject(raw) || raw.id !== FOUNDER_STOCKPILE_ID || raw.x !== FOUNDER_STOCKPILE.x || raw.z !== FOUNDER_STOCKPILE.z || raw.capacity !== FOUNDER_STOCKPILE.capacity) {
      throw new Error("snapshot has an unsupported stockpile");
    }
    const inventory2 = validateInventory(raw.inventory);
    if (stockTotal(inventory2) > STOCKPILE_CAPACITY) throw new Error("stockpile exceeds capacity");
    stockpiles.push({
      id: FOUNDER_STOCKPILE_ID,
      x: raw.x,
      z: raw.z,
      capacity: STOCKPILE_CAPACITY,
      inventory: inventory2
    });
  }
  let reserved = stockTotal(stockpiles[0].inventory);
  const ids = /* @__PURE__ */ new Set();
  const jobs = [];
  for (const raw of value.jobs) {
    if (!isObject(raw) || !text(raw.id, 128) || !/^[A-Za-z0-9][A-Za-z0-9._:%-]*$/.test(raw.id) || ids.has(raw.id) || raw.stockpileId !== FOUNDER_STOCKPILE_ID || raw.recipe !== "seed" && raw.recipe !== "rations" || !uint(raw.remainingTicks, MAX_TICKS_PER_COMMAND) || raw.remainingTicks < 1 || raw.remainingTicks > RECIPES[raw.recipe].ticks) throw new Error("snapshot has an invalid production job");
    reserved += stockTotal(RECIPES[raw.recipe].output);
    ids.add(raw.id);
    jobs.push({ id: raw.id, stockpileId: FOUNDER_STOCKPILE_ID, recipe: raw.recipe, remainingTicks: raw.remainingTicks });
  }
  if (reserved > STOCKPILE_CAPACITY) throw new Error("stockpile reserved output exceeds capacity");
  ids.clear();
  const crops = [];
  for (const raw of value.crops) {
    if (!isObject(raw) || !CROP_PLOT_IDS.includes(String(raw.id)) || ids.has(String(raw.id)) || !uint(raw.plantedTick, value.tick) || raw.growthTicks !== CROP_GROWTH_TICKS) {
      throw new Error("snapshot has an invalid crop plot");
    }
    const plotId = String(raw.id);
    ids.add(plotId);
    crops.push({ id: plotId, plantedTick: raw.plantedTick, growthTicks: CROP_GROWTH_TICKS });
  }
  stockpiles.sort((a, b) => a.id.localeCompare(b.id));
  jobs.sort((a, b) => a.id.localeCompare(b.id));
  crops.sort((a, b) => a.id.localeCompare(b.id));
  return { tick: value.tick, stockpiles, jobs, crops };
}
function validateCost(value) {
  const out = validateInventory(value);
  return out;
}
function validateStructure(value, ids, schema) {
  if (!isObject(value) || !text(value.id) || ids.has(value.id) || !text(value.kind) || !STRUCTURE_KINDS.has(value.kind) || !text(value.siteId) || !finite(value.x) || !finite(value.y) || !finite(value.z) || !finite(value.rot) || !Array.isArray(value.modules) || value.modules.length > 64 || !uint(value.builtRevision, Number.MAX_SAFE_INTEGER) || value.provisional !== true || schema === SNAPSHOT_SCHEMA && value.designVersion !== void 0 || schema !== SNAPSHOT_SCHEMA && value.designVersion !== void 0 && value.designVersion !== FOUNDER_DESIGN_VERSION) {
    throw new Error("snapshot contains an invalid or duplicate structure");
  }
  const modules = [];
  const moduleIds = /* @__PURE__ */ new Set();
  for (const raw of value.modules) {
    if (!isObject(raw) || !text(raw.kind) || !MODULE_KINDS.has(raw.kind) || !finite(raw.x) || !finite(raw.y) || !finite(raw.z) || !finite(raw.w) || raw.w <= 0 || !finite(raw.h) || raw.h <= 0 || !finite(raw.d) || raw.d <= 0 || raw.rot !== void 0 && !finite(raw.rot) || raw.tone !== void 0 && (typeof raw.tone !== "string" || !MODULE_TONES.has(raw.tone))) {
      throw new Error(`structure ${value.id} contains an invalid module`);
    }
    const signature = JSON.stringify(raw);
    if (moduleIds.has(signature)) throw new Error(`structure ${value.id} contains duplicate modules`);
    moduleIds.add(signature);
    modules.push({
      kind: raw.kind,
      x: raw.x,
      y: raw.y,
      z: raw.z,
      w: raw.w,
      h: raw.h,
      d: raw.d,
      ...raw.rot === void 0 ? {} : { rot: raw.rot },
      ...raw.tone === void 0 ? {} : { tone: raw.tone }
    });
  }
  ids.add(value.id);
  return {
    id: value.id,
    kind: value.kind,
    siteId: value.siteId,
    x: value.x,
    y: value.y,
    z: value.z,
    rot: value.rot,
    modules,
    cost: validateCost(value.cost),
    builtRevision: value.builtRevision,
    ...value.designVersion === void 0 ? {} : { designVersion: FOUNDER_DESIGN_VERSION },
    provisional: true
  };
}
function validateWorldSnapshot(value) {
  if (!isObject(value) || value.schema !== SNAPSHOT_SCHEMA && value.schema !== DESIGN_SNAPSHOT_SCHEMA && value.schema !== CURRENT_SNAPSHOT_SCHEMA || !isObject(value.manifest)) {
    throw new Error("unsupported or malformed world snapshot");
  }
  const schema = value.schema;
  const m = value.manifest;
  const params = {
    size: 2048,
    chunkSize: CHUNK_SIZE,
    yMin: -16,
    yMax: 112,
    seaLevel: 0,
    generatorVersion: isSupportedGenerator(m.generatorVersion) ? m.generatorVersion : GENERATOR_VERSION
  };
  if (m.schema !== 1 || !uint(m.seed, 4294967295) || !isSupportedGenerator(m.generatorVersion) || m.size !== params.size || m.chunkSize !== params.chunkSize || m.yMin !== params.yMin || m.yMax !== params.yMax || m.seaLevel !== params.seaLevel || !/^[0-9a-f]{8}$/.test(String(m.paramsHash))) {
    throw new Error("snapshot generator configuration is unsupported or incompatible");
  }
  if (!uint(value.revision, Number.MAX_SAFE_INTEGER) || !uint(value.nextSequence, 1e7) || typeof value.authoredPlaced !== "boolean" || !Array.isArray(value.edits) || !Array.isArray(value.entities) || !Array.isArray(value.entityRemovals) || value.entities.length > MAX_SNAPSHOT_ENTITIES || !Array.isArray(value.entityChunks) || !Array.isArray(value.structures)) {
    throw new Error("snapshot has invalid authoritative-state fields");
  }
  const world = createWorld(m.seed, params.generatorVersion);
  if (worldManifest(world).paramsHash !== m.paramsHash) throw new Error("snapshot manifest hash mismatch");
  const edits = [];
  let editCount = 0;
  const chunkIds = /* @__PURE__ */ new Set();
  for (const raw of value.edits) {
    if (!isObject(raw) || !validChunk(raw.chunk) || chunkIds.has(raw.chunk) || !Array.isArray(raw.cells) || raw.cells.length > CHUNK_VOLUME) {
      throw new Error("snapshot contains invalid chunk edits");
    }
    const cellIds = /* @__PURE__ */ new Set();
    const cells = [];
    for (const cell of raw.cells) {
      if (!isObject(cell) || !uint(cell.i, CHUNK_VOLUME - 1) || cellIds.has(cell.i) || !uint(cell.m, MAX_MAT_ID)) throw new Error("snapshot contains an invalid voxel edit");
      cellIds.add(cell.i);
      cells.push({ i: cell.i, m: cell.m });
    }
    cellIds.clear();
    cells.sort((a, b) => a.i - b.i);
    editCount += cells.length;
    if (editCount > MAX_SNAPSHOT_EDITS) throw new Error("snapshot exceeds the bounded edit limit");
    chunkIds.add(raw.chunk);
    edits.push({ chunk: raw.chunk, cells });
  }
  edits.sort((a, b) => a.chunk.localeCompare(b.chunk));
  const entityIds = /* @__PURE__ */ new Set();
  const entities = value.entities.map((e) => validateEntity(e, entityIds));
  const entityChunks = [];
  const generated = /* @__PURE__ */ new Set();
  for (const key of value.entityChunks) {
    if (!validChunk(key) || generated.has(key)) throw new Error("snapshot generated-chunk index is invalid");
    generated.add(key);
    entityChunks.push(key);
  }
  for (const entity of entities) {
    if (!entity.authored && !generated.has(entity.chunk)) throw new Error(`entity ${entity.id} belongs to an unmarked chunk`);
  }
  entityChunks.sort((a, b) => a.localeCompare(b));
  const removals = /* @__PURE__ */ new Set();
  for (const id2 of value.entityRemovals) {
    if (!text(id2) || removals.has(id2) || entityIds.has(id2) || !/^e:\d+,\d+:\d+$/.test(id2)) {
      throw new Error("snapshot entity tombstone is invalid");
    }
    removals.add(id2);
  }
  const entityRemovals = [...removals].sort((a, b) => a.localeCompare(b));
  const structureIds = /* @__PURE__ */ new Set();
  const structures = value.structures.map((s) => validateStructure(s, structureIds, schema)).sort((a, b) => a.id.localeCompare(b.id));
  const carried = validateInventory(value.inventory);
  if (schema === CURRENT_SNAPSHOT_SCHEMA && stockTotal(carried) > CARRIED_CAPACITY) throw new Error("carried inventory exceeds capacity");
  const snapshot = {
    schema,
    manifest: {
      schema: 1,
      seed: m.seed,
      generatorVersion: params.generatorVersion,
      size: params.size,
      chunkSize: params.chunkSize,
      yMin: params.yMin,
      yMax: params.yMax,
      seaLevel: params.seaLevel,
      paramsHash: m.paramsHash
    },
    revision: value.revision,
    edits,
    entities,
    entityChunks,
    entityRemovals,
    inventory: carried,
    structures,
    authoredPlaced: value.authoredPlaced,
    nextSequence: value.nextSequence
  };
  const result = schema === CURRENT_SNAPSHOT_SCHEMA ? { ...snapshot, schema: CURRENT_SNAPSHOT_SCHEMA, ...validateLifeFields(value) } : { ...snapshot, schema };
  if (JSON.stringify(result) !== JSON.stringify(value)) {
    throw new Error("snapshot contains unknown, non-canonical or ambiguous fields");
  }
  return result;
}
function restoreWorldSnapshot(world, input) {
  finishStoneReplay(world);
  restoreWorldSnapshotExact(world, input);
}
function restoreWorldSnapshotExact(world, input) {
  const snapshot = validateWorldSnapshot(input);
  if (snapshot.manifest.seed !== world.seed) throw new Error("snapshot seed does not match the world");
  world.params = {
    size: snapshot.manifest.size,
    chunkSize: snapshot.manifest.chunkSize,
    yMin: snapshot.manifest.yMin,
    yMax: snapshot.manifest.yMax,
    seaLevel: snapshot.manifest.seaLevel,
    generatorVersion: snapshot.manifest.generatorVersion
  };
  world.chunks.clear();
  world.entities.clear();
  world.entityChunks.clear();
  world.entityChanges.clear();
  world.entityRemovals.clear();
  world.structures.clear();
  world.edits.clear();
  world.inventory = { ...snapshot.inventory };
  world.life = snapshot.schema === CURRENT_SNAPSHOT_SCHEMA ? createLifeState() : void 0;
  if (world.life && snapshot.schema === CURRENT_SNAPSHOT_SCHEMA) {
    world.life.tick = snapshot.tick;
    for (const s of snapshot.stockpiles) world.life.stockpiles.set(s.id, { ...s, inventory: { ...s.inventory } });
    for (const j of snapshot.jobs) world.life.jobs.set(j.id, { ...j });
    for (const c of snapshot.crops) world.life.crops.set(c.id, { ...c });
  }
  world.dirty.clear();
  world.sites = [];
  world.stats = {
    chunksGenerated: 0,
    chunksEvicted: 0,
    voxelsFilled: 0,
    generationMs: 0,
    entities: snapshot.entities.length,
    trees: 0,
    pinkTrees: 0,
    pinkOverflow: 0
  };
  world.revision = snapshot.revision;
  world.authoredPlaced = snapshot.authoredPlaced;
  for (const key of snapshot.entityChunks) world.entityChanges.add(key);
  for (const delta of snapshot.edits) {
    world.edits.set(delta.chunk, new Map(delta.cells.map((e) => [e.i, e.m])));
  }
  markEditsChanged(world);
  if (world.authoredPlaced) {
    world.authoredPlaced = false;
    placeAuthoredSites(world);
    world.authoredPlaced = true;
  }
  world.revision = snapshot.revision;
  for (const id2 of snapshot.entityRemovals) world.entityRemovals.add(id2);
  world.entities.clear();
  world.entityChunks.clear();
  for (const key of snapshot.entityChunks) {
    const [cx, cz] = key.split(",").map(Number);
    const chunk = ensureChunk(world, cx, cz);
    if (!chunk) throw new Error(`snapshot references unavailable chunk ${key}`);
    const saved = new Set(snapshot.entities.filter((e) => e.chunk === key).map((e) => e.id));
    const ids = (world.entityChunks.get(key) ?? []).filter((id2) => {
      const entity = world.entities.get(id2);
      return !id2.startsWith("e:") && !!entity && (!isRetiredStoneKind(entity.kind) || isStoneReplay(world));
    });
    for (const id2 of [...world.entities.keys()]) {
      const entity = world.entities.get(id2);
      if (entity?.chunk === key && !entity.authored && !saved.has(id2)) world.entities.delete(id2);
    }
    for (const id2 of saved) if (!ids.includes(id2)) ids.push(id2);
    world.entityChunks.set(key, ids);
  }
  for (const e of snapshot.entities) {
    world.entities.set(e.id, cloneEntity(e));
  }
  for (const key of snapshot.entityChunks) world.entityChanges.add(key);
  world.stats.entities = world.entities.size;
  for (const e of world.entities.values()) {
    if (e.kind.startsWith("styl_tree")) world.stats.trees++;
    if (e.kind === "styl_tree_blossom") world.stats.pinkTrees++;
  }
  for (const s of snapshot.structures) world.structures.set(s.id, cloneStructure(s));
}
function worldFromSnapshot(snapshot) {
  const valid = validateWorldSnapshot(snapshot);
  const world = createWorld(valid.manifest.seed, valid.manifest.generatorVersion);
  restoreWorldSnapshot(world, valid);
  return world;
}

// src/app/projects.ts
var pathRect = m002PathRect();
var pathTargets = m002PathTargets();
var farmTargets = m002FarmTargets();
var M2_PROJECTS = [
  {
    id: "house",
    name: "Founder's house",
    subtitle: "8 x 6 m \xB7 flat stone shelf",
    description: "The 19-module founder candidate uses a flat stone foundation, a 3.2 m storey, a real east doorway and two open south windows. Structural wall voids require more primitives than the provisional asset-volume target; this design remains subject to art review.",
    siteId: M002_LAYOUT.house.id,
    kind: "house",
    rect: M002_LAYOUT.house.rect,
    floorY: M002_LAYOUT.house.floorY,
    rules: HOUSE_RULES,
    cost: { ...HOUSE_COST },
    door: M002_LAYOUT.house.door,
    approach: M002_LAYOUT.house.approach,
    prep: {}
  },
  {
    id: "path",
    name: "Door path",
    subtitle: "9 x 3 m \xB7 stepped gravel",
    description: "A nine-metre corridor from the house door to the approach. Each column is cut to a pinned profile so the rise stays walkable.",
    siteId: M002_PATH_SITE_ID,
    kind: "path",
    rect: pathRect,
    floorY: 12,
    rules: PATH_RULES,
    cost: pathCost(pathRect.x1 - pathRect.x0 + 1),
    prep: {
      targets: pathTargets,
      surfaceMaterial: MAT.GRAVEL,
      envelope: [M002_LAYOUT.envelope[1]]
    }
  },
  {
    id: "farm",
    name: "Terraced field",
    subtitle: "12 x 8 m \xB7 three bands",
    description: "Three soil terraces stepping down the slope, held by stone retaining walls. The blossom tree on the field is cleared during preparation.",
    siteId: M002_LAYOUT.farm.id,
    kind: "terrace",
    rect: M002_LAYOUT.farm.rect,
    floorY: 15,
    rules: FARM_RULES,
    cost: { ...TERRACE_COST },
    terraces: M002_LAYOUT.farm.terraces,
    prep: {
      targets: farmTargets,
      surfaceMaterial: MAT.SOIL,
      envelope: [M002_LAYOUT.envelope[2]]
    },
    ghostBands: M002_TERRACE_BANDS
  }
];
function projectById(id2) {
  const project = M2_PROJECTS.find((p) => p.id === id2);
  if (!project) throw new Error(`unknown M002 project: ${id2}`);
  return project;
}
function projectSiteProposal(project) {
  return {
    siteId: project.siteId,
    rect: project.rect,
    floorY: project.floorY,
    rules: project.rules
  };
}
function projectStructureProposal(project, designVersion) {
  return {
    siteId: project.siteId,
    kind: project.kind,
    rect: project.rect,
    floorY: project.floorY,
    door: project.door,
    approach: project.approach,
    terraces: project.terraces,
    ...designVersion === void 0 ? {} : { designVersion }
  };
}
function isProjectBuilt(world, project) {
  for (const structure of world.structures.values()) {
    if (structure.siteId === project.siteId && structure.kind === project.kind) return true;
  }
  return false;
}
function missingResources(world, project) {
  const missing = [];
  for (const [resource, amount] of Object.entries(project.cost)) {
    const need = amount ?? 0;
    const have = world.inventory[resource] ?? 0;
    if (have < need) missing.push({ resource, need, have });
  }
  return missing;
}
function buildProject(world, prepAuthorizer, structureAuthorizer, project, designVersion) {
  if (isProjectBuilt(world, project)) {
    return {
      ok: false,
      project,
      stage: "precheck",
      code: "already_built",
      reasons: [`${project.name} is already built`],
      structureFailureRetained: false,
      retryable: true
    };
  }
  const missing = missingResources(world, project);
  if (missing.length > 0) {
    return {
      ok: false,
      project,
      stage: "precheck",
      code: "insufficient_resources",
      reasons: missing.map((m) => `need ${m.need} ${m.resource}, have ${m.have}`),
      structureFailureRetained: false,
      retryable: true
    };
  }
  const before = createWorldSnapshot(world, 0);
  const prepared = prepareSite(world, prepAuthorizer, projectSiteProposal(project), project.prep);
  if (!prepared.ok) {
    restoreWorldSnapshot(world, before);
    return {
      ok: false,
      project,
      stage: "prepare",
      code: prepared.code,
      reasons: [...prepared.reasons, "No preparation, resource or entity changes were retained."],
      structureFailureRetained: false,
      retryable: true
    };
  }
  const built = buildStructure(world, structureAuthorizer, projectStructureProposal(project, designVersion));
  if (!built.ok) {
    restoreWorldSnapshot(world, before);
    return {
      ok: false,
      project,
      stage: "structure",
      code: built.code,
      reasons: [
        ...built.reasons,
        "All preparation, resource and entity changes were rolled back; the build can be retried."
      ],
      structureFailureRetained: false,
      retryable: true
    };
  }
  const record = world.structures.get(built.ledger.structureId);
  if (!record) {
    restoreWorldSnapshot(world, before);
    return {
      ok: false,
      project,
      stage: "structure",
      code: "missing_record",
      reasons: [
        "structure ledger was written but the world has no record",
        "All preparation, resource and entity changes were rolled back; the build can be retried."
      ],
      structureFailureRetained: false,
      retryable: true
    };
  }
  return {
    ok: true,
    project,
    preparation: prepared.ledger,
    structure: built.ledger,
    record
  };
}

// src/app/session.ts
var JOURNAL_SCHEMA = 1;
var DESIGN_JOURNAL_SCHEMA = 2;
var CURRENT_JOURNAL_SCHEMA = 3;
var MAX_JOURNAL_ENTRIES = 1e5;
function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function uint2(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function id(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:%-]{0,127}$/.test(value);
}
function entityId2(value) {
  return typeof value === "string" && value.length <= 128 && (/^e:\d+,\d+:\d+$/.test(value) || /^hero:styl_[a-z_]+:-?\d+:-?\d+$/.test(value));
}
function sameFields(a, b) {
  if (object(a) && object(b)) {
    const aKeys = Object.keys(a).sort(), bKeys = Object.keys(b).sort();
    return JSON.stringify(aKeys) === JSON.stringify(bKeys) && aKeys.every((key) => sameFields(a[key], b[key]));
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
function inventory(value) {
  if (!object(value)) throw new Error("invalid resource record");
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (!LIFE_RESOURCES.includes(key) || !uint2(value[key]) || value[key] <= 0 || value[key] > 1e9) {
      throw new Error("invalid resource record");
    }
    result[key] = value[key];
  }
  return result;
}
function validateCommand(value) {
  if (!object(value) || value.schema !== JOURNAL_SCHEMA && value.schema !== DESIGN_JOURNAL_SCHEMA && value.schema !== CURRENT_JOURNAL_SCHEMA || !id(value.id) || !uint2(value.expectedRevision)) throw new Error("invalid command envelope");
  if (value.type === "build" && ["house", "path", "farm"].includes(String(value.projectId))) {
    const command2 = value.schema !== JOURNAL_SCHEMA ? {
      schema: value.schema,
      id: value.id,
      type: "build",
      projectId: value.projectId,
      expectedRevision: value.expectedRevision,
      designVersion: value.designVersion
    } : {
      schema: JOURNAL_SCHEMA,
      id: value.id,
      type: "build",
      projectId: value.projectId,
      expectedRevision: value.expectedRevision
    };
    if (command2.schema !== JOURNAL_SCHEMA && command2.designVersion !== FOUNDER_DESIGN_VERSION) {
      throw new Error("unsupported structure design");
    }
    if (!sameFields(command2, value)) throw new Error("non-canonical build command");
    return command2;
  }
  if (value.type === "harvest" && value.schema === JOURNAL_SCHEMA && entityId2(value.entityId)) {
    const command2 = {
      schema: value.schema,
      id: value.id,
      type: "harvest",
      entityId: value.entityId,
      expectedRevision: value.expectedRevision
    };
    if (!sameFields(command2, value)) throw new Error("non-canonical harvest command");
    return command2;
  }
  if (value.schema === CURRENT_JOURNAL_SCHEMA) {
    const base = { schema: value.schema, id: value.id, expectedRevision: value.expectedRevision };
    let command2 = null;
    if (value.type === "harvest" && entityId2(value.entityId)) {
      command2 = {
        schema: value.schema,
        id: value.id,
        type: value.type,
        entityId: value.entityId,
        expectedRevision: value.expectedRevision
      };
    } else if ((value.type === "deposit" || value.type === "withdraw") && value.stockpileId === FOUNDER_STOCKPILE_ID) {
      command2 = { ...base, type: value.type, stockpileId: value.stockpileId, resources: inventory(value.resources) };
    } else if (value.type === "produce" && value.stockpileId === FOUNDER_STOCKPILE_ID && (value.recipe === "seed" || value.recipe === "rations")) {
      command2 = { ...base, type: value.type, stockpileId: value.stockpileId, recipe: value.recipe };
    } else if (value.type === "tick" && uint2(value.ticks) && value.ticks > 0 && value.ticks <= MAX_TICKS_PER_COMMAND) {
      command2 = { ...base, type: value.type, ticks: value.ticks };
    } else if (value.type === "plant" && typeof value.plotId === "string" && /^crop:[0-8]$/.test(value.plotId)) {
      command2 = { ...base, type: value.type, plotId: value.plotId };
    } else if (value.type === "harvest_crop" && typeof value.plotId === "string" && /^crop:[0-8]$/.test(value.plotId)) {
      command2 = { ...base, type: value.type, plotId: value.plotId };
    }
    if (command2) {
      if (!sameFields(command2, value)) throw new Error("non-canonical life-loop command");
      return command2;
    }
  }
  throw new Error("unsupported command");
}
function validateOutcome(value) {
  if (!object(value)) throw new Error("invalid command outcome");
  if (value.type === "build" && id(value.structureId)) {
    const outcome2 = {
      type: "build",
      structureId: value.structureId,
      costPaid: inventory(value.costPaid),
      resourcesGained: inventory(value.resourcesGained)
    };
    if (JSON.stringify(outcome2) !== JSON.stringify(value)) throw new Error("non-canonical build outcome");
    return outcome2;
  }
  if (value.type === "harvest" && entityId2(value.entityId) && ["wood", "stone", "ore", "fiber"].includes(String(value.resource)) && uint2(value.amount) && value.amount > 0 && value.amount <= 1e6) {
    const outcome2 = {
      type: "harvest",
      entityId: value.entityId,
      resource: value.resource,
      amount: value.amount
    };
    if (JSON.stringify(outcome2) !== JSON.stringify(value)) throw new Error("non-canonical harvest outcome");
    return outcome2;
  }
  let outcome = null;
  if ((value.type === "deposit" || value.type === "withdraw") && value.stockpileId === FOUNDER_STOCKPILE_ID) {
    outcome = { type: value.type, stockpileId: value.stockpileId, resources: inventory(value.resources) };
  } else if (value.type === "produce" && id(value.jobId) && value.stockpileId === FOUNDER_STOCKPILE_ID && (value.recipe === "seed" || value.recipe === "rations") && uint2(value.remainingTicks) && value.remainingTicks > 0) {
    outcome = {
      type: value.type,
      jobId: value.jobId,
      stockpileId: value.stockpileId,
      recipe: value.recipe,
      remainingTicks: value.remainingTicks
    };
  } else if (value.type === "plant" && typeof value.plotId === "string" && /^crop:[0-8]$/.test(value.plotId) && uint2(value.plantedTick) && value.growthTicks === CROP_GROWTH_TICKS) {
    outcome = { type: value.type, plotId: value.plotId, plantedTick: value.plantedTick, growthTicks: value.growthTicks };
  } else if (value.type === "harvest_crop" && typeof value.plotId === "string" && /^crop:[0-8]$/.test(value.plotId) && isResources(value.resources) && value.resources.food === CROP_YIELD.food && value.resources.fiber === CROP_YIELD.fiber) {
    outcome = {
      type: value.type,
      plotId: value.plotId,
      resources: { food: CROP_YIELD.food, fiber: CROP_YIELD.fiber }
    };
  } else if (value.type === "tick" && uint2(value.fromTick) && uint2(value.toTick) && value.toTick > value.fromTick && value.toTick - value.fromTick <= MAX_TICKS_PER_COMMAND && Array.isArray(value.completedJobs) && Array.isArray(value.readyCrops)) {
    const completedJobs = value.completedJobs.map((raw) => {
      if (!object(raw) || !id(raw.id) || raw.recipe !== "seed" && raw.recipe !== "rations") throw new Error("invalid completed job");
      return { id: raw.id, recipe: raw.recipe, output: inventory(raw.output) };
    });
    if (!value.readyCrops.every((plot) => typeof plot === "string" && /^crop:[0-8]$/.test(plot))) throw new Error("invalid ready crops");
    outcome = {
      type: value.type,
      fromTick: value.fromTick,
      toTick: value.toTick,
      completedJobs,
      readyCrops: [...value.readyCrops]
    };
  }
  if (outcome) {
    if (JSON.stringify(outcome) !== JSON.stringify(value)) throw new Error("non-canonical life-loop outcome");
    return outcome;
  }
  throw new Error("invalid command outcome");
}
function isResources(value) {
  return object(value) && Object.values(value).every((amount) => uint2(amount));
}
function createJournal(seed = 1337, schema = CURRENT_JOURNAL_SCHEMA, generatorVersion = GENERATOR_VERSION) {
  if (generatorVersion !== GENERATOR_VERSION && schema !== CURRENT_JOURNAL_SCHEMA) {
    throw new Error("legacy journal schemas only exist for generator v1");
  }
  return {
    schema,
    seed,
    ...generatorVersion === GENERATOR_V2 ? { generatorVersion: GENERATOR_V2 } : {},
    starterInventory: inventory(M002_STARTER_INVENTORY),
    entries: []
  };
}
function journalGenerator(journal) {
  return journal.generatorVersion ?? GENERATOR_VERSION;
}
function validateJournal(value) {
  if (!object(value) || value.schema !== JOURNAL_SCHEMA && value.schema !== DESIGN_JOURNAL_SCHEMA && value.schema !== CURRENT_JOURNAL_SCHEMA || !uint2(value.seed) || value.seed > 4294967295 || !Array.isArray(value.entries) || value.entries.length > MAX_JOURNAL_ENTRIES || "generatorVersion" in value && (value.generatorVersion !== GENERATOR_V2 || value.schema !== CURRENT_JOURNAL_SCHEMA)) {
    throw new Error("invalid command journal");
  }
  const journal = {
    schema: value.schema,
    seed: value.seed,
    ..."generatorVersion" in value ? { generatorVersion: GENERATOR_V2 } : {},
    starterInventory: inventory(value.starterInventory),
    entries: []
  };
  const ids = /* @__PURE__ */ new Set();
  for (let i = 0; i < value.entries.length; i++) {
    const raw = value.entries[i];
    if (!object(raw) || raw.sequence !== i || !uint2(raw.revision) || typeof raw.hash !== "string" || !/^[0-9a-f]{16}$/.test(raw.hash)) throw new Error("non-contiguous or invalid journal entry");
    const entry = {
      command: validateCommand(raw.command),
      sequence: i,
      revision: raw.revision,
      hash: raw.hash,
      outcome: validateOutcome(raw.outcome)
    };
    if ((entry.command.type === "build" || entry.command.type === "harvest") && entry.command.schema !== value.schema) {
      throw new Error("journal schema and build command schema differ");
    }
    if (JSON.stringify(entry) !== JSON.stringify(raw)) throw new Error("non-canonical journal entry");
    if (ids.has(entry.command.id)) throw new Error("duplicate journal command id");
    if (entry.command.type !== entry.outcome.type || entry.command.type === "harvest" && entry.outcome.type === "harvest" && entry.command.entityId !== entry.outcome.entityId || (entry.command.type === "plant" || entry.command.type === "harvest_crop") && entry.command.type === entry.outcome.type && entry.command.plotId !== entry.outcome.plotId || (entry.command.type === "deposit" || entry.command.type === "withdraw") && entry.command.type === entry.outcome.type && (entry.command.stockpileId !== entry.outcome.stockpileId || JSON.stringify(entry.command.resources) !== JSON.stringify(entry.outcome.resources)) || entry.command.type === "produce" && entry.outcome.type === "produce" && (entry.command.stockpileId !== entry.outcome.stockpileId || entry.command.recipe !== entry.outcome.recipe) || entry.command.type === "tick" && entry.outcome.type === "tick" && entry.outcome.toTick - entry.outcome.fromTick !== entry.command.ticks) {
      throw new Error("journal command and outcome disagree");
    }
    ids.add(entry.command.id);
    journal.entries.push(entry);
  }
  if (JSON.stringify(journal) !== JSON.stringify(value)) throw new Error("non-canonical command journal");
  if (JSON.stringify(journal.starterInventory) !== JSON.stringify(createJournal(value.seed, value.schema, journalGenerator(journal)).starterInventory)) {
    throw new Error("journal starter inventory is incompatible with this version");
  }
  return journal;
}
function referencesRetiredStone(entry) {
  return /^hero:styl_rock_(?:small|medium|large):/.test(
    entry.command.type === "harvest" ? entry.command.entityId : entry.outcome.type === "harvest" ? entry.outcome.entityId : ""
  );
}
var GameSession = class _GameSession {
  constructor(world, journal) {
    this.world = world;
    this.journal = journal;
    for (const entry of journal.entries) this.ids.set(entry.command.id, entry);
    this.prepAuthorizer = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
    this.structureAuthorizer = new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope });
  }
  world;
  journal;
  prepAuthorizer;
  structureAuthorizer;
  ids = /* @__PURE__ */ new Map();
  /** A new current-schema world. `generatorVersion` defaults to v1 for API compatibility. */
  static genesis(seed = 1337, generatorVersion = GENERATOR_VERSION) {
    return new _GameSession(
      genesisWorld(seed, inventory(M002_STARTER_INVENTORY), CURRENT_JOURNAL_SCHEMA, generatorVersion),
      createJournal(seed, CURRENT_JOURNAL_SCHEMA, generatorVersion)
    );
  }
  /** Compatibility entry point for recorded M002 fixtures and saved worlds. */
  static legacyGenesis(seed = 1337, schema = JOURNAL_SCHEMA) {
    return new _GameSession(genesisWorld(seed, inventory(M002_STARTER_INVENTORY), schema), createJournal(seed, schema));
  }
  /** Replay accepted commands in their authoritative order from an empty world.
   * A normal replay is attempted first: stone from retained cairns and building
   * preparation must not force historical mode. Raw old journals enter private
   * reconstruction only when their original stone obstructions required it. */
  static replay(input) {
    const journal = validateJournal(input);
    try {
      return _GameSession.replayCurrent(journal);
    } catch (currentError) {
      if (!journal.entries.some(containsRetiredStone)) throw currentError;
      try {
        return _GameSession.reconstructHistorical(journal).session;
      } catch (historicalError) {
        try {
          return _GameSession.replayCurrent(journal);
        } catch {
          throw historicalError;
        }
      }
    }
  }
  /** Restore a validated snapshot, then replay only its accepted-command tail. */
  static restore(snapshotInput, journalInput) {
    const journal = validateJournal(journalInput);
    const snapshot = validateWorldSnapshot(snapshotInput);
    if (snapshot.schema !== journal.schema) throw new Error("snapshot and journal schemas differ");
    const next = snapshot.nextSequence;
    if (next > journal.entries.length) throw new Error("snapshot is ahead of the journal");
    if (!snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind))) {
      try {
        return _GameSession.restoreCurrent(snapshot, journal, next);
      } catch {
      }
    }
    if (next > 0 || snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind))) {
      const historical2 = journal.entries.some(referencesRetiredStone) || snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind));
      if (!snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind))) {
        try {
          return _GameSession.restoreCurrent(snapshot, journal, next);
        } catch {
        }
      }
      if (historical2) {
        const reconstructed = _GameSession.reconstructHistorical(journal);
        const expected = reconstructed.snapshots.get(next);
        const migrated = expected ? migrateStoneSnapshot(expected) : void 0;
        if (migrated && legacyStoneHash(snapshot) === legacyStoneHash(migrated))
          return reconstructed.session;
        if (snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind)) && expected && legacyStoneHash(snapshot) === legacyStoneHash(expected))
          return reconstructed.session;
        if (snapshot.entities.some((entity) => isRetiredStoneKind(entity.kind))) {
          throw new Error("historical snapshot does not match its original journal boundary");
        }
      }
    }
    if (next > 0) return _GameSession.restoreCurrent(snapshot, journal, next);
    const historical = journal.entries.some(containsRetiredStone);
    if (historical) {
      try {
        return _GameSession.restoreCurrent(snapshot, journal, next);
      } catch {
      }
      const reconstructed = _GameSession.reconstructHistorical(journal);
      const rawGenesis = reconstructed.snapshots.get(0);
      if (legacyStoneHash(snapshot) === legacyStoneHash(rawGenesis)) return reconstructed.session;
    }
    return _GameSession.restoreCurrent(snapshot, journal, next);
  }
  /** Replay already-authenticated current-state commands. */
  static replayCurrent(journal) {
    const session = new _GameSession(
      genesisWorld(journal.seed, journal.starterInventory, journal.schema, journalGenerator(journal)),
      createJournal(journal.seed, journal.schema, journalGenerator(journal))
    );
    for (const entry of journal.entries) session.replayEntry(entry);
    return session;
  }
  static restoreCurrent(snapshot, journal, next) {
    const world = worldFromSnapshot(snapshot);
    if (world.seed !== journal.seed) throw new Error("snapshot and journal seeds differ");
    if (world.params.generatorVersion !== journalGenerator(journal)) {
      throw new Error("snapshot and journal terrain generators differ");
    }
    const genesis = genesisWorld(journal.seed, journal.starterInventory, journal.schema, journalGenerator(journal));
    if (next === 0 && legacyStoneHash(snapshot) !== canonicalWorldHash(genesis, 0, journal.schema)) {
      throw new Error("genesis snapshot does not match journal configuration");
    }
    if (next > 0 && legacyStoneHash(snapshot) !== journal.entries[next - 1].hash) {
      throw new Error("snapshot hash does not match its journal boundary");
    }
    const session = _GameSession.fromValidatedBoundary(world, {
      schema: journal.schema,
      seed: journal.seed,
      ...journal.generatorVersion ? { generatorVersion: journal.generatorVersion } : {},
      starterInventory: { ...journal.starterInventory },
      entries: journal.entries.slice(0, next)
    });
    for (const entry of journal.entries.slice(next)) session.replayEntry(entry);
    return session;
  }
  /** @internal Assemble an authenticated save boundary; gameplay uses dispatch. */
  static fromValidatedBoundary(world, journal) {
    return new _GameSession(world, journal);
  }
  /** @internal Source for deterministic old-save fixtures; not a live session. */
  static historicalJournal(world) {
    return new _GameSession(world, createJournal(world.seed, world.life ? CURRENT_JOURNAL_SCHEMA : world.structures.size > 0 ? DESIGN_JOURNAL_SCHEMA : JOURNAL_SCHEMA));
  }
  /** @internal Source for deterministic old-save fixtures; not a live session. */
  static historicalGenesisWorld(seed = 1337, schema = JOURNAL_SCHEMA) {
    return historicalGenesisWorld(seed, inventory(M002_STARTER_INVENTORY), schema);
  }
  static reconstructHistorical(journal) {
    const expectedGenesis = historicalGenesisWorld(journal.seed, journal.starterInventory, journal.schema);
    const snapshots = /* @__PURE__ */ new Map();
    snapshots.set(0, createWorldSnapshot(expectedGenesis, 0, journal.schema));
    const replay = new _GameSession(expectedGenesis, createJournal(journal.seed, journal.schema));
    const migratedJournal = createJournal(journal.seed, journal.schema);
    for (const entry of journal.entries) {
      replay.replayEntry(entry);
      const snapshot = createWorldSnapshot(replay.world, replay.nextSequence, journal.schema);
      snapshots.set(replay.nextSequence, snapshot);
      entry.hash = legacyStoneHash(migrateStoneSnapshot(snapshot));
      migratedJournal.entries.push(entry);
    }
    const session = _GameSession.fromValidatedBoundary(replay.world, migratedJournal);
    return { session: session.migrateRetiredStones(), snapshots };
  }
  snapshotSchema() {
    return this.journal.schema;
  }
  get nextSequence() {
    return this.journal.entries.length;
  }
  get snapshot() {
    return createWorldSnapshot(this.world, this.nextSequence, this.snapshotSchema());
  }
  get stateHash() {
    return canonicalWorldHash(this.world, this.nextSequence, this.snapshotSchema());
  }
  commandId(kind, target) {
    return `${kind}:${this.nextSequence}:${encodeURIComponent(target)}`;
  }
  entry(sequence) {
    return this.journal.entries[sequence];
  }
  dispatch(input) {
    let command2;
    try {
      command2 = validateCommand(input);
    } catch (error2) {
      return this.reject(
        object(input) && typeof input.id === "string" ? input.id : "",
        "invalid_command",
        [error2.message]
      );
    }
    if ((command2.type === "build" || command2.type === "harvest") && command2.schema !== this.journal.schema || command2.type !== "build" && command2.type !== "harvest" && this.journal.schema !== CURRENT_JOURNAL_SCHEMA) {
      return this.reject(command2.id, "schema_mismatch", ["command schema does not match this world journal"]);
    }
    const prior = this.ids.get(command2.id);
    if (prior) {
      if (!sameFields(prior.command, command2)) {
        return this.reject(command2.id, "duplicate_command_id", ["command id already has different accepted input"]);
      }
      return this.receipt(prior, true);
    }
    if (command2.expectedRevision !== this.world.revision) {
      return this.reject(command2.id, "stale_revision", [
        `command expects revision ${command2.expectedRevision}; world is at ${this.world.revision}`
      ]);
    }
    const before = this.stateHash;
    let outcome;
    if (command2.type === "build") {
      const result = buildProject(
        this.world,
        this.prepAuthorizer,
        this.structureAuthorizer,
        projectById(command2.projectId),
        "designVersion" in command2 ? command2.designVersion : void 0
      );
      if (!result.ok) {
        if (this.stateHash !== before) throw new Error("rejected build changed authoritative state");
        return this.reject(command2.id, result.code, result.reasons);
      }
      outcome = {
        type: "build",
        structureId: result.record.id,
        costPaid: inventory(result.structure.costPaid),
        resourcesGained: inventory(result.preparation.resourcesGained)
      };
    } else if (command2.type === "harvest") {
      const result = harvestEntity(this.world, command2.entityId);
      if (!result) return this.reject(command2.id, "not_harvestable", ["entity is absent, depleted or has no resource"]);
      outcome = {
        type: "harvest",
        entityId: result.entity.id,
        resource: result.resource,
        amount: result.amount
      };
    } else if (command2.type === "deposit" || command2.type === "withdraw") {
      const result = transfer(this.world, command2.type, command2.resources);
      if (!result.ok) {
        if (this.stateHash !== before) throw new Error("rejected transfer changed authoritative state");
        return this.reject(command2.id, result.code, result.reasons);
      }
      outcome = { type: command2.type, stockpileId: FOUNDER_STOCKPILE_ID, resources: result.value };
    } else if (command2.type === "produce") {
      const result = startProduction(this.world, command2.recipe, command2.id);
      if (!result.ok) return this.reject(command2.id, result.code, result.reasons);
      outcome = {
        type: "produce",
        jobId: result.value.id,
        stockpileId: result.value.stockpileId,
        recipe: result.value.recipe,
        remainingTicks: result.value.remainingTicks
      };
    } else if (command2.type === "tick") {
      const result = advanceTicks(this.world, command2.ticks);
      if (!result.ok) return this.reject(command2.id, result.code, result.reasons);
      outcome = { type: "tick", ...result.value };
    } else if (command2.type === "plant") {
      const result = plantCrop(this.world, command2.plotId);
      if (!result.ok) return this.reject(command2.id, result.code, result.reasons);
      outcome = {
        type: "plant",
        plotId: command2.plotId,
        plantedTick: result.value.plantedTick,
        growthTicks: result.value.growthTicks
      };
    } else if (command2.type === "harvest_crop") {
      const result = harvestCrop(this.world, command2.plotId);
      if (!result.ok) return this.reject(command2.id, result.code, result.reasons);
      outcome = { type: "harvest_crop", plotId: command2.plotId, resources: result.value };
    } else {
      throw new Error("unhandled command type");
    }
    const entry = {
      command: command2,
      sequence: this.nextSequence,
      revision: this.world.revision,
      // The sequence is part of the state hash at this accepted boundary.
      hash: canonicalWorldHash(this.world, this.nextSequence + 1, this.snapshotSchema()),
      outcome
    };
    this.journal.entries.push(entry);
    this.ids.set(command2.id, entry);
    return this.receipt(entry, false);
  }
  replayEntry(entry) {
    if (entry.sequence !== this.nextSequence) throw new Error("journal sequence gap");
    const receipt = this.dispatch(entry.command);
    if (!receipt.ok || receipt.duplicate || receipt.hash !== entry.hash || receipt.revision !== entry.revision || JSON.stringify(receipt.outcome) !== JSON.stringify(entry.outcome)) {
      throw new Error(`journal replay diverged at sequence ${entry.sequence}`);
    }
  }
  /** Historical entries have passed their original outcome/hash checks. Their
   * accepted commands and stone yields remain; only entity existence and the
   * resulting canonical boundary hashes change. */
  migrateRetiredStones() {
    retireStoneEntities(this.world);
    finishStoneReplay(this.world);
    const migrated = createWorldSnapshot(this.world, this.nextSequence, this.snapshotSchema());
    restoreWorldSnapshotExact(this.world, migrated);
    return this;
  }
  receipt(entry, duplicate) {
    return {
      ok: true,
      duplicate,
      id: entry.command.id,
      sequence: entry.sequence,
      revision: entry.revision,
      hash: entry.hash,
      outcome: entry.outcome
    };
  }
  reject(id2, code, reasons) {
    return { ok: false, duplicate: false, id: id2, code, reasons };
  }
};
function genesisWorld(seed, starter = inventory(M002_STARTER_INVENTORY), schema = CURRENT_JOURNAL_SCHEMA, generatorVersion = GENERATOR_VERSION) {
  const world = generateWorld(seed, 0, generatorVersion);
  world.inventory = { ...starter };
  if (schema === CURRENT_JOURNAL_SCHEMA) world.life = createLifeState();
  return world;
}
function historicalGenesisWorld(seed, starter, schema) {
  const world = createWorld(seed);
  enableStoneReplay(world);
  placeAuthoredSites(world);
  world.inventory = { ...starter };
  if (schema === CURRENT_JOURNAL_SCHEMA) world.life = createLifeState();
  return world;
}
function containsRetiredStone(entry) {
  if (entry.command.type === "harvest") {
    return entry.outcome.type === "harvest" && (entry.outcome.resource === "stone" || /^hero:styl_rock_(?:small|medium|large):/.test(entry.command.entityId));
  }
  return entry.outcome.type === "build" && (entry.outcome.resourcesGained.stone ?? 0) > 0;
}

// tests/m002.journal.test.ts
function command(session, id2, projectId) {
  return { schema: 1, id: id2, type: "build", projectId, expectedRevision: session.world.revision };
}
function harvest(session, id2, entityId3) {
  return { schema: 1, id: id2, type: "harvest", entityId: entityId3, expectedRevision: session.world.revision };
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
test("accepted build commands replay deterministically from genesis with stable receipts", () => {
  const live = GameSession.legacyGenesis();
  for (const projectId of ["house", "path", "farm"]) {
    const receipt = live.dispatch(command(live, `build-${projectId}`, projectId));
    assert.equal(receipt.ok, true);
    assert.equal(receipt.duplicate, false);
  }
  const replayed = GameSession.replay(clone(live.journal));
  assert.equal(replayed.stateHash, live.stateHash);
  assert.equal(
    canonicalRegionHash(replayed.world, M002_LAYOUT.protectedRegion).hash,
    canonicalRegionHash(live.world, M002_LAYOUT.protectedRegion).hash
  );
  assert.equal(canonicalEntityHash(replayed.world), canonicalEntityHash(live.world));
  assert.equal(JSON.stringify(replayed.snapshot), JSON.stringify(live.snapshot));
  assert.equal(JSON.stringify(replayed.journal), JSON.stringify(live.journal));
});
test("duplicate accepted command is idempotent but cannot be reused for different work", () => {
  const session = GameSession.legacyGenesis();
  const input = command(session, "stable-id", "house");
  const first = session.dispatch(input);
  assert.equal(first.ok, true);
  const before = session.stateHash;
  const duplicate = session.dispatch(clone(input));
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  const { duplicate: _firstDuplicate, ...firstResult } = first;
  const { duplicate: _secondDuplicate, ...duplicateResult } = duplicate;
  assert.deepEqual(duplicateResult, firstResult);
  assert.equal(session.nextSequence, 1);
  assert.equal(session.stateHash, before);
  const forged = { ...input, projectId: "path", expectedRevision: session.world.revision };
  const rejected = session.dispatch(forged);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.code, "duplicate_command_id");
  assert.equal(session.nextSequence, 1);
  assert.equal(session.stateHash, before);
});
test("invalid, stale, unaffordable and unknown commands never change world or history", () => {
  const session = GameSession.legacyGenesis();
  const before = session.stateHash;
  const attempts = [
    null,
    {},
    { schema: 1, id: "bad", type: "dig", expectedRevision: 0 },
    { ...command(session, "bad-extra", "house"), extra: true },
    { ...command(session, "bad-type", "house"), projectId: "other" },
    { ...command(session, "bad-id", "house"), id: "../rewrite" },
    { ...command(session, "bad-revision", "house"), expectedRevision: -1 },
    { ...command(session, "stale", "house"), expectedRevision: session.world.revision + 1 },
    harvest(session, "missing-entity", "e:0,0:999999")
  ];
  for (const attempt of attempts) {
    const result2 = session.dispatch(attempt);
    assert.equal(result2.ok, false);
    assert.equal(session.nextSequence, 0);
    assert.equal(session.stateHash, before);
  }
  session.world.inventory = {};
  const result = session.dispatch(command(session, "unaffordable", "house"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "insufficient_resources");
  assert.equal(session.nextSequence, 0);
  assert.equal(
    canonicalRegionHash(session.world, M002_LAYOUT.protectedRegion).hash,
    canonicalRegionHash(genesisWorld(), M002_LAYOUT.protectedRegion).hash
  );
});
test("snapshot-tail replay matches live state and refuses an incompatible boundary", () => {
  const live = GameSession.legacyGenesis();
  assert.equal(live.dispatch(command(live, "house-1", "house")).ok, true);
  const snapshot = live.snapshot;
  assert.equal(live.dispatch(command(live, "path-2", "path")).ok, true);
  assert.equal(live.dispatch(command(live, "farm-3", "farm")).ok, true);
  const restored = GameSession.restore(clone(snapshot), clone(live.journal));
  assert.equal(restored.stateHash, live.stateHash);
  assert.deepEqual(restored.snapshot, live.snapshot);
  assert.deepEqual(restored.journal, live.journal);
  const completeBoundary = GameSession.restore(clone(live.snapshot), clone(live.journal));
  assert.equal(completeBoundary.stateHash, live.stateHash);
  const mismatchedSnapshot = clone(live.snapshot);
  mismatchedSnapshot.inventory = { stone: 1, wood: 2 };
  assert.throws(() => GameSession.restore(mismatchedSnapshot, clone(live.journal)), /snapshot hash/);
  assert.throws(() => GameSession.restore({ ...snapshot, nextSequence: 99 }, clone(live.journal)), /ahead/);
  const wrong = clone(live.journal);
  wrong.starterInventory.wood = 23;
  assert.throws(() => GameSession.restore(live.snapshot, wrong));
  const truncated = clone(live.journal);
  truncated.entries.pop();
  assert.throws(() => GameSession.restore(live.snapshot, truncated), /ahead/);
});
test("browser-generated harvest IDs accept generated and authored entities and replay", () => {
  const session = GameSession.legacyGenesis();
  const generated = nearestHarvestable(session.world, -42, -40, 40, "wood");
  assert.equal(generated.id, "e:30,30:4");
  const targets = [generated.id, "hero:styl_shrub:-14:-8"];
  for (const entityId3 of targets) {
    const id2 = session.commandId("harvest", entityId3);
    assert.equal(id2, `harvest:${session.nextSequence}:${encodeURIComponent(entityId3)}`);
    const receipt = session.dispatch({
      schema: 1,
      id: id2,
      type: "harvest",
      entityId: entityId3,
      expectedRevision: session.world.revision
    });
    assert.equal(receipt.ok, true, JSON.stringify(receipt));
  }
  assert.equal(session.nextSequence, 2);
  assert.equal(GameSession.replay(clone(session.journal)).stateHash, session.stateHash);
});
test("harvest, eviction and regeneration survive snapshot and genesis replay", () => {
  const session = GameSession.legacyGenesis();
  const e = nearestHarvestable(session.world, -43, -40, 50, "wood");
  const original = { ...e };
  const receipt = session.dispatch(harvest(session, "harvest-0", e.id));
  assert.equal(receipt.ok, true);
  assert.equal(session.world.entities.get(e.id)?.harvestedOnce, true);
  assert.equal(
    session.world.entities.get(e.id)?.remaining,
    original.remaining - original.yieldPerHarvest
  );
  assert.equal(session.world.inventory.wood, 24 + original.yieldPerHarvest);
  assert.equal(evictChunk(session.world, e.chunk), true);
  assert.deepEqual(session.world.entities.get(e.id), session.world.entities.get(e.id));
  const [cx, cz] = e.chunk.split(",").map(Number);
  generateChunk(session.world, cx, cz);
  assert.equal(
    session.world.entities.get(e.id)?.remaining,
    original.remaining - original.yieldPerHarvest
  );
  const snapshot = session.snapshot;
  const tailReceipt = session.dispatch(command(session, "house-1", "house"));
  assert.equal(tailReceipt.ok, true);
  const fromTail = GameSession.restore(clone(snapshot), clone(session.journal));
  const fromGenesis = GameSession.replay(clone(session.journal));
  const finalSnapshot = clone(session.snapshot);
  const finalJournal = clone(session.journal);
  for (const restored of [fromTail, fromGenesis, GameSession.restore(finalSnapshot, finalJournal)]) {
    assert.equal(restored.stateHash, session.stateHash);
    assert.deepEqual(restored.world.entities.get(e.id), session.world.entities.get(e.id));
    assert.equal(restored.world.inventory.wood, session.world.inventory.wood);
    const second = restored.dispatch(harvest(restored, "replay-harvest-again", e.id));
    assert.equal(second.ok, original.remaining - original.yieldPerHarvest > 0 && !e.harvested);
    if (second.ok) assert.equal(
      restored.world.entities.get(e.id)?.harvested,
      original.remaining <= original.yieldPerHarvest * 2
    );
  }
});
test("snapshot validation is non-mutating and journal corruption is never replayed", () => {
  const live = GameSession.legacyGenesis();
  assert.equal(live.dispatch(command(live, "house", "house")).ok, true);
  const journal = clone(live.journal);
  const cases = [
    { ...journal, schema: 99 },
    { ...journal, entries: [{ ...journal.entries[0], sequence: 1 }] },
    { ...journal, entries: [{ ...journal.entries[0], hash: "0".repeat(16) }] },
    { ...journal, entries: [{ ...journal.entries[0], revision: 0 }] },
    { ...journal, entries: [{ ...journal.entries[0], outcome: { type: "harvest", entityId: "x", resource: "wood", amount: 1 } }] },
    { ...journal, entries: [...journal.entries, { ...journal.entries[0], sequence: 1 }] },
    { ...journal, seed: 1338 }
  ];
  for (const corrupt of cases) {
    assert.throws(() => GameSession.replay(corrupt));
  }
  const base = createWorldSnapshot(live.world, 1);
  const hash = canonicalWorldHash(live.world, 1);
  assert.throws(() => worldFromSnapshot({ ...base, schema: 99 }));
  assert.equal(canonicalWorldHash(live.world, 1), hash);
  assert.throws(() => GameSession.restore({ ...base, manifest: { ...base.manifest, seed: 1338 } }, journal));
  assert.equal(canonicalWorldHash(live.world, 1), hash);
});
test("the 2048 m world replays through the same bounded authority and preserves outside terrain", () => {
  const live = GameSession.legacyGenesis(1337);
  const before = canonicalRegionHash(live.world, M002_LAYOUT.protectedRegion, M002_LAYOUT.envelope).hash;
  for (const projectId of ["house", "path", "farm"]) {
    assert.equal(live.dispatch(command(live, projectId, projectId)).ok, true);
  }
  assert.equal(live.world.entities.size > 0, true);
  const replayed = GameSession.replay(clone(live.journal));
  assert.equal(replayed.stateHash, live.stateHash);
  assert.equal(
    canonicalRegionHash(replayed.world, M002_LAYOUT.protectedRegion, M002_LAYOUT.envelope).hash,
    before
  );
});
test("journal entries are bounded and rejected rather than partially accepted", () => {
  const journal = createJournal();
  assert.throws(() => validateJournal({ ...journal, starterInventory: { ...journal.starterInventory, wood: -1 } }));
  assert.throws(() => validateJournal({ ...journal, unknown: true }));
  assert.throws(() => validateJournal({ ...journal, starterInventory: { wood: 24, stone: 48, unknown: 2 } }));
  assert.throws(() => GameSession.restore({ ...genesisSnapshot(), nextSequence: -1 }, journal));
});
function genesisSnapshot() {
  return createWorldSnapshot(genesisWorld());
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMi5qb3VybmFsLnRlc3QudHMiLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS9ub2lzZS50cyIsICIuLi8uLi9zcmMvc2ltL2h5ZHJvbG9neS50cyIsICIuLi8uLi9zcmMvc2ltL21hdGVyaWFscy50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4tdjIudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3NpbS9jb25zdHJ1Y3Rpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9wcmVwYXJhdGlvbi50cyIsICIuLi8uLi9zcmMvc2ltL3N0cnVjdHVyZXMudHMiLCAiLi4vLi4vc3JjL3NpbS9jYW5vbmljYWwudHMiLCAiLi4vLi4vc3JjL3NpbS9tMDAyLnRzIiwgIi4uLy4uL3NyYy9zaW0vc2NlbmFyaW8udHMiLCAiLi4vLi4vc3JjL3NpbS9lY29ub215LnRzIiwgIi4uLy4uL3NyYy9zaW0vc25hcHNob3QudHMiLCAiLi4vLi4vc3JjL2FwcC9wcm9qZWN0cy50cyIsICIuLi8uLi9zcmMvYXBwL3Nlc3Npb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCB0ZXN0IGZyb20gJ25vZGU6dGVzdCc7XG5pbXBvcnQge1xuICBDb21tYW5kLCBDb21tYW5kSm91cm5hbCwgR2FtZVNlc3Npb24sIGNyZWF0ZUpvdXJuYWwsIGdlbmVzaXNXb3JsZCwgdmFsaWRhdGVKb3VybmFsLFxufSBmcm9tICcuLi9zcmMvYXBwL3Nlc3Npb24nO1xuaW1wb3J0IHtcbiAgY2Fub25pY2FsV29ybGRIYXNoLCBjcmVhdGVXb3JsZFNuYXBzaG90LCB3b3JsZEZyb21TbmFwc2hvdCxcbn0gZnJvbSAnLi4vc3JjL3NpbS9zbmFwc2hvdCc7XG5pbXBvcnQgeyBNMDAyX0xBWU9VVCB9IGZyb20gJy4uL3NyYy9zaW0vbTAwMic7XG5pbXBvcnQgeyBldmljdENodW5rLCBnZW5lcmF0ZUNodW5rLCBuZWFyZXN0SGFydmVzdGFibGUgfSBmcm9tICcuLi9zcmMvc2ltL3dvcmxkJztcbmltcG9ydCB7IGNhbm9uaWNhbEVudGl0eUhhc2gsIGNhbm9uaWNhbFJlZ2lvbkhhc2ggfSBmcm9tICcuLi9zcmMvc2ltL2Nhbm9uaWNhbCc7XG5cbmZ1bmN0aW9uIGNvbW1hbmQoc2Vzc2lvbjogR2FtZVNlc3Npb24sIGlkOiBzdHJpbmcsIHByb2plY3RJZDogJ2hvdXNlJyB8ICdwYXRoJyB8ICdmYXJtJyk6IENvbW1hbmQge1xuICByZXR1cm4geyBzY2hlbWE6IDEsIGlkLCB0eXBlOiAnYnVpbGQnLCBwcm9qZWN0SWQsIGV4cGVjdGVkUmV2aXNpb246IHNlc3Npb24ud29ybGQucmV2aXNpb24gfTtcbn1cbmZ1bmN0aW9uIGhhcnZlc3Qoc2Vzc2lvbjogR2FtZVNlc3Npb24sIGlkOiBzdHJpbmcsIGVudGl0eUlkOiBzdHJpbmcpOiBDb21tYW5kIHtcbiAgcmV0dXJuIHsgc2NoZW1hOiAxLCBpZCwgdHlwZTogJ2hhcnZlc3QnLCBlbnRpdHlJZCwgZXhwZWN0ZWRSZXZpc2lvbjogc2Vzc2lvbi53b3JsZC5yZXZpc2lvbiB9O1xufVxuZnVuY3Rpb24gY2xvbmU8VD4odmFsdWU6IFQpOiBUIHsgcmV0dXJuIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodmFsdWUpKTsgfVxuXG50ZXN0KCdhY2NlcHRlZCBidWlsZCBjb21tYW5kcyByZXBsYXkgZGV0ZXJtaW5pc3RpY2FsbHkgZnJvbSBnZW5lc2lzIHdpdGggc3RhYmxlIHJlY2VpcHRzJywgKCkgPT4ge1xuICBjb25zdCBsaXZlID0gR2FtZVNlc3Npb24ubGVnYWN5R2VuZXNpcygpO1xuICBmb3IgKGNvbnN0IHByb2plY3RJZCBvZiBbJ2hvdXNlJywgJ3BhdGgnLCAnZmFybSddIGFzIGNvbnN0KSB7XG4gICAgY29uc3QgcmVjZWlwdCA9IGxpdmUuZGlzcGF0Y2goY29tbWFuZChsaXZlLCBgYnVpbGQtJHtwcm9qZWN0SWR9YCwgcHJvamVjdElkKSk7XG4gICAgYXNzZXJ0LmVxdWFsKHJlY2VpcHQub2ssIHRydWUpO1xuICAgIGFzc2VydC5lcXVhbChyZWNlaXB0LmR1cGxpY2F0ZSwgZmFsc2UpO1xuICB9XG4gIGNvbnN0IHJlcGxheWVkID0gR2FtZVNlc3Npb24ucmVwbGF5KGNsb25lKGxpdmUuam91cm5hbCkpO1xuICBhc3NlcnQuZXF1YWwocmVwbGF5ZWQuc3RhdGVIYXNoLCBsaXZlLnN0YXRlSGFzaCk7XG4gIGFzc2VydC5lcXVhbChjYW5vbmljYWxSZWdpb25IYXNoKHJlcGxheWVkLndvcmxkLCBNMDAyX0xBWU9VVC5wcm90ZWN0ZWRSZWdpb24pLmhhc2gsXG4gICAgY2Fub25pY2FsUmVnaW9uSGFzaChsaXZlLndvcmxkLCBNMDAyX0xBWU9VVC5wcm90ZWN0ZWRSZWdpb24pLmhhc2gpO1xuICBhc3NlcnQuZXF1YWwoY2Fub25pY2FsRW50aXR5SGFzaChyZXBsYXllZC53b3JsZCksIGNhbm9uaWNhbEVudGl0eUhhc2gobGl2ZS53b3JsZCkpO1xuICBhc3NlcnQuZXF1YWwoSlNPTi5zdHJpbmdpZnkocmVwbGF5ZWQuc25hcHNob3QpLCBKU09OLnN0cmluZ2lmeShsaXZlLnNuYXBzaG90KSk7XG4gIGFzc2VydC5lcXVhbChKU09OLnN0cmluZ2lmeShyZXBsYXllZC5qb3VybmFsKSwgSlNPTi5zdHJpbmdpZnkobGl2ZS5qb3VybmFsKSk7XG59KTtcblxudGVzdCgnZHVwbGljYXRlIGFjY2VwdGVkIGNvbW1hbmQgaXMgaWRlbXBvdGVudCBidXQgY2Fubm90IGJlIHJldXNlZCBmb3IgZGlmZmVyZW50IHdvcmsnLCAoKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5sZWdhY3lHZW5lc2lzKCk7XG4gIGNvbnN0IGlucHV0ID0gY29tbWFuZChzZXNzaW9uLCAnc3RhYmxlLWlkJywgJ2hvdXNlJyk7XG4gIGNvbnN0IGZpcnN0ID0gc2Vzc2lvbi5kaXNwYXRjaChpbnB1dCk7XG4gIGFzc2VydC5lcXVhbChmaXJzdC5vaywgdHJ1ZSk7XG4gIGNvbnN0IGJlZm9yZSA9IHNlc3Npb24uc3RhdGVIYXNoO1xuICBjb25zdCBkdXBsaWNhdGUgPSBzZXNzaW9uLmRpc3BhdGNoKGNsb25lKGlucHV0KSk7XG4gIGFzc2VydC5lcXVhbChkdXBsaWNhdGUub2ssIHRydWUpO1xuICBhc3NlcnQuZXF1YWwoZHVwbGljYXRlLmR1cGxpY2F0ZSwgdHJ1ZSk7XG4gIGNvbnN0IHsgZHVwbGljYXRlOiBfZmlyc3REdXBsaWNhdGUsIC4uLmZpcnN0UmVzdWx0IH0gPSBmaXJzdDtcbiAgY29uc3QgeyBkdXBsaWNhdGU6IF9zZWNvbmREdXBsaWNhdGUsIC4uLmR1cGxpY2F0ZVJlc3VsdCB9ID0gZHVwbGljYXRlO1xuICBhc3NlcnQuZGVlcEVxdWFsKGR1cGxpY2F0ZVJlc3VsdCwgZmlyc3RSZXN1bHQpO1xuICBhc3NlcnQuZXF1YWwoc2Vzc2lvbi5uZXh0U2VxdWVuY2UsIDEpO1xuICBhc3NlcnQuZXF1YWwoc2Vzc2lvbi5zdGF0ZUhhc2gsIGJlZm9yZSk7XG4gIGNvbnN0IGZvcmdlZCA9IHsgLi4uaW5wdXQsIHByb2plY3RJZDogJ3BhdGgnLCBleHBlY3RlZFJldmlzaW9uOiBzZXNzaW9uLndvcmxkLnJldmlzaW9uIH07XG4gIGNvbnN0IHJlamVjdGVkID0gc2Vzc2lvbi5kaXNwYXRjaChmb3JnZWQpO1xuICBhc3NlcnQuZXF1YWwocmVqZWN0ZWQub2ssIGZhbHNlKTtcbiAgaWYgKCFyZWplY3RlZC5vaykgYXNzZXJ0LmVxdWFsKHJlamVjdGVkLmNvZGUsICdkdXBsaWNhdGVfY29tbWFuZF9pZCcpO1xuICBhc3NlcnQuZXF1YWwoc2Vzc2lvbi5uZXh0U2VxdWVuY2UsIDEpO1xuICBhc3NlcnQuZXF1YWwoc2Vzc2lvbi5zdGF0ZUhhc2gsIGJlZm9yZSk7XG59KTtcblxudGVzdCgnaW52YWxpZCwgc3RhbGUsIHVuYWZmb3JkYWJsZSBhbmQgdW5rbm93biBjb21tYW5kcyBuZXZlciBjaGFuZ2Ugd29ybGQgb3IgaGlzdG9yeScsICgpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IEdhbWVTZXNzaW9uLmxlZ2FjeUdlbmVzaXMoKTtcbiAgY29uc3QgYmVmb3JlID0gc2Vzc2lvbi5zdGF0ZUhhc2g7XG4gIGNvbnN0IGF0dGVtcHRzOiB1bmtub3duW10gPSBbXG4gICAgbnVsbCwge30sIHsgc2NoZW1hOiAxLCBpZDogJ2JhZCcsIHR5cGU6ICdkaWcnLCBleHBlY3RlZFJldmlzaW9uOiAwIH0sXG4gICAgeyAuLi5jb21tYW5kKHNlc3Npb24sICdiYWQtZXh0cmEnLCAnaG91c2UnKSwgZXh0cmE6IHRydWUgfSxcbiAgICB7IC4uLmNvbW1hbmQoc2Vzc2lvbiwgJ2JhZC10eXBlJywgJ2hvdXNlJyksIHByb2plY3RJZDogJ290aGVyJyB9LFxuICAgIHsgLi4uY29tbWFuZChzZXNzaW9uLCAnYmFkLWlkJywgJ2hvdXNlJyksIGlkOiAnLi4vcmV3cml0ZScgfSxcbiAgICB7IC4uLmNvbW1hbmQoc2Vzc2lvbiwgJ2JhZC1yZXZpc2lvbicsICdob3VzZScpLCBleHBlY3RlZFJldmlzaW9uOiAtMSB9LFxuICAgIHsgLi4uY29tbWFuZChzZXNzaW9uLCAnc3RhbGUnLCAnaG91c2UnKSwgZXhwZWN0ZWRSZXZpc2lvbjogc2Vzc2lvbi53b3JsZC5yZXZpc2lvbiArIDEgfSxcbiAgICBoYXJ2ZXN0KHNlc3Npb24sICdtaXNzaW5nLWVudGl0eScsICdlOjAsMDo5OTk5OTknKSxcbiAgXTtcbiAgZm9yIChjb25zdCBhdHRlbXB0IG9mIGF0dGVtcHRzKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gc2Vzc2lvbi5kaXNwYXRjaChhdHRlbXB0KTtcbiAgICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCBmYWxzZSk7XG4gICAgYXNzZXJ0LmVxdWFsKHNlc3Npb24ubmV4dFNlcXVlbmNlLCAwKTtcbiAgICBhc3NlcnQuZXF1YWwoc2Vzc2lvbi5zdGF0ZUhhc2gsIGJlZm9yZSk7XG4gIH1cbiAgc2Vzc2lvbi53b3JsZC5pbnZlbnRvcnkgPSB7fTtcbiAgY29uc3QgcmVzdWx0ID0gc2Vzc2lvbi5kaXNwYXRjaChjb21tYW5kKHNlc3Npb24sICd1bmFmZm9yZGFibGUnLCAnaG91c2UnKSk7XG4gIGFzc2VydC5lcXVhbChyZXN1bHQub2ssIGZhbHNlKTtcbiAgaWYgKCFyZXN1bHQub2spIGFzc2VydC5lcXVhbChyZXN1bHQuY29kZSwgJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnKTtcbiAgYXNzZXJ0LmVxdWFsKHNlc3Npb24ubmV4dFNlcXVlbmNlLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKGNhbm9uaWNhbFJlZ2lvbkhhc2goc2Vzc2lvbi53b3JsZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uKS5oYXNoLFxuICAgIGNhbm9uaWNhbFJlZ2lvbkhhc2goZ2VuZXNpc1dvcmxkKCksIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbikuaGFzaCk7XG59KTtcblxudGVzdCgnc25hcHNob3QtdGFpbCByZXBsYXkgbWF0Y2hlcyBsaXZlIHN0YXRlIGFuZCByZWZ1c2VzIGFuIGluY29tcGF0aWJsZSBib3VuZGFyeScsICgpID0+IHtcbiAgY29uc3QgbGl2ZSA9IEdhbWVTZXNzaW9uLmxlZ2FjeUdlbmVzaXMoKTtcbiAgYXNzZXJ0LmVxdWFsKGxpdmUuZGlzcGF0Y2goY29tbWFuZChsaXZlLCAnaG91c2UtMScsICdob3VzZScpKS5vaywgdHJ1ZSk7XG4gIGNvbnN0IHNuYXBzaG90ID0gbGl2ZS5zbmFwc2hvdDtcbiAgYXNzZXJ0LmVxdWFsKGxpdmUuZGlzcGF0Y2goY29tbWFuZChsaXZlLCAncGF0aC0yJywgJ3BhdGgnKSkub2ssIHRydWUpO1xuICBhc3NlcnQuZXF1YWwobGl2ZS5kaXNwYXRjaChjb21tYW5kKGxpdmUsICdmYXJtLTMnLCAnZmFybScpKS5vaywgdHJ1ZSk7XG4gIGNvbnN0IHJlc3RvcmVkID0gR2FtZVNlc3Npb24ucmVzdG9yZShjbG9uZShzbmFwc2hvdCksIGNsb25lKGxpdmUuam91cm5hbCkpO1xuICBhc3NlcnQuZXF1YWwocmVzdG9yZWQuc3RhdGVIYXNoLCBsaXZlLnN0YXRlSGFzaCk7XG4gIGFzc2VydC5kZWVwRXF1YWwocmVzdG9yZWQuc25hcHNob3QsIGxpdmUuc25hcHNob3QpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHJlc3RvcmVkLmpvdXJuYWwsIGxpdmUuam91cm5hbCk7XG4gIGNvbnN0IGNvbXBsZXRlQm91bmRhcnkgPSBHYW1lU2Vzc2lvbi5yZXN0b3JlKGNsb25lKGxpdmUuc25hcHNob3QpLCBjbG9uZShsaXZlLmpvdXJuYWwpKTtcbiAgYXNzZXJ0LmVxdWFsKGNvbXBsZXRlQm91bmRhcnkuc3RhdGVIYXNoLCBsaXZlLnN0YXRlSGFzaCk7XG4gIGNvbnN0IG1pc21hdGNoZWRTbmFwc2hvdCA9IGNsb25lKGxpdmUuc25hcHNob3QpO1xuICBtaXNtYXRjaGVkU25hcHNob3QuaW52ZW50b3J5ID0geyBzdG9uZTogMSwgd29vZDogMiB9O1xuICBhc3NlcnQudGhyb3dzKCgpID0+IEdhbWVTZXNzaW9uLnJlc3RvcmUobWlzbWF0Y2hlZFNuYXBzaG90LCBjbG9uZShsaXZlLmpvdXJuYWwpKSwgL3NuYXBzaG90IGhhc2gvKTtcbiAgYXNzZXJ0LnRocm93cygoKSA9PiBHYW1lU2Vzc2lvbi5yZXN0b3JlKHsgLi4uc25hcHNob3QsIG5leHRTZXF1ZW5jZTogOTkgfSwgY2xvbmUobGl2ZS5qb3VybmFsKSksIC9haGVhZC8pO1xuICBjb25zdCB3cm9uZyA9IGNsb25lKGxpdmUuam91cm5hbCk7XG4gIHdyb25nLnN0YXJ0ZXJJbnZlbnRvcnkud29vZCA9IDIzO1xuICBhc3NlcnQudGhyb3dzKCgpID0+IEdhbWVTZXNzaW9uLnJlc3RvcmUobGl2ZS5zbmFwc2hvdCwgd3JvbmcpKTtcbiAgY29uc3QgdHJ1bmNhdGVkID0gY2xvbmUobGl2ZS5qb3VybmFsKTtcbiAgdHJ1bmNhdGVkLmVudHJpZXMucG9wKCk7XG4gIGFzc2VydC50aHJvd3MoKCkgPT4gR2FtZVNlc3Npb24ucmVzdG9yZShsaXZlLnNuYXBzaG90LCB0cnVuY2F0ZWQpLCAvYWhlYWQvKTtcbn0pO1xuXG50ZXN0KCdicm93c2VyLWdlbmVyYXRlZCBoYXJ2ZXN0IElEcyBhY2NlcHQgZ2VuZXJhdGVkIGFuZCBhdXRob3JlZCBlbnRpdGllcyBhbmQgcmVwbGF5JywgKCkgPT4ge1xuICBjb25zdCBzZXNzaW9uID0gR2FtZVNlc3Npb24ubGVnYWN5R2VuZXNpcygpO1xuICBjb25zdCBnZW5lcmF0ZWQgPSBuZWFyZXN0SGFydmVzdGFibGUoc2Vzc2lvbi53b3JsZCwgLTQyLCAtNDAsIDQwLCAnd29vZCcpITtcbiAgYXNzZXJ0LmVxdWFsKGdlbmVyYXRlZC5pZCwgJ2U6MzAsMzA6NCcpO1xuICBjb25zdCB0YXJnZXRzID0gW2dlbmVyYXRlZC5pZCwgJ2hlcm86c3R5bF9zaHJ1YjotMTQ6LTgnXTtcbiAgZm9yIChjb25zdCBlbnRpdHlJZCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3QgaWQgPSBzZXNzaW9uLmNvbW1hbmRJZCgnaGFydmVzdCcsIGVudGl0eUlkKTtcbiAgICBhc3NlcnQuZXF1YWwoaWQsIGBoYXJ2ZXN0OiR7c2Vzc2lvbi5uZXh0U2VxdWVuY2V9OiR7ZW5jb2RlVVJJQ29tcG9uZW50KGVudGl0eUlkKX1gKTtcbiAgICBjb25zdCByZWNlaXB0ID0gc2Vzc2lvbi5kaXNwYXRjaCh7XG4gICAgICBzY2hlbWE6IDEsIGlkLCB0eXBlOiAnaGFydmVzdCcsIGVudGl0eUlkLFxuICAgICAgZXhwZWN0ZWRSZXZpc2lvbjogc2Vzc2lvbi53b3JsZC5yZXZpc2lvbixcbiAgICB9KTtcbiAgICBhc3NlcnQuZXF1YWwocmVjZWlwdC5vaywgdHJ1ZSwgSlNPTi5zdHJpbmdpZnkocmVjZWlwdCkpO1xuICB9XG4gIGFzc2VydC5lcXVhbChzZXNzaW9uLm5leHRTZXF1ZW5jZSwgMik7XG4gIGFzc2VydC5lcXVhbChHYW1lU2Vzc2lvbi5yZXBsYXkoY2xvbmUoc2Vzc2lvbi5qb3VybmFsKSkuc3RhdGVIYXNoLCBzZXNzaW9uLnN0YXRlSGFzaCk7XG59KTtcblxudGVzdCgnaGFydmVzdCwgZXZpY3Rpb24gYW5kIHJlZ2VuZXJhdGlvbiBzdXJ2aXZlIHNuYXBzaG90IGFuZCBnZW5lc2lzIHJlcGxheScsICgpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IEdhbWVTZXNzaW9uLmxlZ2FjeUdlbmVzaXMoKTtcbiAgY29uc3QgZSA9IG5lYXJlc3RIYXJ2ZXN0YWJsZShzZXNzaW9uLndvcmxkLCAtNDMsIC00MCwgNTAsICd3b29kJykhO1xuICBjb25zdCBvcmlnaW5hbCA9IHsgLi4uZSB9O1xuICBjb25zdCByZWNlaXB0ID0gc2Vzc2lvbi5kaXNwYXRjaChoYXJ2ZXN0KHNlc3Npb24sICdoYXJ2ZXN0LTAnLCBlLmlkKSk7XG4gIGFzc2VydC5lcXVhbChyZWNlaXB0Lm9rLCB0cnVlKTtcbiAgYXNzZXJ0LmVxdWFsKHNlc3Npb24ud29ybGQuZW50aXRpZXMuZ2V0KGUuaWQpPy5oYXJ2ZXN0ZWRPbmNlLCB0cnVlKTtcbiAgYXNzZXJ0LmVxdWFsKHNlc3Npb24ud29ybGQuZW50aXRpZXMuZ2V0KGUuaWQpPy5yZW1haW5pbmcsXG4gICAgb3JpZ2luYWwucmVtYWluaW5nIC0gb3JpZ2luYWwueWllbGRQZXJIYXJ2ZXN0KTtcbiAgYXNzZXJ0LmVxdWFsKHNlc3Npb24ud29ybGQuaW52ZW50b3J5Lndvb2QsIDI0ICsgb3JpZ2luYWwueWllbGRQZXJIYXJ2ZXN0KTtcbiAgYXNzZXJ0LmVxdWFsKGV2aWN0Q2h1bmsoc2Vzc2lvbi53b3JsZCwgZS5jaHVuayksIHRydWUpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHNlc3Npb24ud29ybGQuZW50aXRpZXMuZ2V0KGUuaWQpLCBzZXNzaW9uLndvcmxkLmVudGl0aWVzLmdldChlLmlkKSk7XG4gIGNvbnN0IFtjeCwgY3pdID0gZS5jaHVuay5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICBnZW5lcmF0ZUNodW5rKHNlc3Npb24ud29ybGQsIGN4LCBjeik7XG4gIGFzc2VydC5lcXVhbChzZXNzaW9uLndvcmxkLmVudGl0aWVzLmdldChlLmlkKT8ucmVtYWluaW5nLFxuICAgIG9yaWdpbmFsLnJlbWFpbmluZyAtIG9yaWdpbmFsLnlpZWxkUGVySGFydmVzdCk7XG4gIGNvbnN0IHNuYXBzaG90ID0gc2Vzc2lvbi5zbmFwc2hvdDtcbiAgY29uc3QgdGFpbFJlY2VpcHQgPSBzZXNzaW9uLmRpc3BhdGNoKGNvbW1hbmQoc2Vzc2lvbiwgJ2hvdXNlLTEnLCAnaG91c2UnKSk7XG4gIGFzc2VydC5lcXVhbCh0YWlsUmVjZWlwdC5vaywgdHJ1ZSk7XG4gIGNvbnN0IGZyb21UYWlsID0gR2FtZVNlc3Npb24ucmVzdG9yZShjbG9uZShzbmFwc2hvdCksIGNsb25lKHNlc3Npb24uam91cm5hbCkpO1xuICBjb25zdCBmcm9tR2VuZXNpcyA9IEdhbWVTZXNzaW9uLnJlcGxheShjbG9uZShzZXNzaW9uLmpvdXJuYWwpKTtcbiAgY29uc3QgZmluYWxTbmFwc2hvdCA9IGNsb25lKHNlc3Npb24uc25hcHNob3QpO1xuICBjb25zdCBmaW5hbEpvdXJuYWwgPSBjbG9uZShzZXNzaW9uLmpvdXJuYWwpO1xuICBmb3IgKGNvbnN0IHJlc3RvcmVkIG9mIFtmcm9tVGFpbCwgZnJvbUdlbmVzaXMsIEdhbWVTZXNzaW9uLnJlc3RvcmUoZmluYWxTbmFwc2hvdCwgZmluYWxKb3VybmFsKV0pIHtcbiAgICBhc3NlcnQuZXF1YWwocmVzdG9yZWQuc3RhdGVIYXNoLCBzZXNzaW9uLnN0YXRlSGFzaCk7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChyZXN0b3JlZC53b3JsZC5lbnRpdGllcy5nZXQoZS5pZCksIHNlc3Npb24ud29ybGQuZW50aXRpZXMuZ2V0KGUuaWQpKTtcbiAgICBhc3NlcnQuZXF1YWwocmVzdG9yZWQud29ybGQuaW52ZW50b3J5Lndvb2QsIHNlc3Npb24ud29ybGQuaW52ZW50b3J5Lndvb2QpO1xuICAgIGNvbnN0IHNlY29uZCA9IHJlc3RvcmVkLmRpc3BhdGNoKGhhcnZlc3QocmVzdG9yZWQsICdyZXBsYXktaGFydmVzdC1hZ2FpbicsIGUuaWQpKTtcbiAgICBhc3NlcnQuZXF1YWwoc2Vjb25kLm9rLCBvcmlnaW5hbC5yZW1haW5pbmcgLSBvcmlnaW5hbC55aWVsZFBlckhhcnZlc3QgPiAwICYmICFlLmhhcnZlc3RlZCk7XG4gICAgaWYgKHNlY29uZC5vaykgYXNzZXJ0LmVxdWFsKHJlc3RvcmVkLndvcmxkLmVudGl0aWVzLmdldChlLmlkKT8uaGFydmVzdGVkLFxuICAgICAgb3JpZ2luYWwucmVtYWluaW5nIDw9IG9yaWdpbmFsLnlpZWxkUGVySGFydmVzdCAqIDIpO1xuICB9XG59KTtcblxudGVzdCgnc25hcHNob3QgdmFsaWRhdGlvbiBpcyBub24tbXV0YXRpbmcgYW5kIGpvdXJuYWwgY29ycnVwdGlvbiBpcyBuZXZlciByZXBsYXllZCcsICgpID0+IHtcbiAgY29uc3QgbGl2ZSA9IEdhbWVTZXNzaW9uLmxlZ2FjeUdlbmVzaXMoKTtcbiAgYXNzZXJ0LmVxdWFsKGxpdmUuZGlzcGF0Y2goY29tbWFuZChsaXZlLCAnaG91c2UnLCAnaG91c2UnKSkub2ssIHRydWUpO1xuICBjb25zdCBqb3VybmFsID0gY2xvbmUobGl2ZS5qb3VybmFsKTtcbiAgY29uc3QgY2FzZXM6IENvbW1hbmRKb3VybmFsW10gPSBbXG4gICAgeyAuLi5qb3VybmFsLCBzY2hlbWE6IDk5IGFzIG5ldmVyIH0sXG4gICAgeyAuLi5qb3VybmFsLCBlbnRyaWVzOiBbeyAuLi5qb3VybmFsLmVudHJpZXNbMF0sIHNlcXVlbmNlOiAxIH1dIH0sXG4gICAgeyAuLi5qb3VybmFsLCBlbnRyaWVzOiBbeyAuLi5qb3VybmFsLmVudHJpZXNbMF0sIGhhc2g6ICcwJy5yZXBlYXQoMTYpIH1dIH0sXG4gICAgeyAuLi5qb3VybmFsLCBlbnRyaWVzOiBbeyAuLi5qb3VybmFsLmVudHJpZXNbMF0sIHJldmlzaW9uOiAwIH1dIH0sXG4gICAgeyAuLi5qb3VybmFsLCBlbnRyaWVzOiBbeyAuLi5qb3VybmFsLmVudHJpZXNbMF0sIG91dGNvbWU6IHsgdHlwZTogJ2hhcnZlc3QnLCBlbnRpdHlJZDogJ3gnLCByZXNvdXJjZTogJ3dvb2QnLCBhbW91bnQ6IDEgfSB9XSB9LFxuICAgIHsgLi4uam91cm5hbCwgZW50cmllczogWy4uLmpvdXJuYWwuZW50cmllcywgeyAuLi5qb3VybmFsLmVudHJpZXNbMF0sIHNlcXVlbmNlOiAxIH1dIH0sXG4gICAgeyAuLi5qb3VybmFsLCBzZWVkOiAxMzM4IH0sXG4gIF07XG4gIGZvciAoY29uc3QgY29ycnVwdCBvZiBjYXNlcykge1xuICAgIC8vIFN5bnRheCB2YWxpZGF0aW9uIGlzIHNlcGFyYXRlIGZyb20gZGV0ZXJtaW5pc3RpYyBleGVjdXRpb24uIFNlbWFudGljXG4gICAgLy8gY29ycnVwdGlvbiAocmV2aXNpb24sIGhhc2ggb3Igb3V0Y29tZSkgaXMgY2F1Z2h0IGR1cmluZyByZXBsYXkuXG4gICAgYXNzZXJ0LnRocm93cygoKSA9PiBHYW1lU2Vzc2lvbi5yZXBsYXkoY29ycnVwdCkpO1xuICB9XG4gIGNvbnN0IGJhc2UgPSBjcmVhdGVXb3JsZFNuYXBzaG90KGxpdmUud29ybGQsIDEpO1xuICBjb25zdCBoYXNoID0gY2Fub25pY2FsV29ybGRIYXNoKGxpdmUud29ybGQsIDEpO1xuICBhc3NlcnQudGhyb3dzKCgpID0+IHdvcmxkRnJvbVNuYXBzaG90KHsgLi4uYmFzZSwgc2NoZW1hOiA5OSBhcyBuZXZlciB9KSk7XG4gIGFzc2VydC5lcXVhbChjYW5vbmljYWxXb3JsZEhhc2gobGl2ZS53b3JsZCwgMSksIGhhc2gpO1xuICBhc3NlcnQudGhyb3dzKCgpID0+IEdhbWVTZXNzaW9uLnJlc3RvcmUoeyAuLi5iYXNlLCBtYW5pZmVzdDogeyAuLi5iYXNlLm1hbmlmZXN0LCBzZWVkOiAxMzM4IH0gfSwgam91cm5hbCkpO1xuICBhc3NlcnQuZXF1YWwoY2Fub25pY2FsV29ybGRIYXNoKGxpdmUud29ybGQsIDEpLCBoYXNoKTtcbn0pO1xuXG50ZXN0KCd0aGUgMjA0OCBtIHdvcmxkIHJlcGxheXMgdGhyb3VnaCB0aGUgc2FtZSBib3VuZGVkIGF1dGhvcml0eSBhbmQgcHJlc2VydmVzIG91dHNpZGUgdGVycmFpbicsICgpID0+IHtcbiAgY29uc3QgbGl2ZSA9IEdhbWVTZXNzaW9uLmxlZ2FjeUdlbmVzaXMoMTMzNyk7XG4gIGNvbnN0IGJlZm9yZSA9IGNhbm9uaWNhbFJlZ2lvbkhhc2gobGl2ZS53b3JsZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uLCBNMDAyX0xBWU9VVC5lbnZlbG9wZSkuaGFzaDtcbiAgZm9yIChjb25zdCBwcm9qZWN0SWQgb2YgWydob3VzZScsICdwYXRoJywgJ2Zhcm0nXSBhcyBjb25zdCkge1xuICAgIGFzc2VydC5lcXVhbChsaXZlLmRpc3BhdGNoKGNvbW1hbmQobGl2ZSwgcHJvamVjdElkLCBwcm9qZWN0SWQpKS5vaywgdHJ1ZSk7XG4gIH1cbiAgYXNzZXJ0LmVxdWFsKGxpdmUud29ybGQuZW50aXRpZXMuc2l6ZSA+IDAsIHRydWUpO1xuICBjb25zdCByZXBsYXllZCA9IEdhbWVTZXNzaW9uLnJlcGxheShjbG9uZShsaXZlLmpvdXJuYWwpKTtcbiAgYXNzZXJ0LmVxdWFsKHJlcGxheWVkLnN0YXRlSGFzaCwgbGl2ZS5zdGF0ZUhhc2gpO1xuICBhc3NlcnQuZXF1YWwoXG4gICAgY2Fub25pY2FsUmVnaW9uSGFzaChyZXBsYXllZC53b3JsZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uLCBNMDAyX0xBWU9VVC5lbnZlbG9wZSkuaGFzaCxcbiAgICBiZWZvcmUsXG4gICk7XG59KTtcblxudGVzdCgnam91cm5hbCBlbnRyaWVzIGFyZSBib3VuZGVkIGFuZCByZWplY3RlZCByYXRoZXIgdGhhbiBwYXJ0aWFsbHkgYWNjZXB0ZWQnLCAoKSA9PiB7XG4gIGNvbnN0IGpvdXJuYWwgPSBjcmVhdGVKb3VybmFsKCk7XG4gIGFzc2VydC50aHJvd3MoKCkgPT4gdmFsaWRhdGVKb3VybmFsKHsgLi4uam91cm5hbCwgc3RhcnRlckludmVudG9yeTogeyAuLi5qb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnksIHdvb2Q6IC0xIH0gfSkpO1xuICBhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlSm91cm5hbCh7IC4uLmpvdXJuYWwsIHVua25vd246IHRydWUgfSkpO1xuICBhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlSm91cm5hbCh7IC4uLmpvdXJuYWwsIHN0YXJ0ZXJJbnZlbnRvcnk6IHsgd29vZDogMjQsIHN0b25lOiA0OCwgdW5rbm93bjogMiB9IH0pKTtcbiAgYXNzZXJ0LnRocm93cygoKSA9PiBHYW1lU2Vzc2lvbi5yZXN0b3JlKHsgLi4uZ2VuZXNpc1NuYXBzaG90KCksIG5leHRTZXF1ZW5jZTogLTEgfSwgam91cm5hbCkpO1xufSk7XG5cbmZ1bmN0aW9uIGdlbmVzaXNTbmFwc2hvdCgpIHsgcmV0dXJuIGNyZWF0ZVdvcmxkU25hcHNob3QoZ2VuZXNpc1dvcmxkKCkpOyB9XG4iLCAiLy8gUHJpdmF0ZSBtaWdyYXRpb24gcmVwbGF5IG9ubHkuIFJldGlyZWQgZW50aXRpZXMgbGl2ZSBpbiB0aGlzIFdvcmxkIHdoaWxlIGFuXG4vLyBhY2NlcHRlZCBoaXN0b3JpY2FsIGpvdXJuYWwgaXMgY2hlY2tlZDsgbm8gcHVibGljIGNvbW1hbmQgZW5hYmxlcyB0aGlzIG1vZGUuXG5pbnRlcmZhY2UgUmVwbGF5U3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIGhpc3RvcmljYWxIYXNoOiBib29sZWFuO1xuICBtaWdyYXRlZDogYm9vbGVhbjtcbn1cblxuY29uc3Qgc3RhdGVzID0gbmV3IFdlYWtNYXA8b2JqZWN0LCBSZXBsYXlTdGF0ZT4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxheVN0b25lU3RhdGUod29ybGQ6IG9iamVjdCk6IFJlcGxheVN0YXRlIHtcbiAgbGV0IHN0YXRlID0gc3RhdGVzLmdldCh3b3JsZCk7XG4gIGlmICghc3RhdGUpIHsgc3RhdGUgPSB7IGFjdGl2ZTogZmFsc2UsIGhpc3RvcmljYWxIYXNoOiBmYWxzZSwgbWlncmF0ZWQ6IGZhbHNlIH07IHN0YXRlcy5zZXQod29ybGQsIHN0YXRlKTsgfVxuICByZXR1cm4gc3RhdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IHRydWU7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbiAgc3RhdGUubWlncmF0ZWQgPSBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/LmFjdGl2ZSA/PyBmYWxzZTtcbn1cblxuLyoqIFNuYXBzaG90IGhhc2hlcyBiZWZvcmUgYW5kIGR1cmluZyB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheSBpbmNsdWRlIHN0b25lcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5oaXN0b3JpY2FsSGFzaCA/PyBmYWxzZTtcbn1cblxuLyoqIEEgbWlncmF0ZWQgc25hcHNob3QgYWxyZWFkeSBoYXMgcmV0aXJlbWVudCB0b21ic3RvbmVzIGluIGdlbmVyYXRlZCBjaHVua3MuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5taWdyYXRlZCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lm1pZ3JhdGVkID8/IGZhbHNlO1xufVxuXG4vKiogRXhpdCBoaXN0b3JpY2FsIG1vZGUgYWZ0ZXIgYWxsIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBoYXNoZXMgaGF2ZSBwYXNzZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZmluaXNoU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSBmYWxzZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSBmYWxzZTtcbiAgc3RhdGUubWlncmF0ZWQgPSB0cnVlO1xufVxuIiwgIi8vIERldGVybWluaXN0aWMgaGFzaCwgbm9pc2UgYW5kIG1hdGggaGVscGVycyBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIuXG4vLyBQdXJlIFR5cGVTY3JpcHQgKEQtMDA1KS4gRXh0cmFjdGVkIGZyb20gd29ybGQudHMgdW5jaGFuZ2VkIHNvIHRlcnJhaW5cbi8vIGdlbmVyYXRvcnMgb2YgZXZlcnkgdmVyc2lvbiB1c2UgaWRlbnRpY2FsIHByaW1pdGl2ZXMuXG5leHBvcnQgY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuZXhwb3J0IGNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuZXhwb3J0IGNvbnN0IHNtb290aHN0ZXAgPSAoZTA6IG51bWJlciwgZTE6IG51bWJlciwgeDogbnVtYmVyKSA9PiB7XG4gIGNvbnN0IHQgPSBjbGFtcCgoeCAtIGUwKSAvIChlMSAtIGUwKSwgMCwgMSk7XG4gIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xufTtcblxuLy8gLS0tLS0tLS0tLSBkZXRlcm1pbmlzdGljIGhhc2ggLyBub2lzZSAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gaGFzaDJpKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoM2koeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKSBeIE1hdGguaW11bCh6LCAyMjQ2ODIyNTE5KTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbXVsYmVycnkzMihzZWVkOiBudW1iZXIpOiAoKSA9PiBudW1iZXIge1xuICBsZXQgYSA9IHNlZWQgPj4+IDA7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgYSA9IChhICsgMHg2ZDJiNzlmNSkgPj4+IDA7XG4gICAgbGV0IHQgPSBhO1xuICAgIHQgPSBNYXRoLmltdWwodCBeICh0ID4+PiAxNSksIHQgfCAxKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgdCB8IDYxKTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IHNtb290aCA9ICh0OiBudW1iZXIpID0+IHQgKiB0ICogKDMgLSAyICogdCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSk7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSk7XG4gIGNvbnN0IGEgPSBoYXNoMmkoeGksIHlpLCBzZWVkKSwgYiA9IGhhc2gyaSh4aSArIDEsIHlpLCBzZWVkKTtcbiAgY29uc3QgYyA9IGhhc2gyaSh4aSwgeWkgKyAxLCBzZWVkKSwgZCA9IGhhc2gyaSh4aSArIDEsIHlpICsgMSwgc2VlZCk7XG4gIGNvbnN0IHRvcCA9IGEgKyAoYiAtIGEpICogeGY7XG4gIGNvbnN0IGJvdHRvbSA9IGMgKyAoZCAtIGMpICogeGY7XG4gIHJldHVybiB0b3AgKyAoYm90dG9tIC0gdG9wKSAqIHlmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMih4ICogZnJlcSwgeSAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KSwgemkgPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpLCB6ZiA9IHNtb290aCh6IC0gemkpO1xuICBjb25zdCBjMDAwID0gaGFzaDNpKHhpLCB5aSwgemksIHNlZWQpLCBjMTAwID0gaGFzaDNpKHhpICsgMSwgeWksIHppLCBzZWVkKTtcbiAgY29uc3QgYzAxMCA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSwgc2VlZCksIGMxMTAgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppLCBzZWVkKTtcbiAgY29uc3QgYzAwMSA9IGhhc2gzaSh4aSwgeWksIHppICsgMSwgc2VlZCksIGMxMDEgPSBoYXNoM2koeGkgKyAxLCB5aSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgYzAxMSA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpLCBjMTExID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCB4MDAgPSBjMDAwICsgKGMxMDAgLSBjMDAwKSAqIHhmO1xuICBjb25zdCB4MTAgPSBjMDEwICsgKGMxMTAgLSBjMDEwKSAqIHhmO1xuICBjb25zdCB4MDEgPSBjMDAxICsgKGMxMDEgLSBjMDAxKSAqIHhmO1xuICBjb25zdCB4MTEgPSBjMDExICsgKGMxMTEgLSBjMDExKSAqIHhmO1xuICBjb25zdCB5MCA9IHgwMCArICh4MTAgLSB4MDApICogeWY7XG4gIGNvbnN0IHkxID0geDAxICsgKHgxMSAtIHgwMSkgKiB5ZjtcbiAgcmV0dXJuIHkwICsgKHkxIC0geTApICogemY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0zKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTMoeCAqIGZyZXEsIHkgKiBmcmVxLCB6ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuIiwgIi8vIEh5ZHJvbG9neSBcdTIwMTQgdGhlIGRldGVybWluaXN0aWMgd2F0ZXIgbmV0d29yayBvZiBhIHdvcmxkIChwdXJlIFR5cGVTY3JpcHQsIEQtMDA1KS5cbi8vXG4vLyBUaGlzIGlzIGRlcml2ZWQgKnNpbXVsYXRpb24gZGF0YSosIG5vdCBwcmVzZW50YXRpb246IGl0IGlzIGEgcHVyZSBmdW5jdGlvbiBvZlxuLy8gKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKSBhbmQgaXMgd2hhdCB0ZXJyYWluIGNhcnZpbmcsIHdhdGVyIGZpbGxpbmcsIGZsb3dcbi8vIGRpcmVjdGlvbiBhbmQgZnV0dXJlIGZpc2hpbmcvaXJyaWdhdGlvbi9mbG9vZGluZyBydWxlcyByZWFkLiBJdCBpcyBuZXZlclxuLy8gam91cm5hbGVkIGJlY2F1c2UgaXQgY2FuIGFsd2F5cyBiZSByZWdlbmVyYXRlZCBleGFjdGx5LlxuLy9cbi8vIE5ldHdvcmsgKGJvdGggZ2VuZXJhdG9yIHZlcnNpb25zKTpcbi8vICAgbGFrZSAgXHUyMDE0IHRoZSB2YWxsZXkgbGFrZSBiYXNpbiwgbG9jYXRlZCBmcm9tIHRoZSBhY3R1YWwgZ2VuZXJhdGVkIHRlcnJhaW4uXG4vLyAgIGxvd2VyIFx1MjAxNCB0aGUgbG93bGFuZCByaXZlciBmcm9tIHRoZSBsYWtlIHRvIHRoZSBzb3V0aGVybiBzZWEsIHRyYWNlZCBmcm9tXG4vLyAgICAgICAgICAgdGhlIGFjdHVhbCBjYXJ2ZWQgY2hhbm5lbCAodGhlIHYxIGNoYW5uZWwgaXMgY2FydmVkIG9uICp3YXJwZWQqXG4vLyAgICAgICAgICAgY29vcmRpbmF0ZXMsIHNvIGByaXZlckNlbnRlclhgIGFsb25lIGlzIHVwIHRvIH4xMzUgbSBvZmYpLlxuLy8gR2VuZXJhdG9yIHYyIGFkZHM6XG4vLyAgIHVwcGVyIFx1MjAxNCBhIG1vdW50YWluIHJpdmVyIGZyb20gYSBoaWdobGFuZCB0YXJuIGRvd24gdG8gdGhlIGxha2UsIHdpdGggYVxuLy8gICAgICAgICAgIHdhdGVyLXN1cmZhY2UgbGV2ZWwgdGhhdCBuZXZlciByaXNlcyBkb3duc3RyZWFtLCBjYXNjYWRlcyBhbmQgZmFsbHMuXG4vL1xuLy8gRmxvdyBhbHdheXMgcG9pbnRzIGRvd25zdHJlYW06IHVwcGVyIFx1MjE5MiBsYWtlIFx1MjE5MiBsb3dlciBcdTIxOTIgc2VhLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIG11bGJlcnJ5MzIsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcblxuZXhwb3J0IHR5cGUgSGVpZ2h0U2FtcGxlciA9ICh4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJpdmVyUG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQgb2YgdGhpcyByZWFjaCAobWV0cmVzKS4gKi9cbiAgczogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBlbGV2YXRpb24gKG1ldHJlcywgbWF5IGJlIGZyYWN0aW9uYWwpLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogQ2hhbm5lbCBoYWxmLXdpZHRoIChtZXRyZXMpLiAqL1xuICB3aWR0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWNoSGl0IHtcbiAgLyoqIEhvcml6b250YWwgZGlzdGFuY2UgZnJvbSB0aGUgY2VudHJlbGluZS4gKi9cbiAgZDogbnVtYmVyO1xuICAvKiogSW50ZXJwb2xhdGVkIHdhdGVyIGxldmVsIGF0IHRoZSBuZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIHdpZHRoOiBudW1iZXI7XG4gIC8qKiBVbml0IGRvd25zdHJlYW0gZGlyZWN0aW9uLiAqL1xuICB0eDogbnVtYmVyO1xuICB0ejogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBkcm9wIHBlciBtZXRyZSBhbG9uZyB0aGUgY2hhbm5lbCAoPj0gMCkuICovXG4gIGdyYWRpZW50OiBudW1iZXI7XG4gIC8qKiBBcmMgbGVuZ3RoIG9mIHRoZSBuZWFyZXN0IHBvaW50IGZyb20gdGhlIGRvd25zdHJlYW0gZW5kLiAqL1xuICBzOiBudW1iZXI7XG59XG5cbi8qKlxuICogQSBwb2x5bGluZSByZWFjaCBzdG9yZWQgZG93bnN0cmVhbS1maXJzdC4gTmVhcmVzdC1zZWdtZW50IHF1ZXJpZXMgdXNlIGFcbiAqIHVuaWZvcm0gZ3JpZCB3aG9zZSBjZWxscyBsaXN0IGV2ZXJ5IHNlZ21lbnQgd2l0aGluIGByZWFjaGAgbWV0cmVzLlxuICovXG5leHBvcnQgY2xhc3MgUml2ZXJSZWFjaCB7XG4gIHJlYWRvbmx5IHBvaW50czogUml2ZXJQb2ludFtdO1xuICBwcml2YXRlIHJlYWRvbmx5IGNlbGwgPSAzMjtcbiAgcHJpdmF0ZSByZWFkb25seSBncmlkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXG4gIGNvbnN0cnVjdG9yKHBvaW50czogUml2ZXJQb2ludFtdLCByZWFkb25seSByZWFjaDogbnVtYmVyKSB7XG4gICAgdGhpcy5wb2ludHMgPSBwb2ludHM7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgKyAxIDwgcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBhID0gcG9pbnRzW2ldLCBiID0gcG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IHgwID0gTWF0aC5taW4oYS54LCBiLngpIC0gcmVhY2gsIHgxID0gTWF0aC5tYXgoYS54LCBiLngpICsgcmVhY2g7XG4gICAgICBjb25zdCB6MCA9IE1hdGgubWluKGEueiwgYi56KSAtIHJlYWNoLCB6MSA9IE1hdGgubWF4KGEueiwgYi56KSArIHJlYWNoO1xuICAgICAgZm9yIChsZXQgY3ogPSBNYXRoLmZsb29yKHowIC8gdGhpcy5jZWxsKTsgY3ogPD0gTWF0aC5mbG9vcih6MSAvIHRoaXMuY2VsbCk7IGN6KyspIHtcbiAgICAgICAgZm9yIChsZXQgY3ggPSBNYXRoLmZsb29yKHgwIC8gdGhpcy5jZWxsKTsgY3ggPD0gTWF0aC5mbG9vcih4MSAvIHRoaXMuY2VsbCk7IGN4KyspIHtcbiAgICAgICAgICBjb25zdCBrZXkgPSBjZWxsS2V5KGN4LCBjeik7XG4gICAgICAgICAgbGV0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGtleSk7XG4gICAgICAgICAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgdGhpcy5ncmlkLnNldChrZXksIGxpc3QpOyB9XG4gICAgICAgICAgbGlzdC5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGxlbmd0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wb2ludHNbdGhpcy5wb2ludHMubGVuZ3RoIC0gMV0/LnMgPz8gMDsgfVxuXG4gIC8qKiBOZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQgd2l0aGluIGByZWFjaGAsIG9yIG51bGwuICovXG4gIG5lYXJlc3QoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBSZWFjaEhpdCB8IG51bGwge1xuICAgIGNvbnN0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGNlbGxLZXkoTWF0aC5mbG9vcih4IC8gdGhpcy5jZWxsKSwgTWF0aC5mbG9vcih6IC8gdGhpcy5jZWxsKSkpO1xuICAgIGlmICghbGlzdCkgcmV0dXJuIG51bGw7XG4gICAgbGV0IGJlc3QgPSBJbmZpbml0eSwgYmkgPSAtMSwgYnQgPSAwO1xuICAgIGZvciAoY29uc3QgaSBvZiBsaXN0KSB7XG4gICAgICBjb25zdCBhID0gdGhpcy5wb2ludHNbaV0sIGIgPSB0aGlzLnBvaW50c1tpICsgMV07XG4gICAgICBjb25zdCBkeCA9IGIueCAtIGEueCwgZHogPSBiLnogLSBhLno7XG4gICAgICBjb25zdCBsZW4yID0gZHggKiBkeCArIGR6ICogZHogfHwgMTtcbiAgICAgIGNvbnN0IHQgPSBjbGFtcCgoKHggLSBhLngpICogZHggKyAoeiAtIGEueikgKiBkeikgLyBsZW4yLCAwLCAxKTtcbiAgICAgIGNvbnN0IHB4ID0gYS54ICsgZHggKiB0LCBweiA9IGEueiArIGR6ICogdDtcbiAgICAgIGNvbnN0IGQyID0gKHggLSBweCkgKiogMiArICh6IC0gcHopICoqIDI7XG4gICAgICBpZiAoZDIgPCBiZXN0KSB7IGJlc3QgPSBkMjsgYmkgPSBpOyBidCA9IHQ7IH1cbiAgICB9XG4gICAgaWYgKGJpIDwgMCB8fCBiZXN0ID4gdGhpcy5yZWFjaCAqIHRoaXMucmVhY2gpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tiaV0sIGIgPSB0aGlzLnBvaW50c1tiaSArIDFdO1xuICAgIGNvbnN0IHNlZ0xlbiA9IE1hdGgubWF4KDFlLTYsIGIucyAtIGEucyk7XG4gICAgLy8gUG9pbnRzIGFyZSBzdG9yZWQgZG93bnN0cmVhbS1maXJzdCwgc28gZG93bnN0cmVhbSBpcyBhIDwtIGIuXG4gICAgY29uc3QgdHggPSAoYS54IC0gYi54KSAvIHNlZ0xlbiwgdHogPSAoYS56IC0gYi56KSAvIHNlZ0xlbjtcbiAgICByZXR1cm4ge1xuICAgICAgZDogTWF0aC5zcXJ0KGJlc3QpLFxuICAgICAgbGV2ZWw6IGEubGV2ZWwgKyAoYi5sZXZlbCAtIGEubGV2ZWwpICogYnQsXG4gICAgICB3aWR0aDogYS53aWR0aCArIChiLndpZHRoIC0gYS53aWR0aCkgKiBidCxcbiAgICAgIHR4LCB0eixcbiAgICAgIGdyYWRpZW50OiBNYXRoLm1heCgwLCAoYi5sZXZlbCAtIGEubGV2ZWwpIC8gc2VnTGVuKSxcbiAgICAgIHM6IGEucyArIChiLnMgLSBhLnMpICogYnQsXG4gICAgfTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjZWxsS2V5KGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKGN4ICsgNDA5NikgKiA4MTkyICsgKGN6ICsgNDA5Nik7XG59XG5cbmV4cG9ydCB0eXBlIFdhdGVyQm9keSA9ICdyaXZlcicgfCAnbGFrZScgfCAnc2VhJyB8ICdub25lJztcblxuZXhwb3J0IGludGVyZmFjZSBGbG93U2FtcGxlIHtcbiAgYm9keTogV2F0ZXJCb2R5O1xuICAvKiogVW5pdCBmbG93IGRpcmVjdGlvbiAoemVybyBmb3Igc3RpbGwgd2F0ZXIpLiAqL1xuICBkeDogbnVtYmVyO1xuICBkejogbnVtYmVyO1xuICAvKiogU3VyZmFjZSBjdXJyZW50IHNwZWVkIGluIG0vcy4gKi9cbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIeWRyb2xvZ3lPcHRpb25zIHtcbiAgc2VlZDogbnVtYmVyO1xuICAvKiogR2VuZXJhdG9yIHZlcnNpb24gdGhlIG5ldHdvcmsgYmVsb25ncyB0by4gKi9cbiAgdmVyc2lvbjogbnVtYmVyO1xuICAvKiogQmFzZSBoZWlnaHQgb2YgdGhlICp1bm1vZGlmaWVkIHYxIHNoYXBlKiAodXNlZCB0byBsb2NhdGUgbGFrZS9jaGFubmVsKS4gKi9cbiAgdjFIZWlnaHQ6IEhlaWdodFNhbXBsZXI7XG59XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9naWNhbCBuZXR3b3JrIGZvciBvbmUgKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKS4gKi9cbmV4cG9ydCBjbGFzcyBIeWRyb2xvZ3kge1xuICByZWFkb25seSBzZWVkOiBudW1iZXI7XG4gIHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcbiAgcmVhZG9ubHkgbGFrZTogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcng6IG51bWJlcjsgcno6IG51bWJlciB9O1xuICByZWFkb25seSBsb3dlcjogUml2ZXJSZWFjaDtcbiAgcmVhZG9ubHkgdXBwZXI6IFJpdmVyUmVhY2ggfCBudWxsO1xuICAvKiogVXBwZXItcml2ZXIgc291cmNlIHRhcm4gKHYyIG9ubHkpLiAqL1xuICByZWFkb25seSB0YXJuOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByOiBudW1iZXI7IGxldmVsOiBudW1iZXIgfSB8IG51bGw7XG5cbiAgY29uc3RydWN0b3Iob3B0czogSHlkcm9sb2d5T3B0aW9ucykge1xuICAgIHRoaXMuc2VlZCA9IG9wdHMuc2VlZDtcbiAgICB0aGlzLnZlcnNpb24gPSBvcHRzLnZlcnNpb247XG4gICAgdGhpcy5sYWtlID0gbG9jYXRlTGFrZShvcHRzLnYxSGVpZ2h0KTtcbiAgICB0aGlzLmxvd2VyID0gdHJhY2VMb3dlclJpdmVyKG9wdHMudjFIZWlnaHQsIHRoaXMubGFrZSk7XG4gICAgaWYgKG9wdHMudmVyc2lvbiA+PSAyKSB7XG4gICAgICBjb25zdCB1cHBlciA9IGF1dGhvclVwcGVyUml2ZXIob3B0cy5zZWVkLCB0aGlzLmxha2UpO1xuICAgICAgdGhpcy51cHBlciA9IHVwcGVyLnJlYWNoO1xuICAgICAgdGhpcy50YXJuID0gdXBwZXIudGFybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51cHBlciA9IG51bGw7XG4gICAgICB0aGlzLnRhcm4gPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdXJmYWNlIGN1cnJlbnQgZm9yIGEgd2F0ZXIgY29sdW1uLiBgbGV2ZWxgIGlzIHRoZSBjb2x1bW4ncyB3YXRlciBzdXJmYWNlLFxuICAgKiB1c2VkIHRvIHRlbGwgc2VhLWxldmVsIHdhdGVyIChsYWtlLCBsb3dlciByaXZlciwgc2VhKSBmcm9tIHRoZSB1cHBlciByaXZlci5cbiAgICovXG4gIGZsb3dBdCh4OiBudW1iZXIsIHo6IG51bWJlciwgbGV2ZWw6IG51bWJlcik6IEZsb3dTYW1wbGUge1xuICAgIGlmICh0aGlzLnVwcGVyICYmIGxldmVsID4gMC41KSB7XG4gICAgICBjb25zdCBoaXQgPSB0aGlzLnVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDw9IGhpdC53aWR0aCArIDIpIHtcbiAgICAgICAgY29uc3Qgc3BlZWQgPSBjbGFtcCgwLjU1ICsgaGl0LmdyYWRpZW50ICogOSwgMC40LCA0LjUpO1xuICAgICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogaGl0LnR4LCBkejogaGl0LnR6LCBzcGVlZCB9O1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMudGFybiAmJiBNYXRoLmh5cG90KHggLSB0aGlzLnRhcm4ueCwgeiAtIHRoaXMudGFybi56KSA8IHRoaXMudGFybi5yICsgNCkge1xuICAgICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLnRvd2FyZHMoeCwgeiwgdGhpcy51cHBlclNvdXJjZSgpLCAwLjA2KSB9O1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBsb3cgPSB0aGlzLmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8PSBsb3cud2lkdGggKyA2KSB7XG4gICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogbG93LnR4LCBkejogbG93LnR6LCBzcGVlZDogMC4zNSArIDAuMjUgKiBzbW9vdGhzdGVwKGxvdy53aWR0aCArIDYsIDAsIGxvdy5kKSB9O1xuICAgIH1cbiAgICBjb25zdCBsZCA9IE1hdGguaHlwb3QoKHggLSB0aGlzLmxha2UueCkgLyB0aGlzLmxha2UucngsICh6IC0gdGhpcy5sYWtlLnopIC8gdGhpcy5sYWtlLnJ6KTtcbiAgICBpZiAobGQgPCAxLjM1KSB7XG4gICAgICAvLyBTbG93IGRyaWZ0IGZyb20gdGhlIGluZmxvdyB0b3dhcmQgdGhlIG91dGZsb3cgYXQgdGhlIGhlYWQgb2YgdGhlIGxvd2VyIHJpdmVyLlxuICAgICAgY29uc3QgaGVhZCA9IHRoaXMubG93ZXIucG9pbnRzW3RoaXMubG93ZXIucG9pbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZHJpZnQgPSB0b3dhcmRzKHgsIHosIGhlYWQsIDAuMDgpO1xuICAgICAgcmV0dXJuIHsgYm9keTogJ2xha2UnLCAuLi5kcmlmdCB9O1xuICAgIH1cbiAgICByZXR1cm4geyBib2R5OiAnc2VhJywgZHg6IDAsIGR6OiAwLCBzcGVlZDogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSB1cHBlclNvdXJjZSgpOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0ge1xuICAgIGNvbnN0IHB0cyA9IHRoaXMudXBwZXIhLnBvaW50cztcbiAgICByZXR1cm4gcHRzW3B0cy5sZW5ndGggLSAxXTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b3dhcmRzKHg6IG51bWJlciwgejogbnVtYmVyLCBwOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0sIHNwZWVkOiBudW1iZXIpIHtcbiAgY29uc3QgZHggPSBwLnggLSB4LCBkeiA9IHAueiAtIHo7XG4gIGNvbnN0IGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KSB8fCAxO1xuICByZXR1cm4geyBkeDogZHggLyBsZW4sIGR6OiBkeiAvIGxlbiwgc3BlZWQgfTtcbn1cblxuLyoqIEZpbmQgdGhlIHZhbGxleSBsYWtlIGZyb20gdGhlIHRlcnJhaW4gaXRzZWxmOiB0aGUgZGVlcCBiYXNpbiBOVyBvZiB0aGUgZm91bmRlciB2YWxsZXkuICovXG5mdW5jdGlvbiBsb2NhdGVMYWtlKGg6IEhlaWdodFNhbXBsZXIpOiBIeWRyb2xvZ3lbJ2xha2UnXSB7XG4gIGxldCBzeCA9IDAsIHN6ID0gMCwgbiA9IDAsIG1pblggPSBJbmZpbml0eSwgbWF4WCA9IC1JbmZpbml0eSwgbWluWiA9IEluZmluaXR5LCBtYXhaID0gLUluZmluaXR5O1xuICBmb3IgKGxldCB6ID0gLTQ2MDsgeiA8PSAtMTIwOyB6ICs9IDQpIHtcbiAgICBmb3IgKGxldCB4ID0gLTQ4MDsgeCA8PSAtNDA7IHggKz0gNCkge1xuICAgICAgaWYgKGgoeCwgeikgPiAtNCkgY29udGludWU7XG4gICAgICBzeCArPSB4OyBzeiArPSB6OyBuKys7XG4gICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgeCk7IG1heFggPSBNYXRoLm1heChtYXhYLCB4KTtcbiAgICAgIG1pblogPSBNYXRoLm1pbihtaW5aLCB6KTsgbWF4WiA9IE1hdGgubWF4KG1heFosIHopO1xuICAgIH1cbiAgfVxuICBpZiAobiA9PT0gMCkgcmV0dXJuIHsgeDogLTI2MCwgejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH07XG4gIHJldHVybiB7XG4gICAgeDogc3ggLyBuLCB6OiBzeiAvIG4sXG4gICAgcng6IE1hdGgubWF4KDMwLCAobWF4WCAtIG1pblgpIC8gMiArIDEwKSwgcno6IE1hdGgubWF4KDMwLCAobWF4WiAtIG1pblopIC8gMiArIDEwKSxcbiAgfTtcbn1cblxuLyoqXG4gKiBUcmFjZSB0aGUgY2FydmVkIGxvd2xhbmQgY2hhbm5lbCBmcm9tIHRoZSBsYWtlIG91dGZsb3cgc291dGggdG8gdGhlIHNlYS4gRm9yXG4gKiBlYWNoIDQgbSByb3cgdGhlIGNoYW5uZWwgaXMgdGhlIGxvd2VzdCBjb2x1bW4gbmVhciB0aGUgcHJldmlvdXMgY2VudHJlOyB0aGVcbiAqIHRyYWNlIGlzIHNtb290aGVkIHNvIHRoZSBmbG93IGZpZWxkIGRvZXMgbm90IGppdHRlciB3aXRoIHRoZSAxIG0gdm94ZWxzLlxuICovXG5mdW5jdGlvbiB0cmFjZUxvd2VyUml2ZXIoaDogSGVpZ2h0U2FtcGxlciwgbGFrZTogSHlkcm9sb2d5WydsYWtlJ10pOiBSaXZlclJlYWNoIHtcbiAgY29uc3QgcmF3OiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGxldCBjeCA9IGxha2UueCArIGxha2UucnggKiAwLjU1O1xuICBsZXQgeiA9IE1hdGgucm91bmQobGFrZS56ICsgbGFrZS5yeiAqIDAuNik7XG4gIC8vIFN0YXJ0IGF0IHRoZSBsYWtlJ3Mgc291dGgtZWFzdCBvdXRmbG93IGFuZCBmb2xsb3cgdGhlIGNoYW5uZWwgZG93bnN0cmVhbS5cbiAgZm9yICg7IHogPD0gOTAwOyB6ICs9IDQpIHtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBieCA9IGN4O1xuICAgIGZvciAobGV0IHggPSBNYXRoLnJvdW5kKGN4IC0gNDApOyB4IDw9IGN4ICsgNDA7IHggKz0gMikge1xuICAgICAgY29uc3QgdiA9IGgoeCwgeikgKyBNYXRoLmFicyh4IC0gY3gpICogMC4wMjtcbiAgICAgIGlmICh2IDwgYmVzdCkgeyBiZXN0ID0gdjsgYnggPSB4OyB9XG4gICAgfVxuICAgIGN4ID0gYng7XG4gICAgcmF3LnB1c2goeyB4OiBieCwgeiB9KTtcbiAgICAvLyBUaGUgdHJhY2UgZW5kcyBvbmNlIGl0IHJlYWNoZXMgb3BlbiBzZWEgZm9yIGEgc3VzdGFpbmVkIHN0cmV0Y2guXG4gICAgaWYgKGJlc3QgPCAtNiAmJiByYXcubGVuZ3RoID4gMjAgJiYgaChieCwgeiArIDgpIDwgLTYgJiYgaChieCwgeiArIDE2KSA8IC02KSBicmVhaztcbiAgfVxuICBjb25zdCBzbW9vdGggPSByYXcubWFwKChwLCBpKSA9PiB7XG4gICAgbGV0IHN4ID0gMCwgbiA9IDA7XG4gICAgZm9yIChsZXQgayA9IE1hdGgubWF4KDAsIGkgLSA0KTsgayA8PSBNYXRoLm1pbihyYXcubGVuZ3RoIC0gMSwgaSArIDQpOyBrKyspIHsgc3ggKz0gcmF3W2tdLng7IG4rKzsgfVxuICAgIHJldHVybiB7IHg6IHN4IC8gbiwgejogcC56IH07XG4gIH0pO1xuICAvLyBTdG9yZSBkb3duc3RyZWFtLWZpcnN0OiBpbmRleCAwIGlzIHRoZSBzZWEgbW91dGguXG4gIHNtb290aC5yZXZlcnNlKCk7XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gW107XG4gIGxldCBzID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzbW9vdGgubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaSA+IDApIHMgKz0gTWF0aC5oeXBvdChzbW9vdGhbaV0ueCAtIHNtb290aFtpIC0gMV0ueCwgc21vb3RoW2ldLnogLSBzbW9vdGhbaSAtIDFdLnopO1xuICAgIHBvaW50cy5wdXNoKHsgeDogc21vb3RoW2ldLngsIHo6IHNtb290aFtpXS56LCBzLCBsZXZlbDogMCwgd2lkdGg6IDYgfSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBSaXZlclJlYWNoKHBvaW50cywgNDApO1xufVxuXG4vKiogV2F0ZXItc3VyZmFjZSBkcm9wcyBhbG9uZyB0aGUgdXBwZXIgcml2ZXIsIGFzIChmcmFjdGlvbiBvZiBsZW5ndGgsIG1ldHJlcykuICovXG5jb25zdCBGQUxMUzogUmVhZG9ubHlBcnJheTxyZWFkb25seSBbbnVtYmVyLCBudW1iZXJdPiA9IFtbMC4yLCA3XSwgWzAuNDgsIDExXSwgWzAuNzQsIDEzXV07XG5jb25zdCBVUFBFUl9HUkFESUVOVCA9IDAuMDM7XG5cbi8qKlxuICogQXV0aG9yIHRoZSB2MiBtb3VudGFpbiByaXZlcjogYSBzZWVkZWQgbWVhbmRlcmluZyBjZW50cmVsaW5lIGZyb20gdGhlIGxha2Unc1xuICogbm9ydGggc2hvcmUgdG8gYSBoaWdobGFuZCB0YXJuLCB3aXRoIGEgbGV2ZWwgcHJvZmlsZSB0aGF0IG9ubHkgcmlzZXNcbiAqIHVwc3RyZWFtIChnZW50bGUgZ3JhZGllbnQgcGx1cyB0aHJlZSBjYXNjYWRlcykuXG4gKi9cbmZ1bmN0aW9uIGF1dGhvclVwcGVyUml2ZXIoc2VlZDogbnVtYmVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IHtcbiAgcmVhY2g6IFJpdmVyUmVhY2g7IHRhcm46IE5vbk51bGxhYmxlPEh5ZHJvbG9neVsndGFybiddPjtcbn0ge1xuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChzZWVkIF4gMHg1ZWVkMikgPj4+IDApO1xuICBjb25zdCBqID0gKGE6IG51bWJlcikgPT4gKHJuZCgpIC0gMC41KSAqIDIgKiBhO1xuICBjb25zdCBtb3V0aCA9IHsgeDogbGFrZS54ICsgbGFrZS5yeCAqIDAuMSwgejogbGFrZS56IC0gbGFrZS5yeiAqIDAuNTUgfTtcbiAgY29uc3QgY29udHJvbHMgPSBbXG4gICAgbW91dGgsXG4gICAgeyB4OiBsYWtlLnggKyAyMCArIGooMjApLCB6OiAtNDEwICsgaigxNSkgfSxcbiAgICB7IHg6IC0xOTAgKyBqKDM1KSwgejogLTUyMCArIGooMjApIH0sXG4gICAgeyB4OiAtMjE1ICsgaigzNSksIHo6IC02NDAgKyBqKDIwKSB9LFxuICAgIHsgeDogLTE2NSArIGooMzApLCB6OiAtNzcwICsgaigxNSkgfSxcbiAgXTtcbiAgLy8gQ2F0bXVsbC1Sb20gdGhyb3VnaCB0aGUgY29udHJvbHMsIHRoZW4gcmVzYW1wbGUgYXQgfjggbSBzcGFjaW5nIHdpdGggYVxuICAvLyBzbWFsbCBzZWVkZWQgbWVhbmRlciBzbyB0aGUgY2hhbm5lbCBpcyBub3QgYSBzbW9vdGggc3BsaW5lLlxuICBjb25zdCBkZW5zZTogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbnRyb2xzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGNvbnN0IHAwID0gY29udHJvbHNbTWF0aC5tYXgoMCwgaSAtIDEpXSwgcDEgPSBjb250cm9sc1tpXTtcbiAgICBjb25zdCBwMiA9IGNvbnRyb2xzW2kgKyAxXSwgcDMgPSBjb250cm9sc1tNYXRoLm1pbihjb250cm9scy5sZW5ndGggLSAxLCBpICsgMildO1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgMjQ7IGsrKykge1xuICAgICAgY29uc3QgdCA9IGsgLyAyNCwgdDIgPSB0ICogdCwgdDMgPSB0MiAqIHQ7XG4gICAgICBkZW5zZS5wdXNoKHtcbiAgICAgICAgeDogMC41ICogKDIgKiBwMS54ICsgKC1wMC54ICsgcDIueCkgKiB0ICsgKDIgKiBwMC54IC0gNSAqIHAxLnggKyA0ICogcDIueCAtIHAzLngpICogdDJcbiAgICAgICAgICArICgtcDAueCArIDMgKiBwMS54IC0gMyAqIHAyLnggKyBwMy54KSAqIHQzKSxcbiAgICAgICAgejogMC41ICogKDIgKiBwMS56ICsgKC1wMC56ICsgcDIueikgKiB0ICsgKDIgKiBwMC56IC0gNSAqIHAxLnogKyA0ICogcDIueiAtIHAzLnopICogdDJcbiAgICAgICAgICArICgtcDAueiArIDMgKiBwMS56IC0gMyAqIHAyLnogKyBwMy56KSAqIHQzKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBkZW5zZS5wdXNoKGNvbnRyb2xzW2NvbnRyb2xzLmxlbmd0aCAtIDFdKTtcbiAgY29uc3QgcmVzYW1wbGVkOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyOyBzOiBudW1iZXIgfT4gPSBbeyAuLi5kZW5zZVswXSwgczogMCB9XTtcbiAgbGV0IGFjYyA9IDAsIHMgPSAwO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGRlbnNlLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgc3RlcCA9IE1hdGguaHlwb3QoZGVuc2VbaV0ueCAtIGRlbnNlW2kgLSAxXS54LCBkZW5zZVtpXS56IC0gZGVuc2VbaSAtIDFdLnopO1xuICAgIGFjYyArPSBzdGVwOyBzICs9IHN0ZXA7XG4gICAgaWYgKGFjYyA+PSA4IHx8IGkgPT09IGRlbnNlLmxlbmd0aCAtIDEpIHtcbiAgICAgIGNvbnN0IG0gPSAoZmJtMihzIC8gNjAsIDMuMSwgc2VlZCArIDgwMSwgMikgLSAwLjUpICogMTQ7XG4gICAgICByZXNhbXBsZWQucHVzaCh7IHg6IGRlbnNlW2ldLnggKyBtLCB6OiBkZW5zZVtpXS56LCBzIH0pO1xuICAgICAgYWNjID0gMDtcbiAgICB9XG4gIH1cbiAgY29uc3QgdG90YWwgPSByZXNhbXBsZWRbcmVzYW1wbGVkLmxlbmd0aCAtIDFdLnM7XG4gIGNvbnN0IGxldmVsQXQgPSAoc3Y6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgbGV0IGxldmVsID0gc3YgKiBVUFBFUl9HUkFESUVOVDtcbiAgICBmb3IgKGNvbnN0IFtmcmFjLCBkcm9wXSBvZiBGQUxMUykge1xuICAgICAgLy8gRWFjaCBmYWxsIGlzIGEgc2hvcnQgY2FzY2FkZSBvdmVyIH4xMCBtIG9mIGNoYW5uZWwuXG4gICAgICBsZXZlbCArPSBkcm9wICogc21vb3Roc3RlcCh0b3RhbCAqIGZyYWMgLSA1LCB0b3RhbCAqIGZyYWMgKyA1LCBzdik7XG4gICAgfVxuICAgIC8vIFRoZSBmaXJzdCA0MCBtIGludG8gdGhlIGxha2Ugc3RheXMgYXQgbGFrZSBsZXZlbC5cbiAgICByZXR1cm4gc3YgPCA0MCA/IDAgOiBsZXZlbCAtIDQwICogVVBQRVJfR1JBRElFTlQ7XG4gIH07XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gcmVzYW1wbGVkLm1hcCgocCkgPT4gKHtcbiAgICB4OiBwLngsIHo6IHAueiwgczogcC5zLCBsZXZlbDogTWF0aC5tYXgoMCwgbGV2ZWxBdChwLnMpKSxcbiAgICB3aWR0aDogMy4yICsgMi4yICogZmJtMihwLnMgLyA3MCwgOS43LCBzZWVkICsgODAyLCAyKSArICgxIC0gcC5zIC8gdG90YWwpICogMS41LFxuICB9KSk7XG4gIGNvbnN0IHNvdXJjZSA9IHBvaW50c1twb2ludHMubGVuZ3RoIC0gMV07XG4gIHJldHVybiB7XG4gICAgcmVhY2g6IG5ldyBSaXZlclJlYWNoKHBvaW50cywgMTEwKSxcbiAgICB0YXJuOiB7IHg6IHNvdXJjZS54LCB6OiBzb3VyY2UueiwgcjogMTgsIGxldmVsOiBzb3VyY2UubGV2ZWwgfSxcbiAgfTtcbn1cbiIsICIvLyBWb3hlbCBtYXRlcmlhbCBpZHMuIFB1cmUgZGF0YSBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIgKEQtMDA1KS5cbi8vIElkcyBhcmUgcGVyc2lzdGVkIGluIHNuYXBzaG90IGVkaXRzLCBzbyBleGlzdGluZyB2YWx1ZXMgbXVzdCBuZXZlciBjaGFuZ2UuXG5leHBvcnQgY29uc3QgTUFUID0ge1xuICBBSVI6IDAsXG4gIEdSQVNTOiAxLFxuICBTT0lMOiAyLFxuICBTQU5EOiAzLFxuICBHUkFWRUw6IDQsXG4gIFNUT05FOiA1LFxuICBPUkU6IDYsXG4gIFdBVEVSOiA3LFxuICBCRURST0NLOiA4LFxuICBNT1NTOiA5LFxuICAvKiogR2VuZXJhdG9yIHYyIGhpZ2hsYW5kcy4gTmV2ZXIgcHJvZHVjZWQgYnkgZ2VuZXJhdG9yIHYxLiAqL1xuICBTTk9XOiAxMCxcbn0gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBNYXRJZCA9ICh0eXBlb2YgTUFUKVtrZXlvZiB0eXBlb2YgTUFUXTtcblxuZXhwb3J0IGNvbnN0IGlzU29saWQgPSAobTogbnVtYmVyKTogYm9vbGVhbiA9PiBtICE9PSBNQVQuQUlSICYmIG0gIT09IE1BVC5XQVRFUjtcbmV4cG9ydCBjb25zdCBpc09wYXF1ZSA9IGlzU29saWQ7XG5cbi8qKiBIaWdoZXN0IG1hdGVyaWFsIGlkIHRoYXQgbWF5IGFwcGVhciBpbiBhIHZveGVsIGVkaXQuICovXG5leHBvcnQgY29uc3QgTUFYX01BVF9JRCA9IDEwO1xuIiwgIi8vIFRlcnJhaW4gZ2VuZXJhdG9yIHYyIFx1MjAxNCB0aGUgdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSAocHVyZSBUUywgRC0wMDUpLlxuLy9cbi8vIENvbXBhdGliaWxpdHkgY29udHJhY3Q6IGluc2lkZSB0aGUgZm91bmRlciBjb3JyaWRvciAodGhlIHNldHRsZW1lbnQgdmFsbGV5LFxuLy8gdGhlIGxha2UgYW5kIHRoZSBsb3dsYW5kIHJpdmVyKSB2MiBoZWlnaHRzIGVxdWFsIHYxIGV4YWN0bHksIHNvIHRoZSBwaW5uZWRcbi8vIGZvdW5kZXIgcHJvamVjdHMsIHRoZWlyIHByZXBhcmF0aW9uIHRhcmdldHMgYW5kIG5hdHVyYWwgZW50aXRpZXMgdGhlcmUgYXJlXG4vLyB1bmNoYW5nZWQuIE91dHNpZGUgaXQgdjIgYWRkczpcbi8vICAgLSBhIG5vcnRoZXJuIG1hc3NpZiBvbiBhbiBleHRlbmRlZCBpc2xhbmQsIHdpdGggc25vdyBhYm92ZSB0aGUgc25vd2xpbmU7XG4vLyAgIC0gZmxhbmtpbmcgcmFuZ2VzIHdlc3QgYW5kIGVhc3Qgb2YgdGhlIHZhbGxleSwgdGVycmFjZWQgaW50byBjbGlmZiBiYW5kcztcbi8vICAgLSBhIG1vdW50YWluIHJpdmVyIGNhcnZlZCBpbnRvIHRoZSBtYXNzaWYgZnJvbSBhIHRhcm4gZG93biB0byB0aGUgbGFrZSxcbi8vICAgICB3aG9zZSB3YXRlciBzdXJmYWNlIGNvbWVzIGZyb20gSHlkcm9sb2d5IGFuZCBuZXZlciByaXNlcyBkb3duc3RyZWFtO1xuLy8gICAtIGEgY29udGludW91cyBsb3dsYW5kIGNoYW5uZWwgKHYxIGhhcyBhIGRyeSBmb3JkIHNvdXRoIG9mIHRoZSBzaGVsZikuXG4vLyBIZWlnaHRzIGFyZSBpbnRlZ2VycyBpbiBbLTE0LCAxMDRdLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIGxlcnAsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7IE1BVCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5cbmV4cG9ydCBjb25zdCBWMl9TTk9XTElORSA9IDc0O1xuZXhwb3J0IGNvbnN0IFYyX01BWF9IRUlHSFQgPSAxMDQ7XG5cbmV4cG9ydCB0eXBlIFYxSGVpZ2h0ID0gKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IG51bWJlcjtcblxuZXhwb3J0IGludGVyZmFjZSBWMkNvbHVtbiB7XG4gIC8qKiBUb3Agc29saWQgeSArIDEgKHNhbWUgY29udmVudGlvbiBhcyBzdXJmYWNlSGVpZ2h0QXQpLiAqL1xuICBoOiBudW1iZXI7XG4gIC8qKiBXYXRlciBzdXJmYWNlIGZvciB0aGlzIGNvbHVtbjogY2VsbHMgW2gsIGxldmVsKSBob2xkIHdhdGVyLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogVHJ1ZSB3aGVuIHRoaXMgY29sdW1uIGlzIHBhcnQgb2YgdGhlIGNhcnZlZCBtb3VudGFpbi1yaXZlciBjaGFubmVsLiAqL1xuICBjaGFubmVsOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgVGVycmFpblYyIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcmVhZG9ubHkgc2VlZDogbnVtYmVyLFxuICAgIHByaXZhdGUgcmVhZG9ubHkgdjE6IFYxSGVpZ2h0LFxuICAgIHJlYWRvbmx5IGh5ZHJvbG9neTogSHlkcm9sb2d5LFxuICApIHt9XG5cbiAgLyoqIDAgPSBleGFjdGx5IHYxIChmb3VuZGVyIGNvcnJpZG9yKTsgMSA9IGZ1bGwgdjIgcmVsaWVmLiAqL1xuICByZWxpZWZNYXNrKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTM5MCwgLTQ3MCwgeik7XG4gICAgLy8gVGhlIHdlc3QgcmFuZ2Uga2VlcHMgY2xlYXIgb2YgdGhlIGxha2UgYmFzaW4gdW50aWwgdGhlIGxha2UgaXMgcGFzc2VkLlxuICAgIGNvbnN0IHdlc3RFZGdlID0gbGVycCgtNDUwLCAtMzIwLCBzbW9vdGhzdGVwKC0yMjAsIC0xNDAsIHopKTtcbiAgICBjb25zdCB3ZXN0ID0gc21vb3Roc3RlcCh3ZXN0RWRnZSwgd2VzdEVkZ2UgLSA5MCwgeCk7XG4gICAgY29uc3QgZWFzdCA9IHNtb290aHN0ZXAoMjMwLCAzMzAsIHgpO1xuICAgIHJldHVybiBNYXRoLm1heChub3J0aCwgd2VzdCwgZWFzdCk7XG4gIH1cblxuICAvKiogMCBhdCB0aGUgcmFuZ2UgZnJvbnQsIDEgZGVlcCBpbnNpZGU6IGZvb3RoaWxscyBmaXJzdCwgcGVha3MgYmVoaW5kLiAqL1xuICByYW5nZURlcHRoKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTQyMCwgLTcwMCwgeik7XG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlIC0gNDAsIHdlc3RFZGdlIC0gMzAwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyNzAsIDU2MCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFYyQ29sdW1uIHtcbiAgICBjb25zdCBzZWVkID0gdGhpcy5zZWVkO1xuICAgIGNvbnN0IGJhc2UgPSB0aGlzLnYxKHNlZWQsIHgsIHopO1xuICAgIGNvbnN0IG1hc2sgPSB0aGlzLnJlbGllZk1hc2soeCwgeik7XG4gICAgbGV0IGggPSBiYXNlO1xuXG4gICAgaWYgKG1hc2sgPiAwKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGlzbGFuZCBub3J0aCBzbyB0aGUgbWFzc2lmIGhhcyByb29tICh2MSBjb2FzdCBpcyB+eiAtNjAwKS5cbiAgICAgIGNvbnN0IG5vcnRoTGFuZCA9IHNtb290aHN0ZXAoLTQyMCwgLTUyMCwgeik7XG4gICAgICBjb25zdCBzaG9yZSA9IDEgLSBNYXRoLmh5cG90KCh4ICsgMTUwKSAvIDU2MCwgKHogKyA2OTApIC8gMzAwKVxuICAgICAgICArIChmYm0yKHggLyAxNjAsIHogLyAxNjAsIHNlZWQgKyA3MDEsIDMpIC0gMC41KSAqIDAuMztcbiAgICAgIGNvbnN0IGxhbmROID0gc21vb3Roc3RlcCgwLjAsIDAuMTQsIHNob3JlKSAqIG5vcnRoTGFuZDtcbiAgICAgIGNvbnN0IGdyb3VuZCA9IGxlcnAoYmFzZSwgTWF0aC5tYXgoYmFzZSwgNSArIDUgKiBmYm0yKHggLyA5MCwgeiAvIDkwLCBzZWVkICsgNzAyLCAyKSksIGxhbmROKTtcblxuICAgICAgLy8gUmlkZ2VkIG1hc3NpZiB3aXRoIHRlcnJhY2VkIGNsaWZmIGJhbmRzLlxuICAgICAgY29uc3Qgd3ggPSB4ICsgKGZibTIoeCAvIDI2MCwgeiAvIDI2MCwgc2VlZCArIDcwMywgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3Qgd3ogPSB6ICsgKGZibTIoeCAvIDI2MCArIDUuMSwgeiAvIDI2MCAtIDIuNywgc2VlZCArIDcwNCwgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3QgcjEgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMTAsIHd6IC8gMjEwLCBzZWVkICsgNzA1LCA0KSAtIDEpO1xuICAgICAgY29uc3QgcjIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4MCwgd3ogLyA4MCwgc2VlZCArIDcwNiwgMykgLSAxKTtcbiAgICAgIGNvbnN0IGx1bXAgPSBmYm0yKHd4IC8gMTIwLCB3eiAvIDEyMCwgc2VlZCArIDcwNywgMyk7XG4gICAgICBjb25zdCBkZXB0aCA9IHRoaXMucmFuZ2VEZXB0aCh4LCB6KTtcbiAgICAgIGxldCBtb3VudGFpbiA9IDE2ICsgKDggKyA4MCAqIGRlcHRoKSAqICgwLjU1ICogcjEgKiByMSArIDAuMjggKiByMiArIDAuMTcgKiBsdW1wKVxuICAgICAgICArIDE4ICogZGVwdGggKiBzbW9vdGhzdGVwKDAuNTUsIDAuOSwgcjEpO1xuICAgICAgY29uc3QgYmFuZCA9IDYgKyAyICogZmJtMih4IC8gMTQwLCB6IC8gMTQwLCBzZWVkICsgNzA4LCAyKTtcbiAgICAgIGNvbnN0IHQgPSBNYXRoLmZsb29yKG1vdW50YWluIC8gYmFuZCk7XG4gICAgICBjb25zdCBmcmFjID0gbW91bnRhaW4gLyBiYW5kIC0gdDtcbiAgICAgIG1vdW50YWluID0gKHQgKyBzbW9vdGhzdGVwKDAuNSwgMC44LCBmcmFjKSkgKiBiYW5kO1xuXG4gICAgICAvLyBPbmx5IGxhbmQgcmlzZXM7IHRoZSBzZWEgc3RheXMgc2VhLCBzbyByYW5nZXMgZW5kIGluIGNvYXN0YWwgY2xpZmZzLlxuICAgICAgY29uc3QgbGFuZEZhY3RvciA9IHNtb290aHN0ZXAoLTIsIDgsIGdyb3VuZCk7XG4gICAgICBoID0gbGVycChncm91bmQsIE1hdGgubWF4KGdyb3VuZCwgbW91bnRhaW4pLCBtYXNrICogbGFuZEZhY3Rvcik7XG4gICAgfVxuXG4gICAgbGV0IGxldmVsID0gaCA8IDAgPyAwIDogLUluZmluaXR5O1xuICAgIGxldCBjaGFubmVsID0gZmFsc2U7XG5cbiAgICAvLyBNb3VudGFpbiByaXZlcjogdmFsbGV5IGZsb29yLCBiYW5rcyBhbmQgY2hhbm5lbCBmb2xsb3cgdGhlIHdhdGVyIGxldmVsLlxuICAgIGNvbnN0IHVwcGVyID0gdGhpcy5oeWRyb2xvZ3kudXBwZXI7XG4gICAgaWYgKHVwcGVyKSB7XG4gICAgICBjb25zdCBoaXQgPSB1cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICBjb25zdCByYWlzZWQgPSBoaXQubGV2ZWwgPiAwLjI1O1xuICAgICAgICBjb25zdCB2dyA9IDU1ICsgMjggKiBmYm0yKGhpdC5zIC8gOTAsIDEuNywgc2VlZCArIDcwOSwgMik7XG4gICAgICAgIGNvbnN0IGZsb29yID0gaGl0LmxldmVsICsgMS41ICsgMi4yICogZmJtMih4IC8gNDAsIHogLyA0MCwgc2VlZCArIDcxMCwgMikgKyBoaXQuZCAqIDAuMDY7XG4gICAgICAgIGNvbnN0IHQgPSBzbW9vdGhzdGVwKHZ3ICogMC4zLCB2dywgaGl0LmQpO1xuICAgICAgICBoID0gTWF0aC5taW4oaCwgbGVycChmbG9vciwgaCwgdCkpO1xuICAgICAgICBjb25zdCB3ID0gaGl0LndpZHRoO1xuICAgICAgICBpZiAocmFpc2VkICYmIGhpdC5kIDwgdyArIDMpIHtcbiAgICAgICAgICAvLyBCYW5rcyBob2xkIGEgcmFpc2VkIHJpdmVyOiBuZXZlciBiZWxvdyBpdHMgd2F0ZXIgc3VyZmFjZS4gQXQgbGFrZVxuICAgICAgICAgIC8vIGxldmVsIHRoZSBzZWEtbGV2ZWwgZmlsbCBhbHJlYWR5IGNvbnRhaW5zIHRoZSB3YXRlci5cbiAgICAgICAgICBoID0gTWF0aC5tYXgoaCwgTWF0aC5jZWlsKGhpdC5sZXZlbCkgKyAxKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaGl0LmQgPCB3KSB7XG4gICAgICAgICAgY29uc3QgYmVkID0gaGl0LmxldmVsIC0gKDEuMiArIDEuMyAqICgxIC0gaGl0LmQgLyB3KSk7XG4gICAgICAgICAgaCA9IE1hdGgubWluKGgsIGJlZCk7XG4gICAgICAgICAgaWYgKHJhaXNlZCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZChoaXQubGV2ZWwpKTtcbiAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgdGFybiA9IHRoaXMuaHlkcm9sb2d5LnRhcm47XG4gICAgICBpZiAodGFybikge1xuICAgICAgICBjb25zdCB0ZCA9IE1hdGguaHlwb3QoeCAtIHRhcm4ueCwgeiAtIHRhcm4ueilcbiAgICAgICAgICAqICgxICsgMC4yICogKGZibTIoeCAvIDMwLCB6IC8gMzAsIHNlZWQgKyA3MTEsIDIpIC0gMC41KSk7XG4gICAgICAgIGlmICh0ZCA8IHRhcm4uciArIDYpIHtcbiAgICAgICAgICBjb25zdCByaW0gPSBNYXRoLmNlaWwodGFybi5sZXZlbCkgKyAxO1xuICAgICAgICAgIGlmICh0ZCA+PSB0YXJuLnIpIGggPSBNYXRoLm1heChoLCByaW0pO1xuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaCA9IE1hdGgubWluKE1hdGgubWF4KGgsIHJpbSksIHRhcm4ubGV2ZWwgLSAxIC0gMyAqIHNtb290aHN0ZXAodGFybi5yLCAwLCB0ZCkpO1xuICAgICAgICAgICAgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZCh0YXJuLmxldmVsKSk7XG4gICAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBMb3dsYW5kIGNoYW5uZWwgY29udGludWl0eTogdjEgbGVhdmVzIGEgZHJ5IGZvcmQgd2hlcmUgdGhlIHNoZWxmIG1lZXRzIHRoZSByaXZlci5cbiAgICBjb25zdCBsb3cgPSB0aGlzLmh5ZHJvbG9neS5sb3dlci5uZWFyZXN0KHgsIHopO1xuICAgIGlmIChsb3cgJiYgbG93LmQgPCAyLjUgJiYgaCA+PSAwICYmIGJhc2UgPCA0KSBoID0gLTE7XG5cbiAgICBoID0gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIFYyX01BWF9IRUlHSFQpKTtcbiAgICBpZiAoaCA8IDApIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIDApO1xuICAgIHJldHVybiB7IGgsIGxldmVsOiBsZXZlbCA9PT0gLUluZmluaXR5ID8gaCA6IGxldmVsLCBjaGFubmVsIH07XG4gIH1cblxuICBoZWlnaHQoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmNvbHVtbih4LCB6KS5oO1xuICB9XG5cbiAgLyoqIHYyIHRvcCBtYXRlcmlhbC4gRmFsbHMgYmFjayB0byB0aGUgdjEgcnVsZXMgZm9yIHRoZSB1bmNoYW5nZWQgY29ycmlkb3IuICovXG4gIHRvcE1hdGVyaWFsKFxuICAgIHg6IG51bWJlciwgejogbnVtYmVyLCBjb2w6IFYyQ29sdW1uLCBzbG9wZTogbnVtYmVyLFxuICAgIHYxVG9wOiAoaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyKSA9PiBNYXRJZCxcbiAgKTogTWF0SWQge1xuICAgIGNvbnN0IGggPSBjb2wuaDtcbiAgICBpZiAoY29sLmNoYW5uZWwgJiYgY29sLmxldmVsID4gaCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIgJiYgaCA+IDEpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDwgaGl0LndpZHRoICsgMi41ICYmIGhpdC5sZXZlbCA+IDAuMjUpIHtcbiAgICAgICAgcmV0dXJuIGZibTIoeCAvIDYsIHogLyA2LCB0aGlzLnNlZWQgKyA3MTIsIDEpID4gMC41ID8gTUFULkdSQVZFTCA6IE1BVC5TQU5EO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzbm93bGluZSA9IFYyX1NOT1dMSU5FICsgKGZibTIoeCAvIDcwLCB6IC8gNzAsIHRoaXMuc2VlZCArIDcxMywgMykgLSAwLjUpICogMTY7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgJiYgc2xvcGUgPD0gMykgcmV0dXJuIE1BVC5TTk9XO1xuICAgIGlmIChoID49IHNub3dsaW5lIC0gNiAmJiBzbG9wZSA8PSAxICYmIGZibTIoeCAvIDIwLCB6IC8gMjAsIHRoaXMuc2VlZCArIDcxNCwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKHRoaXMucmVsaWVmTWFzayh4LCB6KSA+IDAuNSAmJiBoID4gMzAgJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgICByZXR1cm4gdjFUb3AoaCwgc2xvcGUpO1xuICB9XG59XG4iLCAiLy8gU2ltdWxhdGlvbiBsYXllciBcdTIwMTQgcHVyZSBUeXBlU2NyaXB0LCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMSB3b3JsZCBmb3VuZGF0aW9uOiBhIGNodW5rZWQsIGdlbnVpbmVseSB0aHJlZS1kaW1lbnNpb25hbCB2b3hlbCB3b3JsZC5cbi8vIFRoZSBzdG9yZWQgc3RhdGUgaXMgb25lIG1hdGVyaWFsIGJ5dGUgcGVyIGNlbGwgKDAgPSBhaXIpOyBvY2N1cGFuY3kgaXNcbi8vIGltcGxpY2l0LiBTdXJmYWNlIGhlaWdodCBpcyBhIGRlcml2ZWQgcXVlcnksIG5vdCB0aGUgc3RvcmFnZS4gVGhpcyByZXBsYWNlc1xuLy8gdGhlIGZvcm1lciAyNTYgeCAyNTYgaGVpZ2h0ZmllbGQgKHNlZSBJUi0wMDUpLlxuLy9cbi8vIFdvcmxkIG1ldHJlczogeC96IGluIFstMTAyNCwgMTAyNCksIHkgaW4gWy0xNiwgMTEyKSwgc2VhIGxldmVsIDAuXG4vLyBBIGNodW5rIGlzIDMyIHggMzIgeCAxMjggY2VsbHMuIEdlbmVyYXRpb24gaXMgYSBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkLFxuLy8gZ2VuZXJhdG9yIHZlcnNpb24sIHBhcmFtZXRlcnMgYW5kIGNodW5rIGNvb3JkaW5hdGVzOyBlZGl0cyBhcmUgcmVjb3JkZWRcbi8vIHNlcGFyYXRlbHkgYW5kIHJlLWFwcGxpZWQgd2hlbiBhIGNodW5rIGlzIHJlZ2VuZXJhdGVkLlxuaW1wb3J0IHR5cGUgeyBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBMaWZlU3RhdGUgfSBmcm9tICcuL2Vjb25vbXknO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcbmltcG9ydCB7IFRlcnJhaW5WMiwgVjJDb2x1bW4gfSBmcm9tICcuL3RlcnJhaW4tdjInO1xuXG5leHBvcnQgY29uc3QgV09STERfU0laRSA9IDIwNDg7XG5leHBvcnQgY29uc3QgSEFMRiA9IFdPUkxEX1NJWkUgLyAyO1xuZXhwb3J0IGNvbnN0IENIVU5LX1NJWkUgPSAzMjtcbmV4cG9ydCBjb25zdCBDSFVOS1NfUEVSX1NJREUgPSBXT1JMRF9TSVpFIC8gQ0hVTktfU0laRTtcbmV4cG9ydCBjb25zdCBZX01JTiA9IC0xNjtcbmV4cG9ydCBjb25zdCBZX01BWCA9IDExMjtcbmV4cG9ydCBjb25zdCBXT1JMRF9IRUlHSFQgPSBZX01BWCAtIFlfTUlOO1xuZXhwb3J0IGNvbnN0IFNFQV9MRVZFTCA9IDA7XG5leHBvcnQgY29uc3QgV0FURVIgPSBTRUFfTEVWRUw7XG4vKiogR2VuZXJhdG9yIHYxOiB0aGUgb3JpZ2luYWwgMjA0OCBtIGlzbGFuZC4gRGVmYXVsdCBmb3IgY3JlYXRlV29ybGQgYW5kIGFsbCBsZWdhY3kgc2F2ZXMuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1ZFUlNJT04gPSAxO1xuLyoqIEdlbmVyYXRvciB2MjogdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSB3aXRoIGEgbW91bnRhaW4gcml2ZXIgKHNlZSB0ZXJyYWluLXYyLnRzKS4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVjIgPSAyO1xuLyoqIFRoZSBnZW5lcmF0b3IgbmV3IGJyb3dzZXIgd29ybGRzIHVzZSBieSBkZWZhdWx0LiAqL1xuZXhwb3J0IGNvbnN0IExBVEVTVF9HRU5FUkFUT1JfVkVSU0lPTiA9IEdFTkVSQVRPUl9WMjtcbmV4cG9ydCBjb25zdCBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TOiByZWFkb25seSBudW1iZXJbXSA9IFtHRU5FUkFUT1JfVkVSU0lPTiwgR0VORVJBVE9SX1YyXTtcbmV4cG9ydCBjb25zdCBpc1N1cHBvcnRlZEdlbmVyYXRvciA9ICh2OiB1bmtub3duKTogdiBpcyBudW1iZXIgPT5cbiAgdHlwZW9mIHYgPT09ICdudW1iZXInICYmIFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlMuaW5jbHVkZXModik7XG5leHBvcnQgY29uc3QgQ0hVTktfVk9MVU1FID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkUgKiBXT1JMRF9IRUlHSFQ7XG5leHBvcnQgY29uc3QgQ0hVTktfQVJFQSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFO1xuXG5leHBvcnQgeyBNQVQsIGlzU29saWQsIGlzT3BhcXVlLCBNQVhfTUFUX0lEIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuZXhwb3J0IHR5cGUgeyBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IE1BVCwgaXNTb2xpZCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5cbmV4cG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgZmJtMixcbn0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQge1xuICBjbGFtcCwgbGVycCwgc21vb3Roc3RlcCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIHZhbHVlTm9pc2UzLCBmYm0yLCBmYm0zLFxufSBmcm9tICcuL25vaXNlJztcblxuLy8gLS0tLS0tLS0tLSB3b3JsZCB0eXBlcyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkUGFyYW1zIHtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEFSQU1TOiBXb3JsZFBhcmFtcyA9IHtcbiAgc2l6ZTogV09STERfU0laRSxcbiAgY2h1bmtTaXplOiBDSFVOS19TSVpFLFxuICB5TWluOiBZX01JTixcbiAgeU1heDogWV9NQVgsXG4gIHNlYUxldmVsOiBTRUFfTEVWRUwsXG4gIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbENodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAga2V5OiBzdHJpbmc7XG4gIC8qKiB4ICsgeiozMiArICh5LVlfTUlOKSoxMDI0ICovXG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3Agc29saWQgeSwgZW5jb2RlZCBhcyAoeSAtIFlfTUlOKSwgMC4uMTI3OyAwIG1lYW5zIG5vIHNvbGlkLiAqL1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICAvKiogdG9wIG1hdGVyaWFsIHBlciBjb2x1bW4uICovXG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG4gIGRpcnR5OiBib29sZWFuO1xuICBnZW5lcmF0ZWRBdDogbnVtYmVyO1xufVxuXG4vLyBOYXR1cmFsIGFzc2V0cyBhcmUgdGhlIHByb2plY3QncyBTdHlsIChgbmF0X2ApIHBpcGVsaW5lIChBUy0wMDEgdjIpLCBub3Rcbi8vIE5veGVsIGFyY2hpdGVjdHVyZS4gTm94ZWwgcmVtYWlucyB0aGUgaHVtYW4tbWFkZSBraXQvd2F5c3RvbmUvbWFya2VyIHN5c3RlbS5cbi8vIFJldGlyZWQgb25seSBhcyB3b3JsZCBjb250ZW50LiBUaGUgbmFtZXMgcmVtYWluIGluIHRoZSBzZXJpYWxpemVkIHR5cGUgc29cbi8vIG9sZCBzbmFwc2hvdHMgYW5kIGFjY2VwdGVkIGhhcnZlc3Qgam91cm5hbHMgY2FuIGJlIG1pZ3JhdGVkIHdpdGhvdXQgcmVqZWN0aW5nXG4vLyBvdGhlcndpc2UgdmFsaWQgc2F2ZXMuIEdlbmVyYXRpb24sIGNvbGxpc2lvbiBhbmQgaW5zcGVjdGlvbiBuZXZlciB1c2UgdGhlbS5cbmV4cG9ydCBjb25zdCBSRVRJUkVEX1NUT05FX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuXSk7XG5leHBvcnQgY29uc3QgaXNSZXRpcmVkU3RvbmVLaW5kID0gKGtpbmQ6IEVudGl0eUtpbmQpOiBib29sZWFuID0+IFJFVElSRURfU1RPTkVfS0lORFMuaGFzKGtpbmQpO1xuZXhwb3J0IHR5cGUgQWN0aXZlRW50aXR5S2luZCA9IEV4Y2x1ZGU8RW50aXR5S2luZCxcbiAgJ3N0eWxfcm9ja19zbWFsbCcgfCAnc3R5bF9yb2NrX21lZGl1bScgfCAnc3R5bF9yb2NrX2xhcmdlJz47XG5cbmZ1bmN0aW9uIGxpdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogRW50aXR5IHwgbnVsbCB7XG4gIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIHJldHVybiAhZW50aXR5IHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpID8gbnVsbCA6IGVudGl0eTtcbn1cblxuZXhwb3J0IHR5cGUgRW50aXR5S2luZCA9XG4gIHwgJ3N0eWxfdHJlZV9zcGlyZSdcbiAgfCAnc3R5bF90cmVlX3RhYmxlJ1xuICB8ICdzdHlsX3RyZWVfY2x1c3RlcidcbiAgfCAnc3R5bF90cmVlX2Jsb3Nzb20nXG4gIHwgJ3N0eWxfc2hydWInXG4gIHwgJ3N0eWxfcm9ja19zbWFsbCdcbiAgfCAnc3R5bF9yb2NrX21lZGl1bSdcbiAgfCAnc3R5bF9yb2NrX2xhcmdlJ1xuICB8ICdzdHlsX29yZSdcbiAgfCAnc3R5bF9jYWlybidcbiAgfCAnd2F5c3RvbmUnXG4gIHwgJ21hcmtlcic7XG5cbmV4cG9ydCB0eXBlIFJlc291cmNlVHlwZSA9ICd3b29kJyB8ICdzdG9uZScgfCAnb3JlJyB8ICdmaWJlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW50aXR5IHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgY2h1bms6IHN0cmluZztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHNjYWxlOiBudW1iZXI7XG4gIHZhcmlhbnQ6IG51bWJlcjtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIHJlbWFpbmluZzogbnVtYmVyO1xuICB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcjtcbiAgLyoqIFRydWUgb25jZSB0aGUgZW50aXR5IGlzIGZ1bGx5IGRlcGxldGVkLiAqL1xuICBoYXJ2ZXN0ZWQ6IGJvb2xlYW47XG4gIC8qKiBUcnVlIGFmdGVyIHRoZSBmaXJzdCBzdWNjZXNzZnVsIGhhcnZlc3QsIGV2ZW4gaWYgeWllbGQgcmVtYWlucy4gKi9cbiAgaGFydmVzdGVkT25jZT86IGJvb2xlYW47XG4gIHByb3Zpc2lvbmFsOiBib29sZWFuO1xuICBhdXRob3JlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3hlbFNpdGUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWdpb25JbmZvIHtcbiAgaWQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdHlwZTogJ3BsYWluJyB8ICdmb3Jlc3QnIHwgJ2hpbGxzJyB8ICdoaWdobGFuZCcgfCAnd2F0ZXInIHwgJ3JpZGdlJztcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgcng6IG51bWJlcjtcbiAgcno6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFN0YXRzIHtcbiAgY2h1bmtzR2VuZXJhdGVkOiBudW1iZXI7XG4gIGNodW5rc0V2aWN0ZWQ6IG51bWJlcjtcbiAgdm94ZWxzRmlsbGVkOiBudW1iZXI7XG4gIGdlbmVyYXRpb25NczogbnVtYmVyO1xuICBlbnRpdGllczogbnVtYmVyO1xuICB0cmVlczogbnVtYmVyO1xuICBwaW5rVHJlZXM6IG51bWJlcjtcbiAgcGlua092ZXJmbG93OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGQge1xuICBzZWVkOiBudW1iZXI7XG4gIHBhcmFtczogV29ybGRQYXJhbXM7XG4gIGNodW5rczogTWFwPHN0cmluZywgVm94ZWxDaHVuaz47XG4gIGVudGl0aWVzOiBNYXA8c3RyaW5nLCBFbnRpdHk+O1xuICBlbnRpdHlDaHVua3M6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPjtcbiAgLyoqIENodW5rcyB3aG9zZSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZW50aXR5IHN0YXRlIGhhcyBiZWVuIGNoYW5nZWQuICovXG4gIGVudGl0eUNoYW5nZXM6IFNldDxzdHJpbmc+O1xuICAvKiogVG9tYnN0b25lcyBmb3IgcmVtb3ZlZCBkZXRlcm1pbmlzdGljIG5hdHVyYWwgZW50aXRpZXMuICovXG4gIGVudGl0eVJlbW92YWxzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIEF1dGhvcml0YXRpdmUgYnVpbHQgc3RydWN0dXJlcyAoaG91c2UsIHBhdGgsIHRlcnJhY2VzLCBjcm9wcykuICovXG4gIHN0cnVjdHVyZXM6IE1hcDxzdHJpbmcsIFN0cnVjdHVyZT47XG4gIHNpdGVzOiBOb3hlbFNpdGVbXTtcbiAgcmVnaW9uczogUmVnaW9uSW5mb1tdO1xuICAvKiogY2h1bmsga2V5IC0+IGxvY2FsIHZveGVsIGluZGV4IC0+IG1hdGVyaWFsLiBEdXJhYmxlLCBjb21wYWN0IGVkaXRzLiAqL1xuICBlZGl0czogTWFwPHN0cmluZywgTWFwPG51bWJlciwgbnVtYmVyPj47XG4gIC8qKiBHbG9iYWwgbG9jYWwtcGxheWVyIGNhcnJpZWQgYmFnOyBib3VuZGVkIGluIHNjaGVtYSAzLCBsZWdhY3kgaW4gMS8yLiAqL1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQcmVzZW50IG9ubHkgYWZ0ZXIgc2NoZW1hLTMgZ2VuZXNpcy9yZXN0b3JhdGlvbi4gKi9cbiAgbGlmZT86IExpZmVTdGF0ZTtcbiAgZGlydHk6IFNldDxzdHJpbmc+O1xuICBzdGF0czogV29ybGRTdGF0cztcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKlxuICAgKiBNb25vdG9uaWMgcmV2aXNpb24gb2YgYXV0aG9yaXRhdGl2ZSBzdGF0ZSAodm94ZWxzIGFuZCBlbnRpdGllcykuIERlcml2ZWRcbiAgICogY2FjaGVzIGtleWVkIG9uIHRoaXMgdmFsdWUgYXJlIGRpc2NhcmRlZCBhZnRlciBhbiBlZGl0OyBtZXNoL25hdmlnYXRpb25cbiAgICogcmV2aXNpb25zIGFyZSBzZXBhcmF0ZSBiZWNhdXNlIHRoZXkgYXJlIGRlcml2ZWQsIG5vdCB3b3JsZCBzdGF0ZS5cbiAgICovXG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBjaHVua0tleSA9IChjeDogbnVtYmVyLCBjejogbnVtYmVyKSA9PiBgJHtjeH0sJHtjen1gO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWCA9IChjeDogbnVtYmVyKSA9PiBjeCAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWiA9IChjejogbnVtYmVyKSA9PiBjeiAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGxvY2FsSW5kZXggPSAobHg6IG51bWJlciwgeUluZGV4OiBudW1iZXIsIGx6OiBudW1iZXIpID0+XG4gIGx4ICsgbHogKiBDSFVOS19TSVpFICsgeUluZGV4ICogQ0hVTktfQVJFQTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtYID0gKHg6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWiA9ICh6OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFggPSAoeDogbnVtYmVyKSA9PiB4IC0gKHdvcmxkVG9DaHVua1goeCkgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWiA9ICh6OiBudW1iZXIpID0+IHogLSAod29ybGRUb0NodW5rWih6KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB5VG9JbmRleCA9ICh5OiBudW1iZXIpID0+IHkgLSBZX01JTjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGlmICghaXNTdXBwb3J0ZWRHZW5lcmF0b3IoZ2VuZXJhdG9yVmVyc2lvbikpIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24gJHtnZW5lcmF0b3JWZXJzaW9ufWApO1xuICByZXR1cm4ge1xuICAgIHNlZWQsXG4gICAgcGFyYW1zOiB7IC4uLkRFRkFVTFRfUEFSQU1TLCBnZW5lcmF0b3JWZXJzaW9uIH0sXG4gICAgY2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXRpZXM6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaGFuZ2VzOiBuZXcgU2V0KCksXG4gICAgZW50aXR5UmVtb3ZhbHM6IG5ldyBTZXQoKSxcbiAgICBzdHJ1Y3R1cmVzOiBuZXcgTWFwKCksXG4gICAgc2l0ZXM6IFtdLFxuICAgIHJlZ2lvbnM6IFJFR0lPTlMsXG4gICAgZWRpdHM6IG5ldyBNYXAoKSxcbiAgICBpbnZlbnRvcnk6IHt9LFxuICAgIGRpcnR5OiBuZXcgU2V0KCksXG4gICAgc3RhdHM6IHtcbiAgICAgIGNodW5rc0dlbmVyYXRlZDogMCwgY2h1bmtzRXZpY3RlZDogMCwgdm94ZWxzRmlsbGVkOiAwLCBnZW5lcmF0aW9uTXM6IDAsXG4gICAgICBlbnRpdGllczogMCwgdHJlZXM6IDAsIHBpbmtUcmVlczogMCwgcGlua092ZXJmbG93OiAwLFxuICAgIH0sXG4gICAgYXV0aG9yZWRQbGFjZWQ6IGZhbHNlLFxuICAgIHJldmlzaW9uOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVXb3JsZChzZWVkID0gMTMzNywgaW5pdGlhbFJhZGl1cyA9IDAsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkLCBnZW5lcmF0b3JWZXJzaW9uKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNOT1cpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBNQVQuR1JBVkVMO1xuICByZXR1cm4gTUFULlNUT05FO1xufVxuXG5mdW5jdGlvbiBvcmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgY2x1c3RlciA9IGZibTIoeCAvIDU1LCB6IC8gNTUsIHNlZWQgKyAxMzAsIDIpO1xuICBpZiAoY2x1c3RlciA8IDAuNTcpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgbiA9IHZhbHVlTm9pc2UzKHggKiAwLjA5LCB5ICogMC4xMywgeiAqIDAuMDksIHNlZWQgKyAxMzEpO1xuICBjb25zdCBuMiA9IHZhbHVlTm9pc2UzKHggKiAwLjIyICsgNSwgeSAqIDAuMzEsIHogKiAwLjIyIC0gMywgc2VlZCArIDEzMik7XG4gIHJldHVybiBuID4gMC43MCAmJiBuMiA+IDAuNTA7XG59XG5cbmZ1bmN0aW9uIGNhdmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGZibTMoeCAqIDAuMDc1LCB5ICogMC4xMSwgeiAqIDAuMDc1LCBzZWVkICsgMTQwLCAyKSA+IDAuNzI7XG59XG5cbmZ1bmN0aW9uIG92ZXJoYW5nQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWx1ZU5vaXNlMyh4ICogMC4xOCwgeSAqIDAuMjIsIHogKiAwLjE4LCBzZWVkICsgMTQxKSA+IDAuNjI7XG59XG5cbi8vIC0tLS0tLS0tLS0gdmVyc2lvbmVkIGdlbmVyYXRvciBkaXNwYXRjaCAtLS0tLS0tLS0tXG5jb25zdCB2MkNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRlcnJhaW5WMj4oKTtcbmNvbnN0IGh5ZHJvQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSHlkcm9sb2d5PigpO1xuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ3kgbmV0d29yayBmb3IgYSBzZWVkIGFuZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyb2xvZ3lGb3Ioc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIpOiBIeWRyb2xvZ3kge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuaHlkcm9sb2d5O1xuICBjb25zdCBrZXkgPSBgJHtzZWVkfToke3ZlcnNpb259YDtcbiAgbGV0IGh5ZHJvID0gaHlkcm9DYWNoZS5nZXQoa2V5KTtcbiAgaWYgKCFoeWRybykge1xuICAgIGh5ZHJvID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb24sIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGh5ZHJvQ2FjaGUuc2V0KGtleSwgaHlkcm8pO1xuICB9XG4gIHJldHVybiBoeWRybztcbn1cblxuLyoqIEBpbnRlcm5hbCBUaGUgdjIgZ2VuZXJhdG9yIGZvciBhIHNlZWQgKGNhY2hlZDsgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCkuICovXG5leHBvcnQgZnVuY3Rpb24gdGVycmFpblYyKHNlZWQ6IG51bWJlcik6IFRlcnJhaW5WMiB7XG4gIGxldCBnZW4gPSB2MkNhY2hlLmdldChzZWVkKTtcbiAgaWYgKCFnZW4pIHtcbiAgICBjb25zdCBoeWRyb2xvZ3kgPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbjogR0VORVJBVE9SX1YyLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBnZW4gPSBuZXcgVGVycmFpblYyKHNlZWQsIHN1cmZhY2VIZWlnaHRBdCwgaHlkcm9sb2d5KTtcbiAgICB2MkNhY2hlLnNldChzZWVkLCBnZW4pO1xuICB9XG4gIHJldHVybiBnZW47XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCBoZWlnaHQgKHRvcCBzb2xpZCArIDEpIGZvciBhbnkgc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkuaGVpZ2h0KHgsIHopIDogc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgd2F0ZXIgc3VyZmFjZTogd2F0ZXIgZmlsbHMgY2VsbHMgW2hlaWdodCwgbGV2ZWwpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VXYXRlckxldmVsQXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmNvbHVtbih4LCB6KS5sZXZlbDtcbiAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgOiBoO1xufVxuXG5mdW5jdGlvbiB2ZXJzaW9uZWRTbG9wZShzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogKyAxKSksXG4gICk7XG59XG5cbi8qKiBCYXNlIHRvcCBtYXRlcmlhbCBmb3IgYW55IGdlbmVyYXRvciB2ZXJzaW9uIChtYWNybyBMT0QsIGVudGl0eSBwbGFjZW1lbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbEZvcihcbiAgc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGdlbiA9IHRlcnJhaW5WMihzZWVkKTtcbiAgICByZXR1cm4gZ2VuLnRvcE1hdGVyaWFsKHgsIHosIGdlbi5jb2x1bW4oeCwgeiksIHNsb3BlLFxuICAgICAgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoaCwgc3MsIG5lYXJXYXRlcikpO1xuICB9XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB5OiBudW1iZXI7XG4gIHRvcDogTWF0SWQ7XG4gIHNsb3BlOiBudW1iZXI7XG59XG5cbi8qKiBCYXNlIHN1cmZhY2Ugc2FtcGxlIGZvciBtYWNybyBMT0QuIERvZXMgbm90IGluY2x1ZGUgdm94ZWwgZWRpdHMvb3ZlcmhhbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZVN1cmZhY2Uoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFN1cmZhY2VTYW1wbGUge1xuICBjb25zdCB5ID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICBjb25zdCBzbG9wZSA9IHNsb3BlQXQoc2VlZCwgeCwgeiwgeSk7XG4gIHJldHVybiB7IHksIHRvcDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCB5LCBzbG9wZSksIHNsb3BlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2h1bmsgZ2VuZXJhdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICByZXR1cm4gZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuXG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IGRhdGEgPSBuZXcgVWludDhBcnJheShDSFVOS19WT0xVTUUpO1xuICBjb25zdCBoZWlnaHRzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IHRvcE1hdGVyaWFscyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgY29uc3Qgc2VlZCA9IHdvcmxkLnNlZWQ7XG4gIGNvbnN0IHYyID0gd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpIDogbnVsbDtcblxuICAvLyBQYWRkZWQgaGVpZ2h0IGNhY2hlOiBhIHRocmVlLWNlbGwgYm9yZGVyIGNvdmVycyBzbG9wZSwgYmVhY2ggYW5kIGxlZGdlcy5cbiAgY29uc3QgUCA9IDM7XG4gIGNvbnN0IFBXID0gQ0hVTktfU0laRSArIFAgKiAyO1xuICBjb25zdCBiYXNlSCA9IG5ldyBJbnQxNkFycmF5KFBXICogUFcpO1xuICBjb25zdCB2MkNvbHM6IFYyQ29sdW1uW10gfCBudWxsID0gdjIgPyBuZXcgQXJyYXkoQ0hVTktfQVJFQSkgOiBudWxsO1xuICBmb3IgKGxldCBweiA9IDA7IHB6IDwgUFc7IHB6KyspIHtcbiAgICBmb3IgKGxldCBweCA9IDA7IHB4IDwgUFc7IHB4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBweCAtIFAsIHd6ID0gb3ogKyBweiAtIFA7XG4gICAgICBpZiAodjIpIHtcbiAgICAgICAgY29uc3QgY29sID0gdjIuY29sdW1uKHd4LCB3eik7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBjb2wuaDtcbiAgICAgICAgY29uc3QgbHggPSBweCAtIFAsIGx6ID0gcHogLSBQO1xuICAgICAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHYyQ29scyFbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY29sO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB3eCwgd3opO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB2MkNvbCA9IHYyQ29scyA/IHYyQ29sc1tseiAqIENIVU5LX1NJWkUgKyBseF0gOiBudWxsO1xuICAgICAgY29uc3QgdG9wID0gdjIgJiYgdjJDb2xcbiAgICAgICAgPyB2Mi50b3BNYXRlcmlhbCh3eCwgd3osIHYyQ29sLCBzbG9wZSwgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGhoLCBzcywgbmVhcldhdGVyKSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHRoZSBjb2x1bW4nc1xuICAgICAgLy8gd2F0ZXIgbGV2ZWwgKHNlYSBsZXZlbCBpbiB2MTsgdGhlIGh5ZHJvbG9naWNhbCBsZXZlbCBpbiB2MikuXG4gICAgICBjb25zdCB3YXRlckxldmVsID0gdjJDb2wgPyBNYXRoLm1pbihZX01BWCwgdjJDb2wubGV2ZWwpIDogU0VBX0xFVkVMO1xuICAgICAgaWYgKGggPCB3YXRlckxldmVsKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCB3YXRlckxldmVsOyB5KyspIHtcbiAgICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopO1xuICAgICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5XQVRFUjtcbiAgICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b3BTb2xpZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5tYXgoWV9NSU4sIGggLSAxKSk7XG4gICAgICBoZWlnaHRzW2NvbF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tjb2xdID0gdG9wO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb3RydWRpbmcgbGVkZ2VzOiBvbmUgb3IgdHdvIHN0b25lIGJsb2NrcyBleHRlbmQgZnJvbSBhIGhpZ2ggY29sdW1uIG92ZXJcbiAgLy8gYSBsb3dlciBuZWlnaGJvdXIuIFRoZXkgY3JlYXRlIHJlYWRhYmxlIG92ZXJoYW5ncyB3aXRob3V0IGEgZnVsbCBjYXZlIHBhc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBpZiAoc2xvcGUgPCAyKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRpcnM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1stMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWzAsIDFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2YgZGlycykge1xuICAgICAgICBjb25zdCBueCA9IGx4ICsgZHgsIG56ID0gbHogKyBkejtcbiAgICAgICAgaWYgKG54IDwgMCB8fCBueiA8IDAgfHwgbnggPj0gQ0hVTktfU0laRSB8fCBueiA+PSBDSFVOS19TSVpFKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbmggPSBiYXNlSFsobnogKyBQKSAqIFBXICsgKG54ICsgUCldO1xuICAgICAgICBpZiAoaCAtIG5oIDwgMikgY29udGludWU7XG4gICAgICAgIGlmIChoYXNoM2kobHgsIGx6LCBkeCAqIDMgKyBkeiAqIDcsIHNlZWQgKyAxNTApIDwgMC41NSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHkgPSBoIC0gMjtcbiAgICAgICAgaWYgKHkgPCBZX01JTiB8fCB5ID49IGgpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KG54LCB5VG9JbmRleCh5KSwgbnopO1xuICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtpZHhdID0gTUFULlNUT05FO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmVjb21wdXRlIHRoZSBjb2x1bW4gY2FjaGUgYWZ0ZXIgbGVkZ2VzL2NhdmVzLiBUaGUgZXhwb3NlZCB0b3AgbWF0ZXJpYWxcbiAgLy8gbXVzdCBjb21lIGZyb20gdGhlIGFjdHVhbCB0b3Agc29saWQgdm94ZWwsIG5vdCB0aGUgcHJlLWNhcnZlIGd1ZXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgIGxldCB0b3BNYXQ6IG51bWJlciA9IHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgY29uc3QgbSA9IGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICAgIGhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG9wTWF0O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNodW5rOiBWb3hlbENodW5rID0ge1xuICAgIGN4LCBjeiwga2V5LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpcixcbiAgICBkaXJ0eTogdHJ1ZSxcbiAgICBnZW5lcmF0ZWRBdDogcGVyZm9ybWFuY2Uubm93KCksXG4gIH07XG5cbiAgLy8gQXBwbHkgZHVyYWJsZSBlZGl0cyBhZnRlciBiYXNlIGdlbmVyYXRpb24uXG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIGlmIChlZGl0cykge1xuICAgIGZvciAoY29uc3QgW2lkeCwgbV0gb2YgZWRpdHMpIHtcbiAgICAgIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gICAgfVxuICAgIC8vIFJlY29tcHV0ZSB0aGUgY2FjaGUgZm9yIGVkaXRlZCBjaHVua3MuXG4gICAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgbHgsIGx6KTtcbiAgICB9XG4gIH1cbiAgLy8gTm9uLWFpciBjb3VudHMgYXJlIGRlcml2ZWQgcmVuZGVyZXIgc3RhdGlzdGljcywgbm90IGR1cmFibGUgd29ybGQgc3RhdGUuXG4gIC8vIEVkaXRlZCBiYXNlIGFpciBtYXkgYmVjb21lIHNvbGlkIChhbmQgdmljZSB2ZXJzYSkgZHVyaW5nIHJlc3RvcmF0aW9uLlxuICBsZXQgZWRpdGVkTm9uQWlyID0gMDtcbiAgZm9yIChjb25zdCBtYXRlcmlhbCBvZiBjaHVuay5kYXRhKSBpZiAobWF0ZXJpYWwgIT09IE1BVC5BSVIpIGVkaXRlZE5vbkFpcisrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gZWRpdGVkTm9uQWlyIC0gbm9uQWlyO1xuXG4gIHdvcmxkLmNodW5rcy5zZXQoa2V5LCBjaHVuayk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCsrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gbm9uQWlyO1xuICB3b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgKz0gcGVyZm9ybWFuY2Uubm93KCkgLSB0MDtcbiAgd29ybGQuZGlydHkuYWRkKGtleSk7XG5cbiAgZ2VuZXJhdGVFbnRpdGllcyh3b3JsZCwgY2h1bmspO1xuICByZXR1cm4gY2h1bms7XG59XG5cbi8qKiBBIGJhc2UtdGVycmFpbiBjYWNoZSBzaGFyZWQgYnkgZWRpdGVkIGFuZCB1bmVkaXRlZCByZWdlbmVyYXRpb24uIE5hdHVyYWxcbiAqIHNjZW5lcnkgbmV2ZXIgZGVwZW5kcyBvbiBsYXRlciB2b3hlbCBlZGl0czsgdGhpcyBhbHNvIGxldHMgYSBzbmFwc2hvdCByZXN0b3JlXG4gKiBhIGhhcnZlc3RlZCBjaHVuayB3aXRob3V0IG1hdGVyaWFsaXppbmcgdW5yZWxhdGVkIG5laWdoYm91cmluZyBjaHVua3MuICovXG5jb25zdCBiYXNlQ29sdW1uQ2FjaGUgPSBuZXcgV2Vha01hcDxXb3JsZCwgTWFwPHN0cmluZywgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXkgfT4+KCk7XG5cbmZ1bmN0aW9uIGJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheSB9IHtcbiAgbGV0IGNhY2hlID0gYmFzZUNvbHVtbkNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGUpIHsgY2FjaGUgPSBuZXcgTWFwKCk7IGJhc2VDb2x1bW5DYWNoZS5zZXQod29ybGQsIGNhY2hlKTsgfVxuICBjb25zdCBjYWNoZWQgPSBjYWNoZS5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGNhY2hlZDtcbiAgY29uc3QgY29sdW1ucyA9IHsgaGVpZ2h0czogbmV3IFVpbnQ4QXJyYXkoY2h1bmsuaGVpZ2h0cyksIHRvcE1hdGVyaWFsczogbmV3IFVpbnQ4QXJyYXkoY2h1bmsudG9wTWF0ZXJpYWxzKSB9O1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSArIGx4LCB6ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KSArIGx6O1xuICAgICAgY29uc3QgdmVyc2lvbiA9IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uO1xuICAgICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB2ZXJzaW9uLCB4LCB6KTtcbiAgICAgIGNvbnN0IHNsb3BlID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyB2ZXJzaW9uZWRTbG9wZSh3b3JsZC5zZWVkLCB2ZXJzaW9uLCB4LCB6LCBoKSA6IHNsb3BlQXQod29ybGQuc2VlZCwgeCwgeiwgaCk7XG4gICAgICBjb25zdCBpbmRleCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5oZWlnaHRzW2luZGV4XSA9IGNsYW1wKGggLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICBjb2x1bW5zLnRvcE1hdGVyaWFsc1tpbmRleF0gPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IGJhc2VUb3BNYXRlcmlhbEZvcih3b3JsZC5zZWVkLCB2ZXJzaW9uLCB4LCB6LCBoLCBzbG9wZSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHdvcmxkLnNlZWQsIHgsIHosIGgsIHNsb3BlKTtcbiAgICB9XG4gIH1cbiAgY2FjaGUuc2V0KGNodW5rLmtleSwgY29sdW1ucyk7XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG4vLyAtLS0tLS0tLS0tIGRlcml2ZWQgY2hhbmdlIHRyYWNraW5nIChub3QgYXV0aG9yaXRhdGl2ZSBzdGF0ZSkgLS0tLS0tLS0tLVxuLy8gUmVuZGVyZXJzIG5lZWQgdG8ga25vdyB3aGVuIHRoZSBlZGl0IG92ZXJsYXkgY2hhbmdlZCB3aXRob3V0IHdhbGtpbmcgZXZlcnlcbi8vIGVkaXQgZWFjaCBmcmFtZS4gVGhlIGNvdW50ZXIgbGl2ZXMgb3V0c2lkZSBXb3JsZCBzbyBpdCBuZXZlciBlbnRlcnMgYVxuLy8gc25hcHNob3Qgb3IgY2Fub25pY2FsIGhhc2guXG5jb25zdCBlZGl0VmVyc2lvbnMgPSBuZXcgV2Vha01hcDxXb3JsZCwgbnVtYmVyPigpO1xuXG4vKiogTW9ub3RvbmljIGNvdW50IG9mIGVkaXQtb3ZlcmxheSBjaGFuZ2VzIGZvciB0aGlzIFdvcmxkIG9iamVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0VmVyc2lvbih3b3JsZDogV29ybGQpOiBudW1iZXIge1xuICByZXR1cm4gZWRpdFZlcnNpb25zLmdldCh3b3JsZCkgPz8gMDtcbn1cblxuLyoqIENhbGwgYWZ0ZXIgcmVwbGFjaW5nIG9yIGJ1bGstY2hhbmdpbmcgYHdvcmxkLmVkaXRzYCBvdXRzaWRlIHNldFZveGVsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtFZGl0c0NoYW5nZWQod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGVkaXRWZXJzaW9ucy5zZXQod29ybGQsIGVkaXRWZXJzaW9uKHdvcmxkKSArIDEpO1xufVxuXG4vLyAtLS0tLS0tLS0tIG5vbi1nZW5lcmF0aW5nIHF1ZXJpZXMgLS0tLS0tLS0tLVxuLy8gTW92aW5nIHByZXNlbnRhdGlvbiAoY2hhcmFjdGVycywgYW5pbWFscywgY2FtZXJhKSBtdXN0IG5ldmVyIHRyaWdnZXIgY2h1bmtcbi8vIGdlbmVyYXRpb24gYXMgYSBzaWRlIGVmZmVjdCBvZiBhc2tpbmcgYWJvdXQgdGVycmFpbi4gVGhlc2UgcmV0dXJuIG51bGwgd2hlblxuLy8gdGhlIGNvbHVtbidzIGNodW5rIGlzIG5vdCByZXNpZGVudC5cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Q2h1bmtBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHdvcmxkLmNodW5rcy5nZXQoY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSkpID8/IG51bGw7XG59XG5cbi8qKiBMaWtlIHN1cmZhY2VBdCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHwgbnVsbCB7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbi8qKiBMaWtlIGdldFZveGVsLCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Vm94ZWxBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB8IG51bGwge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXZpY3RDaHVuayh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghd29ybGQuY2h1bmtzLmhhcyhrZXkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmNodW5rcy5kZWxldGUoa2V5KTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzRXZpY3RlZCsrO1xuICAvLyBDaHVuayBieXRlcyBhbmQgY29sdW1uIGNhY2hlcyBhcmUgcmVnZW5lcmF0ZWQgb24gZGVtYW5kLiBFbnRpdGllcyByZW1haW5cbiAgLy8gYXV0aG9yaXRhdGl2ZTogZXZpY3Rpb24gbXVzdCBub3QgZm9yZ2V0IHRoZWlyIHBlcnNpc3RlbnQgc3RhdGUuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyAtLS0tLS0tLS0tIHF1ZXJpZXMgLyBlZGl0cyAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZ2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBtOiBNYXRJZCk6IGJvb2xlYW4ge1xuICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gWV9NQVgpIHJldHVybiBmYWxzZTtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgaWR4ID0gbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIGNvbnN0IHByZXZpb3VzRWRpdCA9IHdvcmxkLmVkaXRzLmdldChjaHVua0tleShjeCwgY3opKT8uZ2V0KGlkeCk7XG4gIC8vIEEgY2h1bmsgZXZpY3RlZCBhZnRlciBhbiBlYXJsaWVyIGVkaXQgY2FuIHJlZ2VuZXJhdGUgd2l0aCB0aGF0IGR1cmFibGVcbiAgLy8gbWF0ZXJpYWwgYWxyZWFkeSBhcHBsaWVkLiBEcm9wcGluZyB0aGUgZWRpdCBoZXJlIHdvdWxkIG1ha2UgaXQgZGlzYXBwZWFyXG4gIC8vIG9uIHRoZSBuZXh0IGV2aWN0aW9uL3Jlc3RvcmF0aW9uLCBldmVuIHRob3VnaCB0aGUgY3VycmVudCB3cml0ZSBuby1vcHMuXG4gIGlmIChwcmV2aW91c0VkaXQgPT09IG0pIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIGZhbHNlO1xuICBsZXQgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKCFlZGl0cykgeyBlZGl0cyA9IG5ldyBNYXAoKTsgd29ybGQuZWRpdHMuc2V0KGNodW5rLmtleSwgZWRpdHMpOyB9XG4gIC8vIEFuIGlkZW1wb3RlbnQgd3JpdGUgbXVzdCBzdGlsbCByZXN0b3JlIGEgZHVyYWJsZSBkZWx0YSBkaXNjYXJkZWQgYnkgYW5cbiAgLy8gb2xkZXIgc25hcHNob3Qgb3IgZGVsdGEgZGVjb2Rlci4gSXQgaXMgbm90IGEgbmV3IGF1dGhvcml0YXRpdmUgcmV2aXNpb24uXG4gIGlmIChjaHVuay5kYXRhW2lkeF0gPT09IG0pIHtcbiAgICBpZiAoIWVkaXRzLmhhcyhpZHgpKSBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgZWRpdHMuc2V0KGlkeCwgbSk7XG4gIG1hcmtFZGl0c0NoYW5nZWQod29ybGQpO1xuICBjaHVuay5kaXJ0eSA9IHRydWU7XG4gIHdvcmxkLmRpcnR5LmFkZChjaHVuay5rZXkpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgd29ybGRUb0xvY2FsWCh4KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDb2x1bW5DYWNoZShjaHVuazogVm94ZWxDaHVuaywgbHg6IG51bWJlciwgbHo6IG51bWJlcik6IHZvaWQge1xuICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgaWYgKGlzU29saWQoY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSkpIHsgdG9wU29saWQgPSB5OyBicmVhazsgfVxuICB9XG4gIGNodW5rLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gIGNvbnN0IHRtID0gY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgaWYgKHRvcFNvbGlkID49IFlfTUlOKSB7XG4gICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgodG9wU29saWQpLCBseildO1xuICAgIGlmIChtICE9PSBNQVQuV0FURVIpIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBtO1xuICB9IGVsc2Uge1xuICAgIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0bTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSB5IGNvb3JkaW5hdGUgb2YgdGhlIGV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbiBhdCB4L3ouXG4gKiBBIHNvbGlkIHZveGVsIGF0IHkgb2NjdXBpZXMgW3ksIHkrMSksIHNvIHRoZSB3YWxrYWJsZSBzdXJmYWNlIGlzIHRvcFNvbGlkKzEuXG4gKiBUaGlzIGlzIGEgZGVyaXZlZCBxdWVyeTsgdGhlIGF1dGhvcml0YXRpdmUgc3RhdGUgcmVtYWlucyB0aGUgdm94ZWwgdm9sdW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gWV9NSU47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gWV9NSU47XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLnRvcE1hdGVyaWFsc1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAod29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24gPCBHRU5FUkFUT1JfVjIpIHtcbiAgICBjb25zdCBoID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCAtIGggOiAwO1xuICB9XG4gIHJldHVybiB3YXRlclN1cmZhY2VBdCh3b3JsZCwgeCwgeikgLSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG4vKipcbiAqIFRvcCBvZiB0aGUgd2F0ZXIgY29sdW1uIHN0YW5kaW5nIG9uIHRoZSBzb2xpZCBzdXJmYWNlIChlcXVhbCB0byB0aGUgc3VyZmFjZVxuICogd2hlbiBkcnkpLiBSZWFkcyB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbHMsIHNvIGVkaXRzIGFuZCBkdWcgcGl0cyBhcmUgZXhhY3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRlclN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICB3aGlsZSAoeSA8IFlfTUFYICYmIGdldFZveGVsKHdvcmxkLCB4LCB5LCB6KSA9PT0gTUFULldBVEVSKSB5Kys7XG4gIHJldHVybiB5O1xufVxuXG4vLyAtLS0tLS0tLS0tIGVudGl0aWVzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGFkZEVudGl0eSh3b3JsZDogV29ybGQsIGU6IEVudGl0eSk6IHZvaWQge1xuICBpZiAod29ybGQuZW50aXRpZXMuaGFzKGUuaWQpIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSByZXR1cm47XG4gIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBlKTtcbiAgbGV0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIGxpc3QpOyB9XG4gIGxpc3QucHVzaChlLmlkKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICAvLyBHZW5lcmF0aW9uIGlzIGRldGVybWluaXN0aWMgYW5kIGFkdmFuY2VzIG5vIHBsYXllci1jb21tYW5kIHByZWNvbmRpdGlvbi5cbiAgLy8gQXV0aG9yZWQgc2NhZmZvbGRpbmcgbWF5IHRyYW5zaWVudGx5IGNoYW5nZSBpdDsgdGhlIHNuYXBzaG90IHJlc3RvcmVzIHRoZVxuICAvLyBzYXZlZCByZXZpc2lvbiBhZnRlciBwbGFjaW5nIHRoYXQgc2NhZmZvbGRpbmcuXG59XG5cbi8qKlxuICogUmVtb3ZlIGFuIGVudGl0eSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHdvcmxkLiBVc2VkIHdoZW4gYSBzaXRlIGlzIGNsZWFyZWQ6XG4gKiB0aGUgcmVzb3VyY2UgeWllbGQgaXMgYWNjb3VudGVkIGZvciBieSB0aGUgY2FsbGVyLCBhbmQgdGhlIGVudGl0eSBtdXN0IHN0b3BcbiAqIGV4aXN0aW5nIGZvciBjb2xsaXNpb24sIG9ic3RydWN0aW9uIGFuZCBwZXJzaXN0ZW5jZSwgbm90IGp1c3QgYmUgaGlkZGVuIGJ5XG4gKiB0aGUgcmVuZGVyZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgY29uc3QgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmIChsaXN0KSB7XG4gICAgY29uc3QgaSA9IGxpc3QuaW5kZXhPZihpZCk7XG4gICAgaWYgKGkgPj0gMCkgbGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoaWQpO1xuICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlJZChjaHVuazogc3RyaW5nLCBpOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gYGU6JHtjaHVua306JHtpfWA7XG59XG5cbmZ1bmN0aW9uIGZvcmVzdFNjb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGVhc3QgPSBNYXRoLmV4cCgtKCgod3ggLSAyMjApIC8gMjYwKSAqKiAyICsgKCh3eiArIDExMCkgLyAyMjApICoqIDIpKTtcbiAgY29uc3Qgbm9ydGggPSBNYXRoLmV4cCgtKCgod3ggLSAyMCkgLyAzMDApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDE5MCkgKiogMikpO1xuICBjb25zdCB3ZXN0ID0gTWF0aC5leHAoLSgoKHd4ICsgMzQwKSAvIDIwMCkgKiogMiArICgod3ogLSAxMjApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IHNvdXRoID0gTWF0aC5leHAoLSgoKHd4IC0gMTIwKSAvIDI0MCkgKiogMiArICgod3ogLSAzMzApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IG1vaXN0dXJlID0gZmJtMih3eCAvIDI2MCwgd3ogLyAyNjAsIHNlZWQgKyAyMDEsIDQpO1xuICBjb25zdCB2YWxsZXkgPSBNYXRoLmV4cCgtKCh3eCAvIDE0MCkgKiogMiArICh3eiAvIDEwNSkgKiogMikpO1xuICByZXR1cm4gTWF0aC5tYXgoZWFzdCwgbm9ydGggKiAwLjkyLCB3ZXN0ICogMC44MCwgc291dGggKiAwLjc4KSAqIDAuODJcbiAgICArIG1vaXN0dXJlICogMC4zOCAtIDAuMjIgLSB2YWxsZXkgKiAwLjM0O1xufVxuXG5mdW5jdGlvbiByb2NrU2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgbW91bnRhaW4gPSBmYm0yKHd4IC8gMzMwLCB3eiAvIDMzMCwgc2VlZCArIDIwMiwgMyk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMTQwLCB3eiAvIDE0MCwgc2VlZCArIDIwMywgMykgLSAxKTtcbiAgcmV0dXJuIG1vdW50YWluICogMC41NSArIHJpZGdlICogMC40NTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdGllcyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogdm9pZCB7XG4gIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQsIGNodW5rLmN4LCBjaHVuay5jeik7XG59XG5cbi8qKiBAaW50ZXJuYWwgUmVwbGF5cyBkZXRlcm1pbmlzdGljIGdlbmVyYXRpb24gZm9yIHNuYXBzaG90IGVudGl0eSBkZWx0YXMuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgaWYgKHdvcmxkLmVudGl0eUNodW5rcy5oYXMoa2V5KSkgcmV0dXJuO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm47XG5cbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoaGFzaDJpKGNodW5rLmN4LCBjaHVuay5jeiwgd29ybGQuc2VlZCArIDkwMCkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBjb2x1bW5zID0gYmFzZUNvbHVtbnMod29ybGQsIGNodW5rKTtcbiAgbGV0IG4gPSAwO1xuICBsZXQgbmF0dXJhbFRyZWVzID0gMDtcbiAgbGV0IG5hdHVyYWxQaW5rVHJlZXMgPSAwO1xuXG4gIGNvbnN0IGxvY2FsU3VyZmFjZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSArIFlfTUlOO1xuICB9O1xuICBjb25zdCBsb2NhbFRvcCA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogTWF0SWQgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gYXMgTWF0SWQ7XG4gIH07XG4gIGNvbnN0IGxvY2FsU2xvcGUgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgIHJldHVybiBNYXRoLm1heChcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggLSAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogLSAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgKTtcbiAgfTtcblxuICAvLyBBIGppdHRlcmVkIDggbSBsYXR0aWNlIGdpdmVzIGNvaGVyZW50IG1hc3NlcyBhbmQgYXZvaWRzIHBlci1mcmFtZSBzY2F0dGVyLlxuICBmb3IgKGxldCBneiA9IDA7IGd6IDwgQ0hVTktfU0laRTsgZ3ogKz0gOCkge1xuICAgIGZvciAobGV0IGd4ID0gMDsgZ3ggPCBDSFVOS19TSVpFOyBneCArPSA4KSB7XG4gICAgICBjb25zdCBseCA9IGNsYW1wKE1hdGguZmxvb3IoZ3ggKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCBseiA9IGNsYW1wKE1hdGguZmxvb3IoZ3ogKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICAgIGlmIChoIDw9IFNFQV9MRVZFTCArIDEpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgc2xvcGUgPSBsb2NhbFNsb3BlKGx4LCBseik7XG4gICAgICBjb25zdCB0b3AgPSBsb2NhbFRvcChseCwgbHopO1xuICAgICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGZvcmVzdCA9IGZvcmVzdFNjb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2NreSA9IHJvY2tTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9sbCA9IHJuZCgpO1xuXG4gICAgICBjb25zdCB0cmVlQ2hhbmNlID0gZm9yZXN0ID4gMC41MCA/IDAuNzIgOiBmb3Jlc3QgPiAwLjMwID8gMC4yNSA6IDAuMDU7XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMiAmJiByb2xsIDwgdHJlZUNoYW5jZSkge1xuICAgICAgICAvLyBUaGUgY2FwIGlzIGEgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWdlbmVyYXRpb24gcHJvcGVydHkuIEl0IGNhbm5vdFxuICAgICAgICAvLyBkZXBlbmQgb24gd2hpY2ggY2h1bmtzIGEgcmVuZGVyZXIgbG9hZGVkIGJlZm9yZSB0aGlzIG9uZS5cbiAgICAgICAgbGV0IGtpbmQ6IEVudGl0eUtpbmQ7XG4gICAgICAgIGxldCB2YXJpYW50OiBudW1iZXI7XG4gICAgICAgIGNvbnN0IHNwZWNpZXNSb2xsID0gcm5kKCk7XG4gICAgICAgIGlmIChzcGVjaWVzUm9sbCA8IDAuMTIpIHtcbiAgICAgICAgICBpZiAoKG5hdHVyYWxQaW5rVHJlZXMgKyAxKSA+IDAuMjUgKiAobmF0dXJhbFRyZWVzICsgMSkpIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtPdmVyZmxvdysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9ibG9zc29tJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMik7XG4gICAgICAgICAgICBuYXR1cmFsUGlua1RyZWVzKys7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjQwKSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfc3BpcmUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjc0KSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfdGFibGUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgfVxuICAgICAgICBuYXR1cmFsVHJlZXMrKztcbiAgICAgICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuODggKyBybmQoKSAqIDAuMjQsIHZhcmlhbnQsXG4gICAgICAgICAgcmVzb3VyY2U6ICd3b29kJywgcmVtYWluaW5nOiAxMiwgeWllbGRQZXJIYXJ2ZXN0OiA0LFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiByb2NreSA+IDAuNDYgJiYgcm9sbCA8IDAuMzgpIHtcbiAgICAgICAgLy8gQ29uc3VtZSB0aGUgcmV0aXJlZCBzdG9uZSBmb3JtJ3MgcmFuZG9tIGRyYXdzIGFuZCBhbGxvY2F0ZSBpdHMgb2xkXG4gICAgICAgIC8vIHNlcXVlbmNlIElELCBidXQgZG8gbm90IGluc2VydCBhbiBlbnRpdHkuIExhdGVyIG5hdHVyYWwgcGxhY2VtZW50c1xuICAgICAgICAvLyB0aGVyZWZvcmUgcmVtYWluIGJ5dGUtZm9yLWJ5dGUgY29tcGF0aWJsZSB3aXRoIHJlY29yZGVkIHNhdmVzLlxuICAgICAgICBjb25zdCBzaXplUm9sbCA9IHJuZCgpO1xuICAgICAgICBjb25zdCBraW5kOiBFbnRpdHlLaW5kID0gc2l6ZVJvbGwgPCAwLjU1ID8gJ3N0eWxfcm9ja19zbWFsbCdcbiAgICAgICAgICA6IHNpemVSb2xsIDwgMC45MCA/ICdzdHlsX3JvY2tfbWVkaXVtJyA6ICdzdHlsX3JvY2tfbGFyZ2UnO1xuICAgICAgICBjb25zdCBpZCA9IGVudGl0eUlkKGNodW5rLmtleSwgbisrKTtcbiAgICAgICAgY29uc3QgcmVjb3JkID0ge1xuICAgICAgICAgIGlkLCBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcmVzb3VyY2U6ICdzdG9uZScgYXMgY29uc3QsXG4gICAgICAgICAgcmVtYWluaW5nOiBraW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDQgOiBraW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyA4IDogMTIsXG4gICAgICAgICAgeWllbGRQZXJIYXJ2ZXN0OiAzLCBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICB9O1xuICAgICAgICAvLyBPbmx5IGVudGl0aWVzIHRoYXQgZXhpc3RlZCBpbiBhbiBhY2NlcHRlZCBvbGQgc2F2ZSBnZXQgdG9tYnN0b25lcyxcbiAgICAgICAgLy8gZHVyaW5nIGV4cGxpY2l0IG1pZ3JhdGlvbi4gT3JkaW5hcnkgZ2VuZXJhdGlvbiBtdXN0IHJlc3RvcmUgZXhhY3RseS5cbiAgICAgICAgaWYgKGlzU3RvbmVSZXBsYXkod29ybGQpKSBhZGRFbnRpdHkod29ybGQsIHJlY29yZCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULlNUT05FICYmIHJvY2t5ID4gMC41OCAmJiByb2xsIDwgMC4xOCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX29yZScsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAyKSxcbiAgICAgICAgICByZXNvdXJjZTogJ29yZScsIHJlbWFpbmluZzogOCwgeWllbGRQZXJIYXJ2ZXN0OiAyLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAxICYmIHJvbGwgPCAwLjMwKSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfc2hydWInLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOCArIHJuZCgpICogMC40LCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgICAgcmVzb3VyY2U6ICdmaWJlcicsIHJlbWFpbmluZzogNCwgeWllbGRQZXJIYXJ2ZXN0OiAxLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRBdXRob3JlZEVudGl0eSh3b3JsZDogV29ybGQsIGtpbmQ6IEVudGl0eUtpbmQsIHg6IG51bWJlciwgejogbnVtYmVyLCB2YXJpYW50OiBudW1iZXIsIHJvdDogbnVtYmVyLCBzY2FsZTogbnVtYmVyLCByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbCwgcmVtYWluaW5nOiBudW1iZXIsIHlpZWxkUGVySGFydmVzdDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoeSA8PSBTRUFfTEVWRUwpIHJldHVybjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIC8vIEEgaGVybyBhc3NldCBvd25zIGl0cyBzcG90OiBjbGVhciBhbnkgZ2VuZXJhdGVkIGVudGl0eSB0aGF0IHdvdWxkIG92ZXJsYXBcbiAgLy8gaXQsIHJhdGhlciB0aGFuIHNpbGVudGx5IGRyb3BwaW5nIHRoZSBhdXRob3JlZCBjb21wb3NpdGlvbi5cbiAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdO1xuICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgcmV0dXJuO1xuICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmIChlICYmIE1hdGguaHlwb3QoZS54IC0geCwgZS56IC0geikgPCAyLjYpIHtcbiAgICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gICAgICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gICAgICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgICB9XG4gIH1cbiAgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSk7XG4gIC8vIEF1dGhvcmVkIGNvbXBvc2l0aW9uIGlzIGR1cmFibGUgc3RhdGU6IGl0IGNhbiBjbGVhciBvdmVybGFwcGluZyBuYXR1cmFsXG4gIC8vIGVudGl0aWVzLCBzbyBzYXZlIHRoZSBjb21wbGV0ZSBhZmZlY3RlZCBjaHVuayByYXRoZXIgdGhhbiBvbmx5IGl0cyBoZXJvZXMuXG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG5cbiAgY29uc3QgaWQgPSBgaGVybzoke2tpbmR9OiR7TWF0aC5yb3VuZCh4KX06JHtNYXRoLnJvdW5kKHopfWA7XG4gIGNvbnN0IGJlZm9yZSA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGNvbnN0IGVudGl0eTogRW50aXR5ID0ge1xuICAgIGlkLCBraW5kLCBjaHVuazoga2V5LCB4OiB4ICsgMC41LCB5LCB6OiB6ICsgMC41LFxuICAgIHJvdCwgc2NhbGUsIHZhcmlhbnQsIHJlc291cmNlLCByZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdCxcbiAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IHRydWUsXG4gIH07XG4gIGFkZEVudGl0eSh3b3JsZCwgZW50aXR5KTtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLnNpemUgPiBiZWZvcmUgJiYga2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkge1xuICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkgcmV0dXJuO1xuICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG5cbiAgY29uc3Qgc2l0ZXM6IEFycmF5PHsga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcm90OiBudW1iZXIgfT4gPSBbXG4gICAgeyBraW5kOiAnd2F5c3RvbmUnLCB4OiAtMTAsIHo6IC0xNCwgcm90OiAwIH0sXG4gICAgeyBraW5kOiAnbWFya2VyJywgeDogLTMyLCB6OiAtOCwgcm90OiBNYXRoLlBJIC8gMiB9LFxuICBdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc2l0ZXMpIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKHkgPD0gU0VBX0xFVkVMKSBjb250aW51ZTtcbiAgICB3b3JsZC5zaXRlcy5wdXNoKHtcbiAgICAgIGlkOiBgc2l0ZToke3Mua2luZH1gLFxuICAgICAga2luZDogcy5raW5kLFxuICAgICAgeDogcy54ICsgMC41LCB5LCB6OiBzLnogKyAwLjUsXG4gICAgICByb3Q6IHMucm90LFxuICAgICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gICAgfSk7XG4gIH1cblxuICAvLyBBIGhlcm8gZ3JvdmUgY29tcG9zZWQgaW4gdGhlIGRlZmF1bHQgY2FtZXJhJ3MgdmlldyBkaXJlY3Rpb24uIFRoZXNlIGFyZVxuICAvLyBTdHlsIG5hdHVyYWwgYXNzZXRzIChBUy0wMDEgdjIpLCBub3QgTm94ZWwgYXJjaGl0ZWN0dXJlOyB0aGUgTm94ZWxcbiAgLy8gd2F5c3RvbmUvbWFya2VyIGFib3ZlIHJlbWFpbiB0aGUgaHVtYW4tbWFkZSBsYW5kbWFya3MuXG4gIGNvbnN0IGdyb3ZlOiBBcnJheTxbRW50aXR5S2luZCwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdPiA9IFtcbiAgICBbJ3N0eWxfdHJlZV9zcGlyZScsIC0yMiwgLTI2LCAwLCAxLjAwLCAwXSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC0zNCwgLTE4LCAxLCAwLjk1LCBNYXRoLlBJIC8gMTJdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTYsIC0zNCwgMiwgMS4wMCwgTWF0aC5QSSAvIDZdLFxuICAgIFsnc3R5bF90cmVlX2Jsb3Nzb20nLCAtMjgsIC0zOCwgMCwgMC45MCwgTWF0aC5QSSAvIDRdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTQwLCAtMzAsIDIsIDEuMDUsIE1hdGguUEkgLyAzXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTEyLCAtMjQsIDAsIDAuOTAsIE1hdGguUEkgLyAyLjRdLFxuICBdO1xuICBmb3IgKGNvbnN0IFtraW5kLCB4LCB6LCB2YXJpYW50LCBzY2FsZSwgcm90XSBvZiBncm92ZSkge1xuICAgIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCBraW5kLCB4LCB6LCB2YXJpYW50LCByb3QsIHNjYWxlLCAnd29vZCcsIDEyLCA0KTtcbiAgfVxuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfcm9ja19tZWRpdW0nLCAtNiwgLTEwLCAwLCAwLCAxLjAsICdzdG9uZScsIDgsIDMpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfc2hydWInLCAtMTQsIC04LCAxLCBNYXRoLlBJIC8gMTIsIDEuMSwgJ2ZpYmVyJywgNCwgMSk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9jYWlybicsIC0yMCwgLTYsIDAsIDAsIDEuMCwgJ3N0b25lJywgNiwgMik7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9vcmUnLCAtMzgsIC00MiwgMCwgTWF0aC5QSSAvIDQsIDEuMSwgJ29yZScsIDgsIDIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbmVhcmVzdEhhcnZlc3RhYmxlKFxuICB3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCByYWRpdXM6IG51bWJlciwgcmVzb3VyY2U/OiBSZXNvdXJjZVR5cGUsXG4pOiBFbnRpdHkgfCBudWxsIHtcbiAgbGV0IGJlc3Q6IEVudGl0eSB8IG51bGwgPSBudWxsO1xuICBsZXQgYmVzdEQgPSByYWRpdXMgKiByYWRpdXM7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZClcbiAgICAgIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIGNvbnRpbnVlO1xuICAgIGlmIChyZXNvdXJjZSAmJiBlLnJlc291cmNlICE9PSByZXNvdXJjZSkgY29udGludWU7XG4gICAgY29uc3QgZCA9IChlLnggLSB4KSAqKiAyICsgKGUueiAtIHopICoqIDI7XG4gICAgaWYgKGQgPCBiZXN0RCkgeyBiZXN0RCA9IGQ7IGJlc3QgPSBlOyB9XG4gIH1cbiAgcmV0dXJuIGJlc3Q7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdFJlc3VsdCB7IGVudGl0eTogRW50aXR5OyByZXNvdXJjZTogUmVzb3VyY2VUeXBlOyBhbW91bnQ6IG51bWJlcjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBIYXJ2ZXN0UmVzdWx0IHwgbnVsbCB7XG4gIGNvbnN0IGUgPSBsaXZlRW50aXR5KHdvcmxkLCBpZCk7XG4gIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgYW1vdW50ID0gTWF0aC5taW4oZS55aWVsZFBlckhhcnZlc3QsIGUucmVtYWluaW5nKTtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIGFtb3VudCA+IDEyMCkgcmV0dXJuIG51bGw7XG4gIGUucmVtYWluaW5nIC09IGFtb3VudDtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgZS5oYXJ2ZXN0ZWRPbmNlID0gdHJ1ZTtcbiAgaWYgKGUucmVtYWluaW5nIDw9IDApIGUuaGFydmVzdGVkID0gdHJ1ZTtcbiAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgZW50aXR5OiBlLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbi8qKiBSZW1vdmUgZXZlcnkgcmV0aXJlZCBzb3VyY2UgYWZ0ZXIgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkuIFRoaXMgbWlncmF0aW9uXG4gKiBjcmVhdGVzIGRldGVybWluaXN0aWMgdG9tYnN0b25lcyBidXQgaXMgbm90IGEgcGxheWVyIGNvbW1hbmQgb3IgcmV2aXNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmV0aXJlU3RvbmVFbnRpdGllcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBlIG9mIFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0pIHtcbiAgICBpZiAoIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKSBjb250aW51ZTtcbiAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoZS5pZCk7XG4gICAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoZS5pZCk7XG4gICAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gICAgaWYgKCF3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGUuY2h1bmspKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtrZXksIGlkc10gb2Ygd29ybGQuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgYWN0aXZlID0gaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpO1xuICAgIGlmIChhY3RpdmUubGVuZ3RoID4gMCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhrZXkpKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgYWN0aXZlKTtcbiAgICBlbHNlIHdvcmxkLmVudGl0eUNodW5rcy5kZWxldGUoa2V5KTtcbiAgfVxuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGVyc2lzdGVuY2UgLyBhdXRob3JpdHkgYm91bmRhcnkgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1hbmlmZXN0IHtcbiAgc2NoZW1hOiAxO1xuICBzZWVkOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIHBhcmFtc0hhc2g6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZm52MWEodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGggPSAweDgxMWM5ZGM1O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBoID0gTWF0aC5pbXVsKGgsIDB4MDEwMDAxOTMpO1xuICB9XG4gIHJldHVybiAoaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZE1hbmlmZXN0KHdvcmxkOiBXb3JsZCk6IFdvcmxkTWFuaWZlc3Qge1xuICBjb25zdCBwID0gd29ybGQucGFyYW1zO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBzZWVkOiB3b3JsZC5zZWVkLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHAuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBzaXplOiBwLnNpemUsXG4gICAgY2h1bmtTaXplOiBwLmNodW5rU2l6ZSxcbiAgICB5TWluOiBwLnlNaW4sXG4gICAgeU1heDogcC55TWF4LFxuICAgIHNlYUxldmVsOiBwLnNlYUxldmVsLFxuICAgIHBhcmFtc0hhc2g6IGZudjFhKEpTT04uc3RyaW5naWZ5KHApKSxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbEVkaXQgeyBpOiBudW1iZXI7IG06IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgc2NoZW1hOiAxO1xuICBrZXk6IHN0cmluZztcbiAgYmFzZVZlcnNpb246IG51bWJlcjtcbiAgZWRpdHM6IFZveGVsRWRpdFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogQ2h1bmtEZWx0YSB7XG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIGtleSxcbiAgICBiYXNlVmVyc2lvbjogd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgZWRpdHM6IGVkaXRzID8gWy4uLmVkaXRzLmVudHJpZXMoKV0ubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSkgOiBbXSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGRlbHRhOiBDaHVua0RlbHRhKTogdm9pZCB7XG4gIGNvbnN0IFtjeCwgY3pdID0gZGVsdGEua2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGZvciAoY29uc3QgZSBvZiBkZWx0YS5lZGl0cykge1xuICAgIGNvbnN0IHlJbmRleCA9IE1hdGguZmxvb3IoZS5pIC8gQ0hVTktfQVJFQSk7XG4gICAgY29uc3QgcmVtID0gZS5pICUgQ0hVTktfQVJFQTtcbiAgICBjb25zdCBseiA9IE1hdGguZmxvb3IocmVtIC8gQ0hVTktfU0laRSk7XG4gICAgY29uc3QgbHggPSByZW0gJSBDSFVOS19TSVpFO1xuICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHg7XG4gICAgY29uc3QgeSA9IFlfTUlOICsgeUluZGV4O1xuICAgIGNvbnN0IHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIGUubSBhcyBNYXRJZCk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSB0aW1lIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgVGltZVN0YXRlIHsgdDogbnVtYmVyOyBkYXlMZW5ndGhTZWM6IG51bWJlcjsgcGF1c2VkOiBib29sZWFuOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBhZHZhbmNlVGltZShzOiBUaW1lU3RhdGUsIGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHMucGF1c2VkKSByZXR1cm47XG4gIHMudCA9IChzLnQgKyBkdCAvIHMuZGF5TGVuZ3RoU2VjKSAlIDE7XG59XG4iLCAiLy8gVGVycmFpbiBxdWVyeSBsYXllciBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMiBTeXN0ZW0gMTogb25lIHNoYXJlZCwgY2FjaGVkIGNvbnRyYWN0IGZvciBjb25zdHJ1Y3Rpb24sIGZhcm1pbmcsXG4vLyBtb3ZlbWVudCwgbmF2aWdhdGlvbiBhbmQgdGhlIEFJIGFnZW50LiBUaGVzZSBxdWVyaWVzIGRlc2NyaWJlIHRoZVxuLy8gYXV0aG9yaXRhdGl2ZSB2b3hlbCB2b2x1bWU7IHRoZXkgbmV2ZXIgbXV0YXRlIGl0IGFuZCBuZXZlciBjcmVhdGUgYSBzZWNvbmRcbi8vIHRlcnJhaW4gcmVwcmVzZW50YXRpb24uXG4vL1xuLy8gQ29udmVudGlvbnM6XG4vLyAgICogeC96IGFyZSBpbnRlZ2VyIGNvbHVtbiBjb29yZGluYXRlcyBpbiBbLTEwMjQsIDEwMjQpLlxuLy8gICAqIHkgaXMgYW4gaW50ZWdlciB2b3hlbCBjb29yZGluYXRlIGluIFstMTYsIDExMikuXG4vLyAgICogc3VyZmFjZVkgaXMgdGhlIGV4cG9zZWQgdG9wIGZhY2UgKHRvcFNvbGlkICsgMSksIG1hdGNoaW5nIE0wMDEuXG4vLyAgICogQSByZWN0IGlzIGluY2x1c2l2ZSBvbiBhbGwgZm91ciBlZGdlcy5cbmltcG9ydCB7XG4gIFdvcmxkLCBNYXRJZCwgTUFULCBTRUFfTEVWRUwsIFlfTUlOLCBZX01BWCwgSEFMRixcbiAgc3VyZmFjZUF0LCB0b3BNYXRlcmlhbEF0V29ybGQsIGdldFZveGVsLCBpc1NvbGlkLFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgQWN0aXZlRW50aXR5S2luZCwgRW50aXR5S2luZCwgaXNSZXRpcmVkU3RvbmVLaW5kLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVjdCB7XG4gIHgwOiBudW1iZXI7XG4gIHowOiBudW1iZXI7XG4gIHgxOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxSZWdpb24gZXh0ZW5kcyBSZWN0IHtcbiAgeTA6IG51bWJlcjtcbiAgeTE6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVJlY3QocmVjdDogUmVjdCk6IFJlY3Qge1xuICByZXR1cm4ge1xuICAgIHgwOiBNYXRoLm1pbihyZWN0LngwLCByZWN0LngxKSxcbiAgICB6MDogTWF0aC5taW4ocmVjdC56MCwgcmVjdC56MSksXG4gICAgeDE6IE1hdGgubWF4KHJlY3QueDAsIHJlY3QueDEpLFxuICAgIHoxOiBNYXRoLm1heChyZWN0LnowLCByZWN0LnoxKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RDb2x1bW5zKHJlY3Q6IFJlY3QpOiBudW1iZXIge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgcmV0dXJuIChyLngxIC0gci54MCArIDEpICogKHIuejEgLSByLnowICsgMSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0Q29udGFpbnMocmVjdDogUmVjdCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHggPj0gcmVjdC54MCAmJiB4IDw9IHJlY3QueDEgJiYgeiA+PSByZWN0LnowICYmIHogPD0gcmVjdC56MTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cGFuZFJlY3QocmVjdDogUmVjdCwgYW1vdW50OiBudW1iZXIpOiBSZWN0IHtcbiAgcmV0dXJuIHtcbiAgICB4MDogcmVjdC54MCAtIGFtb3VudCxcbiAgICB6MDogcmVjdC56MCAtIGFtb3VudCxcbiAgICB4MTogcmVjdC54MSArIGFtb3VudCxcbiAgICB6MTogcmVjdC56MSArIGFtb3VudCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RUb1JlZ2lvbihyZWN0OiBSZWN0LCB5MCA9IFlfTUlOLCB5MSA9IFlfTUFYIC0gMSk6IFZveGVsUmVnaW9uIHtcbiAgcmV0dXJuIHsgLi4ubm9ybWFsaXplUmVjdChyZWN0KSwgeTAsIHkxIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpb25zT3ZlcmxhcChhOiBWb3hlbFJlZ2lvbiwgYjogVm94ZWxSZWdpb24pOiBib29sZWFuIHtcbiAgcmV0dXJuIGEueDAgPD0gYi54MSAmJiBhLngxID49IGIueDAgJiYgYS56MCA8PSBiLnoxICYmIGEuejEgPj0gYi56MFxuICAgICYmIGEueTAgPD0gYi55MSAmJiBhLnkxID49IGIueTA7XG59XG5cbi8qKiBJbmNsdXNpdmUgY29udGFpbm1lbnQgb2YgYSB2b3hlbCBpbiBhIHdvcmsgZW52ZWxvcGUuICovXG5leHBvcnQgZnVuY3Rpb24gZW52ZWxvcGVDb250YWlucyhyZWN0czogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBmb3IgKGNvbnN0IHIgb2YgcmVjdHMpIHtcbiAgICBpZiAoeCA+PSByLngwICYmIHggPD0gci54MSAmJiB5ID49IHIueTAgJiYgeSA8PSByLnkxICYmIHogPj0gci56MCAmJiB6IDw9IHIuejEpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWluQ29sdW1uIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIC8qKiBFeHBvc2VkIHRvcCBmYWNlIG9mIHRoZSBzb2xpZCBjb2x1bW47IHRoZSBmaXJzdCBhaXIgY2VsbCBhYm92ZSBpdC4gKi9cbiAgc3VyZmFjZVk6IG51bWJlcjtcbiAgLyoqIFRoZSBoaWdoZXN0IHNvbGlkIHZveGVsLCBvciBZX01JTiAtIDEgaWYgdGhlIGNvbHVtbiBoYXMgbm8gc29saWQuICovXG4gIHRvcFNvbGlkWTogbnVtYmVyO1xuICB0b3BNYXRlcmlhbDogTWF0SWQ7XG4gIHNvbGlkOiBib29sZWFuO1xuICAvKiogV2F0ZXIgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UsIHVwIHRvIHNlYSBsZXZlbC4gMCBvbiBkcnkgbGFuZC4gKi9cbiAgd2F0ZXJEZXB0aDogbnVtYmVyO1xuICB1bmRlcndhdGVyOiBib29sZWFuO1xuICAvKiogTGFyZ2VzdCA0LW5laWdoYm91ciBzdXJmYWNlIHN0ZXAgaW4gbWV0cmVzICgxID0gYSBzaW5nbGUgdm94ZWwgcmlzZXIpLiAqL1xuICBzbG9wZTogbnVtYmVyO1xuICAvKiogRnJlZSBhaXIgY2VsbHMgYWJvdmUgdGhlIHN1cmZhY2UsIGNhcHBlZCBhdCBDTEVBUkFOQ0VfUFJPQkUuICovXG4gIGNsZWFyYW5jZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgQ0xFQVJBTkNFX1BST0JFID0gODtcblxuZnVuY3Rpb24gc3VyZmFjZUF0U2FmZSh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBmYWxsYmFjazogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbGxiYWNrO1xuICByZXR1cm4gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuLyoqIFdhdGVyIGRlcHRoIHRoYXQgcmVzcGVjdHMgYSBkcnkgcGl0IGJlbG93IHNlYSBsZXZlbCAodW5saWtlIGhlaWdodCBhbG9uZSkuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0Q29sdW1uKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHN1cmZhY2UgPj0gU0VBX0xFVkVMKSByZXR1cm4gMDtcbiAgaWYgKGdldFZveGVsKHdvcmxkLCB4LCBTRUFfTEVWRUwgLSAxLCB6KSAhPT0gTUFULldBVEVSKSByZXR1cm4gMDtcbiAgcmV0dXJuIFNFQV9MRVZFTCAtIHN1cmZhY2U7XG59XG5cbi8qKiBUcnVlIHdoZW4gYGhlaWdodGAgYWlyIGNlbGxzIGFib3ZlIHRoZSBzdXJmYWNlIGFyZSBmcmVlIG9mIHNvbGlkIG9yIHdhdGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyYW5jZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGhlaWdodDsgaSsrKSB7XG4gICAgaWYgKGdldFZveGVsKHdvcmxkLCB4LCBzdXJmYWNlICsgaSwgeikgIT09IE1BVC5BSVIpIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbHVtbkF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBUZXJyYWluQ29sdW1uIHtcbiAgY29uc3QgY3ggPSBNYXRoLmZsb29yKHgpLCBjeiA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHN1cmZhY2VZID0gc3VyZmFjZUF0KHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCB0b3BNYXRlcmlhbCA9IHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3Qgc29saWQgPSBzdXJmYWNlWSA+IFlfTUlOICYmIGlzU29saWQodG9wTWF0ZXJpYWwpO1xuICBjb25zdCB3YXRlckRlcHRoID0gd2F0ZXJEZXB0aEF0Q29sdW1uKHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3ggLSAxLCBjeiwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4ICsgMSwgY3osIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCwgY3ogLSAxLCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3gsIGN6ICsgMSwgc3VyZmFjZVkpKSxcbiAgKTtcbiAgbGV0IGNsZWFyYW5jZSA9IDA7XG4gIHdoaWxlIChjbGVhcmFuY2UgPCBDTEVBUkFOQ0VfUFJPQkUgJiYgZ2V0Vm94ZWwod29ybGQsIGN4LCBzdXJmYWNlWSArIGNsZWFyYW5jZSwgY3opID09PSBNQVQuQUlSKSB7XG4gICAgY2xlYXJhbmNlKys7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICB4OiBjeCwgejogY3osIHN1cmZhY2VZLCB0b3BTb2xpZFk6IHN1cmZhY2VZIC0gMSwgdG9wTWF0ZXJpYWwsXG4gICAgc29saWQsIHdhdGVyRGVwdGgsIHVuZGVyd2F0ZXI6IHdhdGVyRGVwdGggPiAwLCBzbG9wZSwgY2xlYXJhbmNlLFxuICB9O1xufVxuXG4vLyBFbnRpdHkgZm9vdHByaW50cyBhcmUgZGVsaWJlcmF0ZWx5IGV4cGxpY2l0LiBBIHRyZWUgb2NjdXBpZXMgbW9yZSBzaXRlIHRoYW5cbi8vIGl0cyB0cnVuazsgYSBwZWJibGUgb2NjdXBpZXMgbGVzcyB0aGFuIGEgYm91bGRlci4gVGhlc2UgYXJlIHNpbXVsYXRpb25cbi8vIGNsZWFyYW5jZSByYWRpaSwgbm90IHJlbmRlciBib3VuZHMuXG5leHBvcnQgY29uc3QgT0JTVFJVQ1RJT05fUkFESVVTOiBSZWNvcmQ8QWN0aXZlRW50aXR5S2luZCwgbnVtYmVyPiA9IHtcbiAgc3R5bF90cmVlX3NwaXJlOiAxLjUsXG4gIHN0eWxfdHJlZV90YWJsZTogMS44LFxuICBzdHlsX3RyZWVfY2x1c3RlcjogMS45LFxuICBzdHlsX3RyZWVfYmxvc3NvbTogMS42LFxuICBzdHlsX3NocnViOiAwLjYsXG4gIHN0eWxfb3JlOiAwLjksXG4gIHN0eWxfY2Fpcm46IDAuOCxcbiAgd2F5c3RvbmU6IDEuNCxcbiAgbWFya2VyOiAwLjUsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIE9ic3RydWN0aW9uIHtcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJhZGl1czogbnVtYmVyO1xuICAvKiogRm9vdHByaW50IGNlbGxzIG92ZXJsYXBwZWQgYnkgdGhpcyBlbnRpdHkuICovXG4gIGNlbGxzOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUNodW5rc0ZvclJlY3Qod29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0KTogc3RyaW5nW10ge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgLy8gQSByZWN0IG93bnMgd2hvbGUgdm94ZWwgY2VsbHMuIEluY2x1ZGUgZXZlcnkgY2h1bmsgd2hvc2Ugcm9vdCBjb3VsZCBvdmVybGFwXG4gIC8vIHRob3NlIGNlbGxzLCB3aXRob3V0IHNjYW5uaW5nIHRoZSBlbnRpcmUgMjA0OCBtIHdvcmxkLlxuICBjb25zdCByYWRpdXMgPSBNYXRoLm1heCguLi5PYmplY3QudmFsdWVzKE9CU1RSVUNUSU9OX1JBRElVUyksIDEuNSk7XG4gIGNvbnN0IG1pbkNlbGxYID0gTWF0aC5mbG9vcihyLngwICsgMC41IC0gcmFkaXVzKTtcbiAgY29uc3QgbWF4Q2VsbFggPSBNYXRoLmNlaWwoci54MSArIDAuNSArIHJhZGl1cykgLSAxO1xuICBjb25zdCBtaW5DZWxsWiA9IE1hdGguZmxvb3Ioci56MCArIDAuNSAtIHJhZGl1cyk7XG4gIGNvbnN0IG1heENlbGxaID0gTWF0aC5jZWlsKHIuejEgKyAwLjUgKyByYWRpdXMpIC0gMTtcbiAgY29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgY3gwID0gTWF0aC5tYXgoMCwgd29ybGRUb0NodW5rWChtaW5DZWxsWCkpLCBjeDEgPSB3b3JsZFRvQ2h1bmtYKG1heENlbGxYKTtcbiAgY29uc3QgY3owID0gTWF0aC5tYXgoMCwgd29ybGRUb0NodW5rWihtaW5DZWxsWikpLCBjejEgPSB3b3JsZFRvQ2h1bmtaKG1heENlbGxaKTtcbiAgZm9yIChsZXQgY3ogPSBjejA7IGN6IDw9IGN6MTsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY3gwOyBjeCA8PSBjeDE7IGN4KyspIGtleXMucHVzaChjaHVua0tleShjeCwgY3opKTtcbiAgfVxuICByZXR1cm4ga2V5cztcbn1cblxuLyoqIEVudGl0aWVzIHdob3NlIHNpbXVsYXRpb24gZm9vdHByaW50IG92ZXJsYXBzIHRoZSByZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9ic3RydWN0aW9uc0luKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCk6IE9ic3RydWN0aW9uW10ge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBvdXQ6IE9ic3RydWN0aW9uW10gPSBbXTtcbiAgZm9yIChjb25zdCBrZXkgb2YgZW50aXR5Q2h1bmtzRm9yUmVjdCh3b3JsZCwgcikpIHtcbiAgICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFpZHMpIGNvbnRpbnVlO1xuICAgIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgICBpZiAoc2Vlbi5oYXMoaWQpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgY29udGludWU7XG4gICAgICBzZWVuLmFkZChpZCk7XG4gICAgICBjb25zdCByYWRpdXMgPSBpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKVxuICAgICAgICA/IGUua2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyAwLjYgOiBlLmtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDEuMSA6IDEuNVxuICAgICAgICA6IE9CU1RSVUNUSU9OX1JBRElVU1tlLmtpbmQgYXMgQWN0aXZlRW50aXR5S2luZF07XG4gICAgICBsZXQgY2VsbHMgPSAwO1xuICAgICAgY29uc3QgZXgwID0gTWF0aC5tYXgoci54MCwgTWF0aC5mbG9vcihlLnggLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV4MSA9IE1hdGgubWluKHIueDEsIE1hdGguY2VpbChlLnggKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MCA9IE1hdGgubWF4KHIuejAsIE1hdGguZmxvb3IoZS56IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejEgPSBNYXRoLm1pbihyLnoxLCBNYXRoLmNlaWwoZS56ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBmb3IgKGxldCB6ID0gZXowOyB6IDw9IGV6MTsgeisrKSB7XG4gICAgICAgIGZvciAobGV0IHggPSBleDA7IHggPD0gZXgxOyB4KyspIHtcbiAgICAgICAgICBpZiAoTWF0aC5oeXBvdChlLnggLSAoeCArIDAuNSksIGUueiAtICh6ICsgMC41KSkgPD0gcmFkaXVzKSBjZWxscysrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY2VsbHMgPiAwKSB7XG4gICAgICAgIG91dC5wdXNoKHsgZW50aXR5SWQ6IGUuaWQsIGtpbmQ6IGUua2luZCwgeDogZS54LCB6OiBlLnosIHJhZGl1cywgY2VsbHMgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIG91dC5zb3J0KChhLCBiKSA9PiAoYS5lbnRpdHlJZCA8IGIuZW50aXR5SWQgPyAtMSA6IGEuZW50aXR5SWQgPiBiLmVudGl0eUlkID8gMSA6IDApKTtcbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcmVhU3RhdHMge1xuICByZWN0OiBSZWN0O1xuICBjb2x1bW5zOiBudW1iZXI7XG4gIG1pblk6IG51bWJlcjtcbiAgbWF4WTogbnVtYmVyO1xuICBtZWFuWTogbnVtYmVyO1xuICByZWxpZWY6IG51bWJlcjtcbiAgbWF4U3RlcDogbnVtYmVyO1xuICB3YXRlckNvbHVtbnM6IG51bWJlcjtcbiAgc3RvbmVDb2x1bW5zOiBudW1iZXI7XG4gIG1hdGVyaWFsczogUmVjb3JkPG51bWJlciwgbnVtYmVyPjtcbiAgb2JzdHJ1Y3Rpb25zOiBPYnN0cnVjdGlvbltdO1xuICBvYnN0cnVjdGVkQ29sdW1uczogbnVtYmVyO1xuICAvKiogQ3V0L2ZpbGwgcmVsYXRpdmUgdG8gZmxvb3JZIHdoZW4gc3VwcGxpZWQsIG90aGVyd2lzZSAwLiAqL1xuICBmbG9vclk6IG51bWJlciB8IG51bGw7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VwcG9ydFN1bW1hcnkge1xuICB0b3RhbDogbnVtYmVyO1xuICBsZXZlbDogbnVtYmVyO1xuICBjdXQ6IG51bWJlcjtcbiAgZmlsbDogbnVtYmVyO1xuICB3YXRlcjogbnVtYmVyO1xuICAvKiogRmlsbCBkZWVwZXIgdGhhbiA4IG07IGEgdmFsaWRhdG9yIG1heSByZWplY3QgdGhlc2UgYXMgdW5zdXBwb3J0ZWQuICovXG4gIGRlZXBGaWxsOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRm9vdHByaW50UXVlcnkge1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgc3RhdHM6IEFyZWFTdGF0cztcbiAgc3VwcG9ydDogU3VwcG9ydFN1bW1hcnk7XG4gIG9ic3RydWN0aW9uczogT2JzdHJ1Y3Rpb25bXTtcbiAgLyoqIENlbGxzIGluIHRoZSBidWlsZGluZyB2b2x1bWUgYWJvdmUgdGhlIHByZXBhcmVkIGZsb29yIHRoYXQgYXJlIG5vdCBhaXIuICovXG4gIG92ZXJoYW5nQ2VsbHM6IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgbWF0ZXJpYWw6IE1hdElkIH0+O1xufVxuXG4vKipcbiAqIENhY2hlZCBxdWVyeSBjb250ZXh0LiBDYWNoZXMgYXJlIGtleWVkIG9uIHdvcmxkLnJldmlzaW9uOiBhIHZveGVsIG9yIGVudGl0eVxuICogZWRpdCBpbnZhbGlkYXRlcyB0aGVtLCB3aGlsZSBtZXNoL25hdiByZWJ1aWxkcyBkbyBub3QuIFVzZSBvbmUgY29udGV4dCBmb3IgYVxuICogc2l0ZSBzZWFyY2ggb3IgYSBmb290cHJpbnQgZXZhbHVhdGlvbiwgdGhlbiBkaXNjYXJkIGl0LlxuICovXG5leHBvcnQgY2xhc3MgVGVycmFpblF1ZXJ5IHtcbiAgcHJpdmF0ZSBjYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBUZXJyYWluQ29sdW1uPigpO1xuICBwcml2YXRlIG9ic3RydWN0aW9uQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgT2JzdHJ1Y3Rpb25bXT4oKTtcbiAgcHJpdmF0ZSByZXZpc2lvbjogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSB3b3JsZDogV29ybGQpIHtcbiAgICB0aGlzLnJldmlzaW9uID0gd29ybGQucmV2aXNpb247XG4gIH1cblxuICBwcml2YXRlIHN5bmMoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMucmV2aXNpb24gIT09IHRoaXMud29ybGQucmV2aXNpb24pIHtcbiAgICAgIHRoaXMuY2FjaGUuY2xlYXIoKTtcbiAgICAgIHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5jbGVhcigpO1xuICAgICAgdGhpcy5yZXZpc2lvbiA9IHRoaXMud29ybGQucmV2aXNpb247XG4gICAgfVxuICB9XG5cbiAgLyoqIENhY2hlZCBlbnRpdHkgb2JzdHJ1Y3Rpb25zIGZvciBvbmUgZm9vdHByaW50LiAqL1xuICBvYnN0cnVjdGlvbnNGb3IocmVjdDogUmVjdCk6IE9ic3RydWN0aW9uW10ge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGNvbnN0IGtleSA9IGAke3IueDB9LCR7ci56MH0sJHtyLngxfSwke3IuejF9YDtcbiAgICBsZXQgbGlzdCA9IHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAoIWxpc3QpIHtcbiAgICAgIGxpc3QgPSBvYnN0cnVjdGlvbnNJbih0aGlzLndvcmxkLCByKTtcbiAgICAgIHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5zZXQoa2V5LCBsaXN0KTtcbiAgICB9XG4gICAgcmV0dXJuIGxpc3Q7XG4gIH1cblxuICBjb2x1bW4oeDogbnVtYmVyLCB6OiBudW1iZXIpOiBUZXJyYWluQ29sdW1uIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCBjeCA9IE1hdGguZmxvb3IoeCksIGN6ID0gTWF0aC5mbG9vcih6KTtcbiAgICBjb25zdCBrZXkgPSBgJHtjeH0sJHtjen1gO1xuICAgIGxldCBjb2wgPSB0aGlzLmNhY2hlLmdldChrZXkpO1xuICAgIGlmICghY29sKSB7XG4gICAgICBjb2wgPSBjb2x1bW5BdCh0aGlzLndvcmxkLCBjeCwgY3opO1xuICAgICAgdGhpcy5jYWNoZS5zZXQoa2V5LCBjb2wpO1xuICAgIH1cbiAgICByZXR1cm4gY29sO1xuICB9XG5cbiAgYXJlYShyZWN0OiBSZWN0LCBmbG9vclk/OiBudW1iZXIpOiBBcmVhU3RhdHMge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGxldCBtaW5ZID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICAgIGxldCBtYXhZID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICAgIGxldCBzdW0gPSAwO1xuICAgIGxldCBtYXhTdGVwID0gMDtcbiAgICBsZXQgd2F0ZXJDb2x1bW5zID0gMDtcbiAgICBsZXQgc3RvbmVDb2x1bW5zID0gMDtcbiAgICBsZXQgY3V0Vm9sdW1lID0gMDtcbiAgICBsZXQgZmlsbFZvbHVtZSA9IDA7XG4gICAgbGV0IG1heEN1dCA9IDA7XG4gICAgbGV0IG1heEZpbGwgPSAwO1xuICAgIGNvbnN0IG1hdGVyaWFsczogUmVjb3JkPG51bWJlciwgbnVtYmVyPiA9IHt9O1xuXG4gICAgZm9yIChsZXQgeiA9IHIuejA7IHogPD0gci56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gci54MDsgeCA8PSByLngxOyB4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gdGhpcy5jb2x1bW4oeCwgeik7XG4gICAgICAgIG1pblkgPSBNYXRoLm1pbihtaW5ZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBtYXhZID0gTWF0aC5tYXgobWF4WSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgc3VtICs9IGNvbC5zdXJmYWNlWTtcbiAgICAgICAgbWF4U3RlcCA9IE1hdGgubWF4KG1heFN0ZXAsIGNvbC5zbG9wZSk7XG4gICAgICAgIGlmIChjb2wud2F0ZXJEZXB0aCA+IDApIHdhdGVyQ29sdW1ucysrO1xuICAgICAgICBpZiAoY29sLnRvcE1hdGVyaWFsID09PSBNQVQuU1RPTkUpIHN0b25lQ29sdW1ucysrO1xuICAgICAgICBtYXRlcmlhbHNbY29sLnRvcE1hdGVyaWFsXSA9IChtYXRlcmlhbHNbY29sLnRvcE1hdGVyaWFsXSA/PyAwKSArIDE7XG4gICAgICAgIGlmIChmbG9vclkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGNvbnN0IGR5ID0gY29sLnN1cmZhY2VZIC0gZmxvb3JZO1xuICAgICAgICAgIGlmIChkeSA+IDApIHtcbiAgICAgICAgICAgIGN1dFZvbHVtZSArPSBkeTtcbiAgICAgICAgICAgIG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZHkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZHkgPCAwKSB7XG4gICAgICAgICAgICBmaWxsVm9sdW1lICs9IC1keTtcbiAgICAgICAgICAgIG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCAtZHkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG9ic3RydWN0aW9ucyA9IHRoaXMub2JzdHJ1Y3Rpb25zRm9yKHIpO1xuICAgIGNvbnN0IG9ic3RydWN0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IG8gb2Ygb2JzdHJ1Y3Rpb25zKSB7XG4gICAgICBjb25zdCByYWRpdXMgPSBvLnJhZGl1cztcbiAgICAgIGNvbnN0IGV4MCA9IE1hdGgubWF4KHIueDAsIE1hdGguZmxvb3Ioby54IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBleDEgPSBNYXRoLm1pbihyLngxLCBNYXRoLmNlaWwoby54ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejAgPSBNYXRoLm1heChyLnowLCBNYXRoLmZsb29yKG8ueiAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXoxID0gTWF0aC5taW4oci56MSwgTWF0aC5jZWlsKG8ueiArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgZm9yIChsZXQgeiA9IGV6MDsgeiA8PSBlejE7IHorKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gZXgwOyB4IDw9IGV4MTsgeCsrKSB7XG4gICAgICAgICAgaWYgKE1hdGguaHlwb3Qoby54IC0gKHggKyAwLjUpLCBvLnogLSAoeiArIDAuNSkpIDw9IHJhZGl1cykgb2JzdHJ1Y3RlZC5hZGQoYCR7eH0sJHt6fWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgY29sdW1ucyA9IChyLngxIC0gci54MCArIDEpICogKHIuejEgLSByLnowICsgMSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlY3Q6IHIsXG4gICAgICBjb2x1bW5zLFxuICAgICAgbWluWSwgbWF4WSxcbiAgICAgIG1lYW5ZOiBNYXRoLnJvdW5kKChzdW0gLyBjb2x1bW5zKSAqIDEwMDApIC8gMTAwMCxcbiAgICAgIHJlbGllZjogbWF4WSAtIG1pblksXG4gICAgICBtYXhTdGVwLFxuICAgICAgd2F0ZXJDb2x1bW5zLFxuICAgICAgc3RvbmVDb2x1bW5zLFxuICAgICAgbWF0ZXJpYWxzLFxuICAgICAgb2JzdHJ1Y3Rpb25zLFxuICAgICAgb2JzdHJ1Y3RlZENvbHVtbnM6IG9ic3RydWN0ZWQuc2l6ZSxcbiAgICAgIGZsb29yWTogZmxvb3JZID8/IG51bGwsXG4gICAgICBjdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0LFxuICAgICAgbWF4RmlsbCxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEV2YWx1YXRlIGEgY29tcGxldGUgYnVpbGRpbmcgZm9vdHByaW50LiBgZmxvb3JZYCBpcyB0aGUgcHJlcGFyZWQgd2Fsa2luZ1xuICAgKiBmbG9vcjogdGVycmFpbiBhYm92ZSBpdCBpcyBjdXQsIHRlcnJhaW4gYmVsb3cgaXQgaXMgZmlsbGVkLiBUaGUgcmVzdWx0IGlzXG4gICAqIHJhdyBzaXRlIGRhdGE7IGNvbnN0cnVjdGlvbiBydWxlcyBsaXZlIGluIGNvbnN0cnVjdGlvbi50cy5cbiAgICovXG4gIGZvb3RwcmludChyZWN0OiBSZWN0LCBmbG9vclk6IG51bWJlcik6IEZvb3RwcmludFF1ZXJ5IHtcbiAgICBjb25zdCBzdGF0cyA9IHRoaXMuYXJlYShyZWN0LCBmbG9vclkpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGNvbnN0IHN1cHBvcnQ6IFN1cHBvcnRTdW1tYXJ5ID0ge1xuICAgICAgdG90YWw6IHN0YXRzLmNvbHVtbnMsIGxldmVsOiAwLCBjdXQ6IDAsIGZpbGw6IDAsIHdhdGVyOiAwLCBkZWVwRmlsbDogMCxcbiAgICAgIG1heEN1dDogMCwgbWF4RmlsbDogMCwgY3V0Vm9sdW1lOiAwLCBmaWxsVm9sdW1lOiAwLFxuICAgIH07XG4gICAgY29uc3Qgb3ZlcmhhbmdDZWxsczogRm9vdHByaW50UXVlcnlbJ292ZXJoYW5nQ2VsbHMnXSA9IFtdO1xuXG4gICAgZm9yIChsZXQgeiA9IHIuejA7IHogPD0gci56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gci54MDsgeCA8PSByLngxOyB4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gdGhpcy5jb2x1bW4oeCwgeik7XG4gICAgICAgIGNvbnN0IGR5ID0gY29sLnN1cmZhY2VZIC0gZmxvb3JZO1xuICAgICAgICBpZiAoZHkgPiAwKSB7XG4gICAgICAgICAgc3VwcG9ydC5jdXQrKztcbiAgICAgICAgICBzdXBwb3J0LmN1dFZvbHVtZSArPSBkeTtcbiAgICAgICAgICBzdXBwb3J0Lm1heEN1dCA9IE1hdGgubWF4KHN1cHBvcnQubWF4Q3V0LCBkeSk7XG4gICAgICAgIH0gZWxzZSBpZiAoZHkgPCAwKSB7XG4gICAgICAgICAgc3VwcG9ydC5maWxsKys7XG4gICAgICAgICAgc3VwcG9ydC5maWxsVm9sdW1lICs9IC1keTtcbiAgICAgICAgICBzdXBwb3J0Lm1heEZpbGwgPSBNYXRoLm1heChzdXBwb3J0Lm1heEZpbGwsIC1keSk7XG4gICAgICAgICAgaWYgKC1keSA+IDgpIHN1cHBvcnQuZGVlcEZpbGwrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdXBwb3J0LmxldmVsKys7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbC53YXRlckRlcHRoID4gMCkgc3VwcG9ydC53YXRlcisrO1xuXG4gICAgICAgIC8vIEFuIG92ZXJoYW5nIGlzIHRlcnJhaW4gYWJvdmUgdGhlIGZsb29yIHRoYXQgc3Vydml2ZXMgdGhlIGN1dCBwbGFuZS5cbiAgICAgICAgLy8gRm9yIGEgY29sdW1uIGJlbG93IHRoZSBmbG9vciwgaXRzIHNvbGlkIGJvZHkgaXMgZmlsbCwgbm90IG92ZXJoYW5nLlxuICAgICAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KGZsb29yWSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgZm9yIChsZXQgeSA9IHN0YXJ0OyB5IDwgc3RhcnQgKyA0OyB5KyspIHtcbiAgICAgICAgICBjb25zdCBtID0gZ2V0Vm94ZWwodGhpcy53b3JsZCwgeCwgeSwgeikgYXMgTWF0SWQ7XG4gICAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIG92ZXJoYW5nQ2VsbHMucHVzaCh7IHgsIHksIHosIG1hdGVyaWFsOiBtIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVjdDogciwgZmxvb3JZLCBzdGF0cywgc3VwcG9ydCwgb2JzdHJ1Y3Rpb25zOiBzdGF0cy5vYnN0cnVjdGlvbnMsIG92ZXJoYW5nQ2VsbHMgfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIG1vdmVtZW50IGNvbnRyYWN0IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV2Fsa1BhcmFtcyB7XG4gIG1heFN0ZXBVcDogbnVtYmVyO1xuICBtYXhTdGVwRG93bjogbnVtYmVyO1xuICBtYXhXYXRlckRlcHRoOiBudW1iZXI7XG4gIC8qKiBNYXhpbXVtIGFkamFjZW50IHN1cmZhY2Ugc3RlcDsgMS4wIGlzIGEgNDUgZGVncmVlIHZveGVsIHJpc2VyLiAqL1xuICBtYXhTbG9wZTogbnVtYmVyO1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfV0FMSzogV2Fsa1BhcmFtcyA9IHtcbiAgbWF4U3RlcFVwOiAxLjAsXG4gIG1heFN0ZXBEb3duOiAxLjUsXG4gIG1heFdhdGVyRGVwdGg6IDAuNCxcbiAgbWF4U2xvcGU6IDEuMCxcbiAgY2xlYXJhbmNlOiAyLjAsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdhbGtSZXN1bHQge1xuICBvazogYm9vbGVhbjtcbiAgcmVhc29uOiAnb2snIHwgJ25vdF9hZGphY2VudCcgfCAnc3RlcF91cCcgfCAnZmFsbCcgfCAnd2F0ZXInIHwgJ3Nsb3BlJyB8ICdjbGVhcmFuY2UnO1xuICBzdGVwOiBudW1iZXI7XG4gIHdhdGVyRGVwdGg6IG51bWJlcjtcbn1cblxuLyoqIEV2YWx1YXRlIG9uZSBncmlkIHN0ZXAuIFBhdGhzIGFyZSB2YWxpZGF0ZWQgd2l0aCB0aGUgc2FtZSBjb250cmFjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YWxrU3RlcChcbiAgd29ybGQ6IFdvcmxkLCBmcm9tWDogbnVtYmVyLCBmcm9tWjogbnVtYmVyLCB0b1g6IG51bWJlciwgdG9aOiBudW1iZXIsXG4gIHBhcmFtczogV2Fsa1BhcmFtcyA9IERFRkFVTFRfV0FMSyxcbik6IFdhbGtSZXN1bHQge1xuICBjb25zdCBkeCA9IE1hdGguYWJzKE1hdGguZmxvb3IodG9YKSAtIE1hdGguZmxvb3IoZnJvbVgpKTtcbiAgY29uc3QgZHogPSBNYXRoLmFicyhNYXRoLmZsb29yKHRvWikgLSBNYXRoLmZsb29yKGZyb21aKSk7XG4gIGlmIChkeCArIGR6ICE9PSAxKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdub3RfYWRqYWNlbnQnLCBzdGVwOiAwLCB3YXRlckRlcHRoOiAwIH07XG4gIH1cbiAgY29uc3QgZnJvbSA9IGNvbHVtbkF0KHdvcmxkLCBmcm9tWCwgZnJvbVopO1xuICBjb25zdCB0byA9IGNvbHVtbkF0KHdvcmxkLCB0b1gsIHRvWik7XG4gIGNvbnN0IHN0ZXAgPSB0by5zdXJmYWNlWSAtIGZyb20uc3VyZmFjZVk7XG4gIGlmIChzdGVwID4gcGFyYW1zLm1heFN0ZXBVcCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzdGVwX3VwJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAoLXN0ZXAgPiBwYXJhbXMubWF4U3RlcERvd24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnZmFsbCcsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKHRvLndhdGVyRGVwdGggPiBwYXJhbXMubWF4V2F0ZXJEZXB0aCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICd3YXRlcicsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKHRvLnNsb3BlID4gcGFyYW1zLm1heFNsb3BlKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3Nsb3BlJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAoIWNsZWFyYW5jZUF0KHdvcmxkLCB0b1gsIHRvWiwgcGFyYW1zLmNsZWFyYW5jZSkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2NsZWFyYW5jZScsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgfVxuICByZXR1cm4geyBvazogdHJ1ZSwgcmVhc29uOiAnb2snLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG59XG5cbi8qKiBFZmZlY3RpdmUgZ3JhZGUgb2YgYSBzdHJhaWdodCBwYXRoIHNlZ21lbnQsIHVzZWQgYnkgcGF0aCB2YWxpZGF0aW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVmZmVjdGl2ZUdyYWRlKHdvcmxkOiBXb3JsZCwgeDA6IG51bWJlciwgejA6IG51bWJlciwgeDE6IG51bWJlciwgejE6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGEgPSBjb2x1bW5BdCh3b3JsZCwgeDAsIHowKTtcbiAgY29uc3QgYiA9IGNvbHVtbkF0KHdvcmxkLCB4MSwgejEpO1xuICBjb25zdCBydW4gPSBNYXRoLmh5cG90KHgxIC0geDAsIHoxIC0gejApO1xuICBpZiAocnVuID09PSAwKSByZXR1cm4gTWF0aC5hYnMoYi5zdXJmYWNlWSAtIGEuc3VyZmFjZVkpO1xuICByZXR1cm4gTWF0aC5hYnMoYi5zdXJmYWNlWSAtIGEuc3VyZmFjZVkpIC8gcnVuO1xufVxuIiwgIi8vIE0wMDIgc2l0ZSB2YWxpZGF0aW9uLCBjYW5kaWRhdGUgc2VhcmNoIGFuZCBwcmV2aWV3IFx1MjAxNCBwdXJlIHNpbXVsYXRpb24uXG4vL1xuLy8gVGhpcyBpcyB0aGUgc2hhcmVkIGdhdGUgZm9yIHRoZSBwbGF5ZXIgYW5kIHRoZSBBSSBhZ2VudC4gTmVpdGhlciBtYXkgcGxhY2UgYVxuLy8gc3RydWN0dXJlIGJ5IGFueSBvdGhlciBwYXRoOiBib3RoIHN1Ym1pdCBhIFNpdGVQcm9wb3NhbCwgYm90aCByZWNlaXZlIHRoZVxuLy8gc2FtZSBTaXRlVmFsaWRhdGlvbiwgYW5kIGJvdGggbXVzdCBwYXNzIHRoZSBBdXRob3JpemVyIGJlZm9yZSBleGVjdXRpb24uXG4vL1xuLy8gVGhlIHZhbGlkYXRvciBkZXNjcmliZXMgdGhlIHNpdGUgYXMgaXQgaXMuIEl0IGRvZXMgbm90IGVkaXQgdm94ZWxzLCByZW1vdmVcbi8vIGVudGl0aWVzIG9yIHNwZW5kIHJlc291cmNlcy4gUHJlcGFyYXRpb24gaXMgYSBzZXBhcmF0ZSwgYXV0aG9yaXplZCBzdGVwLlxuaW1wb3J0IHsgV29ybGQsIEhBTEYsIFlfTUlOLCBZX01BWCwgc3VyZmFjZUF0IH0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBSZWN0LCBWb3hlbFJlZ2lvbiwgRm9vdHByaW50UXVlcnksIFRlcnJhaW5RdWVyeSwgQXJlYVN0YXRzLFxuICBub3JtYWxpemVSZWN0LCBleHBhbmRSZWN0LCByZWN0Q29sdW1ucywgZWZmZWN0aXZlR3JhZGUsIHdhbGtTdGVwLCBXYWxrUGFyYW1zLFxuICBERUZBVUxUX1dBTEssIGNvbHVtbkF0LFxufSBmcm9tICcuL3RlcnJhaW4nO1xuXG5leHBvcnQgdHlwZSBTaXRlU3RhdGUgPSAndmFsaWQnIHwgJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nIHwgJ2ludmFsaWQnO1xuXG5leHBvcnQgdHlwZSBWYWxpZGF0aW9uQ29kZSA9XG4gIHwgJ291dF9vZl9ib3VuZHMnXG4gIHwgJ2Zvb3RwcmludF9taXNtYXRjaCdcbiAgfCAnc2xvcGVfZXhjZWVkZWQnXG4gIHwgJ3N0ZXBfZXhjZWVkZWQnXG4gIHwgJ2N1dF9leGNlZWRlZCdcbiAgfCAnZmlsbF9leGNlZWRlZCdcbiAgfCAnY3V0X3ZvbHVtZV9leGNlZWRlZCdcbiAgfCAnZmlsbF92b2x1bWVfZXhjZWVkZWQnXG4gIHwgJ2Zvb3RwcmludF9vYnN0cnVjdGVkJ1xuICB8ICd3YXRlcidcbiAgfCAnb3ZlcmhhbmcnXG4gIHwgJ25lZWRzX2dyYWRpbmcnXG4gIHwgJ25lZWRzX2NsZWFyaW5nJztcblxuZXhwb3J0IGludGVyZmFjZSBWYWxpZGF0aW9uUmVhc29uIHtcbiAgY29kZTogVmFsaWRhdGlvbkNvZGU7XG4gIHNldmVyaXR5OiAnZXJyb3InIHwgJ3ByZXBhcmF0aW9uJztcbiAgbWVzc2FnZTogc3RyaW5nO1xuICB2YWx1ZT86IG51bWJlcjtcbiAgbGltaXQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIEZvdW5kYXRpb25UeXBlID0gJ2dyYWRlZF9wYWQnIHwgJ3N0ZXBwZWRfcGxpbnRoJyB8ICdkZWNrJztcblxuZXhwb3J0IGludGVyZmFjZSBCdWlsZGluZ1J1bGVzIHtcbiAgaWQ6IHN0cmluZztcbiAgd2lkdGg6IG51bWJlcjtcbiAgZGVwdGg6IG51bWJlcjtcbiAgd2FsbEhlaWdodDogbnVtYmVyO1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbiAgLyoqIFJlbGllZiBhdCBvciBiZWxvdyB0aGlzIG5lZWRzIG5vIGdyYWRpbmcgdG8gYmUgY2FsbGVkIHZhbGlkLiAqL1xuICBtYXhSZWxpZWZOb1ByZXA6IG51bWJlcjtcbiAgLyoqIFJlbGllZiBhYm92ZSB0aGlzIGNhbm5vdCBiZSBwcmVwYXJlZCBieSB0aGlzIGJ1aWxkaW5nIHR5cGUuICovXG4gIG1heFJlbGllZlByZXBhcmVkOiBudW1iZXI7XG4gIG1heFN0ZXA6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgbWF4Q3V0Vm9sdW1lOiBudW1iZXI7XG4gIG1heEZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4T2JzdHJ1Y3Rpb25zOiBudW1iZXI7XG4gIHJlcXVpcmVzRHJ5OiBib29sZWFuO1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uVHlwZTtcbn1cblxuZXhwb3J0IGNvbnN0IEhPVVNFX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ2hvdXNlLTh4NicsXG4gIHdpZHRoOiA4LFxuICBkZXB0aDogNixcbiAgd2FsbEhlaWdodDogMyxcbiAgY2xlYXJhbmNlOiAzLFxuICBtYXhSZWxpZWZOb1ByZXA6IDEuMixcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDQuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAyLFxuICBtYXhGaWxsOiAyLFxuICBtYXhDdXRWb2x1bWU6IDQ4LFxuICBtYXhGaWxsVm9sdW1lOiA0OCxcbiAgbWF4T2JzdHJ1Y3Rpb25zOiAwLFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ2dyYWRlZF9wYWQnLFxufTtcblxuZXhwb3J0IGNvbnN0IEZBUk1fUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAnZmFybS0xMng4JyxcbiAgd2lkdGg6IDEyLFxuICBkZXB0aDogOCxcbiAgd2FsbEhlaWdodDogMCxcbiAgY2xlYXJhbmNlOiAxLFxuICBtYXhSZWxpZWZOb1ByZXA6IDEuMixcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDYuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAyLFxuICBtYXhGaWxsOiAyLFxuICBtYXhDdXRWb2x1bWU6IDk2LFxuICBtYXhGaWxsVm9sdW1lOiA5NixcbiAgbWF4T2JzdHJ1Y3Rpb25zOiA0LFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ3N0ZXBwZWRfcGxpbnRoJyxcbn07XG5cbmV4cG9ydCBjb25zdCBQQVRIX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ3BhdGgtOXgzJyxcbiAgd2lkdGg6IDksXG4gIGRlcHRoOiAzLFxuICB3YWxsSGVpZ2h0OiAwLFxuICBjbGVhcmFuY2U6IDEsXG4gIG1heFJlbGllZk5vUHJlcDogMi4wLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNC4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDEsXG4gIG1heEZpbGw6IDEsXG4gIG1heEN1dFZvbHVtZTogMzIsXG4gIG1heEZpbGxWb2x1bWU6IDMyLFxuICBtYXhPYnN0cnVjdGlvbnM6IDIsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnZGVjaycsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVQcm9wb3NhbCB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25TdW1tYXJ5IHtcbiAgbmVlZHNHcmFkaW5nOiBib29sZWFuO1xuICBuZWVkc0NsZWFyaW5nOiBib29sZWFuO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBvYnN0cnVjdGlvbklkczogc3RyaW5nW107XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25UeXBlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVWYWxpZGF0aW9uIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHN0YXRlOiBTaXRlU3RhdGU7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgcXVlcnk6IEZvb3RwcmludFF1ZXJ5O1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25TdW1tYXJ5O1xufVxuXG5mdW5jdGlvbiBlcnJvcihjb2RlOiBWYWxpZGF0aW9uQ29kZSwgbWVzc2FnZTogc3RyaW5nLCB2YWx1ZT86IG51bWJlciwgbGltaXQ/OiBudW1iZXIpOiBWYWxpZGF0aW9uUmVhc29uIHtcbiAgcmV0dXJuIHsgY29kZSwgc2V2ZXJpdHk6ICdlcnJvcicsIG1lc3NhZ2UsIHZhbHVlLCBsaW1pdCB9O1xufVxuXG5mdW5jdGlvbiBwcmVwKGNvZGU6IFZhbGlkYXRpb25Db2RlLCBtZXNzYWdlOiBzdHJpbmcsIHZhbHVlPzogbnVtYmVyLCBsaW1pdD86IG51bWJlcik6IFZhbGlkYXRpb25SZWFzb24ge1xuICByZXR1cm4geyBjb2RlLCBzZXZlcml0eTogJ3ByZXBhcmF0aW9uJywgbWVzc2FnZSwgdmFsdWUsIGxpbWl0IH07XG59XG5cbi8qKlxuICogVmFsaWRhdGUgYSBwcm9wb3NlZCBzaXRlIGFnYWluc3QgaXRzIGJ1aWxkaW5nIHJ1bGVzLiBQdXJlOiBubyB2b3hlbHMsXG4gKiBlbnRpdGllcyBvciByZXNvdXJjZXMgY2hhbmdlLiBgcXVlcnlgIG1heSBiZSBzdXBwbGllZCBieSBhIHNlYXJjaCB0byByZXVzZVxuICogdGhlIGNhY2hlZCBjb2x1bW5zLCBhbmQgYGZvb3RwcmludGAgbWF5IGJlIHN1cHBsaWVkIHdoZW4gdGhlIGNhbGxlciBhbHJlYWR5XG4gKiBldmFsdWF0ZWQgdGhlIHNhbWUgcmVjdC9mbG9vciBwYWlyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVTaXRlKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCksXG4gIGZvb3RwcmludD86IEZvb3RwcmludFF1ZXJ5LFxuKTogU2l0ZVZhbGlkYXRpb24ge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgcnVsZXMgPSBwcm9wb3NhbC5ydWxlcztcbiAgY29uc3QgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdID0gW107XG4gIGNvbnN0IGZwID0gZm9vdHByaW50ID8/IHF1ZXJ5LmZvb3RwcmludChyZWN0LCBwcm9wb3NhbC5mbG9vclkpO1xuICBjb25zdCBzdGF0cyA9IGZwLnN0YXRzO1xuXG4gIGlmIChyZWN0LngwIDwgLUhBTEYgfHwgcmVjdC56MCA8IC1IQUxGIHx8IHJlY3QueDEgPj0gSEFMRiB8fCByZWN0LnoxID49IEhBTEYpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoJ291dF9vZl9ib3VuZHMnLCBgZm9vdHByaW50ICR7cmVjdC54MH0sJHtyZWN0LnowfS4uJHtyZWN0LngxfSwke3JlY3QuejF9IGlzIG91dHNpZGUgdGhlIHdvcmxkYCkpO1xuICB9XG4gIGlmIChyZWN0LngxIC0gcmVjdC54MCArIDEgIT09IHJ1bGVzLndpZHRoIHx8IHJlY3QuejEgLSByZWN0LnowICsgMSAhPT0gcnVsZXMuZGVwdGgpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZm9vdHByaW50X21pc21hdGNoJyxcbiAgICAgIGBmb290cHJpbnQgaXMgJHtyZWN0LngxIC0gcmVjdC54MCArIDF9IHggJHtyZWN0LnoxIC0gcmVjdC56MCArIDF9IG0sICR7cnVsZXMud2lkdGh9IHggJHtydWxlcy5kZXB0aH0gbSByZXF1aXJlZGAsXG4gICAgKSk7XG4gIH1cblxuICBpZiAoc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnc2xvcGVfZXhjZWVkZWQnLFxuICAgICAgYHJlbGllZiAke3N0YXRzLnJlbGllZn0gbSBleGNlZWRzIHRoZSAke3J1bGVzLm1heFJlbGllZlByZXBhcmVkfSBtIHByZXBhcmVkIGxpbWl0YCxcbiAgICAgIHN0YXRzLnJlbGllZiwgcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heFN0ZXAgPiBydWxlcy5tYXhTdGVwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3N0ZXBfZXhjZWVkZWQnLFxuICAgICAgYHN1cmZhY2Ugc3RlcCAke3N0YXRzLm1heFN0ZXB9IG0gZXhjZWVkcyAke3J1bGVzLm1heFN0ZXB9IG1gLFxuICAgICAgc3RhdHMubWF4U3RlcCwgcnVsZXMubWF4U3RlcCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4Q3V0ID4gcnVsZXMubWF4Q3V0KSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2N1dF9leGNlZWRlZCcsXG4gICAgICBgY3V0ICR7c3RhdHMubWF4Q3V0fSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXR9IG1gLFxuICAgICAgc3RhdHMubWF4Q3V0LCBydWxlcy5tYXhDdXQsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEZpbGwgPiBydWxlcy5tYXhGaWxsKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2ZpbGxfZXhjZWVkZWQnLFxuICAgICAgYGZpbGwgJHtzdGF0cy5tYXhGaWxsfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsfSBtYCxcbiAgICAgIHN0YXRzLm1heEZpbGwsIHJ1bGVzLm1heEZpbGwsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLmN1dFZvbHVtZSA+IHJ1bGVzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdjdXRfdm9sdW1lX2V4Y2VlZGVkJyxcbiAgICAgIGBjdXQgdm9sdW1lICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXRWb2x1bWV9IG1cdTAwQjNgLFxuICAgICAgc3RhdHMuY3V0Vm9sdW1lLCBydWxlcy5tYXhDdXRWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLmZpbGxWb2x1bWUgPiBydWxlcy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2ZpbGxfdm9sdW1lX2V4Y2VlZGVkJyxcbiAgICAgIGBmaWxsIHZvbHVtZSAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEZpbGxWb2x1bWV9IG1cdTAwQjNgLFxuICAgICAgc3RhdHMuZmlsbFZvbHVtZSwgcnVsZXMubWF4RmlsbFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAocnVsZXMucmVxdWlyZXNEcnkgJiYgc3RhdHMud2F0ZXJDb2x1bW5zID4gMCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICd3YXRlcicsXG4gICAgICBgJHtzdGF0cy53YXRlckNvbHVtbnN9IGZvb3RwcmludCBjb2x1bW5zIGFyZSB1bmRlcndhdGVyYCxcbiAgICAgIHN0YXRzLndhdGVyQ29sdW1ucywgMCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IHJ1bGVzLm1heE9ic3RydWN0aW9ucykge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmb290cHJpbnRfb2JzdHJ1Y3RlZCcsXG4gICAgICBgJHtzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgZXhjZWVkIHRoZSAke3J1bGVzLm1heE9ic3RydWN0aW9uc30gYWxsb3dhbmNlYCxcbiAgICAgIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGgsIHJ1bGVzLm1heE9ic3RydWN0aW9ucyxcbiAgICApKTtcbiAgfVxuICBpZiAoZnAub3ZlcmhhbmdDZWxscy5sZW5ndGggPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ292ZXJoYW5nJyxcbiAgICAgIGAke2ZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RofSBjZWxscyBhYm92ZSB0aGUgZmxvb3IgYXJlIGJsb2NrZWRgLFxuICAgICAgZnAub3ZlcmhhbmdDZWxscy5sZW5ndGgsIDAsXG4gICAgKSk7XG4gIH1cblxuICBjb25zdCBuZWVkc0dyYWRpbmcgPSBzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZOb1ByZXBcbiAgICB8fCBzdGF0cy5jdXRWb2x1bWUgPiAwIHx8IHN0YXRzLmZpbGxWb2x1bWUgPiAwO1xuICBjb25zdCBuZWVkc0NsZWFyaW5nID0gc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDBcbiAgICAmJiBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoIDw9IHJ1bGVzLm1heE9ic3RydWN0aW9ucztcblxuICBpZiAobmVlZHNHcmFkaW5nKSB7XG4gICAgcmVhc29ucy5wdXNoKHByZXAoXG4gICAgICAnbmVlZHNfZ3JhZGluZycsXG4gICAgICBgZ3JhZGluZyByZXF1aXJlZDogJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgY3V0LCAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZmlsbGAsXG4gICAgICBzdGF0cy5jdXRWb2x1bWUgKyBzdGF0cy5maWxsVm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChuZWVkc0NsZWFyaW5nKSB7XG4gICAgcmVhc29ucy5wdXNoKHByZXAoXG4gICAgICAnbmVlZHNfY2xlYXJpbmcnLFxuICAgICAgYCR7c3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIHRvIGNsZWFyYCxcbiAgICAgIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGgsIHJ1bGVzLm1heE9ic3RydWN0aW9ucyxcbiAgICApKTtcbiAgfVxuXG4gIGNvbnN0IGhhc0Vycm9yID0gcmVhc29ucy5zb21lKChyKSA9PiByLnNldmVyaXR5ID09PSAnZXJyb3InKTtcbiAgY29uc3QgaGFzUHJlcCA9IHJlYXNvbnMuc29tZSgocikgPT4gci5zZXZlcml0eSA9PT0gJ3ByZXBhcmF0aW9uJyk7XG4gIGNvbnN0IHN0YXRlOiBTaXRlU3RhdGUgPSBoYXNFcnJvciA/ICdpbnZhbGlkJyA6IGhhc1ByZXAgPyAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicgOiAndmFsaWQnO1xuXG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgc3RhdGUsXG4gICAgcmVhc29ucyxcbiAgICBxdWVyeTogZnAsXG4gICAgcHJlcGFyYXRpb246IHtcbiAgICAgIG5lZWRzR3JhZGluZyxcbiAgICAgIG5lZWRzQ2xlYXJpbmcsXG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgICBvYnN0cnVjdGlvbklkczogc3RhdHMub2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCksXG4gICAgICBmb3VuZGF0aW9uOiBydWxlcy5mb3VuZGF0aW9uLFxuICAgIH0sXG4gIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2FuZGlkYXRlIHNlYXJjaCAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFNlYXJjaE9wdGlvbnMge1xuICAvKiogQ2FuZGlkYXRlIGdyaWQgc3RlcCBpbiBtZXRyZXMuIERlZmF1bHQgMi4gKi9cbiAgc3RlcD86IG51bWJlcjtcbiAgbWF4UmVzdWx0cz86IG51bWJlcjtcbiAgYW5jaG9yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBtYXhEaXN0YW5jZT86IG51bWJlcjtcbiAgLyoqIEhhcmQgY29uc3RyYWludDogY2FuZGlkYXRlIGNlbnRyZSBtdXN0IGxpZSB3aXRoaW4gdGhpcyByYWRpdXMgb2YgYSBwb2ludC4gKi9cbiAgbmVhcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IG1heERpc3RhbmNlOiBudW1iZXIgfTtcbiAgLyoqIERvIG5vdCByZXR1cm4gdHdvIGNhbmRpZGF0ZXMgd2hvc2UgZm9vdHByaW50cyBvdmVybGFwLiBEZWZhdWx0IHRydWUuICovXG4gIGRpc3RpbmN0PzogYm9vbGVhbjtcbiAgLyoqIFdhbGwtY2xvY2sgYnVkZ2V0IGZvciB0aGUgc2Nhbi4gRGVmYXVsdCAxMDAgbXMuICovXG4gIGJ1ZGdldE1zPzogbnVtYmVyO1xuICB3YWxrPzogV2Fsa1BhcmFtcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlQ2FuZGlkYXRlIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBzdGF0ZTogJ3ZhbGlkJyB8ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJztcbiAgdmFsaWRhdGlvbjogU2l0ZVZhbGlkYXRpb247XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uQ291bnQ6IG51bWJlcjtcbiAgZGlzdGFuY2U6IG51bWJlcjtcbiAgc2NvcmU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlU2VhcmNoUmVzdWx0IHtcbiAgY2FuZGlkYXRlczogU2l0ZUNhbmRpZGF0ZVtdO1xuICBldmFsdWF0ZWQ6IG51bWJlcjtcbiAgcmVqZWN0ZWQ6IG51bWJlcjtcbiAgZWxhcHNlZE1zOiBudW1iZXI7XG4gIGJ1ZGdldE1zOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhlIHdhbGwtY2xvY2sgYnVkZ2V0IHN0b3BwZWQgdGhlIHNjYW4gYmVmb3JlIHRoZSBhcmVhIHdhcyBleGhhdXN0ZWQuICovXG4gIHRydW5jYXRlZDogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gZmxvb3JDYW5kaWRhdGVzKHN0YXRzOiBBcmVhU3RhdHMpOiBudW1iZXJbXSB7XG4gIGNvbnN0IG1lYW4gPSBNYXRoLnJvdW5kKHN0YXRzLm1lYW5ZKTtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGZvciAobGV0IGQgPSAtMTsgZCA8PSAxOyBkKyspIHNldC5hZGQobWVhbiArIGQpO1xuICBzZXQuYWRkKHN0YXRzLm1pblkpO1xuICBzZXQuYWRkKHN0YXRzLm1heFkpO1xuICByZXR1cm4gWy4uLnNldF0uZmlsdGVyKCh5KSA9PiB5ID49IFlfTUlOICYmIHkgPCBZX01BWCkuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xufVxuXG5mdW5jdGlvbiBvdmVybGFwcyhhOiBSZWN0LCBiOiBSZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejA7XG59XG5cbmZ1bmN0aW9uIGNhbmRpZGF0ZVNjb3JlKHY6IFNpdGVWYWxpZGF0aW9uLCBkaXN0YW5jZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgcHJlcFBlbmFsdHkgPSB2LnN0YXRlID09PSAndmFsaWQnID8gMCA6IDI1O1xuICBjb25zdCBncmFkaW5nID0gdi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUgKyB2LnByZXBhcmF0aW9uLmZpbGxWb2x1bWU7XG4gIGNvbnN0IGNsZWFyaW5nID0gdi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcy5sZW5ndGggKiA0O1xuICByZXR1cm4gcHJlcFBlbmFsdHkgKyBncmFkaW5nICsgY2xlYXJpbmcgKyBkaXN0YW5jZSAqIDAuMjU7XG59XG5cbi8qKlxuICogU2VhcmNoIGEgYm91bmRlZCBhcmVhIGZvciB2aWFibGUgZm9vdHByaW50cy4gVGhlIHNhbWUgdmFsaWRhdG9yIGFuZCB0aGUgc2FtZVxuICogZmxvb3Itc2VsZWN0aW9uIHBvbGljeSBhcmUgdXNlZCBieSB0aGUgQUkgYWdlbnQgYW5kIHRoZSBwbGF5ZXIncyBidWlsZFxuICogcHJldmlldy4gU2VhcmNoIGlzIHJlYWQtb25seS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlYXJjaFNpdGVzKFxuICB3b3JsZDogV29ybGQsIHJ1bGVzOiBCdWlsZGluZ1J1bGVzLCBhcmVhOiBSZWN0LCBvcHRpb25zOiBTZWFyY2hPcHRpb25zID0ge30sXG4pOiBTaXRlU2VhcmNoUmVzdWx0IHtcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3Qgc3RlcCA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3Iob3B0aW9ucy5zdGVwID8/IDIpKTtcbiAgY29uc3QgbWF4UmVzdWx0cyA9IE1hdGgubWF4KDEsIG9wdGlvbnMubWF4UmVzdWx0cyA/PyA4KTtcbiAgY29uc3QgZGlzdGluY3QgPSBvcHRpb25zLmRpc3RpbmN0ICE9PSBmYWxzZTtcbiAgY29uc3QgbWF4RGlzdGFuY2UgPSBvcHRpb25zLm1heERpc3RhbmNlID8/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgY29uc3QgYnVkZ2V0TXMgPSBvcHRpb25zLmJ1ZGdldE1zID8/IDEwMDtcbiAgY29uc3QgYW5jaG9yID0gb3B0aW9ucy5hbmNob3IgPz8geyB4OiAoYXJlYS54MCArIGFyZWEueDEpIC8gMiwgejogKGFyZWEuejAgKyBhcmVhLnoxKSAvIDIgfTtcbiAgY29uc3QgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKTtcbiAgY29uc3QgYWxsOiBTaXRlQ2FuZGlkYXRlW10gPSBbXTtcbiAgbGV0IGV2YWx1YXRlZCA9IDA7XG4gIGxldCByZWplY3RlZCA9IDA7XG4gIGxldCB0cnVuY2F0ZWQgPSBmYWxzZTtcblxuICBjb25zdCB4MU1heCA9IGFyZWEueDEgLSBydWxlcy53aWR0aCArIDE7XG4gIGNvbnN0IHoxTWF4ID0gYXJlYS56MSAtIHJ1bGVzLmRlcHRoICsgMTtcbiAgc2NhbjogZm9yIChsZXQgeiA9IGFyZWEuejA7IHogPD0gejFNYXg7IHogKz0gc3RlcCkge1xuICAgIGZvciAobGV0IHggPSBhcmVhLngwOyB4IDw9IHgxTWF4OyB4ICs9IHN0ZXApIHtcbiAgICAgIGNvbnN0IHJlY3QgPSB7IHgwOiB4LCB6MDogeiwgeDE6IHggKyBydWxlcy53aWR0aCAtIDEsIHoxOiB6ICsgcnVsZXMuZGVwdGggLSAxIH07XG4gICAgICBjb25zdCBjeCA9IChyZWN0LngwICsgcmVjdC54MSkgLyAyO1xuICAgICAgY29uc3QgY3ogPSAocmVjdC56MCArIHJlY3QuejEpIC8gMjtcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5oeXBvdChjeCAtIGFuY2hvci54LCBjeiAtIGFuY2hvci56KTtcbiAgICAgIGlmIChkaXN0YW5jZSA+IG1heERpc3RhbmNlKSBjb250aW51ZTtcbiAgICAgIGlmIChvcHRpb25zLm5lYXIpIHtcbiAgICAgICAgY29uc3QgbmVhckRpc3RhbmNlID0gTWF0aC5oeXBvdChjeCAtIG9wdGlvbnMubmVhci54LCBjeiAtIG9wdGlvbnMubmVhci56KTtcbiAgICAgICAgaWYgKG5lYXJEaXN0YW5jZSA+IG9wdGlvbnMubmVhci5tYXhEaXN0YW5jZSkgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0YXRzID0gcXVlcnkuYXJlYShyZWN0KTtcbiAgICAgIGxldCBiZXN0OiBTaXRlQ2FuZGlkYXRlIHwgbnVsbCA9IG51bGw7XG4gICAgICBmb3IgKGNvbnN0IGZsb29yWSBvZiBmbG9vckNhbmRpZGF0ZXMoc3RhdHMpKSB7XG4gICAgICAgIGV2YWx1YXRlZCsrO1xuICAgICAgICBjb25zdCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsID0ge1xuICAgICAgICAgIHNpdGVJZDogYCR7cnVsZXMuaWR9OiR7eH0sJHt6fSwke2Zsb29yWX1gLFxuICAgICAgICAgIHJlY3QsIGZsb29yWSwgcnVsZXMsXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGZvb3RwcmludCA9IHF1ZXJ5LmZvb3RwcmludChyZWN0LCBmbG9vclkpO1xuICAgICAgICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCwgcXVlcnksIGZvb3RwcmludCk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcpIHtcbiAgICAgICAgICByZWplY3RlZCsrO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHNjb3JlID0gY2FuZGlkYXRlU2NvcmUodmFsaWRhdGlvbiwgZGlzdGFuY2UpO1xuICAgICAgICBjb25zdCBjYW5kaWRhdGU6IFNpdGVDYW5kaWRhdGUgPSB7XG4gICAgICAgICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgICAgICAgcmVjdCxcbiAgICAgICAgICBmbG9vclksXG4gICAgICAgICAgc3RhdGU6IHZhbGlkYXRpb24uc3RhdGUsXG4gICAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgICAgICBjdXRWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uY3V0Vm9sdW1lLFxuICAgICAgICAgIGZpbGxWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZmlsbFZvbHVtZSxcbiAgICAgICAgICBvYnN0cnVjdGlvbkNvdW50OiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzLmxlbmd0aCxcbiAgICAgICAgICBkaXN0YW5jZSxcbiAgICAgICAgICBzY29yZSxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFiZXN0XG4gICAgICAgICAgfHwgKGNhbmRpZGF0ZS5zdGF0ZSA9PT0gJ3ZhbGlkJyAmJiBiZXN0LnN0YXRlICE9PSAndmFsaWQnKVxuICAgICAgICAgIHx8IChjYW5kaWRhdGUuc3RhdGUgPT09IGJlc3Quc3RhdGUgJiYgY2FuZGlkYXRlLnNjb3JlIDwgYmVzdC5zY29yZSkpIHtcbiAgICAgICAgICBiZXN0ID0gY2FuZGlkYXRlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYmVzdCkgYWxsLnB1c2goYmVzdCk7XG4gICAgfVxuICAgIGlmIChwZXJmb3JtYW5jZS5ub3coKSAtIHQwID4gYnVkZ2V0TXMpIHtcbiAgICAgIHRydW5jYXRlZCA9IHRydWU7XG4gICAgICBicmVhayBzY2FuO1xuICAgIH1cbiAgfVxuXG4gIGFsbC5zb3J0KChhLCBiKSA9PiBhLnNjb3JlIC0gYi5zY29yZSB8fCBhLmRpc3RhbmNlIC0gYi5kaXN0YW5jZVxuICAgIHx8IGEucmVjdC54MCAtIGIucmVjdC54MCB8fCBhLnJlY3QuejAgLSBiLnJlY3QuejApO1xuICBjb25zdCBzZWxlY3RlZDogU2l0ZUNhbmRpZGF0ZVtdID0gW107XG4gIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGFsbCkge1xuICAgIGlmIChkaXN0aW5jdCAmJiBzZWxlY3RlZC5zb21lKChzKSA9PiBvdmVybGFwcyhzLnJlY3QsIGNhbmRpZGF0ZS5yZWN0KSkpIGNvbnRpbnVlO1xuICAgIHNlbGVjdGVkLnB1c2goY2FuZGlkYXRlKTtcbiAgICBpZiAoc2VsZWN0ZWQubGVuZ3RoID49IG1heFJlc3VsdHMpIGJyZWFrO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5kaWRhdGVzOiBzZWxlY3RlZCxcbiAgICBldmFsdWF0ZWQsXG4gICAgcmVqZWN0ZWQsXG4gICAgZWxhcHNlZE1zOiBNYXRoLnJvdW5kKChwZXJmb3JtYW5jZS5ub3coKSAtIHQwKSAqIDEwMCkgLyAxMDAsXG4gICAgYnVkZ2V0TXMsXG4gICAgdHJ1bmNhdGVkLFxuICB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHByZXZpZXcgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBGb3VuZGF0aW9uUHJldmlldyB7XG4gIHR5cGU6IEZvdW5kYXRpb25UeXBlO1xuICAvKiogU3RvbmUgZmxvb3Igc2xhYiBwbHVzIGZpbGwgdW5kZXIgdGhlIHByZXBhcmVkIGZsb29yLiAqL1xuICBwbGludGhDZWxsczogbnVtYmVyO1xuICAvKiogUGVyaW1ldGVyIGNlbGxzIHRoYXQgbmVlZCBhIHJldGFpbmluZyBmYWNlIGJlY2F1c2Ugb2YgY3V0IG9yIGZpbGwuICovXG4gIHJldGFpbmluZ1dhbGxDZWxsczogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFjY2Vzc1ByZXZpZXcge1xuICBkb29yOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGRpc3RhbmNlOiBudW1iZXI7XG4gIGdyYWRlOiBudW1iZXI7XG4gIHdhbGthYmxlOiBib29sZWFuO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlUHJldmlldyB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgdGVycmFpbjoge1xuICAgIG1pblk6IG51bWJlcjtcbiAgICBtYXhZOiBudW1iZXI7XG4gICAgbWVhblk6IG51bWJlcjtcbiAgICByZWxpZWY6IG51bWJlcjtcbiAgICBtYXhTdGVwOiBudW1iZXI7XG4gICAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gICAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICAgIG1heEN1dDogbnVtYmVyO1xuICAgIG1heEZpbGw6IG51bWJlcjtcbiAgfTtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblByZXZpZXc7XG4gIG9ic3RydWN0aW9uczogQXJyYXk8e1xuICAgIGVudGl0eUlkOiBzdHJpbmc7XG4gICAga2luZDogc3RyaW5nO1xuICAgIHg6IG51bWJlcjtcbiAgICB6OiBudW1iZXI7XG4gICAgYWN0aW9uOiAnY2xlYXInIHwgJ2Jsb2NrZWQnO1xuICB9PjtcbiAgYWNjZXNzOiBBY2Nlc3NQcmV2aWV3IHwgbnVsbDtcbiAgLyoqIENvbXBsZXRlIHdvcmsgZW52ZWxvcGUgdGhpcyBwcmV2aWV3IHdvdWxkIGF1dGhvcml6ZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJldmlld09wdGlvbnMge1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgd2Fsaz86IFdhbGtQYXJhbXM7XG59XG5cbi8qKlxuICogQnVpbGQgdGhlIHRocmVlLXN0YXRlIHByZXZpZXcuIEl0IGlzIGRlbGliZXJhdGVseSBkYXRhLW9ubHk6IHRoZSByZW5kZXJlclxuICogY2FuIGRyYXcgaXQsIGJ1dCBpdCBuZXZlciBlZGl0cyB0ZXJyYWluIG9yIHNwZW5kcyByZXNvdXJjZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmV2aWV3U2l0ZShcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBvcHRpb25zOiBQcmV2aWV3T3B0aW9ucyA9IHt9LFxuKTogU2l0ZVByZXZpZXcge1xuICBjb25zdCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpO1xuICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCwgcXVlcnkpO1xuICBjb25zdCBmcCA9IHZhbGlkYXRpb24ucXVlcnk7XG4gIGNvbnN0IHN0YXRzID0gZnAuc3RhdHM7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCBydWxlcyA9IHByb3Bvc2FsLnJ1bGVzO1xuXG4gIGxldCBwZXJpbWV0ZXIgPSAwO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICAgIGlmICh4ICE9PSByZWN0LngwICYmIHggIT09IHJlY3QueDEgJiYgeiAhPT0gcmVjdC56MCAmJiB6ICE9PSByZWN0LnoxKSBjb250aW51ZTtcbiAgICAgIGlmIChjb2x1bW5BdCh3b3JsZCwgeCwgeikuc3VyZmFjZVkgIT09IHByb3Bvc2FsLmZsb29yWSkgcGVyaW1ldGVyKys7XG4gICAgfVxuICB9XG4gIGNvbnN0IGZvdW5kYXRpb246IEZvdW5kYXRpb25QcmV2aWV3ID0ge1xuICAgIHR5cGU6IHJ1bGVzLmZvdW5kYXRpb24sXG4gICAgcGxpbnRoQ2VsbHM6IHJlY3RDb2x1bW5zKHJlY3QpICsgc3RhdHMuZmlsbFZvbHVtZSxcbiAgICByZXRhaW5pbmdXYWxsQ2VsbHM6IHBlcmltZXRlcixcbiAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICB9O1xuXG4gIGxldCBhY2Nlc3M6IEFjY2Vzc1ByZXZpZXcgfCBudWxsID0gbnVsbDtcbiAgaWYgKG9wdGlvbnMuZG9vciAmJiBvcHRpb25zLmFwcHJvYWNoKSB7XG4gICAgY29uc3QgZG9vciA9IG9wdGlvbnMuZG9vcjtcbiAgICBjb25zdCBhcHByb2FjaCA9IG9wdGlvbnMuYXBwcm9hY2g7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguaHlwb3QoZG9vci54IC0gYXBwcm9hY2gueCwgZG9vci56IC0gYXBwcm9hY2gueik7XG4gICAgY29uc3Qgc3RlcHMgPSBNYXRoLm1heCgxLCBNYXRoLmNlaWwoZGlzdGFuY2UpKTtcbiAgICBsZXQgcHJldlggPSBhcHByb2FjaC54LCBwcmV2WiA9IGFwcHJvYWNoLno7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gc3RlcHM7IGkrKykge1xuICAgICAgY29uc3QgdCA9IGkgLyBzdGVwcztcbiAgICAgIGNvbnN0IHggPSBNYXRoLnJvdW5kKGFwcHJvYWNoLnggKyAoZG9vci54IC0gYXBwcm9hY2gueCkgKiB0KTtcbiAgICAgIGNvbnN0IHogPSBNYXRoLnJvdW5kKGFwcHJvYWNoLnogKyAoZG9vci56IC0gYXBwcm9hY2gueikgKiB0KTtcbiAgICAgIGlmICh4ID09PSBwcmV2WCAmJiB6ID09PSBwcmV2WikgY29udGludWU7XG4gICAgICBjb25zdCByZXN1bHQgPSB3YWxrU3RlcCh3b3JsZCwgcHJldlgsIHByZXZaLCB4LCB6LCBvcHRpb25zLndhbGsgPz8gREVGQVVMVF9XQUxLKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZWFzb25zLnB1c2goYCR7cmVzdWx0LnJlYXNvbn0gYXQgJHt4fSwke3p9YCk7XG4gICAgICBwcmV2WCA9IHg7IHByZXZaID0gejtcbiAgICB9XG4gICAgYWNjZXNzID0ge1xuICAgICAgZG9vciwgYXBwcm9hY2gsIGRpc3RhbmNlLFxuICAgICAgZ3JhZGU6IGVmZmVjdGl2ZUdyYWRlKHdvcmxkLCBhcHByb2FjaC54LCBhcHByb2FjaC56LCBkb29yLngsIGRvb3IueiksXG4gICAgICB3YWxrYWJsZTogcmVhc29ucy5sZW5ndGggPT09IDAsXG4gICAgICByZWFzb25zLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB5MCA9IHByb3Bvc2FsLmZsb29yWSAtIE1hdGgubWF4KDEsIHN0YXRzLm1heEN1dCkgLSAxO1xuICBjb25zdCB5MSA9IHByb3Bvc2FsLmZsb29yWSArIE1hdGgubWF4KHJ1bGVzLndhbGxIZWlnaHQsIDEpICsgMTtcbiAgY29uc3QgZW52ZWxvcGU6IFZveGVsUmVnaW9uW10gPSBbXG4gICAge1xuICAgICAgLi4uZXhwYW5kUmVjdChyZWN0LCAyKSxcbiAgICAgIHkwOiBNYXRoLm1heChZX01JTiwgeTApLFxuICAgICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgeTEpLFxuICAgIH0sXG4gIF07XG4gIGlmIChhY2Nlc3MpIHtcbiAgICBjb25zdCBheDAgPSBNYXRoLm1pbihhY2Nlc3MuZG9vci54LCBhY2Nlc3MuYXBwcm9hY2gueCkgLSAxO1xuICAgIGNvbnN0IGF4MSA9IE1hdGgubWF4KGFjY2Vzcy5kb29yLngsIGFjY2Vzcy5hcHByb2FjaC54KSArIDE7XG4gICAgY29uc3QgYXowID0gTWF0aC5taW4oYWNjZXNzLmRvb3IueiwgYWNjZXNzLmFwcHJvYWNoLnopIC0gMTtcbiAgICBjb25zdCBhejEgPSBNYXRoLm1heChhY2Nlc3MuZG9vci56LCBhY2Nlc3MuYXBwcm9hY2gueikgKyAxO1xuICAgIGNvbnN0IGFNaW4gPSBNYXRoLm1pbihzdXJmYWNlQXQod29ybGQsIGF4MCwgYXowKSwgc3VyZmFjZUF0KHdvcmxkLCBheDEsIGF6MSkpO1xuICAgIGNvbnN0IGFNYXggPSBNYXRoLm1heChzdXJmYWNlQXQod29ybGQsIGF4MCwgYXowKSwgc3VyZmFjZUF0KHdvcmxkLCBheDEsIGF6MSkpO1xuICAgIGVudmVsb3BlLnB1c2goe1xuICAgICAgeDA6IGF4MCwgeDE6IGF4MSwgejA6IGF6MCwgejE6IGF6MSxcbiAgICAgIHkwOiBNYXRoLm1heChZX01JTiwgYU1pbiAtIDIpLFxuICAgICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgYU1heCArIDIpLFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICBzdGF0ZTogdmFsaWRhdGlvbi5zdGF0ZSxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIHJ1bGVzLFxuICAgIHJlYXNvbnM6IHZhbGlkYXRpb24ucmVhc29ucyxcbiAgICB0ZXJyYWluOiB7XG4gICAgICBtaW5ZOiBzdGF0cy5taW5ZLFxuICAgICAgbWF4WTogc3RhdHMubWF4WSxcbiAgICAgIG1lYW5ZOiBzdGF0cy5tZWFuWSxcbiAgICAgIHJlbGllZjogc3RhdHMucmVsaWVmLFxuICAgICAgbWF4U3RlcDogc3RhdHMubWF4U3RlcCxcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICB9LFxuICAgIGZvdW5kYXRpb24sXG4gICAgb2JzdHJ1Y3Rpb25zOiBzdGF0cy5vYnN0cnVjdGlvbnMubWFwKChvKSA9PiAoe1xuICAgICAgZW50aXR5SWQ6IG8uZW50aXR5SWQsXG4gICAgICBraW5kOiBvLmtpbmQsXG4gICAgICB4OiBvLngsXG4gICAgICB6OiBvLnosXG4gICAgICBhY3Rpb246IHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJyA/ICdibG9ja2VkJyA6ICdjbGVhcicsXG4gICAgfSkpLFxuICAgIGFjY2VzcyxcbiAgICBlbnZlbG9wZSxcbiAgfTtcbn1cblxuIiwgIi8vIE0wMDIgc3RhZ2UgMzogYm91bmRlZCwgYXV0aG9yaXplZCB0ZXJyYWluIHByZXBhcmF0aW9uLlxuLy9cbi8vIFRoZSBwaXBlbGluZSBpcyBkZWxpYmVyYXRlbHkgb25lLXdheSBhbmQgc2hhcmVkIGJ5IHRoZSBwbGF5ZXIgYW5kIHRoZSBBSTpcbi8vXG4vLyAgIHByb3Bvc2FsIC0+IHZhbGlkYXRlU2l0ZSAtPiBwbGFuUHJlcGFyYXRpb24gLT4gQXV0aG9yaXplciAtPiBleGVjdXRlXG4vL1xuLy8gYGV4ZWN1dGVQcmVwYXJhdGlvbmAgaXMgdGhlIG9ubHkgZnVuY3Rpb24gaW4gTTAwMiB0aGF0IGVkaXRzIHRlcnJhaW4gZm9yXG4vLyBjb25zdHJ1Y3Rpb24uIEl0IHJlZnVzZXMgdG8gcnVuIHdpdGhvdXQgYW4gYXV0aG9yaXphdGlvbiB0b2tlbiB3aG9zZSBkaWdlc3Rcbi8vIG1hdGNoZXMgdGhlIHBsYW4sIHdob3NlIGVudmVsb3BlIGNvdmVycyBldmVyeSB2b3hlbCBpdCB3b3VsZCB0b3VjaCwgYW5kIHdob3NlXG4vLyBiYXNlIHJldmlzaW9uIHN0aWxsIG1hdGNoZXMgdGhlIHdvcmxkLiBBbGwgZWRpdHMgYXJlIGNvbXB1dGVkIGFuZCBjaGVja2VkXG4vLyBiZWZvcmUgdGhlIGZpcnN0IGJ5dGUgaXMgd3JpdHRlbiwgc28gYSByZWplY3RlZCBwbGFuIGNhbm5vdCBsZWF2ZSBhIHBhcnRpYWxcbi8vIHBhZCBiZWhpbmQuXG4vL1xuLy8gVGhlIGF1dGhvcml6ZXIgaW4gdGhpcyBmaWxlIGlzIGEgbG9jYWwgcG9saWN5IHN0dWIuIEl0IHByb3ZlcyB0aGF0IHRoZVxuLy8gcGlwZWxpbmUgYW5kIHRoZSBlbnZlbG9wZSBjaGVja3MgZXhpc3Q7IGl0IGlzIE5PVCBNYWdpY0Jsb2NrIGVuZm9yY2VtZW50LlxuLy8gTm8gY2hhaW4gcHJvZ3JhbSwgU0RLIGNhbGwsIHNldHRsZW1lbnQgb3Igcm9sbGJhY2sgZ3VhcmFudGVlIGlzIHByZXNlbnQuXG5pbXBvcnQge1xuICBXb3JsZCwgTUFULCBNYXRJZCwgWV9NSU4sIFlfTUFYLCBIQUxGLCBpc1NvbGlkLFxuICBnZXRWb3hlbCwgc2V0Vm94ZWwsIHJlbW92ZUVudGl0eSwgc3VyZmFjZUF0LFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgRW50aXR5S2luZCwgUmVzb3VyY2VUeXBlLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBub3JtYWxpemVSZWN0LCByZWN0Q29sdW1ucywgZXhwYW5kUmVjdCxcbiAgZW52ZWxvcGVDb250YWlucywgb2JzdHJ1Y3Rpb25zSW4sXG59IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQge1xuICBTaXRlUHJvcG9zYWwsIFNpdGVWYWxpZGF0aW9uLCBCdWlsZGluZ1J1bGVzLCB2YWxpZGF0ZVNpdGUsXG59IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7XG4gIGludmVudG9yeVNuYXBzaG90LCBub3JtYWxpemVFbnZlbG9wZSxcbn0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTE9DQUxfQVVUSE9SSVRZID0gJ2xvY2FsLXN0dWInIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IExPQ0FMX0VORk9SQ0VNRU5UID0gJ2xvY2FsLXNpbXVsYXRpb24tb25seScgYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29sdW1uVGFyZ2V0IHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQbGFuRXhwZWN0YXRpb24ge1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBvYnN0cnVjdGlvbnM6IG51bWJlcjtcbiAgc3VyZmFjZUVkaXRzOiBudW1iZXI7XG4gIHRvdGFsRWRpdHM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblBsYW4ge1xuICBpZDogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICAvKiogRXhhY3RseSBvbmUgdGFyZ2V0IHdhbGtpbmcgaGVpZ2h0IHBlciBmb290cHJpbnQgY29sdW1uLCBzb3J0ZWQgYnkgeiwgeC4gKi9cbiAgdGFyZ2V0czogQ29sdW1uVGFyZ2V0W107XG4gIC8qKiBBdXRob3JpdGF0aXZlIGVudGl0eSBpZHMgdGhpcyBwbGFuIG1heSByZW1vdmUuICovXG4gIGNsZWFyRW50aXR5SWRzOiBzdHJpbmdbXTtcbiAgLyoqIE1hdGVyaWFsIGZvciB0aGUgdG9wIHNvbGlkIHZveGVsIGFmdGVyIGdyYWRpbmcsIG9yIG51bGwgdG8ga2VlcCBpdC4gKi9cbiAgc3VyZmFjZU1hdGVyaWFsOiBNYXRJZCB8IG51bGw7XG4gIC8qKiBUaWdodCBlbnZlbG9wZSBjb3ZlcmluZyBldmVyeSBwbGFubmVkIHZveGVsIGNoYW5nZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGV4cGVjdGVkOiBQbGFuRXhwZWN0YXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25PcHRpb25zIHtcbiAgLyoqIFBlci1jb2x1bW4gdGFyZ2V0cyBmb3IgdGVycmFjZXMgb3Igc3RlcHBlZCBwYXRocy4gRGVmYXVsdHMgdG8gZmxvb3JZLiAqL1xuICB0YXJnZXRzPzogQ29sdW1uVGFyZ2V0W107XG4gIC8qKiBgbm9uZWAgaXMgb25seSBsZWdhbCB3aGVuIHRoZSBzaXRlIGhhcyBubyBvYnN0cnVjdGlvbnMuICovXG4gIGNsZWFyPzogJ29ic3RydWN0aW9ucycgfCAnbm9uZSc7XG4gIC8qKiBTZXQgdGhlIHRvcCBzb2xpZCB2b3hlbCBvZiBldmVyeSB0YXJnZXQgY29sdW1uIChwYXRocywgZmllbGRzKS4gKi9cbiAgc3VyZmFjZU1hdGVyaWFsPzogTWF0SWQ7XG4gIC8qKiBFeHBsaWNpdCB3b3JrIGVudmVsb3BlLiBEZWZhdWx0cyB0byBhIHRpZ2h0IGVudmVsb3BlIGFyb3VuZCB0aGUgZWRpdHMuICovXG4gIGVudmVsb3BlPzogVm94ZWxSZWdpb25bXTtcbn1cblxuLy8gLS0tLS0tLS0tLSBzdGFibGUgZGlnZXN0IC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGRpZ2VzdChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGEgPSAweDgxMWM5ZGM1O1xuICBsZXQgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaW5wdXQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gaW5wdXQuY2hhckNvZGVBdChpKTtcbiAgICBhID0gTWF0aC5pbXVsKGEgXiBjLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoYyArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICBiIF49IGIgPj4+IDEzO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuLyoqIERpZ2VzdCBvZiBldmVyeXRoaW5nIHRoYXQgY2hhbmdlcyB0aGUgc2V0IG9mIGVkaXRzIG9yIHJlbW92YWxzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW5EaWdlc3QocGxhbjogUHJlcGFyYXRpb25QbGFuKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW1xuICAgICdtMDAyOnByZXAtcGxhbjp2MScsXG4gICAgcGxhbi5zaXRlSWQsXG4gICAgYCR7cGxhbi5yZWN0LngwfSwke3BsYW4ucmVjdC56MH0sJHtwbGFuLnJlY3QueDF9LCR7cGxhbi5yZWN0LnoxfWAsXG4gICAgU3RyaW5nKHBsYW4uZmxvb3JZKSxcbiAgICBwbGFuLnJ1bGVzLmlkLFxuICAgIFN0cmluZyhwbGFuLnRhcmdldHMubGVuZ3RoKSxcbiAgICBwbGFuLnN1cmZhY2VNYXRlcmlhbCA9PT0gbnVsbCA/ICdzdXJmYWNlOmtlZXAnIDogYHN1cmZhY2U6JHtwbGFuLnN1cmZhY2VNYXRlcmlhbH1gLFxuICBdO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSBsaW5lcy5wdXNoKGB0OiR7dC54fSwke3Quen0sJHt0Lnl9YCk7XG4gIGNvbnN0IGNsZWFycyA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gIGxpbmVzLnB1c2goYGM6JHtjbGVhcnMubGVuZ3RofWApO1xuICBmb3IgKGNvbnN0IGlkIG9mIGNsZWFycykgbGluZXMucHVzaChgYzoke2lkfWApO1xuICBmb3IgKGNvbnN0IGUgb2Ygbm9ybWFsaXplRW52ZWxvcGUocGxhbi5lbnZlbG9wZSkpIHtcbiAgICBsaW5lcy5wdXNoKGBlOiR7ZS54MH0sJHtlLnowfSwke2UueTB9LCR7ZS54MX0sJHtlLnoxfSwke2UueTF9YCk7XG4gIH1cbiAgY29uc3QgeCA9IHBsYW4uZXhwZWN0ZWQ7XG4gIGxpbmVzLnB1c2goYHg6JHt4LmN1dFZvbHVtZX0sJHt4LmZpbGxWb2x1bWV9LCR7eC5tYXhDdXR9LCR7eC5tYXhGaWxsfSwke3gub2JzdHJ1Y3Rpb25zfSwke3guc3VyZmFjZUVkaXRzfSwke3gudG90YWxFZGl0c31gKTtcbiAgcmV0dXJuIGRpZ2VzdChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGxhbm5pbmcgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBQbGFuU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBQcmVwYXJhdGlvblBsYW47XG4gIHZhbGlkYXRpb246IFNpdGVWYWxpZGF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgc3RhZ2U6ICdwbGFuJyB8ICdhdXRob3JpemUnIHwgJ2V4ZWN1dGUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xuICB2YWxpZGF0aW9uPzogU2l0ZVZhbGlkYXRpb247XG59XG5cbmV4cG9ydCB0eXBlIFBsYW5SZXN1bHQgPSBQbGFuU3VjY2VzcyB8IFByZXBhcmF0aW9uRmFpbHVyZTtcblxuZnVuY3Rpb24gZGVmYXVsdFRhcmdldHMod29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0LCBmbG9vclk6IG51bWJlcik6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3Qgb3V0OiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIG91dC5wdXNoKHsgeCwgeiwgeTogZmxvb3JZIH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHNvcnRlZFRhcmdldHModGFyZ2V0czogcmVhZG9ubHkgQ29sdW1uVGFyZ2V0W10pOiBDb2x1bW5UYXJnZXRbXSB7XG4gIHJldHVybiBbLi4udGFyZ2V0c10uc29ydCgoYSwgYikgPT4gYS56IC0gYi56IHx8IGEueCAtIGIueCB8fCBhLnkgLSBiLnkpO1xufVxuXG5pbnRlcmZhY2UgVGFyZ2V0U3RhdHMge1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICByZWxpZWY6IG51bWJlcjtcbn1cblxuLyoqIEN1dC9maWxsIGltcGxpZWQgYnkgZXhwbGljaXQgdGFyZ2V0cywgaW5kZXBlbmRlbnQgb2YgdGhlIGZsYXQgZmxvb3JZLiAqL1xuZnVuY3Rpb24gdGFyZ2V0U3RhdHMod29ybGQ6IFdvcmxkLCB0YXJnZXRzOiByZWFkb25seSBDb2x1bW5UYXJnZXRbXSk6IFRhcmdldFN0YXRzIHtcbiAgbGV0IGN1dFZvbHVtZSA9IDAsIGZpbGxWb2x1bWUgPSAwLCBtYXhDdXQgPSAwLCBtYXhGaWxsID0gMDtcbiAgbGV0IG1pblkgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heFkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIG1pblkgPSBNYXRoLm1pbihtaW5ZLCBzdXJmYWNlLCB0LnkpO1xuICAgIG1heFkgPSBNYXRoLm1heChtYXhZLCBzdXJmYWNlLCB0LnkpO1xuICAgIGlmIChzdXJmYWNlID4gdC55KSB7XG4gICAgICBjb25zdCBkID0gc3VyZmFjZSAtIHQueTtcbiAgICAgIGN1dFZvbHVtZSArPSBkO1xuICAgICAgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkKTtcbiAgICB9IGVsc2UgaWYgKHN1cmZhY2UgPCB0LnkpIHtcbiAgICAgIGNvbnN0IGQgPSB0LnkgLSBzdXJmYWNlO1xuICAgICAgZmlsbFZvbHVtZSArPSBkO1xuICAgICAgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIGQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4geyBjdXRWb2x1bWUsIGZpbGxWb2x1bWUsIG1heEN1dCwgbWF4RmlsbCwgcmVsaWVmOiBtYXhZIC0gbWluWSB9O1xufVxuXG5mdW5jdGlvbiB0YXJnZXRSdWxlUmVhc29ucyhzdGF0czogVGFyZ2V0U3RhdHMsIHJ1bGVzOiBCdWlsZGluZ1J1bGVzKTogc3RyaW5nW10ge1xuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQpIHtcbiAgICByZWFzb25zLnB1c2goYHJlbGllZiAke3N0YXRzLnJlbGllZn0gbSBleGNlZWRzIHRoZSAke3J1bGVzLm1heFJlbGllZlByZXBhcmVkfSBtIHByZXBhcmVkIGxpbWl0YCk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEN1dCA+IHJ1bGVzLm1heEN1dCkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0ICR7c3RhdHMubWF4Q3V0fSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXR9IG1gKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4RmlsbCA+IHJ1bGVzLm1heEZpbGwpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgJHtzdGF0cy5tYXhGaWxsfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsfSBtYCk7XG4gIH1cbiAgaWYgKHN0YXRzLmN1dFZvbHVtZSA+IHJ1bGVzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0IHZvbHVtZSAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4Q3V0Vm9sdW1lfSBtXHUwMEIzYCk7XG4gIH1cbiAgaWYgKHN0YXRzLmZpbGxWb2x1bWUgPiBydWxlcy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsIHZvbHVtZSAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEZpbGxWb2x1bWV9IG1cdTAwQjNgKTtcbiAgfVxuICByZXR1cm4gcmVhc29ucztcbn1cblxuLyoqXG4gKiBUdXJuIGEgcHJvcG9zYWwgaW50byBhbiBleHBsaWNpdCwgY2hlY2thYmxlIHBsYW4uIFJlYWQtb25seS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW5QcmVwYXJhdGlvbihcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBvcHRpb25zOiBQcmVwYXJhdGlvbk9wdGlvbnMgPSB7fSxcbik6IFBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwpO1xuXG4gIGlmICh2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICdzaXRlX2ludmFsaWQnLFxuICAgICAgcmVhc29uczogdmFsaWRhdGlvbi5yZWFzb25zLm1hcCgocikgPT4gYCR7ci5jb2RlfTogJHtyLm1lc3NhZ2V9YCksXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB0YXJnZXRzID0gc29ydGVkVGFyZ2V0cyhvcHRpb25zLnRhcmdldHMgPz8gZGVmYXVsdFRhcmdldHMod29ybGQsIHJlY3QsIHByb3Bvc2FsLmZsb29yWSkpO1xuICBjb25zdCBjb2x1bW5zID0gcmVjdENvbHVtbnMocmVjdCk7XG4gIGlmICh0YXJnZXRzLmxlbmd0aCAhPT0gY29sdW1ucykge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3RhcmdldF9jb3VudCcsXG4gICAgICByZWFzb25zOiBbYHBsYW4gaGFzICR7dGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZm9yICR7Y29sdW1uc30gY29sdW1uc2BdLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG5cbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IGtleSA9IGAke3QueH0sJHt0Lnp9YDtcbiAgICBpZiAoc2Vlbi5oYXMoa2V5KSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAnZHVwbGljYXRlX3RhcmdldCcsXG4gICAgICAgIHJlYXNvbnM6IFtgZHVwbGljYXRlIHRhcmdldCBhdCAke2tleX1gXSwgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICAgIHNlZW4uYWRkKGtleSk7XG4gICAgaWYgKHQueCA8IHJlY3QueDAgfHwgdC54ID4gcmVjdC54MSB8fCB0LnogPCByZWN0LnowIHx8IHQueiA+IHJlY3QuejEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ3RhcmdldF9vdXRzaWRlX2Zvb3RwcmludCcsXG4gICAgICAgIHJlYXNvbnM6IFtgdGFyZ2V0ICR7a2V5fSBpcyBvdXRzaWRlICR7cmVjdC54MH0sJHtyZWN0LnowfS4uJHtyZWN0LngxfSwke3JlY3QuejF9YF0sXG4gICAgICAgIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIodC55KSB8fCB0LnkgPCBZX01JTiB8fCB0LnkgPj0gWV9NQVgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ3RhcmdldF9oZWlnaHQnLFxuICAgICAgICByZWFzb25zOiBbYHRhcmdldCAke2tleX0gaGFzIGludmFsaWQgaGVpZ2h0ICR7dC55fWBdLCB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzO1xuICBjb25zdCBjbGVhciA9IG9wdGlvbnMuY2xlYXIgPz8gJ29ic3RydWN0aW9ucyc7XG4gIGlmIChjbGVhciA9PT0gJ25vbmUnICYmIG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAndW5jbGVhcmVkX29ic3RydWN0aW9ucycsXG4gICAgICByZWFzb25zOiBbYCR7b2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIHdvdWxkIHJlbWFpbmBdLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG4gIGNvbnN0IGNsZWFyRW50aXR5SWRzID0gY2xlYXIgPT09ICdub25lJyA/IFtdIDogWy4uLm5ldyBTZXQob2JzdHJ1Y3Rpb25zKV0uc29ydCgpO1xuICBjb25zdCBzdXJmYWNlTWF0ZXJpYWwgPSBvcHRpb25zLnN1cmZhY2VNYXRlcmlhbCA/PyBudWxsO1xuXG4gIGNvbnN0IGN1c3RvbVRhcmdldHMgPSBvcHRpb25zLnRhcmdldHMgIT09IHVuZGVmaW5lZDtcbiAgY29uc3Qgc3RhdHMgPSBjdXN0b21UYXJnZXRzXG4gICAgPyB0YXJnZXRTdGF0cyh3b3JsZCwgdGFyZ2V0cylcbiAgICA6IHtcbiAgICAgIGN1dFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5tYXhGaWxsLFxuICAgICAgcmVsaWVmOiB2YWxpZGF0aW9uLnF1ZXJ5LnN0YXRzLnJlbGllZixcbiAgICB9O1xuICBpZiAoY3VzdG9tVGFyZ2V0cykge1xuICAgIGNvbnN0IHJlYXNvbnMgPSB0YXJnZXRSdWxlUmVhc29ucyhzdGF0cywgcHJvcG9zYWwucnVsZXMpO1xuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgICAgY29kZTogJ3RhcmdldF9ydWxlcycsXG4gICAgICAgIHJlYXNvbnMsXG4gICAgICAgIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGxldCBsbyA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgbGV0IGhpID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBsbyA9IE1hdGgubWluKGxvLCBzdXJmYWNlLCB0LnkpO1xuICAgIGhpID0gTWF0aC5tYXgoaGksIHN1cmZhY2UgLSAxLCB0LnkgLSAxKTtcbiAgfVxuICBjb25zdCBidWZmZXJlZCA9IGV4cGFuZFJlY3QocmVjdCwgMSk7XG4gIGNvbnN0IGRlcml2ZWQ6IFZveGVsUmVnaW9uID0ge1xuICAgIHgwOiBNYXRoLm1heCgtSEFMRiwgYnVmZmVyZWQueDApLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgYnVmZmVyZWQuejApLFxuICAgIHgxOiBNYXRoLm1pbihIQUxGIC0gMSwgYnVmZmVyZWQueDEpLFxuICAgIHoxOiBNYXRoLm1pbihIQUxGIC0gMSwgYnVmZmVyZWQuejEpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgbG8gLSAxKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBoaSArIDEpLFxuICB9O1xuICAvLyBBbiBleHBsaWNpdCBlbnZlbG9wZSByZXBsYWNlcyB0aGUgZGVyaXZlZCBvbmUuIENhbGxlcnMgdGhhdCBwaW4gYW4gZXhhY3RcbiAgLy8gd29yayBlbnZlbG9wZSAocGF0aCBwcmVwYXJhdGlvbikgbXVzdCBub3Qgc2lsZW50bHkgd2lkZW4gaXQgd2l0aCB0aGVcbiAgLy8gZGVmYXVsdCAxIG0gYnVmZmVyLlxuICBjb25zdCBlbnZlbG9wZSA9IG5vcm1hbGl6ZUVudmVsb3BlKG9wdGlvbnMuZW52ZWxvcGUgPz8gW2Rlcml2ZWRdKTtcbiAgY29uc3Qgc3VyZmFjZUVkaXRzID0gc3VyZmFjZU1hdGVyaWFsID09PSBudWxsID8gMCA6IHRhcmdldHMubGVuZ3RoO1xuXG4gIGNvbnN0IHBsYW46IFByZXBhcmF0aW9uUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBydWxlczogcHJvcG9zYWwucnVsZXMsXG4gICAgdGFyZ2V0cyxcbiAgICBjbGVhckVudGl0eUlkcyxcbiAgICBzdXJmYWNlTWF0ZXJpYWwsXG4gICAgZW52ZWxvcGUsXG4gICAgZXhwZWN0ZWQ6IHtcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICAgIG9ic3RydWN0aW9uczogY2xlYXJFbnRpdHlJZHMubGVuZ3RoLFxuICAgICAgc3VyZmFjZUVkaXRzLFxuICAgICAgdG90YWxFZGl0czogc3RhdHMuY3V0Vm9sdW1lICsgc3RhdHMuZmlsbFZvbHVtZSArIHN1cmZhY2VFZGl0cyxcbiAgICB9LFxuICB9O1xuICBwbGFuLmlkID0gYHByZXA6JHtwbGFuRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCB2YWxpZGF0aW9uIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gYXV0aG9yaXphdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25MaW1pdHMge1xuICBtYXhDdXRWb2x1bWU6IG51bWJlcjtcbiAgbWF4RmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhWb3hlbEVkaXRzOiBudW1iZXI7XG4gIG1heEVudGl0eVJlbW92YWxzOiBudW1iZXI7XG4gIG1heFRhcmdldHM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfTElNSVRTOiBBdXRob3JpemF0aW9uTGltaXRzID0ge1xuICBtYXhDdXRWb2x1bWU6IDI1NixcbiAgbWF4RmlsbFZvbHVtZTogMjU2LFxuICBtYXhWb3hlbEVkaXRzOiAxMDI0LFxuICBtYXhFbnRpdHlSZW1vdmFsczogMTYsXG4gIG1heFRhcmdldHM6IDUxMixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ya0F1dGhvcml6YXRpb24ge1xuICBpZDogc3RyaW5nO1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGJhc2VSZXZpc2lvbjogbnVtYmVyO1xuICBsaW1pdHM6IEF1dGhvcml6YXRpb25MaW1pdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvbkRlY2lzaW9uIHtcbiAgb2s6IGJvb2xlYW47XG4gIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uIHwgbnVsbDtcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvblBvbGljeSB7XG4gIC8qKiBUaGUgb25seSByZWdpb25zIHRoaXMgZ292ZXJub3IgcGVybWl0cyBmb3IgdGhlIGZpcnN0IHNsaWNlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgbGltaXRzPzogUGFydGlhbDxBdXRob3JpemF0aW9uTGltaXRzPjtcbn1cblxuZnVuY3Rpb24gcmVnaW9uQ29udGFpbmVkKHJlZ2lvbjogVm94ZWxSZWdpb24sIHBvbGljeTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IGJvb2xlYW4ge1xuICByZXR1cm4gcG9saWN5LnNvbWUoKHApID0+IHJlZ2lvbi54MCA+PSBwLngwICYmIHJlZ2lvbi54MSA8PSBwLngxXG4gICAgJiYgcmVnaW9uLnowID49IHAuejAgJiYgcmVnaW9uLnoxIDw9IHAuejFcbiAgICAmJiByZWdpb24ueTAgPj0gcC55MCAmJiByZWdpb24ueTEgPD0gcC55MSk7XG59XG5cbi8qKlxuICogTG9jYWwgZ292ZXJub3Igc3R1Yi4gSXQgZW5mb3JjZXMgYSBmaXhlZCBlbnZlbG9wZSBhbmQgaGFyZCB2b2x1bWUgbGltaXRzLFxuICogYmluZHMgYSB0b2tlbiB0byB0aGUgZXhhY3QgcGxhbiBkaWdlc3QgYW5kIHdvcmxkIHJldmlzaW9uLCBhbmQgcmVmdXNlcyB0b1xuICogcHJldGVuZCBpdCBpcyBhbiBvbi1jaGFpbiBhdXRob3JpdHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBMb2NhbEF1dGhvcml6ZXIge1xuICByZWFkb25seSBhdXRob3JpdHkgPSBMT0NBTF9BVVRIT1JJVFk7XG4gIHJlYWRvbmx5IGVuZm9yY2VtZW50ID0gTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHJlYWRvbmx5IGxpbWl0czogQXV0aG9yaXphdGlvbkxpbWl0cztcblxuICBjb25zdHJ1Y3RvcihyZWFkb25seSBwb2xpY3k6IEF1dGhvcml6YXRpb25Qb2xpY3kpIHtcbiAgICB0aGlzLmxpbWl0cyA9IHsgLi4uREVGQVVMVF9MSU1JVFMsIC4uLihwb2xpY3kubGltaXRzID8/IHt9KSB9O1xuICB9XG5cbiAgYXV0aG9yaXplKHdvcmxkOiBXb3JsZCwgcGxhbjogUHJlcGFyYXRpb25QbGFuKTogQXV0aG9yaXphdGlvbkRlY2lzaW9uIHtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHBsYW4ucmVjdCk7XG5cbiAgICBpZiAocGxhbi50YXJnZXRzLmxlbmd0aCAhPT0gcmVjdENvbHVtbnMocmVjdCkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbiBoYXMgJHtwbGFuLnRhcmdldHMubGVuZ3RofSB0YXJnZXRzIGZvciAke3JlY3RDb2x1bW5zKHJlY3QpfSBjb2x1bW5zYCk7XG4gICAgfVxuICAgIGlmIChwbGFuLnRhcmdldHMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4VGFyZ2V0cykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4udGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4VGFyZ2V0c31gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQuY3V0Vm9sdW1lID4gdGhpcy5saW1pdHMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgICByZWFzb25zLnB1c2goYGN1dCAke3BsYW4uZXhwZWN0ZWQuY3V0Vm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4Q3V0Vm9sdW1lfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC5maWxsVm9sdW1lID4gdGhpcy5saW1pdHMubWF4RmlsbFZvbHVtZSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBmaWxsICR7cGxhbi5leHBlY3RlZC5maWxsVm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4RmlsbFZvbHVtZX1gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQudG90YWxFZGl0cyA+IHRoaXMubGltaXRzLm1heFZveGVsRWRpdHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbm5lZCBlZGl0cyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhWb3hlbEVkaXRzfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFscykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RofSByZW1vdmFscyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFsc31gKTtcbiAgICB9XG4gICAgaWYgKG5ldyBTZXQocGxhbi5jbGVhckVudGl0eUlkcykuc2l6ZSAhPT0gcGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGgpIHtcbiAgICAgIHJlYXNvbnMucHVzaCgnZHVwbGljYXRlIGVudGl0eSByZW1vdmFsIGlkcycpO1xuICAgIH1cblxuICAgIGlmIChwbGFuLmVudmVsb3BlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyB3b3JrIGVudmVsb3BlJyk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcmVnaW9uIG9mIHBsYW4uZW52ZWxvcGUpIHtcbiAgICAgIGlmICghcmVnaW9uQ29udGFpbmVkKHJlZ2lvbiwgdGhpcy5wb2xpY3kuZW52ZWxvcGUpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgZW52ZWxvcGUgJHtyZWdpb24ueDB9LCR7cmVnaW9uLnowfSwke3JlZ2lvbi55MH0uLiR7cmVnaW9uLngxfSwke3JlZ2lvbi56MX0sJHtyZWdpb24ueTF9IGlzIG91dHNpZGUgdGhlIGxvY2FsIHBvbGljeWApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSB7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgdC54LCB0LnksIHQueilcbiAgICAgICAgfHwgKHQueSA+IFlfTUlOICYmICFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHQueCwgdC55IC0gMSwgdC56KSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGB0YXJnZXQgJHt0Lnh9LCR7dC56fSwke3QueX0gaXMgbm90IGNvdmVyZWQgYnkgdGhlIHdvcmsgZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBFdmVyeSBvYnN0cnVjdGlvbiBjdXJyZW50bHkgb24gdGhlIGZvb3RwcmludCBtdXN0IGJlIGluIHRoZSBwbGFuLCBhbmRcbiAgICAvLyB0aGUgcGxhbiBtYXkgbm90IHJlbW92ZSBhbnl0aGluZyB0aGF0IGlzIG5vdCBhbiBvYnN0cnVjdGlvbiB0aGVyZS5cbiAgICBjb25zdCBjdXJyZW50ID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpLm1hcCgobykgPT4gby5lbnRpdHlJZCkuc29ydCgpO1xuICAgIGNvbnN0IHBsYW5uZWQgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICAgIGlmIChjdXJyZW50Lmxlbmd0aCAhPT0gcGxhbm5lZC5sZW5ndGggfHwgY3VycmVudC5zb21lKChpZCwgaSkgPT4gaWQgIT09IHBsYW5uZWRbaV0pKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW4gcmVtb3ZhbHMgWyR7cGxhbm5lZC5qb2luKCcsJyl9XSBkbyBub3QgbWF0Y2ggZm9vdHByaW50IG9ic3RydWN0aW9ucyBbJHtjdXJyZW50LmpvaW4oJywnKX1dYCk7XG4gICAgfVxuXG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBhdXRob3JpemF0aW9uOiBudWxsLCByZWFzb25zIH07XG5cbiAgICBjb25zdCB0b2tlbjogV29ya0F1dGhvcml6YXRpb24gPSB7XG4gICAgICBpZDogYGxvY2FsLXN0dWI6JHtwbGFuRGlnZXN0KHBsYW4pfWAsXG4gICAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICAgIHBsYW5EaWdlc3Q6IHBsYW5EaWdlc3QocGxhbiksXG4gICAgICBlbnZlbG9wZTogbm9ybWFsaXplRW52ZWxvcGUocGxhbi5lbnZlbG9wZSksXG4gICAgICBiYXNlUmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgICAgbGltaXRzOiB7IC4uLnRoaXMubGltaXRzIH0sXG4gICAgfTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgYXV0aG9yaXphdGlvbjogdG9rZW4sIHJlYXNvbnM6IFtdIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBleGVjdXRpb24gLS0tLS0tLS0tLVxuaW50ZXJmYWNlIFBlbmRpbmdFZGl0IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgYmVmb3JlOiBNYXRJZDtcbiAgYWZ0ZXI6IE1hdElkO1xuICAvKiogVHJ1ZSBmb3IgYSBtYXRlcmlhbC1vbmx5IHRvcC1zdXJmYWNlIGNoYW5nZS4gKi9cbiAgc3VyZmFjZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIGNodW5rOiBzdHJpbmc7XG4gIGNoYW5nZWQ6IG51bWJlcjtcbiAgYWRkZWQ6IG51bWJlcjtcbiAgcmVtb3ZlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENsZWFyZWRFbnRpdHkge1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgYW1vdW50OiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25MZWRnZXIge1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIGF1dGhvcml6YXRpb25JZDogc3RyaW5nO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbmV0U3BvaWw6IG51bWJlcjtcbiAgYm9ycm93ZWRGaWxsOiBudW1iZXI7XG4gIGN1dEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGZpbGxCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICB2b3hlbEVkaXRzOiBudW1iZXI7XG4gIHN1cmZhY2VFZGl0czogbnVtYmVyO1xuICBlbnRpdGllc0NsZWFyZWQ6IENsZWFyZWRFbnRpdHlbXTtcbiAgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBjaHVua0RlbHRhczogQ2h1bmtEZWx0YVtdO1xuICByZXZpc2lvbkJlZm9yZTogbnVtYmVyO1xuICByZXZpc2lvbkFmdGVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFByZXBhcmF0aW9uUGxhbjtcbiAgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb247XG4gIGxlZGdlcjogUHJlcGFyYXRpb25MZWRnZXI7XG59XG5cbmV4cG9ydCB0eXBlIFByZXBhcmF0aW9uT3V0Y29tZSA9IFByZXBhcmF0aW9uU3VjY2VzcyB8IFByZXBhcmF0aW9uRmFpbHVyZTtcblxuY29uc3QgTUFURVJJQUxfTkFNRVM6IFJlY29yZDxudW1iZXIsIHN0cmluZz4gPSB7XG4gIFtNQVQuR1JBU1NdOiAnZ3Jhc3MnLFxuICBbTUFULlNPSUxdOiAnc29pbCcsXG4gIFtNQVQuU0FORF06ICdzYW5kJyxcbiAgW01BVC5HUkFWRUxdOiAnZ3JhdmVsJyxcbiAgW01BVC5TVE9ORV06ICdzdG9uZScsXG4gIFtNQVQuT1JFXTogJ29yZScsXG4gIFtNQVQuV0FURVJdOiAnd2F0ZXInLFxuICBbTUFULkJFRFJPQ0tdOiAnYmVkcm9jaycsXG4gIFtNQVQuTU9TU106ICdtb3NzJyxcbn07XG5cbmZ1bmN0aW9uIG1hdGVyaWFsTmFtZShtOiBNYXRJZCk6IHN0cmluZyB7XG4gIHJldHVybiBNQVRFUklBTF9OQU1FU1ttXSA/PyBgbWF0XyR7bX1gO1xufVxuXG5mdW5jdGlvbiBmaWxsTWF0ZXJpYWwoeTogbnVtYmVyLCB0YXJnZXQ6IG51bWJlcik6IE1hdElkIHtcbiAgcmV0dXJuIHkgPT09IHRhcmdldCAtIDEgPyBNQVQuR1JBU1MgOiBNQVQuU09JTDtcbn1cblxuZnVuY3Rpb24gZmFpbChzdGFnZTogUHJlcGFyYXRpb25GYWlsdXJlWydzdGFnZSddLCBjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogUHJlcGFyYXRpb25GYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGFnZSwgY29kZSwgcmVhc29ucyB9O1xufVxuXG4vKipcbiAqIEFwcGx5IGFuIGF1dGhvcml6ZWQgcGxhbi4gTm8gdm94ZWwgaXMgd3JpdHRlbiB1bnRpbCBldmVyeSBlZGl0IGFuZCByZW1vdmFsXG4gKiBoYXMgYmVlbiBjaGVja2VkIGFnYWluc3QgdGhlIHRva2VuLCB0aGUgcGxhbiBlbnZlbG9wZSBhbmQgdGhlIGhhcmQgbGltaXRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXhlY3V0ZVByZXBhcmF0aW9uKFxuICB3b3JsZDogV29ybGQsIHBsYW46IFByZXBhcmF0aW9uUGxhbiwgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb24sXG4pOiBQcmVwYXJhdGlvbk91dGNvbWUge1xuICBpZiAoYXV0aG9yaXphdGlvbi5hdXRob3JpdHkgIT09IExPQ0FMX0FVVEhPUklUWVxuICAgIHx8IGF1dGhvcml6YXRpb24uZW5mb3JjZW1lbnQgIT09IExPQ0FMX0VORk9SQ0VNRU5UKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5zdXBwb3J0ZWRfYXV0aG9yaXR5JywgW1xuICAgICAgYGF1dGhvcml0eSAke2F1dGhvcml6YXRpb24uYXV0aG9yaXR5fS8ke2F1dGhvcml6YXRpb24uZW5mb3JjZW1lbnR9IGlzIG5vdCB0aGUgbG9jYWwgc3R1YmAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCAhPT0gcGxhbkRpZ2VzdChwbGFuKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2RpZ2VzdF9taXNtYXRjaCcsIFsnYXV0aG9yaXphdGlvbiBkb2VzIG5vdCBtYXRjaCB0aGlzIHBsYW4nXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24uYmFzZVJldmlzaW9uICE9PSB3b3JsZC5yZXZpc2lvbikge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3N0YWxlX2F1dGhvcml6YXRpb24nLCBbXG4gICAgICBgYXV0aG9yaXphdGlvbiB3YXMgaXNzdWVkIGF0IHJldmlzaW9uICR7YXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb259LCB3b3JsZCBpcyBhdCAke3dvcmxkLnJldmlzaW9ufWAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKHBsYW4uZW52ZWxvcGUuc29tZSgocikgPT4gIXJlZ2lvbkNvbnRhaW5lZChyLCBhdXRob3JpemF0aW9uLmVudmVsb3BlKSkpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdlbnZlbG9wZV9taXNtYXRjaCcsIFsncGxhbiBlbnZlbG9wZSBpcyB3aWRlciB0aGFuIHRoZSBhdXRob3JpemF0aW9uJ10pO1xuICB9XG5cbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocGxhbi5yZWN0KTtcbiAgY29uc3QgZWRpdHM6IFBlbmRpbmdFZGl0W10gPSBbXTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBpZiAodC55IDwgc3VyZmFjZSkge1xuICAgICAgZm9yIChsZXQgeSA9IHQueTsgeSA8IHN1cmZhY2U7IHkrKykge1xuICAgICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB5LCB0LnopO1xuICAgICAgICBpZiAoaXNTb2xpZChiZWZvcmUpKSBlZGl0cy5wdXNoKHsgeDogdC54LCB5LCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXI6IE1BVC5BSVIgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0LnkgPiBzdXJmYWNlKSB7XG4gICAgICBmb3IgKGxldCB5ID0gc3VyZmFjZTsgeSA8IHQueTsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHksIHQueik7XG4gICAgICAgIGlmICghaXNTb2xpZChiZWZvcmUpKSB7XG4gICAgICAgICAgY29uc3QgYWZ0ZXIgPSBwbGFuLnN1cmZhY2VNYXRlcmlhbCAhPT0gbnVsbCAmJiB5ID09PSB0LnkgLSAxXG4gICAgICAgICAgICA/IHBsYW4uc3VyZmFjZU1hdGVyaWFsXG4gICAgICAgICAgICA6IGZpbGxNYXRlcmlhbCh5LCB0LnkpO1xuICAgICAgICAgIGVkaXRzLnB1c2goeyB4OiB0LngsIHksIHo6IHQueiwgYmVmb3JlLCBhZnRlciB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyBNYXRlcmlhbC1vbmx5IHN1cmZhY2UgY2hhbmdlIGZvciBjdXQgb3IgYWxyZWFkeS1sZXZlbCBjb2x1bW5zLiBGaWxsXG4gICAgLy8gY29sdW1ucyBhbHJlYWR5IHJlY2VpdmUgdGhlIHN1cmZhY2UgbWF0ZXJpYWwgaW4gdGhlIGZpbGwgbG9vcCBhYm92ZS5cbiAgICBpZiAocGxhbi5zdXJmYWNlTWF0ZXJpYWwgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHRvcFkgPSB0LnkgLSAxO1xuICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgdG9wWSwgdC56KTtcbiAgICAgIGlmIChpc1NvbGlkKGJlZm9yZSkgJiYgYmVmb3JlICE9PSBwbGFuLnN1cmZhY2VNYXRlcmlhbCkge1xuICAgICAgICBlZGl0cy5wdXNoKHtcbiAgICAgICAgICB4OiB0LngsIHk6IHRvcFksIHo6IHQueiwgYmVmb3JlLCBhZnRlcjogcGxhbi5zdXJmYWNlTWF0ZXJpYWwsIHN1cmZhY2U6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGV2ZXJ5IGVkaXQgYmVmb3JlIG11dGF0aW5nIGFueXRoaW5nLlxuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGUgb2YgZWRpdHMpIHtcbiAgICBpZiAoZS54IDwgcmVjdC54MCB8fCBlLnggPiByZWN0LngxIHx8IGUueiA8IHJlY3QuejAgfHwgZS56ID4gcmVjdC56MSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBlZGl0ICR7ZS54fSwke2UueX0sJHtlLnp9IGlzIG91dHNpZGUgdGhlIGZvb3RwcmludGApO1xuICAgIH1cbiAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMoYXV0aG9yaXphdGlvbi5lbnZlbG9wZSwgZS54LCBlLnksIGUueikpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZWRpdCAke2UueH0sJHtlLnl9LCR7ZS56fSBpcyBvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlYCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGN1dFZvbHVtZSA9IGVkaXRzLmZpbHRlcigoZSkgPT4gZS5hZnRlciA9PT0gTUFULkFJUiAmJiBpc1NvbGlkKGUuYmVmb3JlKSkubGVuZ3RoO1xuICBjb25zdCBmaWxsVm9sdW1lID0gZWRpdHMuZmlsdGVyKChlKSA9PiBlLmFmdGVyICE9PSBNQVQuQUlSICYmICFpc1NvbGlkKGUuYmVmb3JlKSkubGVuZ3RoO1xuICBpZiAoY3V0Vm9sdW1lID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgJHtjdXRWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhDdXRWb2x1bWV9YCk7XG4gIH1cbiAgaWYgKGZpbGxWb2x1bWUgPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsICR7ZmlsbFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEZpbGxWb2x1bWV9YCk7XG4gIH1cbiAgaWYgKGVkaXRzLmxlbmd0aCA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heFZveGVsRWRpdHMpIHtcbiAgICByZWFzb25zLnB1c2goYCR7ZWRpdHMubGVuZ3RofSBlZGl0cyBleGNlZWQgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhWb3hlbEVkaXRzfWApO1xuICB9XG5cbiAgY29uc3QgY3VycmVudCA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KS5tYXAoKG8pID0+IG8uZW50aXR5SWQpLnNvcnQoKTtcbiAgY29uc3QgcGxhbm5lZCA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gIGlmIChjdXJyZW50Lmxlbmd0aCAhPT0gcGxhbm5lZC5sZW5ndGggfHwgY3VycmVudC5zb21lKChpZCwgaSkgPT4gaWQgIT09IHBsYW5uZWRbaV0pKSB7XG4gICAgcmVhc29ucy5wdXNoKCdmb290cHJpbnQgb2JzdHJ1Y3Rpb25zIGNoYW5nZWQgYWZ0ZXIgYXV0aG9yaXphdGlvbicpO1xuICB9XG4gIGlmIChwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEVudGl0eVJlbW92YWxzKSB7XG4gICAgcmVhc29ucy5wdXNoKGAke3BsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RofSByZW1vdmFscyBleGNlZWQgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFsc31gKTtcbiAgfVxuICBmb3IgKGNvbnN0IGlkIG9mIHBsYW4uY2xlYXJFbnRpdHlJZHMpIHtcbiAgICBpZiAoIXdvcmxkLmVudGl0aWVzLmhhcyhpZCkpIHJlYXNvbnMucHVzaChgZW50aXR5ICR7aWR9IG5vIGxvbmdlciBleGlzdHNgKTtcbiAgfVxuICBpZiAod29ybGQubGlmZSkge1xuICAgIGxldCByZWNvdmVyZWQgPSAwO1xuICAgIGZvciAoY29uc3QgaWQgb2YgcGxhbi5jbGVhckVudGl0eUlkcykge1xuICAgICAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmIChlbnRpdHk/LnJlc291cmNlICYmIGVudGl0eS5yZW1haW5pbmcgPiAwKSByZWNvdmVyZWQgKz0gZW50aXR5LnJlbWFpbmluZztcbiAgICB9XG4gICAgLy8gQ2hlY2sgYmVmb3JlIGFueSB2b3hlbCBvciBlbnRpdHkgY2hhbmdlcywgcHJlc2VydmluZyBsZWdhY3kgdW5ib3VuZGVkXG4gICAgLy8gY29uc3RydWN0aW9uIGJlaGF2aW9yIGFuZCBzY2hlbWEtMyBjYXJyaWVkLWNhcGFjaXR5IGNvbnNlcnZhdGlvbi5cbiAgICBpZiAoT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBhbW91bnQpID0+IHN1bSArIGFtb3VudCwgMCkgKyByZWNvdmVyZWQgPiAxMjApIHtcbiAgICAgIHJlYXNvbnMucHVzaCgncmVzb3VyY2VzIHJlY292ZXJlZCBkdXJpbmcgc2l0ZSBjbGVhcmluZyB3b3VsZCBleGNlZWQgY2FycmllZCBjYXBhY2l0eSAxMjAnKTtcbiAgICB9XG4gIH1cbiAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5hdXRob3JpemVkX2VkaXRzJywgcmVhc29ucyk7XG5cbiAgY29uc3QgaW52ZW50b3J5QmVmb3JlID0gaW52ZW50b3J5U25hcHNob3Qod29ybGQpO1xuICBjb25zdCByZXZpc2lvbkJlZm9yZSA9IHdvcmxkLnJldmlzaW9uO1xuICBjb25zdCBjaHVua0RlbHRhcyA9IG5ldyBNYXA8c3RyaW5nLCBDaHVua0RlbHRhPigpO1xuICBjb25zdCBjdXRCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGNvbnN0IGZpbGxCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGxldCBhcHBsaWVkID0gMDtcbiAgbGV0IHN1cmZhY2VFZGl0cyA9IDA7XG5cbiAgZm9yIChjb25zdCBlIG9mIGVkaXRzKSB7XG4gICAgaWYgKCFzZXRWb3hlbCh3b3JsZCwgZS54LCBlLnksIGUueiwgZS5hZnRlcikpIGNvbnRpbnVlO1xuICAgIGFwcGxpZWQrKztcbiAgICBpZiAoZS5zdXJmYWNlKSBzdXJmYWNlRWRpdHMrKztcbiAgICBjb25zdCBrZXkgPSBjaHVua0tleSh3b3JsZFRvQ2h1bmtYKGUueCksIHdvcmxkVG9DaHVua1ooZS56KSk7XG4gICAgbGV0IGRlbHRhID0gY2h1bmtEZWx0YXMuZ2V0KGtleSk7XG4gICAgaWYgKCFkZWx0YSkge1xuICAgICAgZGVsdGEgPSB7IGNodW5rOiBrZXksIGNoYW5nZWQ6IDAsIGFkZGVkOiAwLCByZW1vdmVkOiAwIH07XG4gICAgICBjaHVua0RlbHRhcy5zZXQoa2V5LCBkZWx0YSk7XG4gICAgfVxuICAgIGRlbHRhLmNoYW5nZWQrKztcbiAgICBjb25zdCB3YXNTb2xpZCA9IGlzU29saWQoZS5iZWZvcmUpO1xuICAgIGNvbnN0IGlzTm93U29saWQgPSBpc1NvbGlkKGUuYWZ0ZXIpO1xuICAgIGlmICghd2FzU29saWQgJiYgaXNOb3dTb2xpZCkgZGVsdGEuYWRkZWQrKztcbiAgICBpZiAod2FzU29saWQgJiYgIWlzTm93U29saWQpIGRlbHRhLnJlbW92ZWQrKztcbiAgICBjb25zdCBuYW1lID0gbWF0ZXJpYWxOYW1lKGUuYmVmb3JlKTtcbiAgICBpZiAod2FzU29saWQgJiYgIWlzTm93U29saWQpIGN1dEJ5TWF0ZXJpYWxbbmFtZV0gPSAoY3V0QnlNYXRlcmlhbFtuYW1lXSA/PyAwKSArIDE7XG4gICAgaWYgKCF3YXNTb2xpZCAmJiBpc05vd1NvbGlkKSBmaWxsQnlNYXRlcmlhbFttYXRlcmlhbE5hbWUoZS5hZnRlcildID0gKGZpbGxCeU1hdGVyaWFsW21hdGVyaWFsTmFtZShlLmFmdGVyKV0gPz8gMCkgKyAxO1xuICB9XG5cbiAgY29uc3QgZW50aXRpZXNDbGVhcmVkOiBDbGVhcmVkRW50aXR5W10gPSBbXTtcbiAgY29uc3QgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0ge307XG4gIGZvciAoY29uc3QgaWQgb2YgWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKSkge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmICghZSkgY29udGludWU7XG4gICAgY29uc3QgYW1vdW50ID0gZS5yZXNvdXJjZSAmJiBlLnJlbWFpbmluZyA+IDAgPyBlLnJlbWFpbmluZyA6IDA7XG4gICAgaWYgKGUucmVzb3VyY2UgJiYgYW1vdW50ID4gMCkge1xuICAgICAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgICAgIHJlc291cmNlc0dhaW5lZFtlLnJlc291cmNlXSA9IChyZXNvdXJjZXNHYWluZWRbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gICAgfVxuICAgIHJlbW92ZUVudGl0eSh3b3JsZCwgaWQpO1xuICAgIGVudGl0aWVzQ2xlYXJlZC5wdXNoKHtcbiAgICAgIGVudGl0eUlkOiBpZCwga2luZDogZS5raW5kLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50LCB4OiBlLngsIHk6IGUueSwgejogZS56LFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgY3V0ID0gYXBwbGllZCA+IDAgPyBPYmplY3QudmFsdWVzKGN1dEJ5TWF0ZXJpYWwpLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIDogMDtcbiAgY29uc3QgZmlsbCA9IGFwcGxpZWQgPiAwID8gT2JqZWN0LnZhbHVlcyhmaWxsQnlNYXRlcmlhbCkucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgOiAwO1xuICBjb25zdCBsZWRnZXI6IFByZXBhcmF0aW9uTGVkZ2VyID0ge1xuICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICBhdXRob3JpemF0aW9uSWQ6IGF1dGhvcml6YXRpb24uaWQsXG4gICAgcGxhbkRpZ2VzdDogYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0LFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHBsYW4uZmxvb3JZLFxuICAgIGN1dFZvbHVtZTogY3V0LFxuICAgIGZpbGxWb2x1bWU6IGZpbGwsXG4gICAgbmV0U3BvaWw6IGN1dCAtIGZpbGwsXG4gICAgYm9ycm93ZWRGaWxsOiBNYXRoLm1heCgwLCBmaWxsIC0gY3V0KSxcbiAgICBjdXRCeU1hdGVyaWFsLFxuICAgIGZpbGxCeU1hdGVyaWFsLFxuICAgIHZveGVsRWRpdHM6IGFwcGxpZWQsXG4gICAgc3VyZmFjZUVkaXRzLFxuICAgIGVudGl0aWVzQ2xlYXJlZCxcbiAgICByZXNvdXJjZXNHYWluZWQsXG4gICAgaW52ZW50b3J5QmVmb3JlLFxuICAgIGludmVudG9yeUFmdGVyOiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCksXG4gICAgY2h1bmtEZWx0YXM6IFsuLi5jaHVua0RlbHRhcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5jaHVuay5sb2NhbGVDb21wYXJlKGIuY2h1bmspKSxcbiAgICByZXZpc2lvbkJlZm9yZSxcbiAgICByZXZpc2lvbkFmdGVyOiB3b3JsZC5yZXZpc2lvbixcbiAgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIGF1dGhvcml6YXRpb24sIGxlZGdlciB9O1xufVxuXG4vKipcbiAqIFRoZSBzaGFyZWQgcGxheWVyL0FJIGVudHJ5IHBvaW50LiBUaGVyZSBpcyBubyBvdGhlciBjb25zdHJ1Y3Rpb24gcGF0aC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVTaXRlKFxuICB3b3JsZDogV29ybGQsXG4gIGF1dGhvcml6ZXI6IExvY2FsQXV0aG9yaXplcixcbiAgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCxcbiAgb3B0aW9uczogUHJlcGFyYXRpb25PcHRpb25zID0ge30sXG4pOiBQcmVwYXJhdGlvbk91dGNvbWUge1xuICBjb25zdCBwbGFubmVkID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBwcm9wb3NhbCwgb3B0aW9ucyk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGNvbnN0IGRlY2lzaW9uID0gYXV0aG9yaXplci5hdXRob3JpemUod29ybGQsIHBsYW5uZWQucGxhbik7XG4gIGlmICghZGVjaXNpb24ub2sgfHwgIWRlY2lzaW9uLmF1dGhvcml6YXRpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnYXV0aG9yaXplJywgJ25vdF9hdXRob3JpemVkJywgZGVjaXNpb24ucmVhc29ucyk7XG4gIH1cbiAgcmV0dXJuIGV4ZWN1dGVQcmVwYXJhdGlvbih3b3JsZCwgcGxhbm5lZC5wbGFuLCBkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcbn1cbiIsICIvLyBNMDAyIHN0YWdlIDQ6IGF1dGhvcml0YXRpdmUgaG91c2UsIHBhdGggYW5kIHRlcnJhY2Ugc3RydWN0dXJlcy5cbi8vXG4vLyBTdHJ1Y3R1cmVzIGFyZSBzaW11bGF0aW9uIHJlY29yZHMsIG5vdCByZW5kZXJlci1vbmx5IG1lc2hlcy4gQSBzdHJ1Y3R1cmUgaXNcbi8vIHBsYW5uZWQgZnJvbSB0aGUgcHJlcGFyZWQgdGVycmFpbiwgYXV0aG9yaXplZCBhZ2FpbnN0IHRoZSBzYW1lIGxvY2FsIHBvbGljeVxuLy8gZW52ZWxvcGUgYXMgdGVycmFpbiBwcmVwYXJhdGlvbiwgcGFpZCBmb3IgZnJvbSBpbnZlbnRvcnksIGFuZCB0aGVuIHN0b3JlZCBpblxuLy8gV29ybGQuc3RydWN0dXJlcy4gVGhlIHJlbmRlcmVyIHJlYWRzIHRob3NlIHJlY29yZHM7IGl0IG5ldmVyIGludmVudHMgYVxuLy8gYnVpbGRpbmcgdGhhdCB0aGUgc2ltdWxhdGlvbiBkb2VzIG5vdCBvd24uXG5pbXBvcnQge1xuICBXb3JsZCwgUmVzb3VyY2VUeXBlLCBNQVQsIHN1cmZhY2VBdCwgZ2V0Vm94ZWwsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIG5vcm1hbGl6ZVJlY3QsIGV4cGFuZFJlY3QsXG4gIGVudmVsb3BlQ29udGFpbnMsIG9ic3RydWN0aW9uc0luLFxufSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgQXV0aG9yaXphdGlvblBvbGljeSwgTE9DQUxfQVVUSE9SSVRZLCBMT0NBTF9FTkZPUkNFTUVOVCxcbn0gZnJvbSAnLi9wcmVwYXJhdGlvbic7XG5pbXBvcnQgeyBGQVJNX1JVTEVTIH0gZnJvbSAnLi9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHsgaW52ZW50b3J5U25hcHNob3QgfSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZUtpbmQgPSAnaG91c2UnIHwgJ3BhdGgnIHwgJ3RlcnJhY2UnO1xuLyoqIE0wMDIgZGVzaWduIDEgaXMgaW1tdXRhYmxlIHJlcGxheSBjb250ZW50OyBkZXNpZ24gMiBpcyB0aGUgZm91bmRlciBjYW5kaWRhdGUuICovXG5leHBvcnQgY29uc3QgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiA9IDIgYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uID0gdHlwZW9mIEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG5cbmV4cG9ydCB0eXBlIE1vZHVsZUtpbmQgPVxuICB8ICdmbG9vcidcbiAgfCAnd2FsbCdcbiAgfCAncG9zdCdcbiAgfCAnbGludGVsJ1xuICB8ICdyb29mJ1xuICB8ICdwYXJhcGV0J1xuICB8ICd3aW5kb3cnXG4gIHwgJ2Rvb3InXG4gIHwgJ3RocmVzaG9sZCdcbiAgfCAncGF0aCdcbiAgfCAnY3VyYidcbiAgfCAnc29pbF9iZWQnXG4gIHwgJ3JldGFpbmluZ193YWxsJ1xuICB8ICdjcm9wX3Jvdyc7XG5cbmV4cG9ydCB0eXBlIE1vZHVsZVRvbmUgPVxuICB8ICdzdG9uZSdcbiAgfCAnc3RvbmVfYidcbiAgfCAnb2NocmUnXG4gIHwgJ3RpbWJlcidcbiAgfCAnYWNjZW50J1xuICB8ICdzb2lsJ1xuICB8ICdjcm9wJ1xuICB8ICdncmF2ZWwnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZU1vZHVsZSB7XG4gIGtpbmQ6IE1vZHVsZUtpbmQ7XG4gIC8qKiBDZW50cmUgaW4gd29ybGQgeC96LCBib3R0b20gaW4gd29ybGQgeS4gKi9cbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgdzogbnVtYmVyO1xuICBoOiBudW1iZXI7XG4gIGQ6IG51bWJlcjtcbiAgcm90PzogbnVtYmVyO1xuICB0b25lPzogTW9kdWxlVG9uZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgLyoqIE9yaWdpbjogY2VudHJlIG9mIHRoZSBwcmVwYXJlZCBmb290cHJpbnQgYXQgZmxvb3IgaGVpZ2h0LiAqL1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW107XG4gIGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGJ1aWx0UmV2aXNpb246IG51bWJlcjtcbiAgLyoqIEFic2VudCBtZWFucyBsZWdhY3kgTTAwMiBkZXNpZ24gMTsgbmV2ZXIgaW5mZXIgaXQgZnJvbSB0aGUgcmVuZGVyZXIuICovXG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWNlQmFuZCB7XG4gIHowOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVQcm9wb3NhbCB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgLyoqIFJlcXVpcmVkIGZvciBob3VzZXM6IHZveGVsIGNvbHVtbiBvZiB0aGUgZG9vciBvbiB0aGUgZWFzdCB3YWxsLiAqL1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICAvKiogT3B0aW9uYWwgcGF0aCBtZXRhZGF0YTsgdGhlIHBhdGggaXMgbGFpZCBhbG9uZyB0aGUgcmVjdCBjZW50cmVsaW5lLiAqL1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgdGVycmFjZXM/OiBudW1iZXI7XG4gIC8qKiBEZWxpYmVyYXRlIGNvbnRlbnQgc2VsZWN0aW9uIGNhcnJpZWQgYnkgc2NoZW1hLTIgY29tbWFuZHMuICovXG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uO1xufVxuXG4vKipcbiAqIFNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIHN0cnVjdHVyZSBjb3N0cy4gVGhlIHBsYW5uZXJzIGFuZCB0aGUgYnVpbGQgVUlcbiAqIGJvdGggcmVhZCB0aGVzZTsgYSBidWlsZGluZyBjYW5ub3QgYWR2ZXJ0aXNlIG9uZSBwcmljZSBhbmQgY2hhcmdlIGFub3RoZXIuXG4gKi9cbmV4cG9ydCBjb25zdCBIT1VTRV9DT1NUOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0geyB3b29kOiAxMCwgc3RvbmU6IDE4IH07XG5leHBvcnQgY29uc3QgVEVSUkFDRV9DT1NUOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0geyB3b29kOiA2LCBzdG9uZTogMTIgfTtcblxuLyoqIEEgcGF0aCBwYXlzIG9uZSBzdG9uZSBwZXIgbWV0cmUgb2YgY29ycmlkb3Igd2lkdGguICovXG5leHBvcnQgZnVuY3Rpb24gcGF0aENvc3Qod2lkdGg6IG51bWJlcik6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4ge1xuICByZXR1cm4geyBzdG9uZTogd2lkdGggfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVQbGFuIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBvcmlnaW46IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICByb3Q6IG51bWJlcjtcbiAgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW107XG4gIGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICAvKiogRXhwZWN0ZWQgcHJlcGFyZWQgc3VyZmFjZSwgY2hlY2tlZCBhZ2FpbiBhdCBleGVjdXRpb24gdGltZS4gKi9cbiAgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdO1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbiAgdGVycmFjZXM/OiBUZXJyYWNlQmFuZFtdO1xufVxuXG4vLyAtLS0tLS0tLS0tIHN0YWJsZSBkaWdlc3QgLS0tLS0tLS0tLVxuZnVuY3Rpb24gZGlnZXN0KGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzU7XG4gIGxldCBiID0gMHg5ZTM3NzliOTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbnB1dC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGMgPSBpbnB1dC5jaGFyQ29kZUF0KGkpO1xuICAgIGEgPSBNYXRoLmltdWwoYSBeIGMsIDB4MDEwMDAxOTMpO1xuICAgIGIgPSBNYXRoLmltdWwoYiBeIChjICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIGIgXj0gYiA+Pj4gMTM7XG4gIH1cbiAgcmV0dXJuIChhID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICsgKGIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RydWN0dXJlRGlnZXN0KHBsYW46IFN0cnVjdHVyZVBsYW4pOiBzdHJpbmcge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXG4gICAgJ20wMDI6c3RydWN0dXJlLXBsYW46djEnLFxuICAgIHBsYW4ua2luZCxcbiAgICBwbGFuLnNpdGVJZCxcbiAgICBgJHtwbGFuLnJlY3QueDB9LCR7cGxhbi5yZWN0LnowfSwke3BsYW4ucmVjdC54MX0sJHtwbGFuLnJlY3QuejF9YCxcbiAgICBTdHJpbmcocGxhbi5mbG9vclkpLFxuICAgIGAke3BsYW4ub3JpZ2luLnh9LCR7cGxhbi5vcmlnaW4ueX0sJHtwbGFuLm9yaWdpbi56fWAsXG4gICAgU3RyaW5nKHBsYW4ucm90KSxcbiAgICAuLi4ocGxhbi5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OID8gWydkZXNpZ246MiddIDogW10pLFxuICAgIGBtOiR7cGxhbi5tb2R1bGVzLmxlbmd0aH1gLFxuICBdO1xuICBmb3IgKGNvbnN0IG0gb2YgcGxhbi5tb2R1bGVzKSB7XG4gICAgbGluZXMucHVzaChgbToke20ua2luZH0sJHttLnh9LCR7bS55fSwke20uen0sJHttLnd9LCR7bS5ofSwke20uZH0sJHttLnJvdCA/PyAwfSwke20udG9uZSA/PyAnJ31gKTtcbiAgfVxuICBjb25zdCBjb3N0S2V5cyA9IE9iamVjdC5rZXlzKHBsYW4uY29zdCkuc29ydCgpO1xuICBsaW5lcy5wdXNoKGBjb3N0OiR7Y29zdEtleXMubGVuZ3RofWApO1xuICBmb3IgKGNvbnN0IGtleSBvZiBjb3N0S2V5cykgbGluZXMucHVzaChgY29zdDoke2tleX0sJHtwbGFuLmNvc3Rba2V5IGFzIFJlc291cmNlVHlwZV0gPz8gMH1gKTtcbiAgZm9yIChjb25zdCBzIG9mIHBsYW4uc3VyZmFjZSkgbGluZXMucHVzaChgczoke3MueH0sJHtzLnp9LCR7cy55fWApO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50ZXJyYWNlcyA/PyBbXSkgbGluZXMucHVzaChgdDoke3QuejB9LCR7dC56MX0sJHt0Lnl9YCk7XG4gIHJldHVybiBkaWdlc3QobGluZXMuam9pbignXFxuJykpO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBsYW5uaW5nIGhlbHBlcnMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVGYWlsdXJlIHtcbiAgb2s6IGZhbHNlO1xuICBzdGFnZTogJ3BsYW4nIHwgJ2F1dGhvcml6ZScgfCAnZXhlY3V0ZSc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUGxhblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogU3RydWN0dXJlUGxhbjtcbn1cblxuZXhwb3J0IHR5cGUgU3RydWN0dXJlUGxhblJlc3VsdCA9IFN0cnVjdHVyZVBsYW5TdWNjZXNzIHwgU3RydWN0dXJlRmFpbHVyZTtcblxuZnVuY3Rpb24gZmFpbChzdGFnZTogU3RydWN0dXJlRmFpbHVyZVsnc3RhZ2UnXSwgY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IFN0cnVjdHVyZUZhaWx1cmUge1xuICByZXR1cm4geyBvazogZmFsc2UsIHN0YWdlLCBjb2RlLCByZWFzb25zIH07XG59XG5cbmZ1bmN0aW9uIHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkOiBXb3JsZCwgc2FtcGxlczogcmVhZG9ubHkgU3VyZmFjZVNhbXBsZVtdKSB7XG4gIGNvbnN0IG91dDogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlcjsgZXhwZWN0ZWQ6IG51bWJlcjsgYWN0dWFsOiBudW1iZXIgfT4gPSBbXTtcbiAgZm9yIChjb25zdCBzIG9mIHNhbXBsZXMpIHtcbiAgICBjb25zdCBhY3R1YWwgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoYWN0dWFsICE9PSBzLnkpIG91dC5wdXNoKHsgeDogcy54LCB6OiBzLnosIGV4cGVjdGVkOiBzLnksIGFjdHVhbCB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBmb290cHJpbnRTdXJmYWNlKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCwgeTogbnVtYmVyKTogU3VyZmFjZVNhbXBsZVtdIHtcbiAgY29uc3Qgb3V0OiBTdXJmYWNlU2FtcGxlW10gPSBbXTtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSBvdXQucHVzaCh7IHgsIHosIHkgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gZm9vdHByaW50RW52ZWxvcGUocmVjdDogUmVjdCwgeTA6IG51bWJlciwgeTE6IG51bWJlciwgbWFyZ2luID0gMSk6IFZveGVsUmVnaW9uW10ge1xuICBjb25zdCByID0gZXhwYW5kUmVjdChyZWN0LCBtYXJnaW4pO1xuICByZXR1cm4gW3sgLi4uciwgeTAsIHkxIH1dO1xufVxuXG5mdW5jdGlvbiBtb2R1bGVCb3VuZHMobTogU3RydWN0dXJlTW9kdWxlKTogeyB4MDogbnVtYmVyOyB4MTogbnVtYmVyOyB5MDogbnVtYmVyOyB5MTogbnVtYmVyOyB6MDogbnVtYmVyOyB6MTogbnVtYmVyIH0ge1xuICBjb25zdCByID0gTWF0aC5oeXBvdChtLncsIG0uZCkgLyAyO1xuICBjb25zdCBoYWxmVyA9IChtLnJvdCA/PyAwKSA9PT0gMCA/IG0udyAvIDIgOiByO1xuICBjb25zdCBoYWxmRCA9IChtLnJvdCA/PyAwKSA9PT0gMCA/IG0uZCAvIDIgOiByO1xuICByZXR1cm4ge1xuICAgIHgwOiBtLnggLSBoYWxmVywgeDE6IG0ueCArIGhhbGZXLFxuICAgIHkwOiBtLnksIHkxOiBtLnkgKyBtLmgsXG4gICAgejA6IG0ueiAtIGhhbGZELCB6MTogbS56ICsgaGFsZkQsXG4gIH07XG59XG5cbmZ1bmN0aW9uIG1vZHVsZUluc2lkZUVudmVsb3BlKG06IFN0cnVjdHVyZU1vZHVsZSwgZW52ZWxvcGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBib29sZWFuIHtcbiAgY29uc3QgYiA9IG1vZHVsZUJvdW5kcyhtKTtcbiAgcmV0dXJuIGVudmVsb3BlLnNvbWUoKGUpID0+IGIueDAgPj0gZS54MCAtIDFlLTYgJiYgYi54MSA8PSBlLngxICsgMSArIDFlLTZcbiAgICAmJiBiLnkwID49IGUueTAgLSAxZS02ICYmIGIueTEgPD0gZS55MSArIDEgKyAxZS02XG4gICAgJiYgYi56MCA+PSBlLnowIC0gMWUtNiAmJiBiLnoxIDw9IGUuejEgKyAxICsgMWUtNik7XG59XG5cbmZ1bmN0aW9uIGNvc3RUb3RhbChjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+KTogbnVtYmVyIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXMoY29zdCkucmVkdWNlKChhLCBiKSA9PiBhICsgKGIgPz8gMCksIDApO1xufVxuXG5mdW5jdGlvbiBtZWRpYW4odmFsdWVzOiBudW1iZXJbXSk6IG51bWJlciB7XG4gIGNvbnN0IHNvcnRlZCA9IFsuLi52YWx1ZXNdLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbiAgcmV0dXJuIHNvcnRlZFtNYXRoLmZsb29yKHNvcnRlZC5sZW5ndGggLyAyKV07XG59XG5cbi8vIC0tLS0tLS0tLS0gaG91c2UgLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhbkhvdXNlKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGlmICh3aWR0aCAhPT0gOCB8fCBkZXB0aCAhPT0gNikge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgaG91c2UgbmVlZHMgOCB4IDYgbSwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuICBpZiAoIXByb3Bvc2FsLmRvb3IpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdtaXNzaW5nX2Rvb3InLCBbJ2hvdXNlIHBsYW4gbmVlZHMgYSBkb29yIGNvbHVtbiddKTtcbiAgfVxuICBpZiAocHJvcG9zYWwuZG9vci56IDwgcmVjdC56MCB8fCBwcm9wb3NhbC5kb29yLnogPiByZWN0LnoxKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnZG9vcl9vdXRzaWRlJywgW2Bkb29yIHogJHtwcm9wb3NhbC5kb29yLnp9IGlzIG91dHNpZGUgJHtyZWN0LnowfS4uJHtyZWN0LnoxfWBdKTtcbiAgfVxuXG4gIGNvbnN0IHN1cmZhY2UgPSBmb290cHJpbnRTdXJmYWNlKHdvcmxkLCByZWN0LCBwcm9wb3NhbC5mbG9vclkpO1xuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG5cbiAgY29uc3QgZmxvb3JZID0gcHJvcG9zYWwuZmxvb3JZO1xuICBjb25zdCB4MCA9IHJlY3QueDAsIHgxID0gcmVjdC54MSArIDE7XG4gIGNvbnN0IHowID0gcmVjdC56MCwgejEgPSByZWN0LnoxICsgMTtcbiAgY29uc3QgY3ggPSAoeDAgKyB4MSkgLyAyO1xuICBjb25zdCBjeiA9ICh6MCArIHoxKSAvIDI7XG4gIGNvbnN0IGRvb3JaID0gcHJvcG9zYWwuZG9vci56ICsgMC41O1xuICBjb25zdCBkb29ySGFsZiA9IDAuNjtcbiAgY29uc3Qgd2FsbEggPSAzLjA7XG4gIGNvbnN0IHdhbGxUID0gMC41O1xuICBjb25zdCBkb29ySCA9IDIuMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcblxuICAvLyBGbG9vciBzbGFiIGFuZCByb29mIHBsYXRlLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnZmxvb3InLCB4OiBjeCwgeTogZmxvb3JZLCB6OiBjeiwgdzogOC4wLCBoOiAwLjMsIGQ6IDYuMCwgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncm9vZicsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCwgejogY3osIHc6IDguNCwgaDogMC4zLCBkOiA2LjQsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gTm9ydGggYW5kIHNvdXRoIHdhbGxzLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnd2FsbCcsIHg6IGN4LCB5OiBmbG9vclksIHo6IHowICsgd2FsbFQgLyAyLCB3OiA4LjAsIGg6IHdhbGxILCBkOiB3YWxsVCwgdG9uZTogJ3N0b25lJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiBjeCwgeTogZmxvb3JZLCB6OiB6MSAtIHdhbGxUIC8gMiwgdzogOC4wLCBoOiB3YWxsSCwgZDogd2FsbFQsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gV2VzdCB3YWxsLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnd2FsbCcsIHg6IHgwICsgd2FsbFQgLyAyLCB5OiBmbG9vclksIHo6IGN6LCB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IDYuMCwgdG9uZTogJ3N0b25lJyB9KTtcblxuICAvLyBFYXN0IHdhbGwgd2l0aCBhIHJlYWwgZG9vcndheSBnYXAuXG4gIGNvbnN0IGVhc3RYID0geDEgLSB3YWxsVCAvIDI7XG4gIGNvbnN0IGdhcDAgPSBkb29yWiAtIGRvb3JIYWxmO1xuICBjb25zdCBnYXAxID0gZG9vclogKyBkb29ySGFsZjtcbiAgY29uc3QgbGVmdExlbiA9IGdhcDAgLSB6MDtcbiAgY29uc3QgcmlnaHRMZW4gPSB6MSAtIGdhcDE7XG4gIGlmIChsZWZ0TGVuID4gMC4wNSkge1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnd2FsbCcsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IHowICsgbGVmdExlbiAvIDIsXG4gICAgICB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IGxlZnRMZW4sIHRvbmU6ICdzdG9uZScsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHJpZ2h0TGVuID4gMC4wNSkge1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnd2FsbCcsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDEgKyByaWdodExlbiAvIDIsXG4gICAgICB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IHJpZ2h0TGVuLCB0b25lOiAnc3RvbmUnLFxuICAgIH0pO1xuICB9XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2xpbnRlbCcsIHg6IGVhc3RYLCB5OiBmbG9vclkgKyBkb29ySCwgejogZG9vclosXG4gICAgdzogd2FsbFQsIGg6IHdhbGxIIC0gZG9vckgsIGQ6IGRvb3JIYWxmICogMiwgdG9uZTogJ3N0b25lX2InLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAnZG9vcicsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDAsXG4gICAgdzogMC4xOCwgaDogZG9vckgsIGQ6IDAuMTYsIHRvbmU6ICd0aW1iZXInLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAnZG9vcicsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDEsXG4gICAgdzogMC4xOCwgaDogZG9vckgsIGQ6IDAuMTYsIHRvbmU6ICd0aW1iZXInLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAndGhyZXNob2xkJywgeDogeDEgKyAwLjM1LCB5OiBmbG9vclksIHo6IGRvb3JaLFxuICAgIHc6IDAuOSwgaDogMC4xNiwgZDogMS4zLCB0b25lOiAnb2NocmUnLFxuICB9KTtcblxuICAvLyBUd28gd2luZG93cyBvbiB0aGUgc291dGggd2FsbCwgc2xpZ2h0bHkgcHJvdWQgb2YgdGhlIG91dGVyIGZhY2UuXG4gIGZvciAoY29uc3Qgd3ggb2YgW2N4IC0gMi4yLCBjeCArIDIuMl0pIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dpbmRvdycsIHg6IHd4LCB5OiBmbG9vclkgKyAxLjQ1LCB6OiB6MSAtIDAuMDIsXG4gICAgICB3OiAxLjAsIGg6IDEuMCwgZDogMC4wOCwgdG9uZTogJ2FjY2VudCcsXG4gICAgfSk7XG4gIH1cblxuICAvLyBQYXJhcGV0IGFyb3VuZCB0aGUgZmxhdCBOb3hlbCByb29mLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3ogLSAzLjA1LCB3OiA4LjQsIGg6IDAuNCwgZDogMC4zLCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3gsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiArIDMuMDUsIHc6IDguNCwgaDogMC40LCBkOiAwLjMsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCAtIDQuMDUsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiwgdzogMC4zLCBoOiAwLjQsIGQ6IDYuNCwgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4ICsgNC4wNSwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6LCB3OiAwLjMsIGg6IDAuNCwgZDogNi40LCB0b25lOiAnc3RvbmVfYicgfSk7XG5cbiAgY29uc3QgcGxhbjogU3RydWN0dXJlUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAga2luZDogJ2hvdXNlJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogY3gsIHk6IGZsb29yWSwgejogY3ogfSxcbiAgICByb3Q6IDAsXG4gICAgbW9kdWxlcyxcbiAgICBjb3N0OiB7IC4uLkhPVVNFX0NPU1QgfSxcbiAgICBlbnZlbG9wZTogZm9vdHByaW50RW52ZWxvcGUocmVjdCwgZmxvb3JZLCBmbG9vclkgKyA0LCAyKSxcbiAgICBzdXJmYWNlLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHBhdGggLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhblBhdGgod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHdpZHRoID0gcmVjdC54MSAtIHJlY3QueDAgKyAxO1xuICBjb25zdCBkZXB0aCA9IHJlY3QuejEgLSByZWN0LnowICsgMTtcbiAgaWYgKGRlcHRoICE9PSAzIHx8IHdpZHRoIDwgMykge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgcGF0aCBuZWVkcyBhIDMgbSB3aWRlIGNvcnJpZG9yLCBnb3QgJHt3aWR0aH0geCAke2RlcHRofSBtYF0pO1xuICB9XG5cbiAgY29uc3QgY2VudGVyWiA9IHJlY3QuejAgKyAxO1xuICBjb25zdCBzdXJmYWNlOiBTdXJmYWNlU2FtcGxlW10gPSBbXTtcbiAgY29uc3QgaGVpZ2h0czogbnVtYmVyW10gPSBbXTtcbiAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgY2VudGVyWik7XG4gICAgaGVpZ2h0cy5wdXNoKHkpO1xuICAgIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykgc3VyZmFjZS5wdXNoKHsgeCwgeiwgeSB9KTtcbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgaGVpZ2h0cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHN0ZXAgPSBoZWlnaHRzW2ldIC0gaGVpZ2h0c1tpIC0gMV07XG4gICAgaWYgKE1hdGguYWJzKHN0ZXApID4gMSkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9zdGVwJywgW2BzdGVwICR7c3RlcH0gbSBhdCB4PSR7cmVjdC54MCArIGl9YF0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IHMgb2Ygc3VyZmFjZSkge1xuICAgIGNvbnN0IHRvcCA9IGdldFZveGVsKHdvcmxkLCBzLngsIHMueSAtIDEsIHMueik7XG4gICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX3dldCcsIFtgY29sdW1uICR7cy54fSwke3Muen0gaXMgd2V0YF0pO1xuICAgIH1cbiAgICBpZiAodG9wICE9PSBNQVQuR1JBVkVMKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX3N1cmZhY2UnLCBbXG4gICAgICAgIGBjb2x1bW4gJHtzLnh9LCR7cy56fSB0b3AgaXMgJHt0b3B9LCBleHBlY3RlZCBncmF2ZWxgLFxuICAgICAgXSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG5cbiAgY29uc3QgY3ogPSBjZW50ZXJaICsgMC41O1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCBjZW50ZXJaKTtcbiAgICBjb25zdCBteCA9IHggKyAwLjU7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhdGgnLCB4OiBteCwgeSwgejogY3osIHc6IDEuMCwgaDogMC4xMiwgZDogMy4wLCB0b25lOiAnZ3JhdmVsJyB9KTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IG14LCB5LCB6OiByZWN0LnowICsgMC4wNzUsIHc6IDEuMCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lX2InIH0pO1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdjdXJiJywgeDogbXgsIHksIHo6IHJlY3QuejEgKyAxIC0gMC4wNzUsIHc6IDEuMCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lX2InIH0pO1xuICB9XG5cbiAgY29uc3QgbWluWSA9IE1hdGgubWluKC4uLmhlaWdodHMpO1xuICBjb25zdCBtYXhZID0gTWF0aC5tYXgoLi4uaGVpZ2h0cyk7XG4gIGNvbnN0IHBsYW46IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIGtpbmQ6ICdwYXRoJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIG9yaWdpbjogeyB4OiAocmVjdC54MCArIHJlY3QueDEgKyAxKSAvIDIsIHk6IG1pblksIHo6IGN6IH0sXG4gICAgcm90OiAwLFxuICAgIG1vZHVsZXMsXG4gICAgY29zdDogcGF0aENvc3Qod2lkdGgpLFxuICAgIGVudmVsb3BlOiBmb290cHJpbnRFbnZlbG9wZShyZWN0LCBtaW5ZIC0gMSwgbWF4WSArIDIsIDApLFxuICAgIHN1cmZhY2UsXG4gIH07XG4gIHBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gdGVycmFjZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhblRlcnJhY2VzKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGNvbnN0IGNvdW50ID0gcHJvcG9zYWwudGVycmFjZXMgPz8gMztcbiAgaWYgKHdpZHRoICE9PSAxMiB8fCBkZXB0aCAhPT0gOCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgdGVycmFjZXMgbmVlZCAxMiB4IDggbSwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuICBpZiAoY291bnQgPCAyIHx8IGNvdW50ID4gNCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3RlcnJhY2VfY291bnQnLCBbYCR7Y291bnR9IHRlcnJhY2VzIGlzIG91dHNpZGUgMi4uNGBdKTtcbiAgfVxuXG4gIC8vIFNwbGl0IGRlcHRoIGludG8gbmVhci1lcXVhbCBiYW5kcywgaGlnaCBzaWRlIGZpcnN0LlxuICBjb25zdCBiYXNlID0gTWF0aC5mbG9vcihkZXB0aCAvIGNvdW50KTtcbiAgY29uc3QgZXh0cmEgPSBkZXB0aCAlIGNvdW50O1xuICBjb25zdCBiYW5kczogVGVycmFjZUJhbmRbXSA9IFtdO1xuICBsZXQgeiA9IHJlY3QuejA7XG4gIGNvbnN0IG1lZGlhbnM6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgIGNvbnN0IHNpemUgPSBiYXNlICsgKGkgPCBleHRyYSA/IDEgOiAwKTtcbiAgICBjb25zdCB6MCA9IHosIHoxID0geiArIHNpemUgLSAxO1xuICAgIGNvbnN0IHZhbHVlczogbnVtYmVyW10gPSBbXTtcbiAgICBmb3IgKGxldCBieiA9IHowOyBieiA8PSB6MTsgYnorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB2YWx1ZXMucHVzaChzdXJmYWNlQXQod29ybGQsIHgsIGJ6KSk7XG4gICAgfVxuICAgIG1lZGlhbnMucHVzaChtZWRpYW4odmFsdWVzKSk7XG4gICAgYmFuZHMucHVzaCh7IHowLCB6MSwgeTogMCB9KTtcbiAgICB6ID0gejEgKyAxO1xuICB9XG4gIC8vIEVhY2ggdGVycmFjZSBzaXRzIGV4YWN0bHkgb25lIG1ldHJlIGJlbG93IHRoZSBwcmV2aW91cyBvbmUuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYmFuZHMubGVuZ3RoOyBpKyspIHtcbiAgICBiYW5kc1tpXS55ID0gaSA9PT0gMCA/IG1lZGlhbnNbMF0gOiBNYXRoLm1pbihtZWRpYW5zW2ldLCBiYW5kc1tpIC0gMV0ueSAtIDEpO1xuICB9XG5cbiAgbGV0IG1heEN1dCA9IDAsIG1heEZpbGwgPSAwLCBjdXRWb2x1bWUgPSAwLCBmaWxsVm9sdW1lID0gMDtcbiAgY29uc3Qgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGZvciAoY29uc3QgYiBvZiBiYW5kcykge1xuICAgIGZvciAobGV0IGJ6ID0gYi56MDsgYnogPD0gYi56MTsgYnorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IHMgPSBzdXJmYWNlQXQod29ybGQsIHgsIGJ6KTtcbiAgICAgICAgc3VyZmFjZS5wdXNoKHsgeCwgejogYnosIHk6IGIueSB9KTtcbiAgICAgICAgY29uc3QgZCA9IHMgLSBiLnk7XG4gICAgICAgIGlmIChkID4gMCkgeyBjdXRWb2x1bWUgKz0gZDsgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkKTsgfVxuICAgICAgICBpZiAoZCA8IDApIHsgZmlsbFZvbHVtZSArPSAtZDsgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIC1kKTsgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAobWF4Q3V0ID4gRkFSTV9SVUxFUy5tYXhDdXQgfHwgbWF4RmlsbCA+IEZBUk1fUlVMRVMubWF4RmlsbFxuICAgIHx8IGN1dFZvbHVtZSA+IEZBUk1fUlVMRVMubWF4Q3V0Vm9sdW1lIHx8IGZpbGxWb2x1bWUgPiBGQVJNX1JVTEVTLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX2VhcnRod29yaycsIFtcbiAgICAgIGBjdXQgJHtjdXRWb2x1bWV9IG1cdTAwQjMgLyBmaWxsICR7ZmlsbFZvbHVtZX0gbVx1MDBCMywgbWF4ICR7bWF4Q3V0fS8ke21heEZpbGx9IG1gLFxuICAgIF0pO1xuICB9XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX25vdF9wcmVwYXJlZCcsIG1pc21hdGNoZXMuc2xpY2UoMCwgNCkubWFwKFxuICAgICAgKG0pID0+IGBjb2x1bW4gJHttLnh9LCR7bS56fSBpcyBhdCAke20uYWN0dWFsfSwgZXhwZWN0ZWQgJHttLmV4cGVjdGVkfWAsXG4gICAgKSk7XG4gIH1cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX29ic3RydWN0ZWQnLCBvYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSk7XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIHN1cmZhY2UpIHtcbiAgICBjb25zdCB0b3AgPSBnZXRWb3hlbCh3b3JsZCwgcy54LCBzLnkgLSAxLCBzLnopO1xuICAgIGlmICh0b3AgIT09IE1BVC5TT0lMKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX3N1cmZhY2UnLCBbXG4gICAgICAgIGBjb2x1bW4gJHtzLnh9LCR7cy56fSB0b3AgaXMgJHt0b3B9LCBleHBlY3RlZCBzb2lsYCxcbiAgICAgIF0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGN4ID0gKHJlY3QueDAgKyByZWN0LngxICsgMSkgLyAyO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGIgb2YgYmFuZHMpIHtcbiAgICBjb25zdCBieiA9IChiLnowICsgYi56MSArIDEpIC8gMjtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3NvaWxfYmVkJywgeDogY3gsIHk6IGIueSwgejogYnosXG4gICAgICB3OiB3aWR0aCwgaDogMC4xOCwgZDogYi56MSAtIGIuejAgKyAxLCB0b25lOiAnc29pbCcsXG4gICAgfSk7XG4gICAgLy8gVGhyZWUgY3JvcCByb3dzIHBlciB0ZXJyYWNlLCBpbnNldCBmcm9tIHRoZSByZXRhaW5pbmcgd2FsbHMuXG4gICAgY29uc3Qgcm93RGVwdGggPSBiLnoxIC0gYi56MCArIDE7XG4gICAgZm9yIChsZXQgciA9IDA7IHIgPCAzOyByKyspIHtcbiAgICAgIGNvbnN0IHQgPSAociArIDEpIC8gNDtcbiAgICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICAgIGtpbmQ6ICdjcm9wX3JvdycsIHg6IGN4LCB5OiBiLnkgKyAwLjE4LCB6OiBiLnowICsgcm93RGVwdGggKiB0LFxuICAgICAgICB3OiB3aWR0aCAtIDEuMiwgaDogMC4yOCwgZDogMC4zNiwgdG9uZTogJ2Nyb3AnLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgYmFuZHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB1cHBlciA9IGJhbmRzW2kgLSAxXTtcbiAgICBjb25zdCBsb3dlciA9IGJhbmRzW2ldO1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAncmV0YWluaW5nX3dhbGwnLCB4OiBjeCwgeTogbG93ZXIueSwgejogdXBwZXIuejEgKyAwLjUsXG4gICAgICB3OiB3aWR0aCwgaDogdXBwZXIueSAtIGxvd2VyLnksIGQ6IDAuNCwgdG9uZTogJ3N0b25lX2InLFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgbWluWSA9IE1hdGgubWluKC4uLmJhbmRzLm1hcCgoYikgPT4gYi55KSk7XG4gIGNvbnN0IG1heFkgPSBNYXRoLm1heCguLi5iYW5kcy5tYXAoKGIpID0+IGIueSkpO1xuICBjb25zdCBwbGFuOiBTdHJ1Y3R1cmVQbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBraW5kOiAndGVycmFjZScsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogY3gsIHk6IG1pblksIHo6IChyZWN0LnowICsgcmVjdC56MSArIDEpIC8gMiB9LFxuICAgIHJvdDogMCxcbiAgICBtb2R1bGVzLFxuICAgIGNvc3Q6IHsgLi4uVEVSUkFDRV9DT1NUIH0sXG4gICAgZW52ZWxvcGU6IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIG1pblkgLSAxLCBtYXhZICsgMiwgMSksXG4gICAgc3VyZmFjZSxcbiAgICB0ZXJyYWNlczogYmFuZHMsXG4gIH07XG4gIHBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFuU3RydWN0dXJlKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGlmIChwcm9wb3NhbC5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSByZXR1cm4gcGxhbkZvdW5kZXJEZXNpZ24od29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKHByb3Bvc2FsLmRlc2lnblZlcnNpb24gIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3Vuc3VwcG9ydGVkX2Rlc2lnbicsIFtgdW5zdXBwb3J0ZWQgc3RydWN0dXJlIGRlc2lnbiAke1N0cmluZyhwcm9wb3NhbC5kZXNpZ25WZXJzaW9uKX1gXSk7XG4gIH1cbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdob3VzZScpIHJldHVybiBwbGFuSG91c2Uod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdwYXRoJykgcmV0dXJuIHBsYW5QYXRoKHdvcmxkLCBwcm9wb3NhbCk7XG4gIHJldHVybiBwbGFuVGVycmFjZXMod29ybGQsIHByb3Bvc2FsKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBkZXNpZ24gMjogYm91bmRlZCBmb3VuZGVyIGNhbmRpZGF0ZSAtLS0tLS0tLS0tXG4vLyBUaGlzIGRlbGliZXJhdGVseSBsZWF2ZXMgZXZlcnkgbGVnYWN5IHBsYW5uZXIgYWJvdmUgdW50b3VjaGVkLiBUaGUgZXh0cmEgd2FsbFxuLy8gcHJpbWl0aXZlcyByZXByZXNlbnQgdm9pZHMsIG5vdCBkZWNvcmF0aXZlIHdpbmRvd3M7IHRoZWlyIGFzc2V0LWxldmVsIHZvbHVtZVxuLy8gaW50ZXJwcmV0YXRpb24gcmVtYWlucyBSZXZpZXcgUmVxdWlyZWQgKHRoZSBmb3VuZGVyIDRcdTIwMTM5IHZvbHVtZSB0YXJnZXQpLlxuZnVuY3Rpb24gcGxhbkZvdW5kZXJEZXNpZ24od29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdwYXRoJykgcmV0dXJuIHBsYW5Gb3VuZGVyUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICBjb25zdCBwbGFubmVkID0gcHJvcG9zYWwua2luZCA9PT0gJ2hvdXNlJyA/IHBsYW5Ib3VzZSh3b3JsZCwgcHJvcG9zYWwpIDogcGxhblRlcnJhY2VzKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAndGVycmFjZScpIHtcbiAgICAvLyBDcm9wIHJvd3Mgc3RheSBjb21wYWN0IGF1dGhvcml0YXRpdmUgYWdncmVnYXRlcy4gVGhlaXIgZmFjZXRlZCBmb2xpYWdlIGlzXG4gICAgLy8gZGVyaXZlZCBwcmVzZW50YXRpb24gb25seTsgbm8gcGxhbnQtbGV2ZWwgZXhpc3RlbmNlIG9yIHlpZWxkIGlzIGludmVudGVkLlxuICAgIHBsYW5uZWQucGxhbi5kZXNpZ25WZXJzaW9uID0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbiAgICBwbGFubmVkLnBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW5uZWQucGxhbil9YDtcbiAgICByZXR1cm4gcGxhbm5lZDtcbiAgfVxuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgeDAgPSByZWN0LngwLCB4MSA9IHJlY3QueDEgKyAxO1xuICBjb25zdCB6MCA9IHJlY3QuejAsIHoxID0gcmVjdC56MSArIDE7XG4gIGNvbnN0IHkgPSBwcm9wb3NhbC5mbG9vclksIGN4ID0gKHgwICsgeDEpIC8gMiwgY3ogPSAoejAgKyB6MSkgLyAyO1xuICBjb25zdCB0ID0gMC42LCBoID0gMy4yO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICAvLyBPbmUgc3RydWN0dXJhbCBzdG9uZSBmYW1pbHk6IGxpZ2h0aW5nLCBub3QgcGFpbnRlZCBmYWNlIHZhcmlhdGlvbiwgc2hhZGVzIGl0LlxuICBjb25zdCB3YWxsID0gKHg6IG51bWJlciwgYm90dG9tOiBudW1iZXIsIHo6IG51bWJlciwgdzogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZDogbnVtYmVyLCBraW5kOiBTdHJ1Y3R1cmVNb2R1bGVbJ2tpbmQnXSA9ICd3YWxsJykgPT4ge1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQsIHgsIHk6IGJvdHRvbSwgeiwgdywgaDogaGVpZ2h0LCBkLCB0b25lOiAnc3RvbmUnIH0pO1xuICB9O1xuICB3YWxsKGN4LCB5IC0gMC40LCBjeiwgOCwgMC40LCA2LCAnZmxvb3InKTtcbiAgd2FsbChjeCwgeSwgejAgKyB0IC8gMiwgOCwgaCwgdCk7XG4gIGNvbnN0IGlubmVyWjAgPSB6MCArIHQsIGlubmVyWjEgPSB6MSAtIHQ7XG4gIHdhbGwoeDAgKyB0IC8gMiwgeSwgKGlubmVyWjAgKyBpbm5lcloxKSAvIDIsIHQsIGgsIGlubmVyWjEgLSBpbm5lclowKTtcbiAgY29uc3QgZG9vclogPSAocHJvcG9zYWwuZG9vcj8ueiA/PyByZWN0LnowKSArIDAuNTtcbiAgY29uc3QgZG9vcjAgPSBkb29yWiAtIDAuNiwgZG9vcjEgPSBkb29yWiArIDAuNjtcbiAgY29uc3QgZWFzdFggPSB4MSAtIHQgLyAyO1xuICB3YWxsKGVhc3RYLCB5LCAoaW5uZXJaMCArIGRvb3IwKSAvIDIsIHQsIGgsIGRvb3IwIC0gaW5uZXJaMCk7XG4gIHdhbGwoZWFzdFgsIHksIChkb29yMSArIGlubmVyWjEpIC8gMiwgdCwgaCwgaW5uZXJaMSAtIGRvb3IxKTtcbiAgd2FsbChlYXN0WCwgeSArIDIuMiwgZG9vclosIHQsIDAuNCwgMS4yLCAnbGludGVsJyk7XG4gIHdhbGwoZWFzdFgsIHkgKyAyLjYsIGRvb3JaLCB0LCAwLjYsIDEuMik7XG4gIGNvbnN0IHNvdXRoWiA9IHoxIC0gdCAvIDI7XG4gIGZvciAoY29uc3QgW2EsIGJdIG9mIFtbeDAgKyB0LCBjeCAtIDIuNl0sIFtjeCAtIDEuNCwgY3ggKyAxLjRdLCBbY3ggKyAyLjYsIHgxIC0gdF1dKSB7XG4gICAgd2FsbCgoYSArIGIpIC8gMiwgeSwgc291dGhaLCBiIC0gYSwgaCwgdCk7XG4gIH1cbiAgZm9yIChjb25zdCB3eCBvZiBbY3ggLSAyLCBjeCArIDJdKSB7XG4gICAgd2FsbCh3eCwgeSwgc291dGhaLCAxLjIsIDEsIHQpO1xuICAgIHdhbGwod3gsIHkgKyAyLjQsIHNvdXRoWiwgMS4yLCAwLjgsIHQsICdsaW50ZWwnKTtcbiAgfVxuICB3YWxsKGN4LCB5ICsgaCwgY3osIDgsIDAuNCwgNiwgJ3Jvb2YnKTtcbiAgd2FsbChjeCwgeSArIGggKyAwLjQsIHowICsgMC4xNSwgOCwgMC4zLCAwLjMsICdwYXJhcGV0Jyk7XG4gIHdhbGwoY3gsIHkgKyBoICsgMC40LCB6MSAtIDAuMTUsIDgsIDAuMywgMC4zLCAncGFyYXBldCcpO1xuICB3YWxsKGN4IC0gMy44NSwgeSArIGggKyAwLjQsIGN6LCAwLjMsIDAuMywgNS40LCAncGFyYXBldCcpO1xuICB3YWxsKGN4ICsgMy44NSwgeSArIGggKyAwLjQsIGN6LCAwLjMsIDAuMywgNS40LCAncGFyYXBldCcpO1xuICBwbGFubmVkLnBsYW4ubW9kdWxlcyA9IG1vZHVsZXM7XG4gIHBsYW5uZWQucGxhbi5kZXNpZ25WZXJzaW9uID0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbiAgcGxhbm5lZC5wbGFuLmVudmVsb3BlID0gZm9vdHByaW50RW52ZWxvcGUocmVjdCwgeSAtIDEsIHkgKyA0LCAyKTtcbiAgcGxhbm5lZC5wbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFubmVkLnBsYW4pfWA7XG4gIHJldHVybiBwbGFubmVkO1xufVxuXG5mdW5jdGlvbiBwbGFuRm91bmRlclBhdGgod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5QYXRoKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG4gIGNvbnN0IGhlaWdodHMgPSBwbGFubmVkLnBsYW4ubW9kdWxlcy5maWx0ZXIoKG0pID0+IG0ua2luZCA9PT0gJ3BhdGgnKS5tYXAoKG0pID0+IG0ueSk7XG4gIGNvbnN0IHowID0gcGxhbm5lZC5wbGFuLnJlY3QuejAsIHoxID0gcGxhbm5lZC5wbGFuLnJlY3QuejEgKyAxO1xuICBsZXQgc3RhcnQgPSAwO1xuICBmb3IgKGxldCBlbmQgPSAxOyBlbmQgPD0gaGVpZ2h0cy5sZW5ndGg7IGVuZCsrKSB7XG4gICAgaWYgKGVuZCA8IGhlaWdodHMubGVuZ3RoICYmIGhlaWdodHNbZW5kXSA9PT0gaGVpZ2h0c1tzdGFydF0pIGNvbnRpbnVlO1xuICAgIGNvbnN0IHggPSBwbGFubmVkLnBsYW4ucmVjdC54MCArIHN0YXJ0LCB3aWR0aCA9IGVuZCAtIHN0YXJ0O1xuICAgIGNvbnN0IGN4ID0geCArIHdpZHRoIC8gMiwgeSA9IGhlaWdodHNbc3RhcnRdO1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXRoJywgeDogY3gsIHksIHo6ICh6MCArIHoxKSAvIDIsIHc6IHdpZHRoLCBoOiAwLjEyLCBkOiAzLCB0b25lOiAnZ3JhdmVsJyB9KTtcbiAgICBmb3IgKGNvbnN0IHogb2YgW3owICsgMC4wNzUsIHoxIC0gMC4wNzVdKSB7XG4gICAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IGN4LCB5LCB6LCB3OiB3aWR0aCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lJyB9KTtcbiAgICB9XG4gICAgc3RhcnQgPSBlbmQ7XG4gIH1cbiAgcGxhbm5lZC5wbGFuLm1vZHVsZXMgPSBtb2R1bGVzO1xuICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gIHBsYW5uZWQucGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbm5lZC5wbGFuKX1gO1xuICByZXR1cm4gcGxhbm5lZDtcbn1cblxuXG4vLyAtLS0tLS0tLS0tIGF1dGhvcml6YXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVMaW1pdHMge1xuICBtYXhNb2R1bGVzOiBudW1iZXI7XG4gIG1heENvc3Q6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU1RSVUNUVVJFX0xJTUlUUzogU3RydWN0dXJlTGltaXRzID0ge1xuICBtYXhNb2R1bGVzOiA2NCxcbiAgbWF4Q29zdDogMTI4LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uIHtcbiAgaWQ6IHN0cmluZztcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBiYXNlUmV2aXNpb246IG51bWJlcjtcbiAgbGltaXRzOiBTdHJ1Y3R1cmVMaW1pdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlRGVjaXNpb24ge1xuICBvazogYm9vbGVhbjtcbiAgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbiB8IG51bGw7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyIHtcbiAgcmVhZG9ubHkgYXV0aG9yaXR5ID0gTE9DQUxfQVVUSE9SSVRZO1xuICByZWFkb25seSBlbmZvcmNlbWVudCA9IExPQ0FMX0VORk9SQ0VNRU5UO1xuICByZWFkb25seSBsaW1pdHM6IFN0cnVjdHVyZUxpbWl0cztcblxuICBjb25zdHJ1Y3RvcihyZWFkb25seSBwb2xpY3k6IEF1dGhvcml6YXRpb25Qb2xpY3ksIGxpbWl0czogUGFydGlhbDxTdHJ1Y3R1cmVMaW1pdHM+ID0ge30pIHtcbiAgICB0aGlzLmxpbWl0cyA9IHsgLi4uREVGQVVMVF9TVFJVQ1RVUkVfTElNSVRTLCAuLi5saW1pdHMgfTtcbiAgfVxuXG4gIGF1dGhvcml6ZSh3b3JsZDogV29ybGQsIHBsYW46IFN0cnVjdHVyZVBsYW4pOiBTdHJ1Y3R1cmVEZWNpc2lvbiB7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAocGxhbi5tb2R1bGVzLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyBtb2R1bGVzJyk7XG4gICAgaWYgKHBsYW4ubW9kdWxlcy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhNb2R1bGVzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi5tb2R1bGVzLmxlbmd0aH0gbW9kdWxlcyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhNb2R1bGVzfWApO1xuICAgIH1cbiAgICBpZiAoY29zdFRvdGFsKHBsYW4uY29zdCkgPiB0aGlzLmxpbWl0cy5tYXhDb3N0KSB7XG4gICAgICByZWFzb25zLnB1c2goYGNvc3QgJHtjb3N0VG90YWwocGxhbi5jb3N0KX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heENvc3R9YCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcihhbW91bnQpIHx8IChhbW91bnQgPz8gMCkgPCAwKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgY29zdCAke3Jlc291cmNlfT0ke2Ftb3VudH0gaXMgbm90IGEgbm9uLW5lZ2F0aXZlIGludGVnZXJgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHBsYW4uZW52ZWxvcGUubGVuZ3RoID09PSAwKSByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIHdvcmsgZW52ZWxvcGUnKTtcbiAgICBmb3IgKGNvbnN0IHJlZ2lvbiBvZiBwbGFuLmVudmVsb3BlKSB7XG4gICAgICBpZiAoIXRoaXMucG9saWN5LmVudmVsb3BlLnNvbWUoKHApID0+IHJlZ2lvbi54MCA+PSBwLngwICYmIHJlZ2lvbi54MSA8PSBwLngxXG4gICAgICAgICYmIHJlZ2lvbi56MCA+PSBwLnowICYmIHJlZ2lvbi56MSA8PSBwLnoxXG4gICAgICAgICYmIHJlZ2lvbi55MCA+PSBwLnkwICYmIHJlZ2lvbi55MSA8PSBwLnkxKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYGVudmVsb3BlICR7cmVnaW9uLngwfSwke3JlZ2lvbi56MH0sJHtyZWdpb24ueTB9Li4ke3JlZ2lvbi54MX0sJHtyZWdpb24uejF9LCR7cmVnaW9uLnkxfSBpcyBvdXRzaWRlIHRoZSBsb2NhbCBwb2xpY3lgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgICAgaWYgKCFtb2R1bGVJbnNpZGVFbnZlbG9wZShtLCBwbGFuLmVudmVsb3BlKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYG1vZHVsZSAke20ua2luZH0gYXQgJHttLnh9LCR7bS55fSwke20uen0gaXMgb3V0c2lkZSB0aGUgcGxhbiBlbnZlbG9wZWApO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAocGxhbi5zdXJmYWNlLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyBzdXJmYWNlIHNhbXBsZXMnKTtcbiAgICBmb3IgKGNvbnN0IHMgb2YgcGxhbi5zdXJmYWNlKSB7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgcy54LCBzLnksIHMueikpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBzdXJmYWNlICR7cy54fSwke3Muen0sJHtzLnl9IGlzIG91dHNpZGUgdGhlIHBsYW4gZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBhdXRob3JpemF0aW9uOiBudWxsLCByZWFzb25zIH07XG5cbiAgICBjb25zdCB0b2tlbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbiA9IHtcbiAgICAgIGlkOiBgbG9jYWwtc3R1YjpzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YCxcbiAgICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgICAgcGxhbkRpZ2VzdDogc3RydWN0dXJlRGlnZXN0KHBsYW4pLFxuICAgICAgZW52ZWxvcGU6IHBsYW4uZW52ZWxvcGUubWFwKChlKSA9PiAoeyAuLi5lIH0pKSxcbiAgICAgIGJhc2VSZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgICBsaW1pdHM6IHsgLi4udGhpcy5saW1pdHMgfSxcbiAgICB9O1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBhdXRob3JpemF0aW9uOiB0b2tlbiwgcmVhc29uczogW10gfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIGV4ZWN1dGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZUxlZGdlciB7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgYXV0aG9yaXphdGlvbklkOiBzdHJpbmc7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgc3RydWN0dXJlSWQ6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIG1vZHVsZUNvdW50OiBudW1iZXI7XG4gIGNvc3RQYWlkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICByZXZpc2lvbkJlZm9yZTogbnVtYmVyO1xuICByZXZpc2lvbkFmdGVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBTdHJ1Y3R1cmVQbGFuO1xuICBhdXRob3JpemF0aW9uOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uO1xuICBsZWRnZXI6IFN0cnVjdHVyZUxlZGdlcjtcbn1cblxuZXhwb3J0IHR5cGUgU3RydWN0dXJlT3V0Y29tZSA9IFN0cnVjdHVyZVN1Y2Nlc3MgfCBTdHJ1Y3R1cmVGYWlsdXJlO1xuXG5leHBvcnQgZnVuY3Rpb24gZXhlY3V0ZVN0cnVjdHVyZShcbiAgd29ybGQ6IFdvcmxkLCBwbGFuOiBTdHJ1Y3R1cmVQbGFuLCBhdXRob3JpemF0aW9uOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uLFxuKTogU3RydWN0dXJlT3V0Y29tZSB7XG4gIGlmIChhdXRob3JpemF0aW9uLmF1dGhvcml0eSAhPT0gTE9DQUxfQVVUSE9SSVRZXG4gICAgfHwgYXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudCAhPT0gTE9DQUxfRU5GT1JDRU1FTlQpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bnN1cHBvcnRlZF9hdXRob3JpdHknLCBbXG4gICAgICBgYXV0aG9yaXR5ICR7YXV0aG9yaXphdGlvbi5hdXRob3JpdHl9LyR7YXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudH0gaXMgbm90IHRoZSBsb2NhbCBzdHViYCxcbiAgICBdKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0ICE9PSBzdHJ1Y3R1cmVEaWdlc3QocGxhbikpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdkaWdlc3RfbWlzbWF0Y2gnLCBbJ2F1dGhvcml6YXRpb24gZG9lcyBub3QgbWF0Y2ggdGhpcyBzdHJ1Y3R1cmUgcGxhbiddKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb24gIT09IHdvcmxkLnJldmlzaW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnc3RhbGVfYXV0aG9yaXphdGlvbicsIFtcbiAgICAgIGBhdXRob3JpemF0aW9uIHdhcyBpc3N1ZWQgYXQgcmV2aXNpb24gJHthdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbn0sIHdvcmxkIGlzIGF0ICR7d29ybGQucmV2aXNpb259YCxcbiAgICBdKTtcbiAgfVxuICBpZiAocGxhbi5lbnZlbG9wZS5zb21lKChyKSA9PiAhYXV0aG9yaXphdGlvbi5lbnZlbG9wZS5zb21lKChhKSA9PiByLngwID49IGEueDBcbiAgICAmJiByLngxIDw9IGEueDEgJiYgci56MCA+PSBhLnowICYmIHIuejEgPD0gYS56MSAmJiByLnkwID49IGEueTAgJiYgci55MSA8PSBhLnkxKSkpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdlbnZlbG9wZV9taXNtYXRjaCcsIFsncGxhbiBlbnZlbG9wZSBpcyB3aWRlciB0aGFuIHRoZSBhdXRob3JpemF0aW9uJ10pO1xuICB9XG5cbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgIGlmICghbW9kdWxlSW5zaWRlRW52ZWxvcGUobSwgYXV0aG9yaXphdGlvbi5lbnZlbG9wZSkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgbW9kdWxlICR7bS5raW5kfSBhdCAke20ueH0sJHttLnl9LCR7bS56fSBpcyBvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlYCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgcGxhbi5zdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJlYXNvbnMucHVzaCguLi5taXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCBwbGFuLnJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goYGZvb3RwcmludCBoYXMgJHtvYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnNgKTtcbiAgfVxuICBpZiAod29ybGQuc3RydWN0dXJlcy5oYXMocGxhbi5pZCkpIHtcbiAgICByZWFzb25zLnB1c2goYHN0cnVjdHVyZSAke3BsYW4uaWR9IGFscmVhZHkgZXhpc3RzYCk7XG4gIH1cbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocGxhbi5jb3N0KSkge1xuICAgIGNvbnN0IGhhdmUgPSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDA7XG4gICAgaWYgKGhhdmUgPCAoYW1vdW50ID8/IDApKSB7XG4gICAgICByZWFzb25zLnB1c2goYG5lZWQgJHthbW91bnR9ICR7cmVzb3VyY2V9LCBoYXZlICR7aGF2ZX1gKTtcbiAgICB9XG4gIH1cbiAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5hdXRob3JpemVkX3N0cnVjdHVyZScsIHJlYXNvbnMpO1xuXG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgcmV2aXNpb25CZWZvcmUgPSB3b3JsZC5yZXZpc2lvbjtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocGxhbi5jb3N0KSkge1xuICAgIGNvbnN0IGxlZnQgPSAod29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSAtIChhbW91bnQgPz8gMCk7XG4gICAgaWYgKGxlZnQgPiAwKSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID0gbGVmdDtcbiAgICBlbHNlIGRlbGV0ZSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdO1xuICB9XG5cbiAgd29ybGQucmV2aXNpb24rKztcbiAgY29uc3Qgc3RydWN0dXJlOiBTdHJ1Y3R1cmUgPSB7XG4gICAgaWQ6IHBsYW4uaWQsXG4gICAga2luZDogcGxhbi5raW5kLFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAgeDogcGxhbi5vcmlnaW4ueCxcbiAgICB5OiBwbGFuLm9yaWdpbi55LFxuICAgIHo6IHBsYW4ub3JpZ2luLnosXG4gICAgcm90OiBwbGFuLnJvdCxcbiAgICBtb2R1bGVzOiBwbGFuLm1vZHVsZXMubWFwKChtKSA9PiAoeyAuLi5tIH0pKSxcbiAgICBjb3N0OiB7IC4uLnBsYW4uY29zdCB9LFxuICAgIGJ1aWx0UmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgIC4uLihwbGFuLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gPyB7IGRlc2lnblZlcnNpb246IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSA6IHt9KSxcbiAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgfTtcbiAgd29ybGQuc3RydWN0dXJlcy5zZXQoc3RydWN0dXJlLmlkLCBzdHJ1Y3R1cmUpO1xuXG4gIGNvbnN0IGxlZGdlcjogU3RydWN0dXJlTGVkZ2VyID0ge1xuICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICBhdXRob3JpemF0aW9uSWQ6IGF1dGhvcml6YXRpb24uaWQsXG4gICAgcGxhbkRpZ2VzdDogYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0LFxuICAgIHN0cnVjdHVyZUlkOiBzdHJ1Y3R1cmUuaWQsXG4gICAgc2l0ZUlkOiBwbGFuLnNpdGVJZCxcbiAgICBraW5kOiBwbGFuLmtpbmQsXG4gICAgbW9kdWxlQ291bnQ6IHN0cnVjdHVyZS5tb2R1bGVzLmxlbmd0aCxcbiAgICBjb3N0UGFpZDogeyAuLi5wbGFuLmNvc3QgfSxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICByZXZpc2lvbkJlZm9yZSxcbiAgICByZXZpc2lvbkFmdGVyOiB3b3JsZC5yZXZpc2lvbixcbiAgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIGF1dGhvcml6YXRpb24sIGxlZGdlciB9O1xufVxuXG4vKipcbiAqIFRoZSBzaGFyZWQgcGxheWVyL0FJIHN0cnVjdHVyZSBlbnRyeSBwb2ludC4gVGVycmFpbiBtdXN0IGFscmVhZHkgYmUgcHJlcGFyZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFN0cnVjdHVyZShcbiAgd29ybGQ6IFdvcmxkLFxuICBhdXRob3JpemVyOiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsXG4gIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCxcbik6IFN0cnVjdHVyZU91dGNvbWUge1xuICBjb25zdCBwbGFubmVkID0gcGxhblN0cnVjdHVyZSh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBkZWNpc2lvbiA9IGF1dGhvcml6ZXIuYXV0aG9yaXplKHdvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2F1dGhvcml6ZScsICdub3RfYXV0aG9yaXplZCcsIGRlY2lzaW9uLnJlYXNvbnMpO1xuICB9XG4gIHJldHVybiBleGVjdXRlU3RydWN0dXJlKHdvcmxkLCBwbGFubmVkLnBsYW4sIGRlY2lzaW9uLmF1dGhvcml6YXRpb24pO1xufVxuIiwgIi8vIENhbm9uaWNhbCBzdGF0ZSBoYXNoaW5nIFx1MjAxNCBwdXJlIHNpbXVsYXRpb24sIG5vIHRocmVlLmpzIGltcG9ydHMuXG4vL1xuLy8gVGhlIG5vLWZsYXR0ZW4gcHJvb2YgY29tcGFyZXMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lIG91dHNpZGUgdGhlXG4vLyBjb21wbGV0ZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUuIEl0IGRlbGliZXJhdGVseSBkb2VzIG5vdCBoYXNoIGNodW5rXG4vLyBoZWlnaHRzL3RvcE1hdGVyaWFscyAoZGVyaXZlZCBjYWNoZXMpLCBtZXNoIGdlb21ldHJ5LCBzdHJlYW1pbmcgc3RhdGUgb3Jcbi8vIG5hdmlnYXRpb24gZGF0YS4gVGhvc2UgYXJlIGNoZWNrZWQgc2VwYXJhdGVseSBhcyBkZXJpdmVkIHN0YXRlLCBzbyBhIGNhY2hlXG4vLyBvciBtZXNoIHJlYnVpbGQgY2FuIG5ldmVyIGJlIG1pc3Rha2VuIGZvciBhIHRlcnJhaW4gbXV0YXRpb24uXG5pbXBvcnQge1xuICBXb3JsZCwgWV9NSU4sIFlfTUFYLCBIQUxGLCBDSFVOS19TSVpFLCBDSFVOS19BUkVBLFxuICBlbnN1cmVDaHVuaywgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCwgaXNTb2xpZCxcbiAgRW50aXR5LFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IFZveGVsUmVnaW9uLCBlbnZlbG9wZUNvbnRhaW5zIH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0YXRlSGFzaCB7XG4gIC8qKiAxNiBoZXggY2hhcmFjdGVyczogdHdvIGluZGVwZW5kZW50IDMyLWJpdCBsYW5lcy4gKi9cbiAgaGFzaDogc3RyaW5nO1xuICBjZWxsczogbnVtYmVyO1xuICBleGNsdWRlZENlbGxzOiBudW1iZXI7XG4gIGNodW5rczogbnVtYmVyO1xuICByZWdpb246IFZveGVsUmVnaW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlTWlzbWF0Y2gge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgZmllbGQ6ICdoZWlnaHQnIHwgJ21hdGVyaWFsJztcbiAgZXhwZWN0ZWQ6IG51bWJlcjtcbiAgYWN0dWFsOiBudW1iZXI7XG59XG5cbmNsYXNzIEhhc2hlciB7XG4gIHByaXZhdGUgYSA9IDB4ODExYzlkYzU7XG4gIHByaXZhdGUgYiA9IDB4OWUzNzc5Yjk7XG5cbiAgYnl0ZSh2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCB4ID0gdiAmIDB4ZmY7XG4gICAgdGhpcy5hID0gTWF0aC5pbXVsKHRoaXMuYSBeIHgsIDB4MDEwMDAxOTMpO1xuICAgIHRoaXMuYiA9IE1hdGguaW11bCh0aGlzLmIgXiAoeCArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICB0aGlzLmIgXj0gdGhpcy5iID4+PiAxMztcbiAgfVxuXG4gIHUzMih2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBsZXQgbiA9IHYgPj4+IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA0OyBpKyspIHtcbiAgICAgIHRoaXMuYnl0ZShuKTtcbiAgICAgIG4gPj4+PSA4O1xuICAgIH1cbiAgfVxuXG4gIHN0cmluZyhzOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLnUzMihzLmxlbmd0aCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSsrKSB0aGlzLmJ5dGUocy5jaGFyQ29kZUF0KGkpKTtcbiAgfVxuXG4gIGhleCgpOiBzdHJpbmcge1xuICAgIHJldHVybiAodGhpcy5hID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICAgKyAodGhpcy5iID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXBSZWdpb24ocmVnaW9uOiBWb3hlbFJlZ2lvbik6IFZveGVsUmVnaW9uIHtcbiAgY29uc3QgcjogVm94ZWxSZWdpb24gPSB7XG4gICAgeDA6IE1hdGgubWF4KC1IQUxGLCBNYXRoLmZsb29yKHJlZ2lvbi54MCkpLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgTWF0aC5mbG9vcihyZWdpb24uejApKSxcbiAgICB4MTogTWF0aC5taW4oSEFMRiAtIDEsIE1hdGguZmxvb3IocmVnaW9uLngxKSksXG4gICAgejE6IE1hdGgubWluKEhBTEYgLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi56MSkpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgTWF0aC5mbG9vcihyZWdpb24ueTApKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi55MSkpLFxuICB9O1xuICBpZiAoci54MCA+IHIueDEgfHwgci56MCA+IHIuejEgfHwgci55MCA+IHIueTEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYGVtcHR5IHZveGVsIHJlZ2lvbiAke0pTT04uc3RyaW5naWZ5KHJlZ2lvbil9YCk7XG4gIH1cbiAgcmV0dXJuIHI7XG59XG5cbi8qKiBTb3J0IGFuIGVudmVsb3BlIHNvIGl0cyBoYXNoIGlzIGluZGVwZW5kZW50IG9mIHJlY3Qgb3JkZXIuICovXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplRW52ZWxvcGUocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBWb3hlbFJlZ2lvbltdIHtcbiAgcmV0dXJuIHJlY3RzXG4gICAgLm1hcCgocikgPT4gKHtcbiAgICAgIHgwOiBNYXRoLmZsb29yKHIueDApLCB6MDogTWF0aC5mbG9vcihyLnowKSwgeDE6IE1hdGguZmxvb3Ioci54MSksIHoxOiBNYXRoLmZsb29yKHIuejEpLFxuICAgICAgeTA6IE1hdGguZmxvb3Ioci55MCksIHkxOiBNYXRoLmZsb29yKHIueTEpLFxuICAgIH0pKVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLngwIC0gYi54MCB8fCBhLnowIC0gYi56MCB8fCBhLnkwIC0gYi55MFxuICAgICAgfHwgYS54MSAtIGIueDEgfHwgYS56MSAtIGIuejEgfHwgYS55MSAtIGIueTEpO1xufVxuXG4vKiogTWF0ZXJpYWxpc2UgZXZlcnkgY2h1bmsgdGhhdCBvdmVybGFwcyB0aGUgcmVnaW9uIGFuZCByZXR1cm4gc29ydGVkIGtleXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IHdvcmxkVG9DaHVua1goci54MCksIGN4MSA9IHdvcmxkVG9DaHVua1goci54MSk7XG4gIGNvbnN0IGN6MCA9IHdvcmxkVG9DaHVua1ooci56MCksIGN6MSA9IHdvcmxkVG9DaHVua1ooci56MSk7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2N4fSwke2N6fSBpcyBvdXRzaWRlIHRoZSB3b3JsZGApO1xuICAgICAga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICAgIH1cbiAgfVxuICBrZXlzLnNvcnQoKTtcbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKlxuICogSGFzaCB0aGUgYXV0aG9yaXRhdGl2ZSBtYXRlcmlhbCBieXRlIG9mIGV2ZXJ5IHZveGVsIGluIGByZWdpb25gLCBleGNsdWRpbmdcbiAqIGV2ZXJ5IHZveGVsIGluc2lkZSBgZXhjbHVkZWAuIFR3byBjYWxscyB3aXRoIHRoZSBzYW1lIHJlZ2lvbiBhbmQgZW52ZWxvcGVcbiAqIGFyZSBkaXJlY3RseSBjb21wYXJhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsUmVnaW9uSGFzaChcbiAgd29ybGQ6IFdvcmxkLFxuICByZWdpb246IFZveGVsUmVnaW9uLFxuICBleGNsdWRlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdID0gW10sXG4pOiBTdGF0ZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3QgZW52ZWxvcGUgPSBub3JtYWxpemVFbnZlbG9wZShleGNsdWRlKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnZveGVsLXN0YXRlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpOyBoLnUzMihyLnkwKTsgaC51MzIoci55MSk7XG4gIGgudTMyKGVudmVsb3BlLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgZSBvZiBlbnZlbG9wZSkge1xuICAgIGgudTMyKGUueDApOyBoLnUzMihlLnowKTsgaC51MzIoZS54MSk7IGgudTMyKGUuejEpOyBoLnUzMihlLnkwKTsgaC51MzIoZS55MSk7XG4gIH1cblxuICBsZXQgY2VsbHMgPSAwO1xuICBsZXQgZXhjbHVkZWRDZWxscyA9IDA7XG4gIGNvbnN0IHlpMCA9IHIueTAgLSBZX01JTjtcbiAgY29uc3QgeWkxID0gci55MSAtIFlfTUlOO1xuXG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IHlpID0geWkwOyB5aSA8PSB5aTE7IHlpKyspIHtcbiAgICAgIGNvbnN0IHkgPSBZX01JTiArIHlpO1xuICAgICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgICBjb25zdCB6ID0gb3ogKyBsejtcbiAgICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICAgIGNvbnN0IHggPSBveCArIGx4O1xuICAgICAgICAgIGlmIChlbnZlbG9wZS5sZW5ndGggPiAwICYmIGVudmVsb3BlQ29udGFpbnMoZW52ZWxvcGUsIHgsIHksIHopKSB7XG4gICAgICAgICAgICBleGNsdWRlZENlbGxzKys7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaC5ieXRlKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeWksIGx6KV0pO1xuICAgICAgICAgIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjZWxscywgZXhjbHVkZWRDZWxscywgY2h1bmtzOiBrZXlzLmxlbmd0aCwgcmVnaW9uOiByIH07XG59XG5cbi8qKiBDYW5vbmljYWwgaW52ZW50b3J5IGhhc2g7IGtleSBvcmRlciBjYW5ub3QgYWZmZWN0IHRoZSByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjppbnZlbnRvcnk6djEnKTtcbiAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHdvcmxkLmludmVudG9yeSkuc29ydCgpO1xuICBoLnUzMihrZXlzLmxlbmd0aCk7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBoLnN0cmluZyhrZXkpO1xuICAgIGgudTMyKHdvcmxkLmludmVudG9yeVtrZXldKTtcbiAgfVxuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGludmVudG9yeVNuYXBzaG90KHdvcmxkOiBXb3JsZCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMod29ybGQuaW52ZW50b3J5KS5zb3J0KCkpIG91dFtrZXldID0gd29ybGQuaW52ZW50b3J5W2tleV07XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGhhc2hFbnRpdHkoaDogSGFzaGVyLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaC5zdHJpbmcoZS5pZCk7XG4gIGguc3RyaW5nKGUua2luZCk7XG4gIGguc3RyaW5nKGUuY2h1bmspO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueCAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnkgKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS56ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUucm90ICogMTAwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnNjYWxlICogMTAwMCkpO1xuICBoLnUzMihlLnZhcmlhbnQpO1xuICBoLnN0cmluZyhlLnJlc291cmNlID8/ICcnKTtcbiAgaC51MzIoZS5yZW1haW5pbmcpO1xuICBoLnUzMihlLmhhcnZlc3RlZCA/IDEgOiAwKTtcbiAgaC51MzIoZS5oYXJ2ZXN0ZWRPbmNlID8gMSA6IDApO1xufVxuXG4vKiogSGFzaCBlbnRpdHkgc3RhdGU7IHdpdGggYSByZWdpb24sIG9ubHkgZW50aXRpZXMgcm9vdGVkIGluc2lkZSBpdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkOiBXb3JsZCwgcmVnaW9uPzogVm94ZWxSZWdpb24pOiBzdHJpbmcge1xuICBsZXQgZW50aXRpZXM6IEVudGl0eVtdO1xuICBpZiAocmVnaW9uKSB7XG4gICAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gICAgZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgICBlbnRpdGllcyA9IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uZmlsdGVyKFxuICAgICAgKGUpID0+IGUueCA+PSByLngwICYmIGUueCA8IHIueDEgKyAxICYmIGUueiA+PSByLnowICYmIGUueiA8IHIuejEgKyAxLFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgZW50aXRpZXMgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldO1xuICB9XG4gIGVudGl0aWVzLnNvcnQoKGEsIGIpID0+IChhLmlkIDwgYi5pZCA/IC0xIDogYS5pZCA+IGIuaWQgPyAxIDogMCkpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjplbnRpdHktc3RhdGU6djEnKTtcbiAgaC51MzIoZW50aXRpZXMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBlIG9mIGVudGl0aWVzKSBoYXNoRW50aXR5KGgsIGUpO1xuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuLyoqXG4gKiBDYW5vbmljYWwgaGFzaCBvZiBidWlsdCBzdHJ1Y3R1cmVzLiBMYXlvdXQgbW9kdWxlcyBhbmQgcGFpZCBjb3N0cyBhcmVcbiAqIGF1dGhvcml0YXRpdmUgc2ltdWxhdGlvbiBzdGF0ZTsgcmVuZGVyZXIgbWVzaGVzIGFyZSBub3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoKHdvcmxkOiBXb3JsZCk6IHN0cmluZyB7XG4gIGNvbnN0IHN0cnVjdHVyZXMgPSBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV1cbiAgICAuc29ydCgoYSwgYikgPT4gKGEuaWQgPCBiLmlkID8gLTEgOiBhLmlkID4gYi5pZCA/IDEgOiAwKSk7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnN0cnVjdHVyZS1zdGF0ZTp2MScpO1xuICBoLnUzMihzdHJ1Y3R1cmVzLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgcyBvZiBzdHJ1Y3R1cmVzKSB7XG4gICAgaC5zdHJpbmcocy5pZCk7XG4gICAgaC5zdHJpbmcocy5raW5kKTtcbiAgICBoLnN0cmluZyhzLnNpdGVJZCk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnggKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnkgKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnogKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnJvdCAqIDEwMDAwKSk7XG4gICAgLy8gTGVnYWN5IGhhc2ggaW5wdXQgaXMgYnl0ZS1pZGVudGljYWwuIERlc2lnbiAyIGFkZHMgYW4gZXhwbGljaXQgdGFnLlxuICAgIGlmIChzLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIGguc3RyaW5nKCdkZXNpZ246MicpO1xuICAgIGgudTMyKHMubW9kdWxlcy5sZW5ndGgpO1xuICAgIGZvciAoY29uc3QgbSBvZiBzLm1vZHVsZXMpIHtcbiAgICAgIGguc3RyaW5nKG0ua2luZCk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS55ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnogKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0udyAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS5oICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLmQgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKChtLnJvdCA/PyAwKSAqIDEwMDAwKSk7XG4gICAgICBoLnN0cmluZyhtLnRvbmUgPz8gJycpO1xuICAgIH1cbiAgICBjb25zdCBjb3N0S2V5cyA9IE9iamVjdC5rZXlzKHMuY29zdCkuc29ydCgpO1xuICAgIGgudTMyKGNvc3RLZXlzLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgY29zdEtleXMpIHtcbiAgICAgIGguc3RyaW5nKGtleSk7XG4gICAgICBoLnUzMihzLmNvc3Rba2V5IGFzIGtleW9mIHR5cGVvZiBzLmNvc3RdID8/IDApO1xuICAgIH1cbiAgICBoLnUzMihzLmJ1aWx0UmV2aXNpb24pO1xuICB9XG4gIHJldHVybiBoLmhleCgpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlSGFzaCB7XG4gIGhhc2g6IHN0cmluZztcbiAgY29sdW1uczogbnVtYmVyO1xuICBjaHVua3M6IG51bWJlcjtcbn1cblxuLyoqIERlcml2ZWQgY29sdW1uLWNhY2hlIGhhc2guIE5vdCBhdXRob3JpdGF0aXZlIHRlcnJhaW4gc3RhdGUuICovXG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlZENhY2hlSGFzaCh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24pOiBDYWNoZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOmRlcml2ZWQtY29sdW1uLWNhY2hlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpO1xuICBsZXQgY29sdW1ucyA9IDA7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICAgIGgudTMyKGNodW5rLmhlaWdodHNbY29sXSk7XG4gICAgICAgIGgudTMyKGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdKTtcbiAgICAgICAgY29sdW1ucysrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjb2x1bW5zLCBjaHVua3M6IGtleXMubGVuZ3RoIH07XG59XG5cbi8qKlxuICogUmVjb21wdXRlIGV2ZXJ5IGNvbHVtbiBjYWNoZSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHZveGVsIGRhdGEgYW5kIHJlcG9ydFxuICogbWlzbWF0Y2hlcy4gVGhpcyBwcm92ZXMgaGVpZ2h0cy90b3BNYXRlcmlhbHMgYXJlIGRlcml2ZWQsIG5vdCBhIHNlY29uZFxuICogdGVycmFpbiByZXByZXNlbnRhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRGVyaXZlZENhY2hlcyh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24sIGxpbWl0ID0gNjQpOiBDYWNoZU1pc21hdGNoW10ge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IG91dDogQ2FjaGVNaXNtYXRjaFtdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSBjb250aW51ZTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgICAgbGV0IHRvcE1hdCA9IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdO1xuICAgICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXhwZWN0ZWRIZWlnaHQgPSB0b3BTb2xpZCAtIFlfTUlOO1xuICAgICAgICBpZiAoY2h1bmsuaGVpZ2h0c1tjb2xdICE9PSBleHBlY3RlZEhlaWdodCkge1xuICAgICAgICAgIG91dC5wdXNoKHsgeDogb3ggKyBseCwgejogb3ogKyBseiwgZmllbGQ6ICdoZWlnaHQnLCBleHBlY3RlZDogZXhwZWN0ZWRIZWlnaHQsIGFjdHVhbDogY2h1bmsuaGVpZ2h0c1tjb2xdIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjaHVuay50b3BNYXRlcmlhbHNbY29sXSAhPT0gdG9wTWF0KSB7XG4gICAgICAgICAgb3V0LnB1c2goeyB4OiBveCArIGx4LCB6OiBveiArIGx6LCBmaWVsZDogJ21hdGVyaWFsJywgZXhwZWN0ZWQ6IHRvcE1hdCwgYWN0dWFsOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3V0Lmxlbmd0aCA+PSBsaW1pdCkgcmV0dXJuIG91dDtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBFZGl0T3V0c2lkZSB7XG4gIGNodW5rOiBzdHJpbmc7XG4gIGluZGV4OiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIG1hdGVyaWFsOiBudW1iZXI7XG59XG5cbi8qKiBFdmVyeSByZWNvcmRlZCB2b3hlbCBlZGl0IG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0c091dHNpZGVFbnZlbG9wZSh3b3JsZDogV29ybGQsIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogRWRpdE91dHNpZGVbXSB7XG4gIGNvbnN0IG91dDogRWRpdE91dHNpZGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGVkaXRzXSBvZiB3b3JsZC5lZGl0cykge1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gICAgZm9yIChjb25zdCBbaW5kZXgsIG1hdGVyaWFsXSBvZiBlZGl0cykge1xuICAgICAgY29uc3QgbHggPSBpbmRleCAlIENIVU5LX1NJWkU7XG4gICAgICBjb25zdCBseiA9IE1hdGguZmxvb3IoKGluZGV4ICUgQ0hVTktfQVJFQSkgLyBDSFVOS19TSVpFKTtcbiAgICAgIGNvbnN0IHlpID0gTWF0aC5mbG9vcihpbmRleCAvIENIVU5LX0FSRUEpO1xuICAgICAgY29uc3QgeCA9IG94ICsgbHgsIHogPSBveiArIGx6LCB5ID0gWV9NSU4gKyB5aTtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhlbnZlbG9wZSwgeCwgeSwgeikpIHtcbiAgICAgICAgb3V0LnB1c2goeyBjaHVuazoga2V5LCBpbmRleCwgeCwgeSwgeiwgbWF0ZXJpYWwgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIG91dC5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykgfHwgYS5pbmRleCAtIGIuaW5kZXgpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vKiogTmV3IGNodW5rcyBnZW5lcmF0ZWQgc2luY2UgdGhlIGJhc2VsaW5lIHRoYXQgZG8gbm90IG92ZXJsYXAgdGhlIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5ld0NodW5rc091dHNpZGVFbnZlbG9wZShcbiAgd29ybGQ6IFdvcmxkLCBiYXNlbGluZUtleXM6IEl0ZXJhYmxlPHN0cmluZz4sIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdLFxuKTogc3RyaW5nW10ge1xuICBjb25zdCBiYXNlbGluZSA9IG5ldyBTZXQoYmFzZWxpbmVLZXlzKTtcbiAgY29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGNodW5rXSBvZiB3b3JsZC5jaHVua3MpIHtcbiAgICBpZiAoYmFzZWxpbmUuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IG92ZXJsYXBzID0gZW52ZWxvcGUuc29tZShcbiAgICAgIChyKSA9PiBveCA8PSByLngxICYmIG94ICsgQ0hVTktfU0laRSAtIDEgPj0gci54MCAmJiBveiA8PSByLnoxICYmIG96ICsgQ0hVTktfU0laRSAtIDEgPj0gci56MCxcbiAgICApO1xuICAgIGlmICghb3ZlcmxhcHMpIG91dC5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIG91dC5zb3J0KCk7XG59XG5cbi8qKiBBbGwgY2h1bmsga2V5cyBjdXJyZW50bHkgbWF0ZXJpYWxpc2VkLCBzb3J0ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gY2h1bmtLZXlzKHdvcmxkOiBXb3JsZCk6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIFsuLi53b3JsZC5jaHVua3Mua2V5cygpXS5zb3J0KCk7XG59XG5cbi8qKiBCb3VuZGluZyB2b3hlbCByZWdpb24gY292ZXJpbmcgZXZlcnkgbWF0ZXJpYWxpc2VkIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkQ2h1bmtSZWdpb24od29ybGQ6IFdvcmxkKTogVm94ZWxSZWdpb24ge1xuICBpZiAod29ybGQuY2h1bmtzLnNpemUgPT09IDApIHRocm93IG5ldyBFcnJvcignd29ybGQgaGFzIG5vIGNodW5rcycpO1xuICBsZXQgbWluQ3ggPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN4ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBsZXQgbWluQ3ogPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN6ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IGNodW5rIG9mIHdvcmxkLmNodW5rcy52YWx1ZXMoKSkge1xuICAgIG1pbkN4ID0gTWF0aC5taW4obWluQ3gsIGNodW5rLmN4KTsgbWF4Q3ggPSBNYXRoLm1heChtYXhDeCwgY2h1bmsuY3gpO1xuICAgIG1pbkN6ID0gTWF0aC5taW4obWluQ3osIGNodW5rLmN6KTsgbWF4Q3ogPSBNYXRoLm1heChtYXhDeiwgY2h1bmsuY3opO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDA6IGNodW5rT3JpZ2luWChtaW5DeCksXG4gICAgejA6IGNodW5rT3JpZ2luWihtaW5DeiksXG4gICAgeDE6IGNodW5rT3JpZ2luWChtYXhDeCkgKyBDSFVOS19TSVpFIC0gMSxcbiAgICB6MTogY2h1bmtPcmlnaW5aKG1heEN6KSArIENIVU5LX1NJWkUgLSAxLFxuICAgIHkwOiBZX01JTixcbiAgICB5MTogWV9NQVggLSAxLFxuICB9O1xufVxuIiwgIi8vIE0wMDIgZGV0ZXJtaW5pc3RpYyBmaXh0dXJlIGFuZCBsaXZlLXdvcmxkIGxheW91dC5cbi8vXG4vLyBUaGUgZml4dHVyZSBpcyBhIGJvdW5kZWQgc2xpY2Ugb2YgdGhlIHJlYWwgMjA0OCBtIHdvcmxkIChzZWVkIDEzMzcpLCBub3QgYVxuLy8gc3ludGhldGljIGhlaWdodGZpZWxkLiBJdCBjb250YWluczpcbi8vICAgKiBhIHJlamVjdGVkIGhvdXNlIHNpdGUgb24gYSA3IG0gcml2ZXItYmFuayBzbG9wZTtcbi8vICAgKiBhIHZpYWJsZSBob3VzZSBzaGVsZiAyMCBtIGF3YXkgd2l0aCAyIG0gcmVsaWVmIGFuZCBubyBjbGVhcmluZyBuZWVkZWQ7XG4vLyAgICogYSAzIG0gZmFybSBzbG9wZSAyNyBtIGZyb20gdGhlIGhvdXNlIHdpdGggYSBuYXR1cmFsIGJsb3Nzb20gdHJlZSBhbmQgb3JlLlxuLy9cbi8vIFRoZSBzYW1lIGNvb3JkaW5hdGVzLCBxdWVyaWVzIGFuZCB2YWxpZGF0b3JzIGFyZSB1c2VkIGJ5IHRoZSBsaXZlLXdvcmxkXG4vLyBhY2NlcHRhbmNlIHRlc3QuIFRoZSBvbmx5IGRpZmZlcmVuY2UgaXMgaG93IG1hbnkgY2h1bmtzIGFyZSBtYXRlcmlhbGlzZWQuXG5pbXBvcnQge1xuICBXb3JsZCwgY3JlYXRlV29ybGQsIGdlbmVyYXRlV29ybGQsIGdlbmVyYXRlQ2h1bmssIHBsYWNlQXV0aG9yZWRTaXRlcyxcbiAgWV9NSU4sIFlfTUFYLCBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWixcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBSZWN0LCBWb3hlbFJlZ2lvbiB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBjaHVua0tleXMgfSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBNMDAyX1NFRUQgPSAxMzM3O1xuXG4vKiogUGlubmVkIHBhdGggc2l0ZSBpZCBmb3IgdGhlIGRvb3ItdG8tYXBwcm9hY2ggY29ycmlkb3IuICovXG5leHBvcnQgY29uc3QgTTAwMl9QQVRIX1NJVEVfSUQgPSAncGF0aC1ob3VzZS1mYXJtJztcblxuLyoqXG4gKiBQaW5uZWQgc3RlcHBlZCBwcm9maWxlIGZvciB0aGUgOSBtIHBhdGggZnJvbSB0aGUgaG91c2UgZG9vciAoeCA9IC01MykgdG8gdGhlXG4gKiBhcHByb2FjaCAoeCA9IC00NSkuIFRoZSByaXNlIGlzIDIgbSBvdmVyIDggbTsgZXZlcnkgc3RlcCBpcyBhdCBtb3N0IDEgbS5cbiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfUEFUSF9QUk9GSUxFID0gWzExLCAxMSwgMTEsIDEyLCAxMiwgMTIsIDEyLCAxMywgMTNdIGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIFRlcnJhY2VCYW5kU3BlYyB7XG4gIHowOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuLyoqIFBpbm5lZCBmYXJtIHRlcnJhY2VzLCBoaWdoIHNpZGUgZmlyc3QuICovXG5leHBvcnQgY29uc3QgTTAwMl9URVJSQUNFX0JBTkRTOiByZWFkb25seSBUZXJyYWNlQmFuZFNwZWNbXSA9IFtcbiAgeyB6MDogLTQyLCB6MTogLTQwLCB5OiAxNiB9LFxuICB7IHowOiAtMzksIHoxOiAtMzcsIHk6IDE1IH0sXG4gIHsgejA6IC0zNiwgejE6IC0zNSwgeTogMTQgfSxcbl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVNwZWMge1xuICBpZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgZG9vcjogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZhcm1TcGVjIHtcbiAgaWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgdGVycmFjZXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyTGF5b3V0IHtcbiAgc2VlZDogbnVtYmVyO1xuICByZWplY3RlZDogU2l0ZVNwZWM7XG4gIGhvdXNlOiBTaXRlU3BlYztcbiAgZmFybTogRmFybVNwZWM7XG4gIHNlYXJjaEFyZWE6IFJlY3Q7XG4gIHdvcmtab25lOiBSZWN0O1xuICBmaXh0dXJlQ2h1bmtzOiB7IGN4MDogbnVtYmVyOyBjejA6IG51bWJlcjsgY3gxOiBudW1iZXI7IGN6MTogbnVtYmVyIH07XG4gIHByb3RlY3RlZFJlZ2lvbjogVm94ZWxSZWdpb247XG4gIC8qKiBDb21wbGV0ZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUgZm9yIHRoZSBmaXJzdCBzbGljZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG59XG5cbmNvbnN0IEZJWFRVUkVfQ0hVTktTID0geyBjeDA6IDI4LCBjejA6IDI5LCBjeDE6IDMyLCBjejE6IDMyIH0gYXMgY29uc3Q7XG5cbmV4cG9ydCBjb25zdCBNMDAyX0xBWU9VVDogTTAwMkxheW91dCA9IHtcbiAgc2VlZDogTTAwMl9TRUVELFxuICByZWplY3RlZDoge1xuICAgIGlkOiAnc2l0ZS1hLXJlamVjdGVkJyxcbiAgICByZWN0OiB7IHgwOiAtNzQsIHowOiAtNjYsIHgxOiAtNjcsIHoxOiAtNjEgfSxcbiAgICAvLyBBIG5haXZlIGxvdy1zaWRlIGZsb29yOiB0aGUgdXBoaWxsIGNvcm5lciB3b3VsZCBuZWVkIDUgbSBvZiBleGNhdmF0aW9uLlxuICAgIGZsb29yWTogMyxcbiAgICBkb29yOiB7IHg6IC02NywgejogLTYzIH0sXG4gICAgYXBwcm9hY2g6IHsgeDogLTYwLCB6OiAtNjMgfSxcbiAgfSxcbiAgaG91c2U6IHtcbiAgICBpZDogJ3NpdGUtYi1ob3VzZScsXG4gICAgcmVjdDogeyB4MDogLTYwLCB6MDogLTQ2LCB4MTogLTUzLCB6MTogLTQxIH0sXG4gICAgZmxvb3JZOiAxMSxcbiAgICBkb29yOiB7IHg6IC01MywgejogLTQzIH0sXG4gICAgYXBwcm9hY2g6IHsgeDogLTQ1LCB6OiAtNDMgfSxcbiAgfSxcbiAgZmFybToge1xuICAgIGlkOiAnZmllbGQtYycsXG4gICAgcmVjdDogeyB4MDogLTM4LCB6MDogLTQyLCB4MTogLTI3LCB6MTogLTM1IH0sXG4gICAgdGVycmFjZXM6IDMsXG4gIH0sXG4gIHNlYXJjaEFyZWE6IHsgeDA6IC03NiwgejA6IC02OCwgeDE6IC00MCwgejE6IC00MCB9LFxuICB3b3JrWm9uZTogeyB4MDogLTc2LCB6MDogLTY4LCB4MTogLTIzLCB6MTogLTMxIH0sXG4gIGZpeHR1cmVDaHVua3M6IEZJWFRVUkVfQ0hVTktTLFxuICBwcm90ZWN0ZWRSZWdpb246IHtcbiAgICB4MDogY2h1bmtPcmlnaW5YKEZJWFRVUkVfQ0hVTktTLmN4MCksXG4gICAgejA6IGNodW5rT3JpZ2luWihGSVhUVVJFX0NIVU5LUy5jejApLFxuICAgIHgxOiBjaHVua09yaWdpblgoRklYVFVSRV9DSFVOS1MuY3gxKSArIDMxLFxuICAgIHoxOiBjaHVua09yaWdpblooRklYVFVSRV9DSFVOS1MuY3oxKSArIDMxLFxuICAgIHkwOiBZX01JTixcbiAgICB5MTogWV9NQVggLSAxLFxuICB9LFxuICBlbnZlbG9wZTogW1xuICAgIC8vIEhvdXNlIGZvb3RwcmludCBwbHVzIGEgMiBtIHByZXBhcmF0aW9uIGJ1ZmZlci5cbiAgICB7IHgwOiAtNjIsIHowOiAtNDgsIHgxOiAtNTEsIHoxOiAtMzksIHkwOiA4LCB5MTogMTYgfSxcbiAgICAvLyBEb29yLXRvLWFwcHJvYWNoIHBhdGggY29ycmlkb3IgcGx1cyBhIDEgbSBidWZmZXIuXG4gICAgeyB4MDogLTU0LCB6MDogLTQ0LCB4MTogLTQ0LCB6MTogLTQyLCB5MDogOSwgeTE6IDE1IH0sXG4gICAgLy8gRmFybSBmb290cHJpbnQgcGx1cyBhIDIgbSBwcmVwYXJhdGlvbiBidWZmZXIuXG4gICAgeyB4MDogLTQwLCB6MDogLTQ0LCB4MTogLTI1LCB6MTogLTMzLCB5MDogMTAsIHkxOiAyMCB9LFxuICBdLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBNMDAyV29ybGQge1xuICB3b3JsZDogV29ybGQ7XG4gIGxheW91dDogTTAwMkxheW91dDtcbiAgLyoqIFNvcnRlZCBjaHVuayBrZXlzIG1hdGVyaWFsaXNlZCBhdCBmaXh0dXJlIGNyZWF0aW9uLiAqL1xuICBjaHVua0tleXM6IHN0cmluZ1tdO1xufVxuXG4vKipcbiAqIFNtYWxsIGRldGVybWluaXN0aWMgZml4dHVyZTogdGhlIDIwIGNodW5rcyBjb3ZlcmluZyB0aGUgd29yayB6b25lIGFuZCBpdHNcbiAqIHByb3RlY3RlZCBzdXJyb3VuZGluZ3MuIEZhc3QgZW5vdWdoIGZvciB0aGUgZnVsbCB0ZXN0IHN1aXRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTTAwMkZpeHR1cmUoc2VlZCA9IE0wMDJfU0VFRCk6IE0wMDJXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCk7XG4gIGNvbnN0IHsgY3gwLCBjejAsIGN4MSwgY3oxIH0gPSBNMDAyX0xBWU9VVC5maXh0dXJlQ2h1bmtzO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykgZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4geyB3b3JsZCwgbGF5b3V0OiBNMDAyX0xBWU9VVCwgY2h1bmtLZXlzOiBjaHVua0tleXMod29ybGQpIH07XG59XG5cbi8qKlxuICogTGl2ZS13b3JsZCBpbnRlZ3JhdGlvbiB0YXJnZXQ6IHRoZSBzYW1lIHNlZWQgYW5kIHNpdGVzIHdpdGggYSA5IHggOSBjaHVua1xuICogbmVpZ2hib3VyaG9vZCAoODEgY2h1bmtzKSBhcm91bmQgdGhlIGZvdW5kZXIgdmFsbGV5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTTAwMkxpdmUoc2VlZCA9IE0wMDJfU0VFRCwgcmFkaXVzID0gNCk6IE0wMDJXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gZ2VuZXJhdGVXb3JsZChzZWVkLCByYWRpdXMpO1xuICByZXR1cm4geyB3b3JsZCwgbGF5b3V0OiBNMDAyX0xBWU9VVCwgY2h1bmtLZXlzOiBjaHVua0tleXMod29ybGQpIH07XG59XG4iLCAiLy8gTTAwMiBzdGFnZSA3IHNjZW5hcmlvIHdpcmluZzogdGhlIHBpbm5lZCBmaXJzdCBzbGljZSwgcnVuIHRocm91Z2ggdGhlIHNhbWVcbi8vIHB1YmxpYyBzaW11bGF0aW9uIHBpcGVsaW5lIHVzZWQgYnkgdGhlIHBsYXllciwgdGhlIEFJIGFuZCB0aGUgdGVzdHMuXG4vL1xuLy8gVGhlIHNjZW5hcmlvIGlzIGRlbGliZXJhdGVseSBwbGFpbiBkYXRhIGluIC8gZGF0YSBvdXQuIEl0IGRvZXMgbm90IHRvdWNoIHRoZVxuLy8gcmVuZGVyZXIsIGFuZCBldmVyeSB0ZXJyYWluIGVkaXQgc3RpbGwgZ29lcyB0aHJvdWdoIHByZXBhcmVTaXRlIC0+XG4vLyBMb2NhbEF1dGhvcml6ZXIgLT4gZXhlY3V0ZVByZXBhcmF0aW9uLiBTdHJ1Y3R1cmVzIHN0aWxsIGdvIHRocm91Z2hcbi8vIGJ1aWxkU3RydWN0dXJlIC0+IExvY2FsU3RydWN0dXJlQXV0aG9yaXplciAtPiBleGVjdXRlU3RydWN0dXJlLlxuaW1wb3J0IHsgTUFULCBSZXNvdXJjZVR5cGUgfSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIE0wMDJXb3JsZCwgTTAwMl9MQVlPVVQsIE0wMDJfUEFUSF9QUk9GSUxFLCBNMDAyX1BBVEhfU0lURV9JRCxcbiAgTTAwMl9URVJSQUNFX0JBTkRTLFxufSBmcm9tICcuL20wMDInO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBIT1VTRV9SVUxFUywgUEFUSF9SVUxFUywgRkFSTV9SVUxFUyB9IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7XG4gIENvbHVtblRhcmdldCwgTG9jYWxBdXRob3JpemVyLCBwcmVwYXJlU2l0ZSwgUHJlcGFyYXRpb25MZWRnZXIsXG59IGZyb20gJy4vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHtcbiAgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLCBidWlsZFN0cnVjdHVyZSwgU3RydWN0dXJlTGVkZ2VyLFxufSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHtcbiAgY2Fub25pY2FsRW50aXR5SGFzaCwgY2Fub25pY2FsSW52ZW50b3J5SGFzaCwgY2Fub25pY2FsUmVnaW9uSGFzaCxcbiAgY2Fub25pY2FsU3RydWN0dXJlSGFzaCwgaW52ZW50b3J5U25hcHNob3QsXG59IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IGNvbnN0IE0wMDJfU1RBUlRFUl9JTlZFTlRPUlk6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIG51bWJlcj4+ID0ge1xuICB3b29kOiAyNCxcbiAgc3RvbmU6IDQ4LFxufTtcblxuLyoqIFRoZSA5IHggMyBtIGNvcnJpZG9yIGZyb20gdGhlIGhvdXNlIGRvb3IgdG8gdGhlIGFwcHJvYWNoLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJQYXRoUmVjdCgpOiBSZWN0IHtcbiAgY29uc3QgZG9vciA9IE0wMDJfTEFZT1VULmhvdXNlLmRvb3I7XG4gIGNvbnN0IGFwcHJvYWNoID0gTTAwMl9MQVlPVVQuaG91c2UuYXBwcm9hY2g7XG4gIHJldHVybiB7XG4gICAgeDA6IGRvb3IueCxcbiAgICB6MDogZG9vci56IC0gMSxcbiAgICB4MTogYXBwcm9hY2gueCxcbiAgICB6MTogZG9vci56ICsgMSxcbiAgfTtcbn1cblxuLyoqIE9uZSB0YXJnZXQgcGVyIHBhdGggY29sdW1uLCB1c2luZyB0aGUgcGlubmVkIHN0ZXBwZWQgcHJvZmlsZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyUGF0aFRhcmdldHMoKTogQ29sdW1uVGFyZ2V0W10ge1xuICBjb25zdCByZWN0ID0gbTAwMlBhdGhSZWN0KCk7XG4gIGNvbnN0IHRhcmdldHM6IENvbHVtblRhcmdldFtdID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgTTAwMl9QQVRIX1BST0ZJTEUubGVuZ3RoOyBpKyspIHtcbiAgICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICAgIHRhcmdldHMucHVzaCh7IHg6IHJlY3QueDAgKyBpLCB6LCB5OiBNMDAyX1BBVEhfUFJPRklMRVtpXSB9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRhcmdldHM7XG59XG5cbi8qKiBPbmUgdGFyZ2V0IHBlciBmYXJtIGNvbHVtbiwgdXNpbmcgdGhlIHBpbm5lZCB0ZXJyYWNlIGJhbmRzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJGYXJtVGFyZ2V0cygpOiBDb2x1bW5UYXJnZXRbXSB7XG4gIGNvbnN0IHJlY3QgPSBNMDAyX0xBWU9VVC5mYXJtLnJlY3Q7XG4gIGNvbnN0IHRhcmdldHM6IENvbHVtblRhcmdldFtdID0gW107XG4gIGZvciAoY29uc3QgYmFuZCBvZiBNMDAyX1RFUlJBQ0VfQkFORFMpIHtcbiAgICBmb3IgKGxldCB6ID0gYmFuZC56MDsgeiA8PSBiYW5kLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgICAgICB0YXJnZXRzLnB1c2goeyB4LCB6LCB5OiBiYW5kLnkgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiB0YXJnZXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJTY2VuYXJpb09wdGlvbnMge1xuICAvKiogU3RhcnRlciByZXNvdXJjZXMgYmVmb3JlIHRoZSBzbGljZSBydW5zLiBEZWZhdWx0cyB0byB3b29kIDI0IC8gc3RvbmUgNDguICovXG4gIGludmVudG9yeT86IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMlNjZW5hcmlvU2l0ZSB7XG4gIHByZXBhcmF0aW9uOiBQcmVwYXJhdGlvbkxlZGdlciB8IG51bGw7XG4gIHN0cnVjdHVyZTogU3RydWN0dXJlTGVkZ2VyIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyU2NlbmFyaW9SZXN1bHQge1xuICBvazogYm9vbGVhbjtcbiAgZXJyb3JzOiBzdHJpbmdbXTtcbiAgaG91c2U6IE0wMDJTY2VuYXJpb1NpdGU7XG4gIHBhdGg6IE0wMDJTY2VuYXJpb1NpdGU7XG4gIGZhcm06IE0wMDJTY2VuYXJpb1NpdGU7XG4gIGludmVudG9yeUJlZm9yZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaW52ZW50b3J5QWZ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGhhc2hlczoge1xuICAgIHZveGVsczogc3RyaW5nO1xuICAgIHN0cnVjdHVyZXM6IHN0cmluZztcbiAgICBpbnZlbnRvcnk6IHN0cmluZztcbiAgICBlbnRpdGllczogc3RyaW5nO1xuICB9O1xufVxuXG5mdW5jdGlvbiBlbXB0eVNpdGUoKTogTTAwMlNjZW5hcmlvU2l0ZSB7XG4gIHJldHVybiB7IHByZXBhcmF0aW9uOiBudWxsLCBzdHJ1Y3R1cmU6IG51bGwgfTtcbn1cblxuZnVuY3Rpb24gZGVzY3JpYmVGYWlsdXJlKHJlc3VsdDogeyBjb2RlOiBzdHJpbmc7IHJlYXNvbnM6IHN0cmluZ1tdIH0pOiBzdHJpbmcge1xuICByZXR1cm4gYCR7cmVzdWx0LmNvZGV9OiAke3Jlc3VsdC5yZWFzb25zLmpvaW4oJzsgJyl9YDtcbn1cblxuLyoqXG4gKiBSdW4gaG91c2UsIHBhdGggYW5kIHRlcnJhY2VkIGZhcm0gaW4gdGhlaXIgcGlubmVkIG9yZGVyLiBBIGZhaWxlZCBzdGVwIGlzXG4gKiByZWNvcmRlZCBhbmQgbGF0ZXIgaW5kZXBlbmRlbnQgc3RlcHMgc3RpbGwgcnVuOyBhIHN0cnVjdHVyZSBpcyBuZXZlciBidWlsdFxuICogdW5sZXNzIGl0cyBvd24gdGVycmFpbiBwcmVwYXJhdGlvbiBzdWNjZWVkZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBydW5NMDAyU2NlbmFyaW8oXG4gIG0wMDI6IE0wMDJXb3JsZCwgb3B0aW9uczogTTAwMlNjZW5hcmlvT3B0aW9ucyA9IHt9LFxuKTogTTAwMlNjZW5hcmlvUmVzdWx0IHtcbiAgY29uc3QgeyB3b3JsZCwgbGF5b3V0IH0gPSBtMDAyO1xuICBjb25zdCBzdGFydGVyID0gb3B0aW9ucy5pbnZlbnRvcnkgPz8gTTAwMl9TVEFSVEVSX0lOVkVOVE9SWTtcbiAgd29ybGQuaW52ZW50b3J5ID0ge307XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHN0YXJ0ZXIpKSB7XG4gICAgaWYgKChhbW91bnQgPz8gMCkgPiAwKSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID0gYW1vdW50IGFzIG51bWJlcjtcbiAgfVxuXG4gIGNvbnN0IHByZXBBdXRob3JpemVyID0gbmV3IExvY2FsQXV0aG9yaXplcih7IGVudmVsb3BlOiBsYXlvdXQuZW52ZWxvcGUgfSk7XG4gIGNvbnN0IHN0cnVjdHVyZUF1dGhvcml6ZXIgPSBuZXcgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyKHsgZW52ZWxvcGU6IGxheW91dC5lbnZlbG9wZSB9KTtcbiAgY29uc3QgaW52ZW50b3J5QmVmb3JlID0gaW52ZW50b3J5U25hcHNob3Qod29ybGQpO1xuICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGhvdXNlID0gZW1wdHlTaXRlKCk7XG4gIGNvbnN0IHBhdGggPSBlbXB0eVNpdGUoKTtcbiAgY29uc3QgZmFybSA9IGVtcHR5U2l0ZSgpO1xuXG4gIGNvbnN0IGhvdXNlUHJlcCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwge1xuICAgIHNpdGVJZDogbGF5b3V0LmhvdXNlLmlkLFxuICAgIHJlY3Q6IGxheW91dC5ob3VzZS5yZWN0LFxuICAgIGZsb29yWTogbGF5b3V0LmhvdXNlLmZsb29yWSxcbiAgICBydWxlczogSE9VU0VfUlVMRVMsXG4gIH0pO1xuICBpZiAoIWhvdXNlUHJlcC5vaykge1xuICAgIGVycm9ycy5wdXNoKGBob3VzZSBwcmVwYXJhdGlvbjogJHtkZXNjcmliZUZhaWx1cmUoaG91c2VQcmVwKX1gKTtcbiAgfSBlbHNlIHtcbiAgICBob3VzZS5wcmVwYXJhdGlvbiA9IGhvdXNlUHJlcC5sZWRnZXI7XG4gICAgY29uc3QgaG91c2VCdWlsZCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCB7XG4gICAgICBzaXRlSWQ6IGxheW91dC5ob3VzZS5pZCxcbiAgICAgIGtpbmQ6ICdob3VzZScsXG4gICAgICByZWN0OiBsYXlvdXQuaG91c2UucmVjdCxcbiAgICAgIGZsb29yWTogbGF5b3V0LmhvdXNlLmZsb29yWSxcbiAgICAgIGRvb3I6IGxheW91dC5ob3VzZS5kb29yLFxuICAgIH0pO1xuICAgIGlmICghaG91c2VCdWlsZC5vaykge1xuICAgICAgZXJyb3JzLnB1c2goYGhvdXNlIHN0cnVjdHVyZTogJHtkZXNjcmliZUZhaWx1cmUoaG91c2VCdWlsZCl9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhvdXNlLnN0cnVjdHVyZSA9IGhvdXNlQnVpbGQubGVkZ2VyO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHBhdGhSZWN0ID0gbTAwMlBhdGhSZWN0KCk7XG4gIGNvbnN0IHBhdGhQcmVwID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCB7XG4gICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICByZWN0OiBwYXRoUmVjdCxcbiAgICBmbG9vclk6IDEyLFxuICAgIHJ1bGVzOiBQQVRIX1JVTEVTLFxuICB9LCB7XG4gICAgdGFyZ2V0czogbTAwMlBhdGhUYXJnZXRzKCksXG4gICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuR1JBVkVMLFxuICAgIGVudmVsb3BlOiBbbGF5b3V0LmVudmVsb3BlWzFdXSxcbiAgfSk7XG4gIGlmICghcGF0aFByZXAub2spIHtcbiAgICBlcnJvcnMucHVzaChgcGF0aCBwcmVwYXJhdGlvbjogJHtkZXNjcmliZUZhaWx1cmUocGF0aFByZXApfWApO1xuICB9IGVsc2Uge1xuICAgIHBhdGgucHJlcGFyYXRpb24gPSBwYXRoUHJlcC5sZWRnZXI7XG4gICAgY29uc3QgcGF0aEJ1aWxkID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHtcbiAgICAgIHNpdGVJZDogTTAwMl9QQVRIX1NJVEVfSUQsXG4gICAgICBraW5kOiAncGF0aCcsXG4gICAgICByZWN0OiBwYXRoUmVjdCxcbiAgICAgIGZsb29yWTogMTIsXG4gICAgfSk7XG4gICAgaWYgKCFwYXRoQnVpbGQub2spIHtcbiAgICAgIGVycm9ycy5wdXNoKGBwYXRoIHN0cnVjdHVyZTogJHtkZXNjcmliZUZhaWx1cmUocGF0aEJ1aWxkKX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcGF0aC5zdHJ1Y3R1cmUgPSBwYXRoQnVpbGQubGVkZ2VyO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZhcm1QcmVwID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCB7XG4gICAgc2l0ZUlkOiBsYXlvdXQuZmFybS5pZCxcbiAgICByZWN0OiBsYXlvdXQuZmFybS5yZWN0LFxuICAgIGZsb29yWTogMTUsXG4gICAgcnVsZXM6IEZBUk1fUlVMRVMsXG4gIH0sIHtcbiAgICB0YXJnZXRzOiBtMDAyRmFybVRhcmdldHMoKSxcbiAgICBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5TT0lMLFxuICAgIGVudmVsb3BlOiBbbGF5b3V0LmVudmVsb3BlWzJdXSxcbiAgfSk7XG4gIGlmICghZmFybVByZXAub2spIHtcbiAgICBlcnJvcnMucHVzaChgZmFybSBwcmVwYXJhdGlvbjogJHtkZXNjcmliZUZhaWx1cmUoZmFybVByZXApfWApO1xuICB9IGVsc2Uge1xuICAgIGZhcm0ucHJlcGFyYXRpb24gPSBmYXJtUHJlcC5sZWRnZXI7XG4gICAgY29uc3QgZmFybUJ1aWxkID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHtcbiAgICAgIHNpdGVJZDogbGF5b3V0LmZhcm0uaWQsXG4gICAgICBraW5kOiAndGVycmFjZScsXG4gICAgICByZWN0OiBsYXlvdXQuZmFybS5yZWN0LFxuICAgICAgZmxvb3JZOiAxNSxcbiAgICAgIHRlcnJhY2VzOiBsYXlvdXQuZmFybS50ZXJyYWNlcyxcbiAgICB9KTtcbiAgICBpZiAoIWZhcm1CdWlsZC5vaykge1xuICAgICAgZXJyb3JzLnB1c2goYGZhcm0gc3RydWN0dXJlOiAke2Rlc2NyaWJlRmFpbHVyZShmYXJtQnVpbGQpfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBmYXJtLnN0cnVjdHVyZSA9IGZhcm1CdWlsZC5sZWRnZXI7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogZXJyb3JzLmxlbmd0aCA9PT0gMCxcbiAgICBlcnJvcnMsXG4gICAgaG91c2UsXG4gICAgcGF0aCxcbiAgICBmYXJtLFxuICAgIGludmVudG9yeUJlZm9yZSxcbiAgICBpbnZlbnRvcnlBZnRlcjogaW52ZW50b3J5U25hcHNob3Qod29ybGQpLFxuICAgIGhhc2hlczoge1xuICAgICAgdm94ZWxzOiBjYW5vbmljYWxSZWdpb25IYXNoKHdvcmxkLCBsYXlvdXQucHJvdGVjdGVkUmVnaW9uKS5oYXNoLFxuICAgICAgc3RydWN0dXJlczogY2Fub25pY2FsU3RydWN0dXJlSGFzaCh3b3JsZCksXG4gICAgICBpbnZlbnRvcnk6IGNhbm9uaWNhbEludmVudG9yeUhhc2god29ybGQpLFxuICAgICAgZW50aXRpZXM6IGNhbm9uaWNhbEVudGl0eUhhc2god29ybGQsIGxheW91dC5wcm90ZWN0ZWRSZWdpb24pLFxuICAgIH0sXG4gIH07XG59XG5cbi8qKiBUb3RhbCByZXNvdXJjZXMgcGFpZCB0byBzdHJ1Y3R1cmVzIGluIGEgc2NlbmFyaW8gcmVzdWx0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJTdHJ1Y3R1cmVDb3N0cyhyZXN1bHQ6IE0wMDJTY2VuYXJpb1Jlc3VsdCk6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4ge1xuICBjb25zdCB0b3RhbDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHt9O1xuICBmb3IgKGNvbnN0IHNpdGUgb2YgW3Jlc3VsdC5ob3VzZSwgcmVzdWx0LnBhdGgsIHJlc3VsdC5mYXJtXSkge1xuICAgIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHNpdGUuc3RydWN0dXJlPy5jb3N0UGFpZCA/PyB7fSkpIHtcbiAgICAgIHRvdGFsW3Jlc291cmNlIGFzIFJlc291cmNlVHlwZV0gPSAodG90YWxbcmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlXSA/PyAwKSArIChhbW91bnQgPz8gMCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB0b3RhbDtcbn1cbiIsICIvLyBTY2hlbWEtMyBsaWZlIGxvb3AuIEFsbCBxdWFudGl0aWVzIGFyZSBpbnRlZ2VycyBhbmQgYWxsIG11dGF0aW9ucyBhcmUgZHJpdmVuXG4vLyBieSBhY2NlcHRlZCBjb21tYW5kczsgd2FsbC1jbG9jayB0aW1lIGFuZCByZW5kZXJpbmcgbmV2ZXIgYWR2YW5jZSB0aGlzIHN0YXRlLlxuaW1wb3J0IHR5cGUgeyBXb3JsZCB9IGZyb20gJy4vd29ybGQnO1xuXG5leHBvcnQgY29uc3QgTElGRV9SRVNPVVJDRVMgPSBbJ2ZpYmVyJywgJ2Zvb2QnLCAnb3JlJywgJ3JhdGlvbnMnLCAnc2VlZCcsICdzdG9uZScsICd3b29kJ10gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBMaWZlUmVzb3VyY2UgPSAodHlwZW9mIExJRkVfUkVTT1VSQ0VTKVtudW1iZXJdO1xuZXhwb3J0IGNvbnN0IENBUlJJRURfQ0FQQUNJVFkgPSAxMjA7XG5leHBvcnQgY29uc3QgU1RPQ0tQSUxFX0NBUEFDSVRZID0gMjAwO1xuZXhwb3J0IGNvbnN0IE1BWF9QUk9EVUNUSU9OX0pPQlMgPSAxNjtcbmV4cG9ydCBjb25zdCBNQVhfVElDS1NfUEVSX0NPTU1BTkQgPSA2NDtcbmV4cG9ydCBjb25zdCBDUk9QX0dST1dUSF9USUNLUyA9IDQ7XG4vKiogRml4ZWQgaGFydmVzdCBmcm9tIG9uZSByZWFkeSBjcm9wIHBsb3QuIEpvdXJuYWwgb3V0Y29tZXMgbXVzdCBtYXRjaCBpdCBleGFjdGx5LiAqL1xuZXhwb3J0IGNvbnN0IENST1BfWUlFTEQgPSB7IGZvb2Q6IDYsIGZpYmVyOiAxIH0gYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgQ1JPUF9ZSUVMRF9MQUJFTCA9IGAke0NST1BfWUlFTEQuZm9vZH0gZm9vZCArICR7Q1JPUF9ZSUVMRC5maWJlcn0gZmliZXJgO1xuZXhwb3J0IGNvbnN0IEZPVU5ERVJfU1RPQ0tQSUxFX0lEID0gJ3N0b2NrcGlsZTpmb3VuZGVyJztcbmV4cG9ydCBjb25zdCBGT1VOREVSX1NUT0NLUElMRSA9IHsgaWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCB4OiAtNTAsIHo6IC0zMiwgY2FwYWNpdHk6IFNUT0NLUElMRV9DQVBBQ0lUWSB9IGFzIGNvbnN0O1xuXG5leHBvcnQgdHlwZSBMaWZlUmVzb3VyY2VCYWcgPSBQYXJ0aWFsPFJlY29yZDxMaWZlUmVzb3VyY2UsIG51bWJlcj4+O1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b2NrcGlsZSB7XG4gIGlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBjYXBhY2l0eTogdHlwZW9mIFNUT0NLUElMRV9DQVBBQ0lUWTtcbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xufVxuXG5leHBvcnQgdHlwZSBSZWNpcGVJZCA9ICdzZWVkJyB8ICdyYXRpb25zJztcbmV4cG9ydCBjb25zdCBSRUNJUEVTOiBSZWNvcmQ8UmVjaXBlSWQsIHsgaW5wdXQ6IExpZmVSZXNvdXJjZUJhZzsgb3V0cHV0OiBMaWZlUmVzb3VyY2VCYWc7IHRpY2tzOiBudW1iZXIgfT4gPSB7XG4gIHNlZWQ6IHsgaW5wdXQ6IHsgZmliZXI6IDIgfSwgb3V0cHV0OiB7IHNlZWQ6IDMgfSwgdGlja3M6IDEgfSxcbiAgcmF0aW9uczogeyBpbnB1dDogeyBmb29kOiAyIH0sIG91dHB1dDogeyByYXRpb25zOiAzIH0sIHRpY2tzOiAyIH0sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFByb2R1Y3Rpb25Kb2Ige1xuICBpZDogc3RyaW5nO1xuICBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICByZWNpcGU6IFJlY2lwZUlkO1xuICByZW1haW5pbmdUaWNrczogbnVtYmVyO1xufVxuXG4vKiogRml4ZWQgcGxvdHMgY29ycmVzcG9uZCB0byB0aGUgbmluZSBhdXRob3JpdGF0aXZlIHRlcnJhY2UgY3JvcC1yb3cgdm9sdW1lcy4gKi9cbmV4cG9ydCBjb25zdCBDUk9QX1BMT1RfSURTID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogOSB9LCAoXywgaSkgPT4gYGNyb3A6JHtpfWApO1xuZXhwb3J0IGludGVyZmFjZSBDcm9wUGxvdCB7XG4gIGlkOiBzdHJpbmc7XG4gIHBsYW50ZWRUaWNrOiBudW1iZXI7XG4gIGdyb3d0aFRpY2tzOiB0eXBlb2YgQ1JPUF9HUk9XVEhfVElDS1M7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlmZVN0YXRlIHtcbiAgc3RvY2twaWxlczogTWFwPHN0cmluZywgU3RvY2twaWxlPjtcbiAgam9iczogTWFwPHN0cmluZywgUHJvZHVjdGlvbkpvYj47XG4gIGNyb3BzOiBNYXA8c3RyaW5nLCBDcm9wUGxvdD47XG4gIHRpY2s6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxpZmVTdGF0ZSgpOiBMaWZlU3RhdGUge1xuICByZXR1cm4ge1xuICAgIHN0b2NrcGlsZXM6IG5ldyBNYXAoW1tGT1VOREVSX1NUT0NLUElMRV9JRCwge1xuICAgICAgaWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCB4OiBGT1VOREVSX1NUT0NLUElMRS54LCB6OiBGT1VOREVSX1NUT0NLUElMRS56LFxuICAgICAgY2FwYWNpdHk6IFNUT0NLUElMRV9DQVBBQ0lUWSwgaW52ZW50b3J5OiB7fSxcbiAgICB9XV0pLCBqb2JzOiBuZXcgTWFwKCksIGNyb3BzOiBuZXcgTWFwKCksIHRpY2s6IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3RhbChiYWc6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pOiBudW1iZXIge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyhiYWcpLnJlZHVjZSgoc3VtLCBhbW91bnQpID0+IHN1bSArIGFtb3VudCwgMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZUJhZyhiYWc6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgcmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhiYWcpLmZpbHRlcigoWywgYW1vdW50XSkgPT4gYW1vdW50ID4gMClcbiAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGlmZVN0YXRlKHdvcmxkOiBXb3JsZCk6IExpZmVTdGF0ZSB7XG4gIGlmICghd29ybGQubGlmZSkgdGhyb3cgbmV3IEVycm9yKCdsaWZlLWxvb3AgY29tbWFuZHMgcmVxdWlyZSBhIHNjaGVtYS0zIHdvcmxkJyk7XG4gIHJldHVybiB3b3JsZC5saWZlO1xufVxuXG5leHBvcnQgdHlwZSBMaWZlRmFpbHVyZSA9IHsgb2s6IGZhbHNlOyBjb2RlOiBzdHJpbmc7IHJlYXNvbnM6IHN0cmluZ1tdIH07XG5leHBvcnQgdHlwZSBMaWZlU3VjY2VzczxUPiA9IHsgb2s6IHRydWU7IHZhbHVlOiBUIH07XG5leHBvcnQgdHlwZSBMaWZlUmVzdWx0PFQ+ID0gTGlmZVN1Y2Nlc3M8VD4gfCBMaWZlRmFpbHVyZTtcbmZ1bmN0aW9uIHJlamVjdExpZmUoY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IExpZmVGYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBjb2RlLCByZWFzb25zIH07XG59XG50eXBlIFBhcnNlZEFtb3VudCA9IHsgb2s6IHRydWU7IHJlc291cmNlOiBMaWZlUmVzb3VyY2U7IGFtb3VudDogbnVtYmVyIH0gfCB7IG9rOiBmYWxzZTsgcmVhc29uczogc3RyaW5nW10gfTtcbmZ1bmN0aW9uIHJlcXVpcmVBbW91bnQoYmFnOiBMaWZlUmVzb3VyY2VCYWcpOiBQYXJzZWRBbW91bnQge1xuICBjb25zdCBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXMoYmFnKTtcbiAgaWYgKGVudHJpZXMubGVuZ3RoICE9PSAxKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbnM6IFsndHJhbnNmZXIgZXhhY3RseSBvbmUgcmVzb3VyY2UgYXQgYSB0aW1lJ10gfTtcbiAgY29uc3QgW3Jlc291cmNlLCBhbW91bnRdID0gZW50cmllc1swXTtcbiAgaWYgKCFMSUZFX1JFU09VUkNFUy5pbmNsdWRlcyhyZXNvdXJjZSBhcyBMaWZlUmVzb3VyY2UpIHx8ICFOdW1iZXIuaXNTYWZlSW50ZWdlcihhbW91bnQpIHx8IChhbW91bnQgPz8gMCkgPD0gMCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uczogWydyZXNvdXJjZSBhbW91bnQgbXVzdCBiZSBhIHBvc2l0aXZlIGludGVnZXInXSB9O1xuICB9XG4gIHJldHVybiB7IG9rOiB0cnVlLCByZXNvdXJjZTogcmVzb3VyY2UgYXMgTGlmZVJlc291cmNlLCBhbW91bnQgfTtcbn1cblxuZnVuY3Rpb24gbW92ZSh3b3JsZDogV29ybGQsIGZyb206IFJlY29yZDxzdHJpbmcsIG51bWJlcj4sIHRvOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+LFxuICByZXF1ZXN0ZWQ6IExpZmVSZXNvdXJjZUJhZywgdG9DYXBhY2l0eTogbnVtYmVyKTogTGlmZVJlc3VsdDxMaWZlUmVzb3VyY2VCYWc+IHtcbiAgY29uc3QgY2hlY2tlZCA9IHJlcXVpcmVBbW91bnQocmVxdWVzdGVkKTtcbiAgaWYgKCFjaGVja2VkLm9rKSByZXR1cm4gcmVqZWN0TGlmZSgnaW52YWxpZF90cmFuc2ZlcicsIFtjaGVja2VkLnJlYXNvbnNbMF1dKTtcbiAgY29uc3QgeyByZXNvdXJjZSwgYW1vdW50IH0gPSBjaGVja2VkO1xuICBpZiAoKGZyb21bcmVzb3VyY2VdID8/IDApIDwgYW1vdW50KSByZXR1cm4gcmVqZWN0TGlmZSgnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsIFtgbmVlZCAke2Ftb3VudH0gJHtTdHJpbmcocmVzb3VyY2UpfSwgaGF2ZSAke2Zyb21bcmVzb3VyY2VdID8/IDB9YF0pO1xuICBpZiAodG90YWwodG8pICsgYW1vdW50ID4gdG9DYXBhY2l0eSkgcmV0dXJuIHJlamVjdExpZmUoJ2NhcGFjaXR5X2V4Y2VlZGVkJywgW2BkZXN0aW5hdGlvbiBjYXBhY2l0eSAke3RvQ2FwYWNpdHl9IHdvdWxkIGJlIGV4Y2VlZGVkYF0pO1xuICBmcm9tW3Jlc291cmNlXSA9IChmcm9tW3Jlc291cmNlXSA/PyAwKSAtIGFtb3VudDtcbiAgaWYgKGZyb21bcmVzb3VyY2VdID09PSAwKSBkZWxldGUgZnJvbVtyZXNvdXJjZV07XG4gIHRvW3Jlc291cmNlXSA9ICh0b1tyZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyBbcmVzb3VyY2VdOiBhbW91bnQgfSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJhbnNmZXIod29ybGQ6IFdvcmxkLCBraW5kOiAnZGVwb3NpdCcgfCAnd2l0aGRyYXcnLCBiYWc6IExpZmVSZXNvdXJjZUJhZyk6IExpZmVSZXN1bHQ8TGlmZVJlc291cmNlQmFnPiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBjb25zdCBzdG9jayA9IGxpZmUuc3RvY2twaWxlcy5nZXQoRk9VTkRFUl9TVE9DS1BJTEVfSUQpO1xuICBpZiAoIXN0b2NrKSByZXR1cm4gcmVqZWN0TGlmZSgnbWlzc2luZ19zdG9ja3BpbGUnLCBbJ2ZvdW5kZXIgc3RvY2twaWxlIGlzIGFic2VudCddKTtcbiAgcmV0dXJuIGtpbmQgPT09ICdkZXBvc2l0J1xuICAgID8gbW92ZSh3b3JsZCwgd29ybGQuaW52ZW50b3J5LCBzdG9jay5pbnZlbnRvcnksIGJhZywgc3RvY2suY2FwYWNpdHkpXG4gICAgOiBtb3ZlKHdvcmxkLCBzdG9jay5pbnZlbnRvcnksIHdvcmxkLmludmVudG9yeSwgYmFnLCBDQVJSSUVEX0NBUEFDSVRZKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0UHJvZHVjdGlvbih3b3JsZDogV29ybGQsIHJlY2lwZUlkOiBSZWNpcGVJZCwgam9iSWQ6IHN0cmluZyk6IExpZmVSZXN1bHQ8UHJvZHVjdGlvbkpvYj4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgY29uc3Qgc3RvY2sgPSBsaWZlLnN0b2NrcGlsZXMuZ2V0KEZPVU5ERVJfU1RPQ0tQSUxFX0lEKTtcbiAgaWYgKCFzdG9jaykgcmV0dXJuIHJlamVjdExpZmUoJ21pc3Npbmdfc3RvY2twaWxlJywgWydmb3VuZGVyIHN0b2NrcGlsZSBpcyBhYnNlbnQnXSk7XG4gIGlmIChsaWZlLmpvYnMuaGFzKGpvYklkKSkgcmV0dXJuIHJlamVjdExpZmUoJ2R1cGxpY2F0ZV9qb2InLCBbJ3Byb2R1Y3Rpb24gam9iIGFscmVhZHkgZXhpc3RzJ10pO1xuICBpZiAobGlmZS5qb2JzLnNpemUgPj0gTUFYX1BST0RVQ1RJT05fSk9CUykgcmV0dXJuIHJlamVjdExpZmUoJ2pvYl9saW1pdCcsIFtgYXQgbW9zdCAke01BWF9QUk9EVUNUSU9OX0pPQlN9IGpvYnMgbWF5IGJlIGFjdGl2ZWBdKTtcbiAgY29uc3QgcmVjaXBlID0gUkVDSVBFU1tyZWNpcGVJZF07XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHJlY2lwZS5pbnB1dCkpIHtcbiAgICBpZiAoKHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgPCAoYW1vdW50ID8/IDApKSB7XG4gICAgICByZXR1cm4gcmVqZWN0TGlmZSgnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsIFtgbmVlZCAke2Ftb3VudH0gJHtTdHJpbmcocmVzb3VyY2UpfSwgaGF2ZSAke3N0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMH1gXSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHJlc2VydmVkT3V0cHV0ID0gWy4uLmxpZmUuam9icy52YWx1ZXMoKV0uZmlsdGVyKChqKSA9PiBqLnN0b2NrcGlsZUlkID09PSBzdG9jay5pZClcbiAgICAucmVkdWNlKChzdW0sIGpvYikgPT4gc3VtICsgdG90YWwoY2xvbmVCYWcoUkVDSVBFU1tqb2IucmVjaXBlXS5vdXRwdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPikpLCAwKTtcbiAgaWYgKHRvdGFsKHN0b2NrLmludmVudG9yeSkgLSB0b3RhbChjbG9uZUJhZyhyZWNpcGUuaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPikpXG4gICAgKyByZXNlcnZlZE91dHB1dCArIHRvdGFsKGNsb25lQmFnKHJlY2lwZS5vdXRwdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPikpID4gc3RvY2suY2FwYWNpdHkpIHtcbiAgICByZXR1cm4gcmVqZWN0TGlmZSgnY2FwYWNpdHlfZXhjZWVkZWQnLCBbJ3Jlc2VydmVkIHByb2R1Y3Rpb24gb3V0cHV0IHdvdWxkIGV4Y2VlZCBzdG9ja3BpbGUgY2FwYWNpdHknXSk7XG4gIH1cbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocmVjaXBlLmlucHV0KSkge1xuICAgIHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPSAoc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSAtIChhbW91bnQgPz8gMCk7XG4gICAgaWYgKHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPT09IDApIGRlbGV0ZSBzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdO1xuICB9XG4gIGNvbnN0IGpvYjogUHJvZHVjdGlvbkpvYiA9IHsgaWQ6IGpvYklkLCBzdG9ja3BpbGVJZDogc3RvY2suaWQsIHJlY2lwZTogcmVjaXBlSWQsIHJlbWFpbmluZ1RpY2tzOiByZWNpcGUudGlja3MgfTtcbiAgbGlmZS5qb2JzLnNldChqb2IuaWQsIGpvYik7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyAuLi5qb2IgfSB9O1xufVxuXG4vKiogUGxhbnQgaW50byBhbiBlbXB0eSBmaXhlZCB0ZXJyYWNlIHBsb3QuIFRoZSBmb3VuZGVyIGZhcm0gbXVzdCBhbHJlYWR5IGV4aXN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW50Q3JvcCh3b3JsZDogV29ybGQsIHBsb3RJZDogc3RyaW5nKTogTGlmZVJlc3VsdDxDcm9wUGxvdD4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgaWYgKCFDUk9QX1BMT1RfSURTLmluY2x1ZGVzKHBsb3RJZCkpIHJldHVybiByZWplY3RMaWZlKCdpbnZhbGlkX3Bsb3QnLCBbJ3Vua25vd24gY3JvcCBwbG90J10pO1xuICBpZiAoIVsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb21lKChzKSA9PiBzLmtpbmQgPT09ICd0ZXJyYWNlJykpIHtcbiAgICByZXR1cm4gcmVqZWN0TGlmZSgnZmFybV9yZXF1aXJlZCcsIFsnYnVpbGQgdGhlIGZvdW5kZXIgdGVycmFjZWQgZmFybSBiZWZvcmUgcGxhbnRpbmcnXSk7XG4gIH1cbiAgaWYgKGxpZmUuY3JvcHMuaGFzKHBsb3RJZCkpIHJldHVybiByZWplY3RMaWZlKCdwbG90X29jY3VwaWVkJywgWydjcm9wIHBsb3QgaXMgYWxyZWFkeSBwbGFudGVkJ10pO1xuICBjb25zdCBzdG9jayA9IGxpZmUuc3RvY2twaWxlcy5nZXQoRk9VTkRFUl9TVE9DS1BJTEVfSUQpO1xuICBpZiAoIXN0b2NrIHx8IChzdG9jay5pbnZlbnRvcnkuc2VlZCA/PyAwKSA8IDEpIHJldHVybiByZWplY3RMaWZlKCdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJywgWyduZWVkIDEgc2VlZCBpbiB0aGUgZm91bmRlciBzdG9ja3BpbGUnXSk7XG4gIHN0b2NrLmludmVudG9yeS5zZWVkIS0tO1xuICBpZiAoc3RvY2suaW52ZW50b3J5LnNlZWQgPT09IDApIGRlbGV0ZSBzdG9jay5pbnZlbnRvcnkuc2VlZDtcbiAgY29uc3QgY3JvcDogQ3JvcFBsb3QgPSB7IGlkOiBwbG90SWQsIHBsYW50ZWRUaWNrOiBsaWZlLnRpY2ssIGdyb3d0aFRpY2tzOiBDUk9QX0dST1dUSF9USUNLUyB9O1xuICBsaWZlLmNyb3BzLnNldChwbG90SWQsIGNyb3ApO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgLi4uY3JvcCB9IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcm9wUmVhZHkoY3JvcDogQ3JvcFBsb3QsIHRpY2s6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gdGljayAtIGNyb3AucGxhbnRlZFRpY2sgPj0gY3JvcC5ncm93dGhUaWNrcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RDcm9wKHdvcmxkOiBXb3JsZCwgcGxvdElkOiBzdHJpbmcpOiBMaWZlUmVzdWx0PHsgZm9vZDogbnVtYmVyOyBmaWJlcjogbnVtYmVyIH0+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGNvbnN0IGNyb3AgPSBsaWZlLmNyb3BzLmdldChwbG90SWQpO1xuICBpZiAoIWNyb3ApIHJldHVybiByZWplY3RMaWZlKCdub3RfcGxhbnRlZCcsIFsnY3JvcCBwbG90IGlzIGVtcHR5J10pO1xuICBpZiAoIWNyb3BSZWFkeShjcm9wLCBsaWZlLnRpY2spKSByZXR1cm4gcmVqZWN0TGlmZSgnY3JvcF9ub3RfcmVhZHknLCBbYGNyb3AgbmVlZHMgJHtjcm9wLmdyb3d0aFRpY2tzIC0gKGxpZmUudGljayAtIGNyb3AucGxhbnRlZFRpY2spfSBtb3JlIHRpY2tzYF0pO1xuICAvLyBQbGFudCBncm93dGggaXMgdGhlIGV4cGxpY2l0IGJpb2xvZ2ljYWwgc291cmNlOyBldmVyeSBvdGhlciBsaWZlLWxvb3BcbiAgLy8gdHJhbnNmb3JtYXRpb24gY29uc2VydmVzIGl0cyBkZWNsYXJlZCBpbnB1dHMgYW5kIG91dHB1dHMuXG4gIGNvbnN0IHlpZWxkQmFnID0geyBmb29kOiBDUk9QX1lJRUxELmZvb2QsIGZpYmVyOiBDUk9QX1lJRUxELmZpYmVyIH07XG4gIGlmICh0b3RhbCh3b3JsZC5pbnZlbnRvcnkpICsgeWllbGRCYWcuZm9vZCArIHlpZWxkQmFnLmZpYmVyID4gQ0FSUklFRF9DQVBBQ0lUWSkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdjYXBhY2l0eV9leGNlZWRlZCcsIFtgY2FycmllZCBjYXBhY2l0eSAke0NBUlJJRURfQ0FQQUNJVFl9IHdvdWxkIGJlIGV4Y2VlZGVkYF0pO1xuICB9XG4gIHdvcmxkLmludmVudG9yeS5mb29kID0gKHdvcmxkLmludmVudG9yeS5mb29kID8/IDApICsgeWllbGRCYWcuZm9vZDtcbiAgd29ybGQuaW52ZW50b3J5LmZpYmVyID0gKHdvcmxkLmludmVudG9yeS5maWJlciA/PyAwKSArIHlpZWxkQmFnLmZpYmVyO1xuICBsaWZlLmNyb3BzLmRlbGV0ZShwbG90SWQpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHlpZWxkQmFnIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGlja091dGNvbWUge1xuICBmcm9tVGljazogbnVtYmVyO1xuICB0b1RpY2s6IG51bWJlcjtcbiAgY29tcGxldGVkSm9iczogQXJyYXk8eyBpZDogc3RyaW5nOyByZWNpcGU6IFJlY2lwZUlkOyBvdXRwdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfT47XG4gIHJlYWR5Q3JvcHM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpY2tzKHdvcmxkOiBXb3JsZCwgY291bnQ6IG51bWJlcik6IExpZmVSZXN1bHQ8VGlja091dGNvbWU+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGlmICghTnVtYmVyLmlzU2FmZUludGVnZXIoY291bnQpIHx8IGNvdW50IDwgMSB8fCBjb3VudCA+IE1BWF9USUNLU19QRVJfQ09NTUFORCkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdpbnZhbGlkX3RpY2tfY291bnQnLCBbYHRpY2tzIG11c3QgYmUgYW4gaW50ZWdlciBmcm9tIDEgdG8gJHtNQVhfVElDS1NfUEVSX0NPTU1BTkR9YF0pO1xuICB9XG4gIGNvbnN0IGNvbXBsZXRlZDogVGlja091dGNvbWVbJ2NvbXBsZXRlZEpvYnMnXSA9IFtdO1xuICBjb25zdCBmcm9tVGljayA9IGxpZmUudGljaztcbiAgLy8gSm9icyBhcmUgcHJvY2Vzc2VkIGluIHN0YWJsZSBpZCBvcmRlciBhdCBlYWNoIHRpY2ssIG5ldmVyIG1hcCBpbnNlcnRpb24sXG4gIC8vIHdhbGwgdGltZSwgZnJhbWUgZGVsdGEsIG9yIGFzeW5jaHJvbm91cyBjb21wbGV0aW9uIG9yZGVyLlxuICBmb3IgKGxldCBzdGVwID0gMDsgc3RlcCA8IGNvdW50OyBzdGVwKyspIHtcbiAgICBsaWZlLnRpY2srKztcbiAgICBmb3IgKGNvbnN0IGpvYiBvZiBbLi4ubGlmZS5qb2JzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpKSB7XG4gICAgICBqb2IucmVtYWluaW5nVGlja3MtLTtcbiAgICAgIGlmIChqb2IucmVtYWluaW5nVGlja3MgPiAwKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChqb2Iuc3RvY2twaWxlSWQpO1xuICAgICAgaWYgKCFzdG9jaykgdGhyb3cgbmV3IEVycm9yKCdhY3RpdmUgcHJvZHVjdGlvbiByZWZlcmVuY2VzIGEgbWlzc2luZyBzdG9ja3BpbGUnKTtcbiAgICAgIGNvbnN0IG91dHB1dCA9IGNsb25lQmFnKFJFQ0lQRVNbam9iLnJlY2lwZV0ub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pO1xuICAgICAgaWYgKHRvdGFsKHN0b2NrLmludmVudG9yeSkgKyB0b3RhbChvdXRwdXQpID4gc3RvY2suY2FwYWNpdHkpIHRocm93IG5ldyBFcnJvcigncmVzZXJ2ZWQgcHJvZHVjdGlvbiBvdXRwdXQgZXhjZWVkcyBjYXBhY2l0eScpO1xuICAgICAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMob3V0cHV0KSkgc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA9IChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgICAgbGlmZS5qb2JzLmRlbGV0ZShqb2IuaWQpO1xuICAgICAgY29tcGxldGVkLnB1c2goeyBpZDogam9iLmlkLCByZWNpcGU6IGpvYi5yZWNpcGUsIG91dHB1dCB9KTtcbiAgICB9XG4gIH1cbiAgY29uc3QgcmVhZHlDcm9wcyA9IFsuLi5saWZlLmNyb3BzLnZhbHVlcygpXS5maWx0ZXIoKGNyb3ApID0+IGNyb3BSZWFkeShjcm9wLCBsaWZlLnRpY2spXG4gICAgJiYgY3JvcC5wbGFudGVkVGljayArIGNyb3AuZ3Jvd3RoVGlja3MgPiBmcm9tVGljaykubWFwKChjcm9wKSA9PiBjcm9wLmlkKS5zb3J0KCk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyBmcm9tVGljaywgdG9UaWNrOiBsaWZlLnRpY2ssIGNvbXBsZXRlZEpvYnM6IGNvbXBsZXRlZCwgcmVhZHlDcm9wcyB9IH07XG59XG4iLCAiLy8gVmVyc2lvbmVkLCBKU09OLXNhZmUgc25hcHNob3RzIG9mIGNvbXBsZXRlIGF1dGhvcml0YXRpdmUgTTAwMiBzdGF0ZS5cbi8vIENodW5rIGJ5dGVzLCBoZWlnaHQvbWF0ZXJpYWwgY2FjaGVzLCByZW5kZXJlciBkYXRhIGFuZCB0aW1pbmcgY291bnRlcnMgYXJlXG4vLyByZWdlbmVyYXRlZCBmcm9tIHRoZSBtYW5pZmVzdCBhbmQgZHVyYWJsZSBlZGl0czsgdGhleSBhcmUgbm90IGEgc2Vjb25kIHNhdmUuXG5pbXBvcnQge1xuICBDSFVOS19TSVpFLCBDSFVOS19WT0xVTUUsIENIVU5LU19QRVJfU0lERSwgRW50aXR5LCBFbnRpdHlLaW5kLFxuICBHRU5FUkFUT1JfVkVSU0lPTiwgSEFMRiwgTWF0SWQsIFJlc291cmNlVHlwZSwgV29ybGQsIFdvcmxkTWFuaWZlc3QsXG4gIGNyZWF0ZVdvcmxkLCBwbGFjZUF1dGhvcmVkU2l0ZXMsIHdvcmxkTWFuaWZlc3QsIGVuc3VyZUNodW5rLCBpc1JldGlyZWRTdG9uZUtpbmQsXG4gIG1hcmtFZGl0c0NoYW5nZWQsIGlzU3VwcG9ydGVkR2VuZXJhdG9yLCBNQVhfTUFUX0lELFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04sIFN0cnVjdHVyZSB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQge1xuICBlbmFibGVTdG9uZVJlcGxheSwgZmluaXNoU3RvbmVSZXBsYXksIGlzSGlzdG9yaWNhbFN0b25lSGFzaCwgaXNTdG9uZVJlcGxheSxcbn0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuaW1wb3J0IHtcbiAgQ0FSUklFRF9DQVBBQ0lUWSwgQ1JPUF9HUk9XVEhfVElDS1MsIENST1BfUExPVF9JRFMsIEZPVU5ERVJfU1RPQ0tQSUxFLFxuICBGT1VOREVSX1NUT0NLUElMRV9JRCwgTElGRV9SRVNPVVJDRVMsIE1BWF9QUk9EVUNUSU9OX0pPQlMsIE1BWF9USUNLU19QRVJfQ09NTUFORCxcbiAgUkVDSVBFUywgU1RPQ0tQSUxFX0NBUEFDSVRZLCBjcmVhdGVMaWZlU3RhdGUsXG59IGZyb20gJy4vZWNvbm9teSc7XG5cbmV4cG9ydCBjb25zdCBTTkFQU0hPVF9TQ0hFTUEgPSAxIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEgPSAyIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BID0gMyBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBNQVhfU05BUFNIT1RfSlNPTl9CWVRFUyA9IDI1XzAwMF8wMDA7XG5leHBvcnQgY29uc3QgTUFYX1NOQVBTSE9UX0VESVRTID0gMV8wMDBfMDAwO1xuZXhwb3J0IGNvbnN0IE1BWF9TTkFQU0hPVF9FTlRJVElFUyA9IDUwMF8wMDA7XG5cbmludGVyZmFjZSBCYXNlV29ybGRTbmFwc2hvdCB7XG4gIHNjaGVtYTogdHlwZW9mIFNOQVBTSE9UX1NDSEVNQSB8IHR5cGVvZiBERVNJR05fU05BUFNIT1RfU0NIRU1BIHwgdHlwZW9mIENVUlJFTlRfU05BUFNIT1RfU0NIRU1BO1xuICBtYW5pZmVzdDogV29ybGRNYW5pZmVzdDtcbiAgcmV2aXNpb246IG51bWJlcjtcbiAgZWRpdHM6IEFycmF5PHsgY2h1bms6IHN0cmluZzsgY2VsbHM6IEFycmF5PHsgaTogbnVtYmVyOyBtOiBudW1iZXIgfT4gfT47XG4gIGVudGl0aWVzOiBFbnRpdHlbXTtcbiAgLyoqIENodW5rcyB3aXRoIGR1cmFibGUgZ2VuZXJhdGVkLWVudGl0eSBjaGFuZ2VzOyBwdXJlIHF1ZXJpZXMgYXJlIGV4Y2x1ZGVkLiAqL1xuICBlbnRpdHlDaHVua3M6IHN0cmluZ1tdO1xuICBlbnRpdHlSZW1vdmFsczogc3RyaW5nW107XG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgc3RydWN0dXJlczogU3RydWN0dXJlW107XG4gIGF1dGhvcmVkUGxhY2VkOiBib29sZWFuO1xuICAvKiogTmV4dCBhY2NlcHRlZCBqb3VybmFsIHNlcXVlbmNlIGF0IHRoaXMgc25hcHNob3QgYm91bmRhcnkuICovXG4gIG5leHRTZXF1ZW5jZTogbnVtYmVyO1xufVxuZXhwb3J0IHR5cGUgV29ybGRTbmFwc2hvdCA9IEJhc2VXb3JsZFNuYXBzaG90ICYgKHtcbiAgc2NoZW1hOiB0eXBlb2YgU05BUFNIT1RfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9TTkFQU0hPVF9TQ0hFTUE7XG59IHwge1xuICBzY2hlbWE6IHR5cGVvZiBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQTtcbiAgdGljazogbnVtYmVyO1xuICBzdG9ja3BpbGVzOiBBcnJheTx7XG4gICAgaWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDsgeDogbnVtYmVyOyB6OiBudW1iZXI7XG4gICAgY2FwYWNpdHk6IHR5cGVvZiBTVE9DS1BJTEVfQ0FQQUNJVFk7IGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgfT47XG4gIGpvYnM6IEFycmF5PHtcbiAgICBpZDogc3RyaW5nOyBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICAgIHJlY2lwZTogJ3NlZWQnIHwgJ3JhdGlvbnMnOyByZW1haW5pbmdUaWNrczogbnVtYmVyO1xuICB9PjtcbiAgY3JvcHM6IEFycmF5PHsgaWQ6IHN0cmluZzsgcGxhbnRlZFRpY2s6IG51bWJlcjsgZ3Jvd3RoVGlja3M6IHR5cGVvZiBDUk9QX0dST1dUSF9USUNLUyB9Pjtcbn0pO1xudHlwZSBMaWZlU25hcHNob3QgPSBFeHRyYWN0PFdvcmxkU25hcHNob3QsIHsgc2NoZW1hOiB0eXBlb2YgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgfT47XG5cbmZ1bmN0aW9uIGNsb25lRW50aXR5KGU6IEVudGl0eSk6IEVudGl0eSB7XG4gIHJldHVybiB7XG4gICAgaWQ6IGUuaWQsIGtpbmQ6IGUua2luZCwgY2h1bms6IGUuY2h1bmssIHg6IGUueCwgeTogZS55LCB6OiBlLnosXG4gICAgcm90OiBlLnJvdCwgc2NhbGU6IGUuc2NhbGUsIHZhcmlhbnQ6IGUudmFyaWFudCwgcmVzb3VyY2U6IGUucmVzb3VyY2UsXG4gICAgcmVtYWluaW5nOiBlLnJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0OiBlLnlpZWxkUGVySGFydmVzdCwgaGFydmVzdGVkOiBlLmhhcnZlc3RlZCxcbiAgICAuLi4oZS5oYXJ2ZXN0ZWRPbmNlID09PSB1bmRlZmluZWQgPyB7fSA6IHsgaGFydmVzdGVkT25jZTogZS5oYXJ2ZXN0ZWRPbmNlIH0pLFxuICAgIHByb3Zpc2lvbmFsOiBlLnByb3Zpc2lvbmFsLCBhdXRob3JlZDogZS5hdXRob3JlZCxcbiAgfTtcbn1cblxuZnVuY3Rpb24gY2xvbmVTdHJ1Y3R1cmUoczogU3RydWN0dXJlKTogU3RydWN0dXJlIHtcbiAgcmV0dXJuIHtcbiAgICAuLi5zLFxuICAgIG1vZHVsZXM6IHMubW9kdWxlcy5tYXAoKG0pID0+ICh7IC4uLm0gfSkpLFxuICAgIGNvc3Q6IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhzLmNvc3QpLmZpbHRlcigoWywgYW1vdW50XSkgPT4gKGFtb3VudCA/PyAwKSA+IDApXG4gICAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGRTbmFwc2hvdChcbiAgd29ybGQ6IFdvcmxkLCBuZXh0U2VxdWVuY2UgPSAwLFxuICBzY2hlbWE6IFdvcmxkU25hcHNob3RbJ3NjaGVtYSddID0gd29ybGQubGlmZSA/IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BXG4gICAgOiBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV0uc29tZSgocykgPT4gcy5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKVxuICAgICAgPyBERVNJR05fU05BUFNIT1RfU0NIRU1BIDogU05BUFNIT1RfU0NIRU1BLFxuKTogV29ybGRTbmFwc2hvdCB7XG4gIGlmIChzY2hlbWEgIT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BICYmICh3b3JsZC5saWZlIHx8IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb21lKFxuICAgIChzKSA9PiBzY2hlbWEgPT09IFNOQVBTSE9UX1NDSEVNQSAmJiBzLmRlc2lnblZlcnNpb24gIT09IHVuZGVmaW5lZCxcbiAgKSkpIHRocm93IG5ldyBFcnJvcignbGVnYWN5IHNuYXBzaG90cyBjYW5ub3QgY29udGFpbiBuZXdlciBhdXRob3JpdGF0aXZlIHN0YXRlJyk7XG4gIGNvbnN0IGJhc2U6IEJhc2VXb3JsZFNuYXBzaG90ID0ge1xuICAgIHNjaGVtYSxcbiAgICBtYW5pZmVzdDogd29ybGRNYW5pZmVzdCh3b3JsZCksXG4gICAgcmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgIGVkaXRzOiBbLi4ud29ybGQuZWRpdHMuZW50cmllcygpXS5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKS5tYXAoXG4gICAgICAoW2NodW5rLCBjZWxsc10pID0+ICh7XG4gICAgICAgIGNodW5rLFxuICAgICAgICBjZWxsczogWy4uLmNlbGxzLmVudHJpZXMoKV0uc29ydCgoW2FdLCBbYl0pID0+IGEgLSBiKS5tYXAoKFtpLCBtXSkgPT4gKHsgaSwgbSB9KSksXG4gICAgICB9KSxcbiAgICApLFxuICAgIGVudGl0aWVzOiBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldLmZpbHRlcigoZSkgPT4gKGlzSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZCkgfHwgIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKVxuICAgICAgJiYgKGUuYXV0aG9yZWQgfHwgd29ybGQuZW50aXR5Q2hhbmdlcy5oYXMoZS5jaHVuaykpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKGNsb25lRW50aXR5KSxcbiAgICBlbnRpdHlDaHVua3M6IFsuLi53b3JsZC5lbnRpdHlDaGFuZ2VzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLFxuICAgIGVudGl0eVJlbW92YWxzOiBbLi4ud29ybGQuZW50aXR5UmVtb3ZhbHNdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gICAgaW52ZW50b3J5OiBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMod29ybGQuaW52ZW50b3J5KS5maWx0ZXIoKFssIGFtb3VudF0pID0+IGFtb3VudCA+IDApXG4gICAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpLFxuICAgIHN0cnVjdHVyZXM6IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcChjbG9uZVN0cnVjdHVyZSksXG4gICAgYXV0aG9yZWRQbGFjZWQ6IHdvcmxkLmF1dGhvcmVkUGxhY2VkLFxuICAgIG5leHRTZXF1ZW5jZSxcbiAgfTtcbiAgaWYgKHNjaGVtYSAhPT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEpIHJldHVybiB7IC4uLmJhc2UsIHNjaGVtYSB9IGFzIFdvcmxkU25hcHNob3Q7XG4gIGlmICghd29ybGQubGlmZSkgdGhyb3cgbmV3IEVycm9yKCdzY2hlbWEtMyBzbmFwc2hvdCByZXF1aXJlcyBsaWZlIHN0YXRlJyk7XG4gIHJldHVybiB7XG4gICAgLi4uYmFzZSwgc2NoZW1hLFxuICAgIHRpY2s6IHdvcmxkLmxpZmUudGljayxcbiAgICBzdG9ja3BpbGVzOiBbLi4ud29ybGQubGlmZS5zdG9ja3BpbGVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcCgocykgPT4gKHtcbiAgICAgIGlkOiBzLmlkLCB4OiBzLngsIHo6IHMueiwgY2FwYWNpdHk6IHMuY2FwYWNpdHksXG4gICAgICBpbnZlbnRvcnk6IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhzLmludmVudG9yeSkuZmlsdGVyKChbLCBhbW91bnRdKSA9PiBhbW91bnQgPiAwKVxuICAgICAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpLFxuICAgIH0pKSxcbiAgICBqb2JzOiBbLi4ud29ybGQubGlmZS5qb2JzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcCgoaikgPT4gKHsgLi4uaiB9KSksXG4gICAgY3JvcHM6IFsuLi53b3JsZC5saWZlLmNyb3BzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcCgoYykgPT4gKHsgLi4uYyB9KSksXG4gIH07XG59XG5cbi8qKiBUd28gbGFuZXMsIHdpdGggbGVuZ3RoIGluY2x1ZGVkOyBub3QgYSBjcnlwdG9ncmFwaGljIGludGVncml0eSBzaWduYXR1cmUuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsSGFzaCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzUsIGIgPSAweDllMzc3OWI5O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIGEgPSBNYXRoLmltdWwoYSBeIGMsIDB4MDEwMDAxOTMpO1xuICAgIGIgPSBNYXRoLmltdWwoYiBeIChjICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIGIgXj0gYiA+Pj4gMTM7XG4gIH1cbiAgcmV0dXJuIChhID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKSArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbFdvcmxkSGFzaChcbiAgd29ybGQ6IFdvcmxkLCBuZXh0U2VxdWVuY2UgPSAwLCBzY2hlbWE6IFdvcmxkU25hcHNob3RbJ3NjaGVtYSddID0gREVTSUdOX1NOQVBTSE9UX1NDSEVNQSxcbik6IHN0cmluZyB7XG4gIHJldHVybiBjYW5vbmljYWxIYXNoKEpTT04uc3RyaW5naWZ5KGNyZWF0ZVdvcmxkU25hcHNob3Qod29ybGQsIG5leHRTZXF1ZW5jZSwgc2NoZW1hKSkpO1xufVxuXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB1aW50KHZhbHVlOiB1bmtub3duLCBtYXhpbXVtOiBudW1iZXIpOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNTYWZlSW50ZWdlcih2YWx1ZSkgJiYgdmFsdWUgPj0gMCAmJiB2YWx1ZSA8PSBtYXhpbXVtO1xufVxuXG5mdW5jdGlvbiBmaW5pdGUodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB0ZXh0KHZhbHVlOiB1bmtub3duLCBtYXhpbXVtID0gMjU2KTogdmFsdWUgaXMgc3RyaW5nIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUubGVuZ3RoID4gMCAmJiB2YWx1ZS5sZW5ndGggPD0gbWF4aW11bTtcbn1cblxuZnVuY3Rpb24gdmFsaWRDaHVuayhrZXk6IHVua25vd24pOiBrZXkgaXMgc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiBrZXkgIT09ICdzdHJpbmcnIHx8ICEvXi0/XFxkKywtP1xcZCskLy50ZXN0KGtleSkpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIoY3gpICYmIE51bWJlci5pc0ludGVnZXIoY3opXG4gICAgJiYgY3ggPj0gMCAmJiBjeiA+PSAwICYmIGN4IDwgQ0hVTktTX1BFUl9TSURFICYmIGN6IDwgQ0hVTktTX1BFUl9TSURFO1xufVxuXG4vKiogQSBzdHJpY3QgbGVnYWN5IHNuYXBzaG90IGlzIGFscmVhZHkgY2Fub25pY2FsIGNyZWF0ZVdvcmxkU25hcHNob3Qgb3V0cHV0LlxuICogVmVyaWZ5IGl0cyByZWNvcmRlZCBib3VuZGFyeSBiZWZvcmUgZmlsdGVyaW5nIHRoZSB0aHJlZSByZXRpcmVkIHN0b25lIGZvcm1zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCk6IHN0cmluZyB7XG4gIHJldHVybiBjYW5vbmljYWxIYXNoKEpTT04uc3RyaW5naWZ5KHNuYXBzaG90KSk7XG59XG5cbi8qKiBNaWdyYXRpb24gb25seTogbm8gaW52ZW50b3J5LCBzdHJ1Y3R1cmUsIGxpZmUsIGVkaXQgb3IgY29tbWFuZCBkYXRhIGNoYW5nZXMuICovXG4vKiogQGludGVybmFsIFJldGlyZSBvbmx5IGFmdGVyIHJlY29uc3RydWN0aW5nIHRoZSBvbGQgc3RhdGUgaW4gcmVwbGF5IG1vZGUuICovXG5leHBvcnQgZnVuY3Rpb24gbWlncmF0ZVN0b25lU25hcHNob3Qoc25hcHNob3Q6IFdvcmxkU25hcHNob3QpOiBXb3JsZFNuYXBzaG90IHtcbiAgY29uc3QgcmVtb3ZhbHMgPSBuZXcgU2V0KHNuYXBzaG90LmVudGl0eVJlbW92YWxzKTtcbiAgZm9yIChjb25zdCBlbnRpdHkgb2Ygc25hcHNob3QuZW50aXRpZXMpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSAmJiAhZW50aXR5LmF1dGhvcmVkKSByZW1vdmFscy5hZGQoZW50aXR5LmlkKTtcbiAgfVxuICBjb25zdCBlbnRpdHlDaHVua3MgPSBuZXcgU2V0KHNuYXBzaG90LmVudGl0eUNodW5rcyk7XG4gIGZvciAoY29uc3QgZW50aXR5IG9mIHNuYXBzaG90LmVudGl0aWVzKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpIHtcbiAgICAgIGVudGl0eUNodW5rcy5hZGQoZW50aXR5LmNodW5rKTtcbiAgICAgIGlmICghZW50aXR5LmF1dGhvcmVkKSByZW1vdmFscy5hZGQoZW50aXR5LmlkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtcbiAgICAuLi5zbmFwc2hvdCxcbiAgICBlbnRpdGllczogc25hcHNob3QuZW50aXRpZXMuZmlsdGVyKChlbnRpdHkpID0+ICFpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSxcbiAgICBlbnRpdHlDaHVua3M6IFsuLi5lbnRpdHlDaHVua3NdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gICAgZW50aXR5UmVtb3ZhbHM6IFsuLi5yZW1vdmFsc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSxcbiAgfTtcbn1cbmNvbnN0IEVOVElUWV9LSU5EUyA9IG5ldyBTZXQ8RW50aXR5S2luZD4oW1xuICAnc3R5bF90cmVlX3NwaXJlJywgJ3N0eWxfdHJlZV90YWJsZScsICdzdHlsX3RyZWVfY2x1c3RlcicsICdzdHlsX3RyZWVfYmxvc3NvbScsXG4gICdzdHlsX3NocnViJywgJ3N0eWxfcm9ja19zbWFsbCcsICdzdHlsX3JvY2tfbWVkaXVtJywgJ3N0eWxfcm9ja19sYXJnZScsXG4gICdzdHlsX29yZScsICdzdHlsX2NhaXJuJywgJ3dheXN0b25lJywgJ21hcmtlcicsXG5dKTtcbmNvbnN0IFJFU09VUkNFUyA9IG5ldyBTZXQ8UmVzb3VyY2VUeXBlPihbJ3dvb2QnLCAnc3RvbmUnLCAnb3JlJywgJ2ZpYmVyJ10pO1xuY29uc3QgUkVDT1JEX1JFU09VUkNFUyA9IG5ldyBTZXQ8c3RyaW5nPihMSUZFX1JFU09VUkNFUyk7XG5jb25zdCBTVFJVQ1RVUkVfS0lORFMgPSBuZXcgU2V0KFsnaG91c2UnLCAncGF0aCcsICd0ZXJyYWNlJ10pO1xuY29uc3QgTU9EVUxFX0tJTkRTID0gbmV3IFNldChbXG4gICdmbG9vcicsICd3YWxsJywgJ3Bvc3QnLCAnbGludGVsJywgJ3Jvb2YnLCAncGFyYXBldCcsICd3aW5kb3cnLCAnZG9vcicsXG4gICd0aHJlc2hvbGQnLCAncGF0aCcsICdjdXJiJywgJ3NvaWxfYmVkJywgJ3JldGFpbmluZ193YWxsJywgJ2Nyb3Bfcm93Jyxcbl0pO1xuY29uc3QgTU9EVUxFX1RPTkVTID0gbmV3IFNldChbJ3N0b25lJywgJ3N0b25lX2InLCAnb2NocmUnLCAndGltYmVyJywgJ2FjY2VudCcsICdzb2lsJywgJ2Nyb3AnLCAnZ3JhdmVsJ10pO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZUVudGl0eSh2YWx1ZTogdW5rbm93biwgaWRzOiBTZXQ8c3RyaW5nPik6IEVudGl0eSB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpIHx8ICF0ZXh0KHZhbHVlLmlkKSB8fCBpZHMuaGFzKHZhbHVlLmlkKVxuICAgIHx8ICF0ZXh0KHZhbHVlLmtpbmQpIHx8ICFFTlRJVFlfS0lORFMuaGFzKHZhbHVlLmtpbmQgYXMgRW50aXR5S2luZClcbiAgICB8fCAhdmFsaWRDaHVuayh2YWx1ZS5jaHVuaylcbiAgICB8fCAhZmluaXRlKHZhbHVlLngpIHx8ICFmaW5pdGUodmFsdWUueSkgfHwgIWZpbml0ZSh2YWx1ZS56KVxuICAgIHx8IHZhbHVlLnggPCAtSEFMRiB8fCB2YWx1ZS54ID49IEhBTEYgfHwgdmFsdWUueiA8IC1IQUxGIHx8IHZhbHVlLnogPj0gSEFMRlxuICAgIHx8ICFmaW5pdGUodmFsdWUucm90KSB8fCAhZmluaXRlKHZhbHVlLnNjYWxlKSB8fCAhdWludCh2YWx1ZS52YXJpYW50LCAxMDAwKVxuICAgIHx8IHZhbHVlLnJlc291cmNlICE9PSBudWxsICYmICEodHlwZW9mIHZhbHVlLnJlc291cmNlID09PSAnc3RyaW5nJyAmJiBSRVNPVVJDRVMuaGFzKHZhbHVlLnJlc291cmNlIGFzIFJlc291cmNlVHlwZSkpXG4gICAgfHwgIXVpbnQodmFsdWUucmVtYWluaW5nLCAxXzAwMF8wMDApIHx8ICF1aW50KHZhbHVlLnlpZWxkUGVySGFydmVzdCwgMV8wMDBfMDAwKVxuICAgIHx8IHR5cGVvZiB2YWx1ZS5oYXJ2ZXN0ZWQgIT09ICdib29sZWFuJyB8fCB0eXBlb2YgdmFsdWUucHJvdmlzaW9uYWwgIT09ICdib29sZWFuJ1xuICAgIHx8IHR5cGVvZiB2YWx1ZS5hdXRob3JlZCAhPT0gJ2Jvb2xlYW4nXG4gICAgfHwgdmFsdWUuaGFydmVzdGVkT25jZSAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiB2YWx1ZS5oYXJ2ZXN0ZWRPbmNlICE9PSAnYm9vbGVhbicpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGFuIGludmFsaWQgb3IgZHVwbGljYXRlIGVudGl0eScpO1xuICB9XG4gIGlkcy5hZGQodmFsdWUuaWQpO1xuICByZXR1cm4ge1xuICAgIGlkOiB2YWx1ZS5pZCwga2luZDogdmFsdWUua2luZCBhcyBFbnRpdHlLaW5kLCBjaHVuazogdmFsdWUuY2h1bmssXG4gICAgeDogdmFsdWUueCwgeTogdmFsdWUueSwgejogdmFsdWUueiwgcm90OiB2YWx1ZS5yb3QsIHNjYWxlOiB2YWx1ZS5zY2FsZSxcbiAgICB2YXJpYW50OiB2YWx1ZS52YXJpYW50LCByZXNvdXJjZTogdmFsdWUucmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlIHwgbnVsbCxcbiAgICByZW1haW5pbmc6IHZhbHVlLnJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0OiB2YWx1ZS55aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiB2YWx1ZS5oYXJ2ZXN0ZWQsXG4gICAgLi4uKHZhbHVlLmhhcnZlc3RlZE9uY2UgPT09IHVuZGVmaW5lZCA/IHt9IDogeyBoYXJ2ZXN0ZWRPbmNlOiB2YWx1ZS5oYXJ2ZXN0ZWRPbmNlIH0pLFxuICAgIHByb3Zpc2lvbmFsOiB2YWx1ZS5wcm92aXNpb25hbCwgYXV0aG9yZWQ6IHZhbHVlLmF1dGhvcmVkLFxuICB9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUludmVudG9yeSh2YWx1ZTogdW5rbm93bik6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBpZiAoIWlzT2JqZWN0KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBpbnZlbnRvcnkgaXMgaW52YWxpZCcpO1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModmFsdWUpLnNvcnQoKSkge1xuICAgIGlmICghUkVDT1JEX1JFU09VUkNFUy5oYXMoa2V5KSB8fCAhdWludCh2YWx1ZVtrZXldLCAxXzAwMF8wMDBfMDAwKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBzbmFwc2hvdCBoYXMgaW52YWxpZCBpbnZlbnRvcnkgcmVzb3VyY2UgJHtrZXl9YCk7XG4gICAgfVxuICAgIGlmICh2YWx1ZVtrZXldID4gMCkgb3V0W2tleV0gPSB2YWx1ZVtrZXldO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHN0b2NrVG90YWwodmFsdWU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pOiBudW1iZXIge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyh2YWx1ZSkucmVkdWNlKChzdW0sIGFtb3VudCkgPT4gc3VtICsgYW1vdW50LCAwKTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVMaWZlRmllbGRzKHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFBpY2s8TGlmZVNuYXBzaG90LCAndGljaycgfCAnc3RvY2twaWxlcycgfCAnam9icycgfCAnY3JvcHMnPiB7XG4gIGlmICghdWludCh2YWx1ZS50aWNrLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUilcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5zdG9ja3BpbGVzKSB8fCB2YWx1ZS5zdG9ja3BpbGVzLmxlbmd0aCAhPT0gMVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmpvYnMpIHx8IHZhbHVlLmpvYnMubGVuZ3RoID4gTUFYX1BST0RVQ1RJT05fSk9CU1xuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmNyb3BzKSB8fCB2YWx1ZS5jcm9wcy5sZW5ndGggPiBDUk9QX1BMT1RfSURTLmxlbmd0aCkge1xuICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGludmFsaWQgbGlmZS1sb29wIGZpZWxkcycpO1xuICB9XG4gIGNvbnN0IHN0b2NrcGlsZXM6IE5vbk51bGxhYmxlPExpZmVTbmFwc2hvdFsnc3RvY2twaWxlcyddPiA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5zdG9ja3BpbGVzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8IHJhdy5pZCAhPT0gRk9VTkRFUl9TVE9DS1BJTEVfSUQgfHwgcmF3LnggIT09IEZPVU5ERVJfU1RPQ0tQSUxFLnhcbiAgICAgIHx8IHJhdy56ICE9PSBGT1VOREVSX1NUT0NLUElMRS56IHx8IHJhdy5jYXBhY2l0eSAhPT0gRk9VTkRFUl9TVE9DS1BJTEUuY2FwYWNpdHkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGFuIHVuc3VwcG9ydGVkIHN0b2NrcGlsZScpO1xuICAgIH1cbiAgICBjb25zdCBpbnZlbnRvcnkgPSB2YWxpZGF0ZUludmVudG9yeShyYXcuaW52ZW50b3J5KTtcbiAgICBpZiAoc3RvY2tUb3RhbChpbnZlbnRvcnkpID4gU1RPQ0tQSUxFX0NBUEFDSVRZKSB0aHJvdyBuZXcgRXJyb3IoJ3N0b2NrcGlsZSBleGNlZWRzIGNhcGFjaXR5Jyk7XG4gICAgc3RvY2twaWxlcy5wdXNoKHsgaWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCB4OiByYXcueCwgejogcmF3LnosXG4gICAgICBjYXBhY2l0eTogU1RPQ0tQSUxFX0NBUEFDSVRZLCBpbnZlbnRvcnkgfSk7XG4gIH1cbiAgbGV0IHJlc2VydmVkID0gc3RvY2tUb3RhbChzdG9ja3BpbGVzWzBdLmludmVudG9yeSk7XG4gIGNvbnN0IGlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBqb2JzOiBOb25OdWxsYWJsZTxMaWZlU25hcHNob3RbJ2pvYnMnXT4gPSBbXTtcbiAgZm9yIChjb25zdCByYXcgb2YgdmFsdWUuam9icykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCAhdGV4dChyYXcuaWQsIDEyOCkgfHwgIS9eW0EtWmEtejAtOV1bQS1aYS16MC05Ll86JS1dKiQvLnRlc3QocmF3LmlkKVxuICAgICAgfHwgaWRzLmhhcyhyYXcuaWQpIHx8IHJhdy5zdG9ja3BpbGVJZCAhPT0gRk9VTkRFUl9TVE9DS1BJTEVfSURcbiAgICAgIHx8IHJhdy5yZWNpcGUgIT09ICdzZWVkJyAmJiByYXcucmVjaXBlICE9PSAncmF0aW9ucydcbiAgICAgIHx8ICF1aW50KHJhdy5yZW1haW5pbmdUaWNrcywgTUFYX1RJQ0tTX1BFUl9DT01NQU5EKSB8fCByYXcucmVtYWluaW5nVGlja3MgPCAxXG4gICAgICB8fCByYXcucmVtYWluaW5nVGlja3MgPiBSRUNJUEVTW3Jhdy5yZWNpcGVdLnRpY2tzKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBhbiBpbnZhbGlkIHByb2R1Y3Rpb24gam9iJyk7XG4gICAgcmVzZXJ2ZWQgKz0gc3RvY2tUb3RhbChSRUNJUEVTW3Jhdy5yZWNpcGVdLm91dHB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KTtcbiAgICBpZHMuYWRkKHJhdy5pZCk7XG4gICAgam9icy5wdXNoKHsgaWQ6IHJhdy5pZCwgc3RvY2twaWxlSWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCByZWNpcGU6IHJhdy5yZWNpcGUsIHJlbWFpbmluZ1RpY2tzOiByYXcucmVtYWluaW5nVGlja3MgfSk7XG4gIH1cbiAgaWYgKHJlc2VydmVkID4gU1RPQ0tQSUxFX0NBUEFDSVRZKSB0aHJvdyBuZXcgRXJyb3IoJ3N0b2NrcGlsZSByZXNlcnZlZCBvdXRwdXQgZXhjZWVkcyBjYXBhY2l0eScpO1xuICBpZHMuY2xlYXIoKTtcbiAgY29uc3QgY3JvcHM6IE5vbk51bGxhYmxlPExpZmVTbmFwc2hvdFsnY3JvcHMnXT4gPSBbXTtcbiAgZm9yIChjb25zdCByYXcgb2YgdmFsdWUuY3JvcHMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgIUNST1BfUExPVF9JRFMuaW5jbHVkZXMoU3RyaW5nKHJhdy5pZCkpIHx8IGlkcy5oYXMoU3RyaW5nKHJhdy5pZCkpXG4gICAgICB8fCAhdWludChyYXcucGxhbnRlZFRpY2ssIHZhbHVlLnRpY2spIHx8IHJhdy5ncm93dGhUaWNrcyAhPT0gQ1JPUF9HUk9XVEhfVElDS1MpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGFuIGludmFsaWQgY3JvcCBwbG90Jyk7XG4gICAgfVxuICAgIGNvbnN0IHBsb3RJZCA9IFN0cmluZyhyYXcuaWQpO1xuICAgIGlkcy5hZGQocGxvdElkKTtcbiAgICBjcm9wcy5wdXNoKHsgaWQ6IHBsb3RJZCwgcGxhbnRlZFRpY2s6IHJhdy5wbGFudGVkVGljaywgZ3Jvd3RoVGlja3M6IENST1BfR1JPV1RIX1RJQ0tTIH0pO1xuICB9XG4gIHN0b2NrcGlsZXMuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcbiAgam9icy5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICBjcm9wcy5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICByZXR1cm4geyB0aWNrOiB2YWx1ZS50aWNrLCBzdG9ja3BpbGVzLCBqb2JzLCBjcm9wcyB9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNvc3QodmFsdWU6IHVua25vd24pOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+IHtcbiAgY29uc3Qgb3V0ID0gdmFsaWRhdGVJbnZlbnRvcnkodmFsdWUpO1xuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVN0cnVjdHVyZShcbiAgdmFsdWU6IHVua25vd24sIGlkczogU2V0PHN0cmluZz4sIHNjaGVtYTogV29ybGRTbmFwc2hvdFsnc2NoZW1hJ10sXG4pOiBTdHJ1Y3R1cmUge1xuICBpZiAoIWlzT2JqZWN0KHZhbHVlKSB8fCAhdGV4dCh2YWx1ZS5pZCkgfHwgaWRzLmhhcyh2YWx1ZS5pZClcbiAgICB8fCAhdGV4dCh2YWx1ZS5raW5kKSB8fCAhU1RSVUNUVVJFX0tJTkRTLmhhcyh2YWx1ZS5raW5kKVxuICAgIHx8ICF0ZXh0KHZhbHVlLnNpdGVJZClcbiAgICB8fCAhZmluaXRlKHZhbHVlLngpIHx8ICFmaW5pdGUodmFsdWUueSkgfHwgIWZpbml0ZSh2YWx1ZS56KSB8fCAhZmluaXRlKHZhbHVlLnJvdClcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5tb2R1bGVzKSB8fCB2YWx1ZS5tb2R1bGVzLmxlbmd0aCA+IDY0XG4gICAgfHwgIXVpbnQodmFsdWUuYnVpbHRSZXZpc2lvbiwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHx8IHZhbHVlLnByb3Zpc2lvbmFsICE9PSB0cnVlXG4gICAgfHwgc2NoZW1hID09PSBTTkFQU0hPVF9TQ0hFTUEgJiYgdmFsdWUuZGVzaWduVmVyc2lvbiAhPT0gdW5kZWZpbmVkXG4gICAgfHwgc2NoZW1hICE9PSBTTkFQU0hPVF9TQ0hFTUEgJiYgdmFsdWUuZGVzaWduVmVyc2lvbiAhPT0gdW5kZWZpbmVkXG4gICAgICAmJiB2YWx1ZS5kZXNpZ25WZXJzaW9uICE9PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyBhbiBpbnZhbGlkIG9yIGR1cGxpY2F0ZSBzdHJ1Y3R1cmUnKTtcbiAgfVxuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVbJ21vZHVsZXMnXSA9IFtdO1xuICBjb25zdCBtb2R1bGVJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByYXcgb2YgdmFsdWUubW9kdWxlcykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCAhdGV4dChyYXcua2luZCkgfHwgIU1PRFVMRV9LSU5EUy5oYXMocmF3LmtpbmQpXG4gICAgICB8fCAhZmluaXRlKHJhdy54KSB8fCAhZmluaXRlKHJhdy55KSB8fCAhZmluaXRlKHJhdy56KVxuICAgICAgfHwgIWZpbml0ZShyYXcudykgfHwgcmF3LncgPD0gMCB8fCAhZmluaXRlKHJhdy5oKSB8fCByYXcuaCA8PSAwIHx8ICFmaW5pdGUocmF3LmQpIHx8IHJhdy5kIDw9IDBcbiAgICAgIHx8IHJhdy5yb3QgIT09IHVuZGVmaW5lZCAmJiAhZmluaXRlKHJhdy5yb3QpXG4gICAgICB8fCByYXcudG9uZSAhPT0gdW5kZWZpbmVkICYmICh0eXBlb2YgcmF3LnRvbmUgIT09ICdzdHJpbmcnIHx8ICFNT0RVTEVfVE9ORVMuaGFzKHJhdy50b25lKSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgc3RydWN0dXJlICR7dmFsdWUuaWR9IGNvbnRhaW5zIGFuIGludmFsaWQgbW9kdWxlYCk7XG4gICAgfVxuICAgIGNvbnN0IHNpZ25hdHVyZSA9IEpTT04uc3RyaW5naWZ5KHJhdyk7XG4gICAgaWYgKG1vZHVsZUlkcy5oYXMoc2lnbmF0dXJlKSkgdGhyb3cgbmV3IEVycm9yKGBzdHJ1Y3R1cmUgJHt2YWx1ZS5pZH0gY29udGFpbnMgZHVwbGljYXRlIG1vZHVsZXNgKTtcbiAgICBtb2R1bGVJZHMuYWRkKHNpZ25hdHVyZSk7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6IHJhdy5raW5kIGFzIFN0cnVjdHVyZVsnbW9kdWxlcyddW251bWJlcl1bJ2tpbmQnXSxcbiAgICAgIHg6IHJhdy54LCB5OiByYXcueSwgejogcmF3LnosIHc6IHJhdy53LCBoOiByYXcuaCwgZDogcmF3LmQsXG4gICAgICAuLi4ocmF3LnJvdCA9PT0gdW5kZWZpbmVkID8ge30gOiB7IHJvdDogcmF3LnJvdCB9KSxcbiAgICAgIC4uLihyYXcudG9uZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IHRvbmU6IHJhdy50b25lIGFzIFN0cnVjdHVyZVsnbW9kdWxlcyddW251bWJlcl1bJ3RvbmUnXSB9KSxcbiAgICB9KTtcbiAgfVxuICBpZHMuYWRkKHZhbHVlLmlkKTtcbiAgcmV0dXJuIHtcbiAgICBpZDogdmFsdWUuaWQsIGtpbmQ6IHZhbHVlLmtpbmQgYXMgU3RydWN0dXJlWydraW5kJ10sIHNpdGVJZDogdmFsdWUuc2l0ZUlkLFxuICAgIHg6IHZhbHVlLngsIHk6IHZhbHVlLnksIHo6IHZhbHVlLnosIHJvdDogdmFsdWUucm90LFxuICAgIG1vZHVsZXMsIGNvc3Q6IHZhbGlkYXRlQ29zdCh2YWx1ZS5jb3N0KSwgYnVpbHRSZXZpc2lvbjogdmFsdWUuYnVpbHRSZXZpc2lvbixcbiAgICAuLi4odmFsdWUuZGVzaWduVmVyc2lvbiA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGRlc2lnblZlcnNpb246IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSksXG4gICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gIH07XG59XG5cbi8qKiBTdHJpY3QgcnVudGltZSB2YWxpZGF0aW9uOyBKU09OJ3MgVHlwZVNjcmlwdCBjYXN0cyBhcmUgbmV2ZXIgdHJ1c3RlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVdvcmxkU25hcHNob3QodmFsdWU6IHVua25vd24pOiBXb3JsZFNuYXBzaG90IHtcbiAgaWYgKCFpc09iamVjdCh2YWx1ZSlcbiAgICB8fCB2YWx1ZS5zY2hlbWEgIT09IFNOQVBTSE9UX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IERFU0lHTl9TTkFQU0hPVF9TQ0hFTUFcbiAgICAmJiB2YWx1ZS5zY2hlbWEgIT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BXG4gICAgfHwgIWlzT2JqZWN0KHZhbHVlLm1hbmlmZXN0KSkge1xuICAgIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgb3IgbWFsZm9ybWVkIHdvcmxkIHNuYXBzaG90Jyk7XG4gIH1cbiAgY29uc3Qgc2NoZW1hID0gdmFsdWUuc2NoZW1hO1xuICBjb25zdCBtID0gdmFsdWUubWFuaWZlc3Q7XG4gIC8vIEV2ZXJ5IHN1cHBvcnRlZCBnZW5lcmF0b3IgcmVzdG9yZXMgd2l0aCBpdHMgb3duIHZlcnNpb247IHYxIHNhdmVzIGtlZXBcbiAgLy8gR0VORVJBVE9SX1ZFUlNJT04gZXhhY3RseSwgc28gdGhlaXIgbWFuaWZlc3RzIGFuZCBoYXNoZXMgYXJlIHVuY2hhbmdlZC5cbiAgY29uc3QgcGFyYW1zID0ge1xuICAgIHNpemU6IDIwNDgsIGNodW5rU2l6ZTogQ0hVTktfU0laRSwgeU1pbjogLTE2LCB5TWF4OiAxMTIsXG4gICAgc2VhTGV2ZWw6IDAsIGdlbmVyYXRvclZlcnNpb246IGlzU3VwcG9ydGVkR2VuZXJhdG9yKG0uZ2VuZXJhdG9yVmVyc2lvbikgPyBtLmdlbmVyYXRvclZlcnNpb24gOiBHRU5FUkFUT1JfVkVSU0lPTixcbiAgfTtcbiAgaWYgKG0uc2NoZW1hICE9PSAxIHx8ICF1aW50KG0uc2VlZCwgMHhmZmZmZmZmZilcbiAgICB8fCAhaXNTdXBwb3J0ZWRHZW5lcmF0b3IobS5nZW5lcmF0b3JWZXJzaW9uKVxuICAgIHx8IG0uc2l6ZSAhPT0gcGFyYW1zLnNpemUgfHwgbS5jaHVua1NpemUgIT09IHBhcmFtcy5jaHVua1NpemVcbiAgICB8fCBtLnlNaW4gIT09IHBhcmFtcy55TWluIHx8IG0ueU1heCAhPT0gcGFyYW1zLnlNYXggfHwgbS5zZWFMZXZlbCAhPT0gcGFyYW1zLnNlYUxldmVsXG4gICAgfHwgIS9eWzAtOWEtZl17OH0kLy50ZXN0KFN0cmluZyhtLnBhcmFtc0hhc2gpKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZ2VuZXJhdG9yIGNvbmZpZ3VyYXRpb24gaXMgdW5zdXBwb3J0ZWQgb3IgaW5jb21wYXRpYmxlJyk7XG4gIH1cbiAgaWYgKCF1aW50KHZhbHVlLnJldmlzaW9uLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUilcbiAgICB8fCAhdWludCh2YWx1ZS5uZXh0U2VxdWVuY2UsIDEwXzAwMF8wMDApXG4gICAgfHwgdHlwZW9mIHZhbHVlLmF1dGhvcmVkUGxhY2VkICE9PSAnYm9vbGVhbidcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5lZGl0cykgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuZW50aXRpZXMpXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuZW50aXR5UmVtb3ZhbHMpXG4gICAgfHwgdmFsdWUuZW50aXRpZXMubGVuZ3RoID4gTUFYX1NOQVBTSE9UX0VOVElUSUVTXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuZW50aXR5Q2h1bmtzKSB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5zdHJ1Y3R1cmVzKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGludmFsaWQgYXV0aG9yaXRhdGl2ZS1zdGF0ZSBmaWVsZHMnKTtcbiAgfVxuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKG0uc2VlZCwgcGFyYW1zLmdlbmVyYXRvclZlcnNpb24pO1xuICAvLyBUaGUgbWFuaWZlc3QgaGFzaCBpcyBjaGVja2VkIGFnYWluc3QgdGhlIGFjdHVhbCByZXN0b3JlZCBjb25maWd1cmF0aW9uLlxuICBpZiAod29ybGRNYW5pZmVzdCh3b3JsZCkucGFyYW1zSGFzaCAhPT0gbS5wYXJhbXNIYXNoKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IG1hbmlmZXN0IGhhc2ggbWlzbWF0Y2gnKTtcblxuICBjb25zdCBlZGl0czogV29ybGRTbmFwc2hvdFsnZWRpdHMnXSA9IFtdO1xuICBsZXQgZWRpdENvdW50ID0gMDtcbiAgY29uc3QgY2h1bmtJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByYXcgb2YgdmFsdWUuZWRpdHMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgIXZhbGlkQ2h1bmsocmF3LmNodW5rKSB8fCBjaHVua0lkcy5oYXMocmF3LmNodW5rKVxuICAgICAgfHwgIUFycmF5LmlzQXJyYXkocmF3LmNlbGxzKSB8fCByYXcuY2VsbHMubGVuZ3RoID4gQ0hVTktfVk9MVU1FKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGludmFsaWQgY2h1bmsgZWRpdHMnKTtcbiAgICB9XG4gICAgY29uc3QgY2VsbElkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICAgIGNvbnN0IGNlbGxzOiBBcnJheTx7IGk6IG51bWJlcjsgbTogbnVtYmVyIH0+ID0gW107XG4gICAgZm9yIChjb25zdCBjZWxsIG9mIHJhdy5jZWxscykge1xuICAgICAgaWYgKCFpc09iamVjdChjZWxsKSB8fCAhdWludChjZWxsLmksIENIVU5LX1ZPTFVNRSAtIDEpIHx8IGNlbGxJZHMuaGFzKGNlbGwuaSlcbiAgICAgICAgfHwgIXVpbnQoY2VsbC5tLCBNQVhfTUFUX0lEKSkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyBhbiBpbnZhbGlkIHZveGVsIGVkaXQnKTtcbiAgICAgIGNlbGxJZHMuYWRkKGNlbGwuaSk7XG4gICAgICBjZWxscy5wdXNoKHsgaTogY2VsbC5pLCBtOiBjZWxsLm0gfSk7XG4gICAgfVxuICAgIGNlbGxJZHMuY2xlYXIoKTtcbiAgICBjZWxscy5zb3J0KChhLCBiKSA9PiBhLmkgLSBiLmkpO1xuICAgIGVkaXRDb3VudCArPSBjZWxscy5sZW5ndGg7XG4gICAgaWYgKGVkaXRDb3VudCA+IE1BWF9TTkFQU0hPVF9FRElUUykgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBleGNlZWRzIHRoZSBib3VuZGVkIGVkaXQgbGltaXQnKTtcbiAgICBjaHVua0lkcy5hZGQocmF3LmNodW5rKTtcbiAgICBlZGl0cy5wdXNoKHsgY2h1bms6IHJhdy5jaHVuaywgY2VsbHMgfSk7XG4gIH1cbiAgZWRpdHMuc29ydCgoYSwgYikgPT4gYS5jaHVuay5sb2NhbGVDb21wYXJlKGIuY2h1bmspKTtcblxuICBjb25zdCBlbnRpdHlJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3QgZW50aXRpZXMgPSB2YWx1ZS5lbnRpdGllcy5tYXAoKGUpID0+IHZhbGlkYXRlRW50aXR5KGUsIGVudGl0eUlkcykpO1xuICBjb25zdCBlbnRpdHlDaHVua3M6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGdlbmVyYXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IGtleSBvZiB2YWx1ZS5lbnRpdHlDaHVua3MpIHtcbiAgICBpZiAoIXZhbGlkQ2h1bmsoa2V5KSB8fCBnZW5lcmF0ZWQuaGFzKGtleSkpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZ2VuZXJhdGVkLWNodW5rIGluZGV4IGlzIGludmFsaWQnKTtcbiAgICBnZW5lcmF0ZWQuYWRkKGtleSk7XG4gICAgZW50aXR5Q2h1bmtzLnB1c2goa2V5KTtcbiAgfVxuICBmb3IgKGNvbnN0IGVudGl0eSBvZiBlbnRpdGllcykge1xuICAgIGlmICghZW50aXR5LmF1dGhvcmVkICYmICFnZW5lcmF0ZWQuaGFzKGVudGl0eS5jaHVuaykpIHRocm93IG5ldyBFcnJvcihgZW50aXR5ICR7ZW50aXR5LmlkfSBiZWxvbmdzIHRvIGFuIHVubWFya2VkIGNodW5rYCk7XG4gIH1cbiAgZW50aXR5Q2h1bmtzLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG4gIGNvbnN0IHJlbW92YWxzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgaWQgb2YgdmFsdWUuZW50aXR5UmVtb3ZhbHMpIHtcbiAgICBpZiAoIXRleHQoaWQpIHx8IHJlbW92YWxzLmhhcyhpZCkgfHwgZW50aXR5SWRzLmhhcyhpZCkgfHwgIS9eZTpcXGQrLFxcZCs6XFxkKyQvLnRlc3QoaWQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGVudGl0eSB0b21ic3RvbmUgaXMgaW52YWxpZCcpO1xuICAgIH1cbiAgICByZW1vdmFscy5hZGQoaWQpO1xuICB9XG4gIGNvbnN0IGVudGl0eVJlbW92YWxzID0gWy4uLnJlbW92YWxzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXG4gIGNvbnN0IHN0cnVjdHVyZUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBzdHJ1Y3R1cmVzID0gdmFsdWUuc3RydWN0dXJlcy5tYXAoKHMpID0+IHZhbGlkYXRlU3RydWN0dXJlKHMsIHN0cnVjdHVyZUlkcywgc2NoZW1hKSlcbiAgICAuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcbiAgY29uc3QgY2FycmllZCA9IHZhbGlkYXRlSW52ZW50b3J5KHZhbHVlLmludmVudG9yeSk7XG4gIGlmIChzY2hlbWEgPT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BICYmIHN0b2NrVG90YWwoY2FycmllZCkgPiBDQVJSSUVEX0NBUEFDSVRZKSB0aHJvdyBuZXcgRXJyb3IoJ2NhcnJpZWQgaW52ZW50b3J5IGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgY29uc3Qgc25hcHNob3Q6IEJhc2VXb3JsZFNuYXBzaG90ID0ge1xuICAgIHNjaGVtYSxcbiAgICBtYW5pZmVzdDoge1xuICAgICAgc2NoZW1hOiAxLCBzZWVkOiBtLnNlZWQsIGdlbmVyYXRvclZlcnNpb246IHBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgICAgc2l6ZTogcGFyYW1zLnNpemUsIGNodW5rU2l6ZTogcGFyYW1zLmNodW5rU2l6ZSwgeU1pbjogcGFyYW1zLnlNaW4sXG4gICAgICB5TWF4OiBwYXJhbXMueU1heCwgc2VhTGV2ZWw6IHBhcmFtcy5zZWFMZXZlbCwgcGFyYW1zSGFzaDogbS5wYXJhbXNIYXNoLFxuICAgIH0sXG4gICAgcmV2aXNpb246IHZhbHVlLnJldmlzaW9uLFxuICAgIGVkaXRzLFxuICAgIGVudGl0aWVzLFxuICAgIGVudGl0eUNodW5rcyxcbiAgICBlbnRpdHlSZW1vdmFscyxcbiAgICBpbnZlbnRvcnk6IGNhcnJpZWQsXG4gICAgc3RydWN0dXJlcyxcbiAgICBhdXRob3JlZFBsYWNlZDogdmFsdWUuYXV0aG9yZWRQbGFjZWQsXG4gICAgbmV4dFNlcXVlbmNlOiB2YWx1ZS5uZXh0U2VxdWVuY2UsXG4gIH07XG4gIGNvbnN0IHJlc3VsdDogV29ybGRTbmFwc2hvdCA9IHNjaGVtYSA9PT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUFcbiAgICA/IHsgLi4uc25hcHNob3QsIHNjaGVtYTogQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEsIC4uLnZhbGlkYXRlTGlmZUZpZWxkcyh2YWx1ZSkgfVxuICAgIDogeyAuLi5zbmFwc2hvdCwgc2NoZW1hOiBzY2hlbWEgYXMgdHlwZW9mIFNOQVBTSE9UX1NDSEVNQSB8IHR5cGVvZiBERVNJR05fU05BUFNIT1RfU0NIRU1BIH07XG4gIGlmIChKU09OLnN0cmluZ2lmeShyZXN1bHQpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIHVua25vd24sIG5vbi1jYW5vbmljYWwgb3IgYW1iaWd1b3VzIGZpZWxkcycpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVXb3JsZFNuYXBzaG90KGpzb246IHN0cmluZyk6IFdvcmxkU25hcHNob3Qge1xuICBpZiAoanNvbi5sZW5ndGggPiBNQVhfU05BUFNIT1RfSlNPTl9CWVRFUykgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBleGNlZWRzIHRoZSBKU09OIHNpemUgbGltaXQnKTtcbiAgcmV0dXJuIHZhbGlkYXRlV29ybGRTbmFwc2hvdChKU09OLnBhcnNlKGpzb24pKTtcbn1cblxuLyoqIFJlc3RvcmUgaW4gcGxhY2Ugc28gY29udHJvbGxlcnMgcmV0YWluIHRoZSBzYW1lIFdvcmxkIHJlZmVyZW5jZS4gQWxsXG4gKiB2YWxpZGF0aW9uIGhhcHBlbnMgYmVmb3JlIG11dGF0aW9uLCBzbyBhIHJlamVjdGVkIHNhdmUgY2Fubm90IGVyYXNlIHdvcmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQ6IFdvcmxkLCBpbnB1dDogV29ybGRTbmFwc2hvdCk6IHZvaWQge1xuICAvLyBPcmRpbmFyeSBzbmFwc2hvdHMgYW5kIHRyYW5zYWN0aW9uYWwgcm9sbGJhY2tzIHJlc3RvcmUgdGhlaXIgZXhhY3QgcmVjb3JkZWRcbiAgLy8gc3RhdGUuIFJldGlyZWQgaGlzdG9yaWNhbCBlbnRpdGllcyBhcmUgcmVtb3ZlZCBvbmx5IGFmdGVyIEdhbWVTZXNzaW9uIGhhc1xuICAvLyBhdXRoZW50aWNhdGVkIHRoZSBvcmlnaW5hbCBqb3VybmFsIGFuZCBleHBsaWNpdGx5IG1pZ3JhdGVkIHRoYXQgc2F2ZS5cbiAgZmluaXNoU3RvbmVSZXBsYXkod29ybGQpO1xuICByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0KHdvcmxkLCBpbnB1dCk7XG59XG5cbi8qKiBAaW50ZXJuYWwgSGlzdG9yaWNhbCByZWNvbnN0cnVjdGlvbiBvciBleGFjdCBuZXctc25hcHNob3QgcmVzdG9yYXRpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCh3b3JsZDogV29ybGQsIGlucHV0OiBXb3JsZFNuYXBzaG90KTogdm9pZCB7XG4gIGNvbnN0IHNuYXBzaG90ID0gdmFsaWRhdGVXb3JsZFNuYXBzaG90KGlucHV0KTtcbiAgaWYgKHNuYXBzaG90Lm1hbmlmZXN0LnNlZWQgIT09IHdvcmxkLnNlZWQpIHRocm93IG5ldyBFcnJvcignc25hcHNob3Qgc2VlZCBkb2VzIG5vdCBtYXRjaCB0aGUgd29ybGQnKTtcbiAgd29ybGQucGFyYW1zID0ge1xuICAgIHNpemU6IHNuYXBzaG90Lm1hbmlmZXN0LnNpemUsXG4gICAgY2h1bmtTaXplOiBzbmFwc2hvdC5tYW5pZmVzdC5jaHVua1NpemUsXG4gICAgeU1pbjogc25hcHNob3QubWFuaWZlc3QueU1pbixcbiAgICB5TWF4OiBzbmFwc2hvdC5tYW5pZmVzdC55TWF4LFxuICAgIHNlYUxldmVsOiBzbmFwc2hvdC5tYW5pZmVzdC5zZWFMZXZlbCxcbiAgICBnZW5lcmF0b3JWZXJzaW9uOiBzbmFwc2hvdC5tYW5pZmVzdC5nZW5lcmF0b3JWZXJzaW9uLFxuICB9O1xuICB3b3JsZC5jaHVua3MuY2xlYXIoKTtcbiAgd29ybGQuZW50aXRpZXMuY2xlYXIoKTtcbiAgd29ybGQuZW50aXR5Q2h1bmtzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuY2xlYXIoKTtcbiAgd29ybGQuZW50aXR5UmVtb3ZhbHMuY2xlYXIoKTtcbiAgd29ybGQuc3RydWN0dXJlcy5jbGVhcigpO1xuICB3b3JsZC5lZGl0cy5jbGVhcigpO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7IC4uLnNuYXBzaG90LmludmVudG9yeSB9O1xuICB3b3JsZC5saWZlID0gc25hcHNob3Quc2NoZW1hID09PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSA/IGNyZWF0ZUxpZmVTdGF0ZSgpIDogdW5kZWZpbmVkO1xuICBpZiAod29ybGQubGlmZSAmJiBzbmFwc2hvdC5zY2hlbWEgPT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BKSB7XG4gICAgd29ybGQubGlmZS50aWNrID0gc25hcHNob3QudGljaztcbiAgICBmb3IgKGNvbnN0IHMgb2Ygc25hcHNob3Quc3RvY2twaWxlcykgd29ybGQubGlmZS5zdG9ja3BpbGVzLnNldChzLmlkLCB7IC4uLnMsIGludmVudG9yeTogeyAuLi5zLmludmVudG9yeSB9IH0pO1xuICAgIGZvciAoY29uc3QgaiBvZiBzbmFwc2hvdC5qb2JzKSB3b3JsZC5saWZlLmpvYnMuc2V0KGouaWQsIHsgLi4uaiB9KTtcbiAgICBmb3IgKGNvbnN0IGMgb2Ygc25hcHNob3QuY3JvcHMpIHdvcmxkLmxpZmUuY3JvcHMuc2V0KGMuaWQsIHsgLi4uYyB9KTtcbiAgfVxuICB3b3JsZC5kaXJ0eS5jbGVhcigpO1xuICB3b3JsZC5zaXRlcyA9IFtdO1xuICB3b3JsZC5zdGF0cyA9IHtcbiAgICBjaHVua3NHZW5lcmF0ZWQ6IDAsIGNodW5rc0V2aWN0ZWQ6IDAsIHZveGVsc0ZpbGxlZDogMCwgZ2VuZXJhdGlvbk1zOiAwLFxuICAgIGVudGl0aWVzOiBzbmFwc2hvdC5lbnRpdGllcy5sZW5ndGgsIHRyZWVzOiAwLCBwaW5rVHJlZXM6IDAsIHBpbmtPdmVyZmxvdzogMCxcbiAgfTtcbiAgd29ybGQucmV2aXNpb24gPSBzbmFwc2hvdC5yZXZpc2lvbjtcbiAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSBzbmFwc2hvdC5hdXRob3JlZFBsYWNlZDtcbiAgZm9yIChjb25zdCBrZXkgb2Ygc25hcHNob3QuZW50aXR5Q2h1bmtzKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuICAvLyBBcHBseSBkdXJhYmxlIHZveGVsIGVkaXRzIGJlZm9yZSBhbnkgYXV0aG9yZWQtc2l0ZSBxdWVyeSBjYW4gZ2VuZXJhdGUgYVxuICAvLyBjaHVuay4gT3RoZXJ3aXNlIHRob3NlIGNodW5rcyBjYWNoZSB0aGUgdW5lZGl0ZWQgYmFzZSB0ZXJyYWluIHBlcm1hbmVudGx5LlxuICBmb3IgKGNvbnN0IGRlbHRhIG9mIHNuYXBzaG90LmVkaXRzKSB7XG4gICAgd29ybGQuZWRpdHMuc2V0KGRlbHRhLmNodW5rLCBuZXcgTWFwKGRlbHRhLmNlbGxzLm1hcCgoZSkgPT4gW2UuaSwgZS5tIGFzIE1hdElkXSkpKTtcbiAgfVxuICBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkKTtcbiAgLy8gUmVjcmVhdGUgYXV0aG9yZWQgc2l0ZSByZWNvcmRzLiBTdXBwcmVzcyB0aGVpciBlbnRpdHkgcGxhY2VtZW50IHNvIHRoZVxuICAvLyBleGFjdCBzYXZlZCBlbnRpdHkgcmVjb3JkcyBiZWxvdyBjYW5ub3QgYmUgYWZmZWN0ZWQgYnkgYSBtb2RpZmllZCBjaHVuay5cbiAgaWYgKHdvcmxkLmF1dGhvcmVkUGxhY2VkKSB7XG4gICAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSBmYWxzZTtcbiAgICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICAgIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gdHJ1ZTtcbiAgfVxuICAvLyBBdXRob3JlZCBwbGFjZW1lbnQgZGVyaXZlcyBzaXRlL2VudGl0eSBzY2FmZm9sZGluZyBhbmQgbWF5IGFkdmFuY2UgdGhlXG4gIC8vIHJldmlzaW9uLiBUaGUgc2F2ZWQgcmV2aXNpb24gaXMgcmVzdG9yZWQgb25seSBhZnRlciB0aGF0IGRlcml2ZWQgd29yay5cbiAgd29ybGQucmV2aXNpb24gPSBzbmFwc2hvdC5yZXZpc2lvbjtcbiAgLy8gVG9tYnN0b25lcyBtdXN0IGV4aXN0IGJlZm9yZSBhbnkgY2hhbmdlZCBjaHVuayByZWdlbmVyYXRlcyBpdHMgZW50aXRpZXMuXG4gIGZvciAoY29uc3QgaWQgb2Ygc25hcHNob3QuZW50aXR5UmVtb3ZhbHMpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChpZCk7XG4gIC8vIFJlcGxhY2UgZ2VuZXJhdGVkIGVudGl0aWVzIHdpdGggdGhlIGV4YWN0IHNhdmVkIHJlY29yZHMsIGluY2x1ZGluZ1xuICAvLyBoYXJ2ZXN0ZWQvcmVtb3ZlZCBvbmVzLlxuICB3b3JsZC5lbnRpdGllcy5jbGVhcigpO1xuICB3b3JsZC5lbnRpdHlDaHVua3MuY2xlYXIoKTtcbiAgLy8gSW5zdGFsbCBwZXJzaXN0ZWQgZW50aXR5IGRlbHRhcyBkaXJlY3RseS4gVGhpcyBpcyByZWNvbnN0cnVjdGlvbiwgbm90IGFcbiAgLy8gY29tbWFuZDogcmVtb3ZlRW50aXR5IHdvdWxkIGNyZWF0ZSBmcmVzaCB0b21ic3RvbmVzIGFuZCBhZHZhbmNlIHJldmlzaW9uLlxuICBmb3IgKGNvbnN0IGtleSBvZiBzbmFwc2hvdC5lbnRpdHlDaHVua3MpIHtcbiAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBzbmFwc2hvdCByZWZlcmVuY2VzIHVuYXZhaWxhYmxlIGNodW5rICR7a2V5fWApO1xuICAgIGNvbnN0IHNhdmVkID0gbmV3IFNldChzbmFwc2hvdC5lbnRpdGllcy5maWx0ZXIoKGUpID0+IGUuY2h1bmsgPT09IGtleSkubWFwKChlKSA9PiBlLmlkKSk7XG4gICAgLy8gQXV0aG9yZWQgZW50aXRpZXMgZm9yIHRoZSBzYW1lIGNodW5rIHN1cnZpdmUgYWxvbmdzaWRlIG5hdHVyYWwgZGVsdGFzLlxuICAgIGNvbnN0IGlkcyA9ICh3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkgPz8gW10pLmZpbHRlcigoaWQpID0+IHtcbiAgICAgIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICByZXR1cm4gIWlkLnN0YXJ0c1dpdGgoJ2U6JykgJiYgISFlbnRpdHlcbiAgICAgICAgJiYgKCFpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpIHx8IGlzU3RvbmVSZXBsYXkod29ybGQpKTtcbiAgICB9KTtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIFsuLi53b3JsZC5lbnRpdGllcy5rZXlzKCldKSB7XG4gICAgICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgaWYgKGVudGl0eT8uY2h1bmsgPT09IGtleSAmJiAhZW50aXR5LmF1dGhvcmVkICYmICFzYXZlZC5oYXMoaWQpKSB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGlkIG9mIHNhdmVkKSBpZiAoIWlkcy5pbmNsdWRlcyhpZCkpIGlkcy5wdXNoKGlkKTtcbiAgICB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgaWRzKTtcbiAgfVxuICBmb3IgKGNvbnN0IGUgb2Ygc25hcHNob3QuZW50aXRpZXMpIHtcbiAgICB3b3JsZC5lbnRpdGllcy5zZXQoZS5pZCwgY2xvbmVFbnRpdHkoZSkpO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IG9mIHNuYXBzaG90LmVudGl0eUNodW5rcykgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICBmb3IgKGNvbnN0IGUgb2Ygd29ybGQuZW50aXRpZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICB9XG4gIGZvciAoY29uc3QgcyBvZiBzbmFwc2hvdC5zdHJ1Y3R1cmVzKSB3b3JsZC5zdHJ1Y3R1cmVzLnNldChzLmlkLCBjbG9uZVN0cnVjdHVyZShzKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZEZyb21TbmFwc2hvdChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCk6IFdvcmxkIHtcbiAgY29uc3QgdmFsaWQgPSB2YWxpZGF0ZVdvcmxkU25hcHNob3Qoc25hcHNob3QpO1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHZhbGlkLm1hbmlmZXN0LnNlZWQsIHZhbGlkLm1hbmlmZXN0LmdlbmVyYXRvclZlcnNpb24pO1xuICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgdmFsaWQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8qKiBSYXcgb2xkIHN0YXRlIGlzIHVzZWQgb25seSB3aGlsZSB2YWxpZGF0aW5nIGEgcmVjb3JkZWQgYWNjZXB0ZWQgam91cm5hbC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoaXN0b3JpY2FsV29ybGRGcm9tU25hcHNob3Qoc25hcHNob3Q6IFdvcmxkU25hcHNob3QpOiBXb3JsZCB7XG4gIGNvbnN0IHZhbGlkID0gdmFsaWRhdGVXb3JsZFNuYXBzaG90KHNuYXBzaG90KTtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCh2YWxpZC5tYW5pZmVzdC5zZWVkKTtcbiAgZW5hYmxlU3RvbmVSZXBsYXkod29ybGQpO1xuICByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0KHdvcmxkLCB2YWxpZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cbiIsICIvLyBNMDAyIHBsYXlhYmxlIGZpcnN0IHNsaWNlIFx1MjAxNCB0aGUgdGhyZWUgYXV0aG9yZWQgcHJvamVjdHMgYXMgcGxhaW4gZGF0YS5cbi8vXG4vLyBUaGlzIG1vZHVsZSBpcyBkZWxpYmVyYXRlbHkgRE9NLWZyZWUuIFRoZSBidWlsZCBzaWRlYmFyLCB0aGUgZ2hvc3QgcHJldmlld1xuLy8gYW5kIHRoZSB0ZXN0cyBhbGwgcmVhZCB0aGUgc2FtZSBkZWZpbml0aW9ucyBhbmQgY2FsbCB0aGUgc2FtZSBzaW11bGF0aW9uXG4vLyBlbnRyeSBwb2ludHM7IGEgcHJvamVjdCBjYW5ub3QgYWR2ZXJ0aXNlIG9uZSBmb290cHJpbnQsIHByaWNlIG9yIHByZXBhcmF0aW9uXG4vLyBzdGVwIGFuZCB0aGVuIGV4ZWN1dGUgYW5vdGhlci5cbmltcG9ydCB7IE1BVCwgV29ybGQsIFJlc291cmNlVHlwZSB9IGZyb20gJy4uL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBSZWN0IH0gZnJvbSAnLi4vc2ltL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgQnVpbGRpbmdSdWxlcywgSE9VU0VfUlVMRVMsIFBBVEhfUlVMRVMsIEZBUk1fUlVMRVMsXG4gIFNpdGVQcm9wb3NhbCwgU2l0ZVByZXZpZXcsIFNpdGVTdGF0ZSwgVmFsaWRhdGlvblJlYXNvbiwgcHJldmlld1NpdGUsXG59IGZyb20gJy4uL3NpbS9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHtcbiAgTTAwMl9MQVlPVVQsIE0wMDJfUEFUSF9TSVRFX0lELCBNMDAyX1RFUlJBQ0VfQkFORFMsXG59IGZyb20gJy4uL3NpbS9tMDAyJztcbmltcG9ydCB7XG4gIG0wMDJGYXJtVGFyZ2V0cywgbTAwMlBhdGhSZWN0LCBtMDAyUGF0aFRhcmdldHMsXG59IGZyb20gJy4uL3NpbS9zY2VuYXJpbyc7XG5pbXBvcnQge1xuICBDb2x1bW5UYXJnZXQsIExvY2FsQXV0aG9yaXplciwgUHJlcGFyYXRpb25MZWRnZXIsIFByZXBhcmF0aW9uT3B0aW9ucyxcbiAgUGxhblJlc3VsdCwgcGxhblByZXBhcmF0aW9uLCBwcmVwYXJlU2l0ZSxcbn0gZnJvbSAnLi4vc2ltL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7IGNyZWF0ZVdvcmxkU25hcHNob3QsIHJlc3RvcmVXb3JsZFNuYXBzaG90IH0gZnJvbSAnLi4vc2ltL3NuYXBzaG90JztcblxuaW1wb3J0IHtcbiAgSE9VU0VfQ09TVCwgVEVSUkFDRV9DT1NULCBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsIFN0cnVjdHVyZSxcbiAgU3RydWN0dXJlS2luZCwgU3RydWN0dXJlTGVkZ2VyLCBTdHJ1Y3R1cmVQcm9wb3NhbCwgU3RydWN0dXJlRGVzaWduVmVyc2lvbixcbiAgYnVpbGRTdHJ1Y3R1cmUsIHBhdGhDb3N0LFxufSBmcm9tICcuLi9zaW0vc3RydWN0dXJlcyc7XG5cbmV4cG9ydCB0eXBlIE0yUHJvamVjdElkID0gJ2hvdXNlJyB8ICdwYXRoJyB8ICdmYXJtJztcblxuZXhwb3J0IGludGVyZmFjZSBNMkdob3N0QmFuZCB7XG4gIHowOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMlByb2plY3Qge1xuICBpZDogTTJQcm9qZWN0SWQ7XG4gIG5hbWU6IHN0cmluZztcbiAgc3VidGl0bGU6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbiAgY29zdDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgZG9vcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHRlcnJhY2VzPzogbnVtYmVyO1xuICBwcmVwOiBQcmVwYXJhdGlvbk9wdGlvbnM7XG4gIGdob3N0QmFuZHM/OiByZWFkb25seSBNMkdob3N0QmFuZFtdO1xufVxuXG5jb25zdCBwYXRoUmVjdCA9IG0wMDJQYXRoUmVjdCgpO1xuY29uc3QgcGF0aFRhcmdldHM6IENvbHVtblRhcmdldFtdID0gbTAwMlBhdGhUYXJnZXRzKCk7XG5jb25zdCBmYXJtVGFyZ2V0czogQ29sdW1uVGFyZ2V0W10gPSBtMDAyRmFybVRhcmdldHMoKTtcblxuLyoqXG4gKiBUaGUgZmlyc3QgcGxheWFibGUgc2xpY2UgaW4gdGhlIHBpbm5lZCBvcmRlcjogYSBob3VzZSBvbiB0aGUgcHJlcGFyZWQgc2hlbGYsXG4gKiBhIHN0ZXBwZWQgcGF0aCBmcm9tIGl0cyBkb29yLCBhbmQgYSB0ZXJyYWNlZCBmaWVsZCBvbiB0aGUgc2xvcGUgYmVsb3cuXG4gKi9cbmV4cG9ydCBjb25zdCBNMl9QUk9KRUNUUzogcmVhZG9ubHkgTTJQcm9qZWN0W10gPSBbXG4gIHtcbiAgICBpZDogJ2hvdXNlJyxcbiAgICBuYW1lOiBcIkZvdW5kZXIncyBob3VzZVwiLFxuICAgIHN1YnRpdGxlOiAnOCB4IDYgbSBcdTAwQjcgZmxhdCBzdG9uZSBzaGVsZicsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIDE5LW1vZHVsZSBmb3VuZGVyIGNhbmRpZGF0ZSB1c2VzIGEgZmxhdCBzdG9uZSBmb3VuZGF0aW9uLCBhIDMuMiBtIHN0b3JleSwgYSByZWFsIGVhc3QgZG9vcndheSAnXG4gICAgICArICdhbmQgdHdvIG9wZW4gc291dGggd2luZG93cy4gU3RydWN0dXJhbCB3YWxsIHZvaWRzIHJlcXVpcmUgbW9yZSBwcmltaXRpdmVzIHRoYW4gdGhlIHByb3Zpc2lvbmFsICdcbiAgICAgICsgJ2Fzc2V0LXZvbHVtZSB0YXJnZXQ7IHRoaXMgZGVzaWduIHJlbWFpbnMgc3ViamVjdCB0byBhcnQgcmV2aWV3LicsXG4gICAgc2l0ZUlkOiBNMDAyX0xBWU9VVC5ob3VzZS5pZCxcbiAgICBraW5kOiAnaG91c2UnLFxuICAgIHJlY3Q6IE0wMDJfTEFZT1VULmhvdXNlLnJlY3QsXG4gICAgZmxvb3JZOiBNMDAyX0xBWU9VVC5ob3VzZS5mbG9vclksXG4gICAgcnVsZXM6IEhPVVNFX1JVTEVTLFxuICAgIGNvc3Q6IHsgLi4uSE9VU0VfQ09TVCB9LFxuICAgIGRvb3I6IE0wMDJfTEFZT1VULmhvdXNlLmRvb3IsXG4gICAgYXBwcm9hY2g6IE0wMDJfTEFZT1VULmhvdXNlLmFwcHJvYWNoLFxuICAgIHByZXA6IHt9LFxuICB9LFxuICB7XG4gICAgaWQ6ICdwYXRoJyxcbiAgICBuYW1lOiAnRG9vciBwYXRoJyxcbiAgICBzdWJ0aXRsZTogJzkgeCAzIG0gXHUwMEI3IHN0ZXBwZWQgZ3JhdmVsJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdBIG5pbmUtbWV0cmUgY29ycmlkb3IgZnJvbSB0aGUgaG91c2UgZG9vciB0byB0aGUgYXBwcm9hY2guICdcbiAgICAgICsgJ0VhY2ggY29sdW1uIGlzIGN1dCB0byBhIHBpbm5lZCBwcm9maWxlIHNvIHRoZSByaXNlIHN0YXlzIHdhbGthYmxlLicsXG4gICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICBraW5kOiAncGF0aCcsXG4gICAgcmVjdDogcGF0aFJlY3QsXG4gICAgZmxvb3JZOiAxMixcbiAgICBydWxlczogUEFUSF9SVUxFUyxcbiAgICBjb3N0OiBwYXRoQ29zdChwYXRoUmVjdC54MSAtIHBhdGhSZWN0LngwICsgMSksXG4gICAgcHJlcDoge1xuICAgICAgdGFyZ2V0czogcGF0aFRhcmdldHMsXG4gICAgICBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5HUkFWRUwsXG4gICAgICBlbnZlbG9wZTogW00wMDJfTEFZT1VULmVudmVsb3BlWzFdXSxcbiAgICB9LFxuICB9LFxuICB7XG4gICAgaWQ6ICdmYXJtJyxcbiAgICBuYW1lOiAnVGVycmFjZWQgZmllbGQnLFxuICAgIHN1YnRpdGxlOiAnMTIgeCA4IG0gXHUwMEI3IHRocmVlIGJhbmRzJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaHJlZSBzb2lsIHRlcnJhY2VzIHN0ZXBwaW5nIGRvd24gdGhlIHNsb3BlLCBoZWxkIGJ5IHN0b25lIHJldGFpbmluZyB3YWxscy4gJ1xuICAgICAgKyAnVGhlIGJsb3Nzb20gdHJlZSBvbiB0aGUgZmllbGQgaXMgY2xlYXJlZCBkdXJpbmcgcHJlcGFyYXRpb24uJyxcbiAgICBzaXRlSWQ6IE0wMDJfTEFZT1VULmZhcm0uaWQsXG4gICAga2luZDogJ3RlcnJhY2UnLFxuICAgIHJlY3Q6IE0wMDJfTEFZT1VULmZhcm0ucmVjdCxcbiAgICBmbG9vclk6IDE1LFxuICAgIHJ1bGVzOiBGQVJNX1JVTEVTLFxuICAgIGNvc3Q6IHsgLi4uVEVSUkFDRV9DT1NUIH0sXG4gICAgdGVycmFjZXM6IE0wMDJfTEFZT1VULmZhcm0udGVycmFjZXMsXG4gICAgcHJlcDoge1xuICAgICAgdGFyZ2V0czogZmFybVRhcmdldHMsXG4gICAgICBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5TT0lMLFxuICAgICAgZW52ZWxvcGU6IFtNMDAyX0xBWU9VVC5lbnZlbG9wZVsyXV0sXG4gICAgfSxcbiAgICBnaG9zdEJhbmRzOiBNMDAyX1RFUlJBQ0VfQkFORFMsXG4gIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdEJ5SWQoaWQ6IE0yUHJvamVjdElkKTogTTJQcm9qZWN0IHtcbiAgY29uc3QgcHJvamVjdCA9IE0yX1BST0pFQ1RTLmZpbmQoKHApID0+IHAuaWQgPT09IGlkKTtcbiAgaWYgKCFwcm9qZWN0KSB0aHJvdyBuZXcgRXJyb3IoYHVua25vd24gTTAwMiBwcm9qZWN0OiAke2lkfWApO1xuICByZXR1cm4gcHJvamVjdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RTaXRlUHJvcG9zYWwocHJvamVjdDogTTJQcm9qZWN0KTogU2l0ZVByb3Bvc2FsIHtcbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb2plY3Quc2l0ZUlkLFxuICAgIHJlY3Q6IHByb2plY3QucmVjdCxcbiAgICBmbG9vclk6IHByb2plY3QuZmxvb3JZLFxuICAgIHJ1bGVzOiBwcm9qZWN0LnJ1bGVzLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdFN0cnVjdHVyZVByb3Bvc2FsKFxuICBwcm9qZWN0OiBNMlByb2plY3QsIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uLFxuKTogU3RydWN0dXJlUHJvcG9zYWwge1xuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvamVjdC5zaXRlSWQsXG4gICAga2luZDogcHJvamVjdC5raW5kLFxuICAgIHJlY3Q6IHByb2plY3QucmVjdCxcbiAgICBmbG9vclk6IHByb2plY3QuZmxvb3JZLFxuICAgIGRvb3I6IHByb2plY3QuZG9vcixcbiAgICBhcHByb2FjaDogcHJvamVjdC5hcHByb2FjaCxcbiAgICB0ZXJyYWNlczogcHJvamVjdC50ZXJyYWNlcyxcbiAgICAuLi4oZGVzaWduVmVyc2lvbiA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGRlc2lnblZlcnNpb24gfSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Byb2plY3RCdWlsdCh3b3JsZDogV29ybGQsIHByb2plY3Q6IE0yUHJvamVjdCk6IGJvb2xlYW4ge1xuICBmb3IgKGNvbnN0IHN0cnVjdHVyZSBvZiB3b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpKSB7XG4gICAgaWYgKHN0cnVjdHVyZS5zaXRlSWQgPT09IHByb2plY3Quc2l0ZUlkICYmIHN0cnVjdHVyZS5raW5kID09PSBwcm9qZWN0LmtpbmQpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaW5nUmVzb3VyY2Uge1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlO1xuICBuZWVkOiBudW1iZXI7XG4gIGhhdmU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1pc3NpbmdSZXNvdXJjZXMod29ybGQ6IFdvcmxkLCBwcm9qZWN0OiBNMlByb2plY3QpOiBNaXNzaW5nUmVzb3VyY2VbXSB7XG4gIGNvbnN0IG1pc3Npbmc6IE1pc3NpbmdSZXNvdXJjZVtdID0gW107XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHByb2plY3QuY29zdCkpIHtcbiAgICBjb25zdCBuZWVkID0gYW1vdW50ID8/IDA7XG4gICAgY29uc3QgaGF2ZSA9IHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMDtcbiAgICBpZiAoaGF2ZSA8IG5lZWQpIG1pc3NpbmcucHVzaCh7IHJlc291cmNlOiByZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGUsIG5lZWQsIGhhdmUgfSk7XG4gIH1cbiAgcmV0dXJuIG1pc3Npbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvamVjdEluc3BlY3Rpb24ge1xuICBwcm9qZWN0SWQ6IE0yUHJvamVjdElkO1xuICBidWlsdDogYm9vbGVhbjtcbiAgYWZmb3JkYWJsZTogYm9vbGVhbjtcbiAgbWlzc2luZzogTWlzc2luZ1Jlc291cmNlW107XG4gIHN0YXRlOiBTaXRlU3RhdGU7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgcHJldmlldzogU2l0ZVByZXZpZXc7XG4gIHBsYW46IFBsYW5SZXN1bHQ7XG4gIGNhbkJ1aWxkOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJlYWQtb25seSBpbnNwZWN0aW9uIGZvciB0aGUgZ2hvc3QgYW5kIHNpZGViYXIuIEl0IHJ1bnMgdGhlIHNhbWUgdmFsaWRhdG9yXG4gKiBhbmQgdGhlIHNhbWUgcHJlcGFyYXRpb24gcGxhbm5lciB0aGUgYnVpbGQgYnV0dG9uIHdpbGwgcnVuLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zcGVjdFByb2plY3Qod29ybGQ6IFdvcmxkLCBwcm9qZWN0OiBNMlByb2plY3QpOiBQcm9qZWN0SW5zcGVjdGlvbiB7XG4gIGNvbnN0IHByb3Bvc2FsID0gcHJvamVjdFNpdGVQcm9wb3NhbChwcm9qZWN0KTtcbiAgY29uc3QgcHJldmlldyA9IHByZXZpZXdTaXRlKHdvcmxkLCBwcm9wb3NhbCwge1xuICAgIGRvb3I6IHByb2plY3QuZG9vcixcbiAgICBhcHByb2FjaDogcHJvamVjdC5hcHByb2FjaCxcbiAgfSk7XG4gIGNvbnN0IHBsYW4gPSBwbGFuUHJlcGFyYXRpb24od29ybGQsIHByb3Bvc2FsLCBwcm9qZWN0LnByZXApO1xuICBjb25zdCBidWlsdCA9IGlzUHJvamVjdEJ1aWx0KHdvcmxkLCBwcm9qZWN0KTtcbiAgY29uc3QgbWlzc2luZyA9IG1pc3NpbmdSZXNvdXJjZXMod29ybGQsIHByb2plY3QpO1xuICBjb25zdCBzdGF0ZSA9IHBsYW4ub2sgPyBwbGFuLnZhbGlkYXRpb24uc3RhdGUgOiBwcmV2aWV3LnN0YXRlO1xuICBjb25zdCByZWFzb25zID0gcGxhbi5vayA/IHBsYW4udmFsaWRhdGlvbi5yZWFzb25zIDogcHJldmlldy5yZWFzb25zO1xuXG4gIHJldHVybiB7XG4gICAgcHJvamVjdElkOiBwcm9qZWN0LmlkLFxuICAgIGJ1aWx0LFxuICAgIGFmZm9yZGFibGU6IG1pc3NpbmcubGVuZ3RoID09PSAwLFxuICAgIG1pc3NpbmcsXG4gICAgc3RhdGUsXG4gICAgcmVhc29ucyxcbiAgICBwcmV2aWV3LFxuICAgIHBsYW4sXG4gICAgY2FuQnVpbGQ6ICFidWlsdCAmJiBtaXNzaW5nLmxlbmd0aCA9PT0gMCAmJiBwbGFuLm9rICYmIHN0YXRlICE9PSAnaW52YWxpZCcsXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvamVjdEJ1aWxkU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwcm9qZWN0OiBNMlByb2plY3Q7XG4gIHByZXBhcmF0aW9uOiBQcmVwYXJhdGlvbkxlZGdlcjtcbiAgc3RydWN0dXJlOiBTdHJ1Y3R1cmVMZWRnZXI7XG4gIHJlY29yZDogU3RydWN0dXJlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2plY3RCdWlsZEZhaWx1cmUge1xuICBvazogZmFsc2U7XG4gIHByb2plY3Q6IE0yUHJvamVjdDtcbiAgc3RhZ2U6ICdwcmVjaGVjaycgfCAncHJlcGFyZScgfCAnc3RydWN0dXJlJztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbiAgcHJlcGFyYXRpb24/OiBQcmVwYXJhdGlvbkxlZGdlcjtcbiAgLyoqIEZhaWxlZCBidWlsZHMgcm9sbCBiYWNrIHRoZSBlbnRpcmUgYXV0aG9yaXRhdGl2ZSBwcmUtYnVpbGQgc25hcHNob3QuICovXG4gIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2U7XG4gIHJldHJ5YWJsZTogdHJ1ZTtcbn1cblxuZXhwb3J0IHR5cGUgUHJvamVjdEJ1aWxkUmVzdWx0ID0gUHJvamVjdEJ1aWxkU3VjY2VzcyB8IFByb2plY3RCdWlsZEZhaWx1cmU7XG5cbi8qKlxuICogUHJlcGFyZSB0aGUgc2l0ZSBhbmQgY29uc3RydWN0IHRoZSBwcm9qZWN0IHRocm91Z2ggdGhlIGF1dGhvcml6ZWQgcGlwZWxpbmUuXG4gKiBUaGUgcmVzb3VyY2UgY2hlY2sgaGFwcGVucyBiZWZvcmUgYW55IHRlcnJhaW4gZWRpdCwgc28gYW4gdW5hZmZvcmRhYmxlIGJ1aWxkXG4gKiBjYW5ub3QgbGVhdmUgYSBncmFkZWQgcGFkIGJlaGluZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUHJvamVjdChcbiAgd29ybGQ6IFdvcmxkLFxuICBwcmVwQXV0aG9yaXplcjogTG9jYWxBdXRob3JpemVyLFxuICBzdHJ1Y3R1cmVBdXRob3JpemVyOiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsXG4gIHByb2plY3Q6IE0yUHJvamVjdCxcbiAgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb24sXG4pOiBQcm9qZWN0QnVpbGRSZXN1bHQge1xuICBpZiAoaXNQcm9qZWN0QnVpbHQod29ybGQsIHByb2plY3QpKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdwcmVjaGVjaycsIGNvZGU6ICdhbHJlYWR5X2J1aWx0JyxcbiAgICAgIHJlYXNvbnM6IFtgJHtwcm9qZWN0Lm5hbWV9IGlzIGFscmVhZHkgYnVpbHRgXSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG4gIGNvbnN0IG1pc3NpbmcgPSBtaXNzaW5nUmVzb3VyY2VzKHdvcmxkLCBwcm9qZWN0KTtcbiAgaWYgKG1pc3NpbmcubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAncHJlY2hlY2snLCBjb2RlOiAnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsXG4gICAgICByZWFzb25zOiBtaXNzaW5nLm1hcCgobSkgPT4gYG5lZWQgJHttLm5lZWR9ICR7bS5yZXNvdXJjZX0sIGhhdmUgJHttLmhhdmV9YCksXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IGJlZm9yZSA9IGNyZWF0ZVdvcmxkU25hcHNob3Qod29ybGQsIDApO1xuICBjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwgcHJvamVjdFNpdGVQcm9wb3NhbChwcm9qZWN0KSwgcHJvamVjdC5wcmVwKTtcbiAgaWYgKCFwcmVwYXJlZC5vaykge1xuICAgIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkLCBiZWZvcmUpO1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAncHJlcGFyZScsIGNvZGU6IHByZXBhcmVkLmNvZGUsXG4gICAgICByZWFzb25zOiBbLi4ucHJlcGFyZWQucmVhc29ucywgJ05vIHByZXBhcmF0aW9uLCByZXNvdXJjZSBvciBlbnRpdHkgY2hhbmdlcyB3ZXJlIHJldGFpbmVkLiddLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBidWlsdCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCBwcm9qZWN0U3RydWN0dXJlUHJvcG9zYWwocHJvamVjdCwgZGVzaWduVmVyc2lvbikpO1xuICBpZiAoIWJ1aWx0Lm9rKSB7XG4gICAgcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQsIGJlZm9yZSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdzdHJ1Y3R1cmUnLCBjb2RlOiBidWlsdC5jb2RlLFxuICAgICAgcmVhc29uczogWy4uLmJ1aWx0LnJlYXNvbnMsXG4gICAgICAgICdBbGwgcHJlcGFyYXRpb24sIHJlc291cmNlIGFuZCBlbnRpdHkgY2hhbmdlcyB3ZXJlIHJvbGxlZCBiYWNrOyB0aGUgYnVpbGQgY2FuIGJlIHJldHJpZWQuJ10sXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHJlY29yZCA9IHdvcmxkLnN0cnVjdHVyZXMuZ2V0KGJ1aWx0LmxlZGdlci5zdHJ1Y3R1cmVJZCk7XG4gIGlmICghcmVjb3JkKSB7XG4gICAgcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQsIGJlZm9yZSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdzdHJ1Y3R1cmUnLCBjb2RlOiAnbWlzc2luZ19yZWNvcmQnLFxuICAgICAgcmVhc29uczogWydzdHJ1Y3R1cmUgbGVkZ2VyIHdhcyB3cml0dGVuIGJ1dCB0aGUgd29ybGQgaGFzIG5vIHJlY29yZCcsXG4gICAgICAgICdBbGwgcHJlcGFyYXRpb24sIHJlc291cmNlIGFuZCBlbnRpdHkgY2hhbmdlcyB3ZXJlIHJvbGxlZCBiYWNrOyB0aGUgYnVpbGQgY2FuIGJlIHJldHJpZWQuJ10sXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgcHJvamVjdCxcbiAgICBwcmVwYXJhdGlvbjogcHJlcGFyZWQubGVkZ2VyLFxuICAgIHN0cnVjdHVyZTogYnVpbHQubGVkZ2VyLFxuICAgIHJlY29yZCxcbiAgfTtcbn1cbiIsICIvLyBUaGUgc29sZSB3cml0ZSBib3VuZGFyeSBmb3IgdGhlIHBsYXlhYmxlIE0wMDIgc2xpY2UuIEFjY2VwdGVkIGNvbW1hbmRzIGFyZVxuLy8gZHVyYWJsZSBpbnB1dDsgcmVqZWN0ZWQgYXR0ZW1wdHMsIHJlbmRlcmVyIHdvcmsgYW5kIHRlcnJhaW4gcXVlcmllcyBhcmUgbm90LlxuaW1wb3J0IHtcbiAgUmVzb3VyY2VUeXBlLCBXb3JsZCwgY3JlYXRlV29ybGQsIGdlbmVyYXRlV29ybGQsIGhhcnZlc3RFbnRpdHksIHBsYWNlQXV0aG9yZWRTaXRlcyxcbiAgcmV0aXJlU3RvbmVFbnRpdGllcywgaXNSZXRpcmVkU3RvbmVLaW5kLCBHRU5FUkFUT1JfVkVSU0lPTiwgR0VORVJBVE9SX1YyLFxufSBmcm9tICcuLi9zaW0vd29ybGQnO1xuaW1wb3J0IHsgTTAwMl9MQVlPVVQgfSBmcm9tICcuLi9zaW0vbTAwMic7XG5pbXBvcnQgeyBMb2NhbEF1dGhvcml6ZXIgfSBmcm9tICcuLi9zaW0vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHsgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLCBGT1VOREVSX0RFU0lHTl9WRVJTSU9OIH0gZnJvbSAnLi4vc2ltL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHsgTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSB9IGZyb20gJy4uL3NpbS9zY2VuYXJpbyc7XG5pbXBvcnQge1xuICBXb3JsZFNuYXBzaG90LCBjYW5vbmljYWxXb3JsZEhhc2gsIGNyZWF0ZVdvcmxkU25hcHNob3QsXG4gIGxlZ2FjeVN0b25lSGFzaCwgbWlncmF0ZVN0b25lU25hcHNob3QsIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3QsIHZhbGlkYXRlV29ybGRTbmFwc2hvdCwgd29ybGRGcm9tU25hcHNob3QsXG59IGZyb20gJy4uL3NpbS9zbmFwc2hvdCc7XG5pbXBvcnQgeyBlbmFibGVTdG9uZVJlcGxheSwgZmluaXNoU3RvbmVSZXBsYXkgfSBmcm9tICcuLi9zaW0vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7IE0yUHJvamVjdElkLCBidWlsZFByb2plY3QsIHByb2plY3RCeUlkIH0gZnJvbSAnLi9wcm9qZWN0cyc7XG5pbXBvcnQge1xuICBDUk9QX0dST1dUSF9USUNLUywgQ1JPUF9ZSUVMRCwgRk9VTkRFUl9TVE9DS1BJTEVfSUQsIExJRkVfUkVTT1VSQ0VTLCBNQVhfVElDS1NfUEVSX0NPTU1BTkQsIExpZmVSZXNvdXJjZSwgTGlmZVJlc291cmNlQmFnLCBSRUNJUEVTLCBSZWNpcGVJZCxcbiAgYWR2YW5jZVRpY2tzLCBjcmVhdGVMaWZlU3RhdGUsIGhhcnZlc3RDcm9wLCBwbGFudENyb3AsIHN0YXJ0UHJvZHVjdGlvbiwgdHJhbnNmZXIsXG59IGZyb20gJy4uL3NpbS9lY29ub215JztcblxuZXhwb3J0IGNvbnN0IEpPVVJOQUxfU0NIRU1BID0gMSBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBERVNJR05fSk9VUk5BTF9TQ0hFTUEgPSAyIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEgPSAzIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IE1BWF9KT1VSTkFMX0VOVFJJRVMgPSAxMDBfMDAwO1xuZXhwb3J0IHR5cGUgQ29tbWFuZCA9IExlZ2FjeUJ1aWxkQ29tbWFuZCB8IEJ1aWxkQ29tbWFuZCB8IEhhcnZlc3RDb21tYW5kXG4gIHwgVHJhbnNmZXJDb21tYW5kIHwgUHJvZHVjZUNvbW1hbmQgfCBUaWNrQ29tbWFuZCB8IFBsYW50Q29tbWFuZCB8IEhhcnZlc3RDcm9wQ29tbWFuZDtcbmludGVyZmFjZSBDb21tYW5kRW52ZWxvcGUge1xuICBzY2hlbWE6IHR5cGVvZiBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BO1xuICBpZDogc3RyaW5nO1xuICBleHBlY3RlZFJldmlzaW9uOiBudW1iZXI7XG59XG5leHBvcnQgaW50ZXJmYWNlIFRyYW5zZmVyQ29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7XG4gIHR5cGU6ICdkZXBvc2l0JyB8ICd3aXRoZHJhdyc7XG4gIHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gIHJlc291cmNlczogTGlmZVJlc291cmNlQmFnO1xufVxuZXhwb3J0IGludGVyZmFjZSBQcm9kdWNlQ29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7XG4gIHR5cGU6ICdwcm9kdWNlJzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDsgcmVjaXBlOiBrZXlvZiB0eXBlb2YgUkVDSVBFUztcbn1cbmV4cG9ydCBpbnRlcmZhY2UgVGlja0NvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUgeyB0eXBlOiAndGljayc7IHRpY2tzOiBudW1iZXI7IH1cbmV4cG9ydCBpbnRlcmZhY2UgUGxhbnRDb21tYW5kIGV4dGVuZHMgQ29tbWFuZEVudmVsb3BlIHsgdHlwZTogJ3BsYW50JzsgcGxvdElkOiBzdHJpbmc7IH1cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdENyb3BDb21tYW5kIGV4dGVuZHMgQ29tbWFuZEVudmVsb3BlIHsgdHlwZTogJ2hhcnZlc3RfY3JvcCc7IHBsb3RJZDogc3RyaW5nOyB9XG5leHBvcnQgaW50ZXJmYWNlIExlZ2FjeUJ1aWxkQ29tbWFuZCB7XG4gIHNjaGVtYTogdHlwZW9mIEpPVVJOQUxfU0NIRU1BO1xuICBpZDogc3RyaW5nO1xuICB0eXBlOiAnYnVpbGQnO1xuICBwcm9qZWN0SWQ6IE0yUHJvamVjdElkO1xuICBleHBlY3RlZFJldmlzaW9uOiBudW1iZXI7XG59XG5leHBvcnQgaW50ZXJmYWNlIEJ1aWxkQ29tbWFuZCB7XG4gIHNjaGVtYTogdHlwZW9mIERFU0lHTl9KT1VSTkFMX1NDSEVNQSB8IHR5cGVvZiBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BO1xuICBpZDogc3RyaW5nO1xuICB0eXBlOiAnYnVpbGQnO1xuICBwcm9qZWN0SWQ6IE0yUHJvamVjdElkO1xuICBleHBlY3RlZFJldmlzaW9uOiBudW1iZXI7XG4gIGRlc2lnblZlcnNpb246IHR5cGVvZiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xufVxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0Q29tbWFuZCB7XG4gIHNjaGVtYTogdHlwZW9mIEpPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUE7XG4gIGlkOiBzdHJpbmc7XG4gIHR5cGU6ICdoYXJ2ZXN0JztcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBDb21tYW5kT3V0Y29tZSA9IEJ1aWxkT3V0Y29tZSB8IEhhcnZlc3RPdXRjb21lIHwgVHJhbnNmZXJPdXRjb21lIHwgUHJvZHVjZU91dGNvbWUgfCBUaWNrT3V0Y29tZSB8IFBsYW50T3V0Y29tZSB8IENyb3BPdXRjb21lO1xuZXhwb3J0IGludGVyZmFjZSBUcmFuc2Zlck91dGNvbWUge1xuICB0eXBlOiAnZGVwb3NpdCcgfCAnd2l0aGRyYXcnOyBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICByZXNvdXJjZXM6IFBhcnRpYWw8UmVjb3JkPExpZmVSZXNvdXJjZSwgbnVtYmVyPj47XG59XG5leHBvcnQgaW50ZXJmYWNlIFByb2R1Y2VPdXRjb21lIHtcbiAgdHlwZTogJ3Byb2R1Y2UnOyBqb2JJZDogc3RyaW5nOyBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICByZWNpcGU6IGtleW9mIHR5cGVvZiBSRUNJUEVTOyByZW1haW5pbmdUaWNrczogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBUaWNrT3V0Y29tZSB7XG4gIHR5cGU6ICd0aWNrJzsgZnJvbVRpY2s6IG51bWJlcjsgdG9UaWNrOiBudW1iZXI7XG4gIGNvbXBsZXRlZEpvYnM6IEFycmF5PHsgaWQ6IHN0cmluZzsgcmVjaXBlOiBrZXlvZiB0eXBlb2YgUkVDSVBFUzsgb3V0cHV0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IH0+O1xuICByZWFkeUNyb3BzOiBzdHJpbmdbXTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgUGxhbnRPdXRjb21lIHtcbiAgdHlwZTogJ3BsYW50JzsgcGxvdElkOiBzdHJpbmc7IHBsYW50ZWRUaWNrOiBudW1iZXI7IGdyb3d0aFRpY2tzOiBudW1iZXI7XG59XG5leHBvcnQgaW50ZXJmYWNlIENyb3BPdXRjb21lIHtcbiAgdHlwZTogJ2hhcnZlc3RfY3JvcCc7IHBsb3RJZDogc3RyaW5nOyByZXNvdXJjZXM6IHsgZm9vZDogbnVtYmVyOyBmaWJlcjogbnVtYmVyIH07XG59XG5leHBvcnQgaW50ZXJmYWNlIEJ1aWxkT3V0Y29tZSB7XG4gIHR5cGU6ICdidWlsZCc7XG4gIHN0cnVjdHVyZUlkOiBzdHJpbmc7XG4gIGNvc3RQYWlkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICByZXNvdXJjZXNHYWluZWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG59XG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RPdXRjb21lIHtcbiAgdHlwZTogJ2hhcnZlc3QnO1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlO1xuICBhbW91bnQ6IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSm91cm5hbEVudHJ5IHtcbiAgY29tbWFuZDogQ29tbWFuZDtcbiAgc2VxdWVuY2U6IG51bWJlcjtcbiAgcmV2aXNpb246IG51bWJlcjtcbiAgaGFzaDogc3RyaW5nO1xuICBvdXRjb21lOiBDb21tYW5kT3V0Y29tZTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQ29tbWFuZEpvdXJuYWwge1xuICBzY2hlbWE6IHR5cGVvZiBKT1VSTkFMX1NDSEVNQSB8IHR5cGVvZiBERVNJR05fSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQTtcbiAgc2VlZDogbnVtYmVyO1xuICAvKipcbiAgICogVGVycmFpbiBnZW5lcmF0b3Igb2YgdGhlIHdvcmxkIHRoaXMgam91cm5hbCByZXBsYXlzIG9uLiBBYnNlbnQgbWVhbnMgdjE6XG4gICAqIGV2ZXJ5IHNhdmUgd3JpdHRlbiBiZWZvcmUgZ2VuZXJhdG9yIHYyIG9taXRzIHRoZSBmaWVsZCwgc28gaXRzIGNhbm9uaWNhbFxuICAgKiBieXRlcyAoYW5kIGhhc2hlcykgYXJlIHVuY2hhbmdlZC5cbiAgICovXG4gIGdlbmVyYXRvclZlcnNpb24/OiB0eXBlb2YgR0VORVJBVE9SX1YyO1xuICBzdGFydGVySW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBlbnRyaWVzOiBKb3VybmFsRW50cnlbXTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQ29tbWFuZFJlY2VpcHQge1xuICBvazogdHJ1ZTtcbiAgZHVwbGljYXRlOiBib29sZWFuO1xuICBpZDogc3RyaW5nO1xuICBzZXF1ZW5jZTogbnVtYmVyO1xuICByZXZpc2lvbjogbnVtYmVyO1xuICBoYXNoOiBzdHJpbmc7XG4gIG91dGNvbWU6IENvbW1hbmRPdXRjb21lO1xufVxuZXhwb3J0IGludGVyZmFjZSBDb21tYW5kUmVqZWN0aW9uIHtcbiAgb2s6IGZhbHNlO1xuICBkdXBsaWNhdGU6IGZhbHNlO1xuICBpZDogc3RyaW5nO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5mdW5jdGlvbiBvYmplY3QodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KHZhbHVlKTtcbn1cbmZ1bmN0aW9uIHVpbnQodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNTYWZlSW50ZWdlcih2YWx1ZSkgJiYgdmFsdWUgPj0gMDtcbn1cbmZ1bmN0aW9uIGlkKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgc3RyaW5nIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgL15bQS1aYS16MC05XVtBLVphLXowLTkuXzolLV17MCwxMjd9JC8udGVzdCh2YWx1ZSk7XG59XG5mdW5jdGlvbiBlbnRpdHlJZCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlLmxlbmd0aCA8PSAxMjhcbiAgICAmJiAoL15lOlxcZCssXFxkKzpcXGQrJC8udGVzdCh2YWx1ZSlcbiAgICAgIHx8IC9eaGVybzpzdHlsX1thLXpfXSs6LT9cXGQrOi0/XFxkKyQvLnRlc3QodmFsdWUpKTtcbn1cbmZ1bmN0aW9uIHNhbWVGaWVsZHMoYTogdW5rbm93biwgYjogdW5rbm93bik6IGJvb2xlYW4ge1xuICBpZiAob2JqZWN0KGEpICYmIG9iamVjdChiKSkge1xuICAgIGNvbnN0IGFLZXlzID0gT2JqZWN0LmtleXMoYSkuc29ydCgpLCBiS2V5cyA9IE9iamVjdC5rZXlzKGIpLnNvcnQoKTtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYUtleXMpID09PSBKU09OLnN0cmluZ2lmeShiS2V5cylcbiAgICAgICYmIGFLZXlzLmV2ZXJ5KChrZXkpID0+IHNhbWVGaWVsZHMoYVtrZXldLCBiW2tleV0pKTtcbiAgfVxuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYSkgPT09IEpTT04uc3RyaW5naWZ5KGIpO1xufVxuXG5mdW5jdGlvbiBpbnZlbnRvcnkodmFsdWU6IHVua25vd24pOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgaWYgKCFvYmplY3QodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgcmVzb3VyY2UgcmVjb3JkJyk7XG4gIGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh2YWx1ZSkuc29ydCgpKSB7XG4gICAgaWYgKCFMSUZFX1JFU09VUkNFUy5pbmNsdWRlcyhrZXkgYXMgTGlmZVJlc291cmNlKVxuICAgICAgfHwgIXVpbnQodmFsdWVba2V5XSkgfHwgdmFsdWVba2V5XSA8PSAwIHx8IHZhbHVlW2tleV0gPiAxXzAwMF8wMDBfMDAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgcmVzb3VyY2UgcmVjb3JkJyk7XG4gICAgfVxuICAgIHJlc3VsdFtrZXldID0gdmFsdWVba2V5XTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKiogQ2Fub25pY2FsaXplIGFuZCByZWplY3QgdW5rbm93biwgYW1iaWd1b3VzIG9yIG1hbGZvcm1lZCBjb21tYW5kIGZpZWxkcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZUNvbW1hbmQodmFsdWU6IHVua25vd24pOiBDb21tYW5kIHtcbiAgaWYgKCFvYmplY3QodmFsdWUpIHx8ICh2YWx1ZS5zY2hlbWEgIT09IEpPVVJOQUxfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gREVTSUdOX0pPVVJOQUxfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSlcbiAgICB8fCAhaWQodmFsdWUuaWQpIHx8ICF1aW50KHZhbHVlLmV4cGVjdGVkUmV2aXNpb24pKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgY29tbWFuZCBlbnZlbG9wZScpO1xuICBpZiAodmFsdWUudHlwZSA9PT0gJ2J1aWxkJyAmJiBbJ2hvdXNlJywgJ3BhdGgnLCAnZmFybSddLmluY2x1ZGVzKFN0cmluZyh2YWx1ZS5wcm9qZWN0SWQpKSkge1xuICAgIGNvbnN0IGNvbW1hbmQ6IENvbW1hbmQgPSB2YWx1ZS5zY2hlbWEgIT09IEpPVVJOQUxfU0NIRU1BID8ge1xuICAgICAgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogJ2J1aWxkJyxcbiAgICAgIHByb2plY3RJZDogdmFsdWUucHJvamVjdElkIGFzIE0yUHJvamVjdElkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uLFxuICAgICAgZGVzaWduVmVyc2lvbjogdmFsdWUuZGVzaWduVmVyc2lvbiBhcyB0eXBlb2YgRk9VTkRFUl9ERVNJR05fVkVSU0lPTixcbiAgICB9IDoge1xuICAgICAgc2NoZW1hOiBKT1VSTkFMX1NDSEVNQSwgaWQ6IHZhbHVlLmlkLCB0eXBlOiAnYnVpbGQnLFxuICAgICAgcHJvamVjdElkOiB2YWx1ZS5wcm9qZWN0SWQgYXMgTTJQcm9qZWN0SWQsIGV4cGVjdGVkUmV2aXNpb246IHZhbHVlLmV4cGVjdGVkUmV2aXNpb24sXG4gICAgfTtcbiAgICBpZiAoY29tbWFuZC5zY2hlbWEgIT09IEpPVVJOQUxfU0NIRU1BICYmIGNvbW1hbmQuZGVzaWduVmVyc2lvbiAhPT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBzdHJ1Y3R1cmUgZGVzaWduJyk7XG4gICAgfVxuICAgIGlmICghc2FtZUZpZWxkcyhjb21tYW5kLCB2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBidWlsZCBjb21tYW5kJyk7XG4gICAgcmV0dXJuIGNvbW1hbmQ7XG4gIH1cbiAgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0JyAmJiB2YWx1ZS5zY2hlbWEgPT09IEpPVVJOQUxfU0NIRU1BICYmIGVudGl0eUlkKHZhbHVlLmVudGl0eUlkKSkge1xuICAgIGNvbnN0IGNvbW1hbmQ6IENvbW1hbmQgPSB7XG4gICAgICBzY2hlbWE6IHZhbHVlLnNjaGVtYSwgaWQ6IHZhbHVlLmlkLCB0eXBlOiAnaGFydmVzdCcsXG4gICAgICBlbnRpdHlJZDogdmFsdWUuZW50aXR5SWQsIGV4cGVjdGVkUmV2aXNpb246IHZhbHVlLmV4cGVjdGVkUmV2aXNpb24sXG4gICAgfTtcbiAgICBpZiAoIXNhbWVGaWVsZHMoY29tbWFuZCwgdmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgaGFydmVzdCBjb21tYW5kJyk7XG4gICAgcmV0dXJuIGNvbW1hbmQ7XG4gIH1cbiAgaWYgKHZhbHVlLnNjaGVtYSA9PT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkge1xuICAgIGNvbnN0IGJhc2UgPSB7IHNjaGVtYTogdmFsdWUuc2NoZW1hLCBpZDogdmFsdWUuaWQsIGV4cGVjdGVkUmV2aXNpb246IHZhbHVlLmV4cGVjdGVkUmV2aXNpb24gfTtcbiAgICBsZXQgY29tbWFuZDogQ29tbWFuZCB8IG51bGwgPSBudWxsO1xuICAgIGlmICh2YWx1ZS50eXBlID09PSAnaGFydmVzdCcgJiYgZW50aXR5SWQodmFsdWUuZW50aXR5SWQpKSB7XG4gICAgICBjb21tYW5kID0geyBzY2hlbWE6IHZhbHVlLnNjaGVtYSwgaWQ6IHZhbHVlLmlkLCB0eXBlOiB2YWx1ZS50eXBlLFxuICAgICAgICBlbnRpdHlJZDogdmFsdWUuZW50aXR5SWQsIGV4cGVjdGVkUmV2aXNpb246IHZhbHVlLmV4cGVjdGVkUmV2aXNpb24gfTtcbiAgICB9IGVsc2UgaWYgKCh2YWx1ZS50eXBlID09PSAnZGVwb3NpdCcgfHwgdmFsdWUudHlwZSA9PT0gJ3dpdGhkcmF3JykgJiYgdmFsdWUuc3RvY2twaWxlSWQgPT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCBzdG9ja3BpbGVJZDogdmFsdWUuc3RvY2twaWxlSWQsIHJlc291cmNlczogaW52ZW50b3J5KHZhbHVlLnJlc291cmNlcykgfTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdwcm9kdWNlJyAmJiB2YWx1ZS5zdG9ja3BpbGVJZCA9PT0gRk9VTkRFUl9TVE9DS1BJTEVfSURcbiAgICAgICYmICh2YWx1ZS5yZWNpcGUgPT09ICdzZWVkJyB8fCB2YWx1ZS5yZWNpcGUgPT09ICdyYXRpb25zJykpIHtcbiAgICAgIGNvbW1hbmQgPSB7IC4uLmJhc2UsIHR5cGU6IHZhbHVlLnR5cGUsIHN0b2NrcGlsZUlkOiB2YWx1ZS5zdG9ja3BpbGVJZCwgcmVjaXBlOiB2YWx1ZS5yZWNpcGUgfTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICd0aWNrJyAmJiB1aW50KHZhbHVlLnRpY2tzKSAmJiB2YWx1ZS50aWNrcyA+IDAgJiYgdmFsdWUudGlja3MgPD0gTUFYX1RJQ0tTX1BFUl9DT01NQU5EKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCB0aWNrczogdmFsdWUudGlja3MgfTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdwbGFudCcgJiYgdHlwZW9mIHZhbHVlLnBsb3RJZCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdCh2YWx1ZS5wbG90SWQpKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCBwbG90SWQ6IHZhbHVlLnBsb3RJZCB9O1xuICAgIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcgJiYgdHlwZW9mIHZhbHVlLnBsb3RJZCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdCh2YWx1ZS5wbG90SWQpKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCBwbG90SWQ6IHZhbHVlLnBsb3RJZCB9O1xuICAgIH1cbiAgICBpZiAoY29tbWFuZCkge1xuICAgICAgaWYgKCFzYW1lRmllbGRzKGNvbW1hbmQsIHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGxpZmUtbG9vcCBjb21tYW5kJyk7XG4gICAgICByZXR1cm4gY29tbWFuZDtcbiAgICB9XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBjb21tYW5kJyk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlT3V0Y29tZSh2YWx1ZTogdW5rbm93bik6IENvbW1hbmRPdXRjb21lIHtcbiAgaWYgKCFvYmplY3QodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgY29tbWFuZCBvdXRjb21lJyk7XG4gIGlmICh2YWx1ZS50eXBlID09PSAnYnVpbGQnICYmIGlkKHZhbHVlLnN0cnVjdHVyZUlkKSkge1xuICAgIGNvbnN0IG91dGNvbWU6IENvbW1hbmRPdXRjb21lID0ge1xuICAgICAgdHlwZTogJ2J1aWxkJywgc3RydWN0dXJlSWQ6IHZhbHVlLnN0cnVjdHVyZUlkLFxuICAgICAgY29zdFBhaWQ6IGludmVudG9yeSh2YWx1ZS5jb3N0UGFpZCksIHJlc291cmNlc0dhaW5lZDogaW52ZW50b3J5KHZhbHVlLnJlc291cmNlc0dhaW5lZCksXG4gICAgfTtcbiAgICBpZiAoSlNPTi5zdHJpbmdpZnkob3V0Y29tZSkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGJ1aWxkIG91dGNvbWUnKTtcbiAgICByZXR1cm4gb3V0Y29tZTtcbiAgfVxuICBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3QnICYmIGVudGl0eUlkKHZhbHVlLmVudGl0eUlkKVxuICAgICYmIFsnd29vZCcsICdzdG9uZScsICdvcmUnLCAnZmliZXInXS5pbmNsdWRlcyhTdHJpbmcodmFsdWUucmVzb3VyY2UpKVxuICAgICYmIHVpbnQodmFsdWUuYW1vdW50KSAmJiB2YWx1ZS5hbW91bnQgPiAwICYmIHZhbHVlLmFtb3VudCA8PSAxXzAwMF8wMDApIHtcbiAgICBjb25zdCBvdXRjb21lOiBDb21tYW5kT3V0Y29tZSA9IHtcbiAgICAgIHR5cGU6ICdoYXJ2ZXN0JywgZW50aXR5SWQ6IHZhbHVlLmVudGl0eUlkLFxuICAgICAgcmVzb3VyY2U6IHZhbHVlLnJlc291cmNlIGFzIFJlc291cmNlVHlwZSwgYW1vdW50OiB2YWx1ZS5hbW91bnQsXG4gICAgfTtcbiAgICBpZiAoSlNPTi5zdHJpbmdpZnkob3V0Y29tZSkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGhhcnZlc3Qgb3V0Y29tZScpO1xuICAgIHJldHVybiBvdXRjb21lO1xuICB9XG4gIGxldCBvdXRjb21lOiBDb21tYW5kT3V0Y29tZSB8IG51bGwgPSBudWxsO1xuICBpZiAoKHZhbHVlLnR5cGUgPT09ICdkZXBvc2l0JyB8fCB2YWx1ZS50eXBlID09PSAnd2l0aGRyYXcnKSAmJiB2YWx1ZS5zdG9ja3BpbGVJZCA9PT0gRk9VTkRFUl9TVE9DS1BJTEVfSUQpIHtcbiAgICBvdXRjb21lID0geyB0eXBlOiB2YWx1ZS50eXBlLCBzdG9ja3BpbGVJZDogdmFsdWUuc3RvY2twaWxlSWQsIHJlc291cmNlczogaW52ZW50b3J5KHZhbHVlLnJlc291cmNlcykgfTtcbiAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAncHJvZHVjZScgJiYgaWQodmFsdWUuam9iSWQpICYmIHZhbHVlLnN0b2NrcGlsZUlkID09PSBGT1VOREVSX1NUT0NLUElMRV9JRFxuICAgICYmICh2YWx1ZS5yZWNpcGUgPT09ICdzZWVkJyB8fCB2YWx1ZS5yZWNpcGUgPT09ICdyYXRpb25zJykgJiYgdWludCh2YWx1ZS5yZW1haW5pbmdUaWNrcykgJiYgdmFsdWUucmVtYWluaW5nVGlja3MgPiAwKSB7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgam9iSWQ6IHZhbHVlLmpvYklkLCBzdG9ja3BpbGVJZDogdmFsdWUuc3RvY2twaWxlSWQsXG4gICAgICByZWNpcGU6IHZhbHVlLnJlY2lwZSwgcmVtYWluaW5nVGlja3M6IHZhbHVlLnJlbWFpbmluZ1RpY2tzIH07XG4gIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3BsYW50JyAmJiB0eXBlb2YgdmFsdWUucGxvdElkID09PSAnc3RyaW5nJyAmJiAvXmNyb3A6WzAtOF0kLy50ZXN0KHZhbHVlLnBsb3RJZClcbiAgICAmJiB1aW50KHZhbHVlLnBsYW50ZWRUaWNrKSAmJiB2YWx1ZS5ncm93dGhUaWNrcyA9PT0gQ1JPUF9HUk9XVEhfVElDS1MpIHtcbiAgICBvdXRjb21lID0geyB0eXBlOiB2YWx1ZS50eXBlLCBwbG90SWQ6IHZhbHVlLnBsb3RJZCwgcGxhbnRlZFRpY2s6IHZhbHVlLnBsYW50ZWRUaWNrLCBncm93dGhUaWNrczogdmFsdWUuZ3Jvd3RoVGlja3MgfTtcbiAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAnaGFydmVzdF9jcm9wJyAmJiB0eXBlb2YgdmFsdWUucGxvdElkID09PSAnc3RyaW5nJyAmJiAvXmNyb3A6WzAtOF0kLy50ZXN0KHZhbHVlLnBsb3RJZClcbiAgICAmJiBpc1Jlc291cmNlcyh2YWx1ZS5yZXNvdXJjZXMpICYmIHZhbHVlLnJlc291cmNlcy5mb29kID09PSBDUk9QX1lJRUxELmZvb2QgJiYgdmFsdWUucmVzb3VyY2VzLmZpYmVyID09PSBDUk9QX1lJRUxELmZpYmVyKSB7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgcGxvdElkOiB2YWx1ZS5wbG90SWQsXG4gICAgICByZXNvdXJjZXM6IHsgZm9vZDogQ1JPUF9ZSUVMRC5mb29kLCBmaWJlcjogQ1JPUF9ZSUVMRC5maWJlciB9IH07XG4gIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3RpY2snICYmIHVpbnQodmFsdWUuZnJvbVRpY2spICYmIHVpbnQodmFsdWUudG9UaWNrKVxuICAgICYmIHZhbHVlLnRvVGljayA+IHZhbHVlLmZyb21UaWNrICYmIHZhbHVlLnRvVGljayAtIHZhbHVlLmZyb21UaWNrIDw9IE1BWF9USUNLU19QRVJfQ09NTUFORFxuICAgICYmIEFycmF5LmlzQXJyYXkodmFsdWUuY29tcGxldGVkSm9icykgJiYgQXJyYXkuaXNBcnJheSh2YWx1ZS5yZWFkeUNyb3BzKSkge1xuICAgIGNvbnN0IGNvbXBsZXRlZEpvYnM6IEFycmF5PHsgaWQ6IHN0cmluZzsgcmVjaXBlOiBSZWNpcGVJZDsgb3V0cHV0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IH0+ID0gdmFsdWUuY29tcGxldGVkSm9icy5tYXAoKHJhdzogdW5rbm93bikgPT4ge1xuICAgICAgaWYgKCFvYmplY3QocmF3KSB8fCAhaWQocmF3LmlkKSB8fCAocmF3LnJlY2lwZSAhPT0gJ3NlZWQnICYmIHJhdy5yZWNpcGUgIT09ICdyYXRpb25zJykpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBjb21wbGV0ZWQgam9iJyk7XG4gICAgICByZXR1cm4geyBpZDogcmF3LmlkLCByZWNpcGU6IHJhdy5yZWNpcGUsIG91dHB1dDogaW52ZW50b3J5KHJhdy5vdXRwdXQpIH07XG4gICAgfSk7XG4gICAgaWYgKCF2YWx1ZS5yZWFkeUNyb3BzLmV2ZXJ5KChwbG90KSA9PiB0eXBlb2YgcGxvdCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdChwbG90KSkpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCByZWFkeSBjcm9wcycpO1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIGZyb21UaWNrOiB2YWx1ZS5mcm9tVGljaywgdG9UaWNrOiB2YWx1ZS50b1RpY2ssXG4gICAgICBjb21wbGV0ZWRKb2JzLCByZWFkeUNyb3BzOiBbLi4udmFsdWUucmVhZHlDcm9wc10gfTtcbiAgfVxuICBpZiAob3V0Y29tZSkge1xuICAgIGlmIChKU09OLnN0cmluZ2lmeShvdXRjb21lKSAhPT0gSlNPTi5zdHJpbmdpZnkodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgbGlmZS1sb29wIG91dGNvbWUnKTtcbiAgICByZXR1cm4gb3V0Y29tZTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgY29tbWFuZCBvdXRjb21lJyk7XG59XG5cbmZ1bmN0aW9uIGlzUmVzb3VyY2VzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIHJldHVybiBvYmplY3QodmFsdWUpICYmIE9iamVjdC52YWx1ZXModmFsdWUpLmV2ZXJ5KChhbW91bnQpID0+IHVpbnQoYW1vdW50KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVKb3VybmFsKFxuICBzZWVkID0gMTMzNywgc2NoZW1hOiBDb21tYW5kSm91cm5hbFsnc2NoZW1hJ10gPSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BLCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04sXG4pOiBDb21tYW5kSm91cm5hbCB7XG4gIGlmIChnZW5lcmF0b3JWZXJzaW9uICE9PSBHRU5FUkFUT1JfVkVSU0lPTiAmJiBzY2hlbWEgIT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2xlZ2FjeSBqb3VybmFsIHNjaGVtYXMgb25seSBleGlzdCBmb3IgZ2VuZXJhdG9yIHYxJyk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBzY2hlbWEsIHNlZWQsXG4gICAgLi4uKGdlbmVyYXRvclZlcnNpb24gPT09IEdFTkVSQVRPUl9WMiA/IHsgZ2VuZXJhdG9yVmVyc2lvbjogR0VORVJBVE9SX1YyIH0gOiB7fSksXG4gICAgc3RhcnRlckludmVudG9yeTogaW52ZW50b3J5KE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkpLCBlbnRyaWVzOiBbXSxcbiAgfTtcbn1cblxuLyoqIEdlbmVyYXRvciB2ZXJzaW9uIGEgam91cm5hbCByZXBsYXlzIG9uIChhYnNlbnQgZmllbGQgPSB2MSkuICovXG5leHBvcnQgZnVuY3Rpb24gam91cm5hbEdlbmVyYXRvcihqb3VybmFsOiBQaWNrPENvbW1hbmRKb3VybmFsLCAnZ2VuZXJhdG9yVmVyc2lvbic+KTogbnVtYmVyIHtcbiAgcmV0dXJuIGpvdXJuYWwuZ2VuZXJhdG9yVmVyc2lvbiA/PyBHRU5FUkFUT1JfVkVSU0lPTjtcbn1cblxuLyoqIFZhbGlkYXRlIGFuIGVudGlyZSBqb3VybmFsIHdpdGhvdXQgY2hhbmdpbmcgYSBsaXZlIHNlc3Npb24uICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVKb3VybmFsKHZhbHVlOiB1bmtub3duKTogQ29tbWFuZEpvdXJuYWwge1xuICBpZiAoIW9iamVjdCh2YWx1ZSkgfHwgKHZhbHVlLnNjaGVtYSAhPT0gSk9VUk5BTF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBERVNJR05fSk9VUk5BTF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKVxuICAgIHx8ICF1aW50KHZhbHVlLnNlZWQpIHx8IHZhbHVlLnNlZWQgPiAweGZmZmZmZmZmXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuZW50cmllcykgfHwgdmFsdWUuZW50cmllcy5sZW5ndGggPiBNQVhfSk9VUk5BTF9FTlRSSUVTXG4gICAgfHwgJ2dlbmVyYXRvclZlcnNpb24nIGluIHZhbHVlICYmICh2YWx1ZS5nZW5lcmF0b3JWZXJzaW9uICE9PSBHRU5FUkFUT1JfVjIgfHwgdmFsdWUuc2NoZW1hICE9PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBjb21tYW5kIGpvdXJuYWwnKTtcbiAgfVxuICBjb25zdCBqb3VybmFsOiBDb21tYW5kSm91cm5hbCA9IHtcbiAgICBzY2hlbWE6IHZhbHVlLnNjaGVtYSwgc2VlZDogdmFsdWUuc2VlZCxcbiAgICAuLi4oJ2dlbmVyYXRvclZlcnNpb24nIGluIHZhbHVlID8geyBnZW5lcmF0b3JWZXJzaW9uOiBHRU5FUkFUT1JfVjIgfSA6IHt9KSxcbiAgICBzdGFydGVySW52ZW50b3J5OiBpbnZlbnRvcnkodmFsdWUuc3RhcnRlckludmVudG9yeSksIGVudHJpZXM6IFtdLFxuICB9O1xuICBjb25zdCBpZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5lbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcmF3ID0gdmFsdWUuZW50cmllc1tpXTtcbiAgICBpZiAoIW9iamVjdChyYXcpIHx8IHJhdy5zZXF1ZW5jZSAhPT0gaSB8fCAhdWludChyYXcucmV2aXNpb24pXG4gICAgICB8fCB0eXBlb2YgcmF3Lmhhc2ggIT09ICdzdHJpbmcnIHx8ICEvXlswLTlhLWZdezE2fSQvLnRlc3QocmF3Lmhhc2gpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jb250aWd1b3VzIG9yIGludmFsaWQgam91cm5hbCBlbnRyeScpO1xuICAgIGNvbnN0IGVudHJ5OiBKb3VybmFsRW50cnkgPSB7XG4gICAgICBjb21tYW5kOiB2YWxpZGF0ZUNvbW1hbmQocmF3LmNvbW1hbmQpLCBzZXF1ZW5jZTogaSxcbiAgICAgIHJldmlzaW9uOiByYXcucmV2aXNpb24sIGhhc2g6IHJhdy5oYXNoLCBvdXRjb21lOiB2YWxpZGF0ZU91dGNvbWUocmF3Lm91dGNvbWUpLFxuICAgIH07XG4gICAgaWYgKChlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdidWlsZCcgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcpXG4gICAgICAmJiBlbnRyeS5jb21tYW5kLnNjaGVtYSAhPT0gdmFsdWUuc2NoZW1hKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2pvdXJuYWwgc2NoZW1hIGFuZCBidWlsZCBjb21tYW5kIHNjaGVtYSBkaWZmZXInKTtcbiAgICB9XG4gICAgaWYgKEpTT04uc3RyaW5naWZ5KGVudHJ5KSAhPT0gSlNPTi5zdHJpbmdpZnkocmF3KSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGpvdXJuYWwgZW50cnknKTtcbiAgICBpZiAoaWRzLmhhcyhlbnRyeS5jb21tYW5kLmlkKSkgdGhyb3cgbmV3IEVycm9yKCdkdXBsaWNhdGUgam91cm5hbCBjb21tYW5kIGlkJyk7XG4gICAgaWYgKGVudHJ5LmNvbW1hbmQudHlwZSAhPT0gZW50cnkub3V0Y29tZS50eXBlXG4gICAgICB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0JyAmJiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICdoYXJ2ZXN0J1xuICAgICAgJiYgZW50cnkuY29tbWFuZC5lbnRpdHlJZCAhPT0gZW50cnkub3V0Y29tZS5lbnRpdHlJZFxuICAgICAgfHwgKGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ3BsYW50JyB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnKVxuICAgICAgJiYgZW50cnkuY29tbWFuZC50eXBlID09PSBlbnRyeS5vdXRjb21lLnR5cGUgJiYgZW50cnkuY29tbWFuZC5wbG90SWQgIT09IGVudHJ5Lm91dGNvbWUucGxvdElkXG4gICAgICB8fCAoZW50cnkuY29tbWFuZC50eXBlID09PSAnZGVwb3NpdCcgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAnd2l0aGRyYXcnKVxuICAgICAgJiYgZW50cnkuY29tbWFuZC50eXBlID09PSBlbnRyeS5vdXRjb21lLnR5cGVcbiAgICAgICYmIChlbnRyeS5jb21tYW5kLnN0b2NrcGlsZUlkICE9PSBlbnRyeS5vdXRjb21lLnN0b2NrcGlsZUlkXG4gICAgICAgIHx8IEpTT04uc3RyaW5naWZ5KGVudHJ5LmNvbW1hbmQucmVzb3VyY2VzKSAhPT0gSlNPTi5zdHJpbmdpZnkoZW50cnkub3V0Y29tZS5yZXNvdXJjZXMpKVxuICAgICAgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAncHJvZHVjZScgJiYgZW50cnkub3V0Y29tZS50eXBlID09PSAncHJvZHVjZSdcbiAgICAgICYmIChlbnRyeS5jb21tYW5kLnN0b2NrcGlsZUlkICE9PSBlbnRyeS5vdXRjb21lLnN0b2NrcGlsZUlkIHx8IGVudHJ5LmNvbW1hbmQucmVjaXBlICE9PSBlbnRyeS5vdXRjb21lLnJlY2lwZSlcbiAgICAgIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ3RpY2snICYmIGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ3RpY2snXG4gICAgICAmJiBlbnRyeS5vdXRjb21lLnRvVGljayAtIGVudHJ5Lm91dGNvbWUuZnJvbVRpY2sgIT09IGVudHJ5LmNvbW1hbmQudGlja3MpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignam91cm5hbCBjb21tYW5kIGFuZCBvdXRjb21lIGRpc2FncmVlJyk7XG4gICAgfVxuICAgIGlkcy5hZGQoZW50cnkuY29tbWFuZC5pZCk7XG4gICAgam91cm5hbC5lbnRyaWVzLnB1c2goZW50cnkpO1xuICB9XG4gIGlmIChKU09OLnN0cmluZ2lmeShqb3VybmFsKSAhPT0gSlNPTi5zdHJpbmdpZnkodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgY29tbWFuZCBqb3VybmFsJyk7XG4gIC8vIFRoaXMgc2xpY2UgaGFzIG9uZSBkZXRlcm1pbmlzdGljIGdlbmVzaXMgY29uZmlndXJhdGlvbi4gQSBjaGFuZ2VkIHN0YXJ0ZXJcbiAgLy8gZ3JhbnQgbXVzdCBub3QgcGFzcyB1bm5vdGljZWQgd2hlbiByZXBsYXkgYmVnaW5zIGZyb20gYSBsYXRlciBzbmFwc2hvdC5cbiAgaWYgKEpTT04uc3RyaW5naWZ5KGpvdXJuYWwuc3RhcnRlckludmVudG9yeSkgIT09IEpTT04uc3RyaW5naWZ5KGNyZWF0ZUpvdXJuYWwodmFsdWUuc2VlZCwgdmFsdWUuc2NoZW1hLCBqb3VybmFsR2VuZXJhdG9yKGpvdXJuYWwpKS5zdGFydGVySW52ZW50b3J5KSkge1xuICAgIHRocm93IG5ldyBFcnJvcignam91cm5hbCBzdGFydGVyIGludmVudG9yeSBpcyBpbmNvbXBhdGlibGUgd2l0aCB0aGlzIHZlcnNpb24nKTtcbiAgfVxuICByZXR1cm4gam91cm5hbDtcbn1cblxuZnVuY3Rpb24gcmVmZXJlbmNlc1JldGlyZWRTdG9uZShlbnRyeTogSm91cm5hbEVudHJ5KTogYm9vbGVhbiB7XG4gIHJldHVybiAvXmhlcm86c3R5bF9yb2NrXyg/OnNtYWxsfG1lZGl1bXxsYXJnZSk6Ly50ZXN0KFxuICAgIGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnID8gZW50cnkuY29tbWFuZC5lbnRpdHlJZCA6IGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ2hhcnZlc3QnID8gZW50cnkub3V0Y29tZS5lbnRpdHlJZCA6ICcnLFxuICApO1xufVxuXG5leHBvcnQgY2xhc3MgR2FtZVNlc3Npb24ge1xuICByZWFkb25seSBqb3VybmFsOiBDb21tYW5kSm91cm5hbDtcbiAgcHJpdmF0ZSByZWFkb25seSBwcmVwQXV0aG9yaXplcjogTG9jYWxBdXRob3JpemVyO1xuICBwcml2YXRlIHJlYWRvbmx5IHN0cnVjdHVyZUF1dGhvcml6ZXI6IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcjtcbiAgcHJpdmF0ZSByZWFkb25seSBpZHMgPSBuZXcgTWFwPHN0cmluZywgSm91cm5hbEVudHJ5PigpO1xuXG4gIHByaXZhdGUgY29uc3RydWN0b3IocmVhZG9ubHkgd29ybGQ6IFdvcmxkLCBqb3VybmFsOiBDb21tYW5kSm91cm5hbCkge1xuICAgIHRoaXMuam91cm5hbCA9IGpvdXJuYWw7XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBqb3VybmFsLmVudHJpZXMpIHRoaXMuaWRzLnNldChlbnRyeS5jb21tYW5kLmlkLCBlbnRyeSk7XG4gICAgdGhpcy5wcmVwQXV0aG9yaXplciA9IG5ldyBMb2NhbEF1dGhvcml6ZXIoeyBlbnZlbG9wZTogTTAwMl9MQVlPVVQuZW52ZWxvcGUgfSk7XG4gICAgdGhpcy5zdHJ1Y3R1cmVBdXRob3JpemVyID0gbmV3IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcih7IGVudmVsb3BlOiBNMDAyX0xBWU9VVC5lbnZlbG9wZSB9KTtcbiAgfVxuXG4gIC8qKiBBIG5ldyBjdXJyZW50LXNjaGVtYSB3b3JsZC4gYGdlbmVyYXRvclZlcnNpb25gIGRlZmF1bHRzIHRvIHYxIGZvciBBUEkgY29tcGF0aWJpbGl0eS4gKi9cbiAgc3RhdGljIGdlbmVzaXMoc2VlZCA9IDEzMzcsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IEdhbWVTZXNzaW9uIHtcbiAgICByZXR1cm4gbmV3IEdhbWVTZXNzaW9uKFxuICAgICAgZ2VuZXNpc1dvcmxkKHNlZWQsIGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSwgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSwgZ2VuZXJhdG9yVmVyc2lvbiksXG4gICAgICBjcmVhdGVKb3VybmFsKHNlZWQsIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEsIGdlbmVyYXRvclZlcnNpb24pLFxuICAgICk7XG4gIH1cblxuICAvKiogQ29tcGF0aWJpbGl0eSBlbnRyeSBwb2ludCBmb3IgcmVjb3JkZWQgTTAwMiBmaXh0dXJlcyBhbmQgc2F2ZWQgd29ybGRzLiAqL1xuICBzdGF0aWMgbGVnYWN5R2VuZXNpcyhzZWVkID0gMTMzNywgc2NoZW1hOiB0eXBlb2YgSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX0pPVVJOQUxfU0NIRU1BID0gSk9VUk5BTF9TQ0hFTUEpOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0dXJuIG5ldyBHYW1lU2Vzc2lvbihnZW5lc2lzV29ybGQoc2VlZCwgaW52ZW50b3J5KE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkpLCBzY2hlbWEpLCBjcmVhdGVKb3VybmFsKHNlZWQsIHNjaGVtYSkpO1xuICB9XG5cbiAgLyoqIFJlcGxheSBhY2NlcHRlZCBjb21tYW5kcyBpbiB0aGVpciBhdXRob3JpdGF0aXZlIG9yZGVyIGZyb20gYW4gZW1wdHkgd29ybGQuXG4gICAqIEEgbm9ybWFsIHJlcGxheSBpcyBhdHRlbXB0ZWQgZmlyc3Q6IHN0b25lIGZyb20gcmV0YWluZWQgY2Fpcm5zIGFuZCBidWlsZGluZ1xuICAgKiBwcmVwYXJhdGlvbiBtdXN0IG5vdCBmb3JjZSBoaXN0b3JpY2FsIG1vZGUuIFJhdyBvbGQgam91cm5hbHMgZW50ZXIgcHJpdmF0ZVxuICAgKiByZWNvbnN0cnVjdGlvbiBvbmx5IHdoZW4gdGhlaXIgb3JpZ2luYWwgc3RvbmUgb2JzdHJ1Y3Rpb25zIHJlcXVpcmVkIGl0LiAqL1xuICBzdGF0aWMgcmVwbGF5KGlucHV0OiB1bmtub3duKTogR2FtZVNlc3Npb24ge1xuICAgIGNvbnN0IGpvdXJuYWwgPSB2YWxpZGF0ZUpvdXJuYWwoaW5wdXQpO1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gR2FtZVNlc3Npb24ucmVwbGF5Q3VycmVudChqb3VybmFsKTtcbiAgICB9IGNhdGNoIChjdXJyZW50RXJyb3IpIHtcbiAgICAgIGlmICgham91cm5hbC5lbnRyaWVzLnNvbWUoY29udGFpbnNSZXRpcmVkU3RvbmUpKSB0aHJvdyBjdXJyZW50RXJyb3I7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gR2FtZVNlc3Npb24ucmVjb25zdHJ1Y3RIaXN0b3JpY2FsKGpvdXJuYWwpLnNlc3Npb247XG4gICAgICB9IGNhdGNoIChoaXN0b3JpY2FsRXJyb3IpIHtcbiAgICAgICAgLy8gQW4gYWxyZWFkeS1taWdyYXRlZCBqb3VybmFsIGhhcyByZXdyaXR0ZW4gaGFzaGVzOyB2ZXJpZnkgaXRzIHJldGFpbmVkXG4gICAgICAgIC8vIHN0b25lIGNvbW1hbmRzIG5vcm1hbGx5IGluc3RlYWQgb2YgYWNjZXB0aW5nIHRoZSBmYWlsZWQgb2xkIHJlcGxheS5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gR2FtZVNlc3Npb24ucmVwbGF5Q3VycmVudChqb3VybmFsKTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgdGhyb3cgaGlzdG9yaWNhbEVycm9yO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqIFJlc3RvcmUgYSB2YWxpZGF0ZWQgc25hcHNob3QsIHRoZW4gcmVwbGF5IG9ubHkgaXRzIGFjY2VwdGVkLWNvbW1hbmQgdGFpbC4gKi9cbiAgc3RhdGljIHJlc3RvcmUoc25hcHNob3RJbnB1dDogV29ybGRTbmFwc2hvdCwgam91cm5hbElucHV0OiB1bmtub3duKTogR2FtZVNlc3Npb24ge1xuICAgIGNvbnN0IGpvdXJuYWwgPSB2YWxpZGF0ZUpvdXJuYWwoam91cm5hbElucHV0KTtcbiAgICBjb25zdCBzbmFwc2hvdCA9IHZhbGlkYXRlV29ybGRTbmFwc2hvdChzbmFwc2hvdElucHV0KTtcbiAgICBpZiAoc25hcHNob3Quc2NoZW1hICE9PSBqb3VybmFsLnNjaGVtYSkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBhbmQgam91cm5hbCBzY2hlbWFzIGRpZmZlcicpO1xuICAgIGNvbnN0IG5leHQgPSBzbmFwc2hvdC5uZXh0U2VxdWVuY2U7XG4gICAgaWYgKG5leHQgPiBqb3VybmFsLmVudHJpZXMubGVuZ3RoKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGlzIGFoZWFkIG9mIHRoZSBqb3VybmFsJyk7XG4gICAgLy8gQ3VycmVudCBzYXZlcyAoaW5jbHVkaW5nIGV2ZXJ5IG1pZ3JhdGVkIGJvdW5kYXJ5KSBrZWVwIHRoZWlyIGV4YWN0IGhhc2guXG4gICAgLy8gVHJ5IHRoZW0gYmVmb3JlIHJlY29uc3RydWN0aW5nIGEgY29tcGF0aWJsZSBvbGQgam91cm5hbC4gRGVwb3NpdC1vbmx5XG4gICAgLy8gbWlncmF0ZWQgc2F2ZXMgbm8gbG9uZ2VyIGNhcnJ5IGFuIGV4cGxpY2l0IHN0b25lIGNvbW1hbmQgdG8gY2xhc3NpZnkgdGhlbS5cbiAgICBpZiAoIXNuYXBzaG90LmVudGl0aWVzLnNvbWUoKGVudGl0eSkgPT4gaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSkpIHtcbiAgICAgIHRyeSB7IHJldHVybiBHYW1lU2Vzc2lvbi5yZXN0b3JlQ3VycmVudChzbmFwc2hvdCwgam91cm5hbCwgbmV4dCk7IH0gY2F0Y2ggeyAvKiBhdXRoZW50aWNhdGVkIG1pZ3JhdGlvbiBiZWxvdyAqLyB9XG4gICAgfVxuICAgIGlmIChuZXh0ID4gMCB8fCBzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpKSB7XG4gICAgICAvLyBBIGJvdW5kYXJ5IGF1dGhlbnRpY2F0ZWQgZHVyaW5nIG1pZ3JhdGlvbiBpcyBjb21wYXJlZCB3aXRoIHRoZSBtaWdyYXRlZFxuICAgICAgLy8gc3RhdGU7IGEgcmF3IG9sZCBib3VuZGFyeSBpcyBjb21wYXJlZCB3aXRoIHRoZSBvcmlnaW5hbCBoaXN0b3JpY2FsIG9uZS5cbiAgICAgIC8vIEJvdGggcGF0aHMgYXV0aGVudGljYXRlIHRoZSBjb21wbGV0ZSBvcmlnaW5hbCBhY2NlcHRlZCBqb3VybmFsIGZpcnN0LlxuICAgICAgY29uc3QgaGlzdG9yaWNhbCA9IGpvdXJuYWwuZW50cmllcy5zb21lKHJlZmVyZW5jZXNSZXRpcmVkU3RvbmUpXG4gICAgICAgIHx8IHNuYXBzaG90LmVudGl0aWVzLnNvbWUoKGVudGl0eSkgPT4gaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSk7XG4gICAgICAvLyBBIG1pZ3JhdGVkIHNhdmUgbm8gbG9uZ2VyIGNvbnRhaW5zIHJldGlyZWQgZW50aXRpZXMuIEl0cyByZXdyaXR0ZW5cbiAgICAgIC8vIGJvdW5kYXJ5IGhhc2hlcyBkZXNjcmliZSB0aGUgZmlsdGVyZWQgc3RhdGUsIHNvIG9yZGluYXJ5IHJlc3RvcmF0aW9uXG4gICAgICAvLyBtdXN0IHN1Y2NlZWQgYmVmb3JlIHRyeWluZyB0byBpbnRlcnByZXQgaXQgYXMgcmF3IG9sZC1zYXZlIGJ5dGVzLlxuICAgICAgLy8gQSByZWZlcmVuY2VkIGF1dGhvcmVkIHN0b25lIGFsb25lIGRvZXMgKm5vdCogaW1wbHkgYSByYXcgb2xkIGJvdW5kYXJ5OlxuICAgICAgLy8gbGVnaXRpbWF0ZSBzYXZlcyBjYW4gY29udGFpbiB1bnRvdWNoZWQgbmF0dXJhbCByZXRpcmVkIGRlcG9zaXRzIG9ubHkuXG4gICAgICBpZiAoIXNuYXBzaG90LmVudGl0aWVzLnNvbWUoKGVudGl0eSkgPT4gaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSkpIHtcbiAgICAgICAgdHJ5IHsgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTsgfSBjYXRjaCB7IC8qIHRyeSBvcmlnaW5hbCByZWNvbnN0cnVjdGlvbiAqLyB9XG4gICAgICB9XG4gICAgICBpZiAoaGlzdG9yaWNhbCkge1xuICAgICAgICBjb25zdCByZWNvbnN0cnVjdGVkID0gR2FtZVNlc3Npb24ucmVjb25zdHJ1Y3RIaXN0b3JpY2FsKGpvdXJuYWwpO1xuICAgICAgICBjb25zdCBleHBlY3RlZCA9IHJlY29uc3RydWN0ZWQuc25hcHNob3RzLmdldChuZXh0KTtcbiAgICAgICAgY29uc3QgbWlncmF0ZWQgPSBleHBlY3RlZCA/IG1pZ3JhdGVTdG9uZVNuYXBzaG90KGV4cGVjdGVkKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKG1pZ3JhdGVkICYmIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgPT09IGxlZ2FjeVN0b25lSGFzaChtaWdyYXRlZCkpXG4gICAgICAgICAgcmV0dXJuIHJlY29uc3RydWN0ZWQuc2Vzc2lvbjtcbiAgICAgICAgaWYgKHNuYXBzaG90LmVudGl0aWVzLnNvbWUoKGVudGl0eSkgPT4gaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSlcbiAgICAgICAgICAmJiBleHBlY3RlZCAmJiBsZWdhY3lTdG9uZUhhc2goc25hcHNob3QpID09PSBsZWdhY3lTdG9uZUhhc2goZXhwZWN0ZWQpKVxuICAgICAgICAgIHJldHVybiByZWNvbnN0cnVjdGVkLnNlc3Npb247XG4gICAgICAgIGlmIChzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdoaXN0b3JpY2FsIHNuYXBzaG90IGRvZXMgbm90IG1hdGNoIGl0cyBvcmlnaW5hbCBqb3VybmFsIGJvdW5kYXJ5Jyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG5leHQgPiAwKSByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpO1xuICAgIGNvbnN0IGhpc3RvcmljYWwgPSBqb3VybmFsLmVudHJpZXMuc29tZShjb250YWluc1JldGlyZWRTdG9uZSk7XG4gICAgaWYgKGhpc3RvcmljYWwpIHtcbiAgICAgIHRyeSB7IHJldHVybiBHYW1lU2Vzc2lvbi5yZXN0b3JlQ3VycmVudChzbmFwc2hvdCwgam91cm5hbCwgbmV4dCk7IH0gY2F0Y2ggeyAvKiByYXcgb3IgbWlncmF0ZWQgZ2VuZXNpcyAqLyB9XG4gICAgICBjb25zdCByZWNvbnN0cnVjdGVkID0gR2FtZVNlc3Npb24ucmVjb25zdHJ1Y3RIaXN0b3JpY2FsKGpvdXJuYWwpO1xuICAgICAgY29uc3QgcmF3R2VuZXNpcyA9IHJlY29uc3RydWN0ZWQuc25hcHNob3RzLmdldCgwKSE7XG4gICAgICBpZiAobGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90KSA9PT0gbGVnYWN5U3RvbmVIYXNoKHJhd0dlbmVzaXMpKSByZXR1cm4gcmVjb25zdHJ1Y3RlZC5zZXNzaW9uO1xuICAgIH1cbiAgICByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpO1xuICB9XG5cbiAgLyoqIFJlcGxheSBhbHJlYWR5LWF1dGhlbnRpY2F0ZWQgY3VycmVudC1zdGF0ZSBjb21tYW5kcy4gKi9cbiAgcHJpdmF0ZSBzdGF0aWMgcmVwbGF5Q3VycmVudChqb3VybmFsOiBDb21tYW5kSm91cm5hbCk6IEdhbWVTZXNzaW9uIHtcbiAgICBjb25zdCBzZXNzaW9uID0gbmV3IEdhbWVTZXNzaW9uKFxuICAgICAgZ2VuZXNpc1dvcmxkKGpvdXJuYWwuc2VlZCwgam91cm5hbC5zdGFydGVySW52ZW50b3J5LCBqb3VybmFsLnNjaGVtYSwgam91cm5hbEdlbmVyYXRvcihqb3VybmFsKSksXG4gICAgICBjcmVhdGVKb3VybmFsKGpvdXJuYWwuc2VlZCwgam91cm5hbC5zY2hlbWEsIGpvdXJuYWxHZW5lcmF0b3Ioam91cm5hbCkpLFxuICAgICk7XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBqb3VybmFsLmVudHJpZXMpIHNlc3Npb24ucmVwbGF5RW50cnkoZW50cnkpO1xuICAgIHJldHVybiBzZXNzaW9uO1xuICB9XG5cbiAgcHJpdmF0ZSBzdGF0aWMgcmVzdG9yZUN1cnJlbnQoc25hcHNob3Q6IFdvcmxkU25hcHNob3QsIGpvdXJuYWw6IENvbW1hbmRKb3VybmFsLCBuZXh0OiBudW1iZXIpOiBHYW1lU2Vzc2lvbiB7XG4gICAgY29uc3Qgd29ybGQgPSB3b3JsZEZyb21TbmFwc2hvdChzbmFwc2hvdCk7XG4gICAgaWYgKHdvcmxkLnNlZWQgIT09IGpvdXJuYWwuc2VlZCkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBhbmQgam91cm5hbCBzZWVkcyBkaWZmZXInKTtcbiAgICBpZiAod29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24gIT09IGpvdXJuYWxHZW5lcmF0b3Ioam91cm5hbCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgYW5kIGpvdXJuYWwgdGVycmFpbiBnZW5lcmF0b3JzIGRpZmZlcicpO1xuICAgIH1cbiAgICBjb25zdCBnZW5lc2lzID0gZ2VuZXNpc1dvcmxkKGpvdXJuYWwuc2VlZCwgam91cm5hbC5zdGFydGVySW52ZW50b3J5LCBqb3VybmFsLnNjaGVtYSwgam91cm5hbEdlbmVyYXRvcihqb3VybmFsKSk7XG4gICAgaWYgKG5leHQgPT09IDAgJiYgbGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90KSAhPT0gY2Fub25pY2FsV29ybGRIYXNoKGdlbmVzaXMsIDAsIGpvdXJuYWwuc2NoZW1hKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdnZW5lc2lzIHNuYXBzaG90IGRvZXMgbm90IG1hdGNoIGpvdXJuYWwgY29uZmlndXJhdGlvbicpO1xuICAgIH1cbiAgICBpZiAobmV4dCA+IDAgJiYgbGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90KSAhPT0gam91cm5hbC5lbnRyaWVzW25leHQgLSAxXS5oYXNoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhc2ggZG9lcyBub3QgbWF0Y2ggaXRzIGpvdXJuYWwgYm91bmRhcnknKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvbiA9IEdhbWVTZXNzaW9uLmZyb21WYWxpZGF0ZWRCb3VuZGFyeSh3b3JsZCwge1xuICAgICAgc2NoZW1hOiBqb3VybmFsLnNjaGVtYSwgc2VlZDogam91cm5hbC5zZWVkLFxuICAgICAgLi4uKGpvdXJuYWwuZ2VuZXJhdG9yVmVyc2lvbiA/IHsgZ2VuZXJhdG9yVmVyc2lvbjogam91cm5hbC5nZW5lcmF0b3JWZXJzaW9uIH0gOiB7fSksXG4gICAgICBzdGFydGVySW52ZW50b3J5OiB7IC4uLmpvdXJuYWwuc3RhcnRlckludmVudG9yeSB9LCBlbnRyaWVzOiBqb3VybmFsLmVudHJpZXMuc2xpY2UoMCwgbmV4dCksXG4gICAgfSk7XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBqb3VybmFsLmVudHJpZXMuc2xpY2UobmV4dCkpIHNlc3Npb24ucmVwbGF5RW50cnkoZW50cnkpO1xuICAgIHJldHVybiBzZXNzaW9uO1xuICB9XG5cbiAgLyoqIEBpbnRlcm5hbCBBc3NlbWJsZSBhbiBhdXRoZW50aWNhdGVkIHNhdmUgYm91bmRhcnk7IGdhbWVwbGF5IHVzZXMgZGlzcGF0Y2guICovXG4gIHByaXZhdGUgc3RhdGljIGZyb21WYWxpZGF0ZWRCb3VuZGFyeSh3b3JsZDogV29ybGQsIGpvdXJuYWw6IENvbW1hbmRKb3VybmFsKTogR2FtZVNlc3Npb24ge1xuICAgIHJldHVybiBuZXcgR2FtZVNlc3Npb24od29ybGQsIGpvdXJuYWwpO1xuICB9XG5cbiAgLyoqIEBpbnRlcm5hbCBTb3VyY2UgZm9yIGRldGVybWluaXN0aWMgb2xkLXNhdmUgZml4dHVyZXM7IG5vdCBhIGxpdmUgc2Vzc2lvbi4gKi9cbiAgc3RhdGljIGhpc3RvcmljYWxKb3VybmFsKHdvcmxkOiBXb3JsZCk6IEdhbWVTZXNzaW9uIHtcbiAgICByZXR1cm4gbmV3IEdhbWVTZXNzaW9uKHdvcmxkLCBjcmVhdGVKb3VybmFsKHdvcmxkLnNlZWQsIHdvcmxkLmxpZmUgPyBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BXG4gICAgICA6IHdvcmxkLnN0cnVjdHVyZXMuc2l6ZSA+IDAgPyBERVNJR05fSk9VUk5BTF9TQ0hFTUEgOiBKT1VSTkFMX1NDSEVNQSkpO1xuICB9XG5cbiAgLyoqIEBpbnRlcm5hbCBTb3VyY2UgZm9yIGRldGVybWluaXN0aWMgb2xkLXNhdmUgZml4dHVyZXM7IG5vdCBhIGxpdmUgc2Vzc2lvbi4gKi9cbiAgc3RhdGljIGhpc3RvcmljYWxHZW5lc2lzV29ybGQoc2VlZCA9IDEzMzcsIHNjaGVtYTogQ29tbWFuZEpvdXJuYWxbJ3NjaGVtYSddID0gSk9VUk5BTF9TQ0hFTUEpOiBXb3JsZCB7XG4gICAgcmV0dXJuIGhpc3RvcmljYWxHZW5lc2lzV29ybGQoc2VlZCwgaW52ZW50b3J5KE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkpLCBzY2hlbWEpO1xuICB9XG5cbiAgcHJpdmF0ZSBzdGF0aWMgcmVjb25zdHJ1Y3RIaXN0b3JpY2FsKGpvdXJuYWw6IENvbW1hbmRKb3VybmFsKToge1xuICAgIHNlc3Npb246IEdhbWVTZXNzaW9uOyBzbmFwc2hvdHM6IE1hcDxudW1iZXIsIFdvcmxkU25hcHNob3Q+O1xuICB9IHtcbiAgICBjb25zdCBleHBlY3RlZEdlbmVzaXMgPSBoaXN0b3JpY2FsR2VuZXNpc1dvcmxkKGpvdXJuYWwuc2VlZCwgam91cm5hbC5zdGFydGVySW52ZW50b3J5LCBqb3VybmFsLnNjaGVtYSk7XG4gICAgY29uc3Qgc25hcHNob3RzID0gbmV3IE1hcDxudW1iZXIsIFdvcmxkU25hcHNob3Q+KCk7XG4gICAgc25hcHNob3RzLnNldCgwLCBjcmVhdGVXb3JsZFNuYXBzaG90KGV4cGVjdGVkR2VuZXNpcywgMCwgam91cm5hbC5zY2hlbWEpKTtcbiAgICBjb25zdCByZXBsYXkgPSBuZXcgR2FtZVNlc3Npb24oZXhwZWN0ZWRHZW5lc2lzLCBjcmVhdGVKb3VybmFsKGpvdXJuYWwuc2VlZCwgam91cm5hbC5zY2hlbWEpKTtcbiAgICBjb25zdCBtaWdyYXRlZEpvdXJuYWwgPSBjcmVhdGVKb3VybmFsKGpvdXJuYWwuc2VlZCwgam91cm5hbC5zY2hlbWEpO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2Ygam91cm5hbC5lbnRyaWVzKSB7XG4gICAgICByZXBsYXkucmVwbGF5RW50cnkoZW50cnkpO1xuICAgICAgY29uc3Qgc25hcHNob3QgPSBjcmVhdGVXb3JsZFNuYXBzaG90KHJlcGxheS53b3JsZCwgcmVwbGF5Lm5leHRTZXF1ZW5jZSwgam91cm5hbC5zY2hlbWEpO1xuICAgICAgc25hcHNob3RzLnNldChyZXBsYXkubmV4dFNlcXVlbmNlLCBzbmFwc2hvdCk7XG4gICAgICAvLyBLZWVwIHRoZSByZXdyaXR0ZW4gYXV0aGVudGljYXRlZCBib3VuZGFyeSBpbiB0aGUgcmV0dXJuZWQgam91cm5hbC4gQVxuICAgICAgLy8gcmVwbGF5LW9ubHkgam91cm5hbCByZWJ1aWxkIHdvdWxkIHNpbGVudGx5IHB1dCB0aGUgcmF3IGhhc2ggYmFjay5cbiAgICAgIGVudHJ5Lmhhc2ggPSBsZWdhY3lTdG9uZUhhc2gobWlncmF0ZVN0b25lU25hcHNob3Qoc25hcHNob3QpKTtcbiAgICAgIG1pZ3JhdGVkSm91cm5hbC5lbnRyaWVzLnB1c2goZW50cnkpO1xuICAgIH1cbiAgICBjb25zdCBzZXNzaW9uID0gR2FtZVNlc3Npb24uZnJvbVZhbGlkYXRlZEJvdW5kYXJ5KHJlcGxheS53b3JsZCwgbWlncmF0ZWRKb3VybmFsKTtcbiAgICByZXR1cm4geyBzZXNzaW9uOiBzZXNzaW9uLm1pZ3JhdGVSZXRpcmVkU3RvbmVzKCksIHNuYXBzaG90cyB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzbmFwc2hvdFNjaGVtYSgpOiBXb3JsZFNuYXBzaG90WydzY2hlbWEnXSB7IHJldHVybiB0aGlzLmpvdXJuYWwuc2NoZW1hOyB9XG5cbiAgZ2V0IG5leHRTZXF1ZW5jZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5qb3VybmFsLmVudHJpZXMubGVuZ3RoOyB9XG4gIGdldCBzbmFwc2hvdCgpOiBXb3JsZFNuYXBzaG90IHtcbiAgICByZXR1cm4gY3JlYXRlV29ybGRTbmFwc2hvdCh0aGlzLndvcmxkLCB0aGlzLm5leHRTZXF1ZW5jZSwgdGhpcy5zbmFwc2hvdFNjaGVtYSgpKTtcbiAgfVxuICBnZXQgc3RhdGVIYXNoKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGNhbm9uaWNhbFdvcmxkSGFzaCh0aGlzLndvcmxkLCB0aGlzLm5leHRTZXF1ZW5jZSwgdGhpcy5zbmFwc2hvdFNjaGVtYSgpKTtcbiAgfVxuXG4gIGNvbW1hbmRJZChraW5kOiBDb21tYW5kWyd0eXBlJ10sIHRhcmdldDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAvLyBFbnRpdHkgSURzIGNvbnRhaW4gY2h1bmsgY29vcmRpbmF0ZXM7IGVuY29kZSBjb21tYXMgYW5kIG90aGVyIHNlcGFyYXRvcnNcbiAgICAvLyBzbyBnZW5lcmF0ZWQgY29tbWFuZHMgc2F0aXNmeSB0aGUgc2FtZSBlbnZlbG9wZSB2YWxpZGF0aW9uIGFzIGlucHV0LlxuICAgIHJldHVybiBgJHtraW5kfToke3RoaXMubmV4dFNlcXVlbmNlfToke2VuY29kZVVSSUNvbXBvbmVudCh0YXJnZXQpfWA7XG4gIH1cblxuICBlbnRyeShzZXF1ZW5jZTogbnVtYmVyKTogSm91cm5hbEVudHJ5IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuam91cm5hbC5lbnRyaWVzW3NlcXVlbmNlXTsgfVxuXG4gIGRpc3BhdGNoKGlucHV0OiB1bmtub3duKTogQ29tbWFuZFJlY2VpcHQgfCBDb21tYW5kUmVqZWN0aW9uIHtcbiAgICBsZXQgY29tbWFuZDogQ29tbWFuZDtcbiAgICB0cnkgeyBjb21tYW5kID0gdmFsaWRhdGVDb21tYW5kKGlucHV0KTsgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlamVjdChvYmplY3QoaW5wdXQpICYmIHR5cGVvZiBpbnB1dC5pZCA9PT0gJ3N0cmluZycgPyBpbnB1dC5pZCA6ICcnLFxuICAgICAgICAnaW52YWxpZF9jb21tYW5kJywgWyhlcnJvciBhcyBFcnJvcikubWVzc2FnZV0pO1xuICAgIH1cbiAgICBpZiAoKGNvbW1hbmQudHlwZSA9PT0gJ2J1aWxkJyB8fCBjb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0JylcbiAgICAgICYmIGNvbW1hbmQuc2NoZW1hICE9PSB0aGlzLmpvdXJuYWwuc2NoZW1hXG4gICAgICB8fCBjb21tYW5kLnR5cGUgIT09ICdidWlsZCcgJiYgY29tbWFuZC50eXBlICE9PSAnaGFydmVzdCdcbiAgICAgICAgJiYgdGhpcy5qb3VybmFsLnNjaGVtYSAhPT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkge1xuICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsICdzY2hlbWFfbWlzbWF0Y2gnLCBbJ2NvbW1hbmQgc2NoZW1hIGRvZXMgbm90IG1hdGNoIHRoaXMgd29ybGQgam91cm5hbCddKTtcbiAgICB9XG4gICAgY29uc3QgcHJpb3IgPSB0aGlzLmlkcy5nZXQoY29tbWFuZC5pZCk7XG4gICAgaWYgKHByaW9yKSB7XG4gICAgICBpZiAoIXNhbWVGaWVsZHMocHJpb3IuY29tbWFuZCwgY29tbWFuZCkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsICdkdXBsaWNhdGVfY29tbWFuZF9pZCcsIFsnY29tbWFuZCBpZCBhbHJlYWR5IGhhcyBkaWZmZXJlbnQgYWNjZXB0ZWQgaW5wdXQnXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5yZWNlaXB0KHByaW9yLCB0cnVlKTtcbiAgICB9XG4gICAgaWYgKGNvbW1hbmQuZXhwZWN0ZWRSZXZpc2lvbiAhPT0gdGhpcy53b3JsZC5yZXZpc2lvbikge1xuICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsICdzdGFsZV9yZXZpc2lvbicsIFtcbiAgICAgICAgYGNvbW1hbmQgZXhwZWN0cyByZXZpc2lvbiAke2NvbW1hbmQuZXhwZWN0ZWRSZXZpc2lvbn07IHdvcmxkIGlzIGF0ICR7dGhpcy53b3JsZC5yZXZpc2lvbn1gLFxuICAgICAgXSk7XG4gICAgfVxuICAgIGNvbnN0IGJlZm9yZSA9IHRoaXMuc3RhdGVIYXNoO1xuICAgIGxldCBvdXRjb21lOiBDb21tYW5kT3V0Y29tZTtcbiAgICBpZiAoY29tbWFuZC50eXBlID09PSAnYnVpbGQnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBidWlsZFByb2plY3QodGhpcy53b3JsZCwgdGhpcy5wcmVwQXV0aG9yaXplciwgdGhpcy5zdHJ1Y3R1cmVBdXRob3JpemVyLFxuICAgICAgICBwcm9qZWN0QnlJZChjb21tYW5kLnByb2plY3RJZCksXG4gICAgICAgICdkZXNpZ25WZXJzaW9uJyBpbiBjb21tYW5kID8gY29tbWFuZC5kZXNpZ25WZXJzaW9uIDogdW5kZWZpbmVkKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlSGFzaCAhPT0gYmVmb3JlKSB0aHJvdyBuZXcgRXJyb3IoJ3JlamVjdGVkIGJ1aWxkIGNoYW5nZWQgYXV0aG9yaXRhdGl2ZSBzdGF0ZScpO1xuICAgICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIH1cbiAgICAgIG91dGNvbWUgPSB7XG4gICAgICAgIHR5cGU6ICdidWlsZCcsIHN0cnVjdHVyZUlkOiByZXN1bHQucmVjb3JkLmlkLFxuICAgICAgICBjb3N0UGFpZDogaW52ZW50b3J5KHJlc3VsdC5zdHJ1Y3R1cmUuY29zdFBhaWQpLFxuICAgICAgICByZXNvdXJjZXNHYWluZWQ6IGludmVudG9yeShyZXN1bHQucHJlcGFyYXRpb24ucmVzb3VyY2VzR2FpbmVkKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0Jykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gaGFydmVzdEVudGl0eSh0aGlzLndvcmxkLCBjb21tYW5kLmVudGl0eUlkKTtcbiAgICAgIGlmICghcmVzdWx0KSByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgJ25vdF9oYXJ2ZXN0YWJsZScsIFsnZW50aXR5IGlzIGFic2VudCwgZGVwbGV0ZWQgb3IgaGFzIG5vIHJlc291cmNlJ10pO1xuICAgICAgb3V0Y29tZSA9IHtcbiAgICAgICAgdHlwZTogJ2hhcnZlc3QnLCBlbnRpdHlJZDogcmVzdWx0LmVudGl0eS5pZCxcbiAgICAgICAgcmVzb3VyY2U6IHJlc3VsdC5yZXNvdXJjZSwgYW1vdW50OiByZXN1bHQuYW1vdW50LFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ2RlcG9zaXQnIHx8IGNvbW1hbmQudHlwZSA9PT0gJ3dpdGhkcmF3Jykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gdHJhbnNmZXIodGhpcy53b3JsZCwgY29tbWFuZC50eXBlLCBjb21tYW5kLnJlc291cmNlcyk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZUhhc2ggIT09IGJlZm9yZSkgdGhyb3cgbmV3IEVycm9yKCdyZWplY3RlZCB0cmFuc2ZlciBjaGFuZ2VkIGF1dGhvcml0YXRpdmUgc3RhdGUnKTtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICB9XG4gICAgICBvdXRjb21lID0geyB0eXBlOiBjb21tYW5kLnR5cGUsIHN0b2NrcGlsZUlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCwgcmVzb3VyY2VzOiByZXN1bHQudmFsdWUgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ3Byb2R1Y2UnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBzdGFydFByb2R1Y3Rpb24odGhpcy53b3JsZCwgY29tbWFuZC5yZWNpcGUsIGNvbW1hbmQuaWQpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgb3V0Y29tZSA9IHsgdHlwZTogJ3Byb2R1Y2UnLCBqb2JJZDogcmVzdWx0LnZhbHVlLmlkLCBzdG9ja3BpbGVJZDogcmVzdWx0LnZhbHVlLnN0b2NrcGlsZUlkLFxuICAgICAgICByZWNpcGU6IHJlc3VsdC52YWx1ZS5yZWNpcGUsIHJlbWFpbmluZ1RpY2tzOiByZXN1bHQudmFsdWUucmVtYWluaW5nVGlja3MgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ3RpY2snKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhZHZhbmNlVGlja3ModGhpcy53b3JsZCwgY29tbWFuZC50aWNrcyk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICBvdXRjb21lID0geyB0eXBlOiAndGljaycsIC4uLnJlc3VsdC52YWx1ZSB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAncGxhbnQnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBwbGFudENyb3AodGhpcy53b3JsZCwgY29tbWFuZC5wbG90SWQpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgb3V0Y29tZSA9IHsgdHlwZTogJ3BsYW50JywgcGxvdElkOiBjb21tYW5kLnBsb3RJZCxcbiAgICAgICAgcGxhbnRlZFRpY2s6IHJlc3VsdC52YWx1ZS5wbGFudGVkVGljaywgZ3Jvd3RoVGlja3M6IHJlc3VsdC52YWx1ZS5ncm93dGhUaWNrcyB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAnaGFydmVzdF9jcm9wJykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gaGFydmVzdENyb3AodGhpcy53b3JsZCwgY29tbWFuZC5wbG90SWQpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgb3V0Y29tZSA9IHsgdHlwZTogJ2hhcnZlc3RfY3JvcCcsIHBsb3RJZDogY29tbWFuZC5wbG90SWQsIHJlc291cmNlczogcmVzdWx0LnZhbHVlIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigndW5oYW5kbGVkIGNvbW1hbmQgdHlwZScpO1xuICAgIH1cbiAgICBjb25zdCBlbnRyeTogSm91cm5hbEVudHJ5ID0ge1xuICAgICAgY29tbWFuZCwgc2VxdWVuY2U6IHRoaXMubmV4dFNlcXVlbmNlLCByZXZpc2lvbjogdGhpcy53b3JsZC5yZXZpc2lvbixcbiAgICAgIC8vIFRoZSBzZXF1ZW5jZSBpcyBwYXJ0IG9mIHRoZSBzdGF0ZSBoYXNoIGF0IHRoaXMgYWNjZXB0ZWQgYm91bmRhcnkuXG4gICAgICBoYXNoOiBjYW5vbmljYWxXb3JsZEhhc2godGhpcy53b3JsZCwgdGhpcy5uZXh0U2VxdWVuY2UgKyAxLCB0aGlzLnNuYXBzaG90U2NoZW1hKCkpLCBvdXRjb21lLFxuICAgIH07XG4gICAgdGhpcy5qb3VybmFsLmVudHJpZXMucHVzaChlbnRyeSk7XG4gICAgdGhpcy5pZHMuc2V0KGNvbW1hbmQuaWQsIGVudHJ5KTtcbiAgICByZXR1cm4gdGhpcy5yZWNlaXB0KGVudHJ5LCBmYWxzZSk7XG4gIH1cblxuICBwcml2YXRlIHJlcGxheUVudHJ5KGVudHJ5OiBKb3VybmFsRW50cnkpOiB2b2lkIHtcbiAgICBpZiAoZW50cnkuc2VxdWVuY2UgIT09IHRoaXMubmV4dFNlcXVlbmNlKSB0aHJvdyBuZXcgRXJyb3IoJ2pvdXJuYWwgc2VxdWVuY2UgZ2FwJyk7XG4gICAgY29uc3QgcmVjZWlwdCA9IHRoaXMuZGlzcGF0Y2goZW50cnkuY29tbWFuZCk7XG4gICAgaWYgKCFyZWNlaXB0Lm9rIHx8IHJlY2VpcHQuZHVwbGljYXRlIHx8IHJlY2VpcHQuaGFzaCAhPT0gZW50cnkuaGFzaFxuICAgICAgfHwgcmVjZWlwdC5yZXZpc2lvbiAhPT0gZW50cnkucmV2aXNpb25cbiAgICAgIHx8IEpTT04uc3RyaW5naWZ5KHJlY2VpcHQub3V0Y29tZSkgIT09IEpTT04uc3RyaW5naWZ5KGVudHJ5Lm91dGNvbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYGpvdXJuYWwgcmVwbGF5IGRpdmVyZ2VkIGF0IHNlcXVlbmNlICR7ZW50cnkuc2VxdWVuY2V9YCk7XG4gICAgfVxuICB9XG5cbiAgLyoqIEhpc3RvcmljYWwgZW50cmllcyBoYXZlIHBhc3NlZCB0aGVpciBvcmlnaW5hbCBvdXRjb21lL2hhc2ggY2hlY2tzLiBUaGVpclxuICAgKiBhY2NlcHRlZCBjb21tYW5kcyBhbmQgc3RvbmUgeWllbGRzIHJlbWFpbjsgb25seSBlbnRpdHkgZXhpc3RlbmNlIGFuZCB0aGVcbiAgICogcmVzdWx0aW5nIGNhbm9uaWNhbCBib3VuZGFyeSBoYXNoZXMgY2hhbmdlLiAqL1xuICBwcml2YXRlIG1pZ3JhdGVSZXRpcmVkU3RvbmVzKCk6IEdhbWVTZXNzaW9uIHtcbiAgICByZXRpcmVTdG9uZUVudGl0aWVzKHRoaXMud29ybGQpO1xuICAgIGZpbmlzaFN0b25lUmVwbGF5KHRoaXMud29ybGQpO1xuICAgIGNvbnN0IG1pZ3JhdGVkID0gY3JlYXRlV29ybGRTbmFwc2hvdCh0aGlzLndvcmxkLCB0aGlzLm5leHRTZXF1ZW5jZSwgdGhpcy5zbmFwc2hvdFNjaGVtYSgpKTtcbiAgICByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0KHRoaXMud29ybGQsIG1pZ3JhdGVkKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIHByaXZhdGUgcmVjZWlwdChlbnRyeTogSm91cm5hbEVudHJ5LCBkdXBsaWNhdGU6IGJvb2xlYW4pOiBDb21tYW5kUmVjZWlwdCB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiB0cnVlLCBkdXBsaWNhdGUsIGlkOiBlbnRyeS5jb21tYW5kLmlkLCBzZXF1ZW5jZTogZW50cnkuc2VxdWVuY2UsXG4gICAgICByZXZpc2lvbjogZW50cnkucmV2aXNpb24sIGhhc2g6IGVudHJ5Lmhhc2gsIG91dGNvbWU6IGVudHJ5Lm91dGNvbWUsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgcmVqZWN0KGlkOiBzdHJpbmcsIGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBDb21tYW5kUmVqZWN0aW9uIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGR1cGxpY2F0ZTogZmFsc2UsIGlkLCBjb2RlLCByZWFzb25zIH07XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVzaXNXb3JsZChzZWVkOiBudW1iZXIsIHN0YXJ0ZXIgPSBpbnZlbnRvcnkoTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSksXG4gIHNjaGVtYTogQ29tbWFuZEpvdXJuYWxbJ3NjaGVtYSddID0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSwgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoc2VlZCwgMCwgZ2VuZXJhdG9yVmVyc2lvbik7XG4gIHdvcmxkLmludmVudG9yeSA9IHsgLi4uc3RhcnRlciB9O1xuICBpZiAoc2NoZW1hID09PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB3b3JsZC5saWZlID0gY3JlYXRlTGlmZVN0YXRlKCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuZnVuY3Rpb24gaGlzdG9yaWNhbEdlbmVzaXNXb3JsZChzZWVkOiBudW1iZXIsIHN0YXJ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4sXG4gIHNjaGVtYTogQ29tbWFuZEpvdXJuYWxbJ3NjaGVtYSddKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQpO1xuICBlbmFibGVTdG9uZVJlcGxheSh3b3JsZCk7XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHdvcmxkLmludmVudG9yeSA9IHsgLi4uc3RhcnRlciB9O1xuICBpZiAoc2NoZW1hID09PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB3b3JsZC5saWZlID0gY3JlYXRlTGlmZVN0YXRlKCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuZnVuY3Rpb24gY29udGFpbnNSZXRpcmVkU3RvbmUoZW50cnk6IEpvdXJuYWxFbnRyeSk6IGJvb2xlYW4ge1xuICBpZiAoZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcpIHtcbiAgICByZXR1cm4gZW50cnkub3V0Y29tZS50eXBlID09PSAnaGFydmVzdCdcbiAgICAgICYmIChlbnRyeS5vdXRjb21lLnJlc291cmNlID09PSAnc3RvbmUnXG4gICAgICAgIHx8IC9eaGVybzpzdHlsX3JvY2tfKD86c21hbGx8bWVkaXVtfGxhcmdlKTovLnRlc3QoZW50cnkuY29tbWFuZC5lbnRpdHlJZCkpO1xuICB9XG4gIHJldHVybiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICdidWlsZCcgJiYgKGVudHJ5Lm91dGNvbWUucmVzb3VyY2VzR2FpbmVkLnN0b25lID8/IDApID4gMDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxPQUFPLFlBQVk7QUFDbkIsT0FBTyxVQUFVOzs7QUNPakIsSUFBTSxTQUFTLG9CQUFJLFFBQTZCO0FBRXpDLFNBQVMsaUJBQWlCLE9BQTRCO0FBQzNELE1BQUksUUFBUSxPQUFPLElBQUksS0FBSztBQUM1QixNQUFJLENBQUMsT0FBTztBQUFFLFlBQVEsRUFB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QU0sR0FBWTtBQUMxRCxXQUFPLE1BQU0sS0FBSyxTQUFTLFFBQVEsTUFBTSxXQUFXLFNBQVMsQ0FBQyxFQUFFLElBQUksSUFBSTtBQUFBLEVBQzFFO0FBQ0EsU0FBTyxNQUFNLEtBQUssTUFBTSxTQUFTLE9BQU8sR0FBRyxJQUFJO0FBQy9DLFFBQU0sV0FBVyxZQUFZLE9BQU8sTUFBTSxLQUFLLE9BQU8sQ0FBQztBQUN2RCxTQUFPLE1BQU0sU0FBUyxXQUFXLEtBQUssU0FBUztBQUMvQyxTQUFPO0FBQUEsSUFDTCxvQkFBb0IsU0FBUyxPQUFPLFlBQVksaUJBQWlCLFlBQVksUUFBUSxFQUFFO0FBQUEsSUFDdkY7QUFBQSxFQUNGO0FBQ0YsQ0FBQztBQUVELEtBQUssMkVBQTJFLE1BQU07QUFDcEYsUUFBTSxVQUFVLGNBQWM7QUFDOUIsU0FBTyxPQUFPLE1BQU0sZ0JBQWdCLEVBQUUsR0FBRyxTQUFTLGtCQUFrQixFQUFFLEdBQUcsUUFBUSxrQkFBa0IsTUFBTSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQ2hILFNBQU8sT0FBTyxNQUFNLGdCQUFnQixFQUFFLEdBQUcsU0FBUyxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQ2xFLFNBQU8sT0FBTyxNQUFNLGdCQUFnQixFQUFFLEdBQUcsU0FBUyxrQkFBa0IsRUFBRSxNQUFNLElBQUksT0FBTyxJQUFJLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUMxRyxTQUFPLE9BQU8sTUFBTSxZQUFZLFFBQVEsRUFBRSxHQUFHLGdCQUFnQixHQUFHLGNBQWMsR0FBRyxHQUFHLE9BQU8sQ0FBQztBQUM5RixDQUFDO0FBRUQsU0FBUyxrQkFBa0I7QUFBRSxTQUFPLG9CQUFvQixhQUFhLENBQUM7QUFBRzsiLAogICJuYW1lcyI6IFsiYSIsICJiIiwgInNtb290aCIsICJ0b3RhbCIsICJpZCIsICJpZCIsICJ0ZXh0IiwgImlkIiwgImlkIiwgImRpZ2VzdCIsICJmYWlsIiwgImpvYiIsICJ0ZXh0IiwgImludmVudG9yeSIsICJpZCIsICJpZCIsICJpZCIsICJ1aW50IiwgImVudGl0eUlkIiwgImNvbW1hbmQiLCAib3V0Y29tZSIsICJoaXN0b3JpY2FsIiwgImVycm9yIiwgImlkIiwgImlkIiwgImVudGl0eUlkIiwgInJlc3VsdCJdCn0K
