// tests/m003.lod.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// src/render/terrain.ts
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
var CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
var CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
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
  MOSS: 9
};
var isSolid = (m) => m !== MAT.AIR && m !== MAT.WATER;
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
function createWorld(seed = 1337) {
  return {
    seed,
    params: { ...DEFAULT_PARAMS },
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
function baseTopMaterial(seed, x, z, h, slope, nearWater) {
  return topMaterialAt(seed, x, z, h, slope, nearWater);
}
function subsoilFor(top) {
  if (top === MAT.GRASS || top === MAT.MOSS) return MAT.SOIL;
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
  const P = 3;
  const PW = CHUNK_SIZE + P * 2;
  const baseH = new Int16Array(PW * PW);
  for (let pz = 0; pz < PW; pz++) {
    for (let px = 0; px < PW; px++) {
      baseH[pz * PW + px] = surfaceHeightAt(seed, ox + px - P, oz + pz - P);
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
      const top = topMaterialAt(seed, wx, wz, h, slope, nearWater);
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
      if (h < SEA_LEVEL) {
        for (let y = Math.max(Y_MIN, h); y < SEA_LEVEL; y++) {
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
      const h = surfaceHeightAt(world.seed, x, z);
      const slope = slopeAt(world.seed, x, z, h);
      const index = lz * CHUNK_SIZE + lx;
      columns.heights[index] = clamp(h - Y_MIN, 0, WORLD_HEIGHT - 1);
      columns.topMaterials[index] = topMaterialAt(world.seed, x, z, h, slope);
    }
  }
  cache.set(chunk.key, columns);
  return columns;
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

// src/render/terrain.ts
var M = palette_default.materials;
var H = (k) => M[k].hex;
var colorCache = /* @__PURE__ */ new Map();
function c(hex) {
  let out = colorCache.get(hex);
  if (!out) {
    out = new THREE.Color(hex);
    colorCache.set(hex, out);
  }
  return out;
}
var COL = {
  grassTop: [c(H("grass_top")), c(H("grass_high")), c(H("grass_peak"))],
  grassCap: c(H("grass_cap")),
  soil: c(H("strata_ochre")).clone().multiplyScalar(0.78),
  ochre: c(H("strata_ochre")),
  rust: c(H("strata_rust")),
  stoneTop: c(H("stone_top")),
  stoneA: c(H("stone_body_a")),
  stoneB: c(H("stone_body_b")),
  stoneShade: c(H("stone_shade")),
  sand: c(H("sand")),
  gravel: c(H("stone_body_b")).clone().lerp(c(H("sand")), 0.35),
  ore: c(H("ore_crystal")),
  moss: c(H("grass_cap")).clone().lerp(c(H("stone_body_b")), 0.35),
  waterRim: c(H("water_rim")),
  waterShallow: c(H("water_shallow")),
  waterMid: c(H("water_mid")),
  waterDeep: c(H("water_deep"))
};
function heightBand(y) {
  return y >= 45 ? 2 : y >= 18 ? 1 : 0;
}
var terrainMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  side: THREE.FrontSide
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
function macroEditKey(world) {
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
      const h = surfaceHeightAt(world.seed, Math.round(x), Math.round(z));
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
      tops[idx] = baseTopMaterial(world.seed, Math.round(x), Math.round(z), h, slope, nearWater);
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
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMy5sb2QudGVzdC50cyIsICIuLi8uLi9zcmMvcmVuZGVyL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL2RhdGEvcGFsZXR0ZS5qc29uIiwgIi4uLy4uL3NyYy9zaW0vc3RvbmUtY29tcGF0LnRzIiwgIi4uLy4uL3NyYy9zaW0vd29ybGQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB0ZXN0IGZyb20gJ25vZGU6dGVzdCc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCc7XG5pbXBvcnQgeyBidWlsZE1hY3JvTWVzaCwgc2FtcGxlTWFjcm9UZXJyYWluIH0gZnJvbSAnLi4vc3JjL3JlbmRlci90ZXJyYWluJztcbmltcG9ydCB7XG4gIE1BVCwgY3JlYXRlV29ybGQsIGVuc3VyZUNodW5rLCBldmljdENodW5rLCBzZXRWb3hlbCwgc3VyZmFjZUF0LCBzdXJmYWNlSGVpZ2h0QXQsXG4gIHRvcE1hdGVyaWFsQXRXb3JsZCwgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG59IGZyb20gJy4uL3NyYy9zaW0vd29ybGQnO1xuXG50ZXN0KCdtYWNybyBzYW1wbGluZyByZWFkcyBhdXRob3JpdGF0aXZlIGVkaXRlZCBoZWlnaHQvbWF0ZXJpYWwgd2l0aG91dCBzY2FubmluZyB1bmVkaXRlZCBjaHVua3MnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoMTMzNyk7XG4gIGNvbnN0IGVkaXRlZCA9IHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCk7XG4gIGNvbnN0IHggPSBNYXRoLnJvdW5kKGVkaXRlZC54KSwgeiA9IE1hdGgucm91bmQoZWRpdGVkLnopO1xuICBjb25zdCBiZWZvcmVDaHVua3MgPSB3b3JsZC5jaHVua3Muc2l6ZTtcbiAgY29uc3QgdW50b3VjaGVkID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCA4KTtcbiAgY29uc3Qgb3JpZ2luYWwgPSBzdXJmYWNlSGVpZ2h0QXQod29ybGQuc2VlZCwgeCwgeikgPj0gMiA/IE1BVC5HUkFTUyA6IE1BVC5TVE9ORTtcblxuICBhc3NlcnQuZXF1YWwoZWRpdGVkLmhlaWdodCwgc3VyZmFjZUhlaWdodEF0KHdvcmxkLnNlZWQsIHgsIHopKTtcbiAgYXNzZXJ0LmVxdWFsKHdvcmxkLmNodW5rcy5zaXplLCAwLCAnYmFzZSBtYWNybyBzYW1wbGluZyBtdXN0IG5vdCBtYXRlcmlhbGl6ZSBjaHVua3MnKTtcbiAgYXNzZXJ0Lm9rKHNldFZveGVsKHdvcmxkLCB4LCBlZGl0ZWQuaGVpZ2h0LCB6LCBNQVQuT1JFKSk7XG4gIGNvbnN0IGFmdGVyID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKGFmdGVyLmhlaWdodCwgZWRpdGVkLmhlaWdodCArIDEpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIudG9wLCBNQVQuT1JFKTtcbiAgYXNzZXJ0LmVxdWFsKGFmdGVyLnVuZGVyd2F0ZXIsIGZhbHNlKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDgpLCB1bnRvdWNoZWQpO1xuICBhc3NlcnQuZXF1YWwod29ybGQuY2h1bmtzLnNpemUsIGJlZm9yZUNodW5rcyArIDEsICdvbmx5IHRoZSBlZGl0ZWQgY2h1bmsgc2hvdWxkIGJlIG1hdGVyaWFsaXplZCcpO1xuICBhc3NlcnQubm90RXF1YWwob3JpZ2luYWwsIE1BVC5PUkUpO1xufSk7XG5cbnRlc3QoJ2VkaXQgcmV2ZXJzYWwgYW5kIGNodW5rIGV2aWN0aW9uIGludmFsaWRhdGUgbWFjcm8gdmFsdWVzIGFuZCByZXN0b3JlIGRlbHRhcycsICgpID0+IHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgY2VsbCA9IHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCk7XG4gIGNvbnN0IHggPSBNYXRoLnJvdW5kKGNlbGwueCksIHogPSBNYXRoLnJvdW5kKGNlbGwueik7XG4gIGNvbnN0IG9yaWdpbmFsID0gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkLCB4LCB6KTtcbiAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KHdvcmxkVG9DaHVua1goeCksIHdvcmxkVG9DaHVua1ooeikpO1xuXG4gIGFzc2VydC5vayhzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgTUFULlNUT05FKSk7XG4gIGNvbnN0IGVkaXRlZCA9IHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCk7XG4gIGFzc2VydC5lcXVhbChlZGl0ZWQuaGVpZ2h0LCB5ICsgMSk7XG4gIGFzc2VydC5lcXVhbChlZGl0ZWQudG9wLCBNQVQuU1RPTkUpO1xuICBldmljdENodW5rKHdvcmxkLCBrZXkpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCksIGVkaXRlZCwgJ2V2aWN0aW9uIGxvc2VzIHRoZSBkdXJhYmxlIGVkaXQnKTtcblxuICBhc3NlcnQub2soc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIE1BVC5BSVIpKTtcbiAgZXZpY3RDaHVuayh3b3JsZCwga2V5KTtcbiAgYXNzZXJ0LmVxdWFsKHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCkuaGVpZ2h0LCB5KTtcbiAgYXNzZXJ0Lm9rKHNldFZveGVsKHdvcmxkLCB4LCB5IC0gMSwgeiwgb3JpZ2luYWwgPT09IE1BVC5PUkUgPyBNQVQuU1RPTkUgOiBNQVQuT1JFKSk7XG4gIGNvbnN0IG1hdGVyaWFsRWRpdCA9IHNhbXBsZU1hY3JvVGVycmFpbih3b3JsZCwgMCwgMCk7XG4gIGFzc2VydC5ub3RFcXVhbChtYXRlcmlhbEVkaXQudG9wLCBvcmlnaW5hbCk7XG4gIGFzc2VydC5lcXVhbChzZXRWb3hlbCh3b3JsZCwgeCwgeSAtIDEsIHosIG9yaWdpbmFsKSwgdHJ1ZSk7XG4gIGNvbnN0IHJldmVyc2VkID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKHJldmVyc2VkLmhlaWdodCwgeSk7XG4gIGFzc2VydC5lcXVhbChyZXZlcnNlZC50b3AsIG9yaWdpbmFsKTtcbn0pO1xuXG50ZXN0KCdtYXAgbWFjcm8gbWVzaCBpbmNsdWRlcyB0aGUgbmVhciBlZGl0ZWQgZWFydGh3b3JrIGF0IGZ1bGwgc3VyZmFjZSBoZWlnaHQnLCAoKSA9PiB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoMTMzNyk7XG4gIGNvbnN0IGNlbGwgPSBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDApO1xuICBjb25zdCB4ID0gTWF0aC5yb3VuZChjZWxsLngpLCB6ID0gTWF0aC5yb3VuZChjZWxsLnopO1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgYXNzZXJ0Lm9rKHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBNQVQuU1RPTkUpKTtcblxuICBjb25zdCBtZXNoSGVpZ2h0ID0gKG1lc2g6IFJldHVyblR5cGU8dHlwZW9mIGJ1aWxkTWFjcm9NZXNoPlsnbWVzaCddKTogbnVtYmVyID0+IHtcbiAgICBsZXQgaGVpZ2h0ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICAgIGNvbnN0IHBvc2l0aW9uID0gbWVzaC5nZW9tZXRyeS5nZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJyk7XG4gICAgY29uc3Qgbm9ybWFsID0gbWVzaC5nZW9tZXRyeS5nZXRBdHRyaWJ1dGUoJ25vcm1hbCcpO1xuICAgIC8vIE1hY3JvIGdlb21ldHJ5IGlzIG5vbi1pbmRleGVkOiBlYWNoIHF1YWQgb3ducyBmb3VyIGNvbnNlY3V0aXZlIHZlcnRpY2VzLlxuICAgIC8vIFByb2JlIGl0cyBmaXJzdCBjb3JuZXIgc28gbmVpZ2hib3JpbmcgY2VsbHMnIHNoYXJlZCB2ZXJ0aWNlcyBjYW5ub3QgbWF0Y2guXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwb3NpdGlvbi5jb3VudDsgaSArPSA0KSB7XG4gICAgICBpZiAocG9zaXRpb24uZ2V0WChpKSA9PT0gY2VsbC54IC0gNCAmJiBwb3NpdGlvbi5nZXRaKGkpID09PSBjZWxsLnogLSA0ICYmIG5vcm1hbC5nZXRZKGkpID09PSAxKSB7XG4gICAgICAgIGhlaWdodCA9IE1hdGgubWF4KGhlaWdodCwgcG9zaXRpb24uZ2V0WShpKSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBoZWlnaHQ7XG4gIH07XG4gIGNvbnN0IHdpdGhIb2xlID0gYnVpbGRNYWNyb01lc2god29ybGQsIHtcbiAgICBzdGVwOiA4LCBob2xlOiB7XG4gICAgICBtaW5YOiBjZWxsLnggLSA0LCBtYXhYOiBjZWxsLnggKyA0LCBtaW5aOiBjZWxsLnogLSA0LCBtYXhaOiBjZWxsLnogKyA0LFxuICAgIH0sXG4gIH0pO1xuICBjb25zdCBtYXAgPSBidWlsZE1hY3JvTWVzaCh3b3JsZCwgeyBzdGVwOiA4IH0pO1xuICBhc3NlcnQuZXF1YWwobWVzaEhlaWdodCh3aXRoSG9sZS5tZXNoKSwgTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLCAnd29ybGQgbmVhciByaW5nIHNob3VsZCBvd24gdGhlIGhvbGUnKTtcbiAgYXNzZXJ0LmVxdWFsKG1lc2hIZWlnaHQobWFwLm1lc2gpLCB5ICsgMSwgJ21hcCBtdXN0IG5vdCBoaWRlIHRoZSBlZGl0ZWQgZWFydGh3b3JrJyk7XG4gIHdpdGhIb2xlLm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICBtYXAubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG59KTtcblxudGVzdCgnc2FtZS1zZWVkIHdvcmxkcyBhbmQgdW5yZWxhdGVkIGVkaXRzIGRvIG5vdCBzaGFyZSBlZGl0ZWQgbWFjcm8gY2FjaGVzJywgKCkgPT4ge1xuICBjb25zdCBhID0gY3JlYXRlV29ybGQoMTMzNyk7XG4gIGNvbnN0IGIgPSBjcmVhdGVXb3JsZCgxMzM3KTtcbiAgY29uc3QgYmFzZSA9IHNhbXBsZU1hY3JvVGVycmFpbihhLCAwLCAwKTtcbiAgY29uc3QgeCA9IE1hdGgucm91bmQoYmFzZS54KSwgeiA9IE1hdGgucm91bmQoYmFzZS56KTtcbiAgYXNzZXJ0Lm9rKHNldFZveGVsKGEsIHgsIGJhc2UuaGVpZ2h0LCB6LCBNQVQuT1JFKSk7XG4gIGFzc2VydC5lcXVhbChzYW1wbGVNYWNyb1RlcnJhaW4oYSwgMCwgMCkudG9wLCBNQVQuT1JFKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChzYW1wbGVNYWNyb1RlcnJhaW4oYiwgMCwgMCksIGJhc2UsICdhbm90aGVyIHdvcmxkIHJlY2VpdmVkIHRoZSBlZGl0Jyk7XG5cbiAgY29uc3QgZGlzdGFudCA9IHNhbXBsZU1hY3JvVGVycmFpbihhLCAzMiwgMCk7XG4gIGNvbnN0IGR4ID0gTWF0aC5yb3VuZChkaXN0YW50LngpLCBkeiA9IE1hdGgucm91bmQoZGlzdGFudC56KTtcbiAgYXNzZXJ0Lm9rKHNldFZveGVsKGEsIGR4LCBkaXN0YW50LmhlaWdodCwgZHosIE1BVC5TVE9ORSkpO1xuICBhc3NlcnQuZXF1YWwoc2FtcGxlTWFjcm9UZXJyYWluKGEsIDAsIDApLnRvcCwgTUFULk9SRSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoc2FtcGxlTWFjcm9UZXJyYWluKGIsIDMyLCAwKSwgZGlzdGFudCk7XG59KTtcblxudGVzdCgnYW4gZXZpY3RlZCBlZGl0ZWQgY2h1bmsgaXMgdGhlIG9ubHkgY2h1bmsgbWF0ZXJpYWxpemVkIGJ5IG1hY3JvIHNhbXBsaW5nJywgKCkgPT4ge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKDEzMzcpO1xuICBjb25zdCBjZWxsID0gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkLCAwLCAwKTtcbiAgY29uc3QgeCA9IE1hdGgucm91bmQoY2VsbC54KSwgeiA9IE1hdGgucm91bmQoY2VsbC56KTtcbiAgYXNzZXJ0Lm9rKHNldFZveGVsKHdvcmxkLCB4LCBjZWxsLmhlaWdodCwgeiwgTUFULlNUT05FKSk7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KHdvcmxkVG9DaHVua1goeCksIHdvcmxkVG9DaHVua1ooeikpO1xuICBldmljdENodW5rKHdvcmxkLCBrZXkpO1xuICBhc3NlcnQuZXF1YWwod29ybGQuY2h1bmtzLnNpemUsIDApO1xuICBzYW1wbGVNYWNyb1RlcnJhaW4od29ybGQsIDAsIDApO1xuICBhc3NlcnQuZXF1YWwoZW5zdXJlQ2h1bmsod29ybGQsIHdvcmxkVG9DaHVua1goeCksIHdvcmxkVG9DaHVua1ooeikpPy5rZXksIGtleSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoWy4uLndvcmxkLmNodW5rcy5rZXlzKCldLCBba2V5XSk7XG59KTtcbiIsICIvLyBSZW5kZXIgbGF5ZXIgXHUyMDE0IGNodW5rZWQgM0Qgdm94ZWwgbWVzaGVyICsgc3RyZWFtaW5nICsgbWFjcm8gTE9ELlxuLy9cbi8vIFRoZSB2aXNpYmxlIHN1cmZhY2UgaXMgZGVyaXZlZCBmcm9tIHRoZSBzaW0ncyBvY2N1cGFuY3kvbWF0ZXJpYWwgdm9sdW1lLlxuLy8gTmVhciBjaHVua3MgYXJlIG1lc2hlZCBhdCAxIG0gd2l0aCBncmVlZHkgZmFjZSBtZXJnaW5nOyB0aGUgZmFyIGxhbmRzY2FwZSBpc1xuLy8gYW4gOCBtICh3b3JsZCkgLyA4IG0gKG1hcCkgbWFjcm8gTE9EIHNhbXBsZWQgZnJvbSB0aGUgc2FtZSBkZXRlcm1pbmlzdGljXG4vLyBnZW5lcmF0b3IuIFdhdGVyIGlzIGEgc2luZ2xlIHNlYS1sZXZlbCBzdXJmYWNlIGRlcml2ZWQgZnJvbSB0aGUgc2VhYmVkIGRlcHRoLlxuLy9cbi8vIE5vIGFwcm9uLCBob3Jpem9uIHJpbmcgb3IgZm91bmRhdGlvbiBza2lydDogdGhlIHdvcmxkIGVkZ2UgaXMgb2NlYW4sIGFuZCB0aGVcbi8vIG9jZWFuIHN1cmZhY2UgZXh0ZW5kcyBmYXIgYmV5b25kIHRoZSAyMDQ4IG0gcGxheWFibGUgaXNsYW5kLlxuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0IHBhbGV0dGUgZnJvbSAnLi4vZGF0YS9wYWxldHRlLmpzb24nO1xuaW1wb3J0IHtcbiAgV29ybGQsIFZveGVsQ2h1bmssIE1hdElkLCBTdXJmYWNlU2FtcGxlLCBHRU5FUkFUT1JfVkVSU0lPTixcbiAgV09STERfU0laRSwgSEFMRiwgQ0hVTktfU0laRSwgQ0hVTktTX1BFUl9TSURFLCBDSFVOS19BUkVBLCBXT1JMRF9IRUlHSFQsXG4gIFlfTUlOLCBZX01BWCwgU0VBX0xFVkVMLCBNQVQsIGlzT3BhcXVlLFxuICBjaHVua0tleSwgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosIGxvY2FsSW5kZXgsIHlUb0luZGV4LFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCB3b3JsZFRvTG9jYWxYLCB3b3JsZFRvTG9jYWxaLFxuICBnZXRWb3hlbCwgZW5zdXJlQ2h1bmssIGV2aWN0Q2h1bmssIHN1cmZhY2VIZWlnaHRBdCwgYmFzZVRvcE1hdGVyaWFsLCBoYXNoMmksIGZibTIsXG59IGZyb20gJy4uL3NpbS93b3JsZCc7XG5cbmNvbnN0IE0gPSBwYWxldHRlLm1hdGVyaWFscyBhcyBSZWNvcmQ8c3RyaW5nLCB7IGhleDogc3RyaW5nIH0+O1xuY29uc3QgSCA9IChrOiBzdHJpbmcpID0+IE1ba10uaGV4O1xuXG5jb25zdCBjb2xvckNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFRIUkVFLkNvbG9yPigpO1xuZnVuY3Rpb24gYyhoZXg6IHN0cmluZyk6IFRIUkVFLkNvbG9yIHtcbiAgbGV0IG91dCA9IGNvbG9yQ2FjaGUuZ2V0KGhleCk7XG4gIGlmICghb3V0KSB7IG91dCA9IG5ldyBUSFJFRS5Db2xvcihoZXgpOyBjb2xvckNhY2hlLnNldChoZXgsIG91dCk7IH1cbiAgcmV0dXJuIG91dDtcbn1cblxuY29uc3QgQ09MID0ge1xuICBncmFzc1RvcDogW2MoSCgnZ3Jhc3NfdG9wJykpLCBjKEgoJ2dyYXNzX2hpZ2gnKSksIGMoSCgnZ3Jhc3NfcGVhaycpKV0sXG4gIGdyYXNzQ2FwOiBjKEgoJ2dyYXNzX2NhcCcpKSxcbiAgc29pbDogYyhIKCdzdHJhdGFfb2NocmUnKSkuY2xvbmUoKS5tdWx0aXBseVNjYWxhcigwLjc4KSxcbiAgb2NocmU6IGMoSCgnc3RyYXRhX29jaHJlJykpLFxuICBydXN0OiBjKEgoJ3N0cmF0YV9ydXN0JykpLFxuICBzdG9uZVRvcDogYyhIKCdzdG9uZV90b3AnKSksXG4gIHN0b25lQTogYyhIKCdzdG9uZV9ib2R5X2EnKSksXG4gIHN0b25lQjogYyhIKCdzdG9uZV9ib2R5X2InKSksXG4gIHN0b25lU2hhZGU6IGMoSCgnc3RvbmVfc2hhZGUnKSksXG4gIHNhbmQ6IGMoSCgnc2FuZCcpKSxcbiAgZ3JhdmVsOiBjKEgoJ3N0b25lX2JvZHlfYicpKS5jbG9uZSgpLmxlcnAoYyhIKCdzYW5kJykpLCAwLjM1KSxcbiAgb3JlOiBjKEgoJ29yZV9jcnlzdGFsJykpLFxuICBtb3NzOiBjKEgoJ2dyYXNzX2NhcCcpKS5jbG9uZSgpLmxlcnAoYyhIKCdzdG9uZV9ib2R5X2InKSksIDAuMzUpLFxuICB3YXRlclJpbTogYyhIKCd3YXRlcl9yaW0nKSksXG4gIHdhdGVyU2hhbGxvdzogYyhIKCd3YXRlcl9zaGFsbG93JykpLFxuICB3YXRlck1pZDogYyhIKCd3YXRlcl9taWQnKSksXG4gIHdhdGVyRGVlcDogYyhIKCd3YXRlcl9kZWVwJykpLFxufTtcblxuY29uc3QgU0hBREUgPSBbMC45MCwgMC45NiwgMS4wLCAxLjA0XTtcblxuLy8gS2VlcCBhIHNtYWxsIHJvbGxpbmcgd2luZG93IG9mIGJ1aWxkIHRpbWluZ3MgZm9yIHRoZSBwZXJmb3JtYW5jZSBldmlkZW5jZS5cbi8vIFRoZXNlIGFyZSBpbnN0cnVtZW50YXRpb24sIG5vdCBzaW11bGF0aW9uIHN0YXRlLlxuY29uc3QgTUFYX1BFUkZfU0FNUExFUyA9IDEyODtcbmZ1bmN0aW9uIHJlY29yZFNhbXBsZShzYW1wbGVzOiBudW1iZXJbXSwgbXM6IG51bWJlcik6IHZvaWQge1xuICBzYW1wbGVzLnB1c2gobXMpO1xuICBpZiAoc2FtcGxlcy5sZW5ndGggPiBNQVhfUEVSRl9TQU1QTEVTKSBzYW1wbGVzLnNoaWZ0KCk7XG59XG5mdW5jdGlvbiBwZXJjZW50aWxlKHNhbXBsZXM6IG51bWJlcltdLCBwOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoc2FtcGxlcy5sZW5ndGggPT09IDApIHJldHVybiAwO1xuICBjb25zdCBzb3J0ZWQgPSBbLi4uc2FtcGxlc10uc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuICBjb25zdCBpID0gTWF0aC5taW4oc29ydGVkLmxlbmd0aCAtIDEsIE1hdGgubWF4KDAsIE1hdGguY2VpbChwICogc29ydGVkLmxlbmd0aCkgLSAxKSk7XG4gIHJldHVybiBNYXRoLnJvdW5kKHNvcnRlZFtpXSAqIDEwMCkgLyAxMDA7XG59XG5cbmZ1bmN0aW9uIGhlaWdodEJhbmQoeTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHkgPj0gNDUgPyAyIDogeSA+PSAxOCA/IDEgOiAwO1xufVxuZnVuY3Rpb24gc3RvbmVUb25lKHk6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiAoKHkgKyA2NCkgPj4gMykgJiAxO1xufVxuZnVuY3Rpb24gc2hhZGVBdCh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBzeCA9IE1hdGguZmxvb3IoeCAvIDIpICsgTWF0aC5mbG9vcih5IC8gMykgKiAxNztcbiAgY29uc3Qgc3ogPSBNYXRoLmZsb29yKHogLyAyKTtcbiAgcmV0dXJuIE1hdGguZmxvb3IoaGFzaDJpKHN4LCBzeiwgc2VlZCArIDMwMCkgKiA0KTtcbn1cblxuZnVuY3Rpb24ga2V5Rm9yKG1hdDogbnVtYmVyLCB2YXJpYW50OiBudW1iZXIsIHNoYWRlOiBudW1iZXIsIGF4aXM6IG51bWJlciwgZGlyOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gKG1hdCAmIDE1KSB8ICgodmFyaWFudCAmIDE1KSA8PCA0KSB8ICgoc2hhZGUgJiAzKSA8PCA4KSB8ICgoYXhpcyAmIDMpIDw8IDEwKSB8ICgoZGlyID4gMCA/IDEgOiAwKSA8PCAxMik7XG59XG5cbmNvbnN0IGZhY2VDb2xvckNhY2hlID0gbmV3IE1hcDxudW1iZXIsIFRIUkVFLkNvbG9yPigpO1xuXG5mdW5jdGlvbiBjb2xvckZvcktleShrZXk6IG51bWJlcik6IFRIUkVFLkNvbG9yIHtcbiAgY29uc3QgY2FjaGVkID0gZmFjZUNvbG9yQ2FjaGUuZ2V0KGtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG4gIGNvbnN0IG1hdCA9IGtleSAmIDE1O1xuICBjb25zdCB2YXJpYW50ID0gKGtleSA+PiA0KSAmIDE1O1xuICBjb25zdCBzaGFkZSA9IChrZXkgPj4gOCkgJiAzO1xuICBjb25zdCBheGlzID0gKGtleSA+PiAxMCkgJiAzO1xuICBjb25zdCBkaXIgPSAoa2V5ID4+IDEyKSAmIDE7XG4gIGxldCBjb2xvcjogVEhSRUUuQ29sb3I7XG5cbiAgaWYgKGF4aXMgPT09IDEgJiYgZGlyID09PSAxKSB7XG4gICAgY29uc3QgaGIgPSBNYXRoLm1pbigyLCB2YXJpYW50ICYgMyk7XG4gICAgaWYgKG1hdCA9PT0gTUFULkdSQVNTKSBjb2xvciA9IENPTC5ncmFzc1RvcFtoYl07XG4gICAgZWxzZSBpZiAobWF0ID09PSBNQVQuU0FORCkgY29sb3IgPSBDT0wuc2FuZDtcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5HUkFWRUwpIGNvbG9yID0gQ09MLmdyYXZlbDtcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5TT0lMKSBjb2xvciA9IENPTC5vY2hyZTtcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5PUkUpIGNvbG9yID0gQ09MLm9yZTtcbiAgICBlbHNlIGlmIChtYXQgPT09IE1BVC5NT1NTKSBjb2xvciA9IENPTC5tb3NzO1xuICAgIGVsc2UgY29sb3IgPSBDT0wuc3RvbmVUb3A7XG4gIH0gZWxzZSBpZiAoYXhpcyA9PT0gMSAmJiBkaXIgPT09IDApIHtcbiAgICBjb2xvciA9IENPTC5zdG9uZVNoYWRlO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGRlcHRoID0gdmFyaWFudCAmIDc7XG4gICAgY29uc3QgdG9uZSA9ICh2YXJpYW50ID4+IDMpICYgMTtcbiAgICBjb25zdCBib2R5ID0gdG9uZSA/IENPTC5zdG9uZUIgOiBDT0wuc3RvbmVBO1xuICAgIGlmIChtYXQgPT09IE1BVC5HUkFTUyB8fCBtYXQgPT09IE1BVC5NT1NTKSB7XG4gICAgICBpZiAoZGVwdGggPT09IDApIGNvbG9yID0gbWF0ID09PSBNQVQuTU9TUyA/IENPTC5tb3NzIDogQ09MLmdyYXNzQ2FwO1xuICAgICAgZWxzZSBpZiAoZGVwdGggPD0gMikgY29sb3IgPSBDT0wuc29pbDtcbiAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAzKSBjb2xvciA9IENPTC5ydXN0O1xuICAgICAgZWxzZSBjb2xvciA9IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TT0lMKSB7XG4gICAgICBjb2xvciA9IGRlcHRoIDw9IDEgPyBDT0wuc29pbCA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5TQU5EKSB7XG4gICAgICBjb2xvciA9IGRlcHRoIDw9IDEgPyBDT0wuc2FuZCA6IGRlcHRoID09PSAyID8gQ09MLm9jaHJlIDogYm9keTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULkdSQVZFTCkge1xuICAgICAgY29sb3IgPSBkZXB0aCA8PSAxID8gQ09MLmdyYXZlbCA6IGJvZHk7XG4gICAgfSBlbHNlIGlmIChtYXQgPT09IE1BVC5PUkUpIHtcbiAgICAgIGNvbG9yID0gQ09MLm9yZTtcbiAgICB9IGVsc2UgaWYgKG1hdCA9PT0gTUFULkJFRFJPQ0spIHtcbiAgICAgIGNvbG9yID0gQ09MLnN0b25lU2hhZGU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbG9yID0gYm9keTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBvdXQgPSBjb2xvci5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKFNIQURFW3NoYWRlXSk7XG4gIGZhY2VDb2xvckNhY2hlLnNldChrZXksIG91dCk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmNvbnN0IHRlcnJhaW5NYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgdmVydGV4Q29sb3JzOiB0cnVlLFxuICBzaWRlOiBUSFJFRS5Gcm9udFNpZGUsXG59KTtcbnRlcnJhaW5NYXRlcmlhbC5vbkJlZm9yZUNvbXBpbGUgPSAoc2hhZGVyKSA9PiB7XG4gIHNoYWRlci52ZXJ0ZXhTaGFkZXIgPSBzaGFkZXIudmVydGV4U2hhZGVyXG4gICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgJyNpbmNsdWRlIDxjb21tb24+XFxuYXR0cmlidXRlIGZsb2F0IGFNYXQ7XFxudmFyeWluZyB2ZWMzIHZXUG9zO1xcbnZhcnlpbmcgdmVjMyB2V05ybTtcXG52YXJ5aW5nIGZsb2F0IHZNYXQ7JylcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD4nLCAnI2luY2x1ZGUgPGJlZ2luX3ZlcnRleD5cXG52V1BvcyA9IChtb2RlbE1hdHJpeCAqIHZlYzQodHJhbnNmb3JtZWQsIDEuMCkpLnh5ejtcXG52V05ybSA9IG5vcm1hbGl6ZShtYXQzKG1vZGVsTWF0cml4KSAqIG9iamVjdE5vcm1hbCk7XFxudk1hdCA9IGFNYXQ7Jyk7XG4gIHNoYWRlci5mcmFnbWVudFNoYWRlciA9IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsIGAjaW5jbHVkZSA8Y29tbW9uPlxudmFyeWluZyB2ZWMzIHZXUG9zO1xudmFyeWluZyB2ZWMzIHZXTnJtO1xudmFyeWluZyBmbG9hdCB2TWF0O1xuZmxvYXQgaDIxKHZlYzIgcCkgeyByZXR1cm4gZnJhY3Qoc2luKGRvdChwLCB2ZWMyKDEyNy4xLCAzMTEuNykpKSAqIDQzNzU4LjU0NTMxMjMpOyB9XG5mbG9hdCB2bjIodmVjMiBwKSB7XG4gIHZlYzIgaSA9IGZsb29yKHApOyB2ZWMyIGYgPSBmcmFjdChwKTsgZiA9IGYgKiBmICogKDMuMCAtIDIuMCAqIGYpO1xuICByZXR1cm4gbWl4KG1peChoMjEoaSksIGgyMShpICsgdmVjMigxLjAsIDAuMCkpLCBmLngpLFxuICAgICAgICAgICAgIG1peChoMjEoaSArIHZlYzIoMC4wLCAxLjApKSwgaDIxKGkgKyB2ZWMyKDEuMCwgMS4wKSksIGYueCksIGYueSk7XG59YClcbiAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGNvbG9yX2ZyYWdtZW50PicsIGAjaW5jbHVkZSA8Y29sb3JfZnJhZ21lbnQ+XG57XG4gIHZlYzMgbiA9IG5vcm1hbGl6ZSh2V05ybSk7XG4gIGZsb2F0IHZlcnQgPSAxLjAgLSBzbW9vdGhzdGVwKDAuMzUsIDAuNzAsIGFicyhuLnkpKTtcbiAgZmxvYXQgaXNHcmFzcyA9ICgodk1hdCA+IDAuNSAmJiB2TWF0IDwgMS41KSB8fCAodk1hdCA+IDguNSAmJiB2TWF0IDwgOS41KSkgPyAxLjAgOiAwLjA7XG4gIGZsb2F0IGlzU3RvbmUgPSAoKHZNYXQgPiA0LjUgJiYgdk1hdCA8IDYuNSkgfHwgKHZNYXQgPiA3LjUgJiYgdk1hdCA8IDguNSkpID8gMS4wIDogMC4wO1xuXG4gIGZsb2F0IGhvcml6ID0gYWJzKG4ueCkgPiBhYnMobi56KSA/IHZXUG9zLnogOiB2V1Bvcy54O1xuICBmbG9hdCByb3cgPSBmbG9vcih2V1Bvcy55KTtcbiAgZmxvYXQgY29sID0gZmxvb3IoaG9yaXopO1xuICBmbG9hdCBoID0gaDIxKHZlYzIoY29sLCByb3cpKTtcbiAgdmVjMiBmID0gdmVjMihmcmFjdChob3JpeiksIGZyYWN0KHZXUG9zLnkpKTtcbiAgZmxvYXQgam9pbnQgPSBzbW9vdGhzdGVwKDAuMCwgMC4wNTUsIG1pbihmLngsIDEuMCAtIGYueCkpXG4gICAgICAgICAgICAgICogc21vb3Roc3RlcCgwLjAsIDAuMDUwLCBtaW4oZi55LCAxLjAgLSBmLnkpKTtcbiAgdmVjMyBzdG9uZSA9IG1peCh2ZWMzKDAuNjIsIDAuNjIsIDAuNTgpLCB2ZWMzKDEuMDQsIDEuMDIsIDAuOTUpLCBoKTtcbiAgc3RvbmUgKj0gbWl4KDAuOTAsIDEuMCwgam9pbnQpO1xuICBzdG9uZSAqPSBtaXgoMC45MywgMS4wLCBzbW9vdGhzdGVwKDAuMCwgMC4zMCwgZi55KSk7XG4gIGRpZmZ1c2VDb2xvci5yZ2IgKj0gbWl4KHZlYzMoMS4wKSwgc3RvbmUsIHZlcnQgKiBpc1N0b25lKTtcblxuICBmbG9hdCBneSA9IHNtb290aHN0ZXAoMC40NSwgMC44OCwgYWJzKG4ueSkpO1xuICBmbG9hdCBnMSA9IHZuMih2V1Bvcy54eiAqIDEuMzUpO1xuICBmbG9hdCBnMiA9IHZuMih2V1Bvcy54eiAqIDAuMTEpO1xuICB2ZWMzIGdyYXNzID0gbWl4KHZlYzMoMC44MiwgMC44NiwgMC43MiksIHZlYzMoMS4wNiwgMS4wNCwgMC45OCksIGcxICogMC40MiArIGcyICogMC40NiArIHZuMih2V1Bvcy54eiAqIDQuMykgKiAwLjEyKTtcbiAgZmxvYXQgY2VsbCA9IGgyMShmbG9vcih2V1Bvcy54eikgKyAxNy4wKTtcbiAgZ3Jhc3MgKj0gMC45NSArIDAuMTAgKiBjZWxsO1xuICBkaWZmdXNlQ29sb3IucmdiICo9IG1peCh2ZWMzKDEuMCksIGdyYXNzLCBneSAqIGlzR3Jhc3MpO1xufWApO1xufTtcblxuaW50ZXJmYWNlIE1lc2hSZXN1bHQgeyBnZW9tZXRyeTogVEhSRUUuQnVmZmVyR2VvbWV0cnk7IHRyaWFuZ2xlczogbnVtYmVyOyB9XG5cbmZ1bmN0aW9uIHBvc0Zyb20oYXhpczogbnVtYmVyLCBzbGljZTogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlcik6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB7XG4gIGlmIChheGlzID09PSAwKSByZXR1cm4gW3NsaWNlLCBpLCBqXTtcbiAgaWYgKGF4aXMgPT09IDEpIHJldHVybiBbaiwgc2xpY2UsIGldO1xuICByZXR1cm4gW2ksIGosIHNsaWNlXTtcbn1cblxuLyoqXG4gKiBHcmVlZHkgM0QgZmFjZSBtZXNoZXIuIEEgZmFjZSBpcyBlbWl0dGVkIHdoZW4gYW4gb3BhcXVlIHZveGVsIHRvdWNoZXMgYVxuICogbm9uLW9wYXF1ZSBjZWxsIChhaXIgb3Igd2F0ZXIpLiBXYXRlciBpdHNlbGYgaXMgcmVuZGVyZWQgYnkgdGhlIHNlYS1sZXZlbFxuICogc3VyZmFjZSwgbm90IGFzIGEgdm94ZWwgbWVzaC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lc2hDaHVuayh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogTWVzaFJlc3VsdCB7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBkYXRhID0gY2h1bmsuZGF0YTtcbiAgY29uc3Qgc2FtcGxlID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGlmICh4ID49IDAgJiYgeCA8IENIVU5LX1NJWkUgJiYgeiA+PSAwICYmIHogPCBDSFVOS19TSVpFICYmIHkgPj0gMCAmJiB5IDwgV09STERfSEVJR0hUKSB7XG4gICAgICByZXR1cm4gZGF0YVtsb2NhbEluZGV4KHgsIHksIHopXTtcbiAgICB9XG4gICAgcmV0dXJuIGdldFZveGVsKHdvcmxkLCBveCArIHgsIFlfTUlOICsgeSwgb3ogKyB6KTtcbiAgfTtcblxuICBjb25zdCBwb3NpdGlvbnM6IG51bWJlcltdID0gW107XG4gIGNvbnN0IG5vcm1hbHM6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGNvbG9yczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgbWF0czogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgaW5kaWNlczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgZGltcyA9IFtDSFVOS19TSVpFLCBXT1JMRF9IRUlHSFQsIENIVU5LX1NJWkVdO1xuXG4gIGNvbnN0IGVtaXRRdWFkID0gKFxuICAgIGF4aXM6IG51bWJlciwgZGlyOiBudW1iZXIsIHNsaWNlOiBudW1iZXIsXG4gICAgaTA6IG51bWJlciwgajA6IG51bWJlciwgdzogbnVtYmVyLCBoOiBudW1iZXIsIGtleTogbnVtYmVyLFxuICApID0+IHtcbiAgICAvLyBUaGUgZmFjZSBsaWVzIG9uIHRoZSBib3VuZGFyeSBiZXR3ZWVuIHNsaWNlIGFuZCBzbGljZSsxIGZvciBib3RoXG4gICAgLy8gZGlyZWN0aW9ucy4gVXNpbmcgYHNsaWNlYCBmb3IgbmVnYXRpdmUgZmFjZXMgc2hpZnRlZCBldmVyeSAteC8teS8telxuICAgIC8vIGZhY2Ugb25lIHZveGVsIGludG8gdGhlIGFpciBjZWxsLCBsZWF2aW5nIDEgbSBzbGl0cyBpbiB0aGUgdGVycmFpbi5cbiAgICBjb25zdCBwbGFuZSA9IHNsaWNlICsgMTtcbiAgICBjb25zdCB1MCA9IGkwLCB1MSA9IGkwICsgdywgdjAgPSBqMCwgdjEgPSBqMCArIGg7XG4gICAgbGV0IHA6IG51bWJlcltdW107XG4gICAgaWYgKGF4aXMgPT09IDApIHtcbiAgICAgIGNvbnN0IHggPSBveCArIHBsYW5lLCB5MCA9IFlfTUlOICsgdTAsIHkxID0gWV9NSU4gKyB1MSwgejAgPSBveiArIHYwLCB6MSA9IG96ICsgdjE7XG4gICAgICBwID0gZGlyID4gMFxuICAgICAgICA/IFtbeCwgeTAsIHowXSwgW3gsIHkxLCB6MF0sIFt4LCB5MSwgejFdLCBbeCwgeTAsIHoxXV1cbiAgICAgICAgOiBbW3gsIHkwLCB6MF0sIFt4LCB5MCwgejFdLCBbeCwgeTEsIHoxXSwgW3gsIHkxLCB6MF1dO1xuICAgIH0gZWxzZSBpZiAoYXhpcyA9PT0gMSkge1xuICAgICAgY29uc3QgeSA9IFlfTUlOICsgcGxhbmUsIHowID0gb3ogKyB1MCwgejEgPSBveiArIHUxLCB4MCA9IG94ICsgdjAsIHgxID0gb3ggKyB2MTtcbiAgICAgIHAgPSBkaXIgPiAwXG4gICAgICAgID8gW1t4MCwgeSwgejBdLCBbeDAsIHksIHoxXSwgW3gxLCB5LCB6MV0sIFt4MSwgeSwgejBdXVxuICAgICAgICA6IFtbeDAsIHksIHowXSwgW3gxLCB5LCB6MF0sIFt4MSwgeSwgejFdLCBbeDAsIHksIHoxXV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHogPSBveiArIHBsYW5lLCB4MCA9IG94ICsgdTAsIHgxID0gb3ggKyB1MSwgeTAgPSBZX01JTiArIHYwLCB5MSA9IFlfTUlOICsgdjE7XG4gICAgICBwID0gZGlyID4gMFxuICAgICAgICA/IFtbeDAsIHkwLCB6XSwgW3gxLCB5MCwgel0sIFt4MSwgeTEsIHpdLCBbeDAsIHkxLCB6XV1cbiAgICAgICAgOiBbW3gwLCB5MCwgel0sIFt4MCwgeTEsIHpdLCBbeDEsIHkxLCB6XSwgW3gxLCB5MCwgel1dO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbG9yID0gY29sb3JGb3JLZXkoa2V5KTtcbiAgICBjb25zdCBtYXQgPSBrZXkgJiAxNTtcbiAgICBjb25zdCBueCA9IGF4aXMgPT09IDAgPyBkaXIgOiAwO1xuICAgIGNvbnN0IG55ID0gYXhpcyA9PT0gMSA/IGRpciA6IDA7XG4gICAgY29uc3QgbnogPSBheGlzID09PSAyID8gZGlyIDogMDtcbiAgICBjb25zdCBiYXNlID0gcG9zaXRpb25zLmxlbmd0aCAvIDM7XG4gICAgZm9yIChjb25zdCB2IG9mIHApIHtcbiAgICAgIHBvc2l0aW9ucy5wdXNoKHZbMF0sIHZbMV0sIHZbMl0pO1xuICAgICAgbm9ybWFscy5wdXNoKG54LCBueSwgbnopO1xuICAgICAgY29sb3JzLnB1c2goY29sb3IuciwgY29sb3IuZywgY29sb3IuYik7XG4gICAgICBtYXRzLnB1c2gobWF0KTtcbiAgICB9XG4gICAgaW5kaWNlcy5wdXNoKGJhc2UsIGJhc2UgKyAxLCBiYXNlICsgMiwgYmFzZSwgYmFzZSArIDIsIGJhc2UgKyAzKTtcbiAgfTtcblxuICBmb3IgKGxldCBheGlzID0gMDsgYXhpcyA8IDM7IGF4aXMrKykge1xuICAgIGNvbnN0IHUgPSAoYXhpcyArIDEpICUgMztcbiAgICBjb25zdCB2ID0gKGF4aXMgKyAyKSAlIDM7XG4gICAgY29uc3QgZHUgPSBkaW1zW3VdLCBkdiA9IGRpbXNbdl0sIGRkID0gZGltc1theGlzXTtcbiAgICBjb25zdCBtYXNrID0gbmV3IFVpbnQxNkFycmF5KGR1ICogZHYpO1xuXG4gICAgZm9yIChsZXQgc2xpY2UgPSAtMTsgc2xpY2UgPCBkZDsgc2xpY2UrKykge1xuICAgICAgbWFzay5maWxsKDApO1xuICAgICAgbGV0IGFueSA9IGZhbHNlO1xuXG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGR2OyBqKyspIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkdTsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgW2F4LCBheSwgYXpdID0gcG9zRnJvbShheGlzLCBzbGljZSwgaSwgaik7XG4gICAgICAgICAgY29uc3QgW2J4LCBieSwgYnpdID0gcG9zRnJvbShheGlzLCBzbGljZSArIDEsIGksIGopO1xuICAgICAgICAgIGNvbnN0IGEgPSBzYW1wbGUoYXgsIGF5LCBheik7XG4gICAgICAgICAgY29uc3QgYiA9IHNhbXBsZShieCwgYnksIGJ6KTtcbiAgICAgICAgICBjb25zdCBhbyA9IGlzT3BhcXVlKGEpLCBibyA9IGlzT3BhcXVlKGIpO1xuICAgICAgICAgIGlmIChhbyA9PT0gYm8pIGNvbnRpbnVlO1xuXG4gICAgICAgICAgLy8gT25seSB0aGUgY2h1bmsgdGhhdCBvd25zIHRoZSBzb2xpZCB2b3hlbCBlbWl0cyBpdHMgZmFjZS4gQXQgdGhlXG4gICAgICAgICAgLy8gc2xpY2UgLTEvZGQgYm91bmRhcnkgdGhlIG5laWdoYm91ciBjaHVuayBvd25zIHRoZSBvdXR3YXJkIGZhY2UuXG4gICAgICAgICAgY29uc3QgYUluc2lkZSA9IHNsaWNlID49IDAgJiYgc2xpY2UgPCBkZDtcbiAgICAgICAgICBjb25zdCBiSW5zaWRlID0gc2xpY2UgKyAxID49IDAgJiYgc2xpY2UgKyAxIDwgZGQ7XG4gICAgICAgICAgbGV0IHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG1hdDogbnVtYmVyLCBkaXI6IG51bWJlcjtcbiAgICAgICAgICBpZiAoYW8gJiYgIWJvICYmIGFJbnNpZGUpIHsgeCA9IGF4OyB5ID0gYXk7IHogPSBhejsgbWF0ID0gYTsgZGlyID0gMTsgfVxuICAgICAgICAgIGVsc2UgaWYgKGJvICYmICFhbyAmJiBiSW5zaWRlKSB7IHggPSBieDsgeSA9IGJ5OyB6ID0gYno7IG1hdCA9IGI7IGRpciA9IC0xOyB9XG4gICAgICAgICAgZWxzZSBjb250aW51ZTtcblxuICAgICAgICAgIGNvbnN0IHd5ID0gWV9NSU4gKyB5O1xuICAgICAgICAgIGNvbnN0IHN1cmZhY2VZID0gY2h1bmsuaGVpZ2h0c1t6ICogQ0hVTktfU0laRSArIHhdICsgWV9NSU47XG4gICAgICAgICAgY29uc3QgZGVwdGggPSBzdXJmYWNlWSAtICh3eSArIDEpO1xuICAgICAgICAgIGxldCB2YXJpYW50OiBudW1iZXI7XG4gICAgICAgICAgaWYgKGF4aXMgPT09IDEgJiYgZGlyID4gMCkgdmFyaWFudCA9IGhlaWdodEJhbmQod3kpO1xuICAgICAgICAgIGVsc2UgaWYgKGF4aXMgPT09IDEgJiYgZGlyIDwgMCkgdmFyaWFudCA9IDE1O1xuICAgICAgICAgIGVsc2UgdmFyaWFudCA9IChNYXRoLm1heCgwLCBNYXRoLm1pbig3LCBkZXB0aCkpICYgNykgfCAoc3RvbmVUb25lKHd5KSA8PCAzKTtcblxuICAgICAgICAgIGNvbnN0IHNoYWRlID0gc2hhZGVBdChveCArIHgsIHd5LCBveiArIHosIHdvcmxkLnNlZWQpO1xuICAgICAgICAgIG1hc2tbaiAqIGR1ICsgaV0gPSBrZXlGb3IobWF0LCB2YXJpYW50LCBzaGFkZSwgYXhpcywgZGlyKTtcbiAgICAgICAgICBhbnkgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghYW55KSBjb250aW51ZTtcblxuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBkdjsgaisrKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZHU7KSB7XG4gICAgICAgICAgY29uc3Qga2V5ID0gbWFza1tqICogZHUgKyBpXTtcbiAgICAgICAgICBpZiAoIWtleSkgeyBpKys7IGNvbnRpbnVlOyB9XG5cbiAgICAgICAgICBsZXQgdyA9IDE7XG4gICAgICAgICAgd2hpbGUgKGkgKyB3IDwgZHUgJiYgbWFza1tqICogZHUgKyBpICsgd10gPT09IGtleSkgdysrO1xuXG4gICAgICAgICAgbGV0IGggPSAxO1xuICAgICAgICAgIG91dGVyOiB3aGlsZSAoaiArIGggPCBkdikge1xuICAgICAgICAgICAgZm9yIChsZXQgayA9IDA7IGsgPCB3OyBrKyspIHtcbiAgICAgICAgICAgICAgaWYgKG1hc2tbKGogKyBoKSAqIGR1ICsgaSArIGtdICE9PSBrZXkpIGJyZWFrIG91dGVyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaCsrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGZvciAobGV0IGpqID0gMDsgamogPCBoOyBqaisrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpaSA9IDA7IGlpIDwgdzsgaWkrKykgbWFza1soaiArIGpqKSAqIGR1ICsgaSArIGlpXSA9IDA7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgZGlyID0gKGtleSA+PiAxMikgJiAxID8gMSA6IC0xO1xuICAgICAgICAgIGVtaXRRdWFkKGF4aXMsIGRpciwgc2xpY2UsIGksIGosIHcsIGgsIGtleSk7XG4gICAgICAgICAgaSArPSB3O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHBvc2l0aW9ucywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ25vcm1hbCcsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKG5vcm1hbHMsIDMpKTtcbiAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKGNvbG9ycywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2FNYXQnLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShtYXRzLCAxKSk7XG4gIGdlb21ldHJ5LnNldEluZGV4KGluZGljZXMpO1xuICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgcmV0dXJuIHsgZ2VvbWV0cnksIHRyaWFuZ2xlczogaW5kaWNlcy5sZW5ndGggLyAzIH07XG59XG5cbi8qKiBPbmUgb3BhcXVlIHNlYS1sZXZlbCBzdXJmYWNlIGZvciB0aGUgd2hvbGUgdmlldy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFdhdGVyU3VyZmFjZSh3b3JsZDogV29ybGQsIHNpemUgPSAyMDAwMCwgc2VnbWVudHMgPSA5Nik6IFRIUkVFLk1lc2gge1xuICBjb25zdCBnZW8gPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeShzaXplLCBzaXplLCBzZWdtZW50cywgc2VnbWVudHMpO1xuICBnZW8ucm90YXRlWCgtTWF0aC5QSSAvIDIpO1xuICBjb25zdCBwb3MgPSBnZW8uYXR0cmlidXRlcy5wb3NpdGlvbjtcbiAgY29uc3QgY29sb3JzID0gbmV3IEZsb2F0MzJBcnJheShwb3MuY291bnQgKiAzKTtcbiAgY29uc3QgdG1wID0gbmV3IFRIUkVFLkNvbG9yKCk7XG4gIGNvbnN0IHNtb290aHN0ZXAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHg6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IHQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCAoeCAtIGEpIC8gKGIgLSBhKSkpO1xuICAgIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xuICB9O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHBvcy5jb3VudDsgaSsrKSB7XG4gICAgY29uc3QgeCA9IHBvcy5nZXRYKGkpLCB6ID0gcG9zLmdldFooaSk7XG4gICAgLy8gVGhlIHdhdGVyIHBsYW5lIHNhbXBsZXMgdGhlIHNlYWJlZCBvbmx5IGZvciBhIG5hcnJvdyBzaG9yZSByaW0uIEEgZGVwdGhcbiAgICAvLyByYW1wIG9uIGEgNDcgbSBncmlkIG1pc3NlZCB0aGUgMTAgbSByaXZlciBlbnRpcmVseSBhbmQgdHVybmVkIGl0IHdoaXRlO1xuICAgIC8vIHRoZSByaXZlciBhbmQgbGFrZSByZWFkIGJldHRlciBhcyB0aGUgc2FtZSBkZWVwIHdhdGVyIGFzIHRoZSBzZWEuXG4gICAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdCh3b3JsZC5zZWVkLCBNYXRoLnJvdW5kKHgpLCBNYXRoLnJvdW5kKHopKTtcbiAgICBjb25zdCBzaG9yZSA9IHNtb290aHN0ZXAoLTAuOSwgLTAuMTUsIGgpICogKDEgLSBzbW9vdGhzdGVwKC0wLjE1LCAwLjQsIGgpKTtcbiAgICBjb25zdCBuID0gaGFzaDJpKE1hdGguZmxvb3IoeCAvIDQ1KSwgTWF0aC5mbG9vcih6IC8gNDUpLCB3b3JsZC5zZWVkICsgNTAxKTtcbiAgICB0bXAuY29weShDT0wud2F0ZXJNaWQpLmxlcnAoQ09MLndhdGVyRGVlcCwgMC4zNSArIDAuMzUgKiBuKTtcbiAgICAvLyBBIHdlYWsgc2hvcmUgdGludC4gQSBzdHJvbmcgb25lLCBzYW1wbGVkIG9uIGEgY29hcnNlIHBsYW5lLCBwcm9kdWNlZFxuICAgIC8vIHBhbGUgcmVjdGFuZ2xlcyBvdmVyIG9mZnNob3JlIHNlYW1vdW50cyBpbiB0aGUgbWFwIHZpZXcuXG4gICAgdG1wLmxlcnAoQ09MLndhdGVyUmltLCBzaG9yZSAqIDAuMTUpO1xuICAgIGNvbG9yc1tpICogM10gPSB0bXAucjsgY29sb3JzW2kgKiAzICsgMV0gPSB0bXAuZzsgY29sb3JzW2kgKiAzICsgMl0gPSB0bXAuYjtcbiAgfVxuICBnZW8uc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoY29sb3JzLCAzKSk7XG4gIC8vIE9wYXF1ZTogdGhlIHNlYS1sZXZlbCBzdXJmYWNlIGlzIHRoZSB3YXRlciByZWFkLiBBIHRyYW5zbHVjZW50IHBsYW5lIGxldFxuICAvLyB0aGUgbWFjcm8gc2VhYmVkIHNob3cgdGhyb3VnaCwgd2hpY2ggbWFkZSB0aGUgZmluaXRlIDIwNDggbSB3b3JsZCBlZGdlXG4gIC8vIHZpc2libGUgYXMgYSBzcXVhcmUgaW4gdGhlIGZpcnN0IE0wMDEgbWFwIGNhcHR1cmUuXG4gIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW8sIG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICB2ZXJ0ZXhDb2xvcnM6IHRydWUsXG4gIH0pKTtcbiAgbWVzaC5wb3NpdGlvbi55ID0gLTAuMDY7XG4gIG1lc2gucmVuZGVyT3JkZXIgPSAxO1xuICBtZXNoLm5hbWUgPSAnd2F0ZXJfc3VyZmFjZSc7XG4gIG1lc2gucmVjZWl2ZVNoYWRvdyA9IGZhbHNlO1xuICByZXR1cm4gbWVzaDtcbn1cblxuaW50ZXJmYWNlIE1hY3JvSG9sZSB7IG1pblg6IG51bWJlcjsgbWF4WDogbnVtYmVyOyBtaW5aOiBudW1iZXI7IG1heFo6IG51bWJlcjsgfVxuaW50ZXJmYWNlIE1hY3JvT3B0aW9ucyB7XG4gIHN0ZXA6IG51bWJlcjtcbiAgLyoqIFJlY3Rhbmd1bGFyIGhvbGUgY292ZXJlZCBieSB0aGUgbmVhciAxIG0gY2h1bmsgcmluZy4gKi9cbiAgaG9sZT86IE1hY3JvSG9sZTtcbn1cblxuaW50ZXJmYWNlIE1hY3JvUmVzdWx0IHtcbiAgbWVzaDogVEhSRUUuTWVzaDtcbiAgdHJpYW5nbGVzOiBudW1iZXI7XG4gIHNhbXBsZU1zOiBudW1iZXI7XG4gIHRvdGFsTXM6IG51bWJlcjtcbiAgc2FtcGxlQ2FjaGVkOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgTWFjcm9TYW1wbGVDYWNoZSB7XG4gIE46IG51bWJlcjtcbiAgaGVpZ2h0czogSW50MTZBcnJheTtcbiAgdG9wczogVWludDhBcnJheTtcbiAgdW5kZXJ3YXRlcjogVWludDhBcnJheTtcbiAgc2FtcGxlTXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNYWNyb1RlcnJhaW5TYW1wbGUgeyB4OiBudW1iZXI7IHo6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IHRvcDogTWF0SWQ7IHVuZGVyd2F0ZXI6IGJvb2xlYW47IH1cblxuLy8gQ2FjaGUgdGhlIGRldGVybWluaXN0aWMgYmFzZSBncmlkIGFuZCB0aGUgYXV0aG9yaXRhdGl2ZSBlZGl0ZWQgZ3JpZCBzZXBhcmF0ZWx5LlxuLy8gQmFzZSBlbnRyaWVzIG5ldmVyIG5lZWQgaW52YWxpZGF0aW9uLiBFZGl0ZWQgZW50cmllcyBhcmUgc2NvcGVkIGJ5IFdvcmxkIGlkZW50aXR5XG4vLyAodHdvIHNhbWUtc2VlZCB3b3JsZHMgY2FuIGhhdmUgZGlmZmVyZW50IGVkaXRzKSBhbmQgYnkgYm90aCB0aGUgY29hcnNlIGVkaXRcbi8vIHJldmlzaW9uIGFuZCBjaHVuayBzdHJlYW1pbmcsIHNpbmNlIGV2aWN0aW5nL3JlZ2VuZXJhdGluZyBkYXRhIGFuZCBzbmFwc2hvdFxuLy8gcmVzdG9yYXRpb24gZG8gbm90IG5lY2Vzc2FyaWx5IHByb2R1Y2UgYSBuZXcgY29hcnNlIHJldmlzaW9uLiBPbmx5IGNodW5rcyB3aXRoXG4vLyBkdXJhYmxlIHZveGVsIGRlbHRhcyBhcmUgbWF0ZXJpYWxpemVkOyB0aGUgb3RoZXIgNjR4NjQgY2VsbHMgcmVtYWluIGJhc2Ugc2FtcGxlcy5cbmludGVyZmFjZSBNYWNyb1dvcmxkQ2FjaGVzIHtcbiAgYmFzZTogTWFwPG51bWJlciwgTWFjcm9TYW1wbGVDYWNoZT47XG4gIGVkaXRlZDogTWFwPHN0cmluZywgTWFjcm9TYW1wbGVDYWNoZT47XG4gIC8qKiBTcGFyc2UgYXV0aG9yaXRhdGl2ZSBjb2x1bW5zLCBpbmRlcGVuZGVudCBvZiB0aGUgbWVzaCBzYW1wbGluZyByZXNvbHV0aW9uLiAqL1xuICBjb2x1bW5zOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCB7IGhlaWdodDogbnVtYmVyOyB0b3A6IE1hdElkIH0+PjtcbiAgcmV2aXNpb246IG51bWJlcjtcbn1cbmNvbnN0IG1hY3JvU2FtcGxlQ2FjaGUgPSBuZXcgV2Vha01hcDxXb3JsZCwgTWFjcm9Xb3JsZENhY2hlcz4oKTtcblxuZnVuY3Rpb24gc3luY01hY3JvQ29sdW1ucyh3b3JsZDogV29ybGQsIGNhY2hlczogTWFjcm9Xb3JsZENhY2hlcyk6IHZvaWQge1xuICBpZiAod29ybGQucmV2aXNpb24gPT09IGNhY2hlcy5yZXZpc2lvbikgcmV0dXJuO1xuICAvLyBTbmFwc2hvdCByZXN0b3JlIHJlcGxhY2VzIGVkaXRzIGFuZCBjaHVua3MgYmVmb3JlIGFzc2lnbmluZyBpdHMgc2F2ZWRcbiAgLy8gcmV2aXNpb24uIE5ldmVyIG1peCByZW1lbWJlcmVkIGNvbHVtbnMgZnJvbSB0aGF0IHByZXZpb3VzIHdvcmxkIHN0YXRlLlxuICBjYWNoZXMuY29sdW1ucy5jbGVhcigpO1xuICAvLyBBIG5vcm1hbCBlZGl0IGhhcyBhbHJlYWR5IHVwZGF0ZWQgdGhlIGxvYWRlZCBjaHVuaywgc28gaXQgY29zdHMgb25seSB0aGVcbiAgLy8gZWRpdGVkIGNodW5rcy4gUmVzdG9yZWQvZXZpY3RlZCBlZGl0ZWQgY2h1bmtzIGFyZSBnZW5lcmF0ZWQgb24gZGVtYW5kLlxuICBmb3IgKGNvbnN0IFtrZXksIGVkaXRzXSBvZiB3b3JsZC5lZGl0cykge1xuICAgIGlmICghZWRpdHMuc2l6ZSB8fCAhd29ybGQuY2h1bmtzLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KSE7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgY29sdW1ucyA9IG5ldyBNYXA8bnVtYmVyLCB7IGhlaWdodDogbnVtYmVyOyB0b3A6IE1hdElkIH0+KCk7XG4gICAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBjb2x1bW5zLnNldCgob3ggKyBseCArIEhBTEYpICogV09STERfU0laRSArIG96ICsgbHogKyBIQUxGLCB7XG4gICAgICAgICAgaGVpZ2h0OiBjaHVuay5oZWlnaHRzW2NvbF0gKyBZX01JTiArIDEsXG4gICAgICAgICAgdG9wOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSBhcyBNYXRJZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIGNhY2hlcy5jb2x1bW5zLnNldChrZXksIGNvbHVtbnMpO1xuICB9XG4gIGNhY2hlcy5lZGl0ZWQuY2xlYXIoKTtcbiAgY2FjaGVzLnJldmlzaW9uID0gd29ybGQucmV2aXNpb247XG59XG5cbmZ1bmN0aW9uIG1hY3JvQ29sdW1uKHdvcmxkOiBXb3JsZCwgY2FjaGVzOiBNYWNyb1dvcmxkQ2FjaGVzLCBrZXk6IHN0cmluZywgaW5kZXg6IG51bWJlcikge1xuICBsZXQgY29sdW1ucyA9IGNhY2hlcy5jb2x1bW5zLmdldChrZXkpO1xuICBpZiAoY29sdW1ucykgcmV0dXJuIGNvbHVtbnMuZ2V0KGluZGV4KTtcbiAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgaWYgKCFlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgLy8gQ2FwdHVyZSBvbmNlIGFmdGVyIGxvYWRpbmcuIExvYWRlZCBjaHVua3MgYXJlIGNoZWFwIGFuZCBkbyBub3QgcmVxdWlyZVxuICAvLyB3YWxraW5nIGV2ZXJ5IHZveGVsOyB0aGlzIHJlbWFpbnMgTygzMngzMikgcGVyIGVkaXRlZCBjaHVuay5cbiAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSkhO1xuICBjb2x1bW5zID0gbmV3IE1hcCgpO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLnNldCgob3ggKyBseCArIEhBTEYpICogV09STERfU0laRSArIG96ICsgbHogKyBIQUxGLCB7XG4gICAgICAgIGhlaWdodDogY2h1bmsuaGVpZ2h0c1tjb2xdICsgWV9NSU4gKyAxLFxuICAgICAgICB0b3A6IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdIGFzIE1hdElkLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGNhY2hlcy5jb2x1bW5zLnNldChrZXksIGNvbHVtbnMpO1xuICByZXR1cm4gY29sdW1ucy5nZXQoaW5kZXgpO1xufVxuXG5mdW5jdGlvbiBtYWNyb0VkaXRLZXkod29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgLy8gSW5jbHVkZSBhIGNvbW11dGF0aXZlIGNvbnRlbnQgZmluZ2VycHJpbnQgYXMgd2VsbCBhcyBjb3VudDogZXZpY3Rpb24gYW5kXG4gIC8vIHNuYXBzaG90IHJlc3RvcmUgYnlwYXNzIHRoZSBjb2Fyc2UgV29ybGQucmV2aXNpb24gcGF0aCwgYW5kIGEgcmVzdG9yZWRcbiAgLy8gZGVsdGEgY2FuIGhhdmUgdGhlIHNhbWUgbnVtYmVyIG9mIGNlbGxzIHdpdGggZGlmZmVyZW50IGluZGljZXMvbWF0ZXJpYWxzLlxuICByZXR1cm4gWy4uLndvcmxkLmVkaXRzLmVudHJpZXMoKV1cbiAgICAuZmlsdGVyKChbLCBlZGl0c10pID0+IGVkaXRzLnNpemUgPiAwKVxuICAgIC5tYXAoKFtrZXksIGVkaXRzXSkgPT4ge1xuICAgICAgbGV0IHN1bSA9IDA7XG4gICAgICBsZXQgbWl4ZWQgPSAwO1xuICAgICAgZm9yIChjb25zdCBbaW5kZXgsIG1hdGVyaWFsXSBvZiBlZGl0cykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IE1hdGguaW11bChpbmRleCArIDEsIDMxKSArIG1hdGVyaWFsO1xuICAgICAgICBzdW0gPSAoc3VtICsgdmFsdWUpIHwgMDtcbiAgICAgICAgbWl4ZWQgPSAobWl4ZWQgXiBNYXRoLmltdWwodmFsdWUsIDB4NDVkOWYzYikpIHwgMDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJHtrZXl9OiR7ZWRpdHMuc2l6ZX06JHtzdW19OiR7bWl4ZWR9YDtcbiAgICB9KVxuICAgIC5zb3J0KClcbiAgICAuam9pbignfCcpO1xufVxuXG5mdW5jdGlvbiBlZGl0ZWRNYWNyb1NhbXBsZXMod29ybGQ6IFdvcmxkLCBzdGVwOiBudW1iZXIsIGNhY2hlOiBNYWNyb1NhbXBsZUNhY2hlKTogTWFjcm9TYW1wbGVDYWNoZSB7XG4gIGNvbnN0IGNhY2hlcyA9IG1hY3JvU2FtcGxlQ2FjaGUuZ2V0KHdvcmxkKSE7XG4gIGNvbnN0IGtleSA9IGAke3N0ZXB9OiR7bWFjcm9FZGl0S2V5KHdvcmxkKX1gO1xuICBjb25zdCBjYWNoZWQgPSBjYWNoZXMuZWRpdGVkLmdldChrZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuXG4gIGZvciAoY29uc3QgW2NodW5rLCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBpZiAoZWRpdHMuc2l6ZSAmJiAhY2FjaGVzLmNvbHVtbnMuaGFzKGNodW5rKSkgbWFjcm9Db2x1bW4od29ybGQsIGNhY2hlcywgY2h1bmssIDApO1xuICB9XG5cbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgeyBOLCBoZWlnaHRzLCB0b3BzLCB1bmRlcndhdGVyIH0gPSBjYWNoZTtcbiAgY29uc3Qgc2FtcGxlID0ge1xuICAgIE4sXG4gICAgaGVpZ2h0czogbmV3IEludDE2QXJyYXkoaGVpZ2h0cyksXG4gICAgdG9wczogbmV3IFVpbnQ4QXJyYXkodG9wcyksXG4gICAgdW5kZXJ3YXRlcjogbmV3IFVpbnQ4QXJyYXkodW5kZXJ3YXRlciksXG4gICAgc2FtcGxlTXM6IGNhY2hlLnNhbXBsZU1zLFxuICB9O1xuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCB4ID0gTWF0aC5yb3VuZCgtSEFMRiArIChpICsgMC41KSAqIHN0ZXApO1xuICAgICAgY29uc3QgeiA9IE1hdGgucm91bmQoLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwKTtcbiAgICAgIGNvbnN0IGNodW5rID0gY2h1bmtLZXkod29ybGRUb0NodW5rWCh4KSwgd29ybGRUb0NodW5rWih6KSk7XG4gICAgICBpZiAoIXdvcmxkLmVkaXRzLmdldChjaHVuayk/LnNpemUpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgaWR4ID0gaiAqIE4gKyBpO1xuICAgICAgY29uc3QgZWRpdGVkID0gbWFjcm9Db2x1bW4od29ybGQsIGNhY2hlcywgY2h1bmssICh4ICsgSEFMRikgKiBXT1JMRF9TSVpFICsgeiArIEhBTEYpO1xuICAgICAgaWYgKCFlZGl0ZWQpIGNvbnRpbnVlO1xuICAgICAgc2FtcGxlLmhlaWdodHNbaWR4XSA9IGVkaXRlZC5oZWlnaHQ7XG4gICAgICBzYW1wbGUudG9wc1tpZHhdID0gZWRpdGVkLnRvcDtcbiAgICAgIHNhbXBsZS51bmRlcndhdGVyW2lkeF0gPSBzYW1wbGUuaGVpZ2h0c1tpZHhdIDwgU0VBX0xFVkVMID8gMSA6IDA7XG4gICAgfVxuICB9XG4gIHNhbXBsZS5zYW1wbGVNcyA9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gIGNhY2hlcy5lZGl0ZWQuc2V0KGtleSwgc2FtcGxlKTtcbiAgcmV0dXJuIHNhbXBsZTtcbn1cblxuZnVuY3Rpb24gbWFjcm9TYW1wbGVzKHdvcmxkOiBXb3JsZCwgc3RlcDogbnVtYmVyKTogTWFjcm9TYW1wbGVDYWNoZSB7XG4gIGxldCBjYWNoZXMgPSBtYWNyb1NhbXBsZUNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGVzKSB7XG4gICAgY2FjaGVzID0geyBiYXNlOiBuZXcgTWFwKCksIGVkaXRlZDogbmV3IE1hcCgpLCBjb2x1bW5zOiBuZXcgTWFwKCksIHJldmlzaW9uOiAtMSB9O1xuICAgIG1hY3JvU2FtcGxlQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZXMpO1xuICB9XG4gIHN5bmNNYWNyb0NvbHVtbnMod29ybGQsIGNhY2hlcyk7XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlcy5iYXNlLmdldChzdGVwKTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGVkaXRlZE1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCwgY2FjaGVkKTtcblxuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBOID0gTWF0aC5jZWlsKFdPUkxEX1NJWkUgLyBzdGVwKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBJbnQxNkFycmF5KE4gKiBOKTtcbiAgY29uc3QgdG9wcyA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgdW5kZXJ3YXRlciA9IG5ldyBVaW50OEFycmF5KE4gKiBOKTtcbiAgY29uc3QgY2VsbFggPSAoaTogbnVtYmVyKSA9PiAtSEFMRiArIChpICsgMC41KSAqIHN0ZXA7XG4gIGNvbnN0IGNlbGxaID0gKGo6IG51bWJlcikgPT4gLUhBTEYgKyAoaiArIDAuNSkgKiBzdGVwO1xuXG4gIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBOOyBpKyspIHtcbiAgICAgIGNvbnN0IHggPSBjZWxsWChpKSwgeiA9IGNlbGxaKGopO1xuICAgICAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdCh3b3JsZC5zZWVkLCBNYXRoLnJvdW5kKHgpLCBNYXRoLnJvdW5kKHopKTtcbiAgICAgIGNvbnN0IGlkeCA9IGogKiBOICsgaTtcbiAgICAgIGhlaWdodHNbaWR4XSA9IGg7XG4gICAgICBpZiAoaCA8IFNFQV9MRVZFTCkgdW5kZXJ3YXRlcltpZHhdID0gMTtcbiAgICB9XG4gIH1cblxuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBpZiAodW5kZXJ3YXRlcltpZHhdKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGggPSBoZWlnaHRzW2lkeF07XG4gICAgICBjb25zdCB4ID0gY2VsbFgoaSksIHogPSBjZWxsWihqKTtcbiAgICAgIGxldCBzbG9wZSA9IDA7XG4gICAgICBsZXQgbmVhcldhdGVyID0gZmFsc2U7XG4gICAgICBjb25zdCBucyA9IFtbLTEsIDBdLCBbMSwgMF0sIFswLCAtMV0sIFswLCAxXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIG5zKSB7XG4gICAgICAgIGNvbnN0IG54ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oTiAtIDEsIGkgKyBkeCkpO1xuICAgICAgICBjb25zdCBueiA9IE1hdGgubWF4KDAsIE1hdGgubWluKE4gLSAxLCBqICsgZHopKTtcbiAgICAgICAgY29uc3QgbmggPSBoZWlnaHRzW256ICogTiArIG54XTtcbiAgICAgICAgc2xvcGUgPSBNYXRoLm1heChzbG9wZSwgTWF0aC5hYnMoaCAtIG5oKSk7XG4gICAgICAgIGlmIChuaCA8IFNFQV9MRVZFTCArIDEpIG5lYXJXYXRlciA9IHRydWU7XG4gICAgICB9XG4gICAgICB0b3BzW2lkeF0gPSBiYXNlVG9wTWF0ZXJpYWwod29ybGQuc2VlZCwgTWF0aC5yb3VuZCh4KSwgTWF0aC5yb3VuZCh6KSwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY2FjaGU6IE1hY3JvU2FtcGxlQ2FjaGUgPSB7XG4gICAgTiwgaGVpZ2h0cywgdG9wcywgdW5kZXJ3YXRlcixcbiAgICBzYW1wbGVNczogcGVyZm9ybWFuY2Uubm93KCkgLSB0MCxcbiAgfTtcbiAgY2FjaGVzLmJhc2Uuc2V0KHN0ZXAsIGNhY2hlKTtcbiAgcmV0dXJuIGVkaXRlZE1hY3JvU2FtcGxlcyh3b3JsZCwgc3RlcCwgY2FjaGUpO1xufVxuXG4vKiogQXV0aG9yaXRhdGl2ZSBtYWNyby1ncmlkIHZhbHVlIGF0IGEgd29ybGQgY29sdW1uIChzdGVwIGRlZmF1bHRzIHRvIDggbSkuICovXG5leHBvcnQgZnVuY3Rpb24gc2FtcGxlTWFjcm9UZXJyYWluKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHN0ZXAgPSA4KTogTWFjcm9UZXJyYWluU2FtcGxlIHtcbiAgY29uc3QgY2FjaGUgPSBtYWNyb1NhbXBsZXMod29ybGQsIHN0ZXApO1xuICBjb25zdCBpID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oY2FjaGUuTiAtIDEsIE1hdGguZmxvb3IoKHggKyBIQUxGKSAvIHN0ZXApKSk7XG4gIGNvbnN0IGogPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjYWNoZS5OIC0gMSwgTWF0aC5mbG9vcigoeiArIEhBTEYpIC8gc3RlcCkpKTtcbiAgY29uc3QgaWR4ID0gaiAqIGNhY2hlLk4gKyBpO1xuICByZXR1cm4ge1xuICAgIHg6IC1IQUxGICsgKGkgKyAwLjUpICogc3RlcCxcbiAgICB6OiAtSEFMRiArIChqICsgMC41KSAqIHN0ZXAsXG4gICAgaGVpZ2h0OiBjYWNoZS5oZWlnaHRzW2lkeF0sIHRvcDogY2FjaGUudG9wc1tpZHhdIGFzIE1hdElkLFxuICAgIHVuZGVyd2F0ZXI6IGNhY2hlLnVuZGVyd2F0ZXJbaWR4XSAhPT0gMCxcbiAgfTtcbn1cblxuLyoqXG4gKiBGYXIgbGFuZHNjYXBlIExPRCBkZXJpdmVkIGZyb20gdGhlIHNhbWUgZGV0ZXJtaW5pc3RpYyBzdXJmYWNlIHNhbXBsZXIuXG4gKiBDZWxscyBiZWxvdyBzZWEgbGV2ZWwgYXJlIG9taXR0ZWQ6IHRoZSBvcGFxdWUgd2F0ZXIgc3VyZmFjZSBpcyB0aGUgb25seVxuICogd2F0ZXIgcmVhZCwgc28gdGhlIGZpbml0ZSAyMDQ4IG0gd29ybGQgY2Fubm90IGFwcGVhciBhcyBhIHNxdWFyZSBzZWFiZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZE1hY3JvTWVzaCh3b3JsZDogV29ybGQsIG9wdHM6IE1hY3JvT3B0aW9ucyk6IE1hY3JvUmVzdWx0IHtcbiAgY29uc3QgdG90YWxUMCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCB7IHN0ZXAsIGhvbGUgfSA9IG9wdHM7XG4gIGNvbnN0IGNhY2hlS2V5ID0gYCR7c3RlcH06JHttYWNyb0VkaXRLZXkod29ybGQpfWA7XG4gIGNvbnN0IHNhbXBsZUNhY2hlZCA9IG1hY3JvU2FtcGxlQ2FjaGUuZ2V0KHdvcmxkKT8uZWRpdGVkLmhhcyhjYWNoZUtleSkgPz8gZmFsc2U7XG4gIGNvbnN0IGNhY2hlID0gbWFjcm9TYW1wbGVzKHdvcmxkLCBzdGVwKTtcbiAgY29uc3QgeyBOLCBoZWlnaHRzLCB0b3BzLCB1bmRlcndhdGVyIH0gPSBjYWNoZTtcbiAgY29uc3QgaG9sZUNlbGwgPSBuZXcgVWludDhBcnJheShOICogTik7XG4gIGNvbnN0IGNlbGxYID0gKGk6IG51bWJlcikgPT4gLUhBTEYgKyAoaSArIDAuNSkgKiBzdGVwO1xuICBjb25zdCBjZWxsWiA9IChqOiBudW1iZXIpID0+IC1IQUxGICsgKGogKyAwLjUpICogc3RlcDtcblxuICBpZiAoaG9sZSkge1xuICAgIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgICBjb25zdCB4ID0gY2VsbFgoaSksIHogPSBjZWxsWihqKTtcbiAgICAgICAgaWYgKHggPiBob2xlLm1pblggJiYgeCA8IGhvbGUubWF4WCAmJiB6ID4gaG9sZS5taW5aICYmIHogPCBob2xlLm1heFopIHtcbiAgICAgICAgICBob2xlQ2VsbFtqICogTiArIGldID0gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHNhbXBsZU1zID0gc2FtcGxlQ2FjaGVkID8gMCA6IGNhY2hlLnNhbXBsZU1zO1xuICBjb25zdCBwb3NpdGlvbnM6IG51bWJlcltdID0gW107XG4gIGNvbnN0IG5vcm1hbHM6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGNvbG9yczogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgaW5kaWNlczogbnVtYmVyW10gPSBbXTtcblxuICBjb25zdCBwdXNoUXVhZCA9IChwOiBudW1iZXJbXVtdLCBuOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sIGNvbG9yOiBUSFJFRS5Db2xvcikgPT4ge1xuICAgIGNvbnN0IGJhc2UgPSBwb3NpdGlvbnMubGVuZ3RoIC8gMztcbiAgICBmb3IgKGNvbnN0IHYgb2YgcCkge1xuICAgICAgcG9zaXRpb25zLnB1c2godlswXSwgdlsxXSwgdlsyXSk7XG4gICAgICBub3JtYWxzLnB1c2goblswXSwgblsxXSwgblsyXSk7XG4gICAgICBjb2xvcnMucHVzaChjb2xvci5yLCBjb2xvci5nLCBjb2xvci5iKTtcbiAgICB9XG4gICAgaW5kaWNlcy5wdXNoKGJhc2UsIGJhc2UgKyAxLCBiYXNlICsgMiwgYmFzZSwgYmFzZSArIDIsIGJhc2UgKyAzKTtcbiAgfTtcblxuICBjb25zdCBjZWxsU2hhZGUgPSAoaTogbnVtYmVyLCBqOiBudW1iZXIpID0+IDAuOTQgKyAwLjEyICogaGFzaDJpKGksIGosIHdvcmxkLnNlZWQgKyA0MDEpO1xuXG4gIGNvbnN0IHRvcENvbG9yID0gKHRvcDogTWF0SWQsIGg6IG51bWJlciwgaTogbnVtYmVyLCBqOiBudW1iZXIpOiBUSFJFRS5Db2xvciA9PiB7XG4gICAgY29uc3Qgc2hhZGUgPSBjZWxsU2hhZGUoaSwgaik7XG4gICAgY29uc3QgbW9pc3QgPSBmYm0yKGNlbGxYKGkpIC8gMTMwLCBjZWxsWihqKSAvIDEzMCwgd29ybGQuc2VlZCArIDYwMSwgMyk7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBDT0wuc2FuZC5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKHNoYWRlICogMC45MCk7XG4gICAgaWYgKHRvcCA9PT0gTUFULkdSQVZFTCkgcmV0dXJuIENPTC5ncmF2ZWwuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihzaGFkZSk7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNUT05FKSB7XG4gICAgICByZXR1cm4gQ09MLnN0b25lU2hhZGUuY2xvbmUoKS5sZXJwKENPTC5zdG9uZUIsIDAuMzUgKyAwLjI1ICogc2hhZGUpLm11bHRpcGx5U2NhbGFyKFxuICAgICAgICAoMC44MiArIDAuMTQgKiBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCAoaCArIDgpIC8gNzApKSkgKiAoMC45MiArIDAuMDggKiBzaGFkZSksXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAodG9wID09PSBNQVQuT1JFKSByZXR1cm4gQ09MLm9yZS5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgICAvLyBGb3Jlc3QtZmxvb3IgcGF0Y2hlcyBicmVhayB1cCB0aGUgdW5pZm9ybSBncmVlbiBvZiB0aGUgZmFyIExPRC4gVGhleVxuICAgIC8vIGFyZSBhIGNvbG91ciBhcHByb3hpbWF0aW9uLCBub3QgZXh0cmEgZ2VvbWV0cnk7IHRoZSBuZWFyIHJpbmcgaGFzIHJlYWxcbiAgICAvLyBTdHlsIHRyZWVzLlxuICAgIHJldHVybiBDT0wuZ3Jhc3NUb3BbaGVpZ2h0QmFuZChoKV0uY2xvbmUoKVxuICAgICAgLmxlcnAoQ09MLmdyYXNzQ2FwLCAwLjEyICsgMC4zNCAqIG1vaXN0KVxuICAgICAgLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgfTtcblxuICBjb25zdCBzaWRlQ29sb3IgPSAodG9wOiBNYXRJZCwgaDogbnVtYmVyLCBuaDogbnVtYmVyLCBpOiBudW1iZXIsIGo6IG51bWJlcik6IFRIUkVFLkNvbG9yID0+IHtcbiAgICBjb25zdCBkcm9wID0gaCAtIG5oO1xuICAgIGNvbnN0IHNoYWRlID0gMC45MCArIDAuMTAgKiBoYXNoMmkoaSwgaiwgd29ybGQuc2VlZCArIDQwMik7XG4gICAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBDT0wuc2FuZC5jbG9uZSgpLmxlcnAoQ09MLnN0b25lQiwgZHJvcCA+IDUgPyAwLjU1IDogMC4yKS5tdWx0aXBseVNjYWxhcihzaGFkZSAqIDAuOTIpO1xuICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSkge1xuICAgICAgcmV0dXJuIENPTC5zdG9uZVNoYWRlLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoXG4gICAgICAgICgwLjgwICsgMC4xNiAqIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIChoICsgOCkgLyA3MCkpKSAqIHNoYWRlLFxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gQSBncmFzcy10b3BwZWQgYmFuayBpcyBub3QgYSBzdG9uZSBjbGlmZiwgaG93ZXZlciB0YWxsIHRoZSA4IG0gbWFjcm9cbiAgICAvLyBjZWxsIG1ha2VzIGl0IGxvb2suIEtlZXBpbmcgdGhlIHNpZGUgaW4gdGhlIHNvaWwgcmFuZ2UgcmVtb3ZlZCB0aGVcbiAgICAvLyBicmlnaHQgd2hpdGUgcXVhcnJ5IHdhbGxzIGFyb3VuZCB0aGUgcml2ZXIgYW5kIGxha2UgaW4gdGhlIHdpZGUgdmlldy5cbiAgICBpZiAoZHJvcCA+IDQpIHJldHVybiBDT0wuZ3Jhc3NDYXAuY2xvbmUoKS5sZXJwKENPTC5vY2hyZSwgMC41NSkubXVsdGlwbHlTY2FsYXIoc2hhZGUpO1xuICAgIHJldHVybiBDT0wuZ3Jhc3NDYXAuY2xvbmUoKS5sZXJwKENPTC5zdG9uZUIsIDAuMjIpLm11bHRpcGx5U2NhbGFyKHNoYWRlKTtcbiAgfTtcblxuICBmb3IgKGxldCBqID0gMDsgaiA8IE47IGorKykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XG4gICAgICBjb25zdCBpZHggPSBqICogTiArIGk7XG4gICAgICBpZiAoaG9sZUNlbGxbaWR4XSB8fCB1bmRlcndhdGVyW2lkeF0pIGNvbnRpbnVlO1xuICAgICAgY29uc3QgaCA9IGhlaWdodHNbaWR4XTtcbiAgICAgIGNvbnN0IHRvcCA9IHRvcHNbaWR4XSBhcyBNYXRJZDtcbiAgICAgIGNvbnN0IHgwID0gLUhBTEYgKyBpICogc3RlcCwgeDEgPSB4MCArIHN0ZXA7XG4gICAgICBjb25zdCB6MCA9IC1IQUxGICsgaiAqIHN0ZXAsIHoxID0gejAgKyBzdGVwO1xuXG4gICAgICBwdXNoUXVhZChcbiAgICAgICAgW1t4MCwgaCwgejBdLCBbeDAsIGgsIHoxXSwgW3gxLCBoLCB6MV0sIFt4MSwgaCwgejBdXSxcbiAgICAgICAgWzAsIDEsIDBdLFxuICAgICAgICB0b3BDb2xvcih0b3AsIGgsIGksIGopLFxuICAgICAgKTtcblxuICAgICAgY29uc3QgY2hlY2sgPSAoZGk6IG51bWJlciwgZGo6IG51bWJlcikgPT4ge1xuICAgICAgICBjb25zdCBuaSA9IGkgKyBkaSwgbmogPSBqICsgZGo7XG4gICAgICAgIGxldCBuaDogbnVtYmVyO1xuICAgICAgICBpZiAobmkgPCAwIHx8IG5qIDwgMCB8fCBuaSA+PSBOIHx8IG5qID49IE4pIHtcbiAgICAgICAgICAvLyBUaGUgd29ybGQgZWRnZSBpcyBvY2Vhbi4gRG8gbm90IGRyYXcgYSBzaWRlIGZhY2UgZG93biB0byB0aGVcbiAgICAgICAgICAvLyB3YXRlciBoZXJlOyB0aGUgb3BhcXVlIHdhdGVyIHBsYW5lIGFscmVhZHkgY292ZXJzIHRoZSBib3VuZGFyeS5cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgbmlkeCA9IG5qICogTiArIG5pO1xuICAgICAgICAgIGlmIChob2xlQ2VsbFtuaWR4XSkgcmV0dXJuO1xuICAgICAgICAgIG5oID0gdW5kZXJ3YXRlcltuaWR4XSA/IE1hdGgubWF4KFNFQV9MRVZFTCAtIDAuNSwgaGVpZ2h0c1tuaWR4XSkgOiBoZWlnaHRzW25pZHhdO1xuICAgICAgICB9XG4gICAgICAgIGlmIChoIDw9IG5oKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGNvbCA9IHNpZGVDb2xvcih0b3AsIGgsIG5oLCBpLCBqKTtcbiAgICAgICAgaWYgKGRpID09PSAxKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MSwgbmgsIHowXSwgW3gxLCBoLCB6MF0sIFt4MSwgaCwgejFdLCBbeDEsIG5oLCB6MV1dLCBbMSwgMCwgMF0sIGNvbCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZGkgPT09IC0xKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MCwgbmgsIHowXSwgW3gwLCBuaCwgejFdLCBbeDAsIGgsIHoxXSwgW3gwLCBoLCB6MF1dLCBbLTEsIDAsIDBdLCBjb2wpO1xuICAgICAgICB9IGVsc2UgaWYgKGRqID09PSAxKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MCwgbmgsIHoxXSwgW3gxLCBuaCwgejFdLCBbeDEsIGgsIHoxXSwgW3gwLCBoLCB6MV1dLCBbMCwgMCwgMV0sIGNvbCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZGogPT09IC0xKSB7XG4gICAgICAgICAgcHVzaFF1YWQoW1t4MCwgbmgsIHowXSwgW3gwLCBoLCB6MF0sIFt4MSwgaCwgejBdLCBbeDEsIG5oLCB6MF1dLCBbMCwgMCwgLTFdLCBjb2wpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgY2hlY2soMSwgMCk7IGNoZWNrKC0xLCAwKTsgY2hlY2soMCwgMSk7IGNoZWNrKDAsIC0xKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUocG9zaXRpb25zLCAzKSk7XG4gIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUobm9ybWFscywgMykpO1xuICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUoY29sb3JzLCAzKSk7XG4gIGdlb21ldHJ5LnNldEluZGV4KGluZGljZXMpO1xuICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcblxuICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICB2ZXJ0ZXhDb2xvcnM6IHRydWUsIGZsYXRTaGFkaW5nOiB0cnVlLFxuICB9KSk7XG4gIG1lc2gubmFtZSA9ICdtYWNyb19sb2QnO1xuICBtZXNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgbWVzaC5yZWNlaXZlU2hhZG93ID0gZmFsc2U7XG4gIHJldHVybiB7XG4gICAgbWVzaCxcbiAgICB0cmlhbmdsZXM6IGluZGljZXMubGVuZ3RoIC8gMyxcbiAgICBzYW1wbGVNcyxcbiAgICB0b3RhbE1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHRvdGFsVDAsXG4gICAgc2FtcGxlQ2FjaGVkLFxuICB9O1xufVxuXG5leHBvcnQgdHlwZSBWaWV3TW9kZSA9ICd3b3JsZCcgfCAnbWFwJyB8ICdraXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsVGVycmFpblZpZXdPcHRpb25zIHtcbiAgbmVhclJhZGl1cz86IG51bWJlcjtcbiAgd29ybGRNYWNyb1N0ZXA/OiBudW1iZXI7XG4gIG1hcE1hY3JvU3RlcD86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENodW5rVmlldyB7IG1lc2g6IFRIUkVFLk1lc2g7IHRyaWFuZ2xlczogbnVtYmVyOyB9XG5cbi8qKlxuICogT3ducyB0aGUgbmVhciBjaHVuayBtZXNoZXMsIG1hY3JvIExPRCBhbmQgd2F0ZXIgc3VyZmFjZS4gSXQgcmVhZHMgd29ybGRcbiAqIHN0YXRlIGFuZCBuZXZlciBtdXRhdGVzIGdlbmVyYXRpb24gcnVsZXM7IGV2aWN0aW9uIG9ubHkgZnJlZXMgZGVyaXZlZCBkYXRhLlxuICovXG5leHBvcnQgY2xhc3MgVm94ZWxUZXJyYWluVmlldyB7XG4gIHJlYWRvbmx5IGdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIHByaXZhdGUgbmVhckdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIHByaXZhdGUgbWFjcm9Hcm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBwcml2YXRlIHdhdGVyOiBUSFJFRS5NZXNoO1xuICBwcml2YXRlIHdvcmxkOiBXb3JsZDtcbiAgcHJpdmF0ZSBuZWFyUmFkaXVzOiBudW1iZXI7XG4gIHByaXZhdGUgd29ybGRNYWNyb1N0ZXA6IG51bWJlcjtcbiAgcHJpdmF0ZSBtYXBNYWNyb1N0ZXA6IG51bWJlcjtcbiAgcHJpdmF0ZSBjaHVua3MgPSBuZXcgTWFwPHN0cmluZywgQ2h1bmtWaWV3PigpO1xuICBwcml2YXRlIGxvYWRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBwcml2YXRlIG1vZGU6IFZpZXdNb2RlID0gJ3dvcmxkJztcbiAgcHJpdmF0ZSBtYWNybzogVEhSRUUuTWVzaCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIG1hY3JvVHJpYW5nbGVzID0gMDtcbiAgcHJpdmF0ZSBtYWNyb0ZvY3VzID0gbmV3IFRIUkVFLlZlY3RvcjMoMWU5LCAwLCAxZTkpO1xuICBwcml2YXRlIG1hY3JvTW9kZTogVmlld01vZGUgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBjaHVua0dlblNhbXBsZXM6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgY2h1bmtNZXNoU2FtcGxlczogbnVtYmVyW10gPSBbXTtcbiAgcHJpdmF0ZSBtYWNyb1NhbXBsZXM6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgbWFjcm9TYW1wbGVTYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIG1hY3JvQ2FjaGVIaXRzID0gMDtcbiAgcHJpdmF0ZSBtYWNyb0VkaXRLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBvbkNodW5rc0NoYW5nZWQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKHdvcmxkOiBXb3JsZCwgc2NlbmU6IFRIUkVFLlNjZW5lLCBvcHRzOiBWb3hlbFRlcnJhaW5WaWV3T3B0aW9ucyA9IHt9KSB7XG4gICAgdGhpcy53b3JsZCA9IHdvcmxkO1xuICAgIHRoaXMubmVhclJhZGl1cyA9IE1hdGgubWF4KDEsIG9wdHMubmVhclJhZGl1cyA/PyAzKTtcbiAgICB0aGlzLndvcmxkTWFjcm9TdGVwID0gTWF0aC5tYXgoNCwgb3B0cy53b3JsZE1hY3JvU3RlcCA/PyA4KTtcbiAgICB0aGlzLm1hcE1hY3JvU3RlcCA9IE1hdGgubWF4KDQsIG9wdHMubWFwTWFjcm9TdGVwID8/IDgpO1xuICAgIHRoaXMuZ3JvdXAubmFtZSA9ICd2b3hlbF93b3JsZCc7XG4gICAgdGhpcy5uZWFyR3JvdXAubmFtZSA9ICd2b3hlbF9jaHVua3MnO1xuICAgIHRoaXMubWFjcm9Hcm91cC5uYW1lID0gJ21hY3JvX2xvZCc7XG4gICAgdGhpcy5ncm91cC5hZGQodGhpcy5uZWFyR3JvdXAsIHRoaXMubWFjcm9Hcm91cCk7XG4gICAgdGhpcy53YXRlciA9IGJ1aWxkV2F0ZXJTdXJmYWNlKHdvcmxkKTtcbiAgICB0aGlzLmdyb3VwLmFkZCh0aGlzLndhdGVyKTtcbiAgICBzY2VuZS5hZGQodGhpcy5ncm91cCk7XG4gIH1cblxuICBwcmVsb2FkKGZvY3VzOiBUSFJFRS5WZWN0b3IzKTogdm9pZCB7XG4gICAgdGhpcy5tb2RlID0gJ3dvcmxkJztcbiAgICB0aGlzLmVuc3VyZUNodW5rcyhmb2N1cywgdHJ1ZSk7XG4gICAgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsICd3b3JsZCcsIHRydWUpO1xuICB9XG5cbiAgdXBkYXRlKGZvY3VzOiBUSFJFRS5WZWN0b3IzLCBtb2RlOiBWaWV3TW9kZSA9ICd3b3JsZCcpOiB2b2lkIHtcbiAgICBpZiAobW9kZSAhPT0gdGhpcy5tb2RlKSB7XG4gICAgICB0aGlzLm1vZGUgPSBtb2RlO1xuICAgICAgdGhpcy5uZWFyR3JvdXAudmlzaWJsZSA9IG1vZGUgIT09ICdtYXAnO1xuICAgICAgdGhpcy5yZWJ1aWxkTWFjcm8oZm9jdXMsIG1vZGUsIHRydWUpO1xuICAgIH1cblxuICAgIGlmIChtb2RlID09PSAnbWFwJykge1xuICAgICAgaWYgKG1hY3JvRWRpdEtleSh0aGlzLndvcmxkKSAhPT0gdGhpcy5tYWNyb0VkaXRLZXkpIHRoaXMucmVidWlsZE1hY3JvKGZvY3VzLCBtb2RlLCB0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmVuc3VyZUNodW5rcyhmb2N1cywgZmFsc2UpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHRoaXMubG9hZGVkKSB7XG4gICAgICBpZiAodGhpcy53b3JsZC5kaXJ0eS5oYXMoa2V5KSkgdGhpcy5yZWJ1aWxkQ2h1bmsoa2V5KTtcbiAgICB9XG5cbiAgICBjb25zdCBtb3ZlZCA9IE1hdGguaHlwb3QoZm9jdXMueCAtIHRoaXMubWFjcm9Gb2N1cy54LCBmb2N1cy56IC0gdGhpcy5tYWNyb0ZvY3VzLnopO1xuICAgIGlmICh0aGlzLm1hY3JvTW9kZSAhPT0gbW9kZSB8fCBtb3ZlZCA+IDQ4IHx8IG1hY3JvRWRpdEtleSh0aGlzLndvcmxkKSAhPT0gdGhpcy5tYWNyb0VkaXRLZXkpIHtcbiAgICAgIHRoaXMucmVidWlsZE1hY3JvKGZvY3VzLCBtb2RlLCBmYWxzZSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBlbnN1cmVDaHVua3MoZm9jdXM6IFRIUkVFLlZlY3RvcjMsIGltbWVkaWF0ZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgY29uc3QgY2N6ID0gd29ybGRUb0NodW5rWihNYXRoLnJvdW5kKGZvY3VzLnopKTtcbiAgICBsZXQgY2hhbmdlZCA9IGZhbHNlO1xuICAgIGxldCBidWRnZXQgPSBpbW1lZGlhdGUgPyBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiA6IDI7XG5cbiAgICBmb3IgKGxldCBkeiA9IC10aGlzLm5lYXJSYWRpdXM7IGR6IDw9IHRoaXMubmVhclJhZGl1czsgZHorKykge1xuICAgICAgZm9yIChsZXQgZHggPSAtdGhpcy5uZWFyUmFkaXVzOyBkeCA8PSB0aGlzLm5lYXJSYWRpdXM7IGR4KyspIHtcbiAgICAgICAgY29uc3QgY3ggPSBjY3ggKyBkeCwgY3ogPSBjY3ogKyBkejtcbiAgICAgICAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gICAgICAgIGlmICh0aGlzLmxvYWRlZC5oYXMoa2V5KSkgY29udGludWU7XG4gICAgICAgIGlmIChidWRnZXQgPD0gMCkgY29udGludWU7XG4gICAgICAgIHRoaXMuYnVpbGRDaHVuayhjeCwgY3opO1xuICAgICAgICBidWRnZXQtLTtcbiAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbWFyZ2luID0gdGhpcy5uZWFyUmFkaXVzICsgMTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbLi4udGhpcy5sb2FkZWRdKSB7XG4gICAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgICAgaWYgKE1hdGguYWJzKGN4IC0gY2N4KSA+IG1hcmdpbiB8fCBNYXRoLmFicyhjeiAtIGNjeikgPiBtYXJnaW4pIHtcbiAgICAgICAgdGhpcy5kaXNwb3NlQ2h1bmsoa2V5KTtcbiAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGNoYW5nZWQpIHRoaXMub25DaHVua3NDaGFuZ2VkPy4oKTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRDaHVuayhjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgICBjb25zdCBnZW5CZWZvcmUgPSB0aGlzLndvcmxkLnN0YXRzLmdlbmVyYXRpb25NcztcbiAgICBjb25zdCBjaHVua3NCZWZvcmUgPSB0aGlzLndvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZDtcbiAgICAvLyBFbnN1cmUgdGhlIDN4MyBuZWlnaGJvdXJob29kIGV4aXN0cyBzbyBib3VuZGFyeSBmYWNlcyB1c2UgcmVhbCBkYXRhLlxuICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIHtcbiAgICAgIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIGVuc3VyZUNodW5rKHRoaXMud29ybGQsIGN4ICsgZHgsIGN6ICsgZHopO1xuICAgIH1cbiAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHRoaXMud29ybGQsIGN4LCBjeik7XG4gICAgaWYgKCFjaHVuaykgcmV0dXJuO1xuICAgIGNvbnN0IGdlbmVyYXRlZCA9IHRoaXMud29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkIC0gY2h1bmtzQmVmb3JlO1xuICAgIGlmIChnZW5lcmF0ZWQgPiAwKSB7XG4gICAgICByZWNvcmRTYW1wbGUodGhpcy5jaHVua0dlblNhbXBsZXMsICh0aGlzLndvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyAtIGdlbkJlZm9yZSkgLyBnZW5lcmF0ZWQpO1xuICAgIH1cblxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICB0aGlzLm5lYXJHcm91cC5yZW1vdmUoZXhpc3RpbmcubWVzaCk7XG4gICAgICBleGlzdGluZy5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICB9XG5cbiAgICBjb25zdCBtZXNoVDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICBjb25zdCB7IGdlb21ldHJ5LCB0cmlhbmdsZXMgfSA9IG1lc2hDaHVuayh0aGlzLndvcmxkLCBjaHVuayk7XG4gICAgcmVjb3JkU2FtcGxlKHRoaXMuY2h1bmtNZXNoU2FtcGxlcywgcGVyZm9ybWFuY2Uubm93KCkgLSBtZXNoVDApO1xuICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgdGVycmFpbk1hdGVyaWFsKTtcbiAgICBtZXNoLm5hbWUgPSBgdm94ZWxfY2h1bmtfJHtjeH1fJHtjen1gO1xuICAgIG1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gICAgbWVzaC5jYXN0U2hhZG93ID0gZmFsc2U7XG4gICAgdGhpcy5uZWFyR3JvdXAuYWRkKG1lc2gpO1xuICAgIHRoaXMuY2h1bmtzLnNldChrZXksIHsgbWVzaCwgdHJpYW5nbGVzIH0pO1xuICAgIHRoaXMubG9hZGVkLmFkZChrZXkpO1xuICAgIHRoaXMud29ybGQuZGlydHkuZGVsZXRlKGtleSk7XG4gIH1cblxuICBwcml2YXRlIGRpc3Bvc2VDaHVuayhrZXk6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHZpZXcgPSB0aGlzLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAodmlldykge1xuICAgICAgdGhpcy5uZWFyR3JvdXAucmVtb3ZlKHZpZXcubWVzaCk7XG4gICAgICB2aWV3Lm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICAgICAgdGhpcy5jaHVua3MuZGVsZXRlKGtleSk7XG4gICAgfVxuICAgIHRoaXMubG9hZGVkLmRlbGV0ZShrZXkpO1xuICAgIHRoaXMud29ybGQuZGlydHkuZGVsZXRlKGtleSk7XG4gICAgZXZpY3RDaHVuayh0aGlzLndvcmxkLCBrZXkpO1xuICB9XG5cbiAgcHJpdmF0ZSByZWJ1aWxkQ2h1bmsoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgIHRoaXMuYnVpbGRDaHVuayhjeCwgY3opO1xuICB9XG5cbiAgcmVidWlsZEFyb3VuZCh4OiBudW1iZXIsIHo6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICAgIGZvciAobGV0IGR6ID0gLTE7IGR6IDw9IDE7IGR6KyspIHtcbiAgICAgIGZvciAobGV0IGR4ID0gLTE7IGR4IDw9IDE7IGR4KyspIHtcbiAgICAgICAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3ggKyBkeCwgY3ogKyBkeik7XG4gICAgICAgIGlmICh0aGlzLmxvYWRlZC5oYXMoa2V5KSkgdGhpcy5yZWJ1aWxkQ2h1bmsoa2V5KTtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5vbkNodW5rc0NoYW5nZWQ/LigpO1xuICAgIGlmICh0aGlzLm1hY3JvKSB0aGlzLnJlYnVpbGRNYWNybyh0aGlzLm1hY3JvRm9jdXMsIHRoaXMubW9kZSwgdHJ1ZSk7XG4gIH1cblxuICBwcml2YXRlIHJlYnVpbGRNYWNybyhmb2N1czogVEhSRUUuVmVjdG9yMywgbW9kZTogVmlld01vZGUsIGZvcmNlOiBib29sZWFuKTogdm9pZCB7XG4gICAgaWYgKCFmb3JjZSAmJiB0aGlzLm1hY3JvTW9kZSA9PT0gbW9kZSkge1xuICAgICAgY29uc3QgbW92ZWQgPSBNYXRoLmh5cG90KGZvY3VzLnggLSB0aGlzLm1hY3JvRm9jdXMueCwgZm9jdXMueiAtIHRoaXMubWFjcm9Gb2N1cy56KTtcbiAgICAgIGlmIChtb2RlID09PSAnbWFwJyB8fCBtb3ZlZCA8PSA0OCkgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBtYWNyb1QwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgaWYgKHRoaXMubWFjcm8pIHtcbiAgICAgIHRoaXMubWFjcm9Hcm91cC5yZW1vdmUodGhpcy5tYWNybyk7XG4gICAgICB0aGlzLm1hY3JvLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAgIHRoaXMubWFjcm8gPSBudWxsO1xuICAgIH1cbiAgICBjb25zdCBzdGVwID0gbW9kZSA9PT0gJ21hcCcgPyB0aGlzLm1hcE1hY3JvU3RlcCA6IHRoaXMud29ybGRNYWNyb1N0ZXA7XG4gICAgbGV0IGhvbGU6IE1hY3JvSG9sZSB8IHVuZGVmaW5lZDtcbiAgICBpZiAobW9kZSAhPT0gJ21hcCcpIHtcbiAgICAgIGNvbnN0IGNjeCA9IHdvcmxkVG9DaHVua1goTWF0aC5yb3VuZChmb2N1cy54KSk7XG4gICAgICBjb25zdCBjY3ogPSB3b3JsZFRvQ2h1bmtaKE1hdGgucm91bmQoZm9jdXMueikpO1xuICAgICAgaG9sZSA9IHtcbiAgICAgICAgbWluWDogY2h1bmtPcmlnaW5YKGNjeCAtIHRoaXMubmVhclJhZGl1cyksXG4gICAgICAgIG1heFg6IGNodW5rT3JpZ2luWChjY3ggKyB0aGlzLm5lYXJSYWRpdXMpICsgQ0hVTktfU0laRSxcbiAgICAgICAgbWluWjogY2h1bmtPcmlnaW5aKGNjeiAtIHRoaXMubmVhclJhZGl1cyksXG4gICAgICAgIG1heFo6IGNodW5rT3JpZ2luWihjY3ogKyB0aGlzLm5lYXJSYWRpdXMpICsgQ0hVTktfU0laRSxcbiAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IGJ1aWxkTWFjcm9NZXNoKHRoaXMud29ybGQsIHsgc3RlcCwgaG9sZSB9KTtcbiAgICB0aGlzLm1hY3JvID0gcmVzdWx0Lm1lc2g7XG4gICAgdGhpcy5tYWNyb1RyaWFuZ2xlcyA9IHJlc3VsdC50cmlhbmdsZXM7XG4gICAgdGhpcy5tYWNyb0dyb3VwLmFkZChyZXN1bHQubWVzaCk7XG4gICAgdGhpcy5tYWNyb0ZvY3VzLmNvcHkoZm9jdXMpO1xuICAgIHRoaXMubWFjcm9Nb2RlID0gbW9kZTtcbiAgICB0aGlzLm1hY3JvRWRpdEtleSA9IG1hY3JvRWRpdEtleSh0aGlzLndvcmxkKTtcbiAgICByZWNvcmRTYW1wbGUodGhpcy5tYWNyb1NhbXBsZXMsIHBlcmZvcm1hbmNlLm5vdygpIC0gbWFjcm9UMCk7XG4gICAgaWYgKHJlc3VsdC5zYW1wbGVDYWNoZWQpIHRoaXMubWFjcm9DYWNoZUhpdHMrKztcbiAgICBlbHNlIHJlY29yZFNhbXBsZSh0aGlzLm1hY3JvU2FtcGxlU2FtcGxlcywgcmVzdWx0LnNhbXBsZU1zKTtcbiAgfVxuXG4gIGdldCBsb2FkZWRDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubG9hZGVkLnNpemU7IH1cbiAgZ2V0IGxvYWRlZENodW5rS2V5cygpOiBSZWFkb25seVNldDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMubG9hZGVkOyB9XG4gIGdldCBuZWFyVHJpYW5nbGVzKCk6IG51bWJlciB7XG4gICAgbGV0IHQgPSAwO1xuICAgIGZvciAoY29uc3QgdiBvZiB0aGlzLmNodW5rcy52YWx1ZXMoKSkgdCArPSB2LnRyaWFuZ2xlcztcbiAgICByZXR1cm4gdDtcbiAgfVxuICBnZXQgbWFjcm9UcmlhbmdsZUNvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm1hY3JvVHJpYW5nbGVzOyB9XG4gIGdldCBkcmF3Q2FsbHMoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubG9hZGVkLnNpemUgKyAodGhpcy5tYWNybyA/IDEgOiAwKSArIDE7IH1cbiAgZ2V0IG5lYXJSYWRpdXNDaHVua3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubmVhclJhZGl1czsgfVxuICAvKiogQ2xlYXIgdGhlIHJvbGxpbmcgdGltaW5nIHdpbmRvdyBiZWZvcmUgYSBtZWFzdXJlbWVudCBydW4uICovXG4gIHJlc2V0UGVyZigpOiB2b2lkIHtcbiAgICB0aGlzLmNodW5rR2VuU2FtcGxlcy5sZW5ndGggPSAwO1xuICAgIHRoaXMuY2h1bmtNZXNoU2FtcGxlcy5sZW5ndGggPSAwO1xuICAgIHRoaXMubWFjcm9TYW1wbGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5tYWNyb1NhbXBsZVNhbXBsZXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLm1hY3JvQ2FjaGVIaXRzID0gMDtcbiAgfVxuICAvKiogUm9sbGluZyBidWlsZCB0aW1pbmdzIGluIG1pbGxpc2Vjb25kcywgZm9yIHRoZSBwZXJmb3JtYW5jZSBldmlkZW5jZS4gKi9cbiAgZ2V0IHN0cmVhbVBlcmYoKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNodW5rR2VuUDUwOiBwZXJjZW50aWxlKHRoaXMuY2h1bmtHZW5TYW1wbGVzLCAwLjUpLFxuICAgICAgY2h1bmtHZW5QOTU6IHBlcmNlbnRpbGUodGhpcy5jaHVua0dlblNhbXBsZXMsIDAuOTUpLFxuICAgICAgY2h1bmtHZW5NYXg6IHBlcmNlbnRpbGUodGhpcy5jaHVua0dlblNhbXBsZXMsIDEpLFxuICAgICAgY2h1bmtNZXNoUDUwOiBwZXJjZW50aWxlKHRoaXMuY2h1bmtNZXNoU2FtcGxlcywgMC41KSxcbiAgICAgIGNodW5rTWVzaFA5NTogcGVyY2VudGlsZSh0aGlzLmNodW5rTWVzaFNhbXBsZXMsIDAuOTUpLFxuICAgICAgY2h1bmtNZXNoTWF4OiBwZXJjZW50aWxlKHRoaXMuY2h1bmtNZXNoU2FtcGxlcywgMSksXG4gICAgICBtYWNyb1A1MDogcGVyY2VudGlsZSh0aGlzLm1hY3JvU2FtcGxlcywgMC41KSxcbiAgICAgIG1hY3JvTWF4OiBwZXJjZW50aWxlKHRoaXMubWFjcm9TYW1wbGVzLCAxKSxcbiAgICAgIG1hY3JvU2FtcGxlUDUwOiBwZXJjZW50aWxlKHRoaXMubWFjcm9TYW1wbGVTYW1wbGVzLCAwLjUpLFxuICAgICAgbWFjcm9TYW1wbGVNYXg6IHBlcmNlbnRpbGUodGhpcy5tYWNyb1NhbXBsZVNhbXBsZXMsIDEpLFxuICAgICAgbWFjcm9DYWNoZUhpdHM6IHRoaXMubWFjcm9DYWNoZUhpdHMsXG4gICAgICBjaHVua1NhbXBsZXM6IHRoaXMuY2h1bmtHZW5TYW1wbGVzLmxlbmd0aCxcbiAgICAgIG1hY3JvU2FtcGxlczogdGhpcy5tYWNyb1NhbXBsZXMubGVuZ3RoLFxuICAgIH07XG4gIH1cbn1cbiIsICJ7XG4gIFwic2NoZW1hXCI6IFwicGFsZXR0ZV92MlwiLFxuICBcImRhdGVcIjogXCIyMDI2LTEwLTIyXCIsXG4gIFwic3RhdHVzXCI6IFwicHJvcG9zZWRcIixcbiAgXCJzb3VyY2VcIjogXCJSRUYtMDAyIChoeWJyaWQgd29ybGQgcmVmZXJlbmNlKSwgdmFsdWVzIHNhbXBsZWQgYnkgZXllOyBudW1lcmljIHZlcmlmaWNhdGlvbiBwZW5kaW5nXCIsXG4gIFwibm90ZVwiOiBcIk9uZSBtYXRlcmlhbCBwYWxldHRlLiBUaW1lIG9mIGRheSBpcyBleHByZXNzZWQgYnkgdGhlIGxpZ2h0aW5nIHByZXNldHMgYmVsb3csIG5vdCBieSByZXBhaW50aW5nIG1hdGVyaWFscy5cIixcbiAgXCJtYXRlcmlhbHNcIjoge1xuICAgIFwiZ3Jhc3NfdG9wXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzc5Qjk0Q1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGxvdyBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19oaWdoXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhGQzk1RVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIG1pZCBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19wZWFrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlBRDA2QVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGhpZ2ggZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfY2FwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVFOTQ0MFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuMC0wLjQgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfb2NocmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQzk5QTVGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC40LTAuNjIgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfcnVzdFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCNDYzM0NcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjYyLTAuODAgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdG9uZV90b3BcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZERkNDXCIsXG4gICAgICBcInJvbGVcIjogXCJiYXJlIHN0b25lIHRvcCBzdXJmYWNlXCJcbiAgICB9LFxuICAgIFwic3RvbmVfYm9keV9hXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0RDRDNCRVwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBib2R5LCBldmVuIDQuNSBtIGJhbmRcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9ib2R5X2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDFDN0FGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJvZHksIG9kZCA0LjUgbSBiYW5kXCJcbiAgICB9LFxuICAgIFwic3RvbmVfc2hhZGVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjlBRTk2XCIsXG4gICAgICBcInJvbGVcIjogXCJjcmV2aWNlIC8gcmVjZXNzZWQgc3RvbmUgYWNjZW50XCJcbiAgICB9LFxuICAgIFwic2FuZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFM0QzQTZcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlIGNlbGxzXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfc2hhbGxvd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM2N0NGRDhcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoIDw9IDAuNSBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfbWlkXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNBQUZDNFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggfjEuNSBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfZGVlcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyQThGQThcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoID49IDQuMCBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfcmltXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0JGRUFGMFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2hvcmVsaW5lIHJpbSAvIGZvYW0gdGludFwiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9hXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVGQTgzRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBzaGFkZSBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkZCODRBXCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9jXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzdGQzM1NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBoaWdobGlnaHQgbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9waW5rXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0YyQTZDNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmxvc3NvbSBhY2NlbnQgc3BlY2llcyBvbmx5XCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X3BpbmtfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFODhGQjJcIixcbiAgICAgIFwicm9sZVwiOiBcImJsb3Nzb20gc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcInRydW5rXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZCNEEzM1wiLFxuICAgICAgXCJyb2xlXCI6IFwidHJlZSB0cnVua3NcIlxuICAgIH0sXG4gICAgXCJiYXJrX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNEUzNjI2XCIsXG4gICAgICBcInJvbGVcIjogXCJ0cnVuayBzaGFkZSwgc3R1bXBzXCJcbiAgICB9LFxuICAgIFwib3JlX2NyeXN0YWxcIjoge1xuICAgICAgXCJoZXhcIjogXCIjN0I1QUQ2XCIsXG4gICAgICBcInJvbGVcIjogXCJvcmUgZGVwb3NpdCBhY2NlbnQgKHByb3Bvc2VkLCByZXBsYWNlcyB0ZWFsKVwiXG4gICAgfSxcbiAgICBcIm9yZV9jcnlzdGFsX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUI3QkU4XCIsXG4gICAgICBcInJvbGVcIjogXCJvcmUgaGlnaGxpZ2h0IGZhY2V0XCJcbiAgICB9LFxuICAgIFwibm94ZWxfc3RvbmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZERkNDXCIsXG4gICAgICBcInJvbGVcIjogXCJOb3hlbCBhcmNoaXRlY3R1cmUgbWFpbiBzdG9uZVwiXG4gICAgfSxcbiAgICBcIm5veGVsX3N0b25lX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDNDOUI0XCIsXG4gICAgICBcInJvbGVcIjogXCJOb3hlbCBzZWNvbmRhcnkgc3RvbmUgLyByZWNlc3NcIlxuICAgIH0sXG4gICAgXCJhY2NlbnRfYmx1ZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzRTdGQjhcIixcbiAgICAgIFwicm9sZVwiOiBcImJhbm5lciAvIGNsb3RoIGFjY2VudFwiXG4gICAgfSxcbiAgICBcImFjY2VudF90ZWFsXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJGQTZBMFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2Vjb25kYXJ5IGFjY2VudFwiXG4gICAgfSxcbiAgICBcImVtaXNzaXZlX2ZpcmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRkY5RTRBXCIsXG4gICAgICBcInJvbGVcIjogXCJjYW1wZmlyZSAvIHdhcm0gZW1pc3NpdmUgKGVmZmVjdHMgb25seSlcIlxuICAgIH0sXG4gICAgXCJlbWlzc2l2ZV9tYWdpY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNEMjRCRkZcIixcbiAgICAgIFwicm9sZVwiOiBcInJlc2VydmVkOiBtYWdpYyBlZmZlY3RzIG9ubHksIG5ldmVyIG1hdGVyaWFsc1wiXG4gICAgfVxuICB9LFxuICBcImxpZ2h0aW5nXCI6IHtcbiAgICBcImRhd25cIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogMTIsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMTA1LFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkM3OUFcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDIuMixcbiAgICAgIFwiaGVtaVNreVwiOiBcIiM4RkE2QzhcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM0RTVGNkVcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAwLjYsXG4gICAgICBcInNreVwiOiBcIiNBOEJFRDZcIixcbiAgICAgIFwiZm9nXCI6IFwiI0E4QkVENlwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDA1LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjFcbiAgICB9LFxuICAgIFwibm9vblwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiAzOCxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiA1MCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZGNERDXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAyLjc1LFxuICAgICAgXCJoZW1pU2t5XCI6IFwiI0JGRDlGMlwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzdBOEY1NVwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDAuNTUsXG4gICAgICBcInNreVwiOiBcIiM5RUQyRUVcIixcbiAgICAgIFwiZm9nXCI6IFwiI0RDRUZGOFwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDAyOCxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4wNVxuICAgIH0sXG4gICAgXCJkdXNrXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDksXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMjUwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkIyN0FcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDMuMixcbiAgICAgIFwiaGVtaVNreVwiOiBcIiM4RTdDOUVcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM1QTRBNTBcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAxLjEsXG4gICAgICBcInNreVwiOiBcIiNDOThFODZcIixcbiAgICAgIFwiZm9nXCI6IFwiI0MwOTA4QVwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDAzNixcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4zMlxuICAgIH0sXG4gICAgXCJuaWdodFwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiA0MCxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAyMjAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0FGQzhGRlwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMS4wLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzNBNEM3QVwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzFDMjU0MFwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDEuMDUsXG4gICAgICBcInNreVwiOiBcIiMxMDE3MzZcIixcbiAgICAgIFwiZm9nXCI6IFwiIzE1MUMzQ1wiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDA0NSxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS41XG4gICAgfVxuICB9XG59IiwgIi8vIFByaXZhdGUgbWlncmF0aW9uIHJlcGxheSBvbmx5LiBSZXRpcmVkIGVudGl0aWVzIGxpdmUgaW4gdGhpcyBXb3JsZCB3aGlsZSBhblxuLy8gYWNjZXB0ZWQgaGlzdG9yaWNhbCBqb3VybmFsIGlzIGNoZWNrZWQ7IG5vIHB1YmxpYyBjb21tYW5kIGVuYWJsZXMgdGhpcyBtb2RlLlxuaW50ZXJmYWNlIFJlcGxheVN0YXRlIHtcbiAgYWN0aXZlOiBib29sZWFuO1xuICBoaXN0b3JpY2FsSGFzaDogYm9vbGVhbjtcbiAgbWlncmF0ZWQ6IGJvb2xlYW47XG59XG5cbmNvbnN0IHN0YXRlcyA9IG5ldyBXZWFrTWFwPG9iamVjdCwgUmVwbGF5U3RhdGU+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiByZXBsYXlTdG9uZVN0YXRlKHdvcmxkOiBvYmplY3QpOiBSZXBsYXlTdGF0ZSB7XG4gIGxldCBzdGF0ZSA9IHN0YXRlcy5nZXQod29ybGQpO1xuICBpZiAoIXN0YXRlKSB7IHN0YXRlID0geyBhY3RpdmU6IGZhbHNlLCBoaXN0b3JpY2FsSGFzaDogZmFsc2UsIG1pZ3JhdGVkOiBmYWxzZSB9OyBzdGF0ZXMuc2V0KHdvcmxkLCBzdGF0ZSk7IH1cbiAgcmV0dXJuIHN0YXRlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSB0cnVlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG4gIHN0YXRlLm1pZ3JhdGVkID0gZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5hY3RpdmUgPz8gZmFsc2U7XG59XG5cbi8qKiBTbmFwc2hvdCBoYXNoZXMgYmVmb3JlIGFuZCBkdXJpbmcgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkgaW5jbHVkZSBzdG9uZXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5hYmxlSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uaGlzdG9yaWNhbEhhc2ggPz8gZmFsc2U7XG59XG5cbi8qKiBBIG1pZ3JhdGVkIHNuYXBzaG90IGFscmVhZHkgaGFzIHJldGlyZW1lbnQgdG9tYnN0b25lcyBpbiBnZW5lcmF0ZWQgY2h1bmtzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtTdG9uZU1pZ3JhdGVkKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkubWlncmF0ZWQgPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZU1pZ3JhdGVkKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5taWdyYXRlZCA/PyBmYWxzZTtcbn1cblxuLyoqIEV4aXQgaGlzdG9yaWNhbCBtb2RlIGFmdGVyIGFsbCBhY2NlcHRlZCBjb21tYW5kcyBhbmQgaGFzaGVzIGhhdmUgcGFzc2VkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmlzaFN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gZmFsc2U7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gZmFsc2U7XG4gIHN0YXRlLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cbiIsICIvLyBTaW11bGF0aW9uIGxheWVyIFx1MjAxNCBwdXJlIFR5cGVTY3JpcHQsIG5vIHRocmVlLmpzIGltcG9ydHMgKEQtMDA1KS5cbi8vXG4vLyBNMDAxIHdvcmxkIGZvdW5kYXRpb246IGEgY2h1bmtlZCwgZ2VudWluZWx5IHRocmVlLWRpbWVuc2lvbmFsIHZveGVsIHdvcmxkLlxuLy8gVGhlIHN0b3JlZCBzdGF0ZSBpcyBvbmUgbWF0ZXJpYWwgYnl0ZSBwZXIgY2VsbCAoMCA9IGFpcik7IG9jY3VwYW5jeSBpc1xuLy8gaW1wbGljaXQuIFN1cmZhY2UgaGVpZ2h0IGlzIGEgZGVyaXZlZCBxdWVyeSwgbm90IHRoZSBzdG9yYWdlLiBUaGlzIHJlcGxhY2VzXG4vLyB0aGUgZm9ybWVyIDI1NiB4IDI1NiBoZWlnaHRmaWVsZCAoc2VlIElSLTAwNSkuXG4vL1xuLy8gV29ybGQgbWV0cmVzOiB4L3ogaW4gWy0xMDI0LCAxMDI0KSwgeSBpbiBbLTE2LCAxMTIpLCBzZWEgbGV2ZWwgMC5cbi8vIEEgY2h1bmsgaXMgMzIgeCAzMiB4IDEyOCBjZWxscy4gR2VuZXJhdGlvbiBpcyBhIHB1cmUgZnVuY3Rpb24gb2YgdGhlIHNlZWQsXG4vLyBnZW5lcmF0b3IgdmVyc2lvbiwgcGFyYW1ldGVycyBhbmQgY2h1bmsgY29vcmRpbmF0ZXM7IGVkaXRzIGFyZSByZWNvcmRlZFxuLy8gc2VwYXJhdGVseSBhbmQgcmUtYXBwbGllZCB3aGVuIGEgY2h1bmsgaXMgcmVnZW5lcmF0ZWQuXG5pbXBvcnQgdHlwZSB7IFN0cnVjdHVyZSB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQgdHlwZSB7IExpZmVTdGF0ZSB9IGZyb20gJy4vZWNvbm9teSc7XG5pbXBvcnQgeyBpc1N0b25lUmVwbGF5IH0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuXG5leHBvcnQgY29uc3QgV09STERfU0laRSA9IDIwNDg7XG5leHBvcnQgY29uc3QgSEFMRiA9IFdPUkxEX1NJWkUgLyAyO1xuZXhwb3J0IGNvbnN0IENIVU5LX1NJWkUgPSAzMjtcbmV4cG9ydCBjb25zdCBDSFVOS1NfUEVSX1NJREUgPSBXT1JMRF9TSVpFIC8gQ0hVTktfU0laRTtcbmV4cG9ydCBjb25zdCBZX01JTiA9IC0xNjtcbmV4cG9ydCBjb25zdCBZX01BWCA9IDExMjtcbmV4cG9ydCBjb25zdCBXT1JMRF9IRUlHSFQgPSBZX01BWCAtIFlfTUlOO1xuZXhwb3J0IGNvbnN0IFNFQV9MRVZFTCA9IDA7XG5leHBvcnQgY29uc3QgV0FURVIgPSBTRUFfTEVWRUw7XG5leHBvcnQgY29uc3QgR0VORVJBVE9SX1ZFUlNJT04gPSAxO1xuZXhwb3J0IGNvbnN0IENIVU5LX1ZPTFVNRSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFICogV09STERfSEVJR0hUO1xuZXhwb3J0IGNvbnN0IENIVU5LX0FSRUEgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRTtcblxuZXhwb3J0IGNvbnN0IE1BVCA9IHtcbiAgQUlSOiAwLFxuICBHUkFTUzogMSxcbiAgU09JTDogMixcbiAgU0FORDogMyxcbiAgR1JBVkVMOiA0LFxuICBTVE9ORTogNSxcbiAgT1JFOiA2LFxuICBXQVRFUjogNyxcbiAgQkVEUk9DSzogOCxcbiAgTU9TUzogOSxcbn0gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBNYXRJZCA9ICh0eXBlb2YgTUFUKVtrZXlvZiB0eXBlb2YgTUFUXTtcblxuZXhwb3J0IGNvbnN0IGlzU29saWQgPSAobTogbnVtYmVyKTogYm9vbGVhbiA9PiBtICE9PSBNQVQuQUlSICYmIG0gIT09IE1BVC5XQVRFUjtcbmV4cG9ydCBjb25zdCBpc09wYXF1ZSA9IGlzU29saWQ7XG5cbmV4cG9ydCBjb25zdCBjbGFtcCA9ICh2OiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiAodiA8IGEgPyBhIDogdiA+IGIgPyBiIDogdik7XG5leHBvcnQgY29uc3QgbGVycCA9IChhOiBudW1iZXIsIGI6IG51bWJlciwgdDogbnVtYmVyKSA9PiBhICsgKGIgLSBhKSAqIHQ7XG5jb25zdCBzbW9vdGhzdGVwID0gKGUwOiBudW1iZXIsIGUxOiBudW1iZXIsIHg6IG51bWJlcikgPT4ge1xuICBjb25zdCB0ID0gY2xhbXAoKHggLSBlMCkgLyAoZTEgLSBlMCksIDAsIDEpO1xuICByZXR1cm4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcbn07XG5cbi8vIC0tLS0tLS0tLS0gZGV0ZXJtaW5pc3RpYyBoYXNoIC8gbm9pc2UgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gyaSh4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzaDNpKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2MykgXiBNYXRoLmltdWwoeiwgMjI0NjgyMjUxOSk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG11bGJlcnJ5MzIoc2VlZDogbnVtYmVyKTogKCkgPT4gbnVtYmVyIHtcbiAgbGV0IGEgPSBzZWVkID4+PiAwO1xuICByZXR1cm4gKCkgPT4ge1xuICAgIGEgPSAoYSArIDB4NmQyYjc5ZjUpID4+PiAwO1xuICAgIGxldCB0ID0gYTtcbiAgICB0ID0gTWF0aC5pbXVsKHQgXiAodCA+Pj4gMTUpLCB0IHwgMSk7XG4gICAgdCBePSB0ICsgTWF0aC5pbXVsKHQgXiAodCA+Pj4gNyksIHQgfCA2MSk7XG4gICAgcmV0dXJuICgodCBeICh0ID4+PiAxNCkpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG4gIH07XG59XG5cbmNvbnN0IHNtb290aCA9ICh0OiBudW1iZXIpID0+IHQgKiB0ICogKDMgLSAyICogdCk7XG5cbmZ1bmN0aW9uIHZhbHVlTm9pc2UyKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKTtcbiAgY29uc3QgYSA9IGhhc2gyaSh4aSwgeWksIHNlZWQpLCBiID0gaGFzaDJpKHhpICsgMSwgeWksIHNlZWQpO1xuICBjb25zdCBjID0gaGFzaDJpKHhpLCB5aSArIDEsIHNlZWQpLCBkID0gaGFzaDJpKHhpICsgMSwgeWkgKyAxLCBzZWVkKTtcbiAgY29uc3QgdG9wID0gYSArIChiIC0gYSkgKiB4ZjtcbiAgY29uc3QgYm90dG9tID0gYyArIChkIC0gYykgKiB4ZjtcbiAgcmV0dXJuIHRvcCArIChib3R0b20gLSB0b3ApICogeWY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmYm0yKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UyKHggKiBmcmVxLCB5ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuZnVuY3Rpb24gdmFsdWVOb2lzZTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSksIHppID0gTWF0aC5mbG9vcih6KTtcbiAgY29uc3QgeGYgPSBzbW9vdGgoeCAtIHhpKSwgeWYgPSBzbW9vdGgoeSAtIHlpKSwgemYgPSBzbW9vdGgoeiAtIHppKTtcbiAgY29uc3QgYzAwMCA9IGhhc2gzaSh4aSwgeWksIHppLCBzZWVkKSwgYzEwMCA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSwgc2VlZCk7XG4gIGNvbnN0IGMwMTAgPSBoYXNoM2koeGksIHlpICsgMSwgemksIHNlZWQpLCBjMTEwID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSwgc2VlZCk7XG4gIGNvbnN0IGMwMDEgPSBoYXNoM2koeGksIHlpLCB6aSArIDEsIHNlZWQpLCBjMTAxID0gaGFzaDNpKHhpICsgMSwgeWksIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IGMwMTEgPSBoYXNoM2koeGksIHlpICsgMSwgemkgKyAxLCBzZWVkKSwgYzExMSA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgeDAwID0gYzAwMCArIChjMTAwIC0gYzAwMCkgKiB4ZjtcbiAgY29uc3QgeDEwID0gYzAxMCArIChjMTEwIC0gYzAxMCkgKiB4ZjtcbiAgY29uc3QgeDAxID0gYzAwMSArIChjMTAxIC0gYzAwMSkgKiB4ZjtcbiAgY29uc3QgeDExID0gYzAxMSArIChjMTExIC0gYzAxMSkgKiB4ZjtcbiAgY29uc3QgeTAgPSB4MDAgKyAoeDEwIC0geDAwKSAqIHlmO1xuICBjb25zdCB5MSA9IHgwMSArICh4MTEgLSB4MDEpICogeWY7XG4gIHJldHVybiB5MCArICh5MSAtIHkwKSAqIHpmO1xufVxuXG5mdW5jdGlvbiBmYm0zKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTMoeCAqIGZyZXEsIHkgKiBmcmVxLCB6ICogZnJlcSwgc2VlZCArIGkgKiAxMzEpO1xuICAgIG5vcm0gKz0gYW1wO1xuICAgIGFtcCAqPSAwLjU7IGZyZXEgKj0gMjtcbiAgfVxuICByZXR1cm4gc3VtIC8gbm9ybTtcbn1cblxuLy8gLS0tLS0tLS0tLSB3b3JsZCB0eXBlcyAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkUGFyYW1zIHtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEFSQU1TOiBXb3JsZFBhcmFtcyA9IHtcbiAgc2l6ZTogV09STERfU0laRSxcbiAgY2h1bmtTaXplOiBDSFVOS19TSVpFLFxuICB5TWluOiBZX01JTixcbiAgeU1heDogWV9NQVgsXG4gIHNlYUxldmVsOiBTRUFfTEVWRUwsXG4gIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbENodW5rIHtcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAga2V5OiBzdHJpbmc7XG4gIC8qKiB4ICsgeiozMiArICh5LVlfTUlOKSoxMDI0ICovXG4gIGRhdGE6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3Agc29saWQgeSwgZW5jb2RlZCBhcyAoeSAtIFlfTUlOKSwgMC4uMTI3OyAwIG1lYW5zIG5vIHNvbGlkLiAqL1xuICBoZWlnaHRzOiBVaW50OEFycmF5O1xuICAvKiogdG9wIG1hdGVyaWFsIHBlciBjb2x1bW4uICovXG4gIHRvcE1hdGVyaWFsczogVWludDhBcnJheTtcbiAgbm9uQWlyOiBudW1iZXI7XG4gIGRpcnR5OiBib29sZWFuO1xuICBnZW5lcmF0ZWRBdDogbnVtYmVyO1xufVxuXG4vLyBOYXR1cmFsIGFzc2V0cyBhcmUgdGhlIHByb2plY3QncyBTdHlsIChgbmF0X2ApIHBpcGVsaW5lIChBUy0wMDEgdjIpLCBub3Rcbi8vIE5veGVsIGFyY2hpdGVjdHVyZS4gTm94ZWwgcmVtYWlucyB0aGUgaHVtYW4tbWFkZSBraXQvd2F5c3RvbmUvbWFya2VyIHN5c3RlbS5cbi8vIFJldGlyZWQgb25seSBhcyB3b3JsZCBjb250ZW50LiBUaGUgbmFtZXMgcmVtYWluIGluIHRoZSBzZXJpYWxpemVkIHR5cGUgc29cbi8vIG9sZCBzbmFwc2hvdHMgYW5kIGFjY2VwdGVkIGhhcnZlc3Qgam91cm5hbHMgY2FuIGJlIG1pZ3JhdGVkIHdpdGhvdXQgcmVqZWN0aW5nXG4vLyBvdGhlcndpc2UgdmFsaWQgc2F2ZXMuIEdlbmVyYXRpb24sIGNvbGxpc2lvbiBhbmQgaW5zcGVjdGlvbiBuZXZlciB1c2UgdGhlbS5cbmV4cG9ydCBjb25zdCBSRVRJUkVEX1NUT05FX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnLFxuXSk7XG5leHBvcnQgY29uc3QgaXNSZXRpcmVkU3RvbmVLaW5kID0gKGtpbmQ6IEVudGl0eUtpbmQpOiBib29sZWFuID0+IFJFVElSRURfU1RPTkVfS0lORFMuaGFzKGtpbmQpO1xuZXhwb3J0IHR5cGUgQWN0aXZlRW50aXR5S2luZCA9IEV4Y2x1ZGU8RW50aXR5S2luZCxcbiAgJ3N0eWxfcm9ja19zbWFsbCcgfCAnc3R5bF9yb2NrX21lZGl1bScgfCAnc3R5bF9yb2NrX2xhcmdlJz47XG5cbmZ1bmN0aW9uIGxpdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogRW50aXR5IHwgbnVsbCB7XG4gIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIHJldHVybiAhZW50aXR5IHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoaWQpID8gbnVsbCA6IGVudGl0eTtcbn1cblxuZXhwb3J0IHR5cGUgRW50aXR5S2luZCA9XG4gIHwgJ3N0eWxfdHJlZV9zcGlyZSdcbiAgfCAnc3R5bF90cmVlX3RhYmxlJ1xuICB8ICdzdHlsX3RyZWVfY2x1c3RlcidcbiAgfCAnc3R5bF90cmVlX2Jsb3Nzb20nXG4gIHwgJ3N0eWxfc2hydWInXG4gIHwgJ3N0eWxfcm9ja19zbWFsbCdcbiAgfCAnc3R5bF9yb2NrX21lZGl1bSdcbiAgfCAnc3R5bF9yb2NrX2xhcmdlJ1xuICB8ICdzdHlsX29yZSdcbiAgfCAnc3R5bF9jYWlybidcbiAgfCAnd2F5c3RvbmUnXG4gIHwgJ21hcmtlcic7XG5cbmV4cG9ydCB0eXBlIFJlc291cmNlVHlwZSA9ICd3b29kJyB8ICdzdG9uZScgfCAnb3JlJyB8ICdmaWJlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW50aXR5IHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgY2h1bms6IHN0cmluZztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHNjYWxlOiBudW1iZXI7XG4gIHZhcmlhbnQ6IG51bWJlcjtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIHJlbWFpbmluZzogbnVtYmVyO1xuICB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcjtcbiAgLyoqIFRydWUgb25jZSB0aGUgZW50aXR5IGlzIGZ1bGx5IGRlcGxldGVkLiAqL1xuICBoYXJ2ZXN0ZWQ6IGJvb2xlYW47XG4gIC8qKiBUcnVlIGFmdGVyIHRoZSBmaXJzdCBzdWNjZXNzZnVsIGhhcnZlc3QsIGV2ZW4gaWYgeWllbGQgcmVtYWlucy4gKi9cbiAgaGFydmVzdGVkT25jZT86IGJvb2xlYW47XG4gIHByb3Zpc2lvbmFsOiBib29sZWFuO1xuICBhdXRob3JlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3hlbFNpdGUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWdpb25JbmZvIHtcbiAgaWQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgdHlwZTogJ3BsYWluJyB8ICdmb3Jlc3QnIHwgJ2hpbGxzJyB8ICdoaWdobGFuZCcgfCAnd2F0ZXInIHwgJ3JpZGdlJztcbiAgY3g6IG51bWJlcjtcbiAgY3o6IG51bWJlcjtcbiAgcng6IG51bWJlcjtcbiAgcno6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFN0YXRzIHtcbiAgY2h1bmtzR2VuZXJhdGVkOiBudW1iZXI7XG4gIGNodW5rc0V2aWN0ZWQ6IG51bWJlcjtcbiAgdm94ZWxzRmlsbGVkOiBudW1iZXI7XG4gIGdlbmVyYXRpb25NczogbnVtYmVyO1xuICBlbnRpdGllczogbnVtYmVyO1xuICB0cmVlczogbnVtYmVyO1xuICBwaW5rVHJlZXM6IG51bWJlcjtcbiAgcGlua092ZXJmbG93OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGQge1xuICBzZWVkOiBudW1iZXI7XG4gIHBhcmFtczogV29ybGRQYXJhbXM7XG4gIGNodW5rczogTWFwPHN0cmluZywgVm94ZWxDaHVuaz47XG4gIGVudGl0aWVzOiBNYXA8c3RyaW5nLCBFbnRpdHk+O1xuICBlbnRpdHlDaHVua3M6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPjtcbiAgLyoqIENodW5rcyB3aG9zZSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZW50aXR5IHN0YXRlIGhhcyBiZWVuIGNoYW5nZWQuICovXG4gIGVudGl0eUNoYW5nZXM6IFNldDxzdHJpbmc+O1xuICAvKiogVG9tYnN0b25lcyBmb3IgcmVtb3ZlZCBkZXRlcm1pbmlzdGljIG5hdHVyYWwgZW50aXRpZXMuICovXG4gIGVudGl0eVJlbW92YWxzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIEF1dGhvcml0YXRpdmUgYnVpbHQgc3RydWN0dXJlcyAoaG91c2UsIHBhdGgsIHRlcnJhY2VzLCBjcm9wcykuICovXG4gIHN0cnVjdHVyZXM6IE1hcDxzdHJpbmcsIFN0cnVjdHVyZT47XG4gIHNpdGVzOiBOb3hlbFNpdGVbXTtcbiAgcmVnaW9uczogUmVnaW9uSW5mb1tdO1xuICAvKiogY2h1bmsga2V5IC0+IGxvY2FsIHZveGVsIGluZGV4IC0+IG1hdGVyaWFsLiBEdXJhYmxlLCBjb21wYWN0IGVkaXRzLiAqL1xuICBlZGl0czogTWFwPHN0cmluZywgTWFwPG51bWJlciwgbnVtYmVyPj47XG4gIC8qKiBHbG9iYWwgbG9jYWwtcGxheWVyIGNhcnJpZWQgYmFnOyBib3VuZGVkIGluIHNjaGVtYSAzLCBsZWdhY3kgaW4gMS8yLiAqL1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQcmVzZW50IG9ubHkgYWZ0ZXIgc2NoZW1hLTMgZ2VuZXNpcy9yZXN0b3JhdGlvbi4gKi9cbiAgbGlmZT86IExpZmVTdGF0ZTtcbiAgZGlydHk6IFNldDxzdHJpbmc+O1xuICBzdGF0czogV29ybGRTdGF0cztcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKlxuICAgKiBNb25vdG9uaWMgcmV2aXNpb24gb2YgYXV0aG9yaXRhdGl2ZSBzdGF0ZSAodm94ZWxzIGFuZCBlbnRpdGllcykuIERlcml2ZWRcbiAgICogY2FjaGVzIGtleWVkIG9uIHRoaXMgdmFsdWUgYXJlIGRpc2NhcmRlZCBhZnRlciBhbiBlZGl0OyBtZXNoL25hdmlnYXRpb25cbiAgICogcmV2aXNpb25zIGFyZSBzZXBhcmF0ZSBiZWNhdXNlIHRoZXkgYXJlIGRlcml2ZWQsIG5vdCB3b3JsZCBzdGF0ZS5cbiAgICovXG4gIHJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBjaHVua0tleSA9IChjeDogbnVtYmVyLCBjejogbnVtYmVyKSA9PiBgJHtjeH0sJHtjen1gO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWCA9IChjeDogbnVtYmVyKSA9PiBjeCAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGNodW5rT3JpZ2luWiA9IChjejogbnVtYmVyKSA9PiBjeiAqIENIVU5LX1NJWkUgLSBIQUxGO1xuZXhwb3J0IGNvbnN0IGxvY2FsSW5kZXggPSAobHg6IG51bWJlciwgeUluZGV4OiBudW1iZXIsIGx6OiBudW1iZXIpID0+XG4gIGx4ICsgbHogKiBDSFVOS19TSVpFICsgeUluZGV4ICogQ0hVTktfQVJFQTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtYID0gKHg6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeCArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWiA9ICh6OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHogKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFggPSAoeDogbnVtYmVyKSA9PiB4IC0gKHdvcmxkVG9DaHVua1goeCkgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWiA9ICh6OiBudW1iZXIpID0+IHogLSAod29ybGRUb0NodW5rWih6KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB5VG9JbmRleCA9ICh5OiBudW1iZXIpID0+IHkgLSBZX01JTjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmxkKHNlZWQgPSAxMzM3KTogV29ybGQge1xuICByZXR1cm4ge1xuICAgIHNlZWQsXG4gICAgcGFyYW1zOiB7IC4uLkRFRkFVTFRfUEFSQU1TIH0sXG4gICAgY2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXRpZXM6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdHlDaGFuZ2VzOiBuZXcgU2V0KCksXG4gICAgZW50aXR5UmVtb3ZhbHM6IG5ldyBTZXQoKSxcbiAgICBzdHJ1Y3R1cmVzOiBuZXcgTWFwKCksXG4gICAgc2l0ZXM6IFtdLFxuICAgIHJlZ2lvbnM6IFJFR0lPTlMsXG4gICAgZWRpdHM6IG5ldyBNYXAoKSxcbiAgICBpbnZlbnRvcnk6IHt9LFxuICAgIGRpcnR5OiBuZXcgU2V0KCksXG4gICAgc3RhdHM6IHtcbiAgICAgIGNodW5rc0dlbmVyYXRlZDogMCwgY2h1bmtzRXZpY3RlZDogMCwgdm94ZWxzRmlsbGVkOiAwLCBnZW5lcmF0aW9uTXM6IDAsXG4gICAgICBlbnRpdGllczogMCwgdHJlZXM6IDAsIHBpbmtUcmVlczogMCwgcGlua092ZXJmbG93OiAwLFxuICAgIH0sXG4gICAgYXV0aG9yZWRQbGFjZWQ6IGZhbHNlLFxuICAgIHJldmlzaW9uOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVXb3JsZChzZWVkID0gMTMzNywgaW5pdGlhbFJhZGl1cyA9IDApOiBXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCk7XG4gIGNvbnN0IGNlbnRyZSA9IE1hdGguZmxvb3IoQ0hVTktTX1BFUl9TSURFIC8gMik7XG4gIGZvciAobGV0IGN6ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ogPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY2VudHJlIC0gaW5pdGlhbFJhZGl1czsgY3ggPD0gY2VudHJlICsgaW5pdGlhbFJhZGl1czsgY3grKykge1xuICAgICAgZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICB9XG4gIH1cbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuXG4vLyAtLS0tLS0tLS0tIGdlb2dyYXBoeSAtLS0tLS0tLS0tXG5leHBvcnQgY29uc3QgUkVHSU9OUzogUmVnaW9uSW5mb1tdID0gW1xuICB7IGlkOiAnZm91bmRlcicsIGxhYmVsOiAnRm91bmRlciB2YWxsZXknLCB0eXBlOiAncGxhaW4nLCBjeDogMCwgY3o6IDAsIHJ4OiAxMTAsIHJ6OiA4NSB9LFxuICB7IGlkOiAnZWFzdHdvb2QnLCBsYWJlbDogJ0Vhc3R3b29kJywgdHlwZTogJ2ZvcmVzdCcsIGN4OiAyMjAsIGN6OiAtMTEwLCByeDogMjYwLCByejogMjIwIH0sXG4gIHsgaWQ6ICdjcm93bicsIGxhYmVsOiAnQ3Jvd24gaGlnaGxhbmRzJywgdHlwZTogJ2hpZ2hsYW5kJywgY3g6IC0zNjAsIGN6OiAtMzAwLCByeDogMzgwLCByejogMzAwIH0sXG4gIHsgaWQ6ICdsYWtlJywgbGFiZWw6ICdNaXJyb3IgbGFrZScsIHR5cGU6ICd3YXRlcicsIGN4OiAtMjYwLCBjejogLTIzMCwgcng6IDEyMCwgcno6IDk1IH0sXG4gIHsgaWQ6ICdzb3V0aGRvd25zJywgbGFiZWw6ICdTb3V0aCBkb3ducycsIHR5cGU6ICdoaWxscycsIGN4OiAxMjAsIGN6OiAzMzAsIHJ4OiAyNjAsIHJ6OiAxOTAgfSxcbiAgeyBpZDogJ3dlc3RyaXNlJywgbGFiZWw6ICdXZXN0IHJpc2UnLCB0eXBlOiAnaGlsbHMnLCBjeDogLTM2MCwgY3o6IDEyMCwgcng6IDIyMCwgcno6IDIxMCB9LFxuICB7IGlkOiAnY29hc3QnLCBsYWJlbDogJ0Jyb2tlbiBjb2FzdCcsIHR5cGU6ICdyaWRnZScsIGN4OiAwLCBjejogMCwgcng6IDc4MCwgcno6IDY2MCB9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyQ2VudGVyWCh6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUaGUgcml2ZXIgcnVucyBub3J0aFx1MjAxM3NvdXRoIGFib3V0IDcwXHUyMDEzMTEwIG0gd2VzdCBvZiB0aGUgZm91bmRlciBzaGVsZiwgc29cbiAgLy8gdGhlIGRlZmF1bHQgbm9ydGgtd2VzdCB2aWV3IGhhcyB3YXRlciwgYSBuZWFyIGJhbmsgYW5kIGEgZmFyIGJhbmsuXG4gIHJldHVybiAtOTAgKyA1NSAqIE1hdGguc2luKCh6ICsgMTAwKSAvIDI0MCkgKyAxOCAqIE1hdGguc2luKCh6IC0gMjApIC8gODApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLmFicyh4IC0gcml2ZXJDZW50ZXJYKHopKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxha2VEaXN0YW5jZSh4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLnNxcnQoKCh4ICsgMjYwKSAvIDEyMCkgKiogMiArICgoeiArIDIzMCkgLyA5NSkgKiogMik7XG59XG5cbi8qKlxuICogSW50ZWdlciB0b3Agc29saWQgeSBvZiB0aGUgYmFzZSBnZW5lcmF0ZWQgc3VyZmFjZSAobm8gZWRpdHMvb3ZlcmhhbmdzKS5cbiAqXG4gKiBUaGlzIGlzIHRoZSAqc2hhcGUqIHRoZSB2b3hlbCB2b2x1bWUgaXMgZmlsbGVkIGZyb20sIG5vdCB0aGUgc3RvcmVkIHdvcmxkLlxuICogVGhlIGltcG9ydGFudCBjb3JyZWN0aW9uIG92ZXIgdGhlIGZpcnN0IE0wMDEgcGFzcyBpcyB0aGF0IHRoZSBsYW5kc2NhcGUgaXNcbiAqIG5vdCBvbmUgc21vb3RoIHJhZGlhbCBib3dsOiBpdCBpcyBhIHdhcnBlZCBtdWx0aS1zY2FsZSBzdXJmYWNlIHdpdGggYSBicm9hZFxuICogcml2ZXIgdmFsbGV5LCBhIHNtYWxsIGJ1aWxkYWJsZSBzaGVsZiwgYW5kIHJpZGdlZCBoaWdobGFuZHMuIEEgc2hhbGxvd1xuICogc21vb3RoIHN1cmZhY2UgcXVhbnRpc2VkIHRvIDEgbSB2b3hlbHMgaXMgd2hhdCBwcm9kdWNlZCB0aGUgY29uY2VudHJpY1xuICogY29udG91ciByaW5nczsgdmFyaWVkIHJlbGllZiBhbmQgYSByaXZlciB2YWxsZXkgYnJlYWsgdGhlbSBuYXR1cmFsbHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlSGVpZ2h0QXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFR3by1zY2FsZSBkb21haW4gd2FycC4gVGhlIGJyb2FkIHdhcnAgbW92ZXMgY29hc3RsaW5lcyBhbmQgaGlsbHM7IHRoZVxuICAvLyBzbWFsbCB3YXJwIGtlZXBzIHRoZSAxIG0gcXVhbnRpc2F0aW9uIGZyb20gZm9sbG93aW5nIGNsZWFuIGNvbnRvdXJzLlxuICBjb25zdCB3eCA9IHhcbiAgICArIChmYm0yKHggLyA0MjAsIHogLyA0MjAsIHNlZWQgKyAxMDEsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1LCB6IC8gOTUsIHNlZWQgKyAxMDIsIDIpIC0gMC41KSAqIDMwO1xuICBjb25zdCB3eiA9IHpcbiAgICArIChmYm0yKHggLyA0MjAgKyA3LjMsIHogLyA0MjAgLSAzLjEsIHNlZWQgKyAxMDMsIDMpIC0gMC41KSAqIDI0MFxuICAgICsgKGZibTIoeCAvIDk1ICsgMy43LCB6IC8gOTUgLSA4LjEsIHNlZWQgKyAxMDQsIDIpIC0gMC41KSAqIDMwO1xuXG4gIGNvbnN0IHJhZGlhbCA9IE1hdGguc3FydCgod3ggLyA3ODApICoqIDIgKyAod3ogLyA2NjApICoqIDIpO1xuICBjb25zdCBjb2FzdE5vaXNlID0gKGZibTIod3ggLyAzMDAsIHd6IC8gMzAwLCBzZWVkICsgMTA1LCA0KSAtIDAuNSkgKiAwLjM0XG4gICAgKyAoZmJtMih3eCAvIDk1LCB3eiAvIDk1LCBzZWVkICsgMTA2LCAyKSAtIDAuNSkgKiAwLjEwO1xuICBjb25zdCBsYW5kbmVzcyA9IDEuMCAtIHJhZGlhbCArIGNvYXN0Tm9pc2U7XG4gIGNvbnN0IGlubGFuZCA9IHNtb290aHN0ZXAoLTAuMDMsIDAuMTIsIGxhbmRuZXNzKTtcblxuICBjb25zdCBvY2VhbkZsb29yID0gLTEzICsgNiAqIGZibTIod3ggLyAxNzAsIHd6IC8gMTcwLCBzZWVkICsgMTA3LCAzKTtcblxuICAvLyBSb2xsaW5nIGxhbmQgYXQgdGhyZWUgc2NhbGVzLiBUaGUgNDAgbSBhbmQgMTUgbSBjb21wb25lbnRzIGFyZSByZWFsXG4gIC8vIHN1cmZhY2UgaGVpZ2h0LCBub3QgYSByZW5kZXIgZGVjb3JhdGlvbiwgc28gdGhlIG1hY3JvIHNhbXBsZXIgYWdyZWVzLlxuICBjb25zdCBzd2VsbCA9IDQgKyAxMSAqIGZibTIod3ggLyAzNDAsIHd6IC8gMzQwLCBzZWVkICsgMTA4LCA0KTtcbiAgY29uc3QgaGlsbHMgPSA4ICogZmJtMih3eCAvIDExNSwgd3ogLyAxMTUsIHNlZWQgKyAxMDksIDMpO1xuICBjb25zdCBidW1wcyA9IDIuMiAqIGZibTIoeCAvIDQyLCB6IC8gNDIsIHNlZWQgKyAxMTAsIDIpXG4gICAgKyAwLjkgKiBmYm0yKHggLyAxNSwgeiAvIDE1LCBzZWVkICsgMTExLCAyKTtcblxuICAvLyBSaWRnZWQgaGlnaGxhbmRzLiBUaGUgbWFzc2lmIG1hc2sgaXMgcmVnaW9uYWwgYW5kIGJpYXNlZCB0byB0aGVcbiAgLy8gbm9ydGgtd2VzdDsgd2l0aG91dCB0aGUgcmVnaW9uYWwgZ2F0ZSB0aGUgZmlyc3QgTTAwMSBwYXNzIHJhaXNlZCBhIDQ4IG1cbiAgLy8gbW91bnRhaW4gZGlyZWN0bHkgdW5kZXIgdGhlIGZvdW5kZXIgc2hlbGYuXG4gIGNvbnN0IG1hc3NpZk5vaXNlID0gZmJtMih3eCAvIDQ4MCArIDExLCB3eiAvIDQ4MCAtIDcsIHNlZWQgKyAxMTIsIDQpO1xuICBjb25zdCBtYXNzaWZNYXNrID0gc21vb3Roc3RlcCgwLjYwLCAwLjc4LCBtYXNzaWZOb2lzZSk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMjMwLCB3eiAvIDIzMCwgc2VlZCArIDExMywgNCkgLSAxKTtcbiAgY29uc3QgcmlkZ2UyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTQsIDMpIC0gMSk7XG4gIGNvbnN0IG53QmlhcyA9IE1hdGguZXhwKC0oKCh3eCArIDM2MCkgLyAzODApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDMyMCkgKiogMikpO1xuICBjb25zdCBtb3VudCA9IE1hdGgubWluKDEsIG1hc3NpZk1hc2sgKiAoMC4zMCArIDAuNzAgKiBud0JpYXMpICsgMC4yMiAqIG53Qmlhcyk7XG5cbiAgbGV0IGggPSBzd2VsbCArIGhpbGxzICsgYnVtcHNcbiAgICArIG1vdW50ICogKDIwICsgNDAgKiByaWRnZSAqIHJpZGdlICsgMTIgKiByaWRnZTIpO1xuXG4gIC8vIFNwdXJzIGFuZCBndWxsaWVzIGF0IDMwXHUyMDEzOTAgbS4gV2l0aG91dCB0aGVzZSwgYSBzbW9vdGggaGlsbCBxdWFudGlzZWQgdG9cbiAgLy8gMSBtIHZveGVscyByZWFkcyBhcyBjb25jZW50cmljIGNvbnRvdXIgcmluZ3M7IHdpdGggdGhlbSwgdGhlIHNhbWUgaGlsbFxuICAvLyBicmVha3MgaW50byByaWRnZXMsIHNpZGUgdmFsbGV5cyBhbmQgcm9jayBmYWNlcy5cbiAgY29uc3Qgc3B1ciA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDg1LCB3eiAvIDg1LCBzZWVkICsgMTIwLCAzKSAtIDEpO1xuICBjb25zdCBndWxseSA9IE1hdGgucG93KDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDUyICsgMTMsIHd6IC8gNTIgLSA1LCBzZWVkICsgMTIxLCAzKSAtIDEpLCAyKTtcbiAgaCArPSAoc3B1ciAtIDAuNTUpICogNS4wIC0gZ3VsbHkgKiAzLjI7XG5cbiAgaCA9IG9jZWFuRmxvb3IgKyAoaCAtIG9jZWFuRmxvb3IpICogaW5sYW5kO1xuICBoICs9IDEuNiAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG5cbiAgLy8gQnJvYWQgcml2ZXIgdmFsbGV5LCB0aGVuIHRoZSBjaGFubmVsIGl0c2VsZi4gVGhlIHZhbGxleSBtYXNrIGlzIGdhdGVkIGJ5XG4gIC8vIGxhbmRuZXNzOiB3aXRob3V0IHRoZSBnYXRlIGl0IHB1bGxlZCB0aGUgb2NlYW4gZmxvb3IgdXAgdG8gdGhlIHZhbGxleVxuICAvLyBmbG9vciBvdXRzaWRlIHRoZSBpc2xhbmQsIHdoaWNoIHRoZSBtYXAgdmlldyBzaG93ZWQgYXMgcGFsZSByaXZlci1zaGFwZWRcbiAgLy8gYmFycyBydW5uaW5nIHRvIHRoZSBob3Jpem9uLlxuICBjb25zdCByZCA9IHJpdmVyRGlzdGFuY2Uod3gsIHd6KTtcbiAgY29uc3QgdmFsbGV5ID0gc21vb3Roc3RlcCg5NSwgMTAsIHJkKSAqIHNtb290aHN0ZXAoMC4wLCAwLjEwLCBsYW5kbmVzcyk7XG4gIGNvbnN0IHZhbGxleUZsb29yID0gMi41ICsgMS4wICogZmJtMih3eCAvIDYwLCB3eiAvIDYwLCBzZWVkICsgMTE1LCAyKTtcbiAgaCA9IGxlcnAoaCwgdmFsbGV5Rmxvb3IsIHZhbGxleSAqIDAuNzUpO1xuICBjb25zdCByaXZlclcgPSA1LjAgKyAzLjAgKiBmYm0yKHd4IC8gNDUsIHd6IC8gNDUsIHNlZWQgKyAxMTYsIDIpO1xuICAvLyBBIHdpZGUsIHNoYWxsb3cgY2hhbm5lbCBwcm9maWxlLiBUaGUgZmlyc3QgcGFzcyBjYXJ2ZWQgYSAxMiBtIHNsb3Qgd2l0aFxuICAvLyBuZWFyLXZlcnRpY2FsIGJhbmtzLCB3aGljaCByZWFkIGFzIGEgYnJpZ2h0IHN0b25lIHF1YXJyeSByYXRoZXIgdGhhbiBhXG4gIC8vIHJpdmVyLiBUaGUgb3V0ZXIgZWRnZSBpcyBub3cgfjI1IG0gZnJvbSB0aGUgY2VudHJlbGluZSwgYW5kIHRoZSBiZWQgaXNcbiAgLy8gb25seSAyIG0gYmVsb3cgc2VhIGxldmVsLlxuICBjb25zdCBjaGFubmVsID0gc21vb3Roc3RlcChyaXZlclcgKyAxOCwgcml2ZXJXICogMC40LCByZCk7XG4gIGlmIChsYW5kbmVzcyA+IDAuMCkgaCA9IGxlcnAoaCwgLTIuMCwgY2hhbm5lbCAqIDAuOTUpO1xuXG4gIC8vIExha2UgYmFzaW4gYXQgdGhlIGZvb3Qgb2YgdGhlIG5vcnRoLXdlc3QgaGlnaGxhbmRzLlxuICBjb25zdCBsYWtlRCA9IGxha2VEaXN0YW5jZSh3eCwgd3opXG4gICAgKiAoMSArIDAuMTggKiAoZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE3LCAyKSAtIDAuNSkgKiAyKTtcbiAgaWYgKGxha2VEIDwgMS4xNSkge1xuICAgIGNvbnN0IGxha2VNYXNrID0gc21vb3Roc3RlcCgxLjE1LCAwLjU1LCBsYWtlRCk7XG4gICAgaCA9IGxlcnAoaCwgLTYuNSwgbGFrZU1hc2sgKiAwLjk1KTtcbiAgfVxuXG4gIC8vIEZvdW5kZXIgc2hlbGY6IGEgc21hbGwsIGlycmVndWxhciBidWlsZGFibGUgdGVycmFjZSBvbiB0aGUgZWFzdCBiYW5rLlxuICAvLyBEZWxpYmVyYXRlbHkgbm90IGEgMjYwIG0gcmFkaWFsIGZsYXR0ZW47IHRoZSBwcmV2aW91cyBwYXNzIHNob3dlZCB0aGF0IGFcbiAgLy8gbGFyZ2UgZmxhdHRlbi10by1jb25zdGFudCBiZWNvbWVzIGEgdmlzaWJsZSBib3dsIG9mIGNvbnRvdXIgcmluZ3MuXG4gIGNvbnN0IHNoZWxmRCA9IE1hdGguc3FydCgoKHggKyA4KSAvIDYyKSAqKiAyICsgKCh6IC0gNCkgLyA0OCkgKiogMilcbiAgICArIChmYm0yKHggLyA0NSwgeiAvIDQ1LCBzZWVkICsgMTE4LCAyKSAtIDAuNSkgKiAwLjU1O1xuICBjb25zdCBzaGVsZiA9IHNtb290aHN0ZXAoMS4wNSwgMC41NSwgc2hlbGZEKTtcbiAgaWYgKHNoZWxmID4gMCkge1xuICAgIGNvbnN0IHRhcmdldCA9IDEzLjAgKyAxLjIgKiBmYm0yKHggLyAzNiwgeiAvIDM2LCBzZWVkICsgMTE5LCAyKSArIHggKiAwLjAxO1xuICAgIGggPSBsZXJwKGgsIHRhcmdldCwgc2hlbGYgKiAwLjc4KTtcbiAgfVxuXG4gIHJldHVybiBNYXRoLnJvdW5kKGNsYW1wKGgsIC0xNCwgOTIpKTtcbn1cblxuZnVuY3Rpb24gc2xvcGVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAxKSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMSkpLFxuICApO1xufVxuXG5mdW5jdGlvbiB0b3BNYXRlcmlhbEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyPzogYm9vbGVhbik6IE1hdElkIHtcbiAgLy8gUml2ZXIgYmVkIGlzIGdyYXZlbDsgdGhlIGJlYWNoIGlzIGEgbmFycm93IHNhbmQgYmFuZCwgbm90IHRoZSB3aG9sZVxuICAvLyB2YWxsZXkgZmxvb3IuIFRoZSBmaXJzdCBwYXNzIG1hcmtlZCBldmVyeSBjZWxsIHdpdGhpbiA0IG0gb2Ygc2VhIGxldmVsXG4gIC8vIGFzIHNhbmQsIHdoaWNoIHByb2R1Y2VkIGEgY29uc3BpY3VvdXMgcGFsZSBzdHJpcCBhbG9uZyB0aGUgcml2ZXIuXG4gIGlmIChyaXZlckRpc3RhbmNlKHgsIHopIDwgMTIgJiYgaCA8IFNFQV9MRVZFTCArIDEpIHJldHVybiBNQVQuR1JBVkVMO1xuICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAwLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKG5lYXJXYXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbmVhcldhdGVyID1cbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4IC0gMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCArIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogLSAzKSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6ICsgMykgPCBTRUFfTEVWRUwgKyAxO1xuICB9XG4gIGlmIChuZWFyV2F0ZXIgJiYgaCA8PSBTRUFfTEVWRUwgKyAxLjUpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHNsb3BlID49IDMpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNTggJiYgZmJtMih4IC8gMTgsIHogLyAxOCwgc2VlZCArIDEyMCwgMikgPiAwLjQ1KSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQ4ICYmIHNsb3BlID49IDIpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDAgJiYgc2xvcGUgPj0gMiAmJiBmYm0yKHggLyAxMiwgeiAvIDEyLCBzZWVkICsgMTIxLCAyKSA+IDAuNTUpIHJldHVybiBNQVQuU1RPTkU7XG4gIHJldHVybiBNQVQuR1JBU1M7XG5cbn1cblxuLyoqIFB1YmxpYyBiYXNlLW1hdGVyaWFsIHNlbGVjdG9yIGZvciBtYWNybyBMT0QgYW5kIHRlc3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2VUb3BNYXRlcmlhbChcbiAgc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI6IGJvb2xlYW4sXG4pOiBNYXRJZCB7XG4gIHJldHVybiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xufVxuXG5mdW5jdGlvbiBzdWJzb2lsRm9yKHRvcDogTWF0SWQpOiBNYXRJZCB7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFTUyB8fCB0b3AgPT09IE1BVC5NT1NTKSByZXR1cm4gTUFULlNPSUw7XG4gIGlmICh0b3AgPT09IE1BVC5TQU5EKSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmICh0b3AgPT09IE1BVC5HUkFWRUwpIHJldHVybiBNQVQuR1JBVkVMO1xuICByZXR1cm4gTUFULlNUT05FO1xufVxuXG5mdW5jdGlvbiBvcmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3QgY2x1c3RlciA9IGZibTIoeCAvIDU1LCB6IC8gNTUsIHNlZWQgKyAxMzAsIDIpO1xuICBpZiAoY2x1c3RlciA8IDAuNTcpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgbiA9IHZhbHVlTm9pc2UzKHggKiAwLjA5LCB5ICogMC4xMywgeiAqIDAuMDksIHNlZWQgKyAxMzEpO1xuICBjb25zdCBuMiA9IHZhbHVlTm9pc2UzKHggKiAwLjIyICsgNSwgeSAqIDAuMzEsIHogKiAwLjIyIC0gMywgc2VlZCArIDEzMik7XG4gIHJldHVybiBuID4gMC43MCAmJiBuMiA+IDAuNTA7XG59XG5cbmZ1bmN0aW9uIGNhdmVBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGZibTMoeCAqIDAuMDc1LCB5ICogMC4xMSwgeiAqIDAuMDc1LCBzZWVkICsgMTQwLCAyKSA+IDAuNzI7XG59XG5cbmZ1bmN0aW9uIG92ZXJoYW5nQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWx1ZU5vaXNlMyh4ICogMC4xOCwgeSAqIDAuMjIsIHogKiAwLjE4LCBzZWVkICsgMTQxKSA+IDAuNjI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VyZmFjZVNhbXBsZSB7XG4gIHk6IG51bWJlcjtcbiAgdG9wOiBNYXRJZDtcbiAgc2xvcGU6IG51bWJlcjtcbn1cblxuLyoqIEJhc2Ugc3VyZmFjZSBzYW1wbGUgZm9yIG1hY3JvIExPRC4gRG9lcyBub3QgaW5jbHVkZSB2b3hlbCBlZGl0cy9vdmVyaGFuZ3MuICovXG5leHBvcnQgZnVuY3Rpb24gc2FtcGxlU3VyZmFjZShzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogU3VyZmFjZVNhbXBsZSB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeik7XG4gIGNvbnN0IHNsb3BlID0gc2xvcGVBdChzZWVkLCB4LCB6LCB5KTtcbiAgcmV0dXJuIHsgeSwgdG9wOiB0b3BNYXRlcmlhbEF0KHNlZWQsIHgsIHosIHksIHNsb3BlKSwgc2xvcGUgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBjaHVuayBnZW5lcmF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gIHJldHVybiBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiBWb3hlbENodW5rIHwgbnVsbCB7XG4gIGlmIChjeCA8IDAgfHwgY3ogPCAwIHx8IGN4ID49IENIVU5LU19QRVJfU0lERSB8fCBjeiA+PSBDSFVOS1NfUEVSX1NJREUpIHJldHVybiBudWxsO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBjb25zdCBleGlzdGluZyA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG5cbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KENIVU5LX1ZPTFVNRSk7XG4gIGNvbnN0IGhlaWdodHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3QgdG9wTWF0ZXJpYWxzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICBjb25zdCBzZWVkID0gd29ybGQuc2VlZDtcblxuICAvLyBQYWRkZWQgaGVpZ2h0IGNhY2hlOiBhIHRocmVlLWNlbGwgYm9yZGVyIGNvdmVycyBzbG9wZSwgYmVhY2ggYW5kIGxlZGdlcy5cbiAgY29uc3QgUCA9IDM7XG4gIGNvbnN0IFBXID0gQ0hVTktfU0laRSArIFAgKiAyO1xuICBjb25zdCBiYXNlSCA9IG5ldyBJbnQxNkFycmF5KFBXICogUFcpO1xuICBmb3IgKGxldCBweiA9IDA7IHB6IDwgUFc7IHB6KyspIHtcbiAgICBmb3IgKGxldCBweCA9IDA7IHB4IDwgUFc7IHB4KyspIHtcbiAgICAgIGJhc2VIW3B6ICogUFcgKyBweF0gPSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgb3ggKyBweCAtIFAsIG96ICsgcHogLSBQKTtcbiAgICB9XG4gIH1cblxuICBsZXQgbm9uQWlyID0gMDtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgY29uc3QgbmVhcldhdGVyID1cbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQIC0gMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCArIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxO1xuICAgICAgY29uc3QgdG9wID0gdG9wTWF0ZXJpYWxBdChzZWVkLCB3eCwgd3osIGgsIHNsb3BlLCBuZWFyV2F0ZXIpO1xuICAgICAgY29uc3Qgc3ViID0gc3Vic29pbEZvcih0b3ApO1xuICAgICAgY29uc3Qgb3JlUG90ZW50aWFsID0gZmJtMih3eCAvIDU1LCB3eiAvIDU1LCBzZWVkICsgMTMwLCAyKSA+IDAuNTc7XG4gICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcblxuICAgICAgY29uc3Qgc3RhcnQgPSBZX01JTjtcbiAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgaCAtIDEpO1xuICAgICAgZm9yIChsZXQgeSA9IHN0YXJ0OyB5IDw9IGVuZDsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGRlcHRoID0gaCAtIDEgLSB5O1xuICAgICAgICBsZXQgbTogTWF0SWQ7XG4gICAgICAgIGlmICh5ID09PSBZX01JTikgbSA9IE1BVC5CRURST0NLO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA9PT0gMCkgbSA9IHRvcDtcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPD0gMikgbSA9IHN1YjtcbiAgICAgICAgZWxzZSBtID0gTUFULlNUT05FO1xuXG4gICAgICAgIGlmIChtID09PSBNQVQuU1RPTkUgJiYgZGVwdGggPiA0ICYmIG9yZVBvdGVudGlhbCAmJiBvcmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5PUkU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTcGFyc2UgM0Qgb3ZlcmhhbmdzL3VuZGVyY3V0cyBhdCBzdGVlcCBmYWNlcy4gVGhpcyBpcyBhIHJlYWxcbiAgICAgICAgLy8gb2NjdXBhbmN5IGNoYW5nZSwgbm90IGEgZGVjb3JhdGlvbiBvbiB0b3Agb2YgYSBoZWlnaHRmaWVsZC5cbiAgICAgICAgaWYgKGRlcHRoIDw9IDIgJiYgc2xvcGUgPj0gMiAmJiBvdmVyaGFuZ0F0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuICAgICAgICAvLyBEZWVwIGNhdmVzLCBrZXB0IGF3YXkgZnJvbSB0aGUgc3VyZmFjZSBzbyB0aGV5IGRvIG5vdCBjcmVhdGUgaG9sZXMuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSICYmIGRlcHRoID4gNyAmJiBkZXB0aCA8IDI0ICYmIGNhdmVBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0gPSBtO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFdhdGVyIHZvbHVtZTogZXZlcnl0aGluZyBhYm92ZSB0aGUgc29saWQgc3VyZmFjZSB1cCB0byBzZWEgbGV2ZWwuXG4gICAgICBpZiAoaCA8IFNFQV9MRVZFTCkge1xuICAgICAgICBmb3IgKGxldCB5ID0gTWF0aC5tYXgoWV9NSU4sIGgpOyB5IDwgU0VBX0xFVkVMOyB5KyspIHtcbiAgICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopO1xuICAgICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5XQVRFUjtcbiAgICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB0b3BTb2xpZCA9IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5tYXgoWV9NSU4sIGggLSAxKSk7XG4gICAgICBoZWlnaHRzW2NvbF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tjb2xdID0gdG9wO1xuICAgIH1cbiAgfVxuXG4gIC8vIFByb3RydWRpbmcgbGVkZ2VzOiBvbmUgb3IgdHdvIHN0b25lIGJsb2NrcyBleHRlbmQgZnJvbSBhIGhpZ2ggY29sdW1uIG92ZXJcbiAgLy8gYSBsb3dlciBuZWlnaGJvdXIuIFRoZXkgY3JlYXRlIHJlYWRhYmxlIG92ZXJoYW5ncyB3aXRob3V0IGEgZnVsbCBjYXZlIHBhc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBpZiAoc2xvcGUgPCAyKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRpcnM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW1stMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWzAsIDFdXTtcbiAgICAgIGZvciAoY29uc3QgW2R4LCBkel0gb2YgZGlycykge1xuICAgICAgICBjb25zdCBueCA9IGx4ICsgZHgsIG56ID0gbHogKyBkejtcbiAgICAgICAgaWYgKG54IDwgMCB8fCBueiA8IDAgfHwgbnggPj0gQ0hVTktfU0laRSB8fCBueiA+PSBDSFVOS19TSVpFKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbmggPSBiYXNlSFsobnogKyBQKSAqIFBXICsgKG54ICsgUCldO1xuICAgICAgICBpZiAoaCAtIG5oIDwgMikgY29udGludWU7XG4gICAgICAgIGlmIChoYXNoM2kobHgsIGx6LCBkeCAqIDMgKyBkeiAqIDcsIHNlZWQgKyAxNTApIDwgMC41NSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHkgPSBoIC0gMjtcbiAgICAgICAgaWYgKHkgPCBZX01JTiB8fCB5ID49IGgpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBpZHggPSBsb2NhbEluZGV4KG54LCB5VG9JbmRleCh5KSwgbnopO1xuICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtpZHhdID0gTUFULlNUT05FO1xuICAgICAgICAgIG5vbkFpcisrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmVjb21wdXRlIHRoZSBjb2x1bW4gY2FjaGUgYWZ0ZXIgbGVkZ2VzL2NhdmVzLiBUaGUgZXhwb3NlZCB0b3AgbWF0ZXJpYWxcbiAgLy8gbXVzdCBjb21lIGZyb20gdGhlIGFjdHVhbCB0b3Agc29saWQgdm94ZWwsIG5vdCB0aGUgcHJlLWNhcnZlIGd1ZXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgIGxldCB0b3BNYXQ6IG51bWJlciA9IHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgY29uc3QgbSA9IGRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICAgIGhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG9wTWF0O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNodW5rOiBWb3hlbENodW5rID0ge1xuICAgIGN4LCBjeiwga2V5LCBkYXRhLCBoZWlnaHRzLCB0b3BNYXRlcmlhbHMsIG5vbkFpcixcbiAgICBkaXJ0eTogdHJ1ZSxcbiAgICBnZW5lcmF0ZWRBdDogcGVyZm9ybWFuY2Uubm93KCksXG4gIH07XG5cbiAgLy8gQXBwbHkgZHVyYWJsZSBlZGl0cyBhZnRlciBiYXNlIGdlbmVyYXRpb24uXG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIGlmIChlZGl0cykge1xuICAgIGZvciAoY29uc3QgW2lkeCwgbV0gb2YgZWRpdHMpIHtcbiAgICAgIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gICAgfVxuICAgIC8vIFJlY29tcHV0ZSB0aGUgY2FjaGUgZm9yIGVkaXRlZCBjaHVua3MuXG4gICAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgbHgsIGx6KTtcbiAgICB9XG4gIH1cbiAgLy8gTm9uLWFpciBjb3VudHMgYXJlIGRlcml2ZWQgcmVuZGVyZXIgc3RhdGlzdGljcywgbm90IGR1cmFibGUgd29ybGQgc3RhdGUuXG4gIC8vIEVkaXRlZCBiYXNlIGFpciBtYXkgYmVjb21lIHNvbGlkIChhbmQgdmljZSB2ZXJzYSkgZHVyaW5nIHJlc3RvcmF0aW9uLlxuICBsZXQgZWRpdGVkTm9uQWlyID0gMDtcbiAgZm9yIChjb25zdCBtYXRlcmlhbCBvZiBjaHVuay5kYXRhKSBpZiAobWF0ZXJpYWwgIT09IE1BVC5BSVIpIGVkaXRlZE5vbkFpcisrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gZWRpdGVkTm9uQWlyIC0gbm9uQWlyO1xuXG4gIHdvcmxkLmNodW5rcy5zZXQoa2V5LCBjaHVuayk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCsrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gbm9uQWlyO1xuICB3b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgKz0gcGVyZm9ybWFuY2Uubm93KCkgLSB0MDtcbiAgd29ybGQuZGlydHkuYWRkKGtleSk7XG5cbiAgZ2VuZXJhdGVFbnRpdGllcyh3b3JsZCwgY2h1bmspO1xuICByZXR1cm4gY2h1bms7XG59XG5cbi8qKiBBIGJhc2UtdGVycmFpbiBjYWNoZSBzaGFyZWQgYnkgZWRpdGVkIGFuZCB1bmVkaXRlZCByZWdlbmVyYXRpb24uIE5hdHVyYWxcbiAqIHNjZW5lcnkgbmV2ZXIgZGVwZW5kcyBvbiBsYXRlciB2b3hlbCBlZGl0czsgdGhpcyBhbHNvIGxldHMgYSBzbmFwc2hvdCByZXN0b3JlXG4gKiBhIGhhcnZlc3RlZCBjaHVuayB3aXRob3V0IG1hdGVyaWFsaXppbmcgdW5yZWxhdGVkIG5laWdoYm91cmluZyBjaHVua3MuICovXG5jb25zdCBiYXNlQ29sdW1uQ2FjaGUgPSBuZXcgV2Vha01hcDxXb3JsZCwgTWFwPHN0cmluZywgeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXkgfT4+KCk7XG5cbmZ1bmN0aW9uIGJhc2VDb2x1bW5zKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheSB9IHtcbiAgbGV0IGNhY2hlID0gYmFzZUNvbHVtbkNhY2hlLmdldCh3b3JsZCk7XG4gIGlmICghY2FjaGUpIHsgY2FjaGUgPSBuZXcgTWFwKCk7IGJhc2VDb2x1bW5DYWNoZS5zZXQod29ybGQsIGNhY2hlKTsgfVxuICBjb25zdCBjYWNoZWQgPSBjYWNoZS5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIGNhY2hlZDtcbiAgY29uc3QgY29sdW1ucyA9IHsgaGVpZ2h0czogbmV3IFVpbnQ4QXJyYXkoY2h1bmsuaGVpZ2h0cyksIHRvcE1hdGVyaWFsczogbmV3IFVpbnQ4QXJyYXkoY2h1bmsudG9wTWF0ZXJpYWxzKSB9O1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSArIGx4LCB6ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KSArIGx6O1xuICAgICAgY29uc3QgaCA9IHN1cmZhY2VIZWlnaHRBdCh3b3JsZC5zZWVkLCB4LCB6KTtcbiAgICAgIGNvbnN0IHNsb3BlID0gc2xvcGVBdCh3b3JsZC5zZWVkLCB4LCB6LCBoKTtcbiAgICAgIGNvbnN0IGluZGV4ID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICBjb2x1bW5zLmhlaWdodHNbaW5kZXhdID0gY2xhbXAoaCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2luZGV4XSA9IHRvcE1hdGVyaWFsQXQod29ybGQuc2VlZCwgeCwgeiwgaCwgc2xvcGUpO1xuICAgIH1cbiAgfVxuICBjYWNoZS5zZXQoY2h1bmsua2V5LCBjb2x1bW5zKTtcbiAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmljdENodW5rKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCF3b3JsZC5jaHVua3MuaGFzKGtleSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuY2h1bmtzLmRlbGV0ZShrZXkpO1xuICB3b3JsZC5zdGF0cy5jaHVua3NFdmljdGVkKys7XG4gIC8vIENodW5rIGJ5dGVzIGFuZCBjb2x1bW4gY2FjaGVzIGFyZSByZWdlbmVyYXRlZCBvbiBkZW1hbmQuIEVudGl0aWVzIHJlbWFpblxuICAvLyBhdXRob3JpdGF0aXZlOiBldmljdGlvbiBtdXN0IG5vdCBmb3JnZXQgdGhlaXIgcGVyc2lzdGVudCBzdGF0ZS5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcXVlcmllcyAvIGVkaXRzIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBnZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh5IDwgWV9NSU4pIHJldHVybiBNQVQuQkVEUk9DSztcbiAgaWYgKHkgPj0gWV9NQVgpIHJldHVybiBNQVQuQUlSO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsuZGF0YVtsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRWb3hlbCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIG06IE1hdElkKTogYm9vbGVhbiB7XG4gIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBZX01BWCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBpZHggPSBsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgY29uc3QgcHJldmlvdXNFZGl0ID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rS2V5KGN4LCBjeikpPy5nZXQoaWR4KTtcbiAgLy8gQSBjaHVuayBldmljdGVkIGFmdGVyIGFuIGVhcmxpZXIgZWRpdCBjYW4gcmVnZW5lcmF0ZSB3aXRoIHRoYXQgZHVyYWJsZVxuICAvLyBtYXRlcmlhbCBhbHJlYWR5IGFwcGxpZWQuIERyb3BwaW5nIHRoZSBlZGl0IGhlcmUgd291bGQgbWFrZSBpdCBkaXNhcHBlYXJcbiAgLy8gb24gdGhlIG5leHQgZXZpY3Rpb24vcmVzdG9yYXRpb24sIGV2ZW4gdGhvdWdoIHRoZSBjdXJyZW50IHdyaXRlIG5vLW9wcy5cbiAgaWYgKHByZXZpb3VzRWRpdCA9PT0gbSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gZmFsc2U7XG4gIGxldCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChjaHVuay5rZXkpO1xuICBpZiAoIWVkaXRzKSB7IGVkaXRzID0gbmV3IE1hcCgpOyB3b3JsZC5lZGl0cy5zZXQoY2h1bmsua2V5LCBlZGl0cyk7IH1cbiAgLy8gQW4gaWRlbXBvdGVudCB3cml0ZSBtdXN0IHN0aWxsIHJlc3RvcmUgYSBkdXJhYmxlIGRlbHRhIGRpc2NhcmRlZCBieSBhblxuICAvLyBvbGRlciBzbmFwc2hvdCBvciBkZWx0YSBkZWNvZGVyLiBJdCBpcyBub3QgYSBuZXcgYXV0aG9yaXRhdGl2ZSByZXZpc2lvbi5cbiAgaWYgKGNodW5rLmRhdGFbaWR4XSA9PT0gbSkge1xuICAgIGlmICghZWRpdHMuaGFzKGlkeCkpIGVkaXRzLnNldChpZHgsIG0pO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgY2h1bmsuZGlydHkgPSB0cnVlO1xuICB3b3JsZC5kaXJ0eS5hZGQoY2h1bmsua2V5KTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIHdvcmxkVG9Mb2NhbFgoeCksIHdvcmxkVG9Mb2NhbFooeikpO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bms6IFZveGVsQ2h1bmssIGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgIGlmIChpc1NvbGlkKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV0pKSB7IHRvcFNvbGlkID0geTsgYnJlYWs7IH1cbiAgfVxuICBjaHVuay5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICBjb25zdCB0bSA9IGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gIGlmICh0b3BTb2xpZCA+PSBZX01JTikge1xuICAgIGNvbnN0IG0gPSBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHRvcFNvbGlkKSwgbHopXTtcbiAgICBpZiAobSAhPT0gTUFULldBVEVSKSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gbTtcbiAgfSBlbHNlIHtcbiAgICBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG07XG4gIH1cbn1cblxuLyoqXG4gKiBUaGUgeSBjb29yZGluYXRlIG9mIHRoZSBleHBvc2VkIHRvcCBmYWNlIG9mIHRoZSBzb2xpZCBjb2x1bW4gYXQgeC96LlxuICogQSBzb2xpZCB2b3hlbCBhdCB5IG9jY3VwaWVzIFt5LCB5KzEpLCBzbyB0aGUgd2Fsa2FibGUgc3VyZmFjZSBpcyB0b3BTb2xpZCsxLlxuICogVGhpcyBpcyBhIGRlcml2ZWQgcXVlcnk7IHRoZSBhdXRob3JpdGF0aXZlIHN0YXRlIHJlbWFpbnMgdGhlIHZveGVsIHZvbHVtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIFlfTUlOO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIFlfTUlOO1xuICByZXR1cm4gY2h1bmsuaGVpZ2h0c1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldICsgWV9NSU4gKyAxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdFdvcmxkKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBNYXRJZCB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay50b3BNYXRlcmlhbHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhlaWdodEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgaCA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIHJldHVybiBoIDwgU0VBX0xFVkVMID8gU0VBX0xFVkVMIC0gaCA6IDA7XG59XG5cbi8vIC0tLS0tLS0tLS0gZW50aXRpZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gYWRkRW50aXR5KHdvcmxkOiBXb3JsZCwgZTogRW50aXR5KTogdm9pZCB7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5oYXMoZS5pZCkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSlcbiAgICB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIHJldHVybjtcbiAgd29ybGQuZW50aXRpZXMuc2V0KGUuaWQsIGUpO1xuICBsZXQgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmICghbGlzdCkgeyBsaXN0ID0gW107IHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgbGlzdCk7IH1cbiAgbGlzdC5wdXNoKGUuaWQpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIC8vIEdlbmVyYXRpb24gaXMgZGV0ZXJtaW5pc3RpYyBhbmQgYWR2YW5jZXMgbm8gcGxheWVyLWNvbW1hbmQgcHJlY29uZGl0aW9uLlxuICAvLyBBdXRob3JlZCBzY2FmZm9sZGluZyBtYXkgdHJhbnNpZW50bHkgY2hhbmdlIGl0OyB0aGUgc25hcHNob3QgcmVzdG9yZXMgdGhlXG4gIC8vIHNhdmVkIHJldmlzaW9uIGFmdGVyIHBsYWNpbmcgdGhhdCBzY2FmZm9sZGluZy5cbn1cblxuLyoqXG4gKiBSZW1vdmUgYW4gZW50aXR5IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd29ybGQuIFVzZWQgd2hlbiBhIHNpdGUgaXMgY2xlYXJlZDpcbiAqIHRoZSByZXNvdXJjZSB5aWVsZCBpcyBhY2NvdW50ZWQgZm9yIGJ5IHRoZSBjYWxsZXIsIGFuZCB0aGUgZW50aXR5IG11c3Qgc3RvcFxuICogZXhpc3RpbmcgZm9yIGNvbGxpc2lvbiwgb2JzdHJ1Y3Rpb24gYW5kIHBlcnNpc3RlbmNlLCBub3QganVzdCBiZSBoaWRkZW4gYnlcbiAqIHRoZSByZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICBjb25zdCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKGxpc3QpIHtcbiAgICBjb25zdCBpID0gbGlzdC5pbmRleE9mKGlkKTtcbiAgICBpZiAoaSA+PSAwKSBsaXN0LnNwbGljZShpLCAxKTtcbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChpZCk7XG4gIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUlkKGNodW5rOiBzdHJpbmcsIGk6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBgZToke2NodW5rfToke2l9YDtcbn1cblxuZnVuY3Rpb24gZm9yZXN0U2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgZWFzdCA9IE1hdGguZXhwKC0oKCh3eCAtIDIyMCkgLyAyNjApICoqIDIgKyAoKHd6ICsgMTEwKSAvIDIyMCkgKiogMikpO1xuICBjb25zdCBub3J0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDIwKSAvIDMwMCkgKiogMiArICgod3ogKyAzMDApIC8gMTkwKSAqKiAyKSk7XG4gIGNvbnN0IHdlc3QgPSBNYXRoLmV4cCgtKCgod3ggKyAzNDApIC8gMjAwKSAqKiAyICsgKCh3eiAtIDEyMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3Qgc291dGggPSBNYXRoLmV4cCgtKCgod3ggLSAxMjApIC8gMjQwKSAqKiAyICsgKCh3eiAtIDMzMCkgLyAxODApICoqIDIpKTtcbiAgY29uc3QgbW9pc3R1cmUgPSBmYm0yKHd4IC8gMjYwLCB3eiAvIDI2MCwgc2VlZCArIDIwMSwgNCk7XG4gIGNvbnN0IHZhbGxleSA9IE1hdGguZXhwKC0oKHd4IC8gMTQwKSAqKiAyICsgKHd6IC8gMTA1KSAqKiAyKSk7XG4gIHJldHVybiBNYXRoLm1heChlYXN0LCBub3J0aCAqIDAuOTIsIHdlc3QgKiAwLjgwLCBzb3V0aCAqIDAuNzgpICogMC44MlxuICAgICsgbW9pc3R1cmUgKiAwLjM4IC0gMC4yMiAtIHZhbGxleSAqIDAuMzQ7XG59XG5cbmZ1bmN0aW9uIHJvY2tTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBtb3VudGFpbiA9IGZibTIod3ggLyAzMzAsIHd6IC8gMzMwLCBzZWVkICsgMjAyLCAzKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAxNDAsIHd6IC8gMTQwLCBzZWVkICsgMjAzLCAzKSAtIDEpO1xuICByZXR1cm4gbW91bnRhaW4gKiAwLjU1ICsgcmlkZ2UgKiAwLjQ1O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkOiBXb3JsZCwgY2h1bms6IFZveGVsQ2h1bmspOiB2b2lkIHtcbiAgZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZCwgY2h1bmsuY3gsIGNodW5rLmN6KTtcbn1cblxuLyoqIEBpbnRlcm5hbCBSZXBsYXlzIGRldGVybWluaXN0aWMgZ2VuZXJhdGlvbiBmb3Igc25hcHNob3QgZW50aXR5IGRlbHRhcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICBpZiAod29ybGQuZW50aXR5Q2h1bmtzLmhhcyhrZXkpKSByZXR1cm47XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybjtcblxuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChoYXNoMmkoY2h1bmsuY3gsIGNodW5rLmN6LCB3b3JsZC5zZWVkICsgOTAwKSAqIDQyOTQ5NjcyOTYpID4+PiAwKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gIGNvbnN0IGNvbHVtbnMgPSBiYXNlQ29sdW1ucyh3b3JsZCwgY2h1bmspO1xuICBsZXQgbiA9IDA7XG4gIGxldCBuYXR1cmFsVHJlZXMgPSAwO1xuICBsZXQgbmF0dXJhbFBpbmtUcmVlcyA9IDA7XG5cbiAgY29uc3QgbG9jYWxTdXJmYWNlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdICsgWV9NSU47XG4gIH07XG4gIGNvbnN0IGxvY2FsVG9wID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBNYXRJZCA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSBhcyBNYXRJZDtcbiAgfTtcbiAgY29uc3QgbG9jYWxTbG9wZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgcmV0dXJuIE1hdGgubWF4KFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggKyAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiAtIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogKyAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICApO1xuICB9O1xuXG4gIC8vIEEgaml0dGVyZWQgOCBtIGxhdHRpY2UgZ2l2ZXMgY29oZXJlbnQgbWFzc2VzIGFuZCBhdm9pZHMgcGVyLWZyYW1lIHNjYXR0ZXIuXG4gIGZvciAobGV0IGd6ID0gMDsgZ3ogPCBDSFVOS19TSVpFOyBneiArPSA4KSB7XG4gICAgZm9yIChsZXQgZ3ggPSAwOyBneCA8IENIVU5LX1NJWkU7IGd4ICs9IDgpIHtcbiAgICAgIGNvbnN0IGx4ID0gY2xhbXAoTWF0aC5mbG9vcihneCArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IGx6ID0gY2xhbXAoTWF0aC5mbG9vcihneiArIDIgKyAocm5kKCkgLSAwLjUpICogNSksIDEsIENIVU5LX1NJWkUgLSAyKTtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgICAgaWYgKGggPD0gU0VBX0xFVkVMICsgMSkgY29udGludWU7XG4gICAgICBjb25zdCBzbG9wZSA9IGxvY2FsU2xvcGUobHgsIGx6KTtcbiAgICAgIGNvbnN0IHRvcCA9IGxvY2FsVG9wKGx4LCBseik7XG4gICAgICBpZiAodG9wID09PSBNQVQuV0FURVIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZm9yZXN0ID0gZm9yZXN0U2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvY2t5ID0gcm9ja1Njb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2xsID0gcm5kKCk7XG5cbiAgICAgIGNvbnN0IHRyZWVDaGFuY2UgPSBmb3Jlc3QgPiAwLjUwID8gMC43MiA6IGZvcmVzdCA+IDAuMzAgPyAwLjI1IDogMC4wNTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAyICYmIHJvbGwgPCB0cmVlQ2hhbmNlKSB7XG4gICAgICAgIC8vIFRoZSBjYXAgaXMgYSBkZXRlcm1pbmlzdGljIG5hdHVyYWwtZ2VuZXJhdGlvbiBwcm9wZXJ0eS4gSXQgY2Fubm90XG4gICAgICAgIC8vIGRlcGVuZCBvbiB3aGljaCBjaHVua3MgYSByZW5kZXJlciBsb2FkZWQgYmVmb3JlIHRoaXMgb25lLlxuICAgICAgICBsZXQga2luZDogRW50aXR5S2luZDtcbiAgICAgICAgbGV0IHZhcmlhbnQ6IG51bWJlcjtcbiAgICAgICAgY29uc3Qgc3BlY2llc1JvbGwgPSBybmQoKTtcbiAgICAgICAgaWYgKHNwZWNpZXNSb2xsIDwgMC4xMikge1xuICAgICAgICAgIGlmICgobmF0dXJhbFBpbmtUcmVlcyArIDEpID4gMC4yNSAqIChuYXR1cmFsVHJlZXMgKyAxKSkge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua092ZXJmbG93Kys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2Jsb3Nzb20nO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAyKTtcbiAgICAgICAgICAgIG5hdHVyYWxQaW5rVHJlZXMrKztcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNDApIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9zcGlyZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNzQpIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV90YWJsZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICB9XG4gICAgICAgIG5hdHVyYWxUcmVlcysrO1xuICAgICAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44OCArIHJuZCgpICogMC4yNCwgdmFyaWFudCxcbiAgICAgICAgICByZXNvdXJjZTogJ3dvb2QnLCByZW1haW5pbmc6IDEyLCB5aWVsZFBlckhhcnZlc3Q6IDQsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHJvY2t5ID4gMC40NiAmJiByb2xsIDwgMC4zOCkge1xuICAgICAgICAvLyBDb25zdW1lIHRoZSByZXRpcmVkIHN0b25lIGZvcm0ncyByYW5kb20gZHJhd3MgYW5kIGFsbG9jYXRlIGl0cyBvbGRcbiAgICAgICAgLy8gc2VxdWVuY2UgSUQsIGJ1dCBkbyBub3QgaW5zZXJ0IGFuIGVudGl0eS4gTGF0ZXIgbmF0dXJhbCBwbGFjZW1lbnRzXG4gICAgICAgIC8vIHRoZXJlZm9yZSByZW1haW4gYnl0ZS1mb3ItYnl0ZSBjb21wYXRpYmxlIHdpdGggcmVjb3JkZWQgc2F2ZXMuXG4gICAgICAgIGNvbnN0IHNpemVSb2xsID0gcm5kKCk7XG4gICAgICAgIGNvbnN0IGtpbmQ6IEVudGl0eUtpbmQgPSBzaXplUm9sbCA8IDAuNTUgPyAnc3R5bF9yb2NrX3NtYWxsJ1xuICAgICAgICAgIDogc2l6ZVJvbGwgPCAwLjkwID8gJ3N0eWxfcm9ja19tZWRpdW0nIDogJ3N0eWxfcm9ja19sYXJnZSc7XG4gICAgICAgIGNvbnN0IGlkID0gZW50aXR5SWQoY2h1bmsua2V5LCBuKyspO1xuICAgICAgICBjb25zdCByZWNvcmQgPSB7XG4gICAgICAgICAgaWQsIGtpbmQsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByZXNvdXJjZTogJ3N0b25lJyBhcyBjb25zdCxcbiAgICAgICAgICByZW1haW5pbmc6IGtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gNCA6IGtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDggOiAxMixcbiAgICAgICAgICB5aWVsZFBlckhhcnZlc3Q6IDMsIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgIH07XG4gICAgICAgIC8vIE9ubHkgZW50aXRpZXMgdGhhdCBleGlzdGVkIGluIGFuIGFjY2VwdGVkIG9sZCBzYXZlIGdldCB0b21ic3RvbmVzLFxuICAgICAgICAvLyBkdXJpbmcgZXhwbGljaXQgbWlncmF0aW9uLiBPcmRpbmFyeSBnZW5lcmF0aW9uIG11c3QgcmVzdG9yZSBleGFjdGx5LlxuICAgICAgICBpZiAoaXNTdG9uZVJlcGxheSh3b3JsZCkpIGFkZEVudGl0eSh3b3JsZCwgcmVjb3JkKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuU1RPTkUgJiYgcm9ja3kgPiAwLjU4ICYmIHJvbGwgPCAwLjE4KSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfb3JlJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDIpLFxuICAgICAgICAgIHJlc291cmNlOiAnb3JlJywgcmVtYWluaW5nOiA4LCB5aWVsZFBlckhhcnZlc3Q6IDIsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDEgJiYgcm9sbCA8IDAuMzApIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9zaHJ1YicsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC44ICsgcm5kKCkgKiAwLjQsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgICByZXNvdXJjZTogJ2ZpYmVyJywgcmVtYWluaW5nOiA0LCB5aWVsZFBlckhhcnZlc3Q6IDEsXG4gICAgICAgICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkOiBXb3JsZCwga2luZDogRW50aXR5S2luZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHZhcmlhbnQ6IG51bWJlciwgcm90OiBudW1iZXIsIHNjYWxlOiBudW1iZXIsIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsLCByZW1haW5pbmc6IG51bWJlciwgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmICh5IDw9IFNFQV9MRVZFTCkgcmV0dXJuO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgLy8gQSBoZXJvIGFzc2V0IG93bnMgaXRzIHNwb3Q6IGNsZWFyIGFueSBnZW5lcmF0ZWQgZW50aXR5IHRoYXQgd291bGQgb3ZlcmxhcFxuICAvLyBpdCwgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBpbmcgdGhlIGF1dGhvcmVkIGNvbXBvc2l0aW9uLlxuICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkgPz8gW107XG4gIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoa2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSByZXR1cm47XG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKGUgJiYgTWF0aC5oeXBvdChlLnggLSB4LCBlLnogLSB6KSA8IDIuNikge1xuICAgICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMudHJlZXMgLSAxKTtcbiAgICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICAgIH1cbiAgfVxuICB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpKTtcbiAgLy8gQXV0aG9yZWQgY29tcG9zaXRpb24gaXMgZHVyYWJsZSBzdGF0ZTogaXQgY2FuIGNsZWFyIG92ZXJsYXBwaW5nIG5hdHVyYWxcbiAgLy8gZW50aXRpZXMsIHNvIHNhdmUgdGhlIGNvbXBsZXRlIGFmZmVjdGVkIGNodW5rIHJhdGhlciB0aGFuIG9ubHkgaXRzIGhlcm9lcy5cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcblxuICBjb25zdCBpZCA9IGBoZXJvOiR7a2luZH06JHtNYXRoLnJvdW5kKHgpfToke01hdGgucm91bmQoeil9YDtcbiAgY29uc3QgYmVmb3JlID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgY29uc3QgZW50aXR5OiBFbnRpdHkgPSB7XG4gICAgaWQsIGtpbmQsIGNodW5rOiBrZXksIHg6IHggKyAwLjUsIHksIHo6IHogKyAwLjUsXG4gICAgcm90LCBzY2FsZSwgdmFyaWFudCwgcmVzb3VyY2UsIHJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0LFxuICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogdHJ1ZSxcbiAgfTtcbiAgYWRkRW50aXR5KHdvcmxkLCBlbnRpdHkpO1xuICBpZiAod29ybGQuZW50aXRpZXMuc2l6ZSA+IGJlZm9yZSAmJiBraW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB7XG4gICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICBpZiAoa2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmF1dGhvcmVkUGxhY2VkKSByZXR1cm47XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gdHJ1ZTtcblxuICBjb25zdCBzaXRlczogQXJyYXk8eyBraW5kOiAnd2F5c3RvbmUnIHwgJ21hcmtlcic7IHg6IG51bWJlcjsgejogbnVtYmVyOyByb3Q6IG51bWJlciB9PiA9IFtcbiAgICB7IGtpbmQ6ICd3YXlzdG9uZScsIHg6IC0xMCwgejogLTE0LCByb3Q6IDAgfSxcbiAgICB7IGtpbmQ6ICdtYXJrZXInLCB4OiAtMzIsIHo6IC04LCByb3Q6IE1hdGguUEkgLyAyIH0sXG4gIF07XG4gIGZvciAoY29uc3QgcyBvZiBzaXRlcykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoeSA8PSBTRUFfTEVWRUwpIGNvbnRpbnVlO1xuICAgIHdvcmxkLnNpdGVzLnB1c2goe1xuICAgICAgaWQ6IGBzaXRlOiR7cy5raW5kfWAsXG4gICAgICBraW5kOiBzLmtpbmQsXG4gICAgICB4OiBzLnggKyAwLjUsIHksIHo6IHMueiArIDAuNSxcbiAgICAgIHJvdDogcy5yb3QsXG4gICAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEEgaGVybyBncm92ZSBjb21wb3NlZCBpbiB0aGUgZGVmYXVsdCBjYW1lcmEncyB2aWV3IGRpcmVjdGlvbi4gVGhlc2UgYXJlXG4gIC8vIFN0eWwgbmF0dXJhbCBhc3NldHMgKEFTLTAwMSB2MiksIG5vdCBOb3hlbCBhcmNoaXRlY3R1cmU7IHRoZSBOb3hlbFxuICAvLyB3YXlzdG9uZS9tYXJrZXIgYWJvdmUgcmVtYWluIHRoZSBodW1hbi1tYWRlIGxhbmRtYXJrcy5cbiAgY29uc3QgZ3JvdmU6IEFycmF5PFtFbnRpdHlLaW5kLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0+ID0gW1xuICAgIFsnc3R5bF90cmVlX3NwaXJlJywgLTIyLCAtMjYsIDAsIDEuMDAsIDBdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTM0LCAtMTgsIDEsIDAuOTUsIE1hdGguUEkgLyAxMl0sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xNiwgLTM0LCAyLCAxLjAwLCBNYXRoLlBJIC8gNl0sXG4gICAgWydzdHlsX3RyZWVfYmxvc3NvbScsIC0yOCwgLTM4LCAwLCAwLjkwLCBNYXRoLlBJIC8gNF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtNDAsIC0zMCwgMiwgMS4wNSwgTWF0aC5QSSAvIDNdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTIsIC0yNCwgMCwgMC45MCwgTWF0aC5QSSAvIDIuNF0sXG4gIF07XG4gIGZvciAoY29uc3QgW2tpbmQsIHgsIHosIHZhcmlhbnQsIHNjYWxlLCByb3RdIG9mIGdyb3ZlKSB7XG4gICAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsIGtpbmQsIHgsIHosIHZhcmlhbnQsIHJvdCwgc2NhbGUsICd3b29kJywgMTIsIDQpO1xuICB9XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9yb2NrX21lZGl1bScsIC02LCAtMTAsIDAsIDAsIDEuMCwgJ3N0b25lJywgOCwgMyk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9zaHJ1YicsIC0xNCwgLTgsIDEsIE1hdGguUEkgLyAxMiwgMS4xLCAnZmliZXInLCA0LCAxKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX2NhaXJuJywgLTIwLCAtNiwgMCwgMCwgMS4wLCAnc3RvbmUnLCA2LCAyKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX29yZScsIC0zOCwgLTQyLCAwLCBNYXRoLlBJIC8gNCwgMS4xLCAnb3JlJywgOCwgMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBuZWFyZXN0SGFydmVzdGFibGUoXG4gIHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCByZXNvdXJjZT86IFJlc291cmNlVHlwZSxcbik6IEVudGl0eSB8IG51bGwge1xuICBsZXQgYmVzdDogRW50aXR5IHwgbnVsbCA9IG51bGw7XG4gIGxldCBiZXN0RCA9IHJhZGl1cyAqIHJhZGl1cztcbiAgZm9yIChjb25zdCBlIG9mIHdvcmxkLmVudGl0aWVzLnZhbHVlcygpKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKVxuICAgICAgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgY29udGludWU7XG4gICAgaWYgKHJlc291cmNlICYmIGUucmVzb3VyY2UgIT09IHJlc291cmNlKSBjb250aW51ZTtcbiAgICBjb25zdCBkID0gKGUueCAtIHgpICoqIDIgKyAoZS56IC0geikgKiogMjtcbiAgICBpZiAoZCA8IGJlc3REKSB7IGJlc3REID0gZDsgYmVzdCA9IGU7IH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0UmVzdWx0IHsgZW50aXR5OiBFbnRpdHk7IHJlc291cmNlOiBSZXNvdXJjZVR5cGU7IGFtb3VudDogbnVtYmVyOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXJ2ZXN0RW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEhhcnZlc3RSZXN1bHQgfCBudWxsIHtcbiAgY29uc3QgZSA9IGxpdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsO1xuICBjb25zdCBhbW91bnQgPSBNYXRoLm1pbihlLnlpZWxkUGVySGFydmVzdCwgZS5yZW1haW5pbmcpO1xuICBpZiAod29ybGQubGlmZSAmJiBPYmplY3QudmFsdWVzKHdvcmxkLmludmVudG9yeSkucmVkdWNlKChzdW0sIG4pID0+IHN1bSArIG4sIDApICsgYW1vdW50ID4gMTIwKSByZXR1cm4gbnVsbDtcbiAgZS5yZW1haW5pbmcgLT0gYW1vdW50O1xuICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICBlLmhhcnZlc3RlZE9uY2UgPSB0cnVlO1xuICBpZiAoZS5yZW1haW5pbmcgPD0gMCkgZS5oYXJ2ZXN0ZWQgPSB0cnVlO1xuICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBlbnRpdHk6IGUsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQgfTtcbn1cblxuLyoqIFJlbW92ZSBldmVyeSByZXRpcmVkIHNvdXJjZSBhZnRlciB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheS4gVGhpcyBtaWdyYXRpb25cbiAqIGNyZWF0ZXMgZGV0ZXJtaW5pc3RpYyB0b21ic3RvbmVzIGJ1dCBpcyBub3QgYSBwbGF5ZXIgY29tbWFuZCBvciByZXZpc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXRpcmVTdG9uZUVudGl0aWVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBmb3IgKGNvbnN0IGUgb2YgWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXSkge1xuICAgIGlmICghaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkpIGNvbnRpbnVlO1xuICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShlLmlkKTtcbiAgICBpZiAoIWUuYXV0aG9yZWQpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChlLmlkKTtcbiAgICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgICBpZiAoIXdvcmxkLmVudGl0eUNodW5rcy5oYXMoZS5jaHVuaykpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoZS5jaHVuaywgW10pO1xuICB9XG4gIGZvciAoY29uc3QgW2tleSwgaWRzXSBvZiB3b3JsZC5lbnRpdHlDaHVua3MpIHtcbiAgICBjb25zdCBhY3RpdmUgPSBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSk7XG4gICAgaWYgKGFjdGl2ZS5sZW5ndGggPiAwIHx8IHdvcmxkLmVudGl0eUNoYW5nZXMuaGFzKGtleSkpIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBhY3RpdmUpO1xuICAgIGVsc2Ugd29ybGQuZW50aXR5Q2h1bmtzLmRlbGV0ZShrZXkpO1xuICB9XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwZXJzaXN0ZW5jZSAvIGF1dGhvcml0eSBib3VuZGFyeSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWFuaWZlc3Qge1xuICBzY2hlbWE6IDE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgcGFyYW1zSGFzaDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBmbnYxYSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgaCA9IDB4ODExYzlkYzU7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGggXj0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIGggPSBNYXRoLmltdWwoaCwgMHgwMTAwMDE5Myk7XG4gIH1cbiAgcmV0dXJuIChoID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkTWFuaWZlc3Qod29ybGQ6IFdvcmxkKTogV29ybGRNYW5pZmVzdCB7XG4gIGNvbnN0IHAgPSB3b3JsZC5wYXJhbXM7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIHNlZWQ6IHdvcmxkLnNlZWQsXG4gICAgZ2VuZXJhdG9yVmVyc2lvbjogcC5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIHNpemU6IHAuc2l6ZSxcbiAgICBjaHVua1NpemU6IHAuY2h1bmtTaXplLFxuICAgIHlNaW46IHAueU1pbixcbiAgICB5TWF4OiBwLnlNYXgsXG4gICAgc2VhTGV2ZWw6IHAuc2VhTGV2ZWwsXG4gICAgcGFyYW1zSGFzaDogZm52MWEoSlNPTi5zdHJpbmdpZnkocCkpLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsRWRpdCB7IGk6IG51bWJlcjsgbTogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBzY2hlbWE6IDE7XG4gIGtleTogc3RyaW5nO1xuICBiYXNlVmVyc2lvbjogbnVtYmVyO1xuICBlZGl0czogVm94ZWxFZGl0W107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBDaHVua0RlbHRhIHtcbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAga2V5LFxuICAgIGJhc2VWZXJzaW9uOiB3b3JsZC5wYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBlZGl0czogZWRpdHMgPyBbLi4uZWRpdHMuZW50cmllcygpXS5tYXAoKFtpLCBtXSkgPT4gKHsgaSwgbSB9KSkuc29ydCgoYSwgYikgPT4gYS5pIC0gYi5pKSA6IFtdLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlDaHVua0RlbHRhKHdvcmxkOiBXb3JsZCwgZGVsdGE6IENodW5rRGVsdGEpOiB2b2lkIHtcbiAgY29uc3QgW2N4LCBjel0gPSBkZWx0YS5rZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgZm9yIChjb25zdCBlIG9mIGRlbHRhLmVkaXRzKSB7XG4gICAgY29uc3QgeUluZGV4ID0gTWF0aC5mbG9vcihlLmkgLyBDSFVOS19BUkVBKTtcbiAgICBjb25zdCByZW0gPSBlLmkgJSBDSFVOS19BUkVBO1xuICAgIGNvbnN0IGx6ID0gTWF0aC5mbG9vcihyZW0gLyBDSFVOS19TSVpFKTtcbiAgICBjb25zdCBseCA9IHJlbSAlIENIVU5LX1NJWkU7XG4gICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjeCkgKyBseDtcbiAgICBjb25zdCB5ID0gWV9NSU4gKyB5SW5kZXg7XG4gICAgY29uc3QgeiA9IGNodW5rT3JpZ2luWihjeikgKyBsejtcbiAgICBzZXRWb3hlbCh3b3JsZCwgeCwgeSwgeiwgZS5tIGFzIE1hdElkKTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIHRpbWUgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBUaW1lU3RhdGUgeyB0OiBudW1iZXI7IGRheUxlbmd0aFNlYzogbnVtYmVyOyBwYXVzZWQ6IGJvb2xlYW47IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkdmFuY2VUaW1lKHM6IFRpbWVTdGF0ZSwgZHQ6IG51bWJlcik6IHZvaWQge1xuICBpZiAocy5wYXVzZWQpIHJldHVybjtcbiAgcy50ID0gKHMudCArIGR0IC8gcy5kYXlMZW5ndGhTZWMpICUgMTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxPQUFPLFVBQVU7QUFDakIsT0FBTyxZQUFZOzs7QUNRbkIsWUFBWSxXQUFXOzs7QUNUdkI7QUFBQSxFQUNFLFFBQVU7QUFBQSxFQUNWLE1BQVE7QUFBQSxFQUNSLFFBQVU7QUFBQSxFQUNWLFFBQVU7QUFBQSxFQUNWLE1BQVE7QUFBQSxFQUNSLFdBQWE7QUFBQSxJQUNYLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsY0FBZ0I7QUFBQSxNQUNkLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7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
