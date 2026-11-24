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
var DEFAULT_MACRO_TIERS = { fine: 448, mid: 896 };
var MACRO_TILE = 256;
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
  const tileCells = opts.focus ? Math.max(1, Math.round(MACRO_TILE / step)) : N;
  const tilesPerSide = Math.ceil(N / tileCells);
  const tileBuffers = [];
  for (let t = 0; t < tilesPerSide * tilesPerSide; t++) tileBuffers.push({ positions: [], normals: [], colors: [], indices: [] });
  let buf = tileBuffers[0];
  const pushQuad = (p, n, color) => {
    const { positions, normals, colors, indices } = buf;
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
  const tiers = opts.focus ? opts.tiers ?? DEFAULT_MACRO_TIERS : null;
  const B = 4;
  const levelOf = (bi, bj) => {
    if (!tiers || !opts.focus) return 1;
    const cx = -HALF + (bi + 0.5) * B * step, cz = -HALF + (bj + 0.5) * B * step;
    const d = Math.max(Math.abs(cx - opts.focus.x), Math.abs(cz - opts.focus.z)) - B * step / 2;
    return d <= tiers.fine ? 1 : d <= tiers.mid ? 2 : 4;
  };
  const renderH = new Float32Array(N * N);
  const renderLand = new Uint8Array(N * N);
  const cells = [];
  const colorAcc = new THREE3.Color();
  for (let bj = 0; bj < N; bj += B) {
    for (let bi = 0; bi < N; bi += B) {
      const k = levelOf(bi / B, bj / B);
      for (let j0 = bj; j0 < Math.min(N, bj + B); j0 += k) {
        for (let i0 = bi; i0 < Math.min(N, bi + B); i0 += k) {
          let land = 0, total = 0, best = -1;
          colorAcc.setRGB(0, 0, 0);
          for (let j = j0; j < Math.min(N, j0 + k); j++) {
            for (let i = i0; i < Math.min(N, i0 + k); i++) {
              const idx = j * N + i;
              total++;
              if (holeCell[idx] || underwater[idx]) continue;
              land++;
              if (best < 0 || heights[idx] > heights[best]) best = idx;
              if (k > 1) colorAcc.add(topColor(tops[idx], heights[idx], i, j));
            }
          }
          if (best < 0 || land * 2 < total) continue;
          const h = heights[best];
          const top = tops[best];
          const color = k > 1 ? colorAcc.clone().multiplyScalar(1 / land) : topColor(top, h, i0, j0);
          cells.push({ i: i0, j: j0, k, h, top, color });
          for (let j = j0; j < Math.min(N, j0 + k); j++) {
            for (let i = i0; i < Math.min(N, i0 + k); i++) {
              renderH[j * N + i] = h;
              renderLand[j * N + i] = 1;
            }
          }
        }
      }
    }
  }
  const neighbourDrop = (ni, nj) => {
    if (ni < 0 || nj < 0 || ni >= N || nj >= N) return null;
    const nidx = nj * N + ni;
    if (holeCell[nidx]) return null;
    if (renderLand[nidx]) return renderH[nidx];
    return underwater[nidx] ? Math.max(SEA_LEVEL - 0.5, heights[nidx]) : SEA_LEVEL - 0.5;
  };
  for (const { i, j, k, h, top, color } of cells) {
    buf = tileBuffers[Math.floor(j / tileCells) * tilesPerSide + Math.floor(i / tileCells)];
    const x0 = -HALF + i * step, x1 = Math.min(HALF, x0 + k * step);
    const z0 = -HALF + j * step, z1 = Math.min(HALF, z0 + k * step);
    const span = Math.min(k, N - i), spanZ = Math.min(k, N - j);
    pushQuad(
      [[x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0]],
      [0, 1, 0],
      color
    );
    const edge = (side) => {
      const n = side < 2 ? spanZ : span;
      let runStart = 0, runH = null;
      const flush = (end) => {
        if (runH === null || h <= runH) return;
        const nh = runH;
        const col = sideColor(top, h, nh, i, j);
        if (side === 0) {
          const za = z0 + runStart * step, zb = z0 + end * step;
          pushQuad([[x1, nh, za], [x1, h, za], [x1, h, zb], [x1, nh, zb]], [1, 0, 0], col);
        } else if (side === 1) {
          const za = z0 + runStart * step, zb = z0 + end * step;
          pushQuad([[x0, nh, za], [x0, nh, zb], [x0, h, zb], [x0, h, za]], [-1, 0, 0], col);
        } else if (side === 2) {
          const xa = x0 + runStart * step, xb = x0 + end * step;
          pushQuad([[xa, nh, z1], [xb, nh, z1], [xb, h, z1], [xa, h, z1]], [0, 0, 1], col);
        } else {
          const xa = x0 + runStart * step, xb = x0 + end * step;
          pushQuad([[xa, nh, z0], [xa, h, z0], [xb, h, z0], [xb, nh, z0]], [0, 0, -1], col);
        }
      };
      for (let t = 0; t < n; t++) {
        const nh = side === 0 ? neighbourDrop(i + span, j + t) : side === 1 ? neighbourDrop(i - 1, j + t) : side === 2 ? neighbourDrop(i + t, j + spanZ) : neighbourDrop(i + t, j - 1);
        if (t > 0 && nh === runH) continue;
        flush(t);
        runStart = t;
        runH = nh;
      }
      flush(n);
    };
    edge(0);
    edge(1);
    edge(2);
    edge(3);
  }
  const material = new THREE3.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const meshes = [];
  let triangles = 0;
  for (let t = 0; t < tileBuffers.length; t++) {
    const { positions, normals, colors, indices } = tileBuffers[t];
    if (indices.length === 0 && (tileBuffers.length > 1 || meshes.length > 0)) continue;
    const geometry = new THREE3.BufferGeometry();
    geometry.setAttribute("position", new THREE3.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE3.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE3.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const mesh = new THREE3.Mesh(geometry, material);
    mesh.name = tileBuffers.length > 1 ? `macro_lod_tile_${t % tilesPerSide}_${Math.floor(t / tilesPerSide)}` : "macro_lod";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    meshes.push(mesh);
    triangles += indices.length / 3;
  }
  if (meshes.length === 0) {
    const empty = new THREE3.Mesh(new THREE3.BufferGeometry(), material);
    empty.name = "macro_lod";
    meshes.push(empty);
  }
  return {
    mesh: meshes[0],
    meshes,
    triangles,
    sampleMs,
    totalMs: performance.now() - totalT0,
    sampleCached
  };
}
var _cullFrustum = new THREE3.Frustum();
var _cullMatrix = new THREE3.Matrix4();

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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMy5sb2QudGVzdC50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3JlbmRlci93YXRlci50cyIsICIuLi8uLi9zcmMvZGF0YS9wYWxldHRlLmpzb24iLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS9ub2lzZS50cyIsICIuLi8uLi9zcmMvc2ltL2h5ZHJvbG9neS50cyIsICIuLi8uLi9zcmMvc2ltL21hdGVyaWFscy50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4tdjIudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3ZveGVsLWNvbG9ycy50cyIsICIuLi8uLi9zcmMvcmVuZGVyL21lc2hlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCB7IGJ1aWxkTWFjcm9NZXNoLCBzYW1wbGVNYWNyb1RlcnJhaW4gfSBmcm9tICcuLi9zcmMvcmVuZGVyL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgTUFULCBjcmVhdGVXb3JsZCwgZW5zdXJlQ2h1bmssIGV2aWN0Q2h1bmssIHNldFZveGVsLCBzdXJmYWNlQXQsIHN1cmZhY2VIZWlnaHRBdCxcbiAgdG9wTWF0ZXJpYWxBdFdvcmxkLCB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbn0gZnJvbSAnLi4vc3JjL3NpbS93b3JsZCc7XG5cbnRlc3QoJ21hY3JvIHNhbXBsaW5nIHJlYWRzIGF1dGhvcml0YXRpdmUgZWRpdGVkIGhlaWdodC9tYXRlcmlhbCB3aXRob3V0IHNjYW5uaW5nIHVuZWRpdGVkIGNodW5rcycsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgZWRpdGVkID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgY29uc3QgeCA9IE1hdGgucm91bmQoZWRpdGVkLngpLCB6ID0gTWF0aC5yb3VuZChlZGl0ZWQueik7XG4gIGNvbnN0IGJlZm9yZUNodW5rcyA9IHdvcmxkLmNodW5rcy5zaXplO1xuICBjb25zdCB1bnRvdWNoZWQgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDgpO1xuICBjb25zdCBvcmlnaW5hbCA9IHN1cmZhY2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB4LCB6KSA+PSAyID8gTUFULkdSQVNTIDogTUFULlNUT05FO1xuXG4gIGFzc2VydC5lcXVhbChlZGl0ZWQuaGVpZ2h0LCBzdXJmYWNlSGVpZ2h0QXQod29ybGQuc2VlZCwgeCwgeikpO1xuICBhc3NlcnQuZXF1YWwod29ybGQuY2h1bmtzLnNpemUsIDAsICdiYXNlIG1hY3JvIHNhbXBsaW5nIG11c3Qgbm90IG1hdGVyaWFsaXplIGNodW5rcycpO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIGVkaXRlZC5oZWlnaHQsIHosIE1BVC5PUkUpKTtcbiAgY29uc3QgYWZ0ZXIgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDApO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIuaGVpZ2h0LCBlZGl0ZWQuaGVpZ2h0ICsgMSk7XG4gIGFzc2VydC5lcXVhbChhZnRlci50b3AsIE1BVC5PUkUpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIudW5kZXJ3YXRlciwgZmFsc2UpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgOCksIHVudG91Y2hlZCk7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5jaHVua3Muc2l6ZSwgYmVmb3JlQ2h1bmtzICsgMSwgJ29ubHkgdGhlIGVkaXRlZCBjaHVuayBzaG91bGQgYmUgbWF0ZXJpYWxpemVkJyk7XG4gIGFzc2VydC5ub3RFcXVhbChvcmlnaW5hbCwgTUFULk9SRSk7XG59KTtcblxudGVzdCgnZWRpdCByZXZlcnNhbCBhbmQgY2h1bmsgZXZpY3Rpb24gaW52YWxpZGF0ZSBtYWNybyB2YWx1ZXMgYW5kIHJlc3RvcmUgZGVsdGFzJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKDEzMzcpO1xuICBjb25zdCBjZWxsID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgY29uc3QgeCA9IE1hdGgucm91bmQoY2VsbC54KSwgeiA9IE1hdGgucm91bmQoY2VsbC56KTtcbiAgY29uc3Qgb3JpZ2luYWwgPSB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIHgsIHopO1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk7XG5cbiAgYXNzZXJ0Lm9rKHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBNQVQuU1RPTkUpKTtcbiAgY29uc3QgZWRpdGVkID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKGVkaXRlZC5oZWlnaHQsIHkgKyAxKTtcbiAgYXNzZXJ0LmVxdWFsKGVkaXRlZC50b3AsIE1BVC5TVE9ORSk7XG4gIGV2aWN0Q2h1bmsod29ybGQsIGtleSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKSwgZWRpdGVkLCAnZXZpY3Rpb24gbG9zZXMgdGhlIGR1cmFibGUgZWRpdCcpO1xuXG4gIGFzc2VydC5vayhzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgTUFULkFJUikpO1xuICBldmljdENodW5rKHdvcmxkLCBrZXkpO1xuICBhc3NlcnQuZXF1YWwoc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKS5oZWlnaHQsIHkpO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIHkgLSAxLCB6LCBvcmlnaW5hbCA9PT0gTUFULk9SRSA/IE1BVC5TVE9ORSA6IE1BVC5PUkUpKTtcbiAgY29uc3QgbWF0ZXJpYWxFZGl0ID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgYXNzZXJ0Lm5vdEVxdWFsKG1hdGVyaWFsRWRpdC50b3AsIG9yaWdpbmFsKTtcbiAgYXNzZXJ0LmVxdWFsKHNldFZveGVsKHdvcmxkLCB4LCB5IC0gMSwgeiwgb3JpZ2luYWwpLCB0cnVlKTtcbiAgY29uc3QgcmV2ZXJzZWQgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDApO1xuICBhc3NlcnQuZXF1YWwocmV2ZXJzZWQuaGVpZ2h0LCB5KTtcbiAgYXNzZXJ0LmVxdWFsKHJldmVyc2VkLnRvcCwgb3JpZ2luYWwpO1xufSk7XG5cbnRlc3QoJ21hcCBtYWNybyBtZXNoIGluY2x1ZGVzIHRoZSBuZWFyIGVkaXRlZCBlYXJ0aHdvcmsgYXQgZnVsbCBzdXJmYWNlIGhlaWdodCcsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgY2VsbCA9IHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCk7XG4gIGNvbnN0IHggPSBNYXRoLnJvdW5kKGNlbGwueCksIHogPSBNYXRoLnJvdW5kKGNlbGwueik7XG4gIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIE1BVC5TVE9ORSkpO1xuXG4gIGNvbnN0IG1lc2hIZWlnaHQgPSAobWVzaDogUmV0dXJuVHlwZTx0eXBlb2YgYnVpbGRNYWNyb01lc2g+WydtZXNoJ10pOiBudW1iZXIgPT4ge1xuICAgIGxldCBoZWlnaHQgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gICAgY29uc3QgcG9zaXRpb24gPSBtZXNoLmdlb21ldHJ5LmdldEF0dHJpYnV0ZSgncG9zaXRpb24nKTtcbiAgICBjb25zdCBub3JtYWwgPSBtZXNoLmdlb21ldHJ5LmdldEF0dHJpYnV0ZSgnbm9ybWFsJyk7XG4gICAgLy8gTWFjcm8gZ2VvbWV0cnkgaXMgbm9uLWluZGV4ZWQ6IGVhY2ggcXVhZCBvd25zIGZvdXIgY29uc2VjdXRpdmUgdmVydGljZXMuXG4gICAgLy8gUHJvYmUgaXRzIGZpcnN0IGNvcm5lciBzbyBuZWlnaGJvcmluZyBjZWxscycgc2hhcmVkIHZlcnRpY2VzIGNhbm5vdCBtYXRjaC5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBvc2l0aW9uLmNvdW50OyBpICs9IDQpIHtcbiAgICAgIGlmIChwb3NpdGlvbi5nZXRYKGkpID09PSBjZWxsLnggLSA0ICYmIHBvc2l0aW9uLmdldFooaSkgPT09IGNlbGwueiAtIDQgJiYgbm9ybWFsLmdldFkoaSkgPT09IDEpIHtcbiAgICAgICAgaGVpZ2h0ID0gTWF0aC5tYXgoaGVpZ2h0LCBwb3NpdGlvbi5nZXRZKGkpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGhlaWdodDtcbiAgfTtcbiAgY29uc3Qgd2l0aEhvbGUgPSBidWlsZE1hY3JvTWVzaCh3b3JsZCwge1xuICAgIHN0ZXA6IDgsIGhvbGU6IHtcbiAgICAgIG1pblg6IGNlbGwueCAtIDQsIG1heFg6IGNlbGwueCArIDQsIG1pblo6IGNlbGwueiAtIDQsIG1heFo6IGNlbGwueiArIDQsXG4gICAgfSxcbiAgfSk7XG4gIGNvbnN0IG1hcCA9IGJ1aWxkTWFjcm9NZXNoKHdvcmxkLCB7IHN0ZXA6IDggfSk7XG4gIGFzc2VydC5lcXVhbChtZXNoSGVpZ2h0KHdpdGhIb2xlLm1lc2gpLCBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFksICd3b3JsZCBuZWFyIHJpbmcgc2hvdWxkIG93biB0aGUgaG9sZScpO1xuICBhc3NlcnQuZXF1YWwobWVzaEhlaWdodChtYXAubWVzaCksIHkgKyAxLCAnbWFwIG11c3Qgbm90IGhpZGUgdGhlIGVkaXRlZCBlYXJ0aHdvcmsnKTtcbiAgd2l0aEhvbGUubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gIG1hcC5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbn0pO1xuXG50ZXN0KCdzYW1lLXNlZWQgd29ybGRzIGFuZCB1bnJlbGF0ZWQgZWRpdHMgZG8gbm90IHNoYXJlIGVkaXRlZCBtYWNybyBjYWNoZXMnLCAoKSA9PiB7XG4gIGNvbnN0IGEgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgYiA9IGNyZWF0ZVdvcmxkKDEzMzcpO1xuICBjb25zdCBiYXNlID0gc2FtcGxlTWFjcm9UZXJyYWluKGEsIDAsIDApO1xuICBjb25zdCB4ID0gTWF0aC5yb3VuZChiYXNlLngpLCB6ID0gTWF0aC5yb3VuZChiYXNlLnopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwoYSwgeCwgYmFzZS5oZWlnaHQsIHosIE1BVC5PUkUpKTtcbiAgYXNzZXJ0LmVxdWFsKHNhbXBsZU1hY3JvVGVycmFpbihhLCAwLCAwKS50b3AsIE1BVC5PUkUpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHNhbXBsZU1hY3JvVGVycmFpbihiLCAwLCAwKSwgYmFzZSwgJ2Fub3RoZXIgd29ybGQgcmVjZWl2ZWQgdGhlIGVkaXQnKTtcblxuICBjb25zdCBkaXN0YW50ID0gc2FtcGxlTWFjcm9UZXJyYWluKGEsIDMyLCAwKTtcbiAgY29uc3QgZHggPSBNYXRoLnJvdW5kKGRpc3RhbnQueCksIGR6ID0gTWF0aC5yb3VuZChkaXN0YW50LnopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwoYSwgZHgsIGRpc3RhbnQuaGVpZ2h0LCBkeiwgTUFULlNUT05FKSk7XG4gIGFzc2VydC5lcXVhbChzYW1wbGVNYWNyb1RlcnJhaW4oYSwgMCwgMCkudG9wLCBNQVQuT1JFKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChzYW1wbGVNYWNyb1RlcnJhaW4oYiwgMzIsIDApLCBkaXN0YW50KTtcbn0pO1xuXG50ZXN0KCdhbiBldmljdGVkIGVkaXRlZCBjaHVuayBpcyB0aGUgb25seSBjaHVuayBtYXRlcmlhbGl6ZWQgYnkgbWFjcm8gc2FtcGxpbmcnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoMTMzNyk7XG4gIGNvbnN0IGNlbGwgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDApO1xuICBjb25zdCB4ID0gTWF0aC5yb3VuZChjZWxsLngpLCB6ID0gTWF0aC5yb3VuZChjZWxsLnopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIGNlbGwuaGVpZ2h0LCB6LCBNQVQuU1RPTkUpKTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk7XG4gIGV2aWN0Q2h1bmsod29ybGQsIGtleSk7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5jaHVua3Muc2l6ZSwgMCk7XG4gIHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCk7XG4gIGFzc2VydC5lcXVhbChlbnN1cmVDaHVuayh3b3JsZCwgd29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk/LmtleSwga2V5KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChbLi4ud29ybGQuY2h1bmtzLmtleXMoKV0sIFtrZXldKTtcbn0pO1xuIiwgIi8vIFJlbmRlciBsYXllciBcdTIwMTQgY2h1bmtlZCAzRCB2b3hlbCBtZXNoZXIgKyBzdHJlYW1pbmcgKyBtYWNybyBMT0QuXG4vL1xuLy8gVGhlIHZpc2libGUgc3VyZmFjZSBpcyBkZXJpdmVkIGZyb20gdGhlIHNpbSdzIG9jY3VwYW5jeS9tYXRlcmlhbCB2b2x1bWUuXG4vLyBOZWFyIGNodW5rcyBhcmUgbWVzaGVkIGF0IDEgbSB3aXRoIGdyZWVkeSBmYWNlIG1lcmdpbmc7IHRoZSBmYXIgbGFuZHNjYXBlIGlzXG4vLyBhbiA4IG0gKHdvcmxkKSAvIDggbSAobWFwKSBtYWNybyBMT0Qgc2FtcGxlZCBmcm9tIHRoZSBzYW1lIGRldGVybWluaXN0aWNcbi8vIGdlbmVyYXRvci4gV2F0ZXIgaXMgYSBzaW5nbGUgc2VhLWxldmVsIHN1cmZhY2UgZGVyaXZlZCBmcm9tIHRoZSBzZWFiZWQgZGVwdGguXG4vL1xuLy8gTm8gYXByb24sIGhvcml6b24gcmluZyBvciBmb3VuZGF0aW9uIHNraXJ0OiB0aGUgd29ybGQgZWRnZSBpcyBvY2VhbiwgYW5kIHRoZVxuLy8gb2NlYW4gc3VyZmFjZSBleHRlbmRzIGZhciBiZXlvbmQgdGhlIDIwNDggbSBwbGF5YWJsZSBpc2xhbmQuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQgeyBtZXNoQ2h1bmtXYXRlciwgaW5zdGFsbEZhcldhdGVySG9sZSwgd2F0ZXJUaW1lIH0gZnJvbSAnLi93YXRlcic7XG5pbXBvcnQgeyBNZXNoQXJyYXlzLCBidWlsZFBhZGRlZCwgbWVzaFBhZGRlZCB9IGZyb20gJy4vbWVzaGVyJztcbmltcG9ydCB0eXBlIHsgQ2h1bmtXb3JrZXJQb29sIH0gZnJvbSAnLi9jaHVuay1wb29sJztcbmltcG9ydCB7XG4gIFdvcmxkLCBWb3hlbENodW5rLCBNYXRJZCwgU3VyZmFjZVNhbXBsZSwgR0VORVJBVE9SX1ZFUlNJT04sXG4gIFdPUkxEX1NJWkUsIEhBTEYsIENIVU5LX1NJWkUsIENIVU5LU19QRVJfU0lERSwgQ0hVTktfQVJFQSwgV09STERfSEVJR0hULFxuICBZX01JTiwgWV9NQVgsIFNFQV9MRVZFTCwgTUFULCBpc09wYXF1ZSxcbiAgY2h1bmtLZXksIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgd29ybGRUb0xvY2FsWCwgd29ybGRUb0xvY2FsWixcbiAgZ2V0Vm94ZWwsIGVuc3VyZUNodW5rLCBldmljdENodW5rLCBoYXNoMmksIGZibTIsXG4gIGVkaXRWZXJzaW9uLCBiYXNlSGVpZ2h0QXQsIGJhc2VUb3BNYXRlcmlhbEZvciwgaW5zdGFsbEJhc2VDaHVuaywgc2VlZEJhc2VDb2x1bW5zLFxufSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5pbXBvcnQge1xuICBNLCBILCBjb2xvckNhY2hlLCBjLCBDT0wsIFNIQURFLCBNQVhfUEVSRl9TQU1QTEVTLCByZWNvcmRTYW1wbGUsIHBlcmNlbnRpbGUsIGhlaWdodEJhbmQsIHN0b25lVG9uZSwgc2hhZGVBdCwga2V5Rm9yLCBmYWNlQ29sb3JDYWNoZSwgY29sb3JGb3JLZXksXG59IGZyb20gJy4vdm94ZWwtY29sb3JzJztcblxuY29uc3QgdGVycmFpbk1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICB2ZXJ0ZXhDb2xvcnM6IHRydWUsXG4gIHNpZGU6IFRIUkVFLkZyb250U2lkZSxcbn0pO1xudGVycmFpbk1hdGVyaWFsLm9uQmVmb3JlQ29tcGlsZSA9IChzaGFkZXIpID0+IHtcbiAgc2hhZGVyLnZlcnRleFNoYWRlciA9IHNoYWRlci52ZXJ0ZXhTaGFkZXJcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCAnI2luY2x1ZGUgPGNvbW1vbj5cXG5hdHRyaWJ1dGUgZmxvYXQgYU1hdDtcXG52YXJ5aW5nIHZlYzMgdldQb3M7XFxudmFyeWluZyB2ZWMzIHZXTnJtO1xcbnZhcnlpbmcgZmxvYXQgdk1hdDsnKVxuICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PicsICcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxcbnZXUG9zID0gKG1vZGVsTWF0cml4ICogdmVjNCh0cmFuc2Zvcm1lZCwgMS4wKSkueHl6O1xcbnZXTnJtID0gbm9ybWFsaXplKG1hdDMobW9kZWxNYXRyaXgpICogb2JqZWN0Tm9ybWFsKTtcXG52TWF0ID0gYU1hdDsnKTtcbiAgc2hhZGVyLmZyYWdtZW50U2hhZGVyID0gc2hhZGVyLmZyYWdtZW50U2hhZGVyXG4gICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgYCNpbmNsdWRlIDxjb21tb24+XG52YXJ5aW5nIHZlYzMgdldQb3M7XG52YXJ5aW5nIHZlYzMgdldOcm07XG52YXJ5aW5nIGZsb2F0IHZNYXQ7XG5mbG9hdCBoMjEodmVjMiBwKSB7IHJldHVybiBmcmFjdChzaW4oZG90KHAsIHZlYzIoMTI3LjEsIDMxMS43KSkpICogNDM3NTguNTQ1MzEyMyk7IH1cbmZsb2F0IHZuMih2ZWMyIHApIHtcbiAgdmVjMiBpID0gZmxvb3IocCk7IHZlYzIgZiA9IGZyYWN0KHApOyBmID0gZiAqIGYgKiAoMy4wIC0gMi4wICogZik7XG4gIHJldHVybiBtaXgobWl4KGgyMShpKSwgaDIxKGkgKyB2ZWMyKDEuMCwgMC4wKSksIGYueCksXG4gICAgICAgICAgICAgbWl4KGgyMShpICsgdmVjMigwLjAsIDEuMCkpLCBoMjEoaSArIHZlYzIoMS4wLCAxLjApKSwgZi54KSwgZi55KTtcbn1gKVxuICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29sb3JfZnJhZ21lbnQ+JywgYCNpbmNsdWRlIDxjb2xvcl9mcmFnbWVudD5cbntcbiAgdmVjMyBuID0gbm9ybWFsaXplKHZXTnJtKTtcbiAgZmxvYXQgdmVydCA9IDEuMCAtIHNtb290aHN0ZXAoMC4zNSwgMC43MCwgYWJzKG4ueSkpO1xuICBmbG9hdCBpc0dyYXNzID0gKCh2TWF0ID4gMC41ICYmIHZNYXQgPCAxLjUpIHx8ICh2TWF0ID4gOC41ICYmIHZNYXQgPCA5LjUpKSA/IDEuMCA6IDAuMDtcbiAgZmxvYXQgaXNTdG9uZSA9ICgodk1hdCA+IDQuNSAmJiB2TWF0IDwgNi41KSB8fCAodk1hdCA+IDcuNSAmJiB2TWF0IDwgOC41KSkgPyAxLjAgOiAwLjA7XG5cbiAgZmxvYXQgaG9yaXogPSBhYnMobi54KSA+IGFicyhuLnopID8gdldQb3MueiA6IHZXUG9zLng7XG4gIGZsb2F0IHJvdyA9IGZsb29yKHZXUG9zLnkpO1xuICBmbG9hdCBjb2wgPSBmbG9vcihob3Jpeik7XG4gIGZsb2F0IGggPSBoMjEodmVjMihjb2wsIHJvdykpO1xuICB2ZWMyIGYgPSB2ZWMyKGZyYWN0KGhvcml6KSwgZnJhY3QodldQb3MueSkpO1xuICBmbG9hdCBqb2ludCA9IHNtb290aHN0ZXAoMC4wLCAwLjA1NSwgbWluKGYueCwgMS4wIC0gZi54KSlcbiAgICAgICAgICAgICAgKiBzbW9vdGhzdGVwKDAuMCwgMC4wNTAsIG1pbihmLnksIDEuMCAtIGYueSkpO1xuICB2ZWMzIHN0b25lID0gbWl4KHZlYzMoMC42MiwgMC42MiwgMC41OCksIHZlYzMoMS4wNCwgMS4wMiwgMC45NSksIGgpO1xuICBzdG9uZSAqPSBtaXgoMC45MCwgMS4wLCBqb2ludCk7XG4gIHN0b25lICo9IG1peCgwLjkzLCAxLjAsIHNtb290aHN0ZXAoMC4wLCAwLjMwLCBmLnkpKTtcbiAgZGlmZnVzZUNvbG9yLnJnYiAqPSBtaXgodmVjMygxLjApLCBzdG9uZSwgdmVydCAqIGlzU3RvbmUpO1xuXG4gIGZsb2F0IGd5ID0gc21vb3Roc3RlcCgwLjQ1LCAwLjg4LCBhYnMobi55KSk7XG4gIGZsb2F0IGcxID0gdm4yKHZXUG9zLnh6ICogMS4zNSk7XG4gIGZsb2F0IGcyID0gdm4yKHZXUG9zLnh6ICogMC4xMSk7XG4gIHZlYzMgZ3Jhc3MgPSBtaXgodmVjMygwLjgyLCAwLjg2LCAwLjcyKSwgdmVjMygxLjA2LCAxLjA0LCAwLjk4KSwgZzEgKiAwLjQyICsgZzIgKiAwLjQ2ICsgdm4yKHZXUG9zLnh6ICogNC4zKSAqIDAuMTIpO1xuICBmbG9hdCBjZWxsID0gaDIxKGZsb29yKHZXUG9zLnh6KSArIDE3LjApO1xuICBncmFzcyAqPSAwLjk1ICsgMC4xMCAqIGNlbGw7XG4gIGRpZmZ1c2VDb2xvci5yZ2IgKj0gbWl4KHZlYzMoMS4wKSwgZ3Jhc3MsIGd5ICogaXNHcmFzcyk7XG59YCk7XG59O1xuXG5pbnRlcmZhY2UgTWVzaFJlc3VsdCB7IGdlb21ldHJ5OiBUSFJFRS5CdWZmZXJHZW9tZXRyeTsgdHJpYW5nbGVzOiBudW1iZXI7IH1cblxuLyoqIEJ1aWxkIGEgQnVmZmVyR2VvbWV0cnkgZnJvbSBtZXNoZXIgb3V0cHV0IChtYWluIHRocmVhZCkuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VvbWV0cnlGcm9tQXJyYXlzKGE6IE1lc2hBcnJheXMpOiBNZXNoUmVzdWx0IHtcbiAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYS5wb3NpdGlvbnMsIDMpKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdub3JtYWwnLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEubm9ybWFscywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhLmNvbG9ycywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2FNYXQnLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEubWF0cywgMSkpO1xuICBnZW9tZXRyeS5zZXRJbmRleChuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEuaW5kaWNlcywgMSkpO1xuICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgcmV0dXJuIHsgZ2VvbWV0cnksIHRyaWFuZ2xlczogYS50cmlhbmdsZXMgfTtcbn1cblxuLyoqIFBhZGRlZCB2b2x1bWUgZm9yIGEgcmVzaWRlbnQgY2h1bms7IG5laWdoYm91cnMgY29tZSBmcm9tIHRoZSB3b3JsZCAoM3gzIG11c3QgYmUgcmVzaWRlbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhZGRlZEZvcih3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogVWludDhBcnJheSB7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICByZXR1cm4gYnVpbGRQYWRkZWQoY2h1bmsuZGF0YSwgKHgsIHksIHopID0+IGdldFZveGVsKHdvcmxkLCBveCArIHgsIFlfTUlOICsgeSwgb3ogKyB6KSk7XG59XG5cbi8qKlxuICogR3JlZWR5IDNEIGZhY2UgbWVzaGVyIChzeW5jaHJvbm91cyBwYXRoKS4gQSBmYWNlIGlzIGVtaXR0ZWQgd2hlbiBhbiBvcGFxdWVcbiAqIHZveGVsIHRvdWNoZXMgYSBub24tb3BhcXVlIGNlbGwgKGFpciBvciB3YXRlcik7IHdhdGVyIHN1cmZhY2VzIGFyZSBtZXNoZWRcbiAqIHNlcGFyYXRlbHkgaW4gd2F0ZXIudHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXNoQ2h1bmsod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IE1lc2hSZXN1bHQge1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgcmV0dXJuIGdlb21ldHJ5RnJvbUFycmF5cyhtZXNoUGFkZGVkKHBhZGRlZEZvcih3b3JsZCwgY2h1bmspLCBjaHVuay5oZWlnaHRzLCBveCwgb3osIHdvcmxkLnNlZWQpKTtcbn1cblxuLyoqXG4gKiBHcmlkIGxpbmVzIG9mIHRoZSBzZWEgcGxhbmU6IHRoZSBvcmlnaW5hbCBgc2VnbWVudHNgIGxhdHRpY2Ugb3ZlciB0aGVcbiAqIGlzbGFuZCBwbHVzIHR3byBjZWxscyBvZiBtYXJnaW4gKHNhbWUgdmVydGljZXMsIHNvIHRoZSBzYW1lIGNvbG91cnMpLCB0aGVuXG4gKiBsaW5lcyB0aGF0IGRvdWJsZSB0aGVpciBzcGFjaW5nIG91dCB0byB0aGUgcGxhbmUgZWRnZS4gT3BlbiBvY2VhbiBmYXJcbiAqIGJleW9uZCB0aGUgMjA0OCBtIGlzbGFuZCBpcyBmbGF0LCBmb2dnZWQgYW5kIG5lZWRzIG5vIDIwOCBtIHZlcnRleCBncmlkO1xuICogdGhpcyBrZWVwcyB0aGUgbmVhciBwYXR0ZXJuIGFuZCBkcm9wcyBhYm91dCA5MCUgb2YgdGhlIHRyaWFuZ2xlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyR3JpZExpbmVzKHNpemU6IG51bWJlciwgc2VnbWVudHM6IG51bWJlcik6IG51bWJlcltdIHtcbiAgY29uc3Qgc2VnID0gc2l6ZSAvIHNlZ21lbnRzLCBjb29yZCA9IChrOiBudW1iZXIpID0+IC1zaXplIC8gMiArIGsgKiBzZWc7XG4gIGNvbnN0IGlubmVyOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBrID0gMDsgayA8PSBzZWdtZW50czsgaysrKSBpZiAoTWF0aC5hYnMoY29vcmQoaykpIDw9IEhBTEYgKyAyICogc2VnKSBpbm5lci5wdXNoKGspO1xuICBpZiAoaW5uZXIubGVuZ3RoID09PSAwKSByZXR1cm4gWzAsIHNlZ21lbnRzXS5tYXAoY29vcmQpO1xuICBjb25zdCBrZWVwID0gbmV3IFNldChpbm5lcik7XG4gIGZvciAobGV0IGsgPSBpbm5lclswXSwgcyA9IDE7IGsgPiAwOyBzICo9IDIpIHsgayA9IE1hdGgubWF4KDAsIGsgLSBzKTsga2VlcC5hZGQoayk7IH1cbiAgZm9yIChsZXQgayA9IGlubmVyW2lubmVyLmxlbmd0aCAtIDFdLCBzID0gMTsgayA8IHNlZ21lbnRzOyBzICo9IDIpIHsgayA9IE1hdGgubWluKHNlZ21lbnRzLCBrICsgcyk7IGtlZXAuYWRkKGspOyB9XG4gIHJldHVybiBbLi4ua2VlcF0uc29ydCgoYSwgYikgPT4gYSAtIGIpLm1hcChjb29yZCk7XG59XG5cbmZ1bmN0aW9uIHdhdGVyR3JpZEdlb21ldHJ5KHNpemU6IG51bWJlciwgc2VnbWVudHM6IG51bWJlcik6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3QgbGluZXMgPSB3YXRlckdyaWRMaW5lcyhzaXplLCBzZWdtZW50cyksIG4gPSBsaW5lcy5sZW5ndGg7XG4gIGNvbnN0IHBvc2l0aW9ucyA9IG5ldyBGbG9hdDMyQXJyYXkobiAqIG4gKiAzKSwgbm9ybWFscyA9IG5ldyBGbG9hdDMyQXJyYXkobiAqIG4gKiAzKTtcbiAgZm9yIChsZXQgaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgY29uc3QgdiA9IChqICogbiArIGkpICogMztcbiAgICAgIHBvc2l0aW9uc1t2XSA9IGxpbmVzW2ldOyBwb3NpdGlvbnNbdiArIDJdID0gbGluZXNbal07XG4gICAgICBub3JtYWxzW3YgKyAxXSA9IDE7XG4gICAgfVxuICB9XG4gIGNvbnN0IGluZGljZXM6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGogPSAwOyBqIDwgbiAtIDE7IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbiAtIDE7IGkrKykge1xuICAgICAgY29uc3QgYSA9IGogKiBuICsgaSwgYiA9IChqICsgMSkgKiBuICsgaSwgYyA9IGEgKyAxLCBkID0gYiArIDE7XG4gICAgICBpbmRpY2VzLnB1c2goYSwgYiwgYywgYywgYiwgZCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGdlbyA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICBnZW8uc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUocG9zaXRpb25zLCAzKSk7XG4gIGdlby5zZXRBdHRyaWJ1dGUoJ25vcm1hbCcsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUobm9ybWFscywgMykpO1xuICBnZW8uc2V0SW5kZXgoaW5kaWNlcyk7XG4gIGdlby5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgcmV0dXJuIGdlbztcbn1cblxuLyoqIE9uZSBvcGFxdWUgc2VhLWxldmVsIHN1cmZhY2UgZm9yIHRoZSB3aG9sZSB2aWV3LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkV2F0ZXJTdXJmYWNlKHdvcmxkOiBXb3JsZCwgc2l6ZSA9IDIwMDAwLCBzZWdtZW50cyA9IDk2KTogVEhSRUUuTWVzaCB7XG4gIGNvbnN0IGdlbyA9IHdhdGVyR3JpZEdlb21ldHJ5KHNpemUsIHNlZ21lbnRzKTtcbiAgY29uc3QgcG9zID0gZ2VvLmF0dHJpYnV0ZXMucG9zaXRpb247XG4gIGNvbnN0IGNvbG9ycyA9IG5ldyBGbG9hdDMyQXJyYXkocG9zLmNvdW50ICogMyk7XG4gIGNvbnN0IHRtcCA9IG5ldyBUSFJFRS5Db2xvcigpO1xuICBjb25zdCBzbW9vdGhzdGVwID0gKGE6IG51bWJlciwgYjogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgICBjb25zdCB0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgKHggLSBhKSAvIChiIC0gYSkpKTtcbiAgICByZXR1cm4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcbiAgfTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwb3MuY291bnQ7IGkrKykge1xuICAgIGNvbnN0IHggPSBwb3MuZ2V0WChpKSwgeiA9IHBvcy5nZXRaKGkpO1xuICAgIC8vIFRoZSB3YXRlciBwbGFuZSBzYW1wbGVzIHRoZSBzZWFiZWQgb25seSBmb3IgYSBuYXJyb3cgc2hvcmUgcmltLiBBIGRlcHRoXG4gICAgLy8gcmFtcCBvbiBhIDQ3IG0gZ3JpZCBtaXNzZWQgdGhlIDEwIG0gcml2ZXIgZW50aXJlbHkgYW5kIHR1cm5lZCBpdCB3aGl0ZTtcbiAgICAvLyB0aGUgcml2ZXIgYW5kIGxha2UgcmVhZCBiZXR0ZXIgYXMgdGhlIHNhbWUgZGVlcCB3YXRlciBhcyB0aGUgc2VhLlxuICAgIGNvbnN0IGggPSBiYXNlSGVpZ2h0QXQod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIE1hdGgucm91bmQoeCksIE1hdGgucm91bmQoeikpO1xuICAgIGNvbnN0IHNob3JlID0gc21vb3Roc3RlcCgtMC45LCAtMC4xNSwgaCkgKiAoMSAtIHNtb290aHN0ZXAoLTAuMTUsIDAuNCwgaCkpO1xuICAgIGNvbnN0IG4gPSBoYXNoMmkoTWF0aC5mbG9vcih4IC8gNDUpLCBNYXRoLmZsb29yKHogLyA0NSksIHdvcmxkLnNlZWQgKyA1MDEpO1xuICAgIHRtcC5jb3B5KENPTC53YXRlck1pZCkubGVycChDT0wud2F0ZXJEZWVwLCAwLjM1ICsgMC4zNSAqIG4pO1xuICAgIC8vIEEgd2VhayBzaG9yZSB0aW50LiBBIHN0cm9uZyBvbmUsIHNhbXBsZWQgb24gYSBjb2Fyc2UgcGxhbmUsIHByb2R1Y2VkXG4gICAgLy8gcGFsZSByZWN0YW5nbGVzIG92ZXIgb2Zmc2hvcmUgc2VhbW91bnRzIGluIHRoZSBtYXAgdmlldy5cbiAgICB0bXAubGVycChDT0wud2F0ZXJSaW0sIHNob3JlICogMC4xNSk7XG4gICAgY29sb3JzW2kgKiAzXSA9IHRtcC5yOyBjb2xvcnNbaSAqIDMgKyAxXSA9IHRtcC5nOyBjb2xvcnNbaSAqIDMgKyAyXSA9IHRtcC5iO1xuICB9XG4gIGdlby5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShjb2xvcnMsIDMpKTtcbiAgLy8gT3BhcXVlOiB0aGUgc2VhLWxldmVsIHN1cmZhY2UgaXMgdGhlIHdhdGVyIHJlYWQuIEEgdHJhbnNsdWNlbnQgcGxhbmUgbGV0XG4gIC8vIHRoZSBtYWNybyBzZWFiZWQgc2hvdyB0aHJvdWdoLCB3aGljaCBtYWRlIHRoZSBmaW5pdGUgMjA0OCBtIHdvcmxkIGVkZ2VcbiAgLy8gdmlzaWJsZSBhcyBhIHNxdWFyZSBpbiB0aGUgZmlyc3QgTTAwMSBtYXAgY2FwdHVyZS5cbiAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlbywgbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICAgIHZlcnRleENvbG9yczogdHJ1ZSxcbiAgfSkpO1xuICBtZXNoLnBvc2l0aW9uLnkgPSAtMC4wNjtcbiAgbWVzaC5yZW5kZXJPcmRlciA9IDE7XG4gIG1lc2gubmFtZSA9ICd3YXRlcl9zdXJmYWNlJztcbiAgbWVzaC5yZWNlaXZlU2hhZG93ID0gZmFsc2U7XG4gIHJldHVybiBtZXNoO1xufVxuXG5pbnRlcmZhY2UgTWFjcm9Ib2xlIHsgbWluWDogbnVtYmVyOyBtYXhYOiBudW1iZXI7IG1pblo6IG51bWJlcjsgbWF4WjogbnVtYmVyOyB9XG4vKipcbiAqIERpc3RhbmNlIHRpZXJzIG9mIHRoZSB3b3JsZC12aWV3IG1hY3JvIG1lc2guIENlbGxzIHdpdGhpbiBgZmluZWAgbWV0cmVzXG4gKiAoQ2hlYnlzaGV2IGRpc3RhbmNlIG9mIHRoZWlyIGJsb2NrIGZyb20gdGhlIGZvY3VzKSBrZWVwIHRoZSBiYXNlIHN0ZXAsXG4gKiBjZWxscyB3aXRoaW4gYG1pZGAgbWV0cmVzIG1lcmdlIDJ4MiwgY2VsbHMgYmV5b25kIG1lcmdlIDR4NC4gQmxvY2tzIGFyZVxuICogNCBiYXNlIGNlbGxzIHdpZGUsIHNvIHRpZXIgYm91bmRhcmllcyBuZXZlciBzcGxpdCBhIGNvYXJzZSBjZWxsLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIE1hY3JvVGllcnMgeyBmaW5lOiBudW1iZXI7IG1pZDogbnVtYmVyIH1cbmV4cG9ydCBjb25zdCBERUZBVUxUX01BQ1JPX1RJRVJTOiBNYWNyb1RpZXJzID0geyBmaW5lOiA0NDgsIG1pZDogODk2IH07XG4vKiogU2lkZSAobSkgb2YgYSB3b3JsZC12aWV3IG1hY3JvIHRpbGU7IHRpbGVzIG91dHNpZGUgdGhlIGNhbWVyYSBmcnVzdHVtIGFyZSBub3QgZHJhd24uICovXG5leHBvcnQgY29uc3QgTUFDUk9fVElMRSA9IDI1NjtcblxuaW50ZXJmYWNlIE1hY3JvT3B0aW9ucyB7XG4gIHN0ZXA6IG51bWJlcjtcbiAgLyoqIFJlY3Rhbmd1bGFyIGhvbGUgY292ZXJlZCBieSB0aGUgbmVhciAxIG0gY2h1bmsgcmluZy4gKi9cbiAgaG9sZT86IE1hY3JvSG9sZTtcbiAgLyoqIFdvcmxkIHZpZXcgZm9jdXM7IHdpdGggaXQsIGZhciBjZWxscyB1c2UgY29hcnNlciB0aWVycyAobWFwIG1vZGUgcGFzc2VzIG5vbmUpLiAqL1xuICBmb2N1cz86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgdGllcnM/OiBNYWNyb1RpZXJzO1xufVxuXG5pbnRlcmZhY2UgTWFjcm9SZXN1bHQge1xuICAvKiogVGhlIHdob2xlIG1lc2ggd2hlbiB1bnRpbGVkIChubyBmb2N1cyk7IG90aGVyd2lzZSB0aGUgZmlyc3QgdGlsZS4gKi9cbiAgbWVzaDogVEhSRUUuTWVzaDtcbiAgLyoqIEV2ZXJ5IHRpbGUgbWVzaCAob25lIHdoZW4gdW50aWxlZCksIGVhY2ggd2l0aCBhIGJvdW5kaW5nIGJveCBmb3IgY3VsbGluZy4gKi9cbiAgbWVzaGVzOiBUSFJFRS5NZXNoW107XG4gIHRyaWFuZ2xlczogbnVtYmVyO1xuICBzYW1wbGVNczogbnVtYmVyO1xuICB0b3RhbE1zOiBudW1iZXI7XG4gIHNhbXBsZUNhY2hlZDogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIE1hY3JvU2FtcGxlQ2FjaGUge1xuICBOOiBudW1iZXI7XG4gIGhlaWdodHM6IEludDE2QXJyYXk7XG4gIHRvcHM6IFVpbnQ4QXJyYXk7XG4gIHVuZGVyd2F0ZXI6IFVpbnQ4QXJyYXk7XG4gIHNhbXBsZU1zOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWFjcm9UZXJyYWluU2FtcGxlIHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB0b3A6IE1hdElkOyB1bmRlcndhdGVyOiBib29sZWFuOyB9XG5cbi8vIENhY2hlIHRoZSBkZXRlcm1pbmlzdGljIGJhc2UgZ3JpZCBhbmQgdGhlIGF1dGhvcml0YXRpdmUgZWRpdGVkIGdyaWQgc2VwYXJhdGVseS5cbi8vIEJhc2UgZW50cmllcyBuZXZlciBuZWVkIGludmFsaWRhdGlvbi4gRWRpdGVkIGVudHJpZXMgYXJlIHNjb3BlZCBieSBXb3JsZCBpZGVudGl0eVxuLy8gKHR3byBzYW1lLXNlZWQgd29ybGRzIGNhbiBoYXZlIGRpZmZlcmVudCBlZGl0cykgYW5kIGJ5IGJvdGggdGhlIGNvYXJzZSBlZGl0XG4vLyByZXZpc2lvbiBhbmQgY2h1bmsgc3RyZWFtaW5nLCBzaW5jZSBldmljdGluZy9yZWdlbmVyYXRpbmcgZGF0YSBhbmQgc25hcHNob3Rcbi8vIHJlc3RvcmF0aW9uIGRvIG5vdCBuZWNlc3NhcmlseSBwcm9kdWNlIGEgbmV3IGNvYXJzZSByZXZpc2lvbi4gT25seSBjaHVua3Mgd2l0aFxuLy8gZHVyYWJsZSB2b3hlbCBkZWx0YXMgYXJlIG1hdGVyaWFsaXplZDsgdGhlIG90aGVyIDY0eDY0IGNlbGxzIHJlbWFpbiBiYXNlIHNhbXBsZXMuXG5pbnRlcmZhY2UgTWFjcm9Xb3JsZENhY2hlcyB7XG4gIGJhc2U6IE1hcDxudW1iZXIsIE1hY3JvU2FtcGxlQ2FjaGU+O1xuICBlZGl0ZWQ6IE1hcDxzdHJpbmcsIE1hY3JvU2FtcGxlQ2FjaGU+O1xuICAvKiogU3BhcnNlIGF1dGhvcml0YXRpdmUgY29sdW1ucywgaW5kZXBlbmRlbnQgb2YgdGhlIG1lc2ggc2FtcGxpbmcgcmVzb2x1dGlvbi4gKi9cbiAgY29sdW1uczogTWFwPHN0cmluZywgTWFwPG51bWJlciwgeyBoZWlnaHQ6IG51bWJlcjsgdG9wOiBNYXRJZCB9Pj47XG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5jb25zdCBtYWNyb1NhbXBsZUNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hY3JvV29ybGRDYWNoZXM+KCk7XG5cbmZ1bmN0aW9uIHN5bmNNYWNyb0NvbHVtbnMod29ybGQ6IFdvcmxkLCBjYWNoZXM6IE1hY3JvV29ybGRDYWNoZXMpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLnJldmlzaW9uID09PSBjYWNoZXMucmV2aXNpb24pIHJldHVybjtcbiAgLy8gU25hcHNob3QgcmVzdG9yZSByZXBsYWNlcyBlZGl0cyBhbmQgY2h1bmtzIGJlZm9yZSBhc3NpZ25pbmcgaXRzIHNhdmVkXG4gIC8vIHJldmlzaW9uLiBOZXZlciBtaXggcmVtZW1iZXJlZCBjb2x1bW5zIGZyb20gdGhhdCBwcmV2aW91cyB3b3JsZCBzdGF0ZS5cbiAgY2FjaGVzLmNvbHVtbnMuY2xlYXIoKTtcbiAgLy8gQSBub3JtYWwgZWRpdCBoYXMgYWxyZWFkeSB1cGRhdGVkIHRoZSBsb2FkZWQgY2h1bmssIHNvIGl0IGNvc3RzIG9ubHkgdGhlXG4gIC8vIGVkaXRlZCBjaHVua3MuIFJlc3RvcmVkL2V2aWN0ZWQgZWRpdGVkIGNodW5rcyBhcmUgZ2VuZXJhdGVkIG9uIGRlbWFuZC5cbiAgZm9yIChjb25zdCBba2V5LCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBpZiAoIWVkaXRzLnNpemUgfHwgIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgY29udGludWU7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSkhO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBuZXcgTWFwPG51bWJlciwgeyBoZWlnaHQ6IG51bWJlcjsgdG9wOiBNYXRJZCB9PigpO1xuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgICAgY29sdW1ucy5zZXQoKG94ICsgbHggKyBIQUxGKSAqIFdPUkxEX1NJWkUgKyBveiArIGx6ICsgSEFMRiwge1xuICAgICAgICAgIGhlaWdodDogY2h1bmsuaGVpZ2h0c1tjb2xdICsgWV9NSU4gKyAxLFxuICAgICAgICAgIHRvcDogY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gYXMgTWF0SWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBjYWNoZXMuY29sdW1ucy5zZXQoa2V5LCBjb2x1bW5zKTtcbiAgfVxuICBjYWNoZXMuZWRpdGVkLmNsZWFyKCk7XG4gIGNhY2hlcy5yZXZpc2lvbiA9IHdvcmxkLnJldmlzaW9uO1xufVxuXG5mdW5jdGlvbiBtYWNyb0NvbHVtbih3b3JsZDogV29ybGQsIGNhY2hlczogTWFjcm9Xb3JsZENhY2hlcywga2V5OiBzdHJpbmcsIGluZGV4OiBudW1iZXIpIHtcbiAgbGV0IGNvbHVtbnMgPSBjYWNoZXMuY29sdW1ucy5nZXQoa2V5KTtcbiAgaWYgKGNvbHVtbnMpIHJldHVybiBjb2x1bW5zLmdldChpbmRleCk7XG4gIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGlmICghZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeikpIHJldHVybiB1bmRlZmluZWQ7XG4gIC8vIENhcHR1cmUgb25jZSBhZnRlciBsb2FkaW5nLiBMb2FkZWQgY2h1bmtzIGFyZSBjaGVhcCBhbmQgZG8gbm90IHJlcXVpcmVcbiAgLy8gd2Fsa2luZyBldmVyeSB2b3hlbDsgdGhpcyByZW1haW5zIE8oMzJ4MzIpIHBlciBlZGl0ZWQgY2h1bmsuXG4gIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpITtcbiAgY29sdW1ucyA9IG5ldyBNYXAoKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5zZXQoKG94ICsgbHggKyBIQUxGKSAqIFdPUkxEX1NJWkUgKyBveiArIGx6ICsgSEFMRiwge1xuICAgICAgICBoZWlnaHQ6IGNodW5rLmhlaWdodHNbY29sXSArIFlfTUlOICsgMSxcbiAgICAgICAgdG9wOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSBhcyBNYXRJZCxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBjYWNoZXMuY29sdW1ucy5zZXQoa2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnMuZ2V0KGluZGV4KTtcbn1cblxuY29uc3QgbWFjcm9FZGl0S2V5TWVtbyA9IG5ldyBXZWFrTWFwPFdvcmxkLCB7IHZlcnNpb246IG51bWJlcjsga2V5OiBzdHJpbmcgfT4oKTtcblxuLyoqIE1lbW9pemVkIGJ5IHRoZSB3b3JsZCdzIGVkaXQgdmVyc2lvbjogTygxKSBwZXIgZnJhbWUgdW5sZXNzIGVkaXRzIGNoYW5nZWQuICovXG5mdW5jdGlvbiBtYWNyb0VkaXRLZXkod29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgY29uc3QgdmVyc2lvbiA9IGVkaXRWZXJzaW9uKHdvcmxkKTtcbiAgY29uc3QgbWVtbyA9IG1hY3JvRWRpdEtleU1lbW8uZ2V0KHdvcmxkKTtcbiAgaWYgKG1lbW8gJiYgbWVtby52ZXJzaW9uID09PSB2ZXJzaW9uKSByZXR1cm4gbWVtby5rZXk7XG4gIGNvbnN0IGtleSA9IGNvbXB1dGVNYWNyb0VkaXRLZXkod29ybGQpO1xuICBtYWNyb0VkaXRLZXlNZW1vLnNldCh3b3JsZCwgeyB2ZXJzaW9uLCBrZXkgfSk7XG4gIHJldHVybiBrZXk7XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVNYWNyb0VkaXRLZXkod29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgLy8gSW5jbHVkZSBhIGNvbW11dGF0aXZlIGNvbnRlbnQgZmluZ2VycHJpbnQgYXMgd2VsbCBhcyBjb3VudDogZXZpY3Rpb24gYW5kXG4gIC8vIHNuYXBzaG90IHJlc3RvcmUgYnlwYXNzIHRoZSBjb2Fyc2UgV29ybGQucmV2aXNpb24gcGF0aCwgYW5kIGEgcmVzdG9yZWRcbiAgLy8gZGVsdGEgY2FuIGhhdmUgdGhlIHNhbWUgbnVtYmVyIG9mIGNlbGxzIHdpdGggZGlmZmVyZW50IGluZGljZXMvbWF0ZXJpYWxzLlxuICByZXR1cm4gWy4uLndvcmxkLmVkaXRzLmVudHJpZXMoKV1cbiAgICAuZmlsdGVyKChbLCBlZGl0c10pID0+IGVkaXRzLnNpemUgPiAwKVxuICAgIC5tYXAoKFtrZXksIGVkaXRzXSkgPT4ge1xuICAgICAgbGV0IHN1bSA9IDA7XG4gICAgICBsZXQgbWl4ZWQgPSAwO1xuICAgICAgZm9yIChjb25zdCBbaW5kZXgsIG1hdGVyaWFsXSBvZiBlZGl0cykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IE1hdGguaW11bChpbmRleCArIDEsIDMxKSArIG1hdGVyaWFsO1xuICAgICAgICBzdW0gPSAoc3VtICsgdmFsdWUpIHwgMDtcbiAgICAgICAgbWl4ZWQgPSAobWl4ZWQgXiBNYXRoLmltdWwodmFsdWUsIDB4NDVkOWYzYikpIHwgMDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJHtrZXl9OiR7ZWRpdHMuc2l6ZX06JHtzdW19OiR7bWl4ZWR9YDtcbiAgICB9KVxuICAgIC5zb3J0KClcbiAgICAuam9pbignfCcpO1xufVxuXG5mdW5jdGlvbiBlZGl0ZWRNYWNyb1NhbXBsZXMod29ybGQ6IFdvcmxkLCBzdGVwOiBudW1iZXIsIGNhY2hlOiBNYWNyb1NhbXBsZUNhY2hlKTogTWFjcm9TYW1wbGVDYWNoZSB7XG4gIGNvbnN0IGNhY2hlcyA9IG1hY3JvU2FtcGxlQ2FjaGUuZ2V0KHdvcmxkKSE7XG4gIGNvbnN0IGtleSA9IGAke3N0ZXB9OiR7bWFjcm9FZGl0S2V5KHdvcmxkKX1gO1xuICBjb25zdCBjYWNoZWQgPSBjYWNoZXMuZWRpdGVkLmdldChrZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuXG4gIGZvciAoY29uc3QgW2NodW5rLCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBpZiAoZWRpdHMuc2l6ZSAmJiAhY2FjaGVzLmNvbHVtbnMuaGFzKGNodW5rKSkgbWFjcm9Db2x1bW4od29ybGQsIGNhY2hlcywgY2h1bmssIDApO1xuICB9XG5cbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgeyBOLCBoZWlnaHRzLCB0b3BzLCB1bmRlcndhdGVyIH0gPSBjYWNoZTtcbiAgY29uc3Qgc2FtcGxlID0ge1xuICAgIE4sXG4gICAgaGVpZ2h0czogbmV3IEludDE2QXJyYXkoaGVpZ2h0cyksXG4gICAgdG9wczogbmV3IFVpbnQ4QXJyYXkodG9wcyksXG4gICAgdW5kZXJ3YXRlcjogbmV3IFVpbnQ4QXJyYXkodW5kZXJ3YXRlciksXG4gICAgc2FtcGxlTXM6IGNhY2hlLnNhbXBsZU1zLFxuICB9O1xuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCB4ID0gTWF0aC5yb3VuZCgtSEFMRiArIChpICsgMC41KSAqIHN0ZXApO1xuICAgICAgY29uc3QgeiA9IE1hdGgucm91bmQoLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwKTtcbiAgICAgIGNvbnN0IGNodW5rID0gY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk7XG4gICAgICBpZiAoIXdvcmxkLmVkaXRzLmdldChjaHVuayk/LnNpemUpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgaWR4ID0gaiAqIE4gKyBpO1xuICAgICAgY29uc3QgZWRpdGVkID0gbWFjcm9Db2x1bW4od29ybGQsIGNhY2hlcywgY2h1bmssICh4ICsgSEFMRikgKiBXT1JMRF9TSVpFICsgeiArIEhBTEYpO1xuICAgICAgaWYgKCFlZGl0ZWQpIGNvbnRpbnVlO1xuICAgICAgc2FtcGxlLmhlaWdodHNbaWR4XSA9IGVkaXRlZC5oZWlnaHQ7XG4gICAgICBzYW1wbGUudG9wc1tpZHhdID0gZWRpdGVkLnRvcDtcbiAgICAgIHNhbXBsZS51bmRlcndhdGVyW2lkeF0gPSBzYW1wbGUuaGVpZ2h0c1tpZHhdIDwgU0VBX0xFVkVMID8gMSA6IDA7XG4gICAgfVxuICB9XG4gIHNhbXBsZS5zYW1wbGVNcyA9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gIGNhY2hlcy5lZGl0ZWQuc2V0KGtleSwgc2FtcGxlKTtcbiAgcmV0dXJuIHNhbXBsZTtcbn1cblxuZnVuY3Rpb24gbWFjcm9TYW1wbGVzKHdvcmxkOiBXb3JsZCwgc3RlcDogbnVtYmVyKTogTWFjcm9TYW1wbGVDYWNoZSB7XG4gIGxldCBjYWNoZXMgPSBtYWNyb1NhbXBsZUNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGVzKSB7XG4gICAgY2FjaGVzID0geyBiYXNlOiBuZXcgTWFwKCksIGVkaXRlZDogbmV3IE1hcCgpLCBjb2x1bW5zOiBuZXcgTWFwKCksIHJldmlzaW9uOiAtMSB9O1xuICAgIG1hY3JvU2FtcGxlQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZXMpO1xuICB9XG4gIHN5bmNNYWNyb0NvbHVtbnMod29ybGQsIGNhY2hlcyk7XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlcy5iYXNlLmdldChzdGVwKTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGVkaXRlZE1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCwgY2FjaGVkKTtcblxuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBOID0gTWF0aC5jZWlsKFdPUkxEX1NJWkUgLyBzdGVwKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBJbnQxNkFycmF5KE4gKiBOKTtcbiAgY29uc3QgdG9wcyA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgdW5kZXJ3YXRlciA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgY2VsbFggPSAoaTogbnVtYmVyKSA9PiAtSEFMRiArIChpICsgMC41KSAqIHN0ZXA7XG4gIGNvbnN0IGNlbGxaID0gKGo6IG51bWJlcikgPT4gLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwO1xuXG4gIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgIGNvbnN0IHggPSBjZWxsWChpKSwgeiA9IGNlbGxaKGopO1xuICAgICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgTWF0aC5yb3VuZCh4KSwgTWF0aC5yb3VuZCh6KSk7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBoZWlnaHRzW2lkeF0gPSBoO1xuICAgICAgaWYgKGggPCBTRUFfTEVWRUwpIHVuZGVyd2F0ZXJbaWR4XSA9IDE7XG4gICAgfVxuICB9XG5cbiAgZm9yIChsZXQgaiA9IDA7IGogPCBOOyBqKyspIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgY29uc3QgaWR4ID0gaiAqIE4gKyBpO1xuICAgICAgaWYgKHVuZGVyd2F0ZXJbaWR4XSkgY29udGludWU7XG4gICAgICBjb25zdCBoID0gaGVpZ2h0c1tpZHhdO1xuICAgICAgY29uc3QgeCA9IGNlbGxYKGkpLCB6ID0gY2VsbFooaik7XG4gICAgICBsZXQgc2xvcGUgPSAwO1xuICAgICAgbGV0IG5lYXJXYXRlciA9IGZhbHNlO1xuICAgICAgY29uc3QgbnMgPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBucykge1xuICAgICAgICBjb25zdCBueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKE4gLSAxLCBpICsgZHgpKTtcbiAgICAgICAgY29uc3QgbnogPSBNYXRoLm1heCgwLCBNYXRoLm1pbihOIC0gMSwgaiArIGR6KSk7XG4gICAgICAgIGNvbnN0IG5oID0gaGVpZ2h0c1tueiAqIE4gKyBueF07XG4gICAgICAgIHNsb3BlID0gTWF0aC5tYXgoc2xvcGUsIE1hdGguYWJzKGggLSBuaCkpO1xuICAgICAgICBpZiAobmggPCBTRUFfTEVWRUwgKyAxKSBuZWFyV2F0ZXIgPSB0cnVlO1xuICAgICAgfVxuICAgICAgdG9wc1tpZHhdID0gYmFzZVRvcE1hdGVyaWFsRm9yKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgICAgICBNYXRoLnJvdW5kKHgpLCBNYXRoLnJvdW5kKHopLCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBjYWNoZTogTWFjcm9TYW1wbGVDYWNoZSA9IHtcbiAgICBOLCBoZWlnaHRzLCB0b3BzLCB1bmRlcndhdGVyLFxuICAgIHNhbXBsZU1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHQwLFxuICB9O1xuICBjYWNoZXMuYmFzZS5zZXQoc3RlcCwgY2FjaGUpO1xuICByZXR1cm4gZWRpdGVkTWFjcm9TYW1wbGVzKHdvcmxkLCBzdGVwLCBjYWNoZSk7XG59XG5cbi8qKiBBdXRob3JpdGF0aXZlIG1hY3JvLWdyaWQgdmFsdWUgYXQgYSB3b3JsZCBjb2x1bW4gKHN0ZXAgZGVmYXVsdHMgdG8gOCBtKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgc3RlcCA9IDgpOiBNYWNyb1RlcnJhaW5TYW1wbGUge1xuICBjb25zdCBjYWNoZSA9IG1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCk7XG4gIGNvbnN0IGkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjYWNoZS5OIC0gMSwgTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gc3RlcCkpKTtcbiAgY29uc3QgaiA9IE1hdGgubWF4KDAsIE1hdGgubWluKGNhY2hlLk4gLSAxLCBNYXRoLmZsb29yKCh6ICsgSEFMRikgLyBzdGVwKSkpO1xuICBjb25zdCBpZHggPSBqICogY2FjaGUuTiArIGk7XG4gIHJldHVybiB7XG4gICAgeDogLUhBTEYgKyAoaSArIDAuNSkgKiBzdGVwLFxuICAgIHo6IC1IQUxGICsgKGogKyAwLjUpICogc3RlcCxcbiAgICBoZWlnaHQ6IGNhY2hlLmhlaWdodHNbaWR4XSwgdG9wOiBjYWNoZS50b3BzW2lkeF0gYXMgTWF0SWQsXG4gICAgdW5kZXJ3YXRlcjogY2FjaGUudW5kZXJ3YXRlcltpZHhdICE9PSAwLFxuICB9O1xufVxuXG4vKipcbiAqIEZhciBsYW5kc2NhcGUgTE9EIGRlcml2ZWQgZnJvbSB0aGUgc2FtZSBkZXRlcm1pbmlzdGljIHN1cmZhY2Ugc2FtcGxlci5cbiAqIENlbGxzIGJlbG93IHNlYSBsZXZlbCBhcmUgb21pdHRlZDogdGhlIG9wYXF1ZSB3YXRlciBzdXJmYWNlIGlzIHRoZSBvbmx5XG4gKiB3YXRlciByZWFkLCBzbyB0aGUgZmluaXRlIDIwNDggbSB3b3JsZCBjYW5ub3QgYXBwZWFyIGFzIGEgc3F1YXJlIHNlYWJlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTWFjcm9NZXNoKHdvcmxkOiBXb3JsZCwgb3B0czogTWFjcm9PcHRpb25zKTogTWFjcm9SZXN1bHQge1xuICBjb25zdCB0b3RhbFQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IHsgc3RlcCwgaG9sZSB9ID0gb3B0cztcbiAgY29uc3QgY2FjaGVLZXkgPSBgJHtzdGVwfToke21hY3JvRWRpdEtleSh3b3JsZCl9YDtcbiAgY29uc3Qgc2FtcGxlQ2FjaGVkID0gbWFjcm9TYW1wbGVDYWNoZS5nZXQod29ybGQpPy5lZGl0ZWQuaGFzKGNhY2hlS2V5KSA/PyBmYWxzZTtcbiAgY29uc3QgY2FjaGUgPSBtYWNyb1NhbXBsZXMod29ybGQsIHN0ZXApO1xuICBjb25zdCB7IE4sIGhlaWdodHMsIHRvcHMsIHVuZGVyd2F0ZXIgfSA9IGNhY2hlO1xuICBjb25zdCBob2xlQ2VsbCA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgY2VsbFggPSAoaTogbnVtYmVyKSA9PiAtSEFMRiArIChpICsgMC41KSAqIHN0ZXA7XG4gIGNvbnN0IGNlbGxaID0gKGo6IG51bWJlcikgPT4gLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwO1xuXG4gIGlmIChob2xlKSB7XG4gICAgZm9yIChsZXQgaiA9IDA7IGogPCBOOyBqKyspIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHggPSBjZWxsWChpKSwgeiA9IGNlbGxaKGopO1xuICAgICAgICBpZiAoeCA+IGhvbGUubWluWCAmJiB4IDwgaG9sZS5tYXhYICYmIHogPiBob2xlLm1pblogJiYgeiA8IGhvbGUubWF4Wikge1xuICAgICAgICAgIGhvbGVDZWxsW2ogKiBOICsgaV0gPSAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3Qgc2FtcGxlTXMgPSBzYW1wbGVDYWNoZWQgPyAwIDogY2FjaGUuc2FtcGxlTXM7XG4gIC8vIFdpdGggYSBmb2N1cyB0aGUgbWVzaCBpcyBzcGxpdCBpbnRvIE1BQ1JPX1RJTEUgc3F1YXJlIHRpbGVzIHNvIHRoZSB2aWV3XG4gIC8vIGNhbiBza2lwIHRpbGVzIG91dHNpZGUgdGhlIGNhbWVyYSBmcnVzdHVtIChWb3hlbFRlcnJhaW5WaWV3LmN1bGxNYWNybykuXG4gIC8vIFdpdGhvdXQgb25lIChtYXAgbW9kZSwgdGVzdHMpIGl0IHN0YXlzIGEgc2luZ2xlIG1lc2guXG4gIGNvbnN0IHRpbGVDZWxscyA9IG9wdHMuZm9jdXMgPyBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKE1BQ1JPX1RJTEUgLyBzdGVwKSkgOiBOO1xuICBjb25zdCB0aWxlc1BlclNpZGUgPSBNYXRoLmNlaWwoTiAvIHRpbGVDZWxscyk7XG4gIHR5cGUgVGlsZUJ1ZmZlcnMgPSB7IHBvc2l0aW9uczogbnVtYmVyW107IG5vcm1hbHM6IG51bWJlcltdOyBjb2xvcnM6IG51bWJlcltdOyBpbmRpY2VzOiBudW1iZXJbXSB9O1xuICBjb25zdCB0aWxlQnVmZmVyczogVGlsZUJ1ZmZlcnNbXSA9IFtdO1xuICBmb3IgKGxldCB0ID0gMDsgdCA8IHRpbGVzUGVyU2lkZSAqIHRpbGVzUGVyU2lkZTsgdCsrKSB0aWxlQnVmZmVycy5wdXNoKHsgcG9zaXRpb25zOiBbXSwgbm9ybWFsczogW10sIGNvbG9yczogW10sIGluZGljZXM6IFtdIH0pO1xuICBsZXQgYnVmID0gdGlsZUJ1ZmZlcnNbMF07XG5cbiAgY29uc3QgcHVzaFF1YWQgPSAocDogbnVtYmVyW11bXSwgbjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdLCBjb2xvcjogVEhSRUUuQ29sb3IpID0+IHtcbiAgICBjb25zdCB7IHBvc2l0aW9ucywgbm9ybWFscywgY29sb3JzLCBpbmRpY2VzIH0gPSBidWY7XG4gICAgY29uc3QgYmFzZSA9IHBvc2l0aW9ucy5sZW5ndGggLyAzO1xuICAgIGZvciAoY29uc3QgdiBvZiBwKSB7XG4gICAgICBwb3NpdGlvbnMucHVzaCh2WzBdLCB2WzFdLCB2WzJdKTtcbiAgICAgIG5vcm1hbHMucHVzaChuWzBdLCBuWzFdLCBuWzJdKTtcbiAgICAgIGNvbG9ycy5wdXNoKGNvbG9yLnIsIGNvbG9yLmcsIGNvbG9yLmIpO1xuICAgIH1cbiAgICBpbmRpY2VzLnB1c2goYmFzZSwgYmFzZSArIDEsIGJhc2UgKyAyLCBiYXNlLCBiYXNlICsgMiwgYmFzZSArIDMpO1xuICB9O1xuXG4gIGNvbnN0IGNlbGxTaGFkZSA9IChpOiBudW1iZXIsIGo6IG51bWJlcikgPT4gMC45NCArIDAuMTIgKiBoYXNoMmkoaSwgaiwgd29ybGQuc2VlZCArIDQwMSk7XG5cbiAgY29uc3QgdG9wQ29sb3IgPSAodG9wOiBNYXRJZCwgaDogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlcik6IFRIUkVFLkNvbG9yID0+IHtcbiAgICBjb25zdCBzaGFkZSA9IGNlbGxTaGFkZShpLCBqKTtcbiAgICBjb25zdCBtb2lzdCA9IGZibTIoY2VsbFgoaSkgLyAxMzAsIGNlbGxaKGopIC8gMTMwLCB3b3JsZC5zZWVkICsgNjAxLCAzKTtcbiAgICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIENPTC5zYW5kLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoc2hhZGUgKiAwLjkwKTtcbiAgICBpZiAodG9wID09PSBNQVQuR1JBVkVMKSByZXR1cm4gQ09MLmdyYXZlbC5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgICBpZiAodG9wID09PSBNQVQuU1RPTkUpIHtcbiAgICAgIHJldHVybiBDT0wuc3RvbmVTaGFkZS5jbG9uZSgpLmxlcnAoQ09MLnN0b25lQiwgMC4zNSArIDAuMjUgKiBzaGFkZSkubXVsdGlwbHlTY2FsYXIoXG4gICAgICAgICgwLjgyICsgMC4xNCAqIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIChoICsgOCkgLyA3MCkpKSAqICgwLjkyICsgMC4wOCAqIHNoYWRlKSxcbiAgICAgICk7XG4gICAgfVxuICAgIGlmICh0b3AgPT09IE1BVC5PUkUpIHJldHVybiBDT0wub3JlLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TTk9XKSByZXR1cm4gQ09MLnNub3cuY2xvbmUoKS5tdWx0aXBseVNjYWxhcigwLjk0ICsgMC4wOCAqIHNoYWRlKTtcbiAgICAvLyBGb3Jlc3QtZmxvb3IgcGF0Y2hlcyBicmVhayB1cCB0aGUgdW5pZm9ybSBncmVlbiBvZiB0aGUgZmFyIExPRC4gVGhleVxuICAgIC8vIGFyZSBhIGNvbG91ciBhcHByb3hpbWF0aW9uLCBub3QgZXh0cmEgZ2VvbWV0cnk7IHRoZSBuZWFyIHJpbmcgaGFzIHJlYWxcbiAgICAvLyBTdHlsIHRyZWVzLlxuICAgIHJldHVybiBDT0wuZ3Jhc3NUb3BbaGVpZ2h0QmFuZChoKV0uY2xvbmUoKVxuICAgICAgLmxlcnAoQ09MLmdyYXNzQ2FwLCAwLjEyICsgMC4zNCAqIG1vaXN0KVxuICAgICAgLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgfTtcblxuICBjb25zdCBzaWRlQ29sb3IgPSAodG9wOiBNYXRJZCwgaDogbnVtYmVyLCBuaDogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlcik6IFRIUkVFLkNvbG9yID0+IHtcbiAgICBjb25zdCBkcm9wID0gaCAtIG5oO1xuICAgIGNvbnN0IHNoYWRlID0gMC45MCArIDAuMTAgKiBoYXNoMmkoaSwgaiwgd29ybGQuc2VlZCArIDQwMik7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBDT0wuc2FuZC5jbG9uZSgpLmxlcnAoQ09MLnN0b25lQiwgZHJvcCA+IDUgPyAwLjU1IDogMC4yKS5tdWx0aXBseVNjYWxhcihzaGFkZSAqIDAuOTIpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSkge1xuICAgICAgcmV0dXJuIENPTC5zdG9uZVNoYWRlLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoXG4gICAgICAgICgwLjgwICsgMC4xNiAqIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIChoICsgOCkgLyA3MCkpKSAqIHNoYWRlLFxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gQSBncmFzcy10b3BwZWQgYmFuayBpcyBub3QgYSBzdG9uZSBjbGlmZiwgaG93ZXZlciB0YWxsIHRoZSA4IG0gbWFjcm9cbiAgICAvLyBjZWxsIG1ha2VzIGl0IGxvb2suIEtlZXBpbmcgdGhlIHNpZGUgaW4gdGhlIHNvaWwgcmFuZ2UgcmVtb3ZlZCB0aGVcbiAgICAvLyBicmlnaHQgd2hpdGUgcXVhcnJ5IHdhbGxzIGFyb3VuZCB0aGUgcml2ZXIgYW5kIGxha2UgaW4gdGhlIHdpZGUgdmlldy5cbiAgICBpZiAoZHJvcCA+IDQpIHJldHVybiBDT0wuZ3Jhc3NDYXAuY2xvbmUoKS5sZXJwKENPTC5vY2hyZSwgMC41NSkubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICAgIHJldHVybiBDT0wuZ3Jhc3NDYXAuY2xvbmUoKS5sZXJwKENPTC5zdG9uZUIsIDAuMjIpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgfTtcblxuICAvLyBDZWxsIGxheW91dC4gV2l0aG91dCBhIGZvY3VzIChtYXAgbW9kZSkgZXZlcnkgY2VsbCBpcyBvbmUgYmFzZSBjZWxsLiBJblxuICAvLyB0aGUgd29ybGQgdmlldywgNHg0LWNlbGwgYmxvY2tzIGZhciBmcm9tIHRoZSBmb2N1cyBtZXJnZSBpbnRvIDJ4MiBvciA0eDRcbiAgLy8gY2VsbHM6IGEgZmFyIGNlbGwgY292ZXJzIHRoZSBzYW1lIGdyb3VuZCB3aXRoIG9uZSB0b3AgYW5kIGZld2VyIHNpZGVzLlxuICAvLyBDb2Fyc2UgY2VsbHMgdGFrZSB0aGUgaGlnaGVzdCBsYW5kIGhlaWdodCAoa2VlcHMgcmlkZ2VzIGFuZCBwZWFrcyBvbiB0aGVcbiAgLy8gc2t5bGluZSksIHRoZSBtYXRlcmlhbCBvZiB0aGF0IGhpZ2hlc3Qgc3ViLWNlbGwgYW5kIHRoZSBtZWFuIHRvcCBjb2xvdXJcbiAgLy8gb2YgdGhlaXIgbGFuZCBzdWItY2VsbHM7IGEgY29hcnNlIGNlbGwgdGhhdCBpcyBtb3N0bHkgc2VhIHN0YXlzIHNlYS5cbiAgY29uc3QgdGllcnMgPSBvcHRzLmZvY3VzID8gKG9wdHMudGllcnMgPz8gREVGQVVMVF9NQUNST19USUVSUykgOiBudWxsO1xuICBjb25zdCBCID0gNDtcbiAgY29uc3QgbGV2ZWxPZiA9IChiaTogbnVtYmVyLCBiajogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBpZiAoIXRpZXJzIHx8ICFvcHRzLmZvY3VzKSByZXR1cm4gMTtcbiAgICBjb25zdCBjeCA9IC1IQUxGICsgKGJpICsgMC41KSAqIEIgKiBzdGVwLCBjeiA9IC1IQUxGICsgKGJqICsgMC41KSAqIEIgKiBzdGVwO1xuICAgIGNvbnN0IGQgPSBNYXRoLm1heChNYXRoLmFicyhjeCAtIG9wdHMuZm9jdXMueCksIE1hdGguYWJzKGN6IC0gb3B0cy5mb2N1cy56KSkgLSBCICogc3RlcCAvIDI7XG4gICAgcmV0dXJuIGQgPD0gdGllcnMuZmluZSA/IDEgOiBkIDw9IHRpZXJzLm1pZCA/IDIgOiA0O1xuICB9O1xuICAvLyBSZW5kZXIgaGVpZ2h0IHBlciBiYXNlIGNlbGwgKG9mIHRoZSBjZWxsIHRoYXQgY292ZXJzIGl0KSBhbmQgd2hldGhlclxuICAvLyB0aGF0IGNlbGwgaXMgZHJhd24gYXMgbGFuZC5cbiAgY29uc3QgcmVuZGVySCA9IG5ldyBGbG9hdDMyQXJyYXkoTiAqIE4pO1xuICBjb25zdCByZW5kZXJMYW5kID0gbmV3IFVpbnQ4QXJyYXkoTiAqIE4pO1xuICB0eXBlIENlbGwgPSB7IGk6IG51bWJlcjsgajogbnVtYmVyOyBrOiBudW1iZXI7IGg6IG51bWJlcjsgdG9wOiBNYXRJZDsgY29sb3I6IFRIUkVFLkNvbG9yIH07XG4gIGNvbnN0IGNlbGxzOiBDZWxsW10gPSBbXTtcbiAgY29uc3QgY29sb3JBY2MgPSBuZXcgVEhSRUUuQ29sb3IoKTtcbiAgZm9yIChsZXQgYmogPSAwOyBiaiA8IE47IGJqICs9IEIpIHtcbiAgICBmb3IgKGxldCBiaSA9IDA7IGJpIDwgTjsgYmkgKz0gQikge1xuICAgICAgY29uc3QgayA9IGxldmVsT2YoYmkgLyBCLCBiaiAvIEIpO1xuICAgICAgZm9yIChsZXQgajAgPSBiajsgajAgPCBNYXRoLm1pbihOLCBiaiArIEIpOyBqMCArPSBrKSB7XG4gICAgICAgIGZvciAobGV0IGkwID0gYmk7IGkwIDwgTWF0aC5taW4oTiwgYmkgKyBCKTsgaTAgKz0gaykge1xuICAgICAgICAgIGxldCBsYW5kID0gMCwgdG90YWwgPSAwLCBiZXN0ID0gLTE7XG4gICAgICAgICAgY29sb3JBY2Muc2V0UkdCKDAsIDAsIDApO1xuICAgICAgICAgIGZvciAobGV0IGogPSBqMDsgaiA8IE1hdGgubWluKE4sIGowICsgayk7IGorKykge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGkwOyBpIDwgTWF0aC5taW4oTiwgaTAgKyBrKTsgaSsrKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGlkeCA9IGogKiBOICsgaTtcbiAgICAgICAgICAgICAgdG90YWwrKztcbiAgICAgICAgICAgICAgaWYgKGhvbGVDZWxsW2lkeF0gfHwgdW5kZXJ3YXRlcltpZHhdKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgbGFuZCsrO1xuICAgICAgICAgICAgICBpZiAoYmVzdCA8IDAgfHwgaGVpZ2h0c1tpZHhdID4gaGVpZ2h0c1tiZXN0XSkgYmVzdCA9IGlkeDtcbiAgICAgICAgICAgICAgaWYgKGsgPiAxKSBjb2xvckFjYy5hZGQodG9wQ29sb3IodG9wc1tpZHhdIGFzIE1hdElkLCBoZWlnaHRzW2lkeF0sIGksIGopKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGJlc3QgPCAwIHx8IGxhbmQgKiAyIDwgdG90YWwpIGNvbnRpbnVlO1xuICAgICAgICAgIGNvbnN0IGggPSBoZWlnaHRzW2Jlc3RdO1xuICAgICAgICAgIGNvbnN0IHRvcCA9IHRvcHNbYmVzdF0gYXMgTWF0SWQ7XG4gICAgICAgICAgY29uc3QgY29sb3IgPSBrID4gMSA/IGNvbG9yQWNjLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoMSAvIGxhbmQpIDogdG9wQ29sb3IodG9wLCBoLCBpMCwgajApO1xuICAgICAgICAgIGNlbGxzLnB1c2goeyBpOiBpMCwgajogajAsIGssIGgsIHRvcCwgY29sb3IgfSk7XG4gICAgICAgICAgZm9yIChsZXQgaiA9IGowOyBqIDwgTWF0aC5taW4oTiwgajAgKyBrKTsgaisrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gaTA7IGkgPCBNYXRoLm1pbihOLCBpMCArIGspOyBpKyspIHtcbiAgICAgICAgICAgICAgcmVuZGVySFtqICogTiArIGldID0gaDtcbiAgICAgICAgICAgICAgcmVuZGVyTGFuZFtqICogTiArIGldID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKiogSGVpZ2h0IGEgc2lkZSBmYWNlIGRyb3BzIHRvIGJlc2lkZSBiYXNlIGNlbGwgKG5pLCBuaiksIG9yIG51bGwgZm9yIG5vIGZhY2UuICovXG4gIGNvbnN0IG5laWdoYm91ckRyb3AgPSAobmk6IG51bWJlciwgbmo6IG51bWJlcik6IG51bWJlciB8IG51bGwgPT4ge1xuICAgIC8vIFRoZSB3b3JsZCBlZGdlIGlzIG9jZWFuLiBEbyBub3QgZHJhdyBhIHNpZGUgZmFjZSBkb3duIHRvIHRoZSB3YXRlclxuICAgIC8vIGhlcmU7IHRoZSBvcGFxdWUgd2F0ZXIgcGxhbmUgYWxyZWFkeSBjb3ZlcnMgdGhlIGJvdW5kYXJ5LlxuICAgIGlmIChuaSA8IDAgfHwgbmogPCAwIHx8IG5pID49IE4gfHwgbmogPj0gTikgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgbmlkeCA9IG5qICogTiArIG5pO1xuICAgIGlmIChob2xlQ2VsbFtuaWR4XSkgcmV0dXJuIG51bGw7XG4gICAgaWYgKHJlbmRlckxhbmRbbmlkeF0pIHJldHVybiByZW5kZXJIW25pZHhdO1xuICAgIC8vIFNlYSwgb3IgYSBsYW5kIHN1Yi1jZWxsIG9mIGEgY29hcnNlIGNlbGwgdGhhdCBpcyBtb3N0bHkgc2VhOiB0aGUgZmFjZVxuICAgIC8vIHJ1bnMgZG93biB0byB0aGUgd2F0ZXIgc28gbm8gc2VlLXRocm91Z2ggZ2FwIG9wZW5zIGFib3ZlIGl0LlxuICAgIHJldHVybiB1bmRlcndhdGVyW25pZHhdID8gTWF0aC5tYXgoU0VBX0xFVkVMIC0gMC41LCBoZWlnaHRzW25pZHhdKSA6IFNFQV9MRVZFTCAtIDAuNTtcbiAgfTtcblxuICBmb3IgKGNvbnN0IHsgaSwgaiwgaywgaCwgdG9wLCBjb2xvciB9IG9mIGNlbGxzKSB7XG4gICAgYnVmID0gdGlsZUJ1ZmZlcnNbTWF0aC5mbG9vcihqIC8gdGlsZUNlbGxzKSAqIHRpbGVzUGVyU2lkZSArIE1hdGguZmxvb3IoaSAvIHRpbGVDZWxscyldO1xuICAgIGNvbnN0IHgwID0gLUhBTEYgKyBpICogc3RlcCwgeDEgPSBNYXRoLm1pbihIQUxGLCB4MCArIGsgKiBzdGVwKTtcbiAgICBjb25zdCB6MCA9IC1IQUxGICsgaiAqIHN0ZXAsIHoxID0gTWF0aC5taW4oSEFMRiwgejAgKyBrICogc3RlcCk7XG4gICAgY29uc3Qgc3BhbiA9IE1hdGgubWluKGssIE4gLSBpKSwgc3BhblogPSBNYXRoLm1pbihrLCBOIC0gaik7XG5cbiAgICBwdXNoUXVhZChcbiAgICAgIFtbeDAsIGgsIHowXSwgW3gwLCBoLCB6MV0sIFt4MSwgaCwgejFdLCBbeDEsIGgsIHowXV0sXG4gICAgICBbMCwgMSwgMF0sXG4gICAgICBjb2xvcixcbiAgICApO1xuXG4gICAgLy8gT25lIHNpZGUgZmFjZSBwZXIgcnVuIG9mIGVxdWFsIGRyb3AgaGVpZ2h0IGFsb25nIGVhY2ggZWRnZS4gQ29hcnNlXG4gICAgLy8gY2VsbHMgYmVzaWRlIGZpbmVyIG9uZXMgZ2V0IHNldmVyYWwgcnVucywgc28gbm8gZ2FwIG9wZW5zIGF0IGEgdGllclxuICAgIC8vIGJvdW5kYXJ5OyBlcXVhbC1zaXplIG5laWdoYm91cnMgZ2l2ZSBleGFjdGx5IG9uZSBmYWNlIGFzIGJlZm9yZS5cbiAgICBjb25zdCBlZGdlID0gKHNpZGU6IDAgfCAxIHwgMiB8IDMpID0+IHtcbiAgICAgIGNvbnN0IG4gPSBzaWRlIDwgMiA/IHNwYW5aIDogc3BhbjtcbiAgICAgIGxldCBydW5TdGFydCA9IDAsIHJ1bkg6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICAgICAgY29uc3QgZmx1c2ggPSAoZW5kOiBudW1iZXIpID0+IHtcbiAgICAgICAgaWYgKHJ1bkggPT09IG51bGwgfHwgaCA8PSBydW5IKSByZXR1cm47XG4gICAgICAgIGNvbnN0IG5oID0gcnVuSDtcbiAgICAgICAgY29uc3QgY29sID0gc2lkZUNvbG9yKHRvcCwgaCwgbmgsIGksIGopO1xuICAgICAgICBpZiAoc2lkZSA9PT0gMCkge1xuICAgICAgICAgIGNvbnN0IHphID0gejAgKyBydW5TdGFydCAqIHN0ZXAsIHpiID0gejAgKyBlbmQgKiBzdGVwO1xuICAgICAgICAgIHB1c2hRdWFkKFtbeDEsIG5oLCB6YV0sIFt4MSwgaCwgemFdLCBbeDEsIGgsIHpiXSwgW3gxLCBuaCwgemJdXSwgWzEsIDAsIDBdLCBjb2wpO1xuICAgICAgICB9IGVsc2UgaWYgKHNpZGUgPT09IDEpIHtcbiAgICAgICAgICBjb25zdCB6YSA9IHowICsgcnVuU3RhcnQgKiBzdGVwLCB6YiA9IHowICsgZW5kICogc3RlcDtcbiAgICAgICAgICBwdXNoUXVhZChbW3gwLCBuaCwgemFdLCBbeDAsIG5oLCB6Yl0sIFt4MCwgaCwgemJdLCBbeDAsIGgsIHphXV0sIFstMSwgMCwgMF0sIGNvbCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2lkZSA9PT0gMikge1xuICAgICAgICAgIGNvbnN0IHhhID0geDAgKyBydW5TdGFydCAqIHN0ZXAsIHhiID0geDAgKyBlbmQgKiBzdGVwO1xuICAgICAgICAgIHB1c2hRdWFkKFtbeGEsIG5oLCB6MV0sIFt4YiwgbmgsIHoxXSwgW3hiLCBoLCB6MV0sIFt4YSwgaCwgejFdXSwgWzAsIDAsIDFdLCBjb2wpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHhhID0geDAgKyBydW5TdGFydCAqIHN0ZXAsIHhiID0geDAgKyBlbmQgKiBzdGVwO1xuICAgICAgICAgIHB1c2hRdWFkKFtbeGEsIG5oLCB6MF0sIFt4YSwgaCwgejBdLCBbeGIsIGgsIHowXSwgW3hiLCBuaCwgejBdXSwgWzAsIDAsIC0xXSwgY29sKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGZvciAobGV0IHQgPSAwOyB0IDwgbjsgdCsrKSB7XG4gICAgICAgIGNvbnN0IG5oID0gc2lkZSA9PT0gMCA/IG5laWdoYm91ckRyb3AoaSArIHNwYW4sIGogKyB0KVxuICAgICAgICAgIDogc2lkZSA9PT0gMSA/IG5laWdoYm91ckRyb3AoaSAtIDEsIGogKyB0KVxuICAgICAgICAgICAgOiBzaWRlID09PSAyID8gbmVpZ2hib3VyRHJvcChpICsgdCwgaiArIHNwYW5aKVxuICAgICAgICAgICAgICA6IG5laWdoYm91ckRyb3AoaSArIHQsIGogLSAxKTtcbiAgICAgICAgaWYgKHQgPiAwICYmIG5oID09PSBydW5IKSBjb250aW51ZTtcbiAgICAgICAgZmx1c2godCk7XG4gICAgICAgIHJ1blN0YXJ0ID0gdDsgcnVuSCA9IG5oO1xuICAgICAgfVxuICAgICAgZmx1c2gobik7XG4gICAgfTtcbiAgICBlZGdlKDApOyBlZGdlKDEpOyBlZGdlKDIpOyBlZGdlKDMpO1xuICB9XG5cbiAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IHZlcnRleENvbG9yczogdHJ1ZSwgZmxhdFNoYWRpbmc6IHRydWUgfSk7XG4gIGNvbnN0IG1lc2hlczogVEhSRUUuTWVzaFtdID0gW107XG4gIGxldCB0cmlhbmdsZXMgPSAwO1xuICBmb3IgKGxldCB0ID0gMDsgdCA8IHRpbGVCdWZmZXJzLmxlbmd0aDsgdCsrKSB7XG4gICAgY29uc3QgeyBwb3NpdGlvbnMsIG5vcm1hbHMsIGNvbG9ycywgaW5kaWNlcyB9ID0gdGlsZUJ1ZmZlcnNbdF07XG4gICAgaWYgKGluZGljZXMubGVuZ3RoID09PSAwICYmICh0aWxlQnVmZmVycy5sZW5ndGggPiAxIHx8IG1lc2hlcy5sZW5ndGggPiAwKSkgY29udGludWU7XG4gICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUocG9zaXRpb25zLCAzKSk7XG4gICAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdub3JtYWwnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShub3JtYWxzLCAzKSk7XG4gICAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGNvbG9ycywgMykpO1xuICAgIGdlb21ldHJ5LnNldEluZGV4KGluZGljZXMpO1xuICAgIGdlb21ldHJ5LmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuICAgIGdlb21ldHJ5LmNvbXB1dGVCb3VuZGluZ0JveCgpO1xuICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xuICAgIG1lc2gubmFtZSA9IHRpbGVCdWZmZXJzLmxlbmd0aCA+IDEgPyBgbWFjcm9fbG9kX3RpbGVfJHt0ICUgdGlsZXNQZXJTaWRlfV8ke01hdGguZmxvb3IodCAvIHRpbGVzUGVyU2lkZSl9YCA6ICdtYWNyb19sb2QnO1xuICAgIG1lc2guY2FzdFNoYWRvdyA9IGZhbHNlO1xuICAgIG1lc2gucmVjZWl2ZVNoYWRvdyA9IGZhbHNlO1xuICAgIG1lc2hlcy5wdXNoKG1lc2gpO1xuICAgIHRyaWFuZ2xlcyArPSBpbmRpY2VzLmxlbmd0aCAvIDM7XG4gIH1cbiAgaWYgKG1lc2hlcy5sZW5ndGggPT09IDApIHtcbiAgICBjb25zdCBlbXB0eSA9IG5ldyBUSFJFRS5NZXNoKG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpLCBtYXRlcmlhbCk7XG4gICAgZW1wdHkubmFtZSA9ICdtYWNyb19sb2QnO1xuICAgIG1lc2hlcy5wdXNoKGVtcHR5KTtcbiAgfVxuICByZXR1cm4ge1xuICAgIG1lc2g6IG1lc2hlc1swXSxcbiAgICBtZXNoZXMsXG4gICAgdHJpYW5nbGVzLFxuICAgIHNhbXBsZU1zLFxuICAgIHRvdGFsTXM6IHBlcmZvcm1hbmNlLm5vdygpIC0gdG90YWxUMCxcbiAgICBzYW1wbGVDYWNoZWQsXG4gIH07XG59XG5cbmV4cG9ydCB0eXBlIFZpZXdNb2RlID0gJ3dvcmxkJyB8ICdtYXAnIHwgJ2tpdCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxUZXJyYWluVmlld09wdGlvbnMge1xuICBuZWFyUmFkaXVzPzogbnVtYmVyO1xuICB3b3JsZE1hY3JvU3RlcD86IG51bWJlcjtcbiAgbWFwTWFjcm9TdGVwPzogbnVtYmVyO1xufVxuXG5jb25zdCBfY3VsbEZydXN0dW0gPSBuZXcgVEhSRUUuRnJ1c3R1bSgpO1xuY29uc3QgX2N1bGxNYXRyaXggPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuXG5pbnRlcmZhY2UgQ2h1bmtWaWV3IHsgbWVzaDogVEhSRUUuTWVzaDsgd2F0ZXI6IFRIUkVFLk1lc2ggfCBudWxsOyB0cmlhbmdsZXM6IG51bWJlcjsgfVxuXG4vKipcbiAqIE93bnMgdGhlIG5lYXIgY2h1bmsgbWVzaGVzLCBtYWNybyBMT0QgYW5kIHdhdGVyIHN1cmZhY2UuIEl0IHJlYWRzIHdvcmxkXG4gKiBzdGF0ZSBhbmQgbmV2ZXIgbXV0YXRlcyBnZW5lcmF0aW9uIHJ1bGVzOyBldmljdGlvbiBvbmx5IGZyZWVzIGRlcml2ZWQgZGF0YS5cbiAqL1xuZXhwb3J0IGNsYXNzIFZveGVsVGVycmFpblZpZXcge1xuICByZWFkb25seSBncm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBwcml2YXRlIG5lYXJHcm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBwcml2YXRlIG1hY3JvR3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSB3YXRlcjogVEhSRUUuTWVzaDtcbiAgcHJpdmF0ZSB3b3JsZDogV29ybGQ7XG4gIHByaXZhdGUgbmVhclJhZGl1czogbnVtYmVyO1xuICBwcml2YXRlIHdvcmxkTWFjcm9TdGVwOiBudW1iZXI7XG4gIHByaXZhdGUgbWFwTWFjcm9TdGVwOiBudW1iZXI7XG4gIHByaXZhdGUgY2h1bmtzID0gbmV3IE1hcDxzdHJpbmcsIENodW5rVmlldz4oKTtcbiAgcHJpdmF0ZSBsb2FkZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBtb2RlOiBWaWV3TW9kZSA9ICd3b3JsZCc7XG4gIHByaXZhdGUgbWFjcm86IFRIUkVFLk1lc2hbXSA9IFtdO1xuICBwcml2YXRlIG1hY3JvVHJpYW5nbGVzID0gMDtcbiAgcHJpdmF0ZSBtYWNyb0ZvY3VzID0gbmV3IFRIUkVFLlZlY3RvcjMoMWU5LCAwLCAxZTkpO1xuICBwcml2YXRlIG1hY3JvTW9kZTogVmlld01vZGUgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBjaHVua0dlblNhbXBsZXM6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgY2h1bmtNZXNoU2FtcGxlczogbnVtYmVyW10gPSBbXTtcbiAgcHJpdmF0ZSBtYWNyb1NhbXBsZXM6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgbWFjcm9TYW1wbGVTYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIG1hY3JvQ2FjaGVIaXRzID0gMDtcbiAgcHJpdmF0ZSBtYWNyb0VkaXRLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAvKiogTWFpbi10aHJlYWQgbWlsbGlzZWNvbmRzIHBlciBmcmFtZSBmb3Igc3RyZWFtaW5nIGFuZCBkaXJ0eSByZS1tZXNoaW5nLiAqL1xuICBmcmFtZUJ1ZGdldE1zID0gNjtcbiAgcHJpdmF0ZSBwZW5kaW5nQ2h1bmtzID0gMDtcbiAgcHJpdmF0ZSBzd2VlcENvdW50ZXIgPSAwO1xuICBwcml2YXRlIHN3ZXB0Q2h1bmtzID0gMDtcbiAgcHJpdmF0ZSBwaW5uZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBwb29sOiBDaHVua1dvcmtlclBvb2wgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBnZW5lcmF0aW5nID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIC8qKiBMYXRlc3QgbWVzaCByZXF1ZXN0IHBlciBjaHVuazsgb2xkZXIgcmVzdWx0cyBhcmUgZGlzY2FyZGVkLiAqL1xuICBwcml2YXRlIG1lc2hTdGFtcCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIHByaXZhdGUgc3RhbXBDb3VudGVyID0gMDtcbiAgcHJpdmF0ZSB3b3JrZXJTdGF0cyA9IHsgZ2VuZXJhdGVkOiAwLCBtZXNoZWQ6IDAsIGRpc2NhcmRlZDogMCwgZ2VuTXM6IDAsIG1lc2hNczogMCB9O1xuICBwcml2YXRlIHdhdGVyR3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBmYXJXYXRlckhvbGU6IHsgdmFsdWU6IFRIUkVFLlZlY3RvcjQgfTtcbiAgb25DaHVua3NDaGFuZ2VkOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcblxuICBjb25zdHJ1Y3Rvcih3b3JsZDogV29ybGQsIHNjZW5lOiBUSFJFRS5TY2VuZSwgb3B0czogVm94ZWxUZXJyYWluVmlld09wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMud29ybGQgPSB3b3JsZDtcbiAgICB0aGlzLm5lYXJSYWRpdXMgPSBNYXRoLm1heCgxLCBvcHRzLm5lYXJSYWRpdXMgPz8gMyk7XG4gICAgdGhpcy53b3JsZE1hY3JvU3RlcCA9IE1hdGgubWF4KDQsIG9wdHMud29ybGRNYWNyb1N0ZXAgPz8gOCk7XG4gICAgdGhpcy5tYXBNYWNyb1N0ZXAgPSBNYXRoLm1heCg0LCBvcHRzLm1hcE1hY3JvU3RlcCA/PyA4KTtcbiAgICB0aGlzLmdyb3VwLm5hbWUgPSAndm94ZWxfd29ybGQnO1xuICAgIHRoaXMubmVhckdyb3VwLm5hbWUgPSAndm94ZWxfY2h1bmtzJztcbiAgICB0aGlzLm1hY3JvR3JvdXAubmFtZSA9ICdtYWNyb19sb2QnO1xuICAgIHRoaXMuZ3JvdXAuYWRkKHRoaXMubmVhckdyb3VwLCB0aGlzLm1hY3JvR3JvdXApO1xuICAgIHRoaXMud2F0ZXIgPSBidWlsZFdhdGVyU3VyZmFjZSh3b3JsZCk7XG4gICAgdGhpcy5mYXJXYXRlckhvbGUgPSBpbnN0YWxsRmFyV2F0ZXJIb2xlKHRoaXMud2F0ZXIubWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwpO1xuICAgIHRoaXMuZ3JvdXAuYWRkKHRoaXMud2F0ZXIpO1xuICAgIHRoaXMud2F0ZXJHcm91cC5uYW1lID0gJ25lYXJfd2F0ZXInO1xuICAgIHRoaXMuZ3JvdXAuYWRkKHRoaXMud2F0ZXJHcm91cCk7XG4gICAgc2NlbmUuYWRkKHRoaXMuZ3JvdXApO1xuICB9XG5cbiAgcHJlbG9hZChmb2N1czogVEhSRUUuVmVjdG9yMyk6IHZvaWQge1xuICAgIHRoaXMubW9kZSA9ICd3b3JsZCc7XG4gICAgdGhpcy5lbnN1cmVDaHVua3MoZm9jdXMsIHRydWUpO1xuICAgIHRoaXMucmVidWlsZE1hY3JvKGZvY3VzLCAnd29ybGQnLCB0cnVlKTtcbiAgfVxuXG4gIC8qKiBBZHZhbmNlIHByZXNlbnRhdGlvbi1vbmx5IHdhdGVyIGFuaW1hdGlvbiAoc2Vjb25kcykuICovXG4gIHNldFdhdGVyVGltZShzZWNvbmRzOiBudW1iZXIpOiB2b2lkIHsgd2F0ZXJUaW1lLnZhbHVlID0gc2Vjb25kczsgfVxuXG4gIHVwZGF0ZShmb2N1czogVEhSRUUuVmVjdG9yMywgbW9kZTogVmlld01vZGUgPSAnd29ybGQnKTogdm9pZCB7XG4gICAgaWYgKG1vZGUgIT09IHRoaXMubW9kZSkge1xuICAgICAgdGhpcy5tb2RlID0gbW9kZTtcbiAgICAgIHRoaXMubmVhckdyb3VwLnZpc2libGUgPSBtb2RlICE9PSAnbWFwJztcbiAgICAgIHRoaXMud2F0ZXJHcm91cC52aXNpYmxlID0gbW9kZSAhPT0gJ21hcCc7XG4gICAgICBpZiAobW9kZSA9PT0gJ21hcCcpIHRoaXMuZmFyV2F0ZXJIb2xlLnZhbHVlLnNldCgwLCAwLCAwLCAwKTtcbiAgICAgIHRoaXMucmVidWlsZE1hY3JvKGZvY3VzLCBtb2RlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBpZiAobW9kZSA9PT0gJ21hcCcpIHtcbiAgICAgIGlmIChtYWNyb0VkaXRLZXkodGhpcy53b3JsZCkgIT09IHRoaXMubWFjcm9FZGl0S2V5KSB0aGlzLnJlYnVpbGRNYWNybyhmb2N1cywgbW9kZSwgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZnJhbWVTdGFydCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIHRoaXMuZW5zdXJlQ2h1bmtzKGZvY3VzLCBmYWxzZSwgZnJhbWVTdGFydCk7XG4gICAgdGhpcy5yZWJ1aWxkRGlydHkoZm9jdXMsIGZyYW1lU3RhcnQpO1xuICAgIGlmICgrK3RoaXMuc3dlZXBDb3VudGVyICUgMzAgPT09IDApIHRoaXMuc3dlZXBSZXNpZGVudChmb2N1cyk7XG5cbiAgICBjb25zdCBtb3ZlZCA9IE1hdGguaHlwb3QoZm9jdXMueCAtIHRoaXMubWFjcm9Gb2N1cy54LCBmb2N1cy56IC0gdGhpcy5tYWNyb0ZvY3VzLnopO1xuICAgIGlmICh0aGlzLm1hY3JvTW9kZSAhPT0gbW9kZSB8fCBtb3ZlZCA+IDQ4IHx8IG1hY3JvRWRpdEtleSh0aGlzLndvcmxkKSAhPT0gdGhpcy5tYWNyb0VkaXRLZXkpIHtcbiAgICAgIHRoaXMucmVidWlsZE1hY3JvKGZvY3VzLCBtb2RlLCBmYWxzZSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0cmVhbSB0aGUgbmVhciByaW5nIG5lYXJlc3QtZmlyc3Qgd2l0aGluIGEgcGVyLWZyYW1lIHRpbWUgYnVkZ2V0LiBBdCBsZWFzdFxuICAgKiBvbmUgY2h1bmsgaXMgYnVpbHQgcGVyIGZyYW1lIHNvIHN0cmVhbWluZyBhbHdheXMgbWFrZXMgcHJvZ3Jlc3MuXG4gICAqL1xuICAvKipcbiAgICogTW92ZSBzdHJlYW1pbmcgZ2VuZXJhdGlvbiBhbmQgbWVzaGluZyB0byB3b3JrZXJzLiBFeHBsaWNpdCByZWJ1aWxkc1xuICAgKiAoY29uc3RydWN0aW9uLCBlZGl0cyB2aWEgcmVidWlsZEFyb3VuZCkgYW5kIHByZWxvYWQgc3RheSBzeW5jaHJvbm91cyBzb1xuICAgKiBhdXRob3JpdGF0aXZlIGNoYW5nZXMgYXJlIHZpc2libGUgaW1tZWRpYXRlbHkuXG4gICAqL1xuICBlbmFibGVXb3JrZXJzKHBvb2w6IENodW5rV29ya2VyUG9vbCk6IHZvaWQgeyB0aGlzLnBvb2wgPSBwb29sOyB9XG5cbiAgZ2V0IHdvcmtlck1ldHJpY3MoKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB8IG51bGwge1xuICAgIGlmICghdGhpcy5wb29sKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4ge1xuICAgICAgd29ya2VyczogdGhpcy5wb29sLnNpemUsIGluRmxpZ2h0OiB0aGlzLnBvb2wuaW5GbGlnaHQsIC4uLnRoaXMud29ya2VyU3RhdHMsXG4gICAgICBnZW5Nc0F2ZzogdGhpcy53b3JrZXJTdGF0cy5nZW5lcmF0ZWQgPyBNYXRoLnJvdW5kKHRoaXMud29ya2VyU3RhdHMuZ2VuTXMgLyB0aGlzLndvcmtlclN0YXRzLmdlbmVyYXRlZCAqIDEwKSAvIDEwIDogMCxcbiAgICAgIG1lc2hNc0F2ZzogdGhpcy53b3JrZXJTdGF0cy5tZXNoZWQgPyBNYXRoLnJvdW5kKHRoaXMud29ya2VyU3RhdHMubWVzaE1zIC8gdGhpcy53b3JrZXJTdGF0cy5tZXNoZWQgKiAxMCkgLyAxMCA6IDAsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgcmVxdWVzdEdlbmVyYXRlKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAgIGlmICh0aGlzLndvcmxkLmNodW5rcy5oYXMoa2V5KSB8fCB0aGlzLmdlbmVyYXRpbmcuaGFzKGtleSkgfHwgIXRoaXMucG9vbCkgcmV0dXJuO1xuICAgIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybjtcbiAgICB0aGlzLmdlbmVyYXRpbmcuYWRkKGtleSk7XG4gICAgY29uc3QgeyBzZWVkIH0gPSB0aGlzLndvcmxkLCB2ZXJzaW9uID0gdGhpcy53b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbjtcbiAgICB2b2lkIHRoaXMucG9vbC5nZW5lcmF0ZShzZWVkLCB2ZXJzaW9uLCBjeCwgY3opLnRoZW4oKHIpID0+IHtcbiAgICAgIHRoaXMuZ2VuZXJhdGluZy5kZWxldGUoa2V5KTtcbiAgICAgIC8vIFRoZSBtYWluIHRocmVhZCBpcyB0aGUgb25seSBXb3JsZCB3cml0ZXI6IGluc3RhbGwgb25seSBpZiBzdGlsbCB3YW50ZWQuXG4gICAgICBpZiAodGhpcy53b3JsZC5zZWVkICE9PSBzZWVkIHx8IHRoaXMud29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24gIT09IHZlcnNpb25cbiAgICAgICAgfHwgdGhpcy53b3JsZC5jaHVua3MuaGFzKGtleSkpIHsgdGhpcy53b3JrZXJTdGF0cy5kaXNjYXJkZWQrKzsgcmV0dXJuOyB9XG4gICAgICBzZWVkQmFzZUNvbHVtbnModGhpcy53b3JsZCwga2V5LCByLmNvbHVtbnMpO1xuICAgICAgaW5zdGFsbEJhc2VDaHVuayh0aGlzLndvcmxkLCByLmJhc2UsIHIubXMpO1xuICAgICAgdGhpcy53b3JrZXJTdGF0cy5nZW5lcmF0ZWQrKztcbiAgICAgIHRoaXMud29ya2VyU3RhdHMuZ2VuTXMgKz0gci5tcztcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgcmVxdWVzdE1lc2goa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBjaHVuayA9IHRoaXMud29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghY2h1bmsgfHwgIXRoaXMucG9vbCkgcmV0dXJuO1xuICAgIGNvbnN0IHN0YW1wID0gKyt0aGlzLnN0YW1wQ291bnRlcjtcbiAgICB0aGlzLm1lc2hTdGFtcC5zZXQoa2V5LCBzdGFtcCk7XG4gICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBwYWRkZWQgPSBwYWRkZWRGb3IodGhpcy53b3JsZCwgY2h1bmspO1xuICAgIHZvaWQgdGhpcy5wb29sLm1lc2gocGFkZGVkLCBjaHVuay5oZWlnaHRzLCBveCwgb3osIHRoaXMud29ybGQuc2VlZCkudGhlbigocikgPT4ge1xuICAgICAgLy8gU3VwZXJzZWRlZCAobmV3ZXIgcmVxdWVzdCwgdW5sb2FkZWQgb3Igc3luY2hyb25vdXNseSByZWJ1aWx0KSByZXN1bHRzIGFyZSBkcm9wcGVkLlxuICAgICAgaWYgKHRoaXMubWVzaFN0YW1wLmdldChrZXkpICE9PSBzdGFtcCkgeyB0aGlzLndvcmtlclN0YXRzLmRpc2NhcmRlZCsrOyByZXR1cm47IH1cbiAgICAgIHRoaXMubWVzaFN0YW1wLmRlbGV0ZShrZXkpO1xuICAgICAgY29uc3QgY3VycmVudCA9IHRoaXMud29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgICAgaWYgKCFjdXJyZW50KSB7IHRoaXMud29ya2VyU3RhdHMuZGlzY2FyZGVkKys7IHJldHVybjsgfVxuICAgICAgLy8gQW4gZWRpdCB0byB0aGlzIGNodW5rIHdoaWxlIGluIGZsaWdodCByZS1tYXJrZWQgaXQgZGlydHk7IHRoZSByZXN1bHQgaXNcbiAgICAgIC8vIHN0aWxsIHNob3duIG5vdyBhbmQgcmVwbGFjZWQgYnkgdGhlIG5leHQgKGZyZXNoKSByZXF1ZXN0LlxuICAgICAgdGhpcy5hZG9wdE1lc2goa2V5LCBjdXJyZW50LCBnZW9tZXRyeUZyb21BcnJheXMoci5hcnJheXMpKTtcbiAgICAgIHRoaXMud29ya2VyU3RhdHMubWVzaGVkKys7XG4gICAgICB0aGlzLndvcmtlclN0YXRzLm1lc2hNcyArPSByLm1zO1xuICAgICAgdGhpcy5vbkNodW5rc0NoYW5nZWQ/LigpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhZG9wdE1lc2goa2V5OiBzdHJpbmcsIGNodW5rOiBWb3hlbENodW5rLCByZXN1bHQ6IE1lc2hSZXN1bHQpOiB2b2lkIHtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgdGhpcy5uZWFyR3JvdXAucmVtb3ZlKGV4aXN0aW5nLm1lc2gpO1xuICAgICAgZXhpc3RpbmcubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICBpZiAoZXhpc3Rpbmcud2F0ZXIpIHsgdGhpcy53YXRlckdyb3VwLnJlbW92ZShleGlzdGluZy53YXRlcik7IGV4aXN0aW5nLndhdGVyLmdlb21ldHJ5LmRpc3Bvc2UoKTsgfVxuICAgIH1cbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2gocmVzdWx0Lmdlb21ldHJ5LCB0ZXJyYWluTWF0ZXJpYWwpO1xuICAgIG1lc2gubmFtZSA9IGB2b3hlbF9jaHVua18ke2NodW5rLmN4fV8ke2NodW5rLmN6fWA7XG4gICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgICB0aGlzLm5lYXJHcm91cC5hZGQobWVzaCk7XG4gICAgY29uc3Qgd2F0ZXIgPSBtZXNoQ2h1bmtXYXRlcih0aGlzLndvcmxkLCBjaHVuayk7XG4gICAgaWYgKHdhdGVyKSB0aGlzLndhdGVyR3JvdXAuYWRkKHdhdGVyKTtcbiAgICB0aGlzLmNodW5rcy5zZXQoa2V5LCB7IG1lc2gsIHdhdGVyLCB0cmlhbmdsZXM6IHJlc3VsdC50cmlhbmdsZXMgKyAod2F0ZXI/LnVzZXJEYXRhLndhdGVyVHJpYW5nbGVzID8/IDApIH0pO1xuICAgIHRoaXMubG9hZGVkLmFkZChrZXkpO1xuICB9XG5cbiAgLyoqIFdvcmtlciBzdHJlYW1pbmc6IGdlbmVyYXRlIHRoZSAzeDMgbmVpZ2hib3VyaG9vZCwgdGhlbiBtZXNoLCBuZWFyZXN0IGZpcnN0LiAqL1xuICBwcml2YXRlIGVuc3VyZUNodW5rc0FzeW5jKG1pc3Npbmc6IEFycmF5PHsgY3g6IG51bWJlcjsgY3o6IG51bWJlcjsgZDogbnVtYmVyIH0+KTogdm9pZCB7XG4gICAgY29uc3QgcG9vbCA9IHRoaXMucG9vbCE7XG4gICAgY29uc3QgbWF4SW5GbGlnaHQgPSBwb29sLnNpemUgKiAzO1xuICAgIGZvciAoY29uc3QgbSBvZiBtaXNzaW5nKSB7XG4gICAgICBpZiAocG9vbC5pbkZsaWdodCA+PSBtYXhJbkZsaWdodCkgYnJlYWs7XG4gICAgICBjb25zdCBrZXkgPSBjaHVua0tleShtLmN4LCBtLmN6KTtcbiAgICAgIGlmICh0aGlzLm1lc2hTdGFtcC5oYXMoa2V5KSkgY29udGludWU7XG4gICAgICBsZXQgcmVhZHkgPSB0cnVlO1xuICAgICAgZm9yIChsZXQgZHogPSAtMTsgZHogPD0gMTsgZHorKykge1xuICAgICAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSAxOyBkeCsrKSB7XG4gICAgICAgICAgY29uc3QgY3ggPSBtLmN4ICsgZHgsIGN6ID0gbS5jeiArIGR6O1xuICAgICAgICAgIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIGNvbnRpbnVlO1xuICAgICAgICAgIGlmICghdGhpcy53b3JsZC5jaHVua3MuaGFzKGNodW5rS2V5KGN4LCBjeikpKSB7IHJlYWR5ID0gZmFsc2U7IHRoaXMucmVxdWVzdEdlbmVyYXRlKGN4LCBjeik7IH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHJlYWR5KSB0aGlzLnJlcXVlc3RNZXNoKGtleSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBlbnN1cmVDaHVua3MoZm9jdXM6IFRIUkVFLlZlY3RvcjMsIGltbWVkaWF0ZTogYm9vbGVhbiwgZnJhbWVTdGFydCA9IHBlcmZvcm1hbmNlLm5vdygpKTogdm9pZCB7XG4gICAgY29uc3QgY2N4ID0gd29ybGRUb0NodW5rWChNYXRoLnJvdW5kKGZvY3VzLngpKTtcbiAgICBjb25zdCBjY3ogPSB3b3JsZFRvQ2h1bmtaKE1hdGgucm91bmQoZm9jdXMueikpO1xuICAgIGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cbiAgICBjb25zdCBtaXNzaW5nOiBBcnJheTx7IGN4OiBudW1iZXI7IGN6OiBudW1iZXI7IGQ6IG51bWJlciB9PiA9IFtdO1xuICAgIGZvciAobGV0IGR6ID0gLXRoaXMubmVhclJhZGl1czsgZHogPD0gdGhpcy5uZWFyUmFkaXVzOyBkeisrKSB7XG4gICAgICBmb3IgKGxldCBkeCA9IC10aGlzLm5lYXJSYWRpdXM7IGR4IDw9IHRoaXMubmVhclJhZGl1czsgZHgrKykge1xuICAgICAgICBjb25zdCBjeCA9IGNjeCArIGR4LCBjeiA9IGNjeiArIGR6O1xuICAgICAgICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSBjb250aW51ZTtcbiAgICAgICAgaWYgKHRoaXMubG9hZGVkLmhhcyhjaHVua0tleShjeCwgY3opKSkgY29udGludWU7XG4gICAgICAgIG1pc3NpbmcucHVzaCh7IGN4LCBjeiwgZDogZHggKiBkeCArIGR6ICogZHogfSk7XG4gICAgICB9XG4gICAgfVxuICAgIG1pc3Npbmcuc29ydCgoYSwgYikgPT4gYS5kIC0gYi5kKTtcbiAgICBsZXQgYnVpbHQgPSAwO1xuICAgIGlmICh0aGlzLnBvb2wgJiYgIWltbWVkaWF0ZSAmJiAhdGhpcy5wb29sLmZhaWxlZCkge1xuICAgICAgdGhpcy5lbnN1cmVDaHVua3NBc3luYyhtaXNzaW5nKTtcbiAgICAgIG1pc3NpbmcubGVuZ3RoID0gMDtcbiAgICB9XG4gICAgZm9yIChjb25zdCBtIG9mIG1pc3NpbmcpIHtcbiAgICAgIGlmICghaW1tZWRpYXRlICYmIGJ1aWx0ID4gMCAmJiBwZXJmb3JtYW5jZS5ub3coKSAtIGZyYW1lU3RhcnQgPj0gdGhpcy5mcmFtZUJ1ZGdldE1zKSBicmVhaztcbiAgICAgIHRoaXMuYnVpbGRDaHVuayhtLmN4LCBtLmN6KTtcbiAgICAgIGJ1aWx0Kys7XG4gICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICB9XG4gICAgdGhpcy5wZW5kaW5nQ2h1bmtzID0gdGhpcy5wb29sICYmICFpbW1lZGlhdGUgPyB0aGlzLm1lc2hTdGFtcC5zaXplICsgdGhpcy5nZW5lcmF0aW5nLnNpemUgOiBtaXNzaW5nLmxlbmd0aCAtIGJ1aWx0O1xuXG4gICAgY29uc3QgbWFyZ2luID0gdGhpcy5uZWFyUmFkaXVzICsgMTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbLi4udGhpcy5sb2FkZWRdKSB7XG4gICAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgICAgaWYgKE1hdGguYWJzKGN4IC0gY2N4KSA+IG1hcmdpbiB8fCBNYXRoLmFicyhjeiAtIGNjeikgPiBtYXJnaW4pIHtcbiAgICAgICAgdGhpcy5kaXNwb3NlQ2h1bmsoa2V5KTtcbiAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGNoYW5nZWQpIHRoaXMub25DaHVua3NDaGFuZ2VkPy4oKTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRDaHVuayhjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgICBjb25zdCBnZW5CZWZvcmUgPSB0aGlzLndvcmxkLnN0YXRzLmdlbmVyYXRpb25NcztcbiAgICBjb25zdCBjaHVua3NCZWZvcmUgPSB0aGlzLndvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZDtcbiAgICAvLyBFbnN1cmUgdGhlIDN4MyBuZWlnaGJvdXJob29kIGV4aXN0cyBzbyBib3VuZGFyeSBmYWNlcyB1c2UgcmVhbCBkYXRhLlxuICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIHtcbiAgICAgIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIGVuc3VyZUNodW5rKHRoaXMud29ybGQsIGN4ICsgZHgsIGN6ICsgZHopO1xuICAgIH1cbiAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHRoaXMud29ybGQsIGN4LCBjeik7XG4gICAgaWYgKCFjaHVuaykgcmV0dXJuO1xuICAgIGNvbnN0IGdlbmVyYXRlZCA9IHRoaXMud29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkIC0gY2h1bmtzQmVmb3JlO1xuICAgIGlmIChnZW5lcmF0ZWQgPiAwKSB7XG4gICAgICByZWNvcmRTYW1wbGUodGhpcy5jaHVua0dlblNhbXBsZXMsICh0aGlzLndvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyAtIGdlbkJlZm9yZSkgLyBnZW5lcmF0ZWQpO1xuICAgIH1cblxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICB0aGlzLm5lYXJHcm91cC5yZW1vdmUoZXhpc3RpbmcubWVzaCk7XG4gICAgICBleGlzdGluZy5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAgIGlmIChleGlzdGluZy53YXRlcikgeyB0aGlzLndhdGVyR3JvdXAucmVtb3ZlKGV4aXN0aW5nLndhdGVyKTsgZXhpc3Rpbmcud2F0ZXIuZ2VvbWV0cnkuZGlzcG9zZSgpOyB9XG4gICAgfVxuXG4gICAgY29uc3QgbWVzaFQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgY29uc3QgeyBnZW9tZXRyeSwgdHJpYW5nbGVzIH0gPSBtZXNoQ2h1bmsodGhpcy53b3JsZCwgY2h1bmspO1xuICAgIHJlY29yZFNhbXBsZSh0aGlzLmNodW5rTWVzaFNhbXBsZXMsIHBlcmZvcm1hbmNlLm5vdygpIC0gbWVzaFQwKTtcbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIHRlcnJhaW5NYXRlcmlhbCk7XG4gICAgbWVzaC5uYW1lID0gYHZveGVsX2NodW5rXyR7Y3h9XyR7Y3p9YDtcbiAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xuICAgIG1lc2guY2FzdFNoYWRvdyA9IGZhbHNlO1xuICAgIHRoaXMubmVhckdyb3VwLmFkZChtZXNoKTtcbiAgICBjb25zdCB3YXRlciA9IG1lc2hDaHVua1dhdGVyKHRoaXMud29ybGQsIGNodW5rKTtcbiAgICBpZiAod2F0ZXIpIHRoaXMud2F0ZXJHcm91cC5hZGQod2F0ZXIpO1xuICAgIHRoaXMuY2h1bmtzLnNldChrZXksIHsgbWVzaCwgd2F0ZXIsIHRyaWFuZ2xlczogdHJpYW5nbGVzICsgKHdhdGVyPy51c2VyRGF0YS53YXRlclRyaWFuZ2xlcyA/PyAwKSB9KTtcbiAgICB0aGlzLmxvYWRlZC5hZGQoa2V5KTtcbiAgICB0aGlzLndvcmxkLmRpcnR5LmRlbGV0ZShrZXkpO1xuICB9XG5cbiAgcHJpdmF0ZSBkaXNwb3NlQ2h1bmsoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCB2aWV3ID0gdGhpcy5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKHZpZXcpIHtcbiAgICAgIHRoaXMubmVhckdyb3VwLnJlbW92ZSh2aWV3Lm1lc2gpO1xuICAgICAgdmlldy5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAgIGlmICh2aWV3LndhdGVyKSB7IHRoaXMud2F0ZXJHcm91cC5yZW1vdmUodmlldy53YXRlcik7IHZpZXcud2F0ZXIuZ2VvbWV0cnkuZGlzcG9zZSgpOyB9XG4gICAgICB0aGlzLmNodW5rcy5kZWxldGUoa2V5KTtcbiAgICB9XG4gICAgdGhpcy5sb2FkZWQuZGVsZXRlKGtleSk7XG4gICAgdGhpcy5tZXNoU3RhbXAuZGVsZXRlKGtleSk7XG4gICAgaWYgKHRoaXMucGlubmVkLmhhcyhrZXkpKSByZXR1cm47XG4gICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgICBldmljdENodW5rKHRoaXMud29ybGQsIGtleSk7XG4gIH1cblxuICBwcml2YXRlIHJlYnVpbGRDaHVuayhrZXk6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgdGhpcy5idWlsZENodW5rKGN4LCBjeik7XG4gIH1cblxuICAvKiogUmUtbWVzaCBkaXJ0eSBsb2FkZWQgY2h1bmtzIG5lYXJlc3QtZmlyc3QsIHNoYXJpbmcgdGhlIGZyYW1lIGJ1ZGdldC4gKi9cbiAgcHJpdmF0ZSByZWJ1aWxkRGlydHkoZm9jdXM6IFRIUkVFLlZlY3RvcjMsIGZyYW1lU3RhcnQ6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICBjb25zdCBkaXJ0eTogQXJyYXk8eyBrZXk6IHN0cmluZzsgZDogbnVtYmVyIH0+ID0gW107XG4gICAgZm9yIChjb25zdCBrZXkgb2YgdGhpcy5sb2FkZWQpIHtcbiAgICAgIGlmICghdGhpcy53b3JsZC5kaXJ0eS5oYXMoa2V5KSkgY29udGludWU7XG4gICAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgICAgZGlydHkucHVzaCh7IGtleSwgZDogKGN4IC0gY2N4KSAqKiAyICsgKGN6IC0gY2N6KSAqKiAyIH0pO1xuICAgIH1cbiAgICBpZiAoZGlydHkubGVuZ3RoID09PSAwKSByZXR1cm47XG4gICAgZGlydHkuc29ydCgoYSwgYikgPT4gYS5kIC0gYi5kKTtcbiAgICBpZiAodGhpcy5wb29sICYmICF0aGlzLnBvb2wuZmFpbGVkKSB7XG4gICAgICBmb3IgKGNvbnN0IHsga2V5IH0gb2YgZGlydHkpIGlmICghdGhpcy5tZXNoU3RhbXAuaGFzKGtleSkgfHwgdGhpcy53b3JsZC5kaXJ0eS5oYXMoa2V5KSkgdGhpcy5yZXF1ZXN0TWVzaChrZXkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgcmVidWlsdCA9IDA7XG4gICAgZm9yIChjb25zdCB7IGtleSB9IG9mIGRpcnR5KSB7XG4gICAgICBpZiAocmVidWlsdCA+IDAgJiYgcGVyZm9ybWFuY2Uubm93KCkgLSBmcmFtZVN0YXJ0ID49IHRoaXMuZnJhbWVCdWRnZXRNcykgYnJlYWs7XG4gICAgICB0aGlzLnJlYnVpbGRDaHVuayhrZXkpO1xuICAgICAgcmVidWlsdCsrO1xuICAgIH1cbiAgICBpZiAocmVidWlsdCA+IDApIHRoaXMub25DaHVua3NDaGFuZ2VkPy4oKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaHVuayBsaWZldGltZSBwb2xpY3kuIE1lc2hpbmcgZ2VuZXJhdGVzIGEgcmluZyBvZiBuZWlnaGJvdXIgY2h1bmtzLCBhbmRcbiAgICogc2ltdWxhdGlvbiBxdWVyaWVzIGNhbiBnZW5lcmF0ZSBtb3JlOyBub25lIG9mIHRob3NlIHdlcmUgZXZlciByZWxlYXNlZC5cbiAgICogUmVzaWRlbnQgY2h1bmsgYnl0ZXMgYXJlIGRlcml2ZWQgKHJlZ2VuZXJhdGVkIGZyb20gc2VlZCArIGR1cmFibGUgZWRpdHMpLFxuICAgKiBzbyBhbnl0aGluZyBvdXRzaWRlIHRoZSBrZWVwIHJhZGl1cyB0aGF0IGlzIG5vdCBsb2FkZWQgb3IgcGlubmVkIGlzIGZyZWVkLlxuICAgKi9cbiAgcHJpdmF0ZSBzd2VlcFJlc2lkZW50KGZvY3VzOiBUSFJFRS5WZWN0b3IzKTogdm9pZCB7XG4gICAgY29uc3QgY2N4ID0gd29ybGRUb0NodW5rWChNYXRoLnJvdW5kKGZvY3VzLngpKTtcbiAgICBjb25zdCBjY3ogPSB3b3JsZFRvQ2h1bmtaKE1hdGgucm91bmQoZm9jdXMueikpO1xuICAgIGNvbnN0IGtlZXAgPSB0aGlzLm5lYXJSYWRpdXMgKyAyO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIFsuLi50aGlzLndvcmxkLmNodW5rcy5rZXlzKCldKSB7XG4gICAgICBpZiAodGhpcy5sb2FkZWQuaGFzKGtleSkgfHwgdGhpcy5waW5uZWQuaGFzKGtleSkgfHwgdGhpcy5tZXNoU3RhbXAuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICAgIGlmIChNYXRoLmFicyhjeCAtIGNjeCkgPD0ga2VlcCAmJiBNYXRoLmFicyhjeiAtIGNjeikgPD0ga2VlcCkgY29udGludWU7XG4gICAgICBldmljdENodW5rKHRoaXMud29ybGQsIGtleSk7XG4gICAgICB0aGlzLndvcmxkLmRpcnR5LmRlbGV0ZShrZXkpO1xuICAgICAgdGhpcy5zd2VwdENodW5rcysrO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBLZWVwIHRoZSBjaHVua3MgdW5kZXIgYSB3b3JsZC1zcGFjZSByZWN0YW5nbGUgcmVzaWRlbnQgKGZvciBleGFtcGxlIHRoZVxuICAgKiBzZXR0bGVtZW50IGVudmVsb3BlIHRoYXQgY29uc3RydWN0aW9uIHByZXZpZXdzIHF1ZXJ5IHNldmVyYWwgdGltZXMgYSBzZWNvbmQpLlxuICAgKi9cbiAgcGluUmVjdChtaW5YOiBudW1iZXIsIG1pblo6IG51bWJlciwgbWF4WDogbnVtYmVyLCBtYXhaOiBudW1iZXIpOiB2b2lkIHtcbiAgICBmb3IgKGxldCBjeiA9IHdvcmxkVG9DaHVua1oobWluWikgLSAxOyBjeiA8PSB3b3JsZFRvQ2h1bmtaKG1heFopICsgMTsgY3orKykge1xuICAgICAgZm9yIChsZXQgY3ggPSB3b3JsZFRvQ2h1bmtYKG1pblgpIC0gMTsgY3ggPD0gd29ybGRUb0NodW5rWChtYXhYKSArIDE7IGN4KyspIHtcbiAgICAgICAgaWYgKGN4ID49IDAgJiYgY3ogPj0gMCAmJiBjeCA8IENIVU5LU19QRVJfU0lERSAmJiBjeiA8IENIVU5LU19QRVJfU0lERSkgdGhpcy5waW5uZWQuYWRkKGNodW5rS2V5KGN4LCBjeikpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCByZXNpZGVudENodW5rcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy53b3JsZC5jaHVua3Muc2l6ZTsgfVxuICBnZXQgcGVuZGluZ0NodW5rQnVpbGRzKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnBlbmRpbmdDaHVua3M7IH1cbiAgZ2V0IGV2aWN0ZWRCeVN3ZWVwKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnN3ZXB0Q2h1bmtzOyB9XG5cbiAgcmVidWlsZEFyb3VuZCh4OiBudW1iZXIsIHo6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIHtcbiAgICAgIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIHtcbiAgICAgICAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3ggKyBkeCwgY3ogKyBkeik7XG4gICAgICAgIHRoaXMubWVzaFN0YW1wLmRlbGV0ZShrZXkpO1xuICAgICAgICBpZiAodGhpcy5sb2FkZWQuaGFzKGtleSkpIHRoaXMucmVidWlsZENodW5rKGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMub25DaHVua3NDaGFuZ2VkPy4oKTtcbiAgICBpZiAodGhpcy5tYWNyby5sZW5ndGgpIHRoaXMucmVidWlsZE1hY3JvKHRoaXMubWFjcm9Gb2N1cywgdGhpcy5tb2RlLCB0cnVlKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVidWlsZE1hY3JvKGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBtb2RlOiBWaWV3TW9kZSwgZm9yY2U6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBpZiAoIWZvcmNlICYmIHRoaXMubWFjcm9Nb2RlID09PSBtb2RlKSB7XG4gICAgICBjb25zdCBtb3ZlZCA9IE1hdGguaHlwb3QoZm9jdXMueCAtIHRoaXMubWFjcm9Gb2N1cy54LCBmb2N1cy56IC0gdGhpcy5tYWNyb0ZvY3VzLnopO1xuICAgICAgaWYgKG1vZGUgPT09ICdtYXAnIHx8IG1vdmVkIDw9IDQ4KSByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG1hY3JvVDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICBmb3IgKGNvbnN0IHRpbGUgb2YgdGhpcy5tYWNybykge1xuICAgICAgdGhpcy5tYWNyb0dyb3VwLnJlbW92ZSh0aWxlKTtcbiAgICAgIHRpbGUuZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICAgIH1cbiAgICB0aGlzLm1hY3JvID0gW107XG4gICAgY29uc3Qgc3RlcCA9IG1vZGUgPT09ICdtYXAnID8gdGhpcy5tYXBNYWNyb1N0ZXAgOiB0aGlzLndvcmxkTWFjcm9TdGVwO1xuICAgIGxldCBob2xlOiBNYWNyb0hvbGUgfCB1bmRlZmluZWQ7XG4gICAgaWYgKG1vZGUgIT09ICdtYXAnKSB7XG4gICAgICBjb25zdCBjY3ggPSB3b3JsZFRvQ2h1bmtYKE1hdGgucm91bmQoZm9jdXMueCkpO1xuICAgICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICAgIGhvbGUgPSB7XG4gICAgICAgIG1pblg6IGNodW5rT3JpZ2luWChjY3ggLSB0aGlzLm5lYXJSYWRpdXMpLFxuICAgICAgICBtYXhYOiBjaHVua09yaWdpblgoY2N4ICsgdGhpcy5uZWFyUmFkaXVzKSArIENIVU5LX1NJWkUsXG4gICAgICAgIG1pblo6IGNodW5rT3JpZ2luWihjY3ogLSB0aGlzLm5lYXJSYWRpdXMpLFxuICAgICAgICBtYXhaOiBjaHVua09yaWdpblooY2N6ICsgdGhpcy5uZWFyUmFkaXVzKSArIENIVU5LX1NJWkUsXG4gICAgICB9O1xuICAgICAgdGhpcy5mYXJXYXRlckhvbGUudmFsdWUuc2V0KGhvbGUubWluWCwgaG9sZS5taW5aLCBob2xlLm1heFgsIGhvbGUubWF4Wik7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGJ1aWxkTWFjcm9NZXNoKHRoaXMud29ybGQsIHsgc3RlcCwgaG9sZSwgZm9jdXM6IG1vZGUgPT09ICdtYXAnID8gdW5kZWZpbmVkIDogZm9jdXMgfSk7XG4gICAgdGhpcy5tYWNybyA9IHJlc3VsdC5tZXNoZXM7XG4gICAgdGhpcy5tYWNyb1RyaWFuZ2xlcyA9IHJlc3VsdC50cmlhbmdsZXM7XG4gICAgdGhpcy5tYWNyb0dyb3VwLmFkZCguLi5yZXN1bHQubWVzaGVzKTtcbiAgICB0aGlzLm1hY3JvRm9jdXMuY29weShmb2N1cyk7XG4gICAgdGhpcy5tYWNyb01vZGUgPSBtb2RlO1xuICAgIHRoaXMubWFjcm9FZGl0S2V5ID0gbWFjcm9FZGl0S2V5KHRoaXMud29ybGQpO1xuICAgIHJlY29yZFNhbXBsZSh0aGlzLm1hY3JvU2FtcGxlcywgcGVyZm9ybWFuY2Uubm93KCkgLSBtYWNyb1QwKTtcbiAgICBpZiAocmVzdWx0LnNhbXBsZUNhY2hlZCkgdGhpcy5tYWNyb0NhY2hlSGl0cysrO1xuICAgIGVsc2UgcmVjb3JkU2FtcGxlKHRoaXMubWFjcm9TYW1wbGVTYW1wbGVzLCByZXN1bHQuc2FtcGxlTXMpO1xuICB9XG5cbiAgZ2V0IGxvYWRlZENodW5rcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5sb2FkZWQuc2l6ZTsgfVxuICBnZXQgbG9hZGVkQ2h1bmtLZXlzKCk6IFJlYWRvbmx5U2V0PHN0cmluZz4geyByZXR1cm4gdGhpcy5sb2FkZWQ7IH1cbiAgZ2V0IG5lYXJUcmlhbmdsZXMoKTogbnVtYmVyIHtcbiAgICBsZXQgdCA9IDA7XG4gICAgZm9yIChjb25zdCB2IG9mIHRoaXMuY2h1bmtzLnZhbHVlcygpKSB0ICs9IHYudHJpYW5nbGVzO1xuICAgIHJldHVybiB0O1xuICB9XG4gIGdldCBtYWNyb1RyaWFuZ2xlQ291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubWFjcm9UcmlhbmdsZXM7IH1cbiAgLyoqIFRyaWFuZ2xlcyBvZiB0aGUgbWFjcm8gdGlsZXMgbGVmdCB2aXNpYmxlIGJ5IHRoZSBsYXN0IGN1bGxNYWNybyBjYWxsLiAqL1xuICBnZXQgbWFjcm9WaXNpYmxlVHJpYW5nbGVzKCk6IG51bWJlciB7XG4gICAgbGV0IHQgPSAwO1xuICAgIGZvciAoY29uc3QgdGlsZSBvZiB0aGlzLm1hY3JvKSBpZiAodGlsZS52aXNpYmxlKSB0ICs9ICh0aWxlLmdlb21ldHJ5LmluZGV4Py5jb3VudCA/PyAwKSAvIDM7XG4gICAgcmV0dXJuIHQ7XG4gIH1cblxuICAvKipcbiAgICogSGlkZSBtYWNybyB0aWxlcyB3aG9zZSBib3VuZGluZyBib3ggaXMgb3V0c2lkZSB0aGUgY2FtZXJhIGZydXN0dW0uIFRocmVlXG4gICAqIG9ubHkgY3VsbHMgYnkgYm91bmRpbmcgc3BoZXJlLCB3aGljaCBuZXZlciByZWplY3RzIGEgMjU2IG0gdGlsZSBuZXh0IHRvXG4gICAqIHRoZSBjYW1lcmE7IHRoZSBib3ggdGVzdCBhbHNvIGRyb3BzIGZhciB0aWxlcyBiZWxvdyB0aGUgZnJ1c3R1bSB3aGVuIHRoZVxuICAgKiBjYW1lcmEgcGl0Y2hlcyBkb3duLiBQcmVzZW50YXRpb24gb25seSwgY2FsbCBvbmNlIHBlciBmcmFtZSBiZWZvcmUgcmVuZGVyLlxuICAgKi9cbiAgY3VsbE1hY3JvKGNhbWVyYTogVEhSRUUuQ2FtZXJhKTogdm9pZCB7XG4gICAgaWYgKHRoaXMubWFjcm8ubGVuZ3RoIDw9IDEpIHsgZm9yIChjb25zdCB0aWxlIG9mIHRoaXMubWFjcm8pIHRpbGUudmlzaWJsZSA9IHRydWU7IHJldHVybjsgfVxuICAgIGNhbWVyYS51cGRhdGVNYXRyaXhXb3JsZCgpO1xuICAgIF9jdWxsTWF0cml4Lm11bHRpcGx5TWF0cmljZXMoY2FtZXJhLnByb2plY3Rpb25NYXRyaXgsIGNhbWVyYS5tYXRyaXhXb3JsZEludmVyc2UpO1xuICAgIF9jdWxsRnJ1c3R1bS5zZXRGcm9tUHJvamVjdGlvbk1hdHJpeChfY3VsbE1hdHJpeCk7XG4gICAgZm9yIChjb25zdCB0aWxlIG9mIHRoaXMubWFjcm8pIHtcbiAgICAgIGNvbnN0IGJveCA9IHRpbGUuZ2VvbWV0cnkuYm91bmRpbmdCb3g7XG4gICAgICB0aWxlLnZpc2libGUgPSAhYm94IHx8IF9jdWxsRnJ1c3R1bS5pbnRlcnNlY3RzQm94KGJveCk7XG4gICAgfVxuICB9XG4gIGdldCBkcmF3Q2FsbHMoKTogbnVtYmVyIHtcbiAgICBsZXQgd2F0ZXIgPSAwO1xuICAgIGZvciAoY29uc3QgdiBvZiB0aGlzLmNodW5rcy52YWx1ZXMoKSkgaWYgKHYud2F0ZXIpIHdhdGVyKys7XG4gICAgbGV0IG1hY3JvID0gMDtcbiAgICBmb3IgKGNvbnN0IHRpbGUgb2YgdGhpcy5tYWNybykgaWYgKHRpbGUudmlzaWJsZSkgbWFjcm8rKztcbiAgICByZXR1cm4gdGhpcy5sb2FkZWQuc2l6ZSArIHdhdGVyICsgbWFjcm8gKyAxO1xuICB9XG4gIGdldCBuZWFyUmFkaXVzQ2h1bmtzKCk6IG51bWJlciB7IHJldHVybiB0aGlzLm5lYXJSYWRpdXM7IH1cbiAgLyoqIENsZWFyIHRoZSByb2xsaW5nIHRpbWluZyB3aW5kb3cgYmVmb3JlIGEgbWVhc3VyZW1lbnQgcnVuLiAqL1xuICByZXNldFBlcmYoKTogdm9pZCB7XG4gICAgdGhpcy5jaHVua0dlblNhbXBsZXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLmNodW5rTWVzaFNhbXBsZXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLm1hY3JvU2FtcGxlcy5sZW5ndGggPSAwO1xuICAgIHRoaXMubWFjcm9TYW1wbGVTYW1wbGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5tYWNyb0NhY2hlSGl0cyA9IDA7XG4gIH1cbiAgLyoqIFJvbGxpbmcgYnVpbGQgdGltaW5ncyBpbiBtaWxsaXNlY29uZHMsIGZvciB0aGUgcGVyZm9ybWFuY2UgZXZpZGVuY2UuICovXG4gIGdldCBzdHJlYW1QZXJmKCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICAgIHJldHVybiB7XG4gICAgICBjaHVua0dlblA1MDogcGVyY2VudGlsZSh0aGlzLmNodW5rR2VuU2FtcGxlcywgMC41KSxcbiAgICAgIGNodW5rR2VuUDk1OiBwZXJjZW50aWxlKHRoaXMuY2h1bmtHZW5TYW1wbGVzLCAwLjk1KSxcbiAgICAgIGNodW5rR2VuTWF4OiBwZXJjZW50aWxlKHRoaXMuY2h1bmtHZW5TYW1wbGVzLCAxKSxcbiAgICAgIGNodW5rTWVzaFA1MDogcGVyY2VudGlsZSh0aGlzLmNodW5rTWVzaFNhbXBsZXMsIDAuNSksXG4gICAgICBjaHVua01lc2hQOTU6IHBlcmNlbnRpbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCAwLjk1KSxcbiAgICAgIGNodW5rTWVzaE1heDogcGVyY2VudGlsZSh0aGlzLmNodW5rTWVzaFNhbXBsZXMsIDEpLFxuICAgICAgbWFjcm9QNTA6IHBlcmNlbnRpbGUodGhpcy5tYWNyb1NhbXBsZXMsIDAuNSksXG4gICAgICBtYWNyb01heDogcGVyY2VudGlsZSh0aGlzLm1hY3JvU2FtcGxlcywgMSksXG4gICAgICBtYWNyb1NhbXBsZVA1MDogcGVyY2VudGlsZSh0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcywgMC41KSxcbiAgICAgIG1hY3JvU2FtcGxlTWF4OiBwZXJjZW50aWxlKHRoaXMubWFjcm9TYW1wbGVTYW1wbGVzLCAxKSxcbiAgICAgIG1hY3JvQ2FjaGVIaXRzOiB0aGlzLm1hY3JvQ2FjaGVIaXRzLFxuICAgICAgY2h1bmtTYW1wbGVzOiB0aGlzLmNodW5rR2VuU2FtcGxlcy5sZW5ndGgsXG4gICAgICBtYWNyb1NhbXBsZXM6IHRoaXMubWFjcm9TYW1wbGVzLmxlbmd0aCxcbiAgICB9O1xuICB9XG59XG4iLCAiLy8gUmVuZGVyIGxheWVyIFx1MjAxNCBuZWFyIHdhdGVyIHN1cmZhY2VzIGJ1aWx0IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd2F0ZXIgdm94ZWxzLlxuLy9cbi8vIEdlb21ldHJ5IGNvbWVzIGZyb20gdGhlIHZveGVsIHZvbHVtZSAoc28gZWRpdHMsIGR1ZyBwaXRzIGFuZCB0aGUgdjIgbW91bnRhaW5cbi8vIHJpdmVyIGFyZSBleGFjdCkuIEVhY2ggd2F0ZXIgY29sdW1uJ3MgdG9wIGdldHMgYSBxdWFkIGNhcnJ5aW5nOlxuLy8gICBhRmxvdyAgXHUyMDE0IHN1cmZhY2UgY3VycmVudCAoZGlyZWN0aW9uICogc3BlZWQsIG0vcykgZnJvbSBzaW0gSHlkcm9sb2d5LFxuLy8gICBhRGVwdGggXHUyMDE0IHdhdGVyIGRlcHRoIHRvIHRoZSBiZWQgKG1ldHJlcyksXG4vLyAgIGFGb2FtICBcdTIwMTQgc2hvcmUgLyBjYXNjYWRlIGZvYW0gd2VpZ2h0LlxuLy8gV2hlcmUgYSB3YXRlciBzdXJmYWNlIHN0YW5kcyBhYm92ZSBhIGxvd2VyIG5laWdoYm91ciAoYSBjYXNjYWRlIG9yIGZhbGwpLCBhXG4vLyB2ZXJ0aWNhbCBzaGVldCBpcyBlbWl0dGVkIGRvd24gdG8gdGhlIG5laWdoYm91cidzIHN1cmZhY2UuXG4vL1xuLy8gSHlkcm9sb2d5IGlzIHNpbXVsYXRpb24gZGF0YTsgcmlwcGxlcywgZm9hbSBhbmQgdHJhbnNwYXJlbmN5IGhlcmUgYXJlXG4vLyBwcmVzZW50YXRpb24gb25seSBhbmQgbmV2ZXIgZmVlZCBiYWNrIGludG8gc3RhdGUuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQge1xuICBXb3JsZCwgVm94ZWxDaHVuaywgTUFULCBDSFVOS19TSVpFLCBZX01JTiwgWV9NQVgsIGlzU29saWQsXG4gIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCwgZ2V0Vm94ZWwsIGh5ZHJvbG9neUZvcixcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcblxuY29uc3QgTSA9IHBhbGV0dGUubWF0ZXJpYWxzIGFzIFJlY29yZDxzdHJpbmcsIHsgaGV4OiBzdHJpbmcgfT47XG5jb25zdCBIID0gKGs6IHN0cmluZykgPT4gbmV3IFRIUkVFLkNvbG9yKE1ba10uaGV4KTtcblxuLyoqIFNoYXJlZCB0aW1lIHVuaWZvcm0gZm9yIGV2ZXJ5IHdhdGVyIG1hdGVyaWFsLiAqL1xuZXhwb3J0IGNvbnN0IHdhdGVyVGltZSA9IHsgdmFsdWU6IDAgfTtcblxuZnVuY3Rpb24gbWFrZVdhdGVyTWF0ZXJpYWwoKTogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCB7XG4gIGNvbnN0IG1hdCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICB2ZXJ0ZXhDb2xvcnM6IHRydWUsIHRyYW5zcGFyZW50OiB0cnVlLCBkZXB0aFdyaXRlOiBmYWxzZSwgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcbiAgfSk7XG4gIG1hdC5vbkJlZm9yZUNvbXBpbGUgPSAoc2hhZGVyKSA9PiB7XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVUaW1lID0gd2F0ZXJUaW1lO1xuICAgIHNoYWRlci51bmlmb3Jtcy51U2hhbGxvdyA9IHsgdmFsdWU6IEgoJ3dhdGVyX3NoYWxsb3cnKSB9O1xuICAgIHNoYWRlci51bmlmb3Jtcy51TWlkID0geyB2YWx1ZTogSCgnd2F0ZXJfbWlkJykgfTtcbiAgICBzaGFkZXIudW5pZm9ybXMudURlZXAgPSB7IHZhbHVlOiBIKCd3YXRlcl9kZWVwJykgfTtcbiAgICBzaGFkZXIudW5pZm9ybXMudVJpbSA9IHsgdmFsdWU6IEgoJ3dhdGVyX3JpbScpIH07XG4gICAgc2hhZGVyLnZlcnRleFNoYWRlciA9IHNoYWRlci52ZXJ0ZXhTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsIGAjaW5jbHVkZSA8Y29tbW9uPlxuYXR0cmlidXRlIHZlYzIgYUZsb3c7XG5hdHRyaWJ1dGUgZmxvYXQgYURlcHRoO1xuYXR0cmlidXRlIGZsb2F0IGFGb2FtO1xuYXR0cmlidXRlIGZsb2F0IGFTaGVldDtcbnZhcnlpbmcgdmVjMiB2RmxvdztcbnZhcnlpbmcgZmxvYXQgdkRlcHRoO1xudmFyeWluZyBmbG9hdCB2Rm9hbTtcbnZhcnlpbmcgZmxvYXQgdlNoZWV0O1xudmFyeWluZyB2ZWMzIHZXb3JsZFBvc1c7YClcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PicsIGAjaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxudkZsb3cgPSBhRmxvdzsgdkRlcHRoID0gYURlcHRoOyB2Rm9hbSA9IGFGb2FtOyB2U2hlZXQgPSBhU2hlZXQ7XG52V29ybGRQb3NXID0gKG1vZGVsTWF0cml4ICogdmVjNCh0cmFuc2Zvcm1lZCwgMS4wKSkueHl6O2ApO1xuICAgIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgYCNpbmNsdWRlIDxjb21tb24+XG51bmlmb3JtIGZsb2F0IHVUaW1lO1xudW5pZm9ybSB2ZWMzIHVTaGFsbG93OyB1bmlmb3JtIHZlYzMgdU1pZDsgdW5pZm9ybSB2ZWMzIHVEZWVwOyB1bmlmb3JtIHZlYzMgdVJpbTtcbnZhcnlpbmcgdmVjMiB2RmxvdztcbnZhcnlpbmcgZmxvYXQgdkRlcHRoO1xudmFyeWluZyBmbG9hdCB2Rm9hbTtcbnZhcnlpbmcgZmxvYXQgdlNoZWV0O1xudmFyeWluZyB2ZWMzIHZXb3JsZFBvc1c7XG5mbG9hdCB3SGFzaCh2ZWMyIHApIHsgcmV0dXJuIGZyYWN0KHNpbihkb3QocCwgdmVjMigxMjcuMSwgMzExLjcpKSkgKiA0Mzc1OC41NDUzKTsgfVxuZmxvYXQgd05vaXNlKHZlYzIgcCkge1xuICB2ZWMyIGkgPSBmbG9vcihwKSwgZiA9IGZyYWN0KHApO1xuICBmID0gZiAqIGYgKiAoMy4wIC0gMi4wICogZik7XG4gIHJldHVybiBtaXgobWl4KHdIYXNoKGkpLCB3SGFzaChpICsgdmVjMigxLCAwKSksIGYueCksIG1peCh3SGFzaChpICsgdmVjMigwLCAxKSksIHdIYXNoKGkgKyB2ZWMyKDEsIDEpKSwgZi54KSwgZi55KTtcbn1gKVxuICAgICAgLnJlcGxhY2UoJ3ZlYzQgZGlmZnVzZUNvbG9yID0gdmVjNCggZGlmZnVzZSwgb3BhY2l0eSApOycsIGBcbmZsb2F0IHNwZWVkID0gbGVuZ3RoKHZGbG93KTtcbi8vIEFkdmVjdCB0aGUgcGF0dGVybiBkb3duc3RyZWFtLiBRdWFudGlzZWQgdG8gMC4yNSBtIGNlbGxzIHNvIHJpcHBsZXMgcmVhZCBhc1xuLy8gYmxvY2stYnVpbHQgZmFjZXRzIHJhdGhlciB0aGFuIHNtb290aCBncmFkaWVudHMuXG52ZWMyIHAgPSB2V29ybGRQb3NXLnh6O1xudmVjMiBhZHYgPSBwIC0gdkZsb3cgKiB1VGltZTtcbnZlYzIgY2VsbCA9IGZsb29yKGFkdiAqIDQuMCkgLyA0LjA7XG5mbG9hdCBuMSA9IHdOb2lzZShjZWxsICogMC41NSk7XG5mbG9hdCBuMiA9IHdOb2lzZShjZWxsICogMS43ICsgdmVjMih1VGltZSAqIDAuMDcsIC11VGltZSAqIDAuMDUpKTtcbmZsb2F0IHJpcHBsZSA9IG4xICogMC42ICsgbjIgKiAwLjQ7XG4vLyBTdGlsbCB3YXRlciAoc2VhLCBsYWtlKSBnZXRzIGEgc2xvdyBzd2VsbCBpbnN0ZWFkIG9mIGEgY3VycmVudC5cbmZsb2F0IHN3ZWxsID0gMC41ICsgMC41ICogc2luKGRvdChwLCB2ZWMyKDAuMTEsIDAuMDcpKSArIHVUaW1lICogMC42KTtcbnJpcHBsZSA9IG1peChtaXgocmlwcGxlLCBzd2VsbCwgMC41KSwgcmlwcGxlLCBjbGFtcChzcGVlZCAqIDIuMCwgMC4wLCAxLjApKTtcbmZsb2F0IGQgPSBjbGFtcCh2RGVwdGggLyA0LjAsIDAuMCwgMS4wKTtcbnZlYzMgd2F0ZXIgPSBtaXgodVNoYWxsb3csIHVNaWQsIHNtb290aHN0ZXAoMC4wLCAwLjUsIGQpKTtcbndhdGVyID0gbWl4KHdhdGVyLCB1RGVlcCwgc21vb3Roc3RlcCgwLjUsIDEuMCwgZCkpO1xud2F0ZXIgKj0gMC45ICsgMC4yICogcmlwcGxlO1xuLy8gU3RyZWFrcyBhbG9uZyBmYXN0IGN1cnJlbnQsIGZvYW0gYXQgc2hvcmVzIGFuZCBjYXNjYWRlcy5cbmZsb2F0IHN0cmVhayA9IHN0ZXAoMC43OCAtIGNsYW1wKHNwZWVkICogMC4wNiwgMC4wLCAwLjIpLCBuMikgKiBjbGFtcChzcGVlZCAqIDAuNSwgMC4wLCAxLjApO1xuZmxvYXQgZm9hbU5vaXNlID0gc3RlcCgwLjQ1LCB3Tm9pc2UoY2VsbCAqIDIuMyArIHVUaW1lICogMC4zKSk7XG5mbG9hdCBmb2FtID0gY2xhbXAodkZvYW0gKiBmb2FtTm9pc2UgKyBzdHJlYWsgKiAwLjYsIDAuMCwgMS4wKTtcbi8vIEZhbGxpbmcgc2hlZXRzOiBmYXN0IHZlcnRpY2FsIHN0cmVha3MuXG5pZiAodlNoZWV0ID4gMC41KSB7XG4gIGZsb2F0IGZhbGwgPSB3Tm9pc2UodmVjMihmbG9vcih2V29ybGRQb3NXLnggKiA0LjAgKyB2V29ybGRQb3NXLnogKiA0LjApLCBmbG9vcigodldvcmxkUG9zVy55ICsgdVRpbWUgKiAzLjUpICogMy4wKSkpO1xuICBmb2FtID0gbWF4KGZvYW0sIHN0ZXAoMC4zNSwgZmFsbCkpO1xufVxudmVjMyBjb2wgPSBtaXgod2F0ZXIsIHVSaW0gKiAxLjA4LCBmb2FtKTtcbmZsb2F0IGFscGhhID0gbWl4KDAuNTUsIDAuOSwgc21vb3Roc3RlcCgwLjQsIDMuMCwgdkRlcHRoKSk7XG5hbHBoYSA9IG1heChhbHBoYSwgZm9hbSAqIDAuOTUpO1xuaWYgKHZTaGVldCA+IDAuNSkgYWxwaGEgPSBtYXgoYWxwaGEsIDAuODIpO1xudmVjNCBkaWZmdXNlQ29sb3IgPSB2ZWM0KCBkaWZmdXNlICogY29sLCBhbHBoYSAqIG9wYWNpdHkgKTtgKTtcbiAgfTtcbiAgcmV0dXJuIG1hdDtcbn1cblxuZXhwb3J0IGNvbnN0IG5lYXJXYXRlck1hdGVyaWFsID0gbWFrZVdhdGVyTWF0ZXJpYWwoKTtcblxuLyoqIE1lc2ggdGhlIHdhdGVyIHN1cmZhY2VzIG9mIG9uZSBjaHVuazsgbnVsbCB3aGVuIHRoZSBjaHVuayBob2xkcyBubyB3YXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXNoQ2h1bmtXYXRlcih3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogVEhSRUUuTWVzaCB8IG51bGwge1xuICBjb25zdCBoeWRybyA9IGh5ZHJvbG9neUZvcih3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbik7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBsZXZlbHMgPSBuZXcgSW50MTZBcnJheShDSFVOS19TSVpFICogQ0hVTktfU0laRSkuZmlsbCgtOTk5OSk7XG4gIGNvbnN0IGJlZHMgPSBuZXcgSW50MTZBcnJheShDSFVOS19TSVpFICogQ0hVTktfU0laRSk7XG5cbiAgLy8gV2F0ZXIgc3VyZmFjZSBwZXIgY29sdW1uOiB0aGUgZmlyc3Qgbm9uLXdhdGVyIGNlbGwgYWJvdmUgdGhlIHdhdGVyIHRoYXRcbiAgLy8gc3RhbmRzIG9uIHRoaXMgY29sdW1uJ3Mgc29saWQgc3VyZmFjZS5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb25zdCBiZWQgPSBjaHVuay5oZWlnaHRzW2NvbF0gKyBZX01JTiArIDE7XG4gICAgICBsZXQgeSA9IGJlZDtcbiAgICAgIHdoaWxlICh5IDwgWV9NQVggJiYgY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9PT0gTUFULldBVEVSKSB5Kys7XG4gICAgICBpZiAoeSA+IGJlZCkgeyBsZXZlbHNbY29sXSA9IHk7IGJlZHNbY29sXSA9IGJlZDsgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHBvczogbnVtYmVyW10gPSBbXSwgbnJtOiBudW1iZXJbXSA9IFtdLCBjbHI6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGZsb3c6IG51bWJlcltdID0gW10sIGRlcHRoOiBudW1iZXJbXSA9IFtdLCBmb2FtOiBudW1iZXJbXSA9IFtdLCBzaGVldDogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgaWR4OiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBwdXNoID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG54OiBudW1iZXIsIG55OiBudW1iZXIsIG56OiBudW1iZXIsXG4gICAgZng6IG51bWJlciwgZno6IG51bWJlciwgZGVwOiBudW1iZXIsIGZvOiBudW1iZXIsIHNoOiBudW1iZXIpID0+IHtcbiAgICBwb3MucHVzaCh4LCB5LCB6KTsgbnJtLnB1c2gobngsIG55LCBueik7IGNsci5wdXNoKDEsIDEsIDEpO1xuICAgIGZsb3cucHVzaChmeCwgZnopOyBkZXB0aC5wdXNoKGRlcCk7IGZvYW0ucHVzaChmbyk7IHNoZWV0LnB1c2goc2gpO1xuICB9O1xuICBjb25zdCBxdWFkID0gKGJhc2U6IG51bWJlcikgPT4geyBpZHgucHVzaChiYXNlLCBiYXNlICsgMSwgYmFzZSArIDIsIGJhc2UsIGJhc2UgKyAyLCBiYXNlICsgMyk7IH07XG5cbiAgY29uc3QgbGV2ZWxBdCA9ICh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBpZiAobHggPj0gMCAmJiBseiA+PSAwICYmIGx4IDwgQ0hVTktfU0laRSAmJiBseiA8IENIVU5LX1NJWkUpIHJldHVybiBsZXZlbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICAgIC8vIE5laWdoYm91ciBjaHVuazogcmVhZCB0aGUgdm94ZWxzIChjaHVua3MgYXJlIGdlbmVyYXRlZCBpbiAzeDMgcmluZ3MgZm9yIG1lc2hpbmcpLlxuICAgIGxldCB5ID0gWV9NQVggLSAxO1xuICAgIHdoaWxlICh5ID4gWV9NSU4gJiYgIWlzU29saWQoZ2V0Vm94ZWwod29ybGQsIHd4LCB5LCB3eikpICYmIGdldFZveGVsKHdvcmxkLCB3eCwgeSwgd3opICE9PSBNQVQuV0FURVIpIHktLTtcbiAgICByZXR1cm4gZ2V0Vm94ZWwod29ybGQsIHd4LCB5LCB3eikgPT09IE1BVC5XQVRFUiA/IHkgKyAxIDogLTk5OTk7XG4gIH07XG5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb25zdCBsZXZlbCA9IGxldmVsc1tjb2xdO1xuICAgICAgaWYgKGxldmVsID09PSAtOTk5OSkgY29udGludWU7XG4gICAgICBjb25zdCB4ID0gb3ggKyBseCwgeiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBmID0gaHlkcm8uZmxvd0F0KHggKyAwLjUsIHogKyAwLjUsIGxldmVsKTtcbiAgICAgIGNvbnN0IGZ4ID0gZi5keCAqIGYuc3BlZWQsIGZ6ID0gZi5keiAqIGYuc3BlZWQ7XG4gICAgICBjb25zdCBkZXAgPSBsZXZlbCAtIGJlZHNbY29sXTtcbiAgICAgIGxldCBzaG9yZSA9IDA7XG4gICAgICBjb25zdCBzaWRlczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWzEsIDBdLCBbLTEsIDBdLCBbMCwgMV0sIFswLCAtMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBzaWRlcykge1xuICAgICAgICBjb25zdCBtID0gZ2V0Vm94ZWwod29ybGQsIHggKyBkeCwgbGV2ZWwgLSAxLCB6ICsgZHopO1xuICAgICAgICBpZiAoaXNTb2xpZChtKSkgc2hvcmUgPSAxO1xuICAgICAgfVxuICAgICAgY29uc3QgeSA9IGxldmVsIC0gMC4xO1xuICAgICAgY29uc3QgYmFzZSA9IHBvcy5sZW5ndGggLyAzO1xuICAgICAgY29uc3QgZm8gPSBNYXRoLm1heChzaG9yZSAqIDAuNjUsIE1hdGgubWluKDEsIGYuc3BlZWQgLyAzLjUpKTtcbiAgICAgIHB1c2goeCwgeSwgeiwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHB1c2goeCwgeSwgeiArIDEsIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBwdXNoKHggKyAxLCB5LCB6ICsgMSwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHB1c2goeCArIDEsIHksIHosIDAsIDEsIDAsIGZ4LCBmeiwgZGVwLCBmbywgMCk7XG4gICAgICBxdWFkKGJhc2UpO1xuXG4gICAgICAvLyBDYXNjYWRlIHNoZWV0cyB0b3dhcmQgbG93ZXIgd2F0ZXIgKG9yIG9wZW4gYWlyKSBvbiBhbnkgc2lkZS5cbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2Ygc2lkZXMpIHtcbiAgICAgICAgY29uc3QgbkxldmVsID0gbGV2ZWxBdCh4ICsgZHgsIHogKyBkeiwgbHggKyBkeCwgbHogKyBkeik7XG4gICAgICAgIGlmIChuTGV2ZWwgPT09IC05OTk5IHx8IG5MZXZlbCA+PSBsZXZlbCkgY29udGludWU7XG4gICAgICAgIGlmIChpc1NvbGlkKGdldFZveGVsKHdvcmxkLCB4ICsgZHgsIGxldmVsIC0gMSwgeiArIGR6KSkpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB0b3AgPSBsZXZlbCAtIDAuMSwgYm90dG9tID0gbkxldmVsIC0gMC4xO1xuICAgICAgICBjb25zdCBiID0gcG9zLmxlbmd0aCAvIDM7XG4gICAgICAgIC8vIEZhY2Ugb24gdGhlIHNoYXJlZCBlZGdlLCBvcmllbnRlZCB0b3dhcmQgdGhlIGxvd2VyIG5laWdoYm91ci5cbiAgICAgICAgY29uc3QgZXggPSBkeCA+IDAgPyB4ICsgMSA6IGR4IDwgMCA/IHggOiB4LCBleiA9IGR6ID4gMCA/IHogKyAxIDogZHogPCAwID8geiA6IHo7XG4gICAgICAgIGlmIChkeCAhPT0gMCkge1xuICAgICAgICAgIHB1c2goZXgsIHRvcCwgeiwgZHgsIDAsIDAsIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goZXgsIHRvcCwgeiArIDEsIGR4LCAwLCAwLCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKGV4LCBib3R0b20sIHogKyAxLCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaChleCwgYm90dG9tLCB6LCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcHVzaCh4LCB0b3AsIGV6LCAwLCAwLCBkeiwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaCh4ICsgMSwgdG9wLCBleiwgMCwgMCwgZHosIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goeCArIDEsIGJvdHRvbSwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKHgsIGJvdHRvbSwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgfVxuICAgICAgICBxdWFkKGIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAoaWR4Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGcgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUocG9zLCAzKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdub3JtYWwnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShucm0sIDMpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoY2xyLCAzKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhRmxvdycsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGZsb3csIDIpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FEZXB0aCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGRlcHRoLCAxKSk7XG4gIGcuc2V0QXR0cmlidXRlKCdhRm9hbScsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGZvYW0sIDEpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FTaGVldCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHNoZWV0LCAxKSk7XG4gIGcuc2V0SW5kZXgoaWR4KTtcbiAgZy5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGcsIG5lYXJXYXRlck1hdGVyaWFsKTtcbiAgbWVzaC5uYW1lID0gYHdhdGVyX2NodW5rXyR7Y2h1bmsuY3h9XyR7Y2h1bmsuY3p9YDtcbiAgbWVzaC5yZW5kZXJPcmRlciA9IDI7XG4gIG1lc2gudXNlckRhdGEud2F0ZXJUcmlhbmdsZXMgPSBpZHgubGVuZ3RoIC8gMztcbiAgcmV0dXJuIG1lc2g7XG59XG5cbi8qKlxuICogQ3V0IGEgcmVjdGFuZ3VsYXIgaG9sZSBpbiB0aGUgZmFyIChvcGFxdWUpIHNlYSBwbGFuZSB3aGVyZSBuZWFyIGNodW5rcyBkcmF3XG4gKiB0aGVpciBvd24gdHJhbnNwYXJlbnQgd2F0ZXIsIHNvIHNoYWxsb3dzIHNob3cgdGhlIHJlYWwgYmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbEZhcldhdGVySG9sZShtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwpOiB7IHZhbHVlOiBUSFJFRS5WZWN0b3I0IH0ge1xuICBjb25zdCBob2xlID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjQoMCwgMCwgMCwgMCkgfTtcbiAgbWF0ZXJpYWwub25CZWZvcmVDb21waWxlID0gKHNoYWRlcikgPT4ge1xuICAgIHNoYWRlci51bmlmb3Jtcy51SG9sZSA9IGhvbGU7XG4gICAgc2hhZGVyLnZlcnRleFNoYWRlciA9IHNoYWRlci52ZXJ0ZXhTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsICcjaW5jbHVkZSA8Y29tbW9uPlxcbnZhcnlpbmcgdmVjMiB2RmFyWFo7JylcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PicsICcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxcbnZGYXJYWiA9IChtb2RlbE1hdHJpeCAqIHZlYzQodHJhbnNmb3JtZWQsIDEuMCkpLnh6OycpO1xuICAgIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgJyNpbmNsdWRlIDxjb21tb24+XFxudW5pZm9ybSB2ZWM0IHVIb2xlO1xcbnZhcnlpbmcgdmVjMiB2RmFyWFo7JylcbiAgICAgIC5yZXBsYWNlKCd2ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UsIG9wYWNpdHkgKTsnLFxuICAgICAgICAnaWYgKHZGYXJYWi54ID4gdUhvbGUueCAmJiB2RmFyWFoueCA8IHVIb2xlLnogJiYgdkZhclhaLnkgPiB1SG9sZS55ICYmIHZGYXJYWi55IDwgdUhvbGUudykgZGlzY2FyZDtcXG52ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UsIG9wYWNpdHkgKTsnKTtcbiAgfTtcbiAgcmV0dXJuIGhvbGU7XG59XG4iLCAie1xuICBcInNjaGVtYVwiOiBcInBhbGV0dGVfdjJcIixcbiAgXCJkYXRlXCI6IFwiMjAyNi0xMC0yMlwiLFxuICBcInN0YXR1c1wiOiBcInByb3Bvc2VkXCIsXG4gIFwic291cmNlXCI6IFwiUkVGLTAwMiAoaHlicmlkIHdvcmxkIHJlZmVyZW5jZSksIHZhbHVlcyBzYW1wbGVkIGJ5IGV5ZTsgbnVtZXJpYyB2ZXJpZmljYXRpb24gcGVuZGluZ1wiLFxuICBcIm5vdGVcIjogXCJPbmUgbWF0ZXJpYWwgcGFsZXR0ZS4gVGltZSBvZiBkYXkgaXMgZXhwcmVzc2VkIGJ5IHRoZSBsaWdodGluZyBwcmVzZXRzIGJlbG93LCBub3QgYnkgcmVwYWludGluZyBtYXRlcmlhbHMuXCIsXG4gIFwibWF0ZXJpYWxzXCI6IHtcbiAgICBcImdyYXNzX3RvcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM3OUI5NENcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBsb3cgZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfaGlnaFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4RkM5NUVcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBtaWQgZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfcGVha1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QUQwNkFcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBoaWdoIGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX2NhcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1RTk0NDBcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjAtMC40IG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RyYXRhX29jaHJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0M5OUE1RlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuNC0wLjYyIG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RyYXRhX3J1c3RcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjQ2MzNDXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC42Mi0wLjgwIG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RvbmVfdG9wXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2REZDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiYmFyZSBzdG9uZSB0b3Agc3VyZmFjZVwiXG4gICAgfSxcbiAgICBcInN0b25lX2JvZHlfYVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEQ0QzQkVcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYm9keSwgZXZlbiA0LjUgbSBiYW5kXCJcbiAgICB9LFxuICAgIFwic3RvbmVfYm9keV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QxQzdBRlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBib2R5LCBvZGQgNC41IG0gYmFuZFwiXG4gICAgfSxcbiAgICBcInN0b25lX3NoYWRlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0I5QUU5NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY3JldmljZSAvIHJlY2Vzc2VkIHN0b25lIGFjY2VudFwiXG4gICAgfSxcbiAgICBcInNhbmRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTNEM0E2XCIsXG4gICAgICBcInJvbGVcIjogXCJzaG9yZSBjZWxsc1wiXG4gICAgfSxcbiAgICBcInNub3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRUVGMUY1XCIsXG4gICAgICBcInJvbGVcIjogXCJnZW5lcmF0b3IgdjIgc25vd2ZpZWxkcyBhYm92ZSB0aGUgc25vd2xpbmUgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3NraW5cIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDlBNzdFXCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgc2tpbiAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfdHVuaWNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjM0QTNDXCIsXG4gICAgICBcInJvbGVcIjogXCJmb3VuZGVyIHR1bmljLCB3YXJtIHJlZCBhY2NlbnQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX3R1bmljX2FsdFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyRThDODZcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2VyIHR1bmljLCB0ZWFsIGFjY2VudCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfdHJvdXNlcnNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUI0NjM2XCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgdHJvdXNlcnMgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJjaGFyX2hhaXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNEEzMzI0XCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgaGFpciAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfYm9vdHNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMzMyODFGXCIsXG4gICAgICBcInJvbGVcIjogXCJjaGFyYWN0ZXIgYm9vdHMgYW5kIGJlbHQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV9kZWVyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhDNUIzQVwiLFxuICAgICAgXCJyb2xlXCI6IFwicmVkIGRlZXIgY29hdCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX2xpZ2h0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0RDQzdBNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiZGVlciBiZWxseSwgaGFyZSB0YWlsLCBhbnRsZXIgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV9oYXJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlBODY3MFwiLFxuICAgICAgXCJyb2xlXCI6IFwiaGFyZSBjb2F0IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfdHJvdXRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkY3RjVFXCIsXG4gICAgICBcInJvbGVcIjogXCJ0cm91dCBiYWNrIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfdHJvdXRfYmVsbHlcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDhDOUEzXCIsXG4gICAgICBcInJvbGVcIjogXCJ0cm91dCBiZWxseSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfcGxhc3RlclwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFOEREQzZcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2Ugd2FsbCBwbGFzdGVyIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aW1iZXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkE0NTMwXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIHRpbWJlciBmcmFtZSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGltYmVyX2xpZ2h0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhBNjE0MlwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSBwbGFua3MgYW5kIGRvb3JzIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aGF0Y2hcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQzdBMjU3XCIsXG4gICAgICBcInJvbGVcIjogXCJ0aGF0Y2ggcm9vZiAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfdGhhdGNoX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUM3QjNDXCIsXG4gICAgICBcInJvbGVcIjogXCJ0aGF0Y2ggcm9vZiBzaGFkZSBjb3Vyc2UgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3N0b25lXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlCOUE5MVwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSBtYXNvbnJ5IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF9zdG9uZV9kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzc0NzM2Q1wiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSBtYXNvbnJ5IGpvaW50cyBhbmQgcGxpbnRoIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwicHJvcF9pcm9uXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNBM0EzRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiaXJvbiBmaXR0aW5ncyAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcInByb3BfZ2xvd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNGRkQyN0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImxhbnRlcm4gbGlnaHQgKGVtaXNzaXZlLCBlZmZlY3Qgb25seSkgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9zaGFsbG93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzY3Q0ZEOFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggPD0gMC41IG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9taWRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0FBRkM0XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCB+MS41IG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9kZWVwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJBOEZBOFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggPj0gNC4wIG1cIlxuICAgIH0sXG4gICAgXCJ3YXRlcl9yaW1cIjoge1xuICAgICAgXCJoZXhcIjogXCIjQkZFQUYwXCIsXG4gICAgICBcInJvbGVcIjogXCJzaG9yZWxpbmUgcmltIC8gZm9hbSB0aW50XCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2FcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUZBODNGXCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2RkI4NEFcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2NcIjoge1xuICAgICAgXCJoZXhcIjogXCIjN0ZDMzU2XCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIGhpZ2hsaWdodCBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X3BpbmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRjJBNkM0XCIsXG4gICAgICBcInJvbGVcIjogXCJibG9zc29tIGFjY2VudCBzcGVjaWVzIG9ubHlcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfcGlua19iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U4OEZCMlwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmxvc3NvbSBzaGFkZSBtYXNzXCJcbiAgICB9LFxuICAgIFwidHJ1bmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkI0QTMzXCIsXG4gICAgICBcInJvbGVcIjogXCJ0cmVlIHRydW5rc1wiXG4gICAgfSxcbiAgICBcImJhcmtfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM0RTM2MjZcIixcbiAgICAgIFwicm9sZVwiOiBcInRydW5rIHNoYWRlLCBzdHVtcHNcIlxuICAgIH0sXG4gICAgXCJjb25pZmVyX3BpbmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNEM4QTRBXCIsXG4gICAgICBcInJvbGVcIjogXCJwaW5lIG5lZWRsZXMsIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImNvbmlmZXJfcGluZV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVDOUM1M1wiLFxuICAgICAgXCJyb2xlXCI6IFwicGluZSBuZWVkbGVzLCBoaWdobGlnaHRcIlxuICAgIH0sXG4gICAgXCJjb25pZmVyX3NwcnVjZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyRjZCNDhcIixcbiAgICAgIFwicm9sZVwiOiBcInNwcnVjZSBuZWVkbGVzLCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjb25pZmVyX3NwcnVjZV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNFN0Y1NlwiLFxuICAgICAgXCJyb2xlXCI6IFwic3BydWNlIG5lZWRsZXMsIGhpZ2hsaWdodFwiXG4gICAgfSxcbiAgICBcImJpcmNoX2JhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZFMUQzXCIsXG4gICAgICBcInJvbGVcIjogXCJwYWxlIGJpcmNoIHRydW5rXCJcbiAgICB9LFxuICAgIFwiYmlyY2hfbWFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiMzQTM1MzBcIixcbiAgICAgIFwicm9sZVwiOiBcImRhcmsgYmlyY2ggYmFyayBiYW5kXCJcbiAgICB9LFxuICAgIFwiYmlyY2hfbGVhZlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5Q0M5NUFcIixcbiAgICAgIFwicm9sZVwiOiBcImJpcmNoIGNhbm9weSwgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiYmlyY2hfbGVhZl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0IzRDc2QlwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmlyY2ggY2Fub3B5LCBoaWdobGlnaHRcIlxuICAgIH0sXG4gICAgXCJiZWVjaF9iYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhFODk3RFwiLFxuICAgICAgXCJyb2xlXCI6IFwic21vb3RoIGdyZXkgYmVlY2ggdHJ1bmtcIlxuICAgIH0sXG4gICAgXCJiZWVjaF9sZWFmXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzU1OEYzQVwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmVlY2ggY2Fub3B5LCBzaGFkZSBtYXNzXCJcbiAgICB9LFxuICAgIFwiYmVlY2hfbGVhZl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzY3QTQ0NVwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmVlY2ggY2Fub3B5LCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJidXNoX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNDY3RjM3XCIsXG4gICAgICBcInJvbGVcIjogXCJiZXJyeSBidXNoIGxlYXZlc1wiXG4gICAgfSxcbiAgICBcImJlcnJ5X3JlZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNDODM5NEFcIixcbiAgICAgIFwicm9sZVwiOiBcImJlcnJpZXNcIlxuICAgIH0sXG4gICAgXCJmZXJuX2dyZWVuXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzg2QkU1NVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZmVybiBmcm9uZHMsIG1haW5cIlxuICAgIH0sXG4gICAgXCJmZXJuX2dyZWVuX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkZBNzQ2XCIsXG4gICAgICBcInJvbGVcIjogXCJmZXJuIGZyb25kcywgc2hhZGVcIlxuICAgIH0sXG4gICAgXCJmbG93ZXJfeWVsbG93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0YyQ0Y0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiBtZWFkb3cgZmxvd2VyIGhlYWRzXCJcbiAgICB9LFxuICAgIFwiZmxvd2VyX3doaXRlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0Y0RjFFNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiBkYWlzeSBmbG93ZXIgaGVhZHNcIlxuICAgIH0sXG4gICAgXCJmbG93ZXJfdmlvbGV0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlDN0JENlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiB2aW9sZXQgZmxvd2VyIGhlYWRzXCJcbiAgICB9LFxuICAgIFwibXVzaHJvb21fY2FwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0I4NDgzQVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiBmb3Jlc3QgbXVzaHJvb20gY2FwXCJcbiAgICB9LFxuICAgIFwibXVzaHJvb21fc3RlbVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFREUzQ0NcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogbXVzaHJvb20gc3RlbVwiXG4gICAgfSxcbiAgICBcIm1vc3NfZ3JlZW5cIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUM4QzNBXCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IG1vc3Mgb24gZmFsbGVuIGxvZ3NcIlxuICAgIH0sXG4gICAgXCJvcmVfY3J5c3RhbFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM3QjVBRDZcIixcbiAgICAgIFwicm9sZVwiOiBcIm9yZSBkZXBvc2l0IGFjY2VudCAocHJvcG9zZWQsIHJlcGxhY2VzIHRlYWwpXCJcbiAgICB9LFxuICAgIFwib3JlX2NyeXN0YWxfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QjdCRThcIixcbiAgICAgIFwicm9sZVwiOiBcIm9yZSBoaWdobGlnaHQgZmFjZXRcIlxuICAgIH0sXG4gICAgXCJub3hlbF9zdG9uZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFNkRGQ0NcIixcbiAgICAgIFwicm9sZVwiOiBcIk5veGVsIGFyY2hpdGVjdHVyZSBtYWluIHN0b25lXCJcbiAgICB9LFxuICAgIFwibm94ZWxfc3RvbmVfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEM0M5QjRcIixcbiAgICAgIFwicm9sZVwiOiBcIk5veGVsIHNlY29uZGFyeSBzdG9uZSAvIHJlY2Vzc1wiXG4gICAgfSxcbiAgICBcImFjY2VudF9ibHVlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNFN0ZCOFwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmFubmVyIC8gY2xvdGggYWNjZW50XCJcbiAgICB9LFxuICAgIFwiYWNjZW50X3RlYWxcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkZBNkEwXCIsXG4gICAgICBcInJvbGVcIjogXCJzZWNvbmRhcnkgYWNjZW50XCJcbiAgICB9LFxuICAgIFwiZW1pc3NpdmVfZmlyZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNGRjlFNEFcIixcbiAgICAgIFwicm9sZVwiOiBcImNhbXBmaXJlIC8gd2FybSBlbWlzc2l2ZSAoZWZmZWN0cyBvbmx5KVwiXG4gICAgfSxcbiAgICBcImVtaXNzaXZlX21hZ2ljXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QyNEJGRlwiLFxuICAgICAgXCJyb2xlXCI6IFwicmVzZXJ2ZWQ6IG1hZ2ljIGVmZmVjdHMgb25seSwgbmV2ZXIgbWF0ZXJpYWxzXCJcbiAgICB9XG4gIH0sXG4gIFwibGlnaHRpbmdcIjoge1xuICAgIFwiZGF3blwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiAxMixcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAxMDUsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGQzc5QVwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMi4yLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzhGQTZDOFwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzRFNUY2RVwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDAuNixcbiAgICAgIFwic2t5XCI6IFwiI0E4QkVENlwiLFxuICAgICAgXCJmb2dcIjogXCIjQThCRUQ2XCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDUsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMVxuICAgIH0sXG4gICAgXCJub29uXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDM4LFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDUwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkY0RENcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDIuNzUsXG4gICAgICBcImhlbWlTa3lcIjogXCIjQkZEOUYyXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjN0E4RjU1XCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMC41NSxcbiAgICAgIFwic2t5XCI6IFwiIzlFRDJFRVwiLFxuICAgICAgXCJmb2dcIjogXCIjRENFRkY4XCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDI4LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjA1XG4gICAgfSxcbiAgICBcImR1c2tcIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogOSxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAyNTAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGQjI3QVwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMy4yLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzhFN0M5RVwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzVBNEE1MFwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDEuMSxcbiAgICAgIFwic2t5XCI6IFwiI0M5OEU4NlwiLFxuICAgICAgXCJmb2dcIjogXCIjQzA5MDhBXCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDM2LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjMyXG4gICAgfSxcbiAgICBcIm5pZ2h0XCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDQwLFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDIyMCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjQUZDOEZGXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAxLjAsXG4gICAgICBcImhlbWlTa3lcIjogXCIjM0E0QzdBXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjMUMyNTQwXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMS4wNSxcbiAgICAgIFwic2t5XCI6IFwiIzEwMTczNlwiLFxuICAgICAgXCJmb2dcIjogXCIjMTUxQzNDXCIsXG4gICAgICBcImZvZ0RlbnNpdHlcIjogMC4wMDQ1LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjVcbiAgICB9XG4gIH1cbn0iLCAiLy8gUHJpdmF0ZSBtaWdyYXRpb24gcmVwbGF5IG9ubHkuIFJldGlyZWQgZW50aXRpZXMgbGl2ZSBpbiB0aGlzIFdvcmxkIHdoaWxlIGFuXG4vLyBhY2NlcHRlZCBoaXN0b3JpY2FsIGpvdXJuYWwgaXMgY2hlY2tlZDsgbm8gcHVibGljIGNvbW1hbmQgZW5hYmxlcyB0aGlzIG1vZGUuXG5pbnRlcmZhY2UgUmVwbGF5U3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIGhpc3RvcmljYWxIYXNoOiBib29sZWFuO1xuICBtaWdyYXRlZDogYm9vbGVhbjtcbn1cblxuY29uc3Qgc3RhdGVzID0gbmV3IFdlYWtNYXA8b2JqZWN0LCBSZXBsYXlTdGF0ZT4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxheVN0b25lU3RhdGUod29ybGQ6IG9iamVjdCk6IFJlcGxheVN0YXRlIHtcbiAgbGV0IHN0YXRlID0gc3RhdGVzLmdldCh3b3JsZCk7XG4gIGlmICghc3RhdGUpIHsgc3RhdGUgPSB7IGFjdGl2ZTogZmFsc2UsIGhpc3RvcmljYWxIYXNoOiBmYWxzZSwgbWlncmF0ZWQ6IGZhbHNlIH07IHN0YXRlcy5zZXQod29ybGQsIHN0YXRlKTsgfVxuICByZXR1cm4gc3RhdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IHRydWU7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbiAgc3RhdGUubWlncmF0ZWQgPSBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/LmFjdGl2ZSA/PyBmYWxzZTtcbn1cblxuLyoqIFNuYXBzaG90IGhhc2hlcyBiZWZvcmUgYW5kIGR1cmluZyB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheSBpbmNsdWRlIHN0b25lcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5oaXN0b3JpY2FsSGFzaCA/PyBmYWxzZTtcbn1cblxuLyoqIEEgbWlncmF0ZWQgc25hcHNob3QgYWxyZWFkeSBoYXMgcmV0aXJlbWVudCB0b21ic3RvbmVzIGluIGdlbmVyYXRlZCBjaHVua3MuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5taWdyYXRlZCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lm1pZ3JhdGVkID8/IGZhbHNlO1xufVxuXG4vKiogRXhpdCBoaXN0b3JpY2FsIG1vZGUgYWZ0ZXIgYWxsIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBoYXNoZXMgaGF2ZSBwYXNzZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZmluaXNoU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSBmYWxzZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSBmYWxzZTtcbiAgc3RhdGUubWlncmF0ZWQgPSB0cnVlO1xufVxuIiwgIi8vIERldGVybWluaXN0aWMgaGFzaCwgbm9pc2UgYW5kIG1hdGggaGVscGVycyBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIuXG4vLyBQdXJlIFR5cGVTY3JpcHQgKEQtMDA1KS4gRXh0cmFjdGVkIGZyb20gd29ybGQudHMgdW5jaGFuZ2VkIHNvIHRlcnJhaW5cbi8vIGdlbmVyYXRvcnMgb2YgZXZlcnkgdmVyc2lvbiB1c2UgaWRlbnRpY2FsIHByaW1pdGl2ZXMuXG5leHBvcnQgY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuZXhwb3J0IGNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuZXhwb3J0IGNvbnN0IHNtb290aHN0ZXAgPSAoZTA6IG51bWJlciwgZTE6IG51bWJlciwgeDogbnVtYmVyKSA9PiB7XG4gIGNvbnN0IHQgPSBjbGFtcCgoeCAtIGUwKSAvIChlMSAtIGUwKSwgMCwgMSk7XG4gIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xufTtcblxuLy8gLS0tLS0tLS0tLSBkZXRlcm1pbmlzdGljIGhhc2ggLyBub2lzZSAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gaGFzaDJpKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoM2koeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKSBeIE1hdGguaW11bCh6LCAyMjQ2ODIyNTE5KTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbXVsYmVycnkzMihzZWVkOiBudW1iZXIpOiAoKSA9PiBudW1iZXIge1xuICBsZXQgYSA9IHNlZWQgPj4+IDA7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgYSA9IChhICsgMHg2ZDJiNzlmNSkgPj4+IDA7XG4gICAgbGV0IHQgPSBhO1xuICAgIHQgPSBNYXRoLmltdWwodCBeICh0ID4+PiAxNSksIHQgfCAxKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgdCB8IDYxKTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IHNtb290aCA9ICh0OiBudW1iZXIpID0+IHQgKiB0ICogKDMgLSAyICogdCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSk7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSk7XG4gIGNvbnN0IGEgPSBoYXNoMmkoeGksIHlpLCBzZWVkKSwgYiA9IGhhc2gyaSh4aSArIDEsIHlpLCBzZWVkKTtcbiAgY29uc3QgYyA9IGhhc2gyaSh4aSwgeWkgKyAxLCBzZWVkKSwgZCA9IGhhc2gyaSh4aSArIDEsIHlpICsgMSwgc2VlZCk7XG4gIGNvbnN0IHRvcCA9IGEgKyAoYiAtIGEpICogeGY7XG4gIGNvbnN0IGJvdHRvbSA9IGMgKyAoZCAtIGMpICogeGY7XG4gIHJldHVybiB0b3AgKyAoYm90dG9tIC0gdG9wKSAqIHlmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMih4ICogZnJlcSwgeSAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZU5vaXNlMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KSwgemkgPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpLCB6ZiA9IHNtb290aCh6IC0gemkpO1xuICBjb25zdCBjMDAwID0gaGFzaDNpKHhpLCB5aSwgemksIHNlZWQpLCBjMTAwID0gaGFzaDNpKHhpICsgMSwgeWksIHppLCBzZWVkKTtcbiAgY29uc3QgYzAxMCA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSwgc2VlZCksIGMxMTAgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppLCBzZWVkKTtcbiAgY29uc3QgYzAwMSA9IGhhc2gzaSh4aSwgeWksIHppICsgMSwgc2VlZCksIGMxMDEgPSBoYXNoM2koeGkgKyAxLCB5aSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgYzAxMSA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpLCBjMTExID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCB4MDAgPSBjMDAwICsgKGMxMDAgLSBjMDAwKSAqIHhmO1xuICBjb25zdCB4MTAgPSBjMDEwICsgKGMxMTAgLSBjMDEwKSAqIHhmO1xuICBjb25zdCB4MDEgPSBjMDAxICsgKGMxMDEgLSBjMDAxKSAqIHhmO1xuICBjb25zdCB4MTEgPSBjMDExICsgKGMxMTEgLSBjMDExKSAqIHhmO1xuICBjb25zdCB5MCA9IHgwMCArICh4MTAgLSB4MDApICogeWY7XG4gIGNvbnN0IHkxID0geDAxICsgKHgxMSAtIHgwMSkgKiB5ZjtcbiAgcmV0dXJuIHkwICsgKHkxIC0geTApICogemY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0zKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTMoeCAqIGZyZXEsIHkgKiBmcmVxLCB6ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuIiwgIi8vIEh5ZHJvbG9neSBcdTIwMTQgdGhlIGRldGVybWluaXN0aWMgd2F0ZXIgbmV0d29yayBvZiBhIHdvcmxkIChwdXJlIFR5cGVTY3JpcHQsIEQtMDA1KS5cbi8vXG4vLyBUaGlzIGlzIGRlcml2ZWQgKnNpbXVsYXRpb24gZGF0YSosIG5vdCBwcmVzZW50YXRpb246IGl0IGlzIGEgcHVyZSBmdW5jdGlvbiBvZlxuLy8gKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKSBhbmQgaXMgd2hhdCB0ZXJyYWluIGNhcnZpbmcsIHdhdGVyIGZpbGxpbmcsIGZsb3dcbi8vIGRpcmVjdGlvbiBhbmQgZnV0dXJlIGZpc2hpbmcvaXJyaWdhdGlvbi9mbG9vZGluZyBydWxlcyByZWFkLiBJdCBpcyBuZXZlclxuLy8gam91cm5hbGVkIGJlY2F1c2UgaXQgY2FuIGFsd2F5cyBiZSByZWdlbmVyYXRlZCBleGFjdGx5LlxuLy9cbi8vIE5ldHdvcmsgKGJvdGggZ2VuZXJhdG9yIHZlcnNpb25zKTpcbi8vICAgbGFrZSAgXHUyMDE0IHRoZSB2YWxsZXkgbGFrZSBiYXNpbiwgbG9jYXRlZCBmcm9tIHRoZSBhY3R1YWwgZ2VuZXJhdGVkIHRlcnJhaW4uXG4vLyAgIGxvd2VyIFx1MjAxNCB0aGUgbG93bGFuZCByaXZlciBmcm9tIHRoZSBsYWtlIHRvIHRoZSBzb3V0aGVybiBzZWEsIHRyYWNlZCBmcm9tXG4vLyAgICAgICAgICAgdGhlIGFjdHVhbCBjYXJ2ZWQgY2hhbm5lbCAodGhlIHYxIGNoYW5uZWwgaXMgY2FydmVkIG9uICp3YXJwZWQqXG4vLyAgICAgICAgICAgY29vcmRpbmF0ZXMsIHNvIGByaXZlckNlbnRlclhgIGFsb25lIGlzIHVwIHRvIH4xMzUgbSBvZmYpLlxuLy8gR2VuZXJhdG9yIHYyIGFkZHM6XG4vLyAgIHVwcGVyIFx1MjAxNCBhIG1vdW50YWluIHJpdmVyIGZyb20gYSBoaWdobGFuZCB0YXJuIGRvd24gdG8gdGhlIGxha2UsIHdpdGggYVxuLy8gICAgICAgICAgIHdhdGVyLXN1cmZhY2UgbGV2ZWwgdGhhdCBuZXZlciByaXNlcyBkb3duc3RyZWFtLCBjYXNjYWRlcyBhbmQgZmFsbHMuXG4vL1xuLy8gRmxvdyBhbHdheXMgcG9pbnRzIGRvd25zdHJlYW06IHVwcGVyIFx1MjE5MiBsYWtlIFx1MjE5MiBsb3dlciBcdTIxOTIgc2VhLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIG11bGJlcnJ5MzIsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcblxuZXhwb3J0IHR5cGUgSGVpZ2h0U2FtcGxlciA9ICh4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJpdmVyUG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQgb2YgdGhpcyByZWFjaCAobWV0cmVzKS4gKi9cbiAgczogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBlbGV2YXRpb24gKG1ldHJlcywgbWF5IGJlIGZyYWN0aW9uYWwpLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogQ2hhbm5lbCBoYWxmLXdpZHRoIChtZXRyZXMpLiAqL1xuICB3aWR0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWNoSGl0IHtcbiAgLyoqIEhvcml6b250YWwgZGlzdGFuY2UgZnJvbSB0aGUgY2VudHJlbGluZS4gKi9cbiAgZDogbnVtYmVyO1xuICAvKiogSW50ZXJwb2xhdGVkIHdhdGVyIGxldmVsIGF0IHRoZSBuZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIHdpZHRoOiBudW1iZXI7XG4gIC8qKiBVbml0IGRvd25zdHJlYW0gZGlyZWN0aW9uLiAqL1xuICB0eDogbnVtYmVyO1xuICB0ejogbnVtYmVyO1xuICAvKiogV2F0ZXItc3VyZmFjZSBkcm9wIHBlciBtZXRyZSBhbG9uZyB0aGUgY2hhbm5lbCAoPj0gMCkuICovXG4gIGdyYWRpZW50OiBudW1iZXI7XG4gIC8qKiBBcmMgbGVuZ3RoIG9mIHRoZSBuZWFyZXN0IHBvaW50IGZyb20gdGhlIGRvd25zdHJlYW0gZW5kLiAqL1xuICBzOiBudW1iZXI7XG59XG5cbi8qKlxuICogQSBwb2x5bGluZSByZWFjaCBzdG9yZWQgZG93bnN0cmVhbS1maXJzdC4gTmVhcmVzdC1zZWdtZW50IHF1ZXJpZXMgdXNlIGFcbiAqIHVuaWZvcm0gZ3JpZCB3aG9zZSBjZWxscyBsaXN0IGV2ZXJ5IHNlZ21lbnQgd2l0aGluIGByZWFjaGAgbWV0cmVzLlxuICovXG5leHBvcnQgY2xhc3MgUml2ZXJSZWFjaCB7XG4gIHJlYWRvbmx5IHBvaW50czogUml2ZXJQb2ludFtdO1xuICBwcml2YXRlIHJlYWRvbmx5IGNlbGwgPSAzMjtcbiAgcHJpdmF0ZSByZWFkb25seSBncmlkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcltdPigpO1xuXG4gIGNvbnN0cnVjdG9yKHBvaW50czogUml2ZXJQb2ludFtdLCByZWFkb25seSByZWFjaDogbnVtYmVyKSB7XG4gICAgdGhpcy5wb2ludHMgPSBwb2ludHM7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgKyAxIDwgcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBhID0gcG9pbnRzW2ldLCBiID0gcG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IHgwID0gTWF0aC5taW4oYS54LCBiLngpIC0gcmVhY2gsIHgxID0gTWF0aC5tYXgoYS54LCBiLngpICsgcmVhY2g7XG4gICAgICBjb25zdCB6MCA9IE1hdGgubWluKGEueiwgYi56KSAtIHJlYWNoLCB6MSA9IE1hdGgubWF4KGEueiwgYi56KSArIHJlYWNoO1xuICAgICAgZm9yIChsZXQgY3ogPSBNYXRoLmZsb29yKHowIC8gdGhpcy5jZWxsKTsgY3ogPD0gTWF0aC5mbG9vcih6MSAvIHRoaXMuY2VsbCk7IGN6KyspIHtcbiAgICAgICAgZm9yIChsZXQgY3ggPSBNYXRoLmZsb29yKHgwIC8gdGhpcy5jZWxsKTsgY3ggPD0gTWF0aC5mbG9vcih4MSAvIHRoaXMuY2VsbCk7IGN4KyspIHtcbiAgICAgICAgICBjb25zdCBrZXkgPSBjZWxsS2V5KGN4LCBjeik7XG4gICAgICAgICAgbGV0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGtleSk7XG4gICAgICAgICAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgdGhpcy5ncmlkLnNldChrZXksIGxpc3QpOyB9XG4gICAgICAgICAgbGlzdC5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGxlbmd0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wb2ludHNbdGhpcy5wb2ludHMubGVuZ3RoIC0gMV0/LnMgPz8gMDsgfVxuXG4gIC8qKiBOZWFyZXN0IGNlbnRyZWxpbmUgcG9pbnQgd2l0aGluIGByZWFjaGAsIG9yIG51bGwuICovXG4gIG5lYXJlc3QoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBSZWFjaEhpdCB8IG51bGwge1xuICAgIGNvbnN0IGxpc3QgPSB0aGlzLmdyaWQuZ2V0KGNlbGxLZXkoTWF0aC5mbG9vcih4IC8gdGhpcy5jZWxsKSwgTWF0aC5mbG9vcih6IC8gdGhpcy5jZWxsKSkpO1xuICAgIGlmICghbGlzdCkgcmV0dXJuIG51bGw7XG4gICAgbGV0IGJlc3QgPSBJbmZpbml0eSwgYmkgPSAtMSwgYnQgPSAwO1xuICAgIGZvciAoY29uc3QgaSBvZiBsaXN0KSB7XG4gICAgICBjb25zdCBhID0gdGhpcy5wb2ludHNbaV0sIGIgPSB0aGlzLnBvaW50c1tpICsgMV07XG4gICAgICBjb25zdCBkeCA9IGIueCAtIGEueCwgZHogPSBiLnogLSBhLno7XG4gICAgICBjb25zdCBsZW4yID0gZHggKiBkeCArIGR6ICogZHogfHwgMTtcbiAgICAgIGNvbnN0IHQgPSBjbGFtcCgoKHggLSBhLngpICogZHggKyAoeiAtIGEueikgKiBkeikgLyBsZW4yLCAwLCAxKTtcbiAgICAgIGNvbnN0IHB4ID0gYS54ICsgZHggKiB0LCBweiA9IGEueiArIGR6ICogdDtcbiAgICAgIGNvbnN0IGQyID0gKHggLSBweCkgKiogMiArICh6IC0gcHopICoqIDI7XG4gICAgICBpZiAoZDIgPCBiZXN0KSB7IGJlc3QgPSBkMjsgYmkgPSBpOyBidCA9IHQ7IH1cbiAgICB9XG4gICAgaWYgKGJpIDwgMCB8fCBiZXN0ID4gdGhpcy5yZWFjaCAqIHRoaXMucmVhY2gpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tiaV0sIGIgPSB0aGlzLnBvaW50c1tiaSArIDFdO1xuICAgIGNvbnN0IHNlZ0xlbiA9IE1hdGgubWF4KDFlLTYsIGIucyAtIGEucyk7XG4gICAgLy8gUG9pbnRzIGFyZSBzdG9yZWQgZG93bnN0cmVhbS1maXJzdCwgc28gZG93bnN0cmVhbSBpcyBhIDwtIGIuXG4gICAgY29uc3QgdHggPSAoYS54IC0gYi54KSAvIHNlZ0xlbiwgdHogPSAoYS56IC0gYi56KSAvIHNlZ0xlbjtcbiAgICByZXR1cm4ge1xuICAgICAgZDogTWF0aC5zcXJ0KGJlc3QpLFxuICAgICAgbGV2ZWw6IGEubGV2ZWwgKyAoYi5sZXZlbCAtIGEubGV2ZWwpICogYnQsXG4gICAgICB3aWR0aDogYS53aWR0aCArIChiLndpZHRoIC0gYS53aWR0aCkgKiBidCxcbiAgICAgIHR4LCB0eixcbiAgICAgIGdyYWRpZW50OiBNYXRoLm1heCgwLCAoYi5sZXZlbCAtIGEubGV2ZWwpIC8gc2VnTGVuKSxcbiAgICAgIHM6IGEucyArIChiLnMgLSBhLnMpICogYnQsXG4gICAgfTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjZWxsS2V5KGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKGN4ICsgNDA5NikgKiA4MTkyICsgKGN6ICsgNDA5Nik7XG59XG5cbmV4cG9ydCB0eXBlIFdhdGVyQm9keSA9ICdyaXZlcicgfCAnbGFrZScgfCAnc2VhJyB8ICdub25lJztcblxuZXhwb3J0IGludGVyZmFjZSBGbG93U2FtcGxlIHtcbiAgYm9keTogV2F0ZXJCb2R5O1xuICAvKiogVW5pdCBmbG93IGRpcmVjdGlvbiAoemVybyBmb3Igc3RpbGwgd2F0ZXIpLiAqL1xuICBkeDogbnVtYmVyO1xuICBkejogbnVtYmVyO1xuICAvKiogU3VyZmFjZSBjdXJyZW50IHNwZWVkIGluIG0vcy4gKi9cbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIeWRyb2xvZ3lPcHRpb25zIHtcbiAgc2VlZDogbnVtYmVyO1xuICAvKiogR2VuZXJhdG9yIHZlcnNpb24gdGhlIG5ldHdvcmsgYmVsb25ncyB0by4gKi9cbiAgdmVyc2lvbjogbnVtYmVyO1xuICAvKiogQmFzZSBoZWlnaHQgb2YgdGhlICp1bm1vZGlmaWVkIHYxIHNoYXBlKiAodXNlZCB0byBsb2NhdGUgbGFrZS9jaGFubmVsKS4gKi9cbiAgdjFIZWlnaHQ6IEhlaWdodFNhbXBsZXI7XG59XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9naWNhbCBuZXR3b3JrIGZvciBvbmUgKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uKS4gKi9cbmV4cG9ydCBjbGFzcyBIeWRyb2xvZ3kge1xuICByZWFkb25seSBzZWVkOiBudW1iZXI7XG4gIHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcbiAgcmVhZG9ubHkgbGFrZTogeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcng6IG51bWJlcjsgcno6IG51bWJlciB9O1xuICByZWFkb25seSBsb3dlcjogUml2ZXJSZWFjaDtcbiAgcmVhZG9ubHkgdXBwZXI6IFJpdmVyUmVhY2ggfCBudWxsO1xuICAvKiogVXBwZXItcml2ZXIgc291cmNlIHRhcm4gKHYyIG9ubHkpLiAqL1xuICByZWFkb25seSB0YXJuOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByOiBudW1iZXI7IGxldmVsOiBudW1iZXIgfSB8IG51bGw7XG5cbiAgY29uc3RydWN0b3Iob3B0czogSHlkcm9sb2d5T3B0aW9ucykge1xuICAgIHRoaXMuc2VlZCA9IG9wdHMuc2VlZDtcbiAgICB0aGlzLnZlcnNpb24gPSBvcHRzLnZlcnNpb247XG4gICAgdGhpcy5sYWtlID0gbG9jYXRlTGFrZShvcHRzLnYxSGVpZ2h0KTtcbiAgICB0aGlzLmxvd2VyID0gdHJhY2VMb3dlclJpdmVyKG9wdHMudjFIZWlnaHQsIHRoaXMubGFrZSk7XG4gICAgaWYgKG9wdHMudmVyc2lvbiA+PSAyKSB7XG4gICAgICBjb25zdCB1cHBlciA9IGF1dGhvclVwcGVyUml2ZXIob3B0cy5zZWVkLCB0aGlzLmxha2UpO1xuICAgICAgdGhpcy51cHBlciA9IHVwcGVyLnJlYWNoO1xuICAgICAgdGhpcy50YXJuID0gdXBwZXIudGFybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51cHBlciA9IG51bGw7XG4gICAgICB0aGlzLnRhcm4gPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdXJmYWNlIGN1cnJlbnQgZm9yIGEgd2F0ZXIgY29sdW1uLiBgbGV2ZWxgIGlzIHRoZSBjb2x1bW4ncyB3YXRlciBzdXJmYWNlLFxuICAgKiB1c2VkIHRvIHRlbGwgc2VhLWxldmVsIHdhdGVyIChsYWtlLCBsb3dlciByaXZlciwgc2VhKSBmcm9tIHRoZSB1cHBlciByaXZlci5cbiAgICovXG4gIGZsb3dBdCh4OiBudW1iZXIsIHo6IG51bWJlciwgbGV2ZWw6IG51bWJlcik6IEZsb3dTYW1wbGUge1xuICAgIGlmICh0aGlzLnVwcGVyICYmIGxldmVsID4gMC41KSB7XG4gICAgICBjb25zdCBoaXQgPSB0aGlzLnVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDw9IGhpdC53aWR0aCArIDIpIHtcbiAgICAgICAgY29uc3Qgc3BlZWQgPSBjbGFtcCgwLjU1ICsgaGl0LmdyYWRpZW50ICogOSwgMC40LCA0LjUpO1xuICAgICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogaGl0LnR4LCBkejogaGl0LnR6LCBzcGVlZCB9O1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMudGFybiAmJiBNYXRoLmh5cG90KHggLSB0aGlzLnRhcm4ueCwgeiAtIHRoaXMudGFybi56KSA8IHRoaXMudGFybi5yICsgNCkge1xuICAgICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLnRvd2FyZHMoeCwgeiwgdGhpcy51cHBlclNvdXJjZSgpLCAwLjA2KSB9O1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBsb3cgPSB0aGlzLmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8PSBsb3cud2lkdGggKyA2KSB7XG4gICAgICByZXR1cm4geyBib2R5OiAncml2ZXInLCBkeDogbG93LnR4LCBkejogbG93LnR6LCBzcGVlZDogMC4zNSArIDAuMjUgKiBzbW9vdGhzdGVwKGxvdy53aWR0aCArIDYsIDAsIGxvdy5kKSB9O1xuICAgIH1cbiAgICBjb25zdCBsZCA9IE1hdGguaHlwb3QoKHggLSB0aGlzLmxha2UueCkgLyB0aGlzLmxha2UucngsICh6IC0gdGhpcy5sYWtlLnopIC8gdGhpcy5sYWtlLnJ6KTtcbiAgICBpZiAobGQgPCAxLjM1KSB7XG4gICAgICAvLyBTbG93IGRyaWZ0IGZyb20gdGhlIGluZmxvdyB0b3dhcmQgdGhlIG91dGZsb3cgYXQgdGhlIGhlYWQgb2YgdGhlIGxvd2VyIHJpdmVyLlxuICAgICAgY29uc3QgaGVhZCA9IHRoaXMubG93ZXIucG9pbnRzW3RoaXMubG93ZXIucG9pbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgZHJpZnQgPSB0b3dhcmRzKHgsIHosIGhlYWQsIDAuMDgpO1xuICAgICAgcmV0dXJuIHsgYm9keTogJ2xha2UnLCAuLi5kcmlmdCB9O1xuICAgIH1cbiAgICByZXR1cm4geyBib2R5OiAnc2VhJywgZHg6IDAsIGR6OiAwLCBzcGVlZDogMCB9O1xuICB9XG5cbiAgcHJpdmF0ZSB1cHBlclNvdXJjZSgpOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0ge1xuICAgIGNvbnN0IHB0cyA9IHRoaXMudXBwZXIhLnBvaW50cztcbiAgICByZXR1cm4gcHRzW3B0cy5sZW5ndGggLSAxXTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b3dhcmRzKHg6IG51bWJlciwgejogbnVtYmVyLCBwOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH0sIHNwZWVkOiBudW1iZXIpIHtcbiAgY29uc3QgZHggPSBwLnggLSB4LCBkeiA9IHAueiAtIHo7XG4gIGNvbnN0IGxlbiA9IE1hdGguaHlwb3QoZHgsIGR6KSB8fCAxO1xuICByZXR1cm4geyBkeDogZHggLyBsZW4sIGR6OiBkeiAvIGxlbiwgc3BlZWQgfTtcbn1cblxuLyoqIEZpbmQgdGhlIHZhbGxleSBsYWtlIGZyb20gdGhlIHRlcnJhaW4gaXRzZWxmOiB0aGUgZGVlcCBiYXNpbiBOVyBvZiB0aGUgZm91bmRlciB2YWxsZXkuICovXG5mdW5jdGlvbiBsb2NhdGVMYWtlKGg6IEhlaWdodFNhbXBsZXIpOiBIeWRyb2xvZ3lbJ2xha2UnXSB7XG4gIGxldCBzeCA9IDAsIHN6ID0gMCwgbiA9IDAsIG1pblggPSBJbmZpbml0eSwgbWF4WCA9IC1JbmZpbml0eSwgbWluWiA9IEluZmluaXR5LCBtYXhaID0gLUluZmluaXR5O1xuICBmb3IgKGxldCB6ID0gLTQ2MDsgeiA8PSAtMTIwOyB6ICs9IDQpIHtcbiAgICBmb3IgKGxldCB4ID0gLTQ4MDsgeCA8PSAtNDA7IHggKz0gNCkge1xuICAgICAgaWYgKGgoeCwgeikgPiAtNCkgY29udGludWU7XG4gICAgICBzeCArPSB4OyBzeiArPSB6OyBuKys7XG4gICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgeCk7IG1heFggPSBNYXRoLm1heChtYXhYLCB4KTtcbiAgICAgIG1pblogPSBNYXRoLm1pbihtaW5aLCB6KTsgbWF4WiA9IE1hdGgubWF4KG1heFosIHopO1xuICAgIH1cbiAgfVxuICBpZiAobiA9PT0gMCkgcmV0dXJuIHsgeDogLTI2MCwgejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH07XG4gIHJldHVybiB7XG4gICAgeDogc3ggLyBuLCB6OiBzeiAvIG4sXG4gICAgcng6IE1hdGgubWF4KDMwLCAobWF4WCAtIG1pblgpIC8gMiArIDEwKSwgcno6IE1hdGgubWF4KDMwLCAobWF4WiAtIG1pblopIC8gMiArIDEwKSxcbiAgfTtcbn1cblxuLyoqXG4gKiBUcmFjZSB0aGUgY2FydmVkIGxvd2xhbmQgY2hhbm5lbCBmcm9tIHRoZSBsYWtlIG91dGZsb3cgc291dGggdG8gdGhlIHNlYS4gRm9yXG4gKiBlYWNoIDQgbSByb3cgdGhlIGNoYW5uZWwgaXMgdGhlIGxvd2VzdCBjb2x1bW4gbmVhciB0aGUgcHJldmlvdXMgY2VudHJlOyB0aGVcbiAqIHRyYWNlIGlzIHNtb290aGVkIHNvIHRoZSBmbG93IGZpZWxkIGRvZXMgbm90IGppdHRlciB3aXRoIHRoZSAxIG0gdm94ZWxzLlxuICovXG5mdW5jdGlvbiB0cmFjZUxvd2VyUml2ZXIoaDogSGVpZ2h0U2FtcGxlciwgbGFrZTogSHlkcm9sb2d5WydsYWtlJ10pOiBSaXZlclJlYWNoIHtcbiAgY29uc3QgcmF3OiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGxldCBjeCA9IGxha2UueCArIGxha2UucnggKiAwLjU1O1xuICBsZXQgeiA9IE1hdGgucm91bmQobGFrZS56ICsgbGFrZS5yeiAqIDAuNik7XG4gIC8vIFN0YXJ0IGF0IHRoZSBsYWtlJ3Mgc291dGgtZWFzdCBvdXRmbG93IGFuZCBmb2xsb3cgdGhlIGNoYW5uZWwgZG93bnN0cmVhbS5cbiAgZm9yICg7IHogPD0gOTAwOyB6ICs9IDQpIHtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBieCA9IGN4O1xuICAgIGZvciAobGV0IHggPSBNYXRoLnJvdW5kKGN4IC0gNDApOyB4IDw9IGN4ICsgNDA7IHggKz0gMikge1xuICAgICAgY29uc3QgdiA9IGgoeCwgeikgKyBNYXRoLmFicyh4IC0gY3gpICogMC4wMjtcbiAgICAgIGlmICh2IDwgYmVzdCkgeyBiZXN0ID0gdjsgYnggPSB4OyB9XG4gICAgfVxuICAgIGN4ID0gYng7XG4gICAgcmF3LnB1c2goeyB4OiBieCwgeiB9KTtcbiAgICAvLyBUaGUgdHJhY2UgZW5kcyBvbmNlIGl0IHJlYWNoZXMgb3BlbiBzZWEgZm9yIGEgc3VzdGFpbmVkIHN0cmV0Y2guXG4gICAgaWYgKGJlc3QgPCAtNiAmJiByYXcubGVuZ3RoID4gMjAgJiYgaChieCwgeiArIDgpIDwgLTYgJiYgaChieCwgeiArIDE2KSA8IC02KSBicmVhaztcbiAgfVxuICBjb25zdCBzbW9vdGggPSByYXcubWFwKChwLCBpKSA9PiB7XG4gICAgbGV0IHN4ID0gMCwgbiA9IDA7XG4gICAgZm9yIChsZXQgayA9IE1hdGgubWF4KDAsIGkgLSA0KTsgayA8PSBNYXRoLm1pbihyYXcubGVuZ3RoIC0gMSwgaSArIDQpOyBrKyspIHsgc3ggKz0gcmF3W2tdLng7IG4rKzsgfVxuICAgIHJldHVybiB7IHg6IHN4IC8gbiwgejogcC56IH07XG4gIH0pO1xuICAvLyBTdG9yZSBkb3duc3RyZWFtLWZpcnN0OiBpbmRleCAwIGlzIHRoZSBzZWEgbW91dGguXG4gIHNtb290aC5yZXZlcnNlKCk7XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gW107XG4gIGxldCBzID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzbW9vdGgubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaSA+IDApIHMgKz0gTWF0aC5oeXBvdChzbW9vdGhbaV0ueCAtIHNtb290aFtpIC0gMV0ueCwgc21vb3RoW2ldLnogLSBzbW9vdGhbaSAtIDFdLnopO1xuICAgIHBvaW50cy5wdXNoKHsgeDogc21vb3RoW2ldLngsIHo6IHNtb290aFtpXS56LCBzLCBsZXZlbDogMCwgd2lkdGg6IDYgfSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBSaXZlclJlYWNoKHBvaW50cywgNDApO1xufVxuXG4vKiogV2F0ZXItc3VyZmFjZSBkcm9wcyBhbG9uZyB0aGUgdXBwZXIgcml2ZXIsIGFzIChmcmFjdGlvbiBvZiBsZW5ndGgsIG1ldHJlcykuICovXG5jb25zdCBGQUxMUzogUmVhZG9ubHlBcnJheTxyZWFkb25seSBbbnVtYmVyLCBudW1iZXJdPiA9IFtbMC4yLCA3XSwgWzAuNDgsIDExXSwgWzAuNzQsIDEzXV07XG5jb25zdCBVUFBFUl9HUkFESUVOVCA9IDAuMDM7XG5cbi8qKlxuICogQXV0aG9yIHRoZSB2MiBtb3VudGFpbiByaXZlcjogYSBzZWVkZWQgbWVhbmRlcmluZyBjZW50cmVsaW5lIGZyb20gdGhlIGxha2Unc1xuICogbm9ydGggc2hvcmUgdG8gYSBoaWdobGFuZCB0YXJuLCB3aXRoIGEgbGV2ZWwgcHJvZmlsZSB0aGF0IG9ubHkgcmlzZXNcbiAqIHVwc3RyZWFtIChnZW50bGUgZ3JhZGllbnQgcGx1cyB0aHJlZSBjYXNjYWRlcykuXG4gKi9cbmZ1bmN0aW9uIGF1dGhvclVwcGVyUml2ZXIoc2VlZDogbnVtYmVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IHtcbiAgcmVhY2g6IFJpdmVyUmVhY2g7IHRhcm46IE5vbk51bGxhYmxlPEh5ZHJvbG9neVsndGFybiddPjtcbn0ge1xuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChzZWVkIF4gMHg1ZWVkMikgPj4+IDApO1xuICBjb25zdCBqID0gKGE6IG51bWJlcikgPT4gKHJuZCgpIC0gMC41KSAqIDIgKiBhO1xuICBjb25zdCBtb3V0aCA9IHsgeDogbGFrZS54ICsgbGFrZS5yeCAqIDAuMSwgejogbGFrZS56IC0gbGFrZS5yeiAqIDAuNTUgfTtcbiAgY29uc3QgY29udHJvbHMgPSBbXG4gICAgbW91dGgsXG4gICAgeyB4OiBsYWtlLnggKyAyMCArIGooMjApLCB6OiAtNDEwICsgaigxNSkgfSxcbiAgICB7IHg6IC0xOTAgKyBqKDM1KSwgejogLTUyMCArIGooMjApIH0sXG4gICAgeyB4OiAtMjE1ICsgaigzNSksIHo6IC02NDAgKyBqKDIwKSB9LFxuICAgIHsgeDogLTE2NSArIGooMzApLCB6OiAtNzcwICsgaigxNSkgfSxcbiAgXTtcbiAgLy8gQ2F0bXVsbC1Sb20gdGhyb3VnaCB0aGUgY29udHJvbHMsIHRoZW4gcmVzYW1wbGUgYXQgfjggbSBzcGFjaW5nIHdpdGggYVxuICAvLyBzbWFsbCBzZWVkZWQgbWVhbmRlciBzbyB0aGUgY2hhbm5lbCBpcyBub3QgYSBzbW9vdGggc3BsaW5lLlxuICBjb25zdCBkZW5zZTogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlciB9PiA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbnRyb2xzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGNvbnN0IHAwID0gY29udHJvbHNbTWF0aC5tYXgoMCwgaSAtIDEpXSwgcDEgPSBjb250cm9sc1tpXTtcbiAgICBjb25zdCBwMiA9IGNvbnRyb2xzW2kgKyAxXSwgcDMgPSBjb250cm9sc1tNYXRoLm1pbihjb250cm9scy5sZW5ndGggLSAxLCBpICsgMildO1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgMjQ7IGsrKykge1xuICAgICAgY29uc3QgdCA9IGsgLyAyNCwgdDIgPSB0ICogdCwgdDMgPSB0MiAqIHQ7XG4gICAgICBkZW5zZS5wdXNoKHtcbiAgICAgICAgeDogMC41ICogKDIgKiBwMS54ICsgKC1wMC54ICsgcDIueCkgKiB0ICsgKDIgKiBwMC54IC0gNSAqIHAxLnggKyA0ICogcDIueCAtIHAzLngpICogdDJcbiAgICAgICAgICArICgtcDAueCArIDMgKiBwMS54IC0gMyAqIHAyLnggKyBwMy54KSAqIHQzKSxcbiAgICAgICAgejogMC41ICogKDIgKiBwMS56ICsgKC1wMC56ICsgcDIueikgKiB0ICsgKDIgKiBwMC56IC0gNSAqIHAxLnogKyA0ICogcDIueiAtIHAzLnopICogdDJcbiAgICAgICAgICArICgtcDAueiArIDMgKiBwMS56IC0gMyAqIHAyLnogKyBwMy56KSAqIHQzKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBkZW5zZS5wdXNoKGNvbnRyb2xzW2NvbnRyb2xzLmxlbmd0aCAtIDFdKTtcbiAgY29uc3QgcmVzYW1wbGVkOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyOyBzOiBudW1iZXIgfT4gPSBbeyAuLi5kZW5zZVswXSwgczogMCB9XTtcbiAgbGV0IGFjYyA9IDAsIHMgPSAwO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGRlbnNlLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgc3RlcCA9IE1hdGguaHlwb3QoZGVuc2VbaV0ueCAtIGRlbnNlW2kgLSAxXS54LCBkZW5zZVtpXS56IC0gZGVuc2VbaSAtIDFdLnopO1xuICAgIGFjYyArPSBzdGVwOyBzICs9IHN0ZXA7XG4gICAgaWYgKGFjYyA+PSA4IHx8IGkgPT09IGRlbnNlLmxlbmd0aCAtIDEpIHtcbiAgICAgIGNvbnN0IG0gPSAoZmJtMihzIC8gNjAsIDMuMSwgc2VlZCArIDgwMSwgMikgLSAwLjUpICogMTQ7XG4gICAgICByZXNhbXBsZWQucHVzaCh7IHg6IGRlbnNlW2ldLnggKyBtLCB6OiBkZW5zZVtpXS56LCBzIH0pO1xuICAgICAgYWNjID0gMDtcbiAgICB9XG4gIH1cbiAgY29uc3QgdG90YWwgPSByZXNhbXBsZWRbcmVzYW1wbGVkLmxlbmd0aCAtIDFdLnM7XG4gIGNvbnN0IGxldmVsQXQgPSAoc3Y6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgbGV0IGxldmVsID0gc3YgKiBVUFBFUl9HUkFESUVOVDtcbiAgICBmb3IgKGNvbnN0IFtmcmFjLCBkcm9wXSBvZiBGQUxMUykge1xuICAgICAgLy8gRWFjaCBmYWxsIGlzIGEgc2hvcnQgY2FzY2FkZSBvdmVyIH4xMCBtIG9mIGNoYW5uZWwuXG4gICAgICBsZXZlbCArPSBkcm9wICogc21vb3Roc3RlcCh0b3RhbCAqIGZyYWMgLSA1LCB0b3RhbCAqIGZyYWMgKyA1LCBzdik7XG4gICAgfVxuICAgIC8vIFRoZSBmaXJzdCA0MCBtIGludG8gdGhlIGxha2Ugc3RheXMgYXQgbGFrZSBsZXZlbC5cbiAgICByZXR1cm4gc3YgPCA0MCA/IDAgOiBsZXZlbCAtIDQwICogVVBQRVJfR1JBRElFTlQ7XG4gIH07XG4gIGNvbnN0IHBvaW50czogUml2ZXJQb2ludFtdID0gcmVzYW1wbGVkLm1hcCgocCkgPT4gKHtcbiAgICB4OiBwLngsIHo6IHAueiwgczogcC5zLCBsZXZlbDogTWF0aC5tYXgoMCwgbGV2ZWxBdChwLnMpKSxcbiAgICB3aWR0aDogMy4yICsgMi4yICogZmJtMihwLnMgLyA3MCwgOS43LCBzZWVkICsgODAyLCAyKSArICgxIC0gcC5zIC8gdG90YWwpICogMS41LFxuICB9KSk7XG4gIGNvbnN0IHNvdXJjZSA9IHBvaW50c1twb2ludHMubGVuZ3RoIC0gMV07XG4gIHJldHVybiB7XG4gICAgcmVhY2g6IG5ldyBSaXZlclJlYWNoKHBvaW50cywgMTEwKSxcbiAgICB0YXJuOiB7IHg6IHNvdXJjZS54LCB6OiBzb3VyY2UueiwgcjogMTgsIGxldmVsOiBzb3VyY2UubGV2ZWwgfSxcbiAgfTtcbn1cbiIsICIvLyBWb3hlbCBtYXRlcmlhbCBpZHMuIFB1cmUgZGF0YSBzaGFyZWQgYnkgdGhlIHNpbXVsYXRpb24gbGF5ZXIgKEQtMDA1KS5cbi8vIElkcyBhcmUgcGVyc2lzdGVkIGluIHNuYXBzaG90IGVkaXRzLCBzbyBleGlzdGluZyB2YWx1ZXMgbXVzdCBuZXZlciBjaGFuZ2UuXG5leHBvcnQgY29uc3QgTUFUID0ge1xuICBBSVI6IDAsXG4gIEdSQVNTOiAxLFxuICBTT0lMOiAyLFxuICBTQU5EOiAzLFxuICBHUkFWRUw6IDQsXG4gIFNUT05FOiA1LFxuICBPUkU6IDYsXG4gIFdBVEVSOiA3LFxuICBCRURST0NLOiA4LFxuICBNT1NTOiA5LFxuICAvKiogR2VuZXJhdG9yIHYyIGhpZ2hsYW5kcy4gTmV2ZXIgcHJvZHVjZWQgYnkgZ2VuZXJhdG9yIHYxLiAqL1xuICBTTk9XOiAxMCxcbn0gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBNYXRJZCA9ICh0eXBlb2YgTUFUKVtrZXlvZiB0eXBlb2YgTUFUXTtcblxuZXhwb3J0IGNvbnN0IGlzU29saWQgPSAobTogbnVtYmVyKTogYm9vbGVhbiA9PiBtICE9PSBNQVQuQUlSICYmIG0gIT09IE1BVC5XQVRFUjtcbmV4cG9ydCBjb25zdCBpc09wYXF1ZSA9IGlzU29saWQ7XG5cbi8qKiBIaWdoZXN0IG1hdGVyaWFsIGlkIHRoYXQgbWF5IGFwcGVhciBpbiBhIHZveGVsIGVkaXQuICovXG5leHBvcnQgY29uc3QgTUFYX01BVF9JRCA9IDEwO1xuIiwgIi8vIFRlcnJhaW4gZ2VuZXJhdG9yIHYyIFx1MjAxNCB0aGUgdmFsbGV5LXdpdGgtbW91bnRhaW5zIGdlb2dyYXBoeSAocHVyZSBUUywgRC0wMDUpLlxuLy9cbi8vIENvbXBhdGliaWxpdHkgY29udHJhY3Q6IGluc2lkZSB0aGUgZm91bmRlciBjb3JyaWRvciAodGhlIHNldHRsZW1lbnQgdmFsbGV5LFxuLy8gdGhlIGxha2UgYW5kIHRoZSBsb3dsYW5kIHJpdmVyKSB2MiBoZWlnaHRzIGVxdWFsIHYxIGV4YWN0bHksIHNvIHRoZSBwaW5uZWRcbi8vIGZvdW5kZXIgcHJvamVjdHMsIHRoZWlyIHByZXBhcmF0aW9uIHRhcmdldHMgYW5kIG5hdHVyYWwgZW50aXRpZXMgdGhlcmUgYXJlXG4vLyB1bmNoYW5nZWQuIE91dHNpZGUgaXQgdjIgYWRkczpcbi8vICAgLSBhIG5vcnRoZXJuIG1hc3NpZiBvbiBhbiBleHRlbmRlZCBpc2xhbmQsIHdpdGggc25vdyBhYm92ZSB0aGUgc25vd2xpbmU7XG4vLyAgIC0gZmxhbmtpbmcgcmFuZ2VzIHdlc3QgYW5kIGVhc3Qgb2YgdGhlIHZhbGxleSwgdGVycmFjZWQgaW50byBjbGlmZiBiYW5kcztcbi8vICAgLSBhIG1vdW50YWluIHJpdmVyIGNhcnZlZCBpbnRvIHRoZSBtYXNzaWYgZnJvbSBhIHRhcm4gZG93biB0byB0aGUgbGFrZSxcbi8vICAgICB3aG9zZSB3YXRlciBzdXJmYWNlIGNvbWVzIGZyb20gSHlkcm9sb2d5IGFuZCBuZXZlciByaXNlcyBkb3duc3RyZWFtO1xuLy8gICAtIGEgY29udGludW91cyBsb3dsYW5kIGNoYW5uZWwgKHYxIGhhcyBhIGRyeSBmb3JkIHNvdXRoIG9mIHRoZSBzaGVsZikuXG4vLyBIZWlnaHRzIGFyZSBpbnRlZ2VycyBpbiBbLTE0LCAxMDRdLlxuaW1wb3J0IHsgY2xhbXAsIGZibTIsIGxlcnAsIHNtb290aHN0ZXAgfSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7IE1BVCwgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5cbmV4cG9ydCBjb25zdCBWMl9TTk9XTElORSA9IDc0O1xuZXhwb3J0IGNvbnN0IFYyX01BWF9IRUlHSFQgPSAxMDQ7XG5cbmV4cG9ydCB0eXBlIFYxSGVpZ2h0ID0gKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpID0+IG51bWJlcjtcblxuZXhwb3J0IGludGVyZmFjZSBWMkNvbHVtbiB7XG4gIC8qKiBUb3Agc29saWQgeSArIDEgKHNhbWUgY29udmVudGlvbiBhcyBzdXJmYWNlSGVpZ2h0QXQpLiAqL1xuICBoOiBudW1iZXI7XG4gIC8qKiBXYXRlciBzdXJmYWNlIGZvciB0aGlzIGNvbHVtbjogY2VsbHMgW2gsIGxldmVsKSBob2xkIHdhdGVyLiAqL1xuICBsZXZlbDogbnVtYmVyO1xuICAvKiogVHJ1ZSB3aGVuIHRoaXMgY29sdW1uIGlzIHBhcnQgb2YgdGhlIGNhcnZlZCBtb3VudGFpbi1yaXZlciBjaGFubmVsLiAqL1xuICBjaGFubmVsOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgVGVycmFpblYyIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcmVhZG9ubHkgc2VlZDogbnVtYmVyLFxuICAgIHByaXZhdGUgcmVhZG9ubHkgdjE6IFYxSGVpZ2h0LFxuICAgIHJlYWRvbmx5IGh5ZHJvbG9neTogSHlkcm9sb2d5LFxuICApIHt9XG5cbiAgLyoqIDAgPSBleGFjdGx5IHYxIChmb3VuZGVyIGNvcnJpZG9yKTsgMSA9IGZ1bGwgdjIgcmVsaWVmLiAqL1xuICByZWxpZWZNYXNrKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTM5MCwgLTQ3MCwgeik7XG4gICAgLy8gVGhlIHdlc3QgcmFuZ2Uga2VlcHMgY2xlYXIgb2YgdGhlIGxha2UgYmFzaW4gdW50aWwgdGhlIGxha2UgaXMgcGFzc2VkLlxuICAgIGNvbnN0IHdlc3RFZGdlID0gbGVycCgtNDUwLCAtMzIwLCBzbW9vdGhzdGVwKC0yMjAsIC0xNDAsIHopKTtcbiAgICBjb25zdCB3ZXN0ID0gc21vb3Roc3RlcCh3ZXN0RWRnZSwgd2VzdEVkZ2UgLSA5MCwgeCk7XG4gICAgY29uc3QgZWFzdCA9IHNtb290aHN0ZXAoMjMwLCAzMzAsIHgpO1xuICAgIHJldHVybiBNYXRoLm1heChub3J0aCwgd2VzdCwgZWFzdCk7XG4gIH1cblxuICAvKiogMCBhdCB0aGUgcmFuZ2UgZnJvbnQsIDEgZGVlcCBpbnNpZGU6IGZvb3RoaWxscyBmaXJzdCwgcGVha3MgYmVoaW5kLiAqL1xuICByYW5nZURlcHRoKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBub3J0aCA9IHNtb290aHN0ZXAoLTQyMCwgLTcwMCwgeik7XG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlIC0gNDAsIHdlc3RFZGdlIC0gMzAwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyNzAsIDU2MCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFYyQ29sdW1uIHtcbiAgICBjb25zdCBzZWVkID0gdGhpcy5zZWVkO1xuICAgIGNvbnN0IGJhc2UgPSB0aGlzLnYxKHNlZWQsIHgsIHopO1xuICAgIGNvbnN0IG1hc2sgPSB0aGlzLnJlbGllZk1hc2soeCwgeik7XG4gICAgbGV0IGggPSBiYXNlO1xuXG4gICAgaWYgKG1hc2sgPiAwKSB7XG4gICAgICAvLyBFeHRlbmQgdGhlIGlzbGFuZCBub3J0aCBzbyB0aGUgbWFzc2lmIGhhcyByb29tICh2MSBjb2FzdCBpcyB+eiAtNjAwKS5cbiAgICAgIGNvbnN0IG5vcnRoTGFuZCA9IHNtb290aHN0ZXAoLTQyMCwgLTUyMCwgeik7XG4gICAgICBjb25zdCBzaG9yZSA9IDEgLSBNYXRoLmh5cG90KCh4ICsgMTUwKSAvIDU2MCwgKHogKyA2OTApIC8gMzAwKVxuICAgICAgICArIChmYm0yKHggLyAxNjAsIHogLyAxNjAsIHNlZWQgKyA3MDEsIDMpIC0gMC41KSAqIDAuMztcbiAgICAgIGNvbnN0IGxhbmROID0gc21vb3Roc3RlcCgwLjAsIDAuMTQsIHNob3JlKSAqIG5vcnRoTGFuZDtcbiAgICAgIGNvbnN0IGdyb3VuZCA9IGxlcnAoYmFzZSwgTWF0aC5tYXgoYmFzZSwgNSArIDUgKiBmYm0yKHggLyA5MCwgeiAvIDkwLCBzZWVkICsgNzAyLCAyKSksIGxhbmROKTtcblxuICAgICAgLy8gUmlkZ2VkIG1hc3NpZiB3aXRoIHRlcnJhY2VkIGNsaWZmIGJhbmRzLlxuICAgICAgY29uc3Qgd3ggPSB4ICsgKGZibTIoeCAvIDI2MCwgeiAvIDI2MCwgc2VlZCArIDcwMywgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3Qgd3ogPSB6ICsgKGZibTIoeCAvIDI2MCArIDUuMSwgeiAvIDI2MCAtIDIuNywgc2VlZCArIDcwNCwgMykgLSAwLjUpICogMTIwO1xuICAgICAgY29uc3QgcjEgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMTAsIHd6IC8gMjEwLCBzZWVkICsgNzA1LCA0KSAtIDEpO1xuICAgICAgY29uc3QgcjIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4MCwgd3ogLyA4MCwgc2VlZCArIDcwNiwgMykgLSAxKTtcbiAgICAgIGNvbnN0IGx1bXAgPSBmYm0yKHd4IC8gMTIwLCB3eiAvIDEyMCwgc2VlZCArIDcwNywgMyk7XG4gICAgICBjb25zdCBkZXB0aCA9IHRoaXMucmFuZ2VEZXB0aCh4LCB6KTtcbiAgICAgIGxldCBtb3VudGFpbiA9IDE2ICsgKDggKyA4MCAqIGRlcHRoKSAqICgwLjU1ICogcjEgKiByMSArIDAuMjggKiByMiArIDAuMTcgKiBsdW1wKVxuICAgICAgICArIDE4ICogZGVwdGggKiBzbW9vdGhzdGVwKDAuNTUsIDAuOSwgcjEpO1xuICAgICAgY29uc3QgYmFuZCA9IDYgKyAyICogZmJtMih4IC8gMTQwLCB6IC8gMTQwLCBzZWVkICsgNzA4LCAyKTtcbiAgICAgIGNvbnN0IHQgPSBNYXRoLmZsb29yKG1vdW50YWluIC8gYmFuZCk7XG4gICAgICBjb25zdCBmcmFjID0gbW91bnRhaW4gLyBiYW5kIC0gdDtcbiAgICAgIG1vdW50YWluID0gKHQgKyBzbW9vdGhzdGVwKDAuNSwgMC44LCBmcmFjKSkgKiBiYW5kO1xuXG4gICAgICAvLyBPbmx5IGxhbmQgcmlzZXM7IHRoZSBzZWEgc3RheXMgc2VhLCBzbyByYW5nZXMgZW5kIGluIGNvYXN0YWwgY2xpZmZzLlxuICAgICAgY29uc3QgbGFuZEZhY3RvciA9IHNtb290aHN0ZXAoLTIsIDgsIGdyb3VuZCk7XG4gICAgICBoID0gbGVycChncm91bmQsIE1hdGgubWF4KGdyb3VuZCwgbW91bnRhaW4pLCBtYXNrICogbGFuZEZhY3Rvcik7XG4gICAgfVxuXG4gICAgbGV0IGxldmVsID0gaCA8IDAgPyAwIDogLUluZmluaXR5O1xuICAgIGxldCBjaGFubmVsID0gZmFsc2U7XG5cbiAgICAvLyBNb3VudGFpbiByaXZlcjogdmFsbGV5IGZsb29yLCBiYW5rcyBhbmQgY2hhbm5lbCBmb2xsb3cgdGhlIHdhdGVyIGxldmVsLlxuICAgIGNvbnN0IHVwcGVyID0gdGhpcy5oeWRyb2xvZ3kudXBwZXI7XG4gICAgaWYgKHVwcGVyKSB7XG4gICAgICBjb25zdCBoaXQgPSB1cHBlci5uZWFyZXN0KHgsIHopO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICBjb25zdCByYWlzZWQgPSBoaXQubGV2ZWwgPiAwLjI1O1xuICAgICAgICBjb25zdCB2dyA9IDU1ICsgMjggKiBmYm0yKGhpdC5zIC8gOTAsIDEuNywgc2VlZCArIDcwOSwgMik7XG4gICAgICAgIGNvbnN0IGZsb29yID0gaGl0LmxldmVsICsgMS41ICsgMi4yICogZmJtMih4IC8gNDAsIHogLyA0MCwgc2VlZCArIDcxMCwgMikgKyBoaXQuZCAqIDAuMDY7XG4gICAgICAgIGNvbnN0IHQgPSBzbW9vdGhzdGVwKHZ3ICogMC4zLCB2dywgaGl0LmQpO1xuICAgICAgICBoID0gTWF0aC5taW4oaCwgbGVycChmbG9vciwgaCwgdCkpO1xuICAgICAgICBjb25zdCB3ID0gaGl0LndpZHRoO1xuICAgICAgICBpZiAocmFpc2VkICYmIGhpdC5kIDwgdyArIDMpIHtcbiAgICAgICAgICAvLyBCYW5rcyBob2xkIGEgcmFpc2VkIHJpdmVyOiBuZXZlciBiZWxvdyBpdHMgd2F0ZXIgc3VyZmFjZS4gQXQgbGFrZVxuICAgICAgICAgIC8vIGxldmVsIHRoZSBzZWEtbGV2ZWwgZmlsbCBhbHJlYWR5IGNvbnRhaW5zIHRoZSB3YXRlci5cbiAgICAgICAgICBoID0gTWF0aC5tYXgoaCwgTWF0aC5jZWlsKGhpdC5sZXZlbCkgKyAxKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaGl0LmQgPCB3KSB7XG4gICAgICAgICAgY29uc3QgYmVkID0gaGl0LmxldmVsIC0gKDEuMiArIDEuMyAqICgxIC0gaGl0LmQgLyB3KSk7XG4gICAgICAgICAgaCA9IE1hdGgubWluKGgsIGJlZCk7XG4gICAgICAgICAgaWYgKHJhaXNlZCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZChoaXQubGV2ZWwpKTtcbiAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgdGFybiA9IHRoaXMuaHlkcm9sb2d5LnRhcm47XG4gICAgICBpZiAodGFybikge1xuICAgICAgICBjb25zdCB0ZCA9IE1hdGguaHlwb3QoeCAtIHRhcm4ueCwgeiAtIHRhcm4ueilcbiAgICAgICAgICAqICgxICsgMC4yICogKGZibTIoeCAvIDMwLCB6IC8gMzAsIHNlZWQgKyA3MTEsIDIpIC0gMC41KSk7XG4gICAgICAgIGlmICh0ZCA8IHRhcm4uciArIDYpIHtcbiAgICAgICAgICBjb25zdCByaW0gPSBNYXRoLmNlaWwodGFybi5sZXZlbCkgKyAxO1xuICAgICAgICAgIGlmICh0ZCA+PSB0YXJuLnIpIGggPSBNYXRoLm1heChoLCByaW0pO1xuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaCA9IE1hdGgubWluKE1hdGgubWF4KGgsIHJpbSksIHRhcm4ubGV2ZWwgLSAxIC0gMyAqIHNtb290aHN0ZXAodGFybi5yLCAwLCB0ZCkpO1xuICAgICAgICAgICAgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgTWF0aC5yb3VuZCh0YXJuLmxldmVsKSk7XG4gICAgICAgICAgICBjaGFubmVsID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBMb3dsYW5kIGNoYW5uZWwgY29udGludWl0eTogdjEgbGVhdmVzIGEgZHJ5IGZvcmQgd2hlcmUgdGhlIHNoZWxmIG1lZXRzIHRoZSByaXZlci5cbiAgICBjb25zdCBsb3cgPSB0aGlzLmh5ZHJvbG9neS5sb3dlci5uZWFyZXN0KHgsIHopO1xuICAgIGlmIChsb3cgJiYgbG93LmQgPCAyLjUgJiYgaCA+PSAwICYmIGJhc2UgPCA0KSBoID0gLTE7XG5cbiAgICBoID0gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIFYyX01BWF9IRUlHSFQpKTtcbiAgICBpZiAoaCA8IDApIGxldmVsID0gTWF0aC5tYXgobGV2ZWwsIDApO1xuICAgIHJldHVybiB7IGgsIGxldmVsOiBsZXZlbCA9PT0gLUluZmluaXR5ID8gaCA6IGxldmVsLCBjaGFubmVsIH07XG4gIH1cblxuICBoZWlnaHQoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmNvbHVtbih4LCB6KS5oO1xuICB9XG5cbiAgLyoqIHYyIHRvcCBtYXRlcmlhbC4gRmFsbHMgYmFjayB0byB0aGUgdjEgcnVsZXMgZm9yIHRoZSB1bmNoYW5nZWQgY29ycmlkb3IuICovXG4gIHRvcE1hdGVyaWFsKFxuICAgIHg6IG51bWJlciwgejogbnVtYmVyLCBjb2w6IFYyQ29sdW1uLCBzbG9wZTogbnVtYmVyLFxuICAgIHYxVG9wOiAoaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyKSA9PiBNYXRJZCxcbiAgKTogTWF0SWQge1xuICAgIGNvbnN0IGggPSBjb2wuaDtcbiAgICBpZiAoY29sLmNoYW5uZWwgJiYgY29sLmxldmVsID4gaCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIgJiYgaCA+IDEpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0ICYmIGhpdC5kIDwgaGl0LndpZHRoICsgMi41ICYmIGhpdC5sZXZlbCA+IDAuMjUpIHtcbiAgICAgICAgcmV0dXJuIGZibTIoeCAvIDYsIHogLyA2LCB0aGlzLnNlZWQgKyA3MTIsIDEpID4gMC41ID8gTUFULkdSQVZFTCA6IE1BVC5TQU5EO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzbm93bGluZSA9IFYyX1NOT1dMSU5FICsgKGZibTIoeCAvIDcwLCB6IC8gNzAsIHRoaXMuc2VlZCArIDcxMywgMykgLSAwLjUpICogMTY7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgJiYgc2xvcGUgPD0gMykgcmV0dXJuIE1BVC5TTk9XO1xuICAgIGlmIChoID49IHNub3dsaW5lIC0gNiAmJiBzbG9wZSA8PSAxICYmIGZibTIoeCAvIDIwLCB6IC8gMjAsIHRoaXMuc2VlZCArIDcxNCwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKHRoaXMucmVsaWVmTWFzayh4LCB6KSA+IDAuNSAmJiBoID4gMzAgJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgICByZXR1cm4gdjFUb3AoaCwgc2xvcGUpO1xuICB9XG59XG4iLCAiLy8gU2ltdWxhdGlvbiBsYXllciBcdTIwMTQgcHVyZSBUeXBlU2NyaXB0LCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMSB3b3JsZCBmb3VuZGF0aW9uOiBhIGNodW5rZWQsIGdlbnVpbmVseSB0aHJlZS1kaW1lbnNpb25hbCB2b3hlbCB3b3JsZC5cbi8vIFRoZSBzdG9yZWQgc3RhdGUgaXMgb25lIG1hdGVyaWFsIGJ5dGUgcGVyIGNlbGwgKDAgPSBhaXIpOyBvY2N1cGFuY3kgaXNcbi8vIGltcGxpY2l0LiBTdXJmYWNlIGhlaWdodCBpcyBhIGRlcml2ZWQgcXVlcnksIG5vdCB0aGUgc3RvcmFnZS4gVGhpcyByZXBsYWNlc1xuLy8gdGhlIGZvcm1lciAyNTYgeCAyNTYgaGVpZ2h0ZmllbGQgKHNlZSBJUi0wMDUpLlxuLy9cbi8vIFdvcmxkIG1ldHJlczogeC96IGluIFstMTAyNCwgMTAyNCksIHkgaW4gWy0xNiwgMTEyKSwgc2VhIGxldmVsIDAuXG4vLyBBIGNodW5rIGlzIDMyIHggMzIgeCAxMjggY2VsbHMuIEdlbmVyYXRpb24gaXMgYSBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkLFxuLy8gZ2VuZXJhdG9yIHZlcnNpb24sIHBhcmFtZXRlcnMgYW5kIGNodW5rIGNvb3JkaW5hdGVzOyBlZGl0cyBhcmUgcmVjb3JkZWRcbi8vIHNlcGFyYXRlbHkgYW5kIHJlLWFwcGxpZWQgd2hlbiBhIGNodW5rIGlzIHJlZ2VuZXJhdGVkLlxuaW1wb3J0IHR5cGUgeyBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBMaWZlU3RhdGUgfSBmcm9tICcuL2Vjb25vbXknO1xuaW1wb3J0IHR5cGUgeyBIb21lc3RlYWRTdGF0ZSB9IGZyb20gJy4vaG9tZXN0ZWFkJztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQgeyBIeWRyb2xvZ3kgfSBmcm9tICcuL2h5ZHJvbG9neSc7XG5pbXBvcnQgeyBUZXJyYWluVjIsIFYyQ29sdW1uIH0gZnJvbSAnLi90ZXJyYWluLXYyJztcblxuZXhwb3J0IGNvbnN0IFdPUkxEX1NJWkUgPSAyMDQ4O1xuZXhwb3J0IGNvbnN0IEhBTEYgPSBXT1JMRF9TSVpFIC8gMjtcbmV4cG9ydCBjb25zdCBDSFVOS19TSVpFID0gMzI7XG5leHBvcnQgY29uc3QgQ0hVTktTX1BFUl9TSURFID0gV09STERfU0laRSAvIENIVU5LX1NJWkU7XG5leHBvcnQgY29uc3QgWV9NSU4gPSAtMTY7XG5leHBvcnQgY29uc3QgWV9NQVggPSAxMTI7XG5leHBvcnQgY29uc3QgV09STERfSEVJR0hUID0gWV9NQVggLSBZX01JTjtcbmV4cG9ydCBjb25zdCBTRUFfTEVWRUwgPSAwO1xuZXhwb3J0IGNvbnN0IFdBVEVSID0gU0VBX0xFVkVMO1xuLyoqIEdlbmVyYXRvciB2MTogdGhlIG9yaWdpbmFsIDIwNDggbSBpc2xhbmQuIERlZmF1bHQgZm9yIGNyZWF0ZVdvcmxkIGFuZCBhbGwgbGVnYWN5IHNhdmVzLiAqL1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WRVJTSU9OID0gMTtcbi8qKiBHZW5lcmF0b3IgdjI6IHZhbGxleS13aXRoLW1vdW50YWlucyBnZW9ncmFwaHkgd2l0aCBhIG1vdW50YWluIHJpdmVyIChzZWUgdGVycmFpbi12Mi50cykuICovXG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1YyID0gMjtcbi8qKiBUaGUgZ2VuZXJhdG9yIG5ldyBicm93c2VyIHdvcmxkcyB1c2UgYnkgZGVmYXVsdC4gKi9cbmV4cG9ydCBjb25zdCBMQVRFU1RfR0VORVJBVE9SX1ZFUlNJT04gPSBHRU5FUkFUT1JfVjI7XG5leHBvcnQgY29uc3QgU1VQUE9SVEVEX0dFTkVSQVRPUl9WRVJTSU9OUzogcmVhZG9ubHkgbnVtYmVyW10gPSBbR0VORVJBVE9SX1ZFUlNJT04sIEdFTkVSQVRPUl9WMl07XG5leHBvcnQgY29uc3QgaXNTdXBwb3J0ZWRHZW5lcmF0b3IgPSAodjogdW5rbm93bik6IHYgaXMgbnVtYmVyID0+XG4gIHR5cGVvZiB2ID09PSAnbnVtYmVyJyAmJiBTVVBQT1JURURfR0VORVJBVE9SX1ZFUlNJT05TLmluY2x1ZGVzKHYpO1xuZXhwb3J0IGNvbnN0IENIVU5LX1ZPTFVNRSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFICogV09STERfSEVJR0hUO1xuZXhwb3J0IGNvbnN0IENIVU5LX0FSRUEgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRTtcblxuZXhwb3J0IHsgTUFULCBpc1NvbGlkLCBpc09wYXF1ZSwgTUFYX01BVF9JRCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmV4cG9ydCB0eXBlIHsgTWF0SWQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5pbXBvcnQgeyBNQVQsIGlzU29saWQsIE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuXG5leHBvcnQge1xuICBjbGFtcCwgbGVycCwgaGFzaDJpLCBoYXNoM2ksIG11bGJlcnJ5MzIsIGZibTIsXG59IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHtcbiAgY2xhbXAsIGxlcnAsIHNtb290aHN0ZXAsIGhhc2gyaSwgaGFzaDNpLCBtdWxiZXJyeTMyLCB2YWx1ZU5vaXNlMywgZmJtMiwgZmJtMyxcbn0gZnJvbSAnLi9ub2lzZSc7XG5cbi8vIC0tLS0tLS0tLS0gd29ybGQgdHlwZXMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFBhcmFtcyB7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1BBUkFNUzogV29ybGRQYXJhbXMgPSB7XG4gIHNpemU6IFdPUkxEX1NJWkUsXG4gIGNodW5rU2l6ZTogQ0hVTktfU0laRSxcbiAgeU1pbjogWV9NSU4sXG4gIHlNYXg6IFlfTUFYLFxuICBzZWFMZXZlbDogU0VBX0xFVkVMLFxuICBnZW5lcmF0b3JWZXJzaW9uOiBHRU5FUkFUT1JfVkVSU0lPTixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIGtleTogc3RyaW5nO1xuICAvKiogeCArIHoqMzIgKyAoeS1ZX01JTikqMTAyNCAqL1xuICBkYXRhOiBVaW50OEFycmF5O1xuICAvKiogdG9wIHNvbGlkIHksIGVuY29kZWQgYXMgKHkgLSBZX01JTiksIDAuLjEyNzsgMCBtZWFucyBubyBzb2xpZC4gKi9cbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgLyoqIHRvcCBtYXRlcmlhbCBwZXIgY29sdW1uLiAqL1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xuICBkaXJ0eTogYm9vbGVhbjtcbiAgZ2VuZXJhdGVkQXQ6IG51bWJlcjtcbn1cblxuLy8gTmF0dXJhbCBhc3NldHMgYXJlIHRoZSBwcm9qZWN0J3MgU3R5bCAoYG5hdF9gKSBwaXBlbGluZSAoQVMtMDAxIHYyKSwgbm90XG4vLyBOb3hlbCBhcmNoaXRlY3R1cmUuIE5veGVsIHJlbWFpbnMgdGhlIGh1bWFuLW1hZGUga2l0L3dheXN0b25lL21hcmtlciBzeXN0ZW0uXG4vLyBSZXRpcmVkIG9ubHkgYXMgd29ybGQgY29udGVudC4gVGhlIG5hbWVzIHJlbWFpbiBpbiB0aGUgc2VyaWFsaXplZCB0eXBlIHNvXG4vLyBvbGQgc25hcHNob3RzIGFuZCBhY2NlcHRlZCBoYXJ2ZXN0IGpvdXJuYWxzIGNhbiBiZSBtaWdyYXRlZCB3aXRob3V0IHJlamVjdGluZ1xuLy8gb3RoZXJ3aXNlIHZhbGlkIHNhdmVzLiBHZW5lcmF0aW9uLCBjb2xsaXNpb24gYW5kIGluc3BlY3Rpb24gbmV2ZXIgdXNlIHRoZW0uXG5leHBvcnQgY29uc3QgUkVUSVJFRF9TVE9ORV9LSU5EUyA9IG5ldyBTZXQ8RW50aXR5S2luZD4oW1xuICAnc3R5bF9yb2NrX3NtYWxsJywgJ3N0eWxfcm9ja19tZWRpdW0nLCAnc3R5bF9yb2NrX2xhcmdlJyxcbl0pO1xuZXhwb3J0IGNvbnN0IGlzUmV0aXJlZFN0b25lS2luZCA9IChraW5kOiBFbnRpdHlLaW5kKTogYm9vbGVhbiA9PiBSRVRJUkVEX1NUT05FX0tJTkRTLmhhcyhraW5kKTtcbmV4cG9ydCB0eXBlIEFjdGl2ZUVudGl0eUtpbmQgPSBFeGNsdWRlPEVudGl0eUtpbmQsXG4gICdzdHlsX3JvY2tfc21hbGwnIHwgJ3N0eWxfcm9ja19tZWRpdW0nIHwgJ3N0eWxfcm9ja19sYXJnZSc+O1xuXG5mdW5jdGlvbiBsaXZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEVudGl0eSB8IG51bGwge1xuICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICByZXR1cm4gIWVudGl0eSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGlkKSA/IG51bGwgOiBlbnRpdHk7XG59XG5cbmV4cG9ydCB0eXBlIEVudGl0eUtpbmQgPVxuICB8ICdzdHlsX3RyZWVfc3BpcmUnXG4gIHwgJ3N0eWxfdHJlZV90YWJsZSdcbiAgfCAnc3R5bF90cmVlX2NsdXN0ZXInXG4gIHwgJ3N0eWxfdHJlZV9ibG9zc29tJ1xuICB8ICdzdHlsX3NocnViJ1xuICB8ICdzdHlsX3JvY2tfc21hbGwnXG4gIHwgJ3N0eWxfcm9ja19tZWRpdW0nXG4gIHwgJ3N0eWxfcm9ja19sYXJnZSdcbiAgfCAnc3R5bF9vcmUnXG4gIHwgJ3N0eWxfY2Fpcm4nXG4gIHwgJ3dheXN0b25lJ1xuICB8ICdtYXJrZXInO1xuXG5leHBvcnQgdHlwZSBSZXNvdXJjZVR5cGUgPSAnd29vZCcgfCAnc3RvbmUnIHwgJ29yZScgfCAnZmliZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVudGl0eSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIGNodW5rOiBzdHJpbmc7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBzY2FsZTogbnVtYmVyO1xuICB2YXJpYW50OiBudW1iZXI7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsO1xuICByZW1haW5pbmc6IG51bWJlcjtcbiAgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXI7XG4gIC8qKiBUcnVlIG9uY2UgdGhlIGVudGl0eSBpcyBmdWxseSBkZXBsZXRlZC4gKi9cbiAgaGFydmVzdGVkOiBib29sZWFuO1xuICAvKiogVHJ1ZSBhZnRlciB0aGUgZmlyc3Qgc3VjY2Vzc2Z1bCBoYXJ2ZXN0LCBldmVuIGlmIHlpZWxkIHJlbWFpbnMuICovXG4gIGhhcnZlc3RlZE9uY2U/OiBib29sZWFuO1xuICBwcm92aXNpb25hbDogYm9vbGVhbjtcbiAgYXV0aG9yZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm94ZWxTaXRlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgcHJvdmlzaW9uYWw6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVnaW9uSW5mbyB7XG4gIGlkOiBzdHJpbmc7XG4gIGxhYmVsOiBzdHJpbmc7XG4gIHR5cGU6ICdwbGFpbicgfCAnZm9yZXN0JyB8ICdoaWxscycgfCAnaGlnaGxhbmQnIHwgJ3dhdGVyJyB8ICdyaWRnZSc7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHJ4OiBudW1iZXI7XG4gIHJ6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRTdGF0cyB7XG4gIGNodW5rc0dlbmVyYXRlZDogbnVtYmVyO1xuICBjaHVua3NFdmljdGVkOiBudW1iZXI7XG4gIHZveGVsc0ZpbGxlZDogbnVtYmVyO1xuICBnZW5lcmF0aW9uTXM6IG51bWJlcjtcbiAgZW50aXRpZXM6IG51bWJlcjtcbiAgdHJlZXM6IG51bWJlcjtcbiAgcGlua1RyZWVzOiBudW1iZXI7XG4gIHBpbmtPdmVyZmxvdzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkIHtcbiAgc2VlZDogbnVtYmVyO1xuICBwYXJhbXM6IFdvcmxkUGFyYW1zO1xuICBjaHVua3M6IE1hcDxzdHJpbmcsIFZveGVsQ2h1bms+O1xuICBlbnRpdGllczogTWFwPHN0cmluZywgRW50aXR5PjtcbiAgZW50aXR5Q2h1bmtzOiBNYXA8c3RyaW5nLCBzdHJpbmdbXT47XG4gIC8qKiBDaHVua3Mgd2hvc2UgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWVudGl0eSBzdGF0ZSBoYXMgYmVlbiBjaGFuZ2VkLiAqL1xuICBlbnRpdHlDaGFuZ2VzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIFRvbWJzdG9uZXMgZm9yIHJlbW92ZWQgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsIGVudGl0aWVzLiAqL1xuICBlbnRpdHlSZW1vdmFsczogU2V0PHN0cmluZz47XG4gIC8qKiBBdXRob3JpdGF0aXZlIGJ1aWx0IHN0cnVjdHVyZXMgKGhvdXNlLCBwYXRoLCB0ZXJyYWNlcywgY3JvcHMpLiAqL1xuICBzdHJ1Y3R1cmVzOiBNYXA8c3RyaW5nLCBTdHJ1Y3R1cmU+O1xuICBzaXRlczogTm94ZWxTaXRlW107XG4gIHJlZ2lvbnM6IFJlZ2lvbkluZm9bXTtcbiAgLyoqIGNodW5rIGtleSAtPiBsb2NhbCB2b3hlbCBpbmRleCAtPiBtYXRlcmlhbC4gRHVyYWJsZSwgY29tcGFjdCBlZGl0cy4gKi9cbiAgZWRpdHM6IE1hcDxzdHJpbmcsIE1hcDxudW1iZXIsIG51bWJlcj4+O1xuICAvKiogR2xvYmFsIGxvY2FsLXBsYXllciBjYXJyaWVkIGJhZzsgYm91bmRlZCBpbiBzY2hlbWEgMywgbGVnYWN5IGluIDEvMi4gKi9cbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICAvKiogUHJlc2VudCBvbmx5IGFmdGVyIHNjaGVtYS0zIGdlbmVzaXMvcmVzdG9yYXRpb24uICovXG4gIGxpZmU/OiBMaWZlU3RhdGU7XG4gIC8qKiBNMDA2IGxpdmluZyBob21lc3RlYWQ7IHByZXNlbnQgb25jZSBmb3VuZGVkIChzY2hlbWEgMyBvbmx5KS4gKi9cbiAgaG9tZXN0ZWFkPzogSG9tZXN0ZWFkU3RhdGU7XG4gIGRpcnR5OiBTZXQ8c3RyaW5nPjtcbiAgc3RhdHM6IFdvcmxkU3RhdHM7XG4gIGF1dGhvcmVkUGxhY2VkOiBib29sZWFuO1xuICAvKipcbiAgICogTW9ub3RvbmljIHJldmlzaW9uIG9mIGF1dGhvcml0YXRpdmUgc3RhdGUgKHZveGVscyBhbmQgZW50aXRpZXMpLiBEZXJpdmVkXG4gICAqIGNhY2hlcyBrZXllZCBvbiB0aGlzIHZhbHVlIGFyZSBkaXNjYXJkZWQgYWZ0ZXIgYW4gZWRpdDsgbWVzaC9uYXZpZ2F0aW9uXG4gICAqIHJldmlzaW9ucyBhcmUgc2VwYXJhdGUgYmVjYXVzZSB0aGV5IGFyZSBkZXJpdmVkLCBub3Qgd29ybGQgc3RhdGUuXG4gICAqL1xuICByZXZpc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgY2h1bmtLZXkgPSAoY3g6IG51bWJlciwgY3o6IG51bWJlcikgPT4gYCR7Y3h9LCR7Y3p9YDtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblggPSAoY3g6IG51bWJlcikgPT4gY3ggKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblogPSAoY3o6IG51bWJlcikgPT4gY3ogKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBsb2NhbEluZGV4ID0gKGx4OiBudW1iZXIsIHlJbmRleDogbnVtYmVyLCBsejogbnVtYmVyKSA9PlxuICBseCArIGx6ICogQ0hVTktfU0laRSArIHlJbmRleCAqIENIVU5LX0FSRUE7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWCA9ICh4OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHggKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ogPSAoejogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh6ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxYID0gKHg6IG51bWJlcikgPT4geCAtICh3b3JsZFRvQ2h1bmtYKHgpICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFogPSAoejogbnVtYmVyKSA9PiB6IC0gKHdvcmxkVG9DaHVua1ooeikgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3QgeVRvSW5kZXggPSAoeTogbnVtYmVyKSA9PiB5IC0gWV9NSU47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXb3JsZChzZWVkID0gMTMzNywgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBpZiAoIWlzU3VwcG9ydGVkR2VuZXJhdG9yKGdlbmVyYXRvclZlcnNpb24pKSB0aHJvdyBuZXcgRXJyb3IoYHVuc3VwcG9ydGVkIGdlbmVyYXRvciB2ZXJzaW9uICR7Z2VuZXJhdG9yVmVyc2lvbn1gKTtcbiAgcmV0dXJuIHtcbiAgICBzZWVkLFxuICAgIHBhcmFtczogeyAuLi5ERUZBVUxUX1BBUkFNUywgZ2VuZXJhdG9yVmVyc2lvbiB9LFxuICAgIGNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0aWVzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2hhbmdlczogbmV3IFNldCgpLFxuICAgIGVudGl0eVJlbW92YWxzOiBuZXcgU2V0KCksXG4gICAgc3RydWN0dXJlczogbmV3IE1hcCgpLFxuICAgIHNpdGVzOiBbXSxcbiAgICByZWdpb25zOiBSRUdJT05TLFxuICAgIGVkaXRzOiBuZXcgTWFwKCksXG4gICAgaW52ZW50b3J5OiB7fSxcbiAgICBkaXJ0eTogbmV3IFNldCgpLFxuICAgIHN0YXRzOiB7XG4gICAgICBjaHVua3NHZW5lcmF0ZWQ6IDAsIGNodW5rc0V2aWN0ZWQ6IDAsIHZveGVsc0ZpbGxlZDogMCwgZ2VuZXJhdGlvbk1zOiAwLFxuICAgICAgZW50aXRpZXM6IDAsIHRyZWVzOiAwLCBwaW5rVHJlZXM6IDAsIHBpbmtPdmVyZmxvdzogMCxcbiAgICB9LFxuICAgIGF1dGhvcmVkUGxhY2VkOiBmYWxzZSxcbiAgICByZXZpc2lvbjogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlV29ybGQoc2VlZCA9IDEzMzcsIGluaXRpYWxSYWRpdXMgPSAwLCBnZW5lcmF0b3JWZXJzaW9uID0gR0VORVJBVE9SX1ZFUlNJT04pOiBXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCwgZ2VuZXJhdG9yVmVyc2lvbik7XG4gIGNvbnN0IGNlbnRyZSA9IE1hdGguZmxvb3IoQ0hVTktTX1BFUl9TSURFIC8gMik7XG4gIGZvciAobGV0IGN6ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ogPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ggPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3grKykge1xuICAgICAgZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICB9XG4gIH1cbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuXG4vLyAtLS0tLS0tLS0tIGdlb2dyYXBoeSAtLS0tLS0tLS0tXG5leHBvcnQgY29uc3QgUkVHSU9OUzogUmVnaW9uSW5mb1tdID0gW1xuICB7IGlkOiAnZm91bmRlcicsIGxhYmVsOiAnRm91bmRlciB2YWxsZXknLCB0eXBlOiAncGxhaW4nLCBjeDogMCwgY3o6IDAsIHJ4OiAxMTAsIHJ6OiA4NSB9LFxuICB7IGlkOiAnZWFzdHdvb2QnLCBsYWJlbDogJ0Vhc3R3b29kJywgdHlwZTogJ2ZvcmVzdCcsIGN4OiAyMjAsIGN6OiAtMTEwLCByeDogMjYwLCByejogMjIwIH0sXG4gIHsgaWQ6ICdjcm93bicsIGxhYmVsOiAnQ3Jvd24gaGlnaGxhbmRzJywgdHlwZTogJ2hpZ2hsYW5kJywgY3g6IC0zNjAsIGN6OiAtMzAwLCByeDogMzgwLCByejogMzAwIH0sXG4gIHsgaWQ6ICdsYWtlJywgbGFiZWw6ICdNaXJyb3IgbGFrZScsIHR5cGU6ICd3YXRlcicsIGN4OiAtMjYwLCBjejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH0sXG4gIHsgaWQ6ICdzb3V0aGRvd25zJywgbGFiZWw6ICdTb3V0aCBkb3ducycsIHR5cGU6ICdoaWxscycsIGN4OiAxMjAsIGN6OiAzMzAsIHJ4OiAyNjAsIHJ6OiAxOTAgfSxcbiAgeyBpZDogJ3dlc3RyaXNlJywgbGFiZWw6ICdXZXN0IHJpc2UnLCB0eXBlOiAnaGlsbHMnLCBjeDogLTM2MCwgY3o6IDEyMCwgcng6IDIyMCwgcno6IDIxMCB9LFxuICB7IGlkOiAnY29hc3QnLCBsYWJlbDogJ0Jyb2tlbiBjb2FzdCcsIHR5cGU6ICdyaWRnZScsIGN4OiAwLCBjejogMCwgcng6IDc4MCwgcno6IDY2MCB9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyQ2VudGVyWCh6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUaGUgcml2ZXIgcnVucyBub3J0aFx1MjAxM3NvdXRoIGFib3V0IDcwXHUyMDEzMTEwIG0gd2VzdCBvZiB0aGUgZm91bmRlciBzaGVsZiwgc29cbiAgLy8gdGhlIGRlZmF1bHQgbm9ydGgtd2VzdCB2aWV3IGhhcyB3YXRlciwgYSBuZWFyIGJhbmsgYW5kIGEgZmFyIGJhbmsuXG4gIHJldHVybiAtOTAgKyA1NSAqIE1hdGguc2luKCh6ICsgMTAwKSAvIDI0MCkgKyAxOCAqIE1hdGguc2luKCh6IC0gMjApIC8gODApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLmFicyh4IC0gcml2ZXJDZW50ZXJYKHopKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxha2VEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLnNxcnQoKCh4ICsgMjYwKSAvIDEyMCkgKiogMiArICgoeiArIDIzMCkgLyA5NSkgKiogMik7XG59XG5cbi8qKlxuICogSW50ZWdlciB0b3Agc29saWQgeSBvZiB0aGUgYmFzZSBnZW5lcmF0ZWQgc3VyZmFjZSAobm8gZWRpdHMvb3ZlcmhhbmdzKS5cbiAqXG4gKiBUaGlzIGlzIHRoZSAqc2hhcGUqIHRoZSB2b3hlbCB2b2x1bWUgaXMgZmlsbGVkIGZyb20sIG5vdCB0aGUgc3RvcmVkIHdvcmxkLlxuICogVGhlIGltcG9ydGFudCBjb3JyZWN0aW9uIG92ZXIgdGhlIGZpcnN0IE0wMDEgcGFzcyBpcyB0aGF0IHRoZSBsYW5kc2NhcGUgaXNcbiAqIG5vdCBvbmUgc21vb3RoIHJhZGlhbCBib3dsOiBpdCBpcyBhIHdhcnBlZCBtdWx0aS1zY2FsZSBzdXJmYWNlIHdpdGggYSBicm9hZFxuICogcml2ZXIgdmFsbGV5LCBhIHNtYWxsIGJ1aWxkYWJsZSBzaGVsZiwgYW5kIHJpZGdlZCBoaWdobGFuZHMuIEEgc2hhbGxvd1xuICogc21vb3RoIHN1cmZhY2UgcXVhbnRpc2VkIHRvIDEgbSB2b3hlbHMgaXMgd2hhdCBwcm9kdWNlZCB0aGUgY29uY2VudHJpY1xuICogY29udG91ciByaW5nczsgdmFyaWVkIHJlbGllZiBhbmQgYSByaXZlciB2YWxsZXkgYnJlYWsgdGhlbSBuYXR1cmFsbHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlSGVpZ2h0QXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFR3by1zY2FsZSBkb21haW4gd2FycC4gVGhlIGJyb2FkIHdhcnAgbW92ZXMgY29hc3RsaW5lcyBhbmQgaGlsbHM7IHRoZVxuICAvLyBzbWFsbCB3YXJwIGtlZXBzIHRoZSAxIG0gcXVhbnRpc2F0aW9uIGZyb20gZm9sbG93aW5nIGNsZWFuIGNvbnRvdXJzLlxuICBjb25zdCB3eCA9IHhcbiAgICArIChmYm0yKHggLyA0MjAsIHogLyA0MjAsIHNlZWQgKyAxMDEsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1LCB6IC8gOTUsIHNlZWQgKyAxMDIsIDIpIC0gMC41KSAqIDMwO1xuICBjb25zdCB3eiA9IHpcbiAgICArIChmYm0yKHggLyA0MjAgKyA3LjMsIHogLyA0MjAgLSAzLjEsIHNlZWQgKyAxMDMsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1ICsgMy43LCB6IC8gOTUgLSA4LjEsIHNlZWQgKyAxMDQsIDIpIC0gMC41KSAqIDMwO1xuXG4gIGNvbnN0IHJhZGlhbCA9IE1hdGguc3FydCgod3ggLyA3ODApICoqIDIgKyAod3ogLyA2NjApICoqIDIpO1xuICBjb25zdCBjb2FzdE5vaXNlID0gKGZibTIod3ggLyAzMDAsIHd6IC8gMzAwLCBzZWVkICsgMTA1LCA0KSAtIDAuNSkgKiAwLjM0XG4gICAgKyAoZmJtMih3eCAvIDk1LCB3eiAvIDk1LCBzZWVkICsgMTA2LCAyKSAtIDAuNSkgKiAwLjEwO1xuICBjb25zdCBsYW5kbmVzcyA9IDEuMCAtIHJhZGlhbCArIGNvYXN0Tm9pc2U7XG4gIGNvbnN0IGlubGFuZCA9IHNtb290aHN0ZXAoLTAuMDMsIDAuMTIsIGxhbmRuZXNzKTtcblxuICBjb25zdCBvY2VhbkZsb29yID0gLTEzICsgNiAqIGZibTIod3ggLyAxNzAsIHd6IC8gMTcwLCBzZWVkICsgMTA3LCAzKTtcblxuICAvLyBSb2xsaW5nIGxhbmQgYXQgdGhyZWUgc2NhbGVzLiBUaGUgNDAgbSBhbmQgMTUgbSBjb21wb25lbnRzIGFyZSByZWFsXG4gIC8vIHN1cmZhY2UgaGVpZ2h0LCBub3QgYSByZW5kZXIgZGVjb3JhdGlvbiwgc28gdGhlIG1hY3JvIHNhbXBsZXIgYWdyZWVzLlxuICBjb25zdCBzd2VsbCA9IDQgKyAxMSAqIGZibTIod3ggLyAzNDAsIHd6IC8gMzQwLCBzZWVkICsgMTA4LCA0KTtcbiAgY29uc3QgaGlsbHMgPSA4ICogZmJtMih3eCAvIDExNSwgd3ogLyAxMTUsIHNlZWQgKyAxMDksIDMpO1xuICBjb25zdCBidW1wcyA9IDIuMiAqIGZibTIoeCAvIDQyLCB6IC8gNDIsIHNlZWQgKyAxMTAsIDIpXG4gICAgKyAwLjkgKiBmYm0yKHggLyAxNSwgeiAvIDE1LCBzZWVkICsgMTExLCAyKTtcblxuICAvLyBSaWRnZWQgaGlnaGxhbmRzLiBUaGUgbWFzc2lmIG1hc2sgaXMgcmVnaW9uYWwgYW5kIGJpYXNlZCB0byB0aGVcbiAgLy8gbm9ydGgtd2VzdDsgd2l0aG91dCB0aGUgcmVnaW9uYWwgZ2F0ZSB0aGUgZmlyc3QgTTAwMSBwYXNzIHJhaXNlZCBhIDQ4IG1cbiAgLy8gbW91bnRhaW4gZGlyZWN0bHkgdW5kZXIgdGhlIGZvdW5kZXIgc2hlbGYuXG4gIGNvbnN0IG1hc3NpZk5vaXNlID0gZmJtMih3eCAvIDQ4MCArIDExLCB3eiAvIDQ4MCAtIDcsIHNlZWQgKyAxMTIsIDQpO1xuICBjb25zdCBtYXNzaWZNYXNrID0gc21vb3Roc3RlcCgwLjYwLCAwLjc4LCBtYXNzaWZOb2lzZSk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMjMwLCB3eiAvIDIzMCwgc2VlZCArIDExMywgNCkgLSAxKTtcbiAgY29uc3QgcmlkZ2UyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTQsIDMpIC0gMSk7XG4gIGNvbnN0IG53QmlhcyA9IE1hdGguZXhwKC0oKCh3eCArIDM2MCkgLyAzODApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDMyMCkgKiogMikpO1xuICBjb25zdCBtb3VudCA9IE1hdGgubWluKDEsIG1hc3NpZk1hc2sgKiAoMC4zMCArIDAuNzAgKiBud0JpYXMpICsgMC4yMiAqIG53Qmlhcyk7XG5cbiAgbGV0IGggPSBzd2VsbCArIGhpbGxzICsgYnVtcHNcbiAgICArIG1vdW50ICogKDIwICsgNDAgKiByaWRnZSAqIHJpZGdlICsgMTIgKiByaWRnZTIpO1xuXG4gIC8vIFNwdXJzIGFuZCBndWxsaWVzIGF0IDMwXHUyMDEzOTAgbS4gV2l0aG91dCB0aGVzZSwgYSBzbW9vdGggaGlsbCBxdWFudGlzZWQgdG9cbiAgLy8gMSBtIHZveGVscyByZWFkcyBhcyBjb25jZW50cmljIGNvbnRvdXIgcmluZ3M7IHdpdGggdGhlbSwgdGhlIHNhbWUgaGlsbFxuICAvLyBicmVha3MgaW50byByaWRnZXMsIHNpZGUgdmFsbGV5cyBhbmQgcm9jayBmYWNlcy5cbiAgY29uc3Qgc3B1ciA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDg1LCB3eiAvIDg1LCBzZWVkICsgMTIwLCAzKSAtIDEpO1xuICBjb25zdCBndWxseSA9IE1hdGgucG93KDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDUyICsgMTMsIHd6IC8gNTIgLSA1LCBzZWVkICsgMTIxLCAzKSAtIDEpLCAyKTtcbiAgaCArPSAoc3B1ciAtIDAuNTUpICogNS4wIC0gZ3VsbHkgKiAzLjI7XG5cbiAgaCA9IG9jZWFuRmxvb3IgKyAoaCAtIG9jZWFuRmxvb3IpICogaW5sYW5kO1xuICBoICs9IDEuNiAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG5cbiAgLy8gQnJvYWQgcml2ZXIgdmFsbGV5LCB0aGVuIHRoZSBjaGFubmVsIGl0c2VsZi4gVGhlIHZhbGxleSBtYXNrIGlzIGdhdGVkIGJ5XG4gIC8vIGxhbmRuZXNzOiB3aXRob3V0IHRoZSBnYXRlIGl0IHB1bGxlZCB0aGUgb2NlYW4gZmxvb3IgdXAgdG8gdGhlIHZhbGxleVxuICAvLyBmbG9vciBvdXRzaWRlIHRoZSBpc2xhbmQsIHdoaWNoIHRoZSBtYXAgdmlldyBzaG93ZWQgYXMgcGFsZSByaXZlci1zaGFwZWRcbiAgLy8gYmFycyBydW5uaW5nIHRvIHRoZSBob3Jpem9uLlxuICBjb25zdCByZCA9IHJpdmVyRGlzdGFuY2Uod3gsIHd6KTtcbiAgY29uc3QgdmFsbGV5ID0gc21vb3Roc3RlcCg5NSwgMTAsIHJkKSAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG4gIGNvbnN0IHZhbGxleUZsb29yID0gMi41ICsgMS4wICogZmJtMih3eCAvIDYwLCB3eiAvIDYwLCBzZWVkICsgMTE1LCAyKTtcbiAgaCA9IGxlcnAoaCwgdmFsbGV5Rmxvb3IsIHZhbGxleSAqIDAuNzUpO1xuICBjb25zdCByaXZlclcgPSA1LjAgKyAzLjAgKiBmYm0yKHd4IC8gNDUsIHd6IC8gNDUsIHNlZWQgKyAxMTYsIDIpO1xuICAvLyBBIHdpZGUsIHNoYWxsb3cgY2hhbm5lbCBwcm9maWxlLiBUaGUgZmlyc3QgcGFzcyBjYXJ2ZWQgYSAxMiBtIHNsb3Qgd2l0aFxuICAvLyBuZWFyLXZlcnRpY2FsIGJhbmtzLCB3aGljaCByZWFkIGFzIGEgYnJpZ2h0IHN0b25lIHF1YXJyeSByYXRoZXIgdGhhbiBhXG4gIC8vIHJpdmVyLiBUaGUgb3V0ZXIgZWRnZSBpcyBub3cgfjI1IG0gZnJvbSB0aGUgY2VudHJlbGluZSwgYW5kIHRoZSBiZWQgaXNcbiAgLy8gb25seSAyIG0gYmVsb3cgc2VhIGxldmVsLlxuICBjb25zdCBjaGFubmVsID0gc21vb3Roc3RlcChyaXZlclcgKyAxOCwgcml2ZXJXICogMC40LCByZCk7XG4gIGlmIChsYW5kbmVzcyA+IDAuMCkgaCA9IGxlcnAoaCwgLTIuMCwgY2hhbm5lbCAqIDAuOTUpO1xuXG4gIC8vIExha2UgYmFzaW4gYXQgdGhlIGZvb3Qgb2YgdGhlIG5vcnRoLXdlc3QgaGlnaGxhbmRzLlxuICBjb25zdCBsYWtlRCA9IGxha2VEaXN0YW5jZSh3eCwgd3opXG4gICAgKiAoMSArIDAuMTggKiAoZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE3LCAyKSAtIDAuNSkgKiAyKTtcbiAgaWYgKGxha2VEIDwgMS4xNSkge1xuICAgIGNvbnN0IGxha2VNYXNrID0gc21vb3Roc3RlcCgxLjE1LCAwLjU1LCBsYWtlRCk7XG4gICAgaCA9IGxlcnAoaCwgLTYuNSwgbGFrZU1hc2sgKiAwLjk1KTtcbiAgfVxuXG4gIC8vIEZvdW5kZXIgc2hlbGY6IGEgc21hbGwsIGlycmVndWxhciBidWlsZGFibGUgdGVycmFjZSBvbiB0aGUgZWFzdCBiYW5rLlxuICAvLyBEZWxpYmVyYXRlbHkgbm90IGEgMjYwIG0gcmFkaWFsIGZsYXR0ZW47IHRoZSBwcmV2aW91cyBwYXNzIHNob3dlZCB0aGF0IGFcbiAgLy8gbGFyZ2UgZmxhdHRlbi10by1jb25zdGFudCBiZWNvbWVzIGEgdmlzaWJsZSBib3dsIG9mIGNvbnRvdXIgcmluZ3MuXG4gIGNvbnN0IHNoZWxmRCA9IE1hdGguc3FydCgoKHggKyA4KSAvIDYyKSAqKiAyICsgKCh6IC0gNCkgLyA0OCkgKiogMilcbiAgICArIChmYm0yKHggLyA0NSwgeiAvIDQ1LCBzZWVkICsgMTE4LCAyKSAtIDAuNSkgKiAwLjU1O1xuICBjb25zdCBzaGVsZiA9IHNtb290aHN0ZXAoMS4wNSwgMC41NSwgc2hlbGZEKTtcbiAgaWYgKHNoZWxmID4gMCkge1xuICAgIGNvbnN0IHRhcmdldCA9IDEzLjAgKyAxLjIgKiBmYm0yKHggLyAzNiwgeiAvIDM2LCBzZWVkICsgMTE5LCAyKSArIHggKiAwLjAxO1xuICAgIGggPSBsZXJwKGgsIHRhcmdldCwgc2hlbGYgKiAwLjc4KTtcbiAgfVxuXG4gIHJldHVybiBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgOTIpKTtcbn1cblxuZnVuY3Rpb24gc2xvcGVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAxKSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMSkpLFxuICApO1xufVxuXG5mdW5jdGlvbiB0b3BNYXRlcmlhbEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbik6IE1hdElkIHtcbiAgLy8gUml2ZXIgYmVkIGlzIGdyYXZlbDsgdGhlIGJlYWNoIGlzIGEgbmFycm93IHNhbmQgYmFuZCwgbm90IHRoZSB3aG9sZVxuICAvLyB2YWxsZXkgZmxvb3IuIFRoZSBmaXJzdCBwYXNzIG1hcmtlZCBldmVyeSBjZWxsIHdpdGhpbiA0IG0gb2Ygc2VhIGxldmVsXG4gIC8vIGFzIHNhbmQsIHdoaWNoIHByb2R1Y2VkIGEgY29uc3BpY3VvdXMgcGFsZSBzdHJpcCBhbG9uZyB0aGUgcml2ZXIuXG4gIGlmIChyaXZlckRpc3RhbmNlKHgsIHopIDwgMTIgJiYgaCA8IFNFQV9MRVZFTCArIDEpIHJldHVybiBNQVQuR1JBVkVMO1xuICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAwLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKG5lYXJXYXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbmVhcldhdGVyID1cbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAzKSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMykgPCBTRUFfTEVWRUwgKyAxO1xuICB9XG4gIGlmIChuZWFyV2F0ZXIgJiYgaCA8PSBTRUFfTEVWRUwgKyAxLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHNsb3BlID49IDMpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNTggJiYgZmJtMih4IC8gMTgsIHogLyAxOCwgc2VlZCArIDEyMCwgMikgPiAwLjQ1KSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQ4ICYmIHNsb3BlID49IDIpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDAgJiYgc2xvcGUgPj0gMiAmJiBmYm0yKHggLyAxMiwgeiAvIDEyLCBzZWVkICsgMTIxLCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU1RPTkU7XG4gIHJldHVybiBNQVQuR1JBU1M7XG5cbn1cblxuLyoqIFB1YmxpYyBiYXNlLW1hdGVyaWFsIHNlbGVjdG9yIGZvciBtYWNybyBMT0QgYW5kIHRlc3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbChcbiAgc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI6IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5mdW5jdGlvbiBzdWJzb2lsRm9yKHRvcDogTWF0SWQpOiBNYXRJZCB7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFTUyB8fCB0b3AgPT09IE1BVC5NT1NTKSByZXR1cm4gTUFULlNPSUw7XG4gIGlmICh0b3AgPT09IE1BVC5TTk9XKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAodG9wID09PSBNQVQuR1JBVkVMKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgcmV0dXJuIE1BVC5TVE9ORTtcbn1cblxuZnVuY3Rpb24gb3JlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsdXN0ZXIgPSBmYm0yKHggLyA1NSwgeiAvIDU1LCBzZWVkICsgMTMwLCAyKTtcbiAgaWYgKGNsdXN0ZXIgPCAwLjU3KSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IG4gPSB2YWx1ZU5vaXNlMyh4ICogMC4wOSwgeSAqIDAuMTMsIHogKiAwLjA5LCBzZWVkICsgMTMxKTtcbiAgY29uc3QgbjIgPSB2YWx1ZU5vaXNlMyh4ICogMC4yMiArIDUsIHkgKiAwLjMxLCB6ICogMC4yMiAtIDMsIHNlZWQgKyAxMzIpO1xuICByZXR1cm4gbiA+IDAuNzAgJiYgbjIgPiAwLjUwO1xufVxuXG5mdW5jdGlvbiBjYXZlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBmYm0zKHggKiAwLjA3NSwgeSAqIDAuMTEsIHogKiAwLjA3NSwgc2VlZCArIDE0MCwgMikgPiAwLjcyO1xufVxuXG5mdW5jdGlvbiBvdmVyaGFuZ0F0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gdmFsdWVOb2lzZTMoeCAqIDAuMTgsIHkgKiAwLjIyLCB6ICogMC4xOCwgc2VlZCArIDE0MSkgPiAwLjYyO1xufVxuXG4vLyAtLS0tLS0tLS0tIHZlcnNpb25lZCBnZW5lcmF0b3IgZGlzcGF0Y2ggLS0tLS0tLS0tLVxuY29uc3QgdjJDYWNoZSA9IG5ldyBNYXA8bnVtYmVyLCBUZXJyYWluVjI+KCk7XG5jb25zdCBoeWRyb0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIEh5ZHJvbG9neT4oKTtcblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2d5IG5ldHdvcmsgZm9yIGEgc2VlZCBhbmQgZ2VuZXJhdG9yIHZlcnNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gaHlkcm9sb2d5Rm9yKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyKTogSHlkcm9sb2d5IHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSByZXR1cm4gdGVycmFpblYyKHNlZWQpLmh5ZHJvbG9neTtcbiAgY29uc3Qga2V5ID0gYCR7c2VlZH06JHt2ZXJzaW9ufWA7XG4gIGxldCBoeWRybyA9IGh5ZHJvQ2FjaGUuZ2V0KGtleSk7XG4gIGlmICghaHlkcm8pIHtcbiAgICBoeWRybyA9IG5ldyBIeWRyb2xvZ3koeyBzZWVkLCB2ZXJzaW9uLCB2MUhlaWdodDogKHgsIHopID0+IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KSB9KTtcbiAgICBoeWRyb0NhY2hlLnNldChrZXksIGh5ZHJvKTtcbiAgfVxuICByZXR1cm4gaHlkcm87XG59XG5cbi8qKiBAaW50ZXJuYWwgVGhlIHYyIGdlbmVyYXRvciBmb3IgYSBzZWVkIChjYWNoZWQ7IHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRlcnJhaW5WMihzZWVkOiBudW1iZXIpOiBUZXJyYWluVjIge1xuICBsZXQgZ2VuID0gdjJDYWNoZS5nZXQoc2VlZCk7XG4gIGlmICghZ2VuKSB7XG4gICAgY29uc3QgaHlkcm9sb2d5ID0gbmV3IEh5ZHJvbG9neSh7IHNlZWQsIHZlcnNpb246IEdFTkVSQVRPUl9WMiwgdjFIZWlnaHQ6ICh4LCB6KSA9PiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeikgfSk7XG4gICAgZ2VuID0gbmV3IFRlcnJhaW5WMihzZWVkLCBzdXJmYWNlSGVpZ2h0QXQsIGh5ZHJvbG9neSk7XG4gICAgdjJDYWNoZS5zZXQoc2VlZCwgZ2VuKTtcbiAgfVxuICByZXR1cm4gZ2VuO1xufVxuXG4vKiogQmFzZSBnZW5lcmF0ZWQgaGVpZ2h0ICh0b3Agc29saWQgKyAxKSBmb3IgYW55IHN1cHBvcnRlZCBnZW5lcmF0b3IgdmVyc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlSGVpZ2h0QXQoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHZlcnNpb24gPj0gR0VORVJBVE9SX1YyID8gdGVycmFpblYyKHNlZWQpLmhlaWdodCh4LCB6KSA6IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbn1cblxuLyoqIEJhc2UgZ2VuZXJhdGVkIHdhdGVyIHN1cmZhY2U6IHdhdGVyIGZpbGxzIGNlbGxzIFtoZWlnaHQsIGxldmVsKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlV2F0ZXJMZXZlbEF0KHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikgcmV0dXJuIHRlcnJhaW5WMihzZWVkKS5jb2x1bW4oeCwgeikubGV2ZWw7XG4gIGNvbnN0IGggPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIDogaDtcbn1cblxuZnVuY3Rpb24gdmVyc2lvbmVkU2xvcGUoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4IC0gMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCArIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHgsIHogLSAxKSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6ICsgMSkpLFxuICApO1xufVxuXG4vKiogQmFzZSB0b3AgbWF0ZXJpYWwgZm9yIGFueSBnZW5lcmF0b3IgdmVyc2lvbiAobWFjcm8gTE9ELCBlbnRpdHkgcGxhY2VtZW50KS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWxGb3IoXG4gIHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuLFxuKTogTWF0SWQge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHtcbiAgICBjb25zdCBnZW4gPSB0ZXJyYWluVjIoc2VlZCk7XG4gICAgcmV0dXJuIGdlbi50b3BNYXRlcmlhbCh4LCB6LCBnZW4uY29sdW1uKHgsIHopLCBzbG9wZSxcbiAgICAgIChoaCwgc3MpID0+IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaGgsIHNzLCBuZWFyV2F0ZXIpKTtcbiAgfVxuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeTogbnVtYmVyO1xuICB0b3A6IE1hdElkO1xuICBzbG9wZTogbnVtYmVyO1xufVxuXG4vKiogQmFzZSBzdXJmYWNlIHNhbXBsZSBmb3IgbWFjcm8gTE9ELiBEb2VzIG5vdCBpbmNsdWRlIHZveGVsIGVkaXRzL292ZXJoYW5ncy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVTdXJmYWNlKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBTdXJmYWNlU2FtcGxlIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgY29uc3Qgc2xvcGUgPSBzbG9wZUF0KHNlZWQsIHgsIHosIHkpO1xuICByZXR1cm4geyB5LCB0b3A6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgeSwgc2xvcGUpLCBzbG9wZSB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNodW5rIGdlbmVyYXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgcmV0dXJuIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChjaHVua0tleShjeCwgY3opKTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IGJhc2UgPSBnZW5lcmF0ZUJhc2VDaHVuayh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgY3gsIGN6KTtcbiAgcmV0dXJuIGluc3RhbGxCYXNlQ2h1bmsod29ybGQsIGJhc2UsIHBlcmZvcm1hbmNlLm5vdygpIC0gdDApO1xufVxuXG4vKipcbiAqIEJhc2UgZ2VuZXJhdGVkIGNvbnRlbnRzIG9mIGEgY2h1bmsgYmVmb3JlIGR1cmFibGUgZWRpdHMuIEEgcHVyZSBmdW5jdGlvbiBvZlxuICogKHNlZWQsIGdlbmVyYXRvciB2ZXJzaW9uLCBjeCwgY3opOiBzYWZlIHRvIGNvbXB1dGUgaW4gYSBXZWIgV29ya2VyLCBhbmQgdGhlXG4gKiBieXRlcyBhcmUgaWRlbnRpY2FsIHdoZXJldmVyIGl0IHJ1bnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQmFzZUNodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgc2VlZDogbnVtYmVyO1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUJhc2VDaHVuayhzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IEJhc2VDaHVuayB7XG4gIGNvbnN0IGRhdGEgPSBuZXcgVWludDhBcnJheShDSFVOS19WT0xVTUUpO1xuICBjb25zdCBoZWlnaHRzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IHRvcE1hdGVyaWFscyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgY29uc3QgdjIgPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMiA/IHRlcnJhaW5WMihzZWVkKSA6IG51bGw7XG5cbiAgLy8gUGFkZGVkIGhlaWdodCBjYWNoZTogYSB0aHJlZS1jZWxsIGJvcmRlciBjb3ZlcnMgc2xvcGUsIGJlYWNoIGFuZCBsZWRnZXMuXG4gIGNvbnN0IFAgPSAzO1xuICBjb25zdCBQVyA9IENIVU5LX1NJWkUgKyBQICogMjtcbiAgY29uc3QgYmFzZUggPSBuZXcgSW50MTZBcnJheShQVyAqIFBXKTtcbiAgY29uc3QgdjJDb2xzOiBWMkNvbHVtbltdIHwgbnVsbCA9IHYyID8gbmV3IEFycmF5KENIVU5LX0FSRUEpIDogbnVsbDtcbiAgZm9yIChsZXQgcHogPSAwOyBweiA8IFBXOyBweisrKSB7XG4gICAgZm9yIChsZXQgcHggPSAwOyBweCA8IFBXOyBweCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgcHggLSBQLCB3eiA9IG96ICsgcHogLSBQO1xuICAgICAgaWYgKHYyKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHYyLmNvbHVtbih3eCwgd3opO1xuICAgICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gY29sLmg7XG4gICAgICAgIGNvbnN0IGx4ID0gcHggLSBQLCBseiA9IHB6IC0gUDtcbiAgICAgICAgaWYgKGx4ID49IDAgJiYgbHogPj0gMCAmJiBseCA8IENIVU5LX1NJWkUgJiYgbHogPCBDSFVOS19TSVpFKSB2MkNvbHMhW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNvbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgd3gsIHd6KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBsZXQgbm9uQWlyID0gMDtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgY29uc3QgbmVhcldhdGVyID1cbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQIC0gMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCArIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxO1xuICAgICAgY29uc3QgdjJDb2wgPSB2MkNvbHMgPyB2MkNvbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIDogbnVsbDtcbiAgICAgIGNvbnN0IHRvcCA9IHYyICYmIHYyQ29sXG4gICAgICAgID8gdjIudG9wTWF0ZXJpYWwod3gsIHd6LCB2MkNvbCwgc2xvcGUsIChoaCwgc3MpID0+IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoaCwgc3MsIG5lYXJXYXRlcikpXG4gICAgICAgIDogdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xuICAgICAgY29uc3Qgc3ViID0gc3Vic29pbEZvcih0b3ApO1xuICAgICAgY29uc3Qgb3JlUG90ZW50aWFsID0gZmJtMih3eCAvIDU1LCB3eiAvIDU1LCBzZWVkICsgMTMwLCAyKSA+IDAuNTc7XG4gICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcblxuICAgICAgY29uc3Qgc3RhcnQgPSBZX01JTjtcbiAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgaCAtIDEpO1xuICAgICAgZm9yIChsZXQgeSA9IHN0YXJ0OyB5IDw9IGVuZDsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGRlcHRoID0gaCAtIDEgLSB5O1xuICAgICAgICBsZXQgbTogTWF0SWQ7XG4gICAgICAgIGlmICh5ID09PSBZX01JTikgbSA9IE1BVC5CRURST0NLO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA9PT0gMCkgbSA9IHRvcDtcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPD0gMikgbSA9IHN1YjtcbiAgICAgICAgZWxzZSBtID0gTUFULlNUT05FO1xuXG4gICAgICAgIGlmIChtID09PSBNQVQuU1RPTkUgJiYgZGVwdGggPiA0ICYmIG9yZVBvdGVudGlhbCAmJiBvcmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5PUkU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTcGFyc2UgM0Qgb3ZlcmhhbmdzL3VuZGVyY3V0cyBhdCBzdGVlcCBmYWNlcy4gVGhpcyBpcyBhIHJlYWxcbiAgICAgICAgLy8gb2NjdXBhbmN5IGNoYW5nZSwgbm90IGEgZGVjb3JhdGlvbiBvbiB0b3Agb2YgYSBoZWlnaHRmaWVsZC5cbiAgICAgICAgaWYgKGRlcHRoIDw9IDIgJiYgc2xvcGUgPj0gMiAmJiBvdmVyaGFuZ0F0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWVwIGNhdmVzLCBrZXB0IGF3YXkgZnJvbSB0aGUgc3VyZmFjZSBzbyB0aGV5IGRvIG5vdCBjcmVhdGUgaG9sZXMuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSICYmIGRlcHRoID4gNyAmJiBkZXB0aCA8IDI0ICYmIGNhdmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0gPSBtO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFdhdGVyIHZvbHVtZTogZXZlcnl0aGluZyBhYm92ZSB0aGUgc29saWQgc3VyZmFjZSB1cCB0byB0aGUgY29sdW1uJ3NcbiAgICAgIC8vIHdhdGVyIGxldmVsIChzZWEgbGV2ZWwgaW4gdjE7IHRoZSBoeWRyb2xvZ2ljYWwgbGV2ZWwgaW4gdjIpLlxuICAgICAgY29uc3Qgd2F0ZXJMZXZlbCA9IHYyQ29sID8gTWF0aC5taW4oWV9NQVgsIHYyQ29sLmxldmVsKSA6IFNFQV9MRVZFTDtcbiAgICAgIGlmIChoIDwgd2F0ZXJMZXZlbCkge1xuICAgICAgICBmb3IgKGxldCB5ID0gTWF0aC5tYXgoWV9NSU4sIGgpOyB5IDwgd2F0ZXJMZXZlbDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KTtcbiAgICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuV0FURVI7XG4gICAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9wU29saWQgPSBNYXRoLm1pbihZX01BWCAtIDEsIE1hdGgubWF4KFlfTUlOLCBoIC0gMSkpO1xuICAgICAgaGVpZ2h0c1tjb2xdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbY29sXSA9IHRvcDtcbiAgICB9XG4gIH1cblxuICAvLyBQcm90cnVkaW5nIGxlZGdlczogb25lIG9yIHR3byBzdG9uZSBibG9ja3MgZXh0ZW5kIGZyb20gYSBoaWdoIGNvbHVtbiBvdmVyXG4gIC8vIGEgbG93ZXIgbmVpZ2hib3VyLiBUaGV5IGNyZWF0ZSByZWFkYWJsZSBvdmVyaGFuZ3Mgd2l0aG91dCBhIGZ1bGwgY2F2ZSBwYXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgaWYgKHNsb3BlIDwgMikgY29udGludWU7XG4gICAgICBjb25zdCBkaXJzOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiA9IFtbLTEsIDBdLCBbMSwgMF0sIFswLCAtMV0sIFswLCAxXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIGRpcnMpIHtcbiAgICAgICAgY29uc3QgbnggPSBseCArIGR4LCBueiA9IGx6ICsgZHo7XG4gICAgICAgIGlmIChueCA8IDAgfHwgbnogPCAwIHx8IG54ID49IENIVU5LX1NJWkUgfHwgbnogPj0gQ0hVTktfU0laRSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IG5oID0gYmFzZUhbKG56ICsgUCkgKiBQVyArIChueCArIFApXTtcbiAgICAgICAgaWYgKGggLSBuaCA8IDIpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoaGFzaDNpKGx4LCBseiwgZHggKiAzICsgZHogKiA3LCBzZWVkICsgMTUwKSA8IDAuNTUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB5ID0gaCAtIDI7XG4gICAgICAgIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBoKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChueCwgeVRvSW5kZXgoeSksIG56KTtcbiAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5TVE9ORTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJlY29tcHV0ZSB0aGUgY29sdW1uIGNhY2hlIGFmdGVyIGxlZGdlcy9jYXZlcy4gVGhlIGV4cG9zZWQgdG9wIG1hdGVyaWFsXG4gIC8vIG11c3QgY29tZSBmcm9tIHRoZSBhY3R1YWwgdG9wIHNvbGlkIHZveGVsLCBub3QgdGhlIHByZS1jYXJ2ZSBndWVzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICBsZXQgdG9wTWF0OiBudW1iZXIgPSB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICAgICAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgICAgIGNvbnN0IG0gPSBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildO1xuICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICB9XG4gICAgICBoZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRvcE1hdDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBjeCwgY3osIHNlZWQsIHZlcnNpb24sIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyIH07XG59XG5cbi8qKlxuICogSW5zdGFsbCBiYXNlIGNvbnRlbnRzIGFzIGEgcmVzaWRlbnQgY2h1bms6IGFwcGx5IGR1cmFibGUgZWRpdHMsIHVwZGF0ZVxuICogc3RhdHMsIGFuZCBydW4gZGV0ZXJtaW5pc3RpYyBlbnRpdHkgZ2VuZXJhdGlvbi4gTWFpbi10aHJlYWQgb25seTsgdGhpcyBpc1xuICogdGhlIHNpbmdsZSB3cml0ZXIgb2YgV29ybGQuIFJldHVybnMgdGhlIGFscmVhZHktcmVzaWRlbnQgY2h1bmsgaWYgb25lIGV4aXN0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbGxCYXNlQ2h1bmsod29ybGQ6IFdvcmxkLCBiYXNlOiBCYXNlQ2h1bmssIGdlbmVyYXRpb25NcyA9IDApOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChiYXNlLnNlZWQgIT09IHdvcmxkLnNlZWQgfHwgYmFzZS52ZXJzaW9uICE9PSB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbikge1xuICAgIHRocm93IG5ldyBFcnJvcignYmFzZSBjaHVuayBiZWxvbmdzIHRvIGEgZGlmZmVyZW50IHdvcmxkIGNvbmZpZ3VyYXRpb24nKTtcbiAgfVxuICBjb25zdCB7IGN4LCBjeiwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIgfSA9IGJhc2U7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIGNvbnN0IGNodW5rOiBWb3hlbENodW5rID0ge1xuICAgIGN4LCBjeiwga2V5LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpcixcbiAgICBkaXJ0eTogdHJ1ZSxcbiAgICBnZW5lcmF0ZWRBdDogcGVyZm9ybWFuY2Uubm93KCksXG4gIH07XG5cbiAgLy8gQXBwbHkgZHVyYWJsZSBlZGl0cyBhZnRlciBiYXNlIGdlbmVyYXRpb24uXG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIGlmIChlZGl0cykge1xuICAgIGZvciAoY29uc3QgW2lkeCwgbV0gb2YgZWRpdHMpIHtcbiAgICAgIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gICAgfVxuICAgIC8vIFJlY29tcHV0ZSB0aGUgY2FjaGUgZm9yIGVkaXRlZCBjaHVua3MuXG4gICAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgbHgsIGx6KTtcbiAgICB9XG4gIH1cbiAgLy8gTm9uLWFpciBjb3VudHMgYXJlIGRlcml2ZWQgcmVuZGVyZXIgc3RhdGlzdGljcywgbm90IGR1cmFibGUgd29ybGQgc3RhdGUuXG4gIC8vIEVkaXRlZCBiYXNlIGFpciBtYXkgYmVjb21lIHNvbGlkIChhbmQgdmljZSB2ZXJzYSkgZHVyaW5nIHJlc3RvcmF0aW9uLlxuICBsZXQgZWRpdGVkTm9uQWlyID0gMDtcbiAgZm9yIChjb25zdCBtYXRlcmlhbCBvZiBjaHVuay5kYXRhKSBpZiAobWF0ZXJpYWwgIT09IE1BVC5BSVIpIGVkaXRlZE5vbkFpcisrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gZWRpdGVkTm9uQWlyIC0gbm9uQWlyO1xuXG4gIHdvcmxkLmNodW5rcy5zZXQoa2V5LCBjaHVuayk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCsrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gbm9uQWlyO1xuICB3b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgKz0gZ2VuZXJhdGlvbk1zO1xuICB3b3JsZC5kaXJ0eS5hZGQoa2V5KTtcblxuICBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkLCBjaHVuayk7XG4gIHJldHVybiBjaHVuaztcbn1cblxuLyoqIEEgYmFzZS10ZXJyYWluIGNhY2hlIHNoYXJlZCBieSBlZGl0ZWQgYW5kIHVuZWRpdGVkIHJlZ2VuZXJhdGlvbi4gTmF0dXJhbFxuICogc2NlbmVyeSBuZXZlciBkZXBlbmRzIG9uIGxhdGVyIHZveGVsIGVkaXRzOyB0aGlzIGFsc28gbGV0cyBhIHNuYXBzaG90IHJlc3RvcmVcbiAqIGEgaGFydmVzdGVkIGNodW5rIHdpdGhvdXQgbWF0ZXJpYWxpemluZyB1bnJlbGF0ZWQgbmVpZ2hib3VyaW5nIGNodW5rcy4gKi9cbmNvbnN0IGJhc2VDb2x1bW5DYWNoZSA9IG5ldyBXZWFrTWFwPFdvcmxkLCBNYXA8c3RyaW5nLCB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheSB9Pj4oKTtcblxuZXhwb3J0IGludGVyZmFjZSBCYXNlQ29sdW1ucyB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheTsgfVxuXG4vKiogQmFzZSAocHJlLWNhcnZlLCBwcmUtZWRpdCkgY29sdW1uIGhlaWdodHMvbWF0ZXJpYWxzIHVzZWQgZm9yIGVudGl0eSBwbGFjZW1lbnQuIFB1cmUuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZUJhc2VDb2x1bW5zKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogQmFzZUNvbHVtbnMge1xuICBjb25zdCBjb2x1bW5zID0geyBoZWlnaHRzOiBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKSwgdG9wTWF0ZXJpYWxzOiBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKSB9O1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4LCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6KTtcbiAgICAgIGNvbnN0IHNsb3BlID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyB2ZXJzaW9uZWRTbG9wZShzZWVkLCB2ZXJzaW9uLCB4LCB6LCBoKSA6IHNsb3BlQXQoc2VlZCwgeCwgeiwgaCk7XG4gICAgICBjb25zdCBpbmRleCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5oZWlnaHRzW2luZGV4XSA9IGNsYW1wKGggLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICBjb2x1bW5zLnRvcE1hdGVyaWFsc1tpbmRleF0gPSB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMlxuICAgICAgICA/IGJhc2VUb3BNYXRlcmlhbEZvcihzZWVkLCB2ZXJzaW9uLCB4LCB6LCBoLCBzbG9wZSlcbiAgICAgICAgOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8qKiBQcm92aWRlIHByZWNvbXB1dGVkIGJhc2UgY29sdW1ucyAoZm9yIGV4YW1wbGUgZnJvbSBhIHdvcmtlcikgYmVmb3JlIGluc3RhbGxpbmcgYSBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWVkQmFzZUNvbHVtbnMod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZywgY29sdW1uczogQmFzZUNvbHVtbnMpOiB2b2lkIHtcbiAgbGV0IGNhY2hlID0gYmFzZUNvbHVtbkNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGUpIHsgY2FjaGUgPSBuZXcgTWFwKCk7IGJhc2VDb2x1bW5DYWNoZS5zZXQod29ybGQsIGNhY2hlKTsgfVxuICBpZiAoIWNhY2hlLmhhcyhrZXkpKSBjYWNoZS5zZXQoa2V5LCBjb2x1bW5zKTtcbn1cblxuZnVuY3Rpb24gYmFzZUNvbHVtbnMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IEJhc2VDb2x1bW5zIHtcbiAgbGV0IGNhY2hlID0gYmFzZUNvbHVtbkNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGUpIHsgY2FjaGUgPSBuZXcgTWFwKCk7IGJhc2VDb2x1bW5DYWNoZS5zZXQod29ybGQsIGNhY2hlKTsgfVxuICBjb25zdCBjYWNoZWQgPSBjYWNoZS5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGNhY2hlZDtcbiAgY29uc3QgY29sdW1ucyA9IGNvbXB1dGVCYXNlQ29sdW1ucyh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbiAgY2FjaGUuc2V0KGNodW5rLmtleSwgY29sdW1ucyk7XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG4vLyAtLS0tLS0tLS0tIGRlcml2ZWQgY2hhbmdlIHRyYWNraW5nIChub3QgYXV0aG9yaXRhdGl2ZSBzdGF0ZSkgLS0tLS0tLS0tLVxuLy8gUmVuZGVyZXJzIG5lZWQgdG8ga25vdyB3aGVuIHRoZSBlZGl0IG92ZXJsYXkgY2hhbmdlZCB3aXRob3V0IHdhbGtpbmcgZXZlcnlcbi8vIGVkaXQgZWFjaCBmcmFtZS4gVGhlIGNvdW50ZXIgbGl2ZXMgb3V0c2lkZSBXb3JsZCBzbyBpdCBuZXZlciBlbnRlcnMgYVxuLy8gc25hcHNob3Qgb3IgY2Fub25pY2FsIGhhc2guXG5jb25zdCBlZGl0VmVyc2lvbnMgPSBuZXcgV2Vha01hcDxXb3JsZCwgbnVtYmVyPigpO1xuXG4vKiogTW9ub3RvbmljIGNvdW50IG9mIGVkaXQtb3ZlcmxheSBjaGFuZ2VzIGZvciB0aGlzIFdvcmxkIG9iamVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0VmVyc2lvbih3b3JsZDogV29ybGQpOiBudW1iZXIge1xuICByZXR1cm4gZWRpdFZlcnNpb25zLmdldCh3b3JsZCkgPz8gMDtcbn1cblxuLyoqIENhbGwgYWZ0ZXIgcmVwbGFjaW5nIG9yIGJ1bGstY2hhbmdpbmcgYHdvcmxkLmVkaXRzYCBvdXRzaWRlIHNldFZveGVsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtFZGl0c0NoYW5nZWQod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGVkaXRWZXJzaW9ucy5zZXQod29ybGQsIGVkaXRWZXJzaW9uKHdvcmxkKSArIDEpO1xufVxuXG4vLyAtLS0tLS0tLS0tIG5vbi1nZW5lcmF0aW5nIHF1ZXJpZXMgLS0tLS0tLS0tLVxuLy8gTW92aW5nIHByZXNlbnRhdGlvbiAoY2hhcmFjdGVycywgYW5pbWFscywgY2FtZXJhKSBtdXN0IG5ldmVyIHRyaWdnZXIgY2h1bmtcbi8vIGdlbmVyYXRpb24gYXMgYSBzaWRlIGVmZmVjdCBvZiBhc2tpbmcgYWJvdXQgdGVycmFpbi4gVGhlc2UgcmV0dXJuIG51bGwgd2hlblxuLy8gdGhlIGNvbHVtbidzIGNodW5rIGlzIG5vdCByZXNpZGVudC5cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Q2h1bmtBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHdvcmxkLmNodW5rcy5nZXQoY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSkpID8/IG51bGw7XG59XG5cbi8qKiBMaWtlIHN1cmZhY2VBdCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHwgbnVsbCB7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbi8qKiBMaWtlIGdldFZveGVsLCBidXQgbnVsbCBpbnN0ZWFkIG9mIGdlbmVyYXRpbmcgYSBtaXNzaW5nIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2lkZW50Vm94ZWxBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB8IG51bGwge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY2h1bmsgPSByZXNpZGVudENodW5rQXQod29ybGQsIHgsIHopO1xuICBpZiAoIWNodW5rKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXZpY3RDaHVuayh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghd29ybGQuY2h1bmtzLmhhcyhrZXkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmNodW5rcy5kZWxldGUoa2V5KTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzRXZpY3RlZCsrO1xuICAvLyBDaHVuayBieXRlcyBhbmQgY29sdW1uIGNhY2hlcyBhcmUgcmVnZW5lcmF0ZWQgb24gZGVtYW5kLiBFbnRpdGllcyByZW1haW5cbiAgLy8gYXV0aG9yaXRhdGl2ZTogZXZpY3Rpb24gbXVzdCBub3QgZm9yZ2V0IHRoZWlyIHBlcnNpc3RlbnQgc3RhdGUuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyAtLS0tLS0tLS0tIHF1ZXJpZXMgLyBlZGl0cyAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZ2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBtOiBNYXRJZCk6IGJvb2xlYW4ge1xuICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gWV9NQVgpIHJldHVybiBmYWxzZTtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgaWR4ID0gbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIGNvbnN0IHByZXZpb3VzRWRpdCA9IHdvcmxkLmVkaXRzLmdldChjaHVua0tleShjeCwgY3opKT8uZ2V0KGlkeCk7XG4gIC8vIEEgY2h1bmsgZXZpY3RlZCBhZnRlciBhbiBlYXJsaWVyIGVkaXQgY2FuIHJlZ2VuZXJhdGUgd2l0aCB0aGF0IGR1cmFibGVcbiAgLy8gbWF0ZXJpYWwgYWxyZWFkeSBhcHBsaWVkLiBEcm9wcGluZyB0aGUgZWRpdCBoZXJlIHdvdWxkIG1ha2UgaXQgZGlzYXBwZWFyXG4gIC8vIG9uIHRoZSBuZXh0IGV2aWN0aW9uL3Jlc3RvcmF0aW9uLCBldmVuIHRob3VnaCB0aGUgY3VycmVudCB3cml0ZSBuby1vcHMuXG4gIGlmIChwcmV2aW91c0VkaXQgPT09IG0pIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIGZhbHNlO1xuICBsZXQgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKCFlZGl0cykgeyBlZGl0cyA9IG5ldyBNYXAoKTsgd29ybGQuZWRpdHMuc2V0KGNodW5rLmtleSwgZWRpdHMpOyB9XG4gIC8vIEFuIGlkZW1wb3RlbnQgd3JpdGUgbXVzdCBzdGlsbCByZXN0b3JlIGEgZHVyYWJsZSBkZWx0YSBkaXNjYXJkZWQgYnkgYW5cbiAgLy8gb2xkZXIgc25hcHNob3Qgb3IgZGVsdGEgZGVjb2Rlci4gSXQgaXMgbm90IGEgbmV3IGF1dGhvcml0YXRpdmUgcmV2aXNpb24uXG4gIGlmIChjaHVuay5kYXRhW2lkeF0gPT09IG0pIHtcbiAgICBpZiAoIWVkaXRzLmhhcyhpZHgpKSBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgZWRpdHMuc2V0KGlkeCwgbSk7XG4gIG1hcmtFZGl0c0NoYW5nZWQod29ybGQpO1xuICBjaHVuay5kaXJ0eSA9IHRydWU7XG4gIHdvcmxkLmRpcnR5LmFkZChjaHVuay5rZXkpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgd29ybGRUb0xvY2FsWCh4KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDb2x1bW5DYWNoZShjaHVuazogVm94ZWxDaHVuaywgbHg6IG51bWJlciwgbHo6IG51bWJlcik6IHZvaWQge1xuICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgaWYgKGlzU29saWQoY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSkpIHsgdG9wU29saWQgPSB5OyBicmVhazsgfVxuICB9XG4gIGNodW5rLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gIGNvbnN0IHRtID0gY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgaWYgKHRvcFNvbGlkID49IFlfTUlOKSB7XG4gICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgodG9wU29saWQpLCBseildO1xuICAgIGlmIChtICE9PSBNQVQuV0FURVIpIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBtO1xuICB9IGVsc2Uge1xuICAgIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0bTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSB5IGNvb3JkaW5hdGUgb2YgdGhlIGV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbiBhdCB4L3ouXG4gKiBBIHNvbGlkIHZveGVsIGF0IHkgb2NjdXBpZXMgW3ksIHkrMSksIHNvIHRoZSB3YWxrYWJsZSBzdXJmYWNlIGlzIHRvcFNvbGlkKzEuXG4gKiBUaGlzIGlzIGEgZGVyaXZlZCBxdWVyeTsgdGhlIGF1dGhvcml0YXRpdmUgc3RhdGUgcmVtYWlucyB0aGUgdm94ZWwgdm9sdW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gWV9NSU47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gWV9NSU47XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLnRvcE1hdGVyaWFsc1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAod29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24gPCBHRU5FUkFUT1JfVjIpIHtcbiAgICBjb25zdCBoID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCAtIGggOiAwO1xuICB9XG4gIHJldHVybiB3YXRlclN1cmZhY2VBdCh3b3JsZCwgeCwgeikgLSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG4vKipcbiAqIFRvcCBvZiB0aGUgd2F0ZXIgY29sdW1uIHN0YW5kaW5nIG9uIHRoZSBzb2xpZCBzdXJmYWNlIChlcXVhbCB0byB0aGUgc3VyZmFjZVxuICogd2hlbiBkcnkpLiBSZWFkcyB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbHMsIHNvIGVkaXRzIGFuZCBkdWcgcGl0cyBhcmUgZXhhY3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRlclN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICB3aGlsZSAoeSA8IFlfTUFYICYmIGdldFZveGVsKHdvcmxkLCB4LCB5LCB6KSA9PT0gTUFULldBVEVSKSB5Kys7XG4gIHJldHVybiB5O1xufVxuXG4vLyAtLS0tLS0tLS0tIGVudGl0aWVzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGFkZEVudGl0eSh3b3JsZDogV29ybGQsIGU6IEVudGl0eSk6IHZvaWQge1xuICBpZiAod29ybGQuZW50aXRpZXMuaGFzKGUuaWQpIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSByZXR1cm47XG4gIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBlKTtcbiAgbGV0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIGxpc3QpOyB9XG4gIGxpc3QucHVzaChlLmlkKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICAvLyBHZW5lcmF0aW9uIGlzIGRldGVybWluaXN0aWMgYW5kIGFkdmFuY2VzIG5vIHBsYXllci1jb21tYW5kIHByZWNvbmRpdGlvbi5cbiAgLy8gQXV0aG9yZWQgc2NhZmZvbGRpbmcgbWF5IHRyYW5zaWVudGx5IGNoYW5nZSBpdDsgdGhlIHNuYXBzaG90IHJlc3RvcmVzIHRoZVxuICAvLyBzYXZlZCByZXZpc2lvbiBhZnRlciBwbGFjaW5nIHRoYXQgc2NhZmZvbGRpbmcuXG59XG5cbi8qKlxuICogUmVtb3ZlIGFuIGVudGl0eSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHdvcmxkLiBVc2VkIHdoZW4gYSBzaXRlIGlzIGNsZWFyZWQ6XG4gKiB0aGUgcmVzb3VyY2UgeWllbGQgaXMgYWNjb3VudGVkIGZvciBieSB0aGUgY2FsbGVyLCBhbmQgdGhlIGVudGl0eSBtdXN0IHN0b3BcbiAqIGV4aXN0aW5nIGZvciBjb2xsaXNpb24sIG9ic3RydWN0aW9uIGFuZCBwZXJzaXN0ZW5jZSwgbm90IGp1c3QgYmUgaGlkZGVuIGJ5XG4gKiB0aGUgcmVuZGVyZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgY29uc3QgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmIChsaXN0KSB7XG4gICAgY29uc3QgaSA9IGxpc3QuaW5kZXhPZihpZCk7XG4gICAgaWYgKGkgPj0gMCkgbGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoaWQpO1xuICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlJZChjaHVuazogc3RyaW5nLCBpOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gYGU6JHtjaHVua306JHtpfWA7XG59XG5cbi8qKlxuICogUHVyZSBmb3Jlc3QtZGVuc2l0eSBmaWVsZCB1c2VkIGJ5IGVudGl0eSBnZW5lcmF0aW9uLiBFeHBvcnRlZCByZWFkLW9ubHkgZm9yXG4gKiByZW5kZXIgZGVjb3JhdGlvbiAocmVuZGVyL2dyb3VuZC1jb3Zlci50cyk7IGNoYW5naW5nIGl0IGNoYW5nZXMgd29ybGRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9yZXN0U2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgZWFzdCA9IE1hdGguZXhwKC0oKCh3eCAtIDIyMCkgLyAyNjApICoqIDIgKyAoKHd6ICsgMTEwKSAvIDIyMCkgKiogMikpO1xuICBjb25zdCBub3J0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDIwKSAvIDMwMCkgKiogMiArICgod3ogKyAzMDApIC8gMTkwKSAqKiAyKSk7XG4gIGNvbnN0IHdlc3QgPSBNYXRoLmV4cCgtKCgod3ggKyAzNDApIC8gMjAwKSAqKiAyICsgKCh3eiAtIDEyMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3Qgc291dGggPSBNYXRoLmV4cCgtKCgod3ggLSAxMjApIC8gMjQwKSAqKiAyICsgKCh3eiAtIDMzMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3QgbW9pc3R1cmUgPSBmYm0yKHd4IC8gMjYwLCB3eiAvIDI2MCwgc2VlZCArIDIwMSwgNCk7XG4gIGNvbnN0IHZhbGxleSA9IE1hdGguZXhwKC0oKHd4IC8gMTQwKSAqKiAyICsgKHd6IC8gMTA1KSAqKiAyKSk7XG4gIHJldHVybiBNYXRoLm1heChlYXN0LCBub3J0aCAqIDAuOTIsIHdlc3QgKiAwLjgwLCBzb3V0aCAqIDAuNzgpICogMC44MlxuICAgICsgbW9pc3R1cmUgKiAwLjM4IC0gMC4yMiAtIHZhbGxleSAqIDAuMzQ7XG59XG5cbi8qKiBQdXJlIHJvY2tpbmVzcyBmaWVsZCB1c2VkIGJ5IGVudGl0eSBnZW5lcmF0aW9uIChzYW1lIGNvbnRyYWN0IGFzIGZvcmVzdFNjb3JlKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiByb2NrU2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgbW91bnRhaW4gPSBmYm0yKHd4IC8gMzMwLCB3eiAvIDMzMCwgc2VlZCArIDIwMiwgMyk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMTQwLCB3eiAvIDE0MCwgc2VlZCArIDIwMywgMykgLSAxKTtcbiAgcmV0dXJuIG1vdW50YWluICogMC41NSArIHJpZGdlICogMC40NTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdGllcyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogdm9pZCB7XG4gIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQsIGNodW5rLmN4LCBjaHVuay5jeik7XG59XG5cbi8qKiBAaW50ZXJuYWwgUmVwbGF5cyBkZXRlcm1pbmlzdGljIGdlbmVyYXRpb24gZm9yIHNuYXBzaG90IGVudGl0eSBkZWx0YXMuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgaWYgKHdvcmxkLmVudGl0eUNodW5rcy5oYXMoa2V5KSkgcmV0dXJuO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm47XG5cbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoaGFzaDJpKGNodW5rLmN4LCBjaHVuay5jeiwgd29ybGQuc2VlZCArIDkwMCkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBjb2x1bW5zID0gYmFzZUNvbHVtbnMod29ybGQsIGNodW5rKTtcbiAgbGV0IG4gPSAwO1xuICBsZXQgbmF0dXJhbFRyZWVzID0gMDtcbiAgbGV0IG5hdHVyYWxQaW5rVHJlZXMgPSAwO1xuXG4gIGNvbnN0IGxvY2FsU3VyZmFjZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSArIFlfTUlOO1xuICB9O1xuICBjb25zdCBsb2NhbFRvcCA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogTWF0SWQgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gYXMgTWF0SWQ7XG4gIH07XG4gIGNvbnN0IGxvY2FsU2xvcGUgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgIHJldHVybiBNYXRoLm1heChcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggLSAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogLSAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgKTtcbiAgfTtcblxuICAvLyBBIGppdHRlcmVkIDggbSBsYXR0aWNlIGdpdmVzIGNvaGVyZW50IG1hc3NlcyBhbmQgYXZvaWRzIHBlci1mcmFtZSBzY2F0dGVyLlxuICBmb3IgKGxldCBneiA9IDA7IGd6IDwgQ0hVTktfU0laRTsgZ3ogKz0gOCkge1xuICAgIGZvciAobGV0IGd4ID0gMDsgZ3ggPCBDSFVOS19TSVpFOyBneCArPSA4KSB7XG4gICAgICBjb25zdCBseCA9IGNsYW1wKE1hdGguZmxvb3IoZ3ggKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCBseiA9IGNsYW1wKE1hdGguZmxvb3IoZ3ogKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICAgIGlmIChoIDw9IFNFQV9MRVZFTCArIDEpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgc2xvcGUgPSBsb2NhbFNsb3BlKGx4LCBseik7XG4gICAgICBjb25zdCB0b3AgPSBsb2NhbFRvcChseCwgbHopO1xuICAgICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGZvcmVzdCA9IGZvcmVzdFNjb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2NreSA9IHJvY2tTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9sbCA9IHJuZCgpO1xuXG4gICAgICBjb25zdCB0cmVlQ2hhbmNlID0gZm9yZXN0ID4gMC41MCA/IDAuNzIgOiBmb3Jlc3QgPiAwLjMwID8gMC4yNSA6IDAuMDU7XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMiAmJiByb2xsIDwgdHJlZUNoYW5jZSkge1xuICAgICAgICAvLyBUaGUgY2FwIGlzIGEgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWdlbmVyYXRpb24gcHJvcGVydHkuIEl0IGNhbm5vdFxuICAgICAgICAvLyBkZXBlbmQgb24gd2hpY2ggY2h1bmtzIGEgcmVuZGVyZXIgbG9hZGVkIGJlZm9yZSB0aGlzIG9uZS5cbiAgICAgICAgbGV0IGtpbmQ6IEVudGl0eUtpbmQ7XG4gICAgICAgIGxldCB2YXJpYW50OiBudW1iZXI7XG4gICAgICAgIGNvbnN0IHNwZWNpZXNSb2xsID0gcm5kKCk7XG4gICAgICAgIGlmIChzcGVjaWVzUm9sbCA8IDAuMTIpIHtcbiAgICAgICAgICBpZiAoKG5hdHVyYWxQaW5rVHJlZXMgKyAxKSA+IDAuMjUgKiAobmF0dXJhbFRyZWVzICsgMSkpIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtPdmVyZmxvdysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9ibG9zc29tJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMik7XG4gICAgICAgICAgICBuYXR1cmFsUGlua1RyZWVzKys7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjQwKSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfc3BpcmUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjc0KSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfdGFibGUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgfVxuICAgICAgICBuYXR1cmFsVHJlZXMrKztcbiAgICAgICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuODggKyBybmQoKSAqIDAuMjQsIHZhcmlhbnQsXG4gICAgICAgICAgcmVzb3VyY2U6ICd3b29kJywgcmVtYWluaW5nOiAxMiwgeWllbGRQZXJIYXJ2ZXN0OiA0LFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiByb2NreSA+IDAuNDYgJiYgcm9sbCA8IDAuMzgpIHtcbiAgICAgICAgLy8gQ29uc3VtZSB0aGUgcmV0aXJlZCBzdG9uZSBmb3JtJ3MgcmFuZG9tIGRyYXdzIGFuZCBhbGxvY2F0ZSBpdHMgb2xkXG4gICAgICAgIC8vIHNlcXVlbmNlIElELCBidXQgZG8gbm90IGluc2VydCBhbiBlbnRpdHkuIExhdGVyIG5hdHVyYWwgcGxhY2VtZW50c1xuICAgICAgICAvLyB0aGVyZWZvcmUgcmVtYWluIGJ5dGUtZm9yLWJ5dGUgY29tcGF0aWJsZSB3aXRoIHJlY29yZGVkIHNhdmVzLlxuICAgICAgICBjb25zdCBzaXplUm9sbCA9IHJuZCgpO1xuICAgICAgICBjb25zdCBraW5kOiBFbnRpdHlLaW5kID0gc2l6ZVJvbGwgPCAwLjU1ID8gJ3N0eWxfcm9ja19zbWFsbCdcbiAgICAgICAgICA6IHNpemVSb2xsIDwgMC45MCA/ICdzdHlsX3JvY2tfbWVkaXVtJyA6ICdzdHlsX3JvY2tfbGFyZ2UnO1xuICAgICAgICBjb25zdCBpZCA9IGVudGl0eUlkKGNodW5rLmtleSwgbisrKTtcbiAgICAgICAgY29uc3QgcmVjb3JkID0ge1xuICAgICAgICAgIGlkLCBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcmVzb3VyY2U6ICdzdG9uZScgYXMgY29uc3QsXG4gICAgICAgICAgcmVtYWluaW5nOiBraW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDQgOiBraW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyA4IDogMTIsXG4gICAgICAgICAgeWllbGRQZXJIYXJ2ZXN0OiAzLCBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICB9O1xuICAgICAgICAvLyBPbmx5IGVudGl0aWVzIHRoYXQgZXhpc3RlZCBpbiBhbiBhY2NlcHRlZCBvbGQgc2F2ZSBnZXQgdG9tYnN0b25lcyxcbiAgICAgICAgLy8gZHVyaW5nIGV4cGxpY2l0IG1pZ3JhdGlvbi4gT3JkaW5hcnkgZ2VuZXJhdGlvbiBtdXN0IHJlc3RvcmUgZXhhY3RseS5cbiAgICAgICAgaWYgKGlzU3RvbmVSZXBsYXkod29ybGQpKSBhZGRFbnRpdHkod29ybGQsIHJlY29yZCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULlNUT05FICYmIHJvY2t5ID4gMC41OCAmJiByb2xsIDwgMC4xOCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX29yZScsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAyKSxcbiAgICAgICAgICByZXNvdXJjZTogJ29yZScsIHJlbWFpbmluZzogOCwgeWllbGRQZXJIYXJ2ZXN0OiAyLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAxICYmIHJvbGwgPCAwLjMwKSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfc2hydWInLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOCArIHJuZCgpICogMC40LCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgICAgcmVzb3VyY2U6ICdmaWJlcicsIHJlbWFpbmluZzogNCwgeWllbGRQZXJIYXJ2ZXN0OiAxLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRBdXRob3JlZEVudGl0eSh3b3JsZDogV29ybGQsIGtpbmQ6IEVudGl0eUtpbmQsIHg6IG51bWJlciwgejogbnVtYmVyLCB2YXJpYW50OiBudW1iZXIsIHJvdDogbnVtYmVyLCBzY2FsZTogbnVtYmVyLCByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbCwgcmVtYWluaW5nOiBudW1iZXIsIHlpZWxkUGVySGFydmVzdDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoeSA8PSBTRUFfTEVWRUwpIHJldHVybjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIC8vIEEgaGVybyBhc3NldCBvd25zIGl0cyBzcG90OiBjbGVhciBhbnkgZ2VuZXJhdGVkIGVudGl0eSB0aGF0IHdvdWxkIG92ZXJsYXBcbiAgLy8gaXQsIHJhdGhlciB0aGFuIHNpbGVudGx5IGRyb3BwaW5nIHRoZSBhdXRob3JlZCBjb21wb3NpdGlvbi5cbiAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdO1xuICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgcmV0dXJuO1xuICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmIChlICYmIE1hdGguaHlwb3QoZS54IC0geCwgZS56IC0geikgPCAyLjYpIHtcbiAgICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gICAgICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gICAgICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgICB9XG4gIH1cbiAgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSk7XG4gIC8vIEF1dGhvcmVkIGNvbXBvc2l0aW9uIGlzIGR1cmFibGUgc3RhdGU6IGl0IGNhbiBjbGVhciBvdmVybGFwcGluZyBuYXR1cmFsXG4gIC8vIGVudGl0aWVzLCBzbyBzYXZlIHRoZSBjb21wbGV0ZSBhZmZlY3RlZCBjaHVuayByYXRoZXIgdGhhbiBvbmx5IGl0cyBoZXJvZXMuXG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG5cbiAgY29uc3QgaWQgPSBgaGVybzoke2tpbmR9OiR7TWF0aC5yb3VuZCh4KX06JHtNYXRoLnJvdW5kKHopfWA7XG4gIGNvbnN0IGJlZm9yZSA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGNvbnN0IGVudGl0eTogRW50aXR5ID0ge1xuICAgIGlkLCBraW5kLCBjaHVuazoga2V5LCB4OiB4ICsgMC41LCB5LCB6OiB6ICsgMC41LFxuICAgIHJvdCwgc2NhbGUsIHZhcmlhbnQsIHJlc291cmNlLCByZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdCxcbiAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IHRydWUsXG4gIH07XG4gIGFkZEVudGl0eSh3b3JsZCwgZW50aXR5KTtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLnNpemUgPiBiZWZvcmUgJiYga2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkge1xuICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkgcmV0dXJuO1xuICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG5cbiAgY29uc3Qgc2l0ZXM6IEFycmF5PHsga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcm90OiBudW1iZXIgfT4gPSBbXG4gICAgeyBraW5kOiAnd2F5c3RvbmUnLCB4OiAtMTAsIHo6IC0xNCwgcm90OiAwIH0sXG4gICAgeyBraW5kOiAnbWFya2VyJywgeDogLTMyLCB6OiAtOCwgcm90OiBNYXRoLlBJIC8gMiB9LFxuICBdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc2l0ZXMpIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKHkgPD0gU0VBX0xFVkVMKSBjb250aW51ZTtcbiAgICB3b3JsZC5zaXRlcy5wdXNoKHtcbiAgICAgIGlkOiBgc2l0ZToke3Mua2luZH1gLFxuICAgICAga2luZDogcy5raW5kLFxuICAgICAgeDogcy54ICsgMC41LCB5LCB6OiBzLnogKyAwLjUsXG4gICAgICByb3Q6IHMucm90LFxuICAgICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gICAgfSk7XG4gIH1cblxuICAvLyBBIGhlcm8gZ3JvdmUgY29tcG9zZWQgaW4gdGhlIGRlZmF1bHQgY2FtZXJhJ3MgdmlldyBkaXJlY3Rpb24uIFRoZXNlIGFyZVxuICAvLyBTdHlsIG5hdHVyYWwgYXNzZXRzIChBUy0wMDEgdjIpLCBub3QgTm94ZWwgYXJjaGl0ZWN0dXJlOyB0aGUgTm94ZWxcbiAgLy8gd2F5c3RvbmUvbWFya2VyIGFib3ZlIHJlbWFpbiB0aGUgaHVtYW4tbWFkZSBsYW5kbWFya3MuXG4gIGNvbnN0IGdyb3ZlOiBBcnJheTxbRW50aXR5S2luZCwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdPiA9IFtcbiAgICBbJ3N0eWxfdHJlZV9zcGlyZScsIC0yMiwgLTI2LCAwLCAxLjAwLCAwXSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC0zNCwgLTE4LCAxLCAwLjk1LCBNYXRoLlBJIC8gMTJdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTYsIC0zNCwgMiwgMS4wMCwgTWF0aC5QSSAvIDZdLFxuICAgIFsnc3R5bF90cmVlX2Jsb3Nzb20nLCAtMjgsIC0zOCwgMCwgMC45MCwgTWF0aC5QSSAvIDRdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTQwLCAtMzAsIDIsIDEuMDUsIE1hdGguUEkgLyAzXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTEyLCAtMjQsIDAsIDAuOTAsIE1hdGguUEkgLyAyLjRdLFxuICBdO1xuICBmb3IgKGNvbnN0IFtraW5kLCB4LCB6LCB2YXJpYW50LCBzY2FsZSwgcm90XSBvZiBncm92ZSkge1xuICAgIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCBraW5kLCB4LCB6LCB2YXJpYW50LCByb3QsIHNjYWxlLCAnd29vZCcsIDEyLCA0KTtcbiAgfVxuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfcm9ja19tZWRpdW0nLCAtNiwgLTEwLCAwLCAwLCAxLjAsICdzdG9uZScsIDgsIDMpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfc2hydWInLCAtMTQsIC04LCAxLCBNYXRoLlBJIC8gMTIsIDEuMSwgJ2ZpYmVyJywgNCwgMSk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9jYWlybicsIC0yMCwgLTYsIDAsIDAsIDEuMCwgJ3N0b25lJywgNiwgMik7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9vcmUnLCAtMzgsIC00MiwgMCwgTWF0aC5QSSAvIDQsIDEuMSwgJ29yZScsIDgsIDIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbmVhcmVzdEhhcnZlc3RhYmxlKFxuICB3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCByYWRpdXM6IG51bWJlciwgcmVzb3VyY2U/OiBSZXNvdXJjZVR5cGUsXG4pOiBFbnRpdHkgfCBudWxsIHtcbiAgbGV0IGJlc3Q6IEVudGl0eSB8IG51bGwgPSBudWxsO1xuICBsZXQgYmVzdEQgPSByYWRpdXMgKiByYWRpdXM7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZClcbiAgICAgIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIGNvbnRpbnVlO1xuICAgIGlmIChyZXNvdXJjZSAmJiBlLnJlc291cmNlICE9PSByZXNvdXJjZSkgY29udGludWU7XG4gICAgY29uc3QgZCA9IChlLnggLSB4KSAqKiAyICsgKGUueiAtIHopICoqIDI7XG4gICAgaWYgKGQgPCBiZXN0RCkgeyBiZXN0RCA9IGQ7IGJlc3QgPSBlOyB9XG4gIH1cbiAgcmV0dXJuIGJlc3Q7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdFJlc3VsdCB7IGVudGl0eTogRW50aXR5OyByZXNvdXJjZTogUmVzb3VyY2VUeXBlOyBhbW91bnQ6IG51bWJlcjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBIYXJ2ZXN0UmVzdWx0IHwgbnVsbCB7XG4gIGNvbnN0IGUgPSBsaXZlRW50aXR5KHdvcmxkLCBpZCk7XG4gIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgYW1vdW50ID0gTWF0aC5taW4oZS55aWVsZFBlckhhcnZlc3QsIGUucmVtYWluaW5nKTtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIGFtb3VudCA+IDEyMCkgcmV0dXJuIG51bGw7XG4gIGUucmVtYWluaW5nIC09IGFtb3VudDtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgZS5oYXJ2ZXN0ZWRPbmNlID0gdHJ1ZTtcbiAgaWYgKGUucmVtYWluaW5nIDw9IDApIGUuaGFydmVzdGVkID0gdHJ1ZTtcbiAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgZW50aXR5OiBlLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbi8qKiBSZW1vdmUgZXZlcnkgcmV0aXJlZCBzb3VyY2UgYWZ0ZXIgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkuIFRoaXMgbWlncmF0aW9uXG4gKiBjcmVhdGVzIGRldGVybWluaXN0aWMgdG9tYnN0b25lcyBidXQgaXMgbm90IGEgcGxheWVyIGNvbW1hbmQgb3IgcmV2aXNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmV0aXJlU3RvbmVFbnRpdGllcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBlIG9mIFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0pIHtcbiAgICBpZiAoIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKSBjb250aW51ZTtcbiAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoZS5pZCk7XG4gICAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoZS5pZCk7XG4gICAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gICAgaWYgKCF3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGUuY2h1bmspKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtrZXksIGlkc10gb2Ygd29ybGQuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgYWN0aXZlID0gaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpO1xuICAgIGlmIChhY3RpdmUubGVuZ3RoID4gMCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhrZXkpKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgYWN0aXZlKTtcbiAgICBlbHNlIHdvcmxkLmVudGl0eUNodW5rcy5kZWxldGUoa2V5KTtcbiAgfVxuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGVyc2lzdGVuY2UgLyBhdXRob3JpdHkgYm91bmRhcnkgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1hbmlmZXN0IHtcbiAgc2NoZW1hOiAxO1xuICBzZWVkOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIHBhcmFtc0hhc2g6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZm52MWEodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGggPSAweDgxMWM5ZGM1O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBoID0gTWF0aC5pbXVsKGgsIDB4MDEwMDAxOTMpO1xuICB9XG4gIHJldHVybiAoaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZE1hbmlmZXN0KHdvcmxkOiBXb3JsZCk6IFdvcmxkTWFuaWZlc3Qge1xuICBjb25zdCBwID0gd29ybGQucGFyYW1zO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBzZWVkOiB3b3JsZC5zZWVkLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHAuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBzaXplOiBwLnNpemUsXG4gICAgY2h1bmtTaXplOiBwLmNodW5rU2l6ZSxcbiAgICB5TWluOiBwLnlNaW4sXG4gICAgeU1heDogcC55TWF4LFxuICAgIHNlYUxldmVsOiBwLnNlYUxldmVsLFxuICAgIHBhcmFtc0hhc2g6IGZudjFhKEpTT04uc3RyaW5naWZ5KHApKSxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbEVkaXQgeyBpOiBudW1iZXI7IG06IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgc2NoZW1hOiAxO1xuICBrZXk6IHN0cmluZztcbiAgYmFzZVZlcnNpb246IG51bWJlcjtcbiAgZWRpdHM6IFZveGVsRWRpdFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogQ2h1bmtEZWx0YSB7XG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIGtleSxcbiAgICBiYXNlVmVyc2lvbjogd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgZWRpdHM6IGVkaXRzID8gWy4uLmVkaXRzLmVudHJpZXMoKV0ubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSkgOiBbXSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGRlbHRhOiBDaHVua0RlbHRhKTogdm9pZCB7XG4gIGNvbnN0IFtjeCwgY3pdID0gZGVsdGEua2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGZvciAoY29uc3QgZSBvZiBkZWx0YS5lZGl0cykge1xuICAgIGNvbnN0IHlJbmRleCA9IE1hdGguZmxvb3IoZS5pIC8gQ0hVTktfQVJFQSk7XG4gICAgY29uc3QgcmVtID0gZS5pICUgQ0hVTktfQVJFQTtcbiAgICBjb25zdCBseiA9IE1hdGguZmxvb3IocmVtIC8gQ0hVTktfU0laRSk7XG4gICAgY29uc3QgbHggPSByZW0gJSBDSFVOS19TSVpFO1xuICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHg7XG4gICAgY29uc3QgeSA9IFlfTUlOICsgeUluZGV4O1xuICAgIGNvbnN0IHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIGUubSBhcyBNYXRJZCk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSB0aW1lIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgVGltZVN0YXRlIHsgdDogbnVtYmVyOyBkYXlMZW5ndGhTZWM6IG51bWJlcjsgcGF1c2VkOiBib29sZWFuOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBhZHZhbmNlVGltZShzOiBUaW1lU3RhdGUsIGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHMucGF1c2VkKSByZXR1cm47XG4gIHMudCA9IChzLnQgKyBkdCAvIHMuZGF5TGVuZ3RoU2VjKSAlIDE7XG59XG4iLCAiLy8gVm94ZWwgZmFjZSBjb2xvdXJzIGFuZCBrZXlzIHNoYXJlZCBieSB0aGUgbWFpbi10aHJlYWQgdGVycmFpbiB2aWV3IGFuZCB0aGVcbi8vIGNodW5rIHdvcmtlci4gUHVyZSBkYXRhICsgVEhSRUUuQ29sb3IgbWF0aCAobm8gV2ViR0wgb2JqZWN0cykuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQgeyBNQVQsIGhhc2gyaSB9IGZyb20gJy4uL3NpbS93b3JsZCc7XG5cbmV4cG9ydCBjb25zdCBNID0gcGFsZXR0ZS5tYXRlcmlhbHMgYXMgUmVjb3JkPHN0cmluZywgeyBoZXg6IHN0cmluZyB9PjtcbmV4cG9ydCBjb25zdCBIID0gKGs6IHN0cmluZykgPT4gTVtrXS5oZXg7XG5cbmV4cG9ydCBjb25zdCBjb2xvckNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFRIUkVFLkNvbG9yPigpO1xuZXhwb3J0IGZ1bmN0aW9uIGMoaGV4OiBzdHJpbmcpOiBUSFJFRS5Db2xvciB7XG4gIGxldCBvdXQgPSBjb2xvckNhY2hlLmdldChoZXgpO1xuICBpZiAoIW91dCkgeyBvdXQgPSBuZXcgVEhSRUUuQ29sb3IoaGV4KTsgY29sb3JDYWNoZS5zZXQoaGV4LCBvdXQpOyB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBjb25zdCBDT0wgPSB7XG4gIGdyYXNzVG9wOiBbYyhIKCdncmFzc190b3AnKSksIGMoSCgnZ3Jhc3NfaGlnaCcpKSwgYyhIKCdncmFzc19wZWFrJykpXSxcbiAgZ3Jhc3NDYXA6IGMoSCgnZ3Jhc3NfY2FwJykpLFxuICBzb2lsOiBjKEgoJ3N0cmF0YV9vY2hyZScpKS5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKDAuNzgpLFxuICBvY2hyZTogYyhIKCdzdHJhdGFfb2NocmUnKSksXG4gIHJ1c3Q6IGMoSCgnc3RyYXRhX3J1c3QnKSksXG4gIHN0b25lVG9wOiBjKEgoJ3N0b25lX3RvcCcpKSxcbiAgc3RvbmVBOiBjKEgoJ3N0b25lX2JvZHlfYScpKSxcbiAgc3RvbmVCOiBjKEgoJ3N0b25lX2JvZHlfYicpKSxcbiAgc3RvbmVTaGFkZTogYyhIKCdzdG9uZV9zaGFkZScpKSxcbiAgc2FuZDogYyhIKCdzYW5kJykpLFxuICBncmF2ZWw6IGMoSCgnc3RvbmVfYm9keV9iJykpLmNsb25lKCkubGVycChjKEgoJ3NhbmQnKSksIDAuMzUpLFxuICBvcmU6IGMoSCgnb3JlX2NyeXN0YWwnKSksXG4gIG1vc3M6IGMoSCgnZ3Jhc3NfY2FwJykpLmNsb25lKCkubGVycChjKEgoJ3N0b25lX2JvZHlfYicpKSwgMC4zNSksXG4gIHNub3c6IGMoSCgnc25vdycpKSxcbiAgc25vd1NoYWRlOiBjKEgoJ3Nub3cnKSkuY2xvbmUoKS5sZXJwKGMoSCgnc3RvbmVfc2hhZGUnKSksIDAuMzUpLFxuICB3YXRlclJpbTogYyhIKCd3YXRlcl9yaW0nKSksXG4gIHdhdGVyU2hhbGxvdzogYyhIKCd3YXRlcl9zaGFsbG93JykpLFxuICB3YXRlck1pZDogYyhIKCd3YXRlcl9taWQnKSksXG4gIHdhdGVyRGVlcDogYyhIKCd3YXRlcl9kZWVwJykpLFxufTtcblxuZXhwb3J0IGNvbnN0IFNIQURFID0gWzAuOTAsIDAuOTYsIDEuMCwgMS4wNF07XG5cbi8vIEtlZXAgYSBzbWFsbCByb2xsaW5nIHdpbmRvdyBvZiBidWlsZCB0aW1pbmdzIGZvciB0aGUgcGVyZm9ybWFuY2UgZXZpZGVuY2UuXG4vLyBUaGVzZSBhcmUgaW5zdHJ1bWVudGF0aW9uLCBub3Qgc2ltdWxhdGlvbiBzdGF0ZS5cbmV4cG9ydCBjb25zdCBNQVhfUEVSRl9TQU1QTEVTID0gMTI4O1xuZXhwb3J0IGZ1bmN0aW9uIHJlY29yZFNhbXBsZShzYW1wbGVzOiBudW1iZXJbXSwgbXM6IG51bWJlcik6IHZvaWQge1xuICBzYW1wbGVzLnB1c2gobXMpO1xuICBpZiAoc2FtcGxlcy5sZW5ndGggPiBNQVhfUEVSRl9TQU1QTEVTKSBzYW1wbGVzLnNoaWZ0KCk7XG59XG5leHBvcnQgZnVuY3Rpb24gcGVyY2VudGlsZShzYW1wbGVzOiBudW1iZXJbXSwgcDogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHNhbXBsZXMubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcbiAgY29uc3Qgc29ydGVkID0gWy4uLnNhbXBsZXNdLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbiAgY29uc3QgaSA9IE1hdGgubWluKHNvcnRlZC5sZW5ndGggLSAxLCBNYXRoLm1heCgwLCBNYXRoLmNlaWwocCAqIHNvcnRlZC5sZW5ndGgpIC0gMSkpO1xuICByZXR1cm4gTWF0aC5yb3VuZChzb3J0ZWRbaV0gKiAxMDApIC8gMTAwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QmFuZCh5OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4geSA+PSA0NSA/IDIgOiB5ID49IDE4ID8gMSA6IDA7XG59XG5leHBvcnQgZnVuY3Rpb24gc3RvbmVUb25lKHk6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoKHkgKyA2NCkgPj4gMykgJiAxO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHNoYWRlQXQoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgc3ggPSBNYXRoLmZsb29yKHggLyAyKSArIE1hdGguZmxvb3IoeSAvIDMpICogMTc7XG4gIGNvbnN0IHN6ID0gTWF0aC5mbG9vcih6IC8gMik7XG4gIHJldHVybiBNYXRoLmZsb29yKGhhc2gyaShzeCwgc3osIHNlZWQgKyAzMDApICogNCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBrZXlGb3IobWF0OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgc2hhZGU6IG51bWJlciwgYXhpczogbnVtYmVyLCBkaXI6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAobWF0ICYgMTUpIHwgKCh2YXJpYW50ICYgMTUpIDw8IDQpIHwgKChzaGFkZSAmIDMpIDw8IDgpIHwgKChheGlzICYgMykgPDwgMTApIHwgKChkaXIgPiAwID8gMSA6IDApIDw8IDEyKTtcbn1cblxuZXhwb3J0IGNvbnN0IGZhY2VDb2xvckNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRIUkVFLkNvbG9yPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gY29sb3JGb3JLZXkoa2V5OiBudW1iZXIpOiBUSFJFRS5Db2xvciB7XG4gIGNvbnN0IGNhY2hlZCA9IGZhY2VDb2xvckNhY2hlLmdldChrZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBtYXQgPSBrZXkgJiAxNTtcbiAgY29uc3QgdmFyaWFudCA9IChrZXkgPj4gNCkgJiAxNTtcbiAgY29uc3Qgc2hhZGUgPSAoa2V5ID4+IDgpICYgMztcbiAgY29uc3QgYXhpcyA9IChrZXkgPj4gMTApICYgMztcbiAgY29uc3QgZGlyID0gKGtleSA+PiAxMikgJiAxO1xuICBsZXQgY29sb3I6IFRIUkVFLkNvbG9yO1xuXG4gIGlmIChheGlzID09PSAxICYmIGRpciA9PT0gMSkge1xuICAgIGNvbnN0IGhiID0gTWF0aC5taW4oMiwgdmFyaWFudCAmIDMpO1xuICAgIGlmIChtYXQgPT09IE1BVC5HUkFTUykgY29sb3IgPSBDT0wuZ3Jhc3NUb3BbaGJdO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULlNBTkQpIGNvbG9yID0gQ09MLnNhbmQ7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuR1JBVkVMKSBjb2xvciA9IENPTC5ncmF2ZWw7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuU09JTCkgY29sb3IgPSBDT0wub2NocmU7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuT1JFKSBjb2xvciA9IENPTC5vcmU7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuTU9TUykgY29sb3IgPSBDT0wubW9zcztcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5TTk9XKSBjb2xvciA9IENPTC5zbm93O1xuICAgIGVsc2UgY29sb3IgPSBDT0wuc3RvbmVUb3A7XG4gIH0gZWxzZSBpZiAoYXhpcyA9PT0gMSAmJiBkaXIgPT09IDApIHtcbiAgICBjb2xvciA9IENPTC5zdG9uZVNoYWRlO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGRlcHRoID0gdmFyaWFudCAmIDc7XG4gICAgY29uc3QgdG9uZSA9ICh2YXJpYW50ID4+IDMpICYgMTtcbiAgICBjb25zdCBib2R5ID0gdG9uZSA/IENPTC5zdG9uZUIgOiBDT0wuc3RvbmVBO1xuICAgIGlmIChtYXQgPT09IE1BVC5HUkFTUyB8fCBtYXQgPT09IE1BVC5NT1NTKSB7XG4gICAgICBpZiAoZGVwdGggPT09IDApIGNvbG9yID0gbWF0ID09PSBNQVQuTU9TUyA/IENPTC5tb3NzIDogQ09MLmdyYXNzQ2FwO1xuICAgICAgZWxzZSBpZiAoZGVwdGggPD0gMikgY29sb3IgPSBDT0wuc29pbDtcbiAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAzKSBjb2xvciA9IENPTC5ydXN0O1xuICAgICAgZWxzZSBjb2xvciA9IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TT0lMKSB7XG4gICAgICBjb2xvciA9IGRlcHRoIDw9IDEgPyBDT0wuc29pbCA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TQU5EKSB7XG4gICAgICBjb2xvciA9IGRlcHRoIDw9IDEgPyBDT0wuc2FuZCA6IGRlcHRoID09PSAyID8gQ09MLm9jaHJlIDogYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULkdSQVZFTCkge1xuICAgICAgY29sb3IgPSBkZXB0aCA8PSAxID8gQ09MLmdyYXZlbCA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5PUkUpIHtcbiAgICAgIGNvbG9yID0gQ09MLm9yZTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULlNOT1cpIHtcbiAgICAgIGNvbG9yID0gZGVwdGggPT09IDAgPyBDT0wuc25vd1NoYWRlIDogYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULkJFRFJPQ0spIHtcbiAgICAgIGNvbG9yID0gQ09MLnN0b25lU2hhZGU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbG9yID0gYm9keTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBvdXQgPSBjb2xvci5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKFNIQURFW3NoYWRlXSk7XG4gIGZhY2VDb2xvckNhY2hlLnNldChrZXksIG91dCk7XG4gIHJldHVybiBvdXQ7XG59XG4iLCAiLy8gUHVyZSBncmVlZHkgdm94ZWwgbWVzaGVyIG92ZXIgYSBwYWRkZWQgY2h1bmsgdm9sdW1lLiBObyBXb3JsZCBhY2Nlc3MgYW5kIG5vXG4vLyBXZWJHTCBvYmplY3RzLCBzbyBpdCBydW5zIGlkZW50aWNhbGx5IG9uIHRoZSBtYWluIHRocmVhZCBhbmQgaW4gYSB3b3JrZXIuXG4vL1xuLy8gUGFkZGVkIGxheW91dDogeCBhbmQgeiBydW4gZnJvbSAtMSB0byBDSFVOS19TSVpFICgzNCBjZWxscykgc28gZmFjZXMgb24gY2h1bmtcbi8vIGJvcmRlcnMgY2FuIHNlZSB0aGVpciBuZWlnaGJvdXJzOyB5IHJ1bnMgb3ZlciB0aGUgZnVsbCB3b3JsZCBoZWlnaHQuIE91dCBvZlxuLy8gcmFuZ2UgeSBzYW1wbGVzIGFyZSBiZWRyb2NrIGJlbG93IGFuZCBhaXIgYWJvdmUsIGFzIGluIGdldFZveGVsLlxuaW1wb3J0IHtcbiAgQ0hVTktfU0laRSwgV09STERfSEVJR0hULCBZX01JTiwgTUFULCBpc09wYXF1ZSwgbG9jYWxJbmRleCxcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IGNvbG9yRm9yS2V5LCBoZWlnaHRCYW5kLCBrZXlGb3IsIHNoYWRlQXQsIHN0b25lVG9uZSB9IGZyb20gJy4vdm94ZWwtY29sb3JzJztcblxuZXhwb3J0IGNvbnN0IFBBRCA9IENIVU5LX1NJWkUgKyAyO1xuZXhwb3J0IGNvbnN0IFBBRERFRF9WT0xVTUUgPSBQQUQgKiBQQUQgKiBXT1JMRF9IRUlHSFQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWVzaEFycmF5cyB7XG4gIHBvc2l0aW9uczogRmxvYXQzMkFycmF5O1xuICBub3JtYWxzOiBGbG9hdDMyQXJyYXk7XG4gIGNvbG9yczogRmxvYXQzMkFycmF5O1xuICBtYXRzOiBGbG9hdDMyQXJyYXk7XG4gIGluZGljZXM6IFVpbnQzMkFycmF5O1xuICB0cmlhbmdsZXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IHBhZGRlZEluZGV4ID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgPT5cbiAgKHggKyAxKSArICh6ICsgMSkgKiBQQUQgKyB5ICogUEFEICogUEFEO1xuXG4vKiogQ29weSBhIGNodW5rIGFuZCBpdHMgb25lLWNlbGwgYm9yZGVyIGludG8gYSBwYWRkZWQgdm9sdW1lLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUGFkZGVkKFxuICBkYXRhOiBVaW50OEFycmF5LFxuICBuZWlnaGJvdXI6IChseDogbnVtYmVyLCB5OiBudW1iZXIsIGx6OiBudW1iZXIpID0+IG51bWJlcixcbik6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBvdXQgPSBuZXcgVWludDhBcnJheShQQURERURfVk9MVU1FKTtcbiAgZm9yIChsZXQgeSA9IDA7IHkgPCBXT1JMRF9IRUlHSFQ7IHkrKykge1xuICAgIGZvciAobGV0IHogPSAtMTsgeiA8PSBDSFVOS19TSVpFOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSAtMTsgeCA8PSBDSFVOS19TSVpFOyB4KyspIHtcbiAgICAgICAgY29uc3QgaW5zaWRlID0geCA+PSAwICYmIHogPj0gMCAmJiB4IDwgQ0hVTktfU0laRSAmJiB6IDwgQ0hVTktfU0laRTtcbiAgICAgICAgb3V0W3BhZGRlZEluZGV4KHgsIHksIHopXSA9IGluc2lkZSA/IGRhdGFbbG9jYWxJbmRleCh4LCB5LCB6KV0gOiBuZWlnaGJvdXIoeCwgeSwgeik7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHBvc0Zyb20oYXhpczogbnVtYmVyLCBzbGljZTogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlciwgb3V0OiBJbnQzMkFycmF5KTogdm9pZCB7XG4gIGlmIChheGlzID09PSAwKSB7IG91dFswXSA9IHNsaWNlOyBvdXRbMV0gPSBpOyBvdXRbMl0gPSBqOyB9XG4gIGVsc2UgaWYgKGF4aXMgPT09IDEpIHsgb3V0WzBdID0gajsgb3V0WzFdID0gc2xpY2U7IG91dFsyXSA9IGk7IH1cbiAgZWxzZSB7IG91dFswXSA9IGk7IG91dFsxXSA9IGo7IG91dFsyXSA9IHNsaWNlOyB9XG59XG5cbmNsYXNzIEdyb3dhYmxlIHtcbiAgcHJpdmF0ZSBidWY6IEZsb2F0MzJBcnJheTtcbiAgbGVuZ3RoID0gMDtcbiAgY29uc3RydWN0b3IobjogbnVtYmVyKSB7IHRoaXMuYnVmID0gbmV3IEZsb2F0MzJBcnJheShuKTsgfVxuICBwdXNoMyhhOiBudW1iZXIsIGI6IG51bWJlciwgYzogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMubGVuZ3RoICsgMyA+IHRoaXMuYnVmLmxlbmd0aCkgdGhpcy5ncm93KCk7XG4gICAgdGhpcy5idWZbdGhpcy5sZW5ndGgrK10gPSBhOyB0aGlzLmJ1Zlt0aGlzLmxlbmd0aCsrXSA9IGI7IHRoaXMuYnVmW3RoaXMubGVuZ3RoKytdID0gYztcbiAgfVxuICBwdXNoMShhOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5sZW5ndGggKyAxID4gdGhpcy5idWYubGVuZ3RoKSB0aGlzLmdyb3coKTtcbiAgICB0aGlzLmJ1Zlt0aGlzLmxlbmd0aCsrXSA9IGE7XG4gIH1cbiAgcHJpdmF0ZSBncm93KCk6IHZvaWQgeyBjb25zdCBuID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLmJ1Zi5sZW5ndGggKiAyKTsgbi5zZXQodGhpcy5idWYpOyB0aGlzLmJ1ZiA9IG47IH1cbiAgZG9uZSgpOiBGbG9hdDMyQXJyYXkgeyByZXR1cm4gdGhpcy5idWYuc2xpY2UoMCwgdGhpcy5sZW5ndGgpOyB9XG59XG5cbi8qKlxuICogR3JlZWR5IDNEIGZhY2UgbWVzaGVyLiBBIGZhY2UgaXMgZW1pdHRlZCB3aGVyZSBhbiBvcGFxdWUgdm94ZWwgdG91Y2hlcyBhXG4gKiBub24tb3BhcXVlIGNlbGwgKGFpciBvciB3YXRlcik7IG9ubHkgdGhlIGNodW5rIHRoYXQgb3ducyB0aGUgc29saWQgdm94ZWxcbiAqIGVtaXRzIGl0LiBPdXRwdXQgaXMgaWRlbnRpY2FsIHRvIHRoZSBmb3JtZXIgaW4tcGxhY2UgbWVzaGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWVzaFBhZGRlZChcbiAgcGFkZGVkOiBVaW50OEFycmF5LCBoZWlnaHRzOiBVaW50OEFycmF5LCBveDogbnVtYmVyLCBvejogbnVtYmVyLCBzZWVkOiBudW1iZXIsXG4pOiBNZXNoQXJyYXlzIHtcbiAgY29uc3Qgc2FtcGxlID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGlmICh5IDwgMCkgcmV0dXJuIE1BVC5CRURST0NLO1xuICAgIGlmICh5ID49IFdPUkxEX0hFSUdIVCkgcmV0dXJuIE1BVC5BSVI7XG4gICAgcmV0dXJuIHBhZGRlZFtwYWRkZWRJbmRleCh4LCB5LCB6KV07XG4gIH07XG4gIGNvbnN0IHBvc2l0aW9ucyA9IG5ldyBHcm93YWJsZSgxIDw8IDE1KSwgbm9ybWFscyA9IG5ldyBHcm93YWJsZSgxIDw8IDE1KTtcbiAgY29uc3QgY29sb3JzID0gbmV3IEdyb3dhYmxlKDEgPDwgMTUpLCBtYXRzID0gbmV3IEdyb3dhYmxlKDEgPDwgMTMpO1xuICBsZXQgaW5kaWNlcyA9IG5ldyBVaW50MzJBcnJheSgxIDw8IDE0KTtcbiAgbGV0IGluZGV4Q291bnQgPSAwO1xuICBsZXQgdmVydGV4Q291bnQgPSAwO1xuICBjb25zdCBkaW1zID0gW0NIVU5LX1NJWkUsIFdPUkxEX0hFSUdIVCwgQ0hVTktfU0laRV07XG4gIGNvbnN0IHBhID0gbmV3IEludDMyQXJyYXkoMyksIHBiID0gbmV3IEludDMyQXJyYXkoMyk7XG4gIGNvbnN0IGNvcm5lcnMgPSBuZXcgRmxvYXQzMkFycmF5KDEyKTtcblxuICBjb25zdCBlbWl0UXVhZCA9IChheGlzOiBudW1iZXIsIGRpcjogbnVtYmVyLCBzbGljZTogbnVtYmVyLFxuICAgIGkwOiBudW1iZXIsIGowOiBudW1iZXIsIHc6IG51bWJlciwgaDogbnVtYmVyLCBrZXk6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IHBsYW5lID0gc2xpY2UgKyAxO1xuICAgIGNvbnN0IHUwID0gaTAsIHUxID0gaTAgKyB3LCB2MCA9IGowLCB2MSA9IGowICsgaDtcbiAgICBjb25zdCBzZXQgPSAoazogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKSA9PiB7IGNvcm5lcnNbayAqIDNdID0geDsgY29ybmVyc1trICogMyArIDFdID0geTsgY29ybmVyc1trICogMyArIDJdID0gejsgfTtcbiAgICBpZiAoYXhpcyA9PT0gMCkge1xuICAgICAgY29uc3QgeCA9IG94ICsgcGxhbmUsIHkwID0gWV9NSU4gKyB1MCwgeTEgPSBZX01JTiArIHUxLCB6MCA9IG96ICsgdjAsIHoxID0gb3ogKyB2MTtcbiAgICAgIGlmIChkaXIgPiAwKSB7IHNldCgwLCB4LCB5MCwgejApOyBzZXQoMSwgeCwgeTEsIHowKTsgc2V0KDIsIHgsIHkxLCB6MSk7IHNldCgzLCB4LCB5MCwgejEpOyB9XG4gICAgICBlbHNlIHsgc2V0KDAsIHgsIHkwLCB6MCk7IHNldCgxLCB4LCB5MCwgejEpOyBzZXQoMiwgeCwgeTEsIHoxKTsgc2V0KDMsIHgsIHkxLCB6MCk7IH1cbiAgICB9IGVsc2UgaWYgKGF4aXMgPT09IDEpIHtcbiAgICAgIGNvbnN0IHkgPSBZX01JTiArIHBsYW5lLCB6MCA9IG96ICsgdTAsIHoxID0gb3ogKyB1MSwgeDAgPSBveCArIHYwLCB4MSA9IG94ICsgdjE7XG4gICAgICBpZiAoZGlyID4gMCkgeyBzZXQoMCwgeDAsIHksIHowKTsgc2V0KDEsIHgwLCB5LCB6MSk7IHNldCgyLCB4MSwgeSwgejEpOyBzZXQoMywgeDEsIHksIHowKTsgfVxuICAgICAgZWxzZSB7IHNldCgwLCB4MCwgeSwgejApOyBzZXQoMSwgeDEsIHksIHowKTsgc2V0KDIsIHgxLCB5LCB6MSk7IHNldCgzLCB4MCwgeSwgejEpOyB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHogPSBveiArIHBsYW5lLCB4MCA9IG94ICsgdTAsIHgxID0gb3ggKyB1MSwgeTAgPSBZX01JTiArIHYwLCB5MSA9IFlfTUlOICsgdjE7XG4gICAgICBpZiAoZGlyID4gMCkgeyBzZXQoMCwgeDAsIHkwLCB6KTsgc2V0KDEsIHgxLCB5MCwgeik7IHNldCgyLCB4MSwgeTEsIHopOyBzZXQoMywgeDAsIHkxLCB6KTsgfVxuICAgICAgZWxzZSB7IHNldCgwLCB4MCwgeTAsIHopOyBzZXQoMSwgeDAsIHkxLCB6KTsgc2V0KDIsIHgxLCB5MSwgeik7IHNldCgzLCB4MSwgeTAsIHopOyB9XG4gICAgfVxuICAgIGNvbnN0IGNvbG9yID0gY29sb3JGb3JLZXkoa2V5KTtcbiAgICBjb25zdCBtYXQgPSBrZXkgJiAxNTtcbiAgICBjb25zdCBueCA9IGF4aXMgPT09IDAgPyBkaXIgOiAwLCBueSA9IGF4aXMgPT09IDEgPyBkaXIgOiAwLCBueiA9IGF4aXMgPT09IDIgPyBkaXIgOiAwO1xuICAgIGNvbnN0IGJhc2UgPSB2ZXJ0ZXhDb3VudDtcbiAgICBmb3IgKGxldCBrID0gMDsgayA8IDQ7IGsrKykge1xuICAgICAgcG9zaXRpb25zLnB1c2gzKGNvcm5lcnNbayAqIDNdLCBjb3JuZXJzW2sgKiAzICsgMV0sIGNvcm5lcnNbayAqIDMgKyAyXSk7XG4gICAgICBub3JtYWxzLnB1c2gzKG54LCBueSwgbnopO1xuICAgICAgY29sb3JzLnB1c2gzKGNvbG9yLnIsIGNvbG9yLmcsIGNvbG9yLmIpO1xuICAgICAgbWF0cy5wdXNoMShtYXQpO1xuICAgIH1cbiAgICB2ZXJ0ZXhDb3VudCArPSA0O1xuICAgIGlmIChpbmRleENvdW50ICsgNiA+IGluZGljZXMubGVuZ3RoKSB7IGNvbnN0IG4gPSBuZXcgVWludDMyQXJyYXkoaW5kaWNlcy5sZW5ndGggKiAyKTsgbi5zZXQoaW5kaWNlcyk7IGluZGljZXMgPSBuOyB9XG4gICAgaW5kaWNlc1tpbmRleENvdW50KytdID0gYmFzZTsgaW5kaWNlc1tpbmRleENvdW50KytdID0gYmFzZSArIDE7IGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2UgKyAyO1xuICAgIGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2U7IGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2UgKyAyOyBpbmRpY2VzW2luZGV4Q291bnQrK10gPSBiYXNlICsgMztcbiAgfTtcblxuICBmb3IgKGxldCBheGlzID0gMDsgYXhpcyA8IDM7IGF4aXMrKykge1xuICAgIGNvbnN0IHUgPSAoYXhpcyArIDEpICUgMywgdiA9IChheGlzICsgMikgJSAzO1xuICAgIGNvbnN0IGR1ID0gZGltc1t1XSwgZHYgPSBkaW1zW3ZdLCBkZCA9IGRpbXNbYXhpc107XG4gICAgY29uc3QgbWFzayA9IG5ldyBVaW50MTZBcnJheShkdSAqIGR2KTtcbiAgICBmb3IgKGxldCBzbGljZSA9IC0xOyBzbGljZSA8IGRkOyBzbGljZSsrKSB7XG4gICAgICBtYXNrLmZpbGwoMCk7XG4gICAgICBsZXQgYW55ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGR2OyBqKyspIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkdTsgaSsrKSB7XG4gICAgICAgICAgcG9zRnJvbShheGlzLCBzbGljZSwgaSwgaiwgcGEpO1xuICAgICAgICAgIHBvc0Zyb20oYXhpcywgc2xpY2UgKyAxLCBpLCBqLCBwYik7XG4gICAgICAgICAgY29uc3QgYSA9IHNhbXBsZShwYVswXSwgcGFbMV0sIHBhWzJdKTtcbiAgICAgICAgICBjb25zdCBiID0gc2FtcGxlKHBiWzBdLCBwYlsxXSwgcGJbMl0pO1xuICAgICAgICAgIGNvbnN0IGFvID0gaXNPcGFxdWUoYSksIGJvID0gaXNPcGFxdWUoYik7XG4gICAgICAgICAgaWYgKGFvID09PSBibykgY29udGludWU7XG4gICAgICAgICAgY29uc3QgYUluc2lkZSA9IHNsaWNlID49IDAgJiYgc2xpY2UgPCBkZDtcbiAgICAgICAgICBjb25zdCBiSW5zaWRlID0gc2xpY2UgKyAxID49IDAgJiYgc2xpY2UgKyAxIDwgZGQ7XG4gICAgICAgICAgbGV0IHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG1hdDogbnVtYmVyLCBkaXI6IG51bWJlcjtcbiAgICAgICAgICBpZiAoYW8gJiYgIWJvICYmIGFJbnNpZGUpIHsgeCA9IHBhWzBdOyB5ID0gcGFbMV07IHogPSBwYVsyXTsgbWF0ID0gYTsgZGlyID0gMTsgfVxuICAgICAgICAgIGVsc2UgaWYgKGJvICYmICFhbyAmJiBiSW5zaWRlKSB7IHggPSBwYlswXTsgeSA9IHBiWzFdOyB6ID0gcGJbMl07IG1hdCA9IGI7IGRpciA9IC0xOyB9XG4gICAgICAgICAgZWxzZSBjb250aW51ZTtcbiAgICAgICAgICBjb25zdCB3eSA9IFlfTUlOICsgeTtcbiAgICAgICAgICBjb25zdCBzdXJmYWNlWSA9IGhlaWdodHNbeiAqIENIVU5LX1NJWkUgKyB4XSArIFlfTUlOO1xuICAgICAgICAgIGNvbnN0IGRlcHRoID0gc3VyZmFjZVkgLSAod3kgKyAxKTtcbiAgICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICAgIGlmIChheGlzID09PSAxICYmIGRpciA+IDApIHZhcmlhbnQgPSBoZWlnaHRCYW5kKHd5KTtcbiAgICAgICAgICBlbHNlIGlmIChheGlzID09PSAxICYmIGRpciA8IDApIHZhcmlhbnQgPSAxNTtcbiAgICAgICAgICBlbHNlIHZhcmlhbnQgPSAoTWF0aC5tYXgoMCwgTWF0aC5taW4oNywgZGVwdGgpKSAmIDcpIHwgKHN0b25lVG9uZSh3eSkgPDwgMyk7XG4gICAgICAgICAgbWFza1tqICogZHUgKyBpXSA9IGtleUZvcihtYXQsIHZhcmlhbnQsIHNoYWRlQXQob3ggKyB4LCB3eSwgb3ogKyB6LCBzZWVkKSwgYXhpcywgZGlyKTtcbiAgICAgICAgICBhbnkgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIWFueSkgY29udGludWU7XG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGR2OyBqKyspIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkdTspIHtcbiAgICAgICAgICBjb25zdCBrZXkgPSBtYXNrW2ogKiBkdSArIGldO1xuICAgICAgICAgIGlmICgha2V5KSB7IGkrKzsgY29udGludWU7IH1cbiAgICAgICAgICBsZXQgdyA9IDE7XG4gICAgICAgICAgd2hpbGUgKGkgKyB3IDwgZHUgJiYgbWFza1tqICogZHUgKyBpICsgd10gPT09IGtleSkgdysrO1xuICAgICAgICAgIGxldCBoID0gMTtcbiAgICAgICAgICBvdXRlcjogd2hpbGUgKGogKyBoIDwgZHYpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGsgPSAwOyBrIDwgdzsgaysrKSBpZiAobWFza1soaiArIGgpICogZHUgKyBpICsga10gIT09IGtleSkgYnJlYWsgb3V0ZXI7XG4gICAgICAgICAgICBoKys7XG4gICAgICAgICAgfVxuICAgICAgICAgIGZvciAobGV0IGpqID0gMDsgamogPCBoOyBqaisrKSBmb3IgKGxldCBpaSA9IDA7IGlpIDwgdzsgaWkrKykgbWFza1soaiArIGpqKSAqIGR1ICsgaSArIGlpXSA9IDA7XG4gICAgICAgICAgZW1pdFF1YWQoYXhpcywgKGtleSA+PiAxMikgJiAxID8gMSA6IC0xLCBzbGljZSwgaSwgaiwgdywgaCwga2V5KTtcbiAgICAgICAgICBpICs9IHc7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBwb3NpdGlvbnM6IHBvc2l0aW9ucy5kb25lKCksIG5vcm1hbHM6IG5vcm1hbHMuZG9uZSgpLCBjb2xvcnM6IGNvbG9ycy5kb25lKCksIG1hdHM6IG1hdHMuZG9uZSgpLFxuICAgIGluZGljZXM6IGluZGljZXMuc2xpY2UoMCwgaW5kZXhDb3VudCksIHRyaWFuZ2xlczogaW5kZXhDb3VudCAvIDMsXG4gIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTs7O0FDUW5CLFlBQVlBLFlBQVc7OztBQ0d2QixZQUFZLFdBQVc7OztBQ1p2QjtBQUFBLEVBQ0UsUUFBVTtBQUFBLEVBQ1YsTUFBUTtBQUFBLEVBQ1IsUUFBVTtBQUFBLEVBQ1YsUUFBVTtBQUFBLEVBQ1YsTUFBUTtBQUFBLEVBQ1IsV0FBYTtBQUFBLElBQ1gsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGNBQWdCO0FBQUEsTUFDZCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsYUFBZTtBQUFBLE1BQ2IsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztB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QU8sTUFBTSxtQkFBbUIsR0FBRyxHQUFHLENBQUMsRUFBRSxLQUFLLElBQUksR0FBRztBQUNyRCxTQUFPLFVBQVUsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLEdBQUcsT0FBTztBQUN4RCxDQUFDO0FBRUQsS0FBSyw0RUFBNEUsTUFBTTtBQUNyRixRQUFNLFFBQVEsWUFBWSxJQUFJO0FBQzlCLFFBQU0sT0FBTyxtQkFBbUIsT0FBTyxHQUFHLENBQUM7QUFDM0MsUUFBTSxJQUFJLEtBQUssTUFBTSxLQUFLLENBQUMsR0FBRyxJQUFJLEtBQUssTUFBTSxLQUFLLENBQUM7QUFDbkQsU0FBTyxHQUFHLFNBQVMsT0FBTyxHQUFHLEtBQUssUUFBUSxHQUFHLElBQUksS0FBSyxDQUFDO0FBQ3ZELFFBQU0sTUFBTSxTQUFTLGNBQWMsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxDQUFDO0FBQ3ZELGFBQVcsT0FBTyxHQUFHO0FBQ3JCLFNBQU8sTUFBTSxNQUFNLE9BQU8sTUFBTSxDQUFDO0FBQ2pDLHFCQUFtQixPQUFPLEdBQUcsQ0FBQztBQUM5QixTQUFPLE1BQU0sWUFBWSxPQUFPLGNBQWMsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxHQUFHO0FBQzdFLFNBQU8sVUFBVSxDQUFDLEdBQUcsTUFBTSxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQ2xELENBQUM7IiwKICAibmFtZXMiOiBbIlRIUkVFIiwgImMiLCAiYSIsICJiIiwgInNtb290aCIsICJUSFJFRSIsICJNIiwgIkgiXQp9Cg==
