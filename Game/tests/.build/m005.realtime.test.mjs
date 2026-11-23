// tests/m005.realtime.test.ts
import test from "node:test";
import assert from "node:assert/strict";

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
var SaveScheduler = class {
  constructor(save, intervalMs = 1e4) {
    this.save = save;
    this.intervalMs = intervalMs;
  }
  save;
  intervalMs;
  dirtySince = null;
  lastSave = -Infinity;
  markDirty(now) {
    if (this.dirtySince === null) this.dirtySince = now;
  }
  /** Call every frame. */
  poll(now) {
    if (this.dirtySince !== null && now - this.lastSave >= this.intervalMs) this.flush(now);
  }
  flush(now = Date.now()) {
    if (this.dirtySince === null) return;
    this.dirtySince = null;
    this.lastSave = now;
    this.save();
  }
  /** A player command saved immediately; nothing is pending. */
  saved(now) {
    this.dirtySince = null;
    this.lastSave = now;
  }
  get pending() {
    return this.dirtySince !== null;
  }
};
var TabLease = class {
  constructor(storage, key, ttlMs = 6e3) {
    this.storage = storage;
    this.key = key;
    this.ttlMs = ttlMs;
  }
  storage;
  key;
  ttlMs;
  id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  leader = false;
  /** Refresh the lease; returns whether this tab may advance and save the world. */
  heartbeat(now = Date.now()) {
    if (!this.storage) {
      this.leader = true;
      return true;
    }
    try {
      const raw = this.storage.getItem(this.key);
      const held = raw ? JSON.parse(raw) : null;
      if (!held || held.id === this.id || now - held.at > this.ttlMs) {
        this.storage.setItem(this.key, JSON.stringify({ id: this.id, at: now }));
        this.leader = JSON.parse(this.storage.getItem(this.key) ?? "{}").id === this.id;
      } else {
        this.leader = false;
      }
    } catch {
      this.leader = true;
    }
    return this.leader;
  }
  get isLeader() {
    return this.leader;
  }
  release() {
    try {
      const raw = this.storage?.getItem(this.key);
      if (raw && JSON.parse(raw).id === this.id) this.storage?.removeItem(this.key);
    } catch {
    }
  }
};

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

// tests/m005.realtime.test.ts
var Mem = class {
  m = /* @__PURE__ */ new Map();
  getItem(k) {
    return this.m.get(k) ?? null;
  }
  setItem(k, v) {
    this.m.set(k, v);
  }
  removeItem(k) {
    this.m.delete(k);
  }
};
test("clock issues one tick per two seconds of active play only", () => {
  const c = new SimClock();
  let ticks = 0;
  for (let i = 0; i < 605; i++) if (c.advance(1 / 60, true)) ticks++;
  assert.equal(ticks, Math.floor(10 / TICK_SECONDS));
  for (let i = 0; i < 600; i++) assert.equal(c.advance(1 / 60, false), false, "paused/hidden: no ticks");
  let burst = c.advance(3600, true) ? 1 : 0;
  for (let i = 0; i < 30; i++) if (c.advance(1 / 60, true)) burst++;
  assert.ok(burst <= 1, `resume burst ${burst}`);
  c.reset();
  assert.equal(c.secondsToNext, TICK_SECONDS);
});
test("save scheduler throttles real-time saves and flushes on demand", () => {
  let saves = 0;
  const s = new SaveScheduler(() => {
    saves++;
  }, 1e4);
  s.markDirty(0);
  s.poll(0);
  assert.equal(saves, 1, "first dirty state saves");
  for (let t = 2e3; t < 1e4; t += 2e3) {
    s.markDirty(t);
    s.poll(t);
  }
  assert.equal(saves, 1, "within the interval nothing else is written");
  s.markDirty(1e4);
  s.poll(1e4);
  assert.equal(saves, 2);
  s.markDirty(11e3);
  s.flush(11500);
  assert.equal(saves, 3, "hide/close flushes immediately");
  s.flush(12e3);
  assert.equal(saves, 3, "nothing pending, nothing written");
});
test("only one tab may run a world at a time", () => {
  const store = new Mem();
  const a = new TabLease(store, "lease", 6e3), b = new TabLease(store, "lease", 6e3);
  assert.equal(a.heartbeat(1e3), true);
  assert.equal(b.heartbeat(1500), false, "second tab is read-only while the first is alive");
  assert.equal(a.heartbeat(4e3), true);
  assert.equal(b.heartbeat(11e3), true, "takes over after the heartbeat lapses");
  assert.equal(a.heartbeat(11500), false);
  b.release();
  assert.equal(a.heartbeat(12e3), true);
});
test("real-time ticks are ordinary journaled commands and replay exactly", () => {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  for (let i = 0; i < 30; i++) {
    const r = s.dispatch({ schema: 3, id: s.commandId("tick", "realtime"), type: "tick", ticks: 1, expectedRevision: s.world.revision });
    assert.equal(r.ok, true);
  }
  assert.equal(s.world.life.tick, 30);
  const replayed = GameSession.replay(JSON.parse(JSON.stringify(s.journal)));
  assert.equal(replayed.stateHash, s.stateHash);
  const restored = GameSession.restore(JSON.parse(JSON.stringify(s.snapshot)), JSON.parse(JSON.stringify(s.journal)));
  assert.equal(restored.stateHash, s.stateHash);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwNS5yZWFsdGltZS50ZXN0LnRzIiwgIi4uLy4uL3NyYy9hcHAvc2ltLWNsb2NrLnRzIiwgIi4uLy4uL3NyYy9zaW0vc3RvbmUtY29tcGF0LnRzIiwgIi4uLy4uL3NyYy9zaW0vbm9pc2UudHMiLCAiLi4vLi4vc3JjL3NpbS9oeWRyb2xvZ3kudHMiLCAiLi4vLi4vc3JjL3NpbS9tYXRlcmlhbHMudHMiLCAiLi4vLi4vc3JjL3NpbS90ZXJyYWluLXYyLnRzIiwgIi4uLy4uL3NyYy9zaW0vd29ybGQudHMiLCAiLi4vLi4vc3JjL3NpbS90ZXJyYWluLnRzIiwgIi4uLy4uL3NyYy9zaW0vY29uc3RydWN0aW9uLnRzIiwgIi4uLy4uL3NyYy9zaW0vcHJlcGFyYXRpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9zdHJ1Y3R1cmVzLnRzIiwgIi4uLy4uL3NyYy9zaW0vY2Fub25pY2FsLnRzIiwgIi4uLy4uL3NyYy9zaW0vbTAwMi50cyIsICIuLi8uLi9zcmMvc2ltL3NjZW5hcmlvLnRzIiwgIi4uLy4uL3NyYy9zaW0vZWNvbm9teS50cyIsICIuLi8uLi9zcmMvc2ltL3NuYXBzaG90LnRzIiwgIi4uLy4uL3NyYy9hcHAvcHJvamVjdHMudHMiLCAiLi4vLi4vc3JjL2FwcC9zZXNzaW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgdGVzdCBmcm9tICdub2RlOnRlc3QnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdub2RlOmFzc2VydC9zdHJpY3QnO1xuaW1wb3J0IHsgU2ltQ2xvY2ssIFNhdmVTY2hlZHVsZXIsIFRhYkxlYXNlLCBUSUNLX1NFQ09ORFMgfSBmcm9tICcuLi9zcmMvYXBwL3NpbS1jbG9jayc7XG5pbXBvcnQgeyBHYW1lU2Vzc2lvbiB9IGZyb20gJy4uL3NyYy9hcHAvc2Vzc2lvbic7XG5pbXBvcnQgeyBHRU5FUkFUT1JfVjIgfSBmcm9tICcuLi9zcmMvc2ltL3dvcmxkJztcblxuY2xhc3MgTWVtIHsgbSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7IGdldEl0ZW0oazogc3RyaW5nKSB7IHJldHVybiB0aGlzLm0uZ2V0KGspID8/IG51bGw7IH0gc2V0SXRlbShrOiBzdHJpbmcsIHY6IHN0cmluZykgeyB0aGlzLm0uc2V0KGssIHYpOyB9IHJlbW92ZUl0ZW0oazogc3RyaW5nKSB7IHRoaXMubS5kZWxldGUoayk7IH0gfVxuXG50ZXN0KCdjbG9jayBpc3N1ZXMgb25lIHRpY2sgcGVyIHR3byBzZWNvbmRzIG9mIGFjdGl2ZSBwbGF5IG9ubHknLCAoKSA9PiB7XG4gIGNvbnN0IGMgPSBuZXcgU2ltQ2xvY2soKTtcbiAgbGV0IHRpY2tzID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCA2MDU7IGkrKykgaWYgKGMuYWR2YW5jZSgxIC8gNjAsIHRydWUpKSB0aWNrcysrOyAgIC8vIH4xMCBzIGF0IDYwIGZwc1xuICBhc3NlcnQuZXF1YWwodGlja3MsIE1hdGguZmxvb3IoMTAgLyBUSUNLX1NFQ09ORFMpKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCA2MDA7IGkrKykgYXNzZXJ0LmVxdWFsKGMuYWR2YW5jZSgxIC8gNjAsIGZhbHNlKSwgZmFsc2UsICdwYXVzZWQvaGlkZGVuOiBubyB0aWNrcycpO1xuICAvLyBBIHN1c3BlbmRlZCB0YWIgcmVzdW1lcyB3aXRoIGEgaHVnZSBkdDogYXQgbW9zdCBvbmUgdGljaywgbm8gY2F0Y2gtdXAgYnVyc3QuXG4gIGxldCBidXJzdCA9IGMuYWR2YW5jZSgzNjAwLCB0cnVlKSA/IDEgOiAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IDMwOyBpKyspIGlmIChjLmFkdmFuY2UoMSAvIDYwLCB0cnVlKSkgYnVyc3QrKztcbiAgYXNzZXJ0Lm9rKGJ1cnN0IDw9IDEsIGByZXN1bWUgYnVyc3QgJHtidXJzdH1gKTtcbiAgYy5yZXNldCgpO1xuICBhc3NlcnQuZXF1YWwoYy5zZWNvbmRzVG9OZXh0LCBUSUNLX1NFQ09ORFMpO1xufSk7XG5cbnRlc3QoJ3NhdmUgc2NoZWR1bGVyIHRocm90dGxlcyByZWFsLXRpbWUgc2F2ZXMgYW5kIGZsdXNoZXMgb24gZGVtYW5kJywgKCkgPT4ge1xuICBsZXQgc2F2ZXMgPSAwO1xuICBjb25zdCBzID0gbmV3IFNhdmVTY2hlZHVsZXIoKCkgPT4geyBzYXZlcysrOyB9LCAxMF8wMDApO1xuICBzLm1hcmtEaXJ0eSgwKTsgcy5wb2xsKDApOyBhc3NlcnQuZXF1YWwoc2F2ZXMsIDEsICdmaXJzdCBkaXJ0eSBzdGF0ZSBzYXZlcycpO1xuICBmb3IgKGxldCB0ID0gMjAwMDsgdCA8IDEwXzAwMDsgdCArPSAyMDAwKSB7IHMubWFya0RpcnR5KHQpOyBzLnBvbGwodCk7IH1cbiAgYXNzZXJ0LmVxdWFsKHNhdmVzLCAxLCAnd2l0aGluIHRoZSBpbnRlcnZhbCBub3RoaW5nIGVsc2UgaXMgd3JpdHRlbicpO1xuICBzLm1hcmtEaXJ0eSgxMF8wMDApOyBzLnBvbGwoMTBfMDAwKTsgYXNzZXJ0LmVxdWFsKHNhdmVzLCAyKTtcbiAgcy5tYXJrRGlydHkoMTFfMDAwKTsgcy5mbHVzaCgxMV81MDApOyBhc3NlcnQuZXF1YWwoc2F2ZXMsIDMsICdoaWRlL2Nsb3NlIGZsdXNoZXMgaW1tZWRpYXRlbHknKTtcbiAgcy5mbHVzaCgxMl8wMDApOyBhc3NlcnQuZXF1YWwoc2F2ZXMsIDMsICdub3RoaW5nIHBlbmRpbmcsIG5vdGhpbmcgd3JpdHRlbicpO1xufSk7XG5cbnRlc3QoJ29ubHkgb25lIHRhYiBtYXkgcnVuIGEgd29ybGQgYXQgYSB0aW1lJywgKCkgPT4ge1xuICBjb25zdCBzdG9yZSA9IG5ldyBNZW0oKTtcbiAgY29uc3QgYSA9IG5ldyBUYWJMZWFzZShzdG9yZSwgJ2xlYXNlJywgNjAwMCksIGIgPSBuZXcgVGFiTGVhc2Uoc3RvcmUsICdsZWFzZScsIDYwMDApO1xuICBhc3NlcnQuZXF1YWwoYS5oZWFydGJlYXQoMTAwMCksIHRydWUpO1xuICBhc3NlcnQuZXF1YWwoYi5oZWFydGJlYXQoMTUwMCksIGZhbHNlLCAnc2Vjb25kIHRhYiBpcyByZWFkLW9ubHkgd2hpbGUgdGhlIGZpcnN0IGlzIGFsaXZlJyk7XG4gIGFzc2VydC5lcXVhbChhLmhlYXJ0YmVhdCg0MDAwKSwgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChiLmhlYXJ0YmVhdCgxMV8wMDApLCB0cnVlLCAndGFrZXMgb3ZlciBhZnRlciB0aGUgaGVhcnRiZWF0IGxhcHNlcycpO1xuICBhc3NlcnQuZXF1YWwoYS5oZWFydGJlYXQoMTFfNTAwKSwgZmFsc2UpO1xuICBiLnJlbGVhc2UoKTtcbiAgYXNzZXJ0LmVxdWFsKGEuaGVhcnRiZWF0KDEyXzAwMCksIHRydWUpO1xufSk7XG5cbnRlc3QoJ3JlYWwtdGltZSB0aWNrcyBhcmUgb3JkaW5hcnkgam91cm5hbGVkIGNvbW1hbmRzIGFuZCByZXBsYXkgZXhhY3RseScsICgpID0+IHtcbiAgY29uc3QgcyA9IEdhbWVTZXNzaW9uLmdlbmVzaXMoMTMzNywgR0VORVJBVE9SX1YyKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCAzMDsgaSsrKSB7XG4gICAgY29uc3QgciA9IHMuZGlzcGF0Y2goeyBzY2hlbWE6IDMsIGlkOiBzLmNvbW1hbmRJZCgndGljaycsICdyZWFsdGltZScpLCB0eXBlOiAndGljaycsIHRpY2tzOiAxLCBleHBlY3RlZFJldmlzaW9uOiBzLndvcmxkLnJldmlzaW9uIH0pO1xuICAgIGFzc2VydC5lcXVhbChyLm9rLCB0cnVlKTtcbiAgfVxuICBhc3NlcnQuZXF1YWwocy53b3JsZC5saWZlIS50aWNrLCAzMCk7XG4gIGNvbnN0IHJlcGxheWVkID0gR2FtZVNlc3Npb24ucmVwbGF5KEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkocy5qb3VybmFsKSkpO1xuICBhc3NlcnQuZXF1YWwocmVwbGF5ZWQuc3RhdGVIYXNoLCBzLnN0YXRlSGFzaCk7XG4gIGNvbnN0IHJlc3RvcmVkID0gR2FtZVNlc3Npb24ucmVzdG9yZShKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHMuc25hcHNob3QpKSwgSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShzLmpvdXJuYWwpKSk7XG4gIGFzc2VydC5lcXVhbChyZXN0b3JlZC5zdGF0ZUhhc2gsIHMuc3RhdGVIYXNoKTtcbn0pO1xuIiwgIi8vIFJlYWwtdGltZSBzZXR0bGVtZW50IGNsb2NrLlxuLy9cbi8vIFRoZSBzaW11bGF0aW9uIHN0aWxsIG9ubHkgYWR2YW5jZXMgdGhyb3VnaCBhY2NlcHRlZCwgam91cm5hbGVkIGB0aWNrYFxuLy8gY29tbWFuZHM7IHRoaXMgY2xhc3MganVzdCBkZWNpZGVzICp3aGVuKiB0aGUgbG9jYWwgcGxheWVyJ3MgY2xpZW50IGlzc3Vlc1xuLy8gdGhlbTogb25lIHRpY2sgcGVyIFRJQ0tfU0VDT05EUyBvZiBhY3RpdmUgcGxheS4gUnVsZXM6XG4vLyAgIC0gYWN0aXZlIHBsYXkgb25seTogcGF1c2VkLCBoaWRkZW4vc3VzcGVuZGVkIHRhYiwgb3IgYSBub24tbGVhZGVyIHRhYlxuLy8gICAgIGFjY3VtdWxhdGVzIG5vdGhpbmcgKG5vIG9mZmxpbmUgY2F0Y2gtdXApO1xuLy8gICAtIGF0IG1vc3Qgb25lIHRpY2sgcGVyIGNhbGwsIGFuZCB0aGUgYWNjdW11bGF0b3IgaXMgY2FwcGVkLCBzbyByZXN1bWluZyBhXG4vLyAgICAgc3VzcGVuZGVkIHRhYiBuZXZlciBidXJzdHMgbWFueSB0aWNrcztcbi8vICAgLSBkZXRlcm1pbmlzdGljOiB0aGUgZWNvbm9taWMgcmVzdWx0IGRlcGVuZHMgb25seSBvbiB0aGUgam91cm5hbGVkIHRpY2tzLFxuLy8gICAgIG5ldmVyIG9uIGZyYW1lIHRpbWluZy5cblxuZXhwb3J0IGNvbnN0IFRJQ0tfU0VDT05EUyA9IDI7XG4vKiogTmV2ZXIgY2FycnkgbW9yZSB0aGFuIG9uZSBwZW5kaW5nIHRpY2sgYWNyb3NzIGEgbG9uZyBmcmFtZSBvciByZXN1bWUuICovXG5jb25zdCBNQVhfQUNDVU1VTEFURUQgPSBUSUNLX1NFQ09ORFMgKiAxLjU7XG5cbmV4cG9ydCBjbGFzcyBTaW1DbG9jayB7XG4gIHByaXZhdGUgYWNjdW11bGF0ZWQgPSAwO1xuICB0aWNrc0lzc3VlZCA9IDA7XG5cbiAgLyoqIFJldHVybnMgdHJ1ZSB3aGVuIGEgdGljayBpcyBkdWUuIGBkdGAgaXMgcmVhbCBlbGFwc2VkIHNlY29uZHMgc2luY2UgdGhlIGxhc3QgY2FsbC4gKi9cbiAgYWR2YW5jZShkdDogbnVtYmVyLCBhY3RpdmU6IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgICBpZiAoIWFjdGl2ZSB8fCAhTnVtYmVyLmlzRmluaXRlKGR0KSB8fCBkdCA8PSAwKSByZXR1cm4gZmFsc2U7XG4gICAgdGhpcy5hY2N1bXVsYXRlZCA9IE1hdGgubWluKE1BWF9BQ0NVTVVMQVRFRCwgdGhpcy5hY2N1bXVsYXRlZCArIE1hdGgubWluKGR0LCBUSUNLX1NFQ09ORFMpKTtcbiAgICBpZiAodGhpcy5hY2N1bXVsYXRlZCA8IFRJQ0tfU0VDT05EUykgcmV0dXJuIGZhbHNlO1xuICAgIHRoaXMuYWNjdW11bGF0ZWQgLT0gVElDS19TRUNPTkRTO1xuICAgIHRoaXMudGlja3NJc3N1ZWQrKztcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8qKiBGb3JnZXQgcGFydGlhbCBwcm9ncmVzcyAoYWZ0ZXIgcmVzdW1lIG9yIGEgbWFudWFsIHRpbWUgc2tpcCkuICovXG4gIHJlc2V0KCk6IHZvaWQgeyB0aGlzLmFjY3VtdWxhdGVkID0gMDsgfVxuXG4gIC8qKiBTZWNvbmRzIHVudGlsIHRoZSBuZXh0IHRpY2sgd2hpbGUgYWN0aXZlLiAqL1xuICBnZXQgc2Vjb25kc1RvTmV4dCgpOiBudW1iZXIgeyByZXR1cm4gTWF0aC5tYXgoMCwgVElDS19TRUNPTkRTIC0gdGhpcy5hY2N1bXVsYXRlZCk7IH1cbn1cblxuLyoqXG4gKiBUaHJvdHRsZWQgcGVyc2lzdGVuY2U6IHJlYWwtdGltZSB0aWNrcyBtYXJrIHRoZSBzZXNzaW9uIGRpcnR5OyBpdCBpcyBzYXZlZCBhdFxuICogbW9zdCBldmVyeSBgaW50ZXJ2YWxNc2AsIGFuZCBpbW1lZGlhdGVseSB3aGVuIHRoZSB0YWIgaGlkZXMgb3IgY2xvc2VzLlxuICovXG5leHBvcnQgY2xhc3MgU2F2ZVNjaGVkdWxlciB7XG4gIHByaXZhdGUgZGlydHlTaW5jZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbGFzdFNhdmUgPSAtSW5maW5pdHk7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgc2F2ZTogKCkgPT4gdm9pZCwgcHJpdmF0ZSByZWFkb25seSBpbnRlcnZhbE1zID0gMTBfMDAwKSB7fVxuICBtYXJrRGlydHkobm93OiBudW1iZXIpOiB2b2lkIHsgaWYgKHRoaXMuZGlydHlTaW5jZSA9PT0gbnVsbCkgdGhpcy5kaXJ0eVNpbmNlID0gbm93OyB9XG4gIC8qKiBDYWxsIGV2ZXJ5IGZyYW1lLiAqL1xuICBwb2xsKG5vdzogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuZGlydHlTaW5jZSAhPT0gbnVsbCAmJiBub3cgLSB0aGlzLmxhc3RTYXZlID49IHRoaXMuaW50ZXJ2YWxNcykgdGhpcy5mbHVzaChub3cpO1xuICB9XG4gIGZsdXNoKG5vdyA9IERhdGUubm93KCkpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5kaXJ0eVNpbmNlID09PSBudWxsKSByZXR1cm47XG4gICAgdGhpcy5kaXJ0eVNpbmNlID0gbnVsbDtcbiAgICB0aGlzLmxhc3RTYXZlID0gbm93O1xuICAgIHRoaXMuc2F2ZSgpO1xuICB9XG4gIC8qKiBBIHBsYXllciBjb21tYW5kIHNhdmVkIGltbWVkaWF0ZWx5OyBub3RoaW5nIGlzIHBlbmRpbmcuICovXG4gIHNhdmVkKG5vdzogbnVtYmVyKTogdm9pZCB7IHRoaXMuZGlydHlTaW5jZSA9IG51bGw7IHRoaXMubGFzdFNhdmUgPSBub3c7IH1cbiAgZ2V0IHBlbmRpbmcoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmRpcnR5U2luY2UgIT09IG51bGw7IH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBMb2NrU3RvcmFnZSB7XG4gIGdldEl0ZW0oa2V5OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsO1xuICBzZXRJdGVtKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZDtcbiAgcmVtb3ZlSXRlbShrZXk6IHN0cmluZyk6IHZvaWQ7XG59XG5cbi8qKlxuICogT25lIHdyaXRpbmcgdGFiIHBlciB3b3JsZC4gVHdvIHRhYnMgb24gdGhlIHNhbWUgc2F2ZSB3b3VsZCBlYWNoIHRpY2sgYW5kXG4gKiBvdmVyd3JpdGUgdGhlIG90aGVyJ3Mgam91cm5hbDsgdGhlIHNlY29uZCB0YWIgdGhlcmVmb3JlIHN0YXlzIHJlYWQtb25seSBmb3JcbiAqIHNpbXVsYXRpb24gdGltZSB1bnRpbCB0aGUgZmlyc3QgdGFiJ3MgaGVhcnRiZWF0IGxhcHNlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFRhYkxlYXNlIHtcbiAgcmVhZG9ubHkgaWQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyKSArIERhdGUubm93KCkudG9TdHJpbmcoMzYpO1xuICBwcml2YXRlIGxlYWRlciA9IGZhbHNlO1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2U6IExvY2tTdG9yYWdlIHwgbnVsbCwgcHJpdmF0ZSByZWFkb25seSBrZXk6IHN0cmluZyxcbiAgICBwcml2YXRlIHJlYWRvbmx5IHR0bE1zID0gNjAwMCkge31cblxuICAvKiogUmVmcmVzaCB0aGUgbGVhc2U7IHJldHVybnMgd2hldGhlciB0aGlzIHRhYiBtYXkgYWR2YW5jZSBhbmQgc2F2ZSB0aGUgd29ybGQuICovXG4gIGhlYXJ0YmVhdChub3cgPSBEYXRlLm5vdygpKTogYm9vbGVhbiB7XG4gICAgaWYgKCF0aGlzLnN0b3JhZ2UpIHsgdGhpcy5sZWFkZXIgPSB0cnVlOyByZXR1cm4gdHJ1ZTsgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2UuZ2V0SXRlbSh0aGlzLmtleSk7XG4gICAgICBjb25zdCBoZWxkID0gcmF3ID8gSlNPTi5wYXJzZShyYXcpIGFzIHsgaWQ6IHN0cmluZzsgYXQ6IG51bWJlciB9IDogbnVsbDtcbiAgICAgIGlmICghaGVsZCB8fCBoZWxkLmlkID09PSB0aGlzLmlkIHx8IG5vdyAtIGhlbGQuYXQgPiB0aGlzLnR0bE1zKSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5zZXRJdGVtKHRoaXMua2V5LCBKU09OLnN0cmluZ2lmeSh7IGlkOiB0aGlzLmlkLCBhdDogbm93IH0pKTtcbiAgICAgICAgdGhpcy5sZWFkZXIgPSBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZS5nZXRJdGVtKHRoaXMua2V5KSA/PyAne30nKS5pZCA9PT0gdGhpcy5pZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubGVhZGVyID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aGlzLmxlYWRlciA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmxlYWRlcjtcbiAgfVxuXG4gIGdldCBpc0xlYWRlcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMubGVhZGVyOyB9XG5cbiAgcmVsZWFzZSgpOiB2b2lkIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlPy5nZXRJdGVtKHRoaXMua2V5KTtcbiAgICAgIGlmIChyYXcgJiYgSlNPTi5wYXJzZShyYXcpLmlkID09PSB0aGlzLmlkKSB0aGlzLnN0b3JhZ2U/LnJlbW92ZUl0ZW0odGhpcy5rZXkpO1xuICAgIH0gY2F0Y2ggeyAvKiBiZXN0IGVmZm9ydCAqLyB9XG4gIH1cbn1cbiIsICIvLyBQcml2YXRlIG1pZ3JhdGlvbiByZXBsYXkgb25seS4gUmV0aXJlZCBlbnRpdGllcyBsaXZlIGluIHRoaXMgV29ybGQgd2hpbGUgYW5cbi8vIGFjY2VwdGVkIGhpc3RvcmljYWwgam91cm5hbCBpcyBjaGVja2VkOyBubyBwdWJsaWMgY29tbWFuZCBlbmFibGVzIHRoaXMgbW9kZS5cbmludGVyZmFjZSBSZXBsYXlTdGF0ZSB7XG4gIGFjdGl2ZTogYm9vbGVhbjtcbiAgaGlzdG9yaWNhbEhhc2g6IGJvb2xlYW47XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBzdGF0ZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFJlcGxheVN0YXRlPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZDogb2JqZWN0KTogUmVwbGF5U3RhdGUge1xuICBsZXQgc3RhdGUgPSBzdGF0ZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzdGF0ZSkgeyBzdGF0ZSA9IHsgYWN0aXZlOiBmYWxzZSwgaGlzdG9yaWNhbEhhc2g6IGZhbHNlLCBtaWdyYXRlZDogZmFsc2UgfTsgc3RhdGVzLnNldCh3b3JsZCwgc3RhdGUpOyB9XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xuICBzdGF0ZS5taWdyYXRlZCA9IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uYWN0aXZlID8/IGZhbHNlO1xufVxuXG4vKiogU25hcHNob3QgaGFzaGVzIGJlZm9yZSBhbmQgZHVyaW5nIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5IGluY2x1ZGUgc3RvbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZUhpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lmhpc3RvcmljYWxIYXNoID8/IGZhbHNlO1xufVxuXG4vKiogQSBtaWdyYXRlZCBzbmFwc2hvdCBhbHJlYWR5IGhhcyByZXRpcmVtZW50IHRvbWJzdG9uZXMgaW4gZ2VuZXJhdGVkIGNodW5rcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8ubWlncmF0ZWQgPz8gZmFsc2U7XG59XG5cbi8qKiBFeGl0IGhpc3RvcmljYWwgbW9kZSBhZnRlciBhbGwgYWNjZXB0ZWQgY29tbWFuZHMgYW5kIGhhc2hlcyBoYXZlIHBhc3NlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IGZhbHNlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IGZhbHNlO1xuICBzdGF0ZS5taWdyYXRlZCA9IHRydWU7XG59XG4iLCAiLy8gRGV0ZXJtaW5pc3RpYyBoYXNoLCBub2lzZSBhbmQgbWF0aCBoZWxwZXJzIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllci5cbi8vIFB1cmUgVHlwZVNjcmlwdCAoRC0wMDUpLiBFeHRyYWN0ZWQgZnJvbSB3b3JsZC50cyB1bmNoYW5nZWQgc28gdGVycmFpblxuLy8gZ2VuZXJhdG9ycyBvZiBldmVyeSB2ZXJzaW9uIHVzZSBpZGVudGljYWwgcHJpbWl0aXZlcy5cbmV4cG9ydCBjb25zdCBjbGFtcCA9ICh2OiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiAodiA8IGEgPyBhIDogdiA+IGIgPyBiIDogdik7XG5leHBvcnQgY29uc3QgbGVycCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgdDogbnVtYmVyKSA9PiBhICsgKGIgLSBhKSAqIHQ7XG5leHBvcnQgY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5leHBvcnQgY29uc3Qgc21vb3RoID0gKHQ6IG51bWJlcikgPT4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UyKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKTtcbiAgY29uc3QgYSA9IGhhc2gyaSh4aSwgeWksIHNlZWQpLCBiID0gaGFzaDJpKHhpICsgMSwgeWksIHNlZWQpO1xuICBjb25zdCBjID0gaGFzaDJpKHhpLCB5aSArIDEsIHNlZWQpLCBkID0gaGFzaDJpKHhpICsgMSwgeWkgKyAxLCBzZWVkKTtcbiAgY29uc3QgdG9wID0gYSArIChiIC0gYSkgKiB4ZjtcbiAgY29uc3QgYm90dG9tID0gYyArIChkIC0gYykgKiB4ZjtcbiAgcmV0dXJuIHRvcCArIChib3R0b20gLSB0b3ApICogeWY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0yKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UyKHggKiBmcmVxLCB5ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMyh4ICogZnJlcSwgeSAqIGZyZXEsIHogKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG4iLCAiLy8gSHlkcm9sb2d5IFx1MjAxNCB0aGUgZGV0ZXJtaW5pc3RpYyB3YXRlciBuZXR3b3JrIG9mIGEgd29ybGQgKHB1cmUgVHlwZVNjcmlwdCwgRC0wMDUpLlxuLy9cbi8vIFRoaXMgaXMgZGVyaXZlZCAqc2ltdWxhdGlvbiBkYXRhKiwgbm90IHByZXNlbnRhdGlvbjogaXQgaXMgYSBwdXJlIGZ1bmN0aW9uIG9mXG4vLyAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pIGFuZCBpcyB3aGF0IHRlcnJhaW4gY2FydmluZywgd2F0ZXIgZmlsbGluZywgZmxvd1xuLy8gZGlyZWN0aW9uIGFuZCBmdXR1cmUgZmlzaGluZy9pcnJpZ2F0aW9uL2Zsb29kaW5nIHJ1bGVzIHJlYWQuIEl0IGlzIG5ldmVyXG4vLyBqb3VybmFsZWQgYmVjYXVzZSBpdCBjYW4gYWx3YXlzIGJlIHJlZ2VuZXJhdGVkIGV4YWN0bHkuXG4vL1xuLy8gTmV0d29yayAoYm90aCBnZW5lcmF0b3IgdmVyc2lvbnMpOlxuLy8gICBsYWtlICBcdTIwMTQgdGhlIHZhbGxleSBsYWtlIGJhc2luLCBsb2NhdGVkIGZyb20gdGhlIGFjdHVhbCBnZW5lcmF0ZWQgdGVycmFpbi5cbi8vICAgbG93ZXIgXHUyMDE0IHRoZSBsb3dsYW5kIHJpdmVyIGZyb20gdGhlIGxha2UgdG8gdGhlIHNvdXRoZXJuIHNlYSwgdHJhY2VkIGZyb21cbi8vICAgICAgICAgICB0aGUgYWN0dWFsIGNhcnZlZCBjaGFubmVsICh0aGUgdjEgY2hhbm5lbCBpcyBjYXJ2ZWQgb24gKndhcnBlZCpcbi8vICAgICAgICAgICBjb29yZGluYXRlcywgc28gYHJpdmVyQ2VudGVyWGAgYWxvbmUgaXMgdXAgdG8gfjEzNSBtIG9mZikuXG4vLyBHZW5lcmF0b3IgdjIgYWRkczpcbi8vICAgdXBwZXIgXHUyMDE0IGEgbW91bnRhaW4gcml2ZXIgZnJvbSBhIGhpZ2hsYW5kIHRhcm4gZG93biB0byB0aGUgbGFrZSwgd2l0aCBhXG4vLyAgICAgICAgICAgd2F0ZXItc3VyZmFjZSBsZXZlbCB0aGF0IG5ldmVyIHJpc2VzIGRvd25zdHJlYW0sIGNhc2NhZGVzIGFuZCBmYWxscy5cbi8vXG4vLyBGbG93IGFsd2F5cyBwb2ludHMgZG93bnN0cmVhbTogdXBwZXIgXHUyMTkyIGxha2UgXHUyMTkyIGxvd2VyIFx1MjE5MiBzZWEuXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbXVsYmVycnkzMiwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuXG5leHBvcnQgdHlwZSBIZWlnaHRTYW1wbGVyID0gKHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUml2ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZCBvZiB0aGlzIHJlYWNoIChtZXRyZXMpLiAqL1xuICBzOiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGVsZXZhdGlvbiAobWV0cmVzLCBtYXkgYmUgZnJhY3Rpb25hbCkuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBDaGFubmVsIGhhbGYtd2lkdGggKG1ldHJlcykuICovXG4gIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhY2hIaXQge1xuICAvKiogSG9yaXpvbnRhbCBkaXN0YW5jZSBmcm9tIHRoZSBjZW50cmVsaW5lLiAqL1xuICBkOiBudW1iZXI7XG4gIC8qKiBJbnRlcnBvbGF0ZWQgd2F0ZXIgbGV2ZWwgYXQgdGhlIG5lYXJlc3QgY2VudHJlbGluZSBwb2ludC4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgd2lkdGg6IG51bWJlcjtcbiAgLyoqIFVuaXQgZG93bnN0cmVhbSBkaXJlY3Rpb24uICovXG4gIHR4OiBudW1iZXI7XG4gIHR6OiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGRyb3AgcGVyIG1ldHJlIGFsb25nIHRoZSBjaGFubmVsICg+PSAwKS4gKi9cbiAgZ3JhZGllbnQ6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggb2YgdGhlIG5lYXJlc3QgcG9pbnQgZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQuICovXG4gIHM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHBvbHlsaW5lIHJlYWNoIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LiBOZWFyZXN0LXNlZ21lbnQgcXVlcmllcyB1c2UgYVxuICogdW5pZm9ybSBncmlkIHdob3NlIGNlbGxzIGxpc3QgZXZlcnkgc2VnbWVudCB3aXRoaW4gYHJlYWNoYCBtZXRyZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBSaXZlclJlYWNoIHtcbiAgcmVhZG9ubHkgcG9pbnRzOiBSaXZlclBvaW50W107XG4gIHByaXZhdGUgcmVhZG9ubHkgY2VsbCA9IDMyO1xuICBwcml2YXRlIHJlYWRvbmx5IGdyaWQgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyW10+KCk7XG5cbiAgY29uc3RydWN0b3IocG9pbnRzOiBSaXZlclBvaW50W10sIHJlYWRvbmx5IHJlYWNoOiBudW1iZXIpIHtcbiAgICB0aGlzLnBvaW50cyA9IHBvaW50cztcbiAgICBmb3IgKGxldCBpID0gMDsgaSArIDEgPCBwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGEgPSBwb2ludHNbaV0sIGIgPSBwb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgeDAgPSBNYXRoLm1pbihhLngsIGIueCkgLSByZWFjaCwgeDEgPSBNYXRoLm1heChhLngsIGIueCkgKyByZWFjaDtcbiAgICAgIGNvbnN0IHowID0gTWF0aC5taW4oYS56LCBiLnopIC0gcmVhY2gsIHoxID0gTWF0aC5tYXgoYS56LCBiLnopICsgcmVhY2g7XG4gICAgICBmb3IgKGxldCBjeiA9IE1hdGguZmxvb3IoejAgLyB0aGlzLmNlbGwpOyBjeiA8PSBNYXRoLmZsb29yKHoxIC8gdGhpcy5jZWxsKTsgY3orKykge1xuICAgICAgICBmb3IgKGxldCBjeCA9IE1hdGguZmxvb3IoeDAgLyB0aGlzLmNlbGwpOyBjeCA8PSBNYXRoLmZsb29yKHgxIC8gdGhpcy5jZWxsKTsgY3grKykge1xuICAgICAgICAgIGNvbnN0IGtleSA9IGNlbGxLZXkoY3gsIGN6KTtcbiAgICAgICAgICBsZXQgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoa2V5KTtcbiAgICAgICAgICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB0aGlzLmdyaWQuc2V0KGtleSwgbGlzdCk7IH1cbiAgICAgICAgICBsaXN0LnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnBvaW50c1t0aGlzLnBvaW50cy5sZW5ndGggLSAxXT8ucyA/PyAwOyB9XG5cbiAgLyoqIE5lYXJlc3QgY2VudHJlbGluZSBwb2ludCB3aXRoaW4gYHJlYWNoYCwgb3IgbnVsbC4gKi9cbiAgbmVhcmVzdCh4OiBudW1iZXIsIHo6IG51bWJlcik6IFJlYWNoSGl0IHwgbnVsbCB7XG4gICAgY29uc3QgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoY2VsbEtleShNYXRoLmZsb29yKHggLyB0aGlzLmNlbGwpLCBNYXRoLmZsb29yKHogLyB0aGlzLmNlbGwpKSk7XG4gICAgaWYgKCFsaXN0KSByZXR1cm4gbnVsbDtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBiaSA9IC0xLCBidCA9IDA7XG4gICAgZm9yIChjb25zdCBpIG9mIGxpc3QpIHtcbiAgICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tpXSwgYiA9IHRoaXMucG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IGR4ID0gYi54IC0gYS54LCBkeiA9IGIueiAtIGEuejtcbiAgICAgIGNvbnN0IGxlbjIgPSBkeCAqIGR4ICsgZHogKiBkeiB8fCAxO1xuICAgICAgY29uc3QgdCA9IGNsYW1wKCgoeCAtIGEueCkgKiBkeCArICh6IC0gYS56KSAqIGR6KSAvIGxlbjIsIDAsIDEpO1xuICAgICAgY29uc3QgcHggPSBhLnggKyBkeCAqIHQsIHB6ID0gYS56ICsgZHogKiB0O1xuICAgICAgY29uc3QgZDIgPSAoeCAtIHB4KSAqKiAyICsgKHogLSBweikgKiogMjtcbiAgICAgIGlmIChkMiA8IGJlc3QpIHsgYmVzdCA9IGQyOyBiaSA9IGk7IGJ0ID0gdDsgfVxuICAgIH1cbiAgICBpZiAoYmkgPCAwIHx8IGJlc3QgPiB0aGlzLnJlYWNoICogdGhpcy5yZWFjaCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2JpXSwgYiA9IHRoaXMucG9pbnRzW2JpICsgMV07XG4gICAgY29uc3Qgc2VnTGVuID0gTWF0aC5tYXgoMWUtNiwgYi5zIC0gYS5zKTtcbiAgICAvLyBQb2ludHMgYXJlIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LCBzbyBkb3duc3RyZWFtIGlzIGEgPC0gYi5cbiAgICBjb25zdCB0eCA9IChhLnggLSBiLngpIC8gc2VnTGVuLCB0eiA9IChhLnogLSBiLnopIC8gc2VnTGVuO1xuICAgIHJldHVybiB7XG4gICAgICBkOiBNYXRoLnNxcnQoYmVzdCksXG4gICAgICBsZXZlbDogYS5sZXZlbCArIChiLmxldmVsIC0gYS5sZXZlbCkgKiBidCxcbiAgICAgIHdpZHRoOiBhLndpZHRoICsgKGIud2lkdGggLSBhLndpZHRoKSAqIGJ0LFxuICAgICAgdHgsIHR6LFxuICAgICAgZ3JhZGllbnQ6IE1hdGgubWF4KDAsIChiLmxldmVsIC0gYS5sZXZlbCkgLyBzZWdMZW4pLFxuICAgICAgczogYS5zICsgKGIucyAtIGEucykgKiBidCxcbiAgICB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGNlbGxLZXkoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoY3ggKyA0MDk2KSAqIDgxOTIgKyAoY3ogKyA0MDk2KTtcbn1cblxuZXhwb3J0IHR5cGUgV2F0ZXJCb2R5ID0gJ3JpdmVyJyB8ICdsYWtlJyB8ICdzZWEnIHwgJ25vbmUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEZsb3dTYW1wbGUge1xuICBib2R5OiBXYXRlckJvZHk7XG4gIC8qKiBVbml0IGZsb3cgZGlyZWN0aW9uICh6ZXJvIGZvciBzdGlsbCB3YXRlcikuICovXG4gIGR4OiBudW1iZXI7XG4gIGR6OiBudW1iZXI7XG4gIC8qKiBTdXJmYWNlIGN1cnJlbnQgc3BlZWQgaW4gbS9zLiAqL1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEh5ZHJvbG9neU9wdGlvbnMge1xuICBzZWVkOiBudW1iZXI7XG4gIC8qKiBHZW5lcmF0b3IgdmVyc2lvbiB0aGUgbmV0d29yayBiZWxvbmdzIHRvLiAqL1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIC8qKiBCYXNlIGhlaWdodCBvZiB0aGUgKnVubW9kaWZpZWQgdjEgc2hhcGUqICh1c2VkIHRvIGxvY2F0ZSBsYWtlL2NoYW5uZWwpLiAqL1xuICB2MUhlaWdodDogSGVpZ2h0U2FtcGxlcjtcbn1cblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2dpY2FsIG5ldHdvcmsgZm9yIG9uZSAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pLiAqL1xuZXhwb3J0IGNsYXNzIEh5ZHJvbG9neSB7XG4gIHJlYWRvbmx5IHNlZWQ6IG51bWJlcjtcbiAgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuICByZWFkb25seSBsYWtlOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByeDogbnVtYmVyOyByejogbnVtYmVyIH07XG4gIHJlYWRvbmx5IGxvd2VyOiBSaXZlclJlYWNoO1xuICByZWFkb25seSB1cHBlcjogUml2ZXJSZWFjaCB8IG51bGw7XG4gIC8qKiBVcHBlci1yaXZlciBzb3VyY2UgdGFybiAodjIgb25seSkuICovXG4gIHJlYWRvbmx5IHRhcm46IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHI6IG51bWJlcjsgbGV2ZWw6IG51bWJlciB9IHwgbnVsbDtcblxuICBjb25zdHJ1Y3RvcihvcHRzOiBIeWRyb2xvZ3lPcHRpb25zKSB7XG4gICAgdGhpcy5zZWVkID0gb3B0cy5zZWVkO1xuICAgIHRoaXMudmVyc2lvbiA9IG9wdHMudmVyc2lvbjtcbiAgICB0aGlzLmxha2UgPSBsb2NhdGVMYWtlKG9wdHMudjFIZWlnaHQpO1xuICAgIHRoaXMubG93ZXIgPSB0cmFjZUxvd2VyUml2ZXIob3B0cy52MUhlaWdodCwgdGhpcy5sYWtlKTtcbiAgICBpZiAob3B0cy52ZXJzaW9uID49IDIpIHtcbiAgICAgIGNvbnN0IHVwcGVyID0gYXV0aG9yVXBwZXJSaXZlcihvcHRzLnNlZWQsIHRoaXMubGFrZSk7XG4gICAgICB0aGlzLnVwcGVyID0gdXBwZXIucmVhY2g7XG4gICAgICB0aGlzLnRhcm4gPSB1cHBlci50YXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVwcGVyID0gbnVsbDtcbiAgICAgIHRoaXMudGFybiA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN1cmZhY2UgY3VycmVudCBmb3IgYSB3YXRlciBjb2x1bW4uIGBsZXZlbGAgaXMgdGhlIGNvbHVtbidzIHdhdGVyIHN1cmZhY2UsXG4gICAqIHVzZWQgdG8gdGVsbCBzZWEtbGV2ZWwgd2F0ZXIgKGxha2UsIGxvd2VyIHJpdmVyLCBzZWEpIGZyb20gdGhlIHVwcGVyIHJpdmVyLlxuICAgKi9cbiAgZmxvd0F0KHg6IG51bWJlciwgejogbnVtYmVyLCBsZXZlbDogbnVtYmVyKTogRmxvd1NhbXBsZSB7XG4gICAgaWYgKHRoaXMudXBwZXIgJiYgbGV2ZWwgPiAwLjUpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHRoaXMudXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPD0gaGl0LndpZHRoICsgMikge1xuICAgICAgICBjb25zdCBzcGVlZCA9IGNsYW1wKDAuNTUgKyBoaXQuZ3JhZGllbnQgKiA5LCAwLjQsIDQuNSk7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBoaXQudHgsIGR6OiBoaXQudHosIHNwZWVkIH07XG4gICAgICB9XG4gICAgICBpZiAodGhpcy50YXJuICYmIE1hdGguaHlwb3QoeCAtIHRoaXMudGFybi54LCB6IC0gdGhpcy50YXJuLnopIDwgdGhpcy50YXJuLnIgKyA0KSB7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4udG93YXJkcyh4LCB6LCB0aGlzLnVwcGVyU291cmNlKCksIDAuMDYpIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGxvdyA9IHRoaXMubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDw9IGxvdy53aWR0aCArIDYpIHtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBsb3cudHgsIGR6OiBsb3cudHosIHNwZWVkOiAwLjM1ICsgMC4yNSAqIHNtb290aHN0ZXAobG93LndpZHRoICsgNiwgMCwgbG93LmQpIH07XG4gICAgfVxuICAgIGNvbnN0IGxkID0gTWF0aC5oeXBvdCgoeCAtIHRoaXMubGFrZS54KSAvIHRoaXMubGFrZS5yeCwgKHogLSB0aGlzLmxha2UueikgLyB0aGlzLmxha2UucnopO1xuICAgIGlmIChsZCA8IDEuMzUpIHtcbiAgICAgIC8vIFNsb3cgZHJpZnQgZnJvbSB0aGUgaW5mbG93IHRvd2FyZCB0aGUgb3V0ZmxvdyBhdCB0aGUgaGVhZCBvZiB0aGUgbG93ZXIgcml2ZXIuXG4gICAgICBjb25zdCBoZWFkID0gdGhpcy5sb3dlci5wb2ludHNbdGhpcy5sb3dlci5wb2ludHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBkcmlmdCA9IHRvd2FyZHMoeCwgeiwgaGVhZCwgMC4wOCk7XG4gICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLmRyaWZ0IH07XG4gICAgfVxuICAgIHJldHVybiB7IGJvZHk6ICdzZWEnLCBkeDogMCwgZHo6IDAsIHNwZWVkOiAwIH07XG4gIH1cblxuICBwcml2YXRlIHVwcGVyU291cmNlKCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gICAgY29uc3QgcHRzID0gdGhpcy51cHBlciEucG9pbnRzO1xuICAgIHJldHVybiBwdHNbcHRzLmxlbmd0aCAtIDFdO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvd2FyZHMoeDogbnVtYmVyLCB6OiBudW1iZXIsIHA6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgc3BlZWQ6IG51bWJlcikge1xuICBjb25zdCBkeCA9IHAueCAtIHgsIGR6ID0gcC56IC0gejtcbiAgY29uc3QgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gIHJldHVybiB7IGR4OiBkeCAvIGxlbiwgZHo6IGR6IC8gbGVuLCBzcGVlZCB9O1xufVxuXG4vKiogRmluZCB0aGUgdmFsbGV5IGxha2UgZnJvbSB0aGUgdGVycmFpbiBpdHNlbGY6IHRoZSBkZWVwIGJhc2luIE5XIG9mIHRoZSBmb3VuZGVyIHZhbGxleS4gKi9cbmZ1bmN0aW9uIGxvY2F0ZUxha2UoaDogSGVpZ2h0U2FtcGxlcik6IEh5ZHJvbG9neVsnbGFrZSddIHtcbiAgbGV0IHN4ID0gMCwgc3ogPSAwLCBuID0gMCwgbWluWCA9IEluZmluaXR5LCBtYXhYID0gLUluZmluaXR5LCBtaW5aID0gSW5maW5pdHksIG1heFogPSAtSW5maW5pdHk7XG4gIGZvciAobGV0IHogPSAtNDYwOyB6IDw9IC0xMjA7IHogKz0gNCkge1xuICAgIGZvciAobGV0IHggPSAtNDgwOyB4IDw9IC00MDsgeCArPSA0KSB7XG4gICAgICBpZiAoaCh4LCB6KSA+IC00KSBjb250aW51ZTtcbiAgICAgIHN4ICs9IHg7IHN6ICs9IHo7IG4rKztcbiAgICAgIG1pblggPSBNYXRoLm1pbihtaW5YLCB4KTsgbWF4WCA9IE1hdGgubWF4KG1heFgsIHgpO1xuICAgICAgbWluWiA9IE1hdGgubWluKG1pblosIHopOyBtYXhaID0gTWF0aC5tYXgobWF4Wiwgeik7XG4gICAgfVxuICB9XG4gIGlmIChuID09PSAwKSByZXR1cm4geyB4OiAtMjYwLCB6OiAtMjMwLCByeDogMTIwLCByejogOTUgfTtcbiAgcmV0dXJuIHtcbiAgICB4OiBzeCAvIG4sIHo6IHN6IC8gbixcbiAgICByeDogTWF0aC5tYXgoMzAsIChtYXhYIC0gbWluWCkgLyAyICsgMTApLCByejogTWF0aC5tYXgoMzAsIChtYXhaIC0gbWluWikgLyAyICsgMTApLFxuICB9O1xufVxuXG4vKipcbiAqIFRyYWNlIHRoZSBjYXJ2ZWQgbG93bGFuZCBjaGFubmVsIGZyb20gdGhlIGxha2Ugb3V0ZmxvdyBzb3V0aCB0byB0aGUgc2VhLiBGb3JcbiAqIGVhY2ggNCBtIHJvdyB0aGUgY2hhbm5lbCBpcyB0aGUgbG93ZXN0IGNvbHVtbiBuZWFyIHRoZSBwcmV2aW91cyBjZW50cmU7IHRoZVxuICogdHJhY2UgaXMgc21vb3RoZWQgc28gdGhlIGZsb3cgZmllbGQgZG9lcyBub3Qgaml0dGVyIHdpdGggdGhlIDEgbSB2b3hlbHMuXG4gKi9cbmZ1bmN0aW9uIHRyYWNlTG93ZXJSaXZlcihoOiBIZWlnaHRTYW1wbGVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IFJpdmVyUmVhY2gge1xuICBjb25zdCByYXc6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgbGV0IGN4ID0gbGFrZS54ICsgbGFrZS5yeCAqIDAuNTU7XG4gIGxldCB6ID0gTWF0aC5yb3VuZChsYWtlLnogKyBsYWtlLnJ6ICogMC42KTtcbiAgLy8gU3RhcnQgYXQgdGhlIGxha2UncyBzb3V0aC1lYXN0IG91dGZsb3cgYW5kIGZvbGxvdyB0aGUgY2hhbm5lbCBkb3duc3RyZWFtLlxuICBmb3IgKDsgeiA8PSA5MDA7IHogKz0gNCkge1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJ4ID0gY3g7XG4gICAgZm9yIChsZXQgeCA9IE1hdGgucm91bmQoY3ggLSA0MCk7IHggPD0gY3ggKyA0MDsgeCArPSAyKSB7XG4gICAgICBjb25zdCB2ID0gaCh4LCB6KSArIE1hdGguYWJzKHggLSBjeCkgKiAwLjAyO1xuICAgICAgaWYgKHYgPCBiZXN0KSB7IGJlc3QgPSB2OyBieCA9IHg7IH1cbiAgICB9XG4gICAgY3ggPSBieDtcbiAgICByYXcucHVzaCh7IHg6IGJ4LCB6IH0pO1xuICAgIC8vIFRoZSB0cmFjZSBlbmRzIG9uY2UgaXQgcmVhY2hlcyBvcGVuIHNlYSBmb3IgYSBzdXN0YWluZWQgc3RyZXRjaC5cbiAgICBpZiAoYmVzdCA8IC02ICYmIHJhdy5sZW5ndGggPiAyMCAmJiBoKGJ4LCB6ICsgOCkgPCAtNiAmJiBoKGJ4LCB6ICsgMTYpIDwgLTYpIGJyZWFrO1xuICB9XG4gIGNvbnN0IHNtb290aCA9IHJhdy5tYXAoKHAsIGkpID0+IHtcbiAgICBsZXQgc3ggPSAwLCBuID0gMDtcbiAgICBmb3IgKGxldCBrID0gTWF0aC5tYXgoMCwgaSAtIDQpOyBrIDw9IE1hdGgubWluKHJhdy5sZW5ndGggLSAxLCBpICsgNCk7IGsrKykgeyBzeCArPSByYXdba10ueDsgbisrOyB9XG4gICAgcmV0dXJuIHsgeDogc3ggLyBuLCB6OiBwLnogfTtcbiAgfSk7XG4gIC8vIFN0b3JlIGRvd25zdHJlYW0tZmlyc3Q6IGluZGV4IDAgaXMgdGhlIHNlYSBtb3V0aC5cbiAgc21vb3RoLnJldmVyc2UoKTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSBbXTtcbiAgbGV0IHMgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHNtb290aC5sZW5ndGg7IGkrKykge1xuICAgIGlmIChpID4gMCkgcyArPSBNYXRoLmh5cG90KHNtb290aFtpXS54IC0gc21vb3RoW2kgLSAxXS54LCBzbW9vdGhbaV0ueiAtIHNtb290aFtpIC0gMV0ueik7XG4gICAgcG9pbnRzLnB1c2goeyB4OiBzbW9vdGhbaV0ueCwgejogc21vb3RoW2ldLnosIHMsIGxldmVsOiAwLCB3aWR0aDogNiB9KTtcbiAgfVxuICByZXR1cm4gbmV3IFJpdmVyUmVhY2gocG9pbnRzLCA0MCk7XG59XG5cbi8qKiBXYXRlci1zdXJmYWNlIGRyb3BzIGFsb25nIHRoZSB1cHBlciByaXZlciwgYXMgKGZyYWN0aW9uIG9mIGxlbmd0aCwgbWV0cmVzKS4gKi9cbmNvbnN0IEZBTExTOiBSZWFkb25seUFycmF5PHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0+ID0gW1swLjIsIDddLCBbMC40OCwgMTFdLCBbMC43NCwgMTNdXTtcbmNvbnN0IFVQUEVSX0dSQURJRU5UID0gMC4wMztcblxuLyoqXG4gKiBBdXRob3IgdGhlIHYyIG1vdW50YWluIHJpdmVyOiBhIHNlZWRlZCBtZWFuZGVyaW5nIGNlbnRyZWxpbmUgZnJvbSB0aGUgbGFrZSdzXG4gKiBub3J0aCBzaG9yZSB0byBhIGhpZ2hsYW5kIHRhcm4sIHdpdGggYSBsZXZlbCBwcm9maWxlIHRoYXQgb25seSByaXNlc1xuICogdXBzdHJlYW0gKGdlbnRsZSBncmFkaWVudCBwbHVzIHRocmVlIGNhc2NhZGVzKS5cbiAqL1xuZnVuY3Rpb24gYXV0aG9yVXBwZXJSaXZlcihzZWVkOiBudW1iZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKToge1xuICByZWFjaDogUml2ZXJSZWFjaDsgdGFybjogTm9uTnVsbGFibGU8SHlkcm9sb2d5Wyd0YXJuJ10+O1xufSB7XG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKHNlZWQgXiAweDVlZWQyKSA+Pj4gMCk7XG4gIGNvbnN0IGogPSAoYTogbnVtYmVyKSA9PiAocm5kKCkgLSAwLjUpICogMiAqIGE7XG4gIGNvbnN0IG1vdXRoID0geyB4OiBsYWtlLnggKyBsYWtlLnJ4ICogMC4xLCB6OiBsYWtlLnogLSBsYWtlLnJ6ICogMC41NSB9O1xuICBjb25zdCBjb250cm9scyA9IFtcbiAgICBtb3V0aCxcbiAgICB7IHg6IGxha2UueCArIDIwICsgaigyMCksIHo6IC00MTAgKyBqKDE1KSB9LFxuICAgIHsgeDogLTE5MCArIGooMzUpLCB6OiAtNTIwICsgaigyMCkgfSxcbiAgICB7IHg6IC0yMTUgKyBqKDM1KSwgejogLTY0MCArIGooMjApIH0sXG4gICAgeyB4OiAtMTY1ICsgaigzMCksIHo6IC03NzAgKyBqKDE1KSB9LFxuICBdO1xuICAvLyBDYXRtdWxsLVJvbSB0aHJvdWdoIHRoZSBjb250cm9scywgdGhlbiByZXNhbXBsZSBhdCB+OCBtIHNwYWNpbmcgd2l0aCBhXG4gIC8vIHNtYWxsIHNlZWRlZCBtZWFuZGVyIHNvIHRoZSBjaGFubmVsIGlzIG5vdCBhIHNtb290aCBzcGxpbmUuXG4gIGNvbnN0IGRlbnNlOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29udHJvbHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgY29uc3QgcDAgPSBjb250cm9sc1tNYXRoLm1heCgwLCBpIC0gMSldLCBwMSA9IGNvbnRyb2xzW2ldO1xuICAgIGNvbnN0IHAyID0gY29udHJvbHNbaSArIDFdLCBwMyA9IGNvbnRyb2xzW01hdGgubWluKGNvbnRyb2xzLmxlbmd0aCAtIDEsIGkgKyAyKV07XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCAyNDsgaysrKSB7XG4gICAgICBjb25zdCB0ID0gayAvIDI0LCB0MiA9IHQgKiB0LCB0MyA9IHQyICogdDtcbiAgICAgIGRlbnNlLnB1c2goe1xuICAgICAgICB4OiAwLjUgKiAoMiAqIHAxLnggKyAoLXAwLnggKyBwMi54KSAqIHQgKyAoMiAqIHAwLnggLSA1ICogcDEueCArIDQgKiBwMi54IC0gcDMueCkgKiB0MlxuICAgICAgICAgICsgKC1wMC54ICsgMyAqIHAxLnggLSAzICogcDIueCArIHAzLngpICogdDMpLFxuICAgICAgICB6OiAwLjUgKiAoMiAqIHAxLnogKyAoLXAwLnogKyBwMi56KSAqIHQgKyAoMiAqIHAwLnogLSA1ICogcDEueiArIDQgKiBwMi56IC0gcDMueikgKiB0MlxuICAgICAgICAgICsgKC1wMC56ICsgMyAqIHAxLnogLSAzICogcDIueiArIHAzLnopICogdDMpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGRlbnNlLnB1c2goY29udHJvbHNbY29udHJvbHMubGVuZ3RoIC0gMV0pO1xuICBjb25zdCByZXNhbXBsZWQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHM6IG51bWJlciB9PiA9IFt7IC4uLmRlbnNlWzBdLCBzOiAwIH1dO1xuICBsZXQgYWNjID0gMCwgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgZGVuc2UubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5oeXBvdChkZW5zZVtpXS54IC0gZGVuc2VbaSAtIDFdLngsIGRlbnNlW2ldLnogLSBkZW5zZVtpIC0gMV0ueik7XG4gICAgYWNjICs9IHN0ZXA7IHMgKz0gc3RlcDtcbiAgICBpZiAoYWNjID49IDggfHwgaSA9PT0gZGVuc2UubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbSA9IChmYm0yKHMgLyA2MCwgMy4xLCBzZWVkICsgODAxLCAyKSAtIDAuNSkgKiAxNDtcbiAgICAgIHJlc2FtcGxlZC5wdXNoKHsgeDogZGVuc2VbaV0ueCArIG0sIHo6IGRlbnNlW2ldLnosIHMgfSk7XG4gICAgICBhY2MgPSAwO1xuICAgIH1cbiAgfVxuICBjb25zdCB0b3RhbCA9IHJlc2FtcGxlZFtyZXNhbXBsZWQubGVuZ3RoIC0gMV0ucztcbiAgY29uc3QgbGV2ZWxBdCA9IChzdjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBsZXQgbGV2ZWwgPSBzdiAqIFVQUEVSX0dSQURJRU5UO1xuICAgIGZvciAoY29uc3QgW2ZyYWMsIGRyb3BdIG9mIEZBTExTKSB7XG4gICAgICAvLyBFYWNoIGZhbGwgaXMgYSBzaG9ydCBjYXNjYWRlIG92ZXIgfjEwIG0gb2YgY2hhbm5lbC5cbiAgICAgIGxldmVsICs9IGRyb3AgKiBzbW9vdGhzdGVwKHRvdGFsICogZnJhYyAtIDUsIHRvdGFsICogZnJhYyArIDUsIHN2KTtcbiAgICB9XG4gICAgLy8gVGhlIGZpcnN0IDQwIG0gaW50byB0aGUgbGFrZSBzdGF5cyBhdCBsYWtlIGxldmVsLlxuICAgIHJldHVybiBzdiA8IDQwID8gMCA6IGxldmVsIC0gNDAgKiBVUFBFUl9HUkFESUVOVDtcbiAgfTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSByZXNhbXBsZWQubWFwKChwKSA9PiAoe1xuICAgIHg6IHAueCwgejogcC56LCBzOiBwLnMsIGxldmVsOiBNYXRoLm1heCgwLCBsZXZlbEF0KHAucykpLFxuICAgIHdpZHRoOiAzLjIgKyAyLjIgKiBmYm0yKHAucyAvIDcwLCA5LjcsIHNlZWQgKyA4MDIsIDIpICsgKDEgLSBwLnMgLyB0b3RhbCkgKiAxLjUsXG4gIH0pKTtcbiAgY29uc3Qgc291cmNlID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIHtcbiAgICByZWFjaDogbmV3IFJpdmVyUmVhY2gocG9pbnRzLCAxMTApLFxuICAgIHRhcm46IHsgeDogc291cmNlLngsIHo6IHNvdXJjZS56LCByOiAxOCwgbGV2ZWw6IHNvdXJjZS5sZXZlbCB9LFxuICB9O1xufVxuIiwgIi8vIFZveGVsIG1hdGVyaWFsIGlkcy4gUHVyZSBkYXRhIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllciAoRC0wMDUpLlxuLy8gSWRzIGFyZSBwZXJzaXN0ZWQgaW4gc25hcHNob3QgZWRpdHMsIHNvIGV4aXN0aW5nIHZhbHVlcyBtdXN0IG5ldmVyIGNoYW5nZS5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG4gIC8qKiBHZW5lcmF0b3IgdjIgaGlnaGxhbmRzLiBOZXZlciBwcm9kdWNlZCBieSBnZW5lcmF0b3IgdjEuICovXG4gIFNOT1c6IDEwLFxufSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIE1hdElkID0gKHR5cGVvZiBNQVQpW2tleW9mIHR5cGVvZiBNQVRdO1xuXG5leHBvcnQgY29uc3QgaXNTb2xpZCA9IChtOiBudW1iZXIpOiBib29sZWFuID0+IG0gIT09IE1BVC5BSVIgJiYgbSAhPT0gTUFULldBVEVSO1xuZXhwb3J0IGNvbnN0IGlzT3BhcXVlID0gaXNTb2xpZDtcblxuLyoqIEhpZ2hlc3QgbWF0ZXJpYWwgaWQgdGhhdCBtYXkgYXBwZWFyIGluIGEgdm94ZWwgZWRpdC4gKi9cbmV4cG9ydCBjb25zdCBNQVhfTUFUX0lEID0gMTA7XG4iLCAiLy8gVGVycmFpbiBnZW5lcmF0b3IgdjIgXHUyMDE0IHRoZSB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IChwdXJlIFRTLCBELTAwNSkuXG4vL1xuLy8gQ29tcGF0aWJpbGl0eSBjb250cmFjdDogaW5zaWRlIHRoZSBmb3VuZGVyIGNvcnJpZG9yICh0aGUgc2V0dGxlbWVudCB2YWxsZXksXG4vLyB0aGUgbGFrZSBhbmQgdGhlIGxvd2xhbmQgcml2ZXIpIHYyIGhlaWdodHMgZXF1YWwgdjEgZXhhY3RseSwgc28gdGhlIHBpbm5lZFxuLy8gZm91bmRlciBwcm9qZWN0cywgdGhlaXIgcHJlcGFyYXRpb24gdGFyZ2V0cyBhbmQgbmF0dXJhbCBlbnRpdGllcyB0aGVyZSBhcmVcbi8vIHVuY2hhbmdlZC4gT3V0c2lkZSBpdCB2MiBhZGRzOlxuLy8gICAtIGEgbm9ydGhlcm4gbWFzc2lmIG9uIGFuIGV4dGVuZGVkIGlzbGFuZCwgd2l0aCBzbm93IGFib3ZlIHRoZSBzbm93bGluZTtcbi8vICAgLSBmbGFua2luZyByYW5nZXMgd2VzdCBhbmQgZWFzdCBvZiB0aGUgdmFsbGV5LCB0ZXJyYWNlZCBpbnRvIGNsaWZmIGJhbmRzO1xuLy8gICAtIGEgbW91bnRhaW4gcml2ZXIgY2FydmVkIGludG8gdGhlIG1hc3NpZiBmcm9tIGEgdGFybiBkb3duIHRvIHRoZSBsYWtlLFxuLy8gICAgIHdob3NlIHdhdGVyIHN1cmZhY2UgY29tZXMgZnJvbSBIeWRyb2xvZ3kgYW5kIG5ldmVyIHJpc2VzIGRvd25zdHJlYW07XG4vLyAgIC0gYSBjb250aW51b3VzIGxvd2xhbmQgY2hhbm5lbCAodjEgaGFzIGEgZHJ5IGZvcmQgc291dGggb2YgdGhlIHNoZWxmKS5cbi8vIEhlaWdodHMgYXJlIGludGVnZXJzIGluIFstMTQsIDEwNF0uXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbGVycCwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHsgTUFULCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcblxuZXhwb3J0IGNvbnN0IFYyX1NOT1dMSU5FID0gNzQ7XG5leHBvcnQgY29uc3QgVjJfTUFYX0hFSUdIVCA9IDEwNDtcblxuZXhwb3J0IHR5cGUgVjFIZWlnaHQgPSAoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFYyQ29sdW1uIHtcbiAgLyoqIFRvcCBzb2xpZCB5ICsgMSAoc2FtZSBjb252ZW50aW9uIGFzIHN1cmZhY2VIZWlnaHRBdCkuICovXG4gIGg6IG51bWJlcjtcbiAgLyoqIFdhdGVyIHN1cmZhY2UgZm9yIHRoaXMgY29sdW1uOiBjZWxscyBbaCwgbGV2ZWwpIGhvbGQgd2F0ZXIuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBjb2x1bW4gaXMgcGFydCBvZiB0aGUgY2FydmVkIG1vdW50YWluLXJpdmVyIGNoYW5uZWwuICovXG4gIGNoYW5uZWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJyYWluVjIge1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSBzZWVkOiBudW1iZXIsXG4gICAgcHJpdmF0ZSByZWFkb25seSB2MTogVjFIZWlnaHQsXG4gICAgcmVhZG9ubHkgaHlkcm9sb2d5OiBIeWRyb2xvZ3ksXG4gICkge31cblxuICAvKiogMCA9IGV4YWN0bHkgdjEgKGZvdW5kZXIgY29ycmlkb3IpOyAxID0gZnVsbCB2MiByZWxpZWYuICovXG4gIHJlbGllZk1hc2soeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtMzkwLCAtNDcwLCB6KTtcbiAgICAvLyBUaGUgd2VzdCByYW5nZSBrZWVwcyBjbGVhciBvZiB0aGUgbGFrZSBiYXNpbiB1bnRpbCB0aGUgbGFrZSBpcyBwYXNzZWQuXG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlLCB3ZXN0RWRnZSAtIDkwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyMzAsIDMzMCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIC8qKiAwIGF0IHRoZSByYW5nZSBmcm9udCwgMSBkZWVwIGluc2lkZTogZm9vdGhpbGxzIGZpcnN0LCBwZWFrcyBiZWhpbmQuICovXG4gIHJhbmdlRGVwdGgoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtNDIwLCAtNzAwLCB6KTtcbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UgLSA0MCwgd2VzdEVkZ2UgLSAzMDAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDI3MCwgNTYwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVjJDb2x1bW4ge1xuICAgIGNvbnN0IHNlZWQgPSB0aGlzLnNlZWQ7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMudjEoc2VlZCwgeCwgeik7XG4gICAgY29uc3QgbWFzayA9IHRoaXMucmVsaWVmTWFzayh4LCB6KTtcbiAgICBsZXQgaCA9IGJhc2U7XG5cbiAgICBpZiAobWFzayA+IDApIHtcbiAgICAgIC8vIEV4dGVuZCB0aGUgaXNsYW5kIG5vcnRoIHNvIHRoZSBtYXNzaWYgaGFzIHJvb20gKHYxIGNvYXN0IGlzIH56IC02MDApLlxuICAgICAgY29uc3Qgbm9ydGhMYW5kID0gc21vb3Roc3RlcCgtNDIwLCAtNTIwLCB6KTtcbiAgICAgIGNvbnN0IHNob3JlID0gMSAtIE1hdGguaHlwb3QoKHggKyAxNTApIC8gNTYwLCAoeiArIDY5MCkgLyAzMDApXG4gICAgICAgICsgKGZibTIoeCAvIDE2MCwgeiAvIDE2MCwgc2VlZCArIDcwMSwgMykgLSAwLjUpICogMC4zO1xuICAgICAgY29uc3QgbGFuZE4gPSBzbW9vdGhzdGVwKDAuMCwgMC4xNCwgc2hvcmUpICogbm9ydGhMYW5kO1xuICAgICAgY29uc3QgZ3JvdW5kID0gbGVycChiYXNlLCBNYXRoLm1heChiYXNlLCA1ICsgNSAqIGZibTIoeCAvIDkwLCB6IC8gOTAsIHNlZWQgKyA3MDIsIDIpKSwgbGFuZE4pO1xuXG4gICAgICAvLyBSaWRnZWQgbWFzc2lmIHdpdGggdGVycmFjZWQgY2xpZmYgYmFuZHMuXG4gICAgICBjb25zdCB3eCA9IHggKyAoZmJtMih4IC8gMjYwLCB6IC8gMjYwLCBzZWVkICsgNzAzLCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCB3eiA9IHogKyAoZmJtMih4IC8gMjYwICsgNS4xLCB6IC8gMjYwIC0gMi43LCBzZWVkICsgNzA0LCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCByMSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIxMCwgd3ogLyAyMTAsIHNlZWQgKyA3MDUsIDQpIC0gMSk7XG4gICAgICBjb25zdCByMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDgwLCB3eiAvIDgwLCBzZWVkICsgNzA2LCAzKSAtIDEpO1xuICAgICAgY29uc3QgbHVtcCA9IGZibTIod3ggLyAxMjAsIHd6IC8gMTIwLCBzZWVkICsgNzA3LCAzKTtcbiAgICAgIGNvbnN0IGRlcHRoID0gdGhpcy5yYW5nZURlcHRoKHgsIHopO1xuICAgICAgbGV0IG1vdW50YWluID0gMTYgKyAoOCArIDgwICogZGVwdGgpICogKDAuNTUgKiByMSAqIHIxICsgMC4yOCAqIHIyICsgMC4xNyAqIGx1bXApXG4gICAgICAgICsgMTggKiBkZXB0aCAqIHNtb290aHN0ZXAoMC41NSwgMC45LCByMSk7XG4gICAgICBjb25zdCBiYW5kID0gNiArIDIgKiBmYm0yKHggLyAxNDAsIHogLyAxNDAsIHNlZWQgKyA3MDgsIDIpO1xuICAgICAgY29uc3QgdCA9IE1hdGguZmxvb3IobW91bnRhaW4gLyBiYW5kKTtcbiAgICAgIGNvbnN0IGZyYWMgPSBtb3VudGFpbiAvIGJhbmQgLSB0O1xuICAgICAgbW91bnRhaW4gPSAodCArIHNtb290aHN0ZXAoMC41LCAwLjgsIGZyYWMpKSAqIGJhbmQ7XG5cbiAgICAgIC8vIE9ubHkgbGFuZCByaXNlczsgdGhlIHNlYSBzdGF5cyBzZWEsIHNvIHJhbmdlcyBlbmQgaW4gY29hc3RhbCBjbGlmZnMuXG4gICAgICBjb25zdCBsYW5kRmFjdG9yID0gc21vb3Roc3RlcCgtMiwgOCwgZ3JvdW5kKTtcbiAgICAgIGggPSBsZXJwKGdyb3VuZCwgTWF0aC5tYXgoZ3JvdW5kLCBtb3VudGFpbiksIG1hc2sgKiBsYW5kRmFjdG9yKTtcbiAgICB9XG5cbiAgICBsZXQgbGV2ZWwgPSBoIDwgMCA/IDAgOiAtSW5maW5pdHk7XG4gICAgbGV0IGNoYW5uZWwgPSBmYWxzZTtcblxuICAgIC8vIE1vdW50YWluIHJpdmVyOiB2YWxsZXkgZmxvb3IsIGJhbmtzIGFuZCBjaGFubmVsIGZvbGxvdyB0aGUgd2F0ZXIgbGV2ZWwuXG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIGNvbnN0IHJhaXNlZCA9IGhpdC5sZXZlbCA+IDAuMjU7XG4gICAgICAgIGNvbnN0IHZ3ID0gNTUgKyAyOCAqIGZibTIoaGl0LnMgLyA5MCwgMS43LCBzZWVkICsgNzA5LCAyKTtcbiAgICAgICAgY29uc3QgZmxvb3IgPSBoaXQubGV2ZWwgKyAxLjUgKyAyLjIgKiBmYm0yKHggLyA0MCwgeiAvIDQwLCBzZWVkICsgNzEwLCAyKSArIGhpdC5kICogMC4wNjtcbiAgICAgICAgY29uc3QgdCA9IHNtb290aHN0ZXAodncgKiAwLjMsIHZ3LCBoaXQuZCk7XG4gICAgICAgIGggPSBNYXRoLm1pbihoLCBsZXJwKGZsb29yLCBoLCB0KSk7XG4gICAgICAgIGNvbnN0IHcgPSBoaXQud2lkdGg7XG4gICAgICAgIGlmIChyYWlzZWQgJiYgaGl0LmQgPCB3ICsgMykge1xuICAgICAgICAgIC8vIEJhbmtzIGhvbGQgYSByYWlzZWQgcml2ZXI6IG5ldmVyIGJlbG93IGl0cyB3YXRlciBzdXJmYWNlLiBBdCBsYWtlXG4gICAgICAgICAgLy8gbGV2ZWwgdGhlIHNlYS1sZXZlbCBmaWxsIGFscmVhZHkgY29udGFpbnMgdGhlIHdhdGVyLlxuICAgICAgICAgIGggPSBNYXRoLm1heChoLCBNYXRoLmNlaWwoaGl0LmxldmVsKSArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoaXQuZCA8IHcpIHtcbiAgICAgICAgICBjb25zdCBiZWQgPSBoaXQubGV2ZWwgLSAoMS4yICsgMS4zICogKDEgLSBoaXQuZCAvIHcpKTtcbiAgICAgICAgICBoID0gTWF0aC5taW4oaCwgYmVkKTtcbiAgICAgICAgICBpZiAocmFpc2VkKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKGhpdC5sZXZlbCkpO1xuICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCB0YXJuID0gdGhpcy5oeWRyb2xvZ3kudGFybjtcbiAgICAgIGlmICh0YXJuKSB7XG4gICAgICAgIGNvbnN0IHRkID0gTWF0aC5oeXBvdCh4IC0gdGFybi54LCB6IC0gdGFybi56KVxuICAgICAgICAgICogKDEgKyAwLjIgKiAoZmJtMih4IC8gMzAsIHogLyAzMCwgc2VlZCArIDcxMSwgMikgLSAwLjUpKTtcbiAgICAgICAgaWYgKHRkIDwgdGFybi5yICsgNikge1xuICAgICAgICAgIGNvbnN0IHJpbSA9IE1hdGguY2VpbCh0YXJuLmxldmVsKSArIDE7XG4gICAgICAgICAgaWYgKHRkID49IHRhcm4ucikgaCA9IE1hdGgubWF4KGgsIHJpbSk7XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBoID0gTWF0aC5taW4oTWF0aC5tYXgoaCwgcmltKSwgdGFybi5sZXZlbCAtIDEgLSAzICogc21vb3Roc3RlcCh0YXJuLnIsIDAsIHRkKSk7XG4gICAgICAgICAgICBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKHRhcm4ubGV2ZWwpKTtcbiAgICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExvd2xhbmQgY2hhbm5lbCBjb250aW51aXR5OiB2MSBsZWF2ZXMgYSBkcnkgZm9yZCB3aGVyZSB0aGUgc2hlbGYgbWVldHMgdGhlIHJpdmVyLlxuICAgIGNvbnN0IGxvdyA9IHRoaXMuaHlkcm9sb2d5Lmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8IDIuNSAmJiBoID49IDAgJiYgYmFzZSA8IDQpIGggPSAtMTtcblxuICAgIGggPSBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgVjJfTUFYX0hFSUdIVCkpO1xuICAgIGlmIChoIDwgMCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgMCk7XG4gICAgcmV0dXJuIHsgaCwgbGV2ZWw6IGxldmVsID09PSAtSW5maW5pdHkgPyBoIDogbGV2ZWwsIGNoYW5uZWwgfTtcbiAgfVxuXG4gIGhlaWdodCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY29sdW1uKHgsIHopLmg7XG4gIH1cblxuICAvKiogdjIgdG9wIG1hdGVyaWFsLiBGYWxscyBiYWNrIHRvIHRoZSB2MSBydWxlcyBmb3IgdGhlIHVuY2hhbmdlZCBjb3JyaWRvci4gKi9cbiAgdG9wTWF0ZXJpYWwoXG4gICAgeDogbnVtYmVyLCB6OiBudW1iZXIsIGNvbDogVjJDb2x1bW4sIHNsb3BlOiBudW1iZXIsXG4gICAgdjFUb3A6IChoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIpID0+IE1hdElkLFxuICApOiBNYXRJZCB7XG4gICAgY29uc3QgaCA9IGNvbC5oO1xuICAgIGlmIChjb2wuY2hhbm5lbCAmJiBjb2wubGV2ZWwgPiBoKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlciAmJiBoID4gMSkge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPCBoaXQud2lkdGggKyAyLjUgJiYgaGl0LmxldmVsID4gMC4yNSkge1xuICAgICAgICByZXR1cm4gZmJtMih4IC8gNiwgeiAvIDYsIHRoaXMuc2VlZCArIDcxMiwgMSkgPiAwLjUgPyBNQVQuR1JBVkVMIDogTUFULlNBTkQ7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNub3dsaW5lID0gVjJfU05PV0xJTkUgKyAoZmJtMih4IC8gNzAsIHogLyA3MCwgdGhpcy5zZWVkICsgNzEzLCAzKSAtIDAuNSkgKiAxNjtcbiAgICBpZiAoaCA+PSBzbm93bGluZSAmJiBzbG9wZSA8PSAzKSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgLSA2ICYmIHNsb3BlIDw9IDEgJiYgZmJtMih4IC8gMjAsIHogLyAyMCwgdGhpcy5zZWVkICsgNzE0LCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAodGhpcy5yZWxpZWZNYXNrKHgsIHopID4gMC41ICYmIGggPiAzMCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICAgIHJldHVybiB2MVRvcChoLCBzbG9wZSk7XG4gIH1cbn1cbiIsICIvLyBTaW11bGF0aW9uIGxheWVyIFx1MjAxNCBwdXJlIFR5cGVTY3JpcHQsIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAxIHdvcmxkIGZvdW5kYXRpb246IGEgY2h1bmtlZCwgZ2VudWluZWx5IHRocmVlLWRpbWVuc2lvbmFsIHZveGVsIHdvcmxkLlxuLy8gVGhlIHN0b3JlZCBzdGF0ZSBpcyBvbmUgbWF0ZXJpYWwgYnl0ZSBwZXIgY2VsbCAoMCA9IGFpcik7IG9jY3VwYW5jeSBpc1xuLy8gaW1wbGljaXQuIFN1cmZhY2UgaGVpZ2h0IGlzIGEgZGVyaXZlZCBxdWVyeSwgbm90IHRoZSBzdG9yYWdlLiBUaGlzIHJlcGxhY2VzXG4vLyB0aGUgZm9ybWVyIDI1NiB4IDI1NiBoZWlnaHRmaWVsZCAoc2VlIElSLTAwNSkuXG4vL1xuLy8gV29ybGQgbWV0cmVzOiB4L3ogaW4gWy0xMDI0LCAxMDI0KSwgeSBpbiBbLTE2LCAxMTIpLCBzZWEgbGV2ZWwgMC5cbi8vIEEgY2h1bmsgaXMgMzIgeCAzMiB4IDEyOCBjZWxscy4gR2VuZXJhdGlvbiBpcyBhIHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQsXG4vLyBnZW5lcmF0b3IgdmVyc2lvbiwgcGFyYW1ldGVycyBhbmQgY2h1bmsgY29vcmRpbmF0ZXM7IGVkaXRzIGFyZSByZWNvcmRlZFxuLy8gc2VwYXJhdGVseSBhbmQgcmUtYXBwbGllZCB3aGVuIGEgY2h1bmsgaXMgcmVnZW5lcmF0ZWQuXG5pbXBvcnQgdHlwZSB7IFN0cnVjdHVyZSB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQgdHlwZSB7IExpZmVTdGF0ZSB9IGZyb20gJy4vZWNvbm9teSc7XG5pbXBvcnQgeyBpc1N0b25lUmVwbGF5IH0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuaW1wb3J0IHsgSHlkcm9sb2d5IH0gZnJvbSAnLi9oeWRyb2xvZ3knO1xuaW1wb3J0IHsgVGVycmFpblYyLCBWMkNvbHVtbiB9IGZyb20gJy4vdGVycmFpbi12Mic7XG5cbmV4cG9ydCBjb25zdCBXT1JMRF9TSVpFID0gMjA0ODtcbmV4cG9ydCBjb25zdCBIQUxGID0gV09STERfU0laRSAvIDI7XG5leHBvcnQgY29uc3QgQ0hVTktfU0laRSA9IDMyO1xuZXhwb3J0IGNvbnN0IENIVU5LU19QRVJfU0lERSA9IFdPUkxEX1NJWkUgLyBDSFVOS19TSVpFO1xuZXhwb3J0IGNvbnN0IFlfTUlOID0gLTE2O1xuZXhwb3J0IGNvbnN0IFlfTUFYID0gMTEyO1xuZXhwb3J0IGNvbnN0IFdPUkxEX0hFSUdIVCA9IFlfTUFYIC0gWV9NSU47XG5leHBvcnQgY29uc3QgU0VBX0xFVkVMID0gMDtcbmV4cG9ydCBjb25zdCBXQVRFUiA9IFNFQV9MRVZFTDtcbi8qKiBHZW5lcmF0b3IgdjE6IHRoZSBvcmlnaW5hbCAyMDQ4IG0gaXNsYW5kLiBEZWZhdWx0IGZvciBjcmVhdGVXb3JsZCBhbmQgYWxsIGxlZ2FjeSBzYXZlcy4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVkVSU0lPTiA9IDE7XG4vKiogR2VuZXJhdG9yIHYyOiB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IHdpdGggYSBtb3VudGFpbiByaXZlciAoc2VlIHRlcnJhaW4tdjIudHMpLiAqL1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WMiA9IDI7XG4vKiogVGhlIGdlbmVyYXRvciBuZXcgYnJvd3NlciB3b3JsZHMgdXNlIGJ5IGRlZmF1bHQuICovXG5leHBvcnQgY29uc3QgTEFURVNUX0dFTkVSQVRPUl9WRVJTSU9OID0gR0VORVJBVE9SX1YyO1xuZXhwb3J0IGNvbnN0IFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlM6IHJlYWRvbmx5IG51bWJlcltdID0gW0dFTkVSQVRPUl9WRVJTSU9OLCBHRU5FUkFUT1JfVjJdO1xuZXhwb3J0IGNvbnN0IGlzU3VwcG9ydGVkR2VuZXJhdG9yID0gKHY6IHVua25vd24pOiB2IGlzIG51bWJlciA9PlxuICB0eXBlb2YgdiA9PT0gJ251bWJlcicgJiYgU1VQUE9SVEVEX0dFTkVSQVRPUl9WRVJTSU9OUy5pbmNsdWRlcyh2KTtcbmV4cG9ydCBjb25zdCBDSFVOS19WT0xVTUUgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRSAqIFdPUkxEX0hFSUdIVDtcbmV4cG9ydCBjb25zdCBDSFVOS19BUkVBID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkU7XG5cbmV4cG9ydCB7IE1BVCwgaXNTb2xpZCwgaXNPcGFxdWUsIE1BWF9NQVRfSUQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5leHBvcnQgdHlwZSB7IE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuaW1wb3J0IHsgTUFULCBpc1NvbGlkLCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcblxuZXhwb3J0IHtcbiAgY2xhbXAsIGxlcnAsIGhhc2gyaSwgaGFzaDNpLCBtdWxiZXJyeTMyLCBmYm0yLFxufSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBzbW9vdGhzdGVwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgdmFsdWVOb2lzZTMsIGZibTIsIGZibTMsXG59IGZyb20gJy4vbm9pc2UnO1xuXG4vLyAtLS0tLS0tLS0tIHdvcmxkIHR5cGVzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRQYXJhbXMge1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9QQVJBTVM6IFdvcmxkUGFyYW1zID0ge1xuICBzaXplOiBXT1JMRF9TSVpFLFxuICBjaHVua1NpemU6IENIVU5LX1NJWkUsXG4gIHlNaW46IFlfTUlOLFxuICB5TWF4OiBZX01BWCxcbiAgc2VhTGV2ZWw6IFNFQV9MRVZFTCxcbiAgZ2VuZXJhdG9yVmVyc2lvbjogR0VORVJBVE9SX1ZFUlNJT04sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBrZXk6IHN0cmluZztcbiAgLyoqIHggKyB6KjMyICsgKHktWV9NSU4pKjEwMjQgKi9cbiAgZGF0YTogVWludDhBcnJheTtcbiAgLyoqIHRvcCBzb2xpZCB5LCBlbmNvZGVkIGFzICh5IC0gWV9NSU4pLCAwLi4xMjc7IDAgbWVhbnMgbm8gc29saWQuICovXG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3AgbWF0ZXJpYWwgcGVyIGNvbHVtbi4gKi9cbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbiAgZGlydHk6IGJvb2xlYW47XG4gIGdlbmVyYXRlZEF0OiBudW1iZXI7XG59XG5cbi8vIE5hdHVyYWwgYXNzZXRzIGFyZSB0aGUgcHJvamVjdCdzIFN0eWwgKGBuYXRfYCkgcGlwZWxpbmUgKEFTLTAwMSB2MiksIG5vdFxuLy8gTm94ZWwgYXJjaGl0ZWN0dXJlLiBOb3hlbCByZW1haW5zIHRoZSBodW1hbi1tYWRlIGtpdC93YXlzdG9uZS9tYXJrZXIgc3lzdGVtLlxuLy8gUmV0aXJlZCBvbmx5IGFzIHdvcmxkIGNvbnRlbnQuIFRoZSBuYW1lcyByZW1haW4gaW4gdGhlIHNlcmlhbGl6ZWQgdHlwZSBzb1xuLy8gb2xkIHNuYXBzaG90cyBhbmQgYWNjZXB0ZWQgaGFydmVzdCBqb3VybmFscyBjYW4gYmUgbWlncmF0ZWQgd2l0aG91dCByZWplY3Rpbmdcbi8vIG90aGVyd2lzZSB2YWxpZCBzYXZlcy4gR2VuZXJhdGlvbiwgY29sbGlzaW9uIGFuZCBpbnNwZWN0aW9uIG5ldmVyIHVzZSB0aGVtLlxuZXhwb3J0IGNvbnN0IFJFVElSRURfU1RPTkVfS0lORFMgPSBuZXcgU2V0PEVudGl0eUtpbmQ+KFtcbiAgJ3N0eWxfcm9ja19zbWFsbCcsICdzdHlsX3JvY2tfbWVkaXVtJywgJ3N0eWxfcm9ja19sYXJnZScsXG5dKTtcbmV4cG9ydCBjb25zdCBpc1JldGlyZWRTdG9uZUtpbmQgPSAoa2luZDogRW50aXR5S2luZCk6IGJvb2xlYW4gPT4gUkVUSVJFRF9TVE9ORV9LSU5EUy5oYXMoa2luZCk7XG5leHBvcnQgdHlwZSBBY3RpdmVFbnRpdHlLaW5kID0gRXhjbHVkZTxFbnRpdHlLaW5kLFxuICAnc3R5bF9yb2NrX3NtYWxsJyB8ICdzdHlsX3JvY2tfbWVkaXVtJyB8ICdzdHlsX3JvY2tfbGFyZ2UnPjtcblxuZnVuY3Rpb24gbGl2ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBFbnRpdHkgfCBudWxsIHtcbiAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgcmV0dXJuICFlbnRpdHkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhpZCkgPyBudWxsIDogZW50aXR5O1xufVxuXG5leHBvcnQgdHlwZSBFbnRpdHlLaW5kID1cbiAgfCAnc3R5bF90cmVlX3NwaXJlJ1xuICB8ICdzdHlsX3RyZWVfdGFibGUnXG4gIHwgJ3N0eWxfdHJlZV9jbHVzdGVyJ1xuICB8ICdzdHlsX3RyZWVfYmxvc3NvbSdcbiAgfCAnc3R5bF9zaHJ1YidcbiAgfCAnc3R5bF9yb2NrX3NtYWxsJ1xuICB8ICdzdHlsX3JvY2tfbWVkaXVtJ1xuICB8ICdzdHlsX3JvY2tfbGFyZ2UnXG4gIHwgJ3N0eWxfb3JlJ1xuICB8ICdzdHlsX2NhaXJuJ1xuICB8ICd3YXlzdG9uZSdcbiAgfCAnbWFya2VyJztcblxuZXhwb3J0IHR5cGUgUmVzb3VyY2VUeXBlID0gJ3dvb2QnIHwgJ3N0b25lJyB8ICdvcmUnIHwgJ2ZpYmVyJztcblxuZXhwb3J0IGludGVyZmFjZSBFbnRpdHkge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICBjaHVuazogc3RyaW5nO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgc2NhbGU6IG51bWJlcjtcbiAgdmFyaWFudDogbnVtYmVyO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgcmVtYWluaW5nOiBudW1iZXI7XG4gIHlpZWxkUGVySGFydmVzdDogbnVtYmVyO1xuICAvKiogVHJ1ZSBvbmNlIHRoZSBlbnRpdHkgaXMgZnVsbHkgZGVwbGV0ZWQuICovXG4gIGhhcnZlc3RlZDogYm9vbGVhbjtcbiAgLyoqIFRydWUgYWZ0ZXIgdGhlIGZpcnN0IHN1Y2Nlc3NmdWwgaGFydmVzdCwgZXZlbiBpZiB5aWVsZCByZW1haW5zLiAqL1xuICBoYXJ2ZXN0ZWRPbmNlPzogYm9vbGVhbjtcbiAgcHJvdmlzaW9uYWw6IGJvb2xlYW47XG4gIGF1dGhvcmVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5veGVsU2l0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHByb3Zpc2lvbmFsOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZ2lvbkluZm8ge1xuICBpZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICB0eXBlOiAncGxhaW4nIHwgJ2ZvcmVzdCcgfCAnaGlsbHMnIHwgJ2hpZ2hsYW5kJyB8ICd3YXRlcicgfCAncmlkZ2UnO1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICByeDogbnVtYmVyO1xuICByejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkU3RhdHMge1xuICBjaHVua3NHZW5lcmF0ZWQ6IG51bWJlcjtcbiAgY2h1bmtzRXZpY3RlZDogbnVtYmVyO1xuICB2b3hlbHNGaWxsZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGlvbk1zOiBudW1iZXI7XG4gIGVudGl0aWVzOiBudW1iZXI7XG4gIHRyZWVzOiBudW1iZXI7XG4gIHBpbmtUcmVlczogbnVtYmVyO1xuICBwaW5rT3ZlcmZsb3c6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcGFyYW1zOiBXb3JsZFBhcmFtcztcbiAgY2h1bmtzOiBNYXA8c3RyaW5nLCBWb3hlbENodW5rPjtcbiAgZW50aXRpZXM6IE1hcDxzdHJpbmcsIEVudGl0eT47XG4gIGVudGl0eUNodW5rczogTWFwPHN0cmluZywgc3RyaW5nW10+O1xuICAvKiogQ2h1bmtzIHdob3NlIGRldGVybWluaXN0aWMgbmF0dXJhbC1lbnRpdHkgc3RhdGUgaGFzIGJlZW4gY2hhbmdlZC4gKi9cbiAgZW50aXR5Q2hhbmdlczogU2V0PHN0cmluZz47XG4gIC8qKiBUb21ic3RvbmVzIGZvciByZW1vdmVkIGRldGVybWluaXN0aWMgbmF0dXJhbCBlbnRpdGllcy4gKi9cbiAgZW50aXR5UmVtb3ZhbHM6IFNldDxzdHJpbmc+O1xuICAvKiogQXV0aG9yaXRhdGl2ZSBidWlsdCBzdHJ1Y3R1cmVzIChob3VzZSwgcGF0aCwgdGVycmFjZXMsIGNyb3BzKS4gKi9cbiAgc3RydWN0dXJlczogTWFwPHN0cmluZywgU3RydWN0dXJlPjtcbiAgc2l0ZXM6IE5veGVsU2l0ZVtdO1xuICByZWdpb25zOiBSZWdpb25JbmZvW107XG4gIC8qKiBjaHVuayBrZXkgLT4gbG9jYWwgdm94ZWwgaW5kZXggLT4gbWF0ZXJpYWwuIER1cmFibGUsIGNvbXBhY3QgZWRpdHMuICovXG4gIGVkaXRzOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCBudW1iZXI+PjtcbiAgLyoqIEdsb2JhbCBsb2NhbC1wbGF5ZXIgY2FycmllZCBiYWc7IGJvdW5kZWQgaW4gc2NoZW1hIDMsIGxlZ2FjeSBpbiAxLzIuICovXG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgLyoqIFByZXNlbnQgb25seSBhZnRlciBzY2hlbWEtMyBnZW5lc2lzL3Jlc3RvcmF0aW9uLiAqL1xuICBsaWZlPzogTGlmZVN0YXRlO1xuICBkaXJ0eTogU2V0PHN0cmluZz47XG4gIHN0YXRzOiBXb3JsZFN0YXRzO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqXG4gICAqIE1vbm90b25pYyByZXZpc2lvbiBvZiBhdXRob3JpdGF0aXZlIHN0YXRlICh2b3hlbHMgYW5kIGVudGl0aWVzKS4gRGVyaXZlZFxuICAgKiBjYWNoZXMga2V5ZWQgb24gdGhpcyB2YWx1ZSBhcmUgZGlzY2FyZGVkIGFmdGVyIGFuIGVkaXQ7IG1lc2gvbmF2aWdhdGlvblxuICAgKiByZXZpc2lvbnMgYXJlIHNlcGFyYXRlIGJlY2F1c2UgdGhleSBhcmUgZGVyaXZlZCwgbm90IHdvcmxkIHN0YXRlLlxuICAgKi9cbiAgcmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGNodW5rS2V5ID0gKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpID0+IGAke2N4fSwke2N6fWA7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5YID0gKGN4OiBudW1iZXIpID0+IGN4ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5aID0gKGN6OiBudW1iZXIpID0+IGN6ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgbG9jYWxJbmRleCA9IChseDogbnVtYmVyLCB5SW5kZXg6IG51bWJlciwgbHo6IG51bWJlcikgPT5cbiAgbHggKyBseiAqIENIVU5LX1NJWkUgKyB5SW5kZXggKiBDSFVOS19BUkVBO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ggPSAoeDogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh4ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtaID0gKHo6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeiArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWCA9ICh4OiBudW1iZXIpID0+IHggLSAod29ybGRUb0NodW5rWCh4KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxaID0gKHo6IG51bWJlcikgPT4geiAtICh3b3JsZFRvQ2h1bmtaKHopICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHlUb0luZGV4ID0gKHk6IG51bWJlcikgPT4geSAtIFlfTUlOO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGQoc2VlZCA9IDEzMzcsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgaWYgKCFpc1N1cHBvcnRlZEdlbmVyYXRvcihnZW5lcmF0b3JWZXJzaW9uKSkgdGhyb3cgbmV3IEVycm9yKGB1bnN1cHBvcnRlZCBnZW5lcmF0b3IgdmVyc2lvbiAke2dlbmVyYXRvclZlcnNpb259YCk7XG4gIHJldHVybiB7XG4gICAgc2VlZCxcbiAgICBwYXJhbXM6IHsgLi4uREVGQVVMVF9QQVJBTVMsIGdlbmVyYXRvclZlcnNpb24gfSxcbiAgICBjaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdGllczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNoYW5nZXM6IG5ldyBTZXQoKSxcbiAgICBlbnRpdHlSZW1vdmFsczogbmV3IFNldCgpLFxuICAgIHN0cnVjdHVyZXM6IG5ldyBNYXAoKSxcbiAgICBzaXRlczogW10sXG4gICAgcmVnaW9uczogUkVHSU9OUyxcbiAgICBlZGl0czogbmV3IE1hcCgpLFxuICAgIGludmVudG9yeToge30sXG4gICAgZGlydHk6IG5ldyBTZXQoKSxcbiAgICBzdGF0czoge1xuICAgICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICAgIGVudGl0aWVzOiAwLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gICAgfSxcbiAgICBhdXRob3JlZFBsYWNlZDogZmFsc2UsXG4gICAgcmV2aXNpb246IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBpbml0aWFsUmFkaXVzID0gMCwgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQsIGdlbmVyYXRvclZlcnNpb24pO1xuICBjb25zdCBjZW50cmUgPSBNYXRoLmZsb29yKENIVU5LU19QRVJfU0lERSAvIDIpO1xuICBmb3IgKGxldCBjeiA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN6IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN4IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN4KyspIHtcbiAgICAgIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgfVxuICB9XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuLy8gLS0tLS0tLS0tLSBnZW9ncmFwaHkgLS0tLS0tLS0tLVxuZXhwb3J0IGNvbnN0IFJFR0lPTlM6IFJlZ2lvbkluZm9bXSA9IFtcbiAgeyBpZDogJ2ZvdW5kZXInLCBsYWJlbDogJ0ZvdW5kZXIgdmFsbGV5JywgdHlwZTogJ3BsYWluJywgY3g6IDAsIGN6OiAwLCByeDogMTEwLCByejogODUgfSxcbiAgeyBpZDogJ2Vhc3R3b29kJywgbGFiZWw6ICdFYXN0d29vZCcsIHR5cGU6ICdmb3Jlc3QnLCBjeDogMjIwLCBjejogLTExMCwgcng6IDI2MCwgcno6IDIyMCB9LFxuICB7IGlkOiAnY3Jvd24nLCBsYWJlbDogJ0Nyb3duIGhpZ2hsYW5kcycsIHR5cGU6ICdoaWdobGFuZCcsIGN4OiAtMzYwLCBjejogLTMwMCwgcng6IDM4MCwgcno6IDMwMCB9LFxuICB7IGlkOiAnbGFrZScsIGxhYmVsOiAnTWlycm9yIGxha2UnLCB0eXBlOiAnd2F0ZXInLCBjeDogLTI2MCwgY3o6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9LFxuICB7IGlkOiAnc291dGhkb3ducycsIGxhYmVsOiAnU291dGggZG93bnMnLCB0eXBlOiAnaGlsbHMnLCBjeDogMTIwLCBjejogMzMwLCByeDogMjYwLCByejogMTkwIH0sXG4gIHsgaWQ6ICd3ZXN0cmlzZScsIGxhYmVsOiAnV2VzdCByaXNlJywgdHlwZTogJ2hpbGxzJywgY3g6IC0zNjAsIGN6OiAxMjAsIHJ4OiAyMjAsIHJ6OiAyMTAgfSxcbiAgeyBpZDogJ2NvYXN0JywgbGFiZWw6ICdCcm9rZW4gY29hc3QnLCB0eXBlOiAncmlkZ2UnLCBjeDogMCwgY3o6IDAsIHJ4OiA3ODAsIHJ6OiA2NjAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckNlbnRlclgoejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVGhlIHJpdmVyIHJ1bnMgbm9ydGhcdTIwMTNzb3V0aCBhYm91dCA3MFx1MjAxMzExMCBtIHdlc3Qgb2YgdGhlIGZvdW5kZXIgc2hlbGYsIHNvXG4gIC8vIHRoZSBkZWZhdWx0IG5vcnRoLXdlc3QgdmlldyBoYXMgd2F0ZXIsIGEgbmVhciBiYW5rIGFuZCBhIGZhciBiYW5rLlxuICByZXR1cm4gLTkwICsgNTUgKiBNYXRoLnNpbigoeiArIDEwMCkgLyAyNDApICsgMTggKiBNYXRoLnNpbigoeiAtIDIwKSAvIDgwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5hYnMoeCAtIHJpdmVyQ2VudGVyWCh6KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsYWtlRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5zcXJ0KCgoeCArIDI2MCkgLyAxMjApICoqIDIgKyAoKHogKyAyMzApIC8gOTUpICoqIDIpO1xufVxuXG4vKipcbiAqIEludGVnZXIgdG9wIHNvbGlkIHkgb2YgdGhlIGJhc2UgZ2VuZXJhdGVkIHN1cmZhY2UgKG5vIGVkaXRzL292ZXJoYW5ncykuXG4gKlxuICogVGhpcyBpcyB0aGUgKnNoYXBlKiB0aGUgdm94ZWwgdm9sdW1lIGlzIGZpbGxlZCBmcm9tLCBub3QgdGhlIHN0b3JlZCB3b3JsZC5cbiAqIFRoZSBpbXBvcnRhbnQgY29ycmVjdGlvbiBvdmVyIHRoZSBmaXJzdCBNMDAxIHBhc3MgaXMgdGhhdCB0aGUgbGFuZHNjYXBlIGlzXG4gKiBub3Qgb25lIHNtb290aCByYWRpYWwgYm93bDogaXQgaXMgYSB3YXJwZWQgbXVsdGktc2NhbGUgc3VyZmFjZSB3aXRoIGEgYnJvYWRcbiAqIHJpdmVyIHZhbGxleSwgYSBzbWFsbCBidWlsZGFibGUgc2hlbGYsIGFuZCByaWRnZWQgaGlnaGxhbmRzLiBBIHNoYWxsb3dcbiAqIHNtb290aCBzdXJmYWNlIHF1YW50aXNlZCB0byAxIG0gdm94ZWxzIGlzIHdoYXQgcHJvZHVjZWQgdGhlIGNvbmNlbnRyaWNcbiAqIGNvbnRvdXIgcmluZ3M7IHZhcmllZCByZWxpZWYgYW5kIGEgcml2ZXIgdmFsbGV5IGJyZWFrIHRoZW0gbmF0dXJhbGx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUd28tc2NhbGUgZG9tYWluIHdhcnAuIFRoZSBicm9hZCB3YXJwIG1vdmVzIGNvYXN0bGluZXMgYW5kIGhpbGxzOyB0aGVcbiAgLy8gc21hbGwgd2FycCBrZWVwcyB0aGUgMSBtIHF1YW50aXNhdGlvbiBmcm9tIGZvbGxvd2luZyBjbGVhbiBjb250b3Vycy5cbiAgY29uc3Qgd3ggPSB4XG4gICAgKyAoZmJtMih4IC8gNDIwLCB6IC8gNDIwLCBzZWVkICsgMTAxLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSwgeiAvIDk1LCBzZWVkICsgMTAyLCAyKSAtIDAuNSkgKiAzMDtcbiAgY29uc3Qgd3ogPSB6XG4gICAgKyAoZmJtMih4IC8gNDIwICsgNy4zLCB6IC8gNDIwIC0gMy4xLCBzZWVkICsgMTAzLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSArIDMuNywgeiAvIDk1IC0gOC4xLCBzZWVkICsgMTA0LCAyKSAtIDAuNSkgKiAzMDtcblxuICBjb25zdCByYWRpYWwgPSBNYXRoLnNxcnQoKHd4IC8gNzgwKSAqKiAyICsgKHd6IC8gNjYwKSAqKiAyKTtcbiAgY29uc3QgY29hc3ROb2lzZSA9IChmYm0yKHd4IC8gMzAwLCB3eiAvIDMwMCwgc2VlZCArIDEwNSwgNCkgLSAwLjUpICogMC4zNFxuICAgICsgKGZibTIod3ggLyA5NSwgd3ogLyA5NSwgc2VlZCArIDEwNiwgMikgLSAwLjUpICogMC4xMDtcbiAgY29uc3QgbGFuZG5lc3MgPSAxLjAgLSByYWRpYWwgKyBjb2FzdE5vaXNlO1xuICBjb25zdCBpbmxhbmQgPSBzbW9vdGhzdGVwKC0wLjAzLCAwLjEyLCBsYW5kbmVzcyk7XG5cbiAgY29uc3Qgb2NlYW5GbG9vciA9IC0xMyArIDYgKiBmYm0yKHd4IC8gMTcwLCB3eiAvIDE3MCwgc2VlZCArIDEwNywgMyk7XG5cbiAgLy8gUm9sbGluZyBsYW5kIGF0IHRocmVlIHNjYWxlcy4gVGhlIDQwIG0gYW5kIDE1IG0gY29tcG9uZW50cyBhcmUgcmVhbFxuICAvLyBzdXJmYWNlIGhlaWdodCwgbm90IGEgcmVuZGVyIGRlY29yYXRpb24sIHNvIHRoZSBtYWNybyBzYW1wbGVyIGFncmVlcy5cbiAgY29uc3Qgc3dlbGwgPSA0ICsgMTEgKiBmYm0yKHd4IC8gMzQwLCB3eiAvIDM0MCwgc2VlZCArIDEwOCwgNCk7XG4gIGNvbnN0IGhpbGxzID0gOCAqIGZibTIod3ggLyAxMTUsIHd6IC8gMTE1LCBzZWVkICsgMTA5LCAzKTtcbiAgY29uc3QgYnVtcHMgPSAyLjIgKiBmYm0yKHggLyA0MiwgeiAvIDQyLCBzZWVkICsgMTEwLCAyKVxuICAgICsgMC45ICogZmJtMih4IC8gMTUsIHogLyAxNSwgc2VlZCArIDExMSwgMik7XG5cbiAgLy8gUmlkZ2VkIGhpZ2hsYW5kcy4gVGhlIG1hc3NpZiBtYXNrIGlzIHJlZ2lvbmFsIGFuZCBiaWFzZWQgdG8gdGhlXG4gIC8vIG5vcnRoLXdlc3Q7IHdpdGhvdXQgdGhlIHJlZ2lvbmFsIGdhdGUgdGhlIGZpcnN0IE0wMDEgcGFzcyByYWlzZWQgYSA0OCBtXG4gIC8vIG1vdW50YWluIGRpcmVjdGx5IHVuZGVyIHRoZSBmb3VuZGVyIHNoZWxmLlxuICBjb25zdCBtYXNzaWZOb2lzZSA9IGZibTIod3ggLyA0ODAgKyAxMSwgd3ogLyA0ODAgLSA3LCBzZWVkICsgMTEyLCA0KTtcbiAgY29uc3QgbWFzc2lmTWFzayA9IHNtb290aHN0ZXAoMC42MCwgMC43OCwgbWFzc2lmTm9pc2UpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIzMCwgd3ogLyAyMzAsIHNlZWQgKyAxMTMsIDQpIC0gMSk7XG4gIGNvbnN0IHJpZGdlMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE0LCAzKSAtIDEpO1xuICBjb25zdCBud0JpYXMgPSBNYXRoLmV4cCgtKCgod3ggKyAzNjApIC8gMzgwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAzMjApICoqIDIpKTtcbiAgY29uc3QgbW91bnQgPSBNYXRoLm1pbigxLCBtYXNzaWZNYXNrICogKDAuMzAgKyAwLjcwICogbndCaWFzKSArIDAuMjIgKiBud0JpYXMpO1xuXG4gIGxldCBoID0gc3dlbGwgKyBoaWxscyArIGJ1bXBzXG4gICAgKyBtb3VudCAqICgyMCArIDQwICogcmlkZ2UgKiByaWRnZSArIDEyICogcmlkZ2UyKTtcblxuICAvLyBTcHVycyBhbmQgZ3VsbGllcyBhdCAzMFx1MjAxMzkwIG0uIFdpdGhvdXQgdGhlc2UsIGEgc21vb3RoIGhpbGwgcXVhbnRpc2VkIHRvXG4gIC8vIDEgbSB2b3hlbHMgcmVhZHMgYXMgY29uY2VudHJpYyBjb250b3VyIHJpbmdzOyB3aXRoIHRoZW0sIHRoZSBzYW1lIGhpbGxcbiAgLy8gYnJlYWtzIGludG8gcmlkZ2VzLCBzaWRlIHZhbGxleXMgYW5kIHJvY2sgZmFjZXMuXG4gIGNvbnN0IHNwdXIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4NSwgd3ogLyA4NSwgc2VlZCArIDEyMCwgMykgLSAxKTtcbiAgY29uc3QgZ3VsbHkgPSBNYXRoLnBvdygxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA1MiArIDEzLCB3eiAvIDUyIC0gNSwgc2VlZCArIDEyMSwgMykgLSAxKSwgMik7XG4gIGggKz0gKHNwdXIgLSAwLjU1KSAqIDUuMCAtIGd1bGx5ICogMy4yO1xuXG4gIGggPSBvY2VhbkZsb29yICsgKGggLSBvY2VhbkZsb29yKSAqIGlubGFuZDtcbiAgaCArPSAxLjYgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuXG4gIC8vIEJyb2FkIHJpdmVyIHZhbGxleSwgdGhlbiB0aGUgY2hhbm5lbCBpdHNlbGYuIFRoZSB2YWxsZXkgbWFzayBpcyBnYXRlZCBieVxuICAvLyBsYW5kbmVzczogd2l0aG91dCB0aGUgZ2F0ZSBpdCBwdWxsZWQgdGhlIG9jZWFuIGZsb29yIHVwIHRvIHRoZSB2YWxsZXlcbiAgLy8gZmxvb3Igb3V0c2lkZSB0aGUgaXNsYW5kLCB3aGljaCB0aGUgbWFwIHZpZXcgc2hvd2VkIGFzIHBhbGUgcml2ZXItc2hhcGVkXG4gIC8vIGJhcnMgcnVubmluZyB0byB0aGUgaG9yaXpvbi5cbiAgY29uc3QgcmQgPSByaXZlckRpc3RhbmNlKHd4LCB3eik7XG4gIGNvbnN0IHZhbGxleSA9IHNtb290aHN0ZXAoOTUsIDEwLCByZCkgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuICBjb25zdCB2YWxsZXlGbG9vciA9IDIuNSArIDEuMCAqIGZibTIod3ggLyA2MCwgd3ogLyA2MCwgc2VlZCArIDExNSwgMik7XG4gIGggPSBsZXJwKGgsIHZhbGxleUZsb29yLCB2YWxsZXkgKiAwLjc1KTtcbiAgY29uc3Qgcml2ZXJXID0gNS4wICsgMy4wICogZmJtMih3eCAvIDQ1LCB3eiAvIDQ1LCBzZWVkICsgMTE2LCAyKTtcbiAgLy8gQSB3aWRlLCBzaGFsbG93IGNoYW5uZWwgcHJvZmlsZS4gVGhlIGZpcnN0IHBhc3MgY2FydmVkIGEgMTIgbSBzbG90IHdpdGhcbiAgLy8gbmVhci12ZXJ0aWNhbCBiYW5rcywgd2hpY2ggcmVhZCBhcyBhIGJyaWdodCBzdG9uZSBxdWFycnkgcmF0aGVyIHRoYW4gYVxuICAvLyByaXZlci4gVGhlIG91dGVyIGVkZ2UgaXMgbm93IH4yNSBtIGZyb20gdGhlIGNlbnRyZWxpbmUsIGFuZCB0aGUgYmVkIGlzXG4gIC8vIG9ubHkgMiBtIGJlbG93IHNlYSBsZXZlbC5cbiAgY29uc3QgY2hhbm5lbCA9IHNtb290aHN0ZXAocml2ZXJXICsgMTgsIHJpdmVyVyAqIDAuNCwgcmQpO1xuICBpZiAobGFuZG5lc3MgPiAwLjApIGggPSBsZXJwKGgsIC0yLjAsIGNoYW5uZWwgKiAwLjk1KTtcblxuICAvLyBMYWtlIGJhc2luIGF0IHRoZSBmb290IG9mIHRoZSBub3J0aC13ZXN0IGhpZ2hsYW5kcy5cbiAgY29uc3QgbGFrZUQgPSBsYWtlRGlzdGFuY2Uod3gsIHd6KVxuICAgICogKDEgKyAwLjE4ICogKGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNywgMikgLSAwLjUpICogMik7XG4gIGlmIChsYWtlRCA8IDEuMTUpIHtcbiAgICBjb25zdCBsYWtlTWFzayA9IHNtb290aHN0ZXAoMS4xNSwgMC41NSwgbGFrZUQpO1xuICAgIGggPSBsZXJwKGgsIC02LjUsIGxha2VNYXNrICogMC45NSk7XG4gIH1cblxuICAvLyBGb3VuZGVyIHNoZWxmOiBhIHNtYWxsLCBpcnJlZ3VsYXIgYnVpbGRhYmxlIHRlcnJhY2Ugb24gdGhlIGVhc3QgYmFuay5cbiAgLy8gRGVsaWJlcmF0ZWx5IG5vdCBhIDI2MCBtIHJhZGlhbCBmbGF0dGVuOyB0aGUgcHJldmlvdXMgcGFzcyBzaG93ZWQgdGhhdCBhXG4gIC8vIGxhcmdlIGZsYXR0ZW4tdG8tY29uc3RhbnQgYmVjb21lcyBhIHZpc2libGUgYm93bCBvZiBjb250b3VyIHJpbmdzLlxuICBjb25zdCBzaGVsZkQgPSBNYXRoLnNxcnQoKCh4ICsgOCkgLyA2MikgKiogMiArICgoeiAtIDQpIC8gNDgpICoqIDIpXG4gICAgKyAoZmJtMih4IC8gNDUsIHogLyA0NSwgc2VlZCArIDExOCwgMikgLSAwLjUpICogMC41NTtcbiAgY29uc3Qgc2hlbGYgPSBzbW9vdGhzdGVwKDEuMDUsIDAuNTUsIHNoZWxmRCk7XG4gIGlmIChzaGVsZiA+IDApIHtcbiAgICBjb25zdCB0YXJnZXQgPSAxMy4wICsgMS4yICogZmJtMih4IC8gMzYsIHogLyAzNiwgc2VlZCArIDExOSwgMikgKyB4ICogMC4wMTtcbiAgICBoID0gbGVycChoLCB0YXJnZXQsIHNoZWxmICogMC43OCk7XG4gIH1cblxuICByZXR1cm4gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIDkyKSk7XG59XG5cbmZ1bmN0aW9uIHNsb3BlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4pOiBNYXRJZCB7XG4gIC8vIFJpdmVyIGJlZCBpcyBncmF2ZWw7IHRoZSBiZWFjaCBpcyBhIG5hcnJvdyBzYW5kIGJhbmQsIG5vdCB0aGUgd2hvbGVcbiAgLy8gdmFsbGV5IGZsb29yLiBUaGUgZmlyc3QgcGFzcyBtYXJrZWQgZXZlcnkgY2VsbCB3aXRoaW4gNCBtIG9mIHNlYSBsZXZlbFxuICAvLyBhcyBzYW5kLCB3aGljaCBwcm9kdWNlZCBhIGNvbnNwaWN1b3VzIHBhbGUgc3RyaXAgYWxvbmcgdGhlIHJpdmVyLlxuICBpZiAocml2ZXJEaXN0YW5jZSh4LCB6KSA8IDEyICYmIGggPCBTRUFfTEVWRUwgKyAxKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgaWYgKGggPD0gU0VBX0xFVkVMICsgMC41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChuZWFyV2F0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgIG5lYXJXYXRlciA9XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMykgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDMpIDwgU0VBX0xFVkVMICsgMTtcbiAgfVxuICBpZiAobmVhcldhdGVyICYmIGggPD0gU0VBX0xFVkVMICsgMS41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChzbG9wZSA+PSAzKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDU4ICYmIGZibTIoeCAvIDE4LCB6IC8gMTgsIHNlZWQgKyAxMjAsIDIpID4gMC40NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0OCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQwICYmIHNsb3BlID49IDIgJiYgZmJtMih4IC8gMTIsIHogLyAxMiwgc2VlZCArIDEyMSwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNUT05FO1xuICByZXR1cm4gTUFULkdSQVNTO1xuXG59XG5cbi8qKiBQdWJsaWMgYmFzZS1tYXRlcmlhbCBzZWxlY3RvciBmb3IgbWFjcm8gTE9EIGFuZCB0ZXN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWwoXG4gIHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyOiBib29sZWFuLFxuKTogTWF0SWQge1xuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZnVuY3Rpb24gc3Vic29pbEZvcih0b3A6IE1hdElkKTogTWF0SWQge1xuICBpZiAodG9wID09PSBNQVQuR1JBU1MgfHwgdG9wID09PSBNQVQuTU9TUykgcmV0dXJuIE1BVC5TT0lMO1xuICBpZiAodG9wID09PSBNQVQuU05PVykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVZFTCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIHJldHVybiBNQVQuU1RPTkU7XG59XG5cbmZ1bmN0aW9uIG9yZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBjbHVzdGVyID0gZmJtMih4IC8gNTUsIHogLyA1NSwgc2VlZCArIDEzMCwgMik7XG4gIGlmIChjbHVzdGVyIDwgMC41NykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBuID0gdmFsdWVOb2lzZTMoeCAqIDAuMDksIHkgKiAwLjEzLCB6ICogMC4wOSwgc2VlZCArIDEzMSk7XG4gIGNvbnN0IG4yID0gdmFsdWVOb2lzZTMoeCAqIDAuMjIgKyA1LCB5ICogMC4zMSwgeiAqIDAuMjIgLSAzLCBzZWVkICsgMTMyKTtcbiAgcmV0dXJuIG4gPiAwLjcwICYmIG4yID4gMC41MDtcbn1cblxuZnVuY3Rpb24gY2F2ZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gZmJtMyh4ICogMC4wNzUsIHkgKiAwLjExLCB6ICogMC4wNzUsIHNlZWQgKyAxNDAsIDIpID4gMC43Mjtcbn1cblxuZnVuY3Rpb24gb3ZlcmhhbmdBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHZhbHVlTm9pc2UzKHggKiAwLjE4LCB5ICogMC4yMiwgeiAqIDAuMTgsIHNlZWQgKyAxNDEpID4gMC42Mjtcbn1cblxuLy8gLS0tLS0tLS0tLSB2ZXJzaW9uZWQgZ2VuZXJhdG9yIGRpc3BhdGNoIC0tLS0tLS0tLS1cbmNvbnN0IHYyQ2FjaGUgPSBuZXcgTWFwPG51bWJlciwgVGVycmFpblYyPigpO1xuY29uc3QgaHlkcm9DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBIeWRyb2xvZ3k+KCk7XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9neSBuZXR3b3JrIGZvciBhIHNlZWQgYW5kIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGh5ZHJvbG9neUZvcihzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlcik6IEh5ZHJvbG9neSB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikgcmV0dXJuIHRlcnJhaW5WMihzZWVkKS5oeWRyb2xvZ3k7XG4gIGNvbnN0IGtleSA9IGAke3NlZWR9OiR7dmVyc2lvbn1gO1xuICBsZXQgaHlkcm8gPSBoeWRyb0NhY2hlLmdldChrZXkpO1xuICBpZiAoIWh5ZHJvKSB7XG4gICAgaHlkcm8gPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbiwgdjFIZWlnaHQ6ICh4LCB6KSA9PiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeikgfSk7XG4gICAgaHlkcm9DYWNoZS5zZXQoa2V5LCBoeWRybyk7XG4gIH1cbiAgcmV0dXJuIGh5ZHJvO1xufVxuXG4vKiogQGludGVybmFsIFRoZSB2MiBnZW5lcmF0b3IgZm9yIGEgc2VlZCAoY2FjaGVkOyBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZXJyYWluVjIoc2VlZDogbnVtYmVyKTogVGVycmFpblYyIHtcbiAgbGV0IGdlbiA9IHYyQ2FjaGUuZ2V0KHNlZWQpO1xuICBpZiAoIWdlbikge1xuICAgIGNvbnN0IGh5ZHJvbG9neSA9IG5ldyBIeWRyb2xvZ3koeyBzZWVkLCB2ZXJzaW9uOiBHRU5FUkFUT1JfVjIsIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGdlbiA9IG5ldyBUZXJyYWluVjIoc2VlZCwgc3VyZmFjZUhlaWdodEF0LCBoeWRyb2xvZ3kpO1xuICAgIHYyQ2FjaGUuc2V0KHNlZWQsIGdlbik7XG4gIH1cbiAgcmV0dXJuIGdlbjtcbn1cblxuLyoqIEJhc2UgZ2VuZXJhdGVkIGhlaWdodCAodG9wIHNvbGlkICsgMSkgZm9yIGFueSBzdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMiA/IHRlcnJhaW5WMihzZWVkKS5oZWlnaHQoeCwgeikgOiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCB3YXRlciBzdXJmYWNlOiB3YXRlciBmaWxscyBjZWxscyBbaGVpZ2h0LCBsZXZlbCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVdhdGVyTGV2ZWxBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuY29sdW1uKHgsIHopLmxldmVsO1xuICBjb25zdCBoID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCA6IGg7XG59XG5cbmZ1bmN0aW9uIHZlcnNpb25lZFNsb3BlKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuLyoqIEJhc2UgdG9wIG1hdGVyaWFsIGZvciBhbnkgZ2VuZXJhdG9yIHZlcnNpb24gKG1hY3JvIExPRCwgZW50aXR5IHBsYWNlbWVudCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsRm9yKFxuICBzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgZ2VuID0gdGVycmFpblYyKHNlZWQpO1xuICAgIHJldHVybiBnZW4udG9wTWF0ZXJpYWwoeCwgeiwgZ2VuLmNvbHVtbih4LCB6KSwgc2xvcGUsXG4gICAgICAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGhoLCBzcywgbmVhcldhdGVyKSk7XG4gIH1cbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VyZmFjZVNhbXBsZSB7XG4gIHk6IG51bWJlcjtcbiAgdG9wOiBNYXRJZDtcbiAgc2xvcGU6IG51bWJlcjtcbn1cblxuLyoqIEJhc2Ugc3VyZmFjZSBzYW1wbGUgZm9yIG1hY3JvIExPRC4gRG9lcyBub3QgaW5jbHVkZSB2b3hlbCBlZGl0cy9vdmVyaGFuZ3MuICovXG5leHBvcnQgZnVuY3Rpb24gc2FtcGxlU3VyZmFjZShzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogU3VyZmFjZVNhbXBsZSB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIGNvbnN0IHNsb3BlID0gc2xvcGVBdChzZWVkLCB4LCB6LCB5KTtcbiAgcmV0dXJuIHsgeSwgdG9wOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIHksIHNsb3BlKSwgc2xvcGUgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBjaHVuayBnZW5lcmF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIHJldHVybiBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBiYXNlID0gZ2VuZXJhdGVCYXNlQ2h1bmsod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIGN4LCBjeik7XG4gIHJldHVybiBpbnN0YWxsQmFzZUNodW5rKHdvcmxkLCBiYXNlLCBwZXJmb3JtYW5jZS5ub3coKSAtIHQwKTtcbn1cblxuLyoqXG4gKiBCYXNlIGdlbmVyYXRlZCBjb250ZW50cyBvZiBhIGNodW5rIGJlZm9yZSBkdXJhYmxlIGVkaXRzLiBBIHB1cmUgZnVuY3Rpb24gb2ZcbiAqIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbiwgY3gsIGN6KTogc2FmZSB0byBjb21wdXRlIGluIGEgV2ViIFdvcmtlciwgYW5kIHRoZVxuICogYnl0ZXMgYXJlIGlkZW50aWNhbCB3aGVyZXZlciBpdCBydW5zLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHNlZWQ6IG51bWJlcjtcbiAgdmVyc2lvbjogbnVtYmVyO1xuICBkYXRhOiBVaW50OEFycmF5O1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVCYXNlQ2h1bmsoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ2h1bmsge1xuICBjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfVk9MVU1FKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCB0b3BNYXRlcmlhbHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGNvbnN0IHYyID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkgOiBudWxsO1xuXG4gIC8vIFBhZGRlZCBoZWlnaHQgY2FjaGU6IGEgdGhyZWUtY2VsbCBib3JkZXIgY292ZXJzIHNsb3BlLCBiZWFjaCBhbmQgbGVkZ2VzLlxuICBjb25zdCBQID0gMztcbiAgY29uc3QgUFcgPSBDSFVOS19TSVpFICsgUCAqIDI7XG4gIGNvbnN0IGJhc2VIID0gbmV3IEludDE2QXJyYXkoUFcgKiBQVyk7XG4gIGNvbnN0IHYyQ29sczogVjJDb2x1bW5bXSB8IG51bGwgPSB2MiA/IG5ldyBBcnJheShDSFVOS19BUkVBKSA6IG51bGw7XG4gIGZvciAobGV0IHB6ID0gMDsgcHogPCBQVzsgcHorKykge1xuICAgIGZvciAobGV0IHB4ID0gMDsgcHggPCBQVzsgcHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIHB4IC0gUCwgd3ogPSBveiArIHB6IC0gUDtcbiAgICAgIGlmICh2Mikge1xuICAgICAgICBjb25zdCBjb2wgPSB2Mi5jb2x1bW4od3gsIHd6KTtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IGNvbC5oO1xuICAgICAgICBjb25zdCBseCA9IHB4IC0gUCwgbHogPSBweiAtIFA7XG4gICAgICAgIGlmIChseCA+PSAwICYmIGx6ID49IDAgJiYgbHggPCBDSFVOS19TSVpFICYmIGx6IDwgQ0hVTktfU0laRSkgdjJDb2xzIVtseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjb2w7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHd4LCB3eik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgbGV0IG5vbkFpciA9IDA7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5lYXJXYXRlciA9XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCAtIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgKyAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMTtcbiAgICAgIGNvbnN0IHYyQ29sID0gdjJDb2xzID8gdjJDb2xzW2x6ICogQ0hVTktfU0laRSArIGx4XSA6IG51bGw7XG4gICAgICBjb25zdCB0b3AgPSB2MiAmJiB2MkNvbFxuICAgICAgICA/IHYyLnRvcE1hdGVyaWFsKHd4LCB3eiwgdjJDb2wsIHNsb3BlLCAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaGgsIHNzLCBuZWFyV2F0ZXIpKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICAgIGNvbnN0IHN1YiA9IHN1YnNvaWxGb3IodG9wKTtcbiAgICAgIGNvbnN0IG9yZVBvdGVudGlhbCA9IGZibTIod3ggLyA1NSwgd3ogLyA1NSwgc2VlZCArIDEzMCwgMikgPiAwLjU3O1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG5cbiAgICAgIGNvbnN0IHN0YXJ0ID0gWV9NSU47XG4gICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihZX01BWCAtIDEsIGggLSAxKTtcbiAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8PSBlbmQ7IHkrKykge1xuICAgICAgICBjb25zdCBkZXB0aCA9IGggLSAxIC0geTtcbiAgICAgICAgbGV0IG06IE1hdElkO1xuICAgICAgICBpZiAoeSA9PT0gWV9NSU4pIG0gPSBNQVQuQkVEUk9DSztcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPT09IDApIG0gPSB0b3A7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoIDw9IDIpIG0gPSBzdWI7XG4gICAgICAgIGVsc2UgbSA9IE1BVC5TVE9ORTtcblxuICAgICAgICBpZiAobSA9PT0gTUFULlNUT05FICYmIGRlcHRoID4gNCAmJiBvcmVQb3RlbnRpYWwgJiYgb3JlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuT1JFO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3BhcnNlIDNEIG92ZXJoYW5ncy91bmRlcmN1dHMgYXQgc3RlZXAgZmFjZXMuIFRoaXMgaXMgYSByZWFsXG4gICAgICAgIC8vIG9jY3VwYW5jeSBjaGFuZ2UsIG5vdCBhIGRlY29yYXRpb24gb24gdG9wIG9mIGEgaGVpZ2h0ZmllbGQuXG4gICAgICAgIGlmIChkZXB0aCA8PSAyICYmIHNsb3BlID49IDIgJiYgb3ZlcmhhbmdBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVlcCBjYXZlcywga2VwdCBhd2F5IGZyb20gdGhlIHN1cmZhY2Ugc28gdGhleSBkbyBub3QgY3JlYXRlIGhvbGVzLlxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUiAmJiBkZXB0aCA+IDcgJiYgZGVwdGggPCAyNCAmJiBjYXZlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildID0gbTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBXYXRlciB2b2x1bWU6IGV2ZXJ5dGhpbmcgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UgdXAgdG8gdGhlIGNvbHVtbidzXG4gICAgICAvLyB3YXRlciBsZXZlbCAoc2VhIGxldmVsIGluIHYxOyB0aGUgaHlkcm9sb2dpY2FsIGxldmVsIGluIHYyKS5cbiAgICAgIGNvbnN0IHdhdGVyTGV2ZWwgPSB2MkNvbCA/IE1hdGgubWluKFlfTUFYLCB2MkNvbC5sZXZlbCkgOiBTRUFfTEVWRUw7XG4gICAgICBpZiAoaCA8IHdhdGVyTGV2ZWwpIHtcbiAgICAgICAgZm9yIChsZXQgeSA9IE1hdGgubWF4KFlfTUlOLCBoKTsgeSA8IHdhdGVyTGV2ZWw7IHkrKykge1xuICAgICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseik7XG4gICAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgICAgZGF0YVtpZHhdID0gTUFULldBVEVSO1xuICAgICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvcFNvbGlkID0gTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLm1heChZX01JTiwgaCAtIDEpKTtcbiAgICAgIGhlaWdodHNbY29sXSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2NvbF0gPSB0b3A7XG4gICAgfVxuICB9XG5cbiAgLy8gUHJvdHJ1ZGluZyBsZWRnZXM6IG9uZSBvciB0d28gc3RvbmUgYmxvY2tzIGV4dGVuZCBmcm9tIGEgaGlnaCBjb2x1bW4gb3ZlclxuICAvLyBhIGxvd2VyIG5laWdoYm91ci4gVGhleSBjcmVhdGUgcmVhZGFibGUgb3ZlcmhhbmdzIHdpdGhvdXQgYSBmdWxsIGNhdmUgcGFzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGlmIChzbG9wZSA8IDIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZGlyczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBkaXJzKSB7XG4gICAgICAgIGNvbnN0IG54ID0gbHggKyBkeCwgbnogPSBseiArIGR6O1xuICAgICAgICBpZiAobnggPCAwIHx8IG56IDwgMCB8fCBueCA+PSBDSFVOS19TSVpFIHx8IG56ID49IENIVU5LX1NJWkUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBuaCA9IGJhc2VIWyhueiArIFApICogUFcgKyAobnggKyBQKV07XG4gICAgICAgIGlmIChoIC0gbmggPCAyKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGhhc2gzaShseCwgbHosIGR4ICogMyArIGR6ICogNywgc2VlZCArIDE1MCkgPCAwLjU1KSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgeSA9IGggLSAyO1xuICAgICAgICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gaCkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobngsIHlUb0luZGV4KHkpLCBueik7XG4gICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuU1RPTkU7XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZWNvbXB1dGUgdGhlIGNvbHVtbiBjYWNoZSBhZnRlciBsZWRnZXMvY2F2ZXMuIFRoZSBleHBvc2VkIHRvcCBtYXRlcmlhbFxuICAvLyBtdXN0IGNvbWUgZnJvbSB0aGUgYWN0dWFsIHRvcCBzb2xpZCB2b3hlbCwgbm90IHRoZSBwcmUtY2FydmUgZ3Vlc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgbGV0IHRvcE1hdDogbnVtYmVyID0gdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICBjb25zdCBtID0gZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgfVxuICAgICAgaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0b3BNYXQ7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgY3gsIGN6LCBzZWVkLCB2ZXJzaW9uLCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9O1xufVxuXG4vKipcbiAqIEluc3RhbGwgYmFzZSBjb250ZW50cyBhcyBhIHJlc2lkZW50IGNodW5rOiBhcHBseSBkdXJhYmxlIGVkaXRzLCB1cGRhdGVcbiAqIHN0YXRzLCBhbmQgcnVuIGRldGVybWluaXN0aWMgZW50aXR5IGdlbmVyYXRpb24uIE1haW4tdGhyZWFkIG9ubHk7IHRoaXMgaXNcbiAqIHRoZSBzaW5nbGUgd3JpdGVyIG9mIFdvcmxkLiBSZXR1cm5zIHRoZSBhbHJlYWR5LXJlc2lkZW50IGNodW5rIGlmIG9uZSBleGlzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsQmFzZUNodW5rKHdvcmxkOiBXb3JsZCwgYmFzZTogQmFzZUNodW5rLCBnZW5lcmF0aW9uTXMgPSAwKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoYmFzZS5zZWVkICE9PSB3b3JsZC5zZWVkIHx8IGJhc2UudmVyc2lvbiAhPT0gd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2Jhc2UgY2h1bmsgYmVsb25ncyB0byBhIGRpZmZlcmVudCB3b3JsZCBjb25maWd1cmF0aW9uJyk7XG4gIH1cbiAgY29uc3QgeyBjeCwgY3osIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyIH0gPSBiYXNlO1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICBjb25zdCBjaHVuazogVm94ZWxDaHVuayA9IHtcbiAgICBjeCwgY3osIGtleSwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIsXG4gICAgZGlydHk6IHRydWUsXG4gICAgZ2VuZXJhdGVkQXQ6IHBlcmZvcm1hbmNlLm5vdygpLFxuICB9O1xuXG4gIC8vIEFwcGx5IGR1cmFibGUgZWRpdHMgYWZ0ZXIgYmFzZSBnZW5lcmF0aW9uLlxuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICBpZiAoZWRpdHMpIHtcbiAgICBmb3IgKGNvbnN0IFtpZHgsIG1dIG9mIGVkaXRzKSB7XG4gICAgICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICAgIH1cbiAgICAvLyBSZWNvbXB1dGUgdGhlIGNhY2hlIGZvciBlZGl0ZWQgY2h1bmtzLlxuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIGx4LCBseik7XG4gICAgfVxuICB9XG4gIC8vIE5vbi1haXIgY291bnRzIGFyZSBkZXJpdmVkIHJlbmRlcmVyIHN0YXRpc3RpY3MsIG5vdCBkdXJhYmxlIHdvcmxkIHN0YXRlLlxuICAvLyBFZGl0ZWQgYmFzZSBhaXIgbWF5IGJlY29tZSBzb2xpZCAoYW5kIHZpY2UgdmVyc2EpIGR1cmluZyByZXN0b3JhdGlvbi5cbiAgbGV0IGVkaXRlZE5vbkFpciA9IDA7XG4gIGZvciAoY29uc3QgbWF0ZXJpYWwgb2YgY2h1bmsuZGF0YSkgaWYgKG1hdGVyaWFsICE9PSBNQVQuQUlSKSBlZGl0ZWROb25BaXIrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IGVkaXRlZE5vbkFpciAtIG5vbkFpcjtcblxuICB3b3JsZC5jaHVua3Muc2V0KGtleSwgY2h1bmspO1xuICB3b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IG5vbkFpcjtcbiAgd29ybGQuc3RhdHMuZ2VuZXJhdGlvbk1zICs9IGdlbmVyYXRpb25NcztcbiAgd29ybGQuZGlydHkuYWRkKGtleSk7XG5cbiAgZ2VuZXJhdGVFbnRpdGllcyh3b3JsZCwgY2h1bmspO1xuICByZXR1cm4gY2h1bms7XG59XG5cbi8qKiBBIGJhc2UtdGVycmFpbiBjYWNoZSBzaGFyZWQgYnkgZWRpdGVkIGFuZCB1bmVkaXRlZCByZWdlbmVyYXRpb24uIE5hdHVyYWxcbiAqIHNjZW5lcnkgbmV2ZXIgZGVwZW5kcyBvbiBsYXRlciB2b3hlbCBlZGl0czsgdGhpcyBhbHNvIGxldHMgYSBzbmFwc2hvdCByZXN0b3JlXG4gKiBhIGhhcnZlc3RlZCBjaHVuayB3aXRob3V0IG1hdGVyaWFsaXppbmcgdW5yZWxhdGVkIG5laWdoYm91cmluZyBjaHVua3MuICovXG5jb25zdCBiYXNlQ29sdW1uQ2FjaGUgPSBuZXcgV2Vha01hcDxXb3JsZCwgTWFwPHN0cmluZywgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXkgfT4+KCk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQmFzZUNvbHVtbnMgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7IH1cblxuLyoqIEJhc2UgKHByZS1jYXJ2ZSwgcHJlLWVkaXQpIGNvbHVtbiBoZWlnaHRzL21hdGVyaWFscyB1c2VkIGZvciBlbnRpdHkgcGxhY2VtZW50LiBQdXJlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVCYXNlQ29sdW1ucyhzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IEJhc2VDb2x1bW5zIHtcbiAgY29uc3QgY29sdW1ucyA9IHsgaGVpZ2h0czogbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSksIHRvcE1hdGVyaWFsczogbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSkgfTtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseCwgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeik7XG4gICAgICBjb25zdCBzbG9wZSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gdmVyc2lvbmVkU2xvcGUoc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCkgOiBzbG9wZUF0KHNlZWQsIHgsIHosIGgpO1xuICAgICAgY29uc3QgaW5kZXggPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbHVtbnMuaGVpZ2h0c1tpbmRleF0gPSBjbGFtcChoIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgY29sdW1ucy50b3BNYXRlcmlhbHNbaW5kZXhdID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyBiYXNlVG9wTWF0ZXJpYWxGb3Ioc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCwgc2xvcGUpXG4gICAgICAgIDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG4vKiogUHJvdmlkZSBwcmVjb21wdXRlZCBiYXNlIGNvbHVtbnMgKGZvciBleGFtcGxlIGZyb20gYSB3b3JrZXIpIGJlZm9yZSBpbnN0YWxsaW5nIGEgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gc2VlZEJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcsIGNvbHVtbnM6IEJhc2VDb2x1bW5zKTogdm9pZCB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgaWYgKCFjYWNoZS5oYXMoa2V5KSkgY2FjaGUuc2V0KGtleSwgY29sdW1ucyk7XG59XG5cbmZ1bmN0aW9uIGJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiBCYXNlQ29sdW1ucyB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgY29uc3QgY2FjaGVkID0gY2FjaGUuZ2V0KGNodW5rLmtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG4gIGNvbnN0IGNvbHVtbnMgPSBjb21wdXRlQmFzZUNvbHVtbnMod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIGNodW5rLmN4LCBjaHVuay5jeik7XG4gIGNhY2hlLnNldChjaHVuay5rZXksIGNvbHVtbnMpO1xuICByZXR1cm4gY29sdW1ucztcbn1cblxuLy8gLS0tLS0tLS0tLSBkZXJpdmVkIGNoYW5nZSB0cmFja2luZyAobm90IGF1dGhvcml0YXRpdmUgc3RhdGUpIC0tLS0tLS0tLS1cbi8vIFJlbmRlcmVycyBuZWVkIHRvIGtub3cgd2hlbiB0aGUgZWRpdCBvdmVybGF5IGNoYW5nZWQgd2l0aG91dCB3YWxraW5nIGV2ZXJ5XG4vLyBlZGl0IGVhY2ggZnJhbWUuIFRoZSBjb3VudGVyIGxpdmVzIG91dHNpZGUgV29ybGQgc28gaXQgbmV2ZXIgZW50ZXJzIGFcbi8vIHNuYXBzaG90IG9yIGNhbm9uaWNhbCBoYXNoLlxuY29uc3QgZWRpdFZlcnNpb25zID0gbmV3IFdlYWtNYXA8V29ybGQsIG51bWJlcj4oKTtcblxuLyoqIE1vbm90b25pYyBjb3VudCBvZiBlZGl0LW92ZXJsYXkgY2hhbmdlcyBmb3IgdGhpcyBXb3JsZCBvYmplY3QuICovXG5leHBvcnQgZnVuY3Rpb24gZWRpdFZlcnNpb24od29ybGQ6IFdvcmxkKTogbnVtYmVyIHtcbiAgcmV0dXJuIGVkaXRWZXJzaW9ucy5nZXQod29ybGQpID8/IDA7XG59XG5cbi8qKiBDYWxsIGFmdGVyIHJlcGxhY2luZyBvciBidWxrLWNoYW5naW5nIGB3b3JsZC5lZGl0c2Agb3V0c2lkZSBzZXRWb3hlbC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBlZGl0VmVyc2lvbnMuc2V0KHdvcmxkLCBlZGl0VmVyc2lvbih3b3JsZCkgKyAxKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBub24tZ2VuZXJhdGluZyBxdWVyaWVzIC0tLS0tLS0tLS1cbi8vIE1vdmluZyBwcmVzZW50YXRpb24gKGNoYXJhY3RlcnMsIGFuaW1hbHMsIGNhbWVyYSkgbXVzdCBuZXZlciB0cmlnZ2VyIGNodW5rXG4vLyBnZW5lcmF0aW9uIGFzIGEgc2lkZSBlZmZlY3Qgb2YgYXNraW5nIGFib3V0IHRlcnJhaW4uIFRoZXNlIHJldHVybiBudWxsIHdoZW5cbi8vIHRoZSBjb2x1bW4ncyBjaHVuayBpcyBub3QgcmVzaWRlbnQuXG5cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudENodW5rQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KHdvcmxkVG9DaHVua1goeCksIHdvcmxkVG9DaHVua1ooeikpKSA/PyBudWxsO1xufVxuXG4vKiogTGlrZSBzdXJmYWNlQXQsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB8IG51bGwge1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG4vKiogTGlrZSBnZXRWb3hlbCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFZveGVsQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQgfCBudWxsIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV2aWN0Q2h1bmsod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5jaHVua3MuZGVsZXRlKGtleSk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0V2aWN0ZWQrKztcbiAgLy8gQ2h1bmsgYnl0ZXMgYW5kIGNvbHVtbiBjYWNoZXMgYXJlIHJlZ2VuZXJhdGVkIG9uIGRlbWFuZC4gRW50aXRpZXMgcmVtYWluXG4gIC8vIGF1dGhvcml0YXRpdmU6IGV2aWN0aW9uIG11c3Qgbm90IGZvcmdldCB0aGVpciBwZXJzaXN0ZW50IHN0YXRlLlxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBxdWVyaWVzIC8gZWRpdHMgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGdldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgbTogTWF0SWQpOiBib29sZWFuIHtcbiAgaWYgKHkgPCBZX01JTiB8fCB5ID49IFlfTUFYKSByZXR1cm4gZmFsc2U7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpO1xuICBjb25zdCBwcmV2aW91c0VkaXQgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk/LmdldChpZHgpO1xuICAvLyBBIGNodW5rIGV2aWN0ZWQgYWZ0ZXIgYW4gZWFybGllciBlZGl0IGNhbiByZWdlbmVyYXRlIHdpdGggdGhhdCBkdXJhYmxlXG4gIC8vIG1hdGVyaWFsIGFscmVhZHkgYXBwbGllZC4gRHJvcHBpbmcgdGhlIGVkaXQgaGVyZSB3b3VsZCBtYWtlIGl0IGRpc2FwcGVhclxuICAvLyBvbiB0aGUgbmV4dCBldmljdGlvbi9yZXN0b3JhdGlvbiwgZXZlbiB0aG91Z2ggdGhlIGN1cnJlbnQgd3JpdGUgbm8tb3BzLlxuICBpZiAocHJldmlvdXNFZGl0ID09PSBtKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBmYWxzZTtcbiAgbGV0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rLmtleSk7XG4gIGlmICghZWRpdHMpIHsgZWRpdHMgPSBuZXcgTWFwKCk7IHdvcmxkLmVkaXRzLnNldChjaHVuay5rZXksIGVkaXRzKTsgfVxuICAvLyBBbiBpZGVtcG90ZW50IHdyaXRlIG11c3Qgc3RpbGwgcmVzdG9yZSBhIGR1cmFibGUgZGVsdGEgZGlzY2FyZGVkIGJ5IGFuXG4gIC8vIG9sZGVyIHNuYXBzaG90IG9yIGRlbHRhIGRlY29kZXIuIEl0IGlzIG5vdCBhIG5ldyBhdXRob3JpdGF0aXZlIHJldmlzaW9uLlxuICBpZiAoY2h1bmsuZGF0YVtpZHhdID09PSBtKSB7XG4gICAgaWYgKCFlZGl0cy5oYXMoaWR4KSkgZWRpdHMuc2V0KGlkeCwgbSk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gIGVkaXRzLnNldChpZHgsIG0pO1xuICBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkKTtcbiAgY2h1bmsuZGlydHkgPSB0cnVlO1xuICB3b3JsZC5kaXJ0eS5hZGQoY2h1bmsua2V5KTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIHdvcmxkVG9Mb2NhbFgoeCksIHdvcmxkVG9Mb2NhbFooeikpO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bms6IFZveGVsQ2h1bmssIGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgIGlmIChpc1NvbGlkKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0pKSB7IHRvcFNvbGlkID0geTsgYnJlYWs7IH1cbiAgfVxuICBjaHVuay5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICBjb25zdCB0bSA9IGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gIGlmICh0b3BTb2xpZCA+PSBZX01JTikge1xuICAgIGNvbnN0IG0gPSBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHRvcFNvbGlkKSwgbHopXTtcbiAgICBpZiAobSAhPT0gTUFULldBVEVSKSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gbTtcbiAgfSBlbHNlIHtcbiAgICBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG07XG4gIH1cbn1cblxuLyoqXG4gKiBUaGUgeSBjb29yZGluYXRlIG9mIHRoZSBleHBvc2VkIHRvcCBmYWNlIG9mIHRoZSBzb2xpZCBjb2x1bW4gYXQgeC96LlxuICogQSBzb2xpZCB2b3hlbCBhdCB5IG9jY3VwaWVzIFt5LCB5KzEpLCBzbyB0aGUgd2Fsa2FibGUgc3VyZmFjZSBpcyB0b3BTb2xpZCsxLlxuICogVGhpcyBpcyBhIGRlcml2ZWQgcXVlcnk7IHRoZSBhdXRob3JpdGF0aXZlIHN0YXRlIHJlbWFpbnMgdGhlIHZveGVsIHZvbHVtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIFlfTUlOO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIFlfTUlOO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay50b3BNYXRlcmlhbHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhlaWdodEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uIDwgR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgaCA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gICAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgLSBoIDogMDtcbiAgfVxuICByZXR1cm4gd2F0ZXJTdXJmYWNlQXQod29ybGQsIHgsIHopIC0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuLyoqXG4gKiBUb3Agb2YgdGhlIHdhdGVyIGNvbHVtbiBzdGFuZGluZyBvbiB0aGUgc29saWQgc3VyZmFjZSAoZXF1YWwgdG8gdGhlIHN1cmZhY2VcbiAqIHdoZW4gZHJ5KS4gUmVhZHMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWxzLCBzbyBlZGl0cyBhbmQgZHVnIHBpdHMgYXJlIGV4YWN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgd2hpbGUgKHkgPCBZX01BWCAmJiBnZXRWb3hlbCh3b3JsZCwgeCwgeSwgeikgPT09IE1BVC5XQVRFUikgeSsrO1xuICByZXR1cm4geTtcbn1cblxuLy8gLS0tLS0tLS0tLSBlbnRpdGllcyAtLS0tLS0tLS0tXG5mdW5jdGlvbiBhZGRFbnRpdHkod29ybGQ6IFdvcmxkLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLmhhcyhlLmlkKSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgcmV0dXJuO1xuICB3b3JsZC5lbnRpdGllcy5zZXQoZS5pZCwgZSk7XG4gIGxldCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBsaXN0KTsgfVxuICBsaXN0LnB1c2goZS5pZCk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgLy8gR2VuZXJhdGlvbiBpcyBkZXRlcm1pbmlzdGljIGFuZCBhZHZhbmNlcyBubyBwbGF5ZXItY29tbWFuZCBwcmVjb25kaXRpb24uXG4gIC8vIEF1dGhvcmVkIHNjYWZmb2xkaW5nIG1heSB0cmFuc2llbnRseSBjaGFuZ2UgaXQ7IHRoZSBzbmFwc2hvdCByZXN0b3JlcyB0aGVcbiAgLy8gc2F2ZWQgcmV2aXNpb24gYWZ0ZXIgcGxhY2luZyB0aGF0IHNjYWZmb2xkaW5nLlxufVxuXG4vKipcbiAqIFJlbW92ZSBhbiBlbnRpdHkgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB3b3JsZC4gVXNlZCB3aGVuIGEgc2l0ZSBpcyBjbGVhcmVkOlxuICogdGhlIHJlc291cmNlIHlpZWxkIGlzIGFjY291bnRlZCBmb3IgYnkgdGhlIGNhbGxlciwgYW5kIHRoZSBlbnRpdHkgbXVzdCBzdG9wXG4gKiBleGlzdGluZyBmb3IgY29sbGlzaW9uLCBvYnN0cnVjdGlvbiBhbmQgcGVyc2lzdGVuY2UsIG5vdCBqdXN0IGJlIGhpZGRlbiBieVxuICogdGhlIHJlbmRlcmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gIGNvbnN0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAobGlzdCkge1xuICAgIGNvbnN0IGkgPSBsaXN0LmluZGV4T2YoaWQpO1xuICAgIGlmIChpID49IDApIGxpc3Quc3BsaWNlKGksIDEpO1xuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGlkKTtcbiAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZW50aXR5SWQoY2h1bms6IHN0cmluZywgaTogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBlOiR7Y2h1bmt9OiR7aX1gO1xufVxuXG5mdW5jdGlvbiBmb3Jlc3RTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBlYXN0ID0gTWF0aC5leHAoLSgoKHd4IC0gMjIwKSAvIDI2MCkgKiogMiArICgod3ogKyAxMTApIC8gMjIwKSAqKiAyKSk7XG4gIGNvbnN0IG5vcnRoID0gTWF0aC5leHAoLSgoKHd4IC0gMjApIC8gMzAwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAxOTApICoqIDIpKTtcbiAgY29uc3Qgd2VzdCA9IE1hdGguZXhwKC0oKCh3eCArIDM0MCkgLyAyMDApICoqIDIgKyAoKHd6IC0gMTIwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBzb3V0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDEyMCkgLyAyNDApICoqIDIgKyAoKHd6IC0gMzMwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBtb2lzdHVyZSA9IGZibTIod3ggLyAyNjAsIHd6IC8gMjYwLCBzZWVkICsgMjAxLCA0KTtcbiAgY29uc3QgdmFsbGV5ID0gTWF0aC5leHAoLSgod3ggLyAxNDApICoqIDIgKyAod3ogLyAxMDUpICoqIDIpKTtcbiAgcmV0dXJuIE1hdGgubWF4KGVhc3QsIG5vcnRoICogMC45Miwgd2VzdCAqIDAuODAsIHNvdXRoICogMC43OCkgKiAwLjgyXG4gICAgKyBtb2lzdHVyZSAqIDAuMzggLSAwLjIyIC0gdmFsbGV5ICogMC4zNDtcbn1cblxuZnVuY3Rpb24gcm9ja1Njb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IG1vdW50YWluID0gZmJtMih3eCAvIDMzMCwgd3ogLyAzMzAsIHNlZWQgKyAyMDIsIDMpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDE0MCwgd3ogLyAxNDAsIHNlZWQgKyAyMDMsIDMpIC0gMSk7XG4gIHJldHVybiBtb3VudGFpbiAqIDAuNTUgKyByaWRnZSAqIDAuNDU7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRW50aXRpZXMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHZvaWQge1xuICBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkLCBjaHVuay5jeCwgY2h1bmsuY3opO1xufVxuXG4vKiogQGludGVybmFsIFJlcGxheXMgZGV0ZXJtaW5pc3RpYyBnZW5lcmF0aW9uIGZvciBzbmFwc2hvdCBlbnRpdHkgZGVsdGFzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGlmICh3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGtleSkpIHJldHVybjtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuO1xuXG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKGhhc2gyaShjaHVuay5jeCwgY2h1bmsuY3osIHdvcmxkLnNlZWQgKyA5MDApICogNDI5NDk2NzI5NikgPj4+IDApO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgY29uc3QgY29sdW1ucyA9IGJhc2VDb2x1bW5zKHdvcmxkLCBjaHVuayk7XG4gIGxldCBuID0gMDtcbiAgbGV0IG5hdHVyYWxUcmVlcyA9IDA7XG4gIGxldCBuYXR1cmFsUGlua1RyZWVzID0gMDtcblxuICBjb25zdCBsb2NhbFN1cmZhY2UgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gKyBZX01JTjtcbiAgfTtcbiAgY29uc3QgbG9jYWxUb3AgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IE1hdElkID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIGFzIE1hdElkO1xuICB9O1xuICBjb25zdCBsb2NhbFNsb3BlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICByZXR1cm4gTWF0aC5tYXgoXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICk7XG4gIH07XG5cbiAgLy8gQSBqaXR0ZXJlZCA4IG0gbGF0dGljZSBnaXZlcyBjb2hlcmVudCBtYXNzZXMgYW5kIGF2b2lkcyBwZXItZnJhbWUgc2NhdHRlci5cbiAgZm9yIChsZXQgZ3ogPSAwOyBneiA8IENIVU5LX1NJWkU7IGd6ICs9IDgpIHtcbiAgICBmb3IgKGxldCBneCA9IDA7IGd4IDwgQ0hVTktfU0laRTsgZ3ggKz0gOCkge1xuICAgICAgY29uc3QgbHggPSBjbGFtcChNYXRoLmZsb29yKGd4ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3QgbHogPSBjbGFtcChNYXRoLmZsb29yKGd6ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAxKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHNsb3BlID0gbG9jYWxTbG9wZShseCwgbHopO1xuICAgICAgY29uc3QgdG9wID0gbG9jYWxUb3AobHgsIGx6KTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikgY29udGludWU7XG4gICAgICBjb25zdCBmb3Jlc3QgPSBmb3Jlc3RTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9ja3kgPSByb2NrU2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvbGwgPSBybmQoKTtcblxuICAgICAgY29uc3QgdHJlZUNoYW5jZSA9IGZvcmVzdCA+IDAuNTAgPyAwLjcyIDogZm9yZXN0ID4gMC4zMCA/IDAuMjUgOiAwLjA1O1xuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDIgJiYgcm9sbCA8IHRyZWVDaGFuY2UpIHtcbiAgICAgICAgLy8gVGhlIGNhcCBpcyBhIGRldGVybWluaXN0aWMgbmF0dXJhbC1nZW5lcmF0aW9uIHByb3BlcnR5LiBJdCBjYW5ub3RcbiAgICAgICAgLy8gZGVwZW5kIG9uIHdoaWNoIGNodW5rcyBhIHJlbmRlcmVyIGxvYWRlZCBiZWZvcmUgdGhpcyBvbmUuXG4gICAgICAgIGxldCBraW5kOiBFbnRpdHlLaW5kO1xuICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICBjb25zdCBzcGVjaWVzUm9sbCA9IHJuZCgpO1xuICAgICAgICBpZiAoc3BlY2llc1JvbGwgPCAwLjEyKSB7XG4gICAgICAgICAgaWYgKChuYXR1cmFsUGlua1RyZWVzICsgMSkgPiAwLjI1ICogKG5hdHVyYWxUcmVlcyArIDEpKSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rT3ZlcmZsb3crKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfYmxvc3NvbSc7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDIpO1xuICAgICAgICAgICAgbmF0dXJhbFBpbmtUcmVlcysrO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC40MCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3NwaXJlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC43NCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3RhYmxlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgIH1cbiAgICAgICAgbmF0dXJhbFRyZWVzKys7XG4gICAgICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjg4ICsgcm5kKCkgKiAwLjI0LCB2YXJpYW50LFxuICAgICAgICAgIHJlc291cmNlOiAnd29vZCcsIHJlbWFpbmluZzogMTIsIHlpZWxkUGVySGFydmVzdDogNCxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgcm9ja3kgPiAwLjQ2ICYmIHJvbGwgPCAwLjM4KSB7XG4gICAgICAgIC8vIENvbnN1bWUgdGhlIHJldGlyZWQgc3RvbmUgZm9ybSdzIHJhbmRvbSBkcmF3cyBhbmQgYWxsb2NhdGUgaXRzIG9sZFxuICAgICAgICAvLyBzZXF1ZW5jZSBJRCwgYnV0IGRvIG5vdCBpbnNlcnQgYW4gZW50aXR5LiBMYXRlciBuYXR1cmFsIHBsYWNlbWVudHNcbiAgICAgICAgLy8gdGhlcmVmb3JlIHJlbWFpbiBieXRlLWZvci1ieXRlIGNvbXBhdGlibGUgd2l0aCByZWNvcmRlZCBzYXZlcy5cbiAgICAgICAgY29uc3Qgc2l6ZVJvbGwgPSBybmQoKTtcbiAgICAgICAgY29uc3Qga2luZDogRW50aXR5S2luZCA9IHNpemVSb2xsIDwgMC41NSA/ICdzdHlsX3JvY2tfc21hbGwnXG4gICAgICAgICAgOiBzaXplUm9sbCA8IDAuOTAgPyAnc3R5bF9yb2NrX21lZGl1bScgOiAnc3R5bF9yb2NrX2xhcmdlJztcbiAgICAgICAgY29uc3QgaWQgPSBlbnRpdHlJZChjaHVuay5rZXksIG4rKyk7XG4gICAgICAgIGNvbnN0IHJlY29yZCA9IHtcbiAgICAgICAgICBpZCwga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJlc291cmNlOiAnc3RvbmUnIGFzIGNvbnN0LFxuICAgICAgICAgIHJlbWFpbmluZzoga2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyA0IDoga2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gOCA6IDEyLFxuICAgICAgICAgIHlpZWxkUGVySGFydmVzdDogMywgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gT25seSBlbnRpdGllcyB0aGF0IGV4aXN0ZWQgaW4gYW4gYWNjZXB0ZWQgb2xkIHNhdmUgZ2V0IHRvbWJzdG9uZXMsXG4gICAgICAgIC8vIGR1cmluZyBleHBsaWNpdCBtaWdyYXRpb24uIE9yZGluYXJ5IGdlbmVyYXRpb24gbXVzdCByZXN0b3JlIGV4YWN0bHkuXG4gICAgICAgIGlmIChpc1N0b25lUmVwbGF5KHdvcmxkKSkgYWRkRW50aXR5KHdvcmxkLCByZWNvcmQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSAmJiByb2NreSA+IDAuNTggJiYgcm9sbCA8IDAuMTgpIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9vcmUnLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMiksXG4gICAgICAgICAgcmVzb3VyY2U6ICdvcmUnLCByZW1haW5pbmc6IDgsIHlpZWxkUGVySGFydmVzdDogMixcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMSAmJiByb2xsIDwgMC4zMCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX3NocnViJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjggKyBybmQoKSAqIDAuNCwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICAgIHJlc291cmNlOiAnZmliZXInLCByZW1haW5pbmc6IDQsIHlpZWxkUGVySGFydmVzdDogMSxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkQXV0aG9yZWRFbnRpdHkod29ybGQ6IFdvcmxkLCBraW5kOiBFbnRpdHlLaW5kLCB4OiBudW1iZXIsIHo6IG51bWJlciwgdmFyaWFudDogbnVtYmVyLCByb3Q6IG51bWJlciwgc2NhbGU6IG51bWJlciwgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGwsIHJlbWFpbmluZzogbnVtYmVyLCB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHkgPD0gU0VBX0xFVkVMKSByZXR1cm47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAvLyBBIGhlcm8gYXNzZXQgb3ducyBpdHMgc3BvdDogY2xlYXIgYW55IGdlbmVyYXRlZCBlbnRpdHkgdGhhdCB3b3VsZCBvdmVybGFwXG4gIC8vIGl0LCByYXRoZXIgdGhhbiBzaWxlbnRseSBkcm9wcGluZyB0aGUgYXV0aG9yZWQgY29tcG9zaXRpb24uXG4gIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXTtcbiAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChraW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHJldHVybjtcbiAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoZSAmJiBNYXRoLmh5cG90KGUueCAtIHgsIGUueiAtIHopIDwgMi42KSB7XG4gICAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICAgICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICAgICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gICAgfVxuICB9XG4gIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSkpO1xuICAvLyBBdXRob3JlZCBjb21wb3NpdGlvbiBpcyBkdXJhYmxlIHN0YXRlOiBpdCBjYW4gY2xlYXIgb3ZlcmxhcHBpbmcgbmF0dXJhbFxuICAvLyBlbnRpdGllcywgc28gc2F2ZSB0aGUgY29tcGxldGUgYWZmZWN0ZWQgY2h1bmsgcmF0aGVyIHRoYW4gb25seSBpdHMgaGVyb2VzLlxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuXG4gIGNvbnN0IGlkID0gYGhlcm86JHtraW5kfToke01hdGgucm91bmQoeCl9OiR7TWF0aC5yb3VuZCh6KX1gO1xuICBjb25zdCBiZWZvcmUgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICBjb25zdCBlbnRpdHk6IEVudGl0eSA9IHtcbiAgICBpZCwga2luZCwgY2h1bms6IGtleSwgeDogeCArIDAuNSwgeSwgejogeiArIDAuNSxcbiAgICByb3QsIHNjYWxlLCB2YXJpYW50LCByZXNvdXJjZSwgcmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiB0cnVlLFxuICB9O1xuICBhZGRFbnRpdHkod29ybGQsIGVudGl0eSk7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5zaXplID4gYmVmb3JlICYmIGtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHtcbiAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgIGlmIChraW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBpZiAod29ybGQuYXV0aG9yZWRQbGFjZWQpIHJldHVybjtcbiAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSB0cnVlO1xuXG4gIGNvbnN0IHNpdGVzOiBBcnJheTx7IGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJzsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJvdDogbnVtYmVyIH0+ID0gW1xuICAgIHsga2luZDogJ3dheXN0b25lJywgeDogLTEwLCB6OiAtMTQsIHJvdDogMCB9LFxuICAgIHsga2luZDogJ21hcmtlcicsIHg6IC0zMiwgejogLTgsIHJvdDogTWF0aC5QSSAvIDIgfSxcbiAgXTtcbiAgZm9yIChjb25zdCBzIG9mIHNpdGVzKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgcy54LCBzLnopO1xuICAgIGlmICh5IDw9IFNFQV9MRVZFTCkgY29udGludWU7XG4gICAgd29ybGQuc2l0ZXMucHVzaCh7XG4gICAgICBpZDogYHNpdGU6JHtzLmtpbmR9YCxcbiAgICAgIGtpbmQ6IHMua2luZCxcbiAgICAgIHg6IHMueCArIDAuNSwgeSwgejogcy56ICsgMC41LFxuICAgICAgcm90OiBzLnJvdCxcbiAgICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gQSBoZXJvIGdyb3ZlIGNvbXBvc2VkIGluIHRoZSBkZWZhdWx0IGNhbWVyYSdzIHZpZXcgZGlyZWN0aW9uLiBUaGVzZSBhcmVcbiAgLy8gU3R5bCBuYXR1cmFsIGFzc2V0cyAoQVMtMDAxIHYyKSwgbm90IE5veGVsIGFyY2hpdGVjdHVyZTsgdGhlIE5veGVsXG4gIC8vIHdheXN0b25lL21hcmtlciBhYm92ZSByZW1haW4gdGhlIGh1bWFuLW1hZGUgbGFuZG1hcmtzLlxuICBjb25zdCBncm92ZTogQXJyYXk8W0VudGl0eUtpbmQsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXT4gPSBbXG4gICAgWydzdHlsX3RyZWVfc3BpcmUnLCAtMjIsIC0yNiwgMCwgMS4wMCwgMF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtMzQsIC0xOCwgMSwgMC45NSwgTWF0aC5QSSAvIDEyXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTE2LCAtMzQsIDIsIDEuMDAsIE1hdGguUEkgLyA2XSxcbiAgICBbJ3N0eWxfdHJlZV9ibG9zc29tJywgLTI4LCAtMzgsIDAsIDAuOTAsIE1hdGguUEkgLyA0XSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC00MCwgLTMwLCAyLCAxLjA1LCBNYXRoLlBJIC8gM10sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xMiwgLTI0LCAwLCAwLjkwLCBNYXRoLlBJIC8gMi40XSxcbiAgXTtcbiAgZm9yIChjb25zdCBba2luZCwgeCwgeiwgdmFyaWFudCwgc2NhbGUsIHJvdF0gb2YgZ3JvdmUpIHtcbiAgICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwga2luZCwgeCwgeiwgdmFyaWFudCwgcm90LCBzY2FsZSwgJ3dvb2QnLCAxMiwgNCk7XG4gIH1cbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3JvY2tfbWVkaXVtJywgLTYsIC0xMCwgMCwgMCwgMS4wLCAnc3RvbmUnLCA4LCAzKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3NocnViJywgLTE0LCAtOCwgMSwgTWF0aC5QSSAvIDEyLCAxLjEsICdmaWJlcicsIDQsIDEpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfY2Fpcm4nLCAtMjAsIC02LCAwLCAwLCAxLjAsICdzdG9uZScsIDYsIDIpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfb3JlJywgLTM4LCAtNDIsIDAsIE1hdGguUEkgLyA0LCAxLjEsICdvcmUnLCA4LCAyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5lYXJlc3RIYXJ2ZXN0YWJsZShcbiAgd29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgcmFkaXVzOiBudW1iZXIsIHJlc291cmNlPzogUmVzb3VyY2VUeXBlLFxuKTogRW50aXR5IHwgbnVsbCB7XG4gIGxldCBiZXN0OiBFbnRpdHkgfCBudWxsID0gbnVsbDtcbiAgbGV0IGJlc3REID0gcmFkaXVzICogcmFkaXVzO1xuICBmb3IgKGNvbnN0IGUgb2Ygd29ybGQuZW50aXRpZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpXG4gICAgICB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSBjb250aW51ZTtcbiAgICBpZiAocmVzb3VyY2UgJiYgZS5yZXNvdXJjZSAhPT0gcmVzb3VyY2UpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGQgPSAoZS54IC0geCkgKiogMiArIChlLnogLSB6KSAqKiAyO1xuICAgIGlmIChkIDwgYmVzdEQpIHsgYmVzdEQgPSBkOyBiZXN0ID0gZTsgfVxuICB9XG4gIHJldHVybiBiZXN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RSZXN1bHQgeyBlbnRpdHk6IEVudGl0eTsgcmVzb3VyY2U6IFJlc291cmNlVHlwZTsgYW1vdW50OiBudW1iZXI7IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogSGFydmVzdFJlc3VsdCB8IG51bGwge1xuICBjb25zdCBlID0gbGl2ZUVudGl0eSh3b3JsZCwgaWQpO1xuICBpZiAoIWUgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGFtb3VudCA9IE1hdGgubWluKGUueWllbGRQZXJIYXJ2ZXN0LCBlLnJlbWFpbmluZyk7XG4gIGlmICh3b3JsZC5saWZlICYmIE9iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgbikgPT4gc3VtICsgbiwgMCkgKyBhbW91bnQgPiAxMjApIHJldHVybiBudWxsO1xuICBlLnJlbWFpbmluZyAtPSBhbW91bnQ7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGUuaGFydmVzdGVkT25jZSA9IHRydWU7XG4gIGlmIChlLnJlbWFpbmluZyA8PSAwKSBlLmhhcnZlc3RlZCA9IHRydWU7XG4gIHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA9ICh3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IGVudGl0eTogZSwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCB9O1xufVxuXG4vKiogUmVtb3ZlIGV2ZXJ5IHJldGlyZWQgc291cmNlIGFmdGVyIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5LiBUaGlzIG1pZ3JhdGlvblxuICogY3JlYXRlcyBkZXRlcm1pbmlzdGljIHRvbWJzdG9uZXMgYnV0IGlzIG5vdCBhIHBsYXllciBjb21tYW5kIG9yIHJldmlzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJldGlyZVN0b25lRW50aXRpZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZSBvZiBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldKSB7XG4gICAgaWYgKCFpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSkgY29udGludWU7XG4gICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGUuaWQpO1xuICAgIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGUuaWQpO1xuICAgIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICAgIGlmICghd29ybGQuZW50aXR5Q2h1bmtzLmhhcyhlLmNodW5rKSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgZm9yIChjb25zdCBba2V5LCBpZHNdIG9mIHdvcmxkLmVudGl0eUNodW5rcykge1xuICAgIGNvbnN0IGFjdGl2ZSA9IGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKTtcbiAgICBpZiAoYWN0aXZlLmxlbmd0aCA+IDAgfHwgd29ybGQuZW50aXR5Q2hhbmdlcy5oYXMoa2V5KSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGFjdGl2ZSk7XG4gICAgZWxzZSB3b3JsZC5lbnRpdHlDaHVua3MuZGVsZXRlKGtleSk7XG4gIH1cbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBlcnNpc3RlbmNlIC8gYXV0aG9yaXR5IGJvdW5kYXJ5IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNYW5pZmVzdCB7XG4gIHNjaGVtYTogMTtcbiAgc2VlZDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBwYXJhbXNIYXNoOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGZudjFhKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoID0gMHg4MTFjOWRjNTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgaCBePSB0ZXh0LmNoYXJDb2RlQXQoaSk7XG4gICAgaCA9IE1hdGguaW11bChoLCAweDAxMDAwMTkzKTtcbiAgfVxuICByZXR1cm4gKGggPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ybGRNYW5pZmVzdCh3b3JsZDogV29ybGQpOiBXb3JsZE1hbmlmZXN0IHtcbiAgY29uc3QgcCA9IHdvcmxkLnBhcmFtcztcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAgc2VlZDogd29ybGQuc2VlZCxcbiAgICBnZW5lcmF0b3JWZXJzaW9uOiBwLmdlbmVyYXRvclZlcnNpb24sXG4gICAgc2l6ZTogcC5zaXplLFxuICAgIGNodW5rU2l6ZTogcC5jaHVua1NpemUsXG4gICAgeU1pbjogcC55TWluLFxuICAgIHlNYXg6IHAueU1heCxcbiAgICBzZWFMZXZlbDogcC5zZWFMZXZlbCxcbiAgICBwYXJhbXNIYXNoOiBmbnYxYShKU09OLnN0cmluZ2lmeShwKSksXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxFZGl0IHsgaTogbnVtYmVyOyBtOiBudW1iZXI7IH1cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIHNjaGVtYTogMTtcbiAga2V5OiBzdHJpbmc7XG4gIGJhc2VWZXJzaW9uOiBudW1iZXI7XG4gIGVkaXRzOiBWb3hlbEVkaXRbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cG9ydENodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IENodW5rRGVsdGEge1xuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBrZXksXG4gICAgYmFzZVZlcnNpb246IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIGVkaXRzOiBlZGl0cyA/IFsuLi5lZGl0cy5lbnRyaWVzKCldLm1hcCgoW2ksIG1dKSA9PiAoeyBpLCBtIH0pKS5zb3J0KChhLCBiKSA9PiBhLmkgLSBiLmkpIDogW10sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBkZWx0YTogQ2h1bmtEZWx0YSk6IHZvaWQge1xuICBjb25zdCBbY3gsIGN6XSA9IGRlbHRhLmtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICBmb3IgKGNvbnN0IGUgb2YgZGVsdGEuZWRpdHMpIHtcbiAgICBjb25zdCB5SW5kZXggPSBNYXRoLmZsb29yKGUuaSAvIENIVU5LX0FSRUEpO1xuICAgIGNvbnN0IHJlbSA9IGUuaSAlIENIVU5LX0FSRUE7XG4gICAgY29uc3QgbHogPSBNYXRoLmZsb29yKHJlbSAvIENIVU5LX1NJWkUpO1xuICAgIGNvbnN0IGx4ID0gcmVtICUgQ0hVTktfU0laRTtcbiAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4O1xuICAgIGNvbnN0IHkgPSBZX01JTiArIHlJbmRleDtcbiAgICBjb25zdCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgIHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBlLm0gYXMgTWF0SWQpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gdGltZSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFRpbWVTdGF0ZSB7IHQ6IG51bWJlcjsgZGF5TGVuZ3RoU2VjOiBudW1iZXI7IHBhdXNlZDogYm9vbGVhbjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpbWUoczogVGltZVN0YXRlLCBkdDogbnVtYmVyKTogdm9pZCB7XG4gIGlmIChzLnBhdXNlZCkgcmV0dXJuO1xuICBzLnQgPSAocy50ICsgZHQgLyBzLmRheUxlbmd0aFNlYykgJSAxO1xufVxuIiwgIi8vIFRlcnJhaW4gcXVlcnkgbGF5ZXIgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbiwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDIgU3lzdGVtIDE6IG9uZSBzaGFyZWQsIGNhY2hlZCBjb250cmFjdCBmb3IgY29uc3RydWN0aW9uLCBmYXJtaW5nLFxuLy8gbW92ZW1lbnQsIG5hdmlnYXRpb24gYW5kIHRoZSBBSSBhZ2VudC4gVGhlc2UgcXVlcmllcyBkZXNjcmliZSB0aGVcbi8vIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lOyB0aGV5IG5ldmVyIG11dGF0ZSBpdCBhbmQgbmV2ZXIgY3JlYXRlIGEgc2Vjb25kXG4vLyB0ZXJyYWluIHJlcHJlc2VudGF0aW9uLlxuLy9cbi8vIENvbnZlbnRpb25zOlxuLy8gICAqIHgveiBhcmUgaW50ZWdlciBjb2x1bW4gY29vcmRpbmF0ZXMgaW4gWy0xMDI0LCAxMDI0KS5cbi8vICAgKiB5IGlzIGFuIGludGVnZXIgdm94ZWwgY29vcmRpbmF0ZSBpbiBbLTE2LCAxMTIpLlxuLy8gICAqIHN1cmZhY2VZIGlzIHRoZSBleHBvc2VkIHRvcCBmYWNlICh0b3BTb2xpZCArIDEpLCBtYXRjaGluZyBNMDAxLlxuLy8gICAqIEEgcmVjdCBpcyBpbmNsdXNpdmUgb24gYWxsIGZvdXIgZWRnZXMuXG5pbXBvcnQge1xuICBXb3JsZCwgTWF0SWQsIE1BVCwgU0VBX0xFVkVMLCBZX01JTiwgWV9NQVgsIEhBTEYsXG4gIHN1cmZhY2VBdCwgdG9wTWF0ZXJpYWxBdFdvcmxkLCBnZXRWb3hlbCwgaXNTb2xpZCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIEFjdGl2ZUVudGl0eUtpbmQsIEVudGl0eUtpbmQsIGlzUmV0aXJlZFN0b25lS2luZCxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBpc1N0b25lUmVwbGF5IH0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlY3Qge1xuICB4MDogbnVtYmVyO1xuICB6MDogbnVtYmVyO1xuICB4MTogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsUmVnaW9uIGV4dGVuZHMgUmVjdCB7XG4gIHkwOiBudW1iZXI7XG4gIHkxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVSZWN0KHJlY3Q6IFJlY3QpOiBSZWN0IHtcbiAgcmV0dXJuIHtcbiAgICB4MDogTWF0aC5taW4ocmVjdC54MCwgcmVjdC54MSksXG4gICAgejA6IE1hdGgubWluKHJlY3QuejAsIHJlY3QuejEpLFxuICAgIHgxOiBNYXRoLm1heChyZWN0LngwLCByZWN0LngxKSxcbiAgICB6MTogTWF0aC5tYXgocmVjdC56MCwgcmVjdC56MSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0Q29sdW1ucyhyZWN0OiBSZWN0KTogbnVtYmVyIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIHJldHVybiAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdENvbnRhaW5zKHJlY3Q6IFJlY3QsIHg6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB4ID49IHJlY3QueDAgJiYgeCA8PSByZWN0LngxICYmIHogPj0gcmVjdC56MCAmJiB6IDw9IHJlY3QuejE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBhbmRSZWN0KHJlY3Q6IFJlY3QsIGFtb3VudDogbnVtYmVyKTogUmVjdCB7XG4gIHJldHVybiB7XG4gICAgeDA6IHJlY3QueDAgLSBhbW91bnQsXG4gICAgejA6IHJlY3QuejAgLSBhbW91bnQsXG4gICAgeDE6IHJlY3QueDEgKyBhbW91bnQsXG4gICAgejE6IHJlY3QuejEgKyBhbW91bnQsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0VG9SZWdpb24ocmVjdDogUmVjdCwgeTAgPSBZX01JTiwgeTEgPSBZX01BWCAtIDEpOiBWb3hlbFJlZ2lvbiB7XG4gIHJldHVybiB7IC4uLm5vcm1hbGl6ZVJlY3QocmVjdCksIHkwLCB5MSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaW9uc092ZXJsYXAoYTogVm94ZWxSZWdpb24sIGI6IFZveGVsUmVnaW9uKTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejBcbiAgICAmJiBhLnkwIDw9IGIueTEgJiYgYS55MSA+PSBiLnkwO1xufVxuXG4vKiogSW5jbHVzaXZlIGNvbnRhaW5tZW50IG9mIGEgdm94ZWwgaW4gYSB3b3JrIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVudmVsb3BlQ29udGFpbnMocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10sIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCByIG9mIHJlY3RzKSB7XG4gICAgaWYgKHggPj0gci54MCAmJiB4IDw9IHIueDEgJiYgeSA+PSByLnkwICYmIHkgPD0gci55MSAmJiB6ID49IHIuejAgJiYgeiA8PSByLnoxKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFpbkNvbHVtbiB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogRXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uOyB0aGUgZmlyc3QgYWlyIGNlbGwgYWJvdmUgaXQuICovXG4gIHN1cmZhY2VZOiBudW1iZXI7XG4gIC8qKiBUaGUgaGlnaGVzdCBzb2xpZCB2b3hlbCwgb3IgWV9NSU4gLSAxIGlmIHRoZSBjb2x1bW4gaGFzIG5vIHNvbGlkLiAqL1xuICB0b3BTb2xpZFk6IG51bWJlcjtcbiAgdG9wTWF0ZXJpYWw6IE1hdElkO1xuICBzb2xpZDogYm9vbGVhbjtcbiAgLyoqIFdhdGVyIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlLCB1cCB0byBzZWEgbGV2ZWwuIDAgb24gZHJ5IGxhbmQuICovXG4gIHdhdGVyRGVwdGg6IG51bWJlcjtcbiAgdW5kZXJ3YXRlcjogYm9vbGVhbjtcbiAgLyoqIExhcmdlc3QgNC1uZWlnaGJvdXIgc3VyZmFjZSBzdGVwIGluIG1ldHJlcyAoMSA9IGEgc2luZ2xlIHZveGVsIHJpc2VyKS4gKi9cbiAgc2xvcGU6IG51bWJlcjtcbiAgLyoqIEZyZWUgYWlyIGNlbGxzIGFib3ZlIHRoZSBzdXJmYWNlLCBjYXBwZWQgYXQgQ0xFQVJBTkNFX1BST0JFLiAqL1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IENMRUFSQU5DRV9QUk9CRSA9IDg7XG5cbmZ1bmN0aW9uIHN1cmZhY2VBdFNhZmUod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgZmFsbGJhY2s6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxsYmFjaztcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKiBXYXRlciBkZXB0aCB0aGF0IHJlc3BlY3RzIGEgZHJ5IHBpdCBiZWxvdyBzZWEgbGV2ZWwgKHVubGlrZSBoZWlnaHQgYWxvbmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmIChzdXJmYWNlID49IFNFQV9MRVZFTCkgcmV0dXJuIDA7XG4gIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgU0VBX0xFVkVMIC0gMSwgeikgIT09IE1BVC5XQVRFUikgcmV0dXJuIDA7XG4gIHJldHVybiBTRUFfTEVWRUwgLSBzdXJmYWNlO1xufVxuXG4vKiogVHJ1ZSB3aGVuIGBoZWlnaHRgIGFpciBjZWxscyBhYm92ZSB0aGUgc3VyZmFjZSBhcmUgZnJlZSBvZiBzb2xpZCBvciB3YXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGVhcmFuY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBoZWlnaHQ7IGkrKykge1xuICAgIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgc3VyZmFjZSArIGksIHopICE9PSBNQVQuQUlSKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2x1bW5BdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCBzdXJmYWNlWSA9IHN1cmZhY2VBdCh3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3QgdG9wTWF0ZXJpYWwgPSB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHNvbGlkID0gc3VyZmFjZVkgPiBZX01JTiAmJiBpc1NvbGlkKHRvcE1hdGVyaWFsKTtcbiAgY29uc3Qgd2F0ZXJEZXB0aCA9IHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4IC0gMSwgY3osIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCArIDEsIGN6LCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3gsIGN6IC0gMSwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4LCBjeiArIDEsIHN1cmZhY2VZKSksXG4gICk7XG4gIGxldCBjbGVhcmFuY2UgPSAwO1xuICB3aGlsZSAoY2xlYXJhbmNlIDwgQ0xFQVJBTkNFX1BST0JFICYmIGdldFZveGVsKHdvcmxkLCBjeCwgc3VyZmFjZVkgKyBjbGVhcmFuY2UsIGN6KSA9PT0gTUFULkFJUikge1xuICAgIGNsZWFyYW5jZSsrO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDogY3gsIHo6IGN6LCBzdXJmYWNlWSwgdG9wU29saWRZOiBzdXJmYWNlWSAtIDEsIHRvcE1hdGVyaWFsLFxuICAgIHNvbGlkLCB3YXRlckRlcHRoLCB1bmRlcndhdGVyOiB3YXRlckRlcHRoID4gMCwgc2xvcGUsIGNsZWFyYW5jZSxcbiAgfTtcbn1cblxuLy8gRW50aXR5IGZvb3RwcmludHMgYXJlIGRlbGliZXJhdGVseSBleHBsaWNpdC4gQSB0cmVlIG9jY3VwaWVzIG1vcmUgc2l0ZSB0aGFuXG4vLyBpdHMgdHJ1bms7IGEgcGViYmxlIG9jY3VwaWVzIGxlc3MgdGhhbiBhIGJvdWxkZXIuIFRoZXNlIGFyZSBzaW11bGF0aW9uXG4vLyBjbGVhcmFuY2UgcmFkaWksIG5vdCByZW5kZXIgYm91bmRzLlxuZXhwb3J0IGNvbnN0IE9CU1RSVUNUSU9OX1JBRElVUzogUmVjb3JkPEFjdGl2ZUVudGl0eUtpbmQsIG51bWJlcj4gPSB7XG4gIHN0eWxfdHJlZV9zcGlyZTogMS41LFxuICBzdHlsX3RyZWVfdGFibGU6IDEuOCxcbiAgc3R5bF90cmVlX2NsdXN0ZXI6IDEuOSxcbiAgc3R5bF90cmVlX2Jsb3Nzb206IDEuNixcbiAgc3R5bF9zaHJ1YjogMC42LFxuICBzdHlsX29yZTogMC45LFxuICBzdHlsX2NhaXJuOiAwLjgsXG4gIHdheXN0b25lOiAxLjQsXG4gIG1hcmtlcjogMC41LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBPYnN0cnVjdGlvbiB7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByYWRpdXM6IG51bWJlcjtcbiAgLyoqIEZvb3RwcmludCBjZWxscyBvdmVybGFwcGVkIGJ5IHRoaXMgZW50aXR5LiAqL1xuICBjZWxsczogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlDaHVua3NGb3JSZWN0KHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCk6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIC8vIEEgcmVjdCBvd25zIHdob2xlIHZveGVsIGNlbGxzLiBJbmNsdWRlIGV2ZXJ5IGNodW5rIHdob3NlIHJvb3QgY291bGQgb3ZlcmxhcFxuICAvLyB0aG9zZSBjZWxscywgd2l0aG91dCBzY2FubmluZyB0aGUgZW50aXJlIDIwNDggbSB3b3JsZC5cbiAgY29uc3QgcmFkaXVzID0gTWF0aC5tYXgoLi4uT2JqZWN0LnZhbHVlcyhPQlNUUlVDVElPTl9SQURJVVMpLCAxLjUpO1xuICBjb25zdCBtaW5DZWxsWCA9IE1hdGguZmxvb3Ioci54MCArIDAuNSAtIHJhZGl1cyk7XG4gIGNvbnN0IG1heENlbGxYID0gTWF0aC5jZWlsKHIueDEgKyAwLjUgKyByYWRpdXMpIC0gMTtcbiAgY29uc3QgbWluQ2VsbFogPSBNYXRoLmZsb29yKHIuejAgKyAwLjUgLSByYWRpdXMpO1xuICBjb25zdCBtYXhDZWxsWiA9IE1hdGguY2VpbChyLnoxICsgMC41ICsgcmFkaXVzKSAtIDE7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1gobWluQ2VsbFgpKSwgY3gxID0gd29ybGRUb0NodW5rWChtYXhDZWxsWCk7XG4gIGNvbnN0IGN6MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1oobWluQ2VsbFopKSwgY3oxID0gd29ybGRUb0NodW5rWihtYXhDZWxsWik7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSBrZXlzLnB1c2goY2h1bmtLZXkoY3gsIGN6KSk7XG4gIH1cbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKiBFbnRpdGllcyB3aG9zZSBzaW11bGF0aW9uIGZvb3RwcmludCBvdmVybGFwcyB0aGUgcmVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvYnN0cnVjdGlvbnNJbih3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgb3V0OiBPYnN0cnVjdGlvbltdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGVudGl0eUNodW5rc0ZvclJlY3Qod29ybGQsIHIpKSB7XG4gICAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghaWRzKSBjb250aW51ZTtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgICAgaWYgKHNlZW4uaGFzKGlkKSkgY29udGludWU7XG4gICAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIGNvbnRpbnVlO1xuICAgICAgc2Vlbi5hZGQoaWQpO1xuICAgICAgY29uc3QgcmFkaXVzID0gaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZClcbiAgICAgICAgPyBlLmtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gMC42IDogZS5raW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyAxLjEgOiAxLjVcbiAgICAgICAgOiBPQlNUUlVDVElPTl9SQURJVVNbZS5raW5kIGFzIEFjdGl2ZUVudGl0eUtpbmRdO1xuICAgICAgbGV0IGNlbGxzID0gMDtcbiAgICAgIGNvbnN0IGV4MCA9IE1hdGgubWF4KHIueDAsIE1hdGguZmxvb3IoZS54IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBleDEgPSBNYXRoLm1pbihyLngxLCBNYXRoLmNlaWwoZS54ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejAgPSBNYXRoLm1heChyLnowLCBNYXRoLmZsb29yKGUueiAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXoxID0gTWF0aC5taW4oci56MSwgTWF0aC5jZWlsKGUueiArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgZm9yIChsZXQgeiA9IGV6MDsgeiA8PSBlejE7IHorKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gZXgwOyB4IDw9IGV4MTsgeCsrKSB7XG4gICAgICAgICAgaWYgKE1hdGguaHlwb3QoZS54IC0gKHggKyAwLjUpLCBlLnogLSAoeiArIDAuNSkpIDw9IHJhZGl1cykgY2VsbHMrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGNlbGxzID4gMCkge1xuICAgICAgICBvdXQucHVzaCh7IGVudGl0eUlkOiBlLmlkLCBraW5kOiBlLmtpbmQsIHg6IGUueCwgejogZS56LCByYWRpdXMsIGNlbGxzIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBvdXQuc29ydCgoYSwgYikgPT4gKGEuZW50aXR5SWQgPCBiLmVudGl0eUlkID8gLTEgOiBhLmVudGl0eUlkID4gYi5lbnRpdHlJZCA/IDEgOiAwKSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXJlYVN0YXRzIHtcbiAgcmVjdDogUmVjdDtcbiAgY29sdW1uczogbnVtYmVyO1xuICBtaW5ZOiBudW1iZXI7XG4gIG1heFk6IG51bWJlcjtcbiAgbWVhblk6IG51bWJlcjtcbiAgcmVsaWVmOiBudW1iZXI7XG4gIG1heFN0ZXA6IG51bWJlcjtcbiAgd2F0ZXJDb2x1bW5zOiBudW1iZXI7XG4gIHN0b25lQ29sdW1uczogbnVtYmVyO1xuICBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj47XG4gIG9ic3RydWN0aW9uczogT2JzdHJ1Y3Rpb25bXTtcbiAgb2JzdHJ1Y3RlZENvbHVtbnM6IG51bWJlcjtcbiAgLyoqIEN1dC9maWxsIHJlbGF0aXZlIHRvIGZsb29yWSB3aGVuIHN1cHBsaWVkLCBvdGhlcndpc2UgMC4gKi9cbiAgZmxvb3JZOiBudW1iZXIgfCBudWxsO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cHBvcnRTdW1tYXJ5IHtcbiAgdG90YWw6IG51bWJlcjtcbiAgbGV2ZWw6IG51bWJlcjtcbiAgY3V0OiBudW1iZXI7XG4gIGZpbGw6IG51bWJlcjtcbiAgd2F0ZXI6IG51bWJlcjtcbiAgLyoqIEZpbGwgZGVlcGVyIHRoYW4gOCBtOyBhIHZhbGlkYXRvciBtYXkgcmVqZWN0IHRoZXNlIGFzIHVuc3VwcG9ydGVkLiAqL1xuICBkZWVwRmlsbDogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZvb3RwcmludFF1ZXJ5IHtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHN0YXRzOiBBcmVhU3RhdHM7XG4gIHN1cHBvcnQ6IFN1cHBvcnRTdW1tYXJ5O1xuICBvYnN0cnVjdGlvbnM6IE9ic3RydWN0aW9uW107XG4gIC8qKiBDZWxscyBpbiB0aGUgYnVpbGRpbmcgdm9sdW1lIGFib3ZlIHRoZSBwcmVwYXJlZCBmbG9vciB0aGF0IGFyZSBub3QgYWlyLiAqL1xuICBvdmVyaGFuZ0NlbGxzOiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IG1hdGVyaWFsOiBNYXRJZCB9Pjtcbn1cblxuLyoqXG4gKiBDYWNoZWQgcXVlcnkgY29udGV4dC4gQ2FjaGVzIGFyZSBrZXllZCBvbiB3b3JsZC5yZXZpc2lvbjogYSB2b3hlbCBvciBlbnRpdHlcbiAqIGVkaXQgaW52YWxpZGF0ZXMgdGhlbSwgd2hpbGUgbWVzaC9uYXYgcmVidWlsZHMgZG8gbm90LiBVc2Ugb25lIGNvbnRleHQgZm9yIGFcbiAqIHNpdGUgc2VhcmNoIG9yIGEgZm9vdHByaW50IGV2YWx1YXRpb24sIHRoZW4gZGlzY2FyZCBpdC5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlcnJhaW5RdWVyeSB7XG4gIHByaXZhdGUgY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgVGVycmFpbkNvbHVtbj4oKTtcbiAgcHJpdmF0ZSBvYnN0cnVjdGlvbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIE9ic3RydWN0aW9uW10+KCk7XG4gIHByaXZhdGUgcmV2aXNpb246IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgd29ybGQ6IFdvcmxkKSB7XG4gICAgdGhpcy5yZXZpc2lvbiA9IHdvcmxkLnJldmlzaW9uO1xuICB9XG5cbiAgcHJpdmF0ZSBzeW5jKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnJldmlzaW9uICE9PSB0aGlzLndvcmxkLnJldmlzaW9uKSB7XG4gICAgICB0aGlzLmNhY2hlLmNsZWFyKCk7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuY2xlYXIoKTtcbiAgICAgIHRoaXMucmV2aXNpb24gPSB0aGlzLndvcmxkLnJldmlzaW9uO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBDYWNoZWQgZW50aXR5IG9ic3RydWN0aW9ucyBmb3Igb25lIGZvb3RwcmludC4gKi9cbiAgb2JzdHJ1Y3Rpb25zRm9yKHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBrZXkgPSBgJHtyLngwfSwke3IuejB9LCR7ci54MX0sJHtyLnoxfWA7XG4gICAgbGV0IGxpc3QgPSB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuZ2V0KGtleSk7XG4gICAgaWYgKCFsaXN0KSB7XG4gICAgICBsaXN0ID0gb2JzdHJ1Y3Rpb25zSW4odGhpcy53b3JsZCwgcik7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuc2V0KGtleSwgbGlzdCk7XG4gICAgfVxuICAgIHJldHVybiBsaXN0O1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgY3ggPSBNYXRoLmZsb29yKHgpLCBjeiA9IE1hdGguZmxvb3Ioeik7XG4gICAgY29uc3Qga2V5ID0gYCR7Y3h9LCR7Y3p9YDtcbiAgICBsZXQgY29sID0gdGhpcy5jYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAoIWNvbCkge1xuICAgICAgY29sID0gY29sdW1uQXQodGhpcy53b3JsZCwgY3gsIGN6KTtcbiAgICAgIHRoaXMuY2FjaGUuc2V0KGtleSwgY29sKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbDtcbiAgfVxuXG4gIGFyZWEocmVjdDogUmVjdCwgZmxvb3JZPzogbnVtYmVyKTogQXJlYVN0YXRzIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBsZXQgbWluWSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgICBsZXQgbWF4WSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgICBsZXQgc3VtID0gMDtcbiAgICBsZXQgbWF4U3RlcCA9IDA7XG4gICAgbGV0IHdhdGVyQ29sdW1ucyA9IDA7XG4gICAgbGV0IHN0b25lQ29sdW1ucyA9IDA7XG4gICAgbGV0IGN1dFZvbHVtZSA9IDA7XG4gICAgbGV0IGZpbGxWb2x1bWUgPSAwO1xuICAgIGxldCBtYXhDdXQgPSAwO1xuICAgIGxldCBtYXhGaWxsID0gMDtcbiAgICBjb25zdCBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj4gPSB7fTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgbWF4WSA9IE1hdGgubWF4KG1heFksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIHN1bSArPSBjb2wuc3VyZmFjZVk7XG4gICAgICAgIG1heFN0ZXAgPSBNYXRoLm1heChtYXhTdGVwLCBjb2wuc2xvcGUpO1xuICAgICAgICBpZiAoY29sLndhdGVyRGVwdGggPiAwKSB3YXRlckNvbHVtbnMrKztcbiAgICAgICAgaWYgKGNvbC50b3BNYXRlcmlhbCA9PT0gTUFULlNUT05FKSBzdG9uZUNvbHVtbnMrKztcbiAgICAgICAgbWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPSAobWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPz8gMCkgKyAxO1xuICAgICAgICBpZiAoZmxvb3JZICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgICBpZiAoZHkgPiAwKSB7XG4gICAgICAgICAgICBjdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgICBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGR5KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgICAgZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgICBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgLWR5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBvYnN0cnVjdGlvbnMgPSB0aGlzLm9ic3RydWN0aW9uc0ZvcihyKTtcbiAgICBjb25zdCBvYnN0cnVjdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBvIG9mIG9ic3RydWN0aW9ucykge1xuICAgICAgY29uc3QgcmFkaXVzID0gby5yYWRpdXM7XG4gICAgICBjb25zdCBleDAgPSBNYXRoLm1heChyLngwLCBNYXRoLmZsb29yKG8ueCAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXgxID0gTWF0aC5taW4oci54MSwgTWF0aC5jZWlsKG8ueCArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXowID0gTWF0aC5tYXgoci56MCwgTWF0aC5mbG9vcihvLnogLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MSA9IE1hdGgubWluKHIuejEsIE1hdGguY2VpbChvLnogKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGZvciAobGV0IHogPSBlejA7IHogPD0gZXoxOyB6KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IGV4MDsgeCA8PSBleDE7IHgrKykge1xuICAgICAgICAgIGlmIChNYXRoLmh5cG90KG8ueCAtICh4ICsgMC41KSwgby56IC0gKHogKyAwLjUpKSA8PSByYWRpdXMpIG9ic3RydWN0ZWQuYWRkKGAke3h9LCR7en1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNvbHVtbnMgPSAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xuICAgIHJldHVybiB7XG4gICAgICByZWN0OiByLFxuICAgICAgY29sdW1ucyxcbiAgICAgIG1pblksIG1heFksXG4gICAgICBtZWFuWTogTWF0aC5yb3VuZCgoc3VtIC8gY29sdW1ucykgKiAxMDAwKSAvIDEwMDAsXG4gICAgICByZWxpZWY6IG1heFkgLSBtaW5ZLFxuICAgICAgbWF4U3RlcCxcbiAgICAgIHdhdGVyQ29sdW1ucyxcbiAgICAgIHN0b25lQ29sdW1ucyxcbiAgICAgIG1hdGVyaWFscyxcbiAgICAgIG9ic3RydWN0aW9ucyxcbiAgICAgIG9ic3RydWN0ZWRDb2x1bW5zOiBvYnN0cnVjdGVkLnNpemUsXG4gICAgICBmbG9vclk6IGZsb29yWSA/PyBudWxsLFxuICAgICAgY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dCxcbiAgICAgIG1heEZpbGwsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFdmFsdWF0ZSBhIGNvbXBsZXRlIGJ1aWxkaW5nIGZvb3RwcmludC4gYGZsb29yWWAgaXMgdGhlIHByZXBhcmVkIHdhbGtpbmdcbiAgICogZmxvb3I6IHRlcnJhaW4gYWJvdmUgaXQgaXMgY3V0LCB0ZXJyYWluIGJlbG93IGl0IGlzIGZpbGxlZC4gVGhlIHJlc3VsdCBpc1xuICAgKiByYXcgc2l0ZSBkYXRhOyBjb25zdHJ1Y3Rpb24gcnVsZXMgbGl2ZSBpbiBjb25zdHJ1Y3Rpb24udHMuXG4gICAqL1xuICBmb290cHJpbnQocmVjdDogUmVjdCwgZmxvb3JZOiBudW1iZXIpOiBGb290cHJpbnRRdWVyeSB7XG4gICAgY29uc3Qgc3RhdHMgPSB0aGlzLmFyZWEocmVjdCwgZmxvb3JZKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBzdXBwb3J0OiBTdXBwb3J0U3VtbWFyeSA9IHtcbiAgICAgIHRvdGFsOiBzdGF0cy5jb2x1bW5zLCBsZXZlbDogMCwgY3V0OiAwLCBmaWxsOiAwLCB3YXRlcjogMCwgZGVlcEZpbGw6IDAsXG4gICAgICBtYXhDdXQ6IDAsIG1heEZpbGw6IDAsIGN1dFZvbHVtZTogMCwgZmlsbFZvbHVtZTogMCxcbiAgICB9O1xuICAgIGNvbnN0IG92ZXJoYW5nQ2VsbHM6IEZvb3RwcmludFF1ZXJ5WydvdmVyaGFuZ0NlbGxzJ10gPSBbXTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgaWYgKGR5ID4gMCkge1xuICAgICAgICAgIHN1cHBvcnQuY3V0Kys7XG4gICAgICAgICAgc3VwcG9ydC5jdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhDdXQgPSBNYXRoLm1heChzdXBwb3J0Lm1heEN1dCwgZHkpO1xuICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgIHN1cHBvcnQuZmlsbCsrO1xuICAgICAgICAgIHN1cHBvcnQuZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhGaWxsID0gTWF0aC5tYXgoc3VwcG9ydC5tYXhGaWxsLCAtZHkpO1xuICAgICAgICAgIGlmICgtZHkgPiA4KSBzdXBwb3J0LmRlZXBGaWxsKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VwcG9ydC5sZXZlbCsrO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb2wud2F0ZXJEZXB0aCA+IDApIHN1cHBvcnQud2F0ZXIrKztcblxuICAgICAgICAvLyBBbiBvdmVyaGFuZyBpcyB0ZXJyYWluIGFib3ZlIHRoZSBmbG9vciB0aGF0IHN1cnZpdmVzIHRoZSBjdXQgcGxhbmUuXG4gICAgICAgIC8vIEZvciBhIGNvbHVtbiBiZWxvdyB0aGUgZmxvb3IsIGl0cyBzb2xpZCBib2R5IGlzIGZpbGwsIG5vdCBvdmVyaGFuZy5cbiAgICAgICAgY29uc3Qgc3RhcnQgPSBNYXRoLm1heChmbG9vclksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8IHN0YXJ0ICsgNDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgbSA9IGdldFZveGVsKHRoaXMud29ybGQsIHgsIHksIHopIGFzIE1hdElkO1xuICAgICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSBvdmVyaGFuZ0NlbGxzLnB1c2goeyB4LCB5LCB6LCBtYXRlcmlhbDogbSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IHJlY3Q6IHIsIGZsb29yWSwgc3RhdHMsIHN1cHBvcnQsIG9ic3RydWN0aW9uczogc3RhdHMub2JzdHJ1Y3Rpb25zLCBvdmVyaGFuZ0NlbGxzIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBtb3ZlbWVudCBjb250cmFjdCAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdhbGtQYXJhbXMge1xuICBtYXhTdGVwVXA6IG51bWJlcjtcbiAgbWF4U3RlcERvd246IG51bWJlcjtcbiAgbWF4V2F0ZXJEZXB0aDogbnVtYmVyO1xuICAvKiogTWF4aW11bSBhZGphY2VudCBzdXJmYWNlIHN0ZXA7IDEuMCBpcyBhIDQ1IGRlZ3JlZSB2b3hlbCByaXNlci4gKi9cbiAgbWF4U2xvcGU6IG51bWJlcjtcbiAgY2xlYXJhbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1dBTEs6IFdhbGtQYXJhbXMgPSB7XG4gIG1heFN0ZXBVcDogMS4wLFxuICBtYXhTdGVwRG93bjogMS41LFxuICBtYXhXYXRlckRlcHRoOiAwLjQsXG4gIG1heFNsb3BlOiAxLjAsXG4gIGNsZWFyYW5jZTogMi4wLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBXYWxrUmVzdWx0IHtcbiAgb2s6IGJvb2xlYW47XG4gIHJlYXNvbjogJ29rJyB8ICdub3RfYWRqYWNlbnQnIHwgJ3N0ZXBfdXAnIHwgJ2ZhbGwnIHwgJ3dhdGVyJyB8ICdzbG9wZScgfCAnY2xlYXJhbmNlJztcbiAgc3RlcDogbnVtYmVyO1xuICB3YXRlckRlcHRoOiBudW1iZXI7XG59XG5cbi8qKiBFdmFsdWF0ZSBvbmUgZ3JpZCBzdGVwLiBQYXRocyBhcmUgdmFsaWRhdGVkIHdpdGggdGhlIHNhbWUgY29udHJhY3QuICovXG5leHBvcnQgZnVuY3Rpb24gd2Fsa1N0ZXAoXG4gIHdvcmxkOiBXb3JsZCwgZnJvbVg6IG51bWJlciwgZnJvbVo6IG51bWJlciwgdG9YOiBudW1iZXIsIHRvWjogbnVtYmVyLFxuICBwYXJhbXM6IFdhbGtQYXJhbXMgPSBERUZBVUxUX1dBTEssXG4pOiBXYWxrUmVzdWx0IHtcbiAgY29uc3QgZHggPSBNYXRoLmFicyhNYXRoLmZsb29yKHRvWCkgLSBNYXRoLmZsb29yKGZyb21YKSk7XG4gIGNvbnN0IGR6ID0gTWF0aC5hYnMoTWF0aC5mbG9vcih0b1opIC0gTWF0aC5mbG9vcihmcm9tWikpO1xuICBpZiAoZHggKyBkeiAhPT0gMSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnbm90X2FkamFjZW50Jywgc3RlcDogMCwgd2F0ZXJEZXB0aDogMCB9O1xuICB9XG4gIGNvbnN0IGZyb20gPSBjb2x1bW5BdCh3b3JsZCwgZnJvbVgsIGZyb21aKTtcbiAgY29uc3QgdG8gPSBjb2x1bW5BdCh3b3JsZCwgdG9YLCB0b1opO1xuICBjb25zdCBzdGVwID0gdG8uc3VyZmFjZVkgLSBmcm9tLnN1cmZhY2VZO1xuICBpZiAoc3RlcCA+IHBhcmFtcy5tYXhTdGVwVXApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RlcF91cCcsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKC1zdGVwID4gcGFyYW1zLm1heFN0ZXBEb3duKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2ZhbGwnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by53YXRlckRlcHRoID4gcGFyYW1zLm1heFdhdGVyRGVwdGgpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnd2F0ZXInLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by5zbG9wZSA+IHBhcmFtcy5tYXhTbG9wZSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzbG9wZScsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKCFjbGVhcmFuY2VBdCh3b3JsZCwgdG9YLCB0b1osIHBhcmFtcy5jbGVhcmFuY2UpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdjbGVhcmFuY2UnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIHJlYXNvbjogJ29rJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xufVxuXG4vKiogRWZmZWN0aXZlIGdyYWRlIG9mIGEgc3RyYWlnaHQgcGF0aCBzZWdtZW50LCB1c2VkIGJ5IHBhdGggdmFsaWRhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZmZlY3RpdmVHcmFkZSh3b3JsZDogV29ybGQsIHgwOiBudW1iZXIsIHowOiBudW1iZXIsIHgxOiBudW1iZXIsIHoxOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBhID0gY29sdW1uQXQod29ybGQsIHgwLCB6MCk7XG4gIGNvbnN0IGIgPSBjb2x1bW5BdCh3b3JsZCwgeDEsIHoxKTtcbiAgY29uc3QgcnVuID0gTWF0aC5oeXBvdCh4MSAtIHgwLCB6MSAtIHowKTtcbiAgaWYgKHJ1biA9PT0gMCkgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKTtcbiAgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKSAvIHJ1bjtcbn1cbiIsICIvLyBNMDAyIHNpdGUgdmFsaWRhdGlvbiwgY2FuZGlkYXRlIHNlYXJjaCBhbmQgcHJldmlldyBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLlxuLy9cbi8vIFRoaXMgaXMgdGhlIHNoYXJlZCBnYXRlIGZvciB0aGUgcGxheWVyIGFuZCB0aGUgQUkgYWdlbnQuIE5laXRoZXIgbWF5IHBsYWNlIGFcbi8vIHN0cnVjdHVyZSBieSBhbnkgb3RoZXIgcGF0aDogYm90aCBzdWJtaXQgYSBTaXRlUHJvcG9zYWwsIGJvdGggcmVjZWl2ZSB0aGVcbi8vIHNhbWUgU2l0ZVZhbGlkYXRpb24sIGFuZCBib3RoIG11c3QgcGFzcyB0aGUgQXV0aG9yaXplciBiZWZvcmUgZXhlY3V0aW9uLlxuLy9cbi8vIFRoZSB2YWxpZGF0b3IgZGVzY3JpYmVzIHRoZSBzaXRlIGFzIGl0IGlzLiBJdCBkb2VzIG5vdCBlZGl0IHZveGVscywgcmVtb3ZlXG4vLyBlbnRpdGllcyBvciBzcGVuZCByZXNvdXJjZXMuIFByZXBhcmF0aW9uIGlzIGEgc2VwYXJhdGUsIGF1dGhvcml6ZWQgc3RlcC5cbmltcG9ydCB7IFdvcmxkLCBIQUxGLCBZX01JTiwgWV9NQVgsIHN1cmZhY2VBdCB9IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIEZvb3RwcmludFF1ZXJ5LCBUZXJyYWluUXVlcnksIEFyZWFTdGF0cyxcbiAgbm9ybWFsaXplUmVjdCwgZXhwYW5kUmVjdCwgcmVjdENvbHVtbnMsIGVmZmVjdGl2ZUdyYWRlLCB3YWxrU3RlcCwgV2Fsa1BhcmFtcyxcbiAgREVGQVVMVF9XQUxLLCBjb2x1bW5BdCxcbn0gZnJvbSAnLi90ZXJyYWluJztcblxuZXhwb3J0IHR5cGUgU2l0ZVN0YXRlID0gJ3ZhbGlkJyB8ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJyB8ICdpbnZhbGlkJztcblxuZXhwb3J0IHR5cGUgVmFsaWRhdGlvbkNvZGUgPVxuICB8ICdvdXRfb2ZfYm91bmRzJ1xuICB8ICdmb290cHJpbnRfbWlzbWF0Y2gnXG4gIHwgJ3Nsb3BlX2V4Y2VlZGVkJ1xuICB8ICdzdGVwX2V4Y2VlZGVkJ1xuICB8ICdjdXRfZXhjZWVkZWQnXG4gIHwgJ2ZpbGxfZXhjZWVkZWQnXG4gIHwgJ2N1dF92b2x1bWVfZXhjZWVkZWQnXG4gIHwgJ2ZpbGxfdm9sdW1lX2V4Y2VlZGVkJ1xuICB8ICdmb290cHJpbnRfb2JzdHJ1Y3RlZCdcbiAgfCAnd2F0ZXInXG4gIHwgJ292ZXJoYW5nJ1xuICB8ICduZWVkc19ncmFkaW5nJ1xuICB8ICduZWVkc19jbGVhcmluZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmFsaWRhdGlvblJlYXNvbiB7XG4gIGNvZGU6IFZhbGlkYXRpb25Db2RlO1xuICBzZXZlcml0eTogJ2Vycm9yJyB8ICdwcmVwYXJhdGlvbic7XG4gIG1lc3NhZ2U6IHN0cmluZztcbiAgdmFsdWU/OiBudW1iZXI7XG4gIGxpbWl0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBGb3VuZGF0aW9uVHlwZSA9ICdncmFkZWRfcGFkJyB8ICdzdGVwcGVkX3BsaW50aCcgfCAnZGVjayc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbGRpbmdSdWxlcyB7XG4gIGlkOiBzdHJpbmc7XG4gIHdpZHRoOiBudW1iZXI7XG4gIGRlcHRoOiBudW1iZXI7XG4gIHdhbGxIZWlnaHQ6IG51bWJlcjtcbiAgY2xlYXJhbmNlOiBudW1iZXI7XG4gIC8qKiBSZWxpZWYgYXQgb3IgYmVsb3cgdGhpcyBuZWVkcyBubyBncmFkaW5nIHRvIGJlIGNhbGxlZCB2YWxpZC4gKi9cbiAgbWF4UmVsaWVmTm9QcmVwOiBudW1iZXI7XG4gIC8qKiBSZWxpZWYgYWJvdmUgdGhpcyBjYW5ub3QgYmUgcHJlcGFyZWQgYnkgdGhpcyBidWlsZGluZyB0eXBlLiAqL1xuICBtYXhSZWxpZWZQcmVwYXJlZDogbnVtYmVyO1xuICBtYXhTdGVwOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG1heEN1dFZvbHVtZTogbnVtYmVyO1xuICBtYXhGaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heE9ic3RydWN0aW9uczogbnVtYmVyO1xuICByZXF1aXJlc0RyeTogYm9vbGVhbjtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblR5cGU7XG59XG5cbmV4cG9ydCBjb25zdCBIT1VTRV9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdob3VzZS04eDYnLFxuICB3aWR0aDogOCxcbiAgZGVwdGg6IDYsXG4gIHdhbGxIZWlnaHQ6IDMsXG4gIGNsZWFyYW5jZTogMyxcbiAgbWF4UmVsaWVmTm9QcmVwOiAxLjIsXG4gIG1heFJlbGllZlByZXBhcmVkOiA0LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMixcbiAgbWF4RmlsbDogMixcbiAgbWF4Q3V0Vm9sdW1lOiA0OCxcbiAgbWF4RmlsbFZvbHVtZTogNDgsXG4gIG1heE9ic3RydWN0aW9uczogMCxcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdncmFkZWRfcGFkJyxcbn07XG5cbmV4cG9ydCBjb25zdCBGQVJNX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ2Zhcm0tMTJ4OCcsXG4gIHdpZHRoOiAxMixcbiAgZGVwdGg6IDgsXG4gIHdhbGxIZWlnaHQ6IDAsXG4gIGNsZWFyYW5jZTogMSxcbiAgbWF4UmVsaWVmTm9QcmVwOiAxLjIsXG4gIG1heFJlbGllZlByZXBhcmVkOiA2LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMixcbiAgbWF4RmlsbDogMixcbiAgbWF4Q3V0Vm9sdW1lOiA5NixcbiAgbWF4RmlsbFZvbHVtZTogOTYsXG4gIG1heE9ic3RydWN0aW9uczogNCxcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdzdGVwcGVkX3BsaW50aCcsXG59O1xuXG5leHBvcnQgY29uc3QgUEFUSF9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdwYXRoLTl4MycsXG4gIHdpZHRoOiA5LFxuICBkZXB0aDogMyxcbiAgd2FsbEhlaWdodDogMCxcbiAgY2xlYXJhbmNlOiAxLFxuICBtYXhSZWxpZWZOb1ByZXA6IDIuMCxcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDQuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAxLFxuICBtYXhGaWxsOiAxLFxuICBtYXhDdXRWb2x1bWU6IDMyLFxuICBtYXhGaWxsVm9sdW1lOiAzMixcbiAgbWF4T2JzdHJ1Y3Rpb25zOiAyLFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ2RlY2snLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBTaXRlUHJvcG9zYWwge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uU3VtbWFyeSB7XG4gIG5lZWRzR3JhZGluZzogYm9vbGVhbjtcbiAgbmVlZHNDbGVhcmluZzogYm9vbGVhbjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25JZHM6IHN0cmluZ1tdO1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uVHlwZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlVmFsaWRhdGlvbiB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW107XG4gIHF1ZXJ5OiBGb290cHJpbnRRdWVyeTtcbiAgcHJlcGFyYXRpb246IFByZXBhcmF0aW9uU3VtbWFyeTtcbn1cblxuZnVuY3Rpb24gZXJyb3IoY29kZTogVmFsaWRhdGlvbkNvZGUsIG1lc3NhZ2U6IHN0cmluZywgdmFsdWU/OiBudW1iZXIsIGxpbWl0PzogbnVtYmVyKTogVmFsaWRhdGlvblJlYXNvbiB7XG4gIHJldHVybiB7IGNvZGUsIHNldmVyaXR5OiAnZXJyb3InLCBtZXNzYWdlLCB2YWx1ZSwgbGltaXQgfTtcbn1cblxuZnVuY3Rpb24gcHJlcChjb2RlOiBWYWxpZGF0aW9uQ29kZSwgbWVzc2FnZTogc3RyaW5nLCB2YWx1ZT86IG51bWJlciwgbGltaXQ/OiBudW1iZXIpOiBWYWxpZGF0aW9uUmVhc29uIHtcbiAgcmV0dXJuIHsgY29kZSwgc2V2ZXJpdHk6ICdwcmVwYXJhdGlvbicsIG1lc3NhZ2UsIHZhbHVlLCBsaW1pdCB9O1xufVxuXG4vKipcbiAqIFZhbGlkYXRlIGEgcHJvcG9zZWQgc2l0ZSBhZ2FpbnN0IGl0cyBidWlsZGluZyBydWxlcy4gUHVyZTogbm8gdm94ZWxzLFxuICogZW50aXRpZXMgb3IgcmVzb3VyY2VzIGNoYW5nZS4gYHF1ZXJ5YCBtYXkgYmUgc3VwcGxpZWQgYnkgYSBzZWFyY2ggdG8gcmV1c2VcbiAqIHRoZSBjYWNoZWQgY29sdW1ucywgYW5kIGBmb290cHJpbnRgIG1heSBiZSBzdXBwbGllZCB3aGVuIHRoZSBjYWxsZXIgYWxyZWFkeVxuICogZXZhbHVhdGVkIHRoZSBzYW1lIHJlY3QvZmxvb3IgcGFpci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlU2l0ZShcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpLFxuICBmb290cHJpbnQ/OiBGb290cHJpbnRRdWVyeSxcbik6IFNpdGVWYWxpZGF0aW9uIHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHJ1bGVzID0gcHJvcG9zYWwucnVsZXM7XG4gIGNvbnN0IHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXSA9IFtdO1xuICBjb25zdCBmcCA9IGZvb3RwcmludCA/PyBxdWVyeS5mb290cHJpbnQocmVjdCwgcHJvcG9zYWwuZmxvb3JZKTtcbiAgY29uc3Qgc3RhdHMgPSBmcC5zdGF0cztcblxuICBpZiAocmVjdC54MCA8IC1IQUxGIHx8IHJlY3QuejAgPCAtSEFMRiB8fCByZWN0LngxID49IEhBTEYgfHwgcmVjdC56MSA+PSBIQUxGKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKCdvdXRfb2ZfYm91bmRzJywgYGZvb3RwcmludCAke3JlY3QueDB9LCR7cmVjdC56MH0uLiR7cmVjdC54MX0sJHtyZWN0LnoxfSBpcyBvdXRzaWRlIHRoZSB3b3JsZGApKTtcbiAgfVxuICBpZiAocmVjdC54MSAtIHJlY3QueDAgKyAxICE9PSBydWxlcy53aWR0aCB8fCByZWN0LnoxIC0gcmVjdC56MCArIDEgIT09IHJ1bGVzLmRlcHRoKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2Zvb3RwcmludF9taXNtYXRjaCcsXG4gICAgICBgZm9vdHByaW50IGlzICR7cmVjdC54MSAtIHJlY3QueDAgKyAxfSB4ICR7cmVjdC56MSAtIHJlY3QuejAgKyAxfSBtLCAke3J1bGVzLndpZHRofSB4ICR7cnVsZXMuZGVwdGh9IG0gcmVxdWlyZWRgLFxuICAgICkpO1xuICB9XG5cbiAgaWYgKHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZlByZXBhcmVkKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3Nsb3BlX2V4Y2VlZGVkJyxcbiAgICAgIGByZWxpZWYgJHtzdGF0cy5yZWxpZWZ9IG0gZXhjZWVkcyB0aGUgJHtydWxlcy5tYXhSZWxpZWZQcmVwYXJlZH0gbSBwcmVwYXJlZCBsaW1pdGAsXG4gICAgICBzdGF0cy5yZWxpZWYsIHJ1bGVzLm1heFJlbGllZlByZXBhcmVkLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhTdGVwID4gcnVsZXMubWF4U3RlcCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdzdGVwX2V4Y2VlZGVkJyxcbiAgICAgIGBzdXJmYWNlIHN0ZXAgJHtzdGF0cy5tYXhTdGVwfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhTdGVwfSBtYCxcbiAgICAgIHN0YXRzLm1heFN0ZXAsIHJ1bGVzLm1heFN0ZXAsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEN1dCA+IHJ1bGVzLm1heEN1dCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdjdXRfZXhjZWVkZWQnLFxuICAgICAgYGN1dCAke3N0YXRzLm1heEN1dH0gbSBleGNlZWRzICR7cnVsZXMubWF4Q3V0fSBtYCxcbiAgICAgIHN0YXRzLm1heEN1dCwgcnVsZXMubWF4Q3V0LFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhGaWxsID4gcnVsZXMubWF4RmlsbCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmaWxsX2V4Y2VlZGVkJyxcbiAgICAgIGBmaWxsICR7c3RhdHMubWF4RmlsbH0gbSBleGNlZWRzICR7cnVsZXMubWF4RmlsbH0gbWAsXG4gICAgICBzdGF0cy5tYXhGaWxsLCBydWxlcy5tYXhGaWxsLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5jdXRWb2x1bWUgPiBydWxlcy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnY3V0X3ZvbHVtZV9leGNlZWRlZCcsXG4gICAgICBgY3V0IHZvbHVtZSAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4Q3V0Vm9sdW1lfSBtXHUwMEIzYCxcbiAgICAgIHN0YXRzLmN1dFZvbHVtZSwgcnVsZXMubWF4Q3V0Vm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5maWxsVm9sdW1lID4gcnVsZXMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmaWxsX3ZvbHVtZV9leGNlZWRlZCcsXG4gICAgICBgZmlsbCB2b2x1bWUgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsVm9sdW1lfSBtXHUwMEIzYCxcbiAgICAgIHN0YXRzLmZpbGxWb2x1bWUsIHJ1bGVzLm1heEZpbGxWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHJ1bGVzLnJlcXVpcmVzRHJ5ICYmIHN0YXRzLndhdGVyQ29sdW1ucyA+IDApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnd2F0ZXInLFxuICAgICAgYCR7c3RhdHMud2F0ZXJDb2x1bW5zfSBmb290cHJpbnQgY29sdW1ucyBhcmUgdW5kZXJ3YXRlcmAsXG4gICAgICBzdGF0cy53YXRlckNvbHVtbnMsIDAsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPiBydWxlcy5tYXhPYnN0cnVjdGlvbnMpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZm9vdHByaW50X29ic3RydWN0ZWQnLFxuICAgICAgYCR7c3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIGV4Y2VlZCB0aGUgJHtydWxlcy5tYXhPYnN0cnVjdGlvbnN9IGFsbG93YW5jZWAsXG4gICAgICBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoLCBydWxlcy5tYXhPYnN0cnVjdGlvbnMsXG4gICAgKSk7XG4gIH1cbiAgaWYgKGZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RoID4gMCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdvdmVyaGFuZycsXG4gICAgICBgJHtmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aH0gY2VsbHMgYWJvdmUgdGhlIGZsb29yIGFyZSBibG9ja2VkYCxcbiAgICAgIGZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RoLCAwLFxuICAgICkpO1xuICB9XG5cbiAgY29uc3QgbmVlZHNHcmFkaW5nID0gc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmTm9QcmVwXG4gICAgfHwgc3RhdHMuY3V0Vm9sdW1lID4gMCB8fCBzdGF0cy5maWxsVm9sdW1lID4gMDtcbiAgY29uc3QgbmVlZHNDbGVhcmluZyA9IHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPiAwXG4gICAgJiYgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA8PSBydWxlcy5tYXhPYnN0cnVjdGlvbnM7XG5cbiAgaWYgKG5lZWRzR3JhZGluZykge1xuICAgIHJlYXNvbnMucHVzaChwcmVwKFxuICAgICAgJ25lZWRzX2dyYWRpbmcnLFxuICAgICAgYGdyYWRpbmcgcmVxdWlyZWQ6ICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGN1dCwgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGZpbGxgLFxuICAgICAgc3RhdHMuY3V0Vm9sdW1lICsgc3RhdHMuZmlsbFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAobmVlZHNDbGVhcmluZykge1xuICAgIHJlYXNvbnMucHVzaChwcmVwKFxuICAgICAgJ25lZWRzX2NsZWFyaW5nJyxcbiAgICAgIGAke3N0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyB0byBjbGVhcmAsXG4gICAgICBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoLCBydWxlcy5tYXhPYnN0cnVjdGlvbnMsXG4gICAgKSk7XG4gIH1cblxuICBjb25zdCBoYXNFcnJvciA9IHJlYXNvbnMuc29tZSgocikgPT4gci5zZXZlcml0eSA9PT0gJ2Vycm9yJyk7XG4gIGNvbnN0IGhhc1ByZXAgPSByZWFzb25zLnNvbWUoKHIpID0+IHIuc2V2ZXJpdHkgPT09ICdwcmVwYXJhdGlvbicpO1xuICBjb25zdCBzdGF0ZTogU2l0ZVN0YXRlID0gaGFzRXJyb3IgPyAnaW52YWxpZCcgOiBoYXNQcmVwID8gJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nIDogJ3ZhbGlkJztcblxuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHN0YXRlLFxuICAgIHJlYXNvbnMsXG4gICAgcXVlcnk6IGZwLFxuICAgIHByZXBhcmF0aW9uOiB7XG4gICAgICBuZWVkc0dyYWRpbmcsXG4gICAgICBuZWVkc0NsZWFyaW5nLFxuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgICAgb2JzdHJ1Y3Rpb25JZHM6IHN0YXRzLm9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpLFxuICAgICAgZm91bmRhdGlvbjogcnVsZXMuZm91bmRhdGlvbixcbiAgICB9LFxuICB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNhbmRpZGF0ZSBzZWFyY2ggLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTZWFyY2hPcHRpb25zIHtcbiAgLyoqIENhbmRpZGF0ZSBncmlkIHN0ZXAgaW4gbWV0cmVzLiBEZWZhdWx0IDIuICovXG4gIHN0ZXA/OiBudW1iZXI7XG4gIG1heFJlc3VsdHM/OiBudW1iZXI7XG4gIGFuY2hvcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgbWF4RGlzdGFuY2U/OiBudW1iZXI7XG4gIC8qKiBIYXJkIGNvbnN0cmFpbnQ6IGNhbmRpZGF0ZSBjZW50cmUgbXVzdCBsaWUgd2l0aGluIHRoaXMgcmFkaXVzIG9mIGEgcG9pbnQuICovXG4gIG5lYXI/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyBtYXhEaXN0YW5jZTogbnVtYmVyIH07XG4gIC8qKiBEbyBub3QgcmV0dXJuIHR3byBjYW5kaWRhdGVzIHdob3NlIGZvb3RwcmludHMgb3ZlcmxhcC4gRGVmYXVsdCB0cnVlLiAqL1xuICBkaXN0aW5jdD86IGJvb2xlYW47XG4gIC8qKiBXYWxsLWNsb2NrIGJ1ZGdldCBmb3IgdGhlIHNjYW4uIERlZmF1bHQgMTAwIG1zLiAqL1xuICBidWRnZXRNcz86IG51bWJlcjtcbiAgd2Fsaz86IFdhbGtQYXJhbXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZUNhbmRpZGF0ZSB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgc3RhdGU6ICd2YWxpZCcgfCAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbic7XG4gIHZhbGlkYXRpb246IFNpdGVWYWxpZGF0aW9uO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBvYnN0cnVjdGlvbkNvdW50OiBudW1iZXI7XG4gIGRpc3RhbmNlOiBudW1iZXI7XG4gIHNjb3JlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVNlYXJjaFJlc3VsdCB7XG4gIGNhbmRpZGF0ZXM6IFNpdGVDYW5kaWRhdGVbXTtcbiAgZXZhbHVhdGVkOiBudW1iZXI7XG4gIHJlamVjdGVkOiBudW1iZXI7XG4gIGVsYXBzZWRNczogbnVtYmVyO1xuICBidWRnZXRNczogbnVtYmVyO1xuICAvKiogVHJ1ZSB3aGVuIHRoZSB3YWxsLWNsb2NrIGJ1ZGdldCBzdG9wcGVkIHRoZSBzY2FuIGJlZm9yZSB0aGUgYXJlYSB3YXMgZXhoYXVzdGVkLiAqL1xuICB0cnVuY2F0ZWQ6IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIGZsb29yQ2FuZGlkYXRlcyhzdGF0czogQXJlYVN0YXRzKTogbnVtYmVyW10ge1xuICBjb25zdCBtZWFuID0gTWF0aC5yb3VuZChzdGF0cy5tZWFuWSk7XG4gIGNvbnN0IHNldCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBmb3IgKGxldCBkID0gLTE7IGQgPD0gMTsgZCsrKSBzZXQuYWRkKG1lYW4gKyBkKTtcbiAgc2V0LmFkZChzdGF0cy5taW5ZKTtcbiAgc2V0LmFkZChzdGF0cy5tYXhZKTtcbiAgcmV0dXJuIFsuLi5zZXRdLmZpbHRlcigoeSkgPT4geSA+PSBZX01JTiAmJiB5IDwgWV9NQVgpLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbn1cblxuZnVuY3Rpb24gb3ZlcmxhcHMoYTogUmVjdCwgYjogUmVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gYS54MCA8PSBiLngxICYmIGEueDEgPj0gYi54MCAmJiBhLnowIDw9IGIuejEgJiYgYS56MSA+PSBiLnowO1xufVxuXG5mdW5jdGlvbiBjYW5kaWRhdGVTY29yZSh2OiBTaXRlVmFsaWRhdGlvbiwgZGlzdGFuY2U6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHByZXBQZW5hbHR5ID0gdi5zdGF0ZSA9PT0gJ3ZhbGlkJyA/IDAgOiAyNTtcbiAgY29uc3QgZ3JhZGluZyA9IHYucHJlcGFyYXRpb24uY3V0Vm9sdW1lICsgdi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lO1xuICBjb25zdCBjbGVhcmluZyA9IHYucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHMubGVuZ3RoICogNDtcbiAgcmV0dXJuIHByZXBQZW5hbHR5ICsgZ3JhZGluZyArIGNsZWFyaW5nICsgZGlzdGFuY2UgKiAwLjI1O1xufVxuXG4vKipcbiAqIFNlYXJjaCBhIGJvdW5kZWQgYXJlYSBmb3IgdmlhYmxlIGZvb3RwcmludHMuIFRoZSBzYW1lIHZhbGlkYXRvciBhbmQgdGhlIHNhbWVcbiAqIGZsb29yLXNlbGVjdGlvbiBwb2xpY3kgYXJlIHVzZWQgYnkgdGhlIEFJIGFnZW50IGFuZCB0aGUgcGxheWVyJ3MgYnVpbGRcbiAqIHByZXZpZXcuIFNlYXJjaCBpcyByZWFkLW9ubHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWFyY2hTaXRlcyhcbiAgd29ybGQ6IFdvcmxkLCBydWxlczogQnVpbGRpbmdSdWxlcywgYXJlYTogUmVjdCwgb3B0aW9uczogU2VhcmNoT3B0aW9ucyA9IHt9LFxuKTogU2l0ZVNlYXJjaFJlc3VsdCB7XG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IHN0ZXAgPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKG9wdGlvbnMuc3RlcCA/PyAyKSk7XG4gIGNvbnN0IG1heFJlc3VsdHMgPSBNYXRoLm1heCgxLCBvcHRpb25zLm1heFJlc3VsdHMgPz8gOCk7XG4gIGNvbnN0IGRpc3RpbmN0ID0gb3B0aW9ucy5kaXN0aW5jdCAhPT0gZmFsc2U7XG4gIGNvbnN0IG1heERpc3RhbmNlID0gb3B0aW9ucy5tYXhEaXN0YW5jZSA/PyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gIGNvbnN0IGJ1ZGdldE1zID0gb3B0aW9ucy5idWRnZXRNcyA/PyAxMDA7XG4gIGNvbnN0IGFuY2hvciA9IG9wdGlvbnMuYW5jaG9yID8/IHsgeDogKGFyZWEueDAgKyBhcmVhLngxKSAvIDIsIHo6IChhcmVhLnowICsgYXJlYS56MSkgLyAyIH07XG4gIGNvbnN0IHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCk7XG4gIGNvbnN0IGFsbDogU2l0ZUNhbmRpZGF0ZVtdID0gW107XG4gIGxldCBldmFsdWF0ZWQgPSAwO1xuICBsZXQgcmVqZWN0ZWQgPSAwO1xuICBsZXQgdHJ1bmNhdGVkID0gZmFsc2U7XG5cbiAgY29uc3QgeDFNYXggPSBhcmVhLngxIC0gcnVsZXMud2lkdGggKyAxO1xuICBjb25zdCB6MU1heCA9IGFyZWEuejEgLSBydWxlcy5kZXB0aCArIDE7XG4gIHNjYW46IGZvciAobGV0IHogPSBhcmVhLnowOyB6IDw9IHoxTWF4OyB6ICs9IHN0ZXApIHtcbiAgICBmb3IgKGxldCB4ID0gYXJlYS54MDsgeCA8PSB4MU1heDsgeCArPSBzdGVwKSB7XG4gICAgICBjb25zdCByZWN0ID0geyB4MDogeCwgejA6IHosIHgxOiB4ICsgcnVsZXMud2lkdGggLSAxLCB6MTogeiArIHJ1bGVzLmRlcHRoIC0gMSB9O1xuICAgICAgY29uc3QgY3ggPSAocmVjdC54MCArIHJlY3QueDEpIC8gMjtcbiAgICAgIGNvbnN0IGN6ID0gKHJlY3QuejAgKyByZWN0LnoxKSAvIDI7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguaHlwb3QoY3ggLSBhbmNob3IueCwgY3ogLSBhbmNob3Iueik7XG4gICAgICBpZiAoZGlzdGFuY2UgPiBtYXhEaXN0YW5jZSkgY29udGludWU7XG4gICAgICBpZiAob3B0aW9ucy5uZWFyKSB7XG4gICAgICAgIGNvbnN0IG5lYXJEaXN0YW5jZSA9IE1hdGguaHlwb3QoY3ggLSBvcHRpb25zLm5lYXIueCwgY3ogLSBvcHRpb25zLm5lYXIueik7XG4gICAgICAgIGlmIChuZWFyRGlzdGFuY2UgPiBvcHRpb25zLm5lYXIubWF4RGlzdGFuY2UpIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzdGF0cyA9IHF1ZXJ5LmFyZWEocmVjdCk7XG4gICAgICBsZXQgYmVzdDogU2l0ZUNhbmRpZGF0ZSB8IG51bGwgPSBudWxsO1xuICAgICAgZm9yIChjb25zdCBmbG9vclkgb2YgZmxvb3JDYW5kaWRhdGVzKHN0YXRzKSkge1xuICAgICAgICBldmFsdWF0ZWQrKztcbiAgICAgICAgY29uc3QgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCA9IHtcbiAgICAgICAgICBzaXRlSWQ6IGAke3J1bGVzLmlkfToke3h9LCR7en0sJHtmbG9vcll9YCxcbiAgICAgICAgICByZWN0LCBmbG9vclksIHJ1bGVzLFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBmb290cHJpbnQgPSBxdWVyeS5mb290cHJpbnQocmVjdCwgZmxvb3JZKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwsIHF1ZXJ5LCBmb290cHJpbnQpO1xuICAgICAgICBpZiAodmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnKSB7XG4gICAgICAgICAgcmVqZWN0ZWQrKztcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzY29yZSA9IGNhbmRpZGF0ZVNjb3JlKHZhbGlkYXRpb24sIGRpc3RhbmNlKTtcbiAgICAgICAgY29uc3QgY2FuZGlkYXRlOiBTaXRlQ2FuZGlkYXRlID0ge1xuICAgICAgICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgICAgICAgIHJlY3QsXG4gICAgICAgICAgZmxvb3JZLFxuICAgICAgICAgIHN0YXRlOiB2YWxpZGF0aW9uLnN0YXRlLFxuICAgICAgICAgIHZhbGlkYXRpb24sXG4gICAgICAgICAgY3V0Vm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmN1dFZvbHVtZSxcbiAgICAgICAgICBmaWxsVm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmZpbGxWb2x1bWUsXG4gICAgICAgICAgb2JzdHJ1Y3Rpb25Db3VudDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcy5sZW5ndGgsXG4gICAgICAgICAgZGlzdGFuY2UsXG4gICAgICAgICAgc2NvcmUsXG4gICAgICAgIH07XG4gICAgICAgIGlmICghYmVzdFxuICAgICAgICAgIHx8IChjYW5kaWRhdGUuc3RhdGUgPT09ICd2YWxpZCcgJiYgYmVzdC5zdGF0ZSAhPT0gJ3ZhbGlkJylcbiAgICAgICAgICB8fCAoY2FuZGlkYXRlLnN0YXRlID09PSBiZXN0LnN0YXRlICYmIGNhbmRpZGF0ZS5zY29yZSA8IGJlc3Quc2NvcmUpKSB7XG4gICAgICAgICAgYmVzdCA9IGNhbmRpZGF0ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGJlc3QpIGFsbC5wdXNoKGJlc3QpO1xuICAgIH1cbiAgICBpZiAocGVyZm9ybWFuY2Uubm93KCkgLSB0MCA+IGJ1ZGdldE1zKSB7XG4gICAgICB0cnVuY2F0ZWQgPSB0cnVlO1xuICAgICAgYnJlYWsgc2NhbjtcbiAgICB9XG4gIH1cblxuICBhbGwuc29ydCgoYSwgYikgPT4gYS5zY29yZSAtIGIuc2NvcmUgfHwgYS5kaXN0YW5jZSAtIGIuZGlzdGFuY2VcbiAgICB8fCBhLnJlY3QueDAgLSBiLnJlY3QueDAgfHwgYS5yZWN0LnowIC0gYi5yZWN0LnowKTtcbiAgY29uc3Qgc2VsZWN0ZWQ6IFNpdGVDYW5kaWRhdGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBhbGwpIHtcbiAgICBpZiAoZGlzdGluY3QgJiYgc2VsZWN0ZWQuc29tZSgocykgPT4gb3ZlcmxhcHMocy5yZWN0LCBjYW5kaWRhdGUucmVjdCkpKSBjb250aW51ZTtcbiAgICBzZWxlY3RlZC5wdXNoKGNhbmRpZGF0ZSk7XG4gICAgaWYgKHNlbGVjdGVkLmxlbmd0aCA+PSBtYXhSZXN1bHRzKSBicmVhaztcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2FuZGlkYXRlczogc2VsZWN0ZWQsXG4gICAgZXZhbHVhdGVkLFxuICAgIHJlamVjdGVkLFxuICAgIGVsYXBzZWRNczogTWF0aC5yb3VuZCgocGVyZm9ybWFuY2Uubm93KCkgLSB0MCkgKiAxMDApIC8gMTAwLFxuICAgIGJ1ZGdldE1zLFxuICAgIHRydW5jYXRlZCxcbiAgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwcmV2aWV3IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgRm91bmRhdGlvblByZXZpZXcge1xuICB0eXBlOiBGb3VuZGF0aW9uVHlwZTtcbiAgLyoqIFN0b25lIGZsb29yIHNsYWIgcGx1cyBmaWxsIHVuZGVyIHRoZSBwcmVwYXJlZCBmbG9vci4gKi9cbiAgcGxpbnRoQ2VsbHM6IG51bWJlcjtcbiAgLyoqIFBlcmltZXRlciBjZWxscyB0aGF0IG5lZWQgYSByZXRhaW5pbmcgZmFjZSBiZWNhdXNlIG9mIGN1dCBvciBmaWxsLiAqL1xuICByZXRhaW5pbmdXYWxsQ2VsbHM6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBY2Nlc3NQcmV2aWV3IHtcbiAgZG9vcjogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBkaXN0YW5jZTogbnVtYmVyO1xuICBncmFkZTogbnVtYmVyO1xuICB3YWxrYWJsZTogYm9vbGVhbjtcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVByZXZpZXcge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgc3RhdGU6IFNpdGVTdGF0ZTtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW107XG4gIHRlcnJhaW46IHtcbiAgICBtaW5ZOiBudW1iZXI7XG4gICAgbWF4WTogbnVtYmVyO1xuICAgIG1lYW5ZOiBudW1iZXI7XG4gICAgcmVsaWVmOiBudW1iZXI7XG4gICAgbWF4U3RlcDogbnVtYmVyO1xuICAgIGN1dFZvbHVtZTogbnVtYmVyO1xuICAgIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgICBtYXhDdXQ6IG51bWJlcjtcbiAgICBtYXhGaWxsOiBudW1iZXI7XG4gIH07XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25QcmV2aWV3O1xuICBvYnN0cnVjdGlvbnM6IEFycmF5PHtcbiAgICBlbnRpdHlJZDogc3RyaW5nO1xuICAgIGtpbmQ6IHN0cmluZztcbiAgICB4OiBudW1iZXI7XG4gICAgejogbnVtYmVyO1xuICAgIGFjdGlvbjogJ2NsZWFyJyB8ICdibG9ja2VkJztcbiAgfT47XG4gIGFjY2VzczogQWNjZXNzUHJldmlldyB8IG51bGw7XG4gIC8qKiBDb21wbGV0ZSB3b3JrIGVudmVsb3BlIHRoaXMgcHJldmlldyB3b3VsZCBhdXRob3JpemUuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXZpZXdPcHRpb25zIHtcbiAgZG9vcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHdhbGs/OiBXYWxrUGFyYW1zO1xufVxuXG4vKipcbiAqIEJ1aWxkIHRoZSB0aHJlZS1zdGF0ZSBwcmV2aWV3LiBJdCBpcyBkZWxpYmVyYXRlbHkgZGF0YS1vbmx5OiB0aGUgcmVuZGVyZXJcbiAqIGNhbiBkcmF3IGl0LCBidXQgaXQgbmV2ZXIgZWRpdHMgdGVycmFpbiBvciBzcGVuZHMgcmVzb3VyY2VzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJldmlld1NpdGUoXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgb3B0aW9uczogUHJldmlld09wdGlvbnMgPSB7fSxcbik6IFNpdGVQcmV2aWV3IHtcbiAgY29uc3QgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKTtcbiAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwsIHF1ZXJ5KTtcbiAgY29uc3QgZnAgPSB2YWxpZGF0aW9uLnF1ZXJ5O1xuICBjb25zdCBzdGF0cyA9IGZwLnN0YXRzO1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgcnVsZXMgPSBwcm9wb3NhbC5ydWxlcztcblxuICBsZXQgcGVyaW1ldGVyID0gMDtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgICBpZiAoeCAhPT0gcmVjdC54MCAmJiB4ICE9PSByZWN0LngxICYmIHogIT09IHJlY3QuejAgJiYgeiAhPT0gcmVjdC56MSkgY29udGludWU7XG4gICAgICBpZiAoY29sdW1uQXQod29ybGQsIHgsIHopLnN1cmZhY2VZICE9PSBwcm9wb3NhbC5mbG9vclkpIHBlcmltZXRlcisrO1xuICAgIH1cbiAgfVxuICBjb25zdCBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uUHJldmlldyA9IHtcbiAgICB0eXBlOiBydWxlcy5mb3VuZGF0aW9uLFxuICAgIHBsaW50aENlbGxzOiByZWN0Q29sdW1ucyhyZWN0KSArIHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgcmV0YWluaW5nV2FsbENlbGxzOiBwZXJpbWV0ZXIsXG4gICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgfTtcblxuICBsZXQgYWNjZXNzOiBBY2Nlc3NQcmV2aWV3IHwgbnVsbCA9IG51bGw7XG4gIGlmIChvcHRpb25zLmRvb3IgJiYgb3B0aW9ucy5hcHByb2FjaCkge1xuICAgIGNvbnN0IGRvb3IgPSBvcHRpb25zLmRvb3I7XG4gICAgY29uc3QgYXBwcm9hY2ggPSBvcHRpb25zLmFwcHJvYWNoO1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLmh5cG90KGRvb3IueCAtIGFwcHJvYWNoLngsIGRvb3IueiAtIGFwcHJvYWNoLnopO1xuICAgIGNvbnN0IHN0ZXBzID0gTWF0aC5tYXgoMSwgTWF0aC5jZWlsKGRpc3RhbmNlKSk7XG4gICAgbGV0IHByZXZYID0gYXBwcm9hY2gueCwgcHJldlogPSBhcHByb2FjaC56O1xuICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IHN0ZXBzOyBpKyspIHtcbiAgICAgIGNvbnN0IHQgPSBpIC8gc3RlcHM7XG4gICAgICBjb25zdCB4ID0gTWF0aC5yb3VuZChhcHByb2FjaC54ICsgKGRvb3IueCAtIGFwcHJvYWNoLngpICogdCk7XG4gICAgICBjb25zdCB6ID0gTWF0aC5yb3VuZChhcHByb2FjaC56ICsgKGRvb3IueiAtIGFwcHJvYWNoLnopICogdCk7XG4gICAgICBpZiAoeCA9PT0gcHJldlggJiYgeiA9PT0gcHJldlopIGNvbnRpbnVlO1xuICAgICAgY29uc3QgcmVzdWx0ID0gd2Fsa1N0ZXAod29ybGQsIHByZXZYLCBwcmV2WiwgeCwgeiwgb3B0aW9ucy53YWxrID8/IERFRkFVTFRfV0FMSyk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmVhc29ucy5wdXNoKGAke3Jlc3VsdC5yZWFzb259IGF0ICR7eH0sJHt6fWApO1xuICAgICAgcHJldlggPSB4OyBwcmV2WiA9IHo7XG4gICAgfVxuICAgIGFjY2VzcyA9IHtcbiAgICAgIGRvb3IsIGFwcHJvYWNoLCBkaXN0YW5jZSxcbiAgICAgIGdyYWRlOiBlZmZlY3RpdmVHcmFkZSh3b3JsZCwgYXBwcm9hY2gueCwgYXBwcm9hY2gueiwgZG9vci54LCBkb29yLnopLFxuICAgICAgd2Fsa2FibGU6IHJlYXNvbnMubGVuZ3RoID09PSAwLFxuICAgICAgcmVhc29ucyxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgeTAgPSBwcm9wb3NhbC5mbG9vclkgLSBNYXRoLm1heCgxLCBzdGF0cy5tYXhDdXQpIC0gMTtcbiAgY29uc3QgeTEgPSBwcm9wb3NhbC5mbG9vclkgKyBNYXRoLm1heChydWxlcy53YWxsSGVpZ2h0LCAxKSArIDE7XG4gIGNvbnN0IGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdID0gW1xuICAgIHtcbiAgICAgIC4uLmV4cGFuZFJlY3QocmVjdCwgMiksXG4gICAgICB5MDogTWF0aC5tYXgoWV9NSU4sIHkwKSxcbiAgICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIHkxKSxcbiAgICB9LFxuICBdO1xuICBpZiAoYWNjZXNzKSB7XG4gICAgY29uc3QgYXgwID0gTWF0aC5taW4oYWNjZXNzLmRvb3IueCwgYWNjZXNzLmFwcHJvYWNoLngpIC0gMTtcbiAgICBjb25zdCBheDEgPSBNYXRoLm1heChhY2Nlc3MuZG9vci54LCBhY2Nlc3MuYXBwcm9hY2gueCkgKyAxO1xuICAgIGNvbnN0IGF6MCA9IE1hdGgubWluKGFjY2Vzcy5kb29yLnosIGFjY2Vzcy5hcHByb2FjaC56KSAtIDE7XG4gICAgY29uc3QgYXoxID0gTWF0aC5tYXgoYWNjZXNzLmRvb3IueiwgYWNjZXNzLmFwcHJvYWNoLnopICsgMTtcbiAgICBjb25zdCBhTWluID0gTWF0aC5taW4oc3VyZmFjZUF0KHdvcmxkLCBheDAsIGF6MCksIHN1cmZhY2VBdCh3b3JsZCwgYXgxLCBhejEpKTtcbiAgICBjb25zdCBhTWF4ID0gTWF0aC5tYXgoc3VyZmFjZUF0KHdvcmxkLCBheDAsIGF6MCksIHN1cmZhY2VBdCh3b3JsZCwgYXgxLCBhejEpKTtcbiAgICBlbnZlbG9wZS5wdXNoKHtcbiAgICAgIHgwOiBheDAsIHgxOiBheDEsIHowOiBhejAsIHoxOiBhejEsXG4gICAgICB5MDogTWF0aC5tYXgoWV9NSU4sIGFNaW4gLSAyKSxcbiAgICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIGFNYXggKyAyKSxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgc3RhdGU6IHZhbGlkYXRpb24uc3RhdGUsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBydWxlcyxcbiAgICByZWFzb25zOiB2YWxpZGF0aW9uLnJlYXNvbnMsXG4gICAgdGVycmFpbjoge1xuICAgICAgbWluWTogc3RhdHMubWluWSxcbiAgICAgIG1heFk6IHN0YXRzLm1heFksXG4gICAgICBtZWFuWTogc3RhdHMubWVhblksXG4gICAgICByZWxpZWY6IHN0YXRzLnJlbGllZixcbiAgICAgIG1heFN0ZXA6IHN0YXRzLm1heFN0ZXAsXG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgfSxcbiAgICBmb3VuZGF0aW9uLFxuICAgIG9ic3RydWN0aW9uczogc3RhdHMub2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gKHtcbiAgICAgIGVudGl0eUlkOiBvLmVudGl0eUlkLFxuICAgICAga2luZDogby5raW5kLFxuICAgICAgeDogby54LFxuICAgICAgejogby56LFxuICAgICAgYWN0aW9uOiB2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcgPyAnYmxvY2tlZCcgOiAnY2xlYXInLFxuICAgIH0pKSxcbiAgICBhY2Nlc3MsXG4gICAgZW52ZWxvcGUsXG4gIH07XG59XG5cbiIsICIvLyBNMDAyIHN0YWdlIDM6IGJvdW5kZWQsIGF1dGhvcml6ZWQgdGVycmFpbiBwcmVwYXJhdGlvbi5cbi8vXG4vLyBUaGUgcGlwZWxpbmUgaXMgZGVsaWJlcmF0ZWx5IG9uZS13YXkgYW5kIHNoYXJlZCBieSB0aGUgcGxheWVyIGFuZCB0aGUgQUk6XG4vL1xuLy8gICBwcm9wb3NhbCAtPiB2YWxpZGF0ZVNpdGUgLT4gcGxhblByZXBhcmF0aW9uIC0+IEF1dGhvcml6ZXIgLT4gZXhlY3V0ZVxuLy9cbi8vIGBleGVjdXRlUHJlcGFyYXRpb25gIGlzIHRoZSBvbmx5IGZ1bmN0aW9uIGluIE0wMDIgdGhhdCBlZGl0cyB0ZXJyYWluIGZvclxuLy8gY29uc3RydWN0aW9uLiBJdCByZWZ1c2VzIHRvIHJ1biB3aXRob3V0IGFuIGF1dGhvcml6YXRpb24gdG9rZW4gd2hvc2UgZGlnZXN0XG4vLyBtYXRjaGVzIHRoZSBwbGFuLCB3aG9zZSBlbnZlbG9wZSBjb3ZlcnMgZXZlcnkgdm94ZWwgaXQgd291bGQgdG91Y2gsIGFuZCB3aG9zZVxuLy8gYmFzZSByZXZpc2lvbiBzdGlsbCBtYXRjaGVzIHRoZSB3b3JsZC4gQWxsIGVkaXRzIGFyZSBjb21wdXRlZCBhbmQgY2hlY2tlZFxuLy8gYmVmb3JlIHRoZSBmaXJzdCBieXRlIGlzIHdyaXR0ZW4sIHNvIGEgcmVqZWN0ZWQgcGxhbiBjYW5ub3QgbGVhdmUgYSBwYXJ0aWFsXG4vLyBwYWQgYmVoaW5kLlxuLy9cbi8vIFRoZSBhdXRob3JpemVyIGluIHRoaXMgZmlsZSBpcyBhIGxvY2FsIHBvbGljeSBzdHViLiBJdCBwcm92ZXMgdGhhdCB0aGVcbi8vIHBpcGVsaW5lIGFuZCB0aGUgZW52ZWxvcGUgY2hlY2tzIGV4aXN0OyBpdCBpcyBOT1QgTWFnaWNCbG9jayBlbmZvcmNlbWVudC5cbi8vIE5vIGNoYWluIHByb2dyYW0sIFNESyBjYWxsLCBzZXR0bGVtZW50IG9yIHJvbGxiYWNrIGd1YXJhbnRlZSBpcyBwcmVzZW50LlxuaW1wb3J0IHtcbiAgV29ybGQsIE1BVCwgTWF0SWQsIFlfTUlOLCBZX01BWCwgSEFMRiwgaXNTb2xpZCxcbiAgZ2V0Vm94ZWwsIHNldFZveGVsLCByZW1vdmVFbnRpdHksIHN1cmZhY2VBdCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIEVudGl0eUtpbmQsIFJlc291cmNlVHlwZSxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBSZWN0LCBWb3hlbFJlZ2lvbiwgbm9ybWFsaXplUmVjdCwgcmVjdENvbHVtbnMsIGV4cGFuZFJlY3QsXG4gIGVudmVsb3BlQ29udGFpbnMsIG9ic3RydWN0aW9uc0luLFxufSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgU2l0ZVByb3Bvc2FsLCBTaXRlVmFsaWRhdGlvbiwgQnVpbGRpbmdSdWxlcywgdmFsaWRhdGVTaXRlLFxufSBmcm9tICcuL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBpbnZlbnRvcnlTbmFwc2hvdCwgbm9ybWFsaXplRW52ZWxvcGUsXG59IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IGNvbnN0IExPQ0FMX0FVVEhPUklUWSA9ICdsb2NhbC1zdHViJyBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBMT0NBTF9FTkZPUkNFTUVOVCA9ICdsb2NhbC1zaW11bGF0aW9uLW9ubHknIGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbHVtblRhcmdldCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGxhbkV4cGVjdGF0aW9uIHtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25zOiBudW1iZXI7XG4gIHN1cmZhY2VFZGl0czogbnVtYmVyO1xuICB0b3RhbEVkaXRzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25QbGFuIHtcbiAgaWQ6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbiAgLyoqIEV4YWN0bHkgb25lIHRhcmdldCB3YWxraW5nIGhlaWdodCBwZXIgZm9vdHByaW50IGNvbHVtbiwgc29ydGVkIGJ5IHosIHguICovXG4gIHRhcmdldHM6IENvbHVtblRhcmdldFtdO1xuICAvKiogQXV0aG9yaXRhdGl2ZSBlbnRpdHkgaWRzIHRoaXMgcGxhbiBtYXkgcmVtb3ZlLiAqL1xuICBjbGVhckVudGl0eUlkczogc3RyaW5nW107XG4gIC8qKiBNYXRlcmlhbCBmb3IgdGhlIHRvcCBzb2xpZCB2b3hlbCBhZnRlciBncmFkaW5nLCBvciBudWxsIHRvIGtlZXAgaXQuICovXG4gIHN1cmZhY2VNYXRlcmlhbDogTWF0SWQgfCBudWxsO1xuICAvKiogVGlnaHQgZW52ZWxvcGUgY292ZXJpbmcgZXZlcnkgcGxhbm5lZCB2b3hlbCBjaGFuZ2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBleHBlY3RlZDogUGxhbkV4cGVjdGF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uT3B0aW9ucyB7XG4gIC8qKiBQZXItY29sdW1uIHRhcmdldHMgZm9yIHRlcnJhY2VzIG9yIHN0ZXBwZWQgcGF0aHMuIERlZmF1bHRzIHRvIGZsb29yWS4gKi9cbiAgdGFyZ2V0cz86IENvbHVtblRhcmdldFtdO1xuICAvKiogYG5vbmVgIGlzIG9ubHkgbGVnYWwgd2hlbiB0aGUgc2l0ZSBoYXMgbm8gb2JzdHJ1Y3Rpb25zLiAqL1xuICBjbGVhcj86ICdvYnN0cnVjdGlvbnMnIHwgJ25vbmUnO1xuICAvKiogU2V0IHRoZSB0b3Agc29saWQgdm94ZWwgb2YgZXZlcnkgdGFyZ2V0IGNvbHVtbiAocGF0aHMsIGZpZWxkcykuICovXG4gIHN1cmZhY2VNYXRlcmlhbD86IE1hdElkO1xuICAvKiogRXhwbGljaXQgd29yayBlbnZlbG9wZS4gRGVmYXVsdHMgdG8gYSB0aWdodCBlbnZlbG9wZSBhcm91bmQgdGhlIGVkaXRzLiAqL1xuICBlbnZlbG9wZT86IFZveGVsUmVnaW9uW107XG59XG5cbi8vIC0tLS0tLS0tLS0gc3RhYmxlIGRpZ2VzdCAtLS0tLS0tLS0tXG5mdW5jdGlvbiBkaWdlc3QoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBhID0gMHg4MTFjOWRjNTtcbiAgbGV0IGIgPSAweDllMzc3OWI5O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYyA9IGlucHV0LmNoYXJDb2RlQXQoaSk7XG4gICAgYSA9IE1hdGguaW11bChhIF4gYywgMHgwMTAwMDE5Myk7XG4gICAgYiA9IE1hdGguaW11bChiIF4gKGMgKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgYiBePSBiID4+PiAxMztcbiAgfVxuICByZXR1cm4gKGEgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpXG4gICAgKyAoYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbi8qKiBEaWdlc3Qgb2YgZXZlcnl0aGluZyB0aGF0IGNoYW5nZXMgdGhlIHNldCBvZiBlZGl0cyBvciByZW1vdmFscy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFuRGlnZXN0KHBsYW46IFByZXBhcmF0aW9uUGxhbik6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtcbiAgICAnbTAwMjpwcmVwLXBsYW46djEnLFxuICAgIHBsYW4uc2l0ZUlkLFxuICAgIGAke3BsYW4ucmVjdC54MH0sJHtwbGFuLnJlY3QuejB9LCR7cGxhbi5yZWN0LngxfSwke3BsYW4ucmVjdC56MX1gLFxuICAgIFN0cmluZyhwbGFuLmZsb29yWSksXG4gICAgcGxhbi5ydWxlcy5pZCxcbiAgICBTdHJpbmcocGxhbi50YXJnZXRzLmxlbmd0aCksXG4gICAgcGxhbi5zdXJmYWNlTWF0ZXJpYWwgPT09IG51bGwgPyAnc3VyZmFjZTprZWVwJyA6IGBzdXJmYWNlOiR7cGxhbi5zdXJmYWNlTWF0ZXJpYWx9YCxcbiAgXTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykgbGluZXMucHVzaChgdDoke3QueH0sJHt0Lnp9LCR7dC55fWApO1xuICBjb25zdCBjbGVhcnMgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICBsaW5lcy5wdXNoKGBjOiR7Y2xlYXJzLmxlbmd0aH1gKTtcbiAgZm9yIChjb25zdCBpZCBvZiBjbGVhcnMpIGxpbmVzLnB1c2goYGM6JHtpZH1gKTtcbiAgZm9yIChjb25zdCBlIG9mIG5vcm1hbGl6ZUVudmVsb3BlKHBsYW4uZW52ZWxvcGUpKSB7XG4gICAgbGluZXMucHVzaChgZToke2UueDB9LCR7ZS56MH0sJHtlLnkwfSwke2UueDF9LCR7ZS56MX0sJHtlLnkxfWApO1xuICB9XG4gIGNvbnN0IHggPSBwbGFuLmV4cGVjdGVkO1xuICBsaW5lcy5wdXNoKGB4OiR7eC5jdXRWb2x1bWV9LCR7eC5maWxsVm9sdW1lfSwke3gubWF4Q3V0fSwke3gubWF4RmlsbH0sJHt4Lm9ic3RydWN0aW9uc30sJHt4LnN1cmZhY2VFZGl0c30sJHt4LnRvdGFsRWRpdHN9YCk7XG4gIHJldHVybiBkaWdlc3QobGluZXMuam9pbignXFxuJykpO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBsYW5uaW5nIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgUGxhblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogUHJlcGFyYXRpb25QbGFuO1xuICB2YWxpZGF0aW9uOiBTaXRlVmFsaWRhdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbkZhaWx1cmUge1xuICBvazogZmFsc2U7XG4gIHN0YWdlOiAncGxhbicgfCAnYXV0aG9yaXplJyB8ICdleGVjdXRlJztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbiAgdmFsaWRhdGlvbj86IFNpdGVWYWxpZGF0aW9uO1xufVxuXG5leHBvcnQgdHlwZSBQbGFuUmVzdWx0ID0gUGxhblN1Y2Nlc3MgfCBQcmVwYXJhdGlvbkZhaWx1cmU7XG5cbmZ1bmN0aW9uIGRlZmF1bHRUYXJnZXRzKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCwgZmxvb3JZOiBudW1iZXIpOiBDb2x1bW5UYXJnZXRbXSB7XG4gIGNvbnN0IG91dDogQ29sdW1uVGFyZ2V0W10gPSBbXTtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSBvdXQucHVzaCh7IHgsIHosIHk6IGZsb29yWSB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBzb3J0ZWRUYXJnZXRzKHRhcmdldHM6IHJlYWRvbmx5IENvbHVtblRhcmdldFtdKTogQ29sdW1uVGFyZ2V0W10ge1xuICByZXR1cm4gWy4uLnRhcmdldHNdLnNvcnQoKGEsIGIpID0+IGEueiAtIGIueiB8fCBhLnggLSBiLnggfHwgYS55IC0gYi55KTtcbn1cblxuaW50ZXJmYWNlIFRhcmdldFN0YXRzIHtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgcmVsaWVmOiBudW1iZXI7XG59XG5cbi8qKiBDdXQvZmlsbCBpbXBsaWVkIGJ5IGV4cGxpY2l0IHRhcmdldHMsIGluZGVwZW5kZW50IG9mIHRoZSBmbGF0IGZsb29yWS4gKi9cbmZ1bmN0aW9uIHRhcmdldFN0YXRzKHdvcmxkOiBXb3JsZCwgdGFyZ2V0czogcmVhZG9ubHkgQ29sdW1uVGFyZ2V0W10pOiBUYXJnZXRTdGF0cyB7XG4gIGxldCBjdXRWb2x1bWUgPSAwLCBmaWxsVm9sdW1lID0gMCwgbWF4Q3V0ID0gMCwgbWF4RmlsbCA9IDA7XG4gIGxldCBtaW5ZID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhZID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgc3VyZmFjZSwgdC55KTtcbiAgICBtYXhZID0gTWF0aC5tYXgobWF4WSwgc3VyZmFjZSwgdC55KTtcbiAgICBpZiAoc3VyZmFjZSA+IHQueSkge1xuICAgICAgY29uc3QgZCA9IHN1cmZhY2UgLSB0Lnk7XG4gICAgICBjdXRWb2x1bWUgKz0gZDtcbiAgICAgIG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZCk7XG4gICAgfSBlbHNlIGlmIChzdXJmYWNlIDwgdC55KSB7XG4gICAgICBjb25zdCBkID0gdC55IC0gc3VyZmFjZTtcbiAgICAgIGZpbGxWb2x1bWUgKz0gZDtcbiAgICAgIG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCBkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgY3V0Vm9sdW1lLCBmaWxsVm9sdW1lLCBtYXhDdXQsIG1heEZpbGwsIHJlbGllZjogbWF4WSAtIG1pblkgfTtcbn1cblxuZnVuY3Rpb24gdGFyZ2V0UnVsZVJlYXNvbnMoc3RhdHM6IFRhcmdldFN0YXRzLCBydWxlczogQnVpbGRpbmdSdWxlcyk6IHN0cmluZ1tdIHtcbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZlByZXBhcmVkKSB7XG4gICAgcmVhc29ucy5wdXNoKGByZWxpZWYgJHtzdGF0cy5yZWxpZWZ9IG0gZXhjZWVkcyB0aGUgJHtydWxlcy5tYXhSZWxpZWZQcmVwYXJlZH0gbSBwcmVwYXJlZCBsaW1pdGApO1xuICB9XG4gIGlmIChzdGF0cy5tYXhDdXQgPiBydWxlcy5tYXhDdXQpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCAke3N0YXRzLm1heEN1dH0gbSBleGNlZWRzICR7cnVsZXMubWF4Q3V0fSBtYCk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEZpbGwgPiBydWxlcy5tYXhGaWxsKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsICR7c3RhdHMubWF4RmlsbH0gbSBleGNlZWRzICR7cnVsZXMubWF4RmlsbH0gbWApO1xuICB9XG4gIGlmIChzdGF0cy5jdXRWb2x1bWUgPiBydWxlcy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCB2b2x1bWUgJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEN1dFZvbHVtZX0gbVx1MDBCM2ApO1xuICB9XG4gIGlmIChzdGF0cy5maWxsVm9sdW1lID4gcnVsZXMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCB2b2x1bWUgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsVm9sdW1lfSBtXHUwMEIzYCk7XG4gIH1cbiAgcmV0dXJuIHJlYXNvbnM7XG59XG5cbi8qKlxuICogVHVybiBhIHByb3Bvc2FsIGludG8gYW4gZXhwbGljaXQsIGNoZWNrYWJsZSBwbGFuLiBSZWFkLW9ubHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFuUHJlcGFyYXRpb24oXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgb3B0aW9uczogUHJlcGFyYXRpb25PcHRpb25zID0ge30sXG4pOiBQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsKTtcblxuICBpZiAodmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAnc2l0ZV9pbnZhbGlkJyxcbiAgICAgIHJlYXNvbnM6IHZhbGlkYXRpb24ucmVhc29ucy5tYXAoKHIpID0+IGAke3IuY29kZX06ICR7ci5tZXNzYWdlfWApLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgdGFyZ2V0cyA9IHNvcnRlZFRhcmdldHMob3B0aW9ucy50YXJnZXRzID8/IGRlZmF1bHRUYXJnZXRzKHdvcmxkLCByZWN0LCBwcm9wb3NhbC5mbG9vclkpKTtcbiAgY29uc3QgY29sdW1ucyA9IHJlY3RDb2x1bW5zKHJlY3QpO1xuICBpZiAodGFyZ2V0cy5sZW5ndGggIT09IGNvbHVtbnMpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICd0YXJnZXRfY291bnQnLFxuICAgICAgcmVhc29uczogW2BwbGFuIGhhcyAke3RhcmdldHMubGVuZ3RofSB0YXJnZXRzIGZvciAke2NvbHVtbnN9IGNvbHVtbnNgXSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBrZXkgPSBgJHt0Lnh9LCR7dC56fWA7XG4gICAgaWYgKHNlZW4uaGFzKGtleSkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ2R1cGxpY2F0ZV90YXJnZXQnLFxuICAgICAgICByZWFzb25zOiBbYGR1cGxpY2F0ZSB0YXJnZXQgYXQgJHtrZXl9YF0sIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgICBzZWVuLmFkZChrZXkpO1xuICAgIGlmICh0LnggPCByZWN0LngwIHx8IHQueCA+IHJlY3QueDEgfHwgdC56IDwgcmVjdC56MCB8fCB0LnogPiByZWN0LnoxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICd0YXJnZXRfb3V0c2lkZV9mb290cHJpbnQnLFxuICAgICAgICByZWFzb25zOiBbYHRhcmdldCAke2tleX0gaXMgb3V0c2lkZSAke3JlY3QueDB9LCR7cmVjdC56MH0uLiR7cmVjdC54MX0sJHtyZWN0LnoxfWBdLFxuICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHQueSkgfHwgdC55IDwgWV9NSU4gfHwgdC55ID49IFlfTUFYKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICd0YXJnZXRfaGVpZ2h0JyxcbiAgICAgICAgcmVhc29uczogW2B0YXJnZXQgJHtrZXl9IGhhcyBpbnZhbGlkIGhlaWdodCAke3QueX1gXSwgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcztcbiAgY29uc3QgY2xlYXIgPSBvcHRpb25zLmNsZWFyID8/ICdvYnN0cnVjdGlvbnMnO1xuICBpZiAoY2xlYXIgPT09ICdub25lJyAmJiBvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3VuY2xlYXJlZF9vYnN0cnVjdGlvbnMnLFxuICAgICAgcmVhc29uczogW2Ake29ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyB3b3VsZCByZW1haW5gXSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuICBjb25zdCBjbGVhckVudGl0eUlkcyA9IGNsZWFyID09PSAnbm9uZScgPyBbXSA6IFsuLi5uZXcgU2V0KG9ic3RydWN0aW9ucyldLnNvcnQoKTtcbiAgY29uc3Qgc3VyZmFjZU1hdGVyaWFsID0gb3B0aW9ucy5zdXJmYWNlTWF0ZXJpYWwgPz8gbnVsbDtcblxuICBjb25zdCBjdXN0b21UYXJnZXRzID0gb3B0aW9ucy50YXJnZXRzICE9PSB1bmRlZmluZWQ7XG4gIGNvbnN0IHN0YXRzID0gY3VzdG9tVGFyZ2V0c1xuICAgID8gdGFyZ2V0U3RhdHMod29ybGQsIHRhcmdldHMpXG4gICAgOiB7XG4gICAgICBjdXRWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ubWF4RmlsbCxcbiAgICAgIHJlbGllZjogdmFsaWRhdGlvbi5xdWVyeS5zdGF0cy5yZWxpZWYsXG4gICAgfTtcbiAgaWYgKGN1c3RvbVRhcmdldHMpIHtcbiAgICBjb25zdCByZWFzb25zID0gdGFyZ2V0UnVsZVJlYXNvbnMoc3RhdHMsIHByb3Bvc2FsLnJ1bGVzKTtcbiAgICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsXG4gICAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICAgIGNvZGU6ICd0YXJnZXRfcnVsZXMnLFxuICAgICAgICByZWFzb25zLFxuICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBsZXQgbG8gPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gIGxldCBoaSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgbG8gPSBNYXRoLm1pbihsbywgc3VyZmFjZSwgdC55KTtcbiAgICBoaSA9IE1hdGgubWF4KGhpLCBzdXJmYWNlIC0gMSwgdC55IC0gMSk7XG4gIH1cbiAgY29uc3QgYnVmZmVyZWQgPSBleHBhbmRSZWN0KHJlY3QsIDEpO1xuICBjb25zdCBkZXJpdmVkOiBWb3hlbFJlZ2lvbiA9IHtcbiAgICB4MDogTWF0aC5tYXgoLUhBTEYsIGJ1ZmZlcmVkLngwKSxcbiAgICB6MDogTWF0aC5tYXgoLUhBTEYsIGJ1ZmZlcmVkLnowKSxcbiAgICB4MTogTWF0aC5taW4oSEFMRiAtIDEsIGJ1ZmZlcmVkLngxKSxcbiAgICB6MTogTWF0aC5taW4oSEFMRiAtIDEsIGJ1ZmZlcmVkLnoxKSxcbiAgICB5MDogTWF0aC5tYXgoWV9NSU4sIGxvIC0gMSksXG4gICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgaGkgKyAxKSxcbiAgfTtcbiAgLy8gQW4gZXhwbGljaXQgZW52ZWxvcGUgcmVwbGFjZXMgdGhlIGRlcml2ZWQgb25lLiBDYWxsZXJzIHRoYXQgcGluIGFuIGV4YWN0XG4gIC8vIHdvcmsgZW52ZWxvcGUgKHBhdGggcHJlcGFyYXRpb24pIG11c3Qgbm90IHNpbGVudGx5IHdpZGVuIGl0IHdpdGggdGhlXG4gIC8vIGRlZmF1bHQgMSBtIGJ1ZmZlci5cbiAgY29uc3QgZW52ZWxvcGUgPSBub3JtYWxpemVFbnZlbG9wZShvcHRpb25zLmVudmVsb3BlID8/IFtkZXJpdmVkXSk7XG4gIGNvbnN0IHN1cmZhY2VFZGl0cyA9IHN1cmZhY2VNYXRlcmlhbCA9PT0gbnVsbCA/IDAgOiB0YXJnZXRzLmxlbmd0aDtcblxuICBjb25zdCBwbGFuOiBQcmVwYXJhdGlvblBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgcnVsZXM6IHByb3Bvc2FsLnJ1bGVzLFxuICAgIHRhcmdldHMsXG4gICAgY2xlYXJFbnRpdHlJZHMsXG4gICAgc3VyZmFjZU1hdGVyaWFsLFxuICAgIGVudmVsb3BlLFxuICAgIGV4cGVjdGVkOiB7XG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgICBvYnN0cnVjdGlvbnM6IGNsZWFyRW50aXR5SWRzLmxlbmd0aCxcbiAgICAgIHN1cmZhY2VFZGl0cyxcbiAgICAgIHRvdGFsRWRpdHM6IHN0YXRzLmN1dFZvbHVtZSArIHN0YXRzLmZpbGxWb2x1bWUgKyBzdXJmYWNlRWRpdHMsXG4gICAgfSxcbiAgfTtcbiAgcGxhbi5pZCA9IGBwcmVwOiR7cGxhbkRpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiwgdmFsaWRhdGlvbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGF1dGhvcml6YXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uTGltaXRzIHtcbiAgbWF4Q3V0Vm9sdW1lOiBudW1iZXI7XG4gIG1heEZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Vm94ZWxFZGl0czogbnVtYmVyO1xuICBtYXhFbnRpdHlSZW1vdmFsczogbnVtYmVyO1xuICBtYXhUYXJnZXRzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0xJTUlUUzogQXV0aG9yaXphdGlvbkxpbWl0cyA9IHtcbiAgbWF4Q3V0Vm9sdW1lOiAyNTYsXG4gIG1heEZpbGxWb2x1bWU6IDI1NixcbiAgbWF4Vm94ZWxFZGl0czogMTAyNCxcbiAgbWF4RW50aXR5UmVtb3ZhbHM6IDE2LFxuICBtYXhUYXJnZXRzOiA1MTIsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmtBdXRob3JpemF0aW9uIHtcbiAgaWQ6IHN0cmluZztcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBiYXNlUmV2aXNpb246IG51bWJlcjtcbiAgbGltaXRzOiBBdXRob3JpemF0aW9uTGltaXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25EZWNpc2lvbiB7XG4gIG9rOiBib29sZWFuO1xuICBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbiB8IG51bGw7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25Qb2xpY3kge1xuICAvKiogVGhlIG9ubHkgcmVnaW9ucyB0aGlzIGdvdmVybm9yIHBlcm1pdHMgZm9yIHRoZSBmaXJzdCBzbGljZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGxpbWl0cz86IFBhcnRpYWw8QXV0aG9yaXphdGlvbkxpbWl0cz47XG59XG5cbmZ1bmN0aW9uIHJlZ2lvbkNvbnRhaW5lZChyZWdpb246IFZveGVsUmVnaW9uLCBwb2xpY3k6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBib29sZWFuIHtcbiAgcmV0dXJuIHBvbGljeS5zb21lKChwKSA9PiByZWdpb24ueDAgPj0gcC54MCAmJiByZWdpb24ueDEgPD0gcC54MVxuICAgICYmIHJlZ2lvbi56MCA+PSBwLnowICYmIHJlZ2lvbi56MSA8PSBwLnoxXG4gICAgJiYgcmVnaW9uLnkwID49IHAueTAgJiYgcmVnaW9uLnkxIDw9IHAueTEpO1xufVxuXG4vKipcbiAqIExvY2FsIGdvdmVybm9yIHN0dWIuIEl0IGVuZm9yY2VzIGEgZml4ZWQgZW52ZWxvcGUgYW5kIGhhcmQgdm9sdW1lIGxpbWl0cyxcbiAqIGJpbmRzIGEgdG9rZW4gdG8gdGhlIGV4YWN0IHBsYW4gZGlnZXN0IGFuZCB3b3JsZCByZXZpc2lvbiwgYW5kIHJlZnVzZXMgdG9cbiAqIHByZXRlbmQgaXQgaXMgYW4gb24tY2hhaW4gYXV0aG9yaXR5LlxuICovXG5leHBvcnQgY2xhc3MgTG9jYWxBdXRob3JpemVyIHtcbiAgcmVhZG9ubHkgYXV0aG9yaXR5ID0gTE9DQUxfQVVUSE9SSVRZO1xuICByZWFkb25seSBlbmZvcmNlbWVudCA9IExPQ0FMX0VORk9SQ0VNRU5UO1xuICByZWFkb25seSBsaW1pdHM6IEF1dGhvcml6YXRpb25MaW1pdHM7XG5cbiAgY29uc3RydWN0b3IocmVhZG9ubHkgcG9saWN5OiBBdXRob3JpemF0aW9uUG9saWN5KSB7XG4gICAgdGhpcy5saW1pdHMgPSB7IC4uLkRFRkFVTFRfTElNSVRTLCAuLi4ocG9saWN5LmxpbWl0cyA/PyB7fSkgfTtcbiAgfVxuXG4gIGF1dGhvcml6ZSh3b3JsZDogV29ybGQsIHBsYW46IFByZXBhcmF0aW9uUGxhbik6IEF1dGhvcml6YXRpb25EZWNpc2lvbiB7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwbGFuLnJlY3QpO1xuXG4gICAgaWYgKHBsYW4udGFyZ2V0cy5sZW5ndGggIT09IHJlY3RDb2x1bW5zKHJlY3QpKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW4gaGFzICR7cGxhbi50YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBmb3IgJHtyZWN0Q29sdW1ucyhyZWN0KX0gY29sdW1uc2ApO1xuICAgIH1cbiAgICBpZiAocGxhbi50YXJnZXRzLmxlbmd0aCA+IHRoaXMubGltaXRzLm1heFRhcmdldHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLnRhcmdldHMubGVuZ3RofSB0YXJnZXRzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heFRhcmdldHN9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLmN1dFZvbHVtZSA+IHRoaXMubGltaXRzLm1heEN1dFZvbHVtZSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBjdXQgJHtwbGFuLmV4cGVjdGVkLmN1dFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heEN1dFZvbHVtZX1gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQuZmlsbFZvbHVtZSA+IHRoaXMubGltaXRzLm1heEZpbGxWb2x1bWUpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZmlsbCAke3BsYW4uZXhwZWN0ZWQuZmlsbFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heEZpbGxWb2x1bWV9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLnRvdGFsRWRpdHMgPiB0aGlzLmxpbWl0cy5tYXhWb3hlbEVkaXRzKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW5uZWQgZWRpdHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4Vm94ZWxFZGl0c31gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aH0gcmVtb3ZhbHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHN9YCk7XG4gICAgfVxuICAgIGlmIChuZXcgU2V0KHBsYW4uY2xlYXJFbnRpdHlJZHMpLnNpemUgIT09IHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoKSB7XG4gICAgICByZWFzb25zLnB1c2goJ2R1cGxpY2F0ZSBlbnRpdHkgcmVtb3ZhbCBpZHMnKTtcbiAgICB9XG5cbiAgICBpZiAocGxhbi5lbnZlbG9wZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gd29yayBlbnZlbG9wZScpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHJlZ2lvbiBvZiBwbGFuLmVudmVsb3BlKSB7XG4gICAgICBpZiAoIXJlZ2lvbkNvbnRhaW5lZChyZWdpb24sIHRoaXMucG9saWN5LmVudmVsb3BlKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYGVudmVsb3BlICR7cmVnaW9uLngwfSwke3JlZ2lvbi56MH0sJHtyZWdpb24ueTB9Li4ke3JlZ2lvbi54MX0sJHtyZWdpb24uejF9LCR7cmVnaW9uLnkxfSBpcyBvdXRzaWRlIHRoZSBsb2NhbCBwb2xpY3lgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykge1xuICAgICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHQueCwgdC55LCB0LnopXG4gICAgICAgIHx8ICh0LnkgPiBZX01JTiAmJiAhZW52ZWxvcGVDb250YWlucyhwbGFuLmVudmVsb3BlLCB0LngsIHQueSAtIDEsIHQueikpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgdGFyZ2V0ICR7dC54fSwke3Quen0sJHt0Lnl9IGlzIG5vdCBjb3ZlcmVkIGJ5IHRoZSB3b3JrIGVudmVsb3BlYCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gRXZlcnkgb2JzdHJ1Y3Rpb24gY3VycmVudGx5IG9uIHRoZSBmb290cHJpbnQgbXVzdCBiZSBpbiB0aGUgcGxhbiwgYW5kXG4gICAgLy8gdGhlIHBsYW4gbWF5IG5vdCByZW1vdmUgYW55dGhpbmcgdGhhdCBpcyBub3QgYW4gb2JzdHJ1Y3Rpb24gdGhlcmUuXG4gICAgY29uc3QgY3VycmVudCA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KS5tYXAoKG8pID0+IG8uZW50aXR5SWQpLnNvcnQoKTtcbiAgICBjb25zdCBwbGFubmVkID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgICBpZiAoY3VycmVudC5sZW5ndGggIT09IHBsYW5uZWQubGVuZ3RoIHx8IGN1cnJlbnQuc29tZSgoaWQsIGkpID0+IGlkICE9PSBwbGFubmVkW2ldKSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFuIHJlbW92YWxzIFske3BsYW5uZWQuam9pbignLCcpfV0gZG8gbm90IG1hdGNoIGZvb3RwcmludCBvYnN0cnVjdGlvbnMgWyR7Y3VycmVudC5qb2luKCcsJyl9XWApO1xuICAgIH1cblxuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiB7IG9rOiBmYWxzZSwgYXV0aG9yaXphdGlvbjogbnVsbCwgcmVhc29ucyB9O1xuXG4gICAgY29uc3QgdG9rZW46IFdvcmtBdXRob3JpemF0aW9uID0ge1xuICAgICAgaWQ6IGBsb2NhbC1zdHViOiR7cGxhbkRpZ2VzdChwbGFuKX1gLFxuICAgICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgICBwbGFuRGlnZXN0OiBwbGFuRGlnZXN0KHBsYW4pLFxuICAgICAgZW52ZWxvcGU6IG5vcm1hbGl6ZUVudmVsb3BlKHBsYW4uZW52ZWxvcGUpLFxuICAgICAgYmFzZVJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICAgIGxpbWl0czogeyAuLi50aGlzLmxpbWl0cyB9LFxuICAgIH07XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIGF1dGhvcml6YXRpb246IHRva2VuLCByZWFzb25zOiBbXSB9O1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gZXhlY3V0aW9uIC0tLS0tLS0tLS1cbmludGVyZmFjZSBQZW5kaW5nRWRpdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGJlZm9yZTogTWF0SWQ7XG4gIGFmdGVyOiBNYXRJZDtcbiAgLyoqIFRydWUgZm9yIGEgbWF0ZXJpYWwtb25seSB0b3Atc3VyZmFjZSBjaGFuZ2UuICovXG4gIHN1cmZhY2U/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBjaHVuazogc3RyaW5nO1xuICBjaGFuZ2VkOiBudW1iZXI7XG4gIGFkZGVkOiBudW1iZXI7XG4gIHJlbW92ZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDbGVhcmVkRW50aXR5IHtcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIGFtb3VudDogbnVtYmVyO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uTGVkZ2VyIHtcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBhdXRob3JpemF0aW9uSWQ6IHN0cmluZztcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG5ldFNwb2lsOiBudW1iZXI7XG4gIGJvcnJvd2VkRmlsbDogbnVtYmVyO1xuICBjdXRCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBmaWxsQnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgdm94ZWxFZGl0czogbnVtYmVyO1xuICBzdXJmYWNlRWRpdHM6IG51bWJlcjtcbiAgZW50aXRpZXNDbGVhcmVkOiBDbGVhcmVkRW50aXR5W107XG4gIHJlc291cmNlc0dhaW5lZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgaW52ZW50b3J5QmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBpbnZlbnRvcnlBZnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgY2h1bmtEZWx0YXM6IENodW5rRGVsdGFbXTtcbiAgcmV2aXNpb25CZWZvcmU6IG51bWJlcjtcbiAgcmV2aXNpb25BZnRlcjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBQcmVwYXJhdGlvblBsYW47XG4gIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uO1xuICBsZWRnZXI6IFByZXBhcmF0aW9uTGVkZ2VyO1xufVxuXG5leHBvcnQgdHlwZSBQcmVwYXJhdGlvbk91dGNvbWUgPSBQcmVwYXJhdGlvblN1Y2Nlc3MgfCBQcmVwYXJhdGlvbkZhaWx1cmU7XG5cbmNvbnN0IE1BVEVSSUFMX05BTUVTOiBSZWNvcmQ8bnVtYmVyLCBzdHJpbmc+ID0ge1xuICBbTUFULkdSQVNTXTogJ2dyYXNzJyxcbiAgW01BVC5TT0lMXTogJ3NvaWwnLFxuICBbTUFULlNBTkRdOiAnc2FuZCcsXG4gIFtNQVQuR1JBVkVMXTogJ2dyYXZlbCcsXG4gIFtNQVQuU1RPTkVdOiAnc3RvbmUnLFxuICBbTUFULk9SRV06ICdvcmUnLFxuICBbTUFULldBVEVSXTogJ3dhdGVyJyxcbiAgW01BVC5CRURST0NLXTogJ2JlZHJvY2snLFxuICBbTUFULk1PU1NdOiAnbW9zcycsXG59O1xuXG5mdW5jdGlvbiBtYXRlcmlhbE5hbWUobTogTWF0SWQpOiBzdHJpbmcge1xuICByZXR1cm4gTUFURVJJQUxfTkFNRVNbbV0gPz8gYG1hdF8ke219YDtcbn1cblxuZnVuY3Rpb24gZmlsbE1hdGVyaWFsKHk6IG51bWJlciwgdGFyZ2V0OiBudW1iZXIpOiBNYXRJZCB7XG4gIHJldHVybiB5ID09PSB0YXJnZXQgLSAxID8gTUFULkdSQVNTIDogTUFULlNPSUw7XG59XG5cbmZ1bmN0aW9uIGZhaWwoc3RhZ2U6IFByZXBhcmF0aW9uRmFpbHVyZVsnc3RhZ2UnXSwgY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IFByZXBhcmF0aW9uRmFpbHVyZSB7XG4gIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhZ2UsIGNvZGUsIHJlYXNvbnMgfTtcbn1cblxuLyoqXG4gKiBBcHBseSBhbiBhdXRob3JpemVkIHBsYW4uIE5vIHZveGVsIGlzIHdyaXR0ZW4gdW50aWwgZXZlcnkgZWRpdCBhbmQgcmVtb3ZhbFxuICogaGFzIGJlZW4gY2hlY2tlZCBhZ2FpbnN0IHRoZSB0b2tlbiwgdGhlIHBsYW4gZW52ZWxvcGUgYW5kIHRoZSBoYXJkIGxpbWl0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4ZWN1dGVQcmVwYXJhdGlvbihcbiAgd29ybGQ6IFdvcmxkLCBwbGFuOiBQcmVwYXJhdGlvblBsYW4sIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uLFxuKTogUHJlcGFyYXRpb25PdXRjb21lIHtcbiAgaWYgKGF1dGhvcml6YXRpb24uYXV0aG9yaXR5ICE9PSBMT0NBTF9BVVRIT1JJVFlcbiAgICB8fCBhdXRob3JpemF0aW9uLmVuZm9yY2VtZW50ICE9PSBMT0NBTF9FTkZPUkNFTUVOVCkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3Vuc3VwcG9ydGVkX2F1dGhvcml0eScsIFtcbiAgICAgIGBhdXRob3JpdHkgJHthdXRob3JpemF0aW9uLmF1dGhvcml0eX0vJHthdXRob3JpemF0aW9uLmVuZm9yY2VtZW50fSBpcyBub3QgdGhlIGxvY2FsIHN0dWJgLFxuICAgIF0pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QgIT09IHBsYW5EaWdlc3QocGxhbikpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdkaWdlc3RfbWlzbWF0Y2gnLCBbJ2F1dGhvcml6YXRpb24gZG9lcyBub3QgbWF0Y2ggdGhpcyBwbGFuJ10pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbiAhPT0gd29ybGQucmV2aXNpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdzdGFsZV9hdXRob3JpemF0aW9uJywgW1xuICAgICAgYGF1dGhvcml6YXRpb24gd2FzIGlzc3VlZCBhdCByZXZpc2lvbiAke2F1dGhvcml6YXRpb24uYmFzZVJldmlzaW9ufSwgd29ybGQgaXMgYXQgJHt3b3JsZC5yZXZpc2lvbn1gLFxuICAgIF0pO1xuICB9XG4gIGlmIChwbGFuLmVudmVsb3BlLnNvbWUoKHIpID0+ICFyZWdpb25Db250YWluZWQociwgYXV0aG9yaXphdGlvbi5lbnZlbG9wZSkpKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZW52ZWxvcGVfbWlzbWF0Y2gnLCBbJ3BsYW4gZW52ZWxvcGUgaXMgd2lkZXIgdGhhbiB0aGUgYXV0aG9yaXphdGlvbiddKTtcbiAgfVxuXG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHBsYW4ucmVjdCk7XG4gIGNvbnN0IGVkaXRzOiBQZW5kaW5nRWRpdFtdID0gW107XG4gIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgaWYgKHQueSA8IHN1cmZhY2UpIHtcbiAgICAgIGZvciAobGV0IHkgPSB0Lnk7IHkgPCBzdXJmYWNlOyB5KyspIHtcbiAgICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgeSwgdC56KTtcbiAgICAgICAgaWYgKGlzU29saWQoYmVmb3JlKSkgZWRpdHMucHVzaCh7IHg6IHQueCwgeSwgejogdC56LCBiZWZvcmUsIGFmdGVyOiBNQVQuQUlSIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodC55ID4gc3VyZmFjZSkge1xuICAgICAgZm9yIChsZXQgeSA9IHN1cmZhY2U7IHkgPCB0Lnk7IHkrKykge1xuICAgICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB5LCB0LnopO1xuICAgICAgICBpZiAoIWlzU29saWQoYmVmb3JlKSkge1xuICAgICAgICAgIGNvbnN0IGFmdGVyID0gcGxhbi5zdXJmYWNlTWF0ZXJpYWwgIT09IG51bGwgJiYgeSA9PT0gdC55IC0gMVxuICAgICAgICAgICAgPyBwbGFuLnN1cmZhY2VNYXRlcmlhbFxuICAgICAgICAgICAgOiBmaWxsTWF0ZXJpYWwoeSwgdC55KTtcbiAgICAgICAgICBlZGl0cy5wdXNoKHsgeDogdC54LCB5LCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXIgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gTWF0ZXJpYWwtb25seSBzdXJmYWNlIGNoYW5nZSBmb3IgY3V0IG9yIGFscmVhZHktbGV2ZWwgY29sdW1ucy4gRmlsbFxuICAgIC8vIGNvbHVtbnMgYWxyZWFkeSByZWNlaXZlIHRoZSBzdXJmYWNlIG1hdGVyaWFsIGluIHRoZSBmaWxsIGxvb3AgYWJvdmUuXG4gICAgaWYgKHBsYW4uc3VyZmFjZU1hdGVyaWFsICE9PSBudWxsKSB7XG4gICAgICBjb25zdCB0b3BZID0gdC55IC0gMTtcbiAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHRvcFksIHQueik7XG4gICAgICBpZiAoaXNTb2xpZChiZWZvcmUpICYmIGJlZm9yZSAhPT0gcGxhbi5zdXJmYWNlTWF0ZXJpYWwpIHtcbiAgICAgICAgZWRpdHMucHVzaCh7XG4gICAgICAgICAgeDogdC54LCB5OiB0b3BZLCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXI6IHBsYW4uc3VyZmFjZU1hdGVyaWFsLCBzdXJmYWNlOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBDaGVjayBldmVyeSBlZGl0IGJlZm9yZSBtdXRhdGluZyBhbnl0aGluZy5cbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBlIG9mIGVkaXRzKSB7XG4gICAgaWYgKGUueCA8IHJlY3QueDAgfHwgZS54ID4gcmVjdC54MSB8fCBlLnogPCByZWN0LnowIHx8IGUueiA+IHJlY3QuejEpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZWRpdCAke2UueH0sJHtlLnl9LCR7ZS56fSBpcyBvdXRzaWRlIHRoZSBmb290cHJpbnRgKTtcbiAgICB9XG4gICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKGF1dGhvcml6YXRpb24uZW52ZWxvcGUsIGUueCwgZS55LCBlLnopKSB7XG4gICAgICByZWFzb25zLnB1c2goYGVkaXQgJHtlLnh9LCR7ZS55fSwke2Uuen0gaXMgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZWApO1xuICAgIH1cbiAgfVxuICBjb25zdCBjdXRWb2x1bWUgPSBlZGl0cy5maWx0ZXIoKGUpID0+IGUuYWZ0ZXIgPT09IE1BVC5BSVIgJiYgaXNTb2xpZChlLmJlZm9yZSkpLmxlbmd0aDtcbiAgY29uc3QgZmlsbFZvbHVtZSA9IGVkaXRzLmZpbHRlcigoZSkgPT4gZS5hZnRlciAhPT0gTUFULkFJUiAmJiAhaXNTb2xpZChlLmJlZm9yZSkpLmxlbmd0aDtcbiAgaWYgKGN1dFZvbHVtZSA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0ICR7Y3V0Vm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4Q3V0Vm9sdW1lfWApO1xuICB9XG4gIGlmIChmaWxsVm9sdW1lID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCAke2ZpbGxWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhGaWxsVm9sdW1lfWApO1xuICB9XG4gIGlmIChlZGl0cy5sZW5ndGggPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhWb3hlbEVkaXRzKSB7XG4gICAgcmVhc29ucy5wdXNoKGAke2VkaXRzLmxlbmd0aH0gZWRpdHMgZXhjZWVkIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4Vm94ZWxFZGl0c31gKTtcbiAgfVxuXG4gIGNvbnN0IGN1cnJlbnQgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCkubWFwKChvKSA9PiBvLmVudGl0eUlkKS5zb3J0KCk7XG4gIGNvbnN0IHBsYW5uZWQgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICBpZiAoY3VycmVudC5sZW5ndGggIT09IHBsYW5uZWQubGVuZ3RoIHx8IGN1cnJlbnQuc29tZSgoaWQsIGkpID0+IGlkICE9PSBwbGFubmVkW2ldKSkge1xuICAgIHJlYXNvbnMucHVzaCgnZm9vdHByaW50IG9ic3RydWN0aW9ucyBjaGFuZ2VkIGFmdGVyIGF1dGhvcml6YXRpb24nKTtcbiAgfVxuICBpZiAocGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGggPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFscykge1xuICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aH0gcmVtb3ZhbHMgZXhjZWVkIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHN9YCk7XG4gIH1cbiAgZm9yIChjb25zdCBpZCBvZiBwbGFuLmNsZWFyRW50aXR5SWRzKSB7XG4gICAgaWYgKCF3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSByZWFzb25zLnB1c2goYGVudGl0eSAke2lkfSBubyBsb25nZXIgZXhpc3RzYCk7XG4gIH1cbiAgaWYgKHdvcmxkLmxpZmUpIHtcbiAgICBsZXQgcmVjb3ZlcmVkID0gMDtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIHBsYW4uY2xlYXJFbnRpdHlJZHMpIHtcbiAgICAgIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoZW50aXR5Py5yZXNvdXJjZSAmJiBlbnRpdHkucmVtYWluaW5nID4gMCkgcmVjb3ZlcmVkICs9IGVudGl0eS5yZW1haW5pbmc7XG4gICAgfVxuICAgIC8vIENoZWNrIGJlZm9yZSBhbnkgdm94ZWwgb3IgZW50aXR5IGNoYW5nZXMsIHByZXNlcnZpbmcgbGVnYWN5IHVuYm91bmRlZFxuICAgIC8vIGNvbnN0cnVjdGlvbiBiZWhhdmlvciBhbmQgc2NoZW1hLTMgY2FycmllZC1jYXBhY2l0eSBjb25zZXJ2YXRpb24uXG4gICAgaWYgKE9iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgYW1vdW50KSA9PiBzdW0gKyBhbW91bnQsIDApICsgcmVjb3ZlcmVkID4gMTIwKSB7XG4gICAgICByZWFzb25zLnB1c2goJ3Jlc291cmNlcyByZWNvdmVyZWQgZHVyaW5nIHNpdGUgY2xlYXJpbmcgd291bGQgZXhjZWVkIGNhcnJpZWQgY2FwYWNpdHkgMTIwJyk7XG4gICAgfVxuICB9XG4gIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3VuYXV0aG9yaXplZF9lZGl0cycsIHJlYXNvbnMpO1xuXG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgcmV2aXNpb25CZWZvcmUgPSB3b3JsZC5yZXZpc2lvbjtcbiAgY29uc3QgY2h1bmtEZWx0YXMgPSBuZXcgTWFwPHN0cmluZywgQ2h1bmtEZWx0YT4oKTtcbiAgY29uc3QgY3V0QnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBjb25zdCBmaWxsQnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBsZXQgYXBwbGllZCA9IDA7XG4gIGxldCBzdXJmYWNlRWRpdHMgPSAwO1xuXG4gIGZvciAoY29uc3QgZSBvZiBlZGl0cykge1xuICAgIGlmICghc2V0Vm94ZWwod29ybGQsIGUueCwgZS55LCBlLnosIGUuYWZ0ZXIpKSBjb250aW51ZTtcbiAgICBhcHBsaWVkKys7XG4gICAgaWYgKGUuc3VyZmFjZSkgc3VyZmFjZUVkaXRzKys7XG4gICAgY29uc3Qga2V5ID0gY2h1bmtLZXkod29ybGRUb0NodW5rWChlLngpLCB3b3JsZFRvQ2h1bmtaKGUueikpO1xuICAgIGxldCBkZWx0YSA9IGNodW5rRGVsdGFzLmdldChrZXkpO1xuICAgIGlmICghZGVsdGEpIHtcbiAgICAgIGRlbHRhID0geyBjaHVuazoga2V5LCBjaGFuZ2VkOiAwLCBhZGRlZDogMCwgcmVtb3ZlZDogMCB9O1xuICAgICAgY2h1bmtEZWx0YXMuc2V0KGtleSwgZGVsdGEpO1xuICAgIH1cbiAgICBkZWx0YS5jaGFuZ2VkKys7XG4gICAgY29uc3Qgd2FzU29saWQgPSBpc1NvbGlkKGUuYmVmb3JlKTtcbiAgICBjb25zdCBpc05vd1NvbGlkID0gaXNTb2xpZChlLmFmdGVyKTtcbiAgICBpZiAoIXdhc1NvbGlkICYmIGlzTm93U29saWQpIGRlbHRhLmFkZGVkKys7XG4gICAgaWYgKHdhc1NvbGlkICYmICFpc05vd1NvbGlkKSBkZWx0YS5yZW1vdmVkKys7XG4gICAgY29uc3QgbmFtZSA9IG1hdGVyaWFsTmFtZShlLmJlZm9yZSk7XG4gICAgaWYgKHdhc1NvbGlkICYmICFpc05vd1NvbGlkKSBjdXRCeU1hdGVyaWFsW25hbWVdID0gKGN1dEJ5TWF0ZXJpYWxbbmFtZV0gPz8gMCkgKyAxO1xuICAgIGlmICghd2FzU29saWQgJiYgaXNOb3dTb2xpZCkgZmlsbEJ5TWF0ZXJpYWxbbWF0ZXJpYWxOYW1lKGUuYWZ0ZXIpXSA9IChmaWxsQnlNYXRlcmlhbFttYXRlcmlhbE5hbWUoZS5hZnRlcildID8/IDApICsgMTtcbiAgfVxuXG4gIGNvbnN0IGVudGl0aWVzQ2xlYXJlZDogQ2xlYXJlZEVudGl0eVtdID0gW107XG4gIGNvbnN0IHJlc291cmNlc0dhaW5lZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHt9O1xuICBmb3IgKGNvbnN0IGlkIG9mIFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCkpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoIWUpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGFtb3VudCA9IGUucmVzb3VyY2UgJiYgZS5yZW1haW5pbmcgPiAwID8gZS5yZW1haW5pbmcgOiAwO1xuICAgIGlmIChlLnJlc291cmNlICYmIGFtb3VudCA+IDApIHtcbiAgICAgIHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA9ICh3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gICAgICByZXNvdXJjZXNHYWluZWRbZS5yZXNvdXJjZV0gPSAocmVzb3VyY2VzR2FpbmVkW2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgIH1cbiAgICByZW1vdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgICBlbnRpdGllc0NsZWFyZWQucHVzaCh7XG4gICAgICBlbnRpdHlJZDogaWQsIGtpbmQ6IGUua2luZCwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCwgeDogZS54LCB5OiBlLnksIHo6IGUueixcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IGN1dCA9IGFwcGxpZWQgPiAwID8gT2JqZWN0LnZhbHVlcyhjdXRCeU1hdGVyaWFsKS5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSA6IDA7XG4gIGNvbnN0IGZpbGwgPSBhcHBsaWVkID4gMCA/IE9iamVjdC52YWx1ZXMoZmlsbEJ5TWF0ZXJpYWwpLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIDogMDtcbiAgY29uc3QgbGVkZ2VyOiBQcmVwYXJhdGlvbkxlZGdlciA9IHtcbiAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgYXV0aG9yaXphdGlvbklkOiBhdXRob3JpemF0aW9uLmlkLFxuICAgIHBsYW5EaWdlc3Q6IGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCxcbiAgICBzaXRlSWQ6IHBsYW4uc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwbGFuLmZsb29yWSxcbiAgICBjdXRWb2x1bWU6IGN1dCxcbiAgICBmaWxsVm9sdW1lOiBmaWxsLFxuICAgIG5ldFNwb2lsOiBjdXQgLSBmaWxsLFxuICAgIGJvcnJvd2VkRmlsbDogTWF0aC5tYXgoMCwgZmlsbCAtIGN1dCksXG4gICAgY3V0QnlNYXRlcmlhbCxcbiAgICBmaWxsQnlNYXRlcmlhbCxcbiAgICB2b3hlbEVkaXRzOiBhcHBsaWVkLFxuICAgIHN1cmZhY2VFZGl0cyxcbiAgICBlbnRpdGllc0NsZWFyZWQsXG4gICAgcmVzb3VyY2VzR2FpbmVkLFxuICAgIGludmVudG9yeUJlZm9yZSxcbiAgICBpbnZlbnRvcnlBZnRlcjogaW52ZW50b3J5U25hcHNob3Qod29ybGQpLFxuICAgIGNodW5rRGVsdGFzOiBbLi4uY2h1bmtEZWx0YXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuY2h1bmsubG9jYWxlQ29tcGFyZShiLmNodW5rKSksXG4gICAgcmV2aXNpb25CZWZvcmUsXG4gICAgcmV2aXNpb25BZnRlcjogd29ybGQucmV2aXNpb24sXG4gIH07XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCBhdXRob3JpemF0aW9uLCBsZWRnZXIgfTtcbn1cblxuLyoqXG4gKiBUaGUgc2hhcmVkIHBsYXllci9BSSBlbnRyeSBwb2ludC4gVGhlcmUgaXMgbm8gb3RoZXIgY29uc3RydWN0aW9uIHBhdGguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlU2l0ZShcbiAgd29ybGQ6IFdvcmxkLFxuICBhdXRob3JpemVyOiBMb2NhbEF1dGhvcml6ZXIsXG4gIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsXG4gIG9wdGlvbnM6IFByZXBhcmF0aW9uT3B0aW9ucyA9IHt9LFxuKTogUHJlcGFyYXRpb25PdXRjb21lIHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwsIG9wdGlvbnMpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBkZWNpc2lvbiA9IGF1dGhvcml6ZXIuYXV0aG9yaXplKHdvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2F1dGhvcml6ZScsICdub3RfYXV0aG9yaXplZCcsIGRlY2lzaW9uLnJlYXNvbnMpO1xuICB9XG4gIHJldHVybiBleGVjdXRlUHJlcGFyYXRpb24od29ybGQsIHBsYW5uZWQucGxhbiwgZGVjaXNpb24uYXV0aG9yaXphdGlvbik7XG59XG4iLCAiLy8gTTAwMiBzdGFnZSA0OiBhdXRob3JpdGF0aXZlIGhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlIHN0cnVjdHVyZXMuXG4vL1xuLy8gU3RydWN0dXJlcyBhcmUgc2ltdWxhdGlvbiByZWNvcmRzLCBub3QgcmVuZGVyZXItb25seSBtZXNoZXMuIEEgc3RydWN0dXJlIGlzXG4vLyBwbGFubmVkIGZyb20gdGhlIHByZXBhcmVkIHRlcnJhaW4sIGF1dGhvcml6ZWQgYWdhaW5zdCB0aGUgc2FtZSBsb2NhbCBwb2xpY3lcbi8vIGVudmVsb3BlIGFzIHRlcnJhaW4gcHJlcGFyYXRpb24sIHBhaWQgZm9yIGZyb20gaW52ZW50b3J5LCBhbmQgdGhlbiBzdG9yZWQgaW5cbi8vIFdvcmxkLnN0cnVjdHVyZXMuIFRoZSByZW5kZXJlciByZWFkcyB0aG9zZSByZWNvcmRzOyBpdCBuZXZlciBpbnZlbnRzIGFcbi8vIGJ1aWxkaW5nIHRoYXQgdGhlIHNpbXVsYXRpb24gZG9lcyBub3Qgb3duLlxuaW1wb3J0IHtcbiAgV29ybGQsIFJlc291cmNlVHlwZSwgTUFULCBzdXJmYWNlQXQsIGdldFZveGVsLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBub3JtYWxpemVSZWN0LCBleHBhbmRSZWN0LFxuICBlbnZlbG9wZUNvbnRhaW5zLCBvYnN0cnVjdGlvbnNJbixcbn0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7XG4gIEF1dGhvcml6YXRpb25Qb2xpY3ksIExPQ0FMX0FVVEhPUklUWSwgTE9DQUxfRU5GT1JDRU1FTlQsXG59IGZyb20gJy4vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHsgRkFSTV9SVUxFUyB9IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7IGludmVudG9yeVNuYXBzaG90IH0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVLaW5kID0gJ2hvdXNlJyB8ICdwYXRoJyB8ICd0ZXJyYWNlJztcbi8qKiBNMDAyIGRlc2lnbiAxIGlzIGltbXV0YWJsZSByZXBsYXkgY29udGVudDsgZGVzaWduIDIgaXMgdGhlIGZvdW5kZXIgY2FuZGlkYXRlLiAqL1xuZXhwb3J0IGNvbnN0IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gPSAyIGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgU3RydWN0dXJlRGVzaWduVmVyc2lvbiA9IHR5cGVvZiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuXG5leHBvcnQgdHlwZSBNb2R1bGVLaW5kID1cbiAgfCAnZmxvb3InXG4gIHwgJ3dhbGwnXG4gIHwgJ3Bvc3QnXG4gIHwgJ2xpbnRlbCdcbiAgfCAncm9vZidcbiAgfCAncGFyYXBldCdcbiAgfCAnd2luZG93J1xuICB8ICdkb29yJ1xuICB8ICd0aHJlc2hvbGQnXG4gIHwgJ3BhdGgnXG4gIHwgJ2N1cmInXG4gIHwgJ3NvaWxfYmVkJ1xuICB8ICdyZXRhaW5pbmdfd2FsbCdcbiAgfCAnY3JvcF9yb3cnO1xuXG5leHBvcnQgdHlwZSBNb2R1bGVUb25lID1cbiAgfCAnc3RvbmUnXG4gIHwgJ3N0b25lX2InXG4gIHwgJ29jaHJlJ1xuICB8ICd0aW1iZXInXG4gIHwgJ2FjY2VudCdcbiAgfCAnc29pbCdcbiAgfCAnY3JvcCdcbiAgfCAnZ3JhdmVsJztcblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVNb2R1bGUge1xuICBraW5kOiBNb2R1bGVLaW5kO1xuICAvKiogQ2VudHJlIGluIHdvcmxkIHgveiwgYm90dG9tIGluIHdvcmxkIHkuICovXG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHc6IG51bWJlcjtcbiAgaDogbnVtYmVyO1xuICBkOiBudW1iZXI7XG4gIHJvdD86IG51bWJlcjtcbiAgdG9uZT86IE1vZHVsZVRvbmU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIC8qKiBPcmlnaW46IGNlbnRyZSBvZiB0aGUgcHJlcGFyZWQgZm9vdHByaW50IGF0IGZsb29yIGhlaWdodC4gKi9cbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdO1xuICBjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBidWlsdFJldmlzaW9uOiBudW1iZXI7XG4gIC8qKiBBYnNlbnQgbWVhbnMgbGVnYWN5IE0wMDIgZGVzaWduIDE7IG5ldmVyIGluZmVyIGl0IGZyb20gdGhlIHJlbmRlcmVyLiAqL1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbiAgcHJvdmlzaW9uYWw6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFjZUJhbmQge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUHJvcG9zYWwge1xuICBzaXRlSWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIC8qKiBSZXF1aXJlZCBmb3IgaG91c2VzOiB2b3hlbCBjb2x1bW4gb2YgdGhlIGRvb3Igb24gdGhlIGVhc3Qgd2FsbC4gKi9cbiAgZG9vcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgLyoqIE9wdGlvbmFsIHBhdGggbWV0YWRhdGE7IHRoZSBwYXRoIGlzIGxhaWQgYWxvbmcgdGhlIHJlY3QgY2VudHJlbGluZS4gKi9cbiAgYXBwcm9hY2g/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHRlcnJhY2VzPzogbnVtYmVyO1xuICAvKiogRGVsaWJlcmF0ZSBjb250ZW50IHNlbGVjdGlvbiBjYXJyaWVkIGJ5IHNjaGVtYS0yIGNvbW1hbmRzLiAqL1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbn1cblxuLyoqXG4gKiBTaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciBzdHJ1Y3R1cmUgY29zdHMuIFRoZSBwbGFubmVycyBhbmQgdGhlIGJ1aWxkIFVJXG4gKiBib3RoIHJlYWQgdGhlc2U7IGEgYnVpbGRpbmcgY2Fubm90IGFkdmVydGlzZSBvbmUgcHJpY2UgYW5kIGNoYXJnZSBhbm90aGVyLlxuICovXG5leHBvcnQgY29uc3QgSE9VU0VfQ09TVDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHsgd29vZDogMTAsIHN0b25lOiAxOCB9O1xuZXhwb3J0IGNvbnN0IFRFUlJBQ0VfQ09TVDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHsgd29vZDogNiwgc3RvbmU6IDEyIH07XG5cbi8qKiBBIHBhdGggcGF5cyBvbmUgc3RvbmUgcGVyIG1ldHJlIG9mIGNvcnJpZG9yIHdpZHRoLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhdGhDb3N0KHdpZHRoOiBudW1iZXIpOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+IHtcbiAgcmV0dXJuIHsgc3RvbmU6IHdpZHRoIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VyZmFjZVNhbXBsZSB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUGxhbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgb3JpZ2luOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgcm90OiBudW1iZXI7XG4gIG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdO1xuICBjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgLyoqIEV4cGVjdGVkIHByZXBhcmVkIHN1cmZhY2UsIGNoZWNrZWQgYWdhaW4gYXQgZXhlY3V0aW9uIHRpbWUuICovXG4gIHN1cmZhY2U6IFN1cmZhY2VTYW1wbGVbXTtcbiAgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb247XG4gIHRlcnJhY2VzPzogVGVycmFjZUJhbmRbXTtcbn1cblxuLy8gLS0tLS0tLS0tLSBzdGFibGUgZGlnZXN0IC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGRpZ2VzdChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGEgPSAweDgxMWM5ZGM1O1xuICBsZXQgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaW5wdXQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gaW5wdXQuY2hhckNvZGVBdChpKTtcbiAgICBhID0gTWF0aC5pbXVsKGEgXiBjLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoYyArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICBiIF49IGIgPj4+IDEzO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cnVjdHVyZURpZ2VzdChwbGFuOiBTdHJ1Y3R1cmVQbGFuKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW1xuICAgICdtMDAyOnN0cnVjdHVyZS1wbGFuOnYxJyxcbiAgICBwbGFuLmtpbmQsXG4gICAgcGxhbi5zaXRlSWQsXG4gICAgYCR7cGxhbi5yZWN0LngwfSwke3BsYW4ucmVjdC56MH0sJHtwbGFuLnJlY3QueDF9LCR7cGxhbi5yZWN0LnoxfWAsXG4gICAgU3RyaW5nKHBsYW4uZmxvb3JZKSxcbiAgICBgJHtwbGFuLm9yaWdpbi54fSwke3BsYW4ub3JpZ2luLnl9LCR7cGxhbi5vcmlnaW4uen1gLFxuICAgIFN0cmluZyhwbGFuLnJvdCksXG4gICAgLi4uKHBsYW4uZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTiA/IFsnZGVzaWduOjInXSA6IFtdKSxcbiAgICBgbToke3BsYW4ubW9kdWxlcy5sZW5ndGh9YCxcbiAgXTtcbiAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgIGxpbmVzLnB1c2goYG06JHttLmtpbmR9LCR7bS54fSwke20ueX0sJHttLnp9LCR7bS53fSwke20uaH0sJHttLmR9LCR7bS5yb3QgPz8gMH0sJHttLnRvbmUgPz8gJyd9YCk7XG4gIH1cbiAgY29uc3QgY29zdEtleXMgPSBPYmplY3Qua2V5cyhwbGFuLmNvc3QpLnNvcnQoKTtcbiAgbGluZXMucHVzaChgY29zdDoke2Nvc3RLZXlzLmxlbmd0aH1gKTtcbiAgZm9yIChjb25zdCBrZXkgb2YgY29zdEtleXMpIGxpbmVzLnB1c2goYGNvc3Q6JHtrZXl9LCR7cGxhbi5jb3N0W2tleSBhcyBSZXNvdXJjZVR5cGVdID8/IDB9YCk7XG4gIGZvciAoY29uc3QgcyBvZiBwbGFuLnN1cmZhY2UpIGxpbmVzLnB1c2goYHM6JHtzLnh9LCR7cy56fSwke3MueX1gKTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGVycmFjZXMgPz8gW10pIGxpbmVzLnB1c2goYHQ6JHt0LnowfSwke3QuejF9LCR7dC55fWApO1xuICByZXR1cm4gZGlnZXN0KGxpbmVzLmpvaW4oJ1xcbicpKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwbGFubmluZyBoZWxwZXJzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgc3RhZ2U6ICdwbGFuJyB8ICdhdXRob3JpemUnIHwgJ2V4ZWN1dGUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVBsYW5TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFN0cnVjdHVyZVBsYW47XG59XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZVBsYW5SZXN1bHQgPSBTdHJ1Y3R1cmVQbGFuU3VjY2VzcyB8IFN0cnVjdHVyZUZhaWx1cmU7XG5cbmZ1bmN0aW9uIGZhaWwoc3RhZ2U6IFN0cnVjdHVyZUZhaWx1cmVbJ3N0YWdlJ10sIGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBTdHJ1Y3R1cmVGYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGFnZSwgY29kZSwgcmVhc29ucyB9O1xufVxuXG5mdW5jdGlvbiBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZDogV29ybGQsIHNhbXBsZXM6IHJlYWRvbmx5IFN1cmZhY2VTYW1wbGVbXSkge1xuICBjb25zdCBvdXQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IGV4cGVjdGVkOiBudW1iZXI7IGFjdHVhbDogbnVtYmVyIH0+ID0gW107XG4gIGZvciAoY29uc3QgcyBvZiBzYW1wbGVzKSB7XG4gICAgY29uc3QgYWN0dWFsID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKGFjdHVhbCAhPT0gcy55KSBvdXQucHVzaCh7IHg6IHMueCwgejogcy56LCBleHBlY3RlZDogcy55LCBhY3R1YWwgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gZm9vdHByaW50U3VyZmFjZSh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QsIHk6IG51bWJlcik6IFN1cmZhY2VTYW1wbGVbXSB7XG4gIGNvbnN0IG91dDogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgb3V0LnB1c2goeyB4LCB6LCB5IH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGZvb3RwcmludEVudmVsb3BlKHJlY3Q6IFJlY3QsIHkwOiBudW1iZXIsIHkxOiBudW1iZXIsIG1hcmdpbiA9IDEpOiBWb3hlbFJlZ2lvbltdIHtcbiAgY29uc3QgciA9IGV4cGFuZFJlY3QocmVjdCwgbWFyZ2luKTtcbiAgcmV0dXJuIFt7IC4uLnIsIHkwLCB5MSB9XTtcbn1cblxuZnVuY3Rpb24gbW9kdWxlQm91bmRzKG06IFN0cnVjdHVyZU1vZHVsZSk6IHsgeDA6IG51bWJlcjsgeDE6IG51bWJlcjsgeTA6IG51bWJlcjsgeTE6IG51bWJlcjsgejA6IG51bWJlcjsgejE6IG51bWJlciB9IHtcbiAgY29uc3QgciA9IE1hdGguaHlwb3QobS53LCBtLmQpIC8gMjtcbiAgY29uc3QgaGFsZlcgPSAobS5yb3QgPz8gMCkgPT09IDAgPyBtLncgLyAyIDogcjtcbiAgY29uc3QgaGFsZkQgPSAobS5yb3QgPz8gMCkgPT09IDAgPyBtLmQgLyAyIDogcjtcbiAgcmV0dXJuIHtcbiAgICB4MDogbS54IC0gaGFsZlcsIHgxOiBtLnggKyBoYWxmVyxcbiAgICB5MDogbS55LCB5MTogbS55ICsgbS5oLFxuICAgIHowOiBtLnogLSBoYWxmRCwgejE6IG0ueiArIGhhbGZELFxuICB9O1xufVxuXG5mdW5jdGlvbiBtb2R1bGVJbnNpZGVFbnZlbG9wZShtOiBTdHJ1Y3R1cmVNb2R1bGUsIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogYm9vbGVhbiB7XG4gIGNvbnN0IGIgPSBtb2R1bGVCb3VuZHMobSk7XG4gIHJldHVybiBlbnZlbG9wZS5zb21lKChlKSA9PiBiLngwID49IGUueDAgLSAxZS02ICYmIGIueDEgPD0gZS54MSArIDEgKyAxZS02XG4gICAgJiYgYi55MCA+PSBlLnkwIC0gMWUtNiAmJiBiLnkxIDw9IGUueTEgKyAxICsgMWUtNlxuICAgICYmIGIuejAgPj0gZS56MCAtIDFlLTYgJiYgYi56MSA8PSBlLnoxICsgMSArIDFlLTYpO1xufVxuXG5mdW5jdGlvbiBjb3N0VG90YWwoY29zdDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+Pik6IG51bWJlciB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKGNvc3QpLnJlZHVjZSgoYSwgYikgPT4gYSArIChiID8/IDApLCAwKTtcbn1cblxuZnVuY3Rpb24gbWVkaWFuKHZhbHVlczogbnVtYmVyW10pOiBudW1iZXIge1xuICBjb25zdCBzb3J0ZWQgPSBbLi4udmFsdWVzXS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG4gIHJldHVybiBzb3J0ZWRbTWF0aC5mbG9vcihzb3J0ZWQubGVuZ3RoIC8gMildO1xufVxuXG4vLyAtLS0tLS0tLS0tIGhvdXNlIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5Ib3VzZSh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3Qgd2lkdGggPSByZWN0LngxIC0gcmVjdC54MCArIDE7XG4gIGNvbnN0IGRlcHRoID0gcmVjdC56MSAtIHJlY3QuejAgKyAxO1xuICBpZiAod2lkdGggIT09IDggfHwgZGVwdGggIT09IDYpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYGhvdXNlIG5lZWRzIDggeCA2IG0sIGdvdCAke3dpZHRofSB4ICR7ZGVwdGh9IG1gXSk7XG4gIH1cbiAgaWYgKCFwcm9wb3NhbC5kb29yKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnbWlzc2luZ19kb29yJywgWydob3VzZSBwbGFuIG5lZWRzIGEgZG9vciBjb2x1bW4nXSk7XG4gIH1cbiAgaWYgKHByb3Bvc2FsLmRvb3IueiA8IHJlY3QuejAgfHwgcHJvcG9zYWwuZG9vci56ID4gcmVjdC56MSkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Rvb3Jfb3V0c2lkZScsIFtgZG9vciB6ICR7cHJvcG9zYWwuZG9vci56fSBpcyBvdXRzaWRlICR7cmVjdC56MH0uLiR7cmVjdC56MX1gXSk7XG4gIH1cblxuICBjb25zdCBzdXJmYWNlID0gZm9vdHByaW50U3VyZmFjZSh3b3JsZCwgcmVjdCwgcHJvcG9zYWwuZmxvb3JZKTtcbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBzdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfbm90X3ByZXBhcmVkJywgbWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfb2JzdHJ1Y3RlZCcsIG9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpKTtcbiAgfVxuXG4gIGNvbnN0IGZsb29yWSA9IHByb3Bvc2FsLmZsb29yWTtcbiAgY29uc3QgeDAgPSByZWN0LngwLCB4MSA9IHJlY3QueDEgKyAxO1xuICBjb25zdCB6MCA9IHJlY3QuejAsIHoxID0gcmVjdC56MSArIDE7XG4gIGNvbnN0IGN4ID0gKHgwICsgeDEpIC8gMjtcbiAgY29uc3QgY3ogPSAoejAgKyB6MSkgLyAyO1xuICBjb25zdCBkb29yWiA9IHByb3Bvc2FsLmRvb3IueiArIDAuNTtcbiAgY29uc3QgZG9vckhhbGYgPSAwLjY7XG4gIGNvbnN0IHdhbGxIID0gMy4wO1xuICBjb25zdCB3YWxsVCA9IDAuNTtcbiAgY29uc3QgZG9vckggPSAyLjI7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG5cbiAgLy8gRmxvb3Igc2xhYiBhbmQgcm9vZiBwbGF0ZS5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2Zsb29yJywgeDogY3gsIHk6IGZsb29yWSwgejogY3osIHc6IDguMCwgaDogMC4zLCBkOiA2LjAsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3Jvb2YnLCB4OiBjeCwgeTogZmxvb3JZICsgd2FsbEgsIHo6IGN6LCB3OiA4LjQsIGg6IDAuMywgZDogNi40LCB0b25lOiAnc3RvbmUnIH0pO1xuXG4gIC8vIE5vcnRoIGFuZCBzb3V0aCB3YWxscy5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiBjeCwgeTogZmxvb3JZLCB6OiB6MCArIHdhbGxUIC8gMiwgdzogOC4wLCBoOiB3YWxsSCwgZDogd2FsbFQsIHRvbmU6ICdzdG9uZScgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICd3YWxsJywgeDogY3gsIHk6IGZsb29yWSwgejogejEgLSB3YWxsVCAvIDIsIHc6IDguMCwgaDogd2FsbEgsIGQ6IHdhbGxULCB0b25lOiAnc3RvbmUnIH0pO1xuXG4gIC8vIFdlc3Qgd2FsbC5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiB4MCArIHdhbGxUIC8gMiwgeTogZmxvb3JZLCB6OiBjeiwgdzogd2FsbFQsIGg6IHdhbGxILCBkOiA2LjAsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gRWFzdCB3YWxsIHdpdGggYSByZWFsIGRvb3J3YXkgZ2FwLlxuICBjb25zdCBlYXN0WCA9IHgxIC0gd2FsbFQgLyAyO1xuICBjb25zdCBnYXAwID0gZG9vclogLSBkb29ySGFsZjtcbiAgY29uc3QgZ2FwMSA9IGRvb3JaICsgZG9vckhhbGY7XG4gIGNvbnN0IGxlZnRMZW4gPSBnYXAwIC0gejA7XG4gIGNvbnN0IHJpZ2h0TGVuID0gejEgLSBnYXAxO1xuICBpZiAobGVmdExlbiA+IDAuMDUpIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dhbGwnLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiB6MCArIGxlZnRMZW4gLyAyLFxuICAgICAgdzogd2FsbFQsIGg6IHdhbGxILCBkOiBsZWZ0TGVuLCB0b25lOiAnc3RvbmUnLFxuICAgIH0pO1xuICB9XG4gIGlmIChyaWdodExlbiA+IDAuMDUpIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dhbGwnLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAxICsgcmlnaHRMZW4gLyAyLFxuICAgICAgdzogd2FsbFQsIGg6IHdhbGxILCBkOiByaWdodExlbiwgdG9uZTogJ3N0b25lJyxcbiAgICB9KTtcbiAgfVxuICBtb2R1bGVzLnB1c2goe1xuICAgIGtpbmQ6ICdsaW50ZWwnLCB4OiBlYXN0WCwgeTogZmxvb3JZICsgZG9vckgsIHo6IGRvb3JaLFxuICAgIHc6IHdhbGxULCBoOiB3YWxsSCAtIGRvb3JILCBkOiBkb29ySGFsZiAqIDIsIHRvbmU6ICdzdG9uZV9iJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2Rvb3InLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAwLFxuICAgIHc6IDAuMTgsIGg6IGRvb3JILCBkOiAwLjE2LCB0b25lOiAndGltYmVyJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2Rvb3InLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAxLFxuICAgIHc6IDAuMTgsIGg6IGRvb3JILCBkOiAwLjE2LCB0b25lOiAndGltYmVyJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ3RocmVzaG9sZCcsIHg6IHgxICsgMC4zNSwgeTogZmxvb3JZLCB6OiBkb29yWixcbiAgICB3OiAwLjksIGg6IDAuMTYsIGQ6IDEuMywgdG9uZTogJ29jaHJlJyxcbiAgfSk7XG5cbiAgLy8gVHdvIHdpbmRvd3Mgb24gdGhlIHNvdXRoIHdhbGwsIHNsaWdodGx5IHByb3VkIG9mIHRoZSBvdXRlciBmYWNlLlxuICBmb3IgKGNvbnN0IHd4IG9mIFtjeCAtIDIuMiwgY3ggKyAyLjJdKSB7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICd3aW5kb3cnLCB4OiB3eCwgeTogZmxvb3JZICsgMS40NSwgejogejEgLSAwLjAyLFxuICAgICAgdzogMS4wLCBoOiAxLjAsIGQ6IDAuMDgsIHRvbmU6ICdhY2NlbnQnLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gUGFyYXBldCBhcm91bmQgdGhlIGZsYXQgTm94ZWwgcm9vZi5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6IC0gMy4wNSwgdzogOC40LCBoOiAwLjQsIGQ6IDAuMywgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3ogKyAzLjA1LCB3OiA4LjQsIGg6IDAuNCwgZDogMC4zLCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3ggLSA0LjA1LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3osIHc6IDAuMywgaDogMC40LCBkOiA2LjQsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCArIDQuMDUsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiwgdzogMC4zLCBoOiAwLjQsIGQ6IDYuNCwgdG9uZTogJ3N0b25lX2InIH0pO1xuXG4gIGNvbnN0IHBsYW46IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIGtpbmQ6ICdob3VzZScsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclksXG4gICAgb3JpZ2luOiB7IHg6IGN4LCB5OiBmbG9vclksIHo6IGN6IH0sXG4gICAgcm90OiAwLFxuICAgIG1vZHVsZXMsXG4gICAgY29zdDogeyAuLi5IT1VTRV9DT1NUIH0sXG4gICAgZW52ZWxvcGU6IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIGZsb29yWSwgZmxvb3JZICsgNCwgMiksXG4gICAgc3VyZmFjZSxcbiAgfTtcbiAgcGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4gfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwYXRoIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5QYXRoKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGlmIChkZXB0aCAhPT0gMyB8fCB3aWR0aCA8IDMpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYHBhdGggbmVlZHMgYSAzIG0gd2lkZSBjb3JyaWRvciwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuXG4gIGNvbnN0IGNlbnRlclogPSByZWN0LnowICsgMTtcbiAgY29uc3Qgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGNvbnN0IGhlaWdodHM6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIGNlbnRlclopO1xuICAgIGhlaWdodHMucHVzaCh5KTtcbiAgICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHN1cmZhY2UucHVzaCh7IHgsIHosIHkgfSk7XG4gIH1cbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBzdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfbm90X3ByZXBhcmVkJywgbWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBmb3IgKGxldCBpID0gMTsgaSA8IGhlaWdodHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gaGVpZ2h0c1tpXSAtIGhlaWdodHNbaSAtIDFdO1xuICAgIGlmIChNYXRoLmFicyhzdGVwKSA+IDEpIHtcbiAgICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfc3RlcCcsIFtgc3RlcCAke3N0ZXB9IG0gYXQgeD0ke3JlY3QueDAgKyBpfWBdKTtcbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIHN1cmZhY2UpIHtcbiAgICBjb25zdCB0b3AgPSBnZXRWb3hlbCh3b3JsZCwgcy54LCBzLnkgLSAxLCBzLnopO1xuICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF93ZXQnLCBbYGNvbHVtbiAke3MueH0sJHtzLnp9IGlzIHdldGBdKTtcbiAgICB9XG4gICAgaWYgKHRvcCAhPT0gTUFULkdSQVZFTCkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9zdXJmYWNlJywgW1xuICAgICAgICBgY29sdW1uICR7cy54fSwke3Muen0gdG9wIGlzICR7dG9wfSwgZXhwZWN0ZWQgZ3JhdmVsYCxcbiAgICAgIF0pO1xuICAgIH1cbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfb2JzdHJ1Y3RlZCcsIG9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpKTtcbiAgfVxuXG4gIGNvbnN0IGN6ID0gY2VudGVyWiArIDAuNTtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgY2VudGVyWik7XG4gICAgY29uc3QgbXggPSB4ICsgMC41O1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXRoJywgeDogbXgsIHksIHo6IGN6LCB3OiAxLjAsIGg6IDAuMTIsIGQ6IDMuMCwgdG9uZTogJ2dyYXZlbCcgfSk7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2N1cmInLCB4OiBteCwgeSwgejogcmVjdC56MCArIDAuMDc1LCB3OiAxLjAsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IG14LCB5LCB6OiByZWN0LnoxICsgMSAtIDAuMDc1LCB3OiAxLjAsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgfVxuXG4gIGNvbnN0IG1pblkgPSBNYXRoLm1pbiguLi5oZWlnaHRzKTtcbiAgY29uc3QgbWF4WSA9IE1hdGgubWF4KC4uLmhlaWdodHMpO1xuICBjb25zdCBwbGFuOiBTdHJ1Y3R1cmVQbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBraW5kOiAncGF0aCcsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogKHJlY3QueDAgKyByZWN0LngxICsgMSkgLyAyLCB5OiBtaW5ZLCB6OiBjeiB9LFxuICAgIHJvdDogMCxcbiAgICBtb2R1bGVzLFxuICAgIGNvc3Q6IHBhdGhDb3N0KHdpZHRoKSxcbiAgICBlbnZlbG9wZTogZm9vdHByaW50RW52ZWxvcGUocmVjdCwgbWluWSAtIDEsIG1heFkgKyAyLCAwKSxcbiAgICBzdXJmYWNlLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHRlcnJhY2VzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5UZXJyYWNlcyh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3Qgd2lkdGggPSByZWN0LngxIC0gcmVjdC54MCArIDE7XG4gIGNvbnN0IGRlcHRoID0gcmVjdC56MSAtIHJlY3QuejAgKyAxO1xuICBjb25zdCBjb3VudCA9IHByb3Bvc2FsLnRlcnJhY2VzID8/IDM7XG4gIGlmICh3aWR0aCAhPT0gMTIgfHwgZGVwdGggIT09IDgpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYHRlcnJhY2VzIG5lZWQgMTIgeCA4IG0sIGdvdCAke3dpZHRofSB4ICR7ZGVwdGh9IG1gXSk7XG4gIH1cbiAgaWYgKGNvdW50IDwgMiB8fCBjb3VudCA+IDQpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX2NvdW50JywgW2Ake2NvdW50fSB0ZXJyYWNlcyBpcyBvdXRzaWRlIDIuLjRgXSk7XG4gIH1cblxuICAvLyBTcGxpdCBkZXB0aCBpbnRvIG5lYXItZXF1YWwgYmFuZHMsIGhpZ2ggc2lkZSBmaXJzdC5cbiAgY29uc3QgYmFzZSA9IE1hdGguZmxvb3IoZGVwdGggLyBjb3VudCk7XG4gIGNvbnN0IGV4dHJhID0gZGVwdGggJSBjb3VudDtcbiAgY29uc3QgYmFuZHM6IFRlcnJhY2VCYW5kW10gPSBbXTtcbiAgbGV0IHogPSByZWN0LnowO1xuICBjb25zdCBtZWRpYW5zOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjb25zdCBzaXplID0gYmFzZSArIChpIDwgZXh0cmEgPyAxIDogMCk7XG4gICAgY29uc3QgejAgPSB6LCB6MSA9IHogKyBzaXplIC0gMTtcbiAgICBjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG4gICAgZm9yIChsZXQgYnogPSB6MDsgYnogPD0gejE7IGJ6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgdmFsdWVzLnB1c2goc3VyZmFjZUF0KHdvcmxkLCB4LCBieikpO1xuICAgIH1cbiAgICBtZWRpYW5zLnB1c2gobWVkaWFuKHZhbHVlcykpO1xuICAgIGJhbmRzLnB1c2goeyB6MCwgejEsIHk6IDAgfSk7XG4gICAgeiA9IHoxICsgMTtcbiAgfVxuICAvLyBFYWNoIHRlcnJhY2Ugc2l0cyBleGFjdGx5IG9uZSBtZXRyZSBiZWxvdyB0aGUgcHJldmlvdXMgb25lLlxuICBmb3IgKGxldCBpID0gMDsgaSA8IGJhbmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgYmFuZHNbaV0ueSA9IGkgPT09IDAgPyBtZWRpYW5zWzBdIDogTWF0aC5taW4obWVkaWFuc1tpXSwgYmFuZHNbaSAtIDFdLnkgLSAxKTtcbiAgfVxuXG4gIGxldCBtYXhDdXQgPSAwLCBtYXhGaWxsID0gMCwgY3V0Vm9sdW1lID0gMCwgZmlsbFZvbHVtZSA9IDA7XG4gIGNvbnN0IHN1cmZhY2U6IFN1cmZhY2VTYW1wbGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGIgb2YgYmFuZHMpIHtcbiAgICBmb3IgKGxldCBieiA9IGIuejA7IGJ6IDw9IGIuejE7IGJ6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgICAgICBjb25zdCBzID0gc3VyZmFjZUF0KHdvcmxkLCB4LCBieik7XG4gICAgICAgIHN1cmZhY2UucHVzaCh7IHgsIHo6IGJ6LCB5OiBiLnkgfSk7XG4gICAgICAgIGNvbnN0IGQgPSBzIC0gYi55O1xuICAgICAgICBpZiAoZCA+IDApIHsgY3V0Vm9sdW1lICs9IGQ7IG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZCk7IH1cbiAgICAgICAgaWYgKGQgPCAwKSB7IGZpbGxWb2x1bWUgKz0gLWQ7IG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCAtZCk7IH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKG1heEN1dCA+IEZBUk1fUlVMRVMubWF4Q3V0IHx8IG1heEZpbGwgPiBGQVJNX1JVTEVTLm1heEZpbGxcbiAgICB8fCBjdXRWb2x1bWUgPiBGQVJNX1JVTEVTLm1heEN1dFZvbHVtZSB8fCBmaWxsVm9sdW1lID4gRkFSTV9SVUxFUy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndGVycmFjZV9lYXJ0aHdvcmsnLCBbXG4gICAgICBgY3V0ICR7Y3V0Vm9sdW1lfSBtXHUwMEIzIC8gZmlsbCAke2ZpbGxWb2x1bWV9IG1cdTAwQjMsIG1heCAke21heEN1dH0vJHttYXhGaWxsfSBtYCxcbiAgICBdKTtcbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG4gIGZvciAoY29uc3QgcyBvZiBzdXJmYWNlKSB7XG4gICAgY29uc3QgdG9wID0gZ2V0Vm94ZWwod29ybGQsIHMueCwgcy55IC0gMSwgcy56KTtcbiAgICBpZiAodG9wICE9PSBNQVQuU09JTCkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndGVycmFjZV9zdXJmYWNlJywgW1xuICAgICAgICBgY29sdW1uICR7cy54fSwke3Muen0gdG9wIGlzICR7dG9wfSwgZXhwZWN0ZWQgc29pbGAsXG4gICAgICBdKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBjeCA9IChyZWN0LngwICsgcmVjdC54MSArIDEpIC8gMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgZm9yIChjb25zdCBiIG9mIGJhbmRzKSB7XG4gICAgY29uc3QgYnogPSAoYi56MCArIGIuejEgKyAxKSAvIDI7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICdzb2lsX2JlZCcsIHg6IGN4LCB5OiBiLnksIHo6IGJ6LFxuICAgICAgdzogd2lkdGgsIGg6IDAuMTgsIGQ6IGIuejEgLSBiLnowICsgMSwgdG9uZTogJ3NvaWwnLFxuICAgIH0pO1xuICAgIC8vIFRocmVlIGNyb3Agcm93cyBwZXIgdGVycmFjZSwgaW5zZXQgZnJvbSB0aGUgcmV0YWluaW5nIHdhbGxzLlxuICAgIGNvbnN0IHJvd0RlcHRoID0gYi56MSAtIGIuejAgKyAxO1xuICAgIGZvciAobGV0IHIgPSAwOyByIDwgMzsgcisrKSB7XG4gICAgICBjb25zdCB0ID0gKHIgKyAxKSAvIDQ7XG4gICAgICBtb2R1bGVzLnB1c2goe1xuICAgICAgICBraW5kOiAnY3JvcF9yb3cnLCB4OiBjeCwgeTogYi55ICsgMC4xOCwgejogYi56MCArIHJvd0RlcHRoICogdCxcbiAgICAgICAgdzogd2lkdGggLSAxLjIsIGg6IDAuMjgsIGQ6IDAuMzYsIHRvbmU6ICdjcm9wJyxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGxldCBpID0gMTsgaSA8IGJhbmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgdXBwZXIgPSBiYW5kc1tpIC0gMV07XG4gICAgY29uc3QgbG93ZXIgPSBiYW5kc1tpXTtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3JldGFpbmluZ193YWxsJywgeDogY3gsIHk6IGxvd2VyLnksIHo6IHVwcGVyLnoxICsgMC41LFxuICAgICAgdzogd2lkdGgsIGg6IHVwcGVyLnkgLSBsb3dlci55LCBkOiAwLjQsIHRvbmU6ICdzdG9uZV9iJyxcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IG1pblkgPSBNYXRoLm1pbiguLi5iYW5kcy5tYXAoKGIpID0+IGIueSkpO1xuICBjb25zdCBtYXhZID0gTWF0aC5tYXgoLi4uYmFuZHMubWFwKChiKSA9PiBiLnkpKTtcbiAgY29uc3QgcGxhbjogU3RydWN0dXJlUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAga2luZDogJ3RlcnJhY2UnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgb3JpZ2luOiB7IHg6IGN4LCB5OiBtaW5ZLCB6OiAocmVjdC56MCArIHJlY3QuejEgKyAxKSAvIDIgfSxcbiAgICByb3Q6IDAsXG4gICAgbW9kdWxlcyxcbiAgICBjb3N0OiB7IC4uLlRFUlJBQ0VfQ09TVCB9LFxuICAgIGVudmVsb3BlOiBmb290cHJpbnRFbnZlbG9wZShyZWN0LCBtaW5ZIC0gMSwgbWF4WSArIDIsIDEpLFxuICAgIHN1cmZhY2UsXG4gICAgdGVycmFjZXM6IGJhbmRzLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhblN0cnVjdHVyZSh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBpZiAocHJvcG9zYWwuZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTikgcmV0dXJuIHBsYW5Gb3VuZGVyRGVzaWduKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmIChwcm9wb3NhbC5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd1bnN1cHBvcnRlZF9kZXNpZ24nLCBbYHVuc3VwcG9ydGVkIHN0cnVjdHVyZSBkZXNpZ24gJHtTdHJpbmcocHJvcG9zYWwuZGVzaWduVmVyc2lvbil9YF0pO1xuICB9XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAnaG91c2UnKSByZXR1cm4gcGxhbkhvdXNlKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAncGF0aCcpIHJldHVybiBwbGFuUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICByZXR1cm4gcGxhblRlcnJhY2VzKHdvcmxkLCBwcm9wb3NhbCk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVzaWduIDI6IGJvdW5kZWQgZm91bmRlciBjYW5kaWRhdGUgLS0tLS0tLS0tLVxuLy8gVGhpcyBkZWxpYmVyYXRlbHkgbGVhdmVzIGV2ZXJ5IGxlZ2FjeSBwbGFubmVyIGFib3ZlIHVudG91Y2hlZC4gVGhlIGV4dHJhIHdhbGxcbi8vIHByaW1pdGl2ZXMgcmVwcmVzZW50IHZvaWRzLCBub3QgZGVjb3JhdGl2ZSB3aW5kb3dzOyB0aGVpciBhc3NldC1sZXZlbCB2b2x1bWVcbi8vIGludGVycHJldGF0aW9uIHJlbWFpbnMgUmV2aWV3IFJlcXVpcmVkICh0aGUgZm91bmRlciA0XHUyMDEzOSB2b2x1bWUgdGFyZ2V0KS5cbmZ1bmN0aW9uIHBsYW5Gb3VuZGVyRGVzaWduKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAncGF0aCcpIHJldHVybiBwbGFuRm91bmRlclBhdGgod29ybGQsIHByb3Bvc2FsKTtcbiAgY29uc3QgcGxhbm5lZCA9IHByb3Bvc2FsLmtpbmQgPT09ICdob3VzZScgPyBwbGFuSG91c2Uod29ybGQsIHByb3Bvc2FsKSA6IHBsYW5UZXJyYWNlcyh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBpZiAocHJvcG9zYWwua2luZCA9PT0gJ3RlcnJhY2UnKSB7XG4gICAgLy8gQ3JvcCByb3dzIHN0YXkgY29tcGFjdCBhdXRob3JpdGF0aXZlIGFnZ3JlZ2F0ZXMuIFRoZWlyIGZhY2V0ZWQgZm9saWFnZSBpc1xuICAgIC8vIGRlcml2ZWQgcHJlc2VudGF0aW9uIG9ubHk7IG5vIHBsYW50LWxldmVsIGV4aXN0ZW5jZSBvciB5aWVsZCBpcyBpbnZlbnRlZC5cbiAgICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gICAgcGxhbm5lZC5wbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFubmVkLnBsYW4pfWA7XG4gICAgcmV0dXJuIHBsYW5uZWQ7XG4gIH1cbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHgwID0gcmVjdC54MCwgeDEgPSByZWN0LngxICsgMTtcbiAgY29uc3QgejAgPSByZWN0LnowLCB6MSA9IHJlY3QuejEgKyAxO1xuICBjb25zdCB5ID0gcHJvcG9zYWwuZmxvb3JZLCBjeCA9ICh4MCArIHgxKSAvIDIsIGN6ID0gKHowICsgejEpIC8gMjtcbiAgY29uc3QgdCA9IDAuNiwgaCA9IDMuMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgLy8gT25lIHN0cnVjdHVyYWwgc3RvbmUgZmFtaWx5OiBsaWdodGluZywgbm90IHBhaW50ZWQgZmFjZSB2YXJpYXRpb24sIHNoYWRlcyBpdC5cbiAgY29uc3Qgd2FsbCA9ICh4OiBudW1iZXIsIGJvdHRvbTogbnVtYmVyLCB6OiBudW1iZXIsIHc6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGQ6IG51bWJlciwga2luZDogU3RydWN0dXJlTW9kdWxlWydraW5kJ10gPSAnd2FsbCcpID0+IHtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kLCB4LCB5OiBib3R0b20sIHosIHcsIGg6IGhlaWdodCwgZCwgdG9uZTogJ3N0b25lJyB9KTtcbiAgfTtcbiAgd2FsbChjeCwgeSAtIDAuNCwgY3osIDgsIDAuNCwgNiwgJ2Zsb29yJyk7XG4gIHdhbGwoY3gsIHksIHowICsgdCAvIDIsIDgsIGgsIHQpO1xuICBjb25zdCBpbm5lclowID0gejAgKyB0LCBpbm5lcloxID0gejEgLSB0O1xuICB3YWxsKHgwICsgdCAvIDIsIHksIChpbm5lclowICsgaW5uZXJaMSkgLyAyLCB0LCBoLCBpbm5lcloxIC0gaW5uZXJaMCk7XG4gIGNvbnN0IGRvb3JaID0gKHByb3Bvc2FsLmRvb3I/LnogPz8gcmVjdC56MCkgKyAwLjU7XG4gIGNvbnN0IGRvb3IwID0gZG9vclogLSAwLjYsIGRvb3IxID0gZG9vclogKyAwLjY7XG4gIGNvbnN0IGVhc3RYID0geDEgLSB0IC8gMjtcbiAgd2FsbChlYXN0WCwgeSwgKGlubmVyWjAgKyBkb29yMCkgLyAyLCB0LCBoLCBkb29yMCAtIGlubmVyWjApO1xuICB3YWxsKGVhc3RYLCB5LCAoZG9vcjEgKyBpbm5lcloxKSAvIDIsIHQsIGgsIGlubmVyWjEgLSBkb29yMSk7XG4gIHdhbGwoZWFzdFgsIHkgKyAyLjIsIGRvb3JaLCB0LCAwLjQsIDEuMiwgJ2xpbnRlbCcpO1xuICB3YWxsKGVhc3RYLCB5ICsgMi42LCBkb29yWiwgdCwgMC42LCAxLjIpO1xuICBjb25zdCBzb3V0aFogPSB6MSAtIHQgLyAyO1xuICBmb3IgKGNvbnN0IFthLCBiXSBvZiBbW3gwICsgdCwgY3ggLSAyLjZdLCBbY3ggLSAxLjQsIGN4ICsgMS40XSwgW2N4ICsgMi42LCB4MSAtIHRdXSkge1xuICAgIHdhbGwoKGEgKyBiKSAvIDIsIHksIHNvdXRoWiwgYiAtIGEsIGgsIHQpO1xuICB9XG4gIGZvciAoY29uc3Qgd3ggb2YgW2N4IC0gMiwgY3ggKyAyXSkge1xuICAgIHdhbGwod3gsIHksIHNvdXRoWiwgMS4yLCAxLCB0KTtcbiAgICB3YWxsKHd4LCB5ICsgMi40LCBzb3V0aFosIDEuMiwgMC44LCB0LCAnbGludGVsJyk7XG4gIH1cbiAgd2FsbChjeCwgeSArIGgsIGN6LCA4LCAwLjQsIDYsICdyb29mJyk7XG4gIHdhbGwoY3gsIHkgKyBoICsgMC40LCB6MCArIDAuMTUsIDgsIDAuMywgMC4zLCAncGFyYXBldCcpO1xuICB3YWxsKGN4LCB5ICsgaCArIDAuNCwgejEgLSAwLjE1LCA4LCAwLjMsIDAuMywgJ3BhcmFwZXQnKTtcbiAgd2FsbChjeCAtIDMuODUsIHkgKyBoICsgMC40LCBjeiwgMC4zLCAwLjMsIDUuNCwgJ3BhcmFwZXQnKTtcbiAgd2FsbChjeCArIDMuODUsIHkgKyBoICsgMC40LCBjeiwgMC4zLCAwLjMsIDUuNCwgJ3BhcmFwZXQnKTtcbiAgcGxhbm5lZC5wbGFuLm1vZHVsZXMgPSBtb2R1bGVzO1xuICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gIHBsYW5uZWQucGxhbi5lbnZlbG9wZSA9IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIHkgLSAxLCB5ICsgNCwgMik7XG4gIHBsYW5uZWQucGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbm5lZC5wbGFuKX1gO1xuICByZXR1cm4gcGxhbm5lZDtcbn1cblxuZnVuY3Rpb24gcGxhbkZvdW5kZXJQYXRoKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBjb25zdCBoZWlnaHRzID0gcGxhbm5lZC5wbGFuLm1vZHVsZXMuZmlsdGVyKChtKSA9PiBtLmtpbmQgPT09ICdwYXRoJykubWFwKChtKSA9PiBtLnkpO1xuICBjb25zdCB6MCA9IHBsYW5uZWQucGxhbi5yZWN0LnowLCB6MSA9IHBsYW5uZWQucGxhbi5yZWN0LnoxICsgMTtcbiAgbGV0IHN0YXJ0ID0gMDtcbiAgZm9yIChsZXQgZW5kID0gMTsgZW5kIDw9IGhlaWdodHMubGVuZ3RoOyBlbmQrKykge1xuICAgIGlmIChlbmQgPCBoZWlnaHRzLmxlbmd0aCAmJiBoZWlnaHRzW2VuZF0gPT09IGhlaWdodHNbc3RhcnRdKSBjb250aW51ZTtcbiAgICBjb25zdCB4ID0gcGxhbm5lZC5wbGFuLnJlY3QueDAgKyBzdGFydCwgd2lkdGggPSBlbmQgLSBzdGFydDtcbiAgICBjb25zdCBjeCA9IHggKyB3aWR0aCAvIDIsIHkgPSBoZWlnaHRzW3N0YXJ0XTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGF0aCcsIHg6IGN4LCB5LCB6OiAoejAgKyB6MSkgLyAyLCB3OiB3aWR0aCwgaDogMC4xMiwgZDogMywgdG9uZTogJ2dyYXZlbCcgfSk7XG4gICAgZm9yIChjb25zdCB6IG9mIFt6MCArIDAuMDc1LCB6MSAtIDAuMDc1XSkge1xuICAgICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2N1cmInLCB4OiBjeCwgeSwgeiwgdzogd2lkdGgsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZScgfSk7XG4gICAgfVxuICAgIHN0YXJ0ID0gZW5kO1xuICB9XG4gIHBsYW5uZWQucGxhbi5tb2R1bGVzID0gbW9kdWxlcztcbiAgcGxhbm5lZC5wbGFuLmRlc2lnblZlcnNpb24gPSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuICBwbGFubmVkLnBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW5uZWQucGxhbil9YDtcbiAgcmV0dXJuIHBsYW5uZWQ7XG59XG5cblxuLy8gLS0tLS0tLS0tLSBhdXRob3JpemF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlTGltaXRzIHtcbiAgbWF4TW9kdWxlczogbnVtYmVyO1xuICBtYXhDb3N0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1NUUlVDVFVSRV9MSU1JVFM6IFN0cnVjdHVyZUxpbWl0cyA9IHtcbiAgbWF4TW9kdWxlczogNjQsXG4gIG1heENvc3Q6IDEyOCxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlQXV0aG9yaXphdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgYmFzZVJldmlzaW9uOiBudW1iZXI7XG4gIGxpbWl0czogU3RydWN0dXJlTGltaXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZURlY2lzaW9uIHtcbiAgb2s6IGJvb2xlYW47XG4gIGF1dGhvcml6YXRpb246IFN0cnVjdHVyZUF1dGhvcml6YXRpb24gfCBudWxsO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciB7XG4gIHJlYWRvbmx5IGF1dGhvcml0eSA9IExPQ0FMX0FVVEhPUklUWTtcbiAgcmVhZG9ubHkgZW5mb3JjZW1lbnQgPSBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcmVhZG9ubHkgbGltaXRzOiBTdHJ1Y3R1cmVMaW1pdHM7XG5cbiAgY29uc3RydWN0b3IocmVhZG9ubHkgcG9saWN5OiBBdXRob3JpemF0aW9uUG9saWN5LCBsaW1pdHM6IFBhcnRpYWw8U3RydWN0dXJlTGltaXRzPiA9IHt9KSB7XG4gICAgdGhpcy5saW1pdHMgPSB7IC4uLkRFRkFVTFRfU1RSVUNUVVJFX0xJTUlUUywgLi4ubGltaXRzIH07XG4gIH1cblxuICBhdXRob3JpemUod29ybGQ6IFdvcmxkLCBwbGFuOiBTdHJ1Y3R1cmVQbGFuKTogU3RydWN0dXJlRGVjaXNpb24ge1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKHBsYW4ubW9kdWxlcy5sZW5ndGggPT09IDApIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gbW9kdWxlcycpO1xuICAgIGlmIChwbGFuLm1vZHVsZXMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4TW9kdWxlcykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4ubW9kdWxlcy5sZW5ndGh9IG1vZHVsZXMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4TW9kdWxlc31gKTtcbiAgICB9XG4gICAgaWYgKGNvc3RUb3RhbChwbGFuLmNvc3QpID4gdGhpcy5saW1pdHMubWF4Q29zdCkge1xuICAgICAgcmVhc29ucy5wdXNoKGBjb3N0ICR7Y29zdFRvdGFsKHBsYW4uY29zdCl9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhDb3N0fWApO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhwbGFuLmNvc3QpKSB7XG4gICAgICBpZiAoIU51bWJlci5pc0ludGVnZXIoYW1vdW50KSB8fCAoYW1vdW50ID8/IDApIDwgMCkge1xuICAgICAgICByZWFzb25zLnB1c2goYGNvc3QgJHtyZXNvdXJjZX09JHthbW91bnR9IGlzIG5vdCBhIG5vbi1uZWdhdGl2ZSBpbnRlZ2VyYCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChwbGFuLmVudmVsb3BlLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyB3b3JrIGVudmVsb3BlJyk7XG4gICAgZm9yIChjb25zdCByZWdpb24gb2YgcGxhbi5lbnZlbG9wZSkge1xuICAgICAgaWYgKCF0aGlzLnBvbGljeS5lbnZlbG9wZS5zb21lKChwKSA9PiByZWdpb24ueDAgPj0gcC54MCAmJiByZWdpb24ueDEgPD0gcC54MVxuICAgICAgICAmJiByZWdpb24uejAgPj0gcC56MCAmJiByZWdpb24uejEgPD0gcC56MVxuICAgICAgICAmJiByZWdpb24ueTAgPj0gcC55MCAmJiByZWdpb24ueTEgPD0gcC55MSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBlbnZlbG9wZSAke3JlZ2lvbi54MH0sJHtyZWdpb24uejB9LCR7cmVnaW9uLnkwfS4uJHtyZWdpb24ueDF9LCR7cmVnaW9uLnoxfSwke3JlZ2lvbi55MX0gaXMgb3V0c2lkZSB0aGUgbG9jYWwgcG9saWN5YCk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgbSBvZiBwbGFuLm1vZHVsZXMpIHtcbiAgICAgIGlmICghbW9kdWxlSW5zaWRlRW52ZWxvcGUobSwgcGxhbi5lbnZlbG9wZSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBtb2R1bGUgJHttLmtpbmR9IGF0ICR7bS54fSwke20ueX0sJHttLnp9IGlzIG91dHNpZGUgdGhlIHBsYW4gZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHBsYW4uc3VyZmFjZS5sZW5ndGggPT09IDApIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gc3VyZmFjZSBzYW1wbGVzJyk7XG4gICAgZm9yIChjb25zdCBzIG9mIHBsYW4uc3VyZmFjZSkge1xuICAgICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHMueCwgcy55LCBzLnopKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgc3VyZmFjZSAke3MueH0sJHtzLnp9LCR7cy55fSBpcyBvdXRzaWRlIHRoZSBwbGFuIGVudmVsb3BlYCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiB7IG9rOiBmYWxzZSwgYXV0aG9yaXphdGlvbjogbnVsbCwgcmVhc29ucyB9O1xuXG4gICAgY29uc3QgdG9rZW46IFN0cnVjdHVyZUF1dGhvcml6YXRpb24gPSB7XG4gICAgICBpZDogYGxvY2FsLXN0dWI6c3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWAsXG4gICAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICAgIHBsYW5EaWdlc3Q6IHN0cnVjdHVyZURpZ2VzdChwbGFuKSxcbiAgICAgIGVudmVsb3BlOiBwbGFuLmVudmVsb3BlLm1hcCgoZSkgPT4gKHsgLi4uZSB9KSksXG4gICAgICBiYXNlUmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgICAgbGltaXRzOiB7IC4uLnRoaXMubGltaXRzIH0sXG4gICAgfTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgYXV0aG9yaXphdGlvbjogdG9rZW4sIHJlYXNvbnM6IFtdIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBleGVjdXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVMZWRnZXIge1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIGF1dGhvcml6YXRpb25JZDogc3RyaW5nO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIHN0cnVjdHVyZUlkOiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICBtb2R1bGVDb3VudDogbnVtYmVyO1xuICBjb3N0UGFpZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgaW52ZW50b3J5QmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBpbnZlbnRvcnlBZnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgcmV2aXNpb25CZWZvcmU6IG51bWJlcjtcbiAgcmV2aXNpb25BZnRlcjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogU3RydWN0dXJlUGxhbjtcbiAgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbjtcbiAgbGVkZ2VyOiBTdHJ1Y3R1cmVMZWRnZXI7XG59XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZU91dGNvbWUgPSBTdHJ1Y3R1cmVTdWNjZXNzIHwgU3RydWN0dXJlRmFpbHVyZTtcblxuZXhwb3J0IGZ1bmN0aW9uIGV4ZWN1dGVTdHJ1Y3R1cmUoXG4gIHdvcmxkOiBXb3JsZCwgcGxhbjogU3RydWN0dXJlUGxhbiwgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbixcbik6IFN0cnVjdHVyZU91dGNvbWUge1xuICBpZiAoYXV0aG9yaXphdGlvbi5hdXRob3JpdHkgIT09IExPQ0FMX0FVVEhPUklUWVxuICAgIHx8IGF1dGhvcml6YXRpb24uZW5mb3JjZW1lbnQgIT09IExPQ0FMX0VORk9SQ0VNRU5UKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5zdXBwb3J0ZWRfYXV0aG9yaXR5JywgW1xuICAgICAgYGF1dGhvcml0eSAke2F1dGhvcml6YXRpb24uYXV0aG9yaXR5fS8ke2F1dGhvcml6YXRpb24uZW5mb3JjZW1lbnR9IGlzIG5vdCB0aGUgbG9jYWwgc3R1YmAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCAhPT0gc3RydWN0dXJlRGlnZXN0KHBsYW4pKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZGlnZXN0X21pc21hdGNoJywgWydhdXRob3JpemF0aW9uIGRvZXMgbm90IG1hdGNoIHRoaXMgc3RydWN0dXJlIHBsYW4nXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24uYmFzZVJldmlzaW9uICE9PSB3b3JsZC5yZXZpc2lvbikge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3N0YWxlX2F1dGhvcml6YXRpb24nLCBbXG4gICAgICBgYXV0aG9yaXphdGlvbiB3YXMgaXNzdWVkIGF0IHJldmlzaW9uICR7YXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb259LCB3b3JsZCBpcyBhdCAke3dvcmxkLnJldmlzaW9ufWAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKHBsYW4uZW52ZWxvcGUuc29tZSgocikgPT4gIWF1dGhvcml6YXRpb24uZW52ZWxvcGUuc29tZSgoYSkgPT4gci54MCA+PSBhLngwXG4gICAgJiYgci54MSA8PSBhLngxICYmIHIuejAgPj0gYS56MCAmJiByLnoxIDw9IGEuejEgJiYgci55MCA+PSBhLnkwICYmIHIueTEgPD0gYS55MSkpKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZW52ZWxvcGVfbWlzbWF0Y2gnLCBbJ3BsYW4gZW52ZWxvcGUgaXMgd2lkZXIgdGhhbiB0aGUgYXV0aG9yaXphdGlvbiddKTtcbiAgfVxuXG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgbSBvZiBwbGFuLm1vZHVsZXMpIHtcbiAgICBpZiAoIW1vZHVsZUluc2lkZUVudmVsb3BlKG0sIGF1dGhvcml6YXRpb24uZW52ZWxvcGUpKSB7XG4gICAgICByZWFzb25zLnB1c2goYG1vZHVsZSAke20ua2luZH0gYXQgJHttLnh9LCR7bS55fSwke20uen0gaXMgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZWApO1xuICAgIH1cbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHBsYW4uc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goLi4ubWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcGxhbi5yZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmb290cHJpbnQgaGFzICR7b2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zYCk7XG4gIH1cbiAgaWYgKHdvcmxkLnN0cnVjdHVyZXMuaGFzKHBsYW4uaWQpKSB7XG4gICAgcmVhc29ucy5wdXNoKGBzdHJ1Y3R1cmUgJHtwbGFuLmlkfSBhbHJlYWR5IGV4aXN0c2ApO1xuICB9XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICBjb25zdCBoYXZlID0gd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwO1xuICAgIGlmIChoYXZlIDwgKGFtb3VudCA/PyAwKSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBuZWVkICR7YW1vdW50fSAke3Jlc291cmNlfSwgaGF2ZSAke2hhdmV9YCk7XG4gICAgfVxuICB9XG4gIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3VuYXV0aG9yaXplZF9zdHJ1Y3R1cmUnLCByZWFzb25zKTtcblxuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IHJldmlzaW9uQmVmb3JlID0gd29ybGQucmV2aXNpb247XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICBjb25zdCBsZWZ0ID0gKHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgLSAoYW1vdW50ID8/IDApO1xuICAgIGlmIChsZWZ0ID4gMCkgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA9IGxlZnQ7XG4gICAgZWxzZSBkZWxldGUgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXTtcbiAgfVxuXG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIGNvbnN0IHN0cnVjdHVyZTogU3RydWN0dXJlID0ge1xuICAgIGlkOiBwbGFuLmlkLFxuICAgIGtpbmQ6IHBsYW4ua2luZCxcbiAgICBzaXRlSWQ6IHBsYW4uc2l0ZUlkLFxuICAgIHg6IHBsYW4ub3JpZ2luLngsXG4gICAgeTogcGxhbi5vcmlnaW4ueSxcbiAgICB6OiBwbGFuLm9yaWdpbi56LFxuICAgIHJvdDogcGxhbi5yb3QsXG4gICAgbW9kdWxlczogcGxhbi5tb2R1bGVzLm1hcCgobSkgPT4gKHsgLi4ubSB9KSksXG4gICAgY29zdDogeyAuLi5wbGFuLmNvc3QgfSxcbiAgICBidWlsdFJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICAuLi4ocGxhbi5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OID8geyBkZXNpZ25WZXJzaW9uOiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OIH0gOiB7fSksXG4gICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gIH07XG4gIHdvcmxkLnN0cnVjdHVyZXMuc2V0KHN0cnVjdHVyZS5pZCwgc3RydWN0dXJlKTtcblxuICBjb25zdCBsZWRnZXI6IFN0cnVjdHVyZUxlZGdlciA9IHtcbiAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgYXV0aG9yaXphdGlvbklkOiBhdXRob3JpemF0aW9uLmlkLFxuICAgIHBsYW5EaWdlc3Q6IGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCxcbiAgICBzdHJ1Y3R1cmVJZDogc3RydWN0dXJlLmlkLFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAga2luZDogcGxhbi5raW5kLFxuICAgIG1vZHVsZUNvdW50OiBzdHJ1Y3R1cmUubW9kdWxlcy5sZW5ndGgsXG4gICAgY29zdFBhaWQ6IHsgLi4ucGxhbi5jb3N0IH0sXG4gICAgaW52ZW50b3J5QmVmb3JlLFxuICAgIGludmVudG9yeUFmdGVyOiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCksXG4gICAgcmV2aXNpb25CZWZvcmUsXG4gICAgcmV2aXNpb25BZnRlcjogd29ybGQucmV2aXNpb24sXG4gIH07XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCBhdXRob3JpemF0aW9uLCBsZWRnZXIgfTtcbn1cblxuLyoqXG4gKiBUaGUgc2hhcmVkIHBsYXllci9BSSBzdHJ1Y3R1cmUgZW50cnkgcG9pbnQuIFRlcnJhaW4gbXVzdCBhbHJlYWR5IGJlIHByZXBhcmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTdHJ1Y3R1cmUoXG4gIHdvcmxkOiBXb3JsZCxcbiAgYXV0aG9yaXplcjogTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLFxuICBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwsXG4pOiBTdHJ1Y3R1cmVPdXRjb21lIHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5TdHJ1Y3R1cmUod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgY29uc3QgZGVjaXNpb24gPSBhdXRob3JpemVyLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgaWYgKCFkZWNpc2lvbi5vayB8fCAhZGVjaXNpb24uYXV0aG9yaXphdGlvbikge1xuICAgIHJldHVybiBmYWlsKCdhdXRob3JpemUnLCAnbm90X2F1dGhvcml6ZWQnLCBkZWNpc2lvbi5yZWFzb25zKTtcbiAgfVxuICByZXR1cm4gZXhlY3V0ZVN0cnVjdHVyZSh3b3JsZCwgcGxhbm5lZC5wbGFuLCBkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcbn1cbiIsICIvLyBDYW5vbmljYWwgc3RhdGUgaGFzaGluZyBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLCBubyB0aHJlZS5qcyBpbXBvcnRzLlxuLy9cbi8vIFRoZSBuby1mbGF0dGVuIHByb29mIGNvbXBhcmVzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVsIHZvbHVtZSBvdXRzaWRlIHRoZVxuLy8gY29tcGxldGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlLiBJdCBkZWxpYmVyYXRlbHkgZG9lcyBub3QgaGFzaCBjaHVua1xuLy8gaGVpZ2h0cy90b3BNYXRlcmlhbHMgKGRlcml2ZWQgY2FjaGVzKSwgbWVzaCBnZW9tZXRyeSwgc3RyZWFtaW5nIHN0YXRlIG9yXG4vLyBuYXZpZ2F0aW9uIGRhdGEuIFRob3NlIGFyZSBjaGVja2VkIHNlcGFyYXRlbHkgYXMgZGVyaXZlZCBzdGF0ZSwgc28gYSBjYWNoZVxuLy8gb3IgbWVzaCByZWJ1aWxkIGNhbiBuZXZlciBiZSBtaXN0YWtlbiBmb3IgYSB0ZXJyYWluIG11dGF0aW9uLlxuaW1wb3J0IHtcbiAgV29ybGQsIFlfTUlOLCBZX01BWCwgSEFMRiwgQ0hVTktfU0laRSwgQ0hVTktfQVJFQSxcbiAgZW5zdXJlQ2h1bmssIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWiwgbG9jYWxJbmRleCwgeVRvSW5kZXgsIGlzU29saWQsXG4gIEVudGl0eSxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBWb3hlbFJlZ2lvbiwgZW52ZWxvcGVDb250YWlucyB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBGT1VOREVSX0RFU0lHTl9WRVJTSU9OIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcblxuZXhwb3J0IGludGVyZmFjZSBTdGF0ZUhhc2gge1xuICAvKiogMTYgaGV4IGNoYXJhY3RlcnM6IHR3byBpbmRlcGVuZGVudCAzMi1iaXQgbGFuZXMuICovXG4gIGhhc2g6IHN0cmluZztcbiAgY2VsbHM6IG51bWJlcjtcbiAgZXhjbHVkZWRDZWxsczogbnVtYmVyO1xuICBjaHVua3M6IG51bWJlcjtcbiAgcmVnaW9uOiBWb3hlbFJlZ2lvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYWNoZU1pc21hdGNoIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGZpZWxkOiAnaGVpZ2h0JyB8ICdtYXRlcmlhbCc7XG4gIGV4cGVjdGVkOiBudW1iZXI7XG4gIGFjdHVhbDogbnVtYmVyO1xufVxuXG5jbGFzcyBIYXNoZXIge1xuICBwcml2YXRlIGEgPSAweDgxMWM5ZGM1O1xuICBwcml2YXRlIGIgPSAweDllMzc3OWI5O1xuXG4gIGJ5dGUodjogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgeCA9IHYgJiAweGZmO1xuICAgIHRoaXMuYSA9IE1hdGguaW11bCh0aGlzLmEgXiB4LCAweDAxMDAwMTkzKTtcbiAgICB0aGlzLmIgPSBNYXRoLmltdWwodGhpcy5iIF4gKHggKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgdGhpcy5iIF49IHRoaXMuYiA+Pj4gMTM7XG4gIH1cblxuICB1MzIodjogbnVtYmVyKTogdm9pZCB7XG4gICAgbGV0IG4gPSB2ID4+PiAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG4gICAgICB0aGlzLmJ5dGUobik7XG4gICAgICBuID4+Pj0gODtcbiAgICB9XG4gIH1cblxuICBzdHJpbmcoczogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy51MzIocy5sZW5ndGgpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcy5sZW5ndGg7IGkrKykgdGhpcy5ieXRlKHMuY2hhckNvZGVBdChpKSk7XG4gIH1cblxuICBoZXgoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gKHRoaXMuYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICAgICsgKHRoaXMuYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wUmVnaW9uKHJlZ2lvbjogVm94ZWxSZWdpb24pOiBWb3hlbFJlZ2lvbiB7XG4gIGNvbnN0IHI6IFZveGVsUmVnaW9uID0ge1xuICAgIHgwOiBNYXRoLm1heCgtSEFMRiwgTWF0aC5mbG9vcihyZWdpb24ueDApKSxcbiAgICB6MDogTWF0aC5tYXgoLUhBTEYsIE1hdGguZmxvb3IocmVnaW9uLnowKSksXG4gICAgeDE6IE1hdGgubWluKEhBTEYgLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi54MSkpLFxuICAgIHoxOiBNYXRoLm1pbihIQUxGIC0gMSwgTWF0aC5mbG9vcihyZWdpb24uejEpKSxcbiAgICB5MDogTWF0aC5tYXgoWV9NSU4sIE1hdGguZmxvb3IocmVnaW9uLnkwKSksXG4gICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5mbG9vcihyZWdpb24ueTEpKSxcbiAgfTtcbiAgaWYgKHIueDAgPiByLngxIHx8IHIuejAgPiByLnoxIHx8IHIueTAgPiByLnkxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBlbXB0eSB2b3hlbCByZWdpb24gJHtKU09OLnN0cmluZ2lmeShyZWdpb24pfWApO1xuICB9XG4gIHJldHVybiByO1xufVxuXG4vKiogU29ydCBhbiBlbnZlbG9wZSBzbyBpdHMgaGFzaCBpcyBpbmRlcGVuZGVudCBvZiByZWN0IG9yZGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUVudmVsb3BlKHJlY3RzOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogVm94ZWxSZWdpb25bXSB7XG4gIHJldHVybiByZWN0c1xuICAgIC5tYXAoKHIpID0+ICh7XG4gICAgICB4MDogTWF0aC5mbG9vcihyLngwKSwgejA6IE1hdGguZmxvb3Ioci56MCksIHgxOiBNYXRoLmZsb29yKHIueDEpLCB6MTogTWF0aC5mbG9vcihyLnoxKSxcbiAgICAgIHkwOiBNYXRoLmZsb29yKHIueTApLCB5MTogTWF0aC5mbG9vcihyLnkxKSxcbiAgICB9KSlcbiAgICAuc29ydCgoYSwgYikgPT4gYS54MCAtIGIueDAgfHwgYS56MCAtIGIuejAgfHwgYS55MCAtIGIueTBcbiAgICAgIHx8IGEueDEgLSBiLngxIHx8IGEuejEgLSBiLnoxIHx8IGEueTEgLSBiLnkxKTtcbn1cblxuLyoqIE1hdGVyaWFsaXNlIGV2ZXJ5IGNodW5rIHRoYXQgb3ZlcmxhcHMgdGhlIHJlZ2lvbiBhbmQgcmV0dXJuIHNvcnRlZCBrZXlzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjeDAgPSB3b3JsZFRvQ2h1bmtYKHIueDApLCBjeDEgPSB3b3JsZFRvQ2h1bmtYKHIueDEpO1xuICBjb25zdCBjejAgPSB3b3JsZFRvQ2h1bmtaKHIuejApLCBjejEgPSB3b3JsZFRvQ2h1bmtaKHIuejEpO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykge1xuICAgICAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgY2h1bmsgJHtjeH0sJHtjen0gaXMgb3V0c2lkZSB0aGUgd29ybGRgKTtcbiAgICAgIGtleXMucHVzaChjaHVua0tleShjeCwgY3opKTtcbiAgICB9XG4gIH1cbiAga2V5cy5zb3J0KCk7XG4gIHJldHVybiBrZXlzO1xufVxuXG4vKipcbiAqIEhhc2ggdGhlIGF1dGhvcml0YXRpdmUgbWF0ZXJpYWwgYnl0ZSBvZiBldmVyeSB2b3hlbCBpbiBgcmVnaW9uYCwgZXhjbHVkaW5nXG4gKiBldmVyeSB2b3hlbCBpbnNpZGUgYGV4Y2x1ZGVgLiBUd28gY2FsbHMgd2l0aCB0aGUgc2FtZSByZWdpb24gYW5kIGVudmVsb3BlXG4gKiBhcmUgZGlyZWN0bHkgY29tcGFyYWJsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbFJlZ2lvbkhhc2goXG4gIHdvcmxkOiBXb3JsZCxcbiAgcmVnaW9uOiBWb3hlbFJlZ2lvbixcbiAgZXhjbHVkZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSA9IFtdLFxuKTogU3RhdGVIYXNoIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGVudmVsb3BlID0gbm9ybWFsaXplRW52ZWxvcGUoZXhjbHVkZSk7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjp2b3hlbC1zdGF0ZTp2MScpO1xuICBoLnUzMihyLngwKTsgaC51MzIoci56MCk7IGgudTMyKHIueDEpOyBoLnUzMihyLnoxKTsgaC51MzIoci55MCk7IGgudTMyKHIueTEpO1xuICBoLnUzMihlbnZlbG9wZS5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IGUgb2YgZW52ZWxvcGUpIHtcbiAgICBoLnUzMihlLngwKTsgaC51MzIoZS56MCk7IGgudTMyKGUueDEpOyBoLnUzMihlLnoxKTsgaC51MzIoZS55MCk7IGgudTMyKGUueTEpO1xuICB9XG5cbiAgbGV0IGNlbGxzID0gMDtcbiAgbGV0IGV4Y2x1ZGVkQ2VsbHMgPSAwO1xuICBjb25zdCB5aTAgPSByLnkwIC0gWV9NSU47XG4gIGNvbnN0IHlpMSA9IHIueTEgLSBZX01JTjtcblxuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2tleX0gd2FzIG5vdCBnZW5lcmF0ZWRgKTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBoLnN0cmluZygnY2h1bmsnKTtcbiAgICBoLnUzMihjaHVuay5jeCk7IGgudTMyKGNodW5rLmN6KTtcbiAgICBmb3IgKGxldCB5aSA9IHlpMDsgeWkgPD0geWkxOyB5aSsrKSB7XG4gICAgICBjb25zdCB5ID0gWV9NSU4gKyB5aTtcbiAgICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgICAgY29uc3QgeiA9IG96ICsgbHo7XG4gICAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgICBjb25zdCB4ID0gb3ggKyBseDtcbiAgICAgICAgICBpZiAoZW52ZWxvcGUubGVuZ3RoID4gMCAmJiBlbnZlbG9wZUNvbnRhaW5zKGVudmVsb3BlLCB4LCB5LCB6KSkge1xuICAgICAgICAgICAgZXhjbHVkZWRDZWxscysrO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGguYnl0ZShjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlpLCBseildKTtcbiAgICAgICAgICBjZWxscysrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgaGFzaDogaC5oZXgoKSwgY2VsbHMsIGV4Y2x1ZGVkQ2VsbHMsIGNodW5rczoga2V5cy5sZW5ndGgsIHJlZ2lvbjogciB9O1xufVxuXG4vKiogQ2Fub25pY2FsIGludmVudG9yeSBoYXNoOyBrZXkgb3JkZXIgY2Fubm90IGFmZmVjdCB0aGUgcmVzdWx0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbEludmVudG9yeUhhc2god29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6aW52ZW50b3J5OnYxJyk7XG4gIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh3b3JsZC5pbnZlbnRvcnkpLnNvcnQoKTtcbiAgaC51MzIoa2V5cy5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgaC5zdHJpbmcoa2V5KTtcbiAgICBoLnUzMih3b3JsZC5pbnZlbnRvcnlba2V5XSk7XG4gIH1cbiAgcmV0dXJuIGguaGV4KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZDogV29ybGQpOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHdvcmxkLmludmVudG9yeSkuc29ydCgpKSBvdXRba2V5XSA9IHdvcmxkLmludmVudG9yeVtrZXldO1xuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBoYXNoRW50aXR5KGg6IEhhc2hlciwgZTogRW50aXR5KTogdm9pZCB7XG4gIGguc3RyaW5nKGUuaWQpO1xuICBoLnN0cmluZyhlLmtpbmQpO1xuICBoLnN0cmluZyhlLmNodW5rKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnggKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS55ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueiAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnJvdCAqIDEwMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS5zY2FsZSAqIDEwMDApKTtcbiAgaC51MzIoZS52YXJpYW50KTtcbiAgaC5zdHJpbmcoZS5yZXNvdXJjZSA/PyAnJyk7XG4gIGgudTMyKGUucmVtYWluaW5nKTtcbiAgaC51MzIoZS5oYXJ2ZXN0ZWQgPyAxIDogMCk7XG4gIGgudTMyKGUuaGFydmVzdGVkT25jZSA/IDEgOiAwKTtcbn1cblxuLyoqIEhhc2ggZW50aXR5IHN0YXRlOyB3aXRoIGEgcmVnaW9uLCBvbmx5IGVudGl0aWVzIHJvb3RlZCBpbnNpZGUgaXQuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsRW50aXR5SGFzaCh3b3JsZDogV29ybGQsIHJlZ2lvbj86IFZveGVsUmVnaW9uKTogc3RyaW5nIHtcbiAgbGV0IGVudGl0aWVzOiBFbnRpdHlbXTtcbiAgaWYgKHJlZ2lvbikge1xuICAgIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICAgIGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gICAgZW50aXRpZXMgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldLmZpbHRlcihcbiAgICAgIChlKSA9PiBlLnggPj0gci54MCAmJiBlLnggPCByLngxICsgMSAmJiBlLnogPj0gci56MCAmJiBlLnogPCByLnoxICsgMSxcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGVudGl0aWVzID0gWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXTtcbiAgfVxuICBlbnRpdGllcy5zb3J0KChhLCBiKSA9PiAoYS5pZCA8IGIuaWQgPyAtMSA6IGEuaWQgPiBiLmlkID8gMSA6IDApKTtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6ZW50aXR5LXN0YXRlOnYxJyk7XG4gIGgudTMyKGVudGl0aWVzLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgZSBvZiBlbnRpdGllcykgaGFzaEVudGl0eShoLCBlKTtcbiAgcmV0dXJuIGguaGV4KCk7XG59XG5cbi8qKlxuICogQ2Fub25pY2FsIGhhc2ggb2YgYnVpbHQgc3RydWN0dXJlcy4gTGF5b3V0IG1vZHVsZXMgYW5kIHBhaWQgY29zdHMgYXJlXG4gKiBhdXRob3JpdGF0aXZlIHNpbXVsYXRpb24gc3RhdGU7IHJlbmRlcmVyIG1lc2hlcyBhcmUgbm90LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsU3RydWN0dXJlSGFzaCh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCBzdHJ1Y3R1cmVzID0gWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldXG4gICAgLnNvcnQoKGEsIGIpID0+IChhLmlkIDwgYi5pZCA/IC0xIDogYS5pZCA+IGIuaWQgPyAxIDogMCkpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjpzdHJ1Y3R1cmUtc3RhdGU6djEnKTtcbiAgaC51MzIoc3RydWN0dXJlcy5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IHMgb2Ygc3RydWN0dXJlcykge1xuICAgIGguc3RyaW5nKHMuaWQpO1xuICAgIGguc3RyaW5nKHMua2luZCk7XG4gICAgaC5zdHJpbmcocy5zaXRlSWQpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy54ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy55ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy56ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy5yb3QgKiAxMDAwMCkpO1xuICAgIC8vIExlZ2FjeSBoYXNoIGlucHV0IGlzIGJ5dGUtaWRlbnRpY2FsLiBEZXNpZ24gMiBhZGRzIGFuIGV4cGxpY2l0IHRhZy5cbiAgICBpZiAocy5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSBoLnN0cmluZygnZGVzaWduOjInKTtcbiAgICBoLnUzMihzLm1vZHVsZXMubGVuZ3RoKTtcbiAgICBmb3IgKGNvbnN0IG0gb2Ygcy5tb2R1bGVzKSB7XG4gICAgICBoLnN0cmluZyhtLmtpbmQpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnggKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueSAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS56ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLncgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0uaCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS5kICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZCgobS5yb3QgPz8gMCkgKiAxMDAwMCkpO1xuICAgICAgaC5zdHJpbmcobS50b25lID8/ICcnKTtcbiAgICB9XG4gICAgY29uc3QgY29zdEtleXMgPSBPYmplY3Qua2V5cyhzLmNvc3QpLnNvcnQoKTtcbiAgICBoLnUzMihjb3N0S2V5cy5sZW5ndGgpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIGNvc3RLZXlzKSB7XG4gICAgICBoLnN0cmluZyhrZXkpO1xuICAgICAgaC51MzIocy5jb3N0W2tleSBhcyBrZXlvZiB0eXBlb2Ygcy5jb3N0XSA/PyAwKTtcbiAgICB9XG4gICAgaC51MzIocy5idWlsdFJldmlzaW9uKTtcbiAgfVxuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYWNoZUhhc2gge1xuICBoYXNoOiBzdHJpbmc7XG4gIGNvbHVtbnM6IG51bWJlcjtcbiAgY2h1bmtzOiBudW1iZXI7XG59XG5cbi8qKiBEZXJpdmVkIGNvbHVtbi1jYWNoZSBoYXNoLiBOb3QgYXV0aG9yaXRhdGl2ZSB0ZXJyYWluIHN0YXRlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlcml2ZWRDYWNoZUhhc2god29ybGQ6IFdvcmxkLCByZWdpb246IFZveGVsUmVnaW9uKTogQ2FjaGVIYXNoIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjpkZXJpdmVkLWNvbHVtbi1jYWNoZTp2MScpO1xuICBoLnUzMihyLngwKTsgaC51MzIoci56MCk7IGgudTMyKHIueDEpOyBoLnUzMihyLnoxKTtcbiAgbGV0IGNvbHVtbnMgPSAwO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2tleX0gd2FzIG5vdCBnZW5lcmF0ZWRgKTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBoLnN0cmluZygnY2h1bmsnKTtcbiAgICBoLnUzMihjaHVuay5jeCk7IGgudTMyKGNodW5rLmN6KTtcbiAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBoLnUzMihjaHVuay5oZWlnaHRzW2NvbF0pO1xuICAgICAgICBoLnUzMihjaHVuay50b3BNYXRlcmlhbHNbY29sXSk7XG4gICAgICAgIGNvbHVtbnMrKztcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgaGFzaDogaC5oZXgoKSwgY29sdW1ucywgY2h1bmtzOiBrZXlzLmxlbmd0aCB9O1xufVxuXG4vKipcbiAqIFJlY29tcHV0ZSBldmVyeSBjb2x1bW4gY2FjaGUgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbCBkYXRhIGFuZCByZXBvcnRcbiAqIG1pc21hdGNoZXMuIFRoaXMgcHJvdmVzIGhlaWdodHMvdG9wTWF0ZXJpYWxzIGFyZSBkZXJpdmVkLCBub3QgYSBzZWNvbmRcbiAqIHRlcnJhaW4gcmVwcmVzZW50YXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaGVja0Rlcml2ZWRDYWNoZXMod29ybGQ6IFdvcmxkLCByZWdpb246IFZveGVsUmVnaW9uLCBsaW1pdCA9IDY0KTogQ2FjaGVNaXNtYXRjaFtdIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBvdXQ6IENhY2hlTWlzbWF0Y2hbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgY29udGludWU7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgbHgwID0gTWF0aC5tYXgoMCwgci54MCAtIG94KSwgbHgxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIueDEgLSBveCk7XG4gICAgY29uc3QgbHowID0gTWF0aC5tYXgoMCwgci56MCAtIG96KSwgbHoxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIuejEgLSBveik7XG4gICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICAgIGxldCB0b3BNYXQgPSBjaHVuay50b3BNYXRlcmlhbHNbY29sXTtcbiAgICAgICAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgICAgICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkSGVpZ2h0ID0gdG9wU29saWQgLSBZX01JTjtcbiAgICAgICAgaWYgKGNodW5rLmhlaWdodHNbY29sXSAhPT0gZXhwZWN0ZWRIZWlnaHQpIHtcbiAgICAgICAgICBvdXQucHVzaCh7IHg6IG94ICsgbHgsIHo6IG96ICsgbHosIGZpZWxkOiAnaGVpZ2h0JywgZXhwZWN0ZWQ6IGV4cGVjdGVkSGVpZ2h0LCBhY3R1YWw6IGNodW5rLmhlaWdodHNbY29sXSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gIT09IHRvcE1hdCkge1xuICAgICAgICAgIG91dC5wdXNoKHsgeDogb3ggKyBseCwgejogb3ogKyBseiwgZmllbGQ6ICdtYXRlcmlhbCcsIGV4cGVjdGVkOiB0b3BNYXQsIGFjdHVhbDogY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG91dC5sZW5ndGggPj0gbGltaXQpIHJldHVybiBvdXQ7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWRpdE91dHNpZGUge1xuICBjaHVuazogc3RyaW5nO1xuICBpbmRleDogbnVtYmVyO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBtYXRlcmlhbDogbnVtYmVyO1xufVxuXG4vKiogRXZlcnkgcmVjb3JkZWQgdm94ZWwgZWRpdCBvdXRzaWRlIHRoZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUuICovXG5leHBvcnQgZnVuY3Rpb24gZWRpdHNPdXRzaWRlRW52ZWxvcGUod29ybGQ6IFdvcmxkLCBlbnZlbG9wZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IEVkaXRPdXRzaWRlW10ge1xuICBjb25zdCBvdXQ6IEVkaXRPdXRzaWRlW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICAgIGZvciAoY29uc3QgW2luZGV4LCBtYXRlcmlhbF0gb2YgZWRpdHMpIHtcbiAgICAgIGNvbnN0IGx4ID0gaW5kZXggJSBDSFVOS19TSVpFO1xuICAgICAgY29uc3QgbHogPSBNYXRoLmZsb29yKChpbmRleCAlIENIVU5LX0FSRUEpIC8gQ0hVTktfU0laRSk7XG4gICAgICBjb25zdCB5aSA9IE1hdGguZmxvb3IoaW5kZXggLyBDSFVOS19BUkVBKTtcbiAgICAgIGNvbnN0IHggPSBveCArIGx4LCB6ID0gb3ogKyBseiwgeSA9IFlfTUlOICsgeWk7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMoZW52ZWxvcGUsIHgsIHksIHopKSB7XG4gICAgICAgIG91dC5wdXNoKHsgY2h1bms6IGtleSwgaW5kZXgsIHgsIHksIHosIG1hdGVyaWFsIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBvdXQuc29ydCgoYSwgYikgPT4gYS5jaHVuay5sb2NhbGVDb21wYXJlKGIuY2h1bmspIHx8IGEuaW5kZXggLSBiLmluZGV4KTtcbiAgcmV0dXJuIG91dDtcbn1cblxuLyoqIE5ldyBjaHVua3MgZ2VuZXJhdGVkIHNpbmNlIHRoZSBiYXNlbGluZSB0aGF0IGRvIG5vdCBvdmVybGFwIHRoZSBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBuZXdDaHVua3NPdXRzaWRlRW52ZWxvcGUoXG4gIHdvcmxkOiBXb3JsZCwgYmFzZWxpbmVLZXlzOiBJdGVyYWJsZTxzdHJpbmc+LCBlbnZlbG9wZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSxcbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgYmFzZWxpbmUgPSBuZXcgU2V0KGJhc2VsaW5lS2V5cyk7XG4gIGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBjaHVua10gb2Ygd29ybGQuY2h1bmtzKSB7XG4gICAgaWYgKGJhc2VsaW5lLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBvdmVybGFwcyA9IGVudmVsb3BlLnNvbWUoXG4gICAgICAocikgPT4gb3ggPD0gci54MSAmJiBveCArIENIVU5LX1NJWkUgLSAxID49IHIueDAgJiYgb3ogPD0gci56MSAmJiBveiArIENIVU5LX1NJWkUgLSAxID49IHIuejAsXG4gICAgKTtcbiAgICBpZiAoIW92ZXJsYXBzKSBvdXQucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiBvdXQuc29ydCgpO1xufVxuXG4vKiogQWxsIGNodW5rIGtleXMgY3VycmVudGx5IG1hdGVyaWFsaXNlZCwgc29ydGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNodW5rS2V5cyh3b3JsZDogV29ybGQpOiBzdHJpbmdbXSB7XG4gIHJldHVybiBbLi4ud29ybGQuY2h1bmtzLmtleXMoKV0uc29ydCgpO1xufVxuXG4vKiogQm91bmRpbmcgdm94ZWwgcmVnaW9uIGNvdmVyaW5nIGV2ZXJ5IG1hdGVyaWFsaXNlZCBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZENodW5rUmVnaW9uKHdvcmxkOiBXb3JsZCk6IFZveGVsUmVnaW9uIHtcbiAgaWYgKHdvcmxkLmNodW5rcy5zaXplID09PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ3dvcmxkIGhhcyBubyBjaHVua3MnKTtcbiAgbGV0IG1pbkN4ID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhDeCA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgbGV0IG1pbkN6ID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhDeiA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCBjaHVuayBvZiB3b3JsZC5jaHVua3MudmFsdWVzKCkpIHtcbiAgICBtaW5DeCA9IE1hdGgubWluKG1pbkN4LCBjaHVuay5jeCk7IG1heEN4ID0gTWF0aC5tYXgobWF4Q3gsIGNodW5rLmN4KTtcbiAgICBtaW5DeiA9IE1hdGgubWluKG1pbkN6LCBjaHVuay5jeik7IG1heEN6ID0gTWF0aC5tYXgobWF4Q3osIGNodW5rLmN6KTtcbiAgfVxuICByZXR1cm4ge1xuICAgIHgwOiBjaHVua09yaWdpblgobWluQ3gpLFxuICAgIHowOiBjaHVua09yaWdpbloobWluQ3opLFxuICAgIHgxOiBjaHVua09yaWdpblgobWF4Q3gpICsgQ0hVTktfU0laRSAtIDEsXG4gICAgejE6IGNodW5rT3JpZ2luWihtYXhDeikgKyBDSFVOS19TSVpFIC0gMSxcbiAgICB5MDogWV9NSU4sXG4gICAgeTE6IFlfTUFYIC0gMSxcbiAgfTtcbn1cbiIsICIvLyBNMDAyIGRldGVybWluaXN0aWMgZml4dHVyZSBhbmQgbGl2ZS13b3JsZCBsYXlvdXQuXG4vL1xuLy8gVGhlIGZpeHR1cmUgaXMgYSBib3VuZGVkIHNsaWNlIG9mIHRoZSByZWFsIDIwNDggbSB3b3JsZCAoc2VlZCAxMzM3KSwgbm90IGFcbi8vIHN5bnRoZXRpYyBoZWlnaHRmaWVsZC4gSXQgY29udGFpbnM6XG4vLyAgICogYSByZWplY3RlZCBob3VzZSBzaXRlIG9uIGEgNyBtIHJpdmVyLWJhbmsgc2xvcGU7XG4vLyAgICogYSB2aWFibGUgaG91c2Ugc2hlbGYgMjAgbSBhd2F5IHdpdGggMiBtIHJlbGllZiBhbmQgbm8gY2xlYXJpbmcgbmVlZGVkO1xuLy8gICAqIGEgMyBtIGZhcm0gc2xvcGUgMjcgbSBmcm9tIHRoZSBob3VzZSB3aXRoIGEgbmF0dXJhbCBibG9zc29tIHRyZWUgYW5kIG9yZS5cbi8vXG4vLyBUaGUgc2FtZSBjb29yZGluYXRlcywgcXVlcmllcyBhbmQgdmFsaWRhdG9ycyBhcmUgdXNlZCBieSB0aGUgbGl2ZS13b3JsZFxuLy8gYWNjZXB0YW5jZSB0ZXN0LiBUaGUgb25seSBkaWZmZXJlbmNlIGlzIGhvdyBtYW55IGNodW5rcyBhcmUgbWF0ZXJpYWxpc2VkLlxuaW1wb3J0IHtcbiAgV29ybGQsIGNyZWF0ZVdvcmxkLCBnZW5lcmF0ZVdvcmxkLCBnZW5lcmF0ZUNodW5rLCBwbGFjZUF1dGhvcmVkU2l0ZXMsXG4gIFlfTUlOLCBZX01BWCwgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgUmVjdCwgVm94ZWxSZWdpb24gfSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHsgY2h1bmtLZXlzIH0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTTAwMl9TRUVEID0gMTMzNztcblxuLyoqIFBpbm5lZCBwYXRoIHNpdGUgaWQgZm9yIHRoZSBkb29yLXRvLWFwcHJvYWNoIGNvcnJpZG9yLiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfUEFUSF9TSVRFX0lEID0gJ3BhdGgtaG91c2UtZmFybSc7XG5cbi8qKlxuICogUGlubmVkIHN0ZXBwZWQgcHJvZmlsZSBmb3IgdGhlIDkgbSBwYXRoIGZyb20gdGhlIGhvdXNlIGRvb3IgKHggPSAtNTMpIHRvIHRoZVxuICogYXBwcm9hY2ggKHggPSAtNDUpLiBUaGUgcmlzZSBpcyAyIG0gb3ZlciA4IG07IGV2ZXJ5IHN0ZXAgaXMgYXQgbW9zdCAxIG0uXG4gKi9cbmV4cG9ydCBjb25zdCBNMDAyX1BBVEhfUFJPRklMRSA9IFsxMSwgMTEsIDExLCAxMiwgMTIsIDEyLCAxMiwgMTMsIDEzXSBhcyBjb25zdDtcblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWNlQmFuZFNwZWMge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbi8qKiBQaW5uZWQgZmFybSB0ZXJyYWNlcywgaGlnaCBzaWRlIGZpcnN0LiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfVEVSUkFDRV9CQU5EUzogcmVhZG9ubHkgVGVycmFjZUJhbmRTcGVjW10gPSBbXG4gIHsgejA6IC00MiwgejE6IC00MCwgeTogMTYgfSxcbiAgeyB6MDogLTM5LCB6MTogLTM3LCB5OiAxNSB9LFxuICB7IHowOiAtMzYsIHoxOiAtMzUsIHk6IDE0IH0sXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVTcGVjIHtcbiAgaWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIGRvb3I6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGYXJtU3BlYyB7XG4gIGlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIHRlcnJhY2VzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMkxheW91dCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcmVqZWN0ZWQ6IFNpdGVTcGVjO1xuICBob3VzZTogU2l0ZVNwZWM7XG4gIGZhcm06IEZhcm1TcGVjO1xuICBzZWFyY2hBcmVhOiBSZWN0O1xuICB3b3JrWm9uZTogUmVjdDtcbiAgZml4dHVyZUNodW5rczogeyBjeDA6IG51bWJlcjsgY3owOiBudW1iZXI7IGN4MTogbnVtYmVyOyBjejE6IG51bWJlciB9O1xuICBwcm90ZWN0ZWRSZWdpb246IFZveGVsUmVnaW9uO1xuICAvKiogQ29tcGxldGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlIGZvciB0aGUgZmlyc3Qgc2xpY2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xufVxuXG5jb25zdCBGSVhUVVJFX0NIVU5LUyA9IHsgY3gwOiAyOCwgY3owOiAyOSwgY3gxOiAzMiwgY3oxOiAzMiB9IGFzIGNvbnN0O1xuXG5leHBvcnQgY29uc3QgTTAwMl9MQVlPVVQ6IE0wMDJMYXlvdXQgPSB7XG4gIHNlZWQ6IE0wMDJfU0VFRCxcbiAgcmVqZWN0ZWQ6IHtcbiAgICBpZDogJ3NpdGUtYS1yZWplY3RlZCcsXG4gICAgcmVjdDogeyB4MDogLTc0LCB6MDogLTY2LCB4MTogLTY3LCB6MTogLTYxIH0sXG4gICAgLy8gQSBuYWl2ZSBsb3ctc2lkZSBmbG9vcjogdGhlIHVwaGlsbCBjb3JuZXIgd291bGQgbmVlZCA1IG0gb2YgZXhjYXZhdGlvbi5cbiAgICBmbG9vclk6IDMsXG4gICAgZG9vcjogeyB4OiAtNjcsIHo6IC02MyB9LFxuICAgIGFwcHJvYWNoOiB7IHg6IC02MCwgejogLTYzIH0sXG4gIH0sXG4gIGhvdXNlOiB7XG4gICAgaWQ6ICdzaXRlLWItaG91c2UnLFxuICAgIHJlY3Q6IHsgeDA6IC02MCwgejA6IC00NiwgeDE6IC01MywgejE6IC00MSB9LFxuICAgIGZsb29yWTogMTEsXG4gICAgZG9vcjogeyB4OiAtNTMsIHo6IC00MyB9LFxuICAgIGFwcHJvYWNoOiB7IHg6IC00NSwgejogLTQzIH0sXG4gIH0sXG4gIGZhcm06IHtcbiAgICBpZDogJ2ZpZWxkLWMnLFxuICAgIHJlY3Q6IHsgeDA6IC0zOCwgejA6IC00MiwgeDE6IC0yNywgejE6IC0zNSB9LFxuICAgIHRlcnJhY2VzOiAzLFxuICB9LFxuICBzZWFyY2hBcmVhOiB7IHgwOiAtNzYsIHowOiAtNjgsIHgxOiAtNDAsIHoxOiAtNDAgfSxcbiAgd29ya1pvbmU6IHsgeDA6IC03NiwgejA6IC02OCwgeDE6IC0yMywgejE6IC0zMSB9LFxuICBmaXh0dXJlQ2h1bmtzOiBGSVhUVVJFX0NIVU5LUyxcbiAgcHJvdGVjdGVkUmVnaW9uOiB7XG4gICAgeDA6IGNodW5rT3JpZ2luWChGSVhUVVJFX0NIVU5LUy5jeDApLFxuICAgIHowOiBjaHVua09yaWdpblooRklYVFVSRV9DSFVOS1MuY3owKSxcbiAgICB4MTogY2h1bmtPcmlnaW5YKEZJWFRVUkVfQ0hVTktTLmN4MSkgKyAzMSxcbiAgICB6MTogY2h1bmtPcmlnaW5aKEZJWFRVUkVfQ0hVTktTLmN6MSkgKyAzMSxcbiAgICB5MDogWV9NSU4sXG4gICAgeTE6IFlfTUFYIC0gMSxcbiAgfSxcbiAgZW52ZWxvcGU6IFtcbiAgICAvLyBIb3VzZSBmb290cHJpbnQgcGx1cyBhIDIgbSBwcmVwYXJhdGlvbiBidWZmZXIuXG4gICAgeyB4MDogLTYyLCB6MDogLTQ4LCB4MTogLTUxLCB6MTogLTM5LCB5MDogOCwgeTE6IDE2IH0sXG4gICAgLy8gRG9vci10by1hcHByb2FjaCBwYXRoIGNvcnJpZG9yIHBsdXMgYSAxIG0gYnVmZmVyLlxuICAgIHsgeDA6IC01NCwgejA6IC00NCwgeDE6IC00NCwgejE6IC00MiwgeTA6IDksIHkxOiAxNSB9LFxuICAgIC8vIEZhcm0gZm9vdHByaW50IHBsdXMgYSAyIG0gcHJlcGFyYXRpb24gYnVmZmVyLlxuICAgIHsgeDA6IC00MCwgejA6IC00NCwgeDE6IC0yNSwgejE6IC0zMywgeTA6IDEwLCB5MTogMjAgfSxcbiAgXSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMldvcmxkIHtcbiAgd29ybGQ6IFdvcmxkO1xuICBsYXlvdXQ6IE0wMDJMYXlvdXQ7XG4gIC8qKiBTb3J0ZWQgY2h1bmsga2V5cyBtYXRlcmlhbGlzZWQgYXQgZml4dHVyZSBjcmVhdGlvbi4gKi9cbiAgY2h1bmtLZXlzOiBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBTbWFsbCBkZXRlcm1pbmlzdGljIGZpeHR1cmU6IHRoZSAyMCBjaHVua3MgY292ZXJpbmcgdGhlIHdvcmsgem9uZSBhbmQgaXRzXG4gKiBwcm90ZWN0ZWQgc3Vycm91bmRpbmdzLiBGYXN0IGVub3VnaCBmb3IgdGhlIGZ1bGwgdGVzdCBzdWl0ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU0wMDJGaXh0dXJlKHNlZWQgPSBNMDAyX1NFRUQpOiBNMDAyV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQpO1xuICBjb25zdCB7IGN4MCwgY3owLCBjeDEsIGN6MSB9ID0gTTAwMl9MQVlPVVQuZml4dHVyZUNodW5rcztcbiAgZm9yIChsZXQgY3ogPSBjejA7IGN6IDw9IGN6MTsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY3gwOyBjeCA8PSBjeDE7IGN4KyspIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIH1cbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgcmV0dXJuIHsgd29ybGQsIGxheW91dDogTTAwMl9MQVlPVVQsIGNodW5rS2V5czogY2h1bmtLZXlzKHdvcmxkKSB9O1xufVxuXG4vKipcbiAqIExpdmUtd29ybGQgaW50ZWdyYXRpb24gdGFyZ2V0OiB0aGUgc2FtZSBzZWVkIGFuZCBzaXRlcyB3aXRoIGEgOSB4IDkgY2h1bmtcbiAqIG5laWdoYm91cmhvb2QgKDgxIGNodW5rcykgYXJvdW5kIHRoZSBmb3VuZGVyIHZhbGxleS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU0wMDJMaXZlKHNlZWQgPSBNMDAyX1NFRUQsIHJhZGl1cyA9IDQpOiBNMDAyV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoc2VlZCwgcmFkaXVzKTtcbiAgcmV0dXJuIHsgd29ybGQsIGxheW91dDogTTAwMl9MQVlPVVQsIGNodW5rS2V5czogY2h1bmtLZXlzKHdvcmxkKSB9O1xufVxuIiwgIi8vIE0wMDIgc3RhZ2UgNyBzY2VuYXJpbyB3aXJpbmc6IHRoZSBwaW5uZWQgZmlyc3Qgc2xpY2UsIHJ1biB0aHJvdWdoIHRoZSBzYW1lXG4vLyBwdWJsaWMgc2ltdWxhdGlvbiBwaXBlbGluZSB1c2VkIGJ5IHRoZSBwbGF5ZXIsIHRoZSBBSSBhbmQgdGhlIHRlc3RzLlxuLy9cbi8vIFRoZSBzY2VuYXJpbyBpcyBkZWxpYmVyYXRlbHkgcGxhaW4gZGF0YSBpbiAvIGRhdGEgb3V0LiBJdCBkb2VzIG5vdCB0b3VjaCB0aGVcbi8vIHJlbmRlcmVyLCBhbmQgZXZlcnkgdGVycmFpbiBlZGl0IHN0aWxsIGdvZXMgdGhyb3VnaCBwcmVwYXJlU2l0ZSAtPlxuLy8gTG9jYWxBdXRob3JpemVyIC0+IGV4ZWN1dGVQcmVwYXJhdGlvbi4gU3RydWN0dXJlcyBzdGlsbCBnbyB0aHJvdWdoXG4vLyBidWlsZFN0cnVjdHVyZSAtPiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIgLT4gZXhlY3V0ZVN0cnVjdHVyZS5cbmltcG9ydCB7IE1BVCwgUmVzb3VyY2VUeXBlIH0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBNMDAyV29ybGQsIE0wMDJfTEFZT1VULCBNMDAyX1BBVEhfUFJPRklMRSwgTTAwMl9QQVRIX1NJVEVfSUQsXG4gIE0wMDJfVEVSUkFDRV9CQU5EUyxcbn0gZnJvbSAnLi9tMDAyJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHsgSE9VU0VfUlVMRVMsIFBBVEhfUlVMRVMsIEZBUk1fUlVMRVMgfSBmcm9tICcuL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBDb2x1bW5UYXJnZXQsIExvY2FsQXV0aG9yaXplciwgcHJlcGFyZVNpdGUsIFByZXBhcmF0aW9uTGVkZ2VyLFxufSBmcm9tICcuL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7XG4gIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgYnVpbGRTdHJ1Y3R1cmUsIFN0cnVjdHVyZUxlZGdlcixcbn0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7XG4gIGNhbm9uaWNhbEVudGl0eUhhc2gsIGNhbm9uaWNhbEludmVudG9yeUhhc2gsIGNhbm9uaWNhbFJlZ2lvbkhhc2gsXG4gIGNhbm9uaWNhbFN0cnVjdHVyZUhhc2gsIGludmVudG9yeVNuYXBzaG90LFxufSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBNMDAyX1NUQVJURVJfSU5WRU5UT1JZOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBudW1iZXI+PiA9IHtcbiAgd29vZDogMjQsXG4gIHN0b25lOiA0OCxcbn07XG5cbi8qKiBUaGUgOSB4IDMgbSBjb3JyaWRvciBmcm9tIHRoZSBob3VzZSBkb29yIHRvIHRoZSBhcHByb2FjaC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyUGF0aFJlY3QoKTogUmVjdCB7XG4gIGNvbnN0IGRvb3IgPSBNMDAyX0xBWU9VVC5ob3VzZS5kb29yO1xuICBjb25zdCBhcHByb2FjaCA9IE0wMDJfTEFZT1VULmhvdXNlLmFwcHJvYWNoO1xuICByZXR1cm4ge1xuICAgIHgwOiBkb29yLngsXG4gICAgejA6IGRvb3IueiAtIDEsXG4gICAgeDE6IGFwcHJvYWNoLngsXG4gICAgejE6IGRvb3IueiArIDEsXG4gIH07XG59XG5cbi8qKiBPbmUgdGFyZ2V0IHBlciBwYXRoIGNvbHVtbiwgdXNpbmcgdGhlIHBpbm5lZCBzdGVwcGVkIHByb2ZpbGUuICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMlBhdGhUYXJnZXRzKCk6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3QgcmVjdCA9IG0wMDJQYXRoUmVjdCgpO1xuICBjb25zdCB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IE0wMDJfUEFUSF9QUk9GSUxFLmxlbmd0aDsgaSsrKSB7XG4gICAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgICB0YXJnZXRzLnB1c2goeyB4OiByZWN0LngwICsgaSwgeiwgeTogTTAwMl9QQVRIX1BST0ZJTEVbaV0gfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiB0YXJnZXRzO1xufVxuXG4vKiogT25lIHRhcmdldCBwZXIgZmFybSBjb2x1bW4sIHVzaW5nIHRoZSBwaW5uZWQgdGVycmFjZSBiYW5kcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyRmFybVRhcmdldHMoKTogQ29sdW1uVGFyZ2V0W10ge1xuICBjb25zdCByZWN0ID0gTTAwMl9MQVlPVVQuZmFybS5yZWN0O1xuICBjb25zdCB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGJhbmQgb2YgTTAwMl9URVJSQUNFX0JBTkRTKSB7XG4gICAgZm9yIChsZXQgeiA9IGJhbmQuejA7IHogPD0gYmFuZC56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICAgICAgdGFyZ2V0cy5wdXNoKHsgeCwgeiwgeTogYmFuZC55IH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gdGFyZ2V0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyU2NlbmFyaW9PcHRpb25zIHtcbiAgLyoqIFN0YXJ0ZXIgcmVzb3VyY2VzIGJlZm9yZSB0aGUgc2xpY2UgcnVucy4gRGVmYXVsdHMgdG8gd29vZCAyNCAvIHN0b25lIDQ4LiAqL1xuICBpbnZlbnRvcnk/OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJTY2VuYXJpb1NpdGUge1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25MZWRnZXIgfCBudWxsO1xuICBzdHJ1Y3R1cmU6IFN0cnVjdHVyZUxlZGdlciB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMlNjZW5hcmlvUmVzdWx0IHtcbiAgb2s6IGJvb2xlYW47XG4gIGVycm9yczogc3RyaW5nW107XG4gIGhvdXNlOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBwYXRoOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBmYXJtOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBoYXNoZXM6IHtcbiAgICB2b3hlbHM6IHN0cmluZztcbiAgICBzdHJ1Y3R1cmVzOiBzdHJpbmc7XG4gICAgaW52ZW50b3J5OiBzdHJpbmc7XG4gICAgZW50aXRpZXM6IHN0cmluZztcbiAgfTtcbn1cblxuZnVuY3Rpb24gZW1wdHlTaXRlKCk6IE0wMDJTY2VuYXJpb1NpdGUge1xuICByZXR1cm4geyBwcmVwYXJhdGlvbjogbnVsbCwgc3RydWN0dXJlOiBudWxsIH07XG59XG5cbmZ1bmN0aW9uIGRlc2NyaWJlRmFpbHVyZShyZXN1bHQ6IHsgY29kZTogc3RyaW5nOyByZWFzb25zOiBzdHJpbmdbXSB9KTogc3RyaW5nIHtcbiAgcmV0dXJuIGAke3Jlc3VsdC5jb2RlfTogJHtyZXN1bHQucmVhc29ucy5qb2luKCc7ICcpfWA7XG59XG5cbi8qKlxuICogUnVuIGhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlZCBmYXJtIGluIHRoZWlyIHBpbm5lZCBvcmRlci4gQSBmYWlsZWQgc3RlcCBpc1xuICogcmVjb3JkZWQgYW5kIGxhdGVyIGluZGVwZW5kZW50IHN0ZXBzIHN0aWxsIHJ1bjsgYSBzdHJ1Y3R1cmUgaXMgbmV2ZXIgYnVpbHRcbiAqIHVubGVzcyBpdHMgb3duIHRlcnJhaW4gcHJlcGFyYXRpb24gc3VjY2VlZGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcnVuTTAwMlNjZW5hcmlvKFxuICBtMDAyOiBNMDAyV29ybGQsIG9wdGlvbnM6IE0wMDJTY2VuYXJpb09wdGlvbnMgPSB7fSxcbik6IE0wMDJTY2VuYXJpb1Jlc3VsdCB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gbTAwMjtcbiAgY29uc3Qgc3RhcnRlciA9IG9wdGlvbnMuaW52ZW50b3J5ID8/IE0wMDJfU1RBUlRFUl9JTlZFTlRPUlk7XG4gIHdvcmxkLmludmVudG9yeSA9IHt9O1xuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhzdGFydGVyKSkge1xuICAgIGlmICgoYW1vdW50ID8/IDApID4gMCkgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA9IGFtb3VudCBhcyBudW1iZXI7XG4gIH1cblxuICBjb25zdCBwcmVwQXV0aG9yaXplciA9IG5ldyBMb2NhbEF1dGhvcml6ZXIoeyBlbnZlbG9wZTogbGF5b3V0LmVudmVsb3BlIH0pO1xuICBjb25zdCBzdHJ1Y3R1cmVBdXRob3JpemVyID0gbmV3IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcih7IGVudmVsb3BlOiBsYXlvdXQuZW52ZWxvcGUgfSk7XG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBob3VzZSA9IGVtcHR5U2l0ZSgpO1xuICBjb25zdCBwYXRoID0gZW1wdHlTaXRlKCk7XG4gIGNvbnN0IGZhcm0gPSBlbXB0eVNpdGUoKTtcblxuICBjb25zdCBob3VzZVByZXAgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IGxheW91dC5ob3VzZS5pZCxcbiAgICByZWN0OiBsYXlvdXQuaG91c2UucmVjdCxcbiAgICBmbG9vclk6IGxheW91dC5ob3VzZS5mbG9vclksXG4gICAgcnVsZXM6IEhPVVNFX1JVTEVTLFxuICB9KTtcbiAgaWYgKCFob3VzZVByZXAub2spIHtcbiAgICBlcnJvcnMucHVzaChgaG91c2UgcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKGhvdXNlUHJlcCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgaG91c2UucHJlcGFyYXRpb24gPSBob3VzZVByZXAubGVkZ2VyO1xuICAgIGNvbnN0IGhvdXNlQnVpbGQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwge1xuICAgICAgc2l0ZUlkOiBsYXlvdXQuaG91c2UuaWQsXG4gICAgICBraW5kOiAnaG91c2UnLFxuICAgICAgcmVjdDogbGF5b3V0LmhvdXNlLnJlY3QsXG4gICAgICBmbG9vclk6IGxheW91dC5ob3VzZS5mbG9vclksXG4gICAgICBkb29yOiBsYXlvdXQuaG91c2UuZG9vcixcbiAgICB9KTtcbiAgICBpZiAoIWhvdXNlQnVpbGQub2spIHtcbiAgICAgIGVycm9ycy5wdXNoKGBob3VzZSBzdHJ1Y3R1cmU6ICR7ZGVzY3JpYmVGYWlsdXJlKGhvdXNlQnVpbGQpfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBob3VzZS5zdHJ1Y3R1cmUgPSBob3VzZUJ1aWxkLmxlZGdlcjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBwYXRoUmVjdCA9IG0wMDJQYXRoUmVjdCgpO1xuICBjb25zdCBwYXRoUHJlcCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwge1xuICAgIHNpdGVJZDogTTAwMl9QQVRIX1NJVEVfSUQsXG4gICAgcmVjdDogcGF0aFJlY3QsXG4gICAgZmxvb3JZOiAxMixcbiAgICBydWxlczogUEFUSF9SVUxFUyxcbiAgfSwge1xuICAgIHRhcmdldHM6IG0wMDJQYXRoVGFyZ2V0cygpLFxuICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULkdSQVZFTCxcbiAgICBlbnZlbG9wZTogW2xheW91dC5lbnZlbG9wZVsxXV0sXG4gIH0pO1xuICBpZiAoIXBhdGhQcmVwLm9rKSB7XG4gICAgZXJyb3JzLnB1c2goYHBhdGggcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKHBhdGhQcmVwKX1gKTtcbiAgfSBlbHNlIHtcbiAgICBwYXRoLnByZXBhcmF0aW9uID0gcGF0aFByZXAubGVkZ2VyO1xuICAgIGNvbnN0IHBhdGhCdWlsZCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCB7XG4gICAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgICAga2luZDogJ3BhdGgnLFxuICAgICAgcmVjdDogcGF0aFJlY3QsXG4gICAgICBmbG9vclk6IDEyLFxuICAgIH0pO1xuICAgIGlmICghcGF0aEJ1aWxkLm9rKSB7XG4gICAgICBlcnJvcnMucHVzaChgcGF0aCBzdHJ1Y3R1cmU6ICR7ZGVzY3JpYmVGYWlsdXJlKHBhdGhCdWlsZCl9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhdGguc3RydWN0dXJlID0gcGF0aEJ1aWxkLmxlZGdlcjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBmYXJtUHJlcCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwge1xuICAgIHNpdGVJZDogbGF5b3V0LmZhcm0uaWQsXG4gICAgcmVjdDogbGF5b3V0LmZhcm0ucmVjdCxcbiAgICBmbG9vclk6IDE1LFxuICAgIHJ1bGVzOiBGQVJNX1JVTEVTLFxuICB9LCB7XG4gICAgdGFyZ2V0czogbTAwMkZhcm1UYXJnZXRzKCksXG4gICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuU09JTCxcbiAgICBlbnZlbG9wZTogW2xheW91dC5lbnZlbG9wZVsyXV0sXG4gIH0pO1xuICBpZiAoIWZhcm1QcmVwLm9rKSB7XG4gICAgZXJyb3JzLnB1c2goYGZhcm0gcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKGZhcm1QcmVwKX1gKTtcbiAgfSBlbHNlIHtcbiAgICBmYXJtLnByZXBhcmF0aW9uID0gZmFybVByZXAubGVkZ2VyO1xuICAgIGNvbnN0IGZhcm1CdWlsZCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCB7XG4gICAgICBzaXRlSWQ6IGxheW91dC5mYXJtLmlkLFxuICAgICAga2luZDogJ3RlcnJhY2UnLFxuICAgICAgcmVjdDogbGF5b3V0LmZhcm0ucmVjdCxcbiAgICAgIGZsb29yWTogMTUsXG4gICAgICB0ZXJyYWNlczogbGF5b3V0LmZhcm0udGVycmFjZXMsXG4gICAgfSk7XG4gICAgaWYgKCFmYXJtQnVpbGQub2spIHtcbiAgICAgIGVycm9ycy5wdXNoKGBmYXJtIHN0cnVjdHVyZTogJHtkZXNjcmliZUZhaWx1cmUoZmFybUJ1aWxkKX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmFybS5zdHJ1Y3R1cmUgPSBmYXJtQnVpbGQubGVkZ2VyO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgb2s6IGVycm9ycy5sZW5ndGggPT09IDAsXG4gICAgZXJyb3JzLFxuICAgIGhvdXNlLFxuICAgIHBhdGgsXG4gICAgZmFybSxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICBoYXNoZXM6IHtcbiAgICAgIHZveGVsczogY2Fub25pY2FsUmVnaW9uSGFzaCh3b3JsZCwgbGF5b3V0LnByb3RlY3RlZFJlZ2lvbikuaGFzaCxcbiAgICAgIHN0cnVjdHVyZXM6IGNhbm9uaWNhbFN0cnVjdHVyZUhhc2god29ybGQpLFxuICAgICAgaW52ZW50b3J5OiBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKHdvcmxkKSxcbiAgICAgIGVudGl0aWVzOiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkLCBsYXlvdXQucHJvdGVjdGVkUmVnaW9uKSxcbiAgICB9LFxuICB9O1xufVxuXG4vKiogVG90YWwgcmVzb3VyY2VzIHBhaWQgdG8gc3RydWN0dXJlcyBpbiBhIHNjZW5hcmlvIHJlc3VsdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyU3RydWN0dXJlQ29zdHMocmVzdWx0OiBNMDAyU2NlbmFyaW9SZXN1bHQpOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+IHtcbiAgY29uc3QgdG90YWw6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7fTtcbiAgZm9yIChjb25zdCBzaXRlIG9mIFtyZXN1bHQuaG91c2UsIHJlc3VsdC5wYXRoLCByZXN1bHQuZmFybV0pIHtcbiAgICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhzaXRlLnN0cnVjdHVyZT8uY29zdFBhaWQgPz8ge30pKSB7XG4gICAgICB0b3RhbFtyZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGVdID0gKHRvdGFsW3Jlc291cmNlIGFzIFJlc291cmNlVHlwZV0gPz8gMCkgKyAoYW1vdW50ID8/IDApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdG90YWw7XG59XG4iLCAiLy8gU2NoZW1hLTMgbGlmZSBsb29wLiBBbGwgcXVhbnRpdGllcyBhcmUgaW50ZWdlcnMgYW5kIGFsbCBtdXRhdGlvbnMgYXJlIGRyaXZlblxuLy8gYnkgYWNjZXB0ZWQgY29tbWFuZHM7IHdhbGwtY2xvY2sgdGltZSBhbmQgcmVuZGVyaW5nIG5ldmVyIGFkdmFuY2UgdGhpcyBzdGF0ZS5cbmltcG9ydCB0eXBlIHsgV29ybGQgfSBmcm9tICcuL3dvcmxkJztcblxuZXhwb3J0IGNvbnN0IExJRkVfUkVTT1VSQ0VTID0gWydmaWJlcicsICdmb29kJywgJ29yZScsICdyYXRpb25zJywgJ3NlZWQnLCAnc3RvbmUnLCAnd29vZCddIGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgTGlmZVJlc291cmNlID0gKHR5cGVvZiBMSUZFX1JFU09VUkNFUylbbnVtYmVyXTtcbmV4cG9ydCBjb25zdCBDQVJSSUVEX0NBUEFDSVRZID0gMTIwO1xuZXhwb3J0IGNvbnN0IFNUT0NLUElMRV9DQVBBQ0lUWSA9IDIwMDtcbmV4cG9ydCBjb25zdCBNQVhfUFJPRFVDVElPTl9KT0JTID0gMTY7XG5leHBvcnQgY29uc3QgTUFYX1RJQ0tTX1BFUl9DT01NQU5EID0gNjQ7XG5leHBvcnQgY29uc3QgQ1JPUF9HUk9XVEhfVElDS1MgPSA0O1xuLyoqIEZpeGVkIGhhcnZlc3QgZnJvbSBvbmUgcmVhZHkgY3JvcCBwbG90LiBKb3VybmFsIG91dGNvbWVzIG11c3QgbWF0Y2ggaXQgZXhhY3RseS4gKi9cbmV4cG9ydCBjb25zdCBDUk9QX1lJRUxEID0geyBmb29kOiA2LCBmaWJlcjogMSB9IGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IENST1BfWUlFTERfTEFCRUwgPSBgJHtDUk9QX1lJRUxELmZvb2R9IGZvb2QgKyAke0NST1BfWUlFTEQuZmliZXJ9IGZpYmVyYDtcbmV4cG9ydCBjb25zdCBGT1VOREVSX1NUT0NLUElMRV9JRCA9ICdzdG9ja3BpbGU6Zm91bmRlcic7XG5leHBvcnQgY29uc3QgRk9VTkRFUl9TVE9DS1BJTEUgPSB7IGlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCwgeDogLTUwLCB6OiAtMzIsIGNhcGFjaXR5OiBTVE9DS1BJTEVfQ0FQQUNJVFkgfSBhcyBjb25zdDtcblxuZXhwb3J0IHR5cGUgTGlmZVJlc291cmNlQmFnID0gUGFydGlhbDxSZWNvcmQ8TGlmZVJlc291cmNlLCBudW1iZXI+PjtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9ja3BpbGUge1xuICBpZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgY2FwYWNpdHk6IHR5cGVvZiBTVE9DS1BJTEVfQ0FQQUNJVFk7XG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbn1cblxuZXhwb3J0IHR5cGUgUmVjaXBlSWQgPSAnc2VlZCcgfCAncmF0aW9ucyc7XG5leHBvcnQgY29uc3QgUkVDSVBFUzogUmVjb3JkPFJlY2lwZUlkLCB7IGlucHV0OiBMaWZlUmVzb3VyY2VCYWc7IG91dHB1dDogTGlmZVJlc291cmNlQmFnOyB0aWNrczogbnVtYmVyIH0+ID0ge1xuICBzZWVkOiB7IGlucHV0OiB7IGZpYmVyOiAyIH0sIG91dHB1dDogeyBzZWVkOiAzIH0sIHRpY2tzOiAxIH0sXG4gIHJhdGlvbnM6IHsgaW5wdXQ6IHsgZm9vZDogMiB9LCBvdXRwdXQ6IHsgcmF0aW9uczogMyB9LCB0aWNrczogMiB9LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBQcm9kdWN0aW9uSm9iIHtcbiAgaWQ6IHN0cmluZztcbiAgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVjaXBlOiBSZWNpcGVJZDtcbiAgcmVtYWluaW5nVGlja3M6IG51bWJlcjtcbn1cblxuLyoqIEZpeGVkIHBsb3RzIGNvcnJlc3BvbmQgdG8gdGhlIG5pbmUgYXV0aG9yaXRhdGl2ZSB0ZXJyYWNlIGNyb3Atcm93IHZvbHVtZXMuICovXG5leHBvcnQgY29uc3QgQ1JPUF9QTE9UX0lEUyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDkgfSwgKF8sIGkpID0+IGBjcm9wOiR7aX1gKTtcbmV4cG9ydCBpbnRlcmZhY2UgQ3JvcFBsb3Qge1xuICBpZDogc3RyaW5nO1xuICBwbGFudGVkVGljazogbnVtYmVyO1xuICBncm93dGhUaWNrczogdHlwZW9mIENST1BfR1JPV1RIX1RJQ0tTO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExpZmVTdGF0ZSB7XG4gIHN0b2NrcGlsZXM6IE1hcDxzdHJpbmcsIFN0b2NrcGlsZT47XG4gIGpvYnM6IE1hcDxzdHJpbmcsIFByb2R1Y3Rpb25Kb2I+O1xuICBjcm9wczogTWFwPHN0cmluZywgQ3JvcFBsb3Q+O1xuICB0aWNrOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVMaWZlU3RhdGUoKTogTGlmZVN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBzdG9ja3BpbGVzOiBuZXcgTWFwKFtbRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHtcbiAgICAgIGlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCwgeDogRk9VTkRFUl9TVE9DS1BJTEUueCwgejogRk9VTkRFUl9TVE9DS1BJTEUueixcbiAgICAgIGNhcGFjaXR5OiBTVE9DS1BJTEVfQ0FQQUNJVFksIGludmVudG9yeToge30sXG4gICAgfV1dKSwgam9iczogbmV3IE1hcCgpLCBjcm9wczogbmV3IE1hcCgpLCB0aWNrOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG90YWwoYmFnOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KTogbnVtYmVyIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXMoYmFnKS5yZWR1Y2UoKHN1bSwgYW1vdW50KSA9PiBzdW0gKyBhbW91bnQsIDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVCYWcoYmFnOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIHJldHVybiBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMoYmFnKS5maWx0ZXIoKFssIGFtb3VudF0pID0+IGFtb3VudCA+IDApXG4gICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxpZmVTdGF0ZSh3b3JsZDogV29ybGQpOiBMaWZlU3RhdGUge1xuICBpZiAoIXdvcmxkLmxpZmUpIHRocm93IG5ldyBFcnJvcignbGlmZS1sb29wIGNvbW1hbmRzIHJlcXVpcmUgYSBzY2hlbWEtMyB3b3JsZCcpO1xuICByZXR1cm4gd29ybGQubGlmZTtcbn1cblxuZXhwb3J0IHR5cGUgTGlmZUZhaWx1cmUgPSB7IG9rOiBmYWxzZTsgY29kZTogc3RyaW5nOyByZWFzb25zOiBzdHJpbmdbXSB9O1xuZXhwb3J0IHR5cGUgTGlmZVN1Y2Nlc3M8VD4gPSB7IG9rOiB0cnVlOyB2YWx1ZTogVCB9O1xuZXhwb3J0IHR5cGUgTGlmZVJlc3VsdDxUPiA9IExpZmVTdWNjZXNzPFQ+IHwgTGlmZUZhaWx1cmU7XG5mdW5jdGlvbiByZWplY3RMaWZlKGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBMaWZlRmFpbHVyZSB7XG4gIHJldHVybiB7IG9rOiBmYWxzZSwgY29kZSwgcmVhc29ucyB9O1xufVxudHlwZSBQYXJzZWRBbW91bnQgPSB7IG9rOiB0cnVlOyByZXNvdXJjZTogTGlmZVJlc291cmNlOyBhbW91bnQ6IG51bWJlciB9IHwgeyBvazogZmFsc2U7IHJlYXNvbnM6IHN0cmluZ1tdIH07XG5mdW5jdGlvbiByZXF1aXJlQW1vdW50KGJhZzogTGlmZVJlc291cmNlQmFnKTogUGFyc2VkQW1vdW50IHtcbiAgY29uc3QgZW50cmllcyA9IE9iamVjdC5lbnRyaWVzKGJhZyk7XG4gIGlmIChlbnRyaWVzLmxlbmd0aCAhPT0gMSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb25zOiBbJ3RyYW5zZmVyIGV4YWN0bHkgb25lIHJlc291cmNlIGF0IGEgdGltZSddIH07XG4gIGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSA9IGVudHJpZXNbMF07XG4gIGlmICghTElGRV9SRVNPVVJDRVMuaW5jbHVkZXMocmVzb3VyY2UgYXMgTGlmZVJlc291cmNlKSB8fCAhTnVtYmVyLmlzU2FmZUludGVnZXIoYW1vdW50KSB8fCAoYW1vdW50ID8/IDApIDw9IDApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbnM6IFsncmVzb3VyY2UgYW1vdW50IG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyJ10gfTtcbiAgfVxuICByZXR1cm4geyBvazogdHJ1ZSwgcmVzb3VyY2U6IHJlc291cmNlIGFzIExpZmVSZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbmZ1bmN0aW9uIG1vdmUod29ybGQ6IFdvcmxkLCBmcm9tOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+LCB0bzogUmVjb3JkPHN0cmluZywgbnVtYmVyPixcbiAgcmVxdWVzdGVkOiBMaWZlUmVzb3VyY2VCYWcsIHRvQ2FwYWNpdHk6IG51bWJlcik6IExpZmVSZXN1bHQ8TGlmZVJlc291cmNlQmFnPiB7XG4gIGNvbnN0IGNoZWNrZWQgPSByZXF1aXJlQW1vdW50KHJlcXVlc3RlZCk7XG4gIGlmICghY2hlY2tlZC5vaykgcmV0dXJuIHJlamVjdExpZmUoJ2ludmFsaWRfdHJhbnNmZXInLCBbY2hlY2tlZC5yZWFzb25zWzBdXSk7XG4gIGNvbnN0IHsgcmVzb3VyY2UsIGFtb3VudCB9ID0gY2hlY2tlZDtcbiAgaWYgKChmcm9tW3Jlc291cmNlXSA/PyAwKSA8IGFtb3VudCkgcmV0dXJuIHJlamVjdExpZmUoJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnLCBbYG5lZWQgJHthbW91bnR9ICR7U3RyaW5nKHJlc291cmNlKX0sIGhhdmUgJHtmcm9tW3Jlc291cmNlXSA/PyAwfWBdKTtcbiAgaWYgKHRvdGFsKHRvKSArIGFtb3VudCA+IHRvQ2FwYWNpdHkpIHJldHVybiByZWplY3RMaWZlKCdjYXBhY2l0eV9leGNlZWRlZCcsIFtgZGVzdGluYXRpb24gY2FwYWNpdHkgJHt0b0NhcGFjaXR5fSB3b3VsZCBiZSBleGNlZWRlZGBdKTtcbiAgZnJvbVtyZXNvdXJjZV0gPSAoZnJvbVtyZXNvdXJjZV0gPz8gMCkgLSBhbW91bnQ7XG4gIGlmIChmcm9tW3Jlc291cmNlXSA9PT0gMCkgZGVsZXRlIGZyb21bcmVzb3VyY2VdO1xuICB0b1tyZXNvdXJjZV0gPSAodG9bcmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgW3Jlc291cmNlXTogYW1vdW50IH0gfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyYW5zZmVyKHdvcmxkOiBXb3JsZCwga2luZDogJ2RlcG9zaXQnIHwgJ3dpdGhkcmF3JywgYmFnOiBMaWZlUmVzb3VyY2VCYWcpOiBMaWZlUmVzdWx0PExpZmVSZXNvdXJjZUJhZz4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgY29uc3Qgc3RvY2sgPSBsaWZlLnN0b2NrcGlsZXMuZ2V0KEZPVU5ERVJfU1RPQ0tQSUxFX0lEKTtcbiAgaWYgKCFzdG9jaykgcmV0dXJuIHJlamVjdExpZmUoJ21pc3Npbmdfc3RvY2twaWxlJywgWydmb3VuZGVyIHN0b2NrcGlsZSBpcyBhYnNlbnQnXSk7XG4gIHJldHVybiBraW5kID09PSAnZGVwb3NpdCdcbiAgICA/IG1vdmUod29ybGQsIHdvcmxkLmludmVudG9yeSwgc3RvY2suaW52ZW50b3J5LCBiYWcsIHN0b2NrLmNhcGFjaXR5KVxuICAgIDogbW92ZSh3b3JsZCwgc3RvY2suaW52ZW50b3J5LCB3b3JsZC5pbnZlbnRvcnksIGJhZywgQ0FSUklFRF9DQVBBQ0lUWSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdGFydFByb2R1Y3Rpb24od29ybGQ6IFdvcmxkLCByZWNpcGVJZDogUmVjaXBlSWQsIGpvYklkOiBzdHJpbmcpOiBMaWZlUmVzdWx0PFByb2R1Y3Rpb25Kb2I+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChGT1VOREVSX1NUT0NLUElMRV9JRCk7XG4gIGlmICghc3RvY2spIHJldHVybiByZWplY3RMaWZlKCdtaXNzaW5nX3N0b2NrcGlsZScsIFsnZm91bmRlciBzdG9ja3BpbGUgaXMgYWJzZW50J10pO1xuICBpZiAobGlmZS5qb2JzLmhhcyhqb2JJZCkpIHJldHVybiByZWplY3RMaWZlKCdkdXBsaWNhdGVfam9iJywgWydwcm9kdWN0aW9uIGpvYiBhbHJlYWR5IGV4aXN0cyddKTtcbiAgaWYgKGxpZmUuam9icy5zaXplID49IE1BWF9QUk9EVUNUSU9OX0pPQlMpIHJldHVybiByZWplY3RMaWZlKCdqb2JfbGltaXQnLCBbYGF0IG1vc3QgJHtNQVhfUFJPRFVDVElPTl9KT0JTfSBqb2JzIG1heSBiZSBhY3RpdmVgXSk7XG4gIGNvbnN0IHJlY2lwZSA9IFJFQ0lQRVNbcmVjaXBlSWRdO1xuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhyZWNpcGUuaW5wdXQpKSB7XG4gICAgaWYgKChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApIDwgKGFtb3VudCA/PyAwKSkge1xuICAgICAgcmV0dXJuIHJlamVjdExpZmUoJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnLCBbYG5lZWQgJHthbW91bnR9ICR7U3RyaW5nKHJlc291cmNlKX0sIGhhdmUgJHtzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDB9YF0pO1xuICAgIH1cbiAgfVxuICBjb25zdCByZXNlcnZlZE91dHB1dCA9IFsuLi5saWZlLmpvYnMudmFsdWVzKCldLmZpbHRlcigoaikgPT4gai5zdG9ja3BpbGVJZCA9PT0gc3RvY2suaWQpXG4gICAgLnJlZHVjZSgoc3VtLCBqb2IpID0+IHN1bSArIHRvdGFsKGNsb25lQmFnKFJFQ0lQRVNbam9iLnJlY2lwZV0ub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pKSwgMCk7XG4gIGlmICh0b3RhbChzdG9jay5pbnZlbnRvcnkpIC0gdG90YWwoY2xvbmVCYWcocmVjaXBlLmlucHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pKVxuICAgICsgcmVzZXJ2ZWRPdXRwdXQgKyB0b3RhbChjbG9uZUJhZyhyZWNpcGUub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pKSA+IHN0b2NrLmNhcGFjaXR5KSB7XG4gICAgcmV0dXJuIHJlamVjdExpZmUoJ2NhcGFjaXR5X2V4Y2VlZGVkJywgWydyZXNlcnZlZCBwcm9kdWN0aW9uIG91dHB1dCB3b3VsZCBleGNlZWQgc3RvY2twaWxlIGNhcGFjaXR5J10pO1xuICB9XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHJlY2lwZS5pbnB1dCkpIHtcbiAgICBzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID0gKHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgLSAoYW1vdW50ID8/IDApO1xuICAgIGlmIChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID09PSAwKSBkZWxldGUgc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXTtcbiAgfVxuICBjb25zdCBqb2I6IFByb2R1Y3Rpb25Kb2IgPSB7IGlkOiBqb2JJZCwgc3RvY2twaWxlSWQ6IHN0b2NrLmlkLCByZWNpcGU6IHJlY2lwZUlkLCByZW1haW5pbmdUaWNrczogcmVjaXBlLnRpY2tzIH07XG4gIGxpZmUuam9icy5zZXQoam9iLmlkLCBqb2IpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgLi4uam9iIH0gfTtcbn1cblxuLyoqIFBsYW50IGludG8gYW4gZW1wdHkgZml4ZWQgdGVycmFjZSBwbG90LiBUaGUgZm91bmRlciBmYXJtIG11c3QgYWxyZWFkeSBleGlzdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFudENyb3Aod29ybGQ6IFdvcmxkLCBwbG90SWQ6IHN0cmluZyk6IExpZmVSZXN1bHQ8Q3JvcFBsb3Q+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGlmICghQ1JPUF9QTE9UX0lEUy5pbmNsdWRlcyhwbG90SWQpKSByZXR1cm4gcmVqZWN0TGlmZSgnaW52YWxpZF9wbG90JywgWyd1bmtub3duIGNyb3AgcGxvdCddKTtcbiAgaWYgKCFbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV0uc29tZSgocykgPT4gcy5raW5kID09PSAndGVycmFjZScpKSB7XG4gICAgcmV0dXJuIHJlamVjdExpZmUoJ2Zhcm1fcmVxdWlyZWQnLCBbJ2J1aWxkIHRoZSBmb3VuZGVyIHRlcnJhY2VkIGZhcm0gYmVmb3JlIHBsYW50aW5nJ10pO1xuICB9XG4gIGlmIChsaWZlLmNyb3BzLmhhcyhwbG90SWQpKSByZXR1cm4gcmVqZWN0TGlmZSgncGxvdF9vY2N1cGllZCcsIFsnY3JvcCBwbG90IGlzIGFscmVhZHkgcGxhbnRlZCddKTtcbiAgY29uc3Qgc3RvY2sgPSBsaWZlLnN0b2NrcGlsZXMuZ2V0KEZPVU5ERVJfU1RPQ0tQSUxFX0lEKTtcbiAgaWYgKCFzdG9jayB8fCAoc3RvY2suaW52ZW50b3J5LnNlZWQgPz8gMCkgPCAxKSByZXR1cm4gcmVqZWN0TGlmZSgnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsIFsnbmVlZCAxIHNlZWQgaW4gdGhlIGZvdW5kZXIgc3RvY2twaWxlJ10pO1xuICBzdG9jay5pbnZlbnRvcnkuc2VlZCEtLTtcbiAgaWYgKHN0b2NrLmludmVudG9yeS5zZWVkID09PSAwKSBkZWxldGUgc3RvY2suaW52ZW50b3J5LnNlZWQ7XG4gIGNvbnN0IGNyb3A6IENyb3BQbG90ID0geyBpZDogcGxvdElkLCBwbGFudGVkVGljazogbGlmZS50aWNrLCBncm93dGhUaWNrczogQ1JPUF9HUk9XVEhfVElDS1MgfTtcbiAgbGlmZS5jcm9wcy5zZXQocGxvdElkLCBjcm9wKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IC4uLmNyb3AgfSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JvcFJlYWR5KGNyb3A6IENyb3BQbG90LCB0aWNrOiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHRpY2sgLSBjcm9wLnBsYW50ZWRUaWNrID49IGNyb3AuZ3Jvd3RoVGlja3M7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXJ2ZXN0Q3JvcCh3b3JsZDogV29ybGQsIHBsb3RJZDogc3RyaW5nKTogTGlmZVJlc3VsdDx7IGZvb2Q6IG51bWJlcjsgZmliZXI6IG51bWJlciB9PiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBjb25zdCBjcm9wID0gbGlmZS5jcm9wcy5nZXQocGxvdElkKTtcbiAgaWYgKCFjcm9wKSByZXR1cm4gcmVqZWN0TGlmZSgnbm90X3BsYW50ZWQnLCBbJ2Nyb3AgcGxvdCBpcyBlbXB0eSddKTtcbiAgaWYgKCFjcm9wUmVhZHkoY3JvcCwgbGlmZS50aWNrKSkgcmV0dXJuIHJlamVjdExpZmUoJ2Nyb3Bfbm90X3JlYWR5JywgW2Bjcm9wIG5lZWRzICR7Y3JvcC5ncm93dGhUaWNrcyAtIChsaWZlLnRpY2sgLSBjcm9wLnBsYW50ZWRUaWNrKX0gbW9yZSB0aWNrc2BdKTtcbiAgLy8gUGxhbnQgZ3Jvd3RoIGlzIHRoZSBleHBsaWNpdCBiaW9sb2dpY2FsIHNvdXJjZTsgZXZlcnkgb3RoZXIgbGlmZS1sb29wXG4gIC8vIHRyYW5zZm9ybWF0aW9uIGNvbnNlcnZlcyBpdHMgZGVjbGFyZWQgaW5wdXRzIGFuZCBvdXRwdXRzLlxuICBjb25zdCB5aWVsZEJhZyA9IHsgZm9vZDogQ1JPUF9ZSUVMRC5mb29kLCBmaWJlcjogQ1JPUF9ZSUVMRC5maWJlciB9O1xuICBpZiAodG90YWwod29ybGQuaW52ZW50b3J5KSArIHlpZWxkQmFnLmZvb2QgKyB5aWVsZEJhZy5maWJlciA+IENBUlJJRURfQ0FQQUNJVFkpIHtcbiAgICByZXR1cm4gcmVqZWN0TGlmZSgnY2FwYWNpdHlfZXhjZWVkZWQnLCBbYGNhcnJpZWQgY2FwYWNpdHkgJHtDQVJSSUVEX0NBUEFDSVRZfSB3b3VsZCBiZSBleGNlZWRlZGBdKTtcbiAgfVxuICB3b3JsZC5pbnZlbnRvcnkuZm9vZCA9ICh3b3JsZC5pbnZlbnRvcnkuZm9vZCA/PyAwKSArIHlpZWxkQmFnLmZvb2Q7XG4gIHdvcmxkLmludmVudG9yeS5maWJlciA9ICh3b3JsZC5pbnZlbnRvcnkuZmliZXIgPz8gMCkgKyB5aWVsZEJhZy5maWJlcjtcbiAgbGlmZS5jcm9wcy5kZWxldGUocGxvdElkKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB5aWVsZEJhZyB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRpY2tPdXRjb21lIHtcbiAgZnJvbVRpY2s6IG51bWJlcjtcbiAgdG9UaWNrOiBudW1iZXI7XG4gIGNvbXBsZXRlZEpvYnM6IEFycmF5PHsgaWQ6IHN0cmluZzsgcmVjaXBlOiBSZWNpcGVJZDsgb3V0cHV0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IH0+O1xuICByZWFkeUNyb3BzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkdmFuY2VUaWNrcyh3b3JsZDogV29ybGQsIGNvdW50OiBudW1iZXIpOiBMaWZlUmVzdWx0PFRpY2tPdXRjb21lPiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBpZiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKGNvdW50KSB8fCBjb3VudCA8IDEgfHwgY291bnQgPiBNQVhfVElDS1NfUEVSX0NPTU1BTkQpIHtcbiAgICByZXR1cm4gcmVqZWN0TGlmZSgnaW52YWxpZF90aWNrX2NvdW50JywgW2B0aWNrcyBtdXN0IGJlIGFuIGludGVnZXIgZnJvbSAxIHRvICR7TUFYX1RJQ0tTX1BFUl9DT01NQU5EfWBdKTtcbiAgfVxuICBjb25zdCBjb21wbGV0ZWQ6IFRpY2tPdXRjb21lWydjb21wbGV0ZWRKb2JzJ10gPSBbXTtcbiAgY29uc3QgZnJvbVRpY2sgPSBsaWZlLnRpY2s7XG4gIC8vIEpvYnMgYXJlIHByb2Nlc3NlZCBpbiBzdGFibGUgaWQgb3JkZXIgYXQgZWFjaCB0aWNrLCBuZXZlciBtYXAgaW5zZXJ0aW9uLFxuICAvLyB3YWxsIHRpbWUsIGZyYW1lIGRlbHRhLCBvciBhc3luY2hyb25vdXMgY29tcGxldGlvbiBvcmRlci5cbiAgZm9yIChsZXQgc3RlcCA9IDA7IHN0ZXAgPCBjb3VudDsgc3RlcCsrKSB7XG4gICAgbGlmZS50aWNrKys7XG4gICAgZm9yIChjb25zdCBqb2Igb2YgWy4uLmxpZmUuam9icy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKSkge1xuICAgICAgam9iLnJlbWFpbmluZ1RpY2tzLS07XG4gICAgICBpZiAoam9iLnJlbWFpbmluZ1RpY2tzID4gMCkgY29udGludWU7XG4gICAgICBjb25zdCBzdG9jayA9IGxpZmUuc3RvY2twaWxlcy5nZXQoam9iLnN0b2NrcGlsZUlkKTtcbiAgICAgIGlmICghc3RvY2spIHRocm93IG5ldyBFcnJvcignYWN0aXZlIHByb2R1Y3Rpb24gcmVmZXJlbmNlcyBhIG1pc3Npbmcgc3RvY2twaWxlJyk7XG4gICAgICBjb25zdCBvdXRwdXQgPSBjbG9uZUJhZyhSRUNJUEVTW2pvYi5yZWNpcGVdLm91dHB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KTtcbiAgICAgIGlmICh0b3RhbChzdG9jay5pbnZlbnRvcnkpICsgdG90YWwob3V0cHV0KSA+IHN0b2NrLmNhcGFjaXR5KSB0aHJvdyBuZXcgRXJyb3IoJ3Jlc2VydmVkIHByb2R1Y3Rpb24gb3V0cHV0IGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgICAgIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKG91dHB1dCkpIHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPSAoc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgICAgIGxpZmUuam9icy5kZWxldGUoam9iLmlkKTtcbiAgICAgIGNvbXBsZXRlZC5wdXNoKHsgaWQ6IGpvYi5pZCwgcmVjaXBlOiBqb2IucmVjaXBlLCBvdXRwdXQgfSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHJlYWR5Q3JvcHMgPSBbLi4ubGlmZS5jcm9wcy52YWx1ZXMoKV0uZmlsdGVyKChjcm9wKSA9PiBjcm9wUmVhZHkoY3JvcCwgbGlmZS50aWNrKVxuICAgICYmIGNyb3AucGxhbnRlZFRpY2sgKyBjcm9wLmdyb3d0aFRpY2tzID4gZnJvbVRpY2spLm1hcCgoY3JvcCkgPT4gY3JvcC5pZCkuc29ydCgpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgZnJvbVRpY2ssIHRvVGljazogbGlmZS50aWNrLCBjb21wbGV0ZWRKb2JzOiBjb21wbGV0ZWQsIHJlYWR5Q3JvcHMgfSB9O1xufVxuIiwgIi8vIFZlcnNpb25lZCwgSlNPTi1zYWZlIHNuYXBzaG90cyBvZiBjb21wbGV0ZSBhdXRob3JpdGF0aXZlIE0wMDIgc3RhdGUuXG4vLyBDaHVuayBieXRlcywgaGVpZ2h0L21hdGVyaWFsIGNhY2hlcywgcmVuZGVyZXIgZGF0YSBhbmQgdGltaW5nIGNvdW50ZXJzIGFyZVxuLy8gcmVnZW5lcmF0ZWQgZnJvbSB0aGUgbWFuaWZlc3QgYW5kIGR1cmFibGUgZWRpdHM7IHRoZXkgYXJlIG5vdCBhIHNlY29uZCBzYXZlLlxuaW1wb3J0IHtcbiAgQ0hVTktfU0laRSwgQ0hVTktfVk9MVU1FLCBDSFVOS1NfUEVSX1NJREUsIEVudGl0eSwgRW50aXR5S2luZCxcbiAgR0VORVJBVE9SX1ZFUlNJT04sIEhBTEYsIE1hdElkLCBSZXNvdXJjZVR5cGUsIFdvcmxkLCBXb3JsZE1hbmlmZXN0LFxuICBjcmVhdGVXb3JsZCwgcGxhY2VBdXRob3JlZFNpdGVzLCB3b3JsZE1hbmlmZXN0LCBlbnN1cmVDaHVuaywgaXNSZXRpcmVkU3RvbmVLaW5kLFxuICBtYXJrRWRpdHNDaGFuZ2VkLCBpc1N1cHBvcnRlZEdlbmVyYXRvciwgTUFYX01BVF9JRCxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBGT1VOREVSX0RFU0lHTl9WRVJTSU9OLCBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHtcbiAgZW5hYmxlU3RvbmVSZXBsYXksIGZpbmlzaFN0b25lUmVwbGF5LCBpc0hpc3RvcmljYWxTdG9uZUhhc2gsIGlzU3RvbmVSZXBsYXksXG59IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7XG4gIENBUlJJRURfQ0FQQUNJVFksIENST1BfR1JPV1RIX1RJQ0tTLCBDUk9QX1BMT1RfSURTLCBGT1VOREVSX1NUT0NLUElMRSxcbiAgRk9VTkRFUl9TVE9DS1BJTEVfSUQsIExJRkVfUkVTT1VSQ0VTLCBNQVhfUFJPRFVDVElPTl9KT0JTLCBNQVhfVElDS1NfUEVSX0NPTU1BTkQsXG4gIFJFQ0lQRVMsIFNUT0NLUElMRV9DQVBBQ0lUWSwgY3JlYXRlTGlmZVN0YXRlLFxufSBmcm9tICcuL2Vjb25vbXknO1xuXG5leHBvcnQgY29uc3QgU05BUFNIT1RfU0NIRU1BID0gMSBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBERVNJR05fU05BUFNIT1RfU0NIRU1BID0gMiBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSA9IDMgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgTUFYX1NOQVBTSE9UX0pTT05fQllURVMgPSAyNV8wMDBfMDAwO1xuZXhwb3J0IGNvbnN0IE1BWF9TTkFQU0hPVF9FRElUUyA9IDFfMDAwXzAwMDtcbmV4cG9ydCBjb25zdCBNQVhfU05BUFNIT1RfRU5USVRJRVMgPSA1MDBfMDAwO1xuXG5pbnRlcmZhY2UgQmFzZVdvcmxkU25hcHNob3Qge1xuICBzY2hlbWE6IHR5cGVvZiBTTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX1NOQVBTSE9UX1NDSEVNQSB8IHR5cGVvZiBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQTtcbiAgbWFuaWZlc3Q6IFdvcmxkTWFuaWZlc3Q7XG4gIHJldmlzaW9uOiBudW1iZXI7XG4gIGVkaXRzOiBBcnJheTx7IGNodW5rOiBzdHJpbmc7IGNlbGxzOiBBcnJheTx7IGk6IG51bWJlcjsgbTogbnVtYmVyIH0+IH0+O1xuICBlbnRpdGllczogRW50aXR5W107XG4gIC8qKiBDaHVua3Mgd2l0aCBkdXJhYmxlIGdlbmVyYXRlZC1lbnRpdHkgY2hhbmdlczsgcHVyZSBxdWVyaWVzIGFyZSBleGNsdWRlZC4gKi9cbiAgZW50aXR5Q2h1bmtzOiBzdHJpbmdbXTtcbiAgZW50aXR5UmVtb3ZhbHM6IHN0cmluZ1tdO1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIHN0cnVjdHVyZXM6IFN0cnVjdHVyZVtdO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqIE5leHQgYWNjZXB0ZWQgam91cm5hbCBzZXF1ZW5jZSBhdCB0aGlzIHNuYXBzaG90IGJvdW5kYXJ5LiAqL1xuICBuZXh0U2VxdWVuY2U6IG51bWJlcjtcbn1cbmV4cG9ydCB0eXBlIFdvcmxkU25hcHNob3QgPSBCYXNlV29ybGRTbmFwc2hvdCAmICh7XG4gIHNjaGVtYTogdHlwZW9mIFNOQVBTSE9UX1NDSEVNQSB8IHR5cGVvZiBERVNJR05fU05BUFNIT1RfU0NIRU1BO1xufSB8IHtcbiAgc2NoZW1hOiB0eXBlb2YgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUE7XG4gIHRpY2s6IG51bWJlcjtcbiAgc3RvY2twaWxlczogQXJyYXk8e1xuICAgIGlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7IHg6IG51bWJlcjsgejogbnVtYmVyO1xuICAgIGNhcGFjaXR5OiB0eXBlb2YgU1RPQ0tQSUxFX0NBUEFDSVRZOyBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIH0+O1xuICBqb2JzOiBBcnJheTx7XG4gICAgaWQ6IHN0cmluZzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgICByZWNpcGU6ICdzZWVkJyB8ICdyYXRpb25zJzsgcmVtYWluaW5nVGlja3M6IG51bWJlcjtcbiAgfT47XG4gIGNyb3BzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHBsYW50ZWRUaWNrOiBudW1iZXI7IGdyb3d0aFRpY2tzOiB0eXBlb2YgQ1JPUF9HUk9XVEhfVElDS1MgfT47XG59KTtcbnR5cGUgTGlmZVNuYXBzaG90ID0gRXh0cmFjdDxXb3JsZFNuYXBzaG90LCB7IHNjaGVtYTogdHlwZW9mIENVUlJFTlRfU05BUFNIT1RfU0NIRU1BIH0+O1xuXG5mdW5jdGlvbiBjbG9uZUVudGl0eShlOiBFbnRpdHkpOiBFbnRpdHkge1xuICByZXR1cm4ge1xuICAgIGlkOiBlLmlkLCBraW5kOiBlLmtpbmQsIGNodW5rOiBlLmNodW5rLCB4OiBlLngsIHk6IGUueSwgejogZS56LFxuICAgIHJvdDogZS5yb3QsIHNjYWxlOiBlLnNjYWxlLCB2YXJpYW50OiBlLnZhcmlhbnQsIHJlc291cmNlOiBlLnJlc291cmNlLFxuICAgIHJlbWFpbmluZzogZS5yZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdDogZS55aWVsZFBlckhhcnZlc3QsIGhhcnZlc3RlZDogZS5oYXJ2ZXN0ZWQsXG4gICAgLi4uKGUuaGFydmVzdGVkT25jZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGhhcnZlc3RlZE9uY2U6IGUuaGFydmVzdGVkT25jZSB9KSxcbiAgICBwcm92aXNpb25hbDogZS5wcm92aXNpb25hbCwgYXV0aG9yZWQ6IGUuYXV0aG9yZWQsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNsb25lU3RydWN0dXJlKHM6IFN0cnVjdHVyZSk6IFN0cnVjdHVyZSB7XG4gIHJldHVybiB7XG4gICAgLi4ucyxcbiAgICBtb2R1bGVzOiBzLm1vZHVsZXMubWFwKChtKSA9PiAoeyAuLi5tIH0pKSxcbiAgICBjb3N0OiBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMocy5jb3N0KS5maWx0ZXIoKFssIGFtb3VudF0pID0+IChhbW91bnQgPz8gMCkgPiAwKVxuICAgICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkU25hcHNob3QoXG4gIHdvcmxkOiBXb3JsZCwgbmV4dFNlcXVlbmNlID0gMCxcbiAgc2NoZW1hOiBXb3JsZFNuYXBzaG90WydzY2hlbWEnXSA9IHdvcmxkLmxpZmUgPyBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQVxuICAgIDogWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvbWUoKHMpID0+IHMuZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTilcbiAgICAgID8gREVTSUdOX1NOQVBTSE9UX1NDSEVNQSA6IFNOQVBTSE9UX1NDSEVNQSxcbik6IFdvcmxkU25hcHNob3Qge1xuICBpZiAoc2NoZW1hICE9PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSAmJiAod29ybGQubGlmZSB8fCBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV0uc29tZShcbiAgICAocykgPT4gc2NoZW1hID09PSBTTkFQU0hPVF9TQ0hFTUEgJiYgcy5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWQsXG4gICkpKSB0aHJvdyBuZXcgRXJyb3IoJ2xlZ2FjeSBzbmFwc2hvdHMgY2Fubm90IGNvbnRhaW4gbmV3ZXIgYXV0aG9yaXRhdGl2ZSBzdGF0ZScpO1xuICBjb25zdCBiYXNlOiBCYXNlV29ybGRTbmFwc2hvdCA9IHtcbiAgICBzY2hlbWEsXG4gICAgbWFuaWZlc3Q6IHdvcmxkTWFuaWZlc3Qod29ybGQpLFxuICAgIHJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICBlZGl0czogWy4uLndvcmxkLmVkaXRzLmVudHJpZXMoKV0uc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkubWFwKFxuICAgICAgKFtjaHVuaywgY2VsbHNdKSA9PiAoe1xuICAgICAgICBjaHVuayxcbiAgICAgICAgY2VsbHM6IFsuLi5jZWxscy5lbnRyaWVzKCldLnNvcnQoKFthXSwgW2JdKSA9PiBhIC0gYikubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLFxuICAgICAgfSksXG4gICAgKSxcbiAgICBlbnRpdGllczogWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXS5maWx0ZXIoKGUpID0+IChpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQpIHx8ICFpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSlcbiAgICAgICYmIChlLmF1dGhvcmVkIHx8IHdvcmxkLmVudGl0eUNoYW5nZXMuaGFzKGUuY2h1bmspKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcChjbG9uZUVudGl0eSksXG4gICAgZW50aXR5Q2h1bmtzOiBbLi4ud29ybGQuZW50aXR5Q2hhbmdlc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSxcbiAgICBlbnRpdHlSZW1vdmFsczogWy4uLndvcmxkLmVudGl0eVJlbW92YWxzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLFxuICAgIGludmVudG9yeTogT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKHdvcmxkLmludmVudG9yeSkuZmlsdGVyKChbLCBhbW91bnRdKSA9PiBhbW91bnQgPiAwKVxuICAgICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKSxcbiAgICBzdHJ1Y3R1cmVzOiBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoY2xvbmVTdHJ1Y3R1cmUpLFxuICAgIGF1dGhvcmVkUGxhY2VkOiB3b3JsZC5hdXRob3JlZFBsYWNlZCxcbiAgICBuZXh0U2VxdWVuY2UsXG4gIH07XG4gIGlmIChzY2hlbWEgIT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BKSByZXR1cm4geyAuLi5iYXNlLCBzY2hlbWEgfSBhcyBXb3JsZFNuYXBzaG90O1xuICBpZiAoIXdvcmxkLmxpZmUpIHRocm93IG5ldyBFcnJvcignc2NoZW1hLTMgc25hcHNob3QgcmVxdWlyZXMgbGlmZSBzdGF0ZScpO1xuICByZXR1cm4ge1xuICAgIC4uLmJhc2UsIHNjaGVtYSxcbiAgICB0aWNrOiB3b3JsZC5saWZlLnRpY2ssXG4gICAgc3RvY2twaWxlczogWy4uLndvcmxkLmxpZmUuc3RvY2twaWxlcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoKHMpID0+ICh7XG4gICAgICBpZDogcy5pZCwgeDogcy54LCB6OiBzLnosIGNhcGFjaXR5OiBzLmNhcGFjaXR5LFxuICAgICAgaW52ZW50b3J5OiBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMocy5pbnZlbnRvcnkpLmZpbHRlcigoWywgYW1vdW50XSkgPT4gYW1vdW50ID4gMClcbiAgICAgICAgLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKSxcbiAgICB9KSksXG4gICAgam9iczogWy4uLndvcmxkLmxpZmUuam9icy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoKGopID0+ICh7IC4uLmogfSkpLFxuICAgIGNyb3BzOiBbLi4ud29ybGQubGlmZS5jcm9wcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoKGMpID0+ICh7IC4uLmMgfSkpLFxuICB9O1xufVxuXG4vKiogVHdvIGxhbmVzLCB3aXRoIGxlbmd0aCBpbmNsdWRlZDsgbm90IGEgY3J5cHRvZ3JhcGhpYyBpbnRlZ3JpdHkgc2lnbmF0dXJlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbEhhc2godGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGEgPSAweDgxMWM5ZGM1LCBiID0gMHg5ZTM3NzliOTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYyA9IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBhID0gTWF0aC5pbXVsKGEgXiBjLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoYyArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICBiIF49IGIgPj4+IDEzO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJykgKyAoYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxXb3JsZEhhc2goXG4gIHdvcmxkOiBXb3JsZCwgbmV4dFNlcXVlbmNlID0gMCwgc2NoZW1hOiBXb3JsZFNuYXBzaG90WydzY2hlbWEnXSA9IERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEsXG4pOiBzdHJpbmcge1xuICByZXR1cm4gY2Fub25pY2FsSGFzaChKU09OLnN0cmluZ2lmeShjcmVhdGVXb3JsZFNuYXBzaG90KHdvcmxkLCBuZXh0U2VxdWVuY2UsIHNjaGVtYSkpKTtcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gdWludCh2YWx1ZTogdW5rbm93biwgbWF4aW11bTogbnVtYmVyKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzU2FmZUludGVnZXIodmFsdWUpICYmIHZhbHVlID49IDAgJiYgdmFsdWUgPD0gbWF4aW11bTtcbn1cblxuZnVuY3Rpb24gZmluaXRlKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gdGV4dCh2YWx1ZTogdW5rbm93biwgbWF4aW11bSA9IDI1Nik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlLmxlbmd0aCA+IDAgJiYgdmFsdWUubGVuZ3RoIDw9IG1heGltdW07XG59XG5cbmZ1bmN0aW9uIHZhbGlkQ2h1bmsoa2V5OiB1bmtub3duKToga2V5IGlzIHN0cmluZyB7XG4gIGlmICh0eXBlb2Yga2V5ICE9PSAnc3RyaW5nJyB8fCAhL14tP1xcZCssLT9cXGQrJC8udGVzdChrZXkpKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKGN4KSAmJiBOdW1iZXIuaXNJbnRlZ2VyKGN6KVxuICAgICYmIGN4ID49IDAgJiYgY3ogPj0gMCAmJiBjeCA8IENIVU5LU19QRVJfU0lERSAmJiBjeiA8IENIVU5LU19QRVJfU0lERTtcbn1cblxuLyoqIEEgc3RyaWN0IGxlZ2FjeSBzbmFwc2hvdCBpcyBhbHJlYWR5IGNhbm9uaWNhbCBjcmVhdGVXb3JsZFNuYXBzaG90IG91dHB1dC5cbiAqIFZlcmlmeSBpdHMgcmVjb3JkZWQgYm91bmRhcnkgYmVmb3JlIGZpbHRlcmluZyB0aGUgdGhyZWUgcmV0aXJlZCBzdG9uZSBmb3Jtcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsZWdhY3lTdG9uZUhhc2goc25hcHNob3Q6IFdvcmxkU25hcHNob3QpOiBzdHJpbmcge1xuICByZXR1cm4gY2Fub25pY2FsSGFzaChKU09OLnN0cmluZ2lmeShzbmFwc2hvdCkpO1xufVxuXG4vKiogTWlncmF0aW9uIG9ubHk6IG5vIGludmVudG9yeSwgc3RydWN0dXJlLCBsaWZlLCBlZGl0IG9yIGNvbW1hbmQgZGF0YSBjaGFuZ2VzLiAqL1xuLyoqIEBpbnRlcm5hbCBSZXRpcmUgb25seSBhZnRlciByZWNvbnN0cnVjdGluZyB0aGUgb2xkIHN0YXRlIGluIHJlcGxheSBtb2RlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1pZ3JhdGVTdG9uZVNuYXBzaG90KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90KTogV29ybGRTbmFwc2hvdCB7XG4gIGNvbnN0IHJlbW92YWxzID0gbmV3IFNldChzbmFwc2hvdC5lbnRpdHlSZW1vdmFscyk7XG4gIGZvciAoY29uc3QgZW50aXR5IG9mIHNuYXBzaG90LmVudGl0aWVzKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgJiYgIWVudGl0eS5hdXRob3JlZCkgcmVtb3ZhbHMuYWRkKGVudGl0eS5pZCk7XG4gIH1cbiAgY29uc3QgZW50aXR5Q2h1bmtzID0gbmV3IFNldChzbmFwc2hvdC5lbnRpdHlDaHVua3MpO1xuICBmb3IgKGNvbnN0IGVudGl0eSBvZiBzbmFwc2hvdC5lbnRpdGllcykge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSB7XG4gICAgICBlbnRpdHlDaHVua3MuYWRkKGVudGl0eS5jaHVuayk7XG4gICAgICBpZiAoIWVudGl0eS5hdXRob3JlZCkgcmVtb3ZhbHMuYWRkKGVudGl0eS5pZCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB7XG4gICAgLi4uc25hcHNob3QsXG4gICAgZW50aXRpZXM6IHNuYXBzaG90LmVudGl0aWVzLmZpbHRlcigoZW50aXR5KSA9PiAhaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSksXG4gICAgZW50aXR5Q2h1bmtzOiBbLi4uZW50aXR5Q2h1bmtzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLFxuICAgIGVudGl0eVJlbW92YWxzOiBbLi4ucmVtb3ZhbHNdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gIH07XG59XG5jb25zdCBFTlRJVFlfS0lORFMgPSBuZXcgU2V0PEVudGl0eUtpbmQ+KFtcbiAgJ3N0eWxfdHJlZV9zcGlyZScsICdzdHlsX3RyZWVfdGFibGUnLCAnc3R5bF90cmVlX2NsdXN0ZXInLCAnc3R5bF90cmVlX2Jsb3Nzb20nLFxuICAnc3R5bF9zaHJ1YicsICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuICAnc3R5bF9vcmUnLCAnc3R5bF9jYWlybicsICd3YXlzdG9uZScsICdtYXJrZXInLFxuXSk7XG5jb25zdCBSRVNPVVJDRVMgPSBuZXcgU2V0PFJlc291cmNlVHlwZT4oWyd3b29kJywgJ3N0b25lJywgJ29yZScsICdmaWJlciddKTtcbmNvbnN0IFJFQ09SRF9SRVNPVVJDRVMgPSBuZXcgU2V0PHN0cmluZz4oTElGRV9SRVNPVVJDRVMpO1xuY29uc3QgU1RSVUNUVVJFX0tJTkRTID0gbmV3IFNldChbJ2hvdXNlJywgJ3BhdGgnLCAndGVycmFjZSddKTtcbmNvbnN0IE1PRFVMRV9LSU5EUyA9IG5ldyBTZXQoW1xuICAnZmxvb3InLCAnd2FsbCcsICdwb3N0JywgJ2xpbnRlbCcsICdyb29mJywgJ3BhcmFwZXQnLCAnd2luZG93JywgJ2Rvb3InLFxuICAndGhyZXNob2xkJywgJ3BhdGgnLCAnY3VyYicsICdzb2lsX2JlZCcsICdyZXRhaW5pbmdfd2FsbCcsICdjcm9wX3JvdycsXG5dKTtcbmNvbnN0IE1PRFVMRV9UT05FUyA9IG5ldyBTZXQoWydzdG9uZScsICdzdG9uZV9iJywgJ29jaHJlJywgJ3RpbWJlcicsICdhY2NlbnQnLCAnc29pbCcsICdjcm9wJywgJ2dyYXZlbCddKTtcblxuZnVuY3Rpb24gdmFsaWRhdGVFbnRpdHkodmFsdWU6IHVua25vd24sIGlkczogU2V0PHN0cmluZz4pOiBFbnRpdHkge1xuICBpZiAoIWlzT2JqZWN0KHZhbHVlKSB8fCAhdGV4dCh2YWx1ZS5pZCkgfHwgaWRzLmhhcyh2YWx1ZS5pZClcbiAgICB8fCAhdGV4dCh2YWx1ZS5raW5kKSB8fCAhRU5USVRZX0tJTkRTLmhhcyh2YWx1ZS5raW5kIGFzIEVudGl0eUtpbmQpXG4gICAgfHwgIXZhbGlkQ2h1bmsodmFsdWUuY2h1bmspXG4gICAgfHwgIWZpbml0ZSh2YWx1ZS54KSB8fCAhZmluaXRlKHZhbHVlLnkpIHx8ICFmaW5pdGUodmFsdWUueilcbiAgICB8fCB2YWx1ZS54IDwgLUhBTEYgfHwgdmFsdWUueCA+PSBIQUxGIHx8IHZhbHVlLnogPCAtSEFMRiB8fCB2YWx1ZS56ID49IEhBTEZcbiAgICB8fCAhZmluaXRlKHZhbHVlLnJvdCkgfHwgIWZpbml0ZSh2YWx1ZS5zY2FsZSkgfHwgIXVpbnQodmFsdWUudmFyaWFudCwgMTAwMClcbiAgICB8fCB2YWx1ZS5yZXNvdXJjZSAhPT0gbnVsbCAmJiAhKHR5cGVvZiB2YWx1ZS5yZXNvdXJjZSA9PT0gJ3N0cmluZycgJiYgUkVTT1VSQ0VTLmhhcyh2YWx1ZS5yZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGUpKVxuICAgIHx8ICF1aW50KHZhbHVlLnJlbWFpbmluZywgMV8wMDBfMDAwKSB8fCAhdWludCh2YWx1ZS55aWVsZFBlckhhcnZlc3QsIDFfMDAwXzAwMClcbiAgICB8fCB0eXBlb2YgdmFsdWUuaGFydmVzdGVkICE9PSAnYm9vbGVhbicgfHwgdHlwZW9mIHZhbHVlLnByb3Zpc2lvbmFsICE9PSAnYm9vbGVhbidcbiAgICB8fCB0eXBlb2YgdmFsdWUuYXV0aG9yZWQgIT09ICdib29sZWFuJ1xuICAgIHx8IHZhbHVlLmhhcnZlc3RlZE9uY2UgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgdmFsdWUuaGFydmVzdGVkT25jZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyBhbiBpbnZhbGlkIG9yIGR1cGxpY2F0ZSBlbnRpdHknKTtcbiAgfVxuICBpZHMuYWRkKHZhbHVlLmlkKTtcbiAgcmV0dXJuIHtcbiAgICBpZDogdmFsdWUuaWQsIGtpbmQ6IHZhbHVlLmtpbmQgYXMgRW50aXR5S2luZCwgY2h1bms6IHZhbHVlLmNodW5rLFxuICAgIHg6IHZhbHVlLngsIHk6IHZhbHVlLnksIHo6IHZhbHVlLnosIHJvdDogdmFsdWUucm90LCBzY2FsZTogdmFsdWUuc2NhbGUsXG4gICAgdmFyaWFudDogdmFsdWUudmFyaWFudCwgcmVzb3VyY2U6IHZhbHVlLnJlc291cmNlIGFzIFJlc291cmNlVHlwZSB8IG51bGwsXG4gICAgcmVtYWluaW5nOiB2YWx1ZS5yZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdDogdmFsdWUueWllbGRQZXJIYXJ2ZXN0LFxuICAgIGhhcnZlc3RlZDogdmFsdWUuaGFydmVzdGVkLFxuICAgIC4uLih2YWx1ZS5oYXJ2ZXN0ZWRPbmNlID09PSB1bmRlZmluZWQgPyB7fSA6IHsgaGFydmVzdGVkT25jZTogdmFsdWUuaGFydmVzdGVkT25jZSB9KSxcbiAgICBwcm92aXNpb25hbDogdmFsdWUucHJvdmlzaW9uYWwsIGF1dGhvcmVkOiB2YWx1ZS5hdXRob3JlZCxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVJbnZlbnRvcnkodmFsdWU6IHVua25vd24pOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgaWYgKCFpc09iamVjdCh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaW52ZW50b3J5IGlzIGludmFsaWQnKTtcbiAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHZhbHVlKS5zb3J0KCkpIHtcbiAgICBpZiAoIVJFQ09SRF9SRVNPVVJDRVMuaGFzKGtleSkgfHwgIXVpbnQodmFsdWVba2V5XSwgMV8wMDBfMDAwXzAwMCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgc25hcHNob3QgaGFzIGludmFsaWQgaW52ZW50b3J5IHJlc291cmNlICR7a2V5fWApO1xuICAgIH1cbiAgICBpZiAodmFsdWVba2V5XSA+IDApIG91dFtrZXldID0gdmFsdWVba2V5XTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBzdG9ja1RvdGFsKHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KTogbnVtYmVyIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXModmFsdWUpLnJlZHVjZSgoc3VtLCBhbW91bnQpID0+IHN1bSArIGFtb3VudCwgMCk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlTGlmZUZpZWxkcyh2YWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBQaWNrPExpZmVTbmFwc2hvdCwgJ3RpY2snIHwgJ3N0b2NrcGlsZXMnIHwgJ2pvYnMnIHwgJ2Nyb3BzJz4ge1xuICBpZiAoIXVpbnQodmFsdWUudGljaywgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuc3RvY2twaWxlcykgfHwgdmFsdWUuc3RvY2twaWxlcy5sZW5ndGggIT09IDFcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5qb2JzKSB8fCB2YWx1ZS5qb2JzLmxlbmd0aCA+IE1BWF9QUk9EVUNUSU9OX0pPQlNcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5jcm9wcykgfHwgdmFsdWUuY3JvcHMubGVuZ3RoID4gQ1JPUF9QTE9UX0lEUy5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBpbnZhbGlkIGxpZmUtbG9vcCBmaWVsZHMnKTtcbiAgfVxuICBjb25zdCBzdG9ja3BpbGVzOiBOb25OdWxsYWJsZTxMaWZlU25hcHNob3RbJ3N0b2NrcGlsZXMnXT4gPSBbXTtcbiAgZm9yIChjb25zdCByYXcgb2YgdmFsdWUuc3RvY2twaWxlcykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCByYXcuaWQgIT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEIHx8IHJhdy54ICE9PSBGT1VOREVSX1NUT0NLUElMRS54XG4gICAgICB8fCByYXcueiAhPT0gRk9VTkRFUl9TVE9DS1BJTEUueiB8fCByYXcuY2FwYWNpdHkgIT09IEZPVU5ERVJfU1RPQ0tQSUxFLmNhcGFjaXR5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBhbiB1bnN1cHBvcnRlZCBzdG9ja3BpbGUnKTtcbiAgICB9XG4gICAgY29uc3QgaW52ZW50b3J5ID0gdmFsaWRhdGVJbnZlbnRvcnkocmF3LmludmVudG9yeSk7XG4gICAgaWYgKHN0b2NrVG90YWwoaW52ZW50b3J5KSA+IFNUT0NLUElMRV9DQVBBQ0lUWSkgdGhyb3cgbmV3IEVycm9yKCdzdG9ja3BpbGUgZXhjZWVkcyBjYXBhY2l0eScpO1xuICAgIHN0b2NrcGlsZXMucHVzaCh7IGlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCwgeDogcmF3LngsIHo6IHJhdy56LFxuICAgICAgY2FwYWNpdHk6IFNUT0NLUElMRV9DQVBBQ0lUWSwgaW52ZW50b3J5IH0pO1xuICB9XG4gIGxldCByZXNlcnZlZCA9IHN0b2NrVG90YWwoc3RvY2twaWxlc1swXS5pbnZlbnRvcnkpO1xuICBjb25zdCBpZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgam9iczogTm9uTnVsbGFibGU8TGlmZVNuYXBzaG90Wydqb2JzJ10+ID0gW107XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLmpvYnMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgIXRleHQocmF3LmlkLCAxMjgpIHx8ICEvXltBLVphLXowLTldW0EtWmEtejAtOS5fOiUtXSokLy50ZXN0KHJhdy5pZClcbiAgICAgIHx8IGlkcy5oYXMocmF3LmlkKSB8fCByYXcuc3RvY2twaWxlSWQgIT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEXG4gICAgICB8fCByYXcucmVjaXBlICE9PSAnc2VlZCcgJiYgcmF3LnJlY2lwZSAhPT0gJ3JhdGlvbnMnXG4gICAgICB8fCAhdWludChyYXcucmVtYWluaW5nVGlja3MsIE1BWF9USUNLU19QRVJfQ09NTUFORCkgfHwgcmF3LnJlbWFpbmluZ1RpY2tzIDwgMVxuICAgICAgfHwgcmF3LnJlbWFpbmluZ1RpY2tzID4gUkVDSVBFU1tyYXcucmVjaXBlXS50aWNrcykgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gaW52YWxpZCBwcm9kdWN0aW9uIGpvYicpO1xuICAgIHJlc2VydmVkICs9IHN0b2NrVG90YWwoUkVDSVBFU1tyYXcucmVjaXBlXS5vdXRwdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPik7XG4gICAgaWRzLmFkZChyYXcuaWQpO1xuICAgIGpvYnMucHVzaCh7IGlkOiByYXcuaWQsIHN0b2NrcGlsZUlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCwgcmVjaXBlOiByYXcucmVjaXBlLCByZW1haW5pbmdUaWNrczogcmF3LnJlbWFpbmluZ1RpY2tzIH0pO1xuICB9XG4gIGlmIChyZXNlcnZlZCA+IFNUT0NLUElMRV9DQVBBQ0lUWSkgdGhyb3cgbmV3IEVycm9yKCdzdG9ja3BpbGUgcmVzZXJ2ZWQgb3V0cHV0IGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgaWRzLmNsZWFyKCk7XG4gIGNvbnN0IGNyb3BzOiBOb25OdWxsYWJsZTxMaWZlU25hcHNob3RbJ2Nyb3BzJ10+ID0gW107XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLmNyb3BzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICFDUk9QX1BMT1RfSURTLmluY2x1ZGVzKFN0cmluZyhyYXcuaWQpKSB8fCBpZHMuaGFzKFN0cmluZyhyYXcuaWQpKVxuICAgICAgfHwgIXVpbnQocmF3LnBsYW50ZWRUaWNrLCB2YWx1ZS50aWNrKSB8fCByYXcuZ3Jvd3RoVGlja3MgIT09IENST1BfR1JPV1RIX1RJQ0tTKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBhbiBpbnZhbGlkIGNyb3AgcGxvdCcpO1xuICAgIH1cbiAgICBjb25zdCBwbG90SWQgPSBTdHJpbmcocmF3LmlkKTtcbiAgICBpZHMuYWRkKHBsb3RJZCk7XG4gICAgY3JvcHMucHVzaCh7IGlkOiBwbG90SWQsIHBsYW50ZWRUaWNrOiByYXcucGxhbnRlZFRpY2ssIGdyb3d0aFRpY2tzOiBDUk9QX0dST1dUSF9USUNLUyB9KTtcbiAgfVxuICBzdG9ja3BpbGVzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIGpvYnMuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcbiAgY3JvcHMuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcbiAgcmV0dXJuIHsgdGljazogdmFsdWUudGljaywgc3RvY2twaWxlcywgam9icywgY3JvcHMgfTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDb3N0KHZhbHVlOiB1bmtub3duKTogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiB7XG4gIGNvbnN0IG91dCA9IHZhbGlkYXRlSW52ZW50b3J5KHZhbHVlKTtcbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVTdHJ1Y3R1cmUoXG4gIHZhbHVlOiB1bmtub3duLCBpZHM6IFNldDxzdHJpbmc+LCBzY2hlbWE6IFdvcmxkU25hcHNob3RbJ3NjaGVtYSddLFxuKTogU3RydWN0dXJlIHtcbiAgaWYgKCFpc09iamVjdCh2YWx1ZSkgfHwgIXRleHQodmFsdWUuaWQpIHx8IGlkcy5oYXModmFsdWUuaWQpXG4gICAgfHwgIXRleHQodmFsdWUua2luZCkgfHwgIVNUUlVDVFVSRV9LSU5EUy5oYXModmFsdWUua2luZClcbiAgICB8fCAhdGV4dCh2YWx1ZS5zaXRlSWQpXG4gICAgfHwgIWZpbml0ZSh2YWx1ZS54KSB8fCAhZmluaXRlKHZhbHVlLnkpIHx8ICFmaW5pdGUodmFsdWUueikgfHwgIWZpbml0ZSh2YWx1ZS5yb3QpXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUubW9kdWxlcykgfHwgdmFsdWUubW9kdWxlcy5sZW5ndGggPiA2NFxuICAgIHx8ICF1aW50KHZhbHVlLmJ1aWx0UmV2aXNpb24sIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB8fCB2YWx1ZS5wcm92aXNpb25hbCAhPT0gdHJ1ZVxuICAgIHx8IHNjaGVtYSA9PT0gU05BUFNIT1RfU0NIRU1BICYmIHZhbHVlLmRlc2lnblZlcnNpb24gIT09IHVuZGVmaW5lZFxuICAgIHx8IHNjaGVtYSAhPT0gU05BUFNIT1RfU0NIRU1BICYmIHZhbHVlLmRlc2lnblZlcnNpb24gIT09IHVuZGVmaW5lZFxuICAgICAgJiYgdmFsdWUuZGVzaWduVmVyc2lvbiAhPT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTikge1xuICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgYW4gaW52YWxpZCBvciBkdXBsaWNhdGUgc3RydWN0dXJlJyk7XG4gIH1cbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlWydtb2R1bGVzJ10gPSBbXTtcbiAgY29uc3QgbW9kdWxlSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLm1vZHVsZXMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgIXRleHQocmF3LmtpbmQpIHx8ICFNT0RVTEVfS0lORFMuaGFzKHJhdy5raW5kKVxuICAgICAgfHwgIWZpbml0ZShyYXcueCkgfHwgIWZpbml0ZShyYXcueSkgfHwgIWZpbml0ZShyYXcueilcbiAgICAgIHx8ICFmaW5pdGUocmF3LncpIHx8IHJhdy53IDw9IDAgfHwgIWZpbml0ZShyYXcuaCkgfHwgcmF3LmggPD0gMCB8fCAhZmluaXRlKHJhdy5kKSB8fCByYXcuZCA8PSAwXG4gICAgICB8fCByYXcucm90ICE9PSB1bmRlZmluZWQgJiYgIWZpbml0ZShyYXcucm90KVxuICAgICAgfHwgcmF3LnRvbmUgIT09IHVuZGVmaW5lZCAmJiAodHlwZW9mIHJhdy50b25lICE9PSAnc3RyaW5nJyB8fCAhTU9EVUxFX1RPTkVTLmhhcyhyYXcudG9uZSkpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYHN0cnVjdHVyZSAke3ZhbHVlLmlkfSBjb250YWlucyBhbiBpbnZhbGlkIG1vZHVsZWApO1xuICAgIH1cbiAgICBjb25zdCBzaWduYXR1cmUgPSBKU09OLnN0cmluZ2lmeShyYXcpO1xuICAgIGlmIChtb2R1bGVJZHMuaGFzKHNpZ25hdHVyZSkpIHRocm93IG5ldyBFcnJvcihgc3RydWN0dXJlICR7dmFsdWUuaWR9IGNvbnRhaW5zIGR1cGxpY2F0ZSBtb2R1bGVzYCk7XG4gICAgbW9kdWxlSWRzLmFkZChzaWduYXR1cmUpO1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiByYXcua2luZCBhcyBTdHJ1Y3R1cmVbJ21vZHVsZXMnXVtudW1iZXJdWydraW5kJ10sXG4gICAgICB4OiByYXcueCwgeTogcmF3LnksIHo6IHJhdy56LCB3OiByYXcudywgaDogcmF3LmgsIGQ6IHJhdy5kLFxuICAgICAgLi4uKHJhdy5yb3QgPT09IHVuZGVmaW5lZCA/IHt9IDogeyByb3Q6IHJhdy5yb3QgfSksXG4gICAgICAuLi4ocmF3LnRvbmUgPT09IHVuZGVmaW5lZCA/IHt9IDogeyB0b25lOiByYXcudG9uZSBhcyBTdHJ1Y3R1cmVbJ21vZHVsZXMnXVtudW1iZXJdWyd0b25lJ10gfSksXG4gICAgfSk7XG4gIH1cbiAgaWRzLmFkZCh2YWx1ZS5pZCk7XG4gIHJldHVybiB7XG4gICAgaWQ6IHZhbHVlLmlkLCBraW5kOiB2YWx1ZS5raW5kIGFzIFN0cnVjdHVyZVsna2luZCddLCBzaXRlSWQ6IHZhbHVlLnNpdGVJZCxcbiAgICB4OiB2YWx1ZS54LCB5OiB2YWx1ZS55LCB6OiB2YWx1ZS56LCByb3Q6IHZhbHVlLnJvdCxcbiAgICBtb2R1bGVzLCBjb3N0OiB2YWxpZGF0ZUNvc3QodmFsdWUuY29zdCksIGJ1aWx0UmV2aXNpb246IHZhbHVlLmJ1aWx0UmV2aXNpb24sXG4gICAgLi4uKHZhbHVlLmRlc2lnblZlcnNpb24gPT09IHVuZGVmaW5lZCA/IHt9IDogeyBkZXNpZ25WZXJzaW9uOiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OIH0pLFxuICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICB9O1xufVxuXG4vKiogU3RyaWN0IHJ1bnRpbWUgdmFsaWRhdGlvbjsgSlNPTidzIFR5cGVTY3JpcHQgY2FzdHMgYXJlIG5ldmVyIHRydXN0ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVXb3JsZFNuYXBzaG90KHZhbHVlOiB1bmtub3duKTogV29ybGRTbmFwc2hvdCB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpXG4gICAgfHwgdmFsdWUuc2NoZW1hICE9PSBTTkFQU0hPVF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBERVNJR05fU05BUFNIT1RfU0NIRU1BXG4gICAgJiYgdmFsdWUuc2NoZW1hICE9PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQVxuICAgIHx8ICFpc09iamVjdCh2YWx1ZS5tYW5pZmVzdCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIG9yIG1hbGZvcm1lZCB3b3JsZCBzbmFwc2hvdCcpO1xuICB9XG4gIGNvbnN0IHNjaGVtYSA9IHZhbHVlLnNjaGVtYTtcbiAgY29uc3QgbSA9IHZhbHVlLm1hbmlmZXN0O1xuICAvLyBFdmVyeSBzdXBwb3J0ZWQgZ2VuZXJhdG9yIHJlc3RvcmVzIHdpdGggaXRzIG93biB2ZXJzaW9uOyB2MSBzYXZlcyBrZWVwXG4gIC8vIEdFTkVSQVRPUl9WRVJTSU9OIGV4YWN0bHksIHNvIHRoZWlyIG1hbmlmZXN0cyBhbmQgaGFzaGVzIGFyZSB1bmNoYW5nZWQuXG4gIGNvbnN0IHBhcmFtcyA9IHtcbiAgICBzaXplOiAyMDQ4LCBjaHVua1NpemU6IENIVU5LX1NJWkUsIHlNaW46IC0xNiwgeU1heDogMTEyLFxuICAgIHNlYUxldmVsOiAwLCBnZW5lcmF0b3JWZXJzaW9uOiBpc1N1cHBvcnRlZEdlbmVyYXRvcihtLmdlbmVyYXRvclZlcnNpb24pID8gbS5nZW5lcmF0b3JWZXJzaW9uIDogR0VORVJBVE9SX1ZFUlNJT04sXG4gIH07XG4gIGlmIChtLnNjaGVtYSAhPT0gMSB8fCAhdWludChtLnNlZWQsIDB4ZmZmZmZmZmYpXG4gICAgfHwgIWlzU3VwcG9ydGVkR2VuZXJhdG9yKG0uZ2VuZXJhdG9yVmVyc2lvbilcbiAgICB8fCBtLnNpemUgIT09IHBhcmFtcy5zaXplIHx8IG0uY2h1bmtTaXplICE9PSBwYXJhbXMuY2h1bmtTaXplXG4gICAgfHwgbS55TWluICE9PSBwYXJhbXMueU1pbiB8fCBtLnlNYXggIT09IHBhcmFtcy55TWF4IHx8IG0uc2VhTGV2ZWwgIT09IHBhcmFtcy5zZWFMZXZlbFxuICAgIHx8ICEvXlswLTlhLWZdezh9JC8udGVzdChTdHJpbmcobS5wYXJhbXNIYXNoKSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGdlbmVyYXRvciBjb25maWd1cmF0aW9uIGlzIHVuc3VwcG9ydGVkIG9yIGluY29tcGF0aWJsZScpO1xuICB9XG4gIGlmICghdWludCh2YWx1ZS5yZXZpc2lvbiwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpXG4gICAgfHwgIXVpbnQodmFsdWUubmV4dFNlcXVlbmNlLCAxMF8wMDBfMDAwKVxuICAgIHx8IHR5cGVvZiB2YWx1ZS5hdXRob3JlZFBsYWNlZCAhPT0gJ2Jvb2xlYW4nXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuZWRpdHMpIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0aWVzKVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0eVJlbW92YWxzKVxuICAgIHx8IHZhbHVlLmVudGl0aWVzLmxlbmd0aCA+IE1BWF9TTkFQU0hPVF9FTlRJVElFU1xuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0eUNodW5rcykgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuc3RydWN0dXJlcykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBpbnZhbGlkIGF1dGhvcml0YXRpdmUtc3RhdGUgZmllbGRzJyk7XG4gIH1cbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChtLnNlZWQsIHBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKTtcbiAgLy8gVGhlIG1hbmlmZXN0IGhhc2ggaXMgY2hlY2tlZCBhZ2FpbnN0IHRoZSBhY3R1YWwgcmVzdG9yZWQgY29uZmlndXJhdGlvbi5cbiAgaWYgKHdvcmxkTWFuaWZlc3Qod29ybGQpLnBhcmFtc0hhc2ggIT09IG0ucGFyYW1zSGFzaCkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBtYW5pZmVzdCBoYXNoIG1pc21hdGNoJyk7XG5cbiAgY29uc3QgZWRpdHM6IFdvcmxkU25hcHNob3RbJ2VkaXRzJ10gPSBbXTtcbiAgbGV0IGVkaXRDb3VudCA9IDA7XG4gIGNvbnN0IGNodW5rSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLmVkaXRzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICF2YWxpZENodW5rKHJhdy5jaHVuaykgfHwgY2h1bmtJZHMuaGFzKHJhdy5jaHVuaylcbiAgICAgIHx8ICFBcnJheS5pc0FycmF5KHJhdy5jZWxscykgfHwgcmF3LmNlbGxzLmxlbmd0aCA+IENIVU5LX1ZPTFVNRSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyBpbnZhbGlkIGNodW5rIGVkaXRzJyk7XG4gICAgfVxuICAgIGNvbnN0IGNlbGxJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgICBjb25zdCBjZWxsczogQXJyYXk8eyBpOiBudW1iZXI7IG06IG51bWJlciB9PiA9IFtdO1xuICAgIGZvciAoY29uc3QgY2VsbCBvZiByYXcuY2VsbHMpIHtcbiAgICAgIGlmICghaXNPYmplY3QoY2VsbCkgfHwgIXVpbnQoY2VsbC5pLCBDSFVOS19WT0xVTUUgLSAxKSB8fCBjZWxsSWRzLmhhcyhjZWxsLmkpXG4gICAgICAgIHx8ICF1aW50KGNlbGwubSwgTUFYX01BVF9JRCkpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgYW4gaW52YWxpZCB2b3hlbCBlZGl0Jyk7XG4gICAgICBjZWxsSWRzLmFkZChjZWxsLmkpO1xuICAgICAgY2VsbHMucHVzaCh7IGk6IGNlbGwuaSwgbTogY2VsbC5tIH0pO1xuICAgIH1cbiAgICBjZWxsSWRzLmNsZWFyKCk7XG4gICAgY2VsbHMuc29ydCgoYSwgYikgPT4gYS5pIC0gYi5pKTtcbiAgICBlZGl0Q291bnQgKz0gY2VsbHMubGVuZ3RoO1xuICAgIGlmIChlZGl0Q291bnQgPiBNQVhfU05BUFNIT1RfRURJVFMpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZXhjZWVkcyB0aGUgYm91bmRlZCBlZGl0IGxpbWl0Jyk7XG4gICAgY2h1bmtJZHMuYWRkKHJhdy5jaHVuayk7XG4gICAgZWRpdHMucHVzaCh7IGNodW5rOiByYXcuY2h1bmssIGNlbGxzIH0pO1xuICB9XG4gIGVkaXRzLnNvcnQoKGEsIGIpID0+IGEuY2h1bmsubG9jYWxlQ29tcGFyZShiLmNodW5rKSk7XG5cbiAgY29uc3QgZW50aXR5SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IGVudGl0aWVzID0gdmFsdWUuZW50aXRpZXMubWFwKChlKSA9PiB2YWxpZGF0ZUVudGl0eShlLCBlbnRpdHlJZHMpKTtcbiAgY29uc3QgZW50aXR5Q2h1bmtzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBnZW5lcmF0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCBrZXkgb2YgdmFsdWUuZW50aXR5Q2h1bmtzKSB7XG4gICAgaWYgKCF2YWxpZENodW5rKGtleSkgfHwgZ2VuZXJhdGVkLmhhcyhrZXkpKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGdlbmVyYXRlZC1jaHVuayBpbmRleCBpcyBpbnZhbGlkJyk7XG4gICAgZ2VuZXJhdGVkLmFkZChrZXkpO1xuICAgIGVudGl0eUNodW5rcy5wdXNoKGtleSk7XG4gIH1cbiAgZm9yIChjb25zdCBlbnRpdHkgb2YgZW50aXRpZXMpIHtcbiAgICBpZiAoIWVudGl0eS5hdXRob3JlZCAmJiAhZ2VuZXJhdGVkLmhhcyhlbnRpdHkuY2h1bmspKSB0aHJvdyBuZXcgRXJyb3IoYGVudGl0eSAke2VudGl0eS5pZH0gYmVsb25ncyB0byBhbiB1bm1hcmtlZCBjaHVua2ApO1xuICB9XG4gIGVudGl0eUNodW5rcy5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuICBjb25zdCByZW1vdmFscyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IGlkIG9mIHZhbHVlLmVudGl0eVJlbW92YWxzKSB7XG4gICAgaWYgKCF0ZXh0KGlkKSB8fCByZW1vdmFscy5oYXMoaWQpIHx8IGVudGl0eUlkcy5oYXMoaWQpIHx8ICEvXmU6XFxkKyxcXGQrOlxcZCskLy50ZXN0KGlkKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBlbnRpdHkgdG9tYnN0b25lIGlzIGludmFsaWQnKTtcbiAgICB9XG4gICAgcmVtb3ZhbHMuYWRkKGlkKTtcbiAgfVxuICBjb25zdCBlbnRpdHlSZW1vdmFscyA9IFsuLi5yZW1vdmFsc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblxuICBjb25zdCBzdHJ1Y3R1cmVJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgc3RydWN0dXJlcyA9IHZhbHVlLnN0cnVjdHVyZXMubWFwKChzKSA9PiB2YWxpZGF0ZVN0cnVjdHVyZShzLCBzdHJ1Y3R1cmVJZHMsIHNjaGVtYSkpXG4gICAgLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIGNvbnN0IGNhcnJpZWQgPSB2YWxpZGF0ZUludmVudG9yeSh2YWx1ZS5pbnZlbnRvcnkpO1xuICBpZiAoc2NoZW1hID09PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSAmJiBzdG9ja1RvdGFsKGNhcnJpZWQpID4gQ0FSUklFRF9DQVBBQ0lUWSkgdGhyb3cgbmV3IEVycm9yKCdjYXJyaWVkIGludmVudG9yeSBleGNlZWRzIGNhcGFjaXR5Jyk7XG4gIGNvbnN0IHNuYXBzaG90OiBCYXNlV29ybGRTbmFwc2hvdCA9IHtcbiAgICBzY2hlbWEsXG4gICAgbWFuaWZlc3Q6IHtcbiAgICAgIHNjaGVtYTogMSwgc2VlZDogbS5zZWVkLCBnZW5lcmF0b3JWZXJzaW9uOiBwYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICAgIHNpemU6IHBhcmFtcy5zaXplLCBjaHVua1NpemU6IHBhcmFtcy5jaHVua1NpemUsIHlNaW46IHBhcmFtcy55TWluLFxuICAgICAgeU1heDogcGFyYW1zLnlNYXgsIHNlYUxldmVsOiBwYXJhbXMuc2VhTGV2ZWwsIHBhcmFtc0hhc2g6IG0ucGFyYW1zSGFzaCxcbiAgICB9LFxuICAgIHJldmlzaW9uOiB2YWx1ZS5yZXZpc2lvbixcbiAgICBlZGl0cyxcbiAgICBlbnRpdGllcyxcbiAgICBlbnRpdHlDaHVua3MsXG4gICAgZW50aXR5UmVtb3ZhbHMsXG4gICAgaW52ZW50b3J5OiBjYXJyaWVkLFxuICAgIHN0cnVjdHVyZXMsXG4gICAgYXV0aG9yZWRQbGFjZWQ6IHZhbHVlLmF1dGhvcmVkUGxhY2VkLFxuICAgIG5leHRTZXF1ZW5jZTogdmFsdWUubmV4dFNlcXVlbmNlLFxuICB9O1xuICBjb25zdCByZXN1bHQ6IFdvcmxkU25hcHNob3QgPSBzY2hlbWEgPT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BXG4gICAgPyB7IC4uLnNuYXBzaG90LCBzY2hlbWE6IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BLCAuLi52YWxpZGF0ZUxpZmVGaWVsZHModmFsdWUpIH1cbiAgICA6IHsgLi4uc25hcHNob3QsIHNjaGVtYTogc2NoZW1hIGFzIHR5cGVvZiBTTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX1NOQVBTSE9UX1NDSEVNQSB9O1xuICBpZiAoSlNPTi5zdHJpbmdpZnkocmVzdWx0KSAhPT0gSlNPTi5zdHJpbmdpZnkodmFsdWUpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyB1bmtub3duLCBub24tY2Fub25pY2FsIG9yIGFtYmlndW91cyBmaWVsZHMnKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlV29ybGRTbmFwc2hvdChqc29uOiBzdHJpbmcpOiBXb3JsZFNuYXBzaG90IHtcbiAgaWYgKGpzb24ubGVuZ3RoID4gTUFYX1NOQVBTSE9UX0pTT05fQllURVMpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZXhjZWVkcyB0aGUgSlNPTiBzaXplIGxpbWl0Jyk7XG4gIHJldHVybiB2YWxpZGF0ZVdvcmxkU25hcHNob3QoSlNPTi5wYXJzZShqc29uKSk7XG59XG5cbi8qKiBSZXN0b3JlIGluIHBsYWNlIHNvIGNvbnRyb2xsZXJzIHJldGFpbiB0aGUgc2FtZSBXb3JsZCByZWZlcmVuY2UuIEFsbFxuICogdmFsaWRhdGlvbiBoYXBwZW5zIGJlZm9yZSBtdXRhdGlvbiwgc28gYSByZWplY3RlZCBzYXZlIGNhbm5vdCBlcmFzZSB3b3JrLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkOiBXb3JsZCwgaW5wdXQ6IFdvcmxkU25hcHNob3QpOiB2b2lkIHtcbiAgLy8gT3JkaW5hcnkgc25hcHNob3RzIGFuZCB0cmFuc2FjdGlvbmFsIHJvbGxiYWNrcyByZXN0b3JlIHRoZWlyIGV4YWN0IHJlY29yZGVkXG4gIC8vIHN0YXRlLiBSZXRpcmVkIGhpc3RvcmljYWwgZW50aXRpZXMgYXJlIHJlbW92ZWQgb25seSBhZnRlciBHYW1lU2Vzc2lvbiBoYXNcbiAgLy8gYXV0aGVudGljYXRlZCB0aGUgb3JpZ2luYWwgam91cm5hbCBhbmQgZXhwbGljaXRseSBtaWdyYXRlZCB0aGF0IHNhdmUuXG4gIGZpbmlzaFN0b25lUmVwbGF5KHdvcmxkKTtcbiAgcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCh3b3JsZCwgaW5wdXQpO1xufVxuXG4vKiogQGludGVybmFsIEhpc3RvcmljYWwgcmVjb25zdHJ1Y3Rpb24gb3IgZXhhY3QgbmV3LXNuYXBzaG90IHJlc3RvcmF0aW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3Qod29ybGQ6IFdvcmxkLCBpbnB1dDogV29ybGRTbmFwc2hvdCk6IHZvaWQge1xuICBjb25zdCBzbmFwc2hvdCA9IHZhbGlkYXRlV29ybGRTbmFwc2hvdChpbnB1dCk7XG4gIGlmIChzbmFwc2hvdC5tYW5pZmVzdC5zZWVkICE9PSB3b3JsZC5zZWVkKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IHNlZWQgZG9lcyBub3QgbWF0Y2ggdGhlIHdvcmxkJyk7XG4gIHdvcmxkLnBhcmFtcyA9IHtcbiAgICBzaXplOiBzbmFwc2hvdC5tYW5pZmVzdC5zaXplLFxuICAgIGNodW5rU2l6ZTogc25hcHNob3QubWFuaWZlc3QuY2h1bmtTaXplLFxuICAgIHlNaW46IHNuYXBzaG90Lm1hbmlmZXN0LnlNaW4sXG4gICAgeU1heDogc25hcHNob3QubWFuaWZlc3QueU1heCxcbiAgICBzZWFMZXZlbDogc25hcHNob3QubWFuaWZlc3Quc2VhTGV2ZWwsXG4gICAgZ2VuZXJhdG9yVmVyc2lvbjogc25hcHNob3QubWFuaWZlc3QuZ2VuZXJhdG9yVmVyc2lvbixcbiAgfTtcbiAgd29ybGQuY2h1bmtzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0aWVzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eUNodW5rcy5jbGVhcigpO1xuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eVJlbW92YWxzLmNsZWFyKCk7XG4gIHdvcmxkLnN0cnVjdHVyZXMuY2xlYXIoKTtcbiAgd29ybGQuZWRpdHMuY2xlYXIoKTtcbiAgd29ybGQuaW52ZW50b3J5ID0geyAuLi5zbmFwc2hvdC5pbnZlbnRvcnkgfTtcbiAgd29ybGQubGlmZSA9IHNuYXBzaG90LnNjaGVtYSA9PT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgPyBjcmVhdGVMaWZlU3RhdGUoKSA6IHVuZGVmaW5lZDtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgc25hcHNob3Quc2NoZW1hID09PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSkge1xuICAgIHdvcmxkLmxpZmUudGljayA9IHNuYXBzaG90LnRpY2s7XG4gICAgZm9yIChjb25zdCBzIG9mIHNuYXBzaG90LnN0b2NrcGlsZXMpIHdvcmxkLmxpZmUuc3RvY2twaWxlcy5zZXQocy5pZCwgeyAuLi5zLCBpbnZlbnRvcnk6IHsgLi4ucy5pbnZlbnRvcnkgfSB9KTtcbiAgICBmb3IgKGNvbnN0IGogb2Ygc25hcHNob3Quam9icykgd29ybGQubGlmZS5qb2JzLnNldChqLmlkLCB7IC4uLmogfSk7XG4gICAgZm9yIChjb25zdCBjIG9mIHNuYXBzaG90LmNyb3BzKSB3b3JsZC5saWZlLmNyb3BzLnNldChjLmlkLCB7IC4uLmMgfSk7XG4gIH1cbiAgd29ybGQuZGlydHkuY2xlYXIoKTtcbiAgd29ybGQuc2l0ZXMgPSBbXTtcbiAgd29ybGQuc3RhdHMgPSB7XG4gICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICBlbnRpdGllczogc25hcHNob3QuZW50aXRpZXMubGVuZ3RoLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gIH07XG4gIHdvcmxkLnJldmlzaW9uID0gc25hcHNob3QucmV2aXNpb247XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gc25hcHNob3QuYXV0aG9yZWRQbGFjZWQ7XG4gIGZvciAoY29uc3Qga2V5IG9mIHNuYXBzaG90LmVudGl0eUNodW5rcykgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcbiAgLy8gQXBwbHkgZHVyYWJsZSB2b3hlbCBlZGl0cyBiZWZvcmUgYW55IGF1dGhvcmVkLXNpdGUgcXVlcnkgY2FuIGdlbmVyYXRlIGFcbiAgLy8gY2h1bmsuIE90aGVyd2lzZSB0aG9zZSBjaHVua3MgY2FjaGUgdGhlIHVuZWRpdGVkIGJhc2UgdGVycmFpbiBwZXJtYW5lbnRseS5cbiAgZm9yIChjb25zdCBkZWx0YSBvZiBzbmFwc2hvdC5lZGl0cykge1xuICAgIHdvcmxkLmVkaXRzLnNldChkZWx0YS5jaHVuaywgbmV3IE1hcChkZWx0YS5jZWxscy5tYXAoKGUpID0+IFtlLmksIGUubSBhcyBNYXRJZF0pKSk7XG4gIH1cbiAgbWFya0VkaXRzQ2hhbmdlZCh3b3JsZCk7XG4gIC8vIFJlY3JlYXRlIGF1dGhvcmVkIHNpdGUgcmVjb3Jkcy4gU3VwcHJlc3MgdGhlaXIgZW50aXR5IHBsYWNlbWVudCBzbyB0aGVcbiAgLy8gZXhhY3Qgc2F2ZWQgZW50aXR5IHJlY29yZHMgYmVsb3cgY2Fubm90IGJlIGFmZmVjdGVkIGJ5IGEgbW9kaWZpZWQgY2h1bmsuXG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkge1xuICAgIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gZmFsc2U7XG4gICAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG4gIH1cbiAgLy8gQXV0aG9yZWQgcGxhY2VtZW50IGRlcml2ZXMgc2l0ZS9lbnRpdHkgc2NhZmZvbGRpbmcgYW5kIG1heSBhZHZhbmNlIHRoZVxuICAvLyByZXZpc2lvbi4gVGhlIHNhdmVkIHJldmlzaW9uIGlzIHJlc3RvcmVkIG9ubHkgYWZ0ZXIgdGhhdCBkZXJpdmVkIHdvcmsuXG4gIHdvcmxkLnJldmlzaW9uID0gc25hcHNob3QucmV2aXNpb247XG4gIC8vIFRvbWJzdG9uZXMgbXVzdCBleGlzdCBiZWZvcmUgYW55IGNoYW5nZWQgY2h1bmsgcmVnZW5lcmF0ZXMgaXRzIGVudGl0aWVzLlxuICBmb3IgKGNvbnN0IGlkIG9mIHNuYXBzaG90LmVudGl0eVJlbW92YWxzKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoaWQpO1xuICAvLyBSZXBsYWNlIGdlbmVyYXRlZCBlbnRpdGllcyB3aXRoIHRoZSBleGFjdCBzYXZlZCByZWNvcmRzLCBpbmNsdWRpbmdcbiAgLy8gaGFydmVzdGVkL3JlbW92ZWQgb25lcy5cbiAgd29ybGQuZW50aXRpZXMuY2xlYXIoKTtcbiAgd29ybGQuZW50aXR5Q2h1bmtzLmNsZWFyKCk7XG4gIC8vIEluc3RhbGwgcGVyc2lzdGVkIGVudGl0eSBkZWx0YXMgZGlyZWN0bHkuIFRoaXMgaXMgcmVjb25zdHJ1Y3Rpb24sIG5vdCBhXG4gIC8vIGNvbW1hbmQ6IHJlbW92ZUVudGl0eSB3b3VsZCBjcmVhdGUgZnJlc2ggdG9tYnN0b25lcyBhbmQgYWR2YW5jZSByZXZpc2lvbi5cbiAgZm9yIChjb25zdCBrZXkgb2Ygc25hcHNob3QuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgc25hcHNob3QgcmVmZXJlbmNlcyB1bmF2YWlsYWJsZSBjaHVuayAke2tleX1gKTtcbiAgICBjb25zdCBzYXZlZCA9IG5ldyBTZXQoc25hcHNob3QuZW50aXRpZXMuZmlsdGVyKChlKSA9PiBlLmNodW5rID09PSBrZXkpLm1hcCgoZSkgPT4gZS5pZCkpO1xuICAgIC8vIEF1dGhvcmVkIGVudGl0aWVzIGZvciB0aGUgc2FtZSBjaHVuayBzdXJ2aXZlIGFsb25nc2lkZSBuYXR1cmFsIGRlbHRhcy5cbiAgICBjb25zdCBpZHMgPSAod29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdKS5maWx0ZXIoKGlkKSA9PiB7XG4gICAgICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgcmV0dXJuICFpZC5zdGFydHNXaXRoKCdlOicpICYmICEhZW50aXR5XG4gICAgICAgICYmICghaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSB8fCBpc1N0b25lUmVwbGF5KHdvcmxkKSk7XG4gICAgfSk7XG4gICAgZm9yIChjb25zdCBpZCBvZiBbLi4ud29ybGQuZW50aXRpZXMua2V5cygpXSkge1xuICAgICAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmIChlbnRpdHk/LmNodW5rID09PSBrZXkgJiYgIWVudGl0eS5hdXRob3JlZCAmJiAhc2F2ZWQuaGFzKGlkKSkgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBpZCBvZiBzYXZlZCkgaWYgKCFpZHMuaW5jbHVkZXMoaWQpKSBpZHMucHVzaChpZCk7XG4gICAgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGlkcyk7XG4gIH1cbiAgZm9yIChjb25zdCBlIG9mIHNuYXBzaG90LmVudGl0aWVzKSB7XG4gICAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGNsb25lRW50aXR5KGUpKTtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBvZiBzbmFwc2hvdC5lbnRpdHlDaHVua3MpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgfVxuICBmb3IgKGNvbnN0IHMgb2Ygc25hcHNob3Quc3RydWN0dXJlcykgd29ybGQuc3RydWN0dXJlcy5zZXQocy5pZCwgY2xvbmVTdHJ1Y3R1cmUocykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ybGRGcm9tU25hcHNob3Qoc25hcHNob3Q6IFdvcmxkU25hcHNob3QpOiBXb3JsZCB7XG4gIGNvbnN0IHZhbGlkID0gdmFsaWRhdGVXb3JsZFNuYXBzaG90KHNuYXBzaG90KTtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCh2YWxpZC5tYW5pZmVzdC5zZWVkLCB2YWxpZC5tYW5pZmVzdC5nZW5lcmF0b3JWZXJzaW9uKTtcbiAgcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQsIHZhbGlkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuXG4vKiogUmF3IG9sZCBzdGF0ZSBpcyB1c2VkIG9ubHkgd2hpbGUgdmFsaWRhdGluZyBhIHJlY29yZGVkIGFjY2VwdGVkIGpvdXJuYWwuICovXG5leHBvcnQgZnVuY3Rpb24gaGlzdG9yaWNhbFdvcmxkRnJvbVNuYXBzaG90KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90KTogV29ybGQge1xuICBjb25zdCB2YWxpZCA9IHZhbGlkYXRlV29ybGRTbmFwc2hvdChzbmFwc2hvdCk7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQodmFsaWQubWFuaWZlc3Quc2VlZCk7XG4gIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkKTtcbiAgcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCh3b3JsZCwgdmFsaWQpO1xuICByZXR1cm4gd29ybGQ7XG59XG4iLCAiLy8gTTAwMiBwbGF5YWJsZSBmaXJzdCBzbGljZSBcdTIwMTQgdGhlIHRocmVlIGF1dGhvcmVkIHByb2plY3RzIGFzIHBsYWluIGRhdGEuXG4vL1xuLy8gVGhpcyBtb2R1bGUgaXMgZGVsaWJlcmF0ZWx5IERPTS1mcmVlLiBUaGUgYnVpbGQgc2lkZWJhciwgdGhlIGdob3N0IHByZXZpZXdcbi8vIGFuZCB0aGUgdGVzdHMgYWxsIHJlYWQgdGhlIHNhbWUgZGVmaW5pdGlvbnMgYW5kIGNhbGwgdGhlIHNhbWUgc2ltdWxhdGlvblxuLy8gZW50cnkgcG9pbnRzOyBhIHByb2plY3QgY2Fubm90IGFkdmVydGlzZSBvbmUgZm9vdHByaW50LCBwcmljZSBvciBwcmVwYXJhdGlvblxuLy8gc3RlcCBhbmQgdGhlbiBleGVjdXRlIGFub3RoZXIuXG5pbXBvcnQgeyBNQVQsIFdvcmxkLCBSZXNvdXJjZVR5cGUgfSBmcm9tICcuLi9zaW0vd29ybGQnO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4uL3NpbS90ZXJyYWluJztcbmltcG9ydCB7XG4gIEJ1aWxkaW5nUnVsZXMsIEhPVVNFX1JVTEVTLCBQQVRIX1JVTEVTLCBGQVJNX1JVTEVTLFxuICBTaXRlUHJvcG9zYWwsIFNpdGVQcmV2aWV3LCBTaXRlU3RhdGUsIFZhbGlkYXRpb25SZWFzb24sIHByZXZpZXdTaXRlLFxufSBmcm9tICcuLi9zaW0vY29uc3RydWN0aW9uJztcbmltcG9ydCB7XG4gIE0wMDJfTEFZT1VULCBNMDAyX1BBVEhfU0lURV9JRCwgTTAwMl9URVJSQUNFX0JBTkRTLFxufSBmcm9tICcuLi9zaW0vbTAwMic7XG5pbXBvcnQge1xuICBtMDAyRmFybVRhcmdldHMsIG0wMDJQYXRoUmVjdCwgbTAwMlBhdGhUYXJnZXRzLFxufSBmcm9tICcuLi9zaW0vc2NlbmFyaW8nO1xuaW1wb3J0IHtcbiAgQ29sdW1uVGFyZ2V0LCBMb2NhbEF1dGhvcml6ZXIsIFByZXBhcmF0aW9uTGVkZ2VyLCBQcmVwYXJhdGlvbk9wdGlvbnMsXG4gIFBsYW5SZXN1bHQsIHBsYW5QcmVwYXJhdGlvbiwgcHJlcGFyZVNpdGUsXG59IGZyb20gJy4uL3NpbS9wcmVwYXJhdGlvbic7XG5pbXBvcnQgeyBjcmVhdGVXb3JsZFNuYXBzaG90LCByZXN0b3JlV29ybGRTbmFwc2hvdCB9IGZyb20gJy4uL3NpbS9zbmFwc2hvdCc7XG5cbmltcG9ydCB7XG4gIEhPVVNFX0NPU1QsIFRFUlJBQ0VfQ09TVCwgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLCBTdHJ1Y3R1cmUsXG4gIFN0cnVjdHVyZUtpbmQsIFN0cnVjdHVyZUxlZGdlciwgU3RydWN0dXJlUHJvcG9zYWwsIFN0cnVjdHVyZURlc2lnblZlcnNpb24sXG4gIGJ1aWxkU3RydWN0dXJlLCBwYXRoQ29zdCxcbn0gZnJvbSAnLi4vc2ltL3N0cnVjdHVyZXMnO1xuXG5leHBvcnQgdHlwZSBNMlByb2plY3RJZCA9ICdob3VzZScgfCAncGF0aCcgfCAnZmFybSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTJHaG9zdEJhbmQge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTJQcm9qZWN0IHtcbiAgaWQ6IE0yUHJvamVjdElkO1xuICBuYW1lOiBzdHJpbmc7XG4gIHN1YnRpdGxlOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGRvb3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICB0ZXJyYWNlcz86IG51bWJlcjtcbiAgcHJlcDogUHJlcGFyYXRpb25PcHRpb25zO1xuICBnaG9zdEJhbmRzPzogcmVhZG9ubHkgTTJHaG9zdEJhbmRbXTtcbn1cblxuY29uc3QgcGF0aFJlY3QgPSBtMDAyUGF0aFJlY3QoKTtcbmNvbnN0IHBhdGhUYXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IG0wMDJQYXRoVGFyZ2V0cygpO1xuY29uc3QgZmFybVRhcmdldHM6IENvbHVtblRhcmdldFtdID0gbTAwMkZhcm1UYXJnZXRzKCk7XG5cbi8qKlxuICogVGhlIGZpcnN0IHBsYXlhYmxlIHNsaWNlIGluIHRoZSBwaW5uZWQgb3JkZXI6IGEgaG91c2Ugb24gdGhlIHByZXBhcmVkIHNoZWxmLFxuICogYSBzdGVwcGVkIHBhdGggZnJvbSBpdHMgZG9vciwgYW5kIGEgdGVycmFjZWQgZmllbGQgb24gdGhlIHNsb3BlIGJlbG93LlxuICovXG5leHBvcnQgY29uc3QgTTJfUFJPSkVDVFM6IHJlYWRvbmx5IE0yUHJvamVjdFtdID0gW1xuICB7XG4gICAgaWQ6ICdob3VzZScsXG4gICAgbmFtZTogXCJGb3VuZGVyJ3MgaG91c2VcIixcbiAgICBzdWJ0aXRsZTogJzggeCA2IG0gXHUwMEI3IGZsYXQgc3RvbmUgc2hlbGYnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSAxOS1tb2R1bGUgZm91bmRlciBjYW5kaWRhdGUgdXNlcyBhIGZsYXQgc3RvbmUgZm91bmRhdGlvbiwgYSAzLjIgbSBzdG9yZXksIGEgcmVhbCBlYXN0IGRvb3J3YXkgJ1xuICAgICAgKyAnYW5kIHR3byBvcGVuIHNvdXRoIHdpbmRvd3MuIFN0cnVjdHVyYWwgd2FsbCB2b2lkcyByZXF1aXJlIG1vcmUgcHJpbWl0aXZlcyB0aGFuIHRoZSBwcm92aXNpb25hbCAnXG4gICAgICArICdhc3NldC12b2x1bWUgdGFyZ2V0OyB0aGlzIGRlc2lnbiByZW1haW5zIHN1YmplY3QgdG8gYXJ0IHJldmlldy4nLFxuICAgIHNpdGVJZDogTTAwMl9MQVlPVVQuaG91c2UuaWQsXG4gICAga2luZDogJ2hvdXNlJyxcbiAgICByZWN0OiBNMDAyX0xBWU9VVC5ob3VzZS5yZWN0LFxuICAgIGZsb29yWTogTTAwMl9MQVlPVVQuaG91c2UuZmxvb3JZLFxuICAgIHJ1bGVzOiBIT1VTRV9SVUxFUyxcbiAgICBjb3N0OiB7IC4uLkhPVVNFX0NPU1QgfSxcbiAgICBkb29yOiBNMDAyX0xBWU9VVC5ob3VzZS5kb29yLFxuICAgIGFwcHJvYWNoOiBNMDAyX0xBWU9VVC5ob3VzZS5hcHByb2FjaCxcbiAgICBwcmVwOiB7fSxcbiAgfSxcbiAge1xuICAgIGlkOiAncGF0aCcsXG4gICAgbmFtZTogJ0Rvb3IgcGF0aCcsXG4gICAgc3VidGl0bGU6ICc5IHggMyBtIFx1MDBCNyBzdGVwcGVkIGdyYXZlbCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnQSBuaW5lLW1ldHJlIGNvcnJpZG9yIGZyb20gdGhlIGhvdXNlIGRvb3IgdG8gdGhlIGFwcHJvYWNoLiAnXG4gICAgICArICdFYWNoIGNvbHVtbiBpcyBjdXQgdG8gYSBwaW5uZWQgcHJvZmlsZSBzbyB0aGUgcmlzZSBzdGF5cyB3YWxrYWJsZS4nLFxuICAgIHNpdGVJZDogTTAwMl9QQVRIX1NJVEVfSUQsXG4gICAga2luZDogJ3BhdGgnLFxuICAgIHJlY3Q6IHBhdGhSZWN0LFxuICAgIGZsb29yWTogMTIsXG4gICAgcnVsZXM6IFBBVEhfUlVMRVMsXG4gICAgY29zdDogcGF0aENvc3QocGF0aFJlY3QueDEgLSBwYXRoUmVjdC54MCArIDEpLFxuICAgIHByZXA6IHtcbiAgICAgIHRhcmdldHM6IHBhdGhUYXJnZXRzLFxuICAgICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuR1JBVkVMLFxuICAgICAgZW52ZWxvcGU6IFtNMDAyX0xBWU9VVC5lbnZlbG9wZVsxXV0sXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIGlkOiAnZmFybScsXG4gICAgbmFtZTogJ1RlcnJhY2VkIGZpZWxkJyxcbiAgICBzdWJ0aXRsZTogJzEyIHggOCBtIFx1MDBCNyB0aHJlZSBiYW5kcycsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhyZWUgc29pbCB0ZXJyYWNlcyBzdGVwcGluZyBkb3duIHRoZSBzbG9wZSwgaGVsZCBieSBzdG9uZSByZXRhaW5pbmcgd2FsbHMuICdcbiAgICAgICsgJ1RoZSBibG9zc29tIHRyZWUgb24gdGhlIGZpZWxkIGlzIGNsZWFyZWQgZHVyaW5nIHByZXBhcmF0aW9uLicsXG4gICAgc2l0ZUlkOiBNMDAyX0xBWU9VVC5mYXJtLmlkLFxuICAgIGtpbmQ6ICd0ZXJyYWNlJyxcbiAgICByZWN0OiBNMDAyX0xBWU9VVC5mYXJtLnJlY3QsXG4gICAgZmxvb3JZOiAxNSxcbiAgICBydWxlczogRkFSTV9SVUxFUyxcbiAgICBjb3N0OiB7IC4uLlRFUlJBQ0VfQ09TVCB9LFxuICAgIHRlcnJhY2VzOiBNMDAyX0xBWU9VVC5mYXJtLnRlcnJhY2VzLFxuICAgIHByZXA6IHtcbiAgICAgIHRhcmdldHM6IGZhcm1UYXJnZXRzLFxuICAgICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuU09JTCxcbiAgICAgIGVudmVsb3BlOiBbTTAwMl9MQVlPVVQuZW52ZWxvcGVbMl1dLFxuICAgIH0sXG4gICAgZ2hvc3RCYW5kczogTTAwMl9URVJSQUNFX0JBTkRTLFxuICB9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RCeUlkKGlkOiBNMlByb2plY3RJZCk6IE0yUHJvamVjdCB7XG4gIGNvbnN0IHByb2plY3QgPSBNMl9QUk9KRUNUUy5maW5kKChwKSA9PiBwLmlkID09PSBpZCk7XG4gIGlmICghcHJvamVjdCkgdGhyb3cgbmV3IEVycm9yKGB1bmtub3duIE0wMDIgcHJvamVjdDogJHtpZH1gKTtcbiAgcmV0dXJuIHByb2plY3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0U2l0ZVByb3Bvc2FsKHByb2plY3Q6IE0yUHJvamVjdCk6IFNpdGVQcm9wb3NhbCB7XG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9qZWN0LnNpdGVJZCxcbiAgICByZWN0OiBwcm9qZWN0LnJlY3QsXG4gICAgZmxvb3JZOiBwcm9qZWN0LmZsb29yWSxcbiAgICBydWxlczogcHJvamVjdC5ydWxlcyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RTdHJ1Y3R1cmVQcm9wb3NhbChcbiAgcHJvamVjdDogTTJQcm9qZWN0LCBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbixcbik6IFN0cnVjdHVyZVByb3Bvc2FsIHtcbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb2plY3Quc2l0ZUlkLFxuICAgIGtpbmQ6IHByb2plY3Qua2luZCxcbiAgICByZWN0OiBwcm9qZWN0LnJlY3QsXG4gICAgZmxvb3JZOiBwcm9qZWN0LmZsb29yWSxcbiAgICBkb29yOiBwcm9qZWN0LmRvb3IsXG4gICAgYXBwcm9hY2g6IHByb2plY3QuYXBwcm9hY2gsXG4gICAgdGVycmFjZXM6IHByb2plY3QudGVycmFjZXMsXG4gICAgLi4uKGRlc2lnblZlcnNpb24gPT09IHVuZGVmaW5lZCA/IHt9IDogeyBkZXNpZ25WZXJzaW9uIH0pLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQcm9qZWN0QnVpbHQod29ybGQ6IFdvcmxkLCBwcm9qZWN0OiBNMlByb2plY3QpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCBzdHJ1Y3R1cmUgb2Ygd29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKSkge1xuICAgIGlmIChzdHJ1Y3R1cmUuc2l0ZUlkID09PSBwcm9qZWN0LnNpdGVJZCAmJiBzdHJ1Y3R1cmUua2luZCA9PT0gcHJvamVjdC5raW5kKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2luZ1Jlc291cmNlIHtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZTtcbiAgbmVlZDogbnVtYmVyO1xuICBoYXZlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtaXNzaW5nUmVzb3VyY2VzKHdvcmxkOiBXb3JsZCwgcHJvamVjdDogTTJQcm9qZWN0KTogTWlzc2luZ1Jlc291cmNlW10ge1xuICBjb25zdCBtaXNzaW5nOiBNaXNzaW5nUmVzb3VyY2VbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhwcm9qZWN0LmNvc3QpKSB7XG4gICAgY29uc3QgbmVlZCA9IGFtb3VudCA/PyAwO1xuICAgIGNvbnN0IGhhdmUgPSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDA7XG4gICAgaWYgKGhhdmUgPCBuZWVkKSBtaXNzaW5nLnB1c2goeyByZXNvdXJjZTogcmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlLCBuZWVkLCBoYXZlIH0pO1xuICB9XG4gIHJldHVybiBtaXNzaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2plY3RJbnNwZWN0aW9uIHtcbiAgcHJvamVjdElkOiBNMlByb2plY3RJZDtcbiAgYnVpbHQ6IGJvb2xlYW47XG4gIGFmZm9yZGFibGU6IGJvb2xlYW47XG4gIG1pc3Npbmc6IE1pc3NpbmdSZXNvdXJjZVtdO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW107XG4gIHByZXZpZXc6IFNpdGVQcmV2aWV3O1xuICBwbGFuOiBQbGFuUmVzdWx0O1xuICBjYW5CdWlsZDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZWFkLW9ubHkgaW5zcGVjdGlvbiBmb3IgdGhlIGdob3N0IGFuZCBzaWRlYmFyLiBJdCBydW5zIHRoZSBzYW1lIHZhbGlkYXRvclxuICogYW5kIHRoZSBzYW1lIHByZXBhcmF0aW9uIHBsYW5uZXIgdGhlIGJ1aWxkIGJ1dHRvbiB3aWxsIHJ1bi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluc3BlY3RQcm9qZWN0KHdvcmxkOiBXb3JsZCwgcHJvamVjdDogTTJQcm9qZWN0KTogUHJvamVjdEluc3BlY3Rpb24ge1xuICBjb25zdCBwcm9wb3NhbCA9IHByb2plY3RTaXRlUHJvcG9zYWwocHJvamVjdCk7XG4gIGNvbnN0IHByZXZpZXcgPSBwcmV2aWV3U2l0ZSh3b3JsZCwgcHJvcG9zYWwsIHtcbiAgICBkb29yOiBwcm9qZWN0LmRvb3IsXG4gICAgYXBwcm9hY2g6IHByb2plY3QuYXBwcm9hY2gsXG4gIH0pO1xuICBjb25zdCBwbGFuID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBwcm9wb3NhbCwgcHJvamVjdC5wcmVwKTtcbiAgY29uc3QgYnVpbHQgPSBpc1Byb2plY3RCdWlsdCh3b3JsZCwgcHJvamVjdCk7XG4gIGNvbnN0IG1pc3NpbmcgPSBtaXNzaW5nUmVzb3VyY2VzKHdvcmxkLCBwcm9qZWN0KTtcbiAgY29uc3Qgc3RhdGUgPSBwbGFuLm9rID8gcGxhbi52YWxpZGF0aW9uLnN0YXRlIDogcHJldmlldy5zdGF0ZTtcbiAgY29uc3QgcmVhc29ucyA9IHBsYW4ub2sgPyBwbGFuLnZhbGlkYXRpb24ucmVhc29ucyA6IHByZXZpZXcucmVhc29ucztcblxuICByZXR1cm4ge1xuICAgIHByb2plY3RJZDogcHJvamVjdC5pZCxcbiAgICBidWlsdCxcbiAgICBhZmZvcmRhYmxlOiBtaXNzaW5nLmxlbmd0aCA9PT0gMCxcbiAgICBtaXNzaW5nLFxuICAgIHN0YXRlLFxuICAgIHJlYXNvbnMsXG4gICAgcHJldmlldyxcbiAgICBwbGFuLFxuICAgIGNhbkJ1aWxkOiAhYnVpbHQgJiYgbWlzc2luZy5sZW5ndGggPT09IDAgJiYgcGxhbi5vayAmJiBzdGF0ZSAhPT0gJ2ludmFsaWQnLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2plY3RCdWlsZFN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcHJvamVjdDogTTJQcm9qZWN0O1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25MZWRnZXI7XG4gIHN0cnVjdHVyZTogU3RydWN0dXJlTGVkZ2VyO1xuICByZWNvcmQ6IFN0cnVjdHVyZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0QnVpbGRGYWlsdXJlIHtcbiAgb2s6IGZhbHNlO1xuICBwcm9qZWN0OiBNMlByb2plY3Q7XG4gIHN0YWdlOiAncHJlY2hlY2snIHwgJ3ByZXBhcmUnIHwgJ3N0cnVjdHVyZSc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG4gIHByZXBhcmF0aW9uPzogUHJlcGFyYXRpb25MZWRnZXI7XG4gIC8qKiBGYWlsZWQgYnVpbGRzIHJvbGwgYmFjayB0aGUgZW50aXJlIGF1dGhvcml0YXRpdmUgcHJlLWJ1aWxkIHNuYXBzaG90LiAqL1xuICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlO1xuICByZXRyeWFibGU6IHRydWU7XG59XG5cbmV4cG9ydCB0eXBlIFByb2plY3RCdWlsZFJlc3VsdCA9IFByb2plY3RCdWlsZFN1Y2Nlc3MgfCBQcm9qZWN0QnVpbGRGYWlsdXJlO1xuXG4vKipcbiAqIFByZXBhcmUgdGhlIHNpdGUgYW5kIGNvbnN0cnVjdCB0aGUgcHJvamVjdCB0aHJvdWdoIHRoZSBhdXRob3JpemVkIHBpcGVsaW5lLlxuICogVGhlIHJlc291cmNlIGNoZWNrIGhhcHBlbnMgYmVmb3JlIGFueSB0ZXJyYWluIGVkaXQsIHNvIGFuIHVuYWZmb3JkYWJsZSBidWlsZFxuICogY2Fubm90IGxlYXZlIGEgZ3JhZGVkIHBhZCBiZWhpbmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFByb2plY3QoXG4gIHdvcmxkOiBXb3JsZCxcbiAgcHJlcEF1dGhvcml6ZXI6IExvY2FsQXV0aG9yaXplcixcbiAgc3RydWN0dXJlQXV0aG9yaXplcjogTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLFxuICBwcm9qZWN0OiBNMlByb2plY3QsXG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uLFxuKTogUHJvamVjdEJ1aWxkUmVzdWx0IHtcbiAgaWYgKGlzUHJvamVjdEJ1aWx0KHdvcmxkLCBwcm9qZWN0KSkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAncHJlY2hlY2snLCBjb2RlOiAnYWxyZWFkeV9idWlsdCcsXG4gICAgICByZWFzb25zOiBbYCR7cHJvamVjdC5uYW1lfSBpcyBhbHJlYWR5IGJ1aWx0YF0sXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuICBjb25zdCBtaXNzaW5nID0gbWlzc2luZ1Jlc291cmNlcyh3b3JsZCwgcHJvamVjdCk7XG4gIGlmIChtaXNzaW5nLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3ByZWNoZWNrJywgY29kZTogJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnLFxuICAgICAgcmVhc29uczogbWlzc2luZy5tYXAoKG0pID0+IGBuZWVkICR7bS5uZWVkfSAke20ucmVzb3VyY2V9LCBoYXZlICR7bS5oYXZlfWApLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBiZWZvcmUgPSBjcmVhdGVXb3JsZFNuYXBzaG90KHdvcmxkLCAwKTtcbiAgY29uc3QgcHJlcGFyZWQgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHByb2plY3RTaXRlUHJvcG9zYWwocHJvamVjdCksIHByb2plY3QucHJlcCk7XG4gIGlmICghcHJlcGFyZWQub2spIHtcbiAgICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgYmVmb3JlKTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3ByZXBhcmUnLCBjb2RlOiBwcmVwYXJlZC5jb2RlLFxuICAgICAgcmVhc29uczogWy4uLnByZXBhcmVkLnJlYXNvbnMsICdObyBwcmVwYXJhdGlvbiwgcmVzb3VyY2Ugb3IgZW50aXR5IGNoYW5nZXMgd2VyZSByZXRhaW5lZC4nXSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgYnVpbHQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwgcHJvamVjdFN0cnVjdHVyZVByb3Bvc2FsKHByb2plY3QsIGRlc2lnblZlcnNpb24pKTtcbiAgaWYgKCFidWlsdC5vaykge1xuICAgIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkLCBiZWZvcmUpO1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAnc3RydWN0dXJlJywgY29kZTogYnVpbHQuY29kZSxcbiAgICAgIHJlYXNvbnM6IFsuLi5idWlsdC5yZWFzb25zLFxuICAgICAgICAnQWxsIHByZXBhcmF0aW9uLCByZXNvdXJjZSBhbmQgZW50aXR5IGNoYW5nZXMgd2VyZSByb2xsZWQgYmFjazsgdGhlIGJ1aWxkIGNhbiBiZSByZXRyaWVkLiddLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICBjb25zdCByZWNvcmQgPSB3b3JsZC5zdHJ1Y3R1cmVzLmdldChidWlsdC5sZWRnZXIuc3RydWN0dXJlSWQpO1xuICBpZiAoIXJlY29yZCkge1xuICAgIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkLCBiZWZvcmUpO1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAnc3RydWN0dXJlJywgY29kZTogJ21pc3NpbmdfcmVjb3JkJyxcbiAgICAgIHJlYXNvbnM6IFsnc3RydWN0dXJlIGxlZGdlciB3YXMgd3JpdHRlbiBidXQgdGhlIHdvcmxkIGhhcyBubyByZWNvcmQnLFxuICAgICAgICAnQWxsIHByZXBhcmF0aW9uLCByZXNvdXJjZSBhbmQgZW50aXR5IGNoYW5nZXMgd2VyZSByb2xsZWQgYmFjazsgdGhlIGJ1aWxkIGNhbiBiZSByZXRyaWVkLiddLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIHByb2plY3QsXG4gICAgcHJlcGFyYXRpb246IHByZXBhcmVkLmxlZGdlcixcbiAgICBzdHJ1Y3R1cmU6IGJ1aWx0LmxlZGdlcixcbiAgICByZWNvcmQsXG4gIH07XG59XG4iLCAiLy8gVGhlIHNvbGUgd3JpdGUgYm91bmRhcnkgZm9yIHRoZSBwbGF5YWJsZSBNMDAyIHNsaWNlLiBBY2NlcHRlZCBjb21tYW5kcyBhcmVcbi8vIGR1cmFibGUgaW5wdXQ7IHJlamVjdGVkIGF0dGVtcHRzLCByZW5kZXJlciB3b3JrIGFuZCB0ZXJyYWluIHF1ZXJpZXMgYXJlIG5vdC5cbmltcG9ydCB7XG4gIFJlc291cmNlVHlwZSwgV29ybGQsIGNyZWF0ZVdvcmxkLCBnZW5lcmF0ZVdvcmxkLCBoYXJ2ZXN0RW50aXR5LCBwbGFjZUF1dGhvcmVkU2l0ZXMsXG4gIHJldGlyZVN0b25lRW50aXRpZXMsIGlzUmV0aXJlZFN0b25lS2luZCwgR0VORVJBVE9SX1ZFUlNJT04sIEdFTkVSQVRPUl9WMixcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IE0wMDJfTEFZT1VUIH0gZnJvbSAnLi4vc2ltL20wMDInO1xuaW1wb3J0IHsgTG9jYWxBdXRob3JpemVyIH0gZnJvbSAnLi4vc2ltL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7IExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9IGZyb20gJy4uL3NpbS9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7IE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkgfSBmcm9tICcuLi9zaW0vc2NlbmFyaW8nO1xuaW1wb3J0IHtcbiAgV29ybGRTbmFwc2hvdCwgY2Fub25pY2FsV29ybGRIYXNoLCBjcmVhdGVXb3JsZFNuYXBzaG90LFxuICBsZWdhY3lTdG9uZUhhc2gsIG1pZ3JhdGVTdG9uZVNuYXBzaG90LCByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0LCB2YWxpZGF0ZVdvcmxkU25hcHNob3QsIHdvcmxkRnJvbVNuYXBzaG90LFxufSBmcm9tICcuLi9zaW0vc25hcHNob3QnO1xuaW1wb3J0IHsgZW5hYmxlU3RvbmVSZXBsYXksIGZpbmlzaFN0b25lUmVwbGF5IH0gZnJvbSAnLi4vc2ltL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQgeyBNMlByb2plY3RJZCwgYnVpbGRQcm9qZWN0LCBwcm9qZWN0QnlJZCB9IGZyb20gJy4vcHJvamVjdHMnO1xuaW1wb3J0IHtcbiAgQ1JPUF9HUk9XVEhfVElDS1MsIENST1BfWUlFTEQsIEZPVU5ERVJfU1RPQ0tQSUxFX0lELCBMSUZFX1JFU09VUkNFUywgTUFYX1RJQ0tTX1BFUl9DT01NQU5ELCBMaWZlUmVzb3VyY2UsIExpZmVSZXNvdXJjZUJhZywgUkVDSVBFUywgUmVjaXBlSWQsXG4gIGFkdmFuY2VUaWNrcywgY3JlYXRlTGlmZVN0YXRlLCBoYXJ2ZXN0Q3JvcCwgcGxhbnRDcm9wLCBzdGFydFByb2R1Y3Rpb24sIHRyYW5zZmVyLFxufSBmcm9tICcuLi9zaW0vZWNvbm9teSc7XG5cbmV4cG9ydCBjb25zdCBKT1VSTkFMX1NDSEVNQSA9IDEgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgREVTSUdOX0pPVVJOQUxfU0NIRU1BID0gMiBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BID0gMyBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBNQVhfSk9VUk5BTF9FTlRSSUVTID0gMTAwXzAwMDtcbmV4cG9ydCB0eXBlIENvbW1hbmQgPSBMZWdhY3lCdWlsZENvbW1hbmQgfCBCdWlsZENvbW1hbmQgfCBIYXJ2ZXN0Q29tbWFuZFxuICB8IFRyYW5zZmVyQ29tbWFuZCB8IFByb2R1Y2VDb21tYW5kIHwgVGlja0NvbW1hbmQgfCBQbGFudENvbW1hbmQgfCBIYXJ2ZXN0Q3JvcENvbW1hbmQ7XG5pbnRlcmZhY2UgQ29tbWFuZEVudmVsb3BlIHtcbiAgc2NoZW1hOiB0eXBlb2YgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBUcmFuc2ZlckNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUge1xuICB0eXBlOiAnZGVwb3NpdCcgfCAnd2l0aGRyYXcnO1xuICBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICByZXNvdXJjZXM6IExpZmVSZXNvdXJjZUJhZztcbn1cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZHVjZUNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUge1xuICB0eXBlOiAncHJvZHVjZSc7IHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7IHJlY2lwZToga2V5b2YgdHlwZW9mIFJFQ0lQRVM7XG59XG5leHBvcnQgaW50ZXJmYWNlIFRpY2tDb21tYW5kIGV4dGVuZHMgQ29tbWFuZEVudmVsb3BlIHsgdHlwZTogJ3RpY2snOyB0aWNrczogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIFBsYW50Q29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7IHR5cGU6ICdwbGFudCc7IHBsb3RJZDogc3RyaW5nOyB9XG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RDcm9wQ29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7IHR5cGU6ICdoYXJ2ZXN0X2Nyb3AnOyBwbG90SWQ6IHN0cmluZzsgfVxuZXhwb3J0IGludGVyZmFjZSBMZWdhY3lCdWlsZENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBKT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgdHlwZTogJ2J1aWxkJztcbiAgcHJvamVjdElkOiBNMlByb2plY3RJZDtcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBCdWlsZENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBERVNJR05fSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgdHlwZTogJ2J1aWxkJztcbiAgcHJvamVjdElkOiBNMlByb2plY3RJZDtcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xuICBkZXNpZ25WZXJzaW9uOiB0eXBlb2YgRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBKT1VSTkFMX1NDSEVNQSB8IHR5cGVvZiBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BO1xuICBpZDogc3RyaW5nO1xuICB0eXBlOiAnaGFydmVzdCc7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGV4cGVjdGVkUmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgQ29tbWFuZE91dGNvbWUgPSBCdWlsZE91dGNvbWUgfCBIYXJ2ZXN0T3V0Y29tZSB8IFRyYW5zZmVyT3V0Y29tZSB8IFByb2R1Y2VPdXRjb21lIHwgVGlja091dGNvbWUgfCBQbGFudE91dGNvbWUgfCBDcm9wT3V0Y29tZTtcbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNmZXJPdXRjb21lIHtcbiAgdHlwZTogJ2RlcG9zaXQnIHwgJ3dpdGhkcmF3Jzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVzb3VyY2VzOiBQYXJ0aWFsPFJlY29yZDxMaWZlUmVzb3VyY2UsIG51bWJlcj4+O1xufVxuZXhwb3J0IGludGVyZmFjZSBQcm9kdWNlT3V0Y29tZSB7XG4gIHR5cGU6ICdwcm9kdWNlJzsgam9iSWQ6IHN0cmluZzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVjaXBlOiBrZXlvZiB0eXBlb2YgUkVDSVBFUzsgcmVtYWluaW5nVGlja3M6IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgVGlja091dGNvbWUge1xuICB0eXBlOiAndGljayc7IGZyb21UaWNrOiBudW1iZXI7IHRvVGljazogbnVtYmVyO1xuICBjb21wbGV0ZWRKb2JzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHJlY2lwZToga2V5b2YgdHlwZW9mIFJFQ0lQRVM7IG91dHB1dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB9PjtcbiAgcmVhZHlDcm9wczogc3RyaW5nW107XG59XG5leHBvcnQgaW50ZXJmYWNlIFBsYW50T3V0Y29tZSB7XG4gIHR5cGU6ICdwbGFudCc7IHBsb3RJZDogc3RyaW5nOyBwbGFudGVkVGljazogbnVtYmVyOyBncm93dGhUaWNrczogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBDcm9wT3V0Y29tZSB7XG4gIHR5cGU6ICdoYXJ2ZXN0X2Nyb3AnOyBwbG90SWQ6IHN0cmluZzsgcmVzb3VyY2VzOiB7IGZvb2Q6IG51bWJlcjsgZmliZXI6IG51bWJlciB9O1xufVxuZXhwb3J0IGludGVyZmFjZSBCdWlsZE91dGNvbWUge1xuICB0eXBlOiAnYnVpbGQnO1xuICBzdHJ1Y3R1cmVJZDogc3RyaW5nO1xuICBjb3N0UGFpZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xufVxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0T3V0Y29tZSB7XG4gIHR5cGU6ICdoYXJ2ZXN0JztcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZTtcbiAgYW1vdW50OiBudW1iZXI7XG59XG5leHBvcnQgaW50ZXJmYWNlIEpvdXJuYWxFbnRyeSB7XG4gIGNvbW1hbmQ6IENvbW1hbmQ7XG4gIHNlcXVlbmNlOiBudW1iZXI7XG4gIHJldmlzaW9uOiBudW1iZXI7XG4gIGhhc2g6IHN0cmluZztcbiAgb3V0Y29tZTogQ29tbWFuZE91dGNvbWU7XG59XG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRKb3VybmFsIHtcbiAgc2NoZW1hOiB0eXBlb2YgSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX0pPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgLyoqXG4gICAqIFRlcnJhaW4gZ2VuZXJhdG9yIG9mIHRoZSB3b3JsZCB0aGlzIGpvdXJuYWwgcmVwbGF5cyBvbi4gQWJzZW50IG1lYW5zIHYxOlxuICAgKiBldmVyeSBzYXZlIHdyaXR0ZW4gYmVmb3JlIGdlbmVyYXRvciB2MiBvbWl0cyB0aGUgZmllbGQsIHNvIGl0cyBjYW5vbmljYWxcbiAgICogYnl0ZXMgKGFuZCBoYXNoZXMpIGFyZSB1bmNoYW5nZWQuXG4gICAqL1xuICBnZW5lcmF0b3JWZXJzaW9uPzogdHlwZW9mIEdFTkVSQVRPUl9WMjtcbiAgc3RhcnRlckludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgZW50cmllczogSm91cm5hbEVudHJ5W107XG59XG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRSZWNlaXB0IHtcbiAgb2s6IHRydWU7XG4gIGR1cGxpY2F0ZTogYm9vbGVhbjtcbiAgaWQ6IHN0cmluZztcbiAgc2VxdWVuY2U6IG51bWJlcjtcbiAgcmV2aXNpb246IG51bWJlcjtcbiAgaGFzaDogc3RyaW5nO1xuICBvdXRjb21lOiBDb21tYW5kT3V0Y29tZTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQ29tbWFuZFJlamVjdGlvbiB7XG4gIG9rOiBmYWxzZTtcbiAgZHVwbGljYXRlOiBmYWxzZTtcbiAgaWQ6IHN0cmluZztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZnVuY3Rpb24gb2JqZWN0KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5mdW5jdGlvbiB1aW50KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzU2FmZUludGVnZXIodmFsdWUpICYmIHZhbHVlID49IDA7XG59XG5mdW5jdGlvbiBpZCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIC9eW0EtWmEtejAtOV1bQS1aYS16MC05Ll86JS1dezAsMTI3fSQvLnRlc3QodmFsdWUpO1xufVxuZnVuY3Rpb24gZW50aXR5SWQodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZS5sZW5ndGggPD0gMTI4XG4gICAgJiYgKC9eZTpcXGQrLFxcZCs6XFxkKyQvLnRlc3QodmFsdWUpXG4gICAgICB8fCAvXmhlcm86c3R5bF9bYS16X10rOi0/XFxkKzotP1xcZCskLy50ZXN0KHZhbHVlKSk7XG59XG5mdW5jdGlvbiBzYW1lRmllbGRzKGE6IHVua25vd24sIGI6IHVua25vd24pOiBib29sZWFuIHtcbiAgaWYgKG9iamVjdChhKSAmJiBvYmplY3QoYikpIHtcbiAgICBjb25zdCBhS2V5cyA9IE9iamVjdC5rZXlzKGEpLnNvcnQoKSwgYktleXMgPSBPYmplY3Qua2V5cyhiKS5zb3J0KCk7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFLZXlzKSA9PT0gSlNPTi5zdHJpbmdpZnkoYktleXMpXG4gICAgICAmJiBhS2V5cy5ldmVyeSgoa2V5KSA9PiBzYW1lRmllbGRzKGFba2V5XSwgYltrZXldKSk7XG4gIH1cbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGEpID09PSBKU09OLnN0cmluZ2lmeShiKTtcbn1cblxuZnVuY3Rpb24gaW52ZW50b3J5KHZhbHVlOiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlc291cmNlIHJlY29yZCcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModmFsdWUpLnNvcnQoKSkge1xuICAgIGlmICghTElGRV9SRVNPVVJDRVMuaW5jbHVkZXMoa2V5IGFzIExpZmVSZXNvdXJjZSlcbiAgICAgIHx8ICF1aW50KHZhbHVlW2tleV0pIHx8IHZhbHVlW2tleV0gPD0gMCB8fCB2YWx1ZVtrZXldID4gMV8wMDBfMDAwXzAwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlc291cmNlIHJlY29yZCcpO1xuICAgIH1cbiAgICByZXN1bHRba2V5XSA9IHZhbHVlW2tleV07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqIENhbm9uaWNhbGl6ZSBhbmQgcmVqZWN0IHVua25vd24sIGFtYmlndW91cyBvciBtYWxmb3JtZWQgY29tbWFuZCBmaWVsZHMuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVDb21tYW5kKHZhbHVlOiB1bmtub3duKTogQ29tbWFuZCB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSB8fCAodmFsdWUuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IERFU0lHTl9KT1VSTkFMX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpXG4gICAgfHwgIWlkKHZhbHVlLmlkKSB8fCAhdWludCh2YWx1ZS5leHBlY3RlZFJldmlzaW9uKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgZW52ZWxvcGUnKTtcbiAgaWYgKHZhbHVlLnR5cGUgPT09ICdidWlsZCcgJiYgWydob3VzZScsICdwYXRoJywgJ2Zhcm0nXS5pbmNsdWRlcyhTdHJpbmcodmFsdWUucHJvamVjdElkKSkpIHtcbiAgICBjb25zdCBjb21tYW5kOiBDb21tYW5kID0gdmFsdWUuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSA/IHtcbiAgICAgIHNjaGVtYTogdmFsdWUuc2NoZW1hLCBpZDogdmFsdWUuaWQsIHR5cGU6ICdidWlsZCcsXG4gICAgICBwcm9qZWN0SWQ6IHZhbHVlLnByb2plY3RJZCBhcyBNMlByb2plY3RJZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbixcbiAgICAgIGRlc2lnblZlcnNpb246IHZhbHVlLmRlc2lnblZlcnNpb24gYXMgdHlwZW9mIEZPVU5ERVJfREVTSUdOX1ZFUlNJT04sXG4gICAgfSA6IHtcbiAgICAgIHNjaGVtYTogSk9VUk5BTF9TQ0hFTUEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogJ2J1aWxkJyxcbiAgICAgIHByb2plY3RJZDogdmFsdWUucHJvamVjdElkIGFzIE0yUHJvamVjdElkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uLFxuICAgIH07XG4gICAgaWYgKGNvbW1hbmQuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSAmJiBjb21tYW5kLmRlc2lnblZlcnNpb24gIT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgc3RydWN0dXJlIGRlc2lnbicpO1xuICAgIH1cbiAgICBpZiAoIXNhbWVGaWVsZHMoY29tbWFuZCwgdmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgYnVpbGQgY29tbWFuZCcpO1xuICAgIHJldHVybiBjb21tYW5kO1xuICB9XG4gIGlmICh2YWx1ZS50eXBlID09PSAnaGFydmVzdCcgJiYgdmFsdWUuc2NoZW1hID09PSBKT1VSTkFMX1NDSEVNQSAmJiBlbnRpdHlJZCh2YWx1ZS5lbnRpdHlJZCkpIHtcbiAgICBjb25zdCBjb21tYW5kOiBDb21tYW5kID0ge1xuICAgICAgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogJ2hhcnZlc3QnLFxuICAgICAgZW50aXR5SWQ6IHZhbHVlLmVudGl0eUlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uLFxuICAgIH07XG4gICAgaWYgKCFzYW1lRmllbGRzKGNvbW1hbmQsIHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGhhcnZlc3QgY29tbWFuZCcpO1xuICAgIHJldHVybiBjb21tYW5kO1xuICB9XG4gIGlmICh2YWx1ZS5zY2hlbWEgPT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpIHtcbiAgICBjb25zdCBiYXNlID0geyBzY2hlbWE6IHZhbHVlLnNjaGVtYSwgaWQ6IHZhbHVlLmlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uIH07XG4gICAgbGV0IGNvbW1hbmQ6IENvbW1hbmQgfCBudWxsID0gbnVsbDtcbiAgICBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3QnICYmIGVudGl0eUlkKHZhbHVlLmVudGl0eUlkKSkge1xuICAgICAgY29tbWFuZCA9IHsgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogdmFsdWUudHlwZSxcbiAgICAgICAgZW50aXR5SWQ6IHZhbHVlLmVudGl0eUlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uIH07XG4gICAgfSBlbHNlIGlmICgodmFsdWUudHlwZSA9PT0gJ2RlcG9zaXQnIHx8IHZhbHVlLnR5cGUgPT09ICd3aXRoZHJhdycpICYmIHZhbHVlLnN0b2NrcGlsZUlkID09PSBGT1VOREVSX1NUT0NLUElMRV9JRCkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLCByZXNvdXJjZXM6IGludmVudG9yeSh2YWx1ZS5yZXNvdXJjZXMpIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAncHJvZHVjZScgJiYgdmFsdWUuc3RvY2twaWxlSWQgPT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEXG4gICAgICAmJiAodmFsdWUucmVjaXBlID09PSAnc2VlZCcgfHwgdmFsdWUucmVjaXBlID09PSAncmF0aW9ucycpKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCBzdG9ja3BpbGVJZDogdmFsdWUuc3RvY2twaWxlSWQsIHJlY2lwZTogdmFsdWUucmVjaXBlIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAndGljaycgJiYgdWludCh2YWx1ZS50aWNrcykgJiYgdmFsdWUudGlja3MgPiAwICYmIHZhbHVlLnRpY2tzIDw9IE1BWF9USUNLU19QRVJfQ09NTUFORCkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgdGlja3M6IHZhbHVlLnRpY2tzIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAncGxhbnQnICYmIHR5cGVvZiB2YWx1ZS5wbG90SWQgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QodmFsdWUucGxvdElkKSkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgcGxvdElkOiB2YWx1ZS5wbG90SWQgfTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnICYmIHR5cGVvZiB2YWx1ZS5wbG90SWQgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QodmFsdWUucGxvdElkKSkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgcGxvdElkOiB2YWx1ZS5wbG90SWQgfTtcbiAgICB9XG4gICAgaWYgKGNvbW1hbmQpIHtcbiAgICAgIGlmICghc2FtZUZpZWxkcyhjb21tYW5kLCB2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBsaWZlLWxvb3AgY29tbWFuZCcpO1xuICAgICAgcmV0dXJuIGNvbW1hbmQ7XG4gICAgfVxuICB9XG4gIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgY29tbWFuZCcpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZU91dGNvbWUodmFsdWU6IHVua25vd24pOiBDb21tYW5kT3V0Y29tZSB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgb3V0Y29tZScpO1xuICBpZiAodmFsdWUudHlwZSA9PT0gJ2J1aWxkJyAmJiBpZCh2YWx1ZS5zdHJ1Y3R1cmVJZCkpIHtcbiAgICBjb25zdCBvdXRjb21lOiBDb21tYW5kT3V0Y29tZSA9IHtcbiAgICAgIHR5cGU6ICdidWlsZCcsIHN0cnVjdHVyZUlkOiB2YWx1ZS5zdHJ1Y3R1cmVJZCxcbiAgICAgIGNvc3RQYWlkOiBpbnZlbnRvcnkodmFsdWUuY29zdFBhaWQpLCByZXNvdXJjZXNHYWluZWQ6IGludmVudG9yeSh2YWx1ZS5yZXNvdXJjZXNHYWluZWQpLFxuICAgIH07XG4gICAgaWYgKEpTT04uc3RyaW5naWZ5KG91dGNvbWUpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBidWlsZCBvdXRjb21lJyk7XG4gICAgcmV0dXJuIG91dGNvbWU7XG4gIH1cbiAgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0JyAmJiBlbnRpdHlJZCh2YWx1ZS5lbnRpdHlJZClcbiAgICAmJiBbJ3dvb2QnLCAnc3RvbmUnLCAnb3JlJywgJ2ZpYmVyJ10uaW5jbHVkZXMoU3RyaW5nKHZhbHVlLnJlc291cmNlKSlcbiAgICAmJiB1aW50KHZhbHVlLmFtb3VudCkgJiYgdmFsdWUuYW1vdW50ID4gMCAmJiB2YWx1ZS5hbW91bnQgPD0gMV8wMDBfMDAwKSB7XG4gICAgY29uc3Qgb3V0Y29tZTogQ29tbWFuZE91dGNvbWUgPSB7XG4gICAgICB0eXBlOiAnaGFydmVzdCcsIGVudGl0eUlkOiB2YWx1ZS5lbnRpdHlJZCxcbiAgICAgIHJlc291cmNlOiB2YWx1ZS5yZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGUsIGFtb3VudDogdmFsdWUuYW1vdW50LFxuICAgIH07XG4gICAgaWYgKEpTT04uc3RyaW5naWZ5KG91dGNvbWUpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBoYXJ2ZXN0IG91dGNvbWUnKTtcbiAgICByZXR1cm4gb3V0Y29tZTtcbiAgfVxuICBsZXQgb3V0Y29tZTogQ29tbWFuZE91dGNvbWUgfCBudWxsID0gbnVsbDtcbiAgaWYgKCh2YWx1ZS50eXBlID09PSAnZGVwb3NpdCcgfHwgdmFsdWUudHlwZSA9PT0gJ3dpdGhkcmF3JykgJiYgdmFsdWUuc3RvY2twaWxlSWQgPT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEKSB7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLCByZXNvdXJjZXM6IGludmVudG9yeSh2YWx1ZS5yZXNvdXJjZXMpIH07XG4gIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3Byb2R1Y2UnICYmIGlkKHZhbHVlLmpvYklkKSAmJiB2YWx1ZS5zdG9ja3BpbGVJZCA9PT0gRk9VTkRFUl9TVE9DS1BJTEVfSURcbiAgICAmJiAodmFsdWUucmVjaXBlID09PSAnc2VlZCcgfHwgdmFsdWUucmVjaXBlID09PSAncmF0aW9ucycpICYmIHVpbnQodmFsdWUucmVtYWluaW5nVGlja3MpICYmIHZhbHVlLnJlbWFpbmluZ1RpY2tzID4gMCkge1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIGpvYklkOiB2YWx1ZS5qb2JJZCwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLFxuICAgICAgcmVjaXBlOiB2YWx1ZS5yZWNpcGUsIHJlbWFpbmluZ1RpY2tzOiB2YWx1ZS5yZW1haW5pbmdUaWNrcyB9O1xuICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdwbGFudCcgJiYgdHlwZW9mIHZhbHVlLnBsb3RJZCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdCh2YWx1ZS5wbG90SWQpXG4gICAgJiYgdWludCh2YWx1ZS5wbGFudGVkVGljaykgJiYgdmFsdWUuZ3Jvd3RoVGlja3MgPT09IENST1BfR1JPV1RIX1RJQ0tTKSB7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgcGxvdElkOiB2YWx1ZS5wbG90SWQsIHBsYW50ZWRUaWNrOiB2YWx1ZS5wbGFudGVkVGljaywgZ3Jvd3RoVGlja3M6IHZhbHVlLmdyb3d0aFRpY2tzIH07XG4gIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcgJiYgdHlwZW9mIHZhbHVlLnBsb3RJZCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdCh2YWx1ZS5wbG90SWQpXG4gICAgJiYgaXNSZXNvdXJjZXModmFsdWUucmVzb3VyY2VzKSAmJiB2YWx1ZS5yZXNvdXJjZXMuZm9vZCA9PT0gQ1JPUF9ZSUVMRC5mb29kICYmIHZhbHVlLnJlc291cmNlcy5maWJlciA9PT0gQ1JPUF9ZSUVMRC5maWJlcikge1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIHBsb3RJZDogdmFsdWUucGxvdElkLFxuICAgICAgcmVzb3VyY2VzOiB7IGZvb2Q6IENST1BfWUlFTEQuZm9vZCwgZmliZXI6IENST1BfWUlFTEQuZmliZXIgfSB9O1xuICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICd0aWNrJyAmJiB1aW50KHZhbHVlLmZyb21UaWNrKSAmJiB1aW50KHZhbHVlLnRvVGljaylcbiAgICAmJiB2YWx1ZS50b1RpY2sgPiB2YWx1ZS5mcm9tVGljayAmJiB2YWx1ZS50b1RpY2sgLSB2YWx1ZS5mcm9tVGljayA8PSBNQVhfVElDS1NfUEVSX0NPTU1BTkRcbiAgICAmJiBBcnJheS5pc0FycmF5KHZhbHVlLmNvbXBsZXRlZEpvYnMpICYmIEFycmF5LmlzQXJyYXkodmFsdWUucmVhZHlDcm9wcykpIHtcbiAgICBjb25zdCBjb21wbGV0ZWRKb2JzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHJlY2lwZTogUmVjaXBlSWQ7IG91dHB1dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB9PiA9IHZhbHVlLmNvbXBsZXRlZEpvYnMubWFwKChyYXc6IHVua25vd24pID0+IHtcbiAgICAgIGlmICghb2JqZWN0KHJhdykgfHwgIWlkKHJhdy5pZCkgfHwgKHJhdy5yZWNpcGUgIT09ICdzZWVkJyAmJiByYXcucmVjaXBlICE9PSAncmF0aW9ucycpKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgY29tcGxldGVkIGpvYicpO1xuICAgICAgcmV0dXJuIHsgaWQ6IHJhdy5pZCwgcmVjaXBlOiByYXcucmVjaXBlLCBvdXRwdXQ6IGludmVudG9yeShyYXcub3V0cHV0KSB9O1xuICAgIH0pO1xuICAgIGlmICghdmFsdWUucmVhZHlDcm9wcy5ldmVyeSgocGxvdCkgPT4gdHlwZW9mIHBsb3QgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QocGxvdCkpKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgcmVhZHkgY3JvcHMnKTtcbiAgICBvdXRjb21lID0geyB0eXBlOiB2YWx1ZS50eXBlLCBmcm9tVGljazogdmFsdWUuZnJvbVRpY2ssIHRvVGljazogdmFsdWUudG9UaWNrLFxuICAgICAgY29tcGxldGVkSm9icywgcmVhZHlDcm9wczogWy4uLnZhbHVlLnJlYWR5Q3JvcHNdIH07XG4gIH1cbiAgaWYgKG91dGNvbWUpIHtcbiAgICBpZiAoSlNPTi5zdHJpbmdpZnkob3V0Y29tZSkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGxpZmUtbG9vcCBvdXRjb21lJyk7XG4gICAgcmV0dXJuIG91dGNvbWU7XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgb3V0Y29tZScpO1xufVxuXG5mdW5jdGlvbiBpc1Jlc291cmNlcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICByZXR1cm4gb2JqZWN0KHZhbHVlKSAmJiBPYmplY3QudmFsdWVzKHZhbHVlKS5ldmVyeSgoYW1vdW50KSA9PiB1aW50KGFtb3VudCkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSm91cm5hbChcbiAgc2VlZCA9IDEzMzcsIHNjaGVtYTogQ29tbWFuZEpvdXJuYWxbJ3NjaGVtYSddID0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSwgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OLFxuKTogQ29tbWFuZEpvdXJuYWwge1xuICBpZiAoZ2VuZXJhdG9yVmVyc2lvbiAhPT0gR0VORVJBVE9SX1ZFUlNJT04gJiYgc2NoZW1hICE9PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdsZWdhY3kgam91cm5hbCBzY2hlbWFzIG9ubHkgZXhpc3QgZm9yIGdlbmVyYXRvciB2MScpO1xuICB9XG4gIHJldHVybiB7XG4gICAgc2NoZW1hLCBzZWVkLFxuICAgIC4uLihnZW5lcmF0b3JWZXJzaW9uID09PSBHRU5FUkFUT1JfVjIgPyB7IGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WMiB9IDoge30pLFxuICAgIHN0YXJ0ZXJJbnZlbnRvcnk6IGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSwgZW50cmllczogW10sXG4gIH07XG59XG5cbi8qKiBHZW5lcmF0b3IgdmVyc2lvbiBhIGpvdXJuYWwgcmVwbGF5cyBvbiAoYWJzZW50IGZpZWxkID0gdjEpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGpvdXJuYWxHZW5lcmF0b3Ioam91cm5hbDogUGljazxDb21tYW5kSm91cm5hbCwgJ2dlbmVyYXRvclZlcnNpb24nPik6IG51bWJlciB7XG4gIHJldHVybiBqb3VybmFsLmdlbmVyYXRvclZlcnNpb24gPz8gR0VORVJBVE9SX1ZFUlNJT047XG59XG5cbi8qKiBWYWxpZGF0ZSBhbiBlbnRpcmUgam91cm5hbCB3aXRob3V0IGNoYW5naW5nIGEgbGl2ZSBzZXNzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlSm91cm5hbCh2YWx1ZTogdW5rbm93bik6IENvbW1hbmRKb3VybmFsIHtcbiAgaWYgKCFvYmplY3QodmFsdWUpIHx8ICh2YWx1ZS5zY2hlbWEgIT09IEpPVVJOQUxfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gREVTSUdOX0pPVVJOQUxfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSlcbiAgICB8fCAhdWludCh2YWx1ZS5zZWVkKSB8fCB2YWx1ZS5zZWVkID4gMHhmZmZmZmZmZlxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudHJpZXMpIHx8IHZhbHVlLmVudHJpZXMubGVuZ3RoID4gTUFYX0pPVVJOQUxfRU5UUklFU1xuICAgIHx8ICdnZW5lcmF0b3JWZXJzaW9uJyBpbiB2YWx1ZSAmJiAodmFsdWUuZ2VuZXJhdG9yVmVyc2lvbiAhPT0gR0VORVJBVE9SX1YyIHx8IHZhbHVlLnNjaGVtYSAhPT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgY29tbWFuZCBqb3VybmFsJyk7XG4gIH1cbiAgY29uc3Qgam91cm5hbDogQ29tbWFuZEpvdXJuYWwgPSB7XG4gICAgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIHNlZWQ6IHZhbHVlLnNlZWQsXG4gICAgLi4uKCdnZW5lcmF0b3JWZXJzaW9uJyBpbiB2YWx1ZSA/IHsgZ2VuZXJhdG9yVmVyc2lvbjogR0VORVJBVE9SX1YyIH0gOiB7fSksXG4gICAgc3RhcnRlckludmVudG9yeTogaW52ZW50b3J5KHZhbHVlLnN0YXJ0ZXJJbnZlbnRvcnkpLCBlbnRyaWVzOiBbXSxcbiAgfTtcbiAgY29uc3QgaWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWUuZW50cmllcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHJhdyA9IHZhbHVlLmVudHJpZXNbaV07XG4gICAgaWYgKCFvYmplY3QocmF3KSB8fCByYXcuc2VxdWVuY2UgIT09IGkgfHwgIXVpbnQocmF3LnJldmlzaW9uKVxuICAgICAgfHwgdHlwZW9mIHJhdy5oYXNoICE9PSAnc3RyaW5nJyB8fCAhL15bMC05YS1mXXsxNn0kLy50ZXN0KHJhdy5oYXNoKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY29udGlndW91cyBvciBpbnZhbGlkIGpvdXJuYWwgZW50cnknKTtcbiAgICBjb25zdCBlbnRyeTogSm91cm5hbEVudHJ5ID0ge1xuICAgICAgY29tbWFuZDogdmFsaWRhdGVDb21tYW5kKHJhdy5jb21tYW5kKSwgc2VxdWVuY2U6IGksXG4gICAgICByZXZpc2lvbjogcmF3LnJldmlzaW9uLCBoYXNoOiByYXcuaGFzaCwgb3V0Y29tZTogdmFsaWRhdGVPdXRjb21lKHJhdy5vdXRjb21lKSxcbiAgICB9O1xuICAgIGlmICgoZW50cnkuY29tbWFuZC50eXBlID09PSAnYnVpbGQnIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnKVxuICAgICAgJiYgZW50cnkuY29tbWFuZC5zY2hlbWEgIT09IHZhbHVlLnNjaGVtYSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdqb3VybmFsIHNjaGVtYSBhbmQgYnVpbGQgY29tbWFuZCBzY2hlbWEgZGlmZmVyJyk7XG4gICAgfVxuICAgIGlmIChKU09OLnN0cmluZ2lmeShlbnRyeSkgIT09IEpTT04uc3RyaW5naWZ5KHJhdykpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBqb3VybmFsIGVudHJ5Jyk7XG4gICAgaWYgKGlkcy5oYXMoZW50cnkuY29tbWFuZC5pZCkpIHRocm93IG5ldyBFcnJvcignZHVwbGljYXRlIGpvdXJuYWwgY29tbWFuZCBpZCcpO1xuICAgIGlmIChlbnRyeS5jb21tYW5kLnR5cGUgIT09IGVudHJ5Lm91dGNvbWUudHlwZVxuICAgICAgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcgJiYgZW50cnkub3V0Y29tZS50eXBlID09PSAnaGFydmVzdCdcbiAgICAgICYmIGVudHJ5LmNvbW1hbmQuZW50aXR5SWQgIT09IGVudHJ5Lm91dGNvbWUuZW50aXR5SWRcbiAgICAgIHx8IChlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdwbGFudCcgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdF9jcm9wJylcbiAgICAgICYmIGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gZW50cnkub3V0Y29tZS50eXBlICYmIGVudHJ5LmNvbW1hbmQucGxvdElkICE9PSBlbnRyeS5vdXRjb21lLnBsb3RJZFxuICAgICAgfHwgKGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2RlcG9zaXQnIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ3dpdGhkcmF3JylcbiAgICAgICYmIGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gZW50cnkub3V0Y29tZS50eXBlXG4gICAgICAmJiAoZW50cnkuY29tbWFuZC5zdG9ja3BpbGVJZCAhPT0gZW50cnkub3V0Y29tZS5zdG9ja3BpbGVJZFxuICAgICAgICB8fCBKU09OLnN0cmluZ2lmeShlbnRyeS5jb21tYW5kLnJlc291cmNlcykgIT09IEpTT04uc3RyaW5naWZ5KGVudHJ5Lm91dGNvbWUucmVzb3VyY2VzKSlcbiAgICAgIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ3Byb2R1Y2UnICYmIGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ3Byb2R1Y2UnXG4gICAgICAmJiAoZW50cnkuY29tbWFuZC5zdG9ja3BpbGVJZCAhPT0gZW50cnkub3V0Y29tZS5zdG9ja3BpbGVJZCB8fCBlbnRyeS5jb21tYW5kLnJlY2lwZSAhPT0gZW50cnkub3V0Y29tZS5yZWNpcGUpXG4gICAgICB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICd0aWNrJyAmJiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICd0aWNrJ1xuICAgICAgJiYgZW50cnkub3V0Y29tZS50b1RpY2sgLSBlbnRyeS5vdXRjb21lLmZyb21UaWNrICE9PSBlbnRyeS5jb21tYW5kLnRpY2tzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2pvdXJuYWwgY29tbWFuZCBhbmQgb3V0Y29tZSBkaXNhZ3JlZScpO1xuICAgIH1cbiAgICBpZHMuYWRkKGVudHJ5LmNvbW1hbmQuaWQpO1xuICAgIGpvdXJuYWwuZW50cmllcy5wdXNoKGVudHJ5KTtcbiAgfVxuICBpZiAoSlNPTi5zdHJpbmdpZnkoam91cm5hbCkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGNvbW1hbmQgam91cm5hbCcpO1xuICAvLyBUaGlzIHNsaWNlIGhhcyBvbmUgZGV0ZXJtaW5pc3RpYyBnZW5lc2lzIGNvbmZpZ3VyYXRpb24uIEEgY2hhbmdlZCBzdGFydGVyXG4gIC8vIGdyYW50IG11c3Qgbm90IHBhc3MgdW5ub3RpY2VkIHdoZW4gcmVwbGF5IGJlZ2lucyBmcm9tIGEgbGF0ZXIgc25hcHNob3QuXG4gIGlmIChKU09OLnN0cmluZ2lmeShqb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnkpICE9PSBKU09OLnN0cmluZ2lmeShjcmVhdGVKb3VybmFsKHZhbHVlLnNlZWQsIHZhbHVlLnNjaGVtYSwgam91cm5hbEdlbmVyYXRvcihqb3VybmFsKSkuc3RhcnRlckludmVudG9yeSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2pvdXJuYWwgc3RhcnRlciBpbnZlbnRvcnkgaXMgaW5jb21wYXRpYmxlIHdpdGggdGhpcyB2ZXJzaW9uJyk7XG4gIH1cbiAgcmV0dXJuIGpvdXJuYWw7XG59XG5cbmZ1bmN0aW9uIHJlZmVyZW5jZXNSZXRpcmVkU3RvbmUoZW50cnk6IEpvdXJuYWxFbnRyeSk6IGJvb2xlYW4ge1xuICByZXR1cm4gL15oZXJvOnN0eWxfcm9ja18oPzpzbWFsbHxtZWRpdW18bGFyZ2UpOi8udGVzdChcbiAgICBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0JyA/IGVudHJ5LmNvbW1hbmQuZW50aXR5SWQgOiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICdoYXJ2ZXN0JyA/IGVudHJ5Lm91dGNvbWUuZW50aXR5SWQgOiAnJyxcbiAgKTtcbn1cblxuZXhwb3J0IGNsYXNzIEdhbWVTZXNzaW9uIHtcbiAgcmVhZG9ubHkgam91cm5hbDogQ29tbWFuZEpvdXJuYWw7XG4gIHByaXZhdGUgcmVhZG9ubHkgcHJlcEF1dGhvcml6ZXI6IExvY2FsQXV0aG9yaXplcjtcbiAgcHJpdmF0ZSByZWFkb25seSBzdHJ1Y3R1cmVBdXRob3JpemVyOiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXI7XG4gIHByaXZhdGUgcmVhZG9ubHkgaWRzID0gbmV3IE1hcDxzdHJpbmcsIEpvdXJuYWxFbnRyeT4oKTtcblxuICBwcml2YXRlIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHdvcmxkOiBXb3JsZCwgam91cm5hbDogQ29tbWFuZEpvdXJuYWwpIHtcbiAgICB0aGlzLmpvdXJuYWwgPSBqb3VybmFsO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2Ygam91cm5hbC5lbnRyaWVzKSB0aGlzLmlkcy5zZXQoZW50cnkuY29tbWFuZC5pZCwgZW50cnkpO1xuICAgIHRoaXMucHJlcEF1dGhvcml6ZXIgPSBuZXcgTG9jYWxBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pO1xuICAgIHRoaXMuc3RydWN0dXJlQXV0aG9yaXplciA9IG5ldyBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIoeyBlbnZlbG9wZTogTTAwMl9MQVlPVVQuZW52ZWxvcGUgfSk7XG4gIH1cblxuICAvKiogQSBuZXcgY3VycmVudC1zY2hlbWEgd29ybGQuIGBnZW5lcmF0b3JWZXJzaW9uYCBkZWZhdWx0cyB0byB2MSBmb3IgQVBJIGNvbXBhdGliaWxpdHkuICovXG4gIHN0YXRpYyBnZW5lc2lzKHNlZWQgPSAxMzM3LCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0dXJuIG5ldyBHYW1lU2Vzc2lvbihcbiAgICAgIGdlbmVzaXNXb3JsZChzZWVkLCBpbnZlbnRvcnkoTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSksIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEsIGdlbmVyYXRvclZlcnNpb24pLFxuICAgICAgY3JlYXRlSm91cm5hbChzZWVkLCBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BLCBnZW5lcmF0b3JWZXJzaW9uKSxcbiAgICApO1xuICB9XG5cbiAgLyoqIENvbXBhdGliaWxpdHkgZW50cnkgcG9pbnQgZm9yIHJlY29yZGVkIE0wMDIgZml4dHVyZXMgYW5kIHNhdmVkIHdvcmxkcy4gKi9cbiAgc3RhdGljIGxlZ2FjeUdlbmVzaXMoc2VlZCA9IDEzMzcsIHNjaGVtYTogdHlwZW9mIEpPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9KT1VSTkFMX1NDSEVNQSA9IEpPVVJOQUxfU0NIRU1BKTogR2FtZVNlc3Npb24ge1xuICAgIHJldHVybiBuZXcgR2FtZVNlc3Npb24oZ2VuZXNpc1dvcmxkKHNlZWQsIGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSwgc2NoZW1hKSwgY3JlYXRlSm91cm5hbChzZWVkLCBzY2hlbWEpKTtcbiAgfVxuXG4gIC8qKiBSZXBsYXkgYWNjZXB0ZWQgY29tbWFuZHMgaW4gdGhlaXIgYXV0aG9yaXRhdGl2ZSBvcmRlciBmcm9tIGFuIGVtcHR5IHdvcmxkLlxuICAgKiBBIG5vcm1hbCByZXBsYXkgaXMgYXR0ZW1wdGVkIGZpcnN0OiBzdG9uZSBmcm9tIHJldGFpbmVkIGNhaXJucyBhbmQgYnVpbGRpbmdcbiAgICogcHJlcGFyYXRpb24gbXVzdCBub3QgZm9yY2UgaGlzdG9yaWNhbCBtb2RlLiBSYXcgb2xkIGpvdXJuYWxzIGVudGVyIHByaXZhdGVcbiAgICogcmVjb25zdHJ1Y3Rpb24gb25seSB3aGVuIHRoZWlyIG9yaWdpbmFsIHN0b25lIG9ic3RydWN0aW9ucyByZXF1aXJlZCBpdC4gKi9cbiAgc3RhdGljIHJlcGxheShpbnB1dDogdW5rbm93bik6IEdhbWVTZXNzaW9uIHtcbiAgICBjb25zdCBqb3VybmFsID0gdmFsaWRhdGVKb3VybmFsKGlucHV0KTtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlcGxheUN1cnJlbnQoam91cm5hbCk7XG4gICAgfSBjYXRjaCAoY3VycmVudEVycm9yKSB7XG4gICAgICBpZiAoIWpvdXJuYWwuZW50cmllcy5zb21lKGNvbnRhaW5zUmV0aXJlZFN0b25lKSkgdGhyb3cgY3VycmVudEVycm9yO1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKS5zZXNzaW9uO1xuICAgICAgfSBjYXRjaCAoaGlzdG9yaWNhbEVycm9yKSB7XG4gICAgICAgIC8vIEFuIGFscmVhZHktbWlncmF0ZWQgam91cm5hbCBoYXMgcmV3cml0dGVuIGhhc2hlczsgdmVyaWZ5IGl0cyByZXRhaW5lZFxuICAgICAgICAvLyBzdG9uZSBjb21tYW5kcyBub3JtYWxseSBpbnN0ZWFkIG9mIGFjY2VwdGluZyB0aGUgZmFpbGVkIG9sZCByZXBsYXkuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlcGxheUN1cnJlbnQoam91cm5hbCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHRocm93IGhpc3RvcmljYWxFcnJvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKiBSZXN0b3JlIGEgdmFsaWRhdGVkIHNuYXBzaG90LCB0aGVuIHJlcGxheSBvbmx5IGl0cyBhY2NlcHRlZC1jb21tYW5kIHRhaWwuICovXG4gIHN0YXRpYyByZXN0b3JlKHNuYXBzaG90SW5wdXQ6IFdvcmxkU25hcHNob3QsIGpvdXJuYWxJbnB1dDogdW5rbm93bik6IEdhbWVTZXNzaW9uIHtcbiAgICBjb25zdCBqb3VybmFsID0gdmFsaWRhdGVKb3VybmFsKGpvdXJuYWxJbnB1dCk7XG4gICAgY29uc3Qgc25hcHNob3QgPSB2YWxpZGF0ZVdvcmxkU25hcHNob3Qoc25hcHNob3RJbnB1dCk7XG4gICAgaWYgKHNuYXBzaG90LnNjaGVtYSAhPT0gam91cm5hbC5zY2hlbWEpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgYW5kIGpvdXJuYWwgc2NoZW1hcyBkaWZmZXInKTtcbiAgICBjb25zdCBuZXh0ID0gc25hcHNob3QubmV4dFNlcXVlbmNlO1xuICAgIGlmIChuZXh0ID4gam91cm5hbC5lbnRyaWVzLmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBpcyBhaGVhZCBvZiB0aGUgam91cm5hbCcpO1xuICAgIC8vIEN1cnJlbnQgc2F2ZXMgKGluY2x1ZGluZyBldmVyeSBtaWdyYXRlZCBib3VuZGFyeSkga2VlcCB0aGVpciBleGFjdCBoYXNoLlxuICAgIC8vIFRyeSB0aGVtIGJlZm9yZSByZWNvbnN0cnVjdGluZyBhIGNvbXBhdGlibGUgb2xkIGpvdXJuYWwuIERlcG9zaXQtb25seVxuICAgIC8vIG1pZ3JhdGVkIHNhdmVzIG5vIGxvbmdlciBjYXJyeSBhbiBleHBsaWNpdCBzdG9uZSBjb21tYW5kIHRvIGNsYXNzaWZ5IHRoZW0uXG4gICAgaWYgKCFzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpKSB7XG4gICAgICB0cnkgeyByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpOyB9IGNhdGNoIHsgLyogYXV0aGVudGljYXRlZCBtaWdyYXRpb24gYmVsb3cgKi8gfVxuICAgIH1cbiAgICBpZiAobmV4dCA+IDAgfHwgc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgLy8gQSBib3VuZGFyeSBhdXRoZW50aWNhdGVkIGR1cmluZyBtaWdyYXRpb24gaXMgY29tcGFyZWQgd2l0aCB0aGUgbWlncmF0ZWRcbiAgICAgIC8vIHN0YXRlOyBhIHJhdyBvbGQgYm91bmRhcnkgaXMgY29tcGFyZWQgd2l0aCB0aGUgb3JpZ2luYWwgaGlzdG9yaWNhbCBvbmUuXG4gICAgICAvLyBCb3RoIHBhdGhzIGF1dGhlbnRpY2F0ZSB0aGUgY29tcGxldGUgb3JpZ2luYWwgYWNjZXB0ZWQgam91cm5hbCBmaXJzdC5cbiAgICAgIGNvbnN0IGhpc3RvcmljYWwgPSBqb3VybmFsLmVudHJpZXMuc29tZShyZWZlcmVuY2VzUmV0aXJlZFN0b25lKVxuICAgICAgICB8fCBzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpO1xuICAgICAgLy8gQSBtaWdyYXRlZCBzYXZlIG5vIGxvbmdlciBjb250YWlucyByZXRpcmVkIGVudGl0aWVzLiBJdHMgcmV3cml0dGVuXG4gICAgICAvLyBib3VuZGFyeSBoYXNoZXMgZGVzY3JpYmUgdGhlIGZpbHRlcmVkIHN0YXRlLCBzbyBvcmRpbmFyeSByZXN0b3JhdGlvblxuICAgICAgLy8gbXVzdCBzdWNjZWVkIGJlZm9yZSB0cnlpbmcgdG8gaW50ZXJwcmV0IGl0IGFzIHJhdyBvbGQtc2F2ZSBieXRlcy5cbiAgICAgIC8vIEEgcmVmZXJlbmNlZCBhdXRob3JlZCBzdG9uZSBhbG9uZSBkb2VzICpub3QqIGltcGx5IGEgcmF3IG9sZCBib3VuZGFyeTpcbiAgICAgIC8vIGxlZ2l0aW1hdGUgc2F2ZXMgY2FuIGNvbnRhaW4gdW50b3VjaGVkIG5hdHVyYWwgcmV0aXJlZCBkZXBvc2l0cyBvbmx5LlxuICAgICAgaWYgKCFzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpKSB7XG4gICAgICAgIHRyeSB7IHJldHVybiBHYW1lU2Vzc2lvbi5yZXN0b3JlQ3VycmVudChzbmFwc2hvdCwgam91cm5hbCwgbmV4dCk7IH0gY2F0Y2ggeyAvKiB0cnkgb3JpZ2luYWwgcmVjb25zdHJ1Y3Rpb24gKi8gfVxuICAgICAgfVxuICAgICAgaWYgKGhpc3RvcmljYWwpIHtcbiAgICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZCA9IEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKTtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSByZWNvbnN0cnVjdGVkLnNuYXBzaG90cy5nZXQobmV4dCk7XG4gICAgICAgIGNvbnN0IG1pZ3JhdGVkID0gZXhwZWN0ZWQgPyBtaWdyYXRlU3RvbmVTbmFwc2hvdChleHBlY3RlZCkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGlmIChtaWdyYXRlZCAmJiBsZWdhY3lTdG9uZUhhc2goc25hcHNob3QpID09PSBsZWdhY3lTdG9uZUhhc2gobWlncmF0ZWQpKVxuICAgICAgICAgIHJldHVybiByZWNvbnN0cnVjdGVkLnNlc3Npb247XG4gICAgICAgIGlmIChzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpXG4gICAgICAgICAgJiYgZXhwZWN0ZWQgJiYgbGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90KSA9PT0gbGVnYWN5U3RvbmVIYXNoKGV4cGVjdGVkKSlcbiAgICAgICAgICByZXR1cm4gcmVjb25zdHJ1Y3RlZC5zZXNzaW9uO1xuICAgICAgICBpZiAoc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignaGlzdG9yaWNhbCBzbmFwc2hvdCBkb2VzIG5vdCBtYXRjaCBpdHMgb3JpZ2luYWwgam91cm5hbCBib3VuZGFyeScpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuZXh0ID4gMCkgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTtcbiAgICBjb25zdCBoaXN0b3JpY2FsID0gam91cm5hbC5lbnRyaWVzLnNvbWUoY29udGFpbnNSZXRpcmVkU3RvbmUpO1xuICAgIGlmIChoaXN0b3JpY2FsKSB7XG4gICAgICB0cnkgeyByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpOyB9IGNhdGNoIHsgLyogcmF3IG9yIG1pZ3JhdGVkIGdlbmVzaXMgKi8gfVxuICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZCA9IEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKTtcbiAgICAgIGNvbnN0IHJhd0dlbmVzaXMgPSByZWNvbnN0cnVjdGVkLnNuYXBzaG90cy5nZXQoMCkhO1xuICAgICAgaWYgKGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgPT09IGxlZ2FjeVN0b25lSGFzaChyYXdHZW5lc2lzKSkgcmV0dXJuIHJlY29uc3RydWN0ZWQuc2Vzc2lvbjtcbiAgICB9XG4gICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTtcbiAgfVxuXG4gIC8qKiBSZXBsYXkgYWxyZWFkeS1hdXRoZW50aWNhdGVkIGN1cnJlbnQtc3RhdGUgY29tbWFuZHMuICovXG4gIHByaXZhdGUgc3RhdGljIHJlcGxheUN1cnJlbnQoam91cm5hbDogQ29tbWFuZEpvdXJuYWwpOiBHYW1lU2Vzc2lvbiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IG5ldyBHYW1lU2Vzc2lvbihcbiAgICAgIGdlbmVzaXNXb3JsZChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc3RhcnRlckludmVudG9yeSwgam91cm5hbC5zY2hlbWEsIGpvdXJuYWxHZW5lcmF0b3Ioam91cm5hbCkpLFxuICAgICAgY3JlYXRlSm91cm5hbChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc2NoZW1hLCBqb3VybmFsR2VuZXJhdG9yKGpvdXJuYWwpKSxcbiAgICApO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2Ygam91cm5hbC5lbnRyaWVzKSBzZXNzaW9uLnJlcGxheUVudHJ5KGVudHJ5KTtcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfVxuXG4gIHByaXZhdGUgc3RhdGljIHJlc3RvcmVDdXJyZW50KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90LCBqb3VybmFsOiBDb21tYW5kSm91cm5hbCwgbmV4dDogbnVtYmVyKTogR2FtZVNlc3Npb24ge1xuICAgIGNvbnN0IHdvcmxkID0gd29ybGRGcm9tU25hcHNob3Qoc25hcHNob3QpO1xuICAgIGlmICh3b3JsZC5zZWVkICE9PSBqb3VybmFsLnNlZWQpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgYW5kIGpvdXJuYWwgc2VlZHMgZGlmZmVyJyk7XG4gICAgaWYgKHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uICE9PSBqb3VybmFsR2VuZXJhdG9yKGpvdXJuYWwpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGFuZCBqb3VybmFsIHRlcnJhaW4gZ2VuZXJhdG9ycyBkaWZmZXInKTtcbiAgICB9XG4gICAgY29uc3QgZ2VuZXNpcyA9IGdlbmVzaXNXb3JsZChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc3RhcnRlckludmVudG9yeSwgam91cm5hbC5zY2hlbWEsIGpvdXJuYWxHZW5lcmF0b3Ioam91cm5hbCkpO1xuICAgIGlmIChuZXh0ID09PSAwICYmIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgIT09IGNhbm9uaWNhbFdvcmxkSGFzaChnZW5lc2lzLCAwLCBqb3VybmFsLnNjaGVtYSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ2VuZXNpcyBzbmFwc2hvdCBkb2VzIG5vdCBtYXRjaCBqb3VybmFsIGNvbmZpZ3VyYXRpb24nKTtcbiAgICB9XG4gICAgaWYgKG5leHQgPiAwICYmIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgIT09IGpvdXJuYWwuZW50cmllc1tuZXh0IC0gMV0uaGFzaCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXNoIGRvZXMgbm90IG1hdGNoIGl0cyBqb3VybmFsIGJvdW5kYXJ5Jyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5mcm9tVmFsaWRhdGVkQm91bmRhcnkod29ybGQsIHtcbiAgICAgIHNjaGVtYTogam91cm5hbC5zY2hlbWEsIHNlZWQ6IGpvdXJuYWwuc2VlZCxcbiAgICAgIC4uLihqb3VybmFsLmdlbmVyYXRvclZlcnNpb24gPyB7IGdlbmVyYXRvclZlcnNpb246IGpvdXJuYWwuZ2VuZXJhdG9yVmVyc2lvbiB9IDoge30pLFxuICAgICAgc3RhcnRlckludmVudG9yeTogeyAuLi5qb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnkgfSwgZW50cmllczogam91cm5hbC5lbnRyaWVzLnNsaWNlKDAsIG5leHQpLFxuICAgIH0pO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2Ygam91cm5hbC5lbnRyaWVzLnNsaWNlKG5leHQpKSBzZXNzaW9uLnJlcGxheUVudHJ5KGVudHJ5KTtcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfVxuXG4gIC8qKiBAaW50ZXJuYWwgQXNzZW1ibGUgYW4gYXV0aGVudGljYXRlZCBzYXZlIGJvdW5kYXJ5OyBnYW1lcGxheSB1c2VzIGRpc3BhdGNoLiAqL1xuICBwcml2YXRlIHN0YXRpYyBmcm9tVmFsaWRhdGVkQm91bmRhcnkod29ybGQ6IFdvcmxkLCBqb3VybmFsOiBDb21tYW5kSm91cm5hbCk6IEdhbWVTZXNzaW9uIHtcbiAgICByZXR1cm4gbmV3IEdhbWVTZXNzaW9uKHdvcmxkLCBqb3VybmFsKTtcbiAgfVxuXG4gIC8qKiBAaW50ZXJuYWwgU291cmNlIGZvciBkZXRlcm1pbmlzdGljIG9sZC1zYXZlIGZpeHR1cmVzOyBub3QgYSBsaXZlIHNlc3Npb24uICovXG4gIHN0YXRpYyBoaXN0b3JpY2FsSm91cm5hbCh3b3JsZDogV29ybGQpOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0dXJuIG5ldyBHYW1lU2Vzc2lvbih3b3JsZCwgY3JlYXRlSm91cm5hbCh3b3JsZC5zZWVkLCB3b3JsZC5saWZlID8gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQVxuICAgICAgOiB3b3JsZC5zdHJ1Y3R1cmVzLnNpemUgPiAwID8gREVTSUdOX0pPVVJOQUxfU0NIRU1BIDogSk9VUk5BTF9TQ0hFTUEpKTtcbiAgfVxuXG4gIC8qKiBAaW50ZXJuYWwgU291cmNlIGZvciBkZXRlcm1pbmlzdGljIG9sZC1zYXZlIGZpeHR1cmVzOyBub3QgYSBsaXZlIHNlc3Npb24uICovXG4gIHN0YXRpYyBoaXN0b3JpY2FsR2VuZXNpc1dvcmxkKHNlZWQgPSAxMzM3LCBzY2hlbWE6IENvbW1hbmRKb3VybmFsWydzY2hlbWEnXSA9IEpPVVJOQUxfU0NIRU1BKTogV29ybGQge1xuICAgIHJldHVybiBoaXN0b3JpY2FsR2VuZXNpc1dvcmxkKHNlZWQsIGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSwgc2NoZW1hKTtcbiAgfVxuXG4gIHByaXZhdGUgc3RhdGljIHJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsOiBDb21tYW5kSm91cm5hbCk6IHtcbiAgICBzZXNzaW9uOiBHYW1lU2Vzc2lvbjsgc25hcHNob3RzOiBNYXA8bnVtYmVyLCBXb3JsZFNuYXBzaG90PjtcbiAgfSB7XG4gICAgY29uc3QgZXhwZWN0ZWRHZW5lc2lzID0gaGlzdG9yaWNhbEdlbmVzaXNXb3JsZChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc3RhcnRlckludmVudG9yeSwgam91cm5hbC5zY2hlbWEpO1xuICAgIGNvbnN0IHNuYXBzaG90cyA9IG5ldyBNYXA8bnVtYmVyLCBXb3JsZFNuYXBzaG90PigpO1xuICAgIHNuYXBzaG90cy5zZXQoMCwgY3JlYXRlV29ybGRTbmFwc2hvdChleHBlY3RlZEdlbmVzaXMsIDAsIGpvdXJuYWwuc2NoZW1hKSk7XG4gICAgY29uc3QgcmVwbGF5ID0gbmV3IEdhbWVTZXNzaW9uKGV4cGVjdGVkR2VuZXNpcywgY3JlYXRlSm91cm5hbChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc2NoZW1hKSk7XG4gICAgY29uc3QgbWlncmF0ZWRKb3VybmFsID0gY3JlYXRlSm91cm5hbChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc2NoZW1hKTtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGpvdXJuYWwuZW50cmllcykge1xuICAgICAgcmVwbGF5LnJlcGxheUVudHJ5KGVudHJ5KTtcbiAgICAgIGNvbnN0IHNuYXBzaG90ID0gY3JlYXRlV29ybGRTbmFwc2hvdChyZXBsYXkud29ybGQsIHJlcGxheS5uZXh0U2VxdWVuY2UsIGpvdXJuYWwuc2NoZW1hKTtcbiAgICAgIHNuYXBzaG90cy5zZXQocmVwbGF5Lm5leHRTZXF1ZW5jZSwgc25hcHNob3QpO1xuICAgICAgLy8gS2VlcCB0aGUgcmV3cml0dGVuIGF1dGhlbnRpY2F0ZWQgYm91bmRhcnkgaW4gdGhlIHJldHVybmVkIGpvdXJuYWwuIEFcbiAgICAgIC8vIHJlcGxheS1vbmx5IGpvdXJuYWwgcmVidWlsZCB3b3VsZCBzaWxlbnRseSBwdXQgdGhlIHJhdyBoYXNoIGJhY2suXG4gICAgICBlbnRyeS5oYXNoID0gbGVnYWN5U3RvbmVIYXNoKG1pZ3JhdGVTdG9uZVNuYXBzaG90KHNuYXBzaG90KSk7XG4gICAgICBtaWdyYXRlZEpvdXJuYWwuZW50cmllcy5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvbiA9IEdhbWVTZXNzaW9uLmZyb21WYWxpZGF0ZWRCb3VuZGFyeShyZXBsYXkud29ybGQsIG1pZ3JhdGVkSm91cm5hbCk7XG4gICAgcmV0dXJuIHsgc2Vzc2lvbjogc2Vzc2lvbi5taWdyYXRlUmV0aXJlZFN0b25lcygpLCBzbmFwc2hvdHMgfTtcbiAgfVxuXG4gIHByaXZhdGUgc25hcHNob3RTY2hlbWEoKTogV29ybGRTbmFwc2hvdFsnc2NoZW1hJ10geyByZXR1cm4gdGhpcy5qb3VybmFsLnNjaGVtYTsgfVxuXG4gIGdldCBuZXh0U2VxdWVuY2UoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuam91cm5hbC5lbnRyaWVzLmxlbmd0aDsgfVxuICBnZXQgc25hcHNob3QoKTogV29ybGRTbmFwc2hvdCB7XG4gICAgcmV0dXJuIGNyZWF0ZVdvcmxkU25hcHNob3QodGhpcy53b3JsZCwgdGhpcy5uZXh0U2VxdWVuY2UsIHRoaXMuc25hcHNob3RTY2hlbWEoKSk7XG4gIH1cbiAgZ2V0IHN0YXRlSGFzaCgpOiBzdHJpbmcge1xuICAgIHJldHVybiBjYW5vbmljYWxXb3JsZEhhc2godGhpcy53b3JsZCwgdGhpcy5uZXh0U2VxdWVuY2UsIHRoaXMuc25hcHNob3RTY2hlbWEoKSk7XG4gIH1cblxuICBjb21tYW5kSWQoa2luZDogQ29tbWFuZFsndHlwZSddLCB0YXJnZXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgLy8gRW50aXR5IElEcyBjb250YWluIGNodW5rIGNvb3JkaW5hdGVzOyBlbmNvZGUgY29tbWFzIGFuZCBvdGhlciBzZXBhcmF0b3JzXG4gICAgLy8gc28gZ2VuZXJhdGVkIGNvbW1hbmRzIHNhdGlzZnkgdGhlIHNhbWUgZW52ZWxvcGUgdmFsaWRhdGlvbiBhcyBpbnB1dC5cbiAgICByZXR1cm4gYCR7a2luZH06JHt0aGlzLm5leHRTZXF1ZW5jZX06JHtlbmNvZGVVUklDb21wb25lbnQodGFyZ2V0KX1gO1xuICB9XG5cbiAgZW50cnkoc2VxdWVuY2U6IG51bWJlcik6IEpvdXJuYWxFbnRyeSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLmpvdXJuYWwuZW50cmllc1tzZXF1ZW5jZV07IH1cblxuICBkaXNwYXRjaChpbnB1dDogdW5rbm93bik6IENvbW1hbmRSZWNlaXB0IHwgQ29tbWFuZFJlamVjdGlvbiB7XG4gICAgbGV0IGNvbW1hbmQ6IENvbW1hbmQ7XG4gICAgdHJ5IHsgY29tbWFuZCA9IHZhbGlkYXRlQ29tbWFuZChpbnB1dCk7IH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWplY3Qob2JqZWN0KGlucHV0KSAmJiB0eXBlb2YgaW5wdXQuaWQgPT09ICdzdHJpbmcnID8gaW5wdXQuaWQgOiAnJyxcbiAgICAgICAgJ2ludmFsaWRfY29tbWFuZCcsIFsoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2VdKTtcbiAgICB9XG4gICAgaWYgKChjb21tYW5kLnR5cGUgPT09ICdidWlsZCcgfHwgY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcpXG4gICAgICAmJiBjb21tYW5kLnNjaGVtYSAhPT0gdGhpcy5qb3VybmFsLnNjaGVtYVxuICAgICAgfHwgY29tbWFuZC50eXBlICE9PSAnYnVpbGQnICYmIGNvbW1hbmQudHlwZSAhPT0gJ2hhcnZlc3QnXG4gICAgICAgICYmIHRoaXMuam91cm5hbC5zY2hlbWEgIT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCAnc2NoZW1hX21pc21hdGNoJywgWydjb21tYW5kIHNjaGVtYSBkb2VzIG5vdCBtYXRjaCB0aGlzIHdvcmxkIGpvdXJuYWwnXSk7XG4gICAgfVxuICAgIGNvbnN0IHByaW9yID0gdGhpcy5pZHMuZ2V0KGNvbW1hbmQuaWQpO1xuICAgIGlmIChwcmlvcikge1xuICAgICAgaWYgKCFzYW1lRmllbGRzKHByaW9yLmNvbW1hbmQsIGNvbW1hbmQpKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCAnZHVwbGljYXRlX2NvbW1hbmRfaWQnLCBbJ2NvbW1hbmQgaWQgYWxyZWFkeSBoYXMgZGlmZmVyZW50IGFjY2VwdGVkIGlucHV0J10pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMucmVjZWlwdChwcmlvciwgdHJ1ZSk7XG4gICAgfVxuICAgIGlmIChjb21tYW5kLmV4cGVjdGVkUmV2aXNpb24gIT09IHRoaXMud29ybGQucmV2aXNpb24pIHtcbiAgICAgIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCAnc3RhbGVfcmV2aXNpb24nLCBbXG4gICAgICAgIGBjb21tYW5kIGV4cGVjdHMgcmV2aXNpb24gJHtjb21tYW5kLmV4cGVjdGVkUmV2aXNpb259OyB3b3JsZCBpcyBhdCAke3RoaXMud29ybGQucmV2aXNpb259YCxcbiAgICAgIF0pO1xuICAgIH1cbiAgICBjb25zdCBiZWZvcmUgPSB0aGlzLnN0YXRlSGFzaDtcbiAgICBsZXQgb3V0Y29tZTogQ29tbWFuZE91dGNvbWU7XG4gICAgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ2J1aWxkJykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYnVpbGRQcm9qZWN0KHRoaXMud29ybGQsIHRoaXMucHJlcEF1dGhvcml6ZXIsIHRoaXMuc3RydWN0dXJlQXV0aG9yaXplcixcbiAgICAgICAgcHJvamVjdEJ5SWQoY29tbWFuZC5wcm9qZWN0SWQpLFxuICAgICAgICAnZGVzaWduVmVyc2lvbicgaW4gY29tbWFuZCA/IGNvbW1hbmQuZGVzaWduVmVyc2lvbiA6IHVuZGVmaW5lZCk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZUhhc2ggIT09IGJlZm9yZSkgdGhyb3cgbmV3IEVycm9yKCdyZWplY3RlZCBidWlsZCBjaGFuZ2VkIGF1dGhvcml0YXRpdmUgc3RhdGUnKTtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICB9XG4gICAgICBvdXRjb21lID0ge1xuICAgICAgICB0eXBlOiAnYnVpbGQnLCBzdHJ1Y3R1cmVJZDogcmVzdWx0LnJlY29yZC5pZCxcbiAgICAgICAgY29zdFBhaWQ6IGludmVudG9yeShyZXN1bHQuc3RydWN0dXJlLmNvc3RQYWlkKSxcbiAgICAgICAgcmVzb3VyY2VzR2FpbmVkOiBpbnZlbnRvcnkocmVzdWx0LnByZXBhcmF0aW9uLnJlc291cmNlc0dhaW5lZCksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGhhcnZlc3RFbnRpdHkodGhpcy53b3JsZCwgY29tbWFuZC5lbnRpdHlJZCk7XG4gICAgICBpZiAoIXJlc3VsdCkgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsICdub3RfaGFydmVzdGFibGUnLCBbJ2VudGl0eSBpcyBhYnNlbnQsIGRlcGxldGVkIG9yIGhhcyBubyByZXNvdXJjZSddKTtcbiAgICAgIG91dGNvbWUgPSB7XG4gICAgICAgIHR5cGU6ICdoYXJ2ZXN0JywgZW50aXR5SWQ6IHJlc3VsdC5lbnRpdHkuaWQsXG4gICAgICAgIHJlc291cmNlOiByZXN1bHQucmVzb3VyY2UsIGFtb3VudDogcmVzdWx0LmFtb3VudCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdkZXBvc2l0JyB8fCBjb21tYW5kLnR5cGUgPT09ICd3aXRoZHJhdycpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zZmVyKHRoaXMud29ybGQsIGNvbW1hbmQudHlwZSwgY29tbWFuZC5yZXNvdXJjZXMpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVIYXNoICE9PSBiZWZvcmUpIHRocm93IG5ldyBFcnJvcigncmVqZWN0ZWQgdHJhbnNmZXIgY2hhbmdlZCBhdXRob3JpdGF0aXZlIHN0YXRlJyk7XG4gICAgICAgIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgfVxuICAgICAgb3V0Y29tZSA9IHsgdHlwZTogY29tbWFuZC50eXBlLCBzdG9ja3BpbGVJZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHJlc291cmNlczogcmVzdWx0LnZhbHVlIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdwcm9kdWNlJykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gc3RhcnRQcm9kdWN0aW9uKHRoaXMud29ybGQsIGNvbW1hbmQucmVjaXBlLCBjb21tYW5kLmlkKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6ICdwcm9kdWNlJywgam9iSWQ6IHJlc3VsdC52YWx1ZS5pZCwgc3RvY2twaWxlSWQ6IHJlc3VsdC52YWx1ZS5zdG9ja3BpbGVJZCxcbiAgICAgICAgcmVjaXBlOiByZXN1bHQudmFsdWUucmVjaXBlLCByZW1haW5pbmdUaWNrczogcmVzdWx0LnZhbHVlLnJlbWFpbmluZ1RpY2tzIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICd0aWNrJykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYWR2YW5jZVRpY2tzKHRoaXMud29ybGQsIGNvbW1hbmQudGlja3MpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgb3V0Y29tZSA9IHsgdHlwZTogJ3RpY2snLCAuLi5yZXN1bHQudmFsdWUgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ3BsYW50Jykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gcGxhbnRDcm9wKHRoaXMud29ybGQsIGNvbW1hbmQucGxvdElkKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6ICdwbGFudCcsIHBsb3RJZDogY29tbWFuZC5wbG90SWQsXG4gICAgICAgIHBsYW50ZWRUaWNrOiByZXN1bHQudmFsdWUucGxhbnRlZFRpY2ssIGdyb3d0aFRpY2tzOiByZXN1bHQudmFsdWUuZ3Jvd3RoVGlja3MgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGhhcnZlc3RDcm9wKHRoaXMud29ybGQsIGNvbW1hbmQucGxvdElkKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6ICdoYXJ2ZXN0X2Nyb3AnLCBwbG90SWQ6IGNvbW1hbmQucGxvdElkLCByZXNvdXJjZXM6IHJlc3VsdC52YWx1ZSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3VuaGFuZGxlZCBjb21tYW5kIHR5cGUnKTtcbiAgICB9XG4gICAgY29uc3QgZW50cnk6IEpvdXJuYWxFbnRyeSA9IHtcbiAgICAgIGNvbW1hbmQsIHNlcXVlbmNlOiB0aGlzLm5leHRTZXF1ZW5jZSwgcmV2aXNpb246IHRoaXMud29ybGQucmV2aXNpb24sXG4gICAgICAvLyBUaGUgc2VxdWVuY2UgaXMgcGFydCBvZiB0aGUgc3RhdGUgaGFzaCBhdCB0aGlzIGFjY2VwdGVkIGJvdW5kYXJ5LlxuICAgICAgaGFzaDogY2Fub25pY2FsV29ybGRIYXNoKHRoaXMud29ybGQsIHRoaXMubmV4dFNlcXVlbmNlICsgMSwgdGhpcy5zbmFwc2hvdFNjaGVtYSgpKSwgb3V0Y29tZSxcbiAgICB9O1xuICAgIHRoaXMuam91cm5hbC5lbnRyaWVzLnB1c2goZW50cnkpO1xuICAgIHRoaXMuaWRzLnNldChjb21tYW5kLmlkLCBlbnRyeSk7XG4gICAgcmV0dXJuIHRoaXMucmVjZWlwdChlbnRyeSwgZmFsc2UpO1xuICB9XG5cbiAgcHJpdmF0ZSByZXBsYXlFbnRyeShlbnRyeTogSm91cm5hbEVudHJ5KTogdm9pZCB7XG4gICAgaWYgKGVudHJ5LnNlcXVlbmNlICE9PSB0aGlzLm5leHRTZXF1ZW5jZSkgdGhyb3cgbmV3IEVycm9yKCdqb3VybmFsIHNlcXVlbmNlIGdhcCcpO1xuICAgIGNvbnN0IHJlY2VpcHQgPSB0aGlzLmRpc3BhdGNoKGVudHJ5LmNvbW1hbmQpO1xuICAgIGlmICghcmVjZWlwdC5vayB8fCByZWNlaXB0LmR1cGxpY2F0ZSB8fCByZWNlaXB0Lmhhc2ggIT09IGVudHJ5Lmhhc2hcbiAgICAgIHx8IHJlY2VpcHQucmV2aXNpb24gIT09IGVudHJ5LnJldmlzaW9uXG4gICAgICB8fCBKU09OLnN0cmluZ2lmeShyZWNlaXB0Lm91dGNvbWUpICE9PSBKU09OLnN0cmluZ2lmeShlbnRyeS5vdXRjb21lKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBqb3VybmFsIHJlcGxheSBkaXZlcmdlZCBhdCBzZXF1ZW5jZSAke2VudHJ5LnNlcXVlbmNlfWApO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBIaXN0b3JpY2FsIGVudHJpZXMgaGF2ZSBwYXNzZWQgdGhlaXIgb3JpZ2luYWwgb3V0Y29tZS9oYXNoIGNoZWNrcy4gVGhlaXJcbiAgICogYWNjZXB0ZWQgY29tbWFuZHMgYW5kIHN0b25lIHlpZWxkcyByZW1haW47IG9ubHkgZW50aXR5IGV4aXN0ZW5jZSBhbmQgdGhlXG4gICAqIHJlc3VsdGluZyBjYW5vbmljYWwgYm91bmRhcnkgaGFzaGVzIGNoYW5nZS4gKi9cbiAgcHJpdmF0ZSBtaWdyYXRlUmV0aXJlZFN0b25lcygpOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0aXJlU3RvbmVFbnRpdGllcyh0aGlzLndvcmxkKTtcbiAgICBmaW5pc2hTdG9uZVJlcGxheSh0aGlzLndvcmxkKTtcbiAgICBjb25zdCBtaWdyYXRlZCA9IGNyZWF0ZVdvcmxkU25hcHNob3QodGhpcy53b3JsZCwgdGhpcy5uZXh0U2VxdWVuY2UsIHRoaXMuc25hcHNob3RTY2hlbWEoKSk7XG4gICAgcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCh0aGlzLndvcmxkLCBtaWdyYXRlZCk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBwcml2YXRlIHJlY2VpcHQoZW50cnk6IEpvdXJuYWxFbnRyeSwgZHVwbGljYXRlOiBib29sZWFuKTogQ29tbWFuZFJlY2VpcHQge1xuICAgIHJldHVybiB7XG4gICAgICBvazogdHJ1ZSwgZHVwbGljYXRlLCBpZDogZW50cnkuY29tbWFuZC5pZCwgc2VxdWVuY2U6IGVudHJ5LnNlcXVlbmNlLFxuICAgICAgcmV2aXNpb246IGVudHJ5LnJldmlzaW9uLCBoYXNoOiBlbnRyeS5oYXNoLCBvdXRjb21lOiBlbnRyeS5vdXRjb21lLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHJlamVjdChpZDogc3RyaW5nLCBjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogQ29tbWFuZFJlamVjdGlvbiB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBkdXBsaWNhdGU6IGZhbHNlLCBpZCwgY29kZSwgcmVhc29ucyB9O1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lc2lzV29ybGQoc2VlZDogbnVtYmVyLCBzdGFydGVyID0gaW52ZW50b3J5KE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkpLFxuICBzY2hlbWE6IENvbW1hbmRKb3VybmFsWydzY2hlbWEnXSA9IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBnZW5lcmF0ZVdvcmxkKHNlZWQsIDAsIGdlbmVyYXRvclZlcnNpb24pO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7IC4uLnN0YXJ0ZXIgfTtcbiAgaWYgKHNjaGVtYSA9PT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkgd29ybGQubGlmZSA9IGNyZWF0ZUxpZmVTdGF0ZSgpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbmZ1bmN0aW9uIGhpc3RvcmljYWxHZW5lc2lzV29ybGQoc2VlZDogbnVtYmVyLCBzdGFydGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+LFxuICBzY2hlbWE6IENvbW1hbmRKb3VybmFsWydzY2hlbWEnXSk6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkKTtcbiAgZW5hYmxlU3RvbmVSZXBsYXkod29ybGQpO1xuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7IC4uLnN0YXJ0ZXIgfTtcbiAgaWYgKHNjaGVtYSA9PT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkgd29ybGQubGlmZSA9IGNyZWF0ZUxpZmVTdGF0ZSgpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbmZ1bmN0aW9uIGNvbnRhaW5zUmV0aXJlZFN0b25lKGVudHJ5OiBKb3VybmFsRW50cnkpOiBib29sZWFuIHtcbiAgaWYgKGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnKSB7XG4gICAgcmV0dXJuIGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ2hhcnZlc3QnXG4gICAgICAmJiAoZW50cnkub3V0Y29tZS5yZXNvdXJjZSA9PT0gJ3N0b25lJ1xuICAgICAgICB8fCAvXmhlcm86c3R5bF9yb2NrXyg/OnNtYWxsfG1lZGl1bXxsYXJnZSk6Ly50ZXN0KGVudHJ5LmNvbW1hbmQuZW50aXR5SWQpKTtcbiAgfVxuICByZXR1cm4gZW50cnkub3V0Y29tZS50eXBlID09PSAnYnVpbGQnICYmIChlbnRyeS5vdXRjb21lLnJlc291cmNlc0dhaW5lZC5zdG9uZSA/PyAwKSA+IDA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTs7O0FDV1osSUFBTSxlQUFlO0FBRTVCLElBQU0sa0JBQWtCLGVBQWU7QUFFaEMsSUFBTSxXQUFOLE1BQWU7QUFBQSxFQUNaLGNBQWM7QUFBQSxFQUN0QixjQUFjO0FBQUE7QUFBQSxFQUdkLFFBQVEsSUFBWSxRQUEwQjtBQUM1QyxRQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sU0FBUyxFQUFFLEtBQUssTUFBTSxFQUFHLFFBQU87QUFDdkQsU0FBSyxjQUFjLEtBQUssSUFBSSxpQkFBaUIsS0FBSyxjQUFjLEtBQUssSUFBSSxJQUFJLFlBQVksQ0FBQztBQUMxRixRQUFJLEtBQUssY0FBYyxhQUFjLFFBQU87QUFDNUMsU0FBSyxlQUFlO0FBQ3BCLFNBQUs7QUFDTCxXQUFPO0FBQUEsRUFDVDtBQUFBO0FBQUEsRUFHQSxRQUFjO0FBQUUsU0FBSyxjQUFjO0FBQUEsRUFBRztBQUFBO0FBQUEsRUFHdEMsSUFBSSxnQkFBd0I7QUFBRSxXQUFPLEtBQUssSUFBSSxHQUFHLGVBQWUsS0FBSyxXQUFXO0FBQUEsRUFBRztBQUNyRjtBQU1PLElBQU0sZ0JBQU4s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QUFHLE1BQU0sdUNBQXVDO0FBQy9FLFNBQU8sTUFBTSxFQUFFLFVBQVUsS0FBTSxHQUFHLEtBQUs7QUFDdkMsSUFBRSxRQUFRO0FBQ1YsU0FBTyxNQUFNLEVBQUUsVUFBVSxJQUFNLEdBQUcsSUFBSTtBQUN4QyxDQUFDO0FBRUQsS0FBSyxzRUFBc0UsTUFBTTtBQUMvRSxRQUFNLElBQUksWUFBWSxRQUFRLE1BQU0sWUFBWTtBQUNoRCxXQUFTLElBQUksR0FBRyxJQUFJLElBQUksS0FBSztBQUMzQixVQUFNLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxHQUFHLElBQUksRUFBRSxVQUFVLFFBQVEsVUFBVSxHQUFHLE1BQU0sUUFBUSxPQUFPLEdBQUcsa0JBQWtCLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFDbkksV0FBTyxNQUFNLEVBQUUsSUFBSSxJQUFJO0FBQUEsRUFDekI7QUFDQSxTQUFPLE1BQU0sRUFBRSxNQUFNLEtBQU0sTUFBTSxFQUFFO0FBQ25DLFFBQU0sV0FBVyxZQUFZLE9BQU8sS0FBSyxNQUFNLEtBQUssVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQ3pFLFNBQU8sTUFBTSxTQUFTLFdBQVcsRUFBRSxTQUFTO0FBQzVDLFFBQU0sV0FBVyxZQUFZLFFBQVEsS0FBSyxNQUFNLEtBQUssVUFBVSxFQUFFLFFBQVEsQ0FBQyxHQUFHLEtBQUssTUFBTSxLQUFLLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUNsSCxTQUFPLE1BQU0sU0FBUyxXQUFXLEVBQUUsU0FBUztBQUM5QyxDQUFDOyIsCiAgIm5hbWVzIjogWyJhIiwgImIiLCAic21vb3RoIiwgInRvdGFsIiwgImlkIiwgImlkIiwgImlkIiwgInRleHQiLCAiaWQiLCAiaWQiLCAiZGlnZXN0IiwgImZhaWwiLCAiam9iIiwgInRleHQiLCAiaW52ZW50b3J5IiwgImlkIiwgImlkIiwgImlkIiwgInVpbnQiLCAiZW50aXR5SWQiLCAib3V0Y29tZSIsICJoaXN0b3JpY2FsIiwgImVycm9yIiwgImlkIl0KfQo=
