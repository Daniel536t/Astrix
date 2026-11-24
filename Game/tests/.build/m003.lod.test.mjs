// tests/m003.lod.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// src/render/terrain.ts
import * as THREE3 from "three";

// src/render/water.ts
import * as THREE from "three";

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
  const c3 = hash2i(xi, yi + 1, seed), d = hash2i(xi + 1, yi + 1, seed);
  const top = a + (b - a) * xf;
  const bottom = c3 + (d - c3) * xf;
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
function evictChunk(world, key) {
  if (!world.chunks.has(key)) return false;
  world.chunks.delete(key);
  world.stats.chunksEvicted++;
  return true;
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

// src/render/water.ts
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

// src/render/voxel-colors.ts
import * as THREE2 from "three";
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
function heightBand(y) {
  return y >= 45 ? 2 : y >= 18 ? 1 : 0;
}

// src/render/mesher.ts
var PAD = CHUNK_SIZE + 2;
var PADDED_VOLUME = PAD * PAD * WORLD_HEIGHT;

// src/render/terrain.ts
var terrainMaterial = new THREE3.MeshLambertMaterial({
  vertexColors: true,
  side: THREE3.FrontSide
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
function sampleMacroTerrain(world, x, z, step = 8) {
  const cache = macroSamples(world, step);
  const i = Math.max(0, Math.min(cache.N - 1, Math.floor((x + HALF) / step)));
  const j = Math.max(0, Math.min(cache.N - 1, Math.floor((z + HALF) / step)));
  const idx = j * cache.N + i;
  return {
    x: -HALF + (i + 0.5) * step,
    z: -HALF + (j + 0.5) * step,
    height: cache.heights[idx],
    top: cache.tops[idx],
    underwater: cache.underwater[idx] !== 0
  };
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
  const geometry = new THREE3.BufferGeometry();
  geometry.setAttribute("position", new THREE3.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE3.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE3.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new THREE3.Mesh(geometry, new THREE3.MeshLambertMaterial({
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

// tests/m003.lod.test.ts
test("macro sampling reads authoritative edited height/material without scanning unedited chunks", () => {
  const world = createWorld(1337);
  const edited = sampleMacroTerrain(world, 0, 0);
  const x = Math.round(edited.x), z = Math.round(edited.z);
  const beforeChunks = world.chunks.size;
  const untouched = sampleMacroTerrain(world, 0, 8);
  const original = surfaceHeightAt(world.seed, x, z) >= 2 ? MAT.GRASS : MAT.STONE;
  assert.equal(edited.height, surfaceHeightAt(world.seed, x, z));
  assert.equal(world.chunks.size, 0, "base macro sampling must not materialize chunks");
  assert.ok(setVoxel(world, x, edited.height, z, MAT.ORE));
  const after = sampleMacroTerrain(world, 0, 0);
  assert.equal(after.height, edited.height + 1);
  assert.equal(after.top, MAT.ORE);
  assert.equal(after.underwater, false);
  assert.deepEqual(sampleMacroTerrain(world, 0, 8), untouched);
  assert.equal(world.chunks.size, beforeChunks + 1, "only the edited chunk should be materialized");
  assert.notEqual(original, MAT.ORE);
});
test("edit reversal and chunk eviction invalidate macro values and restore deltas", () => {
  const world = createWorld(1337);
  const cell = sampleMacroTerrain(world, 0, 0);
  const x = Math.round(cell.x), z = Math.round(cell.z);
  const original = topMaterialAtWorld(world, x, z);
  const y = surfaceAt(world, x, z);
  const key = chunkKey(worldToChunkX(x), worldToChunkZ(z));
  assert.ok(setVoxel(world, x, y, z, MAT.STONE));
  const edited = sampleMacroTerrain(world, 0, 0);
  assert.equal(edited.height, y + 1);
  assert.equal(edited.top, MAT.STONE);
  evictChunk(world, key);
  assert.deepEqual(sampleMacroTerrain(world, 0, 0), edited, "eviction loses the durable edit");
  assert.ok(setVoxel(world, x, y, z, MAT.AIR));
  evictChunk(world, key);
  assert.equal(sampleMacroTerrain(world, 0, 0).height, y);
  assert.ok(setVoxel(world, x, y - 1, z, original === MAT.ORE ? MAT.STONE : MAT.ORE));
  const materialEdit = sampleMacroTerrain(world, 0, 0);
  assert.notEqual(materialEdit.top, original);
  assert.equal(setVoxel(world, x, y - 1, z, original), true);
  const reversed = sampleMacroTerrain(world, 0, 0);
  assert.equal(reversed.height, y);
  assert.equal(reversed.top, original);
});
test("map macro mesh includes the near edited earthwork at full surface height", () => {
  const world = createWorld(1337);
  const cell = sampleMacroTerrain(world, 0, 0);
  const x = Math.round(cell.x), z = Math.round(cell.z);
  const y = surfaceAt(world, x, z);
  assert.ok(setVoxel(world, x, y, z, MAT.STONE));
  const meshHeight = (mesh) => {
    let height = Number.NEGATIVE_INFINITY;
    const position = mesh.geometry.getAttribute("position");
    const normal = mesh.geometry.getAttribute("normal");
    for (let i = 0; i < position.count; i += 4) {
      if (position.getX(i) === cell.x - 4 && position.getZ(i) === cell.z - 4 && normal.getY(i) === 1) {
        height = Math.max(height, position.getY(i));
      }
    }
    return height;
  };
  const withHole = buildMacroMesh(world, {
    step: 8,
    hole: {
      minX: cell.x - 4,
      maxX: cell.x + 4,
      minZ: cell.z - 4,
      maxZ: cell.z + 4
    }
  });
  const map = buildMacroMesh(world, { step: 8 });
  assert.equal(meshHeight(withHole.mesh), Number.NEGATIVE_INFINITY, "world near ring should own the hole");
  assert.equal(meshHeight(map.mesh), y + 1, "map must not hide the edited earthwork");
  withHole.mesh.geometry.dispose();
  map.mesh.geometry.dispose();
});
test("same-seed worlds and unrelated edits do not share edited macro caches", () => {
  const a = createWorld(1337);
  const b = createWorld(1337);
  const base = sampleMacroTerrain(a, 0, 0);
  const x = Math.round(base.x), z = Math.round(base.z);
  assert.ok(setVoxel(a, x, base.height, z, MAT.ORE));
  assert.equal(sampleMacroTerrain(a, 0, 0).top, MAT.ORE);
  assert.deepEqual(sampleMacroTerrain(b, 0, 0), base, "another world received the edit");
  const distant = sampleMacroTerrain(a, 32, 0);
  const dx = Math.round(distant.x), dz = Math.round(distant.z);
  assert.ok(setVoxel(a, dx, distant.height, dz, MAT.STONE));
  assert.equal(sampleMacroTerrain(a, 0, 0).top, MAT.ORE);
  assert.deepEqual(sampleMacroTerrain(b, 32, 0), distant);
});
test("an evicted edited chunk is the only chunk materialized by macro sampling", () => {
  const world = createWorld(1337);
  const cell = sampleMacroTerrain(world, 0, 0);
  const x = Math.round(cell.x), z = Math.round(cell.z);
  assert.ok(setVoxel(world, x, cell.height, z, MAT.STONE));
  const key = chunkKey(worldToChunkX(x), worldToChunkZ(z));
  evictChunk(world, key);
  assert.equal(world.chunks.size, 0);
  sampleMacroTerrain(world, 0, 0);
  assert.equal(ensureChunk(world, worldToChunkX(x), worldToChunkZ(z))?.key, key);
  assert.deepEqual([...world.chunks.keys()], [key]);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMy5sb2QudGVzdC50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3JlbmRlci93YXRlci50cyIsICIuLi8uLi9zcmMvZGF0YS9wYWxldHRlLmpzb24iLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS9ub2lzZS50cyIsICIuLi8uLi9zcmMvc2ltL2h5ZHJvbG9neS50cyIsICIuLi8uLi9zcmMvc2ltL21hdGVyaWFscy50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4tdjIudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3ZveGVsLWNvbG9ycy50cyIsICIuLi8uLi9zcmMvcmVuZGVyL21lc2hlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCB7IGJ1aWxkTWFjcm9NZXNoLCBzYW1wbGVNYWNyb1RlcnJhaW4gfSBmcm9tICcuLi9zcmMvcmVuZGVyL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgTUFULCBjcmVhdGVXb3JsZCwgZW5zdXJlQ2h1bmssIGV2aWN0Q2h1bmssIHNldFZveGVsLCBzdXJmYWNlQXQsIHN1cmZhY2VIZWlnaHRBdCxcbiAgdG9wTWF0ZXJpYWxBdFdvcmxkLCB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbn0gZnJvbSAnLi4vc3JjL3NpbS93b3JsZCc7XG5cbnRlc3QoJ21hY3JvIHNhbXBsaW5nIHJlYWRzIGF1dGhvcml0YXRpdmUgZWRpdGVkIGhlaWdodC9tYXRlcmlhbCB3aXRob3V0IHNjYW5uaW5nIHVuZWRpdGVkIGNodW5rcycsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgZWRpdGVkID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgY29uc3QgeCA9IE1hdGgucm91bmQoZWRpdGVkLngpLCB6ID0gTWF0aC5yb3VuZChlZGl0ZWQueik7XG4gIGNvbnN0IGJlZm9yZUNodW5rcyA9IHdvcmxkLmNodW5rcy5zaXplO1xuICBjb25zdCB1bnRvdWNoZWQgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDgpO1xuICBjb25zdCBvcmlnaW5hbCA9IHN1cmZhY2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB4LCB6KSA+PSAyID8gTUFULkdSQVNTIDogTUFULlNUT05FO1xuXG4gIGFzc2VydC5lcXVhbChlZGl0ZWQuaGVpZ2h0LCBzdXJmYWNlSGVpZ2h0QXQod29ybGQuc2VlZCwgeCwgeikpO1xuICBhc3NlcnQuZXF1YWwod29ybGQuY2h1bmtzLnNpemUsIDAsICdiYXNlIG1hY3JvIHNhbXBsaW5nIG11c3Qgbm90IG1hdGVyaWFsaXplIGNodW5rcycpO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIGVkaXRlZC5oZWlnaHQsIHosIE1BVC5PUkUpKTtcbiAgY29uc3QgYWZ0ZXIgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDApO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIuaGVpZ2h0LCBlZGl0ZWQuaGVpZ2h0ICsgMSk7XG4gIGFzc2VydC5lcXVhbChhZnRlci50b3AsIE1BVC5PUkUpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIudW5kZXJ3YXRlciwgZmFsc2UpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgOCksIHVudG91Y2hlZCk7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5jaHVua3Muc2l6ZSwgYmVmb3JlQ2h1bmtzICsgMSwgJ29ubHkgdGhlIGVkaXRlZCBjaHVuayBzaG91bGQgYmUgbWF0ZXJpYWxpemVkJyk7XG4gIGFzc2VydC5ub3RFcXVhbChvcmlnaW5hbCwgTUFULk9SRSk7XG59KTtcblxudGVzdCgnZWRpdCByZXZlcnNhbCBhbmQgY2h1bmsgZXZpY3Rpb24gaW52YWxpZGF0ZSBtYWNybyB2YWx1ZXMgYW5kIHJlc3RvcmUgZGVsdGFzJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKDEzMzcpO1xuICBjb25zdCBjZWxsID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgY29uc3QgeCA9IE1hdGgucm91bmQoY2VsbC54KSwgeiA9IE1hdGgucm91bmQoY2VsbC56KTtcbiAgY29uc3Qgb3JpZ2luYWwgPSB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIHgsIHopO1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk7XG5cbiAgYXNzZXJ0Lm9rKHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBNQVQuU1RPTkUpKTtcbiAgY29uc3QgZWRpdGVkID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKGVkaXRlZC5oZWlnaHQsIHkgKyAxKTtcbiAgYXNzZXJ0LmVxdWFsKGVkaXRlZC50b3AsIE1BVC5TVE9ORSk7XG4gIGV2aWN0Q2h1bmsod29ybGQsIGtleSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKSwgZWRpdGVkLCAnZXZpY3Rpb24gbG9zZXMgdGhlIGR1cmFibGUgZWRpdCcpO1xuXG4gIGFzc2VydC5vayhzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgTUFULkFJUikpO1xuICBldmljdENodW5rKHdvcmxkLCBrZXkpO1xuICBhc3NlcnQuZXF1YWwoc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKS5oZWlnaHQsIHkpO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIHkgLSAxLCB6LCBvcmlnaW5hbCA9PT0gTUFULk9SRSA/IE1BVC5TVE9ORSA6IE1BVC5PUkUpKTtcbiAgY29uc3QgbWF0ZXJpYWxFZGl0ID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgYXNzZXJ0Lm5vdEVxdWFsKG1hdGVyaWFsRWRpdC50b3AsIG9yaWdpbmFsKTtcbiAgYXNzZXJ0LmVxdWFsKHNldFZveGVsKHdvcmxkLCB4LCB5IC0gMSwgeiwgb3JpZ2luYWwpLCB0cnVlKTtcbiAgY29uc3QgcmV2ZXJzZWQgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDApO1xuICBhc3NlcnQuZXF1YWwocmV2ZXJzZWQuaGVpZ2h0LCB5KTtcbiAgYXNzZXJ0LmVxdWFsKHJldmVyc2VkLnRvcCwgb3JpZ2luYWwpO1xufSk7XG5cbnRlc3QoJ21hcCBtYWNybyBtZXNoIGluY2x1ZGVzIHRoZSBuZWFyIGVkaXRlZCBlYXJ0aHdvcmsgYXQgZnVsbCBzdXJmYWNlIGhlaWdodCcsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgY2VsbCA9IHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCk7XG4gIGNvbnN0IHggPSBNYXRoLnJvdW5kKGNlbGwueCksIHogPSBNYXRoLnJvdW5kKGNlbGwueik7XG4gIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIE1BVC5TVE9ORSkpO1xuXG4gIGNvbnN0IG1lc2hIZWlnaHQgPSAobWVzaDogUmV0dXJuVHlwZTx0eXBlb2YgYnVpbGRNYWNyb01lc2g+WydtZXNoJ10pOiBudW1iZXIgPT4ge1xuICAgIGxldCBoZWlnaHQgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gICAgY29uc3QgcG9zaXRpb24gPSBtZXNoLmdlb21ldHJ5LmdldEF0dHJpYnV0ZSgncG9zaXRpb24nKTtcbiAgICBjb25zdCBub3JtYWwgPSBtZXNoLmdlb21ldHJ5LmdldEF0dHJpYnV0ZSgnbm9ybWFsJyk7XG4gICAgLy8gTWFjcm8gZ2VvbWV0cnkgaXMgbm9uLWluZGV4ZWQ6IGVhY2ggcXVhZCBvd25zIGZvdXIgY29uc2VjdXRpdmUgdmVydGljZXMuXG4gICAgLy8gUHJvYmUgaXRzIGZpcnN0IGNvcm5lciBzbyBuZWlnaGJvcmluZyBjZWxscycgc2hhcmVkIHZlcnRpY2VzIGNhbm5vdCBtYXRjaC5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBvc2l0aW9uLmNvdW50OyBpICs9IDQpIHtcbiAgICAgIGlmIChwb3NpdGlvbi5nZXRYKGkpID09PSBjZWxsLnggLSA0ICYmIHBvc2l0aW9uLmdldFooaSkgPT09IGNlbGwueiAtIDQgJiYgbm9ybWFsLmdldFkoaSkgPT09IDEpIHtcbiAgICAgICAgaGVpZ2h0ID0gTWF0aC5tYXgoaGVpZ2h0LCBwb3NpdGlvbi5nZXRZKGkpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGhlaWdodDtcbiAgfTtcbiAgY29uc3Qgd2l0aEhvbGUgPSBidWlsZE1hY3JvTWVzaCh3b3JsZCwge1xuICAgIHN0ZXA6IDgsIGhvbGU6IHtcbiAgICAgIG1pblg6IGNlbGwueCAtIDQsIG1heFg6IGNlbGwueCArIDQsIG1pblo6IGNlbGwueiAtIDQsIG1heFo6IGNlbGwueiArIDQsXG4gICAgfSxcbiAgfSk7XG4gIGNvbnN0IG1hcCA9IGJ1aWxkTWFjcm9NZXNoKHdvcmxkLCB7IHN0ZXA6IDggfSk7XG4gIGFzc2VydC5lcXVhbChtZXNoSGVpZ2h0KHdpdGhIb2xlLm1lc2gpLCBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFksICd3b3JsZCBuZWFyIHJpbmcgc2hvdWxkIG93biB0aGUgaG9sZScpO1xuICBhc3NlcnQuZXF1YWwobWVzaEhlaWdodChtYXAubWVzaCksIHkgKyAxLCAnbWFwIG11c3Qgbm90IGhpZGUgdGhlIGVkaXRlZCBlYXJ0aHdvcmsnKTtcbiAgd2l0aEhvbGUubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gIG1hcC5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbn0pO1xuXG50ZXN0KCdzYW1lLXNlZWQgd29ybGRzIGFuZCB1bnJlbGF0ZWQgZWRpdHMgZG8gbm90IHNoYXJlIGVkaXRlZCBtYWNybyBjYWNoZXMnLCAoKSA9PiB7XG4gIGNvbnN0IGEgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgYiA9IGNyZWF0ZVdvcmxkKDEzMzcpO1xuICBjb25zdCBiYXNlID0gc2FtcGxlTWFjcm9UZXJyYWluKGEsIDAsIDApO1xuICBjb25zdCB4ID0gTWF0aC5yb3VuZChiYXNlLngpLCB6ID0gTWF0aC5yb3VuZChiYXNlLnopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwoYSwgeCwgYmFzZS5oZWlnaHQsIHosIE1BVC5PUkUpKTtcbiAgYXNzZXJ0LmVxdWFsKHNhbXBsZU1hY3JvVGVycmFpbihhLCAwLCAwKS50b3AsIE1BVC5PUkUpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHNhbXBsZU1hY3JvVGVycmFpbihiLCAwLCAwKSwgYmFzZSwgJ2Fub3RoZXIgd29ybGQgcmVjZWl2ZWQgdGhlIGVkaXQnKTtcblxuICBjb25zdCBkaXN0YW50ID0gc2FtcGxlTWFjcm9UZXJyYWluKGEsIDMyLCAwKTtcbiAgY29uc3QgZHggPSBNYXRoLnJvdW5kKGRpc3RhbnQueCksIGR6ID0gTWF0aC5yb3VuZChkaXN0YW50LnopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwoYSwgZHgsIGRpc3RhbnQuaGVpZ2h0LCBkeiwgTUFULlNUT05FKSk7XG4gIGFzc2VydC5lcXVhbChzYW1wbGVNYWNyb1RlcnJhaW4oYSwgMCwgMCkudG9wLCBNQVQuT1JFKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChzYW1wbGVNYWNyb1RlcnJhaW4oYiwgMzIsIDApLCBkaXN0YW50KTtcbn0pO1xuXG50ZXN0KCdhbiBldmljdGVkIGVkaXRlZCBjaHVuayBpcyB0aGUgb25seSBjaHVuayBtYXRlcmlhbGl6ZWQgYnkgbWFjcm8gc2FtcGxpbmcnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoMTMzNyk7XG4gIGNvbnN0IGNlbGwgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDApO1xuICBjb25zdCB4ID0gTWF0aC5yb3VuZChjZWxsLngpLCB6ID0gTWF0aC5yb3VuZChjZWxsLnopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIGNlbGwuaGVpZ2h0LCB6LCBNQVQuU1RPTkUpKTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk7XG4gIGV2aWN0Q2h1bmsod29ybGQsIGtleSk7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5jaHVua3Muc2l6ZSwgMCk7XG4gIHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCk7XG4gIGFzc2VydC5lcXVhbChlbnN1cmVDaHVuayh3b3JsZCwgd29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk/LmtleSwga2V5KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChbLi4ud29ybGQuY2h1bmtzLmtleXMoKV0sIFtrZXldKTtcbn0pO1xuIiwgIi8vIFJlbmRlciBsYXllciBcdTIwMTQgY2h1bmtlZCAzRCB2b3hlbCBtZXNoZXIgKyBzdHJlYW1pbmcgKyBtYWNybyBMT0QuXG4vL1xuLy8gVGhlIHZpc2libGUgc3VyZmFjZSBpcyBkZXJpdmVkIGZyb20gdGhlIHNpbSdzIG9jY3VwYW5jeS9tYXRlcmlhbCB2b2x1bWUuXG4vLyBOZWFyIGNodW5rcyBhcmUgbWVzaGVkIGF0IDEgbSB3aXRoIGdyZWVkeSBmYWNlIG1lcmdpbmc7IHRoZSBmYXIgbGFuZHNjYXBlIGlzXG4vLyBhbiA4IG0gKHdvcmxkKSAvIDggbSAobWFwKSBtYWNybyBMT0Qgc2FtcGxlZCBmcm9tIHRoZSBzYW1lIGRldGVybWluaXN0aWNcbi8vIGdlbmVyYXRvci4gV2F0ZXIgaXMgYSBzaW5nbGUgc2VhLWxldmVsIHN1cmZhY2UgZGVyaXZlZCBmcm9tIHRoZSBzZWFiZWQgZGVwdGguXG4vL1xuLy8gTm8gYXByb24sIGhvcml6b24gcmluZyBvciBmb3VuZGF0aW9uIHNraXJ0OiB0aGUgd29ybGQgZWRnZSBpcyBvY2VhbiwgYW5kIHRoZVxuLy8gb2NlYW4gc3VyZmFjZSBleHRlbmRzIGZhciBiZXlvbmQgdGhlIDIwNDggbSBwbGF5YWJsZSBpc2xhbmQuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQgeyBtZXNoQ2h1bmtXYXRlciwgaW5zdGFsbEZhcldhdGVySG9sZSwgd2F0ZXJUaW1lIH0gZnJvbSAnLi93YXRlcic7XG5pbXBvcnQgeyBNZXNoQXJyYXlzLCBidWlsZFBhZGRlZCwgbWVzaFBhZGRlZCB9IGZyb20gJy4vbWVzaGVyJztcbmltcG9ydCB0eXBlIHsgQ2h1bmtXb3JrZXJQb29sIH0gZnJvbSAnLi9jaHVuay1wb29sJztcbmltcG9ydCB7XG4gIFdvcmxkLCBWb3hlbENodW5rLCBNYXRJZCwgU3VyZmFjZVNhbXBsZSwgR0VORVJBVE9SX1ZFUlNJT04sXG4gIFdPUkxEX1NJWkUsIEhBTEYsIENIVU5LX1NJWkUsIENIVU5LU19QRVJfU0lERSwgQ0hVTktfQVJFQSwgV09STERfSEVJR0hULFxuICBZX01JTiwgWV9NQVgsIFNFQV9MRVZFTCwgTUFULCBpc09wYXF1ZSxcbiAgY2h1bmtLZXksIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgd29ybGRUb0xvY2FsWCwgd29ybGRUb0xvY2FsWixcbiAgZ2V0Vm94ZWwsIGVuc3VyZUNodW5rLCBldmljdENodW5rLCBoYXNoMmksIGZibTIsXG4gIGVkaXRWZXJzaW9uLCBiYXNlSGVpZ2h0QXQsIGJhc2VUb3BNYXRlcmlhbEZvciwgaW5zdGFsbEJhc2VDaHVuaywgc2VlZEJhc2VDb2x1bW5zLFxufSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5pbXBvcnQge1xuICBNLCBILCBjb2xvckNhY2hlLCBjLCBDT0wsIFNIQURFLCBNQVhfUEVSRl9TQU1QTEVTLCByZWNvcmRTYW1wbGUsIHBlcmNlbnRpbGUsIGhlaWdodEJhbmQsIHN0b25lVG9uZSwgc2hhZGVBdCwga2V5Rm9yLCBmYWNlQ29sb3JDYWNoZSwgY29sb3JGb3JLZXksXG59IGZyb20gJy4vdm94ZWwtY29sb3JzJztcblxuY29uc3QgdGVycmFpbk1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICB2ZXJ0ZXhDb2xvcnM6IHRydWUsXG4gIHNpZGU6IFRIUkVFLkZyb250U2lkZSxcbn0pO1xudGVycmFpbk1hdGVyaWFsLm9uQmVmb3JlQ29tcGlsZSA9IChzaGFkZXIpID0+IHtcbiAgc2hhZGVyLnZlcnRleFNoYWRlciA9IHNoYWRlci52ZXJ0ZXhTaGFkZXJcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCAnI2luY2x1ZGUgPGNvbW1vbj5cXG5hdHRyaWJ1dGUgZmxvYXQgYU1hdDtcXG52YXJ5aW5nIHZlYzMgdldQb3M7XFxudmFyeWluZyB2ZWMzIHZXTnJtO1xcbnZhcnlpbmcgZmxvYXQgdk1hdDsnKVxuICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PicsICcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxcbnZXUG9zID0gKG1vZGVsTWF0cml4ICogdmVjNCh0cmFuc2Zvcm1lZCwgMS4wKSkueHl6O1xcbnZXTnJtID0gbm9ybWFsaXplKG1hdDMobW9kZWxNYXRyaXgpICogb2JqZWN0Tm9ybWFsKTtcXG52TWF0ID0gYU1hdDsnKTtcbiAgc2hhZGVyLmZyYWdtZW50U2hhZGVyID0gc2hhZGVyLmZyYWdtZW50U2hhZGVyXG4gICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgYCNpbmNsdWRlIDxjb21tb24+XG52YXJ5aW5nIHZlYzMgdldQb3M7XG52YXJ5aW5nIHZlYzMgdldOcm07XG52YXJ5aW5nIGZsb2F0IHZNYXQ7XG5mbG9hdCBoMjEodmVjMiBwKSB7IHJldHVybiBmcmFjdChzaW4oZG90KHAsIHZlYzIoMTI3LjEsIDMxMS43KSkpICogNDM3NTguNTQ1MzEyMyk7IH1cbmZsb2F0IHZuMih2ZWMyIHApIHtcbiAgdmVjMiBpID0gZmxvb3IocCk7IHZlYzIgZiA9IGZyYWN0KHApOyBmID0gZiAqIGYgKiAoMy4wIC0gMi4wICogZik7XG4gIHJldHVybiBtaXgobWl4KGgyMShpKSwgaDIxKGkgKyB2ZWMyKDEuMCwgMC4wKSksIGYueCksXG4gICAgICAgICAgICAgbWl4KGgyMShpICsgdmVjMigwLjAsIDEuMCkpLCBoMjEoaSArIHZlYzIoMS4wLCAxLjApKSwgZi54KSwgZi55KTtcbn1gKVxuICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29sb3JfZnJhZ21lbnQ+JywgYCNpbmNsdWRlIDxjb2xvcl9mcmFnbWVudD5cbntcbiAgdmVjMyBuID0gbm9ybWFsaXplKHZXTnJtKTtcbiAgZmxvYXQgdmVydCA9IDEuMCAtIHNtb290aHN0ZXAoMC4zNSwgMC43MCwgYWJzKG4ueSkpO1xuICBmbG9hdCBpc0dyYXNzID0gKCh2TWF0ID4gMC41ICYmIHZNYXQgPCAxLjUpIHx8ICh2TWF0ID4gOC41ICYmIHZNYXQgPCA5LjUpKSA/IDEuMCA6IDAuMDtcbiAgZmxvYXQgaXNTdG9uZSA9ICgodk1hdCA+IDQuNSAmJiB2TWF0IDwgNi41KSB8fCAodk1hdCA+IDcuNSAmJiB2TWF0IDwgOC41KSkgPyAxLjAgOiAwLjA7XG5cbiAgZmxvYXQgaG9yaXogPSBhYnMobi54KSA+IGFicyhuLnopID8gdldQb3MueiA6IHZXUG9zLng7XG4gIGZsb2F0IHJvdyA9IGZsb29yKHZXUG9zLnkpO1xuICBmbG9hdCBjb2wgPSBmbG9vcihob3Jpeik7XG4gIGZsb2F0IGggPSBoMjEodmVjMihjb2wsIHJvdykpO1xuICB2ZWMyIGYgPSB2ZWMyKGZyYWN0KGhvcml6KSwgZnJhY3QodldQb3MueSkpO1xuICBmbG9hdCBqb2ludCA9IHNtb290aHN0ZXAoMC4wLCAwLjA1NSwgbWluKGYueCwgMS4wIC0gZi54KSlcbiAgICAgICAgICAgICAgKiBzbW9vdGhzdGVwKDAuMCwgMC4wNTAsIG1pbihmLnksIDEuMCAtIGYueSkpO1xuICB2ZWMzIHN0b25lID0gbWl4KHZlYzMoMC42MiwgMC42MiwgMC41OCksIHZlYzMoMS4wNCwgMS4wMiwgMC45NSksIGgpO1xuICBzdG9uZSAqPSBtaXgoMC45MCwgMS4wLCBqb2ludCk7XG4gIHN0b25lICo9IG1peCgwLjkzLCAxLjAsIHNtb290aHN0ZXAoMC4wLCAwLjMwLCBmLnkpKTtcbiAgZGlmZnVzZUNvbG9yLnJnYiAqPSBtaXgodmVjMygxLjApLCBzdG9uZSwgdmVydCAqIGlzU3RvbmUpO1xuXG4gIGZsb2F0IGd5ID0gc21vb3Roc3RlcCgwLjQ1LCAwLjg4LCBhYnMobi55KSk7XG4gIGZsb2F0IGcxID0gdm4yKHZXUG9zLnh6ICogMS4zNSk7XG4gIGZsb2F0IGcyID0gdm4yKHZXUG9zLnh6ICogMC4xMSk7XG4gIHZlYzMgZ3Jhc3MgPSBtaXgodmVjMygwLjgyLCAwLjg2LCAwLjcyKSwgdmVjMygxLjA2LCAxLjA0LCAwLjk4KSwgZzEgKiAwLjQyICsgZzIgKiAwLjQ2ICsgdm4yKHZXUG9zLnh6ICogNC4zKSAqIDAuMTIpO1xuICBmbG9hdCBjZWxsID0gaDIxKGZsb29yKHZXUG9zLnh6KSArIDE3LjApO1xuICBncmFzcyAqPSAwLjk1ICsgMC4xMCAqIGNlbGw7XG4gIGRpZmZ1c2VDb2xvci5yZ2IgKj0gbWl4KHZlYzMoMS4wKSwgZ3Jhc3MsIGd5ICogaXNHcmFzcyk7XG59YCk7XG59O1xuXG5pbnRlcmZhY2UgTWVzaFJlc3VsdCB7IGdlb21ldHJ5OiBUSFJFRS5CdWZmZXJHZW9tZXRyeTsgdHJpYW5nbGVzOiBudW1iZXI7IH1cblxuLyoqIEJ1aWxkIGEgQnVmZmVyR2VvbWV0cnkgZnJvbSBtZXNoZXIgb3V0cHV0IChtYWluIHRocmVhZCkuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VvbWV0cnlGcm9tQXJyYXlzKGE6IE1lc2hBcnJheXMpOiBNZXNoUmVzdWx0IHtcbiAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYS5wb3NpdGlvbnMsIDMpKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdub3JtYWwnLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEubm9ybWFscywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhLmNvbG9ycywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2FNYXQnLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEubWF0cywgMSkpO1xuICBnZW9tZXRyeS5zZXRJbmRleChuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEuaW5kaWNlcywgMSkpO1xuICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgcmV0dXJuIHsgZ2VvbWV0cnksIHRyaWFuZ2xlczogYS50cmlhbmdsZXMgfTtcbn1cblxuLyoqIFBhZGRlZCB2b2x1bWUgZm9yIGEgcmVzaWRlbnQgY2h1bms7IG5laWdoYm91cnMgY29tZSBmcm9tIHRoZSB3b3JsZCAoM3gzIG11c3QgYmUgcmVzaWRlbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhZGRlZEZvcih3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogVWludDhBcnJheSB7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICByZXR1cm4gYnVpbGRQYWRkZWQoY2h1bmsuZGF0YSwgKHgsIHksIHopID0+IGdldFZveGVsKHdvcmxkLCBveCArIHgsIFlfTUlOICsgeSwgb3ogKyB6KSk7XG59XG5cbi8qKlxuICogR3JlZWR5IDNEIGZhY2UgbWVzaGVyIChzeW5jaHJvbm91cyBwYXRoKS4gQSBmYWNlIGlzIGVtaXR0ZWQgd2hlbiBhbiBvcGFxdWVcbiAqIHZveGVsIHRvdWNoZXMgYSBub24tb3BhcXVlIGNlbGwgKGFpciBvciB3YXRlcik7IHdhdGVyIHN1cmZhY2VzIGFyZSBtZXNoZWRcbiAqIHNlcGFyYXRlbHkgaW4gd2F0ZXIudHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXNoQ2h1bmsod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IE1lc2hSZXN1bHQge1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgcmV0dXJuIGdlb21ldHJ5RnJvbUFycmF5cyhtZXNoUGFkZGVkKHBhZGRlZEZvcih3b3JsZCwgY2h1bmspLCBjaHVuay5oZWlnaHRzLCBveCwgb3osIHdvcmxkLnNlZWQpKTtcbn1cblxuLyoqIE9uZSBvcGFxdWUgc2VhLWxldmVsIHN1cmZhY2UgZm9yIHRoZSB3aG9sZSB2aWV3LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkV2F0ZXJTdXJmYWNlKHdvcmxkOiBXb3JsZCwgc2l6ZSA9IDIwMDAwLCBzZWdtZW50cyA9IDk2KTogVEhSRUUuTWVzaCB7XG4gIGNvbnN0IGdlbyA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KHNpemUsIHNpemUsIHNlZ21lbnRzLCBzZWdtZW50cyk7XG4gIGdlby5yb3RhdGVYKC1NYXRoLlBJIC8gMik7XG4gIGNvbnN0IHBvcyA9IGdlby5hdHRyaWJ1dGVzLnBvc2l0aW9uO1xuICBjb25zdCBjb2xvcnMgPSBuZXcgRmxvYXQzMkFycmF5KHBvcy5jb3VudCAqIDMpO1xuICBjb25zdCB0bXAgPSBuZXcgVEhSRUUuQ29sb3IoKTtcbiAgY29uc3Qgc21vb3Roc3RlcCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgeDogbnVtYmVyKSA9PiB7XG4gICAgY29uc3QgdCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEsICh4IC0gYSkgLyAoYiAtIGEpKSk7XG4gICAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG4gIH07XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcG9zLmNvdW50OyBpKyspIHtcbiAgICBjb25zdCB4ID0gcG9zLmdldFgoaSksIHogPSBwb3MuZ2V0WihpKTtcbiAgICAvLyBUaGUgd2F0ZXIgcGxhbmUgc2FtcGxlcyB0aGUgc2VhYmVkIG9ubHkgZm9yIGEgbmFycm93IHNob3JlIHJpbS4gQSBkZXB0aFxuICAgIC8vIHJhbXAgb24gYSA0NyBtIGdyaWQgbWlzc2VkIHRoZSAxMCBtIHJpdmVyIGVudGlyZWx5IGFuZCB0dXJuZWQgaXQgd2hpdGU7XG4gICAgLy8gdGhlIHJpdmVyIGFuZCBsYWtlIHJlYWQgYmV0dGVyIGFzIHRoZSBzYW1lIGRlZXAgd2F0ZXIgYXMgdGhlIHNlYS5cbiAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBNYXRoLnJvdW5kKHgpLCBNYXRoLnJvdW5kKHopKTtcbiAgICBjb25zdCBzaG9yZSA9IHNtb290aHN0ZXAoLTAuOSwgLTAuMTUsIGgpICogKDEgLSBzbW9vdGhzdGVwKC0wLjE1LCAwLjQsIGgpKTtcbiAgICBjb25zdCBuID0gaGFzaDJpKE1hdGguZmxvb3IoeCAvIDQ1KSwgTWF0aC5mbG9vcih6IC8gNDUpLCB3b3JsZC5zZWVkICsgNTAxKTtcbiAgICB0bXAuY29weShDT0wud2F0ZXJNaWQpLmxlcnAoQ09MLndhdGVyRGVlcCwgMC4zNSArIDAuMzUgKiBuKTtcbiAgICAvLyBBIHdlYWsgc2hvcmUgdGludC4gQSBzdHJvbmcgb25lLCBzYW1wbGVkIG9uIGEgY29hcnNlIHBsYW5lLCBwcm9kdWNlZFxuICAgIC8vIHBhbGUgcmVjdGFuZ2xlcyBvdmVyIG9mZnNob3JlIHNlYW1vdW50cyBpbiB0aGUgbWFwIHZpZXcuXG4gICAgdG1wLmxlcnAoQ09MLndhdGVyUmltLCBzaG9yZSAqIDAuMTUpO1xuICAgIGNvbG9yc1tpICogM10gPSB0bXAucjsgY29sb3JzW2kgKiAzICsgMV0gPSB0bXAuZzsgY29sb3JzW2kgKiAzICsgMl0gPSB0bXAuYjtcbiAgfVxuICBnZW8uc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoY29sb3JzLCAzKSk7XG4gIC8vIE9wYXF1ZTogdGhlIHNlYS1sZXZlbCBzdXJmYWNlIGlzIHRoZSB3YXRlciByZWFkLiBBIHRyYW5zbHVjZW50IHBsYW5lIGxldFxuICAvLyB0aGUgbWFjcm8gc2VhYmVkIHNob3cgdGhyb3VnaCwgd2hpY2ggbWFkZSB0aGUgZmluaXRlIDIwNDggbSB3b3JsZCBlZGdlXG4gIC8vIHZpc2libGUgYXMgYSBzcXVhcmUgaW4gdGhlIGZpcnN0IE0wMDEgbWFwIGNhcHR1cmUuXG4gIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW8sIG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICB2ZXJ0ZXhDb2xvcnM6IHRydWUsXG4gIH0pKTtcbiAgbWVzaC5wb3NpdGlvbi55ID0gLTAuMDY7XG4gIG1lc2gucmVuZGVyT3JkZXIgPSAxO1xuICBtZXNoLm5hbWUgPSAnd2F0ZXJfc3VyZmFjZSc7XG4gIG1lc2gucmVjZWl2ZVNoYWRvdyA9IGZhbHNlO1xuICByZXR1cm4gbWVzaDtcbn1cblxuaW50ZXJmYWNlIE1hY3JvSG9sZSB7IG1pblg6IG51bWJlcjsgbWF4WDogbnVtYmVyOyBtaW5aOiBudW1iZXI7IG1heFo6IG51bWJlcjsgfVxuaW50ZXJmYWNlIE1hY3JvT3B0aW9ucyB7XG4gIHN0ZXA6IG51bWJlcjtcbiAgLyoqIFJlY3Rhbmd1bGFyIGhvbGUgY292ZXJlZCBieSB0aGUgbmVhciAxIG0gY2h1bmsgcmluZy4gKi9cbiAgaG9sZT86IE1hY3JvSG9sZTtcbn1cblxuaW50ZXJmYWNlIE1hY3JvUmVzdWx0IHtcbiAgbWVzaDogVEhSRUUuTWVzaDtcbiAgdHJpYW5nbGVzOiBudW1iZXI7XG4gIHNhbXBsZU1zOiBudW1iZXI7XG4gIHRvdGFsTXM6IG51bWJlcjtcbiAgc2FtcGxlQ2FjaGVkOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgTWFjcm9TYW1wbGVDYWNoZSB7XG4gIE46IG51bWJlcjtcbiAgaGVpZ2h0czogSW50MTZBcnJheTtcbiAgdG9wczogVWludDhBcnJheTtcbiAgdW5kZXJ3YXRlcjogVWludDhBcnJheTtcbiAgc2FtcGxlTXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNYWNyb1RlcnJhaW5TYW1wbGUgeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IHRvcDogTWF0SWQ7IHVuZGVyd2F0ZXI6IGJvb2xlYW47IH1cblxuLy8gQ2FjaGUgdGhlIGRldGVybWluaXN0aWMgYmFzZSBncmlkIGFuZCB0aGUgYXV0aG9yaXRhdGl2ZSBlZGl0ZWQgZ3JpZCBzZXBhcmF0ZWx5LlxuLy8gQmFzZSBlbnRyaWVzIG5ldmVyIG5lZWQgaW52YWxpZGF0aW9uLiBFZGl0ZWQgZW50cmllcyBhcmUgc2NvcGVkIGJ5IFdvcmxkIGlkZW50aXR5XG4vLyAodHdvIHNhbWUtc2VlZCB3b3JsZHMgY2FuIGhhdmUgZGlmZmVyZW50IGVkaXRzKSBhbmQgYnkgYm90aCB0aGUgY29hcnNlIGVkaXRcbi8vIHJldmlzaW9uIGFuZCBjaHVuayBzdHJlYW1pbmcsIHNpbmNlIGV2aWN0aW5nL3JlZ2VuZXJhdGluZyBkYXRhIGFuZCBzbmFwc2hvdFxuLy8gcmVzdG9yYXRpb24gZG8gbm90IG5lY2Vzc2FyaWx5IHByb2R1Y2UgYSBuZXcgY29hcnNlIHJldmlzaW9uLiBPbmx5IGNodW5rcyB3aXRoXG4vLyBkdXJhYmxlIHZveGVsIGRlbHRhcyBhcmUgbWF0ZXJpYWxpemVkOyB0aGUgb3RoZXIgNjR4NjQgY2VsbHMgcmVtYWluIGJhc2Ugc2FtcGxlcy5cbmludGVyZmFjZSBNYWNyb1dvcmxkQ2FjaGVzIHtcbiAgYmFzZTogTWFwPG51bWJlciwgTWFjcm9TYW1wbGVDYWNoZT47XG4gIGVkaXRlZDogTWFwPHN0cmluZywgTWFjcm9TYW1wbGVDYWNoZT47XG4gIC8qKiBTcGFyc2UgYXV0aG9yaXRhdGl2ZSBjb2x1bW5zLCBpbmRlcGVuZGVudCBvZiB0aGUgbWVzaCBzYW1wbGluZyByZXNvbHV0aW9uLiAqL1xuICBjb2x1bW5zOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCB7IGhlaWdodDogbnVtYmVyOyB0b3A6IE1hdElkIH0+PjtcbiAgcmV2aXNpb246IG51bWJlcjtcbn1cbmNvbnN0IG1hY3JvU2FtcGxlQ2FjaGUgPSBuZXcgV2Vha01hcDxXb3JsZCwgTWFjcm9Xb3JsZENhY2hlcz4oKTtcblxuZnVuY3Rpb24gc3luY01hY3JvQ29sdW1ucyh3b3JsZDogV29ybGQsIGNhY2hlczogTWFjcm9Xb3JsZENhY2hlcyk6IHZvaWQge1xuICBpZiAod29ybGQucmV2aXNpb24gPT09IGNhY2hlcy5yZXZpc2lvbikgcmV0dXJuO1xuICAvLyBTbmFwc2hvdCByZXN0b3JlIHJlcGxhY2VzIGVkaXRzIGFuZCBjaHVua3MgYmVmb3JlIGFzc2lnbmluZyBpdHMgc2F2ZWRcbiAgLy8gcmV2aXNpb24uIE5ldmVyIG1peCByZW1lbWJlcmVkIGNvbHVtbnMgZnJvbSB0aGF0IHByZXZpb3VzIHdvcmxkIHN0YXRlLlxuICBjYWNoZXMuY29sdW1ucy5jbGVhcigpO1xuICAvLyBBIG5vcm1hbCBlZGl0IGhhcyBhbHJlYWR5IHVwZGF0ZWQgdGhlIGxvYWRlZCBjaHVuaywgc28gaXQgY29zdHMgb25seSB0aGVcbiAgLy8gZWRpdGVkIGNodW5rcy4gUmVzdG9yZWQvZXZpY3RlZCBlZGl0ZWQgY2h1bmtzIGFyZSBnZW5lcmF0ZWQgb24gZGVtYW5kLlxuICBmb3IgKGNvbnN0IFtrZXksIGVkaXRzXSBvZiB3b3JsZC5lZGl0cykge1xuICAgIGlmICghZWRpdHMuc2l6ZSB8fCAhd29ybGQuY2h1bmtzLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KSE7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgY29sdW1ucyA9IG5ldyBNYXA8bnVtYmVyLCB7IGhlaWdodDogbnVtYmVyOyB0b3A6IE1hdElkIH0+KCk7XG4gICAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBjb2x1bW5zLnNldCgob3ggKyBseCArIEhBTEYpICogV09STERfU0laRSArIG96ICsgbHogKyBIQUxGLCB7XG4gICAgICAgICAgaGVpZ2h0OiBjaHVuay5oZWlnaHRzW2NvbF0gKyBZX01JTiArIDEsXG4gICAgICAgICAgdG9wOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSBhcyBNYXRJZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIGNhY2hlcy5jb2x1bW5zLnNldChrZXksIGNvbHVtbnMpO1xuICB9XG4gIGNhY2hlcy5lZGl0ZWQuY2xlYXIoKTtcbiAgY2FjaGVzLnJldmlzaW9uID0gd29ybGQucmV2aXNpb247XG59XG5cbmZ1bmN0aW9uIG1hY3JvQ29sdW1uKHdvcmxkOiBXb3JsZCwgY2FjaGVzOiBNYWNyb1dvcmxkQ2FjaGVzLCBrZXk6IHN0cmluZywgaW5kZXg6IG51bWJlcikge1xuICBsZXQgY29sdW1ucyA9IGNhY2hlcy5jb2x1bW5zLmdldChrZXkpO1xuICBpZiAoY29sdW1ucykgcmV0dXJuIGNvbHVtbnMuZ2V0KGluZGV4KTtcbiAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgaWYgKCFlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgLy8gQ2FwdHVyZSBvbmNlIGFmdGVyIGxvYWRpbmcuIExvYWRlZCBjaHVua3MgYXJlIGNoZWFwIGFuZCBkbyBub3QgcmVxdWlyZVxuICAvLyB3YWxraW5nIGV2ZXJ5IHZveGVsOyB0aGlzIHJlbWFpbnMgTygzMngzMikgcGVyIGVkaXRlZCBjaHVuay5cbiAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSkhO1xuICBjb2x1bW5zID0gbmV3IE1hcCgpO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLnNldCgob3ggKyBseCArIEhBTEYpICogV09STERfU0laRSArIG96ICsgbHogKyBIQUxGLCB7XG4gICAgICAgIGhlaWdodDogY2h1bmsuaGVpZ2h0c1tjb2xdICsgWV9NSU4gKyAxLFxuICAgICAgICB0b3A6IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdIGFzIE1hdElkLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGNhY2hlcy5jb2x1bW5zLnNldChrZXksIGNvbHVtbnMpO1xuICByZXR1cm4gY29sdW1ucy5nZXQoaW5kZXgpO1xufVxuXG5jb25zdCBtYWNyb0VkaXRLZXlNZW1vID0gbmV3IFdlYWtNYXA8V29ybGQsIHsgdmVyc2lvbjogbnVtYmVyOyBrZXk6IHN0cmluZyB9PigpO1xuXG4vKiogTWVtb2l6ZWQgYnkgdGhlIHdvcmxkJ3MgZWRpdCB2ZXJzaW9uOiBPKDEpIHBlciBmcmFtZSB1bmxlc3MgZWRpdHMgY2hhbmdlZC4gKi9cbmZ1bmN0aW9uIG1hY3JvRWRpdEtleSh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCB2ZXJzaW9uID0gZWRpdFZlcnNpb24od29ybGQpO1xuICBjb25zdCBtZW1vID0gbWFjcm9FZGl0S2V5TWVtby5nZXQod29ybGQpO1xuICBpZiAobWVtbyAmJiBtZW1vLnZlcnNpb24gPT09IHZlcnNpb24pIHJldHVybiBtZW1vLmtleTtcbiAgY29uc3Qga2V5ID0gY29tcHV0ZU1hY3JvRWRpdEtleSh3b3JsZCk7XG4gIG1hY3JvRWRpdEtleU1lbW8uc2V0KHdvcmxkLCB7IHZlcnNpb24sIGtleSB9KTtcbiAgcmV0dXJuIGtleTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZU1hY3JvRWRpdEtleSh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICAvLyBJbmNsdWRlIGEgY29tbXV0YXRpdmUgY29udGVudCBmaW5nZXJwcmludCBhcyB3ZWxsIGFzIGNvdW50OiBldmljdGlvbiBhbmRcbiAgLy8gc25hcHNob3QgcmVzdG9yZSBieXBhc3MgdGhlIGNvYXJzZSBXb3JsZC5yZXZpc2lvbiBwYXRoLCBhbmQgYSByZXN0b3JlZFxuICAvLyBkZWx0YSBjYW4gaGF2ZSB0aGUgc2FtZSBudW1iZXIgb2YgY2VsbHMgd2l0aCBkaWZmZXJlbnQgaW5kaWNlcy9tYXRlcmlhbHMuXG4gIHJldHVybiBbLi4ud29ybGQuZWRpdHMuZW50cmllcygpXVxuICAgIC5maWx0ZXIoKFssIGVkaXRzXSkgPT4gZWRpdHMuc2l6ZSA+IDApXG4gICAgLm1hcCgoW2tleSwgZWRpdHNdKSA9PiB7XG4gICAgICBsZXQgc3VtID0gMDtcbiAgICAgIGxldCBtaXhlZCA9IDA7XG4gICAgICBmb3IgKGNvbnN0IFtpbmRleCwgbWF0ZXJpYWxdIG9mIGVkaXRzKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gTWF0aC5pbXVsKGluZGV4ICsgMSwgMzEpICsgbWF0ZXJpYWw7XG4gICAgICAgIHN1bSA9IChzdW0gKyB2YWx1ZSkgfCAwO1xuICAgICAgICBtaXhlZCA9IChtaXhlZCBeIE1hdGguaW11bCh2YWx1ZSwgMHg0NWQ5ZjNiKSkgfCAwO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAke2tleX06JHtlZGl0cy5zaXplfToke3N1bX06JHttaXhlZH1gO1xuICAgIH0pXG4gICAgLnNvcnQoKVxuICAgIC5qb2luKCd8Jyk7XG59XG5cbmZ1bmN0aW9uIGVkaXRlZE1hY3JvU2FtcGxlcyh3b3JsZDogV29ybGQsIHN0ZXA6IG51bWJlciwgY2FjaGU6IE1hY3JvU2FtcGxlQ2FjaGUpOiBNYWNyb1NhbXBsZUNhY2hlIHtcbiAgY29uc3QgY2FjaGVzID0gbWFjcm9TYW1wbGVDYWNoZS5nZXQod29ybGQpITtcbiAgY29uc3Qga2V5ID0gYCR7c3RlcH06JHttYWNyb0VkaXRLZXkod29ybGQpfWA7XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlcy5lZGl0ZWQuZ2V0KGtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG5cbiAgZm9yIChjb25zdCBbY2h1bmssIGVkaXRzXSBvZiB3b3JsZC5lZGl0cykge1xuICAgIGlmIChlZGl0cy5zaXplICYmICFjYWNoZXMuY29sdW1ucy5oYXMoY2h1bmspKSBtYWNyb0NvbHVtbih3b3JsZCwgY2FjaGVzLCBjaHVuaywgMCk7XG4gIH1cblxuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCB7IE4sIGhlaWdodHMsIHRvcHMsIHVuZGVyd2F0ZXIgfSA9IGNhY2hlO1xuICBjb25zdCBzYW1wbGUgPSB7XG4gICAgTixcbiAgICBoZWlnaHRzOiBuZXcgSW50MTZBcnJheShoZWlnaHRzKSxcbiAgICB0b3BzOiBuZXcgVWludDhBcnJheSh0b3BzKSxcbiAgICB1bmRlcndhdGVyOiBuZXcgVWludDhBcnJheSh1bmRlcndhdGVyKSxcbiAgICBzYW1wbGVNczogY2FjaGUuc2FtcGxlTXMsXG4gIH07XG4gIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgIGNvbnN0IHggPSBNYXRoLnJvdW5kKC1IQUxGICsgKGkgKyAwLjUpICogc3RlcCk7XG4gICAgICBjb25zdCB6ID0gTWF0aC5yb3VuZCgtSEFMRiArIChqICsgMC41KSAqIHN0ZXApO1xuICAgICAgY29uc3QgY2h1bmsgPSBjaHVua0tleSh3b3JsZFRvQ2h1bmtYKHgpLCB3b3JsZFRvQ2h1bmtaKHopKTtcbiAgICAgIGlmICghd29ybGQuZWRpdHMuZ2V0KGNodW5rKT8uc2l6ZSkgY29udGludWU7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBjb25zdCBlZGl0ZWQgPSBtYWNyb0NvbHVtbih3b3JsZCwgY2FjaGVzLCBjaHVuaywgKHggKyBIQUxGKSAqIFdPUkxEX1NJWkUgKyB6ICsgSEFMRik7XG4gICAgICBpZiAoIWVkaXRlZCkgY29udGludWU7XG4gICAgICBzYW1wbGUuaGVpZ2h0c1tpZHhdID0gZWRpdGVkLmhlaWdodDtcbiAgICAgIHNhbXBsZS50b3BzW2lkeF0gPSBlZGl0ZWQudG9wO1xuICAgICAgc2FtcGxlLnVuZGVyd2F0ZXJbaWR4XSA9IHNhbXBsZS5oZWlnaHRzW2lkeF0gPCBTRUFfTEVWRUwgPyAxIDogMDtcbiAgICB9XG4gIH1cbiAgc2FtcGxlLnNhbXBsZU1zID0gcGVyZm9ybWFuY2Uubm93KCkgLSB0MDtcbiAgY2FjaGVzLmVkaXRlZC5zZXQoa2V5LCBzYW1wbGUpO1xuICByZXR1cm4gc2FtcGxlO1xufVxuXG5mdW5jdGlvbiBtYWNyb1NhbXBsZXMod29ybGQ6IFdvcmxkLCBzdGVwOiBudW1iZXIpOiBNYWNyb1NhbXBsZUNhY2hlIHtcbiAgbGV0IGNhY2hlcyA9IG1hY3JvU2FtcGxlQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZXMpIHtcbiAgICBjYWNoZXMgPSB7IGJhc2U6IG5ldyBNYXAoKSwgZWRpdGVkOiBuZXcgTWFwKCksIGNvbHVtbnM6IG5ldyBNYXAoKSwgcmV2aXNpb246IC0xIH07XG4gICAgbWFjcm9TYW1wbGVDYWNoZS5zZXQod29ybGQsIGNhY2hlcyk7XG4gIH1cbiAgc3luY01hY3JvQ29sdW1ucyh3b3JsZCwgY2FjaGVzKTtcbiAgY29uc3QgY2FjaGVkID0gY2FjaGVzLmJhc2UuZ2V0KHN0ZXApO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gZWRpdGVkTWFjcm9TYW1wbGVzKHdvcmxkLCBzdGVwLCBjYWNoZWQpO1xuXG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IE4gPSBNYXRoLmNlaWwoV09STERfU0laRSAvIHN0ZXApO1xuICBjb25zdCBoZWlnaHRzID0gbmV3IEludDE2QXJyYXkoTiAqIE4pO1xuICBjb25zdCB0b3BzID0gbmV3IFVpbnQ4QXJyYXkoTiAqIE4pO1xuICBjb25zdCB1bmRlcndhdGVyID0gbmV3IFVpbnQ4QXJyYXkoTiAqIE4pO1xuICBjb25zdCBjZWxsWCA9IChpOiBudW1iZXIpID0+IC1IQUxGICsgKGkgKyAwLjUpICogc3RlcDtcbiAgY29uc3QgY2VsbFogPSAoajogbnVtYmVyKSA9PiAtSEFMRiArIChqICsgMC41KSAqIHN0ZXA7XG5cbiAgZm9yIChsZXQgaiA9IDA7IGogPCBOOyBqKyspIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgY29uc3QgeCA9IGNlbGxYKGkpLCB6ID0gY2VsbFooaik7XG4gICAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBNYXRoLnJvdW5kKHgpLCBNYXRoLnJvdW5kKHopKTtcbiAgICAgIGNvbnN0IGlkeCA9IGogKiBOICsgaTtcbiAgICAgIGhlaWdodHNbaWR4XSA9IGg7XG4gICAgICBpZiAoaCA8IFNFQV9MRVZFTCkgdW5kZXJ3YXRlcltpZHhdID0gMTtcbiAgICB9XG4gIH1cblxuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBpZiAodW5kZXJ3YXRlcltpZHhdKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGggPSBoZWlnaHRzW2lkeF07XG4gICAgICBjb25zdCB4ID0gY2VsbFgoaSksIHogPSBjZWxsWihqKTtcbiAgICAgIGxldCBzbG9wZSA9IDA7XG4gICAgICBsZXQgbmVhcldhdGVyID0gZmFsc2U7XG4gICAgICBjb25zdCBucyA9IFtbLTEsIDBdLCBbMSwgMF0sIFswLCAtMV0sIFswLCAxXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIG5zKSB7XG4gICAgICAgIGNvbnN0IG54ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oTiAtIDEsIGkgKyBkeCkpO1xuICAgICAgICBjb25zdCBueiA9IE1hdGgubWF4KDAsIE1hdGgubWluKE4gLSAxLCBqICsgZHopKTtcbiAgICAgICAgY29uc3QgbmggPSBoZWlnaHRzW256ICogTiArIG54XTtcbiAgICAgICAgc2xvcGUgPSBNYXRoLm1heChzbG9wZSwgTWF0aC5hYnMoaCAtIG5oKSk7XG4gICAgICAgIGlmIChuaCA8IFNFQV9MRVZFTCArIDEpIG5lYXJXYXRlciA9IHRydWU7XG4gICAgICB9XG4gICAgICB0b3BzW2lkeF0gPSBiYXNlVG9wTWF0ZXJpYWxGb3Iod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgICAgIE1hdGgucm91bmQoeCksIE1hdGgucm91bmQoeiksIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNhY2hlOiBNYWNyb1NhbXBsZUNhY2hlID0ge1xuICAgIE4sIGhlaWdodHMsIHRvcHMsIHVuZGVyd2F0ZXIsXG4gICAgc2FtcGxlTXM6IHBlcmZvcm1hbmNlLm5vdygpIC0gdDAsXG4gIH07XG4gIGNhY2hlcy5iYXNlLnNldChzdGVwLCBjYWNoZSk7XG4gIHJldHVybiBlZGl0ZWRNYWNyb1NhbXBsZXMod29ybGQsIHN0ZXAsIGNhY2hlKTtcbn1cblxuLyoqIEF1dGhvcml0YXRpdmUgbWFjcm8tZ3JpZCB2YWx1ZSBhdCBhIHdvcmxkIGNvbHVtbiAoc3RlcCBkZWZhdWx0cyB0byA4IG0pLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBzdGVwID0gOCk6IE1hY3JvVGVycmFpblNhbXBsZSB7XG4gIGNvbnN0IGNhY2hlID0gbWFjcm9TYW1wbGVzKHdvcmxkLCBzdGVwKTtcbiAgY29uc3QgaSA9IE1hdGgubWF4KDAsIE1hdGgubWluKGNhY2hlLk4gLSAxLCBNYXRoLmZsb29yKCh4ICsgSEFMRikgLyBzdGVwKSkpO1xuICBjb25zdCBqID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oY2FjaGUuTiAtIDEsIE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIHN0ZXApKSk7XG4gIGNvbnN0IGlkeCA9IGogKiBjYWNoZS5OICsgaTtcbiAgcmV0dXJuIHtcbiAgICB4OiAtSEFMRiArIChpICsgMC41KSAqIHN0ZXAsXG4gICAgejogLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwLFxuICAgIGhlaWdodDogY2FjaGUuaGVpZ2h0c1tpZHhdLCB0b3A6IGNhY2hlLnRvcHNbaWR4XSBhcyBNYXRJZCxcbiAgICB1bmRlcndhdGVyOiBjYWNoZS51bmRlcndhdGVyW2lkeF0gIT09IDAsXG4gIH07XG59XG5cbi8qKlxuICogRmFyIGxhbmRzY2FwZSBMT0QgZGVyaXZlZCBmcm9tIHRoZSBzYW1lIGRldGVybWluaXN0aWMgc3VyZmFjZSBzYW1wbGVyLlxuICogQ2VsbHMgYmVsb3cgc2VhIGxldmVsIGFyZSBvbWl0dGVkOiB0aGUgb3BhcXVlIHdhdGVyIHN1cmZhY2UgaXMgdGhlIG9ubHlcbiAqIHdhdGVyIHJlYWQsIHNvIHRoZSBmaW5pdGUgMjA0OCBtIHdvcmxkIGNhbm5vdCBhcHBlYXIgYXMgYSBzcXVhcmUgc2VhYmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRNYWNyb01lc2god29ybGQ6IFdvcmxkLCBvcHRzOiBNYWNyb09wdGlvbnMpOiBNYWNyb1Jlc3VsdCB7XG4gIGNvbnN0IHRvdGFsVDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgeyBzdGVwLCBob2xlIH0gPSBvcHRzO1xuICBjb25zdCBjYWNoZUtleSA9IGAke3N0ZXB9OiR7bWFjcm9FZGl0S2V5KHdvcmxkKX1gO1xuICBjb25zdCBzYW1wbGVDYWNoZWQgPSBtYWNyb1NhbXBsZUNhY2hlLmdldCh3b3JsZCk/LmVkaXRlZC5oYXMoY2FjaGVLZXkpID8/IGZhbHNlO1xuICBjb25zdCBjYWNoZSA9IG1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCk7XG4gIGNvbnN0IHsgTiwgaGVpZ2h0cywgdG9wcywgdW5kZXJ3YXRlciB9ID0gY2FjaGU7XG4gIGNvbnN0IGhvbGVDZWxsID0gbmV3IFVpbnQ4QXJyYXkoTiAqIE4pO1xuICBjb25zdCBjZWxsWCA9IChpOiBudW1iZXIpID0+IC1IQUxGICsgKGkgKyAwLjUpICogc3RlcDtcbiAgY29uc3QgY2VsbFogPSAoajogbnVtYmVyKSA9PiAtSEFMRiArIChqICsgMC41KSAqIHN0ZXA7XG5cbiAgaWYgKGhvbGUpIHtcbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgICAgY29uc3QgeCA9IGNlbGxYKGkpLCB6ID0gY2VsbFooaik7XG4gICAgICAgIGlmICh4ID4gaG9sZS5taW5YICYmIHggPCBob2xlLm1heFggJiYgeiA+IGhvbGUubWluWiAmJiB6IDwgaG9sZS5tYXhaKSB7XG4gICAgICAgICAgaG9sZUNlbGxbaiAqIE4gKyBpXSA9IDE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBzYW1wbGVNcyA9IHNhbXBsZUNhY2hlZCA/IDAgOiBjYWNoZS5zYW1wbGVNcztcbiAgY29uc3QgcG9zaXRpb25zOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBub3JtYWxzOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBjb2xvcnM6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGluZGljZXM6IG51bWJlcltdID0gW107XG5cbiAgY29uc3QgcHVzaFF1YWQgPSAocDogbnVtYmVyW11bXSwgbjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdLCBjb2xvcjogVEhSRUUuQ29sb3IpID0+IHtcbiAgICBjb25zdCBiYXNlID0gcG9zaXRpb25zLmxlbmd0aCAvIDM7XG4gICAgZm9yIChjb25zdCB2IG9mIHApIHtcbiAgICAgIHBvc2l0aW9ucy5wdXNoKHZbMF0sIHZbMV0sIHZbMl0pO1xuICAgICAgbm9ybWFscy5wdXNoKG5bMF0sIG5bMV0sIG5bMl0pO1xuICAgICAgY29sb3JzLnB1c2goY29sb3IuciwgY29sb3IuZywgY29sb3IuYik7XG4gICAgfVxuICAgIGluZGljZXMucHVzaChiYXNlLCBiYXNlICsgMSwgYmFzZSArIDIsIGJhc2UsIGJhc2UgKyAyLCBiYXNlICsgMyk7XG4gIH07XG5cbiAgY29uc3QgY2VsbFNoYWRlID0gKGk6IG51bWJlciwgajogbnVtYmVyKSA9PiAwLjk0ICsgMC4xMiAqIGhhc2gyaShpLCBqLCB3b3JsZC5zZWVkICsgNDAxKTtcblxuICBjb25zdCB0b3BDb2xvciA9ICh0b3A6IE1hdElkLCBoOiBudW1iZXIsIGk6IG51bWJlciwgajogbnVtYmVyKTogVEhSRUUuQ29sb3IgPT4ge1xuICAgIGNvbnN0IHNoYWRlID0gY2VsbFNoYWRlKGksIGopO1xuICAgIGNvbnN0IG1vaXN0ID0gZmJtMihjZWxsWChpKSAvIDEzMCwgY2VsbFooaikgLyAxMzAsIHdvcmxkLnNlZWQgKyA2MDEsIDMpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gQ09MLnNhbmQuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihzaGFkZSAqIDAuOTApO1xuICAgIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBDT0wuZ3JhdmVsLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSkge1xuICAgICAgcmV0dXJuIENPTC5zdG9uZVNoYWRlLmNsb25lKCkubGVycChDT0wuc3RvbmVCLCAwLjM1ICsgMC4yNSAqIHNoYWRlKS5tdWx0aXBseVNjYWxhcihcbiAgICAgICAgKDAuODIgKyAwLjE0ICogTWF0aC5taW4oMSwgTWF0aC5tYXgoMCwgKGggKyA4KSAvIDcwKSkpICogKDAuOTIgKyAwLjA4ICogc2hhZGUpLFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHRvcCA9PT0gTUFULk9SRSkgcmV0dXJuIENPTC5vcmUuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihzaGFkZSk7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNOT1cpIHJldHVybiBDT0wuc25vdy5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKDAuOTQgKyAwLjA4ICogc2hhZGUpO1xuICAgIC8vIEZvcmVzdC1mbG9vciBwYXRjaGVzIGJyZWFrIHVwIHRoZSB1bmlmb3JtIGdyZWVuIG9mIHRoZSBmYXIgTE9ELiBUaGV5XG4gICAgLy8gYXJlIGEgY29sb3VyIGFwcHJveGltYXRpb24sIG5vdCBleHRyYSBnZW9tZXRyeTsgdGhlIG5lYXIgcmluZyBoYXMgcmVhbFxuICAgIC8vIFN0eWwgdHJlZXMuXG4gICAgcmV0dXJuIENPTC5ncmFzc1RvcFtoZWlnaHRCYW5kKGgpXS5jbG9uZSgpXG4gICAgICAubGVycChDT0wuZ3Jhc3NDYXAsIDAuMTIgKyAwLjM0ICogbW9pc3QpXG4gICAgICAubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICB9O1xuXG4gIGNvbnN0IHNpZGVDb2xvciA9ICh0b3A6IE1hdElkLCBoOiBudW1iZXIsIG5oOiBudW1iZXIsIGk6IG51bWJlciwgajogbnVtYmVyKTogVEhSRUUuQ29sb3IgPT4ge1xuICAgIGNvbnN0IGRyb3AgPSBoIC0gbmg7XG4gICAgY29uc3Qgc2hhZGUgPSAwLjkwICsgMC4xMCAqIGhhc2gyaShpLCBqLCB3b3JsZC5zZWVkICsgNDAyKTtcbiAgICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIENPTC5zYW5kLmNsb25lKCkubGVycChDT0wuc3RvbmVCLCBkcm9wID4gNSA/IDAuNTUgOiAwLjIpLm11bHRpcGx5U2NhbGFyKHNoYWRlICogMC45Mik7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNUT05FKSB7XG4gICAgICByZXR1cm4gQ09MLnN0b25lU2hhZGUuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihcbiAgICAgICAgKDAuODAgKyAwLjE2ICogTWF0aC5taW4oMSwgTWF0aC5tYXgoMCwgKGggKyA4KSAvIDcwKSkpICogc2hhZGUsXG4gICAgICApO1xuICAgIH1cbiAgICAvLyBBIGdyYXNzLXRvcHBlZCBiYW5rIGlzIG5vdCBhIHN0b25lIGNsaWZmLCBob3dldmVyIHRhbGwgdGhlIDggbSBtYWNyb1xuICAgIC8vIGNlbGwgbWFrZXMgaXQgbG9vay4gS2VlcGluZyB0aGUgc2lkZSBpbiB0aGUgc29pbCByYW5nZSByZW1vdmVkIHRoZVxuICAgIC8vIGJyaWdodCB3aGl0ZSBxdWFycnkgd2FsbHMgYXJvdW5kIHRoZSByaXZlciBhbmQgbGFrZSBpbiB0aGUgd2lkZSB2aWV3LlxuICAgIGlmIChkcm9wID4gNCkgcmV0dXJuIENPTC5ncmFzc0NhcC5jbG9uZSgpLmxlcnAoQ09MLm9jaHJlLCAwLjU1KS5tdWx0aXBseVNjYWxhcihzaGFkZSk7XG4gICAgcmV0dXJuIENPTC5ncmFzc0NhcC5jbG9uZSgpLmxlcnAoQ09MLnN0b25lQiwgMC4yMikubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICB9O1xuXG4gIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgIGNvbnN0IGlkeCA9IGogKiBOICsgaTtcbiAgICAgIGlmIChob2xlQ2VsbFtpZHhdIHx8IHVuZGVyd2F0ZXJbaWR4XSkgY29udGludWU7XG4gICAgICBjb25zdCBoID0gaGVpZ2h0c1tpZHhdO1xuICAgICAgY29uc3QgdG9wID0gdG9wc1tpZHhdIGFzIE1hdElkO1xuICAgICAgY29uc3QgeDAgPSAtSEFMRiArIGkgKiBzdGVwLCB4MSA9IHgwICsgc3RlcDtcbiAgICAgIGNvbnN0IHowID0gLUhBTEYgKyBqICogc3RlcCwgejEgPSB6MCArIHN0ZXA7XG5cbiAgICAgIHB1c2hRdWFkKFxuICAgICAgICBbW3gwLCBoLCB6MF0sIFt4MCwgaCwgejFdLCBbeDEsIGgsIHoxXSwgW3gxLCBoLCB6MF1dLFxuICAgICAgICBbMCwgMSwgMF0sXG4gICAgICAgIHRvcENvbG9yKHRvcCwgaCwgaSwgaiksXG4gICAgICApO1xuXG4gICAgICBjb25zdCBjaGVjayA9IChkaTogbnVtYmVyLCBkajogbnVtYmVyKSA9PiB7XG4gICAgICAgIGNvbnN0IG5pID0gaSArIGRpLCBuaiA9IGogKyBkajtcbiAgICAgICAgbGV0IG5oOiBudW1iZXI7XG4gICAgICAgIGlmIChuaSA8IDAgfHwgbmogPCAwIHx8IG5pID49IE4gfHwgbmogPj0gTikge1xuICAgICAgICAgIC8vIFRoZSB3b3JsZCBlZGdlIGlzIG9jZWFuLiBEbyBub3QgZHJhdyBhIHNpZGUgZmFjZSBkb3duIHRvIHRoZVxuICAgICAgICAgIC8vIHdhdGVyIGhlcmU7IHRoZSBvcGFxdWUgd2F0ZXIgcGxhbmUgYWxyZWFkeSBjb3ZlcnMgdGhlIGJvdW5kYXJ5LlxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBuaWR4ID0gbmogKiBOICsgbmk7XG4gICAgICAgICAgaWYgKGhvbGVDZWxsW25pZHhdKSByZXR1cm47XG4gICAgICAgICAgbmggPSB1bmRlcndhdGVyW25pZHhdID8gTWF0aC5tYXgoU0VBX0xFVkVMIC0gMC41LCBoZWlnaHRzW25pZHhdKSA6IGhlaWdodHNbbmlkeF07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGggPD0gbmgpIHJldHVybjtcbiAgICAgICAgY29uc3QgY29sID0gc2lkZUNvbG9yKHRvcCwgaCwgbmgsIGksIGopO1xuICAgICAgICBpZiAoZGkgPT09IDEpIHtcbiAgICAgICAgICBwdXNoUXVhZChbW3gxLCBuaCwgejBdLCBbeDEsIGgsIHowXSwgW3gxLCBoLCB6MV0sIFt4MSwgbmgsIHoxXV0sIFsxLCAwLCAwXSwgY29sKTtcbiAgICAgICAgfSBlbHNlIGlmIChkaSA9PT0gLTEpIHtcbiAgICAgICAgICBwdXNoUXVhZChbW3gwLCBuaCwgejBdLCBbeDAsIG5oLCB6MV0sIFt4MCwgaCwgejFdLCBbeDAsIGgsIHowXV0sIFstMSwgMCwgMF0sIGNvbCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZGogPT09IDEpIHtcbiAgICAgICAgICBwdXNoUXVhZChbW3gwLCBuaCwgejFdLCBbeDEsIG5oLCB6MV0sIFt4MSwgaCwgejFdLCBbeDAsIGgsIHoxXV0sIFswLCAwLCAxXSwgY29sKTtcbiAgICAgICAgfSBlbHNlIGlmIChkaiA9PT0gLTEpIHtcbiAgICAgICAgICBwdXNoUXVhZChbW3gwLCBuaCwgejBdLCBbeDAsIGgsIHowXSwgW3gxLCBoLCB6MF0sIFt4MSwgbmgsIHowXV0sIFswLCAwLCAtMV0sIGNvbCk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBjaGVjaygxLCAwKTsgY2hlY2soLTEsIDApOyBjaGVjaygwLCAxKTsgY2hlY2soMCwgLTEpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJ1ZmZlckdlb21ldHJ5KCk7XG4gIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgncG9zaXRpb24nLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbnMsIDMpKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdub3JtYWwnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShub3JtYWxzLCAzKSk7XG4gIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShjb2xvcnMsIDMpKTtcbiAgZ2VvbWV0cnkuc2V0SW5kZXgoaW5kaWNlcyk7XG4gIGdlb21ldHJ5LmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuXG4gIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICAgIHZlcnRleENvbG9yczogdHJ1ZSwgZmxhdFNoYWRpbmc6IHRydWUsXG4gIH0pKTtcbiAgbWVzaC5uYW1lID0gJ21hY3JvX2xvZCc7XG4gIG1lc2guY2FzdFNoYWRvdyA9IGZhbHNlO1xuICBtZXNoLnJlY2VpdmVTaGFkb3cgPSBmYWxzZTtcbiAgcmV0dXJuIHtcbiAgICBtZXNoLFxuICAgIHRyaWFuZ2xlczogaW5kaWNlcy5sZW5ndGggLyAzLFxuICAgIHNhbXBsZU1zLFxuICAgIHRvdGFsTXM6IHBlcmZvcm1hbmNlLm5vdygpIC0gdG90YWxUMCxcbiAgICBzYW1wbGVDYWNoZWQsXG4gIH07XG59XG5cbmV4cG9ydCB0eXBlIFZpZXdNb2RlID0gJ3dvcmxkJyB8ICdtYXAnIHwgJ2tpdCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxUZXJyYWluVmlld09wdGlvbnMge1xuICBuZWFyUmFkaXVzPzogbnVtYmVyO1xuICB3b3JsZE1hY3JvU3RlcD86IG51bWJlcjtcbiAgbWFwTWFjcm9TdGVwPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQ2h1bmtWaWV3IHsgbWVzaDogVEhSRUUuTWVzaDsgd2F0ZXI6IFRIUkVFLk1lc2ggfCBudWxsOyB0cmlhbmdsZXM6IG51bWJlcjsgfVxuXG4vKipcbiAqIE93bnMgdGhlIG5lYXIgY2h1bmsgbWVzaGVzLCBtYWNybyBMT0QgYW5kIHdhdGVyIHN1cmZhY2UuIEl0IHJlYWRzIHdvcmxkXG4gKiBzdGF0ZSBhbmQgbmV2ZXIgbXV0YXRlcyBnZW5lcmF0aW9uIHJ1bGVzOyBldmljdGlvbiBvbmx5IGZyZWVzIGRlcml2ZWQgZGF0YS5cbiAqL1xuZXhwb3J0IGNsYXNzIFZveGVsVGVycmFpblZpZXcge1xuICByZWFkb25seSBncm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBwcml2YXRlIG5lYXJHcm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBwcml2YXRlIG1hY3JvR3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSB3YXRlcjogVEhSRUUuTWVzaDtcbiAgcHJpdmF0ZSB3b3JsZDogV29ybGQ7XG4gIHByaXZhdGUgbmVhclJhZGl1czogbnVtYmVyO1xuICBwcml2YXRlIHdvcmxkTWFjcm9TdGVwOiBudW1iZXI7XG4gIHByaXZhdGUgbWFwTWFjcm9TdGVwOiBudW1iZXI7XG4gIHByaXZhdGUgY2h1bmtzID0gbmV3IE1hcDxzdHJpbmcsIENodW5rVmlldz4oKTtcbiAgcHJpdmF0ZSBsb2FkZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBtb2RlOiBWaWV3TW9kZSA9ICd3b3JsZCc7XG4gIHByaXZhdGUgbWFjcm86IFRIUkVFLk1lc2ggfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBtYWNyb1RyaWFuZ2xlcyA9IDA7XG4gIHByaXZhdGUgbWFjcm9Gb2N1cyA9IG5ldyBUSFJFRS5WZWN0b3IzKDFlOSwgMCwgMWU5KTtcbiAgcHJpdmF0ZSBtYWNyb01vZGU6IFZpZXdNb2RlIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgY2h1bmtHZW5TYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIGNodW5rTWVzaFNhbXBsZXM6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgbWFjcm9TYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIG1hY3JvU2FtcGxlU2FtcGxlczogbnVtYmVyW10gPSBbXTtcbiAgcHJpdmF0ZSBtYWNyb0NhY2hlSGl0cyA9IDA7XG4gIHByaXZhdGUgbWFjcm9FZGl0S2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgLyoqIE1haW4tdGhyZWFkIG1pbGxpc2Vjb25kcyBwZXIgZnJhbWUgZm9yIHN0cmVhbWluZyBhbmQgZGlydHkgcmUtbWVzaGluZy4gKi9cbiAgZnJhbWVCdWRnZXRNcyA9IDY7XG4gIHByaXZhdGUgcGVuZGluZ0NodW5rcyA9IDA7XG4gIHByaXZhdGUgc3dlZXBDb3VudGVyID0gMDtcbiAgcHJpdmF0ZSBzd2VwdENodW5rcyA9IDA7XG4gIHByaXZhdGUgcGlubmVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgcG9vbDogQ2h1bmtXb3JrZXJQb29sIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgZ2VuZXJhdGluZyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAvKiogTGF0ZXN0IG1lc2ggcmVxdWVzdCBwZXIgY2h1bms7IG9sZGVyIHJlc3VsdHMgYXJlIGRpc2NhcmRlZC4gKi9cbiAgcHJpdmF0ZSBtZXNoU3RhbXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHN0YW1wQ291bnRlciA9IDA7XG4gIHByaXZhdGUgd29ya2VyU3RhdHMgPSB7IGdlbmVyYXRlZDogMCwgbWVzaGVkOiAwLCBkaXNjYXJkZWQ6IDAsIGdlbk1zOiAwLCBtZXNoTXM6IDAgfTtcbiAgcHJpdmF0ZSB3YXRlckdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIHByaXZhdGUgZmFyV2F0ZXJIb2xlOiB7IHZhbHVlOiBUSFJFRS5WZWN0b3I0IH07XG4gIG9uQ2h1bmtzQ2hhbmdlZDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3Iod29ybGQ6IFdvcmxkLCBzY2VuZTogVEhSRUUuU2NlbmUsIG9wdHM6IFZveGVsVGVycmFpblZpZXdPcHRpb25zID0ge30pIHtcbiAgICB0aGlzLndvcmxkID0gd29ybGQ7XG4gICAgdGhpcy5uZWFyUmFkaXVzID0gTWF0aC5tYXgoMSwgb3B0cy5uZWFyUmFkaXVzID8/IDMpO1xuICAgIHRoaXMud29ybGRNYWNyb1N0ZXAgPSBNYXRoLm1heCg0LCBvcHRzLndvcmxkTWFjcm9TdGVwID8/IDgpO1xuICAgIHRoaXMubWFwTWFjcm9TdGVwID0gTWF0aC5tYXgoNCwgb3B0cy5tYXBNYWNyb1N0ZXAgPz8gOCk7XG4gICAgdGhpcy5ncm91cC5uYW1lID0gJ3ZveGVsX3dvcmxkJztcbiAgICB0aGlzLm5lYXJHcm91cC5uYW1lID0gJ3ZveGVsX2NodW5rcyc7XG4gICAgdGhpcy5tYWNyb0dyb3VwLm5hbWUgPSAnbWFjcm9fbG9kJztcbiAgICB0aGlzLmdyb3VwLmFkZCh0aGlzLm5lYXJHcm91cCwgdGhpcy5tYWNyb0dyb3VwKTtcbiAgICB0aGlzLndhdGVyID0gYnVpbGRXYXRlclN1cmZhY2Uod29ybGQpO1xuICAgIHRoaXMuZmFyV2F0ZXJIb2xlID0gaW5zdGFsbEZhcldhdGVySG9sZSh0aGlzLndhdGVyLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKTtcbiAgICB0aGlzLmdyb3VwLmFkZCh0aGlzLndhdGVyKTtcbiAgICB0aGlzLndhdGVyR3JvdXAubmFtZSA9ICduZWFyX3dhdGVyJztcbiAgICB0aGlzLmdyb3VwLmFkZCh0aGlzLndhdGVyR3JvdXApO1xuICAgIHNjZW5lLmFkZCh0aGlzLmdyb3VwKTtcbiAgfVxuXG4gIHByZWxvYWQoZm9jdXM6IFRIUkVFLlZlY3RvcjMpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGUgPSAnd29ybGQnO1xuICAgIHRoaXMuZW5zdXJlQ2h1bmtzKGZvY3VzLCB0cnVlKTtcbiAgICB0aGlzLnJlYnVpbGRNYWNybyhmb2N1cywgJ3dvcmxkJywgdHJ1ZSk7XG4gIH1cblxuICAvKiogQWR2YW5jZSBwcmVzZW50YXRpb24tb25seSB3YXRlciBhbmltYXRpb24gKHNlY29uZHMpLiAqL1xuICBzZXRXYXRlclRpbWUoc2Vjb25kczogbnVtYmVyKTogdm9pZCB7IHdhdGVyVGltZS52YWx1ZSA9IHNlY29uZHM7IH1cblxuICB1cGRhdGUoZm9jdXM6IFRIUkVFLlZlY3RvcjMsIG1vZGU6IFZpZXdNb2RlID0gJ3dvcmxkJyk6IHZvaWQge1xuICAgIGlmIChtb2RlICE9PSB0aGlzLm1vZGUpIHtcbiAgICAgIHRoaXMubW9kZSA9IG1vZGU7XG4gICAgICB0aGlzLm5lYXJHcm91cC52aXNpYmxlID0gbW9kZSAhPT0gJ21hcCc7XG4gICAgICB0aGlzLndhdGVyR3JvdXAudmlzaWJsZSA9IG1vZGUgIT09ICdtYXAnO1xuICAgICAgaWYgKG1vZGUgPT09ICdtYXAnKSB0aGlzLmZhcldhdGVySG9sZS52YWx1ZS5zZXQoMCwgMCwgMCwgMCk7XG4gICAgICB0aGlzLnJlYnVpbGRNYWNybyhmb2N1cywgbW9kZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgaWYgKG1vZGUgPT09ICdtYXAnKSB7XG4gICAgICBpZiAobWFjcm9FZGl0S2V5KHRoaXMud29ybGQpICE9PSB0aGlzLm1hY3JvRWRpdEtleSkgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsIG1vZGUsIHRydWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGZyYW1lU3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICB0aGlzLmVuc3VyZUNodW5rcyhmb2N1cywgZmFsc2UsIGZyYW1lU3RhcnQpO1xuICAgIHRoaXMucmVidWlsZERpcnR5KGZvY3VzLCBmcmFtZVN0YXJ0KTtcbiAgICBpZiAoKyt0aGlzLnN3ZWVwQ291bnRlciAlIDMwID09PSAwKSB0aGlzLnN3ZWVwUmVzaWRlbnQoZm9jdXMpO1xuXG4gICAgY29uc3QgbW92ZWQgPSBNYXRoLmh5cG90KGZvY3VzLnggLSB0aGlzLm1hY3JvRm9jdXMueCwgZm9jdXMueiAtIHRoaXMubWFjcm9Gb2N1cy56KTtcbiAgICBpZiAodGhpcy5tYWNyb01vZGUgIT09IG1vZGUgfHwgbW92ZWQgPiA0OCB8fCBtYWNyb0VkaXRLZXkodGhpcy53b3JsZCkgIT09IHRoaXMubWFjcm9FZGl0S2V5KSB7XG4gICAgICB0aGlzLnJlYnVpbGRNYWNybyhmb2N1cywgbW9kZSwgZmFsc2UpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdHJlYW0gdGhlIG5lYXIgcmluZyBuZWFyZXN0LWZpcnN0IHdpdGhpbiBhIHBlci1mcmFtZSB0aW1lIGJ1ZGdldC4gQXQgbGVhc3RcbiAgICogb25lIGNodW5rIGlzIGJ1aWx0IHBlciBmcmFtZSBzbyBzdHJlYW1pbmcgYWx3YXlzIG1ha2VzIHByb2dyZXNzLlxuICAgKi9cbiAgLyoqXG4gICAqIE1vdmUgc3RyZWFtaW5nIGdlbmVyYXRpb24gYW5kIG1lc2hpbmcgdG8gd29ya2Vycy4gRXhwbGljaXQgcmVidWlsZHNcbiAgICogKGNvbnN0cnVjdGlvbiwgZWRpdHMgdmlhIHJlYnVpbGRBcm91bmQpIGFuZCBwcmVsb2FkIHN0YXkgc3luY2hyb25vdXMgc29cbiAgICogYXV0aG9yaXRhdGl2ZSBjaGFuZ2VzIGFyZSB2aXNpYmxlIGltbWVkaWF0ZWx5LlxuICAgKi9cbiAgZW5hYmxlV29ya2Vycyhwb29sOiBDaHVua1dvcmtlclBvb2wpOiB2b2lkIHsgdGhpcy5wb29sID0gcG9vbDsgfVxuXG4gIGdldCB3b3JrZXJNZXRyaWNzKCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCBudWxsIHtcbiAgICBpZiAoIXRoaXMucG9vbCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgIHdvcmtlcnM6IHRoaXMucG9vbC5zaXplLCBpbkZsaWdodDogdGhpcy5wb29sLmluRmxpZ2h0LCAuLi50aGlzLndvcmtlclN0YXRzLFxuICAgICAgZ2VuTXNBdmc6IHRoaXMud29ya2VyU3RhdHMuZ2VuZXJhdGVkID8gTWF0aC5yb3VuZCh0aGlzLndvcmtlclN0YXRzLmdlbk1zIC8gdGhpcy53b3JrZXJTdGF0cy5nZW5lcmF0ZWQgKiAxMCkgLyAxMCA6IDAsXG4gICAgICBtZXNoTXNBdmc6IHRoaXMud29ya2VyU3RhdHMubWVzaGVkID8gTWF0aC5yb3VuZCh0aGlzLndvcmtlclN0YXRzLm1lc2hNcyAvIHRoaXMud29ya2VyU3RhdHMubWVzaGVkICogMTApIC8gMTAgOiAwLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHJlcXVlc3RHZW5lcmF0ZShjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgICBpZiAodGhpcy53b3JsZC5jaHVua3MuaGFzKGtleSkgfHwgdGhpcy5nZW5lcmF0aW5nLmhhcyhrZXkpIHx8ICF0aGlzLnBvb2wpIHJldHVybjtcbiAgICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm47XG4gICAgdGhpcy5nZW5lcmF0aW5nLmFkZChrZXkpO1xuICAgIGNvbnN0IHsgc2VlZCB9ID0gdGhpcy53b3JsZCwgdmVyc2lvbiA9IHRoaXMud29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb247XG4gICAgdm9pZCB0aGlzLnBvb2wuZ2VuZXJhdGUoc2VlZCwgdmVyc2lvbiwgY3gsIGN6KS50aGVuKChyKSA9PiB7XG4gICAgICB0aGlzLmdlbmVyYXRpbmcuZGVsZXRlKGtleSk7XG4gICAgICAvLyBUaGUgbWFpbiB0aHJlYWQgaXMgdGhlIG9ubHkgV29ybGQgd3JpdGVyOiBpbnN0YWxsIG9ubHkgaWYgc3RpbGwgd2FudGVkLlxuICAgICAgaWYgKHRoaXMud29ybGQuc2VlZCAhPT0gc2VlZCB8fCB0aGlzLndvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uICE9PSB2ZXJzaW9uXG4gICAgICAgIHx8IHRoaXMud29ybGQuY2h1bmtzLmhhcyhrZXkpKSB7IHRoaXMud29ya2VyU3RhdHMuZGlzY2FyZGVkKys7IHJldHVybjsgfVxuICAgICAgc2VlZEJhc2VDb2x1bW5zKHRoaXMud29ybGQsIGtleSwgci5jb2x1bW5zKTtcbiAgICAgIGluc3RhbGxCYXNlQ2h1bmsodGhpcy53b3JsZCwgci5iYXNlLCByLm1zKTtcbiAgICAgIHRoaXMud29ya2VyU3RhdHMuZ2VuZXJhdGVkKys7XG4gICAgICB0aGlzLndvcmtlclN0YXRzLmdlbk1zICs9IHIubXM7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHJlcXVlc3RNZXNoKGtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgY2h1bmsgPSB0aGlzLndvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rIHx8ICF0aGlzLnBvb2wpIHJldHVybjtcbiAgICBjb25zdCBzdGFtcCA9ICsrdGhpcy5zdGFtcENvdW50ZXI7XG4gICAgdGhpcy5tZXNoU3RhbXAuc2V0KGtleSwgc3RhbXApO1xuICAgIHRoaXMud29ybGQuZGlydHkuZGVsZXRlKGtleSk7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgcGFkZGVkID0gcGFkZGVkRm9yKHRoaXMud29ybGQsIGNodW5rKTtcbiAgICB2b2lkIHRoaXMucG9vbC5tZXNoKHBhZGRlZCwgY2h1bmsuaGVpZ2h0cywgb3gsIG96LCB0aGlzLndvcmxkLnNlZWQpLnRoZW4oKHIpID0+IHtcbiAgICAgIC8vIFN1cGVyc2VkZWQgKG5ld2VyIHJlcXVlc3QsIHVubG9hZGVkIG9yIHN5bmNocm9ub3VzbHkgcmVidWlsdCkgcmVzdWx0cyBhcmUgZHJvcHBlZC5cbiAgICAgIGlmICh0aGlzLm1lc2hTdGFtcC5nZXQoa2V5KSAhPT0gc3RhbXApIHsgdGhpcy53b3JrZXJTdGF0cy5kaXNjYXJkZWQrKzsgcmV0dXJuOyB9XG4gICAgICB0aGlzLm1lc2hTdGFtcC5kZWxldGUoa2V5KTtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLndvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICAgIGlmICghY3VycmVudCkgeyB0aGlzLndvcmtlclN0YXRzLmRpc2NhcmRlZCsrOyByZXR1cm47IH1cbiAgICAgIC8vIEFuIGVkaXQgdG8gdGhpcyBjaHVuayB3aGlsZSBpbiBmbGlnaHQgcmUtbWFya2VkIGl0IGRpcnR5OyB0aGUgcmVzdWx0IGlzXG4gICAgICAvLyBzdGlsbCBzaG93biBub3cgYW5kIHJlcGxhY2VkIGJ5IHRoZSBuZXh0IChmcmVzaCkgcmVxdWVzdC5cbiAgICAgIHRoaXMuYWRvcHRNZXNoKGtleSwgY3VycmVudCwgZ2VvbWV0cnlGcm9tQXJyYXlzKHIuYXJyYXlzKSk7XG4gICAgICB0aGlzLndvcmtlclN0YXRzLm1lc2hlZCsrO1xuICAgICAgdGhpcy53b3JrZXJTdGF0cy5tZXNoTXMgKz0gci5tcztcbiAgICAgIHRoaXMub25DaHVua3NDaGFuZ2VkPy4oKTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgYWRvcHRNZXNoKGtleTogc3RyaW5nLCBjaHVuazogVm94ZWxDaHVuaywgcmVzdWx0OiBNZXNoUmVzdWx0KTogdm9pZCB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHRoaXMubmVhckdyb3VwLnJlbW92ZShleGlzdGluZy5tZXNoKTtcbiAgICAgIGV4aXN0aW5nLm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICAgICAgaWYgKGV4aXN0aW5nLndhdGVyKSB7IHRoaXMud2F0ZXJHcm91cC5yZW1vdmUoZXhpc3Rpbmcud2F0ZXIpOyBleGlzdGluZy53YXRlci5nZW9tZXRyeS5kaXNwb3NlKCk7IH1cbiAgICB9XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKHJlc3VsdC5nZW9tZXRyeSwgdGVycmFpbk1hdGVyaWFsKTtcbiAgICBtZXNoLm5hbWUgPSBgdm94ZWxfY2h1bmtfJHtjaHVuay5jeH1fJHtjaHVuay5jen1gO1xuICAgIG1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gICAgbWVzaC5jYXN0U2hhZG93ID0gZmFsc2U7XG4gICAgdGhpcy5uZWFyR3JvdXAuYWRkKG1lc2gpO1xuICAgIGNvbnN0IHdhdGVyID0gbWVzaENodW5rV2F0ZXIodGhpcy53b3JsZCwgY2h1bmspO1xuICAgIGlmICh3YXRlcikgdGhpcy53YXRlckdyb3VwLmFkZCh3YXRlcik7XG4gICAgdGhpcy5jaHVua3Muc2V0KGtleSwgeyBtZXNoLCB3YXRlciwgdHJpYW5nbGVzOiByZXN1bHQudHJpYW5nbGVzICsgKHdhdGVyPy51c2VyRGF0YS53YXRlclRyaWFuZ2xlcyA/PyAwKSB9KTtcbiAgICB0aGlzLmxvYWRlZC5hZGQoa2V5KTtcbiAgfVxuXG4gIC8qKiBXb3JrZXIgc3RyZWFtaW5nOiBnZW5lcmF0ZSB0aGUgM3gzIG5laWdoYm91cmhvb2QsIHRoZW4gbWVzaCwgbmVhcmVzdCBmaXJzdC4gKi9cbiAgcHJpdmF0ZSBlbnN1cmVDaHVua3NBc3luYyhtaXNzaW5nOiBBcnJheTx7IGN4OiBudW1iZXI7IGN6OiBudW1iZXI7IGQ6IG51bWJlciB9Pik6IHZvaWQge1xuICAgIGNvbnN0IHBvb2wgPSB0aGlzLnBvb2whO1xuICAgIGNvbnN0IG1heEluRmxpZ2h0ID0gcG9vbC5zaXplICogMztcbiAgICBmb3IgKGNvbnN0IG0gb2YgbWlzc2luZykge1xuICAgICAgaWYgKHBvb2wuaW5GbGlnaHQgPj0gbWF4SW5GbGlnaHQpIGJyZWFrO1xuICAgICAgY29uc3Qga2V5ID0gY2h1bmtLZXkobS5jeCwgbS5jeik7XG4gICAgICBpZiAodGhpcy5tZXNoU3RhbXAuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgICAgbGV0IHJlYWR5ID0gdHJ1ZTtcbiAgICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIHtcbiAgICAgICAgZm9yIChsZXQgZHggPSAtMTsgZHggPD0gMTsgZHgrKykge1xuICAgICAgICAgIGNvbnN0IGN4ID0gbS5jeCArIGR4LCBjeiA9IG0uY3ogKyBkejtcbiAgICAgICAgICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSBjb250aW51ZTtcbiAgICAgICAgICBpZiAoIXRoaXMud29ybGQuY2h1bmtzLmhhcyhjaHVua0tleShjeCwgY3opKSkgeyByZWFkeSA9IGZhbHNlOyB0aGlzLnJlcXVlc3RHZW5lcmF0ZShjeCwgY3opOyB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChyZWFkeSkgdGhpcy5yZXF1ZXN0TWVzaChrZXkpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZW5zdXJlQ2h1bmtzKGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBpbW1lZGlhdGU6IGJvb2xlYW4sIGZyYW1lU3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKSk6IHZvaWQge1xuICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICBsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXG4gICAgY29uc3QgbWlzc2luZzogQXJyYXk8eyBjeDogbnVtYmVyOyBjejogbnVtYmVyOyBkOiBudW1iZXIgfT4gPSBbXTtcbiAgICBmb3IgKGxldCBkeiA9IC10aGlzLm5lYXJSYWRpdXM7IGR6IDw9IHRoaXMubmVhclJhZGl1czsgZHorKykge1xuICAgICAgZm9yIChsZXQgZHggPSAtdGhpcy5uZWFyUmFkaXVzOyBkeCA8PSB0aGlzLm5lYXJSYWRpdXM7IGR4KyspIHtcbiAgICAgICAgY29uc3QgY3ggPSBjY3ggKyBkeCwgY3ogPSBjY3ogKyBkejtcbiAgICAgICAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgY29udGludWU7XG4gICAgICAgIGlmICh0aGlzLmxvYWRlZC5oYXMoY2h1bmtLZXkoY3gsIGN6KSkpIGNvbnRpbnVlO1xuICAgICAgICBtaXNzaW5nLnB1c2goeyBjeCwgY3osIGQ6IGR4ICogZHggKyBkeiAqIGR6IH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBtaXNzaW5nLnNvcnQoKGEsIGIpID0+IGEuZCAtIGIuZCk7XG4gICAgbGV0IGJ1aWx0ID0gMDtcbiAgICBpZiAodGhpcy5wb29sICYmICFpbW1lZGlhdGUgJiYgIXRoaXMucG9vbC5mYWlsZWQpIHtcbiAgICAgIHRoaXMuZW5zdXJlQ2h1bmtzQXN5bmMobWlzc2luZyk7XG4gICAgICBtaXNzaW5nLmxlbmd0aCA9IDA7XG4gICAgfVxuICAgIGZvciAoY29uc3QgbSBvZiBtaXNzaW5nKSB7XG4gICAgICBpZiAoIWltbWVkaWF0ZSAmJiBidWlsdCA+IDAgJiYgcGVyZm9ybWFuY2Uubm93KCkgLSBmcmFtZVN0YXJ0ID49IHRoaXMuZnJhbWVCdWRnZXRNcykgYnJlYWs7XG4gICAgICB0aGlzLmJ1aWxkQ2h1bmsobS5jeCwgbS5jeik7XG4gICAgICBidWlsdCsrO1xuICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgfVxuICAgIHRoaXMucGVuZGluZ0NodW5rcyA9IHRoaXMucG9vbCAmJiAhaW1tZWRpYXRlID8gdGhpcy5tZXNoU3RhbXAuc2l6ZSArIHRoaXMuZ2VuZXJhdGluZy5zaXplIDogbWlzc2luZy5sZW5ndGggLSBidWlsdDtcblxuICAgIGNvbnN0IG1hcmdpbiA9IHRoaXMubmVhclJhZGl1cyArIDE7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgWy4uLnRoaXMubG9hZGVkXSkge1xuICAgICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICAgIGlmIChNYXRoLmFicyhjeCAtIGNjeCkgPiBtYXJnaW4gfHwgTWF0aC5hYnMoY3ogLSBjY3opID4gbWFyZ2luKSB7XG4gICAgICAgIHRoaXMuZGlzcG9zZUNodW5rKGtleSk7XG4gICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjaGFuZ2VkKSB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ2h1bmsoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gICAgY29uc3QgZ2VuQmVmb3JlID0gdGhpcy53b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXM7XG4gICAgY29uc3QgY2h1bmtzQmVmb3JlID0gdGhpcy53b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQ7XG4gICAgLy8gRW5zdXJlIHRoZSAzeDMgbmVpZ2hib3VyaG9vZCBleGlzdHMgc28gYm91bmRhcnkgZmFjZXMgdXNlIHJlYWwgZGF0YS5cbiAgICBmb3IgKGxldCBkeiA9IC0xOyBkeiA8PSAxOyBkeisrKSB7XG4gICAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSAxOyBkeCsrKSBlbnN1cmVDaHVuayh0aGlzLndvcmxkLCBjeCArIGR4LCBjeiArIGR6KTtcbiAgICB9XG4gICAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh0aGlzLndvcmxkLCBjeCwgY3opO1xuICAgIGlmICghY2h1bmspIHJldHVybjtcbiAgICBjb25zdCBnZW5lcmF0ZWQgPSB0aGlzLndvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCAtIGNodW5rc0JlZm9yZTtcbiAgICBpZiAoZ2VuZXJhdGVkID4gMCkge1xuICAgICAgcmVjb3JkU2FtcGxlKHRoaXMuY2h1bmtHZW5TYW1wbGVzLCAodGhpcy53b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgLSBnZW5CZWZvcmUpIC8gZ2VuZXJhdGVkKTtcbiAgICB9XG5cbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgdGhpcy5uZWFyR3JvdXAucmVtb3ZlKGV4aXN0aW5nLm1lc2gpO1xuICAgICAgZXhpc3RpbmcubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICBpZiAoZXhpc3Rpbmcud2F0ZXIpIHsgdGhpcy53YXRlckdyb3VwLnJlbW92ZShleGlzdGluZy53YXRlcik7IGV4aXN0aW5nLndhdGVyLmdlb21ldHJ5LmRpc3Bvc2UoKTsgfVxuICAgIH1cblxuICAgIGNvbnN0IG1lc2hUMCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIGNvbnN0IHsgZ2VvbWV0cnksIHRyaWFuZ2xlcyB9ID0gbWVzaENodW5rKHRoaXMud29ybGQsIGNodW5rKTtcbiAgICByZWNvcmRTYW1wbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCBwZXJmb3JtYW5jZS5ub3coKSAtIG1lc2hUMCk7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCB0ZXJyYWluTWF0ZXJpYWwpO1xuICAgIG1lc2gubmFtZSA9IGB2b3hlbF9jaHVua18ke2N4fV8ke2N6fWA7XG4gICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgICB0aGlzLm5lYXJHcm91cC5hZGQobWVzaCk7XG4gICAgY29uc3Qgd2F0ZXIgPSBtZXNoQ2h1bmtXYXRlcih0aGlzLndvcmxkLCBjaHVuayk7XG4gICAgaWYgKHdhdGVyKSB0aGlzLndhdGVyR3JvdXAuYWRkKHdhdGVyKTtcbiAgICB0aGlzLmNodW5rcy5zZXQoa2V5LCB7IG1lc2gsIHdhdGVyLCB0cmlhbmdsZXM6IHRyaWFuZ2xlcyArICh3YXRlcj8udXNlckRhdGEud2F0ZXJUcmlhbmdsZXMgPz8gMCkgfSk7XG4gICAgdGhpcy5sb2FkZWQuYWRkKGtleSk7XG4gICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgfVxuXG4gIHByaXZhdGUgZGlzcG9zZUNodW5rKGtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgdmlldyA9IHRoaXMuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICh2aWV3KSB7XG4gICAgICB0aGlzLm5lYXJHcm91cC5yZW1vdmUodmlldy5tZXNoKTtcbiAgICAgIHZpZXcubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICBpZiAodmlldy53YXRlcikgeyB0aGlzLndhdGVyR3JvdXAucmVtb3ZlKHZpZXcud2F0ZXIpOyB2aWV3LndhdGVyLmdlb21ldHJ5LmRpc3Bvc2UoKTsgfVxuICAgICAgdGhpcy5jaHVua3MuZGVsZXRlKGtleSk7XG4gICAgfVxuICAgIHRoaXMubG9hZGVkLmRlbGV0ZShrZXkpO1xuICAgIHRoaXMubWVzaFN0YW1wLmRlbGV0ZShrZXkpO1xuICAgIGlmICh0aGlzLnBpbm5lZC5oYXMoa2V5KSkgcmV0dXJuO1xuICAgIHRoaXMud29ybGQuZGlydHkuZGVsZXRlKGtleSk7XG4gICAgZXZpY3RDaHVuayh0aGlzLndvcmxkLCBrZXkpO1xuICB9XG5cbiAgcHJpdmF0ZSByZWJ1aWxkQ2h1bmsoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgIHRoaXMuYnVpbGRDaHVuayhjeCwgY3opO1xuICB9XG5cbiAgLyoqIFJlLW1lc2ggZGlydHkgbG9hZGVkIGNodW5rcyBuZWFyZXN0LWZpcnN0LCBzaGFyaW5nIHRoZSBmcmFtZSBidWRnZXQuICovXG4gIHByaXZhdGUgcmVidWlsZERpcnR5KGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBmcmFtZVN0YXJ0OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBjY3ggPSB3b3JsZFRvQ2h1bmtYKE1hdGgucm91bmQoZm9jdXMueCkpO1xuICAgIGNvbnN0IGNjeiA9IHdvcmxkVG9DaHVua1ooTWF0aC5yb3VuZChmb2N1cy56KSk7XG4gICAgY29uc3QgZGlydHk6IEFycmF5PHsga2V5OiBzdHJpbmc7IGQ6IG51bWJlciB9PiA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHRoaXMubG9hZGVkKSB7XG4gICAgICBpZiAoIXRoaXMud29ybGQuZGlydHkuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICAgIGRpcnR5LnB1c2goeyBrZXksIGQ6IChjeCAtIGNjeCkgKiogMiArIChjeiAtIGNjeikgKiogMiB9KTtcbiAgICB9XG4gICAgaWYgKGRpcnR5Lmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgIGRpcnR5LnNvcnQoKGEsIGIpID0+IGEuZCAtIGIuZCk7XG4gICAgaWYgKHRoaXMucG9vbCAmJiAhdGhpcy5wb29sLmZhaWxlZCkge1xuICAgICAgZm9yIChjb25zdCB7IGtleSB9IG9mIGRpcnR5KSBpZiAoIXRoaXMubWVzaFN0YW1wLmhhcyhrZXkpIHx8IHRoaXMud29ybGQuZGlydHkuaGFzKGtleSkpIHRoaXMucmVxdWVzdE1lc2goa2V5KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHJlYnVpbHQgPSAwO1xuICAgIGZvciAoY29uc3QgeyBrZXkgfSBvZiBkaXJ0eSkge1xuICAgICAgaWYgKHJlYnVpbHQgPiAwICYmIHBlcmZvcm1hbmNlLm5vdygpIC0gZnJhbWVTdGFydCA+PSB0aGlzLmZyYW1lQnVkZ2V0TXMpIGJyZWFrO1xuICAgICAgdGhpcy5yZWJ1aWxkQ2h1bmsoa2V5KTtcbiAgICAgIHJlYnVpbHQrKztcbiAgICB9XG4gICAgaWYgKHJlYnVpbHQgPiAwKSB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gIH1cblxuICAvKipcbiAgICogQ2h1bmsgbGlmZXRpbWUgcG9saWN5LiBNZXNoaW5nIGdlbmVyYXRlcyBhIHJpbmcgb2YgbmVpZ2hib3VyIGNodW5rcywgYW5kXG4gICAqIHNpbXVsYXRpb24gcXVlcmllcyBjYW4gZ2VuZXJhdGUgbW9yZTsgbm9uZSBvZiB0aG9zZSB3ZXJlIGV2ZXIgcmVsZWFzZWQuXG4gICAqIFJlc2lkZW50IGNodW5rIGJ5dGVzIGFyZSBkZXJpdmVkIChyZWdlbmVyYXRlZCBmcm9tIHNlZWQgKyBkdXJhYmxlIGVkaXRzKSxcbiAgICogc28gYW55dGhpbmcgb3V0c2lkZSB0aGUga2VlcCByYWRpdXMgdGhhdCBpcyBub3QgbG9hZGVkIG9yIHBpbm5lZCBpcyBmcmVlZC5cbiAgICovXG4gIHByaXZhdGUgc3dlZXBSZXNpZGVudChmb2N1czogVEhSRUUuVmVjdG9yMyk6IHZvaWQge1xuICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICBjb25zdCBrZWVwID0gdGhpcy5uZWFyUmFkaXVzICsgMjtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbLi4udGhpcy53b3JsZC5jaHVua3Mua2V5cygpXSkge1xuICAgICAgaWYgKHRoaXMubG9hZGVkLmhhcyhrZXkpIHx8IHRoaXMucGlubmVkLmhhcyhrZXkpIHx8IHRoaXMubWVzaFN0YW1wLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgICBpZiAoTWF0aC5hYnMoY3ggLSBjY3gpIDw9IGtlZXAgJiYgTWF0aC5hYnMoY3ogLSBjY3opIDw9IGtlZXApIGNvbnRpbnVlO1xuICAgICAgZXZpY3RDaHVuayh0aGlzLndvcmxkLCBrZXkpO1xuICAgICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgICAgIHRoaXMuc3dlcHRDaHVua3MrKztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogS2VlcCB0aGUgY2h1bmtzIHVuZGVyIGEgd29ybGQtc3BhY2UgcmVjdGFuZ2xlIHJlc2lkZW50IChmb3IgZXhhbXBsZSB0aGVcbiAgICogc2V0dGxlbWVudCBlbnZlbG9wZSB0aGF0IGNvbnN0cnVjdGlvbiBwcmV2aWV3cyBxdWVyeSBzZXZlcmFsIHRpbWVzIGEgc2Vjb25kKS5cbiAgICovXG4gIHBpblJlY3QobWluWDogbnVtYmVyLCBtaW5aOiBudW1iZXIsIG1heFg6IG51bWJlciwgbWF4WjogbnVtYmVyKTogdm9pZCB7XG4gICAgZm9yIChsZXQgY3ogPSB3b3JsZFRvQ2h1bmtaKG1pblopIC0gMTsgY3ogPD0gd29ybGRUb0NodW5rWihtYXhaKSArIDE7IGN6KyspIHtcbiAgICAgIGZvciAobGV0IGN4ID0gd29ybGRUb0NodW5rWChtaW5YKSAtIDE7IGN4IDw9IHdvcmxkVG9DaHVua1gobWF4WCkgKyAxOyBjeCsrKSB7XG4gICAgICAgIGlmIChjeCA+PSAwICYmIGN6ID49IDAgJiYgY3ggPCBDSFVOS1NfUEVSX1NJREUgJiYgY3ogPCBDSFVOS1NfUEVSX1NJREUpIHRoaXMucGlubmVkLmFkZChjaHVua0tleShjeCwgY3opKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgcmVzaWRlbnRDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMud29ybGQuY2h1bmtzLnNpemU7IH1cbiAgZ2V0IHBlbmRpbmdDaHVua0J1aWxkcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wZW5kaW5nQ2h1bmtzOyB9XG4gIGdldCBldmljdGVkQnlTd2VlcCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5zd2VwdENodW5rczsgfVxuXG4gIHJlYnVpbGRBcm91bmQoeDogbnVtYmVyLCB6OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgICBmb3IgKGxldCBkeiA9IC0xOyBkeiA8PSAxOyBkeisrKSB7XG4gICAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSAxOyBkeCsrKSB7XG4gICAgICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4ICsgZHgsIGN6ICsgZHopO1xuICAgICAgICB0aGlzLm1lc2hTdGFtcC5kZWxldGUoa2V5KTtcbiAgICAgICAgaWYgKHRoaXMubG9hZGVkLmhhcyhrZXkpKSB0aGlzLnJlYnVpbGRDaHVuayhrZXkpO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gICAgaWYgKHRoaXMubWFjcm8pIHRoaXMucmVidWlsZE1hY3JvKHRoaXMubWFjcm9Gb2N1cywgdGhpcy5tb2RlLCB0cnVlKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVidWlsZE1hY3JvKGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBtb2RlOiBWaWV3TW9kZSwgZm9yY2U6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBpZiAoIWZvcmNlICYmIHRoaXMubWFjcm9Nb2RlID09PSBtb2RlKSB7XG4gICAgICBjb25zdCBtb3ZlZCA9IE1hdGguaHlwb3QoZm9jdXMueCAtIHRoaXMubWFjcm9Gb2N1cy54LCBmb2N1cy56IC0gdGhpcy5tYWNyb0ZvY3VzLnopO1xuICAgICAgaWYgKG1vZGUgPT09ICdtYXAnIHx8IG1vdmVkIDw9IDQ4KSByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG1hY3JvVDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICBpZiAodGhpcy5tYWNybykge1xuICAgICAgdGhpcy5tYWNyb0dyb3VwLnJlbW92ZSh0aGlzLm1hY3JvKTtcbiAgICAgIHRoaXMubWFjcm8uZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICAgICAgdGhpcy5tYWNybyA9IG51bGw7XG4gICAgfVxuICAgIGNvbnN0IHN0ZXAgPSBtb2RlID09PSAnbWFwJyA/IHRoaXMubWFwTWFjcm9TdGVwIDogdGhpcy53b3JsZE1hY3JvU3RlcDtcbiAgICBsZXQgaG9sZTogTWFjcm9Ib2xlIHwgdW5kZWZpbmVkO1xuICAgIGlmIChtb2RlICE9PSAnbWFwJykge1xuICAgICAgY29uc3QgY2N4ID0gd29ybGRUb0NodW5rWChNYXRoLnJvdW5kKGZvY3VzLngpKTtcbiAgICAgIGNvbnN0IGNjeiA9IHdvcmxkVG9DaHVua1ooTWF0aC5yb3VuZChmb2N1cy56KSk7XG4gICAgICBob2xlID0ge1xuICAgICAgICBtaW5YOiBjaHVua09yaWdpblgoY2N4IC0gdGhpcy5uZWFyUmFkaXVzKSxcbiAgICAgICAgbWF4WDogY2h1bmtPcmlnaW5YKGNjeCArIHRoaXMubmVhclJhZGl1cykgKyBDSFVOS19TSVpFLFxuICAgICAgICBtaW5aOiBjaHVua09yaWdpblooY2N6IC0gdGhpcy5uZWFyUmFkaXVzKSxcbiAgICAgICAgbWF4WjogY2h1bmtPcmlnaW5aKGNjeiArIHRoaXMubmVhclJhZGl1cykgKyBDSFVOS19TSVpFLFxuICAgICAgfTtcbiAgICAgIHRoaXMuZmFyV2F0ZXJIb2xlLnZhbHVlLnNldChob2xlLm1pblgsIGhvbGUubWluWiwgaG9sZS5tYXhYLCBob2xlLm1heFopO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSBidWlsZE1hY3JvTWVzaCh0aGlzLndvcmxkLCB7IHN0ZXAsIGhvbGUgfSk7XG4gICAgdGhpcy5tYWNybyA9IHJlc3VsdC5tZXNoO1xuICAgIHRoaXMubWFjcm9UcmlhbmdsZXMgPSByZXN1bHQudHJpYW5nbGVzO1xuICAgIHRoaXMubWFjcm9Hcm91cC5hZGQocmVzdWx0Lm1lc2gpO1xuICAgIHRoaXMubWFjcm9Gb2N1cy5jb3B5KGZvY3VzKTtcbiAgICB0aGlzLm1hY3JvTW9kZSA9IG1vZGU7XG4gICAgdGhpcy5tYWNyb0VkaXRLZXkgPSBtYWNyb0VkaXRLZXkodGhpcy53b3JsZCk7XG4gICAgcmVjb3JkU2FtcGxlKHRoaXMubWFjcm9TYW1wbGVzLCBwZXJmb3JtYW5jZS5ub3coKSAtIG1hY3JvVDApO1xuICAgIGlmIChyZXN1bHQuc2FtcGxlQ2FjaGVkKSB0aGlzLm1hY3JvQ2FjaGVIaXRzKys7XG4gICAgZWxzZSByZWNvcmRTYW1wbGUodGhpcy5tYWNyb1NhbXBsZVNhbXBsZXMsIHJlc3VsdC5zYW1wbGVNcyk7XG4gIH1cblxuICBnZXQgbG9hZGVkQ2h1bmtzKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmxvYWRlZC5zaXplOyB9XG4gIGdldCBsb2FkZWRDaHVua0tleXMoKTogUmVhZG9ubHlTZXQ8c3RyaW5nPiB7IHJldHVybiB0aGlzLmxvYWRlZDsgfVxuICBnZXQgbmVhclRyaWFuZ2xlcygpOiBudW1iZXIge1xuICAgIGxldCB0ID0gMDtcbiAgICBmb3IgKGNvbnN0IHYgb2YgdGhpcy5jaHVua3MudmFsdWVzKCkpIHQgKz0gdi50cmlhbmdsZXM7XG4gICAgcmV0dXJuIHQ7XG4gIH1cbiAgZ2V0IG1hY3JvVHJpYW5nbGVDb3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5tYWNyb1RyaWFuZ2xlczsgfVxuICBnZXQgZHJhd0NhbGxzKCk6IG51bWJlciB7XG4gICAgbGV0IHdhdGVyID0gMDtcbiAgICBmb3IgKGNvbnN0IHYgb2YgdGhpcy5jaHVua3MudmFsdWVzKCkpIGlmICh2LndhdGVyKSB3YXRlcisrO1xuICAgIHJldHVybiB0aGlzLmxvYWRlZC5zaXplICsgd2F0ZXIgKyAodGhpcy5tYWNybyA/IDEgOiAwKSArIDE7XG4gIH1cbiAgZ2V0IG5lYXJSYWRpdXNDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubmVhclJhZGl1czsgfVxuICAvKiogQ2xlYXIgdGhlIHJvbGxpbmcgdGltaW5nIHdpbmRvdyBiZWZvcmUgYSBtZWFzdXJlbWVudCBydW4uICovXG4gIHJlc2V0UGVyZigpOiB2b2lkIHtcbiAgICB0aGlzLmNodW5rR2VuU2FtcGxlcy5sZW5ndGggPSAwO1xuICAgIHRoaXMuY2h1bmtNZXNoU2FtcGxlcy5sZW5ndGggPSAwO1xuICAgIHRoaXMubWFjcm9TYW1wbGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5tYWNyb1NhbXBsZVNhbXBsZXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLm1hY3JvQ2FjaGVIaXRzID0gMDtcbiAgfVxuICAvKiogUm9sbGluZyBidWlsZCB0aW1pbmdzIGluIG1pbGxpc2Vjb25kcywgZm9yIHRoZSBwZXJmb3JtYW5jZSBldmlkZW5jZS4gKi9cbiAgZ2V0IHN0cmVhbVBlcmYoKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNodW5rR2VuUDUwOiBwZXJjZW50aWxlKHRoaXMuY2h1bmtHZW5TYW1wbGVzLCAwLjUpLFxuICAgICAgY2h1bmtHZW5QOTU6IHBlcmNlbnRpbGUodGhpcy5jaHVua0dlblNhbXBsZXMsIDAuOTUpLFxuICAgICAgY2h1bmtHZW5NYXg6IHBlcmNlbnRpbGUodGhpcy5jaHVua0dlblNhbXBsZXMsIDEpLFxuICAgICAgY2h1bmtNZXNoUDUwOiBwZXJjZW50aWxlKHRoaXMuY2h1bmtNZXNoU2FtcGxlcywgMC41KSxcbiAgICAgIGNodW5rTWVzaFA5NTogcGVyY2VudGlsZSh0aGlzLmNodW5rTWVzaFNhbXBsZXMsIDAuOTUpLFxuICAgICAgY2h1bmtNZXNoTWF4OiBwZXJjZW50aWxlKHRoaXMuY2h1bmtNZXNoU2FtcGxlcywgMSksXG4gICAgICBtYWNyb1A1MDogcGVyY2VudGlsZSh0aGlzLm1hY3JvU2FtcGxlcywgMC41KSxcbiAgICAgIG1hY3JvTWF4OiBwZXJjZW50aWxlKHRoaXMubWFjcm9TYW1wbGVzLCAxKSxcbiAgICAgIG1hY3JvU2FtcGxlUDUwOiBwZXJjZW50aWxlKHRoaXMubWFjcm9TYW1wbGVTYW1wbGVzLCAwLjUpLFxuICAgICAgbWFjcm9TYW1wbGVNYXg6IHBlcmNlbnRpbGUodGhpcy5tYWNyb1NhbXBsZVNhbXBsZXMsIDEpLFxuICAgICAgbWFjcm9DYWNoZUhpdHM6IHRoaXMubWFjcm9DYWNoZUhpdHMsXG4gICAgICBjaHVua1NhbXBsZXM6IHRoaXMuY2h1bmtHZW5TYW1wbGVzLmxlbmd0aCxcbiAgICAgIG1hY3JvU2FtcGxlczogdGhpcy5tYWNyb1NhbXBsZXMubGVuZ3RoLFxuICAgIH07XG4gIH1cbn1cbiIsICIvLyBSZW5kZXIgbGF5ZXIgXHUyMDE0IG5lYXIgd2F0ZXIgc3VyZmFjZXMgYnVpbHQgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB3YXRlciB2b3hlbHMuXG4vL1xuLy8gR2VvbWV0cnkgY29tZXMgZnJvbSB0aGUgdm94ZWwgdm9sdW1lIChzbyBlZGl0cywgZHVnIHBpdHMgYW5kIHRoZSB2MiBtb3VudGFpblxuLy8gcml2ZXIgYXJlIGV4YWN0KS4gRWFjaCB3YXRlciBjb2x1bW4ncyB0b3AgZ2V0cyBhIHF1YWQgY2Fycnlpbmc6XG4vLyAgIGFGbG93ICBcdTIwMTQgc3VyZmFjZSBjdXJyZW50IChkaXJlY3Rpb24gKiBzcGVlZCwgbS9zKSBmcm9tIHNpbSBIeWRyb2xvZ3ksXG4vLyAgIGFEZXB0aCBcdTIwMTQgd2F0ZXIgZGVwdGggdG8gdGhlIGJlZCAobWV0cmVzKSxcbi8vICAgYUZvYW0gIFx1MjAxNCBzaG9yZSAvIGNhc2NhZGUgZm9hbSB3ZWlnaHQuXG4vLyBXaGVyZSBhIHdhdGVyIHN1cmZhY2Ugc3RhbmRzIGFib3ZlIGEgbG93ZXIgbmVpZ2hib3VyIChhIGNhc2NhZGUgb3IgZmFsbCksIGFcbi8vIHZlcnRpY2FsIHNoZWV0IGlzIGVtaXR0ZWQgZG93biB0byB0aGUgbmVpZ2hib3VyJ3Mgc3VyZmFjZS5cbi8vXG4vLyBIeWRyb2xvZ3kgaXMgc2ltdWxhdGlvbiBkYXRhOyByaXBwbGVzLCBmb2FtIGFuZCB0cmFuc3BhcmVuY3kgaGVyZSBhcmVcbi8vIHByZXNlbnRhdGlvbiBvbmx5IGFuZCBuZXZlciBmZWVkIGJhY2sgaW50byBzdGF0ZS5cbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCBwYWxldHRlIGZyb20gJy4uL2RhdGEvcGFsZXR0ZS5qc29uJztcbmltcG9ydCB7XG4gIFdvcmxkLCBWb3hlbENodW5rLCBNQVQsIENIVU5LX1NJWkUsIFlfTUlOLCBZX01BWCwgaXNTb2xpZCxcbiAgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosIGxvY2FsSW5kZXgsIHlUb0luZGV4LCBnZXRWb3hlbCwgaHlkcm9sb2d5Rm9yLFxufSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5jb25zdCBNID0gcGFsZXR0ZS5tYXRlcmlhbHMgYXMgUmVjb3JkPHN0cmluZywgeyBoZXg6IHN0cmluZyB9PjtcbmNvbnN0IEggPSAoazogc3RyaW5nKSA9PiBuZXcgVEhSRUUuQ29sb3IoTVtrXS5oZXgpO1xuXG4vKiogU2hhcmVkIHRpbWUgdW5pZm9ybSBmb3IgZXZlcnkgd2F0ZXIgbWF0ZXJpYWwuICovXG5leHBvcnQgY29uc3Qgd2F0ZXJUaW1lID0geyB2YWx1ZTogMCB9O1xuXG5mdW5jdGlvbiBtYWtlV2F0ZXJNYXRlcmlhbCgpOiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsIHtcbiAgY29uc3QgbWF0ID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICAgIHZlcnRleENvbG9yczogdHJ1ZSwgdHJhbnNwYXJlbnQ6IHRydWUsIGRlcHRoV3JpdGU6IGZhbHNlLCBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlLFxuICB9KTtcbiAgbWF0Lm9uQmVmb3JlQ29tcGlsZSA9IChzaGFkZXIpID0+IHtcbiAgICBzaGFkZXIudW5pZm9ybXMudVRpbWUgPSB3YXRlclRpbWU7XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVTaGFsbG93ID0geyB2YWx1ZTogSCgnd2F0ZXJfc2hhbGxvdycpIH07XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVNaWQgPSB7IHZhbHVlOiBIKCd3YXRlcl9taWQnKSB9O1xuICAgIHNoYWRlci51bmlmb3Jtcy51RGVlcCA9IHsgdmFsdWU6IEgoJ3dhdGVyX2RlZXAnKSB9O1xuICAgIHNoYWRlci51bmlmb3Jtcy51UmltID0geyB2YWx1ZTogSCgnd2F0ZXJfcmltJykgfTtcbiAgICBzaGFkZXIudmVydGV4U2hhZGVyID0gc2hhZGVyLnZlcnRleFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgYCNpbmNsdWRlIDxjb21tb24+XG5hdHRyaWJ1dGUgdmVjMiBhRmxvdztcbmF0dHJpYnV0ZSBmbG9hdCBhRGVwdGg7XG5hdHRyaWJ1dGUgZmxvYXQgYUZvYW07XG5hdHRyaWJ1dGUgZmxvYXQgYVNoZWV0O1xudmFyeWluZyB2ZWMyIHZGbG93O1xudmFyeWluZyBmbG9hdCB2RGVwdGg7XG52YXJ5aW5nIGZsb2F0IHZGb2FtO1xudmFyeWluZyBmbG9hdCB2U2hlZXQ7XG52YXJ5aW5nIHZlYzMgdldvcmxkUG9zVztgKVxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+JywgYCNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+XG52RmxvdyA9IGFGbG93OyB2RGVwdGggPSBhRGVwdGg7IHZGb2FtID0gYUZvYW07IHZTaGVldCA9IGFTaGVldDtcbnZXb3JsZFBvc1cgPSAobW9kZWxNYXRyaXggKiB2ZWM0KHRyYW5zZm9ybWVkLCAxLjApKS54eXo7YCk7XG4gICAgc2hhZGVyLmZyYWdtZW50U2hhZGVyID0gc2hhZGVyLmZyYWdtZW50U2hhZGVyXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCBgI2luY2x1ZGUgPGNvbW1vbj5cbnVuaWZvcm0gZmxvYXQgdVRpbWU7XG51bmlmb3JtIHZlYzMgdVNoYWxsb3c7IHVuaWZvcm0gdmVjMyB1TWlkOyB1bmlmb3JtIHZlYzMgdURlZXA7IHVuaWZvcm0gdmVjMyB1UmltO1xudmFyeWluZyB2ZWMyIHZGbG93O1xudmFyeWluZyBmbG9hdCB2RGVwdGg7XG52YXJ5aW5nIGZsb2F0IHZGb2FtO1xudmFyeWluZyBmbG9hdCB2U2hlZXQ7XG52YXJ5aW5nIHZlYzMgdldvcmxkUG9zVztcbmZsb2F0IHdIYXNoKHZlYzIgcCkgeyByZXR1cm4gZnJhY3Qoc2luKGRvdChwLCB2ZWMyKDEyNy4xLCAzMTEuNykpKSAqIDQzNzU4LjU0NTMpOyB9XG5mbG9hdCB3Tm9pc2UodmVjMiBwKSB7XG4gIHZlYzIgaSA9IGZsb29yKHApLCBmID0gZnJhY3QocCk7XG4gIGYgPSBmICogZiAqICgzLjAgLSAyLjAgKiBmKTtcbiAgcmV0dXJuIG1peChtaXgod0hhc2goaSksIHdIYXNoKGkgKyB2ZWMyKDEsIDApKSwgZi54KSwgbWl4KHdIYXNoKGkgKyB2ZWMyKDAsIDEpKSwgd0hhc2goaSArIHZlYzIoMSwgMSkpLCBmLngpLCBmLnkpO1xufWApXG4gICAgICAucmVwbGFjZSgndmVjNCBkaWZmdXNlQ29sb3IgPSB2ZWM0KCBkaWZmdXNlLCBvcGFjaXR5ICk7JywgYFxuZmxvYXQgc3BlZWQgPSBsZW5ndGgodkZsb3cpO1xuLy8gQWR2ZWN0IHRoZSBwYXR0ZXJuIGRvd25zdHJlYW0uIFF1YW50aXNlZCB0byAwLjI1IG0gY2VsbHMgc28gcmlwcGxlcyByZWFkIGFzXG4vLyBibG9jay1idWlsdCBmYWNldHMgcmF0aGVyIHRoYW4gc21vb3RoIGdyYWRpZW50cy5cbnZlYzIgcCA9IHZXb3JsZFBvc1cueHo7XG52ZWMyIGFkdiA9IHAgLSB2RmxvdyAqIHVUaW1lO1xudmVjMiBjZWxsID0gZmxvb3IoYWR2ICogNC4wKSAvIDQuMDtcbmZsb2F0IG4xID0gd05vaXNlKGNlbGwgKiAwLjU1KTtcbmZsb2F0IG4yID0gd05vaXNlKGNlbGwgKiAxLjcgKyB2ZWMyKHVUaW1lICogMC4wNywgLXVUaW1lICogMC4wNSkpO1xuZmxvYXQgcmlwcGxlID0gbjEgKiAwLjYgKyBuMiAqIDAuNDtcbi8vIFN0aWxsIHdhdGVyIChzZWEsIGxha2UpIGdldHMgYSBzbG93IHN3ZWxsIGluc3RlYWQgb2YgYSBjdXJyZW50LlxuZmxvYXQgc3dlbGwgPSAwLjUgKyAwLjUgKiBzaW4oZG90KHAsIHZlYzIoMC4xMSwgMC4wNykpICsgdVRpbWUgKiAwLjYpO1xucmlwcGxlID0gbWl4KG1peChyaXBwbGUsIHN3ZWxsLCAwLjUpLCByaXBwbGUsIGNsYW1wKHNwZWVkICogMi4wLCAwLjAsIDEuMCkpO1xuZmxvYXQgZCA9IGNsYW1wKHZEZXB0aCAvIDQuMCwgMC4wLCAxLjApO1xudmVjMyB3YXRlciA9IG1peCh1U2hhbGxvdywgdU1pZCwgc21vb3Roc3RlcCgwLjAsIDAuNSwgZCkpO1xud2F0ZXIgPSBtaXgod2F0ZXIsIHVEZWVwLCBzbW9vdGhzdGVwKDAuNSwgMS4wLCBkKSk7XG53YXRlciAqPSAwLjkgKyAwLjIgKiByaXBwbGU7XG4vLyBTdHJlYWtzIGFsb25nIGZhc3QgY3VycmVudCwgZm9hbSBhdCBzaG9yZXMgYW5kIGNhc2NhZGVzLlxuZmxvYXQgc3RyZWFrID0gc3RlcCgwLjc4IC0gY2xhbXAoc3BlZWQgKiAwLjA2LCAwLjAsIDAuMiksIG4yKSAqIGNsYW1wKHNwZWVkICogMC41LCAwLjAsIDEuMCk7XG5mbG9hdCBmb2FtTm9pc2UgPSBzdGVwKDAuNDUsIHdOb2lzZShjZWxsICogMi4zICsgdVRpbWUgKiAwLjMpKTtcbmZsb2F0IGZvYW0gPSBjbGFtcCh2Rm9hbSAqIGZvYW1Ob2lzZSArIHN0cmVhayAqIDAuNiwgMC4wLCAxLjApO1xuLy8gRmFsbGluZyBzaGVldHM6IGZhc3QgdmVydGljYWwgc3RyZWFrcy5cbmlmICh2U2hlZXQgPiAwLjUpIHtcbiAgZmxvYXQgZmFsbCA9IHdOb2lzZSh2ZWMyKGZsb29yKHZXb3JsZFBvc1cueCAqIDQuMCArIHZXb3JsZFBvc1cueiAqIDQuMCksIGZsb29yKCh2V29ybGRQb3NXLnkgKyB1VGltZSAqIDMuNSkgKiAzLjApKSk7XG4gIGZvYW0gPSBtYXgoZm9hbSwgc3RlcCgwLjM1LCBmYWxsKSk7XG59XG52ZWMzIGNvbCA9IG1peCh3YXRlciwgdVJpbSAqIDEuMDgsIGZvYW0pO1xuZmxvYXQgYWxwaGEgPSBtaXgoMC41NSwgMC45LCBzbW9vdGhzdGVwKDAuNCwgMy4wLCB2RGVwdGgpKTtcbmFscGhhID0gbWF4KGFscGhhLCBmb2FtICogMC45NSk7XG5pZiAodlNoZWV0ID4gMC41KSBhbHBoYSA9IG1heChhbHBoYSwgMC44Mik7XG52ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UgKiBjb2wsIGFscGhhICogb3BhY2l0eSApO2ApO1xuICB9O1xuICByZXR1cm4gbWF0O1xufVxuXG5leHBvcnQgY29uc3QgbmVhcldhdGVyTWF0ZXJpYWwgPSBtYWtlV2F0ZXJNYXRlcmlhbCgpO1xuXG4vKiogTWVzaCB0aGUgd2F0ZXIgc3VyZmFjZXMgb2Ygb25lIGNodW5rOyBudWxsIHdoZW4gdGhlIGNodW5rIGhvbGRzIG5vIHdhdGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lc2hDaHVua1dhdGVyKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiBUSFJFRS5NZXNoIHwgbnVsbCB7XG4gIGNvbnN0IGh5ZHJvID0gaHlkcm9sb2d5Rm9yKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIGNvbnN0IGxldmVscyA9IG5ldyBJbnQxNkFycmF5KENIVU5LX1NJWkUgKiBDSFVOS19TSVpFKS5maWxsKC05OTk5KTtcbiAgY29uc3QgYmVkcyA9IG5ldyBJbnQxNkFycmF5KENIVU5LX1NJWkUgKiBDSFVOS19TSVpFKTtcblxuICAvLyBXYXRlciBzdXJmYWNlIHBlciBjb2x1bW46IHRoZSBmaXJzdCBub24td2F0ZXIgY2VsbCBhYm92ZSB0aGUgd2F0ZXIgdGhhdFxuICAvLyBzdGFuZHMgb24gdGhpcyBjb2x1bW4ncyBzb2xpZCBzdXJmYWNlLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbnN0IGJlZCA9IGNodW5rLmhlaWdodHNbY29sXSArIFlfTUlOICsgMTtcbiAgICAgIGxldCB5ID0gYmVkO1xuICAgICAgd2hpbGUgKHkgPCBZX01BWCAmJiBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildID09PSBNQVQuV0FURVIpIHkrKztcbiAgICAgIGlmICh5ID4gYmVkKSB7IGxldmVsc1tjb2xdID0geTsgYmVkc1tjb2xdID0gYmVkOyB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcG9zOiBudW1iZXJbXSA9IFtdLCBucm06IG51bWJlcltdID0gW10sIGNscjogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgZmxvdzogbnVtYmVyW10gPSBbXSwgZGVwdGg6IG51bWJlcltdID0gW10sIGZvYW06IG51bWJlcltdID0gW10sIHNoZWV0OiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBpZHg6IG51bWJlcltdID0gW107XG4gIGNvbnN0IHB1c2ggPSAoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgbng6IG51bWJlciwgbnk6IG51bWJlciwgbno6IG51bWJlcixcbiAgICBmeDogbnVtYmVyLCBmejogbnVtYmVyLCBkZXA6IG51bWJlciwgZm86IG51bWJlciwgc2g6IG51bWJlcikgPT4ge1xuICAgIHBvcy5wdXNoKHgsIHksIHopOyBucm0ucHVzaChueCwgbnksIG56KTsgY2xyLnB1c2goMSwgMSwgMSk7XG4gICAgZmxvdy5wdXNoKGZ4LCBmeik7IGRlcHRoLnB1c2goZGVwKTsgZm9hbS5wdXNoKGZvKTsgc2hlZXQucHVzaChzaCk7XG4gIH07XG4gIGNvbnN0IHF1YWQgPSAoYmFzZTogbnVtYmVyKSA9PiB7IGlkeC5wdXNoKGJhc2UsIGJhc2UgKyAxLCBiYXNlICsgMiwgYmFzZSwgYmFzZSArIDIsIGJhc2UgKyAzKTsgfTtcblxuICBjb25zdCBsZXZlbEF0ID0gKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGlmIChseCA+PSAwICYmIGx6ID49IDAgJiYgbHggPCBDSFVOS19TSVpFICYmIGx6IDwgQ0hVTktfU0laRSkgcmV0dXJuIGxldmVsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgLy8gTmVpZ2hib3VyIGNodW5rOiByZWFkIHRoZSB2b3hlbHMgKGNodW5rcyBhcmUgZ2VuZXJhdGVkIGluIDN4MyByaW5ncyBmb3IgbWVzaGluZykuXG4gICAgbGV0IHkgPSBZX01BWCAtIDE7XG4gICAgd2hpbGUgKHkgPiBZX01JTiAmJiAhaXNTb2xpZChnZXRWb3hlbCh3b3JsZCwgd3gsIHksIHd6KSkgJiYgZ2V0Vm94ZWwod29ybGQsIHd4LCB5LCB3eikgIT09IE1BVC5XQVRFUikgeS0tO1xuICAgIHJldHVybiBnZXRWb3hlbCh3b3JsZCwgd3gsIHksIHd6KSA9PT0gTUFULldBVEVSID8geSArIDEgOiAtOTk5OTtcbiAgfTtcblxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbnN0IGxldmVsID0gbGV2ZWxzW2NvbF07XG4gICAgICBpZiAobGV2ZWwgPT09IC05OTk5KSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHggPSBveCArIGx4LCB6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGYgPSBoeWRyby5mbG93QXQoeCArIDAuNSwgeiArIDAuNSwgbGV2ZWwpO1xuICAgICAgY29uc3QgZnggPSBmLmR4ICogZi5zcGVlZCwgZnogPSBmLmR6ICogZi5zcGVlZDtcbiAgICAgIGNvbnN0IGRlcCA9IGxldmVsIC0gYmVkc1tjb2xdO1xuICAgICAgbGV0IHNob3JlID0gMDtcbiAgICAgIGNvbnN0IHNpZGVzOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiA9IFtbMSwgMF0sIFstMSwgMF0sIFswLCAxXSwgWzAsIC0xXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIHNpZGVzKSB7XG4gICAgICAgIGNvbnN0IG0gPSBnZXRWb3hlbCh3b3JsZCwgeCArIGR4LCBsZXZlbCAtIDEsIHogKyBkeik7XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSBzaG9yZSA9IDE7XG4gICAgICB9XG4gICAgICBjb25zdCB5ID0gbGV2ZWwgLSAwLjE7XG4gICAgICBjb25zdCBiYXNlID0gcG9zLmxlbmd0aCAvIDM7XG4gICAgICBjb25zdCBmbyA9IE1hdGgubWF4KHNob3JlICogMC42NSwgTWF0aC5taW4oMSwgZi5zcGVlZCAvIDMuNSkpO1xuICAgICAgcHVzaCh4LCB5LCB6LCAwLCAxLCAwLCBmeCwgZnosIGRlcCwgZm8sIDApO1xuICAgICAgcHVzaCh4LCB5LCB6ICsgMSwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHB1c2goeCArIDEsIHksIHogKyAxLCAwLCAxLCAwLCBmeCwgZnosIGRlcCwgZm8sIDApO1xuICAgICAgcHVzaCh4ICsgMSwgeSwgeiwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHF1YWQoYmFzZSk7XG5cbiAgICAgIC8vIENhc2NhZGUgc2hlZXRzIHRvd2FyZCBsb3dlciB3YXRlciAob3Igb3BlbiBhaXIpIG9uIGFueSBzaWRlLlxuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBzaWRlcykge1xuICAgICAgICBjb25zdCBuTGV2ZWwgPSBsZXZlbEF0KHggKyBkeCwgeiArIGR6LCBseCArIGR4LCBseiArIGR6KTtcbiAgICAgICAgaWYgKG5MZXZlbCA9PT0gLTk5OTkgfHwgbkxldmVsID49IGxldmVsKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGlzU29saWQoZ2V0Vm94ZWwod29ybGQsIHggKyBkeCwgbGV2ZWwgLSAxLCB6ICsgZHopKSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHRvcCA9IGxldmVsIC0gMC4xLCBib3R0b20gPSBuTGV2ZWwgLSAwLjE7XG4gICAgICAgIGNvbnN0IGIgPSBwb3MubGVuZ3RoIC8gMztcbiAgICAgICAgLy8gRmFjZSBvbiB0aGUgc2hhcmVkIGVkZ2UsIG9yaWVudGVkIHRvd2FyZCB0aGUgbG93ZXIgbmVpZ2hib3VyLlxuICAgICAgICBjb25zdCBleCA9IGR4ID4gMCA/IHggKyAxIDogZHggPCAwID8geCA6IHgsIGV6ID0gZHogPiAwID8geiArIDEgOiBkeiA8IDAgPyB6IDogejtcbiAgICAgICAgaWYgKGR4ICE9PSAwKSB7XG4gICAgICAgICAgcHVzaChleCwgdG9wLCB6LCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaChleCwgdG9wLCB6ICsgMSwgZHgsIDAsIDAsIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goZXgsIGJvdHRvbSwgeiArIDEsIGR4LCAwLCAwLCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKGV4LCBib3R0b20sIHosIGR4LCAwLCAwLCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwdXNoKHgsIHRvcCwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKHggKyAxLCB0b3AsIGV6LCAwLCAwLCBkeiwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaCh4ICsgMSwgYm90dG9tLCBleiwgMCwgMCwgZHosIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goeCwgYm90dG9tLCBleiwgMCwgMCwgZHosIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICB9XG4gICAgICAgIHF1YWQoYik7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChpZHgubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZyA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICBnLnNldEF0dHJpYnV0ZSgncG9zaXRpb24nLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShwb3MsIDMpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ25vcm1hbCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKG5ybSwgMykpO1xuICBnLnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShjbHIsIDMpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FGbG93JywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoZmxvdywgMikpO1xuICBnLnNldEF0dHJpYnV0ZSgnYURlcHRoJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoZGVwdGgsIDEpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FGb2FtJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoZm9hbSwgMSkpO1xuICBnLnNldEF0dHJpYnV0ZSgnYVNoZWV0JywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoc2hlZXQsIDEpKTtcbiAgZy5zZXRJbmRleChpZHgpO1xuICBnLmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZywgbmVhcldhdGVyTWF0ZXJpYWwpO1xuICBtZXNoLm5hbWUgPSBgd2F0ZXJfY2h1bmtfJHtjaHVuay5jeH1fJHtjaHVuay5jen1gO1xuICBtZXNoLnJlbmRlck9yZGVyID0gMjtcbiAgbWVzaC51c2VyRGF0YS53YXRlclRyaWFuZ2xlcyA9IGlkeC5sZW5ndGggLyAzO1xuICByZXR1cm4gbWVzaDtcbn1cblxuLyoqXG4gKiBDdXQgYSByZWN0YW5ndWxhciBob2xlIGluIHRoZSBmYXIgKG9wYXF1ZSkgc2VhIHBsYW5lIHdoZXJlIG5lYXIgY2h1bmtzIGRyYXdcbiAqIHRoZWlyIG93biB0cmFuc3BhcmVudCB3YXRlciwgc28gc2hhbGxvd3Mgc2hvdyB0aGUgcmVhbCBiZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsRmFyV2F0ZXJIb2xlKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCk6IHsgdmFsdWU6IFRIUkVFLlZlY3RvcjQgfSB7XG4gIGNvbnN0IGhvbGUgPSB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yNCgwLCAwLCAwLCAwKSB9O1xuICBtYXRlcmlhbC5vbkJlZm9yZUNvbXBpbGUgPSAoc2hhZGVyKSA9PiB7XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVIb2xlID0gaG9sZTtcbiAgICBzaGFkZXIudmVydGV4U2hhZGVyID0gc2hhZGVyLnZlcnRleFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgJyNpbmNsdWRlIDxjb21tb24+XFxudmFyeWluZyB2ZWMyIHZGYXJYWjsnKVxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+JywgJyNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+XFxudkZhclhaID0gKG1vZGVsTWF0cml4ICogdmVjNCh0cmFuc2Zvcm1lZCwgMS4wKSkueHo7Jyk7XG4gICAgc2hhZGVyLmZyYWdtZW50U2hhZGVyID0gc2hhZGVyLmZyYWdtZW50U2hhZGVyXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCAnI2luY2x1ZGUgPGNvbW1vbj5cXG51bmlmb3JtIHZlYzQgdUhvbGU7XFxudmFyeWluZyB2ZWMyIHZGYXJYWjsnKVxuICAgICAgLnJlcGxhY2UoJ3ZlYzQgZGlmZnVzZUNvbG9yID0gdmVjNCggZGlmZnVzZSwgb3BhY2l0eSApOycsXG4gICAgICAgICdpZiAodkZhclhaLnggPiB1SG9sZS54ICYmIHZGYXJYWi54IDwgdUhvbGUueiAmJiB2RmFyWFoueSA+IHVIb2xlLnkgJiYgdkZhclhaLnkgPCB1SG9sZS53KSBkaXNjYXJkO1xcbnZlYzQgZGlmZnVzZUNvbG9yID0gdmVjNCggZGlmZnVzZSwgb3BhY2l0eSApOycpO1xuICB9O1xuICByZXR1cm4gaG9sZTtcbn1cbiIsICJ7XG4gIFwic2NoZW1hXCI6IFwicGFsZXR0ZV92MlwiLFxuICBcImRhdGVcIjogXCIyMDI2LTEwLTIyXCIsXG4gIFwic3RhdHVzXCI6IFwicHJvcG9zZWRcIixcbiAgXCJzb3VyY2VcIjogXCJSRUYtMDAyIChoeWJyaWQgd29ybGQgcmVmZXJlbmNlKSwgdmFsdWVzIHNhbXBsZWQgYnkgZXllOyBudW1lcmljIHZlcmlmaWNhdGlvbiBwZW5kaW5nXCIsXG4gIFwibm90ZVwiOiBcIk9uZSBtYXRlcmlhbCBwYWxldHRlLiBUaW1lIG9mIGRheSBpcyBleHByZXNzZWQgYnkgdGhlIGxpZ2h0aW5nIHByZXNldHMgYmVsb3csIG5vdCBieSByZXBhaW50aW5nIG1hdGVyaWFscy5cIixcbiAgXCJtYXRlcmlhbHNcIjoge1xuICAgIFwiZ3Jhc3NfdG9wXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzc5Qjk0Q1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGxvdyBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19oaWdoXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhGQzk1RVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIG1pZCBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19wZWFrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlBRDA2QVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGhpZ2ggZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfY2FwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVFOTQ0MFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuMC0wLjQgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfb2NocmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQzk5QTVGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC40LTAuNjIgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfcnVzdFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCNDYzM0NcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjYyLTAuODAgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdG9uZV90b3BcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZERkNDXCIsXG4gICAgICBcInJvbGVcIjogXCJiYXJlIHN0b25lIHRvcCBzdXJmYWNlXCJcbiAgICB9LFxuICAgIFwic3RvbmVfYm9keV9hXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0RDRDNCRVwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBib2R5LCBldmVuIDQuNSBtIGJhbmRcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9ib2R5X2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDFDN0FGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJvZHksIG9kZCA0LjUgbSBiYW5kXCJcbiAgICB9LFxuICAgIFwic3RvbmVfc2hhZGVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjlBRTk2XCIsXG4gICAgICBcInJvbGVcIjogXCJjcmV2aWNlIC8gcmVjZXNzZWQgc3RvbmUgYWNjZW50XCJcbiAgICB9LFxuICAgIFwic2FuZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFM0QzQTZcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlIGNlbGxzXCJcbiAgICB9LFxuICAgIFwic25vd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNFRUYxRjVcIixcbiAgICAgIFwicm9sZVwiOiBcImdlbmVyYXRvciB2MiBzbm93ZmllbGRzIGFib3ZlIHRoZSBzbm93bGluZSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfc2tpblwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEOUE3N0VcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBza2luIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90dW5pY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNCMzRBM0NcIixcbiAgICAgIFwicm9sZVwiOiBcImZvdW5kZXIgdHVuaWMsIHdhcm0gcmVkIGFjY2VudCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfdHVuaWNfYWx0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJFOEM4NlwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZXIgdHVuaWMsIHRlYWwgYWNjZW50IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90cm91c2Vyc1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM1QjQ2MzZcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciB0cm91c2VycyAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfaGFpclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM0QTMzMjRcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBoYWlyIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9ib290c1wiOiB7XG4gICAgICBcImhleFwiOiBcIiMzMzI4MUZcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBib290cyBhbmQgYmVsdCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX2RlZXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEM1QjNBXCIsXG4gICAgICBcInJvbGVcIjogXCJyZWQgZGVlciBjb2F0IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfbGlnaHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRENDN0E0XCIsXG4gICAgICBcInJvbGVcIjogXCJkZWVyIGJlbGx5LCBoYXJlIHRhaWwsIGFudGxlciAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX2hhcmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUE4NjcwXCIsXG4gICAgICBcInJvbGVcIjogXCJoYXJlIGNvYXQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV90cm91dFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2RjdGNUVcIixcbiAgICAgIFwicm9sZVwiOiBcInRyb3V0IGJhY2sgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV90cm91dF9iZWxseVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEOEM5QTNcIixcbiAgICAgIFwicm9sZVwiOiBcInRyb3V0IGJlbGx5IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF9wbGFzdGVyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U4RERDNlwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSB3YWxsIHBsYXN0ZXIgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RpbWJlclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2QTQ1MzBcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgdGltYmVyIGZyYW1lIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aW1iZXJfbGlnaHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEE2MTQyXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIHBsYW5rcyBhbmQgZG9vcnMgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RoYXRjaFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNDN0EyNTdcIixcbiAgICAgIFwicm9sZVwiOiBcInRoYXRjaCByb29mIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aGF0Y2hfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QzdCM0NcIixcbiAgICAgIFwicm9sZVwiOiBcInRoYXRjaCByb29mIHNoYWRlIGNvdXJzZSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfc3RvbmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUI5QTkxXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIG1hc29ucnkgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3N0b25lX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNzQ3MzZDXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIG1hc29ucnkgam9pbnRzIGFuZCBwbGludGggKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJwcm9wX2lyb25cIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0EzQTNGXCIsXG4gICAgICBcInJvbGVcIjogXCJpcm9uIGZpdHRpbmdzIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwicHJvcF9nbG93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0ZGRDI3RlwiLFxuICAgICAgXCJyb2xlXCI6IFwibGFudGVybiBsaWdodCAoZW1pc3NpdmUsIGVmZmVjdCBvbmx5KSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcIndhdGVyX3NoYWxsb3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNjdDRkQ4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA8PSAwLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX21pZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzQUFGQzRcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoIH4xLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX2RlZXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkE4RkE4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA+PSA0LjAgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX3JpbVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCRkVBRjBcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlbGluZSByaW0gLyBmb2FtIHRpbnRcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fYVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1RkE4M0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGQjg0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM3RkMzNTZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgaGlnaGxpZ2h0IG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfcGlua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNGMkE2QzRcIixcbiAgICAgIFwicm9sZVwiOiBcImJsb3Nzb20gYWNjZW50IHNwZWNpZXMgb25seVwiXG4gICAgfSxcbiAgICBcImNhbm9weV9waW5rX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTg4RkIyXCIsXG4gICAgICBcInJvbGVcIjogXCJibG9zc29tIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJ0cnVua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM2QjRBMzNcIixcbiAgICAgIFwicm9sZVwiOiBcInRyZWUgdHJ1bmtzXCJcbiAgICB9LFxuICAgIFwiYmFya19kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRFMzYyNlwiLFxuICAgICAgXCJyb2xlXCI6IFwidHJ1bmsgc2hhZGUsIHN0dW1wc1wiXG4gICAgfSxcbiAgICBcIm9yZV9jcnlzdGFsXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzdCNUFENlwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGRlcG9zaXQgYWNjZW50IChwcm9wb3NlZCwgcmVwbGFjZXMgdGVhbClcIlxuICAgIH0sXG4gICAgXCJvcmVfY3J5c3RhbF9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlCN0JFOFwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGhpZ2hsaWdodCBmYWNldFwiXG4gICAgfSxcbiAgICBcIm5veGVsX3N0b25lXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2REZDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgYXJjaGl0ZWN0dXJlIG1haW4gc3RvbmVcIlxuICAgIH0sXG4gICAgXCJub3hlbF9zdG9uZV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QzQzlCNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgc2Vjb25kYXJ5IHN0b25lIC8gcmVjZXNzXCJcbiAgICB9LFxuICAgIFwiYWNjZW50X2JsdWVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0U3RkI4XCIsXG4gICAgICBcInJvbGVcIjogXCJiYW5uZXIgLyBjbG90aCBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJhY2NlbnRfdGVhbFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyRkE2QTBcIixcbiAgICAgIFwicm9sZVwiOiBcInNlY29uZGFyeSBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJlbWlzc2l2ZV9maXJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0ZGOUU0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2FtcGZpcmUgLyB3YXJtIGVtaXNzaXZlIChlZmZlY3RzIG9ubHkpXCJcbiAgICB9LFxuICAgIFwiZW1pc3NpdmVfbWFnaWNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDI0QkZGXCIsXG4gICAgICBcInJvbGVcIjogXCJyZXNlcnZlZDogbWFnaWMgZWZmZWN0cyBvbmx5LCBuZXZlciBtYXRlcmlhbHNcIlxuICAgIH1cbiAgfSxcbiAgXCJsaWdodGluZ1wiOiB7XG4gICAgXCJkYXduXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDEyLFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDEwNSxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZDNzlBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAyLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEZBNkM4XCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNEU1RjZFXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMC42LFxuICAgICAgXCJza3lcIjogXCIjQThCRUQ2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNBOEJFRDZcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNSxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4xXG4gICAgfSxcbiAgICBcIm5vb25cIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogMzgsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogNTAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGRjREQ1wiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMi43NSxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiNCRkQ5RjJcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM3QThGNTVcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAwLjU1LFxuICAgICAgXCJza3lcIjogXCIjOUVEMkVFXCIsXG4gICAgICBcImZvZ1wiOiBcIiNEQ0VGRjhcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMjgsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMDVcbiAgICB9LFxuICAgIFwiZHVza1wiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiA5LFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDI1MCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZCMjdBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAzLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEU3QzlFXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNUE0QTUwXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMS4xLFxuICAgICAgXCJza3lcIjogXCIjQzk4RTg2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNDMDkwOEFcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMzYsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMzJcbiAgICB9LFxuICAgIFwibmlnaHRcIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogNDAsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMjIwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNBRkM4RkZcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDEuMCxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiMzQTRDN0FcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiMxQzI1NDBcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAxLjA1LFxuICAgICAgXCJza3lcIjogXCIjMTAxNzM2XCIsXG4gICAgICBcImZvZ1wiOiBcIiMxNTFDM0NcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNDUsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuNVxuICAgIH1cbiAgfVxufSIsICIvLyBQcml2YXRlIG1pZ3JhdGlvbiByZXBsYXkgb25seS4gUmV0aXJlZCBlbnRpdGllcyBsaXZlIGluIHRoaXMgV29ybGQgd2hpbGUgYW5cbi8vIGFjY2VwdGVkIGhpc3RvcmljYWwgam91cm5hbCBpcyBjaGVja2VkOyBubyBwdWJsaWMgY29tbWFuZCBlbmFibGVzIHRoaXMgbW9kZS5cbmludGVyZmFjZSBSZXBsYXlTdGF0ZSB7XG4gIGFjdGl2ZTogYm9vbGVhbjtcbiAgaGlzdG9yaWNhbEhhc2g6IGJvb2xlYW47XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBzdGF0ZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFJlcGxheVN0YXRlPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZDogb2JqZWN0KTogUmVwbGF5U3RhdGUge1xuICBsZXQgc3RhdGUgPSBzdGF0ZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzdGF0ZSkgeyBzdGF0ZSA9IHsgYWN0aXZlOiBmYWxzZSwgaGlzdG9yaWNhbEhhc2g6IGZhbHNlLCBtaWdyYXRlZDogZmFsc2UgfTsgc3RhdGVzLnNldCh3b3JsZCwgc3RhdGUpOyB9XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xuICBzdGF0ZS5taWdyYXRlZCA9IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uYWN0aXZlID8/IGZhbHNlO1xufVxuXG4vKiogU25hcHNob3QgaGFzaGVzIGJlZm9yZSBhbmQgZHVyaW5nIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5IGluY2x1ZGUgc3RvbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZUhpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lmhpc3RvcmljYWxIYXNoID8/IGZhbHNlO1xufVxuXG4vKiogQSBtaWdyYXRlZCBzbmFwc2hvdCBhbHJlYWR5IGhhcyByZXRpcmVtZW50IHRvbWJzdG9uZXMgaW4gZ2VuZXJhdGVkIGNodW5rcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8ubWlncmF0ZWQgPz8gZmFsc2U7XG59XG5cbi8qKiBFeGl0IGhpc3RvcmljYWwgbW9kZSBhZnRlciBhbGwgYWNjZXB0ZWQgY29tbWFuZHMgYW5kIGhhc2hlcyBoYXZlIHBhc3NlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IGZhbHNlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IGZhbHNlO1xuICBzdGF0ZS5taWdyYXRlZCA9IHRydWU7XG59XG4iLCAiLy8gRGV0ZXJtaW5pc3RpYyBoYXNoLCBub2lzZSBhbmQgbWF0aCBoZWxwZXJzIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllci5cbi8vIFB1cmUgVHlwZVNjcmlwdCAoRC0wMDUpLiBFeHRyYWN0ZWQgZnJvbSB3b3JsZC50cyB1bmNoYW5nZWQgc28gdGVycmFpblxuLy8gZ2VuZXJhdG9ycyBvZiBldmVyeSB2ZXJzaW9uIHVzZSBpZGVudGljYWwgcHJpbWl0aXZlcy5cbmV4cG9ydCBjb25zdCBjbGFtcCA9ICh2OiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiAodiA8IGEgPyBhIDogdiA+IGIgPyBiIDogdik7XG5leHBvcnQgY29uc3QgbGVycCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgdDogbnVtYmVyKSA9PiBhICsgKGIgLSBhKSAqIHQ7XG5leHBvcnQgY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5leHBvcnQgY29uc3Qgc21vb3RoID0gKHQ6IG51bWJlcikgPT4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UyKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKTtcbiAgY29uc3QgYSA9IGhhc2gyaSh4aSwgeWksIHNlZWQpLCBiID0gaGFzaDJpKHhpICsgMSwgeWksIHNlZWQpO1xuICBjb25zdCBjID0gaGFzaDJpKHhpLCB5aSArIDEsIHNlZWQpLCBkID0gaGFzaDJpKHhpICsgMSwgeWkgKyAxLCBzZWVkKTtcbiAgY29uc3QgdG9wID0gYSArIChiIC0gYSkgKiB4ZjtcbiAgY29uc3QgYm90dG9tID0gYyArIChkIC0gYykgKiB4ZjtcbiAgcmV0dXJuIHRvcCArIChib3R0b20gLSB0b3ApICogeWY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0yKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UyKHggKiBmcmVxLCB5ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMyh4ICogZnJlcSwgeSAqIGZyZXEsIHogKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG4iLCAiLy8gSHlkcm9sb2d5IFx1MjAxNCB0aGUgZGV0ZXJtaW5pc3RpYyB3YXRlciBuZXR3b3JrIG9mIGEgd29ybGQgKHB1cmUgVHlwZVNjcmlwdCwgRC0wMDUpLlxuLy9cbi8vIFRoaXMgaXMgZGVyaXZlZCAqc2ltdWxhdGlvbiBkYXRhKiwgbm90IHByZXNlbnRhdGlvbjogaXQgaXMgYSBwdXJlIGZ1bmN0aW9uIG9mXG4vLyAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pIGFuZCBpcyB3aGF0IHRlcnJhaW4gY2FydmluZywgd2F0ZXIgZmlsbGluZywgZmxvd1xuLy8gZGlyZWN0aW9uIGFuZCBmdXR1cmUgZmlzaGluZy9pcnJpZ2F0aW9uL2Zsb29kaW5nIHJ1bGVzIHJlYWQuIEl0IGlzIG5ldmVyXG4vLyBqb3VybmFsZWQgYmVjYXVzZSBpdCBjYW4gYWx3YXlzIGJlIHJlZ2VuZXJhdGVkIGV4YWN0bHkuXG4vL1xuLy8gTmV0d29yayAoYm90aCBnZW5lcmF0b3IgdmVyc2lvbnMpOlxuLy8gICBsYWtlICBcdTIwMTQgdGhlIHZhbGxleSBsYWtlIGJhc2luLCBsb2NhdGVkIGZyb20gdGhlIGFjdHVhbCBnZW5lcmF0ZWQgdGVycmFpbi5cbi8vICAgbG93ZXIgXHUyMDE0IHRoZSBsb3dsYW5kIHJpdmVyIGZyb20gdGhlIGxha2UgdG8gdGhlIHNvdXRoZXJuIHNlYSwgdHJhY2VkIGZyb21cbi8vICAgICAgICAgICB0aGUgYWN0dWFsIGNhcnZlZCBjaGFubmVsICh0aGUgdjEgY2hhbm5lbCBpcyBjYXJ2ZWQgb24gKndhcnBlZCpcbi8vICAgICAgICAgICBjb29yZGluYXRlcywgc28gYHJpdmVyQ2VudGVyWGAgYWxvbmUgaXMgdXAgdG8gfjEzNSBtIG9mZikuXG4vLyBHZW5lcmF0b3IgdjIgYWRkczpcbi8vICAgdXBwZXIgXHUyMDE0IGEgbW91bnRhaW4gcml2ZXIgZnJvbSBhIGhpZ2hsYW5kIHRhcm4gZG93biB0byB0aGUgbGFrZSwgd2l0aCBhXG4vLyAgICAgICAgICAgd2F0ZXItc3VyZmFjZSBsZXZlbCB0aGF0IG5ldmVyIHJpc2VzIGRvd25zdHJlYW0sIGNhc2NhZGVzIGFuZCBmYWxscy5cbi8vXG4vLyBGbG93IGFsd2F5cyBwb2ludHMgZG93bnN0cmVhbTogdXBwZXIgXHUyMTkyIGxha2UgXHUyMTkyIGxvd2VyIFx1MjE5MiBzZWEuXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbXVsYmVycnkzMiwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuXG5leHBvcnQgdHlwZSBIZWlnaHRTYW1wbGVyID0gKHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUml2ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZCBvZiB0aGlzIHJlYWNoIChtZXRyZXMpLiAqL1xuICBzOiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGVsZXZhdGlvbiAobWV0cmVzLCBtYXkgYmUgZnJhY3Rpb25hbCkuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBDaGFubmVsIGhhbGYtd2lkdGggKG1ldHJlcykuICovXG4gIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhY2hIaXQge1xuICAvKiogSG9yaXpvbnRhbCBkaXN0YW5jZSBmcm9tIHRoZSBjZW50cmVsaW5lLiAqL1xuICBkOiBudW1iZXI7XG4gIC8qKiBJbnRlcnBvbGF0ZWQgd2F0ZXIgbGV2ZWwgYXQgdGhlIG5lYXJlc3QgY2VudHJlbGluZSBwb2ludC4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgd2lkdGg6IG51bWJlcjtcbiAgLyoqIFVuaXQgZG93bnN0cmVhbSBkaXJlY3Rpb24uICovXG4gIHR4OiBudW1iZXI7XG4gIHR6OiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGRyb3AgcGVyIG1ldHJlIGFsb25nIHRoZSBjaGFubmVsICg+PSAwKS4gKi9cbiAgZ3JhZGllbnQ6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggb2YgdGhlIG5lYXJlc3QgcG9pbnQgZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQuICovXG4gIHM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHBvbHlsaW5lIHJlYWNoIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LiBOZWFyZXN0LXNlZ21lbnQgcXVlcmllcyB1c2UgYVxuICogdW5pZm9ybSBncmlkIHdob3NlIGNlbGxzIGxpc3QgZXZlcnkgc2VnbWVudCB3aXRoaW4gYHJlYWNoYCBtZXRyZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBSaXZlclJlYWNoIHtcbiAgcmVhZG9ubHkgcG9pbnRzOiBSaXZlclBvaW50W107XG4gIHByaXZhdGUgcmVhZG9ubHkgY2VsbCA9IDMyO1xuICBwcml2YXRlIHJlYWRvbmx5IGdyaWQgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyW10+KCk7XG5cbiAgY29uc3RydWN0b3IocG9pbnRzOiBSaXZlclBvaW50W10sIHJlYWRvbmx5IHJlYWNoOiBudW1iZXIpIHtcbiAgICB0aGlzLnBvaW50cyA9IHBvaW50cztcbiAgICBmb3IgKGxldCBpID0gMDsgaSArIDEgPCBwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGEgPSBwb2ludHNbaV0sIGIgPSBwb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgeDAgPSBNYXRoLm1pbihhLngsIGIueCkgLSByZWFjaCwgeDEgPSBNYXRoLm1heChhLngsIGIueCkgKyByZWFjaDtcbiAgICAgIGNvbnN0IHowID0gTWF0aC5taW4oYS56LCBiLnopIC0gcmVhY2gsIHoxID0gTWF0aC5tYXgoYS56LCBiLnopICsgcmVhY2g7XG4gICAgICBmb3IgKGxldCBjeiA9IE1hdGguZmxvb3IoejAgLyB0aGlzLmNlbGwpOyBjeiA8PSBNYXRoLmZsb29yKHoxIC8gdGhpcy5jZWxsKTsgY3orKykge1xuICAgICAgICBmb3IgKGxldCBjeCA9IE1hdGguZmxvb3IoeDAgLyB0aGlzLmNlbGwpOyBjeCA8PSBNYXRoLmZsb29yKHgxIC8gdGhpcy5jZWxsKTsgY3grKykge1xuICAgICAgICAgIGNvbnN0IGtleSA9IGNlbGxLZXkoY3gsIGN6KTtcbiAgICAgICAgICBsZXQgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoa2V5KTtcbiAgICAgICAgICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB0aGlzLmdyaWQuc2V0KGtleSwgbGlzdCk7IH1cbiAgICAgICAgICBsaXN0LnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnBvaW50c1t0aGlzLnBvaW50cy5sZW5ndGggLSAxXT8ucyA/PyAwOyB9XG5cbiAgLyoqIE5lYXJlc3QgY2VudHJlbGluZSBwb2ludCB3aXRoaW4gYHJlYWNoYCwgb3IgbnVsbC4gKi9cbiAgbmVhcmVzdCh4OiBudW1iZXIsIHo6IG51bWJlcik6IFJlYWNoSGl0IHwgbnVsbCB7XG4gICAgY29uc3QgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoY2VsbEtleShNYXRoLmZsb29yKHggLyB0aGlzLmNlbGwpLCBNYXRoLmZsb29yKHogLyB0aGlzLmNlbGwpKSk7XG4gICAgaWYgKCFsaXN0KSByZXR1cm4gbnVsbDtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBiaSA9IC0xLCBidCA9IDA7XG4gICAgZm9yIChjb25zdCBpIG9mIGxpc3QpIHtcbiAgICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tpXSwgYiA9IHRoaXMucG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IGR4ID0gYi54IC0gYS54LCBkeiA9IGIueiAtIGEuejtcbiAgICAgIGNvbnN0IGxlbjIgPSBkeCAqIGR4ICsgZHogKiBkeiB8fCAxO1xuICAgICAgY29uc3QgdCA9IGNsYW1wKCgoeCAtIGEueCkgKiBkeCArICh6IC0gYS56KSAqIGR6KSAvIGxlbjIsIDAsIDEpO1xuICAgICAgY29uc3QgcHggPSBhLnggKyBkeCAqIHQsIHB6ID0gYS56ICsgZHogKiB0O1xuICAgICAgY29uc3QgZDIgPSAoeCAtIHB4KSAqKiAyICsgKHogLSBweikgKiogMjtcbiAgICAgIGlmIChkMiA8IGJlc3QpIHsgYmVzdCA9IGQyOyBiaSA9IGk7IGJ0ID0gdDsgfVxuICAgIH1cbiAgICBpZiAoYmkgPCAwIHx8IGJlc3QgPiB0aGlzLnJlYWNoICogdGhpcy5yZWFjaCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2JpXSwgYiA9IHRoaXMucG9pbnRzW2JpICsgMV07XG4gICAgY29uc3Qgc2VnTGVuID0gTWF0aC5tYXgoMWUtNiwgYi5zIC0gYS5zKTtcbiAgICAvLyBQb2ludHMgYXJlIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LCBzbyBkb3duc3RyZWFtIGlzIGEgPC0gYi5cbiAgICBjb25zdCB0eCA9IChhLnggLSBiLngpIC8gc2VnTGVuLCB0eiA9IChhLnogLSBiLnopIC8gc2VnTGVuO1xuICAgIHJldHVybiB7XG4gICAgICBkOiBNYXRoLnNxcnQoYmVzdCksXG4gICAgICBsZXZlbDogYS5sZXZlbCArIChiLmxldmVsIC0gYS5sZXZlbCkgKiBidCxcbiAgICAgIHdpZHRoOiBhLndpZHRoICsgKGIud2lkdGggLSBhLndpZHRoKSAqIGJ0LFxuICAgICAgdHgsIHR6LFxuICAgICAgZ3JhZGllbnQ6IE1hdGgubWF4KDAsIChiLmxldmVsIC0gYS5sZXZlbCkgLyBzZWdMZW4pLFxuICAgICAgczogYS5zICsgKGIucyAtIGEucykgKiBidCxcbiAgICB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGNlbGxLZXkoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoY3ggKyA0MDk2KSAqIDgxOTIgKyAoY3ogKyA0MDk2KTtcbn1cblxuZXhwb3J0IHR5cGUgV2F0ZXJCb2R5ID0gJ3JpdmVyJyB8ICdsYWtlJyB8ICdzZWEnIHwgJ25vbmUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEZsb3dTYW1wbGUge1xuICBib2R5OiBXYXRlckJvZHk7XG4gIC8qKiBVbml0IGZsb3cgZGlyZWN0aW9uICh6ZXJvIGZvciBzdGlsbCB3YXRlcikuICovXG4gIGR4OiBudW1iZXI7XG4gIGR6OiBudW1iZXI7XG4gIC8qKiBTdXJmYWNlIGN1cnJlbnQgc3BlZWQgaW4gbS9zLiAqL1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEh5ZHJvbG9neU9wdGlvbnMge1xuICBzZWVkOiBudW1iZXI7XG4gIC8qKiBHZW5lcmF0b3IgdmVyc2lvbiB0aGUgbmV0d29yayBiZWxvbmdzIHRvLiAqL1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIC8qKiBCYXNlIGhlaWdodCBvZiB0aGUgKnVubW9kaWZpZWQgdjEgc2hhcGUqICh1c2VkIHRvIGxvY2F0ZSBsYWtlL2NoYW5uZWwpLiAqL1xuICB2MUhlaWdodDogSGVpZ2h0U2FtcGxlcjtcbn1cblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2dpY2FsIG5ldHdvcmsgZm9yIG9uZSAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pLiAqL1xuZXhwb3J0IGNsYXNzIEh5ZHJvbG9neSB7XG4gIHJlYWRvbmx5IHNlZWQ6IG51bWJlcjtcbiAgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuICByZWFkb25seSBsYWtlOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByeDogbnVtYmVyOyByejogbnVtYmVyIH07XG4gIHJlYWRvbmx5IGxvd2VyOiBSaXZlclJlYWNoO1xuICByZWFkb25seSB1cHBlcjogUml2ZXJSZWFjaCB8IG51bGw7XG4gIC8qKiBVcHBlci1yaXZlciBzb3VyY2UgdGFybiAodjIgb25seSkuICovXG4gIHJlYWRvbmx5IHRhcm46IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHI6IG51bWJlcjsgbGV2ZWw6IG51bWJlciB9IHwgbnVsbDtcblxuICBjb25zdHJ1Y3RvcihvcHRzOiBIeWRyb2xvZ3lPcHRpb25zKSB7XG4gICAgdGhpcy5zZWVkID0gb3B0cy5zZWVkO1xuICAgIHRoaXMudmVyc2lvbiA9IG9wdHMudmVyc2lvbjtcbiAgICB0aGlzLmxha2UgPSBsb2NhdGVMYWtlKG9wdHMudjFIZWlnaHQpO1xuICAgIHRoaXMubG93ZXIgPSB0cmFjZUxvd2VyUml2ZXIob3B0cy52MUhlaWdodCwgdGhpcy5sYWtlKTtcbiAgICBpZiAob3B0cy52ZXJzaW9uID49IDIpIHtcbiAgICAgIGNvbnN0IHVwcGVyID0gYXV0aG9yVXBwZXJSaXZlcihvcHRzLnNlZWQsIHRoaXMubGFrZSk7XG4gICAgICB0aGlzLnVwcGVyID0gdXBwZXIucmVhY2g7XG4gICAgICB0aGlzLnRhcm4gPSB1cHBlci50YXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVwcGVyID0gbnVsbDtcbiAgICAgIHRoaXMudGFybiA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN1cmZhY2UgY3VycmVudCBmb3IgYSB3YXRlciBjb2x1bW4uIGBsZXZlbGAgaXMgdGhlIGNvbHVtbidzIHdhdGVyIHN1cmZhY2UsXG4gICAqIHVzZWQgdG8gdGVsbCBzZWEtbGV2ZWwgd2F0ZXIgKGxha2UsIGxvd2VyIHJpdmVyLCBzZWEpIGZyb20gdGhlIHVwcGVyIHJpdmVyLlxuICAgKi9cbiAgZmxvd0F0KHg6IG51bWJlciwgejogbnVtYmVyLCBsZXZlbDogbnVtYmVyKTogRmxvd1NhbXBsZSB7XG4gICAgaWYgKHRoaXMudXBwZXIgJiYgbGV2ZWwgPiAwLjUpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHRoaXMudXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPD0gaGl0LndpZHRoICsgMikge1xuICAgICAgICBjb25zdCBzcGVlZCA9IGNsYW1wKDAuNTUgKyBoaXQuZ3JhZGllbnQgKiA5LCAwLjQsIDQuNSk7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBoaXQudHgsIGR6OiBoaXQudHosIHNwZWVkIH07XG4gICAgICB9XG4gICAgICBpZiAodGhpcy50YXJuICYmIE1hdGguaHlwb3QoeCAtIHRoaXMudGFybi54LCB6IC0gdGhpcy50YXJuLnopIDwgdGhpcy50YXJuLnIgKyA0KSB7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4udG93YXJkcyh4LCB6LCB0aGlzLnVwcGVyU291cmNlKCksIDAuMDYpIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGxvdyA9IHRoaXMubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDw9IGxvdy53aWR0aCArIDYpIHtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBsb3cudHgsIGR6OiBsb3cudHosIHNwZWVkOiAwLjM1ICsgMC4yNSAqIHNtb290aHN0ZXAobG93LndpZHRoICsgNiwgMCwgbG93LmQpIH07XG4gICAgfVxuICAgIGNvbnN0IGxkID0gTWF0aC5oeXBvdCgoeCAtIHRoaXMubGFrZS54KSAvIHRoaXMubGFrZS5yeCwgKHogLSB0aGlzLmxha2UueikgLyB0aGlzLmxha2UucnopO1xuICAgIGlmIChsZCA8IDEuMzUpIHtcbiAgICAgIC8vIFNsb3cgZHJpZnQgZnJvbSB0aGUgaW5mbG93IHRvd2FyZCB0aGUgb3V0ZmxvdyBhdCB0aGUgaGVhZCBvZiB0aGUgbG93ZXIgcml2ZXIuXG4gICAgICBjb25zdCBoZWFkID0gdGhpcy5sb3dlci5wb2ludHNbdGhpcy5sb3dlci5wb2ludHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBkcmlmdCA9IHRvd2FyZHMoeCwgeiwgaGVhZCwgMC4wOCk7XG4gICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLmRyaWZ0IH07XG4gICAgfVxuICAgIHJldHVybiB7IGJvZHk6ICdzZWEnLCBkeDogMCwgZHo6IDAsIHNwZWVkOiAwIH07XG4gIH1cblxuICBwcml2YXRlIHVwcGVyU291cmNlKCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gICAgY29uc3QgcHRzID0gdGhpcy51cHBlciEucG9pbnRzO1xuICAgIHJldHVybiBwdHNbcHRzLmxlbmd0aCAtIDFdO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvd2FyZHMoeDogbnVtYmVyLCB6OiBudW1iZXIsIHA6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgc3BlZWQ6IG51bWJlcikge1xuICBjb25zdCBkeCA9IHAueCAtIHgsIGR6ID0gcC56IC0gejtcbiAgY29uc3QgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gIHJldHVybiB7IGR4OiBkeCAvIGxlbiwgZHo6IGR6IC8gbGVuLCBzcGVlZCB9O1xufVxuXG4vKiogRmluZCB0aGUgdmFsbGV5IGxha2UgZnJvbSB0aGUgdGVycmFpbiBpdHNlbGY6IHRoZSBkZWVwIGJhc2luIE5XIG9mIHRoZSBmb3VuZGVyIHZhbGxleS4gKi9cbmZ1bmN0aW9uIGxvY2F0ZUxha2UoaDogSGVpZ2h0U2FtcGxlcik6IEh5ZHJvbG9neVsnbGFrZSddIHtcbiAgbGV0IHN4ID0gMCwgc3ogPSAwLCBuID0gMCwgbWluWCA9IEluZmluaXR5LCBtYXhYID0gLUluZmluaXR5LCBtaW5aID0gSW5maW5pdHksIG1heFogPSAtSW5maW5pdHk7XG4gIGZvciAobGV0IHogPSAtNDYwOyB6IDw9IC0xMjA7IHogKz0gNCkge1xuICAgIGZvciAobGV0IHggPSAtNDgwOyB4IDw9IC00MDsgeCArPSA0KSB7XG4gICAgICBpZiAoaCh4LCB6KSA+IC00KSBjb250aW51ZTtcbiAgICAgIHN4ICs9IHg7IHN6ICs9IHo7IG4rKztcbiAgICAgIG1pblggPSBNYXRoLm1pbihtaW5YLCB4KTsgbWF4WCA9IE1hdGgubWF4KG1heFgsIHgpO1xuICAgICAgbWluWiA9IE1hdGgubWluKG1pblosIHopOyBtYXhaID0gTWF0aC5tYXgobWF4Wiwgeik7XG4gICAgfVxuICB9XG4gIGlmIChuID09PSAwKSByZXR1cm4geyB4OiAtMjYwLCB6OiAtMjMwLCByeDogMTIwLCByejogOTUgfTtcbiAgcmV0dXJuIHtcbiAgICB4OiBzeCAvIG4sIHo6IHN6IC8gbixcbiAgICByeDogTWF0aC5tYXgoMzAsIChtYXhYIC0gbWluWCkgLyAyICsgMTApLCByejogTWF0aC5tYXgoMzAsIChtYXhaIC0gbWluWikgLyAyICsgMTApLFxuICB9O1xufVxuXG4vKipcbiAqIFRyYWNlIHRoZSBjYXJ2ZWQgbG93bGFuZCBjaGFubmVsIGZyb20gdGhlIGxha2Ugb3V0ZmxvdyBzb3V0aCB0byB0aGUgc2VhLiBGb3JcbiAqIGVhY2ggNCBtIHJvdyB0aGUgY2hhbm5lbCBpcyB0aGUgbG93ZXN0IGNvbHVtbiBuZWFyIHRoZSBwcmV2aW91cyBjZW50cmU7IHRoZVxuICogdHJhY2UgaXMgc21vb3RoZWQgc28gdGhlIGZsb3cgZmllbGQgZG9lcyBub3Qgaml0dGVyIHdpdGggdGhlIDEgbSB2b3hlbHMuXG4gKi9cbmZ1bmN0aW9uIHRyYWNlTG93ZXJSaXZlcihoOiBIZWlnaHRTYW1wbGVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IFJpdmVyUmVhY2gge1xuICBjb25zdCByYXc6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgbGV0IGN4ID0gbGFrZS54ICsgbGFrZS5yeCAqIDAuNTU7XG4gIGxldCB6ID0gTWF0aC5yb3VuZChsYWtlLnogKyBsYWtlLnJ6ICogMC42KTtcbiAgLy8gU3RhcnQgYXQgdGhlIGxha2UncyBzb3V0aC1lYXN0IG91dGZsb3cgYW5kIGZvbGxvdyB0aGUgY2hhbm5lbCBkb3duc3RyZWFtLlxuICBmb3IgKDsgeiA8PSA5MDA7IHogKz0gNCkge1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJ4ID0gY3g7XG4gICAgZm9yIChsZXQgeCA9IE1hdGgucm91bmQoY3ggLSA0MCk7IHggPD0gY3ggKyA0MDsgeCArPSAyKSB7XG4gICAgICBjb25zdCB2ID0gaCh4LCB6KSArIE1hdGguYWJzKHggLSBjeCkgKiAwLjAyO1xuICAgICAgaWYgKHYgPCBiZXN0KSB7IGJlc3QgPSB2OyBieCA9IHg7IH1cbiAgICB9XG4gICAgY3ggPSBieDtcbiAgICByYXcucHVzaCh7IHg6IGJ4LCB6IH0pO1xuICAgIC8vIFRoZSB0cmFjZSBlbmRzIG9uY2UgaXQgcmVhY2hlcyBvcGVuIHNlYSBmb3IgYSBzdXN0YWluZWQgc3RyZXRjaC5cbiAgICBpZiAoYmVzdCA8IC02ICYmIHJhdy5sZW5ndGggPiAyMCAmJiBoKGJ4LCB6ICsgOCkgPCAtNiAmJiBoKGJ4LCB6ICsgMTYpIDwgLTYpIGJyZWFrO1xuICB9XG4gIGNvbnN0IHNtb290aCA9IHJhdy5tYXAoKHAsIGkpID0+IHtcbiAgICBsZXQgc3ggPSAwLCBuID0gMDtcbiAgICBmb3IgKGxldCBrID0gTWF0aC5tYXgoMCwgaSAtIDQpOyBrIDw9IE1hdGgubWluKHJhdy5sZW5ndGggLSAxLCBpICsgNCk7IGsrKykgeyBzeCArPSByYXdba10ueDsgbisrOyB9XG4gICAgcmV0dXJuIHsgeDogc3ggLyBuLCB6OiBwLnogfTtcbiAgfSk7XG4gIC8vIFN0b3JlIGRvd25zdHJlYW0tZmlyc3Q6IGluZGV4IDAgaXMgdGhlIHNlYSBtb3V0aC5cbiAgc21vb3RoLnJldmVyc2UoKTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSBbXTtcbiAgbGV0IHMgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHNtb290aC5sZW5ndGg7IGkrKykge1xuICAgIGlmIChpID4gMCkgcyArPSBNYXRoLmh5cG90KHNtb290aFtpXS54IC0gc21vb3RoW2kgLSAxXS54LCBzbW9vdGhbaV0ueiAtIHNtb290aFtpIC0gMV0ueik7XG4gICAgcG9pbnRzLnB1c2goeyB4OiBzbW9vdGhbaV0ueCwgejogc21vb3RoW2ldLnosIHMsIGxldmVsOiAwLCB3aWR0aDogNiB9KTtcbiAgfVxuICByZXR1cm4gbmV3IFJpdmVyUmVhY2gocG9pbnRzLCA0MCk7XG59XG5cbi8qKiBXYXRlci1zdXJmYWNlIGRyb3BzIGFsb25nIHRoZSB1cHBlciByaXZlciwgYXMgKGZyYWN0aW9uIG9mIGxlbmd0aCwgbWV0cmVzKS4gKi9cbmNvbnN0IEZBTExTOiBSZWFkb25seUFycmF5PHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0+ID0gW1swLjIsIDddLCBbMC40OCwgMTFdLCBbMC43NCwgMTNdXTtcbmNvbnN0IFVQUEVSX0dSQURJRU5UID0gMC4wMztcblxuLyoqXG4gKiBBdXRob3IgdGhlIHYyIG1vdW50YWluIHJpdmVyOiBhIHNlZWRlZCBtZWFuZGVyaW5nIGNlbnRyZWxpbmUgZnJvbSB0aGUgbGFrZSdzXG4gKiBub3J0aCBzaG9yZSB0byBhIGhpZ2hsYW5kIHRhcm4sIHdpdGggYSBsZXZlbCBwcm9maWxlIHRoYXQgb25seSByaXNlc1xuICogdXBzdHJlYW0gKGdlbnRsZSBncmFkaWVudCBwbHVzIHRocmVlIGNhc2NhZGVzKS5cbiAqL1xuZnVuY3Rpb24gYXV0aG9yVXBwZXJSaXZlcihzZWVkOiBudW1iZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKToge1xuICByZWFjaDogUml2ZXJSZWFjaDsgdGFybjogTm9uTnVsbGFibGU8SHlkcm9sb2d5Wyd0YXJuJ10+O1xufSB7XG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKHNlZWQgXiAweDVlZWQyKSA+Pj4gMCk7XG4gIGNvbnN0IGogPSAoYTogbnVtYmVyKSA9PiAocm5kKCkgLSAwLjUpICogMiAqIGE7XG4gIGNvbnN0IG1vdXRoID0geyB4OiBsYWtlLnggKyBsYWtlLnJ4ICogMC4xLCB6OiBsYWtlLnogLSBsYWtlLnJ6ICogMC41NSB9O1xuICBjb25zdCBjb250cm9scyA9IFtcbiAgICBtb3V0aCxcbiAgICB7IHg6IGxha2UueCArIDIwICsgaigyMCksIHo6IC00MTAgKyBqKDE1KSB9LFxuICAgIHsgeDogLTE5MCArIGooMzUpLCB6OiAtNTIwICsgaigyMCkgfSxcbiAgICB7IHg6IC0yMTUgKyBqKDM1KSwgejogLTY0MCArIGooMjApIH0sXG4gICAgeyB4OiAtMTY1ICsgaigzMCksIHo6IC03NzAgKyBqKDE1KSB9LFxuICBdO1xuICAvLyBDYXRtdWxsLVJvbSB0aHJvdWdoIHRoZSBjb250cm9scywgdGhlbiByZXNhbXBsZSBhdCB+OCBtIHNwYWNpbmcgd2l0aCBhXG4gIC8vIHNtYWxsIHNlZWRlZCBtZWFuZGVyIHNvIHRoZSBjaGFubmVsIGlzIG5vdCBhIHNtb290aCBzcGxpbmUuXG4gIGNvbnN0IGRlbnNlOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29udHJvbHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgY29uc3QgcDAgPSBjb250cm9sc1tNYXRoLm1heCgwLCBpIC0gMSldLCBwMSA9IGNvbnRyb2xzW2ldO1xuICAgIGNvbnN0IHAyID0gY29udHJvbHNbaSArIDFdLCBwMyA9IGNvbnRyb2xzW01hdGgubWluKGNvbnRyb2xzLmxlbmd0aCAtIDEsIGkgKyAyKV07XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCAyNDsgaysrKSB7XG4gICAgICBjb25zdCB0ID0gayAvIDI0LCB0MiA9IHQgKiB0LCB0MyA9IHQyICogdDtcbiAgICAgIGRlbnNlLnB1c2goe1xuICAgICAgICB4OiAwLjUgKiAoMiAqIHAxLnggKyAoLXAwLnggKyBwMi54KSAqIHQgKyAoMiAqIHAwLnggLSA1ICogcDEueCArIDQgKiBwMi54IC0gcDMueCkgKiB0MlxuICAgICAgICAgICsgKC1wMC54ICsgMyAqIHAxLnggLSAzICogcDIueCArIHAzLngpICogdDMpLFxuICAgICAgICB6OiAwLjUgKiAoMiAqIHAxLnogKyAoLXAwLnogKyBwMi56KSAqIHQgKyAoMiAqIHAwLnogLSA1ICogcDEueiArIDQgKiBwMi56IC0gcDMueikgKiB0MlxuICAgICAgICAgICsgKC1wMC56ICsgMyAqIHAxLnogLSAzICogcDIueiArIHAzLnopICogdDMpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGRlbnNlLnB1c2goY29udHJvbHNbY29udHJvbHMubGVuZ3RoIC0gMV0pO1xuICBjb25zdCByZXNhbXBsZWQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHM6IG51bWJlciB9PiA9IFt7IC4uLmRlbnNlWzBdLCBzOiAwIH1dO1xuICBsZXQgYWNjID0gMCwgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgZGVuc2UubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5oeXBvdChkZW5zZVtpXS54IC0gZGVuc2VbaSAtIDFdLngsIGRlbnNlW2ldLnogLSBkZW5zZVtpIC0gMV0ueik7XG4gICAgYWNjICs9IHN0ZXA7IHMgKz0gc3RlcDtcbiAgICBpZiAoYWNjID49IDggfHwgaSA9PT0gZGVuc2UubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbSA9IChmYm0yKHMgLyA2MCwgMy4xLCBzZWVkICsgODAxLCAyKSAtIDAuNSkgKiAxNDtcbiAgICAgIHJlc2FtcGxlZC5wdXNoKHsgeDogZGVuc2VbaV0ueCArIG0sIHo6IGRlbnNlW2ldLnosIHMgfSk7XG4gICAgICBhY2MgPSAwO1xuICAgIH1cbiAgfVxuICBjb25zdCB0b3RhbCA9IHJlc2FtcGxlZFtyZXNhbXBsZWQubGVuZ3RoIC0gMV0ucztcbiAgY29uc3QgbGV2ZWxBdCA9IChzdjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBsZXQgbGV2ZWwgPSBzdiAqIFVQUEVSX0dSQURJRU5UO1xuICAgIGZvciAoY29uc3QgW2ZyYWMsIGRyb3BdIG9mIEZBTExTKSB7XG4gICAgICAvLyBFYWNoIGZhbGwgaXMgYSBzaG9ydCBjYXNjYWRlIG92ZXIgfjEwIG0gb2YgY2hhbm5lbC5cbiAgICAgIGxldmVsICs9IGRyb3AgKiBzbW9vdGhzdGVwKHRvdGFsICogZnJhYyAtIDUsIHRvdGFsICogZnJhYyArIDUsIHN2KTtcbiAgICB9XG4gICAgLy8gVGhlIGZpcnN0IDQwIG0gaW50byB0aGUgbGFrZSBzdGF5cyBhdCBsYWtlIGxldmVsLlxuICAgIHJldHVybiBzdiA8IDQwID8gMCA6IGxldmVsIC0gNDAgKiBVUFBFUl9HUkFESUVOVDtcbiAgfTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSByZXNhbXBsZWQubWFwKChwKSA9PiAoe1xuICAgIHg6IHAueCwgejogcC56LCBzOiBwLnMsIGxldmVsOiBNYXRoLm1heCgwLCBsZXZlbEF0KHAucykpLFxuICAgIHdpZHRoOiAzLjIgKyAyLjIgKiBmYm0yKHAucyAvIDcwLCA5LjcsIHNlZWQgKyA4MDIsIDIpICsgKDEgLSBwLnMgLyB0b3RhbCkgKiAxLjUsXG4gIH0pKTtcbiAgY29uc3Qgc291cmNlID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIHtcbiAgICByZWFjaDogbmV3IFJpdmVyUmVhY2gocG9pbnRzLCAxMTApLFxuICAgIHRhcm46IHsgeDogc291cmNlLngsIHo6IHNvdXJjZS56LCByOiAxOCwgbGV2ZWw6IHNvdXJjZS5sZXZlbCB9LFxuICB9O1xufVxuIiwgIi8vIFZveGVsIG1hdGVyaWFsIGlkcy4gUHVyZSBkYXRhIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllciAoRC0wMDUpLlxuLy8gSWRzIGFyZSBwZXJzaXN0ZWQgaW4gc25hcHNob3QgZWRpdHMsIHNvIGV4aXN0aW5nIHZhbHVlcyBtdXN0IG5ldmVyIGNoYW5nZS5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG4gIC8qKiBHZW5lcmF0b3IgdjIgaGlnaGxhbmRzLiBOZXZlciBwcm9kdWNlZCBieSBnZW5lcmF0b3IgdjEuICovXG4gIFNOT1c6IDEwLFxufSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIE1hdElkID0gKHR5cGVvZiBNQVQpW2tleW9mIHR5cGVvZiBNQVRdO1xuXG5leHBvcnQgY29uc3QgaXNTb2xpZCA9IChtOiBudW1iZXIpOiBib29sZWFuID0+IG0gIT09IE1BVC5BSVIgJiYgbSAhPT0gTUFULldBVEVSO1xuZXhwb3J0IGNvbnN0IGlzT3BhcXVlID0gaXNTb2xpZDtcblxuLyoqIEhpZ2hlc3QgbWF0ZXJpYWwgaWQgdGhhdCBtYXkgYXBwZWFyIGluIGEgdm94ZWwgZWRpdC4gKi9cbmV4cG9ydCBjb25zdCBNQVhfTUFUX0lEID0gMTA7XG4iLCAiLy8gVGVycmFpbiBnZW5lcmF0b3IgdjIgXHUyMDE0IHRoZSB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IChwdXJlIFRTLCBELTAwNSkuXG4vL1xuLy8gQ29tcGF0aWJpbGl0eSBjb250cmFjdDogaW5zaWRlIHRoZSBmb3VuZGVyIGNvcnJpZG9yICh0aGUgc2V0dGxlbWVudCB2YWxsZXksXG4vLyB0aGUgbGFrZSBhbmQgdGhlIGxvd2xhbmQgcml2ZXIpIHYyIGhlaWdodHMgZXF1YWwgdjEgZXhhY3RseSwgc28gdGhlIHBpbm5lZFxuLy8gZm91bmRlciBwcm9qZWN0cywgdGhlaXIgcHJlcGFyYXRpb24gdGFyZ2V0cyBhbmQgbmF0dXJhbCBlbnRpdGllcyB0aGVyZSBhcmVcbi8vIHVuY2hhbmdlZC4gT3V0c2lkZSBpdCB2MiBhZGRzOlxuLy8gICAtIGEgbm9ydGhlcm4gbWFzc2lmIG9uIGFuIGV4dGVuZGVkIGlzbGFuZCwgd2l0aCBzbm93IGFib3ZlIHRoZSBzbm93bGluZTtcbi8vICAgLSBmbGFua2luZyByYW5nZXMgd2VzdCBhbmQgZWFzdCBvZiB0aGUgdmFsbGV5LCB0ZXJyYWNlZCBpbnRvIGNsaWZmIGJhbmRzO1xuLy8gICAtIGEgbW91bnRhaW4gcml2ZXIgY2FydmVkIGludG8gdGhlIG1hc3NpZiBmcm9tIGEgdGFybiBkb3duIHRvIHRoZSBsYWtlLFxuLy8gICAgIHdob3NlIHdhdGVyIHN1cmZhY2UgY29tZXMgZnJvbSBIeWRyb2xvZ3kgYW5kIG5ldmVyIHJpc2VzIGRvd25zdHJlYW07XG4vLyAgIC0gYSBjb250aW51b3VzIGxvd2xhbmQgY2hhbm5lbCAodjEgaGFzIGEgZHJ5IGZvcmQgc291dGggb2YgdGhlIHNoZWxmKS5cbi8vIEhlaWdodHMgYXJlIGludGVnZXJzIGluIFstMTQsIDEwNF0uXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbGVycCwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHsgTUFULCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcblxuZXhwb3J0IGNvbnN0IFYyX1NOT1dMSU5FID0gNzQ7XG5leHBvcnQgY29uc3QgVjJfTUFYX0hFSUdIVCA9IDEwNDtcblxuZXhwb3J0IHR5cGUgVjFIZWlnaHQgPSAoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFYyQ29sdW1uIHtcbiAgLyoqIFRvcCBzb2xpZCB5ICsgMSAoc2FtZSBjb252ZW50aW9uIGFzIHN1cmZhY2VIZWlnaHRBdCkuICovXG4gIGg6IG51bWJlcjtcbiAgLyoqIFdhdGVyIHN1cmZhY2UgZm9yIHRoaXMgY29sdW1uOiBjZWxscyBbaCwgbGV2ZWwpIGhvbGQgd2F0ZXIuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBjb2x1bW4gaXMgcGFydCBvZiB0aGUgY2FydmVkIG1vdW50YWluLXJpdmVyIGNoYW5uZWwuICovXG4gIGNoYW5uZWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJyYWluVjIge1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSBzZWVkOiBudW1iZXIsXG4gICAgcHJpdmF0ZSByZWFkb25seSB2MTogVjFIZWlnaHQsXG4gICAgcmVhZG9ubHkgaHlkcm9sb2d5OiBIeWRyb2xvZ3ksXG4gICkge31cblxuICAvKiogMCA9IGV4YWN0bHkgdjEgKGZvdW5kZXIgY29ycmlkb3IpOyAxID0gZnVsbCB2MiByZWxpZWYuICovXG4gIHJlbGllZk1hc2soeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtMzkwLCAtNDcwLCB6KTtcbiAgICAvLyBUaGUgd2VzdCByYW5nZSBrZWVwcyBjbGVhciBvZiB0aGUgbGFrZSBiYXNpbiB1bnRpbCB0aGUgbGFrZSBpcyBwYXNzZWQuXG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlLCB3ZXN0RWRnZSAtIDkwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyMzAsIDMzMCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIC8qKiAwIGF0IHRoZSByYW5nZSBmcm9udCwgMSBkZWVwIGluc2lkZTogZm9vdGhpbGxzIGZpcnN0LCBwZWFrcyBiZWhpbmQuICovXG4gIHJhbmdlRGVwdGgoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtNDIwLCAtNzAwLCB6KTtcbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UgLSA0MCwgd2VzdEVkZ2UgLSAzMDAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDI3MCwgNTYwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVjJDb2x1bW4ge1xuICAgIGNvbnN0IHNlZWQgPSB0aGlzLnNlZWQ7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMudjEoc2VlZCwgeCwgeik7XG4gICAgY29uc3QgbWFzayA9IHRoaXMucmVsaWVmTWFzayh4LCB6KTtcbiAgICBsZXQgaCA9IGJhc2U7XG5cbiAgICBpZiAobWFzayA+IDApIHtcbiAgICAgIC8vIEV4dGVuZCB0aGUgaXNsYW5kIG5vcnRoIHNvIHRoZSBtYXNzaWYgaGFzIHJvb20gKHYxIGNvYXN0IGlzIH56IC02MDApLlxuICAgICAgY29uc3Qgbm9ydGhMYW5kID0gc21vb3Roc3RlcCgtNDIwLCAtNTIwLCB6KTtcbiAgICAgIGNvbnN0IHNob3JlID0gMSAtIE1hdGguaHlwb3QoKHggKyAxNTApIC8gNTYwLCAoeiArIDY5MCkgLyAzMDApXG4gICAgICAgICsgKGZibTIoeCAvIDE2MCwgeiAvIDE2MCwgc2VlZCArIDcwMSwgMykgLSAwLjUpICogMC4zO1xuICAgICAgY29uc3QgbGFuZE4gPSBzbW9vdGhzdGVwKDAuMCwgMC4xNCwgc2hvcmUpICogbm9ydGhMYW5kO1xuICAgICAgY29uc3QgZ3JvdW5kID0gbGVycChiYXNlLCBNYXRoLm1heChiYXNlLCA1ICsgNSAqIGZibTIoeCAvIDkwLCB6IC8gOTAsIHNlZWQgKyA3MDIsIDIpKSwgbGFuZE4pO1xuXG4gICAgICAvLyBSaWRnZWQgbWFzc2lmIHdpdGggdGVycmFjZWQgY2xpZmYgYmFuZHMuXG4gICAgICBjb25zdCB3eCA9IHggKyAoZmJtMih4IC8gMjYwLCB6IC8gMjYwLCBzZWVkICsgNzAzLCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCB3eiA9IHogKyAoZmJtMih4IC8gMjYwICsgNS4xLCB6IC8gMjYwIC0gMi43LCBzZWVkICsgNzA0LCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCByMSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIxMCwgd3ogLyAyMTAsIHNlZWQgKyA3MDUsIDQpIC0gMSk7XG4gICAgICBjb25zdCByMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDgwLCB3eiAvIDgwLCBzZWVkICsgNzA2LCAzKSAtIDEpO1xuICAgICAgY29uc3QgbHVtcCA9IGZibTIod3ggLyAxMjAsIHd6IC8gMTIwLCBzZWVkICsgNzA3LCAzKTtcbiAgICAgIGNvbnN0IGRlcHRoID0gdGhpcy5yYW5nZURlcHRoKHgsIHopO1xuICAgICAgbGV0IG1vdW50YWluID0gMTYgKyAoOCArIDgwICogZGVwdGgpICogKDAuNTUgKiByMSAqIHIxICsgMC4yOCAqIHIyICsgMC4xNyAqIGx1bXApXG4gICAgICAgICsgMTggKiBkZXB0aCAqIHNtb290aHN0ZXAoMC41NSwgMC45LCByMSk7XG4gICAgICBjb25zdCBiYW5kID0gNiArIDIgKiBmYm0yKHggLyAxNDAsIHogLyAxNDAsIHNlZWQgKyA3MDgsIDIpO1xuICAgICAgY29uc3QgdCA9IE1hdGguZmxvb3IobW91bnRhaW4gLyBiYW5kKTtcbiAgICAgIGNvbnN0IGZyYWMgPSBtb3VudGFpbiAvIGJhbmQgLSB0O1xuICAgICAgbW91bnRhaW4gPSAodCArIHNtb290aHN0ZXAoMC41LCAwLjgsIGZyYWMpKSAqIGJhbmQ7XG5cbiAgICAgIC8vIE9ubHkgbGFuZCByaXNlczsgdGhlIHNlYSBzdGF5cyBzZWEsIHNvIHJhbmdlcyBlbmQgaW4gY29hc3RhbCBjbGlmZnMuXG4gICAgICBjb25zdCBsYW5kRmFjdG9yID0gc21vb3Roc3RlcCgtMiwgOCwgZ3JvdW5kKTtcbiAgICAgIGggPSBsZXJwKGdyb3VuZCwgTWF0aC5tYXgoZ3JvdW5kLCBtb3VudGFpbiksIG1hc2sgKiBsYW5kRmFjdG9yKTtcbiAgICB9XG5cbiAgICBsZXQgbGV2ZWwgPSBoIDwgMCA/IDAgOiAtSW5maW5pdHk7XG4gICAgbGV0IGNoYW5uZWwgPSBmYWxzZTtcblxuICAgIC8vIE1vdW50YWluIHJpdmVyOiB2YWxsZXkgZmxvb3IsIGJhbmtzIGFuZCBjaGFubmVsIGZvbGxvdyB0aGUgd2F0ZXIgbGV2ZWwuXG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIGNvbnN0IHJhaXNlZCA9IGhpdC5sZXZlbCA+IDAuMjU7XG4gICAgICAgIGNvbnN0IHZ3ID0gNTUgKyAyOCAqIGZibTIoaGl0LnMgLyA5MCwgMS43LCBzZWVkICsgNzA5LCAyKTtcbiAgICAgICAgY29uc3QgZmxvb3IgPSBoaXQubGV2ZWwgKyAxLjUgKyAyLjIgKiBmYm0yKHggLyA0MCwgeiAvIDQwLCBzZWVkICsgNzEwLCAyKSArIGhpdC5kICogMC4wNjtcbiAgICAgICAgY29uc3QgdCA9IHNtb290aHN0ZXAodncgKiAwLjMsIHZ3LCBoaXQuZCk7XG4gICAgICAgIGggPSBNYXRoLm1pbihoLCBsZXJwKGZsb29yLCBoLCB0KSk7XG4gICAgICAgIGNvbnN0IHcgPSBoaXQud2lkdGg7XG4gICAgICAgIGlmIChyYWlzZWQgJiYgaGl0LmQgPCB3ICsgMykge1xuICAgICAgICAgIC8vIEJhbmtzIGhvbGQgYSByYWlzZWQgcml2ZXI6IG5ldmVyIGJlbG93IGl0cyB3YXRlciBzdXJmYWNlLiBBdCBsYWtlXG4gICAgICAgICAgLy8gbGV2ZWwgdGhlIHNlYS1sZXZlbCBmaWxsIGFscmVhZHkgY29udGFpbnMgdGhlIHdhdGVyLlxuICAgICAgICAgIGggPSBNYXRoLm1heChoLCBNYXRoLmNlaWwoaGl0LmxldmVsKSArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoaXQuZCA8IHcpIHtcbiAgICAgICAgICBjb25zdCBiZWQgPSBoaXQubGV2ZWwgLSAoMS4yICsgMS4zICogKDEgLSBoaXQuZCAvIHcpKTtcbiAgICAgICAgICBoID0gTWF0aC5taW4oaCwgYmVkKTtcbiAgICAgICAgICBpZiAocmFpc2VkKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKGhpdC5sZXZlbCkpO1xuICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCB0YXJuID0gdGhpcy5oeWRyb2xvZ3kudGFybjtcbiAgICAgIGlmICh0YXJuKSB7XG4gICAgICAgIGNvbnN0IHRkID0gTWF0aC5oeXBvdCh4IC0gdGFybi54LCB6IC0gdGFybi56KVxuICAgICAgICAgICogKDEgKyAwLjIgKiAoZmJtMih4IC8gMzAsIHogLyAzMCwgc2VlZCArIDcxMSwgMikgLSAwLjUpKTtcbiAgICAgICAgaWYgKHRkIDwgdGFybi5yICsgNikge1xuICAgICAgICAgIGNvbnN0IHJpbSA9IE1hdGguY2VpbCh0YXJuLmxldmVsKSArIDE7XG4gICAgICAgICAgaWYgKHRkID49IHRhcm4ucikgaCA9IE1hdGgubWF4KGgsIHJpbSk7XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBoID0gTWF0aC5taW4oTWF0aC5tYXgoaCwgcmltKSwgdGFybi5sZXZlbCAtIDEgLSAzICogc21vb3Roc3RlcCh0YXJuLnIsIDAsIHRkKSk7XG4gICAgICAgICAgICBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKHRhcm4ubGV2ZWwpKTtcbiAgICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExvd2xhbmQgY2hhbm5lbCBjb250aW51aXR5OiB2MSBsZWF2ZXMgYSBkcnkgZm9yZCB3aGVyZSB0aGUgc2hlbGYgbWVldHMgdGhlIHJpdmVyLlxuICAgIGNvbnN0IGxvdyA9IHRoaXMuaHlkcm9sb2d5Lmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8IDIuNSAmJiBoID49IDAgJiYgYmFzZSA8IDQpIGggPSAtMTtcblxuICAgIGggPSBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgVjJfTUFYX0hFSUdIVCkpO1xuICAgIGlmIChoIDwgMCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgMCk7XG4gICAgcmV0dXJuIHsgaCwgbGV2ZWw6IGxldmVsID09PSAtSW5maW5pdHkgPyBoIDogbGV2ZWwsIGNoYW5uZWwgfTtcbiAgfVxuXG4gIGhlaWdodCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY29sdW1uKHgsIHopLmg7XG4gIH1cblxuICAvKiogdjIgdG9wIG1hdGVyaWFsLiBGYWxscyBiYWNrIHRvIHRoZSB2MSBydWxlcyBmb3IgdGhlIHVuY2hhbmdlZCBjb3JyaWRvci4gKi9cbiAgdG9wTWF0ZXJpYWwoXG4gICAgeDogbnVtYmVyLCB6OiBudW1iZXIsIGNvbDogVjJDb2x1bW4sIHNsb3BlOiBudW1iZXIsXG4gICAgdjFUb3A6IChoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIpID0+IE1hdElkLFxuICApOiBNYXRJZCB7XG4gICAgY29uc3QgaCA9IGNvbC5oO1xuICAgIGlmIChjb2wuY2hhbm5lbCAmJiBjb2wubGV2ZWwgPiBoKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlciAmJiBoID4gMSkge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPCBoaXQud2lkdGggKyAyLjUgJiYgaGl0LmxldmVsID4gMC4yNSkge1xuICAgICAgICByZXR1cm4gZmJtMih4IC8gNiwgeiAvIDYsIHRoaXMuc2VlZCArIDcxMiwgMSkgPiAwLjUgPyBNQVQuR1JBVkVMIDogTUFULlNBTkQ7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNub3dsaW5lID0gVjJfU05PV0xJTkUgKyAoZmJtMih4IC8gNzAsIHogLyA3MCwgdGhpcy5zZWVkICsgNzEzLCAzKSAtIDAuNSkgKiAxNjtcbiAgICBpZiAoaCA+PSBzbm93bGluZSAmJiBzbG9wZSA8PSAzKSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgLSA2ICYmIHNsb3BlIDw9IDEgJiYgZmJtMih4IC8gMjAsIHogLyAyMCwgdGhpcy5zZWVkICsgNzE0LCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAodGhpcy5yZWxpZWZNYXNrKHgsIHopID4gMC41ICYmIGggPiAzMCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICAgIHJldHVybiB2MVRvcChoLCBzbG9wZSk7XG4gIH1cbn1cbiIsICIvLyBTaW11bGF0aW9uIGxheWVyIFx1MjAxNCBwdXJlIFR5cGVTY3JpcHQsIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAxIHdvcmxkIGZvdW5kYXRpb246IGEgY2h1bmtlZCwgZ2VudWluZWx5IHRocmVlLWRpbWVuc2lvbmFsIHZveGVsIHdvcmxkLlxuLy8gVGhlIHN0b3JlZCBzdGF0ZSBpcyBvbmUgbWF0ZXJpYWwgYnl0ZSBwZXIgY2VsbCAoMCA9IGFpcik7IG9jY3VwYW5jeSBpc1xuLy8gaW1wbGljaXQuIFN1cmZhY2UgaGVpZ2h0IGlzIGEgZGVyaXZlZCBxdWVyeSwgbm90IHRoZSBzdG9yYWdlLiBUaGlzIHJlcGxhY2VzXG4vLyB0aGUgZm9ybWVyIDI1NiB4IDI1NiBoZWlnaHRmaWVsZCAoc2VlIElSLTAwNSkuXG4vL1xuLy8gV29ybGQgbWV0cmVzOiB4L3ogaW4gWy0xMDI0LCAxMDI0KSwgeSBpbiBbLTE2LCAxMTIpLCBzZWEgbGV2ZWwgMC5cbi8vIEEgY2h1bmsgaXMgMzIgeCAzMiB4IDEyOCBjZWxscy4gR2VuZXJhdGlvbiBpcyBhIHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQsXG4vLyBnZW5lcmF0b3IgdmVyc2lvbiwgcGFyYW1ldGVycyBhbmQgY2h1bmsgY29vcmRpbmF0ZXM7IGVkaXRzIGFyZSByZWNvcmRlZFxuLy8gc2VwYXJhdGVseSBhbmQgcmUtYXBwbGllZCB3aGVuIGEgY2h1bmsgaXMgcmVnZW5lcmF0ZWQuXG5pbXBvcnQgdHlwZSB7IFN0cnVjdHVyZSB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQgdHlwZSB7IExpZmVTdGF0ZSB9IGZyb20gJy4vZWNvbm9teSc7XG5pbXBvcnQgdHlwZSB7IEhvbWVzdGVhZFN0YXRlIH0gZnJvbSAnLi9ob21lc3RlYWQnO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcbmltcG9ydCB7IFRlcnJhaW5WMiwgVjJDb2x1bW4gfSBmcm9tICcuL3RlcnJhaW4tdjInO1xuXG5leHBvcnQgY29uc3QgV09STERfU0laRSA9IDIwNDg7XG5leHBvcnQgY29uc3QgSEFMRiA9IFdPUkxEX1NJWkUgLyAyO1xuZXhwb3J0IGNvbnN0IENIVU5LX1NJWkUgPSAzMjtcbmV4cG9ydCBjb25zdCBDSFVOS1NfUEVSX1NJREUgPSBXT1JMRF9TSVpFIC8gQ0hVTktfU0laRTtcbmV4cG9ydCBjb25zdCBZX01JTiA9IC0xNjtcbmV4cG9ydCBjb25zdCBZX01BWCA9IDExMjtcbmV4cG9ydCBjb25zdCBXT1JMRF9IRUlHSFQgPSBZX01BWCAtIFlfTUlOO1xuZXhwb3J0IGNvbnN0IFNFQV9MRVZFTCA9IDA7XG5leHBvcnQgY29uc3QgV0FURVIgPSBTRUFfTEVWRUw7XG4vKiogR2VuZXJhdG9yIHYxOiB0aGUgb3JpZ2luYWwgMjA0OCBtIGlzbGFuZC4gRGVmYXVsdCBmb3IgY3JlYXRlV29ybGQgYW5kIGFsbCBsZWdhY3kgc2F2ZXMuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1ZFUlNJT04gPSAxO1xuLyoqIEdlbmVyYXRvciB2MjogdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSB3aXRoIGEgbW91bnRhaW4gcml2ZXIgKHNlZSB0ZXJyYWluLXYyLnRzKS4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVjIgPSAyO1xuLyoqIFRoZSBnZW5lcmF0b3IgbmV3IGJyb3dzZXIgd29ybGRzIHVzZSBieSBkZWZhdWx0LiAqL1xuZXhwb3J0IGNvbnN0IExBVEVTVF9HRU5FUkFUT1JfVkVSU0lPTiA9IEdFTkVSQVRPUl9WMjtcbmV4cG9ydCBjb25zdCBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TOiByZWFkb25seSBudW1iZXJbXSA9IFtHRU5FUkFUT1JfVkVSU0lPTiwgR0VORVJBVE9SX1YyXTtcbmV4cG9ydCBjb25zdCBpc1N1cHBvcnRlZEdlbmVyYXRvciA9ICh2OiB1bmtub3duKTogdiBpcyBudW1iZXIgPT5cbiAgdHlwZW9mIHYgPT09ICdudW1iZXInICYmIFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlMuaW5jbHVkZXModik7XG5leHBvcnQgY29uc3QgQ0hVTktfVk9MVU1FID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkUgKiBXT1JMRF9IRUlHSFQ7XG5leHBvcnQgY29uc3QgQ0hVTktfQVJFQSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFO1xuXG5leHBvcnQgeyBNQVQsIGlzU29saWQsIGlzT3BhcXVlLCBNQVhfTUFUX0lEIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuZXhwb3J0IHR5cGUgeyBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IE1BVCwgaXNTb2xpZCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5cbmV4cG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgZmJtMixcbn0gZnJvbSAnLi9ub2lzZSc7XG5pbXBvcnQge1xuICBjbGFtcCwgbGVycCwgc21vb3Roc3RlcCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIHZhbHVlTm9pc2UzLCBmYm0yLCBmYm0zLFxufSBmcm9tICcuL25vaXNlJztcblxuLy8gLS0tLS0tLS0tLSB3b3JsZCB0eXBlcyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkUGFyYW1zIHtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEFSQU1TOiBXb3JsZFBhcmFtcyA9IHtcbiAgc2l6ZTogV09STERfU0laRSxcbiAgY2h1bmtTaXplOiBDSFVOS19TSVpFLFxuICB5TWluOiBZX01JTixcbiAgeU1heDogWV9NQVgsXG4gIHNlYUxldmVsOiBTRUFfTEVWRUwsXG4gIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbENodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAga2V5OiBzdHJpbmc7XG4gIC8qKiB4ICsgeiozMiArICh5LVlfTUlOKSoxMDI0ICovXG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3Agc29saWQgeSwgZW5jb2RlZCBhcyAoeSAtIFlfTUlOKSwgMC4uMTI3OyAwIG1lYW5zIG5vIHNvbGlkLiAqL1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICAvKiogdG9wIG1hdGVyaWFsIHBlciBjb2x1bW4uICovXG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG4gIGRpcnR5OiBib29sZWFuO1xuICBnZW5lcmF0ZWRBdDogbnVtYmVyO1xufVxuXG4vLyBOYXR1cmFsIGFzc2V0cyBhcmUgdGhlIHByb2plY3QncyBTdHlsIChgbmF0X2ApIHBpcGVsaW5lIChBUy0wMDEgdjIpLCBub3Rcbi8vIE5veGVsIGFyY2hpdGVjdHVyZS4gTm94ZWwgcmVtYWlucyB0aGUgaHVtYW4tbWFkZSBraXQvd2F5c3RvbmUvbWFya2VyIHN5c3RlbS5cbi8vIFJldGlyZWQgb25seSBhcyB3b3JsZCBjb250ZW50LiBUaGUgbmFtZXMgcmVtYWluIGluIHRoZSBzZXJpYWxpemVkIHR5cGUgc29cbi8vIG9sZCBzbmFwc2hvdHMgYW5kIGFjY2VwdGVkIGhhcnZlc3Qgam91cm5hbHMgY2FuIGJlIG1pZ3JhdGVkIHdpdGhvdXQgcmVqZWN0aW5nXG4vLyBvdGhlcndpc2UgdmFsaWQgc2F2ZXMuIEdlbmVyYXRpb24sIGNvbGxpc2lvbiBhbmQgaW5zcGVjdGlvbiBuZXZlciB1c2UgdGhlbS5cbmV4cG9ydCBjb25zdCBSRVRJUkVEX1NUT05FX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuXSk7XG5leHBvcnQgY29uc3QgaXNSZXRpcmVkU3RvbmVLaW5kID0gKGtpbmQ6IEVudGl0eUtpbmQpOiBib29sZWFuID0+IFJFVElSRURfU1RPTkVfS0lORFMuaGFzKGtpbmQpO1xuZXhwb3J0IHR5cGUgQWN0aXZlRW50aXR5S2luZCA9IEV4Y2x1ZGU8RW50aXR5S2luZCxcbiAgJ3N0eWxfcm9ja19zbWFsbCcgfCAnc3R5bF9yb2NrX21lZGl1bScgfCAnc3R5bF9yb2NrX2xhcmdlJz47XG5cbmZ1bmN0aW9uIGxpdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogRW50aXR5IHwgbnVsbCB7XG4gIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIHJldHVybiAhZW50aXR5IHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpID8gbnVsbCA6IGVudGl0eTtcbn1cblxuZXhwb3J0IHR5cGUgRW50aXR5S2luZCA9XG4gIHwgJ3N0eWxfdHJlZV9zcGlyZSdcbiAgfCAnc3R5bF90cmVlX3RhYmxlJ1xuICB8ICdzdHlsX3RyZWVfY2x1c3RlcidcbiAgfCAnc3R5bF90cmVlX2Jsb3Nzb20nXG4gIHwgJ3N0eWxfc2hydWInXG4gIHwgJ3N0eWxfcm9ja19zbWFsbCdcbiAgfCAnc3R5bF9yb2NrX21lZGl1bSdcbiAgfCAnc3R5bF9yb2NrX2xhcmdlJ1xuICB8ICdzdHlsX29yZSdcbiAgfCAnc3R5bF9jYWlybidcbiAgfCAnd2F5c3RvbmUnXG4gIHwgJ21hcmtlcic7XG5cbmV4cG9ydCB0eXBlIFJlc291cmNlVHlwZSA9ICd3b29kJyB8ICdzdG9uZScgfCAnb3JlJyB8ICdmaWJlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW50aXR5IHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgY2h1bms6IHN0cmluZztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHNjYWxlOiBudW1iZXI7XG4gIHZhcmlhbnQ6IG51bWJlcjtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIHJlbWFpbmluZzogbnVtYmVyO1xuICB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcjtcbiAgLyoqIFRydWUgb25jZSB0aGUgZW50aXR5IGlzIGZ1bGx5IGRlcGxldGVkLiAqL1xuICBoYXJ2ZXN0ZWQ6IGJvb2xlYW47XG4gIC8qKiBUcnVlIGFmdGVyIHRoZSBmaXJzdCBzdWNjZXNzZnVsIGhhcnZlc3QsIGV2ZW4gaWYgeWllbGQgcmVtYWlucy4gKi9cbiAgaGFydmVzdGVkT25jZT86IGJvb2xlYW47XG4gIHByb3Zpc2lvbmFsOiBib29sZWFuO1xuICBhdXRob3JlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3hlbFNpdGUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWdpb25JbmZvIHtcbiAgaWQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdHlwZTogJ3BsYWluJyB8ICdmb3Jlc3QnIHwgJ2hpbGxzJyB8ICdoaWdobGFuZCcgfCAnd2F0ZXInIHwgJ3JpZGdlJztcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgcng6IG51bWJlcjtcbiAgcno6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFN0YXRzIHtcbiAgY2h1bmtzR2VuZXJhdGVkOiBudW1iZXI7XG4gIGNodW5rc0V2aWN0ZWQ6IG51bWJlcjtcbiAgdm94ZWxzRmlsbGVkOiBudW1iZXI7XG4gIGdlbmVyYXRpb25NczogbnVtYmVyO1xuICBlbnRpdGllczogbnVtYmVyO1xuICB0cmVlczogbnVtYmVyO1xuICBwaW5rVHJlZXM6IG51bWJlcjtcbiAgcGlua092ZXJmbG93OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGQge1xuICBzZWVkOiBudW1iZXI7XG4gIHBhcmFtczogV29ybGRQYXJhbXM7XG4gIGNodW5rczogTWFwPHN0cmluZywgVm94ZWxDaHVuaz47XG4gIGVudGl0aWVzOiBNYXA8c3RyaW5nLCBFbnRpdHk+O1xuICBlbnRpdHlDaHVua3M6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPjtcbiAgLyoqIENodW5rcyB3aG9zZSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZW50aXR5IHN0YXRlIGhhcyBiZWVuIGNoYW5nZWQuICovXG4gIGVudGl0eUNoYW5nZXM6IFNldDxzdHJpbmc+O1xuICAvKiogVG9tYnN0b25lcyBmb3IgcmVtb3ZlZCBkZXRlcm1pbmlzdGljIG5hdHVyYWwgZW50aXRpZXMuICovXG4gIGVudGl0eVJlbW92YWxzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIEF1dGhvcml0YXRpdmUgYnVpbHQgc3RydWN0dXJlcyAoaG91c2UsIHBhdGgsIHRlcnJhY2VzLCBjcm9wcykuICovXG4gIHN0cnVjdHVyZXM6IE1hcDxzdHJpbmcsIFN0cnVjdHVyZT47XG4gIHNpdGVzOiBOb3hlbFNpdGVbXTtcbiAgcmVnaW9uczogUmVnaW9uSW5mb1tdO1xuICAvKiogY2h1bmsga2V5IC0+IGxvY2FsIHZveGVsIGluZGV4IC0+IG1hdGVyaWFsLiBEdXJhYmxlLCBjb21wYWN0IGVkaXRzLiAqL1xuICBlZGl0czogTWFwPHN0cmluZywgTWFwPG51bWJlciwgbnVtYmVyPj47XG4gIC8qKiBHbG9iYWwgbG9jYWwtcGxheWVyIGNhcnJpZWQgYmFnOyBib3VuZGVkIGluIHNjaGVtYSAzLCBsZWdhY3kgaW4gMS8yLiAqL1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQcmVzZW50IG9ubHkgYWZ0ZXIgc2NoZW1hLTMgZ2VuZXNpcy9yZXN0b3JhdGlvbi4gKi9cbiAgbGlmZT86IExpZmVTdGF0ZTtcbiAgLyoqIE0wMDYgbGl2aW5nIGhvbWVzdGVhZDsgcHJlc2VudCBvbmNlIGZvdW5kZWQgKHNjaGVtYSAzIG9ubHkpLiAqL1xuICBob21lc3RlYWQ/OiBIb21lc3RlYWRTdGF0ZTtcbiAgZGlydHk6IFNldDxzdHJpbmc+O1xuICBzdGF0czogV29ybGRTdGF0cztcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKlxuICAgKiBNb25vdG9uaWMgcmV2aXNpb24gb2YgYXV0aG9yaXRhdGl2ZSBzdGF0ZSAodm94ZWxzIGFuZCBlbnRpdGllcykuIERlcml2ZWRcbiAgICogY2FjaGVzIGtleWVkIG9uIHRoaXMgdmFsdWUgYXJlIGRpc2NhcmRlZCBhZnRlciBhbiBlZGl0OyBtZXNoL25hdmlnYXRpb25cbiAgICogcmV2aXNpb25zIGFyZSBzZXBhcmF0ZSBiZWNhdXNlIHRoZXkgYXJlIGRlcml2ZWQsIG5vdCB3b3JsZCBzdGF0ZS5cbiAgICovXG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBjaHVua0tleSA9IChjeDogbnVtYmVyLCBjejogbnVtYmVyKSA9PiBgJHtjeH0sJHtjen1gO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWCA9IChjeDogbnVtYmVyKSA9PiBjeCAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWiA9IChjejogbnVtYmVyKSA9PiBjeiAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGxvY2FsSW5kZXggPSAobHg6IG51bWJlciwgeUluZGV4OiBudW1iZXIsIGx6OiBudW1iZXIpID0+XG4gIGx4ICsgbHogKiBDSFVOS19TSVpFICsgeUluZGV4ICogQ0hVTktfQVJFQTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtYID0gKHg6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWiA9ICh6OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFggPSAoeDogbnVtYmVyKSA9PiB4IC0gKHdvcmxkVG9DaHVua1goeCkgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWiA9ICh6OiBudW1iZXIpID0+IHogLSAod29ybGRUb0NodW5rWih6KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB5VG9JbmRleCA9ICh5OiBudW1iZXIpID0+IHkgLSBZX01JTjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGlmICghaXNTdXBwb3J0ZWRHZW5lcmF0b3IoZ2VuZXJhdG9yVmVyc2lvbikpIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24gJHtnZW5lcmF0b3JWZXJzaW9ufWApO1xuICByZXR1cm4ge1xuICAgIHNlZWQsXG4gICAgcGFyYW1zOiB7IC4uLkRFRkFVTFRfUEFSQU1TLCBnZW5lcmF0b3JWZXJzaW9uIH0sXG4gICAgY2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXRpZXM6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaGFuZ2VzOiBuZXcgU2V0KCksXG4gICAgZW50aXR5UmVtb3ZhbHM6IG5ldyBTZXQoKSxcbiAgICBzdHJ1Y3R1cmVzOiBuZXcgTWFwKCksXG4gICAgc2l0ZXM6IFtdLFxuICAgIHJlZ2lvbnM6IFJFR0lPTlMsXG4gICAgZWRpdHM6IG5ldyBNYXAoKSxcbiAgICBpbnZlbnRvcnk6IHt9LFxuICAgIGRpcnR5OiBuZXcgU2V0KCksXG4gICAgc3RhdHM6IHtcbiAgICAgIGNodW5rc0dlbmVyYXRlZDogMCwgY2h1bmtzRXZpY3RlZDogMCwgdm94ZWxzRmlsbGVkOiAwLCBnZW5lcmF0aW9uTXM6IDAsXG4gICAgICBlbnRpdGllczogMCwgdHJlZXM6IDAsIHBpbmtUcmVlczogMCwgcGlua092ZXJmbG93OiAwLFxuICAgIH0sXG4gICAgYXV0aG9yZWRQbGFjZWQ6IGZhbHNlLFxuICAgIHJldmlzaW9uOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVXb3JsZChzZWVkID0gMTMzNywgaW5pdGlhbFJhZGl1cyA9IDAsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkLCBnZW5lcmF0b3JWZXJzaW9uKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNOT1cpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBNQVQuR1JBVkVMO1xuICByZXR1cm4gTUFULlNUT05FO1xufVxuXG5mdW5jdGlvbiBvcmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgY2x1c3RlciA9IGZibTIoeCAvIDU1LCB6IC8gNTUsIHNlZWQgKyAxMzAsIDIpO1xuICBpZiAoY2x1c3RlciA8IDAuNTcpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgbiA9IHZhbHVlTm9pc2UzKHggKiAwLjA5LCB5ICogMC4xMywgeiAqIDAuMDksIHNlZWQgKyAxMzEpO1xuICBjb25zdCBuMiA9IHZhbHVlTm9pc2UzKHggKiAwLjIyICsgNSwgeSAqIDAuMzEsIHogKiAwLjIyIC0gMywgc2VlZCArIDEzMik7XG4gIHJldHVybiBuID4gMC43MCAmJiBuMiA+IDAuNTA7XG59XG5cbmZ1bmN0aW9uIGNhdmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGZibTMoeCAqIDAuMDc1LCB5ICogMC4xMSwgeiAqIDAuMDc1LCBzZWVkICsgMTQwLCAyKSA+IDAuNzI7XG59XG5cbmZ1bmN0aW9uIG92ZXJoYW5nQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWx1ZU5vaXNlMyh4ICogMC4xOCwgeSAqIDAuMjIsIHogKiAwLjE4LCBzZWVkICsgMTQxKSA+IDAuNjI7XG59XG5cbi8vIC0tLS0tLS0tLS0gdmVyc2lvbmVkIGdlbmVyYXRvciBkaXNwYXRjaCAtLS0tLS0tLS0tXG5jb25zdCB2MkNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRlcnJhaW5WMj4oKTtcbmNvbnN0IGh5ZHJvQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSHlkcm9sb2d5PigpO1xuXG4vKiogRGV0ZXJtaW5pc3RpYyBoeWRyb2xvZ3kgbmV0d29yayBmb3IgYSBzZWVkIGFuZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoeWRyb2xvZ3lGb3Ioc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIpOiBIeWRyb2xvZ3kge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuaHlkcm9sb2d5O1xuICBjb25zdCBrZXkgPSBgJHtzZWVkfToke3ZlcnNpb259YDtcbiAgbGV0IGh5ZHJvID0gaHlkcm9DYWNoZS5nZXQoa2V5KTtcbiAgaWYgKCFoeWRybykge1xuICAgIGh5ZHJvID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb24sIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGh5ZHJvQ2FjaGUuc2V0KGtleSwgaHlkcm8pO1xuICB9XG4gIHJldHVybiBoeWRybztcbn1cblxuLyoqIEBpbnRlcm5hbCBUaGUgdjIgZ2VuZXJhdG9yIGZvciBhIHNlZWQgKGNhY2hlZDsgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCkuICovXG5leHBvcnQgZnVuY3Rpb24gdGVycmFpblYyKHNlZWQ6IG51bWJlcik6IFRlcnJhaW5WMiB7XG4gIGxldCBnZW4gPSB2MkNhY2hlLmdldChzZWVkKTtcbiAgaWYgKCFnZW4pIHtcbiAgICBjb25zdCBoeWRyb2xvZ3kgPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbjogR0VORVJBVE9SX1YyLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBnZW4gPSBuZXcgVGVycmFpblYyKHNlZWQsIHN1cmZhY2VIZWlnaHRBdCwgaHlkcm9sb2d5KTtcbiAgICB2MkNhY2hlLnNldChzZWVkLCBnZW4pO1xuICB9XG4gIHJldHVybiBnZW47XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCBoZWlnaHQgKHRvcCBzb2xpZCArIDEpIGZvciBhbnkgc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkuaGVpZ2h0KHgsIHopIDogc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgd2F0ZXIgc3VyZmFjZTogd2F0ZXIgZmlsbHMgY2VsbHMgW2hlaWdodCwgbGV2ZWwpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VXYXRlckxldmVsQXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmNvbHVtbih4LCB6KS5sZXZlbDtcbiAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgOiBoO1xufVxuXG5mdW5jdGlvbiB2ZXJzaW9uZWRTbG9wZShzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogKyAxKSksXG4gICk7XG59XG5cbi8qKiBCYXNlIHRvcCBtYXRlcmlhbCBmb3IgYW55IGdlbmVyYXRvciB2ZXJzaW9uIChtYWNybyBMT0QsIGVudGl0eSBwbGFjZW1lbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbEZvcihcbiAgc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGdlbiA9IHRlcnJhaW5WMihzZWVkKTtcbiAgICByZXR1cm4gZ2VuLnRvcE1hdGVyaWFsKHgsIHosIGdlbi5jb2x1bW4oeCwgeiksIHNsb3BlLFxuICAgICAgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoaCwgc3MsIG5lYXJXYXRlcikpO1xuICB9XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB5OiBudW1iZXI7XG4gIHRvcDogTWF0SWQ7XG4gIHNsb3BlOiBudW1iZXI7XG59XG5cbi8qKiBCYXNlIHN1cmZhY2Ugc2FtcGxlIGZvciBtYWNybyBMT0QuIERvZXMgbm90IGluY2x1ZGUgdm94ZWwgZWRpdHMvb3ZlcmhhbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZVN1cmZhY2Uoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFN1cmZhY2VTYW1wbGUge1xuICBjb25zdCB5ID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICBjb25zdCBzbG9wZSA9IHNsb3BlQXQoc2VlZCwgeCwgeiwgeSk7XG4gIHJldHVybiB7IHksIHRvcDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCB5LCBzbG9wZSksIHNsb3BlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2h1bmsgZ2VuZXJhdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICByZXR1cm4gZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KGN4LCBjeikpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgYmFzZSA9IGdlbmVyYXRlQmFzZUNodW5rKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjeCwgY3opO1xuICByZXR1cm4gaW5zdGFsbEJhc2VDaHVuayh3b3JsZCwgYmFzZSwgcGVyZm9ybWFuY2Uubm93KCkgLSB0MCk7XG59XG5cbi8qKlxuICogQmFzZSBnZW5lcmF0ZWQgY29udGVudHMgb2YgYSBjaHVuayBiZWZvcmUgZHVyYWJsZSBlZGl0cy4gQSBwdXJlIGZ1bmN0aW9uIG9mXG4gKiAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24sIGN4LCBjeik6IHNhZmUgdG8gY29tcHV0ZSBpbiBhIFdlYiBXb3JrZXIsIGFuZCB0aGVcbiAqIGJ5dGVzIGFyZSBpZGVudGljYWwgd2hlcmV2ZXIgaXQgcnVucy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBCYXNlQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBzZWVkOiBudW1iZXI7XG4gIHZlcnNpb246IG51bWJlcjtcbiAgZGF0YTogVWludDhBcnJheTtcbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQmFzZUNodW5rKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQmFzZUNodW5rIHtcbiAgY29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KENIVU5LX1ZPTFVNRSk7XG4gIGNvbnN0IGhlaWdodHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3QgdG9wTWF0ZXJpYWxzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBjb25zdCB2MiA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpIDogbnVsbDtcblxuICAvLyBQYWRkZWQgaGVpZ2h0IGNhY2hlOiBhIHRocmVlLWNlbGwgYm9yZGVyIGNvdmVycyBzbG9wZSwgYmVhY2ggYW5kIGxlZGdlcy5cbiAgY29uc3QgUCA9IDM7XG4gIGNvbnN0IFBXID0gQ0hVTktfU0laRSArIFAgKiAyO1xuICBjb25zdCBiYXNlSCA9IG5ldyBJbnQxNkFycmF5KFBXICogUFcpO1xuICBjb25zdCB2MkNvbHM6IFYyQ29sdW1uW10gfCBudWxsID0gdjIgPyBuZXcgQXJyYXkoQ0hVTktfQVJFQSkgOiBudWxsO1xuICBmb3IgKGxldCBweiA9IDA7IHB6IDwgUFc7IHB6KyspIHtcbiAgICBmb3IgKGxldCBweCA9IDA7IHB4IDwgUFc7IHB4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBweCAtIFAsIHd6ID0gb3ogKyBweiAtIFA7XG4gICAgICBpZiAodjIpIHtcbiAgICAgICAgY29uc3QgY29sID0gdjIuY29sdW1uKHd4LCB3eik7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBjb2wuaDtcbiAgICAgICAgY29uc3QgbHggPSBweCAtIFAsIGx6ID0gcHogLSBQO1xuICAgICAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHYyQ29scyFbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY29sO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB3eCwgd3opO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB2MkNvbCA9IHYyQ29scyA/IHYyQ29sc1tseiAqIENIVU5LX1NJWkUgKyBseF0gOiBudWxsO1xuICAgICAgY29uc3QgdG9wID0gdjIgJiYgdjJDb2xcbiAgICAgICAgPyB2Mi50b3BNYXRlcmlhbCh3eCwgd3osIHYyQ29sLCBzbG9wZSwgKGhoLCBzcykgPT4gdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGhoLCBzcywgbmVhcldhdGVyKSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHRoZSBjb2x1bW4nc1xuICAgICAgLy8gd2F0ZXIgbGV2ZWwgKHNlYSBsZXZlbCBpbiB2MTsgdGhlIGh5ZHJvbG9naWNhbCBsZXZlbCBpbiB2MikuXG4gICAgICBjb25zdCB3YXRlckxldmVsID0gdjJDb2wgPyBNYXRoLm1pbihZX01BWCwgdjJDb2wubGV2ZWwpIDogU0VBX0xFVkVMO1xuICAgICAgaWYgKGggPCB3YXRlckxldmVsKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCB3YXRlckxldmVsOyB5KyspIHtcbiAgICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopO1xuICAgICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5XQVRFUjtcbiAgICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b3BTb2xpZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5tYXgoWV9NSU4sIGggLSAxKSk7XG4gICAgICBoZWlnaHRzW2NvbF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tjb2xdID0gdG9wO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb3RydWRpbmcgbGVkZ2VzOiBvbmUgb3IgdHdvIHN0b25lIGJsb2NrcyBleHRlbmQgZnJvbSBhIGhpZ2ggY29sdW1uIG92ZXJcbiAgLy8gYSBsb3dlciBuZWlnaGJvdXIuIFRoZXkgY3JlYXRlIHJlYWRhYmxlIG92ZXJoYW5ncyB3aXRob3V0IGEgZnVsbCBjYXZlIHBhc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBpZiAoc2xvcGUgPCAyKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRpcnM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1stMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWzAsIDFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2YgZGlycykge1xuICAgICAgICBjb25zdCBueCA9IGx4ICsgZHgsIG56ID0gbHogKyBkejtcbiAgICAgICAgaWYgKG54IDwgMCB8fCBueiA8IDAgfHwgbnggPj0gQ0hVTktfU0laRSB8fCBueiA+PSBDSFVOS19TSVpFKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbmggPSBiYXNlSFsobnogKyBQKSAqIFBXICsgKG54ICsgUCldO1xuICAgICAgICBpZiAoaCAtIG5oIDwgMikgY29udGludWU7XG4gICAgICAgIGlmIChoYXNoM2kobHgsIGx6LCBkeCAqIDMgKyBkeiAqIDcsIHNlZWQgKyAxNTApIDwgMC41NSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHkgPSBoIC0gMjtcbiAgICAgICAgaWYgKHkgPCBZX01JTiB8fCB5ID49IGgpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KG54LCB5VG9JbmRleCh5KSwgbnopO1xuICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtpZHhdID0gTUFULlNUT05FO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmVjb21wdXRlIHRoZSBjb2x1bW4gY2FjaGUgYWZ0ZXIgbGVkZ2VzL2NhdmVzLiBUaGUgZXhwb3NlZCB0b3AgbWF0ZXJpYWxcbiAgLy8gbXVzdCBjb21lIGZyb20gdGhlIGFjdHVhbCB0b3Agc29saWQgdm94ZWwsIG5vdCB0aGUgcHJlLWNhcnZlIGd1ZXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgIGxldCB0b3BNYXQ6IG51bWJlciA9IHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgY29uc3QgbSA9IGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICAgIGhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG9wTWF0O1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGN4LCBjeiwgc2VlZCwgdmVyc2lvbiwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIgfTtcbn1cblxuLyoqXG4gKiBJbnN0YWxsIGJhc2UgY29udGVudHMgYXMgYSByZXNpZGVudCBjaHVuazogYXBwbHkgZHVyYWJsZSBlZGl0cywgdXBkYXRlXG4gKiBzdGF0cywgYW5kIHJ1biBkZXRlcm1pbmlzdGljIGVudGl0eSBnZW5lcmF0aW9uLiBNYWluLXRocmVhZCBvbmx5OyB0aGlzIGlzXG4gKiB0aGUgc2luZ2xlIHdyaXRlciBvZiBXb3JsZC4gUmV0dXJucyB0aGUgYWxyZWFkeS1yZXNpZGVudCBjaHVuayBpZiBvbmUgZXhpc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbEJhc2VDaHVuayh3b3JsZDogV29ybGQsIGJhc2U6IEJhc2VDaHVuaywgZ2VuZXJhdGlvbk1zID0gMCk6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGJhc2Uuc2VlZCAhPT0gd29ybGQuc2VlZCB8fCBiYXNlLnZlcnNpb24gIT09IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdiYXNlIGNodW5rIGJlbG9uZ3MgdG8gYSBkaWZmZXJlbnQgd29ybGQgY29uZmlndXJhdGlvbicpO1xuICB9XG4gIGNvbnN0IHsgY3gsIGN6LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9ID0gYmFzZTtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgY29uc3QgY2h1bms6IFZveGVsQ2h1bmsgPSB7XG4gICAgY3gsIGN6LCBrZXksIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyLFxuICAgIGRpcnR5OiB0cnVlLFxuICAgIGdlbmVyYXRlZEF0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgfTtcblxuICAvLyBBcHBseSBkdXJhYmxlIGVkaXRzIGFmdGVyIGJhc2UgZ2VuZXJhdGlvbi5cbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgaWYgKGVkaXRzKSB7XG4gICAgZm9yIChjb25zdCBbaWR4LCBtXSBvZiBlZGl0cykge1xuICAgICAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgICB9XG4gICAgLy8gUmVjb21wdXRlIHRoZSBjYWNoZSBmb3IgZWRpdGVkIGNodW5rcy5cbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCBseCwgbHopO1xuICAgIH1cbiAgfVxuICAvLyBOb24tYWlyIGNvdW50cyBhcmUgZGVyaXZlZCByZW5kZXJlciBzdGF0aXN0aWNzLCBub3QgZHVyYWJsZSB3b3JsZCBzdGF0ZS5cbiAgLy8gRWRpdGVkIGJhc2UgYWlyIG1heSBiZWNvbWUgc29saWQgKGFuZCB2aWNlIHZlcnNhKSBkdXJpbmcgcmVzdG9yYXRpb24uXG4gIGxldCBlZGl0ZWROb25BaXIgPSAwO1xuICBmb3IgKGNvbnN0IG1hdGVyaWFsIG9mIGNodW5rLmRhdGEpIGlmIChtYXRlcmlhbCAhPT0gTUFULkFJUikgZWRpdGVkTm9uQWlyKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBlZGl0ZWROb25BaXIgLSBub25BaXI7XG5cbiAgd29ybGQuY2h1bmtzLnNldChrZXksIGNodW5rKTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBub25BaXI7XG4gIHdvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyArPSBnZW5lcmF0aW9uTXM7XG4gIHdvcmxkLmRpcnR5LmFkZChrZXkpO1xuXG4gIGdlbmVyYXRlRW50aXRpZXMod29ybGQsIGNodW5rKTtcbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vKiogQSBiYXNlLXRlcnJhaW4gY2FjaGUgc2hhcmVkIGJ5IGVkaXRlZCBhbmQgdW5lZGl0ZWQgcmVnZW5lcmF0aW9uLiBOYXR1cmFsXG4gKiBzY2VuZXJ5IG5ldmVyIGRlcGVuZHMgb24gbGF0ZXIgdm94ZWwgZWRpdHM7IHRoaXMgYWxzbyBsZXRzIGEgc25hcHNob3QgcmVzdG9yZVxuICogYSBoYXJ2ZXN0ZWQgY2h1bmsgd2l0aG91dCBtYXRlcmlhbGl6aW5nIHVucmVsYXRlZCBuZWlnaGJvdXJpbmcgY2h1bmtzLiAqL1xuY29uc3QgYmFzZUNvbHVtbkNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hcDxzdHJpbmcsIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0+PigpO1xuXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDb2x1bW5zIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5OyB9XG5cbi8qKiBCYXNlIChwcmUtY2FydmUsIHByZS1lZGl0KSBjb2x1bW4gaGVpZ2h0cy9tYXRlcmlhbHMgdXNlZCBmb3IgZW50aXR5IHBsYWNlbWVudC4gUHVyZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlQmFzZUNvbHVtbnMoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ29sdW1ucyB7XG4gIGNvbnN0IGNvbHVtbnMgPSB7IGhlaWdodHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpLCB0b3BNYXRlcmlhbHM6IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpIH07XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHgsIHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHopO1xuICAgICAgY29uc3Qgc2xvcGUgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IHZlcnNpb25lZFNsb3BlKHNlZWQsIHZlcnNpb24sIHgsIHosIGgpIDogc2xvcGVBdChzZWVkLCB4LCB6LCBoKTtcbiAgICAgIGNvbnN0IGluZGV4ID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLmhlaWdodHNbaW5kZXhdID0gY2xhbXAoaCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2luZGV4XSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gYmFzZVRvcE1hdGVyaWFsRm9yKHNlZWQsIHZlcnNpb24sIHgsIHosIGgsIHNsb3BlKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29sdW1ucztcbn1cblxuLyoqIFByb3ZpZGUgcHJlY29tcHV0ZWQgYmFzZSBjb2x1bW5zIChmb3IgZXhhbXBsZSBmcm9tIGEgd29ya2VyKSBiZWZvcmUgaW5zdGFsbGluZyBhIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlZWRCYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nLCBjb2x1bW5zOiBCYXNlQ29sdW1ucyk6IHZvaWQge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGlmICghY2FjaGUuaGFzKGtleSkpIGNhY2hlLnNldChrZXksIGNvbHVtbnMpO1xufVxuXG5mdW5jdGlvbiBiYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogQmFzZUNvbHVtbnMge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlLmdldChjaHVuay5rZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBjb2x1bW5zID0gY29tcHV0ZUJhc2VDb2x1bW5zKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLCBjaHVuay5jeCwgY2h1bmsuY3opO1xuICBjYWNoZS5zZXQoY2h1bmsua2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVyaXZlZCBjaGFuZ2UgdHJhY2tpbmcgKG5vdCBhdXRob3JpdGF0aXZlIHN0YXRlKSAtLS0tLS0tLS0tXG4vLyBSZW5kZXJlcnMgbmVlZCB0byBrbm93IHdoZW4gdGhlIGVkaXQgb3ZlcmxheSBjaGFuZ2VkIHdpdGhvdXQgd2Fsa2luZyBldmVyeVxuLy8gZWRpdCBlYWNoIGZyYW1lLiBUaGUgY291bnRlciBsaXZlcyBvdXRzaWRlIFdvcmxkIHNvIGl0IG5ldmVyIGVudGVycyBhXG4vLyBzbmFwc2hvdCBvciBjYW5vbmljYWwgaGFzaC5cbmNvbnN0IGVkaXRWZXJzaW9ucyA9IG5ldyBXZWFrTWFwPFdvcmxkLCBudW1iZXI+KCk7XG5cbi8qKiBNb25vdG9uaWMgY291bnQgb2YgZWRpdC1vdmVybGF5IGNoYW5nZXMgZm9yIHRoaXMgV29ybGQgb2JqZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVkaXRWZXJzaW9uKHdvcmxkOiBXb3JsZCk6IG51bWJlciB7XG4gIHJldHVybiBlZGl0VmVyc2lvbnMuZ2V0KHdvcmxkKSA/PyAwO1xufVxuXG4vKiogQ2FsbCBhZnRlciByZXBsYWNpbmcgb3IgYnVsay1jaGFuZ2luZyBgd29ybGQuZWRpdHNgIG91dHNpZGUgc2V0Vm94ZWwuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya0VkaXRzQ2hhbmdlZCh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZWRpdFZlcnNpb25zLnNldCh3b3JsZCwgZWRpdFZlcnNpb24od29ybGQpICsgMSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gbm9uLWdlbmVyYXRpbmcgcXVlcmllcyAtLS0tLS0tLS0tXG4vLyBNb3ZpbmcgcHJlc2VudGF0aW9uIChjaGFyYWN0ZXJzLCBhbmltYWxzLCBjYW1lcmEpIG11c3QgbmV2ZXIgdHJpZ2dlciBjaHVua1xuLy8gZ2VuZXJhdGlvbiBhcyBhIHNpZGUgZWZmZWN0IG9mIGFza2luZyBhYm91dCB0ZXJyYWluLiBUaGVzZSByZXR1cm4gbnVsbCB3aGVuXG4vLyB0aGUgY29sdW1uJ3MgY2h1bmsgaXMgbm90IHJlc2lkZW50LlxuXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRDaHVua0F0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBudWxsO1xuICByZXR1cm4gd29ybGQuY2h1bmtzLmdldChjaHVua0tleSh3b3JsZFRvQ2h1bmtYKHgpLCB3b3JsZFRvQ2h1bmtaKHopKSkgPz8gbnVsbDtcbn1cblxuLyoqIExpa2Ugc3VyZmFjZUF0LCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50U3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgfCBudWxsIHtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuLyoqIExpa2UgZ2V0Vm94ZWwsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRWb3hlbEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHwgbnVsbCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmljdENodW5rKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCF3b3JsZC5jaHVua3MuaGFzKGtleSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuY2h1bmtzLmRlbGV0ZShrZXkpO1xuICB3b3JsZC5zdGF0cy5jaHVua3NFdmljdGVkKys7XG4gIC8vIENodW5rIGJ5dGVzIGFuZCBjb2x1bW4gY2FjaGVzIGFyZSByZWdlbmVyYXRlZCBvbiBkZW1hbmQuIEVudGl0aWVzIHJlbWFpblxuICAvLyBhdXRob3JpdGF0aXZlOiBldmljdGlvbiBtdXN0IG5vdCBmb3JnZXQgdGhlaXIgcGVyc2lzdGVudCBzdGF0ZS5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcXVlcmllcyAvIGVkaXRzIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBnZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG06IE1hdElkKTogYm9vbGVhbiB7XG4gIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBZX01BWCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBpZHggPSBsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgY29uc3QgcHJldmlvdXNFZGl0ID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rS2V5KGN4LCBjeikpPy5nZXQoaWR4KTtcbiAgLy8gQSBjaHVuayBldmljdGVkIGFmdGVyIGFuIGVhcmxpZXIgZWRpdCBjYW4gcmVnZW5lcmF0ZSB3aXRoIHRoYXQgZHVyYWJsZVxuICAvLyBtYXRlcmlhbCBhbHJlYWR5IGFwcGxpZWQuIERyb3BwaW5nIHRoZSBlZGl0IGhlcmUgd291bGQgbWFrZSBpdCBkaXNhcHBlYXJcbiAgLy8gb24gdGhlIG5leHQgZXZpY3Rpb24vcmVzdG9yYXRpb24sIGV2ZW4gdGhvdWdoIHRoZSBjdXJyZW50IHdyaXRlIG5vLW9wcy5cbiAgaWYgKHByZXZpb3VzRWRpdCA9PT0gbSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gZmFsc2U7XG4gIGxldCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChjaHVuay5rZXkpO1xuICBpZiAoIWVkaXRzKSB7IGVkaXRzID0gbmV3IE1hcCgpOyB3b3JsZC5lZGl0cy5zZXQoY2h1bmsua2V5LCBlZGl0cyk7IH1cbiAgLy8gQW4gaWRlbXBvdGVudCB3cml0ZSBtdXN0IHN0aWxsIHJlc3RvcmUgYSBkdXJhYmxlIGRlbHRhIGRpc2NhcmRlZCBieSBhblxuICAvLyBvbGRlciBzbmFwc2hvdCBvciBkZWx0YSBkZWNvZGVyLiBJdCBpcyBub3QgYSBuZXcgYXV0aG9yaXRhdGl2ZSByZXZpc2lvbi5cbiAgaWYgKGNodW5rLmRhdGFbaWR4XSA9PT0gbSkge1xuICAgIGlmICghZWRpdHMuaGFzKGlkeCkpIGVkaXRzLnNldChpZHgsIG0pO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgbWFya0VkaXRzQ2hhbmdlZCh3b3JsZCk7XG4gIGNodW5rLmRpcnR5ID0gdHJ1ZTtcbiAgd29ybGQuZGlydHkuYWRkKGNodW5rLmtleSk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCB3b3JsZFRvTG9jYWxYKHgpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rOiBWb3hlbENodW5rLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogdm9pZCB7XG4gIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICBpZiAoaXNTb2xpZChjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildKSkgeyB0b3BTb2xpZCA9IHk7IGJyZWFrOyB9XG4gIH1cbiAgY2h1bmsuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgY29uc3QgdG0gPSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICBpZiAodG9wU29saWQgPj0gWV9NSU4pIHtcbiAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh0b3BTb2xpZCksIGx6KV07XG4gICAgaWYgKG0gIT09IE1BVC5XQVRFUikgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IG07XG4gIH0gZWxzZSB7XG4gICAgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRtO1xuICB9XG59XG5cbi8qKlxuICogVGhlIHkgY29vcmRpbmF0ZSBvZiB0aGUgZXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uIGF0IHgvei5cbiAqIEEgc29saWQgdm94ZWwgYXQgeSBvY2N1cGllcyBbeSwgeSsxKSwgc28gdGhlIHdhbGthYmxlIHN1cmZhY2UgaXMgdG9wU29saWQrMS5cbiAqIFRoaXMgaXMgYSBkZXJpdmVkIHF1ZXJ5OyB0aGUgYXV0aG9yaXRhdGl2ZSBzdGF0ZSByZW1haW5zIHRoZSB2b3hlbCB2b2x1bWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBZX01JTjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBZX01JTjtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsudG9wTWF0ZXJpYWxzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWlnaHRBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiA8IEdFTkVSQVRPUl9WMikge1xuICAgIGNvbnN0IGggPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICAgIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIC0gaCA6IDA7XG4gIH1cbiAgcmV0dXJuIHdhdGVyU3VyZmFjZUF0KHdvcmxkLCB4LCB6KSAtIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKlxuICogVG9wIG9mIHRoZSB3YXRlciBjb2x1bW4gc3RhbmRpbmcgb24gdGhlIHNvbGlkIHN1cmZhY2UgKGVxdWFsIHRvIHRoZSBzdXJmYWNlXG4gKiB3aGVuIGRyeSkuIFJlYWRzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVscywgc28gZWRpdHMgYW5kIGR1ZyBwaXRzIGFyZSBleGFjdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyU3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIHdoaWxlICh5IDwgWV9NQVggJiYgZ2V0Vm94ZWwod29ybGQsIHgsIHksIHopID09PSBNQVQuV0FURVIpIHkrKztcbiAgcmV0dXJuIHk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZW50aXRpZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gYWRkRW50aXR5KHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5oYXMoZS5pZCkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIHJldHVybjtcbiAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGUpO1xuICBsZXQgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgbGlzdCk7IH1cbiAgbGlzdC5wdXNoKGUuaWQpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIC8vIEdlbmVyYXRpb24gaXMgZGV0ZXJtaW5pc3RpYyBhbmQgYWR2YW5jZXMgbm8gcGxheWVyLWNvbW1hbmQgcHJlY29uZGl0aW9uLlxuICAvLyBBdXRob3JlZCBzY2FmZm9sZGluZyBtYXkgdHJhbnNpZW50bHkgY2hhbmdlIGl0OyB0aGUgc25hcHNob3QgcmVzdG9yZXMgdGhlXG4gIC8vIHNhdmVkIHJldmlzaW9uIGFmdGVyIHBsYWNpbmcgdGhhdCBzY2FmZm9sZGluZy5cbn1cblxuLyoqXG4gKiBSZW1vdmUgYW4gZW50aXR5IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd29ybGQuIFVzZWQgd2hlbiBhIHNpdGUgaXMgY2xlYXJlZDpcbiAqIHRoZSByZXNvdXJjZSB5aWVsZCBpcyBhY2NvdW50ZWQgZm9yIGJ5IHRoZSBjYWxsZXIsIGFuZCB0aGUgZW50aXR5IG11c3Qgc3RvcFxuICogZXhpc3RpbmcgZm9yIGNvbGxpc2lvbiwgb2JzdHJ1Y3Rpb24gYW5kIHBlcnNpc3RlbmNlLCBub3QganVzdCBiZSBoaWRkZW4gYnlcbiAqIHRoZSByZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICBjb25zdCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKGxpc3QpIHtcbiAgICBjb25zdCBpID0gbGlzdC5pbmRleE9mKGlkKTtcbiAgICBpZiAoaSA+PSAwKSBsaXN0LnNwbGljZShpLCAxKTtcbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChpZCk7XG4gIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUlkKGNodW5rOiBzdHJpbmcsIGk6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBgZToke2NodW5rfToke2l9YDtcbn1cblxuZnVuY3Rpb24gZm9yZXN0U2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgZWFzdCA9IE1hdGguZXhwKC0oKCh3eCAtIDIyMCkgLyAyNjApICoqIDIgKyAoKHd6ICsgMTEwKSAvIDIyMCkgKiogMikpO1xuICBjb25zdCBub3J0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDIwKSAvIDMwMCkgKiogMiArICgod3ogKyAzMDApIC8gMTkwKSAqKiAyKSk7XG4gIGNvbnN0IHdlc3QgPSBNYXRoLmV4cCgtKCgod3ggKyAzNDApIC8gMjAwKSAqKiAyICsgKCh3eiAtIDEyMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3Qgc291dGggPSBNYXRoLmV4cCgtKCgod3ggLSAxMjApIC8gMjQwKSAqKiAyICsgKCh3eiAtIDMzMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3QgbW9pc3R1cmUgPSBmYm0yKHd4IC8gMjYwLCB3eiAvIDI2MCwgc2VlZCArIDIwMSwgNCk7XG4gIGNvbnN0IHZhbGxleSA9IE1hdGguZXhwKC0oKHd4IC8gMTQwKSAqKiAyICsgKHd6IC8gMTA1KSAqKiAyKSk7XG4gIHJldHVybiBNYXRoLm1heChlYXN0LCBub3J0aCAqIDAuOTIsIHdlc3QgKiAwLjgwLCBzb3V0aCAqIDAuNzgpICogMC44MlxuICAgICsgbW9pc3R1cmUgKiAwLjM4IC0gMC4yMiAtIHZhbGxleSAqIDAuMzQ7XG59XG5cbmZ1bmN0aW9uIHJvY2tTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBtb3VudGFpbiA9IGZibTIod3ggLyAzMzAsIHd6IC8gMzMwLCBzZWVkICsgMjAyLCAzKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAxNDAsIHd6IC8gMTQwLCBzZWVkICsgMjAzLCAzKSAtIDEpO1xuICByZXR1cm4gbW91bnRhaW4gKiAwLjU1ICsgcmlkZ2UgKiAwLjQ1O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB2b2lkIHtcbiAgZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZCwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbn1cblxuLyoqIEBpbnRlcm5hbCBSZXBsYXlzIGRldGVybWluaXN0aWMgZ2VuZXJhdGlvbiBmb3Igc25hcHNob3QgZW50aXR5IGRlbHRhcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBpZiAod29ybGQuZW50aXR5Q2h1bmtzLmhhcyhrZXkpKSByZXR1cm47XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybjtcblxuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChoYXNoMmkoY2h1bmsuY3gsIGNodW5rLmN6LCB3b3JsZC5zZWVkICsgOTAwKSAqIDQyOTQ5NjcyOTYpID4+PiAwKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIGNvbnN0IGNvbHVtbnMgPSBiYXNlQ29sdW1ucyh3b3JsZCwgY2h1bmspO1xuICBsZXQgbiA9IDA7XG4gIGxldCBuYXR1cmFsVHJlZXMgPSAwO1xuICBsZXQgbmF0dXJhbFBpbmtUcmVlcyA9IDA7XG5cbiAgY29uc3QgbG9jYWxTdXJmYWNlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdICsgWV9NSU47XG4gIH07XG4gIGNvbnN0IGxvY2FsVG9wID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBNYXRJZCA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSBhcyBNYXRJZDtcbiAgfTtcbiAgY29uc3QgbG9jYWxTbG9wZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgcmV0dXJuIE1hdGgubWF4KFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggKyAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogKyAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICApO1xuICB9O1xuXG4gIC8vIEEgaml0dGVyZWQgOCBtIGxhdHRpY2UgZ2l2ZXMgY29oZXJlbnQgbWFzc2VzIGFuZCBhdm9pZHMgcGVyLWZyYW1lIHNjYXR0ZXIuXG4gIGZvciAobGV0IGd6ID0gMDsgZ3ogPCBDSFVOS19TSVpFOyBneiArPSA4KSB7XG4gICAgZm9yIChsZXQgZ3ggPSAwOyBneCA8IENIVU5LX1NJWkU7IGd4ICs9IDgpIHtcbiAgICAgIGNvbnN0IGx4ID0gY2xhbXAoTWF0aC5mbG9vcihneCArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IGx6ID0gY2xhbXAoTWF0aC5mbG9vcihneiArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgICAgaWYgKGggPD0gU0VBX0xFVkVMICsgMSkgY29udGludWU7XG4gICAgICBjb25zdCBzbG9wZSA9IGxvY2FsU2xvcGUobHgsIGx6KTtcbiAgICAgIGNvbnN0IHRvcCA9IGxvY2FsVG9wKGx4LCBseik7XG4gICAgICBpZiAodG9wID09PSBNQVQuV0FURVIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZm9yZXN0ID0gZm9yZXN0U2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvY2t5ID0gcm9ja1Njb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2xsID0gcm5kKCk7XG5cbiAgICAgIGNvbnN0IHRyZWVDaGFuY2UgPSBmb3Jlc3QgPiAwLjUwID8gMC43MiA6IGZvcmVzdCA+IDAuMzAgPyAwLjI1IDogMC4wNTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAyICYmIHJvbGwgPCB0cmVlQ2hhbmNlKSB7XG4gICAgICAgIC8vIFRoZSBjYXAgaXMgYSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZ2VuZXJhdGlvbiBwcm9wZXJ0eS4gSXQgY2Fubm90XG4gICAgICAgIC8vIGRlcGVuZCBvbiB3aGljaCBjaHVua3MgYSByZW5kZXJlciBsb2FkZWQgYmVmb3JlIHRoaXMgb25lLlxuICAgICAgICBsZXQga2luZDogRW50aXR5S2luZDtcbiAgICAgICAgbGV0IHZhcmlhbnQ6IG51bWJlcjtcbiAgICAgICAgY29uc3Qgc3BlY2llc1JvbGwgPSBybmQoKTtcbiAgICAgICAgaWYgKHNwZWNpZXNSb2xsIDwgMC4xMikge1xuICAgICAgICAgIGlmICgobmF0dXJhbFBpbmtUcmVlcyArIDEpID4gMC4yNSAqIChuYXR1cmFsVHJlZXMgKyAxKSkge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua092ZXJmbG93Kys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2Jsb3Nzb20nO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAyKTtcbiAgICAgICAgICAgIG5hdHVyYWxQaW5rVHJlZXMrKztcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNDApIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9zcGlyZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNzQpIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV90YWJsZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICB9XG4gICAgICAgIG5hdHVyYWxUcmVlcysrO1xuICAgICAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44OCArIHJuZCgpICogMC4yNCwgdmFyaWFudCxcbiAgICAgICAgICByZXNvdXJjZTogJ3dvb2QnLCByZW1haW5pbmc6IDEyLCB5aWVsZFBlckhhcnZlc3Q6IDQsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHJvY2t5ID4gMC40NiAmJiByb2xsIDwgMC4zOCkge1xuICAgICAgICAvLyBDb25zdW1lIHRoZSByZXRpcmVkIHN0b25lIGZvcm0ncyByYW5kb20gZHJhd3MgYW5kIGFsbG9jYXRlIGl0cyBvbGRcbiAgICAgICAgLy8gc2VxdWVuY2UgSUQsIGJ1dCBkbyBub3QgaW5zZXJ0IGFuIGVudGl0eS4gTGF0ZXIgbmF0dXJhbCBwbGFjZW1lbnRzXG4gICAgICAgIC8vIHRoZXJlZm9yZSByZW1haW4gYnl0ZS1mb3ItYnl0ZSBjb21wYXRpYmxlIHdpdGggcmVjb3JkZWQgc2F2ZXMuXG4gICAgICAgIGNvbnN0IHNpemVSb2xsID0gcm5kKCk7XG4gICAgICAgIGNvbnN0IGtpbmQ6IEVudGl0eUtpbmQgPSBzaXplUm9sbCA8IDAuNTUgPyAnc3R5bF9yb2NrX3NtYWxsJ1xuICAgICAgICAgIDogc2l6ZVJvbGwgPCAwLjkwID8gJ3N0eWxfcm9ja19tZWRpdW0nIDogJ3N0eWxfcm9ja19sYXJnZSc7XG4gICAgICAgIGNvbnN0IGlkID0gZW50aXR5SWQoY2h1bmsua2V5LCBuKyspO1xuICAgICAgICBjb25zdCByZWNvcmQgPSB7XG4gICAgICAgICAgaWQsIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByZXNvdXJjZTogJ3N0b25lJyBhcyBjb25zdCxcbiAgICAgICAgICByZW1haW5pbmc6IGtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gNCA6IGtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDggOiAxMixcbiAgICAgICAgICB5aWVsZFBlckhhcnZlc3Q6IDMsIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgIH07XG4gICAgICAgIC8vIE9ubHkgZW50aXRpZXMgdGhhdCBleGlzdGVkIGluIGFuIGFjY2VwdGVkIG9sZCBzYXZlIGdldCB0b21ic3RvbmVzLFxuICAgICAgICAvLyBkdXJpbmcgZXhwbGljaXQgbWlncmF0aW9uLiBPcmRpbmFyeSBnZW5lcmF0aW9uIG11c3QgcmVzdG9yZSBleGFjdGx5LlxuICAgICAgICBpZiAoaXNTdG9uZVJlcGxheSh3b3JsZCkpIGFkZEVudGl0eSh3b3JsZCwgcmVjb3JkKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuU1RPTkUgJiYgcm9ja3kgPiAwLjU4ICYmIHJvbGwgPCAwLjE4KSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfb3JlJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDIpLFxuICAgICAgICAgIHJlc291cmNlOiAnb3JlJywgcmVtYWluaW5nOiA4LCB5aWVsZFBlckhhcnZlc3Q6IDIsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDEgJiYgcm9sbCA8IDAuMzApIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9zaHJ1YicsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44ICsgcm5kKCkgKiAwLjQsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgICByZXNvdXJjZTogJ2ZpYmVyJywgcmVtYWluaW5nOiA0LCB5aWVsZFBlckhhcnZlc3Q6IDEsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkOiBXb3JsZCwga2luZDogRW50aXR5S2luZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgcm90OiBudW1iZXIsIHNjYWxlOiBudW1iZXIsIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsLCByZW1haW5pbmc6IG51bWJlciwgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmICh5IDw9IFNFQV9MRVZFTCkgcmV0dXJuO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgLy8gQSBoZXJvIGFzc2V0IG93bnMgaXRzIHNwb3Q6IGNsZWFyIGFueSBnZW5lcmF0ZWQgZW50aXR5IHRoYXQgd291bGQgb3ZlcmxhcFxuICAvLyBpdCwgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBpbmcgdGhlIGF1dGhvcmVkIGNvbXBvc2l0aW9uLlxuICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkgPz8gW107XG4gIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoa2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSByZXR1cm47XG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKGUgJiYgTWF0aC5oeXBvdChlLnggLSB4LCBlLnogLSB6KSA8IDIuNikge1xuICAgICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICAgIH1cbiAgfVxuICB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpKTtcbiAgLy8gQXV0aG9yZWQgY29tcG9zaXRpb24gaXMgZHVyYWJsZSBzdGF0ZTogaXQgY2FuIGNsZWFyIG92ZXJsYXBwaW5nIG5hdHVyYWxcbiAgLy8gZW50aXRpZXMsIHNvIHNhdmUgdGhlIGNvbXBsZXRlIGFmZmVjdGVkIGNodW5rIHJhdGhlciB0aGFuIG9ubHkgaXRzIGhlcm9lcy5cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcblxuICBjb25zdCBpZCA9IGBoZXJvOiR7a2luZH06JHtNYXRoLnJvdW5kKHgpfToke01hdGgucm91bmQoeil9YDtcbiAgY29uc3QgYmVmb3JlID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgY29uc3QgZW50aXR5OiBFbnRpdHkgPSB7XG4gICAgaWQsIGtpbmQsIGNodW5rOiBrZXksIHg6IHggKyAwLjUsIHksIHo6IHogKyAwLjUsXG4gICAgcm90LCBzY2FsZSwgdmFyaWFudCwgcmVzb3VyY2UsIHJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0LFxuICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogdHJ1ZSxcbiAgfTtcbiAgYWRkRW50aXR5KHdvcmxkLCBlbnRpdHkpO1xuICBpZiAod29ybGQuZW50aXRpZXMuc2l6ZSA+IGJlZm9yZSAmJiBraW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB7XG4gICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoa2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmF1dGhvcmVkUGxhY2VkKSByZXR1cm47XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gdHJ1ZTtcblxuICBjb25zdCBzaXRlczogQXJyYXk8eyBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7IHg6IG51bWJlcjsgejogbnVtYmVyOyByb3Q6IG51bWJlciB9PiA9IFtcbiAgICB7IGtpbmQ6ICd3YXlzdG9uZScsIHg6IC0xMCwgejogLTE0LCByb3Q6IDAgfSxcbiAgICB7IGtpbmQ6ICdtYXJrZXInLCB4OiAtMzIsIHo6IC04LCByb3Q6IE1hdGguUEkgLyAyIH0sXG4gIF07XG4gIGZvciAoY29uc3QgcyBvZiBzaXRlcykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoeSA8PSBTRUFfTEVWRUwpIGNvbnRpbnVlO1xuICAgIHdvcmxkLnNpdGVzLnB1c2goe1xuICAgICAgaWQ6IGBzaXRlOiR7cy5raW5kfWAsXG4gICAgICBraW5kOiBzLmtpbmQsXG4gICAgICB4OiBzLnggKyAwLjUsIHksIHo6IHMueiArIDAuNSxcbiAgICAgIHJvdDogcy5yb3QsXG4gICAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEEgaGVybyBncm92ZSBjb21wb3NlZCBpbiB0aGUgZGVmYXVsdCBjYW1lcmEncyB2aWV3IGRpcmVjdGlvbi4gVGhlc2UgYXJlXG4gIC8vIFN0eWwgbmF0dXJhbCBhc3NldHMgKEFTLTAwMSB2MiksIG5vdCBOb3hlbCBhcmNoaXRlY3R1cmU7IHRoZSBOb3hlbFxuICAvLyB3YXlzdG9uZS9tYXJrZXIgYWJvdmUgcmVtYWluIHRoZSBodW1hbi1tYWRlIGxhbmRtYXJrcy5cbiAgY29uc3QgZ3JvdmU6IEFycmF5PFtFbnRpdHlLaW5kLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0+ID0gW1xuICAgIFsnc3R5bF90cmVlX3NwaXJlJywgLTIyLCAtMjYsIDAsIDEuMDAsIDBdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTM0LCAtMTgsIDEsIDAuOTUsIE1hdGguUEkgLyAxMl0sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xNiwgLTM0LCAyLCAxLjAwLCBNYXRoLlBJIC8gNl0sXG4gICAgWydzdHlsX3RyZWVfYmxvc3NvbScsIC0yOCwgLTM4LCAwLCAwLjkwLCBNYXRoLlBJIC8gNF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtNDAsIC0zMCwgMiwgMS4wNSwgTWF0aC5QSSAvIDNdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTIsIC0yNCwgMCwgMC45MCwgTWF0aC5QSSAvIDIuNF0sXG4gIF07XG4gIGZvciAoY29uc3QgW2tpbmQsIHgsIHosIHZhcmlhbnQsIHNjYWxlLCByb3RdIG9mIGdyb3ZlKSB7XG4gICAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsIGtpbmQsIHgsIHosIHZhcmlhbnQsIHJvdCwgc2NhbGUsICd3b29kJywgMTIsIDQpO1xuICB9XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9yb2NrX21lZGl1bScsIC02LCAtMTAsIDAsIDAsIDEuMCwgJ3N0b25lJywgOCwgMyk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9zaHJ1YicsIC0xNCwgLTgsIDEsIE1hdGguUEkgLyAxMiwgMS4xLCAnZmliZXInLCA0LCAxKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX2NhaXJuJywgLTIwLCAtNiwgMCwgMCwgMS4wLCAnc3RvbmUnLCA2LCAyKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX29yZScsIC0zOCwgLTQyLCAwLCBNYXRoLlBJIC8gNCwgMS4xLCAnb3JlJywgOCwgMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBuZWFyZXN0SGFydmVzdGFibGUoXG4gIHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCByZXNvdXJjZT86IFJlc291cmNlVHlwZSxcbik6IEVudGl0eSB8IG51bGwge1xuICBsZXQgYmVzdDogRW50aXR5IHwgbnVsbCA9IG51bGw7XG4gIGxldCBiZXN0RCA9IHJhZGl1cyAqIHJhZGl1cztcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKVxuICAgICAgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgY29udGludWU7XG4gICAgaWYgKHJlc291cmNlICYmIGUucmVzb3VyY2UgIT09IHJlc291cmNlKSBjb250aW51ZTtcbiAgICBjb25zdCBkID0gKGUueCAtIHgpICoqIDIgKyAoZS56IC0geikgKiogMjtcbiAgICBpZiAoZCA8IGJlc3REKSB7IGJlc3REID0gZDsgYmVzdCA9IGU7IH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0UmVzdWx0IHsgZW50aXR5OiBFbnRpdHk7IHJlc291cmNlOiBSZXNvdXJjZVR5cGU7IGFtb3VudDogbnVtYmVyOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXJ2ZXN0RW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEhhcnZlc3RSZXN1bHQgfCBudWxsIHtcbiAgY29uc3QgZSA9IGxpdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsO1xuICBjb25zdCBhbW91bnQgPSBNYXRoLm1pbihlLnlpZWxkUGVySGFydmVzdCwgZS5yZW1haW5pbmcpO1xuICBpZiAod29ybGQubGlmZSAmJiBPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIG4pID0+IHN1bSArIG4sIDApICsgYW1vdW50ID4gMTIwKSByZXR1cm4gbnVsbDtcbiAgZS5yZW1haW5pbmcgLT0gYW1vdW50O1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBlLmhhcnZlc3RlZE9uY2UgPSB0cnVlO1xuICBpZiAoZS5yZW1haW5pbmcgPD0gMCkgZS5oYXJ2ZXN0ZWQgPSB0cnVlO1xuICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBlbnRpdHk6IGUsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQgfTtcbn1cblxuLyoqIFJlbW92ZSBldmVyeSByZXRpcmVkIHNvdXJjZSBhZnRlciB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheS4gVGhpcyBtaWdyYXRpb25cbiAqIGNyZWF0ZXMgZGV0ZXJtaW5pc3RpYyB0b21ic3RvbmVzIGJ1dCBpcyBub3QgYSBwbGF5ZXIgY29tbWFuZCBvciByZXZpc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXRpcmVTdG9uZUVudGl0aWVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBmb3IgKGNvbnN0IGUgb2YgWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXSkge1xuICAgIGlmICghaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkpIGNvbnRpbnVlO1xuICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShlLmlkKTtcbiAgICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChlLmlkKTtcbiAgICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgICBpZiAoIXdvcmxkLmVudGl0eUNodW5rcy5oYXMoZS5jaHVuaykpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIGZvciAoY29uc3QgW2tleSwgaWRzXSBvZiB3b3JsZC5lbnRpdHlDaHVua3MpIHtcbiAgICBjb25zdCBhY3RpdmUgPSBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSk7XG4gICAgaWYgKGFjdGl2ZS5sZW5ndGggPiAwIHx8IHdvcmxkLmVudGl0eUNoYW5nZXMuaGFzKGtleSkpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBhY3RpdmUpO1xuICAgIGVsc2Ugd29ybGQuZW50aXR5Q2h1bmtzLmRlbGV0ZShrZXkpO1xuICB9XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwZXJzaXN0ZW5jZSAvIGF1dGhvcml0eSBib3VuZGFyeSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWFuaWZlc3Qge1xuICBzY2hlbWE6IDE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgcGFyYW1zSGFzaDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBmbnYxYSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgaCA9IDB4ODExYzlkYzU7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGggXj0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIGggPSBNYXRoLmltdWwoaCwgMHgwMTAwMDE5Myk7XG4gIH1cbiAgcmV0dXJuIChoID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkTWFuaWZlc3Qod29ybGQ6IFdvcmxkKTogV29ybGRNYW5pZmVzdCB7XG4gIGNvbnN0IHAgPSB3b3JsZC5wYXJhbXM7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIHNlZWQ6IHdvcmxkLnNlZWQsXG4gICAgZ2VuZXJhdG9yVmVyc2lvbjogcC5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIHNpemU6IHAuc2l6ZSxcbiAgICBjaHVua1NpemU6IHAuY2h1bmtTaXplLFxuICAgIHlNaW46IHAueU1pbixcbiAgICB5TWF4OiBwLnlNYXgsXG4gICAgc2VhTGV2ZWw6IHAuc2VhTGV2ZWwsXG4gICAgcGFyYW1zSGFzaDogZm52MWEoSlNPTi5zdHJpbmdpZnkocCkpLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsRWRpdCB7IGk6IG51bWJlcjsgbTogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBzY2hlbWE6IDE7XG4gIGtleTogc3RyaW5nO1xuICBiYXNlVmVyc2lvbjogbnVtYmVyO1xuICBlZGl0czogVm94ZWxFZGl0W107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBDaHVua0RlbHRhIHtcbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAga2V5LFxuICAgIGJhc2VWZXJzaW9uOiB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBlZGl0czogZWRpdHMgPyBbLi4uZWRpdHMuZW50cmllcygpXS5tYXAoKFtpLCBtXSkgPT4gKHsgaSwgbSB9KSkuc29ydCgoYSwgYikgPT4gYS5pIC0gYi5pKSA6IFtdLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwgZGVsdGE6IENodW5rRGVsdGEpOiB2b2lkIHtcbiAgY29uc3QgW2N4LCBjel0gPSBkZWx0YS5rZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgZm9yIChjb25zdCBlIG9mIGRlbHRhLmVkaXRzKSB7XG4gICAgY29uc3QgeUluZGV4ID0gTWF0aC5mbG9vcihlLmkgLyBDSFVOS19BUkVBKTtcbiAgICBjb25zdCByZW0gPSBlLmkgJSBDSFVOS19BUkVBO1xuICAgIGNvbnN0IGx6ID0gTWF0aC5mbG9vcihyZW0gLyBDSFVOS19TSVpFKTtcbiAgICBjb25zdCBseCA9IHJlbSAlIENIVU5LX1NJWkU7XG4gICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseDtcbiAgICBjb25zdCB5ID0gWV9NSU4gKyB5SW5kZXg7XG4gICAgY29uc3QgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICBzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgZS5tIGFzIE1hdElkKTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIHRpbWUgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBUaW1lU3RhdGUgeyB0OiBudW1iZXI7IGRheUxlbmd0aFNlYzogbnVtYmVyOyBwYXVzZWQ6IGJvb2xlYW47IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkdmFuY2VUaW1lKHM6IFRpbWVTdGF0ZSwgZHQ6IG51bWJlcik6IHZvaWQge1xuICBpZiAocy5wYXVzZWQpIHJldHVybjtcbiAgcy50ID0gKHMudCArIGR0IC8gcy5kYXlMZW5ndGhTZWMpICUgMTtcbn1cbiIsICIvLyBWb3hlbCBmYWNlIGNvbG91cnMgYW5kIGtleXMgc2hhcmVkIGJ5IHRoZSBtYWluLXRocmVhZCB0ZXJyYWluIHZpZXcgYW5kIHRoZVxuLy8gY2h1bmsgd29ya2VyLiBQdXJlIGRhdGEgKyBUSFJFRS5Db2xvciBtYXRoIChubyBXZWJHTCBvYmplY3RzKS5cbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCBwYWxldHRlIGZyb20gJy4uL2RhdGEvcGFsZXR0ZS5qc29uJztcbmltcG9ydCB7IE1BVCwgaGFzaDJpIH0gZnJvbSAnLi4vc2ltL3dvcmxkJztcblxuZXhwb3J0IGNvbnN0IE0gPSBwYWxldHRlLm1hdGVyaWFscyBhcyBSZWNvcmQ8c3RyaW5nLCB7IGhleDogc3RyaW5nIH0+O1xuZXhwb3J0IGNvbnN0IEggPSAoazogc3RyaW5nKSA9PiBNW2tdLmhleDtcblxuZXhwb3J0IGNvbnN0IGNvbG9yQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgVEhSRUUuQ29sb3I+KCk7XG5leHBvcnQgZnVuY3Rpb24gYyhoZXg6IHN0cmluZyk6IFRIUkVFLkNvbG9yIHtcbiAgbGV0IG91dCA9IGNvbG9yQ2FjaGUuZ2V0KGhleCk7XG4gIGlmICghb3V0KSB7IG91dCA9IG5ldyBUSFJFRS5Db2xvcihoZXgpOyBjb2xvckNhY2hlLnNldChoZXgsIG91dCk7IH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGNvbnN0IENPTCA9IHtcbiAgZ3Jhc3NUb3A6IFtjKEgoJ2dyYXNzX3RvcCcpKSwgYyhIKCdncmFzc19oaWdoJykpLCBjKEgoJ2dyYXNzX3BlYWsnKSldLFxuICBncmFzc0NhcDogYyhIKCdncmFzc19jYXAnKSksXG4gIHNvaWw6IGMoSCgnc3RyYXRhX29jaHJlJykpLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoMC43OCksXG4gIG9jaHJlOiBjKEgoJ3N0cmF0YV9vY2hyZScpKSxcbiAgcnVzdDogYyhIKCdzdHJhdGFfcnVzdCcpKSxcbiAgc3RvbmVUb3A6IGMoSCgnc3RvbmVfdG9wJykpLFxuICBzdG9uZUE6IGMoSCgnc3RvbmVfYm9keV9hJykpLFxuICBzdG9uZUI6IGMoSCgnc3RvbmVfYm9keV9iJykpLFxuICBzdG9uZVNoYWRlOiBjKEgoJ3N0b25lX3NoYWRlJykpLFxuICBzYW5kOiBjKEgoJ3NhbmQnKSksXG4gIGdyYXZlbDogYyhIKCdzdG9uZV9ib2R5X2InKSkuY2xvbmUoKS5sZXJwKGMoSCgnc2FuZCcpKSwgMC4zNSksXG4gIG9yZTogYyhIKCdvcmVfY3J5c3RhbCcpKSxcbiAgbW9zczogYyhIKCdncmFzc19jYXAnKSkuY2xvbmUoKS5sZXJwKGMoSCgnc3RvbmVfYm9keV9iJykpLCAwLjM1KSxcbiAgc25vdzogYyhIKCdzbm93JykpLFxuICBzbm93U2hhZGU6IGMoSCgnc25vdycpKS5jbG9uZSgpLmxlcnAoYyhIKCdzdG9uZV9zaGFkZScpKSwgMC4zNSksXG4gIHdhdGVyUmltOiBjKEgoJ3dhdGVyX3JpbScpKSxcbiAgd2F0ZXJTaGFsbG93OiBjKEgoJ3dhdGVyX3NoYWxsb3cnKSksXG4gIHdhdGVyTWlkOiBjKEgoJ3dhdGVyX21pZCcpKSxcbiAgd2F0ZXJEZWVwOiBjKEgoJ3dhdGVyX2RlZXAnKSksXG59O1xuXG5leHBvcnQgY29uc3QgU0hBREUgPSBbMC45MCwgMC45NiwgMS4wLCAxLjA0XTtcblxuLy8gS2VlcCBhIHNtYWxsIHJvbGxpbmcgd2luZG93IG9mIGJ1aWxkIHRpbWluZ3MgZm9yIHRoZSBwZXJmb3JtYW5jZSBldmlkZW5jZS5cbi8vIFRoZXNlIGFyZSBpbnN0cnVtZW50YXRpb24sIG5vdCBzaW11bGF0aW9uIHN0YXRlLlxuZXhwb3J0IGNvbnN0IE1BWF9QRVJGX1NBTVBMRVMgPSAxMjg7XG5leHBvcnQgZnVuY3Rpb24gcmVjb3JkU2FtcGxlKHNhbXBsZXM6IG51bWJlcltdLCBtczogbnVtYmVyKTogdm9pZCB7XG4gIHNhbXBsZXMucHVzaChtcyk7XG4gIGlmIChzYW1wbGVzLmxlbmd0aCA+IE1BWF9QRVJGX1NBTVBMRVMpIHNhbXBsZXMuc2hpZnQoKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBwZXJjZW50aWxlKHNhbXBsZXM6IG51bWJlcltdLCBwOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoc2FtcGxlcy5sZW5ndGggPT09IDApIHJldHVybiAwO1xuICBjb25zdCBzb3J0ZWQgPSBbLi4uc2FtcGxlc10uc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuICBjb25zdCBpID0gTWF0aC5taW4oc29ydGVkLmxlbmd0aCAtIDEsIE1hdGgubWF4KDAsIE1hdGguY2VpbChwICogc29ydGVkLmxlbmd0aCkgLSAxKSk7XG4gIHJldHVybiBNYXRoLnJvdW5kKHNvcnRlZFtpXSAqIDEwMCkgLyAxMDA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWlnaHRCYW5kKHk6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiB5ID49IDQ1ID8gMiA6IHkgPj0gMTggPyAxIDogMDtcbn1cbmV4cG9ydCBmdW5jdGlvbiBzdG9uZVRvbmUoeTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuICgoeSArIDY0KSA+PiAzKSAmIDE7XG59XG5leHBvcnQgZnVuY3Rpb24gc2hhZGVBdCh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBzeCA9IE1hdGguZmxvb3IoeCAvIDIpICsgTWF0aC5mbG9vcih5IC8gMykgKiAxNztcbiAgY29uc3Qgc3ogPSBNYXRoLmZsb29yKHogLyAyKTtcbiAgcmV0dXJuIE1hdGguZmxvb3IoaGFzaDJpKHN4LCBzeiwgc2VlZCArIDMwMCkgKiA0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGtleUZvcihtYXQ6IG51bWJlciwgdmFyaWFudDogbnVtYmVyLCBzaGFkZTogbnVtYmVyLCBheGlzOiBudW1iZXIsIGRpcjogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIChtYXQgJiAxNSkgfCAoKHZhcmlhbnQgJiAxNSkgPDwgNCkgfCAoKHNoYWRlICYgMykgPDwgOCkgfCAoKGF4aXMgJiAzKSA8PCAxMCkgfCAoKGRpciA+IDAgPyAxIDogMCkgPDwgMTIpO1xufVxuXG5leHBvcnQgY29uc3QgZmFjZUNvbG9yQ2FjaGUgPSBuZXcgTWFwPG51bWJlciwgVEhSRUUuQ29sb3I+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2xvckZvcktleShrZXk6IG51bWJlcik6IFRIUkVFLkNvbG9yIHtcbiAgY29uc3QgY2FjaGVkID0gZmFjZUNvbG9yQ2FjaGUuZ2V0KGtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG4gIGNvbnN0IG1hdCA9IGtleSAmIDE1O1xuICBjb25zdCB2YXJpYW50ID0gKGtleSA+PiA0KSAmIDE1O1xuICBjb25zdCBzaGFkZSA9IChrZXkgPj4gOCkgJiAzO1xuICBjb25zdCBheGlzID0gKGtleSA+PiAxMCkgJiAzO1xuICBjb25zdCBkaXIgPSAoa2V5ID4+IDEyKSAmIDE7XG4gIGxldCBjb2xvcjogVEhSRUUuQ29sb3I7XG5cbiAgaWYgKGF4aXMgPT09IDEgJiYgZGlyID09PSAxKSB7XG4gICAgY29uc3QgaGIgPSBNYXRoLm1pbigyLCB2YXJpYW50ICYgMyk7XG4gICAgaWYgKG1hdCA9PT0gTUFULkdSQVNTKSBjb2xvciA9IENPTC5ncmFzc1RvcFtoYl07XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuU0FORCkgY29sb3IgPSBDT0wuc2FuZDtcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5HUkFWRUwpIGNvbG9yID0gQ09MLmdyYXZlbDtcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5TT0lMKSBjb2xvciA9IENPTC5vY2hyZTtcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5PUkUpIGNvbG9yID0gQ09MLm9yZTtcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5NT1NTKSBjb2xvciA9IENPTC5tb3NzO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULlNOT1cpIGNvbG9yID0gQ09MLnNub3c7XG4gICAgZWxzZSBjb2xvciA9IENPTC5zdG9uZVRvcDtcbiAgfSBlbHNlIGlmIChheGlzID09PSAxICYmIGRpciA9PT0gMCkge1xuICAgIGNvbG9yID0gQ09MLnN0b25lU2hhZGU7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgZGVwdGggPSB2YXJpYW50ICYgNztcbiAgICBjb25zdCB0b25lID0gKHZhcmlhbnQgPj4gMykgJiAxO1xuICAgIGNvbnN0IGJvZHkgPSB0b25lID8gQ09MLnN0b25lQiA6IENPTC5zdG9uZUE7XG4gICAgaWYgKG1hdCA9PT0gTUFULkdSQVNTIHx8IG1hdCA9PT0gTUFULk1PU1MpIHtcbiAgICAgIGlmIChkZXB0aCA9PT0gMCkgY29sb3IgPSBtYXQgPT09IE1BVC5NT1NTID8gQ09MLm1vc3MgOiBDT0wuZ3Jhc3NDYXA7XG4gICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBjb2xvciA9IENPTC5zb2lsO1xuICAgICAgZWxzZSBpZiAoZGVwdGggPT09IDMpIGNvbG9yID0gQ09MLnJ1c3Q7XG4gICAgICBlbHNlIGNvbG9yID0gYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULlNPSUwpIHtcbiAgICAgIGNvbG9yID0gZGVwdGggPD0gMSA/IENPTC5zb2lsIDogYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULlNBTkQpIHtcbiAgICAgIGNvbG9yID0gZGVwdGggPD0gMSA/IENPTC5zYW5kIDogZGVwdGggPT09IDIgPyBDT0wub2NocmUgOiBib2R5O1xuICAgIH0gZWxzZSBpZiAobWF0ID09PSBNQVQuR1JBVkVMKSB7XG4gICAgICBjb2xvciA9IGRlcHRoIDw9IDEgPyBDT0wuZ3JhdmVsIDogYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULk9SRSkge1xuICAgICAgY29sb3IgPSBDT0wub3JlO1xuICAgIH0gZWxzZSBpZiAobWF0ID09PSBNQVQuU05PVykge1xuICAgICAgY29sb3IgPSBkZXB0aCA9PT0gMCA/IENPTC5zbm93U2hhZGUgOiBib2R5O1xuICAgIH0gZWxzZSBpZiAobWF0ID09PSBNQVQuQkVEUk9DSykge1xuICAgICAgY29sb3IgPSBDT0wuc3RvbmVTaGFkZTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29sb3IgPSBib2R5O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG91dCA9IGNvbG9yLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoU0hBREVbc2hhZGVdKTtcbiAgZmFjZUNvbG9yQ2FjaGUuc2V0KGtleSwgb3V0KTtcbiAgcmV0dXJuIG91dDtcbn1cbiIsICIvLyBQdXJlIGdyZWVkeSB2b3hlbCBtZXNoZXIgb3ZlciBhIHBhZGRlZCBjaHVuayB2b2x1bWUuIE5vIFdvcmxkIGFjY2VzcyBhbmQgbm9cbi8vIFdlYkdMIG9iamVjdHMsIHNvIGl0IHJ1bnMgaWRlbnRpY2FsbHkgb24gdGhlIG1haW4gdGhyZWFkIGFuZCBpbiBhIHdvcmtlci5cbi8vXG4vLyBQYWRkZWQgbGF5b3V0OiB4IGFuZCB6IHJ1biBmcm9tIC0xIHRvIENIVU5LX1NJWkUgKDM0IGNlbGxzKSBzbyBmYWNlcyBvbiBjaHVua1xuLy8gYm9yZGVycyBjYW4gc2VlIHRoZWlyIG5laWdoYm91cnM7IHkgcnVucyBvdmVyIHRoZSBmdWxsIHdvcmxkIGhlaWdodC4gT3V0IG9mXG4vLyByYW5nZSB5IHNhbXBsZXMgYXJlIGJlZHJvY2sgYmVsb3cgYW5kIGFpciBhYm92ZSwgYXMgaW4gZ2V0Vm94ZWwuXG5pbXBvcnQge1xuICBDSFVOS19TSVpFLCBXT1JMRF9IRUlHSFQsIFlfTUlOLCBNQVQsIGlzT3BhcXVlLCBsb2NhbEluZGV4LFxufSBmcm9tICcuLi9zaW0vd29ybGQnO1xuaW1wb3J0IHsgY29sb3JGb3JLZXksIGhlaWdodEJhbmQsIGtleUZvciwgc2hhZGVBdCwgc3RvbmVUb25lIH0gZnJvbSAnLi92b3hlbC1jb2xvcnMnO1xuXG5leHBvcnQgY29uc3QgUEFEID0gQ0hVTktfU0laRSArIDI7XG5leHBvcnQgY29uc3QgUEFEREVEX1ZPTFVNRSA9IFBBRCAqIFBBRCAqIFdPUkxEX0hFSUdIVDtcblxuZXhwb3J0IGludGVyZmFjZSBNZXNoQXJyYXlzIHtcbiAgcG9zaXRpb25zOiBGbG9hdDMyQXJyYXk7XG4gIG5vcm1hbHM6IEZsb2F0MzJBcnJheTtcbiAgY29sb3JzOiBGbG9hdDMyQXJyYXk7XG4gIG1hdHM6IEZsb2F0MzJBcnJheTtcbiAgaW5kaWNlczogVWludDMyQXJyYXk7XG4gIHRyaWFuZ2xlczogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgcGFkZGVkSW5kZXggPSAoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciA9PlxuICAoeCArIDEpICsgKHogKyAxKSAqIFBBRCArIHkgKiBQQUQgKiBQQUQ7XG5cbi8qKiBDb3B5IGEgY2h1bmsgYW5kIGl0cyBvbmUtY2VsbCBib3JkZXIgaW50byBhIHBhZGRlZCB2b2x1bWUuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRQYWRkZWQoXG4gIGRhdGE6IFVpbnQ4QXJyYXksXG4gIG5laWdoYm91cjogKGx4OiBudW1iZXIsIHk6IG51bWJlciwgbHo6IG51bWJlcikgPT4gbnVtYmVyLFxuKTogVWludDhBcnJheSB7XG4gIGNvbnN0IG91dCA9IG5ldyBVaW50OEFycmF5KFBBRERFRF9WT0xVTUUpO1xuICBmb3IgKGxldCB5ID0gMDsgeSA8IFdPUkxEX0hFSUdIVDsgeSsrKSB7XG4gICAgZm9yIChsZXQgeiA9IC0xOyB6IDw9IENIVU5LX1NJWkU7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IC0xOyB4IDw9IENIVU5LX1NJWkU7IHgrKykge1xuICAgICAgICBjb25zdCBpbnNpZGUgPSB4ID49IDAgJiYgeiA+PSAwICYmIHggPCBDSFVOS19TSVpFICYmIHogPCBDSFVOS19TSVpFO1xuICAgICAgICBvdXRbcGFkZGVkSW5kZXgoeCwgeSwgeildID0gaW5zaWRlID8gZGF0YVtsb2NhbEluZGV4KHgsIHksIHopXSA6IG5laWdoYm91cih4LCB5LCB6KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gcG9zRnJvbShheGlzOiBudW1iZXIsIHNsaWNlOiBudW1iZXIsIGk6IG51bWJlciwgajogbnVtYmVyLCBvdXQ6IEludDMyQXJyYXkpOiB2b2lkIHtcbiAgaWYgKGF4aXMgPT09IDApIHsgb3V0WzBdID0gc2xpY2U7IG91dFsxXSA9IGk7IG91dFsyXSA9IGo7IH1cbiAgZWxzZSBpZiAoYXhpcyA9PT0gMSkgeyBvdXRbMF0gPSBqOyBvdXRbMV0gPSBzbGljZTsgb3V0WzJdID0gaTsgfVxuICBlbHNlIHsgb3V0WzBdID0gaTsgb3V0WzFdID0gajsgb3V0WzJdID0gc2xpY2U7IH1cbn1cblxuY2xhc3MgR3Jvd2FibGUge1xuICBwcml2YXRlIGJ1ZjogRmxvYXQzMkFycmF5O1xuICBsZW5ndGggPSAwO1xuICBjb25zdHJ1Y3RvcihuOiBudW1iZXIpIHsgdGhpcy5idWYgPSBuZXcgRmxvYXQzMkFycmF5KG4pOyB9XG4gIHB1c2gzKGE6IG51bWJlciwgYjogbnVtYmVyLCBjOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5sZW5ndGggKyAzID4gdGhpcy5idWYubGVuZ3RoKSB0aGlzLmdyb3coKTtcbiAgICB0aGlzLmJ1Zlt0aGlzLmxlbmd0aCsrXSA9IGE7IHRoaXMuYnVmW3RoaXMubGVuZ3RoKytdID0gYjsgdGhpcy5idWZbdGhpcy5sZW5ndGgrK10gPSBjO1xuICB9XG4gIHB1c2gxKGE6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICh0aGlzLmxlbmd0aCArIDEgPiB0aGlzLmJ1Zi5sZW5ndGgpIHRoaXMuZ3JvdygpO1xuICAgIHRoaXMuYnVmW3RoaXMubGVuZ3RoKytdID0gYTtcbiAgfVxuICBwcml2YXRlIGdyb3coKTogdm9pZCB7IGNvbnN0IG4gPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMuYnVmLmxlbmd0aCAqIDIpOyBuLnNldCh0aGlzLmJ1Zik7IHRoaXMuYnVmID0gbjsgfVxuICBkb25lKCk6IEZsb2F0MzJBcnJheSB7IHJldHVybiB0aGlzLmJ1Zi5zbGljZSgwLCB0aGlzLmxlbmd0aCk7IH1cbn1cblxuLyoqXG4gKiBHcmVlZHkgM0QgZmFjZSBtZXNoZXIuIEEgZmFjZSBpcyBlbWl0dGVkIHdoZXJlIGFuIG9wYXF1ZSB2b3hlbCB0b3VjaGVzIGFcbiAqIG5vbi1vcGFxdWUgY2VsbCAoYWlyIG9yIHdhdGVyKTsgb25seSB0aGUgY2h1bmsgdGhhdCBvd25zIHRoZSBzb2xpZCB2b3hlbFxuICogZW1pdHMgaXQuIE91dHB1dCBpcyBpZGVudGljYWwgdG8gdGhlIGZvcm1lciBpbi1wbGFjZSBtZXNoZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXNoUGFkZGVkKFxuICBwYWRkZWQ6IFVpbnQ4QXJyYXksIGhlaWdodHM6IFVpbnQ4QXJyYXksIG94OiBudW1iZXIsIG96OiBudW1iZXIsIHNlZWQ6IG51bWJlcixcbik6IE1lc2hBcnJheXMge1xuICBjb25zdCBzYW1wbGUgPSAoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgaWYgKHkgPCAwKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gICAgaWYgKHkgPj0gV09STERfSEVJR0hUKSByZXR1cm4gTUFULkFJUjtcbiAgICByZXR1cm4gcGFkZGVkW3BhZGRlZEluZGV4KHgsIHksIHopXTtcbiAgfTtcbiAgY29uc3QgcG9zaXRpb25zID0gbmV3IEdyb3dhYmxlKDEgPDwgMTUpLCBub3JtYWxzID0gbmV3IEdyb3dhYmxlKDEgPDwgMTUpO1xuICBjb25zdCBjb2xvcnMgPSBuZXcgR3Jvd2FibGUoMSA8PCAxNSksIG1hdHMgPSBuZXcgR3Jvd2FibGUoMSA8PCAxMyk7XG4gIGxldCBpbmRpY2VzID0gbmV3IFVpbnQzMkFycmF5KDEgPDwgMTQpO1xuICBsZXQgaW5kZXhDb3VudCA9IDA7XG4gIGxldCB2ZXJ0ZXhDb3VudCA9IDA7XG4gIGNvbnN0IGRpbXMgPSBbQ0hVTktfU0laRSwgV09STERfSEVJR0hULCBDSFVOS19TSVpFXTtcbiAgY29uc3QgcGEgPSBuZXcgSW50MzJBcnJheSgzKSwgcGIgPSBuZXcgSW50MzJBcnJheSgzKTtcbiAgY29uc3QgY29ybmVycyA9IG5ldyBGbG9hdDMyQXJyYXkoMTIpO1xuXG4gIGNvbnN0IGVtaXRRdWFkID0gKGF4aXM6IG51bWJlciwgZGlyOiBudW1iZXIsIHNsaWNlOiBudW1iZXIsXG4gICAgaTA6IG51bWJlciwgajA6IG51bWJlciwgdzogbnVtYmVyLCBoOiBudW1iZXIsIGtleTogbnVtYmVyKSA9PiB7XG4gICAgY29uc3QgcGxhbmUgPSBzbGljZSArIDE7XG4gICAgY29uc3QgdTAgPSBpMCwgdTEgPSBpMCArIHcsIHYwID0gajAsIHYxID0gajAgKyBoO1xuICAgIGNvbnN0IHNldCA9IChrOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpID0+IHsgY29ybmVyc1trICogM10gPSB4OyBjb3JuZXJzW2sgKiAzICsgMV0gPSB5OyBjb3JuZXJzW2sgKiAzICsgMl0gPSB6OyB9O1xuICAgIGlmIChheGlzID09PSAwKSB7XG4gICAgICBjb25zdCB4ID0gb3ggKyBwbGFuZSwgeTAgPSBZX01JTiArIHUwLCB5MSA9IFlfTUlOICsgdTEsIHowID0gb3ogKyB2MCwgejEgPSBveiArIHYxO1xuICAgICAgaWYgKGRpciA+IDApIHsgc2V0KDAsIHgsIHkwLCB6MCk7IHNldCgxLCB4LCB5MSwgejApOyBzZXQoMiwgeCwgeTEsIHoxKTsgc2V0KDMsIHgsIHkwLCB6MSk7IH1cbiAgICAgIGVsc2UgeyBzZXQoMCwgeCwgeTAsIHowKTsgc2V0KDEsIHgsIHkwLCB6MSk7IHNldCgyLCB4LCB5MSwgejEpOyBzZXQoMywgeCwgeTEsIHowKTsgfVxuICAgIH0gZWxzZSBpZiAoYXhpcyA9PT0gMSkge1xuICAgICAgY29uc3QgeSA9IFlfTUlOICsgcGxhbmUsIHowID0gb3ogKyB1MCwgejEgPSBveiArIHUxLCB4MCA9IG94ICsgdjAsIHgxID0gb3ggKyB2MTtcbiAgICAgIGlmIChkaXIgPiAwKSB7IHNldCgwLCB4MCwgeSwgejApOyBzZXQoMSwgeDAsIHksIHoxKTsgc2V0KDIsIHgxLCB5LCB6MSk7IHNldCgzLCB4MSwgeSwgejApOyB9XG4gICAgICBlbHNlIHsgc2V0KDAsIHgwLCB5LCB6MCk7IHNldCgxLCB4MSwgeSwgejApOyBzZXQoMiwgeDEsIHksIHoxKTsgc2V0KDMsIHgwLCB5LCB6MSk7IH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgeiA9IG96ICsgcGxhbmUsIHgwID0gb3ggKyB1MCwgeDEgPSBveCArIHUxLCB5MCA9IFlfTUlOICsgdjAsIHkxID0gWV9NSU4gKyB2MTtcbiAgICAgIGlmIChkaXIgPiAwKSB7IHNldCgwLCB4MCwgeTAsIHopOyBzZXQoMSwgeDEsIHkwLCB6KTsgc2V0KDIsIHgxLCB5MSwgeik7IHNldCgzLCB4MCwgeTEsIHopOyB9XG4gICAgICBlbHNlIHsgc2V0KDAsIHgwLCB5MCwgeik7IHNldCgxLCB4MCwgeTEsIHopOyBzZXQoMiwgeDEsIHkxLCB6KTsgc2V0KDMsIHgxLCB5MCwgeik7IH1cbiAgICB9XG4gICAgY29uc3QgY29sb3IgPSBjb2xvckZvcktleShrZXkpO1xuICAgIGNvbnN0IG1hdCA9IGtleSAmIDE1O1xuICAgIGNvbnN0IG54ID0gYXhpcyA9PT0gMCA/IGRpciA6IDAsIG55ID0gYXhpcyA9PT0gMSA/IGRpciA6IDAsIG56ID0gYXhpcyA9PT0gMiA/IGRpciA6IDA7XG4gICAgY29uc3QgYmFzZSA9IHZlcnRleENvdW50O1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgNDsgaysrKSB7XG4gICAgICBwb3NpdGlvbnMucHVzaDMoY29ybmVyc1trICogM10sIGNvcm5lcnNbayAqIDMgKyAxXSwgY29ybmVyc1trICogMyArIDJdKTtcbiAgICAgIG5vcm1hbHMucHVzaDMobngsIG55LCBueik7XG4gICAgICBjb2xvcnMucHVzaDMoY29sb3IuciwgY29sb3IuZywgY29sb3IuYik7XG4gICAgICBtYXRzLnB1c2gxKG1hdCk7XG4gICAgfVxuICAgIHZlcnRleENvdW50ICs9IDQ7XG4gICAgaWYgKGluZGV4Q291bnQgKyA2ID4gaW5kaWNlcy5sZW5ndGgpIHsgY29uc3QgbiA9IG5ldyBVaW50MzJBcnJheShpbmRpY2VzLmxlbmd0aCAqIDIpOyBuLnNldChpbmRpY2VzKTsgaW5kaWNlcyA9IG47IH1cbiAgICBpbmRpY2VzW2luZGV4Q291bnQrK10gPSBiYXNlOyBpbmRpY2VzW2luZGV4Q291bnQrK10gPSBiYXNlICsgMTsgaW5kaWNlc1tpbmRleENvdW50KytdID0gYmFzZSArIDI7XG4gICAgaW5kaWNlc1tpbmRleENvdW50KytdID0gYmFzZTsgaW5kaWNlc1tpbmRleENvdW50KytdID0gYmFzZSArIDI7IGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2UgKyAzO1xuICB9O1xuXG4gIGZvciAobGV0IGF4aXMgPSAwOyBheGlzIDwgMzsgYXhpcysrKSB7XG4gICAgY29uc3QgdSA9IChheGlzICsgMSkgJSAzLCB2ID0gKGF4aXMgKyAyKSAlIDM7XG4gICAgY29uc3QgZHUgPSBkaW1zW3VdLCBkdiA9IGRpbXNbdl0sIGRkID0gZGltc1theGlzXTtcbiAgICBjb25zdCBtYXNrID0gbmV3IFVpbnQxNkFycmF5KGR1ICogZHYpO1xuICAgIGZvciAobGV0IHNsaWNlID0gLTE7IHNsaWNlIDwgZGQ7IHNsaWNlKyspIHtcbiAgICAgIG1hc2suZmlsbCgwKTtcbiAgICAgIGxldCBhbnkgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgZHY7IGorKykge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGR1OyBpKyspIHtcbiAgICAgICAgICBwb3NGcm9tKGF4aXMsIHNsaWNlLCBpLCBqLCBwYSk7XG4gICAgICAgICAgcG9zRnJvbShheGlzLCBzbGljZSArIDEsIGksIGosIHBiKTtcbiAgICAgICAgICBjb25zdCBhID0gc2FtcGxlKHBhWzBdLCBwYVsxXSwgcGFbMl0pO1xuICAgICAgICAgIGNvbnN0IGIgPSBzYW1wbGUocGJbMF0sIHBiWzFdLCBwYlsyXSk7XG4gICAgICAgICAgY29uc3QgYW8gPSBpc09wYXF1ZShhKSwgYm8gPSBpc09wYXF1ZShiKTtcbiAgICAgICAgICBpZiAoYW8gPT09IGJvKSBjb250aW51ZTtcbiAgICAgICAgICBjb25zdCBhSW5zaWRlID0gc2xpY2UgPj0gMCAmJiBzbGljZSA8IGRkO1xuICAgICAgICAgIGNvbnN0IGJJbnNpZGUgPSBzbGljZSArIDEgPj0gMCAmJiBzbGljZSArIDEgPCBkZDtcbiAgICAgICAgICBsZXQgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgbWF0OiBudW1iZXIsIGRpcjogbnVtYmVyO1xuICAgICAgICAgIGlmIChhbyAmJiAhYm8gJiYgYUluc2lkZSkgeyB4ID0gcGFbMF07IHkgPSBwYVsxXTsgeiA9IHBhWzJdOyBtYXQgPSBhOyBkaXIgPSAxOyB9XG4gICAgICAgICAgZWxzZSBpZiAoYm8gJiYgIWFvICYmIGJJbnNpZGUpIHsgeCA9IHBiWzBdOyB5ID0gcGJbMV07IHogPSBwYlsyXTsgbWF0ID0gYjsgZGlyID0gLTE7IH1cbiAgICAgICAgICBlbHNlIGNvbnRpbnVlO1xuICAgICAgICAgIGNvbnN0IHd5ID0gWV9NSU4gKyB5O1xuICAgICAgICAgIGNvbnN0IHN1cmZhY2VZID0gaGVpZ2h0c1t6ICogQ0hVTktfU0laRSArIHhdICsgWV9NSU47XG4gICAgICAgICAgY29uc3QgZGVwdGggPSBzdXJmYWNlWSAtICh3eSArIDEpO1xuICAgICAgICAgIGxldCB2YXJpYW50OiBudW1iZXI7XG4gICAgICAgICAgaWYgKGF4aXMgPT09IDEgJiYgZGlyID4gMCkgdmFyaWFudCA9IGhlaWdodEJhbmQod3kpO1xuICAgICAgICAgIGVsc2UgaWYgKGF4aXMgPT09IDEgJiYgZGlyIDwgMCkgdmFyaWFudCA9IDE1O1xuICAgICAgICAgIGVsc2UgdmFyaWFudCA9IChNYXRoLm1heCgwLCBNYXRoLm1pbig3LCBkZXB0aCkpICYgNykgfCAoc3RvbmVUb25lKHd5KSA8PCAzKTtcbiAgICAgICAgICBtYXNrW2ogKiBkdSArIGldID0ga2V5Rm9yKG1hdCwgdmFyaWFudCwgc2hhZGVBdChveCArIHgsIHd5LCBveiArIHosIHNlZWQpLCBheGlzLCBkaXIpO1xuICAgICAgICAgIGFueSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICghYW55KSBjb250aW51ZTtcbiAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgZHY7IGorKykge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGR1Oykge1xuICAgICAgICAgIGNvbnN0IGtleSA9IG1hc2tbaiAqIGR1ICsgaV07XG4gICAgICAgICAgaWYgKCFrZXkpIHsgaSsrOyBjb250aW51ZTsgfVxuICAgICAgICAgIGxldCB3ID0gMTtcbiAgICAgICAgICB3aGlsZSAoaSArIHcgPCBkdSAmJiBtYXNrW2ogKiBkdSArIGkgKyB3XSA9PT0ga2V5KSB3Kys7XG4gICAgICAgICAgbGV0IGggPSAxO1xuICAgICAgICAgIG91dGVyOiB3aGlsZSAoaiArIGggPCBkdikge1xuICAgICAgICAgICAgZm9yIChsZXQgayA9IDA7IGsgPCB3OyBrKyspIGlmIChtYXNrWyhqICsgaCkgKiBkdSArIGkgKyBrXSAhPT0ga2V5KSBicmVhayBvdXRlcjtcbiAgICAgICAgICAgIGgrKztcbiAgICAgICAgICB9XG4gICAgICAgICAgZm9yIChsZXQgamogPSAwOyBqaiA8IGg7IGpqKyspIGZvciAobGV0IGlpID0gMDsgaWkgPCB3OyBpaSsrKSBtYXNrWyhqICsgamopICogZHUgKyBpICsgaWldID0gMDtcbiAgICAgICAgICBlbWl0UXVhZChheGlzLCAoa2V5ID4+IDEyKSAmIDEgPyAxIDogLTEsIHNsaWNlLCBpLCBqLCB3LCBoLCBrZXkpO1xuICAgICAgICAgIGkgKz0gdztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4ge1xuICAgIHBvc2l0aW9uczogcG9zaXRpb25zLmRvbmUoKSwgbm9ybWFsczogbm9ybWFscy5kb25lKCksIGNvbG9yczogY29sb3JzLmRvbmUoKSwgbWF0czogbWF0cy5kb25lKCksXG4gICAgaW5kaWNlczogaW5kaWNlcy5zbGljZSgwLCBpbmRleENvdW50KSwgdHJpYW5nbGVzOiBpbmRleENvdW50IC8gMyxcbiAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxPQUFPLFVBQVU7QUFDakIsT0FBTyxZQUFZOzs7QUNRbkIsWUFBWUEsWUFBVzs7O0FDR3ZCLFlBQVksV0FBVzs7O0FDWnZCO0FBQUEsRUFDRSxRQUFVO0FBQUEsRUFDVixNQUFRO0FBQUEsRUFDUixRQUFVO0FBQUEsRUFDVixRQUFVO0FBQUEsRUFDVixNQUFRO0FBQUEsRUFDUixXQUFhO0FBQUEsSUFDWCxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsY0FBZ0I7QUFBQSxNQUNkLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxhQUFlO0FBQUEsTUFDYixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGNBQWdCO0FBQUEsTUFDZCxLQUFPO0FBQUEsTUFDUCxN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
