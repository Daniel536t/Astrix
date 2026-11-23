// tests/m003.inspection.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE6 from "three";

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
function generateWorld(seed = 1337, initialRadius = 0) {
  const world = createWorld(seed);
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
  const yieldBag = { food: 6, fiber: 1 };
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
    generatorVersion: GENERATOR_VERSION
  };
  if (m.schema !== 1 || !uint(m.seed, 4294967295) || m.generatorVersion !== params.generatorVersion || m.size !== params.size || m.chunkSize !== params.chunkSize || m.yMin !== params.yMin || m.yMax !== params.yMax || m.seaLevel !== params.seaLevel || !/^[0-9a-f]{8}$/.test(String(m.paramsHash))) {
    throw new Error("snapshot generator configuration is unsupported or incompatible");
  }
  if (!uint(value.revision, Number.MAX_SAFE_INTEGER) || !uint(value.nextSequence, 1e7) || typeof value.authoredPlaced !== "boolean" || !Array.isArray(value.edits) || !Array.isArray(value.entities) || !Array.isArray(value.entityRemovals) || value.entities.length > MAX_SNAPSHOT_ENTITIES || !Array.isArray(value.entityChunks) || !Array.isArray(value.structures)) {
    throw new Error("snapshot has invalid authoritative-state fields");
  }
  const world = createWorld(m.seed);
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
      if (!isObject(cell) || !uint(cell.i, CHUNK_VOLUME - 1) || cellIds.has(cell.i) || !uint(cell.m, 9)) throw new Error("snapshot contains an invalid voxel edit");
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
  const world = createWorld(valid.manifest.seed);
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
    } else if (value.type === "tick" && uint2(value.ticks) && value.ticks > 0 && value.ticks <= 64) {
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
  } else if (value.type === "plant" && typeof value.plotId === "string" && /^crop:[0-8]$/.test(value.plotId) && uint2(value.plantedTick) && value.growthTicks === 4) {
    outcome = { type: value.type, plotId: value.plotId, plantedTick: value.plantedTick, growthTicks: value.growthTicks };
  } else if (value.type === "harvest_crop" && typeof value.plotId === "string" && /^crop:[0-8]$/.test(value.plotId) && isResources(value.resources) && value.resources.food === 6 && value.resources.fiber === 1) {
    outcome = { type: value.type, plotId: value.plotId, resources: { food: 6, fiber: 1 } };
  } else if (value.type === "tick" && uint2(value.fromTick) && uint2(value.toTick) && value.toTick > value.fromTick && value.toTick - value.fromTick <= 64 && Array.isArray(value.completedJobs) && Array.isArray(value.readyCrops)) {
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
function createJournal(seed = 1337, schema = CURRENT_JOURNAL_SCHEMA) {
  return {
    schema,
    seed,
    starterInventory: inventory(M002_STARTER_INVENTORY),
    entries: []
  };
}
function validateJournal(value) {
  if (!object(value) || value.schema !== JOURNAL_SCHEMA && value.schema !== DESIGN_JOURNAL_SCHEMA && value.schema !== CURRENT_JOURNAL_SCHEMA || !uint2(value.seed) || value.seed > 4294967295 || !Array.isArray(value.entries) || value.entries.length > MAX_JOURNAL_ENTRIES) {
    throw new Error("invalid command journal");
  }
  const journal = {
    schema: value.schema,
    seed: value.seed,
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
  if (JSON.stringify(journal.starterInventory) !== JSON.stringify(createJournal(value.seed, value.schema).starterInventory)) {
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
  static genesis(seed = 1337) {
    return new _GameSession(genesisWorld(seed), createJournal(seed));
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
      genesisWorld(journal.seed, journal.starterInventory, journal.schema),
      createJournal(journal.seed, journal.schema)
    );
    for (const entry of journal.entries) session.replayEntry(entry);
    return session;
  }
  static restoreCurrent(snapshot, journal, next) {
    const world = worldFromSnapshot(snapshot);
    if (world.seed !== journal.seed) throw new Error("snapshot and journal seeds differ");
    const genesis = genesisWorld(journal.seed, journal.starterInventory, journal.schema);
    if (next === 0 && legacyStoneHash(snapshot) !== canonicalWorldHash(genesis, 0, journal.schema)) {
      throw new Error("genesis snapshot does not match journal configuration");
    }
    if (next > 0 && legacyStoneHash(snapshot) !== journal.entries[next - 1].hash) {
      throw new Error("snapshot hash does not match its journal boundary");
    }
    const session = _GameSession.fromValidatedBoundary(world, {
      schema: journal.schema,
      seed: journal.seed,
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
function genesisWorld(seed, starter = inventory(M002_STARTER_INVENTORY), schema = CURRENT_JOURNAL_SCHEMA) {
  const world = generateWorld(seed, 0);
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

// src/app/inspection.ts
var INSPECTION_CATALOG = {
  styl_tree_spire: { name: "Spire tree", description: "A tall, tiered-canopy tree. Harvest its timber for carried wood." },
  styl_tree_table: { name: "Table-canopy tree", description: "A broad, spreading tree. Its trunk and branches provide wood." },
  styl_tree_cluster: { name: "Cluster tree", description: "A many-crowned woodland tree. Harvest it to carry wood." },
  styl_tree_blossom: { name: "Blossom tree", description: "A pink-flowering tree. Its timber is gathered as wood." },
  styl_shrub: { name: "Fiber shrub", description: "A low leafy plant. Gather its plant fiber for processing into crop seed." },
  styl_ore: { name: "Purple-seam ore deposit", description: "A pale rock host with purple mineral seams. Gather it for ore; it is a natural resource." },
  styl_cairn: { name: "Stone cairn", description: "A deliberately stacked pile of natural stones. It can be gathered for stone." },
  waystone: { name: "Waystone", description: "A tall forked Noxel landmark. Its cream stone and teal inlay mark a place of interest; it is not a resource rock." },
  marker: { name: "Trail marker", description: "A small Noxel stone marker with teal inlay, identifying a route or point of interest." }
};
var KIT_INSPECTION = {
  post: { name: "Noxel post", description: "A provisional architecture-kit support post with a slab base and cap." },
  wall: { name: "Noxel wall panel", description: "A provisional stone wall module with a foundation and parapet." },
  gateway: { name: "Noxel gateway", description: "A provisional paired-post gateway with a stone lintel." },
  stair: { name: "Noxel stair", description: "A provisional stone stair module with four risers and a landing." },
  waystone: INSPECTION_CATALOG.waystone
};
function inspectionKey(ref) {
  const [kind, id2] = Object.entries(ref)[0];
  return `${kind}:${id2}`;
}
function entityInspection(world, ref) {
  const e = world.entities.get(ref.entityId);
  if (!e || e.harvested || world.entityRemovals.has(e.id) || isRetiredStoneKind(e.kind)) return null;
  const catalog = INSPECTION_CATALOG[e.kind];
  if (!catalog) return null;
  return {
    ref,
    key: inspectionKey(ref),
    name: catalog.name,
    category: "Natural resource",
    description: catalog.description,
    facts: [
      { label: "Resource", value: e.resource ?? "None" },
      { label: "Remaining", value: `${e.remaining} \xB7 ${Math.min(e.yieldPerHarvest, e.remaining)} per gather` },
      { label: "Status", value: e.provisional ? "Available \xB7 provisional art" : "Available" }
    ]
  };
}
function structureInspection(world, ref) {
  const s = world.structures.get(ref.structureId);
  if (!s) return null;
  const project = M2_PROJECTS.find((p) => p.siteId === s.siteId && p.kind === s.kind);
  const name = project?.name ?? (s.kind === "house" ? "Founder's house" : s.kind === "path" ? "Door path" : "Terraced field");
  return {
    ref,
    key: inspectionKey(ref),
    name,
    category: "Architecture \xB7 founder project",
    description: project?.description ?? "A structure recorded in the settlement\u2019s authoritative construction state.",
    facts: [
      { label: "Type", value: s.kind === "terrace" ? "Terraced farm" : s.kind },
      { label: "Footprint", value: (() => {
        const xs = s.modules.map((m) => [m.x - m.w / 2, m.x + m.w / 2]);
        const zs = s.modules.map((m) => [m.z - m.d / 2, m.z + m.d / 2]);
        return `${Math.max(...xs.map((v) => v[1])) - Math.min(...xs.map((v) => v[0]))} \xD7 ${Math.max(...zs.map((v) => v[1])) - Math.min(...zs.map((v) => v[0]))} m`;
      })() },
      { label: "Art", value: "Built \xB7 provisional Noxel design" }
    ]
  };
}
function siteInspection(world, ref) {
  const site = world.sites.find((s) => s.id === ref.siteId);
  if (!site) return null;
  return {
    ref,
    key: inspectionKey(ref),
    name: INSPECTION_CATALOG[site.kind].name,
    category: "Architecture \xB7 landmark",
    description: INSPECTION_CATALOG[site.kind].description,
    facts: [
      { label: "Purpose", value: "Navigation landmark \xB7 not harvestable" },
      { label: "Art", value: site.provisional ? "Provisional Noxel design" : "Authored" }
    ]
  };
}
function stockpileInspection(world, ref) {
  const stock = world.life?.stockpiles.get(ref.stockpileId);
  if (!stock) return null;
  const entries = Object.entries(stock.inventory).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b));
  const stored = entries.reduce((sum, [, n]) => sum + n, 0);
  return {
    ref,
    key: inspectionKey(ref),
    name: "Founder stockpile",
    category: "Architecture \xB7 settlement storage",
    description: "An open timber-and-stone depot. Deposit carried supplies here for processing; withdraw them to carry them again.",
    facts: [
      { label: "Stored", value: `${stored} / ${stock.capacity}` },
      { label: "Contents", value: entries.map(([r, n]) => `${n} ${r}`).join(" \xB7 ") || "Empty" }
    ]
  };
}
function cropInspection(world, ref) {
  const life = world.life;
  const index = Number(ref.cropId.slice("crop:".length));
  if (!life || !/^crop:[0-8]$/.test(ref.cropId)) return null;
  if (![...world.structures.values()].some((s) => s.kind === "terrace")) return null;
  const crop = life.crops.get(ref.cropId);
  const ready = !!crop && cropReady(crop, life.tick);
  return {
    ref,
    key: inspectionKey(ref),
    name: `Terrace crop plot ${index + 1}`,
    category: "Settlement infrastructure \xB7 farm plot",
    description: crop ? "A planted grain plot. Advance simulation ticks to grow it, then harvest food and fiber." : "An empty tilled terrace plot. Plant it with seed from the Settlement panel; there is no plant here yet.",
    facts: [
      { label: "State", value: !crop ? "Empty \xB7 needs 1 seed" : ready ? "Ready to harvest" : "Growing" },
      { label: "Yield", value: crop ? "6 food + 1 fiber when harvested" : "Plant through the Settlement panel" },
      ...crop ? [{ label: "Growth", value: `${Math.min(life.tick - crop.plantedTick, crop.growthTicks)} / ${crop.growthTicks} ticks` }] : []
    ]
  };
}
function resolveInspection(world, ref) {
  if ("entityId" in ref) return entityInspection(world, ref);
  if ("structureId" in ref) return structureInspection(world, ref);
  if ("siteId" in ref) return siteInspection(world, ref);
  if ("kitId" in ref) {
    const item = KIT_INSPECTION[ref.kitId];
    return item ? {
      ref,
      key: inspectionKey(ref),
      category: "Architecture \xB7 provisional kit",
      ...item,
      facts: [{ label: "Scene", value: "Noxel integration-test module \xB7 provisional art" }]
    } : null;
  }
  if ("stockpileId" in ref) return stockpileInspection(world, ref);
  return cropInspection(world, ref);
}
function inspectionRef(object2, batchId) {
  const data = object2.userData;
  if (!data) return null;
  if (typeof data.inspectableBatchIds !== "undefined" && typeof batchId === "number") {
    const ids = data.inspectableBatchIds;
    return Array.isArray(ids) && typeof ids[batchId] === "string" ? { entityId: ids[batchId] } : null;
  }
  for (const key of ["structureId", "siteId", "kitId", "stockpileId", "cropId"]) {
    if (typeof data[key] === "string") return { [key]: data[key] };
  }
  return null;
}

// src/app/inspector.ts
import * as THREE from "three";

// src/ui/inspector.ts
var InspectorPanel = class {
  root;
  toggle;
  card;
  list;
  constructor(options) {
    this.root = document.createElement("section");
    this.root.id = "inspector";
    this.root.className = "inspector";
    this.root.setAttribute("aria-label", "Object inspector");
    this.toggle = document.createElement("button");
    this.toggle.type = "button";
    this.toggle.id = "inspect-toggle";
    this.toggle.className = "inspect-toggle";
    this.toggle.textContent = "Inspect";
    this.toggle.title = "Choose an object by name, or hover / click / tap one in the world";
    this.toggle.setAttribute("aria-expanded", "false");
    this.toggle.setAttribute("aria-controls", "inspect-objects");
    this.toggle.addEventListener("click", () => this.setListVisible(this.list.hidden));
    this.card = document.createElement("article");
    this.card.id = "inspect-card";
    this.card.setAttribute("role", "dialog");
    this.card.setAttribute("aria-labelledby", "inspect-name");
    this.card.setAttribute("aria-describedby", "inspect-description");
    this.card.hidden = true;
    const head = document.createElement("div");
    head.className = "inspect-head";
    const heading = document.createElement("div");
    const category = document.createElement("span");
    category.className = "inspect-category";
    const title = document.createElement("h2");
    title.id = "inspect-name";
    heading.append(category, title);
    const close = document.createElement("button");
    close.type = "button";
    close.id = "inspect-close";
    close.setAttribute("aria-label", "Close object inspection");
    close.textContent = "\xD7";
    close.hidden = true;
    head.append(heading, close);
    const description = document.createElement("p");
    description.id = "inspect-description";
    const facts = document.createElement("dl");
    facts.className = "inspect-facts";
    this.card.append(head, description, facts);
    this.show = (info, pinned, x = 0, y = 0) => {
      close.hidden = !pinned;
      close.onclick = pinned ? () => options.onDismiss() : null;
      this.card.hidden = false;
      this.card.classList.toggle("is-pinned", pinned);
      this.card.dataset.ref = info.key;
      this.card.dataset.mode = pinned ? "pinned" : "hover";
      category.textContent = info.category;
      title.textContent = info.name;
      description.textContent = info.description;
      facts.replaceChildren();
      for (const fact of info.facts) {
        const row = document.createElement("div");
        const label = document.createElement("dt");
        label.textContent = fact.label;
        const value = document.createElement("dd");
        value.textContent = fact.value;
        row.append(label, value);
        facts.append(row);
      }
      if (pinned) {
        this.card.style.removeProperty("left");
        this.card.style.removeProperty("top");
      } else {
        this.card.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 324))}px`;
        this.card.style.top = `${Math.max(8, Math.min(y, window.innerHeight - this.card.offsetHeight - 12))}px`;
      }
    };
    this.list = document.createElement("div");
    this.list.id = "inspect-objects";
    this.list.className = "inspect-list";
    this.list.hidden = true;
    const listTitle = document.createElement("span");
    listTitle.className = "inspect-category";
    listTitle.id = "inspect-list-title";
    listTitle.textContent = "Named objects in this scene";
    this.list.setAttribute("role", "group");
    this.list.setAttribute("aria-labelledby", "inspect-list-title");
    const help = document.createElement("p");
    help.textContent = "Names read from the current world. Inspection does not change or gather anything.";
    this.list.append(listTitle, help);
    this.renderList = (items) => {
      this.list.querySelectorAll("button[data-inspect-key]").forEach((button) => button.remove());
      for (const target of items) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.inspectKey = target.key;
        button.textContent = `${target.name} \u2014 ${target.category}`;
        button.addEventListener("click", () => options.onSelect(target.key));
        this.list.append(button);
      }
      this.list.dataset.count = String(items.length);
    };
    this.root.append(this.toggle, this.list, this.card);
    document.body.appendChild(this.root);
  }
  show;
  renderList;
  hideCard(restoreFocus = false) {
    const hadInspectorFocus = this.root.contains(document.activeElement);
    this.card.hidden = true;
    this.card.removeAttribute("data-ref");
    this.card.removeAttribute("data-mode");
    this.card.style.removeProperty("left");
    this.card.style.removeProperty("top");
    if (restoreFocus && hadInspectorFocus) {
      document.querySelector("#app canvas")?.focus();
    }
  }
  setListVisible(visible) {
    this.list.hidden = !visible;
    this.toggle.setAttribute("aria-expanded", String(visible));
    if (visible) this.hideCard();
  }
  setVisible(visible) {
    this.root.hidden = !visible;
  }
  pinnedKey() {
    return this.card.hidden || this.card.dataset.mode !== "pinned" ? null : this.card.dataset.ref ?? null;
  }
  isListVisible() {
    return !this.list.hidden;
  }
  focusCard() {
    this.card.querySelector("button:not([hidden])")?.focus();
  }
  focusList() {
    this.list.querySelector("button")?.focus();
  }
};

// src/app/inspector.ts
function originDistance(origin, point) {
  return origin.distanceTo(point);
}
function visibleInHierarchy(object2, scene) {
  let current = object2;
  while (current) {
    if (!current.visible) return false;
    if (current === scene) return true;
    current = current.parent;
  }
  return false;
}
function identifiedRef(object2, batchId) {
  let current = object2;
  while (current) {
    const ref = inspectionRef(current, batchId);
    if (ref) return ref;
    current = current.parent;
  }
  return null;
}
function objectTarget(object2) {
  const anchor = object2.userData.inspectTarget;
  if (!anchor) return null;
  const point = new THREE.Vector3(anchor.x, anchor.y, anchor.z);
  object2.updateWorldMatrix(true, false);
  object2.localToWorld(point);
  return point;
}
var SceneInspector = class {
  constructor(options, panel) {
    this.options = options;
    this.panel = panel ?? new InspectorPanel({
      onSelect: (key) => {
        const target = this.targetCache[key];
        if (target) this.pin(target.ref);
      },
      onDismiss: () => this.dismiss()
    });
    options.canvas.tabIndex = 0;
    options.canvas.setAttribute(
      "aria-label",
      "ASTrix world. Drag to orbit. Click or tap to inspect. Use Inspect for a keyboard object list."
    );
    this.bindPointer();
    this.options.canvas.ownerDocument?.defaultView?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const escapeFromInspector = this.panel.root.contains(event.target);
      this.dismiss();
      if (escapeFromInspector) {
        this.options.canvas.focus();
        event.preventDefault();
      }
    }, true);
  }
  options;
  roots = /* @__PURE__ */ new Set();
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  pointers = /* @__PURE__ */ new Map();
  panel;
  selected = null;
  hovered = null;
  targetCache = {};
  lastRevision = -1;
  visible = true;
  gestureUsed = false;
  lastPointer = { x: 0, y: 0 };
  lastHoverPick = -Infinity;
  lastPointerMove = -Infinity;
  pendingHover = false;
  addRoot(root) {
    this.roots.add(root);
    this.refreshTargets();
  }
  bindPointer() {
    this.options.canvas.addEventListener("pointerdown", (event) => {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false });
      if (event.isPrimary && this.pointers.size === 1) this.gestureUsed = false;
      if (this.pointers.size > 1) this.gestureUsed = true;
    });
    this.options.canvas.addEventListener("pointermove", (event) => {
      const down = this.pointers.get(event.pointerId);
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7) down.moved = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.lastPointerMove = performance.now();
      if (event.pointerType === "mouse" && event.buttons === 0 && !down?.moved && this.visible && !this.selected) {
        this.pendingHover = true;
      } else {
        this.lastPointerMove = -Infinity;
        this.pendingHover = false;
      }
    });
    this.options.canvas.addEventListener("pointerup", (event) => {
      const down = this.pointers.get(event.pointerId);
      const wasGesture = this.gestureUsed || this.pointers.size > 1;
      this.pointers.delete(event.pointerId);
      if (this.pointers.size === 0) this.gestureUsed = false;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.lastPointerMove = event.pointerType === "mouse" ? performance.now() : -Infinity;
      this.pendingHover = event.pointerType === "mouse" && event.buttons === 0 && this.visible && !this.selected;
      if (!this.visible || !down || down.moved || wasGesture || this.gestureUsed || !event.isPrimary) return;
      const ref = this.pick(event.clientX, event.clientY);
      if (ref) this.pin(ref);
      else if (this.hovered) this.dismiss();
    });
    this.options.canvas.addEventListener("pointercancel", (event) => {
      this.pointers.delete(event.pointerId);
      this.gestureUsed = true;
      this.clearHover();
    });
    this.options.canvas.addEventListener("pointerleave", () => {
      this.lastPointerMove = -Infinity;
      this.pendingHover = false;
      this.clearHover();
    });
    this.options.canvas.addEventListener("blur", (event) => {
      const nextFocus = event.relatedTarget;
      if (!this.panel.root.contains(nextFocus)) this.dismiss();
    });
  }
  /** First opaque surface wins; only parent decoration can share an identity. */
  pick(x, y) {
    const rect = this.options.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || this.roots.size === 0) return null;
    this.pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.options.camera);
    const hits = this.raycaster.intersectObjects([this.options.terrain, ...this.roots], true);
    for (const hit of hits) {
      if (!visibleInHierarchy(hit.object, this.options.scene)) continue;
      const ref = identifiedRef(hit.object, hit.batchId);
      if (ref && "structureId" in ref) {
        const structure = this.options.world.structures.get(ref.structureId);
        if (structure?.kind === "terrace" && structure.designVersion === 2) {
          const rows = structure.modules.filter((module) => module.kind === "crop_row");
          let closestIndex = -1;
          let closestDistance = Infinity;
          const point = new THREE.Vector3();
          rows.forEach((row, index) => {
            const bounds = new THREE.Box3(
              new THREE.Vector3(row.x - row.w / 2, row.y - 0.01, row.z - row.d / 2),
              new THREE.Vector3(row.x + row.w / 2, row.y + Math.max(row.h, 0.5), row.z + row.d / 2)
            );
            const intersection = this.raycaster.ray.intersectBox(bounds, point);
            if (!intersection) return;
            const distance = originDistance(this.raycaster.ray.origin, intersection);
            if (distance <= hit.distance + 0.5 && distance < closestDistance) {
              closestIndex = index;
              closestDistance = distance;
            }
          });
          if (closestIndex >= 0) {
            const rowRef = { cropId: `crop:${closestIndex}` };
            if (resolveInspection(this.options.world, rowRef)) return rowRef;
          }
        }
      }
      if (ref) return resolveInspection(this.options.world, ref) ? ref : null;
      let parent = hit.object.parent;
      while (parent && visibleInHierarchy(parent, this.options.scene)) {
        if (parent.userData.structureId || parent.userData.siteId || parent.userData.stockpileId || parent.userData.cropId) {
          const ancestorRef = inspectionRef(parent);
          return ancestorRef && resolveInspection(this.options.world, ancestorRef) ? ancestorRef : null;
        }
        if (this.roots.has(parent)) break;
        parent = parent.parent;
      }
      return null;
    }
    return null;
  }
  pin(ref) {
    const info = resolveInspection(this.options.world, ref);
    if (!info) {
      this.dismiss();
      return;
    }
    const fromList = this.panel.isListVisible();
    this.selected = ref;
    this.hovered = null;
    this.panel.setListVisible(false);
    this.panel.show(info, true);
    if (fromList) this.panel.focusCard();
    this.lastPointerMove = -Infinity;
    this.pendingHover = false;
  }
  update() {
    if (!this.visible) return;
    if (this.options.world.revision !== this.lastRevision) {
      this.refreshTargets();
      if (this.selected) {
        const info2 = resolveInspection(this.options.world, this.selected);
        if (info2) this.panel.show(info2, true);
        else this.dismiss();
      }
    }
    const now = performance.now();
    if (now - this.lastPointerMove > 250 || !this.pendingHover || now - this.lastHoverPick < 80) return;
    this.pendingHover = false;
    this.lastHoverPick = now;
    const ref = this.pick(this.lastPointer.x, this.lastPointer.y);
    this.hovered = ref;
    const info = ref ? resolveInspection(this.options.world, ref) : null;
    if (info && info.key !== this.panel.pinnedKey()) {
      this.panel.show(info, false, this.lastPointer.x + 18, this.lastPointer.y + 18);
    } else this.clearHover();
  }
  clearHover() {
    this.hovered = null;
    if (!this.selected) this.panel.hideCard();
  }
  dismiss() {
    this.selected = null;
    this.hovered = null;
    this.panel.hideCard(true);
    this.panel.setListVisible(false);
    this.lastPointerMove = -Infinity;
    this.pendingHover = false;
  }
  refreshTargets() {
    const targets = {};
    for (const root of this.roots) {
      if (!visibleInHierarchy(root, this.options.scene)) continue;
      root.traverse((object2) => {
        const batchTargets = object2.userData.inspectableTargets;
        if (Array.isArray(batchTargets)) {
          for (const target of batchTargets) {
            if (!target || typeof target.entityId !== "string") continue;
            const ref2 = { entityId: target.entityId };
            const info2 = resolveInspection(this.options.world, ref2);
            if (info2) targets[info2.key] = {
              ref: ref2,
              key: info2.key,
              name: info2.name,
              category: info2.category,
              x: target.x,
              y: target.y,
              z: target.z
            };
          }
        }
        const ref = inspectionRef(object2);
        if (!ref) return;
        const key = inspectionKey(ref);
        if (targets[key]) return;
        const info = resolveInspection(this.options.world, ref);
        const point = objectTarget(object2);
        if (!info || !point) return;
        targets[key] = {
          ref,
          key,
          name: info.name,
          category: info.category,
          x: point.x,
          y: point.y,
          z: point.z
        };
      });
    }
    this.targetCache = targets;
    this.lastRevision = this.options.world.revision;
    this.panel.renderList(Object.values(targets).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key)));
  }
  setVisible(visible) {
    this.visible = visible;
    this.panel.setVisible(visible);
    if (!visible) this.dismiss();
  }
  metrics() {
    return {
      visible: this.visible,
      selected: this.selected ? resolveInspection(this.options.world, this.selected)?.name ?? null : null,
      hovered: this.hovered ? resolveInspection(this.options.world, this.hovered)?.name ?? null : null,
      targetCount: Object.keys(this.targetCache).length,
      targets: this.targetCache
    };
  }
};

// src/render/nature.ts
import * as THREE2 from "three";
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

// src/render/nature.ts
var M = palette_default.materials;
var H = (k) => M[k].hex;
var GREEN = [H("canopy_green_a"), H("canopy_green_b"), H("canopy_green_c")];
var PINK = [H("canopy_pink_b"), H("canopy_pink")];
var TRUNK = H("trunk");
var BARK = H("bark_dark");
var STONE = H("stone_top");
var STONE_B = H("stone_body_b");
var STONE_SHADE = H("stone_shade");
var ORE = H("ore_crystal");
var ORE_B = H("ore_crystal_b");
var OCHRE = H("strata_ochre");
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const color = new THREE2.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new THREE2.BufferAttribute(arr, 3));
  return g;
}
function box(cx, cy, cz, sx, sy, sz, hex) {
  const g = new THREE2.BoxGeometry(sx, sy, sz);
  g.translate(cx, cy, cz);
  const out = paint(g, hex);
  out.computeVertexNormals();
  return out;
}
function column(cx, cz, y0, h, r, sides, yawDeg, hex) {
  const g = new THREE2.CylinderGeometry(r, r, h, sides, 1, false);
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
    const phi = phiDeg * D, c = Math.cos(phi), s = Math.sin(phi);
    const out = [];
    for (let k = 0; k < m.sides; k++) {
      const t = lon(k);
      out.push([
        m.cx + m.rx * c * Math.cos(t),
        m.cy + m.ry * s,
        m.cz + m.rz * c * Math.sin(t)
      ]);
    }
    return out;
  };
  const pole = (sign) => [m.cx, m.cy + sign * m.ry, m.cz];
  const capCentre = (phiDeg) => [m.cx, m.cy + m.ry * Math.sin(phiDeg * D), m.cz];
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L;
    ny /= L;
    nz /= L;
    const fx = (a[0] + b[0] + c[0]) / 3 - m.cx;
    const fy = (a[1] + b[1] + c[1]) / 3 - m.cy;
    const fz = (a[2] + b[2] + c[2]) / 3 - m.cz;
    if (nx * fx + ny * fy + nz * fz < 0) {
      const t = b;
      b = c;
      c = t;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (const p of [a, b, c]) {
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
  const geo = new THREE2.BufferGeometry();
  geo.setAttribute("position", new THREE2.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE2.Float32BufferAttribute(nrm, 3));
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
function geometryFor(kind, variant) {
  if (kind === "styl_tree_spire") return treeGeometry(T1, Math.abs(variant) % 4);
  if (kind === "styl_tree_table") return treeGeometry(T2, Math.abs(variant) % 4);
  if (kind === "styl_tree_cluster") return treeGeometry(T3, Math.abs(variant) % 3);
  if (kind === "styl_tree_blossom") return treeGeometry(T4, Math.abs(variant) % 2);
  if (kind === "styl_shrub") return shrubGeometry(Math.abs(variant) % 3);
  if (kind === "styl_ore") return oreGeometry(Math.abs(variant) % 2);
  if (kind === "styl_cairn") return cairnGeometry();
  return null;
}
var natureMaterial = new THREE2.MeshLambertMaterial({ vertexColors: true, flatShading: true });
function buildNoxelNature(world, loadedChunks = null) {
  const group = new THREE2.Group();
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
    geometries.set(key, geo.index ? geo.toNonIndexed() : geo);
    triangles += geo.attributes.position.count / 3 * list.length;
    instanceCount += list.length;
  }
  if (instanceCount === 0) return { group, triangles: 0, instances: 0 };
  let vertexCount = 0;
  for (const geo of geometries.values()) vertexCount += geo.attributes.position.count;
  const batched = new THREE2.BatchedMesh(
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
  const m = new THREE2.Matrix4();
  const q = new THREE2.Quaternion();
  const v = new THREE2.Vector3();
  const s = new THREE2.Vector3();
  const up = new THREE2.Vector3(0, 1, 0);
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

// src/render/noxel.ts
import * as THREE3 from "three";
import { mergeGeometries as mergeGeometries2 } from "three/examples/jsm/utils/BufferGeometryUtils.js";
var M2 = palette_default.materials;
var H2 = (k) => M2[k].hex;
var STONE2 = H2("noxel_stone");
var STONE_B2 = H2("noxel_stone_b");
var OCHRE2 = H2("strata_ochre");
var TIMBER = H2("bark_dark");
var BLUE = H2("accent_blue");
function box2(b) {
  const g = new THREE3.BoxGeometry(b.w, b.h, b.d);
  g.translate(b.x ?? 0, (b.y ?? 0) + b.h / 2, b.z ?? 0);
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute("uv");
  const c = new THREE3.Color(b.colour);
  const n = ng.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  ng.setAttribute("color", new THREE3.BufferAttribute(arr, 3));
  return ng;
}
var MAT2 = new THREE3.MeshLambertMaterial({ vertexColors: true, flatShading: true });
function assembly2(boxes, name, mat = MAT2) {
  const g = mergeGeometries2(boxes.map(box2), false);
  g.computeVertexNormals();
  const mesh2 = new THREE3.Mesh(g, mat);
  mesh2.name = name;
  mesh2.castShadow = true;
  mesh2.receiveShadow = false;
  return mesh2;
}
function noxelWall() {
  return assembly2([
    { w: 4, h: 0.4, d: 1.2, y: 0, colour: STONE_B2 },
    // foundation slab
    { w: 3.8, h: 0.2, d: 1, y: 0.4, colour: OCHRE2 },
    // threshold accent
    { w: 4, h: 3.2, d: 0.6, y: 0.4, colour: STONE2 },
    // mass
    { w: 4, h: 0.3, d: 0.6, x: 0, y: 3.6, colour: STONE_B2 },
    // parapet slab
    { w: 0.3, h: 0.3, d: 0.7, x: -1.4, y: 3.9, colour: STONE2 },
    // cap blocks
    { w: 0.3, h: 0.3, d: 0.7, x: 0, y: 3.9, colour: STONE2 },
    { w: 0.3, h: 0.3, d: 0.7, x: 1.4, y: 3.9, colour: STONE2 }
  ], "noxel_wall");
}
function noxelPost() {
  return assembly2([
    { w: 1.8, h: 0.4, d: 1.8, y: 0, colour: STONE_B2 },
    // slab base
    { w: 1.2, h: 4.8, d: 1.2, y: 0.4, colour: STONE2 },
    // post
    { w: 1.6, h: 0.3, d: 1.6, y: 5.2, colour: STONE_B2 }
    // post cap
  ], "noxel_post");
}
function noxelGateway() {
  return assembly2([
    { w: 1.8, h: 0.4, d: 1.8, x: -2.4, y: 0, colour: STONE_B2 },
    { w: 1.8, h: 0.4, d: 1.8, x: 2.4, y: 0, colour: STONE_B2 },
    { w: 1.2, h: 4.8, d: 1.2, x: -2.4, y: 0.4, colour: STONE2 },
    { w: 1.2, h: 4.8, d: 1.2, x: 2.4, y: 0.4, colour: STONE2 },
    { w: 6, h: 0.8, d: 1.2, y: 5.2, colour: STONE2 },
    // lintel mass
    { w: 1.6, h: 0.3, d: 1.6, x: -2.4, y: 6, colour: STONE_B2 },
    // cap blocks
    { w: 1.6, h: 0.3, d: 1.6, x: 2.4, y: 6, colour: STONE_B2 }
  ], "noxel_gateway");
}
function noxelStair() {
  const boxes = [];
  for (let i = 0; i < 4; i++) {
    boxes.push({ w: 2, h: 0.3, d: 0.9, z: i * 0.9, y: i * 0.3, colour: i % 2 ? STONE_B2 : STONE2 });
  }
  boxes.push({ w: 2, h: 0.3, d: 2, z: 3.6, y: 1.2, colour: STONE2 });
  return assembly2(boxes, "noxel_stair");
}
var ACCENT_MAT = new THREE3.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
  emissive: new THREE3.Color(H2("accent_teal")),
  emissiveIntensity: 0.55
});
function waystone() {
  const body = assembly2([
    // Volumes overlap by 1-2 cm at every seat. Exact coplanar contacts
    // produced a moiré/depth-fight hatch on the horizontal shoulders.
    { w: 3.2, h: 0.5, d: 2.6, y: 0, colour: STONE_B2 },
    // plinth
    { w: 2.4, h: 0.35, d: 2, y: 0.45, colour: STONE2 },
    // step
    { w: 1.7, h: 2.9, d: 1.25, y: 0.75, colour: STONE2 },
    // lower shaft
    { w: 2.1, h: 0.33, d: 1.5, y: 3.6, colour: STONE_B2 },
    // shoulder
    { w: 1, h: 2.32, d: 0.85, y: 3.88, colour: STONE2 },
    // upper shaft
    { w: 1.25, h: 0.35, d: 0.95, y: 6.15, colour: STONE2 },
    // fork bridge
    { w: 0.35, h: 1.4, d: 0.55, x: -0.45, y: 6.45, colour: STONE_B2 },
    // left prong
    { w: 0.35, h: 1.4, d: 0.55, x: 0.45, y: 6.45, colour: STONE_B2 }
    // right prong
  ], "noxel_waystone");
  const glow = assembly2([
    { w: 0.18, h: 1.65, d: 0.055, x: -0.23, z: -0.655, y: 1.2, colour: H2("accent_teal") },
    { w: 0.18, h: 1.65, d: 0.055, x: 0.23, z: -0.655, y: 1.2, colour: H2("accent_teal") },
    { w: 0.18, h: 1.65, d: 0.055, x: -0.23, z: 0.655, y: 1.2, colour: H2("accent_teal") },
    { w: 0.18, h: 1.65, d: 0.055, x: 0.23, z: 0.655, y: 1.2, colour: H2("accent_teal") },
    { w: 1.15, h: 0.13, d: 1.35, y: 3.66, colour: H2("accent_blue") },
    { w: 0.05, h: 0.55, d: 0.55, x: 0.53, y: 4.35, colour: H2("accent_teal") },
    { w: 0.05, h: 0.55, d: 0.55, x: -0.53, y: 4.35, colour: H2("accent_teal") }
  ], "noxel_waystone_glow", ACCENT_MAT);
  const g = new THREE3.Group();
  g.add(body, glow);
  g.name = "noxel_waystone";
  body.castShadow = true;
  return g;
}
function marker() {
  const body = assembly2([
    { w: 1.8, h: 0.4, d: 1.8, y: 0, colour: STONE_B2 },
    { w: 1.2, h: 0.25, d: 1.2, y: 0.4, colour: STONE2 },
    { w: 0.7, h: 2.6, d: 0.7, y: 0.65, colour: STONE2 },
    { w: 1.15, h: 0.22, d: 1.15, y: 3.25, colour: STONE_B2 },
    { w: 0.35, h: 0.55, d: 0.35, y: 3.47, colour: STONE2 }
  ], "noxel_marker");
  const glow = assembly2([
    { w: 0.24, h: 1.15, d: 0.04, z: -0.37, y: 1, colour: H2("accent_teal") },
    { w: 0.24, h: 1.15, d: 0.04, z: 0.37, y: 1, colour: H2("accent_teal") },
    { w: 0.52, h: 0.1, d: 0.52, y: 3.36, colour: H2("accent_blue") }
  ], "noxel_marker_glow", ACCENT_MAT);
  const g = new THREE3.Group();
  g.add(body, glow);
  g.name = "noxel_marker";
  return g;
}
function buildNoxelSite(site) {
  const mesh2 = site.kind === "waystone" ? waystone() : marker();
  mesh2.position.set(site.x, site.y - 0.12, site.z);
  mesh2.rotation.y = site.rot;
  mesh2.userData.siteId = site.id;
  mesh2.userData.inspectTarget = {
    x: 0,
    y: site.kind === "waystone" ? 3.2 : 1.8,
    z: 0
  };
  return mesh2;
}
function buildKit() {
  const items = [
    { name: "Post", build: noxelPost, x: -9, z: 0 },
    { name: "Wall panel", build: noxelWall, x: -4.5, z: 0 },
    { name: "Gateway", build: noxelGateway, x: 2.5, z: 0 },
    { name: "Stair", build: noxelStair, x: 5.8, z: 0.2 },
    { name: "Waystone", build: waystone, x: 13.2, z: 2.2 }
  ];
  return items.map((it) => {
    const m = it.build();
    m.position.x = it.x;
    m.position.z = it.z;
    if (it.name === "Stair") m.rotation.y = Math.PI / 2;
    m.userData.kitId = it.name.toLowerCase().replace(" panel", "");
    m.userData.inspectTarget = { x: 0, y: it.name === "Waystone" ? 3.2 : 1.2, z: 0 };
    return m;
  });
}

// src/render/life.ts
import * as THREE4 from "three";
import { mergeGeometries as mergeGeometries3 } from "three/examples/jsm/utils/BufferGeometryUtils.js";
var M3 = palette_default.materials;
var H3 = (key) => M3[key].hex;
var TIMBER2 = H3("bark_dark");
var WOOD = H3("trunk");
var STONE3 = H3("noxel_stone_b");
var SOIL = "#684A32";
var SOIL_EDGE = H3("strata_ochre");
var GREEN2 = H3("canopy_green_a");
var GREEN_LIGHT = H3("canopy_green_c");
var GOLD = "#D9AD3D";
var GOLD_LIGHT = "#F0CF63";
var FIBER = "#B8A96B";
var LIFE_MATERIAL = new THREE4.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true
});
function paint2(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute("uv");
  const colour = new THREE4.Color(hex);
  const values = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) {
    values[i * 3] = colour.r;
    values[i * 3 + 1] = colour.g;
    values[i * 3 + 2] = colour.b;
  }
  g.setAttribute("color", new THREE4.BufferAttribute(values, 3));
  return g;
}
function box3(w, h, d, x, y, z, colour) {
  const geometry = new THREE4.BoxGeometry(w, h, d);
  geometry.translate(x, y + h / 2, z);
  return paint2(geometry, colour);
}
function mesh(parts, name) {
  const geometry = mergeGeometries3(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error(`could not merge life mesh ${name}`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const result = new THREE4.Mesh(geometry, LIFE_MATERIAL);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}
function stockpileFrame() {
  const parts = [
    box3(3.4, 0.18, 2.6, 0, 0, 0, STONE3),
    // Slatted timber bin, open at the front so empty storage is visible.
    box3(3, 0.16, 0.16, 0, 0.18, -1.02, TIMBER2),
    box3(0.16, 0.65, 2, -1.43, 0.18, 0, TIMBER2),
    box3(0.16, 0.65, 2, 1.43, 0.18, 0, TIMBER2),
    box3(3, 0.16, 0.16, 0, 0.7, -1.02, WOOD)
  ];
  for (const x of [-1.43, 1.43]) {
    const post = new THREE4.CylinderGeometry(0.09, 0.12, 1.85, 4);
    post.rotateY(Math.PI / 4);
    post.translate(x, 1.105, -1);
    parts.push(paint2(post, TIMBER2));
  }
  const roof = new THREE4.ConeGeometry(2.35, 0.62, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1, 1, 0.76);
  roof.translate(0, 2.15, -1);
  parts.push(paint2(roof, WOOD));
  return mesh(parts, "stockpile_frame");
}
function resourceGeometry(resource, index) {
  const x = -1.05 + index % 4 * 0.7;
  const z = 0.42 - Math.floor(index / 4) * 0.65;
  if (resource === "wood") {
    const log = new THREE4.CylinderGeometry(0.16, 0.18, 0.58, 6);
    log.rotateZ(Math.PI / 2);
    log.translate(x, 0.39, z);
    return paint2(log, WOOD);
  }
  if (resource === "stone" || resource === "ore") {
    const rock = new THREE4.DodecahedronGeometry(resource === "ore" ? 0.2 : 0.24, 0);
    rock.scale(1.1, 0.75, 0.9);
    rock.rotateY(index * 0.7);
    rock.translate(x, 0.38, z);
    return paint2(rock, resource === "ore" ? H3("ore_crystal") : STONE3);
  }
  if (resource === "fiber" || resource === "seed") {
    const bundle = new THREE4.ConeGeometry(0.22, 0.44, 5);
    bundle.translate(x, 0.4, z);
    return paint2(bundle, resource === "seed" ? GOLD : FIBER);
  }
  const sack = new THREE4.OctahedronGeometry(0.25, 0);
  sack.scale(0.9, 1.15, 0.8);
  sack.translate(x, 0.42, z);
  return paint2(sack, resource === "rations" ? GOLD_LIGHT : GOLD);
}
function stockpileResources(stock) {
  const entries = Object.entries(stock.inventory).filter(([, amount]) => amount > 0).sort(([a], [b]) => a.localeCompare(b));
  const parts = entries.map(([resource], index) => resourceGeometry(resource, index));
  if (parts.length === 0) return null;
  const resources = mesh(parts, "stockpile_resources");
  resources.userData.resources = Object.fromEntries(entries);
  resources.userData.stored = entries.reduce((sum, [, amount]) => sum + amount, 0);
  resources.userData.capacity = stock.capacity;
  return resources;
}
function buildStockpile(world, stock) {
  const group = new THREE4.Group();
  group.name = `life_${stock.id}`;
  group.position.set(stock.x, surfaceAt(world, Math.floor(stock.x), Math.floor(stock.z)), stock.z);
  group.userData.stockpileId = stock.id;
  group.userData.capacity = stock.capacity;
  group.userData.inspectTarget = { x: 0, y: 1.5, z: -0.4 };
  group.add(stockpileFrame());
  const resources = stockpileResources(stock);
  const empty = new THREE4.Object3D();
  empty.name = "stockpile_empty";
  empty.visible = resources === null;
  group.userData.empty = resources === null;
  group.add(empty);
  if (resources) group.add(resources);
  return group;
}
function plant(parts, x, y, z, height, spread, colour, crown) {
  const stem = new THREE4.CylinderGeometry(0.025, 0.04, height, 5);
  stem.translate(x, y + height / 2, z);
  parts.push(paint2(stem, colour));
  for (const side of [-1, 1]) {
    const leaf = new THREE4.OctahedronGeometry(0.1, 0);
    leaf.scale(1.6, 0.45, 0.8);
    leaf.rotateZ(side * 0.55);
    leaf.translate(x + side * spread * 0.45, y + height * 0.52, z);
    parts.push(paint2(leaf, colour));
  }
  if (height > 0.5) {
    const head = new THREE4.DodecahedronGeometry(0.1, 0);
    head.scale(0.85, 1.35, 0.85);
    head.translate(x, y + height, z);
    parts.push(paint2(head, crown));
  }
}
function cropGeometry(row, crop, tick) {
  const parts = [];
  if (!crop) {
    parts.push(box3(row.w, 0.07, row.d * 0.72, row.x, row.y, row.z, SOIL));
    const clods = Math.max(3, Math.round(row.w / 1.5));
    for (let i = 0; i < clods; i++) {
      const clod = new THREE4.DodecahedronGeometry(0.085, 0);
      clod.scale(1.4, 0.45, 0.8);
      clod.translate(row.x - row.w / 2 + row.w * (i + 0.5) / clods, row.y + 0.075, row.z);
      parts.push(paint2(clod, i % 2 ? SOIL_EDGE : SOIL));
    }
  } else {
    const progress = THREE4.MathUtils.clamp(
      (tick - crop.plantedTick) / crop.growthTicks,
      0,
      1
    );
    const ready = progress >= 1;
    const stage = ready ? 3 : Math.floor(progress * 3);
    const height = 0.14 + stage * 0.09;
    const count = Math.max(3, Math.round(row.w / 0.9));
    for (let i = 0; i < count; i++) {
      const x = row.x - row.w / 2 + row.w * (i + 0.5) / count;
      const z = row.z + (i % 2 === 0 ? -0.025 : 0.025);
      plant(
        parts,
        x,
        row.y,
        z,
        height,
        row.d * 0.4,
        ready ? GOLD : stage === 0 ? GREEN_LIGHT : GREEN2,
        ready ? GOLD_LIGHT : GREEN_LIGHT
      );
    }
  }
  const geometry = mergeGeometries3(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error(`could not merge life crop row ${row.x},${row.z}`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
function cropRows(world) {
  const structures = [...world.structures.values()].filter((structure) => structure.kind === "terrace").sort((a, b) => a.id.localeCompare(b.id));
  const source = structures.find((structure) => structure.designVersion === 2) ?? structures[0];
  return source?.modules.filter((module) => module.kind === "crop_row") ?? [];
}
function buildLifeMeshes(world) {
  const group = new THREE4.Group();
  group.name = "life_state";
  group.userData.schema = 3;
  if (!world.life) return group;
  const life = world.life;
  for (const stock of [...life.stockpiles.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    group.add(buildStockpile(world, stock));
  }
  const rows = cropRows(world);
  for (let index = 0; index < Math.min(rows.length, 9); index++) {
    const id2 = `crop:${index}`;
    const crop = life.crops.get(id2);
    const ready = crop !== void 0 && tickReady(crop, life.tick);
    const plot = new THREE4.Mesh(cropGeometry(rows[index], crop, life.tick), LIFE_MATERIAL);
    plot.name = `life_${id2}`;
    plot.castShadow = crop !== void 0;
    plot.receiveShadow = true;
    plot.userData.cropId = id2;
    plot.userData.state = !crop ? "empty" : ready ? "ready" : "sprout";
    plot.userData.plantedTick = crop?.plantedTick;
    plot.userData.growthTicks = crop?.growthTicks;
    plot.userData.tick = life.tick;
    plot.userData.inspectTarget = {
      x: rows[index].x,
      y: rows[index].y + Math.max(0.12, rows[index].h / 2),
      z: rows[index].z
    };
    group.add(plot);
  }
  return group;
}
function tickReady(crop, tick) {
  return tick - crop.plantedTick >= crop.growthTicks;
}

// src/render/structures.ts
import * as THREE5 from "three";
import { mergeGeometries as mergeGeometries4 } from "three/examples/jsm/utils/BufferGeometryUtils.js";
var M4 = palette_default.materials;
var H4 = (k) => M4[k].hex;
var TONE = {
  stone: H4("noxel_stone"),
  stone_b: H4("noxel_stone_b"),
  timber: H4("bark_dark"),
  ochre: H4("strata_ochre"),
  accent: H4("accent_blue"),
  gravel: new THREE5.Color(H4("stone_body_b")).lerp(new THREE5.Color(H4("sand")), 0.35).getHexString().padStart(6, "0"),
  soil: H4("strata_ochre"),
  crop: H4("canopy_green_a")
};
function toneColour(tone) {
  const raw = tone && TONE[tone] || TONE.stone;
  return raw.startsWith("#") ? raw : `#${raw}`;
}
var STRUCTURE_MATERIAL = new THREE5.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true
});
var CROP_MATERIAL = new THREE5.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true
});
function paint3(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute("uv");
  const colour = new THREE5.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = colour.r;
    arr[i * 3 + 1] = colour.g;
    arr[i * 3 + 2] = colour.b;
  }
  g.setAttribute("color", new THREE5.BufferAttribute(arr, 3));
  return g;
}
function structureAnchor(structure, height) {
  const bounds = new THREE5.Box3();
  const point = new THREE5.Vector3();
  for (const m of structure.modules) {
    const extent = Math.hypot(m.w, m.d) / 2;
    bounds.expandByPoint(point.set(m.x - extent, m.y, m.z - extent));
    bounds.expandByPoint(point.set(m.x + extent, m.y + m.h + height, m.z + extent));
  }
  const centre = bounds.getCenter(new THREE5.Vector3());
  return { x: centre.x, y: centre.y + height / 2, z: centre.z };
}
function moduleGeometry(m, designVersion) {
  if (m.kind === "crop_row" && designVersion === 2) return cropGeometry2(m);
  const g = new THREE5.BoxGeometry(m.w, m.h, m.d);
  if (m.rot) g.rotateY(m.rot);
  g.translate(m.x, m.y + m.h / 2, m.z);
  return paint3(g, toneColour(m.tone));
}
function cropGeometry2(m) {
  const leaves = [];
  const count = Math.max(3, Math.round(m.w / 1.2));
  const sides = 5;
  const radius = Math.min(m.d / 2 - 0.035, m.w / count / 2);
  for (let i = 0; i < count; i++) {
    const cx = m.x - m.w / 2 + m.w * (i + 0.5) / count;
    const cz = m.z + (i % 2 === 0 ? -0.035 : 0.035);
    const top = m.y + m.h * (i % 3 === 0 ? 1 : 0.82);
    const shoulder = m.y + m.h * 0.46;
    const pos = [];
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    const outerPoint = (k) => {
      const angle = k % sides * 2 * Math.PI / sides;
      return [cx + Math.cos(angle) * radius, shoulder, cz + Math.sin(angle) * radius];
    };
    for (let k = 0; k < sides; k++) {
      const a = outerPoint(k), b = outerPoint(k + 1);
      tri([cx, m.y, cz], b, a);
      tri(a, b, [cx, top, cz]);
    }
    const g = new THREE5.BufferGeometry();
    g.setAttribute("position", new THREE5.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    leaves.push(paint3(g, toneColour(m.tone)));
  }
  const merged = mergeGeometries4(leaves, false);
  for (const leaf of leaves) leaf.dispose();
  if (!merged) throw new Error("could not merge crop-row presentation");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
function buildStructureMesh(structure) {
  if (structure.designVersion === 2 && structure.kind === "terrace") {
    const group = new THREE5.Group();
    group.name = `structure_${structure.kind}`;
    group.userData.structureId = structure.id;
    group.userData.inspectTarget = structureAnchor(structure, 0.6);
    const earth = buildStructureMesh({
      ...structure,
      designVersion: void 0,
      modules: structure.modules.filter((m) => m.kind !== "crop_row")
    });
    if (!(earth instanceof THREE5.Mesh)) throw new Error("unexpected terrace group");
    group.add(earth);
    const parts2 = structure.modules.filter((m) => m.kind === "crop_row").map(cropGeometry2);
    const merged2 = mergeGeometries4(parts2, false);
    for (const part of parts2) part.dispose();
    if (!merged2) throw new Error(`could not merge crop rows ${structure.id}`);
    const foliage = new THREE5.Mesh(merged2, CROP_MATERIAL);
    foliage.name = "crop_row_foliage";
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    foliage.userData.presentationBounds = structure.modules.filter((m) => m.kind === "crop_row").length;
    group.add(foliage);
    return group;
  }
  const parts = structure.modules.map((m) => moduleGeometry(m, structure.designVersion));
  const merged = mergeGeometries4(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error(`could not merge structure ${structure.id}`);
  const mesh2 = new THREE5.Mesh(merged, STRUCTURE_MATERIAL);
  mesh2.name = `structure_${structure.kind}`;
  mesh2.castShadow = true;
  mesh2.receiveShadow = true;
  mesh2.userData.structureId = structure.id;
  mesh2.userData.inspectTarget = structureAnchor(structure, structure.kind === "house" ? 0.6 : 0.3);
  return mesh2;
}

// tests/m003.inspection.test.ts
var ALL_KINDS = [
  "styl_tree_spire",
  "styl_tree_table",
  "styl_tree_cluster",
  "styl_tree_blossom",
  "styl_shrub",
  "styl_ore",
  "styl_cairn",
  "waystone",
  "marker"
];
var RETIRED_KINDS = ["styl_rock_small", "styl_rock_medium", "styl_rock_large"];
test("every retained entity kind has a distinct identity; all retired stones are absent", () => {
  assert.equal(Object.keys(INSPECTION_CATALOG).length, ALL_KINDS.length);
  for (const kind of ALL_KINDS) {
    assert.ok(INSPECTION_CATALOG[kind].name.length > 2);
    assert.ok(INSPECTION_CATALOG[kind].description.length > 30);
  }
  const session = GameSession.genesis();
  assert.equal([...session.world.entities.values()].some((entity) => isRetiredStoneKind(entity.kind)), false);
  for (const kind of RETIRED_KINDS) {
    assert.ok(isRetiredStoneKind(kind));
    assert.equal(INSPECTION_CATALOG[kind], void 0);
  }
  const hashes = [];
  for (const kind of ALL_KINDS.filter((kind2) => kind2.startsWith("styl_"))) {
    const entity = [...session.world.entities.values()].find((entity2) => entity2.kind === kind);
    assert.ok(entity, kind);
    const info = resolveInspection(session.world, { entityId: entity.id });
    assert.equal(info.name, INSPECTION_CATALOG[kind].name);
    assert.equal(info.category, "Natural resource");
    hashes.push(canonicalWorldHash(session.world, session.nextSequence, 3));
    assert.match(
      info.facts.find((fact) => fact.label === "Remaining").value,
      new RegExp(`^${entity.remaining} \xB7 `)
    );
    entity.harvested = true;
    assert.equal(resolveInspection(session.world, { entityId: entity.id }), null);
    entity.harvested = false;
    hashes.push(canonicalWorldHash(session.world, session.nextSequence, 3));
  }
  assert.ok(hashes.every((hash) => hash === hashes[0]));
  assert.equal(session.world.revision, 0);
  assert.deepEqual(session.world.inventory, { stone: 48, wood: 24 });
});
test("natural batches preserve authoritative IDs and keyboard anchors inside a stable wrapper", () => {
  const session = GameSession.genesis();
  const result = buildNoxelNature(session.world);
  const scene = new THREE6.Scene();
  const wrapper = new THREE6.Group();
  wrapper.add(result.group);
  scene.add(wrapper);
  const batch = result.group.children[0];
  assert.ok(batch.isBatchedMesh);
  const ids = batch.userData.inspectableBatchIds;
  assert.equal(ids.length, result.instances);
  assert.equal(new Set(ids).size, ids.length);
  for (const id2 of ids) {
    assert.deepEqual(inspectionRef(batch, batch.userData.inspectableBatchIds.indexOf(id2)), { entityId: id2 });
    const entity = session.world.entities.get(id2);
    assert.equal(entity.harvested, false);
  }
  assert.equal(session.world.entities.has("hero:styl_rock_medium:-6:-10"), false);
  assert.equal(ids.some((id2) => isRetiredStoneKind(session.world.entities.get(id2).kind)), false);
  assert.equal(inspectionRef(batch), null);
  assert.equal(resolveInspection(session.world, { entityId: "hero:styl_rock_medium:-6:-10" }), null);
  const controller = bareInspector(session, scene, wrapper);
  const targets = controller.metrics().targets;
  assert.equal(Object.keys(targets).length, result.instances);
  const ore = session.world.entities.get("hero:styl_ore:-38:-42");
  assert.equal(
    targets["entityId:hero:styl_ore:-38:-42"].y,
    ore.y + 0.65 * ore.scale,
    "ore tap target is on the block mass, below its tallest corner"
  );
  assert.equal(targets["entityId:hero:styl_ore:-38:-42"].name, "Purple-seam ore deposit");
  wrapper.visible = false;
  assert.equal(visibleInHierarchy(batch, scene), false);
  wrapper.visible = true;
  assert.equal(visibleInHierarchy(batch, scene), true);
});
test("landmarks, provisional kit, founder architecture, stockpile and crops expose stable identities", () => {
  const session = GameSession.genesis();
  for (const site of session.world.sites) {
    const mesh3 = buildNoxelSite(site);
    assert.deepEqual(inspectionRef(mesh3), { siteId: site.id });
    assert.deepEqual(objectTarget(mesh3)?.toArray(), [site.x, site.y - 0.12 + (site.kind === "waystone" ? 3.2 : 1.8), site.z]);
    assert.equal(resolveInspection(session.world, { siteId: site.id })?.category, "Architecture \xB7 landmark");
  }
  for (const mesh3 of buildKit()) {
    const ref = inspectionRef(mesh3);
    assert.ok(ref && "kitId" in ref);
    assert.equal(resolveInspection(session.world, ref)?.category, "Architecture \xB7 provisional kit");
  }
  const build = session.dispatch({
    schema: 3,
    id: "inspect-farm",
    type: "build",
    projectId: "farm",
    designVersion: 2,
    expectedRevision: session.world.revision
  });
  assert.equal(build.ok, true, JSON.stringify(build));
  const structure = [...session.world.structures.values()][0];
  const mesh2 = buildStructureMesh(structure);
  assert.deepEqual(inspectionRef(mesh2), { structureId: structure.id });
  assert.ok(objectTarget(mesh2));
  const structureInfo = resolveInspection(session.world, { structureId: structure.id });
  assert.equal(structureInfo.name, "Terraced field");
  const footprint = structureInfo.facts.find((fact) => fact.label === "Footprint")?.value;
  assert.equal(footprint, `${Math.max(...structure.modules.map((m) => m.x + m.w / 2)) - Math.min(...structure.modules.map((m) => m.x - m.w / 2))} \xD7 ${Math.max(...structure.modules.map((m) => m.z + m.d / 2)) - Math.min(...structure.modules.map((m) => m.z - m.d / 2))} m`);
  const life = buildLifeMeshes(session.world);
  const stock = life.children.find((child) => child.userData.stockpileId === FOUNDER_STOCKPILE_ID);
  assert.equal(objectTarget(stock)?.y, stock.position.y + 1.5);
  const crops = life.children.filter((child) => child.userData.cropId);
  assert.equal(crops.length, 9);
  for (const crop of crops) assert.equal(resolveInspection(session.world, inspectionRef(crop))?.facts[0].value, "Empty \xB7 needs 1 seed");
});
test("stockpile and crop cards read live quantities and readiness without mutating either", () => {
  const session = GameSession.genesis();
  const stock = session.world.life.stockpiles.get(FOUNDER_STOCKPILE_ID);
  stock.inventory = { wood: 4, fiber: 2, stone: 3 };
  const stockInfo = resolveInspection(session.world, { stockpileId: FOUNDER_STOCKPILE_ID });
  assert.equal(stockInfo.name, "Founder stockpile");
  assert.equal(stockInfo.facts[0].value, "9 / 200");
  assert.equal(stockInfo.facts[1].value, "2 fiber \xB7 3 stone \xB7 4 wood");
  assert.equal(resolveInspection(session.world, { cropId: "crop:0" }), null);
  assert.equal(resolveInspection(session.world, { cropId: "crop:9" }), null);
  session.dispatch({
    schema: 3,
    id: "inspect-farm-live",
    type: "build",
    projectId: "farm",
    designVersion: 2,
    expectedRevision: session.world.revision
  });
  const life = session.world.life;
  life.crops.set("crop:0", { id: "crop:0", plantedTick: 1, growthTicks: 4 });
  life.tick = 4;
  const growing = resolveInspection(session.world, { cropId: "crop:0" });
  assert.equal(growing.facts[0].value, "Growing");
  assert.equal(growing.facts[2].value, "3 / 4 ticks");
  life.tick = 5;
  const ready = resolveInspection(session.world, { cropId: "crop:0" });
  assert.equal(ready.facts[0].value, "Ready to harvest");
  assert.equal(ready.facts[1].value, "6 food + 1 fiber when harvested");
  const revisionBefore = session.world.revision;
  const hash = canonicalWorldHash(session.world, session.nextSequence, 3);
  assert.equal(canonicalWorldHash(session.world, session.nextSequence, 3), hash);
  assert.equal(session.world.revision, revisionBefore);
});
test("opaque terrain blocks deeper targets and parent decoration inherits one owner", () => {
  const session = GameSession.genesis();
  const scene = new THREE6.Scene();
  const root = new THREE6.Group();
  scene.add(root);
  const site = session.world.sites[0];
  const landmark = buildNoxelSite(site);
  landmark.position.set(0, 0, 0);
  root.add(landmark);
  const terrain = new THREE6.Mesh(new THREE6.BoxGeometry(10, 10, 0.2));
  terrain.position.set(0, 0, 3);
  scene.add(terrain);
  const camera = new THREE6.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const panel = {
    renderList() {
    },
    setVisible() {
    },
    show() {
    },
    hideCard() {
    },
    setListVisible() {
    },
    isListVisible() {
      return false;
    },
    pinnedKey() {
      return null;
    },
    focusCard() {
    },
    focusList() {
    }
  };
  const controller = new SceneInspector({
    world: session.world,
    scene,
    camera,
    canvas: {
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 100, height: 100 };
      },
      addEventListener() {
      },
      tabIndex: 0,
      setAttribute() {
      }
    },
    terrain
  }, panel);
  const pick = controller.pick.bind(controller);
  controller.addRoot(root);
  scene.updateMatrixWorld(true);
  assert.equal(pick(50, 50), null);
  terrain.position.z = 13;
  scene.updateMatrixWorld(true);
  assert.deepEqual(pick(50, 50), { siteId: site.id });
  root.visible = false;
  assert.equal(pick(50, 50), null);
  const child = landmark.children[0];
  assert.deepEqual(identifiedRef(child), { siteId: site.id });
  assert.equal(
    canonicalWorldHash(session.world, session.nextSequence, 3),
    canonicalWorldHash(session.world, session.nextSequence, 3)
  );
});
test("terrace soil cannot hide its authoritative crop row from a real ray", () => {
  const session = GameSession.genesis();
  const result = session.dispatch({
    schema: 3,
    id: "inspect-crop-ray",
    type: "build",
    projectId: "farm",
    designVersion: 2,
    expectedRevision: session.world.revision
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const scene = new THREE6.Scene();
  const root = new THREE6.Group();
  scene.add(root);
  const structure = [...session.world.structures.values()][0];
  root.add(buildStructureMesh(structure));
  buildLifeMeshes(session.world).children.filter((child) => child.userData.cropId).forEach((child) => root.add(child));
  const row = structure.modules.find((module) => module.kind === "crop_row");
  const camera = new THREE6.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(row.x, row.y + 10, row.z + 10);
  camera.lookAt(row.x, row.y + row.h / 2, row.z);
  camera.updateMatrixWorld();
  const panel = {
    renderList() {
    },
    setVisible() {
    },
    show() {
    },
    hideCard() {
    },
    setListVisible() {
    },
    isListVisible() {
      return false;
    },
    pinnedKey() {
      return null;
    },
    focusCard() {
    },
    focusList() {
    }
  };
  const terrain = new THREE6.Group();
  scene.add(terrain);
  const controller = new SceneInspector({
    world: session.world,
    scene,
    camera,
    canvas: {
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 100, height: 100 };
      },
      addEventListener() {
      },
      tabIndex: 0,
      setAttribute() {
      }
    },
    terrain
  }, panel);
  controller.addRoot(root);
  scene.updateMatrixWorld(true);
  const pick = controller.pick.bind(controller);
  assert.deepEqual(pick(50, 50), { cropId: "crop:0" });
  const blocker = new THREE6.Mesh(new THREE6.BoxGeometry(10, 10, 0.1));
  blocker.position.copy(camera.position).lerp(new THREE6.Vector3(row.x, row.y, row.z), 0.5);
  blocker.quaternion.copy(camera.quaternion);
  terrain.add(blocker);
  scene.updateMatrixWorld(true);
  assert.equal(pick(50, 50), null, "nearer opaque terrain still blocks crop selection");
});
function bareInspector(session, scene, root) {
  const controller = Object.create(SceneInspector.prototype);
  controller.options = { world: session.world, scene };
  controller.roots = /* @__PURE__ */ new Set([root]);
  controller.targetCache = {};
  controller.panel = { renderList() {
  } };
  controller.refreshTargets();
  return controller;
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMy5pbnNwZWN0aW9uLnRlc3QudHMiLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3NpbS9jb25zdHJ1Y3Rpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9wcmVwYXJhdGlvbi50cyIsICIuLi8uLi9zcmMvc2ltL3N0cnVjdHVyZXMudHMiLCAiLi4vLi4vc3JjL3NpbS9jYW5vbmljYWwudHMiLCAiLi4vLi4vc3JjL3NpbS9tMDAyLnRzIiwgIi4uLy4uL3NyYy9zaW0vc2NlbmFyaW8udHMiLCAiLi4vLi4vc3JjL3NpbS9lY29ub215LnRzIiwgIi4uLy4uL3NyYy9zaW0vc25hcHNob3QudHMiLCAiLi4vLi4vc3JjL2FwcC9wcm9qZWN0cy50cyIsICIuLi8uLi9zcmMvYXBwL3Nlc3Npb24udHMiLCAiLi4vLi4vc3JjL2FwcC9pbnNwZWN0aW9uLnRzIiwgIi4uLy4uL3NyYy9hcHAvaW5zcGVjdG9yLnRzIiwgIi4uLy4uL3NyYy91aS9pbnNwZWN0b3IudHMiLCAiLi4vLi4vc3JjL3JlbmRlci9uYXR1cmUudHMiLCAiLi4vLi4vc3JjL2RhdGEvcGFsZXR0ZS5qc29uIiwgIi4uLy4uL3NyYy9yZW5kZXIvbm94ZWwudHMiLCAiLi4vLi4vc3JjL3JlbmRlci9saWZlLnRzIiwgIi4uLy4uL3NyYy9yZW5kZXIvc3RydWN0dXJlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gSWRlbnRpdHkgYW5kIHJheWNhc3QgY292ZXJhZ2UuIEJyb3dzZXIgcG9pbnRlci9VSSBiZWhhdmlvciBpcyB2ZXJpZmllZFxuLy8gc2VwYXJhdGVseSBhZ2FpbnN0IHRoZSBwcm9kdWN0aW9uIGJ1bmRsZTsgbm8gc3ludGhldGljIHJlbmRlcmVyIGhpdCBpcyBjYWxsZWRcbi8vIHByb29mIG9mIGEgdXNhYmxlIGhvdmVyIG9yIHRvdWNoIGludGVyYWN0aW9uLlxuaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCB7IEdhbWVTZXNzaW9uIH0gZnJvbSAnLi4vc3JjL2FwcC9zZXNzaW9uJztcbmltcG9ydCB7XG4gIElOU1BFQ1RJT05fQ0FUQUxPRywgaW5zcGVjdGlvblJlZiwgcmVzb2x2ZUluc3BlY3Rpb24sXG59IGZyb20gJy4uL3NyYy9hcHAvaW5zcGVjdGlvbic7XG5pbXBvcnQge1xuICBTY2VuZUluc3BlY3RvciwgaWRlbnRpZmllZFJlZiwgb2JqZWN0VGFyZ2V0LCB2aXNpYmxlSW5IaWVyYXJjaHksXG59IGZyb20gJy4uL3NyYy9hcHAvaW5zcGVjdG9yJztcbmltcG9ydCB7IEluc3BlY3RvclBhbmVsIH0gZnJvbSAnLi4vc3JjL3VpL2luc3BlY3Rvcic7XG5pbXBvcnQgeyBidWlsZE5veGVsTmF0dXJlIH0gZnJvbSAnLi4vc3JjL3JlbmRlci9uYXR1cmUnO1xuaW1wb3J0IHsgYnVpbGRLaXQsIGJ1aWxkTm94ZWxTaXRlIH0gZnJvbSAnLi4vc3JjL3JlbmRlci9ub3hlbCc7XG5pbXBvcnQgeyBidWlsZExpZmVNZXNoZXMgfSBmcm9tICcuLi9zcmMvcmVuZGVyL2xpZmUnO1xuaW1wb3J0IHsgYnVpbGRTdHJ1Y3R1cmVNZXNoIH0gZnJvbSAnLi4vc3JjL3JlbmRlci9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7IEZPVU5ERVJfU1RPQ0tQSUxFX0lEIH0gZnJvbSAnLi4vc3JjL3NpbS9lY29ub215JztcbmltcG9ydCB7IGNhbm9uaWNhbFdvcmxkSGFzaCB9IGZyb20gJy4uL3NyYy9zaW0vc25hcHNob3QnO1xuaW1wb3J0IHsgRW50aXR5S2luZCwgaXNSZXRpcmVkU3RvbmVLaW5kIH0gZnJvbSAnLi4vc3JjL3NpbS93b3JsZCc7XG5cbmNvbnN0IEFMTF9LSU5EUzogRW50aXR5S2luZFtdID0gW1xuICAnc3R5bF90cmVlX3NwaXJlJywgJ3N0eWxfdHJlZV90YWJsZScsICdzdHlsX3RyZWVfY2x1c3RlcicsICdzdHlsX3RyZWVfYmxvc3NvbScsXG4gICdzdHlsX3NocnViJywgJ3N0eWxfb3JlJywgJ3N0eWxfY2Fpcm4nLCAnd2F5c3RvbmUnLCAnbWFya2VyJyxcbl07XG5jb25zdCBSRVRJUkVEX0tJTkRTID0gWydzdHlsX3JvY2tfc21hbGwnLCAnc3R5bF9yb2NrX21lZGl1bScsICdzdHlsX3JvY2tfbGFyZ2UnXSBhcyBjb25zdDtcblxudGVzdCgnZXZlcnkgcmV0YWluZWQgZW50aXR5IGtpbmQgaGFzIGEgZGlzdGluY3QgaWRlbnRpdHk7IGFsbCByZXRpcmVkIHN0b25lcyBhcmUgYWJzZW50JywgKCkgPT4ge1xuICBhc3NlcnQuZXF1YWwoT2JqZWN0LmtleXMoSU5TUEVDVElPTl9DQVRBTE9HKS5sZW5ndGgsIEFMTF9LSU5EUy5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IGtpbmQgb2YgQUxMX0tJTkRTKSB7XG4gICAgYXNzZXJ0Lm9rKElOU1BFQ1RJT05fQ0FUQUxPR1traW5kXS5uYW1lLmxlbmd0aCA+IDIpO1xuICAgIGFzc2VydC5vayhJTlNQRUNUSU9OX0NBVEFMT0dba2luZF0uZGVzY3JpcHRpb24ubGVuZ3RoID4gMzApO1xuICB9XG4gIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5nZW5lc2lzKCk7XG4gIGFzc2VydC5lcXVhbChbLi4uc2Vzc2lvbi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSwgZmFsc2UpO1xuICBmb3IgKGNvbnN0IGtpbmQgb2YgUkVUSVJFRF9LSU5EUykge1xuICAgIGFzc2VydC5vayhpc1JldGlyZWRTdG9uZUtpbmQoa2luZCkpO1xuICAgIGFzc2VydC5lcXVhbChJTlNQRUNUSU9OX0NBVEFMT0dba2luZCBhcyBrZXlvZiB0eXBlb2YgSU5TUEVDVElPTl9DQVRBTE9HXSwgdW5kZWZpbmVkKTtcbiAgfVxuICBjb25zdCBoYXNoZXM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3Qga2luZCBvZiBBTExfS0lORFMuZmlsdGVyKChraW5kKSA9PiBraW5kLnN0YXJ0c1dpdGgoJ3N0eWxfJykpKSB7XG4gICAgY29uc3QgZW50aXR5ID0gWy4uLnNlc3Npb24ud29ybGQuZW50aXRpZXMudmFsdWVzKCldLmZpbmQoKGVudGl0eSkgPT4gZW50aXR5LmtpbmQgPT09IGtpbmQpO1xuICAgIGFzc2VydC5vayhlbnRpdHksIGtpbmQpO1xuICAgIGNvbnN0IGluZm8gPSByZXNvbHZlSW5zcGVjdGlvbihzZXNzaW9uLndvcmxkLCB7IGVudGl0eUlkOiBlbnRpdHkuaWQgfSkhO1xuICAgIGFzc2VydC5lcXVhbChpbmZvLm5hbWUsIElOU1BFQ1RJT05fQ0FUQUxPR1traW5kXS5uYW1lKTtcbiAgICBhc3NlcnQuZXF1YWwoaW5mby5jYXRlZ29yeSwgJ05hdHVyYWwgcmVzb3VyY2UnKTtcbiAgICBoYXNoZXMucHVzaChjYW5vbmljYWxXb3JsZEhhc2goc2Vzc2lvbi53b3JsZCwgc2Vzc2lvbi5uZXh0U2VxdWVuY2UsIDMpKTtcbiAgICBhc3NlcnQubWF0Y2goaW5mby5mYWN0cy5maW5kKChmYWN0KSA9PiBmYWN0LmxhYmVsID09PSAnUmVtYWluaW5nJykhLnZhbHVlLFxuICAgICAgbmV3IFJlZ0V4cChgXiR7ZW50aXR5LnJlbWFpbmluZ30gXHUwMEI3IGApKTtcbiAgICBlbnRpdHkuaGFydmVzdGVkID0gdHJ1ZTtcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZUluc3BlY3Rpb24oc2Vzc2lvbi53b3JsZCwgeyBlbnRpdHlJZDogZW50aXR5LmlkIH0pLCBudWxsKTtcbiAgICBlbnRpdHkuaGFydmVzdGVkID0gZmFsc2U7XG4gICAgaGFzaGVzLnB1c2goY2Fub25pY2FsV29ybGRIYXNoKHNlc3Npb24ud29ybGQsIHNlc3Npb24ubmV4dFNlcXVlbmNlLCAzKSk7XG4gIH1cbiAgYXNzZXJ0Lm9rKGhhc2hlcy5ldmVyeSgoaGFzaCkgPT4gaGFzaCA9PT0gaGFzaGVzWzBdKSk7XG4gIGFzc2VydC5lcXVhbChzZXNzaW9uLndvcmxkLnJldmlzaW9uLCAwKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChzZXNzaW9uLndvcmxkLmludmVudG9yeSwgeyBzdG9uZTogNDgsIHdvb2Q6IDI0IH0pO1xufSk7XG5cbnRlc3QoJ25hdHVyYWwgYmF0Y2hlcyBwcmVzZXJ2ZSBhdXRob3JpdGF0aXZlIElEcyBhbmQga2V5Ym9hcmQgYW5jaG9ycyBpbnNpZGUgYSBzdGFibGUgd3JhcHBlcicsICgpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IEdhbWVTZXNzaW9uLmdlbmVzaXMoKTtcbiAgY29uc3QgcmVzdWx0ID0gYnVpbGROb3hlbE5hdHVyZShzZXNzaW9uLndvcmxkKTtcbiAgY29uc3Qgc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgY29uc3Qgd3JhcHBlciA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICB3cmFwcGVyLmFkZChyZXN1bHQuZ3JvdXApO1xuICBzY2VuZS5hZGQod3JhcHBlcik7XG4gIGNvbnN0IGJhdGNoID0gcmVzdWx0Lmdyb3VwLmNoaWxkcmVuWzBdIGFzIFRIUkVFLkJhdGNoZWRNZXNoO1xuICBhc3NlcnQub2soYmF0Y2guaXNCYXRjaGVkTWVzaCk7XG4gIGNvbnN0IGlkcyA9IGJhdGNoLnVzZXJEYXRhLmluc3BlY3RhYmxlQmF0Y2hJZHMgYXMgc3RyaW5nW107XG4gIGFzc2VydC5lcXVhbChpZHMubGVuZ3RoLCByZXN1bHQuaW5zdGFuY2VzKTtcbiAgYXNzZXJ0LmVxdWFsKG5ldyBTZXQoaWRzKS5zaXplLCBpZHMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICBhc3NlcnQuZGVlcEVxdWFsKGluc3BlY3Rpb25SZWYoYmF0Y2gsIGJhdGNoLnVzZXJEYXRhLmluc3BlY3RhYmxlQmF0Y2hJZHMuaW5kZXhPZihpZCkpLCB7IGVudGl0eUlkOiBpZCB9KTtcbiAgICBjb25zdCBlbnRpdHkgPSBzZXNzaW9uLndvcmxkLmVudGl0aWVzLmdldChpZCkhO1xuICAgIGFzc2VydC5lcXVhbChlbnRpdHkuaGFydmVzdGVkLCBmYWxzZSk7XG4gIH1cbiAgYXNzZXJ0LmVxdWFsKHNlc3Npb24ud29ybGQuZW50aXRpZXMuaGFzKCdoZXJvOnN0eWxfcm9ja19tZWRpdW06LTY6LTEwJyksIGZhbHNlKTtcbiAgYXNzZXJ0LmVxdWFsKGlkcy5zb21lKChpZCkgPT4gaXNSZXRpcmVkU3RvbmVLaW5kKHNlc3Npb24ud29ybGQuZW50aXRpZXMuZ2V0KGlkKSEua2luZCkpLCBmYWxzZSk7XG4gIGFzc2VydC5lcXVhbChpbnNwZWN0aW9uUmVmKGJhdGNoKSwgbnVsbCk7XG4gIGFzc2VydC5lcXVhbChyZXNvbHZlSW5zcGVjdGlvbihzZXNzaW9uLndvcmxkLCB7IGVudGl0eUlkOiAnaGVybzpzdHlsX3JvY2tfbWVkaXVtOi02Oi0xMCcgfSksIG51bGwpO1xuXG4gIGNvbnN0IGNvbnRyb2xsZXIgPSBiYXJlSW5zcGVjdG9yKHNlc3Npb24sIHNjZW5lLCB3cmFwcGVyKTtcbiAgY29uc3QgdGFyZ2V0cyA9IGNvbnRyb2xsZXIubWV0cmljcygpLnRhcmdldHM7XG4gIGFzc2VydC5lcXVhbChPYmplY3Qua2V5cyh0YXJnZXRzKS5sZW5ndGgsIHJlc3VsdC5pbnN0YW5jZXMpO1xuICBjb25zdCBvcmUgPSBzZXNzaW9uLndvcmxkLmVudGl0aWVzLmdldCgnaGVybzpzdHlsX29yZTotMzg6LTQyJykhO1xuICBhc3NlcnQuZXF1YWwodGFyZ2V0c1snZW50aXR5SWQ6aGVybzpzdHlsX29yZTotMzg6LTQyJ10ueSwgb3JlLnkgKyAwLjY1ICogb3JlLnNjYWxlLFxuICAgICdvcmUgdGFwIHRhcmdldCBpcyBvbiB0aGUgYmxvY2sgbWFzcywgYmVsb3cgaXRzIHRhbGxlc3QgY29ybmVyJyk7XG4gIGFzc2VydC5lcXVhbCh0YXJnZXRzWydlbnRpdHlJZDpoZXJvOnN0eWxfb3JlOi0zODotNDInXS5uYW1lLCAnUHVycGxlLXNlYW0gb3JlIGRlcG9zaXQnKTtcbiAgd3JhcHBlci52aXNpYmxlID0gZmFsc2U7XG4gIGFzc2VydC5lcXVhbCh2aXNpYmxlSW5IaWVyYXJjaHkoYmF0Y2gsIHNjZW5lKSwgZmFsc2UpO1xuICB3cmFwcGVyLnZpc2libGUgPSB0cnVlO1xuICBhc3NlcnQuZXF1YWwodmlzaWJsZUluSGllcmFyY2h5KGJhdGNoLCBzY2VuZSksIHRydWUpO1xufSk7XG5cbnRlc3QoJ2xhbmRtYXJrcywgcHJvdmlzaW9uYWwga2l0LCBmb3VuZGVyIGFyY2hpdGVjdHVyZSwgc3RvY2twaWxlIGFuZCBjcm9wcyBleHBvc2Ugc3RhYmxlIGlkZW50aXRpZXMnLCAoKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5nZW5lc2lzKCk7XG4gIGZvciAoY29uc3Qgc2l0ZSBvZiBzZXNzaW9uLndvcmxkLnNpdGVzKSB7XG4gICAgY29uc3QgbWVzaCA9IGJ1aWxkTm94ZWxTaXRlKHNpdGUpO1xuICAgIGFzc2VydC5kZWVwRXF1YWwoaW5zcGVjdGlvblJlZihtZXNoKSwgeyBzaXRlSWQ6IHNpdGUuaWQgfSk7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChvYmplY3RUYXJnZXQobWVzaCk/LnRvQXJyYXkoKSwgW3NpdGUueCwgc2l0ZS55IC0gMC4xMiArIChzaXRlLmtpbmQgPT09ICd3YXlzdG9uZScgPyAzLjIgOiAxLjgpLCBzaXRlLnpdKTtcbiAgICBhc3NlcnQuZXF1YWwocmVzb2x2ZUluc3BlY3Rpb24oc2Vzc2lvbi53b3JsZCwgeyBzaXRlSWQ6IHNpdGUuaWQgfSk/LmNhdGVnb3J5LCAnQXJjaGl0ZWN0dXJlIFx1MDBCNyBsYW5kbWFyaycpO1xuICB9XG4gIGZvciAoY29uc3QgbWVzaCBvZiBidWlsZEtpdCgpKSB7XG4gICAgY29uc3QgcmVmID0gaW5zcGVjdGlvblJlZihtZXNoKSE7XG4gICAgYXNzZXJ0Lm9rKHJlZiAmJiAna2l0SWQnIGluIHJlZik7XG4gICAgYXNzZXJ0LmVxdWFsKHJlc29sdmVJbnNwZWN0aW9uKHNlc3Npb24ud29ybGQsIHJlZik/LmNhdGVnb3J5LCAnQXJjaGl0ZWN0dXJlIFx1MDBCNyBwcm92aXNpb25hbCBraXQnKTtcbiAgfVxuICBjb25zdCBidWlsZCA9IHNlc3Npb24uZGlzcGF0Y2goeyBzY2hlbWE6IDMsIGlkOiAnaW5zcGVjdC1mYXJtJywgdHlwZTogJ2J1aWxkJywgcHJvamVjdElkOiAnZmFybScsXG4gICAgZGVzaWduVmVyc2lvbjogMiwgZXhwZWN0ZWRSZXZpc2lvbjogc2Vzc2lvbi53b3JsZC5yZXZpc2lvbiB9KTtcbiAgYXNzZXJ0LmVxdWFsKGJ1aWxkLm9rLCB0cnVlLCBKU09OLnN0cmluZ2lmeShidWlsZCkpO1xuICBjb25zdCBzdHJ1Y3R1cmUgPSBbLi4uc2Vzc2lvbi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXVswXTtcbiAgY29uc3QgbWVzaCA9IGJ1aWxkU3RydWN0dXJlTWVzaChzdHJ1Y3R1cmUpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGluc3BlY3Rpb25SZWYobWVzaCksIHsgc3RydWN0dXJlSWQ6IHN0cnVjdHVyZS5pZCB9KTtcbiAgYXNzZXJ0Lm9rKG9iamVjdFRhcmdldChtZXNoKSk7XG4gIGNvbnN0IHN0cnVjdHVyZUluZm8gPSByZXNvbHZlSW5zcGVjdGlvbihzZXNzaW9uLndvcmxkLCB7IHN0cnVjdHVyZUlkOiBzdHJ1Y3R1cmUuaWQgfSkhO1xuICBhc3NlcnQuZXF1YWwoc3RydWN0dXJlSW5mby5uYW1lLCAnVGVycmFjZWQgZmllbGQnKTtcbiAgY29uc3QgZm9vdHByaW50ID0gc3RydWN0dXJlSW5mby5mYWN0cy5maW5kKChmYWN0KSA9PiBmYWN0LmxhYmVsID09PSAnRm9vdHByaW50Jyk/LnZhbHVlO1xuICBhc3NlcnQuZXF1YWwoZm9vdHByaW50LCBgJHtNYXRoLm1heCguLi5zdHJ1Y3R1cmUubW9kdWxlcy5tYXAoKG0pID0+IG0ueCArIG0udyAvIDIpKSAtIE1hdGgubWluKC4uLnN0cnVjdHVyZS5tb2R1bGVzLm1hcCgobSkgPT4gbS54IC0gbS53IC8gMikpfSBcdTAwRDcgJHtNYXRoLm1heCguLi5zdHJ1Y3R1cmUubW9kdWxlcy5tYXAoKG0pID0+IG0ueiArIG0uZCAvIDIpKSAtIE1hdGgubWluKC4uLnN0cnVjdHVyZS5tb2R1bGVzLm1hcCgobSkgPT4gbS56IC0gbS5kIC8gMikpfSBtYCk7XG4gIGNvbnN0IGxpZmUgPSBidWlsZExpZmVNZXNoZXMoc2Vzc2lvbi53b3JsZCk7XG4gIGNvbnN0IHN0b2NrID0gbGlmZS5jaGlsZHJlbi5maW5kKChjaGlsZCkgPT4gY2hpbGQudXNlckRhdGEuc3RvY2twaWxlSWQgPT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEKSE7XG4gIGFzc2VydC5lcXVhbChvYmplY3RUYXJnZXQoc3RvY2spPy55LCBzdG9jay5wb3NpdGlvbi55ICsgMS41KTtcbiAgY29uc3QgY3JvcHMgPSBsaWZlLmNoaWxkcmVuLmZpbHRlcigoY2hpbGQpID0+IGNoaWxkLnVzZXJEYXRhLmNyb3BJZCk7XG4gIGFzc2VydC5lcXVhbChjcm9wcy5sZW5ndGgsIDkpO1xuICBmb3IgKGNvbnN0IGNyb3Agb2YgY3JvcHMpIGFzc2VydC5lcXVhbChyZXNvbHZlSW5zcGVjdGlvbihzZXNzaW9uLndvcmxkLCBpbnNwZWN0aW9uUmVmKGNyb3ApISk/LmZhY3RzWzBdLnZhbHVlLCAnRW1wdHkgXHUwMEI3IG5lZWRzIDEgc2VlZCcpO1xufSk7XG5cbnRlc3QoJ3N0b2NrcGlsZSBhbmQgY3JvcCBjYXJkcyByZWFkIGxpdmUgcXVhbnRpdGllcyBhbmQgcmVhZGluZXNzIHdpdGhvdXQgbXV0YXRpbmcgZWl0aGVyJywgKCkgPT4ge1xuICBjb25zdCBzZXNzaW9uID0gR2FtZVNlc3Npb24uZ2VuZXNpcygpO1xuICBjb25zdCBzdG9jayA9IHNlc3Npb24ud29ybGQubGlmZSEuc3RvY2twaWxlcy5nZXQoRk9VTkRFUl9TVE9DS1BJTEVfSUQpITtcbiAgc3RvY2suaW52ZW50b3J5ID0geyB3b29kOiA0LCBmaWJlcjogMiwgc3RvbmU6IDMgfTtcbiAgY29uc3Qgc3RvY2tJbmZvID0gcmVzb2x2ZUluc3BlY3Rpb24oc2Vzc2lvbi53b3JsZCwgeyBzdG9ja3BpbGVJZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQgfSkhO1xuICBhc3NlcnQuZXF1YWwoc3RvY2tJbmZvLm5hbWUsICdGb3VuZGVyIHN0b2NrcGlsZScpO1xuICBhc3NlcnQuZXF1YWwoc3RvY2tJbmZvLmZhY3RzWzBdLnZhbHVlLCAnOSAvIDIwMCcpO1xuICBhc3NlcnQuZXF1YWwoc3RvY2tJbmZvLmZhY3RzWzFdLnZhbHVlLCAnMiBmaWJlciBcdTAwQjcgMyBzdG9uZSBcdTAwQjcgNCB3b29kJyk7XG4gIGFzc2VydC5lcXVhbChyZXNvbHZlSW5zcGVjdGlvbihzZXNzaW9uLndvcmxkLCB7IGNyb3BJZDogJ2Nyb3A6MCcgfSksIG51bGwpO1xuICBhc3NlcnQuZXF1YWwocmVzb2x2ZUluc3BlY3Rpb24oc2Vzc2lvbi53b3JsZCwgeyBjcm9wSWQ6ICdjcm9wOjknIH0pLCBudWxsKTtcbiAgc2Vzc2lvbi5kaXNwYXRjaCh7IHNjaGVtYTogMywgaWQ6ICdpbnNwZWN0LWZhcm0tbGl2ZScsIHR5cGU6ICdidWlsZCcsIHByb2plY3RJZDogJ2Zhcm0nLFxuICAgIGRlc2lnblZlcnNpb246IDIsIGV4cGVjdGVkUmV2aXNpb246IHNlc3Npb24ud29ybGQucmV2aXNpb24gfSk7XG4gIGNvbnN0IGxpZmUgPSBzZXNzaW9uLndvcmxkLmxpZmUhO1xuICBsaWZlLmNyb3BzLnNldCgnY3JvcDowJywgeyBpZDogJ2Nyb3A6MCcsIHBsYW50ZWRUaWNrOiAxLCBncm93dGhUaWNrczogNCB9KTtcbiAgbGlmZS50aWNrID0gNDtcbiAgY29uc3QgZ3Jvd2luZyA9IHJlc29sdmVJbnNwZWN0aW9uKHNlc3Npb24ud29ybGQsIHsgY3JvcElkOiAnY3JvcDowJyB9KSE7XG4gIGFzc2VydC5lcXVhbChncm93aW5nLmZhY3RzWzBdLnZhbHVlLCAnR3Jvd2luZycpO1xuICBhc3NlcnQuZXF1YWwoZ3Jvd2luZy5mYWN0c1syXS52YWx1ZSwgJzMgLyA0IHRpY2tzJyk7XG4gIGxpZmUudGljayA9IDU7XG4gIGNvbnN0IHJlYWR5ID0gcmVzb2x2ZUluc3BlY3Rpb24oc2Vzc2lvbi53b3JsZCwgeyBjcm9wSWQ6ICdjcm9wOjAnIH0pITtcbiAgYXNzZXJ0LmVxdWFsKHJlYWR5LmZhY3RzWzBdLnZhbHVlLCAnUmVhZHkgdG8gaGFydmVzdCcpO1xuICBhc3NlcnQuZXF1YWwocmVhZHkuZmFjdHNbMV0udmFsdWUsICc2IGZvb2QgKyAxIGZpYmVyIHdoZW4gaGFydmVzdGVkJyk7XG4gIGNvbnN0IHJldmlzaW9uQmVmb3JlID0gc2Vzc2lvbi53b3JsZC5yZXZpc2lvbjtcbiAgY29uc3QgaGFzaCA9IGNhbm9uaWNhbFdvcmxkSGFzaChzZXNzaW9uLndvcmxkLCBzZXNzaW9uLm5leHRTZXF1ZW5jZSwgMyk7XG4gIGFzc2VydC5lcXVhbChjYW5vbmljYWxXb3JsZEhhc2goc2Vzc2lvbi53b3JsZCwgc2Vzc2lvbi5uZXh0U2VxdWVuY2UsIDMpLCBoYXNoKTtcbiAgYXNzZXJ0LmVxdWFsKHNlc3Npb24ud29ybGQucmV2aXNpb24sIHJldmlzaW9uQmVmb3JlKTtcbn0pO1xuXG50ZXN0KCdvcGFxdWUgdGVycmFpbiBibG9ja3MgZGVlcGVyIHRhcmdldHMgYW5kIHBhcmVudCBkZWNvcmF0aW9uIGluaGVyaXRzIG9uZSBvd25lcicsICgpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IEdhbWVTZXNzaW9uLmdlbmVzaXMoKTtcbiAgY29uc3Qgc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgY29uc3Qgcm9vdCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBzY2VuZS5hZGQocm9vdCk7XG4gIGNvbnN0IHNpdGUgPSBzZXNzaW9uLndvcmxkLnNpdGVzWzBdO1xuICBjb25zdCBsYW5kbWFyayA9IGJ1aWxkTm94ZWxTaXRlKHNpdGUpO1xuICBsYW5kbWFyay5wb3NpdGlvbi5zZXQoMCwgMCwgMCk7XG4gIHJvb3QuYWRkKGxhbmRtYXJrKTtcbiAgY29uc3QgdGVycmFpbiA9IG5ldyBUSFJFRS5NZXNoKG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxMCwgMTAsIDAuMikpO1xuICB0ZXJyYWluLnBvc2l0aW9uLnNldCgwLCAwLCAzKTtcbiAgc2NlbmUuYWRkKHRlcnJhaW4pO1xuICBjb25zdCBjYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoNTAsIDEsIDAuMSwgMTAwKTtcbiAgY2FtZXJhLnBvc2l0aW9uLnNldCgwLCAwLCAxMik7XG4gIGNhbWVyYS5sb29rQXQoMCwgMCwgMCk7XG4gIGNhbWVyYS51cGRhdGVNYXRyaXhXb3JsZCgpO1xuICBjb25zdCBwYW5lbCA9IHsgcmVuZGVyTGlzdCgpIHt9LCBzZXRWaXNpYmxlKCkge30sIHNob3coKSB7fSwgaGlkZUNhcmQoKSB7fSwgc2V0TGlzdFZpc2libGUoKSB7fSxcbiAgICBpc0xpc3RWaXNpYmxlKCkgeyByZXR1cm4gZmFsc2U7IH0sIHBpbm5lZEtleSgpIHsgcmV0dXJuIG51bGw7IH0sIGZvY3VzQ2FyZCgpIHt9LCBmb2N1c0xpc3QoKSB7fSB9O1xuICBjb25zdCBjb250cm9sbGVyID0gbmV3IFNjZW5lSW5zcGVjdG9yKHsgd29ybGQ6IHNlc3Npb24ud29ybGQsIHNjZW5lLCBjYW1lcmEsXG4gICAgY2FudmFzOiB7IGdldEJvdW5kaW5nQ2xpZW50UmVjdCgpIHsgcmV0dXJuIHsgbGVmdDogMCwgdG9wOiAwLCB3aWR0aDogMTAwLCBoZWlnaHQ6IDEwMCB9OyB9LFxuICAgICAgYWRkRXZlbnRMaXN0ZW5lcigpIHt9LCB0YWJJbmRleDogMCwgc2V0QXR0cmlidXRlKCkge30gfSBhcyBhbnksXG4gICAgdGVycmFpbixcbiAgfSwgcGFuZWwgYXMgSW5zcGVjdG9yUGFuZWwpO1xuICBjb25zdCBwaWNrID0gKGNvbnRyb2xsZXIgYXMgYW55KS5waWNrLmJpbmQoY29udHJvbGxlcikgYXMgKHg6IG51bWJlciwgeTogbnVtYmVyKSA9PiB1bmtub3duO1xuICBjb250cm9sbGVyLmFkZFJvb3Qocm9vdCk7XG4gIHNjZW5lLnVwZGF0ZU1hdHJpeFdvcmxkKHRydWUpO1xuICBhc3NlcnQuZXF1YWwocGljayg1MCwgNTApLCBudWxsKTtcbiAgdGVycmFpbi5wb3NpdGlvbi56ID0gMTM7XG4gIHNjZW5lLnVwZGF0ZU1hdHJpeFdvcmxkKHRydWUpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHBpY2soNTAsIDUwKSwgeyBzaXRlSWQ6IHNpdGUuaWQgfSk7XG4gIHJvb3QudmlzaWJsZSA9IGZhbHNlO1xuICBhc3NlcnQuZXF1YWwocGljayg1MCwgNTApLCBudWxsKTtcbiAgY29uc3QgY2hpbGQgPSBsYW5kbWFyay5jaGlsZHJlblswXTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChpZGVudGlmaWVkUmVmKGNoaWxkKSwgeyBzaXRlSWQ6IHNpdGUuaWQgfSk7XG4gIGFzc2VydC5lcXVhbChjYW5vbmljYWxXb3JsZEhhc2goc2Vzc2lvbi53b3JsZCwgc2Vzc2lvbi5uZXh0U2VxdWVuY2UsIDMpLFxuICAgIGNhbm9uaWNhbFdvcmxkSGFzaChzZXNzaW9uLndvcmxkLCBzZXNzaW9uLm5leHRTZXF1ZW5jZSwgMykpO1xufSk7XG5cbnRlc3QoJ3RlcnJhY2Ugc29pbCBjYW5ub3QgaGlkZSBpdHMgYXV0aG9yaXRhdGl2ZSBjcm9wIHJvdyBmcm9tIGEgcmVhbCByYXknLCAoKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5nZW5lc2lzKCk7XG4gIGNvbnN0IHJlc3VsdCA9IHNlc3Npb24uZGlzcGF0Y2goeyBzY2hlbWE6IDMsIGlkOiAnaW5zcGVjdC1jcm9wLXJheScsIHR5cGU6ICdidWlsZCcsIHByb2plY3RJZDogJ2Zhcm0nLFxuICAgIGRlc2lnblZlcnNpb246IDIsIGV4cGVjdGVkUmV2aXNpb246IHNlc3Npb24ud29ybGQucmV2aXNpb24gfSk7XG4gIGFzc2VydC5lcXVhbChyZXN1bHQub2ssIHRydWUsIEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO1xuICBjb25zdCBzY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xuICBjb25zdCByb290ID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIHNjZW5lLmFkZChyb290KTtcbiAgY29uc3Qgc3RydWN0dXJlID0gWy4uLnNlc3Npb24ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV1bMF07XG4gIHJvb3QuYWRkKGJ1aWxkU3RydWN0dXJlTWVzaChzdHJ1Y3R1cmUpKTtcbiAgYnVpbGRMaWZlTWVzaGVzKHNlc3Npb24ud29ybGQpLmNoaWxkcmVuLmZpbHRlcigoY2hpbGQpID0+IGNoaWxkLnVzZXJEYXRhLmNyb3BJZClcbiAgICAuZm9yRWFjaCgoY2hpbGQpID0+IHJvb3QuYWRkKGNoaWxkKSk7XG4gIGNvbnN0IHJvdyA9IHN0cnVjdHVyZS5tb2R1bGVzLmZpbmQoKG1vZHVsZSkgPT4gbW9kdWxlLmtpbmQgPT09ICdjcm9wX3JvdycpITtcbiAgY29uc3QgY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKDUwLCAxLCAwLjEsIDEwMCk7XG4gIGNhbWVyYS5wb3NpdGlvbi5zZXQocm93LngsIHJvdy55ICsgMTAsIHJvdy56ICsgMTApO1xuICBjYW1lcmEubG9va0F0KHJvdy54LCByb3cueSArIHJvdy5oIC8gMiwgcm93LnopO1xuICBjYW1lcmEudXBkYXRlTWF0cml4V29ybGQoKTtcbiAgY29uc3QgcGFuZWwgPSB7IHJlbmRlckxpc3QoKSB7fSwgc2V0VmlzaWJsZSgpIHt9LCBzaG93KCkge30sIGhpZGVDYXJkKCkge30sIHNldExpc3RWaXNpYmxlKCkge30sXG4gICAgaXNMaXN0VmlzaWJsZSgpIHsgcmV0dXJuIGZhbHNlOyB9LCBwaW5uZWRLZXkoKSB7IHJldHVybiBudWxsOyB9LCBmb2N1c0NhcmQoKSB7fSwgZm9jdXNMaXN0KCkge30gfTtcbiAgY29uc3QgdGVycmFpbiA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBzY2VuZS5hZGQodGVycmFpbik7XG4gIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU2NlbmVJbnNwZWN0b3IoeyB3b3JsZDogc2Vzc2lvbi53b3JsZCwgc2NlbmUsIGNhbWVyYSxcbiAgICBjYW52YXM6IHsgZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkgeyByZXR1cm4geyBsZWZ0OiAwLCB0b3A6IDAsIHdpZHRoOiAxMDAsIGhlaWdodDogMTAwIH07IH0sXG4gICAgICBhZGRFdmVudExpc3RlbmVyKCkge30sIHRhYkluZGV4OiAwLCBzZXRBdHRyaWJ1dGUoKSB7fSB9IGFzIGFueSxcbiAgICB0ZXJyYWluLFxuICB9LCBwYW5lbCBhcyBJbnNwZWN0b3JQYW5lbCk7XG4gIGNvbnRyb2xsZXIuYWRkUm9vdChyb290KTtcbiAgc2NlbmUudXBkYXRlTWF0cml4V29ybGQodHJ1ZSk7XG4gIGNvbnN0IHBpY2sgPSAoY29udHJvbGxlciBhcyBhbnkpLnBpY2suYmluZChjb250cm9sbGVyKSBhcyAoeDogbnVtYmVyLCB5OiBudW1iZXIpID0+IHVua25vd247XG4gIGFzc2VydC5kZWVwRXF1YWwocGljayg1MCwgNTApLCB7IGNyb3BJZDogJ2Nyb3A6MCcgfSk7XG4gIGNvbnN0IGJsb2NrZXIgPSBuZXcgVEhSRUUuTWVzaChuZXcgVEhSRUUuQm94R2VvbWV0cnkoMTAsIDEwLCAwLjEpKTtcbiAgYmxvY2tlci5wb3NpdGlvbi5jb3B5KGNhbWVyYS5wb3NpdGlvbikubGVycChuZXcgVEhSRUUuVmVjdG9yMyhyb3cueCwgcm93LnksIHJvdy56KSwgMC41KTtcbiAgYmxvY2tlci5xdWF0ZXJuaW9uLmNvcHkoY2FtZXJhLnF1YXRlcm5pb24pO1xuICB0ZXJyYWluLmFkZChibG9ja2VyKTtcbiAgc2NlbmUudXBkYXRlTWF0cml4V29ybGQodHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChwaWNrKDUwLCA1MCksIG51bGwsICduZWFyZXIgb3BhcXVlIHRlcnJhaW4gc3RpbGwgYmxvY2tzIGNyb3Agc2VsZWN0aW9uJyk7XG59KTtcblxuZnVuY3Rpb24gYmFyZUluc3BlY3RvcihzZXNzaW9uOiBHYW1lU2Vzc2lvbiwgc2NlbmU6IFRIUkVFLlNjZW5lLCByb290OiBUSFJFRS5PYmplY3QzRCk6IFNjZW5lSW5zcGVjdG9yIHtcbiAgY29uc3QgY29udHJvbGxlciA9IE9iamVjdC5jcmVhdGUoU2NlbmVJbnNwZWN0b3IucHJvdG90eXBlKSBhcyBTY2VuZUluc3BlY3RvcjtcbiAgKGNvbnRyb2xsZXIgYXMgYW55KS5vcHRpb25zID0geyB3b3JsZDogc2Vzc2lvbi53b3JsZCwgc2NlbmUgfTtcbiAgKGNvbnRyb2xsZXIgYXMgYW55KS5yb290cyA9IG5ldyBTZXQoW3Jvb3RdKTtcbiAgKGNvbnRyb2xsZXIgYXMgYW55KS50YXJnZXRDYWNoZSA9IHt9O1xuICAoY29udHJvbGxlciBhcyBhbnkpLnBhbmVsID0geyByZW5kZXJMaXN0KCkge30gfSBhcyBJbnNwZWN0b3JQYW5lbDtcbiAgY29udHJvbGxlci5yZWZyZXNoVGFyZ2V0cygpO1xuICByZXR1cm4gY29udHJvbGxlcjtcbn1cbiIsICIvLyBQcml2YXRlIG1pZ3JhdGlvbiByZXBsYXkgb25seS4gUmV0aXJlZCBlbnRpdGllcyBsaXZlIGluIHRoaXMgV29ybGQgd2hpbGUgYW5cbi8vIGFjY2VwdGVkIGhpc3RvcmljYWwgam91cm5hbCBpcyBjaGVja2VkOyBubyBwdWJsaWMgY29tbWFuZCBlbmFibGVzIHRoaXMgbW9kZS5cbmludGVyZmFjZSBSZXBsYXlTdGF0ZSB7XG4gIGFjdGl2ZTogYm9vbGVhbjtcbiAgaGlzdG9yaWNhbEhhc2g6IGJvb2xlYW47XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xufVxuXG5jb25zdCBzdGF0ZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIFJlcGxheVN0YXRlPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZDogb2JqZWN0KTogUmVwbGF5U3RhdGUge1xuICBsZXQgc3RhdGUgPSBzdGF0ZXMuZ2V0KHdvcmxkKTtcbiAgaWYgKCFzdGF0ZSkgeyBzdGF0ZSA9IHsgYWN0aXZlOiBmYWxzZSwgaGlzdG9yaWNhbEhhc2g6IGZhbHNlLCBtaWdyYXRlZDogZmFsc2UgfTsgc3RhdGVzLnNldCh3b3JsZCwgc3RhdGUpOyB9XG4gIHJldHVybiBzdGF0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZVN0b25lUmVwbGF5KHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgY29uc3Qgc3RhdGUgPSByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKTtcbiAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xuICBzdGF0ZS5taWdyYXRlZCA9IGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8uYWN0aXZlID8/IGZhbHNlO1xufVxuXG4vKiogU25hcHNob3QgaGFzaGVzIGJlZm9yZSBhbmQgZHVyaW5nIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5IGluY2x1ZGUgc3RvbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuYWJsZUhpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5oaXN0b3JpY2FsSGFzaCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hpc3RvcmljYWxTdG9uZUhhc2god29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lmhpc3RvcmljYWxIYXNoID8/IGZhbHNlO1xufVxuXG4vKiogQSBtaWdyYXRlZCBzbmFwc2hvdCBhbHJlYWR5IGhhcyByZXRpcmVtZW50IHRvbWJzdG9uZXMgaW4gZ2VuZXJhdGVkIGNodW5rcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIHJlcGxheVN0b25lU3RhdGUod29ybGQpLm1pZ3JhdGVkID0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVNaWdyYXRlZCh3b3JsZDogb2JqZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0ZXMuZ2V0KHdvcmxkKT8ubWlncmF0ZWQgPz8gZmFsc2U7XG59XG5cbi8qKiBFeGl0IGhpc3RvcmljYWwgbW9kZSBhZnRlciBhbGwgYWNjZXB0ZWQgY29tbWFuZHMgYW5kIGhhc2hlcyBoYXZlIHBhc3NlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5pc2hTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IGZhbHNlO1xuICBzdGF0ZS5oaXN0b3JpY2FsSGFzaCA9IGZhbHNlO1xuICBzdGF0ZS5taWdyYXRlZCA9IHRydWU7XG59XG4iLCAiLy8gU2ltdWxhdGlvbiBsYXllciBcdTIwMTQgcHVyZSBUeXBlU2NyaXB0LCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMSB3b3JsZCBmb3VuZGF0aW9uOiBhIGNodW5rZWQsIGdlbnVpbmVseSB0aHJlZS1kaW1lbnNpb25hbCB2b3hlbCB3b3JsZC5cbi8vIFRoZSBzdG9yZWQgc3RhdGUgaXMgb25lIG1hdGVyaWFsIGJ5dGUgcGVyIGNlbGwgKDAgPSBhaXIpOyBvY2N1cGFuY3kgaXNcbi8vIGltcGxpY2l0LiBTdXJmYWNlIGhlaWdodCBpcyBhIGRlcml2ZWQgcXVlcnksIG5vdCB0aGUgc3RvcmFnZS4gVGhpcyByZXBsYWNlc1xuLy8gdGhlIGZvcm1lciAyNTYgeCAyNTYgaGVpZ2h0ZmllbGQgKHNlZSBJUi0wMDUpLlxuLy9cbi8vIFdvcmxkIG1ldHJlczogeC96IGluIFstMTAyNCwgMTAyNCksIHkgaW4gWy0xNiwgMTEyKSwgc2VhIGxldmVsIDAuXG4vLyBBIGNodW5rIGlzIDMyIHggMzIgeCAxMjggY2VsbHMuIEdlbmVyYXRpb24gaXMgYSBwdXJlIGZ1bmN0aW9uIG9mIHRoZSBzZWVkLFxuLy8gZ2VuZXJhdG9yIHZlcnNpb24sIHBhcmFtZXRlcnMgYW5kIGNodW5rIGNvb3JkaW5hdGVzOyBlZGl0cyBhcmUgcmVjb3JkZWRcbi8vIHNlcGFyYXRlbHkgYW5kIHJlLWFwcGxpZWQgd2hlbiBhIGNodW5rIGlzIHJlZ2VuZXJhdGVkLlxuaW1wb3J0IHR5cGUgeyBTdHJ1Y3R1cmUgfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBMaWZlU3RhdGUgfSBmcm9tICcuL2Vjb25vbXknO1xuaW1wb3J0IHsgaXNTdG9uZVJlcGxheSB9IGZyb20gJy4vc3RvbmUtY29tcGF0JztcblxuZXhwb3J0IGNvbnN0IFdPUkxEX1NJWkUgPSAyMDQ4O1xuZXhwb3J0IGNvbnN0IEhBTEYgPSBXT1JMRF9TSVpFIC8gMjtcbmV4cG9ydCBjb25zdCBDSFVOS19TSVpFID0gMzI7XG5leHBvcnQgY29uc3QgQ0hVTktTX1BFUl9TSURFID0gV09STERfU0laRSAvIENIVU5LX1NJWkU7XG5leHBvcnQgY29uc3QgWV9NSU4gPSAtMTY7XG5leHBvcnQgY29uc3QgWV9NQVggPSAxMTI7XG5leHBvcnQgY29uc3QgV09STERfSEVJR0hUID0gWV9NQVggLSBZX01JTjtcbmV4cG9ydCBjb25zdCBTRUFfTEVWRUwgPSAwO1xuZXhwb3J0IGNvbnN0IFdBVEVSID0gU0VBX0xFVkVMO1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WRVJTSU9OID0gMTtcbmV4cG9ydCBjb25zdCBDSFVOS19WT0xVTUUgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRSAqIFdPUkxEX0hFSUdIVDtcbmV4cG9ydCBjb25zdCBDSFVOS19BUkVBID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkU7XG5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG59IGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgTWF0SWQgPSAodHlwZW9mIE1BVClba2V5b2YgdHlwZW9mIE1BVF07XG5cbmV4cG9ydCBjb25zdCBpc1NvbGlkID0gKG06IG51bWJlcik6IGJvb2xlYW4gPT4gbSAhPT0gTUFULkFJUiAmJiBtICE9PSBNQVQuV0FURVI7XG5leHBvcnQgY29uc3QgaXNPcGFxdWUgPSBpc1NvbGlkO1xuXG5leHBvcnQgY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuZXhwb3J0IGNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5jb25zdCBzbW9vdGggPSAodDogbnVtYmVyKSA9PiB0ICogdCAqICgzIC0gMiAqIHQpO1xuXG5mdW5jdGlvbiB2YWx1ZU5vaXNlMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSk7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSk7XG4gIGNvbnN0IGEgPSBoYXNoMmkoeGksIHlpLCBzZWVkKSwgYiA9IGhhc2gyaSh4aSArIDEsIHlpLCBzZWVkKTtcbiAgY29uc3QgYyA9IGhhc2gyaSh4aSwgeWkgKyAxLCBzZWVkKSwgZCA9IGhhc2gyaSh4aSArIDEsIHlpICsgMSwgc2VlZCk7XG4gIGNvbnN0IHRvcCA9IGEgKyAoYiAtIGEpICogeGY7XG4gIGNvbnN0IGJvdHRvbSA9IGMgKyAoZCAtIGMpICogeGY7XG4gIHJldHVybiB0b3AgKyAoYm90dG9tIC0gdG9wKSAqIHlmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMih4ICogZnJlcSwgeSAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbmZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZnVuY3Rpb24gZmJtMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UzKHggKiBmcmVxLCB5ICogZnJlcSwgeiAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbi8vIC0tLS0tLS0tLS0gd29ybGQgdHlwZXMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFBhcmFtcyB7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1BBUkFNUzogV29ybGRQYXJhbXMgPSB7XG4gIHNpemU6IFdPUkxEX1NJWkUsXG4gIGNodW5rU2l6ZTogQ0hVTktfU0laRSxcbiAgeU1pbjogWV9NSU4sXG4gIHlNYXg6IFlfTUFYLFxuICBzZWFMZXZlbDogU0VBX0xFVkVMLFxuICBnZW5lcmF0b3JWZXJzaW9uOiBHRU5FUkFUT1JfVkVSU0lPTixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIGtleTogc3RyaW5nO1xuICAvKiogeCArIHoqMzIgKyAoeS1ZX01JTikqMTAyNCAqL1xuICBkYXRhOiBVaW50OEFycmF5O1xuICAvKiogdG9wIHNvbGlkIHksIGVuY29kZWQgYXMgKHkgLSBZX01JTiksIDAuLjEyNzsgMCBtZWFucyBubyBzb2xpZC4gKi9cbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgLyoqIHRvcCBtYXRlcmlhbCBwZXIgY29sdW1uLiAqL1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xuICBkaXJ0eTogYm9vbGVhbjtcbiAgZ2VuZXJhdGVkQXQ6IG51bWJlcjtcbn1cblxuLy8gTmF0dXJhbCBhc3NldHMgYXJlIHRoZSBwcm9qZWN0J3MgU3R5bCAoYG5hdF9gKSBwaXBlbGluZSAoQVMtMDAxIHYyKSwgbm90XG4vLyBOb3hlbCBhcmNoaXRlY3R1cmUuIE5veGVsIHJlbWFpbnMgdGhlIGh1bWFuLW1hZGUga2l0L3dheXN0b25lL21hcmtlciBzeXN0ZW0uXG4vLyBSZXRpcmVkIG9ubHkgYXMgd29ybGQgY29udGVudC4gVGhlIG5hbWVzIHJlbWFpbiBpbiB0aGUgc2VyaWFsaXplZCB0eXBlIHNvXG4vLyBvbGQgc25hcHNob3RzIGFuZCBhY2NlcHRlZCBoYXJ2ZXN0IGpvdXJuYWxzIGNhbiBiZSBtaWdyYXRlZCB3aXRob3V0IHJlamVjdGluZ1xuLy8gb3RoZXJ3aXNlIHZhbGlkIHNhdmVzLiBHZW5lcmF0aW9uLCBjb2xsaXNpb24gYW5kIGluc3BlY3Rpb24gbmV2ZXIgdXNlIHRoZW0uXG5leHBvcnQgY29uc3QgUkVUSVJFRF9TVE9ORV9LSU5EUyA9IG5ldyBTZXQ8RW50aXR5S2luZD4oW1xuICAnc3R5bF9yb2NrX3NtYWxsJywgJ3N0eWxfcm9ja19tZWRpdW0nLCAnc3R5bF9yb2NrX2xhcmdlJyxcbl0pO1xuZXhwb3J0IGNvbnN0IGlzUmV0aXJlZFN0b25lS2luZCA9IChraW5kOiBFbnRpdHlLaW5kKTogYm9vbGVhbiA9PiBSRVRJUkVEX1NUT05FX0tJTkRTLmhhcyhraW5kKTtcbmV4cG9ydCB0eXBlIEFjdGl2ZUVudGl0eUtpbmQgPSBFeGNsdWRlPEVudGl0eUtpbmQsXG4gICdzdHlsX3JvY2tfc21hbGwnIHwgJ3N0eWxfcm9ja19tZWRpdW0nIHwgJ3N0eWxfcm9ja19sYXJnZSc+O1xuXG5mdW5jdGlvbiBsaXZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IEVudGl0eSB8IG51bGwge1xuICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICByZXR1cm4gIWVudGl0eSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGlkKSA/IG51bGwgOiBlbnRpdHk7XG59XG5cbmV4cG9ydCB0eXBlIEVudGl0eUtpbmQgPVxuICB8ICdzdHlsX3RyZWVfc3BpcmUnXG4gIHwgJ3N0eWxfdHJlZV90YWJsZSdcbiAgfCAnc3R5bF90cmVlX2NsdXN0ZXInXG4gIHwgJ3N0eWxfdHJlZV9ibG9zc29tJ1xuICB8ICdzdHlsX3NocnViJ1xuICB8ICdzdHlsX3JvY2tfc21hbGwnXG4gIHwgJ3N0eWxfcm9ja19tZWRpdW0nXG4gIHwgJ3N0eWxfcm9ja19sYXJnZSdcbiAgfCAnc3R5bF9vcmUnXG4gIHwgJ3N0eWxfY2Fpcm4nXG4gIHwgJ3dheXN0b25lJ1xuICB8ICdtYXJrZXInO1xuXG5leHBvcnQgdHlwZSBSZXNvdXJjZVR5cGUgPSAnd29vZCcgfCAnc3RvbmUnIHwgJ29yZScgfCAnZmliZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVudGl0eSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIGNodW5rOiBzdHJpbmc7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJvdDogbnVtYmVyO1xuICBzY2FsZTogbnVtYmVyO1xuICB2YXJpYW50OiBudW1iZXI7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGUgfCBudWxsO1xuICByZW1haW5pbmc6IG51bWJlcjtcbiAgeWllbGRQZXJIYXJ2ZXN0OiBudW1iZXI7XG4gIC8qKiBUcnVlIG9uY2UgdGhlIGVudGl0eSBpcyBmdWxseSBkZXBsZXRlZC4gKi9cbiAgaGFydmVzdGVkOiBib29sZWFuO1xuICAvKiogVHJ1ZSBhZnRlciB0aGUgZmlyc3Qgc3VjY2Vzc2Z1bCBoYXJ2ZXN0LCBldmVuIGlmIHlpZWxkIHJlbWFpbnMuICovXG4gIGhhcnZlc3RlZE9uY2U/OiBib29sZWFuO1xuICBwcm92aXNpb25hbDogYm9vbGVhbjtcbiAgYXV0aG9yZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm94ZWxTaXRlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgcHJvdmlzaW9uYWw6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVnaW9uSW5mbyB7XG4gIGlkOiBzdHJpbmc7XG4gIGxhYmVsOiBzdHJpbmc7XG4gIHR5cGU6ICdwbGFpbicgfCAnZm9yZXN0JyB8ICdoaWxscycgfCAnaGlnaGxhbmQnIHwgJ3dhdGVyJyB8ICdyaWRnZSc7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIHJ4OiBudW1iZXI7XG4gIHJ6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRTdGF0cyB7XG4gIGNodW5rc0dlbmVyYXRlZDogbnVtYmVyO1xuICBjaHVua3NFdmljdGVkOiBudW1iZXI7XG4gIHZveGVsc0ZpbGxlZDogbnVtYmVyO1xuICBnZW5lcmF0aW9uTXM6IG51bWJlcjtcbiAgZW50aXRpZXM6IG51bWJlcjtcbiAgdHJlZXM6IG51bWJlcjtcbiAgcGlua1RyZWVzOiBudW1iZXI7XG4gIHBpbmtPdmVyZmxvdzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkIHtcbiAgc2VlZDogbnVtYmVyO1xuICBwYXJhbXM6IFdvcmxkUGFyYW1zO1xuICBjaHVua3M6IE1hcDxzdHJpbmcsIFZveGVsQ2h1bms+O1xuICBlbnRpdGllczogTWFwPHN0cmluZywgRW50aXR5PjtcbiAgZW50aXR5Q2h1bmtzOiBNYXA8c3RyaW5nLCBzdHJpbmdbXT47XG4gIC8qKiBDaHVua3Mgd2hvc2UgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWVudGl0eSBzdGF0ZSBoYXMgYmVlbiBjaGFuZ2VkLiAqL1xuICBlbnRpdHlDaGFuZ2VzOiBTZXQ8c3RyaW5nPjtcbiAgLyoqIFRvbWJzdG9uZXMgZm9yIHJlbW92ZWQgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsIGVudGl0aWVzLiAqL1xuICBlbnRpdHlSZW1vdmFsczogU2V0PHN0cmluZz47XG4gIC8qKiBBdXRob3JpdGF0aXZlIGJ1aWx0IHN0cnVjdHVyZXMgKGhvdXNlLCBwYXRoLCB0ZXJyYWNlcywgY3JvcHMpLiAqL1xuICBzdHJ1Y3R1cmVzOiBNYXA8c3RyaW5nLCBTdHJ1Y3R1cmU+O1xuICBzaXRlczogTm94ZWxTaXRlW107XG4gIHJlZ2lvbnM6IFJlZ2lvbkluZm9bXTtcbiAgLyoqIGNodW5rIGtleSAtPiBsb2NhbCB2b3hlbCBpbmRleCAtPiBtYXRlcmlhbC4gRHVyYWJsZSwgY29tcGFjdCBlZGl0cy4gKi9cbiAgZWRpdHM6IE1hcDxzdHJpbmcsIE1hcDxudW1iZXIsIG51bWJlcj4+O1xuICAvKiogR2xvYmFsIGxvY2FsLXBsYXllciBjYXJyaWVkIGJhZzsgYm91bmRlZCBpbiBzY2hlbWEgMywgbGVnYWN5IGluIDEvMi4gKi9cbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICAvKiogUHJlc2VudCBvbmx5IGFmdGVyIHNjaGVtYS0zIGdlbmVzaXMvcmVzdG9yYXRpb24uICovXG4gIGxpZmU/OiBMaWZlU3RhdGU7XG4gIGRpcnR5OiBTZXQ8c3RyaW5nPjtcbiAgc3RhdHM6IFdvcmxkU3RhdHM7XG4gIGF1dGhvcmVkUGxhY2VkOiBib29sZWFuO1xuICAvKipcbiAgICogTW9ub3RvbmljIHJldmlzaW9uIG9mIGF1dGhvcml0YXRpdmUgc3RhdGUgKHZveGVscyBhbmQgZW50aXRpZXMpLiBEZXJpdmVkXG4gICAqIGNhY2hlcyBrZXllZCBvbiB0aGlzIHZhbHVlIGFyZSBkaXNjYXJkZWQgYWZ0ZXIgYW4gZWRpdDsgbWVzaC9uYXZpZ2F0aW9uXG4gICAqIHJldmlzaW9ucyBhcmUgc2VwYXJhdGUgYmVjYXVzZSB0aGV5IGFyZSBkZXJpdmVkLCBub3Qgd29ybGQgc3RhdGUuXG4gICAqL1xuICByZXZpc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgY2h1bmtLZXkgPSAoY3g6IG51bWJlciwgY3o6IG51bWJlcikgPT4gYCR7Y3h9LCR7Y3p9YDtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblggPSAoY3g6IG51bWJlcikgPT4gY3ggKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBjaHVua09yaWdpblogPSAoY3o6IG51bWJlcikgPT4gY3ogKiBDSFVOS19TSVpFIC0gSEFMRjtcbmV4cG9ydCBjb25zdCBsb2NhbEluZGV4ID0gKGx4OiBudW1iZXIsIHlJbmRleDogbnVtYmVyLCBsejogbnVtYmVyKSA9PlxuICBseCArIGx6ICogQ0hVTktfU0laRSArIHlJbmRleCAqIENIVU5LX0FSRUE7XG5leHBvcnQgY29uc3Qgd29ybGRUb0NodW5rWCA9ICh4OiBudW1iZXIpID0+IE1hdGguZmxvb3IoKHggKyBIQUxGKSAvIENIVU5LX1NJWkUpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ogPSAoejogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh6ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxYID0gKHg6IG51bWJlcikgPT4geCAtICh3b3JsZFRvQ2h1bmtYKHgpICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9Mb2NhbFogPSAoejogbnVtYmVyKSA9PiB6IC0gKHdvcmxkVG9DaHVua1ooeikgKiBDSFVOS19TSVpFIC0gSEFMRik7XG5leHBvcnQgY29uc3QgeVRvSW5kZXggPSAoeTogbnVtYmVyKSA9PiB5IC0gWV9NSU47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXb3JsZChzZWVkID0gMTMzNyk6IFdvcmxkIHtcbiAgcmV0dXJuIHtcbiAgICBzZWVkLFxuICAgIHBhcmFtczogeyAuLi5ERUZBVUxUX1BBUkFNUyB9LFxuICAgIGNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0aWVzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2h1bmtzOiBuZXcgTWFwKCksXG4gICAgZW50aXR5Q2hhbmdlczogbmV3IFNldCgpLFxuICAgIGVudGl0eVJlbW92YWxzOiBuZXcgU2V0KCksXG4gICAgc3RydWN0dXJlczogbmV3IE1hcCgpLFxuICAgIHNpdGVzOiBbXSxcbiAgICByZWdpb25zOiBSRUdJT05TLFxuICAgIGVkaXRzOiBuZXcgTWFwKCksXG4gICAgaW52ZW50b3J5OiB7fSxcbiAgICBkaXJ0eTogbmV3IFNldCgpLFxuICAgIHN0YXRzOiB7XG4gICAgICBjaHVua3NHZW5lcmF0ZWQ6IDAsIGNodW5rc0V2aWN0ZWQ6IDAsIHZveGVsc0ZpbGxlZDogMCwgZ2VuZXJhdGlvbk1zOiAwLFxuICAgICAgZW50aXRpZXM6IDAsIHRyZWVzOiAwLCBwaW5rVHJlZXM6IDAsIHBpbmtPdmVyZmxvdzogMCxcbiAgICB9LFxuICAgIGF1dGhvcmVkUGxhY2VkOiBmYWxzZSxcbiAgICByZXZpc2lvbjogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlV29ybGQoc2VlZCA9IDEzMzcsIGluaXRpYWxSYWRpdXMgPSAwKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQpO1xuICBjb25zdCBjZW50cmUgPSBNYXRoLmZsb29yKENIVU5LU19QRVJfU0lERSAvIDIpO1xuICBmb3IgKGxldCBjeiA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN6IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGNlbnRyZSAtIGluaXRpYWxSYWRpdXM7IGN4IDw9IGNlbnRyZSArIGluaXRpYWxSYWRpdXM7IGN4KyspIHtcbiAgICAgIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgfVxuICB9XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuLy8gLS0tLS0tLS0tLSBnZW9ncmFwaHkgLS0tLS0tLS0tLVxuZXhwb3J0IGNvbnN0IFJFR0lPTlM6IFJlZ2lvbkluZm9bXSA9IFtcbiAgeyBpZDogJ2ZvdW5kZXInLCBsYWJlbDogJ0ZvdW5kZXIgdmFsbGV5JywgdHlwZTogJ3BsYWluJywgY3g6IDAsIGN6OiAwLCByeDogMTEwLCByejogODUgfSxcbiAgeyBpZDogJ2Vhc3R3b29kJywgbGFiZWw6ICdFYXN0d29vZCcsIHR5cGU6ICdmb3Jlc3QnLCBjeDogMjIwLCBjejogLTExMCwgcng6IDI2MCwgcno6IDIyMCB9LFxuICB7IGlkOiAnY3Jvd24nLCBsYWJlbDogJ0Nyb3duIGhpZ2hsYW5kcycsIHR5cGU6ICdoaWdobGFuZCcsIGN4OiAtMzYwLCBjejogLTMwMCwgcng6IDM4MCwgcno6IDMwMCB9LFxuICB7IGlkOiAnbGFrZScsIGxhYmVsOiAnTWlycm9yIGxha2UnLCB0eXBlOiAnd2F0ZXInLCBjeDogLTI2MCwgY3o6IC0yMzAsIHJ4OiAxMjAsIHJ6OiA5NSB9LFxuICB7IGlkOiAnc291dGhkb3ducycsIGxhYmVsOiAnU291dGggZG93bnMnLCB0eXBlOiAnaGlsbHMnLCBjeDogMTIwLCBjejogMzMwLCByeDogMjYwLCByejogMTkwIH0sXG4gIHsgaWQ6ICd3ZXN0cmlzZScsIGxhYmVsOiAnV2VzdCByaXNlJywgdHlwZTogJ2hpbGxzJywgY3g6IC0zNjAsIGN6OiAxMjAsIHJ4OiAyMjAsIHJ6OiAyMTAgfSxcbiAgeyBpZDogJ2NvYXN0JywgbGFiZWw6ICdCcm9rZW4gY29hc3QnLCB0eXBlOiAncmlkZ2UnLCBjeDogMCwgY3o6IDAsIHJ4OiA3ODAsIHJ6OiA2NjAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckNlbnRlclgoejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVGhlIHJpdmVyIHJ1bnMgbm9ydGhcdTIwMTNzb3V0aCBhYm91dCA3MFx1MjAxMzExMCBtIHdlc3Qgb2YgdGhlIGZvdW5kZXIgc2hlbGYsIHNvXG4gIC8vIHRoZSBkZWZhdWx0IG5vcnRoLXdlc3QgdmlldyBoYXMgd2F0ZXIsIGEgbmVhciBiYW5rIGFuZCBhIGZhciBiYW5rLlxuICByZXR1cm4gLTkwICsgNTUgKiBNYXRoLnNpbigoeiArIDEwMCkgLyAyNDApICsgMTggKiBNYXRoLnNpbigoeiAtIDIwKSAvIDgwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJpdmVyRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5hYnMoeCAtIHJpdmVyQ2VudGVyWCh6KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsYWtlRGlzdGFuY2UoeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5zcXJ0KCgoeCArIDI2MCkgLyAxMjApICoqIDIgKyAoKHogKyAyMzApIC8gOTUpICoqIDIpO1xufVxuXG4vKipcbiAqIEludGVnZXIgdG9wIHNvbGlkIHkgb2YgdGhlIGJhc2UgZ2VuZXJhdGVkIHN1cmZhY2UgKG5vIGVkaXRzL292ZXJoYW5ncykuXG4gKlxuICogVGhpcyBpcyB0aGUgKnNoYXBlKiB0aGUgdm94ZWwgdm9sdW1lIGlzIGZpbGxlZCBmcm9tLCBub3QgdGhlIHN0b3JlZCB3b3JsZC5cbiAqIFRoZSBpbXBvcnRhbnQgY29ycmVjdGlvbiBvdmVyIHRoZSBmaXJzdCBNMDAxIHBhc3MgaXMgdGhhdCB0aGUgbGFuZHNjYXBlIGlzXG4gKiBub3Qgb25lIHNtb290aCByYWRpYWwgYm93bDogaXQgaXMgYSB3YXJwZWQgbXVsdGktc2NhbGUgc3VyZmFjZSB3aXRoIGEgYnJvYWRcbiAqIHJpdmVyIHZhbGxleSwgYSBzbWFsbCBidWlsZGFibGUgc2hlbGYsIGFuZCByaWRnZWQgaGlnaGxhbmRzLiBBIHNoYWxsb3dcbiAqIHNtb290aCBzdXJmYWNlIHF1YW50aXNlZCB0byAxIG0gdm94ZWxzIGlzIHdoYXQgcHJvZHVjZWQgdGhlIGNvbmNlbnRyaWNcbiAqIGNvbnRvdXIgcmluZ3M7IHZhcmllZCByZWxpZWYgYW5kIGEgcml2ZXIgdmFsbGV5IGJyZWFrIHRoZW0gbmF0dXJhbGx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUhlaWdodEF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICAvLyBUd28tc2NhbGUgZG9tYWluIHdhcnAuIFRoZSBicm9hZCB3YXJwIG1vdmVzIGNvYXN0bGluZXMgYW5kIGhpbGxzOyB0aGVcbiAgLy8gc21hbGwgd2FycCBrZWVwcyB0aGUgMSBtIHF1YW50aXNhdGlvbiBmcm9tIGZvbGxvd2luZyBjbGVhbiBjb250b3Vycy5cbiAgY29uc3Qgd3ggPSB4XG4gICAgKyAoZmJtMih4IC8gNDIwLCB6IC8gNDIwLCBzZWVkICsgMTAxLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSwgeiAvIDk1LCBzZWVkICsgMTAyLCAyKSAtIDAuNSkgKiAzMDtcbiAgY29uc3Qgd3ogPSB6XG4gICAgKyAoZmJtMih4IC8gNDIwICsgNy4zLCB6IC8gNDIwIC0gMy4xLCBzZWVkICsgMTAzLCAzKSAtIDAuNSkgKiAyNDBcbiAgICArIChmYm0yKHggLyA5NSArIDMuNywgeiAvIDk1IC0gOC4xLCBzZWVkICsgMTA0LCAyKSAtIDAuNSkgKiAzMDtcblxuICBjb25zdCByYWRpYWwgPSBNYXRoLnNxcnQoKHd4IC8gNzgwKSAqKiAyICsgKHd6IC8gNjYwKSAqKiAyKTtcbiAgY29uc3QgY29hc3ROb2lzZSA9IChmYm0yKHd4IC8gMzAwLCB3eiAvIDMwMCwgc2VlZCArIDEwNSwgNCkgLSAwLjUpICogMC4zNFxuICAgICsgKGZibTIod3ggLyA5NSwgd3ogLyA5NSwgc2VlZCArIDEwNiwgMikgLSAwLjUpICogMC4xMDtcbiAgY29uc3QgbGFuZG5lc3MgPSAxLjAgLSByYWRpYWwgKyBjb2FzdE5vaXNlO1xuICBjb25zdCBpbmxhbmQgPSBzbW9vdGhzdGVwKC0wLjAzLCAwLjEyLCBsYW5kbmVzcyk7XG5cbiAgY29uc3Qgb2NlYW5GbG9vciA9IC0xMyArIDYgKiBmYm0yKHd4IC8gMTcwLCB3eiAvIDE3MCwgc2VlZCArIDEwNywgMyk7XG5cbiAgLy8gUm9sbGluZyBsYW5kIGF0IHRocmVlIHNjYWxlcy4gVGhlIDQwIG0gYW5kIDE1IG0gY29tcG9uZW50cyBhcmUgcmVhbFxuICAvLyBzdXJmYWNlIGhlaWdodCwgbm90IGEgcmVuZGVyIGRlY29yYXRpb24sIHNvIHRoZSBtYWNybyBzYW1wbGVyIGFncmVlcy5cbiAgY29uc3Qgc3dlbGwgPSA0ICsgMTEgKiBmYm0yKHd4IC8gMzQwLCB3eiAvIDM0MCwgc2VlZCArIDEwOCwgNCk7XG4gIGNvbnN0IGhpbGxzID0gOCAqIGZibTIod3ggLyAxMTUsIHd6IC8gMTE1LCBzZWVkICsgMTA5LCAzKTtcbiAgY29uc3QgYnVtcHMgPSAyLjIgKiBmYm0yKHggLyA0MiwgeiAvIDQyLCBzZWVkICsgMTEwLCAyKVxuICAgICsgMC45ICogZmJtMih4IC8gMTUsIHogLyAxNSwgc2VlZCArIDExMSwgMik7XG5cbiAgLy8gUmlkZ2VkIGhpZ2hsYW5kcy4gVGhlIG1hc3NpZiBtYXNrIGlzIHJlZ2lvbmFsIGFuZCBiaWFzZWQgdG8gdGhlXG4gIC8vIG5vcnRoLXdlc3Q7IHdpdGhvdXQgdGhlIHJlZ2lvbmFsIGdhdGUgdGhlIGZpcnN0IE0wMDEgcGFzcyByYWlzZWQgYSA0OCBtXG4gIC8vIG1vdW50YWluIGRpcmVjdGx5IHVuZGVyIHRoZSBmb3VuZGVyIHNoZWxmLlxuICBjb25zdCBtYXNzaWZOb2lzZSA9IGZibTIod3ggLyA0ODAgKyAxMSwgd3ogLyA0ODAgLSA3LCBzZWVkICsgMTEyLCA0KTtcbiAgY29uc3QgbWFzc2lmTWFzayA9IHNtb290aHN0ZXAoMC42MCwgMC43OCwgbWFzc2lmTm9pc2UpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDIzMCwgd3ogLyAyMzAsIHNlZWQgKyAxMTMsIDQpIC0gMSk7XG4gIGNvbnN0IHJpZGdlMiA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDkwLCB3eiAvIDkwLCBzZWVkICsgMTE0LCAzKSAtIDEpO1xuICBjb25zdCBud0JpYXMgPSBNYXRoLmV4cCgtKCgod3ggKyAzNjApIC8gMzgwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAzMjApICoqIDIpKTtcbiAgY29uc3QgbW91bnQgPSBNYXRoLm1pbigxLCBtYXNzaWZNYXNrICogKDAuMzAgKyAwLjcwICogbndCaWFzKSArIDAuMjIgKiBud0JpYXMpO1xuXG4gIGxldCBoID0gc3dlbGwgKyBoaWxscyArIGJ1bXBzXG4gICAgKyBtb3VudCAqICgyMCArIDQwICogcmlkZ2UgKiByaWRnZSArIDEyICogcmlkZ2UyKTtcblxuICAvLyBTcHVycyBhbmQgZ3VsbGllcyBhdCAzMFx1MjAxMzkwIG0uIFdpdGhvdXQgdGhlc2UsIGEgc21vb3RoIGhpbGwgcXVhbnRpc2VkIHRvXG4gIC8vIDEgbSB2b3hlbHMgcmVhZHMgYXMgY29uY2VudHJpYyBjb250b3VyIHJpbmdzOyB3aXRoIHRoZW0sIHRoZSBzYW1lIGhpbGxcbiAgLy8gYnJlYWtzIGludG8gcmlkZ2VzLCBzaWRlIHZhbGxleXMgYW5kIHJvY2sgZmFjZXMuXG4gIGNvbnN0IHNwdXIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA4NSwgd3ogLyA4NSwgc2VlZCArIDEyMCwgMykgLSAxKTtcbiAgY29uc3QgZ3VsbHkgPSBNYXRoLnBvdygxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA1MiArIDEzLCB3eiAvIDUyIC0gNSwgc2VlZCArIDEyMSwgMykgLSAxKSwgMik7XG4gIGggKz0gKHNwdXIgLSAwLjU1KSAqIDUuMCAtIGd1bGx5ICogMy4yO1xuXG4gIGggPSBvY2VhbkZsb29yICsgKGggLSBvY2VhbkZsb29yKSAqIGlubGFuZDtcbiAgaCArPSAxLjYgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuXG4gIC8vIEJyb2FkIHJpdmVyIHZhbGxleSwgdGhlbiB0aGUgY2hhbm5lbCBpdHNlbGYuIFRoZSB2YWxsZXkgbWFzayBpcyBnYXRlZCBieVxuICAvLyBsYW5kbmVzczogd2l0aG91dCB0aGUgZ2F0ZSBpdCBwdWxsZWQgdGhlIG9jZWFuIGZsb29yIHVwIHRvIHRoZSB2YWxsZXlcbiAgLy8gZmxvb3Igb3V0c2lkZSB0aGUgaXNsYW5kLCB3aGljaCB0aGUgbWFwIHZpZXcgc2hvd2VkIGFzIHBhbGUgcml2ZXItc2hhcGVkXG4gIC8vIGJhcnMgcnVubmluZyB0byB0aGUgaG9yaXpvbi5cbiAgY29uc3QgcmQgPSByaXZlckRpc3RhbmNlKHd4LCB3eik7XG4gIGNvbnN0IHZhbGxleSA9IHNtb290aHN0ZXAoOTUsIDEwLCByZCkgKiBzbW9vdGhzdGVwKDAuMCwgMC4xMCwgbGFuZG5lc3MpO1xuICBjb25zdCB2YWxsZXlGbG9vciA9IDIuNSArIDEuMCAqIGZibTIod3ggLyA2MCwgd3ogLyA2MCwgc2VlZCArIDExNSwgMik7XG4gIGggPSBsZXJwKGgsIHZhbGxleUZsb29yLCB2YWxsZXkgKiAwLjc1KTtcbiAgY29uc3Qgcml2ZXJXID0gNS4wICsgMy4wICogZmJtMih3eCAvIDQ1LCB3eiAvIDQ1LCBzZWVkICsgMTE2LCAyKTtcbiAgLy8gQSB3aWRlLCBzaGFsbG93IGNoYW5uZWwgcHJvZmlsZS4gVGhlIGZpcnN0IHBhc3MgY2FydmVkIGEgMTIgbSBzbG90IHdpdGhcbiAgLy8gbmVhci12ZXJ0aWNhbCBiYW5rcywgd2hpY2ggcmVhZCBhcyBhIGJyaWdodCBzdG9uZSBxdWFycnkgcmF0aGVyIHRoYW4gYVxuICAvLyByaXZlci4gVGhlIG91dGVyIGVkZ2UgaXMgbm93IH4yNSBtIGZyb20gdGhlIGNlbnRyZWxpbmUsIGFuZCB0aGUgYmVkIGlzXG4gIC8vIG9ubHkgMiBtIGJlbG93IHNlYSBsZXZlbC5cbiAgY29uc3QgY2hhbm5lbCA9IHNtb290aHN0ZXAocml2ZXJXICsgMTgsIHJpdmVyVyAqIDAuNCwgcmQpO1xuICBpZiAobGFuZG5lc3MgPiAwLjApIGggPSBsZXJwKGgsIC0yLjAsIGNoYW5uZWwgKiAwLjk1KTtcblxuICAvLyBMYWtlIGJhc2luIGF0IHRoZSBmb290IG9mIHRoZSBub3J0aC13ZXN0IGhpZ2hsYW5kcy5cbiAgY29uc3QgbGFrZUQgPSBsYWtlRGlzdGFuY2Uod3gsIHd6KVxuICAgICogKDEgKyAwLjE4ICogKGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNywgMikgLSAwLjUpICogMik7XG4gIGlmIChsYWtlRCA8IDEuMTUpIHtcbiAgICBjb25zdCBsYWtlTWFzayA9IHNtb290aHN0ZXAoMS4xNSwgMC41NSwgbGFrZUQpO1xuICAgIGggPSBsZXJwKGgsIC02LjUsIGxha2VNYXNrICogMC45NSk7XG4gIH1cblxuICAvLyBGb3VuZGVyIHNoZWxmOiBhIHNtYWxsLCBpcnJlZ3VsYXIgYnVpbGRhYmxlIHRlcnJhY2Ugb24gdGhlIGVhc3QgYmFuay5cbiAgLy8gRGVsaWJlcmF0ZWx5IG5vdCBhIDI2MCBtIHJhZGlhbCBmbGF0dGVuOyB0aGUgcHJldmlvdXMgcGFzcyBzaG93ZWQgdGhhdCBhXG4gIC8vIGxhcmdlIGZsYXR0ZW4tdG8tY29uc3RhbnQgYmVjb21lcyBhIHZpc2libGUgYm93bCBvZiBjb250b3VyIHJpbmdzLlxuICBjb25zdCBzaGVsZkQgPSBNYXRoLnNxcnQoKCh4ICsgOCkgLyA2MikgKiogMiArICgoeiAtIDQpIC8gNDgpICoqIDIpXG4gICAgKyAoZmJtMih4IC8gNDUsIHogLyA0NSwgc2VlZCArIDExOCwgMikgLSAwLjUpICogMC41NTtcbiAgY29uc3Qgc2hlbGYgPSBzbW9vdGhzdGVwKDEuMDUsIDAuNTUsIHNoZWxmRCk7XG4gIGlmIChzaGVsZiA+IDApIHtcbiAgICBjb25zdCB0YXJnZXQgPSAxMy4wICsgMS4yICogZmJtMih4IC8gMzYsIHogLyAzNiwgc2VlZCArIDExOSwgMikgKyB4ICogMC4wMTtcbiAgICBoID0gbGVycChoLCB0YXJnZXQsIHNoZWxmICogMC43OCk7XG4gIH1cblxuICByZXR1cm4gTWF0aC5yb3VuZChjbGFtcChoLCAtMTQsIDkyKSk7XG59XG5cbmZ1bmN0aW9uIHNsb3BlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDEsIHopKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMSkpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDEpKSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gdG9wTWF0ZXJpYWxBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcj86IGJvb2xlYW4pOiBNYXRJZCB7XG4gIC8vIFJpdmVyIGJlZCBpcyBncmF2ZWw7IHRoZSBiZWFjaCBpcyBhIG5hcnJvdyBzYW5kIGJhbmQsIG5vdCB0aGUgd2hvbGVcbiAgLy8gdmFsbGV5IGZsb29yLiBUaGUgZmlyc3QgcGFzcyBtYXJrZWQgZXZlcnkgY2VsbCB3aXRoaW4gNCBtIG9mIHNlYSBsZXZlbFxuICAvLyBhcyBzYW5kLCB3aGljaCBwcm9kdWNlZCBhIGNvbnNwaWN1b3VzIHBhbGUgc3RyaXAgYWxvbmcgdGhlIHJpdmVyLlxuICBpZiAocml2ZXJEaXN0YW5jZSh4LCB6KSA8IDEyICYmIGggPCBTRUFfTEVWRUwgKyAxKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgaWYgKGggPD0gU0VBX0xFVkVMICsgMC41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChuZWFyV2F0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgIG5lYXJXYXRlciA9XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCAtIDMsIHopIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggKyAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6IC0gMykgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiArIDMpIDwgU0VBX0xFVkVMICsgMTtcbiAgfVxuICBpZiAobmVhcldhdGVyICYmIGggPD0gU0VBX0xFVkVMICsgMS41KSByZXR1cm4gTUFULlNBTkQ7XG4gIGlmIChzbG9wZSA+PSAzKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDU4ICYmIGZibTIoeCAvIDE4LCB6IC8gMTgsIHNlZWQgKyAxMjAsIDIpID4gMC40NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0OCAmJiBzbG9wZSA+PSAyKSByZXR1cm4gTUFULlNUT05FO1xuICBpZiAoaCA+IDQwICYmIHNsb3BlID49IDIgJiYgZmJtMih4IC8gMTIsIHogLyAxMiwgc2VlZCArIDEyMSwgMikgPiAwLjU1KSByZXR1cm4gTUFULlNUT05FO1xuICByZXR1cm4gTUFULkdSQVNTO1xuXG59XG5cbi8qKiBQdWJsaWMgYmFzZS1tYXRlcmlhbCBzZWxlY3RvciBmb3IgbWFjcm8gTE9EIGFuZCB0ZXN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlVG9wTWF0ZXJpYWwoXG4gIHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlciwgc2xvcGU6IG51bWJlciwgbmVhcldhdGVyOiBib29sZWFuLFxuKTogTWF0SWQge1xuICByZXR1cm4gdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbn1cblxuZnVuY3Rpb24gc3Vic29pbEZvcih0b3A6IE1hdElkKTogTWF0SWQge1xuICBpZiAodG9wID09PSBNQVQuR1JBU1MgfHwgdG9wID09PSBNQVQuTU9TUykgcmV0dXJuIE1BVC5TT0lMO1xuICBpZiAodG9wID09PSBNQVQuU0FORCkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAodG9wID09PSBNQVQuR1JBVkVMKSByZXR1cm4gTUFULkdSQVZFTDtcbiAgcmV0dXJuIE1BVC5TVE9ORTtcbn1cblxuZnVuY3Rpb24gb3JlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsdXN0ZXIgPSBmYm0yKHggLyA1NSwgeiAvIDU1LCBzZWVkICsgMTMwLCAyKTtcbiAgaWYgKGNsdXN0ZXIgPCAwLjU3KSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IG4gPSB2YWx1ZU5vaXNlMyh4ICogMC4wOSwgeSAqIDAuMTMsIHogKiAwLjA5LCBzZWVkICsgMTMxKTtcbiAgY29uc3QgbjIgPSB2YWx1ZU5vaXNlMyh4ICogMC4yMiArIDUsIHkgKiAwLjMxLCB6ICogMC4yMiAtIDMsIHNlZWQgKyAxMzIpO1xuICByZXR1cm4gbiA+IDAuNzAgJiYgbjIgPiAwLjUwO1xufVxuXG5mdW5jdGlvbiBjYXZlQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBmYm0zKHggKiAwLjA3NSwgeSAqIDAuMTEsIHogKiAwLjA3NSwgc2VlZCArIDE0MCwgMikgPiAwLjcyO1xufVxuXG5mdW5jdGlvbiBvdmVyaGFuZ0F0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gdmFsdWVOb2lzZTMoeCAqIDAuMTgsIHkgKiAwLjIyLCB6ICogMC4xOCwgc2VlZCArIDE0MSkgPiAwLjYyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cmZhY2VTYW1wbGUge1xuICB5OiBudW1iZXI7XG4gIHRvcDogTWF0SWQ7XG4gIHNsb3BlOiBudW1iZXI7XG59XG5cbi8qKiBCYXNlIHN1cmZhY2Ugc2FtcGxlIGZvciBtYWNybyBMT0QuIERvZXMgbm90IGluY2x1ZGUgdm94ZWwgZWRpdHMvb3ZlcmhhbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbXBsZVN1cmZhY2Uoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IFN1cmZhY2VTYW1wbGUge1xuICBjb25zdCB5ID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHopO1xuICBjb25zdCBzbG9wZSA9IHNsb3BlQXQoc2VlZCwgeCwgeiwgeSk7XG4gIHJldHVybiB7IHksIHRvcDogdG9wTWF0ZXJpYWxBdChzZWVkLCB4LCB6LCB5LCBzbG9wZSksIHNsb3BlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2h1bmsgZ2VuZXJhdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuICByZXR1cm4gZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogVm94ZWxDaHVuayB8IG51bGwge1xuICBpZiAoY3ggPCAwIHx8IGN6IDwgMCB8fCBjeCA+PSBDSFVOS1NfUEVSX1NJREUgfHwgY3ogPj0gQ0hVTktTX1BFUl9TSURFKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gIGlmIChleGlzdGluZykgcmV0dXJuIGV4aXN0aW5nO1xuXG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IGRhdGEgPSBuZXcgVWludDhBcnJheShDSFVOS19WT0xVTUUpO1xuICBjb25zdCBoZWlnaHRzID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfQVJFQSk7XG4gIGNvbnN0IHRvcE1hdGVyaWFscyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgY29uc3Qgc2VlZCA9IHdvcmxkLnNlZWQ7XG5cbiAgLy8gUGFkZGVkIGhlaWdodCBjYWNoZTogYSB0aHJlZS1jZWxsIGJvcmRlciBjb3ZlcnMgc2xvcGUsIGJlYWNoIGFuZCBsZWRnZXMuXG4gIGNvbnN0IFAgPSAzO1xuICBjb25zdCBQVyA9IENIVU5LX1NJWkUgKyBQICogMjtcbiAgY29uc3QgYmFzZUggPSBuZXcgSW50MTZBcnJheShQVyAqIFBXKTtcbiAgZm9yIChsZXQgcHogPSAwOyBweiA8IFBXOyBweisrKSB7XG4gICAgZm9yIChsZXQgcHggPSAwOyBweCA8IFBXOyBweCsrKSB7XG4gICAgICBiYXNlSFtweiAqIFBXICsgcHhdID0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIG94ICsgcHggLSBQLCBveiArIHB6IC0gUCk7XG4gICAgfVxuICB9XG5cbiAgbGV0IG5vbkFpciA9IDA7XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHd4ID0gb3ggKyBseCwgd3ogPSBveiArIGx6O1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5lYXJXYXRlciA9XG4gICAgICAgIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMyldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCAtIDMpICogUFcgKyAobHggKyBQKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgKyAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMTtcbiAgICAgIGNvbnN0IHRvcCA9IHRvcE1hdGVyaWFsQXQoc2VlZCwgd3gsIHd6LCBoLCBzbG9wZSwgbmVhcldhdGVyKTtcbiAgICAgIGNvbnN0IHN1YiA9IHN1YnNvaWxGb3IodG9wKTtcbiAgICAgIGNvbnN0IG9yZVBvdGVudGlhbCA9IGZibTIod3ggLyA1NSwgd3ogLyA1NSwgc2VlZCArIDEzMCwgMikgPiAwLjU3O1xuICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG5cbiAgICAgIGNvbnN0IHN0YXJ0ID0gWV9NSU47XG4gICAgICBjb25zdCBlbmQgPSBNYXRoLm1pbihZX01BWCAtIDEsIGggLSAxKTtcbiAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8PSBlbmQ7IHkrKykge1xuICAgICAgICBjb25zdCBkZXB0aCA9IGggLSAxIC0geTtcbiAgICAgICAgbGV0IG06IE1hdElkO1xuICAgICAgICBpZiAoeSA9PT0gWV9NSU4pIG0gPSBNQVQuQkVEUk9DSztcbiAgICAgICAgZWxzZSBpZiAoZGVwdGggPT09IDApIG0gPSB0b3A7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoIDw9IDIpIG0gPSBzdWI7XG4gICAgICAgIGVsc2UgbSA9IE1BVC5TVE9ORTtcblxuICAgICAgICBpZiAobSA9PT0gTUFULlNUT05FICYmIGRlcHRoID4gNCAmJiBvcmVQb3RlbnRpYWwgJiYgb3JlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuT1JFO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3BhcnNlIDNEIG92ZXJoYW5ncy91bmRlcmN1dHMgYXQgc3RlZXAgZmFjZXMuIFRoaXMgaXMgYSByZWFsXG4gICAgICAgIC8vIG9jY3VwYW5jeSBjaGFuZ2UsIG5vdCBhIGRlY29yYXRpb24gb24gdG9wIG9mIGEgaGVpZ2h0ZmllbGQuXG4gICAgICAgIGlmIChkZXB0aCA8PSAyICYmIHNsb3BlID49IDIgJiYgb3ZlcmhhbmdBdChzZWVkLCB3eCwgeSwgd3opKSB7XG4gICAgICAgICAgbSA9IE1BVC5BSVI7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVlcCBjYXZlcywga2VwdCBhd2F5IGZyb20gdGhlIHN1cmZhY2Ugc28gdGhleSBkbyBub3QgY3JlYXRlIGhvbGVzLlxuICAgICAgICBpZiAobSAhPT0gTUFULkFJUiAmJiBkZXB0aCA+IDcgJiYgZGVwdGggPCAyNCAmJiBjYXZlQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildID0gbTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBXYXRlciB2b2x1bWU6IGV2ZXJ5dGhpbmcgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UgdXAgdG8gc2VhIGxldmVsLlxuICAgICAgaWYgKGggPCBTRUFfTEVWRUwpIHtcbiAgICAgICAgZm9yIChsZXQgeSA9IE1hdGgubWF4KFlfTUlOLCBoKTsgeSA8IFNFQV9MRVZFTDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KTtcbiAgICAgICAgICBpZiAoZGF0YVtpZHhdID09PSBNQVQuQUlSKSB7XG4gICAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuV0FURVI7XG4gICAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9wU29saWQgPSBNYXRoLm1pbihZX01BWCAtIDEsIE1hdGgubWF4KFlfTUlOLCBoIC0gMSkpO1xuICAgICAgaGVpZ2h0c1tjb2xdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICB0b3BNYXRlcmlhbHNbY29sXSA9IHRvcDtcbiAgICB9XG4gIH1cblxuICAvLyBQcm90cnVkaW5nIGxlZGdlczogb25lIG9yIHR3byBzdG9uZSBibG9ja3MgZXh0ZW5kIGZyb20gYSBoaWdoIGNvbHVtbiBvdmVyXG4gIC8vIGEgbG93ZXIgbmVpZ2hib3VyLiBUaGV5IGNyZWF0ZSByZWFkYWJsZSBvdmVyaGFuZ3Mgd2l0aG91dCBhIGZ1bGwgY2F2ZSBwYXNzLlxuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCBoID0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFApXTtcbiAgICAgIGNvbnN0IHNsb3BlID0gTWF0aC5tYXgoXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCArIDEpXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQIC0gMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICAgIE1hdGguYWJzKGggLSBiYXNlSFsobHogKyBQICsgMSkgKiBQVyArIChseCArIFApXSksXG4gICAgICApO1xuICAgICAgaWYgKHNsb3BlIDwgMikgY29udGludWU7XG4gICAgICBjb25zdCBkaXJzOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiA9IFtbLTEsIDBdLCBbMSwgMF0sIFswLCAtMV0sIFswLCAxXV07XG4gICAgICBmb3IgKGNvbnN0IFtkeCwgZHpdIG9mIGRpcnMpIHtcbiAgICAgICAgY29uc3QgbnggPSBseCArIGR4LCBueiA9IGx6ICsgZHo7XG4gICAgICAgIGlmIChueCA8IDAgfHwgbnogPCAwIHx8IG54ID49IENIVU5LX1NJWkUgfHwgbnogPj0gQ0hVTktfU0laRSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IG5oID0gYmFzZUhbKG56ICsgUCkgKiBQVyArIChueCArIFApXTtcbiAgICAgICAgaWYgKGggLSBuaCA8IDIpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoaGFzaDNpKGx4LCBseiwgZHggKiAzICsgZHogKiA3LCBzZWVkICsgMTUwKSA8IDAuNTUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB5ID0gaCAtIDI7XG4gICAgICAgIGlmICh5IDwgWV9NSU4gfHwgeSA+PSBoKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgaWR4ID0gbG9jYWxJbmRleChueCwgeVRvSW5kZXgoeSksIG56KTtcbiAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgIGRhdGFbaWR4XSA9IE1BVC5TVE9ORTtcbiAgICAgICAgICBub25BaXIrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJlY29tcHV0ZSB0aGUgY29sdW1uIGNhY2hlIGFmdGVyIGxlZGdlcy9jYXZlcy4gVGhlIGV4cG9zZWQgdG9wIG1hdGVyaWFsXG4gIC8vIG11c3QgY29tZSBmcm9tIHRoZSBhY3R1YWwgdG9wIHNvbGlkIHZveGVsLCBub3QgdGhlIHByZS1jYXJ2ZSBndWVzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICBsZXQgdG9wTWF0OiBudW1iZXIgPSB0b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICAgICAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgICAgIGNvbnN0IG0gPSBkYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildO1xuICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICB9XG4gICAgICBoZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRvcE1hdDtcbiAgICB9XG4gIH1cblxuICBjb25zdCBjaHVuazogVm94ZWxDaHVuayA9IHtcbiAgICBjeCwgY3osIGtleSwgZGF0YSwgaGVpZ2h0cywgdG9wTWF0ZXJpYWxzLCBub25BaXIsXG4gICAgZGlydHk6IHRydWUsXG4gICAgZ2VuZXJhdGVkQXQ6IHBlcmZvcm1hbmNlLm5vdygpLFxuICB9O1xuXG4gIC8vIEFwcGx5IGR1cmFibGUgZWRpdHMgYWZ0ZXIgYmFzZSBnZW5lcmF0aW9uLlxuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICBpZiAoZWRpdHMpIHtcbiAgICBmb3IgKGNvbnN0IFtpZHgsIG1dIG9mIGVkaXRzKSB7XG4gICAgICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICAgIH1cbiAgICAvLyBSZWNvbXB1dGUgdGhlIGNhY2hlIGZvciBlZGl0ZWQgY2h1bmtzLlxuICAgIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykgdXBkYXRlQ29sdW1uQ2FjaGUoY2h1bmssIGx4LCBseik7XG4gICAgfVxuICB9XG4gIC8vIE5vbi1haXIgY291bnRzIGFyZSBkZXJpdmVkIHJlbmRlcmVyIHN0YXRpc3RpY3MsIG5vdCBkdXJhYmxlIHdvcmxkIHN0YXRlLlxuICAvLyBFZGl0ZWQgYmFzZSBhaXIgbWF5IGJlY29tZSBzb2xpZCAoYW5kIHZpY2UgdmVyc2EpIGR1cmluZyByZXN0b3JhdGlvbi5cbiAgbGV0IGVkaXRlZE5vbkFpciA9IDA7XG4gIGZvciAoY29uc3QgbWF0ZXJpYWwgb2YgY2h1bmsuZGF0YSkgaWYgKG1hdGVyaWFsICE9PSBNQVQuQUlSKSBlZGl0ZWROb25BaXIrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IGVkaXRlZE5vbkFpciAtIG5vbkFpcjtcblxuICB3b3JsZC5jaHVua3Muc2V0KGtleSwgY2h1bmspO1xuICB3b3JsZC5zdGF0cy5jaHVua3NHZW5lcmF0ZWQrKztcbiAgd29ybGQuc3RhdHMudm94ZWxzRmlsbGVkICs9IG5vbkFpcjtcbiAgd29ybGQuc3RhdHMuZ2VuZXJhdGlvbk1zICs9IHBlcmZvcm1hbmNlLm5vdygpIC0gdDA7XG4gIHdvcmxkLmRpcnR5LmFkZChrZXkpO1xuXG4gIGdlbmVyYXRlRW50aXRpZXMod29ybGQsIGNodW5rKTtcbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vKiogQSBiYXNlLXRlcnJhaW4gY2FjaGUgc2hhcmVkIGJ5IGVkaXRlZCBhbmQgdW5lZGl0ZWQgcmVnZW5lcmF0aW9uLiBOYXR1cmFsXG4gKiBzY2VuZXJ5IG5ldmVyIGRlcGVuZHMgb24gbGF0ZXIgdm94ZWwgZWRpdHM7IHRoaXMgYWxzbyBsZXRzIGEgc25hcHNob3QgcmVzdG9yZVxuICogYSBoYXJ2ZXN0ZWQgY2h1bmsgd2l0aG91dCBtYXRlcmlhbGl6aW5nIHVucmVsYXRlZCBuZWlnaGJvdXJpbmcgY2h1bmtzLiAqL1xuY29uc3QgYmFzZUNvbHVtbkNhY2hlID0gbmV3IFdlYWtNYXA8V29ybGQsIE1hcDxzdHJpbmcsIHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0+PigpO1xuXG5mdW5jdGlvbiBiYXNlQ29sdW1ucyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogeyBoZWlnaHRzOiBVaW50OEFycmF5OyB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXkgfSB7XG4gIGxldCBjYWNoZSA9IGJhc2VDb2x1bW5DYWNoZS5nZXQod29ybGQpO1xuICBpZiAoIWNhY2hlKSB7IGNhY2hlID0gbmV3IE1hcCgpOyBiYXNlQ29sdW1uQ2FjaGUuc2V0KHdvcmxkLCBjYWNoZSk7IH1cbiAgY29uc3QgY2FjaGVkID0gY2FjaGUuZ2V0KGNodW5rLmtleSk7XG4gIGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG4gIGNvbnN0IGNvbHVtbnMgPSB7IGhlaWdodHM6IG5ldyBVaW50OEFycmF5KGNodW5rLmhlaWdodHMpLCB0b3BNYXRlcmlhbHM6IG5ldyBVaW50OEFycmF5KGNodW5rLnRvcE1hdGVyaWFscykgfTtcbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgeCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCkgKyBseCwgeiA9IGNodW5rT3JpZ2luWihjaHVuay5jeikgKyBsejtcbiAgICAgIGNvbnN0IGggPSBzdXJmYWNlSGVpZ2h0QXQod29ybGQuc2VlZCwgeCwgeik7XG4gICAgICBjb25zdCBzbG9wZSA9IHNsb3BlQXQod29ybGQuc2VlZCwgeCwgeiwgaCk7XG4gICAgICBjb25zdCBpbmRleCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgY29sdW1ucy5oZWlnaHRzW2luZGV4XSA9IGNsYW1wKGggLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gICAgICBjb2x1bW5zLnRvcE1hdGVyaWFsc1tpbmRleF0gPSB0b3BNYXRlcmlhbEF0KHdvcmxkLnNlZWQsIHgsIHosIGgsIHNsb3BlKTtcbiAgICB9XG4gIH1cbiAgY2FjaGUuc2V0KGNodW5rLmtleSwgY29sdW1ucyk7XG4gIHJldHVybiBjb2x1bW5zO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXZpY3RDaHVuayh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghd29ybGQuY2h1bmtzLmhhcyhrZXkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmNodW5rcy5kZWxldGUoa2V5KTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzRXZpY3RlZCsrO1xuICAvLyBDaHVuayBieXRlcyBhbmQgY29sdW1uIGNhY2hlcyBhcmUgcmVnZW5lcmF0ZWQgb24gZGVtYW5kLiBFbnRpdGllcyByZW1haW5cbiAgLy8gYXV0aG9yaXRhdGl2ZTogZXZpY3Rpb24gbXVzdCBub3QgZm9yZ2V0IHRoZWlyIHBlcnNpc3RlbnQgc3RhdGUuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyAtLS0tLS0tLS0tIHF1ZXJpZXMgLyBlZGl0cyAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZ2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBtOiBNYXRJZCk6IGJvb2xlYW4ge1xuICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gWV9NQVgpIHJldHVybiBmYWxzZTtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgaWR4ID0gbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIGNvbnN0IHByZXZpb3VzRWRpdCA9IHdvcmxkLmVkaXRzLmdldChjaHVua0tleShjeCwgY3opKT8uZ2V0KGlkeCk7XG4gIC8vIEEgY2h1bmsgZXZpY3RlZCBhZnRlciBhbiBlYXJsaWVyIGVkaXQgY2FuIHJlZ2VuZXJhdGUgd2l0aCB0aGF0IGR1cmFibGVcbiAgLy8gbWF0ZXJpYWwgYWxyZWFkeSBhcHBsaWVkLiBEcm9wcGluZyB0aGUgZWRpdCBoZXJlIHdvdWxkIG1ha2UgaXQgZGlzYXBwZWFyXG4gIC8vIG9uIHRoZSBuZXh0IGV2aWN0aW9uL3Jlc3RvcmF0aW9uLCBldmVuIHRob3VnaCB0aGUgY3VycmVudCB3cml0ZSBuby1vcHMuXG4gIGlmIChwcmV2aW91c0VkaXQgPT09IG0pIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIGZhbHNlO1xuICBsZXQgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKCFlZGl0cykgeyBlZGl0cyA9IG5ldyBNYXAoKTsgd29ybGQuZWRpdHMuc2V0KGNodW5rLmtleSwgZWRpdHMpOyB9XG4gIC8vIEFuIGlkZW1wb3RlbnQgd3JpdGUgbXVzdCBzdGlsbCByZXN0b3JlIGEgZHVyYWJsZSBkZWx0YSBkaXNjYXJkZWQgYnkgYW5cbiAgLy8gb2xkZXIgc25hcHNob3Qgb3IgZGVsdGEgZGVjb2Rlci4gSXQgaXMgbm90IGEgbmV3IGF1dGhvcml0YXRpdmUgcmV2aXNpb24uXG4gIGlmIChjaHVuay5kYXRhW2lkeF0gPT09IG0pIHtcbiAgICBpZiAoIWVkaXRzLmhhcyhpZHgpKSBlZGl0cy5zZXQoaWR4LCBtKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgZWRpdHMuc2V0KGlkeCwgbSk7XG4gIGNodW5rLmRpcnR5ID0gdHJ1ZTtcbiAgd29ybGQuZGlydHkuYWRkKGNodW5rLmtleSk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCB3b3JsZFRvTG9jYWxYKHgpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rOiBWb3hlbENodW5rLCBseDogbnVtYmVyLCBsejogbnVtYmVyKTogdm9pZCB7XG4gIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICBpZiAoaXNTb2xpZChjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildKSkgeyB0b3BTb2xpZCA9IHk7IGJyZWFrOyB9XG4gIH1cbiAgY2h1bmsuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgY29uc3QgdG0gPSBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdO1xuICBpZiAodG9wU29saWQgPj0gWV9NSU4pIHtcbiAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh0b3BTb2xpZCksIGx6KV07XG4gICAgaWYgKG0gIT09IE1BVC5XQVRFUikgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IG07XG4gIH0gZWxzZSB7XG4gICAgY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IHRtO1xuICB9XG59XG5cbi8qKlxuICogVGhlIHkgY29vcmRpbmF0ZSBvZiB0aGUgZXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uIGF0IHgvei5cbiAqIEEgc29saWQgdm94ZWwgYXQgeSBvY2N1cGllcyBbeSwgeSsxKSwgc28gdGhlIHdhbGthYmxlIHN1cmZhY2UgaXMgdG9wU29saWQrMS5cbiAqIFRoaXMgaXMgYSBkZXJpdmVkIHF1ZXJ5OyB0aGUgYXV0aG9yaXRhdGl2ZSBzdGF0ZSByZW1haW5zIHRoZSB2b3hlbCB2b2x1bWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdXJmYWNlQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBZX01JTjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBZX01JTjtcbiAgcmV0dXJuIGNodW5rLmhlaWdodHNbd29ybGRUb0xvY2FsWih6KSAqIENIVU5LX1NJWkUgKyB3b3JsZFRvTG9jYWxYKHgpXSArIFlfTUlOICsgMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gTUFULkFJUjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBNQVQuQUlSO1xuICByZXR1cm4gY2h1bmsudG9wTWF0ZXJpYWxzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gYXMgTWF0SWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWlnaHRBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXRlckRlcHRoQXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGggPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICByZXR1cm4gaCA8IFNFQV9MRVZFTCA/IFNFQV9MRVZFTCAtIGggOiAwO1xufVxuXG4vLyAtLS0tLS0tLS0tIGVudGl0aWVzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGFkZEVudGl0eSh3b3JsZDogV29ybGQsIGU6IEVudGl0eSk6IHZvaWQge1xuICBpZiAod29ybGQuZW50aXRpZXMuaGFzKGUuaWQpIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpXG4gICAgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpKSByZXR1cm47XG4gIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBlKTtcbiAgbGV0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAoIWxpc3QpIHsgbGlzdCA9IFtdOyB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIGxpc3QpOyB9XG4gIGxpc3QucHVzaChlLmlkKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICAvLyBHZW5lcmF0aW9uIGlzIGRldGVybWluaXN0aWMgYW5kIGFkdmFuY2VzIG5vIHBsYXllci1jb21tYW5kIHByZWNvbmRpdGlvbi5cbiAgLy8gQXV0aG9yZWQgc2NhZmZvbGRpbmcgbWF5IHRyYW5zaWVudGx5IGNoYW5nZSBpdDsgdGhlIHNuYXBzaG90IHJlc3RvcmVzIHRoZVxuICAvLyBzYXZlZCByZXZpc2lvbiBhZnRlciBwbGFjaW5nIHRoYXQgc2NhZmZvbGRpbmcuXG59XG5cbi8qKlxuICogUmVtb3ZlIGFuIGVudGl0eSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHdvcmxkLiBVc2VkIHdoZW4gYSBzaXRlIGlzIGNsZWFyZWQ6XG4gKiB0aGUgcmVzb3VyY2UgeWllbGQgaXMgYWNjb3VudGVkIGZvciBieSB0aGUgY2FsbGVyLCBhbmQgdGhlIGVudGl0eSBtdXN0IHN0b3BcbiAqIGV4aXN0aW5nIGZvciBjb2xsaXNpb24sIG9ic3RydWN0aW9uIGFuZCBwZXJzaXN0ZW5jZSwgbm90IGp1c3QgYmUgaGlkZGVuIGJ5XG4gKiB0aGUgcmVuZGVyZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICBpZiAoIWUgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGlkKTtcbiAgY29uc3QgbGlzdCA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoZS5jaHVuayk7XG4gIGlmIChsaXN0KSB7XG4gICAgY29uc3QgaSA9IGxpc3QuaW5kZXhPZihpZCk7XG4gICAgaWYgKGkgPj0gMCkgbGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoaWQpO1xuICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnBpbmtUcmVlcyAtIDEpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlJZChjaHVuazogc3RyaW5nLCBpOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gYGU6JHtjaHVua306JHtpfWA7XG59XG5cbmZ1bmN0aW9uIGZvcmVzdFNjb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGVhc3QgPSBNYXRoLmV4cCgtKCgod3ggLSAyMjApIC8gMjYwKSAqKiAyICsgKCh3eiArIDExMCkgLyAyMjApICoqIDIpKTtcbiAgY29uc3Qgbm9ydGggPSBNYXRoLmV4cCgtKCgod3ggLSAyMCkgLyAzMDApICoqIDIgKyAoKHd6ICsgMzAwKSAvIDE5MCkgKiogMikpO1xuICBjb25zdCB3ZXN0ID0gTWF0aC5leHAoLSgoKHd4ICsgMzQwKSAvIDIwMCkgKiogMiArICgod3ogLSAxMjApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IHNvdXRoID0gTWF0aC5leHAoLSgoKHd4IC0gMTIwKSAvIDI0MCkgKiogMiArICgod3ogLSAzMzApIC8gMTgwKSAqKiAyKSk7XG4gIGNvbnN0IG1vaXN0dXJlID0gZmJtMih3eCAvIDI2MCwgd3ogLyAyNjAsIHNlZWQgKyAyMDEsIDQpO1xuICBjb25zdCB2YWxsZXkgPSBNYXRoLmV4cCgtKCh3eCAvIDE0MCkgKiogMiArICh3eiAvIDEwNSkgKiogMikpO1xuICByZXR1cm4gTWF0aC5tYXgoZWFzdCwgbm9ydGggKiAwLjkyLCB3ZXN0ICogMC44MCwgc291dGggKiAwLjc4KSAqIDAuODJcbiAgICArIG1vaXN0dXJlICogMC4zOCAtIDAuMjIgLSB2YWxsZXkgKiAwLjM0O1xufVxuXG5mdW5jdGlvbiByb2NrU2NvcmUod3g6IG51bWJlciwgd3o6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgbW91bnRhaW4gPSBmYm0yKHd4IC8gMzMwLCB3eiAvIDMzMCwgc2VlZCArIDIwMiwgMyk7XG4gIGNvbnN0IHJpZGdlID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gMTQwLCB3eiAvIDE0MCwgc2VlZCArIDIwMywgMykgLSAxKTtcbiAgcmV0dXJuIG1vdW50YWluICogMC41NSArIHJpZGdlICogMC40NTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdGllcyh3b3JsZDogV29ybGQsIGNodW5rOiBWb3hlbENodW5rKTogdm9pZCB7XG4gIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQsIGNodW5rLmN4LCBjaHVuay5jeik7XG59XG5cbi8qKiBAaW50ZXJuYWwgUmVwbGF5cyBkZXRlcm1pbmlzdGljIGdlbmVyYXRpb24gZm9yIHNuYXBzaG90IGVudGl0eSBkZWx0YXMuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVFbnRpdHlDaHVuayh3b3JsZDogV29ybGQsIGN4OiBudW1iZXIsIGN6OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qga2V5ID0gY2h1bmtLZXkoY3gsIGN6KTtcbiAgaWYgKHdvcmxkLmVudGl0eUNodW5rcy5oYXMoa2V5KSkgcmV0dXJuO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm47XG5cbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMigoaGFzaDJpKGNodW5rLmN4LCBjaHVuay5jeiwgd29ybGQuc2VlZCArIDkwMCkgKiA0Mjk0OTY3Mjk2KSA+Pj4gMCk7XG4gIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICBjb25zdCBjb2x1bW5zID0gYmFzZUNvbHVtbnMod29ybGQsIGNodW5rKTtcbiAgbGV0IG4gPSAwO1xuICBsZXQgbmF0dXJhbFRyZWVzID0gMDtcbiAgbGV0IG5hdHVyYWxQaW5rVHJlZXMgPSAwO1xuXG4gIGNvbnN0IGxvY2FsU3VyZmFjZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSArIFlfTUlOO1xuICB9O1xuICBjb25zdCBsb2NhbFRvcCA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogTWF0SWQgPT4ge1xuICAgIHJldHVybiBjb2x1bW5zLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gYXMgTWF0SWQ7XG4gIH07XG4gIGNvbnN0IGxvY2FsU2xvcGUgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgIHJldHVybiBNYXRoLm1heChcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggLSAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogLSAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgKTtcbiAgfTtcblxuICAvLyBBIGppdHRlcmVkIDggbSBsYXR0aWNlIGdpdmVzIGNvaGVyZW50IG1hc3NlcyBhbmQgYXZvaWRzIHBlci1mcmFtZSBzY2F0dGVyLlxuICBmb3IgKGxldCBneiA9IDA7IGd6IDwgQ0hVTktfU0laRTsgZ3ogKz0gOCkge1xuICAgIGZvciAobGV0IGd4ID0gMDsgZ3ggPCBDSFVOS19TSVpFOyBneCArPSA4KSB7XG4gICAgICBjb25zdCBseCA9IGNsYW1wKE1hdGguZmxvb3IoZ3ggKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCBseiA9IGNsYW1wKE1hdGguZmxvb3IoZ3ogKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICAgIGlmIChoIDw9IFNFQV9MRVZFTCArIDEpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgc2xvcGUgPSBsb2NhbFNsb3BlKGx4LCBseik7XG4gICAgICBjb25zdCB0b3AgPSBsb2NhbFRvcChseCwgbHopO1xuICAgICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGZvcmVzdCA9IGZvcmVzdFNjb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2NreSA9IHJvY2tTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9sbCA9IHJuZCgpO1xuXG4gICAgICBjb25zdCB0cmVlQ2hhbmNlID0gZm9yZXN0ID4gMC41MCA/IDAuNzIgOiBmb3Jlc3QgPiAwLjMwID8gMC4yNSA6IDAuMDU7XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMiAmJiByb2xsIDwgdHJlZUNoYW5jZSkge1xuICAgICAgICAvLyBUaGUgY2FwIGlzIGEgZGV0ZXJtaW5pc3RpYyBuYXR1cmFsLWdlbmVyYXRpb24gcHJvcGVydHkuIEl0IGNhbm5vdFxuICAgICAgICAvLyBkZXBlbmQgb24gd2hpY2ggY2h1bmtzIGEgcmVuZGVyZXIgbG9hZGVkIGJlZm9yZSB0aGlzIG9uZS5cbiAgICAgICAgbGV0IGtpbmQ6IEVudGl0eUtpbmQ7XG4gICAgICAgIGxldCB2YXJpYW50OiBudW1iZXI7XG4gICAgICAgIGNvbnN0IHNwZWNpZXNSb2xsID0gcm5kKCk7XG4gICAgICAgIGlmIChzcGVjaWVzUm9sbCA8IDAuMTIpIHtcbiAgICAgICAgICBpZiAoKG5hdHVyYWxQaW5rVHJlZXMgKyAxKSA+IDAuMjUgKiAobmF0dXJhbFRyZWVzICsgMSkpIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtPdmVyZmxvdysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9ibG9zc29tJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMik7XG4gICAgICAgICAgICBuYXR1cmFsUGlua1RyZWVzKys7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjQwKSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfc3BpcmUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc3BlY2llc1JvbGwgPCAwLjc0KSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfdGFibGUnO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogNCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAzKTtcbiAgICAgICAgfVxuICAgICAgICBuYXR1cmFsVHJlZXMrKztcbiAgICAgICAgd29ybGQuc3RhdHMudHJlZXMrKztcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuODggKyBybmQoKSAqIDAuMjQsIHZhcmlhbnQsXG4gICAgICAgICAgcmVzb3VyY2U6ICd3b29kJywgcmVtYWluaW5nOiAxMiwgeWllbGRQZXJIYXJ2ZXN0OiA0LFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiByb2NreSA+IDAuNDYgJiYgcm9sbCA8IDAuMzgpIHtcbiAgICAgICAgLy8gQ29uc3VtZSB0aGUgcmV0aXJlZCBzdG9uZSBmb3JtJ3MgcmFuZG9tIGRyYXdzIGFuZCBhbGxvY2F0ZSBpdHMgb2xkXG4gICAgICAgIC8vIHNlcXVlbmNlIElELCBidXQgZG8gbm90IGluc2VydCBhbiBlbnRpdHkuIExhdGVyIG5hdHVyYWwgcGxhY2VtZW50c1xuICAgICAgICAvLyB0aGVyZWZvcmUgcmVtYWluIGJ5dGUtZm9yLWJ5dGUgY29tcGF0aWJsZSB3aXRoIHJlY29yZGVkIHNhdmVzLlxuICAgICAgICBjb25zdCBzaXplUm9sbCA9IHJuZCgpO1xuICAgICAgICBjb25zdCBraW5kOiBFbnRpdHlLaW5kID0gc2l6ZVJvbGwgPCAwLjU1ID8gJ3N0eWxfcm9ja19zbWFsbCdcbiAgICAgICAgICA6IHNpemVSb2xsIDwgMC45MCA/ICdzdHlsX3JvY2tfbWVkaXVtJyA6ICdzdHlsX3JvY2tfbGFyZ2UnO1xuICAgICAgICBjb25zdCBpZCA9IGVudGl0eUlkKGNodW5rLmtleSwgbisrKTtcbiAgICAgICAgY29uc3QgcmVjb3JkID0ge1xuICAgICAgICAgIGlkLCBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcmVzb3VyY2U6ICdzdG9uZScgYXMgY29uc3QsXG4gICAgICAgICAgcmVtYWluaW5nOiBraW5kID09PSAnc3R5bF9yb2NrX3NtYWxsJyA/IDQgOiBraW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyA4IDogMTIsXG4gICAgICAgICAgeWllbGRQZXJIYXJ2ZXN0OiAzLCBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjkgKyBybmQoKSAqIDAuMiwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICB9O1xuICAgICAgICAvLyBPbmx5IGVudGl0aWVzIHRoYXQgZXhpc3RlZCBpbiBhbiBhY2NlcHRlZCBvbGQgc2F2ZSBnZXQgdG9tYnN0b25lcyxcbiAgICAgICAgLy8gZHVyaW5nIGV4cGxpY2l0IG1pZ3JhdGlvbi4gT3JkaW5hcnkgZ2VuZXJhdGlvbiBtdXN0IHJlc3RvcmUgZXhhY3RseS5cbiAgICAgICAgaWYgKGlzU3RvbmVSZXBsYXkod29ybGQpKSBhZGRFbnRpdHkod29ybGQsIHJlY29yZCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKHRvcCA9PT0gTUFULlNUT05FICYmIHJvY2t5ID4gMC41OCAmJiByb2xsIDwgMC4xOCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX29yZScsIGNodW5rOiBjaHVuay5rZXksIHg6IHd4ICsgMC41LCB5OiBoLCB6OiB3eiArIDAuNSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAyKSxcbiAgICAgICAgICByZXNvdXJjZTogJ29yZScsIHJlbWFpbmluZzogOCwgeWllbGRQZXJIYXJ2ZXN0OiAyLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5HUkFTUyAmJiBzbG9wZSA8PSAxICYmIHJvbGwgPCAwLjMwKSB7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZDogJ3N0eWxfc2hydWInLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOCArIHJuZCgpICogMC40LCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgICAgcmVzb3VyY2U6ICdmaWJlcicsIHJlbWFpbmluZzogNCwgeWllbGRQZXJIYXJ2ZXN0OiAxLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRBdXRob3JlZEVudGl0eSh3b3JsZDogV29ybGQsIGtpbmQ6IEVudGl0eUtpbmQsIHg6IG51bWJlciwgejogbnVtYmVyLCB2YXJpYW50OiBudW1iZXIsIHJvdDogbnVtYmVyLCBzY2FsZTogbnVtYmVyLCByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbCwgcmVtYWluaW5nOiBudW1iZXIsIHlpZWxkUGVySGFydmVzdDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBpZiAoeSA8PSBTRUFfTEVWRUwpIHJldHVybjtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIC8vIEEgaGVybyBhc3NldCBvd25zIGl0cyBzcG90OiBjbGVhciBhbnkgZ2VuZXJhdGVkIGVudGl0eSB0aGF0IHdvdWxkIG92ZXJsYXBcbiAgLy8gaXQsIHJhdGhlciB0aGFuIHNpbGVudGx5IGRyb3BwaW5nIHRoZSBhdXRob3JlZCBjb21wb3NpdGlvbi5cbiAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpID8/IFtdO1xuICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGtpbmQpICYmICFpc1N0b25lUmVwbGF5KHdvcmxkKSkgcmV0dXJuO1xuICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmIChlICYmIE1hdGguaHlwb3QoZS54IC0geCwgZS56IC0geikgPCAyLjYpIHtcbiAgICAgIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gICAgICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcyA9IE1hdGgubWF4KDAsIHdvcmxkLnN0YXRzLnRyZWVzIC0gMSk7XG4gICAgICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgICB9XG4gIH1cbiAgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSk7XG4gIC8vIEF1dGhvcmVkIGNvbXBvc2l0aW9uIGlzIGR1cmFibGUgc3RhdGU6IGl0IGNhbiBjbGVhciBvdmVybGFwcGluZyBuYXR1cmFsXG4gIC8vIGVudGl0aWVzLCBzbyBzYXZlIHRoZSBjb21wbGV0ZSBhZmZlY3RlZCBjaHVuayByYXRoZXIgdGhhbiBvbmx5IGl0cyBoZXJvZXMuXG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGtleSk7XG5cbiAgY29uc3QgaWQgPSBgaGVybzoke2tpbmR9OiR7TWF0aC5yb3VuZCh4KX06JHtNYXRoLnJvdW5kKHopfWA7XG4gIGNvbnN0IGJlZm9yZSA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGNvbnN0IGVudGl0eTogRW50aXR5ID0ge1xuICAgIGlkLCBraW5kLCBjaHVuazoga2V5LCB4OiB4ICsgMC41LCB5LCB6OiB6ICsgMC41LFxuICAgIHJvdCwgc2NhbGUsIHZhcmlhbnQsIHJlc291cmNlLCByZW1haW5pbmcsIHlpZWxkUGVySGFydmVzdCxcbiAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IHRydWUsXG4gIH07XG4gIGFkZEVudGl0eSh3b3JsZCwgZW50aXR5KTtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLnNpemUgPiBiZWZvcmUgJiYga2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkge1xuICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkgcmV0dXJuO1xuICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG5cbiAgY29uc3Qgc2l0ZXM6IEFycmF5PHsga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcm90OiBudW1iZXIgfT4gPSBbXG4gICAgeyBraW5kOiAnd2F5c3RvbmUnLCB4OiAtMTAsIHo6IC0xNCwgcm90OiAwIH0sXG4gICAgeyBraW5kOiAnbWFya2VyJywgeDogLTMyLCB6OiAtOCwgcm90OiBNYXRoLlBJIC8gMiB9LFxuICBdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc2l0ZXMpIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKHkgPD0gU0VBX0xFVkVMKSBjb250aW51ZTtcbiAgICB3b3JsZC5zaXRlcy5wdXNoKHtcbiAgICAgIGlkOiBgc2l0ZToke3Mua2luZH1gLFxuICAgICAga2luZDogcy5raW5kLFxuICAgICAgeDogcy54ICsgMC41LCB5LCB6OiBzLnogKyAwLjUsXG4gICAgICByb3Q6IHMucm90LFxuICAgICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gICAgfSk7XG4gIH1cblxuICAvLyBBIGhlcm8gZ3JvdmUgY29tcG9zZWQgaW4gdGhlIGRlZmF1bHQgY2FtZXJhJ3MgdmlldyBkaXJlY3Rpb24uIFRoZXNlIGFyZVxuICAvLyBTdHlsIG5hdHVyYWwgYXNzZXRzIChBUy0wMDEgdjIpLCBub3QgTm94ZWwgYXJjaGl0ZWN0dXJlOyB0aGUgTm94ZWxcbiAgLy8gd2F5c3RvbmUvbWFya2VyIGFib3ZlIHJlbWFpbiB0aGUgaHVtYW4tbWFkZSBsYW5kbWFya3MuXG4gIGNvbnN0IGdyb3ZlOiBBcnJheTxbRW50aXR5S2luZCwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdPiA9IFtcbiAgICBbJ3N0eWxfdHJlZV9zcGlyZScsIC0yMiwgLTI2LCAwLCAxLjAwLCAwXSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC0zNCwgLTE4LCAxLCAwLjk1LCBNYXRoLlBJIC8gMTJdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTYsIC0zNCwgMiwgMS4wMCwgTWF0aC5QSSAvIDZdLFxuICAgIFsnc3R5bF90cmVlX2Jsb3Nzb20nLCAtMjgsIC0zOCwgMCwgMC45MCwgTWF0aC5QSSAvIDRdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTQwLCAtMzAsIDIsIDEuMDUsIE1hdGguUEkgLyAzXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTEyLCAtMjQsIDAsIDAuOTAsIE1hdGguUEkgLyAyLjRdLFxuICBdO1xuICBmb3IgKGNvbnN0IFtraW5kLCB4LCB6LCB2YXJpYW50LCBzY2FsZSwgcm90XSBvZiBncm92ZSkge1xuICAgIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCBraW5kLCB4LCB6LCB2YXJpYW50LCByb3QsIHNjYWxlLCAnd29vZCcsIDEyLCA0KTtcbiAgfVxuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfcm9ja19tZWRpdW0nLCAtNiwgLTEwLCAwLCAwLCAxLjAsICdzdG9uZScsIDgsIDMpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfc2hydWInLCAtMTQsIC04LCAxLCBNYXRoLlBJIC8gMTIsIDEuMSwgJ2ZpYmVyJywgNCwgMSk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9jYWlybicsIC0yMCwgLTYsIDAsIDAsIDEuMCwgJ3N0b25lJywgNiwgMik7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9vcmUnLCAtMzgsIC00MiwgMCwgTWF0aC5QSSAvIDQsIDEuMSwgJ29yZScsIDgsIDIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbmVhcmVzdEhhcnZlc3RhYmxlKFxuICB3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCByYWRpdXM6IG51bWJlciwgcmVzb3VyY2U/OiBSZXNvdXJjZVR5cGUsXG4pOiBFbnRpdHkgfCBudWxsIHtcbiAgbGV0IGJlc3Q6IEVudGl0eSB8IG51bGwgPSBudWxsO1xuICBsZXQgYmVzdEQgPSByYWRpdXMgKiByYWRpdXM7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZClcbiAgICAgIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIGNvbnRpbnVlO1xuICAgIGlmIChyZXNvdXJjZSAmJiBlLnJlc291cmNlICE9PSByZXNvdXJjZSkgY29udGludWU7XG4gICAgY29uc3QgZCA9IChlLnggLSB4KSAqKiAyICsgKGUueiAtIHopICoqIDI7XG4gICAgaWYgKGQgPCBiZXN0RCkgeyBiZXN0RCA9IGQ7IGJlc3QgPSBlOyB9XG4gIH1cbiAgcmV0dXJuIGJlc3Q7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdFJlc3VsdCB7IGVudGl0eTogRW50aXR5OyByZXNvdXJjZTogUmVzb3VyY2VUeXBlOyBhbW91bnQ6IG51bWJlcjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdEVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBIYXJ2ZXN0UmVzdWx0IHwgbnVsbCB7XG4gIGNvbnN0IGUgPSBsaXZlRW50aXR5KHdvcmxkLCBpZCk7XG4gIGlmICghZSB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgYW1vdW50ID0gTWF0aC5taW4oZS55aWVsZFBlckhhcnZlc3QsIGUucmVtYWluaW5nKTtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBuKSA9PiBzdW0gKyBuLCAwKSArIGFtb3VudCA+IDEyMCkgcmV0dXJuIG51bGw7XG4gIGUucmVtYWluaW5nIC09IGFtb3VudDtcbiAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChlLmNodW5rKTtcbiAgZS5oYXJ2ZXN0ZWRPbmNlID0gdHJ1ZTtcbiAgaWYgKGUucmVtYWluaW5nIDw9IDApIGUuaGFydmVzdGVkID0gdHJ1ZTtcbiAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgZW50aXR5OiBlLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50IH07XG59XG5cbi8qKiBSZW1vdmUgZXZlcnkgcmV0aXJlZCBzb3VyY2UgYWZ0ZXIgdmVyaWZpZWQgaGlzdG9yaWNhbCByZXBsYXkuIFRoaXMgbWlncmF0aW9uXG4gKiBjcmVhdGVzIGRldGVybWluaXN0aWMgdG9tYnN0b25lcyBidXQgaXMgbm90IGEgcGxheWVyIGNvbW1hbmQgb3IgcmV2aXNpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmV0aXJlU3RvbmVFbnRpdGllcyh3b3JsZDogV29ybGQpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBlIG9mIFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0pIHtcbiAgICBpZiAoIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKSBjb250aW51ZTtcbiAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoZS5pZCk7XG4gICAgaWYgKCFlLmF1dGhvcmVkKSB3b3JsZC5lbnRpdHlSZW1vdmFscy5hZGQoZS5pZCk7XG4gICAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gICAgaWYgKCF3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGUuY2h1bmspKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGUuY2h1bmssIFtdKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtrZXksIGlkc10gb2Ygd29ybGQuZW50aXR5Q2h1bmtzKSB7XG4gICAgY29uc3QgYWN0aXZlID0gaWRzLmZpbHRlcigoaWQpID0+IHdvcmxkLmVudGl0aWVzLmhhcyhpZCkpO1xuICAgIGlmIChhY3RpdmUubGVuZ3RoID4gMCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhrZXkpKSB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgYWN0aXZlKTtcbiAgICBlbHNlIHdvcmxkLmVudGl0eUNodW5rcy5kZWxldGUoa2V5KTtcbiAgfVxuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGVyc2lzdGVuY2UgLyBhdXRob3JpdHkgYm91bmRhcnkgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1hbmlmZXN0IHtcbiAgc2NoZW1hOiAxO1xuICBzZWVkOiBudW1iZXI7XG4gIGdlbmVyYXRvclZlcnNpb246IG51bWJlcjtcbiAgc2l6ZTogbnVtYmVyO1xuICBjaHVua1NpemU6IG51bWJlcjtcbiAgeU1pbjogbnVtYmVyO1xuICB5TWF4OiBudW1iZXI7XG4gIHNlYUxldmVsOiBudW1iZXI7XG4gIHBhcmFtc0hhc2g6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZm52MWEodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGggPSAweDgxMWM5ZGM1O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBoIF49IHRleHQuY2hhckNvZGVBdChpKTtcbiAgICBoID0gTWF0aC5pbXVsKGgsIDB4MDEwMDAxOTMpO1xuICB9XG4gIHJldHVybiAoaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZE1hbmlmZXN0KHdvcmxkOiBXb3JsZCk6IFdvcmxkTWFuaWZlc3Qge1xuICBjb25zdCBwID0gd29ybGQucGFyYW1zO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBzZWVkOiB3b3JsZC5zZWVkLFxuICAgIGdlbmVyYXRvclZlcnNpb246IHAuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICBzaXplOiBwLnNpemUsXG4gICAgY2h1bmtTaXplOiBwLmNodW5rU2l6ZSxcbiAgICB5TWluOiBwLnlNaW4sXG4gICAgeU1heDogcC55TWF4LFxuICAgIHNlYUxldmVsOiBwLnNlYUxldmVsLFxuICAgIHBhcmFtc0hhc2g6IGZudjFhKEpTT04uc3RyaW5naWZ5KHApKSxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWb3hlbEVkaXQgeyBpOiBudW1iZXI7IG06IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBDaHVua0RlbHRhIHtcbiAgc2NoZW1hOiAxO1xuICBrZXk6IHN0cmluZztcbiAgYmFzZVZlcnNpb246IG51bWJlcjtcbiAgZWRpdHM6IFZveGVsRWRpdFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGtleTogc3RyaW5nKTogQ2h1bmtEZWx0YSB7XG4gIGNvbnN0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGtleSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hOiAxLFxuICAgIGtleSxcbiAgICBiYXNlVmVyc2lvbjogd29ybGQucGFyYW1zLmdlbmVyYXRvclZlcnNpb24sXG4gICAgZWRpdHM6IGVkaXRzID8gWy4uLmVkaXRzLmVudHJpZXMoKV0ubWFwKChbaSwgbV0pID0+ICh7IGksIG0gfSkpLnNvcnQoKGEsIGIpID0+IGEuaSAtIGIuaSkgOiBbXSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q2h1bmtEZWx0YSh3b3JsZDogV29ybGQsIGRlbHRhOiBDaHVua0RlbHRhKTogdm9pZCB7XG4gIGNvbnN0IFtjeCwgY3pdID0gZGVsdGEua2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gIGZvciAoY29uc3QgZSBvZiBkZWx0YS5lZGl0cykge1xuICAgIGNvbnN0IHlJbmRleCA9IE1hdGguZmxvb3IoZS5pIC8gQ0hVTktfQVJFQSk7XG4gICAgY29uc3QgcmVtID0gZS5pICUgQ0hVTktfQVJFQTtcbiAgICBjb25zdCBseiA9IE1hdGguZmxvb3IocmVtIC8gQ0hVTktfU0laRSk7XG4gICAgY29uc3QgbHggPSByZW0gJSBDSFVOS19TSVpFO1xuICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY3gpICsgbHg7XG4gICAgY29uc3QgeSA9IFlfTUlOICsgeUluZGV4O1xuICAgIGNvbnN0IHogPSBjaHVua09yaWdpblooY3opICsgbHo7XG4gICAgc2V0Vm94ZWwod29ybGQsIHgsIHksIHosIGUubSBhcyBNYXRJZCk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSB0aW1lIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgVGltZVN0YXRlIHsgdDogbnVtYmVyOyBkYXlMZW5ndGhTZWM6IG51bWJlcjsgcGF1c2VkOiBib29sZWFuOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBhZHZhbmNlVGltZShzOiBUaW1lU3RhdGUsIGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHMucGF1c2VkKSByZXR1cm47XG4gIHMudCA9IChzLnQgKyBkdCAvIHMuZGF5TGVuZ3RoU2VjKSAlIDE7XG59XG4iLCAiLy8gVGVycmFpbiBxdWVyeSBsYXllciBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLCBubyB0aHJlZS5qcyBpbXBvcnRzIChELTAwNSkuXG4vL1xuLy8gTTAwMiBTeXN0ZW0gMTogb25lIHNoYXJlZCwgY2FjaGVkIGNvbnRyYWN0IGZvciBjb25zdHJ1Y3Rpb24sIGZhcm1pbmcsXG4vLyBtb3ZlbWVudCwgbmF2aWdhdGlvbiBhbmQgdGhlIEFJIGFnZW50LiBUaGVzZSBxdWVyaWVzIGRlc2NyaWJlIHRoZVxuLy8gYXV0aG9yaXRhdGl2ZSB2b3hlbCB2b2x1bWU7IHRoZXkgbmV2ZXIgbXV0YXRlIGl0IGFuZCBuZXZlciBjcmVhdGUgYSBzZWNvbmRcbi8vIHRlcnJhaW4gcmVwcmVzZW50YXRpb24uXG4vL1xuLy8gQ29udmVudGlvbnM6XG4vLyAgICogeC96IGFyZSBpbnRlZ2VyIGNvbHVtbiBjb29yZGluYXRlcyBpbiBbLTEwMjQsIDEwMjQpLlxuLy8gICAqIHkgaXMgYW4gaW50ZWdlciB2b3hlbCBjb29yZGluYXRlIGluIFstMTYsIDExMikuXG4vLyAgICogc3VyZmFjZVkgaXMgdGhlIGV4cG9zZWQgdG9wIGZhY2UgKHRvcFNvbGlkICsgMSksIG1hdGNoaW5nIE0wMDEuXG4vLyAgICogQSByZWN0IGlzIGluY2x1c2l2ZSBvbiBhbGwgZm91ciBlZGdlcy5cbmltcG9ydCB7XG4gIFdvcmxkLCBNYXRJZCwgTUFULCBTRUFfTEVWRUwsIFlfTUlOLCBZX01BWCwgSEFMRixcbiAgc3VyZmFjZUF0LCB0b3BNYXRlcmlhbEF0V29ybGQsIGdldFZveGVsLCBpc1NvbGlkLFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgQWN0aXZlRW50aXR5S2luZCwgRW50aXR5S2luZCwgaXNSZXRpcmVkU3RvbmVLaW5kLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVjdCB7XG4gIHgwOiBudW1iZXI7XG4gIHowOiBudW1iZXI7XG4gIHgxOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxSZWdpb24gZXh0ZW5kcyBSZWN0IHtcbiAgeTA6IG51bWJlcjtcbiAgeTE6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVJlY3QocmVjdDogUmVjdCk6IFJlY3Qge1xuICByZXR1cm4ge1xuICAgIHgwOiBNYXRoLm1pbihyZWN0LngwLCByZWN0LngxKSxcbiAgICB6MDogTWF0aC5taW4ocmVjdC56MCwgcmVjdC56MSksXG4gICAgeDE6IE1hdGgubWF4KHJlY3QueDAsIHJlY3QueDEpLFxuICAgIHoxOiBNYXRoLm1heChyZWN0LnowLCByZWN0LnoxKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RDb2x1bW5zKHJlY3Q6IFJlY3QpOiBudW1iZXIge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgcmV0dXJuIChyLngxIC0gci54MCArIDEpICogKHIuejEgLSByLnowICsgMSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0Q29udGFpbnMocmVjdDogUmVjdCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHggPj0gcmVjdC54MCAmJiB4IDw9IHJlY3QueDEgJiYgeiA+PSByZWN0LnowICYmIHogPD0gcmVjdC56MTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cGFuZFJlY3QocmVjdDogUmVjdCwgYW1vdW50OiBudW1iZXIpOiBSZWN0IHtcbiAgcmV0dXJuIHtcbiAgICB4MDogcmVjdC54MCAtIGFtb3VudCxcbiAgICB6MDogcmVjdC56MCAtIGFtb3VudCxcbiAgICB4MTogcmVjdC54MSArIGFtb3VudCxcbiAgICB6MTogcmVjdC56MSArIGFtb3VudCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RUb1JlZ2lvbihyZWN0OiBSZWN0LCB5MCA9IFlfTUlOLCB5MSA9IFlfTUFYIC0gMSk6IFZveGVsUmVnaW9uIHtcbiAgcmV0dXJuIHsgLi4ubm9ybWFsaXplUmVjdChyZWN0KSwgeTAsIHkxIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpb25zT3ZlcmxhcChhOiBWb3hlbFJlZ2lvbiwgYjogVm94ZWxSZWdpb24pOiBib29sZWFuIHtcbiAgcmV0dXJuIGEueDAgPD0gYi54MSAmJiBhLngxID49IGIueDAgJiYgYS56MCA8PSBiLnoxICYmIGEuejEgPj0gYi56MFxuICAgICYmIGEueTAgPD0gYi55MSAmJiBhLnkxID49IGIueTA7XG59XG5cbi8qKiBJbmNsdXNpdmUgY29udGFpbm1lbnQgb2YgYSB2b3hlbCBpbiBhIHdvcmsgZW52ZWxvcGUuICovXG5leHBvcnQgZnVuY3Rpb24gZW52ZWxvcGVDb250YWlucyhyZWN0czogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBmb3IgKGNvbnN0IHIgb2YgcmVjdHMpIHtcbiAgICBpZiAoeCA+PSByLngwICYmIHggPD0gci54MSAmJiB5ID49IHIueTAgJiYgeSA8PSByLnkxICYmIHogPj0gci56MCAmJiB6IDw9IHIuejEpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWluQ29sdW1uIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIC8qKiBFeHBvc2VkIHRvcCBmYWNlIG9mIHRoZSBzb2xpZCBjb2x1bW47IHRoZSBmaXJzdCBhaXIgY2VsbCBhYm92ZSBpdC4gKi9cbiAgc3VyZmFjZVk6IG51bWJlcjtcbiAgLyoqIFRoZSBoaWdoZXN0IHNvbGlkIHZveGVsLCBvciBZX01JTiAtIDEgaWYgdGhlIGNvbHVtbiBoYXMgbm8gc29saWQuICovXG4gIHRvcFNvbGlkWTogbnVtYmVyO1xuICB0b3BNYXRlcmlhbDogTWF0SWQ7XG4gIHNvbGlkOiBib29sZWFuO1xuICAvKiogV2F0ZXIgYWJvdmUgdGhlIHNvbGlkIHN1cmZhY2UsIHVwIHRvIHNlYSBsZXZlbC4gMCBvbiBkcnkgbGFuZC4gKi9cbiAgd2F0ZXJEZXB0aDogbnVtYmVyO1xuICB1bmRlcndhdGVyOiBib29sZWFuO1xuICAvKiogTGFyZ2VzdCA0LW5laWdoYm91ciBzdXJmYWNlIHN0ZXAgaW4gbWV0cmVzICgxID0gYSBzaW5nbGUgdm94ZWwgcmlzZXIpLiAqL1xuICBzbG9wZTogbnVtYmVyO1xuICAvKiogRnJlZSBhaXIgY2VsbHMgYWJvdmUgdGhlIHN1cmZhY2UsIGNhcHBlZCBhdCBDTEVBUkFOQ0VfUFJPQkUuICovXG4gIGNsZWFyYW5jZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgQ0xFQVJBTkNFX1BST0JFID0gODtcblxuZnVuY3Rpb24gc3VyZmFjZUF0U2FmZSh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBmYWxsYmFjazogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbGxiYWNrO1xuICByZXR1cm4gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbn1cblxuLyoqIFdhdGVyIGRlcHRoIHRoYXQgcmVzcGVjdHMgYSBkcnkgcGl0IGJlbG93IHNlYSBsZXZlbCAodW5saWtlIGhlaWdodCBhbG9uZSkuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0Q29sdW1uKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHN1cmZhY2UgPj0gU0VBX0xFVkVMKSByZXR1cm4gMDtcbiAgaWYgKGdldFZveGVsKHdvcmxkLCB4LCBTRUFfTEVWRUwgLSAxLCB6KSAhPT0gTUFULldBVEVSKSByZXR1cm4gMDtcbiAgcmV0dXJuIFNFQV9MRVZFTCAtIHN1cmZhY2U7XG59XG5cbi8qKiBUcnVlIHdoZW4gYGhlaWdodGAgYWlyIGNlbGxzIGFib3ZlIHRoZSBzdXJmYWNlIGFyZSBmcmVlIG9mIHNvbGlkIG9yIHdhdGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyYW5jZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGhlaWdodDsgaSsrKSB7XG4gICAgaWYgKGdldFZveGVsKHdvcmxkLCB4LCBzdXJmYWNlICsgaSwgeikgIT09IE1BVC5BSVIpIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbHVtbkF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBUZXJyYWluQ29sdW1uIHtcbiAgY29uc3QgY3ggPSBNYXRoLmZsb29yKHgpLCBjeiA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHN1cmZhY2VZID0gc3VyZmFjZUF0KHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCB0b3BNYXRlcmlhbCA9IHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3Qgc29saWQgPSBzdXJmYWNlWSA+IFlfTUlOICYmIGlzU29saWQodG9wTWF0ZXJpYWwpO1xuICBjb25zdCB3YXRlckRlcHRoID0gd2F0ZXJEZXB0aEF0Q29sdW1uKHdvcmxkLCBjeCwgY3opO1xuICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3ggLSAxLCBjeiwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4ICsgMSwgY3osIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCwgY3ogLSAxLCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3gsIGN6ICsgMSwgc3VyZmFjZVkpKSxcbiAgKTtcbiAgbGV0IGNsZWFyYW5jZSA9IDA7XG4gIHdoaWxlIChjbGVhcmFuY2UgPCBDTEVBUkFOQ0VfUFJPQkUgJiYgZ2V0Vm94ZWwod29ybGQsIGN4LCBzdXJmYWNlWSArIGNsZWFyYW5jZSwgY3opID09PSBNQVQuQUlSKSB7XG4gICAgY2xlYXJhbmNlKys7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICB4OiBjeCwgejogY3osIHN1cmZhY2VZLCB0b3BTb2xpZFk6IHN1cmZhY2VZIC0gMSwgdG9wTWF0ZXJpYWwsXG4gICAgc29saWQsIHdhdGVyRGVwdGgsIHVuZGVyd2F0ZXI6IHdhdGVyRGVwdGggPiAwLCBzbG9wZSwgY2xlYXJhbmNlLFxuICB9O1xufVxuXG4vLyBFbnRpdHkgZm9vdHByaW50cyBhcmUgZGVsaWJlcmF0ZWx5IGV4cGxpY2l0LiBBIHRyZWUgb2NjdXBpZXMgbW9yZSBzaXRlIHRoYW5cbi8vIGl0cyB0cnVuazsgYSBwZWJibGUgb2NjdXBpZXMgbGVzcyB0aGFuIGEgYm91bGRlci4gVGhlc2UgYXJlIHNpbXVsYXRpb25cbi8vIGNsZWFyYW5jZSByYWRpaSwgbm90IHJlbmRlciBib3VuZHMuXG5leHBvcnQgY29uc3QgT0JTVFJVQ1RJT05fUkFESVVTOiBSZWNvcmQ8QWN0aXZlRW50aXR5S2luZCwgbnVtYmVyPiA9IHtcbiAgc3R5bF90cmVlX3NwaXJlOiAxLjUsXG4gIHN0eWxfdHJlZV90YWJsZTogMS44LFxuICBzdHlsX3RyZWVfY2x1c3RlcjogMS45LFxuICBzdHlsX3RyZWVfYmxvc3NvbTogMS42LFxuICBzdHlsX3NocnViOiAwLjYsXG4gIHN0eWxfb3JlOiAwLjksXG4gIHN0eWxfY2Fpcm46IDAuOCxcbiAgd2F5c3RvbmU6IDEuNCxcbiAgbWFya2VyOiAwLjUsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIE9ic3RydWN0aW9uIHtcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHJhZGl1czogbnVtYmVyO1xuICAvKiogRm9vdHByaW50IGNlbGxzIG92ZXJsYXBwZWQgYnkgdGhpcyBlbnRpdHkuICovXG4gIGNlbGxzOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGVudGl0eUNodW5rc0ZvclJlY3Qod29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0KTogc3RyaW5nW10ge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgLy8gQSByZWN0IG93bnMgd2hvbGUgdm94ZWwgY2VsbHMuIEluY2x1ZGUgZXZlcnkgY2h1bmsgd2hvc2Ugcm9vdCBjb3VsZCBvdmVybGFwXG4gIC8vIHRob3NlIGNlbGxzLCB3aXRob3V0IHNjYW5uaW5nIHRoZSBlbnRpcmUgMjA0OCBtIHdvcmxkLlxuICBjb25zdCByYWRpdXMgPSBNYXRoLm1heCguLi5PYmplY3QudmFsdWVzKE9CU1RSVUNUSU9OX1JBRElVUyksIDEuNSk7XG4gIGNvbnN0IG1pbkNlbGxYID0gTWF0aC5mbG9vcihyLngwICsgMC41IC0gcmFkaXVzKTtcbiAgY29uc3QgbWF4Q2VsbFggPSBNYXRoLmNlaWwoci54MSArIDAuNSArIHJhZGl1cykgLSAxO1xuICBjb25zdCBtaW5DZWxsWiA9IE1hdGguZmxvb3Ioci56MCArIDAuNSAtIHJhZGl1cyk7XG4gIGNvbnN0IG1heENlbGxaID0gTWF0aC5jZWlsKHIuejEgKyAwLjUgKyByYWRpdXMpIC0gMTtcbiAgY29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgY3gwID0gTWF0aC5tYXgoMCwgd29ybGRUb0NodW5rWChtaW5DZWxsWCkpLCBjeDEgPSB3b3JsZFRvQ2h1bmtYKG1heENlbGxYKTtcbiAgY29uc3QgY3owID0gTWF0aC5tYXgoMCwgd29ybGRUb0NodW5rWihtaW5DZWxsWikpLCBjejEgPSB3b3JsZFRvQ2h1bmtaKG1heENlbGxaKTtcbiAgZm9yIChsZXQgY3ogPSBjejA7IGN6IDw9IGN6MTsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY3gwOyBjeCA8PSBjeDE7IGN4KyspIGtleXMucHVzaChjaHVua0tleShjeCwgY3opKTtcbiAgfVxuICByZXR1cm4ga2V5cztcbn1cblxuLyoqIEVudGl0aWVzIHdob3NlIHNpbXVsYXRpb24gZm9vdHByaW50IG92ZXJsYXBzIHRoZSByZWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9ic3RydWN0aW9uc0luKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCk6IE9ic3RydWN0aW9uW10ge1xuICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBvdXQ6IE9ic3RydWN0aW9uW10gPSBbXTtcbiAgZm9yIChjb25zdCBrZXkgb2YgZW50aXR5Q2h1bmtzRm9yUmVjdCh3b3JsZCwgcikpIHtcbiAgICBjb25zdCBpZHMgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFpZHMpIGNvbnRpbnVlO1xuICAgIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgICBpZiAoc2Vlbi5oYXMoaWQpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgY29udGludWU7XG4gICAgICBzZWVuLmFkZChpZCk7XG4gICAgICBjb25zdCByYWRpdXMgPSBpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKVxuICAgICAgICA/IGUua2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyAwLjYgOiBlLmtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDEuMSA6IDEuNVxuICAgICAgICA6IE9CU1RSVUNUSU9OX1JBRElVU1tlLmtpbmQgYXMgQWN0aXZlRW50aXR5S2luZF07XG4gICAgICBsZXQgY2VsbHMgPSAwO1xuICAgICAgY29uc3QgZXgwID0gTWF0aC5tYXgoci54MCwgTWF0aC5mbG9vcihlLnggLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV4MSA9IE1hdGgubWluKHIueDEsIE1hdGguY2VpbChlLnggKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MCA9IE1hdGgubWF4KHIuejAsIE1hdGguZmxvb3IoZS56IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejEgPSBNYXRoLm1pbihyLnoxLCBNYXRoLmNlaWwoZS56ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBmb3IgKGxldCB6ID0gZXowOyB6IDw9IGV6MTsgeisrKSB7XG4gICAgICAgIGZvciAobGV0IHggPSBleDA7IHggPD0gZXgxOyB4KyspIHtcbiAgICAgICAgICBpZiAoTWF0aC5oeXBvdChlLnggLSAoeCArIDAuNSksIGUueiAtICh6ICsgMC41KSkgPD0gcmFkaXVzKSBjZWxscysrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY2VsbHMgPiAwKSB7XG4gICAgICAgIG91dC5wdXNoKHsgZW50aXR5SWQ6IGUuaWQsIGtpbmQ6IGUua2luZCwgeDogZS54LCB6OiBlLnosIHJhZGl1cywgY2VsbHMgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIG91dC5zb3J0KChhLCBiKSA9PiAoYS5lbnRpdHlJZCA8IGIuZW50aXR5SWQgPyAtMSA6IGEuZW50aXR5SWQgPiBiLmVudGl0eUlkID8gMSA6IDApKTtcbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcmVhU3RhdHMge1xuICByZWN0OiBSZWN0O1xuICBjb2x1bW5zOiBudW1iZXI7XG4gIG1pblk6IG51bWJlcjtcbiAgbWF4WTogbnVtYmVyO1xuICBtZWFuWTogbnVtYmVyO1xuICByZWxpZWY6IG51bWJlcjtcbiAgbWF4U3RlcDogbnVtYmVyO1xuICB3YXRlckNvbHVtbnM6IG51bWJlcjtcbiAgc3RvbmVDb2x1bW5zOiBudW1iZXI7XG4gIG1hdGVyaWFsczogUmVjb3JkPG51bWJlciwgbnVtYmVyPjtcbiAgb2JzdHJ1Y3Rpb25zOiBPYnN0cnVjdGlvbltdO1xuICBvYnN0cnVjdGVkQ29sdW1uczogbnVtYmVyO1xuICAvKiogQ3V0L2ZpbGwgcmVsYXRpdmUgdG8gZmxvb3JZIHdoZW4gc3VwcGxpZWQsIG90aGVyd2lzZSAwLiAqL1xuICBmbG9vclk6IG51bWJlciB8IG51bGw7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VwcG9ydFN1bW1hcnkge1xuICB0b3RhbDogbnVtYmVyO1xuICBsZXZlbDogbnVtYmVyO1xuICBjdXQ6IG51bWJlcjtcbiAgZmlsbDogbnVtYmVyO1xuICB3YXRlcjogbnVtYmVyO1xuICAvKiogRmlsbCBkZWVwZXIgdGhhbiA4IG07IGEgdmFsaWRhdG9yIG1heSByZWplY3QgdGhlc2UgYXMgdW5zdXBwb3J0ZWQuICovXG4gIGRlZXBGaWxsOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRm9vdHByaW50UXVlcnkge1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgc3RhdHM6IEFyZWFTdGF0cztcbiAgc3VwcG9ydDogU3VwcG9ydFN1bW1hcnk7XG4gIG9ic3RydWN0aW9uczogT2JzdHJ1Y3Rpb25bXTtcbiAgLyoqIENlbGxzIGluIHRoZSBidWlsZGluZyB2b2x1bWUgYWJvdmUgdGhlIHByZXBhcmVkIGZsb29yIHRoYXQgYXJlIG5vdCBhaXIuICovXG4gIG92ZXJoYW5nQ2VsbHM6IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgbWF0ZXJpYWw6IE1hdElkIH0+O1xufVxuXG4vKipcbiAqIENhY2hlZCBxdWVyeSBjb250ZXh0LiBDYWNoZXMgYXJlIGtleWVkIG9uIHdvcmxkLnJldmlzaW9uOiBhIHZveGVsIG9yIGVudGl0eVxuICogZWRpdCBpbnZhbGlkYXRlcyB0aGVtLCB3aGlsZSBtZXNoL25hdiByZWJ1aWxkcyBkbyBub3QuIFVzZSBvbmUgY29udGV4dCBmb3IgYVxuICogc2l0ZSBzZWFyY2ggb3IgYSBmb290cHJpbnQgZXZhbHVhdGlvbiwgdGhlbiBkaXNjYXJkIGl0LlxuICovXG5leHBvcnQgY2xhc3MgVGVycmFpblF1ZXJ5IHtcbiAgcHJpdmF0ZSBjYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBUZXJyYWluQ29sdW1uPigpO1xuICBwcml2YXRlIG9ic3RydWN0aW9uQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgT2JzdHJ1Y3Rpb25bXT4oKTtcbiAgcHJpdmF0ZSByZXZpc2lvbjogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSB3b3JsZDogV29ybGQpIHtcbiAgICB0aGlzLnJldmlzaW9uID0gd29ybGQucmV2aXNpb247XG4gIH1cblxuICBwcml2YXRlIHN5bmMoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMucmV2aXNpb24gIT09IHRoaXMud29ybGQucmV2aXNpb24pIHtcbiAgICAgIHRoaXMuY2FjaGUuY2xlYXIoKTtcbiAgICAgIHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5jbGVhcigpO1xuICAgICAgdGhpcy5yZXZpc2lvbiA9IHRoaXMud29ybGQucmV2aXNpb247XG4gICAgfVxuICB9XG5cbiAgLyoqIENhY2hlZCBlbnRpdHkgb2JzdHJ1Y3Rpb25zIGZvciBvbmUgZm9vdHByaW50LiAqL1xuICBvYnN0cnVjdGlvbnNGb3IocmVjdDogUmVjdCk6IE9ic3RydWN0aW9uW10ge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGNvbnN0IGtleSA9IGAke3IueDB9LCR7ci56MH0sJHtyLngxfSwke3IuejF9YDtcbiAgICBsZXQgbGlzdCA9IHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAoIWxpc3QpIHtcbiAgICAgIGxpc3QgPSBvYnN0cnVjdGlvbnNJbih0aGlzLndvcmxkLCByKTtcbiAgICAgIHRoaXMub2JzdHJ1Y3Rpb25DYWNoZS5zZXQoa2V5LCBsaXN0KTtcbiAgICB9XG4gICAgcmV0dXJuIGxpc3Q7XG4gIH1cblxuICBjb2x1bW4oeDogbnVtYmVyLCB6OiBudW1iZXIpOiBUZXJyYWluQ29sdW1uIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCBjeCA9IE1hdGguZmxvb3IoeCksIGN6ID0gTWF0aC5mbG9vcih6KTtcbiAgICBjb25zdCBrZXkgPSBgJHtjeH0sJHtjen1gO1xuICAgIGxldCBjb2wgPSB0aGlzLmNhY2hlLmdldChrZXkpO1xuICAgIGlmICghY29sKSB7XG4gICAgICBjb2wgPSBjb2x1bW5BdCh0aGlzLndvcmxkLCBjeCwgY3opO1xuICAgICAgdGhpcy5jYWNoZS5zZXQoa2V5LCBjb2wpO1xuICAgIH1cbiAgICByZXR1cm4gY29sO1xuICB9XG5cbiAgYXJlYShyZWN0OiBSZWN0LCBmbG9vclk/OiBudW1iZXIpOiBBcmVhU3RhdHMge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGxldCBtaW5ZID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICAgIGxldCBtYXhZID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICAgIGxldCBzdW0gPSAwO1xuICAgIGxldCBtYXhTdGVwID0gMDtcbiAgICBsZXQgd2F0ZXJDb2x1bW5zID0gMDtcbiAgICBsZXQgc3RvbmVDb2x1bW5zID0gMDtcbiAgICBsZXQgY3V0Vm9sdW1lID0gMDtcbiAgICBsZXQgZmlsbFZvbHVtZSA9IDA7XG4gICAgbGV0IG1heEN1dCA9IDA7XG4gICAgbGV0IG1heEZpbGwgPSAwO1xuICAgIGNvbnN0IG1hdGVyaWFsczogUmVjb3JkPG51bWJlciwgbnVtYmVyPiA9IHt9O1xuXG4gICAgZm9yIChsZXQgeiA9IHIuejA7IHogPD0gci56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gci54MDsgeCA8PSByLngxOyB4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gdGhpcy5jb2x1bW4oeCwgeik7XG4gICAgICAgIG1pblkgPSBNYXRoLm1pbihtaW5ZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBtYXhZID0gTWF0aC5tYXgobWF4WSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgc3VtICs9IGNvbC5zdXJmYWNlWTtcbiAgICAgICAgbWF4U3RlcCA9IE1hdGgubWF4KG1heFN0ZXAsIGNvbC5zbG9wZSk7XG4gICAgICAgIGlmIChjb2wud2F0ZXJEZXB0aCA+IDApIHdhdGVyQ29sdW1ucysrO1xuICAgICAgICBpZiAoY29sLnRvcE1hdGVyaWFsID09PSBNQVQuU1RPTkUpIHN0b25lQ29sdW1ucysrO1xuICAgICAgICBtYXRlcmlhbHNbY29sLnRvcE1hdGVyaWFsXSA9IChtYXRlcmlhbHNbY29sLnRvcE1hdGVyaWFsXSA/PyAwKSArIDE7XG4gICAgICAgIGlmIChmbG9vclkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGNvbnN0IGR5ID0gY29sLnN1cmZhY2VZIC0gZmxvb3JZO1xuICAgICAgICAgIGlmIChkeSA+IDApIHtcbiAgICAgICAgICAgIGN1dFZvbHVtZSArPSBkeTtcbiAgICAgICAgICAgIG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZHkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZHkgPCAwKSB7XG4gICAgICAgICAgICBmaWxsVm9sdW1lICs9IC1keTtcbiAgICAgICAgICAgIG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCAtZHkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG9ic3RydWN0aW9ucyA9IHRoaXMub2JzdHJ1Y3Rpb25zRm9yKHIpO1xuICAgIGNvbnN0IG9ic3RydWN0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IG8gb2Ygb2JzdHJ1Y3Rpb25zKSB7XG4gICAgICBjb25zdCByYWRpdXMgPSBvLnJhZGl1cztcbiAgICAgIGNvbnN0IGV4MCA9IE1hdGgubWF4KHIueDAsIE1hdGguZmxvb3Ioby54IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBleDEgPSBNYXRoLm1pbihyLngxLCBNYXRoLmNlaWwoby54ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejAgPSBNYXRoLm1heChyLnowLCBNYXRoLmZsb29yKG8ueiAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXoxID0gTWF0aC5taW4oci56MSwgTWF0aC5jZWlsKG8ueiArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgZm9yIChsZXQgeiA9IGV6MDsgeiA8PSBlejE7IHorKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gZXgwOyB4IDw9IGV4MTsgeCsrKSB7XG4gICAgICAgICAgaWYgKE1hdGguaHlwb3Qoby54IC0gKHggKyAwLjUpLCBvLnogLSAoeiArIDAuNSkpIDw9IHJhZGl1cykgb2JzdHJ1Y3RlZC5hZGQoYCR7eH0sJHt6fWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgY29sdW1ucyA9IChyLngxIC0gci54MCArIDEpICogKHIuejEgLSByLnowICsgMSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlY3Q6IHIsXG4gICAgICBjb2x1bW5zLFxuICAgICAgbWluWSwgbWF4WSxcbiAgICAgIG1lYW5ZOiBNYXRoLnJvdW5kKChzdW0gLyBjb2x1bW5zKSAqIDEwMDApIC8gMTAwMCxcbiAgICAgIHJlbGllZjogbWF4WSAtIG1pblksXG4gICAgICBtYXhTdGVwLFxuICAgICAgd2F0ZXJDb2x1bW5zLFxuICAgICAgc3RvbmVDb2x1bW5zLFxuICAgICAgbWF0ZXJpYWxzLFxuICAgICAgb2JzdHJ1Y3Rpb25zLFxuICAgICAgb2JzdHJ1Y3RlZENvbHVtbnM6IG9ic3RydWN0ZWQuc2l6ZSxcbiAgICAgIGZsb29yWTogZmxvb3JZID8/IG51bGwsXG4gICAgICBjdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0LFxuICAgICAgbWF4RmlsbCxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEV2YWx1YXRlIGEgY29tcGxldGUgYnVpbGRpbmcgZm9vdHByaW50LiBgZmxvb3JZYCBpcyB0aGUgcHJlcGFyZWQgd2Fsa2luZ1xuICAgKiBmbG9vcjogdGVycmFpbiBhYm92ZSBpdCBpcyBjdXQsIHRlcnJhaW4gYmVsb3cgaXQgaXMgZmlsbGVkLiBUaGUgcmVzdWx0IGlzXG4gICAqIHJhdyBzaXRlIGRhdGE7IGNvbnN0cnVjdGlvbiBydWxlcyBsaXZlIGluIGNvbnN0cnVjdGlvbi50cy5cbiAgICovXG4gIGZvb3RwcmludChyZWN0OiBSZWN0LCBmbG9vclk6IG51bWJlcik6IEZvb3RwcmludFF1ZXJ5IHtcbiAgICBjb25zdCBzdGF0cyA9IHRoaXMuYXJlYShyZWN0LCBmbG9vclkpO1xuICAgIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICAgIGNvbnN0IHN1cHBvcnQ6IFN1cHBvcnRTdW1tYXJ5ID0ge1xuICAgICAgdG90YWw6IHN0YXRzLmNvbHVtbnMsIGxldmVsOiAwLCBjdXQ6IDAsIGZpbGw6IDAsIHdhdGVyOiAwLCBkZWVwRmlsbDogMCxcbiAgICAgIG1heEN1dDogMCwgbWF4RmlsbDogMCwgY3V0Vm9sdW1lOiAwLCBmaWxsVm9sdW1lOiAwLFxuICAgIH07XG4gICAgY29uc3Qgb3ZlcmhhbmdDZWxsczogRm9vdHByaW50UXVlcnlbJ292ZXJoYW5nQ2VsbHMnXSA9IFtdO1xuXG4gICAgZm9yIChsZXQgeiA9IHIuejA7IHogPD0gci56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gci54MDsgeCA8PSByLngxOyB4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gdGhpcy5jb2x1bW4oeCwgeik7XG4gICAgICAgIGNvbnN0IGR5ID0gY29sLnN1cmZhY2VZIC0gZmxvb3JZO1xuICAgICAgICBpZiAoZHkgPiAwKSB7XG4gICAgICAgICAgc3VwcG9ydC5jdXQrKztcbiAgICAgICAgICBzdXBwb3J0LmN1dFZvbHVtZSArPSBkeTtcbiAgICAgICAgICBzdXBwb3J0Lm1heEN1dCA9IE1hdGgubWF4KHN1cHBvcnQubWF4Q3V0LCBkeSk7XG4gICAgICAgIH0gZWxzZSBpZiAoZHkgPCAwKSB7XG4gICAgICAgICAgc3VwcG9ydC5maWxsKys7XG4gICAgICAgICAgc3VwcG9ydC5maWxsVm9sdW1lICs9IC1keTtcbiAgICAgICAgICBzdXBwb3J0Lm1heEZpbGwgPSBNYXRoLm1heChzdXBwb3J0Lm1heEZpbGwsIC1keSk7XG4gICAgICAgICAgaWYgKC1keSA+IDgpIHN1cHBvcnQuZGVlcEZpbGwrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdXBwb3J0LmxldmVsKys7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbC53YXRlckRlcHRoID4gMCkgc3VwcG9ydC53YXRlcisrO1xuXG4gICAgICAgIC8vIEFuIG92ZXJoYW5nIGlzIHRlcnJhaW4gYWJvdmUgdGhlIGZsb29yIHRoYXQgc3Vydml2ZXMgdGhlIGN1dCBwbGFuZS5cbiAgICAgICAgLy8gRm9yIGEgY29sdW1uIGJlbG93IHRoZSBmbG9vciwgaXRzIHNvbGlkIGJvZHkgaXMgZmlsbCwgbm90IG92ZXJoYW5nLlxuICAgICAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KGZsb29yWSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgZm9yIChsZXQgeSA9IHN0YXJ0OyB5IDwgc3RhcnQgKyA0OyB5KyspIHtcbiAgICAgICAgICBjb25zdCBtID0gZ2V0Vm94ZWwodGhpcy53b3JsZCwgeCwgeSwgeikgYXMgTWF0SWQ7XG4gICAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIpIG92ZXJoYW5nQ2VsbHMucHVzaCh7IHgsIHksIHosIG1hdGVyaWFsOiBtIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVjdDogciwgZmxvb3JZLCBzdGF0cywgc3VwcG9ydCwgb2JzdHJ1Y3Rpb25zOiBzdGF0cy5vYnN0cnVjdGlvbnMsIG92ZXJoYW5nQ2VsbHMgfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIG1vdmVtZW50IGNvbnRyYWN0IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV2Fsa1BhcmFtcyB7XG4gIG1heFN0ZXBVcDogbnVtYmVyO1xuICBtYXhTdGVwRG93bjogbnVtYmVyO1xuICBtYXhXYXRlckRlcHRoOiBudW1iZXI7XG4gIC8qKiBNYXhpbXVtIGFkamFjZW50IHN1cmZhY2Ugc3RlcDsgMS4wIGlzIGEgNDUgZGVncmVlIHZveGVsIHJpc2VyLiAqL1xuICBtYXhTbG9wZTogbnVtYmVyO1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfV0FMSzogV2Fsa1BhcmFtcyA9IHtcbiAgbWF4U3RlcFVwOiAxLjAsXG4gIG1heFN0ZXBEb3duOiAxLjUsXG4gIG1heFdhdGVyRGVwdGg6IDAuNCxcbiAgbWF4U2xvcGU6IDEuMCxcbiAgY2xlYXJhbmNlOiAyLjAsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdhbGtSZXN1bHQge1xuICBvazogYm9vbGVhbjtcbiAgcmVhc29uOiAnb2snIHwgJ25vdF9hZGphY2VudCcgfCAnc3RlcF91cCcgfCAnZmFsbCcgfCAnd2F0ZXInIHwgJ3Nsb3BlJyB8ICdjbGVhcmFuY2UnO1xuICBzdGVwOiBudW1iZXI7XG4gIHdhdGVyRGVwdGg6IG51bWJlcjtcbn1cblxuLyoqIEV2YWx1YXRlIG9uZSBncmlkIHN0ZXAuIFBhdGhzIGFyZSB2YWxpZGF0ZWQgd2l0aCB0aGUgc2FtZSBjb250cmFjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YWxrU3RlcChcbiAgd29ybGQ6IFdvcmxkLCBmcm9tWDogbnVtYmVyLCBmcm9tWjogbnVtYmVyLCB0b1g6IG51bWJlciwgdG9aOiBudW1iZXIsXG4gIHBhcmFtczogV2Fsa1BhcmFtcyA9IERFRkFVTFRfV0FMSyxcbik6IFdhbGtSZXN1bHQge1xuICBjb25zdCBkeCA9IE1hdGguYWJzKE1hdGguZmxvb3IodG9YKSAtIE1hdGguZmxvb3IoZnJvbVgpKTtcbiAgY29uc3QgZHogPSBNYXRoLmFicyhNYXRoLmZsb29yKHRvWikgLSBNYXRoLmZsb29yKGZyb21aKSk7XG4gIGlmIChkeCArIGR6ICE9PSAxKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdub3RfYWRqYWNlbnQnLCBzdGVwOiAwLCB3YXRlckRlcHRoOiAwIH07XG4gIH1cbiAgY29uc3QgZnJvbSA9IGNvbHVtbkF0KHdvcmxkLCBmcm9tWCwgZnJvbVopO1xuICBjb25zdCB0byA9IGNvbHVtbkF0KHdvcmxkLCB0b1gsIHRvWik7XG4gIGNvbnN0IHN0ZXAgPSB0by5zdXJmYWNlWSAtIGZyb20uc3VyZmFjZVk7XG4gIGlmIChzdGVwID4gcGFyYW1zLm1heFN0ZXBVcCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzdGVwX3VwJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAoLXN0ZXAgPiBwYXJhbXMubWF4U3RlcERvd24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnZmFsbCcsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKHRvLndhdGVyRGVwdGggPiBwYXJhbXMubWF4V2F0ZXJEZXB0aCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICd3YXRlcicsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKHRvLnNsb3BlID4gcGFyYW1zLm1heFNsb3BlKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3Nsb3BlJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAoIWNsZWFyYW5jZUF0KHdvcmxkLCB0b1gsIHRvWiwgcGFyYW1zLmNsZWFyYW5jZSkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2NsZWFyYW5jZScsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgfVxuICByZXR1cm4geyBvazogdHJ1ZSwgcmVhc29uOiAnb2snLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG59XG5cbi8qKiBFZmZlY3RpdmUgZ3JhZGUgb2YgYSBzdHJhaWdodCBwYXRoIHNlZ21lbnQsIHVzZWQgYnkgcGF0aCB2YWxpZGF0aW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVmZmVjdGl2ZUdyYWRlKHdvcmxkOiBXb3JsZCwgeDA6IG51bWJlciwgejA6IG51bWJlciwgeDE6IG51bWJlciwgejE6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IGEgPSBjb2x1bW5BdCh3b3JsZCwgeDAsIHowKTtcbiAgY29uc3QgYiA9IGNvbHVtbkF0KHdvcmxkLCB4MSwgejEpO1xuICBjb25zdCBydW4gPSBNYXRoLmh5cG90KHgxIC0geDAsIHoxIC0gejApO1xuICBpZiAocnVuID09PSAwKSByZXR1cm4gTWF0aC5hYnMoYi5zdXJmYWNlWSAtIGEuc3VyZmFjZVkpO1xuICByZXR1cm4gTWF0aC5hYnMoYi5zdXJmYWNlWSAtIGEuc3VyZmFjZVkpIC8gcnVuO1xufVxuIiwgIi8vIE0wMDIgc2l0ZSB2YWxpZGF0aW9uLCBjYW5kaWRhdGUgc2VhcmNoIGFuZCBwcmV2aWV3IFx1MjAxNCBwdXJlIHNpbXVsYXRpb24uXG4vL1xuLy8gVGhpcyBpcyB0aGUgc2hhcmVkIGdhdGUgZm9yIHRoZSBwbGF5ZXIgYW5kIHRoZSBBSSBhZ2VudC4gTmVpdGhlciBtYXkgcGxhY2UgYVxuLy8gc3RydWN0dXJlIGJ5IGFueSBvdGhlciBwYXRoOiBib3RoIHN1Ym1pdCBhIFNpdGVQcm9wb3NhbCwgYm90aCByZWNlaXZlIHRoZVxuLy8gc2FtZSBTaXRlVmFsaWRhdGlvbiwgYW5kIGJvdGggbXVzdCBwYXNzIHRoZSBBdXRob3JpemVyIGJlZm9yZSBleGVjdXRpb24uXG4vL1xuLy8gVGhlIHZhbGlkYXRvciBkZXNjcmliZXMgdGhlIHNpdGUgYXMgaXQgaXMuIEl0IGRvZXMgbm90IGVkaXQgdm94ZWxzLCByZW1vdmVcbi8vIGVudGl0aWVzIG9yIHNwZW5kIHJlc291cmNlcy4gUHJlcGFyYXRpb24gaXMgYSBzZXBhcmF0ZSwgYXV0aG9yaXplZCBzdGVwLlxuaW1wb3J0IHsgV29ybGQsIEhBTEYsIFlfTUlOLCBZX01BWCwgc3VyZmFjZUF0IH0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBSZWN0LCBWb3hlbFJlZ2lvbiwgRm9vdHByaW50UXVlcnksIFRlcnJhaW5RdWVyeSwgQXJlYVN0YXRzLFxuICBub3JtYWxpemVSZWN0LCBleHBhbmRSZWN0LCByZWN0Q29sdW1ucywgZWZmZWN0aXZlR3JhZGUsIHdhbGtTdGVwLCBXYWxrUGFyYW1zLFxuICBERUZBVUxUX1dBTEssIGNvbHVtbkF0LFxufSBmcm9tICcuL3RlcnJhaW4nO1xuXG5leHBvcnQgdHlwZSBTaXRlU3RhdGUgPSAndmFsaWQnIHwgJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nIHwgJ2ludmFsaWQnO1xuXG5leHBvcnQgdHlwZSBWYWxpZGF0aW9uQ29kZSA9XG4gIHwgJ291dF9vZl9ib3VuZHMnXG4gIHwgJ2Zvb3RwcmludF9taXNtYXRjaCdcbiAgfCAnc2xvcGVfZXhjZWVkZWQnXG4gIHwgJ3N0ZXBfZXhjZWVkZWQnXG4gIHwgJ2N1dF9leGNlZWRlZCdcbiAgfCAnZmlsbF9leGNlZWRlZCdcbiAgfCAnY3V0X3ZvbHVtZV9leGNlZWRlZCdcbiAgfCAnZmlsbF92b2x1bWVfZXhjZWVkZWQnXG4gIHwgJ2Zvb3RwcmludF9vYnN0cnVjdGVkJ1xuICB8ICd3YXRlcidcbiAgfCAnb3ZlcmhhbmcnXG4gIHwgJ25lZWRzX2dyYWRpbmcnXG4gIHwgJ25lZWRzX2NsZWFyaW5nJztcblxuZXhwb3J0IGludGVyZmFjZSBWYWxpZGF0aW9uUmVhc29uIHtcbiAgY29kZTogVmFsaWRhdGlvbkNvZGU7XG4gIHNldmVyaXR5OiAnZXJyb3InIHwgJ3ByZXBhcmF0aW9uJztcbiAgbWVzc2FnZTogc3RyaW5nO1xuICB2YWx1ZT86IG51bWJlcjtcbiAgbGltaXQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIEZvdW5kYXRpb25UeXBlID0gJ2dyYWRlZF9wYWQnIHwgJ3N0ZXBwZWRfcGxpbnRoJyB8ICdkZWNrJztcblxuZXhwb3J0IGludGVyZmFjZSBCdWlsZGluZ1J1bGVzIHtcbiAgaWQ6IHN0cmluZztcbiAgd2lkdGg6IG51bWJlcjtcbiAgZGVwdGg6IG51bWJlcjtcbiAgd2FsbEhlaWdodDogbnVtYmVyO1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbiAgLyoqIFJlbGllZiBhdCBvciBiZWxvdyB0aGlzIG5lZWRzIG5vIGdyYWRpbmcgdG8gYmUgY2FsbGVkIHZhbGlkLiAqL1xuICBtYXhSZWxpZWZOb1ByZXA6IG51bWJlcjtcbiAgLyoqIFJlbGllZiBhYm92ZSB0aGlzIGNhbm5vdCBiZSBwcmVwYXJlZCBieSB0aGlzIGJ1aWxkaW5nIHR5cGUuICovXG4gIG1heFJlbGllZlByZXBhcmVkOiBudW1iZXI7XG4gIG1heFN0ZXA6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgbWF4Q3V0Vm9sdW1lOiBudW1iZXI7XG4gIG1heEZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4T2JzdHJ1Y3Rpb25zOiBudW1iZXI7XG4gIHJlcXVpcmVzRHJ5OiBib29sZWFuO1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uVHlwZTtcbn1cblxuZXhwb3J0IGNvbnN0IEhPVVNFX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ2hvdXNlLTh4NicsXG4gIHdpZHRoOiA4LFxuICBkZXB0aDogNixcbiAgd2FsbEhlaWdodDogMyxcbiAgY2xlYXJhbmNlOiAzLFxuICBtYXhSZWxpZWZOb1ByZXA6IDEuMixcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDQuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAyLFxuICBtYXhGaWxsOiAyLFxuICBtYXhDdXRWb2x1bWU6IDQ4LFxuICBtYXhGaWxsVm9sdW1lOiA0OCxcbiAgbWF4T2JzdHJ1Y3Rpb25zOiAwLFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ2dyYWRlZF9wYWQnLFxufTtcblxuZXhwb3J0IGNvbnN0IEZBUk1fUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAnZmFybS0xMng4JyxcbiAgd2lkdGg6IDEyLFxuICBkZXB0aDogOCxcbiAgd2FsbEhlaWdodDogMCxcbiAgY2xlYXJhbmNlOiAxLFxuICBtYXhSZWxpZWZOb1ByZXA6IDEuMixcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDYuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAyLFxuICBtYXhGaWxsOiAyLFxuICBtYXhDdXRWb2x1bWU6IDk2LFxuICBtYXhGaWxsVm9sdW1lOiA5NixcbiAgbWF4T2JzdHJ1Y3Rpb25zOiA0LFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ3N0ZXBwZWRfcGxpbnRoJyxcbn07XG5cbmV4cG9ydCBjb25zdCBQQVRIX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ3BhdGgtOXgzJyxcbiAgd2lkdGg6IDksXG4gIGRlcHRoOiAzLFxuICB3YWxsSGVpZ2h0OiAwLFxuICBjbGVhcmFuY2U6IDEsXG4gIG1heFJlbGllZk5vUHJlcDogMi4wLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNC4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDEsXG4gIG1heEZpbGw6IDEsXG4gIG1heEN1dFZvbHVtZTogMzIsXG4gIG1heEZpbGxWb2x1bWU6IDMyLFxuICBtYXhPYnN0cnVjdGlvbnM6IDIsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnZGVjaycsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVQcm9wb3NhbCB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25TdW1tYXJ5IHtcbiAgbmVlZHNHcmFkaW5nOiBib29sZWFuO1xuICBuZWVkc0NsZWFyaW5nOiBib29sZWFuO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBvYnN0cnVjdGlvbklkczogc3RyaW5nW107XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25UeXBlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVWYWxpZGF0aW9uIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHN0YXRlOiBTaXRlU3RhdGU7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgcXVlcnk6IEZvb3RwcmludFF1ZXJ5O1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25TdW1tYXJ5O1xufVxuXG5mdW5jdGlvbiBlcnJvcihjb2RlOiBWYWxpZGF0aW9uQ29kZSwgbWVzc2FnZTogc3RyaW5nLCB2YWx1ZT86IG51bWJlciwgbGltaXQ/OiBudW1iZXIpOiBWYWxpZGF0aW9uUmVhc29uIHtcbiAgcmV0dXJuIHsgY29kZSwgc2V2ZXJpdHk6ICdlcnJvcicsIG1lc3NhZ2UsIHZhbHVlLCBsaW1pdCB9O1xufVxuXG5mdW5jdGlvbiBwcmVwKGNvZGU6IFZhbGlkYXRpb25Db2RlLCBtZXNzYWdlOiBzdHJpbmcsIHZhbHVlPzogbnVtYmVyLCBsaW1pdD86IG51bWJlcik6IFZhbGlkYXRpb25SZWFzb24ge1xuICByZXR1cm4geyBjb2RlLCBzZXZlcml0eTogJ3ByZXBhcmF0aW9uJywgbWVzc2FnZSwgdmFsdWUsIGxpbWl0IH07XG59XG5cbi8qKlxuICogVmFsaWRhdGUgYSBwcm9wb3NlZCBzaXRlIGFnYWluc3QgaXRzIGJ1aWxkaW5nIHJ1bGVzLiBQdXJlOiBubyB2b3hlbHMsXG4gKiBlbnRpdGllcyBvciByZXNvdXJjZXMgY2hhbmdlLiBgcXVlcnlgIG1heSBiZSBzdXBwbGllZCBieSBhIHNlYXJjaCB0byByZXVzZVxuICogdGhlIGNhY2hlZCBjb2x1bW5zLCBhbmQgYGZvb3RwcmludGAgbWF5IGJlIHN1cHBsaWVkIHdoZW4gdGhlIGNhbGxlciBhbHJlYWR5XG4gKiBldmFsdWF0ZWQgdGhlIHNhbWUgcmVjdC9mbG9vciBwYWlyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVTaXRlKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCksXG4gIGZvb3RwcmludD86IEZvb3RwcmludFF1ZXJ5LFxuKTogU2l0ZVZhbGlkYXRpb24ge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgcnVsZXMgPSBwcm9wb3NhbC5ydWxlcztcbiAgY29uc3QgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdID0gW107XG4gIGNvbnN0IGZwID0gZm9vdHByaW50ID8/IHF1ZXJ5LmZvb3RwcmludChyZWN0LCBwcm9wb3NhbC5mbG9vclkpO1xuICBjb25zdCBzdGF0cyA9IGZwLnN0YXRzO1xuXG4gIGlmIChyZWN0LngwIDwgLUhBTEYgfHwgcmVjdC56MCA8IC1IQUxGIHx8IHJlY3QueDEgPj0gSEFMRiB8fCByZWN0LnoxID49IEhBTEYpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoJ291dF9vZl9ib3VuZHMnLCBgZm9vdHByaW50ICR7cmVjdC54MH0sJHtyZWN0LnowfS4uJHtyZWN0LngxfSwke3JlY3QuejF9IGlzIG91dHNpZGUgdGhlIHdvcmxkYCkpO1xuICB9XG4gIGlmIChyZWN0LngxIC0gcmVjdC54MCArIDEgIT09IHJ1bGVzLndpZHRoIHx8IHJlY3QuejEgLSByZWN0LnowICsgMSAhPT0gcnVsZXMuZGVwdGgpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZm9vdHByaW50X21pc21hdGNoJyxcbiAgICAgIGBmb290cHJpbnQgaXMgJHtyZWN0LngxIC0gcmVjdC54MCArIDF9IHggJHtyZWN0LnoxIC0gcmVjdC56MCArIDF9IG0sICR7cnVsZXMud2lkdGh9IHggJHtydWxlcy5kZXB0aH0gbSByZXF1aXJlZGAsXG4gICAgKSk7XG4gIH1cblxuICBpZiAoc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnc2xvcGVfZXhjZWVkZWQnLFxuICAgICAgYHJlbGllZiAke3N0YXRzLnJlbGllZn0gbSBleGNlZWRzIHRoZSAke3J1bGVzLm1heFJlbGllZlByZXBhcmVkfSBtIHByZXBhcmVkIGxpbWl0YCxcbiAgICAgIHN0YXRzLnJlbGllZiwgcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heFN0ZXAgPiBydWxlcy5tYXhTdGVwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3N0ZXBfZXhjZWVkZWQnLFxuICAgICAgYHN1cmZhY2Ugc3RlcCAke3N0YXRzLm1heFN0ZXB9IG0gZXhjZWVkcyAke3J1bGVzLm1heFN0ZXB9IG1gLFxuICAgICAgc3RhdHMubWF4U3RlcCwgcnVsZXMubWF4U3RlcCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4Q3V0ID4gcnVsZXMubWF4Q3V0KSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2N1dF9leGNlZWRlZCcsXG4gICAgICBgY3V0ICR7c3RhdHMubWF4Q3V0fSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXR9IG1gLFxuICAgICAgc3RhdHMubWF4Q3V0LCBydWxlcy5tYXhDdXQsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEZpbGwgPiBydWxlcy5tYXhGaWxsKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2ZpbGxfZXhjZWVkZWQnLFxuICAgICAgYGZpbGwgJHtzdGF0cy5tYXhGaWxsfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsfSBtYCxcbiAgICAgIHN0YXRzLm1heEZpbGwsIHJ1bGVzLm1heEZpbGwsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLmN1dFZvbHVtZSA+IHJ1bGVzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdjdXRfdm9sdW1lX2V4Y2VlZGVkJyxcbiAgICAgIGBjdXQgdm9sdW1lICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXRWb2x1bWV9IG1cdTAwQjNgLFxuICAgICAgc3RhdHMuY3V0Vm9sdW1lLCBydWxlcy5tYXhDdXRWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLmZpbGxWb2x1bWUgPiBydWxlcy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2ZpbGxfdm9sdW1lX2V4Y2VlZGVkJyxcbiAgICAgIGBmaWxsIHZvbHVtZSAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEZpbGxWb2x1bWV9IG1cdTAwQjNgLFxuICAgICAgc3RhdHMuZmlsbFZvbHVtZSwgcnVsZXMubWF4RmlsbFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAocnVsZXMucmVxdWlyZXNEcnkgJiYgc3RhdHMud2F0ZXJDb2x1bW5zID4gMCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICd3YXRlcicsXG4gICAgICBgJHtzdGF0cy53YXRlckNvbHVtbnN9IGZvb3RwcmludCBjb2x1bW5zIGFyZSB1bmRlcndhdGVyYCxcbiAgICAgIHN0YXRzLndhdGVyQ29sdW1ucywgMCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IHJ1bGVzLm1heE9ic3RydWN0aW9ucykge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmb290cHJpbnRfb2JzdHJ1Y3RlZCcsXG4gICAgICBgJHtzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgZXhjZWVkIHRoZSAke3J1bGVzLm1heE9ic3RydWN0aW9uc30gYWxsb3dhbmNlYCxcbiAgICAgIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGgsIHJ1bGVzLm1heE9ic3RydWN0aW9ucyxcbiAgICApKTtcbiAgfVxuICBpZiAoZnAub3ZlcmhhbmdDZWxscy5sZW5ndGggPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ292ZXJoYW5nJyxcbiAgICAgIGAke2ZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RofSBjZWxscyBhYm92ZSB0aGUgZmxvb3IgYXJlIGJsb2NrZWRgLFxuICAgICAgZnAub3ZlcmhhbmdDZWxscy5sZW5ndGgsIDAsXG4gICAgKSk7XG4gIH1cblxuICBjb25zdCBuZWVkc0dyYWRpbmcgPSBzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZOb1ByZXBcbiAgICB8fCBzdGF0cy5jdXRWb2x1bWUgPiAwIHx8IHN0YXRzLmZpbGxWb2x1bWUgPiAwO1xuICBjb25zdCBuZWVkc0NsZWFyaW5nID0gc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDBcbiAgICAmJiBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoIDw9IHJ1bGVzLm1heE9ic3RydWN0aW9ucztcblxuICBpZiAobmVlZHNHcmFkaW5nKSB7XG4gICAgcmVhc29ucy5wdXNoKHByZXAoXG4gICAgICAnbmVlZHNfZ3JhZGluZycsXG4gICAgICBgZ3JhZGluZyByZXF1aXJlZDogJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgY3V0LCAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZmlsbGAsXG4gICAgICBzdGF0cy5jdXRWb2x1bWUgKyBzdGF0cy5maWxsVm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChuZWVkc0NsZWFyaW5nKSB7XG4gICAgcmVhc29ucy5wdXNoKHByZXAoXG4gICAgICAnbmVlZHNfY2xlYXJpbmcnLFxuICAgICAgYCR7c3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIHRvIGNsZWFyYCxcbiAgICAgIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGgsIHJ1bGVzLm1heE9ic3RydWN0aW9ucyxcbiAgICApKTtcbiAgfVxuXG4gIGNvbnN0IGhhc0Vycm9yID0gcmVhc29ucy5zb21lKChyKSA9PiByLnNldmVyaXR5ID09PSAnZXJyb3InKTtcbiAgY29uc3QgaGFzUHJlcCA9IHJlYXNvbnMuc29tZSgocikgPT4gci5zZXZlcml0eSA9PT0gJ3ByZXBhcmF0aW9uJyk7XG4gIGNvbnN0IHN0YXRlOiBTaXRlU3RhdGUgPSBoYXNFcnJvciA/ICdpbnZhbGlkJyA6IGhhc1ByZXAgPyAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicgOiAndmFsaWQnO1xuXG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgc3RhdGUsXG4gICAgcmVhc29ucyxcbiAgICBxdWVyeTogZnAsXG4gICAgcHJlcGFyYXRpb246IHtcbiAgICAgIG5lZWRzR3JhZGluZyxcbiAgICAgIG5lZWRzQ2xlYXJpbmcsXG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgICBvYnN0cnVjdGlvbklkczogc3RhdHMub2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCksXG4gICAgICBmb3VuZGF0aW9uOiBydWxlcy5mb3VuZGF0aW9uLFxuICAgIH0sXG4gIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2FuZGlkYXRlIHNlYXJjaCAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFNlYXJjaE9wdGlvbnMge1xuICAvKiogQ2FuZGlkYXRlIGdyaWQgc3RlcCBpbiBtZXRyZXMuIERlZmF1bHQgMi4gKi9cbiAgc3RlcD86IG51bWJlcjtcbiAgbWF4UmVzdWx0cz86IG51bWJlcjtcbiAgYW5jaG9yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBtYXhEaXN0YW5jZT86IG51bWJlcjtcbiAgLyoqIEhhcmQgY29uc3RyYWludDogY2FuZGlkYXRlIGNlbnRyZSBtdXN0IGxpZSB3aXRoaW4gdGhpcyByYWRpdXMgb2YgYSBwb2ludC4gKi9cbiAgbmVhcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IG1heERpc3RhbmNlOiBudW1iZXIgfTtcbiAgLyoqIERvIG5vdCByZXR1cm4gdHdvIGNhbmRpZGF0ZXMgd2hvc2UgZm9vdHByaW50cyBvdmVybGFwLiBEZWZhdWx0IHRydWUuICovXG4gIGRpc3RpbmN0PzogYm9vbGVhbjtcbiAgLyoqIFdhbGwtY2xvY2sgYnVkZ2V0IGZvciB0aGUgc2Nhbi4gRGVmYXVsdCAxMDAgbXMuICovXG4gIGJ1ZGdldE1zPzogbnVtYmVyO1xuICB3YWxrPzogV2Fsa1BhcmFtcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlQ2FuZGlkYXRlIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBzdGF0ZTogJ3ZhbGlkJyB8ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJztcbiAgdmFsaWRhdGlvbjogU2l0ZVZhbGlkYXRpb247XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uQ291bnQ6IG51bWJlcjtcbiAgZGlzdGFuY2U6IG51bWJlcjtcbiAgc2NvcmU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlU2VhcmNoUmVzdWx0IHtcbiAgY2FuZGlkYXRlczogU2l0ZUNhbmRpZGF0ZVtdO1xuICBldmFsdWF0ZWQ6IG51bWJlcjtcbiAgcmVqZWN0ZWQ6IG51bWJlcjtcbiAgZWxhcHNlZE1zOiBudW1iZXI7XG4gIGJ1ZGdldE1zOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhlIHdhbGwtY2xvY2sgYnVkZ2V0IHN0b3BwZWQgdGhlIHNjYW4gYmVmb3JlIHRoZSBhcmVhIHdhcyBleGhhdXN0ZWQuICovXG4gIHRydW5jYXRlZDogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gZmxvb3JDYW5kaWRhdGVzKHN0YXRzOiBBcmVhU3RhdHMpOiBudW1iZXJbXSB7XG4gIGNvbnN0IG1lYW4gPSBNYXRoLnJvdW5kKHN0YXRzLm1lYW5ZKTtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGZvciAobGV0IGQgPSAtMTsgZCA8PSAxOyBkKyspIHNldC5hZGQobWVhbiArIGQpO1xuICBzZXQuYWRkKHN0YXRzLm1pblkpO1xuICBzZXQuYWRkKHN0YXRzLm1heFkpO1xuICByZXR1cm4gWy4uLnNldF0uZmlsdGVyKCh5KSA9PiB5ID49IFlfTUlOICYmIHkgPCBZX01BWCkuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xufVxuXG5mdW5jdGlvbiBvdmVybGFwcyhhOiBSZWN0LCBiOiBSZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejA7XG59XG5cbmZ1bmN0aW9uIGNhbmRpZGF0ZVNjb3JlKHY6IFNpdGVWYWxpZGF0aW9uLCBkaXN0YW5jZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgcHJlcFBlbmFsdHkgPSB2LnN0YXRlID09PSAndmFsaWQnID8gMCA6IDI1O1xuICBjb25zdCBncmFkaW5nID0gdi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUgKyB2LnByZXBhcmF0aW9uLmZpbGxWb2x1bWU7XG4gIGNvbnN0IGNsZWFyaW5nID0gdi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcy5sZW5ndGggKiA0O1xuICByZXR1cm4gcHJlcFBlbmFsdHkgKyBncmFkaW5nICsgY2xlYXJpbmcgKyBkaXN0YW5jZSAqIDAuMjU7XG59XG5cbi8qKlxuICogU2VhcmNoIGEgYm91bmRlZCBhcmVhIGZvciB2aWFibGUgZm9vdHByaW50cy4gVGhlIHNhbWUgdmFsaWRhdG9yIGFuZCB0aGUgc2FtZVxuICogZmxvb3Itc2VsZWN0aW9uIHBvbGljeSBhcmUgdXNlZCBieSB0aGUgQUkgYWdlbnQgYW5kIHRoZSBwbGF5ZXIncyBidWlsZFxuICogcHJldmlldy4gU2VhcmNoIGlzIHJlYWQtb25seS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlYXJjaFNpdGVzKFxuICB3b3JsZDogV29ybGQsIHJ1bGVzOiBCdWlsZGluZ1J1bGVzLCBhcmVhOiBSZWN0LCBvcHRpb25zOiBTZWFyY2hPcHRpb25zID0ge30sXG4pOiBTaXRlU2VhcmNoUmVzdWx0IHtcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3Qgc3RlcCA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3Iob3B0aW9ucy5zdGVwID8/IDIpKTtcbiAgY29uc3QgbWF4UmVzdWx0cyA9IE1hdGgubWF4KDEsIG9wdGlvbnMubWF4UmVzdWx0cyA/PyA4KTtcbiAgY29uc3QgZGlzdGluY3QgPSBvcHRpb25zLmRpc3RpbmN0ICE9PSBmYWxzZTtcbiAgY29uc3QgbWF4RGlzdGFuY2UgPSBvcHRpb25zLm1heERpc3RhbmNlID8/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgY29uc3QgYnVkZ2V0TXMgPSBvcHRpb25zLmJ1ZGdldE1zID8/IDEwMDtcbiAgY29uc3QgYW5jaG9yID0gb3B0aW9ucy5hbmNob3IgPz8geyB4OiAoYXJlYS54MCArIGFyZWEueDEpIC8gMiwgejogKGFyZWEuejAgKyBhcmVhLnoxKSAvIDIgfTtcbiAgY29uc3QgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKTtcbiAgY29uc3QgYWxsOiBTaXRlQ2FuZGlkYXRlW10gPSBbXTtcbiAgbGV0IGV2YWx1YXRlZCA9IDA7XG4gIGxldCByZWplY3RlZCA9IDA7XG4gIGxldCB0cnVuY2F0ZWQgPSBmYWxzZTtcblxuICBjb25zdCB4MU1heCA9IGFyZWEueDEgLSBydWxlcy53aWR0aCArIDE7XG4gIGNvbnN0IHoxTWF4ID0gYXJlYS56MSAtIHJ1bGVzLmRlcHRoICsgMTtcbiAgc2NhbjogZm9yIChsZXQgeiA9IGFyZWEuejA7IHogPD0gejFNYXg7IHogKz0gc3RlcCkge1xuICAgIGZvciAobGV0IHggPSBhcmVhLngwOyB4IDw9IHgxTWF4OyB4ICs9IHN0ZXApIHtcbiAgICAgIGNvbnN0IHJlY3QgPSB7IHgwOiB4LCB6MDogeiwgeDE6IHggKyBydWxlcy53aWR0aCAtIDEsIHoxOiB6ICsgcnVsZXMuZGVwdGggLSAxIH07XG4gICAgICBjb25zdCBjeCA9IChyZWN0LngwICsgcmVjdC54MSkgLyAyO1xuICAgICAgY29uc3QgY3ogPSAocmVjdC56MCArIHJlY3QuejEpIC8gMjtcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5oeXBvdChjeCAtIGFuY2hvci54LCBjeiAtIGFuY2hvci56KTtcbiAgICAgIGlmIChkaXN0YW5jZSA+IG1heERpc3RhbmNlKSBjb250aW51ZTtcbiAgICAgIGlmIChvcHRpb25zLm5lYXIpIHtcbiAgICAgICAgY29uc3QgbmVhckRpc3RhbmNlID0gTWF0aC5oeXBvdChjeCAtIG9wdGlvbnMubmVhci54LCBjeiAtIG9wdGlvbnMubmVhci56KTtcbiAgICAgICAgaWYgKG5lYXJEaXN0YW5jZSA+IG9wdGlvbnMubmVhci5tYXhEaXN0YW5jZSkgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0YXRzID0gcXVlcnkuYXJlYShyZWN0KTtcbiAgICAgIGxldCBiZXN0OiBTaXRlQ2FuZGlkYXRlIHwgbnVsbCA9IG51bGw7XG4gICAgICBmb3IgKGNvbnN0IGZsb29yWSBvZiBmbG9vckNhbmRpZGF0ZXMoc3RhdHMpKSB7XG4gICAgICAgIGV2YWx1YXRlZCsrO1xuICAgICAgICBjb25zdCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsID0ge1xuICAgICAgICAgIHNpdGVJZDogYCR7cnVsZXMuaWR9OiR7eH0sJHt6fSwke2Zsb29yWX1gLFxuICAgICAgICAgIHJlY3QsIGZsb29yWSwgcnVsZXMsXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGZvb3RwcmludCA9IHF1ZXJ5LmZvb3RwcmludChyZWN0LCBmbG9vclkpO1xuICAgICAgICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCwgcXVlcnksIGZvb3RwcmludCk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcpIHtcbiAgICAgICAgICByZWplY3RlZCsrO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHNjb3JlID0gY2FuZGlkYXRlU2NvcmUodmFsaWRhdGlvbiwgZGlzdGFuY2UpO1xuICAgICAgICBjb25zdCBjYW5kaWRhdGU6IFNpdGVDYW5kaWRhdGUgPSB7XG4gICAgICAgICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgICAgICAgcmVjdCxcbiAgICAgICAgICBmbG9vclksXG4gICAgICAgICAgc3RhdGU6IHZhbGlkYXRpb24uc3RhdGUsXG4gICAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgICAgICBjdXRWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uY3V0Vm9sdW1lLFxuICAgICAgICAgIGZpbGxWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZmlsbFZvbHVtZSxcbiAgICAgICAgICBvYnN0cnVjdGlvbkNvdW50OiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzLmxlbmd0aCxcbiAgICAgICAgICBkaXN0YW5jZSxcbiAgICAgICAgICBzY29yZSxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFiZXN0XG4gICAgICAgICAgfHwgKGNhbmRpZGF0ZS5zdGF0ZSA9PT0gJ3ZhbGlkJyAmJiBiZXN0LnN0YXRlICE9PSAndmFsaWQnKVxuICAgICAgICAgIHx8IChjYW5kaWRhdGUuc3RhdGUgPT09IGJlc3Quc3RhdGUgJiYgY2FuZGlkYXRlLnNjb3JlIDwgYmVzdC5zY29yZSkpIHtcbiAgICAgICAgICBiZXN0ID0gY2FuZGlkYXRlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYmVzdCkgYWxsLnB1c2goYmVzdCk7XG4gICAgfVxuICAgIGlmIChwZXJmb3JtYW5jZS5ub3coKSAtIHQwID4gYnVkZ2V0TXMpIHtcbiAgICAgIHRydW5jYXRlZCA9IHRydWU7XG4gICAgICBicmVhayBzY2FuO1xuICAgIH1cbiAgfVxuXG4gIGFsbC5zb3J0KChhLCBiKSA9PiBhLnNjb3JlIC0gYi5zY29yZSB8fCBhLmRpc3RhbmNlIC0gYi5kaXN0YW5jZVxuICAgIHx8IGEucmVjdC54MCAtIGIucmVjdC54MCB8fCBhLnJlY3QuejAgLSBiLnJlY3QuejApO1xuICBjb25zdCBzZWxlY3RlZDogU2l0ZUNhbmRpZGF0ZVtdID0gW107XG4gIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGFsbCkge1xuICAgIGlmIChkaXN0aW5jdCAmJiBzZWxlY3RlZC5zb21lKChzKSA9PiBvdmVybGFwcyhzLnJlY3QsIGNhbmRpZGF0ZS5yZWN0KSkpIGNvbnRpbnVlO1xuICAgIHNlbGVjdGVkLnB1c2goY2FuZGlkYXRlKTtcbiAgICBpZiAoc2VsZWN0ZWQubGVuZ3RoID49IG1heFJlc3VsdHMpIGJyZWFrO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5kaWRhdGVzOiBzZWxlY3RlZCxcbiAgICBldmFsdWF0ZWQsXG4gICAgcmVqZWN0ZWQsXG4gICAgZWxhcHNlZE1zOiBNYXRoLnJvdW5kKChwZXJmb3JtYW5jZS5ub3coKSAtIHQwKSAqIDEwMCkgLyAxMDAsXG4gICAgYnVkZ2V0TXMsXG4gICAgdHJ1bmNhdGVkLFxuICB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHByZXZpZXcgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBGb3VuZGF0aW9uUHJldmlldyB7XG4gIHR5cGU6IEZvdW5kYXRpb25UeXBlO1xuICAvKiogU3RvbmUgZmxvb3Igc2xhYiBwbHVzIGZpbGwgdW5kZXIgdGhlIHByZXBhcmVkIGZsb29yLiAqL1xuICBwbGludGhDZWxsczogbnVtYmVyO1xuICAvKiogUGVyaW1ldGVyIGNlbGxzIHRoYXQgbmVlZCBhIHJldGFpbmluZyBmYWNlIGJlY2F1c2Ugb2YgY3V0IG9yIGZpbGwuICovXG4gIHJldGFpbmluZ1dhbGxDZWxsczogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFjY2Vzc1ByZXZpZXcge1xuICBkb29yOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGRpc3RhbmNlOiBudW1iZXI7XG4gIGdyYWRlOiBudW1iZXI7XG4gIHdhbGthYmxlOiBib29sZWFuO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlUHJldmlldyB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgdGVycmFpbjoge1xuICAgIG1pblk6IG51bWJlcjtcbiAgICBtYXhZOiBudW1iZXI7XG4gICAgbWVhblk6IG51bWJlcjtcbiAgICByZWxpZWY6IG51bWJlcjtcbiAgICBtYXhTdGVwOiBudW1iZXI7XG4gICAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gICAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICAgIG1heEN1dDogbnVtYmVyO1xuICAgIG1heEZpbGw6IG51bWJlcjtcbiAgfTtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblByZXZpZXc7XG4gIG9ic3RydWN0aW9uczogQXJyYXk8e1xuICAgIGVudGl0eUlkOiBzdHJpbmc7XG4gICAga2luZDogc3RyaW5nO1xuICAgIHg6IG51bWJlcjtcbiAgICB6OiBudW1iZXI7XG4gICAgYWN0aW9uOiAnY2xlYXInIHwgJ2Jsb2NrZWQnO1xuICB9PjtcbiAgYWNjZXNzOiBBY2Nlc3NQcmV2aWV3IHwgbnVsbDtcbiAgLyoqIENvbXBsZXRlIHdvcmsgZW52ZWxvcGUgdGhpcyBwcmV2aWV3IHdvdWxkIGF1dGhvcml6ZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJldmlld09wdGlvbnMge1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgd2Fsaz86IFdhbGtQYXJhbXM7XG59XG5cbi8qKlxuICogQnVpbGQgdGhlIHRocmVlLXN0YXRlIHByZXZpZXcuIEl0IGlzIGRlbGliZXJhdGVseSBkYXRhLW9ubHk6IHRoZSByZW5kZXJlclxuICogY2FuIGRyYXcgaXQsIGJ1dCBpdCBuZXZlciBlZGl0cyB0ZXJyYWluIG9yIHNwZW5kcyByZXNvdXJjZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmV2aWV3U2l0ZShcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBvcHRpb25zOiBQcmV2aWV3T3B0aW9ucyA9IHt9LFxuKTogU2l0ZVByZXZpZXcge1xuICBjb25zdCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpO1xuICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCwgcXVlcnkpO1xuICBjb25zdCBmcCA9IHZhbGlkYXRpb24ucXVlcnk7XG4gIGNvbnN0IHN0YXRzID0gZnAuc3RhdHM7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCBydWxlcyA9IHByb3Bvc2FsLnJ1bGVzO1xuXG4gIGxldCBwZXJpbWV0ZXIgPSAwO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICAgIGlmICh4ICE9PSByZWN0LngwICYmIHggIT09IHJlY3QueDEgJiYgeiAhPT0gcmVjdC56MCAmJiB6ICE9PSByZWN0LnoxKSBjb250aW51ZTtcbiAgICAgIGlmIChjb2x1bW5BdCh3b3JsZCwgeCwgeikuc3VyZmFjZVkgIT09IHByb3Bvc2FsLmZsb29yWSkgcGVyaW1ldGVyKys7XG4gICAgfVxuICB9XG4gIGNvbnN0IGZvdW5kYXRpb246IEZvdW5kYXRpb25QcmV2aWV3ID0ge1xuICAgIHR5cGU6IHJ1bGVzLmZvdW5kYXRpb24sXG4gICAgcGxpbnRoQ2VsbHM6IHJlY3RDb2x1bW5zKHJlY3QpICsgc3RhdHMuZmlsbFZvbHVtZSxcbiAgICByZXRhaW5pbmdXYWxsQ2VsbHM6IHBlcmltZXRlcixcbiAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICB9O1xuXG4gIGxldCBhY2Nlc3M6IEFjY2Vzc1ByZXZpZXcgfCBudWxsID0gbnVsbDtcbiAgaWYgKG9wdGlvbnMuZG9vciAmJiBvcHRpb25zLmFwcHJvYWNoKSB7XG4gICAgY29uc3QgZG9vciA9IG9wdGlvbnMuZG9vcjtcbiAgICBjb25zdCBhcHByb2FjaCA9IG9wdGlvbnMuYXBwcm9hY2g7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguaHlwb3QoZG9vci54IC0gYXBwcm9hY2gueCwgZG9vci56IC0gYXBwcm9hY2gueik7XG4gICAgY29uc3Qgc3RlcHMgPSBNYXRoLm1heCgxLCBNYXRoLmNlaWwoZGlzdGFuY2UpKTtcbiAgICBsZXQgcHJldlggPSBhcHByb2FjaC54LCBwcmV2WiA9IGFwcHJvYWNoLno7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gc3RlcHM7IGkrKykge1xuICAgICAgY29uc3QgdCA9IGkgLyBzdGVwcztcbiAgICAgIGNvbnN0IHggPSBNYXRoLnJvdW5kKGFwcHJvYWNoLnggKyAoZG9vci54IC0gYXBwcm9hY2gueCkgKiB0KTtcbiAgICAgIGNvbnN0IHogPSBNYXRoLnJvdW5kKGFwcHJvYWNoLnogKyAoZG9vci56IC0gYXBwcm9hY2gueikgKiB0KTtcbiAgICAgIGlmICh4ID09PSBwcmV2WCAmJiB6ID09PSBwcmV2WikgY29udGludWU7XG4gICAgICBjb25zdCByZXN1bHQgPSB3YWxrU3RlcCh3b3JsZCwgcHJldlgsIHByZXZaLCB4LCB6LCBvcHRpb25zLndhbGsgPz8gREVGQVVMVF9XQUxLKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZWFzb25zLnB1c2goYCR7cmVzdWx0LnJlYXNvbn0gYXQgJHt4fSwke3p9YCk7XG4gICAgICBwcmV2WCA9IHg7IHByZXZaID0gejtcbiAgICB9XG4gICAgYWNjZXNzID0ge1xuICAgICAgZG9vciwgYXBwcm9hY2gsIGRpc3RhbmNlLFxuICAgICAgZ3JhZGU6IGVmZmVjdGl2ZUdyYWRlKHdvcmxkLCBhcHByb2FjaC54LCBhcHByb2FjaC56LCBkb29yLngsIGRvb3IueiksXG4gICAgICB3YWxrYWJsZTogcmVhc29ucy5sZW5ndGggPT09IDAsXG4gICAgICByZWFzb25zLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB5MCA9IHByb3Bvc2FsLmZsb29yWSAtIE1hdGgubWF4KDEsIHN0YXRzLm1heEN1dCkgLSAxO1xuICBjb25zdCB5MSA9IHByb3Bvc2FsLmZsb29yWSArIE1hdGgubWF4KHJ1bGVzLndhbGxIZWlnaHQsIDEpICsgMTtcbiAgY29uc3QgZW52ZWxvcGU6IFZveGVsUmVnaW9uW10gPSBbXG4gICAge1xuICAgICAgLi4uZXhwYW5kUmVjdChyZWN0LCAyKSxcbiAgICAgIHkwOiBNYXRoLm1heChZX01JTiwgeTApLFxuICAgICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgeTEpLFxuICAgIH0sXG4gIF07XG4gIGlmIChhY2Nlc3MpIHtcbiAgICBjb25zdCBheDAgPSBNYXRoLm1pbihhY2Nlc3MuZG9vci54LCBhY2Nlc3MuYXBwcm9hY2gueCkgLSAxO1xuICAgIGNvbnN0IGF4MSA9IE1hdGgubWF4KGFjY2Vzcy5kb29yLngsIGFjY2Vzcy5hcHByb2FjaC54KSArIDE7XG4gICAgY29uc3QgYXowID0gTWF0aC5taW4oYWNjZXNzLmRvb3IueiwgYWNjZXNzLmFwcHJvYWNoLnopIC0gMTtcbiAgICBjb25zdCBhejEgPSBNYXRoLm1heChhY2Nlc3MuZG9vci56LCBhY2Nlc3MuYXBwcm9hY2gueikgKyAxO1xuICAgIGNvbnN0IGFNaW4gPSBNYXRoLm1pbihzdXJmYWNlQXQod29ybGQsIGF4MCwgYXowKSwgc3VyZmFjZUF0KHdvcmxkLCBheDEsIGF6MSkpO1xuICAgIGNvbnN0IGFNYXggPSBNYXRoLm1heChzdXJmYWNlQXQod29ybGQsIGF4MCwgYXowKSwgc3VyZmFjZUF0KHdvcmxkLCBheDEsIGF6MSkpO1xuICAgIGVudmVsb3BlLnB1c2goe1xuICAgICAgeDA6IGF4MCwgeDE6IGF4MSwgejA6IGF6MCwgejE6IGF6MSxcbiAgICAgIHkwOiBNYXRoLm1heChZX01JTiwgYU1pbiAtIDIpLFxuICAgICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgYU1heCArIDIpLFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICBzdGF0ZTogdmFsaWRhdGlvbi5zdGF0ZSxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIHJ1bGVzLFxuICAgIHJlYXNvbnM6IHZhbGlkYXRpb24ucmVhc29ucyxcbiAgICB0ZXJyYWluOiB7XG4gICAgICBtaW5ZOiBzdGF0cy5taW5ZLFxuICAgICAgbWF4WTogc3RhdHMubWF4WSxcbiAgICAgIG1lYW5ZOiBzdGF0cy5tZWFuWSxcbiAgICAgIHJlbGllZjogc3RhdHMucmVsaWVmLFxuICAgICAgbWF4U3RlcDogc3RhdHMubWF4U3RlcCxcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICB9LFxuICAgIGZvdW5kYXRpb24sXG4gICAgb2JzdHJ1Y3Rpb25zOiBzdGF0cy5vYnN0cnVjdGlvbnMubWFwKChvKSA9PiAoe1xuICAgICAgZW50aXR5SWQ6IG8uZW50aXR5SWQsXG4gICAgICBraW5kOiBvLmtpbmQsXG4gICAgICB4OiBvLngsXG4gICAgICB6OiBvLnosXG4gICAgICBhY3Rpb246IHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJyA/ICdibG9ja2VkJyA6ICdjbGVhcicsXG4gICAgfSkpLFxuICAgIGFjY2VzcyxcbiAgICBlbnZlbG9wZSxcbiAgfTtcbn1cblxuIiwgIi8vIE0wMDIgc3RhZ2UgMzogYm91bmRlZCwgYXV0aG9yaXplZCB0ZXJyYWluIHByZXBhcmF0aW9uLlxuLy9cbi8vIFRoZSBwaXBlbGluZSBpcyBkZWxpYmVyYXRlbHkgb25lLXdheSBhbmQgc2hhcmVkIGJ5IHRoZSBwbGF5ZXIgYW5kIHRoZSBBSTpcbi8vXG4vLyAgIHByb3Bvc2FsIC0+IHZhbGlkYXRlU2l0ZSAtPiBwbGFuUHJlcGFyYXRpb24gLT4gQXV0aG9yaXplciAtPiBleGVjdXRlXG4vL1xuLy8gYGV4ZWN1dGVQcmVwYXJhdGlvbmAgaXMgdGhlIG9ubHkgZnVuY3Rpb24gaW4gTTAwMiB0aGF0IGVkaXRzIHRlcnJhaW4gZm9yXG4vLyBjb25zdHJ1Y3Rpb24uIEl0IHJlZnVzZXMgdG8gcnVuIHdpdGhvdXQgYW4gYXV0aG9yaXphdGlvbiB0b2tlbiB3aG9zZSBkaWdlc3Rcbi8vIG1hdGNoZXMgdGhlIHBsYW4sIHdob3NlIGVudmVsb3BlIGNvdmVycyBldmVyeSB2b3hlbCBpdCB3b3VsZCB0b3VjaCwgYW5kIHdob3NlXG4vLyBiYXNlIHJldmlzaW9uIHN0aWxsIG1hdGNoZXMgdGhlIHdvcmxkLiBBbGwgZWRpdHMgYXJlIGNvbXB1dGVkIGFuZCBjaGVja2VkXG4vLyBiZWZvcmUgdGhlIGZpcnN0IGJ5dGUgaXMgd3JpdHRlbiwgc28gYSByZWplY3RlZCBwbGFuIGNhbm5vdCBsZWF2ZSBhIHBhcnRpYWxcbi8vIHBhZCBiZWhpbmQuXG4vL1xuLy8gVGhlIGF1dGhvcml6ZXIgaW4gdGhpcyBmaWxlIGlzIGEgbG9jYWwgcG9saWN5IHN0dWIuIEl0IHByb3ZlcyB0aGF0IHRoZVxuLy8gcGlwZWxpbmUgYW5kIHRoZSBlbnZlbG9wZSBjaGVja3MgZXhpc3Q7IGl0IGlzIE5PVCBNYWdpY0Jsb2NrIGVuZm9yY2VtZW50LlxuLy8gTm8gY2hhaW4gcHJvZ3JhbSwgU0RLIGNhbGwsIHNldHRsZW1lbnQgb3Igcm9sbGJhY2sgZ3VhcmFudGVlIGlzIHByZXNlbnQuXG5pbXBvcnQge1xuICBXb3JsZCwgTUFULCBNYXRJZCwgWV9NSU4sIFlfTUFYLCBIQUxGLCBpc1NvbGlkLFxuICBnZXRWb3hlbCwgc2V0Vm94ZWwsIHJlbW92ZUVudGl0eSwgc3VyZmFjZUF0LFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgRW50aXR5S2luZCwgUmVzb3VyY2VUeXBlLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBub3JtYWxpemVSZWN0LCByZWN0Q29sdW1ucywgZXhwYW5kUmVjdCxcbiAgZW52ZWxvcGVDb250YWlucywgb2JzdHJ1Y3Rpb25zSW4sXG59IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQge1xuICBTaXRlUHJvcG9zYWwsIFNpdGVWYWxpZGF0aW9uLCBCdWlsZGluZ1J1bGVzLCB2YWxpZGF0ZVNpdGUsXG59IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7XG4gIGludmVudG9yeVNuYXBzaG90LCBub3JtYWxpemVFbnZlbG9wZSxcbn0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTE9DQUxfQVVUSE9SSVRZID0gJ2xvY2FsLXN0dWInIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IExPQ0FMX0VORk9SQ0VNRU5UID0gJ2xvY2FsLXNpbXVsYXRpb24tb25seScgYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29sdW1uVGFyZ2V0IHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQbGFuRXhwZWN0YXRpb24ge1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBvYnN0cnVjdGlvbnM6IG51bWJlcjtcbiAgc3VyZmFjZUVkaXRzOiBudW1iZXI7XG4gIHRvdGFsRWRpdHM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblBsYW4ge1xuICBpZDogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICAvKiogRXhhY3RseSBvbmUgdGFyZ2V0IHdhbGtpbmcgaGVpZ2h0IHBlciBmb290cHJpbnQgY29sdW1uLCBzb3J0ZWQgYnkgeiwgeC4gKi9cbiAgdGFyZ2V0czogQ29sdW1uVGFyZ2V0W107XG4gIC8qKiBBdXRob3JpdGF0aXZlIGVudGl0eSBpZHMgdGhpcyBwbGFuIG1heSByZW1vdmUuICovXG4gIGNsZWFyRW50aXR5SWRzOiBzdHJpbmdbXTtcbiAgLyoqIE1hdGVyaWFsIGZvciB0aGUgdG9wIHNvbGlkIHZveGVsIGFmdGVyIGdyYWRpbmcsIG9yIG51bGwgdG8ga2VlcCBpdC4gKi9cbiAgc3VyZmFjZU1hdGVyaWFsOiBNYXRJZCB8IG51bGw7XG4gIC8qKiBUaWdodCBlbnZlbG9wZSBjb3ZlcmluZyBldmVyeSBwbGFubmVkIHZveGVsIGNoYW5nZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGV4cGVjdGVkOiBQbGFuRXhwZWN0YXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25PcHRpb25zIHtcbiAgLyoqIFBlci1jb2x1bW4gdGFyZ2V0cyBmb3IgdGVycmFjZXMgb3Igc3RlcHBlZCBwYXRocy4gRGVmYXVsdHMgdG8gZmxvb3JZLiAqL1xuICB0YXJnZXRzPzogQ29sdW1uVGFyZ2V0W107XG4gIC8qKiBgbm9uZWAgaXMgb25seSBsZWdhbCB3aGVuIHRoZSBzaXRlIGhhcyBubyBvYnN0cnVjdGlvbnMuICovXG4gIGNsZWFyPzogJ29ic3RydWN0aW9ucycgfCAnbm9uZSc7XG4gIC8qKiBTZXQgdGhlIHRvcCBzb2xpZCB2b3hlbCBvZiBldmVyeSB0YXJnZXQgY29sdW1uIChwYXRocywgZmllbGRzKS4gKi9cbiAgc3VyZmFjZU1hdGVyaWFsPzogTWF0SWQ7XG4gIC8qKiBFeHBsaWNpdCB3b3JrIGVudmVsb3BlLiBEZWZhdWx0cyB0byBhIHRpZ2h0IGVudmVsb3BlIGFyb3VuZCB0aGUgZWRpdHMuICovXG4gIGVudmVsb3BlPzogVm94ZWxSZWdpb25bXTtcbn1cblxuLy8gLS0tLS0tLS0tLSBzdGFibGUgZGlnZXN0IC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGRpZ2VzdChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGEgPSAweDgxMWM5ZGM1O1xuICBsZXQgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaW5wdXQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gaW5wdXQuY2hhckNvZGVBdChpKTtcbiAgICBhID0gTWF0aC5pbXVsKGEgXiBjLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoYyArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICBiIF49IGIgPj4+IDEzO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuLyoqIERpZ2VzdCBvZiBldmVyeXRoaW5nIHRoYXQgY2hhbmdlcyB0aGUgc2V0IG9mIGVkaXRzIG9yIHJlbW92YWxzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW5EaWdlc3QocGxhbjogUHJlcGFyYXRpb25QbGFuKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW1xuICAgICdtMDAyOnByZXAtcGxhbjp2MScsXG4gICAgcGxhbi5zaXRlSWQsXG4gICAgYCR7cGxhbi5yZWN0LngwfSwke3BsYW4ucmVjdC56MH0sJHtwbGFuLnJlY3QueDF9LCR7cGxhbi5yZWN0LnoxfWAsXG4gICAgU3RyaW5nKHBsYW4uZmxvb3JZKSxcbiAgICBwbGFuLnJ1bGVzLmlkLFxuICAgIFN0cmluZyhwbGFuLnRhcmdldHMubGVuZ3RoKSxcbiAgICBwbGFuLnN1cmZhY2VNYXRlcmlhbCA9PT0gbnVsbCA/ICdzdXJmYWNlOmtlZXAnIDogYHN1cmZhY2U6JHtwbGFuLnN1cmZhY2VNYXRlcmlhbH1gLFxuICBdO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSBsaW5lcy5wdXNoKGB0OiR7dC54fSwke3Quen0sJHt0Lnl9YCk7XG4gIGNvbnN0IGNsZWFycyA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gIGxpbmVzLnB1c2goYGM6JHtjbGVhcnMubGVuZ3RofWApO1xuICBmb3IgKGNvbnN0IGlkIG9mIGNsZWFycykgbGluZXMucHVzaChgYzoke2lkfWApO1xuICBmb3IgKGNvbnN0IGUgb2Ygbm9ybWFsaXplRW52ZWxvcGUocGxhbi5lbnZlbG9wZSkpIHtcbiAgICBsaW5lcy5wdXNoKGBlOiR7ZS54MH0sJHtlLnowfSwke2UueTB9LCR7ZS54MX0sJHtlLnoxfSwke2UueTF9YCk7XG4gIH1cbiAgY29uc3QgeCA9IHBsYW4uZXhwZWN0ZWQ7XG4gIGxpbmVzLnB1c2goYHg6JHt4LmN1dFZvbHVtZX0sJHt4LmZpbGxWb2x1bWV9LCR7eC5tYXhDdXR9LCR7eC5tYXhGaWxsfSwke3gub2JzdHJ1Y3Rpb25zfSwke3guc3VyZmFjZUVkaXRzfSwke3gudG90YWxFZGl0c31gKTtcbiAgcmV0dXJuIGRpZ2VzdChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGxhbm5pbmcgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBQbGFuU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBQcmVwYXJhdGlvblBsYW47XG4gIHZhbGlkYXRpb246IFNpdGVWYWxpZGF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgc3RhZ2U6ICdwbGFuJyB8ICdhdXRob3JpemUnIHwgJ2V4ZWN1dGUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xuICB2YWxpZGF0aW9uPzogU2l0ZVZhbGlkYXRpb247XG59XG5cbmV4cG9ydCB0eXBlIFBsYW5SZXN1bHQgPSBQbGFuU3VjY2VzcyB8IFByZXBhcmF0aW9uRmFpbHVyZTtcblxuZnVuY3Rpb24gZGVmYXVsdFRhcmdldHMod29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0LCBmbG9vclk6IG51bWJlcik6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3Qgb3V0OiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIG91dC5wdXNoKHsgeCwgeiwgeTogZmxvb3JZIH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHNvcnRlZFRhcmdldHModGFyZ2V0czogcmVhZG9ubHkgQ29sdW1uVGFyZ2V0W10pOiBDb2x1bW5UYXJnZXRbXSB7XG4gIHJldHVybiBbLi4udGFyZ2V0c10uc29ydCgoYSwgYikgPT4gYS56IC0gYi56IHx8IGEueCAtIGIueCB8fCBhLnkgLSBiLnkpO1xufVxuXG5pbnRlcmZhY2UgVGFyZ2V0U3RhdHMge1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICByZWxpZWY6IG51bWJlcjtcbn1cblxuLyoqIEN1dC9maWxsIGltcGxpZWQgYnkgZXhwbGljaXQgdGFyZ2V0cywgaW5kZXBlbmRlbnQgb2YgdGhlIGZsYXQgZmxvb3JZLiAqL1xuZnVuY3Rpb24gdGFyZ2V0U3RhdHMod29ybGQ6IFdvcmxkLCB0YXJnZXRzOiByZWFkb25seSBDb2x1bW5UYXJnZXRbXSk6IFRhcmdldFN0YXRzIHtcbiAgbGV0IGN1dFZvbHVtZSA9IDAsIGZpbGxWb2x1bWUgPSAwLCBtYXhDdXQgPSAwLCBtYXhGaWxsID0gMDtcbiAgbGV0IG1pblkgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heFkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIG1pblkgPSBNYXRoLm1pbihtaW5ZLCBzdXJmYWNlLCB0LnkpO1xuICAgIG1heFkgPSBNYXRoLm1heChtYXhZLCBzdXJmYWNlLCB0LnkpO1xuICAgIGlmIChzdXJmYWNlID4gdC55KSB7XG4gICAgICBjb25zdCBkID0gc3VyZmFjZSAtIHQueTtcbiAgICAgIGN1dFZvbHVtZSArPSBkO1xuICAgICAgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkKTtcbiAgICB9IGVsc2UgaWYgKHN1cmZhY2UgPCB0LnkpIHtcbiAgICAgIGNvbnN0IGQgPSB0LnkgLSBzdXJmYWNlO1xuICAgICAgZmlsbFZvbHVtZSArPSBkO1xuICAgICAgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIGQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4geyBjdXRWb2x1bWUsIGZpbGxWb2x1bWUsIG1heEN1dCwgbWF4RmlsbCwgcmVsaWVmOiBtYXhZIC0gbWluWSB9O1xufVxuXG5mdW5jdGlvbiB0YXJnZXRSdWxlUmVhc29ucyhzdGF0czogVGFyZ2V0U3RhdHMsIHJ1bGVzOiBCdWlsZGluZ1J1bGVzKTogc3RyaW5nW10ge1xuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQpIHtcbiAgICByZWFzb25zLnB1c2goYHJlbGllZiAke3N0YXRzLnJlbGllZn0gbSBleGNlZWRzIHRoZSAke3J1bGVzLm1heFJlbGllZlByZXBhcmVkfSBtIHByZXBhcmVkIGxpbWl0YCk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEN1dCA+IHJ1bGVzLm1heEN1dCkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0ICR7c3RhdHMubWF4Q3V0fSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXR9IG1gKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4RmlsbCA+IHJ1bGVzLm1heEZpbGwpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgJHtzdGF0cy5tYXhGaWxsfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsfSBtYCk7XG4gIH1cbiAgaWYgKHN0YXRzLmN1dFZvbHVtZSA+IHJ1bGVzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0IHZvbHVtZSAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4Q3V0Vm9sdW1lfSBtXHUwMEIzYCk7XG4gIH1cbiAgaWYgKHN0YXRzLmZpbGxWb2x1bWUgPiBydWxlcy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsIHZvbHVtZSAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEZpbGxWb2x1bWV9IG1cdTAwQjNgKTtcbiAgfVxuICByZXR1cm4gcmVhc29ucztcbn1cblxuLyoqXG4gKiBUdXJuIGEgcHJvcG9zYWwgaW50byBhbiBleHBsaWNpdCwgY2hlY2thYmxlIHBsYW4uIFJlYWQtb25seS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW5QcmVwYXJhdGlvbihcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBvcHRpb25zOiBQcmVwYXJhdGlvbk9wdGlvbnMgPSB7fSxcbik6IFBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwpO1xuXG4gIGlmICh2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICdzaXRlX2ludmFsaWQnLFxuICAgICAgcmVhc29uczogdmFsaWRhdGlvbi5yZWFzb25zLm1hcCgocikgPT4gYCR7ci5jb2RlfTogJHtyLm1lc3NhZ2V9YCksXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB0YXJnZXRzID0gc29ydGVkVGFyZ2V0cyhvcHRpb25zLnRhcmdldHMgPz8gZGVmYXVsdFRhcmdldHMod29ybGQsIHJlY3QsIHByb3Bvc2FsLmZsb29yWSkpO1xuICBjb25zdCBjb2x1bW5zID0gcmVjdENvbHVtbnMocmVjdCk7XG4gIGlmICh0YXJnZXRzLmxlbmd0aCAhPT0gY29sdW1ucykge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3RhcmdldF9jb3VudCcsXG4gICAgICByZWFzb25zOiBbYHBsYW4gaGFzICR7dGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZm9yICR7Y29sdW1uc30gY29sdW1uc2BdLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG5cbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IGtleSA9IGAke3QueH0sJHt0Lnp9YDtcbiAgICBpZiAoc2Vlbi5oYXMoa2V5KSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAnZHVwbGljYXRlX3RhcmdldCcsXG4gICAgICAgIHJlYXNvbnM6IFtgZHVwbGljYXRlIHRhcmdldCBhdCAke2tleX1gXSwgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICAgIHNlZW4uYWRkKGtleSk7XG4gICAgaWYgKHQueCA8IHJlY3QueDAgfHwgdC54ID4gcmVjdC54MSB8fCB0LnogPCByZWN0LnowIHx8IHQueiA+IHJlY3QuejEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ3RhcmdldF9vdXRzaWRlX2Zvb3RwcmludCcsXG4gICAgICAgIHJlYXNvbnM6IFtgdGFyZ2V0ICR7a2V5fSBpcyBvdXRzaWRlICR7cmVjdC54MH0sJHtyZWN0LnowfS4uJHtyZWN0LngxfSwke3JlY3QuejF9YF0sXG4gICAgICAgIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIodC55KSB8fCB0LnkgPCBZX01JTiB8fCB0LnkgPj0gWV9NQVgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ3RhcmdldF9oZWlnaHQnLFxuICAgICAgICByZWFzb25zOiBbYHRhcmdldCAke2tleX0gaGFzIGludmFsaWQgaGVpZ2h0ICR7dC55fWBdLCB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzO1xuICBjb25zdCBjbGVhciA9IG9wdGlvbnMuY2xlYXIgPz8gJ29ic3RydWN0aW9ucyc7XG4gIGlmIChjbGVhciA9PT0gJ25vbmUnICYmIG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAndW5jbGVhcmVkX29ic3RydWN0aW9ucycsXG4gICAgICByZWFzb25zOiBbYCR7b2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIHdvdWxkIHJlbWFpbmBdLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG4gIGNvbnN0IGNsZWFyRW50aXR5SWRzID0gY2xlYXIgPT09ICdub25lJyA/IFtdIDogWy4uLm5ldyBTZXQob2JzdHJ1Y3Rpb25zKV0uc29ydCgpO1xuICBjb25zdCBzdXJmYWNlTWF0ZXJpYWwgPSBvcHRpb25zLnN1cmZhY2VNYXRlcmlhbCA/PyBudWxsO1xuXG4gIGNvbnN0IGN1c3RvbVRhcmdldHMgPSBvcHRpb25zLnRhcmdldHMgIT09IHVuZGVmaW5lZDtcbiAgY29uc3Qgc3RhdHMgPSBjdXN0b21UYXJnZXRzXG4gICAgPyB0YXJnZXRTdGF0cyh3b3JsZCwgdGFyZ2V0cylcbiAgICA6IHtcbiAgICAgIGN1dFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5tYXhGaWxsLFxuICAgICAgcmVsaWVmOiB2YWxpZGF0aW9uLnF1ZXJ5LnN0YXRzLnJlbGllZixcbiAgICB9O1xuICBpZiAoY3VzdG9tVGFyZ2V0cykge1xuICAgIGNvbnN0IHJlYXNvbnMgPSB0YXJnZXRSdWxlUmVhc29ucyhzdGF0cywgcHJvcG9zYWwucnVsZXMpO1xuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgICAgY29kZTogJ3RhcmdldF9ydWxlcycsXG4gICAgICAgIHJlYXNvbnMsXG4gICAgICAgIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGxldCBsbyA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgbGV0IGhpID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBsbyA9IE1hdGgubWluKGxvLCBzdXJmYWNlLCB0LnkpO1xuICAgIGhpID0gTWF0aC5tYXgoaGksIHN1cmZhY2UgLSAxLCB0LnkgLSAxKTtcbiAgfVxuICBjb25zdCBidWZmZXJlZCA9IGV4cGFuZFJlY3QocmVjdCwgMSk7XG4gIGNvbnN0IGRlcml2ZWQ6IFZveGVsUmVnaW9uID0ge1xuICAgIHgwOiBNYXRoLm1heCgtSEFMRiwgYnVmZmVyZWQueDApLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgYnVmZmVyZWQuejApLFxuICAgIHgxOiBNYXRoLm1pbihIQUxGIC0gMSwgYnVmZmVyZWQueDEpLFxuICAgIHoxOiBNYXRoLm1pbihIQUxGIC0gMSwgYnVmZmVyZWQuejEpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgbG8gLSAxKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBoaSArIDEpLFxuICB9O1xuICAvLyBBbiBleHBsaWNpdCBlbnZlbG9wZSByZXBsYWNlcyB0aGUgZGVyaXZlZCBvbmUuIENhbGxlcnMgdGhhdCBwaW4gYW4gZXhhY3RcbiAgLy8gd29yayBlbnZlbG9wZSAocGF0aCBwcmVwYXJhdGlvbikgbXVzdCBub3Qgc2lsZW50bHkgd2lkZW4gaXQgd2l0aCB0aGVcbiAgLy8gZGVmYXVsdCAxIG0gYnVmZmVyLlxuICBjb25zdCBlbnZlbG9wZSA9IG5vcm1hbGl6ZUVudmVsb3BlKG9wdGlvbnMuZW52ZWxvcGUgPz8gW2Rlcml2ZWRdKTtcbiAgY29uc3Qgc3VyZmFjZUVkaXRzID0gc3VyZmFjZU1hdGVyaWFsID09PSBudWxsID8gMCA6IHRhcmdldHMubGVuZ3RoO1xuXG4gIGNvbnN0IHBsYW46IFByZXBhcmF0aW9uUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBydWxlczogcHJvcG9zYWwucnVsZXMsXG4gICAgdGFyZ2V0cyxcbiAgICBjbGVhckVudGl0eUlkcyxcbiAgICBzdXJmYWNlTWF0ZXJpYWwsXG4gICAgZW52ZWxvcGUsXG4gICAgZXhwZWN0ZWQ6IHtcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICAgIG9ic3RydWN0aW9uczogY2xlYXJFbnRpdHlJZHMubGVuZ3RoLFxuICAgICAgc3VyZmFjZUVkaXRzLFxuICAgICAgdG90YWxFZGl0czogc3RhdHMuY3V0Vm9sdW1lICsgc3RhdHMuZmlsbFZvbHVtZSArIHN1cmZhY2VFZGl0cyxcbiAgICB9LFxuICB9O1xuICBwbGFuLmlkID0gYHByZXA6JHtwbGFuRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCB2YWxpZGF0aW9uIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gYXV0aG9yaXphdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25MaW1pdHMge1xuICBtYXhDdXRWb2x1bWU6IG51bWJlcjtcbiAgbWF4RmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhWb3hlbEVkaXRzOiBudW1iZXI7XG4gIG1heEVudGl0eVJlbW92YWxzOiBudW1iZXI7XG4gIG1heFRhcmdldHM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfTElNSVRTOiBBdXRob3JpemF0aW9uTGltaXRzID0ge1xuICBtYXhDdXRWb2x1bWU6IDI1NixcbiAgbWF4RmlsbFZvbHVtZTogMjU2LFxuICBtYXhWb3hlbEVkaXRzOiAxMDI0LFxuICBtYXhFbnRpdHlSZW1vdmFsczogMTYsXG4gIG1heFRhcmdldHM6IDUxMixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ya0F1dGhvcml6YXRpb24ge1xuICBpZDogc3RyaW5nO1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGJhc2VSZXZpc2lvbjogbnVtYmVyO1xuICBsaW1pdHM6IEF1dGhvcml6YXRpb25MaW1pdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvbkRlY2lzaW9uIHtcbiAgb2s6IGJvb2xlYW47XG4gIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uIHwgbnVsbDtcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvblBvbGljeSB7XG4gIC8qKiBUaGUgb25seSByZWdpb25zIHRoaXMgZ292ZXJub3IgcGVybWl0cyBmb3IgdGhlIGZpcnN0IHNsaWNlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgbGltaXRzPzogUGFydGlhbDxBdXRob3JpemF0aW9uTGltaXRzPjtcbn1cblxuZnVuY3Rpb24gcmVnaW9uQ29udGFpbmVkKHJlZ2lvbjogVm94ZWxSZWdpb24sIHBvbGljeTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IGJvb2xlYW4ge1xuICByZXR1cm4gcG9saWN5LnNvbWUoKHApID0+IHJlZ2lvbi54MCA+PSBwLngwICYmIHJlZ2lvbi54MSA8PSBwLngxXG4gICAgJiYgcmVnaW9uLnowID49IHAuejAgJiYgcmVnaW9uLnoxIDw9IHAuejFcbiAgICAmJiByZWdpb24ueTAgPj0gcC55MCAmJiByZWdpb24ueTEgPD0gcC55MSk7XG59XG5cbi8qKlxuICogTG9jYWwgZ292ZXJub3Igc3R1Yi4gSXQgZW5mb3JjZXMgYSBmaXhlZCBlbnZlbG9wZSBhbmQgaGFyZCB2b2x1bWUgbGltaXRzLFxuICogYmluZHMgYSB0b2tlbiB0byB0aGUgZXhhY3QgcGxhbiBkaWdlc3QgYW5kIHdvcmxkIHJldmlzaW9uLCBhbmQgcmVmdXNlcyB0b1xuICogcHJldGVuZCBpdCBpcyBhbiBvbi1jaGFpbiBhdXRob3JpdHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBMb2NhbEF1dGhvcml6ZXIge1xuICByZWFkb25seSBhdXRob3JpdHkgPSBMT0NBTF9BVVRIT1JJVFk7XG4gIHJlYWRvbmx5IGVuZm9yY2VtZW50ID0gTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHJlYWRvbmx5IGxpbWl0czogQXV0aG9yaXphdGlvbkxpbWl0cztcblxuICBjb25zdHJ1Y3RvcihyZWFkb25seSBwb2xpY3k6IEF1dGhvcml6YXRpb25Qb2xpY3kpIHtcbiAgICB0aGlzLmxpbWl0cyA9IHsgLi4uREVGQVVMVF9MSU1JVFMsIC4uLihwb2xpY3kubGltaXRzID8/IHt9KSB9O1xuICB9XG5cbiAgYXV0aG9yaXplKHdvcmxkOiBXb3JsZCwgcGxhbjogUHJlcGFyYXRpb25QbGFuKTogQXV0aG9yaXphdGlvbkRlY2lzaW9uIHtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHBsYW4ucmVjdCk7XG5cbiAgICBpZiAocGxhbi50YXJnZXRzLmxlbmd0aCAhPT0gcmVjdENvbHVtbnMocmVjdCkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbiBoYXMgJHtwbGFuLnRhcmdldHMubGVuZ3RofSB0YXJnZXRzIGZvciAke3JlY3RDb2x1bW5zKHJlY3QpfSBjb2x1bW5zYCk7XG4gICAgfVxuICAgIGlmIChwbGFuLnRhcmdldHMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4VGFyZ2V0cykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4udGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4VGFyZ2V0c31gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQuY3V0Vm9sdW1lID4gdGhpcy5saW1pdHMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgICByZWFzb25zLnB1c2goYGN1dCAke3BsYW4uZXhwZWN0ZWQuY3V0Vm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4Q3V0Vm9sdW1lfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC5maWxsVm9sdW1lID4gdGhpcy5saW1pdHMubWF4RmlsbFZvbHVtZSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBmaWxsICR7cGxhbi5leHBlY3RlZC5maWxsVm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4RmlsbFZvbHVtZX1gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQudG90YWxFZGl0cyA+IHRoaXMubGltaXRzLm1heFZveGVsRWRpdHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbm5lZCBlZGl0cyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhWb3hlbEVkaXRzfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFscykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RofSByZW1vdmFscyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFsc31gKTtcbiAgICB9XG4gICAgaWYgKG5ldyBTZXQocGxhbi5jbGVhckVudGl0eUlkcykuc2l6ZSAhPT0gcGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGgpIHtcbiAgICAgIHJlYXNvbnMucHVzaCgnZHVwbGljYXRlIGVudGl0eSByZW1vdmFsIGlkcycpO1xuICAgIH1cblxuICAgIGlmIChwbGFuLmVudmVsb3BlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyB3b3JrIGVudmVsb3BlJyk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcmVnaW9uIG9mIHBsYW4uZW52ZWxvcGUpIHtcbiAgICAgIGlmICghcmVnaW9uQ29udGFpbmVkKHJlZ2lvbiwgdGhpcy5wb2xpY3kuZW52ZWxvcGUpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgZW52ZWxvcGUgJHtyZWdpb24ueDB9LCR7cmVnaW9uLnowfSwke3JlZ2lvbi55MH0uLiR7cmVnaW9uLngxfSwke3JlZ2lvbi56MX0sJHtyZWdpb24ueTF9IGlzIG91dHNpZGUgdGhlIGxvY2FsIHBvbGljeWApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSB7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgdC54LCB0LnksIHQueilcbiAgICAgICAgfHwgKHQueSA+IFlfTUlOICYmICFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHQueCwgdC55IC0gMSwgdC56KSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGB0YXJnZXQgJHt0Lnh9LCR7dC56fSwke3QueX0gaXMgbm90IGNvdmVyZWQgYnkgdGhlIHdvcmsgZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBFdmVyeSBvYnN0cnVjdGlvbiBjdXJyZW50bHkgb24gdGhlIGZvb3RwcmludCBtdXN0IGJlIGluIHRoZSBwbGFuLCBhbmRcbiAgICAvLyB0aGUgcGxhbiBtYXkgbm90IHJlbW92ZSBhbnl0aGluZyB0aGF0IGlzIG5vdCBhbiBvYnN0cnVjdGlvbiB0aGVyZS5cbiAgICBjb25zdCBjdXJyZW50ID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpLm1hcCgobykgPT4gby5lbnRpdHlJZCkuc29ydCgpO1xuICAgIGNvbnN0IHBsYW5uZWQgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICAgIGlmIChjdXJyZW50Lmxlbmd0aCAhPT0gcGxhbm5lZC5sZW5ndGggfHwgY3VycmVudC5zb21lKChpZCwgaSkgPT4gaWQgIT09IHBsYW5uZWRbaV0pKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW4gcmVtb3ZhbHMgWyR7cGxhbm5lZC5qb2luKCcsJyl9XSBkbyBub3QgbWF0Y2ggZm9vdHByaW50IG9ic3RydWN0aW9ucyBbJHtjdXJyZW50LmpvaW4oJywnKX1dYCk7XG4gICAgfVxuXG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBhdXRob3JpemF0aW9uOiBudWxsLCByZWFzb25zIH07XG5cbiAgICBjb25zdCB0b2tlbjogV29ya0F1dGhvcml6YXRpb24gPSB7XG4gICAgICBpZDogYGxvY2FsLXN0dWI6JHtwbGFuRGlnZXN0KHBsYW4pfWAsXG4gICAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICAgIHBsYW5EaWdlc3Q6IHBsYW5EaWdlc3QocGxhbiksXG4gICAgICBlbnZlbG9wZTogbm9ybWFsaXplRW52ZWxvcGUocGxhbi5lbnZlbG9wZSksXG4gICAgICBiYXNlUmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgICAgbGltaXRzOiB7IC4uLnRoaXMubGltaXRzIH0sXG4gICAgfTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgYXV0aG9yaXphdGlvbjogdG9rZW4sIHJlYXNvbnM6IFtdIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBleGVjdXRpb24gLS0tLS0tLS0tLVxuaW50ZXJmYWNlIFBlbmRpbmdFZGl0IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgYmVmb3JlOiBNYXRJZDtcbiAgYWZ0ZXI6IE1hdElkO1xuICAvKiogVHJ1ZSBmb3IgYSBtYXRlcmlhbC1vbmx5IHRvcC1zdXJmYWNlIGNoYW5nZS4gKi9cbiAgc3VyZmFjZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIGNodW5rOiBzdHJpbmc7XG4gIGNoYW5nZWQ6IG51bWJlcjtcbiAgYWRkZWQ6IG51bWJlcjtcbiAgcmVtb3ZlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENsZWFyZWRFbnRpdHkge1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgYW1vdW50OiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25MZWRnZXIge1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIGF1dGhvcml6YXRpb25JZDogc3RyaW5nO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbmV0U3BvaWw6IG51bWJlcjtcbiAgYm9ycm93ZWRGaWxsOiBudW1iZXI7XG4gIGN1dEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGZpbGxCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICB2b3hlbEVkaXRzOiBudW1iZXI7XG4gIHN1cmZhY2VFZGl0czogbnVtYmVyO1xuICBlbnRpdGllc0NsZWFyZWQ6IENsZWFyZWRFbnRpdHlbXTtcbiAgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBjaHVua0RlbHRhczogQ2h1bmtEZWx0YVtdO1xuICByZXZpc2lvbkJlZm9yZTogbnVtYmVyO1xuICByZXZpc2lvbkFmdGVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFByZXBhcmF0aW9uUGxhbjtcbiAgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb247XG4gIGxlZGdlcjogUHJlcGFyYXRpb25MZWRnZXI7XG59XG5cbmV4cG9ydCB0eXBlIFByZXBhcmF0aW9uT3V0Y29tZSA9IFByZXBhcmF0aW9uU3VjY2VzcyB8IFByZXBhcmF0aW9uRmFpbHVyZTtcblxuY29uc3QgTUFURVJJQUxfTkFNRVM6IFJlY29yZDxudW1iZXIsIHN0cmluZz4gPSB7XG4gIFtNQVQuR1JBU1NdOiAnZ3Jhc3MnLFxuICBbTUFULlNPSUxdOiAnc29pbCcsXG4gIFtNQVQuU0FORF06ICdzYW5kJyxcbiAgW01BVC5HUkFWRUxdOiAnZ3JhdmVsJyxcbiAgW01BVC5TVE9ORV06ICdzdG9uZScsXG4gIFtNQVQuT1JFXTogJ29yZScsXG4gIFtNQVQuV0FURVJdOiAnd2F0ZXInLFxuICBbTUFULkJFRFJPQ0tdOiAnYmVkcm9jaycsXG4gIFtNQVQuTU9TU106ICdtb3NzJyxcbn07XG5cbmZ1bmN0aW9uIG1hdGVyaWFsTmFtZShtOiBNYXRJZCk6IHN0cmluZyB7XG4gIHJldHVybiBNQVRFUklBTF9OQU1FU1ttXSA/PyBgbWF0XyR7bX1gO1xufVxuXG5mdW5jdGlvbiBmaWxsTWF0ZXJpYWwoeTogbnVtYmVyLCB0YXJnZXQ6IG51bWJlcik6IE1hdElkIHtcbiAgcmV0dXJuIHkgPT09IHRhcmdldCAtIDEgPyBNQVQuR1JBU1MgOiBNQVQuU09JTDtcbn1cblxuZnVuY3Rpb24gZmFpbChzdGFnZTogUHJlcGFyYXRpb25GYWlsdXJlWydzdGFnZSddLCBjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogUHJlcGFyYXRpb25GYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGFnZSwgY29kZSwgcmVhc29ucyB9O1xufVxuXG4vKipcbiAqIEFwcGx5IGFuIGF1dGhvcml6ZWQgcGxhbi4gTm8gdm94ZWwgaXMgd3JpdHRlbiB1bnRpbCBldmVyeSBlZGl0IGFuZCByZW1vdmFsXG4gKiBoYXMgYmVlbiBjaGVja2VkIGFnYWluc3QgdGhlIHRva2VuLCB0aGUgcGxhbiBlbnZlbG9wZSBhbmQgdGhlIGhhcmQgbGltaXRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXhlY3V0ZVByZXBhcmF0aW9uKFxuICB3b3JsZDogV29ybGQsIHBsYW46IFByZXBhcmF0aW9uUGxhbiwgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb24sXG4pOiBQcmVwYXJhdGlvbk91dGNvbWUge1xuICBpZiAoYXV0aG9yaXphdGlvbi5hdXRob3JpdHkgIT09IExPQ0FMX0FVVEhPUklUWVxuICAgIHx8IGF1dGhvcml6YXRpb24uZW5mb3JjZW1lbnQgIT09IExPQ0FMX0VORk9SQ0VNRU5UKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5zdXBwb3J0ZWRfYXV0aG9yaXR5JywgW1xuICAgICAgYGF1dGhvcml0eSAke2F1dGhvcml6YXRpb24uYXV0aG9yaXR5fS8ke2F1dGhvcml6YXRpb24uZW5mb3JjZW1lbnR9IGlzIG5vdCB0aGUgbG9jYWwgc3R1YmAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCAhPT0gcGxhbkRpZ2VzdChwbGFuKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2RpZ2VzdF9taXNtYXRjaCcsIFsnYXV0aG9yaXphdGlvbiBkb2VzIG5vdCBtYXRjaCB0aGlzIHBsYW4nXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24uYmFzZVJldmlzaW9uICE9PSB3b3JsZC5yZXZpc2lvbikge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3N0YWxlX2F1dGhvcml6YXRpb24nLCBbXG4gICAgICBgYXV0aG9yaXphdGlvbiB3YXMgaXNzdWVkIGF0IHJldmlzaW9uICR7YXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb259LCB3b3JsZCBpcyBhdCAke3dvcmxkLnJldmlzaW9ufWAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKHBsYW4uZW52ZWxvcGUuc29tZSgocikgPT4gIXJlZ2lvbkNvbnRhaW5lZChyLCBhdXRob3JpemF0aW9uLmVudmVsb3BlKSkpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdlbnZlbG9wZV9taXNtYXRjaCcsIFsncGxhbiBlbnZlbG9wZSBpcyB3aWRlciB0aGFuIHRoZSBhdXRob3JpemF0aW9uJ10pO1xuICB9XG5cbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocGxhbi5yZWN0KTtcbiAgY29uc3QgZWRpdHM6IFBlbmRpbmdFZGl0W10gPSBbXTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBpZiAodC55IDwgc3VyZmFjZSkge1xuICAgICAgZm9yIChsZXQgeSA9IHQueTsgeSA8IHN1cmZhY2U7IHkrKykge1xuICAgICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB5LCB0LnopO1xuICAgICAgICBpZiAoaXNTb2xpZChiZWZvcmUpKSBlZGl0cy5wdXNoKHsgeDogdC54LCB5LCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXI6IE1BVC5BSVIgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0LnkgPiBzdXJmYWNlKSB7XG4gICAgICBmb3IgKGxldCB5ID0gc3VyZmFjZTsgeSA8IHQueTsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHksIHQueik7XG4gICAgICAgIGlmICghaXNTb2xpZChiZWZvcmUpKSB7XG4gICAgICAgICAgY29uc3QgYWZ0ZXIgPSBwbGFuLnN1cmZhY2VNYXRlcmlhbCAhPT0gbnVsbCAmJiB5ID09PSB0LnkgLSAxXG4gICAgICAgICAgICA/IHBsYW4uc3VyZmFjZU1hdGVyaWFsXG4gICAgICAgICAgICA6IGZpbGxNYXRlcmlhbCh5LCB0LnkpO1xuICAgICAgICAgIGVkaXRzLnB1c2goeyB4OiB0LngsIHksIHo6IHQueiwgYmVmb3JlLCBhZnRlciB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyBNYXRlcmlhbC1vbmx5IHN1cmZhY2UgY2hhbmdlIGZvciBjdXQgb3IgYWxyZWFkeS1sZXZlbCBjb2x1bW5zLiBGaWxsXG4gICAgLy8gY29sdW1ucyBhbHJlYWR5IHJlY2VpdmUgdGhlIHN1cmZhY2UgbWF0ZXJpYWwgaW4gdGhlIGZpbGwgbG9vcCBhYm92ZS5cbiAgICBpZiAocGxhbi5zdXJmYWNlTWF0ZXJpYWwgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHRvcFkgPSB0LnkgLSAxO1xuICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgdG9wWSwgdC56KTtcbiAgICAgIGlmIChpc1NvbGlkKGJlZm9yZSkgJiYgYmVmb3JlICE9PSBwbGFuLnN1cmZhY2VNYXRlcmlhbCkge1xuICAgICAgICBlZGl0cy5wdXNoKHtcbiAgICAgICAgICB4OiB0LngsIHk6IHRvcFksIHo6IHQueiwgYmVmb3JlLCBhZnRlcjogcGxhbi5zdXJmYWNlTWF0ZXJpYWwsIHN1cmZhY2U6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGV2ZXJ5IGVkaXQgYmVmb3JlIG11dGF0aW5nIGFueXRoaW5nLlxuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGUgb2YgZWRpdHMpIHtcbiAgICBpZiAoZS54IDwgcmVjdC54MCB8fCBlLnggPiByZWN0LngxIHx8IGUueiA8IHJlY3QuejAgfHwgZS56ID4gcmVjdC56MSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBlZGl0ICR7ZS54fSwke2UueX0sJHtlLnp9IGlzIG91dHNpZGUgdGhlIGZvb3RwcmludGApO1xuICAgIH1cbiAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMoYXV0aG9yaXphdGlvbi5lbnZlbG9wZSwgZS54LCBlLnksIGUueikpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZWRpdCAke2UueH0sJHtlLnl9LCR7ZS56fSBpcyBvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlYCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGN1dFZvbHVtZSA9IGVkaXRzLmZpbHRlcigoZSkgPT4gZS5hZnRlciA9PT0gTUFULkFJUiAmJiBpc1NvbGlkKGUuYmVmb3JlKSkubGVuZ3RoO1xuICBjb25zdCBmaWxsVm9sdW1lID0gZWRpdHMuZmlsdGVyKChlKSA9PiBlLmFmdGVyICE9PSBNQVQuQUlSICYmICFpc1NvbGlkKGUuYmVmb3JlKSkubGVuZ3RoO1xuICBpZiAoY3V0Vm9sdW1lID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgJHtjdXRWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhDdXRWb2x1bWV9YCk7XG4gIH1cbiAgaWYgKGZpbGxWb2x1bWUgPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsICR7ZmlsbFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEZpbGxWb2x1bWV9YCk7XG4gIH1cbiAgaWYgKGVkaXRzLmxlbmd0aCA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heFZveGVsRWRpdHMpIHtcbiAgICByZWFzb25zLnB1c2goYCR7ZWRpdHMubGVuZ3RofSBlZGl0cyBleGNlZWQgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhWb3hlbEVkaXRzfWApO1xuICB9XG5cbiAgY29uc3QgY3VycmVudCA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KS5tYXAoKG8pID0+IG8uZW50aXR5SWQpLnNvcnQoKTtcbiAgY29uc3QgcGxhbm5lZCA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gIGlmIChjdXJyZW50Lmxlbmd0aCAhPT0gcGxhbm5lZC5sZW5ndGggfHwgY3VycmVudC5zb21lKChpZCwgaSkgPT4gaWQgIT09IHBsYW5uZWRbaV0pKSB7XG4gICAgcmVhc29ucy5wdXNoKCdmb290cHJpbnQgb2JzdHJ1Y3Rpb25zIGNoYW5nZWQgYWZ0ZXIgYXV0aG9yaXphdGlvbicpO1xuICB9XG4gIGlmIChwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEVudGl0eVJlbW92YWxzKSB7XG4gICAgcmVhc29ucy5wdXNoKGAke3BsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RofSByZW1vdmFscyBleGNlZWQgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFsc31gKTtcbiAgfVxuICBmb3IgKGNvbnN0IGlkIG9mIHBsYW4uY2xlYXJFbnRpdHlJZHMpIHtcbiAgICBpZiAoIXdvcmxkLmVudGl0aWVzLmhhcyhpZCkpIHJlYXNvbnMucHVzaChgZW50aXR5ICR7aWR9IG5vIGxvbmdlciBleGlzdHNgKTtcbiAgfVxuICBpZiAod29ybGQubGlmZSkge1xuICAgIGxldCByZWNvdmVyZWQgPSAwO1xuICAgIGZvciAoY29uc3QgaWQgb2YgcGxhbi5jbGVhckVudGl0eUlkcykge1xuICAgICAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmIChlbnRpdHk/LnJlc291cmNlICYmIGVudGl0eS5yZW1haW5pbmcgPiAwKSByZWNvdmVyZWQgKz0gZW50aXR5LnJlbWFpbmluZztcbiAgICB9XG4gICAgLy8gQ2hlY2sgYmVmb3JlIGFueSB2b3hlbCBvciBlbnRpdHkgY2hhbmdlcywgcHJlc2VydmluZyBsZWdhY3kgdW5ib3VuZGVkXG4gICAgLy8gY29uc3RydWN0aW9uIGJlaGF2aW9yIGFuZCBzY2hlbWEtMyBjYXJyaWVkLWNhcGFjaXR5IGNvbnNlcnZhdGlvbi5cbiAgICBpZiAoT2JqZWN0LnZhbHVlcyh3b3JsZC5pbnZlbnRvcnkpLnJlZHVjZSgoc3VtLCBhbW91bnQpID0+IHN1bSArIGFtb3VudCwgMCkgKyByZWNvdmVyZWQgPiAxMjApIHtcbiAgICAgIHJlYXNvbnMucHVzaCgncmVzb3VyY2VzIHJlY292ZXJlZCBkdXJpbmcgc2l0ZSBjbGVhcmluZyB3b3VsZCBleGNlZWQgY2FycmllZCBjYXBhY2l0eSAxMjAnKTtcbiAgICB9XG4gIH1cbiAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5hdXRob3JpemVkX2VkaXRzJywgcmVhc29ucyk7XG5cbiAgY29uc3QgaW52ZW50b3J5QmVmb3JlID0gaW52ZW50b3J5U25hcHNob3Qod29ybGQpO1xuICBjb25zdCByZXZpc2lvbkJlZm9yZSA9IHdvcmxkLnJldmlzaW9uO1xuICBjb25zdCBjaHVua0RlbHRhcyA9IG5ldyBNYXA8c3RyaW5nLCBDaHVua0RlbHRhPigpO1xuICBjb25zdCBjdXRCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGNvbnN0IGZpbGxCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGxldCBhcHBsaWVkID0gMDtcbiAgbGV0IHN1cmZhY2VFZGl0cyA9IDA7XG5cbiAgZm9yIChjb25zdCBlIG9mIGVkaXRzKSB7XG4gICAgaWYgKCFzZXRWb3hlbCh3b3JsZCwgZS54LCBlLnksIGUueiwgZS5hZnRlcikpIGNvbnRpbnVlO1xuICAgIGFwcGxpZWQrKztcbiAgICBpZiAoZS5zdXJmYWNlKSBzdXJmYWNlRWRpdHMrKztcbiAgICBjb25zdCBrZXkgPSBjaHVua0tleSh3b3JsZFRvQ2h1bmtYKGUueCksIHdvcmxkVG9DaHVua1ooZS56KSk7XG4gICAgbGV0IGRlbHRhID0gY2h1bmtEZWx0YXMuZ2V0KGtleSk7XG4gICAgaWYgKCFkZWx0YSkge1xuICAgICAgZGVsdGEgPSB7IGNodW5rOiBrZXksIGNoYW5nZWQ6IDAsIGFkZGVkOiAwLCByZW1vdmVkOiAwIH07XG4gICAgICBjaHVua0RlbHRhcy5zZXQoa2V5LCBkZWx0YSk7XG4gICAgfVxuICAgIGRlbHRhLmNoYW5nZWQrKztcbiAgICBjb25zdCB3YXNTb2xpZCA9IGlzU29saWQoZS5iZWZvcmUpO1xuICAgIGNvbnN0IGlzTm93U29saWQgPSBpc1NvbGlkKGUuYWZ0ZXIpO1xuICAgIGlmICghd2FzU29saWQgJiYgaXNOb3dTb2xpZCkgZGVsdGEuYWRkZWQrKztcbiAgICBpZiAod2FzU29saWQgJiYgIWlzTm93U29saWQpIGRlbHRhLnJlbW92ZWQrKztcbiAgICBjb25zdCBuYW1lID0gbWF0ZXJpYWxOYW1lKGUuYmVmb3JlKTtcbiAgICBpZiAod2FzU29saWQgJiYgIWlzTm93U29saWQpIGN1dEJ5TWF0ZXJpYWxbbmFtZV0gPSAoY3V0QnlNYXRlcmlhbFtuYW1lXSA/PyAwKSArIDE7XG4gICAgaWYgKCF3YXNTb2xpZCAmJiBpc05vd1NvbGlkKSBmaWxsQnlNYXRlcmlhbFttYXRlcmlhbE5hbWUoZS5hZnRlcildID0gKGZpbGxCeU1hdGVyaWFsW21hdGVyaWFsTmFtZShlLmFmdGVyKV0gPz8gMCkgKyAxO1xuICB9XG5cbiAgY29uc3QgZW50aXRpZXNDbGVhcmVkOiBDbGVhcmVkRW50aXR5W10gPSBbXTtcbiAgY29uc3QgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0ge307XG4gIGZvciAoY29uc3QgaWQgb2YgWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKSkge1xuICAgIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgIGlmICghZSkgY29udGludWU7XG4gICAgY29uc3QgYW1vdW50ID0gZS5yZXNvdXJjZSAmJiBlLnJlbWFpbmluZyA+IDAgPyBlLnJlbWFpbmluZyA6IDA7XG4gICAgaWYgKGUucmVzb3VyY2UgJiYgYW1vdW50ID4gMCkge1xuICAgICAgd29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID0gKHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgICAgIHJlc291cmNlc0dhaW5lZFtlLnJlc291cmNlXSA9IChyZXNvdXJjZXNHYWluZWRbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gICAgfVxuICAgIHJlbW92ZUVudGl0eSh3b3JsZCwgaWQpO1xuICAgIGVudGl0aWVzQ2xlYXJlZC5wdXNoKHtcbiAgICAgIGVudGl0eUlkOiBpZCwga2luZDogZS5raW5kLCByZXNvdXJjZTogZS5yZXNvdXJjZSwgYW1vdW50LCB4OiBlLngsIHk6IGUueSwgejogZS56LFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgY3V0ID0gYXBwbGllZCA+IDAgPyBPYmplY3QudmFsdWVzKGN1dEJ5TWF0ZXJpYWwpLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIDogMDtcbiAgY29uc3QgZmlsbCA9IGFwcGxpZWQgPiAwID8gT2JqZWN0LnZhbHVlcyhmaWxsQnlNYXRlcmlhbCkucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgOiAwO1xuICBjb25zdCBsZWRnZXI6IFByZXBhcmF0aW9uTGVkZ2VyID0ge1xuICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICBhdXRob3JpemF0aW9uSWQ6IGF1dGhvcml6YXRpb24uaWQsXG4gICAgcGxhbkRpZ2VzdDogYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0LFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHBsYW4uZmxvb3JZLFxuICAgIGN1dFZvbHVtZTogY3V0LFxuICAgIGZpbGxWb2x1bWU6IGZpbGwsXG4gICAgbmV0U3BvaWw6IGN1dCAtIGZpbGwsXG4gICAgYm9ycm93ZWRGaWxsOiBNYXRoLm1heCgwLCBmaWxsIC0gY3V0KSxcbiAgICBjdXRCeU1hdGVyaWFsLFxuICAgIGZpbGxCeU1hdGVyaWFsLFxuICAgIHZveGVsRWRpdHM6IGFwcGxpZWQsXG4gICAgc3VyZmFjZUVkaXRzLFxuICAgIGVudGl0aWVzQ2xlYXJlZCxcbiAgICByZXNvdXJjZXNHYWluZWQsXG4gICAgaW52ZW50b3J5QmVmb3JlLFxuICAgIGludmVudG9yeUFmdGVyOiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCksXG4gICAgY2h1bmtEZWx0YXM6IFsuLi5jaHVua0RlbHRhcy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5jaHVuay5sb2NhbGVDb21wYXJlKGIuY2h1bmspKSxcbiAgICByZXZpc2lvbkJlZm9yZSxcbiAgICByZXZpc2lvbkFmdGVyOiB3b3JsZC5yZXZpc2lvbixcbiAgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIGF1dGhvcml6YXRpb24sIGxlZGdlciB9O1xufVxuXG4vKipcbiAqIFRoZSBzaGFyZWQgcGxheWVyL0FJIGVudHJ5IHBvaW50LiBUaGVyZSBpcyBubyBvdGhlciBjb25zdHJ1Y3Rpb24gcGF0aC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVTaXRlKFxuICB3b3JsZDogV29ybGQsXG4gIGF1dGhvcml6ZXI6IExvY2FsQXV0aG9yaXplcixcbiAgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCxcbiAgb3B0aW9uczogUHJlcGFyYXRpb25PcHRpb25zID0ge30sXG4pOiBQcmVwYXJhdGlvbk91dGNvbWUge1xuICBjb25zdCBwbGFubmVkID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBwcm9wb3NhbCwgb3B0aW9ucyk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGNvbnN0IGRlY2lzaW9uID0gYXV0aG9yaXplci5hdXRob3JpemUod29ybGQsIHBsYW5uZWQucGxhbik7XG4gIGlmICghZGVjaXNpb24ub2sgfHwgIWRlY2lzaW9uLmF1dGhvcml6YXRpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnYXV0aG9yaXplJywgJ25vdF9hdXRob3JpemVkJywgZGVjaXNpb24ucmVhc29ucyk7XG4gIH1cbiAgcmV0dXJuIGV4ZWN1dGVQcmVwYXJhdGlvbih3b3JsZCwgcGxhbm5lZC5wbGFuLCBkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcbn1cbiIsICIvLyBNMDAyIHN0YWdlIDQ6IGF1dGhvcml0YXRpdmUgaG91c2UsIHBhdGggYW5kIHRlcnJhY2Ugc3RydWN0dXJlcy5cbi8vXG4vLyBTdHJ1Y3R1cmVzIGFyZSBzaW11bGF0aW9uIHJlY29yZHMsIG5vdCByZW5kZXJlci1vbmx5IG1lc2hlcy4gQSBzdHJ1Y3R1cmUgaXNcbi8vIHBsYW5uZWQgZnJvbSB0aGUgcHJlcGFyZWQgdGVycmFpbiwgYXV0aG9yaXplZCBhZ2FpbnN0IHRoZSBzYW1lIGxvY2FsIHBvbGljeVxuLy8gZW52ZWxvcGUgYXMgdGVycmFpbiBwcmVwYXJhdGlvbiwgcGFpZCBmb3IgZnJvbSBpbnZlbnRvcnksIGFuZCB0aGVuIHN0b3JlZCBpblxuLy8gV29ybGQuc3RydWN0dXJlcy4gVGhlIHJlbmRlcmVyIHJlYWRzIHRob3NlIHJlY29yZHM7IGl0IG5ldmVyIGludmVudHMgYVxuLy8gYnVpbGRpbmcgdGhhdCB0aGUgc2ltdWxhdGlvbiBkb2VzIG5vdCBvd24uXG5pbXBvcnQge1xuICBXb3JsZCwgUmVzb3VyY2VUeXBlLCBNQVQsIHN1cmZhY2VBdCwgZ2V0Vm94ZWwsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIG5vcm1hbGl6ZVJlY3QsIGV4cGFuZFJlY3QsXG4gIGVudmVsb3BlQ29udGFpbnMsIG9ic3RydWN0aW9uc0luLFxufSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgQXV0aG9yaXphdGlvblBvbGljeSwgTE9DQUxfQVVUSE9SSVRZLCBMT0NBTF9FTkZPUkNFTUVOVCxcbn0gZnJvbSAnLi9wcmVwYXJhdGlvbic7XG5pbXBvcnQgeyBGQVJNX1JVTEVTIH0gZnJvbSAnLi9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHsgaW52ZW50b3J5U25hcHNob3QgfSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZUtpbmQgPSAnaG91c2UnIHwgJ3BhdGgnIHwgJ3RlcnJhY2UnO1xuLyoqIE0wMDIgZGVzaWduIDEgaXMgaW1tdXRhYmxlIHJlcGxheSBjb250ZW50OyBkZXNpZ24gMiBpcyB0aGUgZm91bmRlciBjYW5kaWRhdGUuICovXG5leHBvcnQgY29uc3QgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiA9IDIgYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uID0gdHlwZW9mIEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG5cbmV4cG9ydCB0eXBlIE1vZHVsZUtpbmQgPVxuICB8ICdmbG9vcidcbiAgfCAnd2FsbCdcbiAgfCAncG9zdCdcbiAgfCAnbGludGVsJ1xuICB8ICdyb29mJ1xuICB8ICdwYXJhcGV0J1xuICB8ICd3aW5kb3cnXG4gIHwgJ2Rvb3InXG4gIHwgJ3RocmVzaG9sZCdcbiAgfCAncGF0aCdcbiAgfCAnY3VyYidcbiAgfCAnc29pbF9iZWQnXG4gIHwgJ3JldGFpbmluZ193YWxsJ1xuICB8ICdjcm9wX3Jvdyc7XG5cbmV4cG9ydCB0eXBlIE1vZHVsZVRvbmUgPVxuICB8ICdzdG9uZSdcbiAgfCAnc3RvbmVfYidcbiAgfCAnb2NocmUnXG4gIHwgJ3RpbWJlcidcbiAgfCAnYWNjZW50J1xuICB8ICdzb2lsJ1xuICB8ICdjcm9wJ1xuICB8ICdncmF2ZWwnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZU1vZHVsZSB7XG4gIGtpbmQ6IE1vZHVsZUtpbmQ7XG4gIC8qKiBDZW50cmUgaW4gd29ybGQgeC96LCBib3R0b20gaW4gd29ybGQgeS4gKi9cbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgdzogbnVtYmVyO1xuICBoOiBudW1iZXI7XG4gIGQ6IG51bWJlcjtcbiAgcm90PzogbnVtYmVyO1xuICB0b25lPzogTW9kdWxlVG9uZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgLyoqIE9yaWdpbjogY2VudHJlIG9mIHRoZSBwcmVwYXJlZCBmb290cHJpbnQgYXQgZmxvb3IgaGVpZ2h0LiAqL1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW107XG4gIGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGJ1aWx0UmV2aXNpb246IG51bWJlcjtcbiAgLyoqIEFic2VudCBtZWFucyBsZWdhY3kgTTAwMiBkZXNpZ24gMTsgbmV2ZXIgaW5mZXIgaXQgZnJvbSB0aGUgcmVuZGVyZXIuICovXG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uO1xuICBwcm92aXNpb25hbDogdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWNlQmFuZCB7XG4gIHowOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVQcm9wb3NhbCB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgLyoqIFJlcXVpcmVkIGZvciBob3VzZXM6IHZveGVsIGNvbHVtbiBvZiB0aGUgZG9vciBvbiB0aGUgZWFzdCB3YWxsLiAqL1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICAvKiogT3B0aW9uYWwgcGF0aCBtZXRhZGF0YTsgdGhlIHBhdGggaXMgbGFpZCBhbG9uZyB0aGUgcmVjdCBjZW50cmVsaW5lLiAqL1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgdGVycmFjZXM/OiBudW1iZXI7XG4gIC8qKiBEZWxpYmVyYXRlIGNvbnRlbnQgc2VsZWN0aW9uIGNhcnJpZWQgYnkgc2NoZW1hLTIgY29tbWFuZHMuICovXG4gIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uO1xufVxuXG4vKipcbiAqIFNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIHN0cnVjdHVyZSBjb3N0cy4gVGhlIHBsYW5uZXJzIGFuZCB0aGUgYnVpbGQgVUlcbiAqIGJvdGggcmVhZCB0aGVzZTsgYSBidWlsZGluZyBjYW5ub3QgYWR2ZXJ0aXNlIG9uZSBwcmljZSBhbmQgY2hhcmdlIGFub3RoZXIuXG4gKi9cbmV4cG9ydCBjb25zdCBIT1VTRV9DT1NUOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0geyB3b29kOiAxMCwgc3RvbmU6IDE4IH07XG5leHBvcnQgY29uc3QgVEVSUkFDRV9DT1NUOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+ID0geyB3b29kOiA2LCBzdG9uZTogMTIgfTtcblxuLyoqIEEgcGF0aCBwYXlzIG9uZSBzdG9uZSBwZXIgbWV0cmUgb2YgY29ycmlkb3Igd2lkdGguICovXG5leHBvcnQgZnVuY3Rpb24gcGF0aENvc3Qod2lkdGg6IG51bWJlcik6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4ge1xuICByZXR1cm4geyBzdG9uZTogd2lkdGggfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVQbGFuIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBvcmlnaW46IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICByb3Q6IG51bWJlcjtcbiAgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW107XG4gIGNvc3Q6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICAvKiogRXhwZWN0ZWQgcHJlcGFyZWQgc3VyZmFjZSwgY2hlY2tlZCBhZ2FpbiBhdCBleGVjdXRpb24gdGltZS4gKi9cbiAgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdO1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbiAgdGVycmFjZXM/OiBUZXJyYWNlQmFuZFtdO1xufVxuXG4vLyAtLS0tLS0tLS0tIHN0YWJsZSBkaWdlc3QgLS0tLS0tLS0tLVxuZnVuY3Rpb24gZGlnZXN0KGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzU7XG4gIGxldCBiID0gMHg5ZTM3NzliOTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbnB1dC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGMgPSBpbnB1dC5jaGFyQ29kZUF0KGkpO1xuICAgIGEgPSBNYXRoLmltdWwoYSBeIGMsIDB4MDEwMDAxOTMpO1xuICAgIGIgPSBNYXRoLmltdWwoYiBeIChjICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIGIgXj0gYiA+Pj4gMTM7XG4gIH1cbiAgcmV0dXJuIChhID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICsgKGIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RydWN0dXJlRGlnZXN0KHBsYW46IFN0cnVjdHVyZVBsYW4pOiBzdHJpbmcge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXG4gICAgJ20wMDI6c3RydWN0dXJlLXBsYW46djEnLFxuICAgIHBsYW4ua2luZCxcbiAgICBwbGFuLnNpdGVJZCxcbiAgICBgJHtwbGFuLnJlY3QueDB9LCR7cGxhbi5yZWN0LnowfSwke3BsYW4ucmVjdC54MX0sJHtwbGFuLnJlY3QuejF9YCxcbiAgICBTdHJpbmcocGxhbi5mbG9vclkpLFxuICAgIGAke3BsYW4ub3JpZ2luLnh9LCR7cGxhbi5vcmlnaW4ueX0sJHtwbGFuLm9yaWdpbi56fWAsXG4gICAgU3RyaW5nKHBsYW4ucm90KSxcbiAgICAuLi4ocGxhbi5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OID8gWydkZXNpZ246MiddIDogW10pLFxuICAgIGBtOiR7cGxhbi5tb2R1bGVzLmxlbmd0aH1gLFxuICBdO1xuICBmb3IgKGNvbnN0IG0gb2YgcGxhbi5tb2R1bGVzKSB7XG4gICAgbGluZXMucHVzaChgbToke20ua2luZH0sJHttLnh9LCR7bS55fSwke20uen0sJHttLnd9LCR7bS5ofSwke20uZH0sJHttLnJvdCA/PyAwfSwke20udG9uZSA/PyAnJ31gKTtcbiAgfVxuICBjb25zdCBjb3N0S2V5cyA9IE9iamVjdC5rZXlzKHBsYW4uY29zdCkuc29ydCgpO1xuICBsaW5lcy5wdXNoKGBjb3N0OiR7Y29zdEtleXMubGVuZ3RofWApO1xuICBmb3IgKGNvbnN0IGtleSBvZiBjb3N0S2V5cykgbGluZXMucHVzaChgY29zdDoke2tleX0sJHtwbGFuLmNvc3Rba2V5IGFzIFJlc291cmNlVHlwZV0gPz8gMH1gKTtcbiAgZm9yIChjb25zdCBzIG9mIHBsYW4uc3VyZmFjZSkgbGluZXMucHVzaChgczoke3MueH0sJHtzLnp9LCR7cy55fWApO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50ZXJyYWNlcyA/PyBbXSkgbGluZXMucHVzaChgdDoke3QuejB9LCR7dC56MX0sJHt0Lnl9YCk7XG4gIHJldHVybiBkaWdlc3QobGluZXMuam9pbignXFxuJykpO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBsYW5uaW5nIGhlbHBlcnMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVGYWlsdXJlIHtcbiAgb2s6IGZhbHNlO1xuICBzdGFnZTogJ3BsYW4nIHwgJ2F1dGhvcml6ZScgfCAnZXhlY3V0ZSc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUGxhblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogU3RydWN0dXJlUGxhbjtcbn1cblxuZXhwb3J0IHR5cGUgU3RydWN0dXJlUGxhblJlc3VsdCA9IFN0cnVjdHVyZVBsYW5TdWNjZXNzIHwgU3RydWN0dXJlRmFpbHVyZTtcblxuZnVuY3Rpb24gZmFpbChzdGFnZTogU3RydWN0dXJlRmFpbHVyZVsnc3RhZ2UnXSwgY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IFN0cnVjdHVyZUZhaWx1cmUge1xuICByZXR1cm4geyBvazogZmFsc2UsIHN0YWdlLCBjb2RlLCByZWFzb25zIH07XG59XG5cbmZ1bmN0aW9uIHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkOiBXb3JsZCwgc2FtcGxlczogcmVhZG9ubHkgU3VyZmFjZVNhbXBsZVtdKSB7XG4gIGNvbnN0IG91dDogQXJyYXk8eyB4OiBudW1iZXI7IHo6IG51bWJlcjsgZXhwZWN0ZWQ6IG51bWJlcjsgYWN0dWFsOiBudW1iZXIgfT4gPSBbXTtcbiAgZm9yIChjb25zdCBzIG9mIHNhbXBsZXMpIHtcbiAgICBjb25zdCBhY3R1YWwgPSBzdXJmYWNlQXQod29ybGQsIHMueCwgcy56KTtcbiAgICBpZiAoYWN0dWFsICE9PSBzLnkpIG91dC5wdXNoKHsgeDogcy54LCB6OiBzLnosIGV4cGVjdGVkOiBzLnksIGFjdHVhbCB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBmb290cHJpbnRTdXJmYWNlKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCwgeTogbnVtYmVyKTogU3VyZmFjZVNhbXBsZVtdIHtcbiAgY29uc3Qgb3V0OiBTdXJmYWNlU2FtcGxlW10gPSBbXTtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSBvdXQucHVzaCh7IHgsIHosIHkgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gZm9vdHByaW50RW52ZWxvcGUocmVjdDogUmVjdCwgeTA6IG51bWJlciwgeTE6IG51bWJlciwgbWFyZ2luID0gMSk6IFZveGVsUmVnaW9uW10ge1xuICBjb25zdCByID0gZXhwYW5kUmVjdChyZWN0LCBtYXJnaW4pO1xuICByZXR1cm4gW3sgLi4uciwgeTAsIHkxIH1dO1xufVxuXG5mdW5jdGlvbiBtb2R1bGVCb3VuZHMobTogU3RydWN0dXJlTW9kdWxlKTogeyB4MDogbnVtYmVyOyB4MTogbnVtYmVyOyB5MDogbnVtYmVyOyB5MTogbnVtYmVyOyB6MDogbnVtYmVyOyB6MTogbnVtYmVyIH0ge1xuICBjb25zdCByID0gTWF0aC5oeXBvdChtLncsIG0uZCkgLyAyO1xuICBjb25zdCBoYWxmVyA9IChtLnJvdCA/PyAwKSA9PT0gMCA/IG0udyAvIDIgOiByO1xuICBjb25zdCBoYWxmRCA9IChtLnJvdCA/PyAwKSA9PT0gMCA/IG0uZCAvIDIgOiByO1xuICByZXR1cm4ge1xuICAgIHgwOiBtLnggLSBoYWxmVywgeDE6IG0ueCArIGhhbGZXLFxuICAgIHkwOiBtLnksIHkxOiBtLnkgKyBtLmgsXG4gICAgejA6IG0ueiAtIGhhbGZELCB6MTogbS56ICsgaGFsZkQsXG4gIH07XG59XG5cbmZ1bmN0aW9uIG1vZHVsZUluc2lkZUVudmVsb3BlKG06IFN0cnVjdHVyZU1vZHVsZSwgZW52ZWxvcGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBib29sZWFuIHtcbiAgY29uc3QgYiA9IG1vZHVsZUJvdW5kcyhtKTtcbiAgcmV0dXJuIGVudmVsb3BlLnNvbWUoKGUpID0+IGIueDAgPj0gZS54MCAtIDFlLTYgJiYgYi54MSA8PSBlLngxICsgMSArIDFlLTZcbiAgICAmJiBiLnkwID49IGUueTAgLSAxZS02ICYmIGIueTEgPD0gZS55MSArIDEgKyAxZS02XG4gICAgJiYgYi56MCA+PSBlLnowIC0gMWUtNiAmJiBiLnoxIDw9IGUuejEgKyAxICsgMWUtNik7XG59XG5cbmZ1bmN0aW9uIGNvc3RUb3RhbChjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+KTogbnVtYmVyIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXMoY29zdCkucmVkdWNlKChhLCBiKSA9PiBhICsgKGIgPz8gMCksIDApO1xufVxuXG5mdW5jdGlvbiBtZWRpYW4odmFsdWVzOiBudW1iZXJbXSk6IG51bWJlciB7XG4gIGNvbnN0IHNvcnRlZCA9IFsuLi52YWx1ZXNdLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbiAgcmV0dXJuIHNvcnRlZFtNYXRoLmZsb29yKHNvcnRlZC5sZW5ndGggLyAyKV07XG59XG5cbi8vIC0tLS0tLS0tLS0gaG91c2UgLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhbkhvdXNlKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGlmICh3aWR0aCAhPT0gOCB8fCBkZXB0aCAhPT0gNikge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgaG91c2UgbmVlZHMgOCB4IDYgbSwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuICBpZiAoIXByb3Bvc2FsLmRvb3IpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdtaXNzaW5nX2Rvb3InLCBbJ2hvdXNlIHBsYW4gbmVlZHMgYSBkb29yIGNvbHVtbiddKTtcbiAgfVxuICBpZiAocHJvcG9zYWwuZG9vci56IDwgcmVjdC56MCB8fCBwcm9wb3NhbC5kb29yLnogPiByZWN0LnoxKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnZG9vcl9vdXRzaWRlJywgW2Bkb29yIHogJHtwcm9wb3NhbC5kb29yLnp9IGlzIG91dHNpZGUgJHtyZWN0LnowfS4uJHtyZWN0LnoxfWBdKTtcbiAgfVxuXG4gIGNvbnN0IHN1cmZhY2UgPSBmb290cHJpbnRTdXJmYWNlKHdvcmxkLCByZWN0LCBwcm9wb3NhbC5mbG9vclkpO1xuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG5cbiAgY29uc3QgZmxvb3JZID0gcHJvcG9zYWwuZmxvb3JZO1xuICBjb25zdCB4MCA9IHJlY3QueDAsIHgxID0gcmVjdC54MSArIDE7XG4gIGNvbnN0IHowID0gcmVjdC56MCwgejEgPSByZWN0LnoxICsgMTtcbiAgY29uc3QgY3ggPSAoeDAgKyB4MSkgLyAyO1xuICBjb25zdCBjeiA9ICh6MCArIHoxKSAvIDI7XG4gIGNvbnN0IGRvb3JaID0gcHJvcG9zYWwuZG9vci56ICsgMC41O1xuICBjb25zdCBkb29ySGFsZiA9IDAuNjtcbiAgY29uc3Qgd2FsbEggPSAzLjA7XG4gIGNvbnN0IHdhbGxUID0gMC41O1xuICBjb25zdCBkb29ySCA9IDIuMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcblxuICAvLyBGbG9vciBzbGFiIGFuZCByb29mIHBsYXRlLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnZmxvb3InLCB4OiBjeCwgeTogZmxvb3JZLCB6OiBjeiwgdzogOC4wLCBoOiAwLjMsIGQ6IDYuMCwgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncm9vZicsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCwgejogY3osIHc6IDguNCwgaDogMC4zLCBkOiA2LjQsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gTm9ydGggYW5kIHNvdXRoIHdhbGxzLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnd2FsbCcsIHg6IGN4LCB5OiBmbG9vclksIHo6IHowICsgd2FsbFQgLyAyLCB3OiA4LjAsIGg6IHdhbGxILCBkOiB3YWxsVCwgdG9uZTogJ3N0b25lJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiBjeCwgeTogZmxvb3JZLCB6OiB6MSAtIHdhbGxUIC8gMiwgdzogOC4wLCBoOiB3YWxsSCwgZDogd2FsbFQsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gV2VzdCB3YWxsLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAnd2FsbCcsIHg6IHgwICsgd2FsbFQgLyAyLCB5OiBmbG9vclksIHo6IGN6LCB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IDYuMCwgdG9uZTogJ3N0b25lJyB9KTtcblxuICAvLyBFYXN0IHdhbGwgd2l0aCBhIHJlYWwgZG9vcndheSBnYXAuXG4gIGNvbnN0IGVhc3RYID0geDEgLSB3YWxsVCAvIDI7XG4gIGNvbnN0IGdhcDAgPSBkb29yWiAtIGRvb3JIYWxmO1xuICBjb25zdCBnYXAxID0gZG9vclogKyBkb29ySGFsZjtcbiAgY29uc3QgbGVmdExlbiA9IGdhcDAgLSB6MDtcbiAgY29uc3QgcmlnaHRMZW4gPSB6MSAtIGdhcDE7XG4gIGlmIChsZWZ0TGVuID4gMC4wNSkge1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnd2FsbCcsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IHowICsgbGVmdExlbiAvIDIsXG4gICAgICB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IGxlZnRMZW4sIHRvbmU6ICdzdG9uZScsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHJpZ2h0TGVuID4gMC4wNSkge1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAnd2FsbCcsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDEgKyByaWdodExlbiAvIDIsXG4gICAgICB3OiB3YWxsVCwgaDogd2FsbEgsIGQ6IHJpZ2h0TGVuLCB0b25lOiAnc3RvbmUnLFxuICAgIH0pO1xuICB9XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2xpbnRlbCcsIHg6IGVhc3RYLCB5OiBmbG9vclkgKyBkb29ySCwgejogZG9vclosXG4gICAgdzogd2FsbFQsIGg6IHdhbGxIIC0gZG9vckgsIGQ6IGRvb3JIYWxmICogMiwgdG9uZTogJ3N0b25lX2InLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAnZG9vcicsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDAsXG4gICAgdzogMC4xOCwgaDogZG9vckgsIGQ6IDAuMTYsIHRvbmU6ICd0aW1iZXInLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAnZG9vcicsIHg6IGVhc3RYLCB5OiBmbG9vclksIHo6IGdhcDEsXG4gICAgdzogMC4xOCwgaDogZG9vckgsIGQ6IDAuMTYsIHRvbmU6ICd0aW1iZXInLFxuICB9KTtcbiAgbW9kdWxlcy5wdXNoKHtcbiAgICBraW5kOiAndGhyZXNob2xkJywgeDogeDEgKyAwLjM1LCB5OiBmbG9vclksIHo6IGRvb3JaLFxuICAgIHc6IDAuOSwgaDogMC4xNiwgZDogMS4zLCB0b25lOiAnb2NocmUnLFxuICB9KTtcblxuICAvLyBUd28gd2luZG93cyBvbiB0aGUgc291dGggd2FsbCwgc2xpZ2h0bHkgcHJvdWQgb2YgdGhlIG91dGVyIGZhY2UuXG4gIGZvciAoY29uc3Qgd3ggb2YgW2N4IC0gMi4yLCBjeCArIDIuMl0pIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dpbmRvdycsIHg6IHd4LCB5OiBmbG9vclkgKyAxLjQ1LCB6OiB6MSAtIDAuMDIsXG4gICAgICB3OiAxLjAsIGg6IDEuMCwgZDogMC4wOCwgdG9uZTogJ2FjY2VudCcsXG4gICAgfSk7XG4gIH1cblxuICAvLyBQYXJhcGV0IGFyb3VuZCB0aGUgZmxhdCBOb3hlbCByb29mLlxuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3ogLSAzLjA1LCB3OiA4LjQsIGg6IDAuNCwgZDogMC4zLCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3gsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiArIDMuMDUsIHc6IDguNCwgaDogMC40LCBkOiAwLjMsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCAtIDQuMDUsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiwgdzogMC4zLCBoOiAwLjQsIGQ6IDYuNCwgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4ICsgNC4wNSwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6LCB3OiAwLjMsIGg6IDAuNCwgZDogNi40LCB0b25lOiAnc3RvbmVfYicgfSk7XG5cbiAgY29uc3QgcGxhbjogU3RydWN0dXJlUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAga2luZDogJ2hvdXNlJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogY3gsIHk6IGZsb29yWSwgejogY3ogfSxcbiAgICByb3Q6IDAsXG4gICAgbW9kdWxlcyxcbiAgICBjb3N0OiB7IC4uLkhPVVNFX0NPU1QgfSxcbiAgICBlbnZlbG9wZTogZm9vdHByaW50RW52ZWxvcGUocmVjdCwgZmxvb3JZLCBmbG9vclkgKyA0LCAyKSxcbiAgICBzdXJmYWNlLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHBhdGggLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhblBhdGgod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHdpZHRoID0gcmVjdC54MSAtIHJlY3QueDAgKyAxO1xuICBjb25zdCBkZXB0aCA9IHJlY3QuejEgLSByZWN0LnowICsgMTtcbiAgaWYgKGRlcHRoICE9PSAzIHx8IHdpZHRoIDwgMykge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgcGF0aCBuZWVkcyBhIDMgbSB3aWRlIGNvcnJpZG9yLCBnb3QgJHt3aWR0aH0geCAke2RlcHRofSBtYF0pO1xuICB9XG5cbiAgY29uc3QgY2VudGVyWiA9IHJlY3QuejAgKyAxO1xuICBjb25zdCBzdXJmYWNlOiBTdXJmYWNlU2FtcGxlW10gPSBbXTtcbiAgY29uc3QgaGVpZ2h0czogbnVtYmVyW10gPSBbXTtcbiAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgY2VudGVyWik7XG4gICAgaGVpZ2h0cy5wdXNoKHkpO1xuICAgIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykgc3VyZmFjZS5wdXNoKHsgeCwgeiwgeSB9KTtcbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgaGVpZ2h0cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHN0ZXAgPSBoZWlnaHRzW2ldIC0gaGVpZ2h0c1tpIC0gMV07XG4gICAgaWYgKE1hdGguYWJzKHN0ZXApID4gMSkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9zdGVwJywgW2BzdGVwICR7c3RlcH0gbSBhdCB4PSR7cmVjdC54MCArIGl9YF0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IHMgb2Ygc3VyZmFjZSkge1xuICAgIGNvbnN0IHRvcCA9IGdldFZveGVsKHdvcmxkLCBzLngsIHMueSAtIDEsIHMueik7XG4gICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX3dldCcsIFtgY29sdW1uICR7cy54fSwke3Muen0gaXMgd2V0YF0pO1xuICAgIH1cbiAgICBpZiAodG9wICE9PSBNQVQuR1JBVkVMKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICdwYXRoX3N1cmZhY2UnLCBbXG4gICAgICAgIGBjb2x1bW4gJHtzLnh9LCR7cy56fSB0b3AgaXMgJHt0b3B9LCBleHBlY3RlZCBncmF2ZWxgLFxuICAgICAgXSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG5cbiAgY29uc3QgY3ogPSBjZW50ZXJaICsgMC41O1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCBjZW50ZXJaKTtcbiAgICBjb25zdCBteCA9IHggKyAwLjU7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhdGgnLCB4OiBteCwgeSwgejogY3osIHc6IDEuMCwgaDogMC4xMiwgZDogMy4wLCB0b25lOiAnZ3JhdmVsJyB9KTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IG14LCB5LCB6OiByZWN0LnowICsgMC4wNzUsIHc6IDEuMCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lX2InIH0pO1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdjdXJiJywgeDogbXgsIHksIHo6IHJlY3QuejEgKyAxIC0gMC4wNzUsIHc6IDEuMCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lX2InIH0pO1xuICB9XG5cbiAgY29uc3QgbWluWSA9IE1hdGgubWluKC4uLmhlaWdodHMpO1xuICBjb25zdCBtYXhZID0gTWF0aC5tYXgoLi4uaGVpZ2h0cyk7XG4gIGNvbnN0IHBsYW46IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIGtpbmQ6ICdwYXRoJyxcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIG9yaWdpbjogeyB4OiAocmVjdC54MCArIHJlY3QueDEgKyAxKSAvIDIsIHk6IG1pblksIHo6IGN6IH0sXG4gICAgcm90OiAwLFxuICAgIG1vZHVsZXMsXG4gICAgY29zdDogcGF0aENvc3Qod2lkdGgpLFxuICAgIGVudmVsb3BlOiBmb290cHJpbnRFbnZlbG9wZShyZWN0LCBtaW5ZIC0gMSwgbWF4WSArIDIsIDApLFxuICAgIHN1cmZhY2UsXG4gIH07XG4gIHBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gdGVycmFjZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGxhblRlcnJhY2VzKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGNvbnN0IGNvdW50ID0gcHJvcG9zYWwudGVycmFjZXMgPz8gMztcbiAgaWYgKHdpZHRoICE9PSAxMiB8fCBkZXB0aCAhPT0gOCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Zvb3RwcmludF9taXNtYXRjaCcsIFtgdGVycmFjZXMgbmVlZCAxMiB4IDggbSwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuICBpZiAoY291bnQgPCAyIHx8IGNvdW50ID4gNCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3RlcnJhY2VfY291bnQnLCBbYCR7Y291bnR9IHRlcnJhY2VzIGlzIG91dHNpZGUgMi4uNGBdKTtcbiAgfVxuXG4gIC8vIFNwbGl0IGRlcHRoIGludG8gbmVhci1lcXVhbCBiYW5kcywgaGlnaCBzaWRlIGZpcnN0LlxuICBjb25zdCBiYXNlID0gTWF0aC5mbG9vcihkZXB0aCAvIGNvdW50KTtcbiAgY29uc3QgZXh0cmEgPSBkZXB0aCAlIGNvdW50O1xuICBjb25zdCBiYW5kczogVGVycmFjZUJhbmRbXSA9IFtdO1xuICBsZXQgeiA9IHJlY3QuejA7XG4gIGNvbnN0IG1lZGlhbnM6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgIGNvbnN0IHNpemUgPSBiYXNlICsgKGkgPCBleHRyYSA/IDEgOiAwKTtcbiAgICBjb25zdCB6MCA9IHosIHoxID0geiArIHNpemUgLSAxO1xuICAgIGNvbnN0IHZhbHVlczogbnVtYmVyW10gPSBbXTtcbiAgICBmb3IgKGxldCBieiA9IHowOyBieiA8PSB6MTsgYnorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB2YWx1ZXMucHVzaChzdXJmYWNlQXQod29ybGQsIHgsIGJ6KSk7XG4gICAgfVxuICAgIG1lZGlhbnMucHVzaChtZWRpYW4odmFsdWVzKSk7XG4gICAgYmFuZHMucHVzaCh7IHowLCB6MSwgeTogMCB9KTtcbiAgICB6ID0gejEgKyAxO1xuICB9XG4gIC8vIEVhY2ggdGVycmFjZSBzaXRzIGV4YWN0bHkgb25lIG1ldHJlIGJlbG93IHRoZSBwcmV2aW91cyBvbmUuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYmFuZHMubGVuZ3RoOyBpKyspIHtcbiAgICBiYW5kc1tpXS55ID0gaSA9PT0gMCA/IG1lZGlhbnNbMF0gOiBNYXRoLm1pbihtZWRpYW5zW2ldLCBiYW5kc1tpIC0gMV0ueSAtIDEpO1xuICB9XG5cbiAgbGV0IG1heEN1dCA9IDAsIG1heEZpbGwgPSAwLCBjdXRWb2x1bWUgPSAwLCBmaWxsVm9sdW1lID0gMDtcbiAgY29uc3Qgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGZvciAoY29uc3QgYiBvZiBiYW5kcykge1xuICAgIGZvciAobGV0IGJ6ID0gYi56MDsgYnogPD0gYi56MTsgYnorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IHMgPSBzdXJmYWNlQXQod29ybGQsIHgsIGJ6KTtcbiAgICAgICAgc3VyZmFjZS5wdXNoKHsgeCwgejogYnosIHk6IGIueSB9KTtcbiAgICAgICAgY29uc3QgZCA9IHMgLSBiLnk7XG4gICAgICAgIGlmIChkID4gMCkgeyBjdXRWb2x1bWUgKz0gZDsgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkKTsgfVxuICAgICAgICBpZiAoZCA8IDApIHsgZmlsbFZvbHVtZSArPSAtZDsgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIC1kKTsgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAobWF4Q3V0ID4gRkFSTV9SVUxFUy5tYXhDdXQgfHwgbWF4RmlsbCA+IEZBUk1fUlVMRVMubWF4RmlsbFxuICAgIHx8IGN1dFZvbHVtZSA+IEZBUk1fUlVMRVMubWF4Q3V0Vm9sdW1lIHx8IGZpbGxWb2x1bWUgPiBGQVJNX1JVTEVTLm1heEZpbGxWb2x1bWUpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX2VhcnRod29yaycsIFtcbiAgICAgIGBjdXQgJHtjdXRWb2x1bWV9IG1cdTAwQjMgLyBmaWxsICR7ZmlsbFZvbHVtZX0gbVx1MDBCMywgbWF4ICR7bWF4Q3V0fS8ke21heEZpbGx9IG1gLFxuICAgIF0pO1xuICB9XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX25vdF9wcmVwYXJlZCcsIG1pc21hdGNoZXMuc2xpY2UoMCwgNCkubWFwKFxuICAgICAgKG0pID0+IGBjb2x1bW4gJHttLnh9LCR7bS56fSBpcyBhdCAke20uYWN0dWFsfSwgZXhwZWN0ZWQgJHttLmV4cGVjdGVkfWAsXG4gICAgKSk7XG4gIH1cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdzaXRlX29ic3RydWN0ZWQnLCBvYnN0cnVjdGlvbnMubWFwKChvKSA9PiBvLmVudGl0eUlkKSk7XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIHN1cmZhY2UpIHtcbiAgICBjb25zdCB0b3AgPSBnZXRWb3hlbCh3b3JsZCwgcy54LCBzLnkgLSAxLCBzLnopO1xuICAgIGlmICh0b3AgIT09IE1BVC5TT0lMKSB7XG4gICAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX3N1cmZhY2UnLCBbXG4gICAgICAgIGBjb2x1bW4gJHtzLnh9LCR7cy56fSB0b3AgaXMgJHt0b3B9LCBleHBlY3RlZCBzb2lsYCxcbiAgICAgIF0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGN4ID0gKHJlY3QueDAgKyByZWN0LngxICsgMSkgLyAyO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGIgb2YgYmFuZHMpIHtcbiAgICBjb25zdCBieiA9IChiLnowICsgYi56MSArIDEpIC8gMjtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3NvaWxfYmVkJywgeDogY3gsIHk6IGIueSwgejogYnosXG4gICAgICB3OiB3aWR0aCwgaDogMC4xOCwgZDogYi56MSAtIGIuejAgKyAxLCB0b25lOiAnc29pbCcsXG4gICAgfSk7XG4gICAgLy8gVGhyZWUgY3JvcCByb3dzIHBlciB0ZXJyYWNlLCBpbnNldCBmcm9tIHRoZSByZXRhaW5pbmcgd2FsbHMuXG4gICAgY29uc3Qgcm93RGVwdGggPSBiLnoxIC0gYi56MCArIDE7XG4gICAgZm9yIChsZXQgciA9IDA7IHIgPCAzOyByKyspIHtcbiAgICAgIGNvbnN0IHQgPSAociArIDEpIC8gNDtcbiAgICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICAgIGtpbmQ6ICdjcm9wX3JvdycsIHg6IGN4LCB5OiBiLnkgKyAwLjE4LCB6OiBiLnowICsgcm93RGVwdGggKiB0LFxuICAgICAgICB3OiB3aWR0aCAtIDEuMiwgaDogMC4yOCwgZDogMC4zNiwgdG9uZTogJ2Nyb3AnLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgYmFuZHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB1cHBlciA9IGJhbmRzW2kgLSAxXTtcbiAgICBjb25zdCBsb3dlciA9IGJhbmRzW2ldO1xuICAgIG1vZHVsZXMucHVzaCh7XG4gICAgICBraW5kOiAncmV0YWluaW5nX3dhbGwnLCB4OiBjeCwgeTogbG93ZXIueSwgejogdXBwZXIuejEgKyAwLjUsXG4gICAgICB3OiB3aWR0aCwgaDogdXBwZXIueSAtIGxvd2VyLnksIGQ6IDAuNCwgdG9uZTogJ3N0b25lX2InLFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgbWluWSA9IE1hdGgubWluKC4uLmJhbmRzLm1hcCgoYikgPT4gYi55KSk7XG4gIGNvbnN0IG1heFkgPSBNYXRoLm1heCguLi5iYW5kcy5tYXAoKGIpID0+IGIueSkpO1xuICBjb25zdCBwbGFuOiBTdHJ1Y3R1cmVQbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBraW5kOiAndGVycmFjZScsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogY3gsIHk6IG1pblksIHo6IChyZWN0LnowICsgcmVjdC56MSArIDEpIC8gMiB9LFxuICAgIHJvdDogMCxcbiAgICBtb2R1bGVzLFxuICAgIGNvc3Q6IHsgLi4uVEVSUkFDRV9DT1NUIH0sXG4gICAgZW52ZWxvcGU6IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIG1pblkgLSAxLCBtYXhZICsgMiwgMSksXG4gICAgc3VyZmFjZSxcbiAgICB0ZXJyYWNlczogYmFuZHMsXG4gIH07XG4gIHBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFuU3RydWN0dXJlKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGlmIChwcm9wb3NhbC5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSByZXR1cm4gcGxhbkZvdW5kZXJEZXNpZ24od29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKHByb3Bvc2FsLmRlc2lnblZlcnNpb24gIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3Vuc3VwcG9ydGVkX2Rlc2lnbicsIFtgdW5zdXBwb3J0ZWQgc3RydWN0dXJlIGRlc2lnbiAke1N0cmluZyhwcm9wb3NhbC5kZXNpZ25WZXJzaW9uKX1gXSk7XG4gIH1cbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdob3VzZScpIHJldHVybiBwbGFuSG91c2Uod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdwYXRoJykgcmV0dXJuIHBsYW5QYXRoKHdvcmxkLCBwcm9wb3NhbCk7XG4gIHJldHVybiBwbGFuVGVycmFjZXMod29ybGQsIHByb3Bvc2FsKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBkZXNpZ24gMjogYm91bmRlZCBmb3VuZGVyIGNhbmRpZGF0ZSAtLS0tLS0tLS0tXG4vLyBUaGlzIGRlbGliZXJhdGVseSBsZWF2ZXMgZXZlcnkgbGVnYWN5IHBsYW5uZXIgYWJvdmUgdW50b3VjaGVkLiBUaGUgZXh0cmEgd2FsbFxuLy8gcHJpbWl0aXZlcyByZXByZXNlbnQgdm9pZHMsIG5vdCBkZWNvcmF0aXZlIHdpbmRvd3M7IHRoZWlyIGFzc2V0LWxldmVsIHZvbHVtZVxuLy8gaW50ZXJwcmV0YXRpb24gcmVtYWlucyBSZXZpZXcgUmVxdWlyZWQgKHRoZSBmb3VuZGVyIDRcdTIwMTM5IHZvbHVtZSB0YXJnZXQpLlxuZnVuY3Rpb24gcGxhbkZvdW5kZXJEZXNpZ24od29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgaWYgKHByb3Bvc2FsLmtpbmQgPT09ICdwYXRoJykgcmV0dXJuIHBsYW5Gb3VuZGVyUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICBjb25zdCBwbGFubmVkID0gcHJvcG9zYWwua2luZCA9PT0gJ2hvdXNlJyA/IHBsYW5Ib3VzZSh3b3JsZCwgcHJvcG9zYWwpIDogcGxhblRlcnJhY2VzKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAndGVycmFjZScpIHtcbiAgICAvLyBDcm9wIHJvd3Mgc3RheSBjb21wYWN0IGF1dGhvcml0YXRpdmUgYWdncmVnYXRlcy4gVGhlaXIgZmFjZXRlZCBmb2xpYWdlIGlzXG4gICAgLy8gZGVyaXZlZCBwcmVzZW50YXRpb24gb25seTsgbm8gcGxhbnQtbGV2ZWwgZXhpc3RlbmNlIG9yIHlpZWxkIGlzIGludmVudGVkLlxuICAgIHBsYW5uZWQucGxhbi5kZXNpZ25WZXJzaW9uID0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbiAgICBwbGFubmVkLnBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW5uZWQucGxhbil9YDtcbiAgICByZXR1cm4gcGxhbm5lZDtcbiAgfVxuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgeDAgPSByZWN0LngwLCB4MSA9IHJlY3QueDEgKyAxO1xuICBjb25zdCB6MCA9IHJlY3QuejAsIHoxID0gcmVjdC56MSArIDE7XG4gIGNvbnN0IHkgPSBwcm9wb3NhbC5mbG9vclksIGN4ID0gKHgwICsgeDEpIC8gMiwgY3ogPSAoejAgKyB6MSkgLyAyO1xuICBjb25zdCB0ID0gMC42LCBoID0gMy4yO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICAvLyBPbmUgc3RydWN0dXJhbCBzdG9uZSBmYW1pbHk6IGxpZ2h0aW5nLCBub3QgcGFpbnRlZCBmYWNlIHZhcmlhdGlvbiwgc2hhZGVzIGl0LlxuICBjb25zdCB3YWxsID0gKHg6IG51bWJlciwgYm90dG9tOiBudW1iZXIsIHo6IG51bWJlciwgdzogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZDogbnVtYmVyLCBraW5kOiBTdHJ1Y3R1cmVNb2R1bGVbJ2tpbmQnXSA9ICd3YWxsJykgPT4ge1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQsIHgsIHk6IGJvdHRvbSwgeiwgdywgaDogaGVpZ2h0LCBkLCB0b25lOiAnc3RvbmUnIH0pO1xuICB9O1xuICB3YWxsKGN4LCB5IC0gMC40LCBjeiwgOCwgMC40LCA2LCAnZmxvb3InKTtcbiAgd2FsbChjeCwgeSwgejAgKyB0IC8gMiwgOCwgaCwgdCk7XG4gIGNvbnN0IGlubmVyWjAgPSB6MCArIHQsIGlubmVyWjEgPSB6MSAtIHQ7XG4gIHdhbGwoeDAgKyB0IC8gMiwgeSwgKGlubmVyWjAgKyBpbm5lcloxKSAvIDIsIHQsIGgsIGlubmVyWjEgLSBpbm5lclowKTtcbiAgY29uc3QgZG9vclogPSAocHJvcG9zYWwuZG9vcj8ueiA/PyByZWN0LnowKSArIDAuNTtcbiAgY29uc3QgZG9vcjAgPSBkb29yWiAtIDAuNiwgZG9vcjEgPSBkb29yWiArIDAuNjtcbiAgY29uc3QgZWFzdFggPSB4MSAtIHQgLyAyO1xuICB3YWxsKGVhc3RYLCB5LCAoaW5uZXJaMCArIGRvb3IwKSAvIDIsIHQsIGgsIGRvb3IwIC0gaW5uZXJaMCk7XG4gIHdhbGwoZWFzdFgsIHksIChkb29yMSArIGlubmVyWjEpIC8gMiwgdCwgaCwgaW5uZXJaMSAtIGRvb3IxKTtcbiAgd2FsbChlYXN0WCwgeSArIDIuMiwgZG9vclosIHQsIDAuNCwgMS4yLCAnbGludGVsJyk7XG4gIHdhbGwoZWFzdFgsIHkgKyAyLjYsIGRvb3JaLCB0LCAwLjYsIDEuMik7XG4gIGNvbnN0IHNvdXRoWiA9IHoxIC0gdCAvIDI7XG4gIGZvciAoY29uc3QgW2EsIGJdIG9mIFtbeDAgKyB0LCBjeCAtIDIuNl0sIFtjeCAtIDEuNCwgY3ggKyAxLjRdLCBbY3ggKyAyLjYsIHgxIC0gdF1dKSB7XG4gICAgd2FsbCgoYSArIGIpIC8gMiwgeSwgc291dGhaLCBiIC0gYSwgaCwgdCk7XG4gIH1cbiAgZm9yIChjb25zdCB3eCBvZiBbY3ggLSAyLCBjeCArIDJdKSB7XG4gICAgd2FsbCh3eCwgeSwgc291dGhaLCAxLjIsIDEsIHQpO1xuICAgIHdhbGwod3gsIHkgKyAyLjQsIHNvdXRoWiwgMS4yLCAwLjgsIHQsICdsaW50ZWwnKTtcbiAgfVxuICB3YWxsKGN4LCB5ICsgaCwgY3osIDgsIDAuNCwgNiwgJ3Jvb2YnKTtcbiAgd2FsbChjeCwgeSArIGggKyAwLjQsIHowICsgMC4xNSwgOCwgMC4zLCAwLjMsICdwYXJhcGV0Jyk7XG4gIHdhbGwoY3gsIHkgKyBoICsgMC40LCB6MSAtIDAuMTUsIDgsIDAuMywgMC4zLCAncGFyYXBldCcpO1xuICB3YWxsKGN4IC0gMy44NSwgeSArIGggKyAwLjQsIGN6LCAwLjMsIDAuMywgNS40LCAncGFyYXBldCcpO1xuICB3YWxsKGN4ICsgMy44NSwgeSArIGggKyAwLjQsIGN6LCAwLjMsIDAuMywgNS40LCAncGFyYXBldCcpO1xuICBwbGFubmVkLnBsYW4ubW9kdWxlcyA9IG1vZHVsZXM7XG4gIHBsYW5uZWQucGxhbi5kZXNpZ25WZXJzaW9uID0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbiAgcGxhbm5lZC5wbGFuLmVudmVsb3BlID0gZm9vdHByaW50RW52ZWxvcGUocmVjdCwgeSAtIDEsIHkgKyA0LCAyKTtcbiAgcGxhbm5lZC5wbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFubmVkLnBsYW4pfWA7XG4gIHJldHVybiBwbGFubmVkO1xufVxuXG5mdW5jdGlvbiBwbGFuRm91bmRlclBhdGgod29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwpOiBTdHJ1Y3R1cmVQbGFuUmVzdWx0IHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5QYXRoKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuIHBsYW5uZWQ7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG4gIGNvbnN0IGhlaWdodHMgPSBwbGFubmVkLnBsYW4ubW9kdWxlcy5maWx0ZXIoKG0pID0+IG0ua2luZCA9PT0gJ3BhdGgnKS5tYXAoKG0pID0+IG0ueSk7XG4gIGNvbnN0IHowID0gcGxhbm5lZC5wbGFuLnJlY3QuejAsIHoxID0gcGxhbm5lZC5wbGFuLnJlY3QuejEgKyAxO1xuICBsZXQgc3RhcnQgPSAwO1xuICBmb3IgKGxldCBlbmQgPSAxOyBlbmQgPD0gaGVpZ2h0cy5sZW5ndGg7IGVuZCsrKSB7XG4gICAgaWYgKGVuZCA8IGhlaWdodHMubGVuZ3RoICYmIGhlaWdodHNbZW5kXSA9PT0gaGVpZ2h0c1tzdGFydF0pIGNvbnRpbnVlO1xuICAgIGNvbnN0IHggPSBwbGFubmVkLnBsYW4ucmVjdC54MCArIHN0YXJ0LCB3aWR0aCA9IGVuZCAtIHN0YXJ0O1xuICAgIGNvbnN0IGN4ID0geCArIHdpZHRoIC8gMiwgeSA9IGhlaWdodHNbc3RhcnRdO1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXRoJywgeDogY3gsIHksIHo6ICh6MCArIHoxKSAvIDIsIHc6IHdpZHRoLCBoOiAwLjEyLCBkOiAzLCB0b25lOiAnZ3JhdmVsJyB9KTtcbiAgICBmb3IgKGNvbnN0IHogb2YgW3owICsgMC4wNzUsIHoxIC0gMC4wNzVdKSB7XG4gICAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IGN4LCB5LCB6LCB3OiB3aWR0aCwgaDogMC4yMiwgZDogMC4xNSwgdG9uZTogJ3N0b25lJyB9KTtcbiAgICB9XG4gICAgc3RhcnQgPSBlbmQ7XG4gIH1cbiAgcGxhbm5lZC5wbGFuLm1vZHVsZXMgPSBtb2R1bGVzO1xuICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gIHBsYW5uZWQucGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbm5lZC5wbGFuKX1gO1xuICByZXR1cm4gcGxhbm5lZDtcbn1cblxuXG4vLyAtLS0tLS0tLS0tIGF1dGhvcml6YXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVMaW1pdHMge1xuICBtYXhNb2R1bGVzOiBudW1iZXI7XG4gIG1heENvc3Q6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU1RSVUNUVVJFX0xJTUlUUzogU3RydWN0dXJlTGltaXRzID0ge1xuICBtYXhNb2R1bGVzOiA2NCxcbiAgbWF4Q29zdDogMTI4LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uIHtcbiAgaWQ6IHN0cmluZztcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBiYXNlUmV2aXNpb246IG51bWJlcjtcbiAgbGltaXRzOiBTdHJ1Y3R1cmVMaW1pdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlRGVjaXNpb24ge1xuICBvazogYm9vbGVhbjtcbiAgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbiB8IG51bGw7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyIHtcbiAgcmVhZG9ubHkgYXV0aG9yaXR5ID0gTE9DQUxfQVVUSE9SSVRZO1xuICByZWFkb25seSBlbmZvcmNlbWVudCA9IExPQ0FMX0VORk9SQ0VNRU5UO1xuICByZWFkb25seSBsaW1pdHM6IFN0cnVjdHVyZUxpbWl0cztcblxuICBjb25zdHJ1Y3RvcihyZWFkb25seSBwb2xpY3k6IEF1dGhvcml6YXRpb25Qb2xpY3ksIGxpbWl0czogUGFydGlhbDxTdHJ1Y3R1cmVMaW1pdHM+ID0ge30pIHtcbiAgICB0aGlzLmxpbWl0cyA9IHsgLi4uREVGQVVMVF9TVFJVQ1RVUkVfTElNSVRTLCAuLi5saW1pdHMgfTtcbiAgfVxuXG4gIGF1dGhvcml6ZSh3b3JsZDogV29ybGQsIHBsYW46IFN0cnVjdHVyZVBsYW4pOiBTdHJ1Y3R1cmVEZWNpc2lvbiB7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAocGxhbi5tb2R1bGVzLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyBtb2R1bGVzJyk7XG4gICAgaWYgKHBsYW4ubW9kdWxlcy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhNb2R1bGVzKSB7XG4gICAgICByZWFzb25zLnB1c2goYCR7cGxhbi5tb2R1bGVzLmxlbmd0aH0gbW9kdWxlcyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhNb2R1bGVzfWApO1xuICAgIH1cbiAgICBpZiAoY29zdFRvdGFsKHBsYW4uY29zdCkgPiB0aGlzLmxpbWl0cy5tYXhDb3N0KSB7XG4gICAgICByZWFzb25zLnB1c2goYGNvc3QgJHtjb3N0VG90YWwocGxhbi5jb3N0KX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heENvc3R9YCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcihhbW91bnQpIHx8IChhbW91bnQgPz8gMCkgPCAwKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgY29zdCAke3Jlc291cmNlfT0ke2Ftb3VudH0gaXMgbm90IGEgbm9uLW5lZ2F0aXZlIGludGVnZXJgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHBsYW4uZW52ZWxvcGUubGVuZ3RoID09PSAwKSByZWFzb25zLnB1c2goJ3BsYW4gaGFzIG5vIHdvcmsgZW52ZWxvcGUnKTtcbiAgICBmb3IgKGNvbnN0IHJlZ2lvbiBvZiBwbGFuLmVudmVsb3BlKSB7XG4gICAgICBpZiAoIXRoaXMucG9saWN5LmVudmVsb3BlLnNvbWUoKHApID0+IHJlZ2lvbi54MCA+PSBwLngwICYmIHJlZ2lvbi54MSA8PSBwLngxXG4gICAgICAgICYmIHJlZ2lvbi56MCA+PSBwLnowICYmIHJlZ2lvbi56MSA8PSBwLnoxXG4gICAgICAgICYmIHJlZ2lvbi55MCA+PSBwLnkwICYmIHJlZ2lvbi55MSA8PSBwLnkxKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYGVudmVsb3BlICR7cmVnaW9uLngwfSwke3JlZ2lvbi56MH0sJHtyZWdpb24ueTB9Li4ke3JlZ2lvbi54MX0sJHtyZWdpb24uejF9LCR7cmVnaW9uLnkxfSBpcyBvdXRzaWRlIHRoZSBsb2NhbCBwb2xpY3lgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgICAgaWYgKCFtb2R1bGVJbnNpZGVFbnZlbG9wZShtLCBwbGFuLmVudmVsb3BlKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYG1vZHVsZSAke20ua2luZH0gYXQgJHttLnh9LCR7bS55fSwke20uen0gaXMgb3V0c2lkZSB0aGUgcGxhbiBlbnZlbG9wZWApO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAocGxhbi5zdXJmYWNlLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyBzdXJmYWNlIHNhbXBsZXMnKTtcbiAgICBmb3IgKGNvbnN0IHMgb2YgcGxhbi5zdXJmYWNlKSB7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgcy54LCBzLnksIHMueikpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBzdXJmYWNlICR7cy54fSwke3Muen0sJHtzLnl9IGlzIG91dHNpZGUgdGhlIHBsYW4gZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBhdXRob3JpemF0aW9uOiBudWxsLCByZWFzb25zIH07XG5cbiAgICBjb25zdCB0b2tlbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbiA9IHtcbiAgICAgIGlkOiBgbG9jYWwtc3R1YjpzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YCxcbiAgICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgICAgcGxhbkRpZ2VzdDogc3RydWN0dXJlRGlnZXN0KHBsYW4pLFxuICAgICAgZW52ZWxvcGU6IHBsYW4uZW52ZWxvcGUubWFwKChlKSA9PiAoeyAuLi5lIH0pKSxcbiAgICAgIGJhc2VSZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgICBsaW1pdHM6IHsgLi4udGhpcy5saW1pdHMgfSxcbiAgICB9O1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBhdXRob3JpemF0aW9uOiB0b2tlbiwgcmVhc29uczogW10gfTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tIGV4ZWN1dGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZUxlZGdlciB7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgYXV0aG9yaXphdGlvbklkOiBzdHJpbmc7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgc3RydWN0dXJlSWQ6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIG1vZHVsZUNvdW50OiBudW1iZXI7XG4gIGNvc3RQYWlkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICByZXZpc2lvbkJlZm9yZTogbnVtYmVyO1xuICByZXZpc2lvbkFmdGVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBTdHJ1Y3R1cmVQbGFuO1xuICBhdXRob3JpemF0aW9uOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uO1xuICBsZWRnZXI6IFN0cnVjdHVyZUxlZGdlcjtcbn1cblxuZXhwb3J0IHR5cGUgU3RydWN0dXJlT3V0Y29tZSA9IFN0cnVjdHVyZVN1Y2Nlc3MgfCBTdHJ1Y3R1cmVGYWlsdXJlO1xuXG5leHBvcnQgZnVuY3Rpb24gZXhlY3V0ZVN0cnVjdHVyZShcbiAgd29ybGQ6IFdvcmxkLCBwbGFuOiBTdHJ1Y3R1cmVQbGFuLCBhdXRob3JpemF0aW9uOiBTdHJ1Y3R1cmVBdXRob3JpemF0aW9uLFxuKTogU3RydWN0dXJlT3V0Y29tZSB7XG4gIGlmIChhdXRob3JpemF0aW9uLmF1dGhvcml0eSAhPT0gTE9DQUxfQVVUSE9SSVRZXG4gICAgfHwgYXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudCAhPT0gTE9DQUxfRU5GT1JDRU1FTlQpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bnN1cHBvcnRlZF9hdXRob3JpdHknLCBbXG4gICAgICBgYXV0aG9yaXR5ICR7YXV0aG9yaXphdGlvbi5hdXRob3JpdHl9LyR7YXV0aG9yaXphdGlvbi5lbmZvcmNlbWVudH0gaXMgbm90IHRoZSBsb2NhbCBzdHViYCxcbiAgICBdKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0ICE9PSBzdHJ1Y3R1cmVEaWdlc3QocGxhbikpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdkaWdlc3RfbWlzbWF0Y2gnLCBbJ2F1dGhvcml6YXRpb24gZG9lcyBub3QgbWF0Y2ggdGhpcyBzdHJ1Y3R1cmUgcGxhbiddKTtcbiAgfVxuICBpZiAoYXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb24gIT09IHdvcmxkLnJldmlzaW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnc3RhbGVfYXV0aG9yaXphdGlvbicsIFtcbiAgICAgIGBhdXRob3JpemF0aW9uIHdhcyBpc3N1ZWQgYXQgcmV2aXNpb24gJHthdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbn0sIHdvcmxkIGlzIGF0ICR7d29ybGQucmV2aXNpb259YCxcbiAgICBdKTtcbiAgfVxuICBpZiAocGxhbi5lbnZlbG9wZS5zb21lKChyKSA9PiAhYXV0aG9yaXphdGlvbi5lbnZlbG9wZS5zb21lKChhKSA9PiByLngwID49IGEueDBcbiAgICAmJiByLngxIDw9IGEueDEgJiYgci56MCA+PSBhLnowICYmIHIuejEgPD0gYS56MSAmJiByLnkwID49IGEueTAgJiYgci55MSA8PSBhLnkxKSkpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdlbnZlbG9wZV9taXNtYXRjaCcsIFsncGxhbiBlbnZlbG9wZSBpcyB3aWRlciB0aGFuIHRoZSBhdXRob3JpemF0aW9uJ10pO1xuICB9XG5cbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgIGlmICghbW9kdWxlSW5zaWRlRW52ZWxvcGUobSwgYXV0aG9yaXphdGlvbi5lbnZlbG9wZSkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgbW9kdWxlICR7bS5raW5kfSBhdCAke20ueH0sJHttLnl9LCR7bS56fSBpcyBvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlYCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG1pc21hdGNoZXMgPSBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZCwgcGxhbi5zdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJlYXNvbnMucHVzaCguLi5taXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCBwbGFuLnJlY3QpO1xuICBpZiAob2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goYGZvb3RwcmludCBoYXMgJHtvYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnNgKTtcbiAgfVxuICBpZiAod29ybGQuc3RydWN0dXJlcy5oYXMocGxhbi5pZCkpIHtcbiAgICByZWFzb25zLnB1c2goYHN0cnVjdHVyZSAke3BsYW4uaWR9IGFscmVhZHkgZXhpc3RzYCk7XG4gIH1cbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocGxhbi5jb3N0KSkge1xuICAgIGNvbnN0IGhhdmUgPSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDA7XG4gICAgaWYgKGhhdmUgPCAoYW1vdW50ID8/IDApKSB7XG4gICAgICByZWFzb25zLnB1c2goYG5lZWQgJHthbW91bnR9ICR7cmVzb3VyY2V9LCBoYXZlICR7aGF2ZX1gKTtcbiAgICB9XG4gIH1cbiAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5hdXRob3JpemVkX3N0cnVjdHVyZScsIHJlYXNvbnMpO1xuXG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgcmV2aXNpb25CZWZvcmUgPSB3b3JsZC5yZXZpc2lvbjtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocGxhbi5jb3N0KSkge1xuICAgIGNvbnN0IGxlZnQgPSAod29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSAtIChhbW91bnQgPz8gMCk7XG4gICAgaWYgKGxlZnQgPiAwKSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID0gbGVmdDtcbiAgICBlbHNlIGRlbGV0ZSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdO1xuICB9XG5cbiAgd29ybGQucmV2aXNpb24rKztcbiAgY29uc3Qgc3RydWN0dXJlOiBTdHJ1Y3R1cmUgPSB7XG4gICAgaWQ6IHBsYW4uaWQsXG4gICAga2luZDogcGxhbi5raW5kLFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAgeDogcGxhbi5vcmlnaW4ueCxcbiAgICB5OiBwbGFuLm9yaWdpbi55LFxuICAgIHo6IHBsYW4ub3JpZ2luLnosXG4gICAgcm90OiBwbGFuLnJvdCxcbiAgICBtb2R1bGVzOiBwbGFuLm1vZHVsZXMubWFwKChtKSA9PiAoeyAuLi5tIH0pKSxcbiAgICBjb3N0OiB7IC4uLnBsYW4uY29zdCB9LFxuICAgIGJ1aWx0UmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgIC4uLihwbGFuLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gPyB7IGRlc2lnblZlcnNpb246IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSA6IHt9KSxcbiAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgfTtcbiAgd29ybGQuc3RydWN0dXJlcy5zZXQoc3RydWN0dXJlLmlkLCBzdHJ1Y3R1cmUpO1xuXG4gIGNvbnN0IGxlZGdlcjogU3RydWN0dXJlTGVkZ2VyID0ge1xuICAgIGF1dGhvcml0eTogTE9DQUxfQVVUSE9SSVRZLFxuICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICBhdXRob3JpemF0aW9uSWQ6IGF1dGhvcml6YXRpb24uaWQsXG4gICAgcGxhbkRpZ2VzdDogYXV0aG9yaXphdGlvbi5wbGFuRGlnZXN0LFxuICAgIHN0cnVjdHVyZUlkOiBzdHJ1Y3R1cmUuaWQsXG4gICAgc2l0ZUlkOiBwbGFuLnNpdGVJZCxcbiAgICBraW5kOiBwbGFuLmtpbmQsXG4gICAgbW9kdWxlQ291bnQ6IHN0cnVjdHVyZS5tb2R1bGVzLmxlbmd0aCxcbiAgICBjb3N0UGFpZDogeyAuLi5wbGFuLmNvc3QgfSxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICByZXZpc2lvbkJlZm9yZSxcbiAgICByZXZpc2lvbkFmdGVyOiB3b3JsZC5yZXZpc2lvbixcbiAgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4sIGF1dGhvcml6YXRpb24sIGxlZGdlciB9O1xufVxuXG4vKipcbiAqIFRoZSBzaGFyZWQgcGxheWVyL0FJIHN0cnVjdHVyZSBlbnRyeSBwb2ludC4gVGVycmFpbiBtdXN0IGFscmVhZHkgYmUgcHJlcGFyZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFN0cnVjdHVyZShcbiAgd29ybGQ6IFdvcmxkLFxuICBhdXRob3JpemVyOiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsXG4gIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCxcbik6IFN0cnVjdHVyZU91dGNvbWUge1xuICBjb25zdCBwbGFubmVkID0gcGxhblN0cnVjdHVyZSh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBkZWNpc2lvbiA9IGF1dGhvcml6ZXIuYXV0aG9yaXplKHdvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2F1dGhvcml6ZScsICdub3RfYXV0aG9yaXplZCcsIGRlY2lzaW9uLnJlYXNvbnMpO1xuICB9XG4gIHJldHVybiBleGVjdXRlU3RydWN0dXJlKHdvcmxkLCBwbGFubmVkLnBsYW4sIGRlY2lzaW9uLmF1dGhvcml6YXRpb24pO1xufVxuIiwgIi8vIENhbm9uaWNhbCBzdGF0ZSBoYXNoaW5nIFx1MjAxNCBwdXJlIHNpbXVsYXRpb24sIG5vIHRocmVlLmpzIGltcG9ydHMuXG4vL1xuLy8gVGhlIG5vLWZsYXR0ZW4gcHJvb2YgY29tcGFyZXMgdGhlIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lIG91dHNpZGUgdGhlXG4vLyBjb21wbGV0ZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUuIEl0IGRlbGliZXJhdGVseSBkb2VzIG5vdCBoYXNoIGNodW5rXG4vLyBoZWlnaHRzL3RvcE1hdGVyaWFscyAoZGVyaXZlZCBjYWNoZXMpLCBtZXNoIGdlb21ldHJ5LCBzdHJlYW1pbmcgc3RhdGUgb3Jcbi8vIG5hdmlnYXRpb24gZGF0YS4gVGhvc2UgYXJlIGNoZWNrZWQgc2VwYXJhdGVseSBhcyBkZXJpdmVkIHN0YXRlLCBzbyBhIGNhY2hlXG4vLyBvciBtZXNoIHJlYnVpbGQgY2FuIG5ldmVyIGJlIG1pc3Rha2VuIGZvciBhIHRlcnJhaW4gbXV0YXRpb24uXG5pbXBvcnQge1xuICBXb3JsZCwgWV9NSU4sIFlfTUFYLCBIQUxGLCBDSFVOS19TSVpFLCBDSFVOS19BUkVBLFxuICBlbnN1cmVDaHVuaywgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIGNodW5rT3JpZ2luWCwgY2h1bmtPcmlnaW5aLCBsb2NhbEluZGV4LCB5VG9JbmRleCwgaXNTb2xpZCxcbiAgRW50aXR5LFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IFZveGVsUmVnaW9uLCBlbnZlbG9wZUNvbnRhaW5zIH0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0YXRlSGFzaCB7XG4gIC8qKiAxNiBoZXggY2hhcmFjdGVyczogdHdvIGluZGVwZW5kZW50IDMyLWJpdCBsYW5lcy4gKi9cbiAgaGFzaDogc3RyaW5nO1xuICBjZWxsczogbnVtYmVyO1xuICBleGNsdWRlZENlbGxzOiBudW1iZXI7XG4gIGNodW5rczogbnVtYmVyO1xuICByZWdpb246IFZveGVsUmVnaW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlTWlzbWF0Y2gge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgZmllbGQ6ICdoZWlnaHQnIHwgJ21hdGVyaWFsJztcbiAgZXhwZWN0ZWQ6IG51bWJlcjtcbiAgYWN0dWFsOiBudW1iZXI7XG59XG5cbmNsYXNzIEhhc2hlciB7XG4gIHByaXZhdGUgYSA9IDB4ODExYzlkYzU7XG4gIHByaXZhdGUgYiA9IDB4OWUzNzc5Yjk7XG5cbiAgYnl0ZSh2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCB4ID0gdiAmIDB4ZmY7XG4gICAgdGhpcy5hID0gTWF0aC5pbXVsKHRoaXMuYSBeIHgsIDB4MDEwMDAxOTMpO1xuICAgIHRoaXMuYiA9IE1hdGguaW11bCh0aGlzLmIgXiAoeCArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICB0aGlzLmIgXj0gdGhpcy5iID4+PiAxMztcbiAgfVxuXG4gIHUzMih2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBsZXQgbiA9IHYgPj4+IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA0OyBpKyspIHtcbiAgICAgIHRoaXMuYnl0ZShuKTtcbiAgICAgIG4gPj4+PSA4O1xuICAgIH1cbiAgfVxuXG4gIHN0cmluZyhzOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLnUzMihzLmxlbmd0aCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSsrKSB0aGlzLmJ5dGUocy5jaGFyQ29kZUF0KGkpKTtcbiAgfVxuXG4gIGhleCgpOiBzdHJpbmcge1xuICAgIHJldHVybiAodGhpcy5hID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICAgKyAodGhpcy5iID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXBSZWdpb24ocmVnaW9uOiBWb3hlbFJlZ2lvbik6IFZveGVsUmVnaW9uIHtcbiAgY29uc3QgcjogVm94ZWxSZWdpb24gPSB7XG4gICAgeDA6IE1hdGgubWF4KC1IQUxGLCBNYXRoLmZsb29yKHJlZ2lvbi54MCkpLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgTWF0aC5mbG9vcihyZWdpb24uejApKSxcbiAgICB4MTogTWF0aC5taW4oSEFMRiAtIDEsIE1hdGguZmxvb3IocmVnaW9uLngxKSksXG4gICAgejE6IE1hdGgubWluKEhBTEYgLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi56MSkpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgTWF0aC5mbG9vcihyZWdpb24ueTApKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi55MSkpLFxuICB9O1xuICBpZiAoci54MCA+IHIueDEgfHwgci56MCA+IHIuejEgfHwgci55MCA+IHIueTEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYGVtcHR5IHZveGVsIHJlZ2lvbiAke0pTT04uc3RyaW5naWZ5KHJlZ2lvbil9YCk7XG4gIH1cbiAgcmV0dXJuIHI7XG59XG5cbi8qKiBTb3J0IGFuIGVudmVsb3BlIHNvIGl0cyBoYXNoIGlzIGluZGVwZW5kZW50IG9mIHJlY3Qgb3JkZXIuICovXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplRW52ZWxvcGUocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBWb3hlbFJlZ2lvbltdIHtcbiAgcmV0dXJuIHJlY3RzXG4gICAgLm1hcCgocikgPT4gKHtcbiAgICAgIHgwOiBNYXRoLmZsb29yKHIueDApLCB6MDogTWF0aC5mbG9vcihyLnowKSwgeDE6IE1hdGguZmxvb3Ioci54MSksIHoxOiBNYXRoLmZsb29yKHIuejEpLFxuICAgICAgeTA6IE1hdGguZmxvb3Ioci55MCksIHkxOiBNYXRoLmZsb29yKHIueTEpLFxuICAgIH0pKVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLngwIC0gYi54MCB8fCBhLnowIC0gYi56MCB8fCBhLnkwIC0gYi55MFxuICAgICAgfHwgYS54MSAtIGIueDEgfHwgYS56MSAtIGIuejEgfHwgYS55MSAtIGIueTEpO1xufVxuXG4vKiogTWF0ZXJpYWxpc2UgZXZlcnkgY2h1bmsgdGhhdCBvdmVybGFwcyB0aGUgcmVnaW9uIGFuZCByZXR1cm4gc29ydGVkIGtleXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IHdvcmxkVG9DaHVua1goci54MCksIGN4MSA9IHdvcmxkVG9DaHVua1goci54MSk7XG4gIGNvbnN0IGN6MCA9IHdvcmxkVG9DaHVua1ooci56MCksIGN6MSA9IHdvcmxkVG9DaHVua1ooci56MSk7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2N4fSwke2N6fSBpcyBvdXRzaWRlIHRoZSB3b3JsZGApO1xuICAgICAga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICAgIH1cbiAgfVxuICBrZXlzLnNvcnQoKTtcbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKlxuICogSGFzaCB0aGUgYXV0aG9yaXRhdGl2ZSBtYXRlcmlhbCBieXRlIG9mIGV2ZXJ5IHZveGVsIGluIGByZWdpb25gLCBleGNsdWRpbmdcbiAqIGV2ZXJ5IHZveGVsIGluc2lkZSBgZXhjbHVkZWAuIFR3byBjYWxscyB3aXRoIHRoZSBzYW1lIHJlZ2lvbiBhbmQgZW52ZWxvcGVcbiAqIGFyZSBkaXJlY3RseSBjb21wYXJhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsUmVnaW9uSGFzaChcbiAgd29ybGQ6IFdvcmxkLFxuICByZWdpb246IFZveGVsUmVnaW9uLFxuICBleGNsdWRlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdID0gW10sXG4pOiBTdGF0ZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3QgZW52ZWxvcGUgPSBub3JtYWxpemVFbnZlbG9wZShleGNsdWRlKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnZveGVsLXN0YXRlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpOyBoLnUzMihyLnkwKTsgaC51MzIoci55MSk7XG4gIGgudTMyKGVudmVsb3BlLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgZSBvZiBlbnZlbG9wZSkge1xuICAgIGgudTMyKGUueDApOyBoLnUzMihlLnowKTsgaC51MzIoZS54MSk7IGgudTMyKGUuejEpOyBoLnUzMihlLnkwKTsgaC51MzIoZS55MSk7XG4gIH1cblxuICBsZXQgY2VsbHMgPSAwO1xuICBsZXQgZXhjbHVkZWRDZWxscyA9IDA7XG4gIGNvbnN0IHlpMCA9IHIueTAgLSBZX01JTjtcbiAgY29uc3QgeWkxID0gci55MSAtIFlfTUlOO1xuXG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IHlpID0geWkwOyB5aSA8PSB5aTE7IHlpKyspIHtcbiAgICAgIGNvbnN0IHkgPSBZX01JTiArIHlpO1xuICAgICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgICBjb25zdCB6ID0gb3ogKyBsejtcbiAgICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICAgIGNvbnN0IHggPSBveCArIGx4O1xuICAgICAgICAgIGlmIChlbnZlbG9wZS5sZW5ndGggPiAwICYmIGVudmVsb3BlQ29udGFpbnMoZW52ZWxvcGUsIHgsIHksIHopKSB7XG4gICAgICAgICAgICBleGNsdWRlZENlbGxzKys7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaC5ieXRlKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeWksIGx6KV0pO1xuICAgICAgICAgIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjZWxscywgZXhjbHVkZWRDZWxscywgY2h1bmtzOiBrZXlzLmxlbmd0aCwgcmVnaW9uOiByIH07XG59XG5cbi8qKiBDYW5vbmljYWwgaW52ZW50b3J5IGhhc2g7IGtleSBvcmRlciBjYW5ub3QgYWZmZWN0IHRoZSByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjppbnZlbnRvcnk6djEnKTtcbiAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHdvcmxkLmludmVudG9yeSkuc29ydCgpO1xuICBoLnUzMihrZXlzLmxlbmd0aCk7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBoLnN0cmluZyhrZXkpO1xuICAgIGgudTMyKHdvcmxkLmludmVudG9yeVtrZXldKTtcbiAgfVxuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGludmVudG9yeVNuYXBzaG90KHdvcmxkOiBXb3JsZCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMod29ybGQuaW52ZW50b3J5KS5zb3J0KCkpIG91dFtrZXldID0gd29ybGQuaW52ZW50b3J5W2tleV07XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGhhc2hFbnRpdHkoaDogSGFzaGVyLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaC5zdHJpbmcoZS5pZCk7XG4gIGguc3RyaW5nKGUua2luZCk7XG4gIGguc3RyaW5nKGUuY2h1bmspO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueCAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnkgKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS56ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUucm90ICogMTAwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnNjYWxlICogMTAwMCkpO1xuICBoLnUzMihlLnZhcmlhbnQpO1xuICBoLnN0cmluZyhlLnJlc291cmNlID8/ICcnKTtcbiAgaC51MzIoZS5yZW1haW5pbmcpO1xuICBoLnUzMihlLmhhcnZlc3RlZCA/IDEgOiAwKTtcbiAgaC51MzIoZS5oYXJ2ZXN0ZWRPbmNlID8gMSA6IDApO1xufVxuXG4vKiogSGFzaCBlbnRpdHkgc3RhdGU7IHdpdGggYSByZWdpb24sIG9ubHkgZW50aXRpZXMgcm9vdGVkIGluc2lkZSBpdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkOiBXb3JsZCwgcmVnaW9uPzogVm94ZWxSZWdpb24pOiBzdHJpbmcge1xuICBsZXQgZW50aXRpZXM6IEVudGl0eVtdO1xuICBpZiAocmVnaW9uKSB7XG4gICAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gICAgZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgICBlbnRpdGllcyA9IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uZmlsdGVyKFxuICAgICAgKGUpID0+IGUueCA+PSByLngwICYmIGUueCA8IHIueDEgKyAxICYmIGUueiA+PSByLnowICYmIGUueiA8IHIuejEgKyAxLFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgZW50aXRpZXMgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldO1xuICB9XG4gIGVudGl0aWVzLnNvcnQoKGEsIGIpID0+IChhLmlkIDwgYi5pZCA/IC0xIDogYS5pZCA+IGIuaWQgPyAxIDogMCkpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjplbnRpdHktc3RhdGU6djEnKTtcbiAgaC51MzIoZW50aXRpZXMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBlIG9mIGVudGl0aWVzKSBoYXNoRW50aXR5KGgsIGUpO1xuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuLyoqXG4gKiBDYW5vbmljYWwgaGFzaCBvZiBidWlsdCBzdHJ1Y3R1cmVzLiBMYXlvdXQgbW9kdWxlcyBhbmQgcGFpZCBjb3N0cyBhcmVcbiAqIGF1dGhvcml0YXRpdmUgc2ltdWxhdGlvbiBzdGF0ZTsgcmVuZGVyZXIgbWVzaGVzIGFyZSBub3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoKHdvcmxkOiBXb3JsZCk6IHN0cmluZyB7XG4gIGNvbnN0IHN0cnVjdHVyZXMgPSBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV1cbiAgICAuc29ydCgoYSwgYikgPT4gKGEuaWQgPCBiLmlkID8gLTEgOiBhLmlkID4gYi5pZCA/IDEgOiAwKSk7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnN0cnVjdHVyZS1zdGF0ZTp2MScpO1xuICBoLnUzMihzdHJ1Y3R1cmVzLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgcyBvZiBzdHJ1Y3R1cmVzKSB7XG4gICAgaC5zdHJpbmcocy5pZCk7XG4gICAgaC5zdHJpbmcocy5raW5kKTtcbiAgICBoLnN0cmluZyhzLnNpdGVJZCk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnggKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnkgKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnogKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnJvdCAqIDEwMDAwKSk7XG4gICAgLy8gTGVnYWN5IGhhc2ggaW5wdXQgaXMgYnl0ZS1pZGVudGljYWwuIERlc2lnbiAyIGFkZHMgYW4gZXhwbGljaXQgdGFnLlxuICAgIGlmIChzLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIGguc3RyaW5nKCdkZXNpZ246MicpO1xuICAgIGgudTMyKHMubW9kdWxlcy5sZW5ndGgpO1xuICAgIGZvciAoY29uc3QgbSBvZiBzLm1vZHVsZXMpIHtcbiAgICAgIGguc3RyaW5nKG0ua2luZCk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS55ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnogKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0udyAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS5oICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLmQgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKChtLnJvdCA/PyAwKSAqIDEwMDAwKSk7XG4gICAgICBoLnN0cmluZyhtLnRvbmUgPz8gJycpO1xuICAgIH1cbiAgICBjb25zdCBjb3N0S2V5cyA9IE9iamVjdC5rZXlzKHMuY29zdCkuc29ydCgpO1xuICAgIGgudTMyKGNvc3RLZXlzLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgY29zdEtleXMpIHtcbiAgICAgIGguc3RyaW5nKGtleSk7XG4gICAgICBoLnUzMihzLmNvc3Rba2V5IGFzIGtleW9mIHR5cGVvZiBzLmNvc3RdID8/IDApO1xuICAgIH1cbiAgICBoLnUzMihzLmJ1aWx0UmV2aXNpb24pO1xuICB9XG4gIHJldHVybiBoLmhleCgpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlSGFzaCB7XG4gIGhhc2g6IHN0cmluZztcbiAgY29sdW1uczogbnVtYmVyO1xuICBjaHVua3M6IG51bWJlcjtcbn1cblxuLyoqIERlcml2ZWQgY29sdW1uLWNhY2hlIGhhc2guIE5vdCBhdXRob3JpdGF0aXZlIHRlcnJhaW4gc3RhdGUuICovXG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlZENhY2hlSGFzaCh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24pOiBDYWNoZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOmRlcml2ZWQtY29sdW1uLWNhY2hlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpO1xuICBsZXQgY29sdW1ucyA9IDA7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICAgIGgudTMyKGNodW5rLmhlaWdodHNbY29sXSk7XG4gICAgICAgIGgudTMyKGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdKTtcbiAgICAgICAgY29sdW1ucysrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjb2x1bW5zLCBjaHVua3M6IGtleXMubGVuZ3RoIH07XG59XG5cbi8qKlxuICogUmVjb21wdXRlIGV2ZXJ5IGNvbHVtbiBjYWNoZSBmcm9tIHRoZSBhdXRob3JpdGF0aXZlIHZveGVsIGRhdGEgYW5kIHJlcG9ydFxuICogbWlzbWF0Y2hlcy4gVGhpcyBwcm92ZXMgaGVpZ2h0cy90b3BNYXRlcmlhbHMgYXJlIGRlcml2ZWQsIG5vdCBhIHNlY29uZFxuICogdGVycmFpbiByZXByZXNlbnRhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRGVyaXZlZENhY2hlcyh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24sIGxpbWl0ID0gNjQpOiBDYWNoZU1pc21hdGNoW10ge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IG91dDogQ2FjaGVNaXNtYXRjaFtdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSBjb250aW51ZTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgICAgICAgbGV0IHRvcE1hdCA9IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdO1xuICAgICAgICBmb3IgKGxldCB5ID0gWV9NQVggLSAxOyB5ID49IFlfTUlOOyB5LS0pIHtcbiAgICAgICAgICBjb25zdCBtID0gY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgICBpZiAoaXNTb2xpZChtKSkgeyB0b3BTb2xpZCA9IHk7IHRvcE1hdCA9IG07IGJyZWFrOyB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXhwZWN0ZWRIZWlnaHQgPSB0b3BTb2xpZCAtIFlfTUlOO1xuICAgICAgICBpZiAoY2h1bmsuaGVpZ2h0c1tjb2xdICE9PSBleHBlY3RlZEhlaWdodCkge1xuICAgICAgICAgIG91dC5wdXNoKHsgeDogb3ggKyBseCwgejogb3ogKyBseiwgZmllbGQ6ICdoZWlnaHQnLCBleHBlY3RlZDogZXhwZWN0ZWRIZWlnaHQsIGFjdHVhbDogY2h1bmsuaGVpZ2h0c1tjb2xdIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjaHVuay50b3BNYXRlcmlhbHNbY29sXSAhPT0gdG9wTWF0KSB7XG4gICAgICAgICAgb3V0LnB1c2goeyB4OiBveCArIGx4LCB6OiBveiArIGx6LCBmaWVsZDogJ21hdGVyaWFsJywgZXhwZWN0ZWQ6IHRvcE1hdCwgYWN0dWFsOiBjaHVuay50b3BNYXRlcmlhbHNbY29sXSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3V0Lmxlbmd0aCA+PSBsaW1pdCkgcmV0dXJuIG91dDtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBFZGl0T3V0c2lkZSB7XG4gIGNodW5rOiBzdHJpbmc7XG4gIGluZGV4OiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIG1hdGVyaWFsOiBudW1iZXI7XG59XG5cbi8qKiBFdmVyeSByZWNvcmRlZCB2b3hlbCBlZGl0IG91dHNpZGUgdGhlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZGl0c091dHNpZGVFbnZlbG9wZSh3b3JsZDogV29ybGQsIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogRWRpdE91dHNpZGVbXSB7XG4gIGNvbnN0IG91dDogRWRpdE91dHNpZGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGVkaXRzXSBvZiB3b3JsZC5lZGl0cykge1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gICAgZm9yIChjb25zdCBbaW5kZXgsIG1hdGVyaWFsXSBvZiBlZGl0cykge1xuICAgICAgY29uc3QgbHggPSBpbmRleCAlIENIVU5LX1NJWkU7XG4gICAgICBjb25zdCBseiA9IE1hdGguZmxvb3IoKGluZGV4ICUgQ0hVTktfQVJFQSkgLyBDSFVOS19TSVpFKTtcbiAgICAgIGNvbnN0IHlpID0gTWF0aC5mbG9vcihpbmRleCAvIENIVU5LX0FSRUEpO1xuICAgICAgY29uc3QgeCA9IG94ICsgbHgsIHogPSBveiArIGx6LCB5ID0gWV9NSU4gKyB5aTtcbiAgICAgIGlmICghZW52ZWxvcGVDb250YWlucyhlbnZlbG9wZSwgeCwgeSwgeikpIHtcbiAgICAgICAgb3V0LnB1c2goeyBjaHVuazoga2V5LCBpbmRleCwgeCwgeSwgeiwgbWF0ZXJpYWwgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIG91dC5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykgfHwgYS5pbmRleCAtIGIuaW5kZXgpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vKiogTmV3IGNodW5rcyBnZW5lcmF0ZWQgc2luY2UgdGhlIGJhc2VsaW5lIHRoYXQgZG8gbm90IG92ZXJsYXAgdGhlIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5ld0NodW5rc091dHNpZGVFbnZlbG9wZShcbiAgd29ybGQ6IFdvcmxkLCBiYXNlbGluZUtleXM6IEl0ZXJhYmxlPHN0cmluZz4sIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdLFxuKTogc3RyaW5nW10ge1xuICBjb25zdCBiYXNlbGluZSA9IG5ldyBTZXQoYmFzZWxpbmVLZXlzKTtcbiAgY29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IFtrZXksIGNodW5rXSBvZiB3b3JsZC5jaHVua3MpIHtcbiAgICBpZiAoYmFzZWxpbmUuaGFzKGtleSkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IG92ZXJsYXBzID0gZW52ZWxvcGUuc29tZShcbiAgICAgIChyKSA9PiBveCA8PSByLngxICYmIG94ICsgQ0hVTktfU0laRSAtIDEgPj0gci54MCAmJiBveiA8PSByLnoxICYmIG96ICsgQ0hVTktfU0laRSAtIDEgPj0gci56MCxcbiAgICApO1xuICAgIGlmICghb3ZlcmxhcHMpIG91dC5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIG91dC5zb3J0KCk7XG59XG5cbi8qKiBBbGwgY2h1bmsga2V5cyBjdXJyZW50bHkgbWF0ZXJpYWxpc2VkLCBzb3J0ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gY2h1bmtLZXlzKHdvcmxkOiBXb3JsZCk6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIFsuLi53b3JsZC5jaHVua3Mua2V5cygpXS5zb3J0KCk7XG59XG5cbi8qKiBCb3VuZGluZyB2b3hlbCByZWdpb24gY292ZXJpbmcgZXZlcnkgbWF0ZXJpYWxpc2VkIGNodW5rLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkQ2h1bmtSZWdpb24od29ybGQ6IFdvcmxkKTogVm94ZWxSZWdpb24ge1xuICBpZiAod29ybGQuY2h1bmtzLnNpemUgPT09IDApIHRocm93IG5ldyBFcnJvcignd29ybGQgaGFzIG5vIGNodW5rcycpO1xuICBsZXQgbWluQ3ggPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN4ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBsZXQgbWluQ3ogPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heEN6ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IGNodW5rIG9mIHdvcmxkLmNodW5rcy52YWx1ZXMoKSkge1xuICAgIG1pbkN4ID0gTWF0aC5taW4obWluQ3gsIGNodW5rLmN4KTsgbWF4Q3ggPSBNYXRoLm1heChtYXhDeCwgY2h1bmsuY3gpO1xuICAgIG1pbkN6ID0gTWF0aC5taW4obWluQ3osIGNodW5rLmN6KTsgbWF4Q3ogPSBNYXRoLm1heChtYXhDeiwgY2h1bmsuY3opO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDA6IGNodW5rT3JpZ2luWChtaW5DeCksXG4gICAgejA6IGNodW5rT3JpZ2luWihtaW5DeiksXG4gICAgeDE6IGNodW5rT3JpZ2luWChtYXhDeCkgKyBDSFVOS19TSVpFIC0gMSxcbiAgICB6MTogY2h1bmtPcmlnaW5aKG1heEN6KSArIENIVU5LX1NJWkUgLSAxLFxuICAgIHkwOiBZX01JTixcbiAgICB5MTogWV9NQVggLSAxLFxuICB9O1xufVxuIiwgIi8vIE0wMDIgZGV0ZXJtaW5pc3RpYyBmaXh0dXJlIGFuZCBsaXZlLXdvcmxkIGxheW91dC5cbi8vXG4vLyBUaGUgZml4dHVyZSBpcyBhIGJvdW5kZWQgc2xpY2Ugb2YgdGhlIHJlYWwgMjA0OCBtIHdvcmxkIChzZWVkIDEzMzcpLCBub3QgYVxuLy8gc3ludGhldGljIGhlaWdodGZpZWxkLiBJdCBjb250YWluczpcbi8vICAgKiBhIHJlamVjdGVkIGhvdXNlIHNpdGUgb24gYSA3IG0gcml2ZXItYmFuayBzbG9wZTtcbi8vICAgKiBhIHZpYWJsZSBob3VzZSBzaGVsZiAyMCBtIGF3YXkgd2l0aCAyIG0gcmVsaWVmIGFuZCBubyBjbGVhcmluZyBuZWVkZWQ7XG4vLyAgICogYSAzIG0gZmFybSBzbG9wZSAyNyBtIGZyb20gdGhlIGhvdXNlIHdpdGggYSBuYXR1cmFsIGJsb3Nzb20gdHJlZSBhbmQgb3JlLlxuLy9cbi8vIFRoZSBzYW1lIGNvb3JkaW5hdGVzLCBxdWVyaWVzIGFuZCB2YWxpZGF0b3JzIGFyZSB1c2VkIGJ5IHRoZSBsaXZlLXdvcmxkXG4vLyBhY2NlcHRhbmNlIHRlc3QuIFRoZSBvbmx5IGRpZmZlcmVuY2UgaXMgaG93IG1hbnkgY2h1bmtzIGFyZSBtYXRlcmlhbGlzZWQuXG5pbXBvcnQge1xuICBXb3JsZCwgY3JlYXRlV29ybGQsIGdlbmVyYXRlV29ybGQsIGdlbmVyYXRlQ2h1bmssIHBsYWNlQXV0aG9yZWRTaXRlcyxcbiAgWV9NSU4sIFlfTUFYLCBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWixcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBSZWN0LCBWb3hlbFJlZ2lvbiB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBjaHVua0tleXMgfSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBNMDAyX1NFRUQgPSAxMzM3O1xuXG4vKiogUGlubmVkIHBhdGggc2l0ZSBpZCBmb3IgdGhlIGRvb3ItdG8tYXBwcm9hY2ggY29ycmlkb3IuICovXG5leHBvcnQgY29uc3QgTTAwMl9QQVRIX1NJVEVfSUQgPSAncGF0aC1ob3VzZS1mYXJtJztcblxuLyoqXG4gKiBQaW5uZWQgc3RlcHBlZCBwcm9maWxlIGZvciB0aGUgOSBtIHBhdGggZnJvbSB0aGUgaG91c2UgZG9vciAoeCA9IC01MykgdG8gdGhlXG4gKiBhcHByb2FjaCAoeCA9IC00NSkuIFRoZSByaXNlIGlzIDIgbSBvdmVyIDggbTsgZXZlcnkgc3RlcCBpcyBhdCBtb3N0IDEgbS5cbiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfUEFUSF9QUk9GSUxFID0gWzExLCAxMSwgMTEsIDEyLCAxMiwgMTIsIDEyLCAxMywgMTNdIGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIFRlcnJhY2VCYW5kU3BlYyB7XG4gIHowOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuLyoqIFBpbm5lZCBmYXJtIHRlcnJhY2VzLCBoaWdoIHNpZGUgZmlyc3QuICovXG5leHBvcnQgY29uc3QgTTAwMl9URVJSQUNFX0JBTkRTOiByZWFkb25seSBUZXJyYWNlQmFuZFNwZWNbXSA9IFtcbiAgeyB6MDogLTQyLCB6MTogLTQwLCB5OiAxNiB9LFxuICB7IHowOiAtMzksIHoxOiAtMzcsIHk6IDE1IH0sXG4gIHsgejA6IC0zNiwgejE6IC0zNSwgeTogMTQgfSxcbl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVNwZWMge1xuICBpZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgZG9vcjogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZhcm1TcGVjIHtcbiAgaWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgdGVycmFjZXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyTGF5b3V0IHtcbiAgc2VlZDogbnVtYmVyO1xuICByZWplY3RlZDogU2l0ZVNwZWM7XG4gIGhvdXNlOiBTaXRlU3BlYztcbiAgZmFybTogRmFybVNwZWM7XG4gIHNlYXJjaEFyZWE6IFJlY3Q7XG4gIHdvcmtab25lOiBSZWN0O1xuICBmaXh0dXJlQ2h1bmtzOiB7IGN4MDogbnVtYmVyOyBjejA6IG51bWJlcjsgY3gxOiBudW1iZXI7IGN6MTogbnVtYmVyIH07XG4gIHByb3RlY3RlZFJlZ2lvbjogVm94ZWxSZWdpb247XG4gIC8qKiBDb21wbGV0ZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUgZm9yIHRoZSBmaXJzdCBzbGljZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG59XG5cbmNvbnN0IEZJWFRVUkVfQ0hVTktTID0geyBjeDA6IDI4LCBjejA6IDI5LCBjeDE6IDMyLCBjejE6IDMyIH0gYXMgY29uc3Q7XG5cbmV4cG9ydCBjb25zdCBNMDAyX0xBWU9VVDogTTAwMkxheW91dCA9IHtcbiAgc2VlZDogTTAwMl9TRUVELFxuICByZWplY3RlZDoge1xuICAgIGlkOiAnc2l0ZS1hLXJlamVjdGVkJyxcbiAgICByZWN0OiB7IHgwOiAtNzQsIHowOiAtNjYsIHgxOiAtNjcsIHoxOiAtNjEgfSxcbiAgICAvLyBBIG5haXZlIGxvdy1zaWRlIGZsb29yOiB0aGUgdXBoaWxsIGNvcm5lciB3b3VsZCBuZWVkIDUgbSBvZiBleGNhdmF0aW9uLlxuICAgIGZsb29yWTogMyxcbiAgICBkb29yOiB7IHg6IC02NywgejogLTYzIH0sXG4gICAgYXBwcm9hY2g6IHsgeDogLTYwLCB6OiAtNjMgfSxcbiAgfSxcbiAgaG91c2U6IHtcbiAgICBpZDogJ3NpdGUtYi1ob3VzZScsXG4gICAgcmVjdDogeyB4MDogLTYwLCB6MDogLTQ2LCB4MTogLTUzLCB6MTogLTQxIH0sXG4gICAgZmxvb3JZOiAxMSxcbiAgICBkb29yOiB7IHg6IC01MywgejogLTQzIH0sXG4gICAgYXBwcm9hY2g6IHsgeDogLTQ1LCB6OiAtNDMgfSxcbiAgfSxcbiAgZmFybToge1xuICAgIGlkOiAnZmllbGQtYycsXG4gICAgcmVjdDogeyB4MDogLTM4LCB6MDogLTQyLCB4MTogLTI3LCB6MTogLTM1IH0sXG4gICAgdGVycmFjZXM6IDMsXG4gIH0sXG4gIHNlYXJjaEFyZWE6IHsgeDA6IC03NiwgejA6IC02OCwgeDE6IC00MCwgejE6IC00MCB9LFxuICB3b3JrWm9uZTogeyB4MDogLTc2LCB6MDogLTY4LCB4MTogLTIzLCB6MTogLTMxIH0sXG4gIGZpeHR1cmVDaHVua3M6IEZJWFRVUkVfQ0hVTktTLFxuICBwcm90ZWN0ZWRSZWdpb246IHtcbiAgICB4MDogY2h1bmtPcmlnaW5YKEZJWFRVUkVfQ0hVTktTLmN4MCksXG4gICAgejA6IGNodW5rT3JpZ2luWihGSVhUVVJFX0NIVU5LUy5jejApLFxuICAgIHgxOiBjaHVua09yaWdpblgoRklYVFVSRV9DSFVOS1MuY3gxKSArIDMxLFxuICAgIHoxOiBjaHVua09yaWdpblooRklYVFVSRV9DSFVOS1MuY3oxKSArIDMxLFxuICAgIHkwOiBZX01JTixcbiAgICB5MTogWV9NQVggLSAxLFxuICB9LFxuICBlbnZlbG9wZTogW1xuICAgIC8vIEhvdXNlIGZvb3RwcmludCBwbHVzIGEgMiBtIHByZXBhcmF0aW9uIGJ1ZmZlci5cbiAgICB7IHgwOiAtNjIsIHowOiAtNDgsIHgxOiAtNTEsIHoxOiAtMzksIHkwOiA4LCB5MTogMTYgfSxcbiAgICAvLyBEb29yLXRvLWFwcHJvYWNoIHBhdGggY29ycmlkb3IgcGx1cyBhIDEgbSBidWZmZXIuXG4gICAgeyB4MDogLTU0LCB6MDogLTQ0LCB4MTogLTQ0LCB6MTogLTQyLCB5MDogOSwgeTE6IDE1IH0sXG4gICAgLy8gRmFybSBmb290cHJpbnQgcGx1cyBhIDIgbSBwcmVwYXJhdGlvbiBidWZmZXIuXG4gICAgeyB4MDogLTQwLCB6MDogLTQ0LCB4MTogLTI1LCB6MTogLTMzLCB5MDogMTAsIHkxOiAyMCB9LFxuICBdLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBNMDAyV29ybGQge1xuICB3b3JsZDogV29ybGQ7XG4gIGxheW91dDogTTAwMkxheW91dDtcbiAgLyoqIFNvcnRlZCBjaHVuayBrZXlzIG1hdGVyaWFsaXNlZCBhdCBmaXh0dXJlIGNyZWF0aW9uLiAqL1xuICBjaHVua0tleXM6IHN0cmluZ1tdO1xufVxuXG4vKipcbiAqIFNtYWxsIGRldGVybWluaXN0aWMgZml4dHVyZTogdGhlIDIwIGNodW5rcyBjb3ZlcmluZyB0aGUgd29yayB6b25lIGFuZCBpdHNcbiAqIHByb3RlY3RlZCBzdXJyb3VuZGluZ3MuIEZhc3QgZW5vdWdoIGZvciB0aGUgZnVsbCB0ZXN0IHN1aXRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTTAwMkZpeHR1cmUoc2VlZCA9IE0wMDJfU0VFRCk6IE0wMDJXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQoc2VlZCk7XG4gIGNvbnN0IHsgY3gwLCBjejAsIGN4MSwgY3oxIH0gPSBNMDAyX0xBWU9VVC5maXh0dXJlQ2h1bmtzO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykgZ2VuZXJhdGVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4geyB3b3JsZCwgbGF5b3V0OiBNMDAyX0xBWU9VVCwgY2h1bmtLZXlzOiBjaHVua0tleXMod29ybGQpIH07XG59XG5cbi8qKlxuICogTGl2ZS13b3JsZCBpbnRlZ3JhdGlvbiB0YXJnZXQ6IHRoZSBzYW1lIHNlZWQgYW5kIHNpdGVzIHdpdGggYSA5IHggOSBjaHVua1xuICogbmVpZ2hib3VyaG9vZCAoODEgY2h1bmtzKSBhcm91bmQgdGhlIGZvdW5kZXIgdmFsbGV5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTTAwMkxpdmUoc2VlZCA9IE0wMDJfU0VFRCwgcmFkaXVzID0gNCk6IE0wMDJXb3JsZCB7XG4gIGNvbnN0IHdvcmxkID0gZ2VuZXJhdGVXb3JsZChzZWVkLCByYWRpdXMpO1xuICByZXR1cm4geyB3b3JsZCwgbGF5b3V0OiBNMDAyX0xBWU9VVCwgY2h1bmtLZXlzOiBjaHVua0tleXMod29ybGQpIH07XG59XG4iLCAiLy8gTTAwMiBzdGFnZSA3IHNjZW5hcmlvIHdpcmluZzogdGhlIHBpbm5lZCBmaXJzdCBzbGljZSwgcnVuIHRocm91Z2ggdGhlIHNhbWVcbi8vIHB1YmxpYyBzaW11bGF0aW9uIHBpcGVsaW5lIHVzZWQgYnkgdGhlIHBsYXllciwgdGhlIEFJIGFuZCB0aGUgdGVzdHMuXG4vL1xuLy8gVGhlIHNjZW5hcmlvIGlzIGRlbGliZXJhdGVseSBwbGFpbiBkYXRhIGluIC8gZGF0YSBvdXQuIEl0IGRvZXMgbm90IHRvdWNoIHRoZVxuLy8gcmVuZGVyZXIsIGFuZCBldmVyeSB0ZXJyYWluIGVkaXQgc3RpbGwgZ29lcyB0aHJvdWdoIHByZXBhcmVTaXRlIC0+XG4vLyBMb2NhbEF1dGhvcml6ZXIgLT4gZXhlY3V0ZVByZXBhcmF0aW9uLiBTdHJ1Y3R1cmVzIHN0aWxsIGdvIHRocm91Z2hcbi8vIGJ1aWxkU3RydWN0dXJlIC0+IExvY2FsU3RydWN0dXJlQXV0aG9yaXplciAtPiBleGVjdXRlU3RydWN0dXJlLlxuaW1wb3J0IHsgTUFULCBSZXNvdXJjZVR5cGUgfSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIE0wMDJXb3JsZCwgTTAwMl9MQVlPVVQsIE0wMDJfUEFUSF9QUk9GSUxFLCBNMDAyX1BBVEhfU0lURV9JRCxcbiAgTTAwMl9URVJSQUNFX0JBTkRTLFxufSBmcm9tICcuL20wMDInO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBIT1VTRV9SVUxFUywgUEFUSF9SVUxFUywgRkFSTV9SVUxFUyB9IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7XG4gIENvbHVtblRhcmdldCwgTG9jYWxBdXRob3JpemVyLCBwcmVwYXJlU2l0ZSwgUHJlcGFyYXRpb25MZWRnZXIsXG59IGZyb20gJy4vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHtcbiAgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLCBidWlsZFN0cnVjdHVyZSwgU3RydWN0dXJlTGVkZ2VyLFxufSBmcm9tICcuL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHtcbiAgY2Fub25pY2FsRW50aXR5SGFzaCwgY2Fub25pY2FsSW52ZW50b3J5SGFzaCwgY2Fub25pY2FsUmVnaW9uSGFzaCxcbiAgY2Fub25pY2FsU3RydWN0dXJlSGFzaCwgaW52ZW50b3J5U25hcHNob3QsXG59IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IGNvbnN0IE0wMDJfU1RBUlRFUl9JTlZFTlRPUlk6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIG51bWJlcj4+ID0ge1xuICB3b29kOiAyNCxcbiAgc3RvbmU6IDQ4LFxufTtcblxuLyoqIFRoZSA5IHggMyBtIGNvcnJpZG9yIGZyb20gdGhlIGhvdXNlIGRvb3IgdG8gdGhlIGFwcHJvYWNoLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJQYXRoUmVjdCgpOiBSZWN0IHtcbiAgY29uc3QgZG9vciA9IE0wMDJfTEFZT1VULmhvdXNlLmRvb3I7XG4gIGNvbnN0IGFwcHJvYWNoID0gTTAwMl9MQVlPVVQuaG91c2UuYXBwcm9hY2g7XG4gIHJldHVybiB7XG4gICAgeDA6IGRvb3IueCxcbiAgICB6MDogZG9vci56IC0gMSxcbiAgICB4MTogYXBwcm9hY2gueCxcbiAgICB6MTogZG9vci56ICsgMSxcbiAgfTtcbn1cblxuLyoqIE9uZSB0YXJnZXQgcGVyIHBhdGggY29sdW1uLCB1c2luZyB0aGUgcGlubmVkIHN0ZXBwZWQgcHJvZmlsZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyUGF0aFRhcmdldHMoKTogQ29sdW1uVGFyZ2V0W10ge1xuICBjb25zdCByZWN0ID0gbTAwMlBhdGhSZWN0KCk7XG4gIGNvbnN0IHRhcmdldHM6IENvbHVtblRhcmdldFtdID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgTTAwMl9QQVRIX1BST0ZJTEUubGVuZ3RoOyBpKyspIHtcbiAgICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICAgIHRhcmdldHMucHVzaCh7IHg6IHJlY3QueDAgKyBpLCB6LCB5OiBNMDAyX1BBVEhfUFJPRklMRVtpXSB9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRhcmdldHM7XG59XG5cbi8qKiBPbmUgdGFyZ2V0IHBlciBmYXJtIGNvbHVtbiwgdXNpbmcgdGhlIHBpbm5lZCB0ZXJyYWNlIGJhbmRzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJGYXJtVGFyZ2V0cygpOiBDb2x1bW5UYXJnZXRbXSB7XG4gIGNvbnN0IHJlY3QgPSBNMDAyX0xBWU9VVC5mYXJtLnJlY3Q7XG4gIGNvbnN0IHRhcmdldHM6IENvbHVtblRhcmdldFtdID0gW107XG4gIGZvciAoY29uc3QgYmFuZCBvZiBNMDAyX1RFUlJBQ0VfQkFORFMpIHtcbiAgICBmb3IgKGxldCB6ID0gYmFuZC56MDsgeiA8PSBiYW5kLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgICAgICB0YXJnZXRzLnB1c2goeyB4LCB6LCB5OiBiYW5kLnkgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiB0YXJnZXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJTY2VuYXJpb09wdGlvbnMge1xuICAvKiogU3RhcnRlciByZXNvdXJjZXMgYmVmb3JlIHRoZSBzbGljZSBydW5zLiBEZWZhdWx0cyB0byB3b29kIDI0IC8gc3RvbmUgNDguICovXG4gIGludmVudG9yeT86IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMlNjZW5hcmlvU2l0ZSB7XG4gIHByZXBhcmF0aW9uOiBQcmVwYXJhdGlvbkxlZGdlciB8IG51bGw7XG4gIHN0cnVjdHVyZTogU3RydWN0dXJlTGVkZ2VyIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyU2NlbmFyaW9SZXN1bHQge1xuICBvazogYm9vbGVhbjtcbiAgZXJyb3JzOiBzdHJpbmdbXTtcbiAgaG91c2U6IE0wMDJTY2VuYXJpb1NpdGU7XG4gIHBhdGg6IE0wMDJTY2VuYXJpb1NpdGU7XG4gIGZhcm06IE0wMDJTY2VuYXJpb1NpdGU7XG4gIGludmVudG9yeUJlZm9yZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgaW52ZW50b3J5QWZ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGhhc2hlczoge1xuICAgIHZveGVsczogc3RyaW5nO1xuICAgIHN0cnVjdHVyZXM6IHN0cmluZztcbiAgICBpbnZlbnRvcnk6IHN0cmluZztcbiAgICBlbnRpdGllczogc3RyaW5nO1xuICB9O1xufVxuXG5mdW5jdGlvbiBlbXB0eVNpdGUoKTogTTAwMlNjZW5hcmlvU2l0ZSB7XG4gIHJldHVybiB7IHByZXBhcmF0aW9uOiBudWxsLCBzdHJ1Y3R1cmU6IG51bGwgfTtcbn1cblxuZnVuY3Rpb24gZGVzY3JpYmVGYWlsdXJlKHJlc3VsdDogeyBjb2RlOiBzdHJpbmc7IHJlYXNvbnM6IHN0cmluZ1tdIH0pOiBzdHJpbmcge1xuICByZXR1cm4gYCR7cmVzdWx0LmNvZGV9OiAke3Jlc3VsdC5yZWFzb25zLmpvaW4oJzsgJyl9YDtcbn1cblxuLyoqXG4gKiBSdW4gaG91c2UsIHBhdGggYW5kIHRlcnJhY2VkIGZhcm0gaW4gdGhlaXIgcGlubmVkIG9yZGVyLiBBIGZhaWxlZCBzdGVwIGlzXG4gKiByZWNvcmRlZCBhbmQgbGF0ZXIgaW5kZXBlbmRlbnQgc3RlcHMgc3RpbGwgcnVuOyBhIHN0cnVjdHVyZSBpcyBuZXZlciBidWlsdFxuICogdW5sZXNzIGl0cyBvd24gdGVycmFpbiBwcmVwYXJhdGlvbiBzdWNjZWVkZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBydW5NMDAyU2NlbmFyaW8oXG4gIG0wMDI6IE0wMDJXb3JsZCwgb3B0aW9uczogTTAwMlNjZW5hcmlvT3B0aW9ucyA9IHt9LFxuKTogTTAwMlNjZW5hcmlvUmVzdWx0IHtcbiAgY29uc3QgeyB3b3JsZCwgbGF5b3V0IH0gPSBtMDAyO1xuICBjb25zdCBzdGFydGVyID0gb3B0aW9ucy5pbnZlbnRvcnkgPz8gTTAwMl9TVEFSVEVSX0lOVkVOVE9SWTtcbiAgd29ybGQuaW52ZW50b3J5ID0ge307XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHN0YXJ0ZXIpKSB7XG4gICAgaWYgKChhbW91bnQgPz8gMCkgPiAwKSB3b3JsZC5pbnZlbnRvcnlbcmVzb3VyY2VdID0gYW1vdW50IGFzIG51bWJlcjtcbiAgfVxuXG4gIGNvbnN0IHByZXBBdXRob3JpemVyID0gbmV3IExvY2FsQXV0aG9yaXplcih7IGVudmVsb3BlOiBsYXlvdXQuZW52ZWxvcGUgfSk7XG4gIGNvbnN0IHN0cnVjdHVyZUF1dGhvcml6ZXIgPSBuZXcgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyKHsgZW52ZWxvcGU6IGxheW91dC5lbnZlbG9wZSB9KTtcbiAgY29uc3QgaW52ZW50b3J5QmVmb3JlID0gaW52ZW50b3J5U25hcHNob3Qod29ybGQpO1xuICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGhvdXNlID0gZW1wdHlTaXRlKCk7XG4gIGNvbnN0IHBhdGggPSBlbXB0eVNpdGUoKTtcbiAgY29uc3QgZmFybSA9IGVtcHR5U2l0ZSgpO1xuXG4gIGNvbnN0IGhvdXNlUHJlcCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwge1xuICAgIHNpdGVJZDogbGF5b3V0LmhvdXNlLmlkLFxuICAgIHJlY3Q6IGxheW91dC5ob3VzZS5yZWN0LFxuICAgIGZsb29yWTogbGF5b3V0LmhvdXNlLmZsb29yWSxcbiAgICBydWxlczogSE9VU0VfUlVMRVMsXG4gIH0pO1xuICBpZiAoIWhvdXNlUHJlcC5vaykge1xuICAgIGVycm9ycy5wdXNoKGBob3VzZSBwcmVwYXJhdGlvbjogJHtkZXNjcmliZUZhaWx1cmUoaG91c2VQcmVwKX1gKTtcbiAgfSBlbHNlIHtcbiAgICBob3VzZS5wcmVwYXJhdGlvbiA9IGhvdXNlUHJlcC5sZWRnZXI7XG4gICAgY29uc3QgaG91c2VCdWlsZCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCB7XG4gICAgICBzaXRlSWQ6IGxheW91dC5ob3VzZS5pZCxcbiAgICAgIGtpbmQ6ICdob3VzZScsXG4gICAgICByZWN0OiBsYXlvdXQuaG91c2UucmVjdCxcbiAgICAgIGZsb29yWTogbGF5b3V0LmhvdXNlLmZsb29yWSxcbiAgICAgIGRvb3I6IGxheW91dC5ob3VzZS5kb29yLFxuICAgIH0pO1xuICAgIGlmICghaG91c2VCdWlsZC5vaykge1xuICAgICAgZXJyb3JzLnB1c2goYGhvdXNlIHN0cnVjdHVyZTogJHtkZXNjcmliZUZhaWx1cmUoaG91c2VCdWlsZCl9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhvdXNlLnN0cnVjdHVyZSA9IGhvdXNlQnVpbGQubGVkZ2VyO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHBhdGhSZWN0ID0gbTAwMlBhdGhSZWN0KCk7XG4gIGNvbnN0IHBhdGhQcmVwID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCB7XG4gICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICByZWN0OiBwYXRoUmVjdCxcbiAgICBmbG9vclk6IDEyLFxuICAgIHJ1bGVzOiBQQVRIX1JVTEVTLFxuICB9LCB7XG4gICAgdGFyZ2V0czogbTAwMlBhdGhUYXJnZXRzKCksXG4gICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuR1JBVkVMLFxuICAgIGVudmVsb3BlOiBbbGF5b3V0LmVudmVsb3BlWzFdXSxcbiAgfSk7XG4gIGlmICghcGF0aFByZXAub2spIHtcbiAgICBlcnJvcnMucHVzaChgcGF0aCBwcmVwYXJhdGlvbjogJHtkZXNjcmliZUZhaWx1cmUocGF0aFByZXApfWApO1xuICB9IGVsc2Uge1xuICAgIHBhdGgucHJlcGFyYXRpb24gPSBwYXRoUHJlcC5sZWRnZXI7XG4gICAgY29uc3QgcGF0aEJ1aWxkID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHtcbiAgICAgIHNpdGVJZDogTTAwMl9QQVRIX1NJVEVfSUQsXG4gICAgICBraW5kOiAncGF0aCcsXG4gICAgICByZWN0OiBwYXRoUmVjdCxcbiAgICAgIGZsb29yWTogMTIsXG4gICAgfSk7XG4gICAgaWYgKCFwYXRoQnVpbGQub2spIHtcbiAgICAgIGVycm9ycy5wdXNoKGBwYXRoIHN0cnVjdHVyZTogJHtkZXNjcmliZUZhaWx1cmUocGF0aEJ1aWxkKX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcGF0aC5zdHJ1Y3R1cmUgPSBwYXRoQnVpbGQubGVkZ2VyO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZhcm1QcmVwID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCB7XG4gICAgc2l0ZUlkOiBsYXlvdXQuZmFybS5pZCxcbiAgICByZWN0OiBsYXlvdXQuZmFybS5yZWN0LFxuICAgIGZsb29yWTogMTUsXG4gICAgcnVsZXM6IEZBUk1fUlVMRVMsXG4gIH0sIHtcbiAgICB0YXJnZXRzOiBtMDAyRmFybVRhcmdldHMoKSxcbiAgICBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5TT0lMLFxuICAgIGVudmVsb3BlOiBbbGF5b3V0LmVudmVsb3BlWzJdXSxcbiAgfSk7XG4gIGlmICghZmFybVByZXAub2spIHtcbiAgICBlcnJvcnMucHVzaChgZmFybSBwcmVwYXJhdGlvbjogJHtkZXNjcmliZUZhaWx1cmUoZmFybVByZXApfWApO1xuICB9IGVsc2Uge1xuICAgIGZhcm0ucHJlcGFyYXRpb24gPSBmYXJtUHJlcC5sZWRnZXI7XG4gICAgY29uc3QgZmFybUJ1aWxkID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHtcbiAgICAgIHNpdGVJZDogbGF5b3V0LmZhcm0uaWQsXG4gICAgICBraW5kOiAndGVycmFjZScsXG4gICAgICByZWN0OiBsYXlvdXQuZmFybS5yZWN0LFxuICAgICAgZmxvb3JZOiAxNSxcbiAgICAgIHRlcnJhY2VzOiBsYXlvdXQuZmFybS50ZXJyYWNlcyxcbiAgICB9KTtcbiAgICBpZiAoIWZhcm1CdWlsZC5vaykge1xuICAgICAgZXJyb3JzLnB1c2goYGZhcm0gc3RydWN0dXJlOiAke2Rlc2NyaWJlRmFpbHVyZShmYXJtQnVpbGQpfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBmYXJtLnN0cnVjdHVyZSA9IGZhcm1CdWlsZC5sZWRnZXI7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogZXJyb3JzLmxlbmd0aCA9PT0gMCxcbiAgICBlcnJvcnMsXG4gICAgaG91c2UsXG4gICAgcGF0aCxcbiAgICBmYXJtLFxuICAgIGludmVudG9yeUJlZm9yZSxcbiAgICBpbnZlbnRvcnlBZnRlcjogaW52ZW50b3J5U25hcHNob3Qod29ybGQpLFxuICAgIGhhc2hlczoge1xuICAgICAgdm94ZWxzOiBjYW5vbmljYWxSZWdpb25IYXNoKHdvcmxkLCBsYXlvdXQucHJvdGVjdGVkUmVnaW9uKS5oYXNoLFxuICAgICAgc3RydWN0dXJlczogY2Fub25pY2FsU3RydWN0dXJlSGFzaCh3b3JsZCksXG4gICAgICBpbnZlbnRvcnk6IGNhbm9uaWNhbEludmVudG9yeUhhc2god29ybGQpLFxuICAgICAgZW50aXRpZXM6IGNhbm9uaWNhbEVudGl0eUhhc2god29ybGQsIGxheW91dC5wcm90ZWN0ZWRSZWdpb24pLFxuICAgIH0sXG4gIH07XG59XG5cbi8qKiBUb3RhbCByZXNvdXJjZXMgcGFpZCB0byBzdHJ1Y3R1cmVzIGluIGEgc2NlbmFyaW8gcmVzdWx0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG0wMDJTdHJ1Y3R1cmVDb3N0cyhyZXN1bHQ6IE0wMDJTY2VuYXJpb1Jlc3VsdCk6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4ge1xuICBjb25zdCB0b3RhbDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHt9O1xuICBmb3IgKGNvbnN0IHNpdGUgb2YgW3Jlc3VsdC5ob3VzZSwgcmVzdWx0LnBhdGgsIHJlc3VsdC5mYXJtXSkge1xuICAgIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHNpdGUuc3RydWN0dXJlPy5jb3N0UGFpZCA/PyB7fSkpIHtcbiAgICAgIHRvdGFsW3Jlc291cmNlIGFzIFJlc291cmNlVHlwZV0gPSAodG90YWxbcmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlXSA/PyAwKSArIChhbW91bnQgPz8gMCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB0b3RhbDtcbn1cbiIsICIvLyBTY2hlbWEtMyBsaWZlIGxvb3AuIEFsbCBxdWFudGl0aWVzIGFyZSBpbnRlZ2VycyBhbmQgYWxsIG11dGF0aW9ucyBhcmUgZHJpdmVuXG4vLyBieSBhY2NlcHRlZCBjb21tYW5kczsgd2FsbC1jbG9jayB0aW1lIGFuZCByZW5kZXJpbmcgbmV2ZXIgYWR2YW5jZSB0aGlzIHN0YXRlLlxuaW1wb3J0IHR5cGUgeyBXb3JsZCB9IGZyb20gJy4vd29ybGQnO1xuXG5leHBvcnQgY29uc3QgTElGRV9SRVNPVVJDRVMgPSBbJ2ZpYmVyJywgJ2Zvb2QnLCAnb3JlJywgJ3JhdGlvbnMnLCAnc2VlZCcsICdzdG9uZScsICd3b29kJ10gYXMgY29uc3Q7XG5leHBvcnQgdHlwZSBMaWZlUmVzb3VyY2UgPSAodHlwZW9mIExJRkVfUkVTT1VSQ0VTKVtudW1iZXJdO1xuZXhwb3J0IGNvbnN0IENBUlJJRURfQ0FQQUNJVFkgPSAxMjA7XG5leHBvcnQgY29uc3QgU1RPQ0tQSUxFX0NBUEFDSVRZID0gMjAwO1xuZXhwb3J0IGNvbnN0IE1BWF9QUk9EVUNUSU9OX0pPQlMgPSAxNjtcbmV4cG9ydCBjb25zdCBNQVhfVElDS1NfUEVSX0NPTU1BTkQgPSA2NDtcbmV4cG9ydCBjb25zdCBDUk9QX0dST1dUSF9USUNLUyA9IDQ7XG5leHBvcnQgY29uc3QgRk9VTkRFUl9TVE9DS1BJTEVfSUQgPSAnc3RvY2twaWxlOmZvdW5kZXInO1xuZXhwb3J0IGNvbnN0IEZPVU5ERVJfU1RPQ0tQSUxFID0geyBpZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHg6IC01MCwgejogLTMyLCBjYXBhY2l0eTogU1RPQ0tQSUxFX0NBUEFDSVRZIH0gYXMgY29uc3Q7XG5cbmV4cG9ydCB0eXBlIExpZmVSZXNvdXJjZUJhZyA9IFBhcnRpYWw8UmVjb3JkPExpZmVSZXNvdXJjZSwgbnVtYmVyPj47XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvY2twaWxlIHtcbiAgaWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGNhcGFjaXR5OiB0eXBlb2YgU1RPQ0tQSUxFX0NBUEFDSVRZO1xuICBpbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG59XG5cbmV4cG9ydCB0eXBlIFJlY2lwZUlkID0gJ3NlZWQnIHwgJ3JhdGlvbnMnO1xuZXhwb3J0IGNvbnN0IFJFQ0lQRVM6IFJlY29yZDxSZWNpcGVJZCwgeyBpbnB1dDogTGlmZVJlc291cmNlQmFnOyBvdXRwdXQ6IExpZmVSZXNvdXJjZUJhZzsgdGlja3M6IG51bWJlciB9PiA9IHtcbiAgc2VlZDogeyBpbnB1dDogeyBmaWJlcjogMiB9LCBvdXRwdXQ6IHsgc2VlZDogMyB9LCB0aWNrczogMSB9LFxuICByYXRpb25zOiB7IGlucHV0OiB7IGZvb2Q6IDIgfSwgb3V0cHV0OiB7IHJhdGlvbnM6IDMgfSwgdGlja3M6IDIgfSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZHVjdGlvbkpvYiB7XG4gIGlkOiBzdHJpbmc7XG4gIHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gIHJlY2lwZTogUmVjaXBlSWQ7XG4gIHJlbWFpbmluZ1RpY2tzOiBudW1iZXI7XG59XG5cbi8qKiBGaXhlZCBwbG90cyBjb3JyZXNwb25kIHRvIHRoZSBuaW5lIGF1dGhvcml0YXRpdmUgdGVycmFjZSBjcm9wLXJvdyB2b2x1bWVzLiAqL1xuZXhwb3J0IGNvbnN0IENST1BfUExPVF9JRFMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA5IH0sIChfLCBpKSA9PiBgY3JvcDoke2l9YCk7XG5leHBvcnQgaW50ZXJmYWNlIENyb3BQbG90IHtcbiAgaWQ6IHN0cmluZztcbiAgcGxhbnRlZFRpY2s6IG51bWJlcjtcbiAgZ3Jvd3RoVGlja3M6IHR5cGVvZiBDUk9QX0dST1dUSF9USUNLUztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBMaWZlU3RhdGUge1xuICBzdG9ja3BpbGVzOiBNYXA8c3RyaW5nLCBTdG9ja3BpbGU+O1xuICBqb2JzOiBNYXA8c3RyaW5nLCBQcm9kdWN0aW9uSm9iPjtcbiAgY3JvcHM6IE1hcDxzdHJpbmcsIENyb3BQbG90PjtcbiAgdGljazogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTGlmZVN0YXRlKCk6IExpZmVTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgc3RvY2twaWxlczogbmV3IE1hcChbW0ZPVU5ERVJfU1RPQ0tQSUxFX0lELCB7XG4gICAgICBpZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHg6IEZPVU5ERVJfU1RPQ0tQSUxFLngsIHo6IEZPVU5ERVJfU1RPQ0tQSUxFLnosXG4gICAgICBjYXBhY2l0eTogU1RPQ0tQSUxFX0NBUEFDSVRZLCBpbnZlbnRvcnk6IHt9LFxuICAgIH1dXSksIGpvYnM6IG5ldyBNYXAoKSwgY3JvcHM6IG5ldyBNYXAoKSwgdGljazogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvdGFsKGJhZzogUmVjb3JkPHN0cmluZywgbnVtYmVyPik6IG51bWJlciB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKGJhZykucmVkdWNlKChzdW0sIGFtb3VudCkgPT4gc3VtICsgYW1vdW50LCAwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lQmFnKGJhZzogUmVjb3JkPHN0cmluZywgbnVtYmVyPik6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICByZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKGJhZykuZmlsdGVyKChbLCBhbW91bnRdKSA9PiBhbW91bnQgPiAwKVxuICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsaWZlU3RhdGUod29ybGQ6IFdvcmxkKTogTGlmZVN0YXRlIHtcbiAgaWYgKCF3b3JsZC5saWZlKSB0aHJvdyBuZXcgRXJyb3IoJ2xpZmUtbG9vcCBjb21tYW5kcyByZXF1aXJlIGEgc2NoZW1hLTMgd29ybGQnKTtcbiAgcmV0dXJuIHdvcmxkLmxpZmU7XG59XG5cbmV4cG9ydCB0eXBlIExpZmVGYWlsdXJlID0geyBvazogZmFsc2U7IGNvZGU6IHN0cmluZzsgcmVhc29uczogc3RyaW5nW10gfTtcbmV4cG9ydCB0eXBlIExpZmVTdWNjZXNzPFQ+ID0geyBvazogdHJ1ZTsgdmFsdWU6IFQgfTtcbmV4cG9ydCB0eXBlIExpZmVSZXN1bHQ8VD4gPSBMaWZlU3VjY2VzczxUPiB8IExpZmVGYWlsdXJlO1xuZnVuY3Rpb24gcmVqZWN0TGlmZShjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogTGlmZUZhaWx1cmUge1xuICByZXR1cm4geyBvazogZmFsc2UsIGNvZGUsIHJlYXNvbnMgfTtcbn1cbnR5cGUgUGFyc2VkQW1vdW50ID0geyBvazogdHJ1ZTsgcmVzb3VyY2U6IExpZmVSZXNvdXJjZTsgYW1vdW50OiBudW1iZXIgfSB8IHsgb2s6IGZhbHNlOyByZWFzb25zOiBzdHJpbmdbXSB9O1xuZnVuY3Rpb24gcmVxdWlyZUFtb3VudChiYWc6IExpZmVSZXNvdXJjZUJhZyk6IFBhcnNlZEFtb3VudCB7XG4gIGNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyhiYWcpO1xuICBpZiAoZW50cmllcy5sZW5ndGggIT09IDEpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uczogWyd0cmFuc2ZlciBleGFjdGx5IG9uZSByZXNvdXJjZSBhdCBhIHRpbWUnXSB9O1xuICBjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gPSBlbnRyaWVzWzBdO1xuICBpZiAoIUxJRkVfUkVTT1VSQ0VTLmluY2x1ZGVzKHJlc291cmNlIGFzIExpZmVSZXNvdXJjZSkgfHwgIU51bWJlci5pc1NhZmVJbnRlZ2VyKGFtb3VudCkgfHwgKGFtb3VudCA/PyAwKSA8PSAwKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb25zOiBbJ3Jlc291cmNlIGFtb3VudCBtdXN0IGJlIGEgcG9zaXRpdmUgaW50ZWdlciddIH07XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIHJlc291cmNlOiByZXNvdXJjZSBhcyBMaWZlUmVzb3VyY2UsIGFtb3VudCB9O1xufVxuXG5mdW5jdGlvbiBtb3ZlKHdvcmxkOiBXb3JsZCwgZnJvbTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiwgdG86IFJlY29yZDxzdHJpbmcsIG51bWJlcj4sXG4gIHJlcXVlc3RlZDogTGlmZVJlc291cmNlQmFnLCB0b0NhcGFjaXR5OiBudW1iZXIpOiBMaWZlUmVzdWx0PExpZmVSZXNvdXJjZUJhZz4ge1xuICBjb25zdCBjaGVja2VkID0gcmVxdWlyZUFtb3VudChyZXF1ZXN0ZWQpO1xuICBpZiAoIWNoZWNrZWQub2spIHJldHVybiByZWplY3RMaWZlKCdpbnZhbGlkX3RyYW5zZmVyJywgW2NoZWNrZWQucmVhc29uc1swXV0pO1xuICBjb25zdCB7IHJlc291cmNlLCBhbW91bnQgfSA9IGNoZWNrZWQ7XG4gIGlmICgoZnJvbVtyZXNvdXJjZV0gPz8gMCkgPCBhbW91bnQpIHJldHVybiByZWplY3RMaWZlKCdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJywgW2BuZWVkICR7YW1vdW50fSAke1N0cmluZyhyZXNvdXJjZSl9LCBoYXZlICR7ZnJvbVtyZXNvdXJjZV0gPz8gMH1gXSk7XG4gIGlmICh0b3RhbCh0bykgKyBhbW91bnQgPiB0b0NhcGFjaXR5KSByZXR1cm4gcmVqZWN0TGlmZSgnY2FwYWNpdHlfZXhjZWVkZWQnLCBbYGRlc3RpbmF0aW9uIGNhcGFjaXR5ICR7dG9DYXBhY2l0eX0gd291bGQgYmUgZXhjZWVkZWRgXSk7XG4gIGZyb21bcmVzb3VyY2VdID0gKGZyb21bcmVzb3VyY2VdID8/IDApIC0gYW1vdW50O1xuICBpZiAoZnJvbVtyZXNvdXJjZV0gPT09IDApIGRlbGV0ZSBmcm9tW3Jlc291cmNlXTtcbiAgdG9bcmVzb3VyY2VdID0gKHRvW3Jlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IFtyZXNvdXJjZV06IGFtb3VudCB9IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmFuc2Zlcih3b3JsZDogV29ybGQsIGtpbmQ6ICdkZXBvc2l0JyB8ICd3aXRoZHJhdycsIGJhZzogTGlmZVJlc291cmNlQmFnKTogTGlmZVJlc3VsdDxMaWZlUmVzb3VyY2VCYWc+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChGT1VOREVSX1NUT0NLUElMRV9JRCk7XG4gIGlmICghc3RvY2spIHJldHVybiByZWplY3RMaWZlKCdtaXNzaW5nX3N0b2NrcGlsZScsIFsnZm91bmRlciBzdG9ja3BpbGUgaXMgYWJzZW50J10pO1xuICByZXR1cm4ga2luZCA9PT0gJ2RlcG9zaXQnXG4gICAgPyBtb3ZlKHdvcmxkLCB3b3JsZC5pbnZlbnRvcnksIHN0b2NrLmludmVudG9yeSwgYmFnLCBzdG9jay5jYXBhY2l0eSlcbiAgICA6IG1vdmUod29ybGQsIHN0b2NrLmludmVudG9yeSwgd29ybGQuaW52ZW50b3J5LCBiYWcsIENBUlJJRURfQ0FQQUNJVFkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RhcnRQcm9kdWN0aW9uKHdvcmxkOiBXb3JsZCwgcmVjaXBlSWQ6IFJlY2lwZUlkLCBqb2JJZDogc3RyaW5nKTogTGlmZVJlc3VsdDxQcm9kdWN0aW9uSm9iPiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBjb25zdCBzdG9jayA9IGxpZmUuc3RvY2twaWxlcy5nZXQoRk9VTkRFUl9TVE9DS1BJTEVfSUQpO1xuICBpZiAoIXN0b2NrKSByZXR1cm4gcmVqZWN0TGlmZSgnbWlzc2luZ19zdG9ja3BpbGUnLCBbJ2ZvdW5kZXIgc3RvY2twaWxlIGlzIGFic2VudCddKTtcbiAgaWYgKGxpZmUuam9icy5oYXMoam9iSWQpKSByZXR1cm4gcmVqZWN0TGlmZSgnZHVwbGljYXRlX2pvYicsIFsncHJvZHVjdGlvbiBqb2IgYWxyZWFkeSBleGlzdHMnXSk7XG4gIGlmIChsaWZlLmpvYnMuc2l6ZSA+PSBNQVhfUFJPRFVDVElPTl9KT0JTKSByZXR1cm4gcmVqZWN0TGlmZSgnam9iX2xpbWl0JywgW2BhdCBtb3N0ICR7TUFYX1BST0RVQ1RJT05fSk9CU30gam9icyBtYXkgYmUgYWN0aXZlYF0pO1xuICBjb25zdCByZWNpcGUgPSBSRUNJUEVTW3JlY2lwZUlkXTtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocmVjaXBlLmlucHV0KSkge1xuICAgIGlmICgoc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSA8IChhbW91bnQgPz8gMCkpIHtcbiAgICAgIHJldHVybiByZWplY3RMaWZlKCdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJywgW2BuZWVkICR7YW1vdW50fSAke1N0cmluZyhyZXNvdXJjZSl9LCBoYXZlICR7c3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwfWBdKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgcmVzZXJ2ZWRPdXRwdXQgPSBbLi4ubGlmZS5qb2JzLnZhbHVlcygpXS5maWx0ZXIoKGopID0+IGouc3RvY2twaWxlSWQgPT09IHN0b2NrLmlkKVxuICAgIC5yZWR1Y2UoKHN1bSwgam9iKSA9PiBzdW0gKyB0b3RhbChjbG9uZUJhZyhSRUNJUEVTW2pvYi5yZWNpcGVdLm91dHB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSksIDApO1xuICBpZiAodG90YWwoc3RvY2suaW52ZW50b3J5KSAtIHRvdGFsKGNsb25lQmFnKHJlY2lwZS5pbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSlcbiAgICArIHJlc2VydmVkT3V0cHV0ICsgdG90YWwoY2xvbmVCYWcocmVjaXBlLm91dHB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSkgPiBzdG9jay5jYXBhY2l0eSkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdjYXBhY2l0eV9leGNlZWRlZCcsIFsncmVzZXJ2ZWQgcHJvZHVjdGlvbiBvdXRwdXQgd291bGQgZXhjZWVkIHN0b2NrcGlsZSBjYXBhY2l0eSddKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhyZWNpcGUuaW5wdXQpKSB7XG4gICAgc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA9IChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApIC0gKGFtb3VudCA/PyAwKTtcbiAgICBpZiAoc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA9PT0gMCkgZGVsZXRlIHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV07XG4gIH1cbiAgY29uc3Qgam9iOiBQcm9kdWN0aW9uSm9iID0geyBpZDogam9iSWQsIHN0b2NrcGlsZUlkOiBzdG9jay5pZCwgcmVjaXBlOiByZWNpcGVJZCwgcmVtYWluaW5nVGlja3M6IHJlY2lwZS50aWNrcyB9O1xuICBsaWZlLmpvYnMuc2V0KGpvYi5pZCwgam9iKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB7IC4uLmpvYiB9IH07XG59XG5cbi8qKiBQbGFudCBpbnRvIGFuIGVtcHR5IGZpeGVkIHRlcnJhY2UgcGxvdC4gVGhlIGZvdW5kZXIgZmFybSBtdXN0IGFscmVhZHkgZXhpc3QuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhbnRDcm9wKHdvcmxkOiBXb3JsZCwgcGxvdElkOiBzdHJpbmcpOiBMaWZlUmVzdWx0PENyb3BQbG90PiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBpZiAoIUNST1BfUExPVF9JRFMuaW5jbHVkZXMocGxvdElkKSkgcmV0dXJuIHJlamVjdExpZmUoJ2ludmFsaWRfcGxvdCcsIFsndW5rbm93biBjcm9wIHBsb3QnXSk7XG4gIGlmICghWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvbWUoKHMpID0+IHMua2luZCA9PT0gJ3RlcnJhY2UnKSkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdmYXJtX3JlcXVpcmVkJywgWydidWlsZCB0aGUgZm91bmRlciB0ZXJyYWNlZCBmYXJtIGJlZm9yZSBwbGFudGluZyddKTtcbiAgfVxuICBpZiAobGlmZS5jcm9wcy5oYXMocGxvdElkKSkgcmV0dXJuIHJlamVjdExpZmUoJ3Bsb3Rfb2NjdXBpZWQnLCBbJ2Nyb3AgcGxvdCBpcyBhbHJlYWR5IHBsYW50ZWQnXSk7XG4gIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChGT1VOREVSX1NUT0NLUElMRV9JRCk7XG4gIGlmICghc3RvY2sgfHwgKHN0b2NrLmludmVudG9yeS5zZWVkID8/IDApIDwgMSkgcmV0dXJuIHJlamVjdExpZmUoJ2luc3VmZmljaWVudF9yZXNvdXJjZXMnLCBbJ25lZWQgMSBzZWVkIGluIHRoZSBmb3VuZGVyIHN0b2NrcGlsZSddKTtcbiAgc3RvY2suaW52ZW50b3J5LnNlZWQhLS07XG4gIGlmIChzdG9jay5pbnZlbnRvcnkuc2VlZCA9PT0gMCkgZGVsZXRlIHN0b2NrLmludmVudG9yeS5zZWVkO1xuICBjb25zdCBjcm9wOiBDcm9wUGxvdCA9IHsgaWQ6IHBsb3RJZCwgcGxhbnRlZFRpY2s6IGxpZmUudGljaywgZ3Jvd3RoVGlja3M6IENST1BfR1JPV1RIX1RJQ0tTIH07XG4gIGxpZmUuY3JvcHMuc2V0KHBsb3RJZCwgY3JvcCk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyAuLi5jcm9wIH0gfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyb3BSZWFkeShjcm9wOiBDcm9wUGxvdCwgdGljazogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB0aWNrIC0gY3JvcC5wbGFudGVkVGljayA+PSBjcm9wLmdyb3d0aFRpY2tzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFydmVzdENyb3Aod29ybGQ6IFdvcmxkLCBwbG90SWQ6IHN0cmluZyk6IExpZmVSZXN1bHQ8eyBmb29kOiBudW1iZXI7IGZpYmVyOiBudW1iZXIgfT4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgY29uc3QgY3JvcCA9IGxpZmUuY3JvcHMuZ2V0KHBsb3RJZCk7XG4gIGlmICghY3JvcCkgcmV0dXJuIHJlamVjdExpZmUoJ25vdF9wbGFudGVkJywgWydjcm9wIHBsb3QgaXMgZW1wdHknXSk7XG4gIGlmICghY3JvcFJlYWR5KGNyb3AsIGxpZmUudGljaykpIHJldHVybiByZWplY3RMaWZlKCdjcm9wX25vdF9yZWFkeScsIFtgY3JvcCBuZWVkcyAke2Nyb3AuZ3Jvd3RoVGlja3MgLSAobGlmZS50aWNrIC0gY3JvcC5wbGFudGVkVGljayl9IG1vcmUgdGlja3NgXSk7XG4gIC8vIFBsYW50IGdyb3d0aCBpcyB0aGUgZXhwbGljaXQgYmlvbG9naWNhbCBzb3VyY2U7IGV2ZXJ5IG90aGVyIGxpZmUtbG9vcFxuICAvLyB0cmFuc2Zvcm1hdGlvbiBjb25zZXJ2ZXMgaXRzIGRlY2xhcmVkIGlucHV0cyBhbmQgb3V0cHV0cy5cbiAgY29uc3QgeWllbGRCYWcgPSB7IGZvb2Q6IDYsIGZpYmVyOiAxIH07XG4gIGlmICh0b3RhbCh3b3JsZC5pbnZlbnRvcnkpICsgeWllbGRCYWcuZm9vZCArIHlpZWxkQmFnLmZpYmVyID4gQ0FSUklFRF9DQVBBQ0lUWSkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdjYXBhY2l0eV9leGNlZWRlZCcsIFtgY2FycmllZCBjYXBhY2l0eSAke0NBUlJJRURfQ0FQQUNJVFl9IHdvdWxkIGJlIGV4Y2VlZGVkYF0pO1xuICB9XG4gIHdvcmxkLmludmVudG9yeS5mb29kID0gKHdvcmxkLmludmVudG9yeS5mb29kID8/IDApICsgeWllbGRCYWcuZm9vZDtcbiAgd29ybGQuaW52ZW50b3J5LmZpYmVyID0gKHdvcmxkLmludmVudG9yeS5maWJlciA/PyAwKSArIHlpZWxkQmFnLmZpYmVyO1xuICBsaWZlLmNyb3BzLmRlbGV0ZShwbG90SWQpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHlpZWxkQmFnIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGlja091dGNvbWUge1xuICBmcm9tVGljazogbnVtYmVyO1xuICB0b1RpY2s6IG51bWJlcjtcbiAgY29tcGxldGVkSm9iczogQXJyYXk8eyBpZDogc3RyaW5nOyByZWNpcGU6IFJlY2lwZUlkOyBvdXRwdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfT47XG4gIHJlYWR5Q3JvcHM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpY2tzKHdvcmxkOiBXb3JsZCwgY291bnQ6IG51bWJlcik6IExpZmVSZXN1bHQ8VGlja091dGNvbWU+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGlmICghTnVtYmVyLmlzU2FmZUludGVnZXIoY291bnQpIHx8IGNvdW50IDwgMSB8fCBjb3VudCA+IE1BWF9USUNLU19QRVJfQ09NTUFORCkge1xuICAgIHJldHVybiByZWplY3RMaWZlKCdpbnZhbGlkX3RpY2tfY291bnQnLCBbYHRpY2tzIG11c3QgYmUgYW4gaW50ZWdlciBmcm9tIDEgdG8gJHtNQVhfVElDS1NfUEVSX0NPTU1BTkR9YF0pO1xuICB9XG4gIGNvbnN0IGNvbXBsZXRlZDogVGlja091dGNvbWVbJ2NvbXBsZXRlZEpvYnMnXSA9IFtdO1xuICBjb25zdCBmcm9tVGljayA9IGxpZmUudGljaztcbiAgLy8gSm9icyBhcmUgcHJvY2Vzc2VkIGluIHN0YWJsZSBpZCBvcmRlciBhdCBlYWNoIHRpY2ssIG5ldmVyIG1hcCBpbnNlcnRpb24sXG4gIC8vIHdhbGwgdGltZSwgZnJhbWUgZGVsdGEsIG9yIGFzeW5jaHJvbm91cyBjb21wbGV0aW9uIG9yZGVyLlxuICBmb3IgKGxldCBzdGVwID0gMDsgc3RlcCA8IGNvdW50OyBzdGVwKyspIHtcbiAgICBsaWZlLnRpY2srKztcbiAgICBmb3IgKGNvbnN0IGpvYiBvZiBbLi4ubGlmZS5qb2JzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpKSB7XG4gICAgICBqb2IucmVtYWluaW5nVGlja3MtLTtcbiAgICAgIGlmIChqb2IucmVtYWluaW5nVGlja3MgPiAwKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHN0b2NrID0gbGlmZS5zdG9ja3BpbGVzLmdldChqb2Iuc3RvY2twaWxlSWQpO1xuICAgICAgaWYgKCFzdG9jaykgdGhyb3cgbmV3IEVycm9yKCdhY3RpdmUgcHJvZHVjdGlvbiByZWZlcmVuY2VzIGEgbWlzc2luZyBzdG9ja3BpbGUnKTtcbiAgICAgIGNvbnN0IG91dHB1dCA9IGNsb25lQmFnKFJFQ0lQRVNbam9iLnJlY2lwZV0ub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pO1xuICAgICAgaWYgKHRvdGFsKHN0b2NrLmludmVudG9yeSkgKyB0b3RhbChvdXRwdXQpID4gc3RvY2suY2FwYWNpdHkpIHRocm93IG5ldyBFcnJvcigncmVzZXJ2ZWQgcHJvZHVjdGlvbiBvdXRwdXQgZXhjZWVkcyBjYXBhY2l0eScpO1xuICAgICAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMob3V0cHV0KSkgc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA9IChzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgICAgbGlmZS5qb2JzLmRlbGV0ZShqb2IuaWQpO1xuICAgICAgY29tcGxldGVkLnB1c2goeyBpZDogam9iLmlkLCByZWNpcGU6IGpvYi5yZWNpcGUsIG91dHB1dCB9KTtcbiAgICB9XG4gIH1cbiAgY29uc3QgcmVhZHlDcm9wcyA9IFsuLi5saWZlLmNyb3BzLnZhbHVlcygpXS5maWx0ZXIoKGNyb3ApID0+IGNyb3BSZWFkeShjcm9wLCBsaWZlLnRpY2spXG4gICAgJiYgY3JvcC5wbGFudGVkVGljayArIGNyb3AuZ3Jvd3RoVGlja3MgPiBmcm9tVGljaykubWFwKChjcm9wKSA9PiBjcm9wLmlkKS5zb3J0KCk7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyBmcm9tVGljaywgdG9UaWNrOiBsaWZlLnRpY2ssIGNvbXBsZXRlZEpvYnM6IGNvbXBsZXRlZCwgcmVhZHlDcm9wcyB9IH07XG59XG4iLCAiLy8gVmVyc2lvbmVkLCBKU09OLXNhZmUgc25hcHNob3RzIG9mIGNvbXBsZXRlIGF1dGhvcml0YXRpdmUgTTAwMiBzdGF0ZS5cbi8vIENodW5rIGJ5dGVzLCBoZWlnaHQvbWF0ZXJpYWwgY2FjaGVzLCByZW5kZXJlciBkYXRhIGFuZCB0aW1pbmcgY291bnRlcnMgYXJlXG4vLyByZWdlbmVyYXRlZCBmcm9tIHRoZSBtYW5pZmVzdCBhbmQgZHVyYWJsZSBlZGl0czsgdGhleSBhcmUgbm90IGEgc2Vjb25kIHNhdmUuXG5pbXBvcnQge1xuICBDSFVOS19TSVpFLCBDSFVOS19WT0xVTUUsIENIVU5LU19QRVJfU0lERSwgRW50aXR5LCBFbnRpdHlLaW5kLFxuICBHRU5FUkFUT1JfVkVSU0lPTiwgSEFMRiwgTWF0SWQsIFJlc291cmNlVHlwZSwgV29ybGQsIFdvcmxkTWFuaWZlc3QsXG4gIGNyZWF0ZVdvcmxkLCBwbGFjZUF1dGhvcmVkU2l0ZXMsIHdvcmxkTWFuaWZlc3QsIGVuc3VyZUNodW5rLCBpc1JldGlyZWRTdG9uZUtpbmQsXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiwgU3RydWN0dXJlIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7XG4gIGVuYWJsZVN0b25lUmVwbGF5LCBmaW5pc2hTdG9uZVJlcGxheSwgaXNIaXN0b3JpY2FsU3RvbmVIYXNoLCBpc1N0b25lUmVwbGF5LFxufSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQge1xuICBDQVJSSUVEX0NBUEFDSVRZLCBDUk9QX0dST1dUSF9USUNLUywgQ1JPUF9QTE9UX0lEUywgRk9VTkRFUl9TVE9DS1BJTEUsXG4gIEZPVU5ERVJfU1RPQ0tQSUxFX0lELCBMSUZFX1JFU09VUkNFUywgTUFYX1BST0RVQ1RJT05fSk9CUywgTUFYX1RJQ0tTX1BFUl9DT01NQU5ELFxuICBSRUNJUEVTLCBTVE9DS1BJTEVfQ0FQQUNJVFksIGNyZWF0ZUxpZmVTdGF0ZSxcbn0gZnJvbSAnLi9lY29ub215JztcblxuZXhwb3J0IGNvbnN0IFNOQVBTSE9UX1NDSEVNQSA9IDEgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgREVTSUdOX1NOQVBTSE9UX1NDSEVNQSA9IDIgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgPSAzIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IE1BWF9TTkFQU0hPVF9KU09OX0JZVEVTID0gMjVfMDAwXzAwMDtcbmV4cG9ydCBjb25zdCBNQVhfU05BUFNIT1RfRURJVFMgPSAxXzAwMF8wMDA7XG5leHBvcnQgY29uc3QgTUFYX1NOQVBTSE9UX0VOVElUSUVTID0gNTAwXzAwMDtcblxuaW50ZXJmYWNlIEJhc2VXb3JsZFNuYXBzaG90IHtcbiAgc2NoZW1hOiB0eXBlb2YgU05BUFNIT1RfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUE7XG4gIG1hbmlmZXN0OiBXb3JsZE1hbmlmZXN0O1xuICByZXZpc2lvbjogbnVtYmVyO1xuICBlZGl0czogQXJyYXk8eyBjaHVuazogc3RyaW5nOyBjZWxsczogQXJyYXk8eyBpOiBudW1iZXI7IG06IG51bWJlciB9PiB9PjtcbiAgZW50aXRpZXM6IEVudGl0eVtdO1xuICAvKiogQ2h1bmtzIHdpdGggZHVyYWJsZSBnZW5lcmF0ZWQtZW50aXR5IGNoYW5nZXM7IHB1cmUgcXVlcmllcyBhcmUgZXhjbHVkZWQuICovXG4gIGVudGl0eUNodW5rczogc3RyaW5nW107XG4gIGVudGl0eVJlbW92YWxzOiBzdHJpbmdbXTtcbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBzdHJ1Y3R1cmVzOiBTdHJ1Y3R1cmVbXTtcbiAgYXV0aG9yZWRQbGFjZWQ6IGJvb2xlYW47XG4gIC8qKiBOZXh0IGFjY2VwdGVkIGpvdXJuYWwgc2VxdWVuY2UgYXQgdGhpcyBzbmFwc2hvdCBib3VuZGFyeS4gKi9cbiAgbmV4dFNlcXVlbmNlOiBudW1iZXI7XG59XG5leHBvcnQgdHlwZSBXb3JsZFNuYXBzaG90ID0gQmFzZVdvcmxkU25hcHNob3QgJiAoe1xuICBzY2hlbWE6IHR5cGVvZiBTTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX1NOQVBTSE9UX1NDSEVNQTtcbn0gfCB7XG4gIHNjaGVtYTogdHlwZW9mIENVUlJFTlRfU05BUFNIT1RfU0NIRU1BO1xuICB0aWNrOiBudW1iZXI7XG4gIHN0b2NrcGlsZXM6IEFycmF5PHtcbiAgICBpZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEOyB4OiBudW1iZXI7IHo6IG51bWJlcjtcbiAgICBjYXBhY2l0eTogdHlwZW9mIFNUT0NLUElMRV9DQVBBQ0lUWTsgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICB9PjtcbiAgam9iczogQXJyYXk8e1xuICAgIGlkOiBzdHJpbmc7IHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gICAgcmVjaXBlOiAnc2VlZCcgfCAncmF0aW9ucyc7IHJlbWFpbmluZ1RpY2tzOiBudW1iZXI7XG4gIH0+O1xuICBjcm9wczogQXJyYXk8eyBpZDogc3RyaW5nOyBwbGFudGVkVGljazogbnVtYmVyOyBncm93dGhUaWNrczogdHlwZW9mIENST1BfR1JPV1RIX1RJQ0tTIH0+O1xufSk7XG50eXBlIExpZmVTbmFwc2hvdCA9IEV4dHJhY3Q8V29ybGRTbmFwc2hvdCwgeyBzY2hlbWE6IHR5cGVvZiBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSB9PjtcblxuZnVuY3Rpb24gY2xvbmVFbnRpdHkoZTogRW50aXR5KTogRW50aXR5IHtcbiAgcmV0dXJuIHtcbiAgICBpZDogZS5pZCwga2luZDogZS5raW5kLCBjaHVuazogZS5jaHVuaywgeDogZS54LCB5OiBlLnksIHo6IGUueixcbiAgICByb3Q6IGUucm90LCBzY2FsZTogZS5zY2FsZSwgdmFyaWFudDogZS52YXJpYW50LCByZXNvdXJjZTogZS5yZXNvdXJjZSxcbiAgICByZW1haW5pbmc6IGUucmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3Q6IGUueWllbGRQZXJIYXJ2ZXN0LCBoYXJ2ZXN0ZWQ6IGUuaGFydmVzdGVkLFxuICAgIC4uLihlLmhhcnZlc3RlZE9uY2UgPT09IHVuZGVmaW5lZCA/IHt9IDogeyBoYXJ2ZXN0ZWRPbmNlOiBlLmhhcnZlc3RlZE9uY2UgfSksXG4gICAgcHJvdmlzaW9uYWw6IGUucHJvdmlzaW9uYWwsIGF1dGhvcmVkOiBlLmF1dGhvcmVkLFxuICB9O1xufVxuXG5mdW5jdGlvbiBjbG9uZVN0cnVjdHVyZShzOiBTdHJ1Y3R1cmUpOiBTdHJ1Y3R1cmUge1xuICByZXR1cm4ge1xuICAgIC4uLnMsXG4gICAgbW9kdWxlczogcy5tb2R1bGVzLm1hcCgobSkgPT4gKHsgLi4ubSB9KSksXG4gICAgY29zdDogT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKHMuY29zdCkuZmlsdGVyKChbLCBhbW91bnRdKSA9PiAoYW1vdW50ID8/IDApID4gMClcbiAgICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXb3JsZFNuYXBzaG90KFxuICB3b3JsZDogV29ybGQsIG5leHRTZXF1ZW5jZSA9IDAsXG4gIHNjaGVtYTogV29ybGRTbmFwc2hvdFsnc2NoZW1hJ10gPSB3b3JsZC5saWZlID8gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUFcbiAgICA6IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb21lKChzKSA9PiBzLmRlc2lnblZlcnNpb24gPT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pXG4gICAgICA/IERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEgOiBTTkFQU0hPVF9TQ0hFTUEsXG4pOiBXb3JsZFNuYXBzaG90IHtcbiAgaWYgKHNjaGVtYSAhPT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgJiYgKHdvcmxkLmxpZmUgfHwgWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvbWUoXG4gICAgKHMpID0+IHNjaGVtYSA9PT0gU05BUFNIT1RfU0NIRU1BICYmIHMuZGVzaWduVmVyc2lvbiAhPT0gdW5kZWZpbmVkLFxuICApKSkgdGhyb3cgbmV3IEVycm9yKCdsZWdhY3kgc25hcHNob3RzIGNhbm5vdCBjb250YWluIG5ld2VyIGF1dGhvcml0YXRpdmUgc3RhdGUnKTtcbiAgY29uc3QgYmFzZTogQmFzZVdvcmxkU25hcHNob3QgPSB7XG4gICAgc2NoZW1hLFxuICAgIG1hbmlmZXN0OiB3b3JsZE1hbmlmZXN0KHdvcmxkKSxcbiAgICByZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgZWRpdHM6IFsuLi53b3JsZC5lZGl0cy5lbnRyaWVzKCldLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLm1hcChcbiAgICAgIChbY2h1bmssIGNlbGxzXSkgPT4gKHtcbiAgICAgICAgY2h1bmssXG4gICAgICAgIGNlbGxzOiBbLi4uY2VsbHMuZW50cmllcygpXS5zb3J0KChbYV0sIFtiXSkgPT4gYSAtIGIpLm1hcCgoW2ksIG1dKSA9PiAoeyBpLCBtIH0pKSxcbiAgICAgIH0pLFxuICAgICksXG4gICAgZW50aXRpZXM6IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uZmlsdGVyKChlKSA9PiAoaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkKSB8fCAhaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkpXG4gICAgICAmJiAoZS5hdXRob3JlZCB8fCB3b3JsZC5lbnRpdHlDaGFuZ2VzLmhhcyhlLmNodW5rKSkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKS5tYXAoY2xvbmVFbnRpdHkpLFxuICAgIGVudGl0eUNodW5rczogWy4uLndvcmxkLmVudGl0eUNoYW5nZXNdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gICAgZW50aXR5UmVtb3ZhbHM6IFsuLi53b3JsZC5lbnRpdHlSZW1vdmFsc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSxcbiAgICBpbnZlbnRvcnk6IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyh3b3JsZC5pbnZlbnRvcnkpLmZpbHRlcigoWywgYW1vdW50XSkgPT4gYW1vdW50ID4gMClcbiAgICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSksXG4gICAgc3RydWN0dXJlczogWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKGNsb25lU3RydWN0dXJlKSxcbiAgICBhdXRob3JlZFBsYWNlZDogd29ybGQuYXV0aG9yZWRQbGFjZWQsXG4gICAgbmV4dFNlcXVlbmNlLFxuICB9O1xuICBpZiAoc2NoZW1hICE9PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSkgcmV0dXJuIHsgLi4uYmFzZSwgc2NoZW1hIH0gYXMgV29ybGRTbmFwc2hvdDtcbiAgaWYgKCF3b3JsZC5saWZlKSB0aHJvdyBuZXcgRXJyb3IoJ3NjaGVtYS0zIHNuYXBzaG90IHJlcXVpcmVzIGxpZmUgc3RhdGUnKTtcbiAgcmV0dXJuIHtcbiAgICAuLi5iYXNlLCBzY2hlbWEsXG4gICAgdGljazogd29ybGQubGlmZS50aWNrLFxuICAgIHN0b2NrcGlsZXM6IFsuLi53b3JsZC5saWZlLnN0b2NrcGlsZXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKChzKSA9PiAoe1xuICAgICAgaWQ6IHMuaWQsIHg6IHMueCwgejogcy56LCBjYXBhY2l0eTogcy5jYXBhY2l0eSxcbiAgICAgIGludmVudG9yeTogT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKHMuaW52ZW50b3J5KS5maWx0ZXIoKFssIGFtb3VudF0pID0+IGFtb3VudCA+IDApXG4gICAgICAgIC5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSksXG4gICAgfSkpLFxuICAgIGpvYnM6IFsuLi53b3JsZC5saWZlLmpvYnMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKChqKSA9PiAoeyAuLi5qIH0pKSxcbiAgICBjcm9wczogWy4uLndvcmxkLmxpZmUuY3JvcHMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKChjKSA9PiAoeyAuLi5jIH0pKSxcbiAgfTtcbn1cblxuLyoqIFR3byBsYW5lcywgd2l0aCBsZW5ndGggaW5jbHVkZWQ7IG5vdCBhIGNyeXB0b2dyYXBoaWMgaW50ZWdyaXR5IHNpZ25hdHVyZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxIYXNoKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBhID0gMHg4MTFjOWRjNSwgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGMgPSB0ZXh0LmNoYXJDb2RlQXQoaSk7XG4gICAgYSA9IE1hdGguaW11bChhIF4gYywgMHgwMTAwMDE5Myk7XG4gICAgYiA9IE1hdGguaW11bChiIF4gKGMgKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgYiBePSBiID4+PiAxMztcbiAgfVxuICByZXR1cm4gKGEgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpICsgKGIgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsV29ybGRIYXNoKFxuICB3b3JsZDogV29ybGQsIG5leHRTZXF1ZW5jZSA9IDAsIHNjaGVtYTogV29ybGRTbmFwc2hvdFsnc2NoZW1hJ10gPSBERVNJR05fU05BUFNIT1RfU0NIRU1BLFxuKTogc3RyaW5nIHtcbiAgcmV0dXJuIGNhbm9uaWNhbEhhc2goSlNPTi5zdHJpbmdpZnkoY3JlYXRlV29ybGRTbmFwc2hvdCh3b3JsZCwgbmV4dFNlcXVlbmNlLCBzY2hlbWEpKSk7XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHVpbnQodmFsdWU6IHVua25vd24sIG1heGltdW06IG51bWJlcik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc1NhZmVJbnRlZ2VyKHZhbHVlKSAmJiB2YWx1ZSA+PSAwICYmIHZhbHVlIDw9IG1heGltdW07XG59XG5cbmZ1bmN0aW9uIGZpbml0ZSh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHRleHQodmFsdWU6IHVua25vd24sIG1heGltdW0gPSAyNTYpOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZS5sZW5ndGggPiAwICYmIHZhbHVlLmxlbmd0aCA8PSBtYXhpbXVtO1xufVxuXG5mdW5jdGlvbiB2YWxpZENodW5rKGtleTogdW5rbm93bik6IGtleSBpcyBzdHJpbmcge1xuICBpZiAodHlwZW9mIGtleSAhPT0gJ3N0cmluZycgfHwgIS9eLT9cXGQrLC0/XFxkKyQvLnRlc3Qoa2V5KSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICByZXR1cm4gTnVtYmVyLmlzSW50ZWdlcihjeCkgJiYgTnVtYmVyLmlzSW50ZWdlcihjeilcbiAgICAmJiBjeCA+PSAwICYmIGN6ID49IDAgJiYgY3ggPCBDSFVOS1NfUEVSX1NJREUgJiYgY3ogPCBDSFVOS1NfUEVSX1NJREU7XG59XG5cbi8qKiBBIHN0cmljdCBsZWdhY3kgc25hcHNob3QgaXMgYWxyZWFkeSBjYW5vbmljYWwgY3JlYXRlV29ybGRTbmFwc2hvdCBvdXRwdXQuXG4gKiBWZXJpZnkgaXRzIHJlY29yZGVkIGJvdW5kYXJ5IGJlZm9yZSBmaWx0ZXJpbmcgdGhlIHRocmVlIHJldGlyZWQgc3RvbmUgZm9ybXMuICovXG5leHBvcnQgZnVuY3Rpb24gbGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90OiBXb3JsZFNuYXBzaG90KTogc3RyaW5nIHtcbiAgcmV0dXJuIGNhbm9uaWNhbEhhc2goSlNPTi5zdHJpbmdpZnkoc25hcHNob3QpKTtcbn1cblxuLyoqIE1pZ3JhdGlvbiBvbmx5OiBubyBpbnZlbnRvcnksIHN0cnVjdHVyZSwgbGlmZSwgZWRpdCBvciBjb21tYW5kIGRhdGEgY2hhbmdlcy4gKi9cbi8qKiBAaW50ZXJuYWwgUmV0aXJlIG9ubHkgYWZ0ZXIgcmVjb25zdHJ1Y3RpbmcgdGhlIG9sZCBzdGF0ZSBpbiByZXBsYXkgbW9kZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtaWdyYXRlU3RvbmVTbmFwc2hvdChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCk6IFdvcmxkU25hcHNob3Qge1xuICBjb25zdCByZW1vdmFscyA9IG5ldyBTZXQoc25hcHNob3QuZW50aXR5UmVtb3ZhbHMpO1xuICBmb3IgKGNvbnN0IGVudGl0eSBvZiBzbmFwc2hvdC5lbnRpdGllcykge1xuICAgIGlmIChpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpICYmICFlbnRpdHkuYXV0aG9yZWQpIHJlbW92YWxzLmFkZChlbnRpdHkuaWQpO1xuICB9XG4gIGNvbnN0IGVudGl0eUNodW5rcyA9IG5ldyBTZXQoc25hcHNob3QuZW50aXR5Q2h1bmtzKTtcbiAgZm9yIChjb25zdCBlbnRpdHkgb2Ygc25hcHNob3QuZW50aXRpZXMpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSkge1xuICAgICAgZW50aXR5Q2h1bmtzLmFkZChlbnRpdHkuY2h1bmspO1xuICAgICAgaWYgKCFlbnRpdHkuYXV0aG9yZWQpIHJlbW92YWxzLmFkZChlbnRpdHkuaWQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4ge1xuICAgIC4uLnNuYXBzaG90LFxuICAgIGVudGl0aWVzOiBzbmFwc2hvdC5lbnRpdGllcy5maWx0ZXIoKGVudGl0eSkgPT4gIWlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpLFxuICAgIGVudGl0eUNodW5rczogWy4uLmVudGl0eUNodW5rc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSxcbiAgICBlbnRpdHlSZW1vdmFsczogWy4uLnJlbW92YWxzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLFxuICB9O1xufVxuY29uc3QgRU5USVRZX0tJTkRTID0gbmV3IFNldDxFbnRpdHlLaW5kPihbXG4gICdzdHlsX3RyZWVfc3BpcmUnLCAnc3R5bF90cmVlX3RhYmxlJywgJ3N0eWxfdHJlZV9jbHVzdGVyJywgJ3N0eWxfdHJlZV9ibG9zc29tJyxcbiAgJ3N0eWxfc2hydWInLCAnc3R5bF9yb2NrX3NtYWxsJywgJ3N0eWxfcm9ja19tZWRpdW0nLCAnc3R5bF9yb2NrX2xhcmdlJyxcbiAgJ3N0eWxfb3JlJywgJ3N0eWxfY2Fpcm4nLCAnd2F5c3RvbmUnLCAnbWFya2VyJyxcbl0pO1xuY29uc3QgUkVTT1VSQ0VTID0gbmV3IFNldDxSZXNvdXJjZVR5cGU+KFsnd29vZCcsICdzdG9uZScsICdvcmUnLCAnZmliZXInXSk7XG5jb25zdCBSRUNPUkRfUkVTT1VSQ0VTID0gbmV3IFNldDxzdHJpbmc+KExJRkVfUkVTT1VSQ0VTKTtcbmNvbnN0IFNUUlVDVFVSRV9LSU5EUyA9IG5ldyBTZXQoWydob3VzZScsICdwYXRoJywgJ3RlcnJhY2UnXSk7XG5jb25zdCBNT0RVTEVfS0lORFMgPSBuZXcgU2V0KFtcbiAgJ2Zsb29yJywgJ3dhbGwnLCAncG9zdCcsICdsaW50ZWwnLCAncm9vZicsICdwYXJhcGV0JywgJ3dpbmRvdycsICdkb29yJyxcbiAgJ3RocmVzaG9sZCcsICdwYXRoJywgJ2N1cmInLCAnc29pbF9iZWQnLCAncmV0YWluaW5nX3dhbGwnLCAnY3JvcF9yb3cnLFxuXSk7XG5jb25zdCBNT0RVTEVfVE9ORVMgPSBuZXcgU2V0KFsnc3RvbmUnLCAnc3RvbmVfYicsICdvY2hyZScsICd0aW1iZXInLCAnYWNjZW50JywgJ3NvaWwnLCAnY3JvcCcsICdncmF2ZWwnXSk7XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRW50aXR5KHZhbHVlOiB1bmtub3duLCBpZHM6IFNldDxzdHJpbmc+KTogRW50aXR5IHtcbiAgaWYgKCFpc09iamVjdCh2YWx1ZSkgfHwgIXRleHQodmFsdWUuaWQpIHx8IGlkcy5oYXModmFsdWUuaWQpXG4gICAgfHwgIXRleHQodmFsdWUua2luZCkgfHwgIUVOVElUWV9LSU5EUy5oYXModmFsdWUua2luZCBhcyBFbnRpdHlLaW5kKVxuICAgIHx8ICF2YWxpZENodW5rKHZhbHVlLmNodW5rKVxuICAgIHx8ICFmaW5pdGUodmFsdWUueCkgfHwgIWZpbml0ZSh2YWx1ZS55KSB8fCAhZmluaXRlKHZhbHVlLnopXG4gICAgfHwgdmFsdWUueCA8IC1IQUxGIHx8IHZhbHVlLnggPj0gSEFMRiB8fCB2YWx1ZS56IDwgLUhBTEYgfHwgdmFsdWUueiA+PSBIQUxGXG4gICAgfHwgIWZpbml0ZSh2YWx1ZS5yb3QpIHx8ICFmaW5pdGUodmFsdWUuc2NhbGUpIHx8ICF1aW50KHZhbHVlLnZhcmlhbnQsIDEwMDApXG4gICAgfHwgdmFsdWUucmVzb3VyY2UgIT09IG51bGwgJiYgISh0eXBlb2YgdmFsdWUucmVzb3VyY2UgPT09ICdzdHJpbmcnICYmIFJFU09VUkNFUy5oYXModmFsdWUucmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlKSlcbiAgICB8fCAhdWludCh2YWx1ZS5yZW1haW5pbmcsIDFfMDAwXzAwMCkgfHwgIXVpbnQodmFsdWUueWllbGRQZXJIYXJ2ZXN0LCAxXzAwMF8wMDApXG4gICAgfHwgdHlwZW9mIHZhbHVlLmhhcnZlc3RlZCAhPT0gJ2Jvb2xlYW4nIHx8IHR5cGVvZiB2YWx1ZS5wcm92aXNpb25hbCAhPT0gJ2Jvb2xlYW4nXG4gICAgfHwgdHlwZW9mIHZhbHVlLmF1dGhvcmVkICE9PSAnYm9vbGVhbidcbiAgICB8fCB2YWx1ZS5oYXJ2ZXN0ZWRPbmNlICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHZhbHVlLmhhcnZlc3RlZE9uY2UgIT09ICdib29sZWFuJykge1xuICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgYW4gaW52YWxpZCBvciBkdXBsaWNhdGUgZW50aXR5Jyk7XG4gIH1cbiAgaWRzLmFkZCh2YWx1ZS5pZCk7XG4gIHJldHVybiB7XG4gICAgaWQ6IHZhbHVlLmlkLCBraW5kOiB2YWx1ZS5raW5kIGFzIEVudGl0eUtpbmQsIGNodW5rOiB2YWx1ZS5jaHVuayxcbiAgICB4OiB2YWx1ZS54LCB5OiB2YWx1ZS55LCB6OiB2YWx1ZS56LCByb3Q6IHZhbHVlLnJvdCwgc2NhbGU6IHZhbHVlLnNjYWxlLFxuICAgIHZhcmlhbnQ6IHZhbHVlLnZhcmlhbnQsIHJlc291cmNlOiB2YWx1ZS5yZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGUgfCBudWxsLFxuICAgIHJlbWFpbmluZzogdmFsdWUucmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3Q6IHZhbHVlLnlpZWxkUGVySGFydmVzdCxcbiAgICBoYXJ2ZXN0ZWQ6IHZhbHVlLmhhcnZlc3RlZCxcbiAgICAuLi4odmFsdWUuaGFydmVzdGVkT25jZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGhhcnZlc3RlZE9uY2U6IHZhbHVlLmhhcnZlc3RlZE9uY2UgfSksXG4gICAgcHJvdmlzaW9uYWw6IHZhbHVlLnByb3Zpc2lvbmFsLCBhdXRob3JlZDogdmFsdWUuYXV0aG9yZWQsXG4gIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlSW52ZW50b3J5KHZhbHVlOiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGludmVudG9yeSBpcyBpbnZhbGlkJyk7XG4gIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh2YWx1ZSkuc29ydCgpKSB7XG4gICAgaWYgKCFSRUNPUkRfUkVTT1VSQ0VTLmhhcyhrZXkpIHx8ICF1aW50KHZhbHVlW2tleV0sIDFfMDAwXzAwMF8wMDApKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYHNuYXBzaG90IGhhcyBpbnZhbGlkIGludmVudG9yeSByZXNvdXJjZSAke2tleX1gKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlW2tleV0gPiAwKSBvdXRba2V5XSA9IHZhbHVlW2tleV07XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gc3RvY2tUb3RhbCh2YWx1ZTogUmVjb3JkPHN0cmluZywgbnVtYmVyPik6IG51bWJlciB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKHZhbHVlKS5yZWR1Y2UoKHN1bSwgYW1vdW50KSA9PiBzdW0gKyBhbW91bnQsIDApO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUxpZmVGaWVsZHModmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogUGljazxMaWZlU25hcHNob3QsICd0aWNrJyB8ICdzdG9ja3BpbGVzJyB8ICdqb2JzJyB8ICdjcm9wcyc+IHtcbiAgaWYgKCF1aW50KHZhbHVlLnRpY2ssIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLnN0b2NrcGlsZXMpIHx8IHZhbHVlLnN0b2NrcGlsZXMubGVuZ3RoICE9PSAxXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuam9icykgfHwgdmFsdWUuam9icy5sZW5ndGggPiBNQVhfUFJPRFVDVElPTl9KT0JTXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuY3JvcHMpIHx8IHZhbHVlLmNyb3BzLmxlbmd0aCA+IENST1BfUExPVF9JRFMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgaW52YWxpZCBsaWZlLWxvb3AgZmllbGRzJyk7XG4gIH1cbiAgY29uc3Qgc3RvY2twaWxlczogTm9uTnVsbGFibGU8TGlmZVNuYXBzaG90WydzdG9ja3BpbGVzJ10+ID0gW107XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLnN0b2NrcGlsZXMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgcmF3LmlkICE9PSBGT1VOREVSX1NUT0NLUElMRV9JRCB8fCByYXcueCAhPT0gRk9VTkRFUl9TVE9DS1BJTEUueFxuICAgICAgfHwgcmF3LnogIT09IEZPVU5ERVJfU1RPQ0tQSUxFLnogfHwgcmF3LmNhcGFjaXR5ICE9PSBGT1VOREVSX1NUT0NLUElMRS5jYXBhY2l0eSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gdW5zdXBwb3J0ZWQgc3RvY2twaWxlJyk7XG4gICAgfVxuICAgIGNvbnN0IGludmVudG9yeSA9IHZhbGlkYXRlSW52ZW50b3J5KHJhdy5pbnZlbnRvcnkpO1xuICAgIGlmIChzdG9ja1RvdGFsKGludmVudG9yeSkgPiBTVE9DS1BJTEVfQ0FQQUNJVFkpIHRocm93IG5ldyBFcnJvcignc3RvY2twaWxlIGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgICBzdG9ja3BpbGVzLnB1c2goeyBpZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHg6IHJhdy54LCB6OiByYXcueixcbiAgICAgIGNhcGFjaXR5OiBTVE9DS1BJTEVfQ0FQQUNJVFksIGludmVudG9yeSB9KTtcbiAgfVxuICBsZXQgcmVzZXJ2ZWQgPSBzdG9ja1RvdGFsKHN0b2NrcGlsZXNbMF0uaW52ZW50b3J5KTtcbiAgY29uc3QgaWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IGpvYnM6IE5vbk51bGxhYmxlPExpZmVTbmFwc2hvdFsnam9icyddPiA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5qb2JzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICF0ZXh0KHJhdy5pZCwgMTI4KSB8fCAhL15bQS1aYS16MC05XVtBLVphLXowLTkuXzolLV0qJC8udGVzdChyYXcuaWQpXG4gICAgICB8fCBpZHMuaGFzKHJhdy5pZCkgfHwgcmF3LnN0b2NrcGlsZUlkICE9PSBGT1VOREVSX1NUT0NLUElMRV9JRFxuICAgICAgfHwgcmF3LnJlY2lwZSAhPT0gJ3NlZWQnICYmIHJhdy5yZWNpcGUgIT09ICdyYXRpb25zJ1xuICAgICAgfHwgIXVpbnQocmF3LnJlbWFpbmluZ1RpY2tzLCBNQVhfVElDS1NfUEVSX0NPTU1BTkQpIHx8IHJhdy5yZW1haW5pbmdUaWNrcyA8IDFcbiAgICAgIHx8IHJhdy5yZW1haW5pbmdUaWNrcyA+IFJFQ0lQRVNbcmF3LnJlY2lwZV0udGlja3MpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGFuIGludmFsaWQgcHJvZHVjdGlvbiBqb2InKTtcbiAgICByZXNlcnZlZCArPSBzdG9ja1RvdGFsKFJFQ0lQRVNbcmF3LnJlY2lwZV0ub3V0cHV0IGFzIFJlY29yZDxzdHJpbmcsIG51bWJlcj4pO1xuICAgIGlkcy5hZGQocmF3LmlkKTtcbiAgICBqb2JzLnB1c2goeyBpZDogcmF3LmlkLCBzdG9ja3BpbGVJZDogRk9VTkRFUl9TVE9DS1BJTEVfSUQsIHJlY2lwZTogcmF3LnJlY2lwZSwgcmVtYWluaW5nVGlja3M6IHJhdy5yZW1haW5pbmdUaWNrcyB9KTtcbiAgfVxuICBpZiAocmVzZXJ2ZWQgPiBTVE9DS1BJTEVfQ0FQQUNJVFkpIHRocm93IG5ldyBFcnJvcignc3RvY2twaWxlIHJlc2VydmVkIG91dHB1dCBleGNlZWRzIGNhcGFjaXR5Jyk7XG4gIGlkcy5jbGVhcigpO1xuICBjb25zdCBjcm9wczogTm9uTnVsbGFibGU8TGlmZVNuYXBzaG90Wydjcm9wcyddPiA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5jcm9wcykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCAhQ1JPUF9QTE9UX0lEUy5pbmNsdWRlcyhTdHJpbmcocmF3LmlkKSkgfHwgaWRzLmhhcyhTdHJpbmcocmF3LmlkKSlcbiAgICAgIHx8ICF1aW50KHJhdy5wbGFudGVkVGljaywgdmFsdWUudGljaykgfHwgcmF3Lmdyb3d0aFRpY2tzICE9PSBDUk9QX0dST1dUSF9USUNLUykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgYW4gaW52YWxpZCBjcm9wIHBsb3QnKTtcbiAgICB9XG4gICAgY29uc3QgcGxvdElkID0gU3RyaW5nKHJhdy5pZCk7XG4gICAgaWRzLmFkZChwbG90SWQpO1xuICAgIGNyb3BzLnB1c2goeyBpZDogcGxvdElkLCBwbGFudGVkVGljazogcmF3LnBsYW50ZWRUaWNrLCBncm93dGhUaWNrczogQ1JPUF9HUk9XVEhfVElDS1MgfSk7XG4gIH1cbiAgc3RvY2twaWxlcy5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICBqb2JzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIGNyb3BzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIHJldHVybiB7IHRpY2s6IHZhbHVlLnRpY2ssIHN0b2NrcGlsZXMsIGpvYnMsIGNyb3BzIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ29zdCh2YWx1ZTogdW5rbm93bik6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4ge1xuICBjb25zdCBvdXQgPSB2YWxpZGF0ZUludmVudG9yeSh2YWx1ZSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlU3RydWN0dXJlKFxuICB2YWx1ZTogdW5rbm93biwgaWRzOiBTZXQ8c3RyaW5nPiwgc2NoZW1hOiBXb3JsZFNuYXBzaG90WydzY2hlbWEnXSxcbik6IFN0cnVjdHVyZSB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpIHx8ICF0ZXh0KHZhbHVlLmlkKSB8fCBpZHMuaGFzKHZhbHVlLmlkKVxuICAgIHx8ICF0ZXh0KHZhbHVlLmtpbmQpIHx8ICFTVFJVQ1RVUkVfS0lORFMuaGFzKHZhbHVlLmtpbmQpXG4gICAgfHwgIXRleHQodmFsdWUuc2l0ZUlkKVxuICAgIHx8ICFmaW5pdGUodmFsdWUueCkgfHwgIWZpbml0ZSh2YWx1ZS55KSB8fCAhZmluaXRlKHZhbHVlLnopIHx8ICFmaW5pdGUodmFsdWUucm90KVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLm1vZHVsZXMpIHx8IHZhbHVlLm1vZHVsZXMubGVuZ3RoID4gNjRcbiAgICB8fCAhdWludCh2YWx1ZS5idWlsdFJldmlzaW9uLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikgfHwgdmFsdWUucHJvdmlzaW9uYWwgIT09IHRydWVcbiAgICB8fCBzY2hlbWEgPT09IFNOQVBTSE9UX1NDSEVNQSAmJiB2YWx1ZS5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWRcbiAgICB8fCBzY2hlbWEgIT09IFNOQVBTSE9UX1NDSEVNQSAmJiB2YWx1ZS5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWRcbiAgICAgICYmIHZhbHVlLmRlc2lnblZlcnNpb24gIT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGFuIGludmFsaWQgb3IgZHVwbGljYXRlIHN0cnVjdHVyZScpO1xuICB9XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZVsnbW9kdWxlcyddID0gW107XG4gIGNvbnN0IG1vZHVsZUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5tb2R1bGVzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICF0ZXh0KHJhdy5raW5kKSB8fCAhTU9EVUxFX0tJTkRTLmhhcyhyYXcua2luZClcbiAgICAgIHx8ICFmaW5pdGUocmF3LngpIHx8ICFmaW5pdGUocmF3LnkpIHx8ICFmaW5pdGUocmF3LnopXG4gICAgICB8fCAhZmluaXRlKHJhdy53KSB8fCByYXcudyA8PSAwIHx8ICFmaW5pdGUocmF3LmgpIHx8IHJhdy5oIDw9IDAgfHwgIWZpbml0ZShyYXcuZCkgfHwgcmF3LmQgPD0gMFxuICAgICAgfHwgcmF3LnJvdCAhPT0gdW5kZWZpbmVkICYmICFmaW5pdGUocmF3LnJvdClcbiAgICAgIHx8IHJhdy50b25lICE9PSB1bmRlZmluZWQgJiYgKHR5cGVvZiByYXcudG9uZSAhPT0gJ3N0cmluZycgfHwgIU1PRFVMRV9UT05FUy5oYXMocmF3LnRvbmUpKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBzdHJ1Y3R1cmUgJHt2YWx1ZS5pZH0gY29udGFpbnMgYW4gaW52YWxpZCBtb2R1bGVgKTtcbiAgICB9XG4gICAgY29uc3Qgc2lnbmF0dXJlID0gSlNPTi5zdHJpbmdpZnkocmF3KTtcbiAgICBpZiAobW9kdWxlSWRzLmhhcyhzaWduYXR1cmUpKSB0aHJvdyBuZXcgRXJyb3IoYHN0cnVjdHVyZSAke3ZhbHVlLmlkfSBjb250YWlucyBkdXBsaWNhdGUgbW9kdWxlc2ApO1xuICAgIG1vZHVsZUlkcy5hZGQoc2lnbmF0dXJlKTtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogcmF3LmtpbmQgYXMgU3RydWN0dXJlWydtb2R1bGVzJ11bbnVtYmVyXVsna2luZCddLFxuICAgICAgeDogcmF3LngsIHk6IHJhdy55LCB6OiByYXcueiwgdzogcmF3LncsIGg6IHJhdy5oLCBkOiByYXcuZCxcbiAgICAgIC4uLihyYXcucm90ID09PSB1bmRlZmluZWQgPyB7fSA6IHsgcm90OiByYXcucm90IH0pLFxuICAgICAgLi4uKHJhdy50b25lID09PSB1bmRlZmluZWQgPyB7fSA6IHsgdG9uZTogcmF3LnRvbmUgYXMgU3RydWN0dXJlWydtb2R1bGVzJ11bbnVtYmVyXVsndG9uZSddIH0pLFxuICAgIH0pO1xuICB9XG4gIGlkcy5hZGQodmFsdWUuaWQpO1xuICByZXR1cm4ge1xuICAgIGlkOiB2YWx1ZS5pZCwga2luZDogdmFsdWUua2luZCBhcyBTdHJ1Y3R1cmVbJ2tpbmQnXSwgc2l0ZUlkOiB2YWx1ZS5zaXRlSWQsXG4gICAgeDogdmFsdWUueCwgeTogdmFsdWUueSwgejogdmFsdWUueiwgcm90OiB2YWx1ZS5yb3QsXG4gICAgbW9kdWxlcywgY29zdDogdmFsaWRhdGVDb3N0KHZhbHVlLmNvc3QpLCBidWlsdFJldmlzaW9uOiB2YWx1ZS5idWlsdFJldmlzaW9uLFxuICAgIC4uLih2YWx1ZS5kZXNpZ25WZXJzaW9uID09PSB1bmRlZmluZWQgPyB7fSA6IHsgZGVzaWduVmVyc2lvbjogRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9KSxcbiAgICBwcm92aXNpb25hbDogdHJ1ZSxcbiAgfTtcbn1cblxuLyoqIFN0cmljdCBydW50aW1lIHZhbGlkYXRpb247IEpTT04ncyBUeXBlU2NyaXB0IGNhc3RzIGFyZSBuZXZlciB0cnVzdGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlV29ybGRTbmFwc2hvdCh2YWx1ZTogdW5rbm93bik6IFdvcmxkU25hcHNob3Qge1xuICBpZiAoIWlzT2JqZWN0KHZhbHVlKVxuICAgIHx8IHZhbHVlLnNjaGVtYSAhPT0gU05BUFNIT1RfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gREVTSUdOX1NOQVBTSE9UX1NDSEVNQVxuICAgICYmIHZhbHVlLnNjaGVtYSAhPT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUFcbiAgICB8fCAhaXNPYmplY3QodmFsdWUubWFuaWZlc3QpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBvciBtYWxmb3JtZWQgd29ybGQgc25hcHNob3QnKTtcbiAgfVxuICBjb25zdCBzY2hlbWEgPSB2YWx1ZS5zY2hlbWE7XG4gIGNvbnN0IG0gPSB2YWx1ZS5tYW5pZmVzdDtcbiAgY29uc3QgcGFyYW1zID0ge1xuICAgIHNpemU6IDIwNDgsIGNodW5rU2l6ZTogQ0hVTktfU0laRSwgeU1pbjogLTE2LCB5TWF4OiAxMTIsXG4gICAgc2VhTGV2ZWw6IDAsIGdlbmVyYXRvclZlcnNpb246IEdFTkVSQVRPUl9WRVJTSU9OLFxuICB9O1xuICBpZiAobS5zY2hlbWEgIT09IDEgfHwgIXVpbnQobS5zZWVkLCAweGZmZmZmZmZmKVxuICAgIHx8IG0uZ2VuZXJhdG9yVmVyc2lvbiAhPT0gcGFyYW1zLmdlbmVyYXRvclZlcnNpb25cbiAgICB8fCBtLnNpemUgIT09IHBhcmFtcy5zaXplIHx8IG0uY2h1bmtTaXplICE9PSBwYXJhbXMuY2h1bmtTaXplXG4gICAgfHwgbS55TWluICE9PSBwYXJhbXMueU1pbiB8fCBtLnlNYXggIT09IHBhcmFtcy55TWF4IHx8IG0uc2VhTGV2ZWwgIT09IHBhcmFtcy5zZWFMZXZlbFxuICAgIHx8ICEvXlswLTlhLWZdezh9JC8udGVzdChTdHJpbmcobS5wYXJhbXNIYXNoKSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGdlbmVyYXRvciBjb25maWd1cmF0aW9uIGlzIHVuc3VwcG9ydGVkIG9yIGluY29tcGF0aWJsZScpO1xuICB9XG4gIGlmICghdWludCh2YWx1ZS5yZXZpc2lvbiwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpXG4gICAgfHwgIXVpbnQodmFsdWUubmV4dFNlcXVlbmNlLCAxMF8wMDBfMDAwKVxuICAgIHx8IHR5cGVvZiB2YWx1ZS5hdXRob3JlZFBsYWNlZCAhPT0gJ2Jvb2xlYW4nXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuZWRpdHMpIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0aWVzKVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0eVJlbW92YWxzKVxuICAgIHx8IHZhbHVlLmVudGl0aWVzLmxlbmd0aCA+IE1BWF9TTkFQU0hPVF9FTlRJVElFU1xuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudGl0eUNodW5rcykgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuc3RydWN0dXJlcykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBpbnZhbGlkIGF1dGhvcml0YXRpdmUtc3RhdGUgZmllbGRzJyk7XG4gIH1cbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChtLnNlZWQpO1xuICAvLyBUaGUgbWFuaWZlc3QgaGFzaCBpcyBjaGVja2VkIGFnYWluc3QgdGhlIGFjdHVhbCByZXN0b3JlZCBjb25maWd1cmF0aW9uLlxuICBpZiAod29ybGRNYW5pZmVzdCh3b3JsZCkucGFyYW1zSGFzaCAhPT0gbS5wYXJhbXNIYXNoKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IG1hbmlmZXN0IGhhc2ggbWlzbWF0Y2gnKTtcblxuICBjb25zdCBlZGl0czogV29ybGRTbmFwc2hvdFsnZWRpdHMnXSA9IFtdO1xuICBsZXQgZWRpdENvdW50ID0gMDtcbiAgY29uc3QgY2h1bmtJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByYXcgb2YgdmFsdWUuZWRpdHMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgIXZhbGlkQ2h1bmsocmF3LmNodW5rKSB8fCBjaHVua0lkcy5oYXMocmF3LmNodW5rKVxuICAgICAgfHwgIUFycmF5LmlzQXJyYXkocmF3LmNlbGxzKSB8fCByYXcuY2VsbHMubGVuZ3RoID4gQ0hVTktfVk9MVU1FKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGludmFsaWQgY2h1bmsgZWRpdHMnKTtcbiAgICB9XG4gICAgY29uc3QgY2VsbElkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICAgIGNvbnN0IGNlbGxzOiBBcnJheTx7IGk6IG51bWJlcjsgbTogbnVtYmVyIH0+ID0gW107XG4gICAgZm9yIChjb25zdCBjZWxsIG9mIHJhdy5jZWxscykge1xuICAgICAgaWYgKCFpc09iamVjdChjZWxsKSB8fCAhdWludChjZWxsLmksIENIVU5LX1ZPTFVNRSAtIDEpIHx8IGNlbGxJZHMuaGFzKGNlbGwuaSlcbiAgICAgICAgfHwgIXVpbnQoY2VsbC5tLCA5KSkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyBhbiBpbnZhbGlkIHZveGVsIGVkaXQnKTtcbiAgICAgIGNlbGxJZHMuYWRkKGNlbGwuaSk7XG4gICAgICBjZWxscy5wdXNoKHsgaTogY2VsbC5pLCBtOiBjZWxsLm0gfSk7XG4gICAgfVxuICAgIGNlbGxJZHMuY2xlYXIoKTtcbiAgICBjZWxscy5zb3J0KChhLCBiKSA9PiBhLmkgLSBiLmkpO1xuICAgIGVkaXRDb3VudCArPSBjZWxscy5sZW5ndGg7XG4gICAgaWYgKGVkaXRDb3VudCA+IE1BWF9TTkFQU0hPVF9FRElUUykgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBleGNlZWRzIHRoZSBib3VuZGVkIGVkaXQgbGltaXQnKTtcbiAgICBjaHVua0lkcy5hZGQocmF3LmNodW5rKTtcbiAgICBlZGl0cy5wdXNoKHsgY2h1bms6IHJhdy5jaHVuaywgY2VsbHMgfSk7XG4gIH1cbiAgZWRpdHMuc29ydCgoYSwgYikgPT4gYS5jaHVuay5sb2NhbGVDb21wYXJlKGIuY2h1bmspKTtcblxuICBjb25zdCBlbnRpdHlJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3QgZW50aXRpZXMgPSB2YWx1ZS5lbnRpdGllcy5tYXAoKGUpID0+IHZhbGlkYXRlRW50aXR5KGUsIGVudGl0eUlkcykpO1xuICBjb25zdCBlbnRpdHlDaHVua3M6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGdlbmVyYXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IGtleSBvZiB2YWx1ZS5lbnRpdHlDaHVua3MpIHtcbiAgICBpZiAoIXZhbGlkQ2h1bmsoa2V5KSB8fCBnZW5lcmF0ZWQuaGFzKGtleSkpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZ2VuZXJhdGVkLWNodW5rIGluZGV4IGlzIGludmFsaWQnKTtcbiAgICBnZW5lcmF0ZWQuYWRkKGtleSk7XG4gICAgZW50aXR5Q2h1bmtzLnB1c2goa2V5KTtcbiAgfVxuICBmb3IgKGNvbnN0IGVudGl0eSBvZiBlbnRpdGllcykge1xuICAgIGlmICghZW50aXR5LmF1dGhvcmVkICYmICFnZW5lcmF0ZWQuaGFzKGVudGl0eS5jaHVuaykpIHRocm93IG5ldyBFcnJvcihgZW50aXR5ICR7ZW50aXR5LmlkfSBiZWxvbmdzIHRvIGFuIHVubWFya2VkIGNodW5rYCk7XG4gIH1cbiAgZW50aXR5Q2h1bmtzLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG4gIGNvbnN0IHJlbW92YWxzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgaWQgb2YgdmFsdWUuZW50aXR5UmVtb3ZhbHMpIHtcbiAgICBpZiAoIXRleHQoaWQpIHx8IHJlbW92YWxzLmhhcyhpZCkgfHwgZW50aXR5SWRzLmhhcyhpZCkgfHwgIS9eZTpcXGQrLFxcZCs6XFxkKyQvLnRlc3QoaWQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGVudGl0eSB0b21ic3RvbmUgaXMgaW52YWxpZCcpO1xuICAgIH1cbiAgICByZW1vdmFscy5hZGQoaWQpO1xuICB9XG4gIGNvbnN0IGVudGl0eVJlbW92YWxzID0gWy4uLnJlbW92YWxzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXG4gIGNvbnN0IHN0cnVjdHVyZUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBzdHJ1Y3R1cmVzID0gdmFsdWUuc3RydWN0dXJlcy5tYXAoKHMpID0+IHZhbGlkYXRlU3RydWN0dXJlKHMsIHN0cnVjdHVyZUlkcywgc2NoZW1hKSlcbiAgICAuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcbiAgY29uc3QgY2FycmllZCA9IHZhbGlkYXRlSW52ZW50b3J5KHZhbHVlLmludmVudG9yeSk7XG4gIGlmIChzY2hlbWEgPT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BICYmIHN0b2NrVG90YWwoY2FycmllZCkgPiBDQVJSSUVEX0NBUEFDSVRZKSB0aHJvdyBuZXcgRXJyb3IoJ2NhcnJpZWQgaW52ZW50b3J5IGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgY29uc3Qgc25hcHNob3Q6IEJhc2VXb3JsZFNuYXBzaG90ID0ge1xuICAgIHNjaGVtYSxcbiAgICBtYW5pZmVzdDoge1xuICAgICAgc2NoZW1hOiAxLCBzZWVkOiBtLnNlZWQsIGdlbmVyYXRvclZlcnNpb246IHBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgICAgc2l6ZTogcGFyYW1zLnNpemUsIGNodW5rU2l6ZTogcGFyYW1zLmNodW5rU2l6ZSwgeU1pbjogcGFyYW1zLnlNaW4sXG4gICAgICB5TWF4OiBwYXJhbXMueU1heCwgc2VhTGV2ZWw6IHBhcmFtcy5zZWFMZXZlbCwgcGFyYW1zSGFzaDogbS5wYXJhbXNIYXNoLFxuICAgIH0sXG4gICAgcmV2aXNpb246IHZhbHVlLnJldmlzaW9uLFxuICAgIGVkaXRzLFxuICAgIGVudGl0aWVzLFxuICAgIGVudGl0eUNodW5rcyxcbiAgICBlbnRpdHlSZW1vdmFscyxcbiAgICBpbnZlbnRvcnk6IGNhcnJpZWQsXG4gICAgc3RydWN0dXJlcyxcbiAgICBhdXRob3JlZFBsYWNlZDogdmFsdWUuYXV0aG9yZWRQbGFjZWQsXG4gICAgbmV4dFNlcXVlbmNlOiB2YWx1ZS5uZXh0U2VxdWVuY2UsXG4gIH07XG4gIGNvbnN0IHJlc3VsdDogV29ybGRTbmFwc2hvdCA9IHNjaGVtYSA9PT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUFcbiAgICA/IHsgLi4uc25hcHNob3QsIHNjaGVtYTogQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEsIC4uLnZhbGlkYXRlTGlmZUZpZWxkcyh2YWx1ZSkgfVxuICAgIDogeyAuLi5zbmFwc2hvdCwgc2NoZW1hOiBzY2hlbWEgYXMgdHlwZW9mIFNOQVBTSE9UX1NDSEVNQSB8IHR5cGVvZiBERVNJR05fU05BUFNIT1RfU0NIRU1BIH07XG4gIGlmIChKU09OLnN0cmluZ2lmeShyZXN1bHQpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIHVua25vd24sIG5vbi1jYW5vbmljYWwgb3IgYW1iaWd1b3VzIGZpZWxkcycpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVXb3JsZFNuYXBzaG90KGpzb246IHN0cmluZyk6IFdvcmxkU25hcHNob3Qge1xuICBpZiAoanNvbi5sZW5ndGggPiBNQVhfU05BUFNIT1RfSlNPTl9CWVRFUykgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBleGNlZWRzIHRoZSBKU09OIHNpemUgbGltaXQnKTtcbiAgcmV0dXJuIHZhbGlkYXRlV29ybGRTbmFwc2hvdChKU09OLnBhcnNlKGpzb24pKTtcbn1cblxuLyoqIFJlc3RvcmUgaW4gcGxhY2Ugc28gY29udHJvbGxlcnMgcmV0YWluIHRoZSBzYW1lIFdvcmxkIHJlZmVyZW5jZS4gQWxsXG4gKiB2YWxpZGF0aW9uIGhhcHBlbnMgYmVmb3JlIG11dGF0aW9uLCBzbyBhIHJlamVjdGVkIHNhdmUgY2Fubm90IGVyYXNlIHdvcmsuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQ6IFdvcmxkLCBpbnB1dDogV29ybGRTbmFwc2hvdCk6IHZvaWQge1xuICAvLyBPcmRpbmFyeSBzbmFwc2hvdHMgYW5kIHRyYW5zYWN0aW9uYWwgcm9sbGJhY2tzIHJlc3RvcmUgdGhlaXIgZXhhY3QgcmVjb3JkZWRcbiAgLy8gc3RhdGUuIFJldGlyZWQgaGlzdG9yaWNhbCBlbnRpdGllcyBhcmUgcmVtb3ZlZCBvbmx5IGFmdGVyIEdhbWVTZXNzaW9uIGhhc1xuICAvLyBhdXRoZW50aWNhdGVkIHRoZSBvcmlnaW5hbCBqb3VybmFsIGFuZCBleHBsaWNpdGx5IG1pZ3JhdGVkIHRoYXQgc2F2ZS5cbiAgZmluaXNoU3RvbmVSZXBsYXkod29ybGQpO1xuICByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0KHdvcmxkLCBpbnB1dCk7XG59XG5cbi8qKiBAaW50ZXJuYWwgSGlzdG9yaWNhbCByZWNvbnN0cnVjdGlvbiBvciBleGFjdCBuZXctc25hcHNob3QgcmVzdG9yYXRpb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCh3b3JsZDogV29ybGQsIGlucHV0OiBXb3JsZFNuYXBzaG90KTogdm9pZCB7XG4gIGNvbnN0IHNuYXBzaG90ID0gdmFsaWRhdGVXb3JsZFNuYXBzaG90KGlucHV0KTtcbiAgaWYgKHNuYXBzaG90Lm1hbmlmZXN0LnNlZWQgIT09IHdvcmxkLnNlZWQpIHRocm93IG5ldyBFcnJvcignc25hcHNob3Qgc2VlZCBkb2VzIG5vdCBtYXRjaCB0aGUgd29ybGQnKTtcbiAgd29ybGQucGFyYW1zID0ge1xuICAgIHNpemU6IHNuYXBzaG90Lm1hbmlmZXN0LnNpemUsXG4gICAgY2h1bmtTaXplOiBzbmFwc2hvdC5tYW5pZmVzdC5jaHVua1NpemUsXG4gICAgeU1pbjogc25hcHNob3QubWFuaWZlc3QueU1pbixcbiAgICB5TWF4OiBzbmFwc2hvdC5tYW5pZmVzdC55TWF4LFxuICAgIHNlYUxldmVsOiBzbmFwc2hvdC5tYW5pZmVzdC5zZWFMZXZlbCxcbiAgICBnZW5lcmF0b3JWZXJzaW9uOiBzbmFwc2hvdC5tYW5pZmVzdC5nZW5lcmF0b3JWZXJzaW9uLFxuICB9O1xuICB3b3JsZC5jaHVua3MuY2xlYXIoKTtcbiAgd29ybGQuZW50aXRpZXMuY2xlYXIoKTtcbiAgd29ybGQuZW50aXR5Q2h1bmtzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eUNoYW5nZXMuY2xlYXIoKTtcbiAgd29ybGQuZW50aXR5UmVtb3ZhbHMuY2xlYXIoKTtcbiAgd29ybGQuc3RydWN0dXJlcy5jbGVhcigpO1xuICB3b3JsZC5lZGl0cy5jbGVhcigpO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7IC4uLnNuYXBzaG90LmludmVudG9yeSB9O1xuICB3b3JsZC5saWZlID0gc25hcHNob3Quc2NoZW1hID09PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSA/IGNyZWF0ZUxpZmVTdGF0ZSgpIDogdW5kZWZpbmVkO1xuICBpZiAod29ybGQubGlmZSAmJiBzbmFwc2hvdC5zY2hlbWEgPT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BKSB7XG4gICAgd29ybGQubGlmZS50aWNrID0gc25hcHNob3QudGljaztcbiAgICBmb3IgKGNvbnN0IHMgb2Ygc25hcHNob3Quc3RvY2twaWxlcykgd29ybGQubGlmZS5zdG9ja3BpbGVzLnNldChzLmlkLCB7IC4uLnMsIGludmVudG9yeTogeyAuLi5zLmludmVudG9yeSB9IH0pO1xuICAgIGZvciAoY29uc3QgaiBvZiBzbmFwc2hvdC5qb2JzKSB3b3JsZC5saWZlLmpvYnMuc2V0KGouaWQsIHsgLi4uaiB9KTtcbiAgICBmb3IgKGNvbnN0IGMgb2Ygc25hcHNob3QuY3JvcHMpIHdvcmxkLmxpZmUuY3JvcHMuc2V0KGMuaWQsIHsgLi4uYyB9KTtcbiAgfVxuICB3b3JsZC5kaXJ0eS5jbGVhcigpO1xuICB3b3JsZC5zaXRlcyA9IFtdO1xuICB3b3JsZC5zdGF0cyA9IHtcbiAgICBjaHVua3NHZW5lcmF0ZWQ6IDAsIGNodW5rc0V2aWN0ZWQ6IDAsIHZveGVsc0ZpbGxlZDogMCwgZ2VuZXJhdGlvbk1zOiAwLFxuICAgIGVudGl0aWVzOiBzbmFwc2hvdC5lbnRpdGllcy5sZW5ndGgsIHRyZWVzOiAwLCBwaW5rVHJlZXM6IDAsIHBpbmtPdmVyZmxvdzogMCxcbiAgfTtcbiAgd29ybGQucmV2aXNpb24gPSBzbmFwc2hvdC5yZXZpc2lvbjtcbiAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSBzbmFwc2hvdC5hdXRob3JlZFBsYWNlZDtcbiAgZm9yIChjb25zdCBrZXkgb2Ygc25hcHNob3QuZW50aXR5Q2h1bmtzKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuICAvLyBBcHBseSBkdXJhYmxlIHZveGVsIGVkaXRzIGJlZm9yZSBhbnkgYXV0aG9yZWQtc2l0ZSBxdWVyeSBjYW4gZ2VuZXJhdGUgYVxuICAvLyBjaHVuay4gT3RoZXJ3aXNlIHRob3NlIGNodW5rcyBjYWNoZSB0aGUgdW5lZGl0ZWQgYmFzZSB0ZXJyYWluIHBlcm1hbmVudGx5LlxuICBmb3IgKGNvbnN0IGRlbHRhIG9mIHNuYXBzaG90LmVkaXRzKSB7XG4gICAgd29ybGQuZWRpdHMuc2V0KGRlbHRhLmNodW5rLCBuZXcgTWFwKGRlbHRhLmNlbGxzLm1hcCgoZSkgPT4gW2UuaSwgZS5tIGFzIE1hdElkXSkpKTtcbiAgfVxuICAvLyBSZWNyZWF0ZSBhdXRob3JlZCBzaXRlIHJlY29yZHMuIFN1cHByZXNzIHRoZWlyIGVudGl0eSBwbGFjZW1lbnQgc28gdGhlXG4gIC8vIGV4YWN0IHNhdmVkIGVudGl0eSByZWNvcmRzIGJlbG93IGNhbm5vdCBiZSBhZmZlY3RlZCBieSBhIG1vZGlmaWVkIGNodW5rLlxuICBpZiAod29ybGQuYXV0aG9yZWRQbGFjZWQpIHtcbiAgICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IGZhbHNlO1xuICAgIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gICAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSB0cnVlO1xuICB9XG4gIC8vIEF1dGhvcmVkIHBsYWNlbWVudCBkZXJpdmVzIHNpdGUvZW50aXR5IHNjYWZmb2xkaW5nIGFuZCBtYXkgYWR2YW5jZSB0aGVcbiAgLy8gcmV2aXNpb24uIFRoZSBzYXZlZCByZXZpc2lvbiBpcyByZXN0b3JlZCBvbmx5IGFmdGVyIHRoYXQgZGVyaXZlZCB3b3JrLlxuICB3b3JsZC5yZXZpc2lvbiA9IHNuYXBzaG90LnJldmlzaW9uO1xuICAvLyBUb21ic3RvbmVzIG11c3QgZXhpc3QgYmVmb3JlIGFueSBjaGFuZ2VkIGNodW5rIHJlZ2VuZXJhdGVzIGl0cyBlbnRpdGllcy5cbiAgZm9yIChjb25zdCBpZCBvZiBzbmFwc2hvdC5lbnRpdHlSZW1vdmFscykgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGlkKTtcbiAgLy8gUmVwbGFjZSBnZW5lcmF0ZWQgZW50aXRpZXMgd2l0aCB0aGUgZXhhY3Qgc2F2ZWQgcmVjb3JkcywgaW5jbHVkaW5nXG4gIC8vIGhhcnZlc3RlZC9yZW1vdmVkIG9uZXMuXG4gIHdvcmxkLmVudGl0aWVzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eUNodW5rcy5jbGVhcigpO1xuICAvLyBJbnN0YWxsIHBlcnNpc3RlZCBlbnRpdHkgZGVsdGFzIGRpcmVjdGx5LiBUaGlzIGlzIHJlY29uc3RydWN0aW9uLCBub3QgYVxuICAvLyBjb21tYW5kOiByZW1vdmVFbnRpdHkgd291bGQgY3JlYXRlIGZyZXNoIHRvbWJzdG9uZXMgYW5kIGFkdmFuY2UgcmV2aXNpb24uXG4gIGZvciAoY29uc3Qga2V5IG9mIHNuYXBzaG90LmVudGl0eUNodW5rcykge1xuICAgIGNvbnN0IFtjeCwgY3pdID0ga2V5LnNwbGl0KCcsJykubWFwKE51bWJlcik7XG4gICAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYHNuYXBzaG90IHJlZmVyZW5jZXMgdW5hdmFpbGFibGUgY2h1bmsgJHtrZXl9YCk7XG4gICAgY29uc3Qgc2F2ZWQgPSBuZXcgU2V0KHNuYXBzaG90LmVudGl0aWVzLmZpbHRlcigoZSkgPT4gZS5jaHVuayA9PT0ga2V5KS5tYXAoKGUpID0+IGUuaWQpKTtcbiAgICAvLyBBdXRob3JlZCBlbnRpdGllcyBmb3IgdGhlIHNhbWUgY2h1bmsgc3Vydml2ZSBhbG9uZ3NpZGUgbmF0dXJhbCBkZWx0YXMuXG4gICAgY29uc3QgaWRzID0gKHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXSkuZmlsdGVyKChpZCkgPT4ge1xuICAgICAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIHJldHVybiAhaWQuc3RhcnRzV2l0aCgnZTonKSAmJiAhIWVudGl0eVxuICAgICAgICAmJiAoIWlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgfHwgaXNTdG9uZVJlcGxheSh3b3JsZCkpO1xuICAgIH0pO1xuICAgIGZvciAoY29uc3QgaWQgb2YgWy4uLndvcmxkLmVudGl0aWVzLmtleXMoKV0pIHtcbiAgICAgIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoZW50aXR5Py5jaHVuayA9PT0ga2V5ICYmICFlbnRpdHkuYXV0aG9yZWQgJiYgIXNhdmVkLmhhcyhpZCkpIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgaWQgb2Ygc2F2ZWQpIGlmICghaWRzLmluY2x1ZGVzKGlkKSkgaWRzLnB1c2goaWQpO1xuICAgIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMpO1xuICB9XG4gIGZvciAoY29uc3QgZSBvZiBzbmFwc2hvdC5lbnRpdGllcykge1xuICAgIHdvcmxkLmVudGl0aWVzLnNldChlLmlkLCBjbG9uZUVudGl0eShlKSk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgb2Ygc25hcHNob3QuZW50aXR5Q2h1bmtzKSB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuICB3b3JsZC5zdGF0cy5lbnRpdGllcyA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChlLmtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIHNuYXBzaG90LnN0cnVjdHVyZXMpIHdvcmxkLnN0cnVjdHVyZXMuc2V0KHMuaWQsIGNsb25lU3RydWN0dXJlKHMpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdvcmxkRnJvbVNuYXBzaG90KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90KTogV29ybGQge1xuICBjb25zdCB2YWxpZCA9IHZhbGlkYXRlV29ybGRTbmFwc2hvdChzbmFwc2hvdCk7XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQodmFsaWQubWFuaWZlc3Quc2VlZCk7XG4gIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkLCB2YWxpZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuLyoqIFJhdyBvbGQgc3RhdGUgaXMgdXNlZCBvbmx5IHdoaWxlIHZhbGlkYXRpbmcgYSByZWNvcmRlZCBhY2NlcHRlZCBqb3VybmFsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhpc3RvcmljYWxXb3JsZEZyb21TbmFwc2hvdChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCk6IFdvcmxkIHtcbiAgY29uc3QgdmFsaWQgPSB2YWxpZGF0ZVdvcmxkU25hcHNob3Qoc25hcHNob3QpO1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHZhbGlkLm1hbmlmZXN0LnNlZWQpO1xuICBlbmFibGVTdG9uZVJlcGxheSh3b3JsZCk7XG4gIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3Qod29ybGQsIHZhbGlkKTtcbiAgcmV0dXJuIHdvcmxkO1xufVxuIiwgIi8vIE0wMDIgcGxheWFibGUgZmlyc3Qgc2xpY2UgXHUyMDE0IHRoZSB0aHJlZSBhdXRob3JlZCBwcm9qZWN0cyBhcyBwbGFpbiBkYXRhLlxuLy9cbi8vIFRoaXMgbW9kdWxlIGlzIGRlbGliZXJhdGVseSBET00tZnJlZS4gVGhlIGJ1aWxkIHNpZGViYXIsIHRoZSBnaG9zdCBwcmV2aWV3XG4vLyBhbmQgdGhlIHRlc3RzIGFsbCByZWFkIHRoZSBzYW1lIGRlZmluaXRpb25zIGFuZCBjYWxsIHRoZSBzYW1lIHNpbXVsYXRpb25cbi8vIGVudHJ5IHBvaW50czsgYSBwcm9qZWN0IGNhbm5vdCBhZHZlcnRpc2Ugb25lIGZvb3RwcmludCwgcHJpY2Ugb3IgcHJlcGFyYXRpb25cbi8vIHN0ZXAgYW5kIHRoZW4gZXhlY3V0ZSBhbm90aGVyLlxuaW1wb3J0IHsgTUFULCBXb3JsZCwgUmVzb3VyY2VUeXBlIH0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuLi9zaW0vdGVycmFpbic7XG5pbXBvcnQge1xuICBCdWlsZGluZ1J1bGVzLCBIT1VTRV9SVUxFUywgUEFUSF9SVUxFUywgRkFSTV9SVUxFUyxcbiAgU2l0ZVByb3Bvc2FsLCBTaXRlUHJldmlldywgU2l0ZVN0YXRlLCBWYWxpZGF0aW9uUmVhc29uLCBwcmV2aWV3U2l0ZSxcbn0gZnJvbSAnLi4vc2ltL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBNMDAyX0xBWU9VVCwgTTAwMl9QQVRIX1NJVEVfSUQsIE0wMDJfVEVSUkFDRV9CQU5EUyxcbn0gZnJvbSAnLi4vc2ltL20wMDInO1xuaW1wb3J0IHtcbiAgbTAwMkZhcm1UYXJnZXRzLCBtMDAyUGF0aFJlY3QsIG0wMDJQYXRoVGFyZ2V0cyxcbn0gZnJvbSAnLi4vc2ltL3NjZW5hcmlvJztcbmltcG9ydCB7XG4gIENvbHVtblRhcmdldCwgTG9jYWxBdXRob3JpemVyLCBQcmVwYXJhdGlvbkxlZGdlciwgUHJlcGFyYXRpb25PcHRpb25zLFxuICBQbGFuUmVzdWx0LCBwbGFuUHJlcGFyYXRpb24sIHByZXBhcmVTaXRlLFxufSBmcm9tICcuLi9zaW0vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHsgY3JlYXRlV29ybGRTbmFwc2hvdCwgcmVzdG9yZVdvcmxkU25hcHNob3QgfSBmcm9tICcuLi9zaW0vc25hcHNob3QnO1xuXG5pbXBvcnQge1xuICBIT1VTRV9DT1NULCBURVJSQUNFX0NPU1QsIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgU3RydWN0dXJlLFxuICBTdHJ1Y3R1cmVLaW5kLCBTdHJ1Y3R1cmVMZWRnZXIsIFN0cnVjdHVyZVByb3Bvc2FsLCBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uLFxuICBidWlsZFN0cnVjdHVyZSwgcGF0aENvc3QsXG59IGZyb20gJy4uL3NpbS9zdHJ1Y3R1cmVzJztcblxuZXhwb3J0IHR5cGUgTTJQcm9qZWN0SWQgPSAnaG91c2UnIHwgJ3BhdGgnIHwgJ2Zhcm0nO1xuXG5leHBvcnQgaW50ZXJmYWNlIE0yR2hvc3RCYW5kIHtcbiAgejA6IG51bWJlcjtcbiAgejE6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0yUHJvamVjdCB7XG4gIGlkOiBNMlByb2plY3RJZDtcbiAgbmFtZTogc3RyaW5nO1xuICBzdWJ0aXRsZTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICBjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgdGVycmFjZXM/OiBudW1iZXI7XG4gIHByZXA6IFByZXBhcmF0aW9uT3B0aW9ucztcbiAgZ2hvc3RCYW5kcz86IHJlYWRvbmx5IE0yR2hvc3RCYW5kW107XG59XG5cbmNvbnN0IHBhdGhSZWN0ID0gbTAwMlBhdGhSZWN0KCk7XG5jb25zdCBwYXRoVGFyZ2V0czogQ29sdW1uVGFyZ2V0W10gPSBtMDAyUGF0aFRhcmdldHMoKTtcbmNvbnN0IGZhcm1UYXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IG0wMDJGYXJtVGFyZ2V0cygpO1xuXG4vKipcbiAqIFRoZSBmaXJzdCBwbGF5YWJsZSBzbGljZSBpbiB0aGUgcGlubmVkIG9yZGVyOiBhIGhvdXNlIG9uIHRoZSBwcmVwYXJlZCBzaGVsZixcbiAqIGEgc3RlcHBlZCBwYXRoIGZyb20gaXRzIGRvb3IsIGFuZCBhIHRlcnJhY2VkIGZpZWxkIG9uIHRoZSBzbG9wZSBiZWxvdy5cbiAqL1xuZXhwb3J0IGNvbnN0IE0yX1BST0pFQ1RTOiByZWFkb25seSBNMlByb2plY3RbXSA9IFtcbiAge1xuICAgIGlkOiAnaG91c2UnLFxuICAgIG5hbWU6IFwiRm91bmRlcidzIGhvdXNlXCIsXG4gICAgc3VidGl0bGU6ICc4IHggNiBtIFx1MDBCNyBmbGF0IHN0b25lIHNoZWxmJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgMTktbW9kdWxlIGZvdW5kZXIgY2FuZGlkYXRlIHVzZXMgYSBmbGF0IHN0b25lIGZvdW5kYXRpb24sIGEgMy4yIG0gc3RvcmV5LCBhIHJlYWwgZWFzdCBkb29yd2F5ICdcbiAgICAgICsgJ2FuZCB0d28gb3BlbiBzb3V0aCB3aW5kb3dzLiBTdHJ1Y3R1cmFsIHdhbGwgdm9pZHMgcmVxdWlyZSBtb3JlIHByaW1pdGl2ZXMgdGhhbiB0aGUgcHJvdmlzaW9uYWwgJ1xuICAgICAgKyAnYXNzZXQtdm9sdW1lIHRhcmdldDsgdGhpcyBkZXNpZ24gcmVtYWlucyBzdWJqZWN0IHRvIGFydCByZXZpZXcuJyxcbiAgICBzaXRlSWQ6IE0wMDJfTEFZT1VULmhvdXNlLmlkLFxuICAgIGtpbmQ6ICdob3VzZScsXG4gICAgcmVjdDogTTAwMl9MQVlPVVQuaG91c2UucmVjdCxcbiAgICBmbG9vclk6IE0wMDJfTEFZT1VULmhvdXNlLmZsb29yWSxcbiAgICBydWxlczogSE9VU0VfUlVMRVMsXG4gICAgY29zdDogeyAuLi5IT1VTRV9DT1NUIH0sXG4gICAgZG9vcjogTTAwMl9MQVlPVVQuaG91c2UuZG9vcixcbiAgICBhcHByb2FjaDogTTAwMl9MQVlPVVQuaG91c2UuYXBwcm9hY2gsXG4gICAgcHJlcDoge30sXG4gIH0sXG4gIHtcbiAgICBpZDogJ3BhdGgnLFxuICAgIG5hbWU6ICdEb29yIHBhdGgnLFxuICAgIHN1YnRpdGxlOiAnOSB4IDMgbSBcdTAwQjcgc3RlcHBlZCBncmF2ZWwnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ0EgbmluZS1tZXRyZSBjb3JyaWRvciBmcm9tIHRoZSBob3VzZSBkb29yIHRvIHRoZSBhcHByb2FjaC4gJ1xuICAgICAgKyAnRWFjaCBjb2x1bW4gaXMgY3V0IHRvIGEgcGlubmVkIHByb2ZpbGUgc28gdGhlIHJpc2Ugc3RheXMgd2Fsa2FibGUuJyxcbiAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgIGtpbmQ6ICdwYXRoJyxcbiAgICByZWN0OiBwYXRoUmVjdCxcbiAgICBmbG9vclk6IDEyLFxuICAgIHJ1bGVzOiBQQVRIX1JVTEVTLFxuICAgIGNvc3Q6IHBhdGhDb3N0KHBhdGhSZWN0LngxIC0gcGF0aFJlY3QueDAgKyAxKSxcbiAgICBwcmVwOiB7XG4gICAgICB0YXJnZXRzOiBwYXRoVGFyZ2V0cyxcbiAgICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULkdSQVZFTCxcbiAgICAgIGVudmVsb3BlOiBbTTAwMl9MQVlPVVQuZW52ZWxvcGVbMV1dLFxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICBpZDogJ2Zhcm0nLFxuICAgIG5hbWU6ICdUZXJyYWNlZCBmaWVsZCcsXG4gICAgc3VidGl0bGU6ICcxMiB4IDggbSBcdTAwQjcgdGhyZWUgYmFuZHMnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RocmVlIHNvaWwgdGVycmFjZXMgc3RlcHBpbmcgZG93biB0aGUgc2xvcGUsIGhlbGQgYnkgc3RvbmUgcmV0YWluaW5nIHdhbGxzLiAnXG4gICAgICArICdUaGUgYmxvc3NvbSB0cmVlIG9uIHRoZSBmaWVsZCBpcyBjbGVhcmVkIGR1cmluZyBwcmVwYXJhdGlvbi4nLFxuICAgIHNpdGVJZDogTTAwMl9MQVlPVVQuZmFybS5pZCxcbiAgICBraW5kOiAndGVycmFjZScsXG4gICAgcmVjdDogTTAwMl9MQVlPVVQuZmFybS5yZWN0LFxuICAgIGZsb29yWTogMTUsXG4gICAgcnVsZXM6IEZBUk1fUlVMRVMsXG4gICAgY29zdDogeyAuLi5URVJSQUNFX0NPU1QgfSxcbiAgICB0ZXJyYWNlczogTTAwMl9MQVlPVVQuZmFybS50ZXJyYWNlcyxcbiAgICBwcmVwOiB7XG4gICAgICB0YXJnZXRzOiBmYXJtVGFyZ2V0cyxcbiAgICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULlNPSUwsXG4gICAgICBlbnZlbG9wZTogW00wMDJfTEFZT1VULmVudmVsb3BlWzJdXSxcbiAgICB9LFxuICAgIGdob3N0QmFuZHM6IE0wMDJfVEVSUkFDRV9CQU5EUyxcbiAgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0QnlJZChpZDogTTJQcm9qZWN0SWQpOiBNMlByb2plY3Qge1xuICBjb25zdCBwcm9qZWN0ID0gTTJfUFJPSkVDVFMuZmluZCgocCkgPT4gcC5pZCA9PT0gaWQpO1xuICBpZiAoIXByb2plY3QpIHRocm93IG5ldyBFcnJvcihgdW5rbm93biBNMDAyIHByb2plY3Q6ICR7aWR9YCk7XG4gIHJldHVybiBwcm9qZWN0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdFNpdGVQcm9wb3NhbChwcm9qZWN0OiBNMlByb2plY3QpOiBTaXRlUHJvcG9zYWwge1xuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvamVjdC5zaXRlSWQsXG4gICAgcmVjdDogcHJvamVjdC5yZWN0LFxuICAgIGZsb29yWTogcHJvamVjdC5mbG9vclksXG4gICAgcnVsZXM6IHByb2plY3QucnVsZXMsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0U3RydWN0dXJlUHJvcG9zYWwoXG4gIHByb2plY3Q6IE0yUHJvamVjdCwgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb24sXG4pOiBTdHJ1Y3R1cmVQcm9wb3NhbCB7XG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9qZWN0LnNpdGVJZCxcbiAgICBraW5kOiBwcm9qZWN0LmtpbmQsXG4gICAgcmVjdDogcHJvamVjdC5yZWN0LFxuICAgIGZsb29yWTogcHJvamVjdC5mbG9vclksXG4gICAgZG9vcjogcHJvamVjdC5kb29yLFxuICAgIGFwcHJvYWNoOiBwcm9qZWN0LmFwcHJvYWNoLFxuICAgIHRlcnJhY2VzOiBwcm9qZWN0LnRlcnJhY2VzLFxuICAgIC4uLihkZXNpZ25WZXJzaW9uID09PSB1bmRlZmluZWQgPyB7fSA6IHsgZGVzaWduVmVyc2lvbiB9KSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUHJvamVjdEJ1aWx0KHdvcmxkOiBXb3JsZCwgcHJvamVjdDogTTJQcm9qZWN0KTogYm9vbGVhbiB7XG4gIGZvciAoY29uc3Qgc3RydWN0dXJlIG9mIHdvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoc3RydWN0dXJlLnNpdGVJZCA9PT0gcHJvamVjdC5zaXRlSWQgJiYgc3RydWN0dXJlLmtpbmQgPT09IHByb2plY3Qua2luZCkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbmdSZXNvdXJjZSB7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGU7XG4gIG5lZWQ6IG51bWJlcjtcbiAgaGF2ZTogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWlzc2luZ1Jlc291cmNlcyh3b3JsZDogV29ybGQsIHByb2plY3Q6IE0yUHJvamVjdCk6IE1pc3NpbmdSZXNvdXJjZVtdIHtcbiAgY29uc3QgbWlzc2luZzogTWlzc2luZ1Jlc291cmNlW10gPSBbXTtcbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocHJvamVjdC5jb3N0KSkge1xuICAgIGNvbnN0IG5lZWQgPSBhbW91bnQgPz8gMDtcbiAgICBjb25zdCBoYXZlID0gd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwO1xuICAgIGlmIChoYXZlIDwgbmVlZCkgbWlzc2luZy5wdXNoKHsgcmVzb3VyY2U6IHJlc291cmNlIGFzIFJlc291cmNlVHlwZSwgbmVlZCwgaGF2ZSB9KTtcbiAgfVxuICByZXR1cm4gbWlzc2luZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0SW5zcGVjdGlvbiB7XG4gIHByb2plY3RJZDogTTJQcm9qZWN0SWQ7XG4gIGJ1aWx0OiBib29sZWFuO1xuICBhZmZvcmRhYmxlOiBib29sZWFuO1xuICBtaXNzaW5nOiBNaXNzaW5nUmVzb3VyY2VbXTtcbiAgc3RhdGU6IFNpdGVTdGF0ZTtcbiAgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdO1xuICBwcmV2aWV3OiBTaXRlUHJldmlldztcbiAgcGxhbjogUGxhblJlc3VsdDtcbiAgY2FuQnVpbGQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogUmVhZC1vbmx5IGluc3BlY3Rpb24gZm9yIHRoZSBnaG9zdCBhbmQgc2lkZWJhci4gSXQgcnVucyB0aGUgc2FtZSB2YWxpZGF0b3JcbiAqIGFuZCB0aGUgc2FtZSBwcmVwYXJhdGlvbiBwbGFubmVyIHRoZSBidWlsZCBidXR0b24gd2lsbCBydW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnNwZWN0UHJvamVjdCh3b3JsZDogV29ybGQsIHByb2plY3Q6IE0yUHJvamVjdCk6IFByb2plY3RJbnNwZWN0aW9uIHtcbiAgY29uc3QgcHJvcG9zYWwgPSBwcm9qZWN0U2l0ZVByb3Bvc2FsKHByb2plY3QpO1xuICBjb25zdCBwcmV2aWV3ID0gcHJldmlld1NpdGUod29ybGQsIHByb3Bvc2FsLCB7XG4gICAgZG9vcjogcHJvamVjdC5kb29yLFxuICAgIGFwcHJvYWNoOiBwcm9qZWN0LmFwcHJvYWNoLFxuICB9KTtcbiAgY29uc3QgcGxhbiA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwsIHByb2plY3QucHJlcCk7XG4gIGNvbnN0IGJ1aWx0ID0gaXNQcm9qZWN0QnVpbHQod29ybGQsIHByb2plY3QpO1xuICBjb25zdCBtaXNzaW5nID0gbWlzc2luZ1Jlc291cmNlcyh3b3JsZCwgcHJvamVjdCk7XG4gIGNvbnN0IHN0YXRlID0gcGxhbi5vayA/IHBsYW4udmFsaWRhdGlvbi5zdGF0ZSA6IHByZXZpZXcuc3RhdGU7XG4gIGNvbnN0IHJlYXNvbnMgPSBwbGFuLm9rID8gcGxhbi52YWxpZGF0aW9uLnJlYXNvbnMgOiBwcmV2aWV3LnJlYXNvbnM7XG5cbiAgcmV0dXJuIHtcbiAgICBwcm9qZWN0SWQ6IHByb2plY3QuaWQsXG4gICAgYnVpbHQsXG4gICAgYWZmb3JkYWJsZTogbWlzc2luZy5sZW5ndGggPT09IDAsXG4gICAgbWlzc2luZyxcbiAgICBzdGF0ZSxcbiAgICByZWFzb25zLFxuICAgIHByZXZpZXcsXG4gICAgcGxhbixcbiAgICBjYW5CdWlsZDogIWJ1aWx0ICYmIG1pc3NpbmcubGVuZ3RoID09PSAwICYmIHBsYW4ub2sgJiYgc3RhdGUgIT09ICdpbnZhbGlkJyxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0QnVpbGRTdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHByb2plY3Q6IE0yUHJvamVjdDtcbiAgcHJlcGFyYXRpb246IFByZXBhcmF0aW9uTGVkZ2VyO1xuICBzdHJ1Y3R1cmU6IFN0cnVjdHVyZUxlZGdlcjtcbiAgcmVjb3JkOiBTdHJ1Y3R1cmU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvamVjdEJ1aWxkRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgcHJvamVjdDogTTJQcm9qZWN0O1xuICBzdGFnZTogJ3ByZWNoZWNrJyB8ICdwcmVwYXJlJyB8ICdzdHJ1Y3R1cmUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xuICBwcmVwYXJhdGlvbj86IFByZXBhcmF0aW9uTGVkZ2VyO1xuICAvKiogRmFpbGVkIGJ1aWxkcyByb2xsIGJhY2sgdGhlIGVudGlyZSBhdXRob3JpdGF0aXZlIHByZS1idWlsZCBzbmFwc2hvdC4gKi9cbiAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZTtcbiAgcmV0cnlhYmxlOiB0cnVlO1xufVxuXG5leHBvcnQgdHlwZSBQcm9qZWN0QnVpbGRSZXN1bHQgPSBQcm9qZWN0QnVpbGRTdWNjZXNzIHwgUHJvamVjdEJ1aWxkRmFpbHVyZTtcblxuLyoqXG4gKiBQcmVwYXJlIHRoZSBzaXRlIGFuZCBjb25zdHJ1Y3QgdGhlIHByb2plY3QgdGhyb3VnaCB0aGUgYXV0aG9yaXplZCBwaXBlbGluZS5cbiAqIFRoZSByZXNvdXJjZSBjaGVjayBoYXBwZW5zIGJlZm9yZSBhbnkgdGVycmFpbiBlZGl0LCBzbyBhbiB1bmFmZm9yZGFibGUgYnVpbGRcbiAqIGNhbm5vdCBsZWF2ZSBhIGdyYWRlZCBwYWQgYmVoaW5kLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRQcm9qZWN0KFxuICB3b3JsZDogV29ybGQsXG4gIHByZXBBdXRob3JpemVyOiBMb2NhbEF1dGhvcml6ZXIsXG4gIHN0cnVjdHVyZUF1dGhvcml6ZXI6IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcixcbiAgcHJvamVjdDogTTJQcm9qZWN0LFxuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbixcbik6IFByb2plY3RCdWlsZFJlc3VsdCB7XG4gIGlmIChpc1Byb2plY3RCdWlsdCh3b3JsZCwgcHJvamVjdCkpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3ByZWNoZWNrJywgY29kZTogJ2FscmVhZHlfYnVpbHQnLFxuICAgICAgcmVhc29uczogW2Ake3Byb2plY3QubmFtZX0gaXMgYWxyZWFkeSBidWlsdGBdLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cbiAgY29uc3QgbWlzc2luZyA9IG1pc3NpbmdSZXNvdXJjZXMod29ybGQsIHByb2plY3QpO1xuICBpZiAobWlzc2luZy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdwcmVjaGVjaycsIGNvZGU6ICdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJyxcbiAgICAgIHJlYXNvbnM6IG1pc3NpbmcubWFwKChtKSA9PiBgbmVlZCAke20ubmVlZH0gJHttLnJlc291cmNlfSwgaGF2ZSAke20uaGF2ZX1gKSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgYmVmb3JlID0gY3JlYXRlV29ybGRTbmFwc2hvdCh3b3JsZCwgMCk7XG4gIGNvbnN0IHByZXBhcmVkID0gcHJlcGFyZVNpdGUod29ybGQsIHByZXBBdXRob3JpemVyLCBwcm9qZWN0U2l0ZVByb3Bvc2FsKHByb2plY3QpLCBwcm9qZWN0LnByZXApO1xuICBpZiAoIXByZXBhcmVkLm9rKSB7XG4gICAgcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQsIGJlZm9yZSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdwcmVwYXJlJywgY29kZTogcHJlcGFyZWQuY29kZSxcbiAgICAgIHJlYXNvbnM6IFsuLi5wcmVwYXJlZC5yZWFzb25zLCAnTm8gcHJlcGFyYXRpb24sIHJlc291cmNlIG9yIGVudGl0eSBjaGFuZ2VzIHdlcmUgcmV0YWluZWQuJ10sXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IGJ1aWx0ID0gYnVpbGRTdHJ1Y3R1cmUod29ybGQsIHN0cnVjdHVyZUF1dGhvcml6ZXIsIHByb2plY3RTdHJ1Y3R1cmVQcm9wb3NhbChwcm9qZWN0LCBkZXNpZ25WZXJzaW9uKSk7XG4gIGlmICghYnVpbHQub2spIHtcbiAgICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgYmVmb3JlKTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3N0cnVjdHVyZScsIGNvZGU6IGJ1aWx0LmNvZGUsXG4gICAgICByZWFzb25zOiBbLi4uYnVpbHQucmVhc29ucyxcbiAgICAgICAgJ0FsbCBwcmVwYXJhdGlvbiwgcmVzb3VyY2UgYW5kIGVudGl0eSBjaGFuZ2VzIHdlcmUgcm9sbGVkIGJhY2s7IHRoZSBidWlsZCBjYW4gYmUgcmV0cmllZC4nXSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgcmVjb3JkID0gd29ybGQuc3RydWN0dXJlcy5nZXQoYnVpbHQubGVkZ2VyLnN0cnVjdHVyZUlkKTtcbiAgaWYgKCFyZWNvcmQpIHtcbiAgICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgYmVmb3JlKTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLCBwcm9qZWN0LCBzdGFnZTogJ3N0cnVjdHVyZScsIGNvZGU6ICdtaXNzaW5nX3JlY29yZCcsXG4gICAgICByZWFzb25zOiBbJ3N0cnVjdHVyZSBsZWRnZXIgd2FzIHdyaXR0ZW4gYnV0IHRoZSB3b3JsZCBoYXMgbm8gcmVjb3JkJyxcbiAgICAgICAgJ0FsbCBwcmVwYXJhdGlvbiwgcmVzb3VyY2UgYW5kIGVudGl0eSBjaGFuZ2VzIHdlcmUgcm9sbGVkIGJhY2s7IHRoZSBidWlsZCBjYW4gYmUgcmV0cmllZC4nXSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBwcm9qZWN0LFxuICAgIHByZXBhcmF0aW9uOiBwcmVwYXJlZC5sZWRnZXIsXG4gICAgc3RydWN0dXJlOiBidWlsdC5sZWRnZXIsXG4gICAgcmVjb3JkLFxuICB9O1xufVxuIiwgIi8vIFRoZSBzb2xlIHdyaXRlIGJvdW5kYXJ5IGZvciB0aGUgcGxheWFibGUgTTAwMiBzbGljZS4gQWNjZXB0ZWQgY29tbWFuZHMgYXJlXG4vLyBkdXJhYmxlIGlucHV0OyByZWplY3RlZCBhdHRlbXB0cywgcmVuZGVyZXIgd29yayBhbmQgdGVycmFpbiBxdWVyaWVzIGFyZSBub3QuXG5pbXBvcnQge1xuICBFbnRpdHksIFJlc291cmNlVHlwZSwgV29ybGQsIGNyZWF0ZVdvcmxkLCBnZW5lcmF0ZVdvcmxkLCBoYXJ2ZXN0RW50aXR5LCBwbGFjZUF1dGhvcmVkU2l0ZXMsXG4gIHJldGlyZVN0b25lRW50aXRpZXMsIGlzUmV0aXJlZFN0b25lS2luZCxcbn0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IE0wMDJfTEFZT1VUIH0gZnJvbSAnLi4vc2ltL20wMDInO1xuaW1wb3J0IHsgTG9jYWxBdXRob3JpemVyIH0gZnJvbSAnLi4vc2ltL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7IExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiB9IGZyb20gJy4uL3NpbS9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7IE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkgfSBmcm9tICcuLi9zaW0vc2NlbmFyaW8nO1xuaW1wb3J0IHtcbiAgV29ybGRTbmFwc2hvdCwgY2Fub25pY2FsV29ybGRIYXNoLCBjcmVhdGVXb3JsZFNuYXBzaG90LFxuICBsZWdhY3lTdG9uZUhhc2gsIG1pZ3JhdGVTdG9uZVNuYXBzaG90LCByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0LCB2YWxpZGF0ZVdvcmxkU25hcHNob3QsIHdvcmxkRnJvbVNuYXBzaG90LFxufSBmcm9tICcuLi9zaW0vc25hcHNob3QnO1xuaW1wb3J0IHsgZW5hYmxlU3RvbmVSZXBsYXksIGZpbmlzaFN0b25lUmVwbGF5IH0gZnJvbSAnLi4vc2ltL3N0b25lLWNvbXBhdCc7XG5pbXBvcnQgeyBNMlByb2plY3RJZCwgYnVpbGRQcm9qZWN0LCBwcm9qZWN0QnlJZCB9IGZyb20gJy4vcHJvamVjdHMnO1xuaW1wb3J0IHtcbiAgRk9VTkRFUl9TVE9DS1BJTEVfSUQsIExJRkVfUkVTT1VSQ0VTLCBMaWZlUmVzb3VyY2UsIExpZmVSZXNvdXJjZUJhZywgUkVDSVBFUywgUmVjaXBlSWQsXG4gIGFkdmFuY2VUaWNrcywgY3JlYXRlTGlmZVN0YXRlLCBoYXJ2ZXN0Q3JvcCwgcGxhbnRDcm9wLCBzdGFydFByb2R1Y3Rpb24sIHRyYW5zZmVyLFxufSBmcm9tICcuLi9zaW0vZWNvbm9teSc7XG5cbmV4cG9ydCBjb25zdCBKT1VSTkFMX1NDSEVNQSA9IDEgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgREVTSUdOX0pPVVJOQUxfU0NIRU1BID0gMiBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BID0gMyBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBNQVhfSk9VUk5BTF9FTlRSSUVTID0gMTAwXzAwMDtcbmV4cG9ydCB0eXBlIENvbW1hbmQgPSBMZWdhY3lCdWlsZENvbW1hbmQgfCBCdWlsZENvbW1hbmQgfCBIYXJ2ZXN0Q29tbWFuZFxuICB8IFRyYW5zZmVyQ29tbWFuZCB8IFByb2R1Y2VDb21tYW5kIHwgVGlja0NvbW1hbmQgfCBQbGFudENvbW1hbmQgfCBIYXJ2ZXN0Q3JvcENvbW1hbmQ7XG5pbnRlcmZhY2UgQ29tbWFuZEVudmVsb3BlIHtcbiAgc2NoZW1hOiB0eXBlb2YgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBUcmFuc2ZlckNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUge1xuICB0eXBlOiAnZGVwb3NpdCcgfCAnd2l0aGRyYXcnO1xuICBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICByZXNvdXJjZXM6IExpZmVSZXNvdXJjZUJhZztcbn1cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZHVjZUNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUge1xuICB0eXBlOiAncHJvZHVjZSc7IHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7IHJlY2lwZToga2V5b2YgdHlwZW9mIFJFQ0lQRVM7XG59XG5leHBvcnQgaW50ZXJmYWNlIFRpY2tDb21tYW5kIGV4dGVuZHMgQ29tbWFuZEVudmVsb3BlIHsgdHlwZTogJ3RpY2snOyB0aWNrczogbnVtYmVyOyB9XG5leHBvcnQgaW50ZXJmYWNlIFBsYW50Q29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7IHR5cGU6ICdwbGFudCc7IHBsb3RJZDogc3RyaW5nOyB9XG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RDcm9wQ29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7IHR5cGU6ICdoYXJ2ZXN0X2Nyb3AnOyBwbG90SWQ6IHN0cmluZzsgfVxuZXhwb3J0IGludGVyZmFjZSBMZWdhY3lCdWlsZENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBKT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgdHlwZTogJ2J1aWxkJztcbiAgcHJvamVjdElkOiBNMlByb2plY3RJZDtcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBCdWlsZENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBERVNJR05fSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgdHlwZTogJ2J1aWxkJztcbiAgcHJvamVjdElkOiBNMlByb2plY3RJZDtcbiAgZXhwZWN0ZWRSZXZpc2lvbjogbnVtYmVyO1xuICBkZXNpZ25WZXJzaW9uOiB0eXBlb2YgRk9VTkRFUl9ERVNJR05fVkVSU0lPTjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdENvbW1hbmQge1xuICBzY2hlbWE6IHR5cGVvZiBKT1VSTkFMX1NDSEVNQSB8IHR5cGVvZiBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BO1xuICBpZDogc3RyaW5nO1xuICB0eXBlOiAnaGFydmVzdCc7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGV4cGVjdGVkUmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgQ29tbWFuZE91dGNvbWUgPSBCdWlsZE91dGNvbWUgfCBIYXJ2ZXN0T3V0Y29tZSB8IFRyYW5zZmVyT3V0Y29tZSB8IFByb2R1Y2VPdXRjb21lIHwgVGlja091dGNvbWUgfCBQbGFudE91dGNvbWUgfCBDcm9wT3V0Y29tZTtcbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNmZXJPdXRjb21lIHtcbiAgdHlwZTogJ2RlcG9zaXQnIHwgJ3dpdGhkcmF3Jzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVzb3VyY2VzOiBQYXJ0aWFsPFJlY29yZDxMaWZlUmVzb3VyY2UsIG51bWJlcj4+O1xufVxuZXhwb3J0IGludGVyZmFjZSBQcm9kdWNlT3V0Y29tZSB7XG4gIHR5cGU6ICdwcm9kdWNlJzsgam9iSWQ6IHN0cmluZzsgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVjaXBlOiBrZXlvZiB0eXBlb2YgUkVDSVBFUzsgcmVtYWluaW5nVGlja3M6IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgVGlja091dGNvbWUge1xuICB0eXBlOiAndGljayc7IGZyb21UaWNrOiBudW1iZXI7IHRvVGljazogbnVtYmVyO1xuICBjb21wbGV0ZWRKb2JzOiBBcnJheTx7IGlkOiBzdHJpbmc7IHJlY2lwZToga2V5b2YgdHlwZW9mIFJFQ0lQRVM7IG91dHB1dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB9PjtcbiAgcmVhZHlDcm9wczogc3RyaW5nW107XG59XG5leHBvcnQgaW50ZXJmYWNlIFBsYW50T3V0Y29tZSB7XG4gIHR5cGU6ICdwbGFudCc7IHBsb3RJZDogc3RyaW5nOyBwbGFudGVkVGljazogbnVtYmVyOyBncm93dGhUaWNrczogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBDcm9wT3V0Y29tZSB7XG4gIHR5cGU6ICdoYXJ2ZXN0X2Nyb3AnOyBwbG90SWQ6IHN0cmluZzsgcmVzb3VyY2VzOiB7IGZvb2Q6IG51bWJlcjsgZmliZXI6IG51bWJlciB9O1xufVxuZXhwb3J0IGludGVyZmFjZSBCdWlsZE91dGNvbWUge1xuICB0eXBlOiAnYnVpbGQnO1xuICBzdHJ1Y3R1cmVJZDogc3RyaW5nO1xuICBjb3N0UGFpZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xufVxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0T3V0Y29tZSB7XG4gIHR5cGU6ICdoYXJ2ZXN0JztcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZTtcbiAgYW1vdW50OiBudW1iZXI7XG59XG5leHBvcnQgaW50ZXJmYWNlIEpvdXJuYWxFbnRyeSB7XG4gIGNvbW1hbmQ6IENvbW1hbmQ7XG4gIHNlcXVlbmNlOiBudW1iZXI7XG4gIHJldmlzaW9uOiBudW1iZXI7XG4gIGhhc2g6IHN0cmluZztcbiAgb3V0Y29tZTogQ29tbWFuZE91dGNvbWU7XG59XG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRKb3VybmFsIHtcbiAgc2NoZW1hOiB0eXBlb2YgSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX0pPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUE7XG4gIHNlZWQ6IG51bWJlcjtcbiAgc3RhcnRlckludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgZW50cmllczogSm91cm5hbEVudHJ5W107XG59XG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRSZWNlaXB0IHtcbiAgb2s6IHRydWU7XG4gIGR1cGxpY2F0ZTogYm9vbGVhbjtcbiAgaWQ6IHN0cmluZztcbiAgc2VxdWVuY2U6IG51bWJlcjtcbiAgcmV2aXNpb246IG51bWJlcjtcbiAgaGFzaDogc3RyaW5nO1xuICBvdXRjb21lOiBDb21tYW5kT3V0Y29tZTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQ29tbWFuZFJlamVjdGlvbiB7XG4gIG9rOiBmYWxzZTtcbiAgZHVwbGljYXRlOiBmYWxzZTtcbiAgaWQ6IHN0cmluZztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZnVuY3Rpb24gb2JqZWN0KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5mdW5jdGlvbiB1aW50KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzU2FmZUludGVnZXIodmFsdWUpICYmIHZhbHVlID49IDA7XG59XG5mdW5jdGlvbiBpZCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIC9eW0EtWmEtejAtOV1bQS1aYS16MC05Ll86JS1dezAsMTI3fSQvLnRlc3QodmFsdWUpO1xufVxuZnVuY3Rpb24gZW50aXR5SWQodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZS5sZW5ndGggPD0gMTI4XG4gICAgJiYgKC9eZTpcXGQrLFxcZCs6XFxkKyQvLnRlc3QodmFsdWUpXG4gICAgICB8fCAvXmhlcm86c3R5bF9bYS16X10rOi0/XFxkKzotP1xcZCskLy50ZXN0KHZhbHVlKSk7XG59XG5mdW5jdGlvbiBzYW1lRmllbGRzKGE6IHVua25vd24sIGI6IHVua25vd24pOiBib29sZWFuIHtcbiAgaWYgKG9iamVjdChhKSAmJiBvYmplY3QoYikpIHtcbiAgICBjb25zdCBhS2V5cyA9IE9iamVjdC5rZXlzKGEpLnNvcnQoKSwgYktleXMgPSBPYmplY3Qua2V5cyhiKS5zb3J0KCk7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFLZXlzKSA9PT0gSlNPTi5zdHJpbmdpZnkoYktleXMpXG4gICAgICAmJiBhS2V5cy5ldmVyeSgoa2V5KSA9PiBzYW1lRmllbGRzKGFba2V5XSwgYltrZXldKSk7XG4gIH1cbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGEpID09PSBKU09OLnN0cmluZ2lmeShiKTtcbn1cblxuZnVuY3Rpb24gaW52ZW50b3J5KHZhbHVlOiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlc291cmNlIHJlY29yZCcpO1xuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModmFsdWUpLnNvcnQoKSkge1xuICAgIGlmICghTElGRV9SRVNPVVJDRVMuaW5jbHVkZXMoa2V5IGFzIExpZmVSZXNvdXJjZSlcbiAgICAgIHx8ICF1aW50KHZhbHVlW2tleV0pIHx8IHZhbHVlW2tleV0gPD0gMCB8fCB2YWx1ZVtrZXldID4gMV8wMDBfMDAwXzAwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlc291cmNlIHJlY29yZCcpO1xuICAgIH1cbiAgICByZXN1bHRba2V5XSA9IHZhbHVlW2tleV07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqIENhbm9uaWNhbGl6ZSBhbmQgcmVqZWN0IHVua25vd24sIGFtYmlndW91cyBvciBtYWxmb3JtZWQgY29tbWFuZCBmaWVsZHMuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVDb21tYW5kKHZhbHVlOiB1bmtub3duKTogQ29tbWFuZCB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSB8fCAodmFsdWUuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IERFU0lHTl9KT1VSTkFMX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpXG4gICAgfHwgIWlkKHZhbHVlLmlkKSB8fCAhdWludCh2YWx1ZS5leHBlY3RlZFJldmlzaW9uKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgZW52ZWxvcGUnKTtcbiAgaWYgKHZhbHVlLnR5cGUgPT09ICdidWlsZCcgJiYgWydob3VzZScsICdwYXRoJywgJ2Zhcm0nXS5pbmNsdWRlcyhTdHJpbmcodmFsdWUucHJvamVjdElkKSkpIHtcbiAgICBjb25zdCBjb21tYW5kOiBDb21tYW5kID0gdmFsdWUuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSA/IHtcbiAgICAgIHNjaGVtYTogdmFsdWUuc2NoZW1hLCBpZDogdmFsdWUuaWQsIHR5cGU6ICdidWlsZCcsXG4gICAgICBwcm9qZWN0SWQ6IHZhbHVlLnByb2plY3RJZCBhcyBNMlByb2plY3RJZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbixcbiAgICAgIGRlc2lnblZlcnNpb246IHZhbHVlLmRlc2lnblZlcnNpb24gYXMgdHlwZW9mIEZPVU5ERVJfREVTSUdOX1ZFUlNJT04sXG4gICAgfSA6IHtcbiAgICAgIHNjaGVtYTogSk9VUk5BTF9TQ0hFTUEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogJ2J1aWxkJyxcbiAgICAgIHByb2plY3RJZDogdmFsdWUucHJvamVjdElkIGFzIE0yUHJvamVjdElkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uLFxuICAgIH07XG4gICAgaWYgKGNvbW1hbmQuc2NoZW1hICE9PSBKT1VSTkFMX1NDSEVNQSAmJiBjb21tYW5kLmRlc2lnblZlcnNpb24gIT09IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgc3RydWN0dXJlIGRlc2lnbicpO1xuICAgIH1cbiAgICBpZiAoIXNhbWVGaWVsZHMoY29tbWFuZCwgdmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgYnVpbGQgY29tbWFuZCcpO1xuICAgIHJldHVybiBjb21tYW5kO1xuICB9XG4gIGlmICh2YWx1ZS50eXBlID09PSAnaGFydmVzdCcgJiYgdmFsdWUuc2NoZW1hID09PSBKT1VSTkFMX1NDSEVNQSAmJiBlbnRpdHlJZCh2YWx1ZS5lbnRpdHlJZCkpIHtcbiAgICBjb25zdCBjb21tYW5kOiBDb21tYW5kID0ge1xuICAgICAgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogJ2hhcnZlc3QnLFxuICAgICAgZW50aXR5SWQ6IHZhbHVlLmVudGl0eUlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uLFxuICAgIH07XG4gICAgaWYgKCFzYW1lRmllbGRzKGNvbW1hbmQsIHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGhhcnZlc3QgY29tbWFuZCcpO1xuICAgIHJldHVybiBjb21tYW5kO1xuICB9XG4gIGlmICh2YWx1ZS5zY2hlbWEgPT09IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpIHtcbiAgICBjb25zdCBiYXNlID0geyBzY2hlbWE6IHZhbHVlLnNjaGVtYSwgaWQ6IHZhbHVlLmlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uIH07XG4gICAgbGV0IGNvbW1hbmQ6IENvbW1hbmQgfCBudWxsID0gbnVsbDtcbiAgICBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3QnICYmIGVudGl0eUlkKHZhbHVlLmVudGl0eUlkKSkge1xuICAgICAgY29tbWFuZCA9IHsgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIGlkOiB2YWx1ZS5pZCwgdHlwZTogdmFsdWUudHlwZSxcbiAgICAgICAgZW50aXR5SWQ6IHZhbHVlLmVudGl0eUlkLCBleHBlY3RlZFJldmlzaW9uOiB2YWx1ZS5leHBlY3RlZFJldmlzaW9uIH07XG4gICAgfSBlbHNlIGlmICgodmFsdWUudHlwZSA9PT0gJ2RlcG9zaXQnIHx8IHZhbHVlLnR5cGUgPT09ICd3aXRoZHJhdycpICYmIHZhbHVlLnN0b2NrcGlsZUlkID09PSBGT1VOREVSX1NUT0NLUElMRV9JRCkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLCByZXNvdXJjZXM6IGludmVudG9yeSh2YWx1ZS5yZXNvdXJjZXMpIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAncHJvZHVjZScgJiYgdmFsdWUuc3RvY2twaWxlSWQgPT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEXG4gICAgICAmJiAodmFsdWUucmVjaXBlID09PSAnc2VlZCcgfHwgdmFsdWUucmVjaXBlID09PSAncmF0aW9ucycpKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCBzdG9ja3BpbGVJZDogdmFsdWUuc3RvY2twaWxlSWQsIHJlY2lwZTogdmFsdWUucmVjaXBlIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAndGljaycgJiYgdWludCh2YWx1ZS50aWNrcykgJiYgdmFsdWUudGlja3MgPiAwICYmIHZhbHVlLnRpY2tzIDw9IDY0KSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCB0aWNrczogdmFsdWUudGlja3MgfTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdwbGFudCcgJiYgdHlwZW9mIHZhbHVlLnBsb3RJZCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdCh2YWx1ZS5wbG90SWQpKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCBwbG90SWQ6IHZhbHVlLnBsb3RJZCB9O1xuICAgIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcgJiYgdHlwZW9mIHZhbHVlLnBsb3RJZCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdCh2YWx1ZS5wbG90SWQpKSB7XG4gICAgICBjb21tYW5kID0geyAuLi5iYXNlLCB0eXBlOiB2YWx1ZS50eXBlLCBwbG90SWQ6IHZhbHVlLnBsb3RJZCB9O1xuICAgIH1cbiAgICBpZiAoY29tbWFuZCkge1xuICAgICAgaWYgKCFzYW1lRmllbGRzKGNvbW1hbmQsIHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGxpZmUtbG9vcCBjb21tYW5kJyk7XG4gICAgICByZXR1cm4gY29tbWFuZDtcbiAgICB9XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBjb21tYW5kJyk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlT3V0Y29tZSh2YWx1ZTogdW5rbm93bik6IENvbW1hbmRPdXRjb21lIHtcbiAgaWYgKCFvYmplY3QodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgY29tbWFuZCBvdXRjb21lJyk7XG4gIGlmICh2YWx1ZS50eXBlID09PSAnYnVpbGQnICYmIGlkKHZhbHVlLnN0cnVjdHVyZUlkKSkge1xuICAgIGNvbnN0IG91dGNvbWU6IENvbW1hbmRPdXRjb21lID0ge1xuICAgICAgdHlwZTogJ2J1aWxkJywgc3RydWN0dXJlSWQ6IHZhbHVlLnN0cnVjdHVyZUlkLFxuICAgICAgY29zdFBhaWQ6IGludmVudG9yeSh2YWx1ZS5jb3N0UGFpZCksIHJlc291cmNlc0dhaW5lZDogaW52ZW50b3J5KHZhbHVlLnJlc291cmNlc0dhaW5lZCksXG4gICAgfTtcbiAgICBpZiAoSlNPTi5zdHJpbmdpZnkob3V0Y29tZSkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGJ1aWxkIG91dGNvbWUnKTtcbiAgICByZXR1cm4gb3V0Y29tZTtcbiAgfVxuICBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3QnICYmIGVudGl0eUlkKHZhbHVlLmVudGl0eUlkKVxuICAgICYmIFsnd29vZCcsICdzdG9uZScsICdvcmUnLCAnZmliZXInXS5pbmNsdWRlcyhTdHJpbmcodmFsdWUucmVzb3VyY2UpKVxuICAgICYmIHVpbnQodmFsdWUuYW1vdW50KSAmJiB2YWx1ZS5hbW91bnQgPiAwICYmIHZhbHVlLmFtb3VudCA8PSAxXzAwMF8wMDApIHtcbiAgICBjb25zdCBvdXRjb21lOiBDb21tYW5kT3V0Y29tZSA9IHtcbiAgICAgIHR5cGU6ICdoYXJ2ZXN0JywgZW50aXR5SWQ6IHZhbHVlLmVudGl0eUlkLFxuICAgICAgcmVzb3VyY2U6IHZhbHVlLnJlc291cmNlIGFzIFJlc291cmNlVHlwZSwgYW1vdW50OiB2YWx1ZS5hbW91bnQsXG4gICAgfTtcbiAgICBpZiAoSlNPTi5zdHJpbmdpZnkob3V0Y29tZSkgIT09IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGhhcnZlc3Qgb3V0Y29tZScpO1xuICAgIHJldHVybiBvdXRjb21lO1xuICB9XG4gIGxldCBvdXRjb21lOiBDb21tYW5kT3V0Y29tZSB8IG51bGwgPSBudWxsO1xuICBpZiAoKHZhbHVlLnR5cGUgPT09ICdkZXBvc2l0JyB8fCB2YWx1ZS50eXBlID09PSAnd2l0aGRyYXcnKSAmJiB2YWx1ZS5zdG9ja3BpbGVJZCA9PT0gRk9VTkRFUl9TVE9DS1BJTEVfSUQpIHtcbiAgICBvdXRjb21lID0geyB0eXBlOiB2YWx1ZS50eXBlLCBzdG9ja3BpbGVJZDogdmFsdWUuc3RvY2twaWxlSWQsIHJlc291cmNlczogaW52ZW50b3J5KHZhbHVlLnJlc291cmNlcykgfTtcbiAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAncHJvZHVjZScgJiYgaWQodmFsdWUuam9iSWQpICYmIHZhbHVlLnN0b2NrcGlsZUlkID09PSBGT1VOREVSX1NUT0NLUElMRV9JRFxuICAgICYmICh2YWx1ZS5yZWNpcGUgPT09ICdzZWVkJyB8fCB2YWx1ZS5yZWNpcGUgPT09ICdyYXRpb25zJykgJiYgdWludCh2YWx1ZS5yZW1haW5pbmdUaWNrcykgJiYgdmFsdWUucmVtYWluaW5nVGlja3MgPiAwKSB7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgam9iSWQ6IHZhbHVlLmpvYklkLCBzdG9ja3BpbGVJZDogdmFsdWUuc3RvY2twaWxlSWQsXG4gICAgICByZWNpcGU6IHZhbHVlLnJlY2lwZSwgcmVtYWluaW5nVGlja3M6IHZhbHVlLnJlbWFpbmluZ1RpY2tzIH07XG4gIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3BsYW50JyAmJiB0eXBlb2YgdmFsdWUucGxvdElkID09PSAnc3RyaW5nJyAmJiAvXmNyb3A6WzAtOF0kLy50ZXN0KHZhbHVlLnBsb3RJZClcbiAgICAmJiB1aW50KHZhbHVlLnBsYW50ZWRUaWNrKSAmJiB2YWx1ZS5ncm93dGhUaWNrcyA9PT0gNCkge1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIHBsb3RJZDogdmFsdWUucGxvdElkLCBwbGFudGVkVGljazogdmFsdWUucGxhbnRlZFRpY2ssIGdyb3d0aFRpY2tzOiB2YWx1ZS5ncm93dGhUaWNrcyB9O1xuICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnICYmIHR5cGVvZiB2YWx1ZS5wbG90SWQgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QodmFsdWUucGxvdElkKVxuICAgICYmIGlzUmVzb3VyY2VzKHZhbHVlLnJlc291cmNlcykgJiYgdmFsdWUucmVzb3VyY2VzLmZvb2QgPT09IDYgJiYgdmFsdWUucmVzb3VyY2VzLmZpYmVyID09PSAxKSB7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgcGxvdElkOiB2YWx1ZS5wbG90SWQsIHJlc291cmNlczogeyBmb29kOiA2LCBmaWJlcjogMSB9IH07XG4gIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3RpY2snICYmIHVpbnQodmFsdWUuZnJvbVRpY2spICYmIHVpbnQodmFsdWUudG9UaWNrKVxuICAgICYmIHZhbHVlLnRvVGljayA+IHZhbHVlLmZyb21UaWNrICYmIHZhbHVlLnRvVGljayAtIHZhbHVlLmZyb21UaWNrIDw9IDY0XG4gICAgJiYgQXJyYXkuaXNBcnJheSh2YWx1ZS5jb21wbGV0ZWRKb2JzKSAmJiBBcnJheS5pc0FycmF5KHZhbHVlLnJlYWR5Q3JvcHMpKSB7XG4gICAgY29uc3QgY29tcGxldGVkSm9iczogQXJyYXk8eyBpZDogc3RyaW5nOyByZWNpcGU6IFJlY2lwZUlkOyBvdXRwdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfT4gPSB2YWx1ZS5jb21wbGV0ZWRKb2JzLm1hcCgocmF3OiB1bmtub3duKSA9PiB7XG4gICAgICBpZiAoIW9iamVjdChyYXcpIHx8ICFpZChyYXcuaWQpIHx8IChyYXcucmVjaXBlICE9PSAnc2VlZCcgJiYgcmF3LnJlY2lwZSAhPT0gJ3JhdGlvbnMnKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbXBsZXRlZCBqb2InKTtcbiAgICAgIHJldHVybiB7IGlkOiByYXcuaWQsIHJlY2lwZTogcmF3LnJlY2lwZSwgb3V0cHV0OiBpbnZlbnRvcnkocmF3Lm91dHB1dCkgfTtcbiAgICB9KTtcbiAgICBpZiAoIXZhbHVlLnJlYWR5Q3JvcHMuZXZlcnkoKHBsb3QpID0+IHR5cGVvZiBwbG90ID09PSAnc3RyaW5nJyAmJiAvXmNyb3A6WzAtOF0kLy50ZXN0KHBsb3QpKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlYWR5IGNyb3BzJyk7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgZnJvbVRpY2s6IHZhbHVlLmZyb21UaWNrLCB0b1RpY2s6IHZhbHVlLnRvVGljayxcbiAgICAgIGNvbXBsZXRlZEpvYnMsIHJlYWR5Q3JvcHM6IFsuLi52YWx1ZS5yZWFkeUNyb3BzXSB9O1xuICB9XG4gIGlmIChvdXRjb21lKSB7XG4gICAgaWYgKEpTT04uc3RyaW5naWZ5KG91dGNvbWUpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBsaWZlLWxvb3Agb3V0Y29tZScpO1xuICAgIHJldHVybiBvdXRjb21lO1xuICB9XG4gIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBjb21tYW5kIG91dGNvbWUnKTtcbn1cblxuZnVuY3Rpb24gaXNSZXNvdXJjZXModmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgcmV0dXJuIG9iamVjdCh2YWx1ZSkgJiYgT2JqZWN0LnZhbHVlcyh2YWx1ZSkuZXZlcnkoKGFtb3VudCkgPT4gdWludChhbW91bnQpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUpvdXJuYWwoc2VlZCA9IDEzMzcsIHNjaGVtYTogQ29tbWFuZEpvdXJuYWxbJ3NjaGVtYSddID0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSk6IENvbW1hbmRKb3VybmFsIHtcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWEsIHNlZWQsXG4gICAgc3RhcnRlckludmVudG9yeTogaW52ZW50b3J5KE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkpLCBlbnRyaWVzOiBbXSxcbiAgfTtcbn1cblxuLyoqIFZhbGlkYXRlIGFuIGVudGlyZSBqb3VybmFsIHdpdGhvdXQgY2hhbmdpbmcgYSBsaXZlIHNlc3Npb24uICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVKb3VybmFsKHZhbHVlOiB1bmtub3duKTogQ29tbWFuZEpvdXJuYWwge1xuICBpZiAoIW9iamVjdCh2YWx1ZSkgfHwgKHZhbHVlLnNjaGVtYSAhPT0gSk9VUk5BTF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBERVNJR05fSk9VUk5BTF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKVxuICAgIHx8ICF1aW50KHZhbHVlLnNlZWQpIHx8IHZhbHVlLnNlZWQgPiAweGZmZmZmZmZmXG4gICAgfHwgIUFycmF5LmlzQXJyYXkodmFsdWUuZW50cmllcykgfHwgdmFsdWUuZW50cmllcy5sZW5ndGggPiBNQVhfSk9VUk5BTF9FTlRSSUVTKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgam91cm5hbCcpO1xuICB9XG4gIGNvbnN0IGpvdXJuYWw6IENvbW1hbmRKb3VybmFsID0ge1xuICAgIHNjaGVtYTogdmFsdWUuc2NoZW1hLCBzZWVkOiB2YWx1ZS5zZWVkLFxuICAgIHN0YXJ0ZXJJbnZlbnRvcnk6IGludmVudG9yeSh2YWx1ZS5zdGFydGVySW52ZW50b3J5KSwgZW50cmllczogW10sXG4gIH07XG4gIGNvbnN0IGlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmVudHJpZXMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCByYXcgPSB2YWx1ZS5lbnRyaWVzW2ldO1xuICAgIGlmICghb2JqZWN0KHJhdykgfHwgcmF3LnNlcXVlbmNlICE9PSBpIHx8ICF1aW50KHJhdy5yZXZpc2lvbilcbiAgICAgIHx8IHR5cGVvZiByYXcuaGFzaCAhPT0gJ3N0cmluZycgfHwgIS9eWzAtOWEtZl17MTZ9JC8udGVzdChyYXcuaGFzaCkpIHRocm93IG5ldyBFcnJvcignbm9uLWNvbnRpZ3VvdXMgb3IgaW52YWxpZCBqb3VybmFsIGVudHJ5Jyk7XG4gICAgY29uc3QgZW50cnk6IEpvdXJuYWxFbnRyeSA9IHtcbiAgICAgIGNvbW1hbmQ6IHZhbGlkYXRlQ29tbWFuZChyYXcuY29tbWFuZCksIHNlcXVlbmNlOiBpLFxuICAgICAgcmV2aXNpb246IHJhdy5yZXZpc2lvbiwgaGFzaDogcmF3Lmhhc2gsIG91dGNvbWU6IHZhbGlkYXRlT3V0Y29tZShyYXcub3V0Y29tZSksXG4gICAgfTtcbiAgICBpZiAoKGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2J1aWxkJyB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0JylcbiAgICAgICYmIGVudHJ5LmNvbW1hbmQuc2NoZW1hICE9PSB2YWx1ZS5zY2hlbWEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignam91cm5hbCBzY2hlbWEgYW5kIGJ1aWxkIGNvbW1hbmQgc2NoZW1hIGRpZmZlcicpO1xuICAgIH1cbiAgICBpZiAoSlNPTi5zdHJpbmdpZnkoZW50cnkpICE9PSBKU09OLnN0cmluZ2lmeShyYXcpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgam91cm5hbCBlbnRyeScpO1xuICAgIGlmIChpZHMuaGFzKGVudHJ5LmNvbW1hbmQuaWQpKSB0aHJvdyBuZXcgRXJyb3IoJ2R1cGxpY2F0ZSBqb3VybmFsIGNvbW1hbmQgaWQnKTtcbiAgICBpZiAoZW50cnkuY29tbWFuZC50eXBlICE9PSBlbnRyeS5vdXRjb21lLnR5cGVcbiAgICAgIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnICYmIGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ2hhcnZlc3QnXG4gICAgICAmJiBlbnRyeS5jb21tYW5kLmVudGl0eUlkICE9PSBlbnRyeS5vdXRjb21lLmVudGl0eUlkXG4gICAgICB8fCAoZW50cnkuY29tbWFuZC50eXBlID09PSAncGxhbnQnIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3RfY3JvcCcpXG4gICAgICAmJiBlbnRyeS5jb21tYW5kLnR5cGUgPT09IGVudHJ5Lm91dGNvbWUudHlwZSAmJiBlbnRyeS5jb21tYW5kLnBsb3RJZCAhPT0gZW50cnkub3V0Y29tZS5wbG90SWRcbiAgICAgIHx8IChlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdkZXBvc2l0JyB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICd3aXRoZHJhdycpXG4gICAgICAmJiBlbnRyeS5jb21tYW5kLnR5cGUgPT09IGVudHJ5Lm91dGNvbWUudHlwZVxuICAgICAgJiYgKGVudHJ5LmNvbW1hbmQuc3RvY2twaWxlSWQgIT09IGVudHJ5Lm91dGNvbWUuc3RvY2twaWxlSWRcbiAgICAgICAgfHwgSlNPTi5zdHJpbmdpZnkoZW50cnkuY29tbWFuZC5yZXNvdXJjZXMpICE9PSBKU09OLnN0cmluZ2lmeShlbnRyeS5vdXRjb21lLnJlc291cmNlcykpXG4gICAgICB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdwcm9kdWNlJyAmJiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICdwcm9kdWNlJ1xuICAgICAgJiYgKGVudHJ5LmNvbW1hbmQuc3RvY2twaWxlSWQgIT09IGVudHJ5Lm91dGNvbWUuc3RvY2twaWxlSWQgfHwgZW50cnkuY29tbWFuZC5yZWNpcGUgIT09IGVudHJ5Lm91dGNvbWUucmVjaXBlKVxuICAgICAgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAndGljaycgJiYgZW50cnkub3V0Y29tZS50eXBlID09PSAndGljaydcbiAgICAgICYmIGVudHJ5Lm91dGNvbWUudG9UaWNrIC0gZW50cnkub3V0Y29tZS5mcm9tVGljayAhPT0gZW50cnkuY29tbWFuZC50aWNrcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdqb3VybmFsIGNvbW1hbmQgYW5kIG91dGNvbWUgZGlzYWdyZWUnKTtcbiAgICB9XG4gICAgaWRzLmFkZChlbnRyeS5jb21tYW5kLmlkKTtcbiAgICBqb3VybmFsLmVudHJpZXMucHVzaChlbnRyeSk7XG4gIH1cbiAgaWYgKEpTT04uc3RyaW5naWZ5KGpvdXJuYWwpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBjb21tYW5kIGpvdXJuYWwnKTtcbiAgLy8gVGhpcyBzbGljZSBoYXMgb25lIGRldGVybWluaXN0aWMgZ2VuZXNpcyBjb25maWd1cmF0aW9uLiBBIGNoYW5nZWQgc3RhcnRlclxuICAvLyBncmFudCBtdXN0IG5vdCBwYXNzIHVubm90aWNlZCB3aGVuIHJlcGxheSBiZWdpbnMgZnJvbSBhIGxhdGVyIHNuYXBzaG90LlxuICBpZiAoSlNPTi5zdHJpbmdpZnkoam91cm5hbC5zdGFydGVySW52ZW50b3J5KSAhPT0gSlNPTi5zdHJpbmdpZnkoY3JlYXRlSm91cm5hbCh2YWx1ZS5zZWVkLCB2YWx1ZS5zY2hlbWEpLnN0YXJ0ZXJJbnZlbnRvcnkpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdqb3VybmFsIHN0YXJ0ZXIgaW52ZW50b3J5IGlzIGluY29tcGF0aWJsZSB3aXRoIHRoaXMgdmVyc2lvbicpO1xuICB9XG4gIHJldHVybiBqb3VybmFsO1xufVxuXG5mdW5jdGlvbiByZWZlcmVuY2VzUmV0aXJlZFN0b25lKGVudHJ5OiBKb3VybmFsRW50cnkpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9eaGVybzpzdHlsX3JvY2tfKD86c21hbGx8bWVkaXVtfGxhcmdlKTovLnRlc3QoXG4gICAgZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcgPyBlbnRyeS5jb21tYW5kLmVudGl0eUlkIDogZW50cnkub3V0Y29tZS50eXBlID09PSAnaGFydmVzdCcgPyBlbnRyeS5vdXRjb21lLmVudGl0eUlkIDogJycsXG4gICk7XG59XG5cbmV4cG9ydCBjbGFzcyBHYW1lU2Vzc2lvbiB7XG4gIHJlYWRvbmx5IGpvdXJuYWw6IENvbW1hbmRKb3VybmFsO1xuICBwcml2YXRlIHJlYWRvbmx5IHByZXBBdXRob3JpemVyOiBMb2NhbEF1dGhvcml6ZXI7XG4gIHByaXZhdGUgcmVhZG9ubHkgc3RydWN0dXJlQXV0aG9yaXplcjogTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyO1xuICBwcml2YXRlIHJlYWRvbmx5IGlkcyA9IG5ldyBNYXA8c3RyaW5nLCBKb3VybmFsRW50cnk+KCk7XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcihyZWFkb25seSB3b3JsZDogV29ybGQsIGpvdXJuYWw6IENvbW1hbmRKb3VybmFsKSB7XG4gICAgdGhpcy5qb3VybmFsID0gam91cm5hbDtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGpvdXJuYWwuZW50cmllcykgdGhpcy5pZHMuc2V0KGVudHJ5LmNvbW1hbmQuaWQsIGVudHJ5KTtcbiAgICB0aGlzLnByZXBBdXRob3JpemVyID0gbmV3IExvY2FsQXV0aG9yaXplcih7IGVudmVsb3BlOiBNMDAyX0xBWU9VVC5lbnZlbG9wZSB9KTtcbiAgICB0aGlzLnN0cnVjdHVyZUF1dGhvcml6ZXIgPSBuZXcgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pO1xuICB9XG5cbiAgc3RhdGljIGdlbmVzaXMoc2VlZCA9IDEzMzcpOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0dXJuIG5ldyBHYW1lU2Vzc2lvbihnZW5lc2lzV29ybGQoc2VlZCksIGNyZWF0ZUpvdXJuYWwoc2VlZCkpO1xuICB9XG5cbiAgLyoqIENvbXBhdGliaWxpdHkgZW50cnkgcG9pbnQgZm9yIHJlY29yZGVkIE0wMDIgZml4dHVyZXMgYW5kIHNhdmVkIHdvcmxkcy4gKi9cbiAgc3RhdGljIGxlZ2FjeUdlbmVzaXMoc2VlZCA9IDEzMzcsIHNjaGVtYTogdHlwZW9mIEpPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9KT1VSTkFMX1NDSEVNQSA9IEpPVVJOQUxfU0NIRU1BKTogR2FtZVNlc3Npb24ge1xuICAgIHJldHVybiBuZXcgR2FtZVNlc3Npb24oZ2VuZXNpc1dvcmxkKHNlZWQsIGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSwgc2NoZW1hKSwgY3JlYXRlSm91cm5hbChzZWVkLCBzY2hlbWEpKTtcbiAgfVxuXG4gIC8qKiBSZXBsYXkgYWNjZXB0ZWQgY29tbWFuZHMgaW4gdGhlaXIgYXV0aG9yaXRhdGl2ZSBvcmRlciBmcm9tIGFuIGVtcHR5IHdvcmxkLlxuICAgKiBBIG5vcm1hbCByZXBsYXkgaXMgYXR0ZW1wdGVkIGZpcnN0OiBzdG9uZSBmcm9tIHJldGFpbmVkIGNhaXJucyBhbmQgYnVpbGRpbmdcbiAgICogcHJlcGFyYXRpb24gbXVzdCBub3QgZm9yY2UgaGlzdG9yaWNhbCBtb2RlLiBSYXcgb2xkIGpvdXJuYWxzIGVudGVyIHByaXZhdGVcbiAgICogcmVjb25zdHJ1Y3Rpb24gb25seSB3aGVuIHRoZWlyIG9yaWdpbmFsIHN0b25lIG9ic3RydWN0aW9ucyByZXF1aXJlZCBpdC4gKi9cbiAgc3RhdGljIHJlcGxheShpbnB1dDogdW5rbm93bik6IEdhbWVTZXNzaW9uIHtcbiAgICBjb25zdCBqb3VybmFsID0gdmFsaWRhdGVKb3VybmFsKGlucHV0KTtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlcGxheUN1cnJlbnQoam91cm5hbCk7XG4gICAgfSBjYXRjaCAoY3VycmVudEVycm9yKSB7XG4gICAgICBpZiAoIWpvdXJuYWwuZW50cmllcy5zb21lKGNvbnRhaW5zUmV0aXJlZFN0b25lKSkgdGhyb3cgY3VycmVudEVycm9yO1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKS5zZXNzaW9uO1xuICAgICAgfSBjYXRjaCAoaGlzdG9yaWNhbEVycm9yKSB7XG4gICAgICAgIC8vIEFuIGFscmVhZHktbWlncmF0ZWQgam91cm5hbCBoYXMgcmV3cml0dGVuIGhhc2hlczsgdmVyaWZ5IGl0cyByZXRhaW5lZFxuICAgICAgICAvLyBzdG9uZSBjb21tYW5kcyBub3JtYWxseSBpbnN0ZWFkIG9mIGFjY2VwdGluZyB0aGUgZmFpbGVkIG9sZCByZXBsYXkuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlcGxheUN1cnJlbnQoam91cm5hbCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHRocm93IGhpc3RvcmljYWxFcnJvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKiBSZXN0b3JlIGEgdmFsaWRhdGVkIHNuYXBzaG90LCB0aGVuIHJlcGxheSBvbmx5IGl0cyBhY2NlcHRlZC1jb21tYW5kIHRhaWwuICovXG4gIHN0YXRpYyByZXN0b3JlKHNuYXBzaG90SW5wdXQ6IFdvcmxkU25hcHNob3QsIGpvdXJuYWxJbnB1dDogdW5rbm93bik6IEdhbWVTZXNzaW9uIHtcbiAgICBjb25zdCBqb3VybmFsID0gdmFsaWRhdGVKb3VybmFsKGpvdXJuYWxJbnB1dCk7XG4gICAgY29uc3Qgc25hcHNob3QgPSB2YWxpZGF0ZVdvcmxkU25hcHNob3Qoc25hcHNob3RJbnB1dCk7XG4gICAgaWYgKHNuYXBzaG90LnNjaGVtYSAhPT0gam91cm5hbC5zY2hlbWEpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgYW5kIGpvdXJuYWwgc2NoZW1hcyBkaWZmZXInKTtcbiAgICBjb25zdCBuZXh0ID0gc25hcHNob3QubmV4dFNlcXVlbmNlO1xuICAgIGlmIChuZXh0ID4gam91cm5hbC5lbnRyaWVzLmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBpcyBhaGVhZCBvZiB0aGUgam91cm5hbCcpO1xuICAgIC8vIEN1cnJlbnQgc2F2ZXMgKGluY2x1ZGluZyBldmVyeSBtaWdyYXRlZCBib3VuZGFyeSkga2VlcCB0aGVpciBleGFjdCBoYXNoLlxuICAgIC8vIFRyeSB0aGVtIGJlZm9yZSByZWNvbnN0cnVjdGluZyBhIGNvbXBhdGlibGUgb2xkIGpvdXJuYWwuIERlcG9zaXQtb25seVxuICAgIC8vIG1pZ3JhdGVkIHNhdmVzIG5vIGxvbmdlciBjYXJyeSBhbiBleHBsaWNpdCBzdG9uZSBjb21tYW5kIHRvIGNsYXNzaWZ5IHRoZW0uXG4gICAgaWYgKCFzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpKSB7XG4gICAgICB0cnkgeyByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpOyB9IGNhdGNoIHsgLyogYXV0aGVudGljYXRlZCBtaWdyYXRpb24gYmVsb3cgKi8gfVxuICAgIH1cbiAgICBpZiAobmV4dCA+IDAgfHwgc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgLy8gQSBib3VuZGFyeSBhdXRoZW50aWNhdGVkIGR1cmluZyBtaWdyYXRpb24gaXMgY29tcGFyZWQgd2l0aCB0aGUgbWlncmF0ZWRcbiAgICAgIC8vIHN0YXRlOyBhIHJhdyBvbGQgYm91bmRhcnkgaXMgY29tcGFyZWQgd2l0aCB0aGUgb3JpZ2luYWwgaGlzdG9yaWNhbCBvbmUuXG4gICAgICAvLyBCb3RoIHBhdGhzIGF1dGhlbnRpY2F0ZSB0aGUgY29tcGxldGUgb3JpZ2luYWwgYWNjZXB0ZWQgam91cm5hbCBmaXJzdC5cbiAgICAgIGNvbnN0IGhpc3RvcmljYWwgPSBqb3VybmFsLmVudHJpZXMuc29tZShyZWZlcmVuY2VzUmV0aXJlZFN0b25lKVxuICAgICAgICB8fCBzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpO1xuICAgICAgLy8gQSBtaWdyYXRlZCBzYXZlIG5vIGxvbmdlciBjb250YWlucyByZXRpcmVkIGVudGl0aWVzLiBJdHMgcmV3cml0dGVuXG4gICAgICAvLyBib3VuZGFyeSBoYXNoZXMgZGVzY3JpYmUgdGhlIGZpbHRlcmVkIHN0YXRlLCBzbyBvcmRpbmFyeSByZXN0b3JhdGlvblxuICAgICAgLy8gbXVzdCBzdWNjZWVkIGJlZm9yZSB0cnlpbmcgdG8gaW50ZXJwcmV0IGl0IGFzIHJhdyBvbGQtc2F2ZSBieXRlcy5cbiAgICAgIC8vIEEgcmVmZXJlbmNlZCBhdXRob3JlZCBzdG9uZSBhbG9uZSBkb2VzICpub3QqIGltcGx5IGEgcmF3IG9sZCBib3VuZGFyeTpcbiAgICAgIC8vIGxlZ2l0aW1hdGUgc2F2ZXMgY2FuIGNvbnRhaW4gdW50b3VjaGVkIG5hdHVyYWwgcmV0aXJlZCBkZXBvc2l0cyBvbmx5LlxuICAgICAgaWYgKCFzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpKSB7XG4gICAgICAgIHRyeSB7IHJldHVybiBHYW1lU2Vzc2lvbi5yZXN0b3JlQ3VycmVudChzbmFwc2hvdCwgam91cm5hbCwgbmV4dCk7IH0gY2F0Y2ggeyAvKiB0cnkgb3JpZ2luYWwgcmVjb25zdHJ1Y3Rpb24gKi8gfVxuICAgICAgfVxuICAgICAgaWYgKGhpc3RvcmljYWwpIHtcbiAgICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZCA9IEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKTtcbiAgICAgICAgY29uc3QgZXhwZWN0ZWQgPSByZWNvbnN0cnVjdGVkLnNuYXBzaG90cy5nZXQobmV4dCk7XG4gICAgICAgIGNvbnN0IG1pZ3JhdGVkID0gZXhwZWN0ZWQgPyBtaWdyYXRlU3RvbmVTbmFwc2hvdChleHBlY3RlZCkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGlmIChtaWdyYXRlZCAmJiBsZWdhY3lTdG9uZUhhc2goc25hcHNob3QpID09PSBsZWdhY3lTdG9uZUhhc2gobWlncmF0ZWQpKVxuICAgICAgICAgIHJldHVybiByZWNvbnN0cnVjdGVkLnNlc3Npb247XG4gICAgICAgIGlmIChzbmFwc2hvdC5lbnRpdGllcy5zb21lKChlbnRpdHkpID0+IGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpXG4gICAgICAgICAgJiYgZXhwZWN0ZWQgJiYgbGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90KSA9PT0gbGVnYWN5U3RvbmVIYXNoKGV4cGVjdGVkKSlcbiAgICAgICAgICByZXR1cm4gcmVjb25zdHJ1Y3RlZC5zZXNzaW9uO1xuICAgICAgICBpZiAoc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignaGlzdG9yaWNhbCBzbmFwc2hvdCBkb2VzIG5vdCBtYXRjaCBpdHMgb3JpZ2luYWwgam91cm5hbCBib3VuZGFyeScpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuZXh0ID4gMCkgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTtcbiAgICBjb25zdCBoaXN0b3JpY2FsID0gam91cm5hbC5lbnRyaWVzLnNvbWUoY29udGFpbnNSZXRpcmVkU3RvbmUpO1xuICAgIGlmIChoaXN0b3JpY2FsKSB7XG4gICAgICB0cnkgeyByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpOyB9IGNhdGNoIHsgLyogcmF3IG9yIG1pZ3JhdGVkIGdlbmVzaXMgKi8gfVxuICAgICAgY29uc3QgcmVjb25zdHJ1Y3RlZCA9IEdhbWVTZXNzaW9uLnJlY29uc3RydWN0SGlzdG9yaWNhbChqb3VybmFsKTtcbiAgICAgIGNvbnN0IHJhd0dlbmVzaXMgPSByZWNvbnN0cnVjdGVkLnNuYXBzaG90cy5nZXQoMCkhO1xuICAgICAgaWYgKGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgPT09IGxlZ2FjeVN0b25lSGFzaChyYXdHZW5lc2lzKSkgcmV0dXJuIHJlY29uc3RydWN0ZWQuc2Vzc2lvbjtcbiAgICB9XG4gICAgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTtcbiAgfVxuXG4gIC8qKiBSZXBsYXkgYWxyZWFkeS1hdXRoZW50aWNhdGVkIGN1cnJlbnQtc3RhdGUgY29tbWFuZHMuICovXG4gIHByaXZhdGUgc3RhdGljIHJlcGxheUN1cnJlbnQoam91cm5hbDogQ29tbWFuZEpvdXJuYWwpOiBHYW1lU2Vzc2lvbiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IG5ldyBHYW1lU2Vzc2lvbihcbiAgICAgIGdlbmVzaXNXb3JsZChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc3RhcnRlckludmVudG9yeSwgam91cm5hbC5zY2hlbWEpLFxuICAgICAgY3JlYXRlSm91cm5hbChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc2NoZW1hKSxcbiAgICApO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2Ygam91cm5hbC5lbnRyaWVzKSBzZXNzaW9uLnJlcGxheUVudHJ5KGVudHJ5KTtcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfVxuXG4gIHByaXZhdGUgc3RhdGljIHJlc3RvcmVDdXJyZW50KHNuYXBzaG90OiBXb3JsZFNuYXBzaG90LCBqb3VybmFsOiBDb21tYW5kSm91cm5hbCwgbmV4dDogbnVtYmVyKTogR2FtZVNlc3Npb24ge1xuICAgIGNvbnN0IHdvcmxkID0gd29ybGRGcm9tU25hcHNob3Qoc25hcHNob3QpO1xuICAgIGlmICh3b3JsZC5zZWVkICE9PSBqb3VybmFsLnNlZWQpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgYW5kIGpvdXJuYWwgc2VlZHMgZGlmZmVyJyk7XG4gICAgY29uc3QgZ2VuZXNpcyA9IGdlbmVzaXNXb3JsZChqb3VybmFsLnNlZWQsIGpvdXJuYWwuc3RhcnRlckludmVudG9yeSwgam91cm5hbC5zY2hlbWEpO1xuICAgIGlmIChuZXh0ID09PSAwICYmIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgIT09IGNhbm9uaWNhbFdvcmxkSGFzaChnZW5lc2lzLCAwLCBqb3VybmFsLnNjaGVtYSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ2VuZXNpcyBzbmFwc2hvdCBkb2VzIG5vdCBtYXRjaCBqb3VybmFsIGNvbmZpZ3VyYXRpb24nKTtcbiAgICB9XG4gICAgaWYgKG5leHQgPiAwICYmIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgIT09IGpvdXJuYWwuZW50cmllc1tuZXh0IC0gMV0uaGFzaCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXNoIGRvZXMgbm90IG1hdGNoIGl0cyBqb3VybmFsIGJvdW5kYXJ5Jyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5mcm9tVmFsaWRhdGVkQm91bmRhcnkod29ybGQsIHtcbiAgICAgIHNjaGVtYTogam91cm5hbC5zY2hlbWEsIHNlZWQ6IGpvdXJuYWwuc2VlZCxcbiAgICAgIHN0YXJ0ZXJJbnZlbnRvcnk6IHsgLi4uam91cm5hbC5zdGFydGVySW52ZW50b3J5IH0sIGVudHJpZXM6IGpvdXJuYWwuZW50cmllcy5zbGljZSgwLCBuZXh0KSxcbiAgICB9KTtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGpvdXJuYWwuZW50cmllcy5zbGljZShuZXh0KSkgc2Vzc2lvbi5yZXBsYXlFbnRyeShlbnRyeSk7XG4gICAgcmV0dXJuIHNlc3Npb247XG4gIH1cblxuICAvKiogQGludGVybmFsIEFzc2VtYmxlIGFuIGF1dGhlbnRpY2F0ZWQgc2F2ZSBib3VuZGFyeTsgZ2FtZXBsYXkgdXNlcyBkaXNwYXRjaC4gKi9cbiAgcHJpdmF0ZSBzdGF0aWMgZnJvbVZhbGlkYXRlZEJvdW5kYXJ5KHdvcmxkOiBXb3JsZCwgam91cm5hbDogQ29tbWFuZEpvdXJuYWwpOiBHYW1lU2Vzc2lvbiB7XG4gICAgcmV0dXJuIG5ldyBHYW1lU2Vzc2lvbih3b3JsZCwgam91cm5hbCk7XG4gIH1cblxuICAvKiogQGludGVybmFsIFNvdXJjZSBmb3IgZGV0ZXJtaW5pc3RpYyBvbGQtc2F2ZSBmaXh0dXJlczsgbm90IGEgbGl2ZSBzZXNzaW9uLiAqL1xuICBzdGF0aWMgaGlzdG9yaWNhbEpvdXJuYWwod29ybGQ6IFdvcmxkKTogR2FtZVNlc3Npb24ge1xuICAgIHJldHVybiBuZXcgR2FtZVNlc3Npb24od29ybGQsIGNyZWF0ZUpvdXJuYWwod29ybGQuc2VlZCwgd29ybGQubGlmZSA/IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUFcbiAgICAgIDogd29ybGQuc3RydWN0dXJlcy5zaXplID4gMCA/IERFU0lHTl9KT1VSTkFMX1NDSEVNQSA6IEpPVVJOQUxfU0NIRU1BKSk7XG4gIH1cblxuICAvKiogQGludGVybmFsIFNvdXJjZSBmb3IgZGV0ZXJtaW5pc3RpYyBvbGQtc2F2ZSBmaXh0dXJlczsgbm90IGEgbGl2ZSBzZXNzaW9uLiAqL1xuICBzdGF0aWMgaGlzdG9yaWNhbEdlbmVzaXNXb3JsZChzZWVkID0gMTMzNywgc2NoZW1hOiBDb21tYW5kSm91cm5hbFsnc2NoZW1hJ10gPSBKT1VSTkFMX1NDSEVNQSk6IFdvcmxkIHtcbiAgICByZXR1cm4gaGlzdG9yaWNhbEdlbmVzaXNXb3JsZChzZWVkLCBpbnZlbnRvcnkoTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSksIHNjaGVtYSk7XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyByZWNvbnN0cnVjdEhpc3RvcmljYWwoam91cm5hbDogQ29tbWFuZEpvdXJuYWwpOiB7XG4gICAgc2Vzc2lvbjogR2FtZVNlc3Npb247IHNuYXBzaG90czogTWFwPG51bWJlciwgV29ybGRTbmFwc2hvdD47XG4gIH0ge1xuICAgIGNvbnN0IGV4cGVjdGVkR2VuZXNpcyA9IGhpc3RvcmljYWxHZW5lc2lzV29ybGQoam91cm5hbC5zZWVkLCBqb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnksIGpvdXJuYWwuc2NoZW1hKTtcbiAgICBjb25zdCBzbmFwc2hvdHMgPSBuZXcgTWFwPG51bWJlciwgV29ybGRTbmFwc2hvdD4oKTtcbiAgICBzbmFwc2hvdHMuc2V0KDAsIGNyZWF0ZVdvcmxkU25hcHNob3QoZXhwZWN0ZWRHZW5lc2lzLCAwLCBqb3VybmFsLnNjaGVtYSkpO1xuICAgIGNvbnN0IHJlcGxheSA9IG5ldyBHYW1lU2Vzc2lvbihleHBlY3RlZEdlbmVzaXMsIGNyZWF0ZUpvdXJuYWwoam91cm5hbC5zZWVkLCBqb3VybmFsLnNjaGVtYSkpO1xuICAgIGNvbnN0IG1pZ3JhdGVkSm91cm5hbCA9IGNyZWF0ZUpvdXJuYWwoam91cm5hbC5zZWVkLCBqb3VybmFsLnNjaGVtYSk7XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBqb3VybmFsLmVudHJpZXMpIHtcbiAgICAgIHJlcGxheS5yZXBsYXlFbnRyeShlbnRyeSk7XG4gICAgICBjb25zdCBzbmFwc2hvdCA9IGNyZWF0ZVdvcmxkU25hcHNob3QocmVwbGF5LndvcmxkLCByZXBsYXkubmV4dFNlcXVlbmNlLCBqb3VybmFsLnNjaGVtYSk7XG4gICAgICBzbmFwc2hvdHMuc2V0KHJlcGxheS5uZXh0U2VxdWVuY2UsIHNuYXBzaG90KTtcbiAgICAgIC8vIEtlZXAgdGhlIHJld3JpdHRlbiBhdXRoZW50aWNhdGVkIGJvdW5kYXJ5IGluIHRoZSByZXR1cm5lZCBqb3VybmFsLiBBXG4gICAgICAvLyByZXBsYXktb25seSBqb3VybmFsIHJlYnVpbGQgd291bGQgc2lsZW50bHkgcHV0IHRoZSByYXcgaGFzaCBiYWNrLlxuICAgICAgZW50cnkuaGFzaCA9IGxlZ2FjeVN0b25lSGFzaChtaWdyYXRlU3RvbmVTbmFwc2hvdChzbmFwc2hvdCkpO1xuICAgICAgbWlncmF0ZWRKb3VybmFsLmVudHJpZXMucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5mcm9tVmFsaWRhdGVkQm91bmRhcnkocmVwbGF5LndvcmxkLCBtaWdyYXRlZEpvdXJuYWwpO1xuICAgIHJldHVybiB7IHNlc3Npb246IHNlc3Npb24ubWlncmF0ZVJldGlyZWRTdG9uZXMoKSwgc25hcHNob3RzIH07XG4gIH1cblxuICBwcml2YXRlIHNuYXBzaG90U2NoZW1hKCk6IFdvcmxkU25hcHNob3RbJ3NjaGVtYSddIHsgcmV0dXJuIHRoaXMuam91cm5hbC5zY2hlbWE7IH1cblxuICBnZXQgbmV4dFNlcXVlbmNlKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmpvdXJuYWwuZW50cmllcy5sZW5ndGg7IH1cbiAgZ2V0IHNuYXBzaG90KCk6IFdvcmxkU25hcHNob3Qge1xuICAgIHJldHVybiBjcmVhdGVXb3JsZFNuYXBzaG90KHRoaXMud29ybGQsIHRoaXMubmV4dFNlcXVlbmNlLCB0aGlzLnNuYXBzaG90U2NoZW1hKCkpO1xuICB9XG4gIGdldCBzdGF0ZUhhc2goKTogc3RyaW5nIHtcbiAgICByZXR1cm4gY2Fub25pY2FsV29ybGRIYXNoKHRoaXMud29ybGQsIHRoaXMubmV4dFNlcXVlbmNlLCB0aGlzLnNuYXBzaG90U2NoZW1hKCkpO1xuICB9XG5cbiAgY29tbWFuZElkKGtpbmQ6IENvbW1hbmRbJ3R5cGUnXSwgdGFyZ2V0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIC8vIEVudGl0eSBJRHMgY29udGFpbiBjaHVuayBjb29yZGluYXRlczsgZW5jb2RlIGNvbW1hcyBhbmQgb3RoZXIgc2VwYXJhdG9yc1xuICAgIC8vIHNvIGdlbmVyYXRlZCBjb21tYW5kcyBzYXRpc2Z5IHRoZSBzYW1lIGVudmVsb3BlIHZhbGlkYXRpb24gYXMgaW5wdXQuXG4gICAgcmV0dXJuIGAke2tpbmR9OiR7dGhpcy5uZXh0U2VxdWVuY2V9OiR7ZW5jb2RlVVJJQ29tcG9uZW50KHRhcmdldCl9YDtcbiAgfVxuXG4gIGVudHJ5KHNlcXVlbmNlOiBudW1iZXIpOiBKb3VybmFsRW50cnkgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5qb3VybmFsLmVudHJpZXNbc2VxdWVuY2VdOyB9XG5cbiAgZGlzcGF0Y2goaW5wdXQ6IHVua25vd24pOiBDb21tYW5kUmVjZWlwdCB8IENvbW1hbmRSZWplY3Rpb24ge1xuICAgIGxldCBjb21tYW5kOiBDb21tYW5kO1xuICAgIHRyeSB7IGNvbW1hbmQgPSB2YWxpZGF0ZUNvbW1hbmQoaW5wdXQpOyB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KG9iamVjdChpbnB1dCkgJiYgdHlwZW9mIGlucHV0LmlkID09PSAnc3RyaW5nJyA/IGlucHV0LmlkIDogJycsXG4gICAgICAgICdpbnZhbGlkX2NvbW1hbmQnLCBbKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlXSk7XG4gICAgfVxuICAgIGlmICgoY29tbWFuZC50eXBlID09PSAnYnVpbGQnIHx8IGNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnKVxuICAgICAgJiYgY29tbWFuZC5zY2hlbWEgIT09IHRoaXMuam91cm5hbC5zY2hlbWFcbiAgICAgIHx8IGNvbW1hbmQudHlwZSAhPT0gJ2J1aWxkJyAmJiBjb21tYW5kLnR5cGUgIT09ICdoYXJ2ZXN0J1xuICAgICAgICAmJiB0aGlzLmpvdXJuYWwuc2NoZW1hICE9PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgJ3NjaGVtYV9taXNtYXRjaCcsIFsnY29tbWFuZCBzY2hlbWEgZG9lcyBub3QgbWF0Y2ggdGhpcyB3b3JsZCBqb3VybmFsJ10pO1xuICAgIH1cbiAgICBjb25zdCBwcmlvciA9IHRoaXMuaWRzLmdldChjb21tYW5kLmlkKTtcbiAgICBpZiAocHJpb3IpIHtcbiAgICAgIGlmICghc2FtZUZpZWxkcyhwcmlvci5jb21tYW5kLCBjb21tYW5kKSkge1xuICAgICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgJ2R1cGxpY2F0ZV9jb21tYW5kX2lkJywgWydjb21tYW5kIGlkIGFscmVhZHkgaGFzIGRpZmZlcmVudCBhY2NlcHRlZCBpbnB1dCddKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLnJlY2VpcHQocHJpb3IsIHRydWUpO1xuICAgIH1cbiAgICBpZiAoY29tbWFuZC5leHBlY3RlZFJldmlzaW9uICE9PSB0aGlzLndvcmxkLnJldmlzaW9uKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgJ3N0YWxlX3JldmlzaW9uJywgW1xuICAgICAgICBgY29tbWFuZCBleHBlY3RzIHJldmlzaW9uICR7Y29tbWFuZC5leHBlY3RlZFJldmlzaW9ufTsgd29ybGQgaXMgYXQgJHt0aGlzLndvcmxkLnJldmlzaW9ufWAsXG4gICAgICBdKTtcbiAgICB9XG4gICAgY29uc3QgYmVmb3JlID0gdGhpcy5zdGF0ZUhhc2g7XG4gICAgbGV0IG91dGNvbWU6IENvbW1hbmRPdXRjb21lO1xuICAgIGlmIChjb21tYW5kLnR5cGUgPT09ICdidWlsZCcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGJ1aWxkUHJvamVjdCh0aGlzLndvcmxkLCB0aGlzLnByZXBBdXRob3JpemVyLCB0aGlzLnN0cnVjdHVyZUF1dGhvcml6ZXIsXG4gICAgICAgIHByb2plY3RCeUlkKGNvbW1hbmQucHJvamVjdElkKSxcbiAgICAgICAgJ2Rlc2lnblZlcnNpb24nIGluIGNvbW1hbmQgPyBjb21tYW5kLmRlc2lnblZlcnNpb24gOiB1bmRlZmluZWQpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVIYXNoICE9PSBiZWZvcmUpIHRocm93IG5ldyBFcnJvcigncmVqZWN0ZWQgYnVpbGQgY2hhbmdlZCBhdXRob3JpdGF0aXZlIHN0YXRlJyk7XG4gICAgICAgIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgfVxuICAgICAgb3V0Y29tZSA9IHtcbiAgICAgICAgdHlwZTogJ2J1aWxkJywgc3RydWN0dXJlSWQ6IHJlc3VsdC5yZWNvcmQuaWQsXG4gICAgICAgIGNvc3RQYWlkOiBpbnZlbnRvcnkocmVzdWx0LnN0cnVjdHVyZS5jb3N0UGFpZCksXG4gICAgICAgIHJlc291cmNlc0dhaW5lZDogaW52ZW50b3J5KHJlc3VsdC5wcmVwYXJhdGlvbi5yZXNvdXJjZXNHYWluZWQpLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBoYXJ2ZXN0RW50aXR5KHRoaXMud29ybGQsIGNvbW1hbmQuZW50aXR5SWQpO1xuICAgICAgaWYgKCFyZXN1bHQpIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCAnbm90X2hhcnZlc3RhYmxlJywgWydlbnRpdHkgaXMgYWJzZW50LCBkZXBsZXRlZCBvciBoYXMgbm8gcmVzb3VyY2UnXSk7XG4gICAgICBvdXRjb21lID0ge1xuICAgICAgICB0eXBlOiAnaGFydmVzdCcsIGVudGl0eUlkOiByZXN1bHQuZW50aXR5LmlkLFxuICAgICAgICByZXNvdXJjZTogcmVzdWx0LnJlc291cmNlLCBhbW91bnQ6IHJlc3VsdC5hbW91bnQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAnZGVwb3NpdCcgfHwgY29tbWFuZC50eXBlID09PSAnd2l0aGRyYXcnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSB0cmFuc2Zlcih0aGlzLndvcmxkLCBjb21tYW5kLnR5cGUsIGNvbW1hbmQucmVzb3VyY2VzKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlSGFzaCAhPT0gYmVmb3JlKSB0aHJvdyBuZXcgRXJyb3IoJ3JlamVjdGVkIHRyYW5zZmVyIGNoYW5nZWQgYXV0aG9yaXRhdGl2ZSBzdGF0ZScpO1xuICAgICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIH1cbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6IGNvbW1hbmQudHlwZSwgc3RvY2twaWxlSWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCByZXNvdXJjZXM6IHJlc3VsdC52YWx1ZSB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAncHJvZHVjZScpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHN0YXJ0UHJvZHVjdGlvbih0aGlzLndvcmxkLCBjb21tYW5kLnJlY2lwZSwgY29tbWFuZC5pZCk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICBvdXRjb21lID0geyB0eXBlOiAncHJvZHVjZScsIGpvYklkOiByZXN1bHQudmFsdWUuaWQsIHN0b2NrcGlsZUlkOiByZXN1bHQudmFsdWUuc3RvY2twaWxlSWQsXG4gICAgICAgIHJlY2lwZTogcmVzdWx0LnZhbHVlLnJlY2lwZSwgcmVtYWluaW5nVGlja3M6IHJlc3VsdC52YWx1ZS5yZW1haW5pbmdUaWNrcyB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAndGljaycpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGFkdmFuY2VUaWNrcyh0aGlzLndvcmxkLCBjb21tYW5kLnRpY2tzKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIG91dGNvbWUgPSB7IHR5cGU6ICd0aWNrJywgLi4ucmVzdWx0LnZhbHVlIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdwbGFudCcpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHBsYW50Q3JvcCh0aGlzLndvcmxkLCBjb21tYW5kLnBsb3RJZCk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICBvdXRjb21lID0geyB0eXBlOiAncGxhbnQnLCBwbG90SWQ6IGNvbW1hbmQucGxvdElkLFxuICAgICAgICBwbGFudGVkVGljazogcmVzdWx0LnZhbHVlLnBsYW50ZWRUaWNrLCBncm93dGhUaWNrczogcmVzdWx0LnZhbHVlLmdyb3d0aFRpY2tzIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBoYXJ2ZXN0Q3JvcCh0aGlzLndvcmxkLCBjb21tYW5kLnBsb3RJZCk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICBvdXRjb21lID0geyB0eXBlOiAnaGFydmVzdF9jcm9wJywgcGxvdElkOiBjb21tYW5kLnBsb3RJZCwgcmVzb3VyY2VzOiByZXN1bHQudmFsdWUgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCd1bmhhbmRsZWQgY29tbWFuZCB0eXBlJyk7XG4gICAgfVxuICAgIGNvbnN0IGVudHJ5OiBKb3VybmFsRW50cnkgPSB7XG4gICAgICBjb21tYW5kLCBzZXF1ZW5jZTogdGhpcy5uZXh0U2VxdWVuY2UsIHJldmlzaW9uOiB0aGlzLndvcmxkLnJldmlzaW9uLFxuICAgICAgLy8gVGhlIHNlcXVlbmNlIGlzIHBhcnQgb2YgdGhlIHN0YXRlIGhhc2ggYXQgdGhpcyBhY2NlcHRlZCBib3VuZGFyeS5cbiAgICAgIGhhc2g6IGNhbm9uaWNhbFdvcmxkSGFzaCh0aGlzLndvcmxkLCB0aGlzLm5leHRTZXF1ZW5jZSArIDEsIHRoaXMuc25hcHNob3RTY2hlbWEoKSksIG91dGNvbWUsXG4gICAgfTtcbiAgICB0aGlzLmpvdXJuYWwuZW50cmllcy5wdXNoKGVudHJ5KTtcbiAgICB0aGlzLmlkcy5zZXQoY29tbWFuZC5pZCwgZW50cnkpO1xuICAgIHJldHVybiB0aGlzLnJlY2VpcHQoZW50cnksIGZhbHNlKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVwbGF5RW50cnkoZW50cnk6IEpvdXJuYWxFbnRyeSk6IHZvaWQge1xuICAgIGlmIChlbnRyeS5zZXF1ZW5jZSAhPT0gdGhpcy5uZXh0U2VxdWVuY2UpIHRocm93IG5ldyBFcnJvcignam91cm5hbCBzZXF1ZW5jZSBnYXAnKTtcbiAgICBjb25zdCByZWNlaXB0ID0gdGhpcy5kaXNwYXRjaChlbnRyeS5jb21tYW5kKTtcbiAgICBpZiAoIXJlY2VpcHQub2sgfHwgcmVjZWlwdC5kdXBsaWNhdGUgfHwgcmVjZWlwdC5oYXNoICE9PSBlbnRyeS5oYXNoXG4gICAgICB8fCByZWNlaXB0LnJldmlzaW9uICE9PSBlbnRyeS5yZXZpc2lvblxuICAgICAgfHwgSlNPTi5zdHJpbmdpZnkocmVjZWlwdC5vdXRjb21lKSAhPT0gSlNPTi5zdHJpbmdpZnkoZW50cnkub3V0Y29tZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgam91cm5hbCByZXBsYXkgZGl2ZXJnZWQgYXQgc2VxdWVuY2UgJHtlbnRyeS5zZXF1ZW5jZX1gKTtcbiAgICB9XG4gIH1cblxuICAvKiogSGlzdG9yaWNhbCBlbnRyaWVzIGhhdmUgcGFzc2VkIHRoZWlyIG9yaWdpbmFsIG91dGNvbWUvaGFzaCBjaGVja3MuIFRoZWlyXG4gICAqIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBzdG9uZSB5aWVsZHMgcmVtYWluOyBvbmx5IGVudGl0eSBleGlzdGVuY2UgYW5kIHRoZVxuICAgKiByZXN1bHRpbmcgY2Fub25pY2FsIGJvdW5kYXJ5IGhhc2hlcyBjaGFuZ2UuICovXG4gIHByaXZhdGUgbWlncmF0ZVJldGlyZWRTdG9uZXMoKTogR2FtZVNlc3Npb24ge1xuICAgIHJldGlyZVN0b25lRW50aXRpZXModGhpcy53b3JsZCk7XG4gICAgZmluaXNoU3RvbmVSZXBsYXkodGhpcy53b3JsZCk7XG4gICAgY29uc3QgbWlncmF0ZWQgPSBjcmVhdGVXb3JsZFNuYXBzaG90KHRoaXMud29ybGQsIHRoaXMubmV4dFNlcXVlbmNlLCB0aGlzLnNuYXBzaG90U2NoZW1hKCkpO1xuICAgIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3QodGhpcy53b3JsZCwgbWlncmF0ZWQpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgcHJpdmF0ZSByZWNlaXB0KGVudHJ5OiBKb3VybmFsRW50cnksIGR1cGxpY2F0ZTogYm9vbGVhbik6IENvbW1hbmRSZWNlaXB0IHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IHRydWUsIGR1cGxpY2F0ZSwgaWQ6IGVudHJ5LmNvbW1hbmQuaWQsIHNlcXVlbmNlOiBlbnRyeS5zZXF1ZW5jZSxcbiAgICAgIHJldmlzaW9uOiBlbnRyeS5yZXZpc2lvbiwgaGFzaDogZW50cnkuaGFzaCwgb3V0Y29tZTogZW50cnkub3V0Y29tZSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSByZWplY3QoaWQ6IHN0cmluZywgY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IENvbW1hbmRSZWplY3Rpb24ge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZHVwbGljYXRlOiBmYWxzZSwgaWQsIGNvZGUsIHJlYXNvbnMgfTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXNpc1dvcmxkKHNlZWQ6IG51bWJlciwgc3RhcnRlciA9IGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSxcbiAgc2NoZW1hOiBDb21tYW5kSm91cm5hbFsnc2NoZW1hJ10gPSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoc2VlZCwgMCk7XG4gIHdvcmxkLmludmVudG9yeSA9IHsgLi4uc3RhcnRlciB9O1xuICBpZiAoc2NoZW1hID09PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB3b3JsZC5saWZlID0gY3JlYXRlTGlmZVN0YXRlKCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuZnVuY3Rpb24gaGlzdG9yaWNhbEdlbmVzaXNXb3JsZChzZWVkOiBudW1iZXIsIHN0YXJ0ZXI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4sXG4gIHNjaGVtYTogQ29tbWFuZEpvdXJuYWxbJ3NjaGVtYSddKTogV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQpO1xuICBlbmFibGVTdG9uZVJlcGxheSh3b3JsZCk7XG4gIHBsYWNlQXV0aG9yZWRTaXRlcyh3b3JsZCk7XG4gIHdvcmxkLmludmVudG9yeSA9IHsgLi4uc3RhcnRlciB9O1xuICBpZiAoc2NoZW1hID09PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB3b3JsZC5saWZlID0gY3JlYXRlTGlmZVN0YXRlKCk7XG4gIHJldHVybiB3b3JsZDtcbn1cblxuZnVuY3Rpb24gY29udGFpbnNSZXRpcmVkU3RvbmUoZW50cnk6IEpvdXJuYWxFbnRyeSk6IGJvb2xlYW4ge1xuICBpZiAoZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcpIHtcbiAgICByZXR1cm4gZW50cnkub3V0Y29tZS50eXBlID09PSAnaGFydmVzdCdcbiAgICAgICYmIChlbnRyeS5vdXRjb21lLnJlc291cmNlID09PSAnc3RvbmUnXG4gICAgICAgIHx8IC9eaGVybzpzdHlsX3JvY2tfKD86c21hbGx8bWVkaXVtfGxhcmdlKTovLnRlc3QoZW50cnkuY29tbWFuZC5lbnRpdHlJZCkpO1xuICB9XG4gIHJldHVybiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICdidWlsZCcgJiYgKGVudHJ5Lm91dGNvbWUucmVzb3VyY2VzR2FpbmVkLnN0b25lID8/IDApID4gMDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RlZEVudGl0eShzZXNzaW9uOiBHYW1lU2Vzc2lvbiwgaWQ6IHN0cmluZyk6IEVudGl0eSB8IHVuZGVmaW5lZCB7XG4gIHJldHVybiBzZXNzaW9uLndvcmxkLmVudGl0aWVzLmdldChpZCk7XG59XG4iLCAiLy8gUmVhZC1vbmx5IGlkZW50aXR5IGZvciBzZWxlY3RhYmxlIHNjZW5lIG9iamVjdHMuIE5hbWVzIGFuZCBwdXJwb3NlcyBhcmUgVUlcbi8vIG1ldGFkYXRhOyBxdWFudGl0aWVzIGFuZCBleGlzdGVuY2UgYWx3YXlzIGNvbWUgZnJvbSBhdXRob3JpdGF0aXZlIHdvcmxkIHN0YXRlLlxuaW1wb3J0IHsgQWN0aXZlRW50aXR5S2luZCwgaXNSZXRpcmVkU3RvbmVLaW5kLCBXb3JsZCB9IGZyb20gJy4uL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBjcm9wUmVhZHkgfSBmcm9tICcuLi9zaW0vZWNvbm9teSc7XG5pbXBvcnQgeyBNMl9QUk9KRUNUUyB9IGZyb20gJy4vcHJvamVjdHMnO1xuXG5leHBvcnQgdHlwZSBJbnNwZWN0aW9uUmVmID1cbiAgfCB7IGVudGl0eUlkOiBzdHJpbmcgfSB8IHsgc3RydWN0dXJlSWQ6IHN0cmluZyB9IHwgeyBzaXRlSWQ6IHN0cmluZyB9XG4gIHwgeyBraXRJZDogc3RyaW5nIH0gfCB7IHN0b2NrcGlsZUlkOiBzdHJpbmcgfSB8IHsgY3JvcElkOiBzdHJpbmcgfTtcblxuZXhwb3J0IGludGVyZmFjZSBJbnNwZWN0aW9uSW5mbyB7XG4gIHJlZjogSW5zcGVjdGlvblJlZjtcbiAga2V5OiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgY2F0ZWdvcnk6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZmFjdHM6IHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W107XG59XG5cbmV4cG9ydCBjb25zdCBJTlNQRUNUSU9OX0NBVEFMT0c6IFJlY29yZDxBY3RpdmVFbnRpdHlLaW5kLCB7XG4gIG5hbWU6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZztcbn0+ID0ge1xuICBzdHlsX3RyZWVfc3BpcmU6IHsgbmFtZTogJ1NwaXJlIHRyZWUnLCBkZXNjcmlwdGlvbjogJ0EgdGFsbCwgdGllcmVkLWNhbm9weSB0cmVlLiBIYXJ2ZXN0IGl0cyB0aW1iZXIgZm9yIGNhcnJpZWQgd29vZC4nIH0sXG4gIHN0eWxfdHJlZV90YWJsZTogeyBuYW1lOiAnVGFibGUtY2Fub3B5IHRyZWUnLCBkZXNjcmlwdGlvbjogJ0EgYnJvYWQsIHNwcmVhZGluZyB0cmVlLiBJdHMgdHJ1bmsgYW5kIGJyYW5jaGVzIHByb3ZpZGUgd29vZC4nIH0sXG4gIHN0eWxfdHJlZV9jbHVzdGVyOiB7IG5hbWU6ICdDbHVzdGVyIHRyZWUnLCBkZXNjcmlwdGlvbjogJ0EgbWFueS1jcm93bmVkIHdvb2RsYW5kIHRyZWUuIEhhcnZlc3QgaXQgdG8gY2Fycnkgd29vZC4nIH0sXG4gIHN0eWxfdHJlZV9ibG9zc29tOiB7IG5hbWU6ICdCbG9zc29tIHRyZWUnLCBkZXNjcmlwdGlvbjogJ0EgcGluay1mbG93ZXJpbmcgdHJlZS4gSXRzIHRpbWJlciBpcyBnYXRoZXJlZCBhcyB3b29kLicgfSxcbiAgc3R5bF9zaHJ1YjogeyBuYW1lOiAnRmliZXIgc2hydWInLCBkZXNjcmlwdGlvbjogJ0EgbG93IGxlYWZ5IHBsYW50LiBHYXRoZXIgaXRzIHBsYW50IGZpYmVyIGZvciBwcm9jZXNzaW5nIGludG8gY3JvcCBzZWVkLicgfSxcbiAgc3R5bF9vcmU6IHsgbmFtZTogJ1B1cnBsZS1zZWFtIG9yZSBkZXBvc2l0JywgZGVzY3JpcHRpb246ICdBIHBhbGUgcm9jayBob3N0IHdpdGggcHVycGxlIG1pbmVyYWwgc2VhbXMuIEdhdGhlciBpdCBmb3Igb3JlOyBpdCBpcyBhIG5hdHVyYWwgcmVzb3VyY2UuJyB9LFxuICBzdHlsX2NhaXJuOiB7IG5hbWU6ICdTdG9uZSBjYWlybicsIGRlc2NyaXB0aW9uOiAnQSBkZWxpYmVyYXRlbHkgc3RhY2tlZCBwaWxlIG9mIG5hdHVyYWwgc3RvbmVzLiBJdCBjYW4gYmUgZ2F0aGVyZWQgZm9yIHN0b25lLicgfSxcbiAgd2F5c3RvbmU6IHsgbmFtZTogJ1dheXN0b25lJywgZGVzY3JpcHRpb246ICdBIHRhbGwgZm9ya2VkIE5veGVsIGxhbmRtYXJrLiBJdHMgY3JlYW0gc3RvbmUgYW5kIHRlYWwgaW5sYXkgbWFyayBhIHBsYWNlIG9mIGludGVyZXN0OyBpdCBpcyBub3QgYSByZXNvdXJjZSByb2NrLicgfSxcbiAgbWFya2VyOiB7IG5hbWU6ICdUcmFpbCBtYXJrZXInLCBkZXNjcmlwdGlvbjogJ0Egc21hbGwgTm94ZWwgc3RvbmUgbWFya2VyIHdpdGggdGVhbCBpbmxheSwgaWRlbnRpZnlpbmcgYSByb3V0ZSBvciBwb2ludCBvZiBpbnRlcmVzdC4nIH0sXG59O1xuXG5leHBvcnQgY29uc3QgS0lUX0lOU1BFQ1RJT046IFJlY29yZDxzdHJpbmcsIHsgbmFtZTogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nIH0+ID0ge1xuICBwb3N0OiB7IG5hbWU6ICdOb3hlbCBwb3N0JywgZGVzY3JpcHRpb246ICdBIHByb3Zpc2lvbmFsIGFyY2hpdGVjdHVyZS1raXQgc3VwcG9ydCBwb3N0IHdpdGggYSBzbGFiIGJhc2UgYW5kIGNhcC4nIH0sXG4gIHdhbGw6IHsgbmFtZTogJ05veGVsIHdhbGwgcGFuZWwnLCBkZXNjcmlwdGlvbjogJ0EgcHJvdmlzaW9uYWwgc3RvbmUgd2FsbCBtb2R1bGUgd2l0aCBhIGZvdW5kYXRpb24gYW5kIHBhcmFwZXQuJyB9LFxuICBnYXRld2F5OiB7IG5hbWU6ICdOb3hlbCBnYXRld2F5JywgZGVzY3JpcHRpb246ICdBIHByb3Zpc2lvbmFsIHBhaXJlZC1wb3N0IGdhdGV3YXkgd2l0aCBhIHN0b25lIGxpbnRlbC4nIH0sXG4gIHN0YWlyOiB7IG5hbWU6ICdOb3hlbCBzdGFpcicsIGRlc2NyaXB0aW9uOiAnQSBwcm92aXNpb25hbCBzdG9uZSBzdGFpciBtb2R1bGUgd2l0aCBmb3VyIHJpc2VycyBhbmQgYSBsYW5kaW5nLicgfSxcbiAgd2F5c3RvbmU6IElOU1BFQ1RJT05fQ0FUQUxPRy53YXlzdG9uZSxcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnNwZWN0aW9uS2V5KHJlZjogSW5zcGVjdGlvblJlZik6IHN0cmluZyB7XG4gIGNvbnN0IFtraW5kLCBpZF0gPSBPYmplY3QuZW50cmllcyhyZWYpWzBdO1xuICByZXR1cm4gYCR7a2luZH06JHtpZH1gO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlJbnNwZWN0aW9uKHdvcmxkOiBXb3JsZCwgcmVmOiB7IGVudGl0eUlkOiBzdHJpbmcgfSk6IEluc3BlY3Rpb25JbmZvIHwgbnVsbCB7XG4gIGNvbnN0IGUgPSB3b3JsZC5lbnRpdGllcy5nZXQocmVmLmVudGl0eUlkKTtcbiAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSB8fCBpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGNhdGFsb2cgPSBJTlNQRUNUSU9OX0NBVEFMT0dbZS5raW5kIGFzIEFjdGl2ZUVudGl0eUtpbmRdO1xuICBpZiAoIWNhdGFsb2cpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIHJlZiwga2V5OiBpbnNwZWN0aW9uS2V5KHJlZiksIG5hbWU6IGNhdGFsb2cubmFtZSxcbiAgICBjYXRlZ29yeTogJ05hdHVyYWwgcmVzb3VyY2UnLCBkZXNjcmlwdGlvbjogY2F0YWxvZy5kZXNjcmlwdGlvbixcbiAgICBmYWN0czogW1xuICAgICAgeyBsYWJlbDogJ1Jlc291cmNlJywgdmFsdWU6IGUucmVzb3VyY2UgPz8gJ05vbmUnIH0sXG4gICAgICB7IGxhYmVsOiAnUmVtYWluaW5nJywgdmFsdWU6IGAke2UucmVtYWluaW5nfSBcdTAwQjcgJHtNYXRoLm1pbihlLnlpZWxkUGVySGFydmVzdCwgZS5yZW1haW5pbmcpfSBwZXIgZ2F0aGVyYCB9LFxuICAgICAgeyBsYWJlbDogJ1N0YXR1cycsIHZhbHVlOiBlLnByb3Zpc2lvbmFsID8gJ0F2YWlsYWJsZSBcdTAwQjcgcHJvdmlzaW9uYWwgYXJ0JyA6ICdBdmFpbGFibGUnIH0sXG4gICAgXSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gc3RydWN0dXJlSW5zcGVjdGlvbih3b3JsZDogV29ybGQsIHJlZjogeyBzdHJ1Y3R1cmVJZDogc3RyaW5nIH0pOiBJbnNwZWN0aW9uSW5mbyB8IG51bGwge1xuICBjb25zdCBzID0gd29ybGQuc3RydWN0dXJlcy5nZXQocmVmLnN0cnVjdHVyZUlkKTtcbiAgaWYgKCFzKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcHJvamVjdCA9IE0yX1BST0pFQ1RTLmZpbmQoKHApID0+IHAuc2l0ZUlkID09PSBzLnNpdGVJZCAmJiBwLmtpbmQgPT09IHMua2luZCk7XG4gIGNvbnN0IG5hbWUgPSBwcm9qZWN0Py5uYW1lID8/IChzLmtpbmQgPT09ICdob3VzZScgPyBcIkZvdW5kZXIncyBob3VzZVwiXG4gICAgOiBzLmtpbmQgPT09ICdwYXRoJyA/ICdEb29yIHBhdGgnIDogJ1RlcnJhY2VkIGZpZWxkJyk7XG4gIHJldHVybiB7XG4gICAgcmVmLCBrZXk6IGluc3BlY3Rpb25LZXkocmVmKSwgbmFtZSwgY2F0ZWdvcnk6ICdBcmNoaXRlY3R1cmUgXHUwMEI3IGZvdW5kZXIgcHJvamVjdCcsXG4gICAgZGVzY3JpcHRpb246IHByb2plY3Q/LmRlc2NyaXB0aW9uID8/ICdBIHN0cnVjdHVyZSByZWNvcmRlZCBpbiB0aGUgc2V0dGxlbWVudFx1MjAxOXMgYXV0aG9yaXRhdGl2ZSBjb25zdHJ1Y3Rpb24gc3RhdGUuJyxcbiAgICBmYWN0czogW1xuICAgICAgeyBsYWJlbDogJ1R5cGUnLCB2YWx1ZTogcy5raW5kID09PSAndGVycmFjZScgPyAnVGVycmFjZWQgZmFybScgOiBzLmtpbmQgfSxcbiAgICAgIHsgbGFiZWw6ICdGb290cHJpbnQnLCB2YWx1ZTogKCgpID0+IHtcbiAgICAgICAgY29uc3QgeHMgPSBzLm1vZHVsZXMubWFwKChtKSA9PiBbbS54IC0gbS53IC8gMiwgbS54ICsgbS53IC8gMl0pO1xuICAgICAgICBjb25zdCB6cyA9IHMubW9kdWxlcy5tYXAoKG0pID0+IFttLnogLSBtLmQgLyAyLCBtLnogKyBtLmQgLyAyXSk7XG4gICAgICAgIHJldHVybiBgJHtNYXRoLm1heCguLi54cy5tYXAoKHYpID0+IHZbMV0pKSAtIE1hdGgubWluKC4uLnhzLm1hcCgodikgPT4gdlswXSkpfSBcdTAwRDcgJHtNYXRoLm1heCguLi56cy5tYXAoKHYpID0+IHZbMV0pKSAtIE1hdGgubWluKC4uLnpzLm1hcCgodikgPT4gdlswXSkpfSBtYDtcbiAgICAgIH0pKCkgfSxcbiAgICAgIHsgbGFiZWw6ICdBcnQnLCB2YWx1ZTogJ0J1aWx0IFx1MDBCNyBwcm92aXNpb25hbCBOb3hlbCBkZXNpZ24nIH0sXG4gICAgXSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gc2l0ZUluc3BlY3Rpb24od29ybGQ6IFdvcmxkLCByZWY6IHsgc2l0ZUlkOiBzdHJpbmcgfSk6IEluc3BlY3Rpb25JbmZvIHwgbnVsbCB7XG4gIGNvbnN0IHNpdGUgPSB3b3JsZC5zaXRlcy5maW5kKChzKSA9PiBzLmlkID09PSByZWYuc2l0ZUlkKTtcbiAgaWYgKCFzaXRlKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICByZWYsIGtleTogaW5zcGVjdGlvbktleShyZWYpLCBuYW1lOiBJTlNQRUNUSU9OX0NBVEFMT0dbc2l0ZS5raW5kXS5uYW1lLFxuICAgIGNhdGVnb3J5OiAnQXJjaGl0ZWN0dXJlIFx1MDBCNyBsYW5kbWFyaycsIGRlc2NyaXB0aW9uOiBJTlNQRUNUSU9OX0NBVEFMT0dbc2l0ZS5raW5kXS5kZXNjcmlwdGlvbixcbiAgICBmYWN0czogW3sgbGFiZWw6ICdQdXJwb3NlJywgdmFsdWU6ICdOYXZpZ2F0aW9uIGxhbmRtYXJrIFx1MDBCNyBub3QgaGFydmVzdGFibGUnIH0sXG4gICAgICB7IGxhYmVsOiAnQXJ0JywgdmFsdWU6IHNpdGUucHJvdmlzaW9uYWwgPyAnUHJvdmlzaW9uYWwgTm94ZWwgZGVzaWduJyA6ICdBdXRob3JlZCcgfV0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHN0b2NrcGlsZUluc3BlY3Rpb24od29ybGQ6IFdvcmxkLCByZWY6IHsgc3RvY2twaWxlSWQ6IHN0cmluZyB9KTogSW5zcGVjdGlvbkluZm8gfCBudWxsIHtcbiAgY29uc3Qgc3RvY2sgPSB3b3JsZC5saWZlPy5zdG9ja3BpbGVzLmdldChyZWYuc3RvY2twaWxlSWQpO1xuICBpZiAoIXN0b2NrKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZW50cmllcyA9IE9iamVjdC5lbnRyaWVzKHN0b2NrLmludmVudG9yeSkuZmlsdGVyKChbLCBuXSkgPT4gbiA+IDApLnNvcnQoKFthXSwgW2JdKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuICBjb25zdCBzdG9yZWQgPSBlbnRyaWVzLnJlZHVjZSgoc3VtLCBbLCBuXSkgPT4gc3VtICsgbiwgMCk7XG4gIHJldHVybiB7XG4gICAgcmVmLCBrZXk6IGluc3BlY3Rpb25LZXkocmVmKSwgbmFtZTogJ0ZvdW5kZXIgc3RvY2twaWxlJyxcbiAgICBjYXRlZ29yeTogJ0FyY2hpdGVjdHVyZSBcdTAwQjcgc2V0dGxlbWVudCBzdG9yYWdlJyxcbiAgICBkZXNjcmlwdGlvbjogJ0FuIG9wZW4gdGltYmVyLWFuZC1zdG9uZSBkZXBvdC4gRGVwb3NpdCBjYXJyaWVkIHN1cHBsaWVzIGhlcmUgZm9yIHByb2Nlc3Npbmc7IHdpdGhkcmF3IHRoZW0gdG8gY2FycnkgdGhlbSBhZ2Fpbi4nLFxuICAgIGZhY3RzOiBbeyBsYWJlbDogJ1N0b3JlZCcsIHZhbHVlOiBgJHtzdG9yZWR9IC8gJHtzdG9jay5jYXBhY2l0eX1gIH0sXG4gICAgICB7IGxhYmVsOiAnQ29udGVudHMnLCB2YWx1ZTogZW50cmllcy5tYXAoKFtyLCBuXSkgPT4gYCR7bn0gJHtyfWApLmpvaW4oJyBcdTAwQjcgJykgfHwgJ0VtcHR5JyB9XSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gY3JvcEluc3BlY3Rpb24od29ybGQ6IFdvcmxkLCByZWY6IHsgY3JvcElkOiBzdHJpbmcgfSk6IEluc3BlY3Rpb25JbmZvIHwgbnVsbCB7XG4gIGNvbnN0IGxpZmUgPSB3b3JsZC5saWZlO1xuICBjb25zdCBpbmRleCA9IE51bWJlcihyZWYuY3JvcElkLnNsaWNlKCdjcm9wOicubGVuZ3RoKSk7XG4gIGlmICghbGlmZSB8fCAhL15jcm9wOlswLThdJC8udGVzdChyZWYuY3JvcElkKSkgcmV0dXJuIG51bGw7XG4gIGlmICghWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldLnNvbWUoKHMpID0+IHMua2luZCA9PT0gJ3RlcnJhY2UnKSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGNyb3AgPSBsaWZlLmNyb3BzLmdldChyZWYuY3JvcElkKTtcbiAgY29uc3QgcmVhZHkgPSAhIWNyb3AgJiYgY3JvcFJlYWR5KGNyb3AsIGxpZmUudGljayk7XG4gIHJldHVybiB7XG4gICAgcmVmLCBrZXk6IGluc3BlY3Rpb25LZXkocmVmKSwgbmFtZTogYFRlcnJhY2UgY3JvcCBwbG90ICR7aW5kZXggKyAxfWAsXG4gICAgY2F0ZWdvcnk6ICdTZXR0bGVtZW50IGluZnJhc3RydWN0dXJlIFx1MDBCNyBmYXJtIHBsb3QnLFxuICAgIGRlc2NyaXB0aW9uOiBjcm9wXG4gICAgICA/ICdBIHBsYW50ZWQgZ3JhaW4gcGxvdC4gQWR2YW5jZSBzaW11bGF0aW9uIHRpY2tzIHRvIGdyb3cgaXQsIHRoZW4gaGFydmVzdCBmb29kIGFuZCBmaWJlci4nXG4gICAgICA6ICdBbiBlbXB0eSB0aWxsZWQgdGVycmFjZSBwbG90LiBQbGFudCBpdCB3aXRoIHNlZWQgZnJvbSB0aGUgU2V0dGxlbWVudCBwYW5lbDsgdGhlcmUgaXMgbm8gcGxhbnQgaGVyZSB5ZXQuJyxcbiAgICBmYWN0czogW3sgbGFiZWw6ICdTdGF0ZScsIHZhbHVlOiAhY3JvcCA/ICdFbXB0eSBcdTAwQjcgbmVlZHMgMSBzZWVkJyA6IHJlYWR5ID8gJ1JlYWR5IHRvIGhhcnZlc3QnIDogJ0dyb3dpbmcnIH0sXG4gICAgICB7IGxhYmVsOiAnWWllbGQnLCB2YWx1ZTogY3JvcCA/ICc2IGZvb2QgKyAxIGZpYmVyIHdoZW4gaGFydmVzdGVkJyA6ICdQbGFudCB0aHJvdWdoIHRoZSBTZXR0bGVtZW50IHBhbmVsJyB9LFxuICAgICAgLi4uKGNyb3AgPyBbeyBsYWJlbDogJ0dyb3d0aCcsIHZhbHVlOiBgJHtNYXRoLm1pbihsaWZlLnRpY2sgLSBjcm9wLnBsYW50ZWRUaWNrLCBjcm9wLmdyb3d0aFRpY2tzKX0gLyAke2Nyb3AuZ3Jvd3RoVGlja3N9IHRpY2tzYCB9XSA6IFtdKV0sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlSW5zcGVjdGlvbih3b3JsZDogV29ybGQsIHJlZjogSW5zcGVjdGlvblJlZik6IEluc3BlY3Rpb25JbmZvIHwgbnVsbCB7XG4gIGlmICgnZW50aXR5SWQnIGluIHJlZikgcmV0dXJuIGVudGl0eUluc3BlY3Rpb24od29ybGQsIHJlZik7XG4gIGlmICgnc3RydWN0dXJlSWQnIGluIHJlZikgcmV0dXJuIHN0cnVjdHVyZUluc3BlY3Rpb24od29ybGQsIHJlZik7XG4gIGlmICgnc2l0ZUlkJyBpbiByZWYpIHJldHVybiBzaXRlSW5zcGVjdGlvbih3b3JsZCwgcmVmKTtcbiAgaWYgKCdraXRJZCcgaW4gcmVmKSB7XG4gICAgY29uc3QgaXRlbSA9IEtJVF9JTlNQRUNUSU9OW3JlZi5raXRJZF07XG4gICAgcmV0dXJuIGl0ZW0gPyB7IHJlZiwga2V5OiBpbnNwZWN0aW9uS2V5KHJlZiksIGNhdGVnb3J5OiAnQXJjaGl0ZWN0dXJlIFx1MDBCNyBwcm92aXNpb25hbCBraXQnLCAuLi5pdGVtLFxuICAgICAgZmFjdHM6IFt7IGxhYmVsOiAnU2NlbmUnLCB2YWx1ZTogJ05veGVsIGludGVncmF0aW9uLXRlc3QgbW9kdWxlIFx1MDBCNyBwcm92aXNpb25hbCBhcnQnIH1dIH0gOiBudWxsO1xuICB9XG4gIGlmICgnc3RvY2twaWxlSWQnIGluIHJlZikgcmV0dXJuIHN0b2NrcGlsZUluc3BlY3Rpb24od29ybGQsIHJlZik7XG4gIHJldHVybiBjcm9wSW5zcGVjdGlvbih3b3JsZCwgcmVmKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluc3BlY3Rpb25SZWYob2JqZWN0OiB7IHVzZXJEYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSwgYmF0Y2hJZD86IG51bWJlcik6IEluc3BlY3Rpb25SZWYgfCBudWxsIHtcbiAgY29uc3QgZGF0YSA9IG9iamVjdC51c2VyRGF0YTtcbiAgaWYgKCFkYXRhKSByZXR1cm4gbnVsbDtcbiAgaWYgKHR5cGVvZiBkYXRhLmluc3BlY3RhYmxlQmF0Y2hJZHMgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBiYXRjaElkID09PSAnbnVtYmVyJykge1xuICAgIGNvbnN0IGlkcyA9IGRhdGEuaW5zcGVjdGFibGVCYXRjaElkcyBhcyB1bmtub3duO1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KGlkcykgJiYgdHlwZW9mIGlkc1tiYXRjaElkXSA9PT0gJ3N0cmluZycgPyB7IGVudGl0eUlkOiBpZHNbYmF0Y2hJZF0gfSA6IG51bGw7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgb2YgWydzdHJ1Y3R1cmVJZCcsICdzaXRlSWQnLCAna2l0SWQnLCAnc3RvY2twaWxlSWQnLCAnY3JvcElkJ10gYXMgY29uc3QpIHtcbiAgICBpZiAodHlwZW9mIGRhdGFba2V5XSA9PT0gJ3N0cmluZycpIHJldHVybiB7IFtrZXldOiBkYXRhW2tleV0gfSBhcyBJbnNwZWN0aW9uUmVmO1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5cbiIsICIvLyBTY2VuZS1ncmFwaCBzZWxlY3Rpb24gZm9yIHRoZSByZWFkLW9ubHkgaW5zcGVjdG9yLiBPbmx5IHJlZ2lzdGVyZWQgcm9vdHMgYXJlXG4vLyB0cmF2ZXJzZWQ7IGNvbnN0cnVjdGlvbiBnaG9zdHMsIHNreSwgd2F0ZXIgYW5kIHVucmVsYXRlZCBnZW9tZXRyeSBzdGF5IG91dC5cbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCB7IFdvcmxkIH0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IEluc3BlY3Rpb25SZWYsIGluc3BlY3Rpb25LZXksIGluc3BlY3Rpb25SZWYsIHJlc29sdmVJbnNwZWN0aW9uIH0gZnJvbSAnLi9pbnNwZWN0aW9uJztcbmltcG9ydCB7IEluc3BlY3RvclBhbmVsIH0gZnJvbSAnLi4vdWkvaW5zcGVjdG9yJztcblxuZXhwb3J0IGludGVyZmFjZSBJbnNwZWN0aW9uVGFyZ2V0IHtcbiAgcmVmOiBJbnNwZWN0aW9uUmVmO1xuICBrZXk6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBjYXRlZ29yeTogc3RyaW5nO1xuICB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyO1xufVxudHlwZSBJbnRlcnNlY3Rpb24gPSBUSFJFRS5JbnRlcnNlY3Rpb24gJiB7IGJhdGNoSWQ/OiBudW1iZXIgfTtcblxuZnVuY3Rpb24gb3JpZ2luRGlzdGFuY2Uob3JpZ2luOiBUSFJFRS5WZWN0b3IzLCBwb2ludDogVEhSRUUuVmVjdG9yMyk6IG51bWJlciB7XG4gIHJldHVybiBvcmlnaW4uZGlzdGFuY2VUbyhwb2ludCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2aXNpYmxlSW5IaWVyYXJjaHkob2JqZWN0OiBUSFJFRS5PYmplY3QzRCwgc2NlbmU6IFRIUkVFLk9iamVjdDNEKTogYm9vbGVhbiB7XG4gIGxldCBjdXJyZW50OiBUSFJFRS5PYmplY3QzRCB8IG51bGwgPSBvYmplY3Q7XG4gIHdoaWxlIChjdXJyZW50KSB7XG4gICAgaWYgKCFjdXJyZW50LnZpc2libGUpIHJldHVybiBmYWxzZTtcbiAgICBpZiAoY3VycmVudCA9PT0gc2NlbmUpIHJldHVybiB0cnVlO1xuICAgIGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudDtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKiBSZXNvbHZlIHRoZSBuZWFyZXN0IGFuY2VzdG9yIGNhcnJ5aW5nIGEgc3RhYmxlIHdvcmxkL3JlbmRlciBpZGVudGl0eS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpZGVudGlmaWVkUmVmKG9iamVjdDogVEhSRUUuT2JqZWN0M0QsIGJhdGNoSWQ/OiBudW1iZXIpOiBJbnNwZWN0aW9uUmVmIHwgbnVsbCB7XG4gIGxldCBjdXJyZW50OiBUSFJFRS5PYmplY3QzRCB8IG51bGwgPSBvYmplY3Q7XG4gIHdoaWxlIChjdXJyZW50KSB7XG4gICAgY29uc3QgcmVmID0gaW5zcGVjdGlvblJlZihjdXJyZW50LCBiYXRjaElkKTtcbiAgICBpZiAocmVmKSByZXR1cm4gcmVmO1xuICAgIGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudDtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9iamVjdFRhcmdldChvYmplY3Q6IFRIUkVFLk9iamVjdDNEKTogVEhSRUUuVmVjdG9yMyB8IG51bGwge1xuICBjb25zdCBhbmNob3IgPSBvYmplY3QudXNlckRhdGEuaW5zcGVjdFRhcmdldDtcbiAgaWYgKCFhbmNob3IpIHJldHVybiBudWxsO1xuICBjb25zdCBwb2ludCA9IG5ldyBUSFJFRS5WZWN0b3IzKGFuY2hvci54LCBhbmNob3IueSwgYW5jaG9yLnopO1xuICBvYmplY3QudXBkYXRlV29ybGRNYXRyaXgodHJ1ZSwgZmFsc2UpO1xuICBvYmplY3QubG9jYWxUb1dvcmxkKHBvaW50KTtcbiAgcmV0dXJuIHBvaW50O1xufVxuXG5leHBvcnQgY2xhc3MgU2NlbmVJbnNwZWN0b3Ige1xuICBwcml2YXRlIHJlYWRvbmx5IHJvb3RzID0gbmV3IFNldDxUSFJFRS5PYmplY3QzRD4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSByYXljYXN0ZXIgPSBuZXcgVEhSRUUuUmF5Y2FzdGVyKCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgcG9pbnRlciA9IG5ldyBUSFJFRS5WZWN0b3IyKCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgcG9pbnRlcnMgPSBuZXcgTWFwPG51bWJlciwgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgbW92ZWQ6IGJvb2xlYW4gfT4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBwYW5lbDogSW5zcGVjdG9yUGFuZWw7XG4gIHByaXZhdGUgc2VsZWN0ZWQ6IEluc3BlY3Rpb25SZWYgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBob3ZlcmVkOiBJbnNwZWN0aW9uUmVmIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgdGFyZ2V0Q2FjaGU6IFJlY29yZDxzdHJpbmcsIEluc3BlY3Rpb25UYXJnZXQ+ID0ge307XG4gIHByaXZhdGUgbGFzdFJldmlzaW9uID0gLTE7XG4gIHByaXZhdGUgdmlzaWJsZSA9IHRydWU7XG4gIHByaXZhdGUgZ2VzdHVyZVVzZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSBsYXN0UG9pbnRlciA9IHsgeDogMCwgeTogMCB9O1xuICBwcml2YXRlIGxhc3RIb3ZlclBpY2sgPSAtSW5maW5pdHk7XG4gIHByaXZhdGUgbGFzdFBvaW50ZXJNb3ZlID0gLUluZmluaXR5O1xuICBwcml2YXRlIHBlbmRpbmdIb3ZlciA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczoge1xuICAgIHdvcmxkOiBXb3JsZDsgc2NlbmU6IFRIUkVFLlNjZW5lOyBjYW1lcmE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhO1xuICAgIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7IHRlcnJhaW46IFRIUkVFLk9iamVjdDNEO1xuICB9LCBwYW5lbD86IEluc3BlY3RvclBhbmVsKSB7XG4gICAgdGhpcy5wYW5lbCA9IHBhbmVsID8/IG5ldyBJbnNwZWN0b3JQYW5lbCh7XG4gICAgICBvblNlbGVjdDogKGtleSkgPT4ge1xuICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRhcmdldENhY2hlW2tleV07XG4gICAgICAgIGlmICh0YXJnZXQpIHRoaXMucGluKHRhcmdldC5yZWYpO1xuICAgICAgfSxcbiAgICAgIG9uRGlzbWlzczogKCkgPT4gdGhpcy5kaXNtaXNzKCksXG4gICAgfSk7XG4gICAgb3B0aW9ucy5jYW52YXMudGFiSW5kZXggPSAwO1xuICAgIG9wdGlvbnMuY2FudmFzLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsXG4gICAgICAnQVNUcml4IHdvcmxkLiBEcmFnIHRvIG9yYml0LiBDbGljayBvciB0YXAgdG8gaW5zcGVjdC4gVXNlIEluc3BlY3QgZm9yIGEga2V5Ym9hcmQgb2JqZWN0IGxpc3QuJyk7XG4gICAgdGhpcy5iaW5kUG9pbnRlcigpO1xuICAgIHRoaXMub3B0aW9ucy5jYW52YXMub3duZXJEb2N1bWVudD8uZGVmYXVsdFZpZXc/LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZXZlbnQpID0+IHtcbiAgICAgIGlmIChldmVudC5rZXkgIT09ICdFc2NhcGUnKSByZXR1cm47XG4gICAgICBjb25zdCBlc2NhcGVGcm9tSW5zcGVjdG9yID0gdGhpcy5wYW5lbC5yb290LmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlIHwgbnVsbCk7XG4gICAgICB0aGlzLmRpc21pc3MoKTtcbiAgICAgIGlmIChlc2NhcGVGcm9tSW5zcGVjdG9yKSB7XG4gICAgICAgIHRoaXMub3B0aW9ucy5jYW52YXMuZm9jdXMoKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH1cbiAgICB9LCB0cnVlKTtcbiAgfVxuXG4gIGFkZFJvb3Qocm9vdDogVEhSRUUuT2JqZWN0M0QpOiB2b2lkIHsgdGhpcy5yb290cy5hZGQocm9vdCk7IHRoaXMucmVmcmVzaFRhcmdldHMoKTsgfVxuICBwcml2YXRlIGJpbmRQb2ludGVyKCk6IHZvaWQge1xuICAgIHRoaXMub3B0aW9ucy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmRvd24nLCAoZXZlbnQpID0+IHtcbiAgICAgIHRoaXMucG9pbnRlcnMuc2V0KGV2ZW50LnBvaW50ZXJJZCwgeyB4OiBldmVudC5jbGllbnRYLCB5OiBldmVudC5jbGllbnRZLCBtb3ZlZDogZmFsc2UgfSk7XG4gICAgICBpZiAoZXZlbnQuaXNQcmltYXJ5ICYmIHRoaXMucG9pbnRlcnMuc2l6ZSA9PT0gMSkgdGhpcy5nZXN0dXJlVXNlZCA9IGZhbHNlO1xuICAgICAgaWYgKHRoaXMucG9pbnRlcnMuc2l6ZSA+IDEpIHRoaXMuZ2VzdHVyZVVzZWQgPSB0cnVlO1xuICAgIH0pO1xuICAgIHRoaXMub3B0aW9ucy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcm1vdmUnLCAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IGRvd24gPSB0aGlzLnBvaW50ZXJzLmdldChldmVudC5wb2ludGVySWQpO1xuICAgICAgaWYgKGRvd24gJiYgTWF0aC5oeXBvdChldmVudC5jbGllbnRYIC0gZG93bi54LCBldmVudC5jbGllbnRZIC0gZG93bi55KSA+IDcpIGRvd24ubW92ZWQgPSB0cnVlO1xuICAgICAgdGhpcy5sYXN0UG9pbnRlciA9IHsgeDogZXZlbnQuY2xpZW50WCwgeTogZXZlbnQuY2xpZW50WSB9O1xuICAgICAgdGhpcy5sYXN0UG9pbnRlck1vdmUgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAgIGlmIChldmVudC5wb2ludGVyVHlwZSA9PT0gJ21vdXNlJyAmJiBldmVudC5idXR0b25zID09PSAwICYmICFkb3duPy5tb3ZlZCAmJiB0aGlzLnZpc2libGUgJiYgIXRoaXMuc2VsZWN0ZWQpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nSG92ZXIgPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5sYXN0UG9pbnRlck1vdmUgPSAtSW5maW5pdHk7XG4gICAgICAgIHRoaXMucGVuZGluZ0hvdmVyID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5vcHRpb25zLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVydXAnLCAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IGRvd24gPSB0aGlzLnBvaW50ZXJzLmdldChldmVudC5wb2ludGVySWQpO1xuICAgICAgY29uc3Qgd2FzR2VzdHVyZSA9IHRoaXMuZ2VzdHVyZVVzZWQgfHwgdGhpcy5wb2ludGVycy5zaXplID4gMTtcbiAgICAgIHRoaXMucG9pbnRlcnMuZGVsZXRlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgICBpZiAodGhpcy5wb2ludGVycy5zaXplID09PSAwKSB0aGlzLmdlc3R1cmVVc2VkID0gZmFsc2U7XG4gICAgICAvLyBBIHBvaW50ZXIgcmVsZWFzZSBvbiB0aGUgY2FudmFzIGlzIGEgZGVsaWJlcmF0ZSBtb3VzZS1ob3ZlciBsb2NhdGlvbixcbiAgICAgIC8vIG5vdCBhIHJlamVjdGVkIGRyYWcgb3IgcGluY2guXG4gICAgICB0aGlzLmxhc3RQb2ludGVyID0geyB4OiBldmVudC5jbGllbnRYLCB5OiBldmVudC5jbGllbnRZIH07XG4gICAgICB0aGlzLmxhc3RQb2ludGVyTW92ZSA9IGV2ZW50LnBvaW50ZXJUeXBlID09PSAnbW91c2UnID8gcGVyZm9ybWFuY2Uubm93KCkgOiAtSW5maW5pdHk7XG4gICAgICB0aGlzLnBlbmRpbmdIb3ZlciA9IGV2ZW50LnBvaW50ZXJUeXBlID09PSAnbW91c2UnICYmIGV2ZW50LmJ1dHRvbnMgPT09IDAgJiYgdGhpcy52aXNpYmxlICYmICF0aGlzLnNlbGVjdGVkO1xuICAgICAgLy8gQ2FtZXJhIG9yYml0IG1heSBjYXB0dXJlL3JlbGVhc2UgcG9pbnRlcnMuIEEgc2hvcnQgcHJlc3MgYWxvbmUgaXMgbm90XG4gICAgICBpZiAoIXRoaXMudmlzaWJsZSB8fCAhZG93biB8fCBkb3duLm1vdmVkIHx8IHdhc0dlc3R1cmUgfHwgdGhpcy5nZXN0dXJlVXNlZCB8fCAhZXZlbnQuaXNQcmltYXJ5KSByZXR1cm47XG4gICAgICBjb25zdCByZWYgPSB0aGlzLnBpY2soZXZlbnQuY2xpZW50WCwgZXZlbnQuY2xpZW50WSk7XG4gICAgICBpZiAocmVmKSB0aGlzLnBpbihyZWYpO1xuICAgICAgZWxzZSBpZiAodGhpcy5ob3ZlcmVkKSB0aGlzLmRpc21pc3MoKTtcbiAgICB9KTtcbiAgICB0aGlzLm9wdGlvbnMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJjYW5jZWwnLCAoZXZlbnQpID0+IHtcbiAgICAgIHRoaXMucG9pbnRlcnMuZGVsZXRlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgICB0aGlzLmdlc3R1cmVVc2VkID0gdHJ1ZTtcbiAgICAgIHRoaXMuY2xlYXJIb3ZlcigpO1xuICAgIH0pO1xuICAgIHRoaXMub3B0aW9ucy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmxlYXZlJywgKCkgPT4ge1xuICAgICAgdGhpcy5sYXN0UG9pbnRlck1vdmUgPSAtSW5maW5pdHk7XG4gICAgICB0aGlzLnBlbmRpbmdIb3ZlciA9IGZhbHNlO1xuICAgICAgdGhpcy5jbGVhckhvdmVyKCk7XG4gICAgfSk7XG4gICAgdGhpcy5vcHRpb25zLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgKGV2ZW50KSA9PiB7XG4gICAgICAvLyBDbGlja2luZyB0aGUgY2FudmFzIGZvY3VzZXMgaXQuIE1vdmluZyBmb2N1cyB0byB0aGUgaW5zcGVjdG9yJ3MgQ2xvc2VcbiAgICAgIC8vIGJ1dHRvbiBtdXN0IG5vdCBkaXNtaXNzIGl0cyBwYXJlbnQgY2FyZCBiZWZvcmUgdGhlIGJ1dHRvbiBjYW4gY2xpY2suXG4gICAgICBjb25zdCBuZXh0Rm9jdXMgPSBldmVudC5yZWxhdGVkVGFyZ2V0O1xuICAgICAgaWYgKCF0aGlzLnBhbmVsLnJvb3QuY29udGFpbnMobmV4dEZvY3VzIGFzIE5vZGUgfCBudWxsKSkgdGhpcy5kaXNtaXNzKCk7XG4gICAgfSk7XG4gIH1cblxuICAvKiogRmlyc3Qgb3BhcXVlIHN1cmZhY2Ugd2luczsgb25seSBwYXJlbnQgZGVjb3JhdGlvbiBjYW4gc2hhcmUgYW4gaWRlbnRpdHkuICovXG4gIHByaXZhdGUgcGljayh4OiBudW1iZXIsIHk6IG51bWJlcik6IEluc3BlY3Rpb25SZWYgfCBudWxsIHtcbiAgICBjb25zdCByZWN0ID0gdGhpcy5vcHRpb25zLmNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBpZiAoIXJlY3Qud2lkdGggfHwgIXJlY3QuaGVpZ2h0IHx8IHRoaXMucm9vdHMuc2l6ZSA9PT0gMCkgcmV0dXJuIG51bGw7XG4gICAgdGhpcy5wb2ludGVyLnNldCgoeCAtIHJlY3QubGVmdCkgLyByZWN0LndpZHRoICogMiAtIDEsIC0oeSAtIHJlY3QudG9wKSAvIHJlY3QuaGVpZ2h0ICogMiArIDEpO1xuICAgIHRoaXMucmF5Y2FzdGVyLnNldEZyb21DYW1lcmEodGhpcy5wb2ludGVyLCB0aGlzLm9wdGlvbnMuY2FtZXJhKTtcbiAgICBjb25zdCBoaXRzID0gdGhpcy5yYXljYXN0ZXIuaW50ZXJzZWN0T2JqZWN0cyhbdGhpcy5vcHRpb25zLnRlcnJhaW4sIC4uLnRoaXMucm9vdHNdLCB0cnVlKTtcbiAgICBmb3IgKGNvbnN0IGhpdCBvZiBoaXRzIGFzIEludGVyc2VjdGlvbltdKSB7XG4gICAgICBpZiAoIXZpc2libGVJbkhpZXJhcmNoeShoaXQub2JqZWN0LCB0aGlzLm9wdGlvbnMuc2NlbmUpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHJlZiA9IGlkZW50aWZpZWRSZWYoaGl0Lm9iamVjdCwgaGl0LmJhdGNoSWQpO1xuICAgICAgaWYgKHJlZiAmJiAnc3RydWN0dXJlSWQnIGluIHJlZikge1xuICAgICAgICBjb25zdCBzdHJ1Y3R1cmUgPSB0aGlzLm9wdGlvbnMud29ybGQuc3RydWN0dXJlcy5nZXQocmVmLnN0cnVjdHVyZUlkKTtcbiAgICAgICAgaWYgKHN0cnVjdHVyZT8ua2luZCA9PT0gJ3RlcnJhY2UnICYmIHN0cnVjdHVyZS5kZXNpZ25WZXJzaW9uID09PSAyKSB7XG4gICAgICAgICAgLy8gVGhlIGVhcnRoIGJlZCBpcyBpbnRlbnRpb25hbGx5IHNsaWdodGx5IGhpZ2hlciB0aGFuIGEgcGxhbnRlZCByb3cnc1xuICAgICAgICAgIC8vIGZvbGlhZ2UuIFRlc3QgdGhlIGF1dGhvcml0YXRpdmUgcm93IGJvdW5kcyByYXRoZXIgdGhhbiBsZXR0aW5nIGl0c1xuICAgICAgICAgIC8vIHBhcmVudCBzb2lsIG1lc2ggbWFrZSBldmVyeSBjcm9wIHVuc2VsZWN0YWJsZSBieSBwb2ludGVyLlxuICAgICAgICAgIGNvbnN0IHJvd3MgPSBzdHJ1Y3R1cmUubW9kdWxlcy5maWx0ZXIoKG1vZHVsZSkgPT4gbW9kdWxlLmtpbmQgPT09ICdjcm9wX3JvdycpO1xuICAgICAgICAgIGxldCBjbG9zZXN0SW5kZXggPSAtMTtcbiAgICAgICAgICBsZXQgY2xvc2VzdERpc3RhbmNlID0gSW5maW5pdHk7XG4gICAgICAgICAgY29uc3QgcG9pbnQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgICAgICAgIHJvd3MuZm9yRWFjaCgocm93LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYm91bmRzID0gbmV3IFRIUkVFLkJveDMoXG4gICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKHJvdy54IC0gcm93LncgLyAyLCByb3cueSAtIDAuMDEsIHJvdy56IC0gcm93LmQgLyAyKSxcbiAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMocm93LnggKyByb3cudyAvIDIsIHJvdy55ICsgTWF0aC5tYXgocm93LmgsIDAuNSksIHJvdy56ICsgcm93LmQgLyAyKSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBpbnRlcnNlY3Rpb24gPSB0aGlzLnJheWNhc3Rlci5yYXkuaW50ZXJzZWN0Qm94KGJvdW5kcywgcG9pbnQpO1xuICAgICAgICAgICAgaWYgKCFpbnRlcnNlY3Rpb24pIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gb3JpZ2luRGlzdGFuY2UodGhpcy5yYXljYXN0ZXIucmF5Lm9yaWdpbiwgaW50ZXJzZWN0aW9uKTtcbiAgICAgICAgICAgIGlmIChkaXN0YW5jZSA8PSBoaXQuZGlzdGFuY2UgKyAwLjUgJiYgZGlzdGFuY2UgPCBjbG9zZXN0RGlzdGFuY2UpIHtcbiAgICAgICAgICAgICAgY2xvc2VzdEluZGV4ID0gaW5kZXg7XG4gICAgICAgICAgICAgIGNsb3Nlc3REaXN0YW5jZSA9IGRpc3RhbmNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGlmIChjbG9zZXN0SW5kZXggPj0gMCkge1xuICAgICAgICAgICAgY29uc3Qgcm93UmVmID0geyBjcm9wSWQ6IGBjcm9wOiR7Y2xvc2VzdEluZGV4fWAgfTtcbiAgICAgICAgICAgIGlmIChyZXNvbHZlSW5zcGVjdGlvbih0aGlzLm9wdGlvbnMud29ybGQsIHJvd1JlZikpIHJldHVybiByb3dSZWY7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAocmVmKSByZXR1cm4gcmVzb2x2ZUluc3BlY3Rpb24odGhpcy5vcHRpb25zLndvcmxkLCByZWYpID8gcmVmIDogbnVsbDtcbiAgICAgIC8vIEFuIHVubGFiZWxsZWQgY2hpbGQgaW5zaWRlIGEgbGFiZWxsZWQgZ3JvdXAgbWF5IGJlIGZvbGlhZ2Ugb3IgYSBwcm9wO1xuICAgICAgLy8gaXRzIG93bmluZyBncm91cCByZW1haW5zIGlkZW50aWZpYWJsZS4gT3RoZXIgc29saWRzIGJsb2NrIGRlZXBlciBwaWNrcy5cbiAgICAgIGxldCBwYXJlbnQgPSBoaXQub2JqZWN0LnBhcmVudDtcbiAgICAgIHdoaWxlIChwYXJlbnQgJiYgdmlzaWJsZUluSGllcmFyY2h5KHBhcmVudCwgdGhpcy5vcHRpb25zLnNjZW5lKSkge1xuICAgICAgICBpZiAocGFyZW50LnVzZXJEYXRhLnN0cnVjdHVyZUlkIHx8IHBhcmVudC51c2VyRGF0YS5zaXRlSWRcbiAgICAgICAgICB8fCBwYXJlbnQudXNlckRhdGEuc3RvY2twaWxlSWQgfHwgcGFyZW50LnVzZXJEYXRhLmNyb3BJZCkge1xuICAgICAgICAgIGNvbnN0IGFuY2VzdG9yUmVmID0gaW5zcGVjdGlvblJlZihwYXJlbnQpO1xuICAgICAgICAgIHJldHVybiBhbmNlc3RvclJlZiAmJiByZXNvbHZlSW5zcGVjdGlvbih0aGlzLm9wdGlvbnMud29ybGQsIGFuY2VzdG9yUmVmKSA/IGFuY2VzdG9yUmVmIDogbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5yb290cy5oYXMocGFyZW50KSkgYnJlYWs7XG4gICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIHBpbihyZWY6IEluc3BlY3Rpb25SZWYpOiB2b2lkIHtcbiAgICBjb25zdCBpbmZvID0gcmVzb2x2ZUluc3BlY3Rpb24odGhpcy5vcHRpb25zLndvcmxkLCByZWYpO1xuICAgIGlmICghaW5mbykgeyB0aGlzLmRpc21pc3MoKTsgcmV0dXJuOyB9XG4gICAgY29uc3QgZnJvbUxpc3QgPSB0aGlzLnBhbmVsLmlzTGlzdFZpc2libGUoKTtcbiAgICB0aGlzLnNlbGVjdGVkID0gcmVmO1xuICAgIHRoaXMuaG92ZXJlZCA9IG51bGw7XG4gICAgdGhpcy5wYW5lbC5zZXRMaXN0VmlzaWJsZShmYWxzZSk7XG4gICAgdGhpcy5wYW5lbC5zaG93KGluZm8sIHRydWUpO1xuICAgIGlmIChmcm9tTGlzdCkgdGhpcy5wYW5lbC5mb2N1c0NhcmQoKTtcbiAgICB0aGlzLmxhc3RQb2ludGVyTW92ZSA9IC1JbmZpbml0eTtcbiAgICB0aGlzLnBlbmRpbmdIb3ZlciA9IGZhbHNlO1xuICB9XG5cbiAgdXBkYXRlKCk6IHZvaWQge1xuICAgIGlmICghdGhpcy52aXNpYmxlKSByZXR1cm47XG4gICAgaWYgKHRoaXMub3B0aW9ucy53b3JsZC5yZXZpc2lvbiAhPT0gdGhpcy5sYXN0UmV2aXNpb24pIHtcbiAgICAgIHRoaXMucmVmcmVzaFRhcmdldHMoKTtcbiAgICAgIGlmICh0aGlzLnNlbGVjdGVkKSB7XG4gICAgICAgIGNvbnN0IGluZm8gPSByZXNvbHZlSW5zcGVjdGlvbih0aGlzLm9wdGlvbnMud29ybGQsIHRoaXMuc2VsZWN0ZWQpO1xuICAgICAgICBpZiAoaW5mbykgdGhpcy5wYW5lbC5zaG93KGluZm8sIHRydWUpO1xuICAgICAgICBlbHNlIHRoaXMuZGlzbWlzcygpO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBub3cgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAvLyBObyBzY2FuIG9uIHN0YXRpYyBzY2VuZXMgb3IgdG91Y2ggZGV2aWNlcy4gTWF4aW11bSAxMi41IG1vdXNlIHBpY2tzL3NlYy5cbiAgICBpZiAobm93IC0gdGhpcy5sYXN0UG9pbnRlck1vdmUgPiAyNTAgfHwgIXRoaXMucGVuZGluZ0hvdmVyIHx8IG5vdyAtIHRoaXMubGFzdEhvdmVyUGljayA8IDgwKSByZXR1cm47XG4gICAgdGhpcy5wZW5kaW5nSG92ZXIgPSBmYWxzZTtcbiAgICB0aGlzLmxhc3RIb3ZlclBpY2sgPSBub3c7XG4gICAgY29uc3QgcmVmID0gdGhpcy5waWNrKHRoaXMubGFzdFBvaW50ZXIueCwgdGhpcy5sYXN0UG9pbnRlci55KTtcbiAgICB0aGlzLmhvdmVyZWQgPSByZWY7XG4gICAgY29uc3QgaW5mbyA9IHJlZiA/IHJlc29sdmVJbnNwZWN0aW9uKHRoaXMub3B0aW9ucy53b3JsZCwgcmVmKSA6IG51bGw7XG4gICAgaWYgKGluZm8gJiYgaW5mby5rZXkgIT09IHRoaXMucGFuZWwucGlubmVkS2V5KCkpIHtcbiAgICAgIHRoaXMucGFuZWwuc2hvdyhpbmZvLCBmYWxzZSwgdGhpcy5sYXN0UG9pbnRlci54ICsgMTgsIHRoaXMubGFzdFBvaW50ZXIueSArIDE4KTtcbiAgICB9IGVsc2UgdGhpcy5jbGVhckhvdmVyKCk7XG4gIH1cblxuICBwcml2YXRlIGNsZWFySG92ZXIoKTogdm9pZCB7XG4gICAgdGhpcy5ob3ZlcmVkID0gbnVsbDtcbiAgICBpZiAoIXRoaXMuc2VsZWN0ZWQpIHRoaXMucGFuZWwuaGlkZUNhcmQoKTtcbiAgfVxuXG4gIGRpc21pc3MoKTogdm9pZCB7XG4gICAgdGhpcy5zZWxlY3RlZCA9IG51bGw7XG4gICAgdGhpcy5ob3ZlcmVkID0gbnVsbDtcbiAgICB0aGlzLnBhbmVsLmhpZGVDYXJkKHRydWUpO1xuICAgIHRoaXMucGFuZWwuc2V0TGlzdFZpc2libGUoZmFsc2UpO1xuICAgIHRoaXMubGFzdFBvaW50ZXJNb3ZlID0gLUluZmluaXR5O1xuICAgIHRoaXMucGVuZGluZ0hvdmVyID0gZmFsc2U7XG4gIH1cblxuICByZWZyZXNoVGFyZ2V0cygpOiB2b2lkIHtcbiAgICBjb25zdCB0YXJnZXRzOiBSZWNvcmQ8c3RyaW5nLCBJbnNwZWN0aW9uVGFyZ2V0PiA9IHt9O1xuICAgIGZvciAoY29uc3Qgcm9vdCBvZiB0aGlzLnJvb3RzKSB7XG4gICAgICBpZiAoIXZpc2libGVJbkhpZXJhcmNoeShyb290LCB0aGlzLm9wdGlvbnMuc2NlbmUpKSBjb250aW51ZTtcbiAgICAgIHJvb3QudHJhdmVyc2UoKG9iamVjdCkgPT4ge1xuICAgICAgICBjb25zdCBiYXRjaFRhcmdldHMgPSBvYmplY3QudXNlckRhdGEuaW5zcGVjdGFibGVUYXJnZXRzO1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShiYXRjaFRhcmdldHMpKSB7XG4gICAgICAgICAgZm9yIChjb25zdCB0YXJnZXQgb2YgYmF0Y2hUYXJnZXRzKSB7XG4gICAgICAgICAgICBpZiAoIXRhcmdldCB8fCB0eXBlb2YgdGFyZ2V0LmVudGl0eUlkICE9PSAnc3RyaW5nJykgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCByZWYgPSB7IGVudGl0eUlkOiB0YXJnZXQuZW50aXR5SWQgfTtcbiAgICAgICAgICAgIGNvbnN0IGluZm8gPSByZXNvbHZlSW5zcGVjdGlvbih0aGlzLm9wdGlvbnMud29ybGQsIHJlZik7XG4gICAgICAgICAgICBpZiAoaW5mbykgdGFyZ2V0c1tpbmZvLmtleV0gPSB7IHJlZiwga2V5OiBpbmZvLmtleSwgbmFtZTogaW5mby5uYW1lLFxuICAgICAgICAgICAgICBjYXRlZ29yeTogaW5mby5jYXRlZ29yeSwgeDogdGFyZ2V0LngsIHk6IHRhcmdldC55LCB6OiB0YXJnZXQueiB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZWYgPSBpbnNwZWN0aW9uUmVmKG9iamVjdCk7XG4gICAgICAgIGlmICghcmVmKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGtleSA9IGluc3BlY3Rpb25LZXkocmVmKTtcbiAgICAgICAgaWYgKHRhcmdldHNba2V5XSkgcmV0dXJuO1xuICAgICAgICBjb25zdCBpbmZvID0gcmVzb2x2ZUluc3BlY3Rpb24odGhpcy5vcHRpb25zLndvcmxkLCByZWYpO1xuICAgICAgICBjb25zdCBwb2ludCA9IG9iamVjdFRhcmdldChvYmplY3QpO1xuICAgICAgICBpZiAoIWluZm8gfHwgIXBvaW50KSByZXR1cm47XG4gICAgICAgIHRhcmdldHNba2V5XSA9IHsgcmVmLCBrZXksIG5hbWU6IGluZm8ubmFtZSwgY2F0ZWdvcnk6IGluZm8uY2F0ZWdvcnksXG4gICAgICAgICAgeDogcG9pbnQueCwgeTogcG9pbnQueSwgejogcG9pbnQueiB9O1xuICAgICAgfSk7XG4gICAgfVxuICAgIHRoaXMudGFyZ2V0Q2FjaGUgPSB0YXJnZXRzO1xuICAgIHRoaXMubGFzdFJldmlzaW9uID0gdGhpcy5vcHRpb25zLndvcmxkLnJldmlzaW9uO1xuICAgIHRoaXMucGFuZWwucmVuZGVyTGlzdChPYmplY3QudmFsdWVzKHRhcmdldHMpLnNvcnQoKGEsIGIpID0+IGEuY2F0ZWdvcnkubG9jYWxlQ29tcGFyZShiLmNhdGVnb3J5KVxuICAgICAgfHwgYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSB8fCBhLmtleS5sb2NhbGVDb21wYXJlKGIua2V5KSkpO1xuICB9XG5cbiAgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy52aXNpYmxlID0gdmlzaWJsZTtcbiAgICB0aGlzLnBhbmVsLnNldFZpc2libGUodmlzaWJsZSk7XG4gICAgaWYgKCF2aXNpYmxlKSB0aGlzLmRpc21pc3MoKTtcbiAgfVxuXG4gIG1ldHJpY3MoKTogeyB2aXNpYmxlOiBib29sZWFuOyBzZWxlY3RlZDogc3RyaW5nIHwgbnVsbDsgaG92ZXJlZDogc3RyaW5nIHwgbnVsbDtcbiAgICB0YXJnZXRDb3VudDogbnVtYmVyOyB0YXJnZXRzOiBSZWNvcmQ8c3RyaW5nLCBJbnNwZWN0aW9uVGFyZ2V0PiB9IHtcbiAgICByZXR1cm4geyB2aXNpYmxlOiB0aGlzLnZpc2libGUsXG4gICAgICBzZWxlY3RlZDogdGhpcy5zZWxlY3RlZCA/IHJlc29sdmVJbnNwZWN0aW9uKHRoaXMub3B0aW9ucy53b3JsZCwgdGhpcy5zZWxlY3RlZCk/Lm5hbWUgPz8gbnVsbCA6IG51bGwsXG4gICAgICBob3ZlcmVkOiB0aGlzLmhvdmVyZWQgPyByZXNvbHZlSW5zcGVjdGlvbih0aGlzLm9wdGlvbnMud29ybGQsIHRoaXMuaG92ZXJlZCk/Lm5hbWUgPz8gbnVsbCA6IG51bGwsXG4gICAgICB0YXJnZXRDb3VudDogT2JqZWN0LmtleXModGhpcy50YXJnZXRDYWNoZSkubGVuZ3RoLCB0YXJnZXRzOiB0aGlzLnRhcmdldENhY2hlIH07XG4gIH1cbn1cbiIsICIvLyBEaXJlY3QtRE9NLCByZWFkLW9ubHkgaW5zcGVjdGlvbiBVSS4gSG92ZXIgaXMgbm90IGEgbGl2ZSByZWdpb246IGRlbGliZXJhdGVcbi8vIGtleWJvYXJkIHNlbGVjdGlvbiBvcGVucyB0aGUgbGFiZWxsZWQgZGlhbG9nIHdpdGhvdXQgcG9pbnRlci1tb3ZlIGNoYXR0ZXIuXG5pbXBvcnQgeyBJbnNwZWN0aW9uSW5mbyB9IGZyb20gJy4uL2FwcC9pbnNwZWN0aW9uJztcbmltcG9ydCB0eXBlIHsgSW5zcGVjdGlvblRhcmdldCB9IGZyb20gJy4uL2FwcC9pbnNwZWN0b3InO1xuXG5leHBvcnQgY2xhc3MgSW5zcGVjdG9yUGFuZWwge1xuICByZWFkb25seSByb290OiBIVE1MRWxlbWVudDtcbiAgcmVhZG9ubHkgdG9nZ2xlOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgcHJpdmF0ZSByZWFkb25seSBjYXJkOiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSByZWFkb25seSBsaXN0OiBIVE1MRWxlbWVudDtcblxuICBjb25zdHJ1Y3RvcihvcHRpb25zOiB7IG9uU2VsZWN0OiAoa2V5OiBzdHJpbmcpID0+IHZvaWQ7IG9uRGlzbWlzczogKCkgPT4gdm9pZCB9KSB7XG4gICAgdGhpcy5yb290ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2VjdGlvbicpO1xuICAgIHRoaXMucm9vdC5pZCA9ICdpbnNwZWN0b3InO1xuICAgIHRoaXMucm9vdC5jbGFzc05hbWUgPSAnaW5zcGVjdG9yJztcbiAgICB0aGlzLnJvb3Quc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ09iamVjdCBpbnNwZWN0b3InKTtcbiAgICB0aGlzLnRvZ2dsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgIHRoaXMudG9nZ2xlLnR5cGUgPSAnYnV0dG9uJztcbiAgICB0aGlzLnRvZ2dsZS5pZCA9ICdpbnNwZWN0LXRvZ2dsZSc7XG4gICAgdGhpcy50b2dnbGUuY2xhc3NOYW1lID0gJ2luc3BlY3QtdG9nZ2xlJztcbiAgICB0aGlzLnRvZ2dsZS50ZXh0Q29udGVudCA9ICdJbnNwZWN0JztcbiAgICB0aGlzLnRvZ2dsZS50aXRsZSA9ICdDaG9vc2UgYW4gb2JqZWN0IGJ5IG5hbWUsIG9yIGhvdmVyIC8gY2xpY2sgLyB0YXAgb25lIGluIHRoZSB3b3JsZCc7XG4gICAgdGhpcy50b2dnbGUuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG4gICAgdGhpcy50b2dnbGUuc2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJywgJ2luc3BlY3Qtb2JqZWN0cycpO1xuICAgIHRoaXMudG9nZ2xlLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5zZXRMaXN0VmlzaWJsZSh0aGlzLmxpc3QuaGlkZGVuKSk7XG5cbiAgICB0aGlzLmNhcmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhcnRpY2xlJyk7XG4gICAgdGhpcy5jYXJkLmlkID0gJ2luc3BlY3QtY2FyZCc7XG4gICAgdGhpcy5jYXJkLnNldEF0dHJpYnV0ZSgncm9sZScsICdkaWFsb2cnKTtcbiAgICB0aGlzLmNhcmQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsbGVkYnknLCAnaW5zcGVjdC1uYW1lJyk7XG4gICAgdGhpcy5jYXJkLnNldEF0dHJpYnV0ZSgnYXJpYS1kZXNjcmliZWRieScsICdpbnNwZWN0LWRlc2NyaXB0aW9uJyk7XG4gICAgdGhpcy5jYXJkLmhpZGRlbiA9IHRydWU7XG4gICAgY29uc3QgaGVhZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGhlYWQuY2xhc3NOYW1lID0gJ2luc3BlY3QtaGVhZCc7XG4gICAgY29uc3QgaGVhZGluZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvbnN0IGNhdGVnb3J5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgIGNhdGVnb3J5LmNsYXNzTmFtZSA9ICdpbnNwZWN0LWNhdGVnb3J5JztcbiAgICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2gyJyk7XG4gICAgdGl0bGUuaWQgPSAnaW5zcGVjdC1uYW1lJztcbiAgICBoZWFkaW5nLmFwcGVuZChjYXRlZ29yeSwgdGl0bGUpO1xuICAgIGNvbnN0IGNsb3NlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgY2xvc2UudHlwZSA9ICdidXR0b24nO1xuICAgIGNsb3NlLmlkID0gJ2luc3BlY3QtY2xvc2UnO1xuICAgIGNsb3NlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdDbG9zZSBvYmplY3QgaW5zcGVjdGlvbicpO1xuICAgIGNsb3NlLnRleHRDb250ZW50ID0gJ1x1MDBENyc7XG4gICAgY2xvc2UuaGlkZGVuID0gdHJ1ZTtcbiAgICBoZWFkLmFwcGVuZChoZWFkaW5nLCBjbG9zZSk7XG4gICAgY29uc3QgZGVzY3JpcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG4gICAgZGVzY3JpcHRpb24uaWQgPSAnaW5zcGVjdC1kZXNjcmlwdGlvbic7XG4gICAgY29uc3QgZmFjdHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkbCcpO1xuICAgIGZhY3RzLmNsYXNzTmFtZSA9ICdpbnNwZWN0LWZhY3RzJztcbiAgICB0aGlzLmNhcmQuYXBwZW5kKGhlYWQsIGRlc2NyaXB0aW9uLCBmYWN0cyk7XG4gICAgdGhpcy5zaG93ID0gKGluZm8sIHBpbm5lZCwgeCA9IDAsIHkgPSAwKSA9PiB7XG4gICAgICBjbG9zZS5oaWRkZW4gPSAhcGlubmVkO1xuICAgICAgY2xvc2Uub25jbGljayA9IHBpbm5lZCA/ICgpID0+IG9wdGlvbnMub25EaXNtaXNzKCkgOiBudWxsO1xuICAgICAgdGhpcy5jYXJkLmhpZGRlbiA9IGZhbHNlO1xuICAgICAgdGhpcy5jYXJkLmNsYXNzTGlzdC50b2dnbGUoJ2lzLXBpbm5lZCcsIHBpbm5lZCk7XG4gICAgICB0aGlzLmNhcmQuZGF0YXNldC5yZWYgPSBpbmZvLmtleTtcbiAgICAgIHRoaXMuY2FyZC5kYXRhc2V0Lm1vZGUgPSBwaW5uZWQgPyAncGlubmVkJyA6ICdob3Zlcic7XG4gICAgICBjYXRlZ29yeS50ZXh0Q29udGVudCA9IGluZm8uY2F0ZWdvcnk7XG4gICAgICB0aXRsZS50ZXh0Q29udGVudCA9IGluZm8ubmFtZTtcbiAgICAgIGRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gaW5mby5kZXNjcmlwdGlvbjtcbiAgICAgIGZhY3RzLnJlcGxhY2VDaGlsZHJlbigpO1xuICAgICAgZm9yIChjb25zdCBmYWN0IG9mIGluZm8uZmFjdHMpIHtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZHQnKTtcbiAgICAgICAgbGFiZWwudGV4dENvbnRlbnQgPSBmYWN0LmxhYmVsO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RkJyk7XG4gICAgICAgIHZhbHVlLnRleHRDb250ZW50ID0gZmFjdC52YWx1ZTtcbiAgICAgICAgcm93LmFwcGVuZChsYWJlbCwgdmFsdWUpO1xuICAgICAgICBmYWN0cy5hcHBlbmQocm93KTtcbiAgICAgIH1cbiAgICAgIGlmIChwaW5uZWQpIHtcbiAgICAgICAgdGhpcy5jYXJkLnN0eWxlLnJlbW92ZVByb3BlcnR5KCdsZWZ0Jyk7XG4gICAgICAgIHRoaXMuY2FyZC5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgndG9wJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmNhcmQuc3R5bGUubGVmdCA9IGAke01hdGgubWF4KDgsIE1hdGgubWluKHgsIHdpbmRvdy5pbm5lcldpZHRoIC0gMzI0KSl9cHhgO1xuICAgICAgICB0aGlzLmNhcmQuc3R5bGUudG9wID0gYCR7TWF0aC5tYXgoOCwgTWF0aC5taW4oeSwgd2luZG93LmlubmVySGVpZ2h0IC0gdGhpcy5jYXJkLm9mZnNldEhlaWdodCAtIDEyKSl9cHhgO1xuICAgICAgfVxuICAgIH07XG5cbiAgICB0aGlzLmxpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB0aGlzLmxpc3QuaWQgPSAnaW5zcGVjdC1vYmplY3RzJztcbiAgICB0aGlzLmxpc3QuY2xhc3NOYW1lID0gJ2luc3BlY3QtbGlzdCc7XG4gICAgdGhpcy5saXN0LmhpZGRlbiA9IHRydWU7XG4gICAgY29uc3QgbGlzdFRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgIGxpc3RUaXRsZS5jbGFzc05hbWUgPSAnaW5zcGVjdC1jYXRlZ29yeSc7XG4gICAgbGlzdFRpdGxlLmlkID0gJ2luc3BlY3QtbGlzdC10aXRsZSc7XG4gICAgbGlzdFRpdGxlLnRleHRDb250ZW50ID0gJ05hbWVkIG9iamVjdHMgaW4gdGhpcyBzY2VuZSc7XG4gICAgdGhpcy5saXN0LnNldEF0dHJpYnV0ZSgncm9sZScsICdncm91cCcpO1xuICAgIHRoaXMubGlzdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWxsZWRieScsICdpbnNwZWN0LWxpc3QtdGl0bGUnKTtcbiAgICBjb25zdCBoZWxwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgIGhlbHAudGV4dENvbnRlbnQgPSAnTmFtZXMgcmVhZCBmcm9tIHRoZSBjdXJyZW50IHdvcmxkLiBJbnNwZWN0aW9uIGRvZXMgbm90IGNoYW5nZSBvciBnYXRoZXIgYW55dGhpbmcuJztcbiAgICB0aGlzLmxpc3QuYXBwZW5kKGxpc3RUaXRsZSwgaGVscCk7XG4gICAgdGhpcy5yZW5kZXJMaXN0ID0gKGl0ZW1zKSA9PiB7XG4gICAgICB0aGlzLmxpc3QucXVlcnlTZWxlY3RvckFsbCgnYnV0dG9uW2RhdGEtaW5zcGVjdC1rZXldJykuZm9yRWFjaCgoYnV0dG9uKSA9PiBidXR0b24ucmVtb3ZlKCkpO1xuICAgICAgZm9yIChjb25zdCB0YXJnZXQgb2YgaXRlbXMpIHtcbiAgICAgICAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgIGJ1dHRvbi50eXBlID0gJ2J1dHRvbic7XG4gICAgICAgIGJ1dHRvbi5kYXRhc2V0Lmluc3BlY3RLZXkgPSB0YXJnZXQua2V5O1xuICAgICAgICBidXR0b24udGV4dENvbnRlbnQgPSBgJHt0YXJnZXQubmFtZX0gXHUyMDE0ICR7dGFyZ2V0LmNhdGVnb3J5fWA7XG4gICAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IG9wdGlvbnMub25TZWxlY3QodGFyZ2V0LmtleSkpO1xuICAgICAgICB0aGlzLmxpc3QuYXBwZW5kKGJ1dHRvbik7XG4gICAgICB9XG4gICAgICB0aGlzLmxpc3QuZGF0YXNldC5jb3VudCA9IFN0cmluZyhpdGVtcy5sZW5ndGgpO1xuICAgIH07XG4gICAgdGhpcy5yb290LmFwcGVuZCh0aGlzLnRvZ2dsZSwgdGhpcy5saXN0LCB0aGlzLmNhcmQpO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5yb290KTtcbiAgfVxuXG4gIHJlYWRvbmx5IHNob3c6IChpbmZvOiBJbnNwZWN0aW9uSW5mbywgcGlubmVkOiBib29sZWFuLCB4PzogbnVtYmVyLCB5PzogbnVtYmVyKSA9PiB2b2lkO1xuICByZWFkb25seSByZW5kZXJMaXN0OiAoaXRlbXM6IEluc3BlY3Rpb25UYXJnZXRbXSkgPT4gdm9pZDtcblxuICBoaWRlQ2FyZChyZXN0b3JlRm9jdXMgPSBmYWxzZSk6IHZvaWQge1xuICAgIC8vIEhpZGluZyBhIGZvY3VzZWQgQ2xvc2UgYnV0dG9uIG1vdmVzIGZvY3VzIGluIHNvbWUgYnJvd3NlcnMuIENhcHR1cmUgZm9jdXNcbiAgICAvLyBvd25lcnNoaXAgZmlyc3Qgc28gRXNjYXBlL0Nsb3NlIGNhbiByZWxpYWJseSByZXR1cm4gdG8gdGhlIHdvcmxkIGNhbnZhcy5cbiAgICBjb25zdCBoYWRJbnNwZWN0b3JGb2N1cyA9IHRoaXMucm9vdC5jb250YWlucyhkb2N1bWVudC5hY3RpdmVFbGVtZW50KTtcbiAgICB0aGlzLmNhcmQuaGlkZGVuID0gdHJ1ZTtcbiAgICB0aGlzLmNhcmQucmVtb3ZlQXR0cmlidXRlKCdkYXRhLXJlZicpO1xuICAgIHRoaXMuY2FyZC5yZW1vdmVBdHRyaWJ1dGUoJ2RhdGEtbW9kZScpO1xuICAgIHRoaXMuY2FyZC5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnbGVmdCcpO1xuICAgIHRoaXMuY2FyZC5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgndG9wJyk7XG4gICAgaWYgKHJlc3RvcmVGb2N1cyAmJiBoYWRJbnNwZWN0b3JGb2N1cykge1xuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQ2FudmFzRWxlbWVudD4oJyNhcHAgY2FudmFzJyk/LmZvY3VzKCk7XG4gICAgfVxuICB9XG5cbiAgc2V0TGlzdFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuICAgIHRoaXMubGlzdC5oaWRkZW4gPSAhdmlzaWJsZTtcbiAgICB0aGlzLnRvZ2dsZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcodmlzaWJsZSkpO1xuICAgIGlmICh2aXNpYmxlKSB0aGlzLmhpZGVDYXJkKCk7XG4gIH1cblxuICBzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHsgdGhpcy5yb290LmhpZGRlbiA9ICF2aXNpYmxlOyB9XG4gIHBpbm5lZEtleSgpOiBzdHJpbmcgfCBudWxsIHtcbiAgICByZXR1cm4gdGhpcy5jYXJkLmhpZGRlbiB8fCB0aGlzLmNhcmQuZGF0YXNldC5tb2RlICE9PSAncGlubmVkJyA/IG51bGwgOiB0aGlzLmNhcmQuZGF0YXNldC5yZWYgPz8gbnVsbDtcbiAgfVxuICBpc0xpc3RWaXNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gIXRoaXMubGlzdC5oaWRkZW47IH1cbiAgZm9jdXNDYXJkKCk6IHZvaWQgeyB0aGlzLmNhcmQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbjpub3QoW2hpZGRlbl0pJyk/LmZvY3VzKCk7IH1cbiAgZm9jdXNMaXN0KCk6IHZvaWQgeyB0aGlzLmxpc3QucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbicpPy5mb2N1cygpOyB9XG59XG4iLCAiLy8gU3R5bCBuYXR1cmFsIGFzc2V0cyBcdTIwMTQgW1BST1ZJU0lPTkFMIGFydCBkaXJlY3Rpb24sIGRvY3VtZW50ZWQgZ2VvbWV0cnldLlxuLy9cbi8vIFRoZSBwcm9qZWN0IGhhcyB0aHJlZSBkaXN0aW5jdCBhdXRob3JlZCBsYW5ndWFnZXMgKEFEQiBcdTAwQTcyKTpcbi8vICAgKiB2b3hlbCB0ZXJyYWluICAgXHUyMDE0IDEgbSBvY2N1cGFuY3kvbWF0ZXJpYWwgdm9sdW1lLCB0aGlzIGRpcmVjdG9yeSdzIHRlcnJhaW47XG4vLyAgICogTm94ZWwgICAgICAgICAgIFx1MjAxNCBodW1hbi1tYWRlIGFyY2hpdGVjdHVyZSBhbmQgcHJvcHMgKGBub3hlbC50c2ApO1xuLy8gICAqIFN0eWwgKGBuYXRfYCkgICBcdTIwMTQgb3JnYW5pYyBuYXR1cmFsIGFzc2V0cywgaW1wbGVtZW50ZWQgaGVyZS5cbi8vXG4vLyBBUy0wMDEgdjIgc3VwZXJzZWRlcyB0aGUgb2xkIHN0YWNrZWQtY3Vib2lkIHRyZWVzOiBjYW5vcGllcyBhcmUgZmFjZXRlZFxuLy8gTmF0TWFzcyBlbGxpcHNvaWRzICg3XHUyMDEzMTEgc2lkZXMsIGZsYXQgc2hhZGVkKSBhbmQgdHJ1bmtzIGFyZSA2LWdvbiBOYXRDb2x1bW5cbi8vIHByaXNtcy4gUm9ja3MgYW5kIG9yZSBob3N0cyBzdGF5IGJsb2NreSBieSBkZXNpZ24uIFRoZSBvd25lcidzIHJlZmVyZW5jZVxuLy8gaW1hZ2VzIGFyZSBzdGlsbCBhYnNlbnQsIHNvIHRoZSBzZXQgcmVtYWlucyBwcm92aXNpb25hbC5cbi8vXG4vLyBFbnRpdGllcyBhcmUgdGhlIHNvdXJjZSBvZiB0cnV0aC4gQSBoYXJ2ZXN0ZWQgZW50aXR5IGlzIG5vdCByZW5kZXJlZDsgdGhlXG4vLyByZW5kZXJlciBuZXZlciBkZWNpZGVzIHdoZXRoZXIgYSB0cmVlIGV4aXN0cy5cbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCB7IG1lcmdlR2VvbWV0cmllcyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS91dGlscy9CdWZmZXJHZW9tZXRyeVV0aWxzLmpzJztcbmltcG9ydCBwYWxldHRlIGZyb20gJy4uL2RhdGEvcGFsZXR0ZS5qc29uJztcbmltcG9ydCB7IEVudGl0eSwgRW50aXR5S2luZCwgV29ybGQsIG11bGJlcnJ5MzIgfSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5jb25zdCBNID0gcGFsZXR0ZS5tYXRlcmlhbHMgYXMgUmVjb3JkPHN0cmluZywgeyBoZXg6IHN0cmluZyB9PjtcbmNvbnN0IEggPSAoazogc3RyaW5nKSA9PiBNW2tdLmhleDtcblxuY29uc3QgR1JFRU4gPSBbSCgnY2Fub3B5X2dyZWVuX2EnKSwgSCgnY2Fub3B5X2dyZWVuX2InKSwgSCgnY2Fub3B5X2dyZWVuX2MnKV07XG5jb25zdCBQSU5LID0gW0goJ2Nhbm9weV9waW5rX2InKSwgSCgnY2Fub3B5X3BpbmsnKV07XG5jb25zdCBUUlVOSyA9IEgoJ3RydW5rJyk7XG5jb25zdCBCQVJLID0gSCgnYmFya19kYXJrJyk7XG5jb25zdCBTVE9ORSA9IEgoJ3N0b25lX3RvcCcpO1xuY29uc3QgU1RPTkVfQiA9IEgoJ3N0b25lX2JvZHlfYicpO1xuY29uc3QgU1RPTkVfU0hBREUgPSBIKCdzdG9uZV9zaGFkZScpO1xuY29uc3QgT1JFID0gSCgnb3JlX2NyeXN0YWwnKTtcbmNvbnN0IE9SRV9CID0gSCgnb3JlX2NyeXN0YWxfYicpO1xuY29uc3QgT0NIUkUgPSBIKCdzdHJhdGFfb2NocmUnKTtcblxudHlwZSBWZWMzID0gW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXG5pbnRlcmZhY2UgTWFzc1NwZWMge1xuICBjeDogbnVtYmVyOyBjeTogbnVtYmVyOyBjejogbnVtYmVyO1xuICByeDogbnVtYmVyOyByeTogbnVtYmVyOyByejogbnVtYmVyO1xuICBzaWRlczogbnVtYmVyO1xuICBzaGFwZTogJ29yYicgfCAnZG9tZScgfCAnZHJ1bSc7XG4gIHlhd0RlZzogbnVtYmVyO1xuICBoZXg6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFRyZWVTcGVjIHtcbiAgdHJ1bmtSOiBudW1iZXI7XG4gIHRydW5rSDogbnVtYmVyO1xuICBmbGFyZVI6IG51bWJlcjtcbiAgZmxhcmVIOiBudW1iZXI7XG4gIG1hc3NlczogTWFzc1NwZWNbXTtcbiAgc2F0ZWxsaXRlPzogeyBjeDogbnVtYmVyOyBjeTogbnVtYmVyOyBjejogbnVtYmVyOyBzeDogbnVtYmVyOyBzeTogbnVtYmVyOyBzejogbnVtYmVyOyBoZXg6IHN0cmluZyB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHByaW1pdGl2ZXMgLS0tLS0tLS0tLVxuZnVuY3Rpb24gcGFpbnQoZ2VvOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSwgaGV4OiBzdHJpbmcpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGcgPSBnZW8uaW5kZXggPyBnZW8udG9Ob25JbmRleGVkKCkgOiBnZW87XG4gIGcuZGVsZXRlQXR0cmlidXRlKCd1dicpO1xuICBjb25zdCBjb2xvciA9IG5ldyBUSFJFRS5Db2xvcihoZXgpO1xuICBjb25zdCBuID0gZy5hdHRyaWJ1dGVzLnBvc2l0aW9uLmNvdW50O1xuICBjb25zdCBhcnIgPSBuZXcgRmxvYXQzMkFycmF5KG4gKiAzKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICBhcnJbaSAqIDNdID0gY29sb3IucjtcbiAgICBhcnJbaSAqIDMgKyAxXSA9IGNvbG9yLmc7XG4gICAgYXJyW2kgKiAzICsgMl0gPSBjb2xvci5iO1xuICB9XG4gIGcuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYXJyLCAzKSk7XG4gIHJldHVybiBnO1xufVxuXG5mdW5jdGlvbiBib3goY3g6IG51bWJlciwgY3k6IG51bWJlciwgY3o6IG51bWJlciwgc3g6IG51bWJlciwgc3k6IG51bWJlciwgc3o6IG51bWJlciwgaGV4OiBzdHJpbmcpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGcgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoc3gsIHN5LCBzeik7XG4gIGcudHJhbnNsYXRlKGN4LCBjeSwgY3opO1xuICBjb25zdCBvdXQgPSBwYWludChnLCBoZXgpO1xuICBvdXQuY29tcHV0ZVZlcnRleE5vcm1hbHMoKTtcbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gY29sdW1uKGN4OiBudW1iZXIsIGN6OiBudW1iZXIsIHkwOiBudW1iZXIsIGg6IG51bWJlciwgcjogbnVtYmVyLCBzaWRlczogbnVtYmVyLCB5YXdEZWc6IG51bWJlciwgaGV4OiBzdHJpbmcpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGcgPSBuZXcgVEhSRUUuQ3lsaW5kZXJHZW9tZXRyeShyLCByLCBoLCBzaWRlcywgMSwgZmFsc2UpO1xuICBnLnRyYW5zbGF0ZShjeCwgeTAgKyBoIC8gMiwgY3opO1xuICBnLnJvdGF0ZVkoeWF3RGVnICogTWF0aC5QSSAvIDE4MCk7XG4gIGNvbnN0IG91dCA9IHBhaW50KGcsIGhleCk7XG4gIG91dC5jb21wdXRlVmVydGV4Tm9ybWFscygpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vKipcbiAqIExpdGVyYWwgaW1wbGVtZW50YXRpb24gb2YgQVMtMDAxIFx1MDBBNzMuMTogZWxsaXBzb2lkIHRlc3NlbGxhdGlvbiB3aXRoIGZsYXRcbiAqIGZhY2Ugbm9ybWFscywgb3V0d2FyZCB3aW5kaW5nLCBhbmQgYXV0aG9yZWQgZmFjZXQgcGhhc2UuXG4gKi9cbmZ1bmN0aW9uIG1hc3NHZW9tZXRyeShtOiBNYXNzU3BlYyk6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3QgcG9zOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBucm06IG51bWJlcltdID0gW107XG4gIGNvbnN0IEQgPSBNYXRoLlBJIC8gMTgwO1xuICBjb25zdCBsb24gPSAoazogbnVtYmVyKSA9PiBtLnlhd0RlZyAqIEQgKyBrICogMiAqIE1hdGguUEkgLyBtLnNpZGVzO1xuICBjb25zdCByb3cgPSAocGhpRGVnOiBudW1iZXIpOiBWZWMzW10gPT4ge1xuICAgIGNvbnN0IHBoaSA9IHBoaURlZyAqIEQsIGMgPSBNYXRoLmNvcyhwaGkpLCBzID0gTWF0aC5zaW4ocGhpKTtcbiAgICBjb25zdCBvdXQ6IFZlYzNbXSA9IFtdO1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgbS5zaWRlczsgaysrKSB7XG4gICAgICBjb25zdCB0ID0gbG9uKGspO1xuICAgICAgb3V0LnB1c2goW1xuICAgICAgICBtLmN4ICsgbS5yeCAqIGMgKiBNYXRoLmNvcyh0KSxcbiAgICAgICAgbS5jeSArIG0ucnkgKiBzLFxuICAgICAgICBtLmN6ICsgbS5yeiAqIGMgKiBNYXRoLnNpbih0KSxcbiAgICAgIF0pO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xuICB9O1xuICBjb25zdCBwb2xlID0gKHNpZ246IG51bWJlcik6IFZlYzMgPT4gW20uY3gsIG0uY3kgKyBzaWduICogbS5yeSwgbS5jel07XG4gIGNvbnN0IGNhcENlbnRyZSA9IChwaGlEZWc6IG51bWJlcik6IFZlYzMgPT4gW20uY3gsIG0uY3kgKyBtLnJ5ICogTWF0aC5zaW4ocGhpRGVnICogRCksIG0uY3pdO1xuXG4gIGNvbnN0IHRyaSA9IChhOiBWZWMzLCBiOiBWZWMzLCBjOiBWZWMzKTogdm9pZCA9PiB7XG4gICAgY29uc3QgdXggPSBiWzBdIC0gYVswXSwgdXkgPSBiWzFdIC0gYVsxXSwgdXogPSBiWzJdIC0gYVsyXTtcbiAgICBjb25zdCB2eCA9IGNbMF0gLSBhWzBdLCB2eSA9IGNbMV0gLSBhWzFdLCB2eiA9IGNbMl0gLSBhWzJdO1xuICAgIGxldCBueCA9IHV5ICogdnogLSB1eiAqIHZ5LCBueSA9IHV6ICogdnggLSB1eCAqIHZ6LCBueiA9IHV4ICogdnkgLSB1eSAqIHZ4O1xuICAgIGNvbnN0IEwgPSBNYXRoLmh5cG90KG54LCBueSwgbnopIHx8IDE7XG4gICAgbnggLz0gTDsgbnkgLz0gTDsgbnogLz0gTDtcbiAgICBjb25zdCBmeCA9IChhWzBdICsgYlswXSArIGNbMF0pIC8gMyAtIG0uY3g7XG4gICAgY29uc3QgZnkgPSAoYVsxXSArIGJbMV0gKyBjWzFdKSAvIDMgLSBtLmN5O1xuICAgIGNvbnN0IGZ6ID0gKGFbMl0gKyBiWzJdICsgY1syXSkgLyAzIC0gbS5jejtcbiAgICBpZiAobnggKiBmeCArIG55ICogZnkgKyBueiAqIGZ6IDwgMCkge1xuICAgICAgY29uc3QgdCA9IGI7IGIgPSBjOyBjID0gdDtcbiAgICAgIG54ID0gLW54OyBueSA9IC1ueTsgbnogPSAtbno7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcCBvZiBbYSwgYiwgY10pIHtcbiAgICAgIHBvcy5wdXNoKHBbMF0sIHBbMV0sIHBbMl0pO1xuICAgICAgbnJtLnB1c2gobngsIG55LCBueik7XG4gICAgfVxuICB9O1xuICBjb25zdCBiYW5kID0gKHIwOiBWZWMzW10sIHIxOiBWZWMzW10pOiB2b2lkID0+IHtcbiAgICBmb3IgKGxldCBrID0gMDsgayA8IG0uc2lkZXM7IGsrKykge1xuICAgICAgY29uc3QgaiA9IChrICsgMSkgJSBtLnNpZGVzO1xuICAgICAgdHJpKHIwW2tdLCByMFtqXSwgcjFba10pO1xuICAgICAgdHJpKHIwW2pdLCByMVtqXSwgcjFba10pO1xuICAgIH1cbiAgfTtcbiAgY29uc3QgZmFuID0gKHJpbmc6IFZlYzNbXSwgYXBleDogVmVjMyk6IHZvaWQgPT4ge1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgbS5zaWRlczsgaysrKSB0cmkocmluZ1trXSwgcmluZ1soayArIDEpICUgbS5zaWRlc10sIGFwZXgpO1xuICB9O1xuICBjb25zdCBjYXAgPSAocmluZzogVmVjM1tdLCBjZW50cmU6IFZlYzMpOiB2b2lkID0+IHtcbiAgICBmb3IgKGxldCBrID0gMDsgayA8IG0uc2lkZXM7IGsrKykgdHJpKHJpbmdbKGsgKyAxKSAlIG0uc2lkZXNdLCByaW5nW2tdLCBjZW50cmUpO1xuICB9O1xuXG4gIGlmIChtLnNoYXBlID09PSAnb3JiJykge1xuICAgIGNvbnN0IHIgPSBbcm93KC00NSksIHJvdygwKSwgcm93KDQ1KV07XG4gICAgYmFuZChyWzBdLCByWzFdKTsgYmFuZChyWzFdLCByWzJdKTtcbiAgICBmYW4oclswXSwgcG9sZSgtMSkpOyBmYW4oclsyXSwgcG9sZSgrMSkpO1xuICB9IGVsc2UgaWYgKG0uc2hhcGUgPT09ICdkb21lJykge1xuICAgIGNvbnN0IHIgPSBbcm93KDApLCByb3coNDUpXTtcbiAgICBiYW5kKHJbMF0sIHJbMV0pO1xuICAgIGZhbihyWzFdLCBwb2xlKCsxKSk7XG4gICAgY2FwKHJbMF0sIGNhcENlbnRyZSgwKSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgciA9IFtyb3coLTQ1KSwgcm93KDApLCByb3coNDUpXTtcbiAgICBiYW5kKHJbMF0sIHJbMV0pOyBiYW5kKHJbMV0sIHJbMl0pO1xuICAgIGNhcChyWzBdLCBjYXBDZW50cmUoLTQ1KSk7IGNhcChyWzJdLCBjYXBDZW50cmUoKzQ1KSk7XG4gIH1cblxuICBjb25zdCBnZW8gPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcbiAgZ2VvLnNldEF0dHJpYnV0ZSgncG9zaXRpb24nLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShwb3MsIDMpKTtcbiAgZ2VvLnNldEF0dHJpYnV0ZSgnbm9ybWFsJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUobnJtLCAzKSk7XG4gIHJldHVybiBwYWludChnZW8sIG0uaGV4KTtcbn1cblxuZnVuY3Rpb24gYXNzZW1ibHkocGFydHM6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5W10pOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGcgPSBtZXJnZUdlb21ldHJpZXMocGFydHMsIGZhbHNlKTtcbiAgaWYgKCFnKSB0aHJvdyBuZXcgRXJyb3IoJ1N0eWwgZ2VvbWV0cnkgbWVyZ2UgZmFpbGVkJyk7XG4gIGcuY29tcHV0ZUJvdW5kaW5nQm94KCk7XG4gIGcuY29tcHV0ZUJvdW5kaW5nU3BoZXJlKCk7XG4gIHJldHVybiBnO1xufVxuXG4vLyAtLS0tLS0tLS0tIGF1dGhvcmVkIHNwZWNpZXMgKEFTLTAwMSBcdTAwQTc2LjMpIC0tLS0tLS0tLS1cbmNvbnN0IFQxOiBUcmVlU3BlYyA9IHtcbiAgdHJ1bmtSOiAwLjI4LCB0cnVua0g6IDQuOTAsIGZsYXJlUjogMC4zOCwgZmxhcmVIOiAwLjMwLFxuICBtYXNzZXM6IFtcbiAgICB7IGN4OiAwLjAwLCBjeTogNS40NSwgY3o6IDAuMDAsIHJ4OiAyLjEwLCByeTogMS4wMCwgcno6IDIuMDUsIHNpZGVzOiA5LCBzaGFwZTogJ29yYicsIHlhd0RlZzogMCwgaGV4OiBHUkVFTlswXSB9LFxuICAgIHsgY3g6IDAuMjAsIGN5OiA2Ljg1LCBjejogLTAuMjAsIHJ4OiAxLjQ1LCByeTogMC45NSwgcno6IDEuMzUsIHNpZGVzOiA3LCBzaGFwZTogJ29yYicsIHlhd0RlZzogMTUsIGhleDogR1JFRU5bMV0gfSxcbiAgICB7IGN4OiAtMC4xNSwgY3k6IDcuODUsIGN6OiAwLjE1LCByeDogMC45NSwgcnk6IDAuNjUsIHJ6OiAwLjkwLCBzaWRlczogNywgc2hhcGU6ICdvcmInLCB5YXdEZWc6IDMwLCBoZXg6IEdSRUVOWzJdIH0sXG4gIF0sXG4gIHNhdGVsbGl0ZTogeyBjeDogMi40MCwgY3k6IDUuNTUsIGN6OiAwLjc1LCBzeDogMC44MCwgc3k6IDAuNTAsIHN6OiAwLjgwLCBoZXg6IEdSRUVOWzJdIH0sXG59O1xuXG5jb25zdCBUMjogVHJlZVNwZWMgPSB7XG4gIHRydW5rUjogMC4zNCwgdHJ1bmtIOiAzLjg1LCBmbGFyZVI6IDAuNDYsIGZsYXJlSDogMC4yOCxcbiAgbWFzc2VzOiBbXG4gICAgeyBjeDogMC4wMCwgY3k6IDMuNTAsIGN6OiAwLjAwLCByeDogMi45NSwgcnk6IDEuMzAsIHJ6OiAyLjMwLCBzaWRlczogMTEsIHNoYXBlOiAnZG9tZScsIHlhd0RlZzogMCwgaGV4OiBHUkVFTlswXSB9LFxuICAgIHsgY3g6IDEuMzUsIGN5OiA0LjAwLCBjejogLTAuNjAsIHJ4OiAxLjQ1LCByeTogMC45NSwgcno6IDEuMjUsIHNpZGVzOiA5LCBzaGFwZTogJ2RvbWUnLCB5YXdEZWc6IDE1LCBoZXg6IEdSRUVOWzFdIH0sXG4gICAgeyBjeDogLTAuMzUsIGN5OiA1LjIwLCBjejogMC4yNSwgcng6IDEuMzUsIHJ5OiAwLjk1LCByejogMS4yNSwgc2lkZXM6IDksIHNoYXBlOiAnb3JiJywgeWF3RGVnOiAzMCwgaGV4OiBHUkVFTlsyXSB9LFxuICAgIHsgY3g6IC0xLjQ1LCBjeTogNC4wNSwgY3o6IDAuOTUsIHJ4OiAxLjEwLCByeTogMC43NSwgcno6IDEuMDAsIHNpZGVzOiA3LCBzaGFwZTogJ2RvbWUnLCB5YXdEZWc6IDQ1LCBoZXg6IEdSRUVOWzFdIH0sXG4gIF0sXG59O1xuXG5jb25zdCBUMzogVHJlZVNwZWMgPSB7XG4gIHRydW5rUjogMC4yNiwgdHJ1bmtIOiAzLjYwLCBmbGFyZVI6IDAuMzYsIGZsYXJlSDogMC4yNixcbiAgbWFzc2VzOiBbXG4gICAgeyBjeDogMC4wMCwgY3k6IDQuNTUsIGN6OiAwLjAwLCByeDogMS40NSwgcnk6IDEuMzAsIHJ6OiAxLjQwLCBzaWRlczogOSwgc2hhcGU6ICdvcmInLCB5YXdEZWc6IDAsIGhleDogR1JFRU5bMF0gfSxcbiAgICB7IGN4OiAxLjI1LCBjeTogNC4wNSwgY3o6IDAuMzAsIHJ4OiAwLjk1LCByeTogMC44MCwgcno6IDAuOTAsIHNpZGVzOiA3LCBzaGFwZTogJ29yYicsIHlhd0RlZzogMTUsIGhleDogR1JFRU5bMV0gfSxcbiAgICB7IGN4OiAtMS4zMCwgY3k6IDQuNDUsIGN6OiAtMC40NSwgcng6IDAuODUsIHJ5OiAwLjc1LCByejogMC44NSwgc2lkZXM6IDcsIHNoYXBlOiAnb3JiJywgeWF3RGVnOiAzMCwgaGV4OiBHUkVFTlsxXSB9LFxuICAgIHsgY3g6IDAuMTAsIGN5OiA1LjcwLCBjejogLTAuMTAsIHJ4OiAxLjAwLCByeTogMC45MCwgcno6IDAuOTUsIHNpZGVzOiA3LCBzaGFwZTogJ29yYicsIHlhd0RlZzogNDUsIGhleDogR1JFRU5bMl0gfSxcbiAgXSxcbiAgc2F0ZWxsaXRlOiB7IGN4OiAyLjM1LCBjeTogMy45MCwgY3o6IC0wLjI1LCBzeDogMC43MCwgc3k6IDAuNDUsIHN6OiAwLjcwLCBoZXg6IEdSRUVOWzJdIH0sXG59O1xuXG5jb25zdCBUNDogVHJlZVNwZWMgPSB7XG4gIHRydW5rUjogMC4zMCwgdHJ1bmtIOiA0LjQ1LCBmbGFyZVI6IDAuNDIsIGZsYXJlSDogMC4yOCxcbiAgbWFzc2VzOiBbXG4gICAgeyBjeDogMC4wMCwgY3k6IDUuMDAsIGN6OiAwLjAwLCByeDogMi4zNSwgcnk6IDEuMTUsIHJ6OiAyLjIwLCBzaWRlczogOSwgc2hhcGU6ICdkcnVtJywgeWF3RGVnOiAwLCBoZXg6IFBJTktbMF0gfSxcbiAgICB7IGN4OiAwLjMwLCBjeTogNS45MCwgY3o6IC0wLjI1LCByeDogMS41NSwgcnk6IDEuMDAsIHJ6OiAxLjQ1LCBzaWRlczogOSwgc2hhcGU6ICdkcnVtJywgeWF3RGVnOiAxNSwgaGV4OiBQSU5LWzFdIH0sXG4gICAgeyBjeDogLTEuNDAsIGN5OiA0Ljk1LCBjejogMC43NSwgcng6IDEuMDUsIHJ5OiAwLjgwLCByejogMS4wMCwgc2lkZXM6IDcsIHNoYXBlOiAnZHJ1bScsIHlhd0RlZzogMzAsIGhleDogUElOS1swXSB9LFxuICAgIHsgY3g6IDAuMTUsIGN5OiA2LjQ1LCBjejogMC4xMCwgcng6IDAuOTUsIHJ5OiAwLjY1LCByejogMC45MCwgc2lkZXM6IDcsIHNoYXBlOiAnb3JiJywgeWF3RGVnOiA0NSwgaGV4OiBQSU5LWzFdIH0sXG4gIF0sXG4gIHNhdGVsbGl0ZTogeyBjeDogMi41NSwgY3k6IDUuMzUsIGN6OiAwLjg1LCBzeDogMC44NSwgc3k6IDAuNTUsIHN6OiAwLjg1LCBoZXg6IFBJTktbMV0gfSxcbn07XG5cbmNvbnN0IFNIUlVCOiBNYXNzU3BlY1tdID0gW1xuICB7IGN4OiAwLjAwLCBjeTogMC41NSwgY3o6IDAuMDAsIHJ4OiAwLjcwLCByeTogMC41NSwgcno6IDAuNjUsIHNpZGVzOiA5LCBzaGFwZTogJ29yYicsIHlhd0RlZzogMCwgaGV4OiBHUkVFTlswXSB9LFxuICB7IGN4OiAwLjI1LCBjeTogMC45NSwgY3o6IC0wLjE1LCByeDogMC40NSwgcnk6IDAuNDIsIHJ6OiAwLjQyLCBzaWRlczogNywgc2hhcGU6ICdvcmInLCB5YXdEZWc6IDE1LCBoZXg6IEdSRUVOWzFdIH0sXG4gIHsgY3g6IC0wLjIwLCBjeTogMS4wNSwgY3o6IDAuMjAsIHJ4OiAwLjM0LCByeTogMC40NSwgcno6IDAuMzIsIHNpZGVzOiA3LCBzaGFwZTogJ29yYicsIHlhd0RlZzogMzAsIGhleDogR1JFRU5bMl0gfSxcbl07XG5cbmNvbnN0IHF1YW50ID0gKHY6IG51bWJlcikgPT4gTWF0aC5yb3VuZCh2IC8gMC4wNSkgKiAwLjA1O1xuY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuXG5mdW5jdGlvbiBqaXR0ZXJNYXNzKG06IE1hc3NTcGVjLCBybmQ6ICgpID0+IG51bWJlciwgZ3JvdXBYOiBudW1iZXIsIGdyb3VwWjogbnVtYmVyKTogTWFzc1NwZWMge1xuICBjb25zdCByaml0ID0gKHY6IG51bWJlcikgPT4gcXVhbnQoY2xhbXAodiAqICgxICsgKHJuZCgpICogMC4xNiAtIDAuMDgpKSwgMC4yNSwgNCkpO1xuICByZXR1cm4ge1xuICAgIC4uLm0sXG4gICAgY3g6IHF1YW50KG0uY3ggKyBncm91cFggKyAocm5kKCkgKiAwLjYwIC0gMC4zMCkpLFxuICAgIGN5OiBxdWFudChtLmN5ICsgKHJuZCgpICogMC40MCAtIDAuMjApKSxcbiAgICBjejogcXVhbnQobS5jeiArIGdyb3VwWiArIChybmQoKSAqIDAuNjAgLSAwLjMwKSksXG4gICAgcng6IHJqaXQobS5yeCksIHJ5OiByaml0KG0ucnkpLCByejogcmppdChtLnJ6KSxcbiAgICB5YXdEZWc6IG0ueWF3RGVnICsgKE1hdGguZmxvb3Iocm5kKCkgKiAzKSAtIDEpICogMTUsXG4gIH07XG59XG5cbmZ1bmN0aW9uIHRyZWVHZW9tZXRyeShzcGVjaWVzOiBUcmVlU3BlYywgdmFyaWFudDogbnVtYmVyKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xuICBjb25zdCBybmQgPSBtdWxiZXJyeTMyKChzcGVjaWVzID09PSBUMSA/IDExIDogc3BlY2llcyA9PT0gVDIgPyAyMyA6IHNwZWNpZXMgPT09IFQzID8gMzcgOiA1MykgKiA3OTE5ICsgdmFyaWFudCAqIDEwNDcyOSk7XG4gIGNvbnN0IGppdHRlcmVkID0gdmFyaWFudCA+IDA7XG4gIGNvbnN0IGdyb3VwWCA9IGppdHRlcmVkID8gcm5kKCkgKiAwLjcwIC0gMC4zNSA6IDA7XG4gIGNvbnN0IGdyb3VwWiA9IGppdHRlcmVkID8gcm5kKCkgKiAwLjcwIC0gMC4zNSA6IDA7XG4gIGNvbnN0IHRydW5rUiA9IGppdHRlcmVkID8gcXVhbnQoY2xhbXAoc3BlY2llcy50cnVua1IgKyAocm5kKCkgKiAwLjEwIC0gMC4wNSksIDAuMjAsIDAuNDApKSA6IHNwZWNpZXMudHJ1bmtSO1xuICAvLyBWNSBwZXJtaXRzIFx1MDBCMTAuNjAgbSwgYnV0IEs0ICh0cnVuayB0b3AgaW5zaWRlIHRoZSBjYW5vcHkpIGlzIGEgaGFyZCBjbGFtcDtcbiAgLy8gYSBzbWFsbGVyIFx1MDBCMTAuMzAgbSBqaXR0ZXIga2VlcHMgZXZlcnkgdmFyaWFudCB2YWxpZC5cbiAgY29uc3QgdHJ1bmtIID0gaml0dGVyZWQgPyBxdWFudChjbGFtcChzcGVjaWVzLnRydW5rSCArIChybmQoKSAqIDAuNjAgLSAwLjMwKSwgMy4wLCA1LjQpKSA6IHNwZWNpZXMudHJ1bmtIO1xuICBjb25zdCBmbGFyZVIgPSB0cnVua1IgKyAwLjEwO1xuICBjb25zdCBwYXJ0czogVEhSRUUuQnVmZmVyR2VvbWV0cnlbXSA9IFtcbiAgICBjb2x1bW4oMCwgMCwgMCwgdHJ1bmtILCB0cnVua1IsIDYsIDAsIFRSVU5LKSxcbiAgICBjb2x1bW4oMCwgMCwgMCwgc3BlY2llcy5mbGFyZUgsIGZsYXJlUiwgNiwgMCwgQkFSSyksXG4gIF07XG4gIGZvciAoY29uc3QgbSBvZiBzcGVjaWVzLm1hc3Nlcykge1xuICAgIHBhcnRzLnB1c2gobWFzc0dlb21ldHJ5KGppdHRlcmVkID8gaml0dGVyTWFzcyhtLCBybmQsIGdyb3VwWCwgZ3JvdXBaKSA6IG0pKTtcbiAgfVxuICBpZiAoc3BlY2llcy5zYXRlbGxpdGUgJiYgdmFyaWFudCAlIDMgPT09IDApIHtcbiAgICBjb25zdCBzID0gc3BlY2llcy5zYXRlbGxpdGU7XG4gICAgcGFydHMucHVzaChib3gocy5jeCArIGdyb3VwWCwgcy5jeSwgcy5jeiArIGdyb3VwWiwgcy5zeCwgcy5zeSwgcy5zeiwgcy5oZXgpKTtcbiAgfVxuICByZXR1cm4gYXNzZW1ibHkocGFydHMpO1xufVxuXG5mdW5jdGlvbiBzaHJ1Ykdlb21ldHJ5KHZhcmlhbnQ6IG51bWJlcik6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3Qgcm5kID0gbXVsYmVycnkzMig5NyAqIDc5MTkgKyB2YXJpYW50ICogMTA0NzI5KTtcbiAgY29uc3QgcGFydHMgPSBTSFJVQi5tYXAoKG0sIGkpID0+IHtcbiAgICBpZiAodmFyaWFudCA9PT0gMCAmJiBpID09PSAwKSByZXR1cm4gbWFzc0dlb21ldHJ5KG0pO1xuICAgIHJldHVybiBtYXNzR2VvbWV0cnkoaml0dGVyTWFzcyhtLCBybmQsIDAsIDApKTtcbiAgfSk7XG4gIHJldHVybiBhc3NlbWJseShwYXJ0cyk7XG59XG5cbi8vIC0tLS0tLS0tLS0gcmV0YWluZWQgb3JlIC8gY2Fpcm4gYXNzZXRzIChibG9jayBsYW5ndWFnZSkgLS0tLS0tLS0tLVxuZnVuY3Rpb24gb3JlR2VvbWV0cnkodmFyaWFudDogbnVtYmVyKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xuICBjb25zdCBmbGlwID0gdmFyaWFudCA9PT0gMSA/IC0xIDogMTtcbiAgY29uc3QgcGFydHMgPSBbXG4gICAgYm94KDAsIDAuNDUsIDAsIDEuODAsIDAuOTAsIDEuNTAsIFNUT05FKSxcbiAgICBib3goMC4xNSwgMS4xMCwgLTAuMTAsIDEuMjAsIDAuNzAsIDEuMDAsIFNUT05FKSxcbiAgICBib3goLTAuNDAsIDEuNDAsIDAuMjUsIDAuNzAsIDAuNTAsIDAuNjAsIFNUT05FX0IpLFxuICAgIGJveCgwLjEwLCAwLjQ1LCAwLjc1ICogZmxpcCwgMC45MCwgMC4zNSwgMC4yMCwgT1JFKSxcbiAgICBib3goMC4xMCwgMC40NSwgMC44NjUgKiBmbGlwLCAwLjUwLCAwLjE0LCAwLjA3LCBPUkVfQiksXG4gIF07XG4gIHJldHVybiBhc3NlbWJseShwYXJ0cyk7XG59XG5cbmZ1bmN0aW9uIGNhaXJuR2VvbWV0cnkoKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xuICByZXR1cm4gYXNzZW1ibHkoW1xuICAgIGJveCgwLCAwLjI1LCAwLCAxLjUwLCAwLjUwLCAxLjMwLCBTVE9ORSksXG4gICAgYm94KDAuMTAsIDAuNzI1LCAwLCAxLjE1LCAwLjQ1LCAxLjAwLCBTVE9ORV9CKSxcbiAgICBib3goLTAuMTAsIDEuMTUsIDAuMDUsIDAuODUsIDAuNDAsIDAuNzUsIFNUT05FKSxcbiAgICBib3goMC4xMCwgMS41MjUsIDAuMDUsIDAuNTAsIDAuMzUsIDAuNTAsIFNUT05FX0IpLFxuICAgIGJveCgwLjEwLCAxLjg1LCAwLjA1LCAwLjMwLCAwLjMwLCAwLjMwLCBTVE9ORV9TSEFERSksXG4gIF0pO1xufVxuXG4vLyAtLS0tLS0tLS0tIGFzc2V0IGxvb2t1cCAtLS0tLS0tLS0tXG5mdW5jdGlvbiBnZW9tZXRyeUZvcihraW5kOiBFbnRpdHlLaW5kLCB2YXJpYW50OiBudW1iZXIpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB8IG51bGwge1xuICBpZiAoa2luZCA9PT0gJ3N0eWxfdHJlZV9zcGlyZScpIHJldHVybiB0cmVlR2VvbWV0cnkoVDEsIE1hdGguYWJzKHZhcmlhbnQpICUgNCk7XG4gIGlmIChraW5kID09PSAnc3R5bF90cmVlX3RhYmxlJykgcmV0dXJuIHRyZWVHZW9tZXRyeShUMiwgTWF0aC5hYnModmFyaWFudCkgJSA0KTtcbiAgaWYgKGtpbmQgPT09ICdzdHlsX3RyZWVfY2x1c3RlcicpIHJldHVybiB0cmVlR2VvbWV0cnkoVDMsIE1hdGguYWJzKHZhcmlhbnQpICUgMyk7XG4gIGlmIChraW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSByZXR1cm4gdHJlZUdlb21ldHJ5KFQ0LCBNYXRoLmFicyh2YXJpYW50KSAlIDIpO1xuICBpZiAoa2luZCA9PT0gJ3N0eWxfc2hydWInKSByZXR1cm4gc2hydWJHZW9tZXRyeShNYXRoLmFicyh2YXJpYW50KSAlIDMpO1xuICBpZiAoa2luZCA9PT0gJ3N0eWxfb3JlJykgcmV0dXJuIG9yZUdlb21ldHJ5KE1hdGguYWJzKHZhcmlhbnQpICUgMik7XG4gIGlmIChraW5kID09PSAnc3R5bF9jYWlybicpIHJldHVybiBjYWlybkdlb21ldHJ5KCk7XG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5hdHVyZUJ1aWxkUmVzdWx0IHtcbiAgZ3JvdXA6IFRIUkVFLkdyb3VwO1xuICB0cmlhbmdsZXM6IG51bWJlcjtcbiAgaW5zdGFuY2VzOiBudW1iZXI7XG59XG5cbmNvbnN0IG5hdHVyZU1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoeyB2ZXJ0ZXhDb2xvcnM6IHRydWUsIGZsYXRTaGFkaW5nOiB0cnVlIH0pO1xuXG4vKipcbiAqIEJ1aWxkIG9uZSBJbnN0YW5jZWRNZXNoIHBlciBraW5kK3ZhcmlhbnQgZm9yIHRoZSBzdXBwbGllZCBsb2FkZWQgY2h1bmtzLlxuICogRW50aXRpZXMgcmVtYWluIHRoZSBzb3VyY2Ugb2YgdHJ1dGg7IGhhcnZlc3RlZCBlbnRpdGllcyBhcmUgc2tpcHBlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTm94ZWxOYXR1cmUoXG4gIHdvcmxkOiBXb3JsZCxcbiAgbG9hZGVkQ2h1bmtzOiBSZWFkb25seVNldDxzdHJpbmc+IHwgbnVsbCA9IG51bGwsXG4pOiBOYXR1cmVCdWlsZFJlc3VsdCB7XG4gIGNvbnN0IGdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIGdyb3VwLm5hbWUgPSAnc3R5bF9uYXR1cmUnO1xuICBjb25zdCBidWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIEVudGl0eVtdPigpO1xuXG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChlLmhhcnZlc3RlZCkgY29udGludWU7XG4gICAgaWYgKGxvYWRlZENodW5rcyAmJiAhbG9hZGVkQ2h1bmtzLmhhcyhlLmNodW5rKSkgY29udGludWU7XG4gICAgaWYgKCFnZW9tZXRyeUZvcihlLmtpbmQsIGUudmFyaWFudCkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGtleSA9IGAke2Uua2luZH06JHtlLnZhcmlhbnR9YDtcbiAgICBsZXQgbGlzdCA9IGJ1Y2tldHMuZ2V0KGtleSk7XG4gICAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgYnVja2V0cy5zZXQoa2V5LCBsaXN0KTsgfVxuICAgIGxpc3QucHVzaChlKTtcbiAgfVxuXG4gIGxldCB0cmlhbmdsZXMgPSAwO1xuICBsZXQgaW5zdGFuY2VDb3VudCA9IDA7XG4gIGNvbnN0IGdlb21ldHJpZXMgPSBuZXcgTWFwPHN0cmluZywgVEhSRUUuQnVmZmVyR2VvbWV0cnk+KCk7XG4gIGZvciAoY29uc3QgW2tleSwgbGlzdF0gb2YgYnVja2V0cykge1xuICAgIGNvbnN0IFtraW5kLCB2YXJpYW50U3RyXSA9IGtleS5zcGxpdCgnOicpO1xuICAgIGNvbnN0IGdlbyA9IGdlb21ldHJ5Rm9yKGtpbmQgYXMgRW50aXR5S2luZCwgTnVtYmVyKHZhcmlhbnRTdHIpKTtcbiAgICBpZiAoIWdlbykgY29udGludWU7XG4gICAgZ2VvbWV0cmllcy5zZXQoa2V5LCBnZW8uaW5kZXggPyBnZW8udG9Ob25JbmRleGVkKCkgOiBnZW8pO1xuICAgIHRyaWFuZ2xlcyArPSAoZ2VvLmF0dHJpYnV0ZXMucG9zaXRpb24uY291bnQgLyAzKSAqIGxpc3QubGVuZ3RoO1xuICAgIGluc3RhbmNlQ291bnQgKz0gbGlzdC5sZW5ndGg7XG4gIH1cblxuICBpZiAoaW5zdGFuY2VDb3VudCA9PT0gMCkgcmV0dXJuIHsgZ3JvdXAsIHRyaWFuZ2xlczogMCwgaW5zdGFuY2VzOiAwIH07XG5cbiAgLy8gT25lIEJhdGNoZWRNZXNoIGZvciBldmVyeSBuYXR1cmFsIGFzc2V0LiBUaGUgb2xkIGNvZGUgdXNlZCBvbmVcbiAgLy8gSW5zdGFuY2VkTWVzaCBwZXIga2luZCt2YXJpYW50ICh+MzEgZHJhdyBjYWxscyk7IHRoaXMga2VlcHMgdGhlIHNhbWVcbiAgLy8gYXV0aG9yZWQgdmFyaWFudHMgYW5kIHBlci1pbnN0YW5jZSB0cmFuc2Zvcm1zIGluIGEgc2luZ2xlIGRyYXcgY2FsbC5cbiAgbGV0IHZlcnRleENvdW50ID0gMDtcbiAgZm9yIChjb25zdCBnZW8gb2YgZ2VvbWV0cmllcy52YWx1ZXMoKSkgdmVydGV4Q291bnQgKz0gZ2VvLmF0dHJpYnV0ZXMucG9zaXRpb24uY291bnQ7XG4gIGNvbnN0IGJhdGNoZWQgPSBuZXcgVEhSRUUuQmF0Y2hlZE1lc2goXG4gICAgaW5zdGFuY2VDb3VudCxcbiAgICBNYXRoLmNlaWwodmVydGV4Q291bnQgKiAxLjA4KSArIDE2LFxuICAgIDAsXG4gICAgbmF0dXJlTWF0ZXJpYWwsXG4gICk7XG4gIGJhdGNoZWQubmFtZSA9ICdzdHlsX25hdHVyZV9iYXRjaCc7XG4gIGJhdGNoZWQuY2FzdFNoYWRvdyA9IHRydWU7XG4gIGJhdGNoZWQucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gIGJhdGNoZWQucGVyT2JqZWN0RnJ1c3R1bUN1bGxlZCA9IHRydWU7XG4gIC8vIEJhdGNoZWRNZXNoIHJheWNhc3RzIGV4cG9zZSBiYXRjaElkLCBub3QgYSBNZXNoIHBlciBlbnRpdHkuIEtlZXAgdGhlXG4gIC8vIGF1dGhvcml0YXRpdmUgSUQgYW5kIGEgdXNlZnVsIHN1cmZhY2UgYW5jaG9yIGJlc2lkZSBldmVyeSBHUFUgaW5zdGFuY2UuXG4gIGJhdGNoZWQudXNlckRhdGEuaW5zcGVjdGFibGVCYXRjaElkcyA9IFtdIGFzIHN0cmluZ1tdO1xuICBiYXRjaGVkLnVzZXJEYXRhLmluc3BlY3RhYmxlVGFyZ2V0cyA9IFtdIGFzIEFycmF5PHtcbiAgICBlbnRpdHlJZDogc3RyaW5nOyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyO1xuICB9PjtcblxuICBjb25zdCBnZW9tZXRyeUlkcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIGZvciAoY29uc3QgW2tleSwgZ2VvXSBvZiBnZW9tZXRyaWVzKSB7XG4gICAgZ2VvbWV0cnlJZHMuc2V0KGtleSwgYmF0Y2hlZC5hZGRHZW9tZXRyeShnZW8pKTtcbiAgfVxuXG4gIGNvbnN0IG0gPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCBxID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKTtcbiAgY29uc3QgdiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIGNvbnN0IHMgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICBjb25zdCB1cCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApO1xuICBsZXQgaW5zdGFuY2VzID0gMDtcbiAgZm9yIChjb25zdCBba2V5LCBsaXN0XSBvZiBidWNrZXRzKSB7XG4gICAgY29uc3QgZ2VvbWV0cnlJZCA9IGdlb21ldHJ5SWRzLmdldChrZXkpO1xuICAgIGlmIChnZW9tZXRyeUlkID09PSB1bmRlZmluZWQpIGNvbnRpbnVlO1xuICAgIGZvciAoY29uc3QgZSBvZiBsaXN0KSB7XG4gICAgICBjb25zdCBpZCA9IGJhdGNoZWQuYWRkSW5zdGFuY2UoZ2VvbWV0cnlJZCk7XG4gICAgICBxLnNldEZyb21BeGlzQW5nbGUodXAsIGUucm90KTtcbiAgICAgIHYuc2V0KGUueCwgZS55IC0gMC4xNSwgZS56KTtcbiAgICAgIHMuc2V0U2NhbGFyKGUuc2NhbGUpO1xuICAgICAgYmF0Y2hlZC5zZXRNYXRyaXhBdChpZCwgbS5jb21wb3NlKHYsIHEsIHMpKTtcbiAgICAgIGJhdGNoZWQudXNlckRhdGEuaW5zcGVjdGFibGVCYXRjaElkc1tpZF0gPSBlLmlkO1xuICAgICAgY29uc3QgdGFyZ2V0SGVpZ2h0ID0gZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZV8nKSA/IDMuMCAqIGUuc2NhbGVcbiAgICAgICAgOiBlLmtpbmQgPT09ICdzdHlsX3NocnViJyA/IDAuNyAqIGUuc2NhbGVcbiAgICAgICAgOiBlLmtpbmQgPT09ICdzdHlsX29yZScgPyAwLjY1ICogZS5zY2FsZVxuICAgICAgICA6IGUuc2NhbGU7XG4gICAgICBiYXRjaGVkLnVzZXJEYXRhLmluc3BlY3RhYmxlVGFyZ2V0c1tpZF0gPSB7XG4gICAgICAgIGVudGl0eUlkOiBlLmlkLCB4OiBlLngsIHk6IGUueSArIHRhcmdldEhlaWdodCwgejogZS56LFxuICAgICAgfTtcbiAgICAgIGluc3RhbmNlcysrO1xuICAgIH1cbiAgfVxuICBiYXRjaGVkLmNvbXB1dGVCb3VuZGluZ0JveCgpO1xuICBiYXRjaGVkLmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuICBncm91cC5hZGQoYmF0Y2hlZCk7XG5cbiAgcmV0dXJuIHsgZ3JvdXAsIHRyaWFuZ2xlcywgaW5zdGFuY2VzIH07XG59XG4iLCAie1xuICBcInNjaGVtYVwiOiBcInBhbGV0dGVfdjJcIixcbiAgXCJkYXRlXCI6IFwiMjAyNi0xMC0yMlwiLFxuICBcInN0YXR1c1wiOiBcInByb3Bvc2VkXCIsXG4gIFwic291cmNlXCI6IFwiUkVGLTAwMiAoaHlicmlkIHdvcmxkIHJlZmVyZW5jZSksIHZhbHVlcyBzYW1wbGVkIGJ5IGV5ZTsgbnVtZXJpYyB2ZXJpZmljYXRpb24gcGVuZGluZ1wiLFxuICBcIm5vdGVcIjogXCJPbmUgbWF0ZXJpYWwgcGFsZXR0ZS4gVGltZSBvZiBkYXkgaXMgZXhwcmVzc2VkIGJ5IHRoZSBsaWdodGluZyBwcmVzZXRzIGJlbG93LCBub3QgYnkgcmVwYWludGluZyBtYXRlcmlhbHMuXCIsXG4gIFwibWF0ZXJpYWxzXCI6IHtcbiAgICBcImdyYXNzX3RvcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM3OUI5NENcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBsb3cgZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfaGlnaFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM4RkM5NUVcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBtaWQgZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfcGVha1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM5QUQwNkFcIixcbiAgICAgIFwicm9sZVwiOiBcInRlcnJhaW4gdG9wLCBoaWdoIGVsZXZhdGlvblwiXG4gICAgfSxcbiAgICBcImdyYXNzX2NhcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1RTk0NDBcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjAtMC40IG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RyYXRhX29jaHJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0M5OUE1RlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuNC0wLjYyIG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RyYXRhX3J1c3RcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjQ2MzNDXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC42Mi0wLjgwIG0gYmVsb3cgdG9wXCJcbiAgICB9LFxuICAgIFwic3RvbmVfdG9wXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2REZDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiYmFyZSBzdG9uZSB0b3Agc3VyZmFjZVwiXG4gICAgfSxcbiAgICBcInN0b25lX2JvZHlfYVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNEQ0QzQkVcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYm9keSwgZXZlbiA0LjUgbSBiYW5kXCJcbiAgICB9LFxuICAgIFwic3RvbmVfYm9keV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QxQzdBRlwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBib2R5LCBvZGQgNC41IG0gYmFuZFwiXG4gICAgfSxcbiAgICBcInN0b25lX3NoYWRlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0I5QUU5NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiY3JldmljZSAvIHJlY2Vzc2VkIHN0b25lIGFjY2VudFwiXG4gICAgfSxcbiAgICBcInNhbmRcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTNEM0E2XCIsXG4gICAgICBcInJvbGVcIjogXCJzaG9yZSBjZWxsc1wiXG4gICAgfSxcbiAgICBcIndhdGVyX3NoYWxsb3dcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNjdDRkQ4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA8PSAwLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX21pZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzQUFGQzRcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoIH4xLjUgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX2RlZXBcIjoge1xuICAgICAgXCJoZXhcIjogXCIjMkE4RkE4XCIsXG4gICAgICBcInJvbGVcIjogXCJ3YXRlciBkZXB0aCA+PSA0LjAgbVwiXG4gICAgfSxcbiAgICBcIndhdGVyX3JpbVwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCRkVBRjBcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlbGluZSByaW0gLyBmb2FtIHRpbnRcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fYVwiOiB7XG4gICAgICBcImhleFwiOiBcIiM1RkE4M0ZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZGQjg0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBtYWluIG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfZ3JlZW5fY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM3RkMzNTZcIixcbiAgICAgIFwicm9sZVwiOiBcImdyZWVuIGNhbm9weSwgaGlnaGxpZ2h0IG1hc3NcIlxuICAgIH0sXG4gICAgXCJjYW5vcHlfcGlua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNGMkE2QzRcIixcbiAgICAgIFwicm9sZVwiOiBcImJsb3Nzb20gYWNjZW50IHNwZWNpZXMgb25seVwiXG4gICAgfSxcbiAgICBcImNhbm9weV9waW5rX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTg4RkIyXCIsXG4gICAgICBcInJvbGVcIjogXCJibG9zc29tIHNoYWRlIG1hc3NcIlxuICAgIH0sXG4gICAgXCJ0cnVua1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM2QjRBMzNcIixcbiAgICAgIFwicm9sZVwiOiBcInRyZWUgdHJ1bmtzXCJcbiAgICB9LFxuICAgIFwiYmFya19kYXJrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzRFMzYyNlwiLFxuICAgICAgXCJyb2xlXCI6IFwidHJ1bmsgc2hhZGUsIHN0dW1wc1wiXG4gICAgfSxcbiAgICBcIm9yZV9jcnlzdGFsXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzdCNUFENlwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGRlcG9zaXQgYWNjZW50IChwcm9wb3NlZCwgcmVwbGFjZXMgdGVhbClcIlxuICAgIH0sXG4gICAgXCJvcmVfY3J5c3RhbF9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlCN0JFOFwiLFxuICAgICAgXCJyb2xlXCI6IFwib3JlIGhpZ2hsaWdodCBmYWNldFwiXG4gICAgfSxcbiAgICBcIm5veGVsX3N0b25lXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0U2REZDQ1wiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgYXJjaGl0ZWN0dXJlIG1haW4gc3RvbmVcIlxuICAgIH0sXG4gICAgXCJub3hlbF9zdG9uZV9iXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0QzQzlCNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiTm94ZWwgc2Vjb25kYXJ5IHN0b25lIC8gcmVjZXNzXCJcbiAgICB9LFxuICAgIFwiYWNjZW50X2JsdWVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjM0U3RkI4XCIsXG4gICAgICBcInJvbGVcIjogXCJiYW5uZXIgLyBjbG90aCBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJhY2NlbnRfdGVhbFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyRkE2QTBcIixcbiAgICAgIFwicm9sZVwiOiBcInNlY29uZGFyeSBhY2NlbnRcIlxuICAgIH0sXG4gICAgXCJlbWlzc2l2ZV9maXJlXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0ZGOUU0QVwiLFxuICAgICAgXCJyb2xlXCI6IFwiY2FtcGZpcmUgLyB3YXJtIGVtaXNzaXZlIChlZmZlY3RzIG9ubHkpXCJcbiAgICB9LFxuICAgIFwiZW1pc3NpdmVfbWFnaWNcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDI0QkZGXCIsXG4gICAgICBcInJvbGVcIjogXCJyZXNlcnZlZDogbWFnaWMgZWZmZWN0cyBvbmx5LCBuZXZlciBtYXRlcmlhbHNcIlxuICAgIH1cbiAgfSxcbiAgXCJsaWdodGluZ1wiOiB7XG4gICAgXCJkYXduXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDEyLFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDEwNSxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZDNzlBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAyLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEZBNkM4XCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNEU1RjZFXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMC42LFxuICAgICAgXCJza3lcIjogXCIjQThCRUQ2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNBOEJFRDZcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNSxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4xXG4gICAgfSxcbiAgICBcIm5vb25cIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogMzgsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogNTAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0ZGRjREQ1wiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMi43NSxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiNCRkQ5RjJcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM3QThGNTVcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAwLjU1LFxuICAgICAgXCJza3lcIjogXCIjOUVEMkVFXCIsXG4gICAgICBcImZvZ1wiOiBcIiNEQ0VGRjhcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMjgsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMDVcbiAgICB9LFxuICAgIFwiZHVza1wiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiA5LFxuICAgICAgXCJzdW5BemltdXRoRGVnXCI6IDI1MCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZCMjdBXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAzLjIsXG4gICAgICBcImhlbWlTa3lcIjogXCIjOEU3QzlFXCIsXG4gICAgICBcImhlbWlHcm91bmRcIjogXCIjNUE0QTUwXCIsXG4gICAgICBcImhlbWlJbnRlbnNpdHlcIjogMS4xLFxuICAgICAgXCJza3lcIjogXCIjQzk4RTg2XCIsXG4gICAgICBcImZvZ1wiOiBcIiNDMDkwOEFcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwMzYsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuMzJcbiAgICB9LFxuICAgIFwibmlnaHRcIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogNDAsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMjIwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNBRkM4RkZcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDEuMCxcbiAgICAgIFwiaGVtaVNreVwiOiBcIiMzQTRDN0FcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiMxQzI1NDBcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAxLjA1LFxuICAgICAgXCJza3lcIjogXCIjMTAxNzM2XCIsXG4gICAgICBcImZvZ1wiOiBcIiMxNTFDM0NcIixcbiAgICAgIFwiZm9nRGVuc2l0eVwiOiAwLjAwNDUsXG4gICAgICBcImV4cG9zdXJlXCI6IDEuNVxuICAgIH1cbiAgfVxufSIsICIvLyBOb3hlbCByZW5kZXJlciBcdTIwMTQgW1BST1ZJU0lPTkFMXS5cbi8vXG4vLyBUaGUgb3duZXIncyBOb3hlbCByZWZlcmVuY2UgaW1hZ2VzIGhhdmUgbmV2ZXIgYmVlbiBzdXBwbGllZCAodGhlIGZvbGRlciBpc1xuLy8gc3RpbGwgZW1wdHkpLiBUaGUgTm94ZWwgU3R5bGUgR3VpZGUgdjEuMCBpdHNlbGYgcmVjb3JkcyB0aGF0IHByb3ZlbmFuY2UgZ2FwLlxuLy8gVGhlc2Ugdm9sdW1lcyB0aGVyZWZvcmUgaW1wbGVtZW50IHRoZSAqd3JpdHRlbiogZ3JhbW1hciAocmVjdGFuZ3VsYXIgcHJpc21zLFxuLy8gYXhpcy1hbGlnbmVkLCA5MFx1MDBCMCB3aG9sZS1hc3NldCByb3RhdGlvbiwgZmxhdCBjb2xvdXIsIDQtOSB2b2x1bWVzKSBhbmQgYXJlXG4vLyBsYWJlbGxlZCBwcm92aXNpb25hbCB1bnRpbCBNaW1vIGNhbiByZWJ1aWxkIHRoZW0gZnJvbSB0aGUgb3duZXIncyBpbWFnZXMuXG4vL1xuLy8gRXZlcnkgYXNzZXQgb3JpZ2luIGlzIHRoZSBjZW50cmUgb2YgaXRzIGZvb3RwcmludCBvbiBpdHMgdW5kZXJzaWRlLCArWCBpc1xuLy8gbGVuZ3RoLCArWiB0aGlja25lc3MsICtZIHVwIFx1MjAxNCB0aGUgY29udmVudGlvbiBpbiBOb3hlbCBTdHlsZSBHdWlkZSBcdTAwQTcyLjUuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgeyBtZXJnZUdlb21ldHJpZXMgfSBmcm9tICd0aHJlZS9leGFtcGxlcy9qc20vdXRpbHMvQnVmZmVyR2VvbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQgeyBOb3hlbFNpdGUgfSBmcm9tICcuLi9zaW0vd29ybGQnO1xuXG5jb25zdCBNID0gcGFsZXR0ZS5tYXRlcmlhbHMgYXMgUmVjb3JkPHN0cmluZywgeyBoZXg6IHN0cmluZyB9PjtcbmNvbnN0IEggPSAoazogc3RyaW5nKSA9PiBNW2tdLmhleDtcblxuY29uc3QgU1RPTkUgPSBIKCdub3hlbF9zdG9uZScpO1xuY29uc3QgU1RPTkVfQiA9IEgoJ25veGVsX3N0b25lX2InKTtcbmNvbnN0IE9DSFJFID0gSCgnc3RyYXRhX29jaHJlJyk7XG5jb25zdCBUSU1CRVIgPSBIKCdiYXJrX2RhcmsnKTtcbmNvbnN0IEJMVUUgPSBIKCdhY2NlbnRfYmx1ZScpO1xuXG5pbnRlcmZhY2UgQm94IHtcbiAgdzogbnVtYmVyOyBoOiBudW1iZXI7IGQ6IG51bWJlcjtcbiAgeD86IG51bWJlcjsgeT86IG51bWJlcjsgej86IG51bWJlcjtcbiAgY29sb3VyOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGJveChiOiBCb3gpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGcgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoYi53LCBiLmgsIGIuZCk7XG4gIGcudHJhbnNsYXRlKGIueCA/PyAwLCAoYi55ID8/IDApICsgYi5oIC8gMiwgYi56ID8/IDApO1xuICBjb25zdCBuZyA9IGcuaW5kZXggPyBnLnRvTm9uSW5kZXhlZCgpIDogZztcbiAgbmcuZGVsZXRlQXR0cmlidXRlKCd1dicpO1xuICBjb25zdCBjID0gbmV3IFRIUkVFLkNvbG9yKGIuY29sb3VyKTtcbiAgY29uc3QgbiA9IG5nLmF0dHJpYnV0ZXMucG9zaXRpb24uY291bnQ7XG4gIGNvbnN0IGFyciA9IG5ldyBGbG9hdDMyQXJyYXkobiAqIDMpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykgeyBhcnJbaSAqIDNdID0gYy5yOyBhcnJbaSAqIDMgKyAxXSA9IGMuZzsgYXJyW2kgKiAzICsgMl0gPSBjLmI7IH1cbiAgbmcuc2V0QXR0cmlidXRlKCdjb2xvcicsIG5ldyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUoYXJyLCAzKSk7XG4gIHJldHVybiBuZztcbn1cblxuY29uc3QgTUFUID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoeyB2ZXJ0ZXhDb2xvcnM6IHRydWUsIGZsYXRTaGFkaW5nOiB0cnVlIH0pO1xuXG5mdW5jdGlvbiBhc3NlbWJseShib3hlczogQm94W10sIG5hbWU6IHN0cmluZywgbWF0OiBUSFJFRS5NYXRlcmlhbCA9IE1BVCk6IFRIUkVFLk1lc2gge1xuICBjb25zdCBnID0gbWVyZ2VHZW9tZXRyaWVzKGJveGVzLm1hcChib3gpLCBmYWxzZSkhO1xuICBnLmNvbXB1dGVWZXJ0ZXhOb3JtYWxzKCk7XG4gIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnLCBtYXQpO1xuICBtZXNoLm5hbWUgPSBuYW1lO1xuICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xuICAvLyBOb3hlbCBtYXNzZXMgYXJlIHNpbXBsZSBwcmlzbXM7IHNlbGYtc2hhZG93aW5nIG9ubHkgcHJvZHVjZWQgYWNuZSBvbiB0aGVcbiAgLy8gbGFyZ2UgZmxhdCBmYWNlcywgc28ga2VlcCB0aGUgY2FzdCBzaGFkb3cgYnV0IG5vdCB0aGUgcmVjZWl2ZS5cbiAgbWVzaC5yZWNlaXZlU2hhZG93ID0gZmFsc2U7XG4gIHJldHVybiBtZXNoO1xufVxuXG4vKiogU2hhcmVkIGtpdCBwaWVjZSB2b2NhYnVsYXJ5IChkaW1lbnNpb25zIGZyb20gTm94ZWwgU3R5bGUgR3VpZGUgXHUwMEE3MykuICovXG5leHBvcnQgZnVuY3Rpb24gbm94ZWxXYWxsKCk6IFRIUkVFLk1lc2gge1xuICByZXR1cm4gYXNzZW1ibHkoW1xuICAgIHsgdzogNC4wLCBoOiAwLjQsIGQ6IDEuMiwgeTogMCwgY29sb3VyOiBTVE9ORV9CIH0sICAgICAgICAgIC8vIGZvdW5kYXRpb24gc2xhYlxuICAgIHsgdzogMy44LCBoOiAwLjIsIGQ6IDEuMCwgeTogMC40LCBjb2xvdXI6IE9DSFJFIH0sICAgICAgICAgICAvLyB0aHJlc2hvbGQgYWNjZW50XG4gICAgeyB3OiA0LjAsIGg6IDMuMiwgZDogMC42LCB5OiAwLjQsIGNvbG91cjogU1RPTkUgfSwgICAgICAgICAgIC8vIG1hc3NcbiAgICB7IHc6IDQuMCwgaDogMC4zLCBkOiAwLjYsIHg6IDAsIHk6IDMuNiwgY29sb3VyOiBTVE9ORV9CIH0sICAgLy8gcGFyYXBldCBzbGFiXG4gICAgeyB3OiAwLjMsIGg6IDAuMywgZDogMC43LCB4OiAtMS40LCB5OiAzLjksIGNvbG91cjogU1RPTkUgfSwgIC8vIGNhcCBibG9ja3NcbiAgICB7IHc6IDAuMywgaDogMC4zLCBkOiAwLjcsIHg6IDAuMCwgeTogMy45LCBjb2xvdXI6IFNUT05FIH0sXG4gICAgeyB3OiAwLjMsIGg6IDAuMywgZDogMC43LCB4OiAxLjQsIHk6IDMuOSwgY29sb3VyOiBTVE9ORSB9LFxuICBdLCAnbm94ZWxfd2FsbCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm94ZWxQb3N0KCk6IFRIUkVFLk1lc2gge1xuICByZXR1cm4gYXNzZW1ibHkoW1xuICAgIHsgdzogMS44LCBoOiAwLjQsIGQ6IDEuOCwgeTogMCwgY29sb3VyOiBTVE9ORV9CIH0sICAgICAgICAgICAvLyBzbGFiIGJhc2VcbiAgICB7IHc6IDEuMiwgaDogNC44LCBkOiAxLjIsIHk6IDAuNCwgY29sb3VyOiBTVE9ORSB9LCAgICAgICAgICAgIC8vIHBvc3RcbiAgICB7IHc6IDEuNiwgaDogMC4zLCBkOiAxLjYsIHk6IDUuMiwgY29sb3VyOiBTVE9ORV9CIH0sICAgICAgICAgIC8vIHBvc3QgY2FwXG4gIF0sICdub3hlbF9wb3N0Jyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3hlbEdhdGV3YXkoKTogVEhSRUUuTWVzaCB7XG4gIHJldHVybiBhc3NlbWJseShbXG4gICAgeyB3OiAxLjgsIGg6IDAuNCwgZDogMS44LCB4OiAtMi40LCB5OiAwLCBjb2xvdXI6IFNUT05FX0IgfSxcbiAgICB7IHc6IDEuOCwgaDogMC40LCBkOiAxLjgsIHg6IDIuNCwgeTogMCwgY29sb3VyOiBTVE9ORV9CIH0sXG4gICAgeyB3OiAxLjIsIGg6IDQuOCwgZDogMS4yLCB4OiAtMi40LCB5OiAwLjQsIGNvbG91cjogU1RPTkUgfSxcbiAgICB7IHc6IDEuMiwgaDogNC44LCBkOiAxLjIsIHg6IDIuNCwgeTogMC40LCBjb2xvdXI6IFNUT05FIH0sXG4gICAgeyB3OiA2LjAsIGg6IDAuOCwgZDogMS4yLCB5OiA1LjIsIGNvbG91cjogU1RPTkUgfSwgICAgICAgICAgICAvLyBsaW50ZWwgbWFzc1xuICAgIHsgdzogMS42LCBoOiAwLjMsIGQ6IDEuNiwgeDogLTIuNCwgeTogNi4wLCBjb2xvdXI6IFNUT05FX0IgfSwgLy8gY2FwIGJsb2Nrc1xuICAgIHsgdzogMS42LCBoOiAwLjMsIGQ6IDEuNiwgeDogMi40LCB5OiA2LjAsIGNvbG91cjogU1RPTkVfQiB9LFxuICBdLCAnbm94ZWxfZ2F0ZXdheScpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm94ZWxTdGFpcigpOiBUSFJFRS5NZXNoIHtcbiAgY29uc3QgYm94ZXM6IEJveFtdID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG4gICAgYm94ZXMucHVzaCh7IHc6IDIuMCwgaDogMC4zLCBkOiAwLjksIHo6IGkgKiAwLjksIHk6IGkgKiAwLjMsIGNvbG91cjogaSAlIDIgPyBTVE9ORV9CIDogU1RPTkUgfSk7XG4gIH1cbiAgYm94ZXMucHVzaCh7IHc6IDIuMCwgaDogMC4zLCBkOiAyLjAsIHo6IDMuNiwgeTogMS4yLCBjb2xvdXI6IFNUT05FIH0pO1xuICByZXR1cm4gYXNzZW1ibHkoYm94ZXMsICdub3hlbF9zdGFpcicpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm94ZWxCZW5jaCgpOiBUSFJFRS5NZXNoIHtcbiAgcmV0dXJuIGFzc2VtYmx5KFtcbiAgICB7IHc6IDIuMCwgaDogMC40LCBkOiAwLjYsIHk6IDAsIGNvbG91cjogU1RPTkVfQiB9LFxuICAgIHsgdzogMS44LCBoOiAwLjI1LCBkOiAwLjUsIHk6IDAuNCwgY29sb3VyOiBUSU1CRVIgfSxcbiAgICB7IHc6IDAuNCwgaDogMC40LCBkOiAwLjQsIHg6IC0wLjcsIHk6IDAuNjUsIGNvbG91cjogT0NIUkUgfSxcbiAgXSwgJ25veGVsX2JlbmNoJyk7XG59XG5cbmNvbnN0IEFDQ0VOVF9NQVQgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XG4gIHZlcnRleENvbG9yczogdHJ1ZSwgZmxhdFNoYWRpbmc6IHRydWUsXG4gIGVtaXNzaXZlOiBuZXcgVEhSRUUuQ29sb3IoSCgnYWNjZW50X3RlYWwnKSksIGVtaXNzaXZlSW50ZW5zaXR5OiAwLjU1LFxufSk7XG5cbi8qKlxuICogQSB0YWxsIGZvcmtlZCB3YXlzdG9uZS4gVGhlIGNyZWFtIHN0b25lIG1hc3MgaXMgdGhlIE5veGVsIGJvZHk7IHRoZSB0ZWFsXG4gKiBpbmxheSBpcyB0aGUgb25seSBlbWlzc2l2ZSBhY2NlbnQuIFRoZSBzcGxpdCBjcm93biBnaXZlcyBpdCBhIHNpbGhvdWV0dGVcbiAqIHRoYXQgaXMgbGVnaWJsZSBhdCA2MCBtIHdpdGhvdXQgdHVybmluZyBpdCBpbnRvIGEgc2V0dGxlbWVudCBidWlsZGluZy5cbiAqL1xuZnVuY3Rpb24gd2F5c3RvbmUoKTogVEhSRUUuT2JqZWN0M0Qge1xuICBjb25zdCBib2R5ID0gYXNzZW1ibHkoW1xuICAgIC8vIFZvbHVtZXMgb3ZlcmxhcCBieSAxLTIgY20gYXQgZXZlcnkgc2VhdC4gRXhhY3QgY29wbGFuYXIgY29udGFjdHNcbiAgICAvLyBwcm9kdWNlZCBhIG1vaXJcdTAwRTkvZGVwdGgtZmlnaHQgaGF0Y2ggb24gdGhlIGhvcml6b250YWwgc2hvdWxkZXJzLlxuICAgIHsgdzogMy4yLCBoOiAwLjUwLCBkOiAyLjYsIHk6IDAsIGNvbG91cjogU1RPTkVfQiB9LCAgICAgICAgICAgIC8vIHBsaW50aFxuICAgIHsgdzogMi40LCBoOiAwLjM1LCBkOiAyLjAsIHk6IDAuNDUsIGNvbG91cjogU1RPTkUgfSwgICAgICAgICAgIC8vIHN0ZXBcbiAgICB7IHc6IDEuNywgaDogMi45MCwgZDogMS4yNSwgeTogMC43NSwgY29sb3VyOiBTVE9ORSB9LCAgICAgICAgICAvLyBsb3dlciBzaGFmdFxuICAgIHsgdzogMi4xLCBoOiAwLjMzLCBkOiAxLjUsIHk6IDMuNjAsIGNvbG91cjogU1RPTkVfQiB9LCAgICAgICAgIC8vIHNob3VsZGVyXG4gICAgeyB3OiAxLjAsIGg6IDIuMzIsIGQ6IDAuODUsIHk6IDMuODgsIGNvbG91cjogU1RPTkUgfSwgICAgICAgICAgLy8gdXBwZXIgc2hhZnRcbiAgICB7IHc6IDEuMjUsIGg6IDAuMzUsIGQ6IDAuOTUsIHk6IDYuMTUsIGNvbG91cjogU1RPTkUgfSwgICAgICAgICAvLyBmb3JrIGJyaWRnZVxuICAgIHsgdzogMC4zNSwgaDogMS40MCwgZDogMC41NSwgeDogLTAuNDUsIHk6IDYuNDUsIGNvbG91cjogU1RPTkVfQiB9LCAvLyBsZWZ0IHByb25nXG4gICAgeyB3OiAwLjM1LCBoOiAxLjQwLCBkOiAwLjU1LCB4OiAwLjQ1LCB5OiA2LjQ1LCBjb2xvdXI6IFNUT05FX0IgfSwgIC8vIHJpZ2h0IHByb25nXG4gIF0sICdub3hlbF93YXlzdG9uZScpO1xuICBjb25zdCBnbG93ID0gYXNzZW1ibHkoW1xuICAgIHsgdzogMC4xOCwgaDogMS42NSwgZDogMC4wNTUsIHg6IC0wLjIzLCB6OiAtMC42NTUsIHk6IDEuMiwgY29sb3VyOiBIKCdhY2NlbnRfdGVhbCcpIH0sXG4gICAgeyB3OiAwLjE4LCBoOiAxLjY1LCBkOiAwLjA1NSwgeDogMC4yMywgejogLTAuNjU1LCB5OiAxLjIsIGNvbG91cjogSCgnYWNjZW50X3RlYWwnKSB9LFxuICAgIHsgdzogMC4xOCwgaDogMS42NSwgZDogMC4wNTUsIHg6IC0wLjIzLCB6OiAwLjY1NSwgeTogMS4yLCBjb2xvdXI6IEgoJ2FjY2VudF90ZWFsJykgfSxcbiAgICB7IHc6IDAuMTgsIGg6IDEuNjUsIGQ6IDAuMDU1LCB4OiAwLjIzLCB6OiAwLjY1NSwgeTogMS4yLCBjb2xvdXI6IEgoJ2FjY2VudF90ZWFsJykgfSxcbiAgICB7IHc6IDEuMTUsIGg6IDAuMTMsIGQ6IDEuMzUsIHk6IDMuNjYsIGNvbG91cjogSCgnYWNjZW50X2JsdWUnKSB9LFxuICAgIHsgdzogMC4wNSwgaDogMC41NSwgZDogMC41NSwgeDogMC41MywgeTogNC4zNSwgY29sb3VyOiBIKCdhY2NlbnRfdGVhbCcpIH0sXG4gICAgeyB3OiAwLjA1LCBoOiAwLjU1LCBkOiAwLjU1LCB4OiAtMC41MywgeTogNC4zNSwgY29sb3VyOiBIKCdhY2NlbnRfdGVhbCcpIH0sXG4gIF0sICdub3hlbF93YXlzdG9uZV9nbG93JywgQUNDRU5UX01BVCk7XG4gIGNvbnN0IGcgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgZy5hZGQoYm9keSwgZ2xvdyk7XG4gIGcubmFtZSA9ICdub3hlbF93YXlzdG9uZSc7XG4gIGJvZHkuY2FzdFNoYWRvdyA9IHRydWU7XG4gIHJldHVybiBnO1xufVxuXG5mdW5jdGlvbiBtYXJrZXIoKTogVEhSRUUuT2JqZWN0M0Qge1xuICBjb25zdCBib2R5ID0gYXNzZW1ibHkoW1xuICAgIHsgdzogMS44LCBoOiAwLjQsIGQ6IDEuOCwgeTogMCwgY29sb3VyOiBTVE9ORV9CIH0sXG4gICAgeyB3OiAxLjIsIGg6IDAuMjUsIGQ6IDEuMiwgeTogMC40LCBjb2xvdXI6IFNUT05FIH0sXG4gICAgeyB3OiAwLjcsIGg6IDIuNiwgZDogMC43LCB5OiAwLjY1LCBjb2xvdXI6IFNUT05FIH0sXG4gICAgeyB3OiAxLjE1LCBoOiAwLjIyLCBkOiAxLjE1LCB5OiAzLjI1LCBjb2xvdXI6IFNUT05FX0IgfSxcbiAgICB7IHc6IDAuMzUsIGg6IDAuNTUsIGQ6IDAuMzUsIHk6IDMuNDcsIGNvbG91cjogU1RPTkUgfSxcbiAgXSwgJ25veGVsX21hcmtlcicpO1xuICBjb25zdCBnbG93ID0gYXNzZW1ibHkoW1xuICAgIHsgdzogMC4yNCwgaDogMS4xNSwgZDogMC4wNCwgejogLTAuMzcsIHk6IDEuMCwgY29sb3VyOiBIKCdhY2NlbnRfdGVhbCcpIH0sXG4gICAgeyB3OiAwLjI0LCBoOiAxLjE1LCBkOiAwLjA0LCB6OiAwLjM3LCB5OiAxLjAsIGNvbG91cjogSCgnYWNjZW50X3RlYWwnKSB9LFxuICAgIHsgdzogMC41MiwgaDogMC4xMCwgZDogMC41MiwgeTogMy4zNiwgY29sb3VyOiBIKCdhY2NlbnRfYmx1ZScpIH0sXG4gIF0sICdub3hlbF9tYXJrZXJfZ2xvdycsIEFDQ0VOVF9NQVQpO1xuICBjb25zdCBnID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIGcuYWRkKGJvZHksIGdsb3cpO1xuICBnLm5hbWUgPSAnbm94ZWxfbWFya2VyJztcbiAgcmV0dXJuIGc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZE5veGVsU2l0ZShzaXRlOiBOb3hlbFNpdGUpOiBUSFJFRS5PYmplY3QzRCB7XG4gIGNvbnN0IG1lc2ggPSBzaXRlLmtpbmQgPT09ICd3YXlzdG9uZScgPyB3YXlzdG9uZSgpIDogbWFya2VyKCk7XG4gIG1lc2gucG9zaXRpb24uc2V0KHNpdGUueCwgc2l0ZS55IC0gMC4xMiwgc2l0ZS56KTtcbiAgbWVzaC5yb3RhdGlvbi55ID0gc2l0ZS5yb3Q7XG4gIG1lc2gudXNlckRhdGEuc2l0ZUlkID0gc2l0ZS5pZDtcbiAgbWVzaC51c2VyRGF0YS5pbnNwZWN0VGFyZ2V0ID0ge1xuICAgIHg6IDAsIHk6IHNpdGUua2luZCA9PT0gJ3dheXN0b25lJyA/IDMuMiA6IDEuOCwgejogMCxcbiAgfTtcbiAgcmV0dXJuIG1lc2g7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgS2l0SXRlbSB7IG5hbWU6IHN0cmluZzsgYnVpbGQ6ICgpID0+IFRIUkVFLk9iamVjdDNEOyB4OiBudW1iZXI7IHo6IG51bWJlciB9XG5cbi8qKiBTbWFsbCBpbnRlZ3JhdGlvbi10ZXN0IHNldDogdGVycmFpbiBzZWN0aW9uICsgZm91bmRlci10aWVyIG1vZHVsZXMuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRLaXQoKTogVEhSRUUuT2JqZWN0M0RbXSB7XG4gIGNvbnN0IGl0ZW1zOiBLaXRJdGVtW10gPSBbXG4gICAgeyBuYW1lOiAnUG9zdCcsIGJ1aWxkOiBub3hlbFBvc3QsIHg6IC05LCB6OiAwIH0sXG4gICAgeyBuYW1lOiAnV2FsbCBwYW5lbCcsIGJ1aWxkOiBub3hlbFdhbGwsIHg6IC00LjUsIHo6IDAgfSxcbiAgICB7IG5hbWU6ICdHYXRld2F5JywgYnVpbGQ6IG5veGVsR2F0ZXdheSwgeDogMi41LCB6OiAwIH0sXG4gICAgeyBuYW1lOiAnU3RhaXInLCBidWlsZDogbm94ZWxTdGFpciwgeDogNS44LCB6OiAwLjIgfSxcbiAgICB7IG5hbWU6ICdXYXlzdG9uZScsIGJ1aWxkOiB3YXlzdG9uZSwgeDogMTMuMiwgejogMi4yIH0sXG4gIF07XG4gIHJldHVybiBpdGVtcy5tYXAoKGl0KSA9PiB7XG4gICAgY29uc3QgbSA9IGl0LmJ1aWxkKCk7XG4gICAgbS5wb3NpdGlvbi54ID0gaXQueDtcbiAgICBtLnBvc2l0aW9uLnogPSBpdC56O1xuICAgIGlmIChpdC5uYW1lID09PSAnU3RhaXInKSBtLnJvdGF0aW9uLnkgPSBNYXRoLlBJIC8gMjtcbiAgICBtLnVzZXJEYXRhLmtpdElkID0gaXQubmFtZS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoJyBwYW5lbCcsICcnKTtcbiAgICBtLnVzZXJEYXRhLmluc3BlY3RUYXJnZXQgPSB7IHg6IDAsIHk6IGl0Lm5hbWUgPT09ICdXYXlzdG9uZScgPyAzLjIgOiAxLjIsIHo6IDAgfTtcbiAgICByZXR1cm4gbTtcbiAgfSk7XG59XG5cbmV4cG9ydCB7IEJMVUUgfTtcbiIsICIvLyBTY2hlbWEtMyBsaWZlLXN0YXRlIHByZXNlbnRhdGlvbi4gVGhlIHNpbXVsYXRpb24gb3ducyBzdG9ja3BpbGUgY29udGVudHMsXG4vLyBjcm9wIGV4aXN0ZW5jZSBhbmQgZ3Jvd3RoOyB0aGlzIG1vZHVsZSBvbmx5IGRlcml2ZXMgZGlzcG9zYWJsZSBUSFJFRSBtZXNoZXMuXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgeyBtZXJnZUdlb21ldHJpZXMgfSBmcm9tICd0aHJlZS9leGFtcGxlcy9qc20vdXRpbHMvQnVmZmVyR2VvbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQgeyBXb3JsZCwgc3VyZmFjZUF0IH0gZnJvbSAnLi4vc2ltL3dvcmxkJztcbmltcG9ydCB7IFN0cnVjdHVyZU1vZHVsZSB9IGZyb20gJy4uL3NpbS9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7IENyb3BQbG90LCBTdG9ja3BpbGUgfSBmcm9tICcuLi9zaW0vZWNvbm9teSc7XG5cbmNvbnN0IE0gPSBwYWxldHRlLm1hdGVyaWFscyBhcyBSZWNvcmQ8c3RyaW5nLCB7IGhleDogc3RyaW5nIH0+O1xuY29uc3QgSCA9IChrZXk6IHN0cmluZykgPT4gTVtrZXldLmhleDtcbmNvbnN0IFRJTUJFUiA9IEgoJ2JhcmtfZGFyaycpO1xuY29uc3QgV09PRCA9IEgoJ3RydW5rJyk7XG5jb25zdCBTVE9ORSA9IEgoJ25veGVsX3N0b25lX2InKTtcbmNvbnN0IFNPSUwgPSAnIzY4NEEzMic7XG5jb25zdCBTT0lMX0VER0UgPSBIKCdzdHJhdGFfb2NocmUnKTtcbmNvbnN0IEdSRUVOID0gSCgnY2Fub3B5X2dyZWVuX2EnKTtcbmNvbnN0IEdSRUVOX0xJR0hUID0gSCgnY2Fub3B5X2dyZWVuX2MnKTtcbmNvbnN0IEdPTEQgPSAnI0Q5QUQzRCc7XG5jb25zdCBHT0xEX0xJR0hUID0gJyNGMENGNjMnO1xuY29uc3QgRklCRVIgPSAnI0I4QTk2Qic7XG5cbmNvbnN0IExJRkVfTUFURVJJQUwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XG4gIHZlcnRleENvbG9yczogdHJ1ZSxcbiAgZmxhdFNoYWRpbmc6IHRydWUsXG59KTtcblxuZnVuY3Rpb24gcGFpbnQoZ2VvbWV0cnk6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5LCBoZXg6IHN0cmluZyk6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3QgZyA9IGdlb21ldHJ5LmluZGV4ID8gZ2VvbWV0cnkudG9Ob25JbmRleGVkKCkgOiBnZW9tZXRyeTtcbiAgZy5kZWxldGVBdHRyaWJ1dGUoJ3V2Jyk7XG4gIGNvbnN0IGNvbG91ciA9IG5ldyBUSFJFRS5Db2xvcihoZXgpO1xuICBjb25zdCB2YWx1ZXMgPSBuZXcgRmxvYXQzMkFycmF5KGcuYXR0cmlidXRlcy5wb3NpdGlvbi5jb3VudCAqIDMpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGcuYXR0cmlidXRlcy5wb3NpdGlvbi5jb3VudDsgaSsrKSB7XG4gICAgdmFsdWVzW2kgKiAzXSA9IGNvbG91ci5yO1xuICAgIHZhbHVlc1tpICogMyArIDFdID0gY29sb3VyLmc7XG4gICAgdmFsdWVzW2kgKiAzICsgMl0gPSBjb2xvdXIuYjtcbiAgfVxuICBnLnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKHZhbHVlcywgMykpO1xuICByZXR1cm4gZztcbn1cblxuZnVuY3Rpb24gYm94KHc6IG51bWJlciwgaDogbnVtYmVyLCBkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIGNvbG91cjogc3RyaW5nKSB7XG4gIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHcsIGgsIGQpO1xuICBnZW9tZXRyeS50cmFuc2xhdGUoeCwgeSArIGggLyAyLCB6KTtcbiAgcmV0dXJuIHBhaW50KGdlb21ldHJ5LCBjb2xvdXIpO1xufVxuXG5mdW5jdGlvbiBtZXNoKHBhcnRzOiBUSFJFRS5CdWZmZXJHZW9tZXRyeVtdLCBuYW1lOiBzdHJpbmcpOiBUSFJFRS5NZXNoIHtcbiAgY29uc3QgZ2VvbWV0cnkgPSBtZXJnZUdlb21ldHJpZXMocGFydHMsIGZhbHNlKTtcbiAgZm9yIChjb25zdCBwYXJ0IG9mIHBhcnRzKSBwYXJ0LmRpc3Bvc2UoKTtcbiAgaWYgKCFnZW9tZXRyeSkgdGhyb3cgbmV3IEVycm9yKGBjb3VsZCBub3QgbWVyZ2UgbGlmZSBtZXNoICR7bmFtZX1gKTtcbiAgZ2VvbWV0cnkuY29tcHV0ZUJvdW5kaW5nQm94KCk7XG4gIGdlb21ldHJ5LmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuICBjb25zdCByZXN1bHQgPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgTElGRV9NQVRFUklBTCk7XG4gIHJlc3VsdC5uYW1lID0gbmFtZTtcbiAgcmVzdWx0LmNhc3RTaGFkb3cgPSB0cnVlO1xuICByZXN1bHQucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQSBzbWFsbCBvcGVuIE5veGVsIGRlcG90OiBzdG9uZSBwYWQsIHRpbWJlciByYWlscyBhbmQgYSBwaXRjaGVkIGNhbm9weS4gSXRzXG4gKiByZXNvdXJjZSBwaWxlIGlzIGEgc2VwYXJhdGUgbm9kZSBzbyByZXBsYWNpbmcgaXQgYWZ0ZXIgYSB0cmFuc2ZlciBpcyBzaW1wbGUuXG4gKi9cbmZ1bmN0aW9uIHN0b2NrcGlsZUZyYW1lKCk6IFRIUkVFLk1lc2gge1xuICBjb25zdCBwYXJ0czogVEhSRUUuQnVmZmVyR2VvbWV0cnlbXSA9IFtcbiAgICBib3goMy40LCAwLjE4LCAyLjYsIDAsIDAsIDAsIFNUT05FKSxcbiAgICAvLyBTbGF0dGVkIHRpbWJlciBiaW4sIG9wZW4gYXQgdGhlIGZyb250IHNvIGVtcHR5IHN0b3JhZ2UgaXMgdmlzaWJsZS5cbiAgICBib3goMy4wLCAwLjE2LCAwLjE2LCAwLCAwLjE4LCAtMS4wMiwgVElNQkVSKSxcbiAgICBib3goMC4xNiwgMC42NSwgMi4wLCAtMS40MywgMC4xOCwgMCwgVElNQkVSKSxcbiAgICBib3goMC4xNiwgMC42NSwgMi4wLCAxLjQzLCAwLjE4LCAwLCBUSU1CRVIpLFxuICAgIGJveCgzLjAsIDAuMTYsIDAuMTYsIDAsIDAuNzAsIC0xLjAyLCBXT09EKSxcbiAgXTtcbiAgZm9yIChjb25zdCB4IG9mIFstMS40MywgMS40M10pIHtcbiAgICBjb25zdCBwb3N0ID0gbmV3IFRIUkVFLkN5bGluZGVyR2VvbWV0cnkoMC4wOSwgMC4xMiwgMS44NSwgNCk7XG4gICAgcG9zdC5yb3RhdGVZKE1hdGguUEkgLyA0KTtcbiAgICBwb3N0LnRyYW5zbGF0ZSh4LCAxLjEwNSwgLTEuMCk7XG4gICAgcGFydHMucHVzaChwYWludChwb3N0LCBUSU1CRVIpKTtcbiAgfVxuICAvLyBBIHJlc3RyYWluZWQgZm91ci1zaWRlZCBwaXRjaGVkIHJvb2YsIHJhdGhlciB0aGFuIGFub3RoZXIgZ2VuZXJpYyBjdWJvaWQuXG4gIGNvbnN0IHJvb2YgPSBuZXcgVEhSRUUuQ29uZUdlb21ldHJ5KDIuMzUsIDAuNjIsIDQpO1xuICByb29mLnJvdGF0ZVkoTWF0aC5QSSAvIDQpO1xuICByb29mLnNjYWxlKDEsIDEsIDAuNzYpO1xuICByb29mLnRyYW5zbGF0ZSgwLCAyLjE1LCAtMS4wKTtcbiAgcGFydHMucHVzaChwYWludChyb29mLCBXT09EKSk7XG4gIHJldHVybiBtZXNoKHBhcnRzLCAnc3RvY2twaWxlX2ZyYW1lJyk7XG59XG5cbmZ1bmN0aW9uIHJlc291cmNlR2VvbWV0cnkocmVzb3VyY2U6IHN0cmluZywgaW5kZXg6IG51bWJlcik6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3QgeCA9IC0xLjA1ICsgKGluZGV4ICUgNCkgKiAwLjcwO1xuICBjb25zdCB6ID0gMC40MiAtIE1hdGguZmxvb3IoaW5kZXggLyA0KSAqIDAuNjU7XG4gIGlmIChyZXNvdXJjZSA9PT0gJ3dvb2QnKSB7XG4gICAgY29uc3QgbG9nID0gbmV3IFRIUkVFLkN5bGluZGVyR2VvbWV0cnkoMC4xNiwgMC4xOCwgMC41OCwgNik7XG4gICAgbG9nLnJvdGF0ZVooTWF0aC5QSSAvIDIpO1xuICAgIGxvZy50cmFuc2xhdGUoeCwgMC4zOSwgeik7XG4gICAgcmV0dXJuIHBhaW50KGxvZywgV09PRCk7XG4gIH1cbiAgaWYgKHJlc291cmNlID09PSAnc3RvbmUnIHx8IHJlc291cmNlID09PSAnb3JlJykge1xuICAgIGNvbnN0IHJvY2sgPSBuZXcgVEhSRUUuRG9kZWNhaGVkcm9uR2VvbWV0cnkocmVzb3VyY2UgPT09ICdvcmUnID8gMC4yMCA6IDAuMjQsIDApO1xuICAgIHJvY2suc2NhbGUoMS4xLCAwLjc1LCAwLjkpO1xuICAgIHJvY2sucm90YXRlWShpbmRleCAqIDAuNyk7XG4gICAgcm9jay50cmFuc2xhdGUoeCwgMC4zOCwgeik7XG4gICAgcmV0dXJuIHBhaW50KHJvY2ssIHJlc291cmNlID09PSAnb3JlJyA/IEgoJ29yZV9jcnlzdGFsJykgOiBTVE9ORSk7XG4gIH1cbiAgaWYgKHJlc291cmNlID09PSAnZmliZXInIHx8IHJlc291cmNlID09PSAnc2VlZCcpIHtcbiAgICBjb25zdCBidW5kbGUgPSBuZXcgVEhSRUUuQ29uZUdlb21ldHJ5KDAuMjIsIDAuNDQsIDUpO1xuICAgIGJ1bmRsZS50cmFuc2xhdGUoeCwgMC40MCwgeik7XG4gICAgcmV0dXJuIHBhaW50KGJ1bmRsZSwgcmVzb3VyY2UgPT09ICdzZWVkJyA/IEdPTEQgOiBGSUJFUik7XG4gIH1cbiAgLy8gRm9vZCBhbmQgcmF0aW9ucyBhcmUgc21hbGwgZmFjZXRlZCBzYWNrcywgcmVjb2duaXphYmxlIHdpdGhvdXQgbGFiZWxzLlxuICBjb25zdCBzYWNrID0gbmV3IFRIUkVFLk9jdGFoZWRyb25HZW9tZXRyeSgwLjI1LCAwKTtcbiAgc2Fjay5zY2FsZSgwLjksIDEuMTUsIDAuOCk7XG4gIHNhY2sudHJhbnNsYXRlKHgsIDAuNDIsIHopO1xuICByZXR1cm4gcGFpbnQoc2FjaywgcmVzb3VyY2UgPT09ICdyYXRpb25zJyA/IEdPTERfTElHSFQgOiBHT0xEKTtcbn1cblxuZnVuY3Rpb24gc3RvY2twaWxlUmVzb3VyY2VzKHN0b2NrOiBTdG9ja3BpbGUpOiBUSFJFRS5NZXNoIHwgbnVsbCB7XG4gIGNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyhzdG9jay5pbnZlbnRvcnkpXG4gICAgLmZpbHRlcigoWywgYW1vdW50XSkgPT4gYW1vdW50ID4gMClcbiAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG4gIGNvbnN0IHBhcnRzID0gZW50cmllcy5tYXAoKFtyZXNvdXJjZV0sIGluZGV4KSA9PiByZXNvdXJjZUdlb21ldHJ5KHJlc291cmNlLCBpbmRleCkpO1xuICBpZiAocGFydHMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcmVzb3VyY2VzID0gbWVzaChwYXJ0cywgJ3N0b2NrcGlsZV9yZXNvdXJjZXMnKTtcbiAgcmVzb3VyY2VzLnVzZXJEYXRhLnJlc291cmNlcyA9IE9iamVjdC5mcm9tRW50cmllcyhlbnRyaWVzKTtcbiAgcmVzb3VyY2VzLnVzZXJEYXRhLnN0b3JlZCA9IGVudHJpZXMucmVkdWNlKChzdW0sIFssIGFtb3VudF0pID0+IHN1bSArIGFtb3VudCwgMCk7XG4gIHJlc291cmNlcy51c2VyRGF0YS5jYXBhY2l0eSA9IHN0b2NrLmNhcGFjaXR5O1xuICByZXR1cm4gcmVzb3VyY2VzO1xufVxuXG5mdW5jdGlvbiBidWlsZFN0b2NrcGlsZSh3b3JsZDogV29ybGQsIHN0b2NrOiBTdG9ja3BpbGUpOiBUSFJFRS5Hcm91cCB7XG4gIGNvbnN0IGdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIGdyb3VwLm5hbWUgPSBgbGlmZV8ke3N0b2NrLmlkfWA7XG4gIGdyb3VwLnBvc2l0aW9uLnNldChzdG9jay54LCBzdXJmYWNlQXQod29ybGQsIE1hdGguZmxvb3Ioc3RvY2sueCksIE1hdGguZmxvb3Ioc3RvY2sueikpLCBzdG9jay56KTtcbiAgZ3JvdXAudXNlckRhdGEuc3RvY2twaWxlSWQgPSBzdG9jay5pZDtcbiAgZ3JvdXAudXNlckRhdGEuY2FwYWNpdHkgPSBzdG9jay5jYXBhY2l0eTtcbiAgZ3JvdXAudXNlckRhdGEuaW5zcGVjdFRhcmdldCA9IHsgeDogMCwgeTogMS41LCB6OiAtMC40IH07XG4gIGdyb3VwLmFkZChzdG9ja3BpbGVGcmFtZSgpKTtcbiAgY29uc3QgcmVzb3VyY2VzID0gc3RvY2twaWxlUmVzb3VyY2VzKHN0b2NrKTtcbiAgLy8gRW1wdHkgc3RvcmFnZSBpcyBhIHJlYWwgdmlzaWJsZSBzdGF0ZSwgbm90IGFuIGludmlzaWJsZSBwbGFjZWhvbGRlci5cbiAgY29uc3QgZW1wdHkgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcbiAgZW1wdHkubmFtZSA9ICdzdG9ja3BpbGVfZW1wdHknO1xuICBlbXB0eS52aXNpYmxlID0gcmVzb3VyY2VzID09PSBudWxsO1xuICBncm91cC51c2VyRGF0YS5lbXB0eSA9IHJlc291cmNlcyA9PT0gbnVsbDtcbiAgZ3JvdXAuYWRkKGVtcHR5KTtcbiAgaWYgKHJlc291cmNlcykgZ3JvdXAuYWRkKHJlc291cmNlcyk7XG4gIHJldHVybiBncm91cDtcbn1cblxuZnVuY3Rpb24gcGxhbnQoXG4gIHBhcnRzOiBUSFJFRS5CdWZmZXJHZW9tZXRyeVtdLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLFxuICBoZWlnaHQ6IG51bWJlciwgc3ByZWFkOiBudW1iZXIsIGNvbG91cjogc3RyaW5nLCBjcm93bjogc3RyaW5nLFxuKTogdm9pZCB7XG4gIGNvbnN0IHN0ZW0gPSBuZXcgVEhSRUUuQ3lsaW5kZXJHZW9tZXRyeSgwLjAyNSwgMC4wNCwgaGVpZ2h0LCA1KTtcbiAgc3RlbS50cmFuc2xhdGUoeCwgeSArIGhlaWdodCAvIDIsIHopO1xuICBwYXJ0cy5wdXNoKHBhaW50KHN0ZW0sIGNvbG91cikpO1xuICAvLyBUd28gcG9pbnRlZCBsZWF2ZXMgZ2l2ZSBzcHJvdXRzIGEgcmVhZGFibGUgb3JnYW5pYyBzaWxob3VldHRlLlxuICBmb3IgKGNvbnN0IHNpZGUgb2YgWy0xLCAxXSkge1xuICAgIGNvbnN0IGxlYWYgPSBuZXcgVEhSRUUuT2N0YWhlZHJvbkdlb21ldHJ5KDAuMTAsIDApO1xuICAgIGxlYWYuc2NhbGUoMS42LCAwLjQ1LCAwLjgpO1xuICAgIGxlYWYucm90YXRlWihzaWRlICogMC41NSk7XG4gICAgbGVhZi50cmFuc2xhdGUoeCArIHNpZGUgKiBzcHJlYWQgKiAwLjQ1LCB5ICsgaGVpZ2h0ICogMC41Miwgeik7XG4gICAgcGFydHMucHVzaChwYWludChsZWFmLCBjb2xvdXIpKTtcbiAgfVxuICBpZiAoaGVpZ2h0ID4gMC41KSB7XG4gICAgY29uc3QgaGVhZCA9IG5ldyBUSFJFRS5Eb2RlY2FoZWRyb25HZW9tZXRyeSgwLjEwLCAwKTtcbiAgICBoZWFkLnNjYWxlKDAuODUsIDEuMzUsIDAuODUpO1xuICAgIGhlYWQudHJhbnNsYXRlKHgsIHkgKyBoZWlnaHQsIHopO1xuICAgIHBhcnRzLnB1c2gocGFpbnQoaGVhZCwgY3Jvd24pKTtcbiAgfVxufVxuXG4vKiogR2VvbWV0cnkgcmVtYWlucyBpbnNpZGUgdGhlIGNvcnJlc3BvbmRpbmcgYXV0aG9yaXRhdGl2ZSBjcm9wLXJvdyBib3VuZHMuICovXG5mdW5jdGlvbiBjcm9wR2VvbWV0cnkocm93OiBTdHJ1Y3R1cmVNb2R1bGUsIGNyb3A6IENyb3BQbG90IHwgdW5kZWZpbmVkLCB0aWNrOiBudW1iZXIpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IHBhcnRzOiBUSFJFRS5CdWZmZXJHZW9tZXRyeVtdID0gW107XG4gIGlmICghY3JvcCkge1xuICAgIC8vIEVtcHR5IHBsb3RzIHNob3cgYSBsb3cgdGlsbGVkIHJpZGdlLCB3aXRoIHNtYWxsIGJyZWFrcyBpbiBpdHMgc2lsaG91ZXR0ZS5cbiAgICBwYXJ0cy5wdXNoKGJveChyb3cudywgMC4wNywgcm93LmQgKiAwLjcyLCByb3cueCwgcm93LnksIHJvdy56LCBTT0lMKSk7XG4gICAgY29uc3QgY2xvZHMgPSBNYXRoLm1heCgzLCBNYXRoLnJvdW5kKHJvdy53IC8gMS41KSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjbG9kczsgaSsrKSB7XG4gICAgICBjb25zdCBjbG9kID0gbmV3IFRIUkVFLkRvZGVjYWhlZHJvbkdlb21ldHJ5KDAuMDg1LCAwKTtcbiAgICAgIGNsb2Quc2NhbGUoMS40LCAwLjQ1LCAwLjgpO1xuICAgICAgY2xvZC50cmFuc2xhdGUocm93LnggLSByb3cudyAvIDIgKyByb3cudyAqIChpICsgMC41KSAvIGNsb2RzLCByb3cueSArIDAuMDc1LCByb3cueik7XG4gICAgICBwYXJ0cy5wdXNoKHBhaW50KGNsb2QsIGkgJSAyID8gU09JTF9FREdFIDogU09JTCkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBwcm9ncmVzcyA9IFRIUkVFLk1hdGhVdGlscy5jbGFtcChcbiAgICAgICh0aWNrIC0gY3JvcC5wbGFudGVkVGljaykgLyBjcm9wLmdyb3d0aFRpY2tzLCAwLCAxLFxuICAgICk7XG4gICAgY29uc3QgcmVhZHkgPSBwcm9ncmVzcyA+PSAxO1xuICAgIC8vIEZvdXIgdmlzaWJsZSBzdGFnZXM7IHJlYWRpbmVzcyBhbHNvIGNoYW5nZXMgZ3JlZW4gZm9saWFnZSB0byBnb2xkLlxuICAgIGNvbnN0IHN0YWdlID0gcmVhZHkgPyAzIDogTWF0aC5mbG9vcihwcm9ncmVzcyAqIDMpO1xuICAgIGNvbnN0IGhlaWdodCA9IDAuMTQgKyBzdGFnZSAqIDAuMDk7XG4gICAgY29uc3QgY291bnQgPSBNYXRoLm1heCgzLCBNYXRoLnJvdW5kKHJvdy53IC8gMC45KSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICBjb25zdCB4ID0gcm93LnggLSByb3cudyAvIDIgKyByb3cudyAqIChpICsgMC41KSAvIGNvdW50O1xuICAgICAgY29uc3QgeiA9IHJvdy56ICsgKGkgJSAyID09PSAwID8gLTAuMDI1IDogMC4wMjUpO1xuICAgICAgcGxhbnQocGFydHMsIHgsIHJvdy55LCB6LCBoZWlnaHQsIHJvdy5kICogMC40LFxuICAgICAgICByZWFkeSA/IEdPTEQgOiBzdGFnZSA9PT0gMCA/IEdSRUVOX0xJR0hUIDogR1JFRU4sXG4gICAgICAgIHJlYWR5ID8gR09MRF9MSUdIVCA6IEdSRUVOX0xJR0hUKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgZ2VvbWV0cnkgPSBtZXJnZUdlb21ldHJpZXMocGFydHMsIGZhbHNlKTtcbiAgZm9yIChjb25zdCBwYXJ0IG9mIHBhcnRzKSBwYXJ0LmRpc3Bvc2UoKTtcbiAgaWYgKCFnZW9tZXRyeSkgdGhyb3cgbmV3IEVycm9yKGBjb3VsZCBub3QgbWVyZ2UgbGlmZSBjcm9wIHJvdyAke3Jvdy54fSwke3Jvdy56fWApO1xuICBnZW9tZXRyeS5jb21wdXRlQm91bmRpbmdCb3goKTtcbiAgZ2VvbWV0cnkuY29tcHV0ZUJvdW5kaW5nU3BoZXJlKCk7XG4gIHJldHVybiBnZW9tZXRyeTtcbn1cblxuZnVuY3Rpb24gY3JvcFJvd3Mod29ybGQ6IFdvcmxkKTogU3RydWN0dXJlTW9kdWxlW10ge1xuICBjb25zdCBzdHJ1Y3R1cmVzID0gWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldXG4gICAgLmZpbHRlcigoc3RydWN0dXJlKSA9PiBzdHJ1Y3R1cmUua2luZCA9PT0gJ3RlcnJhY2UnKVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICBjb25zdCBzb3VyY2UgPSBzdHJ1Y3R1cmVzLmZpbmQoKHN0cnVjdHVyZSkgPT4gc3RydWN0dXJlLmRlc2lnblZlcnNpb24gPT09IDIpID8/IHN0cnVjdHVyZXNbMF07XG4gIHJldHVybiBzb3VyY2U/Lm1vZHVsZXMuZmlsdGVyKChtb2R1bGUpID0+IG1vZHVsZS5raW5kID09PSAnY3JvcF9yb3cnKSA/PyBbXTtcbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUgY29tcGxldGUgc2NoZW1hLTMgbGlmZSBvdmVybGF5LiBObyBzdHJ1Y3R1cmUgbWVzaGVzIGFyZSBpbmNsdWRlZDpcbiAqIHRoZSBjYWxsZXIgbXVzdCByZW5kZXIgdGhhdCBmYXJtIHdpdGhvdXQgaXRzIHN0YXRpYyBjcm9wIGZvbGlhZ2UgdG8gYXZvaWQgYVxuICogc2Vjb25kLCBsaWZlY3ljbGUtdW5hd2FyZSBwbGFudCBsYXllci4gTGVnYWN5IHdvcmxkcyByZXR1cm4gYW4gZW1wdHkgZ3JvdXAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZExpZmVNZXNoZXMod29ybGQ6IFdvcmxkKTogVEhSRUUuR3JvdXAge1xuICBjb25zdCBncm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBncm91cC5uYW1lID0gJ2xpZmVfc3RhdGUnO1xuICBncm91cC51c2VyRGF0YS5zY2hlbWEgPSAzO1xuICBpZiAoIXdvcmxkLmxpZmUpIHJldHVybiBncm91cDtcblxuICBjb25zdCBsaWZlID0gd29ybGQubGlmZTtcbiAgZm9yIChjb25zdCBzdG9jayBvZiBbLi4ubGlmZS5zdG9ja3BpbGVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpKSB7XG4gICAgZ3JvdXAuYWRkKGJ1aWxkU3RvY2twaWxlKHdvcmxkLCBzdG9jaykpO1xuICB9XG4gIGNvbnN0IHJvd3MgPSBjcm9wUm93cyh3b3JsZCk7XG4gIC8vIElEcyBhcmUgZml4ZWQgcGxvdCBpbmRpY2VzLCBzbyBleHRyYS9taXNzaW5nIHRlcnJhY2Ugcm93cyBjYW5ub3Qgc2lsZW50bHlcbiAgLy8gYXNzb2NpYXRlIGEgcGxhbnQgd2l0aCB0aGUgd3JvbmcgcGh5c2ljYWwgbG9jYXRpb24uXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBNYXRoLm1pbihyb3dzLmxlbmd0aCwgOSk7IGluZGV4KyspIHtcbiAgICBjb25zdCBpZCA9IGBjcm9wOiR7aW5kZXh9YDtcbiAgICBjb25zdCBjcm9wID0gbGlmZS5jcm9wcy5nZXQoaWQpO1xuICAgIGNvbnN0IHJlYWR5ID0gY3JvcCAhPT0gdW5kZWZpbmVkICYmIHRpY2tSZWFkeShjcm9wLCBsaWZlLnRpY2spO1xuICAgIGNvbnN0IHBsb3QgPSBuZXcgVEhSRUUuTWVzaChjcm9wR2VvbWV0cnkocm93c1tpbmRleF0sIGNyb3AsIGxpZmUudGljayksIExJRkVfTUFURVJJQUwpO1xuICAgIHBsb3QubmFtZSA9IGBsaWZlXyR7aWR9YDtcbiAgICBwbG90LmNhc3RTaGFkb3cgPSBjcm9wICE9PSB1bmRlZmluZWQ7XG4gICAgcGxvdC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICBwbG90LnVzZXJEYXRhLmNyb3BJZCA9IGlkO1xuICAgIHBsb3QudXNlckRhdGEuc3RhdGUgPSAhY3JvcCA/ICdlbXB0eScgOiByZWFkeSA/ICdyZWFkeScgOiAnc3Byb3V0JztcbiAgICBwbG90LnVzZXJEYXRhLnBsYW50ZWRUaWNrID0gY3JvcD8ucGxhbnRlZFRpY2s7XG4gICAgcGxvdC51c2VyRGF0YS5ncm93dGhUaWNrcyA9IGNyb3A/Lmdyb3d0aFRpY2tzO1xuICAgIHBsb3QudXNlckRhdGEudGljayA9IGxpZmUudGljaztcbiAgICBwbG90LnVzZXJEYXRhLmluc3BlY3RUYXJnZXQgPSB7XG4gICAgICB4OiByb3dzW2luZGV4XS54LCB5OiByb3dzW2luZGV4XS55ICsgTWF0aC5tYXgoMC4xMiwgcm93c1tpbmRleF0uaCAvIDIpLCB6OiByb3dzW2luZGV4XS56LFxuICAgIH07XG4gICAgZ3JvdXAuYWRkKHBsb3QpO1xuICB9XG4gIHJldHVybiBncm91cDtcbn1cblxuZnVuY3Rpb24gdGlja1JlYWR5KGNyb3A6IENyb3BQbG90LCB0aWNrOiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHRpY2sgLSBjcm9wLnBsYW50ZWRUaWNrID49IGNyb3AuZ3Jvd3RoVGlja3M7XG59XG5cbi8qKiBEaXNwb3NlIHBlci1pbnN0YW5jZSBnZW9tZXRyeTsgdGhlIHNoYXJlZCBmbGF0LXNoYWRlZCBtYXRlcmlhbCBpcyByZXRhaW5lZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkaXNwb3NlTGlmZU1lc2hlcyhncm91cDogVEhSRUUuR3JvdXApOiB2b2lkIHtcbiAgZ3JvdXAudHJhdmVyc2UoKG9iamVjdCkgPT4ge1xuICAgIGlmIChvYmplY3QgaW5zdGFuY2VvZiBUSFJFRS5NZXNoKSBvYmplY3QuZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICB9KTtcbiAgZ3JvdXAuY2xlYXIoKTtcbn1cbiIsICIvLyBNMDAyIHN0cnVjdHVyZSByZW5kZXJlciBcdTIwMTQgTm94ZWwgbWFzc2VzIGZyb20gYXV0aG9yaXRhdGl2ZSBzdHJ1Y3R1cmUgbW9kdWxlcy5cbi8vXG4vLyBUaGUgc2ltdWxhdGlvbiBvd25zIGV2ZXJ5IG1vZHVsZSAocG9zaXRpb24sIHNpemUsIHRvbmUpLiBUaGlzIGZpbGUgb25seSB0dXJuc1xuLy8gdGhhdCBsaXN0IGludG8gb25lIG1lcmdlZCwgZmxhdC1zaGFkZWQgbWVzaCBwZXIgc3RydWN0dXJlLiBJdCBuZXZlciBkZWNpZGVzXG4vLyB3aGF0IGV4aXN0cywgYW5kIGl0IG5ldmVyIGVkaXRzIHRlcnJhaW4uXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgeyBtZXJnZUdlb21ldHJpZXMgfSBmcm9tICd0aHJlZS9leGFtcGxlcy9qc20vdXRpbHMvQnVmZmVyR2VvbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgcGFsZXR0ZSBmcm9tICcuLi9kYXRhL3BhbGV0dGUuanNvbic7XG5pbXBvcnQgeyBTdHJ1Y3R1cmUsIFN0cnVjdHVyZU1vZHVsZSB9IGZyb20gJy4uL3NpbS9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7IFNpdGVTdGF0ZSB9IGZyb20gJy4uL3NpbS9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4uL3NpbS90ZXJyYWluJztcbmNvbnN0IE0gPSBwYWxldHRlLm1hdGVyaWFscyBhcyBSZWNvcmQ8c3RyaW5nLCB7IGhleDogc3RyaW5nIH0+O1xuY29uc3QgSCA9IChrOiBzdHJpbmcpID0+IE1ba10uaGV4O1xuXG5jb25zdCBUT05FOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICBzdG9uZTogSCgnbm94ZWxfc3RvbmUnKSxcbiAgc3RvbmVfYjogSCgnbm94ZWxfc3RvbmVfYicpLFxuICB0aW1iZXI6IEgoJ2JhcmtfZGFyaycpLFxuICBvY2hyZTogSCgnc3RyYXRhX29jaHJlJyksXG4gIGFjY2VudDogSCgnYWNjZW50X2JsdWUnKSxcbiAgZ3JhdmVsOiBuZXcgVEhSRUUuQ29sb3IoSCgnc3RvbmVfYm9keV9iJykpLmxlcnAobmV3IFRIUkVFLkNvbG9yKEgoJ3NhbmQnKSksIDAuMzUpLmdldEhleFN0cmluZygpLnBhZFN0YXJ0KDYsICcwJyksXG4gIHNvaWw6IEgoJ3N0cmF0YV9vY2hyZScpLFxuICBjcm9wOiBIKCdjYW5vcHlfZ3JlZW5fYScpLFxufTtcblxuLy8gYGdldEhleFN0cmluZygpYCBkcm9wcyB0aGUgbGVhZGluZyAnIycsIHNvIG5vcm1hbGlzZSBpdCBiYWNrIHRvIGEgQ1NTIGNvbG91ci5cbmZ1bmN0aW9uIHRvbmVDb2xvdXIodG9uZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgY29uc3QgcmF3ID0gKHRvbmUgJiYgVE9ORVt0b25lXSkgfHwgVE9ORS5zdG9uZTtcbiAgcmV0dXJuIHJhdy5zdGFydHNXaXRoKCcjJykgPyByYXcgOiBgIyR7cmF3fWA7XG59XG5cbmNvbnN0IFNUUlVDVFVSRV9NQVRFUklBTCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgdmVydGV4Q29sb3JzOiB0cnVlLFxuICBmbGF0U2hhZGluZzogdHJ1ZSxcbn0pO1xuY29uc3QgQ1JPUF9NQVRFUklBTCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgdmVydGV4Q29sb3JzOiB0cnVlLFxuICBmbGF0U2hhZGluZzogdHJ1ZSxcbn0pO1xuXG5mdW5jdGlvbiBwYWludChnZW9tZXRyeTogVEhSRUUuQnVmZmVyR2VvbWV0cnksIGhleDogc3RyaW5nKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xuICBjb25zdCBnID0gZ2VvbWV0cnkuaW5kZXggPyBnZW9tZXRyeS50b05vbkluZGV4ZWQoKSA6IGdlb21ldHJ5O1xuICBnLmRlbGV0ZUF0dHJpYnV0ZSgndXYnKTtcbiAgY29uc3QgY29sb3VyID0gbmV3IFRIUkVFLkNvbG9yKGhleCk7XG4gIGNvbnN0IG4gPSBnLmF0dHJpYnV0ZXMucG9zaXRpb24uY291bnQ7XG4gIGNvbnN0IGFyciA9IG5ldyBGbG9hdDMyQXJyYXkobiAqIDMpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgIGFycltpICogM10gPSBjb2xvdXIucjtcbiAgICBhcnJbaSAqIDMgKyAxXSA9IGNvbG91ci5nO1xuICAgIGFycltpICogMyArIDJdID0gY29sb3VyLmI7XG4gIH1cbiAgZy5zZXRBdHRyaWJ1dGUoJ2NvbG9yJywgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShhcnIsIDMpKTtcbiAgcmV0dXJuIGc7XG59XG5cbmZ1bmN0aW9uIHN0cnVjdHVyZUFuY2hvcihzdHJ1Y3R1cmU6IFN0cnVjdHVyZSwgaGVpZ2h0OiBudW1iZXIpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfSB7XG4gIGNvbnN0IGJvdW5kcyA9IG5ldyBUSFJFRS5Cb3gzKCk7XG4gIGNvbnN0IHBvaW50ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgZm9yIChjb25zdCBtIG9mIHN0cnVjdHVyZS5tb2R1bGVzKSB7XG4gICAgLy8gUm90YXRpb24gaXMgYXJvdW5kIHRoZSBtb2R1bGUgY2VudHJlOyBhIGJvdW5kaW5nIHNwaGVyZSBrZWVwcyB0aGUgYW5jaG9yXG4gICAgLy8gdmFsaWQgZm9yIGxlZ2FjeSByb3RhdGVkIGxpbnRlbHMgd2l0aG91dCBhc3N1bWluZyBhIHJlY3Rhbmd1bGFyIHNpdGUuXG4gICAgY29uc3QgZXh0ZW50ID0gTWF0aC5oeXBvdChtLncsIG0uZCkgLyAyO1xuICAgIGJvdW5kcy5leHBhbmRCeVBvaW50KHBvaW50LnNldChtLnggLSBleHRlbnQsIG0ueSwgbS56IC0gZXh0ZW50KSk7XG4gICAgYm91bmRzLmV4cGFuZEJ5UG9pbnQocG9pbnQuc2V0KG0ueCArIGV4dGVudCwgbS55ICsgbS5oICsgaGVpZ2h0LCBtLnogKyBleHRlbnQpKTtcbiAgfVxuICBjb25zdCBjZW50cmUgPSBib3VuZHMuZ2V0Q2VudGVyKG5ldyBUSFJFRS5WZWN0b3IzKCkpO1xuICByZXR1cm4geyB4OiBjZW50cmUueCwgeTogY2VudHJlLnkgKyBoZWlnaHQgLyAyLCB6OiBjZW50cmUueiB9O1xufVxuXG5mdW5jdGlvbiBtb2R1bGVHZW9tZXRyeShtOiBTdHJ1Y3R1cmVNb2R1bGUsIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVbJ2Rlc2lnblZlcnNpb24nXSk6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgLy8gQ3JvcCByb3dzIGFyZSBhZ2dyZWdhdGUgcHJlc2VudGF0aW9uIHZvbHVtZXMsIG5ldmVyIHNpbXVsYXRpb24gcGxhbnRzLlxuICAvLyBEZXNpZ24gMiB1c2VzIG9uZSByZXN0cmFpbmVkIGZhY2V0ZWQgc2lsaG91ZXR0ZSBpbnNpZGUgdGhlIGV4YWN0IHJvdyBib3VuZHMuXG4gIGlmIChtLmtpbmQgPT09ICdjcm9wX3JvdycgJiYgZGVzaWduVmVyc2lvbiA9PT0gMikgcmV0dXJuIGNyb3BHZW9tZXRyeShtKTtcbiAgY29uc3QgZyA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShtLncsIG0uaCwgbS5kKTtcbiAgaWYgKG0ucm90KSBnLnJvdGF0ZVkobS5yb3QpO1xuICBnLnRyYW5zbGF0ZShtLngsIG0ueSArIG0uaCAvIDIsIG0ueik7XG4gIHJldHVybiBwYWludChnLCB0b25lQ29sb3VyKG0udG9uZSkpO1xufVxuXG4vKiogRGV0ZXJtaW5pc3RpYyBsb3ctc2lkZWQgbGVhZiBjYW5vcHksIGJvdW5kZWQgYnkgYW4gYXV0aG9yaXRhdGl2ZSBjcm9wIHJvdy4gKi9cbmZ1bmN0aW9uIGNyb3BHZW9tZXRyeShtOiBTdHJ1Y3R1cmVNb2R1bGUpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGxlYXZlczogVEhSRUUuQnVmZmVyR2VvbWV0cnlbXSA9IFtdO1xuICBjb25zdCBjb3VudCA9IE1hdGgubWF4KDMsIE1hdGgucm91bmQobS53IC8gMS4yKSk7XG4gIGNvbnN0IHNpZGVzID0gNTtcbiAgY29uc3QgcmFkaXVzID0gTWF0aC5taW4obS5kIC8gMiAtIDAuMDM1LCBtLncgLyBjb3VudCAvIDIpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjb25zdCBjeCA9IG0ueCAtIG0udyAvIDIgKyBtLncgKiAoaSArIDAuNSkgLyBjb3VudDtcbiAgICBjb25zdCBjeiA9IG0ueiArIChpICUgMiA9PT0gMCA/IC0wLjAzNSA6IDAuMDM1KTtcbiAgICBjb25zdCB0b3AgPSBtLnkgKyBtLmggKiAoaSAlIDMgPT09IDAgPyAxIDogMC44Mik7XG4gICAgY29uc3Qgc2hvdWxkZXIgPSBtLnkgKyBtLmggKiAwLjQ2O1xuICAgIGNvbnN0IHBvczogbnVtYmVyW10gPSBbXTtcbiAgICBjb25zdCB0cmkgPSAoYTogbnVtYmVyW10sIGI6IG51bWJlcltdLCBjOiBudW1iZXJbXSkgPT4gcG9zLnB1c2goLi4uYSwgLi4uYiwgLi4uYyk7XG4gICAgY29uc3Qgb3V0ZXJQb2ludCA9IChrOiBudW1iZXIpID0+IHtcbiAgICAgIGNvbnN0IGFuZ2xlID0gKGsgJSBzaWRlcykgKiAyICogTWF0aC5QSSAvIHNpZGVzO1xuICAgICAgcmV0dXJuIFtjeCArIE1hdGguY29zKGFuZ2xlKSAqIHJhZGl1cywgc2hvdWxkZXIsIGN6ICsgTWF0aC5zaW4oYW5nbGUpICogcmFkaXVzXTtcbiAgICB9O1xuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgc2lkZXM7IGsrKykge1xuICAgICAgY29uc3QgYSA9IG91dGVyUG9pbnQoayksIGIgPSBvdXRlclBvaW50KGsgKyAxKTtcbiAgICAgIHRyaShbY3gsIG0ueSwgY3pdLCBiLCBhKTtcbiAgICAgIHRyaShhLCBiLCBbY3gsIHRvcCwgY3pdKTtcbiAgICB9XG4gICAgY29uc3QgZyA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICAgIGcuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKHBvcywgMykpO1xuICAgIGcuY29tcHV0ZVZlcnRleE5vcm1hbHMoKTtcbiAgICBsZWF2ZXMucHVzaChwYWludChnLCB0b25lQ29sb3VyKG0udG9uZSkpKTtcbiAgfVxuICBjb25zdCBtZXJnZWQgPSBtZXJnZUdlb21ldHJpZXMobGVhdmVzLCBmYWxzZSk7XG4gIGZvciAoY29uc3QgbGVhZiBvZiBsZWF2ZXMpIGxlYWYuZGlzcG9zZSgpO1xuICBpZiAoIW1lcmdlZCkgdGhyb3cgbmV3IEVycm9yKCdjb3VsZCBub3QgbWVyZ2UgY3JvcC1yb3cgcHJlc2VudGF0aW9uJyk7XG4gIG1lcmdlZC5jb21wdXRlQm91bmRpbmdCb3goKTtcbiAgbWVyZ2VkLmNvbXB1dGVCb3VuZGluZ1NwaGVyZSgpO1xuICByZXR1cm4gbWVyZ2VkO1xufVxuXG4vKiogT25lIG1lcmdlZCBtZXNoIGZvciBhIGZpbmlzaGVkIHN0cnVjdHVyZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFN0cnVjdHVyZU1lc2goc3RydWN0dXJlOiBTdHJ1Y3R1cmUpOiBUSFJFRS5NZXNoIHwgVEhSRUUuR3JvdXAge1xuICBpZiAoc3RydWN0dXJlLmRlc2lnblZlcnNpb24gPT09IDIgJiYgc3RydWN0dXJlLmtpbmQgPT09ICd0ZXJyYWNlJykge1xuICAgIGNvbnN0IGdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gICAgZ3JvdXAubmFtZSA9IGBzdHJ1Y3R1cmVfJHtzdHJ1Y3R1cmUua2luZH1gO1xuICAgIGdyb3VwLnVzZXJEYXRhLnN0cnVjdHVyZUlkID0gc3RydWN0dXJlLmlkOyAgICBncm91cC51c2VyRGF0YS5pbnNwZWN0VGFyZ2V0ID0gc3RydWN0dXJlQW5jaG9yKHN0cnVjdHVyZSwgMC42KTtcbiAgICBjb25zdCBlYXJ0aCA9IGJ1aWxkU3RydWN0dXJlTWVzaCh7IC4uLnN0cnVjdHVyZSwgZGVzaWduVmVyc2lvbjogdW5kZWZpbmVkLFxuICAgICAgbW9kdWxlczogc3RydWN0dXJlLm1vZHVsZXMuZmlsdGVyKChtKSA9PiBtLmtpbmQgIT09ICdjcm9wX3JvdycpIH0pO1xuICAgIGlmICghKGVhcnRoIGluc3RhbmNlb2YgVEhSRUUuTWVzaCkpIHRocm93IG5ldyBFcnJvcigndW5leHBlY3RlZCB0ZXJyYWNlIGdyb3VwJyk7XG4gICAgZ3JvdXAuYWRkKGVhcnRoKTtcbiAgICBjb25zdCBwYXJ0cyA9IHN0cnVjdHVyZS5tb2R1bGVzLmZpbHRlcigobSkgPT4gbS5raW5kID09PSAnY3JvcF9yb3cnKS5tYXAoY3JvcEdlb21ldHJ5KTtcbiAgICBjb25zdCBtZXJnZWQgPSBtZXJnZUdlb21ldHJpZXMocGFydHMsIGZhbHNlKTtcbiAgICBmb3IgKGNvbnN0IHBhcnQgb2YgcGFydHMpIHBhcnQuZGlzcG9zZSgpO1xuICAgIGlmICghbWVyZ2VkKSB0aHJvdyBuZXcgRXJyb3IoYGNvdWxkIG5vdCBtZXJnZSBjcm9wIHJvd3MgJHtzdHJ1Y3R1cmUuaWR9YCk7XG4gICAgY29uc3QgZm9saWFnZSA9IG5ldyBUSFJFRS5NZXNoKG1lcmdlZCwgQ1JPUF9NQVRFUklBTCk7XG4gICAgZm9saWFnZS5uYW1lID0gJ2Nyb3Bfcm93X2ZvbGlhZ2UnO1xuICAgIGZvbGlhZ2UuY2FzdFNoYWRvdyA9IHRydWU7XG4gICAgZm9saWFnZS5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICBmb2xpYWdlLnVzZXJEYXRhLnByZXNlbnRhdGlvbkJvdW5kcyA9IHN0cnVjdHVyZS5tb2R1bGVzLmZpbHRlcigobSkgPT4gbS5raW5kID09PSAnY3JvcF9yb3cnKS5sZW5ndGg7XG4gICAgZ3JvdXAuYWRkKGZvbGlhZ2UpO1xuICAgIHJldHVybiBncm91cDtcbiAgfVxuICBjb25zdCBwYXJ0cyA9IHN0cnVjdHVyZS5tb2R1bGVzLm1hcCgobSkgPT4gbW9kdWxlR2VvbWV0cnkobSwgc3RydWN0dXJlLmRlc2lnblZlcnNpb24pKTtcbiAgY29uc3QgbWVyZ2VkID0gbWVyZ2VHZW9tZXRyaWVzKHBhcnRzLCBmYWxzZSk7XG4gIGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykgcGFydC5kaXNwb3NlKCk7XG4gIGlmICghbWVyZ2VkKSB0aHJvdyBuZXcgRXJyb3IoYGNvdWxkIG5vdCBtZXJnZSBzdHJ1Y3R1cmUgJHtzdHJ1Y3R1cmUuaWR9YCk7XG4gIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChtZXJnZWQsIFNUUlVDVFVSRV9NQVRFUklBTCk7XG4gIG1lc2gubmFtZSA9IGBzdHJ1Y3R1cmVfJHtzdHJ1Y3R1cmUua2luZH1gO1xuICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xuICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xuICBtZXNoLnVzZXJEYXRhLnN0cnVjdHVyZUlkID0gc3RydWN0dXJlLmlkOyAgbWVzaC51c2VyRGF0YS5pbnNwZWN0VGFyZ2V0ID0gc3RydWN0dXJlQW5jaG9yKHN0cnVjdHVyZSwgc3RydWN0dXJlLmtpbmQgPT09ICdob3VzZScgPyAwLjYgOiAwLjMpO1xuICByZXR1cm4gbWVzaDtcbn1cblxuY29uc3QgR0hPU1RfQ09MT1VSOiBSZWNvcmQ8U2l0ZVN0YXRlLCBzdHJpbmc+ID0ge1xuICB2YWxpZDogJyM2RkUzOUEnLFxuICB2YWxpZF93aXRoX3ByZXBhcmF0aW9uOiAnI0YyQjM1QycsXG4gIGludmFsaWQ6ICcjRTg2QTVFJyxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvamVjdEdob3N0U3BlYyB7XG4gIGtpbmQ6ICdob3VzZScgfCAncGF0aCcgfCAndGVycmFjZSc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBiYW5kcz86IHJlYWRvbmx5IHsgejA6IG51bWJlcjsgejE6IG51bWJlcjsgeTogbnVtYmVyIH1bXTtcbn1cblxuZnVuY3Rpb24gZ2hvc3RCb3goXG4gIGdyb3VwOiBUSFJFRS5Hcm91cCxcbiAgY3g6IG51bWJlciwgeTogbnVtYmVyLCBjejogbnVtYmVyLFxuICB3OiBudW1iZXIsIGg6IG51bWJlciwgZDogbnVtYmVyLFxuICBjb2xvdXI6IHN0cmluZyxcbik6IHZvaWQge1xuICBjb25zdCBib3ggPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkodywgaCwgZCk7XG4gIGNvbnN0IGZpbGwgPSBuZXcgVEhSRUUuTWVzaChib3gsIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XG4gICAgY29sb3I6IGNvbG91cixcbiAgICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICBvcGFjaXR5OiAwLjE2LFxuICAgIGRlcHRoV3JpdGU6IGZhbHNlLFxuICAgIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUsXG4gIH0pKTtcbiAgZmlsbC5wb3NpdGlvbi5zZXQoY3gsIHkgKyBoIC8gMiwgY3opO1xuICBmaWxsLnJlbmRlck9yZGVyID0gMjtcbiAgZ3JvdXAuYWRkKGZpbGwpO1xuXG4gIGNvbnN0IGVkZ2VzID0gbmV3IFRIUkVFLkVkZ2VzR2VvbWV0cnkoYm94KTtcbiAgYm94LmRpc3Bvc2UoKTtcbiAgY29uc3QgbGluZSA9IG5ldyBUSFJFRS5MaW5lU2VnbWVudHMoZWRnZXMsIG5ldyBUSFJFRS5MaW5lQmFzaWNNYXRlcmlhbCh7XG4gICAgY29sb3I6IGNvbG91cixcbiAgICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICBvcGFjaXR5OiAwLjk1LFxuICAgIGRlcHRoV3JpdGU6IGZhbHNlLFxuICB9KSk7XG4gIGxpbmUucG9zaXRpb24uY29weShmaWxsLnBvc2l0aW9uKTtcbiAgbGluZS5yZW5kZXJPcmRlciA9IDM7XG4gIGdyb3VwLmFkZChsaW5lKTtcbn1cblxuLyoqXG4gKiBGb290cHJpbnQgZ2hvc3QgZm9yIGEgcHJvamVjdC4gSG91c2VzIGdldCBhIG1hc3NpbmcgYm94OyB0aGUgdGVycmFjZWQgZmllbGRcbiAqIGdldHMgb25lIGJveCBwZXIgcGlubmVkIGJhbmQgc28gdGhlIHByZXZpZXcgc2hvd3MgdGhlIGFjdHVhbCBzdGVwIHByb2ZpbGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFByb2plY3RHaG9zdChwcm9qZWN0OiBQcm9qZWN0R2hvc3RTcGVjLCBzdGF0ZTogU2l0ZVN0YXRlKTogVEhSRUUuR3JvdXAge1xuICBjb25zdCBncm91cCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xuICBncm91cC5uYW1lID0gYG0yX2dob3N0XyR7cHJvamVjdC5raW5kfWA7XG4gIGNvbnN0IGNvbG91ciA9IEdIT1NUX0NPTE9VUltzdGF0ZV07XG4gIGNvbnN0IHJlY3QgPSBwcm9qZWN0LnJlY3Q7XG4gIGNvbnN0IHcgPSByZWN0LngxIC0gcmVjdC54MCArIDE7XG4gIGNvbnN0IGQgPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGNvbnN0IGN4ID0gcmVjdC54MCArIHcgLyAyO1xuICBjb25zdCBjeiA9IHJlY3QuejAgKyBkIC8gMjtcblxuICBpZiAocHJvamVjdC5iYW5kcykge1xuICAgIGZvciAoY29uc3QgYmFuZCBvZiBwcm9qZWN0LmJhbmRzKSB7XG4gICAgICBjb25zdCBiZCA9IGJhbmQuejEgLSBiYW5kLnowICsgMTtcbiAgICAgIGdob3N0Qm94KGdyb3VwLCBjeCwgYmFuZC55LCBiYW5kLnowICsgYmQgLyAyLCB3LCAwLjMyLCBiZCwgY29sb3VyKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgaCA9IHByb2plY3Qua2luZCA9PT0gJ2hvdXNlJyA/IDMuNiA6IHByb2plY3Qua2luZCA9PT0gJ3BhdGgnID8gMC4zIDogMC41NTtcbiAgICBnaG9zdEJveChncm91cCwgY3gsIHByb2plY3QuZmxvb3JZLCBjeiwgdywgaCwgZCwgY29sb3VyKTtcbiAgfVxuXG4gIGlmIChwcm9qZWN0LmRvb3IpIHtcbiAgICBjb25zdCBkb29yID0gcHJvamVjdC5kb29yO1xuICAgIGdob3N0Qm94KGdyb3VwLCBkb29yLnggKyAwLjUsIHByb2plY3QuZmxvb3JZLCBkb29yLnogKyAwLjUsIDAuOSwgMi4yLCAxLjIsIGNvbG91cik7XG4gIH1cblxuICByZXR1cm4gZ3JvdXA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBR0EsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTtBQUNuQixZQUFZQSxZQUFXOzs7QUNHdkIsSUFBTSxTQUFTLG9CQUFJLFFBQTZCO0FBRXpDLFNBQVMsaUJBQWlCLE9BQTRCO0FBQzNELE1BQUksUUFBUSxPQUFPLElBQUksS0FBSztBQUM1QixNQUFJLENBQUMsT0FBTztBQUFFLFlBQVEsRUFBRSxRQUFRLE9BQU8sZ0JBQWdCLE9BQU8sVUFBVSxNQUFNO0FBQUcsV0FBTyxJQUFJLE9BQU8sS0FBSztBQUFBLEVBQUc7QUFDM0csU0FBTztBQUNUO0FBRU8sU0FBUyxrQkFBa0IsT0FBcUI7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TSxPQUFPLEdBQUcsT0FBTyxPQUFPLFFBQVEsR0FBRyxLQUFLLE1BQU0sQ0FBQyxFQUFFO0FBQUEsSUFDL0csRUFBRSxJQUFJLE1BQU0sSUFBSSxNQUFNLElBQUksS0FBTSxJQUFJLE1BQU0sSUFBSSxLQUFNLElBQUksS0FBTSxPQUFPLEdBQUcsT0FBTyxPQUFPLFFBQVEsSUFBSSxLQUFLLE1BQU0sQ0FBQyxFQUFFO0FBQUEsSUFDaEgsRUFBRSxJQUFJLE1BQU8sSUFBSSxNQUFNLElBQUksT0FBTyxJQUFJLE1BQU0sSUFBSSxNQUFNLElBQUksTUFBTSxPQUFPLEdBQUcsT0FBTyxPQUFPLFFBQVEsSUFBSSxLQUFLLE1BQU0sQ0FBQyxFQUFFO0FBQUEsSUFDbEgsRUFBRSxJQUFJLEtBQU0sSUFBSSxLQUFNLElBQUksTUFBTyxJQUFJLEdBQU0sSUFBSSxLQUFNLElBQUksTUFBTSxPQUFPLEdBQUcsT0FBTyxPQUFPLFFBQVEsSUFBSSxLQUFLLE1BQU0sQ0FBQyxFQUFFO0FBQUEsRUFDbkg7QUFBQSxFQUNBLFdBQVcsRUFBRSxJQUFJLE1BQU0sSUFBSSxLQUFNLElBQUksT0FBTyxJQUFJLEtBQU0sSUFBSSxNQUFNLElBQUksS0FBTSxLQUFLLE1BQU0sQ0FBQyxFQUFFO0FBQzFGO0FBRUEsSUFBTSxLQUFlO0FBQUEsRUFDbkIsUUFBUTtBQUFBLEVBQU0sUUFBUTtBQUFBLEVBQU0sUUFBUTtBQUFBLEVBQU0sUUFBUTtBQUFBLEVBQ2xELFFBQVE7QUFBQSxJQUNOLEVBQUUsSUFBSSxHQUFNLElBQUksR0FBTSxJQUFJLEdBQU0sSUFBSSxNQUFNLElBQUksTUFBTSxJQUFJLEtBQU0sT0FBTyxHQUFHLE9BQU8sUUFBUSxRQUFRLEdBQUcsS0FBSyxLQUFLLENBQUMsRUFBRTtBQUFBLElBQy9HLEVBQUUsSUFBSSxLQUFNLElBQUksS0FBTSxJQUFJLE9BQU8sSUFBSSxNQUFNLElBQUksR0FBTSxJQUFJLE1BQU0sT0FBTyxHQUFHLE9BQU8sUUFBUSxRQUFRLElBQUksS0FBSyxLQUFLLENBQUMsRUFBRTtBQUFBLElBQ2pI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QjtBQUMxQixhQUFXLFFBQVEsSUFBSTtBQUN2QixRQUFNLGtCQUFrQixJQUFJO0FBQzVCLFFBQU0sT0FBUSxXQUFtQixLQUFLLEtBQUssVUFBVTtBQUNyRCxTQUFPLFVBQVUsS0FBSyxJQUFJLEVBQUUsR0FBRyxFQUFFLFFBQVEsU0FBUyxDQUFDO0FBQ25ELFFBQU0sVUFBVSxJQUFVLFlBQUssSUFBVSxtQkFBWSxJQUFJLElBQUksR0FBRyxDQUFDO0FBQ2pFLFVBQVEsU0FBUyxLQUFLLE9BQU8sUUFBUSxFQUFFLEtBQUssSUFBVSxlQUFRLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsR0FBRztBQUN2RixVQUFRLFdBQVcsS0FBSyxPQUFPLFVBQVU7QUFDekMsVUFBUSxJQUFJLE9BQU87QUFDbkIsUUFBTSxrQkFBa0IsSUFBSTtBQUM1QixTQUFPLE1BQU0sS0FBSyxJQUFJLEVBQUUsR0FBRyxNQUFNLG1EQUFtRDtBQUN0RixDQUFDO0FBRUQsU0FBUyxjQUFjLFNBQXNCLE9BQW9CLE1BQXNDO0FBQ3JHLFFBQU0sYUFBYSxPQUFPLE9BQU8sZUFBZSxTQUFTO0FBQ3pELEVBQUMsV0FBbUIsVUFBVSxFQUFFLE9BQU8sUUFBUSxPQUFPLE1BQU07QUFDNUQsRUFBQyxXQUFtQixRQUFRLG9CQUFJLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDMUMsRUFBQyxXQUFtQixjQUFjLENBQUM7QUFDbkMsRUFBQyxXQUFtQixRQUFRLEVBQUUsYUFBYTtBQUFBLEVBQUMsRUFBRTtBQUM5QyxhQUFXLGVBQWU7QUFDMUIsU0FBTztBQUNUOyIsCiAgIm5hbWVzIjogWyJUSFJFRSIsICJpZCIsICJpZCIsICJpZCIsICJ0ZXh0IiwgImlkIiwgImlkIiwgImRpZ2VzdCIsICJmYWlsIiwgImpvYiIsICJ0ZXh0IiwgImludmVudG9yeSIsICJpZCIsICJpZCIsICJpZCIsICJ1aW50IiwgImVudGl0eUlkIiwgIm91dGNvbWUiLCAiaGlzdG9yaWNhbCIsICJlcnJvciIsICJpZCIsICJpZCIsICJvYmplY3QiLCAib2JqZWN0IiwgImluZm8iLCAicmVmIiwgIlRIUkVFIiwgImNsYW1wIiwgImlkIiwgIlRIUkVFIiwgIm1lcmdlR2VvbWV0cmllcyIsICJNIiwgIkgiLCAiU1RPTkUiLCAiU1RPTkVfQiIsICJPQ0hSRSIsICJib3giLCAiTUFUIiwgImFzc2VtYmx5IiwgIm1lcmdlR2VvbWV0cmllcyIsICJtZXNoIiwgIkgiLCAiYXNzZW1ibHkiLCAiU1RPTkVfQiIsICJTVE9ORSIsICJtZXNoIiwgIlRIUkVFIiwgIm1lcmdlR2VvbWV0cmllcyIsICJNIiwgIkgiLCAiVElNQkVSIiwgIlNUT05FIiwgIkdSRUVOIiwgInBhaW50IiwgImJveCIsICJtZXJnZUdlb21ldHJpZXMiLCAiaWQiLCAiVEhSRUUiLCAibWVyZ2VHZW9tZXRyaWVzIiwgIk0iLCAiSCIsICJwYWludCIsICJjcm9wR2VvbWV0cnkiLCAibWVyZ2VHZW9tZXRyaWVzIiwgInBhcnRzIiwgIm1lcmdlZCIsICJtZXNoIiwgImtpbmQiLCAiZW50aXR5IiwgImlkIiwgIm1lc2giXQp9Cg==
