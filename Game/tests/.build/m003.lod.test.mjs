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
  if (tileBuffers.length > 1) {
    let vertexCount = 0, indexCount = 0;
    for (const b of tileBuffers) {
      vertexCount += b.positions.length / 3;
      indexCount += b.indices.length;
    }
    const position = new Float32Array(vertexCount * 3), normal = new Float32Array(vertexCount * 3), color = new Float32Array(vertexCount * 3);
    const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    const ranges = [];
    let vo = 0, io = 0;
    for (let t = 0; t < tileBuffers.length; t++) {
      const b = tileBuffers[t];
      if (b.indices.length === 0) continue;
      position.set(b.positions, vo * 3);
      normal.set(b.normals, vo * 3);
      color.set(b.colors, vo * 3);
      for (let k = 0; k < b.indices.length; k++) index[io + k] = b.indices[k] + vo;
      const box = new THREE3.Box3();
      for (let k = 0; k < b.positions.length; k += 3) {
        _boxPoint.set(b.positions[k], b.positions[k + 1], b.positions[k + 2]);
        box.expandByPoint(_boxPoint);
      }
      ranges.push({ t, start: io, count: b.indices.length, box });
      vo += b.positions.length / 3;
      io += b.indices.length;
    }
    const shared = {
      position: new THREE3.BufferAttribute(position, 3),
      normal: new THREE3.BufferAttribute(normal, 3),
      color: new THREE3.BufferAttribute(color, 3),
      index: new THREE3.BufferAttribute(index, 1)
    };
    for (const r of ranges) {
      const geometry = new THREE3.BufferGeometry();
      geometry.setAttribute("position", shared.position);
      geometry.setAttribute("normal", shared.normal);
      geometry.setAttribute("color", shared.color);
      geometry.setIndex(shared.index);
      geometry.setDrawRange(r.start, r.count);
      geometry.boundingBox = r.box;
      geometry.boundingSphere = r.box.getBoundingSphere(new THREE3.Sphere());
      const mesh = new THREE3.Mesh(geometry, material);
      mesh.name = `macro_lod_tile_${r.t % tilesPerSide}_${Math.floor(r.t / tilesPerSide)}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.userData.macroRange = { start: r.start, count: r.count };
      meshes.push(mesh);
      triangles += r.count / 3;
    }
  }
  for (let t = 0; t < tileBuffers.length && tileBuffers.length === 1; t++) {
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
var _boxPoint = new THREE3.Vector3();

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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMy5sb2QudGVzdC50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3JlbmRlci93YXRlci50cyIsICIuLi8uLi9zcmMvZGF0YS9wYWxldHRlLmpzb24iLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS9ub2lzZS50cyIsICIuLi8uLi9zcmMvc2ltL2h5ZHJvbG9neS50cyIsICIuLi8uLi9zcmMvc2ltL21hdGVyaWFscy50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4tdjIudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3ZveGVsLWNvbG9ycy50cyIsICIuLi8uLi9zcmMvcmVuZGVyL21lc2hlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCB7IGJ1aWxkTWFjcm9NZXNoLCBzYW1wbGVNYWNyb1RlcnJhaW4gfSBmcm9tICcuLi9zcmMvcmVuZGVyL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgTUFULCBjcmVhdGVXb3JsZCwgZW5zdXJlQ2h1bmssIGV2aWN0Q2h1bmssIHNldFZveGVsLCBzdXJmYWNlQXQsIHN1cmZhY2VIZWlnaHRBdCxcbiAgdG9wTWF0ZXJpYWxBdFdvcmxkLCB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbn0gZnJvbSAnLi4vc3JjL3NpbS93b3JsZCc7XG5cbnRlc3QoJ21hY3JvIHNhbXBsaW5nIHJlYWRzIGF1dGhvcml0YXRpdmUgZWRpdGVkIGhlaWdodC9tYXRlcmlhbCB3aXRob3V0IHNjYW5uaW5nIHVuZWRpdGVkIGNodW5rcycsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgZWRpdGVkID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgY29uc3QgeCA9IE1hdGgucm91bmQoZWRpdGVkLngpLCB6ID0gTWF0aC5yb3VuZChlZGl0ZWQueik7XG4gIGNvbnN0IGJlZm9yZUNodW5rcyA9IHdvcmxkLmNodW5rcy5zaXplO1xuICBjb25zdCB1bnRvdWNoZWQgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDgpO1xuICBjb25zdCBvcmlnaW5hbCA9IHN1cmZhY2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB4LCB6KSA+PSAyID8gTUFULkdSQVNTIDogTUFULlNUT05FO1xuXG4gIGFzc2VydC5lcXVhbChlZGl0ZWQuaGVpZ2h0LCBzdXJmYWNlSGVpZ2h0QXQod29ybGQuc2VlZCwgeCwgeikpO1xuICBhc3NlcnQuZXF1YWwod29ybGQuY2h1bmtzLnNpemUsIDAsICdiYXNlIG1hY3JvIHNhbXBsaW5nIG11c3Qgbm90IG1hdGVyaWFsaXplIGNodW5rcycpO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIGVkaXRlZC5oZWlnaHQsIHosIE1BVC5PUkUpKTtcbiAgY29uc3QgYWZ0ZXIgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDApO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIuaGVpZ2h0LCBlZGl0ZWQuaGVpZ2h0ICsgMSk7XG4gIGFzc2VydC5lcXVhbChhZnRlci50b3AsIE1BVC5PUkUpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIudW5kZXJ3YXRlciwgZmFsc2UpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgOCksIHVudG91Y2hlZCk7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5jaHVua3Muc2l6ZSwgYmVmb3JlQ2h1bmtzICsgMSwgJ29ubHkgdGhlIGVkaXRlZCBjaHVuayBzaG91bGQgYmUgbWF0ZXJpYWxpemVkJyk7XG4gIGFzc2VydC5ub3RFcXVhbChvcmlnaW5hbCwgTUFULk9SRSk7XG59KTtcblxudGVzdCgnZWRpdCByZXZlcnNhbCBhbmQgY2h1bmsgZXZpY3Rpb24gaW52YWxpZGF0ZSBtYWNybyB2YWx1ZXMgYW5kIHJlc3RvcmUgZGVsdGFzJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKDEzMzcpO1xuICBjb25zdCBjZWxsID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgY29uc3QgeCA9IE1hdGgucm91bmQoY2VsbC54KSwgeiA9IE1hdGgucm91bmQoY2VsbC56KTtcbiAgY29uc3Qgb3JpZ2luYWwgPSB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIHgsIHopO1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk7XG5cbiAgYXNzZXJ0Lm9rKHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBNQVQuU1RPTkUpKTtcbiAgY29uc3QgZWRpdGVkID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKGVkaXRlZC5oZWlnaHQsIHkgKyAxKTtcbiAgYXNzZXJ0LmVxdWFsKGVkaXRlZC50b3AsIE1BVC5TVE9ORSk7XG4gIGV2aWN0Q2h1bmsod29ybGQsIGtleSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKSwgZWRpdGVkLCAnZXZpY3Rpb24gbG9zZXMgdGhlIGR1cmFibGUgZWRpdCcpO1xuXG4gIGFzc2VydC5vayhzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgTUFULkFJUikpO1xuICBldmljdENodW5rKHdvcmxkLCBrZXkpO1xuICBhc3NlcnQuZXF1YWwoc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKS5oZWlnaHQsIHkpO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIHkgLSAxLCB6LCBvcmlnaW5hbCA9PT0gTUFULk9SRSA/IE1BVC5TVE9ORSA6IE1BVC5PUkUpKTtcbiAgY29uc3QgbWF0ZXJpYWxFZGl0ID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgYXNzZXJ0Lm5vdEVxdWFsKG1hdGVyaWFsRWRpdC50b3AsIG9yaWdpbmFsKTtcbiAgYXNzZXJ0LmVxdWFsKHNldFZveGVsKHdvcmxkLCB4LCB5IC0gMSwgeiwgb3JpZ2luYWwpLCB0cnVlKTtcbiAgY29uc3QgcmV2ZXJzZWQgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDApO1xuICBhc3NlcnQuZXF1YWwocmV2ZXJzZWQuaGVpZ2h0LCB5KTtcbiAgYXNzZXJ0LmVxdWFsKHJldmVyc2VkLnRvcCwgb3JpZ2luYWwpO1xufSk7XG5cbnRlc3QoJ21hcCBtYWNybyBtZXNoIGluY2x1ZGVzIHRoZSBuZWFyIGVkaXRlZCBlYXJ0aHdvcmsgYXQgZnVsbCBzdXJmYWNlIGhlaWdodCcsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgY2VsbCA9IHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCk7XG4gIGNvbnN0IHggPSBNYXRoLnJvdW5kKGNlbGwueCksIHogPSBNYXRoLnJvdW5kKGNlbGwueik7XG4gIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIE1BVC5TVE9ORSkpO1xuXG4gIGNvbnN0IG1lc2hIZWlnaHQgPSAobWVzaDogUmV0dXJuVHlwZTx0eXBlb2YgYnVpbGRNYWNyb01lc2g+WydtZXNoJ10pOiBudW1iZXIgPT4ge1xuICAgIGxldCBoZWlnaHQgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gICAgY29uc3QgcG9zaXRpb24gPSBtZXNoLmdlb21ldHJ5LmdldEF0dHJpYnV0ZSgncG9zaXRpb24nKTtcbiAgICBjb25zdCBub3JtYWwgPSBtZXNoLmdlb21ldHJ5LmdldEF0dHJpYnV0ZSgnbm9ybWFsJyk7XG4gICAgLy8gTWFjcm8gZ2VvbWV0cnkgaXMgbm9uLWluZGV4ZWQ6IGVhY2ggcXVhZCBvd25zIGZvdXIgY29uc2VjdXRpdmUgdmVydGljZXMuXG4gICAgLy8gUHJvYmUgaXRzIGZpcnN0IGNvcm5lciBzbyBuZWlnaGJvcmluZyBjZWxscycgc2hhcmVkIHZlcnRpY2VzIGNhbm5vdCBtYXRjaC5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBvc2l0aW9uLmNvdW50OyBpICs9IDQpIHtcbiAgICAgIGlmIChwb3NpdGlvbi5nZXRYKGkpID09PSBjZWxsLnggLSA0ICYmIHBvc2l0aW9uLmdldFooaSkgPT09IGNlbGwueiAtIDQgJiYgbm9ybWFsLmdldFkoaSkgPT09IDEpIHtcbiAgICAgICAgaGVpZ2h0ID0gTWF0aC5tYXgoaGVpZ2h0LCBwb3NpdGlvbi5nZXRZKGkpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGhlaWdodDtcbiAgfTtcbiAgY29uc3Qgd2l0aEhvbGUgPSBidWlsZE1hY3JvTWVzaCh3b3JsZCwge1xuICAgIHN0ZXA6IDgsIGhvbGU6IHtcbiAgICAgIG1pblg6IGNlbGwueCAtIDQsIG1heFg6IGNlbGwueCArIDQsIG1pblo6IGNlbGwueiAtIDQsIG1heFo6IGNlbGwueiArIDQsXG4gICAgfSxcbiAgfSk7XG4gIGNvbnN0IG1hcCA9IGJ1aWxkTWFjcm9NZXNoKHdvcmxkLCB7IHN0ZXA6IDggfSk7XG4gIGFzc2VydC5lcXVhbChtZXNoSGVpZ2h0KHdpdGhIb2xlLm1lc2gpLCBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFksICd3b3JsZCBuZWFyIHJpbmcgc2hvdWxkIG93biB0aGUgaG9sZScpO1xuICBhc3NlcnQuZXF1YWwobWVzaEhlaWdodChtYXAubWVzaCksIHkgKyAxLCAnbWFwIG11c3Qgbm90IGhpZGUgdGhlIGVkaXRlZCBlYXJ0aHdvcmsnKTtcbiAgd2l0aEhvbGUubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gIG1hcC5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbn0pO1xuXG50ZXN0KCdzYW1lLXNlZWQgd29ybGRzIGFuZCB1bnJlbGF0ZWQgZWRpdHMgZG8gbm90IHNoYXJlIGVkaXRlZCBtYWNybyBjYWNoZXMnLCAoKSA9PiB7XG4gIGNvbnN0IGEgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgYiA9IGNyZWF0ZVdvcmxkKDEzMzcpO1xuICBjb25zdCBiYXNlID0gc2FtcGxlTWFjcm9UZXJyYWluKGEsIDAsIDApO1xuICBjb25zdCB4ID0gTWF0aC5yb3VuZChiYXNlLngpLCB6ID0gTWF0aC5yb3VuZChiYXNlLnopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwoYSwgeCwgYmFzZS5oZWlnaHQsIHosIE1BVC5PUkUpKTtcbiAgYXNzZXJ0LmVxdWFsKHNhbXBsZU1hY3JvVGVycmFpbihhLCAwLCAwKS50b3AsIE1BVC5PUkUpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHNhbXBsZU1hY3JvVGVycmFpbihiLCAwLCAwKSwgYmFzZSwgJ2Fub3RoZXIgd29ybGQgcmVjZWl2ZWQgdGhlIGVkaXQnKTtcblxuICBjb25zdCBkaXN0YW50ID0gc2FtcGxlTWFjcm9UZXJyYWluKGEsIDMyLCAwKTtcbiAgY29uc3QgZHggPSBNYXRoLnJvdW5kKGRpc3RhbnQueCksIGR6ID0gTWF0aC5yb3VuZChkaXN0YW50LnopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwoYSwgZHgsIGRpc3RhbnQuaGVpZ2h0LCBkeiwgTUFULlNUT05FKSk7XG4gIGFzc2VydC5lcXVhbChzYW1wbGVNYWNyb1RlcnJhaW4oYSwgMCwgMCkudG9wLCBNQVQuT1JFKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChzYW1wbGVNYWNyb1RlcnJhaW4oYiwgMzIsIDApLCBkaXN0YW50KTtcbn0pO1xuXG50ZXN0KCdhbiBldmljdGVkIGVkaXRlZCBjaHVuayBpcyB0aGUgb25seSBjaHVuayBtYXRlcmlhbGl6ZWQgYnkgbWFjcm8gc2FtcGxpbmcnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoMTMzNyk7XG4gIGNvbnN0IGNlbGwgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDApO1xuICBjb25zdCB4ID0gTWF0aC5yb3VuZChjZWxsLngpLCB6ID0gTWF0aC5yb3VuZChjZWxsLnopO1xuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIGNlbGwuaGVpZ2h0LCB6LCBNQVQuU1RPTkUpKTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk7XG4gIGV2aWN0Q2h1bmsod29ybGQsIGtleSk7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5jaHVua3Muc2l6ZSwgMCk7XG4gIHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCk7XG4gIGFzc2VydC5lcXVhbChlbnN1cmVDaHVuayh3b3JsZCwgd29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk/LmtleSwga2V5KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChbLi4ud29ybGQuY2h1bmtzLmtleXMoKV0sIFtrZXldKTtcbn0pO1xuIiwgIi8vIFJlbmRlciBsYXllciBcdTIwMTQgY2h1bmtlZCAzRCB2b3hlbCBtZXNoZXIgKyBzdHJlYW1pbmcgKyBtYWNybyBMT0QuXG4vL1xuLy8gVGhlIHZpc2libGUgc3VyZmFjZSBpcyBkZXJpdmVkIGZyb20gdGhlIHNpbSdzIG9jY3VwYW5jeS9tYXRlcmlhbCB2b2x1bWUuXG4vLyBOZWFyIGNodW5rcyBhcmUgbWVzaGVkIGF0IDEgbSB3aXRoIGdyZWVkeSBmYWNlIG1lcmdpbmc7IHRoZSBmYXIgbGFuZHNjYXBlIGlzXG4vLyBhbiA4IG0gKHdvcmxkKSAvIDggbSAobWFwKSBtYWNybyBMT0Qgc2FtcGxlZCBmcm9tIHRoZSBzYW1lIGRldGVybWluaXN0aWNcbi8vIGdlbmVyYXRvci4gV2F0ZXIgaXMgYSBzaW5nbGUgc2VhLWxldmVsIHN1cmZhY2UgZGVyaXZlZCBmcm9tIHRoZSBzZWFiZWQgZGVwdGguXG4vL1xuLy8gTm8gYXByb24sIGhvcml6b24gcmluZyBvciBmb3VuZGF0aW9uIHNraXJ0OiB0aGUgd29ybGQgZWRnZSBpcyBvY2VhbiwgYW5kIHRoZVxuLy8gb2NlYW4gc3VyZmFjZSBleHRlbmRzIGZhciBiZXlvbmQgdGhlIDIwNDggbSBwbGF5YWJsZSBpc2xhbmQuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQgeyBtZXNoQ2h1bmtXYXRlciwgaW5zdGFsbEZhcldhdGVySG9sZSwgd2F0ZXJUaW1lIH0gZnJvbSAnLi93YXRlcic7XG5pbXBvcnQgeyBNZXNoQXJyYXlzLCBidWlsZFBhZGRlZCwgbWVzaFBhZGRlZCB9IGZyb20gJy4vbWVzaGVyJztcbmltcG9ydCB0eXBlIHsgQ2h1bmtXb3JrZXJQb29sIH0gZnJvbSAnLi9jaHVuay1wb29sJztcbmltcG9ydCB7XG4gIFdvcmxkLCBWb3hlbENodW5rLCBNYXRJZCwgU3VyZmFjZVNhbXBsZSwgR0VORVJBVE9SX1ZFUlNJT04sXG4gIFdPUkxEX1NJWkUsIEhBTEYsIENIVU5LX1NJWkUsIENIVU5LU19QRVJfU0lERSwgQ0hVTktfQVJFQSwgV09STERfSEVJR0hULFxuICBZX01JTiwgWV9NQVgsIFNFQV9MRVZFTCwgTUFULCBpc09wYXF1ZSxcbiAgY2h1bmtLZXksIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgd29ybGRUb0xvY2FsWCwgd29ybGRUb0xvY2FsWixcbiAgZ2V0Vm94ZWwsIGVuc3VyZUNodW5rLCBldmljdENodW5rLCBoYXNoMmksIGZibTIsXG4gIGVkaXRWZXJzaW9uLCBiYXNlSGVpZ2h0QXQsIGJhc2VUb3BNYXRlcmlhbEZvciwgaW5zdGFsbEJhc2VDaHVuaywgc2VlZEJhc2VDb2x1bW5zLFxufSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5pbXBvcnQge1xuICBNLCBILCBjb2xvckNhY2hlLCBjLCBDT0wsIFNIQURFLCBNQVhfUEVSRl9TQU1QTEVTLCByZWNvcmRTYW1wbGUsIHBlcmNlbnRpbGUsIGhlaWdodEJhbmQsIHN0b25lVG9uZSwgc2hhZGVBdCwga2V5Rm9yLCBmYWNlQ29sb3JDYWNoZSwgY29sb3JGb3JLZXksXG59IGZyb20gJy4vdm94ZWwtY29sb3JzJztcblxuY29uc3QgdGVycmFpbk1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICB2ZXJ0ZXhDb2xvcnM6IHRydWUsXG4gIHNpZGU6IFRIUkVFLkZyb250U2lkZSxcbn0pO1xudGVycmFpbk1hdGVyaWFsLm9uQmVmb3JlQ29tcGlsZSA9IChzaGFkZXIpID0+IHtcbiAgc2hhZGVyLnZlcnRleFNoYWRlciA9IHNoYWRlci52ZXJ0ZXhTaGFkZXJcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCAnI2luY2x1ZGUgPGNvbW1vbj5cXG5hdHRyaWJ1dGUgZmxvYXQgYU1hdDtcXG52YXJ5aW5nIHZlYzMgdldQb3M7XFxudmFyeWluZyB2ZWMzIHZXTnJtO1xcbnZhcnlpbmcgZmxvYXQgdk1hdDsnKVxuICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PicsICcjaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxcbnZXUG9zID0gKG1vZGVsTWF0cml4ICogdmVjNCh0cmFuc2Zvcm1lZCwgMS4wKSkueHl6O1xcbnZXTnJtID0gbm9ybWFsaXplKG1hdDMobW9kZWxNYXRyaXgpICogb2JqZWN0Tm9ybWFsKTtcXG52TWF0ID0gYU1hdDsnKTtcbiAgc2hhZGVyLmZyYWdtZW50U2hhZGVyID0gc2hhZGVyLmZyYWdtZW50U2hhZGVyXG4gICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgYCNpbmNsdWRlIDxjb21tb24+XG52YXJ5aW5nIHZlYzMgdldQb3M7XG52YXJ5aW5nIHZlYzMgdldOcm07XG52YXJ5aW5nIGZsb2F0IHZNYXQ7XG5mbG9hdCBoMjEodmVjMiBwKSB7IHJldHVybiBmcmFjdChzaW4oZG90KHAsIHZlYzIoMTI3LjEsIDMxMS43KSkpICogNDM3NTguNTQ1MzEyMyk7IH1cbmZsb2F0IHZuMih2ZWMyIHApIHtcbiAgdmVjMiBpID0gZmxvb3IocCk7IHZlYzIgZiA9IGZyYWN0KHApOyBmID0gZiAqIGYgKiAoMy4wIC0gMi4wICogZik7XG4gIHJldHVybiBtaXgobWl4KGgyMShpKSwgaDIxKGkgKyB2ZWMyKDEuMCwgMC4wKSksIGYueCksXG4gICAgICAgICAgICAgbWl4KGgyMShpICsgdmVjMigwLjAsIDEuMCkpLCBoMjEoaSArIHZlYzIoMS4wLCAxLjApKSwgZi54KSwgZi55KTtcbn1gKVxuICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29sb3JfZnJhZ21lbnQ+JywgYCNpbmNsdWRlIDxjb2xvcl9mcmFnbWVudD5cbntcbiAgdmVjMyBuID0gbm9ybWFsaXplKHZXTnJtKTtcbiAgZmxvYXQgdmVydCA9IDEuMCAtIHNtb290aHN0ZXAoMC4zNSwgMC43MCwgYWJzKG4ueSkpO1xuICBmbG9hdCBpc0dyYXNzID0gKCh2TWF0ID4gMC41ICYmIHZNYXQgPCAxLjUpIHx8ICh2TWF0ID4gOC41ICYmIHZNYXQgPCA5LjUpKSA/IDEuMCA6IDAuMDtcbiAgZmxvYXQgaXNTdG9uZSA9ICgodk1hdCA+IDQuNSAmJiB2TWF0IDwgNi41KSB8fCAodk1hdCA+IDcuNSAmJiB2TWF0IDwgOC41KSkgPyAxLjAgOiAwLjA7XG5cbiAgZmxvYXQgaG9yaXogPSBhYnMobi54KSA+IGFicyhuLnopID8gdldQb3MueiA6IHZXUG9zLng7XG4gIGZsb2F0IHJvdyA9IGZsb29yKHZXUG9zLnkpO1xuICBmbG9hdCBjb2wgPSBmbG9vcihob3Jpeik7XG4gIGZsb2F0IGggPSBoMjEodmVjMihjb2wsIHJvdykpO1xuICB2ZWMyIGYgPSB2ZWMyKGZyYWN0KGhvcml6KSwgZnJhY3QodldQb3MueSkpO1xuICBmbG9hdCBqb2ludCA9IHNtb290aHN0ZXAoMC4wLCAwLjA1NSwgbWluKGYueCwgMS4wIC0gZi54KSlcbiAgICAgICAgICAgICAgKiBzbW9vdGhzdGVwKDAuMCwgMC4wNTAsIG1pbihmLnksIDEuMCAtIGYueSkpO1xuICB2ZWMzIHN0b25lID0gbWl4KHZlYzMoMC42MiwgMC42MiwgMC41OCksIHZlYzMoMS4wNCwgMS4wMiwgMC45NSksIGgpO1xuICBzdG9uZSAqPSBtaXgoMC45MCwgMS4wLCBqb2ludCk7XG4gIHN0b25lICo9IG1peCgwLjkzLCAxLjAsIHNtb290aHN0ZXAoMC4wLCAwLjMwLCBmLnkpKTtcbiAgZGlmZnVzZUNvbG9yLnJnYiAqPSBtaXgodmVjMygxLjApLCBzdG9uZSwgdmVydCAqIGlzU3RvbmUpO1xuXG4gIGZsb2F0IGd5ID0gc21vb3Roc3RlcCgwLjQ1LCAwLjg4LCBhYnMobi55KSk7XG4gIGZsb2F0IGcxID0gdm4yKHZXUG9zLnh6ICogMS4zNSk7XG4gIGZsb2F0IGcyID0gdm4yKHZXUG9zLnh6ICogMC4xMSk7XG4gIHZlYzMgZ3Jhc3MgPSBtaXgodmVjMygwLjgyLCAwLjg2LCAwLjcyKSwgdmVjMygxLjA2LCAxLjA0LCAwLjk4KSwgZzEgKiAwLjQyICsgZzIgKiAwLjQ2ICsgdm4yKHZXUG9zLnh6ICogNC4zKSAqIDAuMTIpO1xuICBmbG9hdCBjZWxsID0gaDIxKGZsb29yKHZXUG9zLnh6KSArIDE3LjApO1xuICBncmFzcyAqPSAwLjk1ICsgMC4xMCAqIGNlbGw7XG4gIGRpZmZ1c2VDb2xvci5yZ2IgKj0gbWl4KHZlYzMoMS4wKSwgZ3Jhc3MsIGd5ICogaXNHcmFzcyk7XG59YCk7XG59O1xuXG5pbnRlcmZhY2UgTWVzaFJlc3VsdCB7IGdlb21ldHJ5OiBUSFJFRS5CdWZmZXJHZW9tZXRyeTsgdHJpYW5nbGVzOiBudW1iZXI7IH1cblxuLyoqIEJ1aWxkIGEgQnVmZmVyR2VvbWV0cnkgZnJvbSBtZXNoZXIgb3V0cHV0IChtYWluIHRocmVhZCkuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VvbWV0cnlGcm9tQXJyYXlzKGE6IE1lc2hBcnJheXMpOiBNZXNoUmVzdWx0IHtcbiAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYS5wb3NpdGlvbnMsIDMpKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdub3JtYWwnLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEubm9ybWFscywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhLmNvbG9ycywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2FNYXQnLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEubWF0cywgMSkpO1xuICBnZW9tZXRyeS5zZXRJbmRleChuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGEuaW5kaWNlcywgMSkpO1xuICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgcmV0dXJuIHsgZ2VvbWV0cnksIHRyaWFuZ2xlczogYS50cmlhbmdsZXMgfTtcbn1cblxuLyoqIFBhZGRlZCB2b2x1bWUgZm9yIGEgcmVzaWRlbnQgY2h1bms7IG5laWdoYm91cnMgY29tZSBmcm9tIHRoZSB3b3JsZCAoM3gzIG11c3QgYmUgcmVzaWRlbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhZGRlZEZvcih3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogVWludDhBcnJheSB7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICByZXR1cm4gYnVpbGRQYWRkZWQoY2h1bmsuZGF0YSwgKHgsIHksIHopID0+IGdldFZveGVsKHdvcmxkLCBveCArIHgsIFlfTUlOICsgeSwgb3ogKyB6KSk7XG59XG5cbi8qKlxuICogR3JlZWR5IDNEIGZhY2UgbWVzaGVyIChzeW5jaHJvbm91cyBwYXRoKS4gQSBmYWNlIGlzIGVtaXR0ZWQgd2hlbiBhbiBvcGFxdWVcbiAqIHZveGVsIHRvdWNoZXMgYSBub24tb3BhcXVlIGNlbGwgKGFpciBvciB3YXRlcik7IHdhdGVyIHN1cmZhY2VzIGFyZSBtZXNoZWRcbiAqIHNlcGFyYXRlbHkgaW4gd2F0ZXIudHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXNoQ2h1bmsod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IE1lc2hSZXN1bHQge1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgcmV0dXJuIGdlb21ldHJ5RnJvbUFycmF5cyhtZXNoUGFkZGVkKHBhZGRlZEZvcih3b3JsZCwgY2h1bmspLCBjaHVuay5oZWlnaHRzLCBveCwgb3osIHdvcmxkLnNlZWQpKTtcbn1cblxuLyoqXG4gKiBHcmlkIGxpbmVzIG9mIHRoZSBzZWEgcGxhbmU6IHRoZSBvcmlnaW5hbCBgc2VnbWVudHNgIGxhdHRpY2Ugb3ZlciB0aGVcbiAqIGlzbGFuZCBwbHVzIHR3byBjZWxscyBvZiBtYXJnaW4gKHNhbWUgdmVydGljZXMsIHNvIHRoZSBzYW1lIGNvbG91cnMpLCB0aGVuXG4gKiBsaW5lcyB0aGF0IGRvdWJsZSB0aGVpciBzcGFjaW5nIG91dCB0byB0aGUgcGxhbmUgZWRnZS4gT3BlbiBvY2VhbiBmYXJcbiAqIGJleW9uZCB0aGUgMjA0OCBtIGlzbGFuZCBpcyBmbGF0LCBmb2dnZWQgYW5kIG5lZWRzIG5vIDIwOCBtIHZlcnRleCBncmlkO1xuICogdGhpcyBrZWVwcyB0aGUgbmVhciBwYXR0ZXJuIGFuZCBkcm9wcyBhYm91dCA5MCUgb2YgdGhlIHRyaWFuZ2xlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyR3JpZExpbmVzKHNpemU6IG51bWJlciwgc2VnbWVudHM6IG51bWJlcik6IG51bWJlcltdIHtcbiAgY29uc3Qgc2VnID0gc2l6ZSAvIHNlZ21lbnRzLCBjb29yZCA9IChrOiBudW1iZXIpID0+IC1zaXplIC8gMiArIGsgKiBzZWc7XG4gIGNvbnN0IGlubmVyOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBrID0gMDsgayA8PSBzZWdtZW50czsgaysrKSBpZiAoTWF0aC5hYnMoY29vcmQoaykpIDw9IEhBTEYgKyAyICogc2VnKSBpbm5lci5wdXNoKGspO1xuICBpZiAoaW5uZXIubGVuZ3RoID09PSAwKSByZXR1cm4gWzAsIHNlZ21lbnRzXS5tYXAoY29vcmQpO1xuICBjb25zdCBrZWVwID0gbmV3IFNldChpbm5lcik7XG4gIGZvciAobGV0IGsgPSBpbm5lclswXSwgcyA9IDE7IGsgPiAwOyBzICo9IDIpIHsgayA9IE1hdGgubWF4KDAsIGsgLSBzKTsga2VlcC5hZGQoayk7IH1cbiAgZm9yIChsZXQgayA9IGlubmVyW2lubmVyLmxlbmd0aCAtIDFdLCBzID0gMTsgayA8IHNlZ21lbnRzOyBzICo9IDIpIHsgayA9IE1hdGgubWluKHNlZ21lbnRzLCBrICsgcyk7IGtlZXAuYWRkKGspOyB9XG4gIHJldHVybiBbLi4ua2VlcF0uc29ydCgoYSwgYikgPT4gYSAtIGIpLm1hcChjb29yZCk7XG59XG5cbmZ1bmN0aW9uIHdhdGVyR3JpZEdlb21ldHJ5KHNpemU6IG51bWJlciwgc2VnbWVudHM6IG51bWJlcik6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3QgbGluZXMgPSB3YXRlckdyaWRMaW5lcyhzaXplLCBzZWdtZW50cyksIG4gPSBsaW5lcy5sZW5ndGg7XG4gIGNvbnN0IHBvc2l0aW9ucyA9IG5ldyBGbG9hdDMyQXJyYXkobiAqIG4gKiAzKSwgbm9ybWFscyA9IG5ldyBGbG9hdDMyQXJyYXkobiAqIG4gKiAzKTtcbiAgZm9yIChsZXQgaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgY29uc3QgdiA9IChqICogbiArIGkpICogMztcbiAgICAgIHBvc2l0aW9uc1t2XSA9IGxpbmVzW2ldOyBwb3NpdGlvbnNbdiArIDJdID0gbGluZXNbal07XG4gICAgICBub3JtYWxzW3YgKyAxXSA9IDE7XG4gICAgfVxuICB9XG4gIGNvbnN0IGluZGljZXM6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGogPSAwOyBqIDwgbiAtIDE7IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbiAtIDE7IGkrKykge1xuICAgICAgY29uc3QgYSA9IGogKiBuICsgaSwgYiA9IChqICsgMSkgKiBuICsgaSwgYyA9IGEgKyAxLCBkID0gYiArIDE7XG4gICAgICBpbmRpY2VzLnB1c2goYSwgYiwgYywgYywgYiwgZCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGdlbyA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICBnZW8uc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUocG9zaXRpb25zLCAzKSk7XG4gIGdlby5zZXRBdHRyaWJ1dGUoJ25vcm1hbCcsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUobm9ybWFscywgMykpO1xuICBnZW8uc2V0SW5kZXgoaW5kaWNlcyk7XG4gIGdlby5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgcmV0dXJuIGdlbztcbn1cblxuLyoqIE9uZSBvcGFxdWUgc2VhLWxldmVsIHN1cmZhY2UgZm9yIHRoZSB3aG9sZSB2aWV3LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkV2F0ZXJTdXJmYWNlKHdvcmxkOiBXb3JsZCwgc2l6ZSA9IDIwMDAwLCBzZWdtZW50cyA9IDk2KTogVEhSRUUuTWVzaCB7XG4gIGNvbnN0IGdlbyA9IHdhdGVyR3JpZEdlb21ldHJ5KHNpemUsIHNlZ21lbnRzKTtcbiAgY29uc3QgcG9zID0gZ2VvLmF0dHJpYnV0ZXMucG9zaXRpb247XG4gIGNvbnN0IGNvbG9ycyA9IG5ldyBGbG9hdDMyQXJyYXkocG9zLmNvdW50ICogMyk7XG4gIGNvbnN0IHRtcCA9IG5ldyBUSFJFRS5Db2xvcigpO1xuICBjb25zdCBzbW9vdGhzdGVwID0gKGE6IG51bWJlciwgYjogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgICBjb25zdCB0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgKHggLSBhKSAvIChiIC0gYSkpKTtcbiAgICByZXR1cm4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcbiAgfTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwb3MuY291bnQ7IGkrKykge1xuICAgIGNvbnN0IHggPSBwb3MuZ2V0WChpKSwgeiA9IHBvcy5nZXRaKGkpO1xuICAgIC8vIFRoZSB3YXRlciBwbGFuZSBzYW1wbGVzIHRoZSBzZWFiZWQgb25seSBmb3IgYSBuYXJyb3cgc2hvcmUgcmltLiBBIGRlcHRoXG4gICAgLy8gcmFtcCBvbiBhIDQ3IG0gZ3JpZCBtaXNzZWQgdGhlIDEwIG0gcml2ZXIgZW50aXJlbHkgYW5kIHR1cm5lZCBpdCB3aGl0ZTtcbiAgICAvLyB0aGUgcml2ZXIgYW5kIGxha2UgcmVhZCBiZXR0ZXIgYXMgdGhlIHNhbWUgZGVlcCB3YXRlciBhcyB0aGUgc2VhLlxuICAgIGNvbnN0IGggPSBiYXNlSGVpZ2h0QXQod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIE1hdGgucm91bmQoeCksIE1hdGgucm91bmQoeikpO1xuICAgIGNvbnN0IHNob3JlID0gc21vb3Roc3RlcCgtMC45LCAtMC4xNSwgaCkgKiAoMSAtIHNtb290aHN0ZXAoLTAuMTUsIDAuNCwgaCkpO1xuICAgIGNvbnN0IG4gPSBoYXNoMmkoTWF0aC5mbG9vcih4IC8gNDUpLCBNYXRoLmZsb29yKHogLyA0NSksIHdvcmxkLnNlZWQgKyA1MDEpO1xuICAgIHRtcC5jb3B5KENPTC53YXRlck1pZCkubGVycChDT0wud2F0ZXJEZWVwLCAwLjM1ICsgMC4zNSAqIG4pO1xuICAgIC8vIEEgd2VhayBzaG9yZSB0aW50LiBBIHN0cm9uZyBvbmUsIHNhbXBsZWQgb24gYSBjb2Fyc2UgcGxhbmUsIHByb2R1Y2VkXG4gICAgLy8gcGFsZSByZWN0YW5nbGVzIG92ZXIgb2Zmc2hvcmUgc2VhbW91bnRzIGluIHRoZSBtYXAgdmlldy5cbiAgICB0bXAubGVycChDT0wud2F0ZXJSaW0sIHNob3JlICogMC4xNSk7XG4gICAgY29sb3JzW2kgKiAzXSA9IHRtcC5yOyBjb2xvcnNbaSAqIDMgKyAxXSA9IHRtcC5nOyBjb2xvcnNbaSAqIDMgKyAyXSA9IHRtcC5iO1xuICB9XG4gIGdlby5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShjb2xvcnMsIDMpKTtcbiAgLy8gT3BhcXVlOiB0aGUgc2VhLWxldmVsIHN1cmZhY2UgaXMgdGhlIHdhdGVyIHJlYWQuIEEgdHJhbnNsdWNlbnQgcGxhbmUgbGV0XG4gIC8vIHRoZSBtYWNybyBzZWFiZWQgc2hvdyB0aHJvdWdoLCB3aGljaCBtYWRlIHRoZSBmaW5pdGUgMjA0OCBtIHdvcmxkIGVkZ2VcbiAgLy8gdmlzaWJsZSBhcyBhIHNxdWFyZSBpbiB0aGUgZmlyc3QgTTAwMSBtYXAgY2FwdHVyZS5cbiAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlbywgbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICAgIHZlcnRleENvbG9yczogdHJ1ZSxcbiAgfSkpO1xuICBtZXNoLnBvc2l0aW9uLnkgPSAtMC4wNjtcbiAgbWVzaC5yZW5kZXJPcmRlciA9IDE7XG4gIG1lc2gubmFtZSA9ICd3YXRlcl9zdXJmYWNlJztcbiAgbWVzaC5yZWNlaXZlU2hhZG93ID0gZmFsc2U7XG4gIHJldHVybiBtZXNoO1xufVxuXG5pbnRlcmZhY2UgTWFjcm9Ib2xlIHsgbWluWDogbnVtYmVyOyBtYXhYOiBudW1iZXI7IG1pblo6IG51bWJlcjsgbWF4WjogbnVtYmVyOyB9XG4vKipcbiAqIERpc3RhbmNlIHRpZXJzIG9mIHRoZSB3b3JsZC12aWV3IG1hY3JvIG1lc2guIENlbGxzIHdpdGhpbiBgZmluZWAgbWV0cmVzXG4gKiAoQ2hlYnlzaGV2IGRpc3RhbmNlIG9mIHRoZWlyIGJsb2NrIGZyb20gdGhlIGZvY3VzKSBrZWVwIHRoZSBiYXNlIHN0ZXAsXG4gKiBjZWxscyB3aXRoaW4gYG1pZGAgbWV0cmVzIG1lcmdlIDJ4MiwgY2VsbHMgYmV5b25kIG1lcmdlIDR4NC4gQmxvY2tzIGFyZVxuICogNCBiYXNlIGNlbGxzIHdpZGUsIHNvIHRpZXIgYm91bmRhcmllcyBuZXZlciBzcGxpdCBhIGNvYXJzZSBjZWxsLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIE1hY3JvVGllcnMgeyBmaW5lOiBudW1iZXI7IG1pZDogbnVtYmVyIH1cbmV4cG9ydCBjb25zdCBERUZBVUxUX01BQ1JPX1RJRVJTOiBNYWNyb1RpZXJzID0geyBmaW5lOiA0NDgsIG1pZDogODk2IH07XG4vKiogU2lkZSAobSkgb2YgYSB3b3JsZC12aWV3IG1hY3JvIHRpbGU7IHRpbGVzIG91dHNpZGUgdGhlIGNhbWVyYSBmcnVzdHVtIGFyZSBub3QgZHJhd24uICovXG5leHBvcnQgY29uc3QgTUFDUk9fVElMRSA9IDI1NjtcblxuaW50ZXJmYWNlIE1hY3JvT3B0aW9ucyB7XG4gIHN0ZXA6IG51bWJlcjtcbiAgLyoqIFJlY3Rhbmd1bGFyIGhvbGUgY292ZXJlZCBieSB0aGUgbmVhciAxIG0gY2h1bmsgcmluZy4gKi9cbiAgaG9sZT86IE1hY3JvSG9sZTtcbiAgLyoqIFdvcmxkIHZpZXcgZm9jdXM7IHdpdGggaXQsIGZhciBjZWxscyB1c2UgY29hcnNlciB0aWVycyAobWFwIG1vZGUgcGFzc2VzIG5vbmUpLiAqL1xuICBmb2N1cz86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgdGllcnM/OiBNYWNyb1RpZXJzO1xufVxuXG5pbnRlcmZhY2UgTWFjcm9SZXN1bHQge1xuICAvKiogVGhlIHdob2xlIG1lc2ggd2hlbiB1bnRpbGVkIChubyBmb2N1cyk7IG90aGVyd2lzZSB0aGUgZmlyc3QgdGlsZS4gKi9cbiAgbWVzaDogVEhSRUUuTWVzaDtcbiAgLyoqIEV2ZXJ5IHRpbGUgbWVzaCAob25lIHdoZW4gdW50aWxlZCksIGVhY2ggd2l0aCBhIGJvdW5kaW5nIGJveCBmb3IgY3VsbGluZy4gKi9cbiAgbWVzaGVzOiBUSFJFRS5NZXNoW107XG4gIHRyaWFuZ2xlczogbnVtYmVyO1xuICBzYW1wbGVNczogbnVtYmVyO1xuICB0b3RhbE1zOiBudW1iZXI7XG4gIHNhbXBsZUNhY2hlZDogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIE1hY3JvU2FtcGxlQ2FjaGUge1xuICBOOiBudW1iZXI7XG4gIGhlaWdodHM6IEludDE2QXJyYXk7XG4gIHRvcHM6IFVpbnQ4QXJyYXk7XG4gIHVuZGVyd2F0ZXI6IFVpbnQ4QXJyYXk7XG4gIHNhbXBsZU1zOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWFjcm9UZXJyYWluU2FtcGxlIHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB0b3A6IE1hdElkOyB1bmRlcndhdGVyOiBib29sZWFuOyB9XG5cbi8vIENhY2hlIHRoZSBkZXRlcm1pbmlzdGljIGJhc2UgZ3JpZCBhbmQgdGhlIGF1dGhvcml0YXRpdmUgZWRpdGVkIGdyaWQgc2VwYXJhdGVseS5cbi8vIEJhc2UgZW50cmllcyBuZXZlciBuZWVkIGludmFsaWRhdGlvbi4gRWRpdGVkIGVudHJpZXMgYXJlIHNjb3BlZCBieSBXb3JsZCBpZGVudGl0eVxuLy8gKHR3byBzYW1lLXNlZWQgd29ybGRzIGNhbiBoYXZlIGRpZmZlcmVudCBlZGl0cykgYW5kIGJ5IGJvdGggdGhlIGNvYXJzZSBlZGl0XG4vLyByZXZpc2lvbiBhbmQgY2h1bmsgc3RyZWFtaW5nLCBzaW5jZSBldmljdGluZy9yZWdlbmVyYXRpbmcgZGF0YSBhbmQgc25hcHNob3Rcbi8vIHJlc3RvcmF0aW9uIGRvIG5vdCBuZWNlc3NhcmlseSBwcm9kdWNlIGEgbmV3IGNvYXJzZSByZXZpc2lvbi4gT25seSBjaHVua3Mgd2l0aFxuLy8gZHVyYWJsZSB2b3hlbCBkZWx0YXMgYXJlIG1hdGVyaWFsaXplZDsgdGhlIG90aGVyIDY0eDY0IGNlbGxzIHJlbWFpbiBiYXNlIHNhbXBsZXMuXG5pbnRlcmZhY2UgTWFjcm9Xb3JsZENhY2hlcyB7XG4gIGJhc2U6IE1hcDxudW1iZXIsIE1hY3JvU2FtcGxlQ2FjaGU+O1xuICBlZGl0ZWQ6IE1hcDxzdHJpbmcsIE1hY3JvU2FtcGxlQ2FjaGU+O1xuICAvKiogU3BhcnNlIGF1dGhvcml0YXRpdmUgY29sdW1ucywgaW5kZXBlbmRlbnQgb2YgdGhlIG1lc2ggc2FtcGxpbmcgcmVzb2x1dGlvbi4gKi9cbiAgY29sdW1uczogTWFwPHN0cmluZywgTWFwPG51bWJlciwgeyBoZWlnaHQ6IG51bWJlcjsgdG9wOiBNYXRJZCB9Pj47XG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5jb25zdCBtYWNyb1NhbXBsZUNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hY3JvV29ybGRDYWNoZXM+KCk7XG5cbmZ1bmN0aW9uIHN5bmNNYWNyb0NvbHVtbnMod29ybGQ6IFdvcmxkLCBjYWNoZXM6IE1hY3JvV29ybGRDYWNoZXMpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLnJldmlzaW9uID09PSBjYWNoZXMucmV2aXNpb24pIHJldHVybjtcbiAgLy8gU25hcHNob3QgcmVzdG9yZSByZXBsYWNlcyBlZGl0cyBhbmQgY2h1bmtzIGJlZm9yZSBhc3NpZ25pbmcgaXRzIHNhdmVkXG4gIC8vIHJldmlzaW9uLiBOZXZlciBtaXggcmVtZW1iZXJlZCBjb2x1bW5zIGZyb20gdGhhdCBwcmV2aW91cyB3b3JsZCBzdGF0ZS5cbiAgY2FjaGVzLmNvbHVtbnMuY2xlYXIoKTtcbiAgLy8gQSBub3JtYWwgZWRpdCBoYXMgYWxyZWFkeSB1cGRhdGVkIHRoZSBsb2FkZWQgY2h1bmssIHNvIGl0IGNvc3RzIG9ubHkgdGhlXG4gIC8vIGVkaXRlZCBjaHVua3MuIFJlc3RvcmVkL2V2aWN0ZWQgZWRpdGVkIGNodW5rcyBhcmUgZ2VuZXJhdGVkIG9uIGRlbWFuZC5cbiAgZm9yIChjb25zdCBba2V5LCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBpZiAoIWVkaXRzLnNpemUgfHwgIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgY29udGludWU7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSkhO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGNvbHVtbnMgPSBuZXcgTWFwPG51bWJlciwgeyBoZWlnaHQ6IG51bWJlcjsgdG9wOiBNYXRJZCB9PigpO1xuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgICAgY29sdW1ucy5zZXQoKG94ICsgbHggKyBIQUxGKSAqIFdPUkxEX1NJWkUgKyBveiArIGx6ICsgSEFMRiwge1xuICAgICAgICAgIGhlaWdodDogY2h1bmsuaGVpZ2h0c1tjb2xdICsgWV9NSU4gKyAxLFxuICAgICAgICAgIHRvcDogY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gYXMgTWF0SWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBjYWNoZXMuY29sdW1ucy5zZXQoa2V5LCBjb2x1bW5zKTtcbiAgfVxuICBjYWNoZXMuZWRpdGVkLmNsZWFyKCk7XG4gIGNhY2hlcy5yZXZpc2lvbiA9IHdvcmxkLnJldmlzaW9uO1xufVxuXG5mdW5jdGlvbiBtYWNyb0NvbHVtbih3b3JsZDogV29ybGQsIGNhY2hlczogTWFjcm9Xb3JsZENhY2hlcywga2V5OiBzdHJpbmcsIGluZGV4OiBudW1iZXIpIHtcbiAgbGV0IGNvbHVtbnMgPSBjYWNoZXMuY29sdW1ucy5nZXQoa2V5KTtcbiAgaWYgKGNvbHVtbnMpIHJldHVybiBjb2x1bW5zLmdldChpbmRleCk7XG4gIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGlmICghZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeikpIHJldHVybiB1bmRlZmluZWQ7XG4gIC8vIENhcHR1cmUgb25jZSBhZnRlciBsb2FkaW5nLiBMb2FkZWQgY2h1bmtzIGFyZSBjaGVhcCBhbmQgZG8gbm90IHJlcXVpcmVcbiAgLy8gd2Fsa2luZyBldmVyeSB2b3hlbDsgdGhpcyByZW1haW5zIE8oMzJ4MzIpIHBlciBlZGl0ZWQgY2h1bmsuXG4gIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpITtcbiAgY29sdW1ucyA9IG5ldyBNYXAoKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5zZXQoKG94ICsgbHggKyBIQUxGKSAqIFdPUkxEX1NJWkUgKyBveiArIGx6ICsgSEFMRiwge1xuICAgICAgICBoZWlnaHQ6IGNodW5rLmhlaWdodHNbY29sXSArIFlfTUlOICsgMSxcbiAgICAgICAgdG9wOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSBhcyBNYXRJZCxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBjYWNoZXMuY29sdW1ucy5zZXQoa2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnMuZ2V0KGluZGV4KTtcbn1cblxuY29uc3QgbWFjcm9FZGl0S2V5TWVtbyA9IG5ldyBXZWFrTWFwPFdvcmxkLCB7IHZlcnNpb246IG51bWJlcjsga2V5OiBzdHJpbmcgfT4oKTtcblxuLyoqIE1lbW9pemVkIGJ5IHRoZSB3b3JsZCdzIGVkaXQgdmVyc2lvbjogTygxKSBwZXIgZnJhbWUgdW5sZXNzIGVkaXRzIGNoYW5nZWQuICovXG5mdW5jdGlvbiBtYWNyb0VkaXRLZXkod29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgY29uc3QgdmVyc2lvbiA9IGVkaXRWZXJzaW9uKHdvcmxkKTtcbiAgY29uc3QgbWVtbyA9IG1hY3JvRWRpdEtleU1lbW8uZ2V0KHdvcmxkKTtcbiAgaWYgKG1lbW8gJiYgbWVtby52ZXJzaW9uID09PSB2ZXJzaW9uKSByZXR1cm4gbWVtby5rZXk7XG4gIGNvbnN0IGtleSA9IGNvbXB1dGVNYWNyb0VkaXRLZXkod29ybGQpO1xuICBtYWNyb0VkaXRLZXlNZW1vLnNldCh3b3JsZCwgeyB2ZXJzaW9uLCBrZXkgfSk7XG4gIHJldHVybiBrZXk7XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVNYWNyb0VkaXRLZXkod29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgLy8gSW5jbHVkZSBhIGNvbW11dGF0aXZlIGNvbnRlbnQgZmluZ2VycHJpbnQgYXMgd2VsbCBhcyBjb3VudDogZXZpY3Rpb24gYW5kXG4gIC8vIHNuYXBzaG90IHJlc3RvcmUgYnlwYXNzIHRoZSBjb2Fyc2UgV29ybGQucmV2aXNpb24gcGF0aCwgYW5kIGEgcmVzdG9yZWRcbiAgLy8gZGVsdGEgY2FuIGhhdmUgdGhlIHNhbWUgbnVtYmVyIG9mIGNlbGxzIHdpdGggZGlmZmVyZW50IGluZGljZXMvbWF0ZXJpYWxzLlxuICByZXR1cm4gWy4uLndvcmxkLmVkaXRzLmVudHJpZXMoKV1cbiAgICAuZmlsdGVyKChbLCBlZGl0c10pID0+IGVkaXRzLnNpemUgPiAwKVxuICAgIC5tYXAoKFtrZXksIGVkaXRzXSkgPT4ge1xuICAgICAgbGV0IHN1bSA9IDA7XG4gICAgICBsZXQgbWl4ZWQgPSAwO1xuICAgICAgZm9yIChjb25zdCBbaW5kZXgsIG1hdGVyaWFsXSBvZiBlZGl0cykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IE1hdGguaW11bChpbmRleCArIDEsIDMxKSArIG1hdGVyaWFsO1xuICAgICAgICBzdW0gPSAoc3VtICsgdmFsdWUpIHwgMDtcbiAgICAgICAgbWl4ZWQgPSAobWl4ZWQgXiBNYXRoLmltdWwodmFsdWUsIDB4NDVkOWYzYikpIHwgMDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJHtrZXl9OiR7ZWRpdHMuc2l6ZX06JHtzdW19OiR7bWl4ZWR9YDtcbiAgICB9KVxuICAgIC5zb3J0KClcbiAgICAuam9pbignfCcpO1xufVxuXG5mdW5jdGlvbiBlZGl0ZWRNYWNyb1NhbXBsZXMod29ybGQ6IFdvcmxkLCBzdGVwOiBudW1iZXIsIGNhY2hlOiBNYWNyb1NhbXBsZUNhY2hlKTogTWFjcm9TYW1wbGVDYWNoZSB7XG4gIGNvbnN0IGNhY2hlcyA9IG1hY3JvU2FtcGxlQ2FjaGUuZ2V0KHdvcmxkKSE7XG4gIGNvbnN0IGtleSA9IGAke3N0ZXB9OiR7bWFjcm9FZGl0S2V5KHdvcmxkKX1gO1xuICBjb25zdCBjYWNoZWQgPSBjYWNoZXMuZWRpdGVkLmdldChrZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuXG4gIGZvciAoY29uc3QgW2NodW5rLCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBpZiAoZWRpdHMuc2l6ZSAmJiAhY2FjaGVzLmNvbHVtbnMuaGFzKGNodW5rKSkgbWFjcm9Db2x1bW4od29ybGQsIGNhY2hlcywgY2h1bmssIDApO1xuICB9XG5cbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgeyBOLCBoZWlnaHRzLCB0b3BzLCB1bmRlcndhdGVyIH0gPSBjYWNoZTtcbiAgY29uc3Qgc2FtcGxlID0ge1xuICAgIE4sXG4gICAgaGVpZ2h0czogbmV3IEludDE2QXJyYXkoaGVpZ2h0cyksXG4gICAgdG9wczogbmV3IFVpbnQ4QXJyYXkodG9wcyksXG4gICAgdW5kZXJ3YXRlcjogbmV3IFVpbnQ4QXJyYXkodW5kZXJ3YXRlciksXG4gICAgc2FtcGxlTXM6IGNhY2hlLnNhbXBsZU1zLFxuICB9O1xuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCB4ID0gTWF0aC5yb3VuZCgtSEFMRiArIChpICsgMC41KSAqIHN0ZXApO1xuICAgICAgY29uc3QgeiA9IE1hdGgucm91bmQoLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwKTtcbiAgICAgIGNvbnN0IGNodW5rID0gY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk7XG4gICAgICBpZiAoIXdvcmxkLmVkaXRzLmdldChjaHVuayk/LnNpemUpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgaWR4ID0gaiAqIE4gKyBpO1xuICAgICAgY29uc3QgZWRpdGVkID0gbWFjcm9Db2x1bW4od29ybGQsIGNhY2hlcywgY2h1bmssICh4ICsgSEFMRikgKiBXT1JMRF9TSVpFICsgeiArIEhBTEYpO1xuICAgICAgaWYgKCFlZGl0ZWQpIGNvbnRpbnVlO1xuICAgICAgc2FtcGxlLmhlaWdodHNbaWR4XSA9IGVkaXRlZC5oZWlnaHQ7XG4gICAgICBzYW1wbGUudG9wc1tpZHhdID0gZWRpdGVkLnRvcDtcbiAgICAgIHNhbXBsZS51bmRlcndhdGVyW2lkeF0gPSBzYW1wbGUuaGVpZ2h0c1tpZHhdIDwgU0VBX0xFVkVMID8gMSA6IDA7XG4gICAgfVxuICB9XG4gIHNhbXBsZS5zYW1wbGVNcyA9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gIGNhY2hlcy5lZGl0ZWQuc2V0KGtleSwgc2FtcGxlKTtcbiAgcmV0dXJuIHNhbXBsZTtcbn1cblxuZnVuY3Rpb24gbWFjcm9TYW1wbGVzKHdvcmxkOiBXb3JsZCwgc3RlcDogbnVtYmVyKTogTWFjcm9TYW1wbGVDYWNoZSB7XG4gIGxldCBjYWNoZXMgPSBtYWNyb1NhbXBsZUNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGVzKSB7XG4gICAgY2FjaGVzID0geyBiYXNlOiBuZXcgTWFwKCksIGVkaXRlZDogbmV3IE1hcCgpLCBjb2x1bW5zOiBuZXcgTWFwKCksIHJldmlzaW9uOiAtMSB9O1xuICAgIG1hY3JvU2FtcGxlQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZXMpO1xuICB9XG4gIHN5bmNNYWNyb0NvbHVtbnMod29ybGQsIGNhY2hlcyk7XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlcy5iYXNlLmdldChzdGVwKTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGVkaXRlZE1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCwgY2FjaGVkKTtcblxuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBOID0gTWF0aC5jZWlsKFdPUkxEX1NJWkUgLyBzdGVwKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBJbnQxNkFycmF5KE4gKiBOKTtcbiAgY29uc3QgdG9wcyA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgdW5kZXJ3YXRlciA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgY2VsbFggPSAoaTogbnVtYmVyKSA9PiAtSEFMRiArIChpICsgMC41KSAqIHN0ZXA7XG4gIGNvbnN0IGNlbGxaID0gKGo6IG51bWJlcikgPT4gLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwO1xuXG4gIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgIGNvbnN0IHggPSBjZWxsWChpKSwgeiA9IGNlbGxaKGopO1xuICAgICAgY29uc3QgaCA9IGJhc2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbiwgTWF0aC5yb3VuZCh4KSwgTWF0aC5yb3VuZCh6KSk7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBoZWlnaHRzW2lkeF0gPSBoO1xuICAgICAgaWYgKGggPCBTRUFfTEVWRUwpIHVuZGVyd2F0ZXJbaWR4XSA9IDE7XG4gICAgfVxuICB9XG5cbiAgZm9yIChsZXQgaiA9IDA7IGogPCBOOyBqKyspIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgY29uc3QgaWR4ID0gaiAqIE4gKyBpO1xuICAgICAgaWYgKHVuZGVyd2F0ZXJbaWR4XSkgY29udGludWU7XG4gICAgICBjb25zdCBoID0gaGVpZ2h0c1tpZHhdO1xuICAgICAgY29uc3QgeCA9IGNlbGxYKGkpLCB6ID0gY2VsbFooaik7XG4gICAgICBsZXQgc2xvcGUgPSAwO1xuICAgICAgbGV0IG5lYXJXYXRlciA9IGZhbHNlO1xuICAgICAgY29uc3QgbnMgPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBucykge1xuICAgICAgICBjb25zdCBueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKE4gLSAxLCBpICsgZHgpKTtcbiAgICAgICAgY29uc3QgbnogPSBNYXRoLm1heCgwLCBNYXRoLm1pbihOIC0gMSwgaiArIGR6KSk7XG4gICAgICAgIGNvbnN0IG5oID0gaGVpZ2h0c1tueiAqIE4gKyBueF07XG4gICAgICAgIHNsb3BlID0gTWF0aC5tYXgoc2xvcGUsIE1hdGguYWJzKGggLSBuaCkpO1xuICAgICAgICBpZiAobmggPCBTRUFfTEVWRUwgKyAxKSBuZWFyV2F0ZXIgPSB0cnVlO1xuICAgICAgfVxuICAgICAgdG9wc1tpZHhdID0gYmFzZVRvcE1hdGVyaWFsRm9yKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgICAgICBNYXRoLnJvdW5kKHgpLCBNYXRoLnJvdW5kKHopLCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBjYWNoZTogTWFjcm9TYW1wbGVDYWNoZSA9IHtcbiAgICBOLCBoZWlnaHRzLCB0b3BzLCB1bmRlcndhdGVyLFxuICAgIHNhbXBsZU1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHQwLFxuICB9O1xuICBjYWNoZXMuYmFzZS5zZXQoc3RlcCwgY2FjaGUpO1xuICByZXR1cm4gZWRpdGVkTWFjcm9TYW1wbGVzKHdvcmxkLCBzdGVwLCBjYWNoZSk7XG59XG5cbi8qKiBBdXRob3JpdGF0aXZlIG1hY3JvLWdyaWQgdmFsdWUgYXQgYSB3b3JsZCBjb2x1bW4gKHN0ZXAgZGVmYXVsdHMgdG8gOCBtKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgc3RlcCA9IDgpOiBNYWNyb1RlcnJhaW5TYW1wbGUge1xuICBjb25zdCBjYWNoZSA9IG1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCk7XG4gIGNvbnN0IGkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjYWNoZS5OIC0gMSwgTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gc3RlcCkpKTtcbiAgY29uc3QgaiA9IE1hdGgubWF4KDAsIE1hdGgubWluKGNhY2hlLk4gLSAxLCBNYXRoLmZsb29yKCh6ICsgSEFMRikgLyBzdGVwKSkpO1xuICBjb25zdCBpZHggPSBqICogY2FjaGUuTiArIGk7XG4gIHJldHVybiB7XG4gICAgeDogLUhBTEYgKyAoaSArIDAuNSkgKiBzdGVwLFxuICAgIHo6IC1IQUxGICsgKGogKyAwLjUpICogc3RlcCxcbiAgICBoZWlnaHQ6IGNhY2hlLmhlaWdodHNbaWR4XSwgdG9wOiBjYWNoZS50b3BzW2lkeF0gYXMgTWF0SWQsXG4gICAgdW5kZXJ3YXRlcjogY2FjaGUudW5kZXJ3YXRlcltpZHhdICE9PSAwLFxuICB9O1xufVxuXG4vKipcbiAqIEZhciBsYW5kc2NhcGUgTE9EIGRlcml2ZWQgZnJvbSB0aGUgc2FtZSBkZXRlcm1pbmlzdGljIHN1cmZhY2Ugc2FtcGxlci5cbiAqIENlbGxzIGJlbG93IHNlYSBsZXZlbCBhcmUgb21pdHRlZDogdGhlIG9wYXF1ZSB3YXRlciBzdXJmYWNlIGlzIHRoZSBvbmx5XG4gKiB3YXRlciByZWFkLCBzbyB0aGUgZmluaXRlIDIwNDggbSB3b3JsZCBjYW5ub3QgYXBwZWFyIGFzIGEgc3F1YXJlIHNlYWJlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTWFjcm9NZXNoKHdvcmxkOiBXb3JsZCwgb3B0czogTWFjcm9PcHRpb25zKTogTWFjcm9SZXN1bHQge1xuICBjb25zdCB0b3RhbFQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IHsgc3RlcCwgaG9sZSB9ID0gb3B0cztcbiAgY29uc3QgY2FjaGVLZXkgPSBgJHtzdGVwfToke21hY3JvRWRpdEtleSh3b3JsZCl9YDtcbiAgY29uc3Qgc2FtcGxlQ2FjaGVkID0gbWFjcm9TYW1wbGVDYWNoZS5nZXQod29ybGQpPy5lZGl0ZWQuaGFzKGNhY2hlS2V5KSA/PyBmYWxzZTtcbiAgY29uc3QgY2FjaGUgPSBtYWNyb1NhbXBsZXMod29ybGQsIHN0ZXApO1xuICBjb25zdCB7IE4sIGhlaWdodHMsIHRvcHMsIHVuZGVyd2F0ZXIgfSA9IGNhY2hlO1xuICBjb25zdCBob2xlQ2VsbCA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgY2VsbFggPSAoaTogbnVtYmVyKSA9PiAtSEFMRiArIChpICsgMC41KSAqIHN0ZXA7XG4gIGNvbnN0IGNlbGxaID0gKGo6IG51bWJlcikgPT4gLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwO1xuXG4gIGlmIChob2xlKSB7XG4gICAgZm9yIChsZXQgaiA9IDA7IGogPCBOOyBqKyspIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHggPSBjZWxsWChpKSwgeiA9IGNlbGxaKGopO1xuICAgICAgICBpZiAoeCA+IGhvbGUubWluWCAmJiB4IDwgaG9sZS5tYXhYICYmIHogPiBob2xlLm1pblogJiYgeiA8IGhvbGUubWF4Wikge1xuICAgICAgICAgIGhvbGVDZWxsW2ogKiBOICsgaV0gPSAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3Qgc2FtcGxlTXMgPSBzYW1wbGVDYWNoZWQgPyAwIDogY2FjaGUuc2FtcGxlTXM7XG4gIC8vIFdpdGggYSBmb2N1cyB0aGUgbWVzaCBpcyBzcGxpdCBpbnRvIE1BQ1JPX1RJTEUgc3F1YXJlIHRpbGVzIHNvIHRoZSB2aWV3XG4gIC8vIGNhbiBza2lwIHRpbGVzIG91dHNpZGUgdGhlIGNhbWVyYSBmcnVzdHVtIChWb3hlbFRlcnJhaW5WaWV3LmN1bGxNYWNybykuXG4gIC8vIFdpdGhvdXQgb25lIChtYXAgbW9kZSwgdGVzdHMpIGl0IHN0YXlzIGEgc2luZ2xlIG1lc2guXG4gIGNvbnN0IHRpbGVDZWxscyA9IG9wdHMuZm9jdXMgPyBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKE1BQ1JPX1RJTEUgLyBzdGVwKSkgOiBOO1xuICBjb25zdCB0aWxlc1BlclNpZGUgPSBNYXRoLmNlaWwoTiAvIHRpbGVDZWxscyk7XG4gIHR5cGUgVGlsZUJ1ZmZlcnMgPSB7IHBvc2l0aW9uczogbnVtYmVyW107IG5vcm1hbHM6IG51bWJlcltdOyBjb2xvcnM6IG51bWJlcltdOyBpbmRpY2VzOiBudW1iZXJbXSB9O1xuICBjb25zdCB0aWxlQnVmZmVyczogVGlsZUJ1ZmZlcnNbXSA9IFtdO1xuICBmb3IgKGxldCB0ID0gMDsgdCA8IHRpbGVzUGVyU2lkZSAqIHRpbGVzUGVyU2lkZTsgdCsrKSB0aWxlQnVmZmVycy5wdXNoKHsgcG9zaXRpb25zOiBbXSwgbm9ybWFsczogW10sIGNvbG9yczogW10sIGluZGljZXM6IFtdIH0pO1xuICBsZXQgYnVmID0gdGlsZUJ1ZmZlcnNbMF07XG5cbiAgY29uc3QgcHVzaFF1YWQgPSAocDogbnVtYmVyW11bXSwgbjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdLCBjb2xvcjogVEhSRUUuQ29sb3IpID0+IHtcbiAgICBjb25zdCB7IHBvc2l0aW9ucywgbm9ybWFscywgY29sb3JzLCBpbmRpY2VzIH0gPSBidWY7XG4gICAgY29uc3QgYmFzZSA9IHBvc2l0aW9ucy5sZW5ndGggLyAzO1xuICAgIGZvciAoY29uc3QgdiBvZiBwKSB7XG4gICAgICBwb3NpdGlvbnMucHVzaCh2WzBdLCB2WzFdLCB2WzJdKTtcbiAgICAgIG5vcm1hbHMucHVzaChuWzBdLCBuWzFdLCBuWzJdKTtcbiAgICAgIGNvbG9ycy5wdXNoKGNvbG9yLnIsIGNvbG9yLmcsIGNvbG9yLmIpO1xuICAgIH1cbiAgICBpbmRpY2VzLnB1c2goYmFzZSwgYmFzZSArIDEsIGJhc2UgKyAyLCBiYXNlLCBiYXNlICsgMiwgYmFzZSArIDMpO1xuICB9O1xuXG4gIGNvbnN0IGNlbGxTaGFkZSA9IChpOiBudW1iZXIsIGo6IG51bWJlcikgPT4gMC45NCArIDAuMTIgKiBoYXNoMmkoaSwgaiwgd29ybGQuc2VlZCArIDQwMSk7XG5cbiAgY29uc3QgdG9wQ29sb3IgPSAodG9wOiBNYXRJZCwgaDogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlcik6IFRIUkVFLkNvbG9yID0+IHtcbiAgICBjb25zdCBzaGFkZSA9IGNlbGxTaGFkZShpLCBqKTtcbiAgICBjb25zdCBtb2lzdCA9IGZibTIoY2VsbFgoaSkgLyAxMzAsIGNlbGxaKGopIC8gMTMwLCB3b3JsZC5zZWVkICsgNjAxLCAzKTtcbiAgICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIENPTC5zYW5kLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoc2hhZGUgKiAwLjkwKTtcbiAgICBpZiAodG9wID09PSBNQVQuR1JBVkVMKSByZXR1cm4gQ09MLmdyYXZlbC5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgICBpZiAodG9wID09PSBNQVQuU1RPTkUpIHtcbiAgICAgIHJldHVybiBDT0wuc3RvbmVTaGFkZS5jbG9uZSgpLmxlcnAoQ09MLnN0b25lQiwgMC4zNSArIDAuMjUgKiBzaGFkZSkubXVsdGlwbHlTY2FsYXIoXG4gICAgICAgICgwLjgyICsgMC4xNCAqIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIChoICsgOCkgLyA3MCkpKSAqICgwLjkyICsgMC4wOCAqIHNoYWRlKSxcbiAgICAgICk7XG4gICAgfVxuICAgIGlmICh0b3AgPT09IE1BVC5PUkUpIHJldHVybiBDT0wub3JlLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TTk9XKSByZXR1cm4gQ09MLnNub3cuY2xvbmUoKS5tdWx0aXBseVNjYWxhcigwLjk0ICsgMC4wOCAqIHNoYWRlKTtcbiAgICAvLyBGb3Jlc3QtZmxvb3IgcGF0Y2hlcyBicmVhayB1cCB0aGUgdW5pZm9ybSBncmVlbiBvZiB0aGUgZmFyIExPRC4gVGhleVxuICAgIC8vIGFyZSBhIGNvbG91ciBhcHByb3hpbWF0aW9uLCBub3QgZXh0cmEgZ2VvbWV0cnk7IHRoZSBuZWFyIHJpbmcgaGFzIHJlYWxcbiAgICAvLyBTdHlsIHRyZWVzLlxuICAgIHJldHVybiBDT0wuZ3Jhc3NUb3BbaGVpZ2h0QmFuZChoKV0uY2xvbmUoKVxuICAgICAgLmxlcnAoQ09MLmdyYXNzQ2FwLCAwLjEyICsgMC4zNCAqIG1vaXN0KVxuICAgICAgLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgfTtcblxuICBjb25zdCBzaWRlQ29sb3IgPSAodG9wOiBNYXRJZCwgaDogbnVtYmVyLCBuaDogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlcik6IFRIUkVFLkNvbG9yID0+IHtcbiAgICBjb25zdCBkcm9wID0gaCAtIG5oO1xuICAgIGNvbnN0IHNoYWRlID0gMC45MCArIDAuMTAgKiBoYXNoMmkoaSwgaiwgd29ybGQuc2VlZCArIDQwMik7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBDT0wuc2FuZC5jbG9uZSgpLmxlcnAoQ09MLnN0b25lQiwgZHJvcCA+IDUgPyAwLjU1IDogMC4yKS5tdWx0aXBseVNjYWxhcihzaGFkZSAqIDAuOTIpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSkge1xuICAgICAgcmV0dXJuIENPTC5zdG9uZVNoYWRlLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoXG4gICAgICAgICgwLjgwICsgMC4xNiAqIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIChoICsgOCkgLyA3MCkpKSAqIHNoYWRlLFxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gQSBncmFzcy10b3BwZWQgYmFuayBpcyBub3QgYSBzdG9uZSBjbGlmZiwgaG93ZXZlciB0YWxsIHRoZSA4IG0gbWFjcm9cbiAgICAvLyBjZWxsIG1ha2VzIGl0IGxvb2suIEtlZXBpbmcgdGhlIHNpZGUgaW4gdGhlIHNvaWwgcmFuZ2UgcmVtb3ZlZCB0aGVcbiAgICAvLyBicmlnaHQgd2hpdGUgcXVhcnJ5IHdhbGxzIGFyb3VuZCB0aGUgcml2ZXIgYW5kIGxha2UgaW4gdGhlIHdpZGUgdmlldy5cbiAgICBpZiAoZHJvcCA+IDQpIHJldHVybiBDT0wuZ3Jhc3NDYXAuY2xvbmUoKS5sZXJwKENPTC5vY2hyZSwgMC41NSkubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICAgIHJldHVybiBDT0wuZ3Jhc3NDYXAuY2xvbmUoKS5sZXJwKENPTC5zdG9uZUIsIDAuMjIpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgfTtcblxuICAvLyBDZWxsIGxheW91dC4gV2l0aG91dCBhIGZvY3VzIChtYXAgbW9kZSkgZXZlcnkgY2VsbCBpcyBvbmUgYmFzZSBjZWxsLiBJblxuICAvLyB0aGUgd29ybGQgdmlldywgNHg0LWNlbGwgYmxvY2tzIGZhciBmcm9tIHRoZSBmb2N1cyBtZXJnZSBpbnRvIDJ4MiBvciA0eDRcbiAgLy8gY2VsbHM6IGEgZmFyIGNlbGwgY292ZXJzIHRoZSBzYW1lIGdyb3VuZCB3aXRoIG9uZSB0b3AgYW5kIGZld2VyIHNpZGVzLlxuICAvLyBDb2Fyc2UgY2VsbHMgdGFrZSB0aGUgaGlnaGVzdCBsYW5kIGhlaWdodCAoa2VlcHMgcmlkZ2VzIGFuZCBwZWFrcyBvbiB0aGVcbiAgLy8gc2t5bGluZSksIHRoZSBtYXRlcmlhbCBvZiB0aGF0IGhpZ2hlc3Qgc3ViLWNlbGwgYW5kIHRoZSBtZWFuIHRvcCBjb2xvdXJcbiAgLy8gb2YgdGhlaXIgbGFuZCBzdWItY2VsbHM7IGEgY29hcnNlIGNlbGwgdGhhdCBpcyBtb3N0bHkgc2VhIHN0YXlzIHNlYS5cbiAgY29uc3QgdGllcnMgPSBvcHRzLmZvY3VzID8gKG9wdHMudGllcnMgPz8gREVGQVVMVF9NQUNST19USUVSUykgOiBudWxsO1xuICBjb25zdCBCID0gNDtcbiAgY29uc3QgbGV2ZWxPZiA9IChiaTogbnVtYmVyLCBiajogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBpZiAoIXRpZXJzIHx8ICFvcHRzLmZvY3VzKSByZXR1cm4gMTtcbiAgICBjb25zdCBjeCA9IC1IQUxGICsgKGJpICsgMC41KSAqIEIgKiBzdGVwLCBjeiA9IC1IQUxGICsgKGJqICsgMC41KSAqIEIgKiBzdGVwO1xuICAgIGNvbnN0IGQgPSBNYXRoLm1heChNYXRoLmFicyhjeCAtIG9wdHMuZm9jdXMueCksIE1hdGguYWJzKGN6IC0gb3B0cy5mb2N1cy56KSkgLSBCICogc3RlcCAvIDI7XG4gICAgcmV0dXJuIGQgPD0gdGllcnMuZmluZSA/IDEgOiBkIDw9IHRpZXJzLm1pZCA/IDIgOiA0O1xuICB9O1xuICAvLyBSZW5kZXIgaGVpZ2h0IHBlciBiYXNlIGNlbGwgKG9mIHRoZSBjZWxsIHRoYXQgY292ZXJzIGl0KSBhbmQgd2hldGhlclxuICAvLyB0aGF0IGNlbGwgaXMgZHJhd24gYXMgbGFuZC5cbiAgY29uc3QgcmVuZGVySCA9IG5ldyBGbG9hdDMyQXJyYXkoTiAqIE4pO1xuICBjb25zdCByZW5kZXJMYW5kID0gbmV3IFVpbnQ4QXJyYXkoTiAqIE4pO1xuICB0eXBlIENlbGwgPSB7IGk6IG51bWJlcjsgajogbnVtYmVyOyBrOiBudW1iZXI7IGg6IG51bWJlcjsgdG9wOiBNYXRJZDsgY29sb3I6IFRIUkVFLkNvbG9yIH07XG4gIGNvbnN0IGNlbGxzOiBDZWxsW10gPSBbXTtcbiAgY29uc3QgY29sb3JBY2MgPSBuZXcgVEhSRUUuQ29sb3IoKTtcbiAgZm9yIChsZXQgYmogPSAwOyBiaiA8IE47IGJqICs9IEIpIHtcbiAgICBmb3IgKGxldCBiaSA9IDA7IGJpIDwgTjsgYmkgKz0gQikge1xuICAgICAgY29uc3QgayA9IGxldmVsT2YoYmkgLyBCLCBiaiAvIEIpO1xuICAgICAgZm9yIChsZXQgajAgPSBiajsgajAgPCBNYXRoLm1pbihOLCBiaiArIEIpOyBqMCArPSBrKSB7XG4gICAgICAgIGZvciAobGV0IGkwID0gYmk7IGkwIDwgTWF0aC5taW4oTiwgYmkgKyBCKTsgaTAgKz0gaykge1xuICAgICAgICAgIGxldCBsYW5kID0gMCwgdG90YWwgPSAwLCBiZXN0ID0gLTE7XG4gICAgICAgICAgY29sb3JBY2Muc2V0UkdCKDAsIDAsIDApO1xuICAgICAgICAgIGZvciAobGV0IGogPSBqMDsgaiA8IE1hdGgubWluKE4sIGowICsgayk7IGorKykge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGkwOyBpIDwgTWF0aC5taW4oTiwgaTAgKyBrKTsgaSsrKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGlkeCA9IGogKiBOICsgaTtcbiAgICAgICAgICAgICAgdG90YWwrKztcbiAgICAgICAgICAgICAgaWYgKGhvbGVDZWxsW2lkeF0gfHwgdW5kZXJ3YXRlcltpZHhdKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgbGFuZCsrO1xuICAgICAgICAgICAgICBpZiAoYmVzdCA8IDAgfHwgaGVpZ2h0c1tpZHhdID4gaGVpZ2h0c1tiZXN0XSkgYmVzdCA9IGlkeDtcbiAgICAgICAgICAgICAgaWYgKGsgPiAxKSBjb2xvckFjYy5hZGQodG9wQ29sb3IodG9wc1tpZHhdIGFzIE1hdElkLCBoZWlnaHRzW2lkeF0sIGksIGopKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGJlc3QgPCAwIHx8IGxhbmQgKiAyIDwgdG90YWwpIGNvbnRpbnVlO1xuICAgICAgICAgIGNvbnN0IGggPSBoZWlnaHRzW2Jlc3RdO1xuICAgICAgICAgIGNvbnN0IHRvcCA9IHRvcHNbYmVzdF0gYXMgTWF0SWQ7XG4gICAgICAgICAgY29uc3QgY29sb3IgPSBrID4gMSA/IGNvbG9yQWNjLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoMSAvIGxhbmQpIDogdG9wQ29sb3IodG9wLCBoLCBpMCwgajApO1xuICAgICAgICAgIGNlbGxzLnB1c2goeyBpOiBpMCwgajogajAsIGssIGgsIHRvcCwgY29sb3IgfSk7XG4gICAgICAgICAgZm9yIChsZXQgaiA9IGowOyBqIDwgTWF0aC5taW4oTiwgajAgKyBrKTsgaisrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gaTA7IGkgPCBNYXRoLm1pbihOLCBpMCArIGspOyBpKyspIHtcbiAgICAgICAgICAgICAgcmVuZGVySFtqICogTiArIGldID0gaDtcbiAgICAgICAgICAgICAgcmVuZGVyTGFuZFtqICogTiArIGldID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKiogSGVpZ2h0IGEgc2lkZSBmYWNlIGRyb3BzIHRvIGJlc2lkZSBiYXNlIGNlbGwgKG5pLCBuaiksIG9yIG51bGwgZm9yIG5vIGZhY2UuICovXG4gIGNvbnN0IG5laWdoYm91ckRyb3AgPSAobmk6IG51bWJlciwgbmo6IG51bWJlcik6IG51bWJlciB8IG51bGwgPT4ge1xuICAgIC8vIFRoZSB3b3JsZCBlZGdlIGlzIG9jZWFuLiBEbyBub3QgZHJhdyBhIHNpZGUgZmFjZSBkb3duIHRvIHRoZSB3YXRlclxuICAgIC8vIGhlcmU7IHRoZSBvcGFxdWUgd2F0ZXIgcGxhbmUgYWxyZWFkeSBjb3ZlcnMgdGhlIGJvdW5kYXJ5LlxuICAgIGlmIChuaSA8IDAgfHwgbmogPCAwIHx8IG5pID49IE4gfHwgbmogPj0gTikgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgbmlkeCA9IG5qICogTiArIG5pO1xuICAgIGlmIChob2xlQ2VsbFtuaWR4XSkgcmV0dXJuIG51bGw7XG4gICAgaWYgKHJlbmRlckxhbmRbbmlkeF0pIHJldHVybiByZW5kZXJIW25pZHhdO1xuICAgIC8vIFNlYSwgb3IgYSBsYW5kIHN1Yi1jZWxsIG9mIGEgY29hcnNlIGNlbGwgdGhhdCBpcyBtb3N0bHkgc2VhOiB0aGUgZmFjZVxuICAgIC8vIHJ1bnMgZG93biB0byB0aGUgd2F0ZXIgc28gbm8gc2VlLXRocm91Z2ggZ2FwIG9wZW5zIGFib3ZlIGl0LlxuICAgIHJldHVybiB1bmRlcndhdGVyW25pZHhdID8gTWF0aC5tYXgoU0VBX0xFVkVMIC0gMC41LCBoZWlnaHRzW25pZHhdKSA6IFNFQV9MRVZFTCAtIDAuNTtcbiAgfTtcblxuICBmb3IgKGNvbnN0IHsgaSwgaiwgaywgaCwgdG9wLCBjb2xvciB9IG9mIGNlbGxzKSB7XG4gICAgYnVmID0gdGlsZUJ1ZmZlcnNbTWF0aC5mbG9vcihqIC8gdGlsZUNlbGxzKSAqIHRpbGVzUGVyU2lkZSArIE1hdGguZmxvb3IoaSAvIHRpbGVDZWxscyldO1xuICAgIGNvbnN0IHgwID0gLUhBTEYgKyBpICogc3RlcCwgeDEgPSBNYXRoLm1pbihIQUxGLCB4MCArIGsgKiBzdGVwKTtcbiAgICBjb25zdCB6MCA9IC1IQUxGICsgaiAqIHN0ZXAsIHoxID0gTWF0aC5taW4oSEFMRiwgejAgKyBrICogc3RlcCk7XG4gICAgY29uc3Qgc3BhbiA9IE1hdGgubWluKGssIE4gLSBpKSwgc3BhblogPSBNYXRoLm1pbihrLCBOIC0gaik7XG5cbiAgICBwdXNoUXVhZChcbiAgICAgIFtbeDAsIGgsIHowXSwgW3gwLCBoLCB6MV0sIFt4MSwgaCwgejFdLCBbeDEsIGgsIHowXV0sXG4gICAgICBbMCwgMSwgMF0sXG4gICAgICBjb2xvcixcbiAgICApO1xuXG4gICAgLy8gT25lIHNpZGUgZmFjZSBwZXIgcnVuIG9mIGVxdWFsIGRyb3AgaGVpZ2h0IGFsb25nIGVhY2ggZWRnZS4gQ29hcnNlXG4gICAgLy8gY2VsbHMgYmVzaWRlIGZpbmVyIG9uZXMgZ2V0IHNldmVyYWwgcnVucywgc28gbm8gZ2FwIG9wZW5zIGF0IGEgdGllclxuICAgIC8vIGJvdW5kYXJ5OyBlcXVhbC1zaXplIG5laWdoYm91cnMgZ2l2ZSBleGFjdGx5IG9uZSBmYWNlIGFzIGJlZm9yZS5cbiAgICBjb25zdCBlZGdlID0gKHNpZGU6IDAgfCAxIHwgMiB8IDMpID0+IHtcbiAgICAgIGNvbnN0IG4gPSBzaWRlIDwgMiA/IHNwYW5aIDogc3BhbjtcbiAgICAgIGxldCBydW5TdGFydCA9IDAsIHJ1bkg6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICAgICAgY29uc3QgZmx1c2ggPSAoZW5kOiBudW1iZXIpID0+IHtcbiAgICAgICAgaWYgKHJ1bkggPT09IG51bGwgfHwgaCA8PSBydW5IKSByZXR1cm47XG4gICAgICAgIGNvbnN0IG5oID0gcnVuSDtcbiAgICAgICAgY29uc3QgY29sID0gc2lkZUNvbG9yKHRvcCwgaCwgbmgsIGksIGopO1xuICAgICAgICBpZiAoc2lkZSA9PT0gMCkge1xuICAgICAgICAgIGNvbnN0IHphID0gejAgKyBydW5TdGFydCAqIHN0ZXAsIHpiID0gejAgKyBlbmQgKiBzdGVwO1xuICAgICAgICAgIHB1c2hRdWFkKFtbeDEsIG5oLCB6YV0sIFt4MSwgaCwgemFdLCBbeDEsIGgsIHpiXSwgW3gxLCBuaCwgemJdXSwgWzEsIDAsIDBdLCBjb2wpO1xuICAgICAgICB9IGVsc2UgaWYgKHNpZGUgPT09IDEpIHtcbiAgICAgICAgICBjb25zdCB6YSA9IHowICsgcnVuU3RhcnQgKiBzdGVwLCB6YiA9IHowICsgZW5kICogc3RlcDtcbiAgICAgICAgICBwdXNoUXVhZChbW3gwLCBuaCwgemFdLCBbeDAsIG5oLCB6Yl0sIFt4MCwgaCwgemJdLCBbeDAsIGgsIHphXV0sIFstMSwgMCwgMF0sIGNvbCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2lkZSA9PT0gMikge1xuICAgICAgICAgIGNvbnN0IHhhID0geDAgKyBydW5TdGFydCAqIHN0ZXAsIHhiID0geDAgKyBlbmQgKiBzdGVwO1xuICAgICAgICAgIHB1c2hRdWFkKFtbeGEsIG5oLCB6MV0sIFt4YiwgbmgsIHoxXSwgW3hiLCBoLCB6MV0sIFt4YSwgaCwgejFdXSwgWzAsIDAsIDFdLCBjb2wpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHhhID0geDAgKyBydW5TdGFydCAqIHN0ZXAsIHhiID0geDAgKyBlbmQgKiBzdGVwO1xuICAgICAgICAgIHB1c2hRdWFkKFtbeGEsIG5oLCB6MF0sIFt4YSwgaCwgejBdLCBbeGIsIGgsIHowXSwgW3hiLCBuaCwgejBdXSwgWzAsIDAsIC0xXSwgY29sKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGZvciAobGV0IHQgPSAwOyB0IDwgbjsgdCsrKSB7XG4gICAgICAgIGNvbnN0IG5oID0gc2lkZSA9PT0gMCA/IG5laWdoYm91ckRyb3AoaSArIHNwYW4sIGogKyB0KVxuICAgICAgICAgIDogc2lkZSA9PT0gMSA/IG5laWdoYm91ckRyb3AoaSAtIDEsIGogKyB0KVxuICAgICAgICAgICAgOiBzaWRlID09PSAyID8gbmVpZ2hib3VyRHJvcChpICsgdCwgaiArIHNwYW5aKVxuICAgICAgICAgICAgICA6IG5laWdoYm91ckRyb3AoaSArIHQsIGogLSAxKTtcbiAgICAgICAgaWYgKHQgPiAwICYmIG5oID09PSBydW5IKSBjb250aW51ZTtcbiAgICAgICAgZmx1c2godCk7XG4gICAgICAgIHJ1blN0YXJ0ID0gdDsgcnVuSCA9IG5oO1xuICAgICAgfVxuICAgICAgZmx1c2gobik7XG4gICAgfTtcbiAgICBlZGdlKDApOyBlZGdlKDEpOyBlZGdlKDIpOyBlZGdlKDMpO1xuICB9XG5cbiAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IHZlcnRleENvbG9yczogdHJ1ZSwgZmxhdFNoYWRpbmc6IHRydWUgfSk7XG4gIGNvbnN0IG1lc2hlczogVEhSRUUuTWVzaFtdID0gW107XG4gIGxldCB0cmlhbmdsZXMgPSAwO1xuICBpZiAodGlsZUJ1ZmZlcnMubGVuZ3RoID4gMSkge1xuICAgIC8vIFRpbGVkOiBldmVyeSB0aWxlJ3MgcXVhZHMgZ28gaW50byBPTkUgc2hhcmVkIHNldCBvZiB2ZXJ0ZXggYW5kIGluZGV4XG4gICAgLy8gYnVmZmVycywgdGlsZSBhZnRlciB0aWxlIGluIHJvdy1tYWpvciBvcmRlci4gRWFjaCB0aWxlIG1lc2ggaXMgYSB2aWV3XG4gICAgLy8gb2YgaXRzIG93biBpbmRleCByYW5nZSAoZHJhd1JhbmdlKSB3aXRoIGl0cyBvd24gYm91bmRpbmcgYm94LCBzb1xuICAgIC8vIGN1bGxNYWNybyBjYW4gaGlkZSBvZmYtc2NyZWVuIHRpbGVzIGFuZCB0aGVuIGRyYXcgZWFjaCBydW4gb2ZcbiAgICAvLyBjb25zZWN1dGl2ZSB2aXNpYmxlIHRpbGVzIHdpdGggYSBzaW5nbGUgY2FsbCBieSB3aWRlbmluZyB0aGUgZmlyc3RcbiAgICAvLyB0aWxlJ3MgcmFuZ2UuIEdQVSBtZW1vcnkgaXMgdGhlIHNhbWUgYXMgb25lIG1lc2guXG4gICAgbGV0IHZlcnRleENvdW50ID0gMCwgaW5kZXhDb3VudCA9IDA7XG4gICAgZm9yIChjb25zdCBiIG9mIHRpbGVCdWZmZXJzKSB7IHZlcnRleENvdW50ICs9IGIucG9zaXRpb25zLmxlbmd0aCAvIDM7IGluZGV4Q291bnQgKz0gYi5pbmRpY2VzLmxlbmd0aDsgfVxuICAgIGNvbnN0IHBvc2l0aW9uID0gbmV3IEZsb2F0MzJBcnJheSh2ZXJ0ZXhDb3VudCAqIDMpLCBub3JtYWwgPSBuZXcgRmxvYXQzMkFycmF5KHZlcnRleENvdW50ICogMyksIGNvbG9yID0gbmV3IEZsb2F0MzJBcnJheSh2ZXJ0ZXhDb3VudCAqIDMpO1xuICAgIGNvbnN0IGluZGV4ID0gdmVydGV4Q291bnQgPiA2NTUzNSA/IG5ldyBVaW50MzJBcnJheShpbmRleENvdW50KSA6IG5ldyBVaW50MTZBcnJheShpbmRleENvdW50KTtcbiAgICBjb25zdCByYW5nZXM6IEFycmF5PHsgdDogbnVtYmVyOyBzdGFydDogbnVtYmVyOyBjb3VudDogbnVtYmVyOyBib3g6IFRIUkVFLkJveDMgfT4gPSBbXTtcbiAgICBsZXQgdm8gPSAwLCBpbyA9IDA7XG4gICAgZm9yIChsZXQgdCA9IDA7IHQgPCB0aWxlQnVmZmVycy5sZW5ndGg7IHQrKykge1xuICAgICAgY29uc3QgYiA9IHRpbGVCdWZmZXJzW3RdO1xuICAgICAgaWYgKGIuaW5kaWNlcy5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xuICAgICAgcG9zaXRpb24uc2V0KGIucG9zaXRpb25zLCB2byAqIDMpO1xuICAgICAgbm9ybWFsLnNldChiLm5vcm1hbHMsIHZvICogMyk7XG4gICAgICBjb2xvci5zZXQoYi5jb2xvcnMsIHZvICogMyk7XG4gICAgICBmb3IgKGxldCBrID0gMDsgayA8IGIuaW5kaWNlcy5sZW5ndGg7IGsrKykgaW5kZXhbaW8gKyBrXSA9IGIuaW5kaWNlc1trXSArIHZvO1xuICAgICAgY29uc3QgYm94ID0gbmV3IFRIUkVFLkJveDMoKTtcbiAgICAgIGZvciAobGV0IGsgPSAwOyBrIDwgYi5wb3NpdGlvbnMubGVuZ3RoOyBrICs9IDMpIHtcbiAgICAgICAgX2JveFBvaW50LnNldChiLnBvc2l0aW9uc1trXSwgYi5wb3NpdGlvbnNbayArIDFdLCBiLnBvc2l0aW9uc1trICsgMl0pO1xuICAgICAgICBib3guZXhwYW5kQnlQb2ludChfYm94UG9pbnQpO1xuICAgICAgfVxuICAgICAgcmFuZ2VzLnB1c2goeyB0LCBzdGFydDogaW8sIGNvdW50OiBiLmluZGljZXMubGVuZ3RoLCBib3ggfSk7XG4gICAgICB2byArPSBiLnBvc2l0aW9ucy5sZW5ndGggLyAzO1xuICAgICAgaW8gKz0gYi5pbmRpY2VzLmxlbmd0aDtcbiAgICB9XG4gICAgY29uc3Qgc2hhcmVkID0ge1xuICAgICAgcG9zaXRpb246IG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUocG9zaXRpb24sIDMpLFxuICAgICAgbm9ybWFsOiBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKG5vcm1hbCwgMyksXG4gICAgICBjb2xvcjogbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShjb2xvciwgMyksXG4gICAgICBpbmRleDogbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShpbmRleCwgMSksXG4gICAgfTtcbiAgICBmb3IgKGNvbnN0IHIgb2YgcmFuZ2VzKSB7XG4gICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICAgICAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIHNoYXJlZC5wb3NpdGlvbik7XG4gICAgICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ25vcm1hbCcsIHNoYXJlZC5ub3JtYWwpO1xuICAgICAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdjb2xvcicsIHNoYXJlZC5jb2xvcik7XG4gICAgICBnZW9tZXRyeS5zZXRJbmRleChzaGFyZWQuaW5kZXgpO1xuICAgICAgZ2VvbWV0cnkuc2V0RHJhd1JhbmdlKHIuc3RhcnQsIHIuY291bnQpO1xuICAgICAgZ2VvbWV0cnkuYm91bmRpbmdCb3ggPSByLmJveDtcbiAgICAgIGdlb21ldHJ5LmJvdW5kaW5nU3BoZXJlID0gci5ib3guZ2V0Qm91bmRpbmdTcGhlcmUobmV3IFRIUkVFLlNwaGVyZSgpKTtcbiAgICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xuICAgICAgbWVzaC5uYW1lID0gYG1hY3JvX2xvZF90aWxlXyR7ci50ICUgdGlsZXNQZXJTaWRlfV8ke01hdGguZmxvb3Ioci50IC8gdGlsZXNQZXJTaWRlKX1gO1xuICAgICAgbWVzaC5jYXN0U2hhZG93ID0gZmFsc2U7XG4gICAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSBmYWxzZTtcbiAgICAgIC8vIGN1bGxNYWNybyBkZWNpZGVzIHZpc2liaWxpdHkgYnkgYm94OyBhIHdpZGVuZWQgcnVuIHdvdWxkIGZhaWxcbiAgICAgIC8vIHRocmVlJ3MgcGVyLXRpbGUgc3BoZXJlIHRlc3QuXG4gICAgICBtZXNoLmZydXN0dW1DdWxsZWQgPSBmYWxzZTtcbiAgICAgIG1lc2gudXNlckRhdGEubWFjcm9SYW5nZSA9IHsgc3RhcnQ6IHIuc3RhcnQsIGNvdW50OiByLmNvdW50IH07XG4gICAgICBtZXNoZXMucHVzaChtZXNoKTtcbiAgICAgIHRyaWFuZ2xlcyArPSByLmNvdW50IC8gMztcbiAgICB9XG4gIH1cbiAgZm9yIChsZXQgdCA9IDA7IHQgPCB0aWxlQnVmZmVycy5sZW5ndGggJiYgdGlsZUJ1ZmZlcnMubGVuZ3RoID09PSAxOyB0KyspIHtcbiAgICBjb25zdCB7IHBvc2l0aW9ucywgbm9ybWFscywgY29sb3JzLCBpbmRpY2VzIH0gPSB0aWxlQnVmZmVyc1t0XTtcbiAgICBpZiAoaW5kaWNlcy5sZW5ndGggPT09IDAgJiYgKHRpbGVCdWZmZXJzLmxlbmd0aCA+IDEgfHwgbWVzaGVzLmxlbmd0aCA+IDApKSBjb250aW51ZTtcbiAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICAgIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgncG9zaXRpb24nLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbnMsIDMpKTtcbiAgICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ25vcm1hbCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKG5vcm1hbHMsIDMpKTtcbiAgICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoY29sb3JzLCAzKSk7XG4gICAgZ2VvbWV0cnkuc2V0SW5kZXgoaW5kaWNlcyk7XG4gICAgZ2VvbWV0cnkuY29tcHV0ZUJvdW5kaW5nU3BoZXJlKCk7XG4gICAgZ2VvbWV0cnkuY29tcHV0ZUJvdW5kaW5nQm94KCk7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XG4gICAgbWVzaC5uYW1lID0gdGlsZUJ1ZmZlcnMubGVuZ3RoID4gMSA/IGBtYWNyb19sb2RfdGlsZV8ke3QgJSB0aWxlc1BlclNpZGV9XyR7TWF0aC5mbG9vcih0IC8gdGlsZXNQZXJTaWRlKX1gIDogJ21hY3JvX2xvZCc7XG4gICAgbWVzaC5jYXN0U2hhZG93ID0gZmFsc2U7XG4gICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gZmFsc2U7XG4gICAgbWVzaGVzLnB1c2gobWVzaCk7XG4gICAgdHJpYW5nbGVzICs9IGluZGljZXMubGVuZ3RoIC8gMztcbiAgfVxuICBpZiAobWVzaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgIGNvbnN0IGVtcHR5ID0gbmV3IFRIUkVFLk1lc2gobmV3IFRIUkVFLkJ1ZmZlckdlb21ldHJ5KCksIG1hdGVyaWFsKTtcbiAgICBlbXB0eS5uYW1lID0gJ21hY3JvX2xvZCc7XG4gICAgbWVzaGVzLnB1c2goZW1wdHkpO1xuICB9XG4gIHJldHVybiB7XG4gICAgbWVzaDogbWVzaGVzWzBdLFxuICAgIG1lc2hlcyxcbiAgICB0cmlhbmdsZXMsXG4gICAgc2FtcGxlTXMsXG4gICAgdG90YWxNczogcGVyZm9ybWFuY2Uubm93KCkgLSB0b3RhbFQwLFxuICAgIHNhbXBsZUNhY2hlZCxcbiAgfTtcbn1cblxuZXhwb3J0IHR5cGUgVmlld01vZGUgPSAnd29ybGQnIHwgJ21hcCcgfCAna2l0JztcblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbFRlcnJhaW5WaWV3T3B0aW9ucyB7XG4gIG5lYXJSYWRpdXM/OiBudW1iZXI7XG4gIHdvcmxkTWFjcm9TdGVwPzogbnVtYmVyO1xuICBtYXBNYWNyb1N0ZXA/OiBudW1iZXI7XG59XG5cbmNvbnN0IF9jdWxsRnJ1c3R1bSA9IG5ldyBUSFJFRS5GcnVzdHVtKCk7XG5jb25zdCBfY3VsbE1hdHJpeCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG5jb25zdCBfYm94UG9pbnQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuLyoqXG4gKiBjdWxsTWFjcm8gam9pbnMgdHdvIHJ1bnMgb2YgdmlzaWJsZSBtYWNybyB0aWxlcyBhY3Jvc3MgYW4gb2ZmLXNjcmVlbiB0aWxlXG4gKiBvZiBhdCBtb3N0IHRoaXMgbWFueSB0cmlhbmdsZXMgKGl0IGlzIGRyYXduIGFuZCBjbGlwcGVkIGJ5IHRoZSBHUFUpLCB0b1xuICogc2F2ZSBhIGRyYXcgY2FsbC4gQ29hc3QgYW5kIHNlYSB0aWxlcyBhcmUgc21hbGwsIHNvIHdpZGUgdmlld3MgY29sbGFwc2UgdG9cbiAqIGEgZmV3IHJ1bnMuXG4gKi9cbmV4cG9ydCBjb25zdCBNQUNST19CUklER0VfVFJJQU5HTEVTID0gMTUwMDtcblxuLyoqXG4gKiBDYW1lcmEgZGlzdGFuY2VzIChtKSBwYXN0IHdoaWNoIHRoZSBkcmF3biBuZWFyIHJpbmcgc2hyaW5rcyBieSBvbmUgbW9yZVxuICogY2h1bms6IHJhZGl1cyAtIDEgYmV5b25kIHRoZSBmaXJzdCwgcmFkaXVzIC0gMiBiZXlvbmQgdGhlIHNlY29uZCAobmV2ZXJcbiAqIGJlbG93IDEpLiBSZXZpZXcgdjE6IGF0IGJ1aWxkZXIgem9vbSAzMDAgbSBhbmQgYmV5b25kIHRoZSB3aG9sZSA3eDcgcmluZyBpc1xuICogb24gc2NyZWVuIGFuZCBpdHMgNDkgY2h1bmsgbWVzaGVzIHBsdXMgd2F0ZXIgY29zdCBhYm91dCA3NSBjYWxscywgd2hpbGUgb25lXG4gKiB2b3hlbCB0aGVyZSBjb3ZlcnMgMiB0byA0IHBpeGVscy4gQ2h1bmtzIHN0YXkgbG9hZGVkIChzaW0sIGZhdW5hIGFuZFxuICogdmVnZXRhdGlvbiBzdGlsbCBzZWUgdGhlbSk7IG9ubHkgdGhlaXIgbWVzaGVzIGFyZSBoaWRkZW4gYW5kIHRoZSBtYWNyb1xuICogbWVzaCBmaWxscyB0aGVpciBhcmVhLlxuICovXG5leHBvcnQgY29uc3QgTkVBUl9ESVNQTEFZX0RJU1RBTkNFUzogcmVhZG9ubHkgbnVtYmVyW10gPSBbMjIwLCA0NTBdO1xuLyoqIFpvb21pbmcgYmFjayBpbiwgYSBsZXZlbCBpcyBrZXB0IHVudGlsIHRoZSBkaXN0YW5jZSBkcm9wcyBiZWxvdyB0aHJlc2hvbGQgeCB0aGlzLiAqL1xuZXhwb3J0IGNvbnN0IE5FQVJfRElTUExBWV9IWVNURVJFU0lTID0gMC45O1xuXG4vKipcbiAqIERyYXduIG5lYXIgcmluZyByYWRpdXMgKGNodW5rcykgZm9yIGEgY2FtZXJhIGBkaXN0YW5jZWAgKG0pIGZyb20gaXRzXG4gKiB0YXJnZXQsIHdpdGggaHlzdGVyZXNpcyBhZ2FpbnN0IHRoZSBwcmV2aW91c2x5IGRyYXduIHJhZGl1cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5lYXJEaXNwbGF5UmFkaXVzKGRpc3RhbmNlOiBudW1iZXIsIG5lYXJSYWRpdXM6IG51bWJlciwgcHJldmlvdXMgPSBuZWFyUmFkaXVzKTogbnVtYmVyIHtcbiAgY29uc3QgcHJldkxldmVsID0gbmVhclJhZGl1cyAtIHByZXZpb3VzO1xuICBsZXQgbGV2ZWwgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IE5FQVJfRElTUExBWV9ESVNUQU5DRVMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB0ID0gTkVBUl9ESVNQTEFZX0RJU1RBTkNFU1tpXSAqIChwcmV2TGV2ZWwgPiBpID8gTkVBUl9ESVNQTEFZX0hZU1RFUkVTSVMgOiAxKTtcbiAgICBpZiAoZGlzdGFuY2UgPiB0KSBsZXZlbCA9IGkgKyAxO1xuICB9XG4gIHJldHVybiBNYXRoLm1heCgxLCBNYXRoLm1pbihuZWFyUmFkaXVzLCBuZWFyUmFkaXVzIC0gbGV2ZWwpKTtcbn1cblxuaW50ZXJmYWNlIENodW5rVmlldyB7IG1lc2g6IFRIUkVFLk1lc2g7IHdhdGVyOiBUSFJFRS5NZXNoIHwgbnVsbDsgdHJpYW5nbGVzOiBudW1iZXI7IH1cblxuLyoqXG4gKiBPd25zIHRoZSBuZWFyIGNodW5rIG1lc2hlcywgbWFjcm8gTE9EIGFuZCB3YXRlciBzdXJmYWNlLiBJdCByZWFkcyB3b3JsZFxuICogc3RhdGUgYW5kIG5ldmVyIG11dGF0ZXMgZ2VuZXJhdGlvbiBydWxlczsgZXZpY3Rpb24gb25seSBmcmVlcyBkZXJpdmVkIGRhdGEuXG4gKi9cbmV4cG9ydCBjbGFzcyBWb3hlbFRlcnJhaW5WaWV3IHtcbiAgcmVhZG9ubHkgZ3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBuZWFyR3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgcHJpdmF0ZSBtYWNyb0dyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIHByaXZhdGUgd2F0ZXI6IFRIUkVFLk1lc2g7XG4gIHByaXZhdGUgd29ybGQ6IFdvcmxkO1xuICBwcml2YXRlIG5lYXJSYWRpdXM6IG51bWJlcjtcbiAgLyoqIFJhZGl1cyAoY2h1bmtzKSBvZiB0aGUgbmVhciByaW5nIGFjdHVhbGx5IGRyYXduOyA8PSBuZWFyUmFkaXVzIChzZWUgbmVhckRpc3BsYXlSYWRpdXMpLiAqL1xuICBwcml2YXRlIGRpc3BsYXlSYWRpdXM6IG51bWJlcjtcbiAgLyoqIE1hY3JvIGhvbGUgb2YgdGhlIGxhc3Qgd29ybGQgcmVidWlsZCwgaW4gY2h1bmsgY29vcmRpbmF0ZXMgKGluY2x1c2l2ZSkuICovXG4gIHByaXZhdGUgaG9sZUNodW5rcyA9IHsgbWluWDogMCwgbWF4WDogLTEsIG1pblo6IDAsIG1heFo6IC0xIH07XG4gIHByaXZhdGUgZGlzcGxheWVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIC8qKiBkaXNwbGF5UmFkaXVzIHRoZSBtYWNybyBob2xlIHdhcyBsYXN0IGJ1aWx0IGZvci4gKi9cbiAgcHJpdmF0ZSBtYWNyb0Rpc3BsYXlSYWRpdXMgPSAtMTtcbiAgcHJpdmF0ZSB3b3JsZE1hY3JvU3RlcDogbnVtYmVyO1xuICBwcml2YXRlIG1hcE1hY3JvU3RlcDogbnVtYmVyO1xuICBwcml2YXRlIGNodW5rcyA9IG5ldyBNYXA8c3RyaW5nLCBDaHVua1ZpZXc+KCk7XG4gIHByaXZhdGUgbG9hZGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgbW9kZTogVmlld01vZGUgPSAnd29ybGQnO1xuICBwcml2YXRlIG1hY3JvOiBUSFJFRS5NZXNoW10gPSBbXTtcbiAgcHJpdmF0ZSBtYWNyb1Zpc2liaWxpdHk6IGJvb2xlYW5bXSA9IFtdO1xuICBwcml2YXRlIG1hY3JvSW5WaWV3ID0gMDtcbiAgcHJpdmF0ZSBtYWNyb1RyaWFuZ2xlcyA9IDA7XG4gIHByaXZhdGUgbWFjcm9Gb2N1cyA9IG5ldyBUSFJFRS5WZWN0b3IzKDFlOSwgMCwgMWU5KTtcbiAgcHJpdmF0ZSBtYWNyb01vZGU6IFZpZXdNb2RlIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgY2h1bmtHZW5TYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIGNodW5rTWVzaFNhbXBsZXM6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgbWFjcm9TYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIG1hY3JvU2FtcGxlU2FtcGxlczogbnVtYmVyW10gPSBbXTtcbiAgcHJpdmF0ZSBtYWNyb0NhY2hlSGl0cyA9IDA7XG4gIHByaXZhdGUgbWFjcm9FZGl0S2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgLyoqIE1haW4tdGhyZWFkIG1pbGxpc2Vjb25kcyBwZXIgZnJhbWUgZm9yIHN0cmVhbWluZyBhbmQgZGlydHkgcmUtbWVzaGluZy4gKi9cbiAgZnJhbWVCdWRnZXRNcyA9IDY7XG4gIHByaXZhdGUgcGVuZGluZ0NodW5rcyA9IDA7XG4gIHByaXZhdGUgc3dlZXBDb3VudGVyID0gMDtcbiAgcHJpdmF0ZSBzd2VwdENodW5rcyA9IDA7XG4gIHByaXZhdGUgcGlubmVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgcG9vbDogQ2h1bmtXb3JrZXJQb29sIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgZ2VuZXJhdGluZyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAvKiogTGF0ZXN0IG1lc2ggcmVxdWVzdCBwZXIgY2h1bms7IG9sZGVyIHJlc3VsdHMgYXJlIGRpc2NhcmRlZC4gKi9cbiAgcHJpdmF0ZSBtZXNoU3RhbXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHN0YW1wQ291bnRlciA9IDA7XG4gIHByaXZhdGUgd29ya2VyU3RhdHMgPSB7IGdlbmVyYXRlZDogMCwgbWVzaGVkOiAwLCBkaXNjYXJkZWQ6IDAsIGdlbk1zOiAwLCBtZXNoTXM6IDAgfTtcbiAgcHJpdmF0ZSB3YXRlckdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIHByaXZhdGUgZmFyV2F0ZXJIb2xlOiB7IHZhbHVlOiBUSFJFRS5WZWN0b3I0IH07XG4gIG9uQ2h1bmtzQ2hhbmdlZDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3Iod29ybGQ6IFdvcmxkLCBzY2VuZTogVEhSRUUuU2NlbmUsIG9wdHM6IFZveGVsVGVycmFpblZpZXdPcHRpb25zID0ge30pIHtcbiAgICB0aGlzLndvcmxkID0gd29ybGQ7XG4gICAgdGhpcy5uZWFyUmFkaXVzID0gTWF0aC5tYXgoMSwgb3B0cy5uZWFyUmFkaXVzID8/IDMpO1xuICAgIHRoaXMuZGlzcGxheVJhZGl1cyA9IHRoaXMubmVhclJhZGl1cztcbiAgICB0aGlzLndvcmxkTWFjcm9TdGVwID0gTWF0aC5tYXgoNCwgb3B0cy53b3JsZE1hY3JvU3RlcCA/PyA4KTtcbiAgICB0aGlzLm1hcE1hY3JvU3RlcCA9IE1hdGgubWF4KDQsIG9wdHMubWFwTWFjcm9TdGVwID8/IDgpO1xuICAgIHRoaXMuZ3JvdXAubmFtZSA9ICd2b3hlbF93b3JsZCc7XG4gICAgdGhpcy5uZWFyR3JvdXAubmFtZSA9ICd2b3hlbF9jaHVua3MnO1xuICAgIHRoaXMubWFjcm9Hcm91cC5uYW1lID0gJ21hY3JvX2xvZCc7XG4gICAgdGhpcy5ncm91cC5hZGQodGhpcy5uZWFyR3JvdXAsIHRoaXMubWFjcm9Hcm91cCk7XG4gICAgdGhpcy53YXRlciA9IGJ1aWxkV2F0ZXJTdXJmYWNlKHdvcmxkKTtcbiAgICB0aGlzLmZhcldhdGVySG9sZSA9IGluc3RhbGxGYXJXYXRlckhvbGUodGhpcy53YXRlci5tYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCk7XG4gICAgdGhpcy5ncm91cC5hZGQodGhpcy53YXRlcik7XG4gICAgdGhpcy53YXRlckdyb3VwLm5hbWUgPSAnbmVhcl93YXRlcic7XG4gICAgdGhpcy5ncm91cC5hZGQodGhpcy53YXRlckdyb3VwKTtcbiAgICBzY2VuZS5hZGQodGhpcy5ncm91cCk7XG4gIH1cblxuICBwcmVsb2FkKGZvY3VzOiBUSFJFRS5WZWN0b3IzKTogdm9pZCB7XG4gICAgdGhpcy5tb2RlID0gJ3dvcmxkJztcbiAgICB0aGlzLmVuc3VyZUNodW5rcyhmb2N1cywgdHJ1ZSk7XG4gICAgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsICd3b3JsZCcsIHRydWUpO1xuICB9XG5cbiAgLyoqIEFkdmFuY2UgcHJlc2VudGF0aW9uLW9ubHkgd2F0ZXIgYW5pbWF0aW9uIChzZWNvbmRzKS4gKi9cbiAgc2V0V2F0ZXJUaW1lKHNlY29uZHM6IG51bWJlcik6IHZvaWQgeyB3YXRlclRpbWUudmFsdWUgPSBzZWNvbmRzOyB9XG5cbiAgdXBkYXRlKGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBtb2RlOiBWaWV3TW9kZSA9ICd3b3JsZCcpOiB2b2lkIHtcbiAgICBpZiAobW9kZSAhPT0gdGhpcy5tb2RlKSB7XG4gICAgICB0aGlzLm1vZGUgPSBtb2RlO1xuICAgICAgdGhpcy5uZWFyR3JvdXAudmlzaWJsZSA9IG1vZGUgIT09ICdtYXAnO1xuICAgICAgdGhpcy53YXRlckdyb3VwLnZpc2libGUgPSBtb2RlICE9PSAnbWFwJztcbiAgICAgIGlmIChtb2RlID09PSAnbWFwJykgdGhpcy5mYXJXYXRlckhvbGUudmFsdWUuc2V0KDAsIDAsIDAsIDApO1xuICAgICAgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsIG1vZGUsIHRydWUpO1xuICAgIH1cblxuICAgIGlmIChtb2RlID09PSAnbWFwJykge1xuICAgICAgaWYgKG1hY3JvRWRpdEtleSh0aGlzLndvcmxkKSAhPT0gdGhpcy5tYWNyb0VkaXRLZXkpIHRoaXMucmVidWlsZE1hY3JvKGZvY3VzLCBtb2RlLCB0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBmcmFtZVN0YXJ0ID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgdGhpcy5lbnN1cmVDaHVua3MoZm9jdXMsIGZhbHNlLCBmcmFtZVN0YXJ0KTtcbiAgICB0aGlzLnJlYnVpbGREaXJ0eShmb2N1cywgZnJhbWVTdGFydCk7XG4gICAgaWYgKCsrdGhpcy5zd2VlcENvdW50ZXIgJSAzMCA9PT0gMCkgdGhpcy5zd2VlcFJlc2lkZW50KGZvY3VzKTtcblxuICAgIGNvbnN0IG1vdmVkID0gTWF0aC5oeXBvdChmb2N1cy54IC0gdGhpcy5tYWNyb0ZvY3VzLngsIGZvY3VzLnogLSB0aGlzLm1hY3JvRm9jdXMueik7XG4gICAgaWYgKHRoaXMubWFjcm9EaXNwbGF5UmFkaXVzICE9PSB0aGlzLmRpc3BsYXlSYWRpdXMpIHtcbiAgICAgIHRoaXMucmVidWlsZE1hY3JvKGZvY3VzLCBtb2RlLCB0cnVlKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMubWFjcm9Nb2RlICE9PSBtb2RlIHx8IG1vdmVkID4gNDggfHwgbWFjcm9FZGl0S2V5KHRoaXMud29ybGQpICE9PSB0aGlzLm1hY3JvRWRpdEtleSkge1xuICAgICAgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsIG1vZGUsIGZhbHNlKTtcbiAgICB9XG4gICAgdGhpcy5hcHBseURpc3BsYXkoZm9jdXMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFByZXNlbnRhdGlvbiBvbmx5OiBwaWNrIHRoZSBkcmF3biBuZWFyIHJpbmcgcmFkaXVzIGZvciBhIGNhbWVyYSB0aGlzIGZhclxuICAgKiAobSkgZnJvbSBpdHMgdGFyZ2V0IChuZWFyRGlzcGxheVJhZGl1cykuIFRha2VzIGVmZmVjdCBhdCB0aGUgbmV4dCB1cGRhdGUoKS5cbiAgICovXG4gIHNldFZpZXdEaXN0YW5jZShkaXN0YW5jZTogbnVtYmVyKTogdm9pZCB7XG4gICAgdGhpcy5kaXNwbGF5UmFkaXVzID0gbmVhckRpc3BsYXlSYWRpdXMoZGlzdGFuY2UsIHRoaXMubmVhclJhZGl1cywgdGhpcy5kaXNwbGF5UmFkaXVzKTtcbiAgfVxuXG4gIC8qKiBSYWRpdXMgKGNodW5rcykgb2YgdGhlIG5lYXIgcmluZyBjdXJyZW50bHkgZHJhd24uICovXG4gIGdldCBkaXNwbGF5UmFkaXVzQ2h1bmtzKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmRpc3BsYXlSYWRpdXM7IH1cblxuICAvKipcbiAgICogU2hvdyBhIGxvYWRlZCBjaHVuayB3aGVuIGl0IGxpZXMgaW4gdGhlIG1hY3JvIGhvbGUgKHNvIG5vIGdhcCBvcGVucykgb3JcbiAgICogd2l0aGluIGRpc3BsYXlSYWRpdXMgb2YgdGhlIGZvY3VzIGNodW5rIChsZWFkaW5nIGVkZ2Ugd2hpbGUgdGhlIG1hY3JvXG4gICAqIHdhaXRzIGZvciBpdHMgNDggbSByZWJ1aWxkKS4gV2l0aCB0aGUgZnVsbCByYWRpdXMgZXZlcnkgY2h1bmsgaXMgZHJhd24sXG4gICAqIGV4YWN0bHkgYXMgYmVmb3JlLlxuICAgKi9cbiAgcHJpdmF0ZSBhcHBseURpc3BsYXkoZm9jdXM6IFRIUkVFLlZlY3RvcjMpOiB2b2lkIHtcbiAgICBjb25zdCBhbGwgPSB0aGlzLmRpc3BsYXlSYWRpdXMgPj0gdGhpcy5uZWFyUmFkaXVzO1xuICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICBjb25zdCBoID0gdGhpcy5ob2xlQ2h1bmtzLCByID0gdGhpcy5kaXNwbGF5UmFkaXVzO1xuICAgIHRoaXMuZGlzcGxheWVkLmNsZWFyKCk7XG4gICAgZm9yIChjb25zdCBba2V5LCB2aWV3XSBvZiB0aGlzLmNodW5rcykge1xuICAgICAgbGV0IHNob3cgPSBhbGw7XG4gICAgICBpZiAoIXNob3cpIHtcbiAgICAgICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICAgICAgc2hvdyA9IChjeCA+PSBoLm1pblggJiYgY3ggPD0gaC5tYXhYICYmIGN6ID49IGgubWluWiAmJiBjeiA8PSBoLm1heFopXG4gICAgICAgICAgfHwgKE1hdGguYWJzKGN4IC0gY2N4KSA8PSByICYmIE1hdGguYWJzKGN6IC0gY2N6KSA8PSByKTtcbiAgICAgIH1cbiAgICAgIHZpZXcubWVzaC52aXNpYmxlID0gc2hvdztcbiAgICAgIGlmICh2aWV3LndhdGVyKSB2aWV3LndhdGVyLnZpc2libGUgPSBzaG93O1xuICAgICAgaWYgKHNob3cgJiYgdGhpcy5sb2FkZWQuaGFzKGtleSkpIHRoaXMuZGlzcGxheWVkLmFkZChrZXkpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdHJlYW0gdGhlIG5lYXIgcmluZyBuZWFyZXN0LWZpcnN0IHdpdGhpbiBhIHBlci1mcmFtZSB0aW1lIGJ1ZGdldC4gQXQgbGVhc3RcbiAgICogb25lIGNodW5rIGlzIGJ1aWx0IHBlciBmcmFtZSBzbyBzdHJlYW1pbmcgYWx3YXlzIG1ha2VzIHByb2dyZXNzLlxuICAgKi9cbiAgLyoqXG4gICAqIE1vdmUgc3RyZWFtaW5nIGdlbmVyYXRpb24gYW5kIG1lc2hpbmcgdG8gd29ya2Vycy4gRXhwbGljaXQgcmVidWlsZHNcbiAgICogKGNvbnN0cnVjdGlvbiwgZWRpdHMgdmlhIHJlYnVpbGRBcm91bmQpIGFuZCBwcmVsb2FkIHN0YXkgc3luY2hyb25vdXMgc29cbiAgICogYXV0aG9yaXRhdGl2ZSBjaGFuZ2VzIGFyZSB2aXNpYmxlIGltbWVkaWF0ZWx5LlxuICAgKi9cbiAgZW5hYmxlV29ya2Vycyhwb29sOiBDaHVua1dvcmtlclBvb2wpOiB2b2lkIHsgdGhpcy5wb29sID0gcG9vbDsgfVxuXG4gIGdldCB3b3JrZXJNZXRyaWNzKCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCBudWxsIHtcbiAgICBpZiAoIXRoaXMucG9vbCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgIHdvcmtlcnM6IHRoaXMucG9vbC5zaXplLCBpbkZsaWdodDogdGhpcy5wb29sLmluRmxpZ2h0LCAuLi50aGlzLndvcmtlclN0YXRzLFxuICAgICAgZ2VuTXNBdmc6IHRoaXMud29ya2VyU3RhdHMuZ2VuZXJhdGVkID8gTWF0aC5yb3VuZCh0aGlzLndvcmtlclN0YXRzLmdlbk1zIC8gdGhpcy53b3JrZXJTdGF0cy5nZW5lcmF0ZWQgKiAxMCkgLyAxMCA6IDAsXG4gICAgICBtZXNoTXNBdmc6IHRoaXMud29ya2VyU3RhdHMubWVzaGVkID8gTWF0aC5yb3VuZCh0aGlzLndvcmtlclN0YXRzLm1lc2hNcyAvIHRoaXMud29ya2VyU3RhdHMubWVzaGVkICogMTApIC8gMTAgOiAwLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHJlcXVlc3RHZW5lcmF0ZShjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgICBpZiAodGhpcy53b3JsZC5jaHVua3MuaGFzKGtleSkgfHwgdGhpcy5nZW5lcmF0aW5nLmhhcyhrZXkpIHx8ICF0aGlzLnBvb2wpIHJldHVybjtcbiAgICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm47XG4gICAgdGhpcy5nZW5lcmF0aW5nLmFkZChrZXkpO1xuICAgIGNvbnN0IHsgc2VlZCB9ID0gdGhpcy53b3JsZCwgdmVyc2lvbiA9IHRoaXMud29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb247XG4gICAgdm9pZCB0aGlzLnBvb2wuZ2VuZXJhdGUoc2VlZCwgdmVyc2lvbiwgY3gsIGN6KS50aGVuKChyKSA9PiB7XG4gICAgICB0aGlzLmdlbmVyYXRpbmcuZGVsZXRlKGtleSk7XG4gICAgICAvLyBUaGUgbWFpbiB0aHJlYWQgaXMgdGhlIG9ubHkgV29ybGQgd3JpdGVyOiBpbnN0YWxsIG9ubHkgaWYgc3RpbGwgd2FudGVkLlxuICAgICAgaWYgKHRoaXMud29ybGQuc2VlZCAhPT0gc2VlZCB8fCB0aGlzLndvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uICE9PSB2ZXJzaW9uXG4gICAgICAgIHx8IHRoaXMud29ybGQuY2h1bmtzLmhhcyhrZXkpKSB7IHRoaXMud29ya2VyU3RhdHMuZGlzY2FyZGVkKys7IHJldHVybjsgfVxuICAgICAgc2VlZEJhc2VDb2x1bW5zKHRoaXMud29ybGQsIGtleSwgci5jb2x1bW5zKTtcbiAgICAgIGluc3RhbGxCYXNlQ2h1bmsodGhpcy53b3JsZCwgci5iYXNlLCByLm1zKTtcbiAgICAgIHRoaXMud29ya2VyU3RhdHMuZ2VuZXJhdGVkKys7XG4gICAgICB0aGlzLndvcmtlclN0YXRzLmdlbk1zICs9IHIubXM7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHJlcXVlc3RNZXNoKGtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgY2h1bmsgPSB0aGlzLndvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rIHx8ICF0aGlzLnBvb2wpIHJldHVybjtcbiAgICBjb25zdCBzdGFtcCA9ICsrdGhpcy5zdGFtcENvdW50ZXI7XG4gICAgdGhpcy5tZXNoU3RhbXAuc2V0KGtleSwgc3RhbXApO1xuICAgIHRoaXMud29ybGQuZGlydHkuZGVsZXRlKGtleSk7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgcGFkZGVkID0gcGFkZGVkRm9yKHRoaXMud29ybGQsIGNodW5rKTtcbiAgICB2b2lkIHRoaXMucG9vbC5tZXNoKHBhZGRlZCwgY2h1bmsuaGVpZ2h0cywgb3gsIG96LCB0aGlzLndvcmxkLnNlZWQpLnRoZW4oKHIpID0+IHtcbiAgICAgIC8vIFN1cGVyc2VkZWQgKG5ld2VyIHJlcXVlc3QsIHVubG9hZGVkIG9yIHN5bmNocm9ub3VzbHkgcmVidWlsdCkgcmVzdWx0cyBhcmUgZHJvcHBlZC5cbiAgICAgIGlmICh0aGlzLm1lc2hTdGFtcC5nZXQoa2V5KSAhPT0gc3RhbXApIHsgdGhpcy53b3JrZXJTdGF0cy5kaXNjYXJkZWQrKzsgcmV0dXJuOyB9XG4gICAgICB0aGlzLm1lc2hTdGFtcC5kZWxldGUoa2V5KTtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLndvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICAgIGlmICghY3VycmVudCkgeyB0aGlzLndvcmtlclN0YXRzLmRpc2NhcmRlZCsrOyByZXR1cm47IH1cbiAgICAgIC8vIEFuIGVkaXQgdG8gdGhpcyBjaHVuayB3aGlsZSBpbiBmbGlnaHQgcmUtbWFya2VkIGl0IGRpcnR5OyB0aGUgcmVzdWx0IGlzXG4gICAgICAvLyBzdGlsbCBzaG93biBub3cgYW5kIHJlcGxhY2VkIGJ5IHRoZSBuZXh0IChmcmVzaCkgcmVxdWVzdC5cbiAgICAgIHRoaXMuYWRvcHRNZXNoKGtleSwgY3VycmVudCwgZ2VvbWV0cnlGcm9tQXJyYXlzKHIuYXJyYXlzKSk7XG4gICAgICB0aGlzLndvcmtlclN0YXRzLm1lc2hlZCsrO1xuICAgICAgdGhpcy53b3JrZXJTdGF0cy5tZXNoTXMgKz0gci5tcztcbiAgICAgIHRoaXMub25DaHVua3NDaGFuZ2VkPy4oKTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgYWRvcHRNZXNoKGtleTogc3RyaW5nLCBjaHVuazogVm94ZWxDaHVuaywgcmVzdWx0OiBNZXNoUmVzdWx0KTogdm9pZCB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHRoaXMubmVhckdyb3VwLnJlbW92ZShleGlzdGluZy5tZXNoKTtcbiAgICAgIGV4aXN0aW5nLm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICAgICAgaWYgKGV4aXN0aW5nLndhdGVyKSB7IHRoaXMud2F0ZXJHcm91cC5yZW1vdmUoZXhpc3Rpbmcud2F0ZXIpOyBleGlzdGluZy53YXRlci5nZW9tZXRyeS5kaXNwb3NlKCk7IH1cbiAgICB9XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKHJlc3VsdC5nZW9tZXRyeSwgdGVycmFpbk1hdGVyaWFsKTtcbiAgICBtZXNoLm5hbWUgPSBgdm94ZWxfY2h1bmtfJHtjaHVuay5jeH1fJHtjaHVuay5jen1gO1xuICAgIG1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gICAgbWVzaC5jYXN0U2hhZG93ID0gZmFsc2U7XG4gICAgdGhpcy5uZWFyR3JvdXAuYWRkKG1lc2gpO1xuICAgIGNvbnN0IHdhdGVyID0gbWVzaENodW5rV2F0ZXIodGhpcy53b3JsZCwgY2h1bmspO1xuICAgIGlmICh3YXRlcikgdGhpcy53YXRlckdyb3VwLmFkZCh3YXRlcik7XG4gICAgdGhpcy5jaHVua3Muc2V0KGtleSwgeyBtZXNoLCB3YXRlciwgdHJpYW5nbGVzOiByZXN1bHQudHJpYW5nbGVzICsgKHdhdGVyPy51c2VyRGF0YS53YXRlclRyaWFuZ2xlcyA/PyAwKSB9KTtcbiAgICB0aGlzLmxvYWRlZC5hZGQoa2V5KTtcbiAgfVxuXG4gIC8qKiBXb3JrZXIgc3RyZWFtaW5nOiBnZW5lcmF0ZSB0aGUgM3gzIG5laWdoYm91cmhvb2QsIHRoZW4gbWVzaCwgbmVhcmVzdCBmaXJzdC4gKi9cbiAgcHJpdmF0ZSBlbnN1cmVDaHVua3NBc3luYyhtaXNzaW5nOiBBcnJheTx7IGN4OiBudW1iZXI7IGN6OiBudW1iZXI7IGQ6IG51bWJlciB9Pik6IHZvaWQge1xuICAgIGNvbnN0IHBvb2wgPSB0aGlzLnBvb2whO1xuICAgIGNvbnN0IG1heEluRmxpZ2h0ID0gcG9vbC5zaXplICogMztcbiAgICBmb3IgKGNvbnN0IG0gb2YgbWlzc2luZykge1xuICAgICAgaWYgKHBvb2wuaW5GbGlnaHQgPj0gbWF4SW5GbGlnaHQpIGJyZWFrO1xuICAgICAgY29uc3Qga2V5ID0gY2h1bmtLZXkobS5jeCwgbS5jeik7XG4gICAgICBpZiAodGhpcy5tZXNoU3RhbXAuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgICAgbGV0IHJlYWR5ID0gdHJ1ZTtcbiAgICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIHtcbiAgICAgICAgZm9yIChsZXQgZHggPSAtMTsgZHggPD0gMTsgZHgrKykge1xuICAgICAgICAgIGNvbnN0IGN4ID0gbS5jeCArIGR4LCBjeiA9IG0uY3ogKyBkejtcbiAgICAgICAgICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSBjb250aW51ZTtcbiAgICAgICAgICBpZiAoIXRoaXMud29ybGQuY2h1bmtzLmhhcyhjaHVua0tleShjeCwgY3opKSkgeyByZWFkeSA9IGZhbHNlOyB0aGlzLnJlcXVlc3RHZW5lcmF0ZShjeCwgY3opOyB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChyZWFkeSkgdGhpcy5yZXF1ZXN0TWVzaChrZXkpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZW5zdXJlQ2h1bmtzKGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBpbW1lZGlhdGU6IGJvb2xlYW4sIGZyYW1lU3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKSk6IHZvaWQge1xuICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICBsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXG4gICAgY29uc3QgbWlzc2luZzogQXJyYXk8eyBjeDogbnVtYmVyOyBjejogbnVtYmVyOyBkOiBudW1iZXIgfT4gPSBbXTtcbiAgICBmb3IgKGxldCBkeiA9IC10aGlzLm5lYXJSYWRpdXM7IGR6IDw9IHRoaXMubmVhclJhZGl1czsgZHorKykge1xuICAgICAgZm9yIChsZXQgZHggPSAtdGhpcy5uZWFyUmFkaXVzOyBkeCA8PSB0aGlzLm5lYXJSYWRpdXM7IGR4KyspIHtcbiAgICAgICAgY29uc3QgY3ggPSBjY3ggKyBkeCwgY3ogPSBjY3ogKyBkejtcbiAgICAgICAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgY29udGludWU7XG4gICAgICAgIGlmICh0aGlzLmxvYWRlZC5oYXMoY2h1bmtLZXkoY3gsIGN6KSkpIGNvbnRpbnVlO1xuICAgICAgICBtaXNzaW5nLnB1c2goeyBjeCwgY3osIGQ6IGR4ICogZHggKyBkeiAqIGR6IH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBtaXNzaW5nLnNvcnQoKGEsIGIpID0+IGEuZCAtIGIuZCk7XG4gICAgbGV0IGJ1aWx0ID0gMDtcbiAgICBpZiAodGhpcy5wb29sICYmICFpbW1lZGlhdGUgJiYgIXRoaXMucG9vbC5mYWlsZWQpIHtcbiAgICAgIHRoaXMuZW5zdXJlQ2h1bmtzQXN5bmMobWlzc2luZyk7XG4gICAgICBtaXNzaW5nLmxlbmd0aCA9IDA7XG4gICAgfVxuICAgIGZvciAoY29uc3QgbSBvZiBtaXNzaW5nKSB7XG4gICAgICBpZiAoIWltbWVkaWF0ZSAmJiBidWlsdCA+IDAgJiYgcGVyZm9ybWFuY2Uubm93KCkgLSBmcmFtZVN0YXJ0ID49IHRoaXMuZnJhbWVCdWRnZXRNcykgYnJlYWs7XG4gICAgICB0aGlzLmJ1aWxkQ2h1bmsobS5jeCwgbS5jeik7XG4gICAgICBidWlsdCsrO1xuICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgfVxuICAgIHRoaXMucGVuZGluZ0NodW5rcyA9IHRoaXMucG9vbCAmJiAhaW1tZWRpYXRlID8gdGhpcy5tZXNoU3RhbXAuc2l6ZSArIHRoaXMuZ2VuZXJhdGluZy5zaXplIDogbWlzc2luZy5sZW5ndGggLSBidWlsdDtcblxuICAgIGNvbnN0IG1hcmdpbiA9IHRoaXMubmVhclJhZGl1cyArIDE7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgWy4uLnRoaXMubG9hZGVkXSkge1xuICAgICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICAgIGlmIChNYXRoLmFicyhjeCAtIGNjeCkgPiBtYXJnaW4gfHwgTWF0aC5hYnMoY3ogLSBjY3opID4gbWFyZ2luKSB7XG4gICAgICAgIHRoaXMuZGlzcG9zZUNodW5rKGtleSk7XG4gICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjaGFuZ2VkKSB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkQ2h1bmsoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gICAgY29uc3QgZ2VuQmVmb3JlID0gdGhpcy53b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXM7XG4gICAgY29uc3QgY2h1bmtzQmVmb3JlID0gdGhpcy53b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQ7XG4gICAgLy8gRW5zdXJlIHRoZSAzeDMgbmVpZ2hib3VyaG9vZCBleGlzdHMgc28gYm91bmRhcnkgZmFjZXMgdXNlIHJlYWwgZGF0YS5cbiAgICBmb3IgKGxldCBkeiA9IC0xOyBkeiA8PSAxOyBkeisrKSB7XG4gICAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSAxOyBkeCsrKSBlbnN1cmVDaHVuayh0aGlzLndvcmxkLCBjeCArIGR4LCBjeiArIGR6KTtcbiAgICB9XG4gICAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh0aGlzLndvcmxkLCBjeCwgY3opO1xuICAgIGlmICghY2h1bmspIHJldHVybjtcbiAgICBjb25zdCBnZW5lcmF0ZWQgPSB0aGlzLndvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCAtIGNodW5rc0JlZm9yZTtcbiAgICBpZiAoZ2VuZXJhdGVkID4gMCkge1xuICAgICAgcmVjb3JkU2FtcGxlKHRoaXMuY2h1bmtHZW5TYW1wbGVzLCAodGhpcy53b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgLSBnZW5CZWZvcmUpIC8gZ2VuZXJhdGVkKTtcbiAgICB9XG5cbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmIChleGlzdGluZykge1xuICAgICAgdGhpcy5uZWFyR3JvdXAucmVtb3ZlKGV4aXN0aW5nLm1lc2gpO1xuICAgICAgZXhpc3RpbmcubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICBpZiAoZXhpc3Rpbmcud2F0ZXIpIHsgdGhpcy53YXRlckdyb3VwLnJlbW92ZShleGlzdGluZy53YXRlcik7IGV4aXN0aW5nLndhdGVyLmdlb21ldHJ5LmRpc3Bvc2UoKTsgfVxuICAgIH1cblxuICAgIGNvbnN0IG1lc2hUMCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIGNvbnN0IHsgZ2VvbWV0cnksIHRyaWFuZ2xlcyB9ID0gbWVzaENodW5rKHRoaXMud29ybGQsIGNodW5rKTtcbiAgICByZWNvcmRTYW1wbGUodGhpcy5jaHVua01lc2hTYW1wbGVzLCBwZXJmb3JtYW5jZS5ub3coKSAtIG1lc2hUMCk7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCB0ZXJyYWluTWF0ZXJpYWwpO1xuICAgIG1lc2gubmFtZSA9IGB2b3hlbF9jaHVua18ke2N4fV8ke2N6fWA7XG4gICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgICB0aGlzLm5lYXJHcm91cC5hZGQobWVzaCk7XG4gICAgY29uc3Qgd2F0ZXIgPSBtZXNoQ2h1bmtXYXRlcih0aGlzLndvcmxkLCBjaHVuayk7XG4gICAgaWYgKHdhdGVyKSB0aGlzLndhdGVyR3JvdXAuYWRkKHdhdGVyKTtcbiAgICB0aGlzLmNodW5rcy5zZXQoa2V5LCB7IG1lc2gsIHdhdGVyLCB0cmlhbmdsZXM6IHRyaWFuZ2xlcyArICh3YXRlcj8udXNlckRhdGEud2F0ZXJUcmlhbmdsZXMgPz8gMCkgfSk7XG4gICAgdGhpcy5sb2FkZWQuYWRkKGtleSk7XG4gICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgfVxuXG4gIHByaXZhdGUgZGlzcG9zZUNodW5rKGtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgdmlldyA9IHRoaXMuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICh2aWV3KSB7XG4gICAgICB0aGlzLm5lYXJHcm91cC5yZW1vdmUodmlldy5tZXNoKTtcbiAgICAgIHZpZXcubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICBpZiAodmlldy53YXRlcikgeyB0aGlzLndhdGVyR3JvdXAucmVtb3ZlKHZpZXcud2F0ZXIpOyB2aWV3LndhdGVyLmdlb21ldHJ5LmRpc3Bvc2UoKTsgfVxuICAgICAgdGhpcy5jaHVua3MuZGVsZXRlKGtleSk7XG4gICAgfVxuICAgIHRoaXMubG9hZGVkLmRlbGV0ZShrZXkpO1xuICAgIHRoaXMubWVzaFN0YW1wLmRlbGV0ZShrZXkpO1xuICAgIGlmICh0aGlzLnBpbm5lZC5oYXMoa2V5KSkgcmV0dXJuO1xuICAgIHRoaXMud29ybGQuZGlydHkuZGVsZXRlKGtleSk7XG4gICAgZXZpY3RDaHVuayh0aGlzLndvcmxkLCBrZXkpO1xuICB9XG5cbiAgcHJpdmF0ZSByZWJ1aWxkQ2h1bmsoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgIHRoaXMuYnVpbGRDaHVuayhjeCwgY3opO1xuICB9XG5cbiAgLyoqIFJlLW1lc2ggZGlydHkgbG9hZGVkIGNodW5rcyBuZWFyZXN0LWZpcnN0LCBzaGFyaW5nIHRoZSBmcmFtZSBidWRnZXQuICovXG4gIHByaXZhdGUgcmVidWlsZERpcnR5KGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBmcmFtZVN0YXJ0OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBjY3ggPSB3b3JsZFRvQ2h1bmtYKE1hdGgucm91bmQoZm9jdXMueCkpO1xuICAgIGNvbnN0IGNjeiA9IHdvcmxkVG9DaHVua1ooTWF0aC5yb3VuZChmb2N1cy56KSk7XG4gICAgY29uc3QgZGlydHk6IEFycmF5PHsga2V5OiBzdHJpbmc7IGQ6IG51bWJlciB9PiA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHRoaXMubG9hZGVkKSB7XG4gICAgICBpZiAoIXRoaXMud29ybGQuZGlydHkuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICAgIGRpcnR5LnB1c2goeyBrZXksIGQ6IChjeCAtIGNjeCkgKiogMiArIChjeiAtIGNjeikgKiogMiB9KTtcbiAgICB9XG4gICAgaWYgKGRpcnR5Lmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgIGRpcnR5LnNvcnQoKGEsIGIpID0+IGEuZCAtIGIuZCk7XG4gICAgaWYgKHRoaXMucG9vbCAmJiAhdGhpcy5wb29sLmZhaWxlZCkge1xuICAgICAgZm9yIChjb25zdCB7IGtleSB9IG9mIGRpcnR5KSBpZiAoIXRoaXMubWVzaFN0YW1wLmhhcyhrZXkpIHx8IHRoaXMud29ybGQuZGlydHkuaGFzKGtleSkpIHRoaXMucmVxdWVzdE1lc2goa2V5KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHJlYnVpbHQgPSAwO1xuICAgIGZvciAoY29uc3QgeyBrZXkgfSBvZiBkaXJ0eSkge1xuICAgICAgaWYgKHJlYnVpbHQgPiAwICYmIHBlcmZvcm1hbmNlLm5vdygpIC0gZnJhbWVTdGFydCA+PSB0aGlzLmZyYW1lQnVkZ2V0TXMpIGJyZWFrO1xuICAgICAgdGhpcy5yZWJ1aWxkQ2h1bmsoa2V5KTtcbiAgICAgIHJlYnVpbHQrKztcbiAgICB9XG4gICAgaWYgKHJlYnVpbHQgPiAwKSB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gIH1cblxuICAvKipcbiAgICogQ2h1bmsgbGlmZXRpbWUgcG9saWN5LiBNZXNoaW5nIGdlbmVyYXRlcyBhIHJpbmcgb2YgbmVpZ2hib3VyIGNodW5rcywgYW5kXG4gICAqIHNpbXVsYXRpb24gcXVlcmllcyBjYW4gZ2VuZXJhdGUgbW9yZTsgbm9uZSBvZiB0aG9zZSB3ZXJlIGV2ZXIgcmVsZWFzZWQuXG4gICAqIFJlc2lkZW50IGNodW5rIGJ5dGVzIGFyZSBkZXJpdmVkIChyZWdlbmVyYXRlZCBmcm9tIHNlZWQgKyBkdXJhYmxlIGVkaXRzKSxcbiAgICogc28gYW55dGhpbmcgb3V0c2lkZSB0aGUga2VlcCByYWRpdXMgdGhhdCBpcyBub3QgbG9hZGVkIG9yIHBpbm5lZCBpcyBmcmVlZC5cbiAgICovXG4gIHByaXZhdGUgc3dlZXBSZXNpZGVudChmb2N1czogVEhSRUUuVmVjdG9yMyk6IHZvaWQge1xuICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICBjb25zdCBrZWVwID0gdGhpcy5uZWFyUmFkaXVzICsgMjtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbLi4udGhpcy53b3JsZC5jaHVua3Mua2V5cygpXSkge1xuICAgICAgaWYgKHRoaXMubG9hZGVkLmhhcyhrZXkpIHx8IHRoaXMucGlubmVkLmhhcyhrZXkpIHx8IHRoaXMubWVzaFN0YW1wLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgICBpZiAoTWF0aC5hYnMoY3ggLSBjY3gpIDw9IGtlZXAgJiYgTWF0aC5hYnMoY3ogLSBjY3opIDw9IGtlZXApIGNvbnRpbnVlO1xuICAgICAgZXZpY3RDaHVuayh0aGlzLndvcmxkLCBrZXkpO1xuICAgICAgdGhpcy53b3JsZC5kaXJ0eS5kZWxldGUoa2V5KTtcbiAgICAgIHRoaXMuc3dlcHRDaHVua3MrKztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogS2VlcCB0aGUgY2h1bmtzIHVuZGVyIGEgd29ybGQtc3BhY2UgcmVjdGFuZ2xlIHJlc2lkZW50IChmb3IgZXhhbXBsZSB0aGVcbiAgICogc2V0dGxlbWVudCBlbnZlbG9wZSB0aGF0IGNvbnN0cnVjdGlvbiBwcmV2aWV3cyBxdWVyeSBzZXZlcmFsIHRpbWVzIGEgc2Vjb25kKS5cbiAgICovXG4gIHBpblJlY3QobWluWDogbnVtYmVyLCBtaW5aOiBudW1iZXIsIG1heFg6IG51bWJlciwgbWF4WjogbnVtYmVyKTogdm9pZCB7XG4gICAgZm9yIChsZXQgY3ogPSB3b3JsZFRvQ2h1bmtaKG1pblopIC0gMTsgY3ogPD0gd29ybGRUb0NodW5rWihtYXhaKSArIDE7IGN6KyspIHtcbiAgICAgIGZvciAobGV0IGN4ID0gd29ybGRUb0NodW5rWChtaW5YKSAtIDE7IGN4IDw9IHdvcmxkVG9DaHVua1gobWF4WCkgKyAxOyBjeCsrKSB7XG4gICAgICAgIGlmIChjeCA+PSAwICYmIGN6ID49IDAgJiYgY3ggPCBDSFVOS1NfUEVSX1NJREUgJiYgY3ogPCBDSFVOS1NfUEVSX1NJREUpIHRoaXMucGlubmVkLmFkZChjaHVua0tleShjeCwgY3opKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgcmVzaWRlbnRDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMud29ybGQuY2h1bmtzLnNpemU7IH1cbiAgZ2V0IHBlbmRpbmdDaHVua0J1aWxkcygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wZW5kaW5nQ2h1bmtzOyB9XG4gIGdldCBldmljdGVkQnlTd2VlcCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5zd2VwdENodW5rczsgfVxuXG4gIHJlYnVpbGRBcm91bmQoeDogbnVtYmVyLCB6OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgICBmb3IgKGxldCBkeiA9IC0xOyBkeiA8PSAxOyBkeisrKSB7XG4gICAgICBmb3IgKGxldCBkeCA9IC0xOyBkeCA8PSAxOyBkeCsrKSB7XG4gICAgICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4ICsgZHgsIGN6ICsgZHopO1xuICAgICAgICB0aGlzLm1lc2hTdGFtcC5kZWxldGUoa2V5KTtcbiAgICAgICAgaWYgKHRoaXMubG9hZGVkLmhhcyhrZXkpKSB0aGlzLnJlYnVpbGRDaHVuayhrZXkpO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLm9uQ2h1bmtzQ2hhbmdlZD8uKCk7XG4gICAgaWYgKHRoaXMubWFjcm8ubGVuZ3RoKSB0aGlzLnJlYnVpbGRNYWNybyh0aGlzLm1hY3JvRm9jdXMsIHRoaXMubW9kZSwgdHJ1ZSk7XG4gIH1cblxuICBwcml2YXRlIHJlYnVpbGRNYWNybyhmb2N1czogVEhSRUUuVmVjdG9yMywgbW9kZTogVmlld01vZGUsIGZvcmNlOiBib29sZWFuKTogdm9pZCB7XG4gICAgaWYgKCFmb3JjZSAmJiB0aGlzLm1hY3JvTW9kZSA9PT0gbW9kZSkge1xuICAgICAgY29uc3QgbW92ZWQgPSBNYXRoLmh5cG90KGZvY3VzLnggLSB0aGlzLm1hY3JvRm9jdXMueCwgZm9jdXMueiAtIHRoaXMubWFjcm9Gb2N1cy56KTtcbiAgICAgIGlmIChtb2RlID09PSAnbWFwJyB8fCBtb3ZlZCA8PSA0OCkgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBtYWNyb1QwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgZm9yIChjb25zdCB0aWxlIG9mIHRoaXMubWFjcm8pIHtcbiAgICAgIHRoaXMubWFjcm9Hcm91cC5yZW1vdmUodGlsZSk7XG4gICAgICAvLyBUaWxlcyBzaGFyZSB0aGVpciBidWZmZXJzOyBkaXNwb3NpbmcgZWFjaCB2aWV3IGZyZWVzIHRoZW0gb25jZS5cbiAgICAgIHRpbGUuZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICAgIH1cbiAgICB0aGlzLm1hY3JvID0gW107XG4gICAgY29uc3Qgc3RlcCA9IG1vZGUgPT09ICdtYXAnID8gdGhpcy5tYXBNYWNyb1N0ZXAgOiB0aGlzLndvcmxkTWFjcm9TdGVwO1xuICAgIGxldCBob2xlOiBNYWNyb0hvbGUgfCB1bmRlZmluZWQ7XG4gICAgaWYgKG1vZGUgIT09ICdtYXAnKSB7XG4gICAgICBjb25zdCBjY3ggPSB3b3JsZFRvQ2h1bmtYKE1hdGgucm91bmQoZm9jdXMueCkpO1xuICAgICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICAgIGNvbnN0IHIgPSB0aGlzLmRpc3BsYXlSYWRpdXM7XG4gICAgICBob2xlID0ge1xuICAgICAgICBtaW5YOiBjaHVua09yaWdpblgoY2N4IC0gciksXG4gICAgICAgIG1heFg6IGNodW5rT3JpZ2luWChjY3ggKyByKSArIENIVU5LX1NJWkUsXG4gICAgICAgIG1pblo6IGNodW5rT3JpZ2luWihjY3ogLSByKSxcbiAgICAgICAgbWF4WjogY2h1bmtPcmlnaW5aKGNjeiArIHIpICsgQ0hVTktfU0laRSxcbiAgICAgIH07XG4gICAgICB0aGlzLmhvbGVDaHVua3MgPSB7IG1pblg6IGNjeCAtIHIsIG1heFg6IGNjeCArIHIsIG1pblo6IGNjeiAtIHIsIG1heFo6IGNjeiArIHIgfTtcbiAgICAgIHRoaXMuZmFyV2F0ZXJIb2xlLnZhbHVlLnNldChob2xlLm1pblgsIGhvbGUubWluWiwgaG9sZS5tYXhYLCBob2xlLm1heFopO1xuICAgIH1cbiAgICB0aGlzLm1hY3JvRGlzcGxheVJhZGl1cyA9IHRoaXMuZGlzcGxheVJhZGl1cztcbiAgICBjb25zdCByZXN1bHQgPSBidWlsZE1hY3JvTWVzaCh0aGlzLndvcmxkLCB7IHN0ZXAsIGhvbGUsIGZvY3VzOiBtb2RlID09PSAnbWFwJyA/IHVuZGVmaW5lZCA6IGZvY3VzIH0pO1xuICAgIHRoaXMubWFjcm8gPSByZXN1bHQubWVzaGVzO1xuICAgIHRoaXMubWFjcm9UcmlhbmdsZXMgPSByZXN1bHQudHJpYW5nbGVzO1xuICAgIHRoaXMubWFjcm9Hcm91cC5hZGQoLi4ucmVzdWx0Lm1lc2hlcyk7XG4gICAgdGhpcy5tYWNyb0ZvY3VzLmNvcHkoZm9jdXMpO1xuICAgIHRoaXMubWFjcm9Nb2RlID0gbW9kZTtcbiAgICB0aGlzLm1hY3JvRWRpdEtleSA9IG1hY3JvRWRpdEtleSh0aGlzLndvcmxkKTtcbiAgICByZWNvcmRTYW1wbGUodGhpcy5tYWNyb1NhbXBsZXMsIHBlcmZvcm1hbmNlLm5vdygpIC0gbWFjcm9UMCk7XG4gICAgaWYgKHJlc3VsdC5zYW1wbGVDYWNoZWQpIHRoaXMubWFjcm9DYWNoZUhpdHMrKztcbiAgICBlbHNlIHJlY29yZFNhbXBsZSh0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcywgcmVzdWx0LnNhbXBsZU1zKTtcbiAgfVxuXG4gIGdldCBsb2FkZWRDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubG9hZGVkLnNpemU7IH1cbiAgZ2V0IGxvYWRlZENodW5rS2V5cygpOiBSZWFkb25seVNldDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMubG9hZGVkOyB9XG4gIC8qKiBMb2FkZWQgY2h1bmtzIHdob3NlIG1lc2hlcyBhcmUgZHJhd24gKGFsbCBvZiB0aGVtIHVubGVzcyB6b29tZWQgb3V0KS4gKi9cbiAgZ2V0IGRpc3BsYXllZENodW5rS2V5cygpOiBSZWFkb25seVNldDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMuZGlzcGxheVJhZGl1cyA+PSB0aGlzLm5lYXJSYWRpdXMgPyB0aGlzLmxvYWRlZCA6IHRoaXMuZGlzcGxheWVkOyB9XG4gIGdldCBkaXNwbGF5ZWRDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZGlzcGxheWVkQ2h1bmtLZXlzLnNpemU7IH1cbiAgZ2V0IG5lYXJUcmlhbmdsZXMoKTogbnVtYmVyIHtcbiAgICBsZXQgdCA9IDA7XG4gICAgZm9yIChjb25zdCB2IG9mIHRoaXMuY2h1bmtzLnZhbHVlcygpKSB0ICs9IHYudHJpYW5nbGVzO1xuICAgIHJldHVybiB0O1xuICB9XG4gIC8qKiBUcmlhbmdsZXMgb2YgdGhlIG5lYXIgY2h1bmtzIGN1cnJlbnRseSBkcmF3biAoc2VlIGRpc3BsYXllZENodW5rS2V5cykuICovXG4gIGdldCBuZWFyRGlzcGxheWVkVHJpYW5nbGVzKCk6IG51bWJlciB7XG4gICAgbGV0IHQgPSAwO1xuICAgIGZvciAoY29uc3QgdiBvZiB0aGlzLmNodW5rcy52YWx1ZXMoKSkgaWYgKHYubWVzaC52aXNpYmxlKSB0ICs9IHYudHJpYW5nbGVzO1xuICAgIHJldHVybiB0O1xuICB9XG4gIGdldCBtYWNyb1RyaWFuZ2xlQ291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubWFjcm9UcmlhbmdsZXM7IH1cbiAgLyoqIFRyaWFuZ2xlcyB0aGUgbWFjcm8gZHJhd3MgYWZ0ZXIgdGhlIGxhc3QgY3VsbE1hY3JvIGNhbGwgKHJ1bnMsIGluY2x1ZGluZyBicmlkZ2VkIHRpbGVzKS4gKi9cbiAgZ2V0IG1hY3JvVmlzaWJsZVRyaWFuZ2xlcygpOiBudW1iZXIge1xuICAgIGxldCB0ID0gMDtcbiAgICBmb3IgKGNvbnN0IHRpbGUgb2YgdGhpcy5tYWNybykge1xuICAgICAgaWYgKCF0aWxlLnZpc2libGUpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZyA9IHRpbGUuZ2VvbWV0cnk7XG4gICAgICB0ICs9IE1hdGgubWluKGcuZHJhd1JhbmdlLmNvdW50LCBnLmluZGV4Py5jb3VudCA/PyAwKSAvIDM7XG4gICAgfVxuICAgIHJldHVybiB0O1xuICB9XG4gIC8qKiBNYWNybyB0aWxlcyB3aG9zZSBib3ggaXMgaW5zaWRlIHRoZSBmcnVzdHVtIGF0IHRoZSBsYXN0IGN1bGxNYWNybyBjYWxsLiAqL1xuICBnZXQgbWFjcm9UaWxlc0luVmlldygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5tYWNyb0luVmlldzsgfVxuXG4gIC8qKlxuICAgKiBIaWRlIG1hY3JvIHRpbGVzIHdob3NlIGJvdW5kaW5nIGJveCBpcyBvdXRzaWRlIHRoZSBjYW1lcmEgZnJ1c3R1bSwgdGhlblxuICAgKiBkcmF3IGVhY2ggcnVuIG9mIGNvbnNlY3V0aXZlIHZpc2libGUgdGlsZXMgKHJvdy1tYWpvciwgc2hhcmluZyBvbmUgaW5kZXhcbiAgICogYnVmZmVyKSBhcyBvbmUgY2FsbC4gVGhyZWUgb25seSBjdWxscyBieSBib3VuZGluZyBzcGhlcmUsIHdoaWNoIG5ldmVyXG4gICAqIHJlamVjdHMgYSAyNTYgbSB0aWxlIG5leHQgdG8gdGhlIGNhbWVyYTsgdGhlIGJveCB0ZXN0IGFsc28gZHJvcHMgZmFyXG4gICAqIHRpbGVzIGJlbG93IHRoZSBmcnVzdHVtIHdoZW4gdGhlIGNhbWVyYSBwaXRjaGVzIGRvd24uIEEgcnVuIGNvbnRpbnVlc1xuICAgKiBhY3Jvc3MgYW4gb2ZmLXNjcmVlbiB0aWxlIG9mIGF0IG1vc3QgTUFDUk9fQlJJREdFX1RSSUFOR0xFUy4gUmV2aWV3IHYxOlxuICAgKiBhdCB0aGUgMTQwMCBtIGJ1aWxkZXIgem9vbSA0MCB0aWxlcyB3ZXJlIG9uIHNjcmVlbiBhbmQgZWFjaCBjb3N0IGEgY2FsbC5cbiAgICogUHJlc2VudGF0aW9uIG9ubHksIGNhbGwgb25jZSBwZXIgZnJhbWUgYmVmb3JlIHJlbmRlci5cbiAgICovXG4gIGN1bGxNYWNybyhjYW1lcmE6IFRIUkVFLkNhbWVyYSk6IHZvaWQge1xuICAgIGlmICh0aGlzLm1hY3JvLmxlbmd0aCA8PSAxKSB7XG4gICAgICBmb3IgKGNvbnN0IHRpbGUgb2YgdGhpcy5tYWNybykgdGlsZS52aXNpYmxlID0gdHJ1ZTtcbiAgICAgIHRoaXMubWFjcm9JblZpZXcgPSB0aGlzLm1hY3JvLmxlbmd0aDtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY2FtZXJhLnVwZGF0ZU1hdHJpeFdvcmxkKCk7XG4gICAgX2N1bGxNYXRyaXgubXVsdGlwbHlNYXRyaWNlcyhjYW1lcmEucHJvamVjdGlvbk1hdHJpeCwgY2FtZXJhLm1hdHJpeFdvcmxkSW52ZXJzZSk7XG4gICAgX2N1bGxGcnVzdHVtLnNldEZyb21Qcm9qZWN0aW9uTWF0cml4KF9jdWxsTWF0cml4KTtcbiAgICBjb25zdCBuID0gdGhpcy5tYWNyby5sZW5ndGg7XG4gICAgY29uc3QgaW5WaWV3ID0gdGhpcy5tYWNyb1Zpc2liaWxpdHkubGVuZ3RoID09PSBuID8gdGhpcy5tYWNyb1Zpc2liaWxpdHkgOiAodGhpcy5tYWNyb1Zpc2liaWxpdHkgPSBuZXcgQXJyYXk8Ym9vbGVhbj4obikpO1xuICAgIGxldCBjb3VudCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgIGNvbnN0IGJveCA9IHRoaXMubWFjcm9baV0uZ2VvbWV0cnkuYm91bmRpbmdCb3g7XG4gICAgICBpblZpZXdbaV0gPSAhYm94IHx8IF9jdWxsRnJ1c3R1bS5pbnRlcnNlY3RzQm94KGJveCk7XG4gICAgICBpZiAoaW5WaWV3W2ldKSBjb3VudCsrO1xuICAgIH1cbiAgICB0aGlzLm1hY3JvSW5WaWV3ID0gY291bnQ7XG4gICAgbGV0IGhlYWQ6IFRIUkVFLk1lc2ggfCBudWxsID0gbnVsbCwgaGVhZFN0YXJ0ID0gMCwgZ2FwID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgY29uc3QgdGlsZSA9IHRoaXMubWFjcm9baV07XG4gICAgICBjb25zdCByYW5nZSA9IHRpbGUudXNlckRhdGEubWFjcm9SYW5nZSBhcyB7IHN0YXJ0OiBudW1iZXI7IGNvdW50OiBudW1iZXIgfTtcbiAgICAgIHRpbGUudmlzaWJsZSA9IGZhbHNlO1xuICAgICAgaWYgKCFpblZpZXdbaV0pIHsgZ2FwICs9IHJhbmdlLmNvdW50IC8gMzsgY29udGludWU7IH1cbiAgICAgIGlmIChoZWFkICYmIGdhcCA8PSBNQUNST19CUklER0VfVFJJQU5HTEVTKSB7XG4gICAgICAgIGhlYWQuZ2VvbWV0cnkuc2V0RHJhd1JhbmdlKGhlYWRTdGFydCwgcmFuZ2Uuc3RhcnQgKyByYW5nZS5jb3VudCAtIGhlYWRTdGFydCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBoZWFkID0gdGlsZTtcbiAgICAgICAgaGVhZFN0YXJ0ID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHRpbGUudmlzaWJsZSA9IHRydWU7XG4gICAgICAgIHRpbGUuZ2VvbWV0cnkuc2V0RHJhd1JhbmdlKGhlYWRTdGFydCwgcmFuZ2UuY291bnQpO1xuICAgICAgfVxuICAgICAgZ2FwID0gMDtcbiAgICB9XG4gIH1cbiAgZ2V0IGRyYXdDYWxscygpOiBudW1iZXIge1xuICAgIGxldCBuZWFyID0gMCwgd2F0ZXIgPSAwO1xuICAgIGZvciAoY29uc3QgW2tleSwgdl0gb2YgdGhpcy5jaHVua3MpIHtcbiAgICAgIGlmICghdGhpcy5sb2FkZWQuaGFzKGtleSkgfHwgIXYubWVzaC52aXNpYmxlKSBjb250aW51ZTtcbiAgICAgIG5lYXIrKztcbiAgICAgIGlmICh2LndhdGVyKSB3YXRlcisrO1xuICAgIH1cbiAgICBsZXQgbWFjcm8gPSAwO1xuICAgIGZvciAoY29uc3QgdGlsZSBvZiB0aGlzLm1hY3JvKSBpZiAodGlsZS52aXNpYmxlKSBtYWNybysrO1xuICAgIHJldHVybiBuZWFyICsgd2F0ZXIgKyBtYWNybyArIDE7XG4gIH1cbiAgZ2V0IG5lYXJSYWRpdXNDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubmVhclJhZGl1czsgfVxuICAvKiogQ2xlYXIgdGhlIHJvbGxpbmcgdGltaW5nIHdpbmRvdyBiZWZvcmUgYSBtZWFzdXJlbWVudCBydW4uICovXG4gIHJlc2V0UGVyZigpOiB2b2lkIHtcbiAgICB0aGlzLmNodW5rR2VuU2FtcGxlcy5sZW5ndGggPSAwO1xuICAgIHRoaXMuY2h1bmtNZXNoU2FtcGxlcy5sZW5ndGggPSAwO1xuICAgIHRoaXMubWFjcm9TYW1wbGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5tYWNyb1NhbXBsZVNhbXBsZXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLm1hY3JvQ2FjaGVIaXRzID0gMDtcbiAgfVxuICAvKiogUm9sbGluZyBidWlsZCB0aW1pbmdzIGluIG1pbGxpc2Vjb25kcywgZm9yIHRoZSBwZXJmb3JtYW5jZSBldmlkZW5jZS4gKi9cbiAgZ2V0IHN0cmVhbVBlcmYoKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNodW5rR2VuUDUwOiBwZXJjZW50aWxlKHRoaXMuY2h1bmtHZW5TYW1wbGVzLCAwLjUpLFxuICAgICAgY2h1bmtHZW5QOTU6IHBlcmNlbnRpbGUodGhpcy5jaHVua0dlblNhbXBsZXMsIDAuOTUpLFxuICAgICAgY2h1bmtHZW5NYXg6IHBlcmNlbnRpbGUodGhpcy5jaHVua0dlblNhbXBsZXMsIDEpLFxuICAgICAgY2h1bmtNZXNoUDUwOiBwZXJjZW50aWxlKHRoaXMuY2h1bmtNZXNoU2FtcGxlcywgMC41KSxcbiAgICAgIGNodW5rTWVzaFA5NTogcGVyY2VudGlsZSh0aGlzLmNodW5rTWVzaFNhbXBsZXMsIDAuOTUpLFxuICAgICAgY2h1bmtNZXNoTWF4OiBwZXJjZW50aWxlKHRoaXMuY2h1bmtNZXNoU2FtcGxlcywgMSksXG4gICAgICBtYWNyb1A1MDogcGVyY2VudGlsZSh0aGlzLm1hY3JvU2FtcGxlcywgMC41KSxcbiAgICAgIG1hY3JvTWF4OiBwZXJjZW50aWxlKHRoaXMubWFjcm9TYW1wbGVzLCAxKSxcbiAgICAgIG1hY3JvU2FtcGxlUDUwOiBwZXJjZW50aWxlKHRoaXMubWFjcm9TYW1wbGVTYW1wbGVzLCAwLjUpLFxuICAgICAgbWFjcm9TYW1wbGVNYXg6IHBlcmNlbnRpbGUodGhpcy5tYWNyb1NhbXBsZVNhbXBsZXMsIDEpLFxuICAgICAgbWFjcm9DYWNoZUhpdHM6IHRoaXMubWFjcm9DYWNoZUhpdHMsXG4gICAgICBjaHVua1NhbXBsZXM6IHRoaXMuY2h1bmtHZW5TYW1wbGVzLmxlbmd0aCxcbiAgICAgIG1hY3JvU2FtcGxlczogdGhpcy5tYWNyb1NhbXBsZXMubGVuZ3RoLFxuICAgIH07XG4gIH1cbn1cbiIsICIvLyBSZW5kZXIgbGF5ZXIgXHUyMDE0IG5lYXIgd2F0ZXIgc3VyZmFjZXMgYnVpbHQgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB3YXRlciB2b3hlbHMuXG4vL1xuLy8gR2VvbWV0cnkgY29tZXMgZnJvbSB0aGUgdm94ZWwgdm9sdW1lIChzbyBlZGl0cywgZHVnIHBpdHMgYW5kIHRoZSB2MiBtb3VudGFpblxuLy8gcml2ZXIgYXJlIGV4YWN0KS4gRWFjaCB3YXRlciBjb2x1bW4ncyB0b3AgZ2V0cyBhIHF1YWQgY2Fycnlpbmc6XG4vLyAgIGFGbG93ICBcdTIwMTQgc3VyZmFjZSBjdXJyZW50IChkaXJlY3Rpb24gKiBzcGVlZCwgbS9zKSBmcm9tIHNpbSBIeWRyb2xvZ3ksXG4vLyAgIGFEZXB0aCBcdTIwMTQgd2F0ZXIgZGVwdGggdG8gdGhlIGJlZCAobWV0cmVzKSxcbi8vICAgYUZvYW0gIFx1MjAxNCBzaG9yZSAvIGNhc2NhZGUgZm9hbSB3ZWlnaHQuXG4vLyBXaGVyZSBhIHdhdGVyIHN1cmZhY2Ugc3RhbmRzIGFib3ZlIGEgbG93ZXIgbmVpZ2hib3VyIChhIGNhc2NhZGUgb3IgZmFsbCksIGFcbi8vIHZlcnRpY2FsIHNoZWV0IGlzIGVtaXR0ZWQgZG93biB0byB0aGUgbmVpZ2hib3VyJ3Mgc3VyZmFjZS5cbi8vXG4vLyBIeWRyb2xvZ3kgaXMgc2ltdWxhdGlvbiBkYXRhOyByaXBwbGVzLCBmb2FtIGFuZCB0cmFuc3BhcmVuY3kgaGVyZSBhcmVcbi8vIHByZXNlbnRhdGlvbiBvbmx5IGFuZCBuZXZlciBmZWVkIGJhY2sgaW50byBzdGF0ZS5cbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCBwYWxldHRlIGZyb20gJy4uL2RhdGEvcGFsZXR0ZS5qc29uJztcbmltcG9ydCB7XG4gIFdvcmxkLCBWb3hlbENodW5rLCBNQVQsIENIVU5LX1NJWkUsIFlfTUlOLCBZX01BWCwgaXNTb2xpZCxcbiAgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosIGxvY2FsSW5kZXgsIHlUb0luZGV4LCBnZXRWb3hlbCwgaHlkcm9sb2d5Rm9yLFxufSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5jb25zdCBNID0gcGFsZXR0ZS5tYXRlcmlhbHMgYXMgUmVjb3JkPHN0cmluZywgeyBoZXg6IHN0cmluZyB9PjtcbmNvbnN0IEggPSAoazogc3RyaW5nKSA9PiBuZXcgVEhSRUUuQ29sb3IoTVtrXS5oZXgpO1xuXG4vKiogU2hhcmVkIHRpbWUgdW5pZm9ybSBmb3IgZXZlcnkgd2F0ZXIgbWF0ZXJpYWwuICovXG5leHBvcnQgY29uc3Qgd2F0ZXJUaW1lID0geyB2YWx1ZTogMCB9O1xuXG5mdW5jdGlvbiBtYWtlV2F0ZXJNYXRlcmlhbCgpOiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsIHtcbiAgY29uc3QgbWF0ID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICAgIHZlcnRleENvbG9yczogdHJ1ZSwgdHJhbnNwYXJlbnQ6IHRydWUsIGRlcHRoV3JpdGU6IGZhbHNlLCBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlLFxuICB9KTtcbiAgbWF0Lm9uQmVmb3JlQ29tcGlsZSA9IChzaGFkZXIpID0+IHtcbiAgICBzaGFkZXIudW5pZm9ybXMudVRpbWUgPSB3YXRlclRpbWU7XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVTaGFsbG93ID0geyB2YWx1ZTogSCgnd2F0ZXJfc2hhbGxvdycpIH07XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVNaWQgPSB7IHZhbHVlOiBIKCd3YXRlcl9taWQnKSB9O1xuICAgIHNoYWRlci51bmlmb3Jtcy51RGVlcCA9IHsgdmFsdWU6IEgoJ3dhdGVyX2RlZXAnKSB9O1xuICAgIHNoYWRlci51bmlmb3Jtcy51UmltID0geyB2YWx1ZTogSCgnd2F0ZXJfcmltJykgfTtcbiAgICBzaGFkZXIudmVydGV4U2hhZGVyID0gc2hhZGVyLnZlcnRleFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgYCNpbmNsdWRlIDxjb21tb24+XG5hdHRyaWJ1dGUgdmVjMiBhRmxvdztcbmF0dHJpYnV0ZSBmbG9hdCBhRGVwdGg7XG5hdHRyaWJ1dGUgZmxvYXQgYUZvYW07XG5hdHRyaWJ1dGUgZmxvYXQgYVNoZWV0O1xudmFyeWluZyB2ZWMyIHZGbG93O1xudmFyeWluZyBmbG9hdCB2RGVwdGg7XG52YXJ5aW5nIGZsb2F0IHZGb2FtO1xudmFyeWluZyBmbG9hdCB2U2hlZXQ7XG52YXJ5aW5nIHZlYzMgdldvcmxkUG9zVztgKVxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+JywgYCNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+XG52RmxvdyA9IGFGbG93OyB2RGVwdGggPSBhRGVwdGg7IHZGb2FtID0gYUZvYW07IHZTaGVldCA9IGFTaGVldDtcbnZXb3JsZFBvc1cgPSAobW9kZWxNYXRyaXggKiB2ZWM0KHRyYW5zZm9ybWVkLCAxLjApKS54eXo7YCk7XG4gICAgc2hhZGVyLmZyYWdtZW50U2hhZGVyID0gc2hhZGVyLmZyYWdtZW50U2hhZGVyXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCBgI2luY2x1ZGUgPGNvbW1vbj5cbnVuaWZvcm0gZmxvYXQgdVRpbWU7XG51bmlmb3JtIHZlYzMgdVNoYWxsb3c7IHVuaWZvcm0gdmVjMyB1TWlkOyB1bmlmb3JtIHZlYzMgdURlZXA7IHVuaWZvcm0gdmVjMyB1UmltO1xudmFyeWluZyB2ZWMyIHZGbG93O1xudmFyeWluZyBmbG9hdCB2RGVwdGg7XG52YXJ5aW5nIGZsb2F0IHZGb2FtO1xudmFyeWluZyBmbG9hdCB2U2hlZXQ7XG52YXJ5aW5nIHZlYzMgdldvcmxkUG9zVztcbmZsb2F0IHdIYXNoKHZlYzIgcCkgeyByZXR1cm4gZnJhY3Qoc2luKGRvdChwLCB2ZWMyKDEyNy4xLCAzMTEuNykpKSAqIDQzNzU4LjU0NTMpOyB9XG5mbG9hdCB3Tm9pc2UodmVjMiBwKSB7XG4gIHZlYzIgaSA9IGZsb29yKHApLCBmID0gZnJhY3QocCk7XG4gIGYgPSBmICogZiAqICgzLjAgLSAyLjAgKiBmKTtcbiAgcmV0dXJuIG1peChtaXgod0hhc2goaSksIHdIYXNoKGkgKyB2ZWMyKDEsIDApKSwgZi54KSwgbWl4KHdIYXNoKGkgKyB2ZWMyKDAsIDEpKSwgd0hhc2goaSArIHZlYzIoMSwgMSkpLCBmLngpLCBmLnkpO1xufWApXG4gICAgICAucmVwbGFjZSgndmVjNCBkaWZmdXNlQ29sb3IgPSB2ZWM0KCBkaWZmdXNlLCBvcGFjaXR5ICk7JywgYFxuZmxvYXQgc3BlZWQgPSBsZW5ndGgodkZsb3cpO1xuLy8gQWR2ZWN0IHRoZSBwYXR0ZXJuIGRvd25zdHJlYW0uIFF1YW50aXNlZCB0byAwLjI1IG0gY2VsbHMgc28gcmlwcGxlcyByZWFkIGFzXG4vLyBibG9jay1idWlsdCBmYWNldHMgcmF0aGVyIHRoYW4gc21vb3RoIGdyYWRpZW50cy5cbnZlYzIgcCA9IHZXb3JsZFBvc1cueHo7XG52ZWMyIGFkdiA9IHAgLSB2RmxvdyAqIHVUaW1lO1xudmVjMiBjZWxsID0gZmxvb3IoYWR2ICogNC4wKSAvIDQuMDtcbmZsb2F0IG4xID0gd05vaXNlKGNlbGwgKiAwLjU1KTtcbmZsb2F0IG4yID0gd05vaXNlKGNlbGwgKiAxLjcgKyB2ZWMyKHVUaW1lICogMC4wNywgLXVUaW1lICogMC4wNSkpO1xuZmxvYXQgcmlwcGxlID0gbjEgKiAwLjYgKyBuMiAqIDAuNDtcbi8vIFN0aWxsIHdhdGVyIChzZWEsIGxha2UpIGdldHMgYSBzbG93IHN3ZWxsIGluc3RlYWQgb2YgYSBjdXJyZW50LlxuZmxvYXQgc3dlbGwgPSAwLjUgKyAwLjUgKiBzaW4oZG90KHAsIHZlYzIoMC4xMSwgMC4wNykpICsgdVRpbWUgKiAwLjYpO1xucmlwcGxlID0gbWl4KG1peChyaXBwbGUsIHN3ZWxsLCAwLjUpLCByaXBwbGUsIGNsYW1wKHNwZWVkICogMi4wLCAwLjAsIDEuMCkpO1xuZmxvYXQgZCA9IGNsYW1wKHZEZXB0aCAvIDQuMCwgMC4wLCAxLjApO1xudmVjMyB3YXRlciA9IG1peCh1U2hhbGxvdywgdU1pZCwgc21vb3Roc3RlcCgwLjAsIDAuNSwgZCkpO1xud2F0ZXIgPSBtaXgod2F0ZXIsIHVEZWVwLCBzbW9vdGhzdGVwKDAuNSwgMS4wLCBkKSk7XG53YXRlciAqPSAwLjkgKyAwLjIgKiByaXBwbGU7XG4vLyBTdHJlYWtzIGFsb25nIGZhc3QgY3VycmVudCwgZm9hbSBhdCBzaG9yZXMgYW5kIGNhc2NhZGVzLlxuZmxvYXQgc3RyZWFrID0gc3RlcCgwLjc4IC0gY2xhbXAoc3BlZWQgKiAwLjA2LCAwLjAsIDAuMiksIG4yKSAqIGNsYW1wKHNwZWVkICogMC41LCAwLjAsIDEuMCk7XG5mbG9hdCBmb2FtTm9pc2UgPSBzdGVwKDAuNDUsIHdOb2lzZShjZWxsICogMi4zICsgdVRpbWUgKiAwLjMpKTtcbmZsb2F0IGZvYW0gPSBjbGFtcCh2Rm9hbSAqIGZvYW1Ob2lzZSArIHN0cmVhayAqIDAuNiwgMC4wLCAxLjApO1xuLy8gRmFsbGluZyBzaGVldHM6IGZhc3QgdmVydGljYWwgc3RyZWFrcy5cbmlmICh2U2hlZXQgPiAwLjUpIHtcbiAgZmxvYXQgZmFsbCA9IHdOb2lzZSh2ZWMyKGZsb29yKHZXb3JsZFBvc1cueCAqIDQuMCArIHZXb3JsZFBvc1cueiAqIDQuMCksIGZsb29yKCh2V29ybGRQb3NXLnkgKyB1VGltZSAqIDMuNSkgKiAzLjApKSk7XG4gIGZvYW0gPSBtYXgoZm9hbSwgc3RlcCgwLjM1LCBmYWxsKSk7XG59XG52ZWMzIGNvbCA9IG1peCh3YXRlciwgdVJpbSAqIDEuMDgsIGZvYW0pO1xuZmxvYXQgYWxwaGEgPSBtaXgoMC41NSwgMC45LCBzbW9vdGhzdGVwKDAuNCwgMy4wLCB2RGVwdGgpKTtcbmFscGhhID0gbWF4KGFscGhhLCBmb2FtICogMC45NSk7XG5pZiAodlNoZWV0ID4gMC41KSBhbHBoYSA9IG1heChhbHBoYSwgMC44Mik7XG52ZWM0IGRpZmZ1c2VDb2xvciA9IHZlYzQoIGRpZmZ1c2UgKiBjb2wsIGFscGhhICogb3BhY2l0eSApO2ApO1xuICB9O1xuICByZXR1cm4gbWF0O1xufVxuXG5leHBvcnQgY29uc3QgbmVhcldhdGVyTWF0ZXJpYWwgPSBtYWtlV2F0ZXJNYXRlcmlhbCgpO1xuXG4vKiogTWVzaCB0aGUgd2F0ZXIgc3VyZmFjZXMgb2Ygb25lIGNodW5rOyBudWxsIHdoZW4gdGhlIGNodW5rIGhvbGRzIG5vIHdhdGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lc2hDaHVua1dhdGVyKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiBUSFJFRS5NZXNoIHwgbnVsbCB7XG4gIGNvbnN0IGh5ZHJvID0gaHlkcm9sb2d5Rm9yKHdvcmxkLnNlZWQsIHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIGNvbnN0IGxldmVscyA9IG5ldyBJbnQxNkFycmF5KENIVU5LX1NJWkUgKiBDSFVOS19TSVpFKS5maWxsKC05OTk5KTtcbiAgY29uc3QgYmVkcyA9IG5ldyBJbnQxNkFycmF5KENIVU5LX1NJWkUgKiBDSFVOS19TSVpFKTtcblxuICAvLyBXYXRlciBzdXJmYWNlIHBlciBjb2x1bW46IHRoZSBmaXJzdCBub24td2F0ZXIgY2VsbCBhYm92ZSB0aGUgd2F0ZXIgdGhhdFxuICAvLyBzdGFuZHMgb24gdGhpcyBjb2x1bW4ncyBzb2xpZCBzdXJmYWNlLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbnN0IGJlZCA9IGNodW5rLmhlaWdodHNbY29sXSArIFlfTUlOICsgMTtcbiAgICAgIGxldCB5ID0gYmVkO1xuICAgICAgd2hpbGUgKHkgPCBZX01BWCAmJiBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildID09PSBNQVQuV0FURVIpIHkrKztcbiAgICAgIGlmICh5ID4gYmVkKSB7IGxldmVsc1tjb2xdID0geTsgYmVkc1tjb2xdID0gYmVkOyB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcG9zOiBudW1iZXJbXSA9IFtdLCBucm06IG51bWJlcltdID0gW10sIGNscjogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgZmxvdzogbnVtYmVyW10gPSBbXSwgZGVwdGg6IG51bWJlcltdID0gW10sIGZvYW06IG51bWJlcltdID0gW10sIHNoZWV0OiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBpZHg6IG51bWJlcltdID0gW107XG4gIGNvbnN0IHB1c2ggPSAoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgbng6IG51bWJlciwgbnk6IG51bWJlciwgbno6IG51bWJlcixcbiAgICBmeDogbnVtYmVyLCBmejogbnVtYmVyLCBkZXA6IG51bWJlciwgZm86IG51bWJlciwgc2g6IG51bWJlcikgPT4ge1xuICAgIHBvcy5wdXNoKHgsIHksIHopOyBucm0ucHVzaChueCwgbnksIG56KTsgY2xyLnB1c2goMSwgMSwgMSk7XG4gICAgZmxvdy5wdXNoKGZ4LCBmeik7IGRlcHRoLnB1c2goZGVwKTsgZm9hbS5wdXNoKGZvKTsgc2hlZXQucHVzaChzaCk7XG4gIH07XG4gIGNvbnN0IHF1YWQgPSAoYmFzZTogbnVtYmVyKSA9PiB7IGlkeC5wdXNoKGJhc2UsIGJhc2UgKyAxLCBiYXNlICsgMiwgYmFzZSwgYmFzZSArIDIsIGJhc2UgKyAzKTsgfTtcblxuICBjb25zdCBsZXZlbEF0ID0gKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGlmIChseCA+PSAwICYmIGx6ID49IDAgJiYgbHggPCBDSFVOS19TSVpFICYmIGx6IDwgQ0hVTktfU0laRSkgcmV0dXJuIGxldmVsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgLy8gTmVpZ2hib3VyIGNodW5rOiByZWFkIHRoZSB2b3hlbHMgKGNodW5rcyBhcmUgZ2VuZXJhdGVkIGluIDN4MyByaW5ncyBmb3IgbWVzaGluZykuXG4gICAgbGV0IHkgPSBZX01BWCAtIDE7XG4gICAgd2hpbGUgKHkgPiBZX01JTiAmJiAhaXNTb2xpZChnZXRWb3hlbCh3b3JsZCwgd3gsIHksIHd6KSkgJiYgZ2V0Vm94ZWwod29ybGQsIHd4LCB5LCB3eikgIT09IE1BVC5XQVRFUikgeS0tO1xuICAgIHJldHVybiBnZXRWb3hlbCh3b3JsZCwgd3gsIHksIHd6KSA9PT0gTUFULldBVEVSID8geSArIDEgOiAtOTk5OTtcbiAgfTtcblxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbnN0IGxldmVsID0gbGV2ZWxzW2NvbF07XG4gICAgICBpZiAobGV2ZWwgPT09IC05OTk5KSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHggPSBveCArIGx4LCB6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGYgPSBoeWRyby5mbG93QXQoeCArIDAuNSwgeiArIDAuNSwgbGV2ZWwpO1xuICAgICAgY29uc3QgZnggPSBmLmR4ICogZi5zcGVlZCwgZnogPSBmLmR6ICogZi5zcGVlZDtcbiAgICAgIGNvbnN0IGRlcCA9IGxldmVsIC0gYmVkc1tjb2xdO1xuICAgICAgbGV0IHNob3JlID0gMDtcbiAgICAgIGNvbnN0IHNpZGVzOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiA9IFtbMSwgMF0sIFstMSwgMF0sIFswLCAxXSwgWzAsIC0xXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIHNpZGVzKSB7XG4gICAgICAgIGNvbnN0IG0gPSBnZXRWb3hlbCh3b3JsZCwgeCArIGR4LCBsZXZlbCAtIDEsIHogKyBkeik7XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSBzaG9yZSA9IDE7XG4gICAgICB9XG4gICAgICBjb25zdCB5ID0gbGV2ZWwgLSAwLjE7XG4gICAgICBjb25zdCBiYXNlID0gcG9zLmxlbmd0aCAvIDM7XG4gICAgICBjb25zdCBmbyA9IE1hdGgubWF4KHNob3JlICogMC42NSwgTWF0aC5taW4oMSwgZi5zcGVlZCAvIDMuNSkpO1xuICAgICAgcHVzaCh4LCB5LCB6LCAwLCAxLCAwLCBmeCwgZnosIGRlcCwgZm8sIDApO1xuICAgICAgcHVzaCh4LCB5LCB6ICsgMSwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHB1c2goeCArIDEsIHksIHogKyAxLCAwLCAxLCAwLCBmeCwgZnosIGRlcCwgZm8sIDApO1xuICAgICAgcHVzaCh4ICsgMSwgeSwgeiwgMCwgMSwgMCwgZngsIGZ6LCBkZXAsIGZvLCAwKTtcbiAgICAgIHF1YWQoYmFzZSk7XG5cbiAgICAgIC8vIENhc2NhZGUgc2hlZXRzIHRvd2FyZCBsb3dlciB3YXRlciAob3Igb3BlbiBhaXIpIG9uIGFueSBzaWRlLlxuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBzaWRlcykge1xuICAgICAgICBjb25zdCBuTGV2ZWwgPSBsZXZlbEF0KHggKyBkeCwgeiArIGR6LCBseCArIGR4LCBseiArIGR6KTtcbiAgICAgICAgaWYgKG5MZXZlbCA9PT0gLTk5OTkgfHwgbkxldmVsID49IGxldmVsKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGlzU29saWQoZ2V0Vm94ZWwod29ybGQsIHggKyBkeCwgbGV2ZWwgLSAxLCB6ICsgZHopKSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHRvcCA9IGxldmVsIC0gMC4xLCBib3R0b20gPSBuTGV2ZWwgLSAwLjE7XG4gICAgICAgIGNvbnN0IGIgPSBwb3MubGVuZ3RoIC8gMztcbiAgICAgICAgLy8gRmFjZSBvbiB0aGUgc2hhcmVkIGVkZ2UsIG9yaWVudGVkIHRvd2FyZCB0aGUgbG93ZXIgbmVpZ2hib3VyLlxuICAgICAgICBjb25zdCBleCA9IGR4ID4gMCA/IHggKyAxIDogZHggPCAwID8geCA6IHgsIGV6ID0gZHogPiAwID8geiArIDEgOiBkeiA8IDAgPyB6IDogejtcbiAgICAgICAgaWYgKGR4ICE9PSAwKSB7XG4gICAgICAgICAgcHVzaChleCwgdG9wLCB6LCBkeCwgMCwgMCwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaChleCwgdG9wLCB6ICsgMSwgZHgsIDAsIDAsIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goZXgsIGJvdHRvbSwgeiArIDEsIGR4LCAwLCAwLCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKGV4LCBib3R0b20sIHosIGR4LCAwLCAwLCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwdXNoKHgsIHRvcCwgZXosIDAsIDAsIGR6LCAwLCAwLCAyLCAxLCAxKTtcbiAgICAgICAgICBwdXNoKHggKyAxLCB0b3AsIGV6LCAwLCAwLCBkeiwgMCwgMCwgMiwgMSwgMSk7XG4gICAgICAgICAgcHVzaCh4ICsgMSwgYm90dG9tLCBleiwgMCwgMCwgZHosIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICAgIHB1c2goeCwgYm90dG9tLCBleiwgMCwgMCwgZHosIDAsIDAsIDIsIDEsIDEpO1xuICAgICAgICB9XG4gICAgICAgIHF1YWQoYik7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChpZHgubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZyA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICBnLnNldEF0dHJpYnV0ZSgncG9zaXRpb24nLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShwb3MsIDMpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ25vcm1hbCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKG5ybSwgMykpO1xuICBnLnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShjbHIsIDMpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FGbG93JywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoZmxvdywgMikpO1xuICBnLnNldEF0dHJpYnV0ZSgnYURlcHRoJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoZGVwdGgsIDEpKTtcbiAgZy5zZXRBdHRyaWJ1dGUoJ2FGb2FtJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoZm9hbSwgMSkpO1xuICBnLnNldEF0dHJpYnV0ZSgnYVNoZWV0JywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoc2hlZXQsIDEpKTtcbiAgZy5zZXRJbmRleChpZHgpO1xuICBnLmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZywgbmVhcldhdGVyTWF0ZXJpYWwpO1xuICBtZXNoLm5hbWUgPSBgd2F0ZXJfY2h1bmtfJHtjaHVuay5jeH1fJHtjaHVuay5jen1gO1xuICBtZXNoLnJlbmRlck9yZGVyID0gMjtcbiAgbWVzaC51c2VyRGF0YS53YXRlclRyaWFuZ2xlcyA9IGlkeC5sZW5ndGggLyAzO1xuICByZXR1cm4gbWVzaDtcbn1cblxuLyoqXG4gKiBDdXQgYSByZWN0YW5ndWxhciBob2xlIGluIHRoZSBmYXIgKG9wYXF1ZSkgc2VhIHBsYW5lIHdoZXJlIG5lYXIgY2h1bmtzIGRyYXdcbiAqIHRoZWlyIG93biB0cmFuc3BhcmVudCB3YXRlciwgc28gc2hhbGxvd3Mgc2hvdyB0aGUgcmVhbCBiZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsRmFyV2F0ZXJIb2xlKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCk6IHsgdmFsdWU6IFRIUkVFLlZlY3RvcjQgfSB7XG4gIGNvbnN0IGhvbGUgPSB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yNCgwLCAwLCAwLCAwKSB9O1xuICBtYXRlcmlhbC5vbkJlZm9yZUNvbXBpbGUgPSAoc2hhZGVyKSA9PiB7XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVIb2xlID0gaG9sZTtcbiAgICBzaGFkZXIudmVydGV4U2hhZGVyID0gc2hhZGVyLnZlcnRleFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgJyNpbmNsdWRlIDxjb21tb24+XFxudmFyeWluZyB2ZWMyIHZGYXJYWjsnKVxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+JywgJyNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+XFxudkZhclhaID0gKG1vZGVsTWF0cml4ICogdmVjNCh0cmFuc2Zvcm1lZCwgMS4wKSkueHo7Jyk7XG4gICAgc2hhZGVyLmZyYWdtZW50U2hhZGVyID0gc2hhZGVyLmZyYWdtZW50U2hhZGVyXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbW1vbj4nLCAnI2luY2x1ZGUgPGNvbW1vbj5cXG51bmlmb3JtIHZlYzQgdUhvbGU7XFxudmFyeWluZyB2ZWMyIHZGYXJYWjsnKVxuICAgICAgLnJlcGxhY2UoJ3ZlYzQgZGlmZnVzZUNvbG9yID0gdmVjNCggZGlmZnVzZSwgb3BhY2l0eSApOycsXG4gICAgICAgICdpZiAodkZhclhaLnggPiB1SG9sZS54ICYmIHZGYXJYWi54IDwgdUhvbGUueiAmJiB2RmFyWFoueSA+IHVIb2xlLnkgJiYgdkZhclhaLnkgPCB1SG9sZS53KSBkaXNjYXJkO1xcbnZlYzQgZGlmZnVzZUNvbG9yID0gdmVjNCggZGlmZnVzZSwgb3BhY2l0eSApOycpO1xuICB9O1xuICByZXR1cm4gaG9sZTtcbn1cbiIsICJ7XG4gIFwic2NoZW1hXCI6IFwicGFsZXR0ZV92MlwiLFxuICBcImRhdGVcIjogXCIyMDI2LTEwLTIyXCIsXG4gIFwic3RhdHVzXCI6IFwicHJvcG9zZWRcIixcbiAgXCJzb3VyY2VcIjogXCJSRUYtMDAyIChoeWJyaWQgd29ybGQgcmVmZXJlbmNlKSwgdmFsdWVzIHNhbXBsZWQgYnkgZXllOyBudW1lcmljIHZlcmlmaWNhdGlvbiBwZW5kaW5nXCIsXG4gIFwibm90ZVwiOiBcIk9uZSBtYXRlcmlhbCBwYWxldHRlLiBUaW1lIG9mIGRheSBpcyBleHByZXNzZWQgYnkgdGhlIGxpZ2h0aW5nIHByZXNldHMgYmVsb3csIG5vdCBieSByZXBhaW50aW5nIG1hdGVyaWFscy5cIixcbiAgXCJtYXRlcmlhbHNcIjoge1xuICAgIFwiZ3Jhc3NfdG9wXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzc5Qjk0Q1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGxvdyBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19oaWdoXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhGQzk1RVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIG1pZCBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19wZWFrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlBRDA2QVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGhpZ2ggZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfY2FwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVFOTQ0MFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuMC0wLjQgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfb2NocmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQzk5QTVGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC40LTAuNjIgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfcnVzdFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCNDYzM0NcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjYyLTAuODAgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdG9uZV90b3BcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZERkNDXCIsXG4gICAgICBcInJvbGVcIjogXCJiYXJlIHN0b25lIHRvcCBzdXJmYWNlXCJcbiAgICB9LFxuICAgIFwic3RvbmVfYm9keV9hXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0RDRDNCRVwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBib2R5LCBldmVuIDQuNSBtIGJhbmRcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9ib2R5X2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDFDN0FGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJvZHksIG9kZCA0LjUgbSBiYW5kXCJcbiAgICB9LFxuICAgIFwic3RvbmVfc2hhZGVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjlBRTk2XCIsXG4gICAgICBcInJvbGVcIjogXCJjcmV2aWNlIC8gcmVjZXNzZWQgc3RvbmUgYWNjZW50XCJcbiAgICB9LFxuICAgIFwic2FuZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFM0QzQTZcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlIGNlbGxzXCJcbiAgICB9LFxuICAgIFwic25vd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNFRUYxRjVcIixcbiAgICAgIFwicm9sZVwiOiBcImdlbmVyYXRvciB2MiBzbm93ZmllbGRzIGFib3ZlIHRoZSBzbm93bGluZSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfc2tpblwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEOUE3N0VcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBza2luIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90dW5pY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNCMzRBM0NcIixcbiAgICAgIFwicm9sZVwiOiBcImZvdW5kZXIgdHVuaWMsIHdhcm0gcmVkIGFjY2VudCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfdHVuaWNfYWx0XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJFOEM4NlwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZXIgdHVuaWMsIHRlYWwgYWNjZW50IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl90cm91c2Vyc1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM1QjQ2MzZcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciB0cm91c2VycyAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImNoYXJfaGFpclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM0QTMzMjRcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBoYWlyIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiY2hhcl9ib290c1wiOiB7XG4gICAgICBcImhleFwiOiBcIiMzMzI4MUZcIixcbiAgICAgIFwicm9sZVwiOiBcImNoYXJhY3RlciBib290cyBhbmQgYmVsdCAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX2RlZXJcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEM1QjNBXCIsXG4gICAgICBcInJvbGVcIjogXCJyZWQgZGVlciBjb2F0IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiZmF1bmFfbGlnaHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRENDN0E0XCIsXG4gICAgICBcInJvbGVcIjogXCJkZWVyIGJlbGx5LCBoYXJlIHRhaWwsIGFudGxlciAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImZhdW5hX2hhcmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUE4NjcwXCIsXG4gICAgICBcInJvbGVcIjogXCJoYXJlIGNvYXQgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV90cm91dFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2RjdGNUVcIixcbiAgICAgIFwicm9sZVwiOiBcInRyb3V0IGJhY2sgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJmYXVuYV90cm91dF9iZWxseVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEOEM5QTNcIixcbiAgICAgIFwicm9sZVwiOiBcInRyb3V0IGJlbGx5IChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF9wbGFzdGVyXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U4RERDNlwiLFxuICAgICAgXCJyb2xlXCI6IFwidmlsbGFnZSB3YWxsIHBsYXN0ZXIgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RpbWJlclwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2QTQ1MzBcIixcbiAgICAgIFwicm9sZVwiOiBcInZpbGxhZ2UgdGltYmVyIGZyYW1lIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aW1iZXJfbGlnaHRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEE2MTQyXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIHBsYW5rcyBhbmQgZG9vcnMgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3RoYXRjaFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNDN0EyNTdcIixcbiAgICAgIFwicm9sZVwiOiBcInRoYXRjaCByb29mIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwiYXJjaF90aGF0Y2hfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QzdCM0NcIixcbiAgICAgIFwicm9sZVwiOiBcInRoYXRjaCByb29mIHNoYWRlIGNvdXJzZSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcImFyY2hfc3RvbmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUI5QTkxXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIG1hc29ucnkgKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJhcmNoX3N0b25lX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNzQ3MzZDXCIsXG4gICAgICBcInJvbGVcIjogXCJ2aWxsYWdlIG1hc29ucnkgam9pbnRzIGFuZCBwbGludGggKGFkZGVkIDIwMjYtMTEtMjMsIHJldmlldyByZXF1aXJlZClcIlxuICAgIH0sXG4gICAgXCJwcm9wX2lyb25cIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0EzQTNGXCIsXG4gICAgICBcInJvbGVcIjogXCJpcm9uIGZpdHRpbmdzIChhZGRlZCAyMDI2LTExLTIzLCByZXZpZXcgcmVxdWlyZWQpXCJcbiAgICB9LFxuICAgIFwicHJvcF9nbG93XCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0ZGRDI3RlwiLFxuICAgICAgXCJyb2xlXCI6IFwibGFudGVybiBsaWdodCAoZW1pc3NpdmUsIGVmZmVjdCBvbmx5KSAoYWRkZWQgMjAyNi0xMS0yMywgcmV2aWV3IHJlcXVpcmVkKVwiXG4gICAgfSxcbiAgICBcIndhdGVyX3NoYWxsb3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNjdDRkQ4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA8PSAwLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX21pZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzQUFGQzRcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoIH4xLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX2RlZXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkE4RkE4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA+PSA0LjAgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX3JpbVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCRkVBRjBcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlbGluZSByaW0gLyBmb2FtIHRpbnRcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fYVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1RkE4M0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGQjg0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM3RkMzNTZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgaGlnaGxpZ2h0IG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfcGlua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNGMkE2QzRcIixcbiAgICAgIFwicm9sZVwiOiBcImJsb3Nzb20gYWNjZW50IHNwZWNpZXMgb25seVwiXG4gICAgfSxcbiAgICBcImNhbm9weV9waW5rX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTg4RkIyXCIsXG4gICAgICBcInJvbGVcIjogXCJibG9zc29tIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJ0cnVua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM2QjRBMzNcIixcbiAgICAgIFwicm9sZVwiOiBcInRyZWUgdHJ1bmtzXCJcbiAgICB9LFxuICAgIFwiYmFya19kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRFMzYyNlwiLFxuICAgICAgXCJyb2xlXCI6IFwidHJ1bmsgc2hhZGUsIHN0dW1wc1wiXG4gICAgfSxcbiAgICBcImNvbmlmZXJfcGluZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM0QzhBNEFcIixcbiAgICAgIFwicm9sZVwiOiBcInBpbmUgbmVlZGxlcywgbWFpbiBtYXNzXCJcbiAgICB9LFxuICAgIFwiY29uaWZlcl9waW5lX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNUM5QzUzXCIsXG4gICAgICBcInJvbGVcIjogXCJwaW5lIG5lZWRsZXMsIGhpZ2hsaWdodFwiXG4gICAgfSxcbiAgICBcImNvbmlmZXJfc3BydWNlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJGNkI0OFwiLFxuICAgICAgXCJyb2xlXCI6IFwic3BydWNlIG5lZWRsZXMsIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImNvbmlmZXJfc3BydWNlX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0U3RjU2XCIsXG4gICAgICBcInJvbGVcIjogXCJzcHJ1Y2UgbmVlZGxlcywgaGlnaGxpZ2h0XCJcbiAgICB9LFxuICAgIFwiYmlyY2hfYmFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNFNkUxRDNcIixcbiAgICAgIFwicm9sZVwiOiBcInBhbGUgYmlyY2ggdHJ1bmtcIlxuICAgIH0sXG4gICAgXCJiaXJjaF9tYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNBMzUzMFwiLFxuICAgICAgXCJyb2xlXCI6IFwiZGFyayBiaXJjaCBiYXJrIGJhbmRcIlxuICAgIH0sXG4gICAgXCJiaXJjaF9sZWFmXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlDQzk1QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmlyY2ggY2Fub3B5LCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJiaXJjaF9sZWFmX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjNENzZCXCIsXG4gICAgICBcInJvbGVcIjogXCJiaXJjaCBjYW5vcHksIGhpZ2hsaWdodFwiXG4gICAgfSxcbiAgICBcImJlZWNoX2JhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOEU4OTdEXCIsXG4gICAgICBcInJvbGVcIjogXCJzbW9vdGggZ3JleSBiZWVjaCB0cnVua1wiXG4gICAgfSxcbiAgICBcImJlZWNoX2xlYWZcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNTU4RjNBXCIsXG4gICAgICBcInJvbGVcIjogXCJiZWVjaCBjYW5vcHksIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJiZWVjaF9sZWFmX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNjdBNDQ1XCIsXG4gICAgICBcInJvbGVcIjogXCJiZWVjaCBjYW5vcHksIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImJ1c2hfZGFya1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM0NjdGMzdcIixcbiAgICAgIFwicm9sZVwiOiBcImJlcnJ5IGJ1c2ggbGVhdmVzXCJcbiAgICB9LFxuICAgIFwiYmVycnlfcmVkXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0M4Mzk0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmVycmllc1wiXG4gICAgfSxcbiAgICBcImZlcm5fZ3JlZW5cIjoge1xuICAgICAgXCJoZXhcIjogXCIjODZCRTU1XCIsXG4gICAgICBcInJvbGVcIjogXCJmZXJuIGZyb25kcywgbWFpblwiXG4gICAgfSxcbiAgICBcImZlcm5fZ3JlZW5fYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiM2RkE3NDZcIixcbiAgICAgIFwicm9sZVwiOiBcImZlcm4gZnJvbmRzLCBzaGFkZVwiXG4gICAgfSxcbiAgICBcImZsb3dlcl95ZWxsb3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRjJDRjRBXCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IG1lYWRvdyBmbG93ZXIgaGVhZHNcIlxuICAgIH0sXG4gICAgXCJmbG93ZXJfd2hpdGVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRjRGMUU0XCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IGRhaXN5IGZsb3dlciBoZWFkc1wiXG4gICAgfSxcbiAgICBcImZsb3dlcl92aW9sZXRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUM3QkQ2XCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IHZpb2xldCBmbG93ZXIgaGVhZHNcIlxuICAgIH0sXG4gICAgXCJtdXNocm9vbV9jYXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjg0ODNBXCIsXG4gICAgICBcInJvbGVcIjogXCJncm91bmQgY292ZXI6IGZvcmVzdCBtdXNocm9vbSBjYXBcIlxuICAgIH0sXG4gICAgXCJtdXNocm9vbV9zdGVtXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0VERTNDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JvdW5kIGNvdmVyOiBtdXNocm9vbSBzdGVtXCJcbiAgICB9LFxuICAgIFwibW9zc19ncmVlblwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1QzhDM0FcIixcbiAgICAgIFwicm9sZVwiOiBcImdyb3VuZCBjb3ZlcjogbW9zcyBvbiBmYWxsZW4gbG9nc1wiXG4gICAgfSxcbiAgICBcIm9yZV9jcnlzdGFsXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzdCNUFENlwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGRlcG9zaXQgYWNjZW50IChwcm9wb3NlZCwgcmVwbGFjZXMgdGVhbClcIlxuICAgIH0sXG4gICAgXCJvcmVfY3J5c3RhbF9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlCN0JFOFwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGhpZ2hsaWdodCBmYWNldFwiXG4gICAgfSxcbiAgICBcIm5veGVsX3N0b25lXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2REZDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgYXJjaGl0ZWN0dXJlIG1haW4gc3RvbmVcIlxuICAgIH0sXG4gICAgXCJub3hlbF9zdG9uZV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QzQzlCNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgc2Vjb25kYXJ5IHN0b25lIC8gcmVjZXNzXCJcbiAgICB9LFxuICAgIFwiYWNjZW50X2JsdWVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0U3RkI4XCIsXG4gICAgICBcInJvbGVcIjogXCJiYW5uZXIgLyBjbG90aCBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJhY2NlbnRfdGVhbFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyRkE2QTBcIixcbiAgICAgIFwicm9sZVwiOiBcInNlY29uZGFyeSBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJlbWlzc2l2ZV9maXJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0ZGOUU0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2FtcGZpcmUgLyB3YXJtIGVtaXNzaXZlIChlZmZlY3RzIG9ubHkpXCJcbiAgICB9LFxuICAgIFwiZW1pc3NpdmVfbWFnaWNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDI0QkZGXCIsXG4gICAgICBcInJvbGVcIjogXCJyZXNlcnZlZDogbWFnaWMgZWZmZWN0cyBvbmx5LCBuZXZlciBtYXRlcmlhbHNcIlxuICAgIH1cbiAgfSxcbiAgXCJsaWdodGluZ1wiOiB7XG4gICAgXCJkYXduXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDEyLFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDEwNSxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZDNzlBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAyLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEZBNkM4XCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNEU1RjZFXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMC42LFxuICAgICAgXCJza3lcIjogXCIjQThCRUQ2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNBOEJFRDZcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNSxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4xXG4gICAgfSxcbiAgICBcIm5vb25cIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogMzgsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogNTAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGRjREQ1wiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMi43NSxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiNCRkQ5RjJcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM3QThGNTVcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAwLjU1LFxuICAgICAgXCJza3lcIjogXCIjOUVEMkVFXCIsXG4gICAgICBcImZvZ1wiOiBcIiNEQ0VGRjhcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMjgsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMDVcbiAgICB9LFxuICAgIFwiZHVza1wiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiA5LFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDI1MCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZCMjdBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAzLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEU3QzlFXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNUE0QTUwXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMS4xLFxuICAgICAgXCJza3lcIjogXCIjQzk4RTg2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNDMDkwOEFcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMzYsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMzJcbiAgICB9LFxuICAgIFwibmlnaHRcIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogNDAsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMjIwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNBRkM4RkZcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDEuMCxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiMzQTRDN0FcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiMxQzI1NDBcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAxLjA1LFxuICAgICAgXCJza3lcIjogXCIjMTAxNzM2XCIsXG4gICAgICBcImZvZ1wiOiBcIiMxNTFDM0NcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNDUsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuNVxuICAgIH1cbiAgfVxufSIsICIvLyBQcml2YXRlIG1pZ3JhdGlvbiByZXBsYXkgb25seS4gUmV0aXJlZCBlbnRpdGllcyBsaXZlIGluIHRoaXMgV29ybGQgd2hpbGUgYW5cbi8vIGFjY2VwdGVkIGhpc3RvcmljYWwgam91cm5hbCBpcyBjaGVja2VkOyBubyBwdWJsaWMgY29tbWFuZCBlbmFibGVzIHRoaXMgbW9kZS5cbmludGVyZmFjZSBSZXBsYXlTdGF0ZSB7XG4gIGFjdGl2ZTogYm9vbGVhbjtcbiAgaGlzdG9yaWNhbEhhc2g6IGJvb2xlYW47XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBzdGF0ZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFJlcGxheVN0YXRlPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZDogb2JqZWN0KTogUmVwbGF5U3RhdGUge1xuICBsZXQgc3RhdGUgPSBzdGF0ZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzdGF0ZSkgeyBzdGF0ZSA9IHsgYWN0aXZlOiBmYWxzZSwgaGlzdG9yaWNhbEhhc2g6IGZhbHNlLCBtaWdyYXRlZDogZmFsc2UgfTsgc3RhdGVzLnNldCh3b3JsZCwgc3RhdGUpOyB9XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xuICBzdGF0ZS5taWdyYXRlZCA9IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uYWN0aXZlID8/IGZhbHNlO1xufVxuXG4vKiogU25hcHNob3QgaGFzaGVzIGJlZm9yZSBhbmQgZHVyaW5nIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5IGluY2x1ZGUgc3RvbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZUhpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lmhpc3RvcmljYWxIYXNoID8/IGZhbHNlO1xufVxuXG4vKiogQSBtaWdyYXRlZCBzbmFwc2hvdCBhbHJlYWR5IGhhcyByZXRpcmVtZW50IHRvbWJzdG9uZXMgaW4gZ2VuZXJhdGVkIGNodW5rcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8ubWlncmF0ZWQgPz8gZmFsc2U7XG59XG5cbi8qKiBFeGl0IGhpc3RvcmljYWwgbW9kZSBhZnRlciBhbGwgYWNjZXB0ZWQgY29tbWFuZHMgYW5kIGhhc2hlcyBoYXZlIHBhc3NlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IGZhbHNlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IGZhbHNlO1xuICBzdGF0ZS5taWdyYXRlZCA9IHRydWU7XG59XG4iLCAiLy8gRGV0ZXJtaW5pc3RpYyBoYXNoLCBub2lzZSBhbmQgbWF0aCBoZWxwZXJzIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllci5cbi8vIFB1cmUgVHlwZVNjcmlwdCAoRC0wMDUpLiBFeHRyYWN0ZWQgZnJvbSB3b3JsZC50cyB1bmNoYW5nZWQgc28gdGVycmFpblxuLy8gZ2VuZXJhdG9ycyBvZiBldmVyeSB2ZXJzaW9uIHVzZSBpZGVudGljYWwgcHJpbWl0aXZlcy5cbmV4cG9ydCBjb25zdCBjbGFtcCA9ICh2OiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiAodiA8IGEgPyBhIDogdiA+IGIgPyBiIDogdik7XG5leHBvcnQgY29uc3QgbGVycCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgdDogbnVtYmVyKSA9PiBhICsgKGIgLSBhKSAqIHQ7XG5leHBvcnQgY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5leHBvcnQgY29uc3Qgc21vb3RoID0gKHQ6IG51bWJlcikgPT4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UyKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKTtcbiAgY29uc3QgYSA9IGhhc2gyaSh4aSwgeWksIHNlZWQpLCBiID0gaGFzaDJpKHhpICsgMSwgeWksIHNlZWQpO1xuICBjb25zdCBjID0gaGFzaDJpKHhpLCB5aSArIDEsIHNlZWQpLCBkID0gaGFzaDJpKHhpICsgMSwgeWkgKyAxLCBzZWVkKTtcbiAgY29uc3QgdG9wID0gYSArIChiIC0gYSkgKiB4ZjtcbiAgY29uc3QgYm90dG9tID0gYyArIChkIC0gYykgKiB4ZjtcbiAgcmV0dXJuIHRvcCArIChib3R0b20gLSB0b3ApICogeWY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0yKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UyKHggKiBmcmVxLCB5ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMyh4ICogZnJlcSwgeSAqIGZyZXEsIHogKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG4iLCAiLy8gSHlkcm9sb2d5IFx1MjAxNCB0aGUgZGV0ZXJtaW5pc3RpYyB3YXRlciBuZXR3b3JrIG9mIGEgd29ybGQgKHB1cmUgVHlwZVNjcmlwdCwgRC0wMDUpLlxuLy9cbi8vIFRoaXMgaXMgZGVyaXZlZCAqc2ltdWxhdGlvbiBkYXRhKiwgbm90IHByZXNlbnRhdGlvbjogaXQgaXMgYSBwdXJlIGZ1bmN0aW9uIG9mXG4vLyAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pIGFuZCBpcyB3aGF0IHRlcnJhaW4gY2FydmluZywgd2F0ZXIgZmlsbGluZywgZmxvd1xuLy8gZGlyZWN0aW9uIGFuZCBmdXR1cmUgZmlzaGluZy9pcnJpZ2F0aW9uL2Zsb29kaW5nIHJ1bGVzIHJlYWQuIEl0IGlzIG5ldmVyXG4vLyBqb3VybmFsZWQgYmVjYXVzZSBpdCBjYW4gYWx3YXlzIGJlIHJlZ2VuZXJhdGVkIGV4YWN0bHkuXG4vL1xuLy8gTmV0d29yayAoYm90aCBnZW5lcmF0b3IgdmVyc2lvbnMpOlxuLy8gICBsYWtlICBcdTIwMTQgdGhlIHZhbGxleSBsYWtlIGJhc2luLCBsb2NhdGVkIGZyb20gdGhlIGFjdHVhbCBnZW5lcmF0ZWQgdGVycmFpbi5cbi8vICAgbG93ZXIgXHUyMDE0IHRoZSBsb3dsYW5kIHJpdmVyIGZyb20gdGhlIGxha2UgdG8gdGhlIHNvdXRoZXJuIHNlYSwgdHJhY2VkIGZyb21cbi8vICAgICAgICAgICB0aGUgYWN0dWFsIGNhcnZlZCBjaGFubmVsICh0aGUgdjEgY2hhbm5lbCBpcyBjYXJ2ZWQgb24gKndhcnBlZCpcbi8vICAgICAgICAgICBjb29yZGluYXRlcywgc28gYHJpdmVyQ2VudGVyWGAgYWxvbmUgaXMgdXAgdG8gfjEzNSBtIG9mZikuXG4vLyBHZW5lcmF0b3IgdjIgYWRkczpcbi8vICAgdXBwZXIgXHUyMDE0IGEgbW91bnRhaW4gcml2ZXIgZnJvbSBhIGhpZ2hsYW5kIHRhcm4gZG93biB0byB0aGUgbGFrZSwgd2l0aCBhXG4vLyAgICAgICAgICAgd2F0ZXItc3VyZmFjZSBsZXZlbCB0aGF0IG5ldmVyIHJpc2VzIGRvd25zdHJlYW0sIGNhc2NhZGVzIGFuZCBmYWxscy5cbi8vXG4vLyBGbG93IGFsd2F5cyBwb2ludHMgZG93bnN0cmVhbTogdXBwZXIgXHUyMTkyIGxha2UgXHUyMTkyIGxvd2VyIFx1MjE5MiBzZWEuXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbXVsYmVycnkzMiwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuXG5leHBvcnQgdHlwZSBIZWlnaHRTYW1wbGVyID0gKHg6IG51bWJlciwgejogbnVtYmVyKSA9PiBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUml2ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogQXJjIGxlbmd0aCBmcm9tIHRoZSBkb3duc3RyZWFtIGVuZCBvZiB0aGlzIHJlYWNoIChtZXRyZXMpLiAqL1xuICBzOiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGVsZXZhdGlvbiAobWV0cmVzLCBtYXkgYmUgZnJhY3Rpb25hbCkuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBDaGFubmVsIGhhbGYtd2lkdGggKG1ldHJlcykuICovXG4gIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhY2hIaXQge1xuICAvKiogSG9yaXpvbnRhbCBkaXN0YW5jZSBmcm9tIHRoZSBjZW50cmVsaW5lLiAqL1xuICBkOiBudW1iZXI7XG4gIC8qKiBJbnRlcnBvbGF0ZWQgd2F0ZXIgbGV2ZWwgYXQgdGhlIG5lYXJlc3QgY2VudHJlbGluZSBwb2ludC4gKi9cbiAgbGV2ZWw6IG51bWJlcjtcbiAgd2lkdGg6IG51bWJlcjtcbiAgLyoqIFVuaXQgZG93bnN0cmVhbSBkaXJlY3Rpb24uICovXG4gIHR4OiBudW1iZXI7XG4gIHR6OiBudW1iZXI7XG4gIC8qKiBXYXRlci1zdXJmYWNlIGRyb3AgcGVyIG1ldHJlIGFsb25nIHRoZSBjaGFubmVsICg+PSAwKS4gKi9cbiAgZ3JhZGllbnQ6IG51bWJlcjtcbiAgLyoqIEFyYyBsZW5ndGggb2YgdGhlIG5lYXJlc3QgcG9pbnQgZnJvbSB0aGUgZG93bnN0cmVhbSBlbmQuICovXG4gIHM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHBvbHlsaW5lIHJlYWNoIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LiBOZWFyZXN0LXNlZ21lbnQgcXVlcmllcyB1c2UgYVxuICogdW5pZm9ybSBncmlkIHdob3NlIGNlbGxzIGxpc3QgZXZlcnkgc2VnbWVudCB3aXRoaW4gYHJlYWNoYCBtZXRyZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBSaXZlclJlYWNoIHtcbiAgcmVhZG9ubHkgcG9pbnRzOiBSaXZlclBvaW50W107XG4gIHByaXZhdGUgcmVhZG9ubHkgY2VsbCA9IDMyO1xuICBwcml2YXRlIHJlYWRvbmx5IGdyaWQgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyW10+KCk7XG5cbiAgY29uc3RydWN0b3IocG9pbnRzOiBSaXZlclBvaW50W10sIHJlYWRvbmx5IHJlYWNoOiBudW1iZXIpIHtcbiAgICB0aGlzLnBvaW50cyA9IHBvaW50cztcbiAgICBmb3IgKGxldCBpID0gMDsgaSArIDEgPCBwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGEgPSBwb2ludHNbaV0sIGIgPSBwb2ludHNbaSArIDFdO1xuICAgICAgY29uc3QgeDAgPSBNYXRoLm1pbihhLngsIGIueCkgLSByZWFjaCwgeDEgPSBNYXRoLm1heChhLngsIGIueCkgKyByZWFjaDtcbiAgICAgIGNvbnN0IHowID0gTWF0aC5taW4oYS56LCBiLnopIC0gcmVhY2gsIHoxID0gTWF0aC5tYXgoYS56LCBiLnopICsgcmVhY2g7XG4gICAgICBmb3IgKGxldCBjeiA9IE1hdGguZmxvb3IoejAgLyB0aGlzLmNlbGwpOyBjeiA8PSBNYXRoLmZsb29yKHoxIC8gdGhpcy5jZWxsKTsgY3orKykge1xuICAgICAgICBmb3IgKGxldCBjeCA9IE1hdGguZmxvb3IoeDAgLyB0aGlzLmNlbGwpOyBjeCA8PSBNYXRoLmZsb29yKHgxIC8gdGhpcy5jZWxsKTsgY3grKykge1xuICAgICAgICAgIGNvbnN0IGtleSA9IGNlbGxLZXkoY3gsIGN6KTtcbiAgICAgICAgICBsZXQgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoa2V5KTtcbiAgICAgICAgICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB0aGlzLmdyaWQuc2V0KGtleSwgbGlzdCk7IH1cbiAgICAgICAgICBsaXN0LnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnBvaW50c1t0aGlzLnBvaW50cy5sZW5ndGggLSAxXT8ucyA/PyAwOyB9XG5cbiAgLyoqIE5lYXJlc3QgY2VudHJlbGluZSBwb2ludCB3aXRoaW4gYHJlYWNoYCwgb3IgbnVsbC4gKi9cbiAgbmVhcmVzdCh4OiBudW1iZXIsIHo6IG51bWJlcik6IFJlYWNoSGl0IHwgbnVsbCB7XG4gICAgY29uc3QgbGlzdCA9IHRoaXMuZ3JpZC5nZXQoY2VsbEtleShNYXRoLmZsb29yKHggLyB0aGlzLmNlbGwpLCBNYXRoLmZsb29yKHogLyB0aGlzLmNlbGwpKSk7XG4gICAgaWYgKCFsaXN0KSByZXR1cm4gbnVsbDtcbiAgICBsZXQgYmVzdCA9IEluZmluaXR5LCBiaSA9IC0xLCBidCA9IDA7XG4gICAgZm9yIChjb25zdCBpIG9mIGxpc3QpIHtcbiAgICAgIGNvbnN0IGEgPSB0aGlzLnBvaW50c1tpXSwgYiA9IHRoaXMucG9pbnRzW2kgKyAxXTtcbiAgICAgIGNvbnN0IGR4ID0gYi54IC0gYS54LCBkeiA9IGIueiAtIGEuejtcbiAgICAgIGNvbnN0IGxlbjIgPSBkeCAqIGR4ICsgZHogKiBkeiB8fCAxO1xuICAgICAgY29uc3QgdCA9IGNsYW1wKCgoeCAtIGEueCkgKiBkeCArICh6IC0gYS56KSAqIGR6KSAvIGxlbjIsIDAsIDEpO1xuICAgICAgY29uc3QgcHggPSBhLnggKyBkeCAqIHQsIHB6ID0gYS56ICsgZHogKiB0O1xuICAgICAgY29uc3QgZDIgPSAoeCAtIHB4KSAqKiAyICsgKHogLSBweikgKiogMjtcbiAgICAgIGlmIChkMiA8IGJlc3QpIHsgYmVzdCA9IGQyOyBiaSA9IGk7IGJ0ID0gdDsgfVxuICAgIH1cbiAgICBpZiAoYmkgPCAwIHx8IGJlc3QgPiB0aGlzLnJlYWNoICogdGhpcy5yZWFjaCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYSA9IHRoaXMucG9pbnRzW2JpXSwgYiA9IHRoaXMucG9pbnRzW2JpICsgMV07XG4gICAgY29uc3Qgc2VnTGVuID0gTWF0aC5tYXgoMWUtNiwgYi5zIC0gYS5zKTtcbiAgICAvLyBQb2ludHMgYXJlIHN0b3JlZCBkb3duc3RyZWFtLWZpcnN0LCBzbyBkb3duc3RyZWFtIGlzIGEgPC0gYi5cbiAgICBjb25zdCB0eCA9IChhLnggLSBiLngpIC8gc2VnTGVuLCB0eiA9IChhLnogLSBiLnopIC8gc2VnTGVuO1xuICAgIHJldHVybiB7XG4gICAgICBkOiBNYXRoLnNxcnQoYmVzdCksXG4gICAgICBsZXZlbDogYS5sZXZlbCArIChiLmxldmVsIC0gYS5sZXZlbCkgKiBidCxcbiAgICAgIHdpZHRoOiBhLndpZHRoICsgKGIud2lkdGggLSBhLndpZHRoKSAqIGJ0LFxuICAgICAgdHgsIHR6LFxuICAgICAgZ3JhZGllbnQ6IE1hdGgubWF4KDAsIChiLmxldmVsIC0gYS5sZXZlbCkgLyBzZWdMZW4pLFxuICAgICAgczogYS5zICsgKGIucyAtIGEucykgKiBidCxcbiAgICB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGNlbGxLZXkoY3g6IG51bWJlciwgY3o6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoY3ggKyA0MDk2KSAqIDgxOTIgKyAoY3ogKyA0MDk2KTtcbn1cblxuZXhwb3J0IHR5cGUgV2F0ZXJCb2R5ID0gJ3JpdmVyJyB8ICdsYWtlJyB8ICdzZWEnIHwgJ25vbmUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEZsb3dTYW1wbGUge1xuICBib2R5OiBXYXRlckJvZHk7XG4gIC8qKiBVbml0IGZsb3cgZGlyZWN0aW9uICh6ZXJvIGZvciBzdGlsbCB3YXRlcikuICovXG4gIGR4OiBudW1iZXI7XG4gIGR6OiBudW1iZXI7XG4gIC8qKiBTdXJmYWNlIGN1cnJlbnQgc3BlZWQgaW4gbS9zLiAqL1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEh5ZHJvbG9neU9wdGlvbnMge1xuICBzZWVkOiBudW1iZXI7XG4gIC8qKiBHZW5lcmF0b3IgdmVyc2lvbiB0aGUgbmV0d29yayBiZWxvbmdzIHRvLiAqL1xuICB2ZXJzaW9uOiBudW1iZXI7XG4gIC8qKiBCYXNlIGhlaWdodCBvZiB0aGUgKnVubW9kaWZpZWQgdjEgc2hhcGUqICh1c2VkIHRvIGxvY2F0ZSBsYWtlL2NoYW5uZWwpLiAqL1xuICB2MUhlaWdodDogSGVpZ2h0U2FtcGxlcjtcbn1cblxuLyoqIERldGVybWluaXN0aWMgaHlkcm9sb2dpY2FsIG5ldHdvcmsgZm9yIG9uZSAoc2VlZCwgZ2VuZXJhdG9yIHZlcnNpb24pLiAqL1xuZXhwb3J0IGNsYXNzIEh5ZHJvbG9neSB7XG4gIHJlYWRvbmx5IHNlZWQ6IG51bWJlcjtcbiAgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuICByZWFkb25seSBsYWtlOiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyByeDogbnVtYmVyOyByejogbnVtYmVyIH07XG4gIHJlYWRvbmx5IGxvd2VyOiBSaXZlclJlYWNoO1xuICByZWFkb25seSB1cHBlcjogUml2ZXJSZWFjaCB8IG51bGw7XG4gIC8qKiBVcHBlci1yaXZlciBzb3VyY2UgdGFybiAodjIgb25seSkuICovXG4gIHJlYWRvbmx5IHRhcm46IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHI6IG51bWJlcjsgbGV2ZWw6IG51bWJlciB9IHwgbnVsbDtcblxuICBjb25zdHJ1Y3RvcihvcHRzOiBIeWRyb2xvZ3lPcHRpb25zKSB7XG4gICAgdGhpcy5zZWVkID0gb3B0cy5zZWVkO1xuICAgIHRoaXMudmVyc2lvbiA9IG9wdHMudmVyc2lvbjtcbiAgICB0aGlzLmxha2UgPSBsb2NhdGVMYWtlKG9wdHMudjFIZWlnaHQpO1xuICAgIHRoaXMubG93ZXIgPSB0cmFjZUxvd2VyUml2ZXIob3B0cy52MUhlaWdodCwgdGhpcy5sYWtlKTtcbiAgICBpZiAob3B0cy52ZXJzaW9uID49IDIpIHtcbiAgICAgIGNvbnN0IHVwcGVyID0gYXV0aG9yVXBwZXJSaXZlcihvcHRzLnNlZWQsIHRoaXMubGFrZSk7XG4gICAgICB0aGlzLnVwcGVyID0gdXBwZXIucmVhY2g7XG4gICAgICB0aGlzLnRhcm4gPSB1cHBlci50YXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVwcGVyID0gbnVsbDtcbiAgICAgIHRoaXMudGFybiA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN1cmZhY2UgY3VycmVudCBmb3IgYSB3YXRlciBjb2x1bW4uIGBsZXZlbGAgaXMgdGhlIGNvbHVtbidzIHdhdGVyIHN1cmZhY2UsXG4gICAqIHVzZWQgdG8gdGVsbCBzZWEtbGV2ZWwgd2F0ZXIgKGxha2UsIGxvd2VyIHJpdmVyLCBzZWEpIGZyb20gdGhlIHVwcGVyIHJpdmVyLlxuICAgKi9cbiAgZmxvd0F0KHg6IG51bWJlciwgejogbnVtYmVyLCBsZXZlbDogbnVtYmVyKTogRmxvd1NhbXBsZSB7XG4gICAgaWYgKHRoaXMudXBwZXIgJiYgbGV2ZWwgPiAwLjUpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHRoaXMudXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPD0gaGl0LndpZHRoICsgMikge1xuICAgICAgICBjb25zdCBzcGVlZCA9IGNsYW1wKDAuNTUgKyBoaXQuZ3JhZGllbnQgKiA5LCAwLjQsIDQuNSk7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBoaXQudHgsIGR6OiBoaXQudHosIHNwZWVkIH07XG4gICAgICB9XG4gICAgICBpZiAodGhpcy50YXJuICYmIE1hdGguaHlwb3QoeCAtIHRoaXMudGFybi54LCB6IC0gdGhpcy50YXJuLnopIDwgdGhpcy50YXJuLnIgKyA0KSB7XG4gICAgICAgIHJldHVybiB7IGJvZHk6ICdsYWtlJywgLi4udG93YXJkcyh4LCB6LCB0aGlzLnVwcGVyU291cmNlKCksIDAuMDYpIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGxvdyA9IHRoaXMubG93ZXIubmVhcmVzdCh4LCB6KTtcbiAgICBpZiAobG93ICYmIGxvdy5kIDw9IGxvdy53aWR0aCArIDYpIHtcbiAgICAgIHJldHVybiB7IGJvZHk6ICdyaXZlcicsIGR4OiBsb3cudHgsIGR6OiBsb3cudHosIHNwZWVkOiAwLjM1ICsgMC4yNSAqIHNtb290aHN0ZXAobG93LndpZHRoICsgNiwgMCwgbG93LmQpIH07XG4gICAgfVxuICAgIGNvbnN0IGxkID0gTWF0aC5oeXBvdCgoeCAtIHRoaXMubGFrZS54KSAvIHRoaXMubGFrZS5yeCwgKHogLSB0aGlzLmxha2UueikgLyB0aGlzLmxha2UucnopO1xuICAgIGlmIChsZCA8IDEuMzUpIHtcbiAgICAgIC8vIFNsb3cgZHJpZnQgZnJvbSB0aGUgaW5mbG93IHRvd2FyZCB0aGUgb3V0ZmxvdyBhdCB0aGUgaGVhZCBvZiB0aGUgbG93ZXIgcml2ZXIuXG4gICAgICBjb25zdCBoZWFkID0gdGhpcy5sb3dlci5wb2ludHNbdGhpcy5sb3dlci5wb2ludHMubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCBkcmlmdCA9IHRvd2FyZHMoeCwgeiwgaGVhZCwgMC4wOCk7XG4gICAgICByZXR1cm4geyBib2R5OiAnbGFrZScsIC4uLmRyaWZ0IH07XG4gICAgfVxuICAgIHJldHVybiB7IGJvZHk6ICdzZWEnLCBkeDogMCwgZHo6IDAsIHNwZWVkOiAwIH07XG4gIH1cblxuICBwcml2YXRlIHVwcGVyU291cmNlKCk6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gICAgY29uc3QgcHRzID0gdGhpcy51cHBlciEucG9pbnRzO1xuICAgIHJldHVybiBwdHNbcHRzLmxlbmd0aCAtIDFdO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvd2FyZHMoeDogbnVtYmVyLCB6OiBudW1iZXIsIHA6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfSwgc3BlZWQ6IG51bWJlcikge1xuICBjb25zdCBkeCA9IHAueCAtIHgsIGR6ID0gcC56IC0gejtcbiAgY29uc3QgbGVuID0gTWF0aC5oeXBvdChkeCwgZHopIHx8IDE7XG4gIHJldHVybiB7IGR4OiBkeCAvIGxlbiwgZHo6IGR6IC8gbGVuLCBzcGVlZCB9O1xufVxuXG4vKiogRmluZCB0aGUgdmFsbGV5IGxha2UgZnJvbSB0aGUgdGVycmFpbiBpdHNlbGY6IHRoZSBkZWVwIGJhc2luIE5XIG9mIHRoZSBmb3VuZGVyIHZhbGxleS4gKi9cbmZ1bmN0aW9uIGxvY2F0ZUxha2UoaDogSGVpZ2h0U2FtcGxlcik6IEh5ZHJvbG9neVsnbGFrZSddIHtcbiAgbGV0IHN4ID0gMCwgc3ogPSAwLCBuID0gMCwgbWluWCA9IEluZmluaXR5LCBtYXhYID0gLUluZmluaXR5LCBtaW5aID0gSW5maW5pdHksIG1heFogPSAtSW5maW5pdHk7XG4gIGZvciAobGV0IHogPSAtNDYwOyB6IDw9IC0xMjA7IHogKz0gNCkge1xuICAgIGZvciAobGV0IHggPSAtNDgwOyB4IDw9IC00MDsgeCArPSA0KSB7XG4gICAgICBpZiAoaCh4LCB6KSA+IC00KSBjb250aW51ZTtcbiAgICAgIHN4ICs9IHg7IHN6ICs9IHo7IG4rKztcbiAgICAgIG1pblggPSBNYXRoLm1pbihtaW5YLCB4KTsgbWF4WCA9IE1hdGgubWF4KG1heFgsIHgpO1xuICAgICAgbWluWiA9IE1hdGgubWluKG1pblosIHopOyBtYXhaID0gTWF0aC5tYXgobWF4Wiwgeik7XG4gICAgfVxuICB9XG4gIGlmIChuID09PSAwKSByZXR1cm4geyB4OiAtMjYwLCB6OiAtMjMwLCByeDogMTIwLCByejogOTUgfTtcbiAgcmV0dXJuIHtcbiAgICB4OiBzeCAvIG4sIHo6IHN6IC8gbixcbiAgICByeDogTWF0aC5tYXgoMzAsIChtYXhYIC0gbWluWCkgLyAyICsgMTApLCByejogTWF0aC5tYXgoMzAsIChtYXhaIC0gbWluWikgLyAyICsgMTApLFxuICB9O1xufVxuXG4vKipcbiAqIFRyYWNlIHRoZSBjYXJ2ZWQgbG93bGFuZCBjaGFubmVsIGZyb20gdGhlIGxha2Ugb3V0ZmxvdyBzb3V0aCB0byB0aGUgc2VhLiBGb3JcbiAqIGVhY2ggNCBtIHJvdyB0aGUgY2hhbm5lbCBpcyB0aGUgbG93ZXN0IGNvbHVtbiBuZWFyIHRoZSBwcmV2aW91cyBjZW50cmU7IHRoZVxuICogdHJhY2UgaXMgc21vb3RoZWQgc28gdGhlIGZsb3cgZmllbGQgZG9lcyBub3Qgaml0dGVyIHdpdGggdGhlIDEgbSB2b3hlbHMuXG4gKi9cbmZ1bmN0aW9uIHRyYWNlTG93ZXJSaXZlcihoOiBIZWlnaHRTYW1wbGVyLCBsYWtlOiBIeWRyb2xvZ3lbJ2xha2UnXSk6IFJpdmVyUmVhY2gge1xuICBjb25zdCByYXc6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfT4gPSBbXTtcbiAgbGV0IGN4ID0gbGFrZS54ICsgbGFrZS5yeCAqIDAuNTU7XG4gIGxldCB6ID0gTWF0aC5yb3VuZChsYWtlLnogKyBsYWtlLnJ6ICogMC42KTtcbiAgLy8gU3RhcnQgYXQgdGhlIGxha2UncyBzb3V0aC1lYXN0IG91dGZsb3cgYW5kIGZvbGxvdyB0aGUgY2hhbm5lbCBkb3duc3RyZWFtLlxuICBmb3IgKDsgeiA8PSA5MDA7IHogKz0gNCkge1xuICAgIGxldCBiZXN0ID0gSW5maW5pdHksIGJ4ID0gY3g7XG4gICAgZm9yIChsZXQgeCA9IE1hdGgucm91bmQoY3ggLSA0MCk7IHggPD0gY3ggKyA0MDsgeCArPSAyKSB7XG4gICAgICBjb25zdCB2ID0gaCh4LCB6KSArIE1hdGguYWJzKHggLSBjeCkgKiAwLjAyO1xuICAgICAgaWYgKHYgPCBiZXN0KSB7IGJlc3QgPSB2OyBieCA9IHg7IH1cbiAgICB9XG4gICAgY3ggPSBieDtcbiAgICByYXcucHVzaCh7IHg6IGJ4LCB6IH0pO1xuICAgIC8vIFRoZSB0cmFjZSBlbmRzIG9uY2UgaXQgcmVhY2hlcyBvcGVuIHNlYSBmb3IgYSBzdXN0YWluZWQgc3RyZXRjaC5cbiAgICBpZiAoYmVzdCA8IC02ICYmIHJhdy5sZW5ndGggPiAyMCAmJiBoKGJ4LCB6ICsgOCkgPCAtNiAmJiBoKGJ4LCB6ICsgMTYpIDwgLTYpIGJyZWFrO1xuICB9XG4gIGNvbnN0IHNtb290aCA9IHJhdy5tYXAoKHAsIGkpID0+IHtcbiAgICBsZXQgc3ggPSAwLCBuID0gMDtcbiAgICBmb3IgKGxldCBrID0gTWF0aC5tYXgoMCwgaSAtIDQpOyBrIDw9IE1hdGgubWluKHJhdy5sZW5ndGggLSAxLCBpICsgNCk7IGsrKykgeyBzeCArPSByYXdba10ueDsgbisrOyB9XG4gICAgcmV0dXJuIHsgeDogc3ggLyBuLCB6OiBwLnogfTtcbiAgfSk7XG4gIC8vIFN0b3JlIGRvd25zdHJlYW0tZmlyc3Q6IGluZGV4IDAgaXMgdGhlIHNlYSBtb3V0aC5cbiAgc21vb3RoLnJldmVyc2UoKTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSBbXTtcbiAgbGV0IHMgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHNtb290aC5sZW5ndGg7IGkrKykge1xuICAgIGlmIChpID4gMCkgcyArPSBNYXRoLmh5cG90KHNtb290aFtpXS54IC0gc21vb3RoW2kgLSAxXS54LCBzbW9vdGhbaV0ueiAtIHNtb290aFtpIC0gMV0ueik7XG4gICAgcG9pbnRzLnB1c2goeyB4OiBzbW9vdGhbaV0ueCwgejogc21vb3RoW2ldLnosIHMsIGxldmVsOiAwLCB3aWR0aDogNiB9KTtcbiAgfVxuICByZXR1cm4gbmV3IFJpdmVyUmVhY2gocG9pbnRzLCA0MCk7XG59XG5cbi8qKiBXYXRlci1zdXJmYWNlIGRyb3BzIGFsb25nIHRoZSB1cHBlciByaXZlciwgYXMgKGZyYWN0aW9uIG9mIGxlbmd0aCwgbWV0cmVzKS4gKi9cbmNvbnN0IEZBTExTOiBSZWFkb25seUFycmF5PHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0+ID0gW1swLjIsIDddLCBbMC40OCwgMTFdLCBbMC43NCwgMTNdXTtcbmNvbnN0IFVQUEVSX0dSQURJRU5UID0gMC4wMztcblxuLyoqXG4gKiBBdXRob3IgdGhlIHYyIG1vdW50YWluIHJpdmVyOiBhIHNlZWRlZCBtZWFuZGVyaW5nIGNlbnRyZWxpbmUgZnJvbSB0aGUgbGFrZSdzXG4gKiBub3J0aCBzaG9yZSB0byBhIGhpZ2hsYW5kIHRhcm4sIHdpdGggYSBsZXZlbCBwcm9maWxlIHRoYXQgb25seSByaXNlc1xuICogdXBzdHJlYW0gKGdlbnRsZSBncmFkaWVudCBwbHVzIHRocmVlIGNhc2NhZGVzKS5cbiAqL1xuZnVuY3Rpb24gYXV0aG9yVXBwZXJSaXZlcihzZWVkOiBudW1iZXIsIGxha2U6IEh5ZHJvbG9neVsnbGFrZSddKToge1xuICByZWFjaDogUml2ZXJSZWFjaDsgdGFybjogTm9uTnVsbGFibGU8SHlkcm9sb2d5Wyd0YXJuJ10+O1xufSB7XG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKHNlZWQgXiAweDVlZWQyKSA+Pj4gMCk7XG4gIGNvbnN0IGogPSAoYTogbnVtYmVyKSA9PiAocm5kKCkgLSAwLjUpICogMiAqIGE7XG4gIGNvbnN0IG1vdXRoID0geyB4OiBsYWtlLnggKyBsYWtlLnJ4ICogMC4xLCB6OiBsYWtlLnogLSBsYWtlLnJ6ICogMC41NSB9O1xuICBjb25zdCBjb250cm9scyA9IFtcbiAgICBtb3V0aCxcbiAgICB7IHg6IGxha2UueCArIDIwICsgaigyMCksIHo6IC00MTAgKyBqKDE1KSB9LFxuICAgIHsgeDogLTE5MCArIGooMzUpLCB6OiAtNTIwICsgaigyMCkgfSxcbiAgICB7IHg6IC0yMTUgKyBqKDM1KSwgejogLTY0MCArIGooMjApIH0sXG4gICAgeyB4OiAtMTY1ICsgaigzMCksIHo6IC03NzAgKyBqKDE1KSB9LFxuICBdO1xuICAvLyBDYXRtdWxsLVJvbSB0aHJvdWdoIHRoZSBjb250cm9scywgdGhlbiByZXNhbXBsZSBhdCB+OCBtIHNwYWNpbmcgd2l0aCBhXG4gIC8vIHNtYWxsIHNlZWRlZCBtZWFuZGVyIHNvIHRoZSBjaGFubmVsIGlzIG5vdCBhIHNtb290aCBzcGxpbmUuXG4gIGNvbnN0IGRlbnNlOiBBcnJheTx7IHg6IG51bWJlcjsgejogbnVtYmVyIH0+ID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29udHJvbHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgY29uc3QgcDAgPSBjb250cm9sc1tNYXRoLm1heCgwLCBpIC0gMSldLCBwMSA9IGNvbnRyb2xzW2ldO1xuICAgIGNvbnN0IHAyID0gY29udHJvbHNbaSArIDFdLCBwMyA9IGNvbnRyb2xzW01hdGgubWluKGNvbnRyb2xzLmxlbmd0aCAtIDEsIGkgKyAyKV07XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCAyNDsgaysrKSB7XG4gICAgICBjb25zdCB0ID0gayAvIDI0LCB0MiA9IHQgKiB0LCB0MyA9IHQyICogdDtcbiAgICAgIGRlbnNlLnB1c2goe1xuICAgICAgICB4OiAwLjUgKiAoMiAqIHAxLnggKyAoLXAwLnggKyBwMi54KSAqIHQgKyAoMiAqIHAwLnggLSA1ICogcDEueCArIDQgKiBwMi54IC0gcDMueCkgKiB0MlxuICAgICAgICAgICsgKC1wMC54ICsgMyAqIHAxLnggLSAzICogcDIueCArIHAzLngpICogdDMpLFxuICAgICAgICB6OiAwLjUgKiAoMiAqIHAxLnogKyAoLXAwLnogKyBwMi56KSAqIHQgKyAoMiAqIHAwLnogLSA1ICogcDEueiArIDQgKiBwMi56IC0gcDMueikgKiB0MlxuICAgICAgICAgICsgKC1wMC56ICsgMyAqIHAxLnogLSAzICogcDIueiArIHAzLnopICogdDMpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGRlbnNlLnB1c2goY29udHJvbHNbY29udHJvbHMubGVuZ3RoIC0gMV0pO1xuICBjb25zdCByZXNhbXBsZWQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHM6IG51bWJlciB9PiA9IFt7IC4uLmRlbnNlWzBdLCBzOiAwIH1dO1xuICBsZXQgYWNjID0gMCwgcyA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgZGVuc2UubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5oeXBvdChkZW5zZVtpXS54IC0gZGVuc2VbaSAtIDFdLngsIGRlbnNlW2ldLnogLSBkZW5zZVtpIC0gMV0ueik7XG4gICAgYWNjICs9IHN0ZXA7IHMgKz0gc3RlcDtcbiAgICBpZiAoYWNjID49IDggfHwgaSA9PT0gZGVuc2UubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbSA9IChmYm0yKHMgLyA2MCwgMy4xLCBzZWVkICsgODAxLCAyKSAtIDAuNSkgKiAxNDtcbiAgICAgIHJlc2FtcGxlZC5wdXNoKHsgeDogZGVuc2VbaV0ueCArIG0sIHo6IGRlbnNlW2ldLnosIHMgfSk7XG4gICAgICBhY2MgPSAwO1xuICAgIH1cbiAgfVxuICBjb25zdCB0b3RhbCA9IHJlc2FtcGxlZFtyZXNhbXBsZWQubGVuZ3RoIC0gMV0ucztcbiAgY29uc3QgbGV2ZWxBdCA9IChzdjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBsZXQgbGV2ZWwgPSBzdiAqIFVQUEVSX0dSQURJRU5UO1xuICAgIGZvciAoY29uc3QgW2ZyYWMsIGRyb3BdIG9mIEZBTExTKSB7XG4gICAgICAvLyBFYWNoIGZhbGwgaXMgYSBzaG9ydCBjYXNjYWRlIG92ZXIgfjEwIG0gb2YgY2hhbm5lbC5cbiAgICAgIGxldmVsICs9IGRyb3AgKiBzbW9vdGhzdGVwKHRvdGFsICogZnJhYyAtIDUsIHRvdGFsICogZnJhYyArIDUsIHN2KTtcbiAgICB9XG4gICAgLy8gVGhlIGZpcnN0IDQwIG0gaW50byB0aGUgbGFrZSBzdGF5cyBhdCBsYWtlIGxldmVsLlxuICAgIHJldHVybiBzdiA8IDQwID8gMCA6IGxldmVsIC0gNDAgKiBVUFBFUl9HUkFESUVOVDtcbiAgfTtcbiAgY29uc3QgcG9pbnRzOiBSaXZlclBvaW50W10gPSByZXNhbXBsZWQubWFwKChwKSA9PiAoe1xuICAgIHg6IHAueCwgejogcC56LCBzOiBwLnMsIGxldmVsOiBNYXRoLm1heCgwLCBsZXZlbEF0KHAucykpLFxuICAgIHdpZHRoOiAzLjIgKyAyLjIgKiBmYm0yKHAucyAvIDcwLCA5LjcsIHNlZWQgKyA4MDIsIDIpICsgKDEgLSBwLnMgLyB0b3RhbCkgKiAxLjUsXG4gIH0pKTtcbiAgY29uc3Qgc291cmNlID0gcG9pbnRzW3BvaW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIHtcbiAgICByZWFjaDogbmV3IFJpdmVyUmVhY2gocG9pbnRzLCAxMTApLFxuICAgIHRhcm46IHsgeDogc291cmNlLngsIHo6IHNvdXJjZS56LCByOiAxOCwgbGV2ZWw6IHNvdXJjZS5sZXZlbCB9LFxuICB9O1xufVxuIiwgIi8vIFZveGVsIG1hdGVyaWFsIGlkcy4gUHVyZSBkYXRhIHNoYXJlZCBieSB0aGUgc2ltdWxhdGlvbiBsYXllciAoRC0wMDUpLlxuLy8gSWRzIGFyZSBwZXJzaXN0ZWQgaW4gc25hcHNob3QgZWRpdHMsIHNvIGV4aXN0aW5nIHZhbHVlcyBtdXN0IG5ldmVyIGNoYW5nZS5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG4gIC8qKiBHZW5lcmF0b3IgdjIgaGlnaGxhbmRzLiBOZXZlciBwcm9kdWNlZCBieSBnZW5lcmF0b3IgdjEuICovXG4gIFNOT1c6IDEwLFxufSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIE1hdElkID0gKHR5cGVvZiBNQVQpW2tleW9mIHR5cGVvZiBNQVRdO1xuXG5leHBvcnQgY29uc3QgaXNTb2xpZCA9IChtOiBudW1iZXIpOiBib29sZWFuID0+IG0gIT09IE1BVC5BSVIgJiYgbSAhPT0gTUFULldBVEVSO1xuZXhwb3J0IGNvbnN0IGlzT3BhcXVlID0gaXNTb2xpZDtcblxuLyoqIEhpZ2hlc3QgbWF0ZXJpYWwgaWQgdGhhdCBtYXkgYXBwZWFyIGluIGEgdm94ZWwgZWRpdC4gKi9cbmV4cG9ydCBjb25zdCBNQVhfTUFUX0lEID0gMTA7XG4iLCAiLy8gVGVycmFpbiBnZW5lcmF0b3IgdjIgXHUyMDE0IHRoZSB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IChwdXJlIFRTLCBELTAwNSkuXG4vL1xuLy8gQ29tcGF0aWJpbGl0eSBjb250cmFjdDogaW5zaWRlIHRoZSBmb3VuZGVyIGNvcnJpZG9yICh0aGUgc2V0dGxlbWVudCB2YWxsZXksXG4vLyB0aGUgbGFrZSBhbmQgdGhlIGxvd2xhbmQgcml2ZXIpIHYyIGhlaWdodHMgZXF1YWwgdjEgZXhhY3RseSwgc28gdGhlIHBpbm5lZFxuLy8gZm91bmRlciBwcm9qZWN0cywgdGhlaXIgcHJlcGFyYXRpb24gdGFyZ2V0cyBhbmQgbmF0dXJhbCBlbnRpdGllcyB0aGVyZSBhcmVcbi8vIHVuY2hhbmdlZC4gT3V0c2lkZSBpdCB2MiBhZGRzOlxuLy8gICAtIGEgbm9ydGhlcm4gbWFzc2lmIG9uIGFuIGV4dGVuZGVkIGlzbGFuZCwgd2l0aCBzbm93IGFib3ZlIHRoZSBzbm93bGluZTtcbi8vICAgLSBmbGFua2luZyByYW5nZXMgd2VzdCBhbmQgZWFzdCBvZiB0aGUgdmFsbGV5LCB0ZXJyYWNlZCBpbnRvIGNsaWZmIGJhbmRzO1xuLy8gICAtIGEgbW91bnRhaW4gcml2ZXIgY2FydmVkIGludG8gdGhlIG1hc3NpZiBmcm9tIGEgdGFybiBkb3duIHRvIHRoZSBsYWtlLFxuLy8gICAgIHdob3NlIHdhdGVyIHN1cmZhY2UgY29tZXMgZnJvbSBIeWRyb2xvZ3kgYW5kIG5ldmVyIHJpc2VzIGRvd25zdHJlYW07XG4vLyAgIC0gYSBjb250aW51b3VzIGxvd2xhbmQgY2hhbm5lbCAodjEgaGFzIGEgZHJ5IGZvcmQgc291dGggb2YgdGhlIHNoZWxmKS5cbi8vIEhlaWdodHMgYXJlIGludGVnZXJzIGluIFstMTQsIDEwNF0uXG5pbXBvcnQgeyBjbGFtcCwgZmJtMiwgbGVycCwgc21vb3Roc3RlcCB9IGZyb20gJy4vbm9pc2UnO1xuaW1wb3J0IHsgTUFULCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcblxuZXhwb3J0IGNvbnN0IFYyX1NOT1dMSU5FID0gNzQ7XG5leHBvcnQgY29uc3QgVjJfTUFYX0hFSUdIVCA9IDEwNDtcblxuZXhwb3J0IHR5cGUgVjFIZWlnaHQgPSAoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIFYyQ29sdW1uIHtcbiAgLyoqIFRvcCBzb2xpZCB5ICsgMSAoc2FtZSBjb252ZW50aW9uIGFzIHN1cmZhY2VIZWlnaHRBdCkuICovXG4gIGg6IG51bWJlcjtcbiAgLyoqIFdhdGVyIHN1cmZhY2UgZm9yIHRoaXMgY29sdW1uOiBjZWxscyBbaCwgbGV2ZWwpIGhvbGQgd2F0ZXIuICovXG4gIGxldmVsOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBjb2x1bW4gaXMgcGFydCBvZiB0aGUgY2FydmVkIG1vdW50YWluLXJpdmVyIGNoYW5uZWwuICovXG4gIGNoYW5uZWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJyYWluVjIge1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSBzZWVkOiBudW1iZXIsXG4gICAgcHJpdmF0ZSByZWFkb25seSB2MTogVjFIZWlnaHQsXG4gICAgcmVhZG9ubHkgaHlkcm9sb2d5OiBIeWRyb2xvZ3ksXG4gICkge31cblxuICAvKiogMCA9IGV4YWN0bHkgdjEgKGZvdW5kZXIgY29ycmlkb3IpOyAxID0gZnVsbCB2MiByZWxpZWYuICovXG4gIHJlbGllZk1hc2soeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtMzkwLCAtNDcwLCB6KTtcbiAgICAvLyBUaGUgd2VzdCByYW5nZSBrZWVwcyBjbGVhciBvZiB0aGUgbGFrZSBiYXNpbiB1bnRpbCB0aGUgbGFrZSBpcyBwYXNzZWQuXG4gICAgY29uc3Qgd2VzdEVkZ2UgPSBsZXJwKC00NTAsIC0zMjAsIHNtb290aHN0ZXAoLTIyMCwgLTE0MCwgeikpO1xuICAgIGNvbnN0IHdlc3QgPSBzbW9vdGhzdGVwKHdlc3RFZGdlLCB3ZXN0RWRnZSAtIDkwLCB4KTtcbiAgICBjb25zdCBlYXN0ID0gc21vb3Roc3RlcCgyMzAsIDMzMCwgeCk7XG4gICAgcmV0dXJuIE1hdGgubWF4KG5vcnRoLCB3ZXN0LCBlYXN0KTtcbiAgfVxuXG4gIC8qKiAwIGF0IHRoZSByYW5nZSBmcm9udCwgMSBkZWVwIGluc2lkZTogZm9vdGhpbGxzIGZpcnN0LCBwZWFrcyBiZWhpbmQuICovXG4gIHJhbmdlRGVwdGgoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG5vcnRoID0gc21vb3Roc3RlcCgtNDIwLCAtNzAwLCB6KTtcbiAgICBjb25zdCB3ZXN0RWRnZSA9IGxlcnAoLTQ1MCwgLTMyMCwgc21vb3Roc3RlcCgtMjIwLCAtMTQwLCB6KSk7XG4gICAgY29uc3Qgd2VzdCA9IHNtb290aHN0ZXAod2VzdEVkZ2UgLSA0MCwgd2VzdEVkZ2UgLSAzMDAsIHgpO1xuICAgIGNvbnN0IGVhc3QgPSBzbW9vdGhzdGVwKDI3MCwgNTYwLCB4KTtcbiAgICByZXR1cm4gTWF0aC5tYXgobm9ydGgsIHdlc3QsIGVhc3QpO1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVjJDb2x1bW4ge1xuICAgIGNvbnN0IHNlZWQgPSB0aGlzLnNlZWQ7XG4gICAgY29uc3QgYmFzZSA9IHRoaXMudjEoc2VlZCwgeCwgeik7XG4gICAgY29uc3QgbWFzayA9IHRoaXMucmVsaWVmTWFzayh4LCB6KTtcbiAgICBsZXQgaCA9IGJhc2U7XG5cbiAgICBpZiAobWFzayA+IDApIHtcbiAgICAgIC8vIEV4dGVuZCB0aGUgaXNsYW5kIG5vcnRoIHNvIHRoZSBtYXNzaWYgaGFzIHJvb20gKHYxIGNvYXN0IGlzIH56IC02MDApLlxuICAgICAgY29uc3Qgbm9ydGhMYW5kID0gc21vb3Roc3RlcCgtNDIwLCAtNTIwLCB6KTtcbiAgICAgIGNvbnN0IHNob3JlID0gMSAtIE1hdGguaHlwb3QoKHggKyAxNTApIC8gNTYwLCAoeiArIDY5MCkgLyAzMDApXG4gICAgICAgICsgKGZibTIoeCAvIDE2MCwgeiAvIDE2MCwgc2VlZCArIDcwMSwgMykgLSAwLjUpICogMC4zO1xuICAgICAgY29uc3QgbGFuZE4gPSBzbW9vdGhzdGVwKDAuMCwgMC4xNCwgc2hvcmUpICogbm9ydGhMYW5kO1xuICAgICAgY29uc3QgZ3JvdW5kID0gbGVycChiYXNlLCBNYXRoLm1heChiYXNlLCA1ICsgNSAqIGZibTIoeCAvIDkwLCB6IC8gOTAsIHNlZWQgKyA3MDIsIDIpKSwgbGFuZE4pO1xuXG4gICAgICAvLyBSaWRnZWQgbWFzc2lmIHdpdGggdGVycmFjZWQgY2xpZmYgYmFuZHMuXG4gICAgICBjb25zdCB3eCA9IHggKyAoZmJtMih4IC8gMjYwLCB6IC8gMjYwLCBzZWVkICsgNzAzLCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCB3eiA9IHogKyAoZmJtMih4IC8gMjYwICsgNS4xLCB6IC8gMjYwIC0gMi43LCBzZWVkICsgNzA0LCAzKSAtIDAuNSkgKiAxMjA7XG4gICAgICBjb25zdCByMSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIxMCwgd3ogLyAyMTAsIHNlZWQgKyA3MDUsIDQpIC0gMSk7XG4gICAgICBjb25zdCByMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDgwLCB3eiAvIDgwLCBzZWVkICsgNzA2LCAzKSAtIDEpO1xuICAgICAgY29uc3QgbHVtcCA9IGZibTIod3ggLyAxMjAsIHd6IC8gMTIwLCBzZWVkICsgNzA3LCAzKTtcbiAgICAgIGNvbnN0IGRlcHRoID0gdGhpcy5yYW5nZURlcHRoKHgsIHopO1xuICAgICAgbGV0IG1vdW50YWluID0gMTYgKyAoOCArIDgwICogZGVwdGgpICogKDAuNTUgKiByMSAqIHIxICsgMC4yOCAqIHIyICsgMC4xNyAqIGx1bXApXG4gICAgICAgICsgMTggKiBkZXB0aCAqIHNtb290aHN0ZXAoMC41NSwgMC45LCByMSk7XG4gICAgICBjb25zdCBiYW5kID0gNiArIDIgKiBmYm0yKHggLyAxNDAsIHogLyAxNDAsIHNlZWQgKyA3MDgsIDIpO1xuICAgICAgY29uc3QgdCA9IE1hdGguZmxvb3IobW91bnRhaW4gLyBiYW5kKTtcbiAgICAgIGNvbnN0IGZyYWMgPSBtb3VudGFpbiAvIGJhbmQgLSB0O1xuICAgICAgbW91bnRhaW4gPSAodCArIHNtb290aHN0ZXAoMC41LCAwLjgsIGZyYWMpKSAqIGJhbmQ7XG5cbiAgICAgIC8vIE9ubHkgbGFuZCByaXNlczsgdGhlIHNlYSBzdGF5cyBzZWEsIHNvIHJhbmdlcyBlbmQgaW4gY29hc3RhbCBjbGlmZnMuXG4gICAgICBjb25zdCBsYW5kRmFjdG9yID0gc21vb3Roc3RlcCgtMiwgOCwgZ3JvdW5kKTtcbiAgICAgIGggPSBsZXJwKGdyb3VuZCwgTWF0aC5tYXgoZ3JvdW5kLCBtb3VudGFpbiksIG1hc2sgKiBsYW5kRmFjdG9yKTtcbiAgICB9XG5cbiAgICBsZXQgbGV2ZWwgPSBoIDwgMCA/IDAgOiAtSW5maW5pdHk7XG4gICAgbGV0IGNoYW5uZWwgPSBmYWxzZTtcblxuICAgIC8vIE1vdW50YWluIHJpdmVyOiB2YWxsZXkgZmxvb3IsIGJhbmtzIGFuZCBjaGFubmVsIGZvbGxvdyB0aGUgd2F0ZXIgbGV2ZWwuXG4gICAgY29uc3QgdXBwZXIgPSB0aGlzLmh5ZHJvbG9neS51cHBlcjtcbiAgICBpZiAodXBwZXIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHVwcGVyLm5lYXJlc3QoeCwgeik7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIGNvbnN0IHJhaXNlZCA9IGhpdC5sZXZlbCA+IDAuMjU7XG4gICAgICAgIGNvbnN0IHZ3ID0gNTUgKyAyOCAqIGZibTIoaGl0LnMgLyA5MCwgMS43LCBzZWVkICsgNzA5LCAyKTtcbiAgICAgICAgY29uc3QgZmxvb3IgPSBoaXQubGV2ZWwgKyAxLjUgKyAyLjIgKiBmYm0yKHggLyA0MCwgeiAvIDQwLCBzZWVkICsgNzEwLCAyKSArIGhpdC5kICogMC4wNjtcbiAgICAgICAgY29uc3QgdCA9IHNtb290aHN0ZXAodncgKiAwLjMsIHZ3LCBoaXQuZCk7XG4gICAgICAgIGggPSBNYXRoLm1pbihoLCBsZXJwKGZsb29yLCBoLCB0KSk7XG4gICAgICAgIGNvbnN0IHcgPSBoaXQud2lkdGg7XG4gICAgICAgIGlmIChyYWlzZWQgJiYgaGl0LmQgPCB3ICsgMykge1xuICAgICAgICAgIC8vIEJhbmtzIGhvbGQgYSByYWlzZWQgcml2ZXI6IG5ldmVyIGJlbG93IGl0cyB3YXRlciBzdXJmYWNlLiBBdCBsYWtlXG4gICAgICAgICAgLy8gbGV2ZWwgdGhlIHNlYS1sZXZlbCBmaWxsIGFscmVhZHkgY29udGFpbnMgdGhlIHdhdGVyLlxuICAgICAgICAgIGggPSBNYXRoLm1heChoLCBNYXRoLmNlaWwoaGl0LmxldmVsKSArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoaXQuZCA8IHcpIHtcbiAgICAgICAgICBjb25zdCBiZWQgPSBoaXQubGV2ZWwgLSAoMS4yICsgMS4zICogKDEgLSBoaXQuZCAvIHcpKTtcbiAgICAgICAgICBoID0gTWF0aC5taW4oaCwgYmVkKTtcbiAgICAgICAgICBpZiAocmFpc2VkKSBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKGhpdC5sZXZlbCkpO1xuICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCB0YXJuID0gdGhpcy5oeWRyb2xvZ3kudGFybjtcbiAgICAgIGlmICh0YXJuKSB7XG4gICAgICAgIGNvbnN0IHRkID0gTWF0aC5oeXBvdCh4IC0gdGFybi54LCB6IC0gdGFybi56KVxuICAgICAgICAgICogKDEgKyAwLjIgKiAoZmJtMih4IC8gMzAsIHogLyAzMCwgc2VlZCArIDcxMSwgMikgLSAwLjUpKTtcbiAgICAgICAgaWYgKHRkIDwgdGFybi5yICsgNikge1xuICAgICAgICAgIGNvbnN0IHJpbSA9IE1hdGguY2VpbCh0YXJuLmxldmVsKSArIDE7XG4gICAgICAgICAgaWYgKHRkID49IHRhcm4ucikgaCA9IE1hdGgubWF4KGgsIHJpbSk7XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBoID0gTWF0aC5taW4oTWF0aC5tYXgoaCwgcmltKSwgdGFybi5sZXZlbCAtIDEgLSAzICogc21vb3Roc3RlcCh0YXJuLnIsIDAsIHRkKSk7XG4gICAgICAgICAgICBsZXZlbCA9IE1hdGgubWF4KGxldmVsLCBNYXRoLnJvdW5kKHRhcm4ubGV2ZWwpKTtcbiAgICAgICAgICAgIGNoYW5uZWwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExvd2xhbmQgY2hhbm5lbCBjb250aW51aXR5OiB2MSBsZWF2ZXMgYSBkcnkgZm9yZCB3aGVyZSB0aGUgc2hlbGYgbWVldHMgdGhlIHJpdmVyLlxuICAgIGNvbnN0IGxvdyA9IHRoaXMuaHlkcm9sb2d5Lmxvd2VyLm5lYXJlc3QoeCwgeik7XG4gICAgaWYgKGxvdyAmJiBsb3cuZCA8IDIuNSAmJiBoID49IDAgJiYgYmFzZSA8IDQpIGggPSAtMTtcblxuICAgIGggPSBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgVjJfTUFYX0hFSUdIVCkpO1xuICAgIGlmIChoIDwgMCkgbGV2ZWwgPSBNYXRoLm1heChsZXZlbCwgMCk7XG4gICAgcmV0dXJuIHsgaCwgbGV2ZWw6IGxldmVsID09PSAtSW5maW5pdHkgPyBoIDogbGV2ZWwsIGNoYW5uZWwgfTtcbiAgfVxuXG4gIGhlaWdodCh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY29sdW1uKHgsIHopLmg7XG4gIH1cblxuICAvKiogdjIgdG9wIG1hdGVyaWFsLiBGYWxscyBiYWNrIHRvIHRoZSB2MSBydWxlcyBmb3IgdGhlIHVuY2hhbmdlZCBjb3JyaWRvci4gKi9cbiAgdG9wTWF0ZXJpYWwoXG4gICAgeDogbnVtYmVyLCB6OiBudW1iZXIsIGNvbDogVjJDb2x1bW4sIHNsb3BlOiBudW1iZXIsXG4gICAgdjFUb3A6IChoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIpID0+IE1hdElkLFxuICApOiBNYXRJZCB7XG4gICAgY29uc3QgaCA9IGNvbC5oO1xuICAgIGlmIChjb2wuY2hhbm5lbCAmJiBjb2wubGV2ZWwgPiBoKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgICBjb25zdCB1cHBlciA9IHRoaXMuaHlkcm9sb2d5LnVwcGVyO1xuICAgIGlmICh1cHBlciAmJiBoID4gMSkge1xuICAgICAgY29uc3QgaGl0ID0gdXBwZXIubmVhcmVzdCh4LCB6KTtcbiAgICAgIGlmIChoaXQgJiYgaGl0LmQgPCBoaXQud2lkdGggKyAyLjUgJiYgaGl0LmxldmVsID4gMC4yNSkge1xuICAgICAgICByZXR1cm4gZmJtMih4IC8gNiwgeiAvIDYsIHRoaXMuc2VlZCArIDcxMiwgMSkgPiAwLjUgPyBNQVQuR1JBVkVMIDogTUFULlNBTkQ7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNub3dsaW5lID0gVjJfU05PV0xJTkUgKyAoZmJtMih4IC8gNzAsIHogLyA3MCwgdGhpcy5zZWVkICsgNzEzLCAzKSAtIDAuNSkgKiAxNjtcbiAgICBpZiAoaCA+PSBzbm93bGluZSAmJiBzbG9wZSA8PSAzKSByZXR1cm4gTUFULlNOT1c7XG4gICAgaWYgKGggPj0gc25vd2xpbmUgLSA2ICYmIHNsb3BlIDw9IDEgJiYgZmJtMih4IC8gMjAsIHogLyAyMCwgdGhpcy5zZWVkICsgNzE0LCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU05PVztcbiAgICBpZiAodGhpcy5yZWxpZWZNYXNrKHgsIHopID4gMC41ICYmIGggPiAzMCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICAgIHJldHVybiB2MVRvcChoLCBzbG9wZSk7XG4gIH1cbn1cbiIsICIvLyBTaW11bGF0aW9uIGxheWVyIFx1MjAxNCBwdXJlIFR5cGVTY3JpcHQsIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAxIHdvcmxkIGZvdW5kYXRpb246IGEgY2h1bmtlZCwgZ2VudWluZWx5IHRocmVlLWRpbWVuc2lvbmFsIHZveGVsIHdvcmxkLlxuLy8gVGhlIHN0b3JlZCBzdGF0ZSBpcyBvbmUgbWF0ZXJpYWwgYnl0ZSBwZXIgY2VsbCAoMCA9IGFpcik7IG9jY3VwYW5jeSBpc1xuLy8gaW1wbGljaXQuIFN1cmZhY2UgaGVpZ2h0IGlzIGEgZGVyaXZlZCBxdWVyeSwgbm90IHRoZSBzdG9yYWdlLiBUaGlzIHJlcGxhY2VzXG4vLyB0aGUgZm9ybWVyIDI1NiB4IDI1NiBoZWlnaHRmaWVsZCAoc2VlIElSLTAwNSkuXG4vL1xuLy8gV29ybGQgbWV0cmVzOiB4L3ogaW4gWy0xMDI0LCAxMDI0KSwgeSBpbiBbLTE2LCAxMTIpLCBzZWEgbGV2ZWwgMC5cbi8vIEEgY2h1bmsgaXMgMzIgeCAzMiB4IDEyOCBjZWxscy4gR2VuZXJhdGlvbiBpcyBhIHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQsXG4vLyBnZW5lcmF0b3IgdmVyc2lvbiwgcGFyYW1ldGVycyBhbmQgY2h1bmsgY29vcmRpbmF0ZXM7IGVkaXRzIGFyZSByZWNvcmRlZFxuLy8gc2VwYXJhdGVseSBhbmQgcmUtYXBwbGllZCB3aGVuIGEgY2h1bmsgaXMgcmVnZW5lcmF0ZWQuXG5pbXBvcnQgdHlwZSB7IFN0cnVjdHVyZSB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQgdHlwZSB7IExpZmVTdGF0ZSB9IGZyb20gJy4vZWNvbm9teSc7XG5pbXBvcnQgdHlwZSB7IEhvbWVzdGVhZFN0YXRlIH0gZnJvbSAnLi9ob21lc3RlYWQnO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcbmltcG9ydCB7IEh5ZHJvbG9neSB9IGZyb20gJy4vaHlkcm9sb2d5JztcbmltcG9ydCB7IFRlcnJhaW5WMiwgVjJDb2x1bW4gfSBmcm9tICcuL3RlcnJhaW4tdjInO1xuaW1wb3J0IHsgdHJlZVRpbWJlciB9IGZyb20gJy4vdmVnZXRhdGlvbic7XG5cbmV4cG9ydCBjb25zdCBXT1JMRF9TSVpFID0gMjA0ODtcbmV4cG9ydCBjb25zdCBIQUxGID0gV09STERfU0laRSAvIDI7XG5leHBvcnQgY29uc3QgQ0hVTktfU0laRSA9IDMyO1xuZXhwb3J0IGNvbnN0IENIVU5LU19QRVJfU0lERSA9IFdPUkxEX1NJWkUgLyBDSFVOS19TSVpFO1xuZXhwb3J0IGNvbnN0IFlfTUlOID0gLTE2O1xuZXhwb3J0IGNvbnN0IFlfTUFYID0gMTEyO1xuZXhwb3J0IGNvbnN0IFdPUkxEX0hFSUdIVCA9IFlfTUFYIC0gWV9NSU47XG5leHBvcnQgY29uc3QgU0VBX0xFVkVMID0gMDtcbmV4cG9ydCBjb25zdCBXQVRFUiA9IFNFQV9MRVZFTDtcbi8qKiBHZW5lcmF0b3IgdjE6IHRoZSBvcmlnaW5hbCAyMDQ4IG0gaXNsYW5kLiBEZWZhdWx0IGZvciBjcmVhdGVXb3JsZCBhbmQgYWxsIGxlZ2FjeSBzYXZlcy4gKi9cbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVkVSU0lPTiA9IDE7XG4vKiogR2VuZXJhdG9yIHYyOiB2YWxsZXktd2l0aC1tb3VudGFpbnMgZ2VvZ3JhcGh5IHdpdGggYSBtb3VudGFpbiByaXZlciAoc2VlIHRlcnJhaW4tdjIudHMpLiAqL1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WMiA9IDI7XG4vKiogVGhlIGdlbmVyYXRvciBuZXcgYnJvd3NlciB3b3JsZHMgdXNlIGJ5IGRlZmF1bHQuICovXG5leHBvcnQgY29uc3QgTEFURVNUX0dFTkVSQVRPUl9WRVJTSU9OID0gR0VORVJBVE9SX1YyO1xuZXhwb3J0IGNvbnN0IFNVUFBPUlRFRF9HRU5FUkFUT1JfVkVSU0lPTlM6IHJlYWRvbmx5IG51bWJlcltdID0gW0dFTkVSQVRPUl9WRVJTSU9OLCBHRU5FUkFUT1JfVjJdO1xuZXhwb3J0IGNvbnN0IGlzU3VwcG9ydGVkR2VuZXJhdG9yID0gKHY6IHVua25vd24pOiB2IGlzIG51bWJlciA9PlxuICB0eXBlb2YgdiA9PT0gJ251bWJlcicgJiYgU1VQUE9SVEVEX0dFTkVSQVRPUl9WRVJTSU9OUy5pbmNsdWRlcyh2KTtcbmV4cG9ydCBjb25zdCBDSFVOS19WT0xVTUUgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRSAqIFdPUkxEX0hFSUdIVDtcbmV4cG9ydCBjb25zdCBDSFVOS19BUkVBID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkU7XG5cbmV4cG9ydCB7IE1BVCwgaXNTb2xpZCwgaXNPcGFxdWUsIE1BWF9NQVRfSUQgfSBmcm9tICcuL21hdGVyaWFscyc7XG5leHBvcnQgdHlwZSB7IE1hdElkIH0gZnJvbSAnLi9tYXRlcmlhbHMnO1xuaW1wb3J0IHsgTUFULCBpc1NvbGlkLCBNYXRJZCB9IGZyb20gJy4vbWF0ZXJpYWxzJztcblxuZXhwb3J0IHtcbiAgY2xhbXAsIGxlcnAsIGhhc2gyaSwgaGFzaDNpLCBtdWxiZXJyeTMyLCBmYm0yLFxufSBmcm9tICcuL25vaXNlJztcbmltcG9ydCB7XG4gIGNsYW1wLCBsZXJwLCBzbW9vdGhzdGVwLCBoYXNoMmksIGhhc2gzaSwgbXVsYmVycnkzMiwgdmFsdWVOb2lzZTMsIGZibTIsIGZibTMsXG59IGZyb20gJy4vbm9pc2UnO1xuXG4vLyAtLS0tLS0tLS0tIHdvcmxkIHR5cGVzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRQYXJhbXMge1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9QQVJBTVM6IFdvcmxkUGFyYW1zID0ge1xuICBzaXplOiBXT1JMRF9TSVpFLFxuICBjaHVua1NpemU6IENIVU5LX1NJWkUsXG4gIHlNaW46IFlfTUlOLFxuICB5TWF4OiBZX01BWCxcbiAgc2VhTGV2ZWw6IFNFQV9MRVZFTCxcbiAgZ2VuZXJhdG9yVmVyc2lvbjogR0VORVJBVE9SX1ZFUlNJT04sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBrZXk6IHN0cmluZztcbiAgLyoqIHggKyB6KjMyICsgKHktWV9NSU4pKjEwMjQgKi9cbiAgZGF0YTogVWludDhBcnJheTtcbiAgLyoqIHRvcCBzb2xpZCB5LCBlbmNvZGVkIGFzICh5IC0gWV9NSU4pLCAwLi4xMjc7IDAgbWVhbnMgbm8gc29saWQuICovXG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3AgbWF0ZXJpYWwgcGVyIGNvbHVtbi4gKi9cbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbiAgZGlydHk6IGJvb2xlYW47XG4gIGdlbmVyYXRlZEF0OiBudW1iZXI7XG59XG5cbi8vIE5hdHVyYWwgYXNzZXRzIGFyZSB0aGUgcHJvamVjdCdzIFN0eWwgKGBuYXRfYCkgcGlwZWxpbmUgKEFTLTAwMSB2MiksIG5vdFxuLy8gTm94ZWwgYXJjaGl0ZWN0dXJlLiBOb3hlbCByZW1haW5zIHRoZSBodW1hbi1tYWRlIGtpdC93YXlzdG9uZS9tYXJrZXIgc3lzdGVtLlxuLy8gUmV0aXJlZCBvbmx5IGFzIHdvcmxkIGNvbnRlbnQuIFRoZSBuYW1lcyByZW1haW4gaW4gdGhlIHNlcmlhbGl6ZWQgdHlwZSBzb1xuLy8gb2xkIHNuYXBzaG90cyBhbmQgYWNjZXB0ZWQgaGFydmVzdCBqb3VybmFscyBjYW4gYmUgbWlncmF0ZWQgd2l0aG91dCByZWplY3Rpbmdcbi8vIG90aGVyd2lzZSB2YWxpZCBzYXZlcy4gR2VuZXJhdGlvbiwgY29sbGlzaW9uIGFuZCBpbnNwZWN0aW9uIG5ldmVyIHVzZSB0aGVtLlxuZXhwb3J0IGNvbnN0IFJFVElSRURfU1RPTkVfS0lORFMgPSBuZXcgU2V0PEVudGl0eUtpbmQ+KFtcbiAgJ3N0eWxfcm9ja19zbWFsbCcsICdzdHlsX3JvY2tfbWVkaXVtJywgJ3N0eWxfcm9ja19sYXJnZScsXG5dKTtcbmV4cG9ydCBjb25zdCBpc1JldGlyZWRTdG9uZUtpbmQgPSAoa2luZDogRW50aXR5S2luZCk6IGJvb2xlYW4gPT4gUkVUSVJFRF9TVE9ORV9LSU5EUy5oYXMoa2luZCk7XG5leHBvcnQgdHlwZSBBY3RpdmVFbnRpdHlLaW5kID0gRXhjbHVkZTxFbnRpdHlLaW5kLFxuICAnc3R5bF9yb2NrX3NtYWxsJyB8ICdzdHlsX3JvY2tfbWVkaXVtJyB8ICdzdHlsX3JvY2tfbGFyZ2UnPjtcblxuZnVuY3Rpb24gbGl2ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBFbnRpdHkgfCBudWxsIHtcbiAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgcmV0dXJuICFlbnRpdHkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhpZCkgPyBudWxsIDogZW50aXR5O1xufVxuXG5leHBvcnQgdHlwZSBFbnRpdHlLaW5kID1cbiAgfCAnc3R5bF90cmVlX3NwaXJlJ1xuICB8ICdzdHlsX3RyZWVfdGFibGUnXG4gIHwgJ3N0eWxfdHJlZV9jbHVzdGVyJ1xuICB8ICdzdHlsX3RyZWVfYmxvc3NvbSdcbiAgfCAnc3R5bF9zaHJ1YidcbiAgfCAnc3R5bF9yb2NrX3NtYWxsJ1xuICB8ICdzdHlsX3JvY2tfbWVkaXVtJ1xuICB8ICdzdHlsX3JvY2tfbGFyZ2UnXG4gIHwgJ3N0eWxfb3JlJ1xuICB8ICdzdHlsX2NhaXJuJ1xuICB8ICd3YXlzdG9uZSdcbiAgfCAnbWFya2VyJztcblxuZXhwb3J0IHR5cGUgUmVzb3VyY2VUeXBlID0gJ3dvb2QnIHwgJ3N0b25lJyB8ICdvcmUnIHwgJ2ZpYmVyJztcblxuZXhwb3J0IGludGVyZmFjZSBFbnRpdHkge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICBjaHVuazogc3RyaW5nO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgc2NhbGU6IG51bWJlcjtcbiAgdmFyaWFudDogbnVtYmVyO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgcmVtYWluaW5nOiBudW1iZXI7XG4gIHlpZWxkUGVySGFydmVzdDogbnVtYmVyO1xuICAvKiogVHJ1ZSBvbmNlIHRoZSBlbnRpdHkgaXMgZnVsbHkgZGVwbGV0ZWQuICovXG4gIGhhcnZlc3RlZDogYm9vbGVhbjtcbiAgLyoqIFRydWUgYWZ0ZXIgdGhlIGZpcnN0IHN1Y2Nlc3NmdWwgaGFydmVzdCwgZXZlbiBpZiB5aWVsZCByZW1haW5zLiAqL1xuICBoYXJ2ZXN0ZWRPbmNlPzogYm9vbGVhbjtcbiAgcHJvdmlzaW9uYWw6IGJvb2xlYW47XG4gIGF1dGhvcmVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5veGVsU2l0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHByb3Zpc2lvbmFsOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZ2lvbkluZm8ge1xuICBpZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICB0eXBlOiAncGxhaW4nIHwgJ2ZvcmVzdCcgfCAnaGlsbHMnIHwgJ2hpZ2hsYW5kJyB8ICd3YXRlcicgfCAncmlkZ2UnO1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICByeDogbnVtYmVyO1xuICByejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkU3RhdHMge1xuICBjaHVua3NHZW5lcmF0ZWQ6IG51bWJlcjtcbiAgY2h1bmtzRXZpY3RlZDogbnVtYmVyO1xuICB2b3hlbHNGaWxsZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGlvbk1zOiBudW1iZXI7XG4gIGVudGl0aWVzOiBudW1iZXI7XG4gIHRyZWVzOiBudW1iZXI7XG4gIHBpbmtUcmVlczogbnVtYmVyO1xuICBwaW5rT3ZlcmZsb3c6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcGFyYW1zOiBXb3JsZFBhcmFtcztcbiAgY2h1bmtzOiBNYXA8c3RyaW5nLCBWb3hlbENodW5rPjtcbiAgZW50aXRpZXM6IE1hcDxzdHJpbmcsIEVudGl0eT47XG4gIGVudGl0eUNodW5rczogTWFwPHN0cmluZywgc3RyaW5nW10+O1xuICAvKiogQ2h1bmtzIHdob3NlIGRldGVybWluaXN0aWMgbmF0dXJhbC1lbnRpdHkgc3RhdGUgaGFzIGJlZW4gY2hhbmdlZC4gKi9cbiAgZW50aXR5Q2hhbmdlczogU2V0PHN0cmluZz47XG4gIC8qKiBUb21ic3RvbmVzIGZvciByZW1vdmVkIGRldGVybWluaXN0aWMgbmF0dXJhbCBlbnRpdGllcy4gKi9cbiAgZW50aXR5UmVtb3ZhbHM6IFNldDxzdHJpbmc+O1xuICAvKiogQXV0aG9yaXRhdGl2ZSBidWlsdCBzdHJ1Y3R1cmVzIChob3VzZSwgcGF0aCwgdGVycmFjZXMsIGNyb3BzKS4gKi9cbiAgc3RydWN0dXJlczogTWFwPHN0cmluZywgU3RydWN0dXJlPjtcbiAgc2l0ZXM6IE5veGVsU2l0ZVtdO1xuICByZWdpb25zOiBSZWdpb25JbmZvW107XG4gIC8qKiBjaHVuayBrZXkgLT4gbG9jYWwgdm94ZWwgaW5kZXggLT4gbWF0ZXJpYWwuIER1cmFibGUsIGNvbXBhY3QgZWRpdHMuICovXG4gIGVkaXRzOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCBudW1iZXI+PjtcbiAgLyoqIEdsb2JhbCBsb2NhbC1wbGF5ZXIgY2FycmllZCBiYWc7IGJvdW5kZWQgaW4gc2NoZW1hIDMsIGxlZ2FjeSBpbiAxLzIuICovXG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgLyoqIFByZXNlbnQgb25seSBhZnRlciBzY2hlbWEtMyBnZW5lc2lzL3Jlc3RvcmF0aW9uLiAqL1xuICBsaWZlPzogTGlmZVN0YXRlO1xuICAvKiogTTAwNiBsaXZpbmcgaG9tZXN0ZWFkOyBwcmVzZW50IG9uY2UgZm91bmRlZCAoc2NoZW1hIDMgb25seSkuICovXG4gIGhvbWVzdGVhZD86IEhvbWVzdGVhZFN0YXRlO1xuICBkaXJ0eTogU2V0PHN0cmluZz47XG4gIHN0YXRzOiBXb3JsZFN0YXRzO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqXG4gICAqIE1vbm90b25pYyByZXZpc2lvbiBvZiBhdXRob3JpdGF0aXZlIHN0YXRlICh2b3hlbHMgYW5kIGVudGl0aWVzKS4gRGVyaXZlZFxuICAgKiBjYWNoZXMga2V5ZWQgb24gdGhpcyB2YWx1ZSBhcmUgZGlzY2FyZGVkIGFmdGVyIGFuIGVkaXQ7IG1lc2gvbmF2aWdhdGlvblxuICAgKiByZXZpc2lvbnMgYXJlIHNlcGFyYXRlIGJlY2F1c2UgdGhleSBhcmUgZGVyaXZlZCwgbm90IHdvcmxkIHN0YXRlLlxuICAgKi9cbiAgcmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGNodW5rS2V5ID0gKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpID0+IGAke2N4fSwke2N6fWA7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5YID0gKGN4OiBudW1iZXIpID0+IGN4ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5aID0gKGN6OiBudW1iZXIpID0+IGN6ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgbG9jYWxJbmRleCA9IChseDogbnVtYmVyLCB5SW5kZXg6IG51bWJlciwgbHo6IG51bWJlcikgPT5cbiAgbHggKyBseiAqIENIVU5LX1NJWkUgKyB5SW5kZXggKiBDSFVOS19BUkVBO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ggPSAoeDogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh4ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtaID0gKHo6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeiArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWCA9ICh4OiBudW1iZXIpID0+IHggLSAod29ybGRUb0NodW5rWCh4KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxaID0gKHo6IG51bWJlcikgPT4geiAtICh3b3JsZFRvQ2h1bmtaKHopICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHlUb0luZGV4ID0gKHk6IG51bWJlcikgPT4geSAtIFlfTUlOO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGQoc2VlZCA9IDEzMzcsIGdlbmVyYXRvclZlcnNpb24gPSBHRU5FUkFUT1JfVkVSU0lPTik6IFdvcmxkIHtcbiAgaWYgKCFpc1N1cHBvcnRlZEdlbmVyYXRvcihnZW5lcmF0b3JWZXJzaW9uKSkgdGhyb3cgbmV3IEVycm9yKGB1bnN1cHBvcnRlZCBnZW5lcmF0b3IgdmVyc2lvbiAke2dlbmVyYXRvclZlcnNpb259YCk7XG4gIHJldHVybiB7XG4gICAgc2VlZCxcbiAgICBwYXJhbXM6IHsgLi4uREVGQVVMVF9QQVJBTVMsIGdlbmVyYXRvclZlcnNpb24gfSxcbiAgICBjaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdGllczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNoYW5nZXM6IG5ldyBTZXQoKSxcbiAgICBlbnRpdHlSZW1vdmFsczogbmV3IFNldCgpLFxuICAgIHN0cnVjdHVyZXM6IG5ldyBNYXAoKSxcbiAgICBzaXRlczogW10sXG4gICAgcmVnaW9uczogUkVHSU9OUyxcbiAgICBlZGl0czogbmV3IE1hcCgpLFxuICAgIGludmVudG9yeToge30sXG4gICAgZGlydHk6IG5ldyBTZXQoKSxcbiAgICBzdGF0czoge1xuICAgICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICAgIGVudGl0aWVzOiAwLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gICAgfSxcbiAgICBhdXRob3JlZFBsYWNlZDogZmFsc2UsXG4gICAgcmV2aXNpb246IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBpbml0aWFsUmFkaXVzID0gMCwgZ2VuZXJhdG9yVmVyc2lvbiA9IEdFTkVSQVRPUl9WRVJTSU9OKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQsIGdlbmVyYXRvclZlcnNpb24pO1xuICBjb25zdCBjZW50cmUgPSBNYXRoLmZsb29yKENIVU5LU19QRVJfU0lERSAvIDIpO1xuICBmb3IgKGxldCBjeiA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN6IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN4IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN4KyspIHtcbiAgICAgIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgfVxuICB9XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuLy8gLS0tLS0tLS0tLSBnZW9ncmFwaHkgLS0tLS0tLS0tLVxuZXhwb3J0IGNvbnN0IFJFR0lPTlM6IFJlZ2lvbkluZm9bXSA9IFtcbiAgeyBpZDogJ2ZvdW5kZXInLCBsYWJlbDogJ0ZvdW5kZXIgdmFsbGV5JywgdHlwZTogJ3BsYWluJywgY3g6IDAsIGN6OiAwLCByeDogMTEwLCByejogODUgfSxcbiAgeyBpZDogJ2Vhc3R3b29kJywgbGFiZWw6ICdFYXN0d29vZCcsIHR5cGU6ICdmb3Jlc3QnLCBjeDogMjIwLCBjejogLTExMCwgcng6IDI2MCwgcno6IDIyMCB9LFxuICB7IGlkOiAnY3Jvd24nLCBsYWJlbDogJ0Nyb3duIGhpZ2hsYW5kcycsIHR5cGU6ICdoaWdobGFuZCcsIGN4OiAtMzYwLCBjejogLTMwMCwgcng6IDM4MCwgcno6IDMwMCB9LFxuICB7IGlkOiAnbGFrZScsIGxhYmVsOiAnTWlycm9yIGxha2UnLCB0eXBlOiAnd2F0ZXInLCBjeDogLTI2MCwgY3o6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9LFxuICB7IGlkOiAnc291dGhkb3ducycsIGxhYmVsOiAnU291dGggZG93bnMnLCB0eXBlOiAnaGlsbHMnLCBjeDogMTIwLCBjejogMzMwLCByeDogMjYwLCByejogMTkwIH0sXG4gIHsgaWQ6ICd3ZXN0cmlzZScsIGxhYmVsOiAnV2VzdCByaXNlJywgdHlwZTogJ2hpbGxzJywgY3g6IC0zNjAsIGN6OiAxMjAsIHJ4OiAyMjAsIHJ6OiAyMTAgfSxcbiAgeyBpZDogJ2NvYXN0JywgbGFiZWw6ICdCcm9rZW4gY29hc3QnLCB0eXBlOiAncmlkZ2UnLCBjeDogMCwgY3o6IDAsIHJ4OiA3ODAsIHJ6OiA2NjAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckNlbnRlclgoejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVGhlIHJpdmVyIHJ1bnMgbm9ydGhcdTIwMTNzb3V0aCBhYm91dCA3MFx1MjAxMzExMCBtIHdlc3Qgb2YgdGhlIGZvdW5kZXIgc2hlbGYsIHNvXG4gIC8vIHRoZSBkZWZhdWx0IG5vcnRoLXdlc3QgdmlldyBoYXMgd2F0ZXIsIGEgbmVhciBiYW5rIGFuZCBhIGZhciBiYW5rLlxuICByZXR1cm4gLTkwICsgNTUgKiBNYXRoLnNpbigoeiArIDEwMCkgLyAyNDApICsgMTggKiBNYXRoLnNpbigoeiAtIDIwKSAvIDgwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5hYnMoeCAtIHJpdmVyQ2VudGVyWCh6KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsYWtlRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5zcXJ0KCgoeCArIDI2MCkgLyAxMjApICoqIDIgKyAoKHogKyAyMzApIC8gOTUpICoqIDIpO1xufVxuXG4vKipcbiAqIEludGVnZXIgdG9wIHNvbGlkIHkgb2YgdGhlIGJhc2UgZ2VuZXJhdGVkIHN1cmZhY2UgKG5vIGVkaXRzL292ZXJoYW5ncykuXG4gKlxuICogVGhpcyBpcyB0aGUgKnNoYXBlKiB0aGUgdm94ZWwgdm9sdW1lIGlzIGZpbGxlZCBmcm9tLCBub3QgdGhlIHN0b3JlZCB3b3JsZC5cbiAqIFRoZSBpbXBvcnRhbnQgY29ycmVjdGlvbiBvdmVyIHRoZSBmaXJzdCBNMDAxIHBhc3MgaXMgdGhhdCB0aGUgbGFuZHNjYXBlIGlzXG4gKiBub3Qgb25lIHNtb290aCByYWRpYWwgYm93bDogaXQgaXMgYSB3YXJwZWQgbXVsdGktc2NhbGUgc3VyZmFjZSB3aXRoIGEgYnJvYWRcbiAqIHJpdmVyIHZhbGxleSwgYSBzbWFsbCBidWlsZGFibGUgc2hlbGYsIGFuZCByaWRnZWQgaGlnaGxhbmRzLiBBIHNoYWxsb3dcbiAqIHNtb290aCBzdXJmYWNlIHF1YW50aXNlZCB0byAxIG0gdm94ZWxzIGlzIHdoYXQgcHJvZHVjZWQgdGhlIGNvbmNlbnRyaWNcbiAqIGNvbnRvdXIgcmluZ3M7IHZhcmllZCByZWxpZWYgYW5kIGEgcml2ZXIgdmFsbGV5IGJyZWFrIHRoZW0gbmF0dXJhbGx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUd28tc2NhbGUgZG9tYWluIHdhcnAuIFRoZSBicm9hZCB3YXJwIG1vdmVzIGNvYXN0bGluZXMgYW5kIGhpbGxzOyB0aGVcbiAgLy8gc21hbGwgd2FycCBrZWVwcyB0aGUgMSBtIHF1YW50aXNhdGlvbiBmcm9tIGZvbGxvd2luZyBjbGVhbiBjb250b3Vycy5cbiAgY29uc3Qgd3ggPSB4XG4gICAgKyAoZmJtMih4IC8gNDIwLCB6IC8gNDIwLCBzZWVkICsgMTAxLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSwgeiAvIDk1LCBzZWVkICsgMTAyLCAyKSAtIDAuNSkgKiAzMDtcbiAgY29uc3Qgd3ogPSB6XG4gICAgKyAoZmJtMih4IC8gNDIwICsgNy4zLCB6IC8gNDIwIC0gMy4xLCBzZWVkICsgMTAzLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSArIDMuNywgeiAvIDk1IC0gOC4xLCBzZWVkICsgMTA0LCAyKSAtIDAuNSkgKiAzMDtcblxuICBjb25zdCByYWRpYWwgPSBNYXRoLnNxcnQoKHd4IC8gNzgwKSAqKiAyICsgKHd6IC8gNjYwKSAqKiAyKTtcbiAgY29uc3QgY29hc3ROb2lzZSA9IChmYm0yKHd4IC8gMzAwLCB3eiAvIDMwMCwgc2VlZCArIDEwNSwgNCkgLSAwLjUpICogMC4zNFxuICAgICsgKGZibTIod3ggLyA5NSwgd3ogLyA5NSwgc2VlZCArIDEwNiwgMikgLSAwLjUpICogMC4xMDtcbiAgY29uc3QgbGFuZG5lc3MgPSAxLjAgLSByYWRpYWwgKyBjb2FzdE5vaXNlO1xuICBjb25zdCBpbmxhbmQgPSBzbW9vdGhzdGVwKC0wLjAzLCAwLjEyLCBsYW5kbmVzcyk7XG5cbiAgY29uc3Qgb2NlYW5GbG9vciA9IC0xMyArIDYgKiBmYm0yKHd4IC8gMTcwLCB3eiAvIDE3MCwgc2VlZCArIDEwNywgMyk7XG5cbiAgLy8gUm9sbGluZyBsYW5kIGF0IHRocmVlIHNjYWxlcy4gVGhlIDQwIG0gYW5kIDE1IG0gY29tcG9uZW50cyBhcmUgcmVhbFxuICAvLyBzdXJmYWNlIGhlaWdodCwgbm90IGEgcmVuZGVyIGRlY29yYXRpb24sIHNvIHRoZSBtYWNybyBzYW1wbGVyIGFncmVlcy5cbiAgY29uc3Qgc3dlbGwgPSA0ICsgMTEgKiBmYm0yKHd4IC8gMzQwLCB3eiAvIDM0MCwgc2VlZCArIDEwOCwgNCk7XG4gIGNvbnN0IGhpbGxzID0gOCAqIGZibTIod3ggLyAxMTUsIHd6IC8gMTE1LCBzZWVkICsgMTA5LCAzKTtcbiAgY29uc3QgYnVtcHMgPSAyLjIgKiBmYm0yKHggLyA0MiwgeiAvIDQyLCBzZWVkICsgMTEwLCAyKVxuICAgICsgMC45ICogZmJtMih4IC8gMTUsIHogLyAxNSwgc2VlZCArIDExMSwgMik7XG5cbiAgLy8gUmlkZ2VkIGhpZ2hsYW5kcy4gVGhlIG1hc3NpZiBtYXNrIGlzIHJlZ2lvbmFsIGFuZCBiaWFzZWQgdG8gdGhlXG4gIC8vIG5vcnRoLXdlc3Q7IHdpdGhvdXQgdGhlIHJlZ2lvbmFsIGdhdGUgdGhlIGZpcnN0IE0wMDEgcGFzcyByYWlzZWQgYSA0OCBtXG4gIC8vIG1vdW50YWluIGRpcmVjdGx5IHVuZGVyIHRoZSBmb3VuZGVyIHNoZWxmLlxuICBjb25zdCBtYXNzaWZOb2lzZSA9IGZibTIod3ggLyA0ODAgKyAxMSwgd3ogLyA0ODAgLSA3LCBzZWVkICsgMTEyLCA0KTtcbiAgY29uc3QgbWFzc2lmTWFzayA9IHNtb290aHN0ZXAoMC42MCwgMC43OCwgbWFzc2lmTm9pc2UpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIzMCwgd3ogLyAyMzAsIHNlZWQgKyAxMTMsIDQpIC0gMSk7XG4gIGNvbnN0IHJpZGdlMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE0LCAzKSAtIDEpO1xuICBjb25zdCBud0JpYXMgPSBNYXRoLmV4cCgtKCgod3ggKyAzNjApIC8gMzgwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAzMjApICoqIDIpKTtcbiAgY29uc3QgbW91bnQgPSBNYXRoLm1pbigxLCBtYXNzaWZNYXNrICogKDAuMzAgKyAwLjcwICogbndCaWFzKSArIDAuMjIgKiBud0JpYXMpO1xuXG4gIGxldCBoID0gc3dlbGwgKyBoaWxscyArIGJ1bXBzXG4gICAgKyBtb3VudCAqICgyMCArIDQwICogcmlkZ2UgKiByaWRnZSArIDEyICogcmlkZ2UyKTtcblxuICAvLyBTcHVycyBhbmQgZ3VsbGllcyBhdCAzMFx1MjAxMzkwIG0uIFdpdGhvdXQgdGhlc2UsIGEgc21vb3RoIGhpbGwgcXVhbnRpc2VkIHRvXG4gIC8vIDEgbSB2b3hlbHMgcmVhZHMgYXMgY29uY2VudHJpYyBjb250b3VyIHJpbmdzOyB3aXRoIHRoZW0sIHRoZSBzYW1lIGhpbGxcbiAgLy8gYnJlYWtzIGludG8gcmlkZ2VzLCBzaWRlIHZhbGxleXMgYW5kIHJvY2sgZmFjZXMuXG4gIGNvbnN0IHNwdXIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4NSwgd3ogLyA4NSwgc2VlZCArIDEyMCwgMykgLSAxKTtcbiAgY29uc3QgZ3VsbHkgPSBNYXRoLnBvdygxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA1MiArIDEzLCB3eiAvIDUyIC0gNSwgc2VlZCArIDEyMSwgMykgLSAxKSwgMik7XG4gIGggKz0gKHNwdXIgLSAwLjU1KSAqIDUuMCAtIGd1bGx5ICogMy4yO1xuXG4gIGggPSBvY2VhbkZsb29yICsgKGggLSBvY2VhbkZsb29yKSAqIGlubGFuZDtcbiAgaCArPSAxLjYgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuXG4gIC8vIEJyb2FkIHJpdmVyIHZhbGxleSwgdGhlbiB0aGUgY2hhbm5lbCBpdHNlbGYuIFRoZSB2YWxsZXkgbWFzayBpcyBnYXRlZCBieVxuICAvLyBsYW5kbmVzczogd2l0aG91dCB0aGUgZ2F0ZSBpdCBwdWxsZWQgdGhlIG9jZWFuIGZsb29yIHVwIHRvIHRoZSB2YWxsZXlcbiAgLy8gZmxvb3Igb3V0c2lkZSB0aGUgaXNsYW5kLCB3aGljaCB0aGUgbWFwIHZpZXcgc2hvd2VkIGFzIHBhbGUgcml2ZXItc2hhcGVkXG4gIC8vIGJhcnMgcnVubmluZyB0byB0aGUgaG9yaXpvbi5cbiAgY29uc3QgcmQgPSByaXZlckRpc3RhbmNlKHd4LCB3eik7XG4gIGNvbnN0IHZhbGxleSA9IHNtb290aHN0ZXAoOTUsIDEwLCByZCkgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuICBjb25zdCB2YWxsZXlGbG9vciA9IDIuNSArIDEuMCAqIGZibTIod3ggLyA2MCwgd3ogLyA2MCwgc2VlZCArIDExNSwgMik7XG4gIGggPSBsZXJwKGgsIHZhbGxleUZsb29yLCB2YWxsZXkgKiAwLjc1KTtcbiAgY29uc3Qgcml2ZXJXID0gNS4wICsgMy4wICogZmJtMih3eCAvIDQ1LCB3eiAvIDQ1LCBzZWVkICsgMTE2LCAyKTtcbiAgLy8gQSB3aWRlLCBzaGFsbG93IGNoYW5uZWwgcHJvZmlsZS4gVGhlIGZpcnN0IHBhc3MgY2FydmVkIGEgMTIgbSBzbG90IHdpdGhcbiAgLy8gbmVhci12ZXJ0aWNhbCBiYW5rcywgd2hpY2ggcmVhZCBhcyBhIGJyaWdodCBzdG9uZSBxdWFycnkgcmF0aGVyIHRoYW4gYVxuICAvLyByaXZlci4gVGhlIG91dGVyIGVkZ2UgaXMgbm93IH4yNSBtIGZyb20gdGhlIGNlbnRyZWxpbmUsIGFuZCB0aGUgYmVkIGlzXG4gIC8vIG9ubHkgMiBtIGJlbG93IHNlYSBsZXZlbC5cbiAgY29uc3QgY2hhbm5lbCA9IHNtb290aHN0ZXAocml2ZXJXICsgMTgsIHJpdmVyVyAqIDAuNCwgcmQpO1xuICBpZiAobGFuZG5lc3MgPiAwLjApIGggPSBsZXJwKGgsIC0yLjAsIGNoYW5uZWwgKiAwLjk1KTtcblxuICAvLyBMYWtlIGJhc2luIGF0IHRoZSBmb290IG9mIHRoZSBub3J0aC13ZXN0IGhpZ2hsYW5kcy5cbiAgY29uc3QgbGFrZUQgPSBsYWtlRGlzdGFuY2Uod3gsIHd6KVxuICAgICogKDEgKyAwLjE4ICogKGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNywgMikgLSAwLjUpICogMik7XG4gIGlmIChsYWtlRCA8IDEuMTUpIHtcbiAgICBjb25zdCBsYWtlTWFzayA9IHNtb290aHN0ZXAoMS4xNSwgMC41NSwgbGFrZUQpO1xuICAgIGggPSBsZXJwKGgsIC02LjUsIGxha2VNYXNrICogMC45NSk7XG4gIH1cblxuICAvLyBGb3VuZGVyIHNoZWxmOiBhIHNtYWxsLCBpcnJlZ3VsYXIgYnVpbGRhYmxlIHRlcnJhY2Ugb24gdGhlIGVhc3QgYmFuay5cbiAgLy8gRGVsaWJlcmF0ZWx5IG5vdCBhIDI2MCBtIHJhZGlhbCBmbGF0dGVuOyB0aGUgcHJldmlvdXMgcGFzcyBzaG93ZWQgdGhhdCBhXG4gIC8vIGxhcmdlIGZsYXR0ZW4tdG8tY29uc3RhbnQgYmVjb21lcyBhIHZpc2libGUgYm93bCBvZiBjb250b3VyIHJpbmdzLlxuICBjb25zdCBzaGVsZkQgPSBNYXRoLnNxcnQoKCh4ICsgOCkgLyA2MikgKiogMiArICgoeiAtIDQpIC8gNDgpICoqIDIpXG4gICAgKyAoZmJtMih4IC8gNDUsIHogLyA0NSwgc2VlZCArIDExOCwgMikgLSAwLjUpICogMC41NTtcbiAgY29uc3Qgc2hlbGYgPSBzbW9vdGhzdGVwKDEuMDUsIDAuNTUsIHNoZWxmRCk7XG4gIGlmIChzaGVsZiA+IDApIHtcbiAgICBjb25zdCB0YXJnZXQgPSAxMy4wICsgMS4yICogZmJtMih4IC8gMzYsIHogLyAzNiwgc2VlZCArIDExOSwgMikgKyB4ICogMC4wMTtcbiAgICBoID0gbGVycChoLCB0YXJnZXQsIHNoZWxmICogMC43OCk7XG4gIH1cblxuICByZXR1cm4gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIDkyKSk7XG59XG5cbmZ1bmN0aW9uIHNsb3BlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4pOiBNYXRJZCB7XG4gIC8vIFJpdmVyIGJlZCBpcyBncmF2ZWw7IHRoZSBiZWFjaCBpcyBhIG5hcnJvdyBzYW5kIGJhbmQsIG5vdCB0aGUgd2hvbGVcbiAgLy8gdmFsbGV5IGZsb29yLiBUaGUgZmlyc3QgcGFzcyBtYXJrZWQgZXZlcnkgY2VsbCB3aXRoaW4gNCBtIG9mIHNlYSBsZXZlbFxuICAvLyBhcyBzYW5kLCB3aGljaCBwcm9kdWNlZCBhIGNvbnNwaWN1b3VzIHBhbGUgc3RyaXAgYWxvbmcgdGhlIHJpdmVyLlxuICBpZiAocml2ZXJEaXN0YW5jZSh4LCB6KSA8IDEyICYmIGggPCBTRUFfTEVWRUwgKyAxKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgaWYgKGggPD0gU0VBX0xFVkVMICsgMC41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChuZWFyV2F0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgIG5lYXJXYXRlciA9XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMykgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDMpIDwgU0VBX0xFVkVMICsgMTtcbiAgfVxuICBpZiAobmVhcldhdGVyICYmIGggPD0gU0VBX0xFVkVMICsgMS41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChzbG9wZSA+PSAzKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDU4ICYmIGZibTIoeCAvIDE4LCB6IC8gMTgsIHNlZWQgKyAxMjAsIDIpID4gMC40NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0OCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQwICYmIHNsb3BlID49IDIgJiYgZmJtMih4IC8gMTIsIHogLyAxMiwgc2VlZCArIDEyMSwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNUT05FO1xuICByZXR1cm4gTUFULkdSQVNTO1xuXG59XG5cbi8qKiBQdWJsaWMgYmFzZS1tYXRlcmlhbCBzZWxlY3RvciBmb3IgbWFjcm8gTE9EIGFuZCB0ZXN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWwoXG4gIHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyOiBib29sZWFuLFxuKTogTWF0SWQge1xuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZnVuY3Rpb24gc3Vic29pbEZvcih0b3A6IE1hdElkKTogTWF0SWQge1xuICBpZiAodG9wID09PSBNQVQuR1JBU1MgfHwgdG9wID09PSBNQVQuTU9TUykgcmV0dXJuIE1BVC5TT0lMO1xuICBpZiAodG9wID09PSBNQVQuU05PVykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVZFTCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIHJldHVybiBNQVQuU1RPTkU7XG59XG5cbmZ1bmN0aW9uIG9yZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBjbHVzdGVyID0gZmJtMih4IC8gNTUsIHogLyA1NSwgc2VlZCArIDEzMCwgMik7XG4gIGlmIChjbHVzdGVyIDwgMC41NykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBuID0gdmFsdWVOb2lzZTMoeCAqIDAuMDksIHkgKiAwLjEzLCB6ICogMC4wOSwgc2VlZCArIDEzMSk7XG4gIGNvbnN0IG4yID0gdmFsdWVOb2lzZTMoeCAqIDAuMjIgKyA1LCB5ICogMC4zMSwgeiAqIDAuMjIgLSAzLCBzZWVkICsgMTMyKTtcbiAgcmV0dXJuIG4gPiAwLjcwICYmIG4yID4gMC41MDtcbn1cblxuZnVuY3Rpb24gY2F2ZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gZmJtMyh4ICogMC4wNzUsIHkgKiAwLjExLCB6ICogMC4wNzUsIHNlZWQgKyAxNDAsIDIpID4gMC43Mjtcbn1cblxuZnVuY3Rpb24gb3ZlcmhhbmdBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHZhbHVlTm9pc2UzKHggKiAwLjE4LCB5ICogMC4yMiwgeiAqIDAuMTgsIHNlZWQgKyAxNDEpID4gMC42Mjtcbn1cblxuLy8gLS0tLS0tLS0tLSB2ZXJzaW9uZWQgZ2VuZXJhdG9yIGRpc3BhdGNoIC0tLS0tLS0tLS1cbmNvbnN0IHYyQ2FjaGUgPSBuZXcgTWFwPG51bWJlciwgVGVycmFpblYyPigpO1xuY29uc3QgaHlkcm9DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBIeWRyb2xvZ3k+KCk7XG5cbi8qKiBEZXRlcm1pbmlzdGljIGh5ZHJvbG9neSBuZXR3b3JrIGZvciBhIHNlZWQgYW5kIGdlbmVyYXRvciB2ZXJzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGh5ZHJvbG9neUZvcihzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlcik6IEh5ZHJvbG9neSB7XG4gIGlmICh2ZXJzaW9uID49IEdFTkVSQVRPUl9WMikgcmV0dXJuIHRlcnJhaW5WMihzZWVkKS5oeWRyb2xvZ3k7XG4gIGNvbnN0IGtleSA9IGAke3NlZWR9OiR7dmVyc2lvbn1gO1xuICBsZXQgaHlkcm8gPSBoeWRyb0NhY2hlLmdldChrZXkpO1xuICBpZiAoIWh5ZHJvKSB7XG4gICAgaHlkcm8gPSBuZXcgSHlkcm9sb2d5KHsgc2VlZCwgdmVyc2lvbiwgdjFIZWlnaHQ6ICh4LCB6KSA9PiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeikgfSk7XG4gICAgaHlkcm9DYWNoZS5zZXQoa2V5LCBoeWRybyk7XG4gIH1cbiAgcmV0dXJuIGh5ZHJvO1xufVxuXG4vKiogQGludGVybmFsIFRoZSB2MiBnZW5lcmF0b3IgZm9yIGEgc2VlZCAoY2FjaGVkOyBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZXJyYWluVjIoc2VlZDogbnVtYmVyKTogVGVycmFpblYyIHtcbiAgbGV0IGdlbiA9IHYyQ2FjaGUuZ2V0KHNlZWQpO1xuICBpZiAoIWdlbikge1xuICAgIGNvbnN0IGh5ZHJvbG9neSA9IG5ldyBIeWRyb2xvZ3koeyBzZWVkLCB2ZXJzaW9uOiBHRU5FUkFUT1JfVjIsIHYxSGVpZ2h0OiAoeCwgeikgPT4gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopIH0pO1xuICAgIGdlbiA9IG5ldyBUZXJyYWluVjIoc2VlZCwgc3VyZmFjZUhlaWdodEF0LCBoeWRyb2xvZ3kpO1xuICAgIHYyQ2FjaGUuc2V0KHNlZWQsIGdlbik7XG4gIH1cbiAgcmV0dXJuIGdlbjtcbn1cblxuLyoqIEJhc2UgZ2VuZXJhdGVkIGhlaWdodCAodG9wIHNvbGlkICsgMSkgZm9yIGFueSBzdXBwb3J0ZWQgZ2VuZXJhdG9yIHZlcnNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiB2ZXJzaW9uID49IEdFTkVSQVRPUl9WMiA/IHRlcnJhaW5WMihzZWVkKS5oZWlnaHQoeCwgeikgOiBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG59XG5cbi8qKiBCYXNlIGdlbmVyYXRlZCB3YXRlciBzdXJmYWNlOiB3YXRlciBmaWxscyBjZWxscyBbaGVpZ2h0LCBsZXZlbCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVdhdGVyTGV2ZWxBdChzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAodmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIpIHJldHVybiB0ZXJyYWluVjIoc2VlZCkuY29sdW1uKHgsIHopLmxldmVsO1xuICBjb25zdCBoID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCA6IGg7XG59XG5cbmZ1bmN0aW9uIHZlcnNpb25lZFNsb3BlKHNlZWQ6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gYmFzZUhlaWdodEF0KHNlZWQsIHZlcnNpb24sIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIGJhc2VIZWlnaHRBdChzZWVkLCB2ZXJzaW9uLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuLyoqIEJhc2UgdG9wIG1hdGVyaWFsIGZvciBhbnkgZ2VuZXJhdG9yIHZlcnNpb24gKG1hY3JvIExPRCwgZW50aXR5IHBsYWNlbWVudCkuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsRm9yKFxuICBzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgaWYgKHZlcnNpb24gPj0gR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgZ2VuID0gdGVycmFpblYyKHNlZWQpO1xuICAgIHJldHVybiBnZW4udG9wTWF0ZXJpYWwoeCwgeiwgZ2VuLmNvbHVtbih4LCB6KSwgc2xvcGUsXG4gICAgICAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGhoLCBzcywgbmVhcldhdGVyKSk7XG4gIH1cbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VyZmFjZVNhbXBsZSB7XG4gIHk6IG51bWJlcjtcbiAgdG9wOiBNYXRJZDtcbiAgc2xvcGU6IG51bWJlcjtcbn1cblxuLyoqIEJhc2Ugc3VyZmFjZSBzYW1wbGUgZm9yIG1hY3JvIExPRC4gRG9lcyBub3QgaW5jbHVkZSB2b3hlbCBlZGl0cy9vdmVyaGFuZ3MuICovXG5leHBvcnQgZnVuY3Rpb24gc2FtcGxlU3VyZmFjZShzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogU3VyZmFjZVNhbXBsZSB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIGNvbnN0IHNsb3BlID0gc2xvcGVBdChzZWVkLCB4LCB6LCB5KTtcbiAgcmV0dXJuIHsgeSwgdG9wOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIHksIHNsb3BlKSwgc2xvcGUgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBjaHVuayBnZW5lcmF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIHJldHVybiBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBiYXNlID0gZ2VuZXJhdGVCYXNlQ2h1bmsod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIGN4LCBjeik7XG4gIHJldHVybiBpbnN0YWxsQmFzZUNodW5rKHdvcmxkLCBiYXNlLCBwZXJmb3JtYW5jZS5ub3coKSAtIHQwKTtcbn1cblxuLyoqXG4gKiBCYXNlIGdlbmVyYXRlZCBjb250ZW50cyBvZiBhIGNodW5rIGJlZm9yZSBkdXJhYmxlIGVkaXRzLiBBIHB1cmUgZnVuY3Rpb24gb2ZcbiAqIChzZWVkLCBnZW5lcmF0b3IgdmVyc2lvbiwgY3gsIGN6KTogc2FmZSB0byBjb21wdXRlIGluIGEgV2ViIFdvcmtlciwgYW5kIHRoZVxuICogYnl0ZXMgYXJlIGlkZW50aWNhbCB3aGVyZXZlciBpdCBydW5zLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEJhc2VDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHNlZWQ6IG51bWJlcjtcbiAgdmVyc2lvbjogbnVtYmVyO1xuICBkYXRhOiBVaW50OEFycmF5O1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVCYXNlQ2h1bmsoc2VlZDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBCYXNlQ2h1bmsge1xuICBjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfVk9MVU1FKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCB0b3BNYXRlcmlhbHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGNvbnN0IHYyID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjIgPyB0ZXJyYWluVjIoc2VlZCkgOiBudWxsO1xuXG4gIC8vIFBhZGRlZCBoZWlnaHQgY2FjaGU6IGEgdGhyZWUtY2VsbCBib3JkZXIgY292ZXJzIHNsb3BlLCBiZWFjaCBhbmQgbGVkZ2VzLlxuICBjb25zdCBQID0gMztcbiAgY29uc3QgUFcgPSBDSFVOS19TSVpFICsgUCAqIDI7XG4gIGNvbnN0IGJhc2VIID0gbmV3IEludDE2QXJyYXkoUFcgKiBQVyk7XG4gIGNvbnN0IHYyQ29sczogVjJDb2x1bW5bXSB8IG51bGwgPSB2MiA/IG5ldyBBcnJheShDSFVOS19BUkVBKSA6IG51bGw7XG4gIGZvciAobGV0IHB6ID0gMDsgcHogPCBQVzsgcHorKykge1xuICAgIGZvciAobGV0IHB4ID0gMDsgcHggPCBQVzsgcHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIHB4IC0gUCwgd3ogPSBveiArIHB6IC0gUDtcbiAgICAgIGlmICh2Mikge1xuICAgICAgICBjb25zdCBjb2wgPSB2Mi5jb2x1bW4od3gsIHd6KTtcbiAgICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IGNvbC5oO1xuICAgICAgICBjb25zdCBseCA9IHB4IC0gUCwgbHogPSBweiAtIFA7XG4gICAgICAgIGlmIChseCA+PSAwICYmIGx6ID49IDAgJiYgbHggPCBDSFVOS19TSVpFICYmIGx6IDwgQ0hVTktfU0laRSkgdjJDb2xzIVtseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjb2w7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHd4LCB3eik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgbGV0IG5vbkFpciA9IDA7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5lYXJXYXRlciA9XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCAtIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgKyAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMTtcbiAgICAgIGNvbnN0IHYyQ29sID0gdjJDb2xzID8gdjJDb2xzW2x6ICogQ0hVTktfU0laRSArIGx4XSA6IG51bGw7XG4gICAgICBjb25zdCB0b3AgPSB2MiAmJiB2MkNvbFxuICAgICAgICA/IHYyLnRvcE1hdGVyaWFsKHd4LCB3eiwgdjJDb2wsIHNsb3BlLCAoaGgsIHNzKSA9PiB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaGgsIHNzLCBuZWFyV2F0ZXIpKVxuICAgICAgICA6IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICAgIGNvbnN0IHN1YiA9IHN1YnNvaWxGb3IodG9wKTtcbiAgICAgIGNvbnN0IG9yZVBvdGVudGlhbCA9IGZibTIod3ggLyA1NSwgd3ogLyA1NSwgc2VlZCArIDEzMCwgMikgPiAwLjU3O1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG5cbiAgICAgIGNvbnN0IHN0YXJ0ID0gWV9NSU47XG4gICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihZX01BWCAtIDEsIGggLSAxKTtcbiAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8PSBlbmQ7IHkrKykge1xuICAgICAgICBjb25zdCBkZXB0aCA9IGggLSAxIC0geTtcbiAgICAgICAgbGV0IG06IE1hdElkO1xuICAgICAgICBpZiAoeSA9PT0gWV9NSU4pIG0gPSBNQVQuQkVEUk9DSztcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPT09IDApIG0gPSB0b3A7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoIDw9IDIpIG0gPSBzdWI7XG4gICAgICAgIGVsc2UgbSA9IE1BVC5TVE9ORTtcblxuICAgICAgICBpZiAobSA9PT0gTUFULlNUT05FICYmIGRlcHRoID4gNCAmJiBvcmVQb3RlbnRpYWwgJiYgb3JlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuT1JFO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3BhcnNlIDNEIG92ZXJoYW5ncy91bmRlcmN1dHMgYXQgc3RlZXAgZmFjZXMuIFRoaXMgaXMgYSByZWFsXG4gICAgICAgIC8vIG9jY3VwYW5jeSBjaGFuZ2UsIG5vdCBhIGRlY29yYXRpb24gb24gdG9wIG9mIGEgaGVpZ2h0ZmllbGQuXG4gICAgICAgIGlmIChkZXB0aCA8PSAyICYmIHNsb3BlID49IDIgJiYgb3ZlcmhhbmdBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVlcCBjYXZlcywga2VwdCBhd2F5IGZyb20gdGhlIHN1cmZhY2Ugc28gdGhleSBkbyBub3QgY3JlYXRlIGhvbGVzLlxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUiAmJiBkZXB0aCA+IDcgJiYgZGVwdGggPCAyNCAmJiBjYXZlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildID0gbTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBXYXRlciB2b2x1bWU6IGV2ZXJ5dGhpbmcgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UgdXAgdG8gdGhlIGNvbHVtbidzXG4gICAgICAvLyB3YXRlciBsZXZlbCAoc2VhIGxldmVsIGluIHYxOyB0aGUgaHlkcm9sb2dpY2FsIGxldmVsIGluIHYyKS5cbiAgICAgIGNvbnN0IHdhdGVyTGV2ZWwgPSB2MkNvbCA/IE1hdGgubWluKFlfTUFYLCB2MkNvbC5sZXZlbCkgOiBTRUFfTEVWRUw7XG4gICAgICBpZiAoaCA8IHdhdGVyTGV2ZWwpIHtcbiAgICAgICAgZm9yIChsZXQgeSA9IE1hdGgubWF4KFlfTUlOLCBoKTsgeSA8IHdhdGVyTGV2ZWw7IHkrKykge1xuICAgICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseik7XG4gICAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgICAgZGF0YVtpZHhdID0gTUFULldBVEVSO1xuICAgICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvcFNvbGlkID0gTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLm1heChZX01JTiwgaCAtIDEpKTtcbiAgICAgIGhlaWdodHNbY29sXSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2NvbF0gPSB0b3A7XG4gICAgfVxuICB9XG5cbiAgLy8gUHJvdHJ1ZGluZyBsZWRnZXM6IG9uZSBvciB0d28gc3RvbmUgYmxvY2tzIGV4dGVuZCBmcm9tIGEgaGlnaCBjb2x1bW4gb3ZlclxuICAvLyBhIGxvd2VyIG5laWdoYm91ci4gVGhleSBjcmVhdGUgcmVhZGFibGUgb3ZlcmhhbmdzIHdpdGhvdXQgYSBmdWxsIGNhdmUgcGFzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGlmIChzbG9wZSA8IDIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZGlyczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBkaXJzKSB7XG4gICAgICAgIGNvbnN0IG54ID0gbHggKyBkeCwgbnogPSBseiArIGR6O1xuICAgICAgICBpZiAobnggPCAwIHx8IG56IDwgMCB8fCBueCA+PSBDSFVOS19TSVpFIHx8IG56ID49IENIVU5LX1NJWkUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBuaCA9IGJhc2VIWyhueiArIFApICogUFcgKyAobnggKyBQKV07XG4gICAgICAgIGlmIChoIC0gbmggPCAyKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGhhc2gzaShseCwgbHosIGR4ICogMyArIGR6ICogNywgc2VlZCArIDE1MCkgPCAwLjU1KSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgeSA9IGggLSAyO1xuICAgICAgICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gaCkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobngsIHlUb0luZGV4KHkpLCBueik7XG4gICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuU1RPTkU7XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZWNvbXB1dGUgdGhlIGNvbHVtbiBjYWNoZSBhZnRlciBsZWRnZXMvY2F2ZXMuIFRoZSBleHBvc2VkIHRvcCBtYXRlcmlhbFxuICAvLyBtdXN0IGNvbWUgZnJvbSB0aGUgYWN0dWFsIHRvcCBzb2xpZCB2b3hlbCwgbm90IHRoZSBwcmUtY2FydmUgZ3Vlc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgbGV0IHRvcE1hdDogbnVtYmVyID0gdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICBjb25zdCBtID0gZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgfVxuICAgICAgaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0b3BNYXQ7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgY3gsIGN6LCBzZWVkLCB2ZXJzaW9uLCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpciB9O1xufVxuXG4vKipcbiAqIEluc3RhbGwgYmFzZSBjb250ZW50cyBhcyBhIHJlc2lkZW50IGNodW5rOiBhcHBseSBkdXJhYmxlIGVkaXRzLCB1cGRhdGVcbiAqIHN0YXRzLCBhbmQgcnVuIGRldGVybWluaXN0aWMgZW50aXR5IGdlbmVyYXRpb24uIE1haW4tdGhyZWFkIG9ubHk7IHRoaXMgaXNcbiAqIHRoZSBzaW5nbGUgd3JpdGVyIG9mIFdvcmxkLiBSZXR1cm5zIHRoZSBhbHJlYWR5LXJlc2lkZW50IGNodW5rIGlmIG9uZSBleGlzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsQmFzZUNodW5rKHdvcmxkOiBXb3JsZCwgYmFzZTogQmFzZUNodW5rLCBnZW5lcmF0aW9uTXMgPSAwKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoYmFzZS5zZWVkICE9PSB3b3JsZC5zZWVkIHx8IGJhc2UudmVyc2lvbiAhPT0gd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2Jhc2UgY2h1bmsgYmVsb25ncyB0byBhIGRpZmZlcmVudCB3b3JsZCBjb25maWd1cmF0aW9uJyk7XG4gIH1cbiAgY29uc3QgeyBjeCwgY3osIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyIH0gPSBiYXNlO1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICBjb25zdCBjaHVuazogVm94ZWxDaHVuayA9IHtcbiAgICBjeCwgY3osIGtleSwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIsXG4gICAgZGlydHk6IHRydWUsXG4gICAgZ2VuZXJhdGVkQXQ6IHBlcmZvcm1hbmNlLm5vdygpLFxuICB9O1xuXG4gIC8vIEFwcGx5IGR1cmFibGUgZWRpdHMgYWZ0ZXIgYmFzZSBnZW5lcmF0aW9uLlxuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICBpZiAoZWRpdHMpIHtcbiAgICBmb3IgKGNvbnN0IFtpZHgsIG1dIG9mIGVkaXRzKSB7XG4gICAgICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICAgIH1cbiAgICAvLyBSZWNvbXB1dGUgdGhlIGNhY2hlIGZvciBlZGl0ZWQgY2h1bmtzLlxuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIGx4LCBseik7XG4gICAgfVxuICB9XG4gIC8vIE5vbi1haXIgY291bnRzIGFyZSBkZXJpdmVkIHJlbmRlcmVyIHN0YXRpc3RpY3MsIG5vdCBkdXJhYmxlIHdvcmxkIHN0YXRlLlxuICAvLyBFZGl0ZWQgYmFzZSBhaXIgbWF5IGJlY29tZSBzb2xpZCAoYW5kIHZpY2UgdmVyc2EpIGR1cmluZyByZXN0b3JhdGlvbi5cbiAgbGV0IGVkaXRlZE5vbkFpciA9IDA7XG4gIGZvciAoY29uc3QgbWF0ZXJpYWwgb2YgY2h1bmsuZGF0YSkgaWYgKG1hdGVyaWFsICE9PSBNQVQuQUlSKSBlZGl0ZWROb25BaXIrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IGVkaXRlZE5vbkFpciAtIG5vbkFpcjtcblxuICB3b3JsZC5jaHVua3Muc2V0KGtleSwgY2h1bmspO1xuICB3b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IG5vbkFpcjtcbiAgd29ybGQuc3RhdHMuZ2VuZXJhdGlvbk1zICs9IGdlbmVyYXRpb25NcztcbiAgd29ybGQuZGlydHkuYWRkKGtleSk7XG5cbiAgZ2VuZXJhdGVFbnRpdGllcyh3b3JsZCwgY2h1bmspO1xuICByZXR1cm4gY2h1bms7XG59XG5cbi8qKiBBIGJhc2UtdGVycmFpbiBjYWNoZSBzaGFyZWQgYnkgZWRpdGVkIGFuZCB1bmVkaXRlZCByZWdlbmVyYXRpb24uIE5hdHVyYWxcbiAqIHNjZW5lcnkgbmV2ZXIgZGVwZW5kcyBvbiBsYXRlciB2b3hlbCBlZGl0czsgdGhpcyBhbHNvIGxldHMgYSBzbmFwc2hvdCByZXN0b3JlXG4gKiBhIGhhcnZlc3RlZCBjaHVuayB3aXRob3V0IG1hdGVyaWFsaXppbmcgdW5yZWxhdGVkIG5laWdoYm91cmluZyBjaHVua3MuICovXG5jb25zdCBiYXNlQ29sdW1uQ2FjaGUgPSBuZXcgV2Vha01hcDxXb3JsZCwgTWFwPHN0cmluZywgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXkgfT4+KCk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQmFzZUNvbHVtbnMgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7IH1cblxuLyoqIEJhc2UgKHByZS1jYXJ2ZSwgcHJlLWVkaXQpIGNvbHVtbiBoZWlnaHRzL21hdGVyaWFscyB1c2VkIGZvciBlbnRpdHkgcGxhY2VtZW50LiBQdXJlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVCYXNlQ29sdW1ucyhzZWVkOiBudW1iZXIsIHZlcnNpb246IG51bWJlciwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IEJhc2VDb2x1bW5zIHtcbiAgY29uc3QgY29sdW1ucyA9IHsgaGVpZ2h0czogbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSksIHRvcE1hdGVyaWFsczogbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSkgfTtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseCwgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSGVpZ2h0QXQoc2VlZCwgdmVyc2lvbiwgeCwgeik7XG4gICAgICBjb25zdCBzbG9wZSA9IHZlcnNpb24gPj0gR0VORVJBVE9SX1YyXG4gICAgICAgID8gdmVyc2lvbmVkU2xvcGUoc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCkgOiBzbG9wZUF0KHNlZWQsIHgsIHosIGgpO1xuICAgICAgY29uc3QgaW5kZXggPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbHVtbnMuaGVpZ2h0c1tpbmRleF0gPSBjbGFtcChoIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgY29sdW1ucy50b3BNYXRlcmlhbHNbaW5kZXhdID0gdmVyc2lvbiA+PSBHRU5FUkFUT1JfVjJcbiAgICAgICAgPyBiYXNlVG9wTWF0ZXJpYWxGb3Ioc2VlZCwgdmVyc2lvbiwgeCwgeiwgaCwgc2xvcGUpXG4gICAgICAgIDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG4vKiogUHJvdmlkZSBwcmVjb21wdXRlZCBiYXNlIGNvbHVtbnMgKGZvciBleGFtcGxlIGZyb20gYSB3b3JrZXIpIGJlZm9yZSBpbnN0YWxsaW5nIGEgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gc2VlZEJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcsIGNvbHVtbnM6IEJhc2VDb2x1bW5zKTogdm9pZCB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgaWYgKCFjYWNoZS5oYXMoa2V5KSkgY2FjaGUuc2V0KGtleSwgY29sdW1ucyk7XG59XG5cbmZ1bmN0aW9uIGJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiBCYXNlQ29sdW1ucyB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgY29uc3QgY2FjaGVkID0gY2FjaGUuZ2V0KGNodW5rLmtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG4gIGNvbnN0IGNvbHVtbnMgPSBjb21wdXRlQmFzZUNvbHVtbnMod29ybGQuc2VlZCwgd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sIGNodW5rLmN4LCBjaHVuay5jeik7XG4gIGNhY2hlLnNldChjaHVuay5rZXksIGNvbHVtbnMpO1xuICByZXR1cm4gY29sdW1ucztcbn1cblxuLy8gLS0tLS0tLS0tLSBkZXJpdmVkIGNoYW5nZSB0cmFja2luZyAobm90IGF1dGhvcml0YXRpdmUgc3RhdGUpIC0tLS0tLS0tLS1cbi8vIFJlbmRlcmVycyBuZWVkIHRvIGtub3cgd2hlbiB0aGUgZWRpdCBvdmVybGF5IGNoYW5nZWQgd2l0aG91dCB3YWxraW5nIGV2ZXJ5XG4vLyBlZGl0IGVhY2ggZnJhbWUuIFRoZSBjb3VudGVyIGxpdmVzIG91dHNpZGUgV29ybGQgc28gaXQgbmV2ZXIgZW50ZXJzIGFcbi8vIHNuYXBzaG90IG9yIGNhbm9uaWNhbCBoYXNoLlxuY29uc3QgZWRpdFZlcnNpb25zID0gbmV3IFdlYWtNYXA8V29ybGQsIG51bWJlcj4oKTtcblxuLyoqIE1vbm90b25pYyBjb3VudCBvZiBlZGl0LW92ZXJsYXkgY2hhbmdlcyBmb3IgdGhpcyBXb3JsZCBvYmplY3QuICovXG5leHBvcnQgZnVuY3Rpb24gZWRpdFZlcnNpb24od29ybGQ6IFdvcmxkKTogbnVtYmVyIHtcbiAgcmV0dXJuIGVkaXRWZXJzaW9ucy5nZXQod29ybGQpID8/IDA7XG59XG5cbi8qKiBDYWxsIGFmdGVyIHJlcGxhY2luZyBvciBidWxrLWNoYW5naW5nIGB3b3JsZC5lZGl0c2Agb3V0c2lkZSBzZXRWb3hlbC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBlZGl0VmVyc2lvbnMuc2V0KHdvcmxkLCBlZGl0VmVyc2lvbih3b3JsZCkgKyAxKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBub24tZ2VuZXJhdGluZyBxdWVyaWVzIC0tLS0tLS0tLS1cbi8vIE1vdmluZyBwcmVzZW50YXRpb24gKGNoYXJhY3RlcnMsIGFuaW1hbHMsIGNhbWVyYSkgbXVzdCBuZXZlciB0cmlnZ2VyIGNodW5rXG4vLyBnZW5lcmF0aW9uIGFzIGEgc2lkZSBlZmZlY3Qgb2YgYXNraW5nIGFib3V0IHRlcnJhaW4uIFRoZXNlIHJldHVybiBudWxsIHdoZW5cbi8vIHRoZSBjb2x1bW4ncyBjaHVuayBpcyBub3QgcmVzaWRlbnQuXG5cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudENodW5rQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB3b3JsZC5jaHVua3MuZ2V0KGNodW5rS2V5KHdvcmxkVG9DaHVua1goeCksIHdvcmxkVG9DaHVua1ooeikpKSA/PyBudWxsO1xufVxuXG4vKiogTGlrZSBzdXJmYWNlQXQsIGJ1dCBudWxsIGluc3RlYWQgb2YgZ2VuZXJhdGluZyBhIG1pc3NpbmcgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzaWRlbnRTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB8IG51bGwge1xuICBjb25zdCBjaHVuayA9IHJlc2lkZW50Q2h1bmtBdCh3b3JsZCwgeCwgeik7XG4gIGlmICghY2h1bmspIHJldHVybiBudWxsO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG4vKiogTGlrZSBnZXRWb3hlbCwgYnV0IG51bGwgaW5zdGVhZCBvZiBnZW5lcmF0aW5nIGEgbWlzc2luZyBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpZGVudFZveGVsQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQgfCBudWxsIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGNodW5rID0gcmVzaWRlbnRDaHVua0F0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV2aWN0Q2h1bmsod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5jaHVua3MuZGVsZXRlKGtleSk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0V2aWN0ZWQrKztcbiAgLy8gQ2h1bmsgYnl0ZXMgYW5kIGNvbHVtbiBjYWNoZXMgYXJlIHJlZ2VuZXJhdGVkIG9uIGRlbWFuZC4gRW50aXRpZXMgcmVtYWluXG4gIC8vIGF1dGhvcml0YXRpdmU6IGV2aWN0aW9uIG11c3Qgbm90IGZvcmdldCB0aGVpciBwZXJzaXN0ZW50IHN0YXRlLlxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBxdWVyaWVzIC8gZWRpdHMgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGdldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgbTogTWF0SWQpOiBib29sZWFuIHtcbiAgaWYgKHkgPCBZX01JTiB8fCB5ID49IFlfTUFYKSByZXR1cm4gZmFsc2U7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpO1xuICBjb25zdCBwcmV2aW91c0VkaXQgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk/LmdldChpZHgpO1xuICAvLyBBIGNodW5rIGV2aWN0ZWQgYWZ0ZXIgYW4gZWFybGllciBlZGl0IGNhbiByZWdlbmVyYXRlIHdpdGggdGhhdCBkdXJhYmxlXG4gIC8vIG1hdGVyaWFsIGFscmVhZHkgYXBwbGllZC4gRHJvcHBpbmcgdGhlIGVkaXQgaGVyZSB3b3VsZCBtYWtlIGl0IGRpc2FwcGVhclxuICAvLyBvbiB0aGUgbmV4dCBldmljdGlvbi9yZXN0b3JhdGlvbiwgZXZlbiB0aG91Z2ggdGhlIGN1cnJlbnQgd3JpdGUgbm8tb3BzLlxuICBpZiAocHJldmlvdXNFZGl0ID09PSBtKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBmYWxzZTtcbiAgbGV0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rLmtleSk7XG4gIGlmICghZWRpdHMpIHsgZWRpdHMgPSBuZXcgTWFwKCk7IHdvcmxkLmVkaXRzLnNldChjaHVuay5rZXksIGVkaXRzKTsgfVxuICAvLyBBbiBpZGVtcG90ZW50IHdyaXRlIG11c3Qgc3RpbGwgcmVzdG9yZSBhIGR1cmFibGUgZGVsdGEgZGlzY2FyZGVkIGJ5IGFuXG4gIC8vIG9sZGVyIHNuYXBzaG90IG9yIGRlbHRhIGRlY29kZXIuIEl0IGlzIG5vdCBhIG5ldyBhdXRob3JpdGF0aXZlIHJldmlzaW9uLlxuICBpZiAoY2h1bmsuZGF0YVtpZHhdID09PSBtKSB7XG4gICAgaWYgKCFlZGl0cy5oYXMoaWR4KSkgZWRpdHMuc2V0KGlkeCwgbSk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gIGVkaXRzLnNldChpZHgsIG0pO1xuICBtYXJrRWRpdHNDaGFuZ2VkKHdvcmxkKTtcbiAgY2h1bmsuZGlydHkgPSB0cnVlO1xuICB3b3JsZC5kaXJ0eS5hZGQoY2h1bmsua2V5KTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIHdvcmxkVG9Mb2NhbFgoeCksIHdvcmxkVG9Mb2NhbFooeikpO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bms6IFZveGVsQ2h1bmssIGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgIGlmIChpc1NvbGlkKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0pKSB7IHRvcFNvbGlkID0geTsgYnJlYWs7IH1cbiAgfVxuICBjaHVuay5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICBjb25zdCB0bSA9IGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gIGlmICh0b3BTb2xpZCA+PSBZX01JTikge1xuICAgIGNvbnN0IG0gPSBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHRvcFNvbGlkKSwgbHopXTtcbiAgICBpZiAobSAhPT0gTUFULldBVEVSKSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gbTtcbiAgfSBlbHNlIHtcbiAgICBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG07XG4gIH1cbn1cblxuLyoqXG4gKiBUaGUgeSBjb29yZGluYXRlIG9mIHRoZSBleHBvc2VkIHRvcCBmYWNlIG9mIHRoZSBzb2xpZCBjb2x1bW4gYXQgeC96LlxuICogQSBzb2xpZCB2b3hlbCBhdCB5IG9jY3VwaWVzIFt5LCB5KzEpLCBzbyB0aGUgd2Fsa2FibGUgc3VyZmFjZSBpcyB0b3BTb2xpZCsxLlxuICogVGhpcyBpcyBhIGRlcml2ZWQgcXVlcnk7IHRoZSBhdXRob3JpdGF0aXZlIHN0YXRlIHJlbWFpbnMgdGhlIHZveGVsIHZvbHVtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIFlfTUlOO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIFlfTUlOO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay50b3BNYXRlcmlhbHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhlaWdodEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uIDwgR0VORVJBVE9SX1YyKSB7XG4gICAgY29uc3QgaCA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gICAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgLSBoIDogMDtcbiAgfVxuICByZXR1cm4gd2F0ZXJTdXJmYWNlQXQod29ybGQsIHgsIHopIC0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuLyoqXG4gKiBUb3Agb2YgdGhlIHdhdGVyIGNvbHVtbiBzdGFuZGluZyBvbiB0aGUgc29saWQgc3VyZmFjZSAoZXF1YWwgdG8gdGhlIHN1cmZhY2VcbiAqIHdoZW4gZHJ5KS4gUmVhZHMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWxzLCBzbyBlZGl0cyBhbmQgZHVnIHBpdHMgYXJlIGV4YWN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJTdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgd2hpbGUgKHkgPCBZX01BWCAmJiBnZXRWb3hlbCh3b3JsZCwgeCwgeSwgeikgPT09IE1BVC5XQVRFUikgeSsrO1xuICByZXR1cm4geTtcbn1cblxuLy8gLS0tLS0tLS0tLSBlbnRpdGllcyAtLS0tLS0tLS0tXG5mdW5jdGlvbiBhZGRFbnRpdHkod29ybGQ6IFdvcmxkLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLmhhcyhlLmlkKSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgcmV0dXJuO1xuICB3b3JsZC5lbnRpdGllcy5zZXQoZS5pZCwgZSk7XG4gIGxldCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBsaXN0KTsgfVxuICBsaXN0LnB1c2goZS5pZCk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgLy8gR2VuZXJhdGlvbiBpcyBkZXRlcm1pbmlzdGljIGFuZCBhZHZhbmNlcyBubyBwbGF5ZXItY29tbWFuZCBwcmVjb25kaXRpb24uXG4gIC8vIEF1dGhvcmVkIHNjYWZmb2xkaW5nIG1heSB0cmFuc2llbnRseSBjaGFuZ2UgaXQ7IHRoZSBzbmFwc2hvdCByZXN0b3JlcyB0aGVcbiAgLy8gc2F2ZWQgcmV2aXNpb24gYWZ0ZXIgcGxhY2luZyB0aGF0IHNjYWZmb2xkaW5nLlxufVxuXG4vKipcbiAqIFJlbW92ZSBhbiBlbnRpdHkgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB3b3JsZC4gVXNlZCB3aGVuIGEgc2l0ZSBpcyBjbGVhcmVkOlxuICogdGhlIHJlc291cmNlIHlpZWxkIGlzIGFjY291bnRlZCBmb3IgYnkgdGhlIGNhbGxlciwgYW5kIHRoZSBlbnRpdHkgbXVzdCBzdG9wXG4gKiBleGlzdGluZyBmb3IgY29sbGlzaW9uLCBvYnN0cnVjdGlvbiBhbmQgcGVyc2lzdGVuY2UsIG5vdCBqdXN0IGJlIGhpZGRlbiBieVxuICogdGhlIHJlbmRlcmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gIGNvbnN0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAobGlzdCkge1xuICAgIGNvbnN0IGkgPSBsaXN0LmluZGV4T2YoaWQpO1xuICAgIGlmIChpID49IDApIGxpc3Quc3BsaWNlKGksIDEpO1xuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGlkKTtcbiAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZW50aXR5SWQoY2h1bms6IHN0cmluZywgaTogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBlOiR7Y2h1bmt9OiR7aX1gO1xufVxuXG4vKipcbiAqIFB1cmUgZm9yZXN0LWRlbnNpdHkgZmllbGQgdXNlZCBieSBlbnRpdHkgZ2VuZXJhdGlvbi4gRXhwb3J0ZWQgcmVhZC1vbmx5IGZvclxuICogcmVuZGVyIGRlY29yYXRpb24gKHJlbmRlci9ncm91bmQtY292ZXIudHMpOyBjaGFuZ2luZyBpdCBjaGFuZ2VzIHdvcmxkcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcmVzdFNjb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGVhc3QgPSBNYXRoLmV4cCgtKCgod3ggLSAyMjApIC8gMjYwKSAqKiAyICsgKCh3eiArIDExMCkgLyAyMjApICoqIDIpKTtcbiAgY29uc3Qgbm9ydGggPSBNYXRoLmV4cCgtKCgod3ggLSAyMCkgLyAzMDApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDE5MCkgKiogMikpO1xuICBjb25zdCB3ZXN0ID0gTWF0aC5leHAoLSgoKHd4ICsgMzQwKSAvIDIwMCkgKiogMiArICgod3ogLSAxMjApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IHNvdXRoID0gTWF0aC5leHAoLSgoKHd4IC0gMTIwKSAvIDI0MCkgKiogMiArICgod3ogLSAzMzApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IG1vaXN0dXJlID0gZmJtMih3eCAvIDI2MCwgd3ogLyAyNjAsIHNlZWQgKyAyMDEsIDQpO1xuICBjb25zdCB2YWxsZXkgPSBNYXRoLmV4cCgtKCh3eCAvIDE0MCkgKiogMiArICh3eiAvIDEwNSkgKiogMikpO1xuICByZXR1cm4gTWF0aC5tYXgoZWFzdCwgbm9ydGggKiAwLjkyLCB3ZXN0ICogMC44MCwgc291dGggKiAwLjc4KSAqIDAuODJcbiAgICArIG1vaXN0dXJlICogMC4zOCAtIDAuMjIgLSB2YWxsZXkgKiAwLjM0O1xufVxuXG4vKiogUHVyZSByb2NraW5lc3MgZmllbGQgdXNlZCBieSBlbnRpdHkgZ2VuZXJhdGlvbiAoc2FtZSBjb250cmFjdCBhcyBmb3Jlc3RTY29yZSkuICovXG5leHBvcnQgZnVuY3Rpb24gcm9ja1Njb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IG1vdW50YWluID0gZmJtMih3eCAvIDMzMCwgd3ogLyAzMzAsIHNlZWQgKyAyMDIsIDMpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDE0MCwgd3ogLyAxNDAsIHNlZWQgKyAyMDMsIDMpIC0gMSk7XG4gIHJldHVybiBtb3VudGFpbiAqIDAuNTUgKyByaWRnZSAqIDAuNDU7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRW50aXRpZXMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHZvaWQge1xuICBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkLCBjaHVuay5jeCwgY2h1bmsuY3opO1xufVxuXG4vKiogQGludGVybmFsIFJlcGxheXMgZGV0ZXJtaW5pc3RpYyBnZW5lcmF0aW9uIGZvciBzbmFwc2hvdCBlbnRpdHkgZGVsdGFzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGlmICh3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGtleSkpIHJldHVybjtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuO1xuXG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKGhhc2gyaShjaHVuay5jeCwgY2h1bmsuY3osIHdvcmxkLnNlZWQgKyA5MDApICogNDI5NDk2NzI5NikgPj4+IDApO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgY29uc3QgY29sdW1ucyA9IGJhc2VDb2x1bW5zKHdvcmxkLCBjaHVuayk7XG4gIGxldCBuID0gMDtcbiAgbGV0IG5hdHVyYWxUcmVlcyA9IDA7XG4gIGxldCBuYXR1cmFsUGlua1RyZWVzID0gMDtcblxuICBjb25zdCBsb2NhbFN1cmZhY2UgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gKyBZX01JTjtcbiAgfTtcbiAgY29uc3QgbG9jYWxUb3AgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IE1hdElkID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIGFzIE1hdElkO1xuICB9O1xuICBjb25zdCBsb2NhbFNsb3BlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICByZXR1cm4gTWF0aC5tYXgoXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICk7XG4gIH07XG5cbiAgLy8gQSBqaXR0ZXJlZCA4IG0gbGF0dGljZSBnaXZlcyBjb2hlcmVudCBtYXNzZXMgYW5kIGF2b2lkcyBwZXItZnJhbWUgc2NhdHRlci5cbiAgZm9yIChsZXQgZ3ogPSAwOyBneiA8IENIVU5LX1NJWkU7IGd6ICs9IDgpIHtcbiAgICBmb3IgKGxldCBneCA9IDA7IGd4IDwgQ0hVTktfU0laRTsgZ3ggKz0gOCkge1xuICAgICAgY29uc3QgbHggPSBjbGFtcChNYXRoLmZsb29yKGd4ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3QgbHogPSBjbGFtcChNYXRoLmZsb29yKGd6ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAxKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHNsb3BlID0gbG9jYWxTbG9wZShseCwgbHopO1xuICAgICAgY29uc3QgdG9wID0gbG9jYWxUb3AobHgsIGx6KTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikgY29udGludWU7XG4gICAgICBjb25zdCBmb3Jlc3QgPSBmb3Jlc3RTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9ja3kgPSByb2NrU2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvbGwgPSBybmQoKTtcblxuICAgICAgY29uc3QgdHJlZUNoYW5jZSA9IGZvcmVzdCA+IDAuNTAgPyAwLjcyIDogZm9yZXN0ID4gMC4zMCA/IDAuMjUgOiAwLjA1O1xuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDIgJiYgcm9sbCA8IHRyZWVDaGFuY2UpIHtcbiAgICAgICAgLy8gVGhlIGNhcCBpcyBhIGRldGVybWluaXN0aWMgbmF0dXJhbC1nZW5lcmF0aW9uIHByb3BlcnR5LiBJdCBjYW5ub3RcbiAgICAgICAgLy8gZGVwZW5kIG9uIHdoaWNoIGNodW5rcyBhIHJlbmRlcmVyIGxvYWRlZCBiZWZvcmUgdGhpcyBvbmUuXG4gICAgICAgIGxldCBraW5kOiBFbnRpdHlLaW5kO1xuICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICBjb25zdCBzcGVjaWVzUm9sbCA9IHJuZCgpO1xuICAgICAgICBpZiAoc3BlY2llc1JvbGwgPCAwLjEyKSB7XG4gICAgICAgICAgaWYgKChuYXR1cmFsUGlua1RyZWVzICsgMSkgPiAwLjI1ICogKG5hdHVyYWxUcmVlcyArIDEpKSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rT3ZlcmZsb3crKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfYmxvc3NvbSc7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDIpO1xuICAgICAgICAgICAgbmF0dXJhbFBpbmtUcmVlcysrO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC40MCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3NwaXJlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC43NCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3RhYmxlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgIH1cbiAgICAgICAgbmF0dXJhbFRyZWVzKys7XG4gICAgICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjg4ICsgcm5kKCkgKiAwLjI0LCB2YXJpYW50LFxuICAgICAgICAgIHJlc291cmNlOiAnd29vZCcsIHJlbWFpbmluZzogMTIsIHlpZWxkUGVySGFydmVzdDogNCxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgcm9ja3kgPiAwLjQ2ICYmIHJvbGwgPCAwLjM4KSB7XG4gICAgICAgIC8vIENvbnN1bWUgdGhlIHJldGlyZWQgc3RvbmUgZm9ybSdzIHJhbmRvbSBkcmF3cyBhbmQgYWxsb2NhdGUgaXRzIG9sZFxuICAgICAgICAvLyBzZXF1ZW5jZSBJRCwgYnV0IGRvIG5vdCBpbnNlcnQgYW4gZW50aXR5LiBMYXRlciBuYXR1cmFsIHBsYWNlbWVudHNcbiAgICAgICAgLy8gdGhlcmVmb3JlIHJlbWFpbiBieXRlLWZvci1ieXRlIGNvbXBhdGlibGUgd2l0aCByZWNvcmRlZCBzYXZlcy5cbiAgICAgICAgY29uc3Qgc2l6ZVJvbGwgPSBybmQoKTtcbiAgICAgICAgY29uc3Qga2luZDogRW50aXR5S2luZCA9IHNpemVSb2xsIDwgMC41NSA/ICdzdHlsX3JvY2tfc21hbGwnXG4gICAgICAgICAgOiBzaXplUm9sbCA8IDAuOTAgPyAnc3R5bF9yb2NrX21lZGl1bScgOiAnc3R5bF9yb2NrX2xhcmdlJztcbiAgICAgICAgY29uc3QgaWQgPSBlbnRpdHlJZChjaHVuay5rZXksIG4rKyk7XG4gICAgICAgIGNvbnN0IHJlY29yZCA9IHtcbiAgICAgICAgICBpZCwga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJlc291cmNlOiAnc3RvbmUnIGFzIGNvbnN0LFxuICAgICAgICAgIHJlbWFpbmluZzoga2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyA0IDoga2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gOCA6IDEyLFxuICAgICAgICAgIHlpZWxkUGVySGFydmVzdDogMywgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gT25seSBlbnRpdGllcyB0aGF0IGV4aXN0ZWQgaW4gYW4gYWNjZXB0ZWQgb2xkIHNhdmUgZ2V0IHRvbWJzdG9uZXMsXG4gICAgICAgIC8vIGR1cmluZyBleHBsaWNpdCBtaWdyYXRpb24uIE9yZGluYXJ5IGdlbmVyYXRpb24gbXVzdCByZXN0b3JlIGV4YWN0bHkuXG4gICAgICAgIGlmIChpc1N0b25lUmVwbGF5KHdvcmxkKSkgYWRkRW50aXR5KHdvcmxkLCByZWNvcmQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSAmJiByb2NreSA+IDAuNTggJiYgcm9sbCA8IDAuMTgpIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9vcmUnLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMiksXG4gICAgICAgICAgcmVzb3VyY2U6ICdvcmUnLCByZW1haW5pbmc6IDgsIHlpZWxkUGVySGFydmVzdDogMixcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMSAmJiByb2xsIDwgMC4zMCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX3NocnViJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjggKyBybmQoKSAqIDAuNCwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICAgIHJlc291cmNlOiAnZmliZXInLCByZW1haW5pbmc6IDQsIHlpZWxkUGVySGFydmVzdDogMSxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkQXV0aG9yZWRFbnRpdHkod29ybGQ6IFdvcmxkLCBraW5kOiBFbnRpdHlLaW5kLCB4OiBudW1iZXIsIHo6IG51bWJlciwgdmFyaWFudDogbnVtYmVyLCByb3Q6IG51bWJlciwgc2NhbGU6IG51bWJlciwgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGwsIHJlbWFpbmluZzogbnVtYmVyLCB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHkgPD0gU0VBX0xFVkVMKSByZXR1cm47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAvLyBBIGhlcm8gYXNzZXQgb3ducyBpdHMgc3BvdDogY2xlYXIgYW55IGdlbmVyYXRlZCBlbnRpdHkgdGhhdCB3b3VsZCBvdmVybGFwXG4gIC8vIGl0LCByYXRoZXIgdGhhbiBzaWxlbnRseSBkcm9wcGluZyB0aGUgYXV0aG9yZWQgY29tcG9zaXRpb24uXG4gIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXTtcbiAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChraW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHJldHVybjtcbiAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoZSAmJiBNYXRoLmh5cG90KGUueCAtIHgsIGUueiAtIHopIDwgMi42KSB7XG4gICAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICAgICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICAgICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gICAgfVxuICB9XG4gIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSkpO1xuICAvLyBBdXRob3JlZCBjb21wb3NpdGlvbiBpcyBkdXJhYmxlIHN0YXRlOiBpdCBjYW4gY2xlYXIgb3ZlcmxhcHBpbmcgbmF0dXJhbFxuICAvLyBlbnRpdGllcywgc28gc2F2ZSB0aGUgY29tcGxldGUgYWZmZWN0ZWQgY2h1bmsgcmF0aGVyIHRoYW4gb25seSBpdHMgaGVyb2VzLlxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuXG4gIGNvbnN0IGlkID0gYGhlcm86JHtraW5kfToke01hdGgucm91bmQoeCl9OiR7TWF0aC5yb3VuZCh6KX1gO1xuICBjb25zdCBiZWZvcmUgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICBjb25zdCBlbnRpdHk6IEVudGl0eSA9IHtcbiAgICBpZCwga2luZCwgY2h1bms6IGtleSwgeDogeCArIDAuNSwgeSwgejogeiArIDAuNSxcbiAgICByb3QsIHNjYWxlLCB2YXJpYW50LCByZXNvdXJjZSwgcmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiB0cnVlLFxuICB9O1xuICBhZGRFbnRpdHkod29ybGQsIGVudGl0eSk7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5zaXplID4gYmVmb3JlICYmIGtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHtcbiAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgIGlmIChraW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBpZiAod29ybGQuYXV0aG9yZWRQbGFjZWQpIHJldHVybjtcbiAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSB0cnVlO1xuXG4gIGNvbnN0IHNpdGVzOiBBcnJheTx7IGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJzsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJvdDogbnVtYmVyIH0+ID0gW1xuICAgIHsga2luZDogJ3dheXN0b25lJywgeDogLTEwLCB6OiAtMTQsIHJvdDogMCB9LFxuICAgIHsga2luZDogJ21hcmtlcicsIHg6IC0zMiwgejogLTgsIHJvdDogTWF0aC5QSSAvIDIgfSxcbiAgXTtcbiAgZm9yIChjb25zdCBzIG9mIHNpdGVzKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgcy54LCBzLnopO1xuICAgIGlmICh5IDw9IFNFQV9MRVZFTCkgY29udGludWU7XG4gICAgd29ybGQuc2l0ZXMucHVzaCh7XG4gICAgICBpZDogYHNpdGU6JHtzLmtpbmR9YCxcbiAgICAgIGtpbmQ6IHMua2luZCxcbiAgICAgIHg6IHMueCArIDAuNSwgeSwgejogcy56ICsgMC41LFxuICAgICAgcm90OiBzLnJvdCxcbiAgICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gQSBoZXJvIGdyb3ZlIGNvbXBvc2VkIGluIHRoZSBkZWZhdWx0IGNhbWVyYSdzIHZpZXcgZGlyZWN0aW9uLiBUaGVzZSBhcmVcbiAgLy8gU3R5bCBuYXR1cmFsIGFzc2V0cyAoQVMtMDAxIHYyKSwgbm90IE5veGVsIGFyY2hpdGVjdHVyZTsgdGhlIE5veGVsXG4gIC8vIHdheXN0b25lL21hcmtlciBhYm92ZSByZW1haW4gdGhlIGh1bWFuLW1hZGUgbGFuZG1hcmtzLlxuICBjb25zdCBncm92ZTogQXJyYXk8W0VudGl0eUtpbmQsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXT4gPSBbXG4gICAgWydzdHlsX3RyZWVfc3BpcmUnLCAtMjIsIC0yNiwgMCwgMS4wMCwgMF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtMzQsIC0xOCwgMSwgMC45NSwgTWF0aC5QSSAvIDEyXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTE2LCAtMzQsIDIsIDEuMDAsIE1hdGguUEkgLyA2XSxcbiAgICBbJ3N0eWxfdHJlZV9ibG9zc29tJywgLTI4LCAtMzgsIDAsIDAuOTAsIE1hdGguUEkgLyA0XSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC00MCwgLTMwLCAyLCAxLjA1LCBNYXRoLlBJIC8gM10sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xMiwgLTI0LCAwLCAwLjkwLCBNYXRoLlBJIC8gMi40XSxcbiAgXTtcbiAgZm9yIChjb25zdCBba2luZCwgeCwgeiwgdmFyaWFudCwgc2NhbGUsIHJvdF0gb2YgZ3JvdmUpIHtcbiAgICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwga2luZCwgeCwgeiwgdmFyaWFudCwgcm90LCBzY2FsZSwgJ3dvb2QnLCAxMiwgNCk7XG4gIH1cbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3JvY2tfbWVkaXVtJywgLTYsIC0xMCwgMCwgMCwgMS4wLCAnc3RvbmUnLCA4LCAzKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3NocnViJywgLTE0LCAtOCwgMSwgTWF0aC5QSSAvIDEyLCAxLjEsICdmaWJlcicsIDQsIDEpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfY2Fpcm4nLCAtMjAsIC02LCAwLCAwLCAxLjAsICdzdG9uZScsIDYsIDIpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfb3JlJywgLTM4LCAtNDIsIDAsIE1hdGguUEkgLyA0LCAxLjEsICdvcmUnLCA4LCAyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5lYXJlc3RIYXJ2ZXN0YWJsZShcbiAgd29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgcmFkaXVzOiBudW1iZXIsIHJlc291cmNlPzogUmVzb3VyY2VUeXBlLFxuKTogRW50aXR5IHwgbnVsbCB7XG4gIGxldCBiZXN0OiBFbnRpdHkgfCBudWxsID0gbnVsbDtcbiAgbGV0IGJlc3REID0gcmFkaXVzICogcmFkaXVzO1xuICBmb3IgKGNvbnN0IGUgb2Ygd29ybGQuZW50aXRpZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpXG4gICAgICB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSBjb250aW51ZTtcbiAgICBpZiAocmVzb3VyY2UgJiYgZS5yZXNvdXJjZSAhPT0gcmVzb3VyY2UpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGQgPSAoZS54IC0geCkgKiogMiArIChlLnogLSB6KSAqKiAyO1xuICAgIGlmIChkIDwgYmVzdEQpIHsgYmVzdEQgPSBkOyBiZXN0ID0gZTsgfVxuICB9XG4gIHJldHVybiBiZXN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RSZXN1bHQgeyBlbnRpdHk6IEVudGl0eTsgcmVzb3VyY2U6IFJlc291cmNlVHlwZTsgYW1vdW50OiBudW1iZXI7IH1cblxuLyoqXG4gKiBTZXR0bGVtZW50IHJ1bGVzIHYyIChNMDEwKTogZ3Jvd3RoIHN0YWdlIHNldHMgdHJlZSB5aWVsZCBhbmQgZm9vdHByaW50LCBhbmRcbiAqIHZpbGxhZ2VycyBuYXZpZ2F0ZS4gQWN0aXZlIG9uY2UgdGhlIHdvcmxkJ3MgaG9tZXN0ZWFkIGlzIHZlcnNpb24gMiAoZm91bmRlZFxuICogb3IgdXBncmFkZWQgYnkgYSBqb3VybmFsZWQgY29tbWFuZCk7IGVhcmxpZXIgd29ybGRzIGtlZXAgbGVnYWN5IHJ1bGVzLCBzb1xuICogdGhlaXIgcmVwbGF5cyBhbmQgaGFzaGVzIGFyZSB1bmNoYW5nZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGFnZVJ1bGVzQWN0aXZlKHdvcmxkOiBXb3JsZCk6IGJvb2xlYW4ge1xuICByZXR1cm4gKHdvcmxkLmhvbWVzdGVhZD8udmVyc2lvbiA/PyAwKSA+PSAyO1xufVxuXG4vKipcbiAqIFVuZGVyIHN0YWdlIHJ1bGVzIGEgdHJlZSdzIGZpcnN0IGN1dCBzZXRzIGl0cyByZWNvcmQgdG8gdGhlIHN0YWdlJ3MgdGltYmVyXG4gKiAoYSBzYXBsaW5nIGhvbGRzIDIgd29vZCwgYW4gb2xkIHRyZWUgMTYpLiBJZGVtcG90ZW50IGFmdGVyIHRoZSBmaXJzdCBjdXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBseVN0YWdlVGltYmVyKHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICghc3RhZ2VSdWxlc0FjdGl2ZSh3b3JsZCkgfHwgZS5oYXJ2ZXN0ZWRPbmNlKSByZXR1cm47XG4gIGNvbnN0IHQgPSB0cmVlVGltYmVyKGUpO1xuICBpZiAoIXQpIHJldHVybjtcbiAgZS5yZW1haW5pbmcgPSB0LnRvdGFsO1xuICBlLnlpZWxkUGVySGFydmVzdCA9IHQuY3V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBIYXJ2ZXN0UmVzdWx0IHwgbnVsbCB7XG4gIGNvbnN0IGUgPSBsaXZlRW50aXR5KHdvcmxkLCBpZCk7XG4gIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSByZXR1cm4gbnVsbDtcbiAgLy8gQ2FwYWNpdHkgaXMgY2hlY2tlZCBhZ2FpbnN0IHRoZSBzdGFnZSB5aWVsZCwgdGhlbiB0aGUgcmVjb3JkIGNoYW5nZXMuXG4gIGlmIChzdGFnZVJ1bGVzQWN0aXZlKHdvcmxkKSAmJiAhZS5oYXJ2ZXN0ZWRPbmNlICYmIHRyZWVUaW1iZXIoZSkpIHtcbiAgICBjb25zdCB0ID0gdHJlZVRpbWJlcihlKSE7XG4gICAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIE1hdGgubWluKHQuY3V0LCB0LnRvdGFsKSA+IDEyMCkgcmV0dXJuIG51bGw7XG4gICAgYXBwbHlTdGFnZVRpbWJlcih3b3JsZCwgZSk7XG4gIH1cbiAgY29uc3QgYW1vdW50ID0gTWF0aC5taW4oZS55aWVsZFBlckhhcnZlc3QsIGUucmVtYWluaW5nKTtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIGFtb3VudCA+IDEyMCkgcmV0dXJuIG51bGw7XG4gIGUucmVtYWluaW5nIC09IGFtb3VudDtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgZS5oYXJ2ZXN0ZWRPbmNlID0gdHJ1ZTtcbiAgaWYgKGUucmVtYWluaW5nIDw9IDApIGUuaGFydmVzdGVkID0gdHJ1ZTtcbiAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgZW50aXR5OiBlLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbi8qKiBSZW1vdmUgZXZlcnkgcmV0aXJlZCBzb3VyY2UgYWZ0ZXIgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkuIFRoaXMgbWlncmF0aW9uXG4gKiBjcmVhdGVzIGRldGVybWluaXN0aWMgdG9tYnN0b25lcyBidXQgaXMgbm90IGEgcGxheWVyIGNvbW1hbmQgb3IgcmV2aXNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmV0aXJlU3RvbmVFbnRpdGllcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBlIG9mIFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0pIHtcbiAgICBpZiAoIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKSBjb250aW51ZTtcbiAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoZS5pZCk7XG4gICAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoZS5pZCk7XG4gICAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gICAgaWYgKCF3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGUuY2h1bmspKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtrZXksIGlkc10gb2Ygd29ybGQuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgYWN0aXZlID0gaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpO1xuICAgIGlmIChhY3RpdmUubGVuZ3RoID4gMCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhrZXkpKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgYWN0aXZlKTtcbiAgICBlbHNlIHdvcmxkLmVudGl0eUNodW5rcy5kZWxldGUoa2V5KTtcbiAgfVxuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGVyc2lzdGVuY2UgLyBhdXRob3JpdHkgYm91bmRhcnkgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1hbmlmZXN0IHtcbiAgc2NoZW1hOiAxO1xuICBzZWVkOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIHBhcmFtc0hhc2g6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZm52MWEodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGggPSAweDgxMWM5ZGM1O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBoID0gTWF0aC5pbXVsKGgsIDB4MDEwMDAxOTMpO1xuICB9XG4gIHJldHVybiAoaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZE1hbmlmZXN0KHdvcmxkOiBXb3JsZCk6IFdvcmxkTWFuaWZlc3Qge1xuICBjb25zdCBwID0gd29ybGQucGFyYW1zO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBzZWVkOiB3b3JsZC5zZWVkLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHAuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBzaXplOiBwLnNpemUsXG4gICAgY2h1bmtTaXplOiBwLmNodW5rU2l6ZSxcbiAgICB5TWluOiBwLnlNaW4sXG4gICAgeU1heDogcC55TWF4LFxuICAgIHNlYUxldmVsOiBwLnNlYUxldmVsLFxuICAgIHBhcmFtc0hhc2g6IGZudjFhKEpTT04uc3RyaW5naWZ5KHApKSxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbEVkaXQgeyBpOiBudW1iZXI7IG06IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgc2NoZW1hOiAxO1xuICBrZXk6IHN0cmluZztcbiAgYmFzZVZlcnNpb246IG51bWJlcjtcbiAgZWRpdHM6IFZveGVsRWRpdFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogQ2h1bmtEZWx0YSB7XG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIGtleSxcbiAgICBiYXNlVmVyc2lvbjogd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgZWRpdHM6IGVkaXRzID8gWy4uLmVkaXRzLmVudHJpZXMoKV0ubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSkgOiBbXSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGRlbHRhOiBDaHVua0RlbHRhKTogdm9pZCB7XG4gIGNvbnN0IFtjeCwgY3pdID0gZGVsdGEua2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGZvciAoY29uc3QgZSBvZiBkZWx0YS5lZGl0cykge1xuICAgIGNvbnN0IHlJbmRleCA9IE1hdGguZmxvb3IoZS5pIC8gQ0hVTktfQVJFQSk7XG4gICAgY29uc3QgcmVtID0gZS5pICUgQ0hVTktfQVJFQTtcbiAgICBjb25zdCBseiA9IE1hdGguZmxvb3IocmVtIC8gQ0hVTktfU0laRSk7XG4gICAgY29uc3QgbHggPSByZW0gJSBDSFVOS19TSVpFO1xuICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHg7XG4gICAgY29uc3QgeSA9IFlfTUlOICsgeUluZGV4O1xuICAgIGNvbnN0IHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIGUubSBhcyBNYXRJZCk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSB0aW1lIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgVGltZVN0YXRlIHsgdDogbnVtYmVyOyBkYXlMZW5ndGhTZWM6IG51bWJlcjsgcGF1c2VkOiBib29sZWFuOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBhZHZhbmNlVGltZShzOiBUaW1lU3RhdGUsIGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHMucGF1c2VkKSByZXR1cm47XG4gIHMudCA9IChzLnQgKyBkdCAvIHMuZGF5TGVuZ3RoU2VjKSAlIDE7XG59XG4iLCAiLy8gVm94ZWwgZmFjZSBjb2xvdXJzIGFuZCBrZXlzIHNoYXJlZCBieSB0aGUgbWFpbi10aHJlYWQgdGVycmFpbiB2aWV3IGFuZCB0aGVcbi8vIGNodW5rIHdvcmtlci4gUHVyZSBkYXRhICsgVEhSRUUuQ29sb3IgbWF0aCAobm8gV2ViR0wgb2JqZWN0cykuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQgeyBNQVQsIGhhc2gyaSB9IGZyb20gJy4uL3NpbS93b3JsZCc7XG5cbmV4cG9ydCBjb25zdCBNID0gcGFsZXR0ZS5tYXRlcmlhbHMgYXMgUmVjb3JkPHN0cmluZywgeyBoZXg6IHN0cmluZyB9PjtcbmV4cG9ydCBjb25zdCBIID0gKGs6IHN0cmluZykgPT4gTVtrXS5oZXg7XG5cbmV4cG9ydCBjb25zdCBjb2xvckNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFRIUkVFLkNvbG9yPigpO1xuZXhwb3J0IGZ1bmN0aW9uIGMoaGV4OiBzdHJpbmcpOiBUSFJFRS5Db2xvciB7XG4gIGxldCBvdXQgPSBjb2xvckNhY2hlLmdldChoZXgpO1xuICBpZiAoIW91dCkgeyBvdXQgPSBuZXcgVEhSRUUuQ29sb3IoaGV4KTsgY29sb3JDYWNoZS5zZXQoaGV4LCBvdXQpOyB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBjb25zdCBDT0wgPSB7XG4gIGdyYXNzVG9wOiBbYyhIKCdncmFzc190b3AnKSksIGMoSCgnZ3Jhc3NfaGlnaCcpKSwgYyhIKCdncmFzc19wZWFrJykpXSxcbiAgZ3Jhc3NDYXA6IGMoSCgnZ3Jhc3NfY2FwJykpLFxuICBzb2lsOiBjKEgoJ3N0cmF0YV9vY2hyZScpKS5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKDAuNzgpLFxuICBvY2hyZTogYyhIKCdzdHJhdGFfb2NocmUnKSksXG4gIHJ1c3Q6IGMoSCgnc3RyYXRhX3J1c3QnKSksXG4gIHN0b25lVG9wOiBjKEgoJ3N0b25lX3RvcCcpKSxcbiAgc3RvbmVBOiBjKEgoJ3N0b25lX2JvZHlfYScpKSxcbiAgc3RvbmVCOiBjKEgoJ3N0b25lX2JvZHlfYicpKSxcbiAgc3RvbmVTaGFkZTogYyhIKCdzdG9uZV9zaGFkZScpKSxcbiAgc2FuZDogYyhIKCdzYW5kJykpLFxuICBncmF2ZWw6IGMoSCgnc3RvbmVfYm9keV9iJykpLmNsb25lKCkubGVycChjKEgoJ3NhbmQnKSksIDAuMzUpLFxuICBvcmU6IGMoSCgnb3JlX2NyeXN0YWwnKSksXG4gIG1vc3M6IGMoSCgnZ3Jhc3NfY2FwJykpLmNsb25lKCkubGVycChjKEgoJ3N0b25lX2JvZHlfYicpKSwgMC4zNSksXG4gIHNub3c6IGMoSCgnc25vdycpKSxcbiAgc25vd1NoYWRlOiBjKEgoJ3Nub3cnKSkuY2xvbmUoKS5sZXJwKGMoSCgnc3RvbmVfc2hhZGUnKSksIDAuMzUpLFxuICB3YXRlclJpbTogYyhIKCd3YXRlcl9yaW0nKSksXG4gIHdhdGVyU2hhbGxvdzogYyhIKCd3YXRlcl9zaGFsbG93JykpLFxuICB3YXRlck1pZDogYyhIKCd3YXRlcl9taWQnKSksXG4gIHdhdGVyRGVlcDogYyhIKCd3YXRlcl9kZWVwJykpLFxufTtcblxuZXhwb3J0IGNvbnN0IFNIQURFID0gWzAuOTAsIDAuOTYsIDEuMCwgMS4wNF07XG5cbi8vIEtlZXAgYSBzbWFsbCByb2xsaW5nIHdpbmRvdyBvZiBidWlsZCB0aW1pbmdzIGZvciB0aGUgcGVyZm9ybWFuY2UgZXZpZGVuY2UuXG4vLyBUaGVzZSBhcmUgaW5zdHJ1bWVudGF0aW9uLCBub3Qgc2ltdWxhdGlvbiBzdGF0ZS5cbmV4cG9ydCBjb25zdCBNQVhfUEVSRl9TQU1QTEVTID0gMTI4O1xuZXhwb3J0IGZ1bmN0aW9uIHJlY29yZFNhbXBsZShzYW1wbGVzOiBudW1iZXJbXSwgbXM6IG51bWJlcik6IHZvaWQge1xuICBzYW1wbGVzLnB1c2gobXMpO1xuICBpZiAoc2FtcGxlcy5sZW5ndGggPiBNQVhfUEVSRl9TQU1QTEVTKSBzYW1wbGVzLnNoaWZ0KCk7XG59XG5leHBvcnQgZnVuY3Rpb24gcGVyY2VudGlsZShzYW1wbGVzOiBudW1iZXJbXSwgcDogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHNhbXBsZXMubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcbiAgY29uc3Qgc29ydGVkID0gWy4uLnNhbXBsZXNdLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbiAgY29uc3QgaSA9IE1hdGgubWluKHNvcnRlZC5sZW5ndGggLSAxLCBNYXRoLm1heCgwLCBNYXRoLmNlaWwocCAqIHNvcnRlZC5sZW5ndGgpIC0gMSkpO1xuICByZXR1cm4gTWF0aC5yb3VuZChzb3J0ZWRbaV0gKiAxMDApIC8gMTAwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QmFuZCh5OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4geSA+PSA0NSA/IDIgOiB5ID49IDE4ID8gMSA6IDA7XG59XG5leHBvcnQgZnVuY3Rpb24gc3RvbmVUb25lKHk6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoKHkgKyA2NCkgPj4gMykgJiAxO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHNoYWRlQXQoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgc3ggPSBNYXRoLmZsb29yKHggLyAyKSArIE1hdGguZmxvb3IoeSAvIDMpICogMTc7XG4gIGNvbnN0IHN6ID0gTWF0aC5mbG9vcih6IC8gMik7XG4gIHJldHVybiBNYXRoLmZsb29yKGhhc2gyaShzeCwgc3osIHNlZWQgKyAzMDApICogNCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBrZXlGb3IobWF0OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgc2hhZGU6IG51bWJlciwgYXhpczogbnVtYmVyLCBkaXI6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAobWF0ICYgMTUpIHwgKCh2YXJpYW50ICYgMTUpIDw8IDQpIHwgKChzaGFkZSAmIDMpIDw8IDgpIHwgKChheGlzICYgMykgPDwgMTApIHwgKChkaXIgPiAwID8gMSA6IDApIDw8IDEyKTtcbn1cblxuZXhwb3J0IGNvbnN0IGZhY2VDb2xvckNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRIUkVFLkNvbG9yPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gY29sb3JGb3JLZXkoa2V5OiBudW1iZXIpOiBUSFJFRS5Db2xvciB7XG4gIGNvbnN0IGNhY2hlZCA9IGZhY2VDb2xvckNhY2hlLmdldChrZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBtYXQgPSBrZXkgJiAxNTtcbiAgY29uc3QgdmFyaWFudCA9IChrZXkgPj4gNCkgJiAxNTtcbiAgY29uc3Qgc2hhZGUgPSAoa2V5ID4+IDgpICYgMztcbiAgY29uc3QgYXhpcyA9IChrZXkgPj4gMTApICYgMztcbiAgY29uc3QgZGlyID0gKGtleSA+PiAxMikgJiAxO1xuICBsZXQgY29sb3I6IFRIUkVFLkNvbG9yO1xuXG4gIGlmIChheGlzID09PSAxICYmIGRpciA9PT0gMSkge1xuICAgIGNvbnN0IGhiID0gTWF0aC5taW4oMiwgdmFyaWFudCAmIDMpO1xuICAgIGlmIChtYXQgPT09IE1BVC5HUkFTUykgY29sb3IgPSBDT0wuZ3Jhc3NUb3BbaGJdO1xuICAgIGVsc2UgaWYgKG1hdCA9PT0gTUFULlNBTkQpIGNvbG9yID0gQ09MLnNhbmQ7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuR1JBVkVMKSBjb2xvciA9IENPTC5ncmF2ZWw7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuU09JTCkgY29sb3IgPSBDT0wub2NocmU7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuT1JFKSBjb2xvciA9IENPTC5vcmU7XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuTU9TUykgY29sb3IgPSBDT0wubW9zcztcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5TTk9XKSBjb2xvciA9IENPTC5zbm93O1xuICAgIGVsc2UgY29sb3IgPSBDT0wuc3RvbmVUb3A7XG4gIH0gZWxzZSBpZiAoYXhpcyA9PT0gMSAmJiBkaXIgPT09IDApIHtcbiAgICBjb2xvciA9IENPTC5zdG9uZVNoYWRlO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGRlcHRoID0gdmFyaWFudCAmIDc7XG4gICAgY29uc3QgdG9uZSA9ICh2YXJpYW50ID4+IDMpICYgMTtcbiAgICBjb25zdCBib2R5ID0gdG9uZSA/IENPTC5zdG9uZUIgOiBDT0wuc3RvbmVBO1xuICAgIGlmIChtYXQgPT09IE1BVC5HUkFTUyB8fCBtYXQgPT09IE1BVC5NT1NTKSB7XG4gICAgICBpZiAoZGVwdGggPT09IDApIGNvbG9yID0gbWF0ID09PSBNQVQuTU9TUyA/IENPTC5tb3NzIDogQ09MLmdyYXNzQ2FwO1xuICAgICAgZWxzZSBpZiAoZGVwdGggPD0gMikgY29sb3IgPSBDT0wuc29pbDtcbiAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAzKSBjb2xvciA9IENPTC5ydXN0O1xuICAgICAgZWxzZSBjb2xvciA9IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TT0lMKSB7XG4gICAgICBjb2xvciA9IGRlcHRoIDw9IDEgPyBDT0wuc29pbCA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TQU5EKSB7XG4gICAgICBjb2xvciA9IGRlcHRoIDw9IDEgPyBDT0wuc2FuZCA6IGRlcHRoID09PSAyID8gQ09MLm9jaHJlIDogYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULkdSQVZFTCkge1xuICAgICAgY29sb3IgPSBkZXB0aCA8PSAxID8gQ09MLmdyYXZlbCA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5PUkUpIHtcbiAgICAgIGNvbG9yID0gQ09MLm9yZTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULlNOT1cpIHtcbiAgICAgIGNvbG9yID0gZGVwdGggPT09IDAgPyBDT0wuc25vd1NoYWRlIDogYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULkJFRFJPQ0spIHtcbiAgICAgIGNvbG9yID0gQ09MLnN0b25lU2hhZGU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbG9yID0gYm9keTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBvdXQgPSBjb2xvci5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKFNIQURFW3NoYWRlXSk7XG4gIGZhY2VDb2xvckNhY2hlLnNldChrZXksIG91dCk7XG4gIHJldHVybiBvdXQ7XG59XG4iLCAiLy8gUHVyZSBncmVlZHkgdm94ZWwgbWVzaGVyIG92ZXIgYSBwYWRkZWQgY2h1bmsgdm9sdW1lLiBObyBXb3JsZCBhY2Nlc3MgYW5kIG5vXG4vLyBXZWJHTCBvYmplY3RzLCBzbyBpdCBydW5zIGlkZW50aWNhbGx5IG9uIHRoZSBtYWluIHRocmVhZCBhbmQgaW4gYSB3b3JrZXIuXG4vL1xuLy8gUGFkZGVkIGxheW91dDogeCBhbmQgeiBydW4gZnJvbSAtMSB0byBDSFVOS19TSVpFICgzNCBjZWxscykgc28gZmFjZXMgb24gY2h1bmtcbi8vIGJvcmRlcnMgY2FuIHNlZSB0aGVpciBuZWlnaGJvdXJzOyB5IHJ1bnMgb3ZlciB0aGUgZnVsbCB3b3JsZCBoZWlnaHQuIE91dCBvZlxuLy8gcmFuZ2UgeSBzYW1wbGVzIGFyZSBiZWRyb2NrIGJlbG93IGFuZCBhaXIgYWJvdmUsIGFzIGluIGdldFZveGVsLlxuaW1wb3J0IHtcbiAgQ0hVTktfU0laRSwgV09STERfSEVJR0hULCBZX01JTiwgTUFULCBpc09wYXF1ZSwgbG9jYWxJbmRleCxcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IGNvbG9yRm9yS2V5LCBoZWlnaHRCYW5kLCBrZXlGb3IsIHNoYWRlQXQsIHN0b25lVG9uZSB9IGZyb20gJy4vdm94ZWwtY29sb3JzJztcblxuZXhwb3J0IGNvbnN0IFBBRCA9IENIVU5LX1NJWkUgKyAyO1xuZXhwb3J0IGNvbnN0IFBBRERFRF9WT0xVTUUgPSBQQUQgKiBQQUQgKiBXT1JMRF9IRUlHSFQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWVzaEFycmF5cyB7XG4gIHBvc2l0aW9uczogRmxvYXQzMkFycmF5O1xuICBub3JtYWxzOiBGbG9hdDMyQXJyYXk7XG4gIGNvbG9yczogRmxvYXQzMkFycmF5O1xuICBtYXRzOiBGbG9hdDMyQXJyYXk7XG4gIGluZGljZXM6IFVpbnQzMkFycmF5O1xuICB0cmlhbmdsZXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IHBhZGRlZEluZGV4ID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgPT5cbiAgKHggKyAxKSArICh6ICsgMSkgKiBQQUQgKyB5ICogUEFEICogUEFEO1xuXG4vKiogQ29weSBhIGNodW5rIGFuZCBpdHMgb25lLWNlbGwgYm9yZGVyIGludG8gYSBwYWRkZWQgdm9sdW1lLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUGFkZGVkKFxuICBkYXRhOiBVaW50OEFycmF5LFxuICBuZWlnaGJvdXI6IChseDogbnVtYmVyLCB5OiBudW1iZXIsIGx6OiBudW1iZXIpID0+IG51bWJlcixcbik6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBvdXQgPSBuZXcgVWludDhBcnJheShQQURERURfVk9MVU1FKTtcbiAgZm9yIChsZXQgeSA9IDA7IHkgPCBXT1JMRF9IRUlHSFQ7IHkrKykge1xuICAgIGZvciAobGV0IHogPSAtMTsgeiA8PSBDSFVOS19TSVpFOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSAtMTsgeCA8PSBDSFVOS19TSVpFOyB4KyspIHtcbiAgICAgICAgY29uc3QgaW5zaWRlID0geCA+PSAwICYmIHogPj0gMCAmJiB4IDwgQ0hVTktfU0laRSAmJiB6IDwgQ0hVTktfU0laRTtcbiAgICAgICAgb3V0W3BhZGRlZEluZGV4KHgsIHksIHopXSA9IGluc2lkZSA/IGRhdGFbbG9jYWxJbmRleCh4LCB5LCB6KV0gOiBuZWlnaGJvdXIoeCwgeSwgeik7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHBvc0Zyb20oYXhpczogbnVtYmVyLCBzbGljZTogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlciwgb3V0OiBJbnQzMkFycmF5KTogdm9pZCB7XG4gIGlmIChheGlzID09PSAwKSB7IG91dFswXSA9IHNsaWNlOyBvdXRbMV0gPSBpOyBvdXRbMl0gPSBqOyB9XG4gIGVsc2UgaWYgKGF4aXMgPT09IDEpIHsgb3V0WzBdID0gajsgb3V0WzFdID0gc2xpY2U7IG91dFsyXSA9IGk7IH1cbiAgZWxzZSB7IG91dFswXSA9IGk7IG91dFsxXSA9IGo7IG91dFsyXSA9IHNsaWNlOyB9XG59XG5cbmNsYXNzIEdyb3dhYmxlIHtcbiAgcHJpdmF0ZSBidWY6IEZsb2F0MzJBcnJheTtcbiAgbGVuZ3RoID0gMDtcbiAgY29uc3RydWN0b3IobjogbnVtYmVyKSB7IHRoaXMuYnVmID0gbmV3IEZsb2F0MzJBcnJheShuKTsgfVxuICBwdXNoMyhhOiBudW1iZXIsIGI6IG51bWJlciwgYzogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMubGVuZ3RoICsgMyA+IHRoaXMuYnVmLmxlbmd0aCkgdGhpcy5ncm93KCk7XG4gICAgdGhpcy5idWZbdGhpcy5sZW5ndGgrK10gPSBhOyB0aGlzLmJ1Zlt0aGlzLmxlbmd0aCsrXSA9IGI7IHRoaXMuYnVmW3RoaXMubGVuZ3RoKytdID0gYztcbiAgfVxuICBwdXNoMShhOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5sZW5ndGggKyAxID4gdGhpcy5idWYubGVuZ3RoKSB0aGlzLmdyb3coKTtcbiAgICB0aGlzLmJ1Zlt0aGlzLmxlbmd0aCsrXSA9IGE7XG4gIH1cbiAgcHJpdmF0ZSBncm93KCk6IHZvaWQgeyBjb25zdCBuID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLmJ1Zi5sZW5ndGggKiAyKTsgbi5zZXQodGhpcy5idWYpOyB0aGlzLmJ1ZiA9IG47IH1cbiAgZG9uZSgpOiBGbG9hdDMyQXJyYXkgeyByZXR1cm4gdGhpcy5idWYuc2xpY2UoMCwgdGhpcy5sZW5ndGgpOyB9XG59XG5cbi8qKlxuICogR3JlZWR5IDNEIGZhY2UgbWVzaGVyLiBBIGZhY2UgaXMgZW1pdHRlZCB3aGVyZSBhbiBvcGFxdWUgdm94ZWwgdG91Y2hlcyBhXG4gKiBub24tb3BhcXVlIGNlbGwgKGFpciBvciB3YXRlcik7IG9ubHkgdGhlIGNodW5rIHRoYXQgb3ducyB0aGUgc29saWQgdm94ZWxcbiAqIGVtaXRzIGl0LiBPdXRwdXQgaXMgaWRlbnRpY2FsIHRvIHRoZSBmb3JtZXIgaW4tcGxhY2UgbWVzaGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWVzaFBhZGRlZChcbiAgcGFkZGVkOiBVaW50OEFycmF5LCBoZWlnaHRzOiBVaW50OEFycmF5LCBveDogbnVtYmVyLCBvejogbnVtYmVyLCBzZWVkOiBudW1iZXIsXG4pOiBNZXNoQXJyYXlzIHtcbiAgY29uc3Qgc2FtcGxlID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGlmICh5IDwgMCkgcmV0dXJuIE1BVC5CRURST0NLO1xuICAgIGlmICh5ID49IFdPUkxEX0hFSUdIVCkgcmV0dXJuIE1BVC5BSVI7XG4gICAgcmV0dXJuIHBhZGRlZFtwYWRkZWRJbmRleCh4LCB5LCB6KV07XG4gIH07XG4gIGNvbnN0IHBvc2l0aW9ucyA9IG5ldyBHcm93YWJsZSgxIDw8IDE1KSwgbm9ybWFscyA9IG5ldyBHcm93YWJsZSgxIDw8IDE1KTtcbiAgY29uc3QgY29sb3JzID0gbmV3IEdyb3dhYmxlKDEgPDwgMTUpLCBtYXRzID0gbmV3IEdyb3dhYmxlKDEgPDwgMTMpO1xuICBsZXQgaW5kaWNlcyA9IG5ldyBVaW50MzJBcnJheSgxIDw8IDE0KTtcbiAgbGV0IGluZGV4Q291bnQgPSAwO1xuICBsZXQgdmVydGV4Q291bnQgPSAwO1xuICBjb25zdCBkaW1zID0gW0NIVU5LX1NJWkUsIFdPUkxEX0hFSUdIVCwgQ0hVTktfU0laRV07XG4gIGNvbnN0IHBhID0gbmV3IEludDMyQXJyYXkoMyksIHBiID0gbmV3IEludDMyQXJyYXkoMyk7XG4gIGNvbnN0IGNvcm5lcnMgPSBuZXcgRmxvYXQzMkFycmF5KDEyKTtcblxuICBjb25zdCBlbWl0UXVhZCA9IChheGlzOiBudW1iZXIsIGRpcjogbnVtYmVyLCBzbGljZTogbnVtYmVyLFxuICAgIGkwOiBudW1iZXIsIGowOiBudW1iZXIsIHc6IG51bWJlciwgaDogbnVtYmVyLCBrZXk6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IHBsYW5lID0gc2xpY2UgKyAxO1xuICAgIGNvbnN0IHUwID0gaTAsIHUxID0gaTAgKyB3LCB2MCA9IGowLCB2MSA9IGowICsgaDtcbiAgICBjb25zdCBzZXQgPSAoazogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKSA9PiB7IGNvcm5lcnNbayAqIDNdID0geDsgY29ybmVyc1trICogMyArIDFdID0geTsgY29ybmVyc1trICogMyArIDJdID0gejsgfTtcbiAgICBpZiAoYXhpcyA9PT0gMCkge1xuICAgICAgY29uc3QgeCA9IG94ICsgcGxhbmUsIHkwID0gWV9NSU4gKyB1MCwgeTEgPSBZX01JTiArIHUxLCB6MCA9IG96ICsgdjAsIHoxID0gb3ogKyB2MTtcbiAgICAgIGlmIChkaXIgPiAwKSB7IHNldCgwLCB4LCB5MCwgejApOyBzZXQoMSwgeCwgeTEsIHowKTsgc2V0KDIsIHgsIHkxLCB6MSk7IHNldCgzLCB4LCB5MCwgejEpOyB9XG4gICAgICBlbHNlIHsgc2V0KDAsIHgsIHkwLCB6MCk7IHNldCgxLCB4LCB5MCwgejEpOyBzZXQoMiwgeCwgeTEsIHoxKTsgc2V0KDMsIHgsIHkxLCB6MCk7IH1cbiAgICB9IGVsc2UgaWYgKGF4aXMgPT09IDEpIHtcbiAgICAgIGNvbnN0IHkgPSBZX01JTiArIHBsYW5lLCB6MCA9IG96ICsgdTAsIHoxID0gb3ogKyB1MSwgeDAgPSBveCArIHYwLCB4MSA9IG94ICsgdjE7XG4gICAgICBpZiAoZGlyID4gMCkgeyBzZXQoMCwgeDAsIHksIHowKTsgc2V0KDEsIHgwLCB5LCB6MSk7IHNldCgyLCB4MSwgeSwgejEpOyBzZXQoMywgeDEsIHksIHowKTsgfVxuICAgICAgZWxzZSB7IHNldCgwLCB4MCwgeSwgejApOyBzZXQoMSwgeDEsIHksIHowKTsgc2V0KDIsIHgxLCB5LCB6MSk7IHNldCgzLCB4MCwgeSwgejEpOyB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHogPSBveiArIHBsYW5lLCB4MCA9IG94ICsgdTAsIHgxID0gb3ggKyB1MSwgeTAgPSBZX01JTiArIHYwLCB5MSA9IFlfTUlOICsgdjE7XG4gICAgICBpZiAoZGlyID4gMCkgeyBzZXQoMCwgeDAsIHkwLCB6KTsgc2V0KDEsIHgxLCB5MCwgeik7IHNldCgyLCB4MSwgeTEsIHopOyBzZXQoMywgeDAsIHkxLCB6KTsgfVxuICAgICAgZWxzZSB7IHNldCgwLCB4MCwgeTAsIHopOyBzZXQoMSwgeDAsIHkxLCB6KTsgc2V0KDIsIHgxLCB5MSwgeik7IHNldCgzLCB4MSwgeTAsIHopOyB9XG4gICAgfVxuICAgIGNvbnN0IGNvbG9yID0gY29sb3JGb3JLZXkoa2V5KTtcbiAgICBjb25zdCBtYXQgPSBrZXkgJiAxNTtcbiAgICBjb25zdCBueCA9IGF4aXMgPT09IDAgPyBkaXIgOiAwLCBueSA9IGF4aXMgPT09IDEgPyBkaXIgOiAwLCBueiA9IGF4aXMgPT09IDIgPyBkaXIgOiAwO1xuICAgIGNvbnN0IGJhc2UgPSB2ZXJ0ZXhDb3VudDtcbiAgICBmb3IgKGxldCBrID0gMDsgayA8IDQ7IGsrKykge1xuICAgICAgcG9zaXRpb25zLnB1c2gzKGNvcm5lcnNbayAqIDNdLCBjb3JuZXJzW2sgKiAzICsgMV0sIGNvcm5lcnNbayAqIDMgKyAyXSk7XG4gICAgICBub3JtYWxzLnB1c2gzKG54LCBueSwgbnopO1xuICAgICAgY29sb3JzLnB1c2gzKGNvbG9yLnIsIGNvbG9yLmcsIGNvbG9yLmIpO1xuICAgICAgbWF0cy5wdXNoMShtYXQpO1xuICAgIH1cbiAgICB2ZXJ0ZXhDb3VudCArPSA0O1xuICAgIGlmIChpbmRleENvdW50ICsgNiA+IGluZGljZXMubGVuZ3RoKSB7IGNvbnN0IG4gPSBuZXcgVWludDMyQXJyYXkoaW5kaWNlcy5sZW5ndGggKiAyKTsgbi5zZXQoaW5kaWNlcyk7IGluZGljZXMgPSBuOyB9XG4gICAgaW5kaWNlc1tpbmRleENvdW50KytdID0gYmFzZTsgaW5kaWNlc1tpbmRleENvdW50KytdID0gYmFzZSArIDE7IGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2UgKyAyO1xuICAgIGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2U7IGluZGljZXNbaW5kZXhDb3VudCsrXSA9IGJhc2UgKyAyOyBpbmRpY2VzW2luZGV4Q291bnQrK10gPSBiYXNlICsgMztcbiAgfTtcblxuICBmb3IgKGxldCBheGlzID0gMDsgYXhpcyA8IDM7IGF4aXMrKykge1xuICAgIGNvbnN0IHUgPSAoYXhpcyArIDEpICUgMywgdiA9IChheGlzICsgMikgJSAzO1xuICAgIGNvbnN0IGR1ID0gZGltc1t1XSwgZHYgPSBkaW1zW3ZdLCBkZCA9IGRpbXNbYXhpc107XG4gICAgY29uc3QgbWFzayA9IG5ldyBVaW50MTZBcnJheShkdSAqIGR2KTtcbiAgICBmb3IgKGxldCBzbGljZSA9IC0xOyBzbGljZSA8IGRkOyBzbGljZSsrKSB7XG4gICAgICBtYXNrLmZpbGwoMCk7XG4gICAgICBsZXQgYW55ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGR2OyBqKyspIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkdTsgaSsrKSB7XG4gICAgICAgICAgcG9zRnJvbShheGlzLCBzbGljZSwgaSwgaiwgcGEpO1xuICAgICAgICAgIHBvc0Zyb20oYXhpcywgc2xpY2UgKyAxLCBpLCBqLCBwYik7XG4gICAgICAgICAgY29uc3QgYSA9IHNhbXBsZShwYVswXSwgcGFbMV0sIHBhWzJdKTtcbiAgICAgICAgICBjb25zdCBiID0gc2FtcGxlKHBiWzBdLCBwYlsxXSwgcGJbMl0pO1xuICAgICAgICAgIGNvbnN0IGFvID0gaXNPcGFxdWUoYSksIGJvID0gaXNPcGFxdWUoYik7XG4gICAgICAgICAgaWYgKGFvID09PSBibykgY29udGludWU7XG4gICAgICAgICAgY29uc3QgYUluc2lkZSA9IHNsaWNlID49IDAgJiYgc2xpY2UgPCBkZDtcbiAgICAgICAgICBjb25zdCBiSW5zaWRlID0gc2xpY2UgKyAxID49IDAgJiYgc2xpY2UgKyAxIDwgZGQ7XG4gICAgICAgICAgbGV0IHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG1hdDogbnVtYmVyLCBkaXI6IG51bWJlcjtcbiAgICAgICAgICBpZiAoYW8gJiYgIWJvICYmIGFJbnNpZGUpIHsgeCA9IHBhWzBdOyB5ID0gcGFbMV07IHogPSBwYVsyXTsgbWF0ID0gYTsgZGlyID0gMTsgfVxuICAgICAgICAgIGVsc2UgaWYgKGJvICYmICFhbyAmJiBiSW5zaWRlKSB7IHggPSBwYlswXTsgeSA9IHBiWzFdOyB6ID0gcGJbMl07IG1hdCA9IGI7IGRpciA9IC0xOyB9XG4gICAgICAgICAgZWxzZSBjb250aW51ZTtcbiAgICAgICAgICBjb25zdCB3eSA9IFlfTUlOICsgeTtcbiAgICAgICAgICBjb25zdCBzdXJmYWNlWSA9IGhlaWdodHNbeiAqIENIVU5LX1NJWkUgKyB4XSArIFlfTUlOO1xuICAgICAgICAgIGNvbnN0IGRlcHRoID0gc3VyZmFjZVkgLSAod3kgKyAxKTtcbiAgICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICAgIGlmIChheGlzID09PSAxICYmIGRpciA+IDApIHZhcmlhbnQgPSBoZWlnaHRCYW5kKHd5KTtcbiAgICAgICAgICBlbHNlIGlmIChheGlzID09PSAxICYmIGRpciA8IDApIHZhcmlhbnQgPSAxNTtcbiAgICAgICAgICBlbHNlIHZhcmlhbnQgPSAoTWF0aC5tYXgoMCwgTWF0aC5taW4oNywgZGVwdGgpKSAmIDcpIHwgKHN0b25lVG9uZSh3eSkgPDwgMyk7XG4gICAgICAgICAgbWFza1tqICogZHUgKyBpXSA9IGtleUZvcihtYXQsIHZhcmlhbnQsIHNoYWRlQXQob3ggKyB4LCB3eSwgb3ogKyB6LCBzZWVkKSwgYXhpcywgZGlyKTtcbiAgICAgICAgICBhbnkgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIWFueSkgY29udGludWU7XG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGR2OyBqKyspIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkdTspIHtcbiAgICAgICAgICBjb25zdCBrZXkgPSBtYXNrW2ogKiBkdSArIGldO1xuICAgICAgICAgIGlmICgha2V5KSB7IGkrKzsgY29udGludWU7IH1cbiAgICAgICAgICBsZXQgdyA9IDE7XG4gICAgICAgICAgd2hpbGUgKGkgKyB3IDwgZHUgJiYgbWFza1tqICogZHUgKyBpICsgd10gPT09IGtleSkgdysrO1xuICAgICAgICAgIGxldCBoID0gMTtcbiAgICAgICAgICBvdXRlcjogd2hpbGUgKGogKyBoIDwgZHYpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGsgPSAwOyBrIDwgdzsgaysrKSBpZiAobWFza1soaiArIGgpICogZHUgKyBpICsga10gIT09IGtleSkgYnJlYWsgb3V0ZXI7XG4gICAgICAgICAgICBoKys7XG4gICAgICAgICAgfVxuICAgICAgICAgIGZvciAobGV0IGpqID0gMDsgamogPCBoOyBqaisrKSBmb3IgKGxldCBpaSA9IDA7IGlpIDwgdzsgaWkrKykgbWFza1soaiArIGpqKSAqIGR1ICsgaSArIGlpXSA9IDA7XG4gICAgICAgICAgZW1pdFF1YWQoYXhpcywgKGtleSA+PiAxMikgJiAxID8gMSA6IC0xLCBzbGljZSwgaSwgaiwgdywgaCwga2V5KTtcbiAgICAgICAgICBpICs9IHc7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBwb3NpdGlvbnM6IHBvc2l0aW9ucy5kb25lKCksIG5vcm1hbHM6IG5vcm1hbHMuZG9uZSgpLCBjb2xvcnM6IGNvbG9ycy5kb25lKCksIG1hdHM6IG1hdHMuZG9uZSgpLFxuICAgIGluZGljZXM6IGluZGljZXMuc2xpY2UoMCwgaW5kZXhDb3VudCksIHRyaWFuZ2xlczogaW5kZXhDb3VudCAvIDMsXG4gIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTs7O0FDUW5CLFlBQVlBLFlBQVc7OztBQ0d2QixZQUFZLFdBQVc7OztBQ1p2QjtBQUFBLEVBQ0UsUUFBVTtBQUFBLEVBQ1YsTUFBUTtBQUFBLEVBQ1IsUUFBVTtBQUFBLEVBQ1YsUUFBVTtBQUFBLEVBQ1YsTUFBUTtBQUFBLEVBQ1IsV0FBYTtBQUFBLElBQ1gsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGNBQWdCO0FBQUEsTUFDZCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsYUFBZTtBQUFBLE1BQ2IsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGNBQWdCO0FBQUEsTUFDZCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsYUFBZTtBQUFBLE1BQ2IsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLE1BQVE7QUFBQSxNQUNOLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxNQUFRO0FBQUEsTUFDTixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxnQkFBa0I7QUFBQSxNQUNoQixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZUFBaUI7QUFBQSxNQUNmLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxhQUFlO0FBQUEsTUFDYixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxtQkFBcUI7QUFBQSxNQUNuQixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsY0FBZ0I7QUFBQSxNQUNkLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxhQUFlO0FBQUEsTUFDYixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsbUJBQXFCO0FBQUEsTUFDbkIsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxrQkFBb0I7QUFBQSxNQUNsQixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGlCQUFtQjtBQUFBLE1BQ2pCLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGVBQWlCO0FBQUEsTUFDZixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZ0JBQWtCO0FBQUEsTUFDaEIsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGdCQUFrQjtBQUFBLE1BQ2hCLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxnQkFBa0I7QUFBQSxNQUNoQixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsYUFBZTtBQUFBLE1BQ2IsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGVBQWlCO0FBQUEsTUFDZixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsT0FBUztBQUFBLE1BQ1AsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGdCQUFrQjtBQUFBLE1BQ2hCLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxnQkFBa0I7QUFBQSxNQUNoQixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0Esa0JBQW9CO0FBQUEsTUFDbEIsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGNBQWdCO0FBQUEsTUFDZCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGNBQWdCO0FBQUEsTUFDZCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZUFBaUI7QUFBQSxNQUNmLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGVBQWlCO0FBQUEsTUFDZixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsY0FBZ0I7QUFBQSxNQUNkLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxlQUFpQjtBQUFBLE1BQ2YsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFlBQWM7QUFBQSxNQUNaLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxhQUFlO0FBQUEsTUFDYixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZUFBaUI7QUFBQSxNQUNmLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxhQUFlO0FBQUEsTUFDYixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZUFBaUI7QUFBQSxNQUNmLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxhQUFlO0FBQUEsTUFDYixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsYUFBZTtBQUFBLE1BQ2IsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGVBQWlCO0FBQUEsTUFDZixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZ0JBQWtCO0FBQUEsTUFDaEIsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxVQUFZO0FBQUEsSUFDVixNQUFRO0FBQUEsTUFDTixpQkFBbUI7QUFBQSxNQUNuQixlQUFpQjtBQUFBLE1BQ2pCLFVBQVk7QUFBQSxNQUNaLGNBQWdCO0FBQUEsTUFDaEIsU0FBVztBQUFBLE1BQ1gsWUFBYztBQUFBLE1BQ2QsZUFBaUI7QUFBQSxNQUNqQixLQUFPO0FBQUEsTUFDUCxLQUFPO0FBQUEsTUFDUCxZQUFjO0FBQUEsTUFDZCxVQUFZO0FBQUEsSUFDZDtBQUFBLElBQ0EsTUFBUTtBQUFBLE1BQ04saUJBQW1CO0FBQUEsTUFDbkIsZUFBaUI7QUFBQSxNQUNqQixVQUFZO0FBQUEsTUFDWixjQUFnQjtBQUFBLE1BQ2hCLFNBQVc7QUFBQSxNQUNYLFlBQWM7QUFBQSxNQUNkLGVBQWlCO0FBQUEsTUFDakIsS0FBTztBQUFBLE1BQ1AsS0FBTztBQUFBLE1BQ1AsWUFBYztBQUFBLE1BQ2QsVUFBWTtBQUFBLElBQ2Q7QUFBQSxJQUNBLE1BQVE7QUFBQSxNQUNOLGlCQUFtQjtBQUFBLE1BQ25CLGVBQWlCO0FBQUEsTUFDakIsVUFBWTtBQUFBLE1BQ1osY0FBZ0I7QUFBQSxNQUNoQixTQUFXO0FBQUEsTUFDWCxZQUFjO0FBQUEsTUFDZCxlQUFpQjtBQUFBLE1BQ2pCLEtBQU87QUFBQSxNQUNQLEtBQU87QUFBQSxNQUNQLFlBQWM7QUFBQSxNQUNkLFVBQVk7QUFBQSxJQUNkO0FBQUEsSUFDQSxPQUFTO0FBQUEsTUFDUCxpQkFBbUI7QUFBQSxNQUNuQixlQUFpQjtBQUFBLE1BQ2pCLFVBQVk7QUFBQSxNQUNaLGNBQWdCO0FBQUEsTUFDaEIsU0FBVztBQUFBLE1BQ1gsWUFBYztBQUFBLE1BQ2QsZUFBaUI7QUFBQSxNQUNqQixLQUFPO0FBQUEsTUFDUCxLQUFPO0FBQUEsTUFDUCxZQUFjO0FBQUEsTUFDZCxVQUFZO0FBQUEsSUFDZDtBQUFBLEVBQ0Y7QUFDRjs7O0FDdFZBLElBQU0sU0FBUyxvQkFBSSxRQUE2QjtBQWV6QyxTQUFTLGNBQWMsT0FBd0I7QUFDcEQsU0FBTyxPQUFPLElBQUksS0FBSyxHQUFHLFVBQVU7QUFDdEM7OztBQ3RCTyxJQUFNLFFBQVEsQ0FBQyxHQUFXLEdBQVcsTUFBZSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksSUFBSTtBQUM1RSxJQUFNLE9BQU8sQ0FBQyxHQUFXLEdBQVcsTUFBYyxLQUFLLElBQUksS0FBSztBQUNoRSxJQUFNLGFBQWEsQ0FBQyxJQUFZLElBQVksTUFBYztBQUMvRCxRQUFNLElBQUksT0FBTyxJQUFJLE9BQU8sS0FBSyxLQUFLLEdBQUcsQ0FBQztBQUMxQyxTQUFPLElBQUksS0FBSyxJQUFJLElBQUk7QUFDMUI7QUFHTyxTQUFTLE9BQU8sR0FBVyxHQUFXLE1BQXNCO0FBQ2pFLE1BQUksSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FBRyxTQUFTO0FBQy9ELE1BQUksS0FBSyxLQUFLLElBQUssTUFBTSxJQUFLLFVBQVU7QUFDeEMsV0FBUyxJQUFLLE1BQU0sUUFBUyxLQUFLO0FBQ3BDO0FBRU8sU0FBUyxPQUFPLEdBQVcsR0FBVyxHQUFXLE1BQXNCO0FBQzVFLE1BQUksSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FBRyxTQUFTLElBQUksS0FBSyxLQUFLLEdBQUcsVUFBVTtBQUMxRixNQUFJLEtBQUssS0FBSyxJQUFLLE1BQU0sSUFBSyxVQUFVO0FBQ3hDLFdBQVMsSUFBSyxNQUFNLFFBQVMsS0FBSztBQUNwQztBQUVPLFNBQVMsV0FBVyxNQUE0QjtBQUNyRCxNQUFJLElBQUksU0FBUztBQUNqQixTQUFPLE1BQU07QUFDWCxRQUFLLElBQUksZUFBZ0I7QUFDekIsUUFBSSxJQUFJO0FBQ1IsUUFBSSxLQUFLLEtBQUssSUFBSyxNQUFNLElBQUssSUFBSSxDQUFDO0FBQ25DLFNBQUssSUFBSSxLQUFLLEtBQUssSUFBSyxNQUFNLEdBQUksSUFBSSxFQUFFO0FBQ3hDLGFBQVMsSUFBSyxNQUFNLFFBQVMsS0FBSztBQUFBLEVBQ3BDO0FBQ0Y7QUFFTyxJQUFNLFNBQVMsQ0FBQyxNQUFjLElBQUksS0FBSyxJQUFJLElBQUk7QUFFL0MsU0FBUyxZQUFZLEdBQVcsR0FBVyxNQUFzQjtBQUN0RSxRQUFNLEtBQUssS0FBSyxNQUFNLENBQUMsR0FBRyxLQUFLLEtBQUssTUFBTSxDQUFDO0FBQzNDLFFBQU0sS0FBSyxPQUFPLElBQUksRUFBRSxHQUFHLEtBQUssT0FBTyxJQUFJLEVBQUU7QUFDN0MsUUFBTSxJQUFJLE9BQU8sSUFBSSxJQUFJLElBQUksR0FBRyxJQUFJLE9BQU8sS0FBSyxHQUFHLElBQUksSUFBSTtBQUMzRCxRQUFNQyxLQUFJLE9BQU8sSUFBSSxLQUFLLEdBQUcsSUFBSSxHQUFHLElBQUksT0FBTyxLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUk7QUFDbkUsUUFBTSxNQUFNLEtBQUssSUFBSSxLQUFLO0FBQzFCLFFBQU0sU0FBU0EsTUFBSyxJQUFJQSxNQUFLO0FBQzdCLFNBQU8sT0FBTyxTQUFTLE9BQU87QUFDaEM7QUFFTyxTQUFTLEtBQUssR0FBVyxHQUFXLE1BQWMsU0FBeUI7QUFDaEYsTUFBSSxNQUFNLEdBQUcsTUFBTSxHQUFHLE9BQU8sR0FBRyxPQUFPO0FBQ3ZDLFdBQVMsSUFBSSxHQUFHLElBQUksU0FBUyxLQUFLO0FBQ2hDLFdBQU8sTUFBTSxZQUFZLElBQUksTUFBTSxJQUFJLE1BQU0sT0FBTyxJQUFJLEdBQUc7QUFDM0QsWUFBUTtBQUNSLFdBQU87QUFBSyxZQUFRO0FBQUEsRUFDdEI7QUFDQSxTQUFPLE1BQU07QUFDZjtBQUVPLFNBQVMsWUFBWSxHQUFXLEdBQVcsR0FBVyxNQUFzQjtBQUNqRixRQUFNLEtBQUssS0FBSyxNQUFNLENBQUMsR0FBRyxLQUFLLEtBQUssTUFBTSxDQUFDLEdBQUcsS0FBSyxLQUFLLE1BQU0sQ0FBQztBQUMvRCxRQUFNLEtBQUssT0FBTyxJQUFJLEVBQUUsR0FBRyxLQUFLLE9BQU8sSUFBSSxFQUFFLEdBQUcsS0FBSyxPQUFPLElBQUksRUFBRTtBQUNsRSxRQUFNLE9BQU8sT0FBTyxJQUFJLElBQUksSUFBSSxJQUFJLEdBQUcsT0FBTyxPQUFPLEtBQUssR0FBRyxJQUFJLElBQUksSUFBSTtBQUN6RSxRQUFNLE9BQU8sT0FBTyxJQUFJLEtBQUssR0FBRyxJQUFJLElBQUksR0FBRyxPQUFPLE9BQU8sS0FBSyxHQUFHLEtBQUssR0FBRyxJQUFJLElBQUk7QUFDakYsUUFBTSxPQUFPLE9BQU8sSUFBSSxJQUFJLEtBQUssR0FBRyxJQUFJLEdBQUcsT0FBTyxPQUFPLEtBQUssR0FBRyxJQUFJLEtBQUssR0FBRyxJQUFJO0FBQ2pGLFFBQU0sT0FBTyxPQUFPLElBQUksS0FBSyxHQUFHLEtBQUssR0FBRyxJQUFJLEdBQUcsT0FBTyxPQUFPLEtBQUssR0FBRyxLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUk7QUFDekYsUUFBTSxNQUFNLFFBQVEsT0FBTyxRQUFRO0FBQ25DLFFBQU0sTUFBTSxRQUFRLE9BQU8sUUFBUTtBQUNuQyxRQUFNLE1BQU0sUUFBUSxPQUFPLFFBQVE7QUFDbkMsUUFBTSxNQUFNLFFBQVEsT0FBTyxRQUFRO0FBQ25DLFFBQU0sS0FBSyxPQUFPLE1BQU0sT0FBTztBQUMvQixRQUFNLEtBQUssT0FBTyxNQUFNLE9BQU87QUFDL0IsU0FBTyxNQUFNLEtBQUssTUFBTTtBQUMxQjtBQUVPLFNBQVMsS0FBSyxHQUFXLEdBQVcsR0FBVyxNQUFjLFNBQXlCO0FBQzNGLE1BQUksTUFBTSxHQUFHLE1BQU0sR0FBRyxPQUFPLEdBQUcsT0FBTztBQUN2QyxXQUFTLElBQUksR0FBRyxJQUFJLFNBQVMsS0FBSztBQUNoQyxXQUFPLE1BQU0sWUFBWSxJQUFJLE1BQU0sSUFBSSxNQUFNLElBQUksTUFBTSxPQUFPLElBQUksR0FBRztBQUNyRSxZQUFRO0FBQ1IsV0FBTztBQUFLLFlBQVE7QUFBQSxFQUN0QjtBQUNBLFNBQU8sTUFBTTtBQUNmOzs7QUM3Qk8sSUFBTSxhQUFOLE1BQWlCO0FBQUEsRUFLdEIsWUFBWSxRQUErQixPQUFlO0FBQWY7QUFDekMsU0FBSyxTQUFTO0FBQ2QsYUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLE9BQU8sUUFBUSxLQUFLO0FBQzFDLFlBQU0sSUFBSSxPQUFPLENBQUMsR0FBRyxJQUFJLE9BQU8sSUFBSSxDQUFDO0FBQ3JDLFlBQU0sS0FBSyxLQUFLLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLE9BQU8sS0FBSyxLQUFLLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJO0FBQ2pFLFlBQU0sS0FBSyxLQUFLLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLE9BQU8sS0FBSyxLQUFLLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJO0FBQ2pFLGVBQVMsS0FBSyxLQUFLLE1BQU0sS0FBSyxLQUFLLElBQUksR0FBRyxNQUFNLEtBQUssTUFBTSxLQUFLLEtBQUssSUFBSSxHQUFHLE1BQU07QUFDaEYsaUJBQVMsS0FBSyxLQUFLLE1BQU0sS0FBSyxLQUFLLElBQUksR0FBRyxNQUFNLEtBQUssTUFBTSxLQUFLLEtBQUssSUFBSSxHQUFHLE1BQU07QUFDaEYsZ0JBQU0sTUFBTSxRQUFRLElBQUksRUFBRTtBQUMxQixjQUFJLE9BQU8sS0FBSyxLQUFLLElBQUksR0FBRztBQUM1QixjQUFJLENBQUMsTUFBTTtBQUFFLG1CQUFPLENBQUM7QUFBRyxpQkFBSyxLQUFLLElBQUksS0FBSyxJQUFJO0FBQUEsVUFBRztBQUNsRCxlQUFLLEtBQUssQ0FBQztBQUFBLFFBQ2I7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQWYyQztBQUFBLEVBSmxDO0FBQUEsRUFDUSxPQUFPO0FBQUEsRUFDUCxPQUFPLG9CQUFJLElBQXNCO0FBQUEsRUFtQmxELElBQUksU0FBaUI7QUFBRSxXQUFPLEtBQUssT0FBTyxLQUFLLE9BQU8sU0FBUyxDQUFDLEdBQUcsS0FBSztBQUFBLEVBQUc7QUFBQTtBQUFBLEVBRzNFLFFBQVEsR0FBVyxHQUE0QjtBQUM3QyxVQUFNLE9BQU8sS0FBSyxLQUFLLElBQUksUUFBUSxLQUFLLE1BQU0sSUFBSSxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDO0FBQ3hGLFFBQUksQ0FBQyxLQUFNLFFBQU87QUFDbEIsUUFBSSxPQUFPLFVBQVUsS0FBSyxJQUFJLEtBQUs7QUFDbkMsZUFBVyxLQUFLLE1BQU07QUFDcEIsWUFBTUMsS0FBSSxLQUFLLE9BQU8sQ0FBQyxHQUFHQyxLQUFJLEtBQUssT0FBTyxJQUFJLENBQUM7QUFDL0MsWUFBTSxLQUFLQSxHQUFFLElBQUlELEdBQUUsR0FBRyxLQUFLQyxHQUFFLElBQUlELEdBQUU7QUFDbkMsWUFBTSxPQUFPLEtBQUssS0FBSyxLQUFLLE1BQU07QUFDbEMsWUFBTSxJQUFJLFFBQVEsSUFBSUEsR0FBRSxLQUFLLE1BQU0sSUFBSUEsR0FBRSxLQUFLLE1BQU0sTUFBTSxHQUFHLENBQUM7QUFDOUQsWUFBTSxLQUFLQSxHQUFFLElBQUksS0FBSyxHQUFHLEtBQUtBLEdBQUUsSUFBSSxLQUFLO0FBQ3pDLFlBQU0sTUFBTSxJQUFJLE9BQU8sS0FBSyxJQUFJLE9BQU87QUFDdkMsVUFBSSxLQUFLLE1BQU07QUFBRSxlQUFPO0FBQUksYUFBSztBQUFHLGFBQUs7QUFBQSxNQUFHO0FBQUEsSUFDOUM7QUFDQSxRQUFJLEtBQUssS0FBSyxPQUFPLEtBQUssUUFBUSxLQUFLLE1BQU8sUUFBTztBQUNyRCxVQUFNLElBQUksS0FBSyxPQUFPLEVBQUUsR0FBRyxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUM7QUFDakQsVUFBTSxTQUFTLEtBQUssSUFBSSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUM7QUFFdkMsVUFBTSxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssUUFBUSxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUs7QUFDcEQsV0FBTztBQUFBLE1BQ0wsR0FBRyxLQUFLLEtBQUssSUFBSTtBQUFBLE1BQ2pCLE9BQU8sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFNBQVM7QUFBQSxNQUN2QyxPQUFPLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxTQUFTO0FBQUEsTUFDdkM7QUFBQSxNQUFJO0FBQUEsTUFDSixVQUFVLEtBQUssSUFBSSxJQUFJLEVBQUUsUUFBUSxFQUFFLFNBQVMsTUFBTTtBQUFBLE1BQ2xELEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLFNBQVMsUUFBUSxJQUFZLElBQW9CO0FBQy9DLFVBQVEsS0FBSyxRQUFRLFFBQVEsS0FBSztBQUNwQztBQXNCTyxJQUFNLFlBQU4sTUFBZ0I7QUFBQSxFQUNaO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBO0FBQUEsRUFFQTtBQUFBLEVBRVQsWUFBWSxNQUF3QjtBQUNsQyxTQUFLLE9BQU8sS0FBSztBQUNqQixTQUFLLFVBQVUsS0FBSztBQUNwQixTQUFLLE9BQU8sV0FBVyxLQUFLLFFBQVE7QUFDcEMsU0FBSyxRQUFRLGdCQUFnQixLQUFLLFVBQVUsS0FBSyxJQUFJO0FBQ3JELFFBQUksS0FBSyxXQUFXLEdBQUc7QUFDckIsWUFBTSxRQUFRLGlCQUFpQixLQUFLLE1BQU0sS0FBSyxJQUFJO0FBQ25ELFdBQUssUUFBUSxNQUFNO0FBQ25CLFdBQUssT0FBTyxNQUFNO0FBQUEsSUFDcEIsT0FBTztBQUNMLFdBQUssUUFBUTtBQUNiLFdBQUssT0FBTztBQUFBLElBQ2Q7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE9BQU8sR0FBVyxHQUFXLE9BQTJCO0FBQ3RELFFBQUksS0FBSyxTQUFTLFFBQVEsS0FBSztBQUM3QixZQUFNLE1BQU0sS0FBSyxNQUFNLFFBQVEsR0FBRyxDQUFDO0FBQ25DLFVBQUksT0FBTyxJQUFJLEtBQUssSUFBSSxRQUFRLEdBQUc7QUFDakMsY0FBTSxRQUFRLE1BQU0sT0FBTyxJQUFJLFdBQVcsR0FBRyxLQUFLLEdBQUc7QUFDckQsZUFBTyxFQUFFLE1BQU0sU0FBUyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxNQUFNO0FBQUEsTUFDeEQ7QUFDQSxVQUFJLEtBQUssUUFBUSxLQUFLLE1BQU0sSUFBSSxLQUFLLEtBQUssR0FBRyxJQUFJLEtBQUssS0FBSyxDQUFDLElBQUksS0FBSyxLQUFLLElBQUksR0FBRztBQUMvRSxlQUFPLEVBQUUsTUFBTSxRQUFRLEdBQUcsUUFBUSxHQUFHLEdBQUcsS0FBSyxZQUFZLEdBQUcsSUFBSSxFQUFFO0FBQUEsTUFDcEU7QUFBQSxJQUNGO0FBQ0EsVUFBTSxNQUFNLEtBQUssTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUNuQyxRQUFJLE9BQU8sSUFBSSxLQUFLLElBQUksUUFBUSxHQUFHO0FBQ2pDLGFBQU8sRUFBRSxNQUFNLFNBQVMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksT0FBTyxPQUFPLE9BQU8sV0FBVyxJQUFJLFFBQVEsR0FBRyxHQUFHLElBQUksQ0FBQyxFQUFFO0FBQUEsSUFDM0c7QUFDQSxVQUFNLEtBQUssS0FBSyxPQUFPLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssRUFBRTtBQUN4RixRQUFJLEtBQUssTUFBTTtBQUViLFlBQU0sT0FBTyxLQUFLLE1BQU0sT0FBTyxLQUFLLE1BQU0sT0FBTyxTQUFTLENBQUM7QUFDM0QsWUFBTSxRQUFRLFFBQVEsR0FBRyxHQUFHLE1BQU0sSUFBSTtBQUN0QyxhQUFPLEVBQUUsTUFBTSxRQUFRLEdBQUcsTUFBTTtBQUFBLElBQ2xDO0FBQ0EsV0FBTyxFQUFFLE1BQU0sT0FBTyxJQUFJLEdBQUcsSUFBSSxHQUFHLE9BQU8sRUFBRTtBQUFBLEVBQy9DO0FBQUEsRUFFUSxjQUF3QztBQUM5QyxVQUFNLE1BQU0sS0FBSyxNQUFPO0FBQ3hCLFdBQU8sSUFBSSxJQUFJLFNBQVMsQ0FBQztBQUFBLEVBQzNCO0FBQ0Y7QUFFQSxTQUFTLFFBQVEsR0FBVyxHQUFXLEdBQTZCLE9BQWU7QUFDakYsUUFBTSxLQUFLLEVBQUUsSUFBSSxHQUFHLEtBQUssRUFBRSxJQUFJO0FBQy9CLFFBQU0sTUFBTSxLQUFLLE1BQU0sSUFBSSxFQUFFLEtBQUs7QUFDbEMsU0FBTyxFQUFFLElBQUksS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLE1BQU07QUFDN0M7QUFHQSxTQUFTLFdBQVcsR0FBcUM7QUFDdkQsTUFBSSxLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUksR0FBRyxPQUFPLFVBQVUsT0FBTyxXQUFXLE9BQU8sVUFBVSxPQUFPO0FBQ3RGLFdBQVMsSUFBSSxNQUFNLEtBQUssTUFBTSxLQUFLLEdBQUc7QUFDcEMsYUFBUyxJQUFJLE1BQU0sS0FBSyxLQUFLLEtBQUssR0FBRztBQUNuQyxVQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksR0FBSTtBQUNsQixZQUFNO0FBQUcsWUFBTTtBQUFHO0FBQ2xCLGFBQU8sS0FBSyxJQUFJLE1BQU0sQ0FBQztBQUFHLGFBQU8sS0FBSyxJQUFJLE1BQU0sQ0FBQztBQUNqRCxhQUFPLEtBQUssSUFBSSxNQUFNLENBQUM7QUFBRyxhQUFPLEtBQUssSUFBSSxNQUFNLENBQUM7QUFBQSxJQUNuRDtBQUFBLEVBQ0Y7QUFDQSxNQUFJLE1BQU0sRUFBRyxRQUFPLEVBQUUsR0FBRyxNQUFNLEdBQUcsTUFBTSxJQUFJLEtBQUssSUFBSSxHQUFHO0FBQ3hELFNBQU87QUFBQSxJQUNMLEdBQUcsS0FBSztBQUFBLElBQUcsR0FBRyxLQUFLO0FBQUEsSUFDbkIsSUFBSSxLQUFLLElBQUksS0FBSyxPQUFPLFFBQVEsSUFBSSxFQUFFO0FBQUEsSUFBRyxJQUFJLEtBQUssSUFBSSxLQUFLLE9BQU8sUUFBUSxJQUFJLEVBQUU7QUFBQSxFQUNuRjtBQUNGO0FBT0EsU0FBUyxnQkFBZ0IsR0FBa0IsTUFBcUM7QUFDOUUsUUFBTSxNQUF1QyxDQUFDO0FBQzlDLE1BQUksS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLO0FBQzVCLE1BQUksSUFBSSxLQUFLLE1BQU0sS0FBSyxJQUFJLEtBQUssS0FBSyxHQUFHO0FBRXpDLFNBQU8sS0FBSyxLQUFLLEtBQUssR0FBRztBQUN2QixRQUFJLE9BQU8sVUFBVSxLQUFLO0FBQzFCLGFBQVMsSUFBSSxLQUFLLE1BQU0sS0FBSyxFQUFFLEdBQUcsS0FBSyxLQUFLLElBQUksS0FBSyxHQUFHO0FBQ3RELFlBQU0sSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLEtBQUssSUFBSSxJQUFJLEVBQUUsSUFBSTtBQUN2QyxVQUFJLElBQUksTUFBTTtBQUFFLGVBQU87QUFBRyxhQUFLO0FBQUEsTUFBRztBQUFBLElBQ3BDO0FBQ0EsU0FBSztBQUNMLFFBQUksS0FBSyxFQUFFLEdBQUcsSUFBSSxFQUFFLENBQUM7QUFFckIsUUFBSSxPQUFPLE1BQU0sSUFBSSxTQUFTLE1BQU0sRUFBRSxJQUFJLElBQUksQ0FBQyxJQUFJLE1BQU0sRUFBRSxJQUFJLElBQUksRUFBRSxJQUFJLEdBQUk7QUFBQSxFQUMvRTtBQUNBLFFBQU1FLFVBQVMsSUFBSSxJQUFJLENBQUMsR0FBRyxNQUFNO0FBQy9CLFFBQUksS0FBSyxHQUFHLElBQUk7QUFDaEIsYUFBUyxJQUFJLEtBQUssSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLEtBQUssS0FBSyxJQUFJLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLEtBQUs7QUFBRSxZQUFNLElBQUksQ0FBQyxFQUFFO0FBQUc7QUFBQSxJQUFLO0FBQ25HLFdBQU8sRUFBRSxHQUFHLEtBQUssR0FBRyxHQUFHLEVBQUUsRUFBRTtBQUFBLEVBQzdCLENBQUM7QUFFRCxFQUFBQSxRQUFPLFFBQVE7QUFDZixRQUFNLFNBQXVCLENBQUM7QUFDOUIsTUFBSSxJQUFJO0FBQ1IsV0FBUyxJQUFJLEdBQUcsSUFBSUEsUUFBTyxRQUFRLEtBQUs7QUFDdEMsUUFBSSxJQUFJLEVBQUcsTUFBSyxLQUFLLE1BQU1BLFFBQU8sQ0FBQyxFQUFFLElBQUlBLFFBQU8sSUFBSSxDQUFDLEVBQUUsR0FBR0EsUUFBTyxDQUFDLEVBQUUsSUFBSUEsUUFBTyxJQUFJLENBQUMsRUFBRSxDQUFDO0FBQ3ZGLFdBQU8sS0FBSyxFQUFFLEdBQUdBLFFBQU8sQ0FBQyxFQUFFLEdBQUcsR0FBR0EsUUFBTyxDQUFDLEVBQUUsR0FBRyxHQUFHLE9BQU8sR0FBRyxPQUFPLEVBQUUsQ0FBQztBQUFBLEVBQ3ZFO0FBQ0EsU0FBTyxJQUFJLFdBQVcsUUFBUSxFQUFFO0FBQ2xDO0FBR0EsSUFBTSxRQUFrRCxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBQ3pGLElBQU0saUJBQWlCO0FBT3ZCLFNBQVMsaUJBQWlCLE1BQWMsTUFFdEM7QUFDQSxRQUFNLE1BQU0sWUFBWSxPQUFPLFlBQWEsQ0FBQztBQUM3QyxRQUFNLElBQUksQ0FBQyxPQUFlLElBQUksSUFBSSxPQUFPLElBQUk7QUFDN0MsUUFBTSxRQUFRLEVBQUUsR0FBRyxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUssR0FBRyxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUs7QUFDdEUsUUFBTSxXQUFXO0FBQUEsSUFDZjtBQUFBLElBQ0EsRUFBRSxHQUFHLEtBQUssSUFBSSxLQUFLLEVBQUUsRUFBRSxHQUFHLEdBQUcsT0FBTyxFQUFFLEVBQUUsRUFBRTtBQUFBLElBQzFDLEVBQUUsR0FBRyxPQUFPLEVBQUUsRUFBRSxHQUFHLEdBQUcsT0FBTyxFQUFFLEVBQUUsRUFBRTtBQUFBLElBQ25DLEVBQUUsR0FBRyxPQUFPLEVBQUUsRUFBRSxHQUFHLEdBQUcsT0FBTyxFQUFFLEVBQUUsRUFBRTtBQUFBLElBQ25DLEVBQUUsR0FBRyxPQUFPLEVBQUUsRUFBRSxHQUFHLEdBQUcsT0FBTyxFQUFFLEVBQUUsRUFBRTtBQUFBLEVBQ3JDO0FBR0EsUUFBTSxRQUF5QyxDQUFDO0FBQ2hELFdBQVMsSUFBSSxHQUFHLElBQUksU0FBUyxTQUFTLEdBQUcsS0FBSztBQUM1QyxVQUFNLEtBQUssU0FBUyxLQUFLLElBQUksR0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFHLEtBQUssU0FBUyxDQUFDO0FBQ3hELFVBQU0sS0FBSyxTQUFTLElBQUksQ0FBQyxHQUFHLEtBQUssU0FBUyxLQUFLLElBQUksU0FBUyxTQUFTLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFDOUUsYUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUs7QUFDM0IsWUFBTSxJQUFJLElBQUksSUFBSSxLQUFLLElBQUksR0FBRyxLQUFLLEtBQUs7QUFDeEMsWUFBTSxLQUFLO0FBQUEsUUFDVCxHQUFHLE9BQU8sSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLElBQUksR0FBRyxLQUFLLEtBQUssSUFBSSxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLLE1BQy9FLENBQUMsR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUFBLFFBQzNDLEdBQUcsT0FBTyxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsSUFBSSxHQUFHLEtBQUssS0FBSyxJQUFJLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUssTUFDL0UsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQUEsTUFDN0MsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNGO0FBQ0EsUUFBTSxLQUFLLFNBQVMsU0FBUyxTQUFTLENBQUMsQ0FBQztBQUN4QyxRQUFNLFlBQXdELENBQUMsRUFBRSxHQUFHLE1BQU0sQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQ3BGLE1BQUksTUFBTSxHQUFHLElBQUk7QUFDakIsV0FBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUNyQyxVQUFNLE9BQU8sS0FBSyxNQUFNLE1BQU0sQ0FBQyxFQUFFLElBQUksTUFBTSxJQUFJLENBQUMsRUFBRSxHQUFHLE1BQU0sQ0FBQyxFQUFFLElBQUksTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDO0FBQ2hGLFdBQU87QUFBTSxTQUFLO0FBQ2xCLFFBQUksT0FBTyxLQUFLLE1BQU0sTUFBTSxTQUFTLEdBQUc7QUFDdEMsWUFBTSxLQUFLLEtBQUssSUFBSSxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQ3JELGdCQUFVLEtBQUssRUFBRSxHQUFHLE1BQU0sQ0FBQyxFQUFFLElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDO0FBQ3RELFlBQU07QUFBQSxJQUNSO0FBQUEsRUFDRjtBQUNBLFFBQU0sUUFBUSxVQUFVLFVBQVUsU0FBUyxDQUFDLEVBQUU7QUFDOUMsUUFBTSxVQUFVLENBQUMsT0FBdUI7QUFDdEMsUUFBSSxRQUFRLEtBQUs7QUFDakIsZUFBVyxDQUFDLE1BQU0sSUFBSSxLQUFLLE9BQU87QUFFaEMsZUFBUyxPQUFPLFdBQVcsUUFBUSxPQUFPLEdBQUcsUUFBUSxPQUFPLEdBQUcsRUFBRTtBQUFBLElBQ25FO0FBRUEsV0FBTyxLQUFLLEtBQUssSUFBSSxRQUFRLEtBQUs7QUFBQSxFQUNwQztBQUNBLFFBQU0sU0FBdUIsVUFBVSxJQUFJLENBQUMsT0FBTztBQUFBLElBQ2pELEdBQUcsRUFBRTtBQUFBLElBQUcsR0FBRyxFQUFFO0FBQUEsSUFBRyxHQUFHLEVBQUU7QUFBQSxJQUFHLE9BQU8sS0FBSyxJQUFJLEdBQUcsUUFBUSxFQUFFLENBQUMsQ0FBQztBQUFBLElBQ3ZELE9BQU8sTUFBTSxNQUFNLEtBQUssRUFBRSxJQUFJLElBQUksS0FBSyxPQUFPLEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRSxJQUFJLFNBQVM7QUFBQSxFQUM5RSxFQUFFO0FBQ0YsUUFBTSxTQUFTLE9BQU8sT0FBTyxTQUFTLENBQUM7QUFDdkMsU0FBTztBQUFBLElBQ0wsT0FBTyxJQUFJLFdBQVcsUUFBUSxHQUFHO0FBQUEsSUFDakMsTUFBTSxFQUFFLEdBQUcsT0FBTyxHQUFHLEdBQUcsT0FBTyxHQUFHLEdBQUcsSUFBSSxPQUFPLE9BQU8sTUFBTTtBQUFBLEVBQy9EO0FBQ0Y7OztBQzVUTyxJQUFNLE1BQU07QUFBQSxFQUNqQixLQUFLO0FBQUEsRUFDTCxPQUFPO0FBQUEsRUFDUCxNQUFNO0FBQUEsRUFDTixNQUFNO0FBQUEsRUFDTixRQUFRO0FBQUEsRUFDUixPQUFPO0FBQUEsRUFDUCxLQUFLO0FBQUEsRUFDTCxPQUFPO0FBQUEsRUFDUCxTQUFTO0FBQUEsRUFDVCxNQUFNO0FBQUE7QUFBQSxFQUVOLE1BQU07QUFDUjtBQUdPLElBQU0sVUFBVSxDQUFDLE1BQXVCLE1BQU0sSUFBSSxPQUFPLE1BQU0sSUFBSTs7O0FDRm5FLElBQU0sY0FBYztBQUNwQixJQUFNLGdCQUFnQjtBQWF0QixJQUFNLFlBQU4sTUFBZ0I7QUFBQSxFQUNyQixZQUNXLE1BQ1EsSUFDUixXQUNUO0FBSFM7QUFDUTtBQUNSO0FBQUEsRUFDUjtBQUFBLEVBSFE7QUFBQSxFQUNRO0FBQUEsRUFDUjtBQUFBO0FBQUEsRUFJWCxXQUFXLEdBQVcsR0FBbUI7QUFDdkMsVUFBTSxRQUFRLFdBQVcsTUFBTSxNQUFNLENBQUM7QUFFdEMsVUFBTSxXQUFXLEtBQUssTUFBTSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsQ0FBQztBQUMzRCxVQUFNLE9BQU8sV0FBVyxVQUFVLFdBQVcsSUFBSSxDQUFDO0FBQ2xELFVBQU0sT0FBTyxXQUFXLEtBQUssS0FBSyxDQUFDO0FBQ25DLFdBQU8sS0FBSyxJQUFJLE9BQU8sTUFBTSxJQUFJO0FBQUEsRUFDbkM7QUFBQTtBQUFBLEVBR0EsV0FBVyxHQUFXLEdBQW1CO0FBQ3ZDLFVBQU0sUUFBUSxXQUFXLE1BQU0sTUFBTSxDQUFDO0FBQ3RDLFVBQU0sV0FBVyxLQUFLLE1BQU0sTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLENBQUM7QUFDM0QsVUFBTSxPQUFPLFdBQVcsV0FBVyxJQUFJLFdBQVcsS0FBSyxDQUFDO0FBQ3hELFVBQU0sT0FBTyxXQUFXLEtBQUssS0FBSyxDQUFDO0FBQ25DLFdBQU8sS0FBSyxJQUFJLE9BQU8sTUFBTSxJQUFJO0FBQUEsRUFDbkM7QUFBQSxFQUVBLE9BQU8sR0FBVyxHQUFxQjtBQUNyQyxVQUFNLE9BQU8sS0FBSztBQUNsQixVQUFNLE9BQU8sS0FBSyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQy9CLFVBQU0sT0FBTyxLQUFLLFdBQVcsR0FBRyxDQUFDO0FBQ2pDLFFBQUksSUFBSTtBQUVSLFFBQUksT0FBTyxHQUFHO0FBRVosWUFBTSxZQUFZLFdBQVcsTUFBTSxNQUFNLENBQUM7QUFDMUMsWUFBTSxRQUFRLElBQUksS0FBSyxPQUFPLElBQUksT0FBTyxNQUFNLElBQUksT0FBTyxHQUFHLEtBQ3hELEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLE9BQU87QUFDcEQsWUFBTSxRQUFRLFdBQVcsR0FBSyxNQUFNLEtBQUssSUFBSTtBQUM3QyxZQUFNLFNBQVMsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLElBQUksSUFBSSxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksT0FBTyxLQUFLLENBQUMsQ0FBQyxHQUFHLEtBQUs7QUFHNUYsWUFBTSxLQUFLLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLE9BQU8sS0FBSyxDQUFDLElBQUksT0FBTztBQUMvRCxZQUFNLEtBQUssS0FBSyxLQUFLLElBQUksTUFBTSxLQUFLLElBQUksTUFBTSxLQUFLLE9BQU8sS0FBSyxDQUFDLElBQUksT0FBTztBQUMzRSxZQUFNLEtBQUssSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDO0FBQ3ZFLFlBQU0sS0FBSyxJQUFJLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUM7QUFDckUsWUFBTSxPQUFPLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxPQUFPLEtBQUssQ0FBQztBQUNuRCxZQUFNLFFBQVEsS0FBSyxXQUFXLEdBQUcsQ0FBQztBQUNsQyxVQUFJLFdBQVcsTUFBTSxJQUFJLEtBQUssVUFBVSxPQUFPLEtBQUssS0FBSyxPQUFPLEtBQUssT0FBTyxRQUN4RSxLQUFLLFFBQVEsV0FBVyxNQUFNLEtBQUssRUFBRTtBQUN6QyxZQUFNLE9BQU8sSUFBSSxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxPQUFPLEtBQUssQ0FBQztBQUN6RCxZQUFNLElBQUksS0FBSyxNQUFNLFdBQVcsSUFBSTtBQUNwQyxZQUFNLE9BQU8sV0FBVyxPQUFPO0FBQy9CLGtCQUFZLElBQUksV0FBVyxLQUFLLEtBQUssSUFBSSxLQUFLO0FBRzlDLFlBQU0sYUFBYSxXQUFXLElBQUksR0FBRyxNQUFNO0FBQzNDLFVBQUksS0FBSyxRQUFRLEtBQUssSUFBSSxRQUFRLFFBQVEsR0FBRyxPQUFPLFVBQVU7QUFBQSxJQUNoRTtBQUVBLFFBQUksUUFBUSxJQUFJLElBQUksSUFBSTtBQUN4QixRQUFJLFVBQVU7QUFHZCxVQUFNLFFBQVEsS0FBSyxVQUFVO0FBQzdCLFFBQUksT0FBTztBQUNULFlBQU0sTUFBTSxNQUFNLFFBQVEsR0FBRyxDQUFDO0FBQzlCLFVBQUksS0FBSztBQUNQLGNBQU0sU0FBUyxJQUFJLFFBQVE7QUFDM0IsY0FBTSxLQUFLLEtBQUssS0FBSyxLQUFLLElBQUksSUFBSSxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUM7QUFDeEQsY0FBTSxRQUFRLElBQUksUUFBUSxNQUFNLE1BQU0sS0FBSyxJQUFJLElBQUksSUFBSSxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksSUFBSSxJQUFJO0FBQ3BGLGNBQU0sSUFBSSxXQUFXLEtBQUssS0FBSyxJQUFJLElBQUksQ0FBQztBQUN4QyxZQUFJLEtBQUssSUFBSSxHQUFHLEtBQUssT0FBTyxHQUFHLENBQUMsQ0FBQztBQUNqQyxjQUFNLElBQUksSUFBSTtBQUNkLFlBQUksVUFBVSxJQUFJLElBQUksSUFBSSxHQUFHO0FBRzNCLGNBQUksS0FBSyxJQUFJLEdBQUcsS0FBSyxLQUFLLElBQUksS0FBSyxJQUFJLENBQUM7QUFBQSxRQUMxQztBQUNBLFlBQUksSUFBSSxJQUFJLEdBQUc7QUFDYixnQkFBTSxNQUFNLElBQUksU0FBUyxNQUFNLE9BQU8sSUFBSSxJQUFJLElBQUk7QUFDbEQsY0FBSSxLQUFLLElBQUksR0FBRyxHQUFHO0FBQ25CLGNBQUksT0FBUSxTQUFRLEtBQUssSUFBSSxPQUFPLEtBQUssTUFBTSxJQUFJLEtBQUssQ0FBQztBQUN6RCxvQkFBVTtBQUFBLFFBQ1o7QUFBQSxNQUNGO0FBQ0EsWUFBTSxPQUFPLEtBQUssVUFBVTtBQUM1QixVQUFJLE1BQU07QUFDUixjQUFNLEtBQUssS0FBSyxNQUFNLElBQUksS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLEtBQ3ZDLElBQUksT0FBTyxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSTtBQUN0RCxZQUFJLEtBQUssS0FBSyxJQUFJLEdBQUc7QUFDbkIsZ0JBQU0sTUFBTSxLQUFLLEtBQUssS0FBSyxLQUFLLElBQUk7QUFDcEMsY0FBSSxNQUFNLEtBQUssRUFBRyxLQUFJLEtBQUssSUFBSSxHQUFHLEdBQUc7QUFBQSxlQUNoQztBQUNILGdCQUFJLEtBQUssSUFBSSxLQUFLLElBQUksR0FBRyxHQUFHLEdBQUcsS0FBSyxRQUFRLElBQUksSUFBSSxXQUFXLEtBQUssR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUM3RSxvQkFBUSxLQUFLLElBQUksT0FBTyxLQUFLLE1BQU0sS0FBSyxLQUFLLENBQUM7QUFDOUMsc0JBQVU7QUFBQSxVQUNaO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBR0EsVUFBTSxNQUFNLEtBQUssVUFBVSxNQUFNLFFBQVEsR0FBRyxDQUFDO0FBQzdDLFFBQUksT0FBTyxJQUFJLElBQUksT0FBTyxLQUFLLEtBQUssT0FBTyxFQUFHLEtBQUk7QUFFbEQsUUFBSSxLQUFLLE1BQU0sTUFBTSxHQUFHLEtBQUssYUFBYSxDQUFDO0FBQzNDLFFBQUksSUFBSSxFQUFHLFNBQVEsS0FBSyxJQUFJLE9BQU8sQ0FBQztBQUNwQyxXQUFPLEVBQUUsR0FBRyxPQUFPLFVBQVUsWUFBWSxJQUFJLE9BQU8sUUFBUTtBQUFBLEVBQzlEO0FBQUEsRUFFQSxPQUFPLEdBQVcsR0FBbUI7QUFDbkMsV0FBTyxLQUFLLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFBQSxFQUMzQjtBQUFBO0FBQUEsRUFHQSxZQUNFLEdBQVcsR0FBVyxLQUFlLE9BQ3JDLE9BQ087QUFDUCxVQUFNLElBQUksSUFBSTtBQUNkLFFBQUksSUFBSSxXQUFXLElBQUksUUFBUSxFQUFHLFFBQU8sSUFBSTtBQUM3QyxVQUFNLFFBQVEsS0FBSyxVQUFVO0FBQzdCLFFBQUksU0FBUyxJQUFJLEdBQUc7QUFDbEIsWUFBTSxNQUFNLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFDOUIsVUFBSSxPQUFPLElBQUksSUFBSSxJQUFJLFFBQVEsT0FBTyxJQUFJLFFBQVEsTUFBTTtBQUN0RCxlQUFPLEtBQUssSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLLE9BQU8sS0FBSyxDQUFDLElBQUksTUFBTSxJQUFJLFNBQVMsSUFBSTtBQUFBLE1BQ3pFO0FBQUEsSUFDRjtBQUNBLFVBQU0sV0FBVyxlQUFlLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxLQUFLLE9BQU8sS0FBSyxDQUFDLElBQUksT0FBTztBQUNsRixRQUFJLEtBQUssWUFBWSxTQUFTLEVBQUcsUUFBTyxJQUFJO0FBQzVDLFFBQUksS0FBSyxXQUFXLEtBQUssU0FBUyxLQUFLLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxLQUFLLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBTSxRQUFPLElBQUk7QUFDbkcsUUFBSSxLQUFLLFdBQVcsR0FBRyxDQUFDLElBQUksT0FBTyxJQUFJLE1BQU0sU0FBUyxFQUFHLFFBQU8sSUFBSTtBQUNwRSxXQUFPLE1BQU0sR0FBRyxLQUFLO0FBQUEsRUFDdkI7QUFDRjs7O0FDakpPLElBQU0sYUFBYTtBQUNuQixJQUFNLE9BQU8sYUFBYTtBQUMxQixJQUFNLGFBQWE7QUFDbkIsSUFBTSxrQkFBa0IsYUFBYTtBQUNyQyxJQUFNLFFBQVE7QUFDZCxJQUFNLFFBQVE7QUFDZCxJQUFNLGVBQWUsUUFBUTtBQUM3QixJQUFNLFlBQVk7QUFHbEIsSUFBTSxvQkFBb0I7QUFFMUIsSUFBTSxlQUFlO0FBR3JCLElBQU0sK0JBQWtELENBQUMsbUJBQW1CLFlBQVk7QUFDeEYsSUFBTSx1QkFBdUIsQ0FBQyxNQUNuQyxPQUFPLE1BQU0sWUFBWSw2QkFBNkIsU0FBUyxDQUFDO0FBQzNELElBQU0sZUFBZSxhQUFhLGFBQWE7QUFDL0MsSUFBTSxhQUFhLGFBQWE7QUF1QmhDLElBQU0saUJBQThCO0FBQUEsRUFDekMsTUFBTTtBQUFBLEVBQ04sV0FBVztBQUFBLEVBQ1gsTUFBTTtBQUFBLEVBQ04sTUFBTTtBQUFBLEVBQ04sVUFBVTtBQUFBLEVBQ1Ysa0JBQWtCO0FBQ3BCO0FBc0JPLElBQU0sc0JBQXNCLG9CQUFJLElBQWdCO0FBQUEsRUFDckQ7QUFBQSxFQUFtQjtBQUFBLEVBQW9CO0FBQ3pDLENBQUM7QUFDTSxJQUFNLHFCQUFxQixDQUFDLFNBQThCLG9CQUFvQixJQUFJLElBQUk7QUErR3RGLElBQU0sV0FBVyxDQUFDLElBQVksT0FBZSxHQUFHLEVBQUUsSUFBSSxFQUFFO0FBQ3hELElBQU0sZUFBZSxDQUFDLE9BQWUsS0FBSyxhQUFhO0FBQ3ZELElBQU0sZUFBZSxDQUFDLE9BQWUsS0FBSyxhQUFhO0FBQ3ZELElBQU0sYUFBYSxDQUFDLElBQVksUUFBZ0IsT0FDckQsS0FBSyxLQUFLLGFBQWEsU0FBUztBQUMzQixJQUFNLGdCQUFnQixDQUFDLE1BQWMsS0FBSyxPQUFPLElBQUksUUFBUSxVQUFVO0FBQ3ZFLElBQU0sZ0JBQWdCLENBQUMsTUFBYyxLQUFLLE9BQU8sSUFBSSxRQUFRLFVBQVU7QUFDdkUsSUFBTSxnQkFBZ0IsQ0FBQyxNQUFjLEtBQUssY0FBYyxDQUFDLElBQUksYUFBYTtBQUMxRSxJQUFNLGdCQUFnQixDQUFDLE1BQWMsS0FBSyxjQUFjLENBQUMsSUFBSSxhQUFhO0FBQzFFLElBQU0sV0FBVyxDQUFDLE1BQWMsSUFBSTtBQUVwQyxTQUFTLFlBQVksT0FBTyxNQUFNLG1CQUFtQixtQkFBMEI7QUFDcEYsTUFBSSxDQUFDLHFCQUFxQixnQkFBZ0IsRUFBRyxPQUFNLElBQUksTUFBTSxpQ0FBaUMsZ0JBQWdCLEVBQUU7QUFDaEgsU0FBTztBQUFBLElBQ0w7QUFBQSxJQUNBLFFBQVEsRUFBRSxHQUFHLGdCQUFnQixpQkFBaUI7QUFBQSxJQUM5QyxRQUFRLG9CQUFJLElBQUk7QUFBQSxJQUNoQixVQUFVLG9CQUFJLElBQUk7QUFBQSxJQUNsQixjQUFjLG9CQUFJLElBQUk7QUFBQSxJQUN0QixlQUFlLG9CQUFJLElBQUk7QUFBQSxJQUN2QixnQkFBZ0Isb0JBQUksSUFBSTtBQUFBLElBQ3hCLFlBQVksb0JBQUksSUFBSTtBQUFBLElBQ3BCLE9BQU8sQ0FBQztBQUFBLElBQ1IsU0FBUztBQUFBLElBQ1QsT0FBTyxvQkFBSSxJQUFJO0FBQUEsSUFDZixXQUFXLENBQUM7QUFBQSxJQUNaLE9BQU8sb0JBQUksSUFBSTtBQUFBLElBQ2YsT0FBTztBQUFBLE1BQ0wsaUJBQWlCO0FBQUEsTUFBRyxlQUFlO0FBQUEsTUFBRyxjQUFjO0FBQUEsTUFBRyxjQUFjO0FBQUEsTUFDckUsVUFBVTtBQUFBLE1BQUcsT0FBTztBQUFBLE1BQUcsV0FBVztBQUFBLE1BQUcsY0FBYztBQUFBLElBQ3JEO0FBQUEsSUFDQSxnQkFBZ0I7QUFBQSxJQUNoQixVQUFVO0FBQUEsRUFDWjtBQUNGO0FBZU8sSUFBTSxVQUF3QjtBQUFBLEVBQ25DLEVBQUUsSUFBSSxXQUFXLE9BQU8sa0JBQWtCLE1BQU0sU0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksS0FBSyxJQUFJLEdBQUc7QUFBQSxFQUN2RixFQUFFLElBQUksWUFBWSxPQUFPLFlBQVksTUFBTSxVQUFVLElBQUksS0FBSyxJQUFJLE1BQU0sSUFBSSxLQUFLLElBQUksSUFBSTtBQUFBLEVBQ3pGLEVBQUUsSUFBSSxTQUFTLE9BQU8sbUJBQW1CLE1BQU0sWUFBWSxJQUFJLE1BQU0sSUFBSSxNQUFNLElBQUksS0FBSyxJQUFJLElBQUk7QUFBQSxFQUNoRyxFQUFFLElBQUksUUFBUSxPQUFPLGVBQWUsTUFBTSxTQUFTLElBQUksTUFBTSxJQUFJLE1BQU0sSUFBSSxLQUFLLElBQUksR0FBRztBQUFBLEVBQ3ZGLEVBQUUsSUFBSSxjQUFjLE9BQU8sZUFBZSxNQUFNLFNBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQUEsRUFDNUYsRUFBRSxJQUFJLFlBQVksT0FBTyxhQUFhLE1BQU0sU0FBUyxJQUFJLE1BQU0sSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLElBQUk7QUFBQSxFQUN6RixFQUFFLElBQUksU0FBUyxPQUFPLGdCQUFnQixNQUFNLFNBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQ3RGO0FBRU8sU0FBUyxhQUFhLEdBQW1CO0FBRzlDLFNBQU8sTUFBTSxLQUFLLEtBQUssS0FBSyxJQUFJLE9BQU8sR0FBRyxJQUFJLEtBQUssS0FBSyxLQUFLLElBQUksTUFBTSxFQUFFO0FBQzNFO0FBRU8sU0FBUyxjQUFjLEdBQVcsR0FBbUI7QUFDMUQsU0FBTyxLQUFLLElBQUksSUFBSSxhQUFhLENBQUMsQ0FBQztBQUNyQztBQUVPLFNBQVMsYUFBYSxHQUFXLEdBQW1CO0FBQ3pELFNBQU8sS0FBSyxPQUFPLElBQUksT0FBTyxRQUFRLE1BQU0sSUFBSSxPQUFPLE9BQU8sQ0FBQztBQUNqRTtBQVlPLFNBQVMsZ0JBQWdCLE1BQWMsR0FBVyxHQUFtQjtBQUcxRSxRQUFNLEtBQUssS0FDTixLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPLE9BQy9DLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLE9BQU87QUFDbEQsUUFBTSxLQUFLLEtBQ04sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLE9BQU8sT0FDM0QsS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLE9BQU87QUFFOUQsUUFBTSxTQUFTLEtBQUssTUFBTSxLQUFLLFFBQVEsS0FBSyxLQUFLLFFBQVEsQ0FBQztBQUMxRCxRQUFNLGNBQWMsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDLElBQUksT0FBTyxRQUNoRSxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQ3BELFFBQU0sV0FBVyxJQUFNLFNBQVM7QUFDaEMsUUFBTSxTQUFTLFdBQVcsT0FBTyxNQUFNLFFBQVE7QUFFL0MsUUFBTSxhQUFhLE1BQU0sSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUM7QUFJbkUsUUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUM7QUFDN0QsUUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBQ3hELFFBQU0sUUFBUSxNQUFNLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUNsRCxNQUFNLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQztBQUs1QyxRQUFNLGNBQWMsS0FBSyxLQUFLLE1BQU0sSUFBSSxLQUFLLE1BQU0sR0FBRyxPQUFPLEtBQUssQ0FBQztBQUNuRSxRQUFNLGFBQWEsV0FBVyxLQUFNLE1BQU0sV0FBVztBQUNyRCxRQUFNLFFBQVEsSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDO0FBQzFFLFFBQU0sU0FBUyxJQUFJLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUM7QUFDekUsUUFBTSxTQUFTLEtBQUssSUFBSSxJQUFJLEtBQUssT0FBTyxRQUFRLE1BQU0sS0FBSyxPQUFPLFFBQVEsRUFBRTtBQUM1RSxRQUFNLFFBQVEsS0FBSyxJQUFJLEdBQUcsY0FBYyxNQUFPLE1BQU8sVUFBVSxPQUFPLE1BQU07QUFFN0UsTUFBSSxJQUFJLFFBQVEsUUFBUSxRQUNwQixTQUFTLEtBQUssS0FBSyxRQUFRLFFBQVEsS0FBSztBQUs1QyxRQUFNLE9BQU8sSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDO0FBQ3ZFLFFBQU0sUUFBUSxLQUFLLElBQUksSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxHQUFHLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7QUFDOUYsUUFBTSxPQUFPLFFBQVEsSUFBTSxRQUFRO0FBRW5DLE1BQUksY0FBYyxJQUFJLGNBQWM7QUFDcEMsT0FBSyxNQUFNLFdBQVcsR0FBSyxLQUFNLFFBQVE7QUFNekMsUUFBTSxLQUFLLGNBQWMsSUFBSSxFQUFFO0FBQy9CLFFBQU0sU0FBUyxXQUFXLElBQUksSUFBSSxFQUFFLElBQUksV0FBVyxHQUFLLEtBQU0sUUFBUTtBQUN0RSxRQUFNLGNBQWMsTUFBTSxJQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQztBQUNwRSxNQUFJLEtBQUssR0FBRyxhQUFhLFNBQVMsSUFBSTtBQUN0QyxRQUFNLFNBQVMsSUFBTSxJQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQztBQUsvRCxRQUFNLFVBQVUsV0FBVyxTQUFTLElBQUksU0FBUyxLQUFLLEVBQUU7QUFDeEQsTUFBSSxXQUFXLEVBQUssS0FBSSxLQUFLLEdBQUcsSUFBTSxVQUFVLElBQUk7QUFHcEQsUUFBTSxRQUFRLGFBQWEsSUFBSSxFQUFFLEtBQzVCLElBQUksUUFBUSxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQ2hFLE1BQUksUUFBUSxNQUFNO0FBQ2hCLFVBQU0sV0FBVyxXQUFXLE1BQU0sTUFBTSxLQUFLO0FBQzdDLFFBQUksS0FBSyxHQUFHLE1BQU0sV0FBVyxJQUFJO0FBQUEsRUFDbkM7QUFLQSxRQUFNLFNBQVMsS0FBSyxPQUFPLElBQUksS0FBSyxPQUFPLE1BQU0sSUFBSSxLQUFLLE9BQU8sQ0FBQyxLQUM3RCxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQ2xELFFBQU0sUUFBUSxXQUFXLE1BQU0sTUFBTSxNQUFNO0FBQzNDLE1BQUksUUFBUSxHQUFHO0FBQ2IsVUFBTSxTQUFTLEtBQU8sTUFBTSxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxJQUFJO0FBQ3RFLFFBQUksS0FBSyxHQUFHLFFBQVEsUUFBUSxJQUFJO0FBQUEsRUFDbEM7QUFFQSxTQUFPLEtBQUssTUFBTSxNQUFNLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFDckM7QUFFQSxTQUFTLFFBQVEsTUFBYyxHQUFXLEdBQVcsR0FBbUI7QUFDdEUsU0FBTyxLQUFLO0FBQUEsSUFDVixLQUFLLElBQUksSUFBSSxnQkFBZ0IsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDNUMsS0FBSyxJQUFJLElBQUksZ0JBQWdCLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzVDLEtBQUssSUFBSSxJQUFJLGdCQUFnQixNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUM1QyxLQUFLLElBQUksSUFBSSxnQkFBZ0IsTUFBTSxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQUEsRUFDOUM7QUFDRjtBQUVBLFNBQVMsY0FBYyxNQUFjLEdBQVcsR0FBVyxHQUFXLE9BQWUsV0FBNEI7QUFJL0csTUFBSSxjQUFjLEdBQUcsQ0FBQyxJQUFJLE1BQU0sSUFBSSxZQUFZLEVBQUcsUUFBTyxJQUFJO0FBQzlELE1BQUksS0FBSyxZQUFZLElBQUssUUFBTyxJQUFJO0FBQ3JDLE1BQUksY0FBYyxRQUFXO0FBQzNCLGdCQUNFLGdCQUFnQixNQUFNLElBQUksR0FBRyxDQUFDLElBQUksWUFBWSxLQUM5QyxnQkFBZ0IsTUFBTSxJQUFJLEdBQUcsQ0FBQyxJQUFJLFlBQVksS0FDOUMsZ0JBQWdCLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxZQUFZLEtBQzlDLGdCQUFnQixNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksWUFBWTtBQUFBLEVBQ2xEO0FBQ0EsTUFBSSxhQUFhLEtBQUssWUFBWSxJQUFLLFFBQU8sSUFBSTtBQUNsRCxNQUFJLFNBQVMsRUFBRyxRQUFPLElBQUk7QUFDM0IsTUFBSSxJQUFJLE1BQU0sS0FBSyxJQUFJLElBQUksSUFBSSxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBTSxRQUFPLElBQUk7QUFDckUsTUFBSSxJQUFJLE1BQU0sU0FBUyxFQUFHLFFBQU8sSUFBSTtBQUNyQyxNQUFJLElBQUksTUFBTSxTQUFTLEtBQUssS0FBSyxJQUFJLElBQUksSUFBSSxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBTSxRQUFPLElBQUk7QUFDbkYsU0FBTyxJQUFJO0FBRWI7QUFTQSxTQUFTLFdBQVcsS0FBbUI7QUFDckMsTUFBSSxRQUFRLElBQUksU0FBUyxRQUFRLElBQUksS0FBTSxRQUFPLElBQUk7QUFDdEQsTUFBSSxRQUFRLElBQUksS0FBTSxRQUFPLElBQUk7QUFDakMsTUFBSSxRQUFRLElBQUksS0FBTSxRQUFPLElBQUk7QUFDakMsTUFBSSxRQUFRLElBQUksT0FBUSxRQUFPLElBQUk7QUFDbkMsU0FBTyxJQUFJO0FBQ2I7QUFFQSxTQUFTLE1BQU0sTUFBYyxHQUFXLEdBQVcsR0FBb0I7QUFDckUsUUFBTSxVQUFVLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQztBQUNsRCxNQUFJLFVBQVUsS0FBTSxRQUFPO0FBQzNCLFFBQU0sSUFBSSxZQUFZLElBQUksTUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNLE9BQU8sR0FBRztBQUM5RCxRQUFNLEtBQUssWUFBWSxJQUFJLE9BQU8sR0FBRyxJQUFJLE1BQU0sSUFBSSxPQUFPLEdBQUcsT0FBTyxHQUFHO0FBQ3ZFLFNBQU8sSUFBSSxPQUFRLEtBQUs7QUFDMUI7QUFFQSxTQUFTLE9BQU8sTUFBYyxHQUFXLEdBQVcsR0FBb0I7QUFDdEUsU0FBTyxLQUFLLElBQUksT0FBTyxJQUFJLE1BQU0sSUFBSSxPQUFPLE9BQU8sS0FBSyxDQUFDLElBQUk7QUFDL0Q7QUFFQSxTQUFTLFdBQVcsTUFBYyxHQUFXLEdBQVcsR0FBb0I7QUFDMUUsU0FBTyxZQUFZLElBQUksTUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNLE9BQU8sR0FBRyxJQUFJO0FBQ2pFO0FBR0EsSUFBTSxVQUFVLG9CQUFJLElBQXVCO0FBZ0JwQyxTQUFTLFVBQVUsTUFBeUI7QUFDakQsTUFBSSxNQUFNLFFBQVEsSUFBSSxJQUFJO0FBQzFCLE1BQUksQ0FBQyxLQUFLO0FBQ1IsVUFBTSxZQUFZLElBQUksVUFBVSxFQUFFLE1BQU0sU0FBUyxjQUFjLFVBQVUsQ0FBQyxHQUFHLE1BQU0sZ0JBQWdCLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUNoSCxVQUFNLElBQUksVUFBVSxNQUFNLGlCQUFpQixTQUFTO0FBQ3BELFlBQVEsSUFBSSxNQUFNLEdBQUc7QUFBQSxFQUN2QjtBQUNBLFNBQU87QUFDVDtBQUdPLFNBQVMsYUFBYSxNQUFjLFNBQWlCLEdBQVcsR0FBbUI7QUFDeEYsU0FBTyxXQUFXLGVBQWUsVUFBVSxJQUFJLEVBQUUsT0FBTyxHQUFHLENBQUMsSUFBSSxnQkFBZ0IsTUFBTSxHQUFHLENBQUM7QUFDNUY7QUFTQSxTQUFTLGVBQWUsTUFBYyxTQUFpQixHQUFXLEdBQVcsR0FBbUI7QUFDOUYsU0FBTyxLQUFLO0FBQUEsSUFDVixLQUFLLElBQUksSUFBSSxhQUFhLE1BQU0sU0FBUyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbEQsS0FBSyxJQUFJLElBQUksYUFBYSxNQUFNLFNBQVMsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2xELEtBQUssSUFBSSxJQUFJLGFBQWEsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUNsRCxLQUFLLElBQUksSUFBSSxhQUFhLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQUEsRUFDcEQ7QUFDRjtBQUdPLFNBQVMsbUJBQ2QsTUFBYyxTQUFpQixHQUFXLEdBQVcsR0FBVyxPQUFlLFdBQ3hFO0FBQ1AsTUFBSSxXQUFXLGNBQWM7QUFDM0IsVUFBTSxNQUFNLFVBQVUsSUFBSTtBQUMxQixXQUFPLElBQUk7QUFBQSxNQUFZO0FBQUEsTUFBRztBQUFBLE1BQUcsSUFBSSxPQUFPLEdBQUcsQ0FBQztBQUFBLE1BQUc7QUFBQSxNQUM3QyxDQUFDLElBQUksT0FBTyxjQUFjLE1BQU0sR0FBRyxHQUFHLElBQUksSUFBSSxTQUFTO0FBQUEsSUFBQztBQUFBLEVBQzVEO0FBQ0EsU0FBTyxjQUFjLE1BQU0sR0FBRyxHQUFHLEdBQUcsT0FBTyxTQUFTO0FBQ3REO0FBZ0JPLFNBQVMsWUFBWSxPQUFjLElBQVksSUFBK0I7QUFDbkYsTUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLE1BQU0sbUJBQW1CLE1BQU0sZ0JBQWlCLFFBQU87QUFDL0UsUUFBTSxNQUFNLFNBQVMsSUFBSSxFQUFFO0FBQzNCLFFBQU0sV0FBVyxNQUFNLE9BQU8sSUFBSSxHQUFHO0FBQ3JDLE1BQUksU0FBVSxRQUFPO0FBQ3JCLFNBQU8sY0FBYyxPQUFPLElBQUksRUFBRTtBQUNwQztBQUVPLFNBQVMsY0FBYyxPQUFjLElBQVksSUFBK0I7QUFDckYsTUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLE1BQU0sbUJBQW1CLE1BQU0sZ0JBQWlCLFFBQU87QUFDL0UsUUFBTSxXQUFXLE1BQU0sT0FBTyxJQUFJLFNBQVMsSUFBSSxFQUFFLENBQUM7QUFDbEQsTUFBSSxTQUFVLFFBQU87QUFDckIsUUFBTSxLQUFLLFlBQVksSUFBSTtBQUMzQixRQUFNLE9BQU8sa0JBQWtCLE1BQU0sTUFBTSxNQUFNLE9BQU8sa0JBQWtCLElBQUksRUFBRTtBQUNoRixTQUFPLGlCQUFpQixPQUFPLE1BQU0sWUFBWSxJQUFJLElBQUksRUFBRTtBQUM3RDtBQWtCTyxTQUFTLGtCQUFrQixNQUFjLFNBQWlCLElBQVksSUFBdUI7QUFDbEcsUUFBTSxPQUFPLElBQUksV0FBVyxZQUFZO0FBQ3hDLFFBQU0sVUFBVSxJQUFJLFdBQVcsVUFBVTtBQUN6QyxRQUFNLGVBQWUsSUFBSSxXQUFXLFVBQVU7QUFDOUMsUUFBTSxLQUFLLGFBQWEsRUFBRSxHQUFHLEtBQUssYUFBYSxFQUFFO0FBQ2pELFFBQU0sS0FBSyxXQUFXLGVBQWUsVUFBVSxJQUFJLElBQUk7QUFHdkQsUUFBTSxJQUFJO0FBQ1YsUUFBTSxLQUFLLGFBQWEsSUFBSTtBQUM1QixRQUFNLFFBQVEsSUFBSSxXQUFXLEtBQUssRUFBRTtBQUNwQyxRQUFNLFNBQTRCLEtBQUssSUFBSSxNQUFNLFVBQVUsSUFBSTtBQUMvRCxXQUFTLEtBQUssR0FBRyxLQUFLLElBQUksTUFBTTtBQUM5QixhQUFTLEtBQUssR0FBRyxLQUFLLElBQUksTUFBTTtBQUM5QixZQUFNLEtBQUssS0FBSyxLQUFLLEdBQUcsS0FBSyxLQUFLLEtBQUs7QUFDdkMsVUFBSSxJQUFJO0FBQ04sY0FBTSxNQUFNLEdBQUcsT0FBTyxJQUFJLEVBQUU7QUFDNUIsY0FBTSxLQUFLLEtBQUssRUFBRSxJQUFJLElBQUk7QUFDMUIsY0FBTSxLQUFLLEtBQUssR0FBRyxLQUFLLEtBQUs7QUFDN0IsWUFBSSxNQUFNLEtBQUssTUFBTSxLQUFLLEtBQUssY0FBYyxLQUFLLFdBQVksUUFBUSxLQUFLLGFBQWEsRUFBRSxJQUFJO0FBQUEsTUFDaEcsT0FBTztBQUNMLGNBQU0sS0FBSyxLQUFLLEVBQUUsSUFBSSxnQkFBZ0IsTUFBTSxJQUFJLEVBQUU7QUFBQSxNQUNwRDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBRUEsTUFBSSxTQUFTO0FBQ2IsV0FBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsWUFBTSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUs7QUFDOUIsWUFBTSxJQUFJLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxFQUFFO0FBQ3hDLFlBQU0sUUFBUSxLQUFLO0FBQUEsUUFDakIsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO0FBQUEsUUFDaEQsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO0FBQUEsUUFDaEQsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxDQUFDO0FBQUEsUUFDaEQsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxDQUFDO0FBQUEsTUFDbEQ7QUFDQSxZQUFNLFlBQ0osT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxJQUFJLFlBQVksS0FDbEQsT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxJQUFJLFlBQVksS0FDbEQsT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxJQUFJLFlBQVksS0FDbEQsT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxJQUFJLFlBQVk7QUFDcEQsWUFBTSxRQUFRLFNBQVMsT0FBTyxLQUFLLGFBQWEsRUFBRSxJQUFJO0FBQ3RELFlBQU0sTUFBTSxNQUFNLFFBQ2QsR0FBRyxZQUFZLElBQUksSUFBSSxPQUFPLE9BQU8sQ0FBQyxJQUFJLE9BQU8sY0FBYyxNQUFNLElBQUksSUFBSSxJQUFJLElBQUksU0FBUyxDQUFDLElBQy9GLGNBQWMsTUFBTSxJQUFJLElBQUksR0FBRyxPQUFPLFNBQVM7QUFDbkQsWUFBTSxNQUFNLFdBQVcsR0FBRztBQUMxQixZQUFNLGVBQWUsS0FBSyxLQUFLLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUk7QUFDN0QsWUFBTSxNQUFNLEtBQUssYUFBYTtBQUU5QixZQUFNLFFBQVE7QUFDZCxZQUFNLE1BQU0sS0FBSyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUM7QUFDckMsZUFBUyxJQUFJLE9BQU8sS0FBSyxLQUFLLEtBQUs7QUFDakMsY0FBTSxRQUFRLElBQUksSUFBSTtBQUN0QixZQUFJO0FBQ0osWUFBSSxNQUFNLE1BQU8sS0FBSSxJQUFJO0FBQUEsaUJBQ2hCLFVBQVUsRUFBRyxLQUFJO0FBQUEsaUJBQ2pCLFNBQVMsRUFBRyxLQUFJO0FBQUEsWUFDcEIsS0FBSSxJQUFJO0FBRWIsWUFBSSxNQUFNLElBQUksU0FBUyxRQUFRLEtBQUssZ0JBQWdCLE1BQU0sTUFBTSxJQUFJLEdBQUcsRUFBRSxHQUFHO0FBQzFFLGNBQUksSUFBSTtBQUFBLFFBQ1Y7QUFJQSxZQUFJLFNBQVMsS0FBSyxTQUFTLEtBQUssV0FBVyxNQUFNLElBQUksR0FBRyxFQUFFLEdBQUc7QUFDM0QsY0FBSSxJQUFJO0FBQUEsUUFDVjtBQUVBLFlBQUksTUFBTSxJQUFJLE9BQU8sUUFBUSxLQUFLLFFBQVEsTUFBTSxPQUFPLE1BQU0sSUFBSSxHQUFHLEVBQUUsR0FBRztBQUN2RSxjQUFJLElBQUk7QUFBQSxRQUNWO0FBRUEsWUFBSSxNQUFNLElBQUksS0FBSztBQUNqQixlQUFLLFdBQVcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSTtBQUN4QztBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBSUEsWUFBTSxhQUFhLFFBQVEsS0FBSyxJQUFJLE9BQU8sTUFBTSxLQUFLLElBQUk7QUFDMUQsVUFBSSxJQUFJLFlBQVk7QUFDbEIsaUJBQVMsSUFBSSxLQUFLLElBQUksT0FBTyxDQUFDLEdBQUcsSUFBSSxZQUFZLEtBQUs7QUFDcEQsZ0JBQU0sTUFBTSxXQUFXLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRTtBQUMxQyxjQUFJLEtBQUssR0FBRyxNQUFNLElBQUksS0FBSztBQUN6QixpQkFBSyxHQUFHLElBQUksSUFBSTtBQUNoQjtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUVBLFlBQU0sV0FBVyxLQUFLLElBQUksUUFBUSxHQUFHLEtBQUssSUFBSSxPQUFPLElBQUksQ0FBQyxDQUFDO0FBQzNELGNBQVEsR0FBRyxJQUFJLE1BQU0sV0FBVyxPQUFPLEdBQUcsZUFBZSxDQUFDO0FBQzFELG1CQUFhLEdBQUcsSUFBSTtBQUFBLElBQ3RCO0FBQUEsRUFDRjtBQUlBLFdBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNO0FBQ3RDLGFBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNO0FBQ3RDLFlBQU0sSUFBSSxPQUFPLEtBQUssS0FBSyxNQUFNLEtBQUssRUFBRTtBQUN4QyxZQUFNLFFBQVEsS0FBSztBQUFBLFFBQ2pCLEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxJQUFJLEVBQUUsQ0FBQztBQUFBLFFBQ2hELEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxJQUFJLEVBQUUsQ0FBQztBQUFBLFFBQ2hELEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxJQUFJLEtBQUssTUFBTSxLQUFLLEVBQUUsQ0FBQztBQUFBLFFBQ2hELEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxJQUFJLEtBQUssTUFBTSxLQUFLLEVBQUUsQ0FBQztBQUFBLE1BQ2xEO0FBQ0EsVUFBSSxRQUFRLEVBQUc7QUFDZixZQUFNLE9BQWdDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN2RSxpQkFBVyxDQUFDLElBQUksRUFBRSxLQUFLLE1BQU07QUFDM0IsY0FBTSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUs7QUFDOUIsWUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLE1BQU0sY0FBYyxNQUFNLFdBQVk7QUFDOUQsY0FBTSxLQUFLLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxFQUFFO0FBQ3pDLFlBQUksSUFBSSxLQUFLLEVBQUc7QUFDaEIsWUFBSSxPQUFPLElBQUksSUFBSSxLQUFLLElBQUksS0FBSyxHQUFHLE9BQU8sR0FBRyxJQUFJLEtBQU07QUFDeEQsY0FBTSxJQUFJLElBQUk7QUFDZCxZQUFJLElBQUksU0FBUyxLQUFLLEVBQUc7QUFDekIsY0FBTSxNQUFNLFdBQVcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFO0FBQzFDLFlBQUksS0FBSyxHQUFHLE1BQU0sSUFBSSxLQUFLO0FBQ3pCLGVBQUssR0FBRyxJQUFJLElBQUk7QUFDaEI7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBSUEsV0FBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsVUFBSSxXQUFXO0FBQ2YsVUFBSSxTQUFpQixhQUFhLEtBQUssYUFBYSxFQUFFO0FBQ3RELGVBQVMsSUFBSSxRQUFRLEdBQUcsS0FBSyxPQUFPLEtBQUs7QUFDdkMsY0FBTSxJQUFJLEtBQUssV0FBVyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUM5QyxZQUFJLFFBQVEsQ0FBQyxHQUFHO0FBQUUscUJBQVc7QUFBRyxtQkFBUztBQUFHO0FBQUEsUUFBTztBQUFBLE1BQ3JEO0FBQ0EsY0FBUSxLQUFLLGFBQWEsRUFBRSxJQUFJLE1BQU0sV0FBVyxPQUFPLEdBQUcsZUFBZSxDQUFDO0FBQzNFLG1CQUFhLEtBQUssYUFBYSxFQUFFLElBQUk7QUFBQSxJQUN2QztBQUFBLEVBQ0Y7QUFFQSxTQUFPLEVBQUUsSUFBSSxJQUFJLE1BQU0sU0FBUyxNQUFNLFNBQVMsY0FBYyxPQUFPO0FBQ3RFO0FBT08sU0FBUyxpQkFBaUIsT0FBYyxNQUFpQixlQUFlLEdBQXNCO0FBQ25HLE1BQUksS0FBSyxTQUFTLE1BQU0sUUFBUSxLQUFLLFlBQVksTUFBTSxPQUFPLGtCQUFrQjtBQUM5RSxVQUFNLElBQUksTUFBTSx1REFBdUQ7QUFBQSxFQUN6RTtBQUNBLFFBQU0sRUFBRSxJQUFJLElBQUksTUFBTSxTQUFTLGNBQWMsT0FBTyxJQUFJO0FBQ3hELE1BQUksS0FBSyxLQUFLLEtBQUssS0FBSyxNQUFNLG1CQUFtQixNQUFNLGdCQUFpQixRQUFPO0FBQy9FLFFBQU0sTUFBTSxTQUFTLElBQUksRUFBRTtBQUMzQixRQUFNLFdBQVcsTUFBTSxPQUFPLElBQUksR0FBRztBQUNyQyxNQUFJLFNBQVUsUUFBTztBQUNyQixRQUFNLFFBQW9CO0FBQUEsSUFDeEI7QUFBQSxJQUFJO0FBQUEsSUFBSTtBQUFBLElBQUs7QUFBQSxJQUFNO0FBQUEsSUFBUztBQUFBLElBQWM7QUFBQSxJQUMxQyxPQUFPO0FBQUEsSUFDUCxhQUFhLFlBQVksSUFBSTtBQUFBLEVBQy9CO0FBR0EsUUFBTSxRQUFRLE1BQU0sTUFBTSxJQUFJLEdBQUc7QUFDakMsTUFBSSxPQUFPO0FBQ1QsZUFBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLE9BQU87QUFDNUIsWUFBTSxLQUFLLEdBQUcsSUFBSTtBQUFBLElBQ3BCO0FBRUEsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsZUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLEtBQU0sbUJBQWtCLE9BQU8sSUFBSSxFQUFFO0FBQUEsSUFDekU7QUFBQSxFQUNGO0FBR0EsTUFBSSxlQUFlO0FBQ25CLGFBQVcsWUFBWSxNQUFNLEtBQU0sS0FBSSxhQUFhLElBQUksSUFBSztBQUM3RCxRQUFNLE1BQU0sZ0JBQWdCLGVBQWU7QUFFM0MsUUFBTSxPQUFPLElBQUksS0FBSyxLQUFLO0FBQzNCLFFBQU0sTUFBTTtBQUNaLFFBQU0sTUFBTSxnQkFBZ0I7QUFDNUIsUUFBTSxNQUFNLGdCQUFnQjtBQUM1QixRQUFNLE1BQU0sSUFBSSxHQUFHO0FBRW5CLG1CQUFpQixPQUFPLEtBQUs7QUFDN0IsU0FBTztBQUNUO0FBS0EsSUFBTSxrQkFBa0Isb0JBQUksUUFBK0U7QUFLcEcsU0FBUyxtQkFBbUIsTUFBYyxTQUFpQixJQUFZLElBQXlCO0FBQ3JHLFFBQU0sVUFBVSxFQUFFLFNBQVMsSUFBSSxXQUFXLFVBQVUsR0FBRyxjQUFjLElBQUksV0FBVyxVQUFVLEVBQUU7QUFDaEcsV0FBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsWUFBTSxJQUFJLGFBQWEsRUFBRSxJQUFJLElBQUksSUFBSSxhQUFhLEVBQUUsSUFBSTtBQUN4RCxZQUFNLElBQUksYUFBYSxNQUFNLFNBQVMsR0FBRyxDQUFDO0FBQzFDLFlBQU0sUUFBUSxXQUFXLGVBQ3JCLGVBQWUsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLElBQUksUUFBUSxNQUFNLEdBQUcsR0FBRyxDQUFDO0FBQ2xFLFlBQU0sUUFBUSxLQUFLLGFBQWE7QUFDaEMsY0FBUSxRQUFRLEtBQUssSUFBSSxNQUFNLElBQUksT0FBTyxHQUFHLGVBQWUsQ0FBQztBQUM3RCxjQUFRLGFBQWEsS0FBSyxJQUFJLFdBQVcsZUFDckMsbUJBQW1CLE1BQU0sU0FBUyxHQUFHLEdBQUcsR0FBRyxLQUFLLElBQ2hELGNBQWMsTUFBTSxHQUFHLEdBQUcsR0FBRyxLQUFLO0FBQUEsSUFDeEM7QUFBQSxFQUNGO0FBQ0EsU0FBTztBQUNUO0FBU0EsU0FBUyxZQUFZLE9BQWMsT0FBZ0M7QUFDakUsTUFBSSxRQUFRLGdCQUFnQixJQUFJLEtBQUs7QUFDckMsTUFBSSxDQUFDLE9BQU87QUFBRSxZQUFRLG9CQUFJLElBQUk7QUFBRyxvQkFBZ0IsSUFBSSxPQUFPLEtBQUs7QUFBQSxFQUFHO0FBQ3BFLFFBQU0sU0FBUyxNQUFNLElBQUksTUFBTSxHQUFHO0FBQ2xDLE1BQUksT0FBUSxRQUFPO0FBQ25CLFFBQU0sVUFBVSxtQkFBbUIsTUFBTSxNQUFNLE1BQU0sT0FBTyxrQkFBa0IsTUFBTSxJQUFJLE1BQU0sRUFBRTtBQUNoRyxRQUFNLElBQUksTUFBTSxLQUFLLE9BQU87QUFDNUIsU0FBTztBQUNUO0FBTUEsSUFBTSxlQUFlLG9CQUFJLFFBQXVCO0FBR3pDLFNBQVMsWUFBWSxPQUFzQjtBQUNoRCxTQUFPLGFBQWEsSUFBSSxLQUFLLEtBQUs7QUFDcEM7QUFHTyxTQUFTLGlCQUFpQixPQUFvQjtBQUNuRCxlQUFhLElBQUksT0FBTyxZQUFZLEtBQUssSUFBSSxDQUFDO0FBQ2hEO0FBNEJPLFNBQVMsV0FBVyxPQUFjLEtBQXNCO0FBQzdELE1BQUksQ0FBQyxNQUFNLE9BQU8sSUFBSSxHQUFHLEVBQUcsUUFBTztBQUNuQyxRQUFNLE9BQU8sT0FBTyxHQUFHO0FBQ3ZCLFFBQU0sTUFBTTtBQUdaLFNBQU87QUFDVDtBQWFPLFNBQVMsU0FBUyxPQUFjLEdBQVcsR0FBVyxHQUFXLEdBQW1CO0FBQ3pGLE1BQUksSUFBSSxTQUFTLEtBQUssTUFBTyxRQUFPO0FBQ3BDLE1BQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLEtBQUssS0FBTSxRQUFPO0FBQzdELFFBQU0sS0FBSyxjQUFjLENBQUMsR0FBRyxLQUFLLGNBQWMsQ0FBQztBQUNqRCxRQUFNLE1BQU0sV0FBVyxjQUFjLENBQUMsR0FBRyxTQUFTLENBQUMsR0FBRyxjQUFjLENBQUMsQ0FBQztBQUN0RSxRQUFNLGVBQWUsTUFBTSxNQUFNLElBQUksU0FBUyxJQUFJLEVBQUUsQ0FBQyxHQUFHLElBQUksR0FBRztBQUkvRCxNQUFJLGlCQUFpQixFQUFHLFFBQU87QUFDL0IsUUFBTSxRQUFRLFlBQVksT0FBTyxJQUFJLEVBQUU7QUFDdkMsTUFBSSxDQUFDLE1BQU8sUUFBTztBQUNuQixNQUFJLFFBQVEsTUFBTSxNQUFNLElBQUksTUFBTSxHQUFHO0FBQ3JDLE1BQUksQ0FBQyxPQUFPO0FBQUUsWUFBUSxvQkFBSSxJQUFJO0FBQUcsVUFBTSxNQUFNLElBQUksTUFBTSxLQUFLLEtBQUs7QUFBQSxFQUFHO0FBR3BFLE1BQUksTUFBTSxLQUFLLEdBQUcsTUFBTSxHQUFHO0FBQ3pCLFFBQUksQ0FBQyxNQUFNLElBQUksR0FBRyxFQUFHLE9BQU0sSUFBSSxLQUFLLENBQUM7QUFDckMsV0FBTztBQUFBLEVBQ1Q7QUFDQSxRQUFNLEtBQUssR0FBRyxJQUFJO0FBQ2xCLFFBQU0sSUFBSSxLQUFLLENBQUM7QUFDaEIsbUJBQWlCLEtBQUs7QUFDdEIsUUFBTSxRQUFRO0FBQ2QsUUFBTSxNQUFNLElBQUksTUFBTSxHQUFHO0FBQ3pCLFFBQU07QUFDTixvQkFBa0IsT0FBTyxjQUFjLENBQUMsR0FBRyxjQUFjLENBQUMsQ0FBQztBQUMzRCxTQUFPO0FBQ1Q7QUFFQSxTQUFTLGtCQUFrQixPQUFtQixJQUFZLElBQWtCO0FBQzFFLE1BQUksV0FBVztBQUNmLFdBQVMsSUFBSSxRQUFRLEdBQUcsS0FBSyxPQUFPLEtBQUs7QUFDdkMsUUFBSSxRQUFRLE1BQU0sS0FBSyxXQUFXLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBRztBQUFFLGlCQUFXO0FBQUc7QUFBQSxJQUFPO0FBQUEsRUFDbkY7QUFDQSxRQUFNLFFBQVEsS0FBSyxhQUFhLEVBQUUsSUFBSSxNQUFNLFdBQVcsT0FBTyxHQUFHLGVBQWUsQ0FBQztBQUNqRixRQUFNLEtBQUssTUFBTSxhQUFhLEtBQUssYUFBYSxFQUFFO0FBQ2xELE1BQUksWUFBWSxPQUFPO0FBQ3JCLFVBQU0sSUFBSSxNQUFNLEtBQUssV0FBVyxJQUFJLFNBQVMsUUFBUSxHQUFHLEVBQUUsQ0FBQztBQUMzRCxRQUFJLE1BQU0sSUFBSSxNQUFPLE9BQU0sYUFBYSxLQUFLLGFBQWEsRUFBRSxJQUFJO0FBQUEsRUFDbEUsT0FBTztBQUNMLFVBQU0sYUFBYSxLQUFLLGFBQWEsRUFBRSxJQUFJO0FBQUEsRUFDN0M7QUFDRjtBQU9PLFNBQVMsVUFBVSxPQUFjLEdBQVcsR0FBbUI7QUFDcEUsTUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsS0FBSyxLQUFNLFFBQU87QUFDN0QsUUFBTSxLQUFLLGNBQWMsQ0FBQyxHQUFHLEtBQUssY0FBYyxDQUFDO0FBQ2pELFFBQU0sUUFBUSxZQUFZLE9BQU8sSUFBSSxFQUFFO0FBQ3ZDLE1BQUksQ0FBQyxNQUFPLFFBQU87QUFDbkIsU0FBTyxNQUFNLFFBQVEsY0FBYyxDQUFDLElBQUksYUFBYSxjQUFjLENBQUMsQ0FBQyxJQUFJLFFBQVE7QUFDbkY7QUFFTyxTQUFTLG1CQUFtQixPQUFjLEdBQVcsR0FBa0I7QUFDNUUsTUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsS0FBSyxLQUFNLFFBQU8sSUFBSTtBQUNqRSxRQUFNLEtBQUssY0FBYyxDQUFDLEdBQUcsS0FBSyxjQUFjLENBQUM7QUFDakQsUUFBTSxRQUFRLFlBQVksT0FBTyxJQUFJLEVBQUU7QUFDdkMsTUFBSSxDQUFDLE1BQU8sUUFBTyxJQUFJO0FBQ3ZCLFNBQU8sTUFBTSxhQUFhLGNBQWMsQ0FBQyxJQUFJLGFBQWEsY0FBYyxDQUFDLENBQUM7QUFDNUU7QUF5QkEsU0FBUyxVQUFVLE9BQWMsR0FBaUI7QUFDaEQsTUFBSSxNQUFNLFNBQVMsSUFBSSxFQUFFLEVBQUUsS0FBTSxtQkFBbUIsRUFBRSxJQUFJLEtBQUssQ0FBQyxjQUFjLEtBQUssS0FDOUUsTUFBTSxlQUFlLElBQUksRUFBRSxFQUFFLEVBQUc7QUFDckMsUUFBTSxTQUFTLElBQUksRUFBRSxJQUFJLENBQUM7QUFDMUIsTUFBSSxPQUFPLE1BQU0sYUFBYSxJQUFJLEVBQUUsS0FBSztBQUN6QyxNQUFJLENBQUMsTUFBTTtBQUFFLFdBQU8sQ0FBQztBQUFHLFVBQU0sYUFBYSxJQUFJLEVBQUUsT0FBTyxJQUFJO0FBQUEsRUFBRztBQUMvRCxPQUFLLEtBQUssRUFBRSxFQUFFO0FBQ2QsUUFBTSxNQUFNLFdBQVcsTUFBTSxTQUFTO0FBSXhDO0FBMkJBLFNBQVMsU0FBUyxPQUFlLEdBQW1CO0FBQ2xELFNBQU8sS0FBSyxLQUFLLElBQUksQ0FBQztBQUN4QjtBQU1PLFNBQVMsWUFBWSxJQUFZLElBQVksTUFBc0I7QUFDeEUsUUFBTSxPQUFPLEtBQUssSUFBSSxJQUFJLEtBQUssT0FBTyxRQUFRLE1BQU0sS0FBSyxPQUFPLFFBQVEsRUFBRTtBQUMxRSxRQUFNLFFBQVEsS0FBSyxJQUFJLElBQUksS0FBSyxNQUFNLFFBQVEsTUFBTSxLQUFLLE9BQU8sUUFBUSxFQUFFO0FBQzFFLFFBQU0sT0FBTyxLQUFLLElBQUksSUFBSSxLQUFLLE9BQU8sUUFBUSxNQUFNLEtBQUssT0FBTyxRQUFRLEVBQUU7QUFDMUUsUUFBTSxRQUFRLEtBQUssSUFBSSxJQUFJLEtBQUssT0FBTyxRQUFRLE1BQU0sS0FBSyxPQUFPLFFBQVEsRUFBRTtBQUMzRSxRQUFNLFdBQVcsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBQ3ZELFFBQU0sU0FBUyxLQUFLLElBQUksR0FBRyxLQUFLLFFBQVEsS0FBSyxLQUFLLFFBQVEsRUFBRTtBQUM1RCxTQUFPLEtBQUssSUFBSSxNQUFNLFFBQVEsTUFBTSxPQUFPLEtBQU0sUUFBUSxJQUFJLElBQUksT0FDN0QsV0FBVyxPQUFPLE9BQU8sU0FBUztBQUN4QztBQUdPLFNBQVMsVUFBVSxJQUFZLElBQVksTUFBc0I7QUFDdEUsUUFBTSxXQUFXLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxPQUFPLEtBQUssQ0FBQztBQUN2RCxRQUFNLFFBQVEsSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDO0FBQzFFLFNBQU8sV0FBVyxPQUFPLFFBQVE7QUFDbkM7QUFFQSxTQUFTLGlCQUFpQixPQUFjLE9BQXlCO0FBQy9ELHNCQUFvQixPQUFPLE1BQU0sSUFBSSxNQUFNLEVBQUU7QUFDL0M7QUFHTyxTQUFTLG9CQUFvQixPQUFjLElBQVksSUFBa0I7QUFDOUUsUUFBTSxNQUFNLFNBQVMsSUFBSSxFQUFFO0FBQzNCLE1BQUksTUFBTSxhQUFhLElBQUksR0FBRyxFQUFHO0FBQ2pDLFFBQU0sUUFBUSxZQUFZLE9BQU8sSUFBSSxFQUFFO0FBQ3ZDLE1BQUksQ0FBQyxNQUFPO0FBRVosUUFBTSxNQUFNLFdBQVksT0FBTyxNQUFNLElBQUksTUFBTSxJQUFJLE1BQU0sT0FBTyxHQUFHLElBQUksZUFBZ0IsQ0FBQztBQUN4RixRQUFNLEtBQUssYUFBYSxNQUFNLEVBQUUsR0FBRyxLQUFLLGFBQWEsTUFBTSxFQUFFO0FBQzdELFFBQU0sVUFBVSxZQUFZLE9BQU8sS0FBSztBQUN4QyxNQUFJLElBQUk7QUFDUixNQUFJLGVBQWU7QUFDbkIsTUFBSSxtQkFBbUI7QUFFdkIsUUFBTSxlQUFlLENBQUMsSUFBWSxPQUF1QjtBQUN2RCxXQUFPLFFBQVEsUUFBUSxLQUFLLGFBQWEsRUFBRSxJQUFJO0FBQUEsRUFDakQ7QUFDQSxRQUFNLFdBQVcsQ0FBQyxJQUFZLE9BQXNCO0FBQ2xELFdBQU8sUUFBUSxhQUFhLEtBQUssYUFBYSxFQUFFO0FBQUEsRUFDbEQ7QUFDQSxRQUFNLGFBQWEsQ0FBQyxJQUFZLE9BQXVCO0FBQ3JELFVBQU0sSUFBSSxhQUFhLElBQUksRUFBRTtBQUM3QixXQUFPLEtBQUs7QUFBQSxNQUNWLEtBQUssSUFBSSxJQUFJLGFBQWEsTUFBTSxLQUFLLEdBQUcsR0FBRyxhQUFhLENBQUMsR0FBRyxFQUFFLENBQUM7QUFBQSxNQUMvRCxLQUFLLElBQUksSUFBSSxhQUFhLE1BQU0sS0FBSyxHQUFHLEdBQUcsYUFBYSxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQUEsTUFDL0QsS0FBSyxJQUFJLElBQUksYUFBYSxJQUFJLE1BQU0sS0FBSyxHQUFHLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQy9ELEtBQUssSUFBSSxJQUFJLGFBQWEsSUFBSSxNQUFNLEtBQUssR0FBRyxHQUFHLGFBQWEsQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUNqRTtBQUFBLEVBQ0Y7QUFHQSxXQUFTLEtBQUssR0FBRyxLQUFLLFlBQVksTUFBTSxHQUFHO0FBQ3pDLGFBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNLEdBQUc7QUFDekMsWUFBTSxLQUFLLE1BQU0sS0FBSyxNQUFNLEtBQUssS0FBSyxJQUFJLElBQUksT0FBTyxDQUFDLEdBQUcsR0FBRyxhQUFhLENBQUM7QUFDMUUsWUFBTSxLQUFLLE1BQU0sS0FBSyxNQUFNLEtBQUssS0FBSyxJQUFJLElBQUksT0FBTyxDQUFDLEdBQUcsR0FBRyxhQUFhLENBQUM7QUFDMUUsWUFBTSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUs7QUFDOUIsWUFBTSxJQUFJLGFBQWEsSUFBSSxFQUFFO0FBQzdCLFVBQUksS0FBSyxZQUFZLEVBQUc7QUFDeEIsWUFBTSxRQUFRLFdBQVcsSUFBSSxFQUFFO0FBQy9CLFlBQU0sTUFBTSxTQUFTLElBQUksRUFBRTtBQUMzQixVQUFJLFFBQVEsSUFBSSxNQUFPO0FBQ3ZCLFlBQU0sU0FBUyxZQUFZLElBQUksSUFBSSxNQUFNLElBQUk7QUFDN0MsWUFBTSxRQUFRLFVBQVUsSUFBSSxJQUFJLE1BQU0sSUFBSTtBQUMxQyxZQUFNLE9BQU8sSUFBSTtBQUVqQixZQUFNLGFBQWEsU0FBUyxNQUFPLE9BQU8sU0FBUyxNQUFPLE9BQU87QUFDakUsVUFBSSxRQUFRLElBQUksU0FBUyxTQUFTLEtBQUssT0FBTyxZQUFZO0FBR3hELFlBQUk7QUFDSixZQUFJO0FBQ0osY0FBTSxjQUFjLElBQUk7QUFDeEIsWUFBSSxjQUFjLE1BQU07QUFDdEIsY0FBSyxtQkFBbUIsSUFBSyxRQUFRLGVBQWUsSUFBSTtBQUN0RCxtQkFBTztBQUNQLHNCQUFVLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQztBQUM5QixrQkFBTSxNQUFNO0FBQUEsVUFDZCxPQUFPO0FBQ0wsbUJBQU87QUFDUCxzQkFBVSxLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUM7QUFDOUI7QUFDQSxrQkFBTSxNQUFNO0FBQUEsVUFDZDtBQUFBLFFBQ0YsV0FBVyxjQUFjLEtBQU07QUFDN0IsaUJBQU87QUFDUCxvQkFBVSxLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUM7QUFBQSxRQUNoQyxXQUFXLGNBQWMsTUFBTTtBQUM3QixpQkFBTztBQUNQLG9CQUFVLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQztBQUFBLFFBQ2hDLE9BQU87QUFDTCxpQkFBTztBQUNQLG9CQUFVLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQztBQUFBLFFBQ2hDO0FBQ0E7QUFDQSxjQUFNLE1BQU07QUFDWixrQkFBVSxPQUFPO0FBQUEsVUFDZixJQUFJLFNBQVMsTUFBTSxLQUFLLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFVBQU0sT0FBTyxNQUFNO0FBQUEsVUFBSyxHQUFHLEtBQUs7QUFBQSxVQUFLLEdBQUc7QUFBQSxVQUFHLEdBQUcsS0FBSztBQUFBLFVBQ25ELEtBQUssS0FBSyxNQUFNLElBQUksSUFBSSxFQUFFLEtBQUssS0FBSyxLQUFLO0FBQUEsVUFDekMsT0FBTyxPQUFPLElBQUksSUFBSTtBQUFBLFVBQU07QUFBQSxVQUM1QixVQUFVO0FBQUEsVUFBUSxXQUFXO0FBQUEsVUFBSSxpQkFBaUI7QUFBQSxVQUNsRCxXQUFXO0FBQUEsVUFBTyxhQUFhO0FBQUEsVUFBTSxVQUFVO0FBQUEsUUFDakQsQ0FBQztBQUNEO0FBQUEsTUFDRjtBQUNBLFVBQUksUUFBUSxJQUFJLFNBQVMsUUFBUSxRQUFRLE9BQU8sTUFBTTtBQUlwRCxjQUFNLFdBQVcsSUFBSTtBQUNyQixjQUFNLE9BQW1CLFdBQVcsT0FBTyxvQkFDdkMsV0FBVyxNQUFPLHFCQUFxQjtBQUMzQyxjQUFNLEtBQUssU0FBUyxNQUFNLEtBQUssR0FBRztBQUNsQyxjQUFNLFNBQVM7QUFBQSxVQUNiO0FBQUEsVUFBSTtBQUFBLFVBQU0sT0FBTyxNQUFNO0FBQUEsVUFBSyxHQUFHLEtBQUs7QUFBQSxVQUFLLEdBQUc7QUFBQSxVQUFHLEdBQUcsS0FBSztBQUFBLFVBQ3ZELFVBQVU7QUFBQSxVQUNWLFdBQVcsU0FBUyxvQkFBb0IsSUFBSSxTQUFTLHFCQUFxQixJQUFJO0FBQUEsVUFDOUUsaUJBQWlCO0FBQUEsVUFBRyxXQUFXO0FBQUEsVUFBTyxhQUFhO0FBQUEsVUFBTSxVQUFVO0FBQUEsVUFDbkUsS0FBSyxLQUFLLE1BQU0sSUFBSSxJQUFJLEVBQUUsS0FBSyxLQUFLLEtBQUs7QUFBQSxVQUN6QyxPQUFPLE1BQU0sSUFBSSxJQUFJO0FBQUEsVUFBSyxTQUFTLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQztBQUFBLFFBQ3pEO0FBR0EsWUFBSSxjQUFjLEtBQUssRUFBRyxXQUFVLE9BQU8sTUFBTTtBQUNqRDtBQUFBLE1BQ0Y7QUFDQSxVQUFJLFFBQVEsSUFBSSxTQUFTLFFBQVEsUUFBUSxPQUFPLE1BQU07QUFDcEQsa0JBQVUsT0FBTztBQUFBLFVBQ2YsSUFBSSxTQUFTLE1BQU0sS0FBSyxHQUFHO0FBQUEsVUFDM0IsTUFBTTtBQUFBLFVBQVksT0FBTyxNQUFNO0FBQUEsVUFBSyxHQUFHLEtBQUs7QUFBQSxVQUFLLEdBQUc7QUFBQSxVQUFHLEdBQUcsS0FBSztBQUFBLFVBQy9ELEtBQUssS0FBSyxNQUFNLElBQUksSUFBSSxFQUFFLEtBQUssS0FBSyxLQUFLO0FBQUEsVUFDekMsT0FBTyxNQUFNLElBQUksSUFBSTtBQUFBLFVBQUssU0FBUyxLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUM7QUFBQSxVQUN2RCxVQUFVO0FBQUEsVUFBTyxXQUFXO0FBQUEsVUFBRyxpQkFBaUI7QUFBQSxVQUNoRCxXQUFXO0FBQUEsVUFBTyxhQUFhO0FBQUEsVUFBTSxVQUFVO0FBQUEsUUFDakQsQ0FBQztBQUNEO0FBQUEsTUFDRjtBQUNBLFVBQUksUUFBUSxJQUFJLFNBQVMsU0FBUyxLQUFLLE9BQU8sS0FBTTtBQUNsRCxrQkFBVSxPQUFPO0FBQUEsVUFDZixJQUFJLFNBQVMsTUFBTSxLQUFLLEdBQUc7QUFBQSxVQUMzQixNQUFNO0FBQUEsVUFBYyxPQUFPLE1BQU07QUFBQSxVQUFLLEdBQUcsS0FBSztBQUFBLFVBQUssR0FBRztBQUFBLFVBQUcsR0FBRyxLQUFLO0FBQUEsVUFDakUsS0FBSyxLQUFLLE1BQU0sSUFBSSxJQUFJLEVBQUUsS0FBSyxLQUFLLEtBQUs7QUFBQSxVQUN6QyxPQUFPLE1BQU0sSUFBSSxJQUFJO0FBQUEsVUFBSyxTQUFTLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQztBQUFBLFVBQ3ZELFVBQVU7QUFBQSxVQUFTLFdBQVc7QUFBQSxVQUFHLGlCQUFpQjtBQUFBLFVBQ2xELFdBQVc7QUFBQSxVQUFPLGFBQWE7QUFBQSxVQUFNLFVBQVU7QUFBQSxRQUNqRCxDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0Y7OztBUHBsQ0EsSUFBTSxJQUFJLGdCQUFRO0FBQ2xCLElBQU0sSUFBSSxDQUFDLE1BQWMsSUFBVSxZQUFNLEVBQUUsQ0FBQyxFQUFFLEdBQUc7QUFHMUMsSUFBTSxZQUFZLEVBQUUsT0FBTyxFQUFFO0FBRXBDLFNBQVMsb0JBQStDO0FBQ3RELFFBQU0sTUFBTSxJQUFVLDBCQUFvQjtBQUFBLElBQ3hDLGNBQWM7QUFBQSxJQUFNLGFBQWE7QUFBQSxJQUFNLFlBQVk7QUFBQSxJQUFPLE1BQVk7QUFBQSxFQUN4RSxDQUFDO0FBQ0QsTUFBSSxrQkFBa0IsQ0FBQyxXQUFXO0FBQ2hDLFdBQU8sU0FBUyxRQUFRO0FBQ3hCLFdBQU8sU0FBUyxXQUFXLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRTtBQUN2RCxXQUFPLFNBQVMsT0FBTyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUU7QUFDL0MsV0FBTyxTQUFTLFFBQVEsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFO0FBQ2pELFdBQU8sU0FBUyxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRTtBQUMvQyxXQUFPLGVBQWUsT0FBTyxhQUMxQixRQUFRLHFCQUFxQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSx5QkFTWCxFQUNsQixRQUFRLDJCQUEyQjtBQUFBO0FBQUEseURBRWU7QUFDckQsV0FBTyxpQkFBaUIsT0FBTyxlQUM1QixRQUFRLHFCQUFxQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBYWxDLEVBQ0ssUUFBUSxpREFBaUQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsNERBOEJKO0FBQUEsRUFDMUQ7QUFDQSxTQUFPO0FBQ1Q7QUFFTyxJQUFNLG9CQUFvQixrQkFBa0I7OztBUWpHbkQsWUFBWUMsWUFBVztBQUloQixJQUFNQyxLQUFJLGdCQUFRO0FBQ2xCLElBQU1DLEtBQUksQ0FBQyxNQUFjRCxHQUFFLENBQUMsRUFBRTtBQUU5QixJQUFNLGFBQWEsb0JBQUksSUFBeUI7QUFDaEQsU0FBUyxFQUFFLEtBQTBCO0FBQzFDLE1BQUksTUFBTSxXQUFXLElBQUksR0FBRztBQUM1QixNQUFJLENBQUMsS0FBSztBQUFFLFVBQU0sSUFBVSxhQUFNLEdBQUc7QUFBRyxlQUFXLElBQUksS0FBSyxHQUFHO0FBQUEsRUFBRztBQUNsRSxTQUFPO0FBQ1Q7QUFFTyxJQUFNLE1BQU07QUFBQSxFQUNqQixVQUFVLENBQUMsRUFBRUMsR0FBRSxXQUFXLENBQUMsR0FBRyxFQUFFQSxHQUFFLFlBQVksQ0FBQyxHQUFHLEVBQUVBLEdBQUUsWUFBWSxDQUFDLENBQUM7QUFBQSxFQUNwRSxVQUFVLEVBQUVBLEdBQUUsV0FBVyxDQUFDO0FBQUEsRUFDMUIsTUFBTSxFQUFFQSxHQUFFLGNBQWMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxlQUFlLElBQUk7QUFBQSxFQUN0RCxPQUFPLEVBQUVBLEdBQUUsY0FBYyxDQUFDO0FBQUEsRUFDMUIsTUFBTSxFQUFFQSxHQUFFLGFBQWEsQ0FBQztBQUFBLEVBQ3hCLFVBQVUsRUFBRUEsR0FBRSxXQUFXLENBQUM7QUFBQSxFQUMxQixRQUFRLEVBQUVBLEdBQUUsY0FBYyxDQUFDO0FBQUEsRUFDM0IsUUFBUSxFQUFFQSxHQUFFLGNBQWMsQ0FBQztBQUFBLEVBQzNCLFlBQVksRUFBRUEsR0FBRSxhQUFhLENBQUM7QUFBQSxFQUM5QixNQUFNLEVBQUVBLEdBQUUsTUFBTSxDQUFDO0FBQUEsRUFDakIsUUFBUSxFQUFFQSxHQUFFLGNBQWMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUVBLEdBQUUsTUFBTSxDQUFDLEdBQUcsSUFBSTtBQUFBLEVBQzVELEtBQUssRUFBRUEsR0FBRSxhQUFhLENBQUM7QUFBQSxFQUN2QixNQUFNLEVBQUVBLEdBQUUsV0FBVyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRUEsR0FBRSxjQUFjLENBQUMsR0FBRyxJQUFJO0FBQUEsRUFDL0QsTUFBTSxFQUFFQSxHQUFFLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFdBQVcsRUFBRUEsR0FBRSxNQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFQSxHQUFFLGFBQWEsQ0FBQyxHQUFHLElBQUk7QUFBQSxFQUM5RCxVQUFVLEVBQUVBLEdBQUUsV0FBVyxDQUFDO0FBQUEsRUFDMUIsY0FBYyxFQUFFQSxHQUFFLGVBQWUsQ0FBQztBQUFBLEVBQ2xDLFVBQVUsRUFBRUEsR0FBRSxXQUFXLENBQUM7QUFBQSxFQUMxQixXQUFXLEVBQUVBLEdBQUUsWUFBWSxDQUFDO0FBQzlCO0FBa0JPLFNBQVMsV0FBVyxHQUFtQjtBQUM1QyxTQUFPLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJO0FBQ3JDOzs7QUM3Q08sSUFBTSxNQUFNLGFBQWE7QUFDekIsSUFBTSxnQkFBZ0IsTUFBTSxNQUFNOzs7QVZnQnpDLElBQU0sa0JBQWtCLElBQVUsMkJBQW9CO0FBQUEsRUFDcEQsY0FBYztBQUFBLEVBQ2QsTUFBWTtBQUNkLENBQUM7QUFDRCxnQkFBZ0Isa0JBQWtCLENBQUMsV0FBVztBQUM1QyxTQUFPLGVBQWUsT0FBTyxhQUMxQixRQUFRLHFCQUFxQix5R0FBeUcsRUFDdEksUUFBUSwyQkFBMkIsa0pBQWtKO0FBQ3hMLFNBQU8saUJBQWlCLE9BQU8sZUFDNUIsUUFBUSxxQkFBcUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTaEMsRUFDRyxRQUFRLDZCQUE2QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUEwQnhDO0FBQ0Y7QUF5SE8sSUFBTSxzQkFBa0MsRUFBRSxNQUFNLEtBQUssS0FBSyxJQUFJO0FBRTlELElBQU0sYUFBYTtBQTZDMUIsSUFBTSxtQkFBbUIsb0JBQUksUUFBaUM7QUFFOUQsU0FBUyxpQkFBaUIsT0FBYyxRQUFnQztBQUN0RSxNQUFJLE1BQU0sYUFBYSxPQUFPLFNBQVU7QUFHeEMsU0FBTyxRQUFRLE1BQU07QUFHckIsYUFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLE1BQU0sT0FBTztBQUN0QyxRQUFJLENBQUMsTUFBTSxRQUFRLENBQUMsTUFBTSxPQUFPLElBQUksR0FBRyxFQUFHO0FBQzNDLFVBQU0sUUFBUSxNQUFNLE9BQU8sSUFBSSxHQUFHO0FBQ2xDLFVBQU0sS0FBSyxhQUFhLE1BQU0sRUFBRSxHQUFHLEtBQUssYUFBYSxNQUFNLEVBQUU7QUFDN0QsVUFBTSxVQUFVLG9CQUFJLElBQTRDO0FBQ2hFLGFBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNO0FBQ3RDLGVBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNO0FBQ3RDLGNBQU0sTUFBTSxLQUFLLGFBQWE7QUFDOUIsZ0JBQVEsS0FBSyxLQUFLLEtBQUssUUFBUSxhQUFhLEtBQUssS0FBSyxNQUFNO0FBQUEsVUFDMUQsUUFBUSxNQUFNLFFBQVEsR0FBRyxJQUFJLFFBQVE7QUFBQSxVQUNyQyxLQUFLLE1BQU0sYUFBYSxHQUFHO0FBQUEsUUFDN0IsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNGO0FBQ0EsV0FBTyxRQUFRLElBQUksS0FBSyxPQUFPO0FBQUEsRUFDakM7QUFDQSxTQUFPLE9BQU8sTUFBTTtBQUNwQixTQUFPLFdBQVcsTUFBTTtBQUMxQjtBQUVBLFNBQVMsWUFBWSxPQUFjLFFBQTBCLEtBQWEsT0FBZTtBQUN2RixNQUFJLFVBQVUsT0FBTyxRQUFRLElBQUksR0FBRztBQUNwQyxNQUFJLFFBQVMsUUFBTyxRQUFRLElBQUksS0FBSztBQUNyQyxRQUFNLENBQUMsSUFBSSxFQUFFLElBQUksSUFBSSxNQUFNLEdBQUcsRUFBRSxJQUFJLE1BQU07QUFDMUMsTUFBSSxDQUFDLFlBQVksT0FBTyxJQUFJLEVBQUUsRUFBRyxRQUFPO0FBR3hDLFFBQU0sUUFBUSxNQUFNLE9BQU8sSUFBSSxHQUFHO0FBQ2xDLFlBQVUsb0JBQUksSUFBSTtBQUNsQixRQUFNLEtBQUssYUFBYSxFQUFFLEdBQUcsS0FBSyxhQUFhLEVBQUU7QUFDakQsV0FBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsWUFBTSxNQUFNLEtBQUssYUFBYTtBQUM5QixjQUFRLEtBQUssS0FBSyxLQUFLLFFBQVEsYUFBYSxLQUFLLEtBQUssTUFBTTtBQUFBLFFBQzFELFFBQVEsTUFBTSxRQUFRLEdBQUcsSUFBSSxRQUFRO0FBQUEsUUFDckMsS0FBSyxNQUFNLGFBQWEsR0FBRztBQUFBLE1BQzdCLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRjtBQUNBLFNBQU8sUUFBUSxJQUFJLEtBQUssT0FBTztBQUMvQixTQUFPLFFBQVEsSUFBSSxLQUFLO0FBQzFCO0FBRUEsSUFBTSxtQkFBbUIsb0JBQUksUUFBaUQ7QUFHOUUsU0FBUyxhQUFhLE9BQXNCO0FBQzFDLFFBQU0sVUFBVSxZQUFZLEtBQUs7QUFDakMsUUFBTSxPQUFPLGlCQUFpQixJQUFJLEtBQUs7QUFDdkMsTUFBSSxRQUFRLEtBQUssWUFBWSxRQUFTLFFBQU8sS0FBSztBQUNsRCxRQUFNLE1BQU0sb0JBQW9CLEtBQUs7QUFDckMsbUJBQWlCLElBQUksT0FBTyxFQUFFLFNBQVMsSUFBSSxDQUFDO0FBQzVDLFNBQU87QUFDVDtBQUVBLFNBQVMsb0JBQW9CLE9BQXNCO0FBSWpELFNBQU8sQ0FBQyxHQUFHLE1BQU0sTUFBTSxRQUFRLENBQUMsRUFDN0IsT0FBTyxDQUFDLENBQUMsRUFBRSxLQUFLLE1BQU0sTUFBTSxPQUFPLENBQUMsRUFDcEMsSUFBSSxDQUFDLENBQUMsS0FBSyxLQUFLLE1BQU07QUFDckIsUUFBSSxNQUFNO0FBQ1YsUUFBSSxRQUFRO0FBQ1osZUFBVyxDQUFDLE9BQU8sUUFBUSxLQUFLLE9BQU87QUFDckMsWUFBTSxRQUFRLEtBQUssS0FBSyxRQUFRLEdBQUcsRUFBRSxJQUFJO0FBQ3pDLFlBQU8sTUFBTSxRQUFTO0FBQ3RCLGNBQVMsUUFBUSxLQUFLLEtBQUssT0FBTyxRQUFTLElBQUs7QUFBQSxJQUNsRDtBQUNBLFdBQU8sR0FBRyxHQUFHLElBQUksTUFBTSxJQUFJLElBQUksR0FBRyxJQUFJLEtBQUs7QUFBQSxFQUM3QyxDQUFDLEVBQ0EsS0FBSyxFQUNMLEtBQUssR0FBRztBQUNiO0FBRUEsU0FBUyxtQkFBbUIsT0FBYyxNQUFjLE9BQTJDO0FBQ2pHLFFBQU0sU0FBUyxpQkFBaUIsSUFBSSxLQUFLO0FBQ3pDLFFBQU0sTUFBTSxHQUFHLElBQUksSUFBSSxhQUFhLEtBQUssQ0FBQztBQUMxQyxRQUFNLFNBQVMsT0FBTyxPQUFPLElBQUksR0FBRztBQUNwQyxNQUFJLE9BQVEsUUFBTztBQUVuQixhQUFXLENBQUMsT0FBTyxLQUFLLEtBQUssTUFBTSxPQUFPO0FBQ3hDLFFBQUksTUFBTSxRQUFRLENBQUMsT0FBTyxRQUFRLElBQUksS0FBSyxFQUFHLGFBQVksT0FBTyxRQUFRLE9BQU8sQ0FBQztBQUFBLEVBQ25GO0FBRUEsUUFBTSxLQUFLLFlBQVksSUFBSTtBQUMzQixRQUFNLEVBQUUsR0FBRyxTQUFTLE1BQU0sV0FBVyxJQUFJO0FBQ3pDLFFBQU0sU0FBUztBQUFBLElBQ2I7QUFBQSxJQUNBLFNBQVMsSUFBSSxXQUFXLE9BQU87QUFBQSxJQUMvQixNQUFNLElBQUksV0FBVyxJQUFJO0FBQUEsSUFDekIsWUFBWSxJQUFJLFdBQVcsVUFBVTtBQUFBLElBQ3JDLFVBQVUsTUFBTTtBQUFBLEVBQ2xCO0FBQ0EsV0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDMUIsYUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDMUIsWUFBTSxJQUFJLEtBQUssTUFBTSxDQUFDLFFBQVEsSUFBSSxPQUFPLElBQUk7QUFDN0MsWUFBTSxJQUFJLEtBQUssTUFBTSxDQUFDLFFBQVEsSUFBSSxPQUFPLElBQUk7QUFDN0MsWUFBTSxRQUFRLFNBQVMsY0FBYyxDQUFDLEdBQUcsY0FBYyxDQUFDLENBQUM7QUFDekQsVUFBSSxDQUFDLE1BQU0sTUFBTSxJQUFJLEtBQUssR0FBRyxLQUFNO0FBQ25DLFlBQU0sTUFBTSxJQUFJLElBQUk7QUFDcEIsWUFBTSxTQUFTLFlBQVksT0FBTyxRQUFRLFFBQVEsSUFBSSxRQUFRLGFBQWEsSUFBSSxJQUFJO0FBQ25GLFVBQUksQ0FBQyxPQUFRO0FBQ2IsYUFBTyxRQUFRLEdBQUcsSUFBSSxPQUFPO0FBQzdCLGFBQU8sS0FBSyxHQUFHLElBQUksT0FBTztBQUMxQixhQUFPLFdBQVcsR0FBRyxJQUFJLE9BQU8sUUFBUSxHQUFHLElBQUksWUFBWSxJQUFJO0FBQUEsSUFDakU7QUFBQSxFQUNGO0FBQ0EsU0FBTyxXQUFXLFlBQVksSUFBSSxJQUFJO0FBQ3RDLFNBQU8sT0FBTyxJQUFJLEtBQUssTUFBTTtBQUM3QixTQUFPO0FBQ1Q7QUFFQSxTQUFTLGFBQWEsT0FBYyxNQUFnQztBQUNsRSxNQUFJLFNBQVMsaUJBQWlCLElBQUksS0FBSztBQUN2QyxNQUFJLENBQUMsUUFBUTtBQUNYLGFBQVMsRUFBRSxNQUFNLG9CQUFJLElBQUksR0FBRyxRQUFRLG9CQUFJLElBQUksR0FBRyxTQUFTLG9CQUFJLElBQUksR0FBRyxVQUFVLEdBQUc7QUFDaEYscUJBQWlCLElBQUksT0FBTyxNQUFNO0FBQUEsRUFDcEM7QUFDQSxtQkFBaUIsT0FBTyxNQUFNO0FBQzlCLFFBQU0sU0FBUyxPQUFPLEtBQUssSUFBSSxJQUFJO0FBQ25DLE1BQUksT0FBUSxRQUFPLG1CQUFtQixPQUFPLE1BQU0sTUFBTTtBQUV6RCxRQUFNLEtBQUssWUFBWSxJQUFJO0FBQzNCLFFBQU0sSUFBSSxLQUFLLEtBQUssYUFBYSxJQUFJO0FBQ3JDLFFBQU0sVUFBVSxJQUFJLFdBQVcsSUFBSSxDQUFDO0FBQ3BDLFFBQU0sT0FBTyxJQUFJLFdBQVcsSUFBSSxDQUFDO0FBQ2pDLFFBQU0sYUFBYSxJQUFJLFdBQVcsSUFBSSxDQUFDO0FBQ3ZDLFFBQU0sUUFBUSxDQUFDLE1BQWMsQ0FBQyxRQUFRLElBQUksT0FBTztBQUNqRCxRQUFNLFFBQVEsQ0FBQyxNQUFjLENBQUMsUUFBUSxJQUFJLE9BQU87QUFFakQsV0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDMUIsYUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDMUIsWUFBTSxJQUFJLE1BQU0sQ0FBQyxHQUFHLElBQUksTUFBTSxDQUFDO0FBQy9CLFlBQU0sSUFBSSxhQUFhLE1BQU0sTUFBTSxNQUFNLE9BQU8sa0JBQWtCLEtBQUssTUFBTSxDQUFDLEdBQUcsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUM5RixZQUFNLE1BQU0sSUFBSSxJQUFJO0FBQ3BCLGNBQVEsR0FBRyxJQUFJO0FBQ2YsVUFBSSxJQUFJLFVBQVcsWUFBVyxHQUFHLElBQUk7QUFBQSxJQUN2QztBQUFBLEVBQ0Y7QUFFQSxXQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMxQixhQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMxQixZQUFNLE1BQU0sSUFBSSxJQUFJO0FBQ3BCLFVBQUksV0FBVyxHQUFHLEVBQUc7QUFDckIsWUFBTSxJQUFJLFFBQVEsR0FBRztBQUNyQixZQUFNLElBQUksTUFBTSxDQUFDLEdBQUcsSUFBSSxNQUFNLENBQUM7QUFDL0IsVUFBSSxRQUFRO0FBQ1osVUFBSSxZQUFZO0FBQ2hCLFlBQU0sS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDNUMsaUJBQVcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxJQUFJO0FBQ3pCLGNBQU0sS0FBSyxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksSUFBSSxHQUFHLElBQUksRUFBRSxDQUFDO0FBQzlDLGNBQU0sS0FBSyxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksSUFBSSxHQUFHLElBQUksRUFBRSxDQUFDO0FBQzlDLGNBQU0sS0FBSyxRQUFRLEtBQUssSUFBSSxFQUFFO0FBQzlCLGdCQUFRLEtBQUssSUFBSSxPQUFPLEtBQUssSUFBSSxJQUFJLEVBQUUsQ0FBQztBQUN4QyxZQUFJLEtBQUssWUFBWSxFQUFHLGFBQVk7QUFBQSxNQUN0QztBQUNBLFdBQUssR0FBRyxJQUFJO0FBQUEsUUFBbUIsTUFBTTtBQUFBLFFBQU0sTUFBTSxPQUFPO0FBQUEsUUFDdEQsS0FBSyxNQUFNLENBQUM7QUFBQSxRQUFHLEtBQUssTUFBTSxDQUFDO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxRQUFPO0FBQUEsTUFBUztBQUFBLElBQ3JEO0FBQUEsRUFDRjtBQUVBLFFBQU0sUUFBMEI7QUFBQSxJQUM5QjtBQUFBLElBQUc7QUFBQSxJQUFTO0FBQUEsSUFBTTtBQUFBLElBQ2xCLFVBQVUsWUFBWSxJQUFJLElBQUk7QUFBQSxFQUNoQztBQUNBLFNBQU8sS0FBSyxJQUFJLE1BQU0sS0FBSztBQUMzQixTQUFPLG1CQUFtQixPQUFPLE1BQU0sS0FBSztBQUM5QztBQUdPLFNBQVMsbUJBQW1CLE9BQWMsR0FBVyxHQUFXLE9BQU8sR0FBdUI7QUFDbkcsUUFBTSxRQUFRLGFBQWEsT0FBTyxJQUFJO0FBQ3RDLFFBQU0sSUFBSSxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksTUFBTSxJQUFJLEdBQUcsS0FBSyxPQUFPLElBQUksUUFBUSxJQUFJLENBQUMsQ0FBQztBQUMxRSxRQUFNLElBQUksS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLE1BQU0sSUFBSSxHQUFHLEtBQUssT0FBTyxJQUFJLFFBQVEsSUFBSSxDQUFDLENBQUM7QUFDMUUsUUFBTSxNQUFNLElBQUksTUFBTSxJQUFJO0FBQzFCLFNBQU87QUFBQSxJQUNMLEdBQUcsQ0FBQyxRQUFRLElBQUksT0FBTztBQUFBLElBQ3ZCLEdBQUcsQ0FBQyxRQUFRLElBQUksT0FBTztBQUFBLElBQ3ZCLFFBQVEsTUFBTSxRQUFRLEdBQUc7QUFBQSxJQUFHLEtBQUssTUFBTSxLQUFLLEdBQUc7QUFBQSxJQUMvQyxZQUFZLE1BQU0sV0FBVyxHQUFHLE1BQU07QUFBQSxFQUN4QztBQUNGO0FBT08sU0FBUyxlQUFlLE9BQWMsTUFBaUM7QUFDNUUsUUFBTSxVQUFVLFlBQVksSUFBSTtBQUNoQyxRQUFNLEVBQUUsTUFBTSxLQUFLLElBQUk7QUFDdkIsUUFBTSxXQUFXLEdBQUcsSUFBSSxJQUFJLGFBQWEsS0FBSyxDQUFDO0FBQy9DLFFBQU0sZUFBZSxpQkFBaUIsSUFBSSxLQUFLLEdBQUcsT0FBTyxJQUFJLFFBQVEsS0FBSztBQUMxRSxRQUFNLFFBQVEsYUFBYSxPQUFPLElBQUk7QUFDdEMsUUFBTSxFQUFFLEdBQUcsU0FBUyxNQUFNLFdBQVcsSUFBSTtBQUN6QyxRQUFNLFdBQVcsSUFBSSxXQUFXLElBQUksQ0FBQztBQUNyQyxRQUFNLFFBQVEsQ0FBQyxNQUFjLENBQUMsUUFBUSxJQUFJLE9BQU87QUFDakQsUUFBTSxRQUFRLENBQUMsTUFBYyxDQUFDLFFBQVEsSUFBSSxPQUFPO0FBRWpELE1BQUksTUFBTTtBQUNSLGFBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQzFCLGVBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQzFCLGNBQU0sSUFBSSxNQUFNLENBQUMsR0FBRyxJQUFJLE1BQU0sQ0FBQztBQUMvQixZQUFJLElBQUksS0FBSyxRQUFRLElBQUksS0FBSyxRQUFRLElBQUksS0FBSyxRQUFRLElBQUksS0FBSyxNQUFNO0FBQ3BFLG1CQUFTLElBQUksSUFBSSxDQUFDLElBQUk7QUFBQSxRQUN4QjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVBLFFBQU0sV0FBVyxlQUFlLElBQUksTUFBTTtBQUkxQyxRQUFNLFlBQVksS0FBSyxRQUFRLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxhQUFhLElBQUksQ0FBQyxJQUFJO0FBQzVFLFFBQU0sZUFBZSxLQUFLLEtBQUssSUFBSSxTQUFTO0FBRTVDLFFBQU0sY0FBNkIsQ0FBQztBQUNwQyxXQUFTLElBQUksR0FBRyxJQUFJLGVBQWUsY0FBYyxJQUFLLGFBQVksS0FBSyxFQUFFLFdBQVcsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxFQUFFLENBQUM7QUFDOUgsTUFBSSxNQUFNLFlBQVksQ0FBQztBQUV2QixRQUFNLFdBQVcsQ0FBQyxHQUFlLEdBQTZCLFVBQXVCO0FBQ25GLFVBQU0sRUFBRSxXQUFXLFNBQVMsUUFBUSxRQUFRLElBQUk7QUFDaEQsVUFBTSxPQUFPLFVBQVUsU0FBUztBQUNoQyxlQUFXLEtBQUssR0FBRztBQUNqQixnQkFBVSxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQy9CLGNBQVEsS0FBSyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztBQUM3QixhQUFPLEtBQUssTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUM7QUFBQSxJQUN2QztBQUNBLFlBQVEsS0FBSyxNQUFNLE9BQU8sR0FBRyxPQUFPLEdBQUcsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDO0FBQUEsRUFDakU7QUFFQSxRQUFNLFlBQVksQ0FBQyxHQUFXLE1BQWMsT0FBTyxPQUFPLE9BQU8sR0FBRyxHQUFHLE1BQU0sT0FBTyxHQUFHO0FBRXZGLFFBQU0sV0FBVyxDQUFDLEtBQVksR0FBVyxHQUFXLE1BQTJCO0FBQzdFLFVBQU0sUUFBUSxVQUFVLEdBQUcsQ0FBQztBQUM1QixVQUFNLFFBQVEsS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssTUFBTSxPQUFPLEtBQUssQ0FBQztBQUN0RSxRQUFJLFFBQVEsSUFBSSxLQUFNLFFBQU8sSUFBSSxLQUFLLE1BQU0sRUFBRSxlQUFlLFFBQVEsR0FBSTtBQUN6RSxRQUFJLFFBQVEsSUFBSSxPQUFRLFFBQU8sSUFBSSxPQUFPLE1BQU0sRUFBRSxlQUFlLEtBQUs7QUFDdEUsUUFBSSxRQUFRLElBQUksT0FBTztBQUNyQixhQUFPLElBQUksV0FBVyxNQUFNLEVBQUUsS0FBSyxJQUFJLFFBQVEsT0FBTyxPQUFPLEtBQUssRUFBRTtBQUFBLFNBQ2pFLE9BQU8sT0FBTyxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDLE1BQU0sT0FBTyxPQUFPO0FBQUEsTUFDMUU7QUFBQSxJQUNGO0FBQ0EsUUFBSSxRQUFRLElBQUksSUFBSyxRQUFPLElBQUksSUFBSSxNQUFNLEVBQUUsZUFBZSxLQUFLO0FBQ2hFLFFBQUksUUFBUSxJQUFJLEtBQU0sUUFBTyxJQUFJLEtBQUssTUFBTSxFQUFFLGVBQWUsT0FBTyxPQUFPLEtBQUs7QUFJaEYsV0FBTyxJQUFJLFNBQVMsV0FBVyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQ3RDLEtBQUssSUFBSSxVQUFVLE9BQU8sT0FBTyxLQUFLLEVBQ3RDLGVBQWUsS0FBSztBQUFBLEVBQ3pCO0FBRUEsUUFBTSxZQUFZLENBQUMsS0FBWSxHQUFXLElBQVksR0FBVyxNQUEyQjtBQUMxRixVQUFNLE9BQU8sSUFBSTtBQUNqQixVQUFNLFFBQVEsTUFBTyxNQUFPLE9BQU8sR0FBRyxHQUFHLE1BQU0sT0FBTyxHQUFHO0FBQ3pELFFBQUksUUFBUSxJQUFJLEtBQU0sUUFBTyxJQUFJLEtBQUssTUFBTSxFQUFFLEtBQUssSUFBSSxRQUFRLE9BQU8sSUFBSSxPQUFPLEdBQUcsRUFBRSxlQUFlLFFBQVEsSUFBSTtBQUNqSCxRQUFJLFFBQVEsSUFBSSxPQUFPO0FBQ3JCLGFBQU8sSUFBSSxXQUFXLE1BQU0sRUFBRTtBQUFBLFNBQzNCLE1BQU8sT0FBTyxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDLEtBQUs7QUFBQSxNQUMzRDtBQUFBLElBQ0Y7QUFJQSxRQUFJLE9BQU8sRUFBRyxRQUFPLElBQUksU0FBUyxNQUFNLEVBQUUsS0FBSyxJQUFJLE9BQU8sSUFBSSxFQUFFLGVBQWUsS0FBSztBQUNwRixXQUFPLElBQUksU0FBUyxNQUFNLEVBQUUsS0FBSyxJQUFJLFFBQVEsSUFBSSxFQUFFLGVBQWUsS0FBSztBQUFBLEVBQ3pFO0FBUUEsUUFBTSxRQUFRLEtBQUssUUFBUyxLQUFLLFNBQVMsc0JBQXVCO0FBQ2pFLFFBQU0sSUFBSTtBQUNWLFFBQU0sVUFBVSxDQUFDLElBQVksT0FBdUI7QUFDbEQsUUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLE1BQU8sUUFBTztBQUNsQyxVQUFNLEtBQUssQ0FBQyxRQUFRLEtBQUssT0FBTyxJQUFJLE1BQU0sS0FBSyxDQUFDLFFBQVEsS0FBSyxPQUFPLElBQUk7QUFDeEUsVUFBTSxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLE1BQU0sQ0FBQyxHQUFHLEtBQUssSUFBSSxLQUFLLEtBQUssTUFBTSxDQUFDLENBQUMsSUFBSSxJQUFJLE9BQU87QUFDMUYsV0FBTyxLQUFLLE1BQU0sT0FBTyxJQUFJLEtBQUssTUFBTSxNQUFNLElBQUk7QUFBQSxFQUNwRDtBQUdBLFFBQU0sVUFBVSxJQUFJLGFBQWEsSUFBSSxDQUFDO0FBQ3RDLFFBQU0sYUFBYSxJQUFJLFdBQVcsSUFBSSxDQUFDO0FBRXZDLFFBQU0sUUFBZ0IsQ0FBQztBQUN2QixRQUFNLFdBQVcsSUFBVSxhQUFNO0FBQ2pDLFdBQVMsS0FBSyxHQUFHLEtBQUssR0FBRyxNQUFNLEdBQUc7QUFDaEMsYUFBUyxLQUFLLEdBQUcsS0FBSyxHQUFHLE1BQU0sR0FBRztBQUNoQyxZQUFNLElBQUksUUFBUSxLQUFLLEdBQUcsS0FBSyxDQUFDO0FBQ2hDLGVBQVMsS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsTUFBTSxHQUFHO0FBQ25ELGlCQUFTLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLE1BQU0sR0FBRztBQUNuRCxjQUFJLE9BQU8sR0FBRyxRQUFRLEdBQUcsT0FBTztBQUNoQyxtQkFBUyxPQUFPLEdBQUcsR0FBRyxDQUFDO0FBQ3ZCLG1CQUFTLElBQUksSUFBSSxJQUFJLEtBQUssSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLEtBQUs7QUFDN0MscUJBQVMsSUFBSSxJQUFJLElBQUksS0FBSyxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsS0FBSztBQUM3QyxvQkFBTSxNQUFNLElBQUksSUFBSTtBQUNwQjtBQUNBLGtCQUFJLFNBQVMsR0FBRyxLQUFLLFdBQVcsR0FBRyxFQUFHO0FBQ3RDO0FBQ0Esa0JBQUksT0FBTyxLQUFLLFFBQVEsR0FBRyxJQUFJLFFBQVEsSUFBSSxFQUFHLFFBQU87QUFDckQsa0JBQUksSUFBSSxFQUFHLFVBQVMsSUFBSSxTQUFTLEtBQUssR0FBRyxHQUFZLFFBQVEsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDMUU7QUFBQSxVQUNGO0FBQ0EsY0FBSSxPQUFPLEtBQUssT0FBTyxJQUFJLE1BQU87QUFDbEMsZ0JBQU0sSUFBSSxRQUFRLElBQUk7QUFDdEIsZ0JBQU0sTUFBTSxLQUFLLElBQUk7QUFDckIsZ0JBQU0sUUFBUSxJQUFJLElBQUksU0FBUyxNQUFNLEVBQUUsZUFBZSxJQUFJLElBQUksSUFBSSxTQUFTLEtBQUssR0FBRyxJQUFJLEVBQUU7QUFDekYsZ0JBQU0sS0FBSyxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxHQUFHLEtBQUssTUFBTSxDQUFDO0FBQzdDLG1CQUFTLElBQUksSUFBSSxJQUFJLEtBQUssSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLEtBQUs7QUFDN0MscUJBQVMsSUFBSSxJQUFJLElBQUksS0FBSyxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsS0FBSztBQUM3QyxzQkFBUSxJQUFJLElBQUksQ0FBQyxJQUFJO0FBQ3JCLHlCQUFXLElBQUksSUFBSSxDQUFDLElBQUk7QUFBQSxZQUMxQjtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBR0EsUUFBTSxnQkFBZ0IsQ0FBQyxJQUFZLE9BQThCO0FBRy9ELFFBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxNQUFNLEtBQUssTUFBTSxFQUFHLFFBQU87QUFDbkQsVUFBTSxPQUFPLEtBQUssSUFBSTtBQUN0QixRQUFJLFNBQVMsSUFBSSxFQUFHLFFBQU87QUFDM0IsUUFBSSxXQUFXLElBQUksRUFBRyxRQUFPLFFBQVEsSUFBSTtBQUd6QyxXQUFPLFdBQVcsSUFBSSxJQUFJLEtBQUssSUFBSSxZQUFZLEtBQUssUUFBUSxJQUFJLENBQUMsSUFBSSxZQUFZO0FBQUEsRUFDbkY7QUFFQSxhQUFXLEVBQUUsR0FBRyxHQUFHLEdBQUcsR0FBRyxLQUFLLE1BQU0sS0FBSyxPQUFPO0FBQzlDLFVBQU0sWUFBWSxLQUFLLE1BQU0sSUFBSSxTQUFTLElBQUksZUFBZSxLQUFLLE1BQU0sSUFBSSxTQUFTLENBQUM7QUFDdEYsVUFBTSxLQUFLLENBQUMsT0FBTyxJQUFJLE1BQU0sS0FBSyxLQUFLLElBQUksTUFBTSxLQUFLLElBQUksSUFBSTtBQUM5RCxVQUFNLEtBQUssQ0FBQyxPQUFPLElBQUksTUFBTSxLQUFLLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSSxJQUFJO0FBQzlELFVBQU0sT0FBTyxLQUFLLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxRQUFRLEtBQUssSUFBSSxHQUFHLElBQUksQ0FBQztBQUUxRDtBQUFBLE1BQ0UsQ0FBQyxDQUFDLElBQUksR0FBRyxFQUFFLEdBQUcsQ0FBQyxJQUFJLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUM7QUFBQSxNQUNuRCxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDUjtBQUFBLElBQ0Y7QUFLQSxVQUFNLE9BQU8sQ0FBQyxTQUF3QjtBQUNwQyxZQUFNLElBQUksT0FBTyxJQUFJLFFBQVE7QUFDN0IsVUFBSSxXQUFXLEdBQUcsT0FBc0I7QUFDeEMsWUFBTSxRQUFRLENBQUMsUUFBZ0I7QUFDN0IsWUFBSSxTQUFTLFFBQVEsS0FBSyxLQUFNO0FBQ2hDLGNBQU0sS0FBSztBQUNYLGNBQU0sTUFBTSxVQUFVLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQztBQUN0QyxZQUFJLFNBQVMsR0FBRztBQUNkLGdCQUFNLEtBQUssS0FBSyxXQUFXLE1BQU0sS0FBSyxLQUFLLE1BQU07QUFDakQsbUJBQVMsQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRztBQUFBLFFBQ2pGLFdBQVcsU0FBUyxHQUFHO0FBQ3JCLGdCQUFNLEtBQUssS0FBSyxXQUFXLE1BQU0sS0FBSyxLQUFLLE1BQU07QUFDakQsbUJBQVMsQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLEdBQUcsR0FBRztBQUFBLFFBQ2xGLFdBQVcsU0FBUyxHQUFHO0FBQ3JCLGdCQUFNLEtBQUssS0FBSyxXQUFXLE1BQU0sS0FBSyxLQUFLLE1BQU07QUFDakQsbUJBQVMsQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRztBQUFBLFFBQ2pGLE9BQU87QUFDTCxnQkFBTSxLQUFLLEtBQUssV0FBVyxNQUFNLEtBQUssS0FBSyxNQUFNO0FBQ2pELG1CQUFTLENBQUMsQ0FBQyxJQUFJLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLEdBQUcsQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsRUFBRSxHQUFHLEdBQUc7QUFBQSxRQUNsRjtBQUFBLE1BQ0Y7QUFDQSxlQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMxQixjQUFNLEtBQUssU0FBUyxJQUFJLGNBQWMsSUFBSSxNQUFNLElBQUksQ0FBQyxJQUNqRCxTQUFTLElBQUksY0FBYyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQ3JDLFNBQVMsSUFBSSxjQUFjLElBQUksR0FBRyxJQUFJLEtBQUssSUFDekMsY0FBYyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2xDLFlBQUksSUFBSSxLQUFLLE9BQU8sS0FBTTtBQUMxQixjQUFNLENBQUM7QUFDUCxtQkFBVztBQUFHLGVBQU87QUFBQSxNQUN2QjtBQUNBLFlBQU0sQ0FBQztBQUFBLElBQ1Q7QUFDQSxTQUFLLENBQUM7QUFBRyxTQUFLLENBQUM7QUFBRyxTQUFLLENBQUM7QUFBRyxTQUFLLENBQUM7QUFBQSxFQUNuQztBQUVBLFFBQU0sV0FBVyxJQUFVLDJCQUFvQixFQUFFLGNBQWMsTUFBTSxhQUFhLEtBQUssQ0FBQztBQUN4RixRQUFNLFNBQXVCLENBQUM7QUFDOUIsTUFBSSxZQUFZO0FBQ2hCLE1BQUksWUFBWSxTQUFTLEdBQUc7QUFPMUIsUUFBSSxjQUFjLEdBQUcsYUFBYTtBQUNsQyxlQUFXLEtBQUssYUFBYTtBQUFFLHFCQUFlLEVBQUUsVUFBVSxTQUFTO0FBQUcsb0JBQWMsRUFBRSxRQUFRO0FBQUEsSUFBUTtBQUN0RyxVQUFNLFdBQVcsSUFBSSxhQUFhLGNBQWMsQ0FBQyxHQUFHLFNBQVMsSUFBSSxhQUFhLGNBQWMsQ0FBQyxHQUFHLFFBQVEsSUFBSSxhQUFhLGNBQWMsQ0FBQztBQUN4SSxVQUFNLFFBQVEsY0FBYyxRQUFRLElBQUksWUFBWSxVQUFVLElBQUksSUFBSSxZQUFZLFVBQVU7QUFDNUYsVUFBTSxTQUE4RSxDQUFDO0FBQ3JGLFFBQUksS0FBSyxHQUFHLEtBQUs7QUFDakIsYUFBUyxJQUFJLEdBQUcsSUFBSSxZQUFZLFFBQVEsS0FBSztBQUMzQyxZQUFNLElBQUksWUFBWSxDQUFDO0FBQ3ZCLFVBQUksRUFBRSxRQUFRLFdBQVcsRUFBRztBQUM1QixlQUFTLElBQUksRUFBRSxXQUFXLEtBQUssQ0FBQztBQUNoQyxhQUFPLElBQUksRUFBRSxTQUFTLEtBQUssQ0FBQztBQUM1QixZQUFNLElBQUksRUFBRSxRQUFRLEtBQUssQ0FBQztBQUMxQixlQUFTLElBQUksR0FBRyxJQUFJLEVBQUUsUUFBUSxRQUFRLElBQUssT0FBTSxLQUFLLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJO0FBQzFFLFlBQU0sTUFBTSxJQUFVLFlBQUs7QUFDM0IsZUFBUyxJQUFJLEdBQUcsSUFBSSxFQUFFLFVBQVUsUUFBUSxLQUFLLEdBQUc7QUFDOUMsa0JBQVUsSUFBSSxFQUFFLFVBQVUsQ0FBQyxHQUFHLEVBQUUsVUFBVSxJQUFJLENBQUMsR0FBRyxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUM7QUFDcEUsWUFBSSxjQUFjLFNBQVM7QUFBQSxNQUM3QjtBQUNBLGFBQU8sS0FBSyxFQUFFLEdBQUcsT0FBTyxJQUFJLE9BQU8sRUFBRSxRQUFRLFFBQVEsSUFBSSxDQUFDO0FBQzFELFlBQU0sRUFBRSxVQUFVLFNBQVM7QUFDM0IsWUFBTSxFQUFFLFFBQVE7QUFBQSxJQUNsQjtBQUNBLFVBQU0sU0FBUztBQUFBLE1BQ2IsVUFBVSxJQUFVLHVCQUFnQixVQUFVLENBQUM7QUFBQSxNQUMvQyxRQUFRLElBQVUsdUJBQWdCLFFBQVEsQ0FBQztBQUFBLE1BQzNDLE9BQU8sSUFBVSx1QkFBZ0IsT0FBTyxDQUFDO0FBQUEsTUFDekMsT0FBTyxJQUFVLHVCQUFnQixPQUFPLENBQUM7QUFBQSxJQUMzQztBQUNBLGVBQVcsS0FBSyxRQUFRO0FBQ3RCLFlBQU0sV0FBVyxJQUFVLHNCQUFlO0FBQzFDLGVBQVMsYUFBYSxZQUFZLE9BQU8sUUFBUTtBQUNqRCxlQUFTLGFBQWEsVUFBVSxPQUFPLE1BQU07QUFDN0MsZUFBUyxhQUFhLFNBQVMsT0FBTyxLQUFLO0FBQzNDLGVBQVMsU0FBUyxPQUFPLEtBQUs7QUFDOUIsZUFBUyxhQUFhLEVBQUUsT0FBTyxFQUFFLEtBQUs7QUFDdEMsZUFBUyxjQUFjLEVBQUU7QUFDekIsZUFBUyxpQkFBaUIsRUFBRSxJQUFJLGtCQUFrQixJQUFVLGNBQU8sQ0FBQztBQUNwRSxZQUFNLE9BQU8sSUFBVSxZQUFLLFVBQVUsUUFBUTtBQUM5QyxXQUFLLE9BQU8sa0JBQWtCLEVBQUUsSUFBSSxZQUFZLElBQUksS0FBSyxNQUFNLEVBQUUsSUFBSSxZQUFZLENBQUM7QUFDbEYsV0FBSyxhQUFhO0FBQ2xCLFdBQUssZ0JBQWdCO0FBR3JCLFdBQUssZ0JBQWdCO0FBQ3JCLFdBQUssU0FBUyxhQUFhLEVBQUUsT0FBTyxFQUFFLE9BQU8sT0FBTyxFQUFFLE1BQU07QUFDNUQsYUFBTyxLQUFLLElBQUk7QUFDaEIsbUJBQWEsRUFBRSxRQUFRO0FBQUEsSUFDekI7QUFBQSxFQUNGO0FBQ0EsV0FBUyxJQUFJLEdBQUcsSUFBSSxZQUFZLFVBQVUsWUFBWSxXQUFXLEdBQUcsS0FBSztBQUN2RSxVQUFNLEVBQUUsV0FBVyxTQUFTLFFBQVEsUUFBUSxJQUFJLFlBQVksQ0FBQztBQUM3RCxRQUFJLFFBQVEsV0FBVyxNQUFNLFlBQVksU0FBUyxLQUFLLE9BQU8sU0FBUyxHQUFJO0FBQzNFLFVBQU0sV0FBVyxJQUFVLHNCQUFlO0FBQzFDLGFBQVMsYUFBYSxZQUFZLElBQVUsOEJBQXVCLFdBQVcsQ0FBQyxDQUFDO0FBQ2hGLGFBQVMsYUFBYSxVQUFVLElBQVUsOEJBQXVCLFNBQVMsQ0FBQyxDQUFDO0FBQzVFLGFBQVMsYUFBYSxTQUFTLElBQVUsOEJBQXVCLFFBQVEsQ0FBQyxDQUFDO0FBQzFFLGFBQVMsU0FBUyxPQUFPO0FBQ3pCLGFBQVMsc0JBQXNCO0FBQy9CLGFBQVMsbUJBQW1CO0FBQzVCLFVBQU0sT0FBTyxJQUFVLFlBQUssVUFBVSxRQUFRO0FBQzlDLFNBQUssT0FBTyxZQUFZLFNBQVMsSUFBSSxrQkFBa0IsSUFBSSxZQUFZLElBQUksS0FBSyxNQUFNLElBQUksWUFBWSxDQUFDLEtBQUs7QUFDNUcsU0FBSyxhQUFhO0FBQ2xCLFNBQUssZ0JBQWdCO0FBQ3JCLFdBQU8sS0FBSyxJQUFJO0FBQ2hCLGlCQUFhLFFBQVEsU0FBUztBQUFBLEVBQ2hDO0FBQ0EsTUFBSSxPQUFPLFdBQVcsR0FBRztBQUN2QixVQUFNLFFBQVEsSUFBVSxZQUFLLElBQVUsc0JBQWUsR0FBRyxRQUFRO0FBQ2pFLFVBQU0sT0FBTztBQUNiLFdBQU8sS0FBSyxLQUFLO0FBQUEsRUFDbkI7QUFDQSxTQUFPO0FBQUEsSUFDTCxNQUFNLE9BQU8sQ0FBQztBQUFBLElBQ2Q7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsU0FBUyxZQUFZLElBQUksSUFBSTtBQUFBLElBQzdCO0FBQUEsRUFDRjtBQUNGO0FBVUEsSUFBTSxlQUFlLElBQVUsZUFBUTtBQUN2QyxJQUFNLGNBQWMsSUFBVSxlQUFRO0FBQ3RDLElBQU0sWUFBWSxJQUFVLGVBQVE7OztBRDV0QnBDLEtBQUssOEZBQThGLE1BQU07QUFDdkcsUUFBTSxRQUFRLFlBQVksSUFBSTtBQUM5QixRQUFNLFNBQVMsbUJBQW1CLE9BQU8sR0FBRyxDQUFDO0FBQzdDLFFBQU0sSUFBSSxLQUFLLE1BQU0sT0FBTyxDQUFDLEdBQUcsSUFBSSxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQ3ZELFFBQU0sZUFBZSxNQUFNLE9BQU87QUFDbEMsUUFBTSxZQUFZLG1CQUFtQixPQUFPLEdBQUcsQ0FBQztBQUNoRCxRQUFNLFdBQVcsZ0JBQWdCLE1BQU0sTUFBTSxHQUFHLENBQUMsS0FBSyxJQUFJLElBQUksUUFBUSxJQUFJO0FBRTFFLFNBQU8sTUFBTSxPQUFPLFFBQVEsZ0JBQWdCLE1BQU0sTUFBTSxHQUFHLENBQUMsQ0FBQztBQUM3RCxTQUFPLE1BQU0sTUFBTSxPQUFPLE1BQU0sR0FBRyxpREFBaUQ7QUFDcEYsU0FBTyxHQUFHLFNBQVMsT0FBTyxHQUFHLE9BQU8sUUFBUSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQ3ZELFFBQU0sUUFBUSxtQkFBbUIsT0FBTyxHQUFHLENBQUM7QUFDNUMsU0FBTyxNQUFNLE1BQU0sUUFBUSxPQUFPLFNBQVMsQ0FBQztBQUM1QyxTQUFPLE1BQU0sTUFBTSxLQUFLLElBQUksR0FBRztBQUMvQixTQUFPLE1BQU0sTUFBTSxZQUFZLEtBQUs7QUFDcEMsU0FBTyxVQUFVLG1CQUFtQixPQUFPLEdBQUcsQ0FBQyxHQUFHLFNBQVM7QUFDM0QsU0FBTyxNQUFNLE1BQU0sT0FBTyxNQUFNLGVBQWUsR0FBRyw4Q0FBOEM7QUFDaEcsU0FBTyxTQUFTLFVBQVUsSUFBSSxHQUFHO0FBQ25DLENBQUM7QUFFRCxLQUFLLCtFQUErRSxNQUFNO0FBQ3hGLFFBQU0sUUFBUSxZQUFZLElBQUk7QUFDOUIsUUFBTSxPQUFPLG1CQUFtQixPQUFPLEdBQUcsQ0FBQztBQUMzQyxRQUFNLElBQUksS0FBSyxNQUFNLEtBQUssQ0FBQyxHQUFHLElBQUksS0FBSyxNQUFNLEtBQUssQ0FBQztBQUNuRCxRQUFNLFdBQVcsbUJBQW1CLE9BQU8sR0FBRyxDQUFDO0FBQy9DLFFBQU0sSUFBSSxVQUFVLE9BQU8sR0FBRyxDQUFDO0FBQy9CLFFBQU0sTUFBTSxTQUFTLGNBQWMsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxDQUFDO0FBRXZELFNBQU8sR0FBRyxTQUFTLE9BQU8sR0FBRyxHQUFHLEdBQUcsSUFBSSxLQUFLLENBQUM7QUFDN0MsUUFBTSxTQUFTLG1CQUFtQixPQUFPLEdBQUcsQ0FBQztBQUM3QyxTQUFPLE1BQU0sT0FBTyxRQUFRLElBQUksQ0FBQztBQUNqQyxTQUFPLE1BQU0sT0FBTyxLQUFLLElBQUksS0FBSztBQUNsQyxhQUFXLE9BQU8sR0FBRztBQUNyQixTQUFPLFVBQVUsbUJBQW1CLE9BQU8sR0FBRyxDQUFDLEdBQUcsUUFBUSxpQ0FBaUM7QUFFM0YsU0FBTyxHQUFHLFNBQVMsT0FBTyxHQUFHLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQztBQUMzQyxhQUFXLE9BQU8sR0FBRztBQUNyQixTQUFPLE1BQU0sbUJBQW1CLE9BQU8sR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDO0FBQ3RELFNBQU8sR0FBRyxTQUFTLE9BQU8sR0FBRyxJQUFJLEdBQUcsR0FBRyxhQUFhLElBQUksTUFBTSxJQUFJLFFBQVEsSUFBSSxHQUFHLENBQUM7QUFDbEYsUUFBTSxlQUFlLG1CQUFtQixPQUFPLEdBQUcsQ0FBQztBQUNuRCxTQUFPLFNBQVMsYUFBYSxLQUFLLFFBQVE7QUFDMUMsU0FBTyxNQUFNLFNBQVMsT0FBTyxHQUFHLElBQUksR0FBRyxHQUFHLFFBQVEsR0FBRyxJQUFJO0FBQ3pELFFBQU0sV0FBVyxtQkFBbUIsT0FBTyxHQUFHLENBQUM7QUFDL0MsU0FBTyxNQUFNLFNBQVMsUUFBUSxDQUFDO0FBQy9CLFNBQU8sTUFBTSxTQUFTLEtBQUssUUFBUTtBQUNyQyxDQUFDO0FBRUQsS0FBSyw0RUFBNEUsTUFBTTtBQUNyRixRQUFNLFFBQVEsWUFBWSxJQUFJO0FBQzlCLFFBQU0sT0FBTyxtQkFBbUIsT0FBTyxHQUFHLENBQUM7QUFDM0MsUUFBTSxJQUFJLEtBQUssTUFBTSxLQUFLLENBQUMsR0FBRyxJQUFJLEtBQUssTUFBTSxLQUFLLENBQUM7QUFDbkQsUUFBTSxJQUFJLFVBQVUsT0FBTyxHQUFHLENBQUM7QUFDL0IsU0FBTyxHQUFHLFNBQVMsT0FBTyxHQUFHLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQztBQUU3QyxRQUFNLGFBQWEsQ0FBQyxTQUE0RDtBQUM5RSxRQUFJLFNBQVMsT0FBTztBQUNwQixVQUFNLFdBQVcsS0FBSyxTQUFTLGFBQWEsVUFBVTtBQUN0RCxVQUFNLFNBQVMsS0FBSyxTQUFTLGFBQWEsUUFBUTtBQUdsRCxhQUFTLElBQUksR0FBRyxJQUFJLFNBQVMsT0FBTyxLQUFLLEdBQUc7QUFDMUMsVUFBSSxTQUFTLEtBQUssQ0FBQyxNQUFNLEtBQUssSUFBSSxLQUFLLFNBQVMsS0FBSyxDQUFDLE1BQU0sS0FBSyxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUMsTUFBTSxHQUFHO0FBQzlGLGlCQUFTLEtBQUssSUFBSSxRQUFRLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFBQSxNQUM1QztBQUFBLElBQ0Y7QUFDQSxXQUFPO0FBQUEsRUFDVDtBQUNBLFFBQU0sV0FBVyxlQUFlLE9BQU87QUFBQSxJQUNyQyxNQUFNO0FBQUEsSUFBRyxNQUFNO0FBQUEsTUFDYixNQUFNLEtBQUssSUFBSTtBQUFBLE1BQUcsTUFBTSxLQUFLLElBQUk7QUFBQSxNQUFHLE1BQU0sS0FBSyxJQUFJO0FBQUEsTUFBRyxNQUFNLEtBQUssSUFBSTtBQUFBLElBQ3ZFO0FBQUEsRUFDRixDQUFDO0FBQ0QsUUFBTSxNQUFNLGVBQWUsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDO0FBQzdDLFNBQU8sTUFBTSxXQUFXLFNBQVMsSUFBSSxHQUFHLE9BQU8sbUJBQW1CLHFDQUFxQztBQUN2RyxTQUFPLE1BQU0sV0FBVyxJQUFJLElBQUksR0FBRyxJQUFJLEdBQUcsd0NBQXdDO0FBQ2xGLFdBQVMsS0FBSyxTQUFTLFFBQVE7QUFDL0IsTUFBSSxLQUFLLFNBQVMsUUFBUTtBQUM1QixDQUFDO0FBRUQsS0FBSyx5RUFBeUUsTUFBTTtBQUNsRixRQUFNLElBQUksWUFBWSxJQUFJO0FBQzFCLFFBQU0sSUFBSSxZQUFZLElBQUk7QUFDMUIsUUFBTSxPQUFPLG1CQUFtQixHQUFHLEdBQUcsQ0FBQztBQUN2QyxRQUFNLElBQUksS0FBSyxNQUFNLEtBQUssQ0FBQyxHQUFHLElBQUksS0FBSyxNQUFNLEtBQUssQ0FBQztBQUNuRCxTQUFPLEdBQUcsU0FBUyxHQUFHLEdBQUcsS0FBSyxRQUFRLEdBQUcsSUFBSSxHQUFHLENBQUM7QUFDakQsU0FBTyxNQUFNLG1CQUFtQixHQUFHLEdBQUcsQ0FBQyxFQUFFLEtBQUssSUFBSSxHQUFHO0FBQ3JELFNBQU8sVUFBVSxtQkFBbUIsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLGlDQUFpQztBQUVyRixRQUFNLFVBQVUsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO0FBQzNDLFFBQU0sS0FBSyxLQUFLLE1BQU0sUUFBUSxDQUFDLEdBQUcsS0FBSyxLQUFLLE1BQU0sUUFBUSxDQUFDO0FBQzNELFNBQU8sR0FBRyxTQUFTLEdBQUcsSUFBSSxRQUFRLFFBQVEsSUFBSSxJQUFJLEtBQUssQ0FBQztBQUN4RCxTQUFPLE1BQU0sbUJBQW1CLEdBQUcsR0FBRyxDQUFDLEVBQUUsS0FBSyxJQUFJLEdBQUc7QUFDckQsU0FBTyxVQUFVLG1CQUFtQixHQUFHLElBQUksQ0FBQyxHQUFHLE9BQU87QUFDeEQsQ0FBQztBQUVELEtBQUssNEVBQTRFLE1BQU07QUFDckYsUUFBTSxRQUFRLFlBQVksSUFBSTtBQUM5QixRQUFNLE9BQU8sbUJBQW1CLE9BQU8sR0FBRyxDQUFDO0FBQzNDLFFBQU0sSUFBSSxLQUFLLE1BQU0sS0FBSyxDQUFDLEdBQUcsSUFBSSxLQUFLLE1BQU0sS0FBSyxDQUFDO0FBQ25ELFNBQU8sR0FBRyxTQUFTLE9BQU8sR0FBRyxLQUFLLFFBQVEsR0FBRyxJQUFJLEtBQUssQ0FBQztBQUN2RCxRQUFNLE1BQU0sU0FBUyxjQUFjLENBQUMsR0FBRyxjQUFjLENBQUMsQ0FBQztBQUN2RCxhQUFXLE9BQU8sR0FBRztBQUNyQixTQUFPLE1BQU0sTUFBTSxPQUFPLE1BQU0sQ0FBQztBQUNqQyxxQkFBbUIsT0FBTyxHQUFHLENBQUM7QUFDOUIsU0FBTyxNQUFNLFlBQVksT0FBTyxjQUFjLENBQUMsR0FBRyxjQUFjLENBQUMsQ0FBQyxHQUFHLEtBQUssR0FBRztBQUM3RSxTQUFPLFVBQVUsQ0FBQyxHQUFHLE1BQU0sT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQztBQUNsRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJUSFJFRSIsICJjIiwgImEiLCAiYiIsICJzbW9vdGgiLCAiVEhSRUUiLCAiTSIsICJIIl0KfQo=
