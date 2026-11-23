// tests/m004.foundation.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE4 from "three";

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
  const c2 = hash2i(xi, yi + 1, seed), d = hash2i(xi + 1, yi + 1, seed);
  const top = a + (b - a) * xf;
  const bottom = c2 + (d - c2) * xf;
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
var isOpaque = isSolid;
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

// src/sim/canonical.ts
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
function inventorySnapshot(world) {
  const out = {};
  for (const key of Object.keys(world.inventory).sort()) out[key] = world.inventory[key];
  return out;
}

// src/sim/preparation.ts
var LOCAL_AUTHORITY = "local-stub";
var LOCAL_ENFORCEMENT = "local-simulation-only";
function digest(input) {
  let a = 2166136261;
  let b = 2654435769;
  for (let i = 0; i < input.length; i++) {
    const c2 = input.charCodeAt(i);
    a = Math.imul(a ^ c2, 16777619);
    b = Math.imul(b ^ c2 + 158, 2246822507);
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
    const c2 = input.charCodeAt(i);
    a = Math.imul(a ^ c2, 16777619);
    b = Math.imul(b ^ c2 + 158, 2246822507);
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
    crops: [...world.life.crops.values()].sort((a, b) => a.id.localeCompare(b.id)).map((c2) => ({ ...c2 }))
  };
}
function canonicalHash(text2) {
  let a = 2166136261, b = 2654435769;
  for (let i = 0; i < text2.length; i++) {
    const c2 = text2.charCodeAt(i);
    a = Math.imul(a ^ c2, 16777619);
    b = Math.imul(b ^ c2 + 158, 2246822507);
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
    for (const c2 of snapshot.crops) world.life.crops.set(c2.id, { ...c2 });
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

// src/render/terrain.ts
import * as THREE2 from "three";

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

// src/render/water.ts
import * as THREE from "three";
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
function meshChunkWater(world, chunk) {
  const hydro = hydrologyFor(world.seed, world.params.generatorVersion);
  const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
  const levels = new Int16Array(CHUNK_SIZE * CHUNK_SIZE).fill(-9999);
  const beds = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const col = lz * CHUNK_SIZE + lx;
      const bed = chunk.heights[col] + Y_MIN + 1;
      let y = bed;
      while (y < Y_MAX && chunk.data[localIndex(lx, yToIndex(y), lz)] === MAT.WATER) y++;
      if (y > bed) {
        levels[col] = y;
        beds[col] = bed;
      }
    }
  }
  const pos = [], nrm = [], clr = [];
  const flow = [], depth = [], foam = [], sheet = [];
  const idx = [];
  const push = (x, y, z, nx, ny, nz, fx, fz, dep, fo, sh) => {
    pos.push(x, y, z);
    nrm.push(nx, ny, nz);
    clr.push(1, 1, 1);
    flow.push(fx, fz);
    depth.push(dep);
    foam.push(fo);
    sheet.push(sh);
  };
  const quad = (base) => {
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const levelAt = (wx, wz, lx, lz) => {
    if (lx >= 0 && lz >= 0 && lx < CHUNK_SIZE && lz < CHUNK_SIZE) return levels[lz * CHUNK_SIZE + lx];
    let y = Y_MAX - 1;
    while (y > Y_MIN && !isSolid(getVoxel(world, wx, y, wz)) && getVoxel(world, wx, y, wz) !== MAT.WATER) y--;
    return getVoxel(world, wx, y, wz) === MAT.WATER ? y + 1 : -9999;
  };
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const col = lz * CHUNK_SIZE + lx;
      const level = levels[col];
      if (level === -9999) continue;
      const x = ox + lx, z = oz + lz;
      const f = hydro.flowAt(x + 0.5, z + 0.5, level);
      const fx = f.dx * f.speed, fz = f.dz * f.speed;
      const dep = level - beds[col];
      let shore = 0;
      const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of sides) {
        const m = getVoxel(world, x + dx, level - 1, z + dz);
        if (isSolid(m)) shore = 1;
      }
      const y = level - 0.1;
      const base = pos.length / 3;
      const fo = Math.max(shore * 0.65, Math.min(1, f.speed / 3.5));
      push(x, y, z, 0, 1, 0, fx, fz, dep, fo, 0);
      push(x, y, z + 1, 0, 1, 0, fx, fz, dep, fo, 0);
      push(x + 1, y, z + 1, 0, 1, 0, fx, fz, dep, fo, 0);
      push(x + 1, y, z, 0, 1, 0, fx, fz, dep, fo, 0);
      quad(base);
      for (const [dx, dz] of sides) {
        const nLevel = levelAt(x + dx, z + dz, lx + dx, lz + dz);
        if (nLevel === -9999 || nLevel >= level) continue;
        if (isSolid(getVoxel(world, x + dx, level - 1, z + dz))) continue;
        const top = level - 0.1, bottom = nLevel - 0.1;
        const b = pos.length / 3;
        const ex = dx > 0 ? x + 1 : dx < 0 ? x : x, ez = dz > 0 ? z + 1 : dz < 0 ? z : z;
        if (dx !== 0) {
          push(ex, top, z, dx, 0, 0, 0, 0, 2, 1, 1);
          push(ex, top, z + 1, dx, 0, 0, 0, 0, 2, 1, 1);
          push(ex, bottom, z + 1, dx, 0, 0, 0, 0, 2, 1, 1);
          push(ex, bottom, z, dx, 0, 0, 0, 0, 2, 1, 1);
        } else {
          push(x, top, ez, 0, 0, dz, 0, 0, 2, 1, 1);
          push(x + 1, top, ez, 0, 0, dz, 0, 0, 2, 1, 1);
          push(x + 1, bottom, ez, 0, 0, dz, 0, 0, 2, 1, 1);
          push(x, bottom, ez, 0, 0, dz, 0, 0, 2, 1, 1);
        }
        quad(b);
      }
    }
  }
  if (idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(clr, 3));
  g.setAttribute("aFlow", new THREE.Float32BufferAttribute(flow, 2));
  g.setAttribute("aDepth", new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute("aFoam", new THREE.Float32BufferAttribute(foam, 1));
  g.setAttribute("aSheet", new THREE.Float32BufferAttribute(sheet, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, nearWaterMaterial);
  mesh.name = `water_chunk_${chunk.cx}_${chunk.cz}`;
  mesh.renderOrder = 2;
  mesh.userData.waterTriangles = idx.length / 3;
  return mesh;
}
function installFarWaterHole(material) {
  const hole = { value: new THREE.Vector4(0, 0, 0, 0) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHole = hole;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vFarXZ;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFarXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec4 uHole;\nvarying vec2 vFarXZ;").replace(
      "vec4 diffuseColor = vec4( diffuse, opacity );",
      "if (vFarXZ.x > uHole.x && vFarXZ.x < uHole.z && vFarXZ.y > uHole.y && vFarXZ.y < uHole.w) discard;\nvec4 diffuseColor = vec4( diffuse, opacity );"
    );
  };
  return hole;
}

// src/render/terrain.ts
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
var MAX_PERF_SAMPLES = 128;
function recordSample(samples, ms) {
  samples.push(ms);
  if (samples.length > MAX_PERF_SAMPLES) samples.shift();
}
function percentile(samples, p) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return Math.round(sorted[i] * 100) / 100;
}
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
var terrainMaterial = new THREE2.MeshLambertMaterial({
  vertexColors: true,
  side: THREE2.FrontSide
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
function posFrom(axis, slice, i, j) {
  if (axis === 0) return [slice, i, j];
  if (axis === 1) return [j, slice, i];
  return [i, j, slice];
}
function meshChunk(world, chunk) {
  const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
  const data = chunk.data;
  const sample = (x, y, z) => {
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < WORLD_HEIGHT) {
      return data[localIndex(x, y, z)];
    }
    return getVoxel(world, ox + x, Y_MIN + y, oz + z);
  };
  const positions = [];
  const normals = [];
  const colors = [];
  const mats = [];
  const indices = [];
  const dims = [CHUNK_SIZE, WORLD_HEIGHT, CHUNK_SIZE];
  const emitQuad = (axis, dir, slice, i0, j0, w, h, key) => {
    const plane = slice + 1;
    const u0 = i0, u1 = i0 + w, v0 = j0, v1 = j0 + h;
    let p;
    if (axis === 0) {
      const x = ox + plane, y0 = Y_MIN + u0, y1 = Y_MIN + u1, z0 = oz + v0, z1 = oz + v1;
      p = dir > 0 ? [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]] : [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]];
    } else if (axis === 1) {
      const y = Y_MIN + plane, z0 = oz + u0, z1 = oz + u1, x0 = ox + v0, x1 = ox + v1;
      p = dir > 0 ? [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]] : [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
    } else {
      const z = oz + plane, x0 = ox + u0, x1 = ox + u1, y0 = Y_MIN + v0, y1 = Y_MIN + v1;
      p = dir > 0 ? [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]] : [[x0, y0, z], [x0, y1, z], [x1, y1, z], [x1, y0, z]];
    }
    const color = colorForKey(key);
    const mat = key & 15;
    const nx = axis === 0 ? dir : 0;
    const ny = axis === 1 ? dir : 0;
    const nz = axis === 2 ? dir : 0;
    const base = positions.length / 3;
    for (const v of p) {
      positions.push(v[0], v[1], v[2]);
      normals.push(nx, ny, nz);
      colors.push(color.r, color.g, color.b);
      mats.push(mat);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const du = dims[u], dv = dims[v], dd = dims[axis];
    const mask = new Uint16Array(du * dv);
    for (let slice = -1; slice < dd; slice++) {
      mask.fill(0);
      let any = false;
      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du; i++) {
          const [ax, ay, az] = posFrom(axis, slice, i, j);
          const [bx, by, bz] = posFrom(axis, slice + 1, i, j);
          const a = sample(ax, ay, az);
          const b = sample(bx, by, bz);
          const ao = isOpaque(a), bo = isOpaque(b);
          if (ao === bo) continue;
          const aInside = slice >= 0 && slice < dd;
          const bInside = slice + 1 >= 0 && slice + 1 < dd;
          let x, y, z, mat, dir;
          if (ao && !bo && aInside) {
            x = ax;
            y = ay;
            z = az;
            mat = a;
            dir = 1;
          } else if (bo && !ao && bInside) {
            x = bx;
            y = by;
            z = bz;
            mat = b;
            dir = -1;
          } else continue;
          const wy = Y_MIN + y;
          const surfaceY = chunk.heights[z * CHUNK_SIZE + x] + Y_MIN;
          const depth = surfaceY - (wy + 1);
          let variant;
          if (axis === 1 && dir > 0) variant = heightBand(wy);
          else if (axis === 1 && dir < 0) variant = 15;
          else variant = Math.max(0, Math.min(7, depth)) & 7 | stoneTone(wy) << 3;
          const shade = shadeAt(ox + x, wy, oz + z, world.seed);
          mask[j * du + i] = keyFor(mat, variant, shade, axis, dir);
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
            for (let k = 0; k < w; k++) {
              if (mask[(j + h) * du + i + k] !== key) break outer;
            }
            h++;
          }
          for (let jj = 0; jj < h; jj++) {
            for (let ii = 0; ii < w; ii++) mask[(j + jj) * du + i + ii] = 0;
          }
          const dir = key >> 12 & 1 ? 1 : -1;
          emitQuad(axis, dir, slice, i, j, w, h, key);
          i += w;
        }
      }
    }
  }
  const geometry = new THREE2.BufferGeometry();
  geometry.setAttribute("position", new THREE2.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE2.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE2.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aMat", new THREE2.Float32BufferAttribute(mats, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return { geometry, triangles: indices.length / 3 };
}
function buildWaterSurface(world, size = 2e4, segments = 96) {
  const geo = new THREE2.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE2.Color();
  const smoothstep2 = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = baseHeightAt(world.seed, world.params.generatorVersion, Math.round(x), Math.round(z));
    const shore = smoothstep2(-0.9, -0.15, h) * (1 - smoothstep2(-0.15, 0.4, h));
    const n = hash2i(Math.floor(x / 45), Math.floor(z / 45), world.seed + 501);
    tmp.copy(COL.waterMid).lerp(COL.waterDeep, 0.35 + 0.35 * n);
    tmp.lerp(COL.waterRim, shore * 0.15);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE2.BufferAttribute(colors, 3));
  const mesh = new THREE2.Mesh(geo, new THREE2.MeshLambertMaterial({
    vertexColors: true
  }));
  mesh.position.y = -0.06;
  mesh.renderOrder = 1;
  mesh.name = "water_surface";
  mesh.receiveShadow = false;
  return mesh;
}
var macroSampleCache = /* @__PURE__ */ new WeakMap();
function syncMacroColumns(world, caches) {
  if (world.revision === caches.revision) return;
  caches.columns.clear();
  for (const [key, edits] of world.edits) {
    if (!edits.size || !world.chunks.has(key)) continue;
    const chunk = world.chunks.get(key);
    const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
    const columns = /* @__PURE__ */ new Map();
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const col = lz * CHUNK_SIZE + lx;
        columns.set((ox + lx + HALF) * WORLD_SIZE + oz + lz + HALF, {
          height: chunk.heights[col] + Y_MIN + 1,
          top: chunk.topMaterials[col]
        });
      }
    }
    caches.columns.set(key, columns);
  }
  caches.edited.clear();
  caches.revision = world.revision;
}
function macroColumn(world, caches, key, index) {
  let columns = caches.columns.get(key);
  if (columns) return columns.get(index);
  const [cx, cz] = key.split(",").map(Number);
  if (!ensureChunk(world, cx, cz)) return void 0;
  const chunk = world.chunks.get(key);
  columns = /* @__PURE__ */ new Map();
  const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const col = lz * CHUNK_SIZE + lx;
      columns.set((ox + lx + HALF) * WORLD_SIZE + oz + lz + HALF, {
        height: chunk.heights[col] + Y_MIN + 1,
        top: chunk.topMaterials[col]
      });
    }
  }
  caches.columns.set(key, columns);
  return columns.get(index);
}
var macroEditKeyMemo = /* @__PURE__ */ new WeakMap();
function macroEditKey(world) {
  const version = editVersion(world);
  const memo = macroEditKeyMemo.get(world);
  if (memo && memo.version === version) return memo.key;
  const key = computeMacroEditKey(world);
  macroEditKeyMemo.set(world, { version, key });
  return key;
}
function computeMacroEditKey(world) {
  return [...world.edits.entries()].filter(([, edits]) => edits.size > 0).map(([key, edits]) => {
    let sum = 0;
    let mixed = 0;
    for (const [index, material] of edits) {
      const value = Math.imul(index + 1, 31) + material;
      sum = sum + value | 0;
      mixed = mixed ^ Math.imul(value, 73244475) | 0;
    }
    return `${key}:${edits.size}:${sum}:${mixed}`;
  }).sort().join("|");
}
function editedMacroSamples(world, step, cache) {
  const caches = macroSampleCache.get(world);
  const key = `${step}:${macroEditKey(world)}`;
  const cached = caches.edited.get(key);
  if (cached) return cached;
  for (const [chunk, edits] of world.edits) {
    if (edits.size && !caches.columns.has(chunk)) macroColumn(world, caches, chunk, 0);
  }
  const t0 = performance.now();
  const { N, heights, tops, underwater } = cache;
  const sample = {
    N,
    heights: new Int16Array(heights),
    tops: new Uint8Array(tops),
    underwater: new Uint8Array(underwater),
    sampleMs: cache.sampleMs
  };
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = Math.round(-HALF + (i + 0.5) * step);
      const z = Math.round(-HALF + (j + 0.5) * step);
      const chunk = chunkKey(worldToChunkX(x), worldToChunkZ(z));
      if (!world.edits.get(chunk)?.size) continue;
      const idx = j * N + i;
      const edited = macroColumn(world, caches, chunk, (x + HALF) * WORLD_SIZE + z + HALF);
      if (!edited) continue;
      sample.heights[idx] = edited.height;
      sample.tops[idx] = edited.top;
      sample.underwater[idx] = sample.heights[idx] < SEA_LEVEL ? 1 : 0;
    }
  }
  sample.sampleMs = performance.now() - t0;
  caches.edited.set(key, sample);
  return sample;
}
function macroSamples(world, step) {
  let caches = macroSampleCache.get(world);
  if (!caches) {
    caches = { base: /* @__PURE__ */ new Map(), edited: /* @__PURE__ */ new Map(), columns: /* @__PURE__ */ new Map(), revision: -1 };
    macroSampleCache.set(world, caches);
  }
  syncMacroColumns(world, caches);
  const cached = caches.base.get(step);
  if (cached) return editedMacroSamples(world, step, cached);
  const t0 = performance.now();
  const N = Math.ceil(WORLD_SIZE / step);
  const heights = new Int16Array(N * N);
  const tops = new Uint8Array(N * N);
  const underwater = new Uint8Array(N * N);
  const cellX = (i) => -HALF + (i + 0.5) * step;
  const cellZ = (j) => -HALF + (j + 0.5) * step;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cellX(i), z = cellZ(j);
      const h = baseHeightAt(world.seed, world.params.generatorVersion, Math.round(x), Math.round(z));
      const idx = j * N + i;
      heights[idx] = h;
      if (h < SEA_LEVEL) underwater[idx] = 1;
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      if (underwater[idx]) continue;
      const h = heights[idx];
      const x = cellX(i), z = cellZ(j);
      let slope = 0;
      let nearWater = false;
      const ns = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dz] of ns) {
        const nx = Math.max(0, Math.min(N - 1, i + dx));
        const nz = Math.max(0, Math.min(N - 1, j + dz));
        const nh = heights[nz * N + nx];
        slope = Math.max(slope, Math.abs(h - nh));
        if (nh < SEA_LEVEL + 1) nearWater = true;
      }
      tops[idx] = baseTopMaterialFor(
        world.seed,
        world.params.generatorVersion,
        Math.round(x),
        Math.round(z),
        h,
        slope,
        nearWater
      );
    }
  }
  const cache = {
    N,
    heights,
    tops,
    underwater,
    sampleMs: performance.now() - t0
  };
  caches.base.set(step, cache);
  return editedMacroSamples(world, step, cache);
}
function buildMacroMesh(world, opts) {
  const totalT0 = performance.now();
  const { step, hole } = opts;
  const cacheKey = `${step}:${macroEditKey(world)}`;
  const sampleCached = macroSampleCache.get(world)?.edited.has(cacheKey) ?? false;
  const cache = macroSamples(world, step);
  const { N, heights, tops, underwater } = cache;
  const holeCell = new Uint8Array(N * N);
  const cellX = (i) => -HALF + (i + 0.5) * step;
  const cellZ = (j) => -HALF + (j + 0.5) * step;
  if (hole) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = cellX(i), z = cellZ(j);
        if (x > hole.minX && x < hole.maxX && z > hole.minZ && z < hole.maxZ) {
          holeCell[j * N + i] = 1;
        }
      }
    }
  }
  const sampleMs = sampleCached ? 0 : cache.sampleMs;
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const pushQuad = (p, n, color) => {
    const base = positions.length / 3;
    for (const v of p) {
      positions.push(v[0], v[1], v[2]);
      normals.push(n[0], n[1], n[2]);
      colors.push(color.r, color.g, color.b);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const cellShade = (i, j) => 0.94 + 0.12 * hash2i(i, j, world.seed + 401);
  const topColor = (top, h, i, j) => {
    const shade = cellShade(i, j);
    const moist = fbm2(cellX(i) / 130, cellZ(j) / 130, world.seed + 601, 3);
    if (top === MAT.SAND) return COL.sand.clone().multiplyScalar(shade * 0.9);
    if (top === MAT.GRAVEL) return COL.gravel.clone().multiplyScalar(shade);
    if (top === MAT.STONE) {
      return COL.stoneShade.clone().lerp(COL.stoneB, 0.35 + 0.25 * shade).multiplyScalar(
        (0.82 + 0.14 * Math.min(1, Math.max(0, (h + 8) / 70))) * (0.92 + 0.08 * shade)
      );
    }
    if (top === MAT.ORE) return COL.ore.clone().multiplyScalar(shade);
    if (top === MAT.SNOW) return COL.snow.clone().multiplyScalar(0.94 + 0.08 * shade);
    return COL.grassTop[heightBand(h)].clone().lerp(COL.grassCap, 0.12 + 0.34 * moist).multiplyScalar(shade);
  };
  const sideColor = (top, h, nh, i, j) => {
    const drop = h - nh;
    const shade = 0.9 + 0.1 * hash2i(i, j, world.seed + 402);
    if (top === MAT.SAND) return COL.sand.clone().lerp(COL.stoneB, drop > 5 ? 0.55 : 0.2).multiplyScalar(shade * 0.92);
    if (top === MAT.STONE) {
      return COL.stoneShade.clone().multiplyScalar(
        (0.8 + 0.16 * Math.min(1, Math.max(0, (h + 8) / 70))) * shade
      );
    }
    if (drop > 4) return COL.grassCap.clone().lerp(COL.ochre, 0.55).multiplyScalar(shade);
    return COL.grassCap.clone().lerp(COL.stoneB, 0.22).multiplyScalar(shade);
  };
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      if (holeCell[idx] || underwater[idx]) continue;
      const h = heights[idx];
      const top = tops[idx];
      const x0 = -HALF + i * step, x1 = x0 + step;
      const z0 = -HALF + j * step, z1 = z0 + step;
      pushQuad(
        [[x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0]],
        [0, 1, 0],
        topColor(top, h, i, j)
      );
      const check = (di, dj) => {
        const ni = i + di, nj = j + dj;
        let nh;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) {
          return;
        } else {
          const nidx = nj * N + ni;
          if (holeCell[nidx]) return;
          nh = underwater[nidx] ? Math.max(SEA_LEVEL - 0.5, heights[nidx]) : heights[nidx];
        }
        if (h <= nh) return;
        const col = sideColor(top, h, nh, i, j);
        if (di === 1) {
          pushQuad([[x1, nh, z0], [x1, h, z0], [x1, h, z1], [x1, nh, z1]], [1, 0, 0], col);
        } else if (di === -1) {
          pushQuad([[x0, nh, z0], [x0, nh, z1], [x0, h, z1], [x0, h, z0]], [-1, 0, 0], col);
        } else if (dj === 1) {
          pushQuad([[x0, nh, z1], [x1, nh, z1], [x1, h, z1], [x0, h, z1]], [0, 0, 1], col);
        } else if (dj === -1) {
          pushQuad([[x0, nh, z0], [x0, h, z0], [x1, h, z0], [x1, nh, z0]], [0, 0, -1], col);
        }
      };
      check(1, 0);
      check(-1, 0);
      check(0, 1);
      check(0, -1);
    }
  }
  const geometry = new THREE2.BufferGeometry();
  geometry.setAttribute("position", new THREE2.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE2.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE2.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new THREE2.Mesh(geometry, new THREE2.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true
  }));
  mesh.name = "macro_lod";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return {
    mesh,
    triangles: indices.length / 3,
    sampleMs,
    totalMs: performance.now() - totalT0,
    sampleCached
  };
}
var VoxelTerrainView = class {
  group = new THREE2.Group();
  nearGroup = new THREE2.Group();
  macroGroup = new THREE2.Group();
  water;
  world;
  nearRadius;
  worldMacroStep;
  mapMacroStep;
  chunks = /* @__PURE__ */ new Map();
  loaded = /* @__PURE__ */ new Set();
  mode = "world";
  macro = null;
  macroTriangles = 0;
  macroFocus = new THREE2.Vector3(1e9, 0, 1e9);
  macroMode = null;
  chunkGenSamples = [];
  chunkMeshSamples = [];
  macroSamples = [];
  macroSampleSamples = [];
  macroCacheHits = 0;
  macroEditKey = null;
  /** Main-thread milliseconds per frame for streaming and dirty re-meshing. */
  frameBudgetMs = 6;
  pendingChunks = 0;
  sweepCounter = 0;
  sweptChunks = 0;
  pinned = /* @__PURE__ */ new Set();
  waterGroup = new THREE2.Group();
  farWaterHole;
  onChunksChanged = null;
  constructor(world, scene, opts = {}) {
    this.world = world;
    this.nearRadius = Math.max(1, opts.nearRadius ?? 3);
    this.worldMacroStep = Math.max(4, opts.worldMacroStep ?? 8);
    this.mapMacroStep = Math.max(4, opts.mapMacroStep ?? 8);
    this.group.name = "voxel_world";
    this.nearGroup.name = "voxel_chunks";
    this.macroGroup.name = "macro_lod";
    this.group.add(this.nearGroup, this.macroGroup);
    this.water = buildWaterSurface(world);
    this.farWaterHole = installFarWaterHole(this.water.material);
    this.group.add(this.water);
    this.waterGroup.name = "near_water";
    this.group.add(this.waterGroup);
    scene.add(this.group);
  }
  preload(focus) {
    this.mode = "world";
    this.ensureChunks(focus, true);
    this.rebuildMacro(focus, "world", true);
  }
  /** Advance presentation-only water animation (seconds). */
  setWaterTime(seconds) {
    waterTime.value = seconds;
  }
  update(focus, mode = "world") {
    if (mode !== this.mode) {
      this.mode = mode;
      this.nearGroup.visible = mode !== "map";
      this.waterGroup.visible = mode !== "map";
      if (mode === "map") this.farWaterHole.value.set(0, 0, 0, 0);
      this.rebuildMacro(focus, mode, true);
    }
    if (mode === "map") {
      if (macroEditKey(this.world) !== this.macroEditKey) this.rebuildMacro(focus, mode, true);
      return;
    }
    const frameStart = performance.now();
    this.ensureChunks(focus, false, frameStart);
    this.rebuildDirty(focus, frameStart);
    if (++this.sweepCounter % 30 === 0) this.sweepResident(focus);
    const moved = Math.hypot(focus.x - this.macroFocus.x, focus.z - this.macroFocus.z);
    if (this.macroMode !== mode || moved > 48 || macroEditKey(this.world) !== this.macroEditKey) {
      this.rebuildMacro(focus, mode, false);
    }
  }
  /**
   * Stream the near ring nearest-first within a per-frame time budget. At least
   * one chunk is built per frame so streaming always makes progress.
   */
  ensureChunks(focus, immediate, frameStart = performance.now()) {
    const ccx = worldToChunkX(Math.round(focus.x));
    const ccz = worldToChunkZ(Math.round(focus.z));
    let changed = false;
    const missing = [];
    for (let dz = -this.nearRadius; dz <= this.nearRadius; dz++) {
      for (let dx = -this.nearRadius; dx <= this.nearRadius; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) continue;
        if (this.loaded.has(chunkKey(cx, cz))) continue;
        missing.push({ cx, cz, d: dx * dx + dz * dz });
      }
    }
    missing.sort((a, b) => a.d - b.d);
    let built = 0;
    for (const m of missing) {
      if (!immediate && built > 0 && performance.now() - frameStart >= this.frameBudgetMs) break;
      this.buildChunk(m.cx, m.cz);
      built++;
      changed = true;
    }
    this.pendingChunks = missing.length - built;
    const margin = this.nearRadius + 1;
    for (const key of [...this.loaded]) {
      const [cx, cz] = key.split(",").map(Number);
      if (Math.abs(cx - ccx) > margin || Math.abs(cz - ccz) > margin) {
        this.disposeChunk(key);
        changed = true;
      }
    }
    if (changed) this.onChunksChanged?.();
  }
  buildChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    const genBefore = this.world.stats.generationMs;
    const chunksBefore = this.world.stats.chunksGenerated;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) ensureChunk(this.world, cx + dx, cz + dz);
    }
    const chunk = ensureChunk(this.world, cx, cz);
    if (!chunk) return;
    const generated = this.world.stats.chunksGenerated - chunksBefore;
    if (generated > 0) {
      recordSample(this.chunkGenSamples, (this.world.stats.generationMs - genBefore) / generated);
    }
    const existing = this.chunks.get(key);
    if (existing) {
      this.nearGroup.remove(existing.mesh);
      existing.mesh.geometry.dispose();
      if (existing.water) {
        this.waterGroup.remove(existing.water);
        existing.water.geometry.dispose();
      }
    }
    const meshT0 = performance.now();
    const { geometry, triangles } = meshChunk(this.world, chunk);
    recordSample(this.chunkMeshSamples, performance.now() - meshT0);
    const mesh = new THREE2.Mesh(geometry, terrainMaterial);
    mesh.name = `voxel_chunk_${cx}_${cz}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.nearGroup.add(mesh);
    const water = meshChunkWater(this.world, chunk);
    if (water) this.waterGroup.add(water);
    this.chunks.set(key, { mesh, water, triangles: triangles + (water?.userData.waterTriangles ?? 0) });
    this.loaded.add(key);
    this.world.dirty.delete(key);
  }
  disposeChunk(key) {
    const view = this.chunks.get(key);
    if (view) {
      this.nearGroup.remove(view.mesh);
      view.mesh.geometry.dispose();
      if (view.water) {
        this.waterGroup.remove(view.water);
        view.water.geometry.dispose();
      }
      this.chunks.delete(key);
    }
    this.loaded.delete(key);
    if (this.pinned.has(key)) return;
    this.world.dirty.delete(key);
    evictChunk(this.world, key);
  }
  rebuildChunk(key) {
    const [cx, cz] = key.split(",").map(Number);
    this.buildChunk(cx, cz);
  }
  /** Re-mesh dirty loaded chunks nearest-first, sharing the frame budget. */
  rebuildDirty(focus, frameStart) {
    const ccx = worldToChunkX(Math.round(focus.x));
    const ccz = worldToChunkZ(Math.round(focus.z));
    const dirty = [];
    for (const key of this.loaded) {
      if (!this.world.dirty.has(key)) continue;
      const [cx, cz] = key.split(",").map(Number);
      dirty.push({ key, d: (cx - ccx) ** 2 + (cz - ccz) ** 2 });
    }
    if (dirty.length === 0) return;
    dirty.sort((a, b) => a.d - b.d);
    let rebuilt = 0;
    for (const { key } of dirty) {
      if (rebuilt > 0 && performance.now() - frameStart >= this.frameBudgetMs) break;
      this.rebuildChunk(key);
      rebuilt++;
    }
    if (rebuilt > 0) this.onChunksChanged?.();
  }
  /**
   * Chunk lifetime policy. Meshing generates a ring of neighbour chunks, and
   * simulation queries can generate more; none of those were ever released.
   * Resident chunk bytes are derived (regenerated from seed + durable edits),
   * so anything outside the keep radius that is not loaded or pinned is freed.
   */
  sweepResident(focus) {
    const ccx = worldToChunkX(Math.round(focus.x));
    const ccz = worldToChunkZ(Math.round(focus.z));
    const keep = this.nearRadius + 2;
    for (const key of [...this.world.chunks.keys()]) {
      if (this.loaded.has(key) || this.pinned.has(key)) continue;
      const [cx, cz] = key.split(",").map(Number);
      if (Math.abs(cx - ccx) <= keep && Math.abs(cz - ccz) <= keep) continue;
      evictChunk(this.world, key);
      this.world.dirty.delete(key);
      this.sweptChunks++;
    }
  }
  /**
   * Keep the chunks under a world-space rectangle resident (for example the
   * settlement envelope that construction previews query several times a second).
   */
  pinRect(minX, minZ, maxX, maxZ) {
    for (let cz = worldToChunkZ(minZ) - 1; cz <= worldToChunkZ(maxZ) + 1; cz++) {
      for (let cx = worldToChunkX(minX) - 1; cx <= worldToChunkX(maxX) + 1; cx++) {
        if (cx >= 0 && cz >= 0 && cx < CHUNKS_PER_SIDE && cz < CHUNKS_PER_SIDE) this.pinned.add(chunkKey(cx, cz));
      }
    }
  }
  get residentChunks() {
    return this.world.chunks.size;
  }
  get pendingChunkBuilds() {
    return this.pendingChunks;
  }
  get evictedBySweep() {
    return this.sweptChunks;
  }
  rebuildAround(x, z) {
    const cx = worldToChunkX(x), cz = worldToChunkZ(z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = chunkKey(cx + dx, cz + dz);
        if (this.loaded.has(key)) this.rebuildChunk(key);
      }
    }
    this.onChunksChanged?.();
    if (this.macro) this.rebuildMacro(this.macroFocus, this.mode, true);
  }
  rebuildMacro(focus, mode, force) {
    if (!force && this.macroMode === mode) {
      const moved = Math.hypot(focus.x - this.macroFocus.x, focus.z - this.macroFocus.z);
      if (mode === "map" || moved <= 48) return;
    }
    const macroT0 = performance.now();
    if (this.macro) {
      this.macroGroup.remove(this.macro);
      this.macro.geometry.dispose();
      this.macro = null;
    }
    const step = mode === "map" ? this.mapMacroStep : this.worldMacroStep;
    let hole;
    if (mode !== "map") {
      const ccx = worldToChunkX(Math.round(focus.x));
      const ccz = worldToChunkZ(Math.round(focus.z));
      hole = {
        minX: chunkOriginX(ccx - this.nearRadius),
        maxX: chunkOriginX(ccx + this.nearRadius) + CHUNK_SIZE,
        minZ: chunkOriginZ(ccz - this.nearRadius),
        maxZ: chunkOriginZ(ccz + this.nearRadius) + CHUNK_SIZE
      };
      this.farWaterHole.value.set(hole.minX, hole.minZ, hole.maxX, hole.maxZ);
    }
    const result = buildMacroMesh(this.world, { step, hole });
    this.macro = result.mesh;
    this.macroTriangles = result.triangles;
    this.macroGroup.add(result.mesh);
    this.macroFocus.copy(focus);
    this.macroMode = mode;
    this.macroEditKey = macroEditKey(this.world);
    recordSample(this.macroSamples, performance.now() - macroT0);
    if (result.sampleCached) this.macroCacheHits++;
    else recordSample(this.macroSampleSamples, result.sampleMs);
  }
  get loadedChunks() {
    return this.loaded.size;
  }
  get loadedChunkKeys() {
    return this.loaded;
  }
  get nearTriangles() {
    let t = 0;
    for (const v of this.chunks.values()) t += v.triangles;
    return t;
  }
  get macroTriangleCount() {
    return this.macroTriangles;
  }
  get drawCalls() {
    let water = 0;
    for (const v of this.chunks.values()) if (v.water) water++;
    return this.loaded.size + water + (this.macro ? 1 : 0) + 1;
  }
  get nearRadiusChunks() {
    return this.nearRadius;
  }
  /** Clear the rolling timing window before a measurement run. */
  resetPerf() {
    this.chunkGenSamples.length = 0;
    this.chunkMeshSamples.length = 0;
    this.macroSamples.length = 0;
    this.macroSampleSamples.length = 0;
    this.macroCacheHits = 0;
  }
  /** Rolling build timings in milliseconds, for the performance evidence. */
  get streamPerf() {
    return {
      chunkGenP50: percentile(this.chunkGenSamples, 0.5),
      chunkGenP95: percentile(this.chunkGenSamples, 0.95),
      chunkGenMax: percentile(this.chunkGenSamples, 1),
      chunkMeshP50: percentile(this.chunkMeshSamples, 0.5),
      chunkMeshP95: percentile(this.chunkMeshSamples, 0.95),
      chunkMeshMax: percentile(this.chunkMeshSamples, 1),
      macroP50: percentile(this.macroSamples, 0.5),
      macroMax: percentile(this.macroSamples, 1),
      macroSampleP50: percentile(this.macroSampleSamples, 0.5),
      macroSampleMax: percentile(this.macroSampleSamples, 1),
      macroCacheHits: this.macroCacheHits,
      chunkSamples: this.chunkGenSamples.length,
      macroSamples: this.macroSamples.length
    };
  }
};

// src/render/nature.ts
import * as THREE3 from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
var M3 = palette_default.materials;
var H3 = (k) => M3[k].hex;
var GREEN = [H3("canopy_green_a"), H3("canopy_green_b"), H3("canopy_green_c")];
var PINK = [H3("canopy_pink_b"), H3("canopy_pink")];
var TRUNK = H3("trunk");
var BARK = H3("bark_dark");
var STONE = H3("stone_top");
var STONE_B = H3("stone_body_b");
var STONE_SHADE = H3("stone_shade");
var ORE = H3("ore_crystal");
var ORE_B = H3("ore_crystal_b");
var OCHRE = H3("strata_ochre");
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const color = new THREE3.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new THREE3.BufferAttribute(arr, 3));
  return g;
}
function box(cx, cy, cz, sx, sy, sz, hex) {
  const g = new THREE3.BoxGeometry(sx, sy, sz);
  g.translate(cx, cy, cz);
  const out = paint(g, hex);
  out.computeVertexNormals();
  return out;
}
function column(cx, cz, y0, h, r, sides, yawDeg, hex) {
  const g = new THREE3.CylinderGeometry(r, r, h, sides, 1, false);
  g.translate(cx, y0 + h / 2, cz);
  g.rotateY(yawDeg * Math.PI / 180);
  const out = paint(g, hex);
  out.computeVertexNormals();
  return out;
}
function massGeometry(m) {
  const pos = [];
  const nrm = [];
  const D = Math.PI / 180;
  const lon = (k) => m.yawDeg * D + k * 2 * Math.PI / m.sides;
  const row = (phiDeg) => {
    const phi = phiDeg * D, c2 = Math.cos(phi), s = Math.sin(phi);
    const out = [];
    for (let k = 0; k < m.sides; k++) {
      const t = lon(k);
      out.push([
        m.cx + m.rx * c2 * Math.cos(t),
        m.cy + m.ry * s,
        m.cz + m.rz * c2 * Math.sin(t)
      ]);
    }
    return out;
  };
  const pole = (sign) => [m.cx, m.cy + sign * m.ry, m.cz];
  const capCentre = (phiDeg) => [m.cx, m.cy + m.ry * Math.sin(phiDeg * D), m.cz];
  const tri = (a, b, c2) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c2[0] - a[0], vy = c2[1] - a[1], vz = c2[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L;
    ny /= L;
    nz /= L;
    const fx = (a[0] + b[0] + c2[0]) / 3 - m.cx;
    const fy = (a[1] + b[1] + c2[1]) / 3 - m.cy;
    const fz = (a[2] + b[2] + c2[2]) / 3 - m.cz;
    if (nx * fx + ny * fy + nz * fz < 0) {
      const t = b;
      b = c2;
      c2 = t;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (const p of [a, b, c2]) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(nx, ny, nz);
    }
  };
  const band = (r0, r1) => {
    for (let k = 0; k < m.sides; k++) {
      const j = (k + 1) % m.sides;
      tri(r0[k], r0[j], r1[k]);
      tri(r0[j], r1[j], r1[k]);
    }
  };
  const fan = (ring, apex) => {
    for (let k = 0; k < m.sides; k++) tri(ring[k], ring[(k + 1) % m.sides], apex);
  };
  const cap = (ring, centre) => {
    for (let k = 0; k < m.sides; k++) tri(ring[(k + 1) % m.sides], ring[k], centre);
  };
  if (m.shape === "orb") {
    const r = [row(-45), row(0), row(45)];
    band(r[0], r[1]);
    band(r[1], r[2]);
    fan(r[0], pole(-1));
    fan(r[2], pole(1));
  } else if (m.shape === "dome") {
    const r = [row(0), row(45)];
    band(r[0], r[1]);
    fan(r[1], pole(1));
    cap(r[0], capCentre(0));
  } else {
    const r = [row(-45), row(0), row(45)];
    band(r[0], r[1]);
    band(r[1], r[2]);
    cap(r[0], capCentre(-45));
    cap(r[2], capCentre(45));
  }
  const geo = new THREE3.BufferGeometry();
  geo.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE3.Float32BufferAttribute(nrm, 3));
  return paint(geo, m.hex);
}
function assembly(parts) {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error("Styl geometry merge failed");
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
var T1 = {
  trunkR: 0.28,
  trunkH: 4.9,
  flareR: 0.38,
  flareH: 0.3,
  masses: [
    { cx: 0, cy: 5.45, cz: 0, rx: 2.1, ry: 1, rz: 2.05, sides: 9, shape: "orb", yawDeg: 0, hex: GREEN[0] },
    { cx: 0.2, cy: 6.85, cz: -0.2, rx: 1.45, ry: 0.95, rz: 1.35, sides: 7, shape: "orb", yawDeg: 15, hex: GREEN[1] },
    { cx: -0.15, cy: 7.85, cz: 0.15, rx: 0.95, ry: 0.65, rz: 0.9, sides: 7, shape: "orb", yawDeg: 30, hex: GREEN[2] }
  ],
  satellite: { cx: 2.4, cy: 5.55, cz: 0.75, sx: 0.8, sy: 0.5, sz: 0.8, hex: GREEN[2] }
};
var T2 = {
  trunkR: 0.34,
  trunkH: 3.85,
  flareR: 0.46,
  flareH: 0.28,
  masses: [
    { cx: 0, cy: 3.5, cz: 0, rx: 2.95, ry: 1.3, rz: 2.3, sides: 11, shape: "dome", yawDeg: 0, hex: GREEN[0] },
    { cx: 1.35, cy: 4, cz: -0.6, rx: 1.45, ry: 0.95, rz: 1.25, sides: 9, shape: "dome", yawDeg: 15, hex: GREEN[1] },
    { cx: -0.35, cy: 5.2, cz: 0.25, rx: 1.35, ry: 0.95, rz: 1.25, sides: 9, shape: "orb", yawDeg: 30, hex: GREEN[2] },
    { cx: -1.45, cy: 4.05, cz: 0.95, rx: 1.1, ry: 0.75, rz: 1, sides: 7, shape: "dome", yawDeg: 45, hex: GREEN[1] }
  ]
};
var T3 = {
  trunkR: 0.26,
  trunkH: 3.6,
  flareR: 0.36,
  flareH: 0.26,
  masses: [
    { cx: 0, cy: 4.55, cz: 0, rx: 1.45, ry: 1.3, rz: 1.4, sides: 9, shape: "orb", yawDeg: 0, hex: GREEN[0] },
    { cx: 1.25, cy: 4.05, cz: 0.3, rx: 0.95, ry: 0.8, rz: 0.9, sides: 7, shape: "orb", yawDeg: 15, hex: GREEN[1] },
    { cx: -1.3, cy: 4.45, cz: -0.45, rx: 0.85, ry: 0.75, rz: 0.85, sides: 7, shape: "orb", yawDeg: 30, hex: GREEN[1] },
    { cx: 0.1, cy: 5.7, cz: -0.1, rx: 1, ry: 0.9, rz: 0.95, sides: 7, shape: "orb", yawDeg: 45, hex: GREEN[2] }
  ],
  satellite: { cx: 2.35, cy: 3.9, cz: -0.25, sx: 0.7, sy: 0.45, sz: 0.7, hex: GREEN[2] }
};
var T4 = {
  trunkR: 0.3,
  trunkH: 4.45,
  flareR: 0.42,
  flareH: 0.28,
  masses: [
    { cx: 0, cy: 5, cz: 0, rx: 2.35, ry: 1.15, rz: 2.2, sides: 9, shape: "drum", yawDeg: 0, hex: PINK[0] },
    { cx: 0.3, cy: 5.9, cz: -0.25, rx: 1.55, ry: 1, rz: 1.45, sides: 9, shape: "drum", yawDeg: 15, hex: PINK[1] },
    { cx: -1.4, cy: 4.95, cz: 0.75, rx: 1.05, ry: 0.8, rz: 1, sides: 7, shape: "drum", yawDeg: 30, hex: PINK[0] },
    { cx: 0.15, cy: 6.45, cz: 0.1, rx: 0.95, ry: 0.65, rz: 0.9, sides: 7, shape: "orb", yawDeg: 45, hex: PINK[1] }
  ],
  satellite: { cx: 2.55, cy: 5.35, cz: 0.85, sx: 0.85, sy: 0.55, sz: 0.85, hex: PINK[1] }
};
var SHRUB = [
  { cx: 0, cy: 0.55, cz: 0, rx: 0.7, ry: 0.55, rz: 0.65, sides: 9, shape: "orb", yawDeg: 0, hex: GREEN[0] },
  { cx: 0.25, cy: 0.95, cz: -0.15, rx: 0.45, ry: 0.42, rz: 0.42, sides: 7, shape: "orb", yawDeg: 15, hex: GREEN[1] },
  { cx: -0.2, cy: 1.05, cz: 0.2, rx: 0.34, ry: 0.45, rz: 0.32, sides: 7, shape: "orb", yawDeg: 30, hex: GREEN[2] }
];
var quant = (v) => Math.round(v / 0.05) * 0.05;
var clamp2 = (v, a, b) => v < a ? a : v > b ? b : v;
function jitterMass(m, rnd, groupX, groupZ) {
  const rjit = (v) => quant(clamp2(v * (1 + (rnd() * 0.16 - 0.08)), 0.25, 4));
  return {
    ...m,
    cx: quant(m.cx + groupX + (rnd() * 0.6 - 0.3)),
    cy: quant(m.cy + (rnd() * 0.4 - 0.2)),
    cz: quant(m.cz + groupZ + (rnd() * 0.6 - 0.3)),
    rx: rjit(m.rx),
    ry: rjit(m.ry),
    rz: rjit(m.rz),
    yawDeg: m.yawDeg + (Math.floor(rnd() * 3) - 1) * 15
  };
}
function treeGeometry(species, variant) {
  const rnd = mulberry32((species === T1 ? 11 : species === T2 ? 23 : species === T3 ? 37 : 53) * 7919 + variant * 104729);
  const jittered = variant > 0;
  const groupX = jittered ? rnd() * 0.7 - 0.35 : 0;
  const groupZ = jittered ? rnd() * 0.7 - 0.35 : 0;
  const trunkR = jittered ? quant(clamp2(species.trunkR + (rnd() * 0.1 - 0.05), 0.2, 0.4)) : species.trunkR;
  const trunkH = jittered ? quant(clamp2(species.trunkH + (rnd() * 0.6 - 0.3), 3, 5.4)) : species.trunkH;
  const flareR = trunkR + 0.1;
  const parts = [
    column(0, 0, 0, trunkH, trunkR, 6, 0, TRUNK),
    column(0, 0, 0, species.flareH, flareR, 6, 0, BARK)
  ];
  for (const m of species.masses) {
    parts.push(massGeometry(jittered ? jitterMass(m, rnd, groupX, groupZ) : m));
  }
  if (species.satellite && variant % 3 === 0) {
    const s = species.satellite;
    parts.push(box(s.cx + groupX, s.cy, s.cz + groupZ, s.sx, s.sy, s.sz, s.hex));
  }
  return assembly(parts);
}
function shrubGeometry(variant) {
  const rnd = mulberry32(97 * 7919 + variant * 104729);
  const parts = SHRUB.map((m, i) => {
    if (variant === 0 && i === 0) return massGeometry(m);
    return massGeometry(jitterMass(m, rnd, 0, 0));
  });
  return assembly(parts);
}
function oreGeometry(variant) {
  const flip = variant === 1 ? -1 : 1;
  const parts = [
    box(0, 0.45, 0, 1.8, 0.9, 1.5, STONE),
    box(0.15, 1.1, -0.1, 1.2, 0.7, 1, STONE),
    box(-0.4, 1.4, 0.25, 0.7, 0.5, 0.6, STONE_B),
    box(0.1, 0.45, 0.75 * flip, 0.9, 0.35, 0.2, ORE),
    box(0.1, 0.45, 0.865 * flip, 0.5, 0.14, 0.07, ORE_B)
  ];
  return assembly(parts);
}
function cairnGeometry() {
  return assembly([
    box(0, 0.25, 0, 1.5, 0.5, 1.3, STONE),
    box(0.1, 0.725, 0, 1.15, 0.45, 1, STONE_B),
    box(-0.1, 1.15, 0.05, 0.85, 0.4, 0.75, STONE),
    box(0.1, 1.525, 0.05, 0.5, 0.35, 0.5, STONE_B),
    box(0.1, 1.85, 0.05, 0.3, 0.3, 0.3, STONE_SHADE)
  ]);
}
var geometryCache = /* @__PURE__ */ new Map();
function geometryFor(kind, variant) {
  const key = `${kind}:${variant}`;
  if (geometryCache.has(key)) return geometryCache.get(key);
  const built = buildGeometryFor(kind, variant);
  const flat = built && built.index ? built.toNonIndexed() : built;
  if (flat && flat !== built) built?.dispose();
  geometryCache.set(key, flat);
  return flat;
}
function buildGeometryFor(kind, variant) {
  if (kind === "styl_tree_spire") return treeGeometry(T1, Math.abs(variant) % 4);
  if (kind === "styl_tree_table") return treeGeometry(T2, Math.abs(variant) % 4);
  if (kind === "styl_tree_cluster") return treeGeometry(T3, Math.abs(variant) % 3);
  if (kind === "styl_tree_blossom") return treeGeometry(T4, Math.abs(variant) % 2);
  if (kind === "styl_shrub") return shrubGeometry(Math.abs(variant) % 3);
  if (kind === "styl_ore") return oreGeometry(Math.abs(variant) % 2);
  if (kind === "styl_cairn") return cairnGeometry();
  return null;
}
var natureMaterial = new THREE3.MeshLambertMaterial({ vertexColors: true, flatShading: true });
function buildNoxelNature(world, loadedChunks = null) {
  const group = new THREE3.Group();
  group.name = "styl_nature";
  const buckets = /* @__PURE__ */ new Map();
  for (const e of world.entities.values()) {
    if (e.harvested) continue;
    if (loadedChunks && !loadedChunks.has(e.chunk)) continue;
    if (!geometryFor(e.kind, e.variant)) continue;
    const key = `${e.kind}:${e.variant}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(e);
  }
  let triangles = 0;
  let instanceCount = 0;
  const geometries = /* @__PURE__ */ new Map();
  for (const [key, list] of buckets) {
    const [kind, variantStr] = key.split(":");
    const geo = geometryFor(kind, Number(variantStr));
    if (!geo) continue;
    geometries.set(key, geo);
    triangles += geo.attributes.position.count / 3 * list.length;
    instanceCount += list.length;
  }
  if (instanceCount === 0) return { group, triangles: 0, instances: 0 };
  let vertexCount = 0;
  for (const geo of geometries.values()) vertexCount += geo.attributes.position.count;
  const batched = new THREE3.BatchedMesh(
    instanceCount,
    Math.ceil(vertexCount * 1.08) + 16,
    0,
    natureMaterial
  );
  batched.name = "styl_nature_batch";
  batched.castShadow = true;
  batched.receiveShadow = true;
  batched.perObjectFrustumCulled = true;
  batched.userData.inspectableBatchIds = [];
  batched.userData.inspectableTargets = [];
  const geometryIds = /* @__PURE__ */ new Map();
  for (const [key, geo] of geometries) {
    geometryIds.set(key, batched.addGeometry(geo));
  }
  const m = new THREE3.Matrix4();
  const q = new THREE3.Quaternion();
  const v = new THREE3.Vector3();
  const s = new THREE3.Vector3();
  const up = new THREE3.Vector3(0, 1, 0);
  let instances = 0;
  for (const [key, list] of buckets) {
    const geometryId = geometryIds.get(key);
    if (geometryId === void 0) continue;
    for (const e of list) {
      const id2 = batched.addInstance(geometryId);
      q.setFromAxisAngle(up, e.rot);
      v.set(e.x, e.y - 0.15, e.z);
      s.setScalar(e.scale);
      batched.setMatrixAt(id2, m.compose(v, q, s));
      batched.userData.inspectableBatchIds[id2] = e.id;
      const targetHeight = e.kind.startsWith("styl_tree_") ? 3 * e.scale : e.kind === "styl_shrub" ? 0.7 * e.scale : e.kind === "styl_ore" ? 0.65 * e.scale : e.scale;
      batched.userData.inspectableTargets[id2] = {
        entityId: e.id,
        x: e.x,
        y: e.y + targetHeight,
        z: e.z
      };
      instances++;
    }
  }
  batched.computeBoundingBox();
  batched.computeBoundingSphere();
  group.add(batched);
  return { group, triangles, instances };
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
    const command = value.schema !== JOURNAL_SCHEMA ? {
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
    if (command.schema !== JOURNAL_SCHEMA && command.designVersion !== FOUNDER_DESIGN_VERSION) {
      throw new Error("unsupported structure design");
    }
    if (!sameFields(command, value)) throw new Error("non-canonical build command");
    return command;
  }
  if (value.type === "harvest" && value.schema === JOURNAL_SCHEMA && entityId2(value.entityId)) {
    const command = {
      schema: value.schema,
      id: value.id,
      type: "harvest",
      entityId: value.entityId,
      expectedRevision: value.expectedRevision
    };
    if (!sameFields(command, value)) throw new Error("non-canonical harvest command");
    return command;
  }
  if (value.schema === CURRENT_JOURNAL_SCHEMA) {
    const base = { schema: value.schema, id: value.id, expectedRevision: value.expectedRevision };
    let command = null;
    if (value.type === "harvest" && entityId2(value.entityId)) {
      command = {
        schema: value.schema,
        id: value.id,
        type: value.type,
        entityId: value.entityId,
        expectedRevision: value.expectedRevision
      };
    } else if ((value.type === "deposit" || value.type === "withdraw") && value.stockpileId === FOUNDER_STOCKPILE_ID) {
      command = { ...base, type: value.type, stockpileId: value.stockpileId, resources: inventory(value.resources) };
    } else if (value.type === "produce" && value.stockpileId === FOUNDER_STOCKPILE_ID && (value.recipe === "seed" || value.recipe === "rations")) {
      command = { ...base, type: value.type, stockpileId: value.stockpileId, recipe: value.recipe };
    } else if (value.type === "tick" && uint2(value.ticks) && value.ticks > 0 && value.ticks <= MAX_TICKS_PER_COMMAND) {
      command = { ...base, type: value.type, ticks: value.ticks };
    } else if (value.type === "plant" && typeof value.plotId === "string" && /^crop:[0-8]$/.test(value.plotId)) {
      command = { ...base, type: value.type, plotId: value.plotId };
    } else if (value.type === "harvest_crop" && typeof value.plotId === "string" && /^crop:[0-8]$/.test(value.plotId)) {
      command = { ...base, type: value.type, plotId: value.plotId };
    }
    if (command) {
      if (!sameFields(command, value)) throw new Error("non-canonical life-loop command");
      return command;
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
    let command;
    try {
      command = validateCommand(input);
    } catch (error2) {
      return this.reject(
        object(input) && typeof input.id === "string" ? input.id : "",
        "invalid_command",
        [error2.message]
      );
    }
    if ((command.type === "build" || command.type === "harvest") && command.schema !== this.journal.schema || command.type !== "build" && command.type !== "harvest" && this.journal.schema !== CURRENT_JOURNAL_SCHEMA) {
      return this.reject(command.id, "schema_mismatch", ["command schema does not match this world journal"]);
    }
    const prior = this.ids.get(command.id);
    if (prior) {
      if (!sameFields(prior.command, command)) {
        return this.reject(command.id, "duplicate_command_id", ["command id already has different accepted input"]);
      }
      return this.receipt(prior, true);
    }
    if (command.expectedRevision !== this.world.revision) {
      return this.reject(command.id, "stale_revision", [
        `command expects revision ${command.expectedRevision}; world is at ${this.world.revision}`
      ]);
    }
    const before = this.stateHash;
    let outcome;
    if (command.type === "build") {
      const result = buildProject(
        this.world,
        this.prepAuthorizer,
        this.structureAuthorizer,
        projectById(command.projectId),
        "designVersion" in command ? command.designVersion : void 0
      );
      if (!result.ok) {
        if (this.stateHash !== before) throw new Error("rejected build changed authoritative state");
        return this.reject(command.id, result.code, result.reasons);
      }
      outcome = {
        type: "build",
        structureId: result.record.id,
        costPaid: inventory(result.structure.costPaid),
        resourcesGained: inventory(result.preparation.resourcesGained)
      };
    } else if (command.type === "harvest") {
      const result = harvestEntity(this.world, command.entityId);
      if (!result) return this.reject(command.id, "not_harvestable", ["entity is absent, depleted or has no resource"]);
      outcome = {
        type: "harvest",
        entityId: result.entity.id,
        resource: result.resource,
        amount: result.amount
      };
    } else if (command.type === "deposit" || command.type === "withdraw") {
      const result = transfer(this.world, command.type, command.resources);
      if (!result.ok) {
        if (this.stateHash !== before) throw new Error("rejected transfer changed authoritative state");
        return this.reject(command.id, result.code, result.reasons);
      }
      outcome = { type: command.type, stockpileId: FOUNDER_STOCKPILE_ID, resources: result.value };
    } else if (command.type === "produce") {
      const result = startProduction(this.world, command.recipe, command.id);
      if (!result.ok) return this.reject(command.id, result.code, result.reasons);
      outcome = {
        type: "produce",
        jobId: result.value.id,
        stockpileId: result.value.stockpileId,
        recipe: result.value.recipe,
        remainingTicks: result.value.remainingTicks
      };
    } else if (command.type === "tick") {
      const result = advanceTicks(this.world, command.ticks);
      if (!result.ok) return this.reject(command.id, result.code, result.reasons);
      outcome = { type: "tick", ...result.value };
    } else if (command.type === "plant") {
      const result = plantCrop(this.world, command.plotId);
      if (!result.ok) return this.reject(command.id, result.code, result.reasons);
      outcome = {
        type: "plant",
        plotId: command.plotId,
        plantedTick: result.value.plantedTick,
        growthTicks: result.value.growthTicks
      };
    } else if (command.type === "harvest_crop") {
      const result = harvestCrop(this.world, command.plotId);
      if (!result.ok) return this.reject(command.id, result.code, result.reasons);
      outcome = { type: "harvest_crop", plotId: command.plotId, resources: result.value };
    } else {
      throw new Error("unhandled command type");
    }
    const entry = {
      command,
      sequence: this.nextSequence,
      revision: this.world.revision,
      // The sequence is part of the state hash at this accepted boundary.
      hash: canonicalWorldHash(this.world, this.nextSequence + 1, this.snapshotSchema()),
      outcome
    };
    this.journal.entries.push(entry);
    this.ids.set(command.id, entry);
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

// tests/m004.foundation.test.ts
test("resident queries never generate chunks and agree with generating queries", () => {
  const world = createWorld(1337);
  assert.equal(residentSurfaceAt(world, 10, 10), null);
  assert.equal(residentVoxelAt(world, 10, 5, 10), null);
  assert.equal(world.chunks.size, 0, "resident queries must not materialize chunks");
  const generated = surfaceAt(world, 10, 10);
  assert.equal(residentSurfaceAt(world, 10, 10), generated);
  assert.equal(residentVoxelAt(world, 10, generated - 1, 10) !== MAT.AIR, true);
  assert.equal(residentVoxelAt(world, 10, -999, 10), MAT.BEDROCK);
  assert.equal(residentSurfaceAt(world, 5e3, 0), null, "outside the world is null");
});
test("edit version advances on real edits and snapshot restore, not on no-ops", () => {
  const world = createWorld(1337);
  const y = surfaceAt(world, 3, 3);
  const v0 = editVersion(world);
  assert.ok(setVoxel(world, 3, y, 3, MAT.STONE));
  const v1 = editVersion(world);
  assert.ok(v1 > v0);
  assert.equal(setVoxel(world, 3, y, 3, MAT.STONE), false);
  assert.equal(editVersion(world), v1, "a no-op write is not a change");
  restoreWorldSnapshot(world, createWorldSnapshot(world, 0));
  assert.ok(editVersion(world) > v1, "restoring a snapshot replaces the edit overlay");
});
test("terrain view keeps resident chunks bounded while travelling, and edits survive eviction", () => {
  const world = createWorld(1337);
  const scene = new THREE4.Scene();
  const view = new VoxelTerrainView(world, scene, { nearRadius: 1 });
  view.frameBudgetMs = Number.POSITIVE_INFINITY;
  const editX = 2, editZ = 2;
  const editY = surfaceAt(world, editX, editZ);
  assert.ok(setVoxel(world, editX, editY, editZ, MAT.ORE));
  const focus = new THREE4.Vector3(0, 10, 0);
  view.preload(focus);
  const keep = 1 + 2;
  const bound = (2 * keep + 1) ** 2;
  let maxResident = 0;
  for (let step = 0; step < 40; step++) {
    focus.x += CHUNK_SIZE / 2;
    focus.z += CHUNK_SIZE / 3;
    for (let f = 0; f < 30; f++) view.update(focus);
    maxResident = Math.max(maxResident, world.chunks.size);
  }
  assert.ok(view.evictedBySweep > 0, "the sweep must release chunks behind the focus");
  assert.ok(maxResident <= bound, `resident chunks ${maxResident} exceed ${bound}`);
  assert.equal(
    world.chunks.has(chunkKey(worldToChunkX(editX), worldToChunkZ(editZ))),
    false,
    "the edited chunk is evicted once far away"
  );
  assert.equal(surfaceAt(world, editX, editZ), editY + 1, "the durable edit is reapplied on regeneration");
});
test("pinned regions stay resident through sweeps", () => {
  const world = createWorld(1337);
  const view = new VoxelTerrainView(world, new THREE4.Scene(), { nearRadius: 1 });
  view.frameBudgetMs = Number.POSITIVE_INFINITY;
  view.pinRect(-60, -48, -25, -33);
  ensureChunk(world, worldToChunkX(-50), worldToChunkZ(-40));
  const focus = new THREE4.Vector3(600, 10, 600);
  view.preload(focus);
  for (let f = 0; f < 60; f++) view.update(focus);
  assert.ok(world.chunks.has(chunkKey(worldToChunkX(-50), worldToChunkZ(-40))));
});
test("nature rebuilds reuse cached variant geometry with identical output", () => {
  const session = GameSession.genesis(1337);
  const first = buildNoxelNature(session.world);
  const second = buildNoxelNature(session.world);
  assert.ok(first.instances > 0);
  assert.equal(second.instances, first.instances);
  assert.equal(second.triangles, first.triangles);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwNC5mb3VuZGF0aW9uLnRlc3QudHMiLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS9ub2lzZS50cyIsICIuLi8uLi9zcmMvc2ltL2h5ZHJvbG9neS50cyIsICIuLi8uLi9zcmMvc2ltL21hdGVyaWFscy50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4tdjIudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3NpbS9jb25zdHJ1Y3Rpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9jYW5vbmljYWwudHMiLCAiLi4vLi4vc3JjL3NpbS9wcmVwYXJhdGlvbi50cyIsICIuLi8uLi9zcmMvc2ltL3N0cnVjdHVyZXMudHMiLCAiLi4vLi4vc3JjL3NpbS9lY29ub215LnRzIiwgIi4uLy4uL3NyYy9zaW0vc25hcHNob3QudHMiLCAiLi4vLi4vc3JjL3JlbmRlci90ZXJyYWluLnRzIiwgIi4uLy4uL3NyYy9kYXRhL3BhbGV0dGUuanNvbiIsICIuLi8uLi9zcmMvcmVuZGVyL3dhdGVyLnRzIiwgIi4uLy4uL3NyYy9yZW5kZXIvbmF0dXJlLnRzIiwgIi4uLy4uL3NyYy9zaW0vbTAwMi50cyIsICIuLi8uLi9zcmMvc2ltL3NjZW5hcmlvLnRzIiwgIi4uLy4uL3NyYy9hcHAvcHJvamVjdHMudHMiLCAiLi4vLi4vc3JjL2FwcC9zZXNzaW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgdGVzdCBmcm9tICdub2RlOnRlc3QnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdub2RlOmFzc2VydC9zdHJpY3QnO1xuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHtcbiAgTUFULCBjaHVua0tleSwgY3JlYXRlV29ybGQsIGVkaXRWZXJzaW9uLCBlbnN1cmVDaHVuaywgcmVzaWRlbnRTdXJmYWNlQXQsIHJlc2lkZW50Vm94ZWxBdCxcbiAgc2V0Vm94ZWwsIHN1cmZhY2VBdCwgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgQ0hVTktfU0laRSxcbn0gZnJvbSAnLi4vc3JjL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBjcmVhdGVXb3JsZFNuYXBzaG90LCByZXN0b3JlV29ybGRTbmFwc2hvdCB9IGZyb20gJy4uL3NyYy9zaW0vc25hcHNob3QnO1xuaW1wb3J0IHsgVm94ZWxUZXJyYWluVmlldyB9IGZyb20gJy4uL3NyYy9yZW5kZXIvdGVycmFpbic7XG5pbXBvcnQgeyBidWlsZE5veGVsTmF0dXJlIH0gZnJvbSAnLi4vc3JjL3JlbmRlci9uYXR1cmUnO1xuaW1wb3J0IHsgR2FtZVNlc3Npb24gfSBmcm9tICcuLi9zcmMvYXBwL3Nlc3Npb24nO1xuXG50ZXN0KCdyZXNpZGVudCBxdWVyaWVzIG5ldmVyIGdlbmVyYXRlIGNodW5rcyBhbmQgYWdyZWUgd2l0aCBnZW5lcmF0aW5nIHF1ZXJpZXMnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoMTMzNyk7XG4gIGFzc2VydC5lcXVhbChyZXNpZGVudFN1cmZhY2VBdCh3b3JsZCwgMTAsIDEwKSwgbnVsbCk7XG4gIGFzc2VydC5lcXVhbChyZXNpZGVudFZveGVsQXQod29ybGQsIDEwLCA1LCAxMCksIG51bGwpO1xuICBhc3NlcnQuZXF1YWwod29ybGQuY2h1bmtzLnNpemUsIDAsICdyZXNpZGVudCBxdWVyaWVzIG11c3Qgbm90IG1hdGVyaWFsaXplIGNodW5rcycpO1xuICBjb25zdCBnZW5lcmF0ZWQgPSBzdXJmYWNlQXQod29ybGQsIDEwLCAxMCk7XG4gIGFzc2VydC5lcXVhbChyZXNpZGVudFN1cmZhY2VBdCh3b3JsZCwgMTAsIDEwKSwgZ2VuZXJhdGVkKTtcbiAgYXNzZXJ0LmVxdWFsKHJlc2lkZW50Vm94ZWxBdCh3b3JsZCwgMTAsIGdlbmVyYXRlZCAtIDEsIDEwKSAhPT0gTUFULkFJUiwgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChyZXNpZGVudFZveGVsQXQod29ybGQsIDEwLCAtOTk5LCAxMCksIE1BVC5CRURST0NLKTtcbiAgYXNzZXJ0LmVxdWFsKHJlc2lkZW50U3VyZmFjZUF0KHdvcmxkLCA1MDAwLCAwKSwgbnVsbCwgJ291dHNpZGUgdGhlIHdvcmxkIGlzIG51bGwnKTtcbn0pO1xuXG50ZXN0KCdlZGl0IHZlcnNpb24gYWR2YW5jZXMgb24gcmVhbCBlZGl0cyBhbmQgc25hcHNob3QgcmVzdG9yZSwgbm90IG9uIG5vLW9wcycsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgMywgMyk7XG4gIGNvbnN0IHYwID0gZWRpdFZlcnNpb24od29ybGQpO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIDMsIHksIDMsIE1BVC5TVE9ORSkpO1xuICBjb25zdCB2MSA9IGVkaXRWZXJzaW9uKHdvcmxkKTtcbiAgYXNzZXJ0Lm9rKHYxID4gdjApO1xuICBhc3NlcnQuZXF1YWwoc2V0Vm94ZWwod29ybGQsIDMsIHksIDMsIE1BVC5TVE9ORSksIGZhbHNlKTtcbiAgYXNzZXJ0LmVxdWFsKGVkaXRWZXJzaW9uKHdvcmxkKSwgdjEsICdhIG5vLW9wIHdyaXRlIGlzIG5vdCBhIGNoYW5nZScpO1xuICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgY3JlYXRlV29ybGRTbmFwc2hvdCh3b3JsZCwgMCkpO1xuICBhc3NlcnQub2soZWRpdFZlcnNpb24od29ybGQpID4gdjEsICdyZXN0b3JpbmcgYSBzbmFwc2hvdCByZXBsYWNlcyB0aGUgZWRpdCBvdmVybGF5Jyk7XG59KTtcblxudGVzdCgndGVycmFpbiB2aWV3IGtlZXBzIHJlc2lkZW50IGNodW5rcyBib3VuZGVkIHdoaWxlIHRyYXZlbGxpbmcsIGFuZCBlZGl0cyBzdXJ2aXZlIGV2aWN0aW9uJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKDEzMzcpO1xuICBjb25zdCBzY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xuICBjb25zdCB2aWV3ID0gbmV3IFZveGVsVGVycmFpblZpZXcod29ybGQsIHNjZW5lLCB7IG5lYXJSYWRpdXM6IDEgfSk7XG4gIHZpZXcuZnJhbWVCdWRnZXRNcyA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblxuICBjb25zdCBlZGl0WCA9IDIsIGVkaXRaID0gMjtcbiAgY29uc3QgZWRpdFkgPSBzdXJmYWNlQXQod29ybGQsIGVkaXRYLCBlZGl0Wik7XG4gIGFzc2VydC5vayhzZXRWb3hlbCh3b3JsZCwgZWRpdFgsIGVkaXRZLCBlZGl0WiwgTUFULk9SRSkpO1xuXG4gIGNvbnN0IGZvY3VzID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMTAsIDApO1xuICB2aWV3LnByZWxvYWQoZm9jdXMpO1xuICBjb25zdCBrZWVwID0gMSArIDI7XG4gIGNvbnN0IGJvdW5kID0gKDIgKiBrZWVwICsgMSkgKiogMjtcbiAgbGV0IG1heFJlc2lkZW50ID0gMDtcbiAgZm9yIChsZXQgc3RlcCA9IDA7IHN0ZXAgPCA0MDsgc3RlcCsrKSB7XG4gICAgZm9jdXMueCArPSBDSFVOS19TSVpFIC8gMjtcbiAgICBmb2N1cy56ICs9IENIVU5LX1NJWkUgLyAzO1xuICAgIGZvciAobGV0IGYgPSAwOyBmIDwgMzA7IGYrKykgdmlldy51cGRhdGUoZm9jdXMpO1xuICAgIG1heFJlc2lkZW50ID0gTWF0aC5tYXgobWF4UmVzaWRlbnQsIHdvcmxkLmNodW5rcy5zaXplKTtcbiAgfVxuICBhc3NlcnQub2sodmlldy5ldmljdGVkQnlTd2VlcCA+IDAsICd0aGUgc3dlZXAgbXVzdCByZWxlYXNlIGNodW5rcyBiZWhpbmQgdGhlIGZvY3VzJyk7XG4gIGFzc2VydC5vayhtYXhSZXNpZGVudCA8PSBib3VuZCwgYHJlc2lkZW50IGNodW5rcyAke21heFJlc2lkZW50fSBleGNlZWQgJHtib3VuZH1gKTtcbiAgYXNzZXJ0LmVxdWFsKHdvcmxkLmNodW5rcy5oYXMoY2h1bmtLZXkod29ybGRUb0NodW5rWChlZGl0WCksIHdvcmxkVG9DaHVua1ooZWRpdFopKSksIGZhbHNlLFxuICAgICd0aGUgZWRpdGVkIGNodW5rIGlzIGV2aWN0ZWQgb25jZSBmYXIgYXdheScpO1xuICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KHdvcmxkLCBlZGl0WCwgZWRpdFopLCBlZGl0WSArIDEsICd0aGUgZHVyYWJsZSBlZGl0IGlzIHJlYXBwbGllZCBvbiByZWdlbmVyYXRpb24nKTtcbn0pO1xuXG50ZXN0KCdwaW5uZWQgcmVnaW9ucyBzdGF5IHJlc2lkZW50IHRocm91Z2ggc3dlZXBzJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKDEzMzcpO1xuICBjb25zdCB2aWV3ID0gbmV3IFZveGVsVGVycmFpblZpZXcod29ybGQsIG5ldyBUSFJFRS5TY2VuZSgpLCB7IG5lYXJSYWRpdXM6IDEgfSk7XG4gIHZpZXcuZnJhbWVCdWRnZXRNcyA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgdmlldy5waW5SZWN0KC02MCwgLTQ4LCAtMjUsIC0zMyk7XG4gIGVuc3VyZUNodW5rKHdvcmxkLCB3b3JsZFRvQ2h1bmtYKC01MCksIHdvcmxkVG9DaHVua1ooLTQwKSk7XG4gIGNvbnN0IGZvY3VzID0gbmV3IFRIUkVFLlZlY3RvcjMoNjAwLCAxMCwgNjAwKTtcbiAgdmlldy5wcmVsb2FkKGZvY3VzKTtcbiAgZm9yIChsZXQgZiA9IDA7IGYgPCA2MDsgZisrKSB2aWV3LnVwZGF0ZShmb2N1cyk7XG4gIGFzc2VydC5vayh3b3JsZC5jaHVua3MuaGFzKGNodW5rS2V5KHdvcmxkVG9DaHVua1goLTUwKSwgd29ybGRUb0NodW5rWigtNDApKSkpO1xufSk7XG5cbnRlc3QoJ25hdHVyZSByZWJ1aWxkcyByZXVzZSBjYWNoZWQgdmFyaWFudCBnZW9tZXRyeSB3aXRoIGlkZW50aWNhbCBvdXRwdXQnLCAoKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5nZW5lc2lzKDEzMzcpO1xuICBjb25zdCBmaXJzdCA9IGJ1aWxkTm94ZWxOYXR1cmUoc2Vzc2lvbi53b3JsZCk7XG4gIGNvbnN0IHNlY29uZCA9IGJ1aWxkTm94ZWxOYXR1cmUoc2Vzc2lvbi53b3JsZCk7XG4gIGFzc2VydC5vayhmaXJzdC5pbnN0YW5jZXMgPiAwKTtcbiAgYXNzZXJ0LmVxdWFsKHNlY29uZC5pbnN0YW5jZXMsIGZpcnN0Lmluc3RhbmNlcyk7XG4gIGFzc2VydC5lcXVhbChzZWNvbmQudHJpYW5nbGVzLCBmaXJzdC50cmlhbmdsZXMpO1xufSk7XG4iLCAiLy8gUHJpdmF0ZSBtaWdyYXRpb24gcmVwbGF5IG9ubHkuIFJldGlyZWQgZW50aXRpZXMgbGl2ZSBpbiB0aGlzIFdvcmxkIHdoaWxlIGFuXG4vLyBhY2NlcHRlZCBoaXN0b3JpY2FsIGpvdXJuYWwgaXMgY2hlY2tlZDsgbm8gcHVibGljIGNvbW1hbmQgZW5hYmxlcyB0aGlzIG1vZGUuXG5pbnRlcmZhY2UgUmVwbGF5U3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIGhpc3RvcmljYWxIYXNoOiBib29sZWFuO1xuICBtaWdyYXRlZDogYm9vbGVhbjtcbn1cblxuY29uc3Qgc3RhdGVzID0gbmV3IFdlYWtNYXA8b2JqZWN0LCBSZXBsYXlTdGF0ZT4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxheVN0b25lU3RhdGUod29ybGQ6IG9iamVjdCk6IFJlcGxheVN0YXRlIHtcbiAgbGV0IHN0YXRlID0gc3RhdGVzLmdldCh3b3JsZCk7XG4gIGlmICghc3RhdGUpIHsgc3RhdGUgPSB7IGFjdGl2ZTogZmFsc2UsIGhpc3RvcmljYWxIYXNoOiBmYWxzZSwgbWlncmF0ZWQ6IGZhbHNlIH07IHN0YXRlcy5zZXQod29ybGQsIHN0YXRlKTsgfVxuICByZXR1cm4gc3RhdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IHRydWU7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbiAgc3RhdGUubWlncmF0ZWQgPSBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/LmFjdGl2ZSA/PyBmYWxzZTtcbn1cblxuLyoqIFNuYXBzaG90IGhhc2hlcyBiZWZvcmUgYW5kIGR1cmluZyB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheSBpbmNsdWRlIHN0b25lcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5oaXN0b3JpY2FsSGFzaCA/PyBmYWxzZTtcbn1cblxuLyoqIEEgbWlncmF0ZWQgc25hcHNob3QgYWxyZWFkeSBoYXMgcmV0aXJlbWVudCB0b21ic3RvbmVzIGluIGdlbmVyYXRlZCBjaHVua3MuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5taWdyYXRlZCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lm1pZ3JhdGVkID8/IGZhbHNlO1xufVxuXG4vKiogRXhpdCBoaXN0b3JpY2FsIG1vZGUgYWZ0ZXIgYWxsIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBoYXNoZXMgaGF2ZSBwYXNzZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZmluaXNoU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSBmYWxzZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSBmYWxzZTtcbiAgc3RhdGUubWlncmF0ZWQgPSB0cnVlO1xufVxuIiwgIi8vIERldGVybWluaXN0aWMgaGFzaCwgbm9pc2UgYW5kIG1hdGggaGVscGVycyBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIuXG4vLyBQdXJlIFR5cGVTY3JpcHQgKEQtMDA1KS4gRXh0cmFjdGVkIGZyb20gd29ybGQudHMgdW5jaGFuZ2VkIHNvIHRlcnJhaW5cbi8vIGdlbmVyYXRvcnMgb2YgZXZlcnkgdmVyc2lvbiB1c2UgaWRlbnRpY2FsIHByaW1pdGl2ZXMuXG5leHBvcnQgY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuZXhwb3J0IGNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuZXhwb3J0IGNvbnN0IHNtb290aHN0ZXAgPSAoZTA6IG51bWJlciwgZTE6IG51bWJlciwgeDogbnVtYmVyKSA9PiB7XG4gIGNvbnN0IHQgPSBjbGFtcCgoeCAtIGUwKSAvIChlMSAtIGUwKSwgMCwgMSk7XG4gIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xufTtcblxuLy8gLS0tLS0tLS0tLSBkZXRlcm1pbmlzdGljIGhhc2ggLyBub2lzZSAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gaGFzaDJpKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoM2koeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKSBeIE1hdGguaW11bCh6LCAyMjQ2ODIyNTE5KTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbXVsYmVycnkzMihzZWVkOiBudW1iZXIpOiAoKSA9PiBudW1iZXIge1xuICBsZXQgYSA9IHNlZWQgPj4+IDA7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgYSA9IChhICsgMHg2ZDJiNzlmNSkgPj4+IDA7XG4gICAgbGV0IHQgPSBhO1xuICAgIHQgPSBNYXRoLmltdWwodCBeICh0ID4+PiAxNSksIHQgfCAxKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgdCB8IDYxKTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IHNtb290aCA9ICh0OiBudW1iZXIpID0+IHQgKiB0ICogKDMgLSAyICogdCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSk7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSk7XG4gIGNvbnN0IGEgPSBoYXNoMmkoeGksIHlpLCBzZWVkKSwgYiA9IGhhc2gyaSh4aSArIDEsIHlpLCBzZWVkKTtcbiAgY29uc3QgYyA9IGhhc2gyaSh4aSwgeWkgKyAxLCBzZWVkKSwgZCA9IGhhc2gyaSh4aSArIDEsIHlpICsgMSwgc2VlZCk7XG4gIGNvbnN0IHRvcCA9IGEgKyAoYiAtIGEpICogeGY7XG4gIGNvbnN0IGJvdHRvbSA9IGMgKyAoZCAtIGMpICogeGY7XG4gIHJldHVybiB0b3AgKyAoYm90dG9tIC0gdG9wKSAqIHlmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMih4ICogZnJlcSwgeSAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KSwgemkgPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpLCB6ZiA9IHNtb290aCh6IC0gemkpO1xuICBjb25zdCBjMDAwID0gaGFzaDNpKHhpLCB5aSwgemksIHNlZWQpLCBjMTAwID0gaGFzaDNpKHhpICsgMSwgeWksIHppLCBzZWVkKTtcbiAgY29uc3QgYzAxMCA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSwgc2VlZCksIGMxMTAgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppLCBzZWVkKTtcbiAgY29uc3QgYzAwMSA9IGhhc2gzaSh4aSwgeWksIHppICsgMSwgc2VlZCksIGMxMDEgPSBoYXNoM2koeGkgKyAxLCB5aSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgYzAxMSA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpLCBjMTExID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCB4MDAgPSBjMDAwICsgKGMxMDAgLSBjMDAwKSAqIHhmO1xuICBjb25zdCB4MTAgPSBjMDEwICsgKGMxMTAgLSBjMDEwKSAqIHhmO1xuICBjb25zdCB4MDEgPSBjMDAxICsgKGMxMDEgLSBjMDAxKSAqIHhmO1xuICBjb25zdCB4MTEgPSBjMDExICsgKGMxMTEgLSBjMDExKSAqIHhmO1xuICBjb25zdCB5MCA9IHgwMCArICh4MTAgLSB4MDApICogeWY7XG4gIGNvbnN0IHkxID0geDAxICsgKHgxMSAtIHgwMSkgKiB5ZjtcbiAgcmV0dXJuIHkwICsgKHkxIC0geTApICogemY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0zKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTMoeCAqIGZyZXEsIHkgKiBmcmVxLCB6ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuIiwgIi8vIEh5ZHJvbG9neSBcdTIwMTQgdGhlIGRldGVybWluaXN0aWMgd2F0ZXIgbmV0d29yayBvZiBhIHdvcmxkIChwdXJlIFR5cGVTY3JpcHQsIEQtMDA1KS5cbi8vXG4vLyBUaGlzIGlzIGRlcml2ZWQgKnNpbXVsYXRpb24gZGF0YSosIG5vdCBwcmVzZW50YXRpb246IGl0IGlzIGEgcHVyZSBmdW5jdGlvbiBvZlxuLy8gKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKSBhbmQgaXMgd2hhdCB0ZXJyYWluIGNhcnZpbmcsIHdhdGVyIGZpbGxpbmcsIGZsb3dcbi8vIGRpcmVjdGlvbiBhbmQgZnV0dXJlIGZpc2hpbmcvaXJyaWdhdGlvbi9mbG9vZGluZyBydWxlcyByZWFkLiBJdCBpcyBuZXZlclxuLy8gam91cm5hbGVkIGJlY2F1c2UgaXQgY2FuIGFsd2F5cyBiZSByZWdlbmVyYXRlZCBleGFjdGx5LlxuLy9cbi8vIE5ldHdvcmsgKGJvdGggZ2VuZXJhdG9yIHZlcnNpb25zKTpcbi8vICAgbGFrZSAgXHUyMDE0IHRoZSB2YWxsZXkgbGFrZSBiYXNpbiwgbG9jYXRlZCBmcm9tIHRoZSBhY3R1YWwgZ2VuZXJhdGVkIHRlcnJhaW4uXG4vLyAgIGxvd2VyIFx1MjAxNCB0aGUgbG93bGFuZCByaXZlciBmcm9tIHRoZSBsYWtlIHRvIHRoZSBzb3V0aGVybiBzZWEsIHRyYWNlZCBmcm9tXG4vLyAgICAgICAgICAgdGhlIGFjdHVhbCBjYXJ2ZWQgY2hhbm5lbCAodGhlIHYxIGNoYW5uZWwgaXMgY2FydmVkIG9uICp3YXJwZWQqXG4vLyAgICAgICAgICAgY29vcmRpbmF0ZXMsIHNvIGByaXZlckNlbnRlclhgIGFsb25lIGlzIHVwIHRvIH4xMzUgbSBvZmYpLlxuLy8gR2VuZXJhdG9yIHYyIGFkZHM6XG4vLyAgIHVwcGVyIFx1MjAxNCBhIG1vdW50YWluIHJpdmVyIGZyb20gYSBoaWdobGFuZCB0YXJuIGRvd24gdG8gdGhlIGxha2UsIHdpdGggYVxuLy8gICAgICAgICAgIHdhdGVyLXN1cmZhY2UgbGV2ZWwgdGhhdCBuZXZlciByaXNlcyBkb3duc3RyZWFtLCBjYXNjYWRlcyBhbmQgZmFsbHMuXG4vL1xuLy8gRmxvdyBhbHdheXMgcG9pbnRzIGRvd25zdHJlYW06IHVwcGVyIFx1MjE5MiBsYWtlIFx1MjE5MiBsb3dlciBcdTIxOTIgc2VhLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIG11bGJlcnJ5MzIsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcblxuZXhwb3J0IHR5cGUgSGVpZ2h0U2FtcGxlciA9ICh4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJpdmVyUG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQgb2YgdGhpcyByZWFjaCAobWV0cmVzKS4gKi9cbiAgczogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBlbGV2YXRpb24gKG1ldHJlcywgbWF5IGJlIGZyYWN0aW9uYWwpLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogQ2hhbm5lbCBoYWxmLXdpZHRoIChtZXRyZXMpLiAqL1xuICB3aWR0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWNoSGl0IHtcbiAgLyoqIEhvcml6b250YWwgZGlzdGFuY2UgZnJvbSB0aGUgY2VudHJlbGluZS4gKi9cbiAgZDogbnVtYmVyO1xuICAvKiogSW50ZXJwb2xhdGVkIHdhdGVyIGxldmVsIGF0IHRoZSBuZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIHdpZHRoOiBudW1iZXI7XG4gIC8qKiBVbml0IGRvd25zdHJlYW0gZGlyZWN0aW9uLiAqL1xuICB0eDogbnVtYmVyO1xuICB0ejogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBkcm9wIHBlciBtZXRyZSBhbG9uZyB0aGUgY2hhbm5lbCAoPj0gMCkuICovXG4gIGdyYWRpZW50OiBudW1iZXI7XG4gIC8qKiBBcmMgbGVuZ3RoIG9mIHRoZSBuZWFyZXN0IHBvaW50IGZyb20gdGhlIGRvd25zdHJlYW0gZW5kLiAqL1xuICBzOiBudW1iZXI7XG59XG5cbi8qKlxuICogQSBwb2x5bGluZSByZWFjaCBzdG9yZWQgZG93bnN0cmVhbS1maXJzdC4gTmVhcmVzdC1zZWdtZW50IHF1ZXJpZXMgdXNlIGFcbiAqIHVuaWZvcm0gZ3JpZCB3aG9zZSBjZWxscyBsaXN0IGV2ZXJ5IHNlZ21lbnQgd2l0aGluIGByZWFjaGAgbWV0cmVzLlxuICovXG5leHBvcnQgY2xhc3MgUml2ZXJSZWFjaCB7XG4gIHJlYWRvbmx5IHBvaW50czogUml2ZXJQb2ludFtdO1xuICBwcml2YXRlIHJlYWRvbmx5IGNlbGwgPSAzMjtcbiAgcHJpdmF0ZSByZWFkb25seSBncmlkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXG4gIGNvbnN0cnVjdG9yKHBvaW50czogUml2ZXJQb2ludFtdLCByZWFkb25seSByZWFjaDogbnVtYmVyKSB7XG4gICAgdGhpcy5wb2ludHMgPSBwb2ludHM7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgKyAxIDwgcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBhID0gcG9pbnRzW2ldLCBiID0gcG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IHgwID0gTWF0aC5taW4oYS54LCBiLngpIC0gcmVhY2gsIHgxID0gTWF0aC5tYXgoYS54LCBiLngpICsgcmVhY2g7XG4gICAgICBjb25zdCB6MCA9IE1hdGgubWluKGEueiwgYi56KSAtIHJlYWNoLCB6MSA9IE1hdGgubWF4KGEueiwgYi56KSArIHJlYWNoO1xuICAgICAgZm9yIChsZXQgY3ogPSBNYXRoLmZsb29yKHowIC8gdGhpcy5jZWxsKTsgY3ogPD0gTWF0aC5mbG9vcih6MSAvIHRoaXMuY2VsbCk7IGN6KyspIHtcbiAgICAgICAgZm9yIChsZXQgY3ggPSBNYXRoLmZsb29yKHgwIC8gdGhpcy5jZWxsKTsgY3ggPD0gTWF0aC5mbG9vcih4MSAvIHRoaXMuY2VsbCk7IGN4KyspIHtcbiAgICAgICAgICBjb25zdCBrZXkgPSBjZWxsS2V5KGN4LCBjeik7XG4gICAgICAgICAgbGV0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGtleSk7XG4gICAgICAgICAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgdGhpcy5ncmlkLnNldChrZXksIGxpc3QpOyB9XG4gICAgICAgICAgbGlzdC5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGxlbmd0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wb2ludHNbdGhpcy5wb2ludHMubGVuZ3RoIC0gMV0/LnMgPz8gMDsgfVxuXG4gIC8qKiBOZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQgd2l0aGluIGByZWFjaGAsIG9yIG51bGwuICovXG4gIG5lYXJlc3QoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBSZWFjaEhpdCB8IG51bGwge1xuICAgIGNvbnN0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGNlbGxLZXkoTWF0aC5mbG9vcih4IC8gdGhpcy5jZWxsKSwgTWF0aC5mbG9vcih6IC8gdGhpcy5jZWxsKSkpO1xuICAgIGlmICghbGlzdCkgcmV0dXJuIG51bGw7XG4gICAgbGV0IGJlc3QgPSBJbmZpbml0eSwgYmkgPSAtMSwgYnQgPSAwO1xuICAgIGZvciAoY29uc3QgaSBvZiBsaXN0KSB7XG4gICAgICBjb25zdCBhID0gdGhpcy5wb2ludHNbaV0sIGIgPSB0aGlzLnBvaW50c1tpICsgMV07XG4gICAgICBjb25zdCBkeCA9IGIueCAtIGEueCwgZHogPSBiLnogLSBhLno7XG4gICAgICBjb25zdCBsZW4yID0gZHggKiBkeCArIGR6ICogZHogfHwgMTtcbiAgICAgIGNvbnN0IHQgPSBjbGFtcCgoKHggLSBhLngpICogZHggKyAoeiAtIGEueikgKiBkeikgLyBsZW4yLCAwLCAxKTtcbiAgICAgIGNvbnN0IHB4ID0gYS54ICsgZHggKiB0LCBweiA9IGEueiArIGR6ICogdDtcbiAgICAgIGNvbnN0IGQyID0gKHggLSBweCkgKiogMiArICh6IC0gcHopICoqIDI7XG4gICAgICBpZiAoZDIgPCBiZXN0KSB7IGJlc3QgPSBkMjsgYmkgPSBpOyBidCA9IHQ7IH1cbiAgICB9XG4gICAgaWYgKGJpIDwgMCB8fCBiZXN0ID4gdGhpcy5yZWFjaCAqIHRoaXMucmVhY2gpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tiaV0sIGIgPSB0aGlzLnBvaW50c1tiaSArIDFdO1xuICAgIGNvbnN0IHNlZ0xlbiA9IE1hdGgubWF4KDFlLTYsIGIucyAtIGEucyk7XG4gICAgLy8gUG9pbnRzIGFyZSBzdG9yZWQgZG93bnN0cmVhbS1maXJzdCwgc28gZG93bnN0cmVhbSBpcyBhIDwtIGIuXG4gICAgY29uc3QgdHggPSAoYS54IC0gYi54KSAvIHNlZ0xlbiwgdHogPSAoYS56IC0gYi56KSAvIHNlZ0xlbjtcbiAgICByZXR1cm4ge1xuICAgICAgZDogTWF0aC5zcXJ0KGJlc3QpLFxuICAgICAgbGV2ZWw6IGEubGV2ZWwgKyAoYi5sZXZlbCAtIGEubGV2ZWwpICogYnQsXG4gICAgICB3aWR0aDogYS53aWR0aCArIChiLndpZHRoIC0gYS53aWR0aCkgKiBidCxcbiAgICAgIHR4LCB0eixcbiAgICAgIGdyYWRpZW50OiBNYXRoLm1heCgwLCAoYi5sZXZlbCAtIGEubGV2ZWwpIC8gc2VnTGVuKSxcbiAgICAgIHM6IGEucyArIChiLnMgLSBhLnMpICogYnQsXG4gICAgfTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjZWxsS2V5KGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKGN4ICsgNDA5NikgKiA4MTkyICsgKGN6ICsgNDA5Nik7XG59XG5cbmV4cG9ydCB0eXBlIFdhdGVyQm9keSA9ICdyaXZlcicgfCAnbGFrZScgfCAnc2VhJyB8ICdub25lJztcblxuZXhwb3J0IGludGVyZmFjZSBGbG93U2FtcGxlIHtcbiAgYm9keTogV2F0ZXJCb2R5O1xuICAvKiogVW5pdCBmbG93IGRpcmVjdGlvbiAoemVybyBmb3Igc3RpbGwgd2F0ZXIpLiAqL1xuICBkeDogbnVtYmVyO1xuICBkejogbnVtYmVyO1xuICAvKiogU3VyZmFjZSBjdXJyZW50IHNwZWVkIGluIG0vcy4gKi9cbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIeWRyb2xvZ3lPcHRpb25zIHtcbiAgc2VlZDogbnVtYmVyO1xuICAvKiogR2VuZXJhdG9yIHZlcnNpb24gdGhlIG5ldHdvcmsgYmVsb25ncyB0by4gKi9cbiAgdmVyc2lvbjogbnVtYmVyO1xuICAvKiogQmFzZSBoZWlnaHQgb2YgdGhlICp1bm1vZGlmaWVkIHYxIHNoYXBlKiAodXNlZCB0byBsb2NhdGUgbGFrZS9jaGFubmVsKS4gKi9cbiAgdjFIZWlnaHQ6IEhlaWdodFNhbXBsZXI7XG59XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9naWNhbCBuZXR3b3JrIGZvciBvbmUgKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKS4gKi9cbmV4cG9ydCBjbGFzcyBIeWRyb2xvZ3kge1xuICByZWFkb25seSBzZWVkOiBudW1iZXI7XG4gIHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcbiAgcmVhZG9ubHkgbGFrZTogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcng6IG51bWJlcjsgcno6IG51bWJlciB9O1xuICByZWFkb25seSBsb3dlcjogUml2ZXJSZWFjaDtcbiAgcmVhZG9ubHkgdXBwZXI6IFJpdmVyUmVhY2ggfCBudWxsO1xuICAvKiogVXBwZXItcml2ZXIgc291cmNlIHRhcm4gKHYyIG9ubHkpLiAqL1xuICByZWFkb25seSB0YXJuOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByOiBudW1iZXI7IGxldmVsOiBudW1iZXIgfSB8IG51bGw7XG5cbiAgY29uc3RydWN0b3Iob3B0czogSHlkcm9sb2d5T3B0aW9ucykge1xuICAgIHRoaXMuc2VlZCA9IG9wdHMuc2VlZDtcbiAgICB0aGlzLnZlcnNpb24gPSBvcHRzLnZlcnNpb247XG4gICAgdGhpcy5sYWtlID0gbG9jYXRlTGFrZShvcHRzLnYxSGVpZ2h0KTtcbiAgICB0aGlzLmxvd2VyID0gdHJhY2VMb3dlclJpdmVyKG9wdHMudjFIZWlnaHQsIHRoaXMubGFrZSk7XG4gICAgaWYgKG9wdHMudmVyc2lvbiA+PSAyKSB7XG4gICAgICBjb25zdCB1cHBlciA9IGF1dGhvclVwcGVyUml2ZXIob3B0cy5zZWVkLCB0aGlzLmxha2UpO1xuICAgICAgdGhpcy51cHBlciA9IHVwcGVyLnJlYWNoO1xuICAgICAgdGhpcy50YXJuID0gdXBwZXIudGFybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51cHBlciA9IG51bGw7XG4gICAgICB0aGlzLnRhcm4gPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdXJmYWNlIGN1cnJlbnQgZm9yIGEgd2F0ZXIgY29sdW1uLiBgbGV2ZWxgIGlzIHRoZSBjb2x1bW4ncyB3YXRlciBzdXJmYWNlLFxuICAgKiB1c2VkIHRvIHRlbGwgc2VhLWxldmVsIHdhdGVyIChsYWtlLCBsb3dlciByaXZlciwgc2VhKSBmcm9tIHRoZSB1cHBlciByaXZlci5cbiAgICovXG4gIGZsb3dBdCh4OiBudW1iZXIsIHo6IG51bWJlciwgbGV2ZWw6IG51bWJlcik6IEZsb3dTYW1wbGUge1xuICAgIGlmICh0aGlzLnVwcGVyICYmIGxldmVsID4gMC41KSB7XG4gICAgICBjb25zdCBoaXQgPSB0aGlzLnVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDw9IGhpdC53aWR0aCArIDIpIHtcbiAgICAgICAgY29uc3Qgc3BlZWQgPSBjbGFtcCgwLjU1ICsgaGl0LmdyYWRpZW50ICogOSwgMC40LCA0LjUpO1xuICAgICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogaGl0LnR4LCBkejogaGl0LnR6LCBzcGVlZCB9O1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMudGFybiAmJiBNYXRoLmh5cG90KHggLSB0aGlzLnRhcm4ueCwgeiAtIHRoaXMudGFybi56KSA8IHRoaXMudGFybi5yICsgNCkge1xuICAgICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLnRvd2FyZHMoeCwgeiwgdGhpcy51cHBlclNvdXJjZSgpLCAwLjA2KSB9O1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBsb3cgPSB0aGlzLmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8PSBsb3cud2lkdGggKyA2KSB7XG4gICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogbG93LnR4LCBkejogbG93LnR6LCBzcGVlZDogMC4zNSArIDAuMjUgKiBzbW9vdGhzdGVwKGxvdy53aWR0aCArIDYsIDAsIGxvdy5kKSB9O1xuICAgIH1cbiAgICBjb25zdCBsZCA9IE1hdGguaHlwb3QoKHggLSB0aGlzLmxha2UueCkgLyB0aGlzLmxha2UucngsICh6IC0gdGhpcy5sYWtlLnopIC8gdGhpcy5sYWtlLnJ6KTtcbiAgICBpZiAobGQgPCAxLjM1KSB7XG4gICAgICAvLyBTbG93IGRyaWZ0IGZyb20gdGhlIGluZmxvdyB0b3dhcmQgdGhlIG91dGZsb3cgYXQgdGhlIGhlYWQgb2YgdGhlIGxvd2VyIHJpdmVyLlxuICAgICAgY29uc3QgaGVhZCA9IHRoaXMubG93ZXIucG9pbnRzW3RoaXMubG93ZXIucG9pbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZHJpZnQgPSB0b3dhcmRzKHgsIHosIGhlYWQsIDAuMDgpO1xuICAgICAgcmV0dXJuIHsgYm9keTogJ2xha2UnLCAuLi5kcmlmdCB9O1xuICAgIH1cbiAgICByZXR1cm4geyBib2R5OiAnc2VhJywgZHg6IDAsIGR6OiAwLCBzcGVlZDogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSB1cHBlclNvdXJjZSgpOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0ge1xuICAgIGNvbnN0IHB0cyA9IHRoaXMudXBwZXIhLnBvaW50cztcbiAgICByZXR1cm4gcHRzW3B0cy5sZW5ndGggLSAxXTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b3dhcmRzKHg6IG51bWJlciwgejogbnVtYmVyLCBwOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0sIHNwZWVkOiBudW1iZXIpIHtcbiAgY29uc3QgZHggPSBwLnggLSB4LCBkeiA9IHAueiAtIHo7XG4gIGNvbnN0IGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KSB8fCAxO1xuICByZXR1cm4geyBkeDogZHggLyBsZW4sIGR6OiBkeiAvIGxlbiwgc3BlZWQgfTtcbn1cblxuLyoqIEZpbmQgdGhlIHZhbGxleSBsYWtlIGZyb20gdGhlIHRlcnJhaW4gaXRzZWxmOiB0aGUgZGVlcCBiYXNpbiBOVyBvZiB0aGUgZm91bmRlciB2YWxsZXkuICovXG5mdW5jdGlvbiBsb2NhdGVMYWtlKGg6IEhlaWdodFNhbXBsZXIpOiBIeWRyb2xvZ3lbJ2xha2UnXSB7XG4gIGxldCBzeCA9IDAsIHN6ID0gMCwgbiA9IDAsIG1pblggPSBJbmZpbml0eSwgbWF4WCA9IC1JbmZpbml0eSwgbWluWiA9IEluZmluaXR5LCBtYXhaID0gLUluZmluaXR5O1xuICBmb3IgKGxldCB6ID0gLTQ2MDsgeiA8PSAtMTIwOyB6ICs9IDQpIHtcbiAgICBmb3IgKGxldCB4ID0gLTQ4MDsgeCA8PSAtNDA7IHggKz0gNCkge1xuICAgICAgaWYgKGgoeCwgeikgPiAtNCkgY29udGludWU7XG4gICAgICBzeCArPSB4OyBzeiArPSB6OyBuKys7XG4gICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgeCk7IG1heFggPSBNYXRoLm1heChtYXhYLCB4KTtcbiAgICAgIG1pblogPSBNYXRoLm1pbihtaW5aLCB6KTsgbWF4WiA9IE1hdGgubWF4KG1heFosIHopO1xuICAgIH1cbiAgfVxuICBpZiAobiA9PT0gMCkgcmV0dXJuIHsgeDogLTI2MCwgejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH07XG4gIHJldHVybiB7XG4gICAgeDogc3ggLyBuLCB6OiBzeiAvIG4sXG4gICAgcng6IE1hdGgubWF4KDMwLCAobWF4WCAtIG1pblgpIC8gMiArIDEwKSwgcno6IE1hdGgubWF4KDMwLCAobWF4WiAtIG1pblopIC8gMiArIDEwKSxcbiAgfTtcbn1cblxuLyoqXG4gKiBUcmFjZSB0aGUgY2FydmVkIGxvd2xhbmQgY2hhbm5lbCBmcm9tIHRoZSBsYWtlIG91dGZsb3cgc291dGggdG8gdGhlIHNlYS4gRm9yXG4gKiBlYWNoIDQgbSByb3cgdGhlIGNoYW5uZWwgaXMgdGhlIGxvd2VzdCBjb2x1bW4gbmVhciB0aGUgcHJldmlvdXMgY2VudHJlOyB0aGVcbiAqIHRyYWNlIGlzIHNtb290aGVkIHNvIHRoZSBmbG93IGZpZWxkIGRvZXMgbm90IGppdHRlciB3aXRoIHRoZSAxIG0gdm94ZWxzLlxuICovXG5mdW5jdGlvbiB0cmFjZUxvd2VyUml2ZXIoaDogSGVpZ2h0U2FtcGxlciwgbGFrZTogSHlkcm9sb2d5WydsYWtlJ10pOiBSaXZlclJlYWNoIHtcbiAgY29uc3QgcmF3OiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGxldCBjeCA9IGxha2UueCArIGxha2UucnggKiAwLjU1O1xuICBsZXQgeiA9IE1hdGgucm91bmQobGFrZS56ICsgbGFrZS5yeiAqIDAuNik7XG4gIC8vIFN0YXJ0IGF0IHRoZSBsYWtlJ3Mgc291dGgtZWFzdCBvdXRmbG93IGFuZCBmb2xsb3cgdGhlIGNoYW5uZWwgZG93bnN0cmVhbS5cbiAgZm9yICg7IHogPD0gOTAwOyB6ICs9IDQpIHtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBieCA9IGN4O1xuICAgIGZvciAobGV0IHggPSBNYXRoLnJvdW5kKGN4IC0gNDApOyB4IDw9IGN4ICsgNDA7IHggKz0gMikge1xuICAgICAgY29uc3QgdiA9IGgoeCwgeikgKyBNYXRoLmFicyh4IC0gY3gpICogMC4wMjtcbiAgICAgIGlmICh2IDwgYmVzdCkgeyBiZXN0ID0gdjsgYnggPSB4OyB9XG4gICAgfVxuICAgIGN4ID0gYng7XG4gICAgcmF3LnB1c2goeyB4OiBieCwgeiB9KTtcbiAgICAvLyBUaGUgdHJhY2UgZW5kcyBvbmNlIGl0IHJlYWNoZXMgb3BlbiBzZWEgZm9yIGEgc3VzdGFpbmVkIHN0cmV0Y2guXG4gICAgaWYgKGJlc3QgPCAtNiAmJiByYXcubGVuZ3RoID4gMjAgJiYgaChieCwgeiArIDgpIDwgLTYgJiYgaChieCwgeiArIDE2KSA8IC02KSBicmVhaztcbiAgfVxuICBjb25zdCBzbW9vdGggPSByYXcubWFwKChwLCBpKSA9PiB7XG4gICAgbGV0IHN4ID0gMCwgbiA9IDA7XG4gICAgZm9yIChsZXQgayA9IE1hdGgubWF4KDAsIGkgLSA0KTsgayA8PSBNYXRoLm1pbihyYXcubGVuZ3RoIC0gMSwgaSArIDQpOyBrKyspIHsgc3ggKz0gcmF3W2tdLng7IG4rKzsgfVxuICAgIHJldHVybiB7IHg6IHN4IC8gbiwgejogcC56IH07XG4gIH0pO1xuICAvLyBTdG9yZSBkb3duc3RyZWFtLWZpcnN0OiBpbmRleCAwIGlzIHRoZSBzZWEgbW91dGguXG4gIHNtb290aC5yZXZlcnNlKCk7XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gW107XG4gIGxldCBzID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzbW9vdGgubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaSA+IDApIHMgKz0gTWF0aC5oeXBvdChzbW9vdGhbaV0ueCAtIHNtb290aFtpIC0gMV0ueCwgc21vb3RoW2ldLnogLSBzbW9vdGhbaSAtIDFdLnopO1xuICAgIHBvaW50cy5wdXNoKHsgeDogc21vb3RoW2ldLngsIHo6IHNtb290aFtpXS56LCBzLCBsZXZlbDogMCwgd2lkdGg6IDYgfSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBSaXZlclJlYWNoKHBvaW50cywgNDApO1xufVxuXG4vKiogV2F0ZXItc3VyZmFjZSBkcm9wcyBhbG9uZyB0aGUgdXBwZXIgcml2ZXIsIGFzIChmcmFjdGlvbiBvZiBsZW5ndGgsIG1ldHJlcykuICovXG5jb25zdCBGQUxMUzogUmVhZG9ubHlBcnJheTxyZWFkb25seSBbbnVtYmVyLCBudW1iZXJdPiA9IFtbMC4yLCA3XSwgWzAuNDgsIDExXSwgWzAuNzQsIDEzXV07XG5jb25zdCBVUFBFUl9HUkFESUVOVCA9IDAuMDM7XG5cbi8qKlxuICogQXV0aG9yIHRoZSB2MiBtb3VudGFpbiByaXZlcjogYSBzZWVkZWQgbWVhbmRlcmluZyBjZW50cmVsaW5lIGZyb20gdGhlIGxha2Unc1xuICogbm9ydGggc2hvcmUgdG8gYSBoaWdobGFuZCB0YXJuLCB3aXRoIGEgbGV2ZWwgcHJvZmlsZSB0aGF0IG9ubHkgcmlzZXNcbiAqIHVwc3RyZWFtIChnZW50bGUgZ3JhZGllbnQgcGx1cyB0aHJlZSBjYXNjYWRlcykuXG4gKi9cbmZ1bmN0aW9uIGF1dGhvclVwcGVyUml2ZXIoc2VlZDogbnVtYmVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IHtcbiAgcmVhY2g6IFJpdmVyUmVhY2g7IHRhcm46IE5vbk51bGxhYmxlPEh5ZHJvbG9neVsndGFybiddPjtcbn0ge1xuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChzZWVkIF4gMHg1ZWVkMikgPj4+IDApO1xuICBjb25zdCBqID0gKGE6IG51bWJlcikgPT4gKHJuZCgpIC0gMC41KSAqIDIgKiBhO1xuICBjb25zdCBtb3V0aCA9IHsgeDogbGFrZS54ICsgbGFrZS5yeCAqIDAuMSwgejogbGFrZS56IC0gbGFrZS5yeiAqIDAuNTUgfTtcbiAgY29uc3QgY29udHJvbHMgPSBbXG4gICAgbW91dGgsXG4gICAgeyB4OiBsYWtlLnggKyAyMCArIGooMjApLCB6OiAtNDEwICsgaigxNSkgfSxcbiAgICB7IHg6IC0xOTAgKyBqKDM1KSwgejogLTUyMCArIGooMjApIH0sXG4gICAgeyB4OiAtMjE1ICsgaigzNSksIHo6IC02NDAgKyBqKDIwKSB9LFxuICAgIHsgeDogLTE2NSArIGooMzApLCB6OiAtNzcwICsgaigxNSkgfSxcbiAgXTtcbiAgLy8gQ2F0bXVsbC1Sb20gdGhyb3VnaCB0aGUgY29udHJvbHMsIHRoZW4gcmVzYW1wbGUgYXQgfjggbSBzcGFjaW5nIHdpdGggYVxuICAvLyBzbWFsbCBzZWVkZWQgbWVhbmRlciBzbyB0aGUgY2hhbm5lbCBpcyBub3QgYSBzbW9vdGggc3BsaW5lLlxuICBjb25zdCBkZW5zZTogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbnRyb2xzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGNvbnN0IHAwID0gY29udHJvbHNbTWF0aC5tYXgoMCwgaSAtIDEpXSwgcDEgPSBjb250cm9sc1tpXTtcbiAgICBjb25zdCBwMiA9IGNvbnRyb2xzW2kgKyAxXSwgcDMgPSBjb250cm9sc1tNYXRoLm1pbihjb250cm9scy5sZW5ndGggLSAxLCBpICsgMildO1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgMjQ7IGsrKykge1xuICAgICAgY29uc3QgdCA9IGsgLyAyNCwgdDIgPSB0ICogdCwgdDMgPSB0MiAqIHQ7XG4gICAgICBkZW5zZS5wdXNoKHtcbiAgICAgICAgeDogMC41ICogKDIgKiBwMS54ICsgKC1wMC54ICsgcDIueCkgKiB0ICsgKDIgKiBwMC54IC0gNSAqIHAxLnggKyA0ICogcDIueCAtIHAzLngpICogdDJcbiAgICAgICAgICArICgtcDAueCArIDMgKiBwMS54IC0gMyAqIHAyLnggKyBwMy54KSAqIHQzKSxcbiAgICAgICAgejogMC41ICogKDIgKiBwMS56ICsgKC1wMC56ICsgcDIueikgKiB0ICsgKDIgKiBwMC56IC0gNSAqIHAxLnogKyA0ICogcDIueiAtIHAzLnopICogdDJcbiAgICAgICAgICArICgtcDAueiArIDMgKiBwMS56IC0gMyAqIHAyLnogKyBwMy56KSAqIHQzKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBkZW5zZS5wdXNoKGNvbnRyb2xzW2NvbnRyb2xzLmxlbmd0aCAtIDFdKTtcbiAgY29uc3QgcmVzYW1wbGVkOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyOyBzOiBudW1iZXIgfT4gPSBbeyAuLi5kZW5zZVswXSwgczogMCB9XTtcbiAgbGV0IGFjYyA9IDAsIHMgPSAwO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGRlbnNlLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgc3RlcCA9IE1hdGguaHlwb3QoZGVuc2VbaV0ueCAtIGRlbnNlW2kgLSAxXS54LCBkZW5zZVtpXS56IC0gZGVuc2VbaSAtIDFdLnopO1xuICAgIGFjYyArPSBzdGVwOyBzICs9IHN0ZXA7XG4gICAgaWYgKGFjYyA+PSA4IHx8IGkgPT09IGRlbnNlLmxlbmd0aCAtIDEpIHtcbiAgICAgIGNvbnN0IG0gPSAoZmJtMihzIC8gNjAsIDMuMSwgc2VlZCArIDgwMSwgMikgLSAwLjUpICogMTQ7XG4gICAgICByZXNhbXBsZWQucHVzaCh7IHg6IGRlbnNlW2ldLnggKyBtLCB6OiBkZW5zZVtpXS56LCBzIH0pO1xuICAgICAgYWNjID0gMDtcbiAgICB9XG4gIH1cbiAgY29uc3QgdG90YWwgPSByZXNhbXBsZWRbcmVzYW1wbGVkLmxlbmd0aCAtIDFdLnM7XG4gIGNvbnN0IGxldmVsQXQgPSAoc3Y6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgbGV0IGxldmVsID0gc3YgKiBVUFBFUl9HUkFESUVOVDtcbiAgICBmb3IgKGNvbnN0IFtmcmFjLCBkcm9wXSBvZiBGQUxMUykge1xuICAgICAgLy8gRWFjaCBmYWxsIGlzIGEgc2hvcnQgY2FzY2FkZSBvdmVyIH4xMCBtIG9mIGNoYW5uZWwuXG4gICAgICBsZXZlbCArPSBkcm9wICogc21vb3Roc3RlcCh0b3RhbCAqIGZyYWMgLSA1LCB0b3RhbCAqIGZyYWMgKyA1LCBzdik7XG4gICAgfVxuICAgIC8vIFRoZSBmaXJzdCA0MCBtIGludG8gdGhlIGxha2Ugc3RheXMgYXQgbGFrZSBsZXZlbC5cbiAgICByZXR1cm4gc3YgPCA0MCA/IDAgOiBsZXZlbCAtIDQwICogVVBQRVJfR1JBRElFTlQ7XG4gIH07XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gcmVzYW1wbGVkLm1hcCgocCkgPT4gKHtcbiAgICB4OiBwLngsIHo6IHAueiwgczogcC5zLCBsZXZlbDogTWF0aC5tYXgoMCwgbGV2ZWxBdChwLnMpKSxcbiAgICB3aWR0aDogMy4yICsgMi4yICogZmJtMihwLnMgLyA3MCwgOS43LCBzZWVkICsgODAyLCAyKSArICgxIC0gcC5zIC8gdG90YWwpICogMS41LFxuICB9KSk7XG4gIGNvbnN0IHNvdXJjZSA9IHBvaW50c1twb2ludHMubGVuZ3RoIC0gMV07XG4gIHJldHVybiB7XG4gICAgcmVhY2g6IG5ldyBSaXZlclJlYWNoKHBvaW50cywgMTEwKSxcbiAgICB0YXJuOiB7IHg6IHNvdXJjZS54LCB6OiBzb3VyY2UueiwgcjogMTgsIGxldmVsOiBzb3VyY2UubGV2ZWwgfSxcbiAgfTtcbn1cbiIsICIvLyBWb3hlbCBtYXRlcmlhbCBpZHMuIFB1cmUgZGF0YSBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIgKEQtMDA1KS5cbi8vIElkcyBhcmUgcGVyc2lzdGVkIGluIHNuYXBzaG90IGVkaXRzLCBzbyBleGlzdGluZyB2YWx1ZXMgbXVzdCBuZXZlciBjaGFuZ2UuXG5leHBvcnQgY29uc3QgTUFUID0ge1xuICBBSVI6IDAsXG4gIEdSQVNTOiAxLFxuICBTT0lMOiAyLFxuICBTQU5EOiAzLFxuICBHUkFWRUw6IDQsXG4gIFNUT05FOiA1LFxuICBPUkU6IDYsXG4gIFdBVEVSOiA3LFxuICBCRURST0NLOiA4LFxuICBNT1NTOiA5LFxuICAvKiogR2VuZXJhdG9yIHYyIGhpZ2hsYW5kcy4gTmV2ZXIgcHJvZHVjZWQgYnkgZ2VuZXJhdG9yIHYxLiAqL1xuICBTTk9XOiAxMCxcbn0gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBNYXRJZCA9ICh0eXBlb2YgTUFUKVtrZXlvZiB0eXBlb2YgTUFUXTtcblxuZXhwb3J0IGNvbnN0IGlzU29saWQgPSAobTogbnVtYmVyKTogYm9vbGVhbiA9PiBtICE9PSBNQVQuQUlSICYmIG0gIT09IE1BVC5XQVRFUjtcbmV4cG9ydCBjb25zdCBpc09wYXF1ZSA9IGlzU29saWQ7XG5cbi8qKiBIaWdoZXN0IG1hdGVyaWFsIGlkIHRoYXQgbWF5IGFwcGVhciBpbiBhIHZveGVsIGVkaXQuICovXG5leHBvcnQgY29uc3QgTUFYX01BVF9JRCA9IDEwO1xuIiwgIi8vIFRlcnJhaW4gZ2VuZXJhdG9yIHYyIFx1MjAxNCB0aGUgdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSAocHVyZSBUUywgRC0wMDUpLlxuLy9cbi8vIENvbXBhdGliaWxpdHkgY29udHJhY3Q6IGluc2lkZSB0aGUgZm91bmRlciBjb3JyaWRvciAodGhlIHNldHRsZW1lbnQgdmFsbGV5LFxuLy8gdGhlIGxha2UgYW5kIHRoZSBsb3dsYW5kIHJpdmVyKSB2MiBoZWlnaHRzIGVxdWFsIHYxIGV4YWN0bHksIHNvIHRoZSBwaW5uZWRcbi8vIGZvdW5kZXIgcHJvamVjdHMsIHRoZWlyIHByZXBhcmF0aW9uIHRhcmdldHMgYW5kIG5hdHVyYWwgZW50aXRpZXMgdGhlcmUgYXJlXG4vLyB1bmNoYW5nZWQuIE91dHNpZGUgaXQgdjIgYWRkczpcbi8vICAgLSBhIG5vcnRoZXJuIG1hc3NpZiBvbiBhbiBleHRlbmRlZCBpc2xhbmQsIHdpdGggc25vdyBhYm92ZSB0aGUgc25vd2xpbmU7XG4vLyAgIC0gZmxhbmtpbmcgcmFuZ2VzIHdlc3QgYW5kIGVhc3Qgb2YgdGhlIHZhbGxleSwgdGVycmFjZWQgaW50byBjbGlmZiBiYW5kcztcbi8vICAgLSBhIG1vdW50YWluIHJpdmVyIGNhcnZlZCBpbnRvIHRoZSBtYXNzaWYgZnJvbSBhIHRhcm4gZG93biB0byB0aGUgbGFrZSxcbi8vICAgICB3aG9zZSB3YXRlciBzdXJmYWNlIGNvbWVzIGZyb20gSHlkcm9sb2d5IGFuZCBuZXZlciByaXNlcyBkb3duc3RyZWFtO1xuLy8gICAtIGEgY29udGludW91cyBsb3dsYW5kIGNoYW5uZWwgKHYxIGhhcyBhIGRyeSBmb3JkIHNvdXRoIG9mIHRoZSBzaGVsZikuXG4vLyBIZWlnaHRzIGFyZSBpbnRlZ2VycyBpbiBbLTE0LCAxMDRdLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIGxlcnAsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7IE1BVCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5cbmV4cG9ydCBjb25zdCBWMl9TTk9XTElORSA9IDc0O1xuZXhwb3J0IGNvbnN0IFYyX01BWF9IRUlHSFQgPSAxMDQ7XG5cbmV4cG9ydCB0eXBlIFYxSGVpZ2h0ID0gKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IG51bWJlcjtcblxuZXhwb3J0IGludGVyZmFjZSBWMkNvbHVtbiB7XG4gIC8qKiBUb3Agc29saWQgeSArIDEgKHNhbWUgY29udmVudGlvbiBhcyBzdXJmYWNlSGVpZ2h0QXQpLiAqL1xuICBoOiBudW1iZXI7XG4gIC8qKiBXYXRlciBzdXJmYWNlIGZvciB0aGlzIGNvbHVtbjogY2VsbHMgW2gsIGxldmVsKSBob2xkIHdhdGVyLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogVHJ1ZSB3aGVuIHRoaXMgY29sdW1uIGlzIHBhcnQgb2YgdGhlIGNhcnZlZCBtb3VudGFpbi1yaXZlciBjaGFubmVsLiAqL1xuICBjaGFubmVsOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgVGVycmFpblYyIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcmVhZG9ubHkgc2VlZDogbnVtYmVyLFxuICAgIHByaXZhdGUgcmVhZG9ubHkgdjE6IFYxSGVpZ2h0LFxuICAgIHJlYWRvbmx5IGh5ZHJvbG9neTogSHlkcm9sb2d5LFxuICApIHt9XG5cbiAgLyoqIDAgPSBleGFjdGx5IHYxIChmb3VuZGVyIGNvcnJpZG9yKTsgMSA9IGZ1bGwgdjIgcmVsaWVmLiAqL1xuICByZWxpZWZNYXNrKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTM5MCwgLTQ3MCwgeik7XG4gICAgLy8gVGhlIHdlc3QgcmFuZ2Uga2VlcHMgY2xlYXIgb2YgdGhlIGxha2UgYmFzaW4gdW50aWwgdGhlIGxha2UgaXMgcGFzc2VkLlxuICAgIGNvbnN0IHdlc3RFZGdlID0gbGVycCgtNDUwLCAtMzIwLCBzbW9vdGhzdGVwKC0yMjAsIC0xNDAsIHopKTtcbiAgICBjb25zdCB3ZXN0ID0gc21vb3Roc3RlcCh3ZXN0RWRnZSwgd2VzdEVkZ2UgLSA5MCwgeCk7XG4gICAgY29uc3QgZWFzdCA9IHNtb290aHN0ZXAoMjMwLCAzMzAsIHgpO1xuICAgIHJldHVybiBNYXRoLm1heChub3J0aCwgd2VzdCwgZWFzdCk7XG4gIH1cblxuICAvKiogMCBhdCB0aGUgcmFuZ2UgZnJvbnQsIDEgZGVlcCBpbnNpZGU6IGZvb3RoaWxscyBmaXJzdCwgcGVha3MgYmVoaW5kLiAqL1xuICByYW5nZURlcHRoKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTQyMCwgLTcwMCwgeik7XG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlIC0gNDAsIHdlc3RFZGdlIC0gMzAwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyNzAsIDU2MCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFYyQ29sdW1uIHtcbiAgICBjb25zdCBzZWVkID0gdGhpcy5zZWVkO1xuICAgIGNvbnN0IGJhc2UgPSB0aGlzLnYxKHNlZWQsIHgsIHopO1xuICAgIGNvbnN0IG1hc2sgPSB0aGlzLnJlbGllZk1hc2soeCwgeik7XG4gICAgbGV0IGggPSBiYXNlO1xuXG4gICAgaWYgKG1hc2sgPiAwKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGlzbGFuZCBub3J0aCBzbyB0aGUgbWFzc2lmIGhhcyByb29tICh2MSBjb2FzdCBpcyB+eiAtNjAwKS5cbiAgICAgIGNvbnN0IG5vcnRoTGFuZCA9IHNtb290aHN0ZXAoLTQyMCwgLTUyMCwgeik7XG4gICAgICBjb25zdCBzaG9yZSA9IDEgLSBNYXRoLmh5cG90KCh4ICsgMTUwKSAvIDU2MCwgKHogKyA2OTApIC8gMzAwKVxuICAgICAgICArIChmYm0yKHggLyAxNjAsIHogLyAxNjAsIHNlZWQgKyA3MDEsIDMpIC0gMC41KSAqIDAuMztcbiAgICAgIGNvbnN0IGxhbmROID0gc21vb3Roc3RlcCgwLjAsIDAuMTQsIHNob3JlKSAqIG5vcnRoTGFuZDtcbiAgICAgIGNvbnN0IGdyb3VuZCA9IGxlcnAoYmFzZSwgTWF0aC5tYXgoYmFzZSwgNSArIDUgKiBmYm0yKHggLyA5MCwgeiAvIDkwLCBzZWVkICsgNzAyLCAyKSksIGxhbmROKTtcblxuICAgICAgLy8gUmlkZ2VkIG1hc3NpZiB3aXRoIHRlcnJhY2VkIGNsaWZmIGJhbmRzLlxuICAgICAgY29uc3Qgd3ggPSB4ICsgKGZibTIoeCAvIDI2MCwgeiAvIDI2MCwgc2VlZCArIDcwMywgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3Qgd3ogPSB6ICsgKGZibTIoeCAvIDI2MCArIDUuMSwgeiAvIDI2MCAtIDIuNywgc2VlZCArIDcwNCwgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3QgcjEgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMTAsIHd6IC8gMjEwLCBzZWVkICsgNzA1LCA0KSAtIDEpO1xuICAgICAgY29uc3QgcjIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4MCwgd3ogLyA4MCwgc2VlZCArIDcwNiwgMykgLSAxKTtcbiAgICAgIGNvbnN0IGx1bXAgPSBmYm0yKHd4IC8gMTIwLCB3eiAvIDEyMCwgc2VlZCArIDcwNywgMyk7XG4gICAgICBjb25zdCBkZXB0aCA9IHRoaXMucmFuZ2VEZXB0aCh4LCB6KTtcbiAgICAgIGxldCBtb3VudGFpbiA9IDE2ICsgKDggKyA4MCAqIGRlcHRoKSAqICgwLjU1ICogcjEgKiByMSArIDAuMjggKiByMiArIDAuMTcgKiBsdW1wKVxuICAgICAgICArIDE4ICogZGVwdGggKiBzbW9vdGhzdGVwKDAuNTUsIDAuOSwgcjEpO1xuICAgICAgY29uc3QgYmFuZCA9IDYgKyAyICogZmJtMih4IC8gMTQwLCB6IC8gMTQwLCBzZWVkICsgNzA4LCAyKTtcbiAgICAgIGNvbnN0IHQgPSBNYXRoLmZsb29yKG1vdW50YWluIC8gYmFuZCk7XG4gICAgICBjb25zdCBmcmFjID0gbW91bnRhaW4gLyBiYW5kIC0gdDtcbiAgICAgIG1vdW50YWluID0gKHQgKyBzbW9vdGhzdGVwKDAuNSwgMC44LCBmcmFjKSkgKiBiYW5kO1xuXG4gICAgICAvLyBPbmx5IGxhbmQgcmlzZXM7IHRoZSBzZWEgc3RheXMgc2VhLCBzbyByYW5nZXMgZW5kIGluIGNvYXN0YWwgY2xpZmZzLlxuICAgICAgY29uc3QgbGFuZEZhY3RvciA9IHNtb290aHN0ZXAoLTIsIDgsIGdyb3VuZCk7XG4gICAgICBoID0gbGVycChncm91bmQsIE1hdGgubWF4KGdyb3VuZCwgbW91bnRhaW4pLCBtYXNrICogbGFuZEZhY3Rvcik7XG4gICAgfVxuXG4gICAgbGV0IGxldmVsID0gaCA8IDAgPyAwIDogLUluZmluaXR5O1xuICAgIGxldCBjaGFubmVsID0gZmFsc2U7XG5cbiAgICAvLyBNb3VudGFpbiByaXZlcjogdmFsbGV5IGZsb29yLCBiYW5rcyBhbmQgY2hhbm5lbCBmb2xsb3cgdGhlIHdhdGVyIGxldmVsLlxuICAgIGNvbnN0IHVwcGVyID0gdGhpcy5oeWRyb2xvZ3kudXBwZXI7XG4gICAgaWYgKHVwcGVyKSB7XG4gICAgICBjb25zdCBoaXQgPSB1cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICBjb25zdCByYWlzZWQgPSBoaXQubGV2ZWwgPiAwLjI1O1xuICAgICAgICBjb25zdCB2dyA9IDU1ICsgMjggKiBmYm0yKGhpdC5zIC8gOTAsIDEuNywgc2VlZCArIDcwOSwgMik7XG4gICAgICAgIGNvbnN0IGZsb29yID0gaGl0LmxldmVsICsgMS41ICsgMi4yICogZmJtMih4IC8gNDAsIHogLyA0MCwgc2VlZCArIDcxMCwgMikgKyBoaXQuZCAqIDAuMDY7XG4gICAgICAgIGNvbnN0IHQgPSBzbW9vdGhzdGVwKHZ3ICogMC4zLCB2dywgaGl0LmQpO1xuICAgICAgICBoID0gTWF0aC5taW4oaCwgbGVycChmbG9vciwgaCwgdCkpO1xuICAgICAgICBjb25zdCB3ID0gaGl0LndpZHRoO1xuICAgICAgICBpZiAocmFpc2VkICYmIGhpdC5kIDwgdyArIDMpIHtcbiAgICAgICAgICAvLyBCYW5rcyBob2xkIGEgcmFpc2VkIHJpdmVyOiBuZXZlciBiZWxvdyBpdHMgd2F0ZXIgc3VyZmFjZS4gQXQgbGFrZVxuICAgICAgICAgIC8vIGxldmVsIHRoZSBzZWEtbGV2ZWwgZmlsbCBhbHJlYWR5IGNvbnRhaW5zIHRoZSB3YXRlci5cbiAgICAgICAgICBoID0gTWF0aC5tYXgoaCwgTWF0aC5jZWlsKGhpdC5sZXZlbCkgKyAxKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaGl0LmQgPCB3KSB7XG4gICAgICAgICAgY29uc3QgYmVkID0gaGl0LmxldmVsIC0gKDEuMiArIDEuMyAqICgxIC0gaGl0LmQgLyB3KSk7XG4gICAgICAgICAgaCA9IE1hdGgubWluKGgsIGJlZCk7XG4gICAgICAgICAgaWYgKHJhaXNlZCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZChoaXQubGV2ZWwpKTtcbiAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgdGFybiA9IHRoaXMuaHlkcm9sb2d5LnRhcm47XG4gICAgICBpZiAodGFybikge1xuICAgICAgICBjb25zdCB0ZCA9IE1hdGguaHlwb3QoeCAtIHRhcm4ueCwgeiAtIHRhcm4ueilcbiAgICAgICAgICAqICgxICsgMC4yICogKGZibTIoeCAvIDMwLCB6IC8gMzAsIHNlZWQgKyA3MTEsIDIpIC0gMC41KSk7XG4gICAgICAgIGlmICh0ZCA8IHRhcm4uciArIDYpIHtcbiAgICAgICAgICBjb25zdCByaW0gPSBNYXRoLmNlaWwodGFybi5sZXZlbCkgKyAxO1xuICAgICAgICAgIGlmICh0ZCA+PSB0YXJuLnIpIGggPSBNYXRoLm1heChoLCByaW0pO1xuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaCA9IE1hdGgubWluKE1hdGgubWF4KGgsIHJpbSksIHRhcm4ubGV2ZWwgLSAxIC0gMyAqIHNtb290aHN0ZXAodGFybi5yLCAwLCB0ZCkpO1xuICAgICAgICAgICAgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZCh0YXJuLmxldmVsKSk7XG4gICAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBMb3dsYW5kIGNoYW5uZWwgY29udGludWl0eTogdjEgbGVhdmVzIGEgZHJ5IGZvcmQgd2hlcmUgdGhlIHNoZWxmIG1lZXRzIHRoZSByaXZlci5cbiAgICBjb25zdCBsb3cgPSB0aGlzLmh5ZHJvbG9neS5sb3dlci5uZWFyZXN0KHgsIHopO1xuICAgIGlmIChsb3cgJiYgbG93LmQgPCAyLjUgJiYgaCA+PSAwICYmIGJhc2UgPCA0KSBoID0gLTE7XG5cbiAgICBoID0gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIFYyX01BWF9IRUlHSFQpKTtcbiAgICBpZiAoaCA8IDApIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIDApO1xuICAgIHJldHVybiB7IGgsIGxldmVsOiBsZXZlbCA9PT0gLUluZmluaXR5ID8gaCA6IGxldmVsLCBjaGFubmVsIH07XG4gIH1cblxuICBoZWlnaHQoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmNvbHVtbih4LCB6KS5oO1xuICB9XG5cbiAgLyoqIHYyIHRvcCBtYXRlcmlhbC4gRmFsbHMgYmFjayB0byB0aGUgdjEgcnVsZXMgZm9yIHRoZSB1bmNoYW5nZWQgY29ycmlkb3IuICovXG4gIHRvcE1hdGVyaWFsKFxuICAgIHg6IG51bWJlciwgejogbnVtYmVyLCBjb2w6IFYyQ29sdW1uLCBzbG9wZTogbnVtYmVyLFxuICAgIHYxVG9wOiAoaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyKSA9PiBNYXRJZCxcbiAgKTogTWF0SWQge1xuICAgIGNvbnN0IGggPSBjb2wuaDtcbiAgICBpZiAoY29sLmNoYW5uZWwgJiYgY29sLmxldmVsID4gaCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIgJiYgaCA+IDEpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDwgaGl0LndpZHRoICsgMi41ICYmIGhpdC5sZXZlbCA+IDAuMjUpIHtcbiAgICAgICAgcmV0dXJuIGZibTIoeCAvIDYsIHogLyA2LCB0aGlzLnNlZWQgKyA3MTIsIDEpID4gMC41ID8gTUFULkdSQVZFTCA6IE1BVC5TQU5EO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzbm93bGluZSA9IFYyX1NOT1dMSU5FICsgKGZibTIoeCAvIDcwLCB6IC8gNzAsIHRoaXMuc2VlZCArIDcxMywgMykgLSAwLjUpICogMTY7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgJiYgc2xvcGUgPD0gMykgcmV0dXJuIE1BVC5TTk9XO1xuICAgIGlmIChoID49IHNub3dsaW5lIC0gNiAmJiBzbG9wZSA8PSAxICYmIGZibTIoeCAvIDIwLCB6IC8gMjAsIHRoaXMuc2VlZCArIDcxNCwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKHRoaXMucmVsaWVmTWFzayh4LCB6KSA+IDAuNSAmJiBoID4gMzAgJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgICByZXR1cm4gdjFUb3AoaCwgc2xvcGUpO1xuICB9XG59XG4iLCAiLy8gU2ltdWxhdGlvbiBsYXllciBcdTIwMTQgcHVyZSBUeXBlU2NyaXB0LCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMSB3b3JsZCBmb3VuZGF0aW9uOiBhIGNodW5rZWQsIGdlbnVpbmVseSB0aHJlZS1kaW1lbnNpb25hbCB2b3hlbCB3b3JsZC5cbi8vIFRoZSBzdG9yZWQgc3RhdGUgaXMgb25lIG1hdGVyaWFsIGJ5dGUgcGVyIGNlbGwgKDAgPSBhaXIpOyBvY2N1cGFuY3kgaXNcbi8vIGltcGxpY2l0LiBTdXJmYWNlIGhlaWdodCBpcyBhIGRlcml2ZWQgcXVlcnksIG5vdCB0aGUgc3RvcmFnZS4gVGhpcyByZXBsYWNlc1xuLy8gdGhlIGZvcm1lciAyNTYgeCAyNTYgaGVpZ2h0ZmllbGQgKHNlZSBJUi0wMDUpLlxuLy9cbi8vIFdvcmxkIG1ldHJlczogeC96IGluIFstMTAyNCwgMTAyNCksIHkgaW4gWy0xNiwgMTEyKSwgc2VhIGxldmVsIDAuXG4vLyBBIGNodW5rIGlzIDMyIHggMzIgeCAxMjggY2VsbHMuIEdlbmVyYXRpb24gaXMgYSBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkLFxuLy8gZ2VuZXJhdG9yIHZlcnNpb24sIHBhcmFtZXRlcnMgYW5kIGNodW5rIGNvb3JkaW5hdGVzOyBlZGl0cyBhcmUgcmVjb3JkZWRcbi8vIHNlcGFyYXRlbHkgYW5kIHJlLWFwcGxpZWQgd2hlbiBhIGNodW5rIGlzIHJlZ2VuZXJhdGVkLlxuaW1wb3J0IHR5cGUgeyBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBMaWZlU3RhdGUgfSBmcm9tICcuL2Vjb25vbXknO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcbmltcG9ydCB7IFRlcnJhaW5WMiwgVjJDb2x1bW4gfSBmcm9tICcuL3RlcnJhaW4tdjInO1xuXG5leHBvcnQgY29uc3QgV09STERfU0laRSA9IDIwNDg7XG5leHBvcnQgY29uc3QgSEFMRiA9IFdPUkxEX1NJWkUgLyAyO1xuZXhwb3J0IGNvbnN0IENIVU5LX1NJWkUgPSAzMjtcbmV4cG9ydCBjb25zdCBDSFVOS1NfUEVSX1NJREUgPSBXT1JMRF9TSVpFIC8gQ0hVTktfU0laRTtcbmV4cG9ydCBjb25zdCBZX01JTiA9IC0xNjtcbmV4cG9ydCBjb25zdCBZX01BWCA9IDExMjtcbmV4cG9ydCBjb25zdCBXT1JMRF9IRUlHSFQgPSBZX01BWCAtIFlfTUlOO1xuZXhwb3J0IGNvbnN0IFNFQV9MRVZFTCA9IDA7XG5leHBvcnQgY29uc3QgV0FURVIgPSBTRUFfTEVWRUw7XG4vKiogR2VuZXJhdG9yIHYxOiB0aGUgb3JpZ2luYWwgMjA0OCBtIGlzbGFuZC4gRGVmYXVsdCBmb3IgY3JlYXRlV29ybGQgYW5kIGFsbCBsZWdhY3kgc2F2ZXMuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1ZFUlNJT04gPSAxO1xuLyoqIEdlbmVyYXRvciB2MjogdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSB3aXRoIGEgbW91bnRhaW4gcml2ZXIgKHNlZSB0ZXJyYWluLXYyLnRzKS4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVjIgPSAyO1xuLyoqIFRoZSBnZW5lcmF0b3IgbmV3IGJyb3dzZXIgd29ybGRzIHVzZSBieSBkZWZhdWx0LiAqL1xuZXhwb3J0IGNvbnN0IExBVEVTVF9HRU5FUkFUT1JfVkVSU0lPTiA9IEdFTkVSQVRPUl9WMjtcbmV4cG9ydCBjb25zdCBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TOiByZWFkb25seSBudW1iZXJbXSA9IFtHRU5FUkFUT1JfVkVSU0lPTiwgR0VORVJBVE9SX1YyXTtcbmV4cG9ydCBjb25zdCBpc1N1cHBvcnRlZEdlbmVyYXRvciA9ICh2OiB1bmtub3duKTogdiBpcyBudW1iZXIgPT5cbiAgdHlwZW9mIHYgPT09ICdudW1iZXInICYmIFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlMuaW5jbHVkZXModik7XG5leHBvcnQgY29uc3QgQ0hVTktfVk9MVU1FID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkUgKiBXT1JMRF9IRUlHSFQ7XG5leHBvcnQgY29uc3QgQ0hVTktfQVJFQSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFO1xuXG5leHBvcnQgeyBNQVQsIGlzU29saWQsIGlzT3BhcXVlLCBNQVhfTUFUX0lEIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuZXhwb3J0IHR5cGUgeyBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IE1BVCwgaXNTb2xpZCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5cbmV4cG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgZmJtMixcbn0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQge1xuICBjbGFtcCwgbGVycCwgc21vb3Roc3RlcCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIHZhbHVlTm9pc2UzLCBmYm0yLCBmYm0zLFxufSBmcm9tICcuL25vaXNlJztcblxuLy8gLS0tLS0tLS0tLSB3b3JsZCB0eXBlcyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkUGFyYW1zIHtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEFSQU1TOiBXb3JsZFBhcmFtcyA9IHtcbiAgc2l6ZTogV09STERfU0laRSxcbiAgY2h1bmtTaXplOiBDSFVOS19TSVpFLFxuICB5TWluOiBZX01JTixcbiAgeU1heDogWV9NQVgsXG4gIHNlYUxldmVsOiBTRUFfTEVWRUwsXG4gIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbENodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAga2V5OiBzdHJpbmc7XG4gIC8qKiB4ICsgeiozMiArICh5LVlfTUlOKSoxMDI0ICovXG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3Agc29saWQgeSwgZW5jb2RlZCBhcyAoeSAtIFlfTUlOKSwgMC4uMTI3OyAwIG1lYW5zIG5vIHNvbGlkLiAqL1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICAvKiogdG9wIG1hdGVyaWFsIHBlciBjb2x1bW4uICovXG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG4gIGRpcnR5OiBib29sZWFuO1xuICBnZW5lcmF0ZWRBdDogbnVtYmVyO1xufVxuXG4vLyBOYXR1cmFsIGFzc2V0cyBhcmUgdGhlIHByb2plY3QncyBTdHlsIChgbmF0X2ApIHBpcGVsaW5lIChBUy0wMDEgdjIpLCBub3Rcbi8vIE5veGVsIGFyY2hpdGVjdHVyZS4gTm94ZWwgcmVtYWlucyB0aGUgaHVtYW4tbWFkZSBraXQvd2F5c3RvbmUvbWFya2VyIHN5c3RlbS5cbi8vIFJldGlyZWQgb25seSBhcyB3b3JsZCBjb250ZW50LiBUaGUgbmFtZXMgcmVtYWluIGluIHRoZSBzZXJpYWxpemVkIHR5cGUgc29cbi8vIG9sZCBzbmFwc2hvdHMgYW5kIGFjY2VwdGVkIGhhcnZlc3Qgam91cm5hbHMgY2FuIGJlIG1pZ3JhdGVkIHdpdGhvdXQgcmVqZWN0aW5nXG4vLyBvdGhlcndpc2UgdmFsaWQgc2F2ZXMuIEdlbmVyYXRpb24sIGNvbGxpc2lvbiBhbmQgaW5zcGVjdGlvbiBuZXZlciB1c2UgdGhlbS5cbmV4cG9ydCBjb25zdCBSRVRJUkVEX1NUT05FX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuXSk7XG5leHBvcnQgY29uc3QgaXNSZXRpcmVkU3RvbmVLaW5kID0gKGtpbmQ6IEVudGl0eUtpbmQpOiBib29sZWFuID0+IFJFVElSRURfU1RPTkVfS0lORFMuaGFzKGtpbmQpO1xuZXhwb3J0IHR5cGUgQWN0aXZlRW50aXR5S2luZCA9IEV4Y2x1ZGU8RW50aXR5S2luZCxcbiAgJ3N0eWxfcm9ja19zbWFsbCcgfCAnc3R5bF9yb2NrX21lZGl1bScgfCAnc3R5bF9yb2NrX2xhcmdlJz47XG5cbmZ1bmN0aW9uIGxpdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogRW50aXR5IHwgbnVsbCB7XG4gIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIHJldHVybiAhZW50aXR5IHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpID8gbnVsbCA6IGVudGl0eTtcbn1cblxuZXhwb3J0IHR5cGUgRW50aXR5S2luZCA9XG4gIHwgJ3N0eWxfdHJlZV9zcGlyZSdcbiAgfCAnc3R5bF90cmVlX3RhYmxlJ1xuICB8ICdzdHlsX3RyZWVfY2x1c3RlcidcbiAgfCAnc3R5bF90cmVlX2Jsb3Nzb20nXG4gIHwgJ3N0eWxfc2hydWInXG4gIHwgJ3N0eWxfcm9ja19zbWFsbCdcbiAgfCAnc3R5bF9yb2NrX21lZGl1bSdcbiAgfCAnc3R5bF9yb2NrX2xhcmdlJ1xuICB8ICdzdHlsX29yZSdcbiAgfCAnc3R5bF9jYWlybidcbiAgfCAnd2F5c3RvbmUnXG4gIHwgJ21hcmtlcic7XG5cbmV4cG9ydCB0eXBlIFJlc291cmNlVHlwZSA9ICd3b29kJyB8ICdzdG9uZScgfCAnb3JlJyB8ICdmaWJlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW50aXR5IHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgY2h1bms6IHN0cmluZztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHNjYWxlOiBudW1iZXI7XG4gIHZhcmlhbnQ6IG51bWJlcjtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIHJlbWFpbmluZzogbnVtYmVyO1xuICB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcjtcbiAgLyoqIFRydWUgb25jZSB0aGUgZW50aXR5IGlzIGZ1bGx5IGRlcGxldGVkLiAqL1xuICBoYXJ2ZXN0ZWQ6IGJvb2xlYW47XG4gIC8qKiBUcnVlIGFmdGVyIHRoZSBmaXJzdCBzdWNjZXNzZnVsIGhhcnZlc3QsIGV2ZW4gaWYgeWllbGQgcmVtYWlucy4gKi9cbiAgaGFydmVzdGVkT25jZT86IGJvb2xlYW47XG4gIHByb3Zpc2lvbmFsOiBib29sZWFuO1xuICBhdXRob3JlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3hlbFNpdGUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWdpb25JbmZvIHtcbiAgaWQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdHlwZTogJ3BsYWluJyB8ICdmb3Jlc3QnIHwgJ2hpbGxzJyB8ICdoaWdobGFuZCcgfCAnd2F0ZXInIHwgJ3JpZGdlJztcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgcng6IG51bWJlcjtcbiAgcno6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFN0YXRzIHtcbiAgY2h1bmtzR2VuZXJhdGVkOiBudW1iZXI7XG4gIGNodW5rc0V2aWN0ZWQ6IG51bWJlcjtcbiAgdm94ZWxzRmlsbGVkOiBudW1iZXI7XG4gIGdlbmVyYXRpb25NczogbnVtYmVyO1xuICBlbnRpdGllczogbnVtYmVyO1xuICB0cmVlczogbnVtYmVyO1xuICBwaW5rVHJlZXM6IG51bWJlcjtcbiAgcGlua092ZXJmbG93OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGQge1xuICBzZWVkOiBudW1iZXI7XG4gIHBhcmFtczogV29ybGRQYXJhbXM7XG4gIGNodW5rczogTWFwPHN0cmluZywgVm94ZWxDaHVuaz47XG4gIGVudGl0aWVzOiBNYXA8c3RyaW5nLCBFbnRpdHk+O1xuICBlbnRpdHlDaHVua3M6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPjtcbiAgLyoqIENodW5rcyB3aG9zZSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZW50aXR5IHN0YXRlIGhhcyBiZWVuIGNoYW5nZWQuICovXG4gIGVudGl0eUNoYW5nZXM6IFNldDxzdHJpbmc+O1xuICAvKiogVG9tYnN0b25lcyBmb3IgcmVtb3ZlZCBkZXRlcm1pbmlzdGljIG5hdHVyYWwgZW50aXRpZXMuICovXG4gIGVudGl0eVJlbW92YWxzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIEF1dGhvcml0YXRpdmUgYnVpbHQgc3RydWN0dXJlcyAoaG91c2UsIHBhdGgsIHRlcnJhY2VzLCBjcm9wcykuICovXG4gIHN0cnVjdHVyZXM6IE1hcDxzdHJpbmcsIFN0cnVjdHVyZT47XG4gIHNpdGVzOiBOb3hlbFNpdGVbXTtcbiAgcmVnaW9uczogUmVnaW9uSW5mb1tdO1xuICAvKiogY2h1bmsga2V5IC0+IGxvY2FsIHZveGVsIGluZGV4IC0+IG1hdGVyaWFsLiBEdXJhYmxlLCBjb21wYWN0IGVkaXRzLiAqL1xuICBlZGl0czogTWFwPHN0cmluZywgTWFwPG51bWJlciwgbnVtYmVyPj47XG4gIC8qKiBHbG9iYWwgbG9jYWwtcGxheWVyIGNhcnJpZWQgYmFnOyBib3VuZGVkIGluIHNjaGVtYSAzLCBsZWdhY3kgaW4gMS8yLiAqL1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQcmVzZW50IG9ubHkgYWZ0ZXIgc2NoZW1hLTMgZ2VuZXNpcy9yZXN0b3JhdGlvbi4gKi9cbiAgbGlmZT86IExpZmVTdGF0ZTtcbiAgZGlydHk6IFNldDxzdHJpbmc+O1xuICBzdGF0czogV29ybGRTdGF0cztcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKlxuICAgKiBNb25vdG9uaWMgcmV2aXNpb24gb2YgYXV0aG9yaXRhdGl2ZSBzdGF0ZSAodm94ZWxzIGFuZCBlbnRpdGllcykuIERlcml2ZWRcbiAgICogY2FjaGVzIGtleWVkIG9uIHRoaXMgdmFsdWUgYXJlIGRpc2NhcmRlZCBhZnRlciBhbiBlZGl0OyBtZXNoL25hdmlnYXRpb25cbiAgICogcmV2aXNpb25zIGFyZSBzZXBhcmF0ZSBiZWNhdXNlIHRoZXkgYXJlIGRlcml2ZWQsIG5vdCB3b3JsZCBzdGF0ZS5cbiAgICovXG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBjaHVua0tleSA9IChjeDogbnVtYmVyLCBjejogbnVtYmVyKSA9PiBgJHtjeH0sJHtjen1gO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWCA9IChjeDogbnVtYmVyKSA9PiBjeCAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWiA9IChjejogbnVtYmVyKSA9PiBjeiAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGxvY2FsSW5kZXggPSAobHg6IG51bWJlciwgeUluZGV4OiBudW1iZXIsIGx6OiBudW1iZXIpID0+XG4gIGx4ICsgbHogKiBDSFVOS19TSVpFICsgeUluZGV4ICogQ0hVTktfQVJFQTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtYID0gKHg6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWiA9ICh6OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFggPSAoeDogbnVtYmVyKSA9PiB4IC0gKHdvcmxkVG9DaHVua1goeCkgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWiA9ICh6OiBudW1iZXIpID0+IHogLSAod29ybGRUb0NodW5rWih6KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB5VG9JbmRleCA9ICh5OiBudW1iZXIpID0+IHkgLSBZX01JTjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGlmICghaXNTdXBwb3J0ZWRHZW5lcmF0b3IoZ2VuZXJhdG9yVmVyc2lvbikpIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24gJHtnZW5lcmF0b3JWZXJzaW9ufWApO1xuICByZXR1cm4ge1xuICAgIHNlZWQsXG4gICAgcGFyYW1zOiB7IC4uLkRFRkFVTFRfUEFSQU1TLCBnZW5lcmF0b3JWZXJzaW9uIH0sXG4gICAgY2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXRpZXM6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaGFuZ2VzOiBuZXcgU2V0KCksXG4gICAgZW50aXR5UmVtb3ZhbHM6IG5ldyBTZXQoKSxcbiAgICBzdHJ1Y3R1cmVzOiBuZXcgTWFwKCksXG4gICAgc2l0ZXM6IFtdLFxuICAgIHJlZ2lvbnM6IFJFR0lPTlMsXG4gICAgZWRpdHM6IG5ldyBNYXAoKSxcbiAgICBpbnZlbnRvcnk6IHt9LFxuICAgIGRpcnR5OiBuZXcgU2V0KCksXG4gICAgc3RhdHM6IHtcbiAgICAgIGNodW5rc0dlbmVyYXRlZDogMCwgY2h1bmtzRXZpY3RlZDogMCwgdm94ZWxzRmlsbGVkOiAwLCBnZW5lcmF0aW9uTXM6IDAsXG4gICAgICBlbnRpdGllczogMCwgdHJlZXM6IDAsIHBpbmtUcmVlczogMCwgcGlua092ZXJmbG93OiAwLFxuICAgIH0sXG4gICAgYXV0aG9yZWRQbGFjZWQ6IGZhbHNlLFxuICAgIHJldmlzaW9uOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVXb3JsZChzZWVkID0gMTMzNywgaW5pdGlhbFJhZGl1cyA9IDAsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkLCBnZW5lcmF0b3JWZXJzaW9uKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNOT1cpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBNQVQuR1JBVkVMO1xuICByZXR1cm4gTUFULlNUT05FO1xufVxuXG5mdW5jdGlvbiBvcmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgY2x1c3RlciA9IGZibTIoeCAvIDU1LCB6IC8gNTUsIHNlZWQgKyAxMzAsIDIpO1xuICBpZiAoY2x1c3RlciA8IDAuNTcpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgbiA9IHZhbHVlTm9pc2UzKHggKiAwLjA5LCB5ICogMC4xMywgeiAqIDAuMDksIHNlZWQgKyAxMzEpO1xuICBjb25zdCBuMiA9IHZhbHVlTm9pc2UzKHggKiAwLjIyICsgNSwgeSAqIDAuMzEsIHogKiAwLjIyIC0gMywgc2VlZCArIDEzMik7XG4gIHJldHVybiBuID4gMC43MCAmJiBuMiA+IDAuNTA7XG59XG5cbmZ1bmN0aW9uIGNhdmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGZibTMoeCAqIDAuMDc1LCB5ICogMC4xMSwgeiAqIDAuMDc1LCBzZWVkICsgMTQwLCAyKSA+IDAuNzI7XG59XG5cbmZ1bmN0aW9uIG92ZXJoYW5nQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWx1ZU5vaXNlMyh4ICogMC4xOCwgeSAqIDAuMjIsIHogKiAwLjE4LCBzZWVkICsgMTQxKSA+IDAuNjI7XG59XG5cbi8vIC0tLS0tLS0tLS0gdmVyc2lvbmVkIGdlbmVyYXRvciBkaXNwYXRjaCAtLS0tLS0tLS0tXG5jb25zdCB2MkNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRlcnJhaW5WMj4oKTtcbmNvbnN0IGh5ZHJvQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSHlkcm9sb2d5PigpO1xuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ3kgbmV0d29yayBmb3IgYSBzZWVkIGFuZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyb2xvZ3lGb3Ioc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIpOiBIeWRyb2xvZ3kge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuaHlkcm9sb2d5O1xuICBjb25zdCBrZXkgPSBgJHtzZWVkfToke3ZlcnNpb259YDtcbiAgbGV0IGh5ZHJvID0gaHlkcm9DYWNoZS5nZXQoa2V5KTtcbiAgaWYgKCFoeWRybykge1xuICAgIGh5ZHJvID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb24sIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGh5ZHJvQ2FjaGUuc2V0KGtleSwgaHlkcm8pO1xuICB9XG4gIHJldHVybiBoeWRybztcbn1cblxuLyoqIEBpbnRlcm5hbCBUaGUgdjIgZ2VuZXJhdG9yIGZvciBhIHNlZWQgKGNhY2hlZDsgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCkuICovXG5leHBvcnQgZnVuY3Rpb24gdGVycmFpblYyKHNlZWQ6IG51bWJlcik6IFRlcnJhaW5WMiB7XG4gIGxldCBnZW4gPSB2MkNhY2hlLmdldChzZWVkKTtcbiAgaWYgKCFnZW4pIHtcbiAgICBjb25zdCBoeWRyb2xvZ3kgPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbjogR0VORVJBVE9SX1YyLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBnZW4gPSBuZXcgVGVycmFpblYyKHNlZWQsIHN1cmZhY2VIZWlnaHRBdCwgaHlkcm9sb2d5KTtcbiAgICB2MkNhY2hlLnNldChzZWVkLCBnZW4pO1xuICB9XG4gIHJldHVybiBnZW47XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCBoZWlnaHQgKHRvcCBzb2xpZCArIDEpIGZvciBhbnkgc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkuaGVpZ2h0KHgsIHopIDogc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgd2F0ZXIgc3VyZmFjZTogd2F0ZXIgZmlsbHMgY2VsbHMgW2hlaWdodCwgbGV2ZWwpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VXYXRlckxldmVsQXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmNvbHVtbih4LCB6KS5sZXZlbDtcbiAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgOiBoO1xufVxuXG5mdW5jdGlvbiB2ZXJzaW9uZWRTbG9wZShzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogKyAxKSksXG4gICk7XG59XG5cbi8qKiBCYXNlIHRvcCBtYXRlcmlhbCBmb3IgYW55IGdlbmVyYXRvciB2ZXJzaW9uIChtYWNybyBMT0QsIGVudGl0eSBwbGFjZW1lbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbEZvcihcbiAgc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGdlbiA9IHRlcnJhaW5WMihzZWVkKTtcbiAgICByZXR1cm4gZ2VuLnRvcE1hdGVyaWFsKHgsIHosIGdlbi5jb2x1bW4oeCwgeiksIHNsb3BlLFxuICAgICAgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoaCwgc3MsIG5lYXJXYXRlcikpO1xuICB9XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB5OiBudW1iZXI7XG4gIHRvcDogTWF0SWQ7XG4gIHNsb3BlOiBudW1iZXI7XG59XG5cbi8qKiBCYXNlIHN1cmZhY2Ugc2FtcGxlIGZvciBtYWNybyBMT0QuIERvZXMgbm90IGluY2x1ZGUgdm94ZWwgZWRpdHMvb3ZlcmhhbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZVN1cmZhY2Uoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFN1cmZhY2VTYW1wbGUge1xuICBjb25zdCB5ID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICBjb25zdCBzbG9wZSA9IHNsb3BlQXQoc2VlZCwgeCwgeiwgeSk7XG4gIHJldHVybiB7IHksIHRvcDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCB5LCBzbG9wZSksIHNsb3BlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2h1bmsgZ2VuZXJhdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICByZXR1cm4gZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuXG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IGRhdGEgPSBuZXcgVWludDhBcnJheShDSFVOS19WT0xVTUUpO1xuICBjb25zdCBoZWlnaHRzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IHRvcE1hdGVyaWFscyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgY29uc3Qgc2VlZCA9IHdvcmxkLnNlZWQ7XG4gIGNvbnN0IHYyID0gd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpIDogbnVsbDtcblxuICAvLyBQYWRkZWQgaGVpZ2h0IGNhY2hlOiBhIHRocmVlLWNlbGwgYm9yZGVyIGNvdmVycyBzbG9wZSwgYmVhY2ggYW5kIGxlZGdlcy5cbiAgY29uc3QgUCA9IDM7XG4gIGNvbnN0IFBXID0gQ0hVTktfU0laRSArIFAgKiAyO1xuICBjb25zdCBiYXNlSCA9IG5ldyBJbnQxNkFycmF5KFBXICogUFcpO1xuICBjb25zdCB2MkNvbHM6IFYyQ29sdW1uW10gfCBudWxsID0gdjIgPyBuZXcgQXJyYXkoQ0hVTktfQVJFQSkgOiBudWxsO1xuICBmb3IgKGxldCBweiA9IDA7IHB6IDwgUFc7IHB6KyspIHtcbiAgICBmb3IgKGxldCBweCA9IDA7IHB4IDwgUFc7IHB4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBweCAtIFAsIHd6ID0gb3ogKyBweiAtIFA7XG4gICAgICBpZiAodjIpIHtcbiAgICAgICAgY29uc3QgY29sID0gdjIuY29sdW1uKHd4LCB3eik7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBjb2wuaDtcbiAgICAgICAgY29uc3QgbHggPSBweCAtIFAsIGx6ID0gcHogLSBQO1xuICAgICAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHYyQ29scyFbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY29sO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB3eCwgd3opO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB2MkNvbCA9IHYyQ29scyA/IHYyQ29sc1tseiAqIENIVU5LX1NJWkUgKyBseF0gOiBudWxsO1xuICAgICAgY29uc3QgdG9wID0gdjIgJiYgdjJDb2xcbiAgICAgICAgPyB2Mi50b3BNYXRlcmlhbCh3eCwgd3osIHYyQ29sLCBzbG9wZSwgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGhoLCBzcywgbmVhcldhdGVyKSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHRoZSBjb2x1bW4nc1xuICAgICAgLy8gd2F0ZXIgbGV2ZWwgKHNlYSBsZXZlbCBpbiB2MTsgdGhlIGh5ZHJvbG9naWNhbCBsZXZlbCBpbiB2MikuXG4gICAgICBjb25zdCB3YXRlckxldmVsID0gdjJDb2wgPyBNYXRoLm1pbihZX01BWCwgdjJDb2wubGV2ZWwpIDogU0VBX0xFVkVMO1xuICAgICAgaWYgKGggPCB3YXRlckxldmVsKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCB3YXRlckxldmVsOyB5KyspIHtcbiAgICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopO1xuICAgICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5XQVRFUjtcbiAgICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b3BTb2xpZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5tYXgoWV9NSU4sIGggLSAxKSk7XG4gICAgICBoZWlnaHRzW2NvbF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tjb2xdID0gdG9wO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb3RydWRpbmcgbGVkZ2VzOiBvbmUgb3IgdHdvIHN0b25lIGJsb2NrcyBleHRlbmQgZnJvbSBhIGhpZ2ggY29sdW1uIG92ZXJcbiAgLy8gYSBsb3dlciBuZWlnaGJvdXIuIFRoZXkgY3JlYXRlIHJlYWRhYmxlIG92ZXJoYW5ncyB3aXRob3V0IGEgZnVsbCBjYXZlIHBhc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBpZiAoc2xvcGUgPCAyKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRpcnM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1stMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWzAsIDFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2YgZGlycykge1xuICAgICAgICBjb25zdCBueCA9IGx4ICsgZHgsIG56ID0gbHogKyBkejtcbiAgICAgICAgaWYgKG54IDwgMCB8fCBueiA8IDAgfHwgbnggPj0gQ0hVTktfU0laRSB8fCBueiA+PSBDSFVOS19TSVpFKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbmggPSBiYXNlSFsobnogKyBQKSAqIFBXICsgKG54ICsgUCldO1xuICAgICAgICBpZiAoaCAtIG5oIDwgMikgY29udGludWU7XG4gICAgICAgIGlmIChoYXNoM2kobHgsIGx6LCBkeCAqIDMgKyBkeiAqIDcsIHNlZWQgKyAxNTApIDwgMC41NSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHkgPSBoIC0gMjtcbiAgICAgICAgaWYgKHkgPCBZX01JTiB8fCB5ID49IGgpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KG54LCB5VG9JbmRleCh5KSwgbnopO1xuICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtpZHhdID0gTUFULlNUT05FO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmVjb21wdXRlIHRoZSBjb2x1bW4gY2FjaGUgYWZ0ZXIgbGVkZ2VzL2NhdmVzLiBUaGUgZXhwb3NlZCB0b3AgbWF0ZXJpYWxcbiAgLy8gbXVzdCBjb21lIGZyb20gdGhlIGFjdHVhbCB0b3Agc29saWQgdm94ZWwsIG5vdCB0aGUgcHJlLWNhcnZlIGd1ZXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgIGxldCB0b3BNYXQ6IG51bWJlciA9IHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgY29uc3QgbSA9IGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICAgIGhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG9wTWF0O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNodW5rOiBWb3hlbENodW5rID0ge1xuICAgIGN4LCBjeiwga2V5LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpcixcbiAgICBkaXJ0eTogdHJ1ZSxcbiAgICBnZW5lcmF0ZWRBdDogcGVyZm9ybWFuY2Uubm93KCksXG4gIH07XG5cbiAgLy8gQXBwbHkgZHVyYWJsZSBlZGl0cyBhZnRlciBiYXNlIGdlbmVyYXRpb24uXG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIGlmIChlZGl0cykge1xuICAgIGZvciAoY29uc3QgW2lkeCwgbV0gb2YgZWRpdHMpIHtcbiAgICAgIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gICAgfVxuICAgIC8vIFJlY29tcHV0ZSB0aGUgY2FjaGUgZm9yIGVkaXRlZCBjaHVua3MuXG4gICAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgbHgsIGx6KTtcbiAgICB9XG4gIH1cbiAgLy8gTm9uLWFpciBjb3VudHMgYXJlIGRlcml2ZWQgcmVuZGVyZXIgc3RhdGlzdGljcywgbm90IGR1cmFibGUgd29ybGQgc3RhdGUuXG4gIC8vIEVkaXRlZCBiYXNlIGFpciBtYXkgYmVjb21lIHNvbGlkIChhbmQgdmljZSB2ZXJzYSkgZHVyaW5nIHJlc3RvcmF0aW9uLlxuICBsZXQgZWRpdGVkTm9uQWlyID0gMDtcbiAgZm9yIChjb25zdCBtYXRlcmlhbCBvZiBjaHVuay5kYXRhKSBpZiAobWF0ZXJpYWwgIT09IE1BVC5BSVIpIGVkaXRlZE5vbkFpcisrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gZWRpdGVkTm9uQWlyIC0gbm9uQWlyO1xuXG4gIHdvcmxkLmNodW5rcy5zZXQoa2V5LCBjaHVuayk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCsrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gbm9uQWlyO1xuICB3b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgKz0gcGVyZm9ybWFuY2Uubm93KCkgLSB0MDtcbiAgd29ybGQuZGlydHkuYWRkKGtleSk7XG5cbiAgZ2VuZXJhdGVFbnRpdGllcyh3b3JsZCwgY2h1bmspO1xuICByZXR1cm4gY2h1bms7XG59XG5cbi8qKiBBIGJhc2UtdGVycmFpbiBjYWNoZSBzaGFyZWQgYnkgZWRpdGVkIGFuZCB1bmVkaXRlZCByZWdlbmVyYXRpb24uIE5hdHVyYWxcbiAqIHNjZW5lcnkgbmV2ZXIgZGVwZW5kcyBvbiBsYXRlciB2b3hlbCBlZGl0czsgdGhpcyBhbHNvIGxldHMgYSBzbmFwc2hvdCByZXN0b3JlXG4gKiBhIGhhcnZlc3RlZCBjaHVuayB3aXRob3V0IG1hdGVyaWFsaXppbmcgdW5yZWxhdGVkIG5laWdoYm91cmluZyBjaHVua3MuICovXG5jb25zdCBiYXNlQ29sdW1uQ2FjaGUgPSBuZXcgV2Vha01hcDxXb3JsZCwgTWFwPHN0cmluZywgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXkgfT4+KCk7XG5cbmZ1bmN0aW9uIGJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheSB9IHtcbiAgbGV0IGNhY2hlID0gYmFzZUNvbHVtbkNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGUpIHsgY2FjaGUgPSBuZXcgTWFwKCk7IGJhc2VDb2x1bW5DYWNoZS5zZXQod29ybGQsIGNhY2hlKTsgfVxuICBjb25zdCBjYWNoZWQgPSBjYWNoZS5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGNhY2hlZDtcbiAgY29uc3QgY29sdW1ucyA9IHsgaGVpZ2h0czogbmV3IFVpbnQ4QXJyYXkoY2h1bmsuaGVpZ2h0cyksIHRvcE1hdGVyaWFsczogbmV3IFVpbnQ4QXJyYXkoY2h1bmsudG9wTWF0ZXJpYWxzKSB9O1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSArIGx4LCB6ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KSArIGx6O1xuICAgICAgY29uc3QgdmVyc2lvbiA9IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uO1xuICAgICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB2ZXJzaW9uLCB4LCB6KTtcbiAgICAgIGNvbnN0IHNsb3BlID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyB2ZXJzaW9uZWRTbG9wZSh3b3JsZC5zZWVkLCB2ZXJzaW9uLCB4LCB6LCBoKSA6IHNsb3BlQXQod29ybGQuc2VlZCwgeCwgeiwgaCk7XG4gICAgICBjb25zdCBpbmRleCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5oZWlnaHRzW2luZGV4XSA9IGNsYW1wKGggLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICBjb2x1bW5zLnRvcE1hdGVyaWFsc1tpbmRleF0gPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IGJhc2VUb3BNYXRlcmlhbEZvcih3b3JsZC5zZWVkLCB2ZXJzaW9uLCB4LCB6LCBoLCBzbG9wZSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHdvcmxkLnNlZWQsIHgsIHosIGgsIHNsb3BlKTtcbiAgICB9XG4gIH1cbiAgY2FjaGUuc2V0KGNodW5rLmtleSwgY29sdW1ucyk7XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG4vLyAtLS0tLS0tLS0tIGRlcml2ZWQgY2hhbmdlIHRyYWNraW5nIChub3QgYXV0aG9yaXRhdGl2ZSBzdGF0ZSkgLS0tLS0tLS0tLVxuLy8gUmVuZGVyZXJzIG5lZWQgdG8ga25vdyB3aGVuIHRoZSBlZGl0IG92ZXJsYXkgY2hhbmdlZCB3aXRob3V0IHdhbGtpbmcgZXZlcnlcbi8vIGVkaXQgZWFjaCBmcmFtZS4gVGhlIGNvdW50ZXIgbGl2ZXMgb3V0c2lkZSBXb3JsZCBzbyBpdCBuZXZlciBlbnRlcnMgYVxuLy8gc25hcHNob3Qgb3IgY2Fub25pY2FsIGhhc2guXG5jb25zdCBlZGl0VmVyc2lvbnMgPSBuZXcgV2Vha01hcDxXb3JsZCwgbnVtYmVyPigpO1xuXG4vKiogTW9ub3RvbmljIGNvdW50IG9mIGVkaXQtb3ZlcmxheSBjaGFuZ2VzIGZvciB0aGlzIFdvcmxkIG9iamVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0VmVyc2lvbih3b3JsZDogV29ybGQpOiBudW1iZXIge1xuICByZXR1cm4gZWRpdFZlcnNpb25zLmdldCh3b3JsZCkgPz8gMDtcbn1cblxuLyoqIENhbGwgYWZ0ZXIgcmVwbGFjaW5nIG9yIGJ1bGstY2hhbmdpbmcgYHdvcmxkLmVkaXRzYCBvdXRzaWRlIHNldFZveGVsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtFZGl0c0NoYW5nZWQod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGVkaXRWZXJzaW9ucy5zZXQod29ybGQsIGVkaXRWZXJzaW9uKHdvcmxkKSArIDEpO1xufVxuXG4vLyAtLS0tLS0tLS0tIG5vbi1nZW5lcmF0aW5nIHF1ZXJpZXMgLS0tLS0tLS0tLVxuLy8gTW92aW5nIHByZXNlbnRhdGlvbiAoY2hhcmFjdGVycywgYW5pbWFscywgY2FtZXJhKSBtdXN0IG5ldmVyIHRyaWdnZXIgY2h1bmtcbi8vIGdlbmVyYXRpb24gYXMgYSBzaWRlIGVmZmVjdCBvZiBhc2tpbmcgYWJvdXQgdGVycmFpbi4gVGhlc2UgcmV0dXJuIG51bGwgd2hlblxuLy8gdGhlIGNvbHVtbidzIGNodW5rIGlzIG5vdCByZXNpZGVudC5cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Q2h1bmtBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHdvcmxkLmNodW5rcy5nZXQoY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSkpID8/IG51bGw7XG59XG5cbi8qKiBMaWtlIHN1cmZhY2VBdCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHwgbnVsbCB7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbi8qKiBMaWtlIGdldFZveGVsLCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Vm94ZWxBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB8IG51bGwge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXZpY3RDaHVuayh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghd29ybGQuY2h1bmtzLmhhcyhrZXkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmNodW5rcy5kZWxldGUoa2V5KTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzRXZpY3RlZCsrO1xuICAvLyBDaHVuayBieXRlcyBhbmQgY29sdW1uIGNhY2hlcyBhcmUgcmVnZW5lcmF0ZWQgb24gZGVtYW5kLiBFbnRpdGllcyByZW1haW5cbiAgLy8gYXV0aG9yaXRhdGl2ZTogZXZpY3Rpb24gbXVzdCBub3QgZm9yZ2V0IHRoZWlyIHBlcnNpc3RlbnQgc3RhdGUuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyAtLS0tLS0tLS0tIHF1ZXJpZXMgLyBlZGl0cyAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZ2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBtOiBNYXRJZCk6IGJvb2xlYW4ge1xuICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gWV9NQVgpIHJldHVybiBmYWxzZTtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgaWR4ID0gbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIGNvbnN0IHByZXZpb3VzRWRpdCA9IHdvcmxkLmVkaXRzLmdldChjaHVua0tleShjeCwgY3opKT8uZ2V0KGlkeCk7XG4gIC8vIEEgY2h1bmsgZXZpY3RlZCBhZnRlciBhbiBlYXJsaWVyIGVkaXQgY2FuIHJlZ2VuZXJhdGUgd2l0aCB0aGF0IGR1cmFibGVcbiAgLy8gbWF0ZXJpYWwgYWxyZWFkeSBhcHBsaWVkLiBEcm9wcGluZyB0aGUgZWRpdCBoZXJlIHdvdWxkIG1ha2UgaXQgZGlzYXBwZWFyXG4gIC8vIG9uIHRoZSBuZXh0IGV2aWN0aW9uL3Jlc3RvcmF0aW9uLCBldmVuIHRob3VnaCB0aGUgY3VycmVudCB3cml0ZSBuby1vcHMuXG4gIGlmIChwcmV2aW91c0VkaXQgPT09IG0pIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIGZhbHNlO1xuICBsZXQgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKCFlZGl0cykgeyBlZGl0cyA9IG5ldyBNYXAoKTsgd29ybGQuZWRpdHMuc2V0KGNodW5rLmtleSwgZWRpdHMpOyB9XG4gIC8vIEFuIGlkZW1wb3RlbnQgd3JpdGUgbXVzdCBzdGlsbCByZXN0b3JlIGEgZHVyYWJsZSBkZWx0YSBkaXNjYXJkZWQgYnkgYW5cbiAgLy8gb2xkZXIgc25hcHNob3Qgb3IgZGVsdGEgZGVjb2Rlci4gSXQgaXMgbm90IGEgbmV3IGF1dGhvcml0YXRpdmUgcmV2aXNpb24uXG4gIGlmIChjaHVuay5kYXRhW2lkeF0gPT09IG0pIHtcbiAgICBpZiAoIWVkaXRzLmhhcyhpZHgpKSBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgZWRpdHMuc2V0KGlkeCwgbSk7XG4gIG1hcmtFZGl0c0NoYW5nZWQod29ybGQpO1xuICBjaHVuay5kaXJ0eSA9IHRydWU7XG4gIHdvcmxkLmRpcnR5LmFkZChjaHVuay5rZXkpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgd29ybGRUb0xvY2FsWCh4KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDb2x1bW5DYWNoZShjaHVuazogVm94ZWxDaHVuaywgbHg6IG51bWJlciwgbHo6IG51bWJlcik6IHZvaWQge1xuICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgaWYgKGlzU29saWQoY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSkpIHsgdG9wU29saWQgPSB5OyBicmVhazsgfVxuICB9XG4gIGNodW5rLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gIGNvbnN0IHRtID0gY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgaWYgKHRvcFNvbGlkID49IFlfTUlOKSB7XG4gICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgodG9wU29saWQpLCBseildO1xuICAgIGlmIChtICE9PSBNQVQuV0FURVIpIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBtO1xuICB9IGVsc2Uge1xuICAgIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0bTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSB5IGNvb3JkaW5hdGUgb2YgdGhlIGV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbiBhdCB4L3ouXG4gKiBBIHNvbGlkIHZveGVsIGF0IHkgb2NjdXBpZXMgW3ksIHkrMSksIHNvIHRoZSB3YWxrYWJsZSBzdXJmYWNlIGlzIHRvcFNvbGlkKzEuXG4gKiBUaGlzIGlzIGEgZGVyaXZlZCBxdWVyeTsgdGhlIGF1dGhvcml0YXRpdmUgc3RhdGUgcmVtYWlucyB0aGUgdm94ZWwgdm9sdW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gWV9NSU47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gWV9NSU47XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLnRvcE1hdGVyaWFsc1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAod29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24gPCBHRU5FUkFUT1JfVjIpIHtcbiAgICBjb25zdCBoID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCAtIGggOiAwO1xuICB9XG4gIHJldHVybiB3YXRlclN1cmZhY2VBdCh3b3JsZCwgeCwgeikgLSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG4vKipcbiAqIFRvcCBvZiB0aGUgd2F0ZXIgY29sdW1uIHN0YW5kaW5nIG9uIHRoZSBzb2xpZCBzdXJmYWNlIChlcXVhbCB0byB0aGUgc3VyZmFjZVxuICogd2hlbiBkcnkpLiBSZWFkcyB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbHMsIHNvIGVkaXRzIGFuZCBkdWcgcGl0cyBhcmUgZXhhY3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRlclN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICB3aGlsZSAoeSA8IFlfTUFYICYmIGdldFZveGVsKHdvcmxkLCB4LCB5LCB6KSA9PT0gTUFULldBVEVSKSB5Kys7XG4gIHJldHVybiB5O1xufVxuXG4vLyAtLS0tLS0tLS0tIGVudGl0aWVzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGFkZEVudGl0eSh3b3JsZDogV29ybGQsIGU6IEVudGl0eSk6IHZvaWQge1xuICBpZiAod29ybGQuZW50aXRpZXMuaGFzKGUuaWQpIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSByZXR1cm47XG4gIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBlKTtcbiAgbGV0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIGxpc3QpOyB9XG4gIGxpc3QucHVzaChlLmlkKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICAvLyBHZW5lcmF0aW9uIGlzIGRldGVybWluaXN0aWMgYW5kIGFkdmFuY2VzIG5vIHBsYXllci1jb21tYW5kIHByZWNvbmRpdGlvbi5cbiAgLy8gQXV0aG9yZWQgc2NhZmZvbGRpbmcgbWF5IHRyYW5zaWVudGx5IGNoYW5nZSBpdDsgdGhlIHNuYXBzaG90IHJlc3RvcmVzIHRoZVxuICAvLyBzYXZlZCByZXZpc2lvbiBhZnRlciBwbGFjaW5nIHRoYXQgc2NhZmZvbGRpbmcuXG59XG5cbi8qKlxuICogUmVtb3ZlIGFuIGVudGl0eSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHdvcmxkLiBVc2VkIHdoZW4gYSBzaXRlIGlzIGNsZWFyZWQ6XG4gKiB0aGUgcmVzb3VyY2UgeWllbGQgaXMgYWNjb3VudGVkIGZvciBieSB0aGUgY2FsbGVyLCBhbmQgdGhlIGVudGl0eSBtdXN0IHN0b3BcbiAqIGV4aXN0aW5nIGZvciBjb2xsaXNpb24sIG9ic3RydWN0aW9uIGFuZCBwZXJzaXN0ZW5jZSwgbm90IGp1c3QgYmUgaGlkZGVuIGJ5XG4gKiB0aGUgcmVuZGVyZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgY29uc3QgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmIChsaXN0KSB7XG4gICAgY29uc3QgaSA9IGxpc3QuaW5kZXhPZihpZCk7XG4gICAgaWYgKGkgPj0gMCkgbGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoaWQpO1xuICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlJZChjaHVuazogc3RyaW5nLCBpOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gYGU6JHtjaHVua306JHtpfWA7XG59XG5cbmZ1bmN0aW9uIGZvcmVzdFNjb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGVhc3QgPSBNYXRoLmV4cCgtKCgod3ggLSAyMjApIC8gMjYwKSAqKiAyICsgKCh3eiArIDExMCkgLyAyMjApICoqIDIpKTtcbiAgY29uc3Qgbm9ydGggPSBNYXRoLmV4cCgtKCgod3ggLSAyMCkgLyAzMDApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDE5MCkgKiogMikpO1xuICBjb25zdCB3ZXN0ID0gTWF0aC5leHAoLSgoKHd4ICsgMzQwKSAvIDIwMCkgKiogMiArICgod3ogLSAxMjApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IHNvdXRoID0gTWF0aC5leHAoLSgoKHd4IC0gMTIwKSAvIDI0MCkgKiogMiArICgod3ogLSAzMzApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IG1vaXN0dXJlID0gZmJtMih3eCAvIDI2MCwgd3ogLyAyNjAsIHNlZWQgKyAyMDEsIDQpO1xuICBjb25zdCB2YWxsZXkgPSBNYXRoLmV4cCgtKCh3eCAvIDE0MCkgKiogMiArICh3eiAvIDEwNSkgKiogMikpO1xuICByZXR1cm4gTWF0aC5tYXgoZWFzdCwgbm9ydGggKiAwLjkyLCB3ZXN0ICogMC44MCwgc291dGggKiAwLjc4KSAqIDAuODJcbiAgICArIG1vaXN0dXJlICogMC4zOCAtIDAuMjIgLSB2YWxsZXkgKiAwLjM0O1xufVxuXG5mdW5jdGlvbiByb2NrU2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgbW91bnRhaW4gPSBmYm0yKHd4IC8gMzMwLCB3eiAvIDMzMCwgc2VlZCArIDIwMiwgMyk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMTQwLCB3eiAvIDE0MCwgc2VlZCArIDIwMywgMykgLSAxKTtcbiAgcmV0dXJuIG1vdW50YWluICogMC41NSArIHJpZGdlICogMC40NTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdGllcyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogdm9pZCB7XG4gIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQsIGNodW5rLmN4LCBjaHVuay5jeik7XG59XG5cbi8qKiBAaW50ZXJuYWwgUmVwbGF5cyBkZXRlcm1pbmlzdGljIGdlbmVyYXRpb24gZm9yIHNuYXBzaG90IGVudGl0eSBkZWx0YXMuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgaWYgKHdvcmxkLmVudGl0eUNodW5rcy5oYXMoa2V5KSkgcmV0dXJuO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm47XG5cbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoaGFzaDJpKGNodW5rLmN4LCBjaHVuay5jeiwgd29ybGQuc2VlZCArIDkwMCkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBjb2x1bW5zID0gYmFzZUNvbHVtbnMod29ybGQsIGNodW5rKTtcbiAgbGV0IG4gPSAwO1xuICBsZXQgbmF0dXJhbFRyZWVzID0gMDtcbiAgbGV0IG5hdHVyYWxQaW5rVHJlZXMgPSAwO1xuXG4gIGNvbnN0IGxvY2FsU3VyZmFjZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSArIFlfTUlOO1xuICB9O1xuICBjb25zdCBsb2NhbFRvcCA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogTWF0SWQgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gYXMgTWF0SWQ7XG4gIH07XG4gIGNvbnN0IGxvY2FsU2xvcGUgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgIHJldHVybiBNYXRoLm1heChcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggLSAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogLSAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgKTtcbiAgfTtcblxuICAvLyBBIGppdHRlcmVkIDggbSBsYXR0aWNlIGdpdmVzIGNvaGVyZW50IG1hc3NlcyBhbmQgYXZvaWRzIHBlci1mcmFtZSBzY2F0dGVyLlxuICBmb3IgKGxldCBneiA9IDA7IGd6IDwgQ0hVTktfU0laRTsgZ3ogKz0gOCkge1xuICAgIGZvciAobGV0IGd4ID0gMDsgZ3ggPCBDSFVOS19TSVpFOyBneCArPSA4KSB7XG4gICAgICBjb25zdCBseCA9IGNsYW1wKE1hdGguZmxvb3IoZ3ggKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCBseiA9IGNsYW1wKE1hdGguZmxvb3IoZ3ogKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICAgIGlmIChoIDw9IFNFQV9MRVZFTCArIDEpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgc2xvcGUgPSBsb2NhbFNsb3BlKGx4LCBseik7XG4gICAgICBjb25zdCB0b3AgPSBsb2NhbFRvcChseCwgbHopO1xuICAgICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGZvcmVzdCA9IGZvcmVzdFNjb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2NreSA9IHJvY2tTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9sbCA9IHJuZCgpO1xuXG4gICAgICBjb25zdCB0cmVlQ2hhbmNlID0gZm9yZXN0ID4gMC41MCA/IDAuNzIgOiBmb3Jlc3QgPiAwLjMwID8gMC4yNSA6IDAuMDU7XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMiAmJiByb2xsIDwgdHJlZUNoYW5jZSkge1xuICAgICAgICAvLyBUaGUgY2FwIGlzIGEgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWdlbmVyYXRpb24gcHJvcGVydHkuIEl0IGNhbm5vdFxuICAgICAgICAvLyBkZXBlbmQgb24gd2hpY2ggY2h1bmtzIGEgcmVuZGVyZXIgbG9hZGVkIGJlZm9yZSB0aGlzIG9uZS5cbiAgICAgICAgbGV0IGtpbmQ6IEVudGl0eUtpbmQ7XG4gICAgICAgIGxldCB2YXJpYW50OiBudW1iZXI7XG4gICAgICAgIGNvbnN0IHNwZWNpZXNSb2xsID0gcm5kKCk7XG4gICAgICAgIGlmIChzcGVjaWVzUm9sbCA8IDAuMTIpIHtcbiAgICAgICAgICBpZiAoKG5hdHVyYWxQaW5rVHJlZXMgKyAxKSA+IDAuMjUgKiAobmF0dXJhbFRyZWVzICsgMSkpIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtPdmVyZmxvdysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9ibG9zc29tJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMik7XG4gICAgICAgICAgICBuYXR1cmFsUGlua1RyZWVzKys7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjQwKSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfc3BpcmUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjc0KSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfdGFibGUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgfVxuICAgICAgICBuYXR1cmFsVHJlZXMrKztcbiAgICAgICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuODggKyBybmQoKSAqIDAuMjQsIHZhcmlhbnQsXG4gICAgICAgICAgcmVzb3VyY2U6ICd3b29kJywgcmVtYWluaW5nOiAxMiwgeWllbGRQZXJIYXJ2ZXN0OiA0LFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiByb2NreSA+IDAuNDYgJiYgcm9sbCA8IDAuMzgpIHtcbiAgICAgICAgLy8gQ29uc3VtZSB0aGUgcmV0aXJlZCBzdG9uZSBmb3JtJ3MgcmFuZG9tIGRyYXdzIGFuZCBhbGxvY2F0ZSBpdHMgb2xkXG4gICAgICAgIC8vIHNlcXVlbmNlIElELCBidXQgZG8gbm90IGluc2VydCBhbiBlbnRpdHkuIExhdGVyIG5hdHVyYWwgcGxhY2VtZW50c1xuICAgICAgICAvLyB0aGVyZWZvcmUgcmVtYWluIGJ5dGUtZm9yLWJ5dGUgY29tcGF0aWJsZSB3aXRoIHJlY29yZGVkIHNhdmVzLlxuICAgICAgICBjb25zdCBzaXplUm9sbCA9IHJuZCgpO1xuICAgICAgICBjb25zdCBraW5kOiBFbnRpdHlLaW5kID0gc2l6ZVJvbGwgPCAwLjU1ID8gJ3N0eWxfcm9ja19zbWFsbCdcbiAgICAgICAgICA6IHNpemVSb2xsIDwgMC45MCA/ICdzdHlsX3JvY2tfbWVkaXVtJyA6ICdzdHlsX3JvY2tfbGFyZ2UnO1xuICAgICAgICBjb25zdCBpZCA9IGVudGl0eUlkKGNodW5rLmtleSwgbisrKTtcbiAgICAgICAgY29uc3QgcmVjb3JkID0ge1xuICAgICAgICAgIGlkLCBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcmVzb3VyY2U6ICdzdG9uZScgYXMgY29uc3QsXG4gICAgICAgICAgcmVtYWluaW5nOiBraW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDQgOiBraW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyA4IDogMTIsXG4gICAgICAgICAgeWllbGRQZXJIYXJ2ZXN0OiAzLCBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICB9O1xuICAgICAgICAvLyBPbmx5IGVudGl0aWVzIHRoYXQgZXhpc3RlZCBpbiBhbiBhY2NlcHRlZCBvbGQgc2F2ZSBnZXQgdG9tYnN0b25lcyxcbiAgICAgICAgLy8gZHVyaW5nIGV4cGxpY2l0IG1pZ3JhdGlvbi4gT3JkaW5hcnkgZ2VuZXJhdGlvbiBtdXN0IHJlc3RvcmUgZXhhY3RseS5cbiAgICAgICAgaWYgKGlzU3RvbmVSZXBsYXkod29ybGQpKSBhZGRFbnRpdHkod29ybGQsIHJlY29yZCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULlNUT05FICYmIHJvY2t5ID4gMC41OCAmJiByb2xsIDwgMC4xOCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX29yZScsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAyKSxcbiAgICAgICAgICByZXNvdXJjZTogJ29yZScsIHJlbWFpbmluZzogOCwgeWllbGRQZXJIYXJ2ZXN0OiAyLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAxICYmIHJvbGwgPCAwLjMwKSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfc2hydWInLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOCArIHJuZCgpICogMC40LCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgICAgcmVzb3VyY2U6ICdmaWJlcicsIHJlbWFpbmluZzogNCwgeWllbGRQZXJIYXJ2ZXN0OiAxLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRBdXRob3JlZEVudGl0eSh3b3JsZDogV29ybGQsIGtpbmQ6IEVudGl0eUtpbmQsIHg6IG51bWJlciwgejogbnVtYmVyLCB2YXJpYW50OiBudW1iZXIsIHJvdDogbnVtYmVyLCBzY2FsZTogbnVtYmVyLCByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbCwgcmVtYWluaW5nOiBudW1iZXIsIHlpZWxkUGVySGFydmVzdDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoeSA8PSBTRUFfTEVWRUwpIHJldHVybjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIC8vIEEgaGVybyBhc3NldCBvd25zIGl0cyBzcG90OiBjbGVhciBhbnkgZ2VuZXJhdGVkIGVudGl0eSB0aGF0IHdvdWxkIG92ZXJsYXBcbiAgLy8gaXQsIHJhdGhlciB0aGFuIHNpbGVudGx5IGRyb3BwaW5nIHRoZSBhdXRob3JlZCBjb21wb3NpdGlvbi5cbiAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdO1xuICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgcmV0dXJuO1xuICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmIChlICYmIE1hdGguaHlwb3QoZS54IC0geCwgZS56IC0geikgPCAyLjYpIHtcbiAgICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gICAgICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gICAgICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgICB9XG4gIH1cbiAgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSk7XG4gIC8vIEF1dGhvcmVkIGNvbXBvc2l0aW9uIGlzIGR1cmFibGUgc3RhdGU6IGl0IGNhbiBjbGVhciBvdmVybGFwcGluZyBuYXR1cmFsXG4gIC8vIGVudGl0aWVzLCBzbyBzYXZlIHRoZSBjb21wbGV0ZSBhZmZlY3RlZCBjaHVuayByYXRoZXIgdGhhbiBvbmx5IGl0cyBoZXJvZXMuXG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG5cbiAgY29uc3QgaWQgPSBgaGVybzoke2tpbmR9OiR7TWF0aC5yb3VuZCh4KX06JHtNYXRoLnJvdW5kKHopfWA7XG4gIGNvbnN0IGJlZm9yZSA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGNvbnN0IGVudGl0eTogRW50aXR5ID0ge1xuICAgIGlkLCBraW5kLCBjaHVuazoga2V5LCB4OiB4ICsgMC41LCB5LCB6OiB6ICsgMC41LFxuICAgIHJvdCwgc2NhbGUsIHZhcmlhbnQsIHJlc291cmNlLCByZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdCxcbiAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IHRydWUsXG4gIH07XG4gIGFkZEVudGl0eSh3b3JsZCwgZW50aXR5KTtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLnNpemUgPiBiZWZvcmUgJiYga2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkge1xuICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkgcmV0dXJuO1xuICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG5cbiAgY29uc3Qgc2l0ZXM6IEFycmF5PHsga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcm90OiBudW1iZXIgfT4gPSBbXG4gICAgeyBraW5kOiAnd2F5c3RvbmUnLCB4OiAtMTAsIHo6IC0xNCwgcm90OiAwIH0sXG4gICAgeyBraW5kOiAnbWFya2VyJywgeDogLTMyLCB6OiAtOCwgcm90OiBNYXRoLlBJIC8gMiB9LFxuICBdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc2l0ZXMpIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKHkgPD0gU0VBX0xFVkVMKSBjb250aW51ZTtcbiAgICB3b3JsZC5zaXRlcy5wdXNoKHtcbiAgICAgIGlkOiBgc2l0ZToke3Mua2luZH1gLFxuICAgICAga2luZDogcy5raW5kLFxuICAgICAgeDogcy54ICsgMC41LCB5LCB6OiBzLnogKyAwLjUsXG4gICAgICByb3Q6IHMucm90LFxuICAgICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gICAgfSk7XG4gIH1cblxuICAvLyBBIGhlcm8gZ3JvdmUgY29tcG9zZWQgaW4gdGhlIGRlZmF1bHQgY2FtZXJhJ3MgdmlldyBkaXJlY3Rpb24uIFRoZXNlIGFyZVxuICAvLyBTdHlsIG5hdHVyYWwgYXNzZXRzIChBUy0wMDEgdjIpLCBub3QgTm94ZWwgYXJjaGl0ZWN0dXJlOyB0aGUgTm94ZWxcbiAgLy8gd2F5c3RvbmUvbWFya2VyIGFib3ZlIHJlbWFpbiB0aGUgaHVtYW4tbWFkZSBsYW5kbWFya3MuXG4gIGNvbnN0IGdyb3ZlOiBBcnJheTxbRW50aXR5S2luZCwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdPiA9IFtcbiAgICBbJ3N0eWxfdHJlZV9zcGlyZScsIC0yMiwgLTI2LCAwLCAxLjAwLCAwXSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC0zNCwgLTE4LCAxLCAwLjk1LCBNYXRoLlBJIC8gMTJdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTYsIC0zNCwgMiwgMS4wMCwgTWF0aC5QSSAvIDZdLFxuICAgIFsnc3R5bF90cmVlX2Jsb3Nzb20nLCAtMjgsIC0zOCwgMCwgMC45MCwgTWF0aC5QSSAvIDRdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTQwLCAtMzAsIDIsIDEuMDUsIE1hdGguUEkgLyAzXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTEyLCAtMjQsIDAsIDAuOTAsIE1hdGguUEkgLyAyLjRdLFxuICBdO1xuICBmb3IgKGNvbnN0IFtraW5kLCB4LCB6LCB2YXJpYW50LCBzY2FsZSwgcm90XSBvZiBncm92ZSkge1xuICAgIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCBraW5kLCB4LCB6LCB2YXJpYW50LCByb3QsIHNjYWxlLCAnd29vZCcsIDEyLCA0KTtcbiAgfVxuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfcm9ja19tZWRpdW0nLCAtNiwgLTEwLCAwLCAwLCAxLjAsICdzdG9uZScsIDgsIDMpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfc2hydWInLCAtMTQsIC04LCAxLCBNYXRoLlBJIC8gMTIsIDEuMSwgJ2ZpYmVyJywgNCwgMSk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9jYWlybicsIC0yMCwgLTYsIDAsIDAsIDEuMCwgJ3N0b25lJywgNiwgMik7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9vcmUnLCAtMzgsIC00MiwgMCwgTWF0aC5QSSAvIDQsIDEuMSwgJ29yZScsIDgsIDIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbmVhcmVzdEhhcnZlc3RhYmxlKFxuICB3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCByYWRpdXM6IG51bWJlciwgcmVzb3VyY2U/OiBSZXNvdXJjZVR5cGUsXG4pOiBFbnRpdHkgfCBudWxsIHtcbiAgbGV0IGJlc3Q6IEVudGl0eSB8IG51bGwgPSBudWxsO1xuICBsZXQgYmVzdEQgPSByYWRpdXMgKiByYWRpdXM7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZClcbiAgICAgIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIGNvbnRpbnVlO1xuICAgIGlmIChyZXNvdXJjZSAmJiBlLnJlc291cmNlICE9PSByZXNvdXJjZSkgY29udGludWU7XG4gICAgY29uc3QgZCA9IChlLnggLSB4KSAqKiAyICsgKGUueiAtIHopICoqIDI7XG4gICAgaWYgKGQgPCBiZXN0RCkgeyBiZXN0RCA9IGQ7IGJlc3QgPSBlOyB9XG4gIH1cbiAgcmV0dXJuIGJlc3Q7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdFJlc3VsdCB7IGVudGl0eTogRW50aXR5OyByZXNvdXJjZTogUmVzb3VyY2VUeXBlOyBhbW91bnQ6IG51bWJlcjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBIYXJ2ZXN0UmVzdWx0IHwgbnVsbCB7XG4gIGNvbnN0IGUgPSBsaXZlRW50aXR5KHdvcmxkLCBpZCk7XG4gIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgYW1vdW50ID0gTWF0aC5taW4oZS55aWVsZFBlckhhcnZlc3QsIGUucmVtYWluaW5nKTtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIGFtb3VudCA+IDEyMCkgcmV0dXJuIG51bGw7XG4gIGUucmVtYWluaW5nIC09IGFtb3VudDtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgZS5oYXJ2ZXN0ZWRPbmNlID0gdHJ1ZTtcbiAgaWYgKGUucmVtYWluaW5nIDw9IDApIGUuaGFydmVzdGVkID0gdHJ1ZTtcbiAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgZW50aXR5OiBlLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbi8qKiBSZW1vdmUgZXZlcnkgcmV0aXJlZCBzb3VyY2UgYWZ0ZXIgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkuIFRoaXMgbWlncmF0aW9uXG4gKiBjcmVhdGVzIGRldGVybWluaXN0aWMgdG9tYnN0b25lcyBidXQgaXMgbm90IGEgcGxheWVyIGNvbW1hbmQgb3IgcmV2aXNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmV0aXJlU3RvbmVFbnRpdGllcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBlIG9mIFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0pIHtcbiAgICBpZiAoIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKSBjb250aW51ZTtcbiAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoZS5pZCk7XG4gICAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoZS5pZCk7XG4gICAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gICAgaWYgKCF3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGUuY2h1bmspKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtrZXksIGlkc10gb2Ygd29ybGQuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgYWN0aXZlID0gaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpO1xuICAgIGlmIChhY3RpdmUubGVuZ3RoID4gMCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhrZXkpKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgYWN0aXZlKTtcbiAgICBlbHNlIHdvcmxkLmVudGl0eUNodW5rcy5kZWxldGUoa2V5KTtcbiAgfVxuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGVyc2lzdGVuY2UgLyBhdXRob3JpdHkgYm91bmRhcnkgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1hbmlmZXN0IHtcbiAgc2NoZW1hOiAxO1xuICBzZWVkOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIHBhcmFtc0hhc2g6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZm52MWEodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGggPSAweDgxMWM5ZGM1O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBoID0gTWF0aC5pbXVsKGgsIDB4MDEwMDAxOTMpO1xuICB9XG4gIHJldHVybiAoaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZE1hbmlmZXN0KHdvcmxkOiBXb3JsZCk6IFdvcmxkTWFuaWZlc3Qge1xuICBjb25zdCBwID0gd29ybGQucGFyYW1zO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBzZWVkOiB3b3JsZC5zZWVkLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHAuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBzaXplOiBwLnNpemUsXG4gICAgY2h1bmtTaXplOiBwLmNodW5rU2l6ZSxcbiAgICB5TWluOiBwLnlNaW4sXG4gICAgeU1heDogcC55TWF4LFxuICAgIHNlYUxldmVsOiBwLnNlYUxldmVsLFxuICAgIHBhcmFtc0hhc2g6IGZudjFhKEpTT04uc3RyaW5naWZ5KHApKSxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbEVkaXQgeyBpOiBudW1iZXI7IG06IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgc2NoZW1hOiAxO1xuICBrZXk6IHN0cmluZztcbiAgYmFzZVZlcnNpb246IG51bWJlcjtcbiAgZWRpdHM6IFZveGVsRWRpdFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogQ2h1bmtEZWx0YSB7XG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIGtleSxcbiAgICBiYXNlVmVyc2lvbjogd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgZWRpdHM6IGVkaXRzID8gWy4uLmVkaXRzLmVudHJpZXMoKV0ubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSkgOiBbXSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGRlbHRhOiBDaHVua0RlbHRhKTogdm9pZCB7XG4gIGNvbnN0IFtjeCwgY3pdID0gZGVsdGEua2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGZvciAoY29uc3QgZSBvZiBkZWx0YS5lZGl0cykge1xuICAgIGNvbnN0IHlJbmRleCA9IE1hdGguZmxvb3IoZS5pIC8gQ0hVTktfQVJFQSk7XG4gICAgY29uc3QgcmVtID0gZS5pICUgQ0hVTktfQVJFQTtcbiAgICBjb25zdCBseiA9IE1hdGguZmxvb3IocmVtIC8gQ0hVTktfU0laRSk7XG4gICAgY29uc3QgbHggPSByZW0gJSBDSFVOS19TSVpFO1xuICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHg7XG4gICAgY29uc3QgeSA9IFlfTUlOICsgeUluZGV4O1xuICAgIGNvbnN0IHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIGUubSBhcyBNYXRJZCk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSB0aW1lIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgVGltZVN0YXRlIHsgdDogbnVtYmVyOyBkYXlMZW5ndGhTZWM6IG51bWJlcjsgcGF1c2VkOiBib29sZWFuOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBhZHZhbmNlVGltZShzOiBUaW1lU3RhdGUsIGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHMucGF1c2VkKSByZXR1cm47XG4gIHMudCA9IChzLnQgKyBkdCAvIHMuZGF5TGVuZ3RoU2VjKSAlIDE7XG59XG4iLCAiLy8gVGVycmFpbiBxdWVyeSBsYXllciBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMiBTeXN0ZW0gMTogb25lIHNoYXJlZCwgY2FjaGVkIGNvbnRyYWN0IGZvciBjb25zdHJ1Y3Rpb24sIGZhcm1pbmcsXG4vLyBtb3ZlbWVudCwgbmF2aWdhdGlvbiBhbmQgdGhlIEFJIGFnZW50LiBUaGVzZSBxdWVyaWVzIGRlc2NyaWJlIHRoZVxuLy8gYXV0aG9yaXRhdGl2ZSB2b3hlbCB2b2x1bWU7IHRoZXkgbmV2ZXIgbXV0YXRlIGl0IGFuZCBuZXZlciBjcmVhdGUgYSBzZWNvbmRcbi8vIHRlcnJhaW4gcmVwcmVzZW50YXRpb24uXG4vL1xuLy8gQ29udmVudGlvbnM6XG4vLyAgICogeC96IGFyZSBpbnRlZ2VyIGNvbHVtbiBjb29yZGluYXRlcyBpbiBbLTEwMjQsIDEwMjQpLlxuLy8gICAqIHkgaXMgYW4gaW50ZWdlciB2b3hlbCBjb29yZGluYXRlIGluIFstMTYsIDExMikuXG4vLyAgICogc3VyZmFjZVkgaXMgdGhlIGV4cG9zZWQgdG9wIGZhY2UgKHRvcFNvbGlkICsgMSksIG1hdGNoaW5nIE0wMDEuXG4vLyAgICogQSByZWN0IGlzIGluY2x1c2l2ZSBvbiBhbGwgZm91ciBlZGdlcy5cbmltcG9ydCB7XG4gIFdvcmxkLCBNYXRJZCwgTUFULCBTRUFfTEVWRUwsIFlfTUlOLCBZX01BWCwgSEFMRixcbiAgc3VyZmFjZUF0LCB0b3BNYXRlcmlhbEF0V29ybGQsIGdldFZveGVsLCBpc1NvbGlkLFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgQWN0aXZlRW50aXR5S2luZCwgRW50aXR5S2luZCwgaXNSZXRpcmVkU3RvbmVLaW5kLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVjdCB7XG4gIHgwOiBudW1iZXI7XG4gIHowOiBudW1iZXI7XG4gIHgxOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxSZWdpb24gZXh0ZW5kcyBSZWN0IHtcbiAgeTA6IG51bWJlcjtcbiAgeTE6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVJlY3QocmVjdDogUmVjdCk6IFJlY3Qge1xuICByZXR1cm4ge1xuICAgIHgwOiBNYXRoLm1pbihyZWN0LngwLCByZWN0LngxKSxcbiAgICB6MDogTWF0aC5taW4ocmVjdC56MCwgcmVjdC56MSksXG4gICAgeDE6IE1hdGgubWF4KHJlY3QueDAsIHJlY3QueDEpLFxuICAgIHoxOiBNYXRoLm1heChyZWN0LnowLCByZWN0LnoxKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RDb2x1bW5zKHJlY3Q6IFJlY3QpOiBudW1iZXIge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgcmV0dXJuIChyLngxIC0gci54MCArIDEpICogKHIuejEgLSByLnowICsgMSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0Q29udGFpbnMocmVjdDogUmVjdCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHggPj0gcmVjdC54MCAmJiB4IDw9IHJlY3QueDEgJiYgeiA+PSByZWN0LnowICYmIHogPD0gcmVjdC56MTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cGFuZFJlY3QocmVjdDogUmVjdCwgYW1vdW50OiBudW1iZXIpOiBSZWN0IHtcbiAgcmV0dXJuIHtcbiAgICB4MDogcmVjdC54MCAtIGFtb3VudCxcbiAgICB6MDogcmVjdC56MCAtIGFtb3VudCxcbiAgICB4MTogcmVjdC54MSArIGFtb3VudCxcbiAgICB6MTogcmVjdC56MSArIGFtb3VudCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RUb1JlZ2lvbihyZWN0OiBSZWN0LCB5MCA9IFlfTUlOLCB5MSA9IFlfTUFYIC0gMSk6IFZveGVsUmVnaW9uIHtcbiAgcmV0dXJuIHsgLi4ubm9ybWFsaXplUmVjdChyZWN0KSwgeTAsIHkxIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpb25zT3ZlcmxhcChhOiBWb3hlbFJlZ2lvbiwgYjogVm94ZWxSZWdpb24pOiBib29sZWFuIHtcbiAgcmV0dXJuIGEueDAgPD0gYi54MSAmJiBhLngxID49IGIueDAgJiYgYS56MCA8PSBiLnoxICYmIGEuejEgPj0gYi56MFxuICAgICYmIGEueTAgPD0gYi55MSAmJiBhLnkxID49IGIueTA7XG59XG5cbi8qKiBJbmNsdXNpdmUgY29udGFpbm1lbnQgb2YgYSB2b3hlbCBpbiBhIHdvcmsgZW52ZWxvcGUuICovXG5leHBvcnQgZnVuY3Rpb24gZW52ZWxvcGVDb250YWlucyhyZWN0czogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBmb3IgKGNvbnN0IHIgb2YgcmVjdHMpIHtcbiAgICBpZiAoeCA+PSByLngwICYmIHggPD0gci54MSAmJiB5ID49IHIueTAgJiYgeSA8PSByLnkxICYmIHogPj0gci56MCAmJiB6IDw9IHIuejEpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWluQ29sdW1uIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIC8qKiBFeHBvc2VkIHRvcCBmYWNlIG9mIHRoZSBzb2xpZCBjb2x1bW47IHRoZSBmaXJzdCBhaXIgY2VsbCBhYm92ZSBpdC4gKi9cbiAgc3VyZmFjZVk6IG51bWJlcjtcbiAgLyoqIFRoZSBoaWdoZXN0IHNvbGlkIHZveGVsLCBvciBZX01JTiAtIDEgaWYgdGhlIGNvbHVtbiBoYXMgbm8gc29saWQuICovXG4gIHRvcFNvbGlkWTogbnVtYmVyO1xuICB0b3BNYXRlcmlhbDogTWF0SWQ7XG4gIHNvbGlkOiBib29sZWFuO1xuICAvKiogV2F0ZXIgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UsIHVwIHRvIHNlYSBsZXZlbC4gMCBvbiBkcnkgbGFuZC4gKi9cbiAgd2F0ZXJEZXB0aDogbnVtYmVyO1xuICB1bmRlcndhdGVyOiBib29sZWFuO1xuICAvKiogTGFyZ2VzdCA0LW5laWdoYm91ciBzdXJmYWNlIHN0ZXAgaW4gbWV0cmVzICgxID0gYSBzaW5nbGUgdm94ZWwgcmlzZXIpLiAqL1xuICBzbG9wZTogbnVtYmVyO1xuICAvKiogRnJlZSBhaXIgY2VsbHMgYWJvdmUgdGhlIHN1cmZhY2UsIGNhcHBlZCBhdCBDTEVBUkFOQ0VfUFJPQkUuICovXG4gIGNsZWFyYW5jZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgQ0xFQVJBTkNFX1BST0JFID0gODtcblxuZnVuY3Rpb24gc3VyZmFjZUF0U2FmZSh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBmYWxsYmFjazogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbGxiYWNrO1xuICByZXR1cm4gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuLyoqIFdhdGVyIGRlcHRoIHRoYXQgcmVzcGVjdHMgYSBkcnkgcGl0IGJlbG93IHNlYSBsZXZlbCAodW5saWtlIGhlaWdodCBhbG9uZSkuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0Q29sdW1uKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHN1cmZhY2UgPj0gU0VBX0xFVkVMKSByZXR1cm4gMDtcbiAgaWYgKGdldFZveGVsKHdvcmxkLCB4LCBTRUFfTEVWRUwgLSAxLCB6KSAhPT0gTUFULldBVEVSKSByZXR1cm4gMDtcbiAgcmV0dXJuIFNFQV9MRVZFTCAtIHN1cmZhY2U7XG59XG5cbi8qKiBUcnVlIHdoZW4gYGhlaWdodGAgYWlyIGNlbGxzIGFib3ZlIHRoZSBzdXJmYWNlIGFyZSBmcmVlIG9mIHNvbGlkIG9yIHdhdGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyYW5jZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGhlaWdodDsgaSsrKSB7XG4gICAgaWYgKGdldFZveGVsKHdvcmxkLCB4LCBzdXJmYWNlICsgaSwgeikgIT09IE1BVC5BSVIpIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbHVtbkF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBUZXJyYWluQ29sdW1uIHtcbiAgY29uc3QgY3ggPSBNYXRoLmZsb29yKHgpLCBjeiA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHN1cmZhY2VZID0gc3VyZmFjZUF0KHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCB0b3BNYXRlcmlhbCA9IHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3Qgc29saWQgPSBzdXJmYWNlWSA+IFlfTUlOICYmIGlzU29saWQodG9wTWF0ZXJpYWwpO1xuICBjb25zdCB3YXRlckRlcHRoID0gd2F0ZXJEZXB0aEF0Q29sdW1uKHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3ggLSAxLCBjeiwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4ICsgMSwgY3osIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCwgY3ogLSAxLCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3gsIGN6ICsgMSwgc3VyZmFjZVkpKSxcbiAgKTtcbiAgbGV0IGNsZWFyYW5jZSA9IDA7XG4gIHdoaWxlIChjbGVhcmFuY2UgPCBDTEVBUkFOQ0VfUFJPQkUgJiYgZ2V0Vm94ZWwod29ybGQsIGN4LCBzdXJmYWNlWSArIGNsZWFyYW5jZSwgY3opID09PSBNQVQuQUlSKSB7XG4gICAgY2xlYXJhbmNlKys7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICB4OiBjeCwgejogY3osIHN1cmZhY2VZLCB0b3BTb2xpZFk6IHN1cmZhY2VZIC0gMSwgdG9wTWF0ZXJpYWwsXG4gICAgc29saWQsIHdhdGVyRGVwdGgsIHVuZGVyd2F0ZXI6IHdhdGVyRGVwdGggPiAwLCBzbG9wZSwgY2xlYXJhbmNlLFxuICB9O1xufVxuXG4vLyBFbnRpdHkgZm9vdHByaW50cyBhcmUgZGVsaWJlcmF0ZWx5IGV4cGxpY2l0LiBBIHRyZWUgb2NjdXBpZXMgbW9yZSBzaXRlIHRoYW5cbi8vIGl0cyB0cnVuazsgYSBwZWJibGUgb2NjdXBpZXMgbGVzcyB0aGFuIGEgYm91bGRlci4gVGhlc2UgYXJlIHNpbXVsYXRpb25cbi8vIGNsZWFyYW5jZSByYWRpaSwgbm90IHJlbmRlciBib3VuZHMuXG5leHBvcnQgY29uc3QgT0JTVFJVQ1RJT05fUkFESVVTOiBSZWNvcmQ8QWN0aXZlRW50aXR5S2luZCwgbnVtYmVyPiA9IHtcbiAgc3R5bF90cmVlX3NwaXJlOiAxLjUsXG4gIHN0eWxfdHJlZV90YWJsZTogMS44LFxuICBzdHlsX3RyZWVfY2x1c3RlcjogMS45LFxuICBzdHlsX3RyZWVfYmxvc3NvbTogMS42LFxuICBzdHlsX3NocnViOiAwLjYsXG4gIHN0eWxfb3JlOiAwLjksXG4gIHN0eWxfY2Fpcm46IDAuOCxcbiAgd2F5c3RvbmU6IDEuNCxcbiAgbWFya2VyOiAwLjUsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIE9ic3RydWN0aW9uIHtcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJhZGl1czogbnVtYmVyO1xuICAvKiogRm9vdHByaW50IGNlbGxzIG92ZXJsYXBwZWQgYnkgdGhpcyBlbnRpdHkuICovXG4gIGNlbGxzOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUNodW5rc0ZvclJlY3Qod29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0KTogc3RyaW5nW10ge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgLy8gQSByZWN0IG93bnMgd2hvbGUgdm94ZWwgY2VsbHMuIEluY2x1ZGUgZXZlcnkgY2h1bmsgd2hvc2Ugcm9vdCBjb3VsZCBvdmVybGFwXG4gIC8vIHRob3NlIGNlbGxzLCB3aXRob3V0IHNjYW5uaW5nIHRoZSBlbnRpcmUgMjA0OCBtIHdvcmxkLlxuICBjb25zdCByYWRpdXMgPSBNYXRoLm1heCguLi5PYmplY3QudmFsdWVzKE9CU1RSVUNUSU9OX1JBRElVUyksIDEuNSk7XG4gIGNvbnN0IG1pbkNlbGxYID0gTWF0aC5mbG9vcihyLngwICsgMC41IC0gcmFkaXVzKTtcbiAgY29uc3QgbWF4Q2VsbFggPSBNYXRoLmNlaWwoci54MSArIDAuNSArIHJhZGl1cykgLSAxO1xuICBjb25zdCBtaW5DZWxsWiA9IE1hdGguZmxvb3Ioci56MCArIDAuNSAtIHJhZGl1cyk7XG4gIGNvbnN0IG1heENlbGxaID0gTWF0aC5jZWlsKHIuejEgKyAwLjUgKyByYWRpdXMpIC0gMTtcbiAgY29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgY3gwID0gTWF0aC5tYXgoMCwgd29ybGRUb0NodW5rWChtaW5DZWxsWCkpLCBjeDEgPSB3b3JsZFRvQ2h1bmtYKG1heENlbGxYKTtcbiAgY29uc3QgY3owID0gTWF0aC5tYXgoMCwgd29ybGRUb0NodW5rWihtaW5DZWxsWikpLCBjejEgPSB3b3JsZFRvQ2h1bmtaKG1heENlbGxaKTtcbiAgZm9yIChsZXQgY3ogPSBjejA7IGN6IDw9IGN6MTsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY3gwOyBjeCA8PSBjeDE7IGN4KyspIGtleXMucHVzaChjaHVua0tleShjeCwgY3opKTtcbiAgfVxuICByZXR1cm4ga2V5cztcbn1cblxuLyoqIEVudGl0aWVzIHdob3NlIHNpbXVsYXRpb24gZm9vdHByaW50IG92ZXJsYXBzIHRoZSByZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9ic3RydWN0aW9uc0luKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCk6IE9ic3RydWN0aW9uW10ge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBvdXQ6IE9ic3RydWN0aW9uW10gPSBbXTtcbiAgZm9yIChjb25zdCBrZXkgb2YgZW50aXR5Q2h1bmtzRm9yUmVjdCh3b3JsZCwgcikpIHtcbiAgICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFpZHMpIGNvbnRpbnVlO1xuICAgIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgICBpZiAoc2Vlbi5oYXMoaWQpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgY29udGludWU7XG4gICAgICBzZWVuLmFkZChpZCk7XG4gICAgICBjb25zdCByYWRpdXMgPSBpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKVxuICAgICAgICA/IGUua2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyAwLjYgOiBlLmtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDEuMSA6IDEuNVxuICAgICAgICA6IE9CU1RSVUNUSU9OX1JBRElVU1tlLmtpbmQgYXMgQWN0aXZlRW50aXR5S2luZF07XG4gICAgICBsZXQgY2VsbHMgPSAwO1xuICAgICAgY29uc3QgZXgwID0gTWF0aC5tYXgoci54MCwgTWF0aC5mbG9vcihlLnggLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV4MSA9IE1hdGgubWluKHIueDEsIE1hdGguY2VpbChlLnggKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MCA9IE1hdGgubWF4KHIuejAsIE1hdGguZmxvb3IoZS56IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejEgPSBNYXRoLm1pbihyLnoxLCBNYXRoLmNlaWwoZS56ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBmb3IgKGxldCB6ID0gZXowOyB6IDw9IGV6MTsgeisrKSB7XG4gICAgICAgIGZvciAobGV0IHggPSBleDA7IHggPD0gZXgxOyB4KyspIHtcbiAgICAgICAgICBpZiAoTWF0aC5oeXBvdChlLnggLSAoeCArIDAuNSksIGUueiAtICh6ICsgMC41KSkgPD0gcmFkaXVzKSBjZWxscysrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY2VsbHMgPiAwKSB7XG4gICAgICAgIG91dC5wdXNoKHsgZW50aXR5SWQ6IGUuaWQsIGtpbmQ6IGUua2luZCwgeDogZS54LCB6OiBlLnosIHJhZGl1cywgY2VsbHMgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIG91dC5zb3J0KChhLCBiKSA9PiAoYS5lbnRpdHlJZCA8IGIuZW50aXR5SWQgPyAtMSA6IGEuZW50aXR5SWQgPiBiLmVudGl0eUlkID8gMSA6IDApKTtcbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcmVhU3RhdHMge1xuICByZWN0OiBSZWN0O1xuICBjb2x1bW5zOiBudW1iZXI7XG4gIG1pblk6IG51bWJlcjtcbiAgbWF4WTogbnVtYmVyO1xuICBtZWFuWTogbnVtYmVyO1xuICByZWxpZWY6IG51bWJlcjtcbiAgbWF4U3RlcDogbnVtYmVyO1xuICB3YXRlckNvbHVtbnM6IG51bWJlcjtcbiAgc3RvbmVDb2x1bW5zOiBudW1iZXI7XG4gIG1hdGVyaWFsczogUmVjb3JkPG51bWJlciwgbnVtYmVyPjtcbiAgb2JzdHJ1Y3Rpb25zOiBPYnN0cnVjdGlvbltdO1xuICBvYnN0cnVjdGVkQ29sdW1uczogbnVtYmVyO1xuICAvKiogQ3V0L2ZpbGwgcmVsYXRpdmUgdG8gZmxvb3JZIHdoZW4gc3VwcGxpZWQsIG90aGVyd2lzZSAwLiAqL1xuICBmbG9vclk6IG51bWJlciB8IG51bGw7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VwcG9ydFN1bW1hcnkge1xuICB0b3RhbDogbnVtYmVyO1xuICBsZXZlbDogbnVtYmVyO1xuICBjdXQ6IG51bWJlcjtcbiAgZmlsbDogbnVtYmVyO1xuICB3YXRlcjogbnVtYmVyO1xuICAvKiogRmlsbCBkZWVwZXIgdGhhbiA4IG07IGEgdmFsaWRhdG9yIG1heSByZWplY3QgdGhlc2UgYXMgdW5zdXBwb3J0ZWQuICovXG4gIGRlZXBGaWxsOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRm9vdHByaW50UXVlcnkge1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgc3RhdHM6IEFyZWFTdGF0cztcbiAgc3VwcG9ydDogU3VwcG9ydFN1bW1hcnk7XG4gIG9ic3RydWN0aW9uczogT2JzdHJ1Y3Rpb25bXTtcbiAgLyoqIENlbGxzIGluIHRoZSBidWlsZGluZyB2b2x1bWUgYWJvdmUgdGhlIHByZXBhcmVkIGZsb29yIHRoYXQgYXJlIG5vdCBhaXIuICovXG4gIG92ZXJoYW5nQ2VsbHM6IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgbWF0ZXJpYWw6IE1hdElkIH0+O1xufVxuXG4vKipcbiAqIENhY2hlZCBxdWVyeSBjb250ZXh0LiBDYWNoZXMgYXJlIGtleWVkIG9uIHdvcmxkLnJldmlzaW9uOiBhIHZveGVsIG9yIGVudGl0eVxuICogZWRpdCBpbnZhbGlkYXRlcyB0aGVtLCB3aGlsZSBtZXNoL25hdiByZWJ1aWxkcyBkbyBub3QuIFVzZSBvbmUgY29udGV4dCBmb3IgYVxuICogc2l0ZSBzZWFyY2ggb3IgYSBmb290cHJpbnQgZXZhbHVhdGlvbiwgdGhlbiBkaXNjYXJkIGl0LlxuICovXG5leHBvcnQgY2xhc3MgVGVycmFpblF1ZXJ5IHtcbiAgcHJpdmF0ZSBjYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBUZXJyYWluQ29sdW1uPigpO1xuICBwcml2YXRlIG9ic3RydWN0aW9uQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgT2JzdHJ1Y3Rpb25bXT4oKTtcbiAgcHJpdmF0ZSByZXZpc2lvbjogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSB3b3JsZDogV29ybGQpIHtcbiAgICB0aGlzLnJldmlzaW9uID0gd29ybGQucmV2aXNpb247XG4gIH1cblxuICBwcml2YXRlIHN5bmMoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMucmV2aXNpb24gIT09IHRoaXMud29ybGQucmV2aXNpb24pIHtcbiAgICAgIHRoaXMuY2FjaGUuY2xlYXIoKTtcbiAgICAgIHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5jbGVhcigpO1xuICAgICAgdGhpcy5yZXZpc2lvbiA9IHRoaXMud29ybGQucmV2aXNpb247XG4gICAgfVxuICB9XG5cbiAgLyoqIENhY2hlZCBlbnRpdHkgb2JzdHJ1Y3Rpb25zIGZvciBvbmUgZm9vdHByaW50LiAqL1xuICBvYnN0cnVjdGlvbnNGb3IocmVjdDogUmVjdCk6IE9ic3RydWN0aW9uW10ge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGNvbnN0IGtleSA9IGAke3IueDB9LCR7ci56MH0sJHtyLngxfSwke3IuejF9YDtcbiAgICBsZXQgbGlzdCA9IHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAoIWxpc3QpIHtcbiAgICAgIGxpc3QgPSBvYnN0cnVjdGlvbnNJbih0aGlzLndvcmxkLCByKTtcbiAgICAgIHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5zZXQoa2V5LCBsaXN0KTtcbiAgICB9XG4gICAgcmV0dXJuIGxpc3Q7XG4gIH1cblxuICBjb2x1bW4oeDogbnVtYmVyLCB6OiBudW1iZXIpOiBUZXJyYWluQ29sdW1uIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCBjeCA9IE1hdGguZmxvb3IoeCksIGN6ID0gTWF0aC5mbG9vcih6KTtcbiAgICBjb25zdCBrZXkgPSBgJHtjeH0sJHtjen1gO1xuICAgIGxldCBjb2wgPSB0aGlzLmNhY2hlLmdldChrZXkpO1xuICAgIGlmICghY29sKSB7XG4gICAgICBjb2wgPSBjb2x1bW5BdCh0aGlzLndvcmxkLCBjeCwgY3opO1xuICAgICAgdGhpcy5jYWNoZS5zZXQoa2V5LCBjb2wpO1xuICAgIH1cbiAgICByZXR1cm4gY29sO1xuICB9XG5cbiAgYXJlYShyZWN0OiBSZWN0LCBmbG9vclk/OiBudW1iZXIpOiBBcmVhU3RhdHMge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGxldCBtaW5ZID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICAgIGxldCBtYXhZID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICAgIGxldCBzdW0gPSAwO1xuICAgIGxldCBtYXhTdGVwID0gMDtcbiAgICBsZXQgd2F0ZXJDb2x1bW5zID0gMDtcbiAgICBsZXQgc3RvbmVDb2x1bW5zID0gMDtcbiAgICBsZXQgY3V0Vm9sdW1lID0gMDtcbiAgICBsZXQgZmlsbFZvbHVtZSA9IDA7XG4gICAgbGV0IG1heEN1dCA9IDA7XG4gICAgbGV0IG1heEZpbGwgPSAwO1xuICAgIGNvbnN0IG1hdGVyaWFsczogUmVjb3JkPG51bWJlciwgbnVtYmVyPiA9IHt9O1xuXG4gICAgZm9yIChsZXQgeiA9IHIuejA7IHogPD0gci56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gci54MDsgeCA8PSByLngxOyB4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gdGhpcy5jb2x1bW4oeCwgeik7XG4gICAgICAgIG1pblkgPSBNYXRoLm1pbihtaW5ZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBtYXhZID0gTWF0aC5tYXgobWF4WSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgc3VtICs9IGNvbC5zdXJmYWNlWTtcbiAgICAgICAgbWF4U3RlcCA9IE1hdGgubWF4KG1heFN0ZXAsIGNvbC5zbG9wZSk7XG4gICAgICAgIGlmIChjb2wud2F0ZXJEZXB0aCA+IDApIHdhdGVyQ29sdW1ucysrO1xuICAgICAgICBpZiAoY29sLnRvcE1hdGVyaWFsID09PSBNQVQuU1RPTkUpIHN0b25lQ29sdW1ucysrO1xuICAgICAgICBtYXRlcmlhbHNbY29sLnRvcE1hdGVyaWFsXSA9IChtYXRlcmlhbHNbY29sLnRvcE1hdGVyaWFsXSA/PyAwKSArIDE7XG4gICAgICAgIGlmIChmbG9vclkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGNvbnN0IGR5ID0gY29sLnN1cmZhY2VZIC0gZmxvb3JZO1xuICAgICAgICAgIGlmIChkeSA+IDApIHtcbiAgICAgICAgICAgIGN1dFZvbHVtZSArPSBkeTtcbiAgICAgICAgICAgIG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZHkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZHkgPCAwKSB7XG4gICAgICAgICAgICBmaWxsVm9sdW1lICs9IC1keTtcbiAgICAgICAgICAgIG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCAtZHkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG9ic3RydWN0aW9ucyA9IHRoaXMub2JzdHJ1Y3Rpb25zRm9yKHIpO1xuICAgIGNvbnN0IG9ic3RydWN0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IG8gb2Ygb2JzdHJ1Y3Rpb25zKSB7XG4gICAgICBjb25zdCByYWRpdXMgPSBvLnJhZGl1cztcbiAgICAgIGNvbnN0IGV4MCA9IE1hdGgubWF4KHIueDAsIE1hdGguZmxvb3Ioby54IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBleDEgPSBNYXRoLm1pbihyLngxLCBNYXRoLmNlaWwoby54ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejAgPSBNYXRoLm1heChyLnowLCBNYXRoLmZsb29yKG8ueiAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXoxID0gTWF0aC5taW4oci56MSwgTWF0aC5jZWlsKG8ueiArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgZm9yIChsZXQgeiA9IGV6MDsgeiA8PSBlejE7IHorKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gZXgwOyB4IDw9IGV4MTsgeCsrKSB7XG4gICAgICAgICAgaWYgKE1hdGguaHlwb3Qoby54IC0gKHggKyAwLjUpLCBvLnogLSAoeiArIDAuNSkpIDw9IHJhZGl1cykgb2JzdHJ1Y3RlZC5hZGQoYCR7eH0sJHt6fWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgY29sdW1ucyA9IChyLngxIC0gci54MCArIDEpICogKHIuejEgLSByLnowICsgMSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlY3Q6IHIsXG4gICAgICBjb2x1bW5zLFxuICAgICAgbWluWSwgbWF4WSxcbiAgICAgIG1lYW5ZOiBNYXRoLnJvdW5kKChzdW0gLyBjb2x1bW5zKSAqIDEwMDApIC8gMTAwMCxcbiAgICAgIHJlbGllZjogbWF4WSAtIG1pblksXG4gICAgICBtYXhTdGVwLFxuICAgICAgd2F0ZXJDb2x1bW5zLFxuICAgICAgc3RvbmVDb2x1bW5zLFxuICAgICAgbWF0ZXJpYWxzLFxuICAgICAgb2JzdHJ1Y3Rpb25zLFxuICAgICAgb2JzdHJ1Y3RlZENvbHVtbnM6IG9ic3RydWN0ZWQuc2l6ZSxcbiAgICAgIGZsb29yWTogZmxvb3JZID8/IG51bGwsXG4gICAgICBjdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0LFxuICAgICAgbWF4RmlsbCxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEV2YWx1YXRlIGEgY29tcGxldGUgYnVpbGRpbmcgZm9vdHByaW50LiBgZmxvb3JZYCBpcyB0aGUgcHJlcGFyZWQgd2Fsa2luZ1xuICAgKiBmbG9vcjogdGVycmFpbiBhYm92ZSBpdCBpcyBjdXQsIHRlcnJhaW4gYmVsb3cgaXQgaXMgZmlsbGVkLiBUaGUgcmVzdWx0IGlzXG4gICAqIHJhdyBzaXRlIGRhdGE7IGNvbnN0cnVjdGlvbiBydWxlcyBsaXZlIGluIGNvbnN0cnVjdGlvbi50cy5cbiAgICovXG4gIGZvb3RwcmludChyZWN0OiBSZWN0LCBmbG9vclk6IG51bWJlcik6IEZvb3RwcmludFF1ZXJ5IHtcbiAgICBjb25zdCBzdGF0cyA9IHRoaXMuYXJlYShyZWN0LCBmbG9vclkpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGNvbnN0IHN1cHBvcnQ6IFN1cHBvcnRTdW1tYXJ5ID0ge1xuICAgICAgdG90YWw6IHN0YXRzLmNvbHVtbnMsIGxldmVsOiAwLCBjdXQ6IDAsIGZpbGw6IDAsIHdhdGVyOiAwLCBkZWVwRmlsbDogMCxcbiAgICAgIG1heEN1dDogMCwgbWF4RmlsbDogMCwgY3V0Vm9sdW1lOiAwLCBmaWxsVm9sdW1lOiAwLFxuICAgIH07XG4gICAgY29uc3Qgb3ZlcmhhbmdDZWxsczogRm9vdHByaW50UXVlcnlbJ292ZXJoYW5nQ2VsbHMnXSA9IFtdO1xuXG4gICAgZm9yIChsZXQgeiA9IHIuejA7IHogPD0gci56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gci54MDsgeCA8PSByLngxOyB4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gdGhpcy5jb2x1bW4oeCwgeik7XG4gICAgICAgIGNvbnN0IGR5ID0gY29sLnN1cmZhY2VZIC0gZmxvb3JZO1xuICAgICAgICBpZiAoZHkgPiAwKSB7XG4gICAgICAgICAgc3VwcG9ydC5jdXQrKztcbiAgICAgICAgICBzdXBwb3J0LmN1dFZvbHVtZSArPSBkeTtcbiAgICAgICAgICBzdXBwb3J0Lm1heEN1dCA9IE1hdGgubWF4KHN1cHBvcnQubWF4Q3V0LCBkeSk7XG4gICAgICAgIH0gZWxzZSBpZiAoZHkgPCAwKSB7XG4gICAgICAgICAgc3VwcG9ydC5maWxsKys7XG4gICAgICAgICAgc3VwcG9ydC5maWxsVm9sdW1lICs9IC1keTtcbiAgICAgICAgICBzdXBwb3J0Lm1heEZpbGwgPSBNYXRoLm1heChzdXBwb3J0Lm1heEZpbGwsIC1keSk7XG4gICAgICAgICAgaWYgKC1keSA+IDgpIHN1cHBvcnQuZGVlcEZpbGwrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdXBwb3J0LmxldmVsKys7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbC53YXRlckRlcHRoID4gMCkgc3VwcG9ydC53YXRlcisrO1xuXG4gICAgICAgIC8vIEFuIG92ZXJoYW5nIGlzIHRlcnJhaW4gYWJvdmUgdGhlIGZsb29yIHRoYXQgc3Vydml2ZXMgdGhlIGN1dCBwbGFuZS5cbiAgICAgICAgLy8gRm9yIGEgY29sdW1uIGJlbG93IHRoZSBmbG9vciwgaXRzIHNvbGlkIGJvZHkgaXMgZmlsbCwgbm90IG92ZXJoYW5nLlxuICAgICAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KGZsb29yWSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgZm9yIChsZXQgeSA9IHN0YXJ0OyB5IDwgc3RhcnQgKyA0OyB5KyspIHtcbiAgICAgICAgICBjb25zdCBtID0gZ2V0Vm94ZWwodGhpcy53b3JsZCwgeCwgeSwgeikgYXMgTWF0SWQ7XG4gICAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIG92ZXJoYW5nQ2VsbHMucHVzaCh7IHgsIHksIHosIG1hdGVyaWFsOiBtIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVjdDogciwgZmxvb3JZLCBzdGF0cywgc3VwcG9ydCwgb2JzdHJ1Y3Rpb25zOiBzdGF0cy5vYnN0cnVjdGlvbnMsIG92ZXJoYW5nQ2VsbHMgfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIG1vdmVtZW50IGNvbnRyYWN0IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV2Fsa1BhcmFtcyB7XG4gIG1heFN0ZXBVcDogbnVtYmVyO1xuICBtYXhTdGVwRG93bjogbnVtYmVyO1xuICBtYXhXYXRlckRlcHRoOiBudW1iZXI7XG4gIC8qKiBNYXhpbXVtIGFkamFjZW50IHN1cmZhY2Ugc3RlcDsgMS4wIGlzIGEgNDUgZGVncmVlIHZveGVsIHJpc2VyLiAqL1xuICBtYXhTbG9wZTogbnVtYmVyO1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfV0FMSzogV2Fsa1BhcmFtcyA9IHtcbiAgbWF4U3RlcFVwOiAxLjAsXG4gIG1heFN0ZXBEb3duOiAxLjUsXG4gIG1heFdhdGVyRGVwdGg6IDAuNCxcbiAgbWF4U2xvcGU6IDEuMCxcbiAgY2xlYXJhbmNlOiAyLjAsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdhbGtSZXN1bHQge1xuICBvazogYm9vbGVhbjtcbiAgcmVhc29uOiAnb2snIHwgJ25vdF9hZGphY2VudCcgfCAnc3RlcF91cCcgfCAnZmFsbCcgfCAnd2F0ZXInIHwgJ3Nsb3BlJyB8ICdjbGVhcmFuY2UnO1xuICBzdGVwOiBudW1iZXI7XG4gIHdhdGVyRGVwdGg6IG51bWJlcjtcbn1cblxuLyoqIEV2YWx1YXRlIG9uZSBncmlkIHN0ZXAuIFBhdGhzIGFyZSB2YWxpZGF0ZWQgd2l0aCB0aGUgc2FtZSBjb250cmFjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YWxrU3RlcChcbiAgd29ybGQ6IFdvcmxkLCBmcm9tWDogbnVtYmVyLCBmcm9tWjogbnVtYmVyLCB0b1g6IG51bWJlciwgdG9aOiBudW1iZXIsXG4gIHBhcmFtczogV2Fsa1BhcmFtcyA9IERFRkFVTFRfV0FMSyxcbik6IFdhbGtSZXN1bHQge1xuICBjb25zdCBkeCA9IE1hdGguYWJzKE1hdGguZmxvb3IodG9YKSAtIE1hdGguZmxvb3IoZnJvbVgpKTtcbiAgY29uc3QgZHogPSBNYXRoLmFicyhNYXRoLmZsb29yKHRvWikgLSBNYXRoLmZsb29yKGZyb21aKSk7XG4gIGlmIChkeCArIGR6ICE9PSAxKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdub3RfYWRqYWNlbnQnLCBzdGVwOiAwLCB3YXRlckRlcHRoOiAwIH07XG4gIH1cbiAgY29uc3QgZnJvbSA9IGNvbHVtbkF0KHdvcmxkLCBmcm9tWCwgZnJvbVopO1xuICBjb25zdCB0byA9IGNvbHVtbkF0KHdvcmxkLCB0b1gsIHRvWik7XG4gIGNvbnN0IHN0ZXAgPSB0by5zdXJmYWNlWSAtIGZyb20uc3VyZmFjZVk7XG4gIGlmIChzdGVwID4gcGFyYW1zLm1heFN0ZXBVcCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzdGVwX3VwJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAoLXN0ZXAgPiBwYXJhbXMubWF4U3RlcERvd24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnZmFsbCcsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKHRvLndhdGVyRGVwdGggPiBwYXJhbXMubWF4V2F0ZXJEZXB0aCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICd3YXRlcicsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKHRvLnNsb3BlID4gcGFyYW1zLm1heFNsb3BlKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3Nsb3BlJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAoIWNsZWFyYW5jZUF0KHdvcmxkLCB0b1gsIHRvWiwgcGFyYW1zLmNsZWFyYW5jZSkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2NsZWFyYW5jZScsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgfVxuICByZXR1cm4geyBvazogdHJ1ZSwgcmVhc29uOiAnb2snLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG59XG5cbi8qKiBFZmZlY3RpdmUgZ3JhZGUgb2YgYSBzdHJhaWdodCBwYXRoIHNlZ21lbnQsIHVzZWQgYnkgcGF0aCB2YWxpZGF0aW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVmZmVjdGl2ZUdyYWRlKHdvcmxkOiBXb3JsZCwgeDA6IG51bWJlciwgejA6IG51bWJlciwgeDE6IG51bWJlciwgejE6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGEgPSBjb2x1bW5BdCh3b3JsZCwgeDAsIHowKTtcbiAgY29uc3QgYiA9IGNvbHVtbkF0KHdvcmxkLCB4MSwgejEpO1xuICBjb25zdCBydW4gPSBNYXRoLmh5cG90KHgxIC0geDAsIHoxIC0gejApO1xuICBpZiAocnVuID09PSAwKSByZXR1cm4gTWF0aC5hYnMoYi5zdXJmYWNlWSAtIGEuc3VyZmFjZVkpO1xuICByZXR1cm4gTWF0aC5hYnMoYi5zdXJmYWNlWSAtIGEuc3VyZmFjZVkpIC8gcnVuO1xufVxuIiwgIi8vIE0wMDIgc2l0ZSB2YWxpZGF0aW9uLCBjYW5kaWRhdGUgc2VhcmNoIGFuZCBwcmV2aWV3IFx1MjAxNCBwdXJlIHNpbXVsYXRpb24uXG4vL1xuLy8gVGhpcyBpcyB0aGUgc2hhcmVkIGdhdGUgZm9yIHRoZSBwbGF5ZXIgYW5kIHRoZSBBSSBhZ2VudC4gTmVpdGhlciBtYXkgcGxhY2UgYVxuLy8gc3RydWN0dXJlIGJ5IGFueSBvdGhlciBwYXRoOiBib3RoIHN1Ym1pdCBhIFNpdGVQcm9wb3NhbCwgYm90aCByZWNlaXZlIHRoZVxuLy8gc2FtZSBTaXRlVmFsaWRhdGlvbiwgYW5kIGJvdGggbXVzdCBwYXNzIHRoZSBBdXRob3JpemVyIGJlZm9yZSBleGVjdXRpb24uXG4vL1xuLy8gVGhlIHZhbGlkYXRvciBkZXNjcmliZXMgdGhlIHNpdGUgYXMgaXQgaXMuIEl0IGRvZXMgbm90IGVkaXQgdm94ZWxzLCByZW1vdmVcbi8vIGVudGl0aWVzIG9yIHNwZW5kIHJlc291cmNlcy4gUHJlcGFyYXRpb24gaXMgYSBzZXBhcmF0ZSwgYXV0aG9yaXplZCBzdGVwLlxuaW1wb3J0IHsgV29ybGQsIEhBTEYsIFlfTUlOLCBZX01BWCwgc3VyZmFjZUF0IH0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBSZWN0LCBWb3hlbFJlZ2lvbiwgRm9vdHByaW50UXVlcnksIFRlcnJhaW5RdWVyeSwgQXJlYVN0YXRzLFxuICBub3JtYWxpemVSZWN0LCBleHBhbmRSZWN0LCByZWN0Q29sdW1ucywgZWZmZWN0aXZlR3JhZGUsIHdhbGtTdGVwLCBXYWxrUGFyYW1zLFxuICBERUZBVUxUX1dBTEssIGNvbHVtbkF0LFxufSBmcm9tICcuL3RlcnJhaW4nO1xuXG5leHBvcnQgdHlwZSBTaXRlU3RhdGUgPSAndmFsaWQnIHwgJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nIHwgJ2ludmFsaWQnO1xuXG5leHBvcnQgdHlwZSBWYWxpZGF0aW9uQ29kZSA9XG4gIHwgJ291dF9vZl9ib3VuZHMnXG4gIHwgJ2Zvb3RwcmludF9taXNtYXRjaCdcbiAgfCAnc2xvcGVfZXhjZWVkZWQnXG4gIHwgJ3N0ZXBfZXhjZWVkZWQnXG4gIHwgJ2N1dF9leGNlZWRlZCdcbiAgfCAnZmlsbF9leGNlZWRlZCdcbiAgfCAnY3V0X3ZvbHVtZV9leGNlZWRlZCdcbiAgfCAnZmlsbF92b2x1bWVfZXhjZWVkZWQnXG4gIHwgJ2Zvb3RwcmludF9vYnN0cnVjdGVkJ1xuICB8ICd3YXRlcidcbiAgfCAnb3ZlcmhhbmcnXG4gIHwgJ25lZWRzX2dyYWRpbmcnXG4gIHwgJ25lZWRzX2NsZWFyaW5nJztcblxuZXhwb3J0IGludGVyZmFjZSBWYWxpZGF0aW9uUmVhc29uIHtcbiAgY29kZTogVmFsaWRhdGlvbkNvZGU7XG4gIHNldmVyaXR5OiAnZXJyb3InIHwgJ3ByZXBhcmF0aW9uJztcbiAgbWVzc2FnZTogc3RyaW5nO1xuICB2YWx1ZT86IG51bWJlcjtcbiAgbGltaXQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIEZvdW5kYXRpb25UeXBlID0gJ2dyYWRlZF9wYWQnIHwgJ3N0ZXBwZWRfcGxpbnRoJyB8ICdkZWNrJztcblxuZXhwb3J0IGludGVyZmFjZSBCdWlsZGluZ1J1bGVzIHtcbiAgaWQ6IHN0cmluZztcbiAgd2lkdGg6IG51bWJlcjtcbiAgZGVwdGg6IG51bWJlcjtcbiAgd2FsbEhlaWdodDogbnVtYmVyO1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbiAgLyoqIFJlbGllZiBhdCBvciBiZWxvdyB0aGlzIG5lZWRzIG5vIGdyYWRpbmcgdG8gYmUgY2FsbGVkIHZhbGlkLiAqL1xuICBtYXhSZWxpZWZOb1ByZXA6IG51bWJlcjtcbiAgLyoqIFJlbGllZiBhYm92ZSB0aGlzIGNhbm5vdCBiZSBwcmVwYXJlZCBieSB0aGlzIGJ1aWxkaW5nIHR5cGUuICovXG4gIG1heFJlbGllZlByZXBhcmVkOiBudW1iZXI7XG4gIG1heFN0ZXA6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgbWF4Q3V0Vm9sdW1lOiBudW1iZXI7XG4gIG1heEZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4T2JzdHJ1Y3Rpb25zOiBudW1iZXI7XG4gIHJlcXVpcmVzRHJ5OiBib29sZWFuO1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uVHlwZTtcbn1cblxuZXhwb3J0IGNvbnN0IEhPVVNFX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ2hvdXNlLTh4NicsXG4gIHdpZHRoOiA4LFxuICBkZXB0aDogNixcbiAgd2FsbEhlaWdodDogMyxcbiAgY2xlYXJhbmNlOiAzLFxuICBtYXhSZWxpZWZOb1ByZXA6IDEuMixcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDQuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAyLFxuICBtYXhGaWxsOiAyLFxuICBtYXhDdXRWb2x1bWU6IDQ4LFxuICBtYXhGaWxsVm9sdW1lOiA0OCxcbiAgbWF4T2JzdHJ1Y3Rpb25zOiAwLFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ2dyYWRlZF9wYWQnLFxufTtcblxuZXhwb3J0IGNvbnN0IEZBUk1fUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAnZmFybS0xMng4JyxcbiAgd2lkdGg6IDEyLFxuICBkZXB0aDogOCxcbiAgd2FsbEhlaWdodDogMCxcbiAgY2xlYXJhbmNlOiAxLFxuICBtYXhSZWxpZWZOb1ByZXA6IDEuMixcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDYuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAyLFxuICBtYXhGaWxsOiAyLFxuICBtYXhDdXRWb2x1bWU6IDk2LFxuICBtYXhGaWxsVm9sdW1lOiA5NixcbiAgbWF4T2JzdHJ1Y3Rpb25zOiA0LFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ3N0ZXBwZWRfcGxpbnRoJyxcbn07XG5cbmV4cG9ydCBjb25zdCBQQVRIX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ3BhdGgtOXgzJyxcbiAgd2lkdGg6IDksXG4gIGRlcHRoOiAzLFxuICB3YWxsSGVpZ2h0OiAwLFxuICBjbGVhcmFuY2U6IDEsXG4gIG1heFJlbGllZk5vUHJlcDogMi4wLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNC4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDEsXG4gIG1heEZpbGw6IDEsXG4gIG1heEN1dFZvbHVtZTogMzIsXG4gIG1heEZpbGxWb2x1bWU6IDMyLFxuICBtYXhPYnN0cnVjdGlvbnM6IDIsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnZGVjaycsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVQcm9wb3NhbCB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25TdW1tYXJ5IHtcbiAgbmVlZHNHcmFkaW5nOiBib29sZWFuO1xuICBuZWVkc0NsZWFyaW5nOiBib29sZWFuO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBvYnN0cnVjdGlvbklkczogc3RyaW5nW107XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25UeXBlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVWYWxpZGF0aW9uIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHN0YXRlOiBTaXRlU3RhdGU7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgcXVlcnk6IEZvb3RwcmludFF1ZXJ5O1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25TdW1tYXJ5O1xufVxuXG5mdW5jdGlvbiBlcnJvcihjb2RlOiBWYWxpZGF0aW9uQ29kZSwgbWVzc2FnZTogc3RyaW5nLCB2YWx1ZT86IG51bWJlciwgbGltaXQ/OiBudW1iZXIpOiBWYWxpZGF0aW9uUmVhc29uIHtcbiAgcmV0dXJuIHsgY29kZSwgc2V2ZXJpdHk6ICdlcnJvcicsIG1lc3NhZ2UsIHZhbHVlLCBsaW1pdCB9O1xufVxuXG5mdW5jdGlvbiBwcmVwKGNvZGU6IFZhbGlkYXRpb25Db2RlLCBtZXNzYWdlOiBzdHJpbmcsIHZhbHVlPzogbnVtYmVyLCBsaW1pdD86IG51bWJlcik6IFZhbGlkYXRpb25SZWFzb24ge1xuICByZXR1cm4geyBjb2RlLCBzZXZlcml0eTogJ3ByZXBhcmF0aW9uJywgbWVzc2FnZSwgdmFsdWUsIGxpbWl0IH07XG59XG5cbi8qKlxuICogVmFsaWRhdGUgYSBwcm9wb3NlZCBzaXRlIGFnYWluc3QgaXRzIGJ1aWxkaW5nIHJ1bGVzLiBQdXJlOiBubyB2b3hlbHMsXG4gKiBlbnRpdGllcyBvciByZXNvdXJjZXMgY2hhbmdlLiBgcXVlcnlgIG1heSBiZSBzdXBwbGllZCBieSBhIHNlYXJjaCB0byByZXVzZVxuICogdGhlIGNhY2hlZCBjb2x1bW5zLCBhbmQgYGZvb3RwcmludGAgbWF5IGJlIHN1cHBsaWVkIHdoZW4gdGhlIGNhbGxlciBhbHJlYWR5XG4gKiBldmFsdWF0ZWQgdGhlIHNhbWUgcmVjdC9mbG9vciBwYWlyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVTaXRlKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCksXG4gIGZvb3RwcmludD86IEZvb3RwcmludFF1ZXJ5LFxuKTogU2l0ZVZhbGlkYXRpb24ge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgcnVsZXMgPSBwcm9wb3NhbC5ydWxlcztcbiAgY29uc3QgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdID0gW107XG4gIGNvbnN0IGZwID0gZm9vdHByaW50ID8/IHF1ZXJ5LmZvb3RwcmludChyZWN0LCBwcm9wb3NhbC5mbG9vclkpO1xuICBjb25zdCBzdGF0cyA9IGZwLnN0YXRzO1xuXG4gIGlmIChyZWN0LngwIDwgLUhBTEYgfHwgcmVjdC56MCA8IC1IQUxGIHx8IHJlY3QueDEgPj0gSEFMRiB8fCByZWN0LnoxID49IEhBTEYpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoJ291dF9vZl9ib3VuZHMnLCBgZm9vdHByaW50ICR7cmVjdC54MH0sJHtyZWN0LnowfS4uJHtyZWN0LngxfSwke3JlY3QuejF9IGlzIG91dHNpZGUgdGhlIHdvcmxkYCkpO1xuICB9XG4gIGlmIChyZWN0LngxIC0gcmVjdC54MCArIDEgIT09IHJ1bGVzLndpZHRoIHx8IHJlY3QuejEgLSByZWN0LnowICsgMSAhPT0gcnVsZXMuZGVwdGgpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZm9vdHByaW50X21pc21hdGNoJyxcbiAgICAgIGBmb290cHJpbnQgaXMgJHtyZWN0LngxIC0gcmVjdC54MCArIDF9IHggJHtyZWN0LnoxIC0gcmVjdC56MCArIDF9IG0sICR7cnVsZXMud2lkdGh9IHggJHtydWxlcy5kZXB0aH0gbSByZXF1aXJlZGAsXG4gICAgKSk7XG4gIH1cblxuICBpZiAoc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnc2xvcGVfZXhjZWVkZWQnLFxuICAgICAgYHJlbGllZiAke3N0YXRzLnJlbGllZn0gbSBleGNlZWRzIHRoZSAke3J1bGVzLm1heFJlbGllZlByZXBhcmVkfSBtIHByZXBhcmVkIGxpbWl0YCxcbiAgICAgIHN0YXRzLnJlbGllZiwgcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heFN0ZXAgPiBydWxlcy5tYXhTdGVwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3N0ZXBfZXhjZWVkZWQnLFxuICAgICAgYHN1cmZhY2Ugc3RlcCAke3N0YXRzLm1heFN0ZXB9IG0gZXhjZWVkcyAke3J1bGVzLm1heFN0ZXB9IG1gLFxuICAgICAgc3RhdHMubWF4U3RlcCwgcnVsZXMubWF4U3RlcCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4Q3V0ID4gcnVsZXMubWF4Q3V0KSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2N1dF9leGNlZWRlZCcsXG4gICAgICBgY3V0ICR7c3RhdHMubWF4Q3V0fSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXR9IG1gLFxuICAgICAgc3RhdHMubWF4Q3V0LCBydWxlcy5tYXhDdXQsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEZpbGwgPiBydWxlcy5tYXhGaWxsKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2ZpbGxfZXhjZWVkZWQnLFxuICAgICAgYGZpbGwgJHtzdGF0cy5tYXhGaWxsfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsfSBtYCxcbiAgICAgIHN0YXRzLm1heEZpbGwsIHJ1bGVzLm1heEZpbGwsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLmN1dFZvbHVtZSA+IHJ1bGVzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdjdXRfdm9sdW1lX2V4Y2VlZGVkJyxcbiAgICAgIGBjdXQgdm9sdW1lICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXRWb2x1bWV9IG1cdTAwQjNgLFxuICAgICAgc3RhdHMuY3V0Vm9sdW1lLCBydWxlcy5tYXhDdXRWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLmZpbGxWb2x1bWUgPiBydWxlcy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2ZpbGxfdm9sdW1lX2V4Y2VlZGVkJyxcbiAgICAgIGBmaWxsIHZvbHVtZSAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEZpbGxWb2x1bWV9IG1cdTAwQjNgLFxuICAgICAgc3RhdHMuZmlsbFZvbHVtZSwgcnVsZXMubWF4RmlsbFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAocnVsZXMucmVxdWlyZXNEcnkgJiYgc3RhdHMud2F0ZXJDb2x1bW5zID4gMCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICd3YXRlcicsXG4gICAgICBgJHtzdGF0cy53YXRlckNvbHVtbnN9IGZvb3RwcmludCBjb2x1bW5zIGFyZSB1bmRlcndhdGVyYCxcbiAgICAgIHN0YXRzLndhdGVyQ29sdW1ucywgMCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IHJ1bGVzLm1heE9ic3RydWN0aW9ucykge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmb290cHJpbnRfb2JzdHJ1Y3RlZCcsXG4gICAgICBgJHtzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgZXhjZWVkIHRoZSAke3J1bGVzLm1heE9ic3RydWN0aW9uc30gYWxsb3dhbmNlYCxcbiAgICAgIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGgsIHJ1bGVzLm1heE9ic3RydWN0aW9ucyxcbiAgICApKTtcbiAgfVxuICBpZiAoZnAub3ZlcmhhbmdDZWxscy5sZW5ndGggPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ292ZXJoYW5nJyxcbiAgICAgIGAke2ZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RofSBjZWxscyBhYm92ZSB0aGUgZmxvb3IgYXJlIGJsb2NrZWRgLFxuICAgICAgZnAub3ZlcmhhbmdDZWxscy5sZW5ndGgsIDAsXG4gICAgKSk7XG4gIH1cblxuICBjb25zdCBuZWVkc0dyYWRpbmcgPSBzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZOb1ByZXBcbiAgICB8fCBzdGF0cy5jdXRWb2x1bWUgPiAwIHx8IHN0YXRzLmZpbGxWb2x1bWUgPiAwO1xuICBjb25zdCBuZWVkc0NsZWFyaW5nID0gc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDBcbiAgICAmJiBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoIDw9IHJ1bGVzLm1heE9ic3RydWN0aW9ucztcblxuICBpZiAobmVlZHNHcmFkaW5nKSB7XG4gICAgcmVhc29ucy5wdXNoKHByZXAoXG4gICAgICAnbmVlZHNfZ3JhZGluZycsXG4gICAgICBgZ3JhZGluZyByZXF1aXJlZDogJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgY3V0LCAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZmlsbGAsXG4gICAgICBzdGF0cy5jdXRWb2x1bWUgKyBzdGF0cy5maWxsVm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChuZWVkc0NsZWFyaW5nKSB7XG4gICAgcmVhc29ucy5wdXNoKHByZXAoXG4gICAgICAnbmVlZHNfY2xlYXJpbmcnLFxuICAgICAgYCR7c3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIHRvIGNsZWFyYCxcbiAgICAgIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGgsIHJ1bGVzLm1heE9ic3RydWN0aW9ucyxcbiAgICApKTtcbiAgfVxuXG4gIGNvbnN0IGhhc0Vycm9yID0gcmVhc29ucy5zb21lKChyKSA9PiByLnNldmVyaXR5ID09PSAnZXJyb3InKTtcbiAgY29uc3QgaGFzUHJlcCA9IHJlYXNvbnMuc29tZSgocikgPT4gci5zZXZlcml0eSA9PT0gJ3ByZXBhcmF0aW9uJyk7XG4gIGNvbnN0IHN0YXRlOiBTaXRlU3RhdGUgPSBoYXNFcnJvciA/ICdpbnZhbGlkJyA6IGhhc1ByZXAgPyAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicgOiAndmFsaWQnO1xuXG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgc3RhdGUsXG4gICAgcmVhc29ucyxcbiAgICBxdWVyeTogZnAsXG4gICAgcHJlcGFyYXRpb246IHtcbiAgICAgIG5lZWRzR3JhZGluZyxcbiAgICAgIG5lZWRzQ2xlYXJpbmcsXG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgICBvYnN0cnVjdGlvbklkczogc3RhdHMub2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCksXG4gICAgICBmb3VuZGF0aW9uOiBydWxlcy5mb3VuZGF0aW9uLFxuICAgIH0sXG4gIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2FuZGlkYXRlIHNlYXJjaCAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFNlYXJjaE9wdGlvbnMge1xuICAvKiogQ2FuZGlkYXRlIGdyaWQgc3RlcCBpbiBtZXRyZXMuIERlZmF1bHQgMi4gKi9cbiAgc3RlcD86IG51bWJlcjtcbiAgbWF4UmVzdWx0cz86IG51bWJlcjtcbiAgYW5jaG9yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBtYXhEaXN0YW5jZT86IG51bWJlcjtcbiAgLyoqIEhhcmQgY29uc3RyYWludDogY2FuZGlkYXRlIGNlbnRyZSBtdXN0IGxpZSB3aXRoaW4gdGhpcyByYWRpdXMgb2YgYSBwb2ludC4gKi9cbiAgbmVhcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IG1heERpc3RhbmNlOiBudW1iZXIgfTtcbiAgLyoqIERvIG5vdCByZXR1cm4gdHdvIGNhbmRpZGF0ZXMgd2hvc2UgZm9vdHByaW50cyBvdmVybGFwLiBEZWZhdWx0IHRydWUuICovXG4gIGRpc3RpbmN0PzogYm9vbGVhbjtcbiAgLyoqIFdhbGwtY2xvY2sgYnVkZ2V0IGZvciB0aGUgc2Nhbi4gRGVmYXVsdCAxMDAgbXMuICovXG4gIGJ1ZGdldE1zPzogbnVtYmVyO1xuICB3YWxrPzogV2Fsa1BhcmFtcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlQ2FuZGlkYXRlIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBzdGF0ZTogJ3ZhbGlkJyB8ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJztcbiAgdmFsaWRhdGlvbjogU2l0ZVZhbGlkYXRpb247XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uQ291bnQ6IG51bWJlcjtcbiAgZGlzdGFuY2U6IG51bWJlcjtcbiAgc2NvcmU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlU2VhcmNoUmVzdWx0IHtcbiAgY2FuZGlkYXRlczogU2l0ZUNhbmRpZGF0ZVtdO1xuICBldmFsdWF0ZWQ6IG51bWJlcjtcbiAgcmVqZWN0ZWQ6IG51bWJlcjtcbiAgZWxhcHNlZE1zOiBudW1iZXI7XG4gIGJ1ZGdldE1zOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhlIHdhbGwtY2xvY2sgYnVkZ2V0IHN0b3BwZWQgdGhlIHNjYW4gYmVmb3JlIHRoZSBhcmVhIHdhcyBleGhhdXN0ZWQuICovXG4gIHRydW5jYXRlZDogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gZmxvb3JDYW5kaWRhdGVzKHN0YXRzOiBBcmVhU3RhdHMpOiBudW1iZXJbXSB7XG4gIGNvbnN0IG1lYW4gPSBNYXRoLnJvdW5kKHN0YXRzLm1lYW5ZKTtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGZvciAobGV0IGQgPSAtMTsgZCA8PSAxOyBkKyspIHNldC5hZGQobWVhbiArIGQpO1xuICBzZXQuYWRkKHN0YXRzLm1pblkpO1xuICBzZXQuYWRkKHN0YXRzLm1heFkpO1xuICByZXR1cm4gWy4uLnNldF0uZmlsdGVyKCh5KSA9PiB5ID49IFlfTUlOICYmIHkgPCBZX01BWCkuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xufVxuXG5mdW5jdGlvbiBvdmVybGFwcyhhOiBSZWN0LCBiOiBSZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejA7XG59XG5cbmZ1bmN0aW9uIGNhbmRpZGF0ZVNjb3JlKHY6IFNpdGVWYWxpZGF0aW9uLCBkaXN0YW5jZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgcHJlcFBlbmFsdHkgPSB2LnN0YXRlID09PSAndmFsaWQnID8gMCA6IDI1O1xuICBjb25zdCBncmFkaW5nID0gdi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUgKyB2LnByZXBhcmF0aW9uLmZpbGxWb2x1bWU7XG4gIGNvbnN0IGNsZWFyaW5nID0gdi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcy5sZW5ndGggKiA0O1xuICByZXR1cm4gcHJlcFBlbmFsdHkgKyBncmFkaW5nICsgY2xlYXJpbmcgKyBkaXN0YW5jZSAqIDAuMjU7XG59XG5cbi8qKlxuICogU2VhcmNoIGEgYm91bmRlZCBhcmVhIGZvciB2aWFibGUgZm9vdHByaW50cy4gVGhlIHNhbWUgdmFsaWRhdG9yIGFuZCB0aGUgc2FtZVxuICogZmxvb3Itc2VsZWN0aW9uIHBvbGljeSBhcmUgdXNlZCBieSB0aGUgQUkgYWdlbnQgYW5kIHRoZSBwbGF5ZXIncyBidWlsZFxuICogcHJldmlldy4gU2VhcmNoIGlzIHJlYWQtb25seS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlYXJjaFNpdGVzKFxuICB3b3JsZDogV29ybGQsIHJ1bGVzOiBCdWlsZGluZ1J1bGVzLCBhcmVhOiBSZWN0LCBvcHRpb25zOiBTZWFyY2hPcHRpb25zID0ge30sXG4pOiBTaXRlU2VhcmNoUmVzdWx0IHtcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3Qgc3RlcCA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3Iob3B0aW9ucy5zdGVwID8/IDIpKTtcbiAgY29uc3QgbWF4UmVzdWx0cyA9IE1hdGgubWF4KDEsIG9wdGlvbnMubWF4UmVzdWx0cyA/PyA4KTtcbiAgY29uc3QgZGlzdGluY3QgPSBvcHRpb25zLmRpc3RpbmN0ICE9PSBmYWxzZTtcbiAgY29uc3QgbWF4RGlzdGFuY2UgPSBvcHRpb25zLm1heERpc3RhbmNlID8/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgY29uc3QgYnVkZ2V0TXMgPSBvcHRpb25zLmJ1ZGdldE1zID8/IDEwMDtcbiAgY29uc3QgYW5jaG9yID0gb3B0aW9ucy5hbmNob3IgPz8geyB4OiAoYXJlYS54MCArIGFyZWEueDEpIC8gMiwgejogKGFyZWEuejAgKyBhcmVhLnoxKSAvIDIgfTtcbiAgY29uc3QgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKTtcbiAgY29uc3QgYWxsOiBTaXRlQ2FuZGlkYXRlW10gPSBbXTtcbiAgbGV0IGV2YWx1YXRlZCA9IDA7XG4gIGxldCByZWplY3RlZCA9IDA7XG4gIGxldCB0cnVuY2F0ZWQgPSBmYWxzZTtcblxuICBjb25zdCB4MU1heCA9IGFyZWEueDEgLSBydWxlcy53aWR0aCArIDE7XG4gIGNvbnN0IHoxTWF4ID0gYXJlYS56MSAtIHJ1bGVzLmRlcHRoICsgMTtcbiAgc2NhbjogZm9yIChsZXQgeiA9IGFyZWEuejA7IHogPD0gejFNYXg7IHogKz0gc3RlcCkge1xuICAgIGZvciAobGV0IHggPSBhcmVhLngwOyB4IDw9IHgxTWF4OyB4ICs9IHN0ZXApIHtcbiAgICAgIGNvbnN0IHJlY3QgPSB7IHgwOiB4LCB6MDogeiwgeDE6IHggKyBydWxlcy53aWR0aCAtIDEsIHoxOiB6ICsgcnVsZXMuZGVwdGggLSAxIH07XG4gICAgICBjb25zdCBjeCA9IChyZWN0LngwICsgcmVjdC54MSkgLyAyO1xuICAgICAgY29uc3QgY3ogPSAocmVjdC56MCArIHJlY3QuejEpIC8gMjtcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5oeXBvdChjeCAtIGFuY2hvci54LCBjeiAtIGFuY2hvci56KTtcbiAgICAgIGlmIChkaXN0YW5jZSA+IG1heERpc3RhbmNlKSBjb250aW51ZTtcbiAgICAgIGlmIChvcHRpb25zLm5lYXIpIHtcbiAgICAgICAgY29uc3QgbmVhckRpc3RhbmNlID0gTWF0aC5oeXBvdChjeCAtIG9wdGlvbnMubmVhci54LCBjeiAtIG9wdGlvbnMubmVhci56KTtcbiAgICAgICAgaWYgKG5lYXJEaXN0YW5jZSA+IG9wdGlvbnMubmVhci5tYXhEaXN0YW5jZSkgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0YXRzID0gcXVlcnkuYXJlYShyZWN0KTtcbiAgICAgIGxldCBiZXN0OiBTaXRlQ2FuZGlkYXRlIHwgbnVsbCA9IG51bGw7XG4gICAgICBmb3IgKGNvbnN0IGZsb29yWSBvZiBmbG9vckNhbmRpZGF0ZXMoc3RhdHMpKSB7XG4gICAgICAgIGV2YWx1YXRlZCsrO1xuICAgICAgICBjb25zdCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsID0ge1xuICAgICAgICAgIHNpdGVJZDogYCR7cnVsZXMuaWR9OiR7eH0sJHt6fSwke2Zsb29yWX1gLFxuICAgICAgICAgIHJlY3QsIGZsb29yWSwgcnVsZXMsXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGZvb3RwcmludCA9IHF1ZXJ5LmZvb3RwcmludChyZWN0LCBmbG9vclkpO1xuICAgICAgICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCwgcXVlcnksIGZvb3RwcmludCk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcpIHtcbiAgICAgICAgICByZWplY3RlZCsrO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHNjb3JlID0gY2FuZGlkYXRlU2NvcmUodmFsaWRhdGlvbiwgZGlzdGFuY2UpO1xuICAgICAgICBjb25zdCBjYW5kaWRhdGU6IFNpdGVDYW5kaWRhdGUgPSB7XG4gICAgICAgICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgICAgICAgcmVjdCxcbiAgICAgICAgICBmbG9vclksXG4gICAgICAgICAgc3RhdGU6IHZhbGlkYXRpb24uc3RhdGUsXG4gICAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgICAgICBjdXRWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uY3V0Vm9sdW1lLFxuICAgICAgICAgIGZpbGxWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZmlsbFZvbHVtZSxcbiAgICAgICAgICBvYnN0cnVjdGlvbkNvdW50OiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzLmxlbmd0aCxcbiAgICAgICAgICBkaXN0YW5jZSxcbiAgICAgICAgICBzY29yZSxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFiZXN0XG4gICAgICAgICAgfHwgKGNhbmRpZGF0ZS5zdGF0ZSA9PT0gJ3ZhbGlkJyAmJiBiZXN0LnN0YXRlICE9PSAndmFsaWQnKVxuICAgICAgICAgIHx8IChjYW5kaWRhdGUuc3RhdGUgPT09IGJlc3Quc3RhdGUgJiYgY2FuZGlkYXRlLnNjb3JlIDwgYmVzdC5zY29yZSkpIHtcbiAgICAgICAgICBiZXN0ID0gY2FuZGlkYXRlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYmVzdCkgYWxsLnB1c2goYmVzdCk7XG4gICAgfVxuICAgIGlmIChwZXJmb3JtYW5jZS5ub3coKSAtIHQwID4gYnVkZ2V0TXMpIHtcbiAgICAgIHRydW5jYXRlZCA9IHRydWU7XG4gICAgICBicmVhayBzY2FuO1xuICAgIH1cbiAgfVxuXG4gIGFsbC5zb3J0KChhLCBiKSA9PiBhLnNjb3JlIC0gYi5zY29yZSB8fCBhLmRpc3RhbmNlIC0gYi5kaXN0YW5jZVxuICAgIHx8IGEucmVjdC54MCAtIGIucmVjdC54MCB8fCBhLnJlY3QuejAgLSBiLnJlY3QuejApO1xuICBjb25zdCBzZWxlY3RlZDogU2l0ZUNhbmRpZGF0ZVtdID0gW107XG4gIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGFsbCkge1xuICAgIGlmIChkaXN0aW5jdCAmJiBzZWxlY3RlZC5zb21lKChzKSA9PiBvdmVybGFwcyhzLnJlY3QsIGNhbmRpZGF0ZS5yZWN0KSkpIGNvbnRpbnVlO1xuICAgIHNlbGVjdGVkLnB1c2goY2FuZGlkYXRlKTtcbiAgICBpZiAoc2VsZWN0ZWQubGVuZ3RoID49IG1heFJlc3VsdHMpIGJyZWFrO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5kaWRhdGVzOiBzZWxlY3RlZCxcbiAgICBldmFsdWF0ZWQsXG4gICAgcmVqZWN0ZWQsXG4gICAgZWxhcHNlZE1zOiBNYXRoLnJvdW5kKChwZXJmb3JtYW5jZS5ub3coKSAtIHQwKSAqIDEwMCkgLyAxMDAsXG4gICAgYnVkZ2V0TXMsXG4gICAgdHJ1bmNhdGVkLFxuICB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHByZXZpZXcgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBGb3VuZGF0aW9uUHJldmlldyB7XG4gIHR5cGU6IEZvdW5kYXRpb25UeXBlO1xuICAvKiogU3RvbmUgZmxvb3Igc2xhYiBwbHVzIGZpbGwgdW5kZXIgdGhlIHByZXBhcmVkIGZsb29yLiAqL1xuICBwbGludGhDZWxsczogbnVtYmVyO1xuICAvKiogUGVyaW1ldGVyIGNlbGxzIHRoYXQgbmVlZCBhIHJldGFpbmluZyBmYWNlIGJlY2F1c2Ugb2YgY3V0IG9yIGZpbGwuICovXG4gIHJldGFpbmluZ1dhbGxDZWxsczogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFjY2Vzc1ByZXZpZXcge1xuICBkb29yOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGRpc3RhbmNlOiBudW1iZXI7XG4gIGdyYWRlOiBudW1iZXI7XG4gIHdhbGthYmxlOiBib29sZWFuO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlUHJldmlldyB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgdGVycmFpbjoge1xuICAgIG1pblk6IG51bWJlcjtcbiAgICBtYXhZOiBudW1iZXI7XG4gICAgbWVhblk6IG51bWJlcjtcbiAgICByZWxpZWY6IG51bWJlcjtcbiAgICBtYXhTdGVwOiBudW1iZXI7XG4gICAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gICAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICAgIG1heEN1dDogbnVtYmVyO1xuICAgIG1heEZpbGw6IG51bWJlcjtcbiAgfTtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblByZXZpZXc7XG4gIG9ic3RydWN0aW9uczogQXJyYXk8e1xuICAgIGVudGl0eUlkOiBzdHJpbmc7XG4gICAga2luZDogc3RyaW5nO1xuICAgIHg6IG51bWJlcjtcbiAgICB6OiBudW1iZXI7XG4gICAgYWN0aW9uOiAnY2xlYXInIHwgJ2Jsb2NrZWQnO1xuICB9PjtcbiAgYWNjZXNzOiBBY2Nlc3NQcmV2aWV3IHwgbnVsbDtcbiAgLyoqIENvbXBsZXRlIHdvcmsgZW52ZWxvcGUgdGhpcyBwcmV2aWV3IHdvdWxkIGF1dGhvcml6ZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJldmlld09wdGlvbnMge1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgd2Fsaz86IFdhbGtQYXJhbXM7XG59XG5cbi8qKlxuICogQnVpbGQgdGhlIHRocmVlLXN0YXRlIHByZXZpZXcuIEl0IGlzIGRlbGliZXJhdGVseSBkYXRhLW9ubHk6IHRoZSByZW5kZXJlclxuICogY2FuIGRyYXcgaXQsIGJ1dCBpdCBuZXZlciBlZGl0cyB0ZXJyYWluIG9yIHNwZW5kcyByZXNvdXJjZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmV2aWV3U2l0ZShcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBvcHRpb25zOiBQcmV2aWV3T3B0aW9ucyA9IHt9LFxuKTogU2l0ZVByZXZpZXcge1xuICBjb25zdCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpO1xuICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCwgcXVlcnkpO1xuICBjb25zdCBmcCA9IHZhbGlkYXRpb24ucXVlcnk7XG4gIGNvbnN0IHN0YXRzID0gZnAuc3RhdHM7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCBydWxlcyA9IHByb3Bvc2FsLnJ1bGVzO1xuXG4gIGxldCBwZXJpbWV0ZXIgPSAwO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICAgIGlmICh4ICE9PSByZWN0LngwICYmIHggIT09IHJlY3QueDEgJiYgeiAhPT0gcmVjdC56MCAmJiB6ICE9PSByZWN0LnoxKSBjb250aW51ZTtcbiAgICAgIGlmIChjb2x1bW5BdCh3b3JsZCwgeCwgeikuc3VyZmFjZVkgIT09IHByb3Bvc2FsLmZsb29yWSkgcGVyaW1ldGVyKys7XG4gICAgfVxuICB9XG4gIGNvbnN0IGZvdW5kYXRpb246IEZvdW5kYXRpb25QcmV2aWV3ID0ge1xuICAgIHR5cGU6IHJ1bGVzLmZvdW5kYXRpb24sXG4gICAgcGxpbnRoQ2VsbHM6IHJlY3RDb2x1bW5zKHJlY3QpICsgc3RhdHMuZmlsbFZvbHVtZSxcbiAgICByZXRhaW5pbmdXYWxsQ2VsbHM6IHBlcmltZXRlcixcbiAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICB9O1xuXG4gIGxldCBhY2Nlc3M6IEFjY2Vzc1ByZXZpZXcgfCBudWxsID0gbnVsbDtcbiAgaWYgKG9wdGlvbnMuZG9vciAmJiBvcHRpb25zLmFwcHJvYWNoKSB7XG4gICAgY29uc3QgZG9vciA9IG9wdGlvbnMuZG9vcjtcbiAgICBjb25zdCBhcHByb2FjaCA9IG9wdGlvbnMuYXBwcm9hY2g7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguaHlwb3QoZG9vci54IC0gYXBwcm9hY2gueCwgZG9vci56IC0gYXBwcm9hY2gueik7XG4gICAgY29uc3Qgc3RlcHMgPSBNYXRoLm1heCgxLCBNYXRoLmNlaWwoZGlzdGFuY2UpKTtcbiAgICBsZXQgcHJldlggPSBhcHByb2FjaC54LCBwcmV2WiA9IGFwcHJvYWNoLno7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gc3RlcHM7IGkrKykge1xuICAgICAgY29uc3QgdCA9IGkgLyBzdGVwcztcbiAgICAgIGNvbnN0IHggPSBNYXRoLnJvdW5kKGFwcHJvYWNoLnggKyAoZG9vci54IC0gYXBwcm9hY2gueCkgKiB0KTtcbiAgICAgIGNvbnN0IHogPSBNYXRoLnJvdW5kKGFwcHJvYWNoLnogKyAoZG9vci56IC0gYXBwcm9hY2gueikgKiB0KTtcbiAgICAgIGlmICh4ID09PSBwcmV2WCAmJiB6ID09PSBwcmV2WikgY29udGludWU7XG4gICAgICBjb25zdCByZXN1bHQgPSB3YWxrU3RlcCh3b3JsZCwgcHJldlgsIHByZXZaLCB4LCB6LCBvcHRpb25zLndhbGsgPz8gREVGQVVMVF9XQUxLKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZWFzb25zLnB1c2goYCR7cmVzdWx0LnJlYXNvbn0gYXQgJHt4fSwke3p9YCk7XG4gICAgICBwcmV2WCA9IHg7IHByZXZaID0gejtcbiAgICB9XG4gICAgYWNjZXNzID0ge1xuICAgICAgZG9vciwgYXBwcm9hY2gsIGRpc3RhbmNlLFxuICAgICAgZ3JhZGU6IGVmZmVjdGl2ZUdyYWRlKHdvcmxkLCBhcHByb2FjaC54LCBhcHByb2FjaC56LCBkb29yLngsIGRvb3IueiksXG4gICAgICB3YWxrYWJsZTogcmVhc29ucy5sZW5ndGggPT09IDAsXG4gICAgICByZWFzb25zLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB5MCA9IHByb3Bvc2FsLmZsb29yWSAtIE1hdGgubWF4KDEsIHN0YXRzLm1heEN1dCkgLSAxO1xuICBjb25zdCB5MSA9IHByb3Bvc2FsLmZsb29yWSArIE1hdGgubWF4KHJ1bGVzLndhbGxIZWlnaHQsIDEpICsgMTtcbiAgY29uc3QgZW52ZWxvcGU6IFZveGVsUmVnaW9uW10gPSBbXG4gICAge1xuICAgICAgLi4uZXhwYW5kUmVjdChyZWN0LCAyKSxcbiAgICAgIHkwOiBNYXRoLm1heChZX01JTiwgeTApLFxuICAgICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgeTEpLFxuICAgIH0sXG4gIF07XG4gIGlmIChhY2Nlc3MpIHtcbiAgICBjb25zdCBheDAgPSBNYXRoLm1pbihhY2Nlc3MuZG9vci54LCBhY2Nlc3MuYXBwcm9hY2gueCkgLSAxO1xuICAgIGNvbnN0IGF4MSA9IE1hdGgubWF4KGFjY2Vzcy5kb29yLngsIGFjY2Vzcy5hcHByb2FjaC54KSArIDE7XG4gICAgY29uc3QgYXowID0gTWF0aC5taW4oYWNjZXNzLmRvb3IueiwgYWNjZXNzLmFwcHJvYWNoLnopIC0gMTtcbiAgICBjb25zdCBhejEgPSBNYXRoLm1heChhY2Nlc3MuZG9vci56LCBhY2Nlc3MuYXBwcm9hY2gueikgKyAxO1xuICAgIGNvbnN0IGFNaW4gPSBNYXRoLm1pbihzdXJmYWNlQXQod29ybGQsIGF4MCwgYXowKSwgc3VyZmFjZUF0KHdvcmxkLCBheDEsIGF6MSkpO1xuICAgIGNvbnN0IGFNYXggPSBNYXRoLm1heChzdXJmYWNlQXQod29ybGQsIGF4MCwgYXowKSwgc3VyZmFjZUF0KHdvcmxkLCBheDEsIGF6MSkpO1xuICAgIGVudmVsb3BlLnB1c2goe1xuICAgICAgeDA6IGF4MCwgeDE6IGF4MSwgejA6IGF6MCwgejE6IGF6MSxcbiAgICAgIHkwOiBNYXRoLm1heChZX01JTiwgYU1pbiAtIDIpLFxuICAgICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgYU1heCArIDIpLFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICBzdGF0ZTogdmFsaWRhdGlvbi5zdGF0ZSxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIHJ1bGVzLFxuICAgIHJlYXNvbnM6IHZhbGlkYXRpb24ucmVhc29ucyxcbiAgICB0ZXJyYWluOiB7XG4gICAgICBtaW5ZOiBzdGF0cy5taW5ZLFxuICAgICAgbWF4WTogc3RhdHMubWF4WSxcbiAgICAgIG1lYW5ZOiBzdGF0cy5tZWFuWSxcbiAgICAgIHJlbGllZjogc3RhdHMucmVsaWVmLFxuICAgICAgbWF4U3RlcDogc3RhdHMubWF4U3RlcCxcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICB9LFxuICAgIGZvdW5kYXRpb24sXG4gICAgb2JzdHJ1Y3Rpb25zOiBzdGF0cy5vYnN0cnVjdGlvbnMubWFwKChvKSA9PiAoe1xuICAgICAgZW50aXR5SWQ6IG8uZW50aXR5SWQsXG4gICAgICBraW5kOiBvLmtpbmQsXG4gICAgICB4OiBvLngsXG4gICAgICB6OiBvLnosXG4gICAgICBhY3Rpb246IHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJyA/ICdibG9ja2VkJyA6ICdjbGVhcicsXG4gICAgfSkpLFxuICAgIGFjY2VzcyxcbiAgICBlbnZlbG9wZSxcbiAgfTtcbn1cblxuIiwgIi8vIENhbm9uaWNhbCBzdGF0ZSBoYXNoaW5nIFx1MjAxNCBwdXJlIHNpbXVsYXRpb24sIG5vIHRocmVlLmpzIGltcG9ydHMuXG4vL1xuLy8gVGhlIG5vLWZsYXR0ZW4gcHJvb2YgY29tcGFyZXMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lIG91dHNpZGUgdGhlXG4vLyBjb21wbGV0ZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUuIEl0IGRlbGliZXJhdGVseSBkb2VzIG5vdCBoYXNoIGNodW5rXG4vLyBoZWlnaHRzL3RvcE1hdGVyaWFscyAoZGVyaXZlZCBjYWNoZXMpLCBtZXNoIGdlb21ldHJ5LCBzdHJlYW1pbmcgc3RhdGUgb3Jcbi8vIG5hdmlnYXRpb24gZGF0YS4gVGhvc2UgYXJlIGNoZWNrZWQgc2VwYXJhdGVseSBhcyBkZXJpdmVkIHN0YXRlLCBzbyBhIGNhY2hlXG4vLyBvciBtZXNoIHJlYnVpbGQgY2FuIG5ldmVyIGJlIG1pc3Rha2VuIGZvciBhIHRlcnJhaW4gbXV0YXRpb24uXG5pbXBvcnQge1xuICBXb3JsZCwgWV9NSU4sIFlfTUFYLCBIQUxGLCBDSFVOS19TSVpFLCBDSFVOS19BUkVBLFxuICBlbnN1cmVDaHVuaywgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCwgaXNTb2xpZCxcbiAgRW50aXR5LFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IFZveGVsUmVnaW9uLCBlbnZlbG9wZUNvbnRhaW5zIH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0YXRlSGFzaCB7XG4gIC8qKiAxNiBoZXggY2hhcmFjdGVyczogdHdvIGluZGVwZW5kZW50IDMyLWJpdCBsYW5lcy4gKi9cbiAgaGFzaDogc3RyaW5nO1xuICBjZWxsczogbnVtYmVyO1xuICBleGNsdWRlZENlbGxzOiBudW1iZXI7XG4gIGNodW5rczogbnVtYmVyO1xuICByZWdpb246IFZveGVsUmVnaW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlTWlzbWF0Y2gge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgZmllbGQ6ICdoZWlnaHQnIHwgJ21hdGVyaWFsJztcbiAgZXhwZWN0ZWQ6IG51bWJlcjtcbiAgYWN0dWFsOiBudW1iZXI7XG59XG5cbmNsYXNzIEhhc2hlciB7XG4gIHByaXZhdGUgYSA9IDB4ODExYzlkYzU7XG4gIHByaXZhdGUgYiA9IDB4OWUzNzc5Yjk7XG5cbiAgYnl0ZSh2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCB4ID0gdiAmIDB4ZmY7XG4gICAgdGhpcy5hID0gTWF0aC5pbXVsKHRoaXMuYSBeIHgsIDB4MDEwMDAxOTMpO1xuICAgIHRoaXMuYiA9IE1hdGguaW11bCh0aGlzLmIgXiAoeCArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICB0aGlzLmIgXj0gdGhpcy5iID4+PiAxMztcbiAgfVxuXG4gIHUzMih2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBsZXQgbiA9IHYgPj4+IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA0OyBpKyspIHtcbiAgICAgIHRoaXMuYnl0ZShuKTtcbiAgICAgIG4gPj4+PSA4O1xuICAgIH1cbiAgfVxuXG4gIHN0cmluZyhzOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLnUzMihzLmxlbmd0aCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSsrKSB0aGlzLmJ5dGUocy5jaGFyQ29kZUF0KGkpKTtcbiAgfVxuXG4gIGhleCgpOiBzdHJpbmcge1xuICAgIHJldHVybiAodGhpcy5hID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICAgKyAodGhpcy5iID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXBSZWdpb24ocmVnaW9uOiBWb3hlbFJlZ2lvbik6IFZveGVsUmVnaW9uIHtcbiAgY29uc3QgcjogVm94ZWxSZWdpb24gPSB7XG4gICAgeDA6IE1hdGgubWF4KC1IQUxGLCBNYXRoLmZsb29yKHJlZ2lvbi54MCkpLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgTWF0aC5mbG9vcihyZWdpb24uejApKSxcbiAgICB4MTogTWF0aC5taW4oSEFMRiAtIDEsIE1hdGguZmxvb3IocmVnaW9uLngxKSksXG4gICAgejE6IE1hdGgubWluKEhBTEYgLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi56MSkpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgTWF0aC5mbG9vcihyZWdpb24ueTApKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi55MSkpLFxuICB9O1xuICBpZiAoci54MCA+IHIueDEgfHwgci56MCA+IHIuejEgfHwgci55MCA+IHIueTEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYGVtcHR5IHZveGVsIHJlZ2lvbiAke0pTT04uc3RyaW5naWZ5KHJlZ2lvbil9YCk7XG4gIH1cbiAgcmV0dXJuIHI7XG59XG5cbi8qKiBTb3J0IGFuIGVudmVsb3BlIHNvIGl0cyBoYXNoIGlzIGluZGVwZW5kZW50IG9mIHJlY3Qgb3JkZXIuICovXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplRW52ZWxvcGUocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBWb3hlbFJlZ2lvbltdIHtcbiAgcmV0dXJuIHJlY3RzXG4gICAgLm1hcCgocikgPT4gKHtcbiAgICAgIHgwOiBNYXRoLmZsb29yKHIueDApLCB6MDogTWF0aC5mbG9vcihyLnowKSwgeDE6IE1hdGguZmxvb3Ioci54MSksIHoxOiBNYXRoLmZsb29yKHIuejEpLFxuICAgICAgeTA6IE1hdGguZmxvb3Ioci55MCksIHkxOiBNYXRoLmZsb29yKHIueTEpLFxuICAgIH0pKVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLngwIC0gYi54MCB8fCBhLnowIC0gYi56MCB8fCBhLnkwIC0gYi55MFxuICAgICAgfHwgYS54MSAtIGIueDEgfHwgYS56MSAtIGIuejEgfHwgYS55MSAtIGIueTEpO1xufVxuXG4vKiogTWF0ZXJpYWxpc2UgZXZlcnkgY2h1bmsgdGhhdCBvdmVybGFwcyB0aGUgcmVnaW9uIGFuZCByZXR1cm4gc29ydGVkIGtleXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IHdvcmxkVG9DaHVua1goci54MCksIGN4MSA9IHdvcmxkVG9DaHVua1goci54MSk7XG4gIGNvbnN0IGN6MCA9IHdvcmxkVG9DaHVua1ooci56MCksIGN6MSA9IHdvcmxkVG9DaHVua1ooci56MSk7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2N4fSwke2N6fSBpcyBvdXRzaWRlIHRoZSB3b3JsZGApO1xuICAgICAga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICAgIH1cbiAgfVxuICBrZXlzLnNvcnQoKTtcbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKlxuICogSGFzaCB0aGUgYXV0aG9yaXRhdGl2ZSBtYXRlcmlhbCBieXRlIG9mIGV2ZXJ5IHZveGVsIGluIGByZWdpb25gLCBleGNsdWRpbmdcbiAqIGV2ZXJ5IHZveGVsIGluc2lkZSBgZXhjbHVkZWAuIFR3byBjYWxscyB3aXRoIHRoZSBzYW1lIHJlZ2lvbiBhbmQgZW52ZWxvcGVcbiAqIGFyZSBkaXJlY3RseSBjb21wYXJhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsUmVnaW9uSGFzaChcbiAgd29ybGQ6IFdvcmxkLFxuICByZWdpb246IFZveGVsUmVnaW9uLFxuICBleGNsdWRlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdID0gW10sXG4pOiBTdGF0ZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3QgZW52ZWxvcGUgPSBub3JtYWxpemVFbnZlbG9wZShleGNsdWRlKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnZveGVsLXN0YXRlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpOyBoLnUzMihyLnkwKTsgaC51MzIoci55MSk7XG4gIGgudTMyKGVudmVsb3BlLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgZSBvZiBlbnZlbG9wZSkge1xuICAgIGgudTMyKGUueDApOyBoLnUzMihlLnowKTsgaC51MzIoZS54MSk7IGgudTMyKGUuejEpOyBoLnUzMihlLnkwKTsgaC51MzIoZS55MSk7XG4gIH1cblxuICBsZXQgY2VsbHMgPSAwO1xuICBsZXQgZXhjbHVkZWRDZWxscyA9IDA7XG4gIGNvbnN0IHlpMCA9IHIueTAgLSBZX01JTjtcbiAgY29uc3QgeWkxID0gci55MSAtIFlfTUlOO1xuXG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IHlpID0geWkwOyB5aSA8PSB5aTE7IHlpKyspIHtcbiAgICAgIGNvbnN0IHkgPSBZX01JTiArIHlpO1xuICAgICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgICBjb25zdCB6ID0gb3ogKyBsejtcbiAgICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICAgIGNvbnN0IHggPSBveCArIGx4O1xuICAgICAgICAgIGlmIChlbnZlbG9wZS5sZW5ndGggPiAwICYmIGVudmVsb3BlQ29udGFpbnMoZW52ZWxvcGUsIHgsIHksIHopKSB7XG4gICAgICAgICAgICBleGNsdWRlZENlbGxzKys7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaC5ieXRlKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeWksIGx6KV0pO1xuICAgICAgICAgIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjZWxscywgZXhjbHVkZWRDZWxscywgY2h1bmtzOiBrZXlzLmxlbmd0aCwgcmVnaW9uOiByIH07XG59XG5cbi8qKiBDYW5vbmljYWwgaW52ZW50b3J5IGhhc2g7IGtleSBvcmRlciBjYW5ub3QgYWZmZWN0IHRoZSByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjppbnZlbnRvcnk6djEnKTtcbiAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHdvcmxkLmludmVudG9yeSkuc29ydCgpO1xuICBoLnUzMihrZXlzLmxlbmd0aCk7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBoLnN0cmluZyhrZXkpO1xuICAgIGgudTMyKHdvcmxkLmludmVudG9yeVtrZXldKTtcbiAgfVxuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGludmVudG9yeVNuYXBzaG90KHdvcmxkOiBXb3JsZCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMod29ybGQuaW52ZW50b3J5KS5zb3J0KCkpIG91dFtrZXldID0gd29ybGQuaW52ZW50b3J5W2tleV07XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGhhc2hFbnRpdHkoaDogSGFzaGVyLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaC5zdHJpbmcoZS5pZCk7XG4gIGguc3RyaW5nKGUua2luZCk7XG4gIGguc3RyaW5nKGUuY2h1bmspO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueCAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnkgKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS56ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUucm90ICogMTAwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnNjYWxlICogMTAwMCkpO1xuICBoLnUzMihlLnZhcmlhbnQpO1xuICBoLnN0cmluZyhlLnJlc291cmNlID8/ICcnKTtcbiAgaC51MzIoZS5yZW1haW5pbmcpO1xuICBoLnUzMihlLmhhcnZlc3RlZCA/IDEgOiAwKTtcbiAgaC51MzIoZS5oYXJ2ZXN0ZWRPbmNlID8gMSA6IDApO1xufVxuXG4vKiogSGFzaCBlbnRpdHkgc3RhdGU7IHdpdGggYSByZWdpb24sIG9ubHkgZW50aXRpZXMgcm9vdGVkIGluc2lkZSBpdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkOiBXb3JsZCwgcmVnaW9uPzogVm94ZWxSZWdpb24pOiBzdHJpbmcge1xuICBsZXQgZW50aXRpZXM6IEVudGl0eVtdO1xuICBpZiAocmVnaW9uKSB7XG4gICAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gICAgZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgICBlbnRpdGllcyA9IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uZmlsdGVyKFxuICAgICAgKGUpID0+IGUueCA+PSByLngwICYmIGUueCA8IHIueDEgKyAxICYmIGUueiA+PSByLnowICYmIGUueiA8IHIuejEgKyAxLFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgZW50aXRpZXMgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldO1xuICB9XG4gIGVudGl0aWVzLnNvcnQoKGEsIGIpID0+IChhLmlkIDwgYi5pZCA/IC0xIDogYS5pZCA+IGIuaWQgPyAxIDogMCkpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjplbnRpdHktc3RhdGU6djEnKTtcbiAgaC51MzIoZW50aXRpZXMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBlIG9mIGVudGl0aWVzKSBoYXNoRW50aXR5KGgsIGUpO1xuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuLyoqXG4gKiBDYW5vbmljYWwgaGFzaCBvZiBidWlsdCBzdHJ1Y3R1cmVzLiBMYXlvdXQgbW9kdWxlcyBhbmQgcGFpZCBjb3N0cyBhcmVcbiAqIGF1dGhvcml0YXRpdmUgc2ltdWxhdGlvbiBzdGF0ZTsgcmVuZGVyZXIgbWVzaGVzIGFyZSBub3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoKHdvcmxkOiBXb3JsZCk6IHN0cmluZyB7XG4gIGNvbnN0IHN0cnVjdHVyZXMgPSBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV1cbiAgICAuc29ydCgoYSwgYikgPT4gKGEuaWQgPCBiLmlkID8gLTEgOiBhLmlkID4gYi5pZCA/IDEgOiAwKSk7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnN0cnVjdHVyZS1zdGF0ZTp2MScpO1xuICBoLnUzMihzdHJ1Y3R1cmVzLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgcyBvZiBzdHJ1Y3R1cmVzKSB7XG4gICAgaC5zdHJpbmcocy5pZCk7XG4gICAgaC5zdHJpbmcocy5raW5kKTtcbiAgICBoLnN0cmluZyhzLnNpdGVJZCk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnggKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnkgKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnogKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnJvdCAqIDEwMDAwKSk7XG4gICAgLy8gTGVnYWN5IGhhc2ggaW5wdXQgaXMgYnl0ZS1pZGVudGljYWwuIERlc2lnbiAyIGFkZHMgYW4gZXhwbGljaXQgdGFnLlxuICAgIGlmIChzLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIGguc3RyaW5nKCdkZXNpZ246MicpO1xuICAgIGgudTMyKHMubW9kdWxlcy5sZW5ndGgpO1xuICAgIGZvciAoY29uc3QgbSBvZiBzLm1vZHVsZXMpIHtcbiAgICAgIGguc3RyaW5nKG0ua2luZCk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS55ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnogKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0udyAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS5oICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLmQgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKChtLnJvdCA/PyAwKSAqIDEwMDAwKSk7XG4gICAgICBoLnN0cmluZyhtLnRvbmUgPz8gJycpO1xuICAgIH1cbiAgICBjb25zdCBjb3N0S2V5cyA9IE9iamVjdC5rZXlzKHMuY29zdCkuc29ydCgpO1xuICAgIGgudTMyKGNvc3RLZXlzLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgY29zdEtleXMpIHtcbiAgICAgIGguc3RyaW5nKGtleSk7XG4gICAgICBoLnUzMihzLmNvc3Rba2V5IGFzIGtleW9mIHR5cGVvZiBzLmNvc3RdID8/IDApO1xuICAgIH1cbiAgICBoLnUzMihzLmJ1aWx0UmV2aXNpb24pO1xuICB9XG4gIHJldHVybiBoLmhleCgpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlSGFzaCB7XG4gIGhhc2g6IHN0cmluZztcbiAgY29sdW1uczogbnVtYmVyO1xuICBjaHVua3M6IG51bWJlcjtcbn1cblxuLyoqIERlcml2ZWQgY29sdW1uLWNhY2hlIGhhc2guIE5vdCBhdXRob3JpdGF0aXZlIHRlcnJhaW4gc3RhdGUuICovXG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlZENhY2hlSGFzaCh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24pOiBDYWNoZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOmRlcml2ZWQtY29sdW1uLWNhY2hlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpO1xuICBsZXQgY29sdW1ucyA9IDA7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICAgIGgudTMyKGNodW5rLmhlaWdodHNbY29sXSk7XG4gICAgICAgIGgudTMyKGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdKTtcbiAgICAgICAgY29sdW1ucysrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjb2x1bW5zLCBjaHVua3M6IGtleXMubGVuZ3RoIH07XG59XG5cbi8qKlxuICogUmVjb21wdXRlIGV2ZXJ5IGNvbHVtbiBjYWNoZSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHZveGVsIGRhdGEgYW5kIHJlcG9ydFxuICogbWlzbWF0Y2hlcy4gVGhpcyBwcm92ZXMgaGVpZ2h0cy90b3BNYXRlcmlhbHMgYXJlIGRlcml2ZWQsIG5vdCBhIHNlY29uZFxuICogdGVycmFpbiByZXByZXNlbnRhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRGVyaXZlZENhY2hlcyh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24sIGxpbWl0ID0gNjQpOiBDYWNoZU1pc21hdGNoW10ge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IG91dDogQ2FjaGVNaXNtYXRjaFtdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSBjb250aW51ZTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgICAgbGV0IHRvcE1hdCA9IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdO1xuICAgICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXhwZWN0ZWRIZWlnaHQgPSB0b3BTb2xpZCAtIFlfTUlOO1xuICAgICAgICBpZiAoY2h1bmsuaGVpZ2h0c1tjb2xdICE9PSBleHBlY3RlZEhlaWdodCkge1xuICAgICAgICAgIG91dC5wdXNoKHsgeDogb3ggKyBseCwgejogb3ogKyBseiwgZmllbGQ6ICdoZWlnaHQnLCBleHBlY3RlZDogZXhwZWN0ZWRIZWlnaHQsIGFjdHVhbDogY2h1bmsuaGVpZ2h0c1tjb2xdIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjaHVuay50b3BNYXRlcmlhbHNbY29sXSAhPT0gdG9wTWF0KSB7XG4gICAgICAgICAgb3V0LnB1c2goeyB4OiBveCArIGx4LCB6OiBveiArIGx6LCBmaWVsZDogJ21hdGVyaWFsJywgZXhwZWN0ZWQ6IHRvcE1hdCwgYWN0dWFsOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3V0Lmxlbmd0aCA+PSBsaW1pdCkgcmV0dXJuIG91dDtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBFZGl0T3V0c2lkZSB7XG4gIGNodW5rOiBzdHJpbmc7XG4gIGluZGV4OiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIG1hdGVyaWFsOiBudW1iZXI7XG59XG5cbi8qKiBFdmVyeSByZWNvcmRlZCB2b3hlbCBlZGl0IG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0c091dHNpZGVFbnZlbG9wZSh3b3JsZDogV29ybGQsIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogRWRpdE91dHNpZGVbXSB7XG4gIGNvbnN0IG91dDogRWRpdE91dHNpZGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGVkaXRzXSBvZiB3b3JsZC5lZGl0cykge1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gICAgZm9yIChjb25zdCBbaW5kZXgsIG1hdGVyaWFsXSBvZiBlZGl0cykge1xuICAgICAgY29uc3QgbHggPSBpbmRleCAlIENIVU5LX1NJWkU7XG4gICAgICBjb25zdCBseiA9IE1hdGguZmxvb3IoKGluZGV4ICUgQ0hVTktfQVJFQSkgLyBDSFVOS19TSVpFKTtcbiAgICAgIGNvbnN0IHlpID0gTWF0aC5mbG9vcihpbmRleCAvIENIVU5LX0FSRUEpO1xuICAgICAgY29uc3QgeCA9IG94ICsgbHgsIHogPSBveiArIGx6LCB5ID0gWV9NSU4gKyB5aTtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhlbnZlbG9wZSwgeCwgeSwgeikpIHtcbiAgICAgICAgb3V0LnB1c2goeyBjaHVuazoga2V5LCBpbmRleCwgeCwgeSwgeiwgbWF0ZXJpYWwgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIG91dC5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykgfHwgYS5pbmRleCAtIGIuaW5kZXgpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vKiogTmV3IGNodW5rcyBnZW5lcmF0ZWQgc2luY2UgdGhlIGJhc2VsaW5lIHRoYXQgZG8gbm90IG92ZXJsYXAgdGhlIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5ld0NodW5rc091dHNpZGVFbnZlbG9wZShcbiAgd29ybGQ6IFdvcmxkLCBiYXNlbGluZUtleXM6IEl0ZXJhYmxlPHN0cmluZz4sIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdLFxuKTogc3RyaW5nW10ge1xuICBjb25zdCBiYXNlbGluZSA9IG5ldyBTZXQoYmFzZWxpbmVLZXlzKTtcbiAgY29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGNodW5rXSBvZiB3b3JsZC5jaHVua3MpIHtcbiAgICBpZiAoYmFzZWxpbmUuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IG92ZXJsYXBzID0gZW52ZWxvcGUuc29tZShcbiAgICAgIChyKSA9PiBveCA8PSByLngxICYmIG94ICsgQ0hVTktfU0laRSAtIDEgPj0gci54MCAmJiBveiA8PSByLnoxICYmIG96ICsgQ0hVTktfU0laRSAtIDEgPj0gci56MCxcbiAgICApO1xuICAgIGlmICghb3ZlcmxhcHMpIG91dC5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIG91dC5zb3J0KCk7XG59XG5cbi8qKiBBbGwgY2h1bmsga2V5cyBjdXJyZW50bHkgbWF0ZXJpYWxpc2VkLCBzb3J0ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gY2h1bmtLZXlzKHdvcmxkOiBXb3JsZCk6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIFsuLi53b3JsZC5jaHVua3Mua2V5cygpXS5zb3J0KCk7XG59XG5cbi8qKiBCb3VuZGluZyB2b3hlbCByZWdpb24gY292ZXJpbmcgZXZlcnkgbWF0ZXJpYWxpc2VkIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkQ2h1bmtSZWdpb24od29ybGQ6IFdvcmxkKTogVm94ZWxSZWdpb24ge1xuICBpZiAod29ybGQuY2h1bmtzLnNpemUgPT09IDApIHRocm93IG5ldyBFcnJvcignd29ybGQgaGFzIG5vIGNodW5rcycpO1xuICBsZXQgbWluQ3ggPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN4ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBsZXQgbWluQ3ogPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN6ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IGNodW5rIG9mIHdvcmxkLmNodW5rcy52YWx1ZXMoKSkge1xuICAgIG1pbkN4ID0gTWF0aC5taW4obWluQ3gsIGNodW5rLmN4KTsgbWF4Q3ggPSBNYXRoLm1heChtYXhDeCwgY2h1bmsuY3gpO1xuICAgIG1pbkN6ID0gTWF0aC5taW4obWluQ3osIGNodW5rLmN6KTsgbWF4Q3ogPSBNYXRoLm1heChtYXhDeiwgY2h1bmsuY3opO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDA6IGNodW5rT3JpZ2luWChtaW5DeCksXG4gICAgejA6IGNodW5rT3JpZ2luWihtaW5DeiksXG4gICAgeDE6IGNodW5rT3JpZ2luWChtYXhDeCkgKyBDSFVOS19TSVpFIC0gMSxcbiAgICB6MTogY2h1bmtPcmlnaW5aKG1heEN6KSArIENIVU5LX1NJWkUgLSAxLFxuICAgIHkwOiBZX01JTixcbiAgICB5MTogWV9NQVggLSAxLFxuICB9O1xufVxuIiwgIi8vIE0wMDIgc3RhZ2UgMzogYm91bmRlZCwgYXV0aG9yaXplZCB0ZXJyYWluIHByZXBhcmF0aW9uLlxuLy9cbi8vIFRoZSBwaXBlbGluZSBpcyBkZWxpYmVyYXRlbHkgb25lLXdheSBhbmQgc2hhcmVkIGJ5IHRoZSBwbGF5ZXIgYW5kIHRoZSBBSTpcbi8vXG4vLyAgIHByb3Bvc2FsIC0+IHZhbGlkYXRlU2l0ZSAtPiBwbGFuUHJlcGFyYXRpb24gLT4gQXV0aG9yaXplciAtPiBleGVjdXRlXG4vL1xuLy8gYGV4ZWN1dGVQcmVwYXJhdGlvbmAgaXMgdGhlIG9ubHkgZnVuY3Rpb24gaW4gTTAwMiB0aGF0IGVkaXRzIHRlcnJhaW4gZm9yXG4vLyBjb25zdHJ1Y3Rpb24uIEl0IHJlZnVzZXMgdG8gcnVuIHdpdGhvdXQgYW4gYXV0aG9yaXphdGlvbiB0b2tlbiB3aG9zZSBkaWdlc3Rcbi8vIG1hdGNoZXMgdGhlIHBsYW4sIHdob3NlIGVudmVsb3BlIGNvdmVycyBldmVyeSB2b3hlbCBpdCB3b3VsZCB0b3VjaCwgYW5kIHdob3NlXG4vLyBiYXNlIHJldmlzaW9uIHN0aWxsIG1hdGNoZXMgdGhlIHdvcmxkLiBBbGwgZWRpdHMgYXJlIGNvbXB1dGVkIGFuZCBjaGVja2VkXG4vLyBiZWZvcmUgdGhlIGZpcnN0IGJ5dGUgaXMgd3JpdHRlbiwgc28gYSByZWplY3RlZCBwbGFuIGNhbm5vdCBsZWF2ZSBhIHBhcnRpYWxcbi8vIHBhZCBiZWhpbmQuXG4vL1xuLy8gVGhlIGF1dGhvcml6ZXIgaW4gdGhpcyBmaWxlIGlzIGEgbG9jYWwgcG9saWN5IHN0dWIuIEl0IHByb3ZlcyB0aGF0IHRoZVxuLy8gcGlwZWxpbmUgYW5kIHRoZSBlbnZlbG9wZSBjaGVja3MgZXhpc3Q7IGl0IGlzIE5PVCBNYWdpY0Jsb2NrIGVuZm9yY2VtZW50LlxuLy8gTm8gY2hhaW4gcHJvZ3JhbSwgU0RLIGNhbGwsIHNldHRsZW1lbnQgb3Igcm9sbGJhY2sgZ3VhcmFudGVlIGlzIHByZXNlbnQuXG5pbXBvcnQge1xuICBXb3JsZCwgTUFULCBNYXRJZCwgWV9NSU4sIFlfTUFYLCBIQUxGLCBpc1NvbGlkLFxuICBnZXRWb3hlbCwgc2V0Vm94ZWwsIHJlbW92ZUVudGl0eSwgc3VyZmFjZUF0LFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgRW50aXR5S2luZCwgUmVzb3VyY2VUeXBlLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBub3JtYWxpemVSZWN0LCByZWN0Q29sdW1ucywgZXhwYW5kUmVjdCxcbiAgZW52ZWxvcGVDb250YWlucywgb2JzdHJ1Y3Rpb25zSW4sXG59IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQge1xuICBTaXRlUHJvcG9zYWwsIFNpdGVWYWxpZGF0aW9uLCBCdWlsZGluZ1J1bGVzLCB2YWxpZGF0ZVNpdGUsXG59IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7XG4gIGludmVudG9yeVNuYXBzaG90LCBub3JtYWxpemVFbnZlbG9wZSxcbn0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTE9DQUxfQVVUSE9SSVRZID0gJ2xvY2FsLXN0dWInIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IExPQ0FMX0VORk9SQ0VNRU5UID0gJ2xvY2FsLXNpbXVsYXRpb24tb25seScgYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29sdW1uVGFyZ2V0IHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQbGFuRXhwZWN0YXRpb24ge1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBvYnN0cnVjdGlvbnM6IG51bWJlcjtcbiAgc3VyZmFjZUVkaXRzOiBudW1iZXI7XG4gIHRvdGFsRWRpdHM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblBsYW4ge1xuICBpZDogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICAvKiogRXhhY3RseSBvbmUgdGFyZ2V0IHdhbGtpbmcgaGVpZ2h0IHBlciBmb290cHJpbnQgY29sdW1uLCBzb3J0ZWQgYnkgeiwgeC4gKi9cbiAgdGFyZ2V0czogQ29sdW1uVGFyZ2V0W107XG4gIC8qKiBBdXRob3JpdGF0aXZlIGVudGl0eSBpZHMgdGhpcyBwbGFuIG1heSByZW1vdmUuICovXG4gIGNsZWFyRW50aXR5SWRzOiBzdHJpbmdbXTtcbiAgLyoqIE1hdGVyaWFsIGZvciB0aGUgdG9wIHNvbGlkIHZveGVsIGFmdGVyIGdyYWRpbmcsIG9yIG51bGwgdG8ga2VlcCBpdC4gKi9cbiAgc3VyZmFjZU1hdGVyaWFsOiBNYXRJZCB8IG51bGw7XG4gIC8qKiBUaWdodCBlbnZlbG9wZSBjb3ZlcmluZyBldmVyeSBwbGFubmVkIHZveGVsIGNoYW5nZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGV4cGVjdGVkOiBQbGFuRXhwZWN0YXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25PcHRpb25zIHtcbiAgLyoqIFBlci1jb2x1bW4gdGFyZ2V0cyBmb3IgdGVycmFjZXMgb3Igc3RlcHBlZCBwYXRocy4gRGVmYXVsdHMgdG8gZmxvb3JZLiAqL1xuICB0YXJnZXRzPzogQ29sdW1uVGFyZ2V0W107XG4gIC8qKiBgbm9uZWAgaXMgb25seSBsZWdhbCB3aGVuIHRoZSBzaXRlIGhhcyBubyBvYnN0cnVjdGlvbnMuICovXG4gIGNsZWFyPzogJ29ic3RydWN0aW9ucycgfCAnbm9uZSc7XG4gIC8qKiBTZXQgdGhlIHRvcCBzb2xpZCB2b3hlbCBvZiBldmVyeSB0YXJnZXQgY29sdW1uIChwYXRocywgZmllbGRzKS4gKi9cbiAgc3VyZmFjZU1hdGVyaWFsPzogTWF0SWQ7XG4gIC8qKiBFeHBsaWNpdCB3b3JrIGVudmVsb3BlLiBEZWZhdWx0cyB0byBhIHRpZ2h0IGVudmVsb3BlIGFyb3VuZCB0aGUgZWRpdHMuICovXG4gIGVudmVsb3BlPzogVm94ZWxSZWdpb25bXTtcbn1cblxuLy8gLS0tLS0tLS0tLSBzdGFibGUgZGlnZXN0IC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGRpZ2VzdChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGEgPSAweDgxMWM5ZGM1O1xuICBsZXQgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaW5wdXQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gaW5wdXQuY2hhckNvZGVBdChpKTtcbiAgICBhID0gTWF0aC5pbXVsKGEgXiBjLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoYyArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICBiIF49IGIgPj4+IDEzO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuLyoqIERpZ2VzdCBvZiBldmVyeXRoaW5nIHRoYXQgY2hhbmdlcyB0aGUgc2V0IG9mIGVkaXRzIG9yIHJlbW92YWxzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW5EaWdlc3QocGxhbjogUHJlcGFyYXRpb25QbGFuKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW1xuICAgICdtMDAyOnByZXAtcGxhbjp2MScsXG4gICAgcGxhbi5zaXRlSWQsXG4gICAgYCR7cGxhbi5yZWN0LngwfSwke3BsYW4ucmVjdC56MH0sJHtwbGFuLnJlY3QueDF9LCR7cGxhbi5yZWN0LnoxfWAsXG4gICAgU3RyaW5nKHBsYW4uZmxvb3JZKSxcbiAgICBwbGFuLnJ1bGVzLmlkLFxuICAgIFN0cmluZyhwbGFuLnRhcmdldHMubGVuZ3RoKSxcbiAgICBwbGFuLnN1cmZhY2VNYXRlcmlhbCA9PT0gbnVsbCA/ICdzdXJmYWNlOmtlZXAnIDogYHN1cmZhY2U6JHtwbGFuLnN1cmZhY2VNYXRlcmlhbH1gLFxuICBdO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSBsaW5lcy5wdXNoKGB0OiR7dC54fSwke3Quen0sJHt0Lnl9YCk7XG4gIGNvbnN0IGNsZWFycyA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gIGxpbmVzLnB1c2goYGM6JHtjbGVhcnMubGVuZ3RofWApO1xuICBmb3IgKGNvbnN0IGlkIG9mIGNsZWFycykgbGluZXMucHVzaChgYzoke2lkfWApO1xuICBmb3IgKGNvbnN0IGUgb2Ygbm9ybWFsaXplRW52ZWxvcGUocGxhbi5lbnZlbG9wZSkpIHtcbiAgICBsaW5lcy5wdXNoKGBlOiR7ZS54MH0sJHtlLnowfSwke2UueTB9LCR7ZS54MX0sJHtlLnoxfSwke2UueTF9YCk7XG4gIH1cbiAgY29uc3QgeCA9IHBsYW4uZXhwZWN0ZWQ7XG4gIGxpbmVzLnB1c2goYHg6JHt4LmN1dFZvbHVtZX0sJHt4LmZpbGxWb2x1bWV9LCR7eC5tYXhDdXR9LCR7eC5tYXhGaWxsfSwke3gub2JzdHJ1Y3Rpb25zfSwke3guc3VyZmFjZUVkaXRzfSwke3gudG90YWxFZGl0c31gKTtcbiAgcmV0dXJuIGRpZ2VzdChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGxhbm5pbmcgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBQbGFuU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBQcmVwYXJhdGlvblBsYW47XG4gIHZhbGlkYXRpb246IFNpdGVWYWxpZGF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgc3RhZ2U6ICdwbGFuJyB8ICdhdXRob3JpemUnIHwgJ2V4ZWN1dGUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xuICB2YWxpZGF0aW9uPzogU2l0ZVZhbGlkYXRpb247XG59XG5cbmV4cG9ydCB0eXBlIFBsYW5SZXN1bHQgPSBQbGFuU3VjY2VzcyB8IFByZXBhcmF0aW9uRmFpbHVyZTtcblxuZnVuY3Rpb24gZGVmYXVsdFRhcmdldHMod29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0LCBmbG9vclk6IG51bWJlcik6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3Qgb3V0OiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIG91dC5wdXNoKHsgeCwgeiwgeTogZmxvb3JZIH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHNvcnRlZFRhcmdldHModGFyZ2V0czogcmVhZG9ubHkgQ29sdW1uVGFyZ2V0W10pOiBDb2x1bW5UYXJnZXRbXSB7XG4gIHJldHVybiBbLi4udGFyZ2V0c10uc29ydCgoYSwgYikgPT4gYS56IC0gYi56IHx8IGEueCAtIGIueCB8fCBhLnkgLSBiLnkpO1xufVxuXG5pbnRlcmZhY2UgVGFyZ2V0U3RhdHMge1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICByZWxpZWY6IG51bWJlcjtcbn1cblxuLyoqIEN1dC9maWxsIGltcGxpZWQgYnkgZXhwbGljaXQgdGFyZ2V0cywgaW5kZXBlbmRlbnQgb2YgdGhlIGZsYXQgZmxvb3JZLiAqL1xuZnVuY3Rpb24gdGFyZ2V0U3RhdHMod29ybGQ6IFdvcmxkLCB0YXJnZXRzOiByZWFkb25seSBDb2x1bW5UYXJnZXRbXSk6IFRhcmdldFN0YXRzIHtcbiAgbGV0IGN1dFZvbHVtZSA9IDAsIGZpbGxWb2x1bWUgPSAwLCBtYXhDdXQgPSAwLCBtYXhGaWxsID0gMDtcbiAgbGV0IG1pblkgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heFkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIG1pblkgPSBNYXRoLm1pbihtaW5ZLCBzdXJmYWNlLCB0LnkpO1xuICAgIG1heFkgPSBNYXRoLm1heChtYXhZLCBzdXJmYWNlLCB0LnkpO1xuICAgIGlmIChzdXJmYWNlID4gdC55KSB7XG4gICAgICBjb25zdCBkID0gc3VyZmFjZSAtIHQueTtcbiAgICAgIGN1dFZvbHVtZSArPSBkO1xuICAgICAgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkKTtcbiAgICB9IGVsc2UgaWYgKHN1cmZhY2UgPCB0LnkpIHtcbiAgICAgIGNvbnN0IGQgPSB0LnkgLSBzdXJmYWNlO1xuICAgICAgZmlsbFZvbHVtZSArPSBkO1xuICAgICAgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIGQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4geyBjdXRWb2x1bWUsIGZpbGxWb2x1bWUsIG1heEN1dCwgbWF4RmlsbCwgcmVsaWVmOiBtYXhZIC0gbWluWSB9O1xufVxuXG5mdW5jdGlvbiB0YXJnZXRSdWxlUmVhc29ucyhzdGF0czogVGFyZ2V0U3RhdHMsIHJ1bGVzOiBCdWlsZGluZ1J1bGVzKTogc3RyaW5nW10ge1xuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQpIHtcbiAgICByZWFzb25zLnB1c2goYHJlbGllZiAke3N0YXRzLnJlbGllZn0gbSBleGNlZWRzIHRoZSAke3J1bGVzLm1heFJlbGllZlByZXBhcmVkfSBtIHByZXBhcmVkIGxpbWl0YCk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEN1dCA+IHJ1bGVzLm1heEN1dCkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0ICR7c3RhdHMubWF4Q3V0fSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXR9IG1gKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4RmlsbCA+IHJ1bGVzLm1heEZpbGwpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgJHtzdGF0cy5tYXhGaWxsfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsfSBtYCk7XG4gIH1cbiAgaWYgKHN0YXRzLmN1dFZvbHVtZSA+IHJ1bGVzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0IHZvbHVtZSAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4Q3V0Vm9sdW1lfSBtXHUwMEIzYCk7XG4gIH1cbiAgaWYgKHN0YXRzLmZpbGxWb2x1bWUgPiBydWxlcy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsIHZvbHVtZSAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEZpbGxWb2x1bWV9IG1cdTAwQjNgKTtcbiAgfVxuICByZXR1cm4gcmVhc29ucztcbn1cblxuLyoqXG4gKiBUdXJuIGEgcHJvcG9zYWwgaW50byBhbiBleHBsaWNpdCwgY2hlY2thYmxlIHBsYW4uIFJlYWQtb25seS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW5QcmVwYXJhdGlvbihcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBvcHRpb25zOiBQcmVwYXJhdGlvbk9wdGlvbnMgPSB7fSxcbik6IFBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwpO1xuXG4gIGlmICh2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICdzaXRlX2ludmFsaWQnLFxuICAgICAgcmVhc29uczogdmFsaWRhdGlvbi5yZWFzb25zLm1hcCgocikgPT4gYCR7ci5jb2RlfTogJHtyLm1lc3NhZ2V9YCksXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB0YXJnZXRzID0gc29ydGVkVGFyZ2V0cyhvcHRpb25zLnRhcmdldHMgPz8gZGVmYXVsdFRhcmdldHMod29ybGQsIHJlY3QsIHByb3Bvc2FsLmZsb29yWSkpO1xuICBjb25zdCBjb2x1bW5zID0gcmVjdENvbHVtbnMocmVjdCk7XG4gIGlmICh0YXJnZXRzLmxlbmd0aCAhPT0gY29sdW1ucykge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3RhcmdldF9jb3VudCcsXG4gICAgICByZWFzb25zOiBbYHBsYW4gaGFzICR7dGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZm9yICR7Y29sdW1uc30gY29sdW1uc2BdLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG5cbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IGtleSA9IGAke3QueH0sJHt0Lnp9YDtcbiAgICBpZiAoc2Vlbi5oYXMoa2V5KSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAnZHVwbGljYXRlX3RhcmdldCcsXG4gICAgICAgIHJlYXNvbnM6IFtgZHVwbGljYXRlIHRhcmdldCBhdCAke2tleX1gXSwgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICAgIHNlZW4uYWRkKGtleSk7XG4gICAgaWYgKHQueCA8IHJlY3QueDAgfHwgdC54ID4gcmVjdC54MSB8fCB0LnogPCByZWN0LnowIHx8IHQueiA+IHJlY3QuejEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ3RhcmdldF9vdXRzaWRlX2Zvb3RwcmludCcsXG4gICAgICAgIHJlYXNvbnM6IFtgdGFyZ2V0ICR7a2V5fSBpcyBvdXRzaWRlICR7cmVjdC54MH0sJHtyZWN0LnowfS4uJHtyZWN0LngxfSwke3JlY3QuejF9YF0sXG4gICAgICAgIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIodC55KSB8fCB0LnkgPCBZX01JTiB8fCB0LnkgPj0gWV9NQVgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ3RhcmdldF9oZWlnaHQnLFxuICAgICAgICByZWFzb25zOiBbYHRhcmdldCAke2tleX0gaGFzIGludmFsaWQgaGVpZ2h0ICR7dC55fWBdLCB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzO1xuICBjb25zdCBjbGVhciA9IG9wdGlvbnMuY2xlYXIgPz8gJ29ic3RydWN0aW9ucyc7XG4gIGlmIChjbGVhciA9PT0gJ25vbmUnICYmIG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAndW5jbGVhcmVkX29ic3RydWN0aW9ucycsXG4gICAgICByZWFzb25zOiBbYCR7b2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIHdvdWxkIHJlbWFpbmBdLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG4gIGNvbnN0IGNsZWFyRW50aXR5SWRzID0gY2xlYXIgPT09ICdub25lJyA/IFtdIDogWy4uLm5ldyBTZXQob2JzdHJ1Y3Rpb25zKV0uc29ydCgpO1xuICBjb25zdCBzdXJmYWNlTWF0ZXJpYWwgPSBvcHRpb25zLnN1cmZhY2VNYXRlcmlhbCA/PyBudWxsO1xuXG4gIGNvbnN0IGN1c3RvbVRhcmdldHMgPSBvcHRpb25zLnRhcmdldHMgIT09IHVuZGVmaW5lZDtcbiAgY29uc3Qgc3RhdHMgPSBjdXN0b21UYXJnZXRzXG4gICAgPyB0YXJnZXRTdGF0cyh3b3JsZCwgdGFyZ2V0cylcbiAgICA6IHtcbiAgICAgIGN1dFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5tYXhGaWxsLFxuICAgICAgcmVsaWVmOiB2YWxpZGF0aW9uLnF1ZXJ5LnN0YXRzLnJlbGllZixcbiAgICB9O1xuICBpZiAoY3VzdG9tVGFyZ2V0cykge1xuICAgIGNvbnN0IHJlYXNvbnMgPSB0YXJnZXRSdWxlUmVhc29ucyhzdGF0cywgcHJvcG9zYWwucnVsZXMpO1xuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgICAgY29kZTogJ3RhcmdldF9ydWxlcycsXG4gICAgICAgIHJlYXNvbnMsXG4gICAgICAgIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGxldCBsbyA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgbGV0IGhpID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBsbyA9IE1hdGgubWluKGxvLCBzdXJmYWNlLCB0LnkpO1xuICAgIGhpID0gTWF0aC5tYXgoaGksIHN1cmZhY2UgLSAxLCB0LnkgLSAxKTtcbiAgfVxuICBjb25zdCBidWZmZXJlZCA9IGV4cGFuZFJlY3QocmVjdCwgMSk7XG4gIGNvbnN0IGRlcml2ZWQ6IFZveGVsUmVnaW9uID0ge1xuICAgIHgwOiBNYXRoLm1heCgtSEFMRiwgYnVmZmVyZWQueDApLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgYnVmZmVyZWQuejApLFxuICAgIHgxOiBNYXRoLm1pbihIQUxGIC0gMSwgYnVmZmVyZWQueDEpLFxuICAgIHoxOiBNYXRoLm1pbihIQUxGIC0gMSwgYnVmZmVyZWQuejEpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgbG8gLSAxKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBoaSArIDEpLFxuICB9O1xuICAvLyBBbiBleHBsaWNpdCBlbnZlbG9wZSByZXBsYWNlcyB0aGUgZGVyaXZlZCBvbmUuIENhbGxlcnMgdGhhdCBwaW4gYW4gZXhhY3RcbiAgLy8gd29yayBlbnZlbG9wZSAocGF0aCBwcmVwYXJhdGlvbikgbXVzdCBub3Qgc2lsZW50bHkgd2lkZW4gaXQgd2l0aCB0aGVcbiAgLy8gZGVmYXVsdCAxIG0gYnVmZmVyLlxuICBjb25zdCBlbnZlbG9wZSA9IG5vcm1hbGl6ZUVudmVsb3BlKG9wdGlvbnMuZW52ZWxvcGUgPz8gW2Rlcml2ZWRdKTtcbiAgY29uc3Qgc3VyZmFjZUVkaXRzID0gc3VyZmFjZU1hdGVyaWFsID09PSBudWxsID8gMCA6IHRhcmdldHMubGVuZ3RoO1xuXG4gIGNvbnN0IHBsYW46IFByZXBhcmF0aW9uUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBydWxlczogcHJvcG9zYWwucnVsZXMsXG4gICAgdGFyZ2V0cyxcbiAgICBjbGVhckVudGl0eUlkcyxcbiAgICBzdXJmYWNlTWF0ZXJpYWwsXG4gICAgZW52ZWxvcGUsXG4gICAgZXhwZWN0ZWQ6IHtcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICAgIG9ic3RydWN0aW9uczogY2xlYXJFbnRpdHlJZHMubGVuZ3RoLFxuICAgICAgc3VyZmFjZUVkaXRzLFxuICAgICAgdG90YWxFZGl0czogc3RhdHMuY3V0Vm9sdW1lICsgc3RhdHMuZmlsbFZvbHVtZSArIHN1cmZhY2VFZGl0cyxcbiAgICB9LFxuICB9O1xuICBwbGFuLmlkID0gYHByZXA6JHtwbGFuRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCB2YWxpZGF0aW9uIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gYXV0aG9yaXphdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25MaW1pdHMge1xuICBtYXhDdXRWb2x1bWU6IG51bWJlcjtcbiAgbWF4RmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhWb3hlbEVkaXRzOiBudW1iZXI7XG4gIG1heEVudGl0eVJlbW92YWxzOiBudW1iZXI7XG4gIG1heFRhcmdldHM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfTElNSVRTOiBBdXRob3JpemF0aW9uTGltaXRzID0ge1xuICBtYXhDdXRWb2x1bWU6IDI1NixcbiAgbWF4RmlsbFZvbHVtZTogMjU2LFxuICBtYXhWb3hlbEVkaXRzOiAxMDI0LFxuICBtYXhFbnRpdHlSZW1vdmFsczogMTYsXG4gIG1heFRhcmdldHM6IDUxMixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ya0F1dGhvcml6YXRpb24ge1xuICBpZDogc3RyaW5nO1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGJhc2VSZXZpc2lvbjogbnVtYmVyO1xuICBsaW1pdHM6IEF1dGhvcml6YXRpb25MaW1pdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvbkRlY2lzaW9uIHtcbiAgb2s6IGJvb2xlYW47XG4gIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uIHwgbnVsbDtcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvblBvbGljeSB7XG4gIC8qKiBUaGUgb25seSByZWdpb25zIHRoaXMgZ292ZXJub3IgcGVybWl0cyBmb3IgdGhlIGZpcnN0IHNsaWNlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgbGltaXRzPzogUGFydGlhbDxBdXRob3JpemF0aW9uTGltaXRzPjtcbn1cblxuZnVuY3Rpb24gcmVnaW9uQ29udGFpbmVkKHJlZ2lvbjogVm94ZWxSZWdpb24sIHBvbGljeTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IGJvb2xlYW4ge1xuICByZXR1cm4gcG9saWN5LnNvbWUoKHApID0+IHJlZ2lvbi54MCA+PSBwLngwICYmIHJlZ2lvbi54MSA8PSBwLngxXG4gICAgJiYgcmVnaW9uLnowID49IHAuejAgJiYgcmVnaW9uLnoxIDw9IHAuejFcbiAgICAmJiByZWdpb24ueTAgPj0gcC55MCAmJiByZWdpb24ueTEgPD0gcC55MSk7XG59XG5cbi8qKlxuICogTG9jYWwgZ292ZXJub3Igc3R1Yi4gSXQgZW5mb3JjZXMgYSBmaXhlZCBlbnZlbG9wZSBhbmQgaGFyZCB2b2x1bWUgbGltaXRzLFxuICogYmluZHMgYSB0b2tlbiB0byB0aGUgZXhhY3QgcGxhbiBkaWdlc3QgYW5kIHdvcmxkIHJldmlzaW9uLCBhbmQgcmVmdXNlcyB0b1xuICogcHJldGVuZCBpdCBpcyBhbiBvbi1jaGFpbiBhdXRob3JpdHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBMb2NhbEF1dGhvcml6ZXIge1xuICByZWFkb25seSBhdXRob3JpdHkgPSBMT0NBTF9BVVRIT1JJVFk7XG4gIHJlYWRvbmx5IGVuZm9yY2VtZW50ID0gTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHJlYWRvbmx5IGxpbWl0czogQXV0aG9yaXphdGlvbkxpbWl0cztcblxuICBjb25zdHJ1Y3RvcihyZWFkb25seSBwb2xpY3k6IEF1dGhvcml6YXRpb25Qb2xpY3kpIHtcbiAgICB0aGlzLmxpbWl0cyA9IHsgLi4uREVGQVVMVF9MSU1JVFMsIC4uLihwb2xpY3kubGltaXRzID8/IHt9KSB9O1xuICB9XG5cbiAgYXV0aG9yaXplKHdvcmxkOiBXb3JsZCwgcGxhbjogUHJlcGFyYXRpb25QbGFuKTogQXV0aG9yaXphdGlvbkRlY2lzaW9uIHtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHBsYW4ucmVjdCk7XG5cbiAgICBpZiAocGxhbi50YXJnZXRzLmxlbmd0aCAhPT0gcmVjdENvbHVtbnMocmVjdCkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbiBoYXMgJHtwbGFuLnRhcmdldHMubGVuZ3RofSB0YXJnZXRzIGZvciAke3JlY3RDb2x1bW5zKHJlY3QpfSBjb2x1bW5zYCk7XG4gICAgfVxuICAgIGlmIChwbGFuLnRhcmdldHMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4VGFyZ2V0cykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4udGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4VGFyZ2V0c31gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQuY3V0Vm9sdW1lID4gdGhpcy5saW1pdHMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgICByZWFzb25zLnB1c2goYGN1dCAke3BsYW4uZXhwZWN0ZWQuY3V0Vm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4Q3V0Vm9sdW1lfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC5maWxsVm9sdW1lID4gdGhpcy5saW1pdHMubWF4RmlsbFZvbHVtZSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBmaWxsICR7cGxhbi5leHBlY3RlZC5maWxsVm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4RmlsbFZvbHVtZX1gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQudG90YWxFZGl0cyA+IHRoaXMubGltaXRzLm1heFZveGVsRWRpdHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbm5lZCBlZGl0cyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhWb3hlbEVkaXRzfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFscykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RofSByZW1vdmFscyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFsc31gKTtcbiAgICB9XG4gICAgaWYgKG5ldyBTZXQocGxhbi5jbGVhckVudGl0eUlkcykuc2l6ZSAhPT0gcGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGgpIHtcbiAgICAgIHJlYXNvbnMucHVzaCgnZHVwbGljYXRlIGVudGl0eSByZW1vdmFsIGlkcycpO1xuICAgIH1cblxuICAgIGlmIChwbGFuLmVudmVsb3BlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyB3b3JrIGVudmVsb3BlJyk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcmVnaW9uIG9mIHBsYW4uZW52ZWxvcGUpIHtcbiAgICAgIGlmICghcmVnaW9uQ29udGFpbmVkKHJlZ2lvbiwgdGhpcy5wb2xpY3kuZW52ZWxvcGUpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgZW52ZWxvcGUgJHtyZWdpb24ueDB9LCR7cmVnaW9uLnowfSwke3JlZ2lvbi55MH0uLiR7cmVnaW9uLngxfSwke3JlZ2lvbi56MX0sJHtyZWdpb24ueTF9IGlzIG91dHNpZGUgdGhlIGxvY2FsIHBvbGljeWApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSB7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgdC54LCB0LnksIHQueilcbiAgICAgICAgfHwgKHQueSA+IFlfTUlOICYmICFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHQueCwgdC55IC0gMSwgdC56KSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGB0YXJnZXQgJHt0Lnh9LCR7dC56fSwke3QueX0gaXMgbm90IGNvdmVyZWQgYnkgdGhlIHdvcmsgZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBFdmVyeSBvYnN0cnVjdGlvbiBjdXJyZW50bHkgb24gdGhlIGZvb3RwcmludCBtdXN0IGJlIGluIHRoZSBwbGFuLCBhbmRcbiAgICAvLyB0aGUgcGxhbiBtYXkgbm90IHJlbW92ZSBhbnl0aGluZyB0aGF0IGlzIG5vdCBhbiBvYnN0cnVjdGlvbiB0aGVyZS5cbiAgICBjb25zdCBjdXJyZW50ID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpLm1hcCgobykgPT4gby5lbnRpdHlJZCkuc29ydCgpO1xuICAgIGNvbnN0IHBsYW5uZWQgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICAgIGlmIChjdXJyZW50Lmxlbmd0aCAhPT0gcGxhbm5lZC5sZW5ndGggfHwgY3VycmVudC5zb21lKChpZCwgaSkgPT4gaWQgIT09IHBsYW5uZWRbaV0pKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW4gcmVtb3ZhbHMgWyR7cGxhbm5lZC5qb2luKCcsJyl9XSBkbyBub3QgbWF0Y2ggZm9vdHByaW50IG9ic3RydWN0aW9ucyBbJHtjdXJyZW50LmpvaW4oJywnKX1dYCk7XG4gICAgfVxuXG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBhdXRob3JpemF0aW9uOiBudWxsLCByZWFzb25zIH07XG5cbiAgICBjb25zdCB0b2tlbjogV29ya0F1dGhvcml6YXRpb24gPSB7XG4gICAgICBpZDogYGxvY2FsLXN0dWI6JHtwbGFuRGlnZXN0KHBsYW4pfWAsXG4gICAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICAgIHBsYW5EaWdlc3Q6IHBsYW5EaWdlc3QocGxhbiksXG4gICAgICBlbnZlbG9wZTogbm9ybWFsaXplRW52ZWxvcGUocGxhbi5lbnZlbG9wZSksXG4gICAgICBiYXNlUmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgICAgbGltaXRzOiB7IC4uLnRoaXMubGltaXRzIH0sXG4gICAgfTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgYXV0aG9yaXphdGlvbjogdG9rZW4sIHJlYXNvbnM6IFtdIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBleGVjdXRpb24gLS0tLS0tLS0tLVxuaW50ZXJmYWNlIFBlbmRpbmdFZGl0IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgYmVmb3JlOiBNYXRJZDtcbiAgYWZ0ZXI6IE1hdElkO1xuICAvKiogVHJ1ZSBmb3IgYSBtYXRlcmlhbC1vbmx5IHRvcC1zdXJmYWNlIGNoYW5nZS4gKi9cbiAgc3VyZmFjZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIGNodW5rOiBzdHJpbmc7XG4gIGNoYW5nZWQ6IG51bWJlcjtcbiAgYWRkZWQ6IG51bWJlcjtcbiAgcmVtb3ZlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENsZWFyZWRFbnRpdHkge1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgYW1vdW50OiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25MZWRnZXIge1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIGF1dGhvcml6YXRpb25JZDogc3RyaW5nO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbmV0U3BvaWw6IG51bWJlcjtcbiAgYm9ycm93ZWRGaWxsOiBudW1iZXI7XG4gIGN1dEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGZpbGxCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICB2b3hlbEVkaXRzOiBudW1iZXI7XG4gIHN1cmZhY2VFZGl0czogbnVtYmVyO1xuICBlbnRpdGllc0NsZWFyZWQ6IENsZWFyZWRFbnRpdHlbXTtcbiAgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBjaHVua0RlbHRhczogQ2h1bmtEZWx0YVtdO1xuICByZXZpc2lvbkJlZm9yZTogbnVtYmVyO1xuICByZXZpc2lvbkFmdGVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFByZXBhcmF0aW9uUGxhbjtcbiAgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb247XG4gIGxlZGdlcjogUHJlcGFyYXRpb25MZWRnZXI7XG59XG5cbmV4cG9ydCB0eXBlIFByZXBhcmF0aW9uT3V0Y29tZSA9IFByZXBhcmF0aW9uU3VjY2VzcyB8IFByZXBhcmF0aW9uRmFpbHVyZTtcblxuY29uc3QgTUFURVJJQUxfTkFNRVM6IFJlY29yZDxudW1iZXIsIHN0cmluZz4gPSB7XG4gIFtNQVQuR1JBU1NdOiAnZ3Jhc3MnLFxuICBbTUFULlNPSUxdOiAnc29pbCcsXG4gIFtNQVQuU0FORF06ICdzYW5kJyxcbiAgW01BVC5HUkFWRUxdOiAnZ3JhdmVsJyxcbiAgW01BVC5TVE9ORV06ICdzdG9uZScsXG4gIFtNQVQuT1JFXTogJ29yZScsXG4gIFtNQVQuV0FURVJdOiAnd2F0ZXInLFxuICBbTUFULkJFRFJPQ0tdOiAnYmVkcm9jaycsXG4gIFtNQVQuTU9TU106ICdtb3NzJyxcbn07XG5cbmZ1bmN0aW9uIG1hdGVyaWFsTmFtZShtOiBNYXRJZCk6IHN0cmluZyB7XG4gIHJldHVybiBNQVRFUklBTF9OQU1FU1ttXSA/PyBgbWF0XyR7bX1gO1xufVxuXG5mdW5jdGlvbiBmaWxsTWF0ZXJpYWwoeTogbnVtYmVyLCB0YXJnZXQ6IG51bWJlcik6IE1hdElkIHtcbiAgcmV0dXJuIHkgPT09IHRhcmdldCAtIDEgPyBNQVQuR1JBU1MgOiBNQVQuU09JTDtcbn1cblxuZnVuY3Rpb24gZmFpbChzdGFnZTogUHJlcGFyYXRpb25GYWlsdXJlWydzdGFnZSddLCBjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogUHJlcGFyYXRpb25GYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGFnZSwgY29kZSwgcmVhc29ucyB9O1xufVxuXG4vKipcbiAqIEFwcGx5IGFuIGF1dGhvcml6ZWQgcGxhbi4gTm8gdm94ZWwgaXMgd3JpdHRlbiB1bnRpbCBldmVyeSBlZGl0IGFuZCByZW1vdmFsXG4gKiBoYXMgYmVlbiBjaGVja2VkIGFnYWluc3QgdGhlIHRva2VuLCB0aGUgcGxhbiBlbnZlbG9wZSBhbmQgdGhlIGhhcmQgbGltaXRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXhlY3V0ZVByZXBhcmF0aW9uKFxuICB3b3JsZDogV29ybGQsIHBsYW46IFByZXBhcmF0aW9uUGxhbiwgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb24sXG4pOiBQcmVwYXJhdGlvbk91dGNvbWUge1xuICBpZiAoYXV0aG9yaXphdGlvbi5hdXRob3JpdHkgIT09IExPQ0FMX0FVVEhPUklUWVxuICAgIHx8IGF1dGhvcml6YXRpb24uZW5mb3JjZW1lbnQgIT09IExPQ0FMX0VORk9SQ0VNRU5UKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5zdXBwb3J0ZWRfYXV0aG9yaXR5JywgW1xuICAgICAgYGF1dGhvcml0eSAke2F1dGhvcml6YXRpb24uYXV0aG9yaXR5fS8ke2F1dGhvcml6YXRpb24uZW5mb3JjZW1lbnR9IGlzIG5vdCB0aGUgbG9jYWwgc3R1YmAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCAhPT0gcGxhbkRpZ2VzdChwbGFuKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2RpZ2VzdF9taXNtYXRjaCcsIFsnYXV0aG9yaXphdGlvbiBkb2VzIG5vdCBtYXRjaCB0aGlzIHBsYW4nXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24uYmFzZVJldmlzaW9uICE9PSB3b3JsZC5yZXZpc2lvbikge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3N0YWxlX2F1dGhvcml6YXRpb24nLCBbXG4gICAgICBgYXV0aG9yaXphdGlvbiB3YXMgaXNzdWVkIGF0IHJldmlzaW9uICR7YXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb259LCB3b3JsZCBpcyBhdCAke3dvcmxkLnJldmlzaW9ufWAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKHBsYW4uZW52ZWxvcGUuc29tZSgocikgPT4gIXJlZ2lvbkNvbnRhaW5lZChyLCBhdXRob3JpemF0aW9uLmVudmVsb3BlKSkpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdlbnZlbG9wZV9taXNtYXRjaCcsIFsncGxhbiBlbnZlbG9wZSBpcyB3aWRlciB0aGFuIHRoZSBhdXRob3JpemF0aW9uJ10pO1xuICB9XG5cbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocGxhbi5yZWN0KTtcbiAgY29uc3QgZWRpdHM6IFBlbmRpbmdFZGl0W10gPSBbXTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBpZiAodC55IDwgc3VyZmFjZSkge1xuICAgICAgZm9yIChsZXQgeSA9IHQueTsgeSA8IHN1cmZhY2U7IHkrKykge1xuICAgICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB5LCB0LnopO1xuICAgICAgICBpZiAoaXNTb2xpZChiZWZvcmUpKSBlZGl0cy5wdXNoKHsgeDogdC54LCB5LCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXI6IE1BVC5BSVIgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0LnkgPiBzdXJmYWNlKSB7XG4gICAgICBmb3IgKGxldCB5ID0gc3VyZmFjZTsgeSA8IHQueTsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHksIHQueik7XG4gICAgICAgIGlmICghaXNTb2xpZChiZWZvcmUpKSB7XG4gICAgICAgICAgY29uc3QgYWZ0ZXIgPSBwbGFuLnN1cmZhY2VNYXRlcmlhbCAhPT0gbnVsbCAmJiB5ID09PSB0LnkgLSAxXG4gICAgICAgICAgICA/IHBsYW4uc3VyZmFjZU1hdGVyaWFsXG4gICAgICAgICAgICA6IGZpbGxNYXRlcmlhbCh5LCB0LnkpO1xuICAgICAgICAgIGVkaXRzLnB1c2goeyB4OiB0LngsIHksIHo6IHQueiwgYmVmb3JlLCBhZnRlciB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyBNYXRlcmlhbC1vbmx5IHN1cmZhY2UgY2hhbmdlIGZvciBjdXQgb3IgYWxyZWFkeS1sZXZlbCBjb2x1bW5zLiBGaWxsXG4gICAgLy8gY29sdW1ucyBhbHJlYWR5IHJlY2VpdmUgdGhlIHN1cmZhY2UgbWF0ZXJpYWwgaW4gdGhlIGZpbGwgbG9vcCBhYm92ZS5cbiAgICBpZiAocGxhbi5zdXJmYWNlTWF0ZXJpYWwgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHRvcFkgPSB0LnkgLSAxO1xuICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgdG9wWSwgdC56KTtcbiAgICAgIGlmIChpc1NvbGlkKGJlZm9yZSkgJiYgYmVmb3JlICE9PSBwbGFuLnN1cmZhY2VNYXRlcmlhbCkge1xuICAgICAgICBlZGl0cy5wdXNoKHtcbiAgICAgICAgICB4OiB0LngsIHk6IHRvcFksIHo6IHQueiwgYmVmb3JlLCBhZnRlcjogcGxhbi5zdXJmYWNlTWF0ZXJpYWwsIHN1cmZhY2U6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGV2ZXJ5IGVkaXQgYmVmb3JlIG11dGF0aW5nIGFueXRoaW5nLlxuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGUgb2YgZWRpdHMpIHtcbiAgICBpZiAoZS54IDwgcmVjdC54MCB8fCBlLnggPiByZWN0LngxIHx8IGUueiA8IHJlY3QuejAgfHwgZS56ID4gcmVjdC56MSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBlZGl0ICR7ZS54fSwke2UueX0sJHtlLnp9IGlzIG91dHNpZGUgdGhlIGZvb3RwcmludGApO1xuICAgIH1cbiAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMoYXV0aG9yaXphdGlvbi5lbnZlbG9wZSwgZS54LCBlLnksIGUueikpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZWRpdCAke2UueH0sJHtlLnl9LCR7ZS56fSBpcyBvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlYCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGN1dFZvbHVtZSA9IGVkaXRzLmZpbHRlcigoZSkgPT4gZS5hZnRlciA9PT0gTUFULkFJUiAmJiBpc1NvbGlkKGUuYmVmb3JlKSkubGVuZ3RoO1xuICBjb25zdCBmaWxsVm9sdW1lID0gZWRpdHMuZmlsdGVyKChlKSA9PiBlLmFmdGVyICE9PSBNQVQuQUlSICYmICFpc1NvbGlkKGUuYmVmb3JlKSkubGVuZ3RoO1xuICBpZiAoY3V0Vm9sdW1lID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgJHtjdXRWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhDdXRWb2x1bWV9YCk7XG4gIH1cbiAgaWYgKGZpbGxWb2x1bWUgPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsICR7ZmlsbFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEZpbGxWb2x1bWV9YCk7XG4gIH1cbiAgaWYgKGVkaXRzLmxlbmd0aCA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heFZveGVsRWRpdHMpIHtcbiAgICByZWFzb25zLnB1c2goYCR7ZWRpdHMubGVuZ3RofSBlZGl0cyBleGNlZWQgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhWb3hlbEVkaXRzfWApO1xuICB9XG5cbiAgY29uc3QgY3VycmVudCA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KS5tYXAoKG8pID0+IG8uZW50aXR5SWQpLnNvcnQoKTtcbiAgY29uc3QgcGxhbm5lZCA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gIGlmIChjdXJyZW50Lmxlbmd0aCAhPT0gcGxhbm5lZC5sZW5ndGggfHwgY3VycmVudC5zb21lKChpZCwgaSkgPT4gaWQgIT09IHBsYW5uZWRbaV0pKSB7XG4gICAgcmVhc29ucy5wdXNoKCdmb290cHJpbnQgb2JzdHJ1Y3Rpb25zIGNoYW5nZWQgYWZ0ZXIgYXV0aG9yaXphdGlvbicpO1xuICB9XG4gIGlmIChwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEVudGl0eVJlbW92YWxzKSB7XG4gICAgcmVhc29ucy5wdXNoKGAke3BsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RofSByZW1vdmFscyBleGNlZWQgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFsc31gKTtcbiAgfVxuICBmb3IgKGNvbnN0IGlkIG9mIHBsYW4uY2xlYXJFbnRpdHlJZHMpIHtcbiAgICBpZiAoIXdvcmxkLmVudGl0aWVzLmhhcyhpZCkpIHJlYXNvbnMucHVzaChgZW50aXR5ICR7aWR9IG5vIGxvbmdlciBleGlzdHNgKTtcbiAgfVxuICBpZiAod29ybGQubGlmZSkge1xuICAgIGxldCByZWNvdmVyZWQgPSAwO1xuICAgIGZvciAoY29uc3QgaWQgb2YgcGxhbi5jbGVhckVudGl0eUlkcykge1xuICAgICAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmIChlbnRpdHk/LnJlc291cmNlICYmIGVudGl0eS5yZW1haW5pbmcgPiAwKSByZWNvdmVyZWQgKz0gZW50aXR5LnJlbWFpbmluZztcbiAgICB9XG4gICAgLy8gQ2hlY2sgYmVmb3JlIGFueSB2b3hlbCBvciBlbnRpdHkgY2hhbmdlcywgcHJlc2VydmluZyBsZWdhY3kgdW5ib3VuZGVkXG4gICAgLy8gY29uc3RydWN0aW9uIGJlaGF2aW9yIGFuZCBzY2hlbWEtMyBjYXJyaWVkLWNhcGFjaXR5IGNvbnNlcnZhdGlvbi5cbiAgICBpZiAoT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBhbW91bnQpID0+IHN1bSArIGFtb3VudCwgMCkgKyByZWNvdmVyZWQgPiAxMjApIHtcbiAgICAgIHJlYXNvbnMucHVzaCgncmVzb3VyY2VzIHJlY292ZXJlZCBkdXJpbmcgc2l0ZSBjbGVhcmluZyB3b3VsZCBleGNlZWQgY2FycmllZCBjYXBhY2l0eSAxMjAnKTtcbiAgICB9XG4gIH1cbiAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5hdXRob3JpemVkX2VkaXRzJywgcmVhc29ucyk7XG5cbiAgY29uc3QgaW52ZW50b3J5QmVmb3JlID0gaW52ZW50b3J5U25hcHNob3Qod29ybGQpO1xuICBjb25zdCByZXZpc2lvbkJlZm9yZSA9IHdvcmxkLnJldmlzaW9uO1xuICBjb25zdCBjaHVua0RlbHRhcyA9IG5ldyBNYXA8c3RyaW5nLCBDaHVua0RlbHRhPigpO1xuICBjb25zdCBjdXRCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGNvbnN0IGZpbGxCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGxldCBhcHBsaWVkID0gMDtcbiAgbGV0IHN1cmZhY2VFZGl0cyA9IDA7XG5cbiAgZm9yIChjb25zdCBlIG9mIGVkaXRzKSB7XG4gICAgaWYgKCFzZXRWb3hlbCh3b3JsZCwgZS54LCBlLnksIGUueiwgZS5hZnRlcikpIGNvbnRpbnVlO1xuICAgIGFwcGxpZWQrKztcbiAgICBpZiAoZS5zdXJmYWNlKSBzdXJmYWNlRWRpdHMrKztcbiAgICBjb25zdCBrZXkgPSBjaHVua0tleSh3b3JsZFRvQ2h1bmtYKGUueCksIHdvcmxkVG9DaHVua1ooZS56KSk7XG4gICAgbGV0IGRlbHRhID0gY2h1bmtEZWx0YXMuZ2V0KGtleSk7XG4gICAgaWYgKCFkZWx0YSkge1xuICAgICAgZGVsdGEgPSB7IGNodW5rOiBrZXksIGNoYW5nZWQ6IDAsIGFkZGVkOiAwLCByZW1vdmVkOiAwIH07XG4gICAgICBjaHVua0RlbHRhcy5zZXQoa2V5LCBkZWx0YSk7XG4gICAgfVxuICAgIGRlbHRhLmNoYW5nZWQrKztcbiAgICBjb25zdCB3YXNTb2xpZCA9IGlzU29saWQoZS5iZWZvcmUpO1xuICAgIGNvbnN0IGlzTm93U29saWQgPSBpc1NvbGlkKGUuYWZ0ZXIpO1xuICAgIGlmICghd2FzU29saWQgJiYgaXNOb3dTb2xpZCkgZGVsdGEuYWRkZWQrKztcbiAgICBpZiAod2FzU29saWQgJiYgIWlzTm93U29saWQpIGRlbHRhLnJlbW92ZWQrKztcbiAgICBjb25zdCBuYW1lID0gbWF0ZXJpYWxOYW1lKGUuYmVmb3JlKTtcbiAgICBpZiAod2FzU29saWQgJiYgIWlzTm93U29saWQpIGN1dEJ5TWF0ZXJpYWxbbmFtZV0gPSAoY3V0QnlNYXRlcmlhbFtuYW1lXSA/PyAwKSArIDE7XG4gICAgaWYgKCF3YXNTb2xpZCAmJiBpc05vd1NvbGlkKSBmaWxsQnlNYXRlcmlhbFttYXRlcmlhbE5hbWUoZS5hZnRlcildID0gKGZpbGxCeU1hdGVyaWFsW21hdGVyaWFsTmFtZShlLmFmdGVyKV0gPz8gMCkgKyAxO1xuICB9XG5cbiAgY29uc3QgZW50aXRpZXNDbGVhcmVkOiBDbGVhcmVkRW50aXR5W10gPSBbXTtcbiAgY29uc3QgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0ge307XG4gIGZvciAoY29uc3QgaWQgb2YgWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKSkge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmICghZSkgY29udGludWU7XG4gICAgY29uc3QgYW1vdW50ID0gZS5yZXNvdXJjZSAmJiBlLnJlbWFpbmluZyA+IDAgPyBlLnJlbWFpbmluZyA6IDA7XG4gICAgaWYgKGUucmVzb3VyY2UgJiYgYW1vdW50ID4gMCkge1xuICAgICAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgICAgIHJlc291cmNlc0dhaW5lZFtlLnJlc291cmNlXSA9IChyZXNvdXJjZXNHYWluZWRbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gICAgfVxuICAgIHJlbW92ZUVudGl0eSh3b3JsZCwgaWQpO1xuICAgIGVudGl0aWVzQ2xlYXJlZC5wdXNoKHtcbiAgICAgIGVudGl0eUlkOiBpZCwga2luZDogZS5raW5kLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50LCB4OiBlLngsIHk6IGUueSwgejogZS56LFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgY3V0ID0gYXBwbGllZCA+IDAgPyBPYmplY3QudmFsdWVzKGN1dEJ5TWF0ZXJpYWwpLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIDogMDtcbiAgY29uc3QgZmlsbCA9IGFwcGxpZWQgPiAwID8gT2JqZWN0LnZhbHVlcyhmaWxsQnlNYXRlcmlhbCkucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgOiAwO1xuICBjb25zdCBsZWRnZXI6IFByZXBhcmF0aW9uTGVkZ2VyID0ge1xuICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICBhdXRob3JpemF0aW9uSWQ6IGF1dGhvcml6YXRpb24uaWQsXG4gICAgcGxhbkRpZ2VzdDogYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0LFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHBsYW4uZmxvb3JZLFxuICAgIGN1dFZvbHVtZTogY3V0LFxuICAgIGZpbGxWb2x1bWU6IGZpbGwsXG4gICAgbmV0U3BvaWw6IGN1dCAtIGZpbGwsXG4gICAgYm9ycm93ZWRGaWxsOiBNYXRoLm1heCgwLCBmaWxsIC0gY3V0KSxcbiAgICBjdXRCeU1hdGVyaWFsLFxuICAgIGZpbGxCeU1hdGVyaWFsLFxuICAgIHZveGVsRWRpdHM6IGFwcGxpZWQsXG4gICAgc3VyZmFjZUVkaXRzLFxuICAgIGVudGl0aWVzQ2xlYXJlZCxcbiAgICByZXNvdXJjZXNHYWluZWQsXG4gICAgaW52ZW50b3J5QmVmb3JlLFxuICAgIGludmVudG9yeUFmdGVyOiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCksXG4gICAgY2h1bmtEZWx0YXM6IFsuLi5jaHVua0RlbHRhcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5jaHVuay5sb2NhbGVDb21wYXJlKGIuY2h1bmspKSxcbiAgICByZXZpc2lvbkJlZm9yZSxcbiAgICByZXZpc2lvbkFmdGVyOiB3b3JsZC5yZXZpc2lvbixcbiAgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIGF1dGhvcml6YXRpb24sIGxlZGdlciB9O1xufVxuXG4vKipcbiAqIFRoZSBzaGFyZWQgcGxheWVyL0FJIGVudHJ5IHBvaW50LiBUaGVyZSBpcyBubyBvdGhlciBjb25zdHJ1Y3Rpb24gcGF0aC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVTaXRlKFxuICB3b3JsZDogV29ybGQsXG4gIGF1dGhvcml6ZXI6IExvY2FsQXV0aG9yaXplcixcbiAgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCxcbiAgb3B0aW9uczogUHJlcGFyYXRpb25PcHRpb25zID0ge30sXG4pOiBQcmVwYXJhdGlvbk91dGNvbWUge1xuICBjb25zdCBwbGFubmVkID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBwcm9wb3NhbCwgb3B0aW9ucyk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGNvbnN0IGRlY2lzaW9uID0gYXV0aG9yaXplci5hdXRob3JpemUod29ybGQsIHBsYW5uZWQucGxhbik7XG4gIGlmICghZGVjaXNpb24ub2sgfHwgIWRlY2lzaW9uLmF1dGhvcml6YXRpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnYXV0aG9yaXplJywgJ25vdF9hdXRob3JpemVkJywgZGVjaXNpb24ucmVhc29ucyk7XG4gIH1cbiAgcmV0dXJuIGV4ZWN1dGVQcmVwYXJhdGlvbih3b3JsZCwgcGxhbm5lZC5wbGFuLCBkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcbn1cbiIsICIvLyBNMDAyIHN0YWdlIDQ6IGF1dGhvcml0YXRpdmUgaG91c2UsIHBhdGggYW5kIHRlcnJhY2Ugc3RydWN0dXJlcy5cbi8vXG4vLyBTdHJ1Y3R1cmVzIGFyZSBzaW11bGF0aW9uIHJlY29yZHMsIG5vdCByZW5kZXJlci1vbmx5IG1lc2hlcy4gQSBzdHJ1Y3R1cmUgaXNcbi8vIHBsYW5uZWQgZnJvbSB0aGUgcHJlcGFyZWQgdGVycmFpbiwgYXV0aG9yaXplZCBhZ2FpbnN0IHRoZSBzYW1lIGxvY2FsIHBvbGljeVxuLy8gZW52ZWxvcGUgYXMgdGVycmFpbiBwcmVwYXJhdGlvbiwgcGFpZCBmb3IgZnJvbSBpbnZlbnRvcnksIGFuZCB0aGVuIHN0b3JlZCBpblxuLy8gV29ybGQuc3RydWN0dXJlcy4gVGhlIHJlbmRlcmVyIHJlYWRzIHRob3NlIHJlY29yZHM7IGl0IG5ldmVyIGludmVudHMgYVxuLy8gYnVpbGRpbmcgdGhhdCB0aGUgc2ltdWxhdGlvbiBkb2VzIG5vdCBvd24uXG5pbXBvcnQge1xuICBXb3JsZCwgUmVzb3VyY2VUeXBlLCBNQVQsIHN1cmZhY2VBdCwgZ2V0Vm94ZWwsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIG5vcm1hbGl6ZVJlY3QsIGV4cGFuZFJlY3QsXG4gIGVudmVsb3BlQ29udGFpbnMsIG9ic3RydWN0aW9uc0luLFxufSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgQXV0aG9yaXphdGlvblBvbGljeSwgTE9DQUxfQVVUSE9SSVRZLCBMT0NBTF9FTkZPUkNFTUVOVCxcbn0gZnJvbSAnLi9wcmVwYXJhdGlvbic7XG5pbXBvcnQgeyBGQVJNX1JVTEVTIH0gZnJvbSAnLi9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHsgaW52ZW50b3J5U25hcHNob3QgfSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZUtpbmQgPSAnaG91c2UnIHwgJ3BhdGgnIHwgJ3RlcnJhY2UnO1xuLyoqIE0wMDIgZGVzaWduIDEgaXMgaW1tdXRhYmxlIHJlcGxheSBjb250ZW50OyBkZXNpZ24gMiBpcyB0aGUgZm91bmRlciBjYW5kaWRhdGUuICovXG5leHBvcnQgY29uc3QgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiA9IDIgYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uID0gdHlwZW9mIEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG5cbmV4cG9ydCB0eXBlIE1vZHVsZUtpbmQgPVxuICB8ICdmbG9vcidcbiAgfCAnd2FsbCdcbiAgfCAncG9zdCdcbiAgfCAnbGludGVsJ1xuICB8ICdyb29mJ1xuICB8ICdwYXJhcGV0J1xuICB8ICd3aW5kb3cnXG4gIHwgJ2Rvb3InXG4gIHwgJ3RocmVzaG9sZCdcbiAgfCAncGF0aCdcbiAgfCAnY3VyYidcbiAgfCAnc29pbF9iZWQnXG4gIHwgJ3JldGFpbmluZ193YWxsJ1xuICB8ICdjcm9wX3Jvdyc7XG5cbmV4cG9ydCB0eXBlIE1vZHVsZVRvbmUgPVxuICB8ICdzdG9uZSdcbiAgfCAnc3RvbmVfYidcbiAgfCAnb2NocmUnXG4gIHwgJ3RpbWJlcidcbiAgfCAnYWNjZW50J1xuICB8ICdzb2lsJ1xuICB8ICdjcm9wJ1xuICB8ICdncmF2ZWwnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZU1vZHVsZSB7XG4gIGtpbmQ6IE1vZHVsZUtpbmQ7XG4gIC8qKiBDZW50cmUgaW4gd29ybGQgeC96LCBib3R0b20gaW4gd29ybGQgeS4gKi9cbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgdzogbnVtYmVyO1xuICBoOiBudW1iZXI7XG4gIGQ6IG51bWJlcjtcbiAgcm90PzogbnVtYmVyO1xuICB0b25lPzogTW9kdWxlVG9uZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgLyoqIE9yaWdpbjogY2VudHJlIG9mIHRoZSBwcmVwYXJlZCBmb290cHJpbnQgYXQgZmxvb3IgaGVpZ2h0LiAqL1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW107XG4gIGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGJ1aWx0UmV2aXNpb246IG51bWJlcjtcbiAgLyoqIEFic2VudCBtZWFucyBsZWdhY3kgTTAwMiBkZXNpZ24gMTsgbmV2ZXIgaW5mZXIgaXQgZnJvbSB0aGUgcmVuZGVyZXIuICovXG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWNlQmFuZCB7XG4gIHowOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVQcm9wb3NhbCB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgLyoqIFJlcXVpcmVkIGZvciBob3VzZXM6IHZveGVsIGNvbHVtbiBvZiB0aGUgZG9vciBvbiB0aGUgZWFzdCB3YWxsLiAqL1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICAvKiogT3B0aW9uYWwgcGF0aCBtZXRhZGF0YTsgdGhlIHBhdGggaXMgbGFpZCBhbG9uZyB0aGUgcmVjdCBjZW50cmVsaW5lLiAqL1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgdGVycmFjZXM/OiBudW1iZXI7XG4gIC8qKiBEZWxpYmVyYXRlIGNvbnRlbnQgc2VsZWN0aW9uIGNhcnJpZWQgYnkgc2NoZW1hLTIgY29tbWFuZHMuICovXG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uO1xufVxuXG4vKipcbiAqIFNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIHN0cnVjdHVyZSBjb3N0cy4gVGhlIHBsYW5uZXJzIGFuZCB0aGUgYnVpbGQgVUlcbiAqIGJvdGggcmVhZCB0aGVzZTsgYSBidWlsZGluZyBjYW5ub3QgYWR2ZXJ0aXNlIG9uZSBwcmljZSBhbmQgY2hhcmdlIGFub3RoZXIuXG4gKi9cbmV4cG9ydCBjb25zdCBIT1VTRV9DT1NUOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0geyB3b29kOiAxMCwgc3RvbmU6IDE4IH07XG5leHBvcnQgY29uc3QgVEVSUkFDRV9DT1NUOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0geyB3b29kOiA2LCBzdG9uZTogMTIgfTtcblxuLyoqIEEgcGF0aCBwYXlzIG9uZSBzdG9uZSBwZXIgbWV0cmUgb2YgY29ycmlkb3Igd2lkdGguICovXG5leHBvcnQgZnVuY3Rpb24gcGF0aENvc3Qod2lkdGg6IG51bWJlcik6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4ge1xuICByZXR1cm4geyBzdG9uZTogd2lkdGggfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVQbGFuIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBvcmlnaW46IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICByb3Q6IG51bWJlcjtcbiAgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW107XG4gIGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICAvKiogRXhwZWN0ZWQgcHJlcGFyZWQgc3VyZmFjZSwgY2hlY2tlZCBhZ2FpbiBhdCBleGVjdXRpb24gdGltZS4gKi9cbiAgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdO1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbiAgdGVycmFjZXM/OiBUZXJyYWNlQmFuZFtdO1xufVxuXG4vLyAtLS0tLS0tLS0tIHN0YWJsZSBkaWdlc3QgLS0tLS0tLS0tLVxuZnVuY3Rpb24gZGlnZXN0KGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzU7XG4gIGxldCBiID0gMHg5ZTM3NzliOTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbnB1dC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGMgPSBpbnB1dC5jaGFyQ29kZUF0KGkpO1xuICAgIGEgPSBNYXRoLmltdWwoYSBeIGMsIDB4MDEwMDAxOTMpO1xuICAgIGIgPSBNYXRoLmltdWwoYiBeIChjICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIGIgXj0gYiA+Pj4gMTM7XG4gIH1cbiAgcmV0dXJuIChhID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICsgKGIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RydWN0dXJlRGlnZXN0KHBsYW46IFN0cnVjdHVyZVBsYW4pOiBzdHJpbmcge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXG4gICAgJ20wMDI6c3RydWN0dXJlLXBsYW46djEnLFxuICAgIHBsYW4ua2luZCxcbiAgICBwbGFuLnNpdGVJZCxcbiAgICBgJHtwbGFuLnJlY3QueDB9LCR7cGxhbi5yZWN0LnowfSwke3BsYW4ucmVjdC54MX0sJHtwbGFuLnJlY3QuejF9YCxcbiAgICBTdHJpbmcocGxhbi5mbG9vclkpLFxuICAgIGAke3BsYW4ub3JpZ2luLnh9LCR7cGxhbi5vcmlnaW4ueX0sJHtwbGFuLm9yaWdpbi56fWAsXG4gICAgU3RyaW5nKHBsYW4ucm90KSxcbiAgICAuLi4ocGxhbi5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OID8gWydkZXNpZ246MiddIDogW10pLFxuICAgIGBtOiR7cGxhbi5tb2R1bGVzLmxlbmd0aH1gLFxuICBdO1xuICBmb3IgKGNvbnN0IG0gb2YgcGxhbi5tb2R1bGVzKSB7XG4gICAgbGluZXMucHVzaChgbToke20ua2luZH0sJHttLnh9LCR7bS55fSwke20uen0sJHttLnd9LCR7bS5ofSwke20uZH0sJHttLnJvdCA/PyAwfSwke20udG9uZSA/PyAnJ31gKTtcbiAgfVxuICBjb25zdCBjb3N0S2V5cyA9IE9iamVjdC5rZXlzKHBsYW4uY29zdCkuc29ydCgpO1xuICBsaW5lcy5wdXNoKGBjb3N0OiR7Y29zdEtleXMubGVuZ3RofWApO1xuICBmb3IgKGNvbnN0IGtleSBvZiBjb3N0S2V5cykgbGluZXMucHVzaChgY29zdDoke2tleX0sJHtwbGFuLmNvc3Rba2V5IGFzIFJlc291cmNlVHlwZV0gPz8gMH1gKTtcbiAgZm9yIChjb25zdCBzIG9mIHBsYW4uc3VyZmFjZSkgbGluZXMucHVzaChgczoke3MueH0sJHtzLnp9LCR7cy55fWApO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50ZXJyYWNlcyA/PyBbXSkgbGluZXMucHVzaChgdDoke3QuejB9LCR7dC56MX0sJHt0Lnl9YCk7XG4gIHJldHVybiBkaWdlc3QobGluZXMuam9pbignXFxuJykpO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBsYW5uaW5nIGhlbHBlcnMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVGYWlsdXJlIHtcbiAgb2s6IGZhbHNlO1xuICBzdGFnZTogJ3BsYW4nIHwgJ2F1dGhvcml6ZScgfCAnZXhlY3V0ZSc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUGxhblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogU3RydWN0dXJlUGxhbjtcbn1cblxuZXhwb3J0IHR5cGUgU3RydWN0dXJlUGxhblJlc3VsdCA9IFN0cnVjdHVyZVBsYW5TdWNjZXNzIHwgU3RydWN0dXJlRmFpbHVyZTtcblxuZnVuY3Rpb24gZmFpbChzdGFnZTogU3RydWN0dXJlRmFpbHVyZVsnc3RhZ2UnXSwgY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IFN0cnVjdHVyZUZhaWx1cmUge1xuICByZXR1cm4geyBvazogZmFsc2UsIHN0YWdlLCBjb2RlLCByZWFzb25zIH07XG59XG5cbmZ1bmN0aW9uIHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkOiBXb3JsZCwgc2FtcGxlczogcmVhZG9ubHkgU3VyZmFjZVNhbXBsZVtdKSB7XG4gIGNvbnN0IG91dDogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlcjsgZXhwZWN0ZWQ6IG51bWJlcjsgYWN0dWFsOiBudW1iZXIgfT4gPSBbXTtcbiAgZm9yIChjb25zdCBzIG9mIHNhbXBsZXMpIHtcbiAgICBjb25zdCBhY3R1YWwgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoYWN0dWFsICE9PSBzLnkpIG91dC5wdXNoKHsgeDogcy54LCB6OiBzLnosIGV4cGVjdGVkOiBzLnksIGFjdHVhbCB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBmb290cHJpbnRTdXJmYWNlKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCwgeTogbnVtYmVyKTogU3VyZmFjZVNhbXBsZVtdIHtcbiAgY29uc3Qgb3V0OiBTdXJmYWNlU2FtcGxlW10gPSBbXTtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSBvdXQucHVzaCh7IHgsIHosIHkgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gZm9vdHByaW50RW52ZWxvcGUocmVjdDogUmVjdCwgeTA6IG51bWJlciwgeTE6IG51bWJlciwgbWFyZ2luID0gMSk6IFZveGVsUmVnaW9uW10ge1xuICBjb25zdCByID0gZXhwYW5kUmVjdChyZWN0LCBtYXJnaW4pO1xuICByZXR1cm4gW3sgLi4uciwgeTAsIHkxIH1dO1xufVxuXG5mdW5jdGlvbiBtb2R1bGVCb3VuZHMobTogU3RydWN0dXJlTW9kdWxlKTogeyB4MDogbnVtYmVyOyB4MTogbnVtYmVyOyB5MDogbnVtYmVyOyB5MTogbnVtYmVyOyB6MDogbnVtYmVyOyB6MTogbnVtYmVyIH0ge1xuICBjb25zdCByID0gTWF0aC5oeXBvdChtLncsIG0uZCkgLyAyO1xuICBjb25zdCBoYWxmVyA9IChtLnJvdCA/PyAwKSA9PT0gMCA/IG0udyAvIDIgOiByO1xuICBjb25zdCBoYWxmRCA9IChtLnJvdCA/PyAwKSA9PT0gMCA/IG0uZCAvIDIgOiByO1xuICByZXR1cm4ge1xuICAgIHgwOiBtLnggLSBoYWxmVywgeDE6IG0ueCArIGhhbGZXLFxuICAgIHkwOiBtLnksIHkxOiBtLnkgKyBtLmgsXG4gICAgejA6IG0ueiAtIGhhbGZELCB6MTogbS56ICsgaGFsZkQsXG4gIH07XG59XG5cbmZ1bmN0aW9uIG1vZHVsZUluc2lkZUVudmVsb3BlKG06IFN0cnVjdHVyZU1vZHVsZSwgZW52ZWxvcGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBib29sZWFuIHtcbiAgY29uc3QgYiA9IG1vZHVsZUJvdW5kcyhtKTtcbiAgcmV0dXJuIGVudmVsb3BlLnNvbWUoKGUpID0+IGIueDAgPj0gZS54MCAtIDFlLTYgJiYgYi54MSA8PSBlLngxICsgMSArIDFlLTZcbiAgICAmJiBiLnkwID49IGUueTAgLSAxZS02ICYmIGIueTEgPD0gZS55MSArIDEgKyAxZS02XG4gICAgJiYgYi56MCA+PSBlLnowIC0gMWUtNiAmJiBiLnoxIDw9IGUuejEgKyAxICsgMWUtNik7XG59XG5cbmZ1bmN0aW9uIGNvc3RUb3RhbChjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+KTogbnVtYmVyIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXMoY29zdCkucmVkdWNlKChhLCBiKSA9PiBhICsgKGIgPz8gMCksIDApO1xufVxuXG5mdW5jdGlvbiBtZWRpYW4odmFsdWVzOiBudW1iZXJbXSk6IG51bWJlciB7XG4gIGNvbnN0IHNvcnRlZCA9IFsuLi52YWx1ZXNdLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbiAgcmV0dXJuIHNvcnRlZFtNYXRoLmZsb29yKHNvcnRlZC5sZW5ndGggLyAyKV07XG59XG5cbi8vIC0tLS0tLS0tLS0gaG91c2UgLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhbkhvdXNlKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGlmICh3aWR0aCAhPT0gOCB8fCBkZXB0aCAhPT0gNikge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgaG91c2UgbmVlZHMgOCB4IDYgbSwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuICBpZiAoIXByb3Bvc2FsLmRvb3IpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdtaXNzaW5nX2Rvb3InLCBbJ2hvdXNlIHBsYW4gbmVlZHMgYSBkb29yIGNvbHVtbiddKTtcbiAgfVxuICBpZiAocHJvcG9zYWwuZG9vci56IDwgcmVjdC56MCB8fCBwcm9wb3NhbC5kb29yLnogPiByZWN0LnoxKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnZG9vcl9vdXRzaWRlJywgW2Bkb29yIHogJHtwcm9wb3NhbC5kb29yLnp9IGlzIG91dHNpZGUgJHtyZWN0LnowfS4uJHtyZWN0LnoxfWBdKTtcbiAgfVxuXG4gIGNvbnN0IHN1cmZhY2UgPSBmb290cHJpbnRTdXJmYWNlKHdvcmxkLCByZWN0LCBwcm9wb3NhbC5mbG9vclkpO1xuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG5cbiAgY29uc3QgZmxvb3JZID0gcHJvcG9zYWwuZmxvb3JZO1xuICBjb25zdCB4MCA9IHJlY3QueDAsIHgxID0gcmVjdC54MSArIDE7XG4gIGNvbnN0IHowID0gcmVjdC56MCwgejEgPSByZWN0LnoxICsgMTtcbiAgY29uc3QgY3ggPSAoeDAgKyB4MSkgLyAyO1xuICBjb25zdCBjeiA9ICh6MCArIHoxKSAvIDI7XG4gIGNvbnN0IGRvb3JaID0gcHJvcG9zYWwuZG9vci56ICsgMC41O1xuICBjb25zdCBkb29ySGFsZiA9IDAuNjtcbiAgY29uc3Qgd2FsbEggPSAzLjA7XG4gIGNvbnN0IHdhbGxUID0gMC41O1xuICBjb25zdCBkb29ySCA9IDIuMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcblxuICAvLyBGbG9vciBzbGFiIGFuZCByb29mIHBsYXRlLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnZmxvb3InLCB4OiBjeCwgeTogZmxvb3JZLCB6OiBjeiwgdzogOC4wLCBoOiAwLjMsIGQ6IDYuMCwgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncm9vZicsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCwgejogY3osIHc6IDguNCwgaDogMC4zLCBkOiA2LjQsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gTm9ydGggYW5kIHNvdXRoIHdhbGxzLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnd2FsbCcsIHg6IGN4LCB5OiBmbG9vclksIHo6IHowICsgd2FsbFQgLyAyLCB3OiA4LjAsIGg6IHdhbGxILCBkOiB3YWxsVCwgdG9uZTogJ3N0b25lJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiBjeCwgeTogZmxvb3JZLCB6OiB6MSAtIHdhbGxUIC8gMiwgdzogOC4wLCBoOiB3YWxsSCwgZDogd2FsbFQsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gV2VzdCB3YWxsLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnd2FsbCcsIHg6IHgwICsgd2FsbFQgLyAyLCB5OiBmbG9vclksIHo6IGN6LCB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IDYuMCwgdG9uZTogJ3N0b25lJyB9KTtcblxuICAvLyBFYXN0IHdhbGwgd2l0aCBhIHJlYWwgZG9vcndheSBnYXAuXG4gIGNvbnN0IGVhc3RYID0geDEgLSB3YWxsVCAvIDI7XG4gIGNvbnN0IGdhcDAgPSBkb29yWiAtIGRvb3JIYWxmO1xuICBjb25zdCBnYXAxID0gZG9vclogKyBkb29ySGFsZjtcbiAgY29uc3QgbGVmdExlbiA9IGdhcDAgLSB6MDtcbiAgY29uc3QgcmlnaHRMZW4gPSB6MSAtIGdhcDE7XG4gIGlmIChsZWZ0TGVuID4gMC4wNSkge1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnd2FsbCcsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IHowICsgbGVmdExlbiAvIDIsXG4gICAgICB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IGxlZnRMZW4sIHRvbmU6ICdzdG9uZScsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHJpZ2h0TGVuID4gMC4wNSkge1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnd2FsbCcsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDEgKyByaWdodExlbiAvIDIsXG4gICAgICB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IHJpZ2h0TGVuLCB0b25lOiAnc3RvbmUnLFxuICAgIH0pO1xuICB9XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2xpbnRlbCcsIHg6IGVhc3RYLCB5OiBmbG9vclkgKyBkb29ySCwgejogZG9vclosXG4gICAgdzogd2FsbFQsIGg6IHdhbGxIIC0gZG9vckgsIGQ6IGRvb3JIYWxmICogMiwgdG9uZTogJ3N0b25lX2InLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAnZG9vcicsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDAsXG4gICAgdzogMC4xOCwgaDogZG9vckgsIGQ6IDAuMTYsIHRvbmU6ICd0aW1iZXInLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAnZG9vcicsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDEsXG4gICAgdzogMC4xOCwgaDogZG9vckgsIGQ6IDAuMTYsIHRvbmU6ICd0aW1iZXInLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAndGhyZXNob2xkJywgeDogeDEgKyAwLjM1LCB5OiBmbG9vclksIHo6IGRvb3JaLFxuICAgIHc6IDAuOSwgaDogMC4xNiwgZDogMS4zLCB0b25lOiAnb2NocmUnLFxuICB9KTtcblxuICAvLyBUd28gd2luZG93cyBvbiB0aGUgc291dGggd2FsbCwgc2xpZ2h0bHkgcHJvdWQgb2YgdGhlIG91dGVyIGZhY2UuXG4gIGZvciAoY29uc3Qgd3ggb2YgW2N4IC0gMi4yLCBjeCArIDIuMl0pIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dpbmRvdycsIHg6IHd4LCB5OiBmbG9vclkgKyAxLjQ1LCB6OiB6MSAtIDAuMDIsXG4gICAgICB3OiAxLjAsIGg6IDEuMCwgZDogMC4wOCwgdG9uZTogJ2FjY2VudCcsXG4gICAgfSk7XG4gIH1cblxuICAvLyBQYXJhcGV0IGFyb3VuZCB0aGUgZmxhdCBOb3hlbCByb29mLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3ogLSAzLjA1LCB3OiA4LjQsIGg6IDAuNCwgZDogMC4zLCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3gsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiArIDMuMDUsIHc6IDguNCwgaDogMC40LCBkOiAwLjMsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCAtIDQuMDUsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiwgdzogMC4zLCBoOiAwLjQsIGQ6IDYuNCwgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4ICsgNC4wNSwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6LCB3OiAwLjMsIGg6IDAuNCwgZDogNi40LCB0b25lOiAnc3RvbmVfYicgfSk7XG5cbiAgY29uc3QgcGxhbjogU3RydWN0dXJlUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAga2luZDogJ2hvdXNlJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogY3gsIHk6IGZsb29yWSwgejogY3ogfSxcbiAgICByb3Q6IDAsXG4gICAgbW9kdWxlcyxcbiAgICBjb3N0OiB7IC4uLkhPVVNFX0NPU1QgfSxcbiAgICBlbnZlbG9wZTogZm9vdHByaW50RW52ZWxvcGUocmVjdCwgZmxvb3JZLCBmbG9vclkgKyA0LCAyKSxcbiAgICBzdXJmYWNlLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHBhdGggLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhblBhdGgod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHdpZHRoID0gcmVjdC54MSAtIHJlY3QueDAgKyAxO1xuICBjb25zdCBkZXB0aCA9IHJlY3QuejEgLSByZWN0LnowICsgMTtcbiAgaWYgKGRlcHRoICE9PSAzIHx8IHdpZHRoIDwgMykge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgcGF0aCBuZWVkcyBhIDMgbSB3aWRlIGNvcnJpZG9yLCBnb3QgJHt3aWR0aH0geCAke2RlcHRofSBtYF0pO1xuICB9XG5cbiAgY29uc3QgY2VudGVyWiA9IHJlY3QuejAgKyAxO1xuICBjb25zdCBzdXJmYWNlOiBTdXJmYWNlU2FtcGxlW10gPSBbXTtcbiAgY29uc3QgaGVpZ2h0czogbnVtYmVyW10gPSBbXTtcbiAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgY2VudGVyWik7XG4gICAgaGVpZ2h0cy5wdXNoKHkpO1xuICAgIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykgc3VyZmFjZS5wdXNoKHsgeCwgeiwgeSB9KTtcbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgaGVpZ2h0cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHN0ZXAgPSBoZWlnaHRzW2ldIC0gaGVpZ2h0c1tpIC0gMV07XG4gICAgaWYgKE1hdGguYWJzKHN0ZXApID4gMSkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9zdGVwJywgW2BzdGVwICR7c3RlcH0gbSBhdCB4PSR7cmVjdC54MCArIGl9YF0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IHMgb2Ygc3VyZmFjZSkge1xuICAgIGNvbnN0IHRvcCA9IGdldFZveGVsKHdvcmxkLCBzLngsIHMueSAtIDEsIHMueik7XG4gICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX3dldCcsIFtgY29sdW1uICR7cy54fSwke3Muen0gaXMgd2V0YF0pO1xuICAgIH1cbiAgICBpZiAodG9wICE9PSBNQVQuR1JBVkVMKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX3N1cmZhY2UnLCBbXG4gICAgICAgIGBjb2x1bW4gJHtzLnh9LCR7cy56fSB0b3AgaXMgJHt0b3B9LCBleHBlY3RlZCBncmF2ZWxgLFxuICAgICAgXSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG5cbiAgY29uc3QgY3ogPSBjZW50ZXJaICsgMC41O1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCBjZW50ZXJaKTtcbiAgICBjb25zdCBteCA9IHggKyAwLjU7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhdGgnLCB4OiBteCwgeSwgejogY3osIHc6IDEuMCwgaDogMC4xMiwgZDogMy4wLCB0b25lOiAnZ3JhdmVsJyB9KTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IG14LCB5LCB6OiByZWN0LnowICsgMC4wNzUsIHc6IDEuMCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lX2InIH0pO1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdjdXJiJywgeDogbXgsIHksIHo6IHJlY3QuejEgKyAxIC0gMC4wNzUsIHc6IDEuMCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lX2InIH0pO1xuICB9XG5cbiAgY29uc3QgbWluWSA9IE1hdGgubWluKC4uLmhlaWdodHMpO1xuICBjb25zdCBtYXhZID0gTWF0aC5tYXgoLi4uaGVpZ2h0cyk7XG4gIGNvbnN0IHBsYW46IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIGtpbmQ6ICdwYXRoJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIG9yaWdpbjogeyB4OiAocmVjdC54MCArIHJlY3QueDEgKyAxKSAvIDIsIHk6IG1pblksIHo6IGN6IH0sXG4gICAgcm90OiAwLFxuICAgIG1vZHVsZXMsXG4gICAgY29zdDogcGF0aENvc3Qod2lkdGgpLFxuICAgIGVudmVsb3BlOiBmb290cHJpbnRFbnZlbG9wZShyZWN0LCBtaW5ZIC0gMSwgbWF4WSArIDIsIDApLFxuICAgIHN1cmZhY2UsXG4gIH07XG4gIHBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gdGVycmFjZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhblRlcnJhY2VzKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGNvbnN0IGNvdW50ID0gcHJvcG9zYWwudGVycmFjZXMgPz8gMztcbiAgaWYgKHdpZHRoICE9PSAxMiB8fCBkZXB0aCAhPT0gOCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgdGVycmFjZXMgbmVlZCAxMiB4IDggbSwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuICBpZiAoY291bnQgPCAyIHx8IGNvdW50ID4gNCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3RlcnJhY2VfY291bnQnLCBbYCR7Y291bnR9IHRlcnJhY2VzIGlzIG91dHNpZGUgMi4uNGBdKTtcbiAgfVxuXG4gIC8vIFNwbGl0IGRlcHRoIGludG8gbmVhci1lcXVhbCBiYW5kcywgaGlnaCBzaWRlIGZpcnN0LlxuICBjb25zdCBiYXNlID0gTWF0aC5mbG9vcihkZXB0aCAvIGNvdW50KTtcbiAgY29uc3QgZXh0cmEgPSBkZXB0aCAlIGNvdW50O1xuICBjb25zdCBiYW5kczogVGVycmFjZUJhbmRbXSA9IFtdO1xuICBsZXQgeiA9IHJlY3QuejA7XG4gIGNvbnN0IG1lZGlhbnM6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgIGNvbnN0IHNpemUgPSBiYXNlICsgKGkgPCBleHRyYSA/IDEgOiAwKTtcbiAgICBjb25zdCB6MCA9IHosIHoxID0geiArIHNpemUgLSAxO1xuICAgIGNvbnN0IHZhbHVlczogbnVtYmVyW10gPSBbXTtcbiAgICBmb3IgKGxldCBieiA9IHowOyBieiA8PSB6MTsgYnorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB2YWx1ZXMucHVzaChzdXJmYWNlQXQod29ybGQsIHgsIGJ6KSk7XG4gICAgfVxuICAgIG1lZGlhbnMucHVzaChtZWRpYW4odmFsdWVzKSk7XG4gICAgYmFuZHMucHVzaCh7IHowLCB6MSwgeTogMCB9KTtcbiAgICB6ID0gejEgKyAxO1xuICB9XG4gIC8vIEVhY2ggdGVycmFjZSBzaXRzIGV4YWN0bHkgb25lIG1ldHJlIGJlbG93IHRoZSBwcmV2aW91cyBvbmUuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYmFuZHMubGVuZ3RoOyBpKyspIHtcbiAgICBiYW5kc1tpXS55ID0gaSA9PT0gMCA/IG1lZGlhbnNbMF0gOiBNYXRoLm1pbihtZWRpYW5zW2ldLCBiYW5kc1tpIC0gMV0ueSAtIDEpO1xuICB9XG5cbiAgbGV0IG1heEN1dCA9IDAsIG1heEZpbGwgPSAwLCBjdXRWb2x1bWUgPSAwLCBmaWxsVm9sdW1lID0gMDtcbiAgY29uc3Qgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGZvciAoY29uc3QgYiBvZiBiYW5kcykge1xuICAgIGZvciAobGV0IGJ6ID0gYi56MDsgYnogPD0gYi56MTsgYnorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IHMgPSBzdXJmYWNlQXQod29ybGQsIHgsIGJ6KTtcbiAgICAgICAgc3VyZmFjZS5wdXNoKHsgeCwgejogYnosIHk6IGIueSB9KTtcbiAgICAgICAgY29uc3QgZCA9IHMgLSBiLnk7XG4gICAgICAgIGlmIChkID4gMCkgeyBjdXRWb2x1bWUgKz0gZDsgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkKTsgfVxuICAgICAgICBpZiAoZCA8IDApIHsgZmlsbFZvbHVtZSArPSAtZDsgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIC1kKTsgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAobWF4Q3V0ID4gRkFSTV9SVUxFUy5tYXhDdXQgfHwgbWF4RmlsbCA+IEZBUk1fUlVMRVMubWF4RmlsbFxuICAgIHx8IGN1dFZvbHVtZSA+IEZBUk1fUlVMRVMubWF4Q3V0Vm9sdW1lIHx8IGZpbGxWb2x1bWUgPiBGQVJNX1JVTEVTLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX2VhcnRod29yaycsIFtcbiAgICAgIGBjdXQgJHtjdXRWb2x1bWV9IG1cdTAwQjMgLyBmaWxsICR7ZmlsbFZvbHVtZX0gbVx1MDBCMywgbWF4ICR7bWF4Q3V0fS8ke21heEZpbGx9IG1gLFxuICAgIF0pO1xuICB9XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX25vdF9wcmVwYXJlZCcsIG1pc21hdGNoZXMuc2xpY2UoMCwgNCkubWFwKFxuICAgICAgKG0pID0+IGBjb2x1bW4gJHttLnh9LCR7bS56fSBpcyBhdCAke20uYWN0dWFsfSwgZXhwZWN0ZWQgJHttLmV4cGVjdGVkfWAsXG4gICAgKSk7XG4gIH1cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX29ic3RydWN0ZWQnLCBvYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSk7XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIHN1cmZhY2UpIHtcbiAgICBjb25zdCB0b3AgPSBnZXRWb3hlbCh3b3JsZCwgcy54LCBzLnkgLSAxLCBzLnopO1xuICAgIGlmICh0b3AgIT09IE1BVC5TT0lMKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX3N1cmZhY2UnLCBbXG4gICAgICAgIGBjb2x1bW4gJHtzLnh9LCR7cy56fSB0b3AgaXMgJHt0b3B9LCBleHBlY3RlZCBzb2lsYCxcbiAgICAgIF0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGN4ID0gKHJlY3QueDAgKyByZWN0LngxICsgMSkgLyAyO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGIgb2YgYmFuZHMpIHtcbiAgICBjb25zdCBieiA9IChiLnowICsgYi56MSArIDEpIC8gMjtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3NvaWxfYmVkJywgeDogY3gsIHk6IGIueSwgejogYnosXG4gICAgICB3OiB3aWR0aCwgaDogMC4xOCwgZDogYi56MSAtIGIuejAgKyAxLCB0b25lOiAnc29pbCcsXG4gICAgfSk7XG4gICAgLy8gVGhyZWUgY3JvcCByb3dzIHBlciB0ZXJyYWNlLCBpbnNldCBmcm9tIHRoZSByZXRhaW5pbmcgd2FsbHMuXG4gICAgY29uc3Qgcm93RGVwdGggPSBiLnoxIC0gYi56MCArIDE7XG4gICAgZm9yIChsZXQgciA9IDA7IHIgPCAzOyByKyspIHtcbiAgICAgIGNvbnN0IHQgPSAociArIDEpIC8gNDtcbiAgICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICAgIGtpbmQ6ICdjcm9wX3JvdycsIHg6IGN4LCB5OiBiLnkgKyAwLjE4LCB6OiBiLnowICsgcm93RGVwdGggKiB0LFxuICAgICAgICB3OiB3aWR0aCAtIDEuMiwgaDogMC4yOCwgZDogMC4zNiwgdG9uZTogJ2Nyb3AnLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgYmFuZHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB1cHBlciA9IGJhbmRzW2kgLSAxXTtcbiAgICBjb25zdCBsb3dlciA9IGJhbmRzW2ldO1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAncmV0YWluaW5nX3dhbGwnLCB4OiBjeCwgeTogbG93ZXIueSwgejogdXBwZXIuejEgKyAwLjUsXG4gICAgICB3OiB3aWR0aCwgaDogdXBwZXIueSAtIGxvd2VyLnksIGQ6IDAuNCwgdG9uZTogJ3N0b25lX2InLFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgbWluWSA9IE1hdGgubWluKC4uLmJhbmRzLm1hcCgoYikgPT4gYi55KSk7XG4gIGNvbnN0IG1heFkgPSBNYXRoLm1heCguLi5iYW5kcy5tYXAoKGIpID0+IGIueSkpO1xuICBjb25zdCBwbGFuOiBTdHJ1Y3R1cmVQbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBraW5kOiAndGVycmFjZScsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogY3gsIHk6IG1pblksIHo6IChyZWN0LnowICsgcmVjdC56MSArIDEpIC8gMiB9LFxuICAgIHJvdDogMCxcbiAgICBtb2R1bGVzLFxuICAgIGNvc3Q6IHsgLi4uVEVSUkFDRV9DT1NUIH0sXG4gICAgZW52ZWxvcGU6IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIG1pblkgLSAxLCBtYXhZICsgMiwgMSksXG4gICAgc3VyZmFjZSxcbiAgICB0ZXJyYWNlczogYmFuZHMsXG4gIH07XG4gIHBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFuU3RydWN0dXJlKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGlmIChwcm9wb3NhbC5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSByZXR1cm4gcGxhbkZvdW5kZXJEZXNpZ24od29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKHByb3Bvc2FsLmRlc2lnblZlcnNpb24gIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3Vuc3VwcG9ydGVkX2Rlc2lnbicsIFtgdW5zdXBwb3J0ZWQgc3RydWN0dXJlIGRlc2lnbiAke1N0cmluZyhwcm9wb3NhbC5kZXNpZ25WZXJzaW9uKX1gXSk7XG4gIH1cbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdob3VzZScpIHJldHVybiBwbGFuSG91c2Uod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdwYXRoJykgcmV0dXJuIHBsYW5QYXRoKHdvcmxkLCBwcm9wb3NhbCk7XG4gIHJldHVybiBwbGFuVGVycmFjZXMod29ybGQsIHByb3Bvc2FsKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBkZXNpZ24gMjogYm91bmRlZCBmb3VuZGVyIGNhbmRpZGF0ZSAtLS0tLS0tLS0tXG4vLyBUaGlzIGRlbGliZXJhdGVseSBsZWF2ZXMgZXZlcnkgbGVnYWN5IHBsYW5uZXIgYWJvdmUgdW50b3VjaGVkLiBUaGUgZXh0cmEgd2FsbFxuLy8gcHJpbWl0aXZlcyByZXByZXNlbnQgdm9pZHMsIG5vdCBkZWNvcmF0aXZlIHdpbmRvd3M7IHRoZWlyIGFzc2V0LWxldmVsIHZvbHVtZVxuLy8gaW50ZXJwcmV0YXRpb24gcmVtYWlucyBSZXZpZXcgUmVxdWlyZWQgKHRoZSBmb3VuZGVyIDRcdTIwMTM5IHZvbHVtZSB0YXJnZXQpLlxuZnVuY3Rpb24gcGxhbkZvdW5kZXJEZXNpZ24od29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdwYXRoJykgcmV0dXJuIHBsYW5Gb3VuZGVyUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICBjb25zdCBwbGFubmVkID0gcHJvcG9zYWwua2luZCA9PT0gJ2hvdXNlJyA/IHBsYW5Ib3VzZSh3b3JsZCwgcHJvcG9zYWwpIDogcGxhblRlcnJhY2VzKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAndGVycmFjZScpIHtcbiAgICAvLyBDcm9wIHJvd3Mgc3RheSBjb21wYWN0IGF1dGhvcml0YXRpdmUgYWdncmVnYXRlcy4gVGhlaXIgZmFjZXRlZCBmb2xpYWdlIGlzXG4gICAgLy8gZGVyaXZlZCBwcmVzZW50YXRpb24gb25seTsgbm8gcGxhbnQtbGV2ZWwgZXhpc3RlbmNlIG9yIHlpZWxkIGlzIGludmVudGVkLlxuICAgIHBsYW5uZWQucGxhbi5kZXNpZ25WZXJzaW9uID0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbiAgICBwbGFubmVkLnBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW5uZWQucGxhbil9YDtcbiAgICByZXR1cm4gcGxhbm5lZDtcbiAgfVxuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgeDAgPSByZWN0LngwLCB4MSA9IHJlY3QueDEgKyAxO1xuICBjb25zdCB6MCA9IHJlY3QuejAsIHoxID0gcmVjdC56MSArIDE7XG4gIGNvbnN0IHkgPSBwcm9wb3NhbC5mbG9vclksIGN4ID0gKHgwICsgeDEpIC8gMiwgY3ogPSAoejAgKyB6MSkgLyAyO1xuICBjb25zdCB0ID0gMC42LCBoID0gMy4yO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICAvLyBPbmUgc3RydWN0dXJhbCBzdG9uZSBmYW1pbHk6IGxpZ2h0aW5nLCBub3QgcGFpbnRlZCBmYWNlIHZhcmlhdGlvbiwgc2hhZGVzIGl0LlxuICBjb25zdCB3YWxsID0gKHg6IG51bWJlciwgYm90dG9tOiBudW1iZXIsIHo6IG51bWJlciwgdzogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZDogbnVtYmVyLCBraW5kOiBTdHJ1Y3R1cmVNb2R1bGVbJ2tpbmQnXSA9ICd3YWxsJykgPT4ge1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQsIHgsIHk6IGJvdHRvbSwgeiwgdywgaDogaGVpZ2h0LCBkLCB0b25lOiAnc3RvbmUnIH0pO1xuICB9O1xuICB3YWxsKGN4LCB5IC0gMC40LCBjeiwgOCwgMC40LCA2LCAnZmxvb3InKTtcbiAgd2FsbChjeCwgeSwgejAgKyB0IC8gMiwgOCwgaCwgdCk7XG4gIGNvbnN0IGlubmVyWjAgPSB6MCArIHQsIGlubmVyWjEgPSB6MSAtIHQ7XG4gIHdhbGwoeDAgKyB0IC8gMiwgeSwgKGlubmVyWjAgKyBpbm5lcloxKSAvIDIsIHQsIGgsIGlubmVyWjEgLSBpbm5lclowKTtcbiAgY29uc3QgZG9vclogPSAocHJvcG9zYWwuZG9vcj8ueiA/PyByZWN0LnowKSArIDAuNTtcbiAgY29uc3QgZG9vcjAgPSBkb29yWiAtIDAuNiwgZG9vcjEgPSBkb29yWiArIDAuNjtcbiAgY29uc3QgZWFzdFggPSB4MSAtIHQgLyAyO1xuICB3YWxsKGVhc3RYLCB5LCAoaW5uZXJaMCArIGRvb3IwKSAvIDIsIHQsIGgsIGRvb3IwIC0gaW5uZXJaMCk7XG4gIHdhbGwoZWFzdFgsIHksIChkb29yMSArIGlubmVyWjEpIC8gMiwgdCwgaCwgaW5uZXJaMSAtIGRvb3IxKTtcbiAgd2FsbChlYXN0WCwgeSArIDIuMiwgZG9vclosIHQsIDAuNCwgMS4yLCAnbGludGVsJyk7XG4gIHdhbGwoZWFzdFgsIHkgKyAyLjYsIGRvb3JaLCB0LCAwLjYsIDEuMik7XG4gIGNvbnN0IHNvdXRoWiA9IHoxIC0gdCAvIDI7XG4gIGZvciAoY29uc3QgW2EsIGJdIG9mIFtbeDAgKyB0LCBjeCAtIDIuNl0sIFtjeCAtIDEuNCwgY3ggKyAxLjRdLCBbY3ggKyAyLjYsIHgxIC0gdF1dKSB7XG4gICAgd2FsbCgoYSArIGIpIC8gMiwgeSwgc291dGhaLCBiIC0gYSwgaCwgdCk7XG4gIH1cbiAgZm9yIChjb25zdCB3eCBvZiBbY3ggLSAyLCBjeCArIDJdKSB7XG4gICAgd2FsbCh3eCwgeSwgc291dGhaLCAxLjIsIDEsIHQpO1xuICAgIHdhbGwod3gsIHkgKyAyLjQsIHNvdXRoWiwgMS4yLCAwLjgsIHQsICdsaW50ZWwnKTtcbiAgfVxuICB3YWxsKGN4LCB5ICsgaCwgY3osIDgsIDAuNCwgNiwgJ3Jvb2YnKTtcbiAgd2FsbChjeCwgeSArIGggKyAwLjQsIHowICsgMC4xNSwgOCwgMC4zLCAwLjMsICdwYXJhcGV0Jyk7XG4gIHdhbGwoY3gsIHkgKyBoICsgMC40LCB6MSAtIDAuMTUsIDgsIDAuMywgMC4zLCAncGFyYXBldCcpO1xuICB3YWxsKGN4IC0gMy44NSwgeSArIGggKyAwLjQsIGN6LCAwLjMsIDAuMywgNS40LCAncGFyYXBldCcpO1xuICB3YWxsKGN4ICsgMy44NSwgeSArIGggKyAwLjQsIGN6LCAwLjMsIDAuMywgNS40LCAncGFyYXBldCcpO1xuICBwbGFubmVkLnBsYW4ubW9kdWxlcyA9IG1vZHVsZXM7XG4gIHBsYW5uZWQucGxhbi5kZXNpZ25WZXJzaW9uID0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbiAgcGxhbm5lZC5wbGFuLmVudmVsb3BlID0gZm9vdHByaW50RW52ZWxvcGUocmVjdCwgeSAtIDEsIHkgKyA0LCAyKTtcbiAgcGxhbm5lZC5wbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFubmVkLnBsYW4pfWA7XG4gIHJldHVybiBwbGFubmVkO1xufVxuXG5mdW5jdGlvbiBwbGFuRm91bmRlclBhdGgod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5QYXRoKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG4gIGNvbnN0IGhlaWdodHMgPSBwbGFubmVkLnBsYW4ubW9kdWxlcy5maWx0ZXIoKG0pID0+IG0ua2luZCA9PT0gJ3BhdGgnKS5tYXAoKG0pID0+IG0ueSk7XG4gIGNvbnN0IHowID0gcGxhbm5lZC5wbGFuLnJlY3QuejAsIHoxID0gcGxhbm5lZC5wbGFuLnJlY3QuejEgKyAxO1xuICBsZXQgc3RhcnQgPSAwO1xuICBmb3IgKGxldCBlbmQgPSAxOyBlbmQgPD0gaGVpZ2h0cy5sZW5ndGg7IGVuZCsrKSB7XG4gICAgaWYgKGVuZCA8IGhlaWdodHMubGVuZ3RoICYmIGhlaWdodHNbZW5kXSA9PT0gaGVpZ2h0c1tzdGFydF0pIGNvbnRpbnVlO1xuICAgIGNvbnN0IHggPSBwbGFubmVkLnBsYW4ucmVjdC54MCArIHN0YXJ0LCB3aWR0aCA9IGVuZCAtIHN0YXJ0O1xuICAgIGNvbnN0IGN4ID0geCArIHdpZHRoIC8gMiwgeSA9IGhlaWdodHNbc3RhcnRdO1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXRoJywgeDogY3gsIHksIHo6ICh6MCArIHoxKSAvIDIsIHc6IHdpZHRoLCBoOiAwLjEyLCBkOiAzLCB0b25lOiAnZ3JhdmVsJyB9KTtcbiAgICBmb3IgKGNvbnN0IHogb2YgW3owICsgMC4wNzUsIHoxIC0gMC4wNzVdKSB7XG4gICAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IGN4LCB5LCB6LCB3OiB3aWR0aCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lJyB9KTtcbiAgICB9XG4gICAgc3RhcnQgPSBlbmQ7XG4gIH1cbiAgcGxhbm5lZC5wbGFuLm1vZHVsZXMgPSBtb2R1bGVzO1xuICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gIHBsYW5uZWQucGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbm5lZC5wbGFuKX1gO1xuICByZXR1cm4gcGxhbm5lZDtcbn1cblxuXG4vLyAtLS0tLS0tLS0tIGF1dGhvcml6YXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVMaW1pdHMge1xuICBtYXhNb2R1bGVzOiBudW1iZXI7XG4gIG1heENvc3Q6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU1RSVUNUVVJFX0xJTUlUUzogU3RydWN0dXJlTGltaXRzID0ge1xuICBtYXhNb2R1bGVzOiA2NCxcbiAgbWF4Q29zdDogMTI4LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uIHtcbiAgaWQ6IHN0cmluZztcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBiYXNlUmV2aXNpb246IG51bWJlcjtcbiAgbGltaXRzOiBTdHJ1Y3R1cmVMaW1pdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlRGVjaXNpb24ge1xuICBvazogYm9vbGVhbjtcbiAgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbiB8IG51bGw7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyIHtcbiAgcmVhZG9ubHkgYXV0aG9yaXR5ID0gTE9DQUxfQVVUSE9SSVRZO1xuICByZWFkb25seSBlbmZvcmNlbWVudCA9IExPQ0FMX0VORk9SQ0VNRU5UO1xuICByZWFkb25seSBsaW1pdHM6IFN0cnVjdHVyZUxpbWl0cztcblxuICBjb25zdHJ1Y3RvcihyZWFkb25seSBwb2xpY3k6IEF1dGhvcml6YXRpb25Qb2xpY3ksIGxpbWl0czogUGFydGlhbDxTdHJ1Y3R1cmVMaW1pdHM+ID0ge30pIHtcbiAgICB0aGlzLmxpbWl0cyA9IHsgLi4uREVGQVVMVF9TVFJVQ1RVUkVfTElNSVRTLCAuLi5saW1pdHMgfTtcbiAgfVxuXG4gIGF1dGhvcml6ZSh3b3JsZDogV29ybGQsIHBsYW46IFN0cnVjdHVyZVBsYW4pOiBTdHJ1Y3R1cmVEZWNpc2lvbiB7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAocGxhbi5tb2R1bGVzLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyBtb2R1bGVzJyk7XG4gICAgaWYgKHBsYW4ubW9kdWxlcy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhNb2R1bGVzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi5tb2R1bGVzLmxlbmd0aH0gbW9kdWxlcyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhNb2R1bGVzfWApO1xuICAgIH1cbiAgICBpZiAoY29zdFRvdGFsKHBsYW4uY29zdCkgPiB0aGlzLmxpbWl0cy5tYXhDb3N0KSB7XG4gICAgICByZWFzb25zLnB1c2goYGNvc3QgJHtjb3N0VG90YWwocGxhbi5jb3N0KX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heENvc3R9YCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcihhbW91bnQpIHx8IChhbW91bnQgPz8gMCkgPCAwKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgY29zdCAke3Jlc291cmNlfT0ke2Ftb3VudH0gaXMgbm90IGEgbm9uLW5lZ2F0aXZlIGludGVnZXJgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHBsYW4uZW52ZWxvcGUubGVuZ3RoID09PSAwKSByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIHdvcmsgZW52ZWxvcGUnKTtcbiAgICBmb3IgKGNvbnN0IHJlZ2lvbiBvZiBwbGFuLmVudmVsb3BlKSB7XG4gICAgICBpZiAoIXRoaXMucG9saWN5LmVudmVsb3BlLnNvbWUoKHApID0+IHJlZ2lvbi54MCA+PSBwLngwICYmIHJlZ2lvbi54MSA8PSBwLngxXG4gICAgICAgICYmIHJlZ2lvbi56MCA+PSBwLnowICYmIHJlZ2lvbi56MSA8PSBwLnoxXG4gICAgICAgICYmIHJlZ2lvbi55MCA+PSBwLnkwICYmIHJlZ2lvbi55MSA8PSBwLnkxKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYGVudmVsb3BlICR7cmVnaW9uLngwfSwke3JlZ2lvbi56MH0sJHtyZWdpb24ueTB9Li4ke3JlZ2lvbi54MX0sJHtyZWdpb24uejF9LCR7cmVnaW9uLnkxfSBpcyBvdXRzaWRlIHRoZSBsb2NhbCBwb2xpY3lgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgICAgaWYgKCFtb2R1bGVJbnNpZGVFbnZlbG9wZShtLCBwbGFuLmVudmVsb3BlKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYG1vZHVsZSAke20ua2luZH0gYXQgJHttLnh9LCR7bS55fSwke20uen0gaXMgb3V0c2lkZSB0aGUgcGxhbiBlbnZlbG9wZWApO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAocGxhbi5zdXJmYWNlLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyBzdXJmYWNlIHNhbXBsZXMnKTtcbiAgICBmb3IgKGNvbnN0IHMgb2YgcGxhbi5zdXJmYWNlKSB7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgcy54LCBzLnksIHMueikpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBzdXJmYWNlICR7cy54fSwke3Muen0sJHtzLnl9IGlzIG91dHNpZGUgdGhlIHBsYW4gZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBhdXRob3JpemF0aW9uOiBudWxsLCByZWFzb25zIH07XG5cbiAgICBjb25zdCB0b2tlbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbiA9IHtcbiAgICAgIGlkOiBgbG9jYWwtc3R1YjpzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YCxcbiAgICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgICAgcGxhbkRpZ2VzdDogc3RydWN0dXJlRGlnZXN0KHBsYW4pLFxuICAgICAgZW52ZWxvcGU6IHBsYW4uZW52ZWxvcGUubWFwKChlKSA9PiAoeyAuLi5lIH0pKSxcbiAgICAgIGJhc2VSZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgICBsaW1pdHM6IHsgLi4udGhpcy5saW1pdHMgfSxcbiAgICB9O1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBhdXRob3JpemF0aW9uOiB0b2tlbiwgcmVhc29uczogW10gfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIGV4ZWN1dGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZUxlZGdlciB7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgYXV0aG9yaXphdGlvbklkOiBzdHJpbmc7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgc3RydWN0dXJlSWQ6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIG1vZHVsZUNvdW50OiBudW1iZXI7XG4gIGNvc3RQYWlkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICByZXZpc2lvbkJlZm9yZTogbnVtYmVyO1xuICByZXZpc2lvbkFmdGVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBTdHJ1Y3R1cmVQbGFuO1xuICBhdXRob3JpemF0aW9uOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uO1xuICBsZWRnZXI6IFN0cnVjdHVyZUxlZGdlcjtcbn1cblxuZXhwb3J0IHR5cGUgU3RydWN0dXJlT3V0Y29tZSA9IFN0cnVjdHVyZVN1Y2Nlc3MgfCBTdHJ1Y3R1cmVGYWlsdXJlO1xuXG5leHBvcnQgZnVuY3Rpb24gZXhlY3V0ZVN0cnVjdHVyZShcbiAgd29ybGQ6IFdvcmxkLCBwbGFuOiBTdHJ1Y3R1cmVQbGFuLCBhdXRob3JpemF0aW9uOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uLFxuKTogU3RydWN0dXJlT3V0Y29tZSB7XG4gIGlmIChhdXRob3JpemF0aW9uLmF1dGhvcml0eSAhPT0gTE9DQUxfQVVUSE9SSVRZXG4gICAgfHwgYXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudCAhPT0gTE9DQUxfRU5GT1JDRU1FTlQpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bnN1cHBvcnRlZF9hdXRob3JpdHknLCBbXG4gICAgICBgYXV0aG9yaXR5ICR7YXV0aG9yaXphdGlvbi5hdXRob3JpdHl9LyR7YXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudH0gaXMgbm90IHRoZSBsb2NhbCBzdHViYCxcbiAgICBdKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0ICE9PSBzdHJ1Y3R1cmVEaWdlc3QocGxhbikpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdkaWdlc3RfbWlzbWF0Y2gnLCBbJ2F1dGhvcml6YXRpb24gZG9lcyBub3QgbWF0Y2ggdGhpcyBzdHJ1Y3R1cmUgcGxhbiddKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb24gIT09IHdvcmxkLnJldmlzaW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnc3RhbGVfYXV0aG9yaXphdGlvbicsIFtcbiAgICAgIGBhdXRob3JpemF0aW9uIHdhcyBpc3N1ZWQgYXQgcmV2aXNpb24gJHthdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbn0sIHdvcmxkIGlzIGF0ICR7d29ybGQucmV2aXNpb259YCxcbiAgICBdKTtcbiAgfVxuICBpZiAocGxhbi5lbnZlbG9wZS5zb21lKChyKSA9PiAhYXV0aG9yaXphdGlvbi5lbnZlbG9wZS5zb21lKChhKSA9PiByLngwID49IGEueDBcbiAgICAmJiByLngxIDw9IGEueDEgJiYgci56MCA+PSBhLnowICYmIHIuejEgPD0gYS56MSAmJiByLnkwID49IGEueTAgJiYgci55MSA8PSBhLnkxKSkpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdlbnZlbG9wZV9taXNtYXRjaCcsIFsncGxhbiBlbnZlbG9wZSBpcyB3aWRlciB0aGFuIHRoZSBhdXRob3JpemF0aW9uJ10pO1xuICB9XG5cbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgIGlmICghbW9kdWxlSW5zaWRlRW52ZWxvcGUobSwgYXV0aG9yaXphdGlvbi5lbnZlbG9wZSkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgbW9kdWxlICR7bS5raW5kfSBhdCAke20ueH0sJHttLnl9LCR7bS56fSBpcyBvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlYCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgcGxhbi5zdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJlYXNvbnMucHVzaCguLi5taXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCBwbGFuLnJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goYGZvb3RwcmludCBoYXMgJHtvYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnNgKTtcbiAgfVxuICBpZiAod29ybGQuc3RydWN0dXJlcy5oYXMocGxhbi5pZCkpIHtcbiAgICByZWFzb25zLnB1c2goYHN0cnVjdHVyZSAke3BsYW4uaWR9IGFscmVhZHkgZXhpc3RzYCk7XG4gIH1cbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocGxhbi5jb3N0KSkge1xuICAgIGNvbnN0IGhhdmUgPSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDA7XG4gICAgaWYgKGhhdmUgPCAoYW1vdW50ID8/IDApKSB7XG4gICAgICByZWFzb25zLnB1c2goYG5lZWQgJHthbW91bnR9ICR7cmVzb3VyY2V9LCBoYXZlICR7aGF2ZX1gKTtcbiAgICB9XG4gIH1cbiAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5hdXRob3JpemVkX3N0cnVjdHVyZScsIHJlYXNvbnMpO1xuXG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgcmV2aXNpb25CZWZvcmUgPSB3b3JsZC5yZXZpc2lvbjtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocGxhbi5jb3N0KSkge1xuICAgIGNvbnN0IGxlZnQgPSAod29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSAtIChhbW91bnQgPz8gMCk7XG4gICAgaWYgKGxlZnQgPiAwKSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID0gbGVmdDtcbiAgICBlbHNlIGRlbGV0ZSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdO1xuICB9XG5cbiAgd29ybGQucmV2aXNpb24rKztcbiAgY29uc3Qgc3RydWN0dXJlOiBTdHJ1Y3R1cmUgPSB7XG4gICAgaWQ6IHBsYW4uaWQsXG4gICAga2luZDogcGxhbi5raW5kLFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAgeDogcGxhbi5vcmlnaW4ueCxcbiAgICB5OiBwbGFuLm9yaWdpbi55LFxuICAgIHo6IHBsYW4ub3JpZ2luLnosXG4gICAgcm90OiBwbGFuLnJvdCxcbiAgICBtb2R1bGVzOiBwbGFuLm1vZHVsZXMubWFwKChtKSA9PiAoeyAuLi5tIH0pKSxcbiAgICBjb3N0OiB7IC4uLnBsYW4uY29zdCB9LFxuICAgIGJ1aWx0UmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgIC4uLihwbGFuLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gPyB7IGRlc2lnblZlcnNpb246IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSA6IHt9KSxcbiAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgfTtcbiAgd29ybGQuc3RydWN0dXJlcy5zZXQoc3RydWN0dXJlLmlkLCBzdHJ1Y3R1cmUpO1xuXG4gIGNvbnN0IGxlZGdlcjogU3RydWN0dXJlTGVkZ2VyID0ge1xuICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICBhdXRob3JpemF0aW9uSWQ6IGF1dGhvcml6YXRpb24uaWQsXG4gICAgcGxhbkRpZ2VzdDogYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0LFxuICAgIHN0cnVjdHVyZUlkOiBzdHJ1Y3R1cmUuaWQsXG4gICAgc2l0ZUlkOiBwbGFuLnNpdGVJZCxcbiAgICBraW5kOiBwbGFuLmtpbmQsXG4gICAgbW9kdWxlQ291bnQ6IHN0cnVjdHVyZS5tb2R1bGVzLmxlbmd0aCxcbiAgICBjb3N0UGFpZDogeyAuLi5wbGFuLmNvc3QgfSxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICByZXZpc2lvbkJlZm9yZSxcbiAgICByZXZpc2lvbkFmdGVyOiB3b3JsZC5yZXZpc2lvbixcbiAgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIGF1dGhvcml6YXRpb24sIGxlZGdlciB9O1xufVxuXG4vKipcbiAqIFRoZSBzaGFyZWQgcGxheWVyL0FJIHN0cnVjdHVyZSBlbnRyeSBwb2ludC4gVGVycmFpbiBtdXN0IGFscmVhZHkgYmUgcHJlcGFyZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFN0cnVjdHVyZShcbiAgd29ybGQ6IFdvcmxkLFxuICBhdXRob3JpemVyOiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsXG4gIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCxcbik6IFN0cnVjdHVyZU91dGNvbWUge1xuICBjb25zdCBwbGFubmVkID0gcGxhblN0cnVjdHVyZSh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBkZWNpc2lvbiA9IGF1dGhvcml6ZXIuYXV0aG9yaXplKHdvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2F1dGhvcml6ZScsICdub3RfYXV0aG9yaXplZCcsIGRlY2lzaW9uLnJlYXNvbnMpO1xuICB9XG4gIHJldHVybiBleGVjdXRlU3RydWN0dXJlKHdvcmxkLCBwbGFubmVkLnBsYW4sIGRlY2lzaW9uLmF1dGhvcml6YXRpb24pO1xufVxuIiwgIi8vIFNjaGVtYS0zIGxpZmUgbG9vcC4gQWxsIHF1YW50aXRpZXMgYXJlIGludGVnZXJzIGFuZCBhbGwgbXV0YXRpb25zIGFyZSBkcml2ZW5cbi8vIGJ5IGFjY2VwdGVkIGNvbW1hbmRzOyB3YWxsLWNsb2NrIHRpbWUgYW5kIHJlbmRlcmluZyBuZXZlciBhZHZhbmNlIHRoaXMgc3RhdGUuXG5pbXBvcnQgdHlwZSB7IFdvcmxkIH0gZnJvbSAnLi93b3JsZCc7XG5cbmV4cG9ydCBjb25zdCBMSUZFX1JFU09VUkNFUyA9IFsnZmliZXInLCAnZm9vZCcsICdvcmUnLCAncmF0aW9ucycsICdzZWVkJywgJ3N0b25lJywgJ3dvb2QnXSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIExpZmVSZXNvdXJjZSA9ICh0eXBlb2YgTElGRV9SRVNPVVJDRVMpW251bWJlcl07XG5leHBvcnQgY29uc3QgQ0FSUklFRF9DQVBBQ0lUWSA9IDEyMDtcbmV4cG9ydCBjb25zdCBTVE9DS1BJTEVfQ0FQQUNJVFkgPSAyMDA7XG5leHBvcnQgY29uc3QgTUFYX1BST0RVQ1RJT05fSk9CUyA9IDE2O1xuZXhwb3J0IGNvbnN0IE1BWF9USUNLU19QRVJfQ09NTUFORCA9IDY0O1xuZXhwb3J0IGNvbnN0IENST1BfR1JPV1RIX1RJQ0tTID0gNDtcbi8qKiBGaXhlZCBoYXJ2ZXN0IGZyb20gb25lIHJlYWR5IGNyb3AgcGxvdC4gSm91cm5hbCBvdXRjb21lcyBtdXN0IG1hdGNoIGl0IGV4YWN0bHkuICovXG5leHBvcnQgY29uc3QgQ1JPUF9ZSUVMRCA9IHsgZm9vZDogNiwgZmliZXI6IDEgfSBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBDUk9QX1lJRUxEX0xBQkVMID0gYCR7Q1JPUF9ZSUVMRC5mb29kfSBmb29kICsgJHtDUk9QX1lJRUxELmZpYmVyfSBmaWJlcmA7XG5leHBvcnQgY29uc3QgRk9VTkRFUl9TVE9DS1BJTEVfSUQgPSAnc3RvY2twaWxlOmZvdW5kZXInO1xuZXhwb3J0IGNvbnN0IEZPVU5ERVJfU1RPQ0tQSUxFID0geyBpZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHg6IC01MCwgejogLTMyLCBjYXBhY2l0eTogU1RPQ0tQSUxFX0NBUEFDSVRZIH0gYXMgY29uc3Q7XG5cbmV4cG9ydCB0eXBlIExpZmVSZXNvdXJjZUJhZyA9IFBhcnRpYWw8UmVjb3JkPExpZmVSZXNvdXJjZSwgbnVtYmVyPj47XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvY2twaWxlIHtcbiAgaWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGNhcGFjaXR5OiB0eXBlb2YgU1RPQ0tQSUxFX0NBUEFDSVRZO1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG59XG5cbmV4cG9ydCB0eXBlIFJlY2lwZUlkID0gJ3NlZWQnIHwgJ3JhdGlvbnMnO1xuZXhwb3J0IGNvbnN0IFJFQ0lQRVM6IFJlY29yZDxSZWNpcGVJZCwgeyBpbnB1dDogTGlmZVJlc291cmNlQmFnOyBvdXRwdXQ6IExpZmVSZXNvdXJjZUJhZzsgdGlja3M6IG51bWJlciB9PiA9IHtcbiAgc2VlZDogeyBpbnB1dDogeyBmaWJlcjogMiB9LCBvdXRwdXQ6IHsgc2VlZDogMyB9LCB0aWNrczogMSB9LFxuICByYXRpb25zOiB7IGlucHV0OiB7IGZvb2Q6IDIgfSwgb3V0cHV0OiB7IHJhdGlvbnM6IDMgfSwgdGlja3M6IDIgfSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZHVjdGlvbkpvYiB7XG4gIGlkOiBzdHJpbmc7XG4gIHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gIHJlY2lwZTogUmVjaXBlSWQ7XG4gIHJlbWFpbmluZ1RpY2tzOiBudW1iZXI7XG59XG5cbi8qKiBGaXhlZCBwbG90cyBjb3JyZXNwb25kIHRvIHRoZSBuaW5lIGF1dGhvcml0YXRpdmUgdGVycmFjZSBjcm9wLXJvdyB2b2x1bWVzLiAqL1xuZXhwb3J0IGNvbnN0IENST1BfUExPVF9JRFMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA5IH0sIChfLCBpKSA9PiBgY3JvcDoke2l9YCk7XG5leHBvcnQgaW50ZXJmYWNlIENyb3BQbG90IHtcbiAgaWQ6IHN0cmluZztcbiAgcGxhbnRlZFRpY2s6IG51bWJlcjtcbiAgZ3Jvd3RoVGlja3M6IHR5cGVvZiBDUk9QX0dST1dUSF9USUNLUztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBMaWZlU3RhdGUge1xuICBzdG9ja3BpbGVzOiBNYXA8c3RyaW5nLCBTdG9ja3BpbGU+O1xuICBqb2JzOiBNYXA8c3RyaW5nLCBQcm9kdWN0aW9uSm9iPjtcbiAgY3JvcHM6IE1hcDxzdHJpbmcsIENyb3BQbG90PjtcbiAgdGljazogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTGlmZVN0YXRlKCk6IExpZmVTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgc3RvY2twaWxlczogbmV3IE1hcChbW0ZPVU5ERVJfU1RPQ0tQSUxFX0lELCB7XG4gICAgICBpZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHg6IEZPVU5ERVJfU1RPQ0tQSUxFLngsIHo6IEZPVU5ERVJfU1RPQ0tQSUxFLnosXG4gICAgICBjYXBhY2l0eTogU1RPQ0tQSUxFX0NBUEFDSVRZLCBpbnZlbnRvcnk6IHt9LFxuICAgIH1dXSksIGpvYnM6IG5ldyBNYXAoKSwgY3JvcHM6IG5ldyBNYXAoKSwgdGljazogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvdGFsKGJhZzogUmVjb3JkPHN0cmluZywgbnVtYmVyPik6IG51bWJlciB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKGJhZykucmVkdWNlKChzdW0sIGFtb3VudCkgPT4gc3VtICsgYW1vdW50LCAwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lQmFnKGJhZzogUmVjb3JkPHN0cmluZywgbnVtYmVyPik6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICByZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKGJhZykuZmlsdGVyKChbLCBhbW91bnRdKSA9PiBhbW91bnQgPiAwKVxuICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsaWZlU3RhdGUod29ybGQ6IFdvcmxkKTogTGlmZVN0YXRlIHtcbiAgaWYgKCF3b3JsZC5saWZlKSB0aHJvdyBuZXcgRXJyb3IoJ2xpZmUtbG9vcCBjb21tYW5kcyByZXF1aXJlIGEgc2NoZW1hLTMgd29ybGQnKTtcbiAgcmV0dXJuIHdvcmxkLmxpZmU7XG59XG5cbmV4cG9ydCB0eXBlIExpZmVGYWlsdXJlID0geyBvazogZmFsc2U7IGNvZGU6IHN0cmluZzsgcmVhc29uczogc3RyaW5nW10gfTtcbmV4cG9ydCB0eXBlIExpZmVTdWNjZXNzPFQ+ID0geyBvazogdHJ1ZTsgdmFsdWU6IFQgfTtcbmV4cG9ydCB0eXBlIExpZmVSZXN1bHQ8VD4gPSBMaWZlU3VjY2VzczxUPiB8IExpZmVGYWlsdXJlO1xuZnVuY3Rpb24gcmVqZWN0TGlmZShjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogTGlmZUZhaWx1cmUge1xuICByZXR1cm4geyBvazogZmFsc2UsIGNvZGUsIHJlYXNvbnMgfTtcbn1cbnR5cGUgUGFyc2VkQW1vdW50ID0geyBvazogdHJ1ZTsgcmVzb3VyY2U6IExpZmVSZXNvdXJjZTsgYW1vdW50OiBudW1iZXIgfSB8IHsgb2s6IGZhbHNlOyByZWFzb25zOiBzdHJpbmdbXSB9O1xuZnVuY3Rpb24gcmVxdWlyZUFtb3VudChiYWc6IExpZmVSZXNvdXJjZUJhZyk6IFBhcnNlZEFtb3VudCB7XG4gIGNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyhiYWcpO1xuICBpZiAoZW50cmllcy5sZW5ndGggIT09IDEpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uczogWyd0cmFuc2ZlciBleGFjdGx5IG9uZSByZXNvdXJjZSBhdCBhIHRpbWUnXSB9O1xuICBjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gPSBlbnRyaWVzWzBdO1xuICBpZiAoIUxJRkVfUkVTT1VSQ0VTLmluY2x1ZGVzKHJlc291cmNlIGFzIExpZmVSZXNvdXJjZSkgfHwgIU51bWJlci5pc1NhZmVJbnRlZ2VyKGFtb3VudCkgfHwgKGFtb3VudCA/PyAwKSA8PSAwKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb25zOiBbJ3Jlc291cmNlIGFtb3VudCBtdXN0IGJlIGEgcG9zaXRpdmUgaW50ZWdlciddIH07XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIHJlc291cmNlOiByZXNvdXJjZSBhcyBMaWZlUmVzb3VyY2UsIGFtb3VudCB9O1xufVxuXG5mdW5jdGlvbiBtb3ZlKHdvcmxkOiBXb3JsZCwgZnJvbTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiwgdG86IFJlY29yZDxzdHJpbmcsIG51bWJlcj4sXG4gIHJlcXVlc3RlZDogTGlmZVJlc291cmNlQmFnLCB0b0NhcGFjaXR5OiBudW1iZXIpOiBMaWZlUmVzdWx0PExpZmVSZXNvdXJjZUJhZz4ge1xuICBjb25zdCBjaGVja2VkID0gcmVxdWlyZUFtb3VudChyZXF1ZXN0ZWQpO1xuICBpZiAoIWNoZWNrZWQub2spIHJldHVybiByZWplY3RMaWZlKCdpbnZhbGlkX3RyYW5zZmVyJywgW2NoZWNrZWQucmVhc29uc1swXV0pO1xuICBjb25zdCB7IHJlc291cmNlLCBhbW91bnQgfSA9IGNoZWNrZWQ7XG4gIGlmICgoZnJvbVtyZXNvdXJjZV0gPz8gMCkgPCBhbW91bnQpIHJldHVybiByZWplY3RMaWZlKCdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJywgW2BuZWVkICR7YW1vdW50fSAke1N0cmluZyhyZXNvdXJjZSl9LCBoYXZlICR7ZnJvbVtyZXNvdXJjZV0gPz8gMH1gXSk7XG4gIGlmICh0b3RhbCh0bykgKyBhbW91bnQgPiB0b0NhcGFjaXR5KSByZXR1cm4gcmVqZWN0TGlmZSgnY2FwYWNpdHlfZXhjZWVkZWQnLCBbYGRlc3RpbmF0aW9uIGNhcGFjaXR5ICR7dG9DYXBhY2l0eX0gd291bGQgYmUgZXhjZWVkZWRgXSk7XG4gIGZyb21bcmVzb3VyY2VdID0gKGZyb21bcmVzb3VyY2VdID8/IDApIC0gYW1vdW50O1xuICBpZiAoZnJvbVtyZXNvdXJjZV0gPT09IDApIGRlbGV0ZSBmcm9tW3Jlc291cmNlXTtcbiAgdG9bcmVzb3VyY2VdID0gKHRvW3Jlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IFtyZXNvdXJjZV06IGFtb3VudCB9IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmFuc2Zlcih3b3JsZDogV29ybGQsIGtpbmQ6ICdkZXBvc2l0JyB8ICd3aXRoZHJhdycsIGJhZzogTGlmZVJlc291cmNlQmFnKTogTGlmZVJlc3VsdDxMaWZlUmVzb3VyY2VCYWc+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChGT1VOREVSX1NUT0NLUElMRV9JRCk7XG4gIGlmICghc3RvY2spIHJldHVybiByZWplY3RMaWZlKCdtaXNzaW5nX3N0b2NrcGlsZScsIFsnZm91bmRlciBzdG9ja3BpbGUgaXMgYWJzZW50J10pO1xuICByZXR1cm4ga2luZCA9PT0gJ2RlcG9zaXQnXG4gICAgPyBtb3ZlKHdvcmxkLCB3b3JsZC5pbnZlbnRvcnksIHN0b2NrLmludmVudG9yeSwgYmFnLCBzdG9jay5jYXBhY2l0eSlcbiAgICA6IG1vdmUod29ybGQsIHN0b2NrLmludmVudG9yeSwgd29ybGQuaW52ZW50b3J5LCBiYWcsIENBUlJJRURfQ0FQQUNJVFkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RhcnRQcm9kdWN0aW9uKHdvcmxkOiBXb3JsZCwgcmVjaXBlSWQ6IFJlY2lwZUlkLCBqb2JJZDogc3RyaW5nKTogTGlmZVJlc3VsdDxQcm9kdWN0aW9uSm9iPiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBjb25zdCBzdG9jayA9IGxpZmUuc3RvY2twaWxlcy5nZXQoRk9VTkRFUl9TVE9DS1BJTEVfSUQpO1xuICBpZiAoIXN0b2NrKSByZXR1cm4gcmVqZWN0TGlmZSgnbWlzc2luZ19zdG9ja3BpbGUnLCBbJ2ZvdW5kZXIgc3RvY2twaWxlIGlzIGFic2VudCddKTtcbiAgaWYgKGxpZmUuam9icy5oYXMoam9iSWQpKSByZXR1cm4gcmVqZWN0TGlmZSgnZHVwbGljYXRlX2pvYicsIFsncHJvZHVjdGlvbiBqb2IgYWxyZWFkeSBleGlzdHMnXSk7XG4gIGlmIChsaWZlLmpvYnMuc2l6ZSA+PSBNQVhfUFJPRFVDVElPTl9KT0JTKSByZXR1cm4gcmVqZWN0TGlmZSgnam9iX2xpbWl0JywgW2BhdCBtb3N0ICR7TUFYX1BST0RVQ1RJT05fSk9CU30gam9icyBtYXkgYmUgYWN0aXZlYF0pO1xuICBjb25zdCByZWNpcGUgPSBSRUNJUEVTW3JlY2lwZUlkXTtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocmVjaXBlLmlucHV0KSkge1xuICAgIGlmICgoc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSA8IChhbW91bnQgPz8gMCkpIHtcbiAgICAgIHJldHVybiByZWplY3RMaWZlKCdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJywgW2BuZWVkICR7YW1vdW50fSAke1N0cmluZyhyZXNvdXJjZSl9LCBoYXZlICR7c3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwfWBdKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgcmVzZXJ2ZWRPdXRwdXQgPSBbLi4ubGlmZS5qb2JzLnZhbHVlcygpXS5maWx0ZXIoKGopID0+IGouc3RvY2twaWxlSWQgPT09IHN0b2NrLmlkKVxuICAgIC5yZWR1Y2UoKHN1bSwgam9iKSA9PiBzdW0gKyB0b3RhbChjbG9uZUJhZyhSRUNJUEVTW2pvYi5yZWNpcGVdLm91dHB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSksIDApO1xuICBpZiAodG90YWwoc3RvY2suaW52ZW50b3J5KSAtIHRvdGFsKGNsb25lQmFnKHJlY2lwZS5pbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSlcbiAgICArIHJlc2VydmVkT3V0cHV0ICsgdG90YWwoY2xvbmVCYWcocmVjaXBlLm91dHB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSkgPiBzdG9jay5jYXBhY2l0eSkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdjYXBhY2l0eV9leGNlZWRlZCcsIFsncmVzZXJ2ZWQgcHJvZHVjdGlvbiBvdXRwdXQgd291bGQgZXhjZWVkIHN0b2NrcGlsZSBjYXBhY2l0eSddKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhyZWNpcGUuaW5wdXQpKSB7XG4gICAgc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA9IChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApIC0gKGFtb3VudCA/PyAwKTtcbiAgICBpZiAoc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA9PT0gMCkgZGVsZXRlIHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV07XG4gIH1cbiAgY29uc3Qgam9iOiBQcm9kdWN0aW9uSm9iID0geyBpZDogam9iSWQsIHN0b2NrcGlsZUlkOiBzdG9jay5pZCwgcmVjaXBlOiByZWNpcGVJZCwgcmVtYWluaW5nVGlja3M6IHJlY2lwZS50aWNrcyB9O1xuICBsaWZlLmpvYnMuc2V0KGpvYi5pZCwgam9iKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IC4uLmpvYiB9IH07XG59XG5cbi8qKiBQbGFudCBpbnRvIGFuIGVtcHR5IGZpeGVkIHRlcnJhY2UgcGxvdC4gVGhlIGZvdW5kZXIgZmFybSBtdXN0IGFscmVhZHkgZXhpc3QuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhbnRDcm9wKHdvcmxkOiBXb3JsZCwgcGxvdElkOiBzdHJpbmcpOiBMaWZlUmVzdWx0PENyb3BQbG90PiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBpZiAoIUNST1BfUExPVF9JRFMuaW5jbHVkZXMocGxvdElkKSkgcmV0dXJuIHJlamVjdExpZmUoJ2ludmFsaWRfcGxvdCcsIFsndW5rbm93biBjcm9wIHBsb3QnXSk7XG4gIGlmICghWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvbWUoKHMpID0+IHMua2luZCA9PT0gJ3RlcnJhY2UnKSkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdmYXJtX3JlcXVpcmVkJywgWydidWlsZCB0aGUgZm91bmRlciB0ZXJyYWNlZCBmYXJtIGJlZm9yZSBwbGFudGluZyddKTtcbiAgfVxuICBpZiAobGlmZS5jcm9wcy5oYXMocGxvdElkKSkgcmV0dXJuIHJlamVjdExpZmUoJ3Bsb3Rfb2NjdXBpZWQnLCBbJ2Nyb3AgcGxvdCBpcyBhbHJlYWR5IHBsYW50ZWQnXSk7XG4gIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChGT1VOREVSX1NUT0NLUElMRV9JRCk7XG4gIGlmICghc3RvY2sgfHwgKHN0b2NrLmludmVudG9yeS5zZWVkID8/IDApIDwgMSkgcmV0dXJuIHJlamVjdExpZmUoJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnLCBbJ25lZWQgMSBzZWVkIGluIHRoZSBmb3VuZGVyIHN0b2NrcGlsZSddKTtcbiAgc3RvY2suaW52ZW50b3J5LnNlZWQhLS07XG4gIGlmIChzdG9jay5pbnZlbnRvcnkuc2VlZCA9PT0gMCkgZGVsZXRlIHN0b2NrLmludmVudG9yeS5zZWVkO1xuICBjb25zdCBjcm9wOiBDcm9wUGxvdCA9IHsgaWQ6IHBsb3RJZCwgcGxhbnRlZFRpY2s6IGxpZmUudGljaywgZ3Jvd3RoVGlja3M6IENST1BfR1JPV1RIX1RJQ0tTIH07XG4gIGxpZmUuY3JvcHMuc2V0KHBsb3RJZCwgY3JvcCk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyAuLi5jcm9wIH0gfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyb3BSZWFkeShjcm9wOiBDcm9wUGxvdCwgdGljazogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB0aWNrIC0gY3JvcC5wbGFudGVkVGljayA+PSBjcm9wLmdyb3d0aFRpY2tzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdENyb3Aod29ybGQ6IFdvcmxkLCBwbG90SWQ6IHN0cmluZyk6IExpZmVSZXN1bHQ8eyBmb29kOiBudW1iZXI7IGZpYmVyOiBudW1iZXIgfT4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgY29uc3QgY3JvcCA9IGxpZmUuY3JvcHMuZ2V0KHBsb3RJZCk7XG4gIGlmICghY3JvcCkgcmV0dXJuIHJlamVjdExpZmUoJ25vdF9wbGFudGVkJywgWydjcm9wIHBsb3QgaXMgZW1wdHknXSk7XG4gIGlmICghY3JvcFJlYWR5KGNyb3AsIGxpZmUudGljaykpIHJldHVybiByZWplY3RMaWZlKCdjcm9wX25vdF9yZWFkeScsIFtgY3JvcCBuZWVkcyAke2Nyb3AuZ3Jvd3RoVGlja3MgLSAobGlmZS50aWNrIC0gY3JvcC5wbGFudGVkVGljayl9IG1vcmUgdGlja3NgXSk7XG4gIC8vIFBsYW50IGdyb3d0aCBpcyB0aGUgZXhwbGljaXQgYmlvbG9naWNhbCBzb3VyY2U7IGV2ZXJ5IG90aGVyIGxpZmUtbG9vcFxuICAvLyB0cmFuc2Zvcm1hdGlvbiBjb25zZXJ2ZXMgaXRzIGRlY2xhcmVkIGlucHV0cyBhbmQgb3V0cHV0cy5cbiAgY29uc3QgeWllbGRCYWcgPSB7IGZvb2Q6IENST1BfWUlFTEQuZm9vZCwgZmliZXI6IENST1BfWUlFTEQuZmliZXIgfTtcbiAgaWYgKHRvdGFsKHdvcmxkLmludmVudG9yeSkgKyB5aWVsZEJhZy5mb29kICsgeWllbGRCYWcuZmliZXIgPiBDQVJSSUVEX0NBUEFDSVRZKSB7XG4gICAgcmV0dXJuIHJlamVjdExpZmUoJ2NhcGFjaXR5X2V4Y2VlZGVkJywgW2BjYXJyaWVkIGNhcGFjaXR5ICR7Q0FSUklFRF9DQVBBQ0lUWX0gd291bGQgYmUgZXhjZWVkZWRgXSk7XG4gIH1cbiAgd29ybGQuaW52ZW50b3J5LmZvb2QgPSAod29ybGQuaW52ZW50b3J5LmZvb2QgPz8gMCkgKyB5aWVsZEJhZy5mb29kO1xuICB3b3JsZC5pbnZlbnRvcnkuZmliZXIgPSAod29ybGQuaW52ZW50b3J5LmZpYmVyID8/IDApICsgeWllbGRCYWcuZmliZXI7XG4gIGxpZmUuY3JvcHMuZGVsZXRlKHBsb3RJZCk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeWllbGRCYWcgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUaWNrT3V0Y29tZSB7XG4gIGZyb21UaWNrOiBudW1iZXI7XG4gIHRvVGljazogbnVtYmVyO1xuICBjb21wbGV0ZWRKb2JzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHJlY2lwZTogUmVjaXBlSWQ7IG91dHB1dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB9PjtcbiAgcmVhZHlDcm9wczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZHZhbmNlVGlja3Mod29ybGQ6IFdvcmxkLCBjb3VudDogbnVtYmVyKTogTGlmZVJlc3VsdDxUaWNrT3V0Y29tZT4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgaWYgKCFOdW1iZXIuaXNTYWZlSW50ZWdlcihjb3VudCkgfHwgY291bnQgPCAxIHx8IGNvdW50ID4gTUFYX1RJQ0tTX1BFUl9DT01NQU5EKSB7XG4gICAgcmV0dXJuIHJlamVjdExpZmUoJ2ludmFsaWRfdGlja19jb3VudCcsIFtgdGlja3MgbXVzdCBiZSBhbiBpbnRlZ2VyIGZyb20gMSB0byAke01BWF9USUNLU19QRVJfQ09NTUFORH1gXSk7XG4gIH1cbiAgY29uc3QgY29tcGxldGVkOiBUaWNrT3V0Y29tZVsnY29tcGxldGVkSm9icyddID0gW107XG4gIGNvbnN0IGZyb21UaWNrID0gbGlmZS50aWNrO1xuICAvLyBKb2JzIGFyZSBwcm9jZXNzZWQgaW4gc3RhYmxlIGlkIG9yZGVyIGF0IGVhY2ggdGljaywgbmV2ZXIgbWFwIGluc2VydGlvbixcbiAgLy8gd2FsbCB0aW1lLCBmcmFtZSBkZWx0YSwgb3IgYXN5bmNocm9ub3VzIGNvbXBsZXRpb24gb3JkZXIuXG4gIGZvciAobGV0IHN0ZXAgPSAwOyBzdGVwIDwgY291bnQ7IHN0ZXArKykge1xuICAgIGxpZmUudGljaysrO1xuICAgIGZvciAoY29uc3Qgam9iIG9mIFsuLi5saWZlLmpvYnMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkpIHtcbiAgICAgIGpvYi5yZW1haW5pbmdUaWNrcy0tO1xuICAgICAgaWYgKGpvYi5yZW1haW5pbmdUaWNrcyA+IDApIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgc3RvY2sgPSBsaWZlLnN0b2NrcGlsZXMuZ2V0KGpvYi5zdG9ja3BpbGVJZCk7XG4gICAgICBpZiAoIXN0b2NrKSB0aHJvdyBuZXcgRXJyb3IoJ2FjdGl2ZSBwcm9kdWN0aW9uIHJlZmVyZW5jZXMgYSBtaXNzaW5nIHN0b2NrcGlsZScpO1xuICAgICAgY29uc3Qgb3V0cHV0ID0gY2xvbmVCYWcoUkVDSVBFU1tqb2IucmVjaXBlXS5vdXRwdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPik7XG4gICAgICBpZiAodG90YWwoc3RvY2suaW52ZW50b3J5KSArIHRvdGFsKG91dHB1dCkgPiBzdG9jay5jYXBhY2l0eSkgdGhyb3cgbmV3IEVycm9yKCdyZXNlcnZlZCBwcm9kdWN0aW9uIG91dHB1dCBleGNlZWRzIGNhcGFjaXR5Jyk7XG4gICAgICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhvdXRwdXQpKSBzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID0gKHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gICAgICBsaWZlLmpvYnMuZGVsZXRlKGpvYi5pZCk7XG4gICAgICBjb21wbGV0ZWQucHVzaCh7IGlkOiBqb2IuaWQsIHJlY2lwZTogam9iLnJlY2lwZSwgb3V0cHV0IH0pO1xuICAgIH1cbiAgfVxuICBjb25zdCByZWFkeUNyb3BzID0gWy4uLmxpZmUuY3JvcHMudmFsdWVzKCldLmZpbHRlcigoY3JvcCkgPT4gY3JvcFJlYWR5KGNyb3AsIGxpZmUudGljaylcbiAgICAmJiBjcm9wLnBsYW50ZWRUaWNrICsgY3JvcC5ncm93dGhUaWNrcyA+IGZyb21UaWNrKS5tYXAoKGNyb3ApID0+IGNyb3AuaWQpLnNvcnQoKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IGZyb21UaWNrLCB0b1RpY2s6IGxpZmUudGljaywgY29tcGxldGVkSm9iczogY29tcGxldGVkLCByZWFkeUNyb3BzIH0gfTtcbn1cbiIsICIvLyBWZXJzaW9uZWQsIEpTT04tc2FmZSBzbmFwc2hvdHMgb2YgY29tcGxldGUgYXV0aG9yaXRhdGl2ZSBNMDAyIHN0YXRlLlxuLy8gQ2h1bmsgYnl0ZXMsIGhlaWdodC9tYXRlcmlhbCBjYWNoZXMsIHJlbmRlcmVyIGRhdGEgYW5kIHRpbWluZyBjb3VudGVycyBhcmVcbi8vIHJlZ2VuZXJhdGVkIGZyb20gdGhlIG1hbmlmZXN0IGFuZCBkdXJhYmxlIGVkaXRzOyB0aGV5IGFyZSBub3QgYSBzZWNvbmQgc2F2ZS5cbmltcG9ydCB7XG4gIENIVU5LX1NJWkUsIENIVU5LX1ZPTFVNRSwgQ0hVTktTX1BFUl9TSURFLCBFbnRpdHksIEVudGl0eUtpbmQsXG4gIEdFTkVSQVRPUl9WRVJTSU9OLCBIQUxGLCBNYXRJZCwgUmVzb3VyY2VUeXBlLCBXb3JsZCwgV29ybGRNYW5pZmVzdCxcbiAgY3JlYXRlV29ybGQsIHBsYWNlQXV0aG9yZWRTaXRlcywgd29ybGRNYW5pZmVzdCwgZW5zdXJlQ2h1bmssIGlzUmV0aXJlZFN0b25lS2luZCxcbiAgbWFya0VkaXRzQ2hhbmdlZCwgaXNTdXBwb3J0ZWRHZW5lcmF0b3IsIE1BWF9NQVRfSUQsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiwgU3RydWN0dXJlIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7XG4gIGVuYWJsZVN0b25lUmVwbGF5LCBmaW5pc2hTdG9uZVJlcGxheSwgaXNIaXN0b3JpY2FsU3RvbmVIYXNoLCBpc1N0b25lUmVwbGF5LFxufSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQge1xuICBDQVJSSUVEX0NBUEFDSVRZLCBDUk9QX0dST1dUSF9USUNLUywgQ1JPUF9QTE9UX0lEUywgRk9VTkRFUl9TVE9DS1BJTEUsXG4gIEZPVU5ERVJfU1RPQ0tQSUxFX0lELCBMSUZFX1JFU09VUkNFUywgTUFYX1BST0RVQ1RJT05fSk9CUywgTUFYX1RJQ0tTX1BFUl9DT01NQU5ELFxuICBSRUNJUEVTLCBTVE9DS1BJTEVfQ0FQQUNJVFksIGNyZWF0ZUxpZmVTdGF0ZSxcbn0gZnJvbSAnLi9lY29ub215JztcblxuZXhwb3J0IGNvbnN0IFNOQVBTSE9UX1NDSEVNQSA9IDEgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgREVTSUdOX1NOQVBTSE9UX1NDSEVNQSA9IDIgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgPSAzIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IE1BWF9TTkFQU0hPVF9KU09OX0JZVEVTID0gMjVfMDAwXzAwMDtcbmV4cG9ydCBjb25zdCBNQVhfU05BUFNIT1RfRURJVFMgPSAxXzAwMF8wMDA7XG5leHBvcnQgY29uc3QgTUFYX1NOQVBTSE9UX0VOVElUSUVTID0gNTAwXzAwMDtcblxuaW50ZXJmYWNlIEJhc2VXb3JsZFNuYXBzaG90IHtcbiAgc2NoZW1hOiB0eXBlb2YgU05BUFNIT1RfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUE7XG4gIG1hbmlmZXN0OiBXb3JsZE1hbmlmZXN0O1xuICByZXZpc2lvbjogbnVtYmVyO1xuICBlZGl0czogQXJyYXk8eyBjaHVuazogc3RyaW5nOyBjZWxsczogQXJyYXk8eyBpOiBudW1iZXI7IG06IG51bWJlciB9PiB9PjtcbiAgZW50aXRpZXM6IEVudGl0eVtdO1xuICAvKiogQ2h1bmtzIHdpdGggZHVyYWJsZSBnZW5lcmF0ZWQtZW50aXR5IGNoYW5nZXM7IHB1cmUgcXVlcmllcyBhcmUgZXhjbHVkZWQuICovXG4gIGVudGl0eUNodW5rczogc3RyaW5nW107XG4gIGVudGl0eVJlbW92YWxzOiBzdHJpbmdbXTtcbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBzdHJ1Y3R1cmVzOiBTdHJ1Y3R1cmVbXTtcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKiBOZXh0IGFjY2VwdGVkIGpvdXJuYWwgc2VxdWVuY2UgYXQgdGhpcyBzbmFwc2hvdCBib3VuZGFyeS4gKi9cbiAgbmV4dFNlcXVlbmNlOiBudW1iZXI7XG59XG5leHBvcnQgdHlwZSBXb3JsZFNuYXBzaG90ID0gQmFzZVdvcmxkU25hcHNob3QgJiAoe1xuICBzY2hlbWE6IHR5cGVvZiBTTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX1NOQVBTSE9UX1NDSEVNQTtcbn0gfCB7XG4gIHNjaGVtYTogdHlwZW9mIENVUlJFTlRfU05BUFNIT1RfU0NIRU1BO1xuICB0aWNrOiBudW1iZXI7XG4gIHN0b2NrcGlsZXM6IEFycmF5PHtcbiAgICBpZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEOyB4OiBudW1iZXI7IHo6IG51bWJlcjtcbiAgICBjYXBhY2l0eTogdHlwZW9mIFNUT0NLUElMRV9DQVBBQ0lUWTsgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICB9PjtcbiAgam9iczogQXJyYXk8e1xuICAgIGlkOiBzdHJpbmc7IHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gICAgcmVjaXBlOiAnc2VlZCcgfCAncmF0aW9ucyc7IHJlbWFpbmluZ1RpY2tzOiBudW1iZXI7XG4gIH0+O1xuICBjcm9wczogQXJyYXk8eyBpZDogc3RyaW5nOyBwbGFudGVkVGljazogbnVtYmVyOyBncm93dGhUaWNrczogdHlwZW9mIENST1BfR1JPV1RIX1RJQ0tTIH0+O1xufSk7XG50eXBlIExpZmVTbmFwc2hvdCA9IEV4dHJhY3Q8V29ybGRTbmFwc2hvdCwgeyBzY2hlbWE6IHR5cGVvZiBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSB9PjtcblxuZnVuY3Rpb24gY2xvbmVFbnRpdHkoZTogRW50aXR5KTogRW50aXR5IHtcbiAgcmV0dXJuIHtcbiAgICBpZDogZS5pZCwga2luZDogZS5raW5kLCBjaHVuazogZS5jaHVuaywgeDogZS54LCB5OiBlLnksIHo6IGUueixcbiAgICByb3Q6IGUucm90LCBzY2FsZTogZS5zY2FsZSwgdmFyaWFudDogZS52YXJpYW50LCByZXNvdXJjZTogZS5yZXNvdXJjZSxcbiAgICByZW1haW5pbmc6IGUucmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3Q6IGUueWllbGRQZXJIYXJ2ZXN0LCBoYXJ2ZXN0ZWQ6IGUuaGFydmVzdGVkLFxuICAgIC4uLihlLmhhcnZlc3RlZE9uY2UgPT09IHVuZGVmaW5lZCA/IHt9IDogeyBoYXJ2ZXN0ZWRPbmNlOiBlLmhhcnZlc3RlZE9uY2UgfSksXG4gICAgcHJvdmlzaW9uYWw6IGUucHJvdmlzaW9uYWwsIGF1dGhvcmVkOiBlLmF1dGhvcmVkLFxuICB9O1xufVxuXG5mdW5jdGlvbiBjbG9uZVN0cnVjdHVyZShzOiBTdHJ1Y3R1cmUpOiBTdHJ1Y3R1cmUge1xuICByZXR1cm4ge1xuICAgIC4uLnMsXG4gICAgbW9kdWxlczogcy5tb2R1bGVzLm1hcCgobSkgPT4gKHsgLi4ubSB9KSksXG4gICAgY29zdDogT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKHMuY29zdCkuZmlsdGVyKChbLCBhbW91bnRdKSA9PiAoYW1vdW50ID8/IDApID4gMClcbiAgICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXb3JsZFNuYXBzaG90KFxuICB3b3JsZDogV29ybGQsIG5leHRTZXF1ZW5jZSA9IDAsXG4gIHNjaGVtYTogV29ybGRTbmFwc2hvdFsnc2NoZW1hJ10gPSB3b3JsZC5saWZlID8gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUFcbiAgICA6IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb21lKChzKSA9PiBzLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pXG4gICAgICA/IERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEgOiBTTkFQU0hPVF9TQ0hFTUEsXG4pOiBXb3JsZFNuYXBzaG90IHtcbiAgaWYgKHNjaGVtYSAhPT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgJiYgKHdvcmxkLmxpZmUgfHwgWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvbWUoXG4gICAgKHMpID0+IHNjaGVtYSA9PT0gU05BUFNIT1RfU0NIRU1BICYmIHMuZGVzaWduVmVyc2lvbiAhPT0gdW5kZWZpbmVkLFxuICApKSkgdGhyb3cgbmV3IEVycm9yKCdsZWdhY3kgc25hcHNob3RzIGNhbm5vdCBjb250YWluIG5ld2VyIGF1dGhvcml0YXRpdmUgc3RhdGUnKTtcbiAgY29uc3QgYmFzZTogQmFzZVdvcmxkU25hcHNob3QgPSB7XG4gICAgc2NoZW1hLFxuICAgIG1hbmlmZXN0OiB3b3JsZE1hbmlmZXN0KHdvcmxkKSxcbiAgICByZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgZWRpdHM6IFsuLi53b3JsZC5lZGl0cy5lbnRyaWVzKCldLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLm1hcChcbiAgICAgIChbY2h1bmssIGNlbGxzXSkgPT4gKHtcbiAgICAgICAgY2h1bmssXG4gICAgICAgIGNlbGxzOiBbLi4uY2VsbHMuZW50cmllcygpXS5zb3J0KChbYV0sIFtiXSkgPT4gYSAtIGIpLm1hcCgoW2ksIG1dKSA9PiAoeyBpLCBtIH0pKSxcbiAgICAgIH0pLFxuICAgICksXG4gICAgZW50aXRpZXM6IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uZmlsdGVyKChlKSA9PiAoaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkKSB8fCAhaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkpXG4gICAgICAmJiAoZS5hdXRob3JlZCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhlLmNodW5rKSkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoY2xvbmVFbnRpdHkpLFxuICAgIGVudGl0eUNodW5rczogWy4uLndvcmxkLmVudGl0eUNoYW5nZXNdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gICAgZW50aXR5UmVtb3ZhbHM6IFsuLi53b3JsZC5lbnRpdHlSZW1vdmFsc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSxcbiAgICBpbnZlbnRvcnk6IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyh3b3JsZC5pbnZlbnRvcnkpLmZpbHRlcigoWywgYW1vdW50XSkgPT4gYW1vdW50ID4gMClcbiAgICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSksXG4gICAgc3RydWN0dXJlczogWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKGNsb25lU3RydWN0dXJlKSxcbiAgICBhdXRob3JlZFBsYWNlZDogd29ybGQuYXV0aG9yZWRQbGFjZWQsXG4gICAgbmV4dFNlcXVlbmNlLFxuICB9O1xuICBpZiAoc2NoZW1hICE9PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSkgcmV0dXJuIHsgLi4uYmFzZSwgc2NoZW1hIH0gYXMgV29ybGRTbmFwc2hvdDtcbiAgaWYgKCF3b3JsZC5saWZlKSB0aHJvdyBuZXcgRXJyb3IoJ3NjaGVtYS0zIHNuYXBzaG90IHJlcXVpcmVzIGxpZmUgc3RhdGUnKTtcbiAgcmV0dXJuIHtcbiAgICAuLi5iYXNlLCBzY2hlbWEsXG4gICAgdGljazogd29ybGQubGlmZS50aWNrLFxuICAgIHN0b2NrcGlsZXM6IFsuLi53b3JsZC5saWZlLnN0b2NrcGlsZXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKChzKSA9PiAoe1xuICAgICAgaWQ6IHMuaWQsIHg6IHMueCwgejogcy56LCBjYXBhY2l0eTogcy5jYXBhY2l0eSxcbiAgICAgIGludmVudG9yeTogT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKHMuaW52ZW50b3J5KS5maWx0ZXIoKFssIGFtb3VudF0pID0+IGFtb3VudCA+IDApXG4gICAgICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSksXG4gICAgfSkpLFxuICAgIGpvYnM6IFsuLi53b3JsZC5saWZlLmpvYnMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKChqKSA9PiAoeyAuLi5qIH0pKSxcbiAgICBjcm9wczogWy4uLndvcmxkLmxpZmUuY3JvcHMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKChjKSA9PiAoeyAuLi5jIH0pKSxcbiAgfTtcbn1cblxuLyoqIFR3byBsYW5lcywgd2l0aCBsZW5ndGggaW5jbHVkZWQ7IG5vdCBhIGNyeXB0b2dyYXBoaWMgaW50ZWdyaXR5IHNpZ25hdHVyZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxIYXNoKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBhID0gMHg4MTFjOWRjNSwgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGMgPSB0ZXh0LmNoYXJDb2RlQXQoaSk7XG4gICAgYSA9IE1hdGguaW11bChhIF4gYywgMHgwMTAwMDE5Myk7XG4gICAgYiA9IE1hdGguaW11bChiIF4gKGMgKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgYiBePSBiID4+PiAxMztcbiAgfVxuICByZXR1cm4gKGEgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpICsgKGIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsV29ybGRIYXNoKFxuICB3b3JsZDogV29ybGQsIG5leHRTZXF1ZW5jZSA9IDAsIHNjaGVtYTogV29ybGRTbmFwc2hvdFsnc2NoZW1hJ10gPSBERVNJR05fU05BUFNIT1RfU0NIRU1BLFxuKTogc3RyaW5nIHtcbiAgcmV0dXJuIGNhbm9uaWNhbEhhc2goSlNPTi5zdHJpbmdpZnkoY3JlYXRlV29ybGRTbmFwc2hvdCh3b3JsZCwgbmV4dFNlcXVlbmNlLCBzY2hlbWEpKSk7XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHVpbnQodmFsdWU6IHVua25vd24sIG1heGltdW06IG51bWJlcik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc1NhZmVJbnRlZ2VyKHZhbHVlKSAmJiB2YWx1ZSA+PSAwICYmIHZhbHVlIDw9IG1heGltdW07XG59XG5cbmZ1bmN0aW9uIGZpbml0ZSh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHRleHQodmFsdWU6IHVua25vd24sIG1heGltdW0gPSAyNTYpOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZS5sZW5ndGggPiAwICYmIHZhbHVlLmxlbmd0aCA8PSBtYXhpbXVtO1xufVxuXG5mdW5jdGlvbiB2YWxpZENodW5rKGtleTogdW5rbm93bik6IGtleSBpcyBzdHJpbmcge1xuICBpZiAodHlwZW9mIGtleSAhPT0gJ3N0cmluZycgfHwgIS9eLT9cXGQrLC0/XFxkKyQvLnRlc3Qoa2V5KSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICByZXR1cm4gTnVtYmVyLmlzSW50ZWdlcihjeCkgJiYgTnVtYmVyLmlzSW50ZWdlcihjeilcbiAgICAmJiBjeCA+PSAwICYmIGN6ID49IDAgJiYgY3ggPCBDSFVOS1NfUEVSX1NJREUgJiYgY3ogPCBDSFVOS1NfUEVSX1NJREU7XG59XG5cbi8qKiBBIHN0cmljdCBsZWdhY3kgc25hcHNob3QgaXMgYWxyZWFkeSBjYW5vbmljYWwgY3JlYXRlV29ybGRTbmFwc2hvdCBvdXRwdXQuXG4gKiBWZXJpZnkgaXRzIHJlY29yZGVkIGJvdW5kYXJ5IGJlZm9yZSBmaWx0ZXJpbmcgdGhlIHRocmVlIHJldGlyZWQgc3RvbmUgZm9ybXMuICovXG5leHBvcnQgZnVuY3Rpb24gbGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90OiBXb3JsZFNuYXBzaG90KTogc3RyaW5nIHtcbiAgcmV0dXJuIGNhbm9uaWNhbEhhc2goSlNPTi5zdHJpbmdpZnkoc25hcHNob3QpKTtcbn1cblxuLyoqIE1pZ3JhdGlvbiBvbmx5OiBubyBpbnZlbnRvcnksIHN0cnVjdHVyZSwgbGlmZSwgZWRpdCBvciBjb21tYW5kIGRhdGEgY2hhbmdlcy4gKi9cbi8qKiBAaW50ZXJuYWwgUmV0aXJlIG9ubHkgYWZ0ZXIgcmVjb25zdHJ1Y3RpbmcgdGhlIG9sZCBzdGF0ZSBpbiByZXBsYXkgbW9kZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtaWdyYXRlU3RvbmVTbmFwc2hvdChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCk6IFdvcmxkU25hcHNob3Qge1xuICBjb25zdCByZW1vdmFscyA9IG5ldyBTZXQoc25hcHNob3QuZW50aXR5UmVtb3ZhbHMpO1xuICBmb3IgKGNvbnN0IGVudGl0eSBvZiBzbmFwc2hvdC5lbnRpdGllcykge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFlbnRpdHkuYXV0aG9yZWQpIHJlbW92YWxzLmFkZChlbnRpdHkuaWQpO1xuICB9XG4gIGNvbnN0IGVudGl0eUNodW5rcyA9IG5ldyBTZXQoc25hcHNob3QuZW50aXR5Q2h1bmtzKTtcbiAgZm9yIChjb25zdCBlbnRpdHkgb2Ygc25hcHNob3QuZW50aXRpZXMpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSkge1xuICAgICAgZW50aXR5Q2h1bmtzLmFkZChlbnRpdHkuY2h1bmspO1xuICAgICAgaWYgKCFlbnRpdHkuYXV0aG9yZWQpIHJlbW92YWxzLmFkZChlbnRpdHkuaWQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4ge1xuICAgIC4uLnNuYXBzaG90LFxuICAgIGVudGl0aWVzOiBzbmFwc2hvdC5lbnRpdGllcy5maWx0ZXIoKGVudGl0eSkgPT4gIWlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpLFxuICAgIGVudGl0eUNodW5rczogWy4uLmVudGl0eUNodW5rc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSxcbiAgICBlbnRpdHlSZW1vdmFsczogWy4uLnJlbW92YWxzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLFxuICB9O1xufVxuY29uc3QgRU5USVRZX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3RyZWVfc3BpcmUnLCAnc3R5bF90cmVlX3RhYmxlJywgJ3N0eWxfdHJlZV9jbHVzdGVyJywgJ3N0eWxfdHJlZV9ibG9zc29tJyxcbiAgJ3N0eWxfc2hydWInLCAnc3R5bF9yb2NrX3NtYWxsJywgJ3N0eWxfcm9ja19tZWRpdW0nLCAnc3R5bF9yb2NrX2xhcmdlJyxcbiAgJ3N0eWxfb3JlJywgJ3N0eWxfY2Fpcm4nLCAnd2F5c3RvbmUnLCAnbWFya2VyJyxcbl0pO1xuY29uc3QgUkVTT1VSQ0VTID0gbmV3IFNldDxSZXNvdXJjZVR5cGU+KFsnd29vZCcsICdzdG9uZScsICdvcmUnLCAnZmliZXInXSk7XG5jb25zdCBSRUNPUkRfUkVTT1VSQ0VTID0gbmV3IFNldDxzdHJpbmc+KExJRkVfUkVTT1VSQ0VTKTtcbmNvbnN0IFNUUlVDVFVSRV9LSU5EUyA9IG5ldyBTZXQoWydob3VzZScsICdwYXRoJywgJ3RlcnJhY2UnXSk7XG5jb25zdCBNT0RVTEVfS0lORFMgPSBuZXcgU2V0KFtcbiAgJ2Zsb29yJywgJ3dhbGwnLCAncG9zdCcsICdsaW50ZWwnLCAncm9vZicsICdwYXJhcGV0JywgJ3dpbmRvdycsICdkb29yJyxcbiAgJ3RocmVzaG9sZCcsICdwYXRoJywgJ2N1cmInLCAnc29pbF9iZWQnLCAncmV0YWluaW5nX3dhbGwnLCAnY3JvcF9yb3cnLFxuXSk7XG5jb25zdCBNT0RVTEVfVE9ORVMgPSBuZXcgU2V0KFsnc3RvbmUnLCAnc3RvbmVfYicsICdvY2hyZScsICd0aW1iZXInLCAnYWNjZW50JywgJ3NvaWwnLCAnY3JvcCcsICdncmF2ZWwnXSk7XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRW50aXR5KHZhbHVlOiB1bmtub3duLCBpZHM6IFNldDxzdHJpbmc+KTogRW50aXR5IHtcbiAgaWYgKCFpc09iamVjdCh2YWx1ZSkgfHwgIXRleHQodmFsdWUuaWQpIHx8IGlkcy5oYXModmFsdWUuaWQpXG4gICAgfHwgIXRleHQodmFsdWUua2luZCkgfHwgIUVOVElUWV9LSU5EUy5oYXModmFsdWUua2luZCBhcyBFbnRpdHlLaW5kKVxuICAgIHx8ICF2YWxpZENodW5rKHZhbHVlLmNodW5rKVxuICAgIHx8ICFmaW5pdGUodmFsdWUueCkgfHwgIWZpbml0ZSh2YWx1ZS55KSB8fCAhZmluaXRlKHZhbHVlLnopXG4gICAgfHwgdmFsdWUueCA8IC1IQUxGIHx8IHZhbHVlLnggPj0gSEFMRiB8fCB2YWx1ZS56IDwgLUhBTEYgfHwgdmFsdWUueiA+PSBIQUxGXG4gICAgfHwgIWZpbml0ZSh2YWx1ZS5yb3QpIHx8ICFmaW5pdGUodmFsdWUuc2NhbGUpIHx8ICF1aW50KHZhbHVlLnZhcmlhbnQsIDEwMDApXG4gICAgfHwgdmFsdWUucmVzb3VyY2UgIT09IG51bGwgJiYgISh0eXBlb2YgdmFsdWUucmVzb3VyY2UgPT09ICdzdHJpbmcnICYmIFJFU09VUkNFUy5oYXModmFsdWUucmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlKSlcbiAgICB8fCAhdWludCh2YWx1ZS5yZW1haW5pbmcsIDFfMDAwXzAwMCkgfHwgIXVpbnQodmFsdWUueWllbGRQZXJIYXJ2ZXN0LCAxXzAwMF8wMDApXG4gICAgfHwgdHlwZW9mIHZhbHVlLmhhcnZlc3RlZCAhPT0gJ2Jvb2xlYW4nIHx8IHR5cGVvZiB2YWx1ZS5wcm92aXNpb25hbCAhPT0gJ2Jvb2xlYW4nXG4gICAgfHwgdHlwZW9mIHZhbHVlLmF1dGhvcmVkICE9PSAnYm9vbGVhbidcbiAgICB8fCB2YWx1ZS5oYXJ2ZXN0ZWRPbmNlICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHZhbHVlLmhhcnZlc3RlZE9uY2UgIT09ICdib29sZWFuJykge1xuICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgYW4gaW52YWxpZCBvciBkdXBsaWNhdGUgZW50aXR5Jyk7XG4gIH1cbiAgaWRzLmFkZCh2YWx1ZS5pZCk7XG4gIHJldHVybiB7XG4gICAgaWQ6IHZhbHVlLmlkLCBraW5kOiB2YWx1ZS5raW5kIGFzIEVudGl0eUtpbmQsIGNodW5rOiB2YWx1ZS5jaHVuayxcbiAgICB4OiB2YWx1ZS54LCB5OiB2YWx1ZS55LCB6OiB2YWx1ZS56LCByb3Q6IHZhbHVlLnJvdCwgc2NhbGU6IHZhbHVlLnNjYWxlLFxuICAgIHZhcmlhbnQ6IHZhbHVlLnZhcmlhbnQsIHJlc291cmNlOiB2YWx1ZS5yZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGUgfCBudWxsLFxuICAgIHJlbWFpbmluZzogdmFsdWUucmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3Q6IHZhbHVlLnlpZWxkUGVySGFydmVzdCxcbiAgICBoYXJ2ZXN0ZWQ6IHZhbHVlLmhhcnZlc3RlZCxcbiAgICAuLi4odmFsdWUuaGFydmVzdGVkT25jZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGhhcnZlc3RlZE9uY2U6IHZhbHVlLmhhcnZlc3RlZE9uY2UgfSksXG4gICAgcHJvdmlzaW9uYWw6IHZhbHVlLnByb3Zpc2lvbmFsLCBhdXRob3JlZDogdmFsdWUuYXV0aG9yZWQsXG4gIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlSW52ZW50b3J5KHZhbHVlOiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGludmVudG9yeSBpcyBpbnZhbGlkJyk7XG4gIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh2YWx1ZSkuc29ydCgpKSB7XG4gICAgaWYgKCFSRUNPUkRfUkVTT1VSQ0VTLmhhcyhrZXkpIHx8ICF1aW50KHZhbHVlW2tleV0sIDFfMDAwXzAwMF8wMDApKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYHNuYXBzaG90IGhhcyBpbnZhbGlkIGludmVudG9yeSByZXNvdXJjZSAke2tleX1gKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlW2tleV0gPiAwKSBvdXRba2V5XSA9IHZhbHVlW2tleV07XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gc3RvY2tUb3RhbCh2YWx1ZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPik6IG51bWJlciB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKHZhbHVlKS5yZWR1Y2UoKHN1bSwgYW1vdW50KSA9PiBzdW0gKyBhbW91bnQsIDApO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUxpZmVGaWVsZHModmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogUGljazxMaWZlU25hcHNob3QsICd0aWNrJyB8ICdzdG9ja3BpbGVzJyB8ICdqb2JzJyB8ICdjcm9wcyc+IHtcbiAgaWYgKCF1aW50KHZhbHVlLnRpY2ssIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLnN0b2NrcGlsZXMpIHx8IHZhbHVlLnN0b2NrcGlsZXMubGVuZ3RoICE9PSAxXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuam9icykgfHwgdmFsdWUuam9icy5sZW5ndGggPiBNQVhfUFJPRFVDVElPTl9KT0JTXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuY3JvcHMpIHx8IHZhbHVlLmNyb3BzLmxlbmd0aCA+IENST1BfUExPVF9JRFMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgaW52YWxpZCBsaWZlLWxvb3AgZmllbGRzJyk7XG4gIH1cbiAgY29uc3Qgc3RvY2twaWxlczogTm9uTnVsbGFibGU8TGlmZVNuYXBzaG90WydzdG9ja3BpbGVzJ10+ID0gW107XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLnN0b2NrcGlsZXMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgcmF3LmlkICE9PSBGT1VOREVSX1NUT0NLUElMRV9JRCB8fCByYXcueCAhPT0gRk9VTkRFUl9TVE9DS1BJTEUueFxuICAgICAgfHwgcmF3LnogIT09IEZPVU5ERVJfU1RPQ0tQSUxFLnogfHwgcmF3LmNhcGFjaXR5ICE9PSBGT1VOREVSX1NUT0NLUElMRS5jYXBhY2l0eSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gdW5zdXBwb3J0ZWQgc3RvY2twaWxlJyk7XG4gICAgfVxuICAgIGNvbnN0IGludmVudG9yeSA9IHZhbGlkYXRlSW52ZW50b3J5KHJhdy5pbnZlbnRvcnkpO1xuICAgIGlmIChzdG9ja1RvdGFsKGludmVudG9yeSkgPiBTVE9DS1BJTEVfQ0FQQUNJVFkpIHRocm93IG5ldyBFcnJvcignc3RvY2twaWxlIGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgICBzdG9ja3BpbGVzLnB1c2goeyBpZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHg6IHJhdy54LCB6OiByYXcueixcbiAgICAgIGNhcGFjaXR5OiBTVE9DS1BJTEVfQ0FQQUNJVFksIGludmVudG9yeSB9KTtcbiAgfVxuICBsZXQgcmVzZXJ2ZWQgPSBzdG9ja1RvdGFsKHN0b2NrcGlsZXNbMF0uaW52ZW50b3J5KTtcbiAgY29uc3QgaWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IGpvYnM6IE5vbk51bGxhYmxlPExpZmVTbmFwc2hvdFsnam9icyddPiA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5qb2JzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICF0ZXh0KHJhdy5pZCwgMTI4KSB8fCAhL15bQS1aYS16MC05XVtBLVphLXowLTkuXzolLV0qJC8udGVzdChyYXcuaWQpXG4gICAgICB8fCBpZHMuaGFzKHJhdy5pZCkgfHwgcmF3LnN0b2NrcGlsZUlkICE9PSBGT1VOREVSX1NUT0NLUElMRV9JRFxuICAgICAgfHwgcmF3LnJlY2lwZSAhPT0gJ3NlZWQnICYmIHJhdy5yZWNpcGUgIT09ICdyYXRpb25zJ1xuICAgICAgfHwgIXVpbnQocmF3LnJlbWFpbmluZ1RpY2tzLCBNQVhfVElDS1NfUEVSX0NPTU1BTkQpIHx8IHJhdy5yZW1haW5pbmdUaWNrcyA8IDFcbiAgICAgIHx8IHJhdy5yZW1haW5pbmdUaWNrcyA+IFJFQ0lQRVNbcmF3LnJlY2lwZV0udGlja3MpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGFuIGludmFsaWQgcHJvZHVjdGlvbiBqb2InKTtcbiAgICByZXNlcnZlZCArPSBzdG9ja1RvdGFsKFJFQ0lQRVNbcmF3LnJlY2lwZV0ub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pO1xuICAgIGlkcy5hZGQocmF3LmlkKTtcbiAgICBqb2JzLnB1c2goeyBpZDogcmF3LmlkLCBzdG9ja3BpbGVJZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHJlY2lwZTogcmF3LnJlY2lwZSwgcmVtYWluaW5nVGlja3M6IHJhdy5yZW1haW5pbmdUaWNrcyB9KTtcbiAgfVxuICBpZiAocmVzZXJ2ZWQgPiBTVE9DS1BJTEVfQ0FQQUNJVFkpIHRocm93IG5ldyBFcnJvcignc3RvY2twaWxlIHJlc2VydmVkIG91dHB1dCBleGNlZWRzIGNhcGFjaXR5Jyk7XG4gIGlkcy5jbGVhcigpO1xuICBjb25zdCBjcm9wczogTm9uTnVsbGFibGU8TGlmZVNuYXBzaG90Wydjcm9wcyddPiA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5jcm9wcykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCAhQ1JPUF9QTE9UX0lEUy5pbmNsdWRlcyhTdHJpbmcocmF3LmlkKSkgfHwgaWRzLmhhcyhTdHJpbmcocmF3LmlkKSlcbiAgICAgIHx8ICF1aW50KHJhdy5wbGFudGVkVGljaywgdmFsdWUudGljaykgfHwgcmF3Lmdyb3d0aFRpY2tzICE9PSBDUk9QX0dST1dUSF9USUNLUykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gaW52YWxpZCBjcm9wIHBsb3QnKTtcbiAgICB9XG4gICAgY29uc3QgcGxvdElkID0gU3RyaW5nKHJhdy5pZCk7XG4gICAgaWRzLmFkZChwbG90SWQpO1xuICAgIGNyb3BzLnB1c2goeyBpZDogcGxvdElkLCBwbGFudGVkVGljazogcmF3LnBsYW50ZWRUaWNrLCBncm93dGhUaWNrczogQ1JPUF9HUk9XVEhfVElDS1MgfSk7XG4gIH1cbiAgc3RvY2twaWxlcy5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICBqb2JzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIGNyb3BzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIHJldHVybiB7IHRpY2s6IHZhbHVlLnRpY2ssIHN0b2NrcGlsZXMsIGpvYnMsIGNyb3BzIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ29zdCh2YWx1ZTogdW5rbm93bik6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4ge1xuICBjb25zdCBvdXQgPSB2YWxpZGF0ZUludmVudG9yeSh2YWx1ZSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlU3RydWN0dXJlKFxuICB2YWx1ZTogdW5rbm93biwgaWRzOiBTZXQ8c3RyaW5nPiwgc2NoZW1hOiBXb3JsZFNuYXBzaG90WydzY2hlbWEnXSxcbik6IFN0cnVjdHVyZSB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpIHx8ICF0ZXh0KHZhbHVlLmlkKSB8fCBpZHMuaGFzKHZhbHVlLmlkKVxuICAgIHx8ICF0ZXh0KHZhbHVlLmtpbmQpIHx8ICFTVFJVQ1RVUkVfS0lORFMuaGFzKHZhbHVlLmtpbmQpXG4gICAgfHwgIXRleHQodmFsdWUuc2l0ZUlkKVxuICAgIHx8ICFmaW5pdGUodmFsdWUueCkgfHwgIWZpbml0ZSh2YWx1ZS55KSB8fCAhZmluaXRlKHZhbHVlLnopIHx8ICFmaW5pdGUodmFsdWUucm90KVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLm1vZHVsZXMpIHx8IHZhbHVlLm1vZHVsZXMubGVuZ3RoID4gNjRcbiAgICB8fCAhdWludCh2YWx1ZS5idWlsdFJldmlzaW9uLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikgfHwgdmFsdWUucHJvdmlzaW9uYWwgIT09IHRydWVcbiAgICB8fCBzY2hlbWEgPT09IFNOQVBTSE9UX1NDSEVNQSAmJiB2YWx1ZS5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWRcbiAgICB8fCBzY2hlbWEgIT09IFNOQVBTSE9UX1NDSEVNQSAmJiB2YWx1ZS5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWRcbiAgICAgICYmIHZhbHVlLmRlc2lnblZlcnNpb24gIT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGFuIGludmFsaWQgb3IgZHVwbGljYXRlIHN0cnVjdHVyZScpO1xuICB9XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZVsnbW9kdWxlcyddID0gW107XG4gIGNvbnN0IG1vZHVsZUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5tb2R1bGVzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICF0ZXh0KHJhdy5raW5kKSB8fCAhTU9EVUxFX0tJTkRTLmhhcyhyYXcua2luZClcbiAgICAgIHx8ICFmaW5pdGUocmF3LngpIHx8ICFmaW5pdGUocmF3LnkpIHx8ICFmaW5pdGUocmF3LnopXG4gICAgICB8fCAhZmluaXRlKHJhdy53KSB8fCByYXcudyA8PSAwIHx8ICFmaW5pdGUocmF3LmgpIHx8IHJhdy5oIDw9IDAgfHwgIWZpbml0ZShyYXcuZCkgfHwgcmF3LmQgPD0gMFxuICAgICAgfHwgcmF3LnJvdCAhPT0gdW5kZWZpbmVkICYmICFmaW5pdGUocmF3LnJvdClcbiAgICAgIHx8IHJhdy50b25lICE9PSB1bmRlZmluZWQgJiYgKHR5cGVvZiByYXcudG9uZSAhPT0gJ3N0cmluZycgfHwgIU1PRFVMRV9UT05FUy5oYXMocmF3LnRvbmUpKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBzdHJ1Y3R1cmUgJHt2YWx1ZS5pZH0gY29udGFpbnMgYW4gaW52YWxpZCBtb2R1bGVgKTtcbiAgICB9XG4gICAgY29uc3Qgc2lnbmF0dXJlID0gSlNPTi5zdHJpbmdpZnkocmF3KTtcbiAgICBpZiAobW9kdWxlSWRzLmhhcyhzaWduYXR1cmUpKSB0aHJvdyBuZXcgRXJyb3IoYHN0cnVjdHVyZSAke3ZhbHVlLmlkfSBjb250YWlucyBkdXBsaWNhdGUgbW9kdWxlc2ApO1xuICAgIG1vZHVsZUlkcy5hZGQoc2lnbmF0dXJlKTtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogcmF3LmtpbmQgYXMgU3RydWN0dXJlWydtb2R1bGVzJ11bbnVtYmVyXVsna2luZCddLFxuICAgICAgeDogcmF3LngsIHk6IHJhdy55LCB6OiByYXcueiwgdzogcmF3LncsIGg6IHJhdy5oLCBkOiByYXcuZCxcbiAgICAgIC4uLihyYXcucm90ID09PSB1bmRlZmluZWQgPyB7fSA6IHsgcm90OiByYXcucm90IH0pLFxuICAgICAgLi4uKHJhdy50b25lID09PSB1bmRlZmluZWQgPyB7fSA6IHsgdG9uZTogcmF3LnRvbmUgYXMgU3RydWN0dXJlWydtb2R1bGVzJ11bbnVtYmVyXVsndG9uZSddIH0pLFxuICAgIH0pO1xuICB9XG4gIGlkcy5hZGQodmFsdWUuaWQpO1xuICByZXR1cm4ge1xuICAgIGlkOiB2YWx1ZS5pZCwga2luZDogdmFsdWUua2luZCBhcyBTdHJ1Y3R1cmVbJ2tpbmQnXSwgc2l0ZUlkOiB2YWx1ZS5zaXRlSWQsXG4gICAgeDogdmFsdWUueCwgeTogdmFsdWUueSwgejogdmFsdWUueiwgcm90OiB2YWx1ZS5yb3QsXG4gICAgbW9kdWxlcywgY29zdDogdmFsaWRhdGVDb3N0KHZhbHVlLmNvc3QpLCBidWlsdFJldmlzaW9uOiB2YWx1ZS5idWlsdFJldmlzaW9uLFxuICAgIC4uLih2YWx1ZS5kZXNpZ25WZXJzaW9uID09PSB1bmRlZmluZWQgPyB7fSA6IHsgZGVzaWduVmVyc2lvbjogRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9KSxcbiAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgfTtcbn1cblxuLyoqIFN0cmljdCBydW50aW1lIHZhbGlkYXRpb247IEpTT04ncyBUeXBlU2NyaXB0IGNhc3RzIGFyZSBuZXZlciB0cnVzdGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlV29ybGRTbmFwc2hvdCh2YWx1ZTogdW5rbm93bik6IFdvcmxkU25hcHNob3Qge1xuICBpZiAoIWlzT2JqZWN0KHZhbHVlKVxuICAgIHx8IHZhbHVlLnNjaGVtYSAhPT0gU05BUFNIT1RfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gREVTSUdOX1NOQVBTSE9UX1NDSEVNQVxuICAgICYmIHZhbHVlLnNjaGVtYSAhPT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUFcbiAgICB8fCAhaXNPYmplY3QodmFsdWUubWFuaWZlc3QpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBvciBtYWxmb3JtZWQgd29ybGQgc25hcHNob3QnKTtcbiAgfVxuICBjb25zdCBzY2hlbWEgPSB2YWx1ZS5zY2hlbWE7XG4gIGNvbnN0IG0gPSB2YWx1ZS5tYW5pZmVzdDtcbiAgLy8gRXZlcnkgc3VwcG9ydGVkIGdlbmVyYXRvciByZXN0b3JlcyB3aXRoIGl0cyBvd24gdmVyc2lvbjsgdjEgc2F2ZXMga2VlcFxuICAvLyBHRU5FUkFUT1JfVkVSU0lPTiBleGFjdGx5LCBzbyB0aGVpciBtYW5pZmVzdHMgYW5kIGhhc2hlcyBhcmUgdW5jaGFuZ2VkLlxuICBjb25zdCBwYXJhbXMgPSB7XG4gICAgc2l6ZTogMjA0OCwgY2h1bmtTaXplOiBDSFVOS19TSVpFLCB5TWluOiAtMTYsIHlNYXg6IDExMixcbiAgICBzZWFMZXZlbDogMCwgZ2VuZXJhdG9yVmVyc2lvbjogaXNTdXBwb3J0ZWRHZW5lcmF0b3IobS5nZW5lcmF0b3JWZXJzaW9uKSA/IG0uZ2VuZXJhdG9yVmVyc2lvbiA6IEdFTkVSQVRPUl9WRVJTSU9OLFxuICB9O1xuICBpZiAobS5zY2hlbWEgIT09IDEgfHwgIXVpbnQobS5zZWVkLCAweGZmZmZmZmZmKVxuICAgIHx8ICFpc1N1cHBvcnRlZEdlbmVyYXRvcihtLmdlbmVyYXRvclZlcnNpb24pXG4gICAgfHwgbS5zaXplICE9PSBwYXJhbXMuc2l6ZSB8fCBtLmNodW5rU2l6ZSAhPT0gcGFyYW1zLmNodW5rU2l6ZVxuICAgIHx8IG0ueU1pbiAhPT0gcGFyYW1zLnlNaW4gfHwgbS55TWF4ICE9PSBwYXJhbXMueU1heCB8fCBtLnNlYUxldmVsICE9PSBwYXJhbXMuc2VhTGV2ZWxcbiAgICB8fCAhL15bMC05YS1mXXs4fSQvLnRlc3QoU3RyaW5nKG0ucGFyYW1zSGFzaCkpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBnZW5lcmF0b3IgY29uZmlndXJhdGlvbiBpcyB1bnN1cHBvcnRlZCBvciBpbmNvbXBhdGlibGUnKTtcbiAgfVxuICBpZiAoIXVpbnQodmFsdWUucmV2aXNpb24sIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKVxuICAgIHx8ICF1aW50KHZhbHVlLm5leHRTZXF1ZW5jZSwgMTBfMDAwXzAwMClcbiAgICB8fCB0eXBlb2YgdmFsdWUuYXV0aG9yZWRQbGFjZWQgIT09ICdib29sZWFuJ1xuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVkaXRzKSB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5lbnRpdGllcylcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5lbnRpdHlSZW1vdmFscylcbiAgICB8fCB2YWx1ZS5lbnRpdGllcy5sZW5ndGggPiBNQVhfU05BUFNIT1RfRU5USVRJRVNcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5lbnRpdHlDaHVua3MpIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLnN0cnVjdHVyZXMpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgaW52YWxpZCBhdXRob3JpdGF0aXZlLXN0YXRlIGZpZWxkcycpO1xuICB9XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQobS5zZWVkLCBwYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbik7XG4gIC8vIFRoZSBtYW5pZmVzdCBoYXNoIGlzIGNoZWNrZWQgYWdhaW5zdCB0aGUgYWN0dWFsIHJlc3RvcmVkIGNvbmZpZ3VyYXRpb24uXG4gIGlmICh3b3JsZE1hbmlmZXN0KHdvcmxkKS5wYXJhbXNIYXNoICE9PSBtLnBhcmFtc0hhc2gpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgbWFuaWZlc3QgaGFzaCBtaXNtYXRjaCcpO1xuXG4gIGNvbnN0IGVkaXRzOiBXb3JsZFNuYXBzaG90WydlZGl0cyddID0gW107XG4gIGxldCBlZGl0Q291bnQgPSAwO1xuICBjb25zdCBjaHVua0lkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5lZGl0cykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCAhdmFsaWRDaHVuayhyYXcuY2h1bmspIHx8IGNodW5rSWRzLmhhcyhyYXcuY2h1bmspXG4gICAgICB8fCAhQXJyYXkuaXNBcnJheShyYXcuY2VsbHMpIHx8IHJhdy5jZWxscy5sZW5ndGggPiBDSFVOS19WT0xVTUUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgaW52YWxpZCBjaHVuayBlZGl0cycpO1xuICAgIH1cbiAgICBjb25zdCBjZWxsSWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgY29uc3QgY2VsbHM6IEFycmF5PHsgaTogbnVtYmVyOyBtOiBudW1iZXIgfT4gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNlbGwgb2YgcmF3LmNlbGxzKSB7XG4gICAgICBpZiAoIWlzT2JqZWN0KGNlbGwpIHx8ICF1aW50KGNlbGwuaSwgQ0hVTktfVk9MVU1FIC0gMSkgfHwgY2VsbElkcy5oYXMoY2VsbC5pKVxuICAgICAgICB8fCAhdWludChjZWxsLm0sIE1BWF9NQVRfSUQpKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGFuIGludmFsaWQgdm94ZWwgZWRpdCcpO1xuICAgICAgY2VsbElkcy5hZGQoY2VsbC5pKTtcbiAgICAgIGNlbGxzLnB1c2goeyBpOiBjZWxsLmksIG06IGNlbGwubSB9KTtcbiAgICB9XG4gICAgY2VsbElkcy5jbGVhcigpO1xuICAgIGNlbGxzLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSk7XG4gICAgZWRpdENvdW50ICs9IGNlbGxzLmxlbmd0aDtcbiAgICBpZiAoZWRpdENvdW50ID4gTUFYX1NOQVBTSE9UX0VESVRTKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGV4Y2VlZHMgdGhlIGJvdW5kZWQgZWRpdCBsaW1pdCcpO1xuICAgIGNodW5rSWRzLmFkZChyYXcuY2h1bmspO1xuICAgIGVkaXRzLnB1c2goeyBjaHVuazogcmF3LmNodW5rLCBjZWxscyB9KTtcbiAgfVxuICBlZGl0cy5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykpO1xuXG4gIGNvbnN0IGVudGl0eUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBlbnRpdGllcyA9IHZhbHVlLmVudGl0aWVzLm1hcCgoZSkgPT4gdmFsaWRhdGVFbnRpdHkoZSwgZW50aXR5SWRzKSk7XG4gIGNvbnN0IGVudGl0eUNodW5rczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgZ2VuZXJhdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3Qga2V5IG9mIHZhbHVlLmVudGl0eUNodW5rcykge1xuICAgIGlmICghdmFsaWRDaHVuayhrZXkpIHx8IGdlbmVyYXRlZC5oYXMoa2V5KSkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBnZW5lcmF0ZWQtY2h1bmsgaW5kZXggaXMgaW52YWxpZCcpO1xuICAgIGdlbmVyYXRlZC5hZGQoa2V5KTtcbiAgICBlbnRpdHlDaHVua3MucHVzaChrZXkpO1xuICB9XG4gIGZvciAoY29uc3QgZW50aXR5IG9mIGVudGl0aWVzKSB7XG4gICAgaWYgKCFlbnRpdHkuYXV0aG9yZWQgJiYgIWdlbmVyYXRlZC5oYXMoZW50aXR5LmNodW5rKSkgdGhyb3cgbmV3IEVycm9yKGBlbnRpdHkgJHtlbnRpdHkuaWR9IGJlbG9uZ3MgdG8gYW4gdW5tYXJrZWQgY2h1bmtgKTtcbiAgfVxuICBlbnRpdHlDaHVua3Muc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcbiAgY29uc3QgcmVtb3ZhbHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCBpZCBvZiB2YWx1ZS5lbnRpdHlSZW1vdmFscykge1xuICAgIGlmICghdGV4dChpZCkgfHwgcmVtb3ZhbHMuaGFzKGlkKSB8fCBlbnRpdHlJZHMuaGFzKGlkKSB8fCAhL15lOlxcZCssXFxkKzpcXGQrJC8udGVzdChpZCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZW50aXR5IHRvbWJzdG9uZSBpcyBpbnZhbGlkJyk7XG4gICAgfVxuICAgIHJlbW92YWxzLmFkZChpZCk7XG4gIH1cbiAgY29uc3QgZW50aXR5UmVtb3ZhbHMgPSBbLi4ucmVtb3ZhbHNdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cbiAgY29uc3Qgc3RydWN0dXJlSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IHN0cnVjdHVyZXMgPSB2YWx1ZS5zdHJ1Y3R1cmVzLm1hcCgocykgPT4gdmFsaWRhdGVTdHJ1Y3R1cmUocywgc3RydWN0dXJlSWRzLCBzY2hlbWEpKVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICBjb25zdCBjYXJyaWVkID0gdmFsaWRhdGVJbnZlbnRvcnkodmFsdWUuaW52ZW50b3J5KTtcbiAgaWYgKHNjaGVtYSA9PT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgJiYgc3RvY2tUb3RhbChjYXJyaWVkKSA+IENBUlJJRURfQ0FQQUNJVFkpIHRocm93IG5ldyBFcnJvcignY2FycmllZCBpbnZlbnRvcnkgZXhjZWVkcyBjYXBhY2l0eScpO1xuICBjb25zdCBzbmFwc2hvdDogQmFzZVdvcmxkU25hcHNob3QgPSB7XG4gICAgc2NoZW1hLFxuICAgIG1hbmlmZXN0OiB7XG4gICAgICBzY2hlbWE6IDEsIHNlZWQ6IG0uc2VlZCwgZ2VuZXJhdG9yVmVyc2lvbjogcGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgICBzaXplOiBwYXJhbXMuc2l6ZSwgY2h1bmtTaXplOiBwYXJhbXMuY2h1bmtTaXplLCB5TWluOiBwYXJhbXMueU1pbixcbiAgICAgIHlNYXg6IHBhcmFtcy55TWF4LCBzZWFMZXZlbDogcGFyYW1zLnNlYUxldmVsLCBwYXJhbXNIYXNoOiBtLnBhcmFtc0hhc2gsXG4gICAgfSxcbiAgICByZXZpc2lvbjogdmFsdWUucmV2aXNpb24sXG4gICAgZWRpdHMsXG4gICAgZW50aXRpZXMsXG4gICAgZW50aXR5Q2h1bmtzLFxuICAgIGVudGl0eVJlbW92YWxzLFxuICAgIGludmVudG9yeTogY2FycmllZCxcbiAgICBzdHJ1Y3R1cmVzLFxuICAgIGF1dGhvcmVkUGxhY2VkOiB2YWx1ZS5hdXRob3JlZFBsYWNlZCxcbiAgICBuZXh0U2VxdWVuY2U6IHZhbHVlLm5leHRTZXF1ZW5jZSxcbiAgfTtcbiAgY29uc3QgcmVzdWx0OiBXb3JsZFNuYXBzaG90ID0gc2NoZW1hID09PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQVxuICAgID8geyAuLi5zbmFwc2hvdCwgc2NoZW1hOiBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSwgLi4udmFsaWRhdGVMaWZlRmllbGRzKHZhbHVlKSB9XG4gICAgOiB7IC4uLnNuYXBzaG90LCBzY2hlbWE6IHNjaGVtYSBhcyB0eXBlb2YgU05BUFNIT1RfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEgfTtcbiAgaWYgKEpTT04uc3RyaW5naWZ5KHJlc3VsdCkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgdW5rbm93biwgbm9uLWNhbm9uaWNhbCBvciBhbWJpZ3VvdXMgZmllbGRzJyk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZVdvcmxkU25hcHNob3QoanNvbjogc3RyaW5nKTogV29ybGRTbmFwc2hvdCB7XG4gIGlmIChqc29uLmxlbmd0aCA+IE1BWF9TTkFQU0hPVF9KU09OX0JZVEVTKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGV4Y2VlZHMgdGhlIEpTT04gc2l6ZSBsaW1pdCcpO1xuICByZXR1cm4gdmFsaWRhdGVXb3JsZFNuYXBzaG90KEpTT04ucGFyc2UoanNvbikpO1xufVxuXG4vKiogUmVzdG9yZSBpbiBwbGFjZSBzbyBjb250cm9sbGVycyByZXRhaW4gdGhlIHNhbWUgV29ybGQgcmVmZXJlbmNlLiBBbGxcbiAqIHZhbGlkYXRpb24gaGFwcGVucyBiZWZvcmUgbXV0YXRpb24sIHNvIGEgcmVqZWN0ZWQgc2F2ZSBjYW5ub3QgZXJhc2Ugd29yay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZDogV29ybGQsIGlucHV0OiBXb3JsZFNuYXBzaG90KTogdm9pZCB7XG4gIC8vIE9yZGluYXJ5IHNuYXBzaG90cyBhbmQgdHJhbnNhY3Rpb25hbCByb2xsYmFja3MgcmVzdG9yZSB0aGVpciBleGFjdCByZWNvcmRlZFxuICAvLyBzdGF0ZS4gUmV0aXJlZCBoaXN0b3JpY2FsIGVudGl0aWVzIGFyZSByZW1vdmVkIG9ubHkgYWZ0ZXIgR2FtZVNlc3Npb24gaGFzXG4gIC8vIGF1dGhlbnRpY2F0ZWQgdGhlIG9yaWdpbmFsIGpvdXJuYWwgYW5kIGV4cGxpY2l0bHkgbWlncmF0ZWQgdGhhdCBzYXZlLlxuICBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZCk7XG4gIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3Qod29ybGQsIGlucHV0KTtcbn1cblxuLyoqIEBpbnRlcm5hbCBIaXN0b3JpY2FsIHJlY29uc3RydWN0aW9uIG9yIGV4YWN0IG5ldy1zbmFwc2hvdCByZXN0b3JhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0KHdvcmxkOiBXb3JsZCwgaW5wdXQ6IFdvcmxkU25hcHNob3QpOiB2b2lkIHtcbiAgY29uc3Qgc25hcHNob3QgPSB2YWxpZGF0ZVdvcmxkU25hcHNob3QoaW5wdXQpO1xuICBpZiAoc25hcHNob3QubWFuaWZlc3Quc2VlZCAhPT0gd29ybGQuc2VlZCkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBzZWVkIGRvZXMgbm90IG1hdGNoIHRoZSB3b3JsZCcpO1xuICB3b3JsZC5wYXJhbXMgPSB7XG4gICAgc2l6ZTogc25hcHNob3QubWFuaWZlc3Quc2l6ZSxcbiAgICBjaHVua1NpemU6IHNuYXBzaG90Lm1hbmlmZXN0LmNodW5rU2l6ZSxcbiAgICB5TWluOiBzbmFwc2hvdC5tYW5pZmVzdC55TWluLFxuICAgIHlNYXg6IHNuYXBzaG90Lm1hbmlmZXN0LnlNYXgsXG4gICAgc2VhTGV2ZWw6IHNuYXBzaG90Lm1hbmlmZXN0LnNlYUxldmVsLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHNuYXBzaG90Lm1hbmlmZXN0LmdlbmVyYXRvclZlcnNpb24sXG4gIH07XG4gIHdvcmxkLmNodW5rcy5jbGVhcigpO1xuICB3b3JsZC5lbnRpdGllcy5jbGVhcigpO1xuICB3b3JsZC5lbnRpdHlDaHVua3MuY2xlYXIoKTtcbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5jbGVhcigpO1xuICB3b3JsZC5lbnRpdHlSZW1vdmFscy5jbGVhcigpO1xuICB3b3JsZC5zdHJ1Y3R1cmVzLmNsZWFyKCk7XG4gIHdvcmxkLmVkaXRzLmNsZWFyKCk7XG4gIHdvcmxkLmludmVudG9yeSA9IHsgLi4uc25hcHNob3QuaW52ZW50b3J5IH07XG4gIHdvcmxkLmxpZmUgPSBzbmFwc2hvdC5zY2hlbWEgPT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BID8gY3JlYXRlTGlmZVN0YXRlKCkgOiB1bmRlZmluZWQ7XG4gIGlmICh3b3JsZC5saWZlICYmIHNuYXBzaG90LnNjaGVtYSA9PT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEpIHtcbiAgICB3b3JsZC5saWZlLnRpY2sgPSBzbmFwc2hvdC50aWNrO1xuICAgIGZvciAoY29uc3QgcyBvZiBzbmFwc2hvdC5zdG9ja3BpbGVzKSB3b3JsZC5saWZlLnN0b2NrcGlsZXMuc2V0KHMuaWQsIHsgLi4ucywgaW52ZW50b3J5OiB7IC4uLnMuaW52ZW50b3J5IH0gfSk7XG4gICAgZm9yIChjb25zdCBqIG9mIHNuYXBzaG90LmpvYnMpIHdvcmxkLmxpZmUuam9icy5zZXQoai5pZCwgeyAuLi5qIH0pO1xuICAgIGZvciAoY29uc3QgYyBvZiBzbmFwc2hvdC5jcm9wcykgd29ybGQubGlmZS5jcm9wcy5zZXQoYy5pZCwgeyAuLi5jIH0pO1xuICB9XG4gIHdvcmxkLmRpcnR5LmNsZWFyKCk7XG4gIHdvcmxkLnNpdGVzID0gW107XG4gIHdvcmxkLnN0YXRzID0ge1xuICAgIGNodW5rc0dlbmVyYXRlZDogMCwgY2h1bmtzRXZpY3RlZDogMCwgdm94ZWxzRmlsbGVkOiAwLCBnZW5lcmF0aW9uTXM6IDAsXG4gICAgZW50aXRpZXM6IHNuYXBzaG90LmVudGl0aWVzLmxlbmd0aCwgdHJlZXM6IDAsIHBpbmtUcmVlczogMCwgcGlua092ZXJmbG93OiAwLFxuICB9O1xuICB3b3JsZC5yZXZpc2lvbiA9IHNuYXBzaG90LnJldmlzaW9uO1xuICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHNuYXBzaG90LmF1dGhvcmVkUGxhY2VkO1xuICBmb3IgKGNvbnN0IGtleSBvZiBzbmFwc2hvdC5lbnRpdHlDaHVua3MpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG4gIC8vIEFwcGx5IGR1cmFibGUgdm94ZWwgZWRpdHMgYmVmb3JlIGFueSBhdXRob3JlZC1zaXRlIHF1ZXJ5IGNhbiBnZW5lcmF0ZSBhXG4gIC8vIGNodW5rLiBPdGhlcndpc2UgdGhvc2UgY2h1bmtzIGNhY2hlIHRoZSB1bmVkaXRlZCBiYXNlIHRlcnJhaW4gcGVybWFuZW50bHkuXG4gIGZvciAoY29uc3QgZGVsdGEgb2Ygc25hcHNob3QuZWRpdHMpIHtcbiAgICB3b3JsZC5lZGl0cy5zZXQoZGVsdGEuY2h1bmssIG5ldyBNYXAoZGVsdGEuY2VsbHMubWFwKChlKSA9PiBbZS5pLCBlLm0gYXMgTWF0SWRdKSkpO1xuICB9XG4gIG1hcmtFZGl0c0NoYW5nZWQod29ybGQpO1xuICAvLyBSZWNyZWF0ZSBhdXRob3JlZCBzaXRlIHJlY29yZHMuIFN1cHByZXNzIHRoZWlyIGVudGl0eSBwbGFjZW1lbnQgc28gdGhlXG4gIC8vIGV4YWN0IHNhdmVkIGVudGl0eSByZWNvcmRzIGJlbG93IGNhbm5vdCBiZSBhZmZlY3RlZCBieSBhIG1vZGlmaWVkIGNodW5rLlxuICBpZiAod29ybGQuYXV0aG9yZWRQbGFjZWQpIHtcbiAgICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IGZhbHNlO1xuICAgIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gICAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSB0cnVlO1xuICB9XG4gIC8vIEF1dGhvcmVkIHBsYWNlbWVudCBkZXJpdmVzIHNpdGUvZW50aXR5IHNjYWZmb2xkaW5nIGFuZCBtYXkgYWR2YW5jZSB0aGVcbiAgLy8gcmV2aXNpb24uIFRoZSBzYXZlZCByZXZpc2lvbiBpcyByZXN0b3JlZCBvbmx5IGFmdGVyIHRoYXQgZGVyaXZlZCB3b3JrLlxuICB3b3JsZC5yZXZpc2lvbiA9IHNuYXBzaG90LnJldmlzaW9uO1xuICAvLyBUb21ic3RvbmVzIG11c3QgZXhpc3QgYmVmb3JlIGFueSBjaGFuZ2VkIGNodW5rIHJlZ2VuZXJhdGVzIGl0cyBlbnRpdGllcy5cbiAgZm9yIChjb25zdCBpZCBvZiBzbmFwc2hvdC5lbnRpdHlSZW1vdmFscykgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGlkKTtcbiAgLy8gUmVwbGFjZSBnZW5lcmF0ZWQgZW50aXRpZXMgd2l0aCB0aGUgZXhhY3Qgc2F2ZWQgcmVjb3JkcywgaW5jbHVkaW5nXG4gIC8vIGhhcnZlc3RlZC9yZW1vdmVkIG9uZXMuXG4gIHdvcmxkLmVudGl0aWVzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eUNodW5rcy5jbGVhcigpO1xuICAvLyBJbnN0YWxsIHBlcnNpc3RlZCBlbnRpdHkgZGVsdGFzIGRpcmVjdGx5LiBUaGlzIGlzIHJlY29uc3RydWN0aW9uLCBub3QgYVxuICAvLyBjb21tYW5kOiByZW1vdmVFbnRpdHkgd291bGQgY3JlYXRlIGZyZXNoIHRvbWJzdG9uZXMgYW5kIGFkdmFuY2UgcmV2aXNpb24uXG4gIGZvciAoY29uc3Qga2V5IG9mIHNuYXBzaG90LmVudGl0eUNodW5rcykge1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYHNuYXBzaG90IHJlZmVyZW5jZXMgdW5hdmFpbGFibGUgY2h1bmsgJHtrZXl9YCk7XG4gICAgY29uc3Qgc2F2ZWQgPSBuZXcgU2V0KHNuYXBzaG90LmVudGl0aWVzLmZpbHRlcigoZSkgPT4gZS5jaHVuayA9PT0ga2V5KS5tYXAoKGUpID0+IGUuaWQpKTtcbiAgICAvLyBBdXRob3JlZCBlbnRpdGllcyBmb3IgdGhlIHNhbWUgY2h1bmsgc3Vydml2ZSBhbG9uZ3NpZGUgbmF0dXJhbCBkZWx0YXMuXG4gICAgY29uc3QgaWRzID0gKHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXSkuZmlsdGVyKChpZCkgPT4ge1xuICAgICAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIHJldHVybiAhaWQuc3RhcnRzV2l0aCgnZTonKSAmJiAhIWVudGl0eVxuICAgICAgICAmJiAoIWlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgfHwgaXNTdG9uZVJlcGxheSh3b3JsZCkpO1xuICAgIH0pO1xuICAgIGZvciAoY29uc3QgaWQgb2YgWy4uLndvcmxkLmVudGl0aWVzLmtleXMoKV0pIHtcbiAgICAgIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoZW50aXR5Py5jaHVuayA9PT0ga2V5ICYmICFlbnRpdHkuYXV0aG9yZWQgJiYgIXNhdmVkLmhhcyhpZCkpIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgaWQgb2Ygc2F2ZWQpIGlmICghaWRzLmluY2x1ZGVzKGlkKSkgaWRzLnB1c2goaWQpO1xuICAgIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMpO1xuICB9XG4gIGZvciAoY29uc3QgZSBvZiBzbmFwc2hvdC5lbnRpdGllcykge1xuICAgIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBjbG9uZUVudGl0eShlKSk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgb2Ygc25hcHNob3QuZW50aXR5Q2h1bmtzKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIHNuYXBzaG90LnN0cnVjdHVyZXMpIHdvcmxkLnN0cnVjdHVyZXMuc2V0KHMuaWQsIGNsb25lU3RydWN0dXJlKHMpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkRnJvbVNuYXBzaG90KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90KTogV29ybGQge1xuICBjb25zdCB2YWxpZCA9IHZhbGlkYXRlV29ybGRTbmFwc2hvdChzbmFwc2hvdCk7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQodmFsaWQubWFuaWZlc3Quc2VlZCwgdmFsaWQubWFuaWZlc3QuZ2VuZXJhdG9yVmVyc2lvbik7XG4gIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkLCB2YWxpZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuLyoqIFJhdyBvbGQgc3RhdGUgaXMgdXNlZCBvbmx5IHdoaWxlIHZhbGlkYXRpbmcgYSByZWNvcmRlZCBhY2NlcHRlZCBqb3VybmFsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhpc3RvcmljYWxXb3JsZEZyb21TbmFwc2hvdChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCk6IFdvcmxkIHtcbiAgY29uc3QgdmFsaWQgPSB2YWxpZGF0ZVdvcmxkU25hcHNob3Qoc25hcHNob3QpO1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHZhbGlkLm1hbmlmZXN0LnNlZWQpO1xuICBlbmFibGVTdG9uZVJlcGxheSh3b3JsZCk7XG4gIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3Qod29ybGQsIHZhbGlkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuIiwgIi8vIFJlbmRlciBsYXllciBcdTIwMTQgY2h1bmtlZCAzRCB2b3hlbCBtZXNoZXIgKyBzdHJlYW1pbmcgKyBtYWNybyBMT0QuXG4vL1xuLy8gVGhlIHZpc2libGUgc3VyZmFjZSBpcyBkZXJpdmVkIGZyb20gdGhlIHNpbSdzIG9jY3VwYW5jeS9tYXRlcmlhbCB2b2x1bWUuXG4vLyBOZWFyIGNodW5rcyBhcmUgbWVzaGVkIGF0IDEgbSB3aXRoIGdyZWVkeSBmYWNlIG1lcmdpbmc7IHRoZSBmYXIgbGFuZHNjYXBlIGlzXG4vLyBhbiA4IG0gKHdvcmxkKSAvIDggbSAobWFwKSBtYWNybyBMT0Qgc2FtcGxlZCBmcm9tIHRoZSBzYW1lIGRldGVybWluaXN0aWNcbi8vIGdlbmVyYXRvci4gV2F0ZXIgaXMgYSBzaW5nbGUgc2VhLWxldmVsIHN1cmZhY2UgZGVyaXZlZCBmcm9tIHRoZSBzZWFiZWQgZGVwdGguXG4vL1xuLy8gTm8gYXByb24sIGhvcml6b24gcmluZyBvciBmb3VuZGF0aW9uIHNraXJ0OiB0aGUgd29ybGQgZWRnZSBpcyBvY2VhbiwgYW5kIHRoZVxuLy8gb2NlYW4gc3VyZmFjZSBleHRlbmRzIGZhciBiZXlvbmQgdGhlIDIwNDggbSBwbGF5YWJsZSBpc2xhbmQuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQgeyBtZXNoQ2h1bmtXYXRlciwgaW5zdGFsbEZhcldhdGVySG9sZSwgd2F0ZXJUaW1lIH0gZnJvbSAnLi93YXRlcic7XG5pbXBvcnQge1xuICBXb3JsZCwgVm94ZWxDaHVuaywgTWF0SWQsIFN1cmZhY2VTYW1wbGUsIEdFTkVSQVRPUl9WRVJTSU9OLFxuICBXT1JMRF9TSVpFLCBIQUxGLCBDSFVOS19TSVpFLCBDSFVOS1NfUEVSX1NJREUsIENIVU5LX0FSRUEsIFdPUkxEX0hFSUdIVCxcbiAgWV9NSU4sIFlfTUFYLCBTRUFfTEVWRUwsIE1BVCwgaXNPcGFxdWUsXG4gIGNodW5rS2V5LCBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWiwgbG9jYWxJbmRleCwgeVRvSW5kZXgsXG4gIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIHdvcmxkVG9Mb2NhbFgsIHdvcmxkVG9Mb2NhbFosXG4gIGdldFZveGVsLCBlbnN1cmVDaHVuaywgZXZpY3RDaHVuaywgaGFzaDJpLCBmYm0yLFxuICBlZGl0VmVyc2lvbiwgYmFzZUhlaWdodEF0LCBiYXNlVG9wTWF0ZXJpYWxGb3IsXG59IGZyb20gJy4uL3NpbS93b3JsZCc7XG5cbmNvbnN0IE0gPSBwYWxldHRlLm1hdGVyaWFscyBhcyBSZWNvcmQ8c3RyaW5nLCB7IGhleDogc3RyaW5nIH0+O1xuY29uc3QgSCA9IChrOiBzdHJpbmcpID0+IE1ba10uaGV4O1xuXG5jb25zdCBjb2xvckNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFRIUkVFLkNvbG9yPigpO1xuZnVuY3Rpb24gYyhoZXg6IHN0cmluZyk6IFRIUkVFLkNvbG9yIHtcbiAgbGV0IG91dCA9IGNvbG9yQ2FjaGUuZ2V0KGhleCk7XG4gIGlmICghb3V0KSB7IG91dCA9IG5ldyBUSFJFRS5Db2xvcihoZXgpOyBjb2xvckNhY2hlLnNldChoZXgsIG91dCk7IH1cbiAgcmV0dXJuIG91dDtcbn1cblxuY29uc3QgQ09MID0ge1xuICBncmFzc1RvcDogW2MoSCgnZ3Jhc3NfdG9wJykpLCBjKEgoJ2dyYXNzX2hpZ2gnKSksIGMoSCgnZ3Jhc3NfcGVhaycpKV0sXG4gIGdyYXNzQ2FwOiBjKEgoJ2dyYXNzX2NhcCcpKSxcbiAgc29pbDogYyhIKCdzdHJhdGFfb2NocmUnKSkuY2xvbmUoKS5tdWx0aXBseVNjYWxhcigwLjc4KSxcbiAgb2NocmU6IGMoSCgnc3RyYXRhX29jaHJlJykpLFxuICBydXN0OiBjKEgoJ3N0cmF0YV9ydXN0JykpLFxuICBzdG9uZVRvcDogYyhIKCdzdG9uZV90b3AnKSksXG4gIHN0b25lQTogYyhIKCdzdG9uZV9ib2R5X2EnKSksXG4gIHN0b25lQjogYyhIKCdzdG9uZV9ib2R5X2InKSksXG4gIHN0b25lU2hhZGU6IGMoSCgnc3RvbmVfc2hhZGUnKSksXG4gIHNhbmQ6IGMoSCgnc2FuZCcpKSxcbiAgZ3JhdmVsOiBjKEgoJ3N0b25lX2JvZHlfYicpKS5jbG9uZSgpLmxlcnAoYyhIKCdzYW5kJykpLCAwLjM1KSxcbiAgb3JlOiBjKEgoJ29yZV9jcnlzdGFsJykpLFxuICBtb3NzOiBjKEgoJ2dyYXNzX2NhcCcpKS5jbG9uZSgpLmxlcnAoYyhIKCdzdG9uZV9ib2R5X2InKSksIDAuMzUpLFxuICBzbm93OiBjKEgoJ3Nub3cnKSksXG4gIHNub3dTaGFkZTogYyhIKCdzbm93JykpLmNsb25lKCkubGVycChjKEgoJ3N0b25lX3NoYWRlJykpLCAwLjM1KSxcbiAgd2F0ZXJSaW06IGMoSCgnd2F0ZXJfcmltJykpLFxuICB3YXRlclNoYWxsb3c6IGMoSCgnd2F0ZXJfc2hhbGxvdycpKSxcbiAgd2F0ZXJNaWQ6IGMoSCgnd2F0ZXJfbWlkJykpLFxuICB3YXRlckRlZXA6IGMoSCgnd2F0ZXJfZGVlcCcpKSxcbn07XG5cbmNvbnN0IFNIQURFID0gWzAuOTAsIDAuOTYsIDEuMCwgMS4wNF07XG5cbi8vIEtlZXAgYSBzbWFsbCByb2xsaW5nIHdpbmRvdyBvZiBidWlsZCB0aW1pbmdzIGZvciB0aGUgcGVyZm9ybWFuY2UgZXZpZGVuY2UuXG4vLyBUaGVzZSBhcmUgaW5zdHJ1bWVudGF0aW9uLCBub3Qgc2ltdWxhdGlvbiBzdGF0ZS5cbmNvbnN0IE1BWF9QRVJGX1NBTVBMRVMgPSAxMjg7XG5mdW5jdGlvbiByZWNvcmRTYW1wbGUoc2FtcGxlczogbnVtYmVyW10sIG1zOiBudW1iZXIpOiB2b2lkIHtcbiAgc2FtcGxlcy5wdXNoKG1zKTtcbiAgaWYgKHNhbXBsZXMubGVuZ3RoID4gTUFYX1BFUkZfU0FNUExFUykgc2FtcGxlcy5zaGlmdCgpO1xufVxuZnVuY3Rpb24gcGVyY2VudGlsZShzYW1wbGVzOiBudW1iZXJbXSwgcDogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHNhbXBsZXMubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcbiAgY29uc3Qgc29ydGVkID0gWy4uLnNhbXBsZXNdLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbiAgY29uc3QgaSA9IE1hdGgubWluKHNvcnRlZC5sZW5ndGggLSAxLCBNYXRoLm1heCgwLCBNYXRoLmNlaWwocCAqIHNvcnRlZC5sZW5ndGgpIC0gMSkpO1xuICByZXR1cm4gTWF0aC5yb3VuZChzb3J0ZWRbaV0gKiAxMDApIC8gMTAwO1xufVxuXG5mdW5jdGlvbiBoZWlnaHRCYW5kKHk6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiB5ID49IDQ1ID8gMiA6IHkgPj0gMTggPyAxIDogMDtcbn1cbmZ1bmN0aW9uIHN0b25lVG9uZSh5OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKCh5ICsgNjQpID4+IDMpICYgMTtcbn1cbmZ1bmN0aW9uIHNoYWRlQXQoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgc3ggPSBNYXRoLmZsb29yKHggLyAyKSArIE1hdGguZmxvb3IoeSAvIDMpICogMTc7XG4gIGNvbnN0IHN6ID0gTWF0aC5mbG9vcih6IC8gMik7XG4gIHJldHVybiBNYXRoLmZsb29yKGhhc2gyaShzeCwgc3osIHNlZWQgKyAzMDApICogNCk7XG59XG5cbmZ1bmN0aW9uIGtleUZvcihtYXQ6IG51bWJlciwgdmFyaWFudDogbnVtYmVyLCBzaGFkZTogbnVtYmVyLCBheGlzOiBudW1iZXIsIGRpcjogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIChtYXQgJiAxNSkgfCAoKHZhcmlhbnQgJiAxNSkgPDwgNCkgfCAoKHNoYWRlICYgMykgPDwgOCkgfCAoKGF4aXMgJiAzKSA8PCAxMCkgfCAoKGRpciA+IDAgPyAxIDogMCkgPDwgMTIpO1xufVxuXG5jb25zdCBmYWNlQ29sb3JDYWNoZSA9IG5ldyBNYXA8bnVtYmVyLCBUSFJFRS5Db2xvcj4oKTtcblxuZnVuY3Rpb24gY29sb3JGb3JLZXkoa2V5OiBudW1iZXIpOiBUSFJFRS5Db2xvciB7XG4gIGNvbnN0IGNhY2hlZCA9IGZhY2VDb2xvckNhY2hlLmdldChrZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBtYXQgPSBrZXkgJiAxNTtcbiAgY29uc3QgdmFyaWFudCA9IChrZXkgPj4gNCkgJiAxNTtcbiAgY29uc3Qgc2hhZGUgPSAoa2V5ID4+IDgpICYgMztcbiAgY29uc3QgYXhpcyA9IChrZXkgPj4gMTApICYgMztcbiAgY29uc3QgZGlyID0gKGtleSA+PiAxMikgJiAxO1xuICBsZXQgY29sb3I6IFRIUkVFLkNvbG9yO1xuXG4gIGlmIChheGlzID09PSAxICYmIGRpciA9PT0gMSkge1xuICAgIGNvbnN0IGhiID0gTWF0aC5taW4oMiwgdmFyaWFudCAmIDMpO1xuICAgIGlmIChtYXQgPT09IE1BVC5HUkFTUykgY29sb3IgPSBDT0wuZ3Jhc3NUb3BbaGJdO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULlNBTkQpIGNvbG9yID0gQ09MLnNhbmQ7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuR1JBVkVMKSBjb2xvciA9IENPTC5ncmF2ZWw7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuU09JTCkgY29sb3IgPSBDT0wub2NocmU7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuT1JFKSBjb2xvciA9IENPTC5vcmU7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuTU9TUykgY29sb3IgPSBDT0wubW9zcztcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5TTk9XKSBjb2xvciA9IENPTC5zbm93O1xuICAgIGVsc2UgY29sb3IgPSBDT0wuc3RvbmVUb3A7XG4gIH0gZWxzZSBpZiAoYXhpcyA9PT0gMSAmJiBkaXIgPT09IDApIHtcbiAgICBjb2xvciA9IENPTC5zdG9uZVNoYWRlO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGRlcHRoID0gdmFyaWFudCAmIDc7XG4gICAgY29uc3QgdG9uZSA9ICh2YXJpYW50ID4+IDMpICYgMTtcbiAgICBjb25zdCBib2R5ID0gdG9uZSA/IENPTC5zdG9uZUIgOiBDT0wuc3RvbmVBO1xuICAgIGlmIChtYXQgPT09IE1BVC5HUkFTUyB8fCBtYXQgPT09IE1BVC5NT1NTKSB7XG4gICAgICBpZiAoZGVwdGggPT09IDApIGNvbG9yID0gbWF0ID09PSBNQVQuTU9TUyA/IENPTC5tb3NzIDogQ09MLmdyYXNzQ2FwO1xuICAgICAgZWxzZSBpZiAoZGVwdGggPD0gMikgY29sb3IgPSBDT0wuc29pbDtcbiAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAzKSBjb2xvciA9IENPTC5ydXN0O1xuICAgICAgZWxzZSBjb2xvciA9IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TT0lMKSB7XG4gICAgICBjb2xvciA9IGRlcHRoIDw9IDEgPyBDT0wuc29pbCA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TQU5EKSB7XG4gICAgICBjb2xvciA9IGRlcHRoIDw9IDEgPyBDT0wuc2FuZCA6IGRlcHRoID09PSAyID8gQ09MLm9jaHJlIDogYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULkdSQVZFTCkge1xuICAgICAgY29sb3IgPSBkZXB0aCA8PSAxID8gQ09MLmdyYXZlbCA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5PUkUpIHtcbiAgICAgIGNvbG9yID0gQ09MLm9yZTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULlNOT1cpIHtcbiAgICAgIGNvbG9yID0gZGVwdGggPT09IDAgPyBDT0wuc25vd1NoYWRlIDogYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULkJFRFJPQ0spIHtcbiAgICAgIGNvbG9yID0gQ09MLnN0b25lU2hhZGU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbG9yID0gYm9keTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBvdXQgPSBjb2xvci5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKFNIQURFW3NoYWRlXSk7XG4gIGZhY2VDb2xvckNhY2hlLnNldChrZXksIG91dCk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmNvbnN0IHRlcnJhaW5NYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgdmVydGV4Q29sb3JzOiB0cnVlLFxuICBzaWRlOiBUSFJFRS5Gcm9udFNpZGUsXG59KTtcbnRlcnJhaW5NYXRlcmlhbC5vbkJlZm9yZUNvbXBpbGUgPSAoc2hhZGVyKSA9PiB7XG4gIHNoYWRlci52ZXJ0ZXhTaGFkZXIgPSBzaGFkZXIudmVydGV4U2hhZGVyXG4gICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgJyNpbmNsdWRlIDxjb21tb24+XFxuYXR0cmlidXRlIGZsb2F0IGFNYXQ7XFxudmFyeWluZyB2ZWMzIHZXUG9zO1xcbnZhcnlpbmcgdmVjMyB2V05ybTtcXG52YXJ5aW5nIGZsb2F0IHZNYXQ7JylcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD4nLCAnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD5cXG52V1BvcyA9IChtb2RlbE1hdHJpeCAqIHZlYzQodHJhbnNmb3JtZWQsIDEuMCkpLnh5ejtcXG52V05ybSA9IG5vcm1hbGl6ZShtYXQzKG1vZGVsTWF0cml4KSAqIG9iamVjdE5vcm1hbCk7XFxudk1hdCA9IGFNYXQ7Jyk7XG4gIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsIGAjaW5jbHVkZSA8Y29tbW9uPlxudmFyeWluZyB2ZWMzIHZXUG9zO1xudmFyeWluZyB2ZWMzIHZXTnJtO1xudmFyeWluZyBmbG9hdCB2TWF0O1xuZmxvYXQgaDIxKHZlYzIgcCkgeyByZXR1cm4gZnJhY3Qoc2luKGRvdChwLCB2ZWMyKDEyNy4xLCAzMTEuNykpKSAqIDQzNzU4LjU0NTMxMjMpOyB9XG5mbG9hdCB2bjIodmVjMiBwKSB7XG4gIHZlYzIgaSA9IGZsb29yKHApOyB2ZWMyIGYgPSBmcmFjdChwKTsgZiA9IGYgKiBmICogKDMuMCAtIDIuMCAqIGYpO1xuICByZXR1cm4gbWl4KG1peChoMjEoaSksIGgyMShpICsgdmVjMigxLjAsIDAuMCkpLCBmLngpLFxuICAgICAgICAgICAgIG1peChoMjEoaSArIHZlYzIoMC4wLCAxLjApKSwgaDIxKGkgKyB2ZWMyKDEuMCwgMS4wKSksIGYueCksIGYueSk7XG59YClcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbG9yX2ZyYWdtZW50PicsIGAjaW5jbHVkZSA8Y29sb3JfZnJhZ21lbnQ+XG57XG4gIHZlYzMgbiA9IG5vcm1hbGl6ZSh2V05ybSk7XG4gIGZsb2F0IHZlcnQgPSAxLjAgLSBzbW9vdGhzdGVwKDAuMzUsIDAuNzAsIGFicyhuLnkpKTtcbiAgZmxvYXQgaXNHcmFzcyA9ICgodk1hdCA+IDAuNSAmJiB2TWF0IDwgMS41KSB8fCAodk1hdCA+IDguNSAmJiB2TWF0IDwgOS41KSkgPyAxLjAgOiAwLjA7XG4gIGZsb2F0IGlzU3RvbmUgPSAoKHZNYXQgPiA0LjUgJiYgdk1hdCA8IDYuNSkgfHwgKHZNYXQgPiA3LjUgJiYgdk1hdCA8IDguNSkpID8gMS4wIDogMC4wO1xuXG4gIGZsb2F0IGhvcml6ID0gYWJzKG4ueCkgPiBhYnMobi56KSA/IHZXUG9zLnogOiB2V1Bvcy54O1xuICBmbG9hdCByb3cgPSBmbG9vcih2V1Bvcy55KTtcbiAgZmxvYXQgY29sID0gZmxvb3IoaG9yaXopO1xuICBmbG9hdCBoID0gaDIxKHZlYzIoY29sLCByb3cpKTtcbiAgdmVjMiBmID0gdmVjMihmcmFjdChob3JpeiksIGZyYWN0KHZXUG9zLnkpKTtcbiAgZmxvYXQgam9pbnQgPSBzbW9vdGhzdGVwKDAuMCwgMC4wNTUsIG1pbihmLngsIDEuMCAtIGYueCkpXG4gICAgICAgICAgICAgICogc21vb3Roc3RlcCgwLjAsIDAuMDUwLCBtaW4oZi55LCAxLjAgLSBmLnkpKTtcbiAgdmVjMyBzdG9uZSA9IG1peCh2ZWMzKDAuNjIsIDAuNjIsIDAuNTgpLCB2ZWMzKDEuMDQsIDEuMDIsIDAuOTUpLCBoKTtcbiAgc3RvbmUgKj0gbWl4KDAuOTAsIDEuMCwgam9pbnQpO1xuICBzdG9uZSAqPSBtaXgoMC45MywgMS4wLCBzbW9vdGhzdGVwKDAuMCwgMC4zMCwgZi55KSk7XG4gIGRpZmZ1c2VDb2xvci5yZ2IgKj0gbWl4KHZlYzMoMS4wKSwgc3RvbmUsIHZlcnQgKiBpc1N0b25lKTtcblxuICBmbG9hdCBneSA9IHNtb290aHN0ZXAoMC40NSwgMC44OCwgYWJzKG4ueSkpO1xuICBmbG9hdCBnMSA9IHZuMih2V1Bvcy54eiAqIDEuMzUpO1xuICBmbG9hdCBnMiA9IHZuMih2V1Bvcy54eiAqIDAuMTEpO1xuICB2ZWMzIGdyYXNzID0gbWl4KHZlYzMoMC44MiwgMC44NiwgMC43MiksIHZlYzMoMS4wNiwgMS4wNCwgMC45OCksIGcxICogMC40MiArIGcyICogMC40NiArIHZuMih2V1Bvcy54eiAqIDQuMykgKiAwLjEyKTtcbiAgZmxvYXQgY2VsbCA9IGgyMShmbG9vcih2V1Bvcy54eikgKyAxNy4wKTtcbiAgZ3Jhc3MgKj0gMC45NSArIDAuMTAgKiBjZWxsO1xuICBkaWZmdXNlQ29sb3IucmdiICo9IG1peCh2ZWMzKDEuMCksIGdyYXNzLCBneSAqIGlzR3Jhc3MpO1xufWApO1xufTtcblxuaW50ZXJmYWNlIE1lc2hSZXN1bHQgeyBnZW9tZXRyeTogVEhSRUUuQnVmZmVyR2VvbWV0cnk7IHRyaWFuZ2xlczogbnVtYmVyOyB9XG5cbmZ1bmN0aW9uIHBvc0Zyb20oYXhpczogbnVtYmVyLCBzbGljZTogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlcik6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB7XG4gIGlmIChheGlzID09PSAwKSByZXR1cm4gW3NsaWNlLCBpLCBqXTtcbiAgaWYgKGF4aXMgPT09IDEpIHJldHVybiBbaiwgc2xpY2UsIGldO1xuICByZXR1cm4gW2ksIGosIHNsaWNlXTtcbn1cblxuLyoqXG4gKiBHcmVlZHkgM0QgZmFjZSBtZXNoZXIuIEEgZmFjZSBpcyBlbWl0dGVkIHdoZW4gYW4gb3BhcXVlIHZveGVsIHRvdWNoZXMgYVxuICogbm9uLW9wYXF1ZSBjZWxsIChhaXIgb3Igd2F0ZXIpLiBXYXRlciBpdHNlbGYgaXMgcmVuZGVyZWQgYnkgdGhlIHNlYS1sZXZlbFxuICogc3VyZmFjZSwgbm90IGFzIGEgdm94ZWwgbWVzaC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lc2hDaHVuayh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogTWVzaFJlc3VsdCB7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBkYXRhID0gY2h1bmsuZGF0YTtcbiAgY29uc3Qgc2FtcGxlID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGlmICh4ID49IDAgJiYgeCA8IENIVU5LX1NJWkUgJiYgeiA+PSAwICYmIHogPCBDSFVOS19TSVpFICYmIHkgPj0gMCAmJiB5IDwgV09STERfSEVJR0hUKSB7XG4gICAgICByZXR1cm4gZGF0YVtsb2NhbEluZGV4KHgsIHksIHopXTtcbiAgICB9XG4gICAgcmV0dXJuIGdldFZveGVsKHdvcmxkLCBveCArIHgsIFlfTUlOICsgeSwgb3ogKyB6KTtcbiAgfTtcblxuICBjb25zdCBwb3NpdGlvbnM6IG51bWJlcltdID0gW107XG4gIGNvbnN0IG5vcm1hbHM6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGNvbG9yczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgbWF0czogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgaW5kaWNlczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgZGltcyA9IFtDSFVOS19TSVpFLCBXT1JMRF9IRUlHSFQsIENIVU5LX1NJWkVdO1xuXG4gIGNvbnN0IGVtaXRRdWFkID0gKFxuICAgIGF4aXM6IG51bWJlciwgZGlyOiBudW1iZXIsIHNsaWNlOiBudW1iZXIsXG4gICAgaTA6IG51bWJlciwgajA6IG51bWJlciwgdzogbnVtYmVyLCBoOiBudW1iZXIsIGtleTogbnVtYmVyLFxuICApID0+IHtcbiAgICAvLyBUaGUgZmFjZSBsaWVzIG9uIHRoZSBib3VuZGFyeSBiZXR3ZWVuIHNsaWNlIGFuZCBzbGljZSsxIGZvciBib3RoXG4gICAgLy8gZGlyZWN0aW9ucy4gVXNpbmcgYHNsaWNlYCBmb3IgbmVnYXRpdmUgZmFjZXMgc2hpZnRlZCBldmVyeSAteC8teS8telxuICAgIC8vIGZhY2Ugb25lIHZveGVsIGludG8gdGhlIGFpciBjZWxsLCBsZWF2aW5nIDEgbSBzbGl0cyBpbiB0aGUgdGVycmFpbi5cbiAgICBjb25zdCBwbGFuZSA9IHNsaWNlICsgMTtcbiAgICBjb25zdCB1MCA9IGkwLCB1MSA9IGkwICsgdywgdjAgPSBqMCwgdjEgPSBqMCArIGg7XG4gICAgbGV0IHA6IG51bWJlcltdW107XG4gICAgaWYgKGF4aXMgPT09IDApIHtcbiAgICAgIGNvbnN0IHggPSBveCArIHBsYW5lLCB5MCA9IFlfTUlOICsgdTAsIHkxID0gWV9NSU4gKyB1MSwgejAgPSBveiArIHYwLCB6MSA9IG96ICsgdjE7XG4gICAgICBwID0gZGlyID4gMFxuICAgICAgICA/IFtbeCwgeTAsIHowXSwgW3gsIHkxLCB6MF0sIFt4LCB5MSwgejFdLCBbeCwgeTAsIHoxXV1cbiAgICAgICAgOiBbW3gsIHkwLCB6MF0sIFt4LCB5MCwgejFdLCBbeCwgeTEsIHoxXSwgW3gsIHkxLCB6MF1dO1xuICAgIH0gZWxzZSBpZiAoYXhpcyA9PT0gMSkge1xuICAgICAgY29uc3QgeSA9IFlfTUlOICsgcGxhbmUsIHowID0gb3ogKyB1MCwgejEgPSBveiArIHUxLCB4MCA9IG94ICsgdjAsIHgxID0gb3ggKyB2MTtcbiAgICAgIHAgPSBkaXIgPiAwXG4gICAgICAgID8gW1t4MCwgeSwgejBdLCBbeDAsIHksIHoxXSwgW3gxLCB5LCB6MV0sIFt4MSwgeSwgejBdXVxuICAgICAgICA6IFtbeDAsIHksIHowXSwgW3gxLCB5LCB6MF0sIFt4MSwgeSwgejFdLCBbeDAsIHksIHoxXV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHogPSBveiArIHBsYW5lLCB4MCA9IG94ICsgdTAsIHgxID0gb3ggKyB1MSwgeTAgPSBZX01JTiArIHYwLCB5MSA9IFlfTUlOICsgdjE7XG4gICAgICBwID0gZGlyID4gMFxuICAgICAgICA/IFtbeDAsIHkwLCB6XSwgW3gxLCB5MCwgel0sIFt4MSwgeTEsIHpdLCBbeDAsIHkxLCB6XV1cbiAgICAgICAgOiBbW3gwLCB5MCwgel0sIFt4MCwgeTEsIHpdLCBbeDEsIHkxLCB6XSwgW3gxLCB5MCwgel1dO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbG9yID0gY29sb3JGb3JLZXkoa2V5KTtcbiAgICBjb25zdCBtYXQgPSBrZXkgJiAxNTtcbiAgICBjb25zdCBueCA9IGF4aXMgPT09IDAgPyBkaXIgOiAwO1xuICAgIGNvbnN0IG55ID0gYXhpcyA9PT0gMSA/IGRpciA6IDA7XG4gICAgY29uc3QgbnogPSBheGlzID09PSAyID8gZGlyIDogMDtcbiAgICBjb25zdCBiYXNlID0gcG9zaXRpb25zLmxlbmd0aCAvIDM7XG4gICAgZm9yIChjb25zdCB2IG9mIHApIHtcbiAgICAgIHBvc2l0aW9ucy5wdXNoKHZbMF0sIHZbMV0sIHZbMl0pO1xuICAgICAgbm9ybWFscy5wdXNoKG54LCBueSwgbnopO1xuICAgICAgY29sb3JzLnB1c2goY29sb3IuciwgY29sb3IuZywgY29sb3IuYik7XG4gICAgICBtYXRzLnB1c2gobWF0KTtcbiAgICB9XG4gICAgaW5kaWNlcy5wdXNoKGJhc2UsIGJhc2UgKyAxLCBiYXNlICsgMiwgYmFzZSwgYmFzZSArIDIsIGJhc2UgKyAzKTtcbiAgfTtcblxuICBmb3IgKGxldCBheGlzID0gMDsgYXhpcyA8IDM7IGF4aXMrKykge1xuICAgIGNvbnN0IHUgPSAoYXhpcyArIDEpICUgMztcbiAgICBjb25zdCB2ID0gKGF4aXMgKyAyKSAlIDM7XG4gICAgY29uc3QgZHUgPSBkaW1zW3VdLCBkdiA9IGRpbXNbdl0sIGRkID0gZGltc1theGlzXTtcbiAgICBjb25zdCBtYXNrID0gbmV3IFVpbnQxNkFycmF5KGR1ICogZHYpO1xuXG4gICAgZm9yIChsZXQgc2xpY2UgPSAtMTsgc2xpY2UgPCBkZDsgc2xpY2UrKykge1xuICAgICAgbWFzay5maWxsKDApO1xuICAgICAgbGV0IGFueSA9IGZhbHNlO1xuXG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGR2OyBqKyspIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkdTsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgW2F4LCBheSwgYXpdID0gcG9zRnJvbShheGlzLCBzbGljZSwgaSwgaik7XG4gICAgICAgICAgY29uc3QgW2J4LCBieSwgYnpdID0gcG9zRnJvbShheGlzLCBzbGljZSArIDEsIGksIGopO1xuICAgICAgICAgIGNvbnN0IGEgPSBzYW1wbGUoYXgsIGF5LCBheik7XG4gICAgICAgICAgY29uc3QgYiA9IHNhbXBsZShieCwgYnksIGJ6KTtcbiAgICAgICAgICBjb25zdCBhbyA9IGlzT3BhcXVlKGEpLCBibyA9IGlzT3BhcXVlKGIpO1xuICAgICAgICAgIGlmIChhbyA9PT0gYm8pIGNvbnRpbnVlO1xuXG4gICAgICAgICAgLy8gT25seSB0aGUgY2h1bmsgdGhhdCBvd25zIHRoZSBzb2xpZCB2b3hlbCBlbWl0cyBpdHMgZmFjZS4gQXQgdGhlXG4gICAgICAgICAgLy8gc2xpY2UgLTEvZGQgYm91bmRhcnkgdGhlIG5laWdoYm91ciBjaHVuayBvd25zIHRoZSBvdXR3YXJkIGZhY2UuXG4gICAgICAgICAgY29uc3QgYUluc2lkZSA9IHNsaWNlID49IDAgJiYgc2xpY2UgPCBkZDtcbiAgICAgICAgICBjb25zdCBiSW5zaWRlID0gc2xpY2UgKyAxID49IDAgJiYgc2xpY2UgKyAxIDwgZGQ7XG4gICAgICAgICAgbGV0IHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG1hdDogbnVtYmVyLCBkaXI6IG51bWJlcjtcbiAgICAgICAgICBpZiAoYW8gJiYgIWJvICYmIGFJbnNpZGUpIHsgeCA9IGF4OyB5ID0gYXk7IHogPSBhejsgbWF0ID0gYTsgZGlyID0gMTsgfVxuICAgICAgICAgIGVsc2UgaWYgKGJvICYmICFhbyAmJiBiSW5zaWRlKSB7IHggPSBieDsgeSA9IGJ5OyB6ID0gYno7IG1hdCA9IGI7IGRpciA9IC0xOyB9XG4gICAgICAgICAgZWxzZSBjb250aW51ZTtcblxuICAgICAgICAgIGNvbnN0IHd5ID0gWV9NSU4gKyB5O1xuICAgICAgICAgIGNvbnN0IHN1cmZhY2VZID0gY2h1bmsuaGVpZ2h0c1t6ICogQ0hVTktfU0laRSArIHhdICsgWV9NSU47XG4gICAgICAgICAgY29uc3QgZGVwdGggPSBzdXJmYWNlWSAtICh3eSArIDEpO1xuICAgICAgICAgIGxldCB2YXJpYW50OiBudW1iZXI7XG4gICAgICAgICAgaWYgKGF4aXMgPT09IDEgJiYgZGlyID4gMCkgdmFyaWFudCA9IGhlaWdodEJhbmQod3kpO1xuICAgICAgICAgIGVsc2UgaWYgKGF4aXMgPT09IDEgJiYgZGlyIDwgMCkgdmFyaWFudCA9IDE1O1xuICAgICAgICAgIGVsc2UgdmFyaWFudCA9IChNYXRoLm1heCgwLCBNYXRoLm1pbig3LCBkZXB0aCkpICYgNykgfCAoc3RvbmVUb25lKHd5KSA8PCAzKTtcblxuICAgICAgICAgIGNvbnN0IHNoYWRlID0gc2hhZGVBdChveCArIHgsIHd5LCBveiArIHosIHdvcmxkLnNlZWQpO1xuICAgICAgICAgIG1hc2tbaiAqIGR1ICsgaV0gPSBrZXlGb3IobWF0LCB2YXJpYW50LCBzaGFkZSwgYXhpcywgZGlyKTtcbiAgICAgICAgICBhbnkgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghYW55KSBjb250aW51ZTtcblxuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBkdjsgaisrKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZHU7KSB7XG4gICAgICAgICAgY29uc3Qga2V5ID0gbWFza1tqICogZHUgKyBpXTtcbiAgICAgICAgICBpZiAoIWtleSkgeyBpKys7IGNvbnRpbnVlOyB9XG5cbiAgICAgICAgICBsZXQgdyA9IDE7XG4gICAgICAgICAgd2hpbGUgKGkgKyB3IDwgZHUgJiYgbWFza1tqICogZHUgKyBpICsgd10gPT09IGtleSkgdysrO1xuXG4gICAgICAgICAgbGV0IGggPSAxO1xuICAgICAgICAgIG91dGVyOiB3aGlsZSAoaiArIGggPCBkdikge1xuICAgICAgICAgICAgZm9yIChsZXQgayA9IDA7IGsgPCB3OyBrKyspIHtcbiAgICAgICAgICAgICAgaWYgKG1hc2tbKGogKyBoKSAqIGR1ICsgaSArIGtdICE9PSBrZXkpIGJyZWFrIG91dGVyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaCsrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZvciAobGV0IGpqID0gMDsgamogPCBoOyBqaisrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpaSA9IDA7IGlpIDwgdzsgaWkrKykgbWFza1soaiArIGpqKSAqIGR1ICsgaSArIGlpXSA9IDA7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgZGlyID0gKGtleSA+PiAxMikgJiAxID8gMSA6IC0xO1xuICAgICAgICAgIGVtaXRRdWFkKGF4aXMsIGRpciwgc2xpY2UsIGksIGosIHcsIGgsIGtleSk7XG4gICAgICAgICAgaSArPSB3O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHBvc2l0aW9ucywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ25vcm1hbCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKG5vcm1hbHMsIDMpKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGNvbG9ycywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2FNYXQnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShtYXRzLCAxKSk7XG4gIGdlb21ldHJ5LnNldEluZGV4KGluZGljZXMpO1xuICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgcmV0dXJuIHsgZ2VvbWV0cnksIHRyaWFuZ2xlczogaW5kaWNlcy5sZW5ndGggLyAzIH07XG59XG5cbi8qKiBPbmUgb3BhcXVlIHNlYS1sZXZlbCBzdXJmYWNlIGZvciB0aGUgd2hvbGUgdmlldy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFdhdGVyU3VyZmFjZSh3b3JsZDogV29ybGQsIHNpemUgPSAyMDAwMCwgc2VnbWVudHMgPSA5Nik6IFRIUkVFLk1lc2gge1xuICBjb25zdCBnZW8gPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeShzaXplLCBzaXplLCBzZWdtZW50cywgc2VnbWVudHMpO1xuICBnZW8ucm90YXRlWCgtTWF0aC5QSSAvIDIpO1xuICBjb25zdCBwb3MgPSBnZW8uYXR0cmlidXRlcy5wb3NpdGlvbjtcbiAgY29uc3QgY29sb3JzID0gbmV3IEZsb2F0MzJBcnJheShwb3MuY291bnQgKiAzKTtcbiAgY29uc3QgdG1wID0gbmV3IFRIUkVFLkNvbG9yKCk7XG4gIGNvbnN0IHNtb290aHN0ZXAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHg6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IHQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCAoeCAtIGEpIC8gKGIgLSBhKSkpO1xuICAgIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xuICB9O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHBvcy5jb3VudDsgaSsrKSB7XG4gICAgY29uc3QgeCA9IHBvcy5nZXRYKGkpLCB6ID0gcG9zLmdldFooaSk7XG4gICAgLy8gVGhlIHdhdGVyIHBsYW5lIHNhbXBsZXMgdGhlIHNlYWJlZCBvbmx5IGZvciBhIG5hcnJvdyBzaG9yZSByaW0uIEEgZGVwdGhcbiAgICAvLyByYW1wIG9uIGEgNDcgbSBncmlkIG1pc3NlZCB0aGUgMTAgbSByaXZlciBlbnRpcmVseSBhbmQgdHVybmVkIGl0IHdoaXRlO1xuICAgIC8vIHRoZSByaXZlciBhbmQgbGFrZSByZWFkIGJldHRlciBhcyB0aGUgc2FtZSBkZWVwIHdhdGVyIGFzIHRoZSBzZWEuXG4gICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgTWF0aC5yb3VuZCh4KSwgTWF0aC5yb3VuZCh6KSk7XG4gICAgY29uc3Qgc2hvcmUgPSBzbW9vdGhzdGVwKC0wLjksIC0wLjE1LCBoKSAqICgxIC0gc21vb3Roc3RlcCgtMC4xNSwgMC40LCBoKSk7XG4gICAgY29uc3QgbiA9IGhhc2gyaShNYXRoLmZsb29yKHggLyA0NSksIE1hdGguZmxvb3IoeiAvIDQ1KSwgd29ybGQuc2VlZCArIDUwMSk7XG4gICAgdG1wLmNvcHkoQ09MLndhdGVyTWlkKS5sZXJwKENPTC53YXRlckRlZXAsIDAuMzUgKyAwLjM1ICogbik7XG4gICAgLy8gQSB3ZWFrIHNob3JlIHRpbnQuIEEgc3Ryb25nIG9uZSwgc2FtcGxlZCBvbiBhIGNvYXJzZSBwbGFuZSwgcHJvZHVjZWRcbiAgICAvLyBwYWxlIHJlY3RhbmdsZXMgb3ZlciBvZmZzaG9yZSBzZWFtb3VudHMgaW4gdGhlIG1hcCB2aWV3LlxuICAgIHRtcC5sZXJwKENPTC53YXRlclJpbSwgc2hvcmUgKiAwLjE1KTtcbiAgICBjb2xvcnNbaSAqIDNdID0gdG1wLnI7IGNvbG9yc1tpICogMyArIDFdID0gdG1wLmc7IGNvbG9yc1tpICogMyArIDJdID0gdG1wLmI7XG4gIH1cbiAgZ2VvLnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGNvbG9ycywgMykpO1xuICAvLyBPcGFxdWU6IHRoZSBzZWEtbGV2ZWwgc3VyZmFjZSBpcyB0aGUgd2F0ZXIgcmVhZC4gQSB0cmFuc2x1Y2VudCBwbGFuZSBsZXRcbiAgLy8gdGhlIG1hY3JvIHNlYWJlZCBzaG93IHRocm91Z2gsIHdoaWNoIG1hZGUgdGhlIGZpbml0ZSAyMDQ4IG0gd29ybGQgZWRnZVxuICAvLyB2aXNpYmxlIGFzIGEgc3F1YXJlIGluIHRoZSBmaXJzdCBNMDAxIG1hcCBjYXB0dXJlLlxuICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvLCBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XG4gICAgdmVydGV4Q29sb3JzOiB0cnVlLFxuICB9KSk7XG4gIG1lc2gucG9zaXRpb24ueSA9IC0wLjA2O1xuICBtZXNoLnJlbmRlck9yZGVyID0gMTtcbiAgbWVzaC5uYW1lID0gJ3dhdGVyX3N1cmZhY2UnO1xuICBtZXNoLnJlY2VpdmVTaGFkb3cgPSBmYWxzZTtcbiAgcmV0dXJuIG1lc2g7XG59XG5cbmludGVyZmFjZSBNYWNyb0hvbGUgeyBtaW5YOiBudW1iZXI7IG1heFg6IG51bWJlcjsgbWluWjogbnVtYmVyOyBtYXhaOiBudW1iZXI7IH1cbmludGVyZmFjZSBNYWNyb09wdGlvbnMge1xuICBzdGVwOiBudW1iZXI7XG4gIC8qKiBSZWN0YW5ndWxhciBob2xlIGNvdmVyZWQgYnkgdGhlIG5lYXIgMSBtIGNodW5rIHJpbmcuICovXG4gIGhvbGU/OiBNYWNyb0hvbGU7XG59XG5cbmludGVyZmFjZSBNYWNyb1Jlc3VsdCB7XG4gIG1lc2g6IFRIUkVFLk1lc2g7XG4gIHRyaWFuZ2xlczogbnVtYmVyO1xuICBzYW1wbGVNczogbnVtYmVyO1xuICB0b3RhbE1zOiBudW1iZXI7XG4gIHNhbXBsZUNhY2hlZDogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIE1hY3JvU2FtcGxlQ2FjaGUge1xuICBOOiBudW1iZXI7XG4gIGhlaWdodHM6IEludDE2QXJyYXk7XG4gIHRvcHM6IFVpbnQ4QXJyYXk7XG4gIHVuZGVyd2F0ZXI6IFVpbnQ4QXJyYXk7XG4gIHNhbXBsZU1zOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWFjcm9UZXJyYWluU2FtcGxlIHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB0b3A6IE1hdElkOyB1bmRlcndhdGVyOiBib29sZWFuOyB9XG5cbi8vIENhY2hlIHRoZSBkZXRlcm1pbmlzdGljIGJhc2UgZ3JpZCBhbmQgdGhlIGF1dGhvcml0YXRpdmUgZWRpdGVkIGdyaWQgc2VwYXJhdGVseS5cbi8vIEJhc2UgZW50cmllcyBuZXZlciBuZWVkIGludmFsaWRhdGlvbi4gRWRpdGVkIGVudHJpZXMgYXJlIHNjb3BlZCBieSBXb3JsZCBpZGVudGl0eVxuLy8gKHR3byBzYW1lLXNlZWQgd29ybGRzIGNhbiBoYXZlIGRpZmZlcmVudCBlZGl0cykgYW5kIGJ5IGJvdGggdGhlIGNvYXJzZSBlZGl0XG4vLyByZXZpc2lvbiBhbmQgY2h1bmsgc3RyZWFtaW5nLCBzaW5jZSBldmljdGluZy9yZWdlbmVyYXRpbmcgZGF0YSBhbmQgc25hcHNob3Rcbi8vIHJlc3RvcmF0aW9uIGRvIG5vdCBuZWNlc3NhcmlseSBwcm9kdWNlIGEgbmV3IGNvYXJzZSByZXZpc2lvbi4gT25seSBjaHVua3Mgd2l0aFxuLy8gZHVyYWJsZSB2b3hlbCBkZWx0YXMgYXJlIG1hdGVyaWFsaXplZDsgdGhlIG90aGVyIDY0eDY0IGNlbGxzIHJlbWFpbiBiYXNlIHNhbXBsZXMuXG5pbnRlcmZhY2UgTWFjcm9Xb3JsZENhY2hlcyB7XG4gIGJhc2U6IE1hcDxudW1iZXIsIE1hY3JvU2FtcGxlQ2FjaGU+O1xuICBlZGl0ZWQ6IE1hcDxzdHJpbmcsIE1hY3JvU2FtcGxlQ2FjaGU+O1xuICAvKiogU3BhcnNlIGF1dGhvcml0YXRpdmUgY29sdW1ucywgaW5kZXBlbmRlbnQgb2YgdGhlIG1lc2ggc2FtcGxpbmcgcmVzb2x1dGlvbi4gKi9cbiAgY29sdW1uczogTWFwPHN0cmluZywgTWFwPG51bWJlciwgeyBoZWlnaHQ6IG51bWJlcjsgdG9wOiBNYXRJZCB9Pj47XG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5jb25zdCBtYWNyb1NhbXBsZUNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hY3JvV29ybGRDYWNoZXM+KCk7XG5cbmZ1bmN0aW9uIHN5bmNNYWNyb0NvbHVtbnMod29ybGQ6IFdvcmxkLCBjYWNoZXM6IE1hY3JvV29ybGRDYWNoZXMpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLnJldmlzaW9uID09PSBjYWNoZXMucmV2aXNpb24pIHJldHVybjtcbiAgLy8gU25hcHNob3QgcmVzdG9yZSByZXBsYWNlcyBlZGl0cyBhbmQgY2h1bmtzIGJlZm9yZSBhc3NpZ25pbmcgaXRzIHNhdmVkXG4gIC8vIHJldmlzaW9uLiBOZXZlciBtaXggcmVtZW1iZXJlZCBjb2x1bW5zIGZyb20gdGhhdCBwcmV2aW91cyB3b3JsZCBzdGF0ZS5cbiAgY2FjaGVzLmNvbHVtbnMuY2xlYXIoKTtcbiAgLy8gQSBub3JtYWwgZWRpdCBoYXMgYWxyZWFkeSB1cGRhdGVkIHRoZSBsb2FkZWQgY2h1bmssIHNvIGl0IGNvc3RzIG9ubHkgdGhlXG4gIC8vIGVkaXRlZCBjaHVua3MuIFJlc3RvcmVkL2V2aWN0ZWQgZWRpdGVkIGNodW5rcyBhcmUgZ2VuZXJhdGVkIG9uIGRlbWFuZC5cbiAgZm9yIChjb25zdCBba2V5LCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBpZiAoIWVkaXRzLnNpemUgfHwgIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgY29udGludWU7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSkhO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBuZXcgTWFwPG51bWJlciwgeyBoZWlnaHQ6IG51bWJlcjsgdG9wOiBNYXRJZCB9PigpO1xuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgICAgY29sdW1ucy5zZXQoKG94ICsgbHggKyBIQUxGKSAqIFdPUkxEX1NJWkUgKyBveiArIGx6ICsgSEFMRiwge1xuICAgICAgICAgIGhlaWdodDogY2h1bmsuaGVpZ2h0c1tjb2xdICsgWV9NSU4gKyAxLFxuICAgICAgICAgIHRvcDogY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gYXMgTWF0SWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBjYWNoZXMuY29sdW1ucy5zZXQoa2V5LCBjb2x1bW5zKTtcbiAgfVxuICBjYWNoZXMuZWRpdGVkLmNsZWFyKCk7XG4gIGNhY2hlcy5yZXZpc2lvbiA9IHdvcmxkLnJldmlzaW9uO1xufVxuXG5mdW5jdGlvbiBtYWNyb0NvbHVtbih3b3JsZDogV29ybGQsIGNhY2hlczogTWFjcm9Xb3JsZENhY2hlcywga2V5OiBzdHJpbmcsIGluZGV4OiBudW1iZXIpIHtcbiAgbGV0IGNvbHVtbnMgPSBjYWNoZXMuY29sdW1ucy5nZXQoa2V5KTtcbiAgaWYgKGNvbHVtbnMpIHJldHVybiBjb2x1bW5zLmdldChpbmRleCk7XG4gIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGlmICghZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeikpIHJldHVybiB1bmRlZmluZWQ7XG4gIC8vIENhcHR1cmUgb25jZSBhZnRlciBsb2FkaW5nLiBMb2FkZWQgY2h1bmtzIGFyZSBjaGVhcCBhbmQgZG8gbm90IHJlcXVpcmVcbiAgLy8gd2Fsa2luZyBldmVyeSB2b3hlbDsgdGhpcyByZW1haW5zIE8oMzJ4MzIpIHBlciBlZGl0ZWQgY2h1bmsuXG4gIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpITtcbiAgY29sdW1ucyA9IG5ldyBNYXAoKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5zZXQoKG94ICsgbHggKyBIQUxGKSAqIFdPUkxEX1NJWkUgKyBveiArIGx6ICsgSEFMRiwge1xuICAgICAgICBoZWlnaHQ6IGNodW5rLmhlaWdodHNbY29sXSArIFlfTUlOICsgMSxcbiAgICAgICAgdG9wOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSBhcyBNYXRJZCxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBjYWNoZXMuY29sdW1ucy5zZXQoa2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnMuZ2V0KGluZGV4KTtcbn1cblxuY29uc3QgbWFjcm9FZGl0S2V5TWVtbyA9IG5ldyBXZWFrTWFwPFdvcmxkLCB7IHZlcnNpb246IG51bWJlcjsga2V5OiBzdHJpbmcgfT4oKTtcblxuLyoqIE1lbW9pemVkIGJ5IHRoZSB3b3JsZCdzIGVkaXQgdmVyc2lvbjogTygxKSBwZXIgZnJhbWUgdW5sZXNzIGVkaXRzIGNoYW5nZWQuICovXG5mdW5jdGlvbiBtYWNyb0VkaXRLZXkod29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgY29uc3QgdmVyc2lvbiA9IGVkaXRWZXJzaW9uKHdvcmxkKTtcbiAgY29uc3QgbWVtbyA9IG1hY3JvRWRpdEtleU1lbW8uZ2V0KHdvcmxkKTtcbiAgaWYgKG1lbW8gJiYgbWVtby52ZXJzaW9uID09PSB2ZXJzaW9uKSByZXR1cm4gbWVtby5rZXk7XG4gIGNvbnN0IGtleSA9IGNvbXB1dGVNYWNyb0VkaXRLZXkod29ybGQpO1xuICBtYWNyb0VkaXRLZXlNZW1vLnNldCh3b3JsZCwgeyB2ZXJzaW9uLCBrZXkgfSk7XG4gIHJldHVybiBrZXk7XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVNYWNyb0VkaXRLZXkod29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgLy8gSW5jbHVkZSBhIGNvbW11dGF0aXZlIGNvbnRlbnQgZmluZ2VycHJpbnQgYXMgd2VsbCBhcyBjb3VudDogZXZpY3Rpb24gYW5kXG4gIC8vIHNuYXBzaG90IHJlc3RvcmUgYnlwYXNzIHRoZSBjb2Fyc2UgV29ybGQucmV2aXNpb24gcGF0aCwgYW5kIGEgcmVzdG9yZWRcbiAgLy8gZGVsdGEgY2FuIGhhdmUgdGhlIHNhbWUgbnVtYmVyIG9mIGNlbGxzIHdpdGggZGlmZmVyZW50IGluZGljZXMvbWF0ZXJpYWxzLlxuICByZXR1cm4gWy4uLndvcmxkLmVkaXRzLmVudHJpZXMoKV1cbiAgICAuZmlsdGVyKChbLCBlZGl0c10pID0+IGVkaXRzLnNpemUgPiAwKVxuICAgIC5tYXAoKFtrZXksIGVkaXRzXSkgPT4ge1xuICAgICAgbGV0IHN1bSA9IDA7XG4gICAgICBsZXQgbWl4ZWQgPSAwO1xuICAgICAgZm9yIChjb25zdCBbaW5kZXgsIG1hdGVyaWFsXSBvZiBlZGl0cykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IE1hdGguaW11bChpbmRleCArIDEsIDMxKSArIG1hdGVyaWFsO1xuICAgICAgICBzdW0gPSAoc3VtICsgdmFsdWUpIHwgMDtcbiAgICAgICAgbWl4ZWQgPSAobWl4ZWQgXiBNYXRoLmltdWwodmFsdWUsIDB4NDVkOWYzYikpIHwgMDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJHtrZXl9OiR7ZWRpdHMuc2l6ZX06JHtzdW19OiR7bWl4ZWR9YDtcbiAgICB9KVxuICAgIC5zb3J0KClcbiAgICAuam9pbignfCcpO1xufVxuXG5mdW5jdGlvbiBlZGl0ZWRNYWNyb1NhbXBsZXMod29ybGQ6IFdvcmxkLCBzdGVwOiBudW1iZXIsIGNhY2hlOiBNYWNyb1NhbXBsZUNhY2hlKTogTWFjcm9TYW1wbGVDYWNoZSB7XG4gIGNvbnN0IGNhY2hlcyA9IG1hY3JvU2FtcGxlQ2FjaGUuZ2V0KHdvcmxkKSE7XG4gIGNvbnN0IGtleSA9IGAke3N0ZXB9OiR7bWFjcm9FZGl0S2V5KHdvcmxkKX1gO1xuICBjb25zdCBjYWNoZWQgPSBjYWNoZXMuZWRpdGVkLmdldChrZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuXG4gIGZvciAoY29uc3QgW2NodW5rLCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBpZiAoZWRpdHMuc2l6ZSAmJiAhY2FjaGVzLmNvbHVtbnMuaGFzKGNodW5rKSkgbWFjcm9Db2x1bW4od29ybGQsIGNhY2hlcywgY2h1bmssIDApO1xuICB9XG5cbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgeyBOLCBoZWlnaHRzLCB0b3BzLCB1bmRlcndhdGVyIH0gPSBjYWNoZTtcbiAgY29uc3Qgc2FtcGxlID0ge1xuICAgIE4sXG4gICAgaGVpZ2h0czogbmV3IEludDE2QXJyYXkoaGVpZ2h0cyksXG4gICAgdG9wczogbmV3IFVpbnQ4QXJyYXkodG9wcyksXG4gICAgdW5kZXJ3YXRlcjogbmV3IFVpbnQ4QXJyYXkodW5kZXJ3YXRlciksXG4gICAgc2FtcGxlTXM6IGNhY2hlLnNhbXBsZU1zLFxuICB9O1xuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCB4ID0gTWF0aC5yb3VuZCgtSEFMRiArIChpICsgMC41KSAqIHN0ZXApO1xuICAgICAgY29uc3QgeiA9IE1hdGgucm91bmQoLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwKTtcbiAgICAgIGNvbnN0IGNodW5rID0gY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk7XG4gICAgICBpZiAoIXdvcmxkLmVkaXRzLmdldChjaHVuayk/LnNpemUpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgaWR4ID0gaiAqIE4gKyBpO1xuICAgICAgY29uc3QgZWRpdGVkID0gbWFjcm9Db2x1bW4od29ybGQsIGNhY2hlcywgY2h1bmssICh4ICsgSEFMRikgKiBXT1JMRF9TSVpFICsgeiArIEhBTEYpO1xuICAgICAgaWYgKCFlZGl0ZWQpIGNvbnRpbnVlO1xuICAgICAgc2FtcGxlLmhlaWdodHNbaWR4XSA9IGVkaXRlZC5oZWlnaHQ7XG4gICAgICBzYW1wbGUudG9wc1tpZHhdID0gZWRpdGVkLnRvcDtcbiAgICAgIHNhbXBsZS51bmRlcndhdGVyW2lkeF0gPSBzYW1wbGUuaGVpZ2h0c1tpZHhdIDwgU0VBX0xFVkVMID8gMSA6IDA7XG4gICAgfVxuICB9XG4gIHNhbXBsZS5zYW1wbGVNcyA9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gIGNhY2hlcy5lZGl0ZWQuc2V0KGtleSwgc2FtcGxlKTtcbiAgcmV0dXJuIHNhbXBsZTtcbn1cblxuZnVuY3Rpb24gbWFjcm9TYW1wbGVzKHdvcmxkOiBXb3JsZCwgc3RlcDogbnVtYmVyKTogTWFjcm9TYW1wbGVDYWNoZSB7XG4gIGxldCBjYWNoZXMgPSBtYWNyb1NhbXBsZUNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGVzKSB7XG4gICAgY2FjaGVzID0geyBiYXNlOiBuZXcgTWFwKCksIGVkaXRlZDogbmV3IE1hcCgpLCBjb2x1bW5zOiBuZXcgTWFwKCksIHJldmlzaW9uOiAtMSB9O1xuICAgIG1hY3JvU2FtcGxlQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZXMpO1xuICB9XG4gIHN5bmNNYWNyb0NvbHVtbnMod29ybGQsIGNhY2hlcyk7XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlcy5iYXNlLmdldChzdGVwKTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGVkaXRlZE1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCwgY2FjaGVkKTtcblxuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBOID0gTWF0aC5jZWlsKFdPUkxEX1NJWkUgLyBzdGVwKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBJbnQxNkFycmF5KE4gKiBOKTtcbiAgY29uc3QgdG9wcyA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgdW5kZXJ3YXRlciA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgY2VsbFggPSAoaTogbnVtYmVyKSA9PiAtSEFMRiArIChpICsgMC41KSAqIHN0ZXA7XG4gIGNvbnN0IGNlbGxaID0gKGo6IG51bWJlcikgPT4gLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwO1xuXG4gIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgIGNvbnN0IHggPSBjZWxsWChpKSwgeiA9IGNlbGxaKGopO1xuICAgICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgTWF0aC5yb3VuZCh4KSwgTWF0aC5yb3VuZCh6KSk7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBoZWlnaHRzW2lkeF0gPSBoO1xuICAgICAgaWYgKGggPCBTRUFfTEVWRUwpIHVuZGVyd2F0ZXJbaWR4XSA9IDE7XG4gICAgfVxuICB9XG5cbiAgZm9yIChsZXQgaiA9IDA7IGogPCBOOyBqKyspIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgY29uc3QgaWR4ID0gaiAqIE4gKyBpO1xuICAgICAgaWYgKHVuZGVyd2F0ZXJbaWR4XSkgY29udGludWU7XG4gICAgICBjb25zdCBoID0gaGVpZ2h0c1tpZHhdO1xuICAgICAgY29uc3QgeCA9IGNlbGxYKGkpLCB6ID0gY2VsbFooaik7XG4gICAgICBsZXQgc2xvcGUgPSAwO1xuICAgICAgbGV0IG5lYXJXYXRlciA9IGZhbHNlO1xuICAgICAgY29uc3QgbnMgPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBucykge1xuICAgICAgICBjb25zdCBueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKE4gLSAxLCBpICsgZHgpKTtcbiAgICAgICAgY29uc3QgbnogPSBNYXRoLm1heCgwLCBNYXRoLm1pbihOIC0gMSwgaiArIGR6KSk7XG4gICAgICAgIGNvbnN0IG5oID0gaGVpZ2h0c1tueiAqIE4gKyBueF07XG4gICAgICAgIHNsb3BlID0gTWF0aC5tYXgoc2xvcGUsIE1hdGguYWJzKGggLSBuaCkpO1xuICAgICAgICBpZiAobmggPCBTRUFfTEVWRUwgKyAxKSBuZWFyV2F0ZXIgPSB0cnVlO1xuICAgICAgfVxuICAgICAgdG9wc1tpZHhdID0gYmFzZVRvcE1hdGVyaWFsRm9yKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgICAgICBNYXRoLnJvdW5kKHgpLCBNYXRoLnJvdW5kKHopLCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBjYWNoZTogTWFjcm9TYW1wbGVDYWNoZSA9IHtcbiAgICBOLCBoZWlnaHRzLCB0b3BzLCB1bmRlcndhdGVyLFxuICAgIHNhbXBsZU1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHQwLFxuICB9O1xuICBjYWNoZXMuYmFzZS5zZXQoc3RlcCwgY2FjaGUpO1xuICByZXR1cm4gZWRpdGVkTWFjcm9TYW1wbGVzKHdvcmxkLCBzdGVwLCBjYWNoZSk7XG59XG5cbi8qKiBBdXRob3JpdGF0aXZlIG1hY3JvLWdyaWQgdmFsdWUgYXQgYSB3b3JsZCBjb2x1bW4gKHN0ZXAgZGVmYXVsdHMgdG8gOCBtKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgc3RlcCA9IDgpOiBNYWNyb1RlcnJhaW5TYW1wbGUge1xuICBjb25zdCBjYWNoZSA9IG1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCk7XG4gIGNvbnN0IGkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjYWNoZS5OIC0gMSwgTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gc3RlcCkpKTtcbiAgY29uc3QgaiA9IE1hdGgubWF4KDAsIE1hdGgubWluKGNhY2hlLk4gLSAxLCBNYXRoLmZsb29yKCh6ICsgSEFMRikgLyBzdGVwKSkpO1xuICBjb25zdCBpZHggPSBqICogY2FjaGUuTiArIGk7XG4gIHJldHVybiB7XG4gICAgeDogLUhBTEYgKyAoaSArIDAuNSkgKiBzdGVwLFxuICAgIHo6IC1IQUxGICsgKGogKyAwLjUpICogc3RlcCxcbiAgICBoZWlnaHQ6IGNhY2hlLmhlaWdodHNbaWR4XSwgdG9wOiBjYWNoZS50b3BzW2lkeF0gYXMgTWF0SWQsXG4gICAgdW5kZXJ3YXRlcjogY2FjaGUudW5kZXJ3YXRlcltpZHhdICE9PSAwLFxuICB9O1xufVxuXG4vKipcbiAqIEZhciBsYW5kc2NhcGUgTE9EIGRlcml2ZWQgZnJvbSB0aGUgc2FtZSBkZXRlcm1pbmlzdGljIHN1cmZhY2Ugc2FtcGxlci5cbiAqIENlbGxzIGJlbG93IHNlYSBsZXZlbCBhcmUgb21pdHRlZDogdGhlIG9wYXF1ZSB3YXRlciBzdXJmYWNlIGlzIHRoZSBvbmx5XG4gKiB3YXRlciByZWFkLCBzbyB0aGUgZmluaXRlIDIwNDggbSB3b3JsZCBjYW5ub3QgYXBwZWFyIGFzIGEgc3F1YXJlIHNlYWJlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTWFjcm9NZXNoKHdvcmxkOiBXb3JsZCwgb3B0czogTWFjcm9PcHRpb25zKTogTWFjcm9SZXN1bHQge1xuICBjb25zdCB0b3RhbFQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IHsgc3RlcCwgaG9sZSB9ID0gb3B0cztcbiAgY29uc3QgY2FjaGVLZXkgPSBgJHtzdGVwfToke21hY3JvRWRpdEtleSh3b3JsZCl9YDtcbiAgY29uc3Qgc2FtcGxlQ2FjaGVkID0gbWFjcm9TYW1wbGVDYWNoZS5nZXQod29ybGQpPy5lZGl0ZWQuaGFzKGNhY2hlS2V5KSA/PyBmYWxzZTtcbiAgY29uc3QgY2FjaGUgPSBtYWNyb1NhbXBsZXMod29ybGQsIHN0ZXApO1xuICBjb25zdCB7IE4sIGhlaWdodHMsIHRvcHMsIHVuZGVyd2F0ZXIgfSA9IGNhY2hlO1xuICBjb25zdCBob2xlQ2VsbCA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgY2VsbFggPSAoaTogbnVtYmVyKSA9PiAtSEFMRiArIChpICsgMC41KSAqIHN0ZXA7XG4gIGNvbnN0IGNlbGxaID0gKGo6IG51bWJlcikgPT4gLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwO1xuXG4gIGlmIChob2xlKSB7XG4gICAgZm9yIChsZXQgaiA9IDA7IGogPCBOOyBqKyspIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHggPSBjZWxsWChpKSwgeiA9IGNlbGxaKGopO1xuICAgICAgICBpZiAoeCA+IGhvbGUubWluWCAmJiB4IDwgaG9sZS5tYXhYICYmIHogPiBob2xlLm1pblogJiYgeiA8IGhvbGUubWF4Wikge1xuICAgICAgICAgIGhvbGVDZWxsW2ogKiBOICsgaV0gPSAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3Qgc2FtcGxlTXMgPSBzYW1wbGVDYWNoZWQgPyAwIDogY2FjaGUuc2FtcGxlTXM7XG4gIGNvbnN0IHBvc2l0aW9uczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3Qgbm9ybWFsczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgY29sb3JzOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBpbmRpY2VzOiBudW1iZXJbXSA9IFtdO1xuXG4gIGNvbnN0IHB1c2hRdWFkID0gKHA6IG51bWJlcltdW10sIG46IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSwgY29sb3I6IFRIUkVFLkNvbG9yKSA9PiB7XG4gICAgY29uc3QgYmFzZSA9IHBvc2l0aW9ucy5sZW5ndGggLyAzO1xuICAgIGZvciAoY29uc3QgdiBvZiBwKSB7XG4gICAgICBwb3NpdGlvbnMucHVzaCh2WzBdLCB2WzFdLCB2WzJdKTtcbiAgICAgIG5vcm1hbHMucHVzaChuWzBdLCBuWzFdLCBuWzJdKTtcbiAgICAgIGNvbG9ycy5wdXNoKGNvbG9yLnIsIGNvbG9yLmcsIGNvbG9yLmIpO1xuICAgIH1cbiAgICBpbmRpY2VzLnB1c2goYmFzZSwgYmFzZSArIDEsIGJhc2UgKyAyLCBiYXNlLCBiYXNlICsgMiwgYmFzZSArIDMpO1xuICB9O1xuXG4gIGNvbnN0IGNlbGxTaGFkZSA9IChpOiBudW1iZXIsIGo6IG51bWJlcikgPT4gMC45NCArIDAuMTIgKiBoYXNoMmkoaSwgaiwgd29ybGQuc2VlZCArIDQwMSk7XG5cbiAgY29uc3QgdG9wQ29sb3IgPSAodG9wOiBNYXRJZCwgaDogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlcik6IFRIUkVFLkNvbG9yID0+IHtcbiAgICBjb25zdCBzaGFkZSA9IGNlbGxTaGFkZShpLCBqKTtcbiAgICBjb25zdCBtb2lzdCA9IGZibTIoY2VsbFgoaSkgLyAxMzAsIGNlbGxaKGopIC8gMTMwLCB3b3JsZC5zZWVkICsgNjAxLCAzKTtcbiAgICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIENPTC5zYW5kLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoc2hhZGUgKiAwLjkwKTtcbiAgICBpZiAodG9wID09PSBNQVQuR1JBVkVMKSByZXR1cm4gQ09MLmdyYXZlbC5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgICBpZiAodG9wID09PSBNQVQuU1RPTkUpIHtcbiAgICAgIHJldHVybiBDT0wuc3RvbmVTaGFkZS5jbG9uZSgpLmxlcnAoQ09MLnN0b25lQiwgMC4zNSArIDAuMjUgKiBzaGFkZSkubXVsdGlwbHlTY2FsYXIoXG4gICAgICAgICgwLjgyICsgMC4xNCAqIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIChoICsgOCkgLyA3MCkpKSAqICgwLjkyICsgMC4wOCAqIHNoYWRlKSxcbiAgICAgICk7XG4gICAgfVxuICAgIGlmICh0b3AgPT09IE1BVC5PUkUpIHJldHVybiBDT0wub3JlLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TTk9XKSByZXR1cm4gQ09MLnNub3cuY2xvbmUoKS5tdWx0aXBseVNjYWxhcigwLjk0ICsgMC4wOCAqIHNoYWRlKTtcbiAgICAvLyBGb3Jlc3QtZmxvb3IgcGF0Y2hlcyBicmVhayB1cCB0aGUgdW5pZm9ybSBncmVlbiBvZiB0aGUgZmFyIExPRC4gVGhleVxuICAgIC8vIGFyZSBhIGNvbG91ciBhcHByb3hpbWF0aW9uLCBub3QgZXh0cmEgZ2VvbWV0cnk7IHRoZSBuZWFyIHJpbmcgaGFzIHJlYWxcbiAgICAvLyBTdHlsIHRyZWVzLlxuICAgIHJldHVybiBDT0wuZ3Jhc3NUb3BbaGVpZ2h0QmFuZChoKV0uY2xvbmUoKVxuICAgICAgLmxlcnAoQ09MLmdyYXNzQ2FwLCAwLjEyICsgMC4zNCAqIG1vaXN0KVxuICAgICAgLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgfTtcblxuICBjb25zdCBzaWRlQ29sb3IgPSAodG9wOiBNYXRJZCwgaDogbnVtYmVyLCBuaDogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlcik6IFRIUkVFLkNvbG9yID0+IHtcbiAgICBjb25zdCBkcm9wID0gaCAtIG5oO1xuICAgIGNvbnN0IHNoYWRlID0gMC45MCArIDAuMTAgKiBoYXNoMmkoaSwgaiwgd29ybGQuc2VlZCArIDQwMik7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBDT0wuc2FuZC5jbG9uZSgpLmxlcnAoQ09MLnN0b25lQiwgZHJvcCA+IDUgPyAwLjU1IDogMC4yKS5tdWx0aXBseVNjYWxhcihzaGFkZSAqIDAuOTIpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSkge1xuICAgICAgcmV0dXJuIENPTC5zdG9uZVNoYWRlLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoXG4gICAgICAgICgwLjgwICsgMC4xNiAqIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIChoICsgOCkgLyA3MCkpKSAqIHNoYWRlLFxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gQSBncmFzcy10b3BwZWQgYmFuayBpcyBub3QgYSBzdG9uZSBjbGlmZiwgaG93ZXZlciB0YWxsIHRoZSA4IG0gbWFjcm9cbiAgICAvLyBjZWxsIG1ha2VzIGl0IGxvb2suIEtlZXBpbmcgdGhlIHNpZGUgaW4gdGhlIHNvaWwgcmFuZ2UgcmVtb3ZlZCB0aGVcbiAgICAvLyBicmlnaHQgd2hpdGUgcXVhcnJ5IHdhbGxzIGFyb3VuZCB0aGUgcml2ZXIgYW5kIGxha2UgaW4gdGhlIHdpZGUgdmlldy5cbiAgICBpZiAoZHJvcCA+IDQpIHJldHVybiBDT0wuZ3Jhc3NDYXAuY2xvbmUoKS5sZXJwKENPTC5vY2hyZSwgMC41NSkubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICAgIHJldHVybiBDT0wuZ3Jhc3NDYXAuY2xvbmUoKS5sZXJwKENPTC5zdG9uZUIsIDAuMjIpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgfTtcblxuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBpZiAoaG9sZUNlbGxbaWR4XSB8fCB1bmRlcndhdGVyW2lkeF0pIGNvbnRpbnVlO1xuICAgICAgY29uc3QgaCA9IGhlaWdodHNbaWR4XTtcbiAgICAgIGNvbnN0IHRvcCA9IHRvcHNbaWR4XSBhcyBNYXRJZDtcbiAgICAgIGNvbnN0IHgwID0gLUhBTEYgKyBpICogc3RlcCwgeDEgPSB4MCArIHN0ZXA7XG4gICAgICBjb25zdCB6MCA9IC1IQUxGICsgaiAqIHN0ZXAsIHoxID0gejAgKyBzdGVwO1xuXG4gICAgICBwdXNoUXVhZChcbiAgICAgICAgW1t4MCwgaCwgejBdLCBbeDAsIGgsIHoxXSwgW3gxLCBoLCB6MV0sIFt4MSwgaCwgejBdXSxcbiAgICAgICAgWzAsIDEsIDBdLFxuICAgICAgICB0b3BDb2xvcih0b3AsIGgsIGksIGopLFxuICAgICAgKTtcblxuICAgICAgY29uc3QgY2hlY2sgPSAoZGk6IG51bWJlciwgZGo6IG51bWJlcikgPT4ge1xuICAgICAgICBjb25zdCBuaSA9IGkgKyBkaSwgbmogPSBqICsgZGo7XG4gICAgICAgIGxldCBuaDogbnVtYmVyO1xuICAgICAgICBpZiAobmkgPCAwIHx8IG5qIDwgMCB8fCBuaSA+PSBOIHx8IG5qID49IE4pIHtcbiAgICAgICAgICAvLyBUaGUgd29ybGQgZWRnZSBpcyBvY2Vhbi4gRG8gbm90IGRyYXcgYSBzaWRlIGZhY2UgZG93biB0byB0aGVcbiAgICAgICAgICAvLyB3YXRlciBoZXJlOyB0aGUgb3BhcXVlIHdhdGVyIHBsYW5lIGFscmVhZHkgY292ZXJzIHRoZSBib3VuZGFyeS5cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgbmlkeCA9IG5qICogTiArIG5pO1xuICAgICAgICAgIGlmIChob2xlQ2VsbFtuaWR4XSkgcmV0dXJuO1xuICAgICAgICAgIG5oID0gdW5kZXJ3YXRlcltuaWR4XSA/IE1hdGgubWF4KFNFQV9MRVZFTCAtIDAuNSwgaGVpZ2h0c1tuaWR4XSkgOiBoZWlnaHRzW25pZHhdO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoIDw9IG5oKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGNvbCA9IHNpZGVDb2xvcih0b3AsIGgsIG5oLCBpLCBqKTtcbiAgICAgICAgaWYgKGRpID09PSAxKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MSwgbmgsIHowXSwgW3gxLCBoLCB6MF0sIFt4MSwgaCwgejFdLCBbeDEsIG5oLCB6MV1dLCBbMSwgMCwgMF0sIGNvbCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZGkgPT09IC0xKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MCwgbmgsIHowXSwgW3gwLCBuaCwgejFdLCBbeDAsIGgsIHoxXSwgW3gwLCBoLCB6MF1dLCBbLTEsIDAsIDBdLCBjb2wpO1xuICAgICAgICB9IGVsc2UgaWYgKGRqID09PSAxKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MCwgbmgsIHoxXSwgW3gxLCBuaCwgejFdLCBbeDEsIGgsIHoxXSwgW3gwLCBoLCB6MV1dLCBbMCwgMCwgMV0sIGNvbCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZGogPT09IC0xKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MCwgbmgsIHowXSwgW3gwLCBoLCB6MF0sIFt4MSwgaCwgejBdLCBbeDEsIG5oLCB6MF1dLCBbMCwgMCwgLTFdLCBjb2wpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgY2hlY2soMSwgMCk7IGNoZWNrKC0xLCAwKTsgY2hlY2soMCwgMSk7IGNoZWNrKDAsIC0xKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUocG9zaXRpb25zLCAzKSk7XG4gIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUobm9ybWFscywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoY29sb3JzLCAzKSk7XG4gIGdlb21ldHJ5LnNldEluZGV4KGluZGljZXMpO1xuICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcblxuICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICB2ZXJ0ZXhDb2xvcnM6IHRydWUsIGZsYXRTaGFkaW5nOiB0cnVlLFxuICB9KSk7XG4gIG1lc2gubmFtZSA9ICdtYWNyb19sb2QnO1xuICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgbWVzaC5yZWNlaXZlU2hhZG93ID0gZmFsc2U7XG4gIHJldHVybiB7XG4gICAgbWVzaCxcbiAgICB0cmlhbmdsZXM6IGluZGljZXMubGVuZ3RoIC8gMyxcbiAgICBzYW1wbGVNcyxcbiAgICB0b3RhbE1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHRvdGFsVDAsXG4gICAgc2FtcGxlQ2FjaGVkLFxuICB9O1xufVxuXG5leHBvcnQgdHlwZSBWaWV3TW9kZSA9ICd3b3JsZCcgfCAnbWFwJyB8ICdraXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsVGVycmFpblZpZXdPcHRpb25zIHtcbiAgbmVhclJhZGl1cz86IG51bWJlcjtcbiAgd29ybGRNYWNyb1N0ZXA/OiBudW1iZXI7XG4gIG1hcE1hY3JvU3RlcD86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENodW5rVmlldyB7IG1lc2g6IFRIUkVFLk1lc2g7IHdhdGVyOiBUSFJFRS5NZXNoIHwgbnVsbDsgdHJpYW5nbGVzOiBudW1iZXI7IH1cblxuLyoqXG4gKiBPd25zIHRoZSBuZWFyIGNodW5rIG1lc2hlcywgbWFjcm8gTE9EIGFuZCB3YXRlciBzdXJmYWNlLiBJdCByZWFkcyB3b3JsZFxuICogc3RhdGUgYW5kIG5ldmVyIG11dGF0ZXMgZ2VuZXJhdGlvbiBydWxlczsgZXZpY3Rpb24gb25seSBmcmVlcyBkZXJpdmVkIGRhdGEuXG4gKi9cbmV4cG9ydCBjbGFzcyBWb3hlbFRlcnJhaW5WaWV3IHtcbiAgcmVhZG9ubHkgZ3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBuZWFyR3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBtYWNyb0dyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIHByaXZhdGUgd2F0ZXI6IFRIUkVFLk1lc2g7XG4gIHByaXZhdGUgd29ybGQ6IFdvcmxkO1xuICBwcml2YXRlIG5lYXJSYWRpdXM6IG51bWJlcjtcbiAgcHJpdmF0ZSB3b3JsZE1hY3JvU3RlcDogbnVtYmVyO1xuICBwcml2YXRlIG1hcE1hY3JvU3RlcDogbnVtYmVyO1xuICBwcml2YXRlIGNodW5rcyA9IG5ldyBNYXA8c3RyaW5nLCBDaHVua1ZpZXc+KCk7XG4gIHByaXZhdGUgbG9hZGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbW9kZTogVmlld01vZGUgPSAnd29ybGQnO1xuICBwcml2YXRlIG1hY3JvOiBUSFJFRS5NZXNoIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbWFjcm9UcmlhbmdsZXMgPSAwO1xuICBwcml2YXRlIG1hY3JvRm9jdXMgPSBuZXcgVEhSRUUuVmVjdG9yMygxZTksIDAsIDFlOSk7XG4gIHByaXZhdGUgbWFjcm9Nb2RlOiBWaWV3TW9kZSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGNodW5rR2VuU2FtcGxlczogbnVtYmVyW10gPSBbXTtcbiAgcHJpdmF0ZSBjaHVua01lc2hTYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIG1hY3JvU2FtcGxlczogbnVtYmVyW10gPSBbXTtcbiAgcHJpdmF0ZSBtYWNyb1NhbXBsZVNhbXBsZXM6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgbWFjcm9DYWNoZUhpdHMgPSAwO1xuICBwcml2YXRlIG1hY3JvRWRpdEtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIC8qKiBNYWluLXRocmVhZCBtaWxsaXNlY29uZHMgcGVyIGZyYW1lIGZvciBzdHJlYW1pbmcgYW5kIGRpcnR5IHJlLW1lc2hpbmcuICovXG4gIGZyYW1lQnVkZ2V0TXMgPSA2O1xuICBwcml2YXRlIHBlbmRpbmdDaHVua3MgPSAwO1xuICBwcml2YXRlIHN3ZWVwQ291bnRlciA9IDA7XG4gIHByaXZhdGUgc3dlcHRDaHVua3MgPSAwO1xuICBwcml2YXRlIHBpbm5lZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIHdhdGVyR3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBmYXJXYXRlckhvbGU6IHsgdmFsdWU6IFRIUkVFLlZlY3RvcjQgfTtcbiAgb25DaHVua3NDaGFuZ2VkOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcblxuICBjb25zdHJ1Y3Rvcih3b3JsZDogV29ybGQsIHNjZW5lOiBUSFJFRS5TY2VuZSwgb3B0czogVm94ZWxUZXJyYWluVmlld09wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMud29ybGQgPSB3b3JsZDtcbiAgICB0aGlzLm5lYXJSYWRpdXMgPSBNYXRoLm1heCgxLCBvcHRzLm5lYXJSYWRpdXMgPz8gMyk7XG4gICAgdGhpcy53b3JsZE1hY3JvU3RlcCA9IE1hdGgubWF4KDQsIG9wdHMud29ybGRNYWNyb1N0ZXAgPz8gOCk7XG4gICAgdGhpcy5tYXBNYWNyb1N0ZXAgPSBNYXRoLm1heCg0LCBvcHRzLm1hcE1hY3JvU3RlcCA/PyA4KTtcbiAgICB0aGlzLmdyb3VwLm5hbWUgPSAndm94ZWxfd29ybGQnO1xuICAgIHRoaXMubmVhckdyb3VwLm5hbWUgPSAndm94ZWxfY2h1bmtzJztcbiAgICB0aGlzLm1hY3JvR3JvdXAubmFtZSA9ICdtYWNyb19sb2QnO1xuICAgIHRoaXMuZ3JvdXAuYWRkKHRoaXMubmVhckdyb3VwLCB0aGlzLm1hY3JvR3JvdXApO1xuICAgIHRoaXMud2F0ZXIgPSBidWlsZFdhdGVyU3VyZmFjZSh3b3JsZCk7XG4gICAgdGhpcy5mYXJXYXRlckhvbGUgPSBpbnN0YWxsRmFyV2F0ZXJIb2xlKHRoaXMud2F0ZXIubWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwpO1xuICAgIHRoaXMuZ3JvdXAuYWRkKHRoaXMud2F0ZXIpO1xuICAgIHRoaXMud2F0ZXJHcm91cC5uYW1lID0gJ25lYXJfd2F0ZXInO1xuICAgIHRoaXMuZ3JvdXAuYWRkKHRoaXMud2F0ZXJHcm91cCk7XG4gICAgc2NlbmUuYWRkKHRoaXMuZ3JvdXApO1xuICB9XG5cbiAgcHJlbG9hZChmb2N1czogVEhSRUUuVmVjdG9yMyk6IHZvaWQge1xuICAgIHRoaXMubW9kZSA9ICd3b3JsZCc7XG4gICAgdGhpcy5lbnN1cmVDaHVua3MoZm9jdXMsIHRydWUpO1xuICAgIHRoaXMucmVidWlsZE1hY3JvKGZvY3VzLCAnd29ybGQnLCB0cnVlKTtcbiAgfVxuXG4gIC8qKiBBZHZhbmNlIHByZXNlbnRhdGlvbi1vbmx5IHdhdGVyIGFuaW1hdGlvbiAoc2Vjb25kcykuICovXG4gIHNldFdhdGVyVGltZShzZWNvbmRzOiBudW1iZXIpOiB2b2lkIHsgd2F0ZXJUaW1lLnZhbHVlID0gc2Vjb25kczsgfVxuXG4gIHVwZGF0ZShmb2N1czogVEhSRUUuVmVjdG9yMywgbW9kZTogVmlld01vZGUgPSAnd29ybGQnKTogdm9pZCB7XG4gICAgaWYgKG1vZGUgIT09IHRoaXMubW9kZSkge1xuICAgICAgdGhpcy5tb2RlID0gbW9kZTtcbiAgICAgIHRoaXMubmVhckdyb3VwLnZpc2libGUgPSBtb2RlICE9PSAnbWFwJztcbiAgICAgIHRoaXMud2F0ZXJHcm91cC52aXNpYmxlID0gbW9kZSAhPT0gJ21hcCc7XG4gICAgICBpZiAobW9kZSA9PT0gJ21hcCcpIHRoaXMuZmFyV2F0ZXJIb2xlLnZhbHVlLnNldCgwLCAwLCAwLCAwKTtcbiAgICAgIHRoaXMucmVidWlsZE1hY3JvKGZvY3VzLCBtb2RlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBpZiAobW9kZSA9PT0gJ21hcCcpIHtcbiAgICAgIGlmIChtYWNyb0VkaXRLZXkodGhpcy53b3JsZCkgIT09IHRoaXMubWFjcm9FZGl0S2V5KSB0aGlzLnJlYnVpbGRNYWNybyhmb2N1cywgbW9kZSwgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZnJhbWVTdGFydCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIHRoaXMuZW5zdXJlQ2h1bmtzKGZvY3VzLCBmYWxzZSwgZnJhbWVTdGFydCk7XG4gICAgdGhpcy5yZWJ1aWxkRGlydHkoZm9jdXMsIGZyYW1lU3RhcnQpO1xuICAgIGlmICgrK3RoaXMuc3dlZXBDb3VudGVyICUgMzAgPT09IDApIHRoaXMuc3dlZXBSZXNpZGVudChmb2N1cyk7XG5cbiAgICBjb25zdCBtb3ZlZCA9IE1hdGguaHlwb3QoZm9jdXMueCAtIHRoaXMubWFjcm9Gb2N1cy54LCBmb2N1cy56IC0gdGhpcy5tYWNyb0ZvY3VzLnopO1xuICAgIGlmICh0aGlzLm1hY3JvTW9kZSAhPT0gbW9kZSB8fCBtb3ZlZCA+IDQ4IHx8IG1hY3JvRWRpdEtleSh0aGlzLndvcmxkKSAhPT0gdGhpcy5tYWNyb0VkaXRLZXkpIHtcbiAgICAgIHRoaXMucmVidWlsZE1hY3JvKGZvY3VzLCBtb2RlLCBmYWxzZSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0cmVhbSB0aGUgbmVhciByaW5nIG5lYXJlc3QtZmlyc3Qgd2l0aGluIGEgcGVyLWZyYW1lIHRpbWUgYnVkZ2V0LiBBdCBsZWFzdFxuICAgKiBvbmUgY2h1bmsgaXMgYnVpbHQgcGVyIGZyYW1lIHNvIHN0cmVhbWluZyBhbHdheXMgbWFrZXMgcHJvZ3Jlc3MuXG4gICAqL1xuICBwcml2YXRlIGVuc3VyZUNodW5rcyhmb2N1czogVEhSRUUuVmVjdG9yMywgaW1tZWRpYXRlOiBib29sZWFuLCBmcmFtZVN0YXJ0ID0gcGVyZm9ybWFuY2Uubm93KCkpOiB2b2lkIHtcbiAgICBjb25zdCBjY3ggPSB3b3JsZFRvQ2h1bmtYKE1hdGgucm91bmQoZm9jdXMueCkpO1xuICAgIGNvbnN0IGNjeiA9IHdvcmxkVG9DaHVua1ooTWF0aC5yb3VuZChmb2N1cy56KSk7XG4gICAgbGV0IGNoYW5nZWQgPSBmYWxzZTtcblxuICAgIGNvbnN0IG1pc3Npbmc6IEFycmF5PHsgY3g6IG51bWJlcjsgY3o6IG51bWJlcjsgZDogbnVtYmVyIH0+ID0gW107XG4gICAgZm9yIChsZXQgZHogPSAtdGhpcy5uZWFyUmFkaXVzOyBkeiA8PSB0aGlzLm5lYXJSYWRpdXM7IGR6KyspIHtcbiAgICAgIGZvciAobGV0IGR4ID0gLXRoaXMubmVhclJhZGl1czsgZHggPD0gdGhpcy5uZWFyUmFkaXVzOyBkeCsrKSB7XG4gICAgICAgIGNvbnN0IGN4ID0gY2N4ICsgZHgsIGN6ID0gY2N6ICsgZHo7XG4gICAgICAgIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIGNvbnRpbnVlO1xuICAgICAgICBpZiAodGhpcy5sb2FkZWQuaGFzKGNodW5rS2V5KGN4LCBjeikpKSBjb250aW51ZTtcbiAgICAgICAgbWlzc2luZy5wdXNoKHsgY3gsIGN6LCBkOiBkeCAqIGR4ICsgZHogKiBkeiB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgbWlzc2luZy5zb3J0KChhLCBiKSA9PiBhLmQgLSBiLmQpO1xuICAgIGxldCBidWlsdCA9IDA7XG4gICAgZm9yIChjb25zdCBtIG9mIG1pc3NpbmcpIHtcbiAgICAgIGlmICghaW1tZWRpYXRlICYmIGJ1aWx0ID4gMCAmJiBwZXJmb3JtYW5jZS5ub3coKSAtIGZyYW1lU3RhcnQgPj0gdGhpcy5mcmFtZUJ1ZGdldE1zKSBicmVhaztcbiAgICAgIHRoaXMuYnVpbGRDaHVuayhtLmN4LCBtLmN6KTtcbiAgICAgIGJ1aWx0Kys7XG4gICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICB9XG4gICAgdGhpcy5wZW5kaW5nQ2h1bmtzID0gbWlzc2luZy5sZW5ndGggLSBidWlsdDtcblxuICAgIGNvbnN0IG1hcmdpbiA9IHRoaXMubmVhclJhZGl1cyArIDE7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgWy4uLnRoaXMubG9hZGVkXSkge1xuICAgICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICAgIGlmIChNYXRoLmFicyhjeCAtIGNjeCkgPiBtYXJnaW4gfHwgTWF0aC5hYnMoY3ogLSBjY3opID4gbWFyZ2luKSB7XG4gICAgICAgIHRoaXMuZGlzcG9zZUNodW5rKGtleSk7XG4gICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjaGFuZ2VkKSB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ2h1bmsoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gICAgY29uc3QgZ2VuQmVmb3JlID0gdGhpcy53b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXM7XG4gICAgY29uc3QgY2h1bmtzQmVmb3JlID0gdGhpcy53b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQ7XG4gICAgLy8gRW5zdXJlIHRoZSAzeDMgbmVpZ2hib3VyaG9vZCBleGlzdHMgc28gYm91bmRhcnkgZmFjZXMgdXNlIHJlYWwgZGF0YS5cbiAgICBmb3IgKGxldCBkeiA9IC0xOyBkeiA8PSAxOyBkeisrKSB7XG4gICAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSAxOyBkeCsrKSBlbnN1cmVDaHVuayh0aGlzLndvcmxkLCBjeCArIGR4LCBjeiArIGR6KTtcbiAgICB9XG4gICAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh0aGlzLndvcmxkLCBjeCwgY3opO1xuICAgIGlmICghY2h1bmspIHJldHVybjtcbiAgICBjb25zdCBnZW5lcmF0ZWQgPSB0aGlzLndvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCAtIGNodW5rc0JlZm9yZTtcbiAgICBpZiAoZ2VuZXJhdGVkID4gMCkge1xuICAgICAgcmVjb3JkU2FtcGxlKHRoaXMuY2h1bmtHZW5TYW1wbGVzLCAodGhpcy53b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgLSBnZW5CZWZvcmUpIC8gZ2VuZXJhdGVkKTtcbiAgICB9XG5cbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgdGhpcy5uZWFyR3JvdXAucmVtb3ZlKGV4aXN0aW5nLm1lc2gpO1xuICAgICAgZXhpc3RpbmcubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICBpZiAoZXhpc3Rpbmcud2F0ZXIpIHsgdGhpcy53YXRlckdyb3VwLnJlbW92ZShleGlzdGluZy53YXRlcik7IGV4aXN0aW5nLndhdGVyLmdlb21ldHJ5LmRpc3Bvc2UoKTsgfVxuICAgIH1cblxuICAgIGNvbnN0IG1lc2hUMCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIGNvbnN0IHsgZ2VvbWV0cnksIHRyaWFuZ2xlcyB9ID0gbWVzaENodW5rKHRoaXMud29ybGQsIGNodW5rKTtcbiAgICByZWNvcmRTYW1wbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCBwZXJmb3JtYW5jZS5ub3coKSAtIG1lc2hUMCk7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCB0ZXJyYWluTWF0ZXJpYWwpO1xuICAgIG1lc2gubmFtZSA9IGB2b3hlbF9jaHVua18ke2N4fV8ke2N6fWA7XG4gICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgICB0aGlzLm5lYXJHcm91cC5hZGQobWVzaCk7XG4gICAgY29uc3Qgd2F0ZXIgPSBtZXNoQ2h1bmtXYXRlcih0aGlzLndvcmxkLCBjaHVuayk7XG4gICAgaWYgKHdhdGVyKSB0aGlzLndhdGVyR3JvdXAuYWRkKHdhdGVyKTtcbiAgICB0aGlzLmNodW5rcy5zZXQoa2V5LCB7IG1lc2gsIHdhdGVyLCB0cmlhbmdsZXM6IHRyaWFuZ2xlcyArICh3YXRlcj8udXNlckRhdGEud2F0ZXJUcmlhbmdsZXMgPz8gMCkgfSk7XG4gICAgdGhpcy5sb2FkZWQuYWRkKGtleSk7XG4gICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgfVxuXG4gIHByaXZhdGUgZGlzcG9zZUNodW5rKGtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgdmlldyA9IHRoaXMuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICh2aWV3KSB7XG4gICAgICB0aGlzLm5lYXJHcm91cC5yZW1vdmUodmlldy5tZXNoKTtcbiAgICAgIHZpZXcubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICBpZiAodmlldy53YXRlcikgeyB0aGlzLndhdGVyR3JvdXAucmVtb3ZlKHZpZXcud2F0ZXIpOyB2aWV3LndhdGVyLmdlb21ldHJ5LmRpc3Bvc2UoKTsgfVxuICAgICAgdGhpcy5jaHVua3MuZGVsZXRlKGtleSk7XG4gICAgfVxuICAgIHRoaXMubG9hZGVkLmRlbGV0ZShrZXkpO1xuICAgIGlmICh0aGlzLnBpbm5lZC5oYXMoa2V5KSkgcmV0dXJuO1xuICAgIHRoaXMud29ybGQuZGlydHkuZGVsZXRlKGtleSk7XG4gICAgZXZpY3RDaHVuayh0aGlzLndvcmxkLCBrZXkpO1xuICB9XG5cbiAgcHJpdmF0ZSByZWJ1aWxkQ2h1bmsoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgIHRoaXMuYnVpbGRDaHVuayhjeCwgY3opO1xuICB9XG5cbiAgLyoqIFJlLW1lc2ggZGlydHkgbG9hZGVkIGNodW5rcyBuZWFyZXN0LWZpcnN0LCBzaGFyaW5nIHRoZSBmcmFtZSBidWRnZXQuICovXG4gIHByaXZhdGUgcmVidWlsZERpcnR5KGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBmcmFtZVN0YXJ0OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBjY3ggPSB3b3JsZFRvQ2h1bmtYKE1hdGgucm91bmQoZm9jdXMueCkpO1xuICAgIGNvbnN0IGNjeiA9IHdvcmxkVG9DaHVua1ooTWF0aC5yb3VuZChmb2N1cy56KSk7XG4gICAgY29uc3QgZGlydHk6IEFycmF5PHsga2V5OiBzdHJpbmc7IGQ6IG51bWJlciB9PiA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHRoaXMubG9hZGVkKSB7XG4gICAgICBpZiAoIXRoaXMud29ybGQuZGlydHkuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICAgIGRpcnR5LnB1c2goeyBrZXksIGQ6IChjeCAtIGNjeCkgKiogMiArIChjeiAtIGNjeikgKiogMiB9KTtcbiAgICB9XG4gICAgaWYgKGRpcnR5Lmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgIGRpcnR5LnNvcnQoKGEsIGIpID0+IGEuZCAtIGIuZCk7XG4gICAgbGV0IHJlYnVpbHQgPSAwO1xuICAgIGZvciAoY29uc3QgeyBrZXkgfSBvZiBkaXJ0eSkge1xuICAgICAgaWYgKHJlYnVpbHQgPiAwICYmIHBlcmZvcm1hbmNlLm5vdygpIC0gZnJhbWVTdGFydCA+PSB0aGlzLmZyYW1lQnVkZ2V0TXMpIGJyZWFrO1xuICAgICAgdGhpcy5yZWJ1aWxkQ2h1bmsoa2V5KTtcbiAgICAgIHJlYnVpbHQrKztcbiAgICB9XG4gICAgaWYgKHJlYnVpbHQgPiAwKSB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gIH1cblxuICAvKipcbiAgICogQ2h1bmsgbGlmZXRpbWUgcG9saWN5LiBNZXNoaW5nIGdlbmVyYXRlcyBhIHJpbmcgb2YgbmVpZ2hib3VyIGNodW5rcywgYW5kXG4gICAqIHNpbXVsYXRpb24gcXVlcmllcyBjYW4gZ2VuZXJhdGUgbW9yZTsgbm9uZSBvZiB0aG9zZSB3ZXJlIGV2ZXIgcmVsZWFzZWQuXG4gICAqIFJlc2lkZW50IGNodW5rIGJ5dGVzIGFyZSBkZXJpdmVkIChyZWdlbmVyYXRlZCBmcm9tIHNlZWQgKyBkdXJhYmxlIGVkaXRzKSxcbiAgICogc28gYW55dGhpbmcgb3V0c2lkZSB0aGUga2VlcCByYWRpdXMgdGhhdCBpcyBub3QgbG9hZGVkIG9yIHBpbm5lZCBpcyBmcmVlZC5cbiAgICovXG4gIHByaXZhdGUgc3dlZXBSZXNpZGVudChmb2N1czogVEhSRUUuVmVjdG9yMyk6IHZvaWQge1xuICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICBjb25zdCBrZWVwID0gdGhpcy5uZWFyUmFkaXVzICsgMjtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbLi4udGhpcy53b3JsZC5jaHVua3Mua2V5cygpXSkge1xuICAgICAgaWYgKHRoaXMubG9hZGVkLmhhcyhrZXkpIHx8IHRoaXMucGlubmVkLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgICBpZiAoTWF0aC5hYnMoY3ggLSBjY3gpIDw9IGtlZXAgJiYgTWF0aC5hYnMoY3ogLSBjY3opIDw9IGtlZXApIGNvbnRpbnVlO1xuICAgICAgZXZpY3RDaHVuayh0aGlzLndvcmxkLCBrZXkpO1xuICAgICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgICAgIHRoaXMuc3dlcHRDaHVua3MrKztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogS2VlcCB0aGUgY2h1bmtzIHVuZGVyIGEgd29ybGQtc3BhY2UgcmVjdGFuZ2xlIHJlc2lkZW50IChmb3IgZXhhbXBsZSB0aGVcbiAgICogc2V0dGxlbWVudCBlbnZlbG9wZSB0aGF0IGNvbnN0cnVjdGlvbiBwcmV2aWV3cyBxdWVyeSBzZXZlcmFsIHRpbWVzIGEgc2Vjb25kKS5cbiAgICovXG4gIHBpblJlY3QobWluWDogbnVtYmVyLCBtaW5aOiBudW1iZXIsIG1heFg6IG51bWJlciwgbWF4WjogbnVtYmVyKTogdm9pZCB7XG4gICAgZm9yIChsZXQgY3ogPSB3b3JsZFRvQ2h1bmtaKG1pblopIC0gMTsgY3ogPD0gd29ybGRUb0NodW5rWihtYXhaKSArIDE7IGN6KyspIHtcbiAgICAgIGZvciAobGV0IGN4ID0gd29ybGRUb0NodW5rWChtaW5YKSAtIDE7IGN4IDw9IHdvcmxkVG9DaHVua1gobWF4WCkgKyAxOyBjeCsrKSB7XG4gICAgICAgIGlmIChjeCA+PSAwICYmIGN6ID49IDAgJiYgY3ggPCBDSFVOS1NfUEVSX1NJREUgJiYgY3ogPCBDSFVOS1NfUEVSX1NJREUpIHRoaXMucGlubmVkLmFkZChjaHVua0tleShjeCwgY3opKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgcmVzaWRlbnRDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMud29ybGQuY2h1bmtzLnNpemU7IH1cbiAgZ2V0IHBlbmRpbmdDaHVua0J1aWxkcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wZW5kaW5nQ2h1bmtzOyB9XG4gIGdldCBldmljdGVkQnlTd2VlcCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5zd2VwdENodW5rczsgfVxuXG4gIHJlYnVpbGRBcm91bmQoeDogbnVtYmVyLCB6OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgICBmb3IgKGxldCBkeiA9IC0xOyBkeiA8PSAxOyBkeisrKSB7XG4gICAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSAxOyBkeCsrKSB7XG4gICAgICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4ICsgZHgsIGN6ICsgZHopO1xuICAgICAgICBpZiAodGhpcy5sb2FkZWQuaGFzKGtleSkpIHRoaXMucmVidWlsZENodW5rKGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMub25DaHVua3NDaGFuZ2VkPy4oKTtcbiAgICBpZiAodGhpcy5tYWNybykgdGhpcy5yZWJ1aWxkTWFjcm8odGhpcy5tYWNyb0ZvY3VzLCB0aGlzLm1vZGUsIHRydWUpO1xuICB9XG5cbiAgcHJpdmF0ZSByZWJ1aWxkTWFjcm8oZm9jdXM6IFRIUkVFLlZlY3RvcjMsIG1vZGU6IFZpZXdNb2RlLCBmb3JjZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmICghZm9yY2UgJiYgdGhpcy5tYWNyb01vZGUgPT09IG1vZGUpIHtcbiAgICAgIGNvbnN0IG1vdmVkID0gTWF0aC5oeXBvdChmb2N1cy54IC0gdGhpcy5tYWNyb0ZvY3VzLngsIGZvY3VzLnogLSB0aGlzLm1hY3JvRm9jdXMueik7XG4gICAgICBpZiAobW9kZSA9PT0gJ21hcCcgfHwgbW92ZWQgPD0gNDgpIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbWFjcm9UMCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIGlmICh0aGlzLm1hY3JvKSB7XG4gICAgICB0aGlzLm1hY3JvR3JvdXAucmVtb3ZlKHRoaXMubWFjcm8pO1xuICAgICAgdGhpcy5tYWNyby5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICB0aGlzLm1hY3JvID0gbnVsbDtcbiAgICB9XG4gICAgY29uc3Qgc3RlcCA9IG1vZGUgPT09ICdtYXAnID8gdGhpcy5tYXBNYWNyb1N0ZXAgOiB0aGlzLndvcmxkTWFjcm9TdGVwO1xuICAgIGxldCBob2xlOiBNYWNyb0hvbGUgfCB1bmRlZmluZWQ7XG4gICAgaWYgKG1vZGUgIT09ICdtYXAnKSB7XG4gICAgICBjb25zdCBjY3ggPSB3b3JsZFRvQ2h1bmtYKE1hdGgucm91bmQoZm9jdXMueCkpO1xuICAgICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICAgIGhvbGUgPSB7XG4gICAgICAgIG1pblg6IGNodW5rT3JpZ2luWChjY3ggLSB0aGlzLm5lYXJSYWRpdXMpLFxuICAgICAgICBtYXhYOiBjaHVua09yaWdpblgoY2N4ICsgdGhpcy5uZWFyUmFkaXVzKSArIENIVU5LX1NJWkUsXG4gICAgICAgIG1pblo6IGNodW5rT3JpZ2luWihjY3ogLSB0aGlzLm5lYXJSYWRpdXMpLFxuICAgICAgICBtYXhaOiBjaHVua09yaWdpblooY2N6ICsgdGhpcy5uZWFyUmFkaXVzKSArIENIVU5LX1NJWkUsXG4gICAgICB9O1xuICAgICAgdGhpcy5mYXJXYXRlckhvbGUudmFsdWUuc2V0KGhvbGUubWluWCwgaG9sZS5taW5aLCBob2xlLm1heFgsIGhvbGUubWF4Wik7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGJ1aWxkTWFjcm9NZXNoKHRoaXMud29ybGQsIHsgc3RlcCwgaG9sZSB9KTtcbiAgICB0aGlzLm1hY3JvID0gcmVzdWx0Lm1lc2g7XG4gICAgdGhpcy5tYWNyb1RyaWFuZ2xlcyA9IHJlc3VsdC50cmlhbmdsZXM7XG4gICAgdGhpcy5tYWNyb0dyb3VwLmFkZChyZXN1bHQubWVzaCk7XG4gICAgdGhpcy5tYWNyb0ZvY3VzLmNvcHkoZm9jdXMpO1xuICAgIHRoaXMubWFjcm9Nb2RlID0gbW9kZTtcbiAgICB0aGlzLm1hY3JvRWRpdEtleSA9IG1hY3JvRWRpdEtleSh0aGlzLndvcmxkKTtcbiAgICByZWNvcmRTYW1wbGUodGhpcy5tYWNyb1NhbXBsZXMsIHBlcmZvcm1hbmNlLm5vdygpIC0gbWFjcm9UMCk7XG4gICAgaWYgKHJlc3VsdC5zYW1wbGVDYWNoZWQpIHRoaXMubWFjcm9DYWNoZUhpdHMrKztcbiAgICBlbHNlIHJlY29yZFNhbXBsZSh0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcywgcmVzdWx0LnNhbXBsZU1zKTtcbiAgfVxuXG4gIGdldCBsb2FkZWRDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubG9hZGVkLnNpemU7IH1cbiAgZ2V0IGxvYWRlZENodW5rS2V5cygpOiBSZWFkb25seVNldDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMubG9hZGVkOyB9XG4gIGdldCBuZWFyVHJpYW5nbGVzKCk6IG51bWJlciB7XG4gICAgbGV0IHQgPSAwO1xuICAgIGZvciAoY29uc3QgdiBvZiB0aGlzLmNodW5rcy52YWx1ZXMoKSkgdCArPSB2LnRyaWFuZ2xlcztcbiAgICByZXR1cm4gdDtcbiAgfVxuICBnZXQgbWFjcm9UcmlhbmdsZUNvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm1hY3JvVHJpYW5nbGVzOyB9XG4gIGdldCBkcmF3Q2FsbHMoKTogbnVtYmVyIHtcbiAgICBsZXQgd2F0ZXIgPSAwO1xuICAgIGZvciAoY29uc3QgdiBvZiB0aGlzLmNodW5rcy52YWx1ZXMoKSkgaWYgKHYud2F0ZXIpIHdhdGVyKys7XG4gICAgcmV0dXJuIHRoaXMubG9hZGVkLnNpemUgKyB3YXRlciArICh0aGlzLm1hY3JvID8gMSA6IDApICsgMTtcbiAgfVxuICBnZXQgbmVhclJhZGl1c0NodW5rcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5uZWFyUmFkaXVzOyB9XG4gIC8qKiBDbGVhciB0aGUgcm9sbGluZyB0aW1pbmcgd2luZG93IGJlZm9yZSBhIG1lYXN1cmVtZW50IHJ1bi4gKi9cbiAgcmVzZXRQZXJmKCk6IHZvaWQge1xuICAgIHRoaXMuY2h1bmtHZW5TYW1wbGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5jaHVua01lc2hTYW1wbGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5tYWNyb1NhbXBsZXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcy5sZW5ndGggPSAwO1xuICAgIHRoaXMubWFjcm9DYWNoZUhpdHMgPSAwO1xuICB9XG4gIC8qKiBSb2xsaW5nIGJ1aWxkIHRpbWluZ3MgaW4gbWlsbGlzZWNvbmRzLCBmb3IgdGhlIHBlcmZvcm1hbmNlIGV2aWRlbmNlLiAqL1xuICBnZXQgc3RyZWFtUGVyZigpOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgICByZXR1cm4ge1xuICAgICAgY2h1bmtHZW5QNTA6IHBlcmNlbnRpbGUodGhpcy5jaHVua0dlblNhbXBsZXMsIDAuNSksXG4gICAgICBjaHVua0dlblA5NTogcGVyY2VudGlsZSh0aGlzLmNodW5rR2VuU2FtcGxlcywgMC45NSksXG4gICAgICBjaHVua0dlbk1heDogcGVyY2VudGlsZSh0aGlzLmNodW5rR2VuU2FtcGxlcywgMSksXG4gICAgICBjaHVua01lc2hQNTA6IHBlcmNlbnRpbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCAwLjUpLFxuICAgICAgY2h1bmtNZXNoUDk1OiBwZXJjZW50aWxlKHRoaXMuY2h1bmtNZXNoU2FtcGxlcywgMC45NSksXG4gICAgICBjaHVua01lc2hNYXg6IHBlcmNlbnRpbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCAxKSxcbiAgICAgIG1hY3JvUDUwOiBwZXJjZW50aWxlKHRoaXMubWFjcm9TYW1wbGVzLCAwLjUpLFxuICAgICAgbWFjcm9NYXg6IHBlcmNlbnRpbGUodGhpcy5tYWNyb1NhbXBsZXMsIDEpLFxuICAgICAgbWFjcm9TYW1wbGVQNTA6IHBlcmNlbnRpbGUodGhpcy5tYWNyb1NhbXBsZVNhbXBsZXMsIDAuNSksXG4gICAgICBtYWNyb1NhbXBsZU1heDogcGVyY2VudGlsZSh0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcywgMSksXG4gICAgICBtYWNyb0NhY2hlSGl0czogdGhpcy5tYWNyb0NhY2hlSGl0cyxcbiAgICAgIGNodW5rU2FtcGxlczogdGhpcy5jaHVua0dlblNhbXBsZXMubGVuZ3RoLFxuICAgICAgbWFjcm9TYW1wbGVzOiB0aGlzLm1hY3JvU2FtcGxlcy5sZW5ndGgsXG4gICAgfTtcbiAgfVxufVxuIiwgIntcbiAgXCJzY2hlbWFcIjogXCJwYWxldHRlX3YyXCIsXG4gIFwiZGF0ZVwiOiBcIjIwMjYtMTAtMjJcIixcbiAgXCJzdGF0dXNcIjogXCJwcm9wb3NlZFwiLFxuICBcInNvdXJjZVwiOiBcIlJFRi0wMDIgKGh5YnJpZCB3b3JsZCByZWZlcmVuY2UpLCB2YWx1ZXMgc2FtcGxlZCBieSBleWU7IG51bWVyaWMgdmVyaWZpY2F0aW9uIHBlbmRpbmdcIixcbiAgXCJub3RlXCI6IFwiT25lIG1hdGVyaWFsIHBhbGV0dGUuIFRpbWUgb2YgZGF5IGlzIGV4cHJlc3NlZCBieSB0aGUgbGlnaHRpbmcgcHJlc2V0cyBiZWxvdywgbm90IGJ5IHJlcGFpbnRpbmcgbWF0ZXJpYWxzLlwiLFxuICBcIm1hdGVyaWFsc1wiOiB7XG4gICAgXCJncmFzc190b3BcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNzlCOTRDXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgbG93IGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX2hpZ2hcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEZDOTVFXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgbWlkIGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX3BlYWtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUFEMDZBXCIsXG4gICAgICBcInJvbGVcIjogXCJ0ZXJyYWluIHRvcCwgaGlnaCBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19jYXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUU5NDQwXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC4wLTAuNCBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0cmF0YV9vY2hyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNDOTlBNUZcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjQtMC42MiBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0cmF0YV9ydXN0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0I0NjMzQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuNjItMC44MCBtIGJlbG93IHRvcFwiXG4gICAgfSxcbiAgICBcInN0b25lX3RvcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFNkRGQ0NcIixcbiAgICAgIFwicm9sZVwiOiBcImJhcmUgc3RvbmUgdG9wIHN1cmZhY2VcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9ib2R5X2FcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRENEM0JFXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJvZHksIGV2ZW4gNC41IG0gYmFuZFwiXG4gICAgfSxcbiAgICBcInN0b25lX2JvZHlfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEMUM3QUZcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYm9keSwgb2RkIDQuNSBtIGJhbmRcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9zaGFkZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCOUFFOTZcIixcbiAgICAgIFwicm9sZVwiOiBcImNyZXZpY2UgLyByZWNlc3NlZCBzdG9uZSBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJzYW5kXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0UzRDNBNlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2hvcmUgY2VsbHNcIlxuICAgIH0sXG4gICAgXCJzbm93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0VFRjFGNVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ2VuZXJhdG9yIHYyIHNub3dmaWVsZHMgYWJvdmUgdGhlIHNub3dsaW5lIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9za2luXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0Q5QTc3RVwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIHNraW4gKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3R1bmljXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0IzNEEzQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiZm91bmRlciB0dW5pYywgd2FybSByZWQgYWNjZW50IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90dW5pY19hbHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkU4Qzg2XCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlciB0dW5pYywgdGVhbCBhY2NlbnQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3Ryb3VzZXJzXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVCNDYzNlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIHRyb3VzZXJzIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9oYWlyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRBMzMyNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIGhhaXIgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX2Jvb3RzXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzMzMjgxRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2hhcmFjdGVyIGJvb3RzIGFuZCBiZWx0IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfZGVlclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4QzVCM0FcIixcbiAgICAgIFwicm9sZVwiOiBcInJlZCBkZWVyIGNvYXQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV9saWdodFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEQ0M3QTRcIixcbiAgICAgIFwicm9sZVwiOiBcImRlZXIgYmVsbHksIGhhcmUgdGFpbCwgYW50bGVyIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfaGFyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QTg2NzBcIixcbiAgICAgIFwicm9sZVwiOiBcImhhcmUgY29hdCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX3Ryb3V0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGN0Y1RVwiLFxuICAgICAgXCJyb2xlXCI6IFwidHJvdXQgYmFjayAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX3Ryb3V0X2JlbGx5XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0Q4QzlBM1wiLFxuICAgICAgXCJyb2xlXCI6IFwidHJvdXQgYmVsbHkgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9zaGFsbG93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzY3Q0ZEOFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggPD0gMC41IG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9taWRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0FBRkM0XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCB+MS41IG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9kZWVwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJBOEZBOFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggPj0gNC4wIG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9yaW1cIjoge1xuICAgICAgXCJoZXhcIjogXCIjQkZFQUYwXCIsXG4gICAgICBcInJvbGVcIjogXCJzaG9yZWxpbmUgcmltIC8gZm9hbSB0aW50XCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2FcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUZBODNGXCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2RkI4NEFcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2NcIjoge1xuICAgICAgXCJoZXhcIjogXCIjN0ZDMzU2XCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIGhpZ2hsaWdodCBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X3BpbmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRjJBNkM0XCIsXG4gICAgICBcInJvbGVcIjogXCJibG9zc29tIGFjY2VudCBzcGVjaWVzIG9ubHlcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfcGlua19iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U4OEZCMlwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmxvc3NvbSBzaGFkZSBtYXNzXCJcbiAgICB9LFxuICAgIFwidHJ1bmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkI0QTMzXCIsXG4gICAgICBcInJvbGVcIjogXCJ0cmVlIHRydW5rc1wiXG4gICAgfSxcbiAgICBcImJhcmtfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM0RTM2MjZcIixcbiAgICAgIFwicm9sZVwiOiBcInRydW5rIHNoYWRlLCBzdHVtcHNcIlxuICAgIH0sXG4gICAgXCJvcmVfY3J5c3RhbFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM3QjVBRDZcIixcbiAgICAgIFwicm9sZVwiOiBcIm9yZSBkZXBvc2l0IGFjY2VudCAocHJvcG9zZWQsIHJlcGxhY2VzIHRlYWwpXCJcbiAgICB9LFxuICAgIFwib3JlX2NyeXN0YWxfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QjdCRThcIixcbiAgICAgIFwicm9sZVwiOiBcIm9yZSBoaWdobGlnaHQgZmFjZXRcIlxuICAgIH0sXG4gICAgXCJub3hlbF9zdG9uZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFNkRGQ0NcIixcbiAgICAgIFwicm9sZVwiOiBcIk5veGVsIGFyY2hpdGVjdHVyZSBtYWluIHN0b25lXCJcbiAgICB9LFxuICAgIFwibm94ZWxfc3RvbmVfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEM0M5QjRcIixcbiAgICAgIFwicm9sZVwiOiBcIk5veGVsIHNlY29uZGFyeSBzdG9uZSAvIHJlY2Vzc1wiXG4gICAgfSxcbiAgICBcImFjY2VudF9ibHVlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNFN0ZCOFwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmFubmVyIC8gY2xvdGggYWNjZW50XCJcbiAgICB9LFxuICAgIFwiYWNjZW50X3RlYWxcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkZBNkEwXCIsXG4gICAgICBcInJvbGVcIjogXCJzZWNvbmRhcnkgYWNjZW50XCJcbiAgICB9LFxuICAgIFwiZW1pc3NpdmVfZmlyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNGRjlFNEFcIixcbiAgICAgIFwicm9sZVwiOiBcImNhbXBmaXJlIC8gd2FybSBlbWlzc2l2ZSAoZWZmZWN0cyBvbmx5KVwiXG4gICAgfSxcbiAgICBcImVtaXNzaXZlX21hZ2ljXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QyNEJGRlwiLFxuICAgICAgXCJyb2xlXCI6IFwicmVzZXJ2ZWQ6IG1hZ2ljIGVmZmVjdHMgb25seSwgbmV2ZXIgbWF0ZXJpYWxzXCJcbiAgICB9XG4gIH0sXG4gIFwibGlnaHRpbmdcIjoge1xuICAgIFwiZGF3blwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiAxMixcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAxMDUsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGQzc5QVwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMi4yLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzhGQTZDOFwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzRFNUY2RVwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDAuNixcbiAgICAgIFwic2t5XCI6IFwiI0E4QkVENlwiLFxuICAgICAgXCJmb2dcIjogXCIjQThCRUQ2XCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDUsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMVxuICAgIH0sXG4gICAgXCJub29uXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDM4LFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDUwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkY0RENcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDIuNzUsXG4gICAgICBcImhlbWlTa3lcIjogXCIjQkZEOUYyXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjN0E4RjU1XCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMC41NSxcbiAgICAgIFwic2t5XCI6IFwiIzlFRDJFRVwiLFxuICAgICAgXCJmb2dcIjogXCIjRENFRkY4XCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDI4LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjA1XG4gICAgfSxcbiAgICBcImR1c2tcIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogOSxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAyNTAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGQjI3QVwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMy4yLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzhFN0M5RVwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzVBNEE1MFwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDEuMSxcbiAgICAgIFwic2t5XCI6IFwiI0M5OEU4NlwiLFxuICAgICAgXCJmb2dcIjogXCIjQzA5MDhBXCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDM2LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjMyXG4gICAgfSxcbiAgICBcIm5pZ2h0XCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDQwLFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDIyMCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjQUZDOEZGXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAxLjAsXG4gICAgICBcImhlbWlTa3lcIjogXCIjM0E0QzdBXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjMUMyNTQwXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMS4wNSxcbiAgICAgIFwic2t5XCI6IFwiIzEwMTczNlwiLFxuICAgICAgXCJmb2dcIjogXCIjMTUxQzNDXCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDQ1LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjVcbiAgICB9XG4gIH1cbn0iLCAiLy8gUmVuZGVyIGxheWVyIFx1MjAxNCBuZWFyIHdhdGVyIHN1cmZhY2VzIGJ1aWx0IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd2F0ZXIgdm94ZWxzLlxuLy9cbi8vIEdlb21ldHJ5IGNvbWVzIGZyb20gdGhlIHZveGVsIHZvbHVtZSAoc28gZWRpdHMsIGR1ZyBwaXRzIGFuZCB0aGUgdjIgbW91bnRhaW5cbi8vIHJpdmVyIGFyZSBleGFjdCkuIEVhY2ggd2F0ZXIgY29sdW1uJ3MgdG9wIGdldHMgYSBxdWFkIGNhcnJ5aW5nOlxuLy8gICBhRmxvdyAgXHUyMDE0IHN1cmZhY2UgY3VycmVudCAoZGlyZWN0aW9uICogc3BlZWQsIG0vcykgZnJvbSBzaW0gSHlkcm9sb2d5LFxuLy8gICBhRGVwdGggXHUyMDE0IHdhdGVyIGRlcHRoIHRvIHRoZSBiZWQgKG1ldHJlcyksXG4vLyAgIGFGb2FtICBcdTIwMTQgc2hvcmUgLyBjYXNjYWRlIGZvYW0gd2VpZ2h0LlxuLy8gV2hlcmUgYSB3YXRlciBzdXJmYWNlIHN0YW5kcyBhYm92ZSBhIGxvd2VyIG5laWdoYm91ciAoYSBjYXNjYWRlIG9yIGZhbGwpLCBhXG4vLyB2ZXJ0aWNhbCBzaGVldCBpcyBlbWl0dGVkIGRvd24gdG8gdGhlIG5laWdoYm91cidzIHN1cmZhY2UuXG4vL1xuLy8gSHlkcm9sb2d5IGlzIHNpbXVsYXRpb24gZGF0YTsgcmlwcGxlcywgZm9hbSBhbmQgdHJhbnNwYXJlbmN5IGhlcmUgYXJlXG4vLyBwcmVzZW50YXRpb24gb25seSBhbmQgbmV2ZXIgZmVlZCBiYWNrIGludG8gc3RhdGUuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQge1xuICBXb3JsZCwgVm94ZWxDaHVuaywgTUFULCBDSFVOS19TSVpFLCBZX01JTiwgWV9NQVgsIGlzU29saWQsXG4gIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCwgZ2V0Vm94ZWwsIGh5ZHJvbG9neUZvcixcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcblxuY29uc3QgTSA9IHBhbGV0dGUubWF0ZXJpYWxzIGFzIFJlY29yZDxzdHJpbmcsIHsgaGV4OiBzdHJpbmcgfT47XG5jb25zdCBIID0gKGs6IHN0cmluZykgPT4gbmV3IFRIUkVFLkNvbG9yKE1ba10uaGV4KTtcblxuLyoqIFNoYXJlZCB0aW1lIHVuaWZvcm0gZm9yIGV2ZXJ5IHdhdGVyIG1hdGVyaWFsLiAqL1xuZXhwb3J0IGNvbnN0IHdhdGVyVGltZSA9IHsgdmFsdWU6IDAgfTtcblxuZnVuY3Rpb24gbWFrZVdhdGVyTWF0ZXJpYWwoKTogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCB7XG4gIGNvbnN0IG1hdCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICB2ZXJ0ZXhDb2xvcnM6IHRydWUsIHRyYW5zcGFyZW50OiB0cnVlLCBkZXB0aFdyaXRlOiBmYWxzZSwgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcbiAgfSk7XG4gIG1hdC5vbkJlZm9yZUNvbXBpbGUgPSAoc2hhZGVyKSA9PiB7XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVUaW1lID0gd2F0ZXJUaW1lO1xuICAgIHNoYWRlci51bmlmb3Jtcy51U2hhbGxvdyA9IHsgdmFsdWU6IEgoJ3dhdGVyX3NoYWxsb3cnKSB9O1xuICAgIHNoYWRlci51bmlmb3Jtcy51TWlkID0geyB2YWx1ZTogSCgnd2F0ZXJfbWlkJykgfTtcbiAgICBzaGFkZXIudW5pZm9ybXMudURlZXAgPSB7IHZhbHVlOiBIKCd3YXRlcl9kZWVwJykgfTtcbiAgICBzaGFkZXIudW5pZm9ybXMudVJpbSA9IHsgdmFsdWU6IEgoJ3dhdGVyX3JpbScpIH07XG4gICAgc2hhZGVyLnZlcnRleFNoYWRlciA9IHNoYWRlci52ZXJ0ZXhTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsIGAjaW5jbHVkZSA8Y29tbW9uPlxuYXR0cmlidXRlIHZlYzIgYUZsb3c7XG5hdHRyaWJ1dGUgZmxvYXQgYURlcHRoO1xuYXR0cmlidXRlIGZsb2F0IGFGb2FtO1xuYXR0cmlidXRlIGZsb2F0IGFTaGVldDtcbnZhcnlpbmcgdmVjMiB2RmxvdztcbnZhcnlpbmcgZmxvYXQgdkRlcHRoO1xudmFyeWluZyBmbG9hdCB2Rm9hbTtcbnZhcnlpbmcgZmxvYXQgdlNoZWV0O1xudmFyeWluZyB2ZWMzIHZXb3JsZFBvc1c7YClcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PicsIGAjaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxudkZsb3cgPSBhRmxvdzsgdkRlcHRoID0gYURlcHRoOyB2Rm9hbSA9IGFGb2FtOyB2U2hlZXQgPSBhU2hlZXQ7XG52V29ybGRQb3NXID0gKG1vZGVsTWF0cml4ICogdmVjNCh0cmFuc2Zvcm1lZCwgMS4wKSkueHl6O2ApO1xuICAgIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgYCNpbmNsdWRlIDxjb21tb24+XG51bmlmb3JtIGZsb2F0IHVUaW1lO1xudW5pZm9ybSB2ZWMzIHVTaGFsbG93OyB1bmlmb3JtIHZlYzMgdU1pZDsgdW5pZm9ybSB2ZWMzIHVEZWVwOyB1bmlmb3JtIHZlYzMgdVJpbTtcbnZhcnlpbmcgdmVjMiB2RmxvdztcbnZhcnlpbmcgZmxvYXQgdkRlcHRoO1xudmFyeWluZyBmbG9hdCB2Rm9hbTtcbnZhcnlpbmcgZmxvYXQgdlNoZWV0O1xudmFyeWluZyB2ZWMzIHZXb3JsZFBvc1c7XG5mbG9hdCB3SGFzaCh2ZWMyIHApIHsgcmV0dXJuIGZyYWN0KHNpbihkb3QocCwgdmVjMigxMjcuMSwgMzExLjcpKSkgKiA0Mzc1OC41NDUzKTsgfVxuZmxvYXQgd05vaXNlKHZlYzIgcCkge1xuICB2ZWMyIGkgPSBmbG9vcihwKSwgZiA9IGZyYWN0KHApO1xuICBmID0gZiAqIGYgKiAoMy4wIC0gMi4wICogZik7XG4gIHJldHVybiBtaXgobWl4KHdIYXNoKGkpLCB3SGFzaChpICsgdmVjMigxLCAwKSksIGYueCksIG1peCh3SGFzaChpICsgdmVjMigwLCAxKSksIHdIYXNoKGkgKyB2ZWMyKDEsIDEpKSwgZi54KSwgZi55KTtcbn1gKVxuICAgICAgLnJlcGxhY2UoJ3ZlYzQgZGlmZnVzZUNvbG9yID0gdmVjNCggZGlmZnVzZSwgb3BhY2l0eSApOycsIGBcbmZsb2F0IHNwZWVkID0gbGVuZ3RoKHZGbG93KTtcbi8vIEFkdmVjdCB0aGUgcGF0dGVybiBkb3duc3RyZWFtLiBRdWFudGlzZWQgdG8gMC4yNSBtIGNlbGxzIHNvIHJpcHBsZXMgcmVhZCBhc1xuLy8gYmxvY2stYnVpbHQgZmFjZXRzIHJhdGhlciB0aGFuIHNtb290aCBncmFkaWVudHMuXG52ZWMyIHAgPSB2V29ybGRQb3NXLnh6O1xudmVjMiBhZHYgPSBwIC0gdkZsb3cgKiB1VGltZTtcbnZlYzIgY2VsbCA9IGZsb29yKGFkdiAqIDQuMCkgLyA0LjA7XG5mbG9hdCBuMSA9IHdOb2lzZShjZWxsICogMC41NSk7XG5mbG9hdCBuMiA9IHdOb2lzZShjZWxsICogMS43ICsgdmVjMih1VGltZSAqIDAuMDcsIC11VGltZSAqIDAuMDUpKTtcbmZsb2F0IHJpcHBsZSA9IG4xICogMC42ICsgbjIgKiAwLjQ7XG4vLyBTdGlsbCB3YXRlciAoc2VhLCBsYWtlKSBnZXRzIGEgc2xvdyBzd2VsbCBpbnN0ZWFkIG9mIGEgY3VycmVudC5cbmZsb2F0IHN3ZWxsID0gMC41ICsgMC41ICogc2luKGRvdChwLCB2ZWMyKDAuMTEsIDAuMDcpKSArIHVUaW1lICogMC42KTtcbnJpcHBsZSA9IG1peChtaXgocmlwcGxlLCBzd2VsbCwgMC41KSwgcmlwcGxlLCBjbGFtcChzcGVlZCAqIDIuMCwgMC4wLCAxLjApKTtcbmZsb2F0IGQgPSBjbGFtcCh2RGVwdGggLyA0LjAsIDAuMCwgMS4wKTtcbnZlYzMgd2F0ZXIgPSBtaXgodVNoYWxsb3csIHVNaWQsIHNtb290aHN0ZXAoMC4wLCAwLjUsIGQpKTtcbndhdGVyID0gbWl4KHdhdGVyLCB1RGVlcCwgc21vb3Roc3RlcCgwLjUsIDEuMCwgZCkpO1xud2F0ZXIgKj0gMC45ICsgMC4yICogcmlwcGxlO1xuLy8gU3RyZWFrcyBhbG9uZyBmYXN0IGN1cnJlbnQsIGZvYW0gYXQgc2hvcmVzIGFuZCBjYXNjYWRlcy5cbmZsb2F0IHN0cmVhayA9IHN0ZXAoMC43OCAtIGNsYW1wKHNwZWVkICogMC4wNiwgMC4wLCAwLjIpLCBuMikgKiBjbGFtcChzcGVlZCAqIDAuNSwgMC4wLCAxLjApO1xuZmxvYXQgZm9hbU5vaXNlID0gc3RlcCgwLjQ1LCB3Tm9pc2UoY2VsbCAqIDIuMyArIHVUaW1lICogMC4zKSk7XG5mbG9hdCBmb2FtID0gY2xhbXAodkZvYW0gKiBmb2FtTm9pc2UgKyBzdHJlYWsgKiAwLjYsIDAuMCwgMS4wKTtcbi8vIEZhbGxpbmcgc2hlZXRzOiBmYXN0IHZlcnRpY2FsIHN0cmVha3MuXG5pZiAodlNoZWV0ID4gMC41KSB7XG4gIGZsb2F0IGZhbGwgPSB3Tm9pc2UodmVjMihmbG9vcih2V29ybGRQb3NXLnggKiA0LjAgKyB2V29ybGRQb3NXLnogKiA0LjApLCBmbG9vcigodldvcmxkUG9zVy55ICsgdVRpbWUgKiAzLjUpICogMy4wKSkpO1xuICBmb2FtID0gbWF4KGZvYW0sIHN0ZXAoMC4zNSwgZmFsbCkpO1xufVxudmVjMyBjb2wgPSBtaXgod2F0ZXIsIHVSaW0gKiAxLjA4LCBmb2FtKTtcbmZsb2F0IGFscGhhID0gbWl4KDAuNTUsIDAuOSwgc21vb3Roc3RlcCgwLjQsIDMuMCwgdkRlcHRoKSk7XG5hbHBoYSA9IG1heChhbHBoYSwgZm9hbSAqIDAuOTUpO1xuaWYgKHZTaGVldCA+IDAuNSkgYWxwaGEgPSBtYXgoYWxwaGEsIDAuODIpO1xudmVjNCBkaWZmdXNlQ29sb3IgPSB2ZWM0KCBkaWZmdXNlICogY29sLCBhbHBoYSAqIG9wYWNpdHkgKTtgKTtcbiAgfTtcbiAgcmV0dXJuIG1hdDtcbn1cblxuZXhwb3J0IGNvbnN0IG5lYXJXYXRlck1hdGVyaWFsID0gbWFrZVdhdGVyTWF0ZXJpYWwoKTtcblxuLyoqIE1lc2ggdGhlIHdhdGVyIHN1cmZhY2VzIG9mIG9uZSBjaHVuazsgbnVsbCB3aGVuIHRoZSBjaHVuayBob2xkcyBubyB3YXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXNoQ2h1bmtXYXRlcih3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogVEhSRUUuTWVzaCB8IG51bGwge1xuICBjb25zdCBoeWRybyA9IGh5ZHJvbG9neUZvcih3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbik7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBsZXZlbHMgPSBuZXcgSW50MTZBcnJheShDSFVOS19TSVpFICogQ0hVTktfU0laRSkuZmlsbCgtOTk5OSk7XG4gIGNvbnN0IGJlZHMgPSBuZXcgSW50MTZBcnJheShDSFVOS19TSVpFICogQ0hVTktfU0laRSk7XG5cbiAgLy8gV2F0ZXIgc3VyZmFjZSBwZXIgY29sdW1uOiB0aGUgZmlyc3Qgbm9uLXdhdGVyIGNlbGwgYWJvdmUgdGhlIHdhdGVyIHRoYXRcbiAgLy8gc3RhbmRzIG9uIHRoaXMgY29sdW1uJ3Mgc29saWQgc3VyZmFjZS5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb25zdCBiZWQgPSBjaHVuay5oZWlnaHRzW2NvbF0gKyBZX01JTiArIDE7XG4gICAgICBsZXQgeSA9IGJlZDtcbiAgICAgIHdoaWxlICh5IDwgWV9NQVggJiYgY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9PT0gTUFULldBVEVSKSB5Kys7XG4gICAgICBpZiAoeSA+IGJlZCkgeyBsZXZlbHNbY29sXSA9IHk7IGJlZHNbY29sXSA9IGJlZDsgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHBvczogbnVtYmVyW10gPSBbXSwgbnJtOiBudW1iZXJbXSA9IFtdLCBjbHI6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGZsb3c6IG51bWJlcltdID0gW10sIGRlcHRoOiBudW1iZXJbXSA9IFtdLCBmb2FtOiBudW1iZXJbXSA9IFtdLCBzaGVldDogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgaWR4OiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBwdXNoID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG54OiBudW1iZXIsIG55OiBudW1iZXIsIG56OiBudW1iZXIsXG4gICAgZng6IG51bWJlciwgZno6IG51bWJlciwgZGVwOiBudW1iZXIsIGZvOiBudW1iZXIsIHNoOiBudW1iZXIpID0+IHtcbiAgICBwb3MucHVzaCh4LCB5LCB6KTsgbnJtLnB1c2gobngsIG55LCBueik7IGNsci5wdXNoKDEsIDEsIDEpO1xuICAgIGZsb3cucHVzaChmeCwgZnopOyBkZXB0aC5wdXNoKGRlcCk7IGZvYW0ucHVzaChmbyk7IHNoZWV0LnB1c2goc2gpO1xuICB9O1xuICBjb25zdCBxdWFkID0gKGJhc2U6IG51bWJlcikgPT4geyBpZHgucHVzaChiYXNlLCBiYXNlICsgMSwgYmFzZSArIDIsIGJhc2UsIGJhc2UgKyAyLCBiYXNlICsgMyk7IH07XG5cbiAgY29uc3QgbGV2ZWxBdCA9ICh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHJldHVybiBsZXZlbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICAgIC8vIE5laWdoYm91ciBjaHVuazogcmVhZCB0aGUgdm94ZWxzIChjaHVua3MgYXJlIGdlbmVyYXRlZCBpbiAzeDMgcmluZ3MgZm9yIG1lc2hpbmcpLlxuICAgIGxldCB5ID0gWV9NQVggLSAxO1xuICAgIHdoaWxlICh5ID4gWV9NSU4gJiYgIWlzU29saWQoZ2V0Vm94ZWwod29ybGQsIHd4LCB5LCB3eikpICYmIGdldFZveGVsKHdvcmxkLCB3eCwgeSwgd3opICE9PSBNQVQuV0FURVIpIHktLTtcbiAgICByZXR1cm4gZ2V0Vm94ZWwod29ybGQsIHd4LCB5LCB3eikgPT09IE1BVC5XQVRFUiA/IHkgKyAxIDogLTk5OTk7XG4gIH07XG5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb25zdCBsZXZlbCA9IGxldmVsc1tjb2xdO1xuICAgICAgaWYgKGxldmVsID09PSAtOTk5OSkgY29udGludWU7XG4gICAgICBjb25zdCB4ID0gb3ggKyBseCwgeiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBmID0gaHlkcm8uZmxvd0F0KHggKyAwLjUsIHogKyAwLjUsIGxldmVsKTtcbiAgICAgIGNvbnN0IGZ4ID0gZi5keCAqIGYuc3BlZWQsIGZ6ID0gZi5keiAqIGYuc3BlZWQ7XG4gICAgICBjb25zdCBkZXAgPSBsZXZlbCAtIGJlZHNbY29sXTtcbiAgICAgIGxldCBzaG9yZSA9IDA7XG4gICAgICBjb25zdCBzaWRlczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWzEsIDBdLCBbLTEsIDBdLCBbMCwgMV0sIFswLCAtMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBzaWRlcykge1xuICAgICAgICBjb25zdCBtID0gZ2V0Vm94ZWwod29ybGQsIHggKyBkeCwgbGV2ZWwgLSAxLCB6ICsgZHopO1xuICAgICAgICBpZiAoaXNTb2xpZChtKSkgc2hvcmUgPSAxO1xuICAgICAgfVxuICAgICAgY29uc3QgeSA9IGxldmVsIC0gMC4xO1xuICAgICAgY29uc3QgYmFzZSA9IHBvcy5sZW5ndGggLyAzO1xuICAgICAgY29uc3QgZm8gPSBNYXRoLm1heChzaG9yZSAqIDAuNjUsIE1hdGgubWluKDEsIGYuc3BlZWQgLyAzLjUpKTtcbiAgICAgIHB1c2goeCwgeSwgeiwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHB1c2goeCwgeSwgeiArIDEsIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBwdXNoKHggKyAxLCB5LCB6ICsgMSwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHB1c2goeCArIDEsIHksIHosIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBxdWFkKGJhc2UpO1xuXG4gICAgICAvLyBDYXNjYWRlIHNoZWV0cyB0b3dhcmQgbG93ZXIgd2F0ZXIgKG9yIG9wZW4gYWlyKSBvbiBhbnkgc2lkZS5cbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2Ygc2lkZXMpIHtcbiAgICAgICAgY29uc3QgbkxldmVsID0gbGV2ZWxBdCh4ICsgZHgsIHogKyBkeiwgbHggKyBkeCwgbHogKyBkeik7XG4gICAgICAgIGlmIChuTGV2ZWwgPT09IC05OTk5IHx8IG5MZXZlbCA+PSBsZXZlbCkgY29udGludWU7XG4gICAgICAgIGlmIChpc1NvbGlkKGdldFZveGVsKHdvcmxkLCB4ICsgZHgsIGxldmVsIC0gMSwgeiArIGR6KSkpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB0b3AgPSBsZXZlbCAtIDAuMSwgYm90dG9tID0gbkxldmVsIC0gMC4xO1xuICAgICAgICBjb25zdCBiID0gcG9zLmxlbmd0aCAvIDM7XG4gICAgICAgIC8vIEZhY2Ugb24gdGhlIHNoYXJlZCBlZGdlLCBvcmllbnRlZCB0b3dhcmQgdGhlIGxvd2VyIG5laWdoYm91ci5cbiAgICAgICAgY29uc3QgZXggPSBkeCA+IDAgPyB4ICsgMSA6IGR4IDwgMCA/IHggOiB4LCBleiA9IGR6ID4gMCA/IHogKyAxIDogZHogPCAwID8geiA6IHo7XG4gICAgICAgIGlmIChkeCAhPT0gMCkge1xuICAgICAgICAgIHB1c2goZXgsIHRvcCwgeiwgZHgsIDAsIDAsIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goZXgsIHRvcCwgeiArIDEsIGR4LCAwLCAwLCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKGV4LCBib3R0b20sIHogKyAxLCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaChleCwgYm90dG9tLCB6LCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcHVzaCh4LCB0b3AsIGV6LCAwLCAwLCBkeiwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaCh4ICsgMSwgdG9wLCBleiwgMCwgMCwgZHosIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goeCArIDEsIGJvdHRvbSwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKHgsIGJvdHRvbSwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgfVxuICAgICAgICBxdWFkKGIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAoaWR4Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGcgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUocG9zLCAzKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdub3JtYWwnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShucm0sIDMpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoY2xyLCAzKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhRmxvdycsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGZsb3csIDIpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FEZXB0aCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGRlcHRoLCAxKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhRm9hbScsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGZvYW0sIDEpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FTaGVldCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHNoZWV0LCAxKSk7XG4gIGcuc2V0SW5kZXgoaWR4KTtcbiAgZy5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGcsIG5lYXJXYXRlck1hdGVyaWFsKTtcbiAgbWVzaC5uYW1lID0gYHdhdGVyX2NodW5rXyR7Y2h1bmsuY3h9XyR7Y2h1bmsuY3p9YDtcbiAgbWVzaC5yZW5kZXJPcmRlciA9IDI7XG4gIG1lc2gudXNlckRhdGEud2F0ZXJUcmlhbmdsZXMgPSBpZHgubGVuZ3RoIC8gMztcbiAgcmV0dXJuIG1lc2g7XG59XG5cbi8qKlxuICogQ3V0IGEgcmVjdGFuZ3VsYXIgaG9sZSBpbiB0aGUgZmFyIChvcGFxdWUpIHNlYSBwbGFuZSB3aGVyZSBuZWFyIGNodW5rcyBkcmF3XG4gKiB0aGVpciBvd24gdHJhbnNwYXJlbnQgd2F0ZXIsIHNvIHNoYWxsb3dzIHNob3cgdGhlIHJlYWwgYmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbEZhcldhdGVySG9sZShtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwpOiB7IHZhbHVlOiBUSFJFRS5WZWN0b3I0IH0ge1xuICBjb25zdCBob2xlID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjQoMCwgMCwgMCwgMCkgfTtcbiAgbWF0ZXJpYWwub25CZWZvcmVDb21waWxlID0gKHNoYWRlcikgPT4ge1xuICAgIHNoYWRlci51bmlmb3Jtcy51SG9sZSA9IGhvbGU7XG4gICAgc2hhZGVyLnZlcnRleFNoYWRlciA9IHNoYWRlci52ZXJ0ZXhTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsICcjaW5jbHVkZSA8Y29tbW9uPlxcbnZhcnlpbmcgdmVjMiB2RmFyWFo7JylcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PicsICcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxcbnZGYXJYWiA9IChtb2RlbE1hdHJpeCAqIHZlYzQodHJhbnNmb3JtZWQsIDEuMCkpLnh6OycpO1xuICAgIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgJyNpbmNsdWRlIDxjb21tb24+XFxudW5pZm9ybSB2ZWM0IHVIb2xlO1xcbnZhcnlpbmcgdmVjMiB2RmFyWFo7JylcbiAgICAgIC5yZXBsYWNlKCd2ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UsIG9wYWNpdHkgKTsnLFxuICAgICAgICAnaWYgKHZGYXJYWi54ID4gdUhvbGUueCAmJiB2RmFyWFoueCA8IHVIb2xlLnogJiYgdkZhclhaLnkgPiB1SG9sZS55ICYmIHZGYXJYWi55IDwgdUhvbGUudykgZGlzY2FyZDtcXG52ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UsIG9wYWNpdHkgKTsnKTtcbiAgfTtcbiAgcmV0dXJuIGhvbGU7XG59XG4iLCAiLy8gU3R5bCBuYXR1cmFsIGFzc2V0cyBcdTIwMTQgW1BST1ZJU0lPTkFMIGFydCBkaXJlY3Rpb24sIGRvY3VtZW50ZWQgZ2VvbWV0cnldLlxuLy9cbi8vIFRoZSBwcm9qZWN0IGhhcyB0aHJlZSBkaXN0aW5jdCBhdXRob3JlZCBsYW5ndWFnZXMgKEFEQiBcdTAwQTcyKTpcbi8vICAgKiB2b3hlbCB0ZXJyYWluICAgXHUyMDE0IDEgbSBvY2N1cGFuY3kvbWF0ZXJpYWwgdm9sdW1lLCB0aGlzIGRpcmVjdG9yeSdzIHRlcnJhaW47XG4vLyAgICogTm94ZWwgICAgICAgICAgIFx1MjAxNCBodW1hbi1tYWRlIGFyY2hpdGVjdHVyZSBhbmQgcHJvcHMgKGBub3hlbC50c2ApO1xuLy8gICAqIFN0eWwgKGBuYXRfYCkgICBcdTIwMTQgb3JnYW5pYyBuYXR1cmFsIGFzc2V0cywgaW1wbGVtZW50ZWQgaGVyZS5cbi8vXG4vLyBBUy0wMDEgdjIgc3VwZXJzZWRlcyB0aGUgb2xkIHN0YWNrZWQtY3Vib2lkIHRyZWVzOiBjYW5vcGllcyBhcmUgZmFjZXRlZFxuLy8gTmF0TWFzcyBlbGxpcHNvaWRzICg3XHUyMDEzMTEgc2lkZXMsIGZsYXQgc2hhZGVkKSBhbmQgdHJ1bmtzIGFyZSA2LWdvbiBOYXRDb2x1bW5cbi8vIHByaXNtcy4gUm9ja3MgYW5kIG9yZSBob3N0cyBzdGF5IGJsb2NreSBieSBkZXNpZ24uIFRoZSBvd25lcidzIHJlZmVyZW5jZVxuLy8gaW1hZ2VzIGFyZSBzdGlsbCBhYnNlbnQsIHNvIHRoZSBzZXQgcmVtYWlucyBwcm92aXNpb25hbC5cbi8vXG4vLyBFbnRpdGllcyBhcmUgdGhlIHNvdXJjZSBvZiB0cnV0aC4gQSBoYXJ2ZXN0ZWQgZW50aXR5IGlzIG5vdCByZW5kZXJlZDsgdGhlXG4vLyByZW5kZXJlciBuZXZlciBkZWNpZGVzIHdoZXRoZXIgYSB0cmVlIGV4aXN0cy5cbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCB7IG1lcmdlR2VvbWV0cmllcyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS91dGlscy9CdWZmZXJHZW9tZXRyeVV0aWxzLmpzJztcbmltcG9ydCBwYWxldHRlIGZyb20gJy4uL2RhdGEvcGFsZXR0ZS5qc29uJztcbmltcG9ydCB7IEVudGl0eSwgRW50aXR5S2luZCwgV29ybGQsIG11bGJlcnJ5MzIgfSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5jb25zdCBNID0gcGFsZXR0ZS5tYXRlcmlhbHMgYXMgUmVjb3JkPHN0cmluZywgeyBoZXg6IHN0cmluZyB9PjtcbmNvbnN0IEggPSAoazogc3RyaW5nKSA9PiBNW2tdLmhleDtcblxuY29uc3QgR1JFRU4gPSBbSCgnY2Fub3B5X2dyZWVuX2EnKSwgSCgnY2Fub3B5X2dyZWVuX2InKSwgSCgnY2Fub3B5X2dyZWVuX2MnKV07XG5jb25zdCBQSU5LID0gW0goJ2Nhbm9weV9waW5rX2InKSwgSCgnY2Fub3B5X3BpbmsnKV07XG5jb25zdCBUUlVOSyA9IEgoJ3RydW5rJyk7XG5jb25zdCBCQVJLID0gSCgnYmFya19kYXJrJyk7XG5jb25zdCBTVE9ORSA9IEgoJ3N0b25lX3RvcCcpO1xuY29uc3QgU1RPTkVfQiA9IEgoJ3N0b25lX2JvZHlfYicpO1xuY29uc3QgU1RPTkVfU0hBREUgPSBIKCdzdG9uZV9zaGFkZScpO1xuY29uc3QgT1JFID0gSCgnb3JlX2NyeXN0YWwnKTtcbmNvbnN0IE9SRV9CID0gSCgnb3JlX2NyeXN0YWxfYicpO1xuY29uc3QgT0NIUkUgPSBIKCdzdHJhdGFfb2NocmUnKTtcblxudHlwZSBWZWMzID0gW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXG5pbnRlcmZhY2UgTWFzc1NwZWMge1xuICBjeDogbnVtYmVyOyBjeTogbnVtYmVyOyBjejogbnVtYmVyO1xuICByeDogbnVtYmVyOyByeTogbnVtYmVyOyByejogbnVtYmVyO1xuICBzaWRlczogbnVtYmVyO1xuICBzaGFwZTogJ29yYicgfCAnZG9tZScgfCAnZHJ1bSc7XG4gIHlhd0RlZzogbnVtYmVyO1xuICBoZXg6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFRyZWVTcGVjIHtcbiAgdHJ1bmtSOiBudW1iZXI7XG4gIHRydW5rSDogbnVtYmVyO1xuICBmbGFyZVI6IG51bWJlcjtcbiAgZmxhcmVIOiBudW1iZXI7XG4gIG1hc3NlczogTWFzc1NwZWNbXTtcbiAgc2F0ZWxsaXRlPzogeyBjeDogbnVtYmVyOyBjeTogbnVtYmVyOyBjejogbnVtYmVyOyBzeDogbnVtYmVyOyBzeTogbnVtYmVyOyBzejogbnVtYmVyOyBoZXg6IHN0cmluZyB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHByaW1pdGl2ZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGFpbnQoZ2VvOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSwgaGV4OiBzdHJpbmcpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGcgPSBnZW8uaW5kZXggPyBnZW8udG9Ob25JbmRleGVkKCkgOiBnZW87XG4gIGcuZGVsZXRlQXR0cmlidXRlKCd1dicpO1xuICBjb25zdCBjb2xvciA9IG5ldyBUSFJFRS5Db2xvcihoZXgpO1xuICBjb25zdCBuID0gZy5hdHRyaWJ1dGVzLnBvc2l0aW9uLmNvdW50O1xuICBjb25zdCBhcnIgPSBuZXcgRmxvYXQzMkFycmF5KG4gKiAzKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICBhcnJbaSAqIDNdID0gY29sb3IucjtcbiAgICBhcnJbaSAqIDMgKyAxXSA9IGNvbG9yLmc7XG4gICAgYXJyW2kgKiAzICsgMl0gPSBjb2xvci5iO1xuICB9XG4gIGcuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYXJyLCAzKSk7XG4gIHJldHVybiBnO1xufVxuXG5mdW5jdGlvbiBib3goY3g6IG51bWJlciwgY3k6IG51bWJlciwgY3o6IG51bWJlciwgc3g6IG51bWJlciwgc3k6IG51bWJlciwgc3o6IG51bWJlciwgaGV4OiBzdHJpbmcpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGcgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoc3gsIHN5LCBzeik7XG4gIGcudHJhbnNsYXRlKGN4LCBjeSwgY3opO1xuICBjb25zdCBvdXQgPSBwYWludChnLCBoZXgpO1xuICBvdXQuY29tcHV0ZVZlcnRleE5vcm1hbHMoKTtcbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gY29sdW1uKGN4OiBudW1iZXIsIGN6OiBudW1iZXIsIHkwOiBudW1iZXIsIGg6IG51bWJlciwgcjogbnVtYmVyLCBzaWRlczogbnVtYmVyLCB5YXdEZWc6IG51bWJlciwgaGV4OiBzdHJpbmcpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGcgPSBuZXcgVEhSRUUuQ3lsaW5kZXJHZW9tZXRyeShyLCByLCBoLCBzaWRlcywgMSwgZmFsc2UpO1xuICBnLnRyYW5zbGF0ZShjeCwgeTAgKyBoIC8gMiwgY3opO1xuICBnLnJvdGF0ZVkoeWF3RGVnICogTWF0aC5QSSAvIDE4MCk7XG4gIGNvbnN0IG91dCA9IHBhaW50KGcsIGhleCk7XG4gIG91dC5jb21wdXRlVmVydGV4Tm9ybWFscygpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vKipcbiAqIExpdGVyYWwgaW1wbGVtZW50YXRpb24gb2YgQVMtMDAxIFx1MDBBNzMuMTogZWxsaXBzb2lkIHRlc3NlbGxhdGlvbiB3aXRoIGZsYXRcbiAqIGZhY2Ugbm9ybWFscywgb3V0d2FyZCB3aW5kaW5nLCBhbmQgYXV0aG9yZWQgZmFjZXQgcGhhc2UuXG4gKi9cbmZ1bmN0aW9uIG1hc3NHZW9tZXRyeShtOiBNYXNzU3BlYyk6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3QgcG9zOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBucm06IG51bWJlcltdID0gW107XG4gIGNvbnN0IEQgPSBNYXRoLlBJIC8gMTgwO1xuICBjb25zdCBsb24gPSAoazogbnVtYmVyKSA9PiBtLnlhd0RlZyAqIEQgKyBrICogMiAqIE1hdGguUEkgLyBtLnNpZGVzO1xuICBjb25zdCByb3cgPSAocGhpRGVnOiBudW1iZXIpOiBWZWMzW10gPT4ge1xuICAgIGNvbnN0IHBoaSA9IHBoaURlZyAqIEQsIGMgPSBNYXRoLmNvcyhwaGkpLCBzID0gTWF0aC5zaW4ocGhpKTtcbiAgICBjb25zdCBvdXQ6IFZlYzNbXSA9IFtdO1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgbS5zaWRlczsgaysrKSB7XG4gICAgICBjb25zdCB0ID0gbG9uKGspO1xuICAgICAgb3V0LnB1c2goW1xuICAgICAgICBtLmN4ICsgbS5yeCAqIGMgKiBNYXRoLmNvcyh0KSxcbiAgICAgICAgbS5jeSArIG0ucnkgKiBzLFxuICAgICAgICBtLmN6ICsgbS5yeiAqIGMgKiBNYXRoLnNpbih0KSxcbiAgICAgIF0pO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xuICB9O1xuICBjb25zdCBwb2xlID0gKHNpZ246IG51bWJlcik6IFZlYzMgPT4gW20uY3gsIG0uY3kgKyBzaWduICogbS5yeSwgbS5jel07XG4gIGNvbnN0IGNhcENlbnRyZSA9IChwaGlEZWc6IG51bWJlcik6IFZlYzMgPT4gW20uY3gsIG0uY3kgKyBtLnJ5ICogTWF0aC5zaW4ocGhpRGVnICogRCksIG0uY3pdO1xuXG4gIGNvbnN0IHRyaSA9IChhOiBWZWMzLCBiOiBWZWMzLCBjOiBWZWMzKTogdm9pZCA9PiB7XG4gICAgY29uc3QgdXggPSBiWzBdIC0gYVswXSwgdXkgPSBiWzFdIC0gYVsxXSwgdXogPSBiWzJdIC0gYVsyXTtcbiAgICBjb25zdCB2eCA9IGNbMF0gLSBhWzBdLCB2eSA9IGNbMV0gLSBhWzFdLCB2eiA9IGNbMl0gLSBhWzJdO1xuICAgIGxldCBueCA9IHV5ICogdnogLSB1eiAqIHZ5LCBueSA9IHV6ICogdnggLSB1eCAqIHZ6LCBueiA9IHV4ICogdnkgLSB1eSAqIHZ4O1xuICAgIGNvbnN0IEwgPSBNYXRoLmh5cG90KG54LCBueSwgbnopIHx8IDE7XG4gICAgbnggLz0gTDsgbnkgLz0gTDsgbnogLz0gTDtcbiAgICBjb25zdCBmeCA9IChhWzBdICsgYlswXSArIGNbMF0pIC8gMyAtIG0uY3g7XG4gICAgY29uc3QgZnkgPSAoYVsxXSArIGJbMV0gKyBjWzFdKSAvIDMgLSBtLmN5O1xuICAgIGNvbnN0IGZ6ID0gKGFbMl0gKyBiWzJdICsgY1syXSkgLyAzIC0gbS5jejtcbiAgICBpZiAobnggKiBmeCArIG55ICogZnkgKyBueiAqIGZ6IDwgMCkge1xuICAgICAgY29uc3QgdCA9IGI7IGIgPSBjOyBjID0gdDtcbiAgICAgIG54ID0gLW54OyBueSA9IC1ueTsgbnogPSAtbno7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcCBvZiBbYSwgYiwgY10pIHtcbiAgICAgIHBvcy5wdXNoKHBbMF0sIHBbMV0sIHBbMl0pO1xuICAgICAgbnJtLnB1c2gobngsIG55LCBueik7XG4gICAgfVxuICB9O1xuICBjb25zdCBiYW5kID0gKHIwOiBWZWMzW10sIHIxOiBWZWMzW10pOiB2b2lkID0+IHtcbiAgICBmb3IgKGxldCBrID0gMDsgayA8IG0uc2lkZXM7IGsrKykge1xuICAgICAgY29uc3QgaiA9IChrICsgMSkgJSBtLnNpZGVzO1xuICAgICAgdHJpKHIwW2tdLCByMFtqXSwgcjFba10pO1xuICAgICAgdHJpKHIwW2pdLCByMVtqXSwgcjFba10pO1xuICAgIH1cbiAgfTtcbiAgY29uc3QgZmFuID0gKHJpbmc6IFZlYzNbXSwgYXBleDogVmVjMyk6IHZvaWQgPT4ge1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgbS5zaWRlczsgaysrKSB0cmkocmluZ1trXSwgcmluZ1soayArIDEpICUgbS5zaWRlc10sIGFwZXgpO1xuICB9O1xuICBjb25zdCBjYXAgPSAocmluZzogVmVjM1tdLCBjZW50cmU6IFZlYzMpOiB2b2lkID0+IHtcbiAgICBmb3IgKGxldCBrID0gMDsgayA8IG0uc2lkZXM7IGsrKykgdHJpKHJpbmdbKGsgKyAxKSAlIG0uc2lkZXNdLCByaW5nW2tdLCBjZW50cmUpO1xuICB9O1xuXG4gIGlmIChtLnNoYXBlID09PSAnb3JiJykge1xuICAgIGNvbnN0IHIgPSBbcm93KC00NSksIHJvdygwKSwgcm93KDQ1KV07XG4gICAgYmFuZChyWzBdLCByWzFdKTsgYmFuZChyWzFdLCByWzJdKTtcbiAgICBmYW4oclswXSwgcG9sZSgtMSkpOyBmYW4oclsyXSwgcG9sZSgrMSkpO1xuICB9IGVsc2UgaWYgKG0uc2hhcGUgPT09ICdkb21lJykge1xuICAgIGNvbnN0IHIgPSBbcm93KDApLCByb3coNDUpXTtcbiAgICBiYW5kKHJbMF0sIHJbMV0pO1xuICAgIGZhbihyWzFdLCBwb2xlKCsxKSk7XG4gICAgY2FwKHJbMF0sIGNhcENlbnRyZSgwKSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgciA9IFtyb3coLTQ1KSwgcm93KDApLCByb3coNDUpXTtcbiAgICBiYW5kKHJbMF0sIHJbMV0pOyBiYW5kKHJbMV0sIHJbMl0pO1xuICAgIGNhcChyWzBdLCBjYXBDZW50cmUoLTQ1KSk7IGNhcChyWzJdLCBjYXBDZW50cmUoKzQ1KSk7XG4gIH1cblxuICBjb25zdCBnZW8gPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZ2VvLnNldEF0dHJpYnV0ZSgncG9zaXRpb24nLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShwb3MsIDMpKTtcbiAgZ2VvLnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUobnJtLCAzKSk7XG4gIHJldHVybiBwYWludChnZW8sIG0uaGV4KTtcbn1cblxuZnVuY3Rpb24gYXNzZW1ibHkocGFydHM6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5W10pOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGcgPSBtZXJnZUdlb21ldHJpZXMocGFydHMsIGZhbHNlKTtcbiAgaWYgKCFnKSB0aHJvdyBuZXcgRXJyb3IoJ1N0eWwgZ2VvbWV0cnkgbWVyZ2UgZmFpbGVkJyk7XG4gIGcuY29tcHV0ZUJvdW5kaW5nQm94KCk7XG4gIGcuY29tcHV0ZUJvdW5kaW5nU3BoZXJlKCk7XG4gIHJldHVybiBnO1xufVxuXG4vLyAtLS0tLS0tLS0tIGF1dGhvcmVkIHNwZWNpZXMgKEFTLTAwMSBcdTAwQTc2LjMpIC0tLS0tLS0tLS1cbmNvbnN0IFQxOiBUcmVlU3BlYyA9IHtcbiAgdHJ1bmtSOiAwLjI4LCB0cnVua0g6IDQuOTAsIGZsYXJlUjogMC4zOCwgZmxhcmVIOiAwLjMwLFxuICBtYXNzZXM6IFtcbiAgICB7IGN4OiAwLjAwLCBjeTogNS40NSwgY3o6IDAuMDAsIHJ4OiAyLjEwLCByeTogMS4wMCwgcno6IDIuMDUsIHNpZGVzOiA5LCBzaGFwZTogJ29yYicsIHlhd0RlZzogMCwgaGV4OiBHUkVFTlswXSB9LFxuICAgIHsgY3g6IDAuMjAsIGN5OiA2Ljg1LCBjejogLTAuMjAsIHJ4OiAxLjQ1LCByeTogMC45NSwgcno6IDEuMzUsIHNpZGVzOiA3LCBzaGFwZTogJ29yYicsIHlhd0RlZzogMTUsIGhleDogR1JFRU5bMV0gfSxcbiAgICB7IGN4OiAtMC4xNSwgY3k6IDcuODUsIGN6OiAwLjE1LCByeDogMC45NSwgcnk6IDAuNjUsIHJ6OiAwLjkwLCBzaWRlczogNywgc2hhcGU6ICdvcmInLCB5YXdEZWc6IDMwLCBoZXg6IEdSRUVOWzJdIH0sXG4gIF0sXG4gIHNhdGVsbGl0ZTogeyBjeDogMi40MCwgY3k6IDUuNTUsIGN6OiAwLjc1LCBzeDogMC44MCwgc3k6IDAuNTAsIHN6OiAwLjgwLCBoZXg6IEdSRUVOWzJdIH0sXG59O1xuXG5jb25zdCBUMjogVHJlZVNwZWMgPSB7XG4gIHRydW5rUjogMC4zNCwgdHJ1bmtIOiAzLjg1LCBmbGFyZVI6IDAuNDYsIGZsYXJlSDogMC4yOCxcbiAgbWFzc2VzOiBbXG4gICAgeyBjeDogMC4wMCwgY3k6IDMuNTAsIGN6OiAwLjAwLCByeDogMi45NSwgcnk6IDEuMzAsIHJ6OiAyLjMwLCBzaWRlczogMTEsIHNoYXBlOiAnZG9tZScsIHlhd0RlZzogMCwgaGV4OiBHUkVFTlswXSB9LFxuICAgIHsgY3g6IDEuMzUsIGN5OiA0LjAwLCBjejogLTAuNjAsIHJ4OiAxLjQ1LCByeTogMC45NSwgcno6IDEuMjUsIHNpZGVzOiA5LCBzaGFwZTogJ2RvbWUnLCB5YXdEZWc6IDE1LCBoZXg6IEdSRUVOWzFdIH0sXG4gICAgeyBjeDogLTAuMzUsIGN5OiA1LjIwLCBjejogMC4yNSwgcng6IDEuMzUsIHJ5OiAwLjk1LCByejogMS4yNSwgc2lkZXM6IDksIHNoYXBlOiAnb3JiJywgeWF3RGVnOiAzMCwgaGV4OiBHUkVFTlsyXSB9LFxuICAgIHsgY3g6IC0xLjQ1LCBjeTogNC4wNSwgY3o6IDAuOTUsIHJ4OiAxLjEwLCByeTogMC43NSwgcno6IDEuMDAsIHNpZGVzOiA3LCBzaGFwZTogJ2RvbWUnLCB5YXdEZWc6IDQ1LCBoZXg6IEdSRUVOWzFdIH0sXG4gIF0sXG59O1xuXG5jb25zdCBUMzogVHJlZVNwZWMgPSB7XG4gIHRydW5rUjogMC4yNiwgdHJ1bmtIOiAzLjYwLCBmbGFyZVI6IDAuMzYsIGZsYXJlSDogMC4yNixcbiAgbWFzc2VzOiBbXG4gICAgeyBjeDogMC4wMCwgY3k6IDQuNTUsIGN6OiAwLjAwLCByeDogMS40NSwgcnk6IDEuMzAsIHJ6OiAxLjQwLCBzaWRlczogOSwgc2hhcGU6ICdvcmInLCB5YXdEZWc6IDAsIGhleDogR1JFRU5bMF0gfSxcbiAgICB7IGN4OiAxLjI1LCBjeTogNC4wNSwgY3o6IDAuMzAsIHJ4OiAwLjk1LCByeTogMC44MCwgcno6IDAuOTAsIHNpZGVzOiA3LCBzaGFwZTogJ29yYicsIHlhd0RlZzogMTUsIGhleDogR1JFRU5bMV0gfSxcbiAgICB7IGN4OiAtMS4zMCwgY3k6IDQuNDUsIGN6OiAtMC40NSwgcng6IDAuODUsIHJ5OiAwLjc1LCByejogMC44NSwgc2lkZXM6IDcsIHNoYXBlOiAnb3JiJywgeWF3RGVnOiAzMCwgaGV4OiBHUkVFTlsxXSB9LFxuICAgIHsgY3g6IDAuMTAsIGN5OiA1LjcwLCBjejogLTAuMTAsIHJ4OiAxLjAwLCByeTogMC45MCwgcno6IDAuOTUsIHNpZGVzOiA3LCBzaGFwZTogJ29yYicsIHlhd0RlZzogNDUsIGhleDogR1JFRU5bMl0gfSxcbiAgXSxcbiAgc2F0ZWxsaXRlOiB7IGN4OiAyLjM1LCBjeTogMy45MCwgY3o6IC0wLjI1LCBzeDogMC43MCwgc3k6IDAuNDUsIHN6OiAwLjcwLCBoZXg6IEdSRUVOWzJdIH0sXG59O1xuXG5jb25zdCBUNDogVHJlZVNwZWMgPSB7XG4gIHRydW5rUjogMC4zMCwgdHJ1bmtIOiA0LjQ1LCBmbGFyZVI6IDAuNDIsIGZsYXJlSDogMC4yOCxcbiAgbWFzc2VzOiBbXG4gICAgeyBjeDogMC4wMCwgY3k6IDUuMDAsIGN6OiAwLjAwLCByeDogMi4zNSwgcnk6IDEuMTUsIHJ6OiAyLjIwLCBzaWRlczogOSwgc2hhcGU6ICdkcnVtJywgeWF3RGVnOiAwLCBoZXg6IFBJTktbMF0gfSxcbiAgICB7IGN4OiAwLjMwLCBjeTogNS45MCwgY3o6IC0wLjI1LCByeDogMS41NSwgcnk6IDEuMDAsIHJ6OiAxLjQ1LCBzaWRlczogOSwgc2hhcGU6ICdkcnVtJywgeWF3RGVnOiAxNSwgaGV4OiBQSU5LWzFdIH0sXG4gICAgeyBjeDogLTEuNDAsIGN5OiA0Ljk1LCBjejogMC43NSwgcng6IDEuMDUsIHJ5OiAwLjgwLCByejogMS4wMCwgc2lkZXM6IDcsIHNoYXBlOiAnZHJ1bScsIHlhd0RlZzogMzAsIGhleDogUElOS1swXSB9LFxuICAgIHsgY3g6IDAuMTUsIGN5OiA2LjQ1LCBjejogMC4xMCwgcng6IDAuOTUsIHJ5OiAwLjY1LCByejogMC45MCwgc2lkZXM6IDcsIHNoYXBlOiAnb3JiJywgeWF3RGVnOiA0NSwgaGV4OiBQSU5LWzFdIH0sXG4gIF0sXG4gIHNhdGVsbGl0ZTogeyBjeDogMi41NSwgY3k6IDUuMzUsIGN6OiAwLjg1LCBzeDogMC44NSwgc3k6IDAuNTUsIHN6OiAwLjg1LCBoZXg6IFBJTktbMV0gfSxcbn07XG5cbmNvbnN0IFNIUlVCOiBNYXNzU3BlY1tdID0gW1xuICB7IGN4OiAwLjAwLCBjeTogMC41NSwgY3o6IDAuMDAsIHJ4OiAwLjcwLCByeTogMC41NSwgcno6IDAuNjUsIHNpZGVzOiA5LCBzaGFwZTogJ29yYicsIHlhd0RlZzogMCwgaGV4OiBHUkVFTlswXSB9LFxuICB7IGN4OiAwLjI1LCBjeTogMC45NSwgY3o6IC0wLjE1LCByeDogMC40NSwgcnk6IDAuNDIsIHJ6OiAwLjQyLCBzaWRlczogNywgc2hhcGU6ICdvcmInLCB5YXdEZWc6IDE1LCBoZXg6IEdSRUVOWzFdIH0sXG4gIHsgY3g6IC0wLjIwLCBjeTogMS4wNSwgY3o6IDAuMjAsIHJ4OiAwLjM0LCByeTogMC40NSwgcno6IDAuMzIsIHNpZGVzOiA3LCBzaGFwZTogJ29yYicsIHlhd0RlZzogMzAsIGhleDogR1JFRU5bMl0gfSxcbl07XG5cbmNvbnN0IHF1YW50ID0gKHY6IG51bWJlcikgPT4gTWF0aC5yb3VuZCh2IC8gMC4wNSkgKiAwLjA1O1xuY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuXG5mdW5jdGlvbiBqaXR0ZXJNYXNzKG06IE1hc3NTcGVjLCBybmQ6ICgpID0+IG51bWJlciwgZ3JvdXBYOiBudW1iZXIsIGdyb3VwWjogbnVtYmVyKTogTWFzc1NwZWMge1xuICBjb25zdCByaml0ID0gKHY6IG51bWJlcikgPT4gcXVhbnQoY2xhbXAodiAqICgxICsgKHJuZCgpICogMC4xNiAtIDAuMDgpKSwgMC4yNSwgNCkpO1xuICByZXR1cm4ge1xuICAgIC4uLm0sXG4gICAgY3g6IHF1YW50KG0uY3ggKyBncm91cFggKyAocm5kKCkgKiAwLjYwIC0gMC4zMCkpLFxuICAgIGN5OiBxdWFudChtLmN5ICsgKHJuZCgpICogMC40MCAtIDAuMjApKSxcbiAgICBjejogcXVhbnQobS5jeiArIGdyb3VwWiArIChybmQoKSAqIDAuNjAgLSAwLjMwKSksXG4gICAgcng6IHJqaXQobS5yeCksIHJ5OiByaml0KG0ucnkpLCByejogcmppdChtLnJ6KSxcbiAgICB5YXdEZWc6IG0ueWF3RGVnICsgKE1hdGguZmxvb3Iocm5kKCkgKiAzKSAtIDEpICogMTUsXG4gIH07XG59XG5cbmZ1bmN0aW9uIHRyZWVHZW9tZXRyeShzcGVjaWVzOiBUcmVlU3BlYywgdmFyaWFudDogbnVtYmVyKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChzcGVjaWVzID09PSBUMSA/IDExIDogc3BlY2llcyA9PT0gVDIgPyAyMyA6IHNwZWNpZXMgPT09IFQzID8gMzcgOiA1MykgKiA3OTE5ICsgdmFyaWFudCAqIDEwNDcyOSk7XG4gIGNvbnN0IGppdHRlcmVkID0gdmFyaWFudCA+IDA7XG4gIGNvbnN0IGdyb3VwWCA9IGppdHRlcmVkID8gcm5kKCkgKiAwLjcwIC0gMC4zNSA6IDA7XG4gIGNvbnN0IGdyb3VwWiA9IGppdHRlcmVkID8gcm5kKCkgKiAwLjcwIC0gMC4zNSA6IDA7XG4gIGNvbnN0IHRydW5rUiA9IGppdHRlcmVkID8gcXVhbnQoY2xhbXAoc3BlY2llcy50cnVua1IgKyAocm5kKCkgKiAwLjEwIC0gMC4wNSksIDAuMjAsIDAuNDApKSA6IHNwZWNpZXMudHJ1bmtSO1xuICAvLyBWNSBwZXJtaXRzIFx1MDBCMTAuNjAgbSwgYnV0IEs0ICh0cnVuayB0b3AgaW5zaWRlIHRoZSBjYW5vcHkpIGlzIGEgaGFyZCBjbGFtcDtcbiAgLy8gYSBzbWFsbGVyIFx1MDBCMTAuMzAgbSBqaXR0ZXIga2VlcHMgZXZlcnkgdmFyaWFudCB2YWxpZC5cbiAgY29uc3QgdHJ1bmtIID0gaml0dGVyZWQgPyBxdWFudChjbGFtcChzcGVjaWVzLnRydW5rSCArIChybmQoKSAqIDAuNjAgLSAwLjMwKSwgMy4wLCA1LjQpKSA6IHNwZWNpZXMudHJ1bmtIO1xuICBjb25zdCBmbGFyZVIgPSB0cnVua1IgKyAwLjEwO1xuICBjb25zdCBwYXJ0czogVEhSRUUuQnVmZmVyR2VvbWV0cnlbXSA9IFtcbiAgICBjb2x1bW4oMCwgMCwgMCwgdHJ1bmtILCB0cnVua1IsIDYsIDAsIFRSVU5LKSxcbiAgICBjb2x1bW4oMCwgMCwgMCwgc3BlY2llcy5mbGFyZUgsIGZsYXJlUiwgNiwgMCwgQkFSSyksXG4gIF07XG4gIGZvciAoY29uc3QgbSBvZiBzcGVjaWVzLm1hc3Nlcykge1xuICAgIHBhcnRzLnB1c2gobWFzc0dlb21ldHJ5KGppdHRlcmVkID8gaml0dGVyTWFzcyhtLCBybmQsIGdyb3VwWCwgZ3JvdXBaKSA6IG0pKTtcbiAgfVxuICBpZiAoc3BlY2llcy5zYXRlbGxpdGUgJiYgdmFyaWFudCAlIDMgPT09IDApIHtcbiAgICBjb25zdCBzID0gc3BlY2llcy5zYXRlbGxpdGU7XG4gICAgcGFydHMucHVzaChib3gocy5jeCArIGdyb3VwWCwgcy5jeSwgcy5jeiArIGdyb3VwWiwgcy5zeCwgcy5zeSwgcy5zeiwgcy5oZXgpKTtcbiAgfVxuICByZXR1cm4gYXNzZW1ibHkocGFydHMpO1xufVxuXG5mdW5jdGlvbiBzaHJ1Ykdlb21ldHJ5KHZhcmlhbnQ6IG51bWJlcik6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMig5NyAqIDc5MTkgKyB2YXJpYW50ICogMTA0NzI5KTtcbiAgY29uc3QgcGFydHMgPSBTSFJVQi5tYXAoKG0sIGkpID0+IHtcbiAgICBpZiAodmFyaWFudCA9PT0gMCAmJiBpID09PSAwKSByZXR1cm4gbWFzc0dlb21ldHJ5KG0pO1xuICAgIHJldHVybiBtYXNzR2VvbWV0cnkoaml0dGVyTWFzcyhtLCBybmQsIDAsIDApKTtcbiAgfSk7XG4gIHJldHVybiBhc3NlbWJseShwYXJ0cyk7XG59XG5cbi8vIC0tLS0tLS0tLS0gcmV0YWluZWQgb3JlIC8gY2Fpcm4gYXNzZXRzIChibG9jayBsYW5ndWFnZSkgLS0tLS0tLS0tLVxuZnVuY3Rpb24gb3JlR2VvbWV0cnkodmFyaWFudDogbnVtYmVyKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xuICBjb25zdCBmbGlwID0gdmFyaWFudCA9PT0gMSA/IC0xIDogMTtcbiAgY29uc3QgcGFydHMgPSBbXG4gICAgYm94KDAsIDAuNDUsIDAsIDEuODAsIDAuOTAsIDEuNTAsIFNUT05FKSxcbiAgICBib3goMC4xNSwgMS4xMCwgLTAuMTAsIDEuMjAsIDAuNzAsIDEuMDAsIFNUT05FKSxcbiAgICBib3goLTAuNDAsIDEuNDAsIDAuMjUsIDAuNzAsIDAuNTAsIDAuNjAsIFNUT05FX0IpLFxuICAgIGJveCgwLjEwLCAwLjQ1LCAwLjc1ICogZmxpcCwgMC45MCwgMC4zNSwgMC4yMCwgT1JFKSxcbiAgICBib3goMC4xMCwgMC40NSwgMC44NjUgKiBmbGlwLCAwLjUwLCAwLjE0LCAwLjA3LCBPUkVfQiksXG4gIF07XG4gIHJldHVybiBhc3NlbWJseShwYXJ0cyk7XG59XG5cbmZ1bmN0aW9uIGNhaXJuR2VvbWV0cnkoKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xuICByZXR1cm4gYXNzZW1ibHkoW1xuICAgIGJveCgwLCAwLjI1LCAwLCAxLjUwLCAwLjUwLCAxLjMwLCBTVE9ORSksXG4gICAgYm94KDAuMTAsIDAuNzI1LCAwLCAxLjE1LCAwLjQ1LCAxLjAwLCBTVE9ORV9CKSxcbiAgICBib3goLTAuMTAsIDEuMTUsIDAuMDUsIDAuODUsIDAuNDAsIDAuNzUsIFNUT05FKSxcbiAgICBib3goMC4xMCwgMS41MjUsIDAuMDUsIDAuNTAsIDAuMzUsIDAuNTAsIFNUT05FX0IpLFxuICAgIGJveCgwLjEwLCAxLjg1LCAwLjA1LCAwLjMwLCAwLjMwLCAwLjMwLCBTVE9ORV9TSEFERSksXG4gIF0pO1xufVxuXG4vLyAtLS0tLS0tLS0tIGFzc2V0IGxvb2t1cCAtLS0tLS0tLS0tXG4vLyBWYXJpYW50IGdlb21ldHJ5IGlzIGEgcHVyZSBmdW5jdGlvbiBvZiAoa2luZCwgdmFyaWFudCkuIEJ1aWxkIGVhY2ggb25jZSBhbmRcbi8vIHJldXNlIGl0OiBCYXRjaGVkTWVzaC5hZGRHZW9tZXRyeSBjb3BpZXMgdGhlIGRhdGEsIHNvIHRoZSBjYWNoZWQgc291cmNlIGlzXG4vLyBuZXZlciBkaXNwb3NlZCBieSBhIG5hdHVyZSByZWJ1aWxkLlxuY29uc3QgZ2VvbWV0cnlDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBUSFJFRS5CdWZmZXJHZW9tZXRyeSB8IG51bGw+KCk7XG5cbmZ1bmN0aW9uIGdlb21ldHJ5Rm9yKGtpbmQ6IEVudGl0eUtpbmQsIHZhcmlhbnQ6IG51bWJlcik6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHwgbnVsbCB7XG4gIGNvbnN0IGtleSA9IGAke2tpbmR9OiR7dmFyaWFudH1gO1xuICBpZiAoZ2VvbWV0cnlDYWNoZS5oYXMoa2V5KSkgcmV0dXJuIGdlb21ldHJ5Q2FjaGUuZ2V0KGtleSkhO1xuICBjb25zdCBidWlsdCA9IGJ1aWxkR2VvbWV0cnlGb3Ioa2luZCwgdmFyaWFudCk7XG4gIGNvbnN0IGZsYXQgPSBidWlsdCAmJiBidWlsdC5pbmRleCA/IGJ1aWx0LnRvTm9uSW5kZXhlZCgpIDogYnVpbHQ7XG4gIGlmIChmbGF0ICYmIGZsYXQgIT09IGJ1aWx0KSBidWlsdD8uZGlzcG9zZSgpO1xuICBnZW9tZXRyeUNhY2hlLnNldChrZXksIGZsYXQpO1xuICByZXR1cm4gZmxhdDtcbn1cblxuZnVuY3Rpb24gYnVpbGRHZW9tZXRyeUZvcihraW5kOiBFbnRpdHlLaW5kLCB2YXJpYW50OiBudW1iZXIpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB8IG51bGwge1xuICBpZiAoa2luZCA9PT0gJ3N0eWxfdHJlZV9zcGlyZScpIHJldHVybiB0cmVlR2VvbWV0cnkoVDEsIE1hdGguYWJzKHZhcmlhbnQpICUgNCk7XG4gIGlmIChraW5kID09PSAnc3R5bF90cmVlX3RhYmxlJykgcmV0dXJuIHRyZWVHZW9tZXRyeShUMiwgTWF0aC5hYnModmFyaWFudCkgJSA0KTtcbiAgaWYgKGtpbmQgPT09ICdzdHlsX3RyZWVfY2x1c3RlcicpIHJldHVybiB0cmVlR2VvbWV0cnkoVDMsIE1hdGguYWJzKHZhcmlhbnQpICUgMyk7XG4gIGlmIChraW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSByZXR1cm4gdHJlZUdlb21ldHJ5KFQ0LCBNYXRoLmFicyh2YXJpYW50KSAlIDIpO1xuICBpZiAoa2luZCA9PT0gJ3N0eWxfc2hydWInKSByZXR1cm4gc2hydWJHZW9tZXRyeShNYXRoLmFicyh2YXJpYW50KSAlIDMpO1xuICBpZiAoa2luZCA9PT0gJ3N0eWxfb3JlJykgcmV0dXJuIG9yZUdlb21ldHJ5KE1hdGguYWJzKHZhcmlhbnQpICUgMik7XG4gIGlmIChraW5kID09PSAnc3R5bF9jYWlybicpIHJldHVybiBjYWlybkdlb21ldHJ5KCk7XG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5hdHVyZUJ1aWxkUmVzdWx0IHtcbiAgZ3JvdXA6IFRIUkVFLkdyb3VwO1xuICB0cmlhbmdsZXM6IG51bWJlcjtcbiAgaW5zdGFuY2VzOiBudW1iZXI7XG59XG5cbmNvbnN0IG5hdHVyZU1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoeyB2ZXJ0ZXhDb2xvcnM6IHRydWUsIGZsYXRTaGFkaW5nOiB0cnVlIH0pO1xuXG4vKipcbiAqIEJ1aWxkIG9uZSBJbnN0YW5jZWRNZXNoIHBlciBraW5kK3ZhcmlhbnQgZm9yIHRoZSBzdXBwbGllZCBsb2FkZWQgY2h1bmtzLlxuICogRW50aXRpZXMgcmVtYWluIHRoZSBzb3VyY2Ugb2YgdHJ1dGg7IGhhcnZlc3RlZCBlbnRpdGllcyBhcmUgc2tpcHBlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTm94ZWxOYXR1cmUoXG4gIHdvcmxkOiBXb3JsZCxcbiAgbG9hZGVkQ2h1bmtzOiBSZWFkb25seVNldDxzdHJpbmc+IHwgbnVsbCA9IG51bGwsXG4pOiBOYXR1cmVCdWlsZFJlc3VsdCB7XG4gIGNvbnN0IGdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIGdyb3VwLm5hbWUgPSAnc3R5bF9uYXR1cmUnO1xuICBjb25zdCBidWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIEVudGl0eVtdPigpO1xuXG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChlLmhhcnZlc3RlZCkgY29udGludWU7XG4gICAgaWYgKGxvYWRlZENodW5rcyAmJiAhbG9hZGVkQ2h1bmtzLmhhcyhlLmNodW5rKSkgY29udGludWU7XG4gICAgaWYgKCFnZW9tZXRyeUZvcihlLmtpbmQsIGUudmFyaWFudCkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGtleSA9IGAke2Uua2luZH06JHtlLnZhcmlhbnR9YDtcbiAgICBsZXQgbGlzdCA9IGJ1Y2tldHMuZ2V0KGtleSk7XG4gICAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgYnVja2V0cy5zZXQoa2V5LCBsaXN0KTsgfVxuICAgIGxpc3QucHVzaChlKTtcbiAgfVxuXG4gIGxldCB0cmlhbmdsZXMgPSAwO1xuICBsZXQgaW5zdGFuY2VDb3VudCA9IDA7XG4gIGNvbnN0IGdlb21ldHJpZXMgPSBuZXcgTWFwPHN0cmluZywgVEhSRUUuQnVmZmVyR2VvbWV0cnk+KCk7XG4gIGZvciAoY29uc3QgW2tleSwgbGlzdF0gb2YgYnVja2V0cykge1xuICAgIGNvbnN0IFtraW5kLCB2YXJpYW50U3RyXSA9IGtleS5zcGxpdCgnOicpO1xuICAgIGNvbnN0IGdlbyA9IGdlb21ldHJ5Rm9yKGtpbmQgYXMgRW50aXR5S2luZCwgTnVtYmVyKHZhcmlhbnRTdHIpKTtcbiAgICBpZiAoIWdlbykgY29udGludWU7XG4gICAgZ2VvbWV0cmllcy5zZXQoa2V5LCBnZW8pO1xuICAgIHRyaWFuZ2xlcyArPSAoZ2VvLmF0dHJpYnV0ZXMucG9zaXRpb24uY291bnQgLyAzKSAqIGxpc3QubGVuZ3RoO1xuICAgIGluc3RhbmNlQ291bnQgKz0gbGlzdC5sZW5ndGg7XG4gIH1cblxuICBpZiAoaW5zdGFuY2VDb3VudCA9PT0gMCkgcmV0dXJuIHsgZ3JvdXAsIHRyaWFuZ2xlczogMCwgaW5zdGFuY2VzOiAwIH07XG5cbiAgLy8gT25lIEJhdGNoZWRNZXNoIGZvciBldmVyeSBuYXR1cmFsIGFzc2V0LiBUaGUgb2xkIGNvZGUgdXNlZCBvbmVcbiAgLy8gSW5zdGFuY2VkTWVzaCBwZXIga2luZCt2YXJpYW50ICh+MzEgZHJhdyBjYWxscyk7IHRoaXMga2VlcHMgdGhlIHNhbWVcbiAgLy8gYXV0aG9yZWQgdmFyaWFudHMgYW5kIHBlci1pbnN0YW5jZSB0cmFuc2Zvcm1zIGluIGEgc2luZ2xlIGRyYXcgY2FsbC5cbiAgbGV0IHZlcnRleENvdW50ID0gMDtcbiAgZm9yIChjb25zdCBnZW8gb2YgZ2VvbWV0cmllcy52YWx1ZXMoKSkgdmVydGV4Q291bnQgKz0gZ2VvLmF0dHJpYnV0ZXMucG9zaXRpb24uY291bnQ7XG4gIGNvbnN0IGJhdGNoZWQgPSBuZXcgVEhSRUUuQmF0Y2hlZE1lc2goXG4gICAgaW5zdGFuY2VDb3VudCxcbiAgICBNYXRoLmNlaWwodmVydGV4Q291bnQgKiAxLjA4KSArIDE2LFxuICAgIDAsXG4gICAgbmF0dXJlTWF0ZXJpYWwsXG4gICk7XG4gIGJhdGNoZWQubmFtZSA9ICdzdHlsX25hdHVyZV9iYXRjaCc7XG4gIGJhdGNoZWQuY2FzdFNoYWRvdyA9IHRydWU7XG4gIGJhdGNoZWQucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gIGJhdGNoZWQucGVyT2JqZWN0RnJ1c3R1bUN1bGxlZCA9IHRydWU7XG4gIC8vIEJhdGNoZWRNZXNoIHJheWNhc3RzIGV4cG9zZSBiYXRjaElkLCBub3QgYSBNZXNoIHBlciBlbnRpdHkuIEtlZXAgdGhlXG4gIC8vIGF1dGhvcml0YXRpdmUgSUQgYW5kIGEgdXNlZnVsIHN1cmZhY2UgYW5jaG9yIGJlc2lkZSBldmVyeSBHUFUgaW5zdGFuY2UuXG4gIGJhdGNoZWQudXNlckRhdGEuaW5zcGVjdGFibGVCYXRjaElkcyA9IFtdIGFzIHN0cmluZ1tdO1xuICBiYXRjaGVkLnVzZXJEYXRhLmluc3BlY3RhYmxlVGFyZ2V0cyA9IFtdIGFzIEFycmF5PHtcbiAgICBlbnRpdHlJZDogc3RyaW5nOyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyO1xuICB9PjtcblxuICBjb25zdCBnZW9tZXRyeUlkcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIGZvciAoY29uc3QgW2tleSwgZ2VvXSBvZiBnZW9tZXRyaWVzKSB7XG4gICAgZ2VvbWV0cnlJZHMuc2V0KGtleSwgYmF0Y2hlZC5hZGRHZW9tZXRyeShnZW8pKTtcbiAgfVxuXG4gIGNvbnN0IG0gPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCBxID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKTtcbiAgY29uc3QgdiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIGNvbnN0IHMgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICBjb25zdCB1cCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApO1xuICBsZXQgaW5zdGFuY2VzID0gMDtcbiAgZm9yIChjb25zdCBba2V5LCBsaXN0XSBvZiBidWNrZXRzKSB7XG4gICAgY29uc3QgZ2VvbWV0cnlJZCA9IGdlb21ldHJ5SWRzLmdldChrZXkpO1xuICAgIGlmIChnZW9tZXRyeUlkID09PSB1bmRlZmluZWQpIGNvbnRpbnVlO1xuICAgIGZvciAoY29uc3QgZSBvZiBsaXN0KSB7XG4gICAgICBjb25zdCBpZCA9IGJhdGNoZWQuYWRkSW5zdGFuY2UoZ2VvbWV0cnlJZCk7XG4gICAgICBxLnNldEZyb21BeGlzQW5nbGUodXAsIGUucm90KTtcbiAgICAgIHYuc2V0KGUueCwgZS55IC0gMC4xNSwgZS56KTtcbiAgICAgIHMuc2V0U2NhbGFyKGUuc2NhbGUpO1xuICAgICAgYmF0Y2hlZC5zZXRNYXRyaXhBdChpZCwgbS5jb21wb3NlKHYsIHEsIHMpKTtcbiAgICAgIGJhdGNoZWQudXNlckRhdGEuaW5zcGVjdGFibGVCYXRjaElkc1tpZF0gPSBlLmlkO1xuICAgICAgY29uc3QgdGFyZ2V0SGVpZ2h0ID0gZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZV8nKSA/IDMuMCAqIGUuc2NhbGVcbiAgICAgICAgOiBlLmtpbmQgPT09ICdzdHlsX3NocnViJyA/IDAuNyAqIGUuc2NhbGVcbiAgICAgICAgOiBlLmtpbmQgPT09ICdzdHlsX29yZScgPyAwLjY1ICogZS5zY2FsZVxuICAgICAgICA6IGUuc2NhbGU7XG4gICAgICBiYXRjaGVkLnVzZXJEYXRhLmluc3BlY3RhYmxlVGFyZ2V0c1tpZF0gPSB7XG4gICAgICAgIGVudGl0eUlkOiBlLmlkLCB4OiBlLngsIHk6IGUueSArIHRhcmdldEhlaWdodCwgejogZS56LFxuICAgICAgfTtcbiAgICAgIGluc3RhbmNlcysrO1xuICAgIH1cbiAgfVxuICBiYXRjaGVkLmNvbXB1dGVCb3VuZGluZ0JveCgpO1xuICBiYXRjaGVkLmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuICBncm91cC5hZGQoYmF0Y2hlZCk7XG5cbiAgcmV0dXJuIHsgZ3JvdXAsIHRyaWFuZ2xlcywgaW5zdGFuY2VzIH07XG59XG4iLCAiLy8gTTAwMiBkZXRlcm1pbmlzdGljIGZpeHR1cmUgYW5kIGxpdmUtd29ybGQgbGF5b3V0LlxuLy9cbi8vIFRoZSBmaXh0dXJlIGlzIGEgYm91bmRlZCBzbGljZSBvZiB0aGUgcmVhbCAyMDQ4IG0gd29ybGQgKHNlZWQgMTMzNyksIG5vdCBhXG4vLyBzeW50aGV0aWMgaGVpZ2h0ZmllbGQuIEl0IGNvbnRhaW5zOlxuLy8gICAqIGEgcmVqZWN0ZWQgaG91c2Ugc2l0ZSBvbiBhIDcgbSByaXZlci1iYW5rIHNsb3BlO1xuLy8gICAqIGEgdmlhYmxlIGhvdXNlIHNoZWxmIDIwIG0gYXdheSB3aXRoIDIgbSByZWxpZWYgYW5kIG5vIGNsZWFyaW5nIG5lZWRlZDtcbi8vICAgKiBhIDMgbSBmYXJtIHNsb3BlIDI3IG0gZnJvbSB0aGUgaG91c2Ugd2l0aCBhIG5hdHVyYWwgYmxvc3NvbSB0cmVlIGFuZCBvcmUuXG4vL1xuLy8gVGhlIHNhbWUgY29vcmRpbmF0ZXMsIHF1ZXJpZXMgYW5kIHZhbGlkYXRvcnMgYXJlIHVzZWQgYnkgdGhlIGxpdmUtd29ybGRcbi8vIGFjY2VwdGFuY2UgdGVzdC4gVGhlIG9ubHkgZGlmZmVyZW5jZSBpcyBob3cgbWFueSBjaHVua3MgYXJlIG1hdGVyaWFsaXNlZC5cbmltcG9ydCB7XG4gIFdvcmxkLCBjcmVhdGVXb3JsZCwgZ2VuZXJhdGVXb3JsZCwgZ2VuZXJhdGVDaHVuaywgcGxhY2VBdXRob3JlZFNpdGVzLFxuICBZX01JTiwgWV9NQVgsIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IFJlY3QsIFZveGVsUmVnaW9uIH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IGNodW5rS2V5cyB9IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IGNvbnN0IE0wMDJfU0VFRCA9IDEzMzc7XG5cbi8qKiBQaW5uZWQgcGF0aCBzaXRlIGlkIGZvciB0aGUgZG9vci10by1hcHByb2FjaCBjb3JyaWRvci4gKi9cbmV4cG9ydCBjb25zdCBNMDAyX1BBVEhfU0lURV9JRCA9ICdwYXRoLWhvdXNlLWZhcm0nO1xuXG4vKipcbiAqIFBpbm5lZCBzdGVwcGVkIHByb2ZpbGUgZm9yIHRoZSA5IG0gcGF0aCBmcm9tIHRoZSBob3VzZSBkb29yICh4ID0gLTUzKSB0byB0aGVcbiAqIGFwcHJvYWNoICh4ID0gLTQ1KS4gVGhlIHJpc2UgaXMgMiBtIG92ZXIgOCBtOyBldmVyeSBzdGVwIGlzIGF0IG1vc3QgMSBtLlxuICovXG5leHBvcnQgY29uc3QgTTAwMl9QQVRIX1BST0ZJTEUgPSBbMTEsIDExLCAxMSwgMTIsIDEyLCAxMiwgMTIsIDEzLCAxM10gYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFjZUJhbmRTcGVjIHtcbiAgejA6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG4vKiogUGlubmVkIGZhcm0gdGVycmFjZXMsIGhpZ2ggc2lkZSBmaXJzdC4gKi9cbmV4cG9ydCBjb25zdCBNMDAyX1RFUlJBQ0VfQkFORFM6IHJlYWRvbmx5IFRlcnJhY2VCYW5kU3BlY1tdID0gW1xuICB7IHowOiAtNDIsIHoxOiAtNDAsIHk6IDE2IH0sXG4gIHsgejA6IC0zOSwgejE6IC0zNywgeTogMTUgfSxcbiAgeyB6MDogLTM2LCB6MTogLTM1LCB5OiAxNCB9LFxuXTtcblxuZXhwb3J0IGludGVyZmFjZSBTaXRlU3BlYyB7XG4gIGlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBkb29yOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmFybVNwZWMge1xuICBpZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICB0ZXJyYWNlczogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJMYXlvdXQge1xuICBzZWVkOiBudW1iZXI7XG4gIHJlamVjdGVkOiBTaXRlU3BlYztcbiAgaG91c2U6IFNpdGVTcGVjO1xuICBmYXJtOiBGYXJtU3BlYztcbiAgc2VhcmNoQXJlYTogUmVjdDtcbiAgd29ya1pvbmU6IFJlY3Q7XG4gIGZpeHR1cmVDaHVua3M6IHsgY3gwOiBudW1iZXI7IGN6MDogbnVtYmVyOyBjeDE6IG51bWJlcjsgY3oxOiBudW1iZXIgfTtcbiAgcHJvdGVjdGVkUmVnaW9uOiBWb3hlbFJlZ2lvbjtcbiAgLyoqIENvbXBsZXRlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZSBmb3IgdGhlIGZpcnN0IHNsaWNlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbn1cblxuY29uc3QgRklYVFVSRV9DSFVOS1MgPSB7IGN4MDogMjgsIGN6MDogMjksIGN4MTogMzIsIGN6MTogMzIgfSBhcyBjb25zdDtcblxuZXhwb3J0IGNvbnN0IE0wMDJfTEFZT1VUOiBNMDAyTGF5b3V0ID0ge1xuICBzZWVkOiBNMDAyX1NFRUQsXG4gIHJlamVjdGVkOiB7XG4gICAgaWQ6ICdzaXRlLWEtcmVqZWN0ZWQnLFxuICAgIHJlY3Q6IHsgeDA6IC03NCwgejA6IC02NiwgeDE6IC02NywgejE6IC02MSB9LFxuICAgIC8vIEEgbmFpdmUgbG93LXNpZGUgZmxvb3I6IHRoZSB1cGhpbGwgY29ybmVyIHdvdWxkIG5lZWQgNSBtIG9mIGV4Y2F2YXRpb24uXG4gICAgZmxvb3JZOiAzLFxuICAgIGRvb3I6IHsgeDogLTY3LCB6OiAtNjMgfSxcbiAgICBhcHByb2FjaDogeyB4OiAtNjAsIHo6IC02MyB9LFxuICB9LFxuICBob3VzZToge1xuICAgIGlkOiAnc2l0ZS1iLWhvdXNlJyxcbiAgICByZWN0OiB7IHgwOiAtNjAsIHowOiAtNDYsIHgxOiAtNTMsIHoxOiAtNDEgfSxcbiAgICBmbG9vclk6IDExLFxuICAgIGRvb3I6IHsgeDogLTUzLCB6OiAtNDMgfSxcbiAgICBhcHByb2FjaDogeyB4OiAtNDUsIHo6IC00MyB9LFxuICB9LFxuICBmYXJtOiB7XG4gICAgaWQ6ICdmaWVsZC1jJyxcbiAgICByZWN0OiB7IHgwOiAtMzgsIHowOiAtNDIsIHgxOiAtMjcsIHoxOiAtMzUgfSxcbiAgICB0ZXJyYWNlczogMyxcbiAgfSxcbiAgc2VhcmNoQXJlYTogeyB4MDogLTc2LCB6MDogLTY4LCB4MTogLTQwLCB6MTogLTQwIH0sXG4gIHdvcmtab25lOiB7IHgwOiAtNzYsIHowOiAtNjgsIHgxOiAtMjMsIHoxOiAtMzEgfSxcbiAgZml4dHVyZUNodW5rczogRklYVFVSRV9DSFVOS1MsXG4gIHByb3RlY3RlZFJlZ2lvbjoge1xuICAgIHgwOiBjaHVua09yaWdpblgoRklYVFVSRV9DSFVOS1MuY3gwKSxcbiAgICB6MDogY2h1bmtPcmlnaW5aKEZJWFRVUkVfQ0hVTktTLmN6MCksXG4gICAgeDE6IGNodW5rT3JpZ2luWChGSVhUVVJFX0NIVU5LUy5jeDEpICsgMzEsXG4gICAgejE6IGNodW5rT3JpZ2luWihGSVhUVVJFX0NIVU5LUy5jejEpICsgMzEsXG4gICAgeTA6IFlfTUlOLFxuICAgIHkxOiBZX01BWCAtIDEsXG4gIH0sXG4gIGVudmVsb3BlOiBbXG4gICAgLy8gSG91c2UgZm9vdHByaW50IHBsdXMgYSAyIG0gcHJlcGFyYXRpb24gYnVmZmVyLlxuICAgIHsgeDA6IC02MiwgejA6IC00OCwgeDE6IC01MSwgejE6IC0zOSwgeTA6IDgsIHkxOiAxNiB9LFxuICAgIC8vIERvb3ItdG8tYXBwcm9hY2ggcGF0aCBjb3JyaWRvciBwbHVzIGEgMSBtIGJ1ZmZlci5cbiAgICB7IHgwOiAtNTQsIHowOiAtNDQsIHgxOiAtNDQsIHoxOiAtNDIsIHkwOiA5LCB5MTogMTUgfSxcbiAgICAvLyBGYXJtIGZvb3RwcmludCBwbHVzIGEgMiBtIHByZXBhcmF0aW9uIGJ1ZmZlci5cbiAgICB7IHgwOiAtNDAsIHowOiAtNDQsIHgxOiAtMjUsIHoxOiAtMzMsIHkwOiAxMCwgeTE6IDIwIH0sXG4gIF0sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJXb3JsZCB7XG4gIHdvcmxkOiBXb3JsZDtcbiAgbGF5b3V0OiBNMDAyTGF5b3V0O1xuICAvKiogU29ydGVkIGNodW5rIGtleXMgbWF0ZXJpYWxpc2VkIGF0IGZpeHR1cmUgY3JlYXRpb24uICovXG4gIGNodW5rS2V5czogc3RyaW5nW107XG59XG5cbi8qKlxuICogU21hbGwgZGV0ZXJtaW5pc3RpYyBmaXh0dXJlOiB0aGUgMjAgY2h1bmtzIGNvdmVyaW5nIHRoZSB3b3JrIHpvbmUgYW5kIGl0c1xuICogcHJvdGVjdGVkIHN1cnJvdW5kaW5ncy4gRmFzdCBlbm91Z2ggZm9yIHRoZSBmdWxsIHRlc3Qgc3VpdGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNMDAyRml4dHVyZShzZWVkID0gTTAwMl9TRUVEKTogTTAwMldvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkKTtcbiAgY29uc3QgeyBjeDAsIGN6MCwgY3gxLCBjejEgfSA9IE0wMDJfTEFZT1VULmZpeHR1cmVDaHVua3M7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICB9XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHJldHVybiB7IHdvcmxkLCBsYXlvdXQ6IE0wMDJfTEFZT1VULCBjaHVua0tleXM6IGNodW5rS2V5cyh3b3JsZCkgfTtcbn1cblxuLyoqXG4gKiBMaXZlLXdvcmxkIGludGVncmF0aW9uIHRhcmdldDogdGhlIHNhbWUgc2VlZCBhbmQgc2l0ZXMgd2l0aCBhIDkgeCA5IGNodW5rXG4gKiBuZWlnaGJvdXJob29kICg4MSBjaHVua3MpIGFyb3VuZCB0aGUgZm91bmRlciB2YWxsZXkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNMDAyTGl2ZShzZWVkID0gTTAwMl9TRUVELCByYWRpdXMgPSA0KTogTTAwMldvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBnZW5lcmF0ZVdvcmxkKHNlZWQsIHJhZGl1cyk7XG4gIHJldHVybiB7IHdvcmxkLCBsYXlvdXQ6IE0wMDJfTEFZT1VULCBjaHVua0tleXM6IGNodW5rS2V5cyh3b3JsZCkgfTtcbn1cbiIsICIvLyBNMDAyIHN0YWdlIDcgc2NlbmFyaW8gd2lyaW5nOiB0aGUgcGlubmVkIGZpcnN0IHNsaWNlLCBydW4gdGhyb3VnaCB0aGUgc2FtZVxuLy8gcHVibGljIHNpbXVsYXRpb24gcGlwZWxpbmUgdXNlZCBieSB0aGUgcGxheWVyLCB0aGUgQUkgYW5kIHRoZSB0ZXN0cy5cbi8vXG4vLyBUaGUgc2NlbmFyaW8gaXMgZGVsaWJlcmF0ZWx5IHBsYWluIGRhdGEgaW4gLyBkYXRhIG91dC4gSXQgZG9lcyBub3QgdG91Y2ggdGhlXG4vLyByZW5kZXJlciwgYW5kIGV2ZXJ5IHRlcnJhaW4gZWRpdCBzdGlsbCBnb2VzIHRocm91Z2ggcHJlcGFyZVNpdGUgLT5cbi8vIExvY2FsQXV0aG9yaXplciAtPiBleGVjdXRlUHJlcGFyYXRpb24uIFN0cnVjdHVyZXMgc3RpbGwgZ28gdGhyb3VnaFxuLy8gYnVpbGRTdHJ1Y3R1cmUgLT4gTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyIC0+IGV4ZWN1dGVTdHJ1Y3R1cmUuXG5pbXBvcnQgeyBNQVQsIFJlc291cmNlVHlwZSB9IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgTTAwMldvcmxkLCBNMDAyX0xBWU9VVCwgTTAwMl9QQVRIX1BST0ZJTEUsIE0wMDJfUEFUSF9TSVRFX0lELFxuICBNMDAyX1RFUlJBQ0VfQkFORFMsXG59IGZyb20gJy4vbTAwMic7XG5pbXBvcnQgeyBSZWN0IH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IEhPVVNFX1JVTEVTLCBQQVRIX1JVTEVTLCBGQVJNX1JVTEVTIH0gZnJvbSAnLi9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHtcbiAgQ29sdW1uVGFyZ2V0LCBMb2NhbEF1dGhvcml6ZXIsIHByZXBhcmVTaXRlLCBQcmVwYXJhdGlvbkxlZGdlcixcbn0gZnJvbSAnLi9wcmVwYXJhdGlvbic7XG5pbXBvcnQge1xuICBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsIGJ1aWxkU3RydWN0dXJlLCBTdHJ1Y3R1cmVMZWRnZXIsXG59IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQge1xuICBjYW5vbmljYWxFbnRpdHlIYXNoLCBjYW5vbmljYWxJbnZlbnRvcnlIYXNoLCBjYW5vbmljYWxSZWdpb25IYXNoLFxuICBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoLCBpbnZlbnRvcnlTbmFwc2hvdCxcbn0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTTAwMl9TVEFSVEVSX0lOVkVOVE9SWTogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgbnVtYmVyPj4gPSB7XG4gIHdvb2Q6IDI0LFxuICBzdG9uZTogNDgsXG59O1xuXG4vKiogVGhlIDkgeCAzIG0gY29ycmlkb3IgZnJvbSB0aGUgaG91c2UgZG9vciB0byB0aGUgYXBwcm9hY2guICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMlBhdGhSZWN0KCk6IFJlY3Qge1xuICBjb25zdCBkb29yID0gTTAwMl9MQVlPVVQuaG91c2UuZG9vcjtcbiAgY29uc3QgYXBwcm9hY2ggPSBNMDAyX0xBWU9VVC5ob3VzZS5hcHByb2FjaDtcbiAgcmV0dXJuIHtcbiAgICB4MDogZG9vci54LFxuICAgIHowOiBkb29yLnogLSAxLFxuICAgIHgxOiBhcHByb2FjaC54LFxuICAgIHoxOiBkb29yLnogKyAxLFxuICB9O1xufVxuXG4vKiogT25lIHRhcmdldCBwZXIgcGF0aCBjb2x1bW4sIHVzaW5nIHRoZSBwaW5uZWQgc3RlcHBlZCBwcm9maWxlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJQYXRoVGFyZ2V0cygpOiBDb2x1bW5UYXJnZXRbXSB7XG4gIGNvbnN0IHJlY3QgPSBtMDAyUGF0aFJlY3QoKTtcbiAgY29uc3QgdGFyZ2V0czogQ29sdW1uVGFyZ2V0W10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBNMDAyX1BBVEhfUFJPRklMRS5sZW5ndGg7IGkrKykge1xuICAgIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgICAgdGFyZ2V0cy5wdXNoKHsgeDogcmVjdC54MCArIGksIHosIHk6IE0wMDJfUEFUSF9QUk9GSUxFW2ldIH0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGFyZ2V0cztcbn1cblxuLyoqIE9uZSB0YXJnZXQgcGVyIGZhcm0gY29sdW1uLCB1c2luZyB0aGUgcGlubmVkIHRlcnJhY2UgYmFuZHMuICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMkZhcm1UYXJnZXRzKCk6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3QgcmVjdCA9IE0wMDJfTEFZT1VULmZhcm0ucmVjdDtcbiAgY29uc3QgdGFyZ2V0czogQ29sdW1uVGFyZ2V0W10gPSBbXTtcbiAgZm9yIChjb25zdCBiYW5kIG9mIE0wMDJfVEVSUkFDRV9CQU5EUykge1xuICAgIGZvciAobGV0IHogPSBiYW5kLnowOyB6IDw9IGJhbmQuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgICAgIHRhcmdldHMucHVzaCh7IHgsIHosIHk6IGJhbmQueSB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRhcmdldHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMlNjZW5hcmlvT3B0aW9ucyB7XG4gIC8qKiBTdGFydGVyIHJlc291cmNlcyBiZWZvcmUgdGhlIHNsaWNlIHJ1bnMuIERlZmF1bHRzIHRvIHdvb2QgMjQgLyBzdG9uZSA0OC4gKi9cbiAgaW52ZW50b3J5PzogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+Pjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyU2NlbmFyaW9TaXRlIHtcbiAgcHJlcGFyYXRpb246IFByZXBhcmF0aW9uTGVkZ2VyIHwgbnVsbDtcbiAgc3RydWN0dXJlOiBTdHJ1Y3R1cmVMZWRnZXIgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJTY2VuYXJpb1Jlc3VsdCB7XG4gIG9rOiBib29sZWFuO1xuICBlcnJvcnM6IHN0cmluZ1tdO1xuICBob3VzZTogTTAwMlNjZW5hcmlvU2l0ZTtcbiAgcGF0aDogTTAwMlNjZW5hcmlvU2l0ZTtcbiAgZmFybTogTTAwMlNjZW5hcmlvU2l0ZTtcbiAgaW52ZW50b3J5QmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBpbnZlbnRvcnlBZnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaGFzaGVzOiB7XG4gICAgdm94ZWxzOiBzdHJpbmc7XG4gICAgc3RydWN0dXJlczogc3RyaW5nO1xuICAgIGludmVudG9yeTogc3RyaW5nO1xuICAgIGVudGl0aWVzOiBzdHJpbmc7XG4gIH07XG59XG5cbmZ1bmN0aW9uIGVtcHR5U2l0ZSgpOiBNMDAyU2NlbmFyaW9TaXRlIHtcbiAgcmV0dXJuIHsgcHJlcGFyYXRpb246IG51bGwsIHN0cnVjdHVyZTogbnVsbCB9O1xufVxuXG5mdW5jdGlvbiBkZXNjcmliZUZhaWx1cmUocmVzdWx0OiB7IGNvZGU6IHN0cmluZzsgcmVhc29uczogc3RyaW5nW10gfSk6IHN0cmluZyB7XG4gIHJldHVybiBgJHtyZXN1bHQuY29kZX06ICR7cmVzdWx0LnJlYXNvbnMuam9pbignOyAnKX1gO1xufVxuXG4vKipcbiAqIFJ1biBob3VzZSwgcGF0aCBhbmQgdGVycmFjZWQgZmFybSBpbiB0aGVpciBwaW5uZWQgb3JkZXIuIEEgZmFpbGVkIHN0ZXAgaXNcbiAqIHJlY29yZGVkIGFuZCBsYXRlciBpbmRlcGVuZGVudCBzdGVwcyBzdGlsbCBydW47IGEgc3RydWN0dXJlIGlzIG5ldmVyIGJ1aWx0XG4gKiB1bmxlc3MgaXRzIG93biB0ZXJyYWluIHByZXBhcmF0aW9uIHN1Y2NlZWRlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJ1bk0wMDJTY2VuYXJpbyhcbiAgbTAwMjogTTAwMldvcmxkLCBvcHRpb25zOiBNMDAyU2NlbmFyaW9PcHRpb25zID0ge30sXG4pOiBNMDAyU2NlbmFyaW9SZXN1bHQge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IG0wMDI7XG4gIGNvbnN0IHN0YXJ0ZXIgPSBvcHRpb25zLmludmVudG9yeSA/PyBNMDAyX1NUQVJURVJfSU5WRU5UT1JZO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7fTtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMoc3RhcnRlcikpIHtcbiAgICBpZiAoKGFtb3VudCA/PyAwKSA+IDApIHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPSBhbW91bnQgYXMgbnVtYmVyO1xuICB9XG5cbiAgY29uc3QgcHJlcEF1dGhvcml6ZXIgPSBuZXcgTG9jYWxBdXRob3JpemVyKHsgZW52ZWxvcGU6IGxheW91dC5lbnZlbG9wZSB9KTtcbiAgY29uc3Qgc3RydWN0dXJlQXV0aG9yaXplciA9IG5ldyBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIoeyBlbnZlbG9wZTogbGF5b3V0LmVudmVsb3BlIH0pO1xuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgaG91c2UgPSBlbXB0eVNpdGUoKTtcbiAgY29uc3QgcGF0aCA9IGVtcHR5U2l0ZSgpO1xuICBjb25zdCBmYXJtID0gZW1wdHlTaXRlKCk7XG5cbiAgY29uc3QgaG91c2VQcmVwID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCB7XG4gICAgc2l0ZUlkOiBsYXlvdXQuaG91c2UuaWQsXG4gICAgcmVjdDogbGF5b3V0LmhvdXNlLnJlY3QsXG4gICAgZmxvb3JZOiBsYXlvdXQuaG91c2UuZmxvb3JZLFxuICAgIHJ1bGVzOiBIT1VTRV9SVUxFUyxcbiAgfSk7XG4gIGlmICghaG91c2VQcmVwLm9rKSB7XG4gICAgZXJyb3JzLnB1c2goYGhvdXNlIHByZXBhcmF0aW9uOiAke2Rlc2NyaWJlRmFpbHVyZShob3VzZVByZXApfWApO1xuICB9IGVsc2Uge1xuICAgIGhvdXNlLnByZXBhcmF0aW9uID0gaG91c2VQcmVwLmxlZGdlcjtcbiAgICBjb25zdCBob3VzZUJ1aWxkID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHtcbiAgICAgIHNpdGVJZDogbGF5b3V0LmhvdXNlLmlkLFxuICAgICAga2luZDogJ2hvdXNlJyxcbiAgICAgIHJlY3Q6IGxheW91dC5ob3VzZS5yZWN0LFxuICAgICAgZmxvb3JZOiBsYXlvdXQuaG91c2UuZmxvb3JZLFxuICAgICAgZG9vcjogbGF5b3V0LmhvdXNlLmRvb3IsXG4gICAgfSk7XG4gICAgaWYgKCFob3VzZUJ1aWxkLm9rKSB7XG4gICAgICBlcnJvcnMucHVzaChgaG91c2Ugc3RydWN0dXJlOiAke2Rlc2NyaWJlRmFpbHVyZShob3VzZUJ1aWxkKX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaG91c2Uuc3RydWN0dXJlID0gaG91c2VCdWlsZC5sZWRnZXI7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcGF0aFJlY3QgPSBtMDAyUGF0aFJlY3QoKTtcbiAgY29uc3QgcGF0aFByZXAgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgIHJlY3Q6IHBhdGhSZWN0LFxuICAgIGZsb29yWTogMTIsXG4gICAgcnVsZXM6IFBBVEhfUlVMRVMsXG4gIH0sIHtcbiAgICB0YXJnZXRzOiBtMDAyUGF0aFRhcmdldHMoKSxcbiAgICBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5HUkFWRUwsXG4gICAgZW52ZWxvcGU6IFtsYXlvdXQuZW52ZWxvcGVbMV1dLFxuICB9KTtcbiAgaWYgKCFwYXRoUHJlcC5vaykge1xuICAgIGVycm9ycy5wdXNoKGBwYXRoIHByZXBhcmF0aW9uOiAke2Rlc2NyaWJlRmFpbHVyZShwYXRoUHJlcCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgcGF0aC5wcmVwYXJhdGlvbiA9IHBhdGhQcmVwLmxlZGdlcjtcbiAgICBjb25zdCBwYXRoQnVpbGQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwge1xuICAgICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICAgIGtpbmQ6ICdwYXRoJyxcbiAgICAgIHJlY3Q6IHBhdGhSZWN0LFxuICAgICAgZmxvb3JZOiAxMixcbiAgICB9KTtcbiAgICBpZiAoIXBhdGhCdWlsZC5vaykge1xuICAgICAgZXJyb3JzLnB1c2goYHBhdGggc3RydWN0dXJlOiAke2Rlc2NyaWJlRmFpbHVyZShwYXRoQnVpbGQpfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYXRoLnN0cnVjdHVyZSA9IHBhdGhCdWlsZC5sZWRnZXI7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZmFybVByZXAgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IGxheW91dC5mYXJtLmlkLFxuICAgIHJlY3Q6IGxheW91dC5mYXJtLnJlY3QsXG4gICAgZmxvb3JZOiAxNSxcbiAgICBydWxlczogRkFSTV9SVUxFUyxcbiAgfSwge1xuICAgIHRhcmdldHM6IG0wMDJGYXJtVGFyZ2V0cygpLFxuICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULlNPSUwsXG4gICAgZW52ZWxvcGU6IFtsYXlvdXQuZW52ZWxvcGVbMl1dLFxuICB9KTtcbiAgaWYgKCFmYXJtUHJlcC5vaykge1xuICAgIGVycm9ycy5wdXNoKGBmYXJtIHByZXBhcmF0aW9uOiAke2Rlc2NyaWJlRmFpbHVyZShmYXJtUHJlcCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgZmFybS5wcmVwYXJhdGlvbiA9IGZhcm1QcmVwLmxlZGdlcjtcbiAgICBjb25zdCBmYXJtQnVpbGQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwge1xuICAgICAgc2l0ZUlkOiBsYXlvdXQuZmFybS5pZCxcbiAgICAgIGtpbmQ6ICd0ZXJyYWNlJyxcbiAgICAgIHJlY3Q6IGxheW91dC5mYXJtLnJlY3QsXG4gICAgICBmbG9vclk6IDE1LFxuICAgICAgdGVycmFjZXM6IGxheW91dC5mYXJtLnRlcnJhY2VzLFxuICAgIH0pO1xuICAgIGlmICghZmFybUJ1aWxkLm9rKSB7XG4gICAgICBlcnJvcnMucHVzaChgZmFybSBzdHJ1Y3R1cmU6ICR7ZGVzY3JpYmVGYWlsdXJlKGZhcm1CdWlsZCl9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZhcm0uc3RydWN0dXJlID0gZmFybUJ1aWxkLmxlZGdlcjtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG9rOiBlcnJvcnMubGVuZ3RoID09PSAwLFxuICAgIGVycm9ycyxcbiAgICBob3VzZSxcbiAgICBwYXRoLFxuICAgIGZhcm0sXG4gICAgaW52ZW50b3J5QmVmb3JlLFxuICAgIGludmVudG9yeUFmdGVyOiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCksXG4gICAgaGFzaGVzOiB7XG4gICAgICB2b3hlbHM6IGNhbm9uaWNhbFJlZ2lvbkhhc2god29ybGQsIGxheW91dC5wcm90ZWN0ZWRSZWdpb24pLmhhc2gsXG4gICAgICBzdHJ1Y3R1cmVzOiBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoKHdvcmxkKSxcbiAgICAgIGludmVudG9yeTogY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZCksXG4gICAgICBlbnRpdGllczogY2Fub25pY2FsRW50aXR5SGFzaCh3b3JsZCwgbGF5b3V0LnByb3RlY3RlZFJlZ2lvbiksXG4gICAgfSxcbiAgfTtcbn1cblxuLyoqIFRvdGFsIHJlc291cmNlcyBwYWlkIHRvIHN0cnVjdHVyZXMgaW4gYSBzY2VuYXJpbyByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMlN0cnVjdHVyZUNvc3RzKHJlc3VsdDogTTAwMlNjZW5hcmlvUmVzdWx0KTogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiB7XG4gIGNvbnN0IHRvdGFsOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0ge307XG4gIGZvciAoY29uc3Qgc2l0ZSBvZiBbcmVzdWx0LmhvdXNlLCByZXN1bHQucGF0aCwgcmVzdWx0LmZhcm1dKSB7XG4gICAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMoc2l0ZS5zdHJ1Y3R1cmU/LmNvc3RQYWlkID8/IHt9KSkge1xuICAgICAgdG90YWxbcmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlXSA9ICh0b3RhbFtyZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGVdID8/IDApICsgKGFtb3VudCA/PyAwKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRvdGFsO1xufVxuIiwgIi8vIE0wMDIgcGxheWFibGUgZmlyc3Qgc2xpY2UgXHUyMDE0IHRoZSB0aHJlZSBhdXRob3JlZCBwcm9qZWN0cyBhcyBwbGFpbiBkYXRhLlxuLy9cbi8vIFRoaXMgbW9kdWxlIGlzIGRlbGliZXJhdGVseSBET00tZnJlZS4gVGhlIGJ1aWxkIHNpZGViYXIsIHRoZSBnaG9zdCBwcmV2aWV3XG4vLyBhbmQgdGhlIHRlc3RzIGFsbCByZWFkIHRoZSBzYW1lIGRlZmluaXRpb25zIGFuZCBjYWxsIHRoZSBzYW1lIHNpbXVsYXRpb25cbi8vIGVudHJ5IHBvaW50czsgYSBwcm9qZWN0IGNhbm5vdCBhZHZlcnRpc2Ugb25lIGZvb3RwcmludCwgcHJpY2Ugb3IgcHJlcGFyYXRpb25cbi8vIHN0ZXAgYW5kIHRoZW4gZXhlY3V0ZSBhbm90aGVyLlxuaW1wb3J0IHsgTUFULCBXb3JsZCwgUmVzb3VyY2VUeXBlIH0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuLi9zaW0vdGVycmFpbic7XG5pbXBvcnQge1xuICBCdWlsZGluZ1J1bGVzLCBIT1VTRV9SVUxFUywgUEFUSF9SVUxFUywgRkFSTV9SVUxFUyxcbiAgU2l0ZVByb3Bvc2FsLCBTaXRlUHJldmlldywgU2l0ZVN0YXRlLCBWYWxpZGF0aW9uUmVhc29uLCBwcmV2aWV3U2l0ZSxcbn0gZnJvbSAnLi4vc2ltL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBNMDAyX0xBWU9VVCwgTTAwMl9QQVRIX1NJVEVfSUQsIE0wMDJfVEVSUkFDRV9CQU5EUyxcbn0gZnJvbSAnLi4vc2ltL20wMDInO1xuaW1wb3J0IHtcbiAgbTAwMkZhcm1UYXJnZXRzLCBtMDAyUGF0aFJlY3QsIG0wMDJQYXRoVGFyZ2V0cyxcbn0gZnJvbSAnLi4vc2ltL3NjZW5hcmlvJztcbmltcG9ydCB7XG4gIENvbHVtblRhcmdldCwgTG9jYWxBdXRob3JpemVyLCBQcmVwYXJhdGlvbkxlZGdlciwgUHJlcGFyYXRpb25PcHRpb25zLFxuICBQbGFuUmVzdWx0LCBwbGFuUHJlcGFyYXRpb24sIHByZXBhcmVTaXRlLFxufSBmcm9tICcuLi9zaW0vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHsgY3JlYXRlV29ybGRTbmFwc2hvdCwgcmVzdG9yZVdvcmxkU25hcHNob3QgfSBmcm9tICcuLi9zaW0vc25hcHNob3QnO1xuXG5pbXBvcnQge1xuICBIT1VTRV9DT1NULCBURVJSQUNFX0NPU1QsIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgU3RydWN0dXJlLFxuICBTdHJ1Y3R1cmVLaW5kLCBTdHJ1Y3R1cmVMZWRnZXIsIFN0cnVjdHVyZVByb3Bvc2FsLCBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uLFxuICBidWlsZFN0cnVjdHVyZSwgcGF0aENvc3QsXG59IGZyb20gJy4uL3NpbS9zdHJ1Y3R1cmVzJztcblxuZXhwb3J0IHR5cGUgTTJQcm9qZWN0SWQgPSAnaG91c2UnIHwgJ3BhdGgnIHwgJ2Zhcm0nO1xuXG5leHBvcnQgaW50ZXJmYWNlIE0yR2hvc3RCYW5kIHtcbiAgejA6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0yUHJvamVjdCB7XG4gIGlkOiBNMlByb2plY3RJZDtcbiAgbmFtZTogc3RyaW5nO1xuICBzdWJ0aXRsZTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICBjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgdGVycmFjZXM/OiBudW1iZXI7XG4gIHByZXA6IFByZXBhcmF0aW9uT3B0aW9ucztcbiAgZ2hvc3RCYW5kcz86IHJlYWRvbmx5IE0yR2hvc3RCYW5kW107XG59XG5cbmNvbnN0IHBhdGhSZWN0ID0gbTAwMlBhdGhSZWN0KCk7XG5jb25zdCBwYXRoVGFyZ2V0czogQ29sdW1uVGFyZ2V0W10gPSBtMDAyUGF0aFRhcmdldHMoKTtcbmNvbnN0IGZhcm1UYXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IG0wMDJGYXJtVGFyZ2V0cygpO1xuXG4vKipcbiAqIFRoZSBmaXJzdCBwbGF5YWJsZSBzbGljZSBpbiB0aGUgcGlubmVkIG9yZGVyOiBhIGhvdXNlIG9uIHRoZSBwcmVwYXJlZCBzaGVsZixcbiAqIGEgc3RlcHBlZCBwYXRoIGZyb20gaXRzIGRvb3IsIGFuZCBhIHRlcnJhY2VkIGZpZWxkIG9uIHRoZSBzbG9wZSBiZWxvdy5cbiAqL1xuZXhwb3J0IGNvbnN0IE0yX1BST0pFQ1RTOiByZWFkb25seSBNMlByb2plY3RbXSA9IFtcbiAge1xuICAgIGlkOiAnaG91c2UnLFxuICAgIG5hbWU6IFwiRm91bmRlcidzIGhvdXNlXCIsXG4gICAgc3VidGl0bGU6ICc4IHggNiBtIFx1MDBCNyBmbGF0IHN0b25lIHNoZWxmJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgMTktbW9kdWxlIGZvdW5kZXIgY2FuZGlkYXRlIHVzZXMgYSBmbGF0IHN0b25lIGZvdW5kYXRpb24sIGEgMy4yIG0gc3RvcmV5LCBhIHJlYWwgZWFzdCBkb29yd2F5ICdcbiAgICAgICsgJ2FuZCB0d28gb3BlbiBzb3V0aCB3aW5kb3dzLiBTdHJ1Y3R1cmFsIHdhbGwgdm9pZHMgcmVxdWlyZSBtb3JlIHByaW1pdGl2ZXMgdGhhbiB0aGUgcHJvdmlzaW9uYWwgJ1xuICAgICAgKyAnYXNzZXQtdm9sdW1lIHRhcmdldDsgdGhpcyBkZXNpZ24gcmVtYWlucyBzdWJqZWN0IHRvIGFydCByZXZpZXcuJyxcbiAgICBzaXRlSWQ6IE0wMDJfTEFZT1VULmhvdXNlLmlkLFxuICAgIGtpbmQ6ICdob3VzZScsXG4gICAgcmVjdDogTTAwMl9MQVlPVVQuaG91c2UucmVjdCxcbiAgICBmbG9vclk6IE0wMDJfTEFZT1VULmhvdXNlLmZsb29yWSxcbiAgICBydWxlczogSE9VU0VfUlVMRVMsXG4gICAgY29zdDogeyAuLi5IT1VTRV9DT1NUIH0sXG4gICAgZG9vcjogTTAwMl9MQVlPVVQuaG91c2UuZG9vcixcbiAgICBhcHByb2FjaDogTTAwMl9MQVlPVVQuaG91c2UuYXBwcm9hY2gsXG4gICAgcHJlcDoge30sXG4gIH0sXG4gIHtcbiAgICBpZDogJ3BhdGgnLFxuICAgIG5hbWU6ICdEb29yIHBhdGgnLFxuICAgIHN1YnRpdGxlOiAnOSB4IDMgbSBcdTAwQjcgc3RlcHBlZCBncmF2ZWwnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ0EgbmluZS1tZXRyZSBjb3JyaWRvciBmcm9tIHRoZSBob3VzZSBkb29yIHRvIHRoZSBhcHByb2FjaC4gJ1xuICAgICAgKyAnRWFjaCBjb2x1bW4gaXMgY3V0IHRvIGEgcGlubmVkIHByb2ZpbGUgc28gdGhlIHJpc2Ugc3RheXMgd2Fsa2FibGUuJyxcbiAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgIGtpbmQ6ICdwYXRoJyxcbiAgICByZWN0OiBwYXRoUmVjdCxcbiAgICBmbG9vclk6IDEyLFxuICAgIHJ1bGVzOiBQQVRIX1JVTEVTLFxuICAgIGNvc3Q6IHBhdGhDb3N0KHBhdGhSZWN0LngxIC0gcGF0aFJlY3QueDAgKyAxKSxcbiAgICBwcmVwOiB7XG4gICAgICB0YXJnZXRzOiBwYXRoVGFyZ2V0cyxcbiAgICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULkdSQVZFTCxcbiAgICAgIGVudmVsb3BlOiBbTTAwMl9MQVlPVVQuZW52ZWxvcGVbMV1dLFxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICBpZDogJ2Zhcm0nLFxuICAgIG5hbWU6ICdUZXJyYWNlZCBmaWVsZCcsXG4gICAgc3VidGl0bGU6ICcxMiB4IDggbSBcdTAwQjcgdGhyZWUgYmFuZHMnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RocmVlIHNvaWwgdGVycmFjZXMgc3RlcHBpbmcgZG93biB0aGUgc2xvcGUsIGhlbGQgYnkgc3RvbmUgcmV0YWluaW5nIHdhbGxzLiAnXG4gICAgICArICdUaGUgYmxvc3NvbSB0cmVlIG9uIHRoZSBmaWVsZCBpcyBjbGVhcmVkIGR1cmluZyBwcmVwYXJhdGlvbi4nLFxuICAgIHNpdGVJZDogTTAwMl9MQVlPVVQuZmFybS5pZCxcbiAgICBraW5kOiAndGVycmFjZScsXG4gICAgcmVjdDogTTAwMl9MQVlPVVQuZmFybS5yZWN0LFxuICAgIGZsb29yWTogMTUsXG4gICAgcnVsZXM6IEZBUk1fUlVMRVMsXG4gICAgY29zdDogeyAuLi5URVJSQUNFX0NPU1QgfSxcbiAgICB0ZXJyYWNlczogTTAwMl9MQVlPVVQuZmFybS50ZXJyYWNlcyxcbiAgICBwcmVwOiB7XG4gICAgICB0YXJnZXRzOiBmYXJtVGFyZ2V0cyxcbiAgICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULlNPSUwsXG4gICAgICBlbnZlbG9wZTogW00wMDJfTEFZT1VULmVudmVsb3BlWzJdXSxcbiAgICB9LFxuICAgIGdob3N0QmFuZHM6IE0wMDJfVEVSUkFDRV9CQU5EUyxcbiAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0QnlJZChpZDogTTJQcm9qZWN0SWQpOiBNMlByb2plY3Qge1xuICBjb25zdCBwcm9qZWN0ID0gTTJfUFJPSkVDVFMuZmluZCgocCkgPT4gcC5pZCA9PT0gaWQpO1xuICBpZiAoIXByb2plY3QpIHRocm93IG5ldyBFcnJvcihgdW5rbm93biBNMDAyIHByb2plY3Q6ICR7aWR9YCk7XG4gIHJldHVybiBwcm9qZWN0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdFNpdGVQcm9wb3NhbChwcm9qZWN0OiBNMlByb2plY3QpOiBTaXRlUHJvcG9zYWwge1xuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvamVjdC5zaXRlSWQsXG4gICAgcmVjdDogcHJvamVjdC5yZWN0LFxuICAgIGZsb29yWTogcHJvamVjdC5mbG9vclksXG4gICAgcnVsZXM6IHByb2plY3QucnVsZXMsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0U3RydWN0dXJlUHJvcG9zYWwoXG4gIHByb2plY3Q6IE0yUHJvamVjdCwgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb24sXG4pOiBTdHJ1Y3R1cmVQcm9wb3NhbCB7XG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9qZWN0LnNpdGVJZCxcbiAgICBraW5kOiBwcm9qZWN0LmtpbmQsXG4gICAgcmVjdDogcHJvamVjdC5yZWN0LFxuICAgIGZsb29yWTogcHJvamVjdC5mbG9vclksXG4gICAgZG9vcjogcHJvamVjdC5kb29yLFxuICAgIGFwcHJvYWNoOiBwcm9qZWN0LmFwcHJvYWNoLFxuICAgIHRlcnJhY2VzOiBwcm9qZWN0LnRlcnJhY2VzLFxuICAgIC4uLihkZXNpZ25WZXJzaW9uID09PSB1bmRlZmluZWQgPyB7fSA6IHsgZGVzaWduVmVyc2lvbiB9KSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUHJvamVjdEJ1aWx0KHdvcmxkOiBXb3JsZCwgcHJvamVjdDogTTJQcm9qZWN0KTogYm9vbGVhbiB7XG4gIGZvciAoY29uc3Qgc3RydWN0dXJlIG9mIHdvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoc3RydWN0dXJlLnNpdGVJZCA9PT0gcHJvamVjdC5zaXRlSWQgJiYgc3RydWN0dXJlLmtpbmQgPT09IHByb2plY3Qua2luZCkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbmdSZXNvdXJjZSB7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGU7XG4gIG5lZWQ6IG51bWJlcjtcbiAgaGF2ZTogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWlzc2luZ1Jlc291cmNlcyh3b3JsZDogV29ybGQsIHByb2plY3Q6IE0yUHJvamVjdCk6IE1pc3NpbmdSZXNvdXJjZVtdIHtcbiAgY29uc3QgbWlzc2luZzogTWlzc2luZ1Jlc291cmNlW10gPSBbXTtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocHJvamVjdC5jb3N0KSkge1xuICAgIGNvbnN0IG5lZWQgPSBhbW91bnQgPz8gMDtcbiAgICBjb25zdCBoYXZlID0gd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwO1xuICAgIGlmIChoYXZlIDwgbmVlZCkgbWlzc2luZy5wdXNoKHsgcmVzb3VyY2U6IHJlc291cmNlIGFzIFJlc291cmNlVHlwZSwgbmVlZCwgaGF2ZSB9KTtcbiAgfVxuICByZXR1cm4gbWlzc2luZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0SW5zcGVjdGlvbiB7XG4gIHByb2plY3RJZDogTTJQcm9qZWN0SWQ7XG4gIGJ1aWx0OiBib29sZWFuO1xuICBhZmZvcmRhYmxlOiBib29sZWFuO1xuICBtaXNzaW5nOiBNaXNzaW5nUmVzb3VyY2VbXTtcbiAgc3RhdGU6IFNpdGVTdGF0ZTtcbiAgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdO1xuICBwcmV2aWV3OiBTaXRlUHJldmlldztcbiAgcGxhbjogUGxhblJlc3VsdDtcbiAgY2FuQnVpbGQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogUmVhZC1vbmx5IGluc3BlY3Rpb24gZm9yIHRoZSBnaG9zdCBhbmQgc2lkZWJhci4gSXQgcnVucyB0aGUgc2FtZSB2YWxpZGF0b3JcbiAqIGFuZCB0aGUgc2FtZSBwcmVwYXJhdGlvbiBwbGFubmVyIHRoZSBidWlsZCBidXR0b24gd2lsbCBydW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnNwZWN0UHJvamVjdCh3b3JsZDogV29ybGQsIHByb2plY3Q6IE0yUHJvamVjdCk6IFByb2plY3RJbnNwZWN0aW9uIHtcbiAgY29uc3QgcHJvcG9zYWwgPSBwcm9qZWN0U2l0ZVByb3Bvc2FsKHByb2plY3QpO1xuICBjb25zdCBwcmV2aWV3ID0gcHJldmlld1NpdGUod29ybGQsIHByb3Bvc2FsLCB7XG4gICAgZG9vcjogcHJvamVjdC5kb29yLFxuICAgIGFwcHJvYWNoOiBwcm9qZWN0LmFwcHJvYWNoLFxuICB9KTtcbiAgY29uc3QgcGxhbiA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwsIHByb2plY3QucHJlcCk7XG4gIGNvbnN0IGJ1aWx0ID0gaXNQcm9qZWN0QnVpbHQod29ybGQsIHByb2plY3QpO1xuICBjb25zdCBtaXNzaW5nID0gbWlzc2luZ1Jlc291cmNlcyh3b3JsZCwgcHJvamVjdCk7XG4gIGNvbnN0IHN0YXRlID0gcGxhbi5vayA/IHBsYW4udmFsaWRhdGlvbi5zdGF0ZSA6IHByZXZpZXcuc3RhdGU7XG4gIGNvbnN0IHJlYXNvbnMgPSBwbGFuLm9rID8gcGxhbi52YWxpZGF0aW9uLnJlYXNvbnMgOiBwcmV2aWV3LnJlYXNvbnM7XG5cbiAgcmV0dXJuIHtcbiAgICBwcm9qZWN0SWQ6IHByb2plY3QuaWQsXG4gICAgYnVpbHQsXG4gICAgYWZmb3JkYWJsZTogbWlzc2luZy5sZW5ndGggPT09IDAsXG4gICAgbWlzc2luZyxcbiAgICBzdGF0ZSxcbiAgICByZWFzb25zLFxuICAgIHByZXZpZXcsXG4gICAgcGxhbixcbiAgICBjYW5CdWlsZDogIWJ1aWx0ICYmIG1pc3NpbmcubGVuZ3RoID09PSAwICYmIHBsYW4ub2sgJiYgc3RhdGUgIT09ICdpbnZhbGlkJyxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0QnVpbGRTdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHByb2plY3Q6IE0yUHJvamVjdDtcbiAgcHJlcGFyYXRpb246IFByZXBhcmF0aW9uTGVkZ2VyO1xuICBzdHJ1Y3R1cmU6IFN0cnVjdHVyZUxlZGdlcjtcbiAgcmVjb3JkOiBTdHJ1Y3R1cmU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvamVjdEJ1aWxkRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgcHJvamVjdDogTTJQcm9qZWN0O1xuICBzdGFnZTogJ3ByZWNoZWNrJyB8ICdwcmVwYXJlJyB8ICdzdHJ1Y3R1cmUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xuICBwcmVwYXJhdGlvbj86IFByZXBhcmF0aW9uTGVkZ2VyO1xuICAvKiogRmFpbGVkIGJ1aWxkcyByb2xsIGJhY2sgdGhlIGVudGlyZSBhdXRob3JpdGF0aXZlIHByZS1idWlsZCBzbmFwc2hvdC4gKi9cbiAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZTtcbiAgcmV0cnlhYmxlOiB0cnVlO1xufVxuXG5leHBvcnQgdHlwZSBQcm9qZWN0QnVpbGRSZXN1bHQgPSBQcm9qZWN0QnVpbGRTdWNjZXNzIHwgUHJvamVjdEJ1aWxkRmFpbHVyZTtcblxuLyoqXG4gKiBQcmVwYXJlIHRoZSBzaXRlIGFuZCBjb25zdHJ1Y3QgdGhlIHByb2plY3QgdGhyb3VnaCB0aGUgYXV0aG9yaXplZCBwaXBlbGluZS5cbiAqIFRoZSByZXNvdXJjZSBjaGVjayBoYXBwZW5zIGJlZm9yZSBhbnkgdGVycmFpbiBlZGl0LCBzbyBhbiB1bmFmZm9yZGFibGUgYnVpbGRcbiAqIGNhbm5vdCBsZWF2ZSBhIGdyYWRlZCBwYWQgYmVoaW5kLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRQcm9qZWN0KFxuICB3b3JsZDogV29ybGQsXG4gIHByZXBBdXRob3JpemVyOiBMb2NhbEF1dGhvcml6ZXIsXG4gIHN0cnVjdHVyZUF1dGhvcml6ZXI6IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcixcbiAgcHJvamVjdDogTTJQcm9qZWN0LFxuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbixcbik6IFByb2plY3RCdWlsZFJlc3VsdCB7XG4gIGlmIChpc1Byb2plY3RCdWlsdCh3b3JsZCwgcHJvamVjdCkpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3ByZWNoZWNrJywgY29kZTogJ2FscmVhZHlfYnVpbHQnLFxuICAgICAgcmVhc29uczogW2Ake3Byb2plY3QubmFtZX0gaXMgYWxyZWFkeSBidWlsdGBdLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cbiAgY29uc3QgbWlzc2luZyA9IG1pc3NpbmdSZXNvdXJjZXMod29ybGQsIHByb2plY3QpO1xuICBpZiAobWlzc2luZy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdwcmVjaGVjaycsIGNvZGU6ICdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJyxcbiAgICAgIHJlYXNvbnM6IG1pc3NpbmcubWFwKChtKSA9PiBgbmVlZCAke20ubmVlZH0gJHttLnJlc291cmNlfSwgaGF2ZSAke20uaGF2ZX1gKSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgYmVmb3JlID0gY3JlYXRlV29ybGRTbmFwc2hvdCh3b3JsZCwgMCk7XG4gIGNvbnN0IHByZXBhcmVkID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCBwcm9qZWN0U2l0ZVByb3Bvc2FsKHByb2plY3QpLCBwcm9qZWN0LnByZXApO1xuICBpZiAoIXByZXBhcmVkLm9rKSB7XG4gICAgcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQsIGJlZm9yZSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdwcmVwYXJlJywgY29kZTogcHJlcGFyZWQuY29kZSxcbiAgICAgIHJlYXNvbnM6IFsuLi5wcmVwYXJlZC5yZWFzb25zLCAnTm8gcHJlcGFyYXRpb24sIHJlc291cmNlIG9yIGVudGl0eSBjaGFuZ2VzIHdlcmUgcmV0YWluZWQuJ10sXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IGJ1aWx0ID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHByb2plY3RTdHJ1Y3R1cmVQcm9wb3NhbChwcm9qZWN0LCBkZXNpZ25WZXJzaW9uKSk7XG4gIGlmICghYnVpbHQub2spIHtcbiAgICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgYmVmb3JlKTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3N0cnVjdHVyZScsIGNvZGU6IGJ1aWx0LmNvZGUsXG4gICAgICByZWFzb25zOiBbLi4uYnVpbHQucmVhc29ucyxcbiAgICAgICAgJ0FsbCBwcmVwYXJhdGlvbiwgcmVzb3VyY2UgYW5kIGVudGl0eSBjaGFuZ2VzIHdlcmUgcm9sbGVkIGJhY2s7IHRoZSBidWlsZCBjYW4gYmUgcmV0cmllZC4nXSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgcmVjb3JkID0gd29ybGQuc3RydWN0dXJlcy5nZXQoYnVpbHQubGVkZ2VyLnN0cnVjdHVyZUlkKTtcbiAgaWYgKCFyZWNvcmQpIHtcbiAgICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgYmVmb3JlKTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3N0cnVjdHVyZScsIGNvZGU6ICdtaXNzaW5nX3JlY29yZCcsXG4gICAgICByZWFzb25zOiBbJ3N0cnVjdHVyZSBsZWRnZXIgd2FzIHdyaXR0ZW4gYnV0IHRoZSB3b3JsZCBoYXMgbm8gcmVjb3JkJyxcbiAgICAgICAgJ0FsbCBwcmVwYXJhdGlvbiwgcmVzb3VyY2UgYW5kIGVudGl0eSBjaGFuZ2VzIHdlcmUgcm9sbGVkIGJhY2s7IHRoZSBidWlsZCBjYW4gYmUgcmV0cmllZC4nXSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBwcm9qZWN0LFxuICAgIHByZXBhcmF0aW9uOiBwcmVwYXJlZC5sZWRnZXIsXG4gICAgc3RydWN0dXJlOiBidWlsdC5sZWRnZXIsXG4gICAgcmVjb3JkLFxuICB9O1xufVxuIiwgIi8vIFRoZSBzb2xlIHdyaXRlIGJvdW5kYXJ5IGZvciB0aGUgcGxheWFibGUgTTAwMiBzbGljZS4gQWNjZXB0ZWQgY29tbWFuZHMgYXJlXG4vLyBkdXJhYmxlIGlucHV0OyByZWplY3RlZCBhdHRlbXB0cywgcmVuZGVyZXIgd29yayBhbmQgdGVycmFpbiBxdWVyaWVzIGFyZSBub3QuXG5pbXBvcnQge1xuICBSZXNvdXJjZVR5cGUsIFdvcmxkLCBjcmVhdGVXb3JsZCwgZ2VuZXJhdGVXb3JsZCwgaGFydmVzdEVudGl0eSwgcGxhY2VBdXRob3JlZFNpdGVzLFxuICByZXRpcmVTdG9uZUVudGl0aWVzLCBpc1JldGlyZWRTdG9uZUtpbmQsIEdFTkVSQVRPUl9WRVJTSU9OLCBHRU5FUkFUT1JfVjIsXG59IGZyb20gJy4uL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBNMDAyX0xBWU9VVCB9IGZyb20gJy4uL3NpbS9tMDAyJztcbmltcG9ydCB7IExvY2FsQXV0aG9yaXplciB9IGZyb20gJy4uL3NpbS9wcmVwYXJhdGlvbic7XG5pbXBvcnQgeyBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsIEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSBmcm9tICcuLi9zaW0vc3RydWN0dXJlcyc7XG5pbXBvcnQgeyBNMDAyX1NUQVJURVJfSU5WRU5UT1JZIH0gZnJvbSAnLi4vc2ltL3NjZW5hcmlvJztcbmltcG9ydCB7XG4gIFdvcmxkU25hcHNob3QsIGNhbm9uaWNhbFdvcmxkSGFzaCwgY3JlYXRlV29ybGRTbmFwc2hvdCxcbiAgbGVnYWN5U3RvbmVIYXNoLCBtaWdyYXRlU3RvbmVTbmFwc2hvdCwgcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCwgdmFsaWRhdGVXb3JsZFNuYXBzaG90LCB3b3JsZEZyb21TbmFwc2hvdCxcbn0gZnJvbSAnLi4vc2ltL3NuYXBzaG90JztcbmltcG9ydCB7IGVuYWJsZVN0b25lUmVwbGF5LCBmaW5pc2hTdG9uZVJlcGxheSB9IGZyb20gJy4uL3NpbS9zdG9uZS1jb21wYXQnO1xuaW1wb3J0IHsgTTJQcm9qZWN0SWQsIGJ1aWxkUHJvamVjdCwgcHJvamVjdEJ5SWQgfSBmcm9tICcuL3Byb2plY3RzJztcbmltcG9ydCB7XG4gIENST1BfR1JPV1RIX1RJQ0tTLCBDUk9QX1lJRUxELCBGT1VOREVSX1NUT0NLUElMRV9JRCwgTElGRV9SRVNPVVJDRVMsIE1BWF9USUNLU19QRVJfQ09NTUFORCwgTGlmZVJlc291cmNlLCBMaWZlUmVzb3VyY2VCYWcsIFJFQ0lQRVMsIFJlY2lwZUlkLFxuICBhZHZhbmNlVGlja3MsIGNyZWF0ZUxpZmVTdGF0ZSwgaGFydmVzdENyb3AsIHBsYW50Q3JvcCwgc3RhcnRQcm9kdWN0aW9uLCB0cmFuc2Zlcixcbn0gZnJvbSAnLi4vc2ltL2Vjb25vbXknO1xuXG5leHBvcnQgY29uc3QgSk9VUk5BTF9TQ0hFTUEgPSAxIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IERFU0lHTl9KT1VSTkFMX1NDSEVNQSA9IDIgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSA9IDMgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgTUFYX0pPVVJOQUxfRU5UUklFUyA9IDEwMF8wMDA7XG5leHBvcnQgdHlwZSBDb21tYW5kID0gTGVnYWN5QnVpbGRDb21tYW5kIHwgQnVpbGRDb21tYW5kIHwgSGFydmVzdENvbW1hbmRcbiAgfCBUcmFuc2ZlckNvbW1hbmQgfCBQcm9kdWNlQ29tbWFuZCB8IFRpY2tDb21tYW5kIHwgUGxhbnRDb21tYW5kIHwgSGFydmVzdENyb3BDb21tYW5kO1xuaW50ZXJmYWNlIENvbW1hbmRFbnZlbG9wZSB7XG4gIHNjaGVtYTogdHlwZW9mIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUE7XG4gIGlkOiBzdHJpbmc7XG4gIGV4cGVjdGVkUmV2aXNpb246IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNmZXJDb21tYW5kIGV4dGVuZHMgQ29tbWFuZEVudmVsb3BlIHtcbiAgdHlwZTogJ2RlcG9zaXQnIHwgJ3dpdGhkcmF3JztcbiAgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVzb3VyY2VzOiBMaWZlUmVzb3VyY2VCYWc7XG59XG5leHBvcnQgaW50ZXJmYWNlIFByb2R1Y2VDb21tYW5kIGV4dGVuZHMgQ29tbWFuZEVudmVsb3BlIHtcbiAgdHlwZTogJ3Byb2R1Y2UnOyBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEOyByZWNpcGU6IGtleW9mIHR5cGVvZiBSRUNJUEVTO1xufVxuZXhwb3J0IGludGVyZmFjZSBUaWNrQ29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7IHR5cGU6ICd0aWNrJzsgdGlja3M6IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBQbGFudENvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUgeyB0eXBlOiAncGxhbnQnOyBwbG90SWQ6IHN0cmluZzsgfVxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0Q3JvcENvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUgeyB0eXBlOiAnaGFydmVzdF9jcm9wJzsgcGxvdElkOiBzdHJpbmc7IH1cbmV4cG9ydCBpbnRlcmZhY2UgTGVnYWN5QnVpbGRDb21tYW5kIHtcbiAgc2NoZW1hOiB0eXBlb2YgSk9VUk5BTF9TQ0hFTUE7XG4gIGlkOiBzdHJpbmc7XG4gIHR5cGU6ICdidWlsZCc7XG4gIHByb2plY3RJZDogTTJQcm9qZWN0SWQ7XG4gIGV4cGVjdGVkUmV2aXNpb246IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbGRDb21tYW5kIHtcbiAgc2NoZW1hOiB0eXBlb2YgREVTSUdOX0pPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUE7XG4gIGlkOiBzdHJpbmc7XG4gIHR5cGU6ICdidWlsZCc7XG4gIHByb2plY3RJZDogTTJQcm9qZWN0SWQ7XG4gIGV4cGVjdGVkUmV2aXNpb246IG51bWJlcjtcbiAgZGVzaWduVmVyc2lvbjogdHlwZW9mIEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG59XG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RDb21tYW5kIHtcbiAgc2NoZW1hOiB0eXBlb2YgSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgdHlwZTogJ2hhcnZlc3QnO1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBleHBlY3RlZFJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIENvbW1hbmRPdXRjb21lID0gQnVpbGRPdXRjb21lIHwgSGFydmVzdE91dGNvbWUgfCBUcmFuc2Zlck91dGNvbWUgfCBQcm9kdWNlT3V0Y29tZSB8IFRpY2tPdXRjb21lIHwgUGxhbnRPdXRjb21lIHwgQ3JvcE91dGNvbWU7XG5leHBvcnQgaW50ZXJmYWNlIFRyYW5zZmVyT3V0Y29tZSB7XG4gIHR5cGU6ICdkZXBvc2l0JyB8ICd3aXRoZHJhdyc7IHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gIHJlc291cmNlczogUGFydGlhbDxSZWNvcmQ8TGlmZVJlc291cmNlLCBudW1iZXI+Pjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZHVjZU91dGNvbWUge1xuICB0eXBlOiAncHJvZHVjZSc7IGpvYklkOiBzdHJpbmc7IHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gIHJlY2lwZToga2V5b2YgdHlwZW9mIFJFQ0lQRVM7IHJlbWFpbmluZ1RpY2tzOiBudW1iZXI7XG59XG5leHBvcnQgaW50ZXJmYWNlIFRpY2tPdXRjb21lIHtcbiAgdHlwZTogJ3RpY2snOyBmcm9tVGljazogbnVtYmVyOyB0b1RpY2s6IG51bWJlcjtcbiAgY29tcGxldGVkSm9iczogQXJyYXk8eyBpZDogc3RyaW5nOyByZWNpcGU6IGtleW9mIHR5cGVvZiBSRUNJUEVTOyBvdXRwdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfT47XG4gIHJlYWR5Q3JvcHM6IHN0cmluZ1tdO1xufVxuZXhwb3J0IGludGVyZmFjZSBQbGFudE91dGNvbWUge1xuICB0eXBlOiAncGxhbnQnOyBwbG90SWQ6IHN0cmluZzsgcGxhbnRlZFRpY2s6IG51bWJlcjsgZ3Jvd3RoVGlja3M6IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQ3JvcE91dGNvbWUge1xuICB0eXBlOiAnaGFydmVzdF9jcm9wJzsgcGxvdElkOiBzdHJpbmc7IHJlc291cmNlczogeyBmb29kOiBudW1iZXI7IGZpYmVyOiBudW1iZXIgfTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbGRPdXRjb21lIHtcbiAgdHlwZTogJ2J1aWxkJztcbiAgc3RydWN0dXJlSWQ6IHN0cmluZztcbiAgY29zdFBhaWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIHJlc291cmNlc0dhaW5lZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+Pjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdE91dGNvbWUge1xuICB0eXBlOiAnaGFydmVzdCc7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGU7XG4gIGFtb3VudDogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBKb3VybmFsRW50cnkge1xuICBjb21tYW5kOiBDb21tYW5kO1xuICBzZXF1ZW5jZTogbnVtYmVyO1xuICByZXZpc2lvbjogbnVtYmVyO1xuICBoYXNoOiBzdHJpbmc7XG4gIG91dGNvbWU6IENvbW1hbmRPdXRjb21lO1xufVxuZXhwb3J0IGludGVyZmFjZSBDb21tYW5kSm91cm5hbCB7XG4gIHNjaGVtYTogdHlwZW9mIEpPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9KT1VSTkFMX1NDSEVNQSB8IHR5cGVvZiBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BO1xuICBzZWVkOiBudW1iZXI7XG4gIC8qKlxuICAgKiBUZXJyYWluIGdlbmVyYXRvciBvZiB0aGUgd29ybGQgdGhpcyBqb3VybmFsIHJlcGxheXMgb24uIEFic2VudCBtZWFucyB2MTpcbiAgICogZXZlcnkgc2F2ZSB3cml0dGVuIGJlZm9yZSBnZW5lcmF0b3IgdjIgb21pdHMgdGhlIGZpZWxkLCBzbyBpdHMgY2Fub25pY2FsXG4gICAqIGJ5dGVzIChhbmQgaGFzaGVzKSBhcmUgdW5jaGFuZ2VkLlxuICAgKi9cbiAgZ2VuZXJhdG9yVmVyc2lvbj86IHR5cGVvZiBHRU5FUkFUT1JfVjI7XG4gIHN0YXJ0ZXJJbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGVudHJpZXM6IEpvdXJuYWxFbnRyeVtdO1xufVxuZXhwb3J0IGludGVyZmFjZSBDb21tYW5kUmVjZWlwdCB7XG4gIG9rOiB0cnVlO1xuICBkdXBsaWNhdGU6IGJvb2xlYW47XG4gIGlkOiBzdHJpbmc7XG4gIHNlcXVlbmNlOiBudW1iZXI7XG4gIHJldmlzaW9uOiBudW1iZXI7XG4gIGhhc2g6IHN0cmluZztcbiAgb3V0Y29tZTogQ29tbWFuZE91dGNvbWU7XG59XG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRSZWplY3Rpb24ge1xuICBvazogZmFsc2U7XG4gIGR1cGxpY2F0ZTogZmFsc2U7XG4gIGlkOiBzdHJpbmc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmZ1bmN0aW9uIG9iamVjdCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuZnVuY3Rpb24gdWludCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc1NhZmVJbnRlZ2VyKHZhbHVlKSAmJiB2YWx1ZSA+PSAwO1xufVxuZnVuY3Rpb24gaWQodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiAvXltBLVphLXowLTldW0EtWmEtejAtOS5fOiUtXXswLDEyN30kLy50ZXN0KHZhbHVlKTtcbn1cbmZ1bmN0aW9uIGVudGl0eUlkKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgc3RyaW5nIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUubGVuZ3RoIDw9IDEyOFxuICAgICYmICgvXmU6XFxkKyxcXGQrOlxcZCskLy50ZXN0KHZhbHVlKVxuICAgICAgfHwgL15oZXJvOnN0eWxfW2Etel9dKzotP1xcZCs6LT9cXGQrJC8udGVzdCh2YWx1ZSkpO1xufVxuZnVuY3Rpb24gc2FtZUZpZWxkcyhhOiB1bmtub3duLCBiOiB1bmtub3duKTogYm9vbGVhbiB7XG4gIGlmIChvYmplY3QoYSkgJiYgb2JqZWN0KGIpKSB7XG4gICAgY29uc3QgYUtleXMgPSBPYmplY3Qua2V5cyhhKS5zb3J0KCksIGJLZXlzID0gT2JqZWN0LmtleXMoYikuc29ydCgpO1xuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShhS2V5cykgPT09IEpTT04uc3RyaW5naWZ5KGJLZXlzKVxuICAgICAgJiYgYUtleXMuZXZlcnkoKGtleSkgPT4gc2FtZUZpZWxkcyhhW2tleV0sIGJba2V5XSkpO1xuICB9XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShhKSA9PT0gSlNPTi5zdHJpbmdpZnkoYik7XG59XG5cbmZ1bmN0aW9uIGludmVudG9yeSh2YWx1ZTogdW5rbm93bik6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBpZiAoIW9iamVjdCh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCByZXNvdXJjZSByZWNvcmQnKTtcbiAgY29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHZhbHVlKS5zb3J0KCkpIHtcbiAgICBpZiAoIUxJRkVfUkVTT1VSQ0VTLmluY2x1ZGVzKGtleSBhcyBMaWZlUmVzb3VyY2UpXG4gICAgICB8fCAhdWludCh2YWx1ZVtrZXldKSB8fCB2YWx1ZVtrZXldIDw9IDAgfHwgdmFsdWVba2V5XSA+IDFfMDAwXzAwMF8wMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignaW52YWxpZCByZXNvdXJjZSByZWNvcmQnKTtcbiAgICB9XG4gICAgcmVzdWx0W2tleV0gPSB2YWx1ZVtrZXldO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKiBDYW5vbmljYWxpemUgYW5kIHJlamVjdCB1bmtub3duLCBhbWJpZ3VvdXMgb3IgbWFsZm9ybWVkIGNvbW1hbmQgZmllbGRzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlQ29tbWFuZCh2YWx1ZTogdW5rbm93bik6IENvbW1hbmQge1xuICBpZiAoIW9iamVjdCh2YWx1ZSkgfHwgKHZhbHVlLnNjaGVtYSAhPT0gSk9VUk5BTF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBERVNJR05fSk9VUk5BTF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKVxuICAgIHx8ICFpZCh2YWx1ZS5pZCkgfHwgIXVpbnQodmFsdWUuZXhwZWN0ZWRSZXZpc2lvbikpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBjb21tYW5kIGVudmVsb3BlJyk7XG4gIGlmICh2YWx1ZS50eXBlID09PSAnYnVpbGQnICYmIFsnaG91c2UnLCAncGF0aCcsICdmYXJtJ10uaW5jbHVkZXMoU3RyaW5nKHZhbHVlLnByb2plY3RJZCkpKSB7XG4gICAgY29uc3QgY29tbWFuZDogQ29tbWFuZCA9IHZhbHVlLnNjaGVtYSAhPT0gSk9VUk5BTF9TQ0hFTUEgPyB7XG4gICAgICBzY2hlbWE6IHZhbHVlLnNjaGVtYSwgaWQ6IHZhbHVlLmlkLCB0eXBlOiAnYnVpbGQnLFxuICAgICAgcHJvamVjdElkOiB2YWx1ZS5wcm9qZWN0SWQgYXMgTTJQcm9qZWN0SWQsIGV4cGVjdGVkUmV2aXNpb246IHZhbHVlLmV4cGVjdGVkUmV2aXNpb24sXG4gICAgICBkZXNpZ25WZXJzaW9uOiB2YWx1ZS5kZXNpZ25WZXJzaW9uIGFzIHR5cGVvZiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OLFxuICAgIH0gOiB7XG4gICAgICBzY2hlbWE6IEpPVVJOQUxfU0NIRU1BLCBpZDogdmFsdWUuaWQsIHR5cGU6ICdidWlsZCcsXG4gICAgICBwcm9qZWN0SWQ6IHZhbHVlLnByb2plY3RJZCBhcyBNMlByb2plY3RJZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbixcbiAgICB9O1xuICAgIGlmIChjb21tYW5kLnNjaGVtYSAhPT0gSk9VUk5BTF9TQ0hFTUEgJiYgY29tbWFuZC5kZXNpZ25WZXJzaW9uICE9PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIHN0cnVjdHVyZSBkZXNpZ24nKTtcbiAgICB9XG4gICAgaWYgKCFzYW1lRmllbGRzKGNvbW1hbmQsIHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGJ1aWxkIGNvbW1hbmQnKTtcbiAgICByZXR1cm4gY29tbWFuZDtcbiAgfVxuICBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3QnICYmIHZhbHVlLnNjaGVtYSA9PT0gSk9VUk5BTF9TQ0hFTUEgJiYgZW50aXR5SWQodmFsdWUuZW50aXR5SWQpKSB7XG4gICAgY29uc3QgY29tbWFuZDogQ29tbWFuZCA9IHtcbiAgICAgIHNjaGVtYTogdmFsdWUuc2NoZW1hLCBpZDogdmFsdWUuaWQsIHR5cGU6ICdoYXJ2ZXN0JyxcbiAgICAgIGVudGl0eUlkOiB2YWx1ZS5lbnRpdHlJZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbixcbiAgICB9O1xuICAgIGlmICghc2FtZUZpZWxkcyhjb21tYW5kLCB2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBoYXJ2ZXN0IGNvbW1hbmQnKTtcbiAgICByZXR1cm4gY29tbWFuZDtcbiAgfVxuICBpZiAodmFsdWUuc2NoZW1hID09PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB7XG4gICAgY29uc3QgYmFzZSA9IHsgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIGlkOiB2YWx1ZS5pZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbiB9O1xuICAgIGxldCBjb21tYW5kOiBDb21tYW5kIHwgbnVsbCA9IG51bGw7XG4gICAgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0JyAmJiBlbnRpdHlJZCh2YWx1ZS5lbnRpdHlJZCkpIHtcbiAgICAgIGNvbW1hbmQgPSB7IHNjaGVtYTogdmFsdWUuc2NoZW1hLCBpZDogdmFsdWUuaWQsIHR5cGU6IHZhbHVlLnR5cGUsXG4gICAgICAgIGVudGl0eUlkOiB2YWx1ZS5lbnRpdHlJZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbiB9O1xuICAgIH0gZWxzZSBpZiAoKHZhbHVlLnR5cGUgPT09ICdkZXBvc2l0JyB8fCB2YWx1ZS50eXBlID09PSAnd2l0aGRyYXcnKSAmJiB2YWx1ZS5zdG9ja3BpbGVJZCA9PT0gRk9VTkRFUl9TVE9DS1BJTEVfSUQpIHtcbiAgICAgIGNvbW1hbmQgPSB7IC4uLmJhc2UsIHR5cGU6IHZhbHVlLnR5cGUsIHN0b2NrcGlsZUlkOiB2YWx1ZS5zdG9ja3BpbGVJZCwgcmVzb3VyY2VzOiBpbnZlbnRvcnkodmFsdWUucmVzb3VyY2VzKSB9O1xuICAgIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3Byb2R1Y2UnICYmIHZhbHVlLnN0b2NrcGlsZUlkID09PSBGT1VOREVSX1NUT0NLUElMRV9JRFxuICAgICAgJiYgKHZhbHVlLnJlY2lwZSA9PT0gJ3NlZWQnIHx8IHZhbHVlLnJlY2lwZSA9PT0gJ3JhdGlvbnMnKSkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLCByZWNpcGU6IHZhbHVlLnJlY2lwZSB9O1xuICAgIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3RpY2snICYmIHVpbnQodmFsdWUudGlja3MpICYmIHZhbHVlLnRpY2tzID4gMCAmJiB2YWx1ZS50aWNrcyA8PSBNQVhfVElDS1NfUEVSX0NPTU1BTkQpIHtcbiAgICAgIGNvbW1hbmQgPSB7IC4uLmJhc2UsIHR5cGU6IHZhbHVlLnR5cGUsIHRpY2tzOiB2YWx1ZS50aWNrcyB9O1xuICAgIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3BsYW50JyAmJiB0eXBlb2YgdmFsdWUucGxvdElkID09PSAnc3RyaW5nJyAmJiAvXmNyb3A6WzAtOF0kLy50ZXN0KHZhbHVlLnBsb3RJZCkpIHtcbiAgICAgIGNvbW1hbmQgPSB7IC4uLmJhc2UsIHR5cGU6IHZhbHVlLnR5cGUsIHBsb3RJZDogdmFsdWUucGxvdElkIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAnaGFydmVzdF9jcm9wJyAmJiB0eXBlb2YgdmFsdWUucGxvdElkID09PSAnc3RyaW5nJyAmJiAvXmNyb3A6WzAtOF0kLy50ZXN0KHZhbHVlLnBsb3RJZCkpIHtcbiAgICAgIGNvbW1hbmQgPSB7IC4uLmJhc2UsIHR5cGU6IHZhbHVlLnR5cGUsIHBsb3RJZDogdmFsdWUucGxvdElkIH07XG4gICAgfVxuICAgIGlmIChjb21tYW5kKSB7XG4gICAgICBpZiAoIXNhbWVGaWVsZHMoY29tbWFuZCwgdmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgbGlmZS1sb29wIGNvbW1hbmQnKTtcbiAgICAgIHJldHVybiBjb21tYW5kO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIGNvbW1hbmQnKTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVPdXRjb21lKHZhbHVlOiB1bmtub3duKTogQ29tbWFuZE91dGNvbWUge1xuICBpZiAoIW9iamVjdCh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBjb21tYW5kIG91dGNvbWUnKTtcbiAgaWYgKHZhbHVlLnR5cGUgPT09ICdidWlsZCcgJiYgaWQodmFsdWUuc3RydWN0dXJlSWQpKSB7XG4gICAgY29uc3Qgb3V0Y29tZTogQ29tbWFuZE91dGNvbWUgPSB7XG4gICAgICB0eXBlOiAnYnVpbGQnLCBzdHJ1Y3R1cmVJZDogdmFsdWUuc3RydWN0dXJlSWQsXG4gICAgICBjb3N0UGFpZDogaW52ZW50b3J5KHZhbHVlLmNvc3RQYWlkKSwgcmVzb3VyY2VzR2FpbmVkOiBpbnZlbnRvcnkodmFsdWUucmVzb3VyY2VzR2FpbmVkKSxcbiAgICB9O1xuICAgIGlmIChKU09OLnN0cmluZ2lmeShvdXRjb21lKSAhPT0gSlNPTi5zdHJpbmdpZnkodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgYnVpbGQgb3V0Y29tZScpO1xuICAgIHJldHVybiBvdXRjb21lO1xuICB9XG4gIGlmICh2YWx1ZS50eXBlID09PSAnaGFydmVzdCcgJiYgZW50aXR5SWQodmFsdWUuZW50aXR5SWQpXG4gICAgJiYgWyd3b29kJywgJ3N0b25lJywgJ29yZScsICdmaWJlciddLmluY2x1ZGVzKFN0cmluZyh2YWx1ZS5yZXNvdXJjZSkpXG4gICAgJiYgdWludCh2YWx1ZS5hbW91bnQpICYmIHZhbHVlLmFtb3VudCA+IDAgJiYgdmFsdWUuYW1vdW50IDw9IDFfMDAwXzAwMCkge1xuICAgIGNvbnN0IG91dGNvbWU6IENvbW1hbmRPdXRjb21lID0ge1xuICAgICAgdHlwZTogJ2hhcnZlc3QnLCBlbnRpdHlJZDogdmFsdWUuZW50aXR5SWQsXG4gICAgICByZXNvdXJjZTogdmFsdWUucmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlLCBhbW91bnQ6IHZhbHVlLmFtb3VudCxcbiAgICB9O1xuICAgIGlmIChKU09OLnN0cmluZ2lmeShvdXRjb21lKSAhPT0gSlNPTi5zdHJpbmdpZnkodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgaGFydmVzdCBvdXRjb21lJyk7XG4gICAgcmV0dXJuIG91dGNvbWU7XG4gIH1cbiAgbGV0IG91dGNvbWU6IENvbW1hbmRPdXRjb21lIHwgbnVsbCA9IG51bGw7XG4gIGlmICgodmFsdWUudHlwZSA9PT0gJ2RlcG9zaXQnIHx8IHZhbHVlLnR5cGUgPT09ICd3aXRoZHJhdycpICYmIHZhbHVlLnN0b2NrcGlsZUlkID09PSBGT1VOREVSX1NUT0NLUElMRV9JRCkge1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIHN0b2NrcGlsZUlkOiB2YWx1ZS5zdG9ja3BpbGVJZCwgcmVzb3VyY2VzOiBpbnZlbnRvcnkodmFsdWUucmVzb3VyY2VzKSB9O1xuICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdwcm9kdWNlJyAmJiBpZCh2YWx1ZS5qb2JJZCkgJiYgdmFsdWUuc3RvY2twaWxlSWQgPT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEXG4gICAgJiYgKHZhbHVlLnJlY2lwZSA9PT0gJ3NlZWQnIHx8IHZhbHVlLnJlY2lwZSA9PT0gJ3JhdGlvbnMnKSAmJiB1aW50KHZhbHVlLnJlbWFpbmluZ1RpY2tzKSAmJiB2YWx1ZS5yZW1haW5pbmdUaWNrcyA+IDApIHtcbiAgICBvdXRjb21lID0geyB0eXBlOiB2YWx1ZS50eXBlLCBqb2JJZDogdmFsdWUuam9iSWQsIHN0b2NrcGlsZUlkOiB2YWx1ZS5zdG9ja3BpbGVJZCxcbiAgICAgIHJlY2lwZTogdmFsdWUucmVjaXBlLCByZW1haW5pbmdUaWNrczogdmFsdWUucmVtYWluaW5nVGlja3MgfTtcbiAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAncGxhbnQnICYmIHR5cGVvZiB2YWx1ZS5wbG90SWQgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QodmFsdWUucGxvdElkKVxuICAgICYmIHVpbnQodmFsdWUucGxhbnRlZFRpY2spICYmIHZhbHVlLmdyb3d0aFRpY2tzID09PSBDUk9QX0dST1dUSF9USUNLUykge1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIHBsb3RJZDogdmFsdWUucGxvdElkLCBwbGFudGVkVGljazogdmFsdWUucGxhbnRlZFRpY2ssIGdyb3d0aFRpY2tzOiB2YWx1ZS5ncm93dGhUaWNrcyB9O1xuICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnICYmIHR5cGVvZiB2YWx1ZS5wbG90SWQgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QodmFsdWUucGxvdElkKVxuICAgICYmIGlzUmVzb3VyY2VzKHZhbHVlLnJlc291cmNlcykgJiYgdmFsdWUucmVzb3VyY2VzLmZvb2QgPT09IENST1BfWUlFTEQuZm9vZCAmJiB2YWx1ZS5yZXNvdXJjZXMuZmliZXIgPT09IENST1BfWUlFTEQuZmliZXIpIHtcbiAgICBvdXRjb21lID0geyB0eXBlOiB2YWx1ZS50eXBlLCBwbG90SWQ6IHZhbHVlLnBsb3RJZCxcbiAgICAgIHJlc291cmNlczogeyBmb29kOiBDUk9QX1lJRUxELmZvb2QsIGZpYmVyOiBDUk9QX1lJRUxELmZpYmVyIH0gfTtcbiAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAndGljaycgJiYgdWludCh2YWx1ZS5mcm9tVGljaykgJiYgdWludCh2YWx1ZS50b1RpY2spXG4gICAgJiYgdmFsdWUudG9UaWNrID4gdmFsdWUuZnJvbVRpY2sgJiYgdmFsdWUudG9UaWNrIC0gdmFsdWUuZnJvbVRpY2sgPD0gTUFYX1RJQ0tTX1BFUl9DT01NQU5EXG4gICAgJiYgQXJyYXkuaXNBcnJheSh2YWx1ZS5jb21wbGV0ZWRKb2JzKSAmJiBBcnJheS5pc0FycmF5KHZhbHVlLnJlYWR5Q3JvcHMpKSB7XG4gICAgY29uc3QgY29tcGxldGVkSm9iczogQXJyYXk8eyBpZDogc3RyaW5nOyByZWNpcGU6IFJlY2lwZUlkOyBvdXRwdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfT4gPSB2YWx1ZS5jb21wbGV0ZWRKb2JzLm1hcCgocmF3OiB1bmtub3duKSA9PiB7XG4gICAgICBpZiAoIW9iamVjdChyYXcpIHx8ICFpZChyYXcuaWQpIHx8IChyYXcucmVjaXBlICE9PSAnc2VlZCcgJiYgcmF3LnJlY2lwZSAhPT0gJ3JhdGlvbnMnKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbXBsZXRlZCBqb2InKTtcbiAgICAgIHJldHVybiB7IGlkOiByYXcuaWQsIHJlY2lwZTogcmF3LnJlY2lwZSwgb3V0cHV0OiBpbnZlbnRvcnkocmF3Lm91dHB1dCkgfTtcbiAgICB9KTtcbiAgICBpZiAoIXZhbHVlLnJlYWR5Q3JvcHMuZXZlcnkoKHBsb3QpID0+IHR5cGVvZiBwbG90ID09PSAnc3RyaW5nJyAmJiAvXmNyb3A6WzAtOF0kLy50ZXN0KHBsb3QpKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlYWR5IGNyb3BzJyk7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgZnJvbVRpY2s6IHZhbHVlLmZyb21UaWNrLCB0b1RpY2s6IHZhbHVlLnRvVGljayxcbiAgICAgIGNvbXBsZXRlZEpvYnMsIHJlYWR5Q3JvcHM6IFsuLi52YWx1ZS5yZWFkeUNyb3BzXSB9O1xuICB9XG4gIGlmIChvdXRjb21lKSB7XG4gICAgaWYgKEpTT04uc3RyaW5naWZ5KG91dGNvbWUpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBsaWZlLWxvb3Agb3V0Y29tZScpO1xuICAgIHJldHVybiBvdXRjb21lO1xuICB9XG4gIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBjb21tYW5kIG91dGNvbWUnKTtcbn1cblxuZnVuY3Rpb24gaXNSZXNvdXJjZXModmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgcmV0dXJuIG9iamVjdCh2YWx1ZSkgJiYgT2JqZWN0LnZhbHVlcyh2YWx1ZSkuZXZlcnkoKGFtb3VudCkgPT4gdWludChhbW91bnQpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUpvdXJuYWwoXG4gIHNlZWQgPSAxMzM3LCBzY2hlbWE6IENvbW1hbmRKb3VybmFsWydzY2hlbWEnXSA9IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTixcbik6IENvbW1hbmRKb3VybmFsIHtcbiAgaWYgKGdlbmVyYXRvclZlcnNpb24gIT09IEdFTkVSQVRPUl9WRVJTSU9OICYmIHNjaGVtYSAhPT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkge1xuICAgIHRocm93IG5ldyBFcnJvcignbGVnYWN5IGpvdXJuYWwgc2NoZW1hcyBvbmx5IGV4aXN0IGZvciBnZW5lcmF0b3IgdjEnKTtcbiAgfVxuICByZXR1cm4ge1xuICAgIHNjaGVtYSwgc2VlZCxcbiAgICAuLi4oZ2VuZXJhdG9yVmVyc2lvbiA9PT0gR0VORVJBVE9SX1YyID8geyBnZW5lcmF0b3JWZXJzaW9uOiBHRU5FUkFUT1JfVjIgfSA6IHt9KSxcbiAgICBzdGFydGVySW52ZW50b3J5OiBpbnZlbnRvcnkoTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSksIGVudHJpZXM6IFtdLFxuICB9O1xufVxuXG4vKiogR2VuZXJhdG9yIHZlcnNpb24gYSBqb3VybmFsIHJlcGxheXMgb24gKGFic2VudCBmaWVsZCA9IHYxKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBqb3VybmFsR2VuZXJhdG9yKGpvdXJuYWw6IFBpY2s8Q29tbWFuZEpvdXJuYWwsICdnZW5lcmF0b3JWZXJzaW9uJz4pOiBudW1iZXIge1xuICByZXR1cm4gam91cm5hbC5nZW5lcmF0b3JWZXJzaW9uID8/IEdFTkVSQVRPUl9WRVJTSU9OO1xufVxuXG4vKiogVmFsaWRhdGUgYW4gZW50aXJlIGpvdXJuYWwgd2l0aG91dCBjaGFuZ2luZyBhIGxpdmUgc2Vzc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZUpvdXJuYWwodmFsdWU6IHVua25vd24pOiBDb21tYW5kSm91cm5hbCB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSB8fCAodmFsdWUuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IERFU0lHTl9KT1VSTkFMX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpXG4gICAgfHwgIXVpbnQodmFsdWUuc2VlZCkgfHwgdmFsdWUuc2VlZCA+IDB4ZmZmZmZmZmZcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5lbnRyaWVzKSB8fCB2YWx1ZS5lbnRyaWVzLmxlbmd0aCA+IE1BWF9KT1VSTkFMX0VOVFJJRVNcbiAgICB8fCAnZ2VuZXJhdG9yVmVyc2lvbicgaW4gdmFsdWUgJiYgKHZhbHVlLmdlbmVyYXRvclZlcnNpb24gIT09IEdFTkVSQVRPUl9WMiB8fCB2YWx1ZS5zY2hlbWEgIT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgam91cm5hbCcpO1xuICB9XG4gIGNvbnN0IGpvdXJuYWw6IENvbW1hbmRKb3VybmFsID0ge1xuICAgIHNjaGVtYTogdmFsdWUuc2NoZW1hLCBzZWVkOiB2YWx1ZS5zZWVkLFxuICAgIC4uLignZ2VuZXJhdG9yVmVyc2lvbicgaW4gdmFsdWUgPyB7IGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WMiB9IDoge30pLFxuICAgIHN0YXJ0ZXJJbnZlbnRvcnk6IGludmVudG9yeSh2YWx1ZS5zdGFydGVySW52ZW50b3J5KSwgZW50cmllczogW10sXG4gIH07XG4gIGNvbnN0IGlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmVudHJpZXMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCByYXcgPSB2YWx1ZS5lbnRyaWVzW2ldO1xuICAgIGlmICghb2JqZWN0KHJhdykgfHwgcmF3LnNlcXVlbmNlICE9PSBpIHx8ICF1aW50KHJhdy5yZXZpc2lvbilcbiAgICAgIHx8IHR5cGVvZiByYXcuaGFzaCAhPT0gJ3N0cmluZycgfHwgIS9eWzAtOWEtZl17MTZ9JC8udGVzdChyYXcuaGFzaCkpIHRocm93IG5ldyBFcnJvcignbm9uLWNvbnRpZ3VvdXMgb3IgaW52YWxpZCBqb3VybmFsIGVudHJ5Jyk7XG4gICAgY29uc3QgZW50cnk6IEpvdXJuYWxFbnRyeSA9IHtcbiAgICAgIGNvbW1hbmQ6IHZhbGlkYXRlQ29tbWFuZChyYXcuY29tbWFuZCksIHNlcXVlbmNlOiBpLFxuICAgICAgcmV2aXNpb246IHJhdy5yZXZpc2lvbiwgaGFzaDogcmF3Lmhhc2gsIG91dGNvbWU6IHZhbGlkYXRlT3V0Y29tZShyYXcub3V0Y29tZSksXG4gICAgfTtcbiAgICBpZiAoKGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2J1aWxkJyB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0JylcbiAgICAgICYmIGVudHJ5LmNvbW1hbmQuc2NoZW1hICE9PSB2YWx1ZS5zY2hlbWEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignam91cm5hbCBzY2hlbWEgYW5kIGJ1aWxkIGNvbW1hbmQgc2NoZW1hIGRpZmZlcicpO1xuICAgIH1cbiAgICBpZiAoSlNPTi5zdHJpbmdpZnkoZW50cnkpICE9PSBKU09OLnN0cmluZ2lmeShyYXcpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgam91cm5hbCBlbnRyeScpO1xuICAgIGlmIChpZHMuaGFzKGVudHJ5LmNvbW1hbmQuaWQpKSB0aHJvdyBuZXcgRXJyb3IoJ2R1cGxpY2F0ZSBqb3VybmFsIGNvbW1hbmQgaWQnKTtcbiAgICBpZiAoZW50cnkuY29tbWFuZC50eXBlICE9PSBlbnRyeS5vdXRjb21lLnR5cGVcbiAgICAgIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnICYmIGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ2hhcnZlc3QnXG4gICAgICAmJiBlbnRyeS5jb21tYW5kLmVudGl0eUlkICE9PSBlbnRyeS5vdXRjb21lLmVudGl0eUlkXG4gICAgICB8fCAoZW50cnkuY29tbWFuZC50eXBlID09PSAncGxhbnQnIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcpXG4gICAgICAmJiBlbnRyeS5jb21tYW5kLnR5cGUgPT09IGVudHJ5Lm91dGNvbWUudHlwZSAmJiBlbnRyeS5jb21tYW5kLnBsb3RJZCAhPT0gZW50cnkub3V0Y29tZS5wbG90SWRcbiAgICAgIHx8IChlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdkZXBvc2l0JyB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICd3aXRoZHJhdycpXG4gICAgICAmJiBlbnRyeS5jb21tYW5kLnR5cGUgPT09IGVudHJ5Lm91dGNvbWUudHlwZVxuICAgICAgJiYgKGVudHJ5LmNvbW1hbmQuc3RvY2twaWxlSWQgIT09IGVudHJ5Lm91dGNvbWUuc3RvY2twaWxlSWRcbiAgICAgICAgfHwgSlNPTi5zdHJpbmdpZnkoZW50cnkuY29tbWFuZC5yZXNvdXJjZXMpICE9PSBKU09OLnN0cmluZ2lmeShlbnRyeS5vdXRjb21lLnJlc291cmNlcykpXG4gICAgICB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdwcm9kdWNlJyAmJiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICdwcm9kdWNlJ1xuICAgICAgJiYgKGVudHJ5LmNvbW1hbmQuc3RvY2twaWxlSWQgIT09IGVudHJ5Lm91dGNvbWUuc3RvY2twaWxlSWQgfHwgZW50cnkuY29tbWFuZC5yZWNpcGUgIT09IGVudHJ5Lm91dGNvbWUucmVjaXBlKVxuICAgICAgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAndGljaycgJiYgZW50cnkub3V0Y29tZS50eXBlID09PSAndGljaydcbiAgICAgICYmIGVudHJ5Lm91dGNvbWUudG9UaWNrIC0gZW50cnkub3V0Y29tZS5mcm9tVGljayAhPT0gZW50cnkuY29tbWFuZC50aWNrcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdqb3VybmFsIGNvbW1hbmQgYW5kIG91dGNvbWUgZGlzYWdyZWUnKTtcbiAgICB9XG4gICAgaWRzLmFkZChlbnRyeS5jb21tYW5kLmlkKTtcbiAgICBqb3VybmFsLmVudHJpZXMucHVzaChlbnRyeSk7XG4gIH1cbiAgaWYgKEpTT04uc3RyaW5naWZ5KGpvdXJuYWwpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBjb21tYW5kIGpvdXJuYWwnKTtcbiAgLy8gVGhpcyBzbGljZSBoYXMgb25lIGRldGVybWluaXN0aWMgZ2VuZXNpcyBjb25maWd1cmF0aW9uLiBBIGNoYW5nZWQgc3RhcnRlclxuICAvLyBncmFudCBtdXN0IG5vdCBwYXNzIHVubm90aWNlZCB3aGVuIHJlcGxheSBiZWdpbnMgZnJvbSBhIGxhdGVyIHNuYXBzaG90LlxuICBpZiAoSlNPTi5zdHJpbmdpZnkoam91cm5hbC5zdGFydGVySW52ZW50b3J5KSAhPT0gSlNPTi5zdHJpbmdpZnkoY3JlYXRlSm91cm5hbCh2YWx1ZS5zZWVkLCB2YWx1ZS5zY2hlbWEsIGpvdXJuYWxHZW5lcmF0b3Ioam91cm5hbCkpLnN0YXJ0ZXJJbnZlbnRvcnkpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdqb3VybmFsIHN0YXJ0ZXIgaW52ZW50b3J5IGlzIGluY29tcGF0aWJsZSB3aXRoIHRoaXMgdmVyc2lvbicpO1xuICB9XG4gIHJldHVybiBqb3VybmFsO1xufVxuXG5mdW5jdGlvbiByZWZlcmVuY2VzUmV0aXJlZFN0b25lKGVudHJ5OiBKb3VybmFsRW50cnkpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9eaGVybzpzdHlsX3JvY2tfKD86c21hbGx8bWVkaXVtfGxhcmdlKTovLnRlc3QoXG4gICAgZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcgPyBlbnRyeS5jb21tYW5kLmVudGl0eUlkIDogZW50cnkub3V0Y29tZS50eXBlID09PSAnaGFydmVzdCcgPyBlbnRyeS5vdXRjb21lLmVudGl0eUlkIDogJycsXG4gICk7XG59XG5cbmV4cG9ydCBjbGFzcyBHYW1lU2Vzc2lvbiB7XG4gIHJlYWRvbmx5IGpvdXJuYWw6IENvbW1hbmRKb3VybmFsO1xuICBwcml2YXRlIHJlYWRvbmx5IHByZXBBdXRob3JpemVyOiBMb2NhbEF1dGhvcml6ZXI7XG4gIHByaXZhdGUgcmVhZG9ubHkgc3RydWN0dXJlQXV0aG9yaXplcjogTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyO1xuICBwcml2YXRlIHJlYWRvbmx5IGlkcyA9IG5ldyBNYXA8c3RyaW5nLCBKb3VybmFsRW50cnk+KCk7XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcihyZWFkb25seSB3b3JsZDogV29ybGQsIGpvdXJuYWw6IENvbW1hbmRKb3VybmFsKSB7XG4gICAgdGhpcy5qb3VybmFsID0gam91cm5hbDtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGpvdXJuYWwuZW50cmllcykgdGhpcy5pZHMuc2V0KGVudHJ5LmNvbW1hbmQuaWQsIGVudHJ5KTtcbiAgICB0aGlzLnByZXBBdXRob3JpemVyID0gbmV3IExvY2FsQXV0aG9yaXplcih7IGVudmVsb3BlOiBNMDAyX0xBWU9VVC5lbnZlbG9wZSB9KTtcbiAgICB0aGlzLnN0cnVjdHVyZUF1dGhvcml6ZXIgPSBuZXcgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pO1xuICB9XG5cbiAgLyoqIEEgbmV3IGN1cnJlbnQtc2NoZW1hIHdvcmxkLiBgZ2VuZXJhdG9yVmVyc2lvbmAgZGVmYXVsdHMgdG8gdjEgZm9yIEFQSSBjb21wYXRpYmlsaXR5LiAqL1xuICBzdGF0aWMgZ2VuZXNpcyhzZWVkID0gMTMzNywgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogR2FtZVNlc3Npb24ge1xuICAgIHJldHVybiBuZXcgR2FtZVNlc3Npb24oXG4gICAgICBnZW5lc2lzV29ybGQoc2VlZCwgaW52ZW50b3J5KE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkpLCBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BLCBnZW5lcmF0b3JWZXJzaW9uKSxcbiAgICAgIGNyZWF0ZUpvdXJuYWwoc2VlZCwgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSwgZ2VuZXJhdG9yVmVyc2lvbiksXG4gICAgKTtcbiAgfVxuXG4gIC8qKiBDb21wYXRpYmlsaXR5IGVudHJ5IHBvaW50IGZvciByZWNvcmRlZCBNMDAyIGZpeHR1cmVzIGFuZCBzYXZlZCB3b3JsZHMuICovXG4gIHN0YXRpYyBsZWdhY3lHZW5lc2lzKHNlZWQgPSAxMzM3LCBzY2hlbWE6IHR5cGVvZiBKT1VSTkFMX1NDSEVNQSB8IHR5cGVvZiBERVNJR05fSk9VUk5BTF9TQ0hFTUEgPSBKT1VSTkFMX1NDSEVNQSk6IEdhbWVTZXNzaW9uIHtcbiAgICByZXR1cm4gbmV3IEdhbWVTZXNzaW9uKGdlbmVzaXNXb3JsZChzZWVkLCBpbnZlbnRvcnkoTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSksIHNjaGVtYSksIGNyZWF0ZUpvdXJuYWwoc2VlZCwgc2NoZW1hKSk7XG4gIH1cblxuICAvKiogUmVwbGF5IGFjY2VwdGVkIGNvbW1hbmRzIGluIHRoZWlyIGF1dGhvcml0YXRpdmUgb3JkZXIgZnJvbSBhbiBlbXB0eSB3b3JsZC5cbiAgICogQSBub3JtYWwgcmVwbGF5IGlzIGF0dGVtcHRlZCBmaXJzdDogc3RvbmUgZnJvbSByZXRhaW5lZCBjYWlybnMgYW5kIGJ1aWxkaW5nXG4gICAqIHByZXBhcmF0aW9uIG11c3Qgbm90IGZvcmNlIGhpc3RvcmljYWwgbW9kZS4gUmF3IG9sZCBqb3VybmFscyBlbnRlciBwcml2YXRlXG4gICAqIHJlY29uc3RydWN0aW9uIG9ubHkgd2hlbiB0aGVpciBvcmlnaW5hbCBzdG9uZSBvYnN0cnVjdGlvbnMgcmVxdWlyZWQgaXQuICovXG4gIHN0YXRpYyByZXBsYXkoaW5wdXQ6IHVua25vd24pOiBHYW1lU2Vzc2lvbiB7XG4gICAgY29uc3Qgam91cm5hbCA9IHZhbGlkYXRlSm91cm5hbChpbnB1dCk7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBHYW1lU2Vzc2lvbi5yZXBsYXlDdXJyZW50KGpvdXJuYWwpO1xuICAgIH0gY2F0Y2ggKGN1cnJlbnRFcnJvcikge1xuICAgICAgaWYgKCFqb3VybmFsLmVudHJpZXMuc29tZShjb250YWluc1JldGlyZWRTdG9uZSkpIHRocm93IGN1cnJlbnRFcnJvcjtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBHYW1lU2Vzc2lvbi5yZWNvbnN0cnVjdEhpc3RvcmljYWwoam91cm5hbCkuc2Vzc2lvbjtcbiAgICAgIH0gY2F0Y2ggKGhpc3RvcmljYWxFcnJvcikge1xuICAgICAgICAvLyBBbiBhbHJlYWR5LW1pZ3JhdGVkIGpvdXJuYWwgaGFzIHJld3JpdHRlbiBoYXNoZXM7IHZlcmlmeSBpdHMgcmV0YWluZWRcbiAgICAgICAgLy8gc3RvbmUgY29tbWFuZHMgbm9ybWFsbHkgaW5zdGVhZCBvZiBhY2NlcHRpbmcgdGhlIGZhaWxlZCBvbGQgcmVwbGF5LlxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBHYW1lU2Vzc2lvbi5yZXBsYXlDdXJyZW50KGpvdXJuYWwpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICB0aHJvdyBoaXN0b3JpY2FsRXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKiogUmVzdG9yZSBhIHZhbGlkYXRlZCBzbmFwc2hvdCwgdGhlbiByZXBsYXkgb25seSBpdHMgYWNjZXB0ZWQtY29tbWFuZCB0YWlsLiAqL1xuICBzdGF0aWMgcmVzdG9yZShzbmFwc2hvdElucHV0OiBXb3JsZFNuYXBzaG90LCBqb3VybmFsSW5wdXQ6IHVua25vd24pOiBHYW1lU2Vzc2lvbiB7XG4gICAgY29uc3Qgam91cm5hbCA9IHZhbGlkYXRlSm91cm5hbChqb3VybmFsSW5wdXQpO1xuICAgIGNvbnN0IHNuYXBzaG90ID0gdmFsaWRhdGVXb3JsZFNuYXBzaG90KHNuYXBzaG90SW5wdXQpO1xuICAgIGlmIChzbmFwc2hvdC5zY2hlbWEgIT09IGpvdXJuYWwuc2NoZW1hKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGFuZCBqb3VybmFsIHNjaGVtYXMgZGlmZmVyJyk7XG4gICAgY29uc3QgbmV4dCA9IHNuYXBzaG90Lm5leHRTZXF1ZW5jZTtcbiAgICBpZiAobmV4dCA+IGpvdXJuYWwuZW50cmllcy5sZW5ndGgpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaXMgYWhlYWQgb2YgdGhlIGpvdXJuYWwnKTtcbiAgICAvLyBDdXJyZW50IHNhdmVzIChpbmNsdWRpbmcgZXZlcnkgbWlncmF0ZWQgYm91bmRhcnkpIGtlZXAgdGhlaXIgZXhhY3QgaGFzaC5cbiAgICAvLyBUcnkgdGhlbSBiZWZvcmUgcmVjb25zdHJ1Y3RpbmcgYSBjb21wYXRpYmxlIG9sZCBqb3VybmFsLiBEZXBvc2l0LW9ubHlcbiAgICAvLyBtaWdyYXRlZCBzYXZlcyBubyBsb25nZXIgY2FycnkgYW4gZXhwbGljaXQgc3RvbmUgY29tbWFuZCB0byBjbGFzc2lmeSB0aGVtLlxuICAgIGlmICghc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgdHJ5IHsgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTsgfSBjYXRjaCB7IC8qIGF1dGhlbnRpY2F0ZWQgbWlncmF0aW9uIGJlbG93ICovIH1cbiAgICB9XG4gICAgaWYgKG5leHQgPiAwIHx8IHNuYXBzaG90LmVudGl0aWVzLnNvbWUoKGVudGl0eSkgPT4gaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSkpIHtcbiAgICAgIC8vIEEgYm91bmRhcnkgYXV0aGVudGljYXRlZCBkdXJpbmcgbWlncmF0aW9uIGlzIGNvbXBhcmVkIHdpdGggdGhlIG1pZ3JhdGVkXG4gICAgICAvLyBzdGF0ZTsgYSByYXcgb2xkIGJvdW5kYXJ5IGlzIGNvbXBhcmVkIHdpdGggdGhlIG9yaWdpbmFsIGhpc3RvcmljYWwgb25lLlxuICAgICAgLy8gQm90aCBwYXRocyBhdXRoZW50aWNhdGUgdGhlIGNvbXBsZXRlIG9yaWdpbmFsIGFjY2VwdGVkIGpvdXJuYWwgZmlyc3QuXG4gICAgICBjb25zdCBoaXN0b3JpY2FsID0gam91cm5hbC5lbnRyaWVzLnNvbWUocmVmZXJlbmNlc1JldGlyZWRTdG9uZSlcbiAgICAgICAgfHwgc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKTtcbiAgICAgIC8vIEEgbWlncmF0ZWQgc2F2ZSBubyBsb25nZXIgY29udGFpbnMgcmV0aXJlZCBlbnRpdGllcy4gSXRzIHJld3JpdHRlblxuICAgICAgLy8gYm91bmRhcnkgaGFzaGVzIGRlc2NyaWJlIHRoZSBmaWx0ZXJlZCBzdGF0ZSwgc28gb3JkaW5hcnkgcmVzdG9yYXRpb25cbiAgICAgIC8vIG11c3Qgc3VjY2VlZCBiZWZvcmUgdHJ5aW5nIHRvIGludGVycHJldCBpdCBhcyByYXcgb2xkLXNhdmUgYnl0ZXMuXG4gICAgICAvLyBBIHJlZmVyZW5jZWQgYXV0aG9yZWQgc3RvbmUgYWxvbmUgZG9lcyAqbm90KiBpbXBseSBhIHJhdyBvbGQgYm91bmRhcnk6XG4gICAgICAvLyBsZWdpdGltYXRlIHNhdmVzIGNhbiBjb250YWluIHVudG91Y2hlZCBuYXR1cmFsIHJldGlyZWQgZGVwb3NpdHMgb25seS5cbiAgICAgIGlmICghc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgICB0cnkgeyByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpOyB9IGNhdGNoIHsgLyogdHJ5IG9yaWdpbmFsIHJlY29uc3RydWN0aW9uICovIH1cbiAgICAgIH1cbiAgICAgIGlmIChoaXN0b3JpY2FsKSB7XG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWQgPSBHYW1lU2Vzc2lvbi5yZWNvbnN0cnVjdEhpc3RvcmljYWwoam91cm5hbCk7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkID0gcmVjb25zdHJ1Y3RlZC5zbmFwc2hvdHMuZ2V0KG5leHQpO1xuICAgICAgICBjb25zdCBtaWdyYXRlZCA9IGV4cGVjdGVkID8gbWlncmF0ZVN0b25lU25hcHNob3QoZXhwZWN0ZWQpIDogdW5kZWZpbmVkO1xuICAgICAgICBpZiAobWlncmF0ZWQgJiYgbGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90KSA9PT0gbGVnYWN5U3RvbmVIYXNoKG1pZ3JhdGVkKSlcbiAgICAgICAgICByZXR1cm4gcmVjb25zdHJ1Y3RlZC5zZXNzaW9uO1xuICAgICAgICBpZiAoc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKVxuICAgICAgICAgICYmIGV4cGVjdGVkICYmIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgPT09IGxlZ2FjeVN0b25lSGFzaChleHBlY3RlZCkpXG4gICAgICAgICAgcmV0dXJuIHJlY29uc3RydWN0ZWQuc2Vzc2lvbjtcbiAgICAgICAgaWYgKHNuYXBzaG90LmVudGl0aWVzLnNvbWUoKGVudGl0eSkgPT4gaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2hpc3RvcmljYWwgc25hcHNob3QgZG9lcyBub3QgbWF0Y2ggaXRzIG9yaWdpbmFsIGpvdXJuYWwgYm91bmRhcnknKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAobmV4dCA+IDApIHJldHVybiBHYW1lU2Vzc2lvbi5yZXN0b3JlQ3VycmVudChzbmFwc2hvdCwgam91cm5hbCwgbmV4dCk7XG4gICAgY29uc3QgaGlzdG9yaWNhbCA9IGpvdXJuYWwuZW50cmllcy5zb21lKGNvbnRhaW5zUmV0aXJlZFN0b25lKTtcbiAgICBpZiAoaGlzdG9yaWNhbCkge1xuICAgICAgdHJ5IHsgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTsgfSBjYXRjaCB7IC8qIHJhdyBvciBtaWdyYXRlZCBnZW5lc2lzICovIH1cbiAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWQgPSBHYW1lU2Vzc2lvbi5yZWNvbnN0cnVjdEhpc3RvcmljYWwoam91cm5hbCk7XG4gICAgICBjb25zdCByYXdHZW5lc2lzID0gcmVjb25zdHJ1Y3RlZC5zbmFwc2hvdHMuZ2V0KDApITtcbiAgICAgIGlmIChsZWdhY3lTdG9uZUhhc2goc25hcHNob3QpID09PSBsZWdhY3lTdG9uZUhhc2gocmF3R2VuZXNpcykpIHJldHVybiByZWNvbnN0cnVjdGVkLnNlc3Npb247XG4gICAgfVxuICAgIHJldHVybiBHYW1lU2Vzc2lvbi5yZXN0b3JlQ3VycmVudChzbmFwc2hvdCwgam91cm5hbCwgbmV4dCk7XG4gIH1cblxuICAvKiogUmVwbGF5IGFscmVhZHktYXV0aGVudGljYXRlZCBjdXJyZW50LXN0YXRlIGNvbW1hbmRzLiAqL1xuICBwcml2YXRlIHN0YXRpYyByZXBsYXlDdXJyZW50KGpvdXJuYWw6IENvbW1hbmRKb3VybmFsKTogR2FtZVNlc3Npb24ge1xuICAgIGNvbnN0IHNlc3Npb24gPSBuZXcgR2FtZVNlc3Npb24oXG4gICAgICBnZW5lc2lzV29ybGQoam91cm5hbC5zZWVkLCBqb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnksIGpvdXJuYWwuc2NoZW1hLCBqb3VybmFsR2VuZXJhdG9yKGpvdXJuYWwpKSxcbiAgICAgIGNyZWF0ZUpvdXJuYWwoam91cm5hbC5zZWVkLCBqb3VybmFsLnNjaGVtYSwgam91cm5hbEdlbmVyYXRvcihqb3VybmFsKSksXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGpvdXJuYWwuZW50cmllcykgc2Vzc2lvbi5yZXBsYXlFbnRyeShlbnRyeSk7XG4gICAgcmV0dXJuIHNlc3Npb247XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyByZXN0b3JlQ3VycmVudChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCwgam91cm5hbDogQ29tbWFuZEpvdXJuYWwsIG5leHQ6IG51bWJlcik6IEdhbWVTZXNzaW9uIHtcbiAgICBjb25zdCB3b3JsZCA9IHdvcmxkRnJvbVNuYXBzaG90KHNuYXBzaG90KTtcbiAgICBpZiAod29ybGQuc2VlZCAhPT0gam91cm5hbC5zZWVkKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGFuZCBqb3VybmFsIHNlZWRzIGRpZmZlcicpO1xuICAgIGlmICh3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiAhPT0gam91cm5hbEdlbmVyYXRvcihqb3VybmFsKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBhbmQgam91cm5hbCB0ZXJyYWluIGdlbmVyYXRvcnMgZGlmZmVyJyk7XG4gICAgfVxuICAgIGNvbnN0IGdlbmVzaXMgPSBnZW5lc2lzV29ybGQoam91cm5hbC5zZWVkLCBqb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnksIGpvdXJuYWwuc2NoZW1hLCBqb3VybmFsR2VuZXJhdG9yKGpvdXJuYWwpKTtcbiAgICBpZiAobmV4dCA9PT0gMCAmJiBsZWdhY3lTdG9uZUhhc2goc25hcHNob3QpICE9PSBjYW5vbmljYWxXb3JsZEhhc2goZ2VuZXNpcywgMCwgam91cm5hbC5zY2hlbWEpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dlbmVzaXMgc25hcHNob3QgZG9lcyBub3QgbWF0Y2ggam91cm5hbCBjb25maWd1cmF0aW9uJyk7XG4gICAgfVxuICAgIGlmIChuZXh0ID4gMCAmJiBsZWdhY3lTdG9uZUhhc2goc25hcHNob3QpICE9PSBqb3VybmFsLmVudHJpZXNbbmV4dCAtIDFdLmhhc2gpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzaCBkb2VzIG5vdCBtYXRjaCBpdHMgam91cm5hbCBib3VuZGFyeScpO1xuICAgIH1cbiAgICBjb25zdCBzZXNzaW9uID0gR2FtZVNlc3Npb24uZnJvbVZhbGlkYXRlZEJvdW5kYXJ5KHdvcmxkLCB7XG4gICAgICBzY2hlbWE6IGpvdXJuYWwuc2NoZW1hLCBzZWVkOiBqb3VybmFsLnNlZWQsXG4gICAgICAuLi4oam91cm5hbC5nZW5lcmF0b3JWZXJzaW9uID8geyBnZW5lcmF0b3JWZXJzaW9uOiBqb3VybmFsLmdlbmVyYXRvclZlcnNpb24gfSA6IHt9KSxcbiAgICAgIHN0YXJ0ZXJJbnZlbnRvcnk6IHsgLi4uam91cm5hbC5zdGFydGVySW52ZW50b3J5IH0sIGVudHJpZXM6IGpvdXJuYWwuZW50cmllcy5zbGljZSgwLCBuZXh0KSxcbiAgICB9KTtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGpvdXJuYWwuZW50cmllcy5zbGljZShuZXh0KSkgc2Vzc2lvbi5yZXBsYXlFbnRyeShlbnRyeSk7XG4gICAgcmV0dXJuIHNlc3Npb247XG4gIH1cblxuICAvKiogQGludGVybmFsIEFzc2VtYmxlIGFuIGF1dGhlbnRpY2F0ZWQgc2F2ZSBib3VuZGFyeTsgZ2FtZXBsYXkgdXNlcyBkaXNwYXRjaC4gKi9cbiAgcHJpdmF0ZSBzdGF0aWMgZnJvbVZhbGlkYXRlZEJvdW5kYXJ5KHdvcmxkOiBXb3JsZCwgam91cm5hbDogQ29tbWFuZEpvdXJuYWwpOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0dXJuIG5ldyBHYW1lU2Vzc2lvbih3b3JsZCwgam91cm5hbCk7XG4gIH1cblxuICAvKiogQGludGVybmFsIFNvdXJjZSBmb3IgZGV0ZXJtaW5pc3RpYyBvbGQtc2F2ZSBmaXh0dXJlczsgbm90IGEgbGl2ZSBzZXNzaW9uLiAqL1xuICBzdGF0aWMgaGlzdG9yaWNhbEpvdXJuYWwod29ybGQ6IFdvcmxkKTogR2FtZVNlc3Npb24ge1xuICAgIHJldHVybiBuZXcgR2FtZVNlc3Npb24od29ybGQsIGNyZWF0ZUpvdXJuYWwod29ybGQuc2VlZCwgd29ybGQubGlmZSA/IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUFcbiAgICAgIDogd29ybGQuc3RydWN0dXJlcy5zaXplID4gMCA/IERFU0lHTl9KT1VSTkFMX1NDSEVNQSA6IEpPVVJOQUxfU0NIRU1BKSk7XG4gIH1cblxuICAvKiogQGludGVybmFsIFNvdXJjZSBmb3IgZGV0ZXJtaW5pc3RpYyBvbGQtc2F2ZSBmaXh0dXJlczsgbm90IGEgbGl2ZSBzZXNzaW9uLiAqL1xuICBzdGF0aWMgaGlzdG9yaWNhbEdlbmVzaXNXb3JsZChzZWVkID0gMTMzNywgc2NoZW1hOiBDb21tYW5kSm91cm5hbFsnc2NoZW1hJ10gPSBKT1VSTkFMX1NDSEVNQSk6IFdvcmxkIHtcbiAgICByZXR1cm4gaGlzdG9yaWNhbEdlbmVzaXNXb3JsZChzZWVkLCBpbnZlbnRvcnkoTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSksIHNjaGVtYSk7XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyByZWNvbnN0cnVjdEhpc3RvcmljYWwoam91cm5hbDogQ29tbWFuZEpvdXJuYWwpOiB7XG4gICAgc2Vzc2lvbjogR2FtZVNlc3Npb247IHNuYXBzaG90czogTWFwPG51bWJlciwgV29ybGRTbmFwc2hvdD47XG4gIH0ge1xuICAgIGNvbnN0IGV4cGVjdGVkR2VuZXNpcyA9IGhpc3RvcmljYWxHZW5lc2lzV29ybGQoam91cm5hbC5zZWVkLCBqb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnksIGpvdXJuYWwuc2NoZW1hKTtcbiAgICBjb25zdCBzbmFwc2hvdHMgPSBuZXcgTWFwPG51bWJlciwgV29ybGRTbmFwc2hvdD4oKTtcbiAgICBzbmFwc2hvdHMuc2V0KDAsIGNyZWF0ZVdvcmxkU25hcHNob3QoZXhwZWN0ZWRHZW5lc2lzLCAwLCBqb3VybmFsLnNjaGVtYSkpO1xuICAgIGNvbnN0IHJlcGxheSA9IG5ldyBHYW1lU2Vzc2lvbihleHBlY3RlZEdlbmVzaXMsIGNyZWF0ZUpvdXJuYWwoam91cm5hbC5zZWVkLCBqb3VybmFsLnNjaGVtYSkpO1xuICAgIGNvbnN0IG1pZ3JhdGVkSm91cm5hbCA9IGNyZWF0ZUpvdXJuYWwoam91cm5hbC5zZWVkLCBqb3VybmFsLnNjaGVtYSk7XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBqb3VybmFsLmVudHJpZXMpIHtcbiAgICAgIHJlcGxheS5yZXBsYXlFbnRyeShlbnRyeSk7XG4gICAgICBjb25zdCBzbmFwc2hvdCA9IGNyZWF0ZVdvcmxkU25hcHNob3QocmVwbGF5LndvcmxkLCByZXBsYXkubmV4dFNlcXVlbmNlLCBqb3VybmFsLnNjaGVtYSk7XG4gICAgICBzbmFwc2hvdHMuc2V0KHJlcGxheS5uZXh0U2VxdWVuY2UsIHNuYXBzaG90KTtcbiAgICAgIC8vIEtlZXAgdGhlIHJld3JpdHRlbiBhdXRoZW50aWNhdGVkIGJvdW5kYXJ5IGluIHRoZSByZXR1cm5lZCBqb3VybmFsLiBBXG4gICAgICAvLyByZXBsYXktb25seSBqb3VybmFsIHJlYnVpbGQgd291bGQgc2lsZW50bHkgcHV0IHRoZSByYXcgaGFzaCBiYWNrLlxuICAgICAgZW50cnkuaGFzaCA9IGxlZ2FjeVN0b25lSGFzaChtaWdyYXRlU3RvbmVTbmFwc2hvdChzbmFwc2hvdCkpO1xuICAgICAgbWlncmF0ZWRKb3VybmFsLmVudHJpZXMucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5mcm9tVmFsaWRhdGVkQm91bmRhcnkocmVwbGF5LndvcmxkLCBtaWdyYXRlZEpvdXJuYWwpO1xuICAgIHJldHVybiB7IHNlc3Npb246IHNlc3Npb24ubWlncmF0ZVJldGlyZWRTdG9uZXMoKSwgc25hcHNob3RzIH07XG4gIH1cblxuICBwcml2YXRlIHNuYXBzaG90U2NoZW1hKCk6IFdvcmxkU25hcHNob3RbJ3NjaGVtYSddIHsgcmV0dXJuIHRoaXMuam91cm5hbC5zY2hlbWE7IH1cblxuICBnZXQgbmV4dFNlcXVlbmNlKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmpvdXJuYWwuZW50cmllcy5sZW5ndGg7IH1cbiAgZ2V0IHNuYXBzaG90KCk6IFdvcmxkU25hcHNob3Qge1xuICAgIHJldHVybiBjcmVhdGVXb3JsZFNuYXBzaG90KHRoaXMud29ybGQsIHRoaXMubmV4dFNlcXVlbmNlLCB0aGlzLnNuYXBzaG90U2NoZW1hKCkpO1xuICB9XG4gIGdldCBzdGF0ZUhhc2goKTogc3RyaW5nIHtcbiAgICByZXR1cm4gY2Fub25pY2FsV29ybGRIYXNoKHRoaXMud29ybGQsIHRoaXMubmV4dFNlcXVlbmNlLCB0aGlzLnNuYXBzaG90U2NoZW1hKCkpO1xuICB9XG5cbiAgY29tbWFuZElkKGtpbmQ6IENvbW1hbmRbJ3R5cGUnXSwgdGFyZ2V0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIC8vIEVudGl0eSBJRHMgY29udGFpbiBjaHVuayBjb29yZGluYXRlczsgZW5jb2RlIGNvbW1hcyBhbmQgb3RoZXIgc2VwYXJhdG9yc1xuICAgIC8vIHNvIGdlbmVyYXRlZCBjb21tYW5kcyBzYXRpc2Z5IHRoZSBzYW1lIGVudmVsb3BlIHZhbGlkYXRpb24gYXMgaW5wdXQuXG4gICAgcmV0dXJuIGAke2tpbmR9OiR7dGhpcy5uZXh0U2VxdWVuY2V9OiR7ZW5jb2RlVVJJQ29tcG9uZW50KHRhcmdldCl9YDtcbiAgfVxuXG4gIGVudHJ5KHNlcXVlbmNlOiBudW1iZXIpOiBKb3VybmFsRW50cnkgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5qb3VybmFsLmVudHJpZXNbc2VxdWVuY2VdOyB9XG5cbiAgZGlzcGF0Y2goaW5wdXQ6IHVua25vd24pOiBDb21tYW5kUmVjZWlwdCB8IENvbW1hbmRSZWplY3Rpb24ge1xuICAgIGxldCBjb21tYW5kOiBDb21tYW5kO1xuICAgIHRyeSB7IGNvbW1hbmQgPSB2YWxpZGF0ZUNvbW1hbmQoaW5wdXQpOyB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KG9iamVjdChpbnB1dCkgJiYgdHlwZW9mIGlucHV0LmlkID09PSAnc3RyaW5nJyA/IGlucHV0LmlkIDogJycsXG4gICAgICAgICdpbnZhbGlkX2NvbW1hbmQnLCBbKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlXSk7XG4gICAgfVxuICAgIGlmICgoY29tbWFuZC50eXBlID09PSAnYnVpbGQnIHx8IGNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnKVxuICAgICAgJiYgY29tbWFuZC5zY2hlbWEgIT09IHRoaXMuam91cm5hbC5zY2hlbWFcbiAgICAgIHx8IGNvbW1hbmQudHlwZSAhPT0gJ2J1aWxkJyAmJiBjb21tYW5kLnR5cGUgIT09ICdoYXJ2ZXN0J1xuICAgICAgICAmJiB0aGlzLmpvdXJuYWwuc2NoZW1hICE9PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgJ3NjaGVtYV9taXNtYXRjaCcsIFsnY29tbWFuZCBzY2hlbWEgZG9lcyBub3QgbWF0Y2ggdGhpcyB3b3JsZCBqb3VybmFsJ10pO1xuICAgIH1cbiAgICBjb25zdCBwcmlvciA9IHRoaXMuaWRzLmdldChjb21tYW5kLmlkKTtcbiAgICBpZiAocHJpb3IpIHtcbiAgICAgIGlmICghc2FtZUZpZWxkcyhwcmlvci5jb21tYW5kLCBjb21tYW5kKSkge1xuICAgICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgJ2R1cGxpY2F0ZV9jb21tYW5kX2lkJywgWydjb21tYW5kIGlkIGFscmVhZHkgaGFzIGRpZmZlcmVudCBhY2NlcHRlZCBpbnB1dCddKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLnJlY2VpcHQocHJpb3IsIHRydWUpO1xuICAgIH1cbiAgICBpZiAoY29tbWFuZC5leHBlY3RlZFJldmlzaW9uICE9PSB0aGlzLndvcmxkLnJldmlzaW9uKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgJ3N0YWxlX3JldmlzaW9uJywgW1xuICAgICAgICBgY29tbWFuZCBleHBlY3RzIHJldmlzaW9uICR7Y29tbWFuZC5leHBlY3RlZFJldmlzaW9ufTsgd29ybGQgaXMgYXQgJHt0aGlzLndvcmxkLnJldmlzaW9ufWAsXG4gICAgICBdKTtcbiAgICB9XG4gICAgY29uc3QgYmVmb3JlID0gdGhpcy5zdGF0ZUhhc2g7XG4gICAgbGV0IG91dGNvbWU6IENvbW1hbmRPdXRjb21lO1xuICAgIGlmIChjb21tYW5kLnR5cGUgPT09ICdidWlsZCcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGJ1aWxkUHJvamVjdCh0aGlzLndvcmxkLCB0aGlzLnByZXBBdXRob3JpemVyLCB0aGlzLnN0cnVjdHVyZUF1dGhvcml6ZXIsXG4gICAgICAgIHByb2plY3RCeUlkKGNvbW1hbmQucHJvamVjdElkKSxcbiAgICAgICAgJ2Rlc2lnblZlcnNpb24nIGluIGNvbW1hbmQgPyBjb21tYW5kLmRlc2lnblZlcnNpb24gOiB1bmRlZmluZWQpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVIYXNoICE9PSBiZWZvcmUpIHRocm93IG5ldyBFcnJvcigncmVqZWN0ZWQgYnVpbGQgY2hhbmdlZCBhdXRob3JpdGF0aXZlIHN0YXRlJyk7XG4gICAgICAgIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgfVxuICAgICAgb3V0Y29tZSA9IHtcbiAgICAgICAgdHlwZTogJ2J1aWxkJywgc3RydWN0dXJlSWQ6IHJlc3VsdC5yZWNvcmQuaWQsXG4gICAgICAgIGNvc3RQYWlkOiBpbnZlbnRvcnkocmVzdWx0LnN0cnVjdHVyZS5jb3N0UGFpZCksXG4gICAgICAgIHJlc291cmNlc0dhaW5lZDogaW52ZW50b3J5KHJlc3VsdC5wcmVwYXJhdGlvbi5yZXNvdXJjZXNHYWluZWQpLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBoYXJ2ZXN0RW50aXR5KHRoaXMud29ybGQsIGNvbW1hbmQuZW50aXR5SWQpO1xuICAgICAgaWYgKCFyZXN1bHQpIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCAnbm90X2hhcnZlc3RhYmxlJywgWydlbnRpdHkgaXMgYWJzZW50LCBkZXBsZXRlZCBvciBoYXMgbm8gcmVzb3VyY2UnXSk7XG4gICAgICBvdXRjb21lID0ge1xuICAgICAgICB0eXBlOiAnaGFydmVzdCcsIGVudGl0eUlkOiByZXN1bHQuZW50aXR5LmlkLFxuICAgICAgICByZXNvdXJjZTogcmVzdWx0LnJlc291cmNlLCBhbW91bnQ6IHJlc3VsdC5hbW91bnQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAnZGVwb3NpdCcgfHwgY29tbWFuZC50eXBlID09PSAnd2l0aGRyYXcnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSB0cmFuc2Zlcih0aGlzLndvcmxkLCBjb21tYW5kLnR5cGUsIGNvbW1hbmQucmVzb3VyY2VzKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlSGFzaCAhPT0gYmVmb3JlKSB0aHJvdyBuZXcgRXJyb3IoJ3JlamVjdGVkIHRyYW5zZmVyIGNoYW5nZWQgYXV0aG9yaXRhdGl2ZSBzdGF0ZScpO1xuICAgICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIH1cbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6IGNvbW1hbmQudHlwZSwgc3RvY2twaWxlSWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCByZXNvdXJjZXM6IHJlc3VsdC52YWx1ZSB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAncHJvZHVjZScpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHN0YXJ0UHJvZHVjdGlvbih0aGlzLndvcmxkLCBjb21tYW5kLnJlY2lwZSwgY29tbWFuZC5pZCk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICBvdXRjb21lID0geyB0eXBlOiAncHJvZHVjZScsIGpvYklkOiByZXN1bHQudmFsdWUuaWQsIHN0b2NrcGlsZUlkOiByZXN1bHQudmFsdWUuc3RvY2twaWxlSWQsXG4gICAgICAgIHJlY2lwZTogcmVzdWx0LnZhbHVlLnJlY2lwZSwgcmVtYWluaW5nVGlja3M6IHJlc3VsdC52YWx1ZS5yZW1haW5pbmdUaWNrcyB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAndGljaycpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGFkdmFuY2VUaWNrcyh0aGlzLndvcmxkLCBjb21tYW5kLnRpY2tzKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6ICd0aWNrJywgLi4ucmVzdWx0LnZhbHVlIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdwbGFudCcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHBsYW50Q3JvcCh0aGlzLndvcmxkLCBjb21tYW5kLnBsb3RJZCk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICBvdXRjb21lID0geyB0eXBlOiAncGxhbnQnLCBwbG90SWQ6IGNvbW1hbmQucGxvdElkLFxuICAgICAgICBwbGFudGVkVGljazogcmVzdWx0LnZhbHVlLnBsYW50ZWRUaWNrLCBncm93dGhUaWNrczogcmVzdWx0LnZhbHVlLmdyb3d0aFRpY2tzIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBoYXJ2ZXN0Q3JvcCh0aGlzLndvcmxkLCBjb21tYW5kLnBsb3RJZCk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICBvdXRjb21lID0geyB0eXBlOiAnaGFydmVzdF9jcm9wJywgcGxvdElkOiBjb21tYW5kLnBsb3RJZCwgcmVzb3VyY2VzOiByZXN1bHQudmFsdWUgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCd1bmhhbmRsZWQgY29tbWFuZCB0eXBlJyk7XG4gICAgfVxuICAgIGNvbnN0IGVudHJ5OiBKb3VybmFsRW50cnkgPSB7XG4gICAgICBjb21tYW5kLCBzZXF1ZW5jZTogdGhpcy5uZXh0U2VxdWVuY2UsIHJldmlzaW9uOiB0aGlzLndvcmxkLnJldmlzaW9uLFxuICAgICAgLy8gVGhlIHNlcXVlbmNlIGlzIHBhcnQgb2YgdGhlIHN0YXRlIGhhc2ggYXQgdGhpcyBhY2NlcHRlZCBib3VuZGFyeS5cbiAgICAgIGhhc2g6IGNhbm9uaWNhbFdvcmxkSGFzaCh0aGlzLndvcmxkLCB0aGlzLm5leHRTZXF1ZW5jZSArIDEsIHRoaXMuc25hcHNob3RTY2hlbWEoKSksIG91dGNvbWUsXG4gICAgfTtcbiAgICB0aGlzLmpvdXJuYWwuZW50cmllcy5wdXNoKGVudHJ5KTtcbiAgICB0aGlzLmlkcy5zZXQoY29tbWFuZC5pZCwgZW50cnkpO1xuICAgIHJldHVybiB0aGlzLnJlY2VpcHQoZW50cnksIGZhbHNlKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVwbGF5RW50cnkoZW50cnk6IEpvdXJuYWxFbnRyeSk6IHZvaWQge1xuICAgIGlmIChlbnRyeS5zZXF1ZW5jZSAhPT0gdGhpcy5uZXh0U2VxdWVuY2UpIHRocm93IG5ldyBFcnJvcignam91cm5hbCBzZXF1ZW5jZSBnYXAnKTtcbiAgICBjb25zdCByZWNlaXB0ID0gdGhpcy5kaXNwYXRjaChlbnRyeS5jb21tYW5kKTtcbiAgICBpZiAoIXJlY2VpcHQub2sgfHwgcmVjZWlwdC5kdXBsaWNhdGUgfHwgcmVjZWlwdC5oYXNoICE9PSBlbnRyeS5oYXNoXG4gICAgICB8fCByZWNlaXB0LnJldmlzaW9uICE9PSBlbnRyeS5yZXZpc2lvblxuICAgICAgfHwgSlNPTi5zdHJpbmdpZnkocmVjZWlwdC5vdXRjb21lKSAhPT0gSlNPTi5zdHJpbmdpZnkoZW50cnkub3V0Y29tZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgam91cm5hbCByZXBsYXkgZGl2ZXJnZWQgYXQgc2VxdWVuY2UgJHtlbnRyeS5zZXF1ZW5jZX1gKTtcbiAgICB9XG4gIH1cblxuICAvKiogSGlzdG9yaWNhbCBlbnRyaWVzIGhhdmUgcGFzc2VkIHRoZWlyIG9yaWdpbmFsIG91dGNvbWUvaGFzaCBjaGVja3MuIFRoZWlyXG4gICAqIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBzdG9uZSB5aWVsZHMgcmVtYWluOyBvbmx5IGVudGl0eSBleGlzdGVuY2UgYW5kIHRoZVxuICAgKiByZXN1bHRpbmcgY2Fub25pY2FsIGJvdW5kYXJ5IGhhc2hlcyBjaGFuZ2UuICovXG4gIHByaXZhdGUgbWlncmF0ZVJldGlyZWRTdG9uZXMoKTogR2FtZVNlc3Npb24ge1xuICAgIHJldGlyZVN0b25lRW50aXRpZXModGhpcy53b3JsZCk7XG4gICAgZmluaXNoU3RvbmVSZXBsYXkodGhpcy53b3JsZCk7XG4gICAgY29uc3QgbWlncmF0ZWQgPSBjcmVhdGVXb3JsZFNuYXBzaG90KHRoaXMud29ybGQsIHRoaXMubmV4dFNlcXVlbmNlLCB0aGlzLnNuYXBzaG90U2NoZW1hKCkpO1xuICAgIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3QodGhpcy53b3JsZCwgbWlncmF0ZWQpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgcHJpdmF0ZSByZWNlaXB0KGVudHJ5OiBKb3VybmFsRW50cnksIGR1cGxpY2F0ZTogYm9vbGVhbik6IENvbW1hbmRSZWNlaXB0IHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IHRydWUsIGR1cGxpY2F0ZSwgaWQ6IGVudHJ5LmNvbW1hbmQuaWQsIHNlcXVlbmNlOiBlbnRyeS5zZXF1ZW5jZSxcbiAgICAgIHJldmlzaW9uOiBlbnRyeS5yZXZpc2lvbiwgaGFzaDogZW50cnkuaGFzaCwgb3V0Y29tZTogZW50cnkub3V0Y29tZSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSByZWplY3QoaWQ6IHN0cmluZywgY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IENvbW1hbmRSZWplY3Rpb24ge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZHVwbGljYXRlOiBmYWxzZSwgaWQsIGNvZGUsIHJlYXNvbnMgfTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXNpc1dvcmxkKHNlZWQ6IG51bWJlciwgc3RhcnRlciA9IGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSxcbiAgc2NoZW1hOiBDb21tYW5kSm91cm5hbFsnc2NoZW1hJ10gPSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BLCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gZ2VuZXJhdGVXb3JsZChzZWVkLCAwLCBnZW5lcmF0b3JWZXJzaW9uKTtcbiAgd29ybGQuaW52ZW50b3J5ID0geyAuLi5zdGFydGVyIH07XG4gIGlmIChzY2hlbWEgPT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpIHdvcmxkLmxpZmUgPSBjcmVhdGVMaWZlU3RhdGUoKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuXG5mdW5jdGlvbiBoaXN0b3JpY2FsR2VuZXNpc1dvcmxkKHNlZWQ6IG51bWJlciwgc3RhcnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPixcbiAgc2NoZW1hOiBDb21tYW5kSm91cm5hbFsnc2NoZW1hJ10pOiBXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCk7XG4gIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkKTtcbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgd29ybGQuaW52ZW50b3J5ID0geyAuLi5zdGFydGVyIH07XG4gIGlmIChzY2hlbWEgPT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpIHdvcmxkLmxpZmUgPSBjcmVhdGVMaWZlU3RhdGUoKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuXG5mdW5jdGlvbiBjb250YWluc1JldGlyZWRTdG9uZShlbnRyeTogSm91cm5hbEVudHJ5KTogYm9vbGVhbiB7XG4gIGlmIChlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0Jykge1xuICAgIHJldHVybiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICdoYXJ2ZXN0J1xuICAgICAgJiYgKGVudHJ5Lm91dGNvbWUucmVzb3VyY2UgPT09ICdzdG9uZSdcbiAgICAgICAgfHwgL15oZXJvOnN0eWxfcm9ja18oPzpzbWFsbHxtZWRpdW18bGFyZ2UpOi8udGVzdChlbnRyeS5jb21tYW5kLmVudGl0eUlkKSk7XG4gIH1cbiAgcmV0dXJuIGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ2J1aWxkJyAmJiAoZW50cnkub3V0Y29tZS5yZXNvdXJjZXNHYWluZWQuc3RvbmUgPz8gMCkgPiAwO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFBLE9BQU8sVUFBVTtBQUNqQixPQUFPLFlBQVk7QUFDbkIsWUFBWUEsWUFBVzs7O0FDTXZCLElBQU0sU0FBUyxvQkFBSSxRQUE2QjtBQUV6QyxTQUFTLGlCQUFpQixPQUE0QjtBQUMzRCxNQUFJLFFBQVEsT0FBTyxJQUFJLEtBQUs7QUFDNUIsTUFBSSxDQUFDLE9BQU87QUFBRSxZQUFRLEVBQUUsUUFBUSxPQUFPLGdCQUFnQixPQUFPLFVBQVUsTUFBTTtBQUFHLFdBQU8sSUFBSSxPQUFPLEtBQUs7QUFBQSxFQUFHO0FBQzNHLFNBQU87QUFDVDtBQUVPLFNBQVMsa0JBQWtCLE9BQXFCO0FBQ3JELFFBQU0sUUFBUSxpQkFBaUIsS0FBSztBQUNwQyxRQUFNLFNBQVM7QUFDZixRQUFNLGlCQUFpQjtBQUN2QixRQUFNLFdBQVc7QUFDbkI7QUFFTyxTQUFTLGNBQWMsT0FBd0I7QUFDcEQsU0FBTyxPQUFPLElBQUksS0FBSyxHQUFHLFVBQVU7QUFDdEM7QUFPTyxTQUFTLHNCQUFzQixPQUF3QjtBQUM1RCxTQUFPLE9BQU8sSUFBSSxLQUFLLEdBQUcsa0JBQWtCO0FBQzlDO0FBWU8sU0FBUyxrQkFB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R0FBRyxRQUFRLEdBQUcsK0NBQStDO0FBQ3pHLENBQUM7QUFFRCxLQUFLLCtDQUErQyxNQUFNO0FBQ3hELFFBQU0sUUFBUSxZQUFZLElBQUk7QUFDOUIsUUFBTSxPQUFPLElBQUksaUJBQWlCLE9BQU8sSUFBVSxhQUFNLEdBQUcsRUFBRSxZQUFZLEVBQUUsQ0FBQztBQUM3RSxPQUFLLGdCQUFnQixPQUFPO0FBQzVCLE9BQUssUUFBUSxLQUFLLEtBQUssS0FBSyxHQUFHO0FBQy9CLGNBQVksT0FBTyxjQUFjLEdBQUcsR0FBRyxjQUFjLEdBQUcsQ0FBQztBQUN6RCxRQUFNLFFBQVEsSUFBVSxlQUFRLEtBQUssSUFBSSxHQUFHO0FBQzVDLE9BQUssUUFBUSxLQUFLO0FBQ2xCLFdBQVMsSUFBSSxHQUFHLElBQUksSUFBSSxJQUFLLE1BQUssT0FBTyxLQUFLO0FBQzlDLFNBQU8sR0FBRyxNQUFNLE9BQU8sSUFBSSxTQUFTLGNBQWMsR0FBRyxHQUFHLGNBQWMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUM5RSxDQUFDO0FBRUQsS0FBSyx1RUFBdUUsTUFBTTtBQUNoRixRQUFNLFVBQVUsWUFBWSxRQUFRLElBQUk7QUFDeEMsUUFBTSxRQUFRLGlCQUFpQixRQUFRLEtBQUs7QUFDNUMsUUFBTSxTQUFTLGlCQUFpQixRQUFRLEtBQUs7QUFDN0MsU0FBTyxHQUFHLE1BQU0sWUFBWSxDQUFDO0FBQzdCLFNBQU8sTUFBTSxPQUFPLFdBQVcsTUFBTSxTQUFTO0FBQzlDLFNBQU8sTUFBTSxPQUFPLFdBQVcsTUFBTSxTQUFTO0FBQ2hELENBQUM7IiwKICAibmFtZXMiOiBbIlRIUkVFIiwgImMiLCAiYSIsICJiIiwgInNtb290aCIsICJ0b3RhbCIsICJpZCIsICJpZCIsICJpZCIsICJ0ZXh0IiwgImlkIiwgImMiLCAiaWQiLCAiZGlnZXN0IiwgImMiLCAiZmFpbCIsICJqb2IiLCAiYyIsICJ0ZXh0IiwgImludmVudG9yeSIsICJpZCIsICJjIiwgImlkIiwgIlRIUkVFIiwgIk0iLCAiSCIsICJzbW9vdGhzdGVwIiwgIlRIUkVFIiwgIk0iLCAiSCIsICJjIiwgImNsYW1wIiwgImlkIiwgImlkIiwgInVpbnQiLCAiZW50aXR5SWQiLCAib3V0Y29tZSIsICJoaXN0b3JpY2FsIiwgImVycm9yIiwgImlkIl0KfQo=
