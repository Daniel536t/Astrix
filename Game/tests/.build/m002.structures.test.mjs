// tests/m002.structures.test.ts
import test from "node:test";
import assert from "node:assert/strict";

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
function removeEntity(world, id) {
  const e = world.entities.get(id);
  if (!e || isRetiredStoneKind(e.kind) && !isStoneReplay(world)) return false;
  world.entities.delete(id);
  const list = world.entityChunks.get(e.chunk);
  if (list) {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) world.entityChunks.set(e.chunk, []);
  }
  world.entityChanges.add(e.chunk);
  if (!e.authored) world.entityRemovals.add(id);
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
function addAuthoredEntity(world, kind, x, z, variant, rot, scale, resource, remaining, yieldPerHarvest) {
  const y = surfaceAt(world, x, z);
  if (y <= SEA_LEVEL) return;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const key = chunkKey(cx, cz);
  const ids = world.entityChunks.get(key) ?? [];
  if (isRetiredStoneKind(kind) && !isStoneReplay(world)) return;
  for (const id2 of ids) {
    const e = world.entities.get(id2);
    if (e && Math.hypot(e.x - x, e.z - z) < 2.6) {
      world.entities.delete(id2);
      if (e.kind.startsWith("styl_tree")) world.stats.trees = Math.max(0, world.stats.trees - 1);
      if (e.kind === "styl_tree_blossom") world.stats.pinkTrees = Math.max(0, world.stats.pinkTrees - 1);
    }
  }
  world.entityChunks.set(key, ids.filter((id2) => world.entities.has(id2)));
  world.entityChanges.add(key);
  const id = `hero:${kind}:${Math.round(x)}:${Math.round(z)}`;
  const before = world.entities.size;
  const entity = {
    id,
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
    for (const id of ids) {
      if (seen.has(id)) continue;
      const e = world.entities.get(id);
      if (!e || isRetiredStoneKind(e.kind) && !isStoneReplay(world) || world.entityRemovals.has(e.id)) continue;
      seen.add(id);
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
  for (const id of clears) lines.push(`c:${id}`);
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
    if (current.length !== planned.length || current.some((id, i) => id !== planned[i])) {
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
  if (current.length !== planned.length || current.some((id, i) => id !== planned[i])) {
    reasons.push("footprint obstructions changed after authorization");
  }
  if (plan.clearEntityIds.length > authorization.limits.maxEntityRemovals) {
    reasons.push(`${plan.clearEntityIds.length} removals exceed limit ${authorization.limits.maxEntityRemovals}`);
  }
  for (const id of plan.clearEntityIds) {
    if (!world.entities.has(id)) reasons.push(`entity ${id} no longer exists`);
  }
  if (world.life) {
    let recovered = 0;
    for (const id of plan.clearEntityIds) {
      const entity = world.entities.get(id);
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
  for (const id of [...plan.clearEntityIds].sort()) {
    const e = world.entities.get(id);
    if (!e) continue;
    const amount = e.resource && e.remaining > 0 ? e.remaining : 0;
    if (e.resource && amount > 0) {
      world.inventory[e.resource] = (world.inventory[e.resource] ?? 0) + amount;
      resourcesGained[e.resource] = (resourcesGained[e.resource] ?? 0) + amount;
    }
    removeEntity(world, id);
    entitiesCleared.push({
      entityId: id,
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
function canonicalInventoryHash(world) {
  const h = new Hasher();
  h.string("m002:inventory:v1");
  const keys = Object.keys(world.inventory).sort();
  h.u32(keys.length);
  for (const key of keys) {
    h.string(key);
    h.u32(world.inventory[key]);
  }
  return h.hex();
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
function canonicalStructureHash(world) {
  const structures = [...world.structures.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const h = new Hasher();
  h.string("m002:structure-state:v1");
  h.u32(structures.length);
  for (const s of structures) {
    h.string(s.id);
    h.string(s.kind);
    h.string(s.siteId);
    h.u32(Math.round(s.x * 1e3));
    h.u32(Math.round(s.y * 1e3));
    h.u32(Math.round(s.z * 1e3));
    h.u32(Math.round(s.rot * 1e4));
    if (s.designVersion === FOUNDER_DESIGN_VERSION) h.string("design:2");
    h.u32(s.modules.length);
    for (const m of s.modules) {
      h.string(m.kind);
      h.u32(Math.round(m.x * 1e3));
      h.u32(Math.round(m.y * 1e3));
      h.u32(Math.round(m.z * 1e3));
      h.u32(Math.round(m.w * 1e3));
      h.u32(Math.round(m.h * 1e3));
      h.u32(Math.round(m.d * 1e3));
      h.u32(Math.round((m.rot ?? 0) * 1e4));
      h.string(m.tone ?? "");
    }
    const costKeys = Object.keys(s.cost).sort();
    h.u32(costKeys.length);
    for (const key of costKeys) {
      h.string(key);
      h.u32(s.cost[key] ?? 0);
    }
    h.u32(s.builtRevision);
  }
  return h.hex();
}
function checkDerivedCaches(world, region, limit = 64) {
  const r = clampRegion(region);
  const keys = ensureRegionChunks(world, r);
  const out = [];
  for (const key of keys) {
    const chunk = world.chunks.get(key);
    if (!chunk) continue;
    const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
    const lx0 = Math.max(0, r.x0 - ox), lx1 = Math.min(CHUNK_SIZE - 1, r.x1 - ox);
    const lz0 = Math.max(0, r.z0 - oz), lz1 = Math.min(CHUNK_SIZE - 1, r.z1 - oz);
    for (let lz = lz0; lz <= lz1; lz++) {
      for (let lx = lx0; lx <= lx1; lx++) {
        const col = lz * CHUNK_SIZE + lx;
        let topSolid = Y_MIN;
        let topMat = chunk.topMaterials[col];
        for (let y = Y_MAX - 1; y >= Y_MIN; y--) {
          const m = chunk.data[localIndex(lx, yToIndex(y), lz)];
          if (isSolid(m)) {
            topSolid = y;
            topMat = m;
            break;
          }
        }
        const expectedHeight = topSolid - Y_MIN;
        if (chunk.heights[col] !== expectedHeight) {
          out.push({ x: ox + lx, z: oz + lz, field: "height", expected: expectedHeight, actual: chunk.heights[col] });
        }
        if (chunk.topMaterials[col] !== topMat) {
          out.push({ x: ox + lx, z: oz + lz, field: "material", expected: topMat, actual: chunk.topMaterials[col] });
        }
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
function editsOutsideEnvelope(world, envelope) {
  const out = [];
  for (const [key, edits] of world.edits) {
    const [cx, cz] = key.split(",").map(Number);
    const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
    for (const [index, material] of edits) {
      const lx = index % CHUNK_SIZE;
      const lz = Math.floor(index % CHUNK_AREA / CHUNK_SIZE);
      const yi = Math.floor(index / CHUNK_AREA);
      const x = ox + lx, z = oz + lz, y = Y_MIN + yi;
      if (!envelopeContains(envelope, x, y, z)) {
        out.push({ chunk: key, index, x, y, z, material });
      }
    }
  }
  out.sort((a, b) => a.chunk.localeCompare(b.chunk) || a.index - b.index);
  return out;
}
function chunkKeys(world) {
  return [...world.chunks.keys()].sort();
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
function createM002Fixture(seed = M002_SEED) {
  const world = createWorld(seed);
  const { cx0, cz0, cx1, cz1 } = M002_LAYOUT.fixtureChunks;
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) generateChunk(world, cx, cz);
  }
  placeAuthoredSites(world);
  return { world, layout: M002_LAYOUT, chunkKeys: chunkKeys(world) };
}

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
function emptySite() {
  return { preparation: null, structure: null };
}
function describeFailure(result) {
  return `${result.code}: ${result.reasons.join("; ")}`;
}
function runM002Scenario(m002, options = {}) {
  const { world, layout } = m002;
  const starter = options.inventory ?? M002_STARTER_INVENTORY;
  world.inventory = {};
  for (const [resource, amount] of Object.entries(starter)) {
    if ((amount ?? 0) > 0) world.inventory[resource] = amount;
  }
  const prepAuthorizer2 = new LocalAuthorizer({ envelope: layout.envelope });
  const structureAuthorizer2 = new LocalStructureAuthorizer({ envelope: layout.envelope });
  const inventoryBefore = inventorySnapshot(world);
  const errors = [];
  const house = emptySite();
  const path = emptySite();
  const farm = emptySite();
  const housePrep = prepareSite(world, prepAuthorizer2, {
    siteId: layout.house.id,
    rect: layout.house.rect,
    floorY: layout.house.floorY,
    rules: HOUSE_RULES
  });
  if (!housePrep.ok) {
    errors.push(`house preparation: ${describeFailure(housePrep)}`);
  } else {
    house.preparation = housePrep.ledger;
    const houseBuild = buildStructure(world, structureAuthorizer2, {
      siteId: layout.house.id,
      kind: "house",
      rect: layout.house.rect,
      floorY: layout.house.floorY,
      door: layout.house.door
    });
    if (!houseBuild.ok) {
      errors.push(`house structure: ${describeFailure(houseBuild)}`);
    } else {
      house.structure = houseBuild.ledger;
    }
  }
  const pathRect = m002PathRect();
  const pathPrep = prepareSite(world, prepAuthorizer2, {
    siteId: M002_PATH_SITE_ID,
    rect: pathRect,
    floorY: 12,
    rules: PATH_RULES
  }, {
    targets: m002PathTargets(),
    surfaceMaterial: MAT.GRAVEL,
    envelope: [layout.envelope[1]]
  });
  if (!pathPrep.ok) {
    errors.push(`path preparation: ${describeFailure(pathPrep)}`);
  } else {
    path.preparation = pathPrep.ledger;
    const pathBuild = buildStructure(world, structureAuthorizer2, {
      siteId: M002_PATH_SITE_ID,
      kind: "path",
      rect: pathRect,
      floorY: 12
    });
    if (!pathBuild.ok) {
      errors.push(`path structure: ${describeFailure(pathBuild)}`);
    } else {
      path.structure = pathBuild.ledger;
    }
  }
  const farmPrep = prepareSite(world, prepAuthorizer2, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  }, {
    targets: m002FarmTargets(),
    surfaceMaterial: MAT.SOIL,
    envelope: [layout.envelope[2]]
  });
  if (!farmPrep.ok) {
    errors.push(`farm preparation: ${describeFailure(farmPrep)}`);
  } else {
    farm.preparation = farmPrep.ledger;
    const farmBuild = buildStructure(world, structureAuthorizer2, {
      siteId: layout.farm.id,
      kind: "terrace",
      rect: layout.farm.rect,
      floorY: 15,
      terraces: layout.farm.terraces
    });
    if (!farmBuild.ok) {
      errors.push(`farm structure: ${describeFailure(farmBuild)}`);
    } else {
      farm.structure = farmBuild.ledger;
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    house,
    path,
    farm,
    inventoryBefore,
    inventoryAfter: inventorySnapshot(world),
    hashes: {
      voxels: canonicalRegionHash(world, layout.protectedRegion).hash,
      structures: canonicalStructureHash(world),
      inventory: canonicalInventoryHash(world),
      entities: canonicalEntityHash(world, layout.protectedRegion)
    }
  };
}
function m002StructureCosts(result) {
  const total = {};
  for (const site of [result.house, result.path, result.farm]) {
    for (const [resource, amount] of Object.entries(site.structure?.costPaid ?? {})) {
      total[resource] = (total[resource] ?? 0) + (amount ?? 0);
    }
  }
  return total;
}

// tests/m002.structures.test.ts
function fixture() {
  const m = createM002Fixture();
  m.world.inventory = { ...M002_STARTER_INVENTORY };
  return m;
}
function prepAuthorizer() {
  return new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
}
function structureAuthorizer() {
  return new LocalStructureAuthorizer({ envelope: M002_LAYOUT.envelope });
}
function fingerprint(world) {
  return {
    revision: world.revision,
    voxels: canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash,
    structures: canonicalStructureHash(world),
    inventory: canonicalInventoryHash(world),
    entities: canonicalEntityHash(world, M002_LAYOUT.protectedRegion)
  };
}
function prepareHouse(m) {
  const result = prepareSite(m.world, prepAuthorizer(), {
    siteId: m.layout.house.id,
    rect: m.layout.house.rect,
    floorY: m.layout.house.floorY,
    rules: HOUSE_RULES
  });
  assert.equal(result.ok, true, result.ok ? "" : result.reasons.join("; "));
  if (!result.ok) throw new Error("house preparation failed");
  return result;
}
function preparePath(m, gravel) {
  const result = prepareSite(m.world, prepAuthorizer(), {
    siteId: M002_PATH_SITE_ID,
    rect: m002PathRect(),
    floorY: 12,
    rules: PATH_RULES
  }, {
    targets: m002PathTargets(),
    surfaceMaterial: gravel ? MAT.GRAVEL : void 0,
    envelope: [m.layout.envelope[1]]
  });
  assert.equal(result.ok, true, result.ok ? "" : result.reasons.join("; "));
  if (!result.ok) throw new Error("path preparation failed");
  return result;
}
function prepareFarm(m, soil) {
  const result = prepareSite(m.world, prepAuthorizer(), {
    siteId: m.layout.farm.id,
    rect: m.layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  }, {
    targets: m002FarmTargets(),
    surfaceMaterial: soil ? MAT.SOIL : void 0,
    envelope: [m.layout.envelope[2]]
  });
  assert.equal(result.ok, true, result.ok ? "" : result.reasons.join("; "));
  if (!result.ok) throw new Error("farm preparation failed");
  return result;
}
function houseProposal(m) {
  return {
    siteId: m.layout.house.id,
    kind: "house",
    rect: m.layout.house.rect,
    floorY: m.layout.house.floorY,
    door: m.layout.house.door
  };
}
function pathProposal(m) {
  return {
    siteId: M002_PATH_SITE_ID,
    kind: "path",
    rect: m002PathRect(),
    floorY: 12
  };
}
function farmProposal(m) {
  return {
    siteId: m.layout.farm.id,
    kind: "terrace",
    rect: m.layout.farm.rect,
    floorY: 15,
    terraces: m.layout.farm.terraces
  };
}
test("structure plans refuse unprepared ground and wrong surface materials", () => {
  const m = fixture();
  const before = fingerprint(m.world);
  const rawHouse = planStructure(m.world, houseProposal(m));
  assert.equal(rawHouse.ok, false);
  if (!rawHouse.ok) {
    assert.equal(rawHouse.stage, "plan");
    assert.equal(rawHouse.code, "site_not_prepared");
    assert.ok(rawHouse.reasons.length >= 1);
  }
  const rawFarm = planStructure(m.world, farmProposal(m));
  assert.equal(rawFarm.ok, false);
  if (!rawFarm.ok) {
    assert.equal(rawFarm.code, "terrace_earthwork");
    assert.ok(rawFarm.reasons[0].includes("cut 108"));
  }
  assert.deepEqual(fingerprint(m.world), before);
  assert.equal(m.world.structures.size, 0);
  const pathPrep = preparePath(m, false);
  assert.equal(pathPrep.ledger.cutVolume, 13);
  assert.equal(pathPrep.ledger.surfaceEdits, 0);
  const grassPath = planStructure(m.world, pathProposal(m));
  assert.equal(grassPath.ok, false);
  if (!grassPath.ok) {
    assert.equal(grassPath.code, "path_surface");
    assert.ok(grassPath.reasons[0].includes("expected gravel"));
  }
  const farmPrep = prepareFarm(m, false);
  assert.equal(farmPrep.ledger.cutVolume, 40);
  assert.equal(farmPrep.ledger.fillVolume, 33);
  assert.equal(farmPrep.ledger.surfaceEdits, 0);
  const grassFarm = planStructure(m.world, farmProposal(m));
  assert.equal(grassFarm.ok, false);
  if (!grassFarm.ok) {
    assert.equal(grassFarm.code, "terrace_surface");
    assert.ok(grassFarm.reasons[0].includes("expected soil"));
  }
  assert.equal(canonicalStructureHash(m.world), before.structures);
  assert.equal(m.world.structures.size, 0);
});
test("house build pays its exact cost and changes no terrain voxels", () => {
  const m = fixture();
  const prep2 = prepareHouse(m);
  assert.equal(prep2.ledger.cutVolume, 3);
  assert.equal(prep2.ledger.fillVolume, 18);
  assert.equal(prep2.ledger.voxelEdits, 21);
  const world = m.world;
  const before = fingerprint(world);
  const planned = planStructure(world, houseProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;
  assert.equal(plan.modules.length, 17);
  assert.deepEqual(plan.cost, { wood: 10, stone: 18 });
  assert.deepEqual(plan.origin, { x: -56, y: 11, z: -43 });
  assert.equal(plan.surface.length, 48);
  assert.equal(plan.modules.filter((mod) => mod.kind === "floor").length, 1);
  assert.equal(plan.modules.filter((mod) => mod.kind === "roof").length, 1);
  assert.equal(plan.modules.filter((mod) => mod.kind === "door").length, 2);
  assert.equal(plan.modules.filter((mod) => mod.kind === "window").length, 2);
  const decision = structureAuthorizer().authorize(world, plan);
  assert.equal(decision.ok, true, decision.reasons.join("; "));
  if (!decision.ok || !decision.authorization) return;
  assert.equal(decision.authorization.authority, "local-stub");
  assert.equal(decision.authorization.enforcement, "local-simulation-only");
  assert.equal(decision.authorization.planDigest, structureDigest(plan));
  const result = executeStructure(world, plan, decision.authorization);
  assert.equal(result.ok, true, result.ok ? "" : result.reasons.join("; "));
  if (!result.ok) return;
  const { ledger } = result;
  assert.equal(ledger.kind, "house");
  assert.equal(ledger.moduleCount, 17);
  assert.deepEqual(ledger.costPaid, { wood: 10, stone: 18 });
  assert.deepEqual(ledger.inventoryBefore, { stone: 48, wood: 24 });
  assert.deepEqual(ledger.inventoryAfter, { stone: 30, wood: 14 });
  assert.equal(ledger.revisionAfter, ledger.revisionBefore + 1);
  const after = fingerprint(world);
  assert.equal(after.voxels, before.voxels, "structure build must not edit voxels");
  assert.equal(after.entities, before.entities);
  assert.notEqual(after.inventory, before.inventory);
  assert.notEqual(after.structures, before.structures);
  assert.equal(world.structures.size, 1);
  const stored = world.structures.get(plan.id);
  assert.ok(stored);
  assert.equal(stored.kind, "house");
  assert.equal(stored.modules.length, 17);
  assert.equal(stored.builtRevision, world.revision);
  assert.equal(stored.provisional, true);
  const replay = buildStructure(world, structureAuthorizer(), houseProposal(m));
  assert.equal(replay.ok, false);
  if (!replay.ok) {
    assert.equal(replay.code, "unauthorized_structure");
    assert.ok(replay.reasons.some((r) => r.includes("already exists")));
  }
  assert.deepEqual(fingerprint(world), after);
});
test("path preparation uses its exact envelope and requires a gravel top", () => {
  const m = fixture();
  const world = m.world;
  assert.deepEqual(m002PathRect(), { x0: -53, z0: -44, x1: -45, z1: -42 });
  const implicit = prepareSite(world, prepAuthorizer(), {
    siteId: M002_PATH_SITE_ID,
    rect: m002PathRect(),
    floorY: 12,
    rules: PATH_RULES
  }, { targets: m002PathTargets(), surfaceMaterial: MAT.GRAVEL });
  assert.equal(implicit.ok, false);
  if (!implicit.ok) {
    assert.equal(implicit.stage, "authorize");
    assert.equal(implicit.code, "not_authorized");
    assert.ok(implicit.reasons.some((r) => r.includes("outside the local policy")));
  }
  prepareHouse(m);
  const outsideBefore = canonicalRegionHash(
    world,
    M002_LAYOUT.protectedRegion,
    [M002_LAYOUT.envelope[1]]
  ).hash;
  const prep2 = preparePath(m, true);
  assert.equal(prep2.plan.envelope.length, 1);
  assert.deepEqual(prep2.plan.envelope[0], M002_LAYOUT.envelope[1]);
  assert.equal(prep2.ledger.cutVolume, 12);
  assert.equal(prep2.ledger.fillVolume, 0);
  assert.equal(prep2.ledger.voxelEdits, 39);
  assert.equal(prep2.ledger.surfaceEdits, 27);
  assert.deepEqual(prep2.ledger.resourcesGained, {});
  for (let i = 0; i < M002_PATH_PROFILE.length; i++) {
    for (let z = -44; z <= -42; z++) {
      const x = -53 + i;
      assert.equal(surfaceAt(world, x, z), M002_PATH_PROFILE[i], `column ${x},${z}`);
      assert.equal(topMaterialAtWorld(world, x, z), MAT.GRAVEL, `top ${x},${z}`);
    }
  }
  assert.equal(
    canonicalRegionHash(world, M002_LAYOUT.protectedRegion, [M002_LAYOUT.envelope[1]]).hash,
    outsideBefore,
    "path preparation must stay inside its exact envelope"
  );
  const planned = planStructure(world, pathProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;
  assert.equal(plan.modules.length, 27);
  assert.deepEqual(plan.cost, { stone: 9 });
  const pathModules = plan.modules.filter((mod) => mod.kind === "path");
  assert.equal(pathModules.length, 9);
  assert.deepEqual(pathModules.map((mod) => mod.y), [...M002_PATH_PROFILE]);
  for (let i = 1; i < pathModules.length; i++) {
    assert.ok(Math.abs(pathModules[i].y - pathModules[i - 1].y) <= 1);
  }
  assert.equal(plan.modules.filter((mod) => mod.kind === "curb").length, 18);
  const beforeBuild = fingerprint(world);
  const built = buildStructure(world, structureAuthorizer(), pathProposal(m));
  assert.equal(built.ok, true, built.ok ? "" : built.reasons.join("; "));
  if (!built.ok) return;
  assert.equal(built.ledger.moduleCount, 27);
  assert.deepEqual(built.ledger.costPaid, { stone: 9 });
  assert.equal(built.ledger.inventoryBefore.stone, 48);
  assert.equal(built.ledger.inventoryAfter.stone, 39);
  const afterBuild = fingerprint(world);
  assert.equal(afterBuild.voxels, beforeBuild.voxels);
  assert.equal(afterBuild.entities, beforeBuild.entities);
  assert.notEqual(afterBuild.inventory, beforeBuild.inventory);
  assert.equal(world.structures.get(plan.id)?.kind, "path");
  assert.deepEqual(editsOutsideEnvelope(world, M002_LAYOUT.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, M002_LAYOUT.protectedRegion), []);
});
test("terraces plan from pinned bands, require soil, and pay exact costs", () => {
  const m = fixture();
  const world = m.world;
  const outsideBefore = canonicalRegionHash(
    world,
    M002_LAYOUT.protectedRegion,
    [M002_LAYOUT.envelope[2]]
  ).hash;
  const prep2 = prepareFarm(m, true);
  assert.equal(prep2.ledger.cutVolume, 40);
  assert.equal(prep2.ledger.fillVolume, 33);
  assert.equal(prep2.ledger.voxelEdits, 107);
  assert.equal(prep2.ledger.surfaceEdits, 34);
  assert.deepEqual(prep2.ledger.entitiesCleared.map((e) => e.entityId), [
    "hero:styl_ore:-38:-42",
    "hero:styl_tree_blossom:-28:-38"
  ]);
  assert.deepEqual(prep2.ledger.resourcesGained, { ore: 8, wood: 12 });
  assert.deepEqual(prep2.ledger.inventoryAfter, { ore: 8, stone: 48, wood: 36 });
  assert.equal(
    canonicalRegionHash(world, M002_LAYOUT.protectedRegion, [M002_LAYOUT.envelope[2]]).hash,
    outsideBefore,
    "farm preparation must stay inside its exact envelope"
  );
  for (const band of M002_TERRACE_BANDS) {
    for (let z = band.z0; z <= band.z1; z++) {
      for (let x = m.layout.farm.rect.x0; x <= m.layout.farm.rect.x1; x++) {
        assert.equal(surfaceAt(world, x, z), band.y, `column ${x},${z}`);
        assert.equal(topMaterialAtWorld(world, x, z), MAT.SOIL, `top ${x},${z}`);
      }
    }
  }
  const planned = planStructure(world, farmProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;
  assert.equal(plan.modules.length, 14);
  assert.deepEqual(plan.cost, { wood: 6, stone: 12 });
  assert.deepEqual(plan.terraces, M002_TERRACE_BANDS);
  assert.deepEqual(plan.envelope, [
    { x0: -39, z0: -43, x1: -26, z1: -34, y0: 13, y1: 18 }
  ]);
  const beds = plan.modules.filter((mod) => mod.kind === "soil_bed");
  const rows = plan.modules.filter((mod) => mod.kind === "crop_row");
  const walls = plan.modules.filter((mod) => mod.kind === "retaining_wall");
  assert.equal(beds.length, 3);
  assert.equal(rows.length, 9);
  assert.equal(walls.length, 2);
  assert.deepEqual(beds.map((mod) => mod.y), [16, 15, 14]);
  for (const row of rows) {
    assert.ok([16.18, 15.18, 14.18].includes(row.y));
  }
  for (const wall of walls) {
    assert.equal(wall.h, 1);
  }
  const beforeBuild = fingerprint(world);
  const built = buildStructure(world, structureAuthorizer(), farmProposal(m));
  assert.equal(built.ok, true, built.ok ? "" : built.reasons.join("; "));
  if (!built.ok) return;
  assert.equal(built.ledger.moduleCount, 14);
  assert.deepEqual(built.ledger.costPaid, { wood: 6, stone: 12 });
  assert.deepEqual(built.ledger.inventoryBefore, { ore: 8, stone: 48, wood: 36 });
  assert.deepEqual(built.ledger.inventoryAfter, { ore: 8, stone: 36, wood: 30 });
  const afterBuild = fingerprint(world);
  assert.equal(afterBuild.voxels, beforeBuild.voxels);
  assert.notEqual(afterBuild.inventory, beforeBuild.inventory);
  assert.equal(world.structures.get(plan.id)?.kind, "terrace");
  assert.deepEqual(editsOutsideEnvelope(world, M002_LAYOUT.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, M002_LAYOUT.protectedRegion), []);
});
test("structure authorization rejects forged, stale, poor and out-of-envelope work", () => {
  const m = fixture();
  prepareHouse(m);
  const world = m.world;
  const planned = planStructure(world, houseProposal(m));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const plan = planned.plan;
  const decision = structureAuthorizer().authorize(world, plan);
  assert.equal(decision.ok, true);
  if (!decision.ok || !decision.authorization) return;
  const token = decision.authorization;
  const before = fingerprint(world);
  const forgedDigest = executeStructure(world, plan, {
    ...token,
    planDigest: "0000000000000000"
  });
  assert.equal(forgedDigest.ok, false);
  if (!forgedDigest.ok) assert.equal(forgedDigest.code, "digest_mismatch");
  const forgedAuthority = executeStructure(world, plan, {
    ...token,
    authority: "magicblock"
  });
  assert.equal(forgedAuthority.ok, false);
  if (!forgedAuthority.ok) assert.equal(forgedAuthority.code, "unsupported_authority");
  const narrowed = executeStructure(world, plan, {
    ...token,
    envelope: [{ ...token.envelope[0], x0: token.envelope[0].x0 + 1 }]
  });
  assert.equal(narrowed.ok, false);
  if (!narrowed.ok) assert.equal(narrowed.code, "envelope_mismatch");
  const limitedModules = new LocalStructureAuthorizer(
    { envelope: M002_LAYOUT.envelope },
    { maxModules: 10 }
  ).authorize(world, plan);
  assert.equal(limitedModules.ok, false);
  assert.ok(limitedModules.reasons.some((r) => r.includes("17 modules exceed limit 10")));
  const limitedCost = new LocalStructureAuthorizer(
    { envelope: M002_LAYOUT.envelope },
    { maxCost: 10 }
  ).authorize(world, plan);
  assert.equal(limitedCost.ok, false);
  assert.ok(limitedCost.reasons.some((r) => r.includes("cost 28 exceeds limit 10")));
  const forged = {
    ...plan,
    modules: plan.modules.map((mod, i) => i === 0 ? { ...mod, x: mod.x + 20 } : mod)
  };
  forged.id = `structure:${structureDigest(forged)}`;
  const outside = structureAuthorizer().authorize(world, forged);
  assert.equal(outside.ok, false);
  assert.ok(outside.reasons.some((r) => r.includes("outside the plan envelope") || r.includes("outside the local policy")));
  const forgedExecution = executeStructure(world, forged, {
    ...token,
    planDigest: structureDigest(forged)
  });
  assert.equal(forgedExecution.ok, false);
  if (!forgedExecution.ok) {
    assert.equal(forgedExecution.code, "unauthorized_structure");
    assert.ok(forgedExecution.reasons.some((r) => r.includes("outside the authorized envelope")));
  }
  assert.deepEqual(fingerprint(world), before);
  assert.equal(setVoxel(world, -56, 11, -43, MAT.STONE), true);
  const afterManualEdit = fingerprint(world);
  const stale = executeStructure(world, plan, token);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "stale_authorization");
  assert.deepEqual(fingerprint(world), afterManualEdit);
});
test("executor re-checks surface and obstructions before charging resources", () => {
  const m = fixture();
  prepareHouse(m);
  const world = m.world;
  const surfacePlan = planStructure(world, houseProposal(m));
  assert.equal(surfacePlan.ok, true);
  if (!surfacePlan.ok) return;
  const raised = {
    ...surfacePlan.plan,
    surface: surfacePlan.plan.surface.map((s, i) => i === 0 ? { ...s, y: s.y + 1 } : s)
  };
  raised.id = `structure:${structureDigest(raised)}`;
  const raisedToken = structureAuthorizer().authorize(world, raised);
  assert.equal(raisedToken.ok, true);
  if (!raisedToken.ok || !raisedToken.authorization) return;
  const beforeRaised = fingerprint(world);
  const onRaised = executeStructure(world, raised, raisedToken.authorization);
  assert.equal(onRaised.ok, false);
  if (!onRaised.ok) {
    assert.equal(onRaised.code, "unauthorized_structure");
    assert.ok(onRaised.reasons.some((r) => r.includes("expected 12")));
  }
  assert.deepEqual(fingerprint(world), beforeRaised);
  const blocked = fixture();
  prepareHouse(blocked);
  const planned = planStructure(blocked.world, houseProposal(blocked));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const token = structureAuthorizer().authorize(blocked.world, planned.plan);
  assert.equal(token.ok, true);
  if (!token.ok || !token.authorization) return;
  const extra = {
    id: "test:house-rock",
    kind: "styl_ore",
    chunk: "30,30",
    x: -56.5,
    y: 11,
    z: -43.5,
    rot: 0,
    scale: 1,
    variant: 0,
    resource: "ore",
    remaining: 2,
    yieldPerHarvest: 1,
    harvested: false,
    provisional: false,
    authored: false
  };
  blocked.world.entities.set(extra.id, extra);
  blocked.world.entityChunks.get("30,30").push(extra.id);
  const beforeBlocked = fingerprint(blocked.world);
  const onBlocked = executeStructure(blocked.world, planned.plan, token.authorization);
  assert.equal(onBlocked.ok, false);
  if (!onBlocked.ok) {
    assert.equal(onBlocked.code, "unauthorized_structure");
    assert.ok(onBlocked.reasons.some((r) => r.includes("footprint has 1 obstructions")));
  }
  assert.deepEqual(fingerprint(blocked.world), beforeBlocked);
});
test("the pinned M002 scenario is deterministic and leaves outside terrain alone", () => {
  const a = createM002Fixture();
  const b = createM002Fixture();
  const ra = runM002Scenario(a);
  const rb = runM002Scenario(b);
  assert.equal(ra.ok, true, ra.errors.join("; "));
  assert.equal(rb.ok, true, rb.errors.join("; "));
  assert.deepEqual(ra.errors, []);
  assert.deepEqual(ra.house.preparation, rb.house.preparation);
  assert.deepEqual(ra.path.preparation, rb.path.preparation);
  assert.deepEqual(ra.farm.preparation, rb.farm.preparation);
  assert.deepEqual(ra.house.structure, rb.house.structure);
  assert.deepEqual(ra.path.structure, rb.path.structure);
  assert.deepEqual(ra.farm.structure, rb.farm.structure);
  assert.equal(ra.house.preparation?.cutVolume, 3);
  assert.equal(ra.house.preparation?.fillVolume, 18);
  assert.equal(ra.house.preparation?.voxelEdits, 21);
  assert.equal(ra.path.preparation?.cutVolume, 12);
  assert.equal(ra.path.preparation?.fillVolume, 0);
  assert.equal(ra.path.preparation?.voxelEdits, 39);
  assert.equal(ra.path.preparation?.surfaceEdits, 27);
  assert.equal(ra.farm.preparation?.cutVolume, 40);
  assert.equal(ra.farm.preparation?.fillVolume, 33);
  assert.equal(ra.farm.preparation?.voxelEdits, 107);
  assert.equal(ra.farm.preparation?.surfaceEdits, 34);
  assert.equal(ra.house.structure?.moduleCount, 17);
  assert.equal(ra.path.structure?.moduleCount, 27);
  assert.equal(ra.farm.structure?.moduleCount, 14);
  assert.deepEqual(ra.house.structure?.costPaid, { wood: 10, stone: 18 });
  assert.deepEqual(ra.path.structure?.costPaid, { stone: 9 });
  assert.deepEqual(ra.farm.structure?.costPaid, { wood: 6, stone: 12 });
  assert.deepEqual(m002StructureCosts(ra), { wood: 16, stone: 39 });
  assert.deepEqual(ra.inventoryBefore, { stone: 48, wood: 24 });
  assert.deepEqual(ra.inventoryAfter, { ore: 8, stone: 9, wood: 20 });
  assert.equal(a.world.structures.size, 3);
  assert.deepEqual([...a.world.structures.keys()], [
    "structure:7f2ab549e46d8ddb",
    "structure:0e68d6af974d7a55",
    "structure:8c4a68c0e8536323"
  ]);
  const housePrep = ra.house.preparation;
  const houseBuild = ra.house.structure;
  const pathPrep = ra.path.preparation;
  const pathBuild = ra.path.structure;
  const farmPrep = ra.farm.preparation;
  const farmBuild = ra.farm.structure;
  assert.equal(housePrep.revisionAfter - housePrep.revisionBefore, 21);
  assert.equal(houseBuild.revisionAfter - houseBuild.revisionBefore, 1);
  assert.equal(pathPrep.revisionAfter - pathPrep.revisionBefore, 39);
  assert.equal(pathBuild.revisionAfter - pathBuild.revisionBefore, 1);
  assert.equal(farmPrep.revisionAfter - farmPrep.revisionBefore, 109);
  assert.equal(farmBuild.revisionAfter - farmBuild.revisionBefore, 1);
  assert.equal(
    a.world.revision - housePrep.revisionBefore,
    172,
    "21 + 1 + 39 + 1 + 109 + 1 revision steps"
  );
  assert.deepEqual(ra.hashes, rb.hashes);
  assert.equal(
    canonicalRegionHash(a.world, a.layout.protectedRegion).hash,
    canonicalRegionHash(b.world, b.layout.protectedRegion).hash
  );
  assert.equal(
    canonicalEntityHash(a.world, a.layout.protectedRegion),
    canonicalEntityHash(b.world, b.layout.protectedRegion)
  );
  assert.equal(canonicalInventoryHash(a.world), canonicalInventoryHash(b.world));
  assert.deepEqual(editsOutsideEnvelope(a.world, a.layout.envelope), []);
  assert.deepEqual(checkDerivedCaches(a.world, a.layout.protectedRegion), []);
  assert.equal(surfaceAt(a.world, -56, -43), 11);
  assert.equal(topMaterialAtWorld(a.world, -49, -43), MAT.GRAVEL);
  assert.equal(surfaceAt(a.world, -32, -41), 16);
  assert.equal(surfaceAt(a.world, -32, -38), 15);
  assert.equal(surfaceAt(a.world, -32, -36), 14);
  assert.equal(topMaterialAtWorld(a.world, -32, -36), MAT.SOIL);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMi5zdHJ1Y3R1cmVzLnRlc3QudHMiLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3NpbS9jb25zdHJ1Y3Rpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9wcmVwYXJhdGlvbi50cyIsICIuLi8uLi9zcmMvc2ltL3N0cnVjdHVyZXMudHMiLCAiLi4vLi4vc3JjL3NpbS9jYW5vbmljYWwudHMiLCAiLi4vLi4vc3JjL3NpbS9tMDAyLnRzIiwgIi4uLy4uL3NyYy9zaW0vc2NlbmFyaW8udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIE0wMDIgc3RhZ2UgNCBnYXRlOiBhdXRob3JpdGF0aXZlIGhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlIHN0cnVjdHVyZXMuXG4vL1xuLy8gVGhlc2UgdGVzdHMgcGluIHRoZSBzdHJ1Y3R1cmUgcGxhbnMsIHRoZWlyIGV4YWN0IHJlc291cmNlIGNvc3RzLCB0aGVcbi8vIG1hdGVyaWFsIHJlYWRpbmVzcyBvZiBwcmVwYXJlZCBncm91bmQsIHRoZSBsb2NhbCBhdXRob3JpemVyJ3MgcmVmdXNhbCBwYXRocyxcbi8vIGFuZCB0aGUgZmFjdCB0aGF0IGJ1aWxkaW5nIGEgc3RydWN0dXJlIG5ldmVyIG11dGF0ZXMgdGVycmFpbiB2b3hlbHMuXG5pbXBvcnQgdGVzdCBmcm9tICdub2RlOnRlc3QnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdub2RlOmFzc2VydC9zdHJpY3QnO1xuaW1wb3J0IHtcbiAgTUFULCBzdXJmYWNlQXQsIHRvcE1hdGVyaWFsQXRXb3JsZCwgc2V0Vm94ZWwsXG59IGZyb20gJy4uL3NyYy9zaW0vd29ybGQnO1xuaW1wb3J0IHtcbiAgY2Fub25pY2FsUmVnaW9uSGFzaCwgY2Fub25pY2FsRW50aXR5SGFzaCwgY2Fub25pY2FsSW52ZW50b3J5SGFzaCxcbiAgY2Fub25pY2FsU3RydWN0dXJlSGFzaCwgY2hlY2tEZXJpdmVkQ2FjaGVzLCBlZGl0c091dHNpZGVFbnZlbG9wZSxcbn0gZnJvbSAnLi4vc3JjL3NpbS9jYW5vbmljYWwnO1xuaW1wb3J0IHtcbiAgY3JlYXRlTTAwMkZpeHR1cmUsIE0wMDJfTEFZT1VULCBNMDAyX1BBVEhfUFJPRklMRSwgTTAwMl9QQVRIX1NJVEVfSUQsXG4gIE0wMDJfVEVSUkFDRV9CQU5EUyxcbn0gZnJvbSAnLi4vc3JjL3NpbS9tMDAyJztcbmltcG9ydCB7IEhPVVNFX1JVTEVTLCBQQVRIX1JVTEVTLCBGQVJNX1JVTEVTIH0gZnJvbSAnLi4vc3JjL3NpbS9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHsgcHJlcGFyZVNpdGUsIExvY2FsQXV0aG9yaXplciB9IGZyb20gJy4uL3NyYy9zaW0vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHtcbiAgcGxhblN0cnVjdHVyZSwgYnVpbGRTdHJ1Y3R1cmUsIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgc3RydWN0dXJlRGlnZXN0LFxuICBleGVjdXRlU3RydWN0dXJlLCBTdHJ1Y3R1cmVQbGFuLFxufSBmcm9tICcuLi9zcmMvc2ltL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHtcbiAgcnVuTTAwMlNjZW5hcmlvLCBtMDAyUGF0aFJlY3QsIG0wMDJQYXRoVGFyZ2V0cywgbTAwMkZhcm1UYXJnZXRzLFxuICBNMDAyX1NUQVJURVJfSU5WRU5UT1JZLCBtMDAyU3RydWN0dXJlQ29zdHMsXG59IGZyb20gJy4uL3NyYy9zaW0vc2NlbmFyaW8nO1xuXG50eXBlIE0wMDIgPSBSZXR1cm5UeXBlPHR5cGVvZiBjcmVhdGVNMDAyRml4dHVyZT47XG50eXBlIFdvcmxkID0gTTAwMlsnd29ybGQnXTtcblxuZnVuY3Rpb24gZml4dHVyZSgpOiBNMDAyIHtcbiAgY29uc3QgbSA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG4gIG0ud29ybGQuaW52ZW50b3J5ID0geyAuLi5NMDAyX1NUQVJURVJfSU5WRU5UT1JZIH07XG4gIHJldHVybiBtO1xufVxuXG5mdW5jdGlvbiBwcmVwQXV0aG9yaXplcigpIHtcbiAgcmV0dXJuIG5ldyBMb2NhbEF1dGhvcml6ZXIoeyBlbnZlbG9wZTogTTAwMl9MQVlPVVQuZW52ZWxvcGUgfSk7XG59XG5cbmZ1bmN0aW9uIHN0cnVjdHVyZUF1dGhvcml6ZXIoKSB7XG4gIHJldHVybiBuZXcgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pO1xufVxuXG5mdW5jdGlvbiBmaW5nZXJwcmludCh3b3JsZDogV29ybGQpIHtcbiAgcmV0dXJuIHtcbiAgICByZXZpc2lvbjogd29ybGQucmV2aXNpb24sXG4gICAgdm94ZWxzOiBjYW5vbmljYWxSZWdpb25IYXNoKHdvcmxkLCBNMDAyX0xBWU9VVC5wcm90ZWN0ZWRSZWdpb24pLmhhc2gsXG4gICAgc3RydWN0dXJlczogY2Fub25pY2FsU3RydWN0dXJlSGFzaCh3b3JsZCksXG4gICAgaW52ZW50b3J5OiBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKHdvcmxkKSxcbiAgICBlbnRpdGllczogY2Fub25pY2FsRW50aXR5SGFzaCh3b3JsZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gcHJlcGFyZUhvdXNlKG06IE0wMDIpIHtcbiAgY29uc3QgcmVzdWx0ID0gcHJlcGFyZVNpdGUobS53b3JsZCwgcHJlcEF1dGhvcml6ZXIoKSwge1xuICAgIHNpdGVJZDogbS5sYXlvdXQuaG91c2UuaWQsXG4gICAgcmVjdDogbS5sYXlvdXQuaG91c2UucmVjdCxcbiAgICBmbG9vclk6IG0ubGF5b3V0LmhvdXNlLmZsb29yWSxcbiAgICBydWxlczogSE9VU0VfUlVMRVMsXG4gIH0pO1xuICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCB0cnVlLCByZXN1bHQub2sgPyAnJyA6IHJlc3VsdC5yZWFzb25zLmpvaW4oJzsgJykpO1xuICBpZiAoIXJlc3VsdC5vaykgdGhyb3cgbmV3IEVycm9yKCdob3VzZSBwcmVwYXJhdGlvbiBmYWlsZWQnKTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gcHJlcGFyZVBhdGgobTogTTAwMiwgZ3JhdmVsOiBib29sZWFuKSB7XG4gIGNvbnN0IHJlc3VsdCA9IHByZXBhcmVTaXRlKG0ud29ybGQsIHByZXBBdXRob3JpemVyKCksIHtcbiAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgIHJlY3Q6IG0wMDJQYXRoUmVjdCgpLFxuICAgIGZsb29yWTogMTIsXG4gICAgcnVsZXM6IFBBVEhfUlVMRVMsXG4gIH0sIHtcbiAgICB0YXJnZXRzOiBtMDAyUGF0aFRhcmdldHMoKSxcbiAgICBzdXJmYWNlTWF0ZXJpYWw6IGdyYXZlbCA/IE1BVC5HUkFWRUwgOiB1bmRlZmluZWQsXG4gICAgZW52ZWxvcGU6IFttLmxheW91dC5lbnZlbG9wZVsxXV0sXG4gIH0pO1xuICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCB0cnVlLCByZXN1bHQub2sgPyAnJyA6IHJlc3VsdC5yZWFzb25zLmpvaW4oJzsgJykpO1xuICBpZiAoIXJlc3VsdC5vaykgdGhyb3cgbmV3IEVycm9yKCdwYXRoIHByZXBhcmF0aW9uIGZhaWxlZCcpO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBwcmVwYXJlRmFybShtOiBNMDAyLCBzb2lsOiBib29sZWFuKSB7XG4gIGNvbnN0IHJlc3VsdCA9IHByZXBhcmVTaXRlKG0ud29ybGQsIHByZXBBdXRob3JpemVyKCksIHtcbiAgICBzaXRlSWQ6IG0ubGF5b3V0LmZhcm0uaWQsXG4gICAgcmVjdDogbS5sYXlvdXQuZmFybS5yZWN0LFxuICAgIGZsb29yWTogMTUsXG4gICAgcnVsZXM6IEZBUk1fUlVMRVMsXG4gIH0sIHtcbiAgICB0YXJnZXRzOiBtMDAyRmFybVRhcmdldHMoKSxcbiAgICBzdXJmYWNlTWF0ZXJpYWw6IHNvaWwgPyBNQVQuU09JTCA6IHVuZGVmaW5lZCxcbiAgICBlbnZlbG9wZTogW20ubGF5b3V0LmVudmVsb3BlWzJdXSxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChyZXN1bHQub2ssIHRydWUsIHJlc3VsdC5vayA/ICcnIDogcmVzdWx0LnJlYXNvbnMuam9pbignOyAnKSk7XG4gIGlmICghcmVzdWx0Lm9rKSB0aHJvdyBuZXcgRXJyb3IoJ2Zhcm0gcHJlcGFyYXRpb24gZmFpbGVkJyk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGhvdXNlUHJvcG9zYWwobTogTTAwMikge1xuICByZXR1cm4ge1xuICAgIHNpdGVJZDogbS5sYXlvdXQuaG91c2UuaWQsXG4gICAga2luZDogJ2hvdXNlJyBhcyBjb25zdCxcbiAgICByZWN0OiBtLmxheW91dC5ob3VzZS5yZWN0LFxuICAgIGZsb29yWTogbS5sYXlvdXQuaG91c2UuZmxvb3JZLFxuICAgIGRvb3I6IG0ubGF5b3V0LmhvdXNlLmRvb3IsXG4gIH07XG59XG5cbmZ1bmN0aW9uIHBhdGhQcm9wb3NhbChtOiBNMDAyKSB7XG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICBraW5kOiAncGF0aCcgYXMgY29uc3QsXG4gICAgcmVjdDogbTAwMlBhdGhSZWN0KCksXG4gICAgZmxvb3JZOiAxMixcbiAgfTtcbn1cblxuZnVuY3Rpb24gZmFybVByb3Bvc2FsKG06IE0wMDIpIHtcbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IG0ubGF5b3V0LmZhcm0uaWQsXG4gICAga2luZDogJ3RlcnJhY2UnIGFzIGNvbnN0LFxuICAgIHJlY3Q6IG0ubGF5b3V0LmZhcm0ucmVjdCxcbiAgICBmbG9vclk6IDE1LFxuICAgIHRlcnJhY2VzOiBtLmxheW91dC5mYXJtLnRlcnJhY2VzLFxuICB9O1xufVxuXG50ZXN0KCdzdHJ1Y3R1cmUgcGxhbnMgcmVmdXNlIHVucHJlcGFyZWQgZ3JvdW5kIGFuZCB3cm9uZyBzdXJmYWNlIG1hdGVyaWFscycsICgpID0+IHtcbiAgY29uc3QgbSA9IGZpeHR1cmUoKTtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQobS53b3JsZCk7XG5cbiAgY29uc3QgcmF3SG91c2UgPSBwbGFuU3RydWN0dXJlKG0ud29ybGQsIGhvdXNlUHJvcG9zYWwobSkpO1xuICBhc3NlcnQuZXF1YWwocmF3SG91c2Uub2ssIGZhbHNlKTtcbiAgaWYgKCFyYXdIb3VzZS5vaykge1xuICAgIGFzc2VydC5lcXVhbChyYXdIb3VzZS5zdGFnZSwgJ3BsYW4nKTtcbiAgICBhc3NlcnQuZXF1YWwocmF3SG91c2UuY29kZSwgJ3NpdGVfbm90X3ByZXBhcmVkJyk7XG4gICAgYXNzZXJ0Lm9rKHJhd0hvdXNlLnJlYXNvbnMubGVuZ3RoID49IDEpO1xuICB9XG5cbiAgY29uc3QgcmF3RmFybSA9IHBsYW5TdHJ1Y3R1cmUobS53b3JsZCwgZmFybVByb3Bvc2FsKG0pKTtcbiAgYXNzZXJ0LmVxdWFsKHJhd0Zhcm0ub2ssIGZhbHNlKTtcbiAgaWYgKCFyYXdGYXJtLm9rKSB7XG4gICAgYXNzZXJ0LmVxdWFsKHJhd0Zhcm0uY29kZSwgJ3RlcnJhY2VfZWFydGh3b3JrJyk7XG4gICAgYXNzZXJ0Lm9rKHJhd0Zhcm0ucmVhc29uc1swXS5pbmNsdWRlcygnY3V0IDEwOCcpKTtcbiAgfVxuXG4gIC8vIFBsYW5uaW5nIGlzIHJlYWQtb25seSwgaW5jbHVkaW5nIG9uIHJlamVjdGVkIHByb3Bvc2Fscy5cbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludChtLndvcmxkKSwgYmVmb3JlKTtcbiAgYXNzZXJ0LmVxdWFsKG0ud29ybGQuc3RydWN0dXJlcy5zaXplLCAwKTtcblxuICAvLyBBIHBhdGggd2hvc2UgaGVpZ2h0cyBhcmUgcHJlcGFyZWQgYnV0IHdob3NlIHRvcCBpcyBzdGlsbCBncmFzcyBpcyBub3QgYVxuICAvLyBwYXRoLiBUaGUgbWF0ZXJpYWwgY2hlY2sgbXVzdCBiZSBleHBsaWNpdCwgbm90IGluZmVycmVkIGZyb20gaGVpZ2h0LlxuICBjb25zdCBwYXRoUHJlcCA9IHByZXBhcmVQYXRoKG0sIGZhbHNlKTtcbiAgYXNzZXJ0LmVxdWFsKHBhdGhQcmVwLmxlZGdlci5jdXRWb2x1bWUsIDEzKTtcbiAgYXNzZXJ0LmVxdWFsKHBhdGhQcmVwLmxlZGdlci5zdXJmYWNlRWRpdHMsIDApO1xuICBjb25zdCBncmFzc1BhdGggPSBwbGFuU3RydWN0dXJlKG0ud29ybGQsIHBhdGhQcm9wb3NhbChtKSk7XG4gIGFzc2VydC5lcXVhbChncmFzc1BhdGgub2ssIGZhbHNlKTtcbiAgaWYgKCFncmFzc1BhdGgub2spIHtcbiAgICBhc3NlcnQuZXF1YWwoZ3Jhc3NQYXRoLmNvZGUsICdwYXRoX3N1cmZhY2UnKTtcbiAgICBhc3NlcnQub2soZ3Jhc3NQYXRoLnJlYXNvbnNbMF0uaW5jbHVkZXMoJ2V4cGVjdGVkIGdyYXZlbCcpKTtcbiAgfVxuXG4gIC8vIFNhbWUgZm9yIHRlcnJhY2VzOiBjb3JyZWN0IGJhbmRzLCB3cm9uZyB0b3AgbWF0ZXJpYWwuXG4gIGNvbnN0IGZhcm1QcmVwID0gcHJlcGFyZUZhcm0obSwgZmFsc2UpO1xuICBhc3NlcnQuZXF1YWwoZmFybVByZXAubGVkZ2VyLmN1dFZvbHVtZSwgNDApO1xuICBhc3NlcnQuZXF1YWwoZmFybVByZXAubGVkZ2VyLmZpbGxWb2x1bWUsIDMzKTtcbiAgYXNzZXJ0LmVxdWFsKGZhcm1QcmVwLmxlZGdlci5zdXJmYWNlRWRpdHMsIDApO1xuICBjb25zdCBncmFzc0Zhcm0gPSBwbGFuU3RydWN0dXJlKG0ud29ybGQsIGZhcm1Qcm9wb3NhbChtKSk7XG4gIGFzc2VydC5lcXVhbChncmFzc0Zhcm0ub2ssIGZhbHNlKTtcbiAgaWYgKCFncmFzc0Zhcm0ub2spIHtcbiAgICBhc3NlcnQuZXF1YWwoZ3Jhc3NGYXJtLmNvZGUsICd0ZXJyYWNlX3N1cmZhY2UnKTtcbiAgICBhc3NlcnQub2soZ3Jhc3NGYXJtLnJlYXNvbnNbMF0uaW5jbHVkZXMoJ2V4cGVjdGVkIHNvaWwnKSk7XG4gIH1cblxuICBhc3NlcnQuZXF1YWwoY2Fub25pY2FsU3RydWN0dXJlSGFzaChtLndvcmxkKSwgYmVmb3JlLnN0cnVjdHVyZXMpO1xuICBhc3NlcnQuZXF1YWwobS53b3JsZC5zdHJ1Y3R1cmVzLnNpemUsIDApO1xufSk7XG5cbnRlc3QoJ2hvdXNlIGJ1aWxkIHBheXMgaXRzIGV4YWN0IGNvc3QgYW5kIGNoYW5nZXMgbm8gdGVycmFpbiB2b3hlbHMnLCAoKSA9PiB7XG4gIGNvbnN0IG0gPSBmaXh0dXJlKCk7XG4gIGNvbnN0IHByZXAgPSBwcmVwYXJlSG91c2UobSk7XG4gIGFzc2VydC5lcXVhbChwcmVwLmxlZGdlci5jdXRWb2x1bWUsIDMpO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIuZmlsbFZvbHVtZSwgMTgpO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIudm94ZWxFZGl0cywgMjEpO1xuXG4gIGNvbnN0IHdvcmxkID0gbS53b3JsZDtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBwbGFubmVkID0gcGxhblN0cnVjdHVyZSh3b3JsZCwgaG91c2VQcm9wb3NhbChtKSk7XG4gIGFzc2VydC5lcXVhbChwbGFubmVkLm9rLCB0cnVlKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm47XG4gIGNvbnN0IHBsYW4gPSBwbGFubmVkLnBsYW47XG5cbiAgYXNzZXJ0LmVxdWFsKHBsYW4ubW9kdWxlcy5sZW5ndGgsIDE3KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChwbGFuLmNvc3QsIHsgd29vZDogMTAsIHN0b25lOiAxOCB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChwbGFuLm9yaWdpbiwgeyB4OiAtNTYsIHk6IDExLCB6OiAtNDMgfSk7XG4gIGFzc2VydC5lcXVhbChwbGFuLnN1cmZhY2UubGVuZ3RoLCA0OCk7XG4gIGFzc2VydC5lcXVhbChwbGFuLm1vZHVsZXMuZmlsdGVyKChtb2QpID0+IG1vZC5raW5kID09PSAnZmxvb3InKS5sZW5ndGgsIDEpO1xuICBhc3NlcnQuZXF1YWwocGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ3Jvb2YnKS5sZW5ndGgsIDEpO1xuICBhc3NlcnQuZXF1YWwocGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ2Rvb3InKS5sZW5ndGgsIDIpO1xuICBhc3NlcnQuZXF1YWwocGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ3dpbmRvdycpLmxlbmd0aCwgMik7XG5cbiAgY29uc3QgZGVjaXNpb24gPSBzdHJ1Y3R1cmVBdXRob3JpemVyKCkuYXV0aG9yaXplKHdvcmxkLCBwbGFuKTtcbiAgYXNzZXJ0LmVxdWFsKGRlY2lzaW9uLm9rLCB0cnVlLCBkZWNpc2lvbi5yZWFzb25zLmpvaW4oJzsgJykpO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSByZXR1cm47XG4gIGFzc2VydC5lcXVhbChkZWNpc2lvbi5hdXRob3JpemF0aW9uLmF1dGhvcml0eSwgJ2xvY2FsLXN0dWInKTtcbiAgYXNzZXJ0LmVxdWFsKGRlY2lzaW9uLmF1dGhvcml6YXRpb24uZW5mb3JjZW1lbnQsICdsb2NhbC1zaW11bGF0aW9uLW9ubHknKTtcbiAgYXNzZXJ0LmVxdWFsKGRlY2lzaW9uLmF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCwgc3RydWN0dXJlRGlnZXN0KHBsYW4pKTtcblxuICBjb25zdCByZXN1bHQgPSBleGVjdXRlU3RydWN0dXJlKHdvcmxkLCBwbGFuLCBkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcbiAgYXNzZXJ0LmVxdWFsKHJlc3VsdC5vaywgdHJ1ZSwgcmVzdWx0Lm9rID8gJycgOiByZXN1bHQucmVhc29ucy5qb2luKCc7ICcpKTtcbiAgaWYgKCFyZXN1bHQub2spIHJldHVybjtcbiAgY29uc3QgeyBsZWRnZXIgfSA9IHJlc3VsdDtcblxuICBhc3NlcnQuZXF1YWwobGVkZ2VyLmtpbmQsICdob3VzZScpO1xuICBhc3NlcnQuZXF1YWwobGVkZ2VyLm1vZHVsZUNvdW50LCAxNyk7XG4gIGFzc2VydC5kZWVwRXF1YWwobGVkZ2VyLmNvc3RQYWlkLCB7IHdvb2Q6IDEwLCBzdG9uZTogMTggfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwobGVkZ2VyLmludmVudG9yeUJlZm9yZSwgeyBzdG9uZTogNDgsIHdvb2Q6IDI0IH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGxlZGdlci5pbnZlbnRvcnlBZnRlciwgeyBzdG9uZTogMzAsIHdvb2Q6IDE0IH0pO1xuICBhc3NlcnQuZXF1YWwobGVkZ2VyLnJldmlzaW9uQWZ0ZXIsIGxlZGdlci5yZXZpc2lvbkJlZm9yZSArIDEpO1xuXG4gIGNvbnN0IGFmdGVyID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIudm94ZWxzLCBiZWZvcmUudm94ZWxzLCAnc3RydWN0dXJlIGJ1aWxkIG11c3Qgbm90IGVkaXQgdm94ZWxzJyk7XG4gIGFzc2VydC5lcXVhbChhZnRlci5lbnRpdGllcywgYmVmb3JlLmVudGl0aWVzKTtcbiAgYXNzZXJ0Lm5vdEVxdWFsKGFmdGVyLmludmVudG9yeSwgYmVmb3JlLmludmVudG9yeSk7XG4gIGFzc2VydC5ub3RFcXVhbChhZnRlci5zdHJ1Y3R1cmVzLCBiZWZvcmUuc3RydWN0dXJlcyk7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5zdHJ1Y3R1cmVzLnNpemUsIDEpO1xuXG4gIGNvbnN0IHN0b3JlZCA9IHdvcmxkLnN0cnVjdHVyZXMuZ2V0KHBsYW4uaWQpO1xuICBhc3NlcnQub2soc3RvcmVkKTtcbiAgYXNzZXJ0LmVxdWFsKHN0b3JlZC5raW5kLCAnaG91c2UnKTtcbiAgYXNzZXJ0LmVxdWFsKHN0b3JlZC5tb2R1bGVzLmxlbmd0aCwgMTcpO1xuICBhc3NlcnQuZXF1YWwoc3RvcmVkLmJ1aWx0UmV2aXNpb24sIHdvcmxkLnJldmlzaW9uKTtcbiAgYXNzZXJ0LmVxdWFsKHN0b3JlZC5wcm92aXNpb25hbCwgdHJ1ZSk7XG5cbiAgLy8gQSBzZWNvbmQgYnVpbGQgcmUtcGxhbnMgdGhlIHNhbWUgaWQsIGdldHMgYSBmcmVzaCB0b2tlbiwgYW5kIGlzIHJlZnVzZWQgYnlcbiAgLy8gdGhlIGV4ZWN1dG9yIHdpdGhvdXQgY2hhcmdpbmcgYWdhaW4uXG4gIGNvbnN0IHJlcGxheSA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyKCksIGhvdXNlUHJvcG9zYWwobSkpO1xuICBhc3NlcnQuZXF1YWwocmVwbGF5Lm9rLCBmYWxzZSk7XG4gIGlmICghcmVwbGF5Lm9rKSB7XG4gICAgYXNzZXJ0LmVxdWFsKHJlcGxheS5jb2RlLCAndW5hdXRob3JpemVkX3N0cnVjdHVyZScpO1xuICAgIGFzc2VydC5vayhyZXBsYXkucmVhc29ucy5zb21lKChyKSA9PiByLmluY2x1ZGVzKCdhbHJlYWR5IGV4aXN0cycpKSk7XG4gIH1cbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGFmdGVyKTtcbn0pO1xuXG50ZXN0KCdwYXRoIHByZXBhcmF0aW9uIHVzZXMgaXRzIGV4YWN0IGVudmVsb3BlIGFuZCByZXF1aXJlcyBhIGdyYXZlbCB0b3AnLCAoKSA9PiB7XG4gIGNvbnN0IG0gPSBmaXh0dXJlKCk7XG4gIGNvbnN0IHdvcmxkID0gbS53b3JsZDtcbiAgYXNzZXJ0LmRlZXBFcXVhbChtMDAyUGF0aFJlY3QoKSwgeyB4MDogLTUzLCB6MDogLTQ0LCB4MTogLTQ1LCB6MTogLTQyIH0pO1xuXG4gIC8vIFRoZSBkZWZhdWx0IGRlcml2ZWQgZW52ZWxvcGUgYWRkcyBhIDEgbSBidWZmZXIgYW5kIGVzY2FwZXMgdGhlIHBpbm5lZFxuICAvLyBwb2xpY3kuIEl0IG11c3QgYmUgcmVqZWN0ZWQsIG5vdCBzaWxlbnRseSB3aWRlbmVkLlxuICBjb25zdCBpbXBsaWNpdCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplcigpLCB7XG4gICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICByZWN0OiBtMDAyUGF0aFJlY3QoKSxcbiAgICBmbG9vclk6IDEyLFxuICAgIHJ1bGVzOiBQQVRIX1JVTEVTLFxuICB9LCB7IHRhcmdldHM6IG0wMDJQYXRoVGFyZ2V0cygpLCBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5HUkFWRUwgfSk7XG4gIGFzc2VydC5lcXVhbChpbXBsaWNpdC5vaywgZmFsc2UpO1xuICBpZiAoIWltcGxpY2l0Lm9rKSB7XG4gICAgYXNzZXJ0LmVxdWFsKGltcGxpY2l0LnN0YWdlLCAnYXV0aG9yaXplJyk7XG4gICAgYXNzZXJ0LmVxdWFsKGltcGxpY2l0LmNvZGUsICdub3RfYXV0aG9yaXplZCcpO1xuICAgIGFzc2VydC5vayhpbXBsaWNpdC5yZWFzb25zLnNvbWUoKHIpID0+IHIuaW5jbHVkZXMoJ291dHNpZGUgdGhlIGxvY2FsIHBvbGljeScpKSk7XG4gIH1cblxuICAvLyBQcmVwYXJlIHRoZSBzaGFyZWQgaG91c2UgZG9vciBjb2x1bW4gZmlyc3QsIGFzIHRoZSBwaW5uZWQgc2NlbmFyaW8gZG9lcy5cbiAgcHJlcGFyZUhvdXNlKG0pO1xuICBjb25zdCBvdXRzaWRlQmVmb3JlID0gY2Fub25pY2FsUmVnaW9uSGFzaChcbiAgICB3b3JsZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uLCBbTTAwMl9MQVlPVVQuZW52ZWxvcGVbMV1dLFxuICApLmhhc2g7XG4gIGNvbnN0IHByZXAgPSBwcmVwYXJlUGF0aChtLCB0cnVlKTtcblxuICBhc3NlcnQuZXF1YWwocHJlcC5wbGFuLmVudmVsb3BlLmxlbmd0aCwgMSk7XG4gIGFzc2VydC5kZWVwRXF1YWwocHJlcC5wbGFuLmVudmVsb3BlWzBdLCBNMDAyX0xBWU9VVC5lbnZlbG9wZVsxXSk7XG4gIGFzc2VydC5lcXVhbChwcmVwLmxlZGdlci5jdXRWb2x1bWUsIDEyKTtcbiAgYXNzZXJ0LmVxdWFsKHByZXAubGVkZ2VyLmZpbGxWb2x1bWUsIDApO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIudm94ZWxFZGl0cywgMzkpO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIuc3VyZmFjZUVkaXRzLCAyNyk7XG4gIGFzc2VydC5kZWVwRXF1YWwocHJlcC5sZWRnZXIucmVzb3VyY2VzR2FpbmVkLCB7fSk7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBNMDAyX1BBVEhfUFJPRklMRS5sZW5ndGg7IGkrKykge1xuICAgIGZvciAobGV0IHogPSAtNDQ7IHogPD0gLTQyOyB6KyspIHtcbiAgICAgIGNvbnN0IHggPSAtNTMgKyBpO1xuICAgICAgYXNzZXJ0LmVxdWFsKHN1cmZhY2VBdCh3b3JsZCwgeCwgeiksIE0wMDJfUEFUSF9QUk9GSUxFW2ldLCBgY29sdW1uICR7eH0sJHt6fWApO1xuICAgICAgYXNzZXJ0LmVxdWFsKHRvcE1hdGVyaWFsQXRXb3JsZCh3b3JsZCwgeCwgeiksIE1BVC5HUkFWRUwsIGB0b3AgJHt4fSwke3p9YCk7XG4gICAgfVxuICB9XG4gIGFzc2VydC5lcXVhbChcbiAgICBjYW5vbmljYWxSZWdpb25IYXNoKHdvcmxkLCBNMDAyX0xBWU9VVC5wcm90ZWN0ZWRSZWdpb24sIFtNMDAyX0xBWU9VVC5lbnZlbG9wZVsxXV0pLmhhc2gsXG4gICAgb3V0c2lkZUJlZm9yZSxcbiAgICAncGF0aCBwcmVwYXJhdGlvbiBtdXN0IHN0YXkgaW5zaWRlIGl0cyBleGFjdCBlbnZlbG9wZScsXG4gICk7XG5cbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5TdHJ1Y3R1cmUod29ybGQsIHBhdGhQcm9wb3NhbChtKSk7XG4gIGFzc2VydC5lcXVhbChwbGFubmVkLm9rLCB0cnVlKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm47XG4gIGNvbnN0IHBsYW4gPSBwbGFubmVkLnBsYW47XG4gIGFzc2VydC5lcXVhbChwbGFuLm1vZHVsZXMubGVuZ3RoLCAyNyk7XG4gIGFzc2VydC5kZWVwRXF1YWwocGxhbi5jb3N0LCB7IHN0b25lOiA5IH0pO1xuXG4gIGNvbnN0IHBhdGhNb2R1bGVzID0gcGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ3BhdGgnKTtcbiAgYXNzZXJ0LmVxdWFsKHBhdGhNb2R1bGVzLmxlbmd0aCwgOSk7XG4gIGFzc2VydC5kZWVwRXF1YWwocGF0aE1vZHVsZXMubWFwKChtb2QpID0+IG1vZC55KSwgWy4uLk0wMDJfUEFUSF9QUk9GSUxFXSk7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgcGF0aE1vZHVsZXMubGVuZ3RoOyBpKyspIHtcbiAgICBhc3NlcnQub2soTWF0aC5hYnMocGF0aE1vZHVsZXNbaV0ueSAtIHBhdGhNb2R1bGVzW2kgLSAxXS55KSA8PSAxKTtcbiAgfVxuICBhc3NlcnQuZXF1YWwocGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ2N1cmInKS5sZW5ndGgsIDE4KTtcblxuICBjb25zdCBiZWZvcmVCdWlsZCA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3QgYnVpbHQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplcigpLCBwYXRoUHJvcG9zYWwobSkpO1xuICBhc3NlcnQuZXF1YWwoYnVpbHQub2ssIHRydWUsIGJ1aWx0Lm9rID8gJycgOiBidWlsdC5yZWFzb25zLmpvaW4oJzsgJykpO1xuICBpZiAoIWJ1aWx0Lm9rKSByZXR1cm47XG4gIGFzc2VydC5lcXVhbChidWlsdC5sZWRnZXIubW9kdWxlQ291bnQsIDI3KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChidWlsdC5sZWRnZXIuY29zdFBhaWQsIHsgc3RvbmU6IDkgfSk7XG4gIGFzc2VydC5lcXVhbChidWlsdC5sZWRnZXIuaW52ZW50b3J5QmVmb3JlLnN0b25lLCA0OCk7XG4gIGFzc2VydC5lcXVhbChidWlsdC5sZWRnZXIuaW52ZW50b3J5QWZ0ZXIuc3RvbmUsIDM5KTtcblxuICBjb25zdCBhZnRlckJ1aWxkID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXJCdWlsZC52b3hlbHMsIGJlZm9yZUJ1aWxkLnZveGVscyk7XG4gIGFzc2VydC5lcXVhbChhZnRlckJ1aWxkLmVudGl0aWVzLCBiZWZvcmVCdWlsZC5lbnRpdGllcyk7XG4gIGFzc2VydC5ub3RFcXVhbChhZnRlckJ1aWxkLmludmVudG9yeSwgYmVmb3JlQnVpbGQuaW52ZW50b3J5KTtcbiAgYXNzZXJ0LmVxdWFsKHdvcmxkLnN0cnVjdHVyZXMuZ2V0KHBsYW4uaWQpPy5raW5kLCAncGF0aCcpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGVkaXRzT3V0c2lkZUVudmVsb3BlKHdvcmxkLCBNMDAyX0xBWU9VVC5lbnZlbG9wZSksIFtdKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChjaGVja0Rlcml2ZWRDYWNoZXMod29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiksIFtdKTtcbn0pO1xuXG50ZXN0KCd0ZXJyYWNlcyBwbGFuIGZyb20gcGlubmVkIGJhbmRzLCByZXF1aXJlIHNvaWwsIGFuZCBwYXkgZXhhY3QgY29zdHMnLCAoKSA9PiB7XG4gIGNvbnN0IG0gPSBmaXh0dXJlKCk7XG4gIGNvbnN0IHdvcmxkID0gbS53b3JsZDtcbiAgY29uc3Qgb3V0c2lkZUJlZm9yZSA9IGNhbm9uaWNhbFJlZ2lvbkhhc2goXG4gICAgd29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiwgW00wMDJfTEFZT1VULmVudmVsb3BlWzJdXSxcbiAgKS5oYXNoO1xuICBjb25zdCBwcmVwID0gcHJlcGFyZUZhcm0obSwgdHJ1ZSk7XG5cbiAgYXNzZXJ0LmVxdWFsKHByZXAubGVkZ2VyLmN1dFZvbHVtZSwgNDApO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIuZmlsbFZvbHVtZSwgMzMpO1xuICBhc3NlcnQuZXF1YWwocHJlcC5sZWRnZXIudm94ZWxFZGl0cywgMTA3KTtcbiAgYXNzZXJ0LmVxdWFsKHByZXAubGVkZ2VyLnN1cmZhY2VFZGl0cywgMzQpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHByZXAubGVkZ2VyLmVudGl0aWVzQ2xlYXJlZC5tYXAoKGUpID0+IGUuZW50aXR5SWQpLCBbXG4gICAgJ2hlcm86c3R5bF9vcmU6LTM4Oi00MicsXG4gICAgJ2hlcm86c3R5bF90cmVlX2Jsb3Nzb206LTI4Oi0zOCcsXG4gIF0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKHByZXAubGVkZ2VyLnJlc291cmNlc0dhaW5lZCwgeyBvcmU6IDgsIHdvb2Q6IDEyIH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKHByZXAubGVkZ2VyLmludmVudG9yeUFmdGVyLCB7IG9yZTogOCwgc3RvbmU6IDQ4LCB3b29kOiAzNiB9KTtcbiAgYXNzZXJ0LmVxdWFsKFxuICAgIGNhbm9uaWNhbFJlZ2lvbkhhc2god29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiwgW00wMDJfTEFZT1VULmVudmVsb3BlWzJdXSkuaGFzaCxcbiAgICBvdXRzaWRlQmVmb3JlLFxuICAgICdmYXJtIHByZXBhcmF0aW9uIG11c3Qgc3RheSBpbnNpZGUgaXRzIGV4YWN0IGVudmVsb3BlJyxcbiAgKTtcblxuICBmb3IgKGNvbnN0IGJhbmQgb2YgTTAwMl9URVJSQUNFX0JBTkRTKSB7XG4gICAgZm9yIChsZXQgeiA9IGJhbmQuejA7IHogPD0gYmFuZC56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gbS5sYXlvdXQuZmFybS5yZWN0LngwOyB4IDw9IG0ubGF5b3V0LmZhcm0ucmVjdC54MTsgeCsrKSB7XG4gICAgICAgIGFzc2VydC5lcXVhbChzdXJmYWNlQXQod29ybGQsIHgsIHopLCBiYW5kLnksIGBjb2x1bW4gJHt4fSwke3p9YCk7XG4gICAgICAgIGFzc2VydC5lcXVhbCh0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIHgsIHopLCBNQVQuU09JTCwgYHRvcCAke3h9LCR7en1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBwbGFubmVkID0gcGxhblN0cnVjdHVyZSh3b3JsZCwgZmFybVByb3Bvc2FsKG0pKTtcbiAgYXNzZXJ0LmVxdWFsKHBsYW5uZWQub2ssIHRydWUpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybjtcbiAgY29uc3QgcGxhbiA9IHBsYW5uZWQucGxhbjtcbiAgYXNzZXJ0LmVxdWFsKHBsYW4ubW9kdWxlcy5sZW5ndGgsIDE0KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChwbGFuLmNvc3QsIHsgd29vZDogNiwgc3RvbmU6IDEyIH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKHBsYW4udGVycmFjZXMsIE0wMDJfVEVSUkFDRV9CQU5EUyk7XG4gIGFzc2VydC5kZWVwRXF1YWwocGxhbi5lbnZlbG9wZSwgW1xuICAgIHsgeDA6IC0zOSwgejA6IC00MywgeDE6IC0yNiwgejE6IC0zNCwgeTA6IDEzLCB5MTogMTggfSxcbiAgXSk7XG5cbiAgY29uc3QgYmVkcyA9IHBsYW4ubW9kdWxlcy5maWx0ZXIoKG1vZCkgPT4gbW9kLmtpbmQgPT09ICdzb2lsX2JlZCcpO1xuICBjb25zdCByb3dzID0gcGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ2Nyb3Bfcm93Jyk7XG4gIGNvbnN0IHdhbGxzID0gcGxhbi5tb2R1bGVzLmZpbHRlcigobW9kKSA9PiBtb2Qua2luZCA9PT0gJ3JldGFpbmluZ193YWxsJyk7XG4gIGFzc2VydC5lcXVhbChiZWRzLmxlbmd0aCwgMyk7XG4gIGFzc2VydC5lcXVhbChyb3dzLmxlbmd0aCwgOSk7XG4gIGFzc2VydC5lcXVhbCh3YWxscy5sZW5ndGgsIDIpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGJlZHMubWFwKChtb2QpID0+IG1vZC55KSwgWzE2LCAxNSwgMTRdKTtcbiAgZm9yIChjb25zdCByb3cgb2Ygcm93cykge1xuICAgIGFzc2VydC5vayhbMTYuMTgsIDE1LjE4LCAxNC4xOF0uaW5jbHVkZXMocm93LnkpKTtcbiAgfVxuICBmb3IgKGNvbnN0IHdhbGwgb2Ygd2FsbHMpIHtcbiAgICBhc3NlcnQuZXF1YWwod2FsbC5oLCAxKTtcbiAgfVxuXG4gIGNvbnN0IGJlZm9yZUJ1aWxkID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBidWlsdCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyKCksIGZhcm1Qcm9wb3NhbChtKSk7XG4gIGFzc2VydC5lcXVhbChidWlsdC5vaywgdHJ1ZSwgYnVpbHQub2sgPyAnJyA6IGJ1aWx0LnJlYXNvbnMuam9pbignOyAnKSk7XG4gIGlmICghYnVpbHQub2spIHJldHVybjtcbiAgYXNzZXJ0LmVxdWFsKGJ1aWx0LmxlZGdlci5tb2R1bGVDb3VudCwgMTQpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGJ1aWx0LmxlZGdlci5jb3N0UGFpZCwgeyB3b29kOiA2LCBzdG9uZTogMTIgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoYnVpbHQubGVkZ2VyLmludmVudG9yeUJlZm9yZSwgeyBvcmU6IDgsIHN0b25lOiA0OCwgd29vZDogMzYgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoYnVpbHQubGVkZ2VyLmludmVudG9yeUFmdGVyLCB7IG9yZTogOCwgc3RvbmU6IDM2LCB3b29kOiAzMCB9KTtcblxuICBjb25zdCBhZnRlckJ1aWxkID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXJCdWlsZC52b3hlbHMsIGJlZm9yZUJ1aWxkLnZveGVscyk7XG4gIGFzc2VydC5ub3RFcXVhbChhZnRlckJ1aWxkLmludmVudG9yeSwgYmVmb3JlQnVpbGQuaW52ZW50b3J5KTtcbiAgYXNzZXJ0LmVxdWFsKHdvcmxkLnN0cnVjdHVyZXMuZ2V0KHBsYW4uaWQpPy5raW5kLCAndGVycmFjZScpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGVkaXRzT3V0c2lkZUVudmVsb3BlKHdvcmxkLCBNMDAyX0xBWU9VVC5lbnZlbG9wZSksIFtdKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChjaGVja0Rlcml2ZWRDYWNoZXMod29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiksIFtdKTtcbn0pO1xuXG50ZXN0KCdzdHJ1Y3R1cmUgYXV0aG9yaXphdGlvbiByZWplY3RzIGZvcmdlZCwgc3RhbGUsIHBvb3IgYW5kIG91dC1vZi1lbnZlbG9wZSB3b3JrJywgKCkgPT4ge1xuICBjb25zdCBtID0gZml4dHVyZSgpO1xuICBwcmVwYXJlSG91c2UobSk7XG4gIGNvbnN0IHdvcmxkID0gbS53b3JsZDtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5TdHJ1Y3R1cmUod29ybGQsIGhvdXNlUHJvcG9zYWwobSkpO1xuICBhc3NlcnQuZXF1YWwocGxhbm5lZC5vaywgdHJ1ZSk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuO1xuICBjb25zdCBwbGFuID0gcGxhbm5lZC5wbGFuO1xuICBjb25zdCBkZWNpc2lvbiA9IHN0cnVjdHVyZUF1dGhvcml6ZXIoKS5hdXRob3JpemUod29ybGQsIHBsYW4pO1xuICBhc3NlcnQuZXF1YWwoZGVjaXNpb24ub2ssIHRydWUpO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSByZXR1cm47XG4gIGNvbnN0IHRva2VuID0gZGVjaXNpb24uYXV0aG9yaXphdGlvbjtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuXG4gIGNvbnN0IGZvcmdlZERpZ2VzdCA9IGV4ZWN1dGVTdHJ1Y3R1cmUod29ybGQsIHBsYW4sIHtcbiAgICAuLi50b2tlbiwgcGxhbkRpZ2VzdDogJzAwMDAwMDAwMDAwMDAwMDAnLFxuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKGZvcmdlZERpZ2VzdC5vaywgZmFsc2UpO1xuICBpZiAoIWZvcmdlZERpZ2VzdC5vaykgYXNzZXJ0LmVxdWFsKGZvcmdlZERpZ2VzdC5jb2RlLCAnZGlnZXN0X21pc21hdGNoJyk7XG5cbiAgY29uc3QgZm9yZ2VkQXV0aG9yaXR5ID0gZXhlY3V0ZVN0cnVjdHVyZSh3b3JsZCwgcGxhbiwge1xuICAgIC4uLnRva2VuLCBhdXRob3JpdHk6ICdtYWdpY2Jsb2NrJyBhcyBuZXZlcixcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChmb3JnZWRBdXRob3JpdHkub2ssIGZhbHNlKTtcbiAgaWYgKCFmb3JnZWRBdXRob3JpdHkub2spIGFzc2VydC5lcXVhbChmb3JnZWRBdXRob3JpdHkuY29kZSwgJ3Vuc3VwcG9ydGVkX2F1dGhvcml0eScpO1xuXG4gIGNvbnN0IG5hcnJvd2VkID0gZXhlY3V0ZVN0cnVjdHVyZSh3b3JsZCwgcGxhbiwge1xuICAgIC4uLnRva2VuLFxuICAgIGVudmVsb3BlOiBbeyAuLi50b2tlbi5lbnZlbG9wZVswXSwgeDA6IHRva2VuLmVudmVsb3BlWzBdLngwICsgMSB9XSxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChuYXJyb3dlZC5vaywgZmFsc2UpO1xuICBpZiAoIW5hcnJvd2VkLm9rKSBhc3NlcnQuZXF1YWwobmFycm93ZWQuY29kZSwgJ2VudmVsb3BlX21pc21hdGNoJyk7XG5cbiAgY29uc3QgbGltaXRlZE1vZHVsZXMgPSBuZXcgTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyKFxuICAgIHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0sIHsgbWF4TW9kdWxlczogMTAgfSxcbiAgKS5hdXRob3JpemUod29ybGQsIHBsYW4pO1xuICBhc3NlcnQuZXF1YWwobGltaXRlZE1vZHVsZXMub2ssIGZhbHNlKTtcbiAgYXNzZXJ0Lm9rKGxpbWl0ZWRNb2R1bGVzLnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnMTcgbW9kdWxlcyBleGNlZWQgbGltaXQgMTAnKSkpO1xuXG4gIGNvbnN0IGxpbWl0ZWRDb3N0ID0gbmV3IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcihcbiAgICB7IGVudmVsb3BlOiBNMDAyX0xBWU9VVC5lbnZlbG9wZSB9LCB7IG1heENvc3Q6IDEwIH0sXG4gICkuYXV0aG9yaXplKHdvcmxkLCBwbGFuKTtcbiAgYXNzZXJ0LmVxdWFsKGxpbWl0ZWRDb3N0Lm9rLCBmYWxzZSk7XG4gIGFzc2VydC5vayhsaW1pdGVkQ29zdC5yZWFzb25zLnNvbWUoKHIpID0+IHIuaW5jbHVkZXMoJ2Nvc3QgMjggZXhjZWVkcyBsaW1pdCAxMCcpKSk7XG5cbiAgLy8gQSBtb2R1bGUgcHVzaGVkIG91dHNpZGUgdGhlIHBsYW4gZW52ZWxvcGUgaXMgcmVmdXNlZCBiZWZvcmUgZXhlY3V0aW9uLlxuICBjb25zdCBmb3JnZWQ6IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgLi4ucGxhbixcbiAgICBtb2R1bGVzOiBwbGFuLm1vZHVsZXMubWFwKChtb2QsIGkpID0+IChpID09PSAwID8geyAuLi5tb2QsIHg6IG1vZC54ICsgMjAgfSA6IG1vZCkpLFxuICB9O1xuICBmb3JnZWQuaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KGZvcmdlZCl9YDtcbiAgY29uc3Qgb3V0c2lkZSA9IHN0cnVjdHVyZUF1dGhvcml6ZXIoKS5hdXRob3JpemUod29ybGQsIGZvcmdlZCk7XG4gIGFzc2VydC5lcXVhbChvdXRzaWRlLm9rLCBmYWxzZSk7XG4gIGFzc2VydC5vayhvdXRzaWRlLnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnb3V0c2lkZSB0aGUgcGxhbiBlbnZlbG9wZScpXG4gICAgfHwgci5pbmNsdWRlcygnb3V0c2lkZSB0aGUgbG9jYWwgcG9saWN5JykpKTtcblxuICAvLyBFdmVuIGEgdG9rZW4gd2l0aCB0aGUgZm9yZ2VkIGRpZ2VzdCBjYW5ub3QgZ2V0IHBhc3QgdGhlIGV4ZWN1dG9yJ3Mgb3duXG4gIC8vIG1vZHVsZS1pbi1lbnZlbG9wZSBjaGVjay5cbiAgY29uc3QgZm9yZ2VkRXhlY3V0aW9uID0gZXhlY3V0ZVN0cnVjdHVyZSh3b3JsZCwgZm9yZ2VkLCB7XG4gICAgLi4udG9rZW4sIHBsYW5EaWdlc3Q6IHN0cnVjdHVyZURpZ2VzdChmb3JnZWQpLFxuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKGZvcmdlZEV4ZWN1dGlvbi5vaywgZmFsc2UpO1xuICBpZiAoIWZvcmdlZEV4ZWN1dGlvbi5vaykge1xuICAgIGFzc2VydC5lcXVhbChmb3JnZWRFeGVjdXRpb24uY29kZSwgJ3VuYXV0aG9yaXplZF9zdHJ1Y3R1cmUnKTtcbiAgICBhc3NlcnQub2soZm9yZ2VkRXhlY3V0aW9uLnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZScpKSk7XG4gIH1cblxuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYmVmb3JlKTtcblxuICAvLyBBIGdlbnVpbmUgdG9rZW4gZ29lcyBzdGFsZSBhZnRlciBhbnkgd29ybGQgcmV2aXNpb24gY2hhbmdlLlxuICBhc3NlcnQuZXF1YWwoc2V0Vm94ZWwod29ybGQsIC01NiwgMTEsIC00MywgTUFULlNUT05FKSwgdHJ1ZSk7XG4gIGNvbnN0IGFmdGVyTWFudWFsRWRpdCA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3Qgc3RhbGUgPSBleGVjdXRlU3RydWN0dXJlKHdvcmxkLCBwbGFuLCB0b2tlbik7XG4gIGFzc2VydC5lcXVhbChzdGFsZS5vaywgZmFsc2UpO1xuICBpZiAoIXN0YWxlLm9rKSBhc3NlcnQuZXF1YWwoc3RhbGUuY29kZSwgJ3N0YWxlX2F1dGhvcml6YXRpb24nKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGFmdGVyTWFudWFsRWRpdCk7XG59KTtcblxudGVzdCgnZXhlY3V0b3IgcmUtY2hlY2tzIHN1cmZhY2UgYW5kIG9ic3RydWN0aW9ucyBiZWZvcmUgY2hhcmdpbmcgcmVzb3VyY2VzJywgKCkgPT4ge1xuICBjb25zdCBtID0gZml4dHVyZSgpO1xuICBwcmVwYXJlSG91c2UobSk7XG4gIGNvbnN0IHdvcmxkID0gbS53b3JsZDtcblxuICAvLyBBIHBsYW4gd2hvc2Ugc3VyZmFjZSBzYW1wbGVzIGRpc2FncmVlIHdpdGggdGhlIGN1cnJlbnQgd29ybGQgaXMgcmVmdXNlZFxuICAvLyBldmVuIHdoZW4gaXRzIGRpZ2VzdCBhbmQgYXV0aG9yaXphdGlvbiBhcmUgaW50ZXJuYWxseSBjb25zaXN0ZW50LiBUaGVcbiAgLy8gYXV0aG9yaXplciBjaGVja3MgZW52ZWxvcGVzLCBub3QgdGVycmFpbjsgdGhlIGV4ZWN1dG9yIG11c3QgcmUtcmVhZCBpdC5cbiAgY29uc3Qgc3VyZmFjZVBsYW4gPSBwbGFuU3RydWN0dXJlKHdvcmxkLCBob3VzZVByb3Bvc2FsKG0pKTtcbiAgYXNzZXJ0LmVxdWFsKHN1cmZhY2VQbGFuLm9rLCB0cnVlKTtcbiAgaWYgKCFzdXJmYWNlUGxhbi5vaykgcmV0dXJuO1xuICBjb25zdCByYWlzZWQ6IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgLi4uc3VyZmFjZVBsYW4ucGxhbixcbiAgICBzdXJmYWNlOiBzdXJmYWNlUGxhbi5wbGFuLnN1cmZhY2UubWFwKChzLCBpKSA9PiAoaSA9PT0gMCA/IHsgLi4ucywgeTogcy55ICsgMSB9IDogcykpLFxuICB9O1xuICByYWlzZWQuaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHJhaXNlZCl9YDtcbiAgY29uc3QgcmFpc2VkVG9rZW4gPSBzdHJ1Y3R1cmVBdXRob3JpemVyKCkuYXV0aG9yaXplKHdvcmxkLCByYWlzZWQpO1xuICBhc3NlcnQuZXF1YWwocmFpc2VkVG9rZW4ub2ssIHRydWUpO1xuICBpZiAoIXJhaXNlZFRva2VuLm9rIHx8ICFyYWlzZWRUb2tlbi5hdXRob3JpemF0aW9uKSByZXR1cm47XG4gIGNvbnN0IGJlZm9yZVJhaXNlZCA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3Qgb25SYWlzZWQgPSBleGVjdXRlU3RydWN0dXJlKHdvcmxkLCByYWlzZWQsIHJhaXNlZFRva2VuLmF1dGhvcml6YXRpb24pO1xuICBhc3NlcnQuZXF1YWwob25SYWlzZWQub2ssIGZhbHNlKTtcbiAgaWYgKCFvblJhaXNlZC5vaykge1xuICAgIGFzc2VydC5lcXVhbChvblJhaXNlZC5jb2RlLCAndW5hdXRob3JpemVkX3N0cnVjdHVyZScpO1xuICAgIGFzc2VydC5vayhvblJhaXNlZC5yZWFzb25zLnNvbWUoKHIpID0+IHIuaW5jbHVkZXMoJ2V4cGVjdGVkIDEyJykpKTtcbiAgfVxuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYmVmb3JlUmFpc2VkKTtcblxuICAvLyBBIG5ldyBvYnN0cnVjdGlvbiBvbiB0aGUgZm9vdHByaW50IGlzIGNhdWdodCBieSB0aGUgZXhlY3V0b3IgZXZlbiB0aG91Z2hcbiAgLy8gdGhlIHJldmlzaW9uIGFuZCBzdXJmYWNlIGFyZSB1bmNoYW5nZWQuXG4gIGNvbnN0IGJsb2NrZWQgPSBmaXh0dXJlKCk7XG4gIHByZXBhcmVIb3VzZShibG9ja2VkKTtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5TdHJ1Y3R1cmUoYmxvY2tlZC53b3JsZCwgaG91c2VQcm9wb3NhbChibG9ja2VkKSk7XG4gIGFzc2VydC5lcXVhbChwbGFubmVkLm9rLCB0cnVlKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm47XG4gIGNvbnN0IHRva2VuID0gc3RydWN0dXJlQXV0aG9yaXplcigpLmF1dGhvcml6ZShibG9ja2VkLndvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBhc3NlcnQuZXF1YWwodG9rZW4ub2ssIHRydWUpO1xuICBpZiAoIXRva2VuLm9rIHx8ICF0b2tlbi5hdXRob3JpemF0aW9uKSByZXR1cm47XG4gIGNvbnN0IGV4dHJhID0ge1xuICAgIGlkOiAndGVzdDpob3VzZS1yb2NrJyxcbiAgICBraW5kOiAnc3R5bF9vcmUnIGFzIGNvbnN0LFxuICAgIGNodW5rOiAnMzAsMzAnLFxuICAgIHg6IC01Ni41LCB5OiAxMSwgejogLTQzLjUsXG4gICAgcm90OiAwLCBzY2FsZTogMSwgdmFyaWFudDogMCxcbiAgICByZXNvdXJjZTogJ29yZScgYXMgY29uc3QsIHJlbWFpbmluZzogMiwgeWllbGRQZXJIYXJ2ZXN0OiAxLFxuICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiBmYWxzZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICB9O1xuICBibG9ja2VkLndvcmxkLmVudGl0aWVzLnNldChleHRyYS5pZCwgZXh0cmEpO1xuICBibG9ja2VkLndvcmxkLmVudGl0eUNodW5rcy5nZXQoJzMwLDMwJykhLnB1c2goZXh0cmEuaWQpO1xuICBjb25zdCBiZWZvcmVCbG9ja2VkID0gZmluZ2VycHJpbnQoYmxvY2tlZC53b3JsZCk7XG4gIGNvbnN0IG9uQmxvY2tlZCA9IGV4ZWN1dGVTdHJ1Y3R1cmUoYmxvY2tlZC53b3JsZCwgcGxhbm5lZC5wbGFuLCB0b2tlbi5hdXRob3JpemF0aW9uKTtcbiAgYXNzZXJ0LmVxdWFsKG9uQmxvY2tlZC5vaywgZmFsc2UpO1xuICBpZiAoIW9uQmxvY2tlZC5vaykge1xuICAgIGFzc2VydC5lcXVhbChvbkJsb2NrZWQuY29kZSwgJ3VuYXV0aG9yaXplZF9zdHJ1Y3R1cmUnKTtcbiAgICBhc3NlcnQub2sob25CbG9ja2VkLnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnZm9vdHByaW50IGhhcyAxIG9ic3RydWN0aW9ucycpKSk7XG4gIH1cbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludChibG9ja2VkLndvcmxkKSwgYmVmb3JlQmxvY2tlZCk7XG59KTtcblxudGVzdCgndGhlIHBpbm5lZCBNMDAyIHNjZW5hcmlvIGlzIGRldGVybWluaXN0aWMgYW5kIGxlYXZlcyBvdXRzaWRlIHRlcnJhaW4gYWxvbmUnLCAoKSA9PiB7XG4gIGNvbnN0IGEgPSBjcmVhdGVNMDAyRml4dHVyZSgpO1xuICBjb25zdCBiID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgcmEgPSBydW5NMDAyU2NlbmFyaW8oYSk7XG4gIGNvbnN0IHJiID0gcnVuTTAwMlNjZW5hcmlvKGIpO1xuXG4gIGFzc2VydC5lcXVhbChyYS5vaywgdHJ1ZSwgcmEuZXJyb3JzLmpvaW4oJzsgJykpO1xuICBhc3NlcnQuZXF1YWwocmIub2ssIHRydWUsIHJiLmVycm9ycy5qb2luKCc7ICcpKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5lcnJvcnMsIFtdKTtcblxuICBhc3NlcnQuZGVlcEVxdWFsKHJhLmhvdXNlLnByZXBhcmF0aW9uLCByYi5ob3VzZS5wcmVwYXJhdGlvbik7XG4gIGFzc2VydC5kZWVwRXF1YWwocmEucGF0aC5wcmVwYXJhdGlvbiwgcmIucGF0aC5wcmVwYXJhdGlvbik7XG4gIGFzc2VydC5kZWVwRXF1YWwocmEuZmFybS5wcmVwYXJhdGlvbiwgcmIuZmFybS5wcmVwYXJhdGlvbik7XG4gIGFzc2VydC5kZWVwRXF1YWwocmEuaG91c2Uuc3RydWN0dXJlLCByYi5ob3VzZS5zdHJ1Y3R1cmUpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHJhLnBhdGguc3RydWN0dXJlLCByYi5wYXRoLnN0cnVjdHVyZSk7XG4gIGFzc2VydC5kZWVwRXF1YWwocmEuZmFybS5zdHJ1Y3R1cmUsIHJiLmZhcm0uc3RydWN0dXJlKTtcblxuICBhc3NlcnQuZXF1YWwocmEuaG91c2UucHJlcGFyYXRpb24/LmN1dFZvbHVtZSwgMyk7XG4gIGFzc2VydC5lcXVhbChyYS5ob3VzZS5wcmVwYXJhdGlvbj8uZmlsbFZvbHVtZSwgMTgpO1xuICBhc3NlcnQuZXF1YWwocmEuaG91c2UucHJlcGFyYXRpb24/LnZveGVsRWRpdHMsIDIxKTtcbiAgYXNzZXJ0LmVxdWFsKHJhLnBhdGgucHJlcGFyYXRpb24/LmN1dFZvbHVtZSwgMTIpO1xuICBhc3NlcnQuZXF1YWwocmEucGF0aC5wcmVwYXJhdGlvbj8uZmlsbFZvbHVtZSwgMCk7XG4gIGFzc2VydC5lcXVhbChyYS5wYXRoLnByZXBhcmF0aW9uPy52b3hlbEVkaXRzLCAzOSk7XG4gIGFzc2VydC5lcXVhbChyYS5wYXRoLnByZXBhcmF0aW9uPy5zdXJmYWNlRWRpdHMsIDI3KTtcbiAgYXNzZXJ0LmVxdWFsKHJhLmZhcm0ucHJlcGFyYXRpb24/LmN1dFZvbHVtZSwgNDApO1xuICBhc3NlcnQuZXF1YWwocmEuZmFybS5wcmVwYXJhdGlvbj8uZmlsbFZvbHVtZSwgMzMpO1xuICBhc3NlcnQuZXF1YWwocmEuZmFybS5wcmVwYXJhdGlvbj8udm94ZWxFZGl0cywgMTA3KTtcbiAgYXNzZXJ0LmVxdWFsKHJhLmZhcm0ucHJlcGFyYXRpb24/LnN1cmZhY2VFZGl0cywgMzQpO1xuXG4gIGFzc2VydC5lcXVhbChyYS5ob3VzZS5zdHJ1Y3R1cmU/Lm1vZHVsZUNvdW50LCAxNyk7XG4gIGFzc2VydC5lcXVhbChyYS5wYXRoLnN0cnVjdHVyZT8ubW9kdWxlQ291bnQsIDI3KTtcbiAgYXNzZXJ0LmVxdWFsKHJhLmZhcm0uc3RydWN0dXJlPy5tb2R1bGVDb3VudCwgMTQpO1xuICBhc3NlcnQuZGVlcEVxdWFsKHJhLmhvdXNlLnN0cnVjdHVyZT8uY29zdFBhaWQsIHsgd29vZDogMTAsIHN0b25lOiAxOCB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5wYXRoLnN0cnVjdHVyZT8uY29zdFBhaWQsIHsgc3RvbmU6IDkgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwocmEuZmFybS5zdHJ1Y3R1cmU/LmNvc3RQYWlkLCB7IHdvb2Q6IDYsIHN0b25lOiAxMiB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChtMDAyU3RydWN0dXJlQ29zdHMocmEpLCB7IHdvb2Q6IDE2LCBzdG9uZTogMzkgfSk7XG5cbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5pbnZlbnRvcnlCZWZvcmUsIHsgc3RvbmU6IDQ4LCB3b29kOiAyNCB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5pbnZlbnRvcnlBZnRlciwgeyBvcmU6IDgsIHN0b25lOiA5LCB3b29kOiAyMCB9KTtcbiAgYXNzZXJ0LmVxdWFsKGEud29ybGQuc3RydWN0dXJlcy5zaXplLCAzKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChbLi4uYS53b3JsZC5zdHJ1Y3R1cmVzLmtleXMoKV0sIFtcbiAgICAnc3RydWN0dXJlOjdmMmFiNTQ5ZTQ2ZDhkZGInLFxuICAgICdzdHJ1Y3R1cmU6MGU2OGQ2YWY5NzRkN2E1NScsXG4gICAgJ3N0cnVjdHVyZTo4YzRhNjhjMGU4NTM2MzIzJyxcbiAgXSk7XG4gIC8vIFJldmlzaW9uIHN0ZXBzOiAyMSBob3VzZSBlZGl0cywgMzkgcGF0aCBlZGl0cywgMTA3IGZhcm0gZWRpdHMsIHR3byBlbnRpdHlcbiAgLy8gcmVtb3ZhbHMgZHVyaW5nIGZhcm0gcHJlcGFyYXRpb24sIGFuZCBvbmUgY29tbWl0IHBlciBzdHJ1Y3R1cmUuXG4gIGNvbnN0IGhvdXNlUHJlcCA9IHJhLmhvdXNlLnByZXBhcmF0aW9uITtcbiAgY29uc3QgaG91c2VCdWlsZCA9IHJhLmhvdXNlLnN0cnVjdHVyZSE7XG4gIGNvbnN0IHBhdGhQcmVwID0gcmEucGF0aC5wcmVwYXJhdGlvbiE7XG4gIGNvbnN0IHBhdGhCdWlsZCA9IHJhLnBhdGguc3RydWN0dXJlITtcbiAgY29uc3QgZmFybVByZXAgPSByYS5mYXJtLnByZXBhcmF0aW9uITtcbiAgY29uc3QgZmFybUJ1aWxkID0gcmEuZmFybS5zdHJ1Y3R1cmUhO1xuICBhc3NlcnQuZXF1YWwoaG91c2VQcmVwLnJldmlzaW9uQWZ0ZXIgLSBob3VzZVByZXAucmV2aXNpb25CZWZvcmUsIDIxKTtcbiAgYXNzZXJ0LmVxdWFsKGhvdXNlQnVpbGQucmV2aXNpb25BZnRlciAtIGhvdXNlQnVpbGQucmV2aXNpb25CZWZvcmUsIDEpO1xuICBhc3NlcnQuZXF1YWwocGF0aFByZXAucmV2aXNpb25BZnRlciAtIHBhdGhQcmVwLnJldmlzaW9uQmVmb3JlLCAzOSk7XG4gIGFzc2VydC5lcXVhbChwYXRoQnVpbGQucmV2aXNpb25BZnRlciAtIHBhdGhCdWlsZC5yZXZpc2lvbkJlZm9yZSwgMSk7XG4gIGFzc2VydC5lcXVhbChmYXJtUHJlcC5yZXZpc2lvbkFmdGVyIC0gZmFybVByZXAucmV2aXNpb25CZWZvcmUsIDEwOSk7XG4gIGFzc2VydC5lcXVhbChmYXJtQnVpbGQucmV2aXNpb25BZnRlciAtIGZhcm1CdWlsZC5yZXZpc2lvbkJlZm9yZSwgMSk7XG4gIGFzc2VydC5lcXVhbChcbiAgICBhLndvcmxkLnJldmlzaW9uIC0gaG91c2VQcmVwLnJldmlzaW9uQmVmb3JlLFxuICAgIDE3MixcbiAgICAnMjEgKyAxICsgMzkgKyAxICsgMTA5ICsgMSByZXZpc2lvbiBzdGVwcycsXG4gICk7XG5cbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5oYXNoZXMsIHJiLmhhc2hlcyk7XG4gIGFzc2VydC5lcXVhbChcbiAgICBjYW5vbmljYWxSZWdpb25IYXNoKGEud29ybGQsIGEubGF5b3V0LnByb3RlY3RlZFJlZ2lvbikuaGFzaCxcbiAgICBjYW5vbmljYWxSZWdpb25IYXNoKGIud29ybGQsIGIubGF5b3V0LnByb3RlY3RlZFJlZ2lvbikuaGFzaCxcbiAgKTtcbiAgYXNzZXJ0LmVxdWFsKFxuICAgIGNhbm9uaWNhbEVudGl0eUhhc2goYS53b3JsZCwgYS5sYXlvdXQucHJvdGVjdGVkUmVnaW9uKSxcbiAgICBjYW5vbmljYWxFbnRpdHlIYXNoKGIud29ybGQsIGIubGF5b3V0LnByb3RlY3RlZFJlZ2lvbiksXG4gICk7XG4gIGFzc2VydC5lcXVhbChjYW5vbmljYWxJbnZlbnRvcnlIYXNoKGEud29ybGQpLCBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKGIud29ybGQpKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChlZGl0c091dHNpZGVFbnZlbG9wZShhLndvcmxkLCBhLmxheW91dC5lbnZlbG9wZSksIFtdKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChjaGVja0Rlcml2ZWRDYWNoZXMoYS53b3JsZCwgYS5sYXlvdXQucHJvdGVjdGVkUmVnaW9uKSwgW10pO1xuXG4gIC8vIEhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlcyBhcmUgYWxsIHByZXNlbnQgb24gcHJlcGFyZWQsIHJlYWwgdGVycmFpbi5cbiAgYXNzZXJ0LmVxdWFsKHN1cmZhY2VBdChhLndvcmxkLCAtNTYsIC00MyksIDExKTtcbiAgYXNzZXJ0LmVxdWFsKHRvcE1hdGVyaWFsQXRXb3JsZChhLndvcmxkLCAtNDksIC00MyksIE1BVC5HUkFWRUwpO1xuICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KGEud29ybGQsIC0zMiwgLTQxKSwgMTYpO1xuICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KGEud29ybGQsIC0zMiwgLTM4KSwgMTUpO1xuICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KGEud29ybGQsIC0zMiwgLTM2KSwgMTQpO1xuICBhc3NlcnQuZXF1YWwodG9wTWF0ZXJpYWxBdFdvcmxkKGEud29ybGQsIC0zMiwgLTM2KSwgTUFULlNPSUwpO1xufSk7XG4iLCAiLy8gUHJpdmF0ZSBtaWdyYXRpb24gcmVwbGF5IG9ubHkuIFJldGlyZWQgZW50aXRpZXMgbGl2ZSBpbiB0aGlzIFdvcmxkIHdoaWxlIGFuXG4vLyBhY2NlcHRlZCBoaXN0b3JpY2FsIGpvdXJuYWwgaXMgY2hlY2tlZDsgbm8gcHVibGljIGNvbW1hbmQgZW5hYmxlcyB0aGlzIG1vZGUuXG5pbnRlcmZhY2UgUmVwbGF5U3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIGhpc3RvcmljYWxIYXNoOiBib29sZWFuO1xuICBtaWdyYXRlZDogYm9vbGVhbjtcbn1cblxuY29uc3Qgc3RhdGVzID0gbmV3IFdlYWtNYXA8b2JqZWN0LCBSZXBsYXlTdGF0ZT4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxheVN0b25lU3RhdGUod29ybGQ6IG9iamVjdCk6IFJlcGxheVN0YXRlIHtcbiAgbGV0IHN0YXRlID0gc3RhdGVzLmdldCh3b3JsZCk7XG4gIGlmICghc3RhdGUpIHsgc3RhdGUgPSB7IGFjdGl2ZTogZmFsc2UsIGhpc3RvcmljYWxIYXNoOiBmYWxzZSwgbWlncmF0ZWQ6IGZhbHNlIH07IHN0YXRlcy5zZXQod29ybGQsIHN0YXRlKTsgfVxuICByZXR1cm4gc3RhdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IHRydWU7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbiAgc3RhdGUubWlncmF0ZWQgPSBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/LmFjdGl2ZSA/PyBmYWxzZTtcbn1cblxuLyoqIFNuYXBzaG90IGhhc2hlcyBiZWZvcmUgYW5kIGR1cmluZyB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheSBpbmNsdWRlIHN0b25lcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5oaXN0b3JpY2FsSGFzaCA/PyBmYWxzZTtcbn1cblxuLyoqIEEgbWlncmF0ZWQgc25hcHNob3QgYWxyZWFkeSBoYXMgcmV0aXJlbWVudCB0b21ic3RvbmVzIGluIGdlbmVyYXRlZCBjaHVua3MuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5taWdyYXRlZCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lm1pZ3JhdGVkID8/IGZhbHNlO1xufVxuXG4vKiogRXhpdCBoaXN0b3JpY2FsIG1vZGUgYWZ0ZXIgYWxsIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBoYXNoZXMgaGF2ZSBwYXNzZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZmluaXNoU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSBmYWxzZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSBmYWxzZTtcbiAgc3RhdGUubWlncmF0ZWQgPSB0cnVlO1xufVxuIiwgIi8vIFNpbXVsYXRpb24gbGF5ZXIgXHUyMDE0IHB1cmUgVHlwZVNjcmlwdCwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDEgd29ybGQgZm91bmRhdGlvbjogYSBjaHVua2VkLCBnZW51aW5lbHkgdGhyZWUtZGltZW5zaW9uYWwgdm94ZWwgd29ybGQuXG4vLyBUaGUgc3RvcmVkIHN0YXRlIGlzIG9uZSBtYXRlcmlhbCBieXRlIHBlciBjZWxsICgwID0gYWlyKTsgb2NjdXBhbmN5IGlzXG4vLyBpbXBsaWNpdC4gU3VyZmFjZSBoZWlnaHQgaXMgYSBkZXJpdmVkIHF1ZXJ5LCBub3QgdGhlIHN0b3JhZ2UuIFRoaXMgcmVwbGFjZXNcbi8vIHRoZSBmb3JtZXIgMjU2IHggMjU2IGhlaWdodGZpZWxkIChzZWUgSVItMDA1KS5cbi8vXG4vLyBXb3JsZCBtZXRyZXM6IHgveiBpbiBbLTEwMjQsIDEwMjQpLCB5IGluIFstMTYsIDExMiksIHNlYSBsZXZlbCAwLlxuLy8gQSBjaHVuayBpcyAzMiB4IDMyIHggMTI4IGNlbGxzLiBHZW5lcmF0aW9uIGlzIGEgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCxcbi8vIGdlbmVyYXRvciB2ZXJzaW9uLCBwYXJhbWV0ZXJzIGFuZCBjaHVuayBjb29yZGluYXRlczsgZWRpdHMgYXJlIHJlY29yZGVkXG4vLyBzZXBhcmF0ZWx5IGFuZCByZS1hcHBsaWVkIHdoZW4gYSBjaHVuayBpcyByZWdlbmVyYXRlZC5cbmltcG9ydCB0eXBlIHsgU3RydWN0dXJlIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB0eXBlIHsgTGlmZVN0YXRlIH0gZnJvbSAnLi9lY29ub215JztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5cbmV4cG9ydCBjb25zdCBXT1JMRF9TSVpFID0gMjA0ODtcbmV4cG9ydCBjb25zdCBIQUxGID0gV09STERfU0laRSAvIDI7XG5leHBvcnQgY29uc3QgQ0hVTktfU0laRSA9IDMyO1xuZXhwb3J0IGNvbnN0IENIVU5LU19QRVJfU0lERSA9IFdPUkxEX1NJWkUgLyBDSFVOS19TSVpFO1xuZXhwb3J0IGNvbnN0IFlfTUlOID0gLTE2O1xuZXhwb3J0IGNvbnN0IFlfTUFYID0gMTEyO1xuZXhwb3J0IGNvbnN0IFdPUkxEX0hFSUdIVCA9IFlfTUFYIC0gWV9NSU47XG5leHBvcnQgY29uc3QgU0VBX0xFVkVMID0gMDtcbmV4cG9ydCBjb25zdCBXQVRFUiA9IFNFQV9MRVZFTDtcbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVkVSU0lPTiA9IDE7XG5leHBvcnQgY29uc3QgQ0hVTktfVk9MVU1FID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkUgKiBXT1JMRF9IRUlHSFQ7XG5leHBvcnQgY29uc3QgQ0hVTktfQVJFQSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFO1xuXG5leHBvcnQgY29uc3QgTUFUID0ge1xuICBBSVI6IDAsXG4gIEdSQVNTOiAxLFxuICBTT0lMOiAyLFxuICBTQU5EOiAzLFxuICBHUkFWRUw6IDQsXG4gIFNUT05FOiA1LFxuICBPUkU6IDYsXG4gIFdBVEVSOiA3LFxuICBCRURST0NLOiA4LFxuICBNT1NTOiA5LFxufSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIE1hdElkID0gKHR5cGVvZiBNQVQpW2tleW9mIHR5cGVvZiBNQVRdO1xuXG5leHBvcnQgY29uc3QgaXNTb2xpZCA9IChtOiBudW1iZXIpOiBib29sZWFuID0+IG0gIT09IE1BVC5BSVIgJiYgbSAhPT0gTUFULldBVEVSO1xuZXhwb3J0IGNvbnN0IGlzT3BhcXVlID0gaXNTb2xpZDtcblxuZXhwb3J0IGNvbnN0IGNsYW1wID0gKHY6IG51bWJlciwgYTogbnVtYmVyLCBiOiBudW1iZXIpID0+ICh2IDwgYSA/IGEgOiB2ID4gYiA/IGIgOiB2KTtcbmV4cG9ydCBjb25zdCBsZXJwID0gKGE6IG51bWJlciwgYjogbnVtYmVyLCB0OiBudW1iZXIpID0+IGEgKyAoYiAtIGEpICogdDtcbmNvbnN0IHNtb290aHN0ZXAgPSAoZTA6IG51bWJlciwgZTE6IG51bWJlciwgeDogbnVtYmVyKSA9PiB7XG4gIGNvbnN0IHQgPSBjbGFtcCgoeCAtIGUwKSAvIChlMSAtIGUwKSwgMCwgMSk7XG4gIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xufTtcblxuLy8gLS0tLS0tLS0tLSBkZXRlcm1pbmlzdGljIGhhc2ggLyBub2lzZSAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gaGFzaDJpKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoM2koeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKSBeIE1hdGguaW11bCh6LCAyMjQ2ODIyNTE5KTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbXVsYmVycnkzMihzZWVkOiBudW1iZXIpOiAoKSA9PiBudW1iZXIge1xuICBsZXQgYSA9IHNlZWQgPj4+IDA7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgYSA9IChhICsgMHg2ZDJiNzlmNSkgPj4+IDA7XG4gICAgbGV0IHQgPSBhO1xuICAgIHQgPSBNYXRoLmltdWwodCBeICh0ID4+PiAxNSksIHQgfCAxKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgdCB8IDYxKTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cblxuY29uc3Qgc21vb3RoID0gKHQ6IG51bWJlcikgPT4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcblxuZnVuY3Rpb24gdmFsdWVOb2lzZTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpO1xuICBjb25zdCBhID0gaGFzaDJpKHhpLCB5aSwgc2VlZCksIGIgPSBoYXNoMmkoeGkgKyAxLCB5aSwgc2VlZCk7XG4gIGNvbnN0IGMgPSBoYXNoMmkoeGksIHlpICsgMSwgc2VlZCksIGQgPSBoYXNoMmkoeGkgKyAxLCB5aSArIDEsIHNlZWQpO1xuICBjb25zdCB0b3AgPSBhICsgKGIgLSBhKSAqIHhmO1xuICBjb25zdCBib3R0b20gPSBjICsgKGQgLSBjKSAqIHhmO1xuICByZXR1cm4gdG9wICsgKGJvdHRvbSAtIHRvcCkgKiB5Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTIoeCAqIGZyZXEsIHkgKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG5mdW5jdGlvbiB2YWx1ZU5vaXNlMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KSwgemkgPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpLCB6ZiA9IHNtb290aCh6IC0gemkpO1xuICBjb25zdCBjMDAwID0gaGFzaDNpKHhpLCB5aSwgemksIHNlZWQpLCBjMTAwID0gaGFzaDNpKHhpICsgMSwgeWksIHppLCBzZWVkKTtcbiAgY29uc3QgYzAxMCA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSwgc2VlZCksIGMxMTAgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppLCBzZWVkKTtcbiAgY29uc3QgYzAwMSA9IGhhc2gzaSh4aSwgeWksIHppICsgMSwgc2VlZCksIGMxMDEgPSBoYXNoM2koeGkgKyAxLCB5aSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgYzAxMSA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpLCBjMTExID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCB4MDAgPSBjMDAwICsgKGMxMDAgLSBjMDAwKSAqIHhmO1xuICBjb25zdCB4MTAgPSBjMDEwICsgKGMxMTAgLSBjMDEwKSAqIHhmO1xuICBjb25zdCB4MDEgPSBjMDAxICsgKGMxMDEgLSBjMDAxKSAqIHhmO1xuICBjb25zdCB4MTEgPSBjMDExICsgKGMxMTEgLSBjMDExKSAqIHhmO1xuICBjb25zdCB5MCA9IHgwMCArICh4MTAgLSB4MDApICogeWY7XG4gIGNvbnN0IHkxID0geDAxICsgKHgxMSAtIHgwMSkgKiB5ZjtcbiAgcmV0dXJuIHkwICsgKHkxIC0geTApICogemY7XG59XG5cbmZ1bmN0aW9uIGZibTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMyh4ICogZnJlcSwgeSAqIGZyZXEsIHogKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG4vLyAtLS0tLS0tLS0tIHdvcmxkIHR5cGVzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRQYXJhbXMge1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9QQVJBTVM6IFdvcmxkUGFyYW1zID0ge1xuICBzaXplOiBXT1JMRF9TSVpFLFxuICBjaHVua1NpemU6IENIVU5LX1NJWkUsXG4gIHlNaW46IFlfTUlOLFxuICB5TWF4OiBZX01BWCxcbiAgc2VhTGV2ZWw6IFNFQV9MRVZFTCxcbiAgZ2VuZXJhdG9yVmVyc2lvbjogR0VORVJBVE9SX1ZFUlNJT04sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBrZXk6IHN0cmluZztcbiAgLyoqIHggKyB6KjMyICsgKHktWV9NSU4pKjEwMjQgKi9cbiAgZGF0YTogVWludDhBcnJheTtcbiAgLyoqIHRvcCBzb2xpZCB5LCBlbmNvZGVkIGFzICh5IC0gWV9NSU4pLCAwLi4xMjc7IDAgbWVhbnMgbm8gc29saWQuICovXG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3AgbWF0ZXJpYWwgcGVyIGNvbHVtbi4gKi9cbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbiAgZGlydHk6IGJvb2xlYW47XG4gIGdlbmVyYXRlZEF0OiBudW1iZXI7XG59XG5cbi8vIE5hdHVyYWwgYXNzZXRzIGFyZSB0aGUgcHJvamVjdCdzIFN0eWwgKGBuYXRfYCkgcGlwZWxpbmUgKEFTLTAwMSB2MiksIG5vdFxuLy8gTm94ZWwgYXJjaGl0ZWN0dXJlLiBOb3hlbCByZW1haW5zIHRoZSBodW1hbi1tYWRlIGtpdC93YXlzdG9uZS9tYXJrZXIgc3lzdGVtLlxuLy8gUmV0aXJlZCBvbmx5IGFzIHdvcmxkIGNvbnRlbnQuIFRoZSBuYW1lcyByZW1haW4gaW4gdGhlIHNlcmlhbGl6ZWQgdHlwZSBzb1xuLy8gb2xkIHNuYXBzaG90cyBhbmQgYWNjZXB0ZWQgaGFydmVzdCBqb3VybmFscyBjYW4gYmUgbWlncmF0ZWQgd2l0aG91dCByZWplY3Rpbmdcbi8vIG90aGVyd2lzZSB2YWxpZCBzYXZlcy4gR2VuZXJhdGlvbiwgY29sbGlzaW9uIGFuZCBpbnNwZWN0aW9uIG5ldmVyIHVzZSB0aGVtLlxuZXhwb3J0IGNvbnN0IFJFVElSRURfU1RPTkVfS0lORFMgPSBuZXcgU2V0PEVudGl0eUtpbmQ+KFtcbiAgJ3N0eWxfcm9ja19zbWFsbCcsICdzdHlsX3JvY2tfbWVkaXVtJywgJ3N0eWxfcm9ja19sYXJnZScsXG5dKTtcbmV4cG9ydCBjb25zdCBpc1JldGlyZWRTdG9uZUtpbmQgPSAoa2luZDogRW50aXR5S2luZCk6IGJvb2xlYW4gPT4gUkVUSVJFRF9TVE9ORV9LSU5EUy5oYXMoa2luZCk7XG5leHBvcnQgdHlwZSBBY3RpdmVFbnRpdHlLaW5kID0gRXhjbHVkZTxFbnRpdHlLaW5kLFxuICAnc3R5bF9yb2NrX3NtYWxsJyB8ICdzdHlsX3JvY2tfbWVkaXVtJyB8ICdzdHlsX3JvY2tfbGFyZ2UnPjtcblxuZnVuY3Rpb24gbGl2ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBFbnRpdHkgfCBudWxsIHtcbiAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgcmV0dXJuICFlbnRpdHkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhpZCkgPyBudWxsIDogZW50aXR5O1xufVxuXG5leHBvcnQgdHlwZSBFbnRpdHlLaW5kID1cbiAgfCAnc3R5bF90cmVlX3NwaXJlJ1xuICB8ICdzdHlsX3RyZWVfdGFibGUnXG4gIHwgJ3N0eWxfdHJlZV9jbHVzdGVyJ1xuICB8ICdzdHlsX3RyZWVfYmxvc3NvbSdcbiAgfCAnc3R5bF9zaHJ1YidcbiAgfCAnc3R5bF9yb2NrX3NtYWxsJ1xuICB8ICdzdHlsX3JvY2tfbWVkaXVtJ1xuICB8ICdzdHlsX3JvY2tfbGFyZ2UnXG4gIHwgJ3N0eWxfb3JlJ1xuICB8ICdzdHlsX2NhaXJuJ1xuICB8ICd3YXlzdG9uZSdcbiAgfCAnbWFya2VyJztcblxuZXhwb3J0IHR5cGUgUmVzb3VyY2VUeXBlID0gJ3dvb2QnIHwgJ3N0b25lJyB8ICdvcmUnIHwgJ2ZpYmVyJztcblxuZXhwb3J0IGludGVyZmFjZSBFbnRpdHkge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICBjaHVuazogc3RyaW5nO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgc2NhbGU6IG51bWJlcjtcbiAgdmFyaWFudDogbnVtYmVyO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgcmVtYWluaW5nOiBudW1iZXI7XG4gIHlpZWxkUGVySGFydmVzdDogbnVtYmVyO1xuICAvKiogVHJ1ZSBvbmNlIHRoZSBlbnRpdHkgaXMgZnVsbHkgZGVwbGV0ZWQuICovXG4gIGhhcnZlc3RlZDogYm9vbGVhbjtcbiAgLyoqIFRydWUgYWZ0ZXIgdGhlIGZpcnN0IHN1Y2Nlc3NmdWwgaGFydmVzdCwgZXZlbiBpZiB5aWVsZCByZW1haW5zLiAqL1xuICBoYXJ2ZXN0ZWRPbmNlPzogYm9vbGVhbjtcbiAgcHJvdmlzaW9uYWw6IGJvb2xlYW47XG4gIGF1dGhvcmVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5veGVsU2l0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHByb3Zpc2lvbmFsOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZ2lvbkluZm8ge1xuICBpZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICB0eXBlOiAncGxhaW4nIHwgJ2ZvcmVzdCcgfCAnaGlsbHMnIHwgJ2hpZ2hsYW5kJyB8ICd3YXRlcicgfCAncmlkZ2UnO1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICByeDogbnVtYmVyO1xuICByejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkU3RhdHMge1xuICBjaHVua3NHZW5lcmF0ZWQ6IG51bWJlcjtcbiAgY2h1bmtzRXZpY3RlZDogbnVtYmVyO1xuICB2b3hlbHNGaWxsZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGlvbk1zOiBudW1iZXI7XG4gIGVudGl0aWVzOiBudW1iZXI7XG4gIHRyZWVzOiBudW1iZXI7XG4gIHBpbmtUcmVlczogbnVtYmVyO1xuICBwaW5rT3ZlcmZsb3c6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcGFyYW1zOiBXb3JsZFBhcmFtcztcbiAgY2h1bmtzOiBNYXA8c3RyaW5nLCBWb3hlbENodW5rPjtcbiAgZW50aXRpZXM6IE1hcDxzdHJpbmcsIEVudGl0eT47XG4gIGVudGl0eUNodW5rczogTWFwPHN0cmluZywgc3RyaW5nW10+O1xuICAvKiogQ2h1bmtzIHdob3NlIGRldGVybWluaXN0aWMgbmF0dXJhbC1lbnRpdHkgc3RhdGUgaGFzIGJlZW4gY2hhbmdlZC4gKi9cbiAgZW50aXR5Q2hhbmdlczogU2V0PHN0cmluZz47XG4gIC8qKiBUb21ic3RvbmVzIGZvciByZW1vdmVkIGRldGVybWluaXN0aWMgbmF0dXJhbCBlbnRpdGllcy4gKi9cbiAgZW50aXR5UmVtb3ZhbHM6IFNldDxzdHJpbmc+O1xuICAvKiogQXV0aG9yaXRhdGl2ZSBidWlsdCBzdHJ1Y3R1cmVzIChob3VzZSwgcGF0aCwgdGVycmFjZXMsIGNyb3BzKS4gKi9cbiAgc3RydWN0dXJlczogTWFwPHN0cmluZywgU3RydWN0dXJlPjtcbiAgc2l0ZXM6IE5veGVsU2l0ZVtdO1xuICByZWdpb25zOiBSZWdpb25JbmZvW107XG4gIC8qKiBjaHVuayBrZXkgLT4gbG9jYWwgdm94ZWwgaW5kZXggLT4gbWF0ZXJpYWwuIER1cmFibGUsIGNvbXBhY3QgZWRpdHMuICovXG4gIGVkaXRzOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCBudW1iZXI+PjtcbiAgLyoqIEdsb2JhbCBsb2NhbC1wbGF5ZXIgY2FycmllZCBiYWc7IGJvdW5kZWQgaW4gc2NoZW1hIDMsIGxlZ2FjeSBpbiAxLzIuICovXG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgLyoqIFByZXNlbnQgb25seSBhZnRlciBzY2hlbWEtMyBnZW5lc2lzL3Jlc3RvcmF0aW9uLiAqL1xuICBsaWZlPzogTGlmZVN0YXRlO1xuICBkaXJ0eTogU2V0PHN0cmluZz47XG4gIHN0YXRzOiBXb3JsZFN0YXRzO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqXG4gICAqIE1vbm90b25pYyByZXZpc2lvbiBvZiBhdXRob3JpdGF0aXZlIHN0YXRlICh2b3hlbHMgYW5kIGVudGl0aWVzKS4gRGVyaXZlZFxuICAgKiBjYWNoZXMga2V5ZWQgb24gdGhpcyB2YWx1ZSBhcmUgZGlzY2FyZGVkIGFmdGVyIGFuIGVkaXQ7IG1lc2gvbmF2aWdhdGlvblxuICAgKiByZXZpc2lvbnMgYXJlIHNlcGFyYXRlIGJlY2F1c2UgdGhleSBhcmUgZGVyaXZlZCwgbm90IHdvcmxkIHN0YXRlLlxuICAgKi9cbiAgcmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGNodW5rS2V5ID0gKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpID0+IGAke2N4fSwke2N6fWA7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5YID0gKGN4OiBudW1iZXIpID0+IGN4ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5aID0gKGN6OiBudW1iZXIpID0+IGN6ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgbG9jYWxJbmRleCA9IChseDogbnVtYmVyLCB5SW5kZXg6IG51bWJlciwgbHo6IG51bWJlcikgPT5cbiAgbHggKyBseiAqIENIVU5LX1NJWkUgKyB5SW5kZXggKiBDSFVOS19BUkVBO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ggPSAoeDogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh4ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtaID0gKHo6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeiArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWCA9ICh4OiBudW1iZXIpID0+IHggLSAod29ybGRUb0NodW5rWCh4KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxaID0gKHo6IG51bWJlcikgPT4geiAtICh3b3JsZFRvQ2h1bmtaKHopICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHlUb0luZGV4ID0gKHk6IG51bWJlcikgPT4geSAtIFlfTUlOO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGQoc2VlZCA9IDEzMzcpOiBXb3JsZCB7XG4gIHJldHVybiB7XG4gICAgc2VlZCxcbiAgICBwYXJhbXM6IHsgLi4uREVGQVVMVF9QQVJBTVMgfSxcbiAgICBjaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdGllczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNoYW5nZXM6IG5ldyBTZXQoKSxcbiAgICBlbnRpdHlSZW1vdmFsczogbmV3IFNldCgpLFxuICAgIHN0cnVjdHVyZXM6IG5ldyBNYXAoKSxcbiAgICBzaXRlczogW10sXG4gICAgcmVnaW9uczogUkVHSU9OUyxcbiAgICBlZGl0czogbmV3IE1hcCgpLFxuICAgIGludmVudG9yeToge30sXG4gICAgZGlydHk6IG5ldyBTZXQoKSxcbiAgICBzdGF0czoge1xuICAgICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICAgIGVudGl0aWVzOiAwLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gICAgfSxcbiAgICBhdXRob3JlZFBsYWNlZDogZmFsc2UsXG4gICAgcmV2aXNpb246IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBpbml0aWFsUmFkaXVzID0gMCk6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVZFTCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIHJldHVybiBNQVQuU1RPTkU7XG59XG5cbmZ1bmN0aW9uIG9yZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBjbHVzdGVyID0gZmJtMih4IC8gNTUsIHogLyA1NSwgc2VlZCArIDEzMCwgMik7XG4gIGlmIChjbHVzdGVyIDwgMC41NykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBuID0gdmFsdWVOb2lzZTMoeCAqIDAuMDksIHkgKiAwLjEzLCB6ICogMC4wOSwgc2VlZCArIDEzMSk7XG4gIGNvbnN0IG4yID0gdmFsdWVOb2lzZTMoeCAqIDAuMjIgKyA1LCB5ICogMC4zMSwgeiAqIDAuMjIgLSAzLCBzZWVkICsgMTMyKTtcbiAgcmV0dXJuIG4gPiAwLjcwICYmIG4yID4gMC41MDtcbn1cblxuZnVuY3Rpb24gY2F2ZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gZmJtMyh4ICogMC4wNzUsIHkgKiAwLjExLCB6ICogMC4wNzUsIHNlZWQgKyAxNDAsIDIpID4gMC43Mjtcbn1cblxuZnVuY3Rpb24gb3ZlcmhhbmdBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHZhbHVlTm9pc2UzKHggKiAwLjE4LCB5ICogMC4yMiwgeiAqIDAuMTgsIHNlZWQgKyAxNDEpID4gMC42Mjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeTogbnVtYmVyO1xuICB0b3A6IE1hdElkO1xuICBzbG9wZTogbnVtYmVyO1xufVxuXG4vKiogQmFzZSBzdXJmYWNlIHNhbXBsZSBmb3IgbWFjcm8gTE9ELiBEb2VzIG5vdCBpbmNsdWRlIHZveGVsIGVkaXRzL292ZXJoYW5ncy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVTdXJmYWNlKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBTdXJmYWNlU2FtcGxlIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgY29uc3Qgc2xvcGUgPSBzbG9wZUF0KHNlZWQsIHgsIHosIHkpO1xuICByZXR1cm4geyB5LCB0b3A6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgeSwgc2xvcGUpLCBzbG9wZSB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNodW5rIGdlbmVyYXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgcmV0dXJuIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcblxuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfVk9MVU1FKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCB0b3BNYXRlcmlhbHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGNvbnN0IHNlZWQgPSB3b3JsZC5zZWVkO1xuXG4gIC8vIFBhZGRlZCBoZWlnaHQgY2FjaGU6IGEgdGhyZWUtY2VsbCBib3JkZXIgY292ZXJzIHNsb3BlLCBiZWFjaCBhbmQgbGVkZ2VzLlxuICBjb25zdCBQID0gMztcbiAgY29uc3QgUFcgPSBDSFVOS19TSVpFICsgUCAqIDI7XG4gIGNvbnN0IGJhc2VIID0gbmV3IEludDE2QXJyYXkoUFcgKiBQVyk7XG4gIGZvciAobGV0IHB6ID0gMDsgcHogPCBQVzsgcHorKykge1xuICAgIGZvciAobGV0IHB4ID0gMDsgcHggPCBQVzsgcHgrKykge1xuICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCBveCArIHB4IC0gUCwgb3ogKyBweiAtIFApO1xuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB0b3AgPSB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHNlYSBsZXZlbC5cbiAgICAgIGlmIChoIDwgU0VBX0xFVkVMKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCBTRUFfTEVWRUw7IHkrKykge1xuICAgICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseik7XG4gICAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgICAgZGF0YVtpZHhdID0gTUFULldBVEVSO1xuICAgICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvcFNvbGlkID0gTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLm1heChZX01JTiwgaCAtIDEpKTtcbiAgICAgIGhlaWdodHNbY29sXSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2NvbF0gPSB0b3A7XG4gICAgfVxuICB9XG5cbiAgLy8gUHJvdHJ1ZGluZyBsZWRnZXM6IG9uZSBvciB0d28gc3RvbmUgYmxvY2tzIGV4dGVuZCBmcm9tIGEgaGlnaCBjb2x1bW4gb3ZlclxuICAvLyBhIGxvd2VyIG5laWdoYm91ci4gVGhleSBjcmVhdGUgcmVhZGFibGUgb3ZlcmhhbmdzIHdpdGhvdXQgYSBmdWxsIGNhdmUgcGFzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGlmIChzbG9wZSA8IDIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZGlyczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBkaXJzKSB7XG4gICAgICAgIGNvbnN0IG54ID0gbHggKyBkeCwgbnogPSBseiArIGR6O1xuICAgICAgICBpZiAobnggPCAwIHx8IG56IDwgMCB8fCBueCA+PSBDSFVOS19TSVpFIHx8IG56ID49IENIVU5LX1NJWkUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBuaCA9IGJhc2VIWyhueiArIFApICogUFcgKyAobnggKyBQKV07XG4gICAgICAgIGlmIChoIC0gbmggPCAyKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGhhc2gzaShseCwgbHosIGR4ICogMyArIGR6ICogNywgc2VlZCArIDE1MCkgPCAwLjU1KSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgeSA9IGggLSAyO1xuICAgICAgICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gaCkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobngsIHlUb0luZGV4KHkpLCBueik7XG4gICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuU1RPTkU7XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZWNvbXB1dGUgdGhlIGNvbHVtbiBjYWNoZSBhZnRlciBsZWRnZXMvY2F2ZXMuIFRoZSBleHBvc2VkIHRvcCBtYXRlcmlhbFxuICAvLyBtdXN0IGNvbWUgZnJvbSB0aGUgYWN0dWFsIHRvcCBzb2xpZCB2b3hlbCwgbm90IHRoZSBwcmUtY2FydmUgZ3Vlc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgbGV0IHRvcE1hdDogbnVtYmVyID0gdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICBjb25zdCBtID0gZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgfVxuICAgICAgaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0b3BNYXQ7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY2h1bms6IFZveGVsQ2h1bmsgPSB7XG4gICAgY3gsIGN6LCBrZXksIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyLFxuICAgIGRpcnR5OiB0cnVlLFxuICAgIGdlbmVyYXRlZEF0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgfTtcblxuICAvLyBBcHBseSBkdXJhYmxlIGVkaXRzIGFmdGVyIGJhc2UgZ2VuZXJhdGlvbi5cbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgaWYgKGVkaXRzKSB7XG4gICAgZm9yIChjb25zdCBbaWR4LCBtXSBvZiBlZGl0cykge1xuICAgICAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgICB9XG4gICAgLy8gUmVjb21wdXRlIHRoZSBjYWNoZSBmb3IgZWRpdGVkIGNodW5rcy5cbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCBseCwgbHopO1xuICAgIH1cbiAgfVxuICAvLyBOb24tYWlyIGNvdW50cyBhcmUgZGVyaXZlZCByZW5kZXJlciBzdGF0aXN0aWNzLCBub3QgZHVyYWJsZSB3b3JsZCBzdGF0ZS5cbiAgLy8gRWRpdGVkIGJhc2UgYWlyIG1heSBiZWNvbWUgc29saWQgKGFuZCB2aWNlIHZlcnNhKSBkdXJpbmcgcmVzdG9yYXRpb24uXG4gIGxldCBlZGl0ZWROb25BaXIgPSAwO1xuICBmb3IgKGNvbnN0IG1hdGVyaWFsIG9mIGNodW5rLmRhdGEpIGlmIChtYXRlcmlhbCAhPT0gTUFULkFJUikgZWRpdGVkTm9uQWlyKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBlZGl0ZWROb25BaXIgLSBub25BaXI7XG5cbiAgd29ybGQuY2h1bmtzLnNldChrZXksIGNodW5rKTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBub25BaXI7XG4gIHdvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyArPSBwZXJmb3JtYW5jZS5ub3coKSAtIHQwO1xuICB3b3JsZC5kaXJ0eS5hZGQoa2V5KTtcblxuICBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkLCBjaHVuayk7XG4gIHJldHVybiBjaHVuaztcbn1cblxuLyoqIEEgYmFzZS10ZXJyYWluIGNhY2hlIHNoYXJlZCBieSBlZGl0ZWQgYW5kIHVuZWRpdGVkIHJlZ2VuZXJhdGlvbi4gTmF0dXJhbFxuICogc2NlbmVyeSBuZXZlciBkZXBlbmRzIG9uIGxhdGVyIHZveGVsIGVkaXRzOyB0aGlzIGFsc28gbGV0cyBhIHNuYXBzaG90IHJlc3RvcmVcbiAqIGEgaGFydmVzdGVkIGNodW5rIHdpdGhvdXQgbWF0ZXJpYWxpemluZyB1bnJlbGF0ZWQgbmVpZ2hib3VyaW5nIGNodW5rcy4gKi9cbmNvbnN0IGJhc2VDb2x1bW5DYWNoZSA9IG5ldyBXZWFrTWFwPFdvcmxkLCBNYXA8c3RyaW5nLCB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheSB9Pj4oKTtcblxuZnVuY3Rpb24gYmFzZUNvbHVtbnMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0ge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlLmdldChjaHVuay5rZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBjb2x1bW5zID0geyBoZWlnaHRzOiBuZXcgVWludDhBcnJheShjaHVuay5oZWlnaHRzKSwgdG9wTWF0ZXJpYWxzOiBuZXcgVWludDhBcnJheShjaHVuay50b3BNYXRlcmlhbHMpIH07XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpICsgbHgsIHogPSBjaHVua09yaWdpblooY2h1bmsuY3opICsgbHo7XG4gICAgICBjb25zdCBoID0gc3VyZmFjZUhlaWdodEF0KHdvcmxkLnNlZWQsIHgsIHopO1xuICAgICAgY29uc3Qgc2xvcGUgPSBzbG9wZUF0KHdvcmxkLnNlZWQsIHgsIHosIGgpO1xuICAgICAgY29uc3QgaW5kZXggPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbHVtbnMuaGVpZ2h0c1tpbmRleF0gPSBjbGFtcChoIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgY29sdW1ucy50b3BNYXRlcmlhbHNbaW5kZXhdID0gdG9wTWF0ZXJpYWxBdCh3b3JsZC5zZWVkLCB4LCB6LCBoLCBzbG9wZSk7XG4gICAgfVxuICB9XG4gIGNhY2hlLnNldChjaHVuay5rZXksIGNvbHVtbnMpO1xuICByZXR1cm4gY29sdW1ucztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV2aWN0Q2h1bmsod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5jaHVua3MuZGVsZXRlKGtleSk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0V2aWN0ZWQrKztcbiAgLy8gQ2h1bmsgYnl0ZXMgYW5kIGNvbHVtbiBjYWNoZXMgYXJlIHJlZ2VuZXJhdGVkIG9uIGRlbWFuZC4gRW50aXRpZXMgcmVtYWluXG4gIC8vIGF1dGhvcml0YXRpdmU6IGV2aWN0aW9uIG11c3Qgbm90IGZvcmdldCB0aGVpciBwZXJzaXN0ZW50IHN0YXRlLlxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBxdWVyaWVzIC8gZWRpdHMgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGdldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgbTogTWF0SWQpOiBib29sZWFuIHtcbiAgaWYgKHkgPCBZX01JTiB8fCB5ID49IFlfTUFYKSByZXR1cm4gZmFsc2U7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpO1xuICBjb25zdCBwcmV2aW91c0VkaXQgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk/LmdldChpZHgpO1xuICAvLyBBIGNodW5rIGV2aWN0ZWQgYWZ0ZXIgYW4gZWFybGllciBlZGl0IGNhbiByZWdlbmVyYXRlIHdpdGggdGhhdCBkdXJhYmxlXG4gIC8vIG1hdGVyaWFsIGFscmVhZHkgYXBwbGllZC4gRHJvcHBpbmcgdGhlIGVkaXQgaGVyZSB3b3VsZCBtYWtlIGl0IGRpc2FwcGVhclxuICAvLyBvbiB0aGUgbmV4dCBldmljdGlvbi9yZXN0b3JhdGlvbiwgZXZlbiB0aG91Z2ggdGhlIGN1cnJlbnQgd3JpdGUgbm8tb3BzLlxuICBpZiAocHJldmlvdXNFZGl0ID09PSBtKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBmYWxzZTtcbiAgbGV0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rLmtleSk7XG4gIGlmICghZWRpdHMpIHsgZWRpdHMgPSBuZXcgTWFwKCk7IHdvcmxkLmVkaXRzLnNldChjaHVuay5rZXksIGVkaXRzKTsgfVxuICAvLyBBbiBpZGVtcG90ZW50IHdyaXRlIG11c3Qgc3RpbGwgcmVzdG9yZSBhIGR1cmFibGUgZGVsdGEgZGlzY2FyZGVkIGJ5IGFuXG4gIC8vIG9sZGVyIHNuYXBzaG90IG9yIGRlbHRhIGRlY29kZXIuIEl0IGlzIG5vdCBhIG5ldyBhdXRob3JpdGF0aXZlIHJldmlzaW9uLlxuICBpZiAoY2h1bmsuZGF0YVtpZHhdID09PSBtKSB7XG4gICAgaWYgKCFlZGl0cy5oYXMoaWR4KSkgZWRpdHMuc2V0KGlkeCwgbSk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gIGVkaXRzLnNldChpZHgsIG0pO1xuICBjaHVuay5kaXJ0eSA9IHRydWU7XG4gIHdvcmxkLmRpcnR5LmFkZChjaHVuay5rZXkpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgd29ybGRUb0xvY2FsWCh4KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDb2x1bW5DYWNoZShjaHVuazogVm94ZWxDaHVuaywgbHg6IG51bWJlciwgbHo6IG51bWJlcik6IHZvaWQge1xuICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgaWYgKGlzU29saWQoY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSkpIHsgdG9wU29saWQgPSB5OyBicmVhazsgfVxuICB9XG4gIGNodW5rLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gIGNvbnN0IHRtID0gY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgaWYgKHRvcFNvbGlkID49IFlfTUlOKSB7XG4gICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgodG9wU29saWQpLCBseildO1xuICAgIGlmIChtICE9PSBNQVQuV0FURVIpIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBtO1xuICB9IGVsc2Uge1xuICAgIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0bTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSB5IGNvb3JkaW5hdGUgb2YgdGhlIGV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbiBhdCB4L3ouXG4gKiBBIHNvbGlkIHZveGVsIGF0IHkgb2NjdXBpZXMgW3ksIHkrMSksIHNvIHRoZSB3YWxrYWJsZSBzdXJmYWNlIGlzIHRvcFNvbGlkKzEuXG4gKiBUaGlzIGlzIGEgZGVyaXZlZCBxdWVyeTsgdGhlIGF1dGhvcml0YXRpdmUgc3RhdGUgcmVtYWlucyB0aGUgdm94ZWwgdm9sdW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gWV9NSU47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gWV9NSU47XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLnRvcE1hdGVyaWFsc1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBoID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgLSBoIDogMDtcbn1cblxuLy8gLS0tLS0tLS0tLSBlbnRpdGllcyAtLS0tLS0tLS0tXG5mdW5jdGlvbiBhZGRFbnRpdHkod29ybGQ6IFdvcmxkLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLmhhcyhlLmlkKSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgcmV0dXJuO1xuICB3b3JsZC5lbnRpdGllcy5zZXQoZS5pZCwgZSk7XG4gIGxldCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBsaXN0KTsgfVxuICBsaXN0LnB1c2goZS5pZCk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgLy8gR2VuZXJhdGlvbiBpcyBkZXRlcm1pbmlzdGljIGFuZCBhZHZhbmNlcyBubyBwbGF5ZXItY29tbWFuZCBwcmVjb25kaXRpb24uXG4gIC8vIEF1dGhvcmVkIHNjYWZmb2xkaW5nIG1heSB0cmFuc2llbnRseSBjaGFuZ2UgaXQ7IHRoZSBzbmFwc2hvdCByZXN0b3JlcyB0aGVcbiAgLy8gc2F2ZWQgcmV2aXNpb24gYWZ0ZXIgcGxhY2luZyB0aGF0IHNjYWZmb2xkaW5nLlxufVxuXG4vKipcbiAqIFJlbW92ZSBhbiBlbnRpdHkgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB3b3JsZC4gVXNlZCB3aGVuIGEgc2l0ZSBpcyBjbGVhcmVkOlxuICogdGhlIHJlc291cmNlIHlpZWxkIGlzIGFjY291bnRlZCBmb3IgYnkgdGhlIGNhbGxlciwgYW5kIHRoZSBlbnRpdHkgbXVzdCBzdG9wXG4gKiBleGlzdGluZyBmb3IgY29sbGlzaW9uLCBvYnN0cnVjdGlvbiBhbmQgcGVyc2lzdGVuY2UsIG5vdCBqdXN0IGJlIGhpZGRlbiBieVxuICogdGhlIHJlbmRlcmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gIGNvbnN0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAobGlzdCkge1xuICAgIGNvbnN0IGkgPSBsaXN0LmluZGV4T2YoaWQpO1xuICAgIGlmIChpID49IDApIGxpc3Quc3BsaWNlKGksIDEpO1xuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGlkKTtcbiAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZW50aXR5SWQoY2h1bms6IHN0cmluZywgaTogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBlOiR7Y2h1bmt9OiR7aX1gO1xufVxuXG5mdW5jdGlvbiBmb3Jlc3RTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBlYXN0ID0gTWF0aC5leHAoLSgoKHd4IC0gMjIwKSAvIDI2MCkgKiogMiArICgod3ogKyAxMTApIC8gMjIwKSAqKiAyKSk7XG4gIGNvbnN0IG5vcnRoID0gTWF0aC5leHAoLSgoKHd4IC0gMjApIC8gMzAwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAxOTApICoqIDIpKTtcbiAgY29uc3Qgd2VzdCA9IE1hdGguZXhwKC0oKCh3eCArIDM0MCkgLyAyMDApICoqIDIgKyAoKHd6IC0gMTIwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBzb3V0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDEyMCkgLyAyNDApICoqIDIgKyAoKHd6IC0gMzMwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBtb2lzdHVyZSA9IGZibTIod3ggLyAyNjAsIHd6IC8gMjYwLCBzZWVkICsgMjAxLCA0KTtcbiAgY29uc3QgdmFsbGV5ID0gTWF0aC5leHAoLSgod3ggLyAxNDApICoqIDIgKyAod3ogLyAxMDUpICoqIDIpKTtcbiAgcmV0dXJuIE1hdGgubWF4KGVhc3QsIG5vcnRoICogMC45Miwgd2VzdCAqIDAuODAsIHNvdXRoICogMC43OCkgKiAwLjgyXG4gICAgKyBtb2lzdHVyZSAqIDAuMzggLSAwLjIyIC0gdmFsbGV5ICogMC4zNDtcbn1cblxuZnVuY3Rpb24gcm9ja1Njb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IG1vdW50YWluID0gZmJtMih3eCAvIDMzMCwgd3ogLyAzMzAsIHNlZWQgKyAyMDIsIDMpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDE0MCwgd3ogLyAxNDAsIHNlZWQgKyAyMDMsIDMpIC0gMSk7XG4gIHJldHVybiBtb3VudGFpbiAqIDAuNTUgKyByaWRnZSAqIDAuNDU7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRW50aXRpZXMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHZvaWQge1xuICBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkLCBjaHVuay5jeCwgY2h1bmsuY3opO1xufVxuXG4vKiogQGludGVybmFsIFJlcGxheXMgZGV0ZXJtaW5pc3RpYyBnZW5lcmF0aW9uIGZvciBzbmFwc2hvdCBlbnRpdHkgZGVsdGFzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGlmICh3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGtleSkpIHJldHVybjtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuO1xuXG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKGhhc2gyaShjaHVuay5jeCwgY2h1bmsuY3osIHdvcmxkLnNlZWQgKyA5MDApICogNDI5NDk2NzI5NikgPj4+IDApO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgY29uc3QgY29sdW1ucyA9IGJhc2VDb2x1bW5zKHdvcmxkLCBjaHVuayk7XG4gIGxldCBuID0gMDtcbiAgbGV0IG5hdHVyYWxUcmVlcyA9IDA7XG4gIGxldCBuYXR1cmFsUGlua1RyZWVzID0gMDtcblxuICBjb25zdCBsb2NhbFN1cmZhY2UgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gKyBZX01JTjtcbiAgfTtcbiAgY29uc3QgbG9jYWxUb3AgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IE1hdElkID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIGFzIE1hdElkO1xuICB9O1xuICBjb25zdCBsb2NhbFNsb3BlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICByZXR1cm4gTWF0aC5tYXgoXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICk7XG4gIH07XG5cbiAgLy8gQSBqaXR0ZXJlZCA4IG0gbGF0dGljZSBnaXZlcyBjb2hlcmVudCBtYXNzZXMgYW5kIGF2b2lkcyBwZXItZnJhbWUgc2NhdHRlci5cbiAgZm9yIChsZXQgZ3ogPSAwOyBneiA8IENIVU5LX1NJWkU7IGd6ICs9IDgpIHtcbiAgICBmb3IgKGxldCBneCA9IDA7IGd4IDwgQ0hVTktfU0laRTsgZ3ggKz0gOCkge1xuICAgICAgY29uc3QgbHggPSBjbGFtcChNYXRoLmZsb29yKGd4ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3QgbHogPSBjbGFtcChNYXRoLmZsb29yKGd6ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAxKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHNsb3BlID0gbG9jYWxTbG9wZShseCwgbHopO1xuICAgICAgY29uc3QgdG9wID0gbG9jYWxUb3AobHgsIGx6KTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikgY29udGludWU7XG4gICAgICBjb25zdCBmb3Jlc3QgPSBmb3Jlc3RTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9ja3kgPSByb2NrU2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvbGwgPSBybmQoKTtcblxuICAgICAgY29uc3QgdHJlZUNoYW5jZSA9IGZvcmVzdCA+IDAuNTAgPyAwLjcyIDogZm9yZXN0ID4gMC4zMCA/IDAuMjUgOiAwLjA1O1xuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDIgJiYgcm9sbCA8IHRyZWVDaGFuY2UpIHtcbiAgICAgICAgLy8gVGhlIGNhcCBpcyBhIGRldGVybWluaXN0aWMgbmF0dXJhbC1nZW5lcmF0aW9uIHByb3BlcnR5LiBJdCBjYW5ub3RcbiAgICAgICAgLy8gZGVwZW5kIG9uIHdoaWNoIGNodW5rcyBhIHJlbmRlcmVyIGxvYWRlZCBiZWZvcmUgdGhpcyBvbmUuXG4gICAgICAgIGxldCBraW5kOiBFbnRpdHlLaW5kO1xuICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICBjb25zdCBzcGVjaWVzUm9sbCA9IHJuZCgpO1xuICAgICAgICBpZiAoc3BlY2llc1JvbGwgPCAwLjEyKSB7XG4gICAgICAgICAgaWYgKChuYXR1cmFsUGlua1RyZWVzICsgMSkgPiAwLjI1ICogKG5hdHVyYWxUcmVlcyArIDEpKSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rT3ZlcmZsb3crKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfYmxvc3NvbSc7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDIpO1xuICAgICAgICAgICAgbmF0dXJhbFBpbmtUcmVlcysrO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC40MCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3NwaXJlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC43NCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3RhYmxlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgIH1cbiAgICAgICAgbmF0dXJhbFRyZWVzKys7XG4gICAgICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjg4ICsgcm5kKCkgKiAwLjI0LCB2YXJpYW50LFxuICAgICAgICAgIHJlc291cmNlOiAnd29vZCcsIHJlbWFpbmluZzogMTIsIHlpZWxkUGVySGFydmVzdDogNCxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgcm9ja3kgPiAwLjQ2ICYmIHJvbGwgPCAwLjM4KSB7XG4gICAgICAgIC8vIENvbnN1bWUgdGhlIHJldGlyZWQgc3RvbmUgZm9ybSdzIHJhbmRvbSBkcmF3cyBhbmQgYWxsb2NhdGUgaXRzIG9sZFxuICAgICAgICAvLyBzZXF1ZW5jZSBJRCwgYnV0IGRvIG5vdCBpbnNlcnQgYW4gZW50aXR5LiBMYXRlciBuYXR1cmFsIHBsYWNlbWVudHNcbiAgICAgICAgLy8gdGhlcmVmb3JlIHJlbWFpbiBieXRlLWZvci1ieXRlIGNvbXBhdGlibGUgd2l0aCByZWNvcmRlZCBzYXZlcy5cbiAgICAgICAgY29uc3Qgc2l6ZVJvbGwgPSBybmQoKTtcbiAgICAgICAgY29uc3Qga2luZDogRW50aXR5S2luZCA9IHNpemVSb2xsIDwgMC41NSA/ICdzdHlsX3JvY2tfc21hbGwnXG4gICAgICAgICAgOiBzaXplUm9sbCA8IDAuOTAgPyAnc3R5bF9yb2NrX21lZGl1bScgOiAnc3R5bF9yb2NrX2xhcmdlJztcbiAgICAgICAgY29uc3QgaWQgPSBlbnRpdHlJZChjaHVuay5rZXksIG4rKyk7XG4gICAgICAgIGNvbnN0IHJlY29yZCA9IHtcbiAgICAgICAgICBpZCwga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJlc291cmNlOiAnc3RvbmUnIGFzIGNvbnN0LFxuICAgICAgICAgIHJlbWFpbmluZzoga2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyA0IDoga2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gOCA6IDEyLFxuICAgICAgICAgIHlpZWxkUGVySGFydmVzdDogMywgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gT25seSBlbnRpdGllcyB0aGF0IGV4aXN0ZWQgaW4gYW4gYWNjZXB0ZWQgb2xkIHNhdmUgZ2V0IHRvbWJzdG9uZXMsXG4gICAgICAgIC8vIGR1cmluZyBleHBsaWNpdCBtaWdyYXRpb24uIE9yZGluYXJ5IGdlbmVyYXRpb24gbXVzdCByZXN0b3JlIGV4YWN0bHkuXG4gICAgICAgIGlmIChpc1N0b25lUmVwbGF5KHdvcmxkKSkgYWRkRW50aXR5KHdvcmxkLCByZWNvcmQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSAmJiByb2NreSA+IDAuNTggJiYgcm9sbCA8IDAuMTgpIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9vcmUnLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMiksXG4gICAgICAgICAgcmVzb3VyY2U6ICdvcmUnLCByZW1haW5pbmc6IDgsIHlpZWxkUGVySGFydmVzdDogMixcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMSAmJiByb2xsIDwgMC4zMCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX3NocnViJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjggKyBybmQoKSAqIDAuNCwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICAgIHJlc291cmNlOiAnZmliZXInLCByZW1haW5pbmc6IDQsIHlpZWxkUGVySGFydmVzdDogMSxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkQXV0aG9yZWRFbnRpdHkod29ybGQ6IFdvcmxkLCBraW5kOiBFbnRpdHlLaW5kLCB4OiBudW1iZXIsIHo6IG51bWJlciwgdmFyaWFudDogbnVtYmVyLCByb3Q6IG51bWJlciwgc2NhbGU6IG51bWJlciwgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGwsIHJlbWFpbmluZzogbnVtYmVyLCB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHkgPD0gU0VBX0xFVkVMKSByZXR1cm47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAvLyBBIGhlcm8gYXNzZXQgb3ducyBpdHMgc3BvdDogY2xlYXIgYW55IGdlbmVyYXRlZCBlbnRpdHkgdGhhdCB3b3VsZCBvdmVybGFwXG4gIC8vIGl0LCByYXRoZXIgdGhhbiBzaWxlbnRseSBkcm9wcGluZyB0aGUgYXV0aG9yZWQgY29tcG9zaXRpb24uXG4gIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXTtcbiAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChraW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHJldHVybjtcbiAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoZSAmJiBNYXRoLmh5cG90KGUueCAtIHgsIGUueiAtIHopIDwgMi42KSB7XG4gICAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICAgICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICAgICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gICAgfVxuICB9XG4gIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSkpO1xuICAvLyBBdXRob3JlZCBjb21wb3NpdGlvbiBpcyBkdXJhYmxlIHN0YXRlOiBpdCBjYW4gY2xlYXIgb3ZlcmxhcHBpbmcgbmF0dXJhbFxuICAvLyBlbnRpdGllcywgc28gc2F2ZSB0aGUgY29tcGxldGUgYWZmZWN0ZWQgY2h1bmsgcmF0aGVyIHRoYW4gb25seSBpdHMgaGVyb2VzLlxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuXG4gIGNvbnN0IGlkID0gYGhlcm86JHtraW5kfToke01hdGgucm91bmQoeCl9OiR7TWF0aC5yb3VuZCh6KX1gO1xuICBjb25zdCBiZWZvcmUgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICBjb25zdCBlbnRpdHk6IEVudGl0eSA9IHtcbiAgICBpZCwga2luZCwgY2h1bms6IGtleSwgeDogeCArIDAuNSwgeSwgejogeiArIDAuNSxcbiAgICByb3QsIHNjYWxlLCB2YXJpYW50LCByZXNvdXJjZSwgcmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiB0cnVlLFxuICB9O1xuICBhZGRFbnRpdHkod29ybGQsIGVudGl0eSk7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5zaXplID4gYmVmb3JlICYmIGtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHtcbiAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgIGlmIChraW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBpZiAod29ybGQuYXV0aG9yZWRQbGFjZWQpIHJldHVybjtcbiAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSB0cnVlO1xuXG4gIGNvbnN0IHNpdGVzOiBBcnJheTx7IGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJzsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJvdDogbnVtYmVyIH0+ID0gW1xuICAgIHsga2luZDogJ3dheXN0b25lJywgeDogLTEwLCB6OiAtMTQsIHJvdDogMCB9LFxuICAgIHsga2luZDogJ21hcmtlcicsIHg6IC0zMiwgejogLTgsIHJvdDogTWF0aC5QSSAvIDIgfSxcbiAgXTtcbiAgZm9yIChjb25zdCBzIG9mIHNpdGVzKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgcy54LCBzLnopO1xuICAgIGlmICh5IDw9IFNFQV9MRVZFTCkgY29udGludWU7XG4gICAgd29ybGQuc2l0ZXMucHVzaCh7XG4gICAgICBpZDogYHNpdGU6JHtzLmtpbmR9YCxcbiAgICAgIGtpbmQ6IHMua2luZCxcbiAgICAgIHg6IHMueCArIDAuNSwgeSwgejogcy56ICsgMC41LFxuICAgICAgcm90OiBzLnJvdCxcbiAgICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gQSBoZXJvIGdyb3ZlIGNvbXBvc2VkIGluIHRoZSBkZWZhdWx0IGNhbWVyYSdzIHZpZXcgZGlyZWN0aW9uLiBUaGVzZSBhcmVcbiAgLy8gU3R5bCBuYXR1cmFsIGFzc2V0cyAoQVMtMDAxIHYyKSwgbm90IE5veGVsIGFyY2hpdGVjdHVyZTsgdGhlIE5veGVsXG4gIC8vIHdheXN0b25lL21hcmtlciBhYm92ZSByZW1haW4gdGhlIGh1bWFuLW1hZGUgbGFuZG1hcmtzLlxuICBjb25zdCBncm92ZTogQXJyYXk8W0VudGl0eUtpbmQsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXT4gPSBbXG4gICAgWydzdHlsX3RyZWVfc3BpcmUnLCAtMjIsIC0yNiwgMCwgMS4wMCwgMF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtMzQsIC0xOCwgMSwgMC45NSwgTWF0aC5QSSAvIDEyXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTE2LCAtMzQsIDIsIDEuMDAsIE1hdGguUEkgLyA2XSxcbiAgICBbJ3N0eWxfdHJlZV9ibG9zc29tJywgLTI4LCAtMzgsIDAsIDAuOTAsIE1hdGguUEkgLyA0XSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC00MCwgLTMwLCAyLCAxLjA1LCBNYXRoLlBJIC8gM10sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xMiwgLTI0LCAwLCAwLjkwLCBNYXRoLlBJIC8gMi40XSxcbiAgXTtcbiAgZm9yIChjb25zdCBba2luZCwgeCwgeiwgdmFyaWFudCwgc2NhbGUsIHJvdF0gb2YgZ3JvdmUpIHtcbiAgICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwga2luZCwgeCwgeiwgdmFyaWFudCwgcm90LCBzY2FsZSwgJ3dvb2QnLCAxMiwgNCk7XG4gIH1cbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3JvY2tfbWVkaXVtJywgLTYsIC0xMCwgMCwgMCwgMS4wLCAnc3RvbmUnLCA4LCAzKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3NocnViJywgLTE0LCAtOCwgMSwgTWF0aC5QSSAvIDEyLCAxLjEsICdmaWJlcicsIDQsIDEpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfY2Fpcm4nLCAtMjAsIC02LCAwLCAwLCAxLjAsICdzdG9uZScsIDYsIDIpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfb3JlJywgLTM4LCAtNDIsIDAsIE1hdGguUEkgLyA0LCAxLjEsICdvcmUnLCA4LCAyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5lYXJlc3RIYXJ2ZXN0YWJsZShcbiAgd29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgcmFkaXVzOiBudW1iZXIsIHJlc291cmNlPzogUmVzb3VyY2VUeXBlLFxuKTogRW50aXR5IHwgbnVsbCB7XG4gIGxldCBiZXN0OiBFbnRpdHkgfCBudWxsID0gbnVsbDtcbiAgbGV0IGJlc3REID0gcmFkaXVzICogcmFkaXVzO1xuICBmb3IgKGNvbnN0IGUgb2Ygd29ybGQuZW50aXRpZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpXG4gICAgICB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSBjb250aW51ZTtcbiAgICBpZiAocmVzb3VyY2UgJiYgZS5yZXNvdXJjZSAhPT0gcmVzb3VyY2UpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGQgPSAoZS54IC0geCkgKiogMiArIChlLnogLSB6KSAqKiAyO1xuICAgIGlmIChkIDwgYmVzdEQpIHsgYmVzdEQgPSBkOyBiZXN0ID0gZTsgfVxuICB9XG4gIHJldHVybiBiZXN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RSZXN1bHQgeyBlbnRpdHk6IEVudGl0eTsgcmVzb3VyY2U6IFJlc291cmNlVHlwZTsgYW1vdW50OiBudW1iZXI7IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogSGFydmVzdFJlc3VsdCB8IG51bGwge1xuICBjb25zdCBlID0gbGl2ZUVudGl0eSh3b3JsZCwgaWQpO1xuICBpZiAoIWUgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGFtb3VudCA9IE1hdGgubWluKGUueWllbGRQZXJIYXJ2ZXN0LCBlLnJlbWFpbmluZyk7XG4gIGlmICh3b3JsZC5saWZlICYmIE9iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgbikgPT4gc3VtICsgbiwgMCkgKyBhbW91bnQgPiAxMjApIHJldHVybiBudWxsO1xuICBlLnJlbWFpbmluZyAtPSBhbW91bnQ7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGUuaGFydmVzdGVkT25jZSA9IHRydWU7XG4gIGlmIChlLnJlbWFpbmluZyA8PSAwKSBlLmhhcnZlc3RlZCA9IHRydWU7XG4gIHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA9ICh3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IGVudGl0eTogZSwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCB9O1xufVxuXG4vKiogUmVtb3ZlIGV2ZXJ5IHJldGlyZWQgc291cmNlIGFmdGVyIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5LiBUaGlzIG1pZ3JhdGlvblxuICogY3JlYXRlcyBkZXRlcm1pbmlzdGljIHRvbWJzdG9uZXMgYnV0IGlzIG5vdCBhIHBsYXllciBjb21tYW5kIG9yIHJldmlzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJldGlyZVN0b25lRW50aXRpZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZSBvZiBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldKSB7XG4gICAgaWYgKCFpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSkgY29udGludWU7XG4gICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGUuaWQpO1xuICAgIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGUuaWQpO1xuICAgIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICAgIGlmICghd29ybGQuZW50aXR5Q2h1bmtzLmhhcyhlLmNodW5rKSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgZm9yIChjb25zdCBba2V5LCBpZHNdIG9mIHdvcmxkLmVudGl0eUNodW5rcykge1xuICAgIGNvbnN0IGFjdGl2ZSA9IGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKTtcbiAgICBpZiAoYWN0aXZlLmxlbmd0aCA+IDAgfHwgd29ybGQuZW50aXR5Q2hhbmdlcy5oYXMoa2V5KSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGFjdGl2ZSk7XG4gICAgZWxzZSB3b3JsZC5lbnRpdHlDaHVua3MuZGVsZXRlKGtleSk7XG4gIH1cbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBlcnNpc3RlbmNlIC8gYXV0aG9yaXR5IGJvdW5kYXJ5IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNYW5pZmVzdCB7XG4gIHNjaGVtYTogMTtcbiAgc2VlZDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBwYXJhbXNIYXNoOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGZudjFhKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoID0gMHg4MTFjOWRjNTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgaCBePSB0ZXh0LmNoYXJDb2RlQXQoaSk7XG4gICAgaCA9IE1hdGguaW11bChoLCAweDAxMDAwMTkzKTtcbiAgfVxuICByZXR1cm4gKGggPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ybGRNYW5pZmVzdCh3b3JsZDogV29ybGQpOiBXb3JsZE1hbmlmZXN0IHtcbiAgY29uc3QgcCA9IHdvcmxkLnBhcmFtcztcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAgc2VlZDogd29ybGQuc2VlZCxcbiAgICBnZW5lcmF0b3JWZXJzaW9uOiBwLmdlbmVyYXRvclZlcnNpb24sXG4gICAgc2l6ZTogcC5zaXplLFxuICAgIGNodW5rU2l6ZTogcC5jaHVua1NpemUsXG4gICAgeU1pbjogcC55TWluLFxuICAgIHlNYXg6IHAueU1heCxcbiAgICBzZWFMZXZlbDogcC5zZWFMZXZlbCxcbiAgICBwYXJhbXNIYXNoOiBmbnYxYShKU09OLnN0cmluZ2lmeShwKSksXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxFZGl0IHsgaTogbnVtYmVyOyBtOiBudW1iZXI7IH1cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIHNjaGVtYTogMTtcbiAga2V5OiBzdHJpbmc7XG4gIGJhc2VWZXJzaW9uOiBudW1iZXI7XG4gIGVkaXRzOiBWb3hlbEVkaXRbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cG9ydENodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IENodW5rRGVsdGEge1xuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBrZXksXG4gICAgYmFzZVZlcnNpb246IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIGVkaXRzOiBlZGl0cyA/IFsuLi5lZGl0cy5lbnRyaWVzKCldLm1hcCgoW2ksIG1dKSA9PiAoeyBpLCBtIH0pKS5zb3J0KChhLCBiKSA9PiBhLmkgLSBiLmkpIDogW10sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBkZWx0YTogQ2h1bmtEZWx0YSk6IHZvaWQge1xuICBjb25zdCBbY3gsIGN6XSA9IGRlbHRhLmtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICBmb3IgKGNvbnN0IGUgb2YgZGVsdGEuZWRpdHMpIHtcbiAgICBjb25zdCB5SW5kZXggPSBNYXRoLmZsb29yKGUuaSAvIENIVU5LX0FSRUEpO1xuICAgIGNvbnN0IHJlbSA9IGUuaSAlIENIVU5LX0FSRUE7XG4gICAgY29uc3QgbHogPSBNYXRoLmZsb29yKHJlbSAvIENIVU5LX1NJWkUpO1xuICAgIGNvbnN0IGx4ID0gcmVtICUgQ0hVTktfU0laRTtcbiAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4O1xuICAgIGNvbnN0IHkgPSBZX01JTiArIHlJbmRleDtcbiAgICBjb25zdCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgIHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBlLm0gYXMgTWF0SWQpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gdGltZSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFRpbWVTdGF0ZSB7IHQ6IG51bWJlcjsgZGF5TGVuZ3RoU2VjOiBudW1iZXI7IHBhdXNlZDogYm9vbGVhbjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpbWUoczogVGltZVN0YXRlLCBkdDogbnVtYmVyKTogdm9pZCB7XG4gIGlmIChzLnBhdXNlZCkgcmV0dXJuO1xuICBzLnQgPSAocy50ICsgZHQgLyBzLmRheUxlbmd0aFNlYykgJSAxO1xufVxuIiwgIi8vIFRlcnJhaW4gcXVlcnkgbGF5ZXIgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbiwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDIgU3lzdGVtIDE6IG9uZSBzaGFyZWQsIGNhY2hlZCBjb250cmFjdCBmb3IgY29uc3RydWN0aW9uLCBmYXJtaW5nLFxuLy8gbW92ZW1lbnQsIG5hdmlnYXRpb24gYW5kIHRoZSBBSSBhZ2VudC4gVGhlc2UgcXVlcmllcyBkZXNjcmliZSB0aGVcbi8vIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lOyB0aGV5IG5ldmVyIG11dGF0ZSBpdCBhbmQgbmV2ZXIgY3JlYXRlIGEgc2Vjb25kXG4vLyB0ZXJyYWluIHJlcHJlc2VudGF0aW9uLlxuLy9cbi8vIENvbnZlbnRpb25zOlxuLy8gICAqIHgveiBhcmUgaW50ZWdlciBjb2x1bW4gY29vcmRpbmF0ZXMgaW4gWy0xMDI0LCAxMDI0KS5cbi8vICAgKiB5IGlzIGFuIGludGVnZXIgdm94ZWwgY29vcmRpbmF0ZSBpbiBbLTE2LCAxMTIpLlxuLy8gICAqIHN1cmZhY2VZIGlzIHRoZSBleHBvc2VkIHRvcCBmYWNlICh0b3BTb2xpZCArIDEpLCBtYXRjaGluZyBNMDAxLlxuLy8gICAqIEEgcmVjdCBpcyBpbmNsdXNpdmUgb24gYWxsIGZvdXIgZWRnZXMuXG5pbXBvcnQge1xuICBXb3JsZCwgTWF0SWQsIE1BVCwgU0VBX0xFVkVMLCBZX01JTiwgWV9NQVgsIEhBTEYsXG4gIHN1cmZhY2VBdCwgdG9wTWF0ZXJpYWxBdFdvcmxkLCBnZXRWb3hlbCwgaXNTb2xpZCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIEFjdGl2ZUVudGl0eUtpbmQsIEVudGl0eUtpbmQsIGlzUmV0aXJlZFN0b25lS2luZCxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBpc1N0b25lUmVwbGF5IH0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlY3Qge1xuICB4MDogbnVtYmVyO1xuICB6MDogbnVtYmVyO1xuICB4MTogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsUmVnaW9uIGV4dGVuZHMgUmVjdCB7XG4gIHkwOiBudW1iZXI7XG4gIHkxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVSZWN0KHJlY3Q6IFJlY3QpOiBSZWN0IHtcbiAgcmV0dXJuIHtcbiAgICB4MDogTWF0aC5taW4ocmVjdC54MCwgcmVjdC54MSksXG4gICAgejA6IE1hdGgubWluKHJlY3QuejAsIHJlY3QuejEpLFxuICAgIHgxOiBNYXRoLm1heChyZWN0LngwLCByZWN0LngxKSxcbiAgICB6MTogTWF0aC5tYXgocmVjdC56MCwgcmVjdC56MSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0Q29sdW1ucyhyZWN0OiBSZWN0KTogbnVtYmVyIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIHJldHVybiAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdENvbnRhaW5zKHJlY3Q6IFJlY3QsIHg6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB4ID49IHJlY3QueDAgJiYgeCA8PSByZWN0LngxICYmIHogPj0gcmVjdC56MCAmJiB6IDw9IHJlY3QuejE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBhbmRSZWN0KHJlY3Q6IFJlY3QsIGFtb3VudDogbnVtYmVyKTogUmVjdCB7XG4gIHJldHVybiB7XG4gICAgeDA6IHJlY3QueDAgLSBhbW91bnQsXG4gICAgejA6IHJlY3QuejAgLSBhbW91bnQsXG4gICAgeDE6IHJlY3QueDEgKyBhbW91bnQsXG4gICAgejE6IHJlY3QuejEgKyBhbW91bnQsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0VG9SZWdpb24ocmVjdDogUmVjdCwgeTAgPSBZX01JTiwgeTEgPSBZX01BWCAtIDEpOiBWb3hlbFJlZ2lvbiB7XG4gIHJldHVybiB7IC4uLm5vcm1hbGl6ZVJlY3QocmVjdCksIHkwLCB5MSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaW9uc092ZXJsYXAoYTogVm94ZWxSZWdpb24sIGI6IFZveGVsUmVnaW9uKTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejBcbiAgICAmJiBhLnkwIDw9IGIueTEgJiYgYS55MSA+PSBiLnkwO1xufVxuXG4vKiogSW5jbHVzaXZlIGNvbnRhaW5tZW50IG9mIGEgdm94ZWwgaW4gYSB3b3JrIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVudmVsb3BlQ29udGFpbnMocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10sIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCByIG9mIHJlY3RzKSB7XG4gICAgaWYgKHggPj0gci54MCAmJiB4IDw9IHIueDEgJiYgeSA+PSByLnkwICYmIHkgPD0gci55MSAmJiB6ID49IHIuejAgJiYgeiA8PSByLnoxKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFpbkNvbHVtbiB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogRXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uOyB0aGUgZmlyc3QgYWlyIGNlbGwgYWJvdmUgaXQuICovXG4gIHN1cmZhY2VZOiBudW1iZXI7XG4gIC8qKiBUaGUgaGlnaGVzdCBzb2xpZCB2b3hlbCwgb3IgWV9NSU4gLSAxIGlmIHRoZSBjb2x1bW4gaGFzIG5vIHNvbGlkLiAqL1xuICB0b3BTb2xpZFk6IG51bWJlcjtcbiAgdG9wTWF0ZXJpYWw6IE1hdElkO1xuICBzb2xpZDogYm9vbGVhbjtcbiAgLyoqIFdhdGVyIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlLCB1cCB0byBzZWEgbGV2ZWwuIDAgb24gZHJ5IGxhbmQuICovXG4gIHdhdGVyRGVwdGg6IG51bWJlcjtcbiAgdW5kZXJ3YXRlcjogYm9vbGVhbjtcbiAgLyoqIExhcmdlc3QgNC1uZWlnaGJvdXIgc3VyZmFjZSBzdGVwIGluIG1ldHJlcyAoMSA9IGEgc2luZ2xlIHZveGVsIHJpc2VyKS4gKi9cbiAgc2xvcGU6IG51bWJlcjtcbiAgLyoqIEZyZWUgYWlyIGNlbGxzIGFib3ZlIHRoZSBzdXJmYWNlLCBjYXBwZWQgYXQgQ0xFQVJBTkNFX1BST0JFLiAqL1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IENMRUFSQU5DRV9QUk9CRSA9IDg7XG5cbmZ1bmN0aW9uIHN1cmZhY2VBdFNhZmUod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgZmFsbGJhY2s6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxsYmFjaztcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKiBXYXRlciBkZXB0aCB0aGF0IHJlc3BlY3RzIGEgZHJ5IHBpdCBiZWxvdyBzZWEgbGV2ZWwgKHVubGlrZSBoZWlnaHQgYWxvbmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmIChzdXJmYWNlID49IFNFQV9MRVZFTCkgcmV0dXJuIDA7XG4gIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgU0VBX0xFVkVMIC0gMSwgeikgIT09IE1BVC5XQVRFUikgcmV0dXJuIDA7XG4gIHJldHVybiBTRUFfTEVWRUwgLSBzdXJmYWNlO1xufVxuXG4vKiogVHJ1ZSB3aGVuIGBoZWlnaHRgIGFpciBjZWxscyBhYm92ZSB0aGUgc3VyZmFjZSBhcmUgZnJlZSBvZiBzb2xpZCBvciB3YXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGVhcmFuY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBoZWlnaHQ7IGkrKykge1xuICAgIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgc3VyZmFjZSArIGksIHopICE9PSBNQVQuQUlSKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2x1bW5BdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCBzdXJmYWNlWSA9IHN1cmZhY2VBdCh3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3QgdG9wTWF0ZXJpYWwgPSB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHNvbGlkID0gc3VyZmFjZVkgPiBZX01JTiAmJiBpc1NvbGlkKHRvcE1hdGVyaWFsKTtcbiAgY29uc3Qgd2F0ZXJEZXB0aCA9IHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4IC0gMSwgY3osIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCArIDEsIGN6LCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3gsIGN6IC0gMSwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4LCBjeiArIDEsIHN1cmZhY2VZKSksXG4gICk7XG4gIGxldCBjbGVhcmFuY2UgPSAwO1xuICB3aGlsZSAoY2xlYXJhbmNlIDwgQ0xFQVJBTkNFX1BST0JFICYmIGdldFZveGVsKHdvcmxkLCBjeCwgc3VyZmFjZVkgKyBjbGVhcmFuY2UsIGN6KSA9PT0gTUFULkFJUikge1xuICAgIGNsZWFyYW5jZSsrO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDogY3gsIHo6IGN6LCBzdXJmYWNlWSwgdG9wU29saWRZOiBzdXJmYWNlWSAtIDEsIHRvcE1hdGVyaWFsLFxuICAgIHNvbGlkLCB3YXRlckRlcHRoLCB1bmRlcndhdGVyOiB3YXRlckRlcHRoID4gMCwgc2xvcGUsIGNsZWFyYW5jZSxcbiAgfTtcbn1cblxuLy8gRW50aXR5IGZvb3RwcmludHMgYXJlIGRlbGliZXJhdGVseSBleHBsaWNpdC4gQSB0cmVlIG9jY3VwaWVzIG1vcmUgc2l0ZSB0aGFuXG4vLyBpdHMgdHJ1bms7IGEgcGViYmxlIG9jY3VwaWVzIGxlc3MgdGhhbiBhIGJvdWxkZXIuIFRoZXNlIGFyZSBzaW11bGF0aW9uXG4vLyBjbGVhcmFuY2UgcmFkaWksIG5vdCByZW5kZXIgYm91bmRzLlxuZXhwb3J0IGNvbnN0IE9CU1RSVUNUSU9OX1JBRElVUzogUmVjb3JkPEFjdGl2ZUVudGl0eUtpbmQsIG51bWJlcj4gPSB7XG4gIHN0eWxfdHJlZV9zcGlyZTogMS41LFxuICBzdHlsX3RyZWVfdGFibGU6IDEuOCxcbiAgc3R5bF90cmVlX2NsdXN0ZXI6IDEuOSxcbiAgc3R5bF90cmVlX2Jsb3Nzb206IDEuNixcbiAgc3R5bF9zaHJ1YjogMC42LFxuICBzdHlsX29yZTogMC45LFxuICBzdHlsX2NhaXJuOiAwLjgsXG4gIHdheXN0b25lOiAxLjQsXG4gIG1hcmtlcjogMC41LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBPYnN0cnVjdGlvbiB7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByYWRpdXM6IG51bWJlcjtcbiAgLyoqIEZvb3RwcmludCBjZWxscyBvdmVybGFwcGVkIGJ5IHRoaXMgZW50aXR5LiAqL1xuICBjZWxsczogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlDaHVua3NGb3JSZWN0KHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCk6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIC8vIEEgcmVjdCBvd25zIHdob2xlIHZveGVsIGNlbGxzLiBJbmNsdWRlIGV2ZXJ5IGNodW5rIHdob3NlIHJvb3QgY291bGQgb3ZlcmxhcFxuICAvLyB0aG9zZSBjZWxscywgd2l0aG91dCBzY2FubmluZyB0aGUgZW50aXJlIDIwNDggbSB3b3JsZC5cbiAgY29uc3QgcmFkaXVzID0gTWF0aC5tYXgoLi4uT2JqZWN0LnZhbHVlcyhPQlNUUlVDVElPTl9SQURJVVMpLCAxLjUpO1xuICBjb25zdCBtaW5DZWxsWCA9IE1hdGguZmxvb3Ioci54MCArIDAuNSAtIHJhZGl1cyk7XG4gIGNvbnN0IG1heENlbGxYID0gTWF0aC5jZWlsKHIueDEgKyAwLjUgKyByYWRpdXMpIC0gMTtcbiAgY29uc3QgbWluQ2VsbFogPSBNYXRoLmZsb29yKHIuejAgKyAwLjUgLSByYWRpdXMpO1xuICBjb25zdCBtYXhDZWxsWiA9IE1hdGguY2VpbChyLnoxICsgMC41ICsgcmFkaXVzKSAtIDE7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1gobWluQ2VsbFgpKSwgY3gxID0gd29ybGRUb0NodW5rWChtYXhDZWxsWCk7XG4gIGNvbnN0IGN6MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1oobWluQ2VsbFopKSwgY3oxID0gd29ybGRUb0NodW5rWihtYXhDZWxsWik7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSBrZXlzLnB1c2goY2h1bmtLZXkoY3gsIGN6KSk7XG4gIH1cbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKiBFbnRpdGllcyB3aG9zZSBzaW11bGF0aW9uIGZvb3RwcmludCBvdmVybGFwcyB0aGUgcmVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvYnN0cnVjdGlvbnNJbih3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgb3V0OiBPYnN0cnVjdGlvbltdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGVudGl0eUNodW5rc0ZvclJlY3Qod29ybGQsIHIpKSB7XG4gICAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghaWRzKSBjb250aW51ZTtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgICAgaWYgKHNlZW4uaGFzKGlkKSkgY29udGludWU7XG4gICAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIGNvbnRpbnVlO1xuICAgICAgc2Vlbi5hZGQoaWQpO1xuICAgICAgY29uc3QgcmFkaXVzID0gaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZClcbiAgICAgICAgPyBlLmtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gMC42IDogZS5raW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyAxLjEgOiAxLjVcbiAgICAgICAgOiBPQlNUUlVDVElPTl9SQURJVVNbZS5raW5kIGFzIEFjdGl2ZUVudGl0eUtpbmRdO1xuICAgICAgbGV0IGNlbGxzID0gMDtcbiAgICAgIGNvbnN0IGV4MCA9IE1hdGgubWF4KHIueDAsIE1hdGguZmxvb3IoZS54IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBleDEgPSBNYXRoLm1pbihyLngxLCBNYXRoLmNlaWwoZS54ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejAgPSBNYXRoLm1heChyLnowLCBNYXRoLmZsb29yKGUueiAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXoxID0gTWF0aC5taW4oci56MSwgTWF0aC5jZWlsKGUueiArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgZm9yIChsZXQgeiA9IGV6MDsgeiA8PSBlejE7IHorKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gZXgwOyB4IDw9IGV4MTsgeCsrKSB7XG4gICAgICAgICAgaWYgKE1hdGguaHlwb3QoZS54IC0gKHggKyAwLjUpLCBlLnogLSAoeiArIDAuNSkpIDw9IHJhZGl1cykgY2VsbHMrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGNlbGxzID4gMCkge1xuICAgICAgICBvdXQucHVzaCh7IGVudGl0eUlkOiBlLmlkLCBraW5kOiBlLmtpbmQsIHg6IGUueCwgejogZS56LCByYWRpdXMsIGNlbGxzIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBvdXQuc29ydCgoYSwgYikgPT4gKGEuZW50aXR5SWQgPCBiLmVudGl0eUlkID8gLTEgOiBhLmVudGl0eUlkID4gYi5lbnRpdHlJZCA/IDEgOiAwKSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXJlYVN0YXRzIHtcbiAgcmVjdDogUmVjdDtcbiAgY29sdW1uczogbnVtYmVyO1xuICBtaW5ZOiBudW1iZXI7XG4gIG1heFk6IG51bWJlcjtcbiAgbWVhblk6IG51bWJlcjtcbiAgcmVsaWVmOiBudW1iZXI7XG4gIG1heFN0ZXA6IG51bWJlcjtcbiAgd2F0ZXJDb2x1bW5zOiBudW1iZXI7XG4gIHN0b25lQ29sdW1uczogbnVtYmVyO1xuICBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj47XG4gIG9ic3RydWN0aW9uczogT2JzdHJ1Y3Rpb25bXTtcbiAgb2JzdHJ1Y3RlZENvbHVtbnM6IG51bWJlcjtcbiAgLyoqIEN1dC9maWxsIHJlbGF0aXZlIHRvIGZsb29yWSB3aGVuIHN1cHBsaWVkLCBvdGhlcndpc2UgMC4gKi9cbiAgZmxvb3JZOiBudW1iZXIgfCBudWxsO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cHBvcnRTdW1tYXJ5IHtcbiAgdG90YWw6IG51bWJlcjtcbiAgbGV2ZWw6IG51bWJlcjtcbiAgY3V0OiBudW1iZXI7XG4gIGZpbGw6IG51bWJlcjtcbiAgd2F0ZXI6IG51bWJlcjtcbiAgLyoqIEZpbGwgZGVlcGVyIHRoYW4gOCBtOyBhIHZhbGlkYXRvciBtYXkgcmVqZWN0IHRoZXNlIGFzIHVuc3VwcG9ydGVkLiAqL1xuICBkZWVwRmlsbDogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZvb3RwcmludFF1ZXJ5IHtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHN0YXRzOiBBcmVhU3RhdHM7XG4gIHN1cHBvcnQ6IFN1cHBvcnRTdW1tYXJ5O1xuICBvYnN0cnVjdGlvbnM6IE9ic3RydWN0aW9uW107XG4gIC8qKiBDZWxscyBpbiB0aGUgYnVpbGRpbmcgdm9sdW1lIGFib3ZlIHRoZSBwcmVwYXJlZCBmbG9vciB0aGF0IGFyZSBub3QgYWlyLiAqL1xuICBvdmVyaGFuZ0NlbGxzOiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IG1hdGVyaWFsOiBNYXRJZCB9Pjtcbn1cblxuLyoqXG4gKiBDYWNoZWQgcXVlcnkgY29udGV4dC4gQ2FjaGVzIGFyZSBrZXllZCBvbiB3b3JsZC5yZXZpc2lvbjogYSB2b3hlbCBvciBlbnRpdHlcbiAqIGVkaXQgaW52YWxpZGF0ZXMgdGhlbSwgd2hpbGUgbWVzaC9uYXYgcmVidWlsZHMgZG8gbm90LiBVc2Ugb25lIGNvbnRleHQgZm9yIGFcbiAqIHNpdGUgc2VhcmNoIG9yIGEgZm9vdHByaW50IGV2YWx1YXRpb24sIHRoZW4gZGlzY2FyZCBpdC5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlcnJhaW5RdWVyeSB7XG4gIHByaXZhdGUgY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgVGVycmFpbkNvbHVtbj4oKTtcbiAgcHJpdmF0ZSBvYnN0cnVjdGlvbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIE9ic3RydWN0aW9uW10+KCk7XG4gIHByaXZhdGUgcmV2aXNpb246IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgd29ybGQ6IFdvcmxkKSB7XG4gICAgdGhpcy5yZXZpc2lvbiA9IHdvcmxkLnJldmlzaW9uO1xuICB9XG5cbiAgcHJpdmF0ZSBzeW5jKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnJldmlzaW9uICE9PSB0aGlzLndvcmxkLnJldmlzaW9uKSB7XG4gICAgICB0aGlzLmNhY2hlLmNsZWFyKCk7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuY2xlYXIoKTtcbiAgICAgIHRoaXMucmV2aXNpb24gPSB0aGlzLndvcmxkLnJldmlzaW9uO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBDYWNoZWQgZW50aXR5IG9ic3RydWN0aW9ucyBmb3Igb25lIGZvb3RwcmludC4gKi9cbiAgb2JzdHJ1Y3Rpb25zRm9yKHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBrZXkgPSBgJHtyLngwfSwke3IuejB9LCR7ci54MX0sJHtyLnoxfWA7XG4gICAgbGV0IGxpc3QgPSB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuZ2V0KGtleSk7XG4gICAgaWYgKCFsaXN0KSB7XG4gICAgICBsaXN0ID0gb2JzdHJ1Y3Rpb25zSW4odGhpcy53b3JsZCwgcik7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuc2V0KGtleSwgbGlzdCk7XG4gICAgfVxuICAgIHJldHVybiBsaXN0O1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgY3ggPSBNYXRoLmZsb29yKHgpLCBjeiA9IE1hdGguZmxvb3Ioeik7XG4gICAgY29uc3Qga2V5ID0gYCR7Y3h9LCR7Y3p9YDtcbiAgICBsZXQgY29sID0gdGhpcy5jYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAoIWNvbCkge1xuICAgICAgY29sID0gY29sdW1uQXQodGhpcy53b3JsZCwgY3gsIGN6KTtcbiAgICAgIHRoaXMuY2FjaGUuc2V0KGtleSwgY29sKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbDtcbiAgfVxuXG4gIGFyZWEocmVjdDogUmVjdCwgZmxvb3JZPzogbnVtYmVyKTogQXJlYVN0YXRzIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBsZXQgbWluWSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgICBsZXQgbWF4WSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgICBsZXQgc3VtID0gMDtcbiAgICBsZXQgbWF4U3RlcCA9IDA7XG4gICAgbGV0IHdhdGVyQ29sdW1ucyA9IDA7XG4gICAgbGV0IHN0b25lQ29sdW1ucyA9IDA7XG4gICAgbGV0IGN1dFZvbHVtZSA9IDA7XG4gICAgbGV0IGZpbGxWb2x1bWUgPSAwO1xuICAgIGxldCBtYXhDdXQgPSAwO1xuICAgIGxldCBtYXhGaWxsID0gMDtcbiAgICBjb25zdCBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj4gPSB7fTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgbWF4WSA9IE1hdGgubWF4KG1heFksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIHN1bSArPSBjb2wuc3VyZmFjZVk7XG4gICAgICAgIG1heFN0ZXAgPSBNYXRoLm1heChtYXhTdGVwLCBjb2wuc2xvcGUpO1xuICAgICAgICBpZiAoY29sLndhdGVyRGVwdGggPiAwKSB3YXRlckNvbHVtbnMrKztcbiAgICAgICAgaWYgKGNvbC50b3BNYXRlcmlhbCA9PT0gTUFULlNUT05FKSBzdG9uZUNvbHVtbnMrKztcbiAgICAgICAgbWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPSAobWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPz8gMCkgKyAxO1xuICAgICAgICBpZiAoZmxvb3JZICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgICBpZiAoZHkgPiAwKSB7XG4gICAgICAgICAgICBjdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgICBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGR5KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgICAgZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgICBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgLWR5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBvYnN0cnVjdGlvbnMgPSB0aGlzLm9ic3RydWN0aW9uc0ZvcihyKTtcbiAgICBjb25zdCBvYnN0cnVjdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBvIG9mIG9ic3RydWN0aW9ucykge1xuICAgICAgY29uc3QgcmFkaXVzID0gby5yYWRpdXM7XG4gICAgICBjb25zdCBleDAgPSBNYXRoLm1heChyLngwLCBNYXRoLmZsb29yKG8ueCAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXgxID0gTWF0aC5taW4oci54MSwgTWF0aC5jZWlsKG8ueCArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXowID0gTWF0aC5tYXgoci56MCwgTWF0aC5mbG9vcihvLnogLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MSA9IE1hdGgubWluKHIuejEsIE1hdGguY2VpbChvLnogKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGZvciAobGV0IHogPSBlejA7IHogPD0gZXoxOyB6KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IGV4MDsgeCA8PSBleDE7IHgrKykge1xuICAgICAgICAgIGlmIChNYXRoLmh5cG90KG8ueCAtICh4ICsgMC41KSwgby56IC0gKHogKyAwLjUpKSA8PSByYWRpdXMpIG9ic3RydWN0ZWQuYWRkKGAke3h9LCR7en1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNvbHVtbnMgPSAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xuICAgIHJldHVybiB7XG4gICAgICByZWN0OiByLFxuICAgICAgY29sdW1ucyxcbiAgICAgIG1pblksIG1heFksXG4gICAgICBtZWFuWTogTWF0aC5yb3VuZCgoc3VtIC8gY29sdW1ucykgKiAxMDAwKSAvIDEwMDAsXG4gICAgICByZWxpZWY6IG1heFkgLSBtaW5ZLFxuICAgICAgbWF4U3RlcCxcbiAgICAgIHdhdGVyQ29sdW1ucyxcbiAgICAgIHN0b25lQ29sdW1ucyxcbiAgICAgIG1hdGVyaWFscyxcbiAgICAgIG9ic3RydWN0aW9ucyxcbiAgICAgIG9ic3RydWN0ZWRDb2x1bW5zOiBvYnN0cnVjdGVkLnNpemUsXG4gICAgICBmbG9vclk6IGZsb29yWSA/PyBudWxsLFxuICAgICAgY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dCxcbiAgICAgIG1heEZpbGwsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFdmFsdWF0ZSBhIGNvbXBsZXRlIGJ1aWxkaW5nIGZvb3RwcmludC4gYGZsb29yWWAgaXMgdGhlIHByZXBhcmVkIHdhbGtpbmdcbiAgICogZmxvb3I6IHRlcnJhaW4gYWJvdmUgaXQgaXMgY3V0LCB0ZXJyYWluIGJlbG93IGl0IGlzIGZpbGxlZC4gVGhlIHJlc3VsdCBpc1xuICAgKiByYXcgc2l0ZSBkYXRhOyBjb25zdHJ1Y3Rpb24gcnVsZXMgbGl2ZSBpbiBjb25zdHJ1Y3Rpb24udHMuXG4gICAqL1xuICBmb290cHJpbnQocmVjdDogUmVjdCwgZmxvb3JZOiBudW1iZXIpOiBGb290cHJpbnRRdWVyeSB7XG4gICAgY29uc3Qgc3RhdHMgPSB0aGlzLmFyZWEocmVjdCwgZmxvb3JZKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBzdXBwb3J0OiBTdXBwb3J0U3VtbWFyeSA9IHtcbiAgICAgIHRvdGFsOiBzdGF0cy5jb2x1bW5zLCBsZXZlbDogMCwgY3V0OiAwLCBmaWxsOiAwLCB3YXRlcjogMCwgZGVlcEZpbGw6IDAsXG4gICAgICBtYXhDdXQ6IDAsIG1heEZpbGw6IDAsIGN1dFZvbHVtZTogMCwgZmlsbFZvbHVtZTogMCxcbiAgICB9O1xuICAgIGNvbnN0IG92ZXJoYW5nQ2VsbHM6IEZvb3RwcmludFF1ZXJ5WydvdmVyaGFuZ0NlbGxzJ10gPSBbXTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgaWYgKGR5ID4gMCkge1xuICAgICAgICAgIHN1cHBvcnQuY3V0Kys7XG4gICAgICAgICAgc3VwcG9ydC5jdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhDdXQgPSBNYXRoLm1heChzdXBwb3J0Lm1heEN1dCwgZHkpO1xuICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgIHN1cHBvcnQuZmlsbCsrO1xuICAgICAgICAgIHN1cHBvcnQuZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhGaWxsID0gTWF0aC5tYXgoc3VwcG9ydC5tYXhGaWxsLCAtZHkpO1xuICAgICAgICAgIGlmICgtZHkgPiA4KSBzdXBwb3J0LmRlZXBGaWxsKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VwcG9ydC5sZXZlbCsrO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb2wud2F0ZXJEZXB0aCA+IDApIHN1cHBvcnQud2F0ZXIrKztcblxuICAgICAgICAvLyBBbiBvdmVyaGFuZyBpcyB0ZXJyYWluIGFib3ZlIHRoZSBmbG9vciB0aGF0IHN1cnZpdmVzIHRoZSBjdXQgcGxhbmUuXG4gICAgICAgIC8vIEZvciBhIGNvbHVtbiBiZWxvdyB0aGUgZmxvb3IsIGl0cyBzb2xpZCBib2R5IGlzIGZpbGwsIG5vdCBvdmVyaGFuZy5cbiAgICAgICAgY29uc3Qgc3RhcnQgPSBNYXRoLm1heChmbG9vclksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8IHN0YXJ0ICsgNDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgbSA9IGdldFZveGVsKHRoaXMud29ybGQsIHgsIHksIHopIGFzIE1hdElkO1xuICAgICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSBvdmVyaGFuZ0NlbGxzLnB1c2goeyB4LCB5LCB6LCBtYXRlcmlhbDogbSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IHJlY3Q6IHIsIGZsb29yWSwgc3RhdHMsIHN1cHBvcnQsIG9ic3RydWN0aW9uczogc3RhdHMub2JzdHJ1Y3Rpb25zLCBvdmVyaGFuZ0NlbGxzIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBtb3ZlbWVudCBjb250cmFjdCAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdhbGtQYXJhbXMge1xuICBtYXhTdGVwVXA6IG51bWJlcjtcbiAgbWF4U3RlcERvd246IG51bWJlcjtcbiAgbWF4V2F0ZXJEZXB0aDogbnVtYmVyO1xuICAvKiogTWF4aW11bSBhZGphY2VudCBzdXJmYWNlIHN0ZXA7IDEuMCBpcyBhIDQ1IGRlZ3JlZSB2b3hlbCByaXNlci4gKi9cbiAgbWF4U2xvcGU6IG51bWJlcjtcbiAgY2xlYXJhbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1dBTEs6IFdhbGtQYXJhbXMgPSB7XG4gIG1heFN0ZXBVcDogMS4wLFxuICBtYXhTdGVwRG93bjogMS41LFxuICBtYXhXYXRlckRlcHRoOiAwLjQsXG4gIG1heFNsb3BlOiAxLjAsXG4gIGNsZWFyYW5jZTogMi4wLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBXYWxrUmVzdWx0IHtcbiAgb2s6IGJvb2xlYW47XG4gIHJlYXNvbjogJ29rJyB8ICdub3RfYWRqYWNlbnQnIHwgJ3N0ZXBfdXAnIHwgJ2ZhbGwnIHwgJ3dhdGVyJyB8ICdzbG9wZScgfCAnY2xlYXJhbmNlJztcbiAgc3RlcDogbnVtYmVyO1xuICB3YXRlckRlcHRoOiBudW1iZXI7XG59XG5cbi8qKiBFdmFsdWF0ZSBvbmUgZ3JpZCBzdGVwLiBQYXRocyBhcmUgdmFsaWRhdGVkIHdpdGggdGhlIHNhbWUgY29udHJhY3QuICovXG5leHBvcnQgZnVuY3Rpb24gd2Fsa1N0ZXAoXG4gIHdvcmxkOiBXb3JsZCwgZnJvbVg6IG51bWJlciwgZnJvbVo6IG51bWJlciwgdG9YOiBudW1iZXIsIHRvWjogbnVtYmVyLFxuICBwYXJhbXM6IFdhbGtQYXJhbXMgPSBERUZBVUxUX1dBTEssXG4pOiBXYWxrUmVzdWx0IHtcbiAgY29uc3QgZHggPSBNYXRoLmFicyhNYXRoLmZsb29yKHRvWCkgLSBNYXRoLmZsb29yKGZyb21YKSk7XG4gIGNvbnN0IGR6ID0gTWF0aC5hYnMoTWF0aC5mbG9vcih0b1opIC0gTWF0aC5mbG9vcihmcm9tWikpO1xuICBpZiAoZHggKyBkeiAhPT0gMSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnbm90X2FkamFjZW50Jywgc3RlcDogMCwgd2F0ZXJEZXB0aDogMCB9O1xuICB9XG4gIGNvbnN0IGZyb20gPSBjb2x1bW5BdCh3b3JsZCwgZnJvbVgsIGZyb21aKTtcbiAgY29uc3QgdG8gPSBjb2x1bW5BdCh3b3JsZCwgdG9YLCB0b1opO1xuICBjb25zdCBzdGVwID0gdG8uc3VyZmFjZVkgLSBmcm9tLnN1cmZhY2VZO1xuICBpZiAoc3RlcCA+IHBhcmFtcy5tYXhTdGVwVXApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RlcF91cCcsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKC1zdGVwID4gcGFyYW1zLm1heFN0ZXBEb3duKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2ZhbGwnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by53YXRlckRlcHRoID4gcGFyYW1zLm1heFdhdGVyRGVwdGgpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnd2F0ZXInLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by5zbG9wZSA+IHBhcmFtcy5tYXhTbG9wZSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzbG9wZScsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKCFjbGVhcmFuY2VBdCh3b3JsZCwgdG9YLCB0b1osIHBhcmFtcy5jbGVhcmFuY2UpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdjbGVhcmFuY2UnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIHJlYXNvbjogJ29rJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xufVxuXG4vKiogRWZmZWN0aXZlIGdyYWRlIG9mIGEgc3RyYWlnaHQgcGF0aCBzZWdtZW50LCB1c2VkIGJ5IHBhdGggdmFsaWRhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZmZlY3RpdmVHcmFkZSh3b3JsZDogV29ybGQsIHgwOiBudW1iZXIsIHowOiBudW1iZXIsIHgxOiBudW1iZXIsIHoxOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBhID0gY29sdW1uQXQod29ybGQsIHgwLCB6MCk7XG4gIGNvbnN0IGIgPSBjb2x1bW5BdCh3b3JsZCwgeDEsIHoxKTtcbiAgY29uc3QgcnVuID0gTWF0aC5oeXBvdCh4MSAtIHgwLCB6MSAtIHowKTtcbiAgaWYgKHJ1biA9PT0gMCkgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKTtcbiAgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKSAvIHJ1bjtcbn1cbiIsICIvLyBNMDAyIHNpdGUgdmFsaWRhdGlvbiwgY2FuZGlkYXRlIHNlYXJjaCBhbmQgcHJldmlldyBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLlxuLy9cbi8vIFRoaXMgaXMgdGhlIHNoYXJlZCBnYXRlIGZvciB0aGUgcGxheWVyIGFuZCB0aGUgQUkgYWdlbnQuIE5laXRoZXIgbWF5IHBsYWNlIGFcbi8vIHN0cnVjdHVyZSBieSBhbnkgb3RoZXIgcGF0aDogYm90aCBzdWJtaXQgYSBTaXRlUHJvcG9zYWwsIGJvdGggcmVjZWl2ZSB0aGVcbi8vIHNhbWUgU2l0ZVZhbGlkYXRpb24sIGFuZCBib3RoIG11c3QgcGFzcyB0aGUgQXV0aG9yaXplciBiZWZvcmUgZXhlY3V0aW9uLlxuLy9cbi8vIFRoZSB2YWxpZGF0b3IgZGVzY3JpYmVzIHRoZSBzaXRlIGFzIGl0IGlzLiBJdCBkb2VzIG5vdCBlZGl0IHZveGVscywgcmVtb3ZlXG4vLyBlbnRpdGllcyBvciBzcGVuZCByZXNvdXJjZXMuIFByZXBhcmF0aW9uIGlzIGEgc2VwYXJhdGUsIGF1dGhvcml6ZWQgc3RlcC5cbmltcG9ydCB7IFdvcmxkLCBIQUxGLCBZX01JTiwgWV9NQVgsIHN1cmZhY2VBdCB9IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIEZvb3RwcmludFF1ZXJ5LCBUZXJyYWluUXVlcnksIEFyZWFTdGF0cyxcbiAgbm9ybWFsaXplUmVjdCwgZXhwYW5kUmVjdCwgcmVjdENvbHVtbnMsIGVmZmVjdGl2ZUdyYWRlLCB3YWxrU3RlcCwgV2Fsa1BhcmFtcyxcbiAgREVGQVVMVF9XQUxLLCBjb2x1bW5BdCxcbn0gZnJvbSAnLi90ZXJyYWluJztcblxuZXhwb3J0IHR5cGUgU2l0ZVN0YXRlID0gJ3ZhbGlkJyB8ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJyB8ICdpbnZhbGlkJztcblxuZXhwb3J0IHR5cGUgVmFsaWRhdGlvbkNvZGUgPVxuICB8ICdvdXRfb2ZfYm91bmRzJ1xuICB8ICdmb290cHJpbnRfbWlzbWF0Y2gnXG4gIHwgJ3Nsb3BlX2V4Y2VlZGVkJ1xuICB8ICdzdGVwX2V4Y2VlZGVkJ1xuICB8ICdjdXRfZXhjZWVkZWQnXG4gIHwgJ2ZpbGxfZXhjZWVkZWQnXG4gIHwgJ2N1dF92b2x1bWVfZXhjZWVkZWQnXG4gIHwgJ2ZpbGxfdm9sdW1lX2V4Y2VlZGVkJ1xuICB8ICdmb290cHJpbnRfb2JzdHJ1Y3RlZCdcbiAgfCAnd2F0ZXInXG4gIHwgJ292ZXJoYW5nJ1xuICB8ICduZWVkc19ncmFkaW5nJ1xuICB8ICduZWVkc19jbGVhcmluZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmFsaWRhdGlvblJlYXNvbiB7XG4gIGNvZGU6IFZhbGlkYXRpb25Db2RlO1xuICBzZXZlcml0eTogJ2Vycm9yJyB8ICdwcmVwYXJhdGlvbic7XG4gIG1lc3NhZ2U6IHN0cmluZztcbiAgdmFsdWU/OiBudW1iZXI7XG4gIGxpbWl0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBGb3VuZGF0aW9uVHlwZSA9ICdncmFkZWRfcGFkJyB8ICdzdGVwcGVkX3BsaW50aCcgfCAnZGVjayc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbGRpbmdSdWxlcyB7XG4gIGlkOiBzdHJpbmc7XG4gIHdpZHRoOiBudW1iZXI7XG4gIGRlcHRoOiBudW1iZXI7XG4gIHdhbGxIZWlnaHQ6IG51bWJlcjtcbiAgY2xlYXJhbmNlOiBudW1iZXI7XG4gIC8qKiBSZWxpZWYgYXQgb3IgYmVsb3cgdGhpcyBuZWVkcyBubyBncmFkaW5nIHRvIGJlIGNhbGxlZCB2YWxpZC4gKi9cbiAgbWF4UmVsaWVmTm9QcmVwOiBudW1iZXI7XG4gIC8qKiBSZWxpZWYgYWJvdmUgdGhpcyBjYW5ub3QgYmUgcHJlcGFyZWQgYnkgdGhpcyBidWlsZGluZyB0eXBlLiAqL1xuICBtYXhSZWxpZWZQcmVwYXJlZDogbnVtYmVyO1xuICBtYXhTdGVwOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG1heEN1dFZvbHVtZTogbnVtYmVyO1xuICBtYXhGaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heE9ic3RydWN0aW9uczogbnVtYmVyO1xuICByZXF1aXJlc0RyeTogYm9vbGVhbjtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblR5cGU7XG59XG5cbmV4cG9ydCBjb25zdCBIT1VTRV9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdob3VzZS04eDYnLFxuICB3aWR0aDogOCxcbiAgZGVwdGg6IDYsXG4gIHdhbGxIZWlnaHQ6IDMsXG4gIGNsZWFyYW5jZTogMyxcbiAgbWF4UmVsaWVmTm9QcmVwOiAxLjIsXG4gIG1heFJlbGllZlByZXBhcmVkOiA0LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMixcbiAgbWF4RmlsbDogMixcbiAgbWF4Q3V0Vm9sdW1lOiA0OCxcbiAgbWF4RmlsbFZvbHVtZTogNDgsXG4gIG1heE9ic3RydWN0aW9uczogMCxcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdncmFkZWRfcGFkJyxcbn07XG5cbmV4cG9ydCBjb25zdCBGQVJNX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ2Zhcm0tMTJ4OCcsXG4gIHdpZHRoOiAxMixcbiAgZGVwdGg6IDgsXG4gIHdhbGxIZWlnaHQ6IDAsXG4gIGNsZWFyYW5jZTogMSxcbiAgbWF4UmVsaWVmTm9QcmVwOiAxLjIsXG4gIG1heFJlbGllZlByZXBhcmVkOiA2LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMixcbiAgbWF4RmlsbDogMixcbiAgbWF4Q3V0Vm9sdW1lOiA5NixcbiAgbWF4RmlsbFZvbHVtZTogOTYsXG4gIG1heE9ic3RydWN0aW9uczogNCxcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdzdGVwcGVkX3BsaW50aCcsXG59O1xuXG5leHBvcnQgY29uc3QgUEFUSF9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdwYXRoLTl4MycsXG4gIHdpZHRoOiA5LFxuICBkZXB0aDogMyxcbiAgd2FsbEhlaWdodDogMCxcbiAgY2xlYXJhbmNlOiAxLFxuICBtYXhSZWxpZWZOb1ByZXA6IDIuMCxcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDQuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAxLFxuICBtYXhGaWxsOiAxLFxuICBtYXhDdXRWb2x1bWU6IDMyLFxuICBtYXhGaWxsVm9sdW1lOiAzMixcbiAgbWF4T2JzdHJ1Y3Rpb25zOiAyLFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ2RlY2snLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBTaXRlUHJvcG9zYWwge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uU3VtbWFyeSB7XG4gIG5lZWRzR3JhZGluZzogYm9vbGVhbjtcbiAgbmVlZHNDbGVhcmluZzogYm9vbGVhbjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25JZHM6IHN0cmluZ1tdO1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uVHlwZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlVmFsaWRhdGlvbiB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW107XG4gIHF1ZXJ5OiBGb290cHJpbnRRdWVyeTtcbiAgcHJlcGFyYXRpb246IFByZXBhcmF0aW9uU3VtbWFyeTtcbn1cblxuZnVuY3Rpb24gZXJyb3IoY29kZTogVmFsaWRhdGlvbkNvZGUsIG1lc3NhZ2U6IHN0cmluZywgdmFsdWU/OiBudW1iZXIsIGxpbWl0PzogbnVtYmVyKTogVmFsaWRhdGlvblJlYXNvbiB7XG4gIHJldHVybiB7IGNvZGUsIHNldmVyaXR5OiAnZXJyb3InLCBtZXNzYWdlLCB2YWx1ZSwgbGltaXQgfTtcbn1cblxuZnVuY3Rpb24gcHJlcChjb2RlOiBWYWxpZGF0aW9uQ29kZSwgbWVzc2FnZTogc3RyaW5nLCB2YWx1ZT86IG51bWJlciwgbGltaXQ/OiBudW1iZXIpOiBWYWxpZGF0aW9uUmVhc29uIHtcbiAgcmV0dXJuIHsgY29kZSwgc2V2ZXJpdHk6ICdwcmVwYXJhdGlvbicsIG1lc3NhZ2UsIHZhbHVlLCBsaW1pdCB9O1xufVxuXG4vKipcbiAqIFZhbGlkYXRlIGEgcHJvcG9zZWQgc2l0ZSBhZ2FpbnN0IGl0cyBidWlsZGluZyBydWxlcy4gUHVyZTogbm8gdm94ZWxzLFxuICogZW50aXRpZXMgb3IgcmVzb3VyY2VzIGNoYW5nZS4gYHF1ZXJ5YCBtYXkgYmUgc3VwcGxpZWQgYnkgYSBzZWFyY2ggdG8gcmV1c2VcbiAqIHRoZSBjYWNoZWQgY29sdW1ucywgYW5kIGBmb290cHJpbnRgIG1heSBiZSBzdXBwbGllZCB3aGVuIHRoZSBjYWxsZXIgYWxyZWFkeVxuICogZXZhbHVhdGVkIHRoZSBzYW1lIHJlY3QvZmxvb3IgcGFpci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlU2l0ZShcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpLFxuICBmb290cHJpbnQ/OiBGb290cHJpbnRRdWVyeSxcbik6IFNpdGVWYWxpZGF0aW9uIHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHJ1bGVzID0gcHJvcG9zYWwucnVsZXM7XG4gIGNvbnN0IHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXSA9IFtdO1xuICBjb25zdCBmcCA9IGZvb3RwcmludCA/PyBxdWVyeS5mb290cHJpbnQocmVjdCwgcHJvcG9zYWwuZmxvb3JZKTtcbiAgY29uc3Qgc3RhdHMgPSBmcC5zdGF0cztcblxuICBpZiAocmVjdC54MCA8IC1IQUxGIHx8IHJlY3QuejAgPCAtSEFMRiB8fCByZWN0LngxID49IEhBTEYgfHwgcmVjdC56MSA+PSBIQUxGKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKCdvdXRfb2ZfYm91bmRzJywgYGZvb3RwcmludCAke3JlY3QueDB9LCR7cmVjdC56MH0uLiR7cmVjdC54MX0sJHtyZWN0LnoxfSBpcyBvdXRzaWRlIHRoZSB3b3JsZGApKTtcbiAgfVxuICBpZiAocmVjdC54MSAtIHJlY3QueDAgKyAxICE9PSBydWxlcy53aWR0aCB8fCByZWN0LnoxIC0gcmVjdC56MCArIDEgIT09IHJ1bGVzLmRlcHRoKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2Zvb3RwcmludF9taXNtYXRjaCcsXG4gICAgICBgZm9vdHByaW50IGlzICR7cmVjdC54MSAtIHJlY3QueDAgKyAxfSB4ICR7cmVjdC56MSAtIHJlY3QuejAgKyAxfSBtLCAke3J1bGVzLndpZHRofSB4ICR7cnVsZXMuZGVwdGh9IG0gcmVxdWlyZWRgLFxuICAgICkpO1xuICB9XG5cbiAgaWYgKHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZlByZXBhcmVkKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3Nsb3BlX2V4Y2VlZGVkJyxcbiAgICAgIGByZWxpZWYgJHtzdGF0cy5yZWxpZWZ9IG0gZXhjZWVkcyB0aGUgJHtydWxlcy5tYXhSZWxpZWZQcmVwYXJlZH0gbSBwcmVwYXJlZCBsaW1pdGAsXG4gICAgICBzdGF0cy5yZWxpZWYsIHJ1bGVzLm1heFJlbGllZlByZXBhcmVkLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhTdGVwID4gcnVsZXMubWF4U3RlcCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdzdGVwX2V4Y2VlZGVkJyxcbiAgICAgIGBzdXJmYWNlIHN0ZXAgJHtzdGF0cy5tYXhTdGVwfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhTdGVwfSBtYCxcbiAgICAgIHN0YXRzLm1heFN0ZXAsIHJ1bGVzLm1heFN0ZXAsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEN1dCA+IHJ1bGVzLm1heEN1dCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdjdXRfZXhjZWVkZWQnLFxuICAgICAgYGN1dCAke3N0YXRzLm1heEN1dH0gbSBleGNlZWRzICR7cnVsZXMubWF4Q3V0fSBtYCxcbiAgICAgIHN0YXRzLm1heEN1dCwgcnVsZXMubWF4Q3V0LFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhGaWxsID4gcnVsZXMubWF4RmlsbCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmaWxsX2V4Y2VlZGVkJyxcbiAgICAgIGBmaWxsICR7c3RhdHMubWF4RmlsbH0gbSBleGNlZWRzICR7cnVsZXMubWF4RmlsbH0gbWAsXG4gICAgICBzdGF0cy5tYXhGaWxsLCBydWxlcy5tYXhGaWxsLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5jdXRWb2x1bWUgPiBydWxlcy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnY3V0X3ZvbHVtZV9leGNlZWRlZCcsXG4gICAgICBgY3V0IHZvbHVtZSAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4Q3V0Vm9sdW1lfSBtXHUwMEIzYCxcbiAgICAgIHN0YXRzLmN1dFZvbHVtZSwgcnVsZXMubWF4Q3V0Vm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5maWxsVm9sdW1lID4gcnVsZXMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmaWxsX3ZvbHVtZV9leGNlZWRlZCcsXG4gICAgICBgZmlsbCB2b2x1bWUgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsVm9sdW1lfSBtXHUwMEIzYCxcbiAgICAgIHN0YXRzLmZpbGxWb2x1bWUsIHJ1bGVzLm1heEZpbGxWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHJ1bGVzLnJlcXVpcmVzRHJ5ICYmIHN0YXRzLndhdGVyQ29sdW1ucyA+IDApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnd2F0ZXInLFxuICAgICAgYCR7c3RhdHMud2F0ZXJDb2x1bW5zfSBmb290cHJpbnQgY29sdW1ucyBhcmUgdW5kZXJ3YXRlcmAsXG4gICAgICBzdGF0cy53YXRlckNvbHVtbnMsIDAsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPiBydWxlcy5tYXhPYnN0cnVjdGlvbnMpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZm9vdHByaW50X29ic3RydWN0ZWQnLFxuICAgICAgYCR7c3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIGV4Y2VlZCB0aGUgJHtydWxlcy5tYXhPYnN0cnVjdGlvbnN9IGFsbG93YW5jZWAsXG4gICAgICBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoLCBydWxlcy5tYXhPYnN0cnVjdGlvbnMsXG4gICAgKSk7XG4gIH1cbiAgaWYgKGZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RoID4gMCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdvdmVyaGFuZycsXG4gICAgICBgJHtmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aH0gY2VsbHMgYWJvdmUgdGhlIGZsb29yIGFyZSBibG9ja2VkYCxcbiAgICAgIGZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RoLCAwLFxuICAgICkpO1xuICB9XG5cbiAgY29uc3QgbmVlZHNHcmFkaW5nID0gc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmTm9QcmVwXG4gICAgfHwgc3RhdHMuY3V0Vm9sdW1lID4gMCB8fCBzdGF0cy5maWxsVm9sdW1lID4gMDtcbiAgY29uc3QgbmVlZHNDbGVhcmluZyA9IHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPiAwXG4gICAgJiYgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA8PSBydWxlcy5tYXhPYnN0cnVjdGlvbnM7XG5cbiAgaWYgKG5lZWRzR3JhZGluZykge1xuICAgIHJlYXNvbnMucHVzaChwcmVwKFxuICAgICAgJ25lZWRzX2dyYWRpbmcnLFxuICAgICAgYGdyYWRpbmcgcmVxdWlyZWQ6ICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGN1dCwgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGZpbGxgLFxuICAgICAgc3RhdHMuY3V0Vm9sdW1lICsgc3RhdHMuZmlsbFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAobmVlZHNDbGVhcmluZykge1xuICAgIHJlYXNvbnMucHVzaChwcmVwKFxuICAgICAgJ25lZWRzX2NsZWFyaW5nJyxcbiAgICAgIGAke3N0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyB0byBjbGVhcmAsXG4gICAgICBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoLCBydWxlcy5tYXhPYnN0cnVjdGlvbnMsXG4gICAgKSk7XG4gIH1cblxuICBjb25zdCBoYXNFcnJvciA9IHJlYXNvbnMuc29tZSgocikgPT4gci5zZXZlcml0eSA9PT0gJ2Vycm9yJyk7XG4gIGNvbnN0IGhhc1ByZXAgPSByZWFzb25zLnNvbWUoKHIpID0+IHIuc2V2ZXJpdHkgPT09ICdwcmVwYXJhdGlvbicpO1xuICBjb25zdCBzdGF0ZTogU2l0ZVN0YXRlID0gaGFzRXJyb3IgPyAnaW52YWxpZCcgOiBoYXNQcmVwID8gJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nIDogJ3ZhbGlkJztcblxuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHN0YXRlLFxuICAgIHJlYXNvbnMsXG4gICAgcXVlcnk6IGZwLFxuICAgIHByZXBhcmF0aW9uOiB7XG4gICAgICBuZWVkc0dyYWRpbmcsXG4gICAgICBuZWVkc0NsZWFyaW5nLFxuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgICAgb2JzdHJ1Y3Rpb25JZHM6IHN0YXRzLm9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpLFxuICAgICAgZm91bmRhdGlvbjogcnVsZXMuZm91bmRhdGlvbixcbiAgICB9LFxuICB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNhbmRpZGF0ZSBzZWFyY2ggLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTZWFyY2hPcHRpb25zIHtcbiAgLyoqIENhbmRpZGF0ZSBncmlkIHN0ZXAgaW4gbWV0cmVzLiBEZWZhdWx0IDIuICovXG4gIHN0ZXA/OiBudW1iZXI7XG4gIG1heFJlc3VsdHM/OiBudW1iZXI7XG4gIGFuY2hvcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgbWF4RGlzdGFuY2U/OiBudW1iZXI7XG4gIC8qKiBIYXJkIGNvbnN0cmFpbnQ6IGNhbmRpZGF0ZSBjZW50cmUgbXVzdCBsaWUgd2l0aGluIHRoaXMgcmFkaXVzIG9mIGEgcG9pbnQuICovXG4gIG5lYXI/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyBtYXhEaXN0YW5jZTogbnVtYmVyIH07XG4gIC8qKiBEbyBub3QgcmV0dXJuIHR3byBjYW5kaWRhdGVzIHdob3NlIGZvb3RwcmludHMgb3ZlcmxhcC4gRGVmYXVsdCB0cnVlLiAqL1xuICBkaXN0aW5jdD86IGJvb2xlYW47XG4gIC8qKiBXYWxsLWNsb2NrIGJ1ZGdldCBmb3IgdGhlIHNjYW4uIERlZmF1bHQgMTAwIG1zLiAqL1xuICBidWRnZXRNcz86IG51bWJlcjtcbiAgd2Fsaz86IFdhbGtQYXJhbXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZUNhbmRpZGF0ZSB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgc3RhdGU6ICd2YWxpZCcgfCAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbic7XG4gIHZhbGlkYXRpb246IFNpdGVWYWxpZGF0aW9uO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBvYnN0cnVjdGlvbkNvdW50OiBudW1iZXI7XG4gIGRpc3RhbmNlOiBudW1iZXI7XG4gIHNjb3JlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVNlYXJjaFJlc3VsdCB7XG4gIGNhbmRpZGF0ZXM6IFNpdGVDYW5kaWRhdGVbXTtcbiAgZXZhbHVhdGVkOiBudW1iZXI7XG4gIHJlamVjdGVkOiBudW1iZXI7XG4gIGVsYXBzZWRNczogbnVtYmVyO1xuICBidWRnZXRNczogbnVtYmVyO1xuICAvKiogVHJ1ZSB3aGVuIHRoZSB3YWxsLWNsb2NrIGJ1ZGdldCBzdG9wcGVkIHRoZSBzY2FuIGJlZm9yZSB0aGUgYXJlYSB3YXMgZXhoYXVzdGVkLiAqL1xuICB0cnVuY2F0ZWQ6IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIGZsb29yQ2FuZGlkYXRlcyhzdGF0czogQXJlYVN0YXRzKTogbnVtYmVyW10ge1xuICBjb25zdCBtZWFuID0gTWF0aC5yb3VuZChzdGF0cy5tZWFuWSk7XG4gIGNvbnN0IHNldCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBmb3IgKGxldCBkID0gLTE7IGQgPD0gMTsgZCsrKSBzZXQuYWRkKG1lYW4gKyBkKTtcbiAgc2V0LmFkZChzdGF0cy5taW5ZKTtcbiAgc2V0LmFkZChzdGF0cy5tYXhZKTtcbiAgcmV0dXJuIFsuLi5zZXRdLmZpbHRlcigoeSkgPT4geSA+PSBZX01JTiAmJiB5IDwgWV9NQVgpLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbn1cblxuZnVuY3Rpb24gb3ZlcmxhcHMoYTogUmVjdCwgYjogUmVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gYS54MCA8PSBiLngxICYmIGEueDEgPj0gYi54MCAmJiBhLnowIDw9IGIuejEgJiYgYS56MSA+PSBiLnowO1xufVxuXG5mdW5jdGlvbiBjYW5kaWRhdGVTY29yZSh2OiBTaXRlVmFsaWRhdGlvbiwgZGlzdGFuY2U6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHByZXBQZW5hbHR5ID0gdi5zdGF0ZSA9PT0gJ3ZhbGlkJyA/IDAgOiAyNTtcbiAgY29uc3QgZ3JhZGluZyA9IHYucHJlcGFyYXRpb24uY3V0Vm9sdW1lICsgdi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lO1xuICBjb25zdCBjbGVhcmluZyA9IHYucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHMubGVuZ3RoICogNDtcbiAgcmV0dXJuIHByZXBQZW5hbHR5ICsgZ3JhZGluZyArIGNsZWFyaW5nICsgZGlzdGFuY2UgKiAwLjI1O1xufVxuXG4vKipcbiAqIFNlYXJjaCBhIGJvdW5kZWQgYXJlYSBmb3IgdmlhYmxlIGZvb3RwcmludHMuIFRoZSBzYW1lIHZhbGlkYXRvciBhbmQgdGhlIHNhbWVcbiAqIGZsb29yLXNlbGVjdGlvbiBwb2xpY3kgYXJlIHVzZWQgYnkgdGhlIEFJIGFnZW50IGFuZCB0aGUgcGxheWVyJ3MgYnVpbGRcbiAqIHByZXZpZXcuIFNlYXJjaCBpcyByZWFkLW9ubHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWFyY2hTaXRlcyhcbiAgd29ybGQ6IFdvcmxkLCBydWxlczogQnVpbGRpbmdSdWxlcywgYXJlYTogUmVjdCwgb3B0aW9uczogU2VhcmNoT3B0aW9ucyA9IHt9LFxuKTogU2l0ZVNlYXJjaFJlc3VsdCB7XG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IHN0ZXAgPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKG9wdGlvbnMuc3RlcCA/PyAyKSk7XG4gIGNvbnN0IG1heFJlc3VsdHMgPSBNYXRoLm1heCgxLCBvcHRpb25zLm1heFJlc3VsdHMgPz8gOCk7XG4gIGNvbnN0IGRpc3RpbmN0ID0gb3B0aW9ucy5kaXN0aW5jdCAhPT0gZmFsc2U7XG4gIGNvbnN0IG1heERpc3RhbmNlID0gb3B0aW9ucy5tYXhEaXN0YW5jZSA/PyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gIGNvbnN0IGJ1ZGdldE1zID0gb3B0aW9ucy5idWRnZXRNcyA/PyAxMDA7XG4gIGNvbnN0IGFuY2hvciA9IG9wdGlvbnMuYW5jaG9yID8/IHsgeDogKGFyZWEueDAgKyBhcmVhLngxKSAvIDIsIHo6IChhcmVhLnowICsgYXJlYS56MSkgLyAyIH07XG4gIGNvbnN0IHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCk7XG4gIGNvbnN0IGFsbDogU2l0ZUNhbmRpZGF0ZVtdID0gW107XG4gIGxldCBldmFsdWF0ZWQgPSAwO1xuICBsZXQgcmVqZWN0ZWQgPSAwO1xuICBsZXQgdHJ1bmNhdGVkID0gZmFsc2U7XG5cbiAgY29uc3QgeDFNYXggPSBhcmVhLngxIC0gcnVsZXMud2lkdGggKyAxO1xuICBjb25zdCB6MU1heCA9IGFyZWEuejEgLSBydWxlcy5kZXB0aCArIDE7XG4gIHNjYW46IGZvciAobGV0IHogPSBhcmVhLnowOyB6IDw9IHoxTWF4OyB6ICs9IHN0ZXApIHtcbiAgICBmb3IgKGxldCB4ID0gYXJlYS54MDsgeCA8PSB4MU1heDsgeCArPSBzdGVwKSB7XG4gICAgICBjb25zdCByZWN0ID0geyB4MDogeCwgejA6IHosIHgxOiB4ICsgcnVsZXMud2lkdGggLSAxLCB6MTogeiArIHJ1bGVzLmRlcHRoIC0gMSB9O1xuICAgICAgY29uc3QgY3ggPSAocmVjdC54MCArIHJlY3QueDEpIC8gMjtcbiAgICAgIGNvbnN0IGN6ID0gKHJlY3QuejAgKyByZWN0LnoxKSAvIDI7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguaHlwb3QoY3ggLSBhbmNob3IueCwgY3ogLSBhbmNob3Iueik7XG4gICAgICBpZiAoZGlzdGFuY2UgPiBtYXhEaXN0YW5jZSkgY29udGludWU7XG4gICAgICBpZiAob3B0aW9ucy5uZWFyKSB7XG4gICAgICAgIGNvbnN0IG5lYXJEaXN0YW5jZSA9IE1hdGguaHlwb3QoY3ggLSBvcHRpb25zLm5lYXIueCwgY3ogLSBvcHRpb25zLm5lYXIueik7XG4gICAgICAgIGlmIChuZWFyRGlzdGFuY2UgPiBvcHRpb25zLm5lYXIubWF4RGlzdGFuY2UpIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzdGF0cyA9IHF1ZXJ5LmFyZWEocmVjdCk7XG4gICAgICBsZXQgYmVzdDogU2l0ZUNhbmRpZGF0ZSB8IG51bGwgPSBudWxsO1xuICAgICAgZm9yIChjb25zdCBmbG9vclkgb2YgZmxvb3JDYW5kaWRhdGVzKHN0YXRzKSkge1xuICAgICAgICBldmFsdWF0ZWQrKztcbiAgICAgICAgY29uc3QgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCA9IHtcbiAgICAgICAgICBzaXRlSWQ6IGAke3J1bGVzLmlkfToke3h9LCR7en0sJHtmbG9vcll9YCxcbiAgICAgICAgICByZWN0LCBmbG9vclksIHJ1bGVzLFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBmb290cHJpbnQgPSBxdWVyeS5mb290cHJpbnQocmVjdCwgZmxvb3JZKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwsIHF1ZXJ5LCBmb290cHJpbnQpO1xuICAgICAgICBpZiAodmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnKSB7XG4gICAgICAgICAgcmVqZWN0ZWQrKztcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzY29yZSA9IGNhbmRpZGF0ZVNjb3JlKHZhbGlkYXRpb24sIGRpc3RhbmNlKTtcbiAgICAgICAgY29uc3QgY2FuZGlkYXRlOiBTaXRlQ2FuZGlkYXRlID0ge1xuICAgICAgICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgICAgICAgIHJlY3QsXG4gICAgICAgICAgZmxvb3JZLFxuICAgICAgICAgIHN0YXRlOiB2YWxpZGF0aW9uLnN0YXRlLFxuICAgICAgICAgIHZhbGlkYXRpb24sXG4gICAgICAgICAgY3V0Vm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmN1dFZvbHVtZSxcbiAgICAgICAgICBmaWxsVm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmZpbGxWb2x1bWUsXG4gICAgICAgICAgb2JzdHJ1Y3Rpb25Db3VudDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcy5sZW5ndGgsXG4gICAgICAgICAgZGlzdGFuY2UsXG4gICAgICAgICAgc2NvcmUsXG4gICAgICAgIH07XG4gICAgICAgIGlmICghYmVzdFxuICAgICAgICAgIHx8IChjYW5kaWRhdGUuc3RhdGUgPT09ICd2YWxpZCcgJiYgYmVzdC5zdGF0ZSAhPT0gJ3ZhbGlkJylcbiAgICAgICAgICB8fCAoY2FuZGlkYXRlLnN0YXRlID09PSBiZXN0LnN0YXRlICYmIGNhbmRpZGF0ZS5zY29yZSA8IGJlc3Quc2NvcmUpKSB7XG4gICAgICAgICAgYmVzdCA9IGNhbmRpZGF0ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGJlc3QpIGFsbC5wdXNoKGJlc3QpO1xuICAgIH1cbiAgICBpZiAocGVyZm9ybWFuY2Uubm93KCkgLSB0MCA+IGJ1ZGdldE1zKSB7XG4gICAgICB0cnVuY2F0ZWQgPSB0cnVlO1xuICAgICAgYnJlYWsgc2NhbjtcbiAgICB9XG4gIH1cblxuICBhbGwuc29ydCgoYSwgYikgPT4gYS5zY29yZSAtIGIuc2NvcmUgfHwgYS5kaXN0YW5jZSAtIGIuZGlzdGFuY2VcbiAgICB8fCBhLnJlY3QueDAgLSBiLnJlY3QueDAgfHwgYS5yZWN0LnowIC0gYi5yZWN0LnowKTtcbiAgY29uc3Qgc2VsZWN0ZWQ6IFNpdGVDYW5kaWRhdGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBhbGwpIHtcbiAgICBpZiAoZGlzdGluY3QgJiYgc2VsZWN0ZWQuc29tZSgocykgPT4gb3ZlcmxhcHMocy5yZWN0LCBjYW5kaWRhdGUucmVjdCkpKSBjb250aW51ZTtcbiAgICBzZWxlY3RlZC5wdXNoKGNhbmRpZGF0ZSk7XG4gICAgaWYgKHNlbGVjdGVkLmxlbmd0aCA+PSBtYXhSZXN1bHRzKSBicmVhaztcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2FuZGlkYXRlczogc2VsZWN0ZWQsXG4gICAgZXZhbHVhdGVkLFxuICAgIHJlamVjdGVkLFxuICAgIGVsYXBzZWRNczogTWF0aC5yb3VuZCgocGVyZm9ybWFuY2Uubm93KCkgLSB0MCkgKiAxMDApIC8gMTAwLFxuICAgIGJ1ZGdldE1zLFxuICAgIHRydW5jYXRlZCxcbiAgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwcmV2aWV3IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgRm91bmRhdGlvblByZXZpZXcge1xuICB0eXBlOiBGb3VuZGF0aW9uVHlwZTtcbiAgLyoqIFN0b25lIGZsb29yIHNsYWIgcGx1cyBmaWxsIHVuZGVyIHRoZSBwcmVwYXJlZCBmbG9vci4gKi9cbiAgcGxpbnRoQ2VsbHM6IG51bWJlcjtcbiAgLyoqIFBlcmltZXRlciBjZWxscyB0aGF0IG5lZWQgYSByZXRhaW5pbmcgZmFjZSBiZWNhdXNlIG9mIGN1dCBvciBmaWxsLiAqL1xuICByZXRhaW5pbmdXYWxsQ2VsbHM6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBY2Nlc3NQcmV2aWV3IHtcbiAgZG9vcjogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBkaXN0YW5jZTogbnVtYmVyO1xuICBncmFkZTogbnVtYmVyO1xuICB3YWxrYWJsZTogYm9vbGVhbjtcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVByZXZpZXcge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgc3RhdGU6IFNpdGVTdGF0ZTtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW107XG4gIHRlcnJhaW46IHtcbiAgICBtaW5ZOiBudW1iZXI7XG4gICAgbWF4WTogbnVtYmVyO1xuICAgIG1lYW5ZOiBudW1iZXI7XG4gICAgcmVsaWVmOiBudW1iZXI7XG4gICAgbWF4U3RlcDogbnVtYmVyO1xuICAgIGN1dFZvbHVtZTogbnVtYmVyO1xuICAgIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgICBtYXhDdXQ6IG51bWJlcjtcbiAgICBtYXhGaWxsOiBudW1iZXI7XG4gIH07XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25QcmV2aWV3O1xuICBvYnN0cnVjdGlvbnM6IEFycmF5PHtcbiAgICBlbnRpdHlJZDogc3RyaW5nO1xuICAgIGtpbmQ6IHN0cmluZztcbiAgICB4OiBudW1iZXI7XG4gICAgejogbnVtYmVyO1xuICAgIGFjdGlvbjogJ2NsZWFyJyB8ICdibG9ja2VkJztcbiAgfT47XG4gIGFjY2VzczogQWNjZXNzUHJldmlldyB8IG51bGw7XG4gIC8qKiBDb21wbGV0ZSB3b3JrIGVudmVsb3BlIHRoaXMgcHJldmlldyB3b3VsZCBhdXRob3JpemUuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXZpZXdPcHRpb25zIHtcbiAgZG9vcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHdhbGs/OiBXYWxrUGFyYW1zO1xufVxuXG4vKipcbiAqIEJ1aWxkIHRoZSB0aHJlZS1zdGF0ZSBwcmV2aWV3LiBJdCBpcyBkZWxpYmVyYXRlbHkgZGF0YS1vbmx5OiB0aGUgcmVuZGVyZXJcbiAqIGNhbiBkcmF3IGl0LCBidXQgaXQgbmV2ZXIgZWRpdHMgdGVycmFpbiBvciBzcGVuZHMgcmVzb3VyY2VzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJldmlld1NpdGUoXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgb3B0aW9uczogUHJldmlld09wdGlvbnMgPSB7fSxcbik6IFNpdGVQcmV2aWV3IHtcbiAgY29uc3QgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKTtcbiAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwsIHF1ZXJ5KTtcbiAgY29uc3QgZnAgPSB2YWxpZGF0aW9uLnF1ZXJ5O1xuICBjb25zdCBzdGF0cyA9IGZwLnN0YXRzO1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgcnVsZXMgPSBwcm9wb3NhbC5ydWxlcztcblxuICBsZXQgcGVyaW1ldGVyID0gMDtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgICBpZiAoeCAhPT0gcmVjdC54MCAmJiB4ICE9PSByZWN0LngxICYmIHogIT09IHJlY3QuejAgJiYgeiAhPT0gcmVjdC56MSkgY29udGludWU7XG4gICAgICBpZiAoY29sdW1uQXQod29ybGQsIHgsIHopLnN1cmZhY2VZICE9PSBwcm9wb3NhbC5mbG9vclkpIHBlcmltZXRlcisrO1xuICAgIH1cbiAgfVxuICBjb25zdCBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uUHJldmlldyA9IHtcbiAgICB0eXBlOiBydWxlcy5mb3VuZGF0aW9uLFxuICAgIHBsaW50aENlbGxzOiByZWN0Q29sdW1ucyhyZWN0KSArIHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgcmV0YWluaW5nV2FsbENlbGxzOiBwZXJpbWV0ZXIsXG4gICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgfTtcblxuICBsZXQgYWNjZXNzOiBBY2Nlc3NQcmV2aWV3IHwgbnVsbCA9IG51bGw7XG4gIGlmIChvcHRpb25zLmRvb3IgJiYgb3B0aW9ucy5hcHByb2FjaCkge1xuICAgIGNvbnN0IGRvb3IgPSBvcHRpb25zLmRvb3I7XG4gICAgY29uc3QgYXBwcm9hY2ggPSBvcHRpb25zLmFwcHJvYWNoO1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLmh5cG90KGRvb3IueCAtIGFwcHJvYWNoLngsIGRvb3IueiAtIGFwcHJvYWNoLnopO1xuICAgIGNvbnN0IHN0ZXBzID0gTWF0aC5tYXgoMSwgTWF0aC5jZWlsKGRpc3RhbmNlKSk7XG4gICAgbGV0IHByZXZYID0gYXBwcm9hY2gueCwgcHJldlogPSBhcHByb2FjaC56O1xuICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IHN0ZXBzOyBpKyspIHtcbiAgICAgIGNvbnN0IHQgPSBpIC8gc3RlcHM7XG4gICAgICBjb25zdCB4ID0gTWF0aC5yb3VuZChhcHByb2FjaC54ICsgKGRvb3IueCAtIGFwcHJvYWNoLngpICogdCk7XG4gICAgICBjb25zdCB6ID0gTWF0aC5yb3VuZChhcHByb2FjaC56ICsgKGRvb3IueiAtIGFwcHJvYWNoLnopICogdCk7XG4gICAgICBpZiAoeCA9PT0gcHJldlggJiYgeiA9PT0gcHJldlopIGNvbnRpbnVlO1xuICAgICAgY29uc3QgcmVzdWx0ID0gd2Fsa1N0ZXAod29ybGQsIHByZXZYLCBwcmV2WiwgeCwgeiwgb3B0aW9ucy53YWxrID8/IERFRkFVTFRfV0FMSyk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmVhc29ucy5wdXNoKGAke3Jlc3VsdC5yZWFzb259IGF0ICR7eH0sJHt6fWApO1xuICAgICAgcHJldlggPSB4OyBwcmV2WiA9IHo7XG4gICAgfVxuICAgIGFjY2VzcyA9IHtcbiAgICAgIGRvb3IsIGFwcHJvYWNoLCBkaXN0YW5jZSxcbiAgICAgIGdyYWRlOiBlZmZlY3RpdmVHcmFkZSh3b3JsZCwgYXBwcm9hY2gueCwgYXBwcm9hY2gueiwgZG9vci54LCBkb29yLnopLFxuICAgICAgd2Fsa2FibGU6IHJlYXNvbnMubGVuZ3RoID09PSAwLFxuICAgICAgcmVhc29ucyxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgeTAgPSBwcm9wb3NhbC5mbG9vclkgLSBNYXRoLm1heCgxLCBzdGF0cy5tYXhDdXQpIC0gMTtcbiAgY29uc3QgeTEgPSBwcm9wb3NhbC5mbG9vclkgKyBNYXRoLm1heChydWxlcy53YWxsSGVpZ2h0LCAxKSArIDE7XG4gIGNvbnN0IGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdID0gW1xuICAgIHtcbiAgICAgIC4uLmV4cGFuZFJlY3QocmVjdCwgMiksXG4gICAgICB5MDogTWF0aC5tYXgoWV9NSU4sIHkwKSxcbiAgICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIHkxKSxcbiAgICB9LFxuICBdO1xuICBpZiAoYWNjZXNzKSB7XG4gICAgY29uc3QgYXgwID0gTWF0aC5taW4oYWNjZXNzLmRvb3IueCwgYWNjZXNzLmFwcHJvYWNoLngpIC0gMTtcbiAgICBjb25zdCBheDEgPSBNYXRoLm1heChhY2Nlc3MuZG9vci54LCBhY2Nlc3MuYXBwcm9hY2gueCkgKyAxO1xuICAgIGNvbnN0IGF6MCA9IE1hdGgubWluKGFjY2Vzcy5kb29yLnosIGFjY2Vzcy5hcHByb2FjaC56KSAtIDE7XG4gICAgY29uc3QgYXoxID0gTWF0aC5tYXgoYWNjZXNzLmRvb3IueiwgYWNjZXNzLmFwcHJvYWNoLnopICsgMTtcbiAgICBjb25zdCBhTWluID0gTWF0aC5taW4oc3VyZmFjZUF0KHdvcmxkLCBheDAsIGF6MCksIHN1cmZhY2VBdCh3b3JsZCwgYXgxLCBhejEpKTtcbiAgICBjb25zdCBhTWF4ID0gTWF0aC5tYXgoc3VyZmFjZUF0KHdvcmxkLCBheDAsIGF6MCksIHN1cmZhY2VBdCh3b3JsZCwgYXgxLCBhejEpKTtcbiAgICBlbnZlbG9wZS5wdXNoKHtcbiAgICAgIHgwOiBheDAsIHgxOiBheDEsIHowOiBhejAsIHoxOiBhejEsXG4gICAgICB5MDogTWF0aC5tYXgoWV9NSU4sIGFNaW4gLSAyKSxcbiAgICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIGFNYXggKyAyKSxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgc3RhdGU6IHZhbGlkYXRpb24uc3RhdGUsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBydWxlcyxcbiAgICByZWFzb25zOiB2YWxpZGF0aW9uLnJlYXNvbnMsXG4gICAgdGVycmFpbjoge1xuICAgICAgbWluWTogc3RhdHMubWluWSxcbiAgICAgIG1heFk6IHN0YXRzLm1heFksXG4gICAgICBtZWFuWTogc3RhdHMubWVhblksXG4gICAgICByZWxpZWY6IHN0YXRzLnJlbGllZixcbiAgICAgIG1heFN0ZXA6IHN0YXRzLm1heFN0ZXAsXG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgfSxcbiAgICBmb3VuZGF0aW9uLFxuICAgIG9ic3RydWN0aW9uczogc3RhdHMub2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gKHtcbiAgICAgIGVudGl0eUlkOiBvLmVudGl0eUlkLFxuICAgICAga2luZDogby5raW5kLFxuICAgICAgeDogby54LFxuICAgICAgejogby56LFxuICAgICAgYWN0aW9uOiB2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcgPyAnYmxvY2tlZCcgOiAnY2xlYXInLFxuICAgIH0pKSxcbiAgICBhY2Nlc3MsXG4gICAgZW52ZWxvcGUsXG4gIH07XG59XG5cbiIsICIvLyBNMDAyIHN0YWdlIDM6IGJvdW5kZWQsIGF1dGhvcml6ZWQgdGVycmFpbiBwcmVwYXJhdGlvbi5cbi8vXG4vLyBUaGUgcGlwZWxpbmUgaXMgZGVsaWJlcmF0ZWx5IG9uZS13YXkgYW5kIHNoYXJlZCBieSB0aGUgcGxheWVyIGFuZCB0aGUgQUk6XG4vL1xuLy8gICBwcm9wb3NhbCAtPiB2YWxpZGF0ZVNpdGUgLT4gcGxhblByZXBhcmF0aW9uIC0+IEF1dGhvcml6ZXIgLT4gZXhlY3V0ZVxuLy9cbi8vIGBleGVjdXRlUHJlcGFyYXRpb25gIGlzIHRoZSBvbmx5IGZ1bmN0aW9uIGluIE0wMDIgdGhhdCBlZGl0cyB0ZXJyYWluIGZvclxuLy8gY29uc3RydWN0aW9uLiBJdCByZWZ1c2VzIHRvIHJ1biB3aXRob3V0IGFuIGF1dGhvcml6YXRpb24gdG9rZW4gd2hvc2UgZGlnZXN0XG4vLyBtYXRjaGVzIHRoZSBwbGFuLCB3aG9zZSBlbnZlbG9wZSBjb3ZlcnMgZXZlcnkgdm94ZWwgaXQgd291bGQgdG91Y2gsIGFuZCB3aG9zZVxuLy8gYmFzZSByZXZpc2lvbiBzdGlsbCBtYXRjaGVzIHRoZSB3b3JsZC4gQWxsIGVkaXRzIGFyZSBjb21wdXRlZCBhbmQgY2hlY2tlZFxuLy8gYmVmb3JlIHRoZSBmaXJzdCBieXRlIGlzIHdyaXR0ZW4sIHNvIGEgcmVqZWN0ZWQgcGxhbiBjYW5ub3QgbGVhdmUgYSBwYXJ0aWFsXG4vLyBwYWQgYmVoaW5kLlxuLy9cbi8vIFRoZSBhdXRob3JpemVyIGluIHRoaXMgZmlsZSBpcyBhIGxvY2FsIHBvbGljeSBzdHViLiBJdCBwcm92ZXMgdGhhdCB0aGVcbi8vIHBpcGVsaW5lIGFuZCB0aGUgZW52ZWxvcGUgY2hlY2tzIGV4aXN0OyBpdCBpcyBOT1QgTWFnaWNCbG9jayBlbmZvcmNlbWVudC5cbi8vIE5vIGNoYWluIHByb2dyYW0sIFNESyBjYWxsLCBzZXR0bGVtZW50IG9yIHJvbGxiYWNrIGd1YXJhbnRlZSBpcyBwcmVzZW50LlxuaW1wb3J0IHtcbiAgV29ybGQsIE1BVCwgTWF0SWQsIFlfTUlOLCBZX01BWCwgSEFMRiwgaXNTb2xpZCxcbiAgZ2V0Vm94ZWwsIHNldFZveGVsLCByZW1vdmVFbnRpdHksIHN1cmZhY2VBdCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIEVudGl0eUtpbmQsIFJlc291cmNlVHlwZSxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBSZWN0LCBWb3hlbFJlZ2lvbiwgbm9ybWFsaXplUmVjdCwgcmVjdENvbHVtbnMsIGV4cGFuZFJlY3QsXG4gIGVudmVsb3BlQ29udGFpbnMsIG9ic3RydWN0aW9uc0luLFxufSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgU2l0ZVByb3Bvc2FsLCBTaXRlVmFsaWRhdGlvbiwgQnVpbGRpbmdSdWxlcywgdmFsaWRhdGVTaXRlLFxufSBmcm9tICcuL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBpbnZlbnRvcnlTbmFwc2hvdCwgbm9ybWFsaXplRW52ZWxvcGUsXG59IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IGNvbnN0IExPQ0FMX0FVVEhPUklUWSA9ICdsb2NhbC1zdHViJyBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBMT0NBTF9FTkZPUkNFTUVOVCA9ICdsb2NhbC1zaW11bGF0aW9uLW9ubHknIGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbHVtblRhcmdldCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGxhbkV4cGVjdGF0aW9uIHtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25zOiBudW1iZXI7XG4gIHN1cmZhY2VFZGl0czogbnVtYmVyO1xuICB0b3RhbEVkaXRzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25QbGFuIHtcbiAgaWQ6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbiAgLyoqIEV4YWN0bHkgb25lIHRhcmdldCB3YWxraW5nIGhlaWdodCBwZXIgZm9vdHByaW50IGNvbHVtbiwgc29ydGVkIGJ5IHosIHguICovXG4gIHRhcmdldHM6IENvbHVtblRhcmdldFtdO1xuICAvKiogQXV0aG9yaXRhdGl2ZSBlbnRpdHkgaWRzIHRoaXMgcGxhbiBtYXkgcmVtb3ZlLiAqL1xuICBjbGVhckVudGl0eUlkczogc3RyaW5nW107XG4gIC8qKiBNYXRlcmlhbCBmb3IgdGhlIHRvcCBzb2xpZCB2b3hlbCBhZnRlciBncmFkaW5nLCBvciBudWxsIHRvIGtlZXAgaXQuICovXG4gIHN1cmZhY2VNYXRlcmlhbDogTWF0SWQgfCBudWxsO1xuICAvKiogVGlnaHQgZW52ZWxvcGUgY292ZXJpbmcgZXZlcnkgcGxhbm5lZCB2b3hlbCBjaGFuZ2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBleHBlY3RlZDogUGxhbkV4cGVjdGF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uT3B0aW9ucyB7XG4gIC8qKiBQZXItY29sdW1uIHRhcmdldHMgZm9yIHRlcnJhY2VzIG9yIHN0ZXBwZWQgcGF0aHMuIERlZmF1bHRzIHRvIGZsb29yWS4gKi9cbiAgdGFyZ2V0cz86IENvbHVtblRhcmdldFtdO1xuICAvKiogYG5vbmVgIGlzIG9ubHkgbGVnYWwgd2hlbiB0aGUgc2l0ZSBoYXMgbm8gb2JzdHJ1Y3Rpb25zLiAqL1xuICBjbGVhcj86ICdvYnN0cnVjdGlvbnMnIHwgJ25vbmUnO1xuICAvKiogU2V0IHRoZSB0b3Agc29saWQgdm94ZWwgb2YgZXZlcnkgdGFyZ2V0IGNvbHVtbiAocGF0aHMsIGZpZWxkcykuICovXG4gIHN1cmZhY2VNYXRlcmlhbD86IE1hdElkO1xuICAvKiogRXhwbGljaXQgd29yayBlbnZlbG9wZS4gRGVmYXVsdHMgdG8gYSB0aWdodCBlbnZlbG9wZSBhcm91bmQgdGhlIGVkaXRzLiAqL1xuICBlbnZlbG9wZT86IFZveGVsUmVnaW9uW107XG59XG5cbi8vIC0tLS0tLS0tLS0gc3RhYmxlIGRpZ2VzdCAtLS0tLS0tLS0tXG5mdW5jdGlvbiBkaWdlc3QoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBhID0gMHg4MTFjOWRjNTtcbiAgbGV0IGIgPSAweDllMzc3OWI5O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYyA9IGlucHV0LmNoYXJDb2RlQXQoaSk7XG4gICAgYSA9IE1hdGguaW11bChhIF4gYywgMHgwMTAwMDE5Myk7XG4gICAgYiA9IE1hdGguaW11bChiIF4gKGMgKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgYiBePSBiID4+PiAxMztcbiAgfVxuICByZXR1cm4gKGEgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpXG4gICAgKyAoYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbi8qKiBEaWdlc3Qgb2YgZXZlcnl0aGluZyB0aGF0IGNoYW5nZXMgdGhlIHNldCBvZiBlZGl0cyBvciByZW1vdmFscy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFuRGlnZXN0KHBsYW46IFByZXBhcmF0aW9uUGxhbik6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtcbiAgICAnbTAwMjpwcmVwLXBsYW46djEnLFxuICAgIHBsYW4uc2l0ZUlkLFxuICAgIGAke3BsYW4ucmVjdC54MH0sJHtwbGFuLnJlY3QuejB9LCR7cGxhbi5yZWN0LngxfSwke3BsYW4ucmVjdC56MX1gLFxuICAgIFN0cmluZyhwbGFuLmZsb29yWSksXG4gICAgcGxhbi5ydWxlcy5pZCxcbiAgICBTdHJpbmcocGxhbi50YXJnZXRzLmxlbmd0aCksXG4gICAgcGxhbi5zdXJmYWNlTWF0ZXJpYWwgPT09IG51bGwgPyAnc3VyZmFjZTprZWVwJyA6IGBzdXJmYWNlOiR7cGxhbi5zdXJmYWNlTWF0ZXJpYWx9YCxcbiAgXTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykgbGluZXMucHVzaChgdDoke3QueH0sJHt0Lnp9LCR7dC55fWApO1xuICBjb25zdCBjbGVhcnMgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICBsaW5lcy5wdXNoKGBjOiR7Y2xlYXJzLmxlbmd0aH1gKTtcbiAgZm9yIChjb25zdCBpZCBvZiBjbGVhcnMpIGxpbmVzLnB1c2goYGM6JHtpZH1gKTtcbiAgZm9yIChjb25zdCBlIG9mIG5vcm1hbGl6ZUVudmVsb3BlKHBsYW4uZW52ZWxvcGUpKSB7XG4gICAgbGluZXMucHVzaChgZToke2UueDB9LCR7ZS56MH0sJHtlLnkwfSwke2UueDF9LCR7ZS56MX0sJHtlLnkxfWApO1xuICB9XG4gIGNvbnN0IHggPSBwbGFuLmV4cGVjdGVkO1xuICBsaW5lcy5wdXNoKGB4OiR7eC5jdXRWb2x1bWV9LCR7eC5maWxsVm9sdW1lfSwke3gubWF4Q3V0fSwke3gubWF4RmlsbH0sJHt4Lm9ic3RydWN0aW9uc30sJHt4LnN1cmZhY2VFZGl0c30sJHt4LnRvdGFsRWRpdHN9YCk7XG4gIHJldHVybiBkaWdlc3QobGluZXMuam9pbignXFxuJykpO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBsYW5uaW5nIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgUGxhblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogUHJlcGFyYXRpb25QbGFuO1xuICB2YWxpZGF0aW9uOiBTaXRlVmFsaWRhdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbkZhaWx1cmUge1xuICBvazogZmFsc2U7XG4gIHN0YWdlOiAncGxhbicgfCAnYXV0aG9yaXplJyB8ICdleGVjdXRlJztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbiAgdmFsaWRhdGlvbj86IFNpdGVWYWxpZGF0aW9uO1xufVxuXG5leHBvcnQgdHlwZSBQbGFuUmVzdWx0ID0gUGxhblN1Y2Nlc3MgfCBQcmVwYXJhdGlvbkZhaWx1cmU7XG5cbmZ1bmN0aW9uIGRlZmF1bHRUYXJnZXRzKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCwgZmxvb3JZOiBudW1iZXIpOiBDb2x1bW5UYXJnZXRbXSB7XG4gIGNvbnN0IG91dDogQ29sdW1uVGFyZ2V0W10gPSBbXTtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSBvdXQucHVzaCh7IHgsIHosIHk6IGZsb29yWSB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBzb3J0ZWRUYXJnZXRzKHRhcmdldHM6IHJlYWRvbmx5IENvbHVtblRhcmdldFtdKTogQ29sdW1uVGFyZ2V0W10ge1xuICByZXR1cm4gWy4uLnRhcmdldHNdLnNvcnQoKGEsIGIpID0+IGEueiAtIGIueiB8fCBhLnggLSBiLnggfHwgYS55IC0gYi55KTtcbn1cblxuaW50ZXJmYWNlIFRhcmdldFN0YXRzIHtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgcmVsaWVmOiBudW1iZXI7XG59XG5cbi8qKiBDdXQvZmlsbCBpbXBsaWVkIGJ5IGV4cGxpY2l0IHRhcmdldHMsIGluZGVwZW5kZW50IG9mIHRoZSBmbGF0IGZsb29yWS4gKi9cbmZ1bmN0aW9uIHRhcmdldFN0YXRzKHdvcmxkOiBXb3JsZCwgdGFyZ2V0czogcmVhZG9ubHkgQ29sdW1uVGFyZ2V0W10pOiBUYXJnZXRTdGF0cyB7XG4gIGxldCBjdXRWb2x1bWUgPSAwLCBmaWxsVm9sdW1lID0gMCwgbWF4Q3V0ID0gMCwgbWF4RmlsbCA9IDA7XG4gIGxldCBtaW5ZID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhZID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgc3VyZmFjZSwgdC55KTtcbiAgICBtYXhZID0gTWF0aC5tYXgobWF4WSwgc3VyZmFjZSwgdC55KTtcbiAgICBpZiAoc3VyZmFjZSA+IHQueSkge1xuICAgICAgY29uc3QgZCA9IHN1cmZhY2UgLSB0Lnk7XG4gICAgICBjdXRWb2x1bWUgKz0gZDtcbiAgICAgIG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZCk7XG4gICAgfSBlbHNlIGlmIChzdXJmYWNlIDwgdC55KSB7XG4gICAgICBjb25zdCBkID0gdC55IC0gc3VyZmFjZTtcbiAgICAgIGZpbGxWb2x1bWUgKz0gZDtcbiAgICAgIG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCBkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgY3V0Vm9sdW1lLCBmaWxsVm9sdW1lLCBtYXhDdXQsIG1heEZpbGwsIHJlbGllZjogbWF4WSAtIG1pblkgfTtcbn1cblxuZnVuY3Rpb24gdGFyZ2V0UnVsZVJlYXNvbnMoc3RhdHM6IFRhcmdldFN0YXRzLCBydWxlczogQnVpbGRpbmdSdWxlcyk6IHN0cmluZ1tdIHtcbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZlByZXBhcmVkKSB7XG4gICAgcmVhc29ucy5wdXNoKGByZWxpZWYgJHtzdGF0cy5yZWxpZWZ9IG0gZXhjZWVkcyB0aGUgJHtydWxlcy5tYXhSZWxpZWZQcmVwYXJlZH0gbSBwcmVwYXJlZCBsaW1pdGApO1xuICB9XG4gIGlmIChzdGF0cy5tYXhDdXQgPiBydWxlcy5tYXhDdXQpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCAke3N0YXRzLm1heEN1dH0gbSBleGNlZWRzICR7cnVsZXMubWF4Q3V0fSBtYCk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEZpbGwgPiBydWxlcy5tYXhGaWxsKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsICR7c3RhdHMubWF4RmlsbH0gbSBleGNlZWRzICR7cnVsZXMubWF4RmlsbH0gbWApO1xuICB9XG4gIGlmIChzdGF0cy5jdXRWb2x1bWUgPiBydWxlcy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCB2b2x1bWUgJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEN1dFZvbHVtZX0gbVx1MDBCM2ApO1xuICB9XG4gIGlmIChzdGF0cy5maWxsVm9sdW1lID4gcnVsZXMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCB2b2x1bWUgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsVm9sdW1lfSBtXHUwMEIzYCk7XG4gIH1cbiAgcmV0dXJuIHJlYXNvbnM7XG59XG5cbi8qKlxuICogVHVybiBhIHByb3Bvc2FsIGludG8gYW4gZXhwbGljaXQsIGNoZWNrYWJsZSBwbGFuLiBSZWFkLW9ubHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFuUHJlcGFyYXRpb24oXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgb3B0aW9uczogUHJlcGFyYXRpb25PcHRpb25zID0ge30sXG4pOiBQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsKTtcblxuICBpZiAodmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAnc2l0ZV9pbnZhbGlkJyxcbiAgICAgIHJlYXNvbnM6IHZhbGlkYXRpb24ucmVhc29ucy5tYXAoKHIpID0+IGAke3IuY29kZX06ICR7ci5tZXNzYWdlfWApLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgdGFyZ2V0cyA9IHNvcnRlZFRhcmdldHMob3B0aW9ucy50YXJnZXRzID8/IGRlZmF1bHRUYXJnZXRzKHdvcmxkLCByZWN0LCBwcm9wb3NhbC5mbG9vclkpKTtcbiAgY29uc3QgY29sdW1ucyA9IHJlY3RDb2x1bW5zKHJlY3QpO1xuICBpZiAodGFyZ2V0cy5sZW5ndGggIT09IGNvbHVtbnMpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICd0YXJnZXRfY291bnQnLFxuICAgICAgcmVhc29uczogW2BwbGFuIGhhcyAke3RhcmdldHMubGVuZ3RofSB0YXJnZXRzIGZvciAke2NvbHVtbnN9IGNvbHVtbnNgXSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBrZXkgPSBgJHt0Lnh9LCR7dC56fWA7XG4gICAgaWYgKHNlZW4uaGFzKGtleSkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ2R1cGxpY2F0ZV90YXJnZXQnLFxuICAgICAgICByZWFzb25zOiBbYGR1cGxpY2F0ZSB0YXJnZXQgYXQgJHtrZXl9YF0sIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgICBzZWVuLmFkZChrZXkpO1xuICAgIGlmICh0LnggPCByZWN0LngwIHx8IHQueCA+IHJlY3QueDEgfHwgdC56IDwgcmVjdC56MCB8fCB0LnogPiByZWN0LnoxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICd0YXJnZXRfb3V0c2lkZV9mb290cHJpbnQnLFxuICAgICAgICByZWFzb25zOiBbYHRhcmdldCAke2tleX0gaXMgb3V0c2lkZSAke3JlY3QueDB9LCR7cmVjdC56MH0uLiR7cmVjdC54MX0sJHtyZWN0LnoxfWBdLFxuICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHQueSkgfHwgdC55IDwgWV9NSU4gfHwgdC55ID49IFlfTUFYKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICd0YXJnZXRfaGVpZ2h0JyxcbiAgICAgICAgcmVhc29uczogW2B0YXJnZXQgJHtrZXl9IGhhcyBpbnZhbGlkIGhlaWdodCAke3QueX1gXSwgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcztcbiAgY29uc3QgY2xlYXIgPSBvcHRpb25zLmNsZWFyID8/ICdvYnN0cnVjdGlvbnMnO1xuICBpZiAoY2xlYXIgPT09ICdub25lJyAmJiBvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3VuY2xlYXJlZF9vYnN0cnVjdGlvbnMnLFxuICAgICAgcmVhc29uczogW2Ake29ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyB3b3VsZCByZW1haW5gXSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuICBjb25zdCBjbGVhckVudGl0eUlkcyA9IGNsZWFyID09PSAnbm9uZScgPyBbXSA6IFsuLi5uZXcgU2V0KG9ic3RydWN0aW9ucyldLnNvcnQoKTtcbiAgY29uc3Qgc3VyZmFjZU1hdGVyaWFsID0gb3B0aW9ucy5zdXJmYWNlTWF0ZXJpYWwgPz8gbnVsbDtcblxuICBjb25zdCBjdXN0b21UYXJnZXRzID0gb3B0aW9ucy50YXJnZXRzICE9PSB1bmRlZmluZWQ7XG4gIGNvbnN0IHN0YXRzID0gY3VzdG9tVGFyZ2V0c1xuICAgID8gdGFyZ2V0U3RhdHMod29ybGQsIHRhcmdldHMpXG4gICAgOiB7XG4gICAgICBjdXRWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ubWF4RmlsbCxcbiAgICAgIHJlbGllZjogdmFsaWRhdGlvbi5xdWVyeS5zdGF0cy5yZWxpZWYsXG4gICAgfTtcbiAgaWYgKGN1c3RvbVRhcmdldHMpIHtcbiAgICBjb25zdCByZWFzb25zID0gdGFyZ2V0UnVsZVJlYXNvbnMoc3RhdHMsIHByb3Bvc2FsLnJ1bGVzKTtcbiAgICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsXG4gICAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICAgIGNvZGU6ICd0YXJnZXRfcnVsZXMnLFxuICAgICAgICByZWFzb25zLFxuICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBsZXQgbG8gPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gIGxldCBoaSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgbG8gPSBNYXRoLm1pbihsbywgc3VyZmFjZSwgdC55KTtcbiAgICBoaSA9IE1hdGgubWF4KGhpLCBzdXJmYWNlIC0gMSwgdC55IC0gMSk7XG4gIH1cbiAgY29uc3QgYnVmZmVyZWQgPSBleHBhbmRSZWN0KHJlY3QsIDEpO1xuICBjb25zdCBkZXJpdmVkOiBWb3hlbFJlZ2lvbiA9IHtcbiAgICB4MDogTWF0aC5tYXgoLUhBTEYsIGJ1ZmZlcmVkLngwKSxcbiAgICB6MDogTWF0aC5tYXgoLUhBTEYsIGJ1ZmZlcmVkLnowKSxcbiAgICB4MTogTWF0aC5taW4oSEFMRiAtIDEsIGJ1ZmZlcmVkLngxKSxcbiAgICB6MTogTWF0aC5taW4oSEFMRiAtIDEsIGJ1ZmZlcmVkLnoxKSxcbiAgICB5MDogTWF0aC5tYXgoWV9NSU4sIGxvIC0gMSksXG4gICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgaGkgKyAxKSxcbiAgfTtcbiAgLy8gQW4gZXhwbGljaXQgZW52ZWxvcGUgcmVwbGFjZXMgdGhlIGRlcml2ZWQgb25lLiBDYWxsZXJzIHRoYXQgcGluIGFuIGV4YWN0XG4gIC8vIHdvcmsgZW52ZWxvcGUgKHBhdGggcHJlcGFyYXRpb24pIG11c3Qgbm90IHNpbGVudGx5IHdpZGVuIGl0IHdpdGggdGhlXG4gIC8vIGRlZmF1bHQgMSBtIGJ1ZmZlci5cbiAgY29uc3QgZW52ZWxvcGUgPSBub3JtYWxpemVFbnZlbG9wZShvcHRpb25zLmVudmVsb3BlID8/IFtkZXJpdmVkXSk7XG4gIGNvbnN0IHN1cmZhY2VFZGl0cyA9IHN1cmZhY2VNYXRlcmlhbCA9PT0gbnVsbCA/IDAgOiB0YXJnZXRzLmxlbmd0aDtcblxuICBjb25zdCBwbGFuOiBQcmVwYXJhdGlvblBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgcnVsZXM6IHByb3Bvc2FsLnJ1bGVzLFxuICAgIHRhcmdldHMsXG4gICAgY2xlYXJFbnRpdHlJZHMsXG4gICAgc3VyZmFjZU1hdGVyaWFsLFxuICAgIGVudmVsb3BlLFxuICAgIGV4cGVjdGVkOiB7XG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgICBvYnN0cnVjdGlvbnM6IGNsZWFyRW50aXR5SWRzLmxlbmd0aCxcbiAgICAgIHN1cmZhY2VFZGl0cyxcbiAgICAgIHRvdGFsRWRpdHM6IHN0YXRzLmN1dFZvbHVtZSArIHN0YXRzLmZpbGxWb2x1bWUgKyBzdXJmYWNlRWRpdHMsXG4gICAgfSxcbiAgfTtcbiAgcGxhbi5pZCA9IGBwcmVwOiR7cGxhbkRpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiwgdmFsaWRhdGlvbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGF1dGhvcml6YXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uTGltaXRzIHtcbiAgbWF4Q3V0Vm9sdW1lOiBudW1iZXI7XG4gIG1heEZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Vm94ZWxFZGl0czogbnVtYmVyO1xuICBtYXhFbnRpdHlSZW1vdmFsczogbnVtYmVyO1xuICBtYXhUYXJnZXRzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0xJTUlUUzogQXV0aG9yaXphdGlvbkxpbWl0cyA9IHtcbiAgbWF4Q3V0Vm9sdW1lOiAyNTYsXG4gIG1heEZpbGxWb2x1bWU6IDI1NixcbiAgbWF4Vm94ZWxFZGl0czogMTAyNCxcbiAgbWF4RW50aXR5UmVtb3ZhbHM6IDE2LFxuICBtYXhUYXJnZXRzOiA1MTIsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmtBdXRob3JpemF0aW9uIHtcbiAgaWQ6IHN0cmluZztcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBiYXNlUmV2aXNpb246IG51bWJlcjtcbiAgbGltaXRzOiBBdXRob3JpemF0aW9uTGltaXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25EZWNpc2lvbiB7XG4gIG9rOiBib29sZWFuO1xuICBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbiB8IG51bGw7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25Qb2xpY3kge1xuICAvKiogVGhlIG9ubHkgcmVnaW9ucyB0aGlzIGdvdmVybm9yIHBlcm1pdHMgZm9yIHRoZSBmaXJzdCBzbGljZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGxpbWl0cz86IFBhcnRpYWw8QXV0aG9yaXphdGlvbkxpbWl0cz47XG59XG5cbmZ1bmN0aW9uIHJlZ2lvbkNvbnRhaW5lZChyZWdpb246IFZveGVsUmVnaW9uLCBwb2xpY3k6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBib29sZWFuIHtcbiAgcmV0dXJuIHBvbGljeS5zb21lKChwKSA9PiByZWdpb24ueDAgPj0gcC54MCAmJiByZWdpb24ueDEgPD0gcC54MVxuICAgICYmIHJlZ2lvbi56MCA+PSBwLnowICYmIHJlZ2lvbi56MSA8PSBwLnoxXG4gICAgJiYgcmVnaW9uLnkwID49IHAueTAgJiYgcmVnaW9uLnkxIDw9IHAueTEpO1xufVxuXG4vKipcbiAqIExvY2FsIGdvdmVybm9yIHN0dWIuIEl0IGVuZm9yY2VzIGEgZml4ZWQgZW52ZWxvcGUgYW5kIGhhcmQgdm9sdW1lIGxpbWl0cyxcbiAqIGJpbmRzIGEgdG9rZW4gdG8gdGhlIGV4YWN0IHBsYW4gZGlnZXN0IGFuZCB3b3JsZCByZXZpc2lvbiwgYW5kIHJlZnVzZXMgdG9cbiAqIHByZXRlbmQgaXQgaXMgYW4gb24tY2hhaW4gYXV0aG9yaXR5LlxuICovXG5leHBvcnQgY2xhc3MgTG9jYWxBdXRob3JpemVyIHtcbiAgcmVhZG9ubHkgYXV0aG9yaXR5ID0gTE9DQUxfQVVUSE9SSVRZO1xuICByZWFkb25seSBlbmZvcmNlbWVudCA9IExPQ0FMX0VORk9SQ0VNRU5UO1xuICByZWFkb25seSBsaW1pdHM6IEF1dGhvcml6YXRpb25MaW1pdHM7XG5cbiAgY29uc3RydWN0b3IocmVhZG9ubHkgcG9saWN5OiBBdXRob3JpemF0aW9uUG9saWN5KSB7XG4gICAgdGhpcy5saW1pdHMgPSB7IC4uLkRFRkFVTFRfTElNSVRTLCAuLi4ocG9saWN5LmxpbWl0cyA/PyB7fSkgfTtcbiAgfVxuXG4gIGF1dGhvcml6ZSh3b3JsZDogV29ybGQsIHBsYW46IFByZXBhcmF0aW9uUGxhbik6IEF1dGhvcml6YXRpb25EZWNpc2lvbiB7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwbGFuLnJlY3QpO1xuXG4gICAgaWYgKHBsYW4udGFyZ2V0cy5sZW5ndGggIT09IHJlY3RDb2x1bW5zKHJlY3QpKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW4gaGFzICR7cGxhbi50YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBmb3IgJHtyZWN0Q29sdW1ucyhyZWN0KX0gY29sdW1uc2ApO1xuICAgIH1cbiAgICBpZiAocGxhbi50YXJnZXRzLmxlbmd0aCA+IHRoaXMubGltaXRzLm1heFRhcmdldHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLnRhcmdldHMubGVuZ3RofSB0YXJnZXRzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heFRhcmdldHN9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLmN1dFZvbHVtZSA+IHRoaXMubGltaXRzLm1heEN1dFZvbHVtZSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBjdXQgJHtwbGFuLmV4cGVjdGVkLmN1dFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heEN1dFZvbHVtZX1gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQuZmlsbFZvbHVtZSA+IHRoaXMubGltaXRzLm1heEZpbGxWb2x1bWUpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZmlsbCAke3BsYW4uZXhwZWN0ZWQuZmlsbFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heEZpbGxWb2x1bWV9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLnRvdGFsRWRpdHMgPiB0aGlzLmxpbWl0cy5tYXhWb3hlbEVkaXRzKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW5uZWQgZWRpdHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4Vm94ZWxFZGl0c31gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aH0gcmVtb3ZhbHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHN9YCk7XG4gICAgfVxuICAgIGlmIChuZXcgU2V0KHBsYW4uY2xlYXJFbnRpdHlJZHMpLnNpemUgIT09IHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoKSB7XG4gICAgICByZWFzb25zLnB1c2goJ2R1cGxpY2F0ZSBlbnRpdHkgcmVtb3ZhbCBpZHMnKTtcbiAgICB9XG5cbiAgICBpZiAocGxhbi5lbnZlbG9wZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gd29yayBlbnZlbG9wZScpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHJlZ2lvbiBvZiBwbGFuLmVudmVsb3BlKSB7XG4gICAgICBpZiAoIXJlZ2lvbkNvbnRhaW5lZChyZWdpb24sIHRoaXMucG9saWN5LmVudmVsb3BlKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYGVudmVsb3BlICR7cmVnaW9uLngwfSwke3JlZ2lvbi56MH0sJHtyZWdpb24ueTB9Li4ke3JlZ2lvbi54MX0sJHtyZWdpb24uejF9LCR7cmVnaW9uLnkxfSBpcyBvdXRzaWRlIHRoZSBsb2NhbCBwb2xpY3lgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykge1xuICAgICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHQueCwgdC55LCB0LnopXG4gICAgICAgIHx8ICh0LnkgPiBZX01JTiAmJiAhZW52ZWxvcGVDb250YWlucyhwbGFuLmVudmVsb3BlLCB0LngsIHQueSAtIDEsIHQueikpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgdGFyZ2V0ICR7dC54fSwke3Quen0sJHt0Lnl9IGlzIG5vdCBjb3ZlcmVkIGJ5IHRoZSB3b3JrIGVudmVsb3BlYCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gRXZlcnkgb2JzdHJ1Y3Rpb24gY3VycmVudGx5IG9uIHRoZSBmb290cHJpbnQgbXVzdCBiZSBpbiB0aGUgcGxhbiwgYW5kXG4gICAgLy8gdGhlIHBsYW4gbWF5IG5vdCByZW1vdmUgYW55dGhpbmcgdGhhdCBpcyBub3QgYW4gb2JzdHJ1Y3Rpb24gdGhlcmUuXG4gICAgY29uc3QgY3VycmVudCA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KS5tYXAoKG8pID0+IG8uZW50aXR5SWQpLnNvcnQoKTtcbiAgICBjb25zdCBwbGFubmVkID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgICBpZiAoY3VycmVudC5sZW5ndGggIT09IHBsYW5uZWQubGVuZ3RoIHx8IGN1cnJlbnQuc29tZSgoaWQsIGkpID0+IGlkICE9PSBwbGFubmVkW2ldKSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFuIHJlbW92YWxzIFske3BsYW5uZWQuam9pbignLCcpfV0gZG8gbm90IG1hdGNoIGZvb3RwcmludCBvYnN0cnVjdGlvbnMgWyR7Y3VycmVudC5qb2luKCcsJyl9XWApO1xuICAgIH1cblxuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiB7IG9rOiBmYWxzZSwgYXV0aG9yaXphdGlvbjogbnVsbCwgcmVhc29ucyB9O1xuXG4gICAgY29uc3QgdG9rZW46IFdvcmtBdXRob3JpemF0aW9uID0ge1xuICAgICAgaWQ6IGBsb2NhbC1zdHViOiR7cGxhbkRpZ2VzdChwbGFuKX1gLFxuICAgICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgICBwbGFuRGlnZXN0OiBwbGFuRGlnZXN0KHBsYW4pLFxuICAgICAgZW52ZWxvcGU6IG5vcm1hbGl6ZUVudmVsb3BlKHBsYW4uZW52ZWxvcGUpLFxuICAgICAgYmFzZVJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICAgIGxpbWl0czogeyAuLi50aGlzLmxpbWl0cyB9LFxuICAgIH07XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIGF1dGhvcml6YXRpb246IHRva2VuLCByZWFzb25zOiBbXSB9O1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gZXhlY3V0aW9uIC0tLS0tLS0tLS1cbmludGVyZmFjZSBQZW5kaW5nRWRpdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGJlZm9yZTogTWF0SWQ7XG4gIGFmdGVyOiBNYXRJZDtcbiAgLyoqIFRydWUgZm9yIGEgbWF0ZXJpYWwtb25seSB0b3Atc3VyZmFjZSBjaGFuZ2UuICovXG4gIHN1cmZhY2U/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBjaHVuazogc3RyaW5nO1xuICBjaGFuZ2VkOiBudW1iZXI7XG4gIGFkZGVkOiBudW1iZXI7XG4gIHJlbW92ZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDbGVhcmVkRW50aXR5IHtcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIGFtb3VudDogbnVtYmVyO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uTGVkZ2VyIHtcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBhdXRob3JpemF0aW9uSWQ6IHN0cmluZztcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG5ldFNwb2lsOiBudW1iZXI7XG4gIGJvcnJvd2VkRmlsbDogbnVtYmVyO1xuICBjdXRCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBmaWxsQnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgdm94ZWxFZGl0czogbnVtYmVyO1xuICBzdXJmYWNlRWRpdHM6IG51bWJlcjtcbiAgZW50aXRpZXNDbGVhcmVkOiBDbGVhcmVkRW50aXR5W107XG4gIHJlc291cmNlc0dhaW5lZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgaW52ZW50b3J5QmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBpbnZlbnRvcnlBZnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgY2h1bmtEZWx0YXM6IENodW5rRGVsdGFbXTtcbiAgcmV2aXNpb25CZWZvcmU6IG51bWJlcjtcbiAgcmV2aXNpb25BZnRlcjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBQcmVwYXJhdGlvblBsYW47XG4gIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uO1xuICBsZWRnZXI6IFByZXBhcmF0aW9uTGVkZ2VyO1xufVxuXG5leHBvcnQgdHlwZSBQcmVwYXJhdGlvbk91dGNvbWUgPSBQcmVwYXJhdGlvblN1Y2Nlc3MgfCBQcmVwYXJhdGlvbkZhaWx1cmU7XG5cbmNvbnN0IE1BVEVSSUFMX05BTUVTOiBSZWNvcmQ8bnVtYmVyLCBzdHJpbmc+ID0ge1xuICBbTUFULkdSQVNTXTogJ2dyYXNzJyxcbiAgW01BVC5TT0lMXTogJ3NvaWwnLFxuICBbTUFULlNBTkRdOiAnc2FuZCcsXG4gIFtNQVQuR1JBVkVMXTogJ2dyYXZlbCcsXG4gIFtNQVQuU1RPTkVdOiAnc3RvbmUnLFxuICBbTUFULk9SRV06ICdvcmUnLFxuICBbTUFULldBVEVSXTogJ3dhdGVyJyxcbiAgW01BVC5CRURST0NLXTogJ2JlZHJvY2snLFxuICBbTUFULk1PU1NdOiAnbW9zcycsXG59O1xuXG5mdW5jdGlvbiBtYXRlcmlhbE5hbWUobTogTWF0SWQpOiBzdHJpbmcge1xuICByZXR1cm4gTUFURVJJQUxfTkFNRVNbbV0gPz8gYG1hdF8ke219YDtcbn1cblxuZnVuY3Rpb24gZmlsbE1hdGVyaWFsKHk6IG51bWJlciwgdGFyZ2V0OiBudW1iZXIpOiBNYXRJZCB7XG4gIHJldHVybiB5ID09PSB0YXJnZXQgLSAxID8gTUFULkdSQVNTIDogTUFULlNPSUw7XG59XG5cbmZ1bmN0aW9uIGZhaWwoc3RhZ2U6IFByZXBhcmF0aW9uRmFpbHVyZVsnc3RhZ2UnXSwgY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IFByZXBhcmF0aW9uRmFpbHVyZSB7XG4gIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhZ2UsIGNvZGUsIHJlYXNvbnMgfTtcbn1cblxuLyoqXG4gKiBBcHBseSBhbiBhdXRob3JpemVkIHBsYW4uIE5vIHZveGVsIGlzIHdyaXR0ZW4gdW50aWwgZXZlcnkgZWRpdCBhbmQgcmVtb3ZhbFxuICogaGFzIGJlZW4gY2hlY2tlZCBhZ2FpbnN0IHRoZSB0b2tlbiwgdGhlIHBsYW4gZW52ZWxvcGUgYW5kIHRoZSBoYXJkIGxpbWl0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4ZWN1dGVQcmVwYXJhdGlvbihcbiAgd29ybGQ6IFdvcmxkLCBwbGFuOiBQcmVwYXJhdGlvblBsYW4sIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uLFxuKTogUHJlcGFyYXRpb25PdXRjb21lIHtcbiAgaWYgKGF1dGhvcml6YXRpb24uYXV0aG9yaXR5ICE9PSBMT0NBTF9BVVRIT1JJVFlcbiAgICB8fCBhdXRob3JpemF0aW9uLmVuZm9yY2VtZW50ICE9PSBMT0NBTF9FTkZPUkNFTUVOVCkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3Vuc3VwcG9ydGVkX2F1dGhvcml0eScsIFtcbiAgICAgIGBhdXRob3JpdHkgJHthdXRob3JpemF0aW9uLmF1dGhvcml0eX0vJHthdXRob3JpemF0aW9uLmVuZm9yY2VtZW50fSBpcyBub3QgdGhlIGxvY2FsIHN0dWJgLFxuICAgIF0pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QgIT09IHBsYW5EaWdlc3QocGxhbikpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdkaWdlc3RfbWlzbWF0Y2gnLCBbJ2F1dGhvcml6YXRpb24gZG9lcyBub3QgbWF0Y2ggdGhpcyBwbGFuJ10pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbiAhPT0gd29ybGQucmV2aXNpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdzdGFsZV9hdXRob3JpemF0aW9uJywgW1xuICAgICAgYGF1dGhvcml6YXRpb24gd2FzIGlzc3VlZCBhdCByZXZpc2lvbiAke2F1dGhvcml6YXRpb24uYmFzZVJldmlzaW9ufSwgd29ybGQgaXMgYXQgJHt3b3JsZC5yZXZpc2lvbn1gLFxuICAgIF0pO1xuICB9XG4gIGlmIChwbGFuLmVudmVsb3BlLnNvbWUoKHIpID0+ICFyZWdpb25Db250YWluZWQociwgYXV0aG9yaXphdGlvbi5lbnZlbG9wZSkpKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZW52ZWxvcGVfbWlzbWF0Y2gnLCBbJ3BsYW4gZW52ZWxvcGUgaXMgd2lkZXIgdGhhbiB0aGUgYXV0aG9yaXphdGlvbiddKTtcbiAgfVxuXG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHBsYW4ucmVjdCk7XG4gIGNvbnN0IGVkaXRzOiBQZW5kaW5nRWRpdFtdID0gW107XG4gIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgaWYgKHQueSA8IHN1cmZhY2UpIHtcbiAgICAgIGZvciAobGV0IHkgPSB0Lnk7IHkgPCBzdXJmYWNlOyB5KyspIHtcbiAgICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgeSwgdC56KTtcbiAgICAgICAgaWYgKGlzU29saWQoYmVmb3JlKSkgZWRpdHMucHVzaCh7IHg6IHQueCwgeSwgejogdC56LCBiZWZvcmUsIGFmdGVyOiBNQVQuQUlSIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodC55ID4gc3VyZmFjZSkge1xuICAgICAgZm9yIChsZXQgeSA9IHN1cmZhY2U7IHkgPCB0Lnk7IHkrKykge1xuICAgICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB5LCB0LnopO1xuICAgICAgICBpZiAoIWlzU29saWQoYmVmb3JlKSkge1xuICAgICAgICAgIGNvbnN0IGFmdGVyID0gcGxhbi5zdXJmYWNlTWF0ZXJpYWwgIT09IG51bGwgJiYgeSA9PT0gdC55IC0gMVxuICAgICAgICAgICAgPyBwbGFuLnN1cmZhY2VNYXRlcmlhbFxuICAgICAgICAgICAgOiBmaWxsTWF0ZXJpYWwoeSwgdC55KTtcbiAgICAgICAgICBlZGl0cy5wdXNoKHsgeDogdC54LCB5LCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXIgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gTWF0ZXJpYWwtb25seSBzdXJmYWNlIGNoYW5nZSBmb3IgY3V0IG9yIGFscmVhZHktbGV2ZWwgY29sdW1ucy4gRmlsbFxuICAgIC8vIGNvbHVtbnMgYWxyZWFkeSByZWNlaXZlIHRoZSBzdXJmYWNlIG1hdGVyaWFsIGluIHRoZSBmaWxsIGxvb3AgYWJvdmUuXG4gICAgaWYgKHBsYW4uc3VyZmFjZU1hdGVyaWFsICE9PSBudWxsKSB7XG4gICAgICBjb25zdCB0b3BZID0gdC55IC0gMTtcbiAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHRvcFksIHQueik7XG4gICAgICBpZiAoaXNTb2xpZChiZWZvcmUpICYmIGJlZm9yZSAhPT0gcGxhbi5zdXJmYWNlTWF0ZXJpYWwpIHtcbiAgICAgICAgZWRpdHMucHVzaCh7XG4gICAgICAgICAgeDogdC54LCB5OiB0b3BZLCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXI6IHBsYW4uc3VyZmFjZU1hdGVyaWFsLCBzdXJmYWNlOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBDaGVjayBldmVyeSBlZGl0IGJlZm9yZSBtdXRhdGluZyBhbnl0aGluZy5cbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBlIG9mIGVkaXRzKSB7XG4gICAgaWYgKGUueCA8IHJlY3QueDAgfHwgZS54ID4gcmVjdC54MSB8fCBlLnogPCByZWN0LnowIHx8IGUueiA+IHJlY3QuejEpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZWRpdCAke2UueH0sJHtlLnl9LCR7ZS56fSBpcyBvdXRzaWRlIHRoZSBmb290cHJpbnRgKTtcbiAgICB9XG4gICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKGF1dGhvcml6YXRpb24uZW52ZWxvcGUsIGUueCwgZS55LCBlLnopKSB7XG4gICAgICByZWFzb25zLnB1c2goYGVkaXQgJHtlLnh9LCR7ZS55fSwke2Uuen0gaXMgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZWApO1xuICAgIH1cbiAgfVxuICBjb25zdCBjdXRWb2x1bWUgPSBlZGl0cy5maWx0ZXIoKGUpID0+IGUuYWZ0ZXIgPT09IE1BVC5BSVIgJiYgaXNTb2xpZChlLmJlZm9yZSkpLmxlbmd0aDtcbiAgY29uc3QgZmlsbFZvbHVtZSA9IGVkaXRzLmZpbHRlcigoZSkgPT4gZS5hZnRlciAhPT0gTUFULkFJUiAmJiAhaXNTb2xpZChlLmJlZm9yZSkpLmxlbmd0aDtcbiAgaWYgKGN1dFZvbHVtZSA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0ICR7Y3V0Vm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4Q3V0Vm9sdW1lfWApO1xuICB9XG4gIGlmIChmaWxsVm9sdW1lID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCAke2ZpbGxWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhGaWxsVm9sdW1lfWApO1xuICB9XG4gIGlmIChlZGl0cy5sZW5ndGggPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhWb3hlbEVkaXRzKSB7XG4gICAgcmVhc29ucy5wdXNoKGAke2VkaXRzLmxlbmd0aH0gZWRpdHMgZXhjZWVkIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4Vm94ZWxFZGl0c31gKTtcbiAgfVxuXG4gIGNvbnN0IGN1cnJlbnQgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCkubWFwKChvKSA9PiBvLmVudGl0eUlkKS5zb3J0KCk7XG4gIGNvbnN0IHBsYW5uZWQgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICBpZiAoY3VycmVudC5sZW5ndGggIT09IHBsYW5uZWQubGVuZ3RoIHx8IGN1cnJlbnQuc29tZSgoaWQsIGkpID0+IGlkICE9PSBwbGFubmVkW2ldKSkge1xuICAgIHJlYXNvbnMucHVzaCgnZm9vdHByaW50IG9ic3RydWN0aW9ucyBjaGFuZ2VkIGFmdGVyIGF1dGhvcml6YXRpb24nKTtcbiAgfVxuICBpZiAocGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGggPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFscykge1xuICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aH0gcmVtb3ZhbHMgZXhjZWVkIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHN9YCk7XG4gIH1cbiAgZm9yIChjb25zdCBpZCBvZiBwbGFuLmNsZWFyRW50aXR5SWRzKSB7XG4gICAgaWYgKCF3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSByZWFzb25zLnB1c2goYGVudGl0eSAke2lkfSBubyBsb25nZXIgZXhpc3RzYCk7XG4gIH1cbiAgaWYgKHdvcmxkLmxpZmUpIHtcbiAgICBsZXQgcmVjb3ZlcmVkID0gMDtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIHBsYW4uY2xlYXJFbnRpdHlJZHMpIHtcbiAgICAgIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoZW50aXR5Py5yZXNvdXJjZSAmJiBlbnRpdHkucmVtYWluaW5nID4gMCkgcmVjb3ZlcmVkICs9IGVudGl0eS5yZW1haW5pbmc7XG4gICAgfVxuICAgIC8vIENoZWNrIGJlZm9yZSBhbnkgdm94ZWwgb3IgZW50aXR5IGNoYW5nZXMsIHByZXNlcnZpbmcgbGVnYWN5IHVuYm91bmRlZFxuICAgIC8vIGNvbnN0cnVjdGlvbiBiZWhhdmlvciBhbmQgc2NoZW1hLTMgY2FycmllZC1jYXBhY2l0eSBjb25zZXJ2YXRpb24uXG4gICAgaWYgKE9iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgYW1vdW50KSA9PiBzdW0gKyBhbW91bnQsIDApICsgcmVjb3ZlcmVkID4gMTIwKSB7XG4gICAgICByZWFzb25zLnB1c2goJ3Jlc291cmNlcyByZWNvdmVyZWQgZHVyaW5nIHNpdGUgY2xlYXJpbmcgd291bGQgZXhjZWVkIGNhcnJpZWQgY2FwYWNpdHkgMTIwJyk7XG4gICAgfVxuICB9XG4gIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3VuYXV0aG9yaXplZF9lZGl0cycsIHJlYXNvbnMpO1xuXG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgcmV2aXNpb25CZWZvcmUgPSB3b3JsZC5yZXZpc2lvbjtcbiAgY29uc3QgY2h1bmtEZWx0YXMgPSBuZXcgTWFwPHN0cmluZywgQ2h1bmtEZWx0YT4oKTtcbiAgY29uc3QgY3V0QnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBjb25zdCBmaWxsQnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBsZXQgYXBwbGllZCA9IDA7XG4gIGxldCBzdXJmYWNlRWRpdHMgPSAwO1xuXG4gIGZvciAoY29uc3QgZSBvZiBlZGl0cykge1xuICAgIGlmICghc2V0Vm94ZWwod29ybGQsIGUueCwgZS55LCBlLnosIGUuYWZ0ZXIpKSBjb250aW51ZTtcbiAgICBhcHBsaWVkKys7XG4gICAgaWYgKGUuc3VyZmFjZSkgc3VyZmFjZUVkaXRzKys7XG4gICAgY29uc3Qga2V5ID0gY2h1bmtLZXkod29ybGRUb0NodW5rWChlLngpLCB3b3JsZFRvQ2h1bmtaKGUueikpO1xuICAgIGxldCBkZWx0YSA9IGNodW5rRGVsdGFzLmdldChrZXkpO1xuICAgIGlmICghZGVsdGEpIHtcbiAgICAgIGRlbHRhID0geyBjaHVuazoga2V5LCBjaGFuZ2VkOiAwLCBhZGRlZDogMCwgcmVtb3ZlZDogMCB9O1xuICAgICAgY2h1bmtEZWx0YXMuc2V0KGtleSwgZGVsdGEpO1xuICAgIH1cbiAgICBkZWx0YS5jaGFuZ2VkKys7XG4gICAgY29uc3Qgd2FzU29saWQgPSBpc1NvbGlkKGUuYmVmb3JlKTtcbiAgICBjb25zdCBpc05vd1NvbGlkID0gaXNTb2xpZChlLmFmdGVyKTtcbiAgICBpZiAoIXdhc1NvbGlkICYmIGlzTm93U29saWQpIGRlbHRhLmFkZGVkKys7XG4gICAgaWYgKHdhc1NvbGlkICYmICFpc05vd1NvbGlkKSBkZWx0YS5yZW1vdmVkKys7XG4gICAgY29uc3QgbmFtZSA9IG1hdGVyaWFsTmFtZShlLmJlZm9yZSk7XG4gICAgaWYgKHdhc1NvbGlkICYmICFpc05vd1NvbGlkKSBjdXRCeU1hdGVyaWFsW25hbWVdID0gKGN1dEJ5TWF0ZXJpYWxbbmFtZV0gPz8gMCkgKyAxO1xuICAgIGlmICghd2FzU29saWQgJiYgaXNOb3dTb2xpZCkgZmlsbEJ5TWF0ZXJpYWxbbWF0ZXJpYWxOYW1lKGUuYWZ0ZXIpXSA9IChmaWxsQnlNYXRlcmlhbFttYXRlcmlhbE5hbWUoZS5hZnRlcildID8/IDApICsgMTtcbiAgfVxuXG4gIGNvbnN0IGVudGl0aWVzQ2xlYXJlZDogQ2xlYXJlZEVudGl0eVtdID0gW107XG4gIGNvbnN0IHJlc291cmNlc0dhaW5lZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHt9O1xuICBmb3IgKGNvbnN0IGlkIG9mIFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCkpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoIWUpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGFtb3VudCA9IGUucmVzb3VyY2UgJiYgZS5yZW1haW5pbmcgPiAwID8gZS5yZW1haW5pbmcgOiAwO1xuICAgIGlmIChlLnJlc291cmNlICYmIGFtb3VudCA+IDApIHtcbiAgICAgIHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA9ICh3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gICAgICByZXNvdXJjZXNHYWluZWRbZS5yZXNvdXJjZV0gPSAocmVzb3VyY2VzR2FpbmVkW2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgIH1cbiAgICByZW1vdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgICBlbnRpdGllc0NsZWFyZWQucHVzaCh7XG4gICAgICBlbnRpdHlJZDogaWQsIGtpbmQ6IGUua2luZCwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCwgeDogZS54LCB5OiBlLnksIHo6IGUueixcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IGN1dCA9IGFwcGxpZWQgPiAwID8gT2JqZWN0LnZhbHVlcyhjdXRCeU1hdGVyaWFsKS5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSA6IDA7XG4gIGNvbnN0IGZpbGwgPSBhcHBsaWVkID4gMCA/IE9iamVjdC52YWx1ZXMoZmlsbEJ5TWF0ZXJpYWwpLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIDogMDtcbiAgY29uc3QgbGVkZ2VyOiBQcmVwYXJhdGlvbkxlZGdlciA9IHtcbiAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgYXV0aG9yaXphdGlvbklkOiBhdXRob3JpemF0aW9uLmlkLFxuICAgIHBsYW5EaWdlc3Q6IGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCxcbiAgICBzaXRlSWQ6IHBsYW4uc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwbGFuLmZsb29yWSxcbiAgICBjdXRWb2x1bWU6IGN1dCxcbiAgICBmaWxsVm9sdW1lOiBmaWxsLFxuICAgIG5ldFNwb2lsOiBjdXQgLSBmaWxsLFxuICAgIGJvcnJvd2VkRmlsbDogTWF0aC5tYXgoMCwgZmlsbCAtIGN1dCksXG4gICAgY3V0QnlNYXRlcmlhbCxcbiAgICBmaWxsQnlNYXRlcmlhbCxcbiAgICB2b3hlbEVkaXRzOiBhcHBsaWVkLFxuICAgIHN1cmZhY2VFZGl0cyxcbiAgICBlbnRpdGllc0NsZWFyZWQsXG4gICAgcmVzb3VyY2VzR2FpbmVkLFxuICAgIGludmVudG9yeUJlZm9yZSxcbiAgICBpbnZlbnRvcnlBZnRlcjogaW52ZW50b3J5U25hcHNob3Qod29ybGQpLFxuICAgIGNodW5rRGVsdGFzOiBbLi4uY2h1bmtEZWx0YXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuY2h1bmsubG9jYWxlQ29tcGFyZShiLmNodW5rKSksXG4gICAgcmV2aXNpb25CZWZvcmUsXG4gICAgcmV2aXNpb25BZnRlcjogd29ybGQucmV2aXNpb24sXG4gIH07XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCBhdXRob3JpemF0aW9uLCBsZWRnZXIgfTtcbn1cblxuLyoqXG4gKiBUaGUgc2hhcmVkIHBsYXllci9BSSBlbnRyeSBwb2ludC4gVGhlcmUgaXMgbm8gb3RoZXIgY29uc3RydWN0aW9uIHBhdGguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlU2l0ZShcbiAgd29ybGQ6IFdvcmxkLFxuICBhdXRob3JpemVyOiBMb2NhbEF1dGhvcml6ZXIsXG4gIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsXG4gIG9wdGlvbnM6IFByZXBhcmF0aW9uT3B0aW9ucyA9IHt9LFxuKTogUHJlcGFyYXRpb25PdXRjb21lIHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwsIG9wdGlvbnMpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBkZWNpc2lvbiA9IGF1dGhvcml6ZXIuYXV0aG9yaXplKHdvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2F1dGhvcml6ZScsICdub3RfYXV0aG9yaXplZCcsIGRlY2lzaW9uLnJlYXNvbnMpO1xuICB9XG4gIHJldHVybiBleGVjdXRlUHJlcGFyYXRpb24od29ybGQsIHBsYW5uZWQucGxhbiwgZGVjaXNpb24uYXV0aG9yaXphdGlvbik7XG59XG4iLCAiLy8gTTAwMiBzdGFnZSA0OiBhdXRob3JpdGF0aXZlIGhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlIHN0cnVjdHVyZXMuXG4vL1xuLy8gU3RydWN0dXJlcyBhcmUgc2ltdWxhdGlvbiByZWNvcmRzLCBub3QgcmVuZGVyZXItb25seSBtZXNoZXMuIEEgc3RydWN0dXJlIGlzXG4vLyBwbGFubmVkIGZyb20gdGhlIHByZXBhcmVkIHRlcnJhaW4sIGF1dGhvcml6ZWQgYWdhaW5zdCB0aGUgc2FtZSBsb2NhbCBwb2xpY3lcbi8vIGVudmVsb3BlIGFzIHRlcnJhaW4gcHJlcGFyYXRpb24sIHBhaWQgZm9yIGZyb20gaW52ZW50b3J5LCBhbmQgdGhlbiBzdG9yZWQgaW5cbi8vIFdvcmxkLnN0cnVjdHVyZXMuIFRoZSByZW5kZXJlciByZWFkcyB0aG9zZSByZWNvcmRzOyBpdCBuZXZlciBpbnZlbnRzIGFcbi8vIGJ1aWxkaW5nIHRoYXQgdGhlIHNpbXVsYXRpb24gZG9lcyBub3Qgb3duLlxuaW1wb3J0IHtcbiAgV29ybGQsIFJlc291cmNlVHlwZSwgTUFULCBzdXJmYWNlQXQsIGdldFZveGVsLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBub3JtYWxpemVSZWN0LCBleHBhbmRSZWN0LFxuICBlbnZlbG9wZUNvbnRhaW5zLCBvYnN0cnVjdGlvbnNJbixcbn0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7XG4gIEF1dGhvcml6YXRpb25Qb2xpY3ksIExPQ0FMX0FVVEhPUklUWSwgTE9DQUxfRU5GT1JDRU1FTlQsXG59IGZyb20gJy4vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHsgRkFSTV9SVUxFUyB9IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7IGludmVudG9yeVNuYXBzaG90IH0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVLaW5kID0gJ2hvdXNlJyB8ICdwYXRoJyB8ICd0ZXJyYWNlJztcbi8qKiBNMDAyIGRlc2lnbiAxIGlzIGltbXV0YWJsZSByZXBsYXkgY29udGVudDsgZGVzaWduIDIgaXMgdGhlIGZvdW5kZXIgY2FuZGlkYXRlLiAqL1xuZXhwb3J0IGNvbnN0IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gPSAyIGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgU3RydWN0dXJlRGVzaWduVmVyc2lvbiA9IHR5cGVvZiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuXG5leHBvcnQgdHlwZSBNb2R1bGVLaW5kID1cbiAgfCAnZmxvb3InXG4gIHwgJ3dhbGwnXG4gIHwgJ3Bvc3QnXG4gIHwgJ2xpbnRlbCdcbiAgfCAncm9vZidcbiAgfCAncGFyYXBldCdcbiAgfCAnd2luZG93J1xuICB8ICdkb29yJ1xuICB8ICd0aHJlc2hvbGQnXG4gIHwgJ3BhdGgnXG4gIHwgJ2N1cmInXG4gIHwgJ3NvaWxfYmVkJ1xuICB8ICdyZXRhaW5pbmdfd2FsbCdcbiAgfCAnY3JvcF9yb3cnO1xuXG5leHBvcnQgdHlwZSBNb2R1bGVUb25lID1cbiAgfCAnc3RvbmUnXG4gIHwgJ3N0b25lX2InXG4gIHwgJ29jaHJlJ1xuICB8ICd0aW1iZXInXG4gIHwgJ2FjY2VudCdcbiAgfCAnc29pbCdcbiAgfCAnY3JvcCdcbiAgfCAnZ3JhdmVsJztcblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVNb2R1bGUge1xuICBraW5kOiBNb2R1bGVLaW5kO1xuICAvKiogQ2VudHJlIGluIHdvcmxkIHgveiwgYm90dG9tIGluIHdvcmxkIHkuICovXG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHc6IG51bWJlcjtcbiAgaDogbnVtYmVyO1xuICBkOiBudW1iZXI7XG4gIHJvdD86IG51bWJlcjtcbiAgdG9uZT86IE1vZHVsZVRvbmU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIC8qKiBPcmlnaW46IGNlbnRyZSBvZiB0aGUgcHJlcGFyZWQgZm9vdHByaW50IGF0IGZsb29yIGhlaWdodC4gKi9cbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdO1xuICBjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBidWlsdFJldmlzaW9uOiBudW1iZXI7XG4gIC8qKiBBYnNlbnQgbWVhbnMgbGVnYWN5IE0wMDIgZGVzaWduIDE7IG5ldmVyIGluZmVyIGl0IGZyb20gdGhlIHJlbmRlcmVyLiAqL1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbiAgcHJvdmlzaW9uYWw6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFjZUJhbmQge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUHJvcG9zYWwge1xuICBzaXRlSWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIC8qKiBSZXF1aXJlZCBmb3IgaG91c2VzOiB2b3hlbCBjb2x1bW4gb2YgdGhlIGRvb3Igb24gdGhlIGVhc3Qgd2FsbC4gKi9cbiAgZG9vcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgLyoqIE9wdGlvbmFsIHBhdGggbWV0YWRhdGE7IHRoZSBwYXRoIGlzIGxhaWQgYWxvbmcgdGhlIHJlY3QgY2VudHJlbGluZS4gKi9cbiAgYXBwcm9hY2g/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHRlcnJhY2VzPzogbnVtYmVyO1xuICAvKiogRGVsaWJlcmF0ZSBjb250ZW50IHNlbGVjdGlvbiBjYXJyaWVkIGJ5IHNjaGVtYS0yIGNvbW1hbmRzLiAqL1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbn1cblxuLyoqXG4gKiBTaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciBzdHJ1Y3R1cmUgY29zdHMuIFRoZSBwbGFubmVycyBhbmQgdGhlIGJ1aWxkIFVJXG4gKiBib3RoIHJlYWQgdGhlc2U7IGEgYnVpbGRpbmcgY2Fubm90IGFkdmVydGlzZSBvbmUgcHJpY2UgYW5kIGNoYXJnZSBhbm90aGVyLlxuICovXG5leHBvcnQgY29uc3QgSE9VU0VfQ09TVDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHsgd29vZDogMTAsIHN0b25lOiAxOCB9O1xuZXhwb3J0IGNvbnN0IFRFUlJBQ0VfQ09TVDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHsgd29vZDogNiwgc3RvbmU6IDEyIH07XG5cbi8qKiBBIHBhdGggcGF5cyBvbmUgc3RvbmUgcGVyIG1ldHJlIG9mIGNvcnJpZG9yIHdpZHRoLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhdGhDb3N0KHdpZHRoOiBudW1iZXIpOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+IHtcbiAgcmV0dXJuIHsgc3RvbmU6IHdpZHRoIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VyZmFjZVNhbXBsZSB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUGxhbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgb3JpZ2luOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgcm90OiBudW1iZXI7XG4gIG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdO1xuICBjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgLyoqIEV4cGVjdGVkIHByZXBhcmVkIHN1cmZhY2UsIGNoZWNrZWQgYWdhaW4gYXQgZXhlY3V0aW9uIHRpbWUuICovXG4gIHN1cmZhY2U6IFN1cmZhY2VTYW1wbGVbXTtcbiAgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb247XG4gIHRlcnJhY2VzPzogVGVycmFjZUJhbmRbXTtcbn1cblxuLy8gLS0tLS0tLS0tLSBzdGFibGUgZGlnZXN0IC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGRpZ2VzdChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGEgPSAweDgxMWM5ZGM1O1xuICBsZXQgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaW5wdXQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gaW5wdXQuY2hhckNvZGVBdChpKTtcbiAgICBhID0gTWF0aC5pbXVsKGEgXiBjLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoYyArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICBiIF49IGIgPj4+IDEzO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cnVjdHVyZURpZ2VzdChwbGFuOiBTdHJ1Y3R1cmVQbGFuKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW1xuICAgICdtMDAyOnN0cnVjdHVyZS1wbGFuOnYxJyxcbiAgICBwbGFuLmtpbmQsXG4gICAgcGxhbi5zaXRlSWQsXG4gICAgYCR7cGxhbi5yZWN0LngwfSwke3BsYW4ucmVjdC56MH0sJHtwbGFuLnJlY3QueDF9LCR7cGxhbi5yZWN0LnoxfWAsXG4gICAgU3RyaW5nKHBsYW4uZmxvb3JZKSxcbiAgICBgJHtwbGFuLm9yaWdpbi54fSwke3BsYW4ub3JpZ2luLnl9LCR7cGxhbi5vcmlnaW4uen1gLFxuICAgIFN0cmluZyhwbGFuLnJvdCksXG4gICAgLi4uKHBsYW4uZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTiA/IFsnZGVzaWduOjInXSA6IFtdKSxcbiAgICBgbToke3BsYW4ubW9kdWxlcy5sZW5ndGh9YCxcbiAgXTtcbiAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgIGxpbmVzLnB1c2goYG06JHttLmtpbmR9LCR7bS54fSwke20ueX0sJHttLnp9LCR7bS53fSwke20uaH0sJHttLmR9LCR7bS5yb3QgPz8gMH0sJHttLnRvbmUgPz8gJyd9YCk7XG4gIH1cbiAgY29uc3QgY29zdEtleXMgPSBPYmplY3Qua2V5cyhwbGFuLmNvc3QpLnNvcnQoKTtcbiAgbGluZXMucHVzaChgY29zdDoke2Nvc3RLZXlzLmxlbmd0aH1gKTtcbiAgZm9yIChjb25zdCBrZXkgb2YgY29zdEtleXMpIGxpbmVzLnB1c2goYGNvc3Q6JHtrZXl9LCR7cGxhbi5jb3N0W2tleSBhcyBSZXNvdXJjZVR5cGVdID8/IDB9YCk7XG4gIGZvciAoY29uc3QgcyBvZiBwbGFuLnN1cmZhY2UpIGxpbmVzLnB1c2goYHM6JHtzLnh9LCR7cy56fSwke3MueX1gKTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGVycmFjZXMgPz8gW10pIGxpbmVzLnB1c2goYHQ6JHt0LnowfSwke3QuejF9LCR7dC55fWApO1xuICByZXR1cm4gZGlnZXN0KGxpbmVzLmpvaW4oJ1xcbicpKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwbGFubmluZyBoZWxwZXJzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgc3RhZ2U6ICdwbGFuJyB8ICdhdXRob3JpemUnIHwgJ2V4ZWN1dGUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVBsYW5TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFN0cnVjdHVyZVBsYW47XG59XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZVBsYW5SZXN1bHQgPSBTdHJ1Y3R1cmVQbGFuU3VjY2VzcyB8IFN0cnVjdHVyZUZhaWx1cmU7XG5cbmZ1bmN0aW9uIGZhaWwoc3RhZ2U6IFN0cnVjdHVyZUZhaWx1cmVbJ3N0YWdlJ10sIGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBTdHJ1Y3R1cmVGYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGFnZSwgY29kZSwgcmVhc29ucyB9O1xufVxuXG5mdW5jdGlvbiBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZDogV29ybGQsIHNhbXBsZXM6IHJlYWRvbmx5IFN1cmZhY2VTYW1wbGVbXSkge1xuICBjb25zdCBvdXQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IGV4cGVjdGVkOiBudW1iZXI7IGFjdHVhbDogbnVtYmVyIH0+ID0gW107XG4gIGZvciAoY29uc3QgcyBvZiBzYW1wbGVzKSB7XG4gICAgY29uc3QgYWN0dWFsID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKGFjdHVhbCAhPT0gcy55KSBvdXQucHVzaCh7IHg6IHMueCwgejogcy56LCBleHBlY3RlZDogcy55LCBhY3R1YWwgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gZm9vdHByaW50U3VyZmFjZSh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QsIHk6IG51bWJlcik6IFN1cmZhY2VTYW1wbGVbXSB7XG4gIGNvbnN0IG91dDogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgb3V0LnB1c2goeyB4LCB6LCB5IH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGZvb3RwcmludEVudmVsb3BlKHJlY3Q6IFJlY3QsIHkwOiBudW1iZXIsIHkxOiBudW1iZXIsIG1hcmdpbiA9IDEpOiBWb3hlbFJlZ2lvbltdIHtcbiAgY29uc3QgciA9IGV4cGFuZFJlY3QocmVjdCwgbWFyZ2luKTtcbiAgcmV0dXJuIFt7IC4uLnIsIHkwLCB5MSB9XTtcbn1cblxuZnVuY3Rpb24gbW9kdWxlQm91bmRzKG06IFN0cnVjdHVyZU1vZHVsZSk6IHsgeDA6IG51bWJlcjsgeDE6IG51bWJlcjsgeTA6IG51bWJlcjsgeTE6IG51bWJlcjsgejA6IG51bWJlcjsgejE6IG51bWJlciB9IHtcbiAgY29uc3QgciA9IE1hdGguaHlwb3QobS53LCBtLmQpIC8gMjtcbiAgY29uc3QgaGFsZlcgPSAobS5yb3QgPz8gMCkgPT09IDAgPyBtLncgLyAyIDogcjtcbiAgY29uc3QgaGFsZkQgPSAobS5yb3QgPz8gMCkgPT09IDAgPyBtLmQgLyAyIDogcjtcbiAgcmV0dXJuIHtcbiAgICB4MDogbS54IC0gaGFsZlcsIHgxOiBtLnggKyBoYWxmVyxcbiAgICB5MDogbS55LCB5MTogbS55ICsgbS5oLFxuICAgIHowOiBtLnogLSBoYWxmRCwgejE6IG0ueiArIGhhbGZELFxuICB9O1xufVxuXG5mdW5jdGlvbiBtb2R1bGVJbnNpZGVFbnZlbG9wZShtOiBTdHJ1Y3R1cmVNb2R1bGUsIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogYm9vbGVhbiB7XG4gIGNvbnN0IGIgPSBtb2R1bGVCb3VuZHMobSk7XG4gIHJldHVybiBlbnZlbG9wZS5zb21lKChlKSA9PiBiLngwID49IGUueDAgLSAxZS02ICYmIGIueDEgPD0gZS54MSArIDEgKyAxZS02XG4gICAgJiYgYi55MCA+PSBlLnkwIC0gMWUtNiAmJiBiLnkxIDw9IGUueTEgKyAxICsgMWUtNlxuICAgICYmIGIuejAgPj0gZS56MCAtIDFlLTYgJiYgYi56MSA8PSBlLnoxICsgMSArIDFlLTYpO1xufVxuXG5mdW5jdGlvbiBjb3N0VG90YWwoY29zdDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+Pik6IG51bWJlciB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKGNvc3QpLnJlZHVjZSgoYSwgYikgPT4gYSArIChiID8/IDApLCAwKTtcbn1cblxuZnVuY3Rpb24gbWVkaWFuKHZhbHVlczogbnVtYmVyW10pOiBudW1iZXIge1xuICBjb25zdCBzb3J0ZWQgPSBbLi4udmFsdWVzXS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG4gIHJldHVybiBzb3J0ZWRbTWF0aC5mbG9vcihzb3J0ZWQubGVuZ3RoIC8gMildO1xufVxuXG4vLyAtLS0tLS0tLS0tIGhvdXNlIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5Ib3VzZSh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3Qgd2lkdGggPSByZWN0LngxIC0gcmVjdC54MCArIDE7XG4gIGNvbnN0IGRlcHRoID0gcmVjdC56MSAtIHJlY3QuejAgKyAxO1xuICBpZiAod2lkdGggIT09IDggfHwgZGVwdGggIT09IDYpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYGhvdXNlIG5lZWRzIDggeCA2IG0sIGdvdCAke3dpZHRofSB4ICR7ZGVwdGh9IG1gXSk7XG4gIH1cbiAgaWYgKCFwcm9wb3NhbC5kb29yKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnbWlzc2luZ19kb29yJywgWydob3VzZSBwbGFuIG5lZWRzIGEgZG9vciBjb2x1bW4nXSk7XG4gIH1cbiAgaWYgKHByb3Bvc2FsLmRvb3IueiA8IHJlY3QuejAgfHwgcHJvcG9zYWwuZG9vci56ID4gcmVjdC56MSkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Rvb3Jfb3V0c2lkZScsIFtgZG9vciB6ICR7cHJvcG9zYWwuZG9vci56fSBpcyBvdXRzaWRlICR7cmVjdC56MH0uLiR7cmVjdC56MX1gXSk7XG4gIH1cblxuICBjb25zdCBzdXJmYWNlID0gZm9vdHByaW50U3VyZmFjZSh3b3JsZCwgcmVjdCwgcHJvcG9zYWwuZmxvb3JZKTtcbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBzdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfbm90X3ByZXBhcmVkJywgbWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfb2JzdHJ1Y3RlZCcsIG9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpKTtcbiAgfVxuXG4gIGNvbnN0IGZsb29yWSA9IHByb3Bvc2FsLmZsb29yWTtcbiAgY29uc3QgeDAgPSByZWN0LngwLCB4MSA9IHJlY3QueDEgKyAxO1xuICBjb25zdCB6MCA9IHJlY3QuejAsIHoxID0gcmVjdC56MSArIDE7XG4gIGNvbnN0IGN4ID0gKHgwICsgeDEpIC8gMjtcbiAgY29uc3QgY3ogPSAoejAgKyB6MSkgLyAyO1xuICBjb25zdCBkb29yWiA9IHByb3Bvc2FsLmRvb3IueiArIDAuNTtcbiAgY29uc3QgZG9vckhhbGYgPSAwLjY7XG4gIGNvbnN0IHdhbGxIID0gMy4wO1xuICBjb25zdCB3YWxsVCA9IDAuNTtcbiAgY29uc3QgZG9vckggPSAyLjI7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG5cbiAgLy8gRmxvb3Igc2xhYiBhbmQgcm9vZiBwbGF0ZS5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2Zsb29yJywgeDogY3gsIHk6IGZsb29yWSwgejogY3osIHc6IDguMCwgaDogMC4zLCBkOiA2LjAsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3Jvb2YnLCB4OiBjeCwgeTogZmxvb3JZICsgd2FsbEgsIHo6IGN6LCB3OiA4LjQsIGg6IDAuMywgZDogNi40LCB0b25lOiAnc3RvbmUnIH0pO1xuXG4gIC8vIE5vcnRoIGFuZCBzb3V0aCB3YWxscy5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiBjeCwgeTogZmxvb3JZLCB6OiB6MCArIHdhbGxUIC8gMiwgdzogOC4wLCBoOiB3YWxsSCwgZDogd2FsbFQsIHRvbmU6ICdzdG9uZScgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICd3YWxsJywgeDogY3gsIHk6IGZsb29yWSwgejogejEgLSB3YWxsVCAvIDIsIHc6IDguMCwgaDogd2FsbEgsIGQ6IHdhbGxULCB0b25lOiAnc3RvbmUnIH0pO1xuXG4gIC8vIFdlc3Qgd2FsbC5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiB4MCArIHdhbGxUIC8gMiwgeTogZmxvb3JZLCB6OiBjeiwgdzogd2FsbFQsIGg6IHdhbGxILCBkOiA2LjAsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gRWFzdCB3YWxsIHdpdGggYSByZWFsIGRvb3J3YXkgZ2FwLlxuICBjb25zdCBlYXN0WCA9IHgxIC0gd2FsbFQgLyAyO1xuICBjb25zdCBnYXAwID0gZG9vclogLSBkb29ySGFsZjtcbiAgY29uc3QgZ2FwMSA9IGRvb3JaICsgZG9vckhhbGY7XG4gIGNvbnN0IGxlZnRMZW4gPSBnYXAwIC0gejA7XG4gIGNvbnN0IHJpZ2h0TGVuID0gejEgLSBnYXAxO1xuICBpZiAobGVmdExlbiA+IDAuMDUpIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dhbGwnLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiB6MCArIGxlZnRMZW4gLyAyLFxuICAgICAgdzogd2FsbFQsIGg6IHdhbGxILCBkOiBsZWZ0TGVuLCB0b25lOiAnc3RvbmUnLFxuICAgIH0pO1xuICB9XG4gIGlmIChyaWdodExlbiA+IDAuMDUpIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dhbGwnLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAxICsgcmlnaHRMZW4gLyAyLFxuICAgICAgdzogd2FsbFQsIGg6IHdhbGxILCBkOiByaWdodExlbiwgdG9uZTogJ3N0b25lJyxcbiAgICB9KTtcbiAgfVxuICBtb2R1bGVzLnB1c2goe1xuICAgIGtpbmQ6ICdsaW50ZWwnLCB4OiBlYXN0WCwgeTogZmxvb3JZICsgZG9vckgsIHo6IGRvb3JaLFxuICAgIHc6IHdhbGxULCBoOiB3YWxsSCAtIGRvb3JILCBkOiBkb29ySGFsZiAqIDIsIHRvbmU6ICdzdG9uZV9iJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2Rvb3InLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAwLFxuICAgIHc6IDAuMTgsIGg6IGRvb3JILCBkOiAwLjE2LCB0b25lOiAndGltYmVyJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2Rvb3InLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAxLFxuICAgIHc6IDAuMTgsIGg6IGRvb3JILCBkOiAwLjE2LCB0b25lOiAndGltYmVyJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ3RocmVzaG9sZCcsIHg6IHgxICsgMC4zNSwgeTogZmxvb3JZLCB6OiBkb29yWixcbiAgICB3OiAwLjksIGg6IDAuMTYsIGQ6IDEuMywgdG9uZTogJ29jaHJlJyxcbiAgfSk7XG5cbiAgLy8gVHdvIHdpbmRvd3Mgb24gdGhlIHNvdXRoIHdhbGwsIHNsaWdodGx5IHByb3VkIG9mIHRoZSBvdXRlciBmYWNlLlxuICBmb3IgKGNvbnN0IHd4IG9mIFtjeCAtIDIuMiwgY3ggKyAyLjJdKSB7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICd3aW5kb3cnLCB4OiB3eCwgeTogZmxvb3JZICsgMS40NSwgejogejEgLSAwLjAyLFxuICAgICAgdzogMS4wLCBoOiAxLjAsIGQ6IDAuMDgsIHRvbmU6ICdhY2NlbnQnLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gUGFyYXBldCBhcm91bmQgdGhlIGZsYXQgTm94ZWwgcm9vZi5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6IC0gMy4wNSwgdzogOC40LCBoOiAwLjQsIGQ6IDAuMywgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3ogKyAzLjA1LCB3OiA4LjQsIGg6IDAuNCwgZDogMC4zLCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3ggLSA0LjA1LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3osIHc6IDAuMywgaDogMC40LCBkOiA2LjQsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCArIDQuMDUsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiwgdzogMC4zLCBoOiAwLjQsIGQ6IDYuNCwgdG9uZTogJ3N0b25lX2InIH0pO1xuXG4gIGNvbnN0IHBsYW46IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIGtpbmQ6ICdob3VzZScsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclksXG4gICAgb3JpZ2luOiB7IHg6IGN4LCB5OiBmbG9vclksIHo6IGN6IH0sXG4gICAgcm90OiAwLFxuICAgIG1vZHVsZXMsXG4gICAgY29zdDogeyAuLi5IT1VTRV9DT1NUIH0sXG4gICAgZW52ZWxvcGU6IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIGZsb29yWSwgZmxvb3JZICsgNCwgMiksXG4gICAgc3VyZmFjZSxcbiAgfTtcbiAgcGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4gfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwYXRoIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5QYXRoKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGlmIChkZXB0aCAhPT0gMyB8fCB3aWR0aCA8IDMpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYHBhdGggbmVlZHMgYSAzIG0gd2lkZSBjb3JyaWRvciwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuXG4gIGNvbnN0IGNlbnRlclogPSByZWN0LnowICsgMTtcbiAgY29uc3Qgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGNvbnN0IGhlaWdodHM6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIGNlbnRlclopO1xuICAgIGhlaWdodHMucHVzaCh5KTtcbiAgICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHN1cmZhY2UucHVzaCh7IHgsIHosIHkgfSk7XG4gIH1cbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBzdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfbm90X3ByZXBhcmVkJywgbWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBmb3IgKGxldCBpID0gMTsgaSA8IGhlaWdodHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gaGVpZ2h0c1tpXSAtIGhlaWdodHNbaSAtIDFdO1xuICAgIGlmIChNYXRoLmFicyhzdGVwKSA+IDEpIHtcbiAgICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfc3RlcCcsIFtgc3RlcCAke3N0ZXB9IG0gYXQgeD0ke3JlY3QueDAgKyBpfWBdKTtcbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIHN1cmZhY2UpIHtcbiAgICBjb25zdCB0b3AgPSBnZXRWb3hlbCh3b3JsZCwgcy54LCBzLnkgLSAxLCBzLnopO1xuICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF93ZXQnLCBbYGNvbHVtbiAke3MueH0sJHtzLnp9IGlzIHdldGBdKTtcbiAgICB9XG4gICAgaWYgKHRvcCAhPT0gTUFULkdSQVZFTCkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9zdXJmYWNlJywgW1xuICAgICAgICBgY29sdW1uICR7cy54fSwke3Muen0gdG9wIGlzICR7dG9wfSwgZXhwZWN0ZWQgZ3JhdmVsYCxcbiAgICAgIF0pO1xuICAgIH1cbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfb2JzdHJ1Y3RlZCcsIG9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpKTtcbiAgfVxuXG4gIGNvbnN0IGN6ID0gY2VudGVyWiArIDAuNTtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgY2VudGVyWik7XG4gICAgY29uc3QgbXggPSB4ICsgMC41O1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXRoJywgeDogbXgsIHksIHo6IGN6LCB3OiAxLjAsIGg6IDAuMTIsIGQ6IDMuMCwgdG9uZTogJ2dyYXZlbCcgfSk7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2N1cmInLCB4OiBteCwgeSwgejogcmVjdC56MCArIDAuMDc1LCB3OiAxLjAsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IG14LCB5LCB6OiByZWN0LnoxICsgMSAtIDAuMDc1LCB3OiAxLjAsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgfVxuXG4gIGNvbnN0IG1pblkgPSBNYXRoLm1pbiguLi5oZWlnaHRzKTtcbiAgY29uc3QgbWF4WSA9IE1hdGgubWF4KC4uLmhlaWdodHMpO1xuICBjb25zdCBwbGFuOiBTdHJ1Y3R1cmVQbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBraW5kOiAncGF0aCcsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogKHJlY3QueDAgKyByZWN0LngxICsgMSkgLyAyLCB5OiBtaW5ZLCB6OiBjeiB9LFxuICAgIHJvdDogMCxcbiAgICBtb2R1bGVzLFxuICAgIGNvc3Q6IHBhdGhDb3N0KHdpZHRoKSxcbiAgICBlbnZlbG9wZTogZm9vdHByaW50RW52ZWxvcGUocmVjdCwgbWluWSAtIDEsIG1heFkgKyAyLCAwKSxcbiAgICBzdXJmYWNlLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHRlcnJhY2VzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5UZXJyYWNlcyh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3Qgd2lkdGggPSByZWN0LngxIC0gcmVjdC54MCArIDE7XG4gIGNvbnN0IGRlcHRoID0gcmVjdC56MSAtIHJlY3QuejAgKyAxO1xuICBjb25zdCBjb3VudCA9IHByb3Bvc2FsLnRlcnJhY2VzID8/IDM7XG4gIGlmICh3aWR0aCAhPT0gMTIgfHwgZGVwdGggIT09IDgpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYHRlcnJhY2VzIG5lZWQgMTIgeCA4IG0sIGdvdCAke3dpZHRofSB4ICR7ZGVwdGh9IG1gXSk7XG4gIH1cbiAgaWYgKGNvdW50IDwgMiB8fCBjb3VudCA+IDQpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX2NvdW50JywgW2Ake2NvdW50fSB0ZXJyYWNlcyBpcyBvdXRzaWRlIDIuLjRgXSk7XG4gIH1cblxuICAvLyBTcGxpdCBkZXB0aCBpbnRvIG5lYXItZXF1YWwgYmFuZHMsIGhpZ2ggc2lkZSBmaXJzdC5cbiAgY29uc3QgYmFzZSA9IE1hdGguZmxvb3IoZGVwdGggLyBjb3VudCk7XG4gIGNvbnN0IGV4dHJhID0gZGVwdGggJSBjb3VudDtcbiAgY29uc3QgYmFuZHM6IFRlcnJhY2VCYW5kW10gPSBbXTtcbiAgbGV0IHogPSByZWN0LnowO1xuICBjb25zdCBtZWRpYW5zOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjb25zdCBzaXplID0gYmFzZSArIChpIDwgZXh0cmEgPyAxIDogMCk7XG4gICAgY29uc3QgejAgPSB6LCB6MSA9IHogKyBzaXplIC0gMTtcbiAgICBjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG4gICAgZm9yIChsZXQgYnogPSB6MDsgYnogPD0gejE7IGJ6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgdmFsdWVzLnB1c2goc3VyZmFjZUF0KHdvcmxkLCB4LCBieikpO1xuICAgIH1cbiAgICBtZWRpYW5zLnB1c2gobWVkaWFuKHZhbHVlcykpO1xuICAgIGJhbmRzLnB1c2goeyB6MCwgejEsIHk6IDAgfSk7XG4gICAgeiA9IHoxICsgMTtcbiAgfVxuICAvLyBFYWNoIHRlcnJhY2Ugc2l0cyBleGFjdGx5IG9uZSBtZXRyZSBiZWxvdyB0aGUgcHJldmlvdXMgb25lLlxuICBmb3IgKGxldCBpID0gMDsgaSA8IGJhbmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgYmFuZHNbaV0ueSA9IGkgPT09IDAgPyBtZWRpYW5zWzBdIDogTWF0aC5taW4obWVkaWFuc1tpXSwgYmFuZHNbaSAtIDFdLnkgLSAxKTtcbiAgfVxuXG4gIGxldCBtYXhDdXQgPSAwLCBtYXhGaWxsID0gMCwgY3V0Vm9sdW1lID0gMCwgZmlsbFZvbHVtZSA9IDA7XG4gIGNvbnN0IHN1cmZhY2U6IFN1cmZhY2VTYW1wbGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGIgb2YgYmFuZHMpIHtcbiAgICBmb3IgKGxldCBieiA9IGIuejA7IGJ6IDw9IGIuejE7IGJ6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgICAgICBjb25zdCBzID0gc3VyZmFjZUF0KHdvcmxkLCB4LCBieik7XG4gICAgICAgIHN1cmZhY2UucHVzaCh7IHgsIHo6IGJ6LCB5OiBiLnkgfSk7XG4gICAgICAgIGNvbnN0IGQgPSBzIC0gYi55O1xuICAgICAgICBpZiAoZCA+IDApIHsgY3V0Vm9sdW1lICs9IGQ7IG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZCk7IH1cbiAgICAgICAgaWYgKGQgPCAwKSB7IGZpbGxWb2x1bWUgKz0gLWQ7IG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCAtZCk7IH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKG1heEN1dCA+IEZBUk1fUlVMRVMubWF4Q3V0IHx8IG1heEZpbGwgPiBGQVJNX1JVTEVTLm1heEZpbGxcbiAgICB8fCBjdXRWb2x1bWUgPiBGQVJNX1JVTEVTLm1heEN1dFZvbHVtZSB8fCBmaWxsVm9sdW1lID4gRkFSTV9SVUxFUy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndGVycmFjZV9lYXJ0aHdvcmsnLCBbXG4gICAgICBgY3V0ICR7Y3V0Vm9sdW1lfSBtXHUwMEIzIC8gZmlsbCAke2ZpbGxWb2x1bWV9IG1cdTAwQjMsIG1heCAke21heEN1dH0vJHttYXhGaWxsfSBtYCxcbiAgICBdKTtcbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG4gIGZvciAoY29uc3QgcyBvZiBzdXJmYWNlKSB7XG4gICAgY29uc3QgdG9wID0gZ2V0Vm94ZWwod29ybGQsIHMueCwgcy55IC0gMSwgcy56KTtcbiAgICBpZiAodG9wICE9PSBNQVQuU09JTCkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndGVycmFjZV9zdXJmYWNlJywgW1xuICAgICAgICBgY29sdW1uICR7cy54fSwke3Muen0gdG9wIGlzICR7dG9wfSwgZXhwZWN0ZWQgc29pbGAsXG4gICAgICBdKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBjeCA9IChyZWN0LngwICsgcmVjdC54MSArIDEpIC8gMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgZm9yIChjb25zdCBiIG9mIGJhbmRzKSB7XG4gICAgY29uc3QgYnogPSAoYi56MCArIGIuejEgKyAxKSAvIDI7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICdzb2lsX2JlZCcsIHg6IGN4LCB5OiBiLnksIHo6IGJ6LFxuICAgICAgdzogd2lkdGgsIGg6IDAuMTgsIGQ6IGIuejEgLSBiLnowICsgMSwgdG9uZTogJ3NvaWwnLFxuICAgIH0pO1xuICAgIC8vIFRocmVlIGNyb3Agcm93cyBwZXIgdGVycmFjZSwgaW5zZXQgZnJvbSB0aGUgcmV0YWluaW5nIHdhbGxzLlxuICAgIGNvbnN0IHJvd0RlcHRoID0gYi56MSAtIGIuejAgKyAxO1xuICAgIGZvciAobGV0IHIgPSAwOyByIDwgMzsgcisrKSB7XG4gICAgICBjb25zdCB0ID0gKHIgKyAxKSAvIDQ7XG4gICAgICBtb2R1bGVzLnB1c2goe1xuICAgICAgICBraW5kOiAnY3JvcF9yb3cnLCB4OiBjeCwgeTogYi55ICsgMC4xOCwgejogYi56MCArIHJvd0RlcHRoICogdCxcbiAgICAgICAgdzogd2lkdGggLSAxLjIsIGg6IDAuMjgsIGQ6IDAuMzYsIHRvbmU6ICdjcm9wJyxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGxldCBpID0gMTsgaSA8IGJhbmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgdXBwZXIgPSBiYW5kc1tpIC0gMV07XG4gICAgY29uc3QgbG93ZXIgPSBiYW5kc1tpXTtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3JldGFpbmluZ193YWxsJywgeDogY3gsIHk6IGxvd2VyLnksIHo6IHVwcGVyLnoxICsgMC41LFxuICAgICAgdzogd2lkdGgsIGg6IHVwcGVyLnkgLSBsb3dlci55LCBkOiAwLjQsIHRvbmU6ICdzdG9uZV9iJyxcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IG1pblkgPSBNYXRoLm1pbiguLi5iYW5kcy5tYXAoKGIpID0+IGIueSkpO1xuICBjb25zdCBtYXhZID0gTWF0aC5tYXgoLi4uYmFuZHMubWFwKChiKSA9PiBiLnkpKTtcbiAgY29uc3QgcGxhbjogU3RydWN0dXJlUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAga2luZDogJ3RlcnJhY2UnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgb3JpZ2luOiB7IHg6IGN4LCB5OiBtaW5ZLCB6OiAocmVjdC56MCArIHJlY3QuejEgKyAxKSAvIDIgfSxcbiAgICByb3Q6IDAsXG4gICAgbW9kdWxlcyxcbiAgICBjb3N0OiB7IC4uLlRFUlJBQ0VfQ09TVCB9LFxuICAgIGVudmVsb3BlOiBmb290cHJpbnRFbnZlbG9wZShyZWN0LCBtaW5ZIC0gMSwgbWF4WSArIDIsIDEpLFxuICAgIHN1cmZhY2UsXG4gICAgdGVycmFjZXM6IGJhbmRzLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhblN0cnVjdHVyZSh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBpZiAocHJvcG9zYWwuZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTikgcmV0dXJuIHBsYW5Gb3VuZGVyRGVzaWduKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmIChwcm9wb3NhbC5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd1bnN1cHBvcnRlZF9kZXNpZ24nLCBbYHVuc3VwcG9ydGVkIHN0cnVjdHVyZSBkZXNpZ24gJHtTdHJpbmcocHJvcG9zYWwuZGVzaWduVmVyc2lvbil9YF0pO1xuICB9XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAnaG91c2UnKSByZXR1cm4gcGxhbkhvdXNlKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAncGF0aCcpIHJldHVybiBwbGFuUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICByZXR1cm4gcGxhblRlcnJhY2VzKHdvcmxkLCBwcm9wb3NhbCk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVzaWduIDI6IGJvdW5kZWQgZm91bmRlciBjYW5kaWRhdGUgLS0tLS0tLS0tLVxuLy8gVGhpcyBkZWxpYmVyYXRlbHkgbGVhdmVzIGV2ZXJ5IGxlZ2FjeSBwbGFubmVyIGFib3ZlIHVudG91Y2hlZC4gVGhlIGV4dHJhIHdhbGxcbi8vIHByaW1pdGl2ZXMgcmVwcmVzZW50IHZvaWRzLCBub3QgZGVjb3JhdGl2ZSB3aW5kb3dzOyB0aGVpciBhc3NldC1sZXZlbCB2b2x1bWVcbi8vIGludGVycHJldGF0aW9uIHJlbWFpbnMgUmV2aWV3IFJlcXVpcmVkICh0aGUgZm91bmRlciA0XHUyMDEzOSB2b2x1bWUgdGFyZ2V0KS5cbmZ1bmN0aW9uIHBsYW5Gb3VuZGVyRGVzaWduKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAncGF0aCcpIHJldHVybiBwbGFuRm91bmRlclBhdGgod29ybGQsIHByb3Bvc2FsKTtcbiAgY29uc3QgcGxhbm5lZCA9IHByb3Bvc2FsLmtpbmQgPT09ICdob3VzZScgPyBwbGFuSG91c2Uod29ybGQsIHByb3Bvc2FsKSA6IHBsYW5UZXJyYWNlcyh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBpZiAocHJvcG9zYWwua2luZCA9PT0gJ3RlcnJhY2UnKSB7XG4gICAgLy8gQ3JvcCByb3dzIHN0YXkgY29tcGFjdCBhdXRob3JpdGF0aXZlIGFnZ3JlZ2F0ZXMuIFRoZWlyIGZhY2V0ZWQgZm9saWFnZSBpc1xuICAgIC8vIGRlcml2ZWQgcHJlc2VudGF0aW9uIG9ubHk7IG5vIHBsYW50LWxldmVsIGV4aXN0ZW5jZSBvciB5aWVsZCBpcyBpbnZlbnRlZC5cbiAgICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gICAgcGxhbm5lZC5wbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFubmVkLnBsYW4pfWA7XG4gICAgcmV0dXJuIHBsYW5uZWQ7XG4gIH1cbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHgwID0gcmVjdC54MCwgeDEgPSByZWN0LngxICsgMTtcbiAgY29uc3QgejAgPSByZWN0LnowLCB6MSA9IHJlY3QuejEgKyAxO1xuICBjb25zdCB5ID0gcHJvcG9zYWwuZmxvb3JZLCBjeCA9ICh4MCArIHgxKSAvIDIsIGN6ID0gKHowICsgejEpIC8gMjtcbiAgY29uc3QgdCA9IDAuNiwgaCA9IDMuMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgLy8gT25lIHN0cnVjdHVyYWwgc3RvbmUgZmFtaWx5OiBsaWdodGluZywgbm90IHBhaW50ZWQgZmFjZSB2YXJpYXRpb24sIHNoYWRlcyBpdC5cbiAgY29uc3Qgd2FsbCA9ICh4OiBudW1iZXIsIGJvdHRvbTogbnVtYmVyLCB6OiBudW1iZXIsIHc6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGQ6IG51bWJlciwga2luZDogU3RydWN0dXJlTW9kdWxlWydraW5kJ10gPSAnd2FsbCcpID0+IHtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kLCB4LCB5OiBib3R0b20sIHosIHcsIGg6IGhlaWdodCwgZCwgdG9uZTogJ3N0b25lJyB9KTtcbiAgfTtcbiAgd2FsbChjeCwgeSAtIDAuNCwgY3osIDgsIDAuNCwgNiwgJ2Zsb29yJyk7XG4gIHdhbGwoY3gsIHksIHowICsgdCAvIDIsIDgsIGgsIHQpO1xuICBjb25zdCBpbm5lclowID0gejAgKyB0LCBpbm5lcloxID0gejEgLSB0O1xuICB3YWxsKHgwICsgdCAvIDIsIHksIChpbm5lclowICsgaW5uZXJaMSkgLyAyLCB0LCBoLCBpbm5lcloxIC0gaW5uZXJaMCk7XG4gIGNvbnN0IGRvb3JaID0gKHByb3Bvc2FsLmRvb3I/LnogPz8gcmVjdC56MCkgKyAwLjU7XG4gIGNvbnN0IGRvb3IwID0gZG9vclogLSAwLjYsIGRvb3IxID0gZG9vclogKyAwLjY7XG4gIGNvbnN0IGVhc3RYID0geDEgLSB0IC8gMjtcbiAgd2FsbChlYXN0WCwgeSwgKGlubmVyWjAgKyBkb29yMCkgLyAyLCB0LCBoLCBkb29yMCAtIGlubmVyWjApO1xuICB3YWxsKGVhc3RYLCB5LCAoZG9vcjEgKyBpbm5lcloxKSAvIDIsIHQsIGgsIGlubmVyWjEgLSBkb29yMSk7XG4gIHdhbGwoZWFzdFgsIHkgKyAyLjIsIGRvb3JaLCB0LCAwLjQsIDEuMiwgJ2xpbnRlbCcpO1xuICB3YWxsKGVhc3RYLCB5ICsgMi42LCBkb29yWiwgdCwgMC42LCAxLjIpO1xuICBjb25zdCBzb3V0aFogPSB6MSAtIHQgLyAyO1xuICBmb3IgKGNvbnN0IFthLCBiXSBvZiBbW3gwICsgdCwgY3ggLSAyLjZdLCBbY3ggLSAxLjQsIGN4ICsgMS40XSwgW2N4ICsgMi42LCB4MSAtIHRdXSkge1xuICAgIHdhbGwoKGEgKyBiKSAvIDIsIHksIHNvdXRoWiwgYiAtIGEsIGgsIHQpO1xuICB9XG4gIGZvciAoY29uc3Qgd3ggb2YgW2N4IC0gMiwgY3ggKyAyXSkge1xuICAgIHdhbGwod3gsIHksIHNvdXRoWiwgMS4yLCAxLCB0KTtcbiAgICB3YWxsKHd4LCB5ICsgMi40LCBzb3V0aFosIDEuMiwgMC44LCB0LCAnbGludGVsJyk7XG4gIH1cbiAgd2FsbChjeCwgeSArIGgsIGN6LCA4LCAwLjQsIDYsICdyb29mJyk7XG4gIHdhbGwoY3gsIHkgKyBoICsgMC40LCB6MCArIDAuMTUsIDgsIDAuMywgMC4zLCAncGFyYXBldCcpO1xuICB3YWxsKGN4LCB5ICsgaCArIDAuNCwgejEgLSAwLjE1LCA4LCAwLjMsIDAuMywgJ3BhcmFwZXQnKTtcbiAgd2FsbChjeCAtIDMuODUsIHkgKyBoICsgMC40LCBjeiwgMC4zLCAwLjMsIDUuNCwgJ3BhcmFwZXQnKTtcbiAgd2FsbChjeCArIDMuODUsIHkgKyBoICsgMC40LCBjeiwgMC4zLCAwLjMsIDUuNCwgJ3BhcmFwZXQnKTtcbiAgcGxhbm5lZC5wbGFuLm1vZHVsZXMgPSBtb2R1bGVzO1xuICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gIHBsYW5uZWQucGxhbi5lbnZlbG9wZSA9IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIHkgLSAxLCB5ICsgNCwgMik7XG4gIHBsYW5uZWQucGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbm5lZC5wbGFuKX1gO1xuICByZXR1cm4gcGxhbm5lZDtcbn1cblxuZnVuY3Rpb24gcGxhbkZvdW5kZXJQYXRoKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBjb25zdCBoZWlnaHRzID0gcGxhbm5lZC5wbGFuLm1vZHVsZXMuZmlsdGVyKChtKSA9PiBtLmtpbmQgPT09ICdwYXRoJykubWFwKChtKSA9PiBtLnkpO1xuICBjb25zdCB6MCA9IHBsYW5uZWQucGxhbi5yZWN0LnowLCB6MSA9IHBsYW5uZWQucGxhbi5yZWN0LnoxICsgMTtcbiAgbGV0IHN0YXJ0ID0gMDtcbiAgZm9yIChsZXQgZW5kID0gMTsgZW5kIDw9IGhlaWdodHMubGVuZ3RoOyBlbmQrKykge1xuICAgIGlmIChlbmQgPCBoZWlnaHRzLmxlbmd0aCAmJiBoZWlnaHRzW2VuZF0gPT09IGhlaWdodHNbc3RhcnRdKSBjb250aW51ZTtcbiAgICBjb25zdCB4ID0gcGxhbm5lZC5wbGFuLnJlY3QueDAgKyBzdGFydCwgd2lkdGggPSBlbmQgLSBzdGFydDtcbiAgICBjb25zdCBjeCA9IHggKyB3aWR0aCAvIDIsIHkgPSBoZWlnaHRzW3N0YXJ0XTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGF0aCcsIHg6IGN4LCB5LCB6OiAoejAgKyB6MSkgLyAyLCB3OiB3aWR0aCwgaDogMC4xMiwgZDogMywgdG9uZTogJ2dyYXZlbCcgfSk7XG4gICAgZm9yIChjb25zdCB6IG9mIFt6MCArIDAuMDc1LCB6MSAtIDAuMDc1XSkge1xuICAgICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2N1cmInLCB4OiBjeCwgeSwgeiwgdzogd2lkdGgsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZScgfSk7XG4gICAgfVxuICAgIHN0YXJ0ID0gZW5kO1xuICB9XG4gIHBsYW5uZWQucGxhbi5tb2R1bGVzID0gbW9kdWxlcztcbiAgcGxhbm5lZC5wbGFuLmRlc2lnblZlcnNpb24gPSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuICBwbGFubmVkLnBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW5uZWQucGxhbil9YDtcbiAgcmV0dXJuIHBsYW5uZWQ7XG59XG5cblxuLy8gLS0tLS0tLS0tLSBhdXRob3JpemF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlTGltaXRzIHtcbiAgbWF4TW9kdWxlczogbnVtYmVyO1xuICBtYXhDb3N0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1NUUlVDVFVSRV9MSU1JVFM6IFN0cnVjdHVyZUxpbWl0cyA9IHtcbiAgbWF4TW9kdWxlczogNjQsXG4gIG1heENvc3Q6IDEyOCxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlQXV0aG9yaXphdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgYmFzZVJldmlzaW9uOiBudW1iZXI7XG4gIGxpbWl0czogU3RydWN0dXJlTGltaXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZURlY2lzaW9uIHtcbiAgb2s6IGJvb2xlYW47XG4gIGF1dGhvcml6YXRpb246IFN0cnVjdHVyZUF1dGhvcml6YXRpb24gfCBudWxsO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciB7XG4gIHJlYWRvbmx5IGF1dGhvcml0eSA9IExPQ0FMX0FVVEhPUklUWTtcbiAgcmVhZG9ubHkgZW5mb3JjZW1lbnQgPSBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcmVhZG9ubHkgbGltaXRzOiBTdHJ1Y3R1cmVMaW1pdHM7XG5cbiAgY29uc3RydWN0b3IocmVhZG9ubHkgcG9saWN5OiBBdXRob3JpemF0aW9uUG9saWN5LCBsaW1pdHM6IFBhcnRpYWw8U3RydWN0dXJlTGltaXRzPiA9IHt9KSB7XG4gICAgdGhpcy5saW1pdHMgPSB7IC4uLkRFRkFVTFRfU1RSVUNUVVJFX0xJTUlUUywgLi4ubGltaXRzIH07XG4gIH1cblxuICBhdXRob3JpemUod29ybGQ6IFdvcmxkLCBwbGFuOiBTdHJ1Y3R1cmVQbGFuKTogU3RydWN0dXJlRGVjaXNpb24ge1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKHBsYW4ubW9kdWxlcy5sZW5ndGggPT09IDApIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gbW9kdWxlcycpO1xuICAgIGlmIChwbGFuLm1vZHVsZXMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4TW9kdWxlcykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4ubW9kdWxlcy5sZW5ndGh9IG1vZHVsZXMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4TW9kdWxlc31gKTtcbiAgICB9XG4gICAgaWYgKGNvc3RUb3RhbChwbGFuLmNvc3QpID4gdGhpcy5saW1pdHMubWF4Q29zdCkge1xuICAgICAgcmVhc29ucy5wdXNoKGBjb3N0ICR7Y29zdFRvdGFsKHBsYW4uY29zdCl9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhDb3N0fWApO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhwbGFuLmNvc3QpKSB7XG4gICAgICBpZiAoIU51bWJlci5pc0ludGVnZXIoYW1vdW50KSB8fCAoYW1vdW50ID8/IDApIDwgMCkge1xuICAgICAgICByZWFzb25zLnB1c2goYGNvc3QgJHtyZXNvdXJjZX09JHthbW91bnR9IGlzIG5vdCBhIG5vbi1uZWdhdGl2ZSBpbnRlZ2VyYCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChwbGFuLmVudmVsb3BlLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyB3b3JrIGVudmVsb3BlJyk7XG4gICAgZm9yIChjb25zdCByZWdpb24gb2YgcGxhbi5lbnZlbG9wZSkge1xuICAgICAgaWYgKCF0aGlzLnBvbGljeS5lbnZlbG9wZS5zb21lKChwKSA9PiByZWdpb24ueDAgPj0gcC54MCAmJiByZWdpb24ueDEgPD0gcC54MVxuICAgICAgICAmJiByZWdpb24uejAgPj0gcC56MCAmJiByZWdpb24uejEgPD0gcC56MVxuICAgICAgICAmJiByZWdpb24ueTAgPj0gcC55MCAmJiByZWdpb24ueTEgPD0gcC55MSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBlbnZlbG9wZSAke3JlZ2lvbi54MH0sJHtyZWdpb24uejB9LCR7cmVnaW9uLnkwfS4uJHtyZWdpb24ueDF9LCR7cmVnaW9uLnoxfSwke3JlZ2lvbi55MX0gaXMgb3V0c2lkZSB0aGUgbG9jYWwgcG9saWN5YCk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgbSBvZiBwbGFuLm1vZHVsZXMpIHtcbiAgICAgIGlmICghbW9kdWxlSW5zaWRlRW52ZWxvcGUobSwgcGxhbi5lbnZlbG9wZSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBtb2R1bGUgJHttLmtpbmR9IGF0ICR7bS54fSwke20ueX0sJHttLnp9IGlzIG91dHNpZGUgdGhlIHBsYW4gZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHBsYW4uc3VyZmFjZS5sZW5ndGggPT09IDApIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gc3VyZmFjZSBzYW1wbGVzJyk7XG4gICAgZm9yIChjb25zdCBzIG9mIHBsYW4uc3VyZmFjZSkge1xuICAgICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHMueCwgcy55LCBzLnopKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgc3VyZmFjZSAke3MueH0sJHtzLnp9LCR7cy55fSBpcyBvdXRzaWRlIHRoZSBwbGFuIGVudmVsb3BlYCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiB7IG9rOiBmYWxzZSwgYXV0aG9yaXphdGlvbjogbnVsbCwgcmVhc29ucyB9O1xuXG4gICAgY29uc3QgdG9rZW46IFN0cnVjdHVyZUF1dGhvcml6YXRpb24gPSB7XG4gICAgICBpZDogYGxvY2FsLXN0dWI6c3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWAsXG4gICAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICAgIHBsYW5EaWdlc3Q6IHN0cnVjdHVyZURpZ2VzdChwbGFuKSxcbiAgICAgIGVudmVsb3BlOiBwbGFuLmVudmVsb3BlLm1hcCgoZSkgPT4gKHsgLi4uZSB9KSksXG4gICAgICBiYXNlUmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgICAgbGltaXRzOiB7IC4uLnRoaXMubGltaXRzIH0sXG4gICAgfTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgYXV0aG9yaXphdGlvbjogdG9rZW4sIHJlYXNvbnM6IFtdIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBleGVjdXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVMZWRnZXIge1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIGF1dGhvcml6YXRpb25JZDogc3RyaW5nO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIHN0cnVjdHVyZUlkOiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICBtb2R1bGVDb3VudDogbnVtYmVyO1xuICBjb3N0UGFpZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgaW52ZW50b3J5QmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBpbnZlbnRvcnlBZnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgcmV2aXNpb25CZWZvcmU6IG51bWJlcjtcbiAgcmV2aXNpb25BZnRlcjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogU3RydWN0dXJlUGxhbjtcbiAgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbjtcbiAgbGVkZ2VyOiBTdHJ1Y3R1cmVMZWRnZXI7XG59XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZU91dGNvbWUgPSBTdHJ1Y3R1cmVTdWNjZXNzIHwgU3RydWN0dXJlRmFpbHVyZTtcblxuZXhwb3J0IGZ1bmN0aW9uIGV4ZWN1dGVTdHJ1Y3R1cmUoXG4gIHdvcmxkOiBXb3JsZCwgcGxhbjogU3RydWN0dXJlUGxhbiwgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbixcbik6IFN0cnVjdHVyZU91dGNvbWUge1xuICBpZiAoYXV0aG9yaXphdGlvbi5hdXRob3JpdHkgIT09IExPQ0FMX0FVVEhPUklUWVxuICAgIHx8IGF1dGhvcml6YXRpb24uZW5mb3JjZW1lbnQgIT09IExPQ0FMX0VORk9SQ0VNRU5UKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5zdXBwb3J0ZWRfYXV0aG9yaXR5JywgW1xuICAgICAgYGF1dGhvcml0eSAke2F1dGhvcml6YXRpb24uYXV0aG9yaXR5fS8ke2F1dGhvcml6YXRpb24uZW5mb3JjZW1lbnR9IGlzIG5vdCB0aGUgbG9jYWwgc3R1YmAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCAhPT0gc3RydWN0dXJlRGlnZXN0KHBsYW4pKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZGlnZXN0X21pc21hdGNoJywgWydhdXRob3JpemF0aW9uIGRvZXMgbm90IG1hdGNoIHRoaXMgc3RydWN0dXJlIHBsYW4nXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24uYmFzZVJldmlzaW9uICE9PSB3b3JsZC5yZXZpc2lvbikge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3N0YWxlX2F1dGhvcml6YXRpb24nLCBbXG4gICAgICBgYXV0aG9yaXphdGlvbiB3YXMgaXNzdWVkIGF0IHJldmlzaW9uICR7YXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb259LCB3b3JsZCBpcyBhdCAke3dvcmxkLnJldmlzaW9ufWAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKHBsYW4uZW52ZWxvcGUuc29tZSgocikgPT4gIWF1dGhvcml6YXRpb24uZW52ZWxvcGUuc29tZSgoYSkgPT4gci54MCA+PSBhLngwXG4gICAgJiYgci54MSA8PSBhLngxICYmIHIuejAgPj0gYS56MCAmJiByLnoxIDw9IGEuejEgJiYgci55MCA+PSBhLnkwICYmIHIueTEgPD0gYS55MSkpKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZW52ZWxvcGVfbWlzbWF0Y2gnLCBbJ3BsYW4gZW52ZWxvcGUgaXMgd2lkZXIgdGhhbiB0aGUgYXV0aG9yaXphdGlvbiddKTtcbiAgfVxuXG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgbSBvZiBwbGFuLm1vZHVsZXMpIHtcbiAgICBpZiAoIW1vZHVsZUluc2lkZUVudmVsb3BlKG0sIGF1dGhvcml6YXRpb24uZW52ZWxvcGUpKSB7XG4gICAgICByZWFzb25zLnB1c2goYG1vZHVsZSAke20ua2luZH0gYXQgJHttLnh9LCR7bS55fSwke20uen0gaXMgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZWApO1xuICAgIH1cbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHBsYW4uc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goLi4ubWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcGxhbi5yZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmb290cHJpbnQgaGFzICR7b2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zYCk7XG4gIH1cbiAgaWYgKHdvcmxkLnN0cnVjdHVyZXMuaGFzKHBsYW4uaWQpKSB7XG4gICAgcmVhc29ucy5wdXNoKGBzdHJ1Y3R1cmUgJHtwbGFuLmlkfSBhbHJlYWR5IGV4aXN0c2ApO1xuICB9XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICBjb25zdCBoYXZlID0gd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwO1xuICAgIGlmIChoYXZlIDwgKGFtb3VudCA/PyAwKSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBuZWVkICR7YW1vdW50fSAke3Jlc291cmNlfSwgaGF2ZSAke2hhdmV9YCk7XG4gICAgfVxuICB9XG4gIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3VuYXV0aG9yaXplZF9zdHJ1Y3R1cmUnLCByZWFzb25zKTtcblxuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IHJldmlzaW9uQmVmb3JlID0gd29ybGQucmV2aXNpb247XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICBjb25zdCBsZWZ0ID0gKHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgLSAoYW1vdW50ID8/IDApO1xuICAgIGlmIChsZWZ0ID4gMCkgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA9IGxlZnQ7XG4gICAgZWxzZSBkZWxldGUgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXTtcbiAgfVxuXG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIGNvbnN0IHN0cnVjdHVyZTogU3RydWN0dXJlID0ge1xuICAgIGlkOiBwbGFuLmlkLFxuICAgIGtpbmQ6IHBsYW4ua2luZCxcbiAgICBzaXRlSWQ6IHBsYW4uc2l0ZUlkLFxuICAgIHg6IHBsYW4ub3JpZ2luLngsXG4gICAgeTogcGxhbi5vcmlnaW4ueSxcbiAgICB6OiBwbGFuLm9yaWdpbi56LFxuICAgIHJvdDogcGxhbi5yb3QsXG4gICAgbW9kdWxlczogcGxhbi5tb2R1bGVzLm1hcCgobSkgPT4gKHsgLi4ubSB9KSksXG4gICAgY29zdDogeyAuLi5wbGFuLmNvc3QgfSxcbiAgICBidWlsdFJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICAuLi4ocGxhbi5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OID8geyBkZXNpZ25WZXJzaW9uOiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OIH0gOiB7fSksXG4gICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gIH07XG4gIHdvcmxkLnN0cnVjdHVyZXMuc2V0KHN0cnVjdHVyZS5pZCwgc3RydWN0dXJlKTtcblxuICBjb25zdCBsZWRnZXI6IFN0cnVjdHVyZUxlZGdlciA9IHtcbiAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgYXV0aG9yaXphdGlvbklkOiBhdXRob3JpemF0aW9uLmlkLFxuICAgIHBsYW5EaWdlc3Q6IGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCxcbiAgICBzdHJ1Y3R1cmVJZDogc3RydWN0dXJlLmlkLFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAga2luZDogcGxhbi5raW5kLFxuICAgIG1vZHVsZUNvdW50OiBzdHJ1Y3R1cmUubW9kdWxlcy5sZW5ndGgsXG4gICAgY29zdFBhaWQ6IHsgLi4ucGxhbi5jb3N0IH0sXG4gICAgaW52ZW50b3J5QmVmb3JlLFxuICAgIGludmVudG9yeUFmdGVyOiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCksXG4gICAgcmV2aXNpb25CZWZvcmUsXG4gICAgcmV2aXNpb25BZnRlcjogd29ybGQucmV2aXNpb24sXG4gIH07XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCBhdXRob3JpemF0aW9uLCBsZWRnZXIgfTtcbn1cblxuLyoqXG4gKiBUaGUgc2hhcmVkIHBsYXllci9BSSBzdHJ1Y3R1cmUgZW50cnkgcG9pbnQuIFRlcnJhaW4gbXVzdCBhbHJlYWR5IGJlIHByZXBhcmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTdHJ1Y3R1cmUoXG4gIHdvcmxkOiBXb3JsZCxcbiAgYXV0aG9yaXplcjogTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLFxuICBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwsXG4pOiBTdHJ1Y3R1cmVPdXRjb21lIHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5TdHJ1Y3R1cmUod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgY29uc3QgZGVjaXNpb24gPSBhdXRob3JpemVyLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgaWYgKCFkZWNpc2lvbi5vayB8fCAhZGVjaXNpb24uYXV0aG9yaXphdGlvbikge1xuICAgIHJldHVybiBmYWlsKCdhdXRob3JpemUnLCAnbm90X2F1dGhvcml6ZWQnLCBkZWNpc2lvbi5yZWFzb25zKTtcbiAgfVxuICByZXR1cm4gZXhlY3V0ZVN0cnVjdHVyZSh3b3JsZCwgcGxhbm5lZC5wbGFuLCBkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcbn1cbiIsICIvLyBDYW5vbmljYWwgc3RhdGUgaGFzaGluZyBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLCBubyB0aHJlZS5qcyBpbXBvcnRzLlxuLy9cbi8vIFRoZSBuby1mbGF0dGVuIHByb29mIGNvbXBhcmVzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVsIHZvbHVtZSBvdXRzaWRlIHRoZVxuLy8gY29tcGxldGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlLiBJdCBkZWxpYmVyYXRlbHkgZG9lcyBub3QgaGFzaCBjaHVua1xuLy8gaGVpZ2h0cy90b3BNYXRlcmlhbHMgKGRlcml2ZWQgY2FjaGVzKSwgbWVzaCBnZW9tZXRyeSwgc3RyZWFtaW5nIHN0YXRlIG9yXG4vLyBuYXZpZ2F0aW9uIGRhdGEuIFRob3NlIGFyZSBjaGVja2VkIHNlcGFyYXRlbHkgYXMgZGVyaXZlZCBzdGF0ZSwgc28gYSBjYWNoZVxuLy8gb3IgbWVzaCByZWJ1aWxkIGNhbiBuZXZlciBiZSBtaXN0YWtlbiBmb3IgYSB0ZXJyYWluIG11dGF0aW9uLlxuaW1wb3J0IHtcbiAgV29ybGQsIFlfTUlOLCBZX01BWCwgSEFMRiwgQ0hVTktfU0laRSwgQ0hVTktfQVJFQSxcbiAgZW5zdXJlQ2h1bmssIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWiwgbG9jYWxJbmRleCwgeVRvSW5kZXgsIGlzU29saWQsXG4gIEVudGl0eSxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBWb3hlbFJlZ2lvbiwgZW52ZWxvcGVDb250YWlucyB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBGT1VOREVSX0RFU0lHTl9WRVJTSU9OIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcblxuZXhwb3J0IGludGVyZmFjZSBTdGF0ZUhhc2gge1xuICAvKiogMTYgaGV4IGNoYXJhY3RlcnM6IHR3byBpbmRlcGVuZGVudCAzMi1iaXQgbGFuZXMuICovXG4gIGhhc2g6IHN0cmluZztcbiAgY2VsbHM6IG51bWJlcjtcbiAgZXhjbHVkZWRDZWxsczogbnVtYmVyO1xuICBjaHVua3M6IG51bWJlcjtcbiAgcmVnaW9uOiBWb3hlbFJlZ2lvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYWNoZU1pc21hdGNoIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGZpZWxkOiAnaGVpZ2h0JyB8ICdtYXRlcmlhbCc7XG4gIGV4cGVjdGVkOiBudW1iZXI7XG4gIGFjdHVhbDogbnVtYmVyO1xufVxuXG5jbGFzcyBIYXNoZXIge1xuICBwcml2YXRlIGEgPSAweDgxMWM5ZGM1O1xuICBwcml2YXRlIGIgPSAweDllMzc3OWI5O1xuXG4gIGJ5dGUodjogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgeCA9IHYgJiAweGZmO1xuICAgIHRoaXMuYSA9IE1hdGguaW11bCh0aGlzLmEgXiB4LCAweDAxMDAwMTkzKTtcbiAgICB0aGlzLmIgPSBNYXRoLmltdWwodGhpcy5iIF4gKHggKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgdGhpcy5iIF49IHRoaXMuYiA+Pj4gMTM7XG4gIH1cblxuICB1MzIodjogbnVtYmVyKTogdm9pZCB7XG4gICAgbGV0IG4gPSB2ID4+PiAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG4gICAgICB0aGlzLmJ5dGUobik7XG4gICAgICBuID4+Pj0gODtcbiAgICB9XG4gIH1cblxuICBzdHJpbmcoczogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy51MzIocy5sZW5ndGgpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcy5sZW5ndGg7IGkrKykgdGhpcy5ieXRlKHMuY2hhckNvZGVBdChpKSk7XG4gIH1cblxuICBoZXgoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gKHRoaXMuYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICAgICsgKHRoaXMuYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wUmVnaW9uKHJlZ2lvbjogVm94ZWxSZWdpb24pOiBWb3hlbFJlZ2lvbiB7XG4gIGNvbnN0IHI6IFZveGVsUmVnaW9uID0ge1xuICAgIHgwOiBNYXRoLm1heCgtSEFMRiwgTWF0aC5mbG9vcihyZWdpb24ueDApKSxcbiAgICB6MDogTWF0aC5tYXgoLUhBTEYsIE1hdGguZmxvb3IocmVnaW9uLnowKSksXG4gICAgeDE6IE1hdGgubWluKEhBTEYgLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi54MSkpLFxuICAgIHoxOiBNYXRoLm1pbihIQUxGIC0gMSwgTWF0aC5mbG9vcihyZWdpb24uejEpKSxcbiAgICB5MDogTWF0aC5tYXgoWV9NSU4sIE1hdGguZmxvb3IocmVnaW9uLnkwKSksXG4gICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5mbG9vcihyZWdpb24ueTEpKSxcbiAgfTtcbiAgaWYgKHIueDAgPiByLngxIHx8IHIuejAgPiByLnoxIHx8IHIueTAgPiByLnkxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBlbXB0eSB2b3hlbCByZWdpb24gJHtKU09OLnN0cmluZ2lmeShyZWdpb24pfWApO1xuICB9XG4gIHJldHVybiByO1xufVxuXG4vKiogU29ydCBhbiBlbnZlbG9wZSBzbyBpdHMgaGFzaCBpcyBpbmRlcGVuZGVudCBvZiByZWN0IG9yZGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUVudmVsb3BlKHJlY3RzOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogVm94ZWxSZWdpb25bXSB7XG4gIHJldHVybiByZWN0c1xuICAgIC5tYXAoKHIpID0+ICh7XG4gICAgICB4MDogTWF0aC5mbG9vcihyLngwKSwgejA6IE1hdGguZmxvb3Ioci56MCksIHgxOiBNYXRoLmZsb29yKHIueDEpLCB6MTogTWF0aC5mbG9vcihyLnoxKSxcbiAgICAgIHkwOiBNYXRoLmZsb29yKHIueTApLCB5MTogTWF0aC5mbG9vcihyLnkxKSxcbiAgICB9KSlcbiAgICAuc29ydCgoYSwgYikgPT4gYS54MCAtIGIueDAgfHwgYS56MCAtIGIuejAgfHwgYS55MCAtIGIueTBcbiAgICAgIHx8IGEueDEgLSBiLngxIHx8IGEuejEgLSBiLnoxIHx8IGEueTEgLSBiLnkxKTtcbn1cblxuLyoqIE1hdGVyaWFsaXNlIGV2ZXJ5IGNodW5rIHRoYXQgb3ZlcmxhcHMgdGhlIHJlZ2lvbiBhbmQgcmV0dXJuIHNvcnRlZCBrZXlzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjeDAgPSB3b3JsZFRvQ2h1bmtYKHIueDApLCBjeDEgPSB3b3JsZFRvQ2h1bmtYKHIueDEpO1xuICBjb25zdCBjejAgPSB3b3JsZFRvQ2h1bmtaKHIuejApLCBjejEgPSB3b3JsZFRvQ2h1bmtaKHIuejEpO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykge1xuICAgICAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgY2h1bmsgJHtjeH0sJHtjen0gaXMgb3V0c2lkZSB0aGUgd29ybGRgKTtcbiAgICAgIGtleXMucHVzaChjaHVua0tleShjeCwgY3opKTtcbiAgICB9XG4gIH1cbiAga2V5cy5zb3J0KCk7XG4gIHJldHVybiBrZXlzO1xufVxuXG4vKipcbiAqIEhhc2ggdGhlIGF1dGhvcml0YXRpdmUgbWF0ZXJpYWwgYnl0ZSBvZiBldmVyeSB2b3hlbCBpbiBgcmVnaW9uYCwgZXhjbHVkaW5nXG4gKiBldmVyeSB2b3hlbCBpbnNpZGUgYGV4Y2x1ZGVgLiBUd28gY2FsbHMgd2l0aCB0aGUgc2FtZSByZWdpb24gYW5kIGVudmVsb3BlXG4gKiBhcmUgZGlyZWN0bHkgY29tcGFyYWJsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbFJlZ2lvbkhhc2goXG4gIHdvcmxkOiBXb3JsZCxcbiAgcmVnaW9uOiBWb3hlbFJlZ2lvbixcbiAgZXhjbHVkZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSA9IFtdLFxuKTogU3RhdGVIYXNoIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGVudmVsb3BlID0gbm9ybWFsaXplRW52ZWxvcGUoZXhjbHVkZSk7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjp2b3hlbC1zdGF0ZTp2MScpO1xuICBoLnUzMihyLngwKTsgaC51MzIoci56MCk7IGgudTMyKHIueDEpOyBoLnUzMihyLnoxKTsgaC51MzIoci55MCk7IGgudTMyKHIueTEpO1xuICBoLnUzMihlbnZlbG9wZS5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IGUgb2YgZW52ZWxvcGUpIHtcbiAgICBoLnUzMihlLngwKTsgaC51MzIoZS56MCk7IGgudTMyKGUueDEpOyBoLnUzMihlLnoxKTsgaC51MzIoZS55MCk7IGgudTMyKGUueTEpO1xuICB9XG5cbiAgbGV0IGNlbGxzID0gMDtcbiAgbGV0IGV4Y2x1ZGVkQ2VsbHMgPSAwO1xuICBjb25zdCB5aTAgPSByLnkwIC0gWV9NSU47XG4gIGNvbnN0IHlpMSA9IHIueTEgLSBZX01JTjtcblxuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2tleX0gd2FzIG5vdCBnZW5lcmF0ZWRgKTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBoLnN0cmluZygnY2h1bmsnKTtcbiAgICBoLnUzMihjaHVuay5jeCk7IGgudTMyKGNodW5rLmN6KTtcbiAgICBmb3IgKGxldCB5aSA9IHlpMDsgeWkgPD0geWkxOyB5aSsrKSB7XG4gICAgICBjb25zdCB5ID0gWV9NSU4gKyB5aTtcbiAgICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgICAgY29uc3QgeiA9IG96ICsgbHo7XG4gICAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgICBjb25zdCB4ID0gb3ggKyBseDtcbiAgICAgICAgICBpZiAoZW52ZWxvcGUubGVuZ3RoID4gMCAmJiBlbnZlbG9wZUNvbnRhaW5zKGVudmVsb3BlLCB4LCB5LCB6KSkge1xuICAgICAgICAgICAgZXhjbHVkZWRDZWxscysrO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGguYnl0ZShjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlpLCBseildKTtcbiAgICAgICAgICBjZWxscysrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgaGFzaDogaC5oZXgoKSwgY2VsbHMsIGV4Y2x1ZGVkQ2VsbHMsIGNodW5rczoga2V5cy5sZW5ndGgsIHJlZ2lvbjogciB9O1xufVxuXG4vKiogQ2Fub25pY2FsIGludmVudG9yeSBoYXNoOyBrZXkgb3JkZXIgY2Fubm90IGFmZmVjdCB0aGUgcmVzdWx0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbEludmVudG9yeUhhc2god29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6aW52ZW50b3J5OnYxJyk7XG4gIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh3b3JsZC5pbnZlbnRvcnkpLnNvcnQoKTtcbiAgaC51MzIoa2V5cy5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgaC5zdHJpbmcoa2V5KTtcbiAgICBoLnUzMih3b3JsZC5pbnZlbnRvcnlba2V5XSk7XG4gIH1cbiAgcmV0dXJuIGguaGV4KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZDogV29ybGQpOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHdvcmxkLmludmVudG9yeSkuc29ydCgpKSBvdXRba2V5XSA9IHdvcmxkLmludmVudG9yeVtrZXldO1xuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBoYXNoRW50aXR5KGg6IEhhc2hlciwgZTogRW50aXR5KTogdm9pZCB7XG4gIGguc3RyaW5nKGUuaWQpO1xuICBoLnN0cmluZyhlLmtpbmQpO1xuICBoLnN0cmluZyhlLmNodW5rKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnggKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS55ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueiAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnJvdCAqIDEwMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS5zY2FsZSAqIDEwMDApKTtcbiAgaC51MzIoZS52YXJpYW50KTtcbiAgaC5zdHJpbmcoZS5yZXNvdXJjZSA/PyAnJyk7XG4gIGgudTMyKGUucmVtYWluaW5nKTtcbiAgaC51MzIoZS5oYXJ2ZXN0ZWQgPyAxIDogMCk7XG4gIGgudTMyKGUuaGFydmVzdGVkT25jZSA/IDEgOiAwKTtcbn1cblxuLyoqIEhhc2ggZW50aXR5IHN0YXRlOyB3aXRoIGEgcmVnaW9uLCBvbmx5IGVudGl0aWVzIHJvb3RlZCBpbnNpZGUgaXQuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsRW50aXR5SGFzaCh3b3JsZDogV29ybGQsIHJlZ2lvbj86IFZveGVsUmVnaW9uKTogc3RyaW5nIHtcbiAgbGV0IGVudGl0aWVzOiBFbnRpdHlbXTtcbiAgaWYgKHJlZ2lvbikge1xuICAgIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICAgIGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gICAgZW50aXRpZXMgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldLmZpbHRlcihcbiAgICAgIChlKSA9PiBlLnggPj0gci54MCAmJiBlLnggPCByLngxICsgMSAmJiBlLnogPj0gci56MCAmJiBlLnogPCByLnoxICsgMSxcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGVudGl0aWVzID0gWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXTtcbiAgfVxuICBlbnRpdGllcy5zb3J0KChhLCBiKSA9PiAoYS5pZCA8IGIuaWQgPyAtMSA6IGEuaWQgPiBiLmlkID8gMSA6IDApKTtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6ZW50aXR5LXN0YXRlOnYxJyk7XG4gIGgudTMyKGVudGl0aWVzLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgZSBvZiBlbnRpdGllcykgaGFzaEVudGl0eShoLCBlKTtcbiAgcmV0dXJuIGguaGV4KCk7XG59XG5cbi8qKlxuICogQ2Fub25pY2FsIGhhc2ggb2YgYnVpbHQgc3RydWN0dXJlcy4gTGF5b3V0IG1vZHVsZXMgYW5kIHBhaWQgY29zdHMgYXJlXG4gKiBhdXRob3JpdGF0aXZlIHNpbXVsYXRpb24gc3RhdGU7IHJlbmRlcmVyIG1lc2hlcyBhcmUgbm90LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsU3RydWN0dXJlSGFzaCh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCBzdHJ1Y3R1cmVzID0gWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldXG4gICAgLnNvcnQoKGEsIGIpID0+IChhLmlkIDwgYi5pZCA/IC0xIDogYS5pZCA+IGIuaWQgPyAxIDogMCkpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjpzdHJ1Y3R1cmUtc3RhdGU6djEnKTtcbiAgaC51MzIoc3RydWN0dXJlcy5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IHMgb2Ygc3RydWN0dXJlcykge1xuICAgIGguc3RyaW5nKHMuaWQpO1xuICAgIGguc3RyaW5nKHMua2luZCk7XG4gICAgaC5zdHJpbmcocy5zaXRlSWQpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy54ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy55ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy56ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy5yb3QgKiAxMDAwMCkpO1xuICAgIC8vIExlZ2FjeSBoYXNoIGlucHV0IGlzIGJ5dGUtaWRlbnRpY2FsLiBEZXNpZ24gMiBhZGRzIGFuIGV4cGxpY2l0IHRhZy5cbiAgICBpZiAocy5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSBoLnN0cmluZygnZGVzaWduOjInKTtcbiAgICBoLnUzMihzLm1vZHVsZXMubGVuZ3RoKTtcbiAgICBmb3IgKGNvbnN0IG0gb2Ygcy5tb2R1bGVzKSB7XG4gICAgICBoLnN0cmluZyhtLmtpbmQpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnggKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueSAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS56ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLncgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0uaCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS5kICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZCgobS5yb3QgPz8gMCkgKiAxMDAwMCkpO1xuICAgICAgaC5zdHJpbmcobS50b25lID8/ICcnKTtcbiAgICB9XG4gICAgY29uc3QgY29zdEtleXMgPSBPYmplY3Qua2V5cyhzLmNvc3QpLnNvcnQoKTtcbiAgICBoLnUzMihjb3N0S2V5cy5sZW5ndGgpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIGNvc3RLZXlzKSB7XG4gICAgICBoLnN0cmluZyhrZXkpO1xuICAgICAgaC51MzIocy5jb3N0W2tleSBhcyBrZXlvZiB0eXBlb2Ygcy5jb3N0XSA/PyAwKTtcbiAgICB9XG4gICAgaC51MzIocy5idWlsdFJldmlzaW9uKTtcbiAgfVxuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYWNoZUhhc2gge1xuICBoYXNoOiBzdHJpbmc7XG4gIGNvbHVtbnM6IG51bWJlcjtcbiAgY2h1bmtzOiBudW1iZXI7XG59XG5cbi8qKiBEZXJpdmVkIGNvbHVtbi1jYWNoZSBoYXNoLiBOb3QgYXV0aG9yaXRhdGl2ZSB0ZXJyYWluIHN0YXRlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlcml2ZWRDYWNoZUhhc2god29ybGQ6IFdvcmxkLCByZWdpb246IFZveGVsUmVnaW9uKTogQ2FjaGVIYXNoIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjpkZXJpdmVkLWNvbHVtbi1jYWNoZTp2MScpO1xuICBoLnUzMihyLngwKTsgaC51MzIoci56MCk7IGgudTMyKHIueDEpOyBoLnUzMihyLnoxKTtcbiAgbGV0IGNvbHVtbnMgPSAwO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2tleX0gd2FzIG5vdCBnZW5lcmF0ZWRgKTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBoLnN0cmluZygnY2h1bmsnKTtcbiAgICBoLnUzMihjaHVuay5jeCk7IGgudTMyKGNodW5rLmN6KTtcbiAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBoLnUzMihjaHVuay5oZWlnaHRzW2NvbF0pO1xuICAgICAgICBoLnUzMihjaHVuay50b3BNYXRlcmlhbHNbY29sXSk7XG4gICAgICAgIGNvbHVtbnMrKztcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgaGFzaDogaC5oZXgoKSwgY29sdW1ucywgY2h1bmtzOiBrZXlzLmxlbmd0aCB9O1xufVxuXG4vKipcbiAqIFJlY29tcHV0ZSBldmVyeSBjb2x1bW4gY2FjaGUgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbCBkYXRhIGFuZCByZXBvcnRcbiAqIG1pc21hdGNoZXMuIFRoaXMgcHJvdmVzIGhlaWdodHMvdG9wTWF0ZXJpYWxzIGFyZSBkZXJpdmVkLCBub3QgYSBzZWNvbmRcbiAqIHRlcnJhaW4gcmVwcmVzZW50YXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaGVja0Rlcml2ZWRDYWNoZXMod29ybGQ6IFdvcmxkLCByZWdpb246IFZveGVsUmVnaW9uLCBsaW1pdCA9IDY0KTogQ2FjaGVNaXNtYXRjaFtdIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBvdXQ6IENhY2hlTWlzbWF0Y2hbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgY29udGludWU7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgbHgwID0gTWF0aC5tYXgoMCwgci54MCAtIG94KSwgbHgxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIueDEgLSBveCk7XG4gICAgY29uc3QgbHowID0gTWF0aC5tYXgoMCwgci56MCAtIG96KSwgbHoxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIuejEgLSBveik7XG4gICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICAgIGxldCB0b3BNYXQgPSBjaHVuay50b3BNYXRlcmlhbHNbY29sXTtcbiAgICAgICAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgICAgICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkSGVpZ2h0ID0gdG9wU29saWQgLSBZX01JTjtcbiAgICAgICAgaWYgKGNodW5rLmhlaWdodHNbY29sXSAhPT0gZXhwZWN0ZWRIZWlnaHQpIHtcbiAgICAgICAgICBvdXQucHVzaCh7IHg6IG94ICsgbHgsIHo6IG96ICsgbHosIGZpZWxkOiAnaGVpZ2h0JywgZXhwZWN0ZWQ6IGV4cGVjdGVkSGVpZ2h0LCBhY3R1YWw6IGNodW5rLmhlaWdodHNbY29sXSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gIT09IHRvcE1hdCkge1xuICAgICAgICAgIG91dC5wdXNoKHsgeDogb3ggKyBseCwgejogb3ogKyBseiwgZmllbGQ6ICdtYXRlcmlhbCcsIGV4cGVjdGVkOiB0b3BNYXQsIGFjdHVhbDogY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG91dC5sZW5ndGggPj0gbGltaXQpIHJldHVybiBvdXQ7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWRpdE91dHNpZGUge1xuICBjaHVuazogc3RyaW5nO1xuICBpbmRleDogbnVtYmVyO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBtYXRlcmlhbDogbnVtYmVyO1xufVxuXG4vKiogRXZlcnkgcmVjb3JkZWQgdm94ZWwgZWRpdCBvdXRzaWRlIHRoZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUuICovXG5leHBvcnQgZnVuY3Rpb24gZWRpdHNPdXRzaWRlRW52ZWxvcGUod29ybGQ6IFdvcmxkLCBlbnZlbG9wZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IEVkaXRPdXRzaWRlW10ge1xuICBjb25zdCBvdXQ6IEVkaXRPdXRzaWRlW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICAgIGZvciAoY29uc3QgW2luZGV4LCBtYXRlcmlhbF0gb2YgZWRpdHMpIHtcbiAgICAgIGNvbnN0IGx4ID0gaW5kZXggJSBDSFVOS19TSVpFO1xuICAgICAgY29uc3QgbHogPSBNYXRoLmZsb29yKChpbmRleCAlIENIVU5LX0FSRUEpIC8gQ0hVTktfU0laRSk7XG4gICAgICBjb25zdCB5aSA9IE1hdGguZmxvb3IoaW5kZXggLyBDSFVOS19BUkVBKTtcbiAgICAgIGNvbnN0IHggPSBveCArIGx4LCB6ID0gb3ogKyBseiwgeSA9IFlfTUlOICsgeWk7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMoZW52ZWxvcGUsIHgsIHksIHopKSB7XG4gICAgICAgIG91dC5wdXNoKHsgY2h1bms6IGtleSwgaW5kZXgsIHgsIHksIHosIG1hdGVyaWFsIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBvdXQuc29ydCgoYSwgYikgPT4gYS5jaHVuay5sb2NhbGVDb21wYXJlKGIuY2h1bmspIHx8IGEuaW5kZXggLSBiLmluZGV4KTtcbiAgcmV0dXJuIG91dDtcbn1cblxuLyoqIE5ldyBjaHVua3MgZ2VuZXJhdGVkIHNpbmNlIHRoZSBiYXNlbGluZSB0aGF0IGRvIG5vdCBvdmVybGFwIHRoZSBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBuZXdDaHVua3NPdXRzaWRlRW52ZWxvcGUoXG4gIHdvcmxkOiBXb3JsZCwgYmFzZWxpbmVLZXlzOiBJdGVyYWJsZTxzdHJpbmc+LCBlbnZlbG9wZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSxcbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgYmFzZWxpbmUgPSBuZXcgU2V0KGJhc2VsaW5lS2V5cyk7XG4gIGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBjaHVua10gb2Ygd29ybGQuY2h1bmtzKSB7XG4gICAgaWYgKGJhc2VsaW5lLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBvdmVybGFwcyA9IGVudmVsb3BlLnNvbWUoXG4gICAgICAocikgPT4gb3ggPD0gci54MSAmJiBveCArIENIVU5LX1NJWkUgLSAxID49IHIueDAgJiYgb3ogPD0gci56MSAmJiBveiArIENIVU5LX1NJWkUgLSAxID49IHIuejAsXG4gICAgKTtcbiAgICBpZiAoIW92ZXJsYXBzKSBvdXQucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiBvdXQuc29ydCgpO1xufVxuXG4vKiogQWxsIGNodW5rIGtleXMgY3VycmVudGx5IG1hdGVyaWFsaXNlZCwgc29ydGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNodW5rS2V5cyh3b3JsZDogV29ybGQpOiBzdHJpbmdbXSB7XG4gIHJldHVybiBbLi4ud29ybGQuY2h1bmtzLmtleXMoKV0uc29ydCgpO1xufVxuXG4vKiogQm91bmRpbmcgdm94ZWwgcmVnaW9uIGNvdmVyaW5nIGV2ZXJ5IG1hdGVyaWFsaXNlZCBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZENodW5rUmVnaW9uKHdvcmxkOiBXb3JsZCk6IFZveGVsUmVnaW9uIHtcbiAgaWYgKHdvcmxkLmNodW5rcy5zaXplID09PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ3dvcmxkIGhhcyBubyBjaHVua3MnKTtcbiAgbGV0IG1pbkN4ID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhDeCA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgbGV0IG1pbkN6ID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhDeiA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCBjaHVuayBvZiB3b3JsZC5jaHVua3MudmFsdWVzKCkpIHtcbiAgICBtaW5DeCA9IE1hdGgubWluKG1pbkN4LCBjaHVuay5jeCk7IG1heEN4ID0gTWF0aC5tYXgobWF4Q3gsIGNodW5rLmN4KTtcbiAgICBtaW5DeiA9IE1hdGgubWluKG1pbkN6LCBjaHVuay5jeik7IG1heEN6ID0gTWF0aC5tYXgobWF4Q3osIGNodW5rLmN6KTtcbiAgfVxuICByZXR1cm4ge1xuICAgIHgwOiBjaHVua09yaWdpblgobWluQ3gpLFxuICAgIHowOiBjaHVua09yaWdpbloobWluQ3opLFxuICAgIHgxOiBjaHVua09yaWdpblgobWF4Q3gpICsgQ0hVTktfU0laRSAtIDEsXG4gICAgejE6IGNodW5rT3JpZ2luWihtYXhDeikgKyBDSFVOS19TSVpFIC0gMSxcbiAgICB5MDogWV9NSU4sXG4gICAgeTE6IFlfTUFYIC0gMSxcbiAgfTtcbn1cbiIsICIvLyBNMDAyIGRldGVybWluaXN0aWMgZml4dHVyZSBhbmQgbGl2ZS13b3JsZCBsYXlvdXQuXG4vL1xuLy8gVGhlIGZpeHR1cmUgaXMgYSBib3VuZGVkIHNsaWNlIG9mIHRoZSByZWFsIDIwNDggbSB3b3JsZCAoc2VlZCAxMzM3KSwgbm90IGFcbi8vIHN5bnRoZXRpYyBoZWlnaHRmaWVsZC4gSXQgY29udGFpbnM6XG4vLyAgICogYSByZWplY3RlZCBob3VzZSBzaXRlIG9uIGEgNyBtIHJpdmVyLWJhbmsgc2xvcGU7XG4vLyAgICogYSB2aWFibGUgaG91c2Ugc2hlbGYgMjAgbSBhd2F5IHdpdGggMiBtIHJlbGllZiBhbmQgbm8gY2xlYXJpbmcgbmVlZGVkO1xuLy8gICAqIGEgMyBtIGZhcm0gc2xvcGUgMjcgbSBmcm9tIHRoZSBob3VzZSB3aXRoIGEgbmF0dXJhbCBibG9zc29tIHRyZWUgYW5kIG9yZS5cbi8vXG4vLyBUaGUgc2FtZSBjb29yZGluYXRlcywgcXVlcmllcyBhbmQgdmFsaWRhdG9ycyBhcmUgdXNlZCBieSB0aGUgbGl2ZS13b3JsZFxuLy8gYWNjZXB0YW5jZSB0ZXN0LiBUaGUgb25seSBkaWZmZXJlbmNlIGlzIGhvdyBtYW55IGNodW5rcyBhcmUgbWF0ZXJpYWxpc2VkLlxuaW1wb3J0IHtcbiAgV29ybGQsIGNyZWF0ZVdvcmxkLCBnZW5lcmF0ZVdvcmxkLCBnZW5lcmF0ZUNodW5rLCBwbGFjZUF1dGhvcmVkU2l0ZXMsXG4gIFlfTUlOLCBZX01BWCwgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgUmVjdCwgVm94ZWxSZWdpb24gfSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHsgY2h1bmtLZXlzIH0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTTAwMl9TRUVEID0gMTMzNztcblxuLyoqIFBpbm5lZCBwYXRoIHNpdGUgaWQgZm9yIHRoZSBkb29yLXRvLWFwcHJvYWNoIGNvcnJpZG9yLiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfUEFUSF9TSVRFX0lEID0gJ3BhdGgtaG91c2UtZmFybSc7XG5cbi8qKlxuICogUGlubmVkIHN0ZXBwZWQgcHJvZmlsZSBmb3IgdGhlIDkgbSBwYXRoIGZyb20gdGhlIGhvdXNlIGRvb3IgKHggPSAtNTMpIHRvIHRoZVxuICogYXBwcm9hY2ggKHggPSAtNDUpLiBUaGUgcmlzZSBpcyAyIG0gb3ZlciA4IG07IGV2ZXJ5IHN0ZXAgaXMgYXQgbW9zdCAxIG0uXG4gKi9cbmV4cG9ydCBjb25zdCBNMDAyX1BBVEhfUFJPRklMRSA9IFsxMSwgMTEsIDExLCAxMiwgMTIsIDEyLCAxMiwgMTMsIDEzXSBhcyBjb25zdDtcblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWNlQmFuZFNwZWMge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbi8qKiBQaW5uZWQgZmFybSB0ZXJyYWNlcywgaGlnaCBzaWRlIGZpcnN0LiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfVEVSUkFDRV9CQU5EUzogcmVhZG9ubHkgVGVycmFjZUJhbmRTcGVjW10gPSBbXG4gIHsgejA6IC00MiwgejE6IC00MCwgeTogMTYgfSxcbiAgeyB6MDogLTM5LCB6MTogLTM3LCB5OiAxNSB9LFxuICB7IHowOiAtMzYsIHoxOiAtMzUsIHk6IDE0IH0sXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVTcGVjIHtcbiAgaWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIGRvb3I6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGYXJtU3BlYyB7XG4gIGlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIHRlcnJhY2VzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMkxheW91dCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcmVqZWN0ZWQ6IFNpdGVTcGVjO1xuICBob3VzZTogU2l0ZVNwZWM7XG4gIGZhcm06IEZhcm1TcGVjO1xuICBzZWFyY2hBcmVhOiBSZWN0O1xuICB3b3JrWm9uZTogUmVjdDtcbiAgZml4dHVyZUNodW5rczogeyBjeDA6IG51bWJlcjsgY3owOiBudW1iZXI7IGN4MTogbnVtYmVyOyBjejE6IG51bWJlciB9O1xuICBwcm90ZWN0ZWRSZWdpb246IFZveGVsUmVnaW9uO1xuICAvKiogQ29tcGxldGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlIGZvciB0aGUgZmlyc3Qgc2xpY2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xufVxuXG5jb25zdCBGSVhUVVJFX0NIVU5LUyA9IHsgY3gwOiAyOCwgY3owOiAyOSwgY3gxOiAzMiwgY3oxOiAzMiB9IGFzIGNvbnN0O1xuXG5leHBvcnQgY29uc3QgTTAwMl9MQVlPVVQ6IE0wMDJMYXlvdXQgPSB7XG4gIHNlZWQ6IE0wMDJfU0VFRCxcbiAgcmVqZWN0ZWQ6IHtcbiAgICBpZDogJ3NpdGUtYS1yZWplY3RlZCcsXG4gICAgcmVjdDogeyB4MDogLTc0LCB6MDogLTY2LCB4MTogLTY3LCB6MTogLTYxIH0sXG4gICAgLy8gQSBuYWl2ZSBsb3ctc2lkZSBmbG9vcjogdGhlIHVwaGlsbCBjb3JuZXIgd291bGQgbmVlZCA1IG0gb2YgZXhjYXZhdGlvbi5cbiAgICBmbG9vclk6IDMsXG4gICAgZG9vcjogeyB4OiAtNjcsIHo6IC02MyB9LFxuICAgIGFwcHJvYWNoOiB7IHg6IC02MCwgejogLTYzIH0sXG4gIH0sXG4gIGhvdXNlOiB7XG4gICAgaWQ6ICdzaXRlLWItaG91c2UnLFxuICAgIHJlY3Q6IHsgeDA6IC02MCwgejA6IC00NiwgeDE6IC01MywgejE6IC00MSB9LFxuICAgIGZsb29yWTogMTEsXG4gICAgZG9vcjogeyB4OiAtNTMsIHo6IC00MyB9LFxuICAgIGFwcHJvYWNoOiB7IHg6IC00NSwgejogLTQzIH0sXG4gIH0sXG4gIGZhcm06IHtcbiAgICBpZDogJ2ZpZWxkLWMnLFxuICAgIHJlY3Q6IHsgeDA6IC0zOCwgejA6IC00MiwgeDE6IC0yNywgejE6IC0zNSB9LFxuICAgIHRlcnJhY2VzOiAzLFxuICB9LFxuICBzZWFyY2hBcmVhOiB7IHgwOiAtNzYsIHowOiAtNjgsIHgxOiAtNDAsIHoxOiAtNDAgfSxcbiAgd29ya1pvbmU6IHsgeDA6IC03NiwgejA6IC02OCwgeDE6IC0yMywgejE6IC0zMSB9LFxuICBmaXh0dXJlQ2h1bmtzOiBGSVhUVVJFX0NIVU5LUyxcbiAgcHJvdGVjdGVkUmVnaW9uOiB7XG4gICAgeDA6IGNodW5rT3JpZ2luWChGSVhUVVJFX0NIVU5LUy5jeDApLFxuICAgIHowOiBjaHVua09yaWdpblooRklYVFVSRV9DSFVOS1MuY3owKSxcbiAgICB4MTogY2h1bmtPcmlnaW5YKEZJWFRVUkVfQ0hVTktTLmN4MSkgKyAzMSxcbiAgICB6MTogY2h1bmtPcmlnaW5aKEZJWFRVUkVfQ0hVTktTLmN6MSkgKyAzMSxcbiAgICB5MDogWV9NSU4sXG4gICAgeTE6IFlfTUFYIC0gMSxcbiAgfSxcbiAgZW52ZWxvcGU6IFtcbiAgICAvLyBIb3VzZSBmb290cHJpbnQgcGx1cyBhIDIgbSBwcmVwYXJhdGlvbiBidWZmZXIuXG4gICAgeyB4MDogLTYyLCB6MDogLTQ4LCB4MTogLTUxLCB6MTogLTM5LCB5MDogOCwgeTE6IDE2IH0sXG4gICAgLy8gRG9vci10by1hcHByb2FjaCBwYXRoIGNvcnJpZG9yIHBsdXMgYSAxIG0gYnVmZmVyLlxuICAgIHsgeDA6IC01NCwgejA6IC00NCwgeDE6IC00NCwgejE6IC00MiwgeTA6IDksIHkxOiAxNSB9LFxuICAgIC8vIEZhcm0gZm9vdHByaW50IHBsdXMgYSAyIG0gcHJlcGFyYXRpb24gYnVmZmVyLlxuICAgIHsgeDA6IC00MCwgejA6IC00NCwgeDE6IC0yNSwgejE6IC0zMywgeTA6IDEwLCB5MTogMjAgfSxcbiAgXSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMldvcmxkIHtcbiAgd29ybGQ6IFdvcmxkO1xuICBsYXlvdXQ6IE0wMDJMYXlvdXQ7XG4gIC8qKiBTb3J0ZWQgY2h1bmsga2V5cyBtYXRlcmlhbGlzZWQgYXQgZml4dHVyZSBjcmVhdGlvbi4gKi9cbiAgY2h1bmtLZXlzOiBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBTbWFsbCBkZXRlcm1pbmlzdGljIGZpeHR1cmU6IHRoZSAyMCBjaHVua3MgY292ZXJpbmcgdGhlIHdvcmsgem9uZSBhbmQgaXRzXG4gKiBwcm90ZWN0ZWQgc3Vycm91bmRpbmdzLiBGYXN0IGVub3VnaCBmb3IgdGhlIGZ1bGwgdGVzdCBzdWl0ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU0wMDJGaXh0dXJlKHNlZWQgPSBNMDAyX1NFRUQpOiBNMDAyV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQpO1xuICBjb25zdCB7IGN4MCwgY3owLCBjeDEsIGN6MSB9ID0gTTAwMl9MQVlPVVQuZml4dHVyZUNodW5rcztcbiAgZm9yIChsZXQgY3ogPSBjejA7IGN6IDw9IGN6MTsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY3gwOyBjeCA8PSBjeDE7IGN4KyspIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIH1cbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgcmV0dXJuIHsgd29ybGQsIGxheW91dDogTTAwMl9MQVlPVVQsIGNodW5rS2V5czogY2h1bmtLZXlzKHdvcmxkKSB9O1xufVxuXG4vKipcbiAqIExpdmUtd29ybGQgaW50ZWdyYXRpb24gdGFyZ2V0OiB0aGUgc2FtZSBzZWVkIGFuZCBzaXRlcyB3aXRoIGEgOSB4IDkgY2h1bmtcbiAqIG5laWdoYm91cmhvb2QgKDgxIGNodW5rcykgYXJvdW5kIHRoZSBmb3VuZGVyIHZhbGxleS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU0wMDJMaXZlKHNlZWQgPSBNMDAyX1NFRUQsIHJhZGl1cyA9IDQpOiBNMDAyV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoc2VlZCwgcmFkaXVzKTtcbiAgcmV0dXJuIHsgd29ybGQsIGxheW91dDogTTAwMl9MQVlPVVQsIGNodW5rS2V5czogY2h1bmtLZXlzKHdvcmxkKSB9O1xufVxuIiwgIi8vIE0wMDIgc3RhZ2UgNyBzY2VuYXJpbyB3aXJpbmc6IHRoZSBwaW5uZWQgZmlyc3Qgc2xpY2UsIHJ1biB0aHJvdWdoIHRoZSBzYW1lXG4vLyBwdWJsaWMgc2ltdWxhdGlvbiBwaXBlbGluZSB1c2VkIGJ5IHRoZSBwbGF5ZXIsIHRoZSBBSSBhbmQgdGhlIHRlc3RzLlxuLy9cbi8vIFRoZSBzY2VuYXJpbyBpcyBkZWxpYmVyYXRlbHkgcGxhaW4gZGF0YSBpbiAvIGRhdGEgb3V0LiBJdCBkb2VzIG5vdCB0b3VjaCB0aGVcbi8vIHJlbmRlcmVyLCBhbmQgZXZlcnkgdGVycmFpbiBlZGl0IHN0aWxsIGdvZXMgdGhyb3VnaCBwcmVwYXJlU2l0ZSAtPlxuLy8gTG9jYWxBdXRob3JpemVyIC0+IGV4ZWN1dGVQcmVwYXJhdGlvbi4gU3RydWN0dXJlcyBzdGlsbCBnbyB0aHJvdWdoXG4vLyBidWlsZFN0cnVjdHVyZSAtPiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIgLT4gZXhlY3V0ZVN0cnVjdHVyZS5cbmltcG9ydCB7IE1BVCwgUmVzb3VyY2VUeXBlIH0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBNMDAyV29ybGQsIE0wMDJfTEFZT1VULCBNMDAyX1BBVEhfUFJPRklMRSwgTTAwMl9QQVRIX1NJVEVfSUQsXG4gIE0wMDJfVEVSUkFDRV9CQU5EUyxcbn0gZnJvbSAnLi9tMDAyJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHsgSE9VU0VfUlVMRVMsIFBBVEhfUlVMRVMsIEZBUk1fUlVMRVMgfSBmcm9tICcuL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBDb2x1bW5UYXJnZXQsIExvY2FsQXV0aG9yaXplciwgcHJlcGFyZVNpdGUsIFByZXBhcmF0aW9uTGVkZ2VyLFxufSBmcm9tICcuL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7XG4gIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgYnVpbGRTdHJ1Y3R1cmUsIFN0cnVjdHVyZUxlZGdlcixcbn0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7XG4gIGNhbm9uaWNhbEVudGl0eUhhc2gsIGNhbm9uaWNhbEludmVudG9yeUhhc2gsIGNhbm9uaWNhbFJlZ2lvbkhhc2gsXG4gIGNhbm9uaWNhbFN0cnVjdHVyZUhhc2gsIGludmVudG9yeVNuYXBzaG90LFxufSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBNMDAyX1NUQVJURVJfSU5WRU5UT1JZOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBudW1iZXI+PiA9IHtcbiAgd29vZDogMjQsXG4gIHN0b25lOiA0OCxcbn07XG5cbi8qKiBUaGUgOSB4IDMgbSBjb3JyaWRvciBmcm9tIHRoZSBob3VzZSBkb29yIHRvIHRoZSBhcHByb2FjaC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyUGF0aFJlY3QoKTogUmVjdCB7XG4gIGNvbnN0IGRvb3IgPSBNMDAyX0xBWU9VVC5ob3VzZS5kb29yO1xuICBjb25zdCBhcHByb2FjaCA9IE0wMDJfTEFZT1VULmhvdXNlLmFwcHJvYWNoO1xuICByZXR1cm4ge1xuICAgIHgwOiBkb29yLngsXG4gICAgejA6IGRvb3IueiAtIDEsXG4gICAgeDE6IGFwcHJvYWNoLngsXG4gICAgejE6IGRvb3IueiArIDEsXG4gIH07XG59XG5cbi8qKiBPbmUgdGFyZ2V0IHBlciBwYXRoIGNvbHVtbiwgdXNpbmcgdGhlIHBpbm5lZCBzdGVwcGVkIHByb2ZpbGUuICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMlBhdGhUYXJnZXRzKCk6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3QgcmVjdCA9IG0wMDJQYXRoUmVjdCgpO1xuICBjb25zdCB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IE0wMDJfUEFUSF9QUk9GSUxFLmxlbmd0aDsgaSsrKSB7XG4gICAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgICB0YXJnZXRzLnB1c2goeyB4OiByZWN0LngwICsgaSwgeiwgeTogTTAwMl9QQVRIX1BST0ZJTEVbaV0gfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiB0YXJnZXRzO1xufVxuXG4vKiogT25lIHRhcmdldCBwZXIgZmFybSBjb2x1bW4sIHVzaW5nIHRoZSBwaW5uZWQgdGVycmFjZSBiYW5kcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyRmFybVRhcmdldHMoKTogQ29sdW1uVGFyZ2V0W10ge1xuICBjb25zdCByZWN0ID0gTTAwMl9MQVlPVVQuZmFybS5yZWN0O1xuICBjb25zdCB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGJhbmQgb2YgTTAwMl9URVJSQUNFX0JBTkRTKSB7XG4gICAgZm9yIChsZXQgeiA9IGJhbmQuejA7IHogPD0gYmFuZC56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICAgICAgdGFyZ2V0cy5wdXNoKHsgeCwgeiwgeTogYmFuZC55IH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gdGFyZ2V0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyU2NlbmFyaW9PcHRpb25zIHtcbiAgLyoqIFN0YXJ0ZXIgcmVzb3VyY2VzIGJlZm9yZSB0aGUgc2xpY2UgcnVucy4gRGVmYXVsdHMgdG8gd29vZCAyNCAvIHN0b25lIDQ4LiAqL1xuICBpbnZlbnRvcnk/OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJTY2VuYXJpb1NpdGUge1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25MZWRnZXIgfCBudWxsO1xuICBzdHJ1Y3R1cmU6IFN0cnVjdHVyZUxlZGdlciB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMlNjZW5hcmlvUmVzdWx0IHtcbiAgb2s6IGJvb2xlYW47XG4gIGVycm9yczogc3RyaW5nW107XG4gIGhvdXNlOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBwYXRoOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBmYXJtOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBoYXNoZXM6IHtcbiAgICB2b3hlbHM6IHN0cmluZztcbiAgICBzdHJ1Y3R1cmVzOiBzdHJpbmc7XG4gICAgaW52ZW50b3J5OiBzdHJpbmc7XG4gICAgZW50aXRpZXM6IHN0cmluZztcbiAgfTtcbn1cblxuZnVuY3Rpb24gZW1wdHlTaXRlKCk6IE0wMDJTY2VuYXJpb1NpdGUge1xuICByZXR1cm4geyBwcmVwYXJhdGlvbjogbnVsbCwgc3RydWN0dXJlOiBudWxsIH07XG59XG5cbmZ1bmN0aW9uIGRlc2NyaWJlRmFpbHVyZShyZXN1bHQ6IHsgY29kZTogc3RyaW5nOyByZWFzb25zOiBzdHJpbmdbXSB9KTogc3RyaW5nIHtcbiAgcmV0dXJuIGAke3Jlc3VsdC5jb2RlfTogJHtyZXN1bHQucmVhc29ucy5qb2luKCc7ICcpfWA7XG59XG5cbi8qKlxuICogUnVuIGhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlZCBmYXJtIGluIHRoZWlyIHBpbm5lZCBvcmRlci4gQSBmYWlsZWQgc3RlcCBpc1xuICogcmVjb3JkZWQgYW5kIGxhdGVyIGluZGVwZW5kZW50IHN0ZXBzIHN0aWxsIHJ1bjsgYSBzdHJ1Y3R1cmUgaXMgbmV2ZXIgYnVpbHRcbiAqIHVubGVzcyBpdHMgb3duIHRlcnJhaW4gcHJlcGFyYXRpb24gc3VjY2VlZGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcnVuTTAwMlNjZW5hcmlvKFxuICBtMDAyOiBNMDAyV29ybGQsIG9wdGlvbnM6IE0wMDJTY2VuYXJpb09wdGlvbnMgPSB7fSxcbik6IE0wMDJTY2VuYXJpb1Jlc3VsdCB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gbTAwMjtcbiAgY29uc3Qgc3RhcnRlciA9IG9wdGlvbnMuaW52ZW50b3J5ID8/IE0wMDJfU1RBUlRFUl9JTlZFTlRPUlk7XG4gIHdvcmxkLmludmVudG9yeSA9IHt9O1xuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhzdGFydGVyKSkge1xuICAgIGlmICgoYW1vdW50ID8/IDApID4gMCkgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA9IGFtb3VudCBhcyBudW1iZXI7XG4gIH1cblxuICBjb25zdCBwcmVwQXV0aG9yaXplciA9IG5ldyBMb2NhbEF1dGhvcml6ZXIoeyBlbnZlbG9wZTogbGF5b3V0LmVudmVsb3BlIH0pO1xuICBjb25zdCBzdHJ1Y3R1cmVBdXRob3JpemVyID0gbmV3IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcih7IGVudmVsb3BlOiBsYXlvdXQuZW52ZWxvcGUgfSk7XG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBob3VzZSA9IGVtcHR5U2l0ZSgpO1xuICBjb25zdCBwYXRoID0gZW1wdHlTaXRlKCk7XG4gIGNvbnN0IGZhcm0gPSBlbXB0eVNpdGUoKTtcblxuICBjb25zdCBob3VzZVByZXAgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IGxheW91dC5ob3VzZS5pZCxcbiAgICByZWN0OiBsYXlvdXQuaG91c2UucmVjdCxcbiAgICBmbG9vclk6IGxheW91dC5ob3VzZS5mbG9vclksXG4gICAgcnVsZXM6IEhPVVNFX1JVTEVTLFxuICB9KTtcbiAgaWYgKCFob3VzZVByZXAub2spIHtcbiAgICBlcnJvcnMucHVzaChgaG91c2UgcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKGhvdXNlUHJlcCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgaG91c2UucHJlcGFyYXRpb24gPSBob3VzZVByZXAubGVkZ2VyO1xuICAgIGNvbnN0IGhvdXNlQnVpbGQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwge1xuICAgICAgc2l0ZUlkOiBsYXlvdXQuaG91c2UuaWQsXG4gICAgICBraW5kOiAnaG91c2UnLFxuICAgICAgcmVjdDogbGF5b3V0LmhvdXNlLnJlY3QsXG4gICAgICBmbG9vclk6IGxheW91dC5ob3VzZS5mbG9vclksXG4gICAgICBkb29yOiBsYXlvdXQuaG91c2UuZG9vcixcbiAgICB9KTtcbiAgICBpZiAoIWhvdXNlQnVpbGQub2spIHtcbiAgICAgIGVycm9ycy5wdXNoKGBob3VzZSBzdHJ1Y3R1cmU6ICR7ZGVzY3JpYmVGYWlsdXJlKGhvdXNlQnVpbGQpfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBob3VzZS5zdHJ1Y3R1cmUgPSBob3VzZUJ1aWxkLmxlZGdlcjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBwYXRoUmVjdCA9IG0wMDJQYXRoUmVjdCgpO1xuICBjb25zdCBwYXRoUHJlcCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwge1xuICAgIHNpdGVJZDogTTAwMl9QQVRIX1NJVEVfSUQsXG4gICAgcmVjdDogcGF0aFJlY3QsXG4gICAgZmxvb3JZOiAxMixcbiAgICBydWxlczogUEFUSF9SVUxFUyxcbiAgfSwge1xuICAgIHRhcmdldHM6IG0wMDJQYXRoVGFyZ2V0cygpLFxuICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULkdSQVZFTCxcbiAgICBlbnZlbG9wZTogW2xheW91dC5lbnZlbG9wZVsxXV0sXG4gIH0pO1xuICBpZiAoIXBhdGhQcmVwLm9rKSB7XG4gICAgZXJyb3JzLnB1c2goYHBhdGggcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKHBhdGhQcmVwKX1gKTtcbiAgfSBlbHNlIHtcbiAgICBwYXRoLnByZXBhcmF0aW9uID0gcGF0aFByZXAubGVkZ2VyO1xuICAgIGNvbnN0IHBhdGhCdWlsZCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCB7XG4gICAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgICAga2luZDogJ3BhdGgnLFxuICAgICAgcmVjdDogcGF0aFJlY3QsXG4gICAgICBmbG9vclk6IDEyLFxuICAgIH0pO1xuICAgIGlmICghcGF0aEJ1aWxkLm9rKSB7XG4gICAgICBlcnJvcnMucHVzaChgcGF0aCBzdHJ1Y3R1cmU6ICR7ZGVzY3JpYmVGYWlsdXJlKHBhdGhCdWlsZCl9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhdGguc3RydWN0dXJlID0gcGF0aEJ1aWxkLmxlZGdlcjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBmYXJtUHJlcCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwge1xuICAgIHNpdGVJZDogbGF5b3V0LmZhcm0uaWQsXG4gICAgcmVjdDogbGF5b3V0LmZhcm0ucmVjdCxcbiAgICBmbG9vclk6IDE1LFxuICAgIHJ1bGVzOiBGQVJNX1JVTEVTLFxuICB9LCB7XG4gICAgdGFyZ2V0czogbTAwMkZhcm1UYXJnZXRzKCksXG4gICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuU09JTCxcbiAgICBlbnZlbG9wZTogW2xheW91dC5lbnZlbG9wZVsyXV0sXG4gIH0pO1xuICBpZiAoIWZhcm1QcmVwLm9rKSB7XG4gICAgZXJyb3JzLnB1c2goYGZhcm0gcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKGZhcm1QcmVwKX1gKTtcbiAgfSBlbHNlIHtcbiAgICBmYXJtLnByZXBhcmF0aW9uID0gZmFybVByZXAubGVkZ2VyO1xuICAgIGNvbnN0IGZhcm1CdWlsZCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCB7XG4gICAgICBzaXRlSWQ6IGxheW91dC5mYXJtLmlkLFxuICAgICAga2luZDogJ3RlcnJhY2UnLFxuICAgICAgcmVjdDogbGF5b3V0LmZhcm0ucmVjdCxcbiAgICAgIGZsb29yWTogMTUsXG4gICAgICB0ZXJyYWNlczogbGF5b3V0LmZhcm0udGVycmFjZXMsXG4gICAgfSk7XG4gICAgaWYgKCFmYXJtQnVpbGQub2spIHtcbiAgICAgIGVycm9ycy5wdXNoKGBmYXJtIHN0cnVjdHVyZTogJHtkZXNjcmliZUZhaWx1cmUoZmFybUJ1aWxkKX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmFybS5zdHJ1Y3R1cmUgPSBmYXJtQnVpbGQubGVkZ2VyO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgb2s6IGVycm9ycy5sZW5ndGggPT09IDAsXG4gICAgZXJyb3JzLFxuICAgIGhvdXNlLFxuICAgIHBhdGgsXG4gICAgZmFybSxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICBoYXNoZXM6IHtcbiAgICAgIHZveGVsczogY2Fub25pY2FsUmVnaW9uSGFzaCh3b3JsZCwgbGF5b3V0LnByb3RlY3RlZFJlZ2lvbikuaGFzaCxcbiAgICAgIHN0cnVjdHVyZXM6IGNhbm9uaWNhbFN0cnVjdHVyZUhhc2god29ybGQpLFxuICAgICAgaW52ZW50b3J5OiBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKHdvcmxkKSxcbiAgICAgIGVudGl0aWVzOiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkLCBsYXlvdXQucHJvdGVjdGVkUmVnaW9uKSxcbiAgICB9LFxuICB9O1xufVxuXG4vKiogVG90YWwgcmVzb3VyY2VzIHBhaWQgdG8gc3RydWN0dXJlcyBpbiBhIHNjZW5hcmlvIHJlc3VsdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyU3RydWN0dXJlQ29zdHMocmVzdWx0OiBNMDAyU2NlbmFyaW9SZXN1bHQpOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+IHtcbiAgY29uc3QgdG90YWw6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7fTtcbiAgZm9yIChjb25zdCBzaXRlIG9mIFtyZXN1bHQuaG91c2UsIHJlc3VsdC5wYXRoLCByZXN1bHQuZmFybV0pIHtcbiAgICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhzaXRlLnN0cnVjdHVyZT8uY29zdFBhaWQgPz8ge30pKSB7XG4gICAgICB0b3RhbFtyZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGVdID0gKHRvdGFsW3Jlc291cmNlIGFzIFJlc291cmNlVHlwZV0gPz8gMCkgKyAoYW1vdW50ID8/IDApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdG90YWw7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBS0EsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTs7O0FDRW5CLElBQU0sU0FBUyxvQkFBSSxRQUE2QjtBQWV6QyxTQUFTLGNBQWMsT0FBd0I7QUFDcEQsU0FBTyxPQUFPLElBQUksS0FBSyxHQUFHLFVBQVU7QUFDdEM7OztBQ1ZPLElBQU0sYUFBYTtBQUNuQixJQUFNLE9BQU8sYUFBYTtBQUMxQixJQUFNLGFBQWE7QUFDbkIsSUFBTSxrQkFBa0IsYUFBYTtBQUNyQyxJQUFNLFFBQVE7QUFDZCxJQUFNLFFBQVE7QUFDZCxJQUFNLGVBQWUsUUFBUTtBQUM3QixJQUFNLFlBQVk7QUFFbEIsSUFBTSxvQkFBb0I7QUFDMUIsSUFBTSxlQUFlLGFBQWEsYUFBYTtBQUMvQyxJQUFNLGFBQWEsYUFBYTtBQUVoQyxJQUFNLE1BQU07QUFBQSxFQUNqQixLQUFLO0FBQUEsRUFDTCxPQUFPO0FBQUEsRUFDUCxNQUFNO0FBQUEsRUFDTixNQUFNO0FBQUEsRUFDTixRQUFRO0FB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QU0sTUFBTTtBQUFBLEVBQ3BDLENBQUM7QUFDRCxVQUFRLEtBQUs7QUFBQSxJQUNYLE1BQU07QUFBQSxJQUFRLEdBQUc7QUFBQSxJQUFPLEdBQUc7QUFBQSxJQUFRLEdBQUc7QUFBQSxJQUN0QyxHQUFHO0FBQUEsSUFBTSxHQUFHO0FBQUEsSUFBTyxHQUFHO0FBQUEsSUFBTSxNQUFNO0FBQUEsRUFDcEMsQ0FBQztBQUNELFVBQVEsS0FBSztBQUFBLElBQ1gsTUFBTTtBQUFBLElBQWEsR0FBRyxLQUFLO0FBQUEsSUFBTSxHQUFHO0FBQUEsSUFBUSxHQUFHO0FBQUEsSUFDL0MsR0FBRztBQUFBLElBQUssR0FBRztBQUFBLElBQU0sR0FBRztBQUFBLElBQUssTUFBTTtBQUFBLEVBQ2pDLENBQUM7QUFHRCxhQUFXLE1BQU0sQ0FBQyxLQUFLLEtBQUssS0FBSyxHQUFHLEdBQUc7QUFDckMsWUFBUSxLQUFLO0FBQUEsTUFDWCxNQUFNO0FBQUEsTUFBVSxHQUFHO0FBQUEsTUFBSSxHQUFHLFNBQVM7QUFBQSxNQUFNLEdBQUcsS0FBSztBQUFBLE1BQ2pELEdBQUc7QUFBQSxNQUFLLEdBQUc7QUFBQSxNQUFLLEdBQUc7QUFBQSxNQUFNLE1BQU07QUFBQSxJQUNqQyxDQUFDO0FBQUEsRUFDSDtBQUdBLFVBQVEsS0FBSyxFQUFFLE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxTQUFTLFFBQVEsS0FBSyxHQUFHLEtBQUssTUFBTSxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsS0FBSyxNQUFNLFVBQVUsQ0FBQztBQUN2SCxVQUFRLEtBQUssRUFBRSxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsU0FBUyxRQUFRLEtBQUssR0FBRyxLQUFLLE1BQU0sR0FBRyxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssTUFBTSxVQUFVLENBQUM7QUFDdkgsVUFBUSxLQUFLLEVBQUUsTUFBTSxXQUFXLEdBQUcsS0FBSyxNQUFNLEdBQUcsU0FBUyxRQUFRLEtBQUssR0FBRyxJQUFJLEdBQUcsS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLE1BQU0sVUFBVSxDQUFDO0FBQ3ZILFVBQVEsS0FBSyxFQUFFLE1BQU0sV0FBVyxHQUFHLEtBQUssTUFBTSxHQUFHLFNBQVMsUUFBUSxLQUFLLEdBQUcsSUFBSSxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsS0FBSyxNQUFNLFVBQVUsQ0FBQztBQUV2SCxRQUFNLE9BQXNCO0FBQUEsSUFDMUIsSUFBSTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sUUFBUSxTQUFTO0FBQUEsSUFDakI7QUFBQSxJQUNBO0FBQUEsSUFDQSxRQUFRLEVBQUUsR0FBRyxJQUFJLEdBQUcsUUFBUSxHQUFHLEdBQUc7QUFBQSxJQUNsQyxLQUFLO0FBQUEsSUFDTDtBQUFBLElBQ0EsTUFBTSxFQUFFLEdBQUcsV0FBVztBQUFBLElBQ3RCLFVBQVUsa0JBQWtCLE1BQU0sUUFBUSxTQUFTLEdBQUcsQ0FBQztBQUFBLElBQ3ZEO0FBQUEsRUFDRjtBQUNBLE9BQUssS0FBSyxhQUFhLGdCQUFnQixJQUFJLENBQUM7QUFDNUMsU0FBTyxFQUFFLElBQUksTUFBTSxLQUFLO0FBQzFCO0FBR0EsU0FBUyxTQUFTLE9BQWMsVUFBa0Q7QUFDaEYsUUFBTSxPQUFPLGNBQWMsU0FBUyxJQUFJO0FBQ3hDLFFBQU0sUUFBUSxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQ2xDLFFBQU0sUUFBUSxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQ2xDLE1BQUksVUFBVSxLQUFLLFFBQVEsR0FBRztBQUM1QixXQUFPQSxNQUFLLFFBQVEsc0JBQXNCLENBQUMsdUNBQXVDLEtBQUssTUFBTSxLQUFLLElBQUksQ0FBQztBQUFBLEVBQ3pHO0FBRUEsUUFBTSxVQUFVLEtBQUssS0FBSztBQUMxQixRQUFNLFVBQTJCLENBQUM7QUFDbEMsUUFBTSxVQUFvQixDQUFDO0FBQzNCLFdBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksS0FBSztBQUN2QyxVQUFNLElBQUksVUFBVSxPQUFPLEdBQUcsT0FBTztBQUNyQyxZQUFRLEtBQUssQ0FBQztBQUNkLGFBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksSUFBSyxTQUFRLEtBQUssRUFBRSxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsRUFDbkU7QUFDQSxRQUFNLGFBQWEsa0JBQWtCLE9BQU8sT0FBTztBQUNuRCxNQUFJLFdBQVcsU0FBUyxHQUFHO0FBQ3pCLFdBQU9BLE1BQUssUUFBUSxxQkFBcUIsV0FBVyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQUEsTUFDOUQsQ0FBQyxNQUFNLFVBQVUsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxNQUFNLGNBQWMsRUFBRSxRQUFRO0FBQUEsSUFDdkUsQ0FBQztBQUFBLEVBQ0g7QUFDQSxXQUFTLElBQUksR0FBRyxJQUFJLFFBQVEsUUFBUSxLQUFLO0FBQ3ZDLFVBQU0sT0FBTyxRQUFRLENBQUMsSUFBSSxRQUFRLElBQUksQ0FBQztBQUN2QyxRQUFJLEtBQUssSUFBSSxJQUFJLElBQUksR0FBRztBQUN0QixhQUFPQSxNQUFLLFFBQVEsYUFBYSxDQUFDLFFBQVEsSUFBSSxXQUFXLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQ3pFO0FBQUEsRUFDRjtBQUNBLGFBQVcsS0FBSyxTQUFTO0FBQ3ZCLFVBQU0sTUFBTSxTQUFTLE9BQU8sRUFBRSxHQUFHLEVBQUUsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUM3QyxRQUFJLFFBQVEsSUFBSSxPQUFPO0FBQ3JCLGFBQU9BLE1BQUssUUFBUSxZQUFZLENBQUMsVUFBVSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDO0FBQUEsSUFDakU7QUFDQSxRQUFJLFFBQVEsSUFBSSxRQUFRO0FBQ3RCLGFBQU9BLE1BQUssUUFBUSxnQkFBZ0I7QUFBQSxRQUNsQyxVQUFVLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxXQUFXLEdBQUc7QUFBQSxNQUNwQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Y7QUFDQSxRQUFNLGVBQWUsZUFBZSxPQUFPLElBQUk7QUFDL0MsTUFBSSxhQUFhLFNBQVMsR0FBRztBQUMzQixXQUFPQSxNQUFLLFFBQVEsbUJBQW1CLGFBQWEsSUFBSSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUM7QUFBQSxFQUM1RTtBQUVBLFFBQU0sS0FBSyxVQUFVO0FBQ3JCLFFBQU0sVUFBNkIsQ0FBQztBQUNwQyxXQUFTLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFDdkMsVUFBTSxJQUFJLFVBQVUsT0FBTyxHQUFHLE9BQU87QUFDckMsVUFBTSxLQUFLLElBQUk7QUFDZixZQUFRLEtBQUssRUFBRSxNQUFNLFFBQVEsR0FBRyxJQUFJLEdBQUcsR0FBRyxJQUFJLEdBQUcsR0FBSyxHQUFHLE1BQU0sR0FBRyxHQUFLLE1BQU0sU0FBUyxDQUFDO0FBQ3ZGLFlBQVEsS0FBSyxFQUFFLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxHQUFHLEtBQUssS0FBSyxPQUFPLEdBQUcsR0FBSyxHQUFHLE1BQU0sR0FBRyxNQUFNLE1BQU0sVUFBVSxDQUFDO0FBQ3RHLFlBQVEsS0FBSyxFQUFFLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxHQUFHLEtBQUssS0FBSyxJQUFJLE9BQU8sR0FBRyxHQUFLLEdBQUcsTUFBTSxHQUFHLE1BQU0sTUFBTSxVQUFVLENBQUM7QUFBQSxFQUM1RztBQUVBLFFBQU0sT0FBTyxLQUFLLElBQUksR0FBRyxPQUFPO0FBQ2hDLFFBQU0sT0FBTyxLQUFLLElBQUksR0FBRyxPQUFPO0FBQ2hDLFFBQU0sT0FBc0I7QUFBQSxJQUMxQixJQUFJO0FBQUEsSUFDSixNQUFNO0FBQUEsSUFDTixRQUFRLFNBQVM7QUFBQSxJQUNqQjtBQUFBLElBQ0EsUUFBUSxTQUFTO0FBQUEsSUFDakIsUUFBUSxFQUFFLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEdBQUcsR0FBRyxNQUFNLEdBQUcsR0FBRztBQUFBLElBQ3pELEtBQUs7QUFBQSxJQUNMO0FBQUEsSUFDQSxNQUFNLFNBQVMsS0FBSztBQUFBLElBQ3BCLFVBQVUsa0JBQWtCLE1BQU0sT0FBTyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQUEsSUFDdkQ7QUFBQSxFQUNGO0FBQ0EsT0FBSyxLQUFLLGFBQWEsZ0JBQWdCLElBQUksQ0FBQztBQUM1QyxTQUFPLEVBQUUsSUFBSSxNQUFNLEtBQUs7QUFDMUI7QUFHQSxTQUFTLGFBQWEsT0FBYyxVQUFrRDtBQUNwRixRQUFNLE9BQU8sY0FBYyxTQUFTLElBQUk7QUFDeEMsUUFBTSxRQUFRLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFDbEMsUUFBTSxRQUFRLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFDbEMsUUFBTSxRQUFRLFNBQVMsWUFBWTtBQUNuQyxNQUFJLFVBQVUsTUFBTSxVQUFVLEdBQUc7QUFDL0IsV0FBT0EsTUFBSyxRQUFRLHNCQUFzQixDQUFDLCtCQUErQixLQUFLLE1BQU0sS0FBSyxJQUFJLENBQUM7QUFBQSxFQUNqRztBQUNBLE1BQUksUUFBUSxLQUFLLFFBQVEsR0FBRztBQUMxQixXQUFPQSxNQUFLLFFBQVEsaUJBQWlCLENBQUMsR0FBRyxLQUFLLDJCQUEyQixDQUFDO0FBQUEsRUFDNUU7QUFHQSxRQUFNLE9BQU8sS0FBSyxNQUFNLFFBQVEsS0FBSztBQUNyQyxRQUFNLFFBQVEsUUFBUTtBQUN0QixRQUFNLFFBQXVCLENBQUM7QUFDOUIsTUFBSSxJQUFJLEtBQUs7QUFDYixRQUFNLFVBQW9CLENBQUM7QUFDM0IsV0FBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLEtBQUs7QUFDOUIsVUFBTSxPQUFPLFFBQVEsSUFBSSxRQUFRLElBQUk7QUFDckMsVUFBTSxLQUFLLEdBQUcsS0FBSyxJQUFJLE9BQU87QUFDOUIsVUFBTSxTQUFtQixDQUFDO0FBQzFCLGFBQVMsS0FBSyxJQUFJLE1BQU0sSUFBSSxNQUFNO0FBQ2hDLGVBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksSUFBSyxRQUFPLEtBQUssVUFBVSxPQUFPLEdBQUcsRUFBRSxDQUFDO0FBQUEsSUFDOUU7QUFDQSxZQUFRLEtBQUssT0FBTyxNQUFNLENBQUM7QUFDM0IsVUFBTSxLQUFLLEVBQUUsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQzNCLFFBQUksS0FBSztBQUFBLEVBQ1g7QUFFQSxXQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ3JDLFVBQU0sQ0FBQyxFQUFFLElBQUksTUFBTSxJQUFJLFFBQVEsQ0FBQyxJQUFJLEtBQUssSUFBSSxRQUFRLENBQUMsR0FBRyxNQUFNLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQztBQUFBLEVBQzdFO0FBRUEsTUFBSSxTQUFTLEdBQUcsVUFBVSxHQUFHLFlBQVksR0FBRyxhQUFhO0FBQ3pELFFBQU0sVUFBMkIsQ0FBQztBQUNsQyxhQUFXLEtBQUssT0FBTztBQUNyQixhQUFTLEtBQUssRUFBRSxJQUFJLE1BQU0sRUFBRSxJQUFJLE1BQU07QUFDcEMsZUFBUyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3ZDLGNBQU0sSUFBSSxVQUFVLE9BQU8sR0FBRyxFQUFFO0FBQ2hDLGdCQUFRLEtBQUssRUFBRSxHQUFHLEdBQUcsSUFBSSxHQUFHLEVBQUUsRUFBRSxDQUFDO0FBQ2pDLGNBQU0sSUFBSSxJQUFJLEVBQUU7QUFDaEIsWUFBSSxJQUFJLEdBQUc7QUFBRSx1QkFBYTtBQUFHLG1CQUFTLEtBQUssSUFBSSxRQUFRLENBQUM7QUFBQSxRQUFHO0FBQzNELFlBQUksSUFBSSxHQUFHO0FBQUUsd0JBQWMsQ0FBQztBQUFHLG9CQUFVLEtBQUssSUFBSSxTQUFTLENBQUMsQ0FBQztBQUFBLFFBQUc7QUFBQSxNQUNsRTtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0EsTUFBSSxTQUFTLFdBQVcsVUFBVSxVQUFVLFdBQVcsV0FDbEQsWUFBWSxXQUFXLGdCQUFnQixhQUFhLFdBQVcsZUFBZTtBQUNqRixXQUFPQSxNQUFLLFFBQVEscUJBQXFCO0FBQUEsTUFDdkMsT0FBTyxTQUFTLGlCQUFjLFVBQVUsZUFBWSxNQUFNLElBQUksT0FBTztBQUFBLElBQ3ZFLENBQUM7QUFBQSxFQUNIO0FBQ0EsUUFBTSxhQUFhLGtCQUFrQixPQUFPLE9BQU87QUFDbkQsTUFBSSxXQUFXLFNBQVMsR0FBRztBQUN6QixXQUFPQSxNQUFLLFFBQVEscUJBQXFCLFdBQVcsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUFBLE1BQzlELENBQUMsTUFBTSxVQUFVLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLEVBQUUsTUFBTSxjQUFjLEVBQUUsUUFBUTtBQUFBLElBQ3ZFLENBQUM7QUFBQSxFQUNIO0FBQ0EsUUFBTSxlQUFlLGVBQWUsT0FBTyxJQUFJO0FBQy9DLE1BQUksYUFBYSxTQUFTLEdBQUc7QUFDM0IsV0FBT0EsTUFBSyxRQUFRLG1CQUFtQixhQUFhLElBQUksQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDO0FBQUEsRUFDNUU7QUFDQSxhQUFXLEtBQUssU0FBUztBQUN2QixVQUFNLE1BQU0sU0FBUyxPQUFPLEVBQUUsR0FBRyxFQUFFLElBQUksR0FBRyxFQUFFLENBQUM7QUFDN0MsUUFBSSxRQUFRLElBQUksTUFBTTtBQUNwQixhQUFPQSxNQUFLLFFBQVEsbUJBQW1CO0FBQUEsUUFDckMsVUFBVSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsV0FBVyxHQUFHO0FBQUEsTUFDcEMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNGO0FBRUEsUUFBTSxNQUFNLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSztBQUNyQyxRQUFNLFVBQTZCLENBQUM7QUFDcEMsYUFBVyxLQUFLLE9BQU87QUFDckIsVUFBTSxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssS0FBSztBQUMvQixZQUFRLEtBQUs7QUFBQSxNQUNYLE1BQU07QUFBQSxNQUFZLEdBQUc7QUFBQSxNQUFJLEdBQUcsRUFBRTtBQUFBLE1BQUcsR0FBRztBQUFBLE1BQ3BDLEdBQUc7QUFBQSxNQUFPLEdBQUc7QUFBQSxNQUFNLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSztBQUFBLE1BQUcsTUFBTTtBQUFBLElBQy9DLENBQUM7QUFFRCxVQUFNLFdBQVcsRUFBRSxLQUFLLEVBQUUsS0FBSztBQUMvQixhQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMxQixZQUFNLEtBQUssSUFBSSxLQUFLO0FBQ3BCLGNBQVEsS0FBSztBQUFBLFFBQ1gsTUFBTTtBQUFBLFFBQVksR0FBRztBQUFBLFFBQUksR0FBRyxFQUFFLElBQUk7QUFBQSxRQUFNLEdBQUcsRUFBRSxLQUFLLFdBQVc7QUFBQSxRQUM3RCxHQUFHLFFBQVE7QUFBQSxRQUFLLEdBQUc7QUFBQSxRQUFNLEdBQUc7QUFBQSxRQUFNLE1BQU07QUFBQSxNQUMxQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Y7QUFDQSxXQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ3JDLFVBQU0sUUFBUSxNQUFNLElBQUksQ0FBQztBQUN6QixVQUFNLFFBQVEsTUFBTSxDQUFDO0FBQ3JCLFlBQVEsS0FBSztBQUFBLE1BQ1gsTUFBTTtBQUFBLE1BQWtCLEdBQUc7QUFBQSxNQUFJLEdBQUcsTUFBTTtBQUFBLE1BQUcsR0FBRyxNQUFNLEtBQUs7QUFBQSxNQUN6RCxHQUFHO0FBQUEsTUFBTyxHQUFHLE1BQU0sSUFBSSxNQUFNO0FBQUEsTUFBRyxHQUFHO0FBQUEsTUFBSyxNQUFNO0FBQUEsSUFDaEQsQ0FBQztBQUFBLEVBQ0g7QUFFQSxRQUFNLE9BQU8sS0FBSyxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUM5QyxRQUFNLE9BQU8sS0FBSyxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUM5QyxRQUFNLE9BQXNCO0FBQUEsSUFDMUIsSUFBSTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sUUFBUSxTQUFTO0FBQUEsSUFDakI7QUFBQSxJQUNBLFFBQVEsU0FBUztBQUFBLElBQ2pCLFFBQVEsRUFBRSxHQUFHLElBQUksR0FBRyxNQUFNLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEVBQUU7QUFBQSxJQUN6RCxLQUFLO0FBQUEsSUFDTDtBQUFBLElBQ0EsTUFBTSxFQUFFLEdBQUcsYUFBYTtBQUFBLElBQ3hCLFVBQVUsa0JBQWtCLE1BQU0sT0FBTyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQUEsSUFDdkQ7QUFBQSxJQUNBLFVBQVU7QUFBQSxFQUNaO0FBQ0EsT0FBSyxLQUFLLGFBQWEsZ0JBQWdCLElBQUksQ0FBQztBQUM1QyxTQUFPLEVBQUUsSUFBSSxNQUFNLEtBQUs7QUFDMUI7QUFFTyxTQUFTLGNBQWMsT0FBYyxVQUFrRDtBQUM1RixNQUFJLFNBQVMsa0JBQWtCLHVCQUF3QixRQUFPLGtCQUFrQixPQUFPLFFBQVE7QUFDL0YsTUFBSSxTQUFTLGtCQUFrQixRQUFXO0FBQ3hDLFdBQU9BLE1BQUssUUFBUSxzQkFBc0IsQ0FBQyxnQ0FBZ0MsT0FBTyxTQUFTLGFBQWEsQ0FBQyxFQUFFLENBQUM7QUFBQSxFQUM5RztBQUNBLE1BQUksU0FBUyxTQUFTLFFBQVMsUUFBTyxVQUFVLE9BQU8sUUFBUTtBQUMvRCxNQUFJLFNBQVMsU0FBUyxPQUFRLFFBQU8sU0FBUyxPQUFPLFFBQVE7QUFDN0QsU0FBTyxhQUFhLE9BQU8sUUFBUTtBQUNyQztBQU1BLFNBQVMsa0JBQWtCLE9BQWMsVUFBa0Q7QUFDekYsTUFBSSxTQUFTLFNBQVMsT0FBUSxRQUFPLGdCQUFnQixPQUFPLFFBQVE7QUFDcEUsUUFBTSxVQUFVLFNBQVMsU0FBUyxVQUFVLFVBQVUsT0FBTyxRQUFRLElBQUksYUFBYSxPQUFPLFFBQVE7QUFDckcsTUFBSSxDQUFDLFFBQVEsR0FBSSxRQUFPO0FBQ3hCLE1BQUksU0FBUyxTQUFTLFdBQVc7QUFHL0IsWUFBUSxLQUFLLGdCQUFnQjtBQUM3QixZQUFRLEtBQUssS0FBSyxhQUFhLGdCQUFnQixRQUFRLElBQUksQ0FBQztBQUM1RCxXQUFPO0FBQUEsRUFDVDtBQUNBLFFBQU0sT0FBTyxjQUFjLFNBQVMsSUFBSTtBQUN4QyxRQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLO0FBQ25DLFFBQU0sS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUs7QUFDbkMsUUFBTSxJQUFJLFNBQVMsUUFBUSxNQUFNLEtBQUssTUFBTSxHQUFHLE1BQU0sS0FBSyxNQUFNO0FBQ2hFLFFBQU0sSUFBSSxLQUFLLElBQUk7QUFDbkIsUUFBTSxVQUE2QixDQUFDO0FBRXBDLFFBQU0sT0FBTyxDQUFDLEdBQVcsUUFBZ0IsR0FBVyxHQUFXLFFBQWdCLEdBQVcsT0FBZ0MsV0FBVztBQUNuSSxZQUFRLEtBQUssRUFBRSxNQUFNLEdBQUcsR0FBRyxRQUFRLEdBQUcsR0FBRyxHQUFHLFFBQVEsR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUFBLEVBQ3hFO0FBQ0EsT0FBSyxJQUFJLElBQUksS0FBSyxJQUFJLEdBQUcsS0FBSyxHQUFHLE9BQU87QUFDeEMsT0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDL0IsUUFBTSxVQUFVLEtBQUssR0FBRyxVQUFVLEtBQUs7QUFDdkMsT0FBSyxLQUFLLElBQUksR0FBRyxJQUFJLFVBQVUsV0FBVyxHQUFHLEdBQUcsR0FBRyxVQUFVLE9BQU87QUFDcEUsUUFBTSxTQUFTLFNBQVMsTUFBTSxLQUFLLEtBQUssTUFBTTtBQUM5QyxRQUFNLFFBQVEsUUFBUSxLQUFLLFFBQVEsUUFBUTtBQUMzQyxRQUFNLFFBQVEsS0FBSyxJQUFJO0FBQ3ZCLE9BQUssT0FBTyxJQUFJLFVBQVUsU0FBUyxHQUFHLEdBQUcsR0FBRyxRQUFRLE9BQU87QUFDM0QsT0FBSyxPQUFPLElBQUksUUFBUSxXQUFXLEdBQUcsR0FBRyxHQUFHLFVBQVUsS0FBSztBQUMzRCxPQUFLLE9BQU8sSUFBSSxLQUFLLE9BQU8sR0FBRyxLQUFLLEtBQUssUUFBUTtBQUNqRCxPQUFLLE9BQU8sSUFBSSxLQUFLLE9BQU8sR0FBRyxLQUFLLEdBQUc7QUFDdkMsUUFBTSxTQUFTLEtBQUssSUFBSTtBQUN4QixhQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssR0FBRyxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssS0FBSyxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssS0FBSyxLQUFLLENBQUMsQ0FBQyxHQUFHO0FBQ25GLFVBQU0sSUFBSSxLQUFLLEdBQUcsR0FBRyxRQUFRLElBQUksR0FBRyxHQUFHLENBQUM7QUFBQSxFQUMxQztBQUNBLGFBQVcsTUFBTSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsR0FBRztBQUNqQyxTQUFLLElBQUksR0FBRyxRQUFRLEtBQUssR0FBRyxDQUFDO0FBQzdCLFNBQUssSUFBSSxJQUFJLEtBQUssUUFBUSxLQUFLLEtBQUssR0FBRyxRQUFRO0FBQUEsRUFDakQ7QUFDQSxPQUFLLElBQUksSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLLEdBQUcsTUFBTTtBQUNyQyxPQUFLLElBQUksSUFBSSxJQUFJLEtBQUssS0FBSyxNQUFNLEdBQUcsS0FBSyxLQUFLLFNBQVM7QUFDdkQsT0FBSyxJQUFJLElBQUksSUFBSSxLQUFLLEtBQUssTUFBTSxHQUFHLEtBQUssS0FBSyxTQUFTO0FBQ3ZELE9BQUssS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUssU0FBUztBQUN6RCxPQUFLLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLLFNBQVM7QUFDekQsVUFBUSxLQUFLLFVBQVU7QUFDdkIsVUFBUSxLQUFLLGdCQUFnQjtBQUM3QixVQUFRLEtBQUssV0FBVyxrQkFBa0IsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUM7QUFDL0QsVUFBUSxLQUFLLEtBQUssYUFBYSxnQkFBZ0IsUUFBUSxJQUFJLENBQUM7QUFDNUQsU0FBTztBQUNUO0FBRUEsU0FBUyxnQkFBZ0IsT0FBYyxVQUFrRDtBQUN2RixRQUFNLFVBQVUsU0FBUyxPQUFPLFFBQVE7QUFDeEMsTUFBSSxDQUFDLFFBQVEsR0FBSSxRQUFPO0FBQ3hCLFFBQU0sVUFBNkIsQ0FBQztBQUNwQyxRQUFNLFVBQVUsUUFBUSxLQUFLLFFBQVEsT0FBTyxDQUFDLE1BQU0sRUFBRSxTQUFTLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7QUFDcEYsUUFBTSxLQUFLLFFBQVEsS0FBSyxLQUFLLElBQUksS0FBSyxRQUFRLEtBQUssS0FBSyxLQUFLO0FBQzdELE1BQUksUUFBUTtBQUNaLFdBQVMsTUFBTSxHQUFHLE9BQU8sUUFBUSxRQUFRLE9BQU87QUFDOUMsUUFBSSxNQUFNLFFBQVEsVUFBVSxRQUFRLEdBQUcsTUFBTSxRQUFRLEtBQUssRUFBRztBQUM3RCxVQUFNLElBQUksUUFBUSxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsTUFBTTtBQUN0RCxVQUFNLEtBQUssSUFBSSxRQUFRLEdBQUcsSUFBSSxRQUFRLEtBQUs7QUFDM0MsWUFBUSxLQUFLLEVBQUUsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLElBQUksS0FBSyxNQUFNLEdBQUcsR0FBRyxPQUFPLEdBQUcsTUFBTSxHQUFHLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFDbEcsZUFBVyxLQUFLLENBQUMsS0FBSyxPQUFPLEtBQUssS0FBSyxHQUFHO0FBQ3hDLGNBQVEsS0FBSyxFQUFFLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLE1BQU0sR0FBRyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQUEsSUFDdkY7QUFDQSxZQUFRO0FBQUEsRUFDVjtBQUNBLFVBQVEsS0FBSyxVQUFVO0FBQ3ZCLFVBQVEsS0FBSyxnQkFBZ0I7QUFDN0IsVUFBUSxLQUFLLEtBQUssYUFBYSxnQkFBZ0IsUUFBUSxJQUFJLENBQUM7QUFDNUQsU0FBTztBQUNUO0FBU08sSUFBTSwyQkFBNEM7QUFBQSxFQUN2RCxZQUFZO0FBQUEsRUFDWixTQUFTO0FBQ1g7QUFrQk8sSUFBTSwyQkFBTixNQUErQjtBQUFBLEVBS3BDLFlBQXFCLFFBQTZCLFNBQW1DLENBQUMsR0FBRztBQUFwRTtBQUNuQixTQUFLLFNBQVMsRUFBRSxHQUFHLDBCQUEwQixHQUFHLE9BQU87QUFBQSxFQUN6RDtBQUFBLEVBRnFCO0FBQUEsRUFKWixZQUFZO0FBQUEsRUFDWixjQUFjO0FBQUEsRUFDZDtBQUFBLEVBTVQsVUFBVSxPQUFjLE1BQXdDO0FBQzlELFVBQU0sVUFBb0IsQ0FBQztBQUMzQixRQUFJLEtBQUssUUFBUSxXQUFXLEVBQUcsU0FBUSxLQUFLLHFCQUFxQjtBQUNqRSxRQUFJLEtBQUssUUFBUSxTQUFTLEtBQUssT0FBTyxZQUFZO0FBQ2hELGNBQVEsS0FBSyxHQUFHLEtBQUssUUFBUSxNQUFNLHlCQUF5QixLQUFLLE9BQU8sVUFBVSxFQUFFO0FBQUEsSUFDdEY7QUFDQSxRQUFJLFVBQVUsS0FBSyxJQUFJLElBQUksS0FBSyxPQUFPLFNBQVM7QUFDOUMsY0FBUSxLQUFLLFFBQVEsVUFBVSxLQUFLLElBQUksQ0FBQyxrQkFBa0IsS0FBSyxPQUFPLE9BQU8sRUFBRTtBQUFBLElBQ2xGO0FBQ0EsZUFBVyxDQUFDLFVBQVUsTUFBTSxLQUFLLE9BQU8sUUFBUSxLQUFLLElBQUksR0FBRztBQUMxRCxVQUFJLENBQUMsT0FBTyxVQUFVLE1BQU0sTUFBTSxVQUFVLEtBQUssR0FBRztBQUNsRCxnQkFBUSxLQUFLLFFBQVEsUUFBUSxJQUFJLE1BQU0sZ0NBQWdDO0FBQUEsTUFDekU7QUFBQSxJQUNGO0FBQ0EsUUFBSSxLQUFLLFNBQVMsV0FBVyxFQUFHLFNBQVEsS0FBSywyQkFBMkI7QUFDeEUsZUFBVyxVQUFVLEtBQUssVUFBVTtBQUNsQyxVQUFJLENBQUMsS0FBSyxPQUFPLFNBQVMsS0FBSyxDQUFDLE1BQU0sT0FBTyxNQUFNLEVBQUUsTUFBTSxPQUFPLE1BQU0sRUFBRSxNQUNyRSxPQUFPLE1BQU0sRUFBRSxNQUFNLE9BQU8sTUFBTSxFQUFFLE1BQ3BDLE9BQU8sTUFBTSxFQUFFLE1BQU0sT0FBTyxNQUFNLEVBQUUsRUFBRSxHQUFHO0FBQzVDLGdCQUFRLEtBQUssWUFBWSxPQUFPLEVBQUUsSUFBSSxPQUFPLEVBQUUsSUFBSSxPQUFPLEVBQUUsS0FBSyxPQUFPLEVBQUUsSUFBSSxPQUFPLEVBQUUsSUFBSSxPQUFPLEVBQUUsOEJBQThCO0FBQUEsTUFDcEk7QUFBQSxJQUNGO0FBQ0EsZUFBVyxLQUFLLEtBQUssU0FBUztBQUM1QixVQUFJLENBQUMscUJBQXFCLEdBQUcsS0FBSyxRQUFRLEdBQUc7QUFDM0MsZ0JBQVEsS0FBSyxVQUFVLEVBQUUsSUFBSSxPQUFPLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQywrQkFBK0I7QUFBQSxNQUN0RjtBQUFBLElBQ0Y7QUFDQSxRQUFJLEtBQUssUUFBUSxXQUFXLEVBQUcsU0FBUSxLQUFLLDZCQUE2QjtBQUN6RSxlQUFXLEtBQUssS0FBSyxTQUFTO0FBQzVCLFVBQUksQ0FBQyxpQkFBaUIsS0FBSyxVQUFVLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUc7QUFDbkQsZ0JBQVEsS0FBSyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQywrQkFBK0I7QUFBQSxNQUMxRTtBQUFBLElBQ0Y7QUFDQSxRQUFJLFFBQVEsU0FBUyxFQUFHLFFBQU8sRUFBRSxJQUFJLE9BQU8sZUFBZSxNQUFNLFFBQVE7QUFFekUsVUFBTSxRQUFnQztBQUFBLE1BQ3BDLElBQUksd0JBQXdCLGdCQUFnQixJQUFJLENBQUM7QUFBQSxNQUNqRCxXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsTUFDYixZQUFZLGdCQUFnQixJQUFJO0FBQUEsTUFDaEMsVUFBVSxLQUFLLFNBQVMsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUUsRUFBRTtBQUFBLE1BQzdDLGNBQWMsTUFBTTtBQUFBLE1BQ3BCLFFBQVEsRUFBRSxHQUFHLEtBQUssT0FBTztBQUFBLElBQzNCO0FBQ0EsV0FBTyxFQUFFLElBQUksTUFBTSxlQUFlLE9BQU8sU0FBUyxDQUFDLEVBQUU7QUFBQSxFQUN2RDtBQUNGO0FBNEJPLFNBQVMsaUJBQ2QsT0FBYyxNQUFxQixlQUNqQjtBQUNsQixNQUFJLGNBQWMsY0FBYyxtQkFDM0IsY0FBYyxnQkFBZ0IsbUJBQW1CO0FBQ3BELFdBQU9BLE1BQUssV0FBVyx5QkFBeUI7QUFBQSxNQUM5QyxhQUFhLGNBQWMsU0FBUyxJQUFJLGNBQWMsV0FBVztBQUFBLElBQ25FLENBQUM7QUFBQSxFQUNIO0FBQ0EsTUFBSSxjQUFjLGVBQWUsZ0JBQWdCLElBQUksR0FBRztBQUN0RCxXQUFPQSxNQUFLLFdBQVcsbUJBQW1CLENBQUMsa0RBQWtELENBQUM7QUFBQSxFQUNoRztBQUNBLE1BQUksY0FBYyxpQkFBaUIsTUFBTSxVQUFVO0FBQ2pELFdBQU9BLE1BQUssV0FBVyx1QkFBdUI7QUFBQSxNQUM1Qyx3Q0FBd0MsY0FBYyxZQUFZLGlCQUFpQixNQUFNLFFBQVE7QUFBQSxJQUNuRyxDQUFDO0FBQUEsRUFDSDtBQUNBLE1BQUksS0FBSyxTQUFTLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxTQUFTLEtBQUssQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQ3ZFLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDLEdBQUc7QUFDbkYsV0FBT0EsTUFBSyxXQUFXLHFCQUFxQixDQUFDLCtDQUErQyxDQUFDO0FBQUEsRUFDL0Y7QUFFQSxRQUFNLFVBQW9CLENBQUM7QUFDM0IsYUFBVyxLQUFLLEtBQUssU0FBUztBQUM1QixRQUFJLENBQUMscUJBQXFCLEdBQUcsY0FBYyxRQUFRLEdBQUc7QUFDcEQsY0FBUSxLQUFLLFVBQVUsRUFBRSxJQUFJLE9BQU8sRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLHFDQUFxQztBQUFBLElBQzVGO0FBQUEsRUFDRjtBQUNBLFFBQU0sYUFBYSxrQkFBa0IsT0FBTyxLQUFLLE9BQU87QUFDeEQsTUFBSSxXQUFXLFNBQVMsR0FBRztBQUN6QixZQUFRLEtBQUssR0FBRyxXQUFXLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFBQSxNQUNyQyxDQUFDLE1BQU0sVUFBVSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxFQUFFLE1BQU0sY0FBYyxFQUFFLFFBQVE7QUFBQSxJQUN2RSxDQUFDO0FBQUEsRUFDSDtBQUNBLFFBQU0sZUFBZSxlQUFlLE9BQU8sS0FBSyxJQUFJO0FBQ3BELE1BQUksYUFBYSxTQUFTLEdBQUc7QUFDM0IsWUFBUSxLQUFLLGlCQUFpQixhQUFhLE1BQU0sZUFBZTtBQUFBLEVBQ2xFO0FBQ0EsTUFBSSxNQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsR0FBRztBQUNqQyxZQUFRLEtBQUssYUFBYSxLQUFLLEVBQUUsaUJBQWlCO0FBQUEsRUFDcEQ7QUFDQSxhQUFXLENBQUMsVUFBVSxNQUFNLEtBQUssT0FBTyxRQUFRLEtBQUssSUFBSSxHQUFHO0FBQzFELFVBQU0sT0FBTyxNQUFNLFVBQVUsUUFBUSxLQUFLO0FBQzFDLFFBQUksUUFBUSxVQUFVLElBQUk7QUFDeEIsY0FBUSxLQUFLLFFBQVEsTUFBTSxJQUFJLFFBQVEsVUFBVSxJQUFJLEVBQUU7QUFBQSxJQUN6RDtBQUFBLEVBQ0Y7QUFDQSxNQUFJLFFBQVEsU0FBUyxFQUFHLFFBQU9BLE1BQUssV0FBVywwQkFBMEIsT0FBTztBQUVoRixRQUFNLGtCQUFrQixrQkFBa0IsS0FBSztBQUMvQyxRQUFNLGlCQUFpQixNQUFNO0FBQzdCLGFBQVcsQ0FBQyxVQUFVLE1BQU0sS0FBSyxPQUFPLFFBQVEsS0FBSyxJQUFJLEdBQUc7QUFDMUQsVUFBTSxRQUFRLE1BQU0sVUFBVSxRQUFRLEtBQUssTUFBTSxVQUFVO0FBQzNELFFBQUksT0FBTyxFQUFHLE9BQU0sVUFBVSxRQUFRLElBQUk7QUFBQSxRQUNyQyxRQUFPLE1BQU0sVUFBVSxRQUFRO0FBQUEsRUFDdEM7QUFFQSxRQUFNO0FBQ04sUUFBTSxZQUF1QjtBQUFBLElBQzNCLElBQUksS0FBSztBQUFBLElBQ1QsTUFBTSxLQUFLO0FBQUEsSUFDWCxRQUFRLEtBQUs7QUFBQSxJQUNiLEdBQUcsS0FBSyxPQUFPO0FBQUEsSUFDZixHQUFHLEtBQUssT0FBTztBQUFBLElBQ2YsR0FBRyxLQUFLLE9BQU87QUFBQSxJQUNmLEtBQUssS0FBSztBQUFBLElBQ1YsU0FBUyxLQUFLLFFBQVEsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUUsRUFBRTtBQUFBLElBQzNDLE1BQU0sRUFBRSxHQUFHLEtBQUssS0FBSztBQUFBLElBQ3JCLGVBQWUsTUFBTTtBQUFBLElBQ3JCLEdBQUksS0FBSyxrQkFBa0IseUJBQXlCLEVBQUUsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBQUEsSUFDakcsYUFBYTtBQUFBLEVBQ2Y7QUFDQSxRQUFNLFdBQVcsSUFBSSxVQUFVLElBQUksU0FBUztBQUU1QyxRQUFNLFNBQTBCO0FBQUEsSUFDOUIsV0FBVztBQUFBLElBQ1gsYUFBYTtBQUFBLElBQ2IsaUJBQWlCLGNBQWM7QUFBQSxJQUMvQixZQUFZLGNBQWM7QUFBQSxJQUMxQixhQUFhLFVBQVU7QUFBQSxJQUN2QixRQUFRLEtBQUs7QUFBQSxJQUNiLE1BQU0sS0FBSztBQUFBLElBQ1gsYUFBYSxVQUFVLFFBQVE7QUFBQSxJQUMvQixVQUFVLEVBQUUsR0FBRyxLQUFLLEtBQUs7QUFBQSxJQUN6QjtBQUFBLElBQ0EsZ0JBQWdCLGtCQUFrQixLQUFLO0FBQUEsSUFDdkM7QUFBQSxJQUNBLGVBQWUsTUFBTTtBQUFBLEVBQ3ZCO0FBQ0EsU0FBTyxFQUFFLElBQUksTUFBTSxNQUFNLGVBQWUsT0FBTztBQUNqRDtBQUtPLFNBQVMsZUFDZCxPQUNBLFlBQ0EsVUFDa0I7QUFDbEIsUUFBTSxVQUFVLGNBQWMsT0FBTyxRQUFRO0FBQzdDLE1BQUksQ0FBQyxRQUFRLEdBQUksUUFBTztBQUN4QixRQUFNLFdBQVcsV0FBVyxVQUFVLE9BQU8sUUFBUSxJQUFJO0FBQ3pELE1BQUksQ0FBQyxTQUFTLE1BQU0sQ0FBQyxTQUFTLGVBQWU7QUFDM0MsV0FBT0EsTUFBSyxhQUFhLGtCQUFrQixTQUFTLE9BQU87QUFBQSxFQUM3RDtBQUNBLFNBQU8saUJBQWlCLE9BQU8sUUFBUSxNQUFNLFNBQVMsYUFBYTtBQUNyRTs7O0FDenpCQSxJQUFNLFNBQU4sTUFBYTtBQUFBLEVBQ0gsSUFBSTtBQUFBLEVBQ0osSUFBSTtBQUFBLEVBRVosS0FBSyxHQUFpQjtBQUNwQixVQUFNLElBQUksSUFBSTtBQUNkLFNBQUssSUFBSSxLQUFLLEtBQUssS0FBSyxJQUFJLEdBQUcsUUFBVTtBQUN6QyxTQUFLLElBQUksS0FBSyxLQUFLLEtBQUssSUFBSyxJQUFJLEtBQU8sVUFBVTtBQUNsRCxTQUFLLEtBQUssS0FBSyxNQUFNO0FBQUEsRUFDdkI7QUFBQSxFQUVBLElBQUksR0FBaUI7QUFDbkIsUUFBSSxJQUFJLE1BQU07QUFDZCxhQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMxQixXQUFLLEtBQUssQ0FBQztBQUNYLGFBQU87QUFBQSxJQUNUO0FBQUEsRUFDRjtBQUFBLEVBRUEsT0FBTyxHQUFpQjtBQUN0QixTQUFLLElBQUksRUFBRSxNQUFNO0FBQ2pCLGFBQVMsSUFBSSxHQUFHLElBQUksRUFBRSxRQUFRLElBQUssTUFBSyxLQUFLLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUM5RDtBQUFBLEVBRUEsTUFBYztBQUNaLFlBQVEsS0FBSyxNQUFNLEdBQUcsU0FBUyxFQUFFLEVBQUUsU0FBUyxHQUFHLEdBQUcsS0FDN0MsS0FBSyxNQUFNLEdBQUcsU0FBUyxFQUFFLEVBQUUsU0FBUyxHQUFHLEdBQUc7QUFBQSxFQUNqRDtBQUNGO0FBRU8sU0FBUyxZQUFZLFFBQWtDO0FBQzVELFFBQU0sSUFBaUI7QUFBQSxJQUNyQixJQUFJLEtBQUssSUFBSSxDQUFDLE1BQU0sS0FBSyxNQUFNLE9BQU8sRUFBRSxDQUFDO0FBQUEsSUFDekMsSUFBSSxLQUFLLElBQUksQ0FBQyxNQUFNLEtBQUssTUFBTSxPQUFPLEVBQUUsQ0FBQztBQUFBLElBQ3pDLElBQUksS0FBSyxJQUFJLE9BQU8sR0FBRyxLQUFLLE1BQU0sT0FBTyxFQUFFLENBQUM7QUFBQSxJQUM1QyxJQUFJLEtBQUssSUFBSSxPQUFPLEdBQUcsS0FBSyxNQUFNLE9BQU8sRUFBRSxDQUFDO0FBQUEsSUFDNUMsSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLE1BQU0sT0FBTyxFQUFFLENBQUM7QUFBQSxJQUN6QyxJQUFJLEtBQUssSUFBSSxRQUFRLEdBQUcsS0FBSyxNQUFNLE9BQU8sRUFBRSxDQUFDO0FBQUEsRUFDL0M7QUFDQSxNQUFJLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxJQUFJO0FBQzdDLFVBQU0sSUFBSSxNQUFNLHNCQUFzQixLQUFLLFVBQVUsTUFBTSxDQUFDLEVBQUU7QUFBQSxFQUNoRTtBQUNBLFNBQU87QUFDVDtBQUdPLFNBQVMsa0JBQWtCLE9BQThDO0FBQzlFLFNBQU8sTUFDSixJQUFJLENBQUMsT0FBTztBQUFBLElBQ1gsSUFBSSxLQUFLLE1BQU0sRUFBRSxFQUFFO0FBQUEsSUFBRyxJQUFJLEtBQUssTUFBTSxFQUFFLEVBQUU7QUFBQSxJQUFHLElBQUksS0FBSyxNQUFNLEVBQUUsRUFBRTtBQUFBLElBQUcsSUFBSSxLQUFLLE1BQU0sRUFBRSxFQUFFO0FBQUEsSUFDckYsSUFBSSxLQUFLLE1BQU0sRUFBRSxFQUFFO0FBQUEsSUFBRyxJQUFJLEtBQUssTUFBTSxFQUFFLEVBQUU7QUFBQSxFQUMzQyxFQUFFLEVBQ0QsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFDbEQsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUU7QUFDbEQ7QUFHTyxTQUFTLG1CQUFtQixPQUFjLFFBQStCO0FBQzlFLFFBQU0sSUFBSSxZQUFZLE1BQU07QUFDNUIsUUFBTSxPQUFpQixDQUFDO0FBQ3hCLFFBQU0sTUFBTSxjQUFjLEVBQUUsRUFBRSxHQUFHLE1BQU0sY0FBYyxFQUFFLEVBQUU7QUFDekQsUUFBTSxNQUFNLGNBQWMsRUFBRSxFQUFFLEdBQUcsTUFBTSxjQUFjLEVBQUUsRUFBRTtBQUN6RCxXQUFTLEtBQUssS0FBSyxNQUFNLEtBQUssTUFBTTtBQUNsQyxhQUFTLEtBQUssS0FBSyxNQUFNLEtBQUssTUFBTTtBQUNsQyxZQUFNLFFBQVEsWUFBWSxPQUFPLElBQUksRUFBRTtBQUN2QyxVQUFJLENBQUMsTUFBTyxPQUFNLElBQUksTUFBTSxTQUFTLEVBQUUsSUFBSSxFQUFFLHVCQUF1QjtBQUNwRSxXQUFLLEtBQUssU0FBUyxJQUFJLEVBQUUsQ0FBQztBQUFBLElBQzVCO0FBQUEsRUFDRjtBQUNBLE9BQUssS0FBSztBQUNWLFNBQU87QUFDVDtBQU9PLFNBQVMsb0JBQ2QsT0FDQSxRQUNBLFVBQWtDLENBQUMsR0FDeEI7QUFDWCxRQUFNLElBQUksWUFBWSxNQUFNO0FBQzVCLFFBQU0sV0FBVyxrQkFBa0IsT0FBTztBQUMxQyxRQUFNLE9BQU8sbUJBQW1CLE9BQU8sQ0FBQztBQUN4QyxRQUFNLElBQUksSUFBSSxPQUFPO0FBQ3JCLElBQUUsT0FBTyxxQkFBcUI7QUFDOUIsSUFBRSxJQUFJLEVBQUUsRUFBRTtBQUFHLElBQUUsSUFBSSxFQUFFLEVBQUU7QUFBRyxJQUFFLElBQUksRUFBRSxFQUFFO0FBQUcsSUFBRSxJQUFJLEVBQUUsRUFBRTtBQUFHLElBQUUsSUFBSSxFQUFFLEVBQUU7QUFBRyxJQUFFLElBQUksRUFBRSxFQUFFO0FBQzNFLElBQUUsSUFBSSxTQUFTLE1BQU07QUFDckIsYUFBVyxLQUFLLFVBQVU7QUFDeEIsTUFBRSxJQUFJLEVBQUUsRUFBRTtBQUFHLE1BQUUsSUFBSSxFQUFFLEVBQUU7QUFBRyxNQUFFLElBQUksRUFBRSxFQUFFO0FBQUcsTUFBRSxJQUFJLEVBQUUsRUFBRTtBQUFHLE1BQUUsSUFBSSxFQUFFLEVBQUU7QUFBRyxNQUFFLElBQUksRUFBRSxFQUFFO0FBQUEsRUFDN0U7QUFFQSxNQUFJLFFBQVE7QUFDWixNQUFJLGdCQUFnQjtBQUNwQixRQUFNLE1BQU0sRUFBRSxLQUFLO0FBQ25CLFFBQU0sTUFBTSxFQUFFLEtBQUs7QUFFbkIsYUFBVyxPQUFPLE1BQU07QUFDdEIsVUFBTSxRQUFRLE1BQU0sT0FBTyxJQUFJLEdBQUc7QUFDbEMsUUFBSSxDQUFDLE1BQU8sT0FBTSxJQUFJLE1BQU0sU0FBUyxHQUFHLG9CQUFvQjtBQUM1RCxVQUFNLEtBQUssYUFBYSxNQUFNLEVBQUUsR0FBRyxLQUFLLGFBQWEsTUFBTSxFQUFFO0FBQzdELFVBQU0sTUFBTSxLQUFLLElBQUksR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLE1BQU0sS0FBSyxJQUFJLGFBQWEsR0FBRyxFQUFFLEtBQUssRUFBRTtBQUM1RSxVQUFNLE1BQU0sS0FBSyxJQUFJLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxNQUFNLEtBQUssSUFBSSxhQUFhLEdBQUcsRUFBRSxLQUFLLEVBQUU7QUFDNUUsTUFBRSxPQUFPLE9BQU87QUFDaEIsTUFBRSxJQUFJLE1BQU0sRUFBRTtBQUFHLE1BQUUsSUFBSSxNQUFNLEVBQUU7QUFDL0IsYUFBUyxLQUFLLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDbEMsWUFBTSxJQUFJLFFBQVE7QUFDbEIsZUFBUyxLQUFLLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDbEMsY0FBTSxJQUFJLEtBQUs7QUFDZixpQkFBUyxLQUFLLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDbEMsZ0JBQU0sSUFBSSxLQUFLO0FBQ2YsY0FBSSxTQUFTLFNBQVMsS0FBSyxpQkFBaUIsVUFBVSxHQUFHLEdBQUcsQ0FBQyxHQUFHO0FBQzlEO0FBQ0E7QUFBQSxVQUNGO0FBQ0EsWUFBRSxLQUFLLE1BQU0sS0FBSyxXQUFXLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQztBQUN6QztBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFFQSxTQUFPLEVBQUUsTUFBTSxFQUFFLElBQUksR0FBRyxPQUFPLGVBQWUsUUFBUSxLQUFLLFFBQVEsUUFBUSxFQUFFO0FBQy9FO0FBR08sU0FBUyx1QkFBdUIsT0FBc0I7QUFDM0QsUUFBTSxJQUFJLElBQUksT0FBTztBQUNyQixJQUFFLE9BQU8sbUJBQW1CO0FBQzVCLFFBQU0sT0FBTyxPQUFPLEtBQUssTUFBTSxTQUFTLEVBQUUsS0FBSztBQUMvQyxJQUFFLElBQUksS0FBSyxNQUFNO0FBQ2pCLGFBQVcsT0FBTyxNQUFNO0FBQ3RCLE1BQUUsT0FBTyxHQUFHO0FBQ1osTUFBRSxJQUFJLE1BQU0sVUFBVSxHQUFHLENBQUM7QUFBQSxFQUM1QjtBQUNBLFNBQU8sRUFBRSxJQUFJO0FBQ2Y7QUFFTyxTQUFTLGtCQUFrQixPQUFzQztBQUN0RSxRQUFNLE1BQThCLENBQUM7QUFDckMsYUFBVyxPQUFPLE9BQU8sS0FBSyxNQUFNLFNBQVMsRUFBRSxLQUFLLEVBQUcsS0FBSSxHQUFHLElBQUksTUFBTSxVQUFVLEdBQUc7QUFDckYsU0FBTztBQUNUO0FBRUEsU0FBUyxXQUFXLEdBQVcsR0FBaUI7QUFDOUMsSUFBRSxPQUFPLEVBQUUsRUFBRTtBQUNiLElBQUUsT0FBTyxFQUFFLElBQUk7QUFDZixJQUFFLE9BQU8sRUFBRSxLQUFLO0FBQ2hCLElBQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxJQUFJLEdBQUksQ0FBQztBQUM1QixJQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsSUFBSSxHQUFJLENBQUM7QUFDNUIsSUFBRSxJQUFJLEtBQUssTUFBTSxFQUFFLElBQUksR0FBSSxDQUFDO0FBQzVCLElBQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxNQUFNLEdBQUssQ0FBQztBQUMvQixJQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsUUFBUSxHQUFJLENBQUM7QUFDaEMsSUFBRSxJQUFJLEVBQUUsT0FBTztBQUNmLElBQUUsT0FBTyxFQUFFLFlBQVksRUFBRTtBQUN6QixJQUFFLElBQUksRUFBRSxTQUFTO0FBQ2pCLElBQUUsSUFBSSxFQUFFLFlBQVksSUFBSSxDQUFDO0FBQ3pCLElBQUUsSUFBSSxFQUFFLGdCQUFnQixJQUFJLENBQUM7QUFDL0I7QUFHTyxTQUFTLG9CQUFvQixPQUFjLFFBQThCO0FBQzlFLE1BQUk7QUFDSixNQUFJLFFBQVE7QUFDVixVQUFNLElBQUksWUFBWSxNQUFNO0FBQzVCLHVCQUFtQixPQUFPLENBQUM7QUFDM0IsZUFBVyxDQUFDLEdBQUcsTUFBTSxTQUFTLE9BQU8sQ0FBQyxFQUFFO0FBQUEsTUFDdEMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSztBQUFBLElBQ3RFO0FBQUEsRUFDRixPQUFPO0FBQ0wsZUFBVyxDQUFDLEdBQUcsTUFBTSxTQUFTLE9BQU8sQ0FBQztBQUFBLEVBQ3hDO0FBQ0EsV0FBUyxLQUFLLENBQUMsR0FBRyxNQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLElBQUksQ0FBRTtBQUNoRSxRQUFNLElBQUksSUFBSSxPQUFPO0FBQ3JCLElBQUUsT0FBTyxzQkFBc0I7QUFDL0IsSUFBRSxJQUFJLFNBQVMsTUFBTTtBQUNyQixhQUFXLEtBQUssU0FBVSxZQUFXLEdBQUcsQ0FBQztBQUN6QyxTQUFPLEVBQUUsSUFBSTtBQUNmO0FBTU8sU0FBUyx1QkFBdUIsT0FBc0I7QUFDM0QsUUFBTSxhQUFhLENBQUMsR0FBRyxNQUFNLFdBQVcsT0FBTyxDQUFDLEVBQzdDLEtBQUssQ0FBQyxHQUFHLE1BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssSUFBSSxDQUFFO0FBQzFELFFBQU0sSUFBSSxJQUFJLE9BQU87QUFDckIsSUFBRSxPQUFPLHlCQUF5QjtBQUNsQyxJQUFFLElBQUksV0FBVyxNQUFNO0FBQ3ZCLGFBQVcsS0FBSyxZQUFZO0FBQzFCLE1BQUUsT0FBTyxFQUFFLEVBQUU7QUFDYixNQUFFLE9BQU8sRUFBRSxJQUFJO0FBQ2YsTUFBRSxPQUFPLEVBQUUsTUFBTTtBQUNqQixNQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsSUFBSSxHQUFJLENBQUM7QUFDNUIsTUFBRSxJQUFJLEtBQUssTUFBTSxFQUFFLElBQUksR0FBSSxDQUFDO0FBQzVCLE1BQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxJQUFJLEdBQUksQ0FBQztBQUM1QixNQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsTUFBTSxHQUFLLENBQUM7QUFFL0IsUUFBSSxFQUFFLGtCQUFrQix1QkFBd0IsR0FBRSxPQUFPLFVBQVU7QUFDbkUsTUFBRSxJQUFJLEVBQUUsUUFBUSxNQUFNO0FBQ3RCLGVBQVcsS0FBSyxFQUFFLFNBQVM7QUFDekIsUUFBRSxPQUFPLEVBQUUsSUFBSTtBQUNmLFFBQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxJQUFJLEdBQUksQ0FBQztBQUM1QixRQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsSUFBSSxHQUFJLENBQUM7QUFDNUIsUUFBRSxJQUFJLEtBQUssTUFBTSxFQUFFLElBQUksR0FBSSxDQUFDO0FBQzVCLFFBQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxJQUFJLEdBQUksQ0FBQztBQUM1QixRQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsSUFBSSxHQUFJLENBQUM7QUFDNUIsUUFBRSxJQUFJLEtBQUssTUFBTSxFQUFFLElBQUksR0FBSSxDQUFDO0FBQzVCLFFBQUUsSUFBSSxLQUFLLE9BQU8sRUFBRSxPQUFPLEtBQUssR0FBSyxDQUFDO0FBQ3RDLFFBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRTtBQUFBLElBQ3ZCO0FBQ0EsVUFBTSxXQUFXLE9BQU8sS0FBSyxFQUFFLElBQUksRUFBRSxLQUFLO0FBQzFDLE1BQUUsSUFBSSxTQUFTLE1BQU07QUFDckIsZUFBVyxPQUFPLFVBQVU7QUFDMUIsUUFBRSxPQUFPLEdBQUc7QUFDWixRQUFFLElBQUksRUFBRSxLQUFLLEdBQTBCLEtBQUssQ0FBQztBQUFBLElBQy9DO0FBQ0EsTUFBRSxJQUFJLEVBQUUsYUFBYTtBQUFBLEVBQ3ZCO0FBQ0EsU0FBTyxFQUFFLElBQUk7QUFDZjtBQXlDTyxTQUFTLG1CQUFtQixPQUFjLFFBQXFCLFFBQVEsSUFBcUI7QUFDakcsUUFBTSxJQUFJLFlBQVksTUFBTTtBQUM1QixRQUFNLE9BQU8sbUJBQW1CLE9BQU8sQ0FBQztBQUN4QyxRQUFNLE1BQXVCLENBQUM7QUFDOUIsYUFBVyxPQUFPLE1BQU07QUFDdEIsVUFBTSxRQUFRLE1BQU0sT0FBTyxJQUFJLEdBQUc7QUFDbEMsUUFBSSxDQUFDLE1BQU87QUFDWixVQUFNLEtBQUssYUFBYSxNQUFNLEVBQUUsR0FBRyxLQUFLLGFBQWEsTUFBTSxFQUFFO0FBQzdELFVBQU0sTUFBTSxLQUFLLElBQUksR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLE1BQU0sS0FBSyxJQUFJLGFBQWEsR0FBRyxFQUFFLEtBQUssRUFBRTtBQUM1RSxVQUFNLE1BQU0sS0FBSyxJQUFJLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxNQUFNLEtBQUssSUFBSSxhQUFhLEdBQUcsRUFBRSxLQUFLLEVBQUU7QUFDNUUsYUFBUyxLQUFLLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDbEMsZUFBUyxLQUFLLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDbEMsY0FBTSxNQUFNLEtBQUssYUFBYTtBQUM5QixZQUFJLFdBQVc7QUFDZixZQUFJLFNBQVMsTUFBTSxhQUFhLEdBQUc7QUFDbkMsaUJBQVMsSUFBSSxRQUFRLEdBQUcsS0FBSyxPQUFPLEtBQUs7QUFDdkMsZ0JBQU0sSUFBSSxNQUFNLEtBQUssV0FBVyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUNwRCxjQUFJLFFBQVEsQ0FBQyxHQUFHO0FBQUUsdUJBQVc7QUFBRyxxQkFBUztBQUFHO0FBQUEsVUFBTztBQUFBLFFBQ3JEO0FBQ0EsY0FBTSxpQkFBaUIsV0FBVztBQUNsQyxZQUFJLE1BQU0sUUFBUSxHQUFHLE1BQU0sZ0JBQWdCO0FBQ3pDLGNBQUksS0FBSyxFQUFFLEdBQUcsS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLE9BQU8sVUFBVSxVQUFVLGdCQUFnQixRQUFRLE1BQU0sUUFBUSxHQUFHLEVBQUUsQ0FBQztBQUFBLFFBQzVHO0FBQ0EsWUFBSSxNQUFNLGFBQWEsR0FBRyxNQUFNLFFBQVE7QUFDdEMsY0FBSSxLQUFLLEVBQUUsR0FBRyxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksT0FBTyxZQUFZLFVBQVUsUUFBUSxRQUFRLE1BQU0sYUFBYSxHQUFHLEVBQUUsQ0FBQztBQUFBLFFBQzNHO0FBQ0EsWUFBSSxJQUFJLFVBQVUsTUFBTyxRQUFPO0FBQUEsTUFDbEM7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNBLFNBQU87QUFDVDtBQVlPLFNBQVMscUJBQXFCLE9BQWMsVUFBaUQ7QUFDbEcsUUFBTSxNQUFxQixDQUFDO0FBQzVCLGFBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxNQUFNLE9BQU87QUFDdEMsVUFBTSxDQUFDLElBQUksRUFBRSxJQUFJLElBQUksTUFBTSxHQUFHLEVBQUUsSUFBSSxNQUFNO0FBQzFDLFVBQU0sS0FBSyxhQUFhLEVBQUUsR0FBRyxLQUFLLGFBQWEsRUFBRTtBQUNqRCxlQUFXLENBQUMsT0FBTyxRQUFRLEtBQUssT0FBTztBQUNyQyxZQUFNLEtBQUssUUFBUTtBQUNuQixZQUFNLEtBQUssS0FBSyxNQUFPLFFBQVEsYUFBYyxVQUFVO0FBQ3ZELFlBQU0sS0FBSyxLQUFLLE1BQU0sUUFBUSxVQUFVO0FBQ3hDLFlBQU0sSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLElBQUksSUFBSSxRQUFRO0FBQzVDLFVBQUksQ0FBQyxpQkFBaUIsVUFBVSxHQUFHLEdBQUcsQ0FBQyxHQUFHO0FBQ3hDLFlBQUksS0FBSyxFQUFFLE9BQU8sS0FBSyxPQUFPLEdBQUcsR0FBRyxHQUFHLFNBQVMsQ0FBQztBQUFBLE1BQ25EO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDQSxNQUFJLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxNQUFNLGNBQWMsRUFBRSxLQUFLLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSztBQUN0RSxTQUFPO0FBQ1Q7QUFvQk8sU0FBUyxVQUFVLE9BQXdCO0FBQ2hELFNBQU8sQ0FBQyxHQUFHLE1BQU0sT0FBTyxLQUFLLENBQUMsRUFBRSxLQUFLO0FBQ3ZDOzs7QUMxV08sSUFBTSxZQUFZO0FBR2xCLElBQU0sb0JBQW9CO0FBTTFCLElBQU0sb0JBQW9CLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFTN0QsSUFBTSxxQkFBaUQ7QUFBQSxFQUM1RCxFQUFFLElBQUksS0FBSyxJQUFJLEtBQUssR0FBRyxHQUFHO0FBQUEsRUFDMUIsRUFBRSxJQUFJLEtBQUssSUFBSSxLQUFLLEdBQUcsR0FBRztBQUFBLEVBQzFCLEVBQUUsSUFBSSxLQUFLLElBQUksS0FBSyxHQUFHLEdBQUc7QUFDNUI7QUE2QkEsSUFBTSxpQkFBaUIsRUFBRSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLEdBQUc7QUFFckQsSUFBTSxjQUEwQjtBQUFBLEVBQ3JDLE1BQU07QUFBQSxFQUNOLFVBQVU7QUFBQSxJQUNSLElBQUk7QUFBQSxJQUNKLE1BQU0sRUFBRSxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLElBQUk7QUFBQTtBQUFBLElBRTNDLFFBQVE7QUFBQSxJQUNSLE1BQU0sRUFBRSxHQUFHLEtBQUssR0FBRyxJQUFJO0FBQUEsSUFDdkIsVUFBVSxFQUFFLEdBQUcsS0FBSyxHQUFHLElBQUk7QUFBQSxFQUM3QjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsSUFBSTtBQUFBLElBQ0osTUFBTSxFQUFFLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksSUFBSTtBQUFBLElBQzNDLFFBQVE7QUFBQSxJQUNSLE1BQU0sRUFBRSxHQUFHLEtBQUssR0FBRyxJQUFJO0FBQUEsSUFDdkIsVUFBVSxFQUFFLEdBQUcsS0FBSyxHQUFHLElBQUk7QUFBQSxFQUM3QjtBQUFBLEVBQ0EsTUFBTTtBQUFBLElBQ0osSUFBSTtBQUFBLElBQ0osTUFBTSxFQUFFLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksSUFBSTtBQUFBLElBQzNDLFVBQVU7QUFBQSxFQUNaO0FBQUEsRUFDQSxZQUFZLEVBQUUsSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQUEsRUFDakQsVUFBVSxFQUFFLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksSUFBSTtBQUFBLEVBQy9DLGVBQWU7QUFBQSxFQUNmLGlCQUFpQjtBQUFBLElBQ2YsSUFBSSxhQUFhLGVBQWUsR0FBRztBQUFBLElBQ25DLElBQUksYUFBYSxlQUFlLEdBQUc7QUFBQSxJQUNuQyxJQUFJLGFBQWEsZUFBZSxHQUFHLElBQUk7QUFBQSxJQUN2QyxJQUFJLGFBQWEsZUFBZSxHQUFHLElBQUk7QUFBQSxJQUN2QyxJQUFJO0FBQUEsSUFDSixJQUFJLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFDQSxVQUFVO0FBQUE7QUFBQSxJQUVSLEVBQUUsSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksR0FBRyxJQUFJLEdBQUc7QUFBQTtBQUFBLElBRXBELEVBQUUsSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksR0FBRyxJQUFJLEdBQUc7QUFBQTtBQUFBLElBRXBELEVBQUUsSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksSUFBSSxJQUFJLEdBQUc7QUFBQSxFQUN2RDtBQUNGO0FBYU8sU0FBUyxrQkFBa0IsT0FBTyxXQUFzQjtBQUM3RCxRQUFNLFFBQVEsWUFBWSxJQUFJO0FBQzlCLFFBQU0sRUFBRSxLQUFLLEtBQUssS0FBSyxJQUFJLElBQUksWUFBWTtBQUMzQyxXQUFTLEtBQUssS0FBSyxNQUFNLEtBQUssTUFBTTtBQUNsQyxhQUFTLEtBQUssS0FBSyxNQUFNLEtBQUssS0FBTSxlQUFjLE9BQU8sSUFBSSxFQUFFO0FBQUEsRUFDakU7QUFDQSxxQkFBbUIsS0FBSztBQUN4QixTQUFPLEVBQUUsT0FBTyxRQUFRLGFBQWEsV0FBVyxVQUFVLEtBQUssRUFBRTtBQUNuRTs7O0FDM0dPLElBQU0seUJBQTJEO0FBQUEsRUFDdEUsTUFBTTtBQUFBLEVBQ04sT0FBTztBQUNUO0FBR08sU0FBUyxlQUFxQjtBQUNuQyxRQUFNLE9BQU8sWUFBWSxNQUFNO0FBQy9CLFFBQU0sV0FBVyxZQUFZLE1BQU07QUFDbkMsU0FBTztBQUFBLElBQ0wsSUFBSSxLQUFLO0FBQUEsSUFDVCxJQUFJLEtBQUssSUFBSTtBQUFBLElBQ2IsSUFBSSxTQUFTO0FBQUEsSUFDYixJQUFJLEtBQUssSUFBSTtBQUFBLEVBQ2Y7QUFDRjtBQUdPLFNBQVMsa0JBQWtDO0FBQ2hELFFBQU0sT0FBTyxhQUFhO0FBQzFCLFFBQU0sVUFBMEIsQ0FBQztBQUNqQyxXQUFTLElBQUksR0FBRyxJQUFJLGtCQUFrQixRQUFRLEtBQUs7QUFDakQsYUFBUyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3ZDLGNBQVEsS0FBSyxFQUFFLEdBQUcsS0FBSyxLQUFLLEdBQUcsR0FBRyxHQUFHLGtCQUFrQixDQUFDLEVBQUUsQ0FBQztBQUFBLElBQzdEO0FBQUEsRUFDRjtBQUNBLFNBQU87QUFDVDtBQUdPLFNBQVMsa0JBQWtDO0FBQ2hELFFBQU0sT0FBTyxZQUFZLEtBQUs7QUFDOUIsUUFBTSxVQUEwQixDQUFDO0FBQ2pDLGFBQVcsUUFBUSxvQkFBb0I7QUFDckMsYUFBUyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3ZDLGVBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksS0FBSztBQUN2QyxnQkFBUSxLQUFLLEVBQUUsR0FBRyxHQUFHLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFBQSxNQUNsQztBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0EsU0FBTztBQUNUO0FBNEJBLFNBQVMsWUFBOEI7QUFDckMsU0FBTyxFQUFFLGFBQWEsTUFBTSxXQUFXLEtBQUs7QUFDOUM7QUFFQSxTQUFTLGdCQUFnQixRQUFxRDtBQUM1RSxTQUFPLEdBQUcsT0FBTyxJQUFJLEtBQUssT0FBTyxRQUFRLEtBQUssSUFBSSxDQUFDO0FBQ3JEO0FBT08sU0FBUyxnQkFDZCxNQUFpQixVQUErQixDQUFDLEdBQzdCO0FBQ3BCLFFBQU0sRUFBRSxPQUFPLE9BQU8sSUFBSTtBQUMxQixRQUFNLFVBQVUsUUFBUSxhQUFhO0FBQ3JDLFFBQU0sWUFBWSxDQUFDO0FBQ25CLGFBQVcsQ0FBQyxVQUFVLE1BQU0sS0FBSyxPQUFPLFFBQVEsT0FBTyxHQUFHO0FBQ3hELFNBQUssVUFBVSxLQUFLLEVBQUcsT0FBTSxVQUFVLFFBQVEsSUFBSTtBQUFBLEVBQ3JEO0FBRUEsUUFBTUMsa0JBQWlCLElBQUksZ0JBQWdCLEVBQUUsVUFBVSxPQUFPLFNBQVMsQ0FBQztBQUN4RSxRQUFNQyx1QkFBc0IsSUFBSSx5QkFBeUIsRUFBRSxVQUFVLE9BQU8sU0FBUyxDQUFDO0FBQ3RGLFFBQU0sa0JBQWtCLGtCQUFrQixLQUFLO0FBQy9DLFFBQU0sU0FBbUIsQ0FBQztBQUMxQixRQUFNLFFBQVEsVUFBVTtBQUN4QixRQUFNLE9BQU8sVUFBVTtBQUN2QixRQUFNLE9BQU8sVUFBVTtBQUV2QixRQUFNLFlBQVksWUFBWSxPQUFPRCxpQkFBZ0I7QUFBQSxJQUNuRCxRQUFRLE9BQU8sTUFBTTtBQUFBLElBQ3JCLE1BQU0sT0FBTyxNQUFNO0FBQUEsSUFDbkIsUUFBUSxPQUFPLE1BQU07QUFBQSxJQUNyQixPQUFPO0FBQUEsRUFDVCxDQUFDO0FBQ0QsTUFBSSxDQUFDLFVBQVUsSUFBSTtBQUNqQixXQUFPLEtBQUssc0JBQXNCLGdCQUFnQixTQUFTLENBQUMsRUFBRTtBQUFBLEVBQ2hFLE9BQU87QUFDTCxVQUFNLGNBQWMsVUFBVTtBQUM5QixVQUFNLGFBQWEsZUFBZSxPQUFPQyxzQkFBcUI7QUFBQSxNQUM1RCxRQUFRLE9BQU8sTUFBTTtBQUFBLE1BQ3JCLE1BQU07QUFBQSxNQUNOLE1BQU0sT0FBTyxNQUFNO0FBQUEsTUFDbkIsUUFBUSxPQUFPLE1BQU07QUFBQSxNQUNyQixNQUFNLE9BQU8sTUFBTTtBQUFBLElBQ3JCLENBQUM7QUFDRCxRQUFJLENBQUMsV0FBVyxJQUFJO0FBQ2xCLGFBQU8sS0FBSyxvQkFBb0IsZ0JBQWdCLFVBQVUsQ0FBQyxFQUFFO0FBQUEsSUFDL0QsT0FBTztBQUNMLFlBQU0sWUFBWSxXQUFXO0FBQUEsSUFDL0I7QUFBQSxFQUNGO0FBRUEsUUFBTSxXQUFXLGFBQWE7QUFDOUIsUUFBTSxXQUFXLFlBQVksT0FBT0QsaUJBQWdCO0FBQUEsSUFDbEQsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLEVBQ1QsR0FBRztBQUFBLElBQ0QsU0FBUyxnQkFBZ0I7QUFBQSxJQUN6QixpQkFBaUIsSUFBSTtBQUFBLElBQ3JCLFVBQVUsQ0FBQyxPQUFPLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDL0IsQ0FBQztBQUNELE1BQUksQ0FBQyxTQUFTLElBQUk7QUFDaEIsV0FBTyxLQUFLLHFCQUFxQixnQkFBZ0IsUUFBUSxDQUFDLEVBQUU7QUFBQSxFQUM5RCxPQUFPO0FBQ0wsU0FBSyxjQUFjLFNBQVM7QUFDNUIsVUFBTSxZQUFZLGVBQWUsT0FBT0Msc0JBQXFCO0FBQUEsTUFDM0QsUUFBUTtBQUFBLE1BQ1IsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLElBQ1YsQ0FBQztBQUNELFFBQUksQ0FBQyxVQUFVLElBQUk7QUFDakIsYUFBTyxLQUFLLG1CQUFtQixnQkFBZ0IsU0FBUyxDQUFDLEVBQUU7QUFBQSxJQUM3RCxPQUFPO0FBQ0wsV0FBSyxZQUFZLFVBQVU7QUFBQSxJQUM3QjtBQUFBLEVBQ0Y7QUFFQSxRQUFNLFdBQVcsWUFBWSxPQUFPRCxpQkFBZ0I7QUFBQSxJQUNsRCxRQUFRLE9BQU8sS0FBSztBQUFBLElBQ3BCLE1BQU0sT0FBTyxLQUFLO0FBQUEsSUFDbEIsUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLEVBQ1QsR0FBRztBQUFBLElBQ0QsU0FBUyxnQkFBZ0I7QUFBQSxJQUN6QixpQkFBaUIsSUFBSTtBQUFBLElBQ3JCLFVBQVUsQ0FBQyxPQUFPLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDL0IsQ0FBQztBQUNELE1BQUksQ0FBQyxTQUFTLElBQUk7QUFDaEIsV0FBTyxLQUFLLHFCQUFxQixnQkFBZ0IsUUFBUSxDQUFDLEVBQUU7QUFBQSxFQUM5RCxPQUFPO0FBQ0wsU0FBSyxjQUFjLFNBQVM7QUFDNUIsVUFBTSxZQUFZLGVBQWUsT0FBT0Msc0JBQXFCO0FBQUEsTUFDM0QsUUFBUSxPQUFPLEtBQUs7QUFBQSxNQUNwQixNQUFNO0FBQUEsTUFDTixNQUFNLE9BQU8sS0FBSztBQUFBLE1BQ2xCLFFBQVE7QUFBQSxNQUNSLFVBQVUsT0FBTyxLQUFLO0FBQUEsSUFDeEIsQ0FBQztBQUNELFFBQUksQ0FBQyxVQUFVLElBQUk7QUFDakIsYUFBTyxLQUFLLG1CQUFtQixnQkFBZ0IsU0FBUyxDQUFDLEVBQUU7QUFBQSxJQUM3RCxPQUFPO0FBQ0wsV0FBSyxZQUFZLFVBQVU7QUFBQSxJQUM3QjtBQUFBLEVBQ0Y7QUFFQSxTQUFPO0FBQUEsSUFDTCxJQUFJLE9BQU8sV0FBVztBQUFBLElBQ3RCO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsZ0JBQWdCLGtCQUFrQixLQUFLO0FBQUEsSUFDdkMsUUFBUTtBQUFBLE1BQ04sUUFBUSxvQkFBb0IsT0FBTyxPQUFPLGVBQWUsRUFBRTtBQUFBLE1BQzNELFlBQVksdUJBQXVCLEtBQUs7QUFBQSxNQUN4QyxXQUFXLHVCQUF1QixLQUFLO0FBQUEsTUFDdkMsVUFBVSxvQkFBb0IsT0FBTyxPQUFPLGVBQWU7QUFBQSxJQUM3RDtBQUFBLEVBQ0Y7QUFDRjtBQUdPLFNBQVMsbUJBQW1CLFFBQW1FO0FBQ3BHLFFBQU0sUUFBK0MsQ0FBQztBQUN0RCxhQUFXLFFBQVEsQ0FBQyxPQUFPLE9BQU8sT0FBTyxNQUFNLE9BQU8sSUFBSSxHQUFHO0FBQzNELGVBQVcsQ0FBQyxVQUFVLE1BQU0sS0FBSyxPQUFPLFFBQVEsS0FBSyxXQUFXLFlBQVksQ0FBQyxDQUFDLEdBQUc7QUFDL0UsWUFBTSxRQUF3QixLQUFLLE1BQU0sUUFBd0IsS0FBSyxNQUFNLFVBQVU7QUFBQSxJQUN4RjtBQUFBLEVBQ0Y7QUFDQSxTQUFPO0FBQ1Q7OztBVHZNQSxTQUFTLFVBQWdCO0FBQ3ZCLFFBQU0sSUFBSSxrQkFBa0I7QUFDNUIsSUFBRSxNQUFNLFlBQVksRUFBRSxHQUFHLHVCQUF1QjtBQUNoRCxTQUFPO0FBQ1Q7QUFFQSxTQUFTLGlCQUFpQjtBQUN4QixTQUFPLElBQUksZ0JBQWdCLEVBQUUsVUFBVSxZQUFZLFNBQVMsQ0FBQztBQUMvRDtBQUVBLFNBQVMsc0JBQXNCO0FBQzdCLFNBQU8sSUFBSSx5QkFBeUIsRUFBRSxVQUFVLFlBQVksU0FBUyxDQUFDO0FBQ3hFO0FBRUEsU0FBUyxZQUFZLE9BQWM7QUFDakMsU0FBTztBQUFBLElBQ0wsVUFBVSxNQUFNO0FBQUEsSUFDaEIsUUFBUSxvQkFBb0IsT0FBTyxZQUFZLGVBQWUsRUFBRTtBQUFBLElBQ2hFLFlBQVksdUJBQXVCLEtBQUs7QUFBQSxJQUN4QyxXQUFXLHVCQUF1QixLQUFLO0FBQUEsSUFDdkMsVUFBVSxvQkFBb0IsT0FBTyxZQUFZLGVBQWU7QUFBQSxFQUNsRTtBQUNGO0FBRUEsU0FBUyxhQUFhLEdBQVM7QUFDN0IsUUFBTSxTQUFTLFlBQVksRUFBRSxPQUFPLGVBQWUsR0FBRztBQUFBLElBQ3BELFFBQVEsRUFBRSxPQUFPLE1BQU07QUFBQSxJQUN2QixNQUFNLEVBQUUsT0FBTyxNQUFNO0FBQUEsSUFDckIsUUFBUSxFQUFFLE9BQU8sTUFBTTtBQUFBLElBQ3ZCLE9BQU87QUFBQSxFQUNULENBQUM7QUFDRCxTQUFPLE1BQU0sT0FBTyxJQUFJLE1BQU0sT0FBTyxLQUFLLEtBQUssT0FBTyxRQUFRLEtBQUssSUFBSSxDQUFDO0FBQ3hFLE1BQUksQ0FBQyxPQUFPLEdBQUksT0FBTSxJQUFJLE1BQU0sMEJBQTBCO0FBQzFELFNBQU87QUFDVDtBQUVBLFNBQVMsWUFBWSxHQUFTLFFBQWlCO0FBQzdDLFFBQU0sU0FBUyxZQUFZLEVBQUUsT0FBTyxlQUFlLEdBQUc7QUFBQSxJQUNwRCxRQUFRO0FBQUEsSUFDUixNQUFNLGFBQWE7QUFBQSxJQUNuQixRQUFRO0FBQUEsSUFDUixPQUFPO0FBQUEsRUFDVCxHQUFHO0FBQUEsSUFDRCxTQUFTLGdCQUFnQjtBQUFBLElBQ3pCLGlCQUFpQixTQUFTLElBQUksU0FBUztBQUFBLElBQ3ZDLFVBQVUsQ0FBQyxFQUFFLE9BQU8sU0FBUyxDQUFDLENBQUM7QUFBQSxFQUNqQyxDQUFDO0FBQ0QsU0FBTyxNQUFNLE9BQU8sSUFBSSxNQUFNLE9BQU8sS0FBSyxLQUFLLE9BQU8sUUFBUSxLQUFLLElBQUksQ0FBQztBQUN4RSxNQUFJLENBQUMsT0FBTyxHQUFJLE9BQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUN6RCxTQUFPO0FBQ1Q7QUFFQSxTQUFTLFlBQVksR0FBUyxNQUFlO0FBQzNDLFFBQU0sU0FBUyxZQUFZLEVBQUUsT0FBTyxlQUFlLEdBQUc7QUFBQSxJQUNwRCxRQUFRLEVBQUUsT0FBTyxLQUFLO0FBQUEsSUFDdEIsTUFBTSxFQUFFLE9BQU8sS0FBSztBQUFBLElBQ3BCLFFBQVE7QUFBQSxJQUNSLE9BQU87QUFBQSxFQUNULEdBQUc7QUFBQSxJQUNELFNBQVMsZ0JBQWdCO0FBQUEsSUFDekIsaUJBQWlCLE9BQU8sSUFBSSxPQUFPO0FBQUEsSUFDbkMsVUFBVSxDQUFDLEVBQUUsT0FBTyxTQUFTLENBQUMsQ0FBQztBQUFBLEVBQ2pDLENBQUM7QUFDRCxTQUFPLE1BQU0sT0FBTyxJQUFJLE1BQU0sT0FBTyxLQUFLLEtBQUssT0FBTyxRQUFRLEtBQUssSUFBSSxDQUFDO0FBQ3hFLE1BQUksQ0FBQyxPQUFPLEdBQUksT0FBTSxJQUFJLE1BQU0seUJBQXlCO0FBQ3pELFNBQU87QUFDVDtBQUVBLFNBQVMsY0FBYyxHQUFTO0FBQzlCLFNBQU87QUFBQSxJQUNMLFFBQVEsRUFBRSxPQUFPLE1BQU07QUFBQSxJQUN2QixNQUFNO0FBQUEsSUFDTixNQUFNLEVBQUUsT0FBTyxNQUFNO0FBQUEsSUFDckIsUUFBUSxFQUFFLE9BQU8sTUFBTTtBQUFBLElBQ3ZCLE1BQU0sRUFBRSxPQUFPLE1BQU07QUFBQSxFQUN2QjtBQUNGO0FBRUEsU0FBUyxhQUFhLEdBQVM7QUFDN0IsU0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sTUFBTSxhQUFhO0FBQUEsSUFDbkIsUUFBUTtBQUFBLEVBQ1Y7QUFDRjtBQUVBLFNBQVMsYUFBYSxHQUFTO0FBQzdCLFNBQU87QUFBQSxJQUNMLFFBQVEsRUFBRSxPQUFPLEtBQUs7QUFBQSxJQUN0QixNQUFNO0FBQUEsSUFDTixNQUFNLEVBQUUsT0FBTyxLQUFLO0FBQUEsSUFDcEIsUUFBUTtBQUFBLElBQ1IsVUFBVSxFQUFFLE9BQU8sS0FBSztBQUFBLEVBQzFCO0FBQ0Y7QUFFQSxLQUFLLHdFQUF3RSxNQUFNO0FBQ2pGLFFBQU0sSUFBSSxRQUFRO0FBQ2xCLFFBQU0sU0FBUyxZQUFZLEVBQUUsS0FBSztBQUVsQyxRQUFNLFdBQVcsY0FBYyxFQUFFLE9BQU8sY0FBYyxDQUFDLENBQUM7QUFDeEQsU0FBTyxNQUFNLFNBQVMsSUFBSSxLQUFLO0FBQy9CLE1BQUksQ0FBQyxTQUFTLElBQUk7QUFDaEIsV0FBTyxNQUFNLFNBQVMsT0FBTyxNQUFNO0FBQ25DLFdBQU8sTUFBTSxTQUFTLE1BQU0sbUJBQW1CO0FBQy9DLFdBQU8sR0FBRyxTQUFTLFFBQVEsVUFBVSxDQUFDO0FBQUEsRUFDeEM7QUFFQSxRQUFNLFVBQVUsY0FBYyxFQUFFLE9BQU8sYUFBYSxDQUFDLENBQUM7QUFDdEQsU0FBTyxNQUFNLFFBQVEsSUFBSSxLQUFLO0FBQzlCLE1BQUksQ0FBQyxRQUFRLElBQUk7QUFDZixXQUFPLE1BQU0sUUFBUSxNQUFNLG1CQUFtQjtBQUM5QyxXQUFPLEdBQUcsUUFBUSxRQUFRLENBQUMsRUFBRSxTQUFTLFNBQVMsQ0FBQztBQUFBLEVBQ2xEO0FBR0EsU0FBTyxVQUFVLFlBQVksRUFBRSxLQUFLLEdBQUcsTUFBTTtBQUM3QyxTQUFPLE1BQU0sRUFBRSxNQUFNLFdBQVcsTUFBTSxDQUFDO0FBSXZDLFFBQU0sV0FBVyxZQUFZLEdBQUcsS0FBSztBQUNyQyxTQUFPLE1BQU0sU0FBUyxPQUFPLFdBQVcsRUFBRTtBQUMxQyxTQUFPLE1BQU0sU0FBUyxPQUFPLGNBQWMsQ0FBQztBQUM1QyxRQUFNLFlBQVksY0FBYyxFQUFFLE9BQU8sYUFBYSxDQUFDLENBQUM7QUFDeEQsU0FBTyxNQUFNLFVBQVUsSUFBSSxLQUFLO0FBQ2hDLE1BQUksQ0FBQyxVQUFVLElBQUk7QUFDakIsV0FBTyxNQUFNLFVBQVUsTUFBTSxjQUFjO0FBQzNDLFdBQU8sR0FBRyxVQUFVLFFBQVEsQ0FBQyxFQUFFLFNBQVMsaUJBQWlCLENBQUM7QUFBQSxFQUM1RDtBQUdBLFFBQU0sV0FBVyxZQUFZLEdBQUcsS0FBSztBQUNyQyxTQUFPLE1BQU0sU0FBUyxPQUFPLFdBQVcsRUFBRTtBQUMxQyxTQUFPLE1BQU0sU0FBUyxPQUFPLFlBQVksRUFBRTtBQUMzQyxTQUFPLE1BQU0sU0FBUyxPQUFPLGNBQWMsQ0FBQztBQUM1QyxRQUFNLFlBQVksY0FBYyxFQUFFLE9BQU8sYUFBYSxDQUFDLENBQUM7QUFDeEQsU0FBTyxNQUFNLFVBQVUsSUFBSSxLQUFLO0FBQ2hDLE1BQUksQ0FBQyxVQUFVLElBQUk7QUFDakIsV0FBTyxNQUFNLFVBQVUsTUFBTSxpQkFBaUI7QUFDOUMsV0FBTyxHQUFHLFVBQVUsUUFBUSxDQUFDLEVBQUUsU0FBUyxlQUFlLENBQUM7QUFBQSxFQUMxRDtBQUVBLFNBQU8sTUFBTSx1QkFBdUIsRUFBRSxLQUFLLEdBQUcsT0FBTyxVQUFVO0FBQy9ELFNBQU8sTUFBTSxFQUFFLE1BQU0sV0FBVyxNQUFNLENBQUM7QUFDekMsQ0FBQztBQUVELEtBQUssaUVBQWlFLE1BQU07QUFDMUUsUUFBTSxJQUFJLFFBQVE7QUFDbEIsUUFBTUMsUUFBTyxhQUFhLENBQUM7QUFDM0IsU0FBTyxNQUFNQSxNQUFLLE9BQU8sV0FBVyxDQUFDO0FBQ3JDLFNBQU8sTUFBTUEsTUFBSyxPQUFPLFlBQVksRUFBRTtBQUN2QyxTQUFPLE1BQU1BLE1BQUssT0FBTyxZQUFZLEVBQUU7QUFFdkMsUUFBTSxRQUFRLEVBQUU7QUFDaEIsUUFBTSxTQUFTLFlBQVksS0FBSztBQUNoQyxRQUFNLFVBQVUsY0FBYyxPQUFPLGNBQWMsQ0FBQyxDQUFDO0FBQ3JELFNBQU8sTUFBTSxRQUFRLElBQUksSUFBSTtBQUM3QixNQUFJLENBQUMsUUFBUSxHQUFJO0FBQ2pCLFFBQU0sT0FBTyxRQUFRO0FBRXJCLFNBQU8sTUFBTSxLQUFLLFFBQVEsUUFBUSxFQUFFO0FBQ3BDLFNBQU8sVUFBVSxLQUFLLE1BQU0sRUFBRSxNQUFNLElBQUksT0FBTyxHQUFHLENBQUM7QUFDbkQsU0FBTyxVQUFVLEtBQUssUUFBUSxFQUFFLEdBQUcsS0FBSyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFDdkQsU0FBTyxNQUFNLEtBQUssUUFBUSxRQUFRLEVBQUU7QUFDcEMsU0FBTyxNQUFNLEtBQUssUUFBUSxPQUFPLENBQUMsUUFBUSxJQUFJLFNBQVMsT0FBTyxFQUFFLFFBQVEsQ0FBQztBQUN6RSxTQUFPLE1BQU0sS0FBSyxRQUFRLE9BQU8sQ0FBQyxRQUFRLElBQUksU0FBUyxNQUFNLEVBQUUsUUFBUSxDQUFDO0FBQ3hFLFNBQU8sTUFBTSxLQUFLLFFBQVEsT0FBTyxDQUFDLFFBQVEsSUFBSSxTQUFTLE1BQU0sRUFBRSxRQUFRLENBQUM7QUFDeEUsU0FBTyxNQUFNLEtBQUssUUFBUSxPQUFPLENBQUMsUUFBUSxJQUFJLFNBQVMsUUFBUSxFQUFFLFFBQVEsQ0FBQztBQUUxRSxRQUFNLFdBQVcsb0JBQW9CLEVBQUUsVUFBVSxPQUFPLElBQUk7QUFDNUQsU0FBTyxNQUFNLFNBQVMsSUFBSSxNQUFNLFNBQVMsUUFBUSxLQUFLLElBQUksQ0FBQztBQUMzRCxNQUFJLENBQUMsU0FBUyxNQUFNLENBQUMsU0FBUyxjQUFlO0FBQzdDLFNBQU8sTUFBTSxTQUFTLGNBQWMsV0FBVyxZQUFZO0FBQzNELFNBQU8sTUFBTSxTQUFTLGNBQWMsYUFBYSx1QkFBdUI7QUFDeEUsU0FBTyxNQUFNLFNBQVMsY0FBYyxZQUFZLGdCQUFnQixJQUFJLENBQUM7QUFFckUsUUFBTSxTQUFTLGlCQUFpQixPQUFPLE1BQU0sU0FBUyxhQUFhO0FBQ25FLFNBQU8sTUFBTSxPQUFPLElBQUksTUFBTSxPQUFPLEtBQUssS0FBSyxPQUFPLFFBQVEsS0FBSyxJQUFJLENBQUM7QUFDeEUsTUFBSSxDQUFDLE9BQU8sR0FBSTtBQUNoQixRQUFNLEVBQUUsT0FBTyxJQUFJO0FBRW5CLFNBQU8sTUFBTSxPQUFPLE1BQU0sT0FBTztBQUNqQyxTQUFPLE1BQU0sT0FBTyxhQUFhLEVBQUU7QUFDbkMsU0FBTyxVQUFVLE9BQU8sVUFBVSxFQUFFLE1BQU0sSUFBSSxPQUFPLEdBQUcsQ0FBQztBQUN6RCxTQUFPLFVBQVUsT0FBTyxpQkFBaUIsRUFBRSxPQUFPLElBQUksTUFBTSxHQUFHLENBQUM7QUFDaEUsU0FBTyxVQUFVLE9BQU8sZ0JBQWdCLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxDQUFDO0FBQy9ELFNBQU8sTUFBTSxPQUFPLGVBQWUsT0FBTyxpQkFBaUIsQ0FBQztBQUU1RCxRQUFNLFFBQVEsWUFBWSxLQUFLO0FBQy9CLFNBQU8sTUFBTSxNQUFNLFFBQVEsT0FBTyxRQUFRLHNDQUFzQztBQUNoRixTQUFPLE1BQU0sTUFBTSxVQUFVLE9BQU8sUUFBUTtBQUM1QyxTQUFPLFNBQVMsTUFBTSxXQUFXLE9BQU8sU0FBUztBQUNqRCxTQUFPLFNBQVMsTUFBTSxZQUFZLE9BQU8sVUFBVTtBQUNuRCxTQUFPLE1BQU0sTUFBTSxXQUFXLE1BQU0sQ0FBQztBQUVyQyxRQUFNLFNBQVMsTUFBTSxXQUFXLElBQUksS0FBSyxFQUFFO0FBQzNDLFNBQU8sR0FBRyxNQUFNO0FBQ2hCLFNBQU8sTUFBTSxPQUFPLE1BQU0sT0FBTztBQUNqQyxTQUFPLE1BQU0sT0FBTyxRQUFRLFFBQVEsRUFBRTtBQUN0QyxTQUFPLE1BQU0sT0FBTyxlQUFlLE1BQU0sUUFBUTtBQUNqRCxTQUFPLE1BQU0sT0FBTyxhQUFhLElBQUk7QUFJckMsUUFBTSxTQUFTLGVBQWUsT0FBTyxvQkFBb0IsR0FBRyxjQUFjLENBQUMsQ0FBQztBQUM1RSxTQUFPLE1BQU0sT0FBTyxJQUFJLEtBQUs7QUFDN0IsTUFBSSxDQUFDLE9BQU8sSUFBSTtBQUNkLFdBQU8sTUFBTSxPQUFPLE1BQU0sd0JBQXdCO0FBQ2xELFdBQU8sR0FBRyxPQUFPLFFBQVEsS0FBSyxDQUFDLE1BQU0sRUFBRSxTQUFTLGdCQUFnQixDQUFDLENBQUM7QUFBQSxFQUNwRTtBQUNBLFNBQU8sVUFBVSxZQUFZLEtBQUssR0FBRyxLQUFLO0FBQzVDLENBQUM7QUFFRCxLQUFLLHNFQUFzRSxNQUFNO0FBQy9FLFFBQU0sSUFBSSxRQUFRO0FBQ2xCLFFBQU0sUUFBUSxFQUFFO0FBQ2hCLFNBQU8sVUFBVSxhQUFhLEdBQUcsRUFBRSxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLElBQUksQ0FBQztBQUl2RSxRQUFNLFdBQVcsWUFBWSxPQUFPLGVBQWUsR0FBRztBQUFBLElBQ3BELFFBQVE7QUFBQSxJQUNSLE1BQU0sYUFBYTtBQUFBLElBQ25CLFFBQVE7QUFBQSxJQUNSLE9BQU87QUFBQSxFQUNULEdBQUcsRUFBRSxTQUFTLGdCQUFnQixHQUFHLGlCQUFpQixJQUFJLE9BQU8sQ0FBQztBQUM5RCxTQUFPLE1BQU0sU0FBUyxJQUFJLEtBQUs7QUFDL0IsTUFBSSxDQUFDLFNBQVMsSUFBSTtBQUNoQixXQUFPLE1BQU0sU0FBUyxPQUFPLFdBQVc7QUFDeEMsV0FBTyxNQUFNLFNBQVMsTUFBTSxnQkFBZ0I7QUFDNUMsV0FBTyxHQUFHLFNBQVMsUUFBUSxLQUFLLENBQUMsTUFBTSxFQUFFLFNBQVMsMEJBQTBCLENBQUMsQ0FBQztBQUFBLEVBQ2hGO0FBR0EsZUFBYSxDQUFDO0FBQ2QsUUFBTSxnQkFBZ0I7QUFBQSxJQUNwQjtBQUFBLElBQU8sWUFBWTtBQUFBLElBQWlCLENBQUMsWUFBWSxTQUFTLENBQUMsQ0FBQztBQUFBLEVBQzlELEVBQUU7QUFDRixRQUFNQSxRQUFPLFlBQVksR0FBRyxJQUFJO0FBRWhDLFNBQU8sTUFBTUEsTUFBSyxLQUFLLFNBQVMsUUFBUSxDQUFDO0FBQ3pDLFNBQU8sVUFBVUEsTUFBSyxLQUFLLFNBQVMsQ0FBQyxHQUFHLFlBQVksU0FBUyxDQUFDLENBQUM7QUFDL0QsU0FBTyxNQUFNQSxNQUFLLE9BQU8sV0FBVyxFQUFFO0FBQ3RDLFNBQU8sTUFBTUEsTUFBSyxPQUFPLFlBQVksQ0FBQztBQUN0QyxTQUFPLE1BQU1BLE1BQUssT0FBTyxZQUFZLEVBQUU7QUFDdkMsU0FBTyxNQUFNQSxNQUFLLE9BQU8sY0FBYyxFQUFFO0FBQ3pDLFNBQU8sVUFBVUEsTUFBSyxPQUFPLGlCQUFpQixDQUFDLENBQUM7QUFFaEQsV0FBUyxJQUFJLEdBQUcsSUFBSSxrQkFBa0IsUUFBUSxLQUFLO0FBQ2pELGFBQVMsSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQy9CLFlBQU0sSUFBSSxNQUFNO0FBQ2hCLGFBQU8sTUFBTSxVQUFVLE9BQU8sR0FBRyxDQUFDLEdBQUcsa0JBQWtCLENBQUMsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDN0UsYUFBTyxNQUFNLG1CQUFtQixPQUFPLEdBQUcsQ0FBQyxHQUFHLElBQUksUUFBUSxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFBQSxJQUMzRTtBQUFBLEVBQ0Y7QUFDQSxTQUFPO0FBQUEsSUFDTCxvQkFBb0IsT0FBTyxZQUFZLGlCQUFpQixDQUFDLFlBQVksU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFO0FBQUEsSUFDbkY7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUVBLFFBQU0sVUFBVSxjQUFjLE9BQU8sYUFBYSxDQUFDLENBQUM7QUFDcEQsU0FBTyxNQUFNLFFBQVEsSUFBSSxJQUFJO0FBQzdCLE1BQUksQ0FBQyxRQUFRLEdBQUk7QUFDakIsUUFBTSxPQUFPLFFBQVE7QUFDckIsU0FBTyxNQUFNLEtBQUssUUFBUSxRQUFRLEVBQUU7QUFDcEMsU0FBTyxVQUFVLEtBQUssTUFBTSxFQUFFLE9BQU8sRUFBRSxDQUFDO0FBRXhDLFFBQU0sY0FBYyxLQUFLLFFBQVEsT0FBTyxDQUFDLFFBQVEsSUFBSSxTQUFTLE1BQU07QUFDcEUsU0FBTyxNQUFNLFlBQVksUUFBUSxDQUFDO0FBQ2xDLFNBQU8sVUFBVSxZQUFZLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxpQkFBaUIsQ0FBQztBQUN4RSxXQUFTLElBQUksR0FBRyxJQUFJLFlBQVksUUFBUSxLQUFLO0FBQzNDLFdBQU8sR0FBRyxLQUFLLElBQUksWUFBWSxDQUFDLEVBQUUsSUFBSSxZQUFZLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDO0FBQUEsRUFDbEU7QUFDQSxTQUFPLE1BQU0sS0FBSyxRQUFRLE9BQU8sQ0FBQyxRQUFRLElBQUksU0FBUyxNQUFNLEVBQUUsUUFBUSxFQUFFO0FBRXpFLFFBQU0sY0FBYyxZQUFZLEtBQUs7QUFDckMsUUFBTSxRQUFRLGVBQWUsT0FBTyxvQkFBb0IsR0FBRyxhQUFhLENBQUMsQ0FBQztBQUMxRSxTQUFPLE1BQU0sTUFBTSxJQUFJLE1BQU0sTUFBTSxLQUFLLEtBQUssTUFBTSxRQUFRLEtBQUssSUFBSSxDQUFDO0FBQ3JFLE1BQUksQ0FBQyxNQUFNLEdBQUk7QUFDZixTQUFPLE1BQU0sTUFBTSxPQUFPLGFBQWEsRUFBRTtBQUN6QyxTQUFPLFVBQVUsTUFBTSxPQUFPLFVBQVUsRUFBRSxPQUFPLEVBQUUsQ0FBQztBQUNwRCxTQUFPLE1BQU0sTUFBTSxPQUFPLGdCQUFnQixPQUFPLEVBQUU7QUFDbkQsU0FBTyxNQUFNLE1BQU0sT0FBTyxlQUFlLE9BQU8sRUFBRTtBQUVsRCxRQUFNLGFBQWEsWUFBWSxLQUFLO0FBQ3BDLFNBQU8sTUFBTSxXQUFXLFFBQVEsWUFBWSxNQUFNO0FBQ2xELFNBQU8sTUFBTSxXQUFXLFVBQVUsWUFBWSxRQUFRO0FBQ3RELFNBQU8sU0FBUyxXQUFXLFdBQVcsWUFBWSxTQUFTO0FBQzNELFNBQU8sTUFBTSxNQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsR0FBRyxNQUFNLE1BQU07QUFDeEQsU0FBTyxVQUFVLHFCQUFxQixPQUFPLFlBQVksUUFBUSxHQUFHLENBQUMsQ0FBQztBQUN0RSxTQUFPLFVBQVUsbUJBQW1CLE9BQU8sWUFBWSxlQUFlLEdBQUcsQ0FBQyxDQUFDO0FBQzdFLENBQUM7QUFFRCxLQUFLLHNFQUFzRSxNQUFNO0FBQy9FLFFBQU0sSUFBSSxRQUFRO0FBQ2xCLFFBQU0sUUFBUSxFQUFFO0FBQ2hCLFFBQU0sZ0JBQWdCO0FBQUEsSUFDcEI7QUFBQSxJQUFPLFlBQVk7QUFBQSxJQUFpQixDQUFDLFlBQVksU0FBUyxDQUFDLENBQUM7QUFBQSxFQUM5RCxFQUFFO0FBQ0YsUUFBTUEsUUFBTyxZQUFZLEdBQUcsSUFBSTtBQUVoQyxTQUFPLE1BQU1BLE1BQUssT0FBTyxXQUFXLEVBQUU7QUFDdEMsU0FBTyxNQUFNQSxNQUFLLE9BQU8sWUFBWSxFQUFFO0FBQ3ZDLFNBQU8sTUFBTUEsTUFBSyxPQUFPLFlBQVksR0FBRztBQUN4QyxTQUFPLE1BQU1BLE1BQUssT0FBTyxjQUFjLEVBQUU7QUFDekMsU0FBTyxVQUFVQSxNQUFLLE9BQU8sZ0JBQWdCLElBQUksQ0FBQyxNQUFNLEVBQUUsUUFBUSxHQUFHO0FBQUEsSUFDbkU7QUFBQSxJQUNBO0FBQUEsRUFDRixDQUFDO0FBQ0QsU0FBTyxVQUFVQSxNQUFLLE9BQU8saUJBQWlCLEVBQUUsS0FBSyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQ2xFLFNBQU8sVUFBVUEsTUFBSyxPQUFPLGdCQUFnQixFQUFFLEtBQUssR0FBRyxPQUFPLElBQUksTUFBTSxHQUFHLENBQUM7QUFDNUUsU0FBTztBQUFBLElBQ0wsb0JBQW9CLE9BQU8sWUFBWSxpQkFBaUIsQ0FBQyxZQUFZLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRTtBQUFBLElBQ25GO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFFQSxhQUFXLFFBQVEsb0JBQW9CO0FBQ3JDLGFBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksS0FBSztBQUN2QyxlQUFTLElBQUksRUFBRSxPQUFPLEtBQUssS0FBSyxJQUFJLEtBQUssRUFBRSxPQUFPLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFDbkUsZUFBTyxNQUFNLFVBQVUsT0FBTyxHQUFHLENBQUMsR0FBRyxLQUFLLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFO0FBQy9ELGVBQU8sTUFBTSxtQkFBbUIsT0FBTyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO0FBQUEsTUFDekU7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVBLFFBQU0sVUFBVSxjQUFjLE9BQU8sYUFBYSxDQUFDLENBQUM7QUFDcEQsU0FBTyxNQUFNLFFBQVEsSUFBSSxJQUFJO0FBQzdCLE1BQUksQ0FBQyxRQUFRLEdBQUk7QUFDakIsUUFBTSxPQUFPLFFBQVE7QUFDckIsU0FBTyxNQUFNLEtBQUssUUFBUSxRQUFRLEVBQUU7QUFDcEMsU0FBTyxVQUFVLEtBQUssTUFBTSxFQUFFLE1BQU0sR0FBRyxPQUFPLEdBQUcsQ0FBQztBQUNsRCxTQUFPLFVBQVUsS0FBSyxVQUFVLGtCQUFrQjtBQUNsRCxTQUFPLFVBQVUsS0FBSyxVQUFVO0FBQUEsSUFDOUIsRUFBRSxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxJQUFJLElBQUksR0FBRztBQUFBLEVBQ3ZELENBQUM7QUFFRCxRQUFNLE9BQU8sS0FBSyxRQUFRLE9BQU8sQ0FBQyxRQUFRLElBQUksU0FBUyxVQUFVO0FBQ2pFLFFBQU0sT0FBTyxLQUFLLFFBQVEsT0FBTyxDQUFDLFFBQVEsSUFBSSxTQUFTLFVBQVU7QUFDakUsUUFBTSxRQUFRLEtBQUssUUFBUSxPQUFPLENBQUMsUUFBUSxJQUFJLFNBQVMsZ0JBQWdCO0FBQ3hFLFNBQU8sTUFBTSxLQUFLLFFBQVEsQ0FBQztBQUMzQixTQUFPLE1BQU0sS0FBSyxRQUFRLENBQUM7QUFDM0IsU0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLFNBQU8sVUFBVSxLQUFLLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztBQUN2RCxhQUFXLE9BQU8sTUFBTTtBQUN0QixXQUFPLEdBQUcsQ0FBQyxPQUFPLE9BQU8sS0FBSyxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUM7QUFBQSxFQUNqRDtBQUNBLGFBQVcsUUFBUSxPQUFPO0FBQ3hCLFdBQU8sTUFBTSxLQUFLLEdBQUcsQ0FBQztBQUFBLEVBQ3hCO0FBRUEsUUFBTSxjQUFjLFlBQVksS0FBSztBQUNyQyxRQUFNLFFBQVEsZUFBZSxPQUFPLG9CQUFvQixHQUFHLGFBQWEsQ0FBQyxDQUFDO0FBQzFFLFNBQU8sTUFBTSxNQUFNLElBQUksTUFBTSxNQUFNLEtBQUssS0FBSyxNQUFNLFFBQVEsS0FBSyxJQUFJLENBQUM7QUFDckUsTUFBSSxDQUFDLE1BQU0sR0FBSTtBQUNmLFNBQU8sTUFBTSxNQUFNLE9BQU8sYUFBYSxFQUFFO0FBQ3pDLFNBQU8sVUFBVSxNQUFNLE9BQU8sVUFBVSxFQUFFLE1BQU0sR0FBRyxPQUFPLEdBQUcsQ0FBQztBQUM5RCxTQUFPLFVBQVUsTUFBTSxPQUFPLGlCQUFpQixFQUFFLEtBQUssR0FBRyxPQUFPLElBQUksTUFBTSxHQUFHLENBQUM7QUFDOUUsU0FBTyxVQUFVLE1BQU0sT0FBTyxnQkFBZ0IsRUFBRSxLQUFLLEdBQUcsT0FBTyxJQUFJLE1BQU0sR0FBRyxDQUFDO0FBRTdFLFFBQU0sYUFBYSxZQUFZLEtBQUs7QUFDcEMsU0FBTyxNQUFNLFdBQVcsUUFBUSxZQUFZLE1BQU07QUFDbEQsU0FBTyxTQUFTLFdBQVcsV0FBVyxZQUFZLFNBQVM7QUFDM0QsU0FBTyxNQUFNLE1BQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxHQUFHLE1BQU0sU0FBUztBQUMzRCxTQUFPLFVBQVUscUJBQXFCLE9BQU8sWUFBWSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0FBQ3RFLFNBQU8sVUFBVSxtQkFBbUIsT0FBTyxZQUFZLGVBQWUsR0FBRyxDQUFDLENBQUM7QUFDN0UsQ0FBQztBQUVELEtBQUssZ0ZBQWdGLE1BQU07QUFDekYsUUFBTSxJQUFJLFFBQVE7QUFDbEIsZUFBYSxDQUFDO0FBQ2QsUUFBTSxRQUFRLEVBQUU7QUFDaEIsUUFBTSxVQUFVLGNBQWMsT0FBTyxjQUFjLENBQUMsQ0FBQztBQUNyRCxTQUFPLE1BQU0sUUFBUSxJQUFJLElBQUk7QUFDN0IsTUFBSSxDQUFDLFFBQVEsR0FBSTtBQUNqQixRQUFNLE9BQU8sUUFBUTtBQUNyQixRQUFNLFdBQVcsb0JBQW9CLEVBQUUsVUFBVSxPQUFPLElBQUk7QUFDNUQsU0FBTyxNQUFNLFNBQVMsSUFBSSxJQUFJO0FBQzlCLE1BQUksQ0FBQyxTQUFTLE1BQU0sQ0FBQyxTQUFTLGNBQWU7QUFDN0MsUUFBTSxRQUFRLFNBQVM7QUFDdkIsUUFBTSxTQUFTLFlBQVksS0FBSztBQUVoQyxRQUFNLGVBQWUsaUJBQWlCLE9BQU8sTUFBTTtBQUFBLElBQ2pELEdBQUc7QUFBQSxJQUFPLFlBQVk7QUFBQSxFQUN4QixDQUFDO0FBQ0QsU0FBTyxNQUFNLGFBQWEsSUFBSSxLQUFLO0FBQ25DLE1BQUksQ0FBQyxhQUFhLEdBQUksUUFBTyxNQUFNLGFBQWEsTUFBTSxpQkFBaUI7QUFFdkUsUUFBTSxrQkFBa0IsaUJBQWlCLE9BQU8sTUFBTTtBQUFBLElBQ3BELEdBQUc7QUFBQSxJQUFPLFdBQVc7QUFBQSxFQUN2QixDQUFDO0FBQ0QsU0FBTyxNQUFNLGdCQUFnQixJQUFJLEtBQUs7QUFDdEMsTUFBSSxDQUFDLGdCQUFnQixHQUFJLFFBQU8sTUFBTSxnQkFBZ0IsTUFBTSx1QkFBdUI7QUFFbkYsUUFBTSxXQUFXLGlCQUFpQixPQUFPLE1BQU07QUFBQSxJQUM3QyxHQUFHO0FBQUEsSUFDSCxVQUFVLENBQUMsRUFBRSxHQUFHLE1BQU0sU0FBUyxDQUFDLEdBQUcsSUFBSSxNQUFNLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDO0FBQUEsRUFDbkUsQ0FBQztBQUNELFNBQU8sTUFBTSxTQUFTLElBQUksS0FBSztBQUMvQixNQUFJLENBQUMsU0FBUyxHQUFJLFFBQU8sTUFBTSxTQUFTLE1BQU0sbUJBQW1CO0FBRWpFLFFBQU0saUJBQWlCLElBQUk7QUFBQSxJQUN6QixFQUFFLFVBQVUsWUFBWSxTQUFTO0FBQUEsSUFBRyxFQUFFLFlBQVksR0FBRztBQUFBLEVBQ3ZELEVBQUUsVUFBVSxPQUFPLElBQUk7QUFDdkIsU0FBTyxNQUFNLGVBQWUsSUFBSSxLQUFLO0FBQ3JDLFNBQU8sR0FBRyxlQUFlLFFBQVEsS0FBSyxDQUFDLE1BQU0sRUFBRSxTQUFTLDRCQUE0QixDQUFDLENBQUM7QUFFdEYsUUFBTSxjQUFjLElBQUk7QUFBQSxJQUN0QixFQUFFLFVBQVUsWUFBWSxTQUFTO0FBQUEsSUFBRyxFQUFFLFNBQVMsR0FBRztBQUFBLEVBQ3BELEVBQUUsVUFBVSxPQUFPLElBQUk7QUFDdkIsU0FBTyxNQUFNLFlBQVksSUFBSSxLQUFLO0FBQ2xDLFNBQU8sR0FBRyxZQUFZLFFBQVEsS0FBSyxDQUFDLE1BQU0sRUFBRSxTQUFTLDBCQUEwQixDQUFDLENBQUM7QUFHakYsUUFBTSxTQUF3QjtBQUFBLElBQzVCLEdBQUc7QUFBQSxJQUNILFNBQVMsS0FBSyxRQUFRLElBQUksQ0FBQyxLQUFLLE1BQU8sTUFBTSxJQUFJLEVBQUUsR0FBRyxLQUFLLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxHQUFJO0FBQUEsRUFDbkY7QUFDQSxTQUFPLEtBQUssYUFBYSxnQkFBZ0IsTUFBTSxDQUFDO0FBQ2hELFFBQU0sVUFBVSxvQkFBb0IsRUFBRSxVQUFVLE9BQU8sTUFBTTtBQUM3RCxTQUFPLE1BQU0sUUFBUSxJQUFJLEtBQUs7QUFDOUIsU0FBTyxHQUFHLFFBQVEsUUFBUSxLQUFLLENBQUMsTUFBTSxFQUFFLFNBQVMsMkJBQTJCLEtBQ3ZFLEVBQUUsU0FBUywwQkFBMEIsQ0FBQyxDQUFDO0FBSTVDLFFBQU0sa0JBQWtCLGlCQUFpQixPQUFPLFFBQVE7QUFBQSxJQUN0RCxHQUFHO0FBQUEsSUFBTyxZQUFZLGdCQUFnQixNQUFNO0FBQUEsRUFDOUMsQ0FBQztBQUNELFNBQU8sTUFBTSxnQkFBZ0IsSUFBSSxLQUFLO0FBQ3RDLE1BQUksQ0FBQyxnQkFBZ0IsSUFBSTtBQUN2QixXQUFPLE1BQU0sZ0JBQWdCLE1BQU0sd0JBQXdCO0FBQzNELFdBQU8sR0FBRyxnQkFBZ0IsUUFBUSxLQUFLLENBQUMsTUFBTSxFQUFFLFNBQVMsaUNBQWlDLENBQUMsQ0FBQztBQUFBLEVBQzlGO0FBRUEsU0FBTyxVQUFVLFlBQVksS0FBSyxHQUFHLE1BQU07QUFHM0MsU0FBTyxNQUFNLFNBQVMsT0FBTyxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssR0FBRyxJQUFJO0FBQzNELFFBQU0sa0JBQWtCLFlBQVksS0FBSztBQUN6QyxRQUFNLFFBQVEsaUJBQWlCLE9BQU8sTUFBTSxLQUFLO0FBQ2pELFNBQU8sTUFBTSxNQUFNLElBQUksS0FBSztBQUM1QixNQUFJLENBQUMsTUFBTSxHQUFJLFFBQU8sTUFBTSxNQUFNLE1BQU0scUJBQXFCO0FBQzdELFNBQU8sVUFBVSxZQUFZLEtBQUssR0FBRyxlQUFlO0FBQ3RELENBQUM7QUFFRCxLQUFLLHlFQUF5RSxNQUFNO0FBQ2xGLFFBQU0sSUFBSSxRQUFRO0FBQ2xCLGVBQWEsQ0FBQztBQUNkLFFBQU0sUUFBUSxFQUFFO0FBS2hCLFFBQU0sY0FBYyxjQUFjLE9BQU8sY0FBYyxDQUFDLENBQUM7QUFDekQsU0FBTyxNQUFNLFlBQVksSUFBSSxJQUFJO0FBQ2pDLE1BQUksQ0FBQyxZQUFZLEdBQUk7QUFDckIsUUFBTSxTQUF3QjtBQUFBLElBQzVCLEdBQUcsWUFBWTtBQUFBLElBQ2YsU0FBUyxZQUFZLEtBQUssUUFBUSxJQUFJLENBQUMsR0FBRyxNQUFPLE1BQU0sSUFBSSxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBRTtBQUFBLEVBQ3RGO0FBQ0EsU0FBTyxLQUFLLGFBQWEsZ0JBQWdCLE1BQU0sQ0FBQztBQUNoRCxRQUFNLGNBQWMsb0JBQW9CLEVBQUUsVUFBVSxPQUFPLE1BQU07QUFDakUsU0FBTyxNQUFNLFlBQVksSUFBSSxJQUFJO0FBQ2pDLE1BQUksQ0FBQyxZQUFZLE1BQU0sQ0FBQyxZQUFZLGNBQWU7QUFDbkQsUUFBTSxlQUFlLFlBQVksS0FBSztBQUN0QyxRQUFNLFdBQVcsaUJBQWlCLE9BQU8sUUFBUSxZQUFZLGFBQWE7QUFDMUUsU0FBTyxNQUFNLFNBQVMsSUFBSSxLQUFLO0FBQy9CLE1BQUksQ0FBQyxTQUFTLElBQUk7QUFDaEIsV0FBTyxNQUFNLFNBQVMsTUFBTSx3QkFBd0I7QUFDcEQsV0FBTyxHQUFHLFNBQVMsUUFBUSxLQUFLLENBQUMsTUFBTSxFQUFFLFNBQVMsYUFBYSxDQUFDLENBQUM7QUFBQSxFQUNuRTtBQUNBLFNBQU8sVUFBVSxZQUFZLEtBQUssR0FBRyxZQUFZO0FBSWpELFFBQU0sVUFBVSxRQUFRO0FBQ3hCLGVBQWEsT0FBTztBQUNwQixRQUFNLFVBQVUsY0FBYyxRQUFRLE9BQU8sY0FBYyxPQUFPLENBQUM7QUFDbkUsU0FBTyxNQUFNLFFBQVEsSUFBSSxJQUFJO0FBQzdCLE1BQUksQ0FBQyxRQUFRLEdBQUk7QUFDakIsUUFBTSxRQUFRLG9CQUFvQixFQUFFLFVBQVUsUUFBUSxPQUFPLFFBQVEsSUFBSTtBQUN6RSxTQUFPLE1BQU0sTUFBTSxJQUFJLElBQUk7QUFDM0IsTUFBSSxDQUFDLE1BQU0sTUFBTSxDQUFDLE1BQU0sY0FBZTtBQUN2QyxRQUFNLFFBQVE7QUFBQSxJQUNaLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLEdBQUc7QUFBQSxJQUFPLEdBQUc7QUFBQSxJQUFJLEdBQUc7QUFBQSxJQUNwQixLQUFLO0FBQUEsSUFBRyxPQUFPO0FBQUEsSUFBRyxTQUFTO0FBQUEsSUFDM0IsVUFBVTtBQUFBLElBQWdCLFdBQVc7QUFBQSxJQUFHLGlCQUFpQjtBQUFBLElBQ3pELFdBQVc7QUFBQSxJQUFPLGFBQWE7QUFBQSxJQUFPLFVBQVU7QUFBQSxFQUNsRDtBQUNBLFVBQVEsTUFBTSxTQUFTLElBQUksTUFBTSxJQUFJLEtBQUs7QUFDMUMsVUFBUSxNQUFNLGFBQWEsSUFBSSxPQUFPLEVBQUcsS0FBSyxNQUFNLEVBQUU7QUFDdEQsUUFBTSxnQkFBZ0IsWUFBWSxRQUFRLEtBQUs7QUFDL0MsUUFBTSxZQUFZLGlCQUFpQixRQUFRLE9BQU8sUUFBUSxNQUFNLE1BQU0sYUFBYTtBQUNuRixTQUFPLE1BQU0sVUFBVSxJQUFJLEtBQUs7QUFDaEMsTUFBSSxDQUFDLFVBQVUsSUFBSTtBQUNqQixXQUFPLE1BQU0sVUFBVSxNQUFNLHdCQUF3QjtBQUNyRCxXQUFPLEdBQUcsVUFBVSxRQUFRLEtBQUssQ0FBQyxNQUFNLEVBQUUsU0FBUyw4QkFBOEIsQ0FBQyxDQUFDO0FBQUEsRUFDckY7QUFDQSxTQUFPLFVBQVUsWUFBWSxRQUFRLEtBQUssR0FBRyxhQUFhO0FBQzVELENBQUM7QUFFRCxLQUFLLDhFQUE4RSxNQUFNO0FBQ3ZGLFFBQU0sSUFBSSxrQkFBa0I7QUFDNUIsUUFBTSxJQUFJLGtCQUFrQjtBQUM1QixRQUFNLEtBQUssZ0JBQWdCLENBQUM7QUFDNUIsUUFBTSxLQUFLLGdCQUFnQixDQUFDO0FBRTVCLFNBQU8sTUFBTSxHQUFHLElBQUksTUFBTSxHQUFHLE9BQU8sS0FBSyxJQUFJLENBQUM7QUFDOUMsU0FBTyxNQUFNLEdBQUcsSUFBSSxNQUFNLEdBQUcsT0FBTyxLQUFLLElBQUksQ0FBQztBQUM5QyxTQUFPLFVBQVUsR0FBRyxRQUFRLENBQUMsQ0FBQztBQUU5QixTQUFPLFVBQVUsR0FBRyxNQUFNLGFBQWEsR0FBRyxNQUFNLFdBQVc7QUFDM0QsU0FBTyxVQUFVLEdBQUcsS0FBSyxhQUFhLEdBQUcsS0FBSyxXQUFXO0FBQ3pELFNBQU8sVUFBVSxHQUFHLEtBQUssYUFBYSxHQUFHLEtBQUssV0FBVztBQUN6RCxTQUFPLFVBQVUsR0FBRyxNQUFNLFdBQVcsR0FBRyxNQUFNLFNBQVM7QUFDdkQsU0FBTyxVQUFVLEdBQUcsS0FBSyxXQUFXLEdBQUcsS0FBSyxTQUFTO0FBQ3JELFNBQU8sVUFBVSxHQUFHLEtBQUssV0FBVyxHQUFHLEtBQUssU0FBUztBQUVyRCxTQUFPLE1BQU0sR0FBRyxNQUFNLGFBQWEsV0FBVyxDQUFDO0FBQy9DLFNBQU8sTUFBTSxHQUFHLE1BQU0sYUFBYSxZQUFZLEVBQUU7QUFDakQsU0FBTyxNQUFNLEdBQUcsTUFBTSxhQUFhLFlBQVksRUFBRTtBQUNqRCxTQUFPLE1BQU0sR0FBRyxLQUFLLGFBQWEsV0FBVyxFQUFFO0FBQy9DLFNBQU8sTUFBTSxHQUFHLEtBQUssYUFBYSxZQUFZLENBQUM7QUFDL0MsU0FBTyxNQUFNLEdBQUcsS0FBSyxhQUFhLFlBQVksRUFBRTtBQUNoRCxTQUFPLE1BQU0sR0FBRyxLQUFLLGFBQWEsY0FBYyxFQUFFO0FBQ2xELFNBQU8sTUFBTSxHQUFHLEtBQUssYUFBYSxXQUFXLEVBQUU7QUFDL0MsU0FBTyxNQUFNLEdBQUcsS0FBSyxhQUFhLFlBQVksRUFBRTtBQUNoRCxTQUFPLE1BQU0sR0FBRyxLQUFLLGFBQWEsWUFBWSxHQUFHO0FBQ2pELFNBQU8sTUFBTSxHQUFHLEtBQUssYUFBYSxjQUFjLEVBQUU7QUFFbEQsU0FBTyxNQUFNLEdBQUcsTUFBTSxXQUFXLGFBQWEsRUFBRTtBQUNoRCxTQUFPLE1BQU0sR0FBRyxLQUFLLFdBQVcsYUFBYSxFQUFFO0FBQy9DLFNBQU8sTUFBTSxHQUFHLEtBQUssV0FBVyxhQUFhLEVBQUU7QUFDL0MsU0FBTyxVQUFVLEdBQUcsTUFBTSxXQUFXLFVBQVUsRUFBRSxNQUFNLElBQUksT0FBTyxHQUFHLENBQUM7QUFDdEUsU0FBTyxVQUFVLEdBQUcsS0FBSyxXQUFXLFVBQVUsRUFBRSxPQUFPLEVBQUUsQ0FBQztBQUMxRCxTQUFPLFVBQVUsR0FBRyxLQUFLLFdBQVcsVUFBVSxFQUFFLE1BQU0sR0FBRyxPQUFPLEdBQUcsQ0FBQztBQUNwRSxTQUFPLFVBQVUsbUJBQW1CLEVBQUUsR0FBRyxFQUFFLE1BQU0sSUFBSSxPQUFPLEdBQUcsQ0FBQztBQUVoRSxTQUFPLFVBQVUsR0FBRyxpQkFBaUIsRUFBRSxPQUFPLElBQUksTUFBTSxHQUFHLENBQUM7QUFDNUQsU0FBTyxVQUFVLEdBQUcsZ0JBQWdCLEVBQUUsS0FBSyxHQUFHLE9BQU8sR0FBRyxNQUFNLEdBQUcsQ0FBQztBQUNsRSxTQUFPLE1BQU0sRUFBRSxNQUFNLFdBQVcsTUFBTSxDQUFDO0FBQ3ZDLFNBQU8sVUFBVSxDQUFDLEdBQUcsRUFBRSxNQUFNLFdBQVcsS0FBSyxDQUFDLEdBQUc7QUFBQSxJQUMvQztBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRixDQUFDO0FBR0QsUUFBTSxZQUFZLEdBQUcsTUFBTTtBQUMzQixRQUFNLGFBQWEsR0FBRyxNQUFNO0FBQzVCLFFBQU0sV0FBVyxHQUFHLEtBQUs7QUFDekIsUUFBTSxZQUFZLEdBQUcsS0FBSztBQUMxQixRQUFNLFdBQVcsR0FBRyxLQUFLO0FBQ3pCLFFBQU0sWUFBWSxHQUFHLEtBQUs7QUFDMUIsU0FBTyxNQUFNLFVBQVUsZ0JBQWdCLFVBQVUsZ0JBQWdCLEVBQUU7QUFDbkUsU0FBTyxNQUFNLFdBQVcsZ0JBQWdCLFdBQVcsZ0JBQWdCLENBQUM7QUFDcEUsU0FBTyxNQUFNLFNBQVMsZ0JBQWdCLFNBQVMsZ0JBQWdCLEVBQUU7QUFDakUsU0FBTyxNQUFNLFVBQVUsZ0JBQWdCLFVBQVUsZ0JBQWdCLENBQUM7QUFDbEUsU0FBTyxNQUFNLFNBQVMsZ0JBQWdCLFNBQVMsZ0JBQWdCLEdBQUc7QUFDbEUsU0FBTyxNQUFNLFVBQVUsZ0JBQWdCLFVBQVUsZ0JBQWdCLENBQUM7QUFDbEUsU0FBTztBQUFBLElBQ0wsRUFBRSxNQUFNLFdBQVcsVUFBVTtBQUFBLElBQzdCO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFFQSxTQUFPLFVBQVUsR0FBRyxRQUFRLEdBQUcsTUFBTTtBQUNyQyxTQUFPO0FBQUEsSUFDTCxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsT0FBTyxlQUFlLEVBQUU7QUFBQSxJQUN2RCxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsT0FBTyxlQUFlLEVBQUU7QUFBQSxFQUN6RDtBQUNBLFNBQU87QUFBQSxJQUNMLG9CQUFvQixFQUFFLE9BQU8sRUFBRSxPQUFPLGVBQWU7QUFBQSxJQUNyRCxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsT0FBTyxlQUFlO0FBQUEsRUFDdkQ7QUFDQSxTQUFPLE1BQU0sdUJBQXVCLEVBQUUsS0FBSyxHQUFHLHVCQUF1QixFQUFFLEtBQUssQ0FBQztBQUM3RSxTQUFPLFVBQVUscUJBQXFCLEVBQUUsT0FBTyxFQUFFLE9BQU8sUUFBUSxHQUFHLENBQUMsQ0FBQztBQUNyRSxTQUFPLFVBQVUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLE9BQU8sZUFBZSxHQUFHLENBQUMsQ0FBQztBQUcxRSxTQUFPLE1BQU0sVUFBVSxFQUFFLE9BQU8sS0FBSyxHQUFHLEdBQUcsRUFBRTtBQUM3QyxTQUFPLE1BQU0sbUJBQW1CLEVBQUUsT0FBTyxLQUFLLEdBQUcsR0FBRyxJQUFJLE1BQU07QUFDOUQsU0FBTyxNQUFNLFVBQVUsRUFBRSxPQUFPLEtBQUssR0FBRyxHQUFHLEVBQUU7QUFDN0MsU0FBTyxNQUFNLFVBQVUsRUFBRSxPQUFPLEtBQUssR0FBRyxHQUFHLEVBQUU7QUFDN0MsU0FBTyxNQUFNLFVBQVUsRUFBRSxPQUFPLEtBQUssR0FBRyxHQUFHLEVBQUU7QUFDN0MsU0FBTyxNQUFNLG1CQUFtQixFQUFFLE9BQU8sS0FBSyxHQUFHLEdBQUcsSUFBSSxJQUFJO0FBQzlELENBQUM7IiwKICAibmFtZXMiOiBbImlkIiwgImRpZ2VzdCIsICJmYWlsIiwgInByZXBBdXRob3JpemVyIiwgInN0cnVjdHVyZUF1dGhvcml6ZXIiLCAicHJlcCJdCn0K
