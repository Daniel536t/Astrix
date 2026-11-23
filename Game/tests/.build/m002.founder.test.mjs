// tests/m002.founder.test.ts
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
var MAX_SNAPSHOT_JSON_BYTES = 25e6;
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
function decodeWorldSnapshot(json) {
  if (json.length > MAX_SNAPSHOT_JSON_BYTES) throw new Error("snapshot exceeds the JSON size limit");
  return validateWorldSnapshot(JSON.parse(json));
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

// src/render/structures.ts
import * as THREE from "three";
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

// src/render/structures.ts
var M = palette_default.materials;
var H = (k) => M[k].hex;
var TONE = {
  stone: H("noxel_stone"),
  stone_b: H("noxel_stone_b"),
  timber: H("bark_dark"),
  ochre: H("strata_ochre"),
  accent: H("accent_blue"),
  gravel: new THREE.Color(H("stone_body_b")).lerp(new THREE.Color(H("sand")), 0.35).getHexString().padStart(6, "0"),
  soil: H("strata_ochre"),
  crop: H("canopy_green_a")
};
function toneColour(tone) {
  const raw = tone && TONE[tone] || TONE.stone;
  return raw.startsWith("#") ? raw : `#${raw}`;
}
var STRUCTURE_MATERIAL = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true
});
var CROP_MATERIAL = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true
});
function paint(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute("uv");
  const colour = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = colour.r;
    arr[i * 3 + 1] = colour.g;
    arr[i * 3 + 2] = colour.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}
function structureAnchor(structure, height) {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const m of structure.modules) {
    const extent = Math.hypot(m.w, m.d) / 2;
    bounds.expandByPoint(point.set(m.x - extent, m.y, m.z - extent));
    bounds.expandByPoint(point.set(m.x + extent, m.y + m.h + height, m.z + extent));
  }
  const centre = bounds.getCenter(new THREE.Vector3());
  return { x: centre.x, y: centre.y + height / 2, z: centre.z };
}
function moduleGeometry(m, designVersion) {
  if (m.kind === "crop_row" && designVersion === 2) return cropGeometry(m);
  const g = new THREE.BoxGeometry(m.w, m.h, m.d);
  if (m.rot) g.rotateY(m.rot);
  g.translate(m.x, m.y + m.h / 2, m.z);
  return paint(g, toneColour(m.tone));
}
function cropGeometry(m) {
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
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    leaves.push(paint(g, toneColour(m.tone)));
  }
  const merged = mergeGeometries(leaves, false);
  for (const leaf of leaves) leaf.dispose();
  if (!merged) throw new Error("could not merge crop-row presentation");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
function buildStructureMesh(structure) {
  if (structure.designVersion === 2 && structure.kind === "terrace") {
    const group = new THREE.Group();
    group.name = `structure_${structure.kind}`;
    group.userData.structureId = structure.id;
    group.userData.inspectTarget = structureAnchor(structure, 0.6);
    const earth = buildStructureMesh({
      ...structure,
      designVersion: void 0,
      modules: structure.modules.filter((m) => m.kind !== "crop_row")
    });
    if (!(earth instanceof THREE.Mesh)) throw new Error("unexpected terrace group");
    group.add(earth);
    const parts2 = structure.modules.filter((m) => m.kind === "crop_row").map(cropGeometry);
    const merged2 = mergeGeometries(parts2, false);
    for (const part of parts2) part.dispose();
    if (!merged2) throw new Error(`could not merge crop rows ${structure.id}`);
    const foliage = new THREE.Mesh(merged2, CROP_MATERIAL);
    foliage.name = "crop_row_foliage";
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    foliage.userData.presentationBounds = structure.modules.filter((m) => m.kind === "crop_row").length;
    group.add(foliage);
    return group;
  }
  const parts = structure.modules.map((m) => moduleGeometry(m, structure.designVersion));
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error(`could not merge structure ${structure.id}`);
  const mesh = new THREE.Mesh(merged, STRUCTURE_MATERIAL);
  mesh.name = `structure_${structure.kind}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.structureId = structure.id;
  mesh.userData.inspectTarget = structureAnchor(structure, structure.kind === "house" ? 0.6 : 0.3);
  return mesh;
}

// tests/m002.founder.test.ts
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function build(session, projectId) {
  return session.dispatch({
    schema: session.journal.schema,
    id: `build-${projectId}`,
    type: "build",
    projectId,
    expectedRevision: session.world.revision,
    ...session.journal.schema >= 2 ? { designVersion: FOUNDER_DESIGN_VERSION } : {}
  });
}
function overlap(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w - 1e-9 && Math.abs(a.z - b.z) * 2 < a.d + b.d - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
}
function assertOpening(structure, opening) {
  assert.equal(
    structure.modules.some((m) => overlap(m, opening)),
    false,
    `opening intersects ${JSON.stringify(opening)}`
  );
}
test("schema-2 commands select only design 2 and preserve harvest schema 1", () => {
  const session = GameSession.legacyGenesis(1337, 2);
  assert.equal(session.journal.schema, 2);
  assert.equal(session.snapshot.schema, 2);
  const result = build(session, "house");
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(session.world.structures.values().next().value?.designVersion, 2);
  assert.equal(session.dispatch(clone(session.journal.entries[0].command)).duplicate, true);
  assert.equal(session.dispatch({
    schema: 1,
    id: "wrong-world",
    type: "build",
    projectId: "path",
    expectedRevision: session.world.revision
  }).code, "schema_mismatch");
  assert.throws(() => validateCommand({
    schema: 2,
    id: "wrong-harvest",
    type: "harvest",
    entityId: "e:30,30:4",
    expectedRevision: 0
  }), /unsupported/);
  assert.throws(() => validateCommand({
    schema: 2,
    id: "bad-design",
    type: "build",
    projectId: "house",
    expectedRevision: 0,
    designVersion: 1
  }), /design/);
  assert.throws(() => validateCommand({
    schema: 1,
    id: "sneak-design",
    type: "build",
    projectId: "house",
    expectedRevision: 0,
    designVersion: 2
  }));
});
test("legacy planning, structure hashes and snapshots remain byte-compatible", () => {
  const legacy = GameSession.legacyGenesis();
  assert.equal(legacy.snapshot.schema, 1);
  assert.equal(build(legacy, "house").ok, true);
  const record = legacy.world.structures.values().next().value;
  assert.equal(record.designVersion, void 0);
  assert.equal(record.modules.length, 17);
  assert.equal("designVersion" in record, false);
  const goldenDigest = record.id;
  const goldenHash = canonicalStructureHash(legacy.world);
  const goldenSnapshot = JSON.stringify(legacy.snapshot);
  const replay = GameSession.replay(clone(legacy.journal));
  assert.equal(replay.world.structures.get(goldenDigest)?.designVersion, void 0);
  assert.equal(canonicalStructureHash(replay.world), goldenHash);
  assert.equal(JSON.stringify(replay.snapshot), goldenSnapshot);
  assert.equal(decodeWorldSnapshot(goldenSnapshot).schema, 1);
  assert.equal(legacy.dispatch({
    schema: 2,
    id: "current-content",
    type: "build",
    projectId: "path",
    expectedRevision: legacy.world.revision
  }).code, "invalid_command");
});
test("founder house has full-thickness door and window voids and bounded wall spans", () => {
  const session = GameSession.legacyGenesis(1337, 2);
  assert.equal(build(session, "house").ok, true);
  const structure = [...session.world.structures.values()][0];
  assert.equal(structure.modules.length, 19);
  assert.equal(structure.modules.some((m) => m.kind === "window" || m.kind === "door"), false);
  assert.equal(structure.modules.every((m) => m.tone === "stone"), true);
  const wallModules = structure.modules.filter((m) => m.kind === "wall" || m.kind === "lintel");
  for (let i = 0; i < wallModules.length; i++) {
    for (let j = i + 1; j < wallModules.length; j++) {
      assert.equal(
        overlap(wallModules[i], wallModules[j]),
        false,
        `${JSON.stringify(wallModules[i])} overlaps ${JSON.stringify(wallModules[j])}`
      );
    }
  }
  const rect = projectById("house").rect;
  const floorY = projectById("house").floorY;
  const doorX = rect.x1 + 1 - 0.3;
  const doorZ = projectById("house").door.z + 0.5;
  assertOpening(structure, {
    kind: "wall",
    x: doorX,
    y: floorY,
    z: doorZ,
    w: 0.6,
    h: 2.2,
    d: 1.2
  });
  const southZ = rect.z1 + 1 - 0.3, cx = (rect.x0 + rect.x1 + 1) / 2;
  for (const x of [cx - 2, cx + 2]) assertOpening(structure, {
    kind: "wall",
    x,
    y: floorY + 1,
    z: southZ,
    w: 1.2,
    h: 1.4,
    d: 0.6
  });
  for (const module of structure.modules) {
    assert.ok(module.x - module.w / 2 >= rect.x0 - 1e-9);
    assert.ok(module.x + module.w / 2 <= rect.x1 + 1 + 1e-9);
    assert.ok(module.z - module.d / 2 >= rect.z0 - 1e-9);
    assert.ok(module.z + module.d / 2 <= rect.z1 + 1 + 1e-9);
  }
});
test("founder paths consolidate equal-height runs and preserve the stepped profile", () => {
  const legacy = GameSession.legacyGenesis();
  const founder = GameSession.genesis();
  assert.equal(build(legacy, "path").ok, true);
  assert.equal(build(founder, "path").ok, true);
  const old = [...legacy.world.structures.values()][0];
  const current = [...founder.world.structures.values()][0];
  assert.equal(old.modules.length, 27);
  assert.equal(current.modules.length, 9);
  const oldPaths = old.modules.filter((m) => m.kind === "path");
  const paths = current.modules.filter((m) => m.kind === "path");
  for (const segment of oldPaths) {
    const run = paths.find((m) => m.y === segment.y && Math.abs(m.z - segment.z) < 1e-9 && segment.x >= m.x - m.w / 2 && segment.x <= m.x + m.w / 2);
    assert.ok(run, `no equivalent run for ${JSON.stringify(segment)}`);
  }
  assert.equal(current.modules.filter((m) => m.kind === "curb").length, 6);
  assert.ok(new Set(paths.map((m) => m.y)).size > 1);
});
test("schema-2 structures round-trip exactly through snapshots and tail replay", () => {
  const live = GameSession.genesis();
  assert.equal(build(live, "house").ok, true);
  const boundary = clone(live.snapshot);
  assert.equal(build(live, "path").ok, true);
  assert.equal(build(live, "farm").ok, true);
  const tail = GameSession.restore(clone(boundary), clone(live.journal));
  const genesis = GameSession.replay(clone(live.journal));
  for (const restored of [tail, genesis]) {
    assert.equal(restored.stateHash, live.stateHash);
    assert.deepEqual(restored.snapshot, live.snapshot);
    assert.deepEqual(restored.journal, live.journal);
  }
  for (const structure of live.world.structures.values()) {
    assert.equal(validateWorldSnapshot(live.snapshot).structures.find((s) => s.id === structure.id)?.designVersion, 2);
  }
  const legacy = clone(boundary);
  assert.equal(legacy.structures.length, 1);
  assert.throws(() => validateWorldSnapshot({ ...legacy, schema: 1 }));
  const reordered = clone(boundary);
  const record = reordered.structures[0];
  const reorderedRecord = {
    id: record.id,
    kind: record.kind,
    siteId: record.siteId,
    x: record.x,
    y: record.y,
    z: record.z,
    rot: record.rot,
    modules: record.modules,
    cost: record.cost,
    builtRevision: record.builtRevision,
    provisional: true,
    designVersion: 2
  };
  reordered.structures[0] = reorderedRecord;
  assert.throws(() => validateWorldSnapshot(reordered), /canonical/);
  const before = clone(live.snapshot);
  const invalid = clone(live.snapshot);
  assert.deepEqual(live.snapshot, before);
});
test("crop aggregates have bounded presentation volumes without plant lifecycle claims", async () => {
  const session = GameSession.legacyGenesis(1337, 2);
  assert.equal(build(session, "farm").ok, true);
  const farm = [...session.world.structures.values()][0];
  const rows = farm.modules.filter((m) => m.kind === "crop_row");
  assert.equal(rows.length, 9);
  assert.equal(farm.modules.length, rows.length + 5);
  const geometry = buildStructureMesh(farm);
  assert.equal(geometry.type, "Group");
  const foliage = geometry.children.find((child) => child.name === "crop_row_foliage");
  assert.ok(foliage?.isMesh);
  assert.equal(foliage.castShadow, true);
  assert.equal(foliage.receiveShadow, true);
  const vertices = foliage.geometry.getAttribute("position");
  const matches = rows.map(() => false);
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const rowIndex = rows.findIndex((row) => x >= row.x - row.w / 2 - 1e-5 && x <= row.x + row.w / 2 + 1e-5 && z >= row.z - row.d / 2 - 1e-5 && z <= row.z + row.d / 2 + 1e-5 && y >= row.y - 1e-5 && y <= row.y + row.h + 1e-5);
    assert.ok(rowIndex >= 0, `crop vertex outside every authoritative row: ${x},${y},${z}`);
    matches[rowIndex] = true;
  }
  assert.equal(matches.every(Boolean), true);
  assert.equal([...session.world.entities.values()].some((entity) => entity.kind.includes("crop")), false);
  assert.equal(session.world.inventory.wood, 30);
});
test("founder architecture casts and receives shadows", () => {
  const session = GameSession.legacyGenesis(1337, 2);
  assert.equal(build(session, "house").ok, true);
  const mesh = buildStructureMesh([...session.world.structures.values()][0]);
  assert.equal(mesh.type, "Mesh");
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMi5mb3VuZGVyLnRlc3QudHMiLCAiLi4vLi4vc3JjL3NpbS9zdG9uZS1jb21wYXQudHMiLCAiLi4vLi4vc3JjL3NpbS93b3JsZC50cyIsICIuLi8uLi9zcmMvc2ltL3RlcnJhaW4udHMiLCAiLi4vLi4vc3JjL3NpbS9jb25zdHJ1Y3Rpb24udHMiLCAiLi4vLi4vc3JjL3NpbS9wcmVwYXJhdGlvbi50cyIsICIuLi8uLi9zcmMvc2ltL3N0cnVjdHVyZXMudHMiLCAiLi4vLi4vc3JjL3NpbS9jYW5vbmljYWwudHMiLCAiLi4vLi4vc3JjL3NpbS9tMDAyLnRzIiwgIi4uLy4uL3NyYy9zaW0vc2NlbmFyaW8udHMiLCAiLi4vLi4vc3JjL3NpbS9lY29ub215LnRzIiwgIi4uLy4uL3NyYy9zaW0vc25hcHNob3QudHMiLCAiLi4vLi4vc3JjL2FwcC9wcm9qZWN0cy50cyIsICIuLi8uLi9zcmMvYXBwL3Nlc3Npb24udHMiLCAiLi4vLi4vc3JjL3JlbmRlci9zdHJ1Y3R1cmVzLnRzIiwgIi4uLy4uL3NyYy9kYXRhL3BhbGV0dGUuanNvbiJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IGFzc2VydCBmcm9tICdub2RlOmFzc2VydC9zdHJpY3QnO1xuaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCB7IEdhbWVTZXNzaW9uLCB2YWxpZGF0ZUNvbW1hbmQgfSBmcm9tICcuLi9zcmMvYXBwL3Nlc3Npb24nO1xuaW1wb3J0IHtcbiAgRk9VTkRFUl9ERVNJR05fVkVSU0lPTiwgU3RydWN0dXJlLCBTdHJ1Y3R1cmVNb2R1bGUsXG59IGZyb20gJy4uL3NyYy9zaW0vc3RydWN0dXJlcyc7XG5pbXBvcnQgeyBwcm9qZWN0QnlJZCB9IGZyb20gJy4uL3NyYy9hcHAvcHJvamVjdHMnO1xuaW1wb3J0IHsgY2Fub25pY2FsU3RydWN0dXJlSGFzaCB9IGZyb20gJy4uL3NyYy9zaW0vY2Fub25pY2FsJztcbmltcG9ydCB7IGJ1aWxkU3RydWN0dXJlTWVzaCB9IGZyb20gJy4uL3NyYy9yZW5kZXIvc3RydWN0dXJlcyc7XG5pbXBvcnQgeyBkZWNvZGVXb3JsZFNuYXBzaG90LCB2YWxpZGF0ZVdvcmxkU25hcHNob3QgfSBmcm9tICcuLi9zcmMvc2ltL3NuYXBzaG90JztcblxuZnVuY3Rpb24gY2xvbmU8VD4odmFsdWU6IFQpOiBUIHsgcmV0dXJuIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodmFsdWUpKTsgfVxuZnVuY3Rpb24gYnVpbGQoc2Vzc2lvbjogR2FtZVNlc3Npb24sIHByb2plY3RJZDogJ2hvdXNlJyB8ICdwYXRoJyB8ICdmYXJtJykge1xuICByZXR1cm4gc2Vzc2lvbi5kaXNwYXRjaCh7XG4gICAgc2NoZW1hOiBzZXNzaW9uLmpvdXJuYWwuc2NoZW1hLCBpZDogYGJ1aWxkLSR7cHJvamVjdElkfWAsIHR5cGU6ICdidWlsZCcsXG4gICAgcHJvamVjdElkLCBleHBlY3RlZFJldmlzaW9uOiBzZXNzaW9uLndvcmxkLnJldmlzaW9uLFxuICAgIC4uLihzZXNzaW9uLmpvdXJuYWwuc2NoZW1hID49IDIgPyB7IGRlc2lnblZlcnNpb246IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSA6IHt9KSxcbiAgfSk7XG59XG5mdW5jdGlvbiBvdmVybGFwKGE6IFN0cnVjdHVyZU1vZHVsZSwgYjogU3RydWN0dXJlTW9kdWxlKTogYm9vbGVhbiB7XG4gIHJldHVybiBNYXRoLmFicyhhLnggLSBiLngpICogMiA8IGEudyArIGIudyAtIDFlLTlcbiAgICAmJiBNYXRoLmFicyhhLnogLSBiLnopICogMiA8IGEuZCArIGIuZCAtIDFlLTlcbiAgICAmJiBhLnkgPCBiLnkgKyBiLmggLSAxZS05ICYmIGIueSA8IGEueSArIGEuaCAtIDFlLTk7XG59XG5mdW5jdGlvbiBhc3NlcnRPcGVuaW5nKHN0cnVjdHVyZTogU3RydWN0dXJlLCBvcGVuaW5nOiBTdHJ1Y3R1cmVbJ21vZHVsZXMnXVtudW1iZXJdKTogdm9pZCB7XG4gIGFzc2VydC5lcXVhbChzdHJ1Y3R1cmUubW9kdWxlcy5zb21lKChtKSA9PiBvdmVybGFwKG0sIG9wZW5pbmcpKSwgZmFsc2UsXG4gICAgYG9wZW5pbmcgaW50ZXJzZWN0cyAke0pTT04uc3RyaW5naWZ5KG9wZW5pbmcpfWApO1xufVxuXG50ZXN0KCdzY2hlbWEtMiBjb21tYW5kcyBzZWxlY3Qgb25seSBkZXNpZ24gMiBhbmQgcHJlc2VydmUgaGFydmVzdCBzY2hlbWEgMScsICgpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IEdhbWVTZXNzaW9uLmxlZ2FjeUdlbmVzaXMoMTMzNywgMik7XG4gIGFzc2VydC5lcXVhbChzZXNzaW9uLmpvdXJuYWwuc2NoZW1hLCAyKTtcbiAgYXNzZXJ0LmVxdWFsKHNlc3Npb24uc25hcHNob3Quc2NoZW1hLCAyKTtcbiAgY29uc3QgcmVzdWx0ID0gYnVpbGQoc2Vzc2lvbiwgJ2hvdXNlJyk7XG4gIGFzc2VydC5lcXVhbChyZXN1bHQub2ssIHRydWUsIEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO1xuICBhc3NlcnQuZXF1YWwoc2Vzc2lvbi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpLm5leHQoKS52YWx1ZT8uZGVzaWduVmVyc2lvbiwgMik7XG4gIGFzc2VydC5lcXVhbChzZXNzaW9uLmRpc3BhdGNoKGNsb25lKHNlc3Npb24uam91cm5hbC5lbnRyaWVzWzBdLmNvbW1hbmQpKS5kdXBsaWNhdGUsIHRydWUpO1xuICBhc3NlcnQuZXF1YWwoc2Vzc2lvbi5kaXNwYXRjaCh7XG4gICAgc2NoZW1hOiAxLCBpZDogJ3dyb25nLXdvcmxkJywgdHlwZTogJ2J1aWxkJywgcHJvamVjdElkOiAncGF0aCcsXG4gICAgZXhwZWN0ZWRSZXZpc2lvbjogc2Vzc2lvbi53b3JsZC5yZXZpc2lvbixcbiAgfSkuY29kZSwgJ3NjaGVtYV9taXNtYXRjaCcpO1xuICBhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlQ29tbWFuZCh7XG4gICAgc2NoZW1hOiAyLCBpZDogJ3dyb25nLWhhcnZlc3QnLCB0eXBlOiAnaGFydmVzdCcsIGVudGl0eUlkOiAnZTozMCwzMDo0JywgZXhwZWN0ZWRSZXZpc2lvbjogMCxcbiAgfSksIC91bnN1cHBvcnRlZC8pO1xuICBhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlQ29tbWFuZCh7XG4gICAgc2NoZW1hOiAyLCBpZDogJ2JhZC1kZXNpZ24nLCB0eXBlOiAnYnVpbGQnLCBwcm9qZWN0SWQ6ICdob3VzZScsXG4gICAgZXhwZWN0ZWRSZXZpc2lvbjogMCwgZGVzaWduVmVyc2lvbjogMSxcbiAgfSksIC9kZXNpZ24vKTtcbiAgYXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZUNvbW1hbmQoe1xuICAgIHNjaGVtYTogMSwgaWQ6ICdzbmVhay1kZXNpZ24nLCB0eXBlOiAnYnVpbGQnLCBwcm9qZWN0SWQ6ICdob3VzZScsXG4gICAgZXhwZWN0ZWRSZXZpc2lvbjogMCwgZGVzaWduVmVyc2lvbjogMixcbiAgfSkpO1xufSk7XG5cbnRlc3QoJ2xlZ2FjeSBwbGFubmluZywgc3RydWN0dXJlIGhhc2hlcyBhbmQgc25hcHNob3RzIHJlbWFpbiBieXRlLWNvbXBhdGlibGUnLCAoKSA9PiB7XG4gIGNvbnN0IGxlZ2FjeSA9IEdhbWVTZXNzaW9uLmxlZ2FjeUdlbmVzaXMoKTtcbiAgYXNzZXJ0LmVxdWFsKGxlZ2FjeS5zbmFwc2hvdC5zY2hlbWEsIDEpO1xuICBhc3NlcnQuZXF1YWwoYnVpbGQobGVnYWN5LCAnaG91c2UnKS5vaywgdHJ1ZSk7XG4gIGNvbnN0IHJlY29yZCA9IGxlZ2FjeS53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpLm5leHQoKS52YWx1ZSE7XG4gIGFzc2VydC5lcXVhbChyZWNvcmQuZGVzaWduVmVyc2lvbiwgdW5kZWZpbmVkKTtcbiAgYXNzZXJ0LmVxdWFsKHJlY29yZC5tb2R1bGVzLmxlbmd0aCwgMTcpO1xuICBhc3NlcnQuZXF1YWwoJ2Rlc2lnblZlcnNpb24nIGluIHJlY29yZCwgZmFsc2UpO1xuICBjb25zdCBnb2xkZW5EaWdlc3QgPSByZWNvcmQuaWQ7XG4gIGNvbnN0IGdvbGRlbkhhc2ggPSBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoKGxlZ2FjeS53b3JsZCk7XG4gIGNvbnN0IGdvbGRlblNuYXBzaG90ID0gSlNPTi5zdHJpbmdpZnkobGVnYWN5LnNuYXBzaG90KTtcbiAgY29uc3QgcmVwbGF5ID0gR2FtZVNlc3Npb24ucmVwbGF5KGNsb25lKGxlZ2FjeS5qb3VybmFsKSk7XG4gIGFzc2VydC5lcXVhbChyZXBsYXkud29ybGQuc3RydWN0dXJlcy5nZXQoZ29sZGVuRGlnZXN0KT8uZGVzaWduVmVyc2lvbiwgdW5kZWZpbmVkKTtcbiAgYXNzZXJ0LmVxdWFsKGNhbm9uaWNhbFN0cnVjdHVyZUhhc2gocmVwbGF5LndvcmxkKSwgZ29sZGVuSGFzaCk7XG4gIGFzc2VydC5lcXVhbChKU09OLnN0cmluZ2lmeShyZXBsYXkuc25hcHNob3QpLCBnb2xkZW5TbmFwc2hvdCk7XG4gIGFzc2VydC5lcXVhbChkZWNvZGVXb3JsZFNuYXBzaG90KGdvbGRlblNuYXBzaG90KS5zY2hlbWEsIDEpO1xuICBhc3NlcnQuZXF1YWwobGVnYWN5LmRpc3BhdGNoKHtcbiAgICBzY2hlbWE6IDIsIGlkOiAnY3VycmVudC1jb250ZW50JywgdHlwZTogJ2J1aWxkJywgcHJvamVjdElkOiAncGF0aCcsXG4gICAgZXhwZWN0ZWRSZXZpc2lvbjogbGVnYWN5LndvcmxkLnJldmlzaW9uLFxuICB9KS5jb2RlLCAnaW52YWxpZF9jb21tYW5kJyk7XG59KTtcblxudGVzdCgnZm91bmRlciBob3VzZSBoYXMgZnVsbC10aGlja25lc3MgZG9vciBhbmQgd2luZG93IHZvaWRzIGFuZCBib3VuZGVkIHdhbGwgc3BhbnMnLCAoKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5sZWdhY3lHZW5lc2lzKDEzMzcsIDIpO1xuICBhc3NlcnQuZXF1YWwoYnVpbGQoc2Vzc2lvbiwgJ2hvdXNlJykub2ssIHRydWUpO1xuICBjb25zdCBzdHJ1Y3R1cmUgPSBbLi4uc2Vzc2lvbi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXVswXTtcbiAgYXNzZXJ0LmVxdWFsKHN0cnVjdHVyZS5tb2R1bGVzLmxlbmd0aCwgMTkpO1xuICBhc3NlcnQuZXF1YWwoc3RydWN0dXJlLm1vZHVsZXMuc29tZSgobSkgPT4gbS5raW5kID09PSAnd2luZG93JyB8fCBtLmtpbmQgPT09ICdkb29yJyksIGZhbHNlKTtcbiAgYXNzZXJ0LmVxdWFsKHN0cnVjdHVyZS5tb2R1bGVzLmV2ZXJ5KChtKSA9PiBtLnRvbmUgPT09ICdzdG9uZScpLCB0cnVlKTtcbiAgY29uc3Qgd2FsbE1vZHVsZXMgPSBzdHJ1Y3R1cmUubW9kdWxlcy5maWx0ZXIoKG0pID0+IG0ua2luZCA9PT0gJ3dhbGwnIHx8IG0ua2luZCA9PT0gJ2xpbnRlbCcpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHdhbGxNb2R1bGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgd2FsbE1vZHVsZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgIGFzc2VydC5lcXVhbChvdmVybGFwKHdhbGxNb2R1bGVzW2ldLCB3YWxsTW9kdWxlc1tqXSksIGZhbHNlLFxuICAgICAgICBgJHtKU09OLnN0cmluZ2lmeSh3YWxsTW9kdWxlc1tpXSl9IG92ZXJsYXBzICR7SlNPTi5zdHJpbmdpZnkod2FsbE1vZHVsZXNbal0pfWApO1xuICAgIH1cbiAgfVxuICBjb25zdCByZWN0ID0gcHJvamVjdEJ5SWQoJ2hvdXNlJykucmVjdDtcbiAgY29uc3QgZmxvb3JZID0gcHJvamVjdEJ5SWQoJ2hvdXNlJykuZmxvb3JZO1xuICBjb25zdCBkb29yWCA9IHJlY3QueDEgKyAxIC0gMC4zO1xuICBjb25zdCBkb29yWiA9IHByb2plY3RCeUlkKCdob3VzZScpLmRvb3IhLnogKyAwLjU7XG4gIGFzc2VydE9wZW5pbmcoc3RydWN0dXJlLCB7XG4gICAga2luZDogJ3dhbGwnLCB4OiBkb29yWCwgeTogZmxvb3JZLCB6OiBkb29yWiwgdzogMC42LCBoOiAyLjIsIGQ6IDEuMixcbiAgfSk7XG4gIGNvbnN0IHNvdXRoWiA9IHJlY3QuejEgKyAxIC0gMC4zLCBjeCA9IChyZWN0LngwICsgcmVjdC54MSArIDEpIC8gMjtcbiAgZm9yIChjb25zdCB4IG9mIFtjeCAtIDIsIGN4ICsgMl0pIGFzc2VydE9wZW5pbmcoc3RydWN0dXJlLCB7XG4gICAga2luZDogJ3dhbGwnLCB4LCB5OiBmbG9vclkgKyAxLCB6OiBzb3V0aFosIHc6IDEuMiwgaDogMS40LCBkOiAwLjYsXG4gIH0pO1xuICBmb3IgKGNvbnN0IG1vZHVsZSBvZiBzdHJ1Y3R1cmUubW9kdWxlcykge1xuICAgIGFzc2VydC5vayhtb2R1bGUueCAtIG1vZHVsZS53IC8gMiA+PSByZWN0LngwIC0gMWUtOSk7XG4gICAgYXNzZXJ0Lm9rKG1vZHVsZS54ICsgbW9kdWxlLncgLyAyIDw9IHJlY3QueDEgKyAxICsgMWUtOSk7XG4gICAgYXNzZXJ0Lm9rKG1vZHVsZS56IC0gbW9kdWxlLmQgLyAyID49IHJlY3QuejAgLSAxZS05KTtcbiAgICBhc3NlcnQub2sobW9kdWxlLnogKyBtb2R1bGUuZCAvIDIgPD0gcmVjdC56MSArIDEgKyAxZS05KTtcbiAgfVxufSk7XG5cbnRlc3QoJ2ZvdW5kZXIgcGF0aHMgY29uc29saWRhdGUgZXF1YWwtaGVpZ2h0IHJ1bnMgYW5kIHByZXNlcnZlIHRoZSBzdGVwcGVkIHByb2ZpbGUnLCAoKSA9PiB7XG4gIGNvbnN0IGxlZ2FjeSA9IEdhbWVTZXNzaW9uLmxlZ2FjeUdlbmVzaXMoKTtcbiAgY29uc3QgZm91bmRlciA9IEdhbWVTZXNzaW9uLmdlbmVzaXMoKTtcbiAgYXNzZXJ0LmVxdWFsKGJ1aWxkKGxlZ2FjeSwgJ3BhdGgnKS5vaywgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChidWlsZChmb3VuZGVyLCAncGF0aCcpLm9rLCB0cnVlKTtcbiAgY29uc3Qgb2xkID0gWy4uLmxlZ2FjeS53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXVswXTtcbiAgY29uc3QgY3VycmVudCA9IFsuLi5mb3VuZGVyLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldWzBdO1xuICBhc3NlcnQuZXF1YWwob2xkLm1vZHVsZXMubGVuZ3RoLCAyNyk7XG4gIGFzc2VydC5lcXVhbChjdXJyZW50Lm1vZHVsZXMubGVuZ3RoLCA5KTtcbiAgY29uc3Qgb2xkUGF0aHMgPSBvbGQubW9kdWxlcy5maWx0ZXIoKG0pID0+IG0ua2luZCA9PT0gJ3BhdGgnKTtcbiAgY29uc3QgcGF0aHMgPSBjdXJyZW50Lm1vZHVsZXMuZmlsdGVyKChtKSA9PiBtLmtpbmQgPT09ICdwYXRoJyk7XG4gIGZvciAoY29uc3Qgc2VnbWVudCBvZiBvbGRQYXRocykge1xuICAgIGNvbnN0IHJ1biA9IHBhdGhzLmZpbmQoKG0pID0+IG0ueSA9PT0gc2VnbWVudC55ICYmIE1hdGguYWJzKG0ueiAtIHNlZ21lbnQueikgPCAxZS05XG4gICAgICAmJiBzZWdtZW50LnggPj0gbS54IC0gbS53IC8gMiAmJiBzZWdtZW50LnggPD0gbS54ICsgbS53IC8gMik7XG4gICAgYXNzZXJ0Lm9rKHJ1biwgYG5vIGVxdWl2YWxlbnQgcnVuIGZvciAke0pTT04uc3RyaW5naWZ5KHNlZ21lbnQpfWApO1xuICB9XG4gIGFzc2VydC5lcXVhbChjdXJyZW50Lm1vZHVsZXMuZmlsdGVyKChtKSA9PiBtLmtpbmQgPT09ICdjdXJiJykubGVuZ3RoLCA2KTtcbiAgYXNzZXJ0Lm9rKG5ldyBTZXQocGF0aHMubWFwKChtKSA9PiBtLnkpKS5zaXplID4gMSk7XG59KTtcblxudGVzdCgnc2NoZW1hLTIgc3RydWN0dXJlcyByb3VuZC10cmlwIGV4YWN0bHkgdGhyb3VnaCBzbmFwc2hvdHMgYW5kIHRhaWwgcmVwbGF5JywgKCkgPT4ge1xuICBjb25zdCBsaXZlID0gR2FtZVNlc3Npb24uZ2VuZXNpcygpO1xuICBhc3NlcnQuZXF1YWwoYnVpbGQobGl2ZSwgJ2hvdXNlJykub2ssIHRydWUpO1xuICBjb25zdCBib3VuZGFyeSA9IGNsb25lKGxpdmUuc25hcHNob3QpO1xuICBhc3NlcnQuZXF1YWwoYnVpbGQobGl2ZSwgJ3BhdGgnKS5vaywgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChidWlsZChsaXZlLCAnZmFybScpLm9rLCB0cnVlKTtcbiAgY29uc3QgdGFpbCA9IEdhbWVTZXNzaW9uLnJlc3RvcmUoY2xvbmUoYm91bmRhcnkpLCBjbG9uZShsaXZlLmpvdXJuYWwpKTtcbiAgY29uc3QgZ2VuZXNpcyA9IEdhbWVTZXNzaW9uLnJlcGxheShjbG9uZShsaXZlLmpvdXJuYWwpKTtcbiAgZm9yIChjb25zdCByZXN0b3JlZCBvZiBbdGFpbCwgZ2VuZXNpc10pIHtcbiAgICBhc3NlcnQuZXF1YWwocmVzdG9yZWQuc3RhdGVIYXNoLCBsaXZlLnN0YXRlSGFzaCk7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChyZXN0b3JlZC5zbmFwc2hvdCwgbGl2ZS5zbmFwc2hvdCk7XG4gICAgYXNzZXJ0LmRlZXBFcXVhbChyZXN0b3JlZC5qb3VybmFsLCBsaXZlLmpvdXJuYWwpO1xuICB9XG4gIGZvciAoY29uc3Qgc3RydWN0dXJlIG9mIGxpdmUud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKSkge1xuICAgIGFzc2VydC5lcXVhbCh2YWxpZGF0ZVdvcmxkU25hcHNob3QobGl2ZS5zbmFwc2hvdCkuc3RydWN0dXJlcy5maW5kKChzKSA9PiBzLmlkID09PSBzdHJ1Y3R1cmUuaWQpPy5kZXNpZ25WZXJzaW9uLCAyKTtcbiAgfVxuICBjb25zdCBsZWdhY3kgPSBjbG9uZShib3VuZGFyeSk7XG4gIGFzc2VydC5lcXVhbChsZWdhY3kuc3RydWN0dXJlcy5sZW5ndGgsIDEpO1xuICBhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlV29ybGRTbmFwc2hvdCh7IC4uLmxlZ2FjeSwgc2NoZW1hOiAxIGFzIG5ldmVyIH0pKTtcbiAgY29uc3QgcmVvcmRlcmVkID0gY2xvbmUoYm91bmRhcnkpO1xuICBjb25zdCByZWNvcmQgPSByZW9yZGVyZWQuc3RydWN0dXJlc1swXTtcbiAgY29uc3QgcmVvcmRlcmVkUmVjb3JkOiBTdHJ1Y3R1cmUgPSB7XG4gICAgaWQ6IHJlY29yZC5pZCwga2luZDogcmVjb3JkLmtpbmQsIHNpdGVJZDogcmVjb3JkLnNpdGVJZCxcbiAgICB4OiByZWNvcmQueCwgeTogcmVjb3JkLnksIHo6IHJlY29yZC56LCByb3Q6IHJlY29yZC5yb3QsXG4gICAgbW9kdWxlczogcmVjb3JkLm1vZHVsZXMsIGNvc3Q6IHJlY29yZC5jb3N0LCBidWlsdFJldmlzaW9uOiByZWNvcmQuYnVpbHRSZXZpc2lvbixcbiAgICBwcm92aXNpb25hbDogdHJ1ZSwgZGVzaWduVmVyc2lvbjogMixcbiAgfTtcbiAgcmVvcmRlcmVkLnN0cnVjdHVyZXNbMF0gPSByZW9yZGVyZWRSZWNvcmQ7XG4gIGFzc2VydC50aHJvd3MoKCkgPT4gdmFsaWRhdGVXb3JsZFNuYXBzaG90KHJlb3JkZXJlZCksIC9jYW5vbmljYWwvKTtcbiAgY29uc3QgYmVmb3JlID0gY2xvbmUobGl2ZS5zbmFwc2hvdCk7XG4gIGNvbnN0IGludmFsaWQgPSBjbG9uZShsaXZlLnNuYXBzaG90KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChsaXZlLnNuYXBzaG90LCBiZWZvcmUpO1xufSk7XG5cbnRlc3QoJ2Nyb3AgYWdncmVnYXRlcyBoYXZlIGJvdW5kZWQgcHJlc2VudGF0aW9uIHZvbHVtZXMgd2l0aG91dCBwbGFudCBsaWZlY3ljbGUgY2xhaW1zJywgYXN5bmMgKCkgPT4ge1xuICBjb25zdCBzZXNzaW9uID0gR2FtZVNlc3Npb24ubGVnYWN5R2VuZXNpcygxMzM3LCAyKTtcbiAgYXNzZXJ0LmVxdWFsKGJ1aWxkKHNlc3Npb24sICdmYXJtJykub2ssIHRydWUpO1xuICBjb25zdCBmYXJtID0gWy4uLnNlc3Npb24ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV1bMF07XG4gIGNvbnN0IHJvd3MgPSBmYXJtLm1vZHVsZXMuZmlsdGVyKChtKSA9PiBtLmtpbmQgPT09ICdjcm9wX3JvdycpO1xuICBhc3NlcnQuZXF1YWwocm93cy5sZW5ndGgsIDkpO1xuICBhc3NlcnQuZXF1YWwoZmFybS5tb2R1bGVzLmxlbmd0aCwgcm93cy5sZW5ndGggKyA1KTtcbiAgY29uc3QgZ2VvbWV0cnkgPSBidWlsZFN0cnVjdHVyZU1lc2goZmFybSk7XG4gIGFzc2VydC5lcXVhbChnZW9tZXRyeS50eXBlLCAnR3JvdXAnKTtcbiAgY29uc3QgZm9saWFnZSA9IGdlb21ldHJ5LmNoaWxkcmVuLmZpbmQoKGNoaWxkKSA9PiBjaGlsZC5uYW1lID09PSAnY3JvcF9yb3dfZm9saWFnZScpO1xuICBhc3NlcnQub2soZm9saWFnZT8uaXNNZXNoKTtcbiAgYXNzZXJ0LmVxdWFsKGZvbGlhZ2UuY2FzdFNoYWRvdywgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChmb2xpYWdlLnJlY2VpdmVTaGFkb3csIHRydWUpO1xuICBjb25zdCB2ZXJ0aWNlcyA9IGZvbGlhZ2UuZ2VvbWV0cnkuZ2V0QXR0cmlidXRlKCdwb3NpdGlvbicpO1xuICBjb25zdCBtYXRjaGVzID0gcm93cy5tYXAoKCkgPT4gZmFsc2UpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZlcnRpY2VzLmNvdW50OyBpKyspIHtcbiAgICBjb25zdCB4ID0gdmVydGljZXMuZ2V0WChpKSwgeSA9IHZlcnRpY2VzLmdldFkoaSksIHogPSB2ZXJ0aWNlcy5nZXRaKGkpO1xuICAgIGNvbnN0IHJvd0luZGV4ID0gcm93cy5maW5kSW5kZXgoKHJvdykgPT4geCA+PSByb3cueCAtIHJvdy53IC8gMiAtIDFlLTVcbiAgICAgICYmIHggPD0gcm93LnggKyByb3cudyAvIDIgKyAxZS01ICYmIHogPj0gcm93LnogLSByb3cuZCAvIDIgLSAxZS01XG4gICAgICAmJiB6IDw9IHJvdy56ICsgcm93LmQgLyAyICsgMWUtNSAmJiB5ID49IHJvdy55IC0gMWUtNSAmJiB5IDw9IHJvdy55ICsgcm93LmggKyAxZS01KTtcbiAgICBhc3NlcnQub2socm93SW5kZXggPj0gMCwgYGNyb3AgdmVydGV4IG91dHNpZGUgZXZlcnkgYXV0aG9yaXRhdGl2ZSByb3c6ICR7eH0sJHt5fSwke3p9YCk7XG4gICAgbWF0Y2hlc1tyb3dJbmRleF0gPSB0cnVlO1xuICB9XG4gIGFzc2VydC5lcXVhbChtYXRjaGVzLmV2ZXJ5KEJvb2xlYW4pLCB0cnVlKTtcbiAgYXNzZXJ0LmVxdWFsKFsuLi5zZXNzaW9uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXS5zb21lKChlbnRpdHkpID0+IGVudGl0eS5raW5kLmluY2x1ZGVzKCdjcm9wJykpLCBmYWxzZSk7XG4gIGFzc2VydC5lcXVhbChzZXNzaW9uLndvcmxkLmludmVudG9yeS53b29kLCAzMCk7XG59KTtcblxudGVzdCgnZm91bmRlciBhcmNoaXRlY3R1cmUgY2FzdHMgYW5kIHJlY2VpdmVzIHNoYWRvd3MnLCAoKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBHYW1lU2Vzc2lvbi5sZWdhY3lHZW5lc2lzKDEzMzcsIDIpO1xuICBhc3NlcnQuZXF1YWwoYnVpbGQoc2Vzc2lvbiwgJ2hvdXNlJykub2ssIHRydWUpO1xuICBjb25zdCBtZXNoID0gYnVpbGRTdHJ1Y3R1cmVNZXNoKFsuLi5zZXNzaW9uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldWzBdKTtcbiAgYXNzZXJ0LmVxdWFsKG1lc2gudHlwZSwgJ01lc2gnKTtcbiAgYXNzZXJ0LmVxdWFsKG1lc2guY2FzdFNoYWRvdywgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChtZXNoLnJlY2VpdmVTaGFkb3csIHRydWUpO1xufSk7XG4iLCAiLy8gUHJpdmF0ZSBtaWdyYXRpb24gcmVwbGF5IG9ubHkuIFJldGlyZWQgZW50aXRpZXMgbGl2ZSBpbiB0aGlzIFdvcmxkIHdoaWxlIGFuXG4vLyBhY2NlcHRlZCBoaXN0b3JpY2FsIGpvdXJuYWwgaXMgY2hlY2tlZDsgbm8gcHVibGljIGNvbW1hbmQgZW5hYmxlcyB0aGlzIG1vZGUuXG5pbnRlcmZhY2UgUmVwbGF5U3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIGhpc3RvcmljYWxIYXNoOiBib29sZWFuO1xuICBtaWdyYXRlZDogYm9vbGVhbjtcbn1cblxuY29uc3Qgc3RhdGVzID0gbmV3IFdlYWtNYXA8b2JqZWN0LCBSZXBsYXlTdGF0ZT4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxheVN0b25lU3RhdGUod29ybGQ6IG9iamVjdCk6IFJlcGxheVN0YXRlIHtcbiAgbGV0IHN0YXRlID0gc3RhdGVzLmdldCh3b3JsZCk7XG4gIGlmICghc3RhdGUpIHsgc3RhdGUgPSB7IGFjdGl2ZTogZmFsc2UsIGhpc3RvcmljYWxIYXNoOiBmYWxzZSwgbWlncmF0ZWQ6IGZhbHNlIH07IHN0YXRlcy5zZXQod29ybGQsIHN0YXRlKTsgfVxuICByZXR1cm4gc3RhdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVTdG9uZVJlcGxheSh3b3JsZDogb2JqZWN0KTogdm9pZCB7XG4gIGNvbnN0IHN0YXRlID0gcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCk7XG4gIHN0YXRlLmFjdGl2ZSA9IHRydWU7XG4gIHN0YXRlLmhpc3RvcmljYWxIYXNoID0gdHJ1ZTtcbiAgc3RhdGUubWlncmF0ZWQgPSBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/LmFjdGl2ZSA/PyBmYWxzZTtcbn1cblxuLyoqIFNuYXBzaG90IGhhc2hlcyBiZWZvcmUgYW5kIGR1cmluZyB2ZXJpZmllZCBoaXN0b3JpY2FsIHJlcGxheSBpbmNsdWRlIHN0b25lcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiB2b2lkIHtcbiAgcmVwbGF5U3RvbmVTdGF0ZSh3b3JsZCkuaGlzdG9yaWNhbEhhc2ggPSB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIaXN0b3JpY2FsU3RvbmVIYXNoKHdvcmxkOiBvYmplY3QpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXRlcy5nZXQod29ybGQpPy5oaXN0b3JpY2FsSGFzaCA/PyBmYWxzZTtcbn1cblxuLyoqIEEgbWlncmF0ZWQgc25hcHNob3QgYWxyZWFkeSBoYXMgcmV0aXJlbWVudCB0b21ic3RvbmVzIGluIGdlbmVyYXRlZCBjaHVua3MuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICByZXBsYXlTdG9uZVN0YXRlKHdvcmxkKS5taWdyYXRlZCA9IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b25lTWlncmF0ZWQod29ybGQ6IG9iamVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdGVzLmdldCh3b3JsZCk/Lm1pZ3JhdGVkID8/IGZhbHNlO1xufVxuXG4vKiogRXhpdCBoaXN0b3JpY2FsIG1vZGUgYWZ0ZXIgYWxsIGFjY2VwdGVkIGNvbW1hbmRzIGFuZCBoYXNoZXMgaGF2ZSBwYXNzZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZmluaXNoU3RvbmVSZXBsYXkod29ybGQ6IG9iamVjdCk6IHZvaWQge1xuICBjb25zdCBzdGF0ZSA9IHJlcGxheVN0b25lU3RhdGUod29ybGQpO1xuICBzdGF0ZS5hY3RpdmUgPSBmYWxzZTtcbiAgc3RhdGUuaGlzdG9yaWNhbEhhc2ggPSBmYWxzZTtcbiAgc3RhdGUubWlncmF0ZWQgPSB0cnVlO1xufVxuIiwgIi8vIFNpbXVsYXRpb24gbGF5ZXIgXHUyMDE0IHB1cmUgVHlwZVNjcmlwdCwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDEgd29ybGQgZm91bmRhdGlvbjogYSBjaHVua2VkLCBnZW51aW5lbHkgdGhyZWUtZGltZW5zaW9uYWwgdm94ZWwgd29ybGQuXG4vLyBUaGUgc3RvcmVkIHN0YXRlIGlzIG9uZSBtYXRlcmlhbCBieXRlIHBlciBjZWxsICgwID0gYWlyKTsgb2NjdXBhbmN5IGlzXG4vLyBpbXBsaWNpdC4gU3VyZmFjZSBoZWlnaHQgaXMgYSBkZXJpdmVkIHF1ZXJ5LCBub3QgdGhlIHN0b3JhZ2UuIFRoaXMgcmVwbGFjZXNcbi8vIHRoZSBmb3JtZXIgMjU2IHggMjU2IGhlaWdodGZpZWxkIChzZWUgSVItMDA1KS5cbi8vXG4vLyBXb3JsZCBtZXRyZXM6IHgveiBpbiBbLTEwMjQsIDEwMjQpLCB5IGluIFstMTYsIDExMiksIHNlYSBsZXZlbCAwLlxuLy8gQSBjaHVuayBpcyAzMiB4IDMyIHggMTI4IGNlbGxzLiBHZW5lcmF0aW9uIGlzIGEgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCxcbi8vIGdlbmVyYXRvciB2ZXJzaW9uLCBwYXJhbWV0ZXJzIGFuZCBjaHVuayBjb29yZGluYXRlczsgZWRpdHMgYXJlIHJlY29yZGVkXG4vLyBzZXBhcmF0ZWx5IGFuZCByZS1hcHBsaWVkIHdoZW4gYSBjaHVuayBpcyByZWdlbmVyYXRlZC5cbmltcG9ydCB0eXBlIHsgU3RydWN0dXJlIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB0eXBlIHsgTGlmZVN0YXRlIH0gZnJvbSAnLi9lY29ub215JztcbmltcG9ydCB7IGlzU3RvbmVSZXBsYXkgfSBmcm9tICcuL3N0b25lLWNvbXBhdCc7XG5cbmV4cG9ydCBjb25zdCBXT1JMRF9TSVpFID0gMjA0ODtcbmV4cG9ydCBjb25zdCBIQUxGID0gV09STERfU0laRSAvIDI7XG5leHBvcnQgY29uc3QgQ0hVTktfU0laRSA9IDMyO1xuZXhwb3J0IGNvbnN0IENIVU5LU19QRVJfU0lERSA9IFdPUkxEX1NJWkUgLyBDSFVOS19TSVpFO1xuZXhwb3J0IGNvbnN0IFlfTUlOID0gLTE2O1xuZXhwb3J0IGNvbnN0IFlfTUFYID0gMTEyO1xuZXhwb3J0IGNvbnN0IFdPUkxEX0hFSUdIVCA9IFlfTUFYIC0gWV9NSU47XG5leHBvcnQgY29uc3QgU0VBX0xFVkVMID0gMDtcbmV4cG9ydCBjb25zdCBXQVRFUiA9IFNFQV9MRVZFTDtcbmV4cG9ydCBjb25zdCBHRU5FUkFUT1JfVkVSU0lPTiA9IDE7XG5leHBvcnQgY29uc3QgQ0hVTktfVk9MVU1FID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkUgKiBXT1JMRF9IRUlHSFQ7XG5leHBvcnQgY29uc3QgQ0hVTktfQVJFQSA9IENIVU5LX1NJWkUgKiBDSFVOS19TSVpFO1xuXG5leHBvcnQgY29uc3QgTUFUID0ge1xuICBBSVI6IDAsXG4gIEdSQVNTOiAxLFxuICBTT0lMOiAyLFxuICBTQU5EOiAzLFxuICBHUkFWRUw6IDQsXG4gIFNUT05FOiA1LFxuICBPUkU6IDYsXG4gIFdBVEVSOiA3LFxuICBCRURST0NLOiA4LFxuICBNT1NTOiA5LFxufSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIE1hdElkID0gKHR5cGVvZiBNQVQpW2tleW9mIHR5cGVvZiBNQVRdO1xuXG5leHBvcnQgY29uc3QgaXNTb2xpZCA9IChtOiBudW1iZXIpOiBib29sZWFuID0+IG0gIT09IE1BVC5BSVIgJiYgbSAhPT0gTUFULldBVEVSO1xuZXhwb3J0IGNvbnN0IGlzT3BhcXVlID0gaXNTb2xpZDtcblxuZXhwb3J0IGNvbnN0IGNsYW1wID0gKHY6IG51bWJlciwgYTogbnVtYmVyLCBiOiBudW1iZXIpID0+ICh2IDwgYSA/IGEgOiB2ID4gYiA/IGIgOiB2KTtcbmV4cG9ydCBjb25zdCBsZXJwID0gKGE6IG51bWJlciwgYjogbnVtYmVyLCB0OiBudW1iZXIpID0+IGEgKyAoYiAtIGEpICogdDtcbmNvbnN0IHNtb290aHN0ZXAgPSAoZTA6IG51bWJlciwgZTE6IG51bWJlciwgeDogbnVtYmVyKSA9PiB7XG4gIGNvbnN0IHQgPSBjbGFtcCgoeCAtIGUwKSAvIChlMSAtIGUwKSwgMCwgMSk7XG4gIHJldHVybiB0ICogdCAqICgzIC0gMiAqIHQpO1xufTtcblxuLy8gLS0tLS0tLS0tLSBkZXRlcm1pbmlzdGljIGhhc2ggLyBub2lzZSAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gaGFzaDJpKHg6IG51bWJlciwgeTogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoM2koeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGggPSBzZWVkIF4gTWF0aC5pbXVsKHgsIDM3NDc2MTM5MykgXiBNYXRoLmltdWwoeSwgNjY4MjY1MjYzKSBeIE1hdGguaW11bCh6LCAyMjQ2ODIyNTE5KTtcbiAgaCA9IE1hdGguaW11bChoIF4gKGggPj4+IDEzKSwgMTI3NDEyNjE3Nyk7XG4gIHJldHVybiAoKGggXiAoaCA+Pj4gMTYpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbXVsYmVycnkzMihzZWVkOiBudW1iZXIpOiAoKSA9PiBudW1iZXIge1xuICBsZXQgYSA9IHNlZWQgPj4+IDA7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgYSA9IChhICsgMHg2ZDJiNzlmNSkgPj4+IDA7XG4gICAgbGV0IHQgPSBhO1xuICAgIHQgPSBNYXRoLmltdWwodCBeICh0ID4+PiAxNSksIHQgfCAxKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgdCB8IDYxKTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cblxuY29uc3Qgc21vb3RoID0gKHQ6IG51bWJlcikgPT4gdCAqIHQgKiAoMyAtIDIgKiB0KTtcblxuZnVuY3Rpb24gdmFsdWVOb2lzZTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpO1xuICBjb25zdCBhID0gaGFzaDJpKHhpLCB5aSwgc2VlZCksIGIgPSBoYXNoMmkoeGkgKyAxLCB5aSwgc2VlZCk7XG4gIGNvbnN0IGMgPSBoYXNoMmkoeGksIHlpICsgMSwgc2VlZCksIGQgPSBoYXNoMmkoeGkgKyAxLCB5aSArIDEsIHNlZWQpO1xuICBjb25zdCB0b3AgPSBhICsgKGIgLSBhKSAqIHhmO1xuICBjb25zdCBib3R0b20gPSBjICsgKGQgLSBjKSAqIHhmO1xuICByZXR1cm4gdG9wICsgKGJvdHRvbSAtIHRvcCkgKiB5Zjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZibTIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlciwgb2N0YXZlczogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDAsIGFtcCA9IDEsIGZyZXEgPSAxLCBub3JtID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvY3RhdmVzOyBpKyspIHtcbiAgICBzdW0gKz0gYW1wICogdmFsdWVOb2lzZTIoeCAqIGZyZXEsIHkgKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG5mdW5jdGlvbiB2YWx1ZU5vaXNlMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCB4aSA9IE1hdGguZmxvb3IoeCksIHlpID0gTWF0aC5mbG9vcih5KSwgemkgPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCB4ZiA9IHNtb290aCh4IC0geGkpLCB5ZiA9IHNtb290aCh5IC0geWkpLCB6ZiA9IHNtb290aCh6IC0gemkpO1xuICBjb25zdCBjMDAwID0gaGFzaDNpKHhpLCB5aSwgemksIHNlZWQpLCBjMTAwID0gaGFzaDNpKHhpICsgMSwgeWksIHppLCBzZWVkKTtcbiAgY29uc3QgYzAxMCA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSwgc2VlZCksIGMxMTAgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppLCBzZWVkKTtcbiAgY29uc3QgYzAwMSA9IGhhc2gzaSh4aSwgeWksIHppICsgMSwgc2VlZCksIGMxMDEgPSBoYXNoM2koeGkgKyAxLCB5aSwgemkgKyAxLCBzZWVkKTtcbiAgY29uc3QgYzAxMSA9IGhhc2gzaSh4aSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpLCBjMTExID0gaGFzaDNpKHhpICsgMSwgeWkgKyAxLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCB4MDAgPSBjMDAwICsgKGMxMDAgLSBjMDAwKSAqIHhmO1xuICBjb25zdCB4MTAgPSBjMDEwICsgKGMxMTAgLSBjMDEwKSAqIHhmO1xuICBjb25zdCB4MDEgPSBjMDAxICsgKGMxMDEgLSBjMDAxKSAqIHhmO1xuICBjb25zdCB4MTEgPSBjMDExICsgKGMxMTEgLSBjMDExKSAqIHhmO1xuICBjb25zdCB5MCA9IHgwMCArICh4MTAgLSB4MDApICogeWY7XG4gIGNvbnN0IHkxID0geDAxICsgKHgxMSAtIHgwMSkgKiB5ZjtcbiAgcmV0dXJuIHkwICsgKHkxIC0geTApICogemY7XG59XG5cbmZ1bmN0aW9uIGZibTMoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMyh4ICogZnJlcSwgeSAqIGZyZXEsIHogKiBmcmVxLCBzZWVkICsgaSAqIDEzMSk7XG4gICAgbm9ybSArPSBhbXA7XG4gICAgYW1wICo9IDAuNTsgZnJlcSAqPSAyO1xuICB9XG4gIHJldHVybiBzdW0gLyBub3JtO1xufVxuXG4vLyAtLS0tLS0tLS0tIHdvcmxkIHR5cGVzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRQYXJhbXMge1xuICBzaXplOiBudW1iZXI7XG4gIGNodW5rU2l6ZTogbnVtYmVyO1xuICB5TWluOiBudW1iZXI7XG4gIHlNYXg6IG51bWJlcjtcbiAgc2VhTGV2ZWw6IG51bWJlcjtcbiAgZ2VuZXJhdG9yVmVyc2lvbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9QQVJBTVM6IFdvcmxkUGFyYW1zID0ge1xuICBzaXplOiBXT1JMRF9TSVpFLFxuICBjaHVua1NpemU6IENIVU5LX1NJWkUsXG4gIHlNaW46IFlfTUlOLFxuICB5TWF4OiBZX01BWCxcbiAgc2VhTGV2ZWw6IFNFQV9MRVZFTCxcbiAgZ2VuZXJhdG9yVmVyc2lvbjogR0VORVJBVE9SX1ZFUlNJT04sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsQ2h1bmsge1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICBrZXk6IHN0cmluZztcbiAgLyoqIHggKyB6KjMyICsgKHktWV9NSU4pKjEwMjQgKi9cbiAgZGF0YTogVWludDhBcnJheTtcbiAgLyoqIHRvcCBzb2xpZCB5LCBlbmNvZGVkIGFzICh5IC0gWV9NSU4pLCAwLi4xMjc7IDAgbWVhbnMgbm8gc29saWQuICovXG4gIGhlaWdodHM6IFVpbnQ4QXJyYXk7XG4gIC8qKiB0b3AgbWF0ZXJpYWwgcGVyIGNvbHVtbi4gKi9cbiAgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5O1xuICBub25BaXI6IG51bWJlcjtcbiAgZGlydHk6IGJvb2xlYW47XG4gIGdlbmVyYXRlZEF0OiBudW1iZXI7XG59XG5cbi8vIE5hdHVyYWwgYXNzZXRzIGFyZSB0aGUgcHJvamVjdCdzIFN0eWwgKGBuYXRfYCkgcGlwZWxpbmUgKEFTLTAwMSB2MiksIG5vdFxuLy8gTm94ZWwgYXJjaGl0ZWN0dXJlLiBOb3hlbCByZW1haW5zIHRoZSBodW1hbi1tYWRlIGtpdC93YXlzdG9uZS9tYXJrZXIgc3lzdGVtLlxuLy8gUmV0aXJlZCBvbmx5IGFzIHdvcmxkIGNvbnRlbnQuIFRoZSBuYW1lcyByZW1haW4gaW4gdGhlIHNlcmlhbGl6ZWQgdHlwZSBzb1xuLy8gb2xkIHNuYXBzaG90cyBhbmQgYWNjZXB0ZWQgaGFydmVzdCBqb3VybmFscyBjYW4gYmUgbWlncmF0ZWQgd2l0aG91dCByZWplY3Rpbmdcbi8vIG90aGVyd2lzZSB2YWxpZCBzYXZlcy4gR2VuZXJhdGlvbiwgY29sbGlzaW9uIGFuZCBpbnNwZWN0aW9uIG5ldmVyIHVzZSB0aGVtLlxuZXhwb3J0IGNvbnN0IFJFVElSRURfU1RPTkVfS0lORFMgPSBuZXcgU2V0PEVudGl0eUtpbmQ+KFtcbiAgJ3N0eWxfcm9ja19zbWFsbCcsICdzdHlsX3JvY2tfbWVkaXVtJywgJ3N0eWxfcm9ja19sYXJnZScsXG5dKTtcbmV4cG9ydCBjb25zdCBpc1JldGlyZWRTdG9uZUtpbmQgPSAoa2luZDogRW50aXR5S2luZCk6IGJvb2xlYW4gPT4gUkVUSVJFRF9TVE9ORV9LSU5EUy5oYXMoa2luZCk7XG5leHBvcnQgdHlwZSBBY3RpdmVFbnRpdHlLaW5kID0gRXhjbHVkZTxFbnRpdHlLaW5kLFxuICAnc3R5bF9yb2NrX3NtYWxsJyB8ICdzdHlsX3JvY2tfbWVkaXVtJyB8ICdzdHlsX3JvY2tfbGFyZ2UnPjtcblxuZnVuY3Rpb24gbGl2ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBFbnRpdHkgfCBudWxsIHtcbiAgY29uc3QgZW50aXR5ID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgcmV0dXJuICFlbnRpdHkgfHwgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhpZCkgPyBudWxsIDogZW50aXR5O1xufVxuXG5leHBvcnQgdHlwZSBFbnRpdHlLaW5kID1cbiAgfCAnc3R5bF90cmVlX3NwaXJlJ1xuICB8ICdzdHlsX3RyZWVfdGFibGUnXG4gIHwgJ3N0eWxfdHJlZV9jbHVzdGVyJ1xuICB8ICdzdHlsX3RyZWVfYmxvc3NvbSdcbiAgfCAnc3R5bF9zaHJ1YidcbiAgfCAnc3R5bF9yb2NrX3NtYWxsJ1xuICB8ICdzdHlsX3JvY2tfbWVkaXVtJ1xuICB8ICdzdHlsX3JvY2tfbGFyZ2UnXG4gIHwgJ3N0eWxfb3JlJ1xuICB8ICdzdHlsX2NhaXJuJ1xuICB8ICd3YXlzdG9uZSdcbiAgfCAnbWFya2VyJztcblxuZXhwb3J0IHR5cGUgUmVzb3VyY2VUeXBlID0gJ3dvb2QnIHwgJ3N0b25lJyB8ICdvcmUnIHwgJ2ZpYmVyJztcblxuZXhwb3J0IGludGVyZmFjZSBFbnRpdHkge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICBjaHVuazogc3RyaW5nO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgc2NhbGU6IG51bWJlcjtcbiAgdmFyaWFudDogbnVtYmVyO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgcmVtYWluaW5nOiBudW1iZXI7XG4gIHlpZWxkUGVySGFydmVzdDogbnVtYmVyO1xuICAvKiogVHJ1ZSBvbmNlIHRoZSBlbnRpdHkgaXMgZnVsbHkgZGVwbGV0ZWQuICovXG4gIGhhcnZlc3RlZDogYm9vbGVhbjtcbiAgLyoqIFRydWUgYWZ0ZXIgdGhlIGZpcnN0IHN1Y2Nlc3NmdWwgaGFydmVzdCwgZXZlbiBpZiB5aWVsZCByZW1haW5zLiAqL1xuICBoYXJ2ZXN0ZWRPbmNlPzogYm9vbGVhbjtcbiAgcHJvdmlzaW9uYWw6IGJvb2xlYW47XG4gIGF1dGhvcmVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5veGVsU2l0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHByb3Zpc2lvbmFsOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZ2lvbkluZm8ge1xuICBpZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICB0eXBlOiAncGxhaW4nIHwgJ2ZvcmVzdCcgfCAnaGlsbHMnIHwgJ2hpZ2hsYW5kJyB8ICd3YXRlcicgfCAncmlkZ2UnO1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICByeDogbnVtYmVyO1xuICByejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkU3RhdHMge1xuICBjaHVua3NHZW5lcmF0ZWQ6IG51bWJlcjtcbiAgY2h1bmtzRXZpY3RlZDogbnVtYmVyO1xuICB2b3hlbHNGaWxsZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGlvbk1zOiBudW1iZXI7XG4gIGVudGl0aWVzOiBudW1iZXI7XG4gIHRyZWVzOiBudW1iZXI7XG4gIHBpbmtUcmVlczogbnVtYmVyO1xuICBwaW5rT3ZlcmZsb3c6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcGFyYW1zOiBXb3JsZFBhcmFtcztcbiAgY2h1bmtzOiBNYXA8c3RyaW5nLCBWb3hlbENodW5rPjtcbiAgZW50aXRpZXM6IE1hcDxzdHJpbmcsIEVudGl0eT47XG4gIGVudGl0eUNodW5rczogTWFwPHN0cmluZywgc3RyaW5nW10+O1xuICAvKiogQ2h1bmtzIHdob3NlIGRldGVybWluaXN0aWMgbmF0dXJhbC1lbnRpdHkgc3RhdGUgaGFzIGJlZW4gY2hhbmdlZC4gKi9cbiAgZW50aXR5Q2hhbmdlczogU2V0PHN0cmluZz47XG4gIC8qKiBUb21ic3RvbmVzIGZvciByZW1vdmVkIGRldGVybWluaXN0aWMgbmF0dXJhbCBlbnRpdGllcy4gKi9cbiAgZW50aXR5UmVtb3ZhbHM6IFNldDxzdHJpbmc+O1xuICAvKiogQXV0aG9yaXRhdGl2ZSBidWlsdCBzdHJ1Y3R1cmVzIChob3VzZSwgcGF0aCwgdGVycmFjZXMsIGNyb3BzKS4gKi9cbiAgc3RydWN0dXJlczogTWFwPHN0cmluZywgU3RydWN0dXJlPjtcbiAgc2l0ZXM6IE5veGVsU2l0ZVtdO1xuICByZWdpb25zOiBSZWdpb25JbmZvW107XG4gIC8qKiBjaHVuayBrZXkgLT4gbG9jYWwgdm94ZWwgaW5kZXggLT4gbWF0ZXJpYWwuIER1cmFibGUsIGNvbXBhY3QgZWRpdHMuICovXG4gIGVkaXRzOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCBudW1iZXI+PjtcbiAgLyoqIEdsb2JhbCBsb2NhbC1wbGF5ZXIgY2FycmllZCBiYWc7IGJvdW5kZWQgaW4gc2NoZW1hIDMsIGxlZ2FjeSBpbiAxLzIuICovXG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgLyoqIFByZXNlbnQgb25seSBhZnRlciBzY2hlbWEtMyBnZW5lc2lzL3Jlc3RvcmF0aW9uLiAqL1xuICBsaWZlPzogTGlmZVN0YXRlO1xuICBkaXJ0eTogU2V0PHN0cmluZz47XG4gIHN0YXRzOiBXb3JsZFN0YXRzO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqXG4gICAqIE1vbm90b25pYyByZXZpc2lvbiBvZiBhdXRob3JpdGF0aXZlIHN0YXRlICh2b3hlbHMgYW5kIGVudGl0aWVzKS4gRGVyaXZlZFxuICAgKiBjYWNoZXMga2V5ZWQgb24gdGhpcyB2YWx1ZSBhcmUgZGlzY2FyZGVkIGFmdGVyIGFuIGVkaXQ7IG1lc2gvbmF2aWdhdGlvblxuICAgKiByZXZpc2lvbnMgYXJlIHNlcGFyYXRlIGJlY2F1c2UgdGhleSBhcmUgZGVyaXZlZCwgbm90IHdvcmxkIHN0YXRlLlxuICAgKi9cbiAgcmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGNodW5rS2V5ID0gKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpID0+IGAke2N4fSwke2N6fWA7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5YID0gKGN4OiBudW1iZXIpID0+IGN4ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5aID0gKGN6OiBudW1iZXIpID0+IGN6ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgbG9jYWxJbmRleCA9IChseDogbnVtYmVyLCB5SW5kZXg6IG51bWJlciwgbHo6IG51bWJlcikgPT5cbiAgbHggKyBseiAqIENIVU5LX1NJWkUgKyB5SW5kZXggKiBDSFVOS19BUkVBO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ggPSAoeDogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh4ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtaID0gKHo6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeiArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWCA9ICh4OiBudW1iZXIpID0+IHggLSAod29ybGRUb0NodW5rWCh4KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxaID0gKHo6IG51bWJlcikgPT4geiAtICh3b3JsZFRvQ2h1bmtaKHopICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHlUb0luZGV4ID0gKHk6IG51bWJlcikgPT4geSAtIFlfTUlOO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGQoc2VlZCA9IDEzMzcpOiBXb3JsZCB7XG4gIHJldHVybiB7XG4gICAgc2VlZCxcbiAgICBwYXJhbXM6IHsgLi4uREVGQVVMVF9QQVJBTVMgfSxcbiAgICBjaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdGllczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNodW5rczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNoYW5nZXM6IG5ldyBTZXQoKSxcbiAgICBlbnRpdHlSZW1vdmFsczogbmV3IFNldCgpLFxuICAgIHN0cnVjdHVyZXM6IG5ldyBNYXAoKSxcbiAgICBzaXRlczogW10sXG4gICAgcmVnaW9uczogUkVHSU9OUyxcbiAgICBlZGl0czogbmV3IE1hcCgpLFxuICAgIGludmVudG9yeToge30sXG4gICAgZGlydHk6IG5ldyBTZXQoKSxcbiAgICBzdGF0czoge1xuICAgICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICAgIGVudGl0aWVzOiAwLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gICAgfSxcbiAgICBhdXRob3JlZFBsYWNlZDogZmFsc2UsXG4gICAgcmV2aXNpb246IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBpbml0aWFsUmFkaXVzID0gMCk6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVZFTCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIHJldHVybiBNQVQuU1RPTkU7XG59XG5cbmZ1bmN0aW9uIG9yZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBjbHVzdGVyID0gZmJtMih4IC8gNTUsIHogLyA1NSwgc2VlZCArIDEzMCwgMik7XG4gIGlmIChjbHVzdGVyIDwgMC41NykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBuID0gdmFsdWVOb2lzZTMoeCAqIDAuMDksIHkgKiAwLjEzLCB6ICogMC4wOSwgc2VlZCArIDEzMSk7XG4gIGNvbnN0IG4yID0gdmFsdWVOb2lzZTMoeCAqIDAuMjIgKyA1LCB5ICogMC4zMSwgeiAqIDAuMjIgLSAzLCBzZWVkICsgMTMyKTtcbiAgcmV0dXJuIG4gPiAwLjcwICYmIG4yID4gMC41MDtcbn1cblxuZnVuY3Rpb24gY2F2ZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gZmJtMyh4ICogMC4wNzUsIHkgKiAwLjExLCB6ICogMC4wNzUsIHNlZWQgKyAxNDAsIDIpID4gMC43Mjtcbn1cblxuZnVuY3Rpb24gb3ZlcmhhbmdBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHZhbHVlTm9pc2UzKHggKiAwLjE4LCB5ICogMC4yMiwgeiAqIDAuMTgsIHNlZWQgKyAxNDEpID4gMC42Mjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeTogbnVtYmVyO1xuICB0b3A6IE1hdElkO1xuICBzbG9wZTogbnVtYmVyO1xufVxuXG4vKiogQmFzZSBzdXJmYWNlIHNhbXBsZSBmb3IgbWFjcm8gTE9ELiBEb2VzIG5vdCBpbmNsdWRlIHZveGVsIGVkaXRzL292ZXJoYW5ncy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVTdXJmYWNlKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBTdXJmYWNlU2FtcGxlIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgY29uc3Qgc2xvcGUgPSBzbG9wZUF0KHNlZWQsIHgsIHosIHkpO1xuICByZXR1cm4geyB5LCB0b3A6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgeSwgc2xvcGUpLCBzbG9wZSB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNodW5rIGdlbmVyYXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgcmV0dXJuIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcblxuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfVk9MVU1FKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCB0b3BNYXRlcmlhbHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGNvbnN0IHNlZWQgPSB3b3JsZC5zZWVkO1xuXG4gIC8vIFBhZGRlZCBoZWlnaHQgY2FjaGU6IGEgdGhyZWUtY2VsbCBib3JkZXIgY292ZXJzIHNsb3BlLCBiZWFjaCBhbmQgbGVkZ2VzLlxuICBjb25zdCBQID0gMztcbiAgY29uc3QgUFcgPSBDSFVOS19TSVpFICsgUCAqIDI7XG4gIGNvbnN0IGJhc2VIID0gbmV3IEludDE2QXJyYXkoUFcgKiBQVyk7XG4gIGZvciAobGV0IHB6ID0gMDsgcHogPCBQVzsgcHorKykge1xuICAgIGZvciAobGV0IHB4ID0gMDsgcHggPCBQVzsgcHgrKykge1xuICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCBveCArIHB4IC0gUCwgb3ogKyBweiAtIFApO1xuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB0b3AgPSB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHNlYSBsZXZlbC5cbiAgICAgIGlmIChoIDwgU0VBX0xFVkVMKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCBTRUFfTEVWRUw7IHkrKykge1xuICAgICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseik7XG4gICAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgICAgZGF0YVtpZHhdID0gTUFULldBVEVSO1xuICAgICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvcFNvbGlkID0gTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLm1heChZX01JTiwgaCAtIDEpKTtcbiAgICAgIGhlaWdodHNbY29sXSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2NvbF0gPSB0b3A7XG4gICAgfVxuICB9XG5cbiAgLy8gUHJvdHJ1ZGluZyBsZWRnZXM6IG9uZSBvciB0d28gc3RvbmUgYmxvY2tzIGV4dGVuZCBmcm9tIGEgaGlnaCBjb2x1bW4gb3ZlclxuICAvLyBhIGxvd2VyIG5laWdoYm91ci4gVGhleSBjcmVhdGUgcmVhZGFibGUgb3ZlcmhhbmdzIHdpdGhvdXQgYSBmdWxsIGNhdmUgcGFzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGlmIChzbG9wZSA8IDIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZGlyczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBkaXJzKSB7XG4gICAgICAgIGNvbnN0IG54ID0gbHggKyBkeCwgbnogPSBseiArIGR6O1xuICAgICAgICBpZiAobnggPCAwIHx8IG56IDwgMCB8fCBueCA+PSBDSFVOS19TSVpFIHx8IG56ID49IENIVU5LX1NJWkUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBuaCA9IGJhc2VIWyhueiArIFApICogUFcgKyAobnggKyBQKV07XG4gICAgICAgIGlmIChoIC0gbmggPCAyKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGhhc2gzaShseCwgbHosIGR4ICogMyArIGR6ICogNywgc2VlZCArIDE1MCkgPCAwLjU1KSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgeSA9IGggLSAyO1xuICAgICAgICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gaCkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobngsIHlUb0luZGV4KHkpLCBueik7XG4gICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuU1RPTkU7XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZWNvbXB1dGUgdGhlIGNvbHVtbiBjYWNoZSBhZnRlciBsZWRnZXMvY2F2ZXMuIFRoZSBleHBvc2VkIHRvcCBtYXRlcmlhbFxuICAvLyBtdXN0IGNvbWUgZnJvbSB0aGUgYWN0dWFsIHRvcCBzb2xpZCB2b3hlbCwgbm90IHRoZSBwcmUtY2FydmUgZ3Vlc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgbGV0IHRvcE1hdDogbnVtYmVyID0gdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICBjb25zdCBtID0gZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgfVxuICAgICAgaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0b3BNYXQ7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY2h1bms6IFZveGVsQ2h1bmsgPSB7XG4gICAgY3gsIGN6LCBrZXksIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyLFxuICAgIGRpcnR5OiB0cnVlLFxuICAgIGdlbmVyYXRlZEF0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgfTtcblxuICAvLyBBcHBseSBkdXJhYmxlIGVkaXRzIGFmdGVyIGJhc2UgZ2VuZXJhdGlvbi5cbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgaWYgKGVkaXRzKSB7XG4gICAgZm9yIChjb25zdCBbaWR4LCBtXSBvZiBlZGl0cykge1xuICAgICAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgICB9XG4gICAgLy8gUmVjb21wdXRlIHRoZSBjYWNoZSBmb3IgZWRpdGVkIGNodW5rcy5cbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHVwZGF0ZUNvbHVtbkNhY2hlKGNodW5rLCBseCwgbHopO1xuICAgIH1cbiAgfVxuICAvLyBOb24tYWlyIGNvdW50cyBhcmUgZGVyaXZlZCByZW5kZXJlciBzdGF0aXN0aWNzLCBub3QgZHVyYWJsZSB3b3JsZCBzdGF0ZS5cbiAgLy8gRWRpdGVkIGJhc2UgYWlyIG1heSBiZWNvbWUgc29saWQgKGFuZCB2aWNlIHZlcnNhKSBkdXJpbmcgcmVzdG9yYXRpb24uXG4gIGxldCBlZGl0ZWROb25BaXIgPSAwO1xuICBmb3IgKGNvbnN0IG1hdGVyaWFsIG9mIGNodW5rLmRhdGEpIGlmIChtYXRlcmlhbCAhPT0gTUFULkFJUikgZWRpdGVkTm9uQWlyKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBlZGl0ZWROb25BaXIgLSBub25BaXI7XG5cbiAgd29ybGQuY2h1bmtzLnNldChrZXksIGNodW5rKTtcbiAgd29ybGQuc3RhdHMuY2h1bmtzR2VuZXJhdGVkKys7XG4gIHdvcmxkLnN0YXRzLnZveGVsc0ZpbGxlZCArPSBub25BaXI7XG4gIHdvcmxkLnN0YXRzLmdlbmVyYXRpb25NcyArPSBwZXJmb3JtYW5jZS5ub3coKSAtIHQwO1xuICB3b3JsZC5kaXJ0eS5hZGQoa2V5KTtcblxuICBnZW5lcmF0ZUVudGl0aWVzKHdvcmxkLCBjaHVuayk7XG4gIHJldHVybiBjaHVuaztcbn1cblxuLyoqIEEgYmFzZS10ZXJyYWluIGNhY2hlIHNoYXJlZCBieSBlZGl0ZWQgYW5kIHVuZWRpdGVkIHJlZ2VuZXJhdGlvbi4gTmF0dXJhbFxuICogc2NlbmVyeSBuZXZlciBkZXBlbmRzIG9uIGxhdGVyIHZveGVsIGVkaXRzOyB0aGlzIGFsc28gbGV0cyBhIHNuYXBzaG90IHJlc3RvcmVcbiAqIGEgaGFydmVzdGVkIGNodW5rIHdpdGhvdXQgbWF0ZXJpYWxpemluZyB1bnJlbGF0ZWQgbmVpZ2hib3VyaW5nIGNodW5rcy4gKi9cbmNvbnN0IGJhc2VDb2x1bW5DYWNoZSA9IG5ldyBXZWFrTWFwPFdvcmxkLCBNYXA8c3RyaW5nLCB7IGhlaWdodHM6IFVpbnQ4QXJyYXk7IHRvcE1hdGVyaWFsczogVWludDhBcnJheSB9Pj4oKTtcblxuZnVuY3Rpb24gYmFzZUNvbHVtbnMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHsgaGVpZ2h0czogVWludDhBcnJheTsgdG9wTWF0ZXJpYWxzOiBVaW50OEFycmF5IH0ge1xuICBsZXQgY2FjaGUgPSBiYXNlQ29sdW1uQ2FjaGUuZ2V0KHdvcmxkKTtcbiAgaWYgKCFjYWNoZSkgeyBjYWNoZSA9IG5ldyBNYXAoKTsgYmFzZUNvbHVtbkNhY2hlLnNldCh3b3JsZCwgY2FjaGUpOyB9XG4gIGNvbnN0IGNhY2hlZCA9IGNhY2hlLmdldChjaHVuay5rZXkpO1xuICBpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuICBjb25zdCBjb2x1bW5zID0geyBoZWlnaHRzOiBuZXcgVWludDhBcnJheShjaHVuay5oZWlnaHRzKSwgdG9wTWF0ZXJpYWxzOiBuZXcgVWludDhBcnJheShjaHVuay50b3BNYXRlcmlhbHMpIH07XG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGNvbnN0IHggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpICsgbHgsIHogPSBjaHVua09yaWdpblooY2h1bmsuY3opICsgbHo7XG4gICAgICBjb25zdCBoID0gc3VyZmFjZUhlaWdodEF0KHdvcmxkLnNlZWQsIHgsIHopO1xuICAgICAgY29uc3Qgc2xvcGUgPSBzbG9wZUF0KHdvcmxkLnNlZWQsIHgsIHosIGgpO1xuICAgICAgY29uc3QgaW5kZXggPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgIGNvbHVtbnMuaGVpZ2h0c1tpbmRleF0gPSBjbGFtcChoIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgY29sdW1ucy50b3BNYXRlcmlhbHNbaW5kZXhdID0gdG9wTWF0ZXJpYWxBdCh3b3JsZC5zZWVkLCB4LCB6LCBoLCBzbG9wZSk7XG4gICAgfVxuICB9XG4gIGNhY2hlLnNldChjaHVuay5rZXksIGNvbHVtbnMpO1xuICByZXR1cm4gY29sdW1ucztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV2aWN0Q2h1bmsod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIXdvcmxkLmNodW5rcy5oYXMoa2V5KSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5jaHVua3MuZGVsZXRlKGtleSk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0V2aWN0ZWQrKztcbiAgLy8gQ2h1bmsgYnl0ZXMgYW5kIGNvbHVtbiBjYWNoZXMgYXJlIHJlZ2VuZXJhdGVkIG9uIGRlbWFuZC4gRW50aXRpZXMgcmVtYWluXG4gIC8vIGF1dGhvcml0YXRpdmU6IGV2aWN0aW9uIG11c3Qgbm90IGZvcmdldCB0aGVpciBwZXJzaXN0ZW50IHN0YXRlLlxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gLS0tLS0tLS0tLSBxdWVyaWVzIC8gZWRpdHMgLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGdldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHkgPCBZX01JTikgcmV0dXJuIE1BVC5CRURST0NLO1xuICBpZiAoeSA+PSBZX01BWCkgcmV0dXJuIE1BVC5BSVI7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBNQVQuQUlSO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIE1BVC5BSVI7XG4gIHJldHVybiBjaHVuay5kYXRhW2xvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpXSBhcyBNYXRJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFZveGVsKHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgbTogTWF0SWQpOiBib29sZWFuIHtcbiAgaWYgKHkgPCBZX01JTiB8fCB5ID49IFlfTUFYKSByZXR1cm4gZmFsc2U7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY3ggPSB3b3JsZFRvQ2h1bmtYKHgpLCBjeiA9IHdvcmxkVG9DaHVua1ooeik7XG4gIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgod29ybGRUb0xvY2FsWCh4KSwgeVRvSW5kZXgoeSksIHdvcmxkVG9Mb2NhbFooeikpO1xuICBjb25zdCBwcmV2aW91c0VkaXQgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmtLZXkoY3gsIGN6KSk/LmdldChpZHgpO1xuICAvLyBBIGNodW5rIGV2aWN0ZWQgYWZ0ZXIgYW4gZWFybGllciBlZGl0IGNhbiByZWdlbmVyYXRlIHdpdGggdGhhdCBkdXJhYmxlXG4gIC8vIG1hdGVyaWFsIGFscmVhZHkgYXBwbGllZC4gRHJvcHBpbmcgdGhlIGVkaXQgaGVyZSB3b3VsZCBtYWtlIGl0IGRpc2FwcGVhclxuICAvLyBvbiB0aGUgbmV4dCBldmljdGlvbi9yZXN0b3JhdGlvbiwgZXZlbiB0aG91Z2ggdGhlIGN1cnJlbnQgd3JpdGUgbm8tb3BzLlxuICBpZiAocHJldmlvdXNFZGl0ID09PSBtKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIGlmICghY2h1bmspIHJldHVybiBmYWxzZTtcbiAgbGV0IGVkaXRzID0gd29ybGQuZWRpdHMuZ2V0KGNodW5rLmtleSk7XG4gIGlmICghZWRpdHMpIHsgZWRpdHMgPSBuZXcgTWFwKCk7IHdvcmxkLmVkaXRzLnNldChjaHVuay5rZXksIGVkaXRzKTsgfVxuICAvLyBBbiBpZGVtcG90ZW50IHdyaXRlIG11c3Qgc3RpbGwgcmVzdG9yZSBhIGR1cmFibGUgZGVsdGEgZGlzY2FyZGVkIGJ5IGFuXG4gIC8vIG9sZGVyIHNuYXBzaG90IG9yIGRlbHRhIGRlY29kZXIuIEl0IGlzIG5vdCBhIG5ldyBhdXRob3JpdGF0aXZlIHJldmlzaW9uLlxuICBpZiAoY2h1bmsuZGF0YVtpZHhdID09PSBtKSB7XG4gICAgaWYgKCFlZGl0cy5oYXMoaWR4KSkgZWRpdHMuc2V0KGlkeCwgbSk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNodW5rLmRhdGFbaWR4XSA9IG07XG4gIGVkaXRzLnNldChpZHgsIG0pO1xuICBjaHVuay5kaXJ0eSA9IHRydWU7XG4gIHdvcmxkLmRpcnR5LmFkZChjaHVuay5rZXkpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgd29ybGRUb0xvY2FsWCh4KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDb2x1bW5DYWNoZShjaHVuazogVm94ZWxDaHVuaywgbHg6IG51bWJlciwgbHo6IG51bWJlcik6IHZvaWQge1xuICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgaWYgKGlzU29saWQoY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSkpIHsgdG9wU29saWQgPSB5OyBicmVhazsgfVxuICB9XG4gIGNodW5rLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gIGNvbnN0IHRtID0gY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgaWYgKHRvcFNvbGlkID49IFlfTUlOKSB7XG4gICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgodG9wU29saWQpLCBseildO1xuICAgIGlmIChtICE9PSBNQVQuV0FURVIpIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBtO1xuICB9IGVsc2Uge1xuICAgIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0bTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSB5IGNvb3JkaW5hdGUgb2YgdGhlIGV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbiBhdCB4L3ouXG4gKiBBIHNvbGlkIHZveGVsIGF0IHkgb2NjdXBpZXMgW3ksIHkrMSksIHNvIHRoZSB3YWxrYWJsZSBzdXJmYWNlIGlzIHRvcFNvbGlkKzEuXG4gKiBUaGlzIGlzIGEgZGVyaXZlZCBxdWVyeTsgdGhlIGF1dGhvcml0YXRpdmUgc3RhdGUgcmVtYWlucyB0aGUgdm94ZWwgdm9sdW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gWV9NSU47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gWV9NSU47XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLnRvcE1hdGVyaWFsc1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBoID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgLSBoIDogMDtcbn1cblxuLy8gLS0tLS0tLS0tLSBlbnRpdGllcyAtLS0tLS0tLS0tXG5mdW5jdGlvbiBhZGRFbnRpdHkod29ybGQ6IFdvcmxkLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLmhhcyhlLmlkKSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKVxuICAgIHx8IHdvcmxkLmVudGl0eVJlbW92YWxzLmhhcyhlLmlkKSkgcmV0dXJuO1xuICB3b3JsZC5lbnRpdGllcy5zZXQoZS5pZCwgZSk7XG4gIGxldCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBsaXN0KTsgfVxuICBsaXN0LnB1c2goZS5pZCk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgLy8gR2VuZXJhdGlvbiBpcyBkZXRlcm1pbmlzdGljIGFuZCBhZHZhbmNlcyBubyBwbGF5ZXItY29tbWFuZCBwcmVjb25kaXRpb24uXG4gIC8vIEF1dGhvcmVkIHNjYWZmb2xkaW5nIG1heSB0cmFuc2llbnRseSBjaGFuZ2UgaXQ7IHRoZSBzbmFwc2hvdCByZXN0b3JlcyB0aGVcbiAgLy8gc2F2ZWQgcmV2aXNpb24gYWZ0ZXIgcGxhY2luZyB0aGF0IHNjYWZmb2xkaW5nLlxufVxuXG4vKipcbiAqIFJlbW92ZSBhbiBlbnRpdHkgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB3b3JsZC4gVXNlZCB3aGVuIGEgc2l0ZSBpcyBjbGVhcmVkOlxuICogdGhlIHJlc291cmNlIHlpZWxkIGlzIGFjY291bnRlZCBmb3IgYnkgdGhlIGNhbGxlciwgYW5kIHRoZSBlbnRpdHkgbXVzdCBzdG9wXG4gKiBleGlzdGluZyBmb3IgY29sbGlzaW9uLCBvYnN0cnVjdGlvbiBhbmQgcGVyc2lzdGVuY2UsIG5vdCBqdXN0IGJlIGhpZGRlbiBieVxuICogdGhlIHJlbmRlcmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRW50aXR5KHdvcmxkOiBXb3JsZCwgaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgaWYgKCFlIHx8IChpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpKSByZXR1cm4gZmFsc2U7XG4gIHdvcmxkLmVudGl0aWVzLmRlbGV0ZShpZCk7XG4gIGNvbnN0IGxpc3QgPSB3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGUuY2h1bmspO1xuICBpZiAobGlzdCkge1xuICAgIGNvbnN0IGkgPSBsaXN0LmluZGV4T2YoaWQpO1xuICAgIGlmIChpID49IDApIGxpc3Quc3BsaWNlKGksIDEpO1xuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGlkKTtcbiAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZW50aXR5SWQoY2h1bms6IHN0cmluZywgaTogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBlOiR7Y2h1bmt9OiR7aX1gO1xufVxuXG5mdW5jdGlvbiBmb3Jlc3RTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBlYXN0ID0gTWF0aC5leHAoLSgoKHd4IC0gMjIwKSAvIDI2MCkgKiogMiArICgod3ogKyAxMTApIC8gMjIwKSAqKiAyKSk7XG4gIGNvbnN0IG5vcnRoID0gTWF0aC5leHAoLSgoKHd4IC0gMjApIC8gMzAwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAxOTApICoqIDIpKTtcbiAgY29uc3Qgd2VzdCA9IE1hdGguZXhwKC0oKCh3eCArIDM0MCkgLyAyMDApICoqIDIgKyAoKHd6IC0gMTIwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBzb3V0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDEyMCkgLyAyNDApICoqIDIgKyAoKHd6IC0gMzMwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBtb2lzdHVyZSA9IGZibTIod3ggLyAyNjAsIHd6IC8gMjYwLCBzZWVkICsgMjAxLCA0KTtcbiAgY29uc3QgdmFsbGV5ID0gTWF0aC5leHAoLSgod3ggLyAxNDApICoqIDIgKyAod3ogLyAxMDUpICoqIDIpKTtcbiAgcmV0dXJuIE1hdGgubWF4KGVhc3QsIG5vcnRoICogMC45Miwgd2VzdCAqIDAuODAsIHNvdXRoICogMC43OCkgKiAwLjgyXG4gICAgKyBtb2lzdHVyZSAqIDAuMzggLSAwLjIyIC0gdmFsbGV5ICogMC4zNDtcbn1cblxuZnVuY3Rpb24gcm9ja1Njb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IG1vdW50YWluID0gZmJtMih3eCAvIDMzMCwgd3ogLyAzMzAsIHNlZWQgKyAyMDIsIDMpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDE0MCwgd3ogLyAxNDAsIHNlZWQgKyAyMDMsIDMpIC0gMSk7XG4gIHJldHVybiBtb3VudGFpbiAqIDAuNTUgKyByaWRnZSAqIDAuNDU7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRW50aXRpZXMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHZvaWQge1xuICBnZW5lcmF0ZUVudGl0eUNodW5rKHdvcmxkLCBjaHVuay5jeCwgY2h1bmsuY3opO1xufVxuXG4vKiogQGludGVybmFsIFJlcGxheXMgZGV0ZXJtaW5pc3RpYyBnZW5lcmF0aW9uIGZvciBzbmFwc2hvdCBlbnRpdHkgZGVsdGFzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlRW50aXR5Q2h1bmsod29ybGQ6IFdvcmxkLCBjeDogbnVtYmVyLCBjejogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGlmICh3b3JsZC5lbnRpdHlDaHVua3MuaGFzKGtleSkpIHJldHVybjtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuO1xuXG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKGhhc2gyaShjaHVuay5jeCwgY2h1bmsuY3osIHdvcmxkLnNlZWQgKyA5MDApICogNDI5NDk2NzI5NikgPj4+IDApO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgY29uc3QgY29sdW1ucyA9IGJhc2VDb2x1bW5zKHdvcmxkLCBjaHVuayk7XG4gIGxldCBuID0gMDtcbiAgbGV0IG5hdHVyYWxUcmVlcyA9IDA7XG4gIGxldCBuYXR1cmFsUGlua1RyZWVzID0gMDtcblxuICBjb25zdCBsb2NhbFN1cmZhY2UgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgcmV0dXJuIGNvbHVtbnMuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gKyBZX01JTjtcbiAgfTtcbiAgY29uc3QgbG9jYWxUb3AgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IE1hdElkID0+IHtcbiAgICByZXR1cm4gY29sdW1ucy50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdIGFzIE1hdElkO1xuICB9O1xuICBjb25zdCBsb2NhbFNsb3BlID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICByZXR1cm4gTWF0aC5tYXgoXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShjbGFtcChseCArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSwgbHopKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6IC0gMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGx4LCBjbGFtcChseiArIDEsIDAsIENIVU5LX1NJWkUgLSAxKSkpLFxuICAgICk7XG4gIH07XG5cbiAgLy8gQSBqaXR0ZXJlZCA4IG0gbGF0dGljZSBnaXZlcyBjb2hlcmVudCBtYXNzZXMgYW5kIGF2b2lkcyBwZXItZnJhbWUgc2NhdHRlci5cbiAgZm9yIChsZXQgZ3ogPSAwOyBneiA8IENIVU5LX1NJWkU7IGd6ICs9IDgpIHtcbiAgICBmb3IgKGxldCBneCA9IDA7IGd4IDwgQ0hVTktfU0laRTsgZ3ggKz0gOCkge1xuICAgICAgY29uc3QgbHggPSBjbGFtcChNYXRoLmZsb29yKGd4ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3QgbHogPSBjbGFtcChNYXRoLmZsb29yKGd6ICsgMiArIChybmQoKSAtIDAuNSkgKiA1KSwgMSwgQ0hVTktfU0laRSAtIDIpO1xuICAgICAgY29uc3Qgd3ggPSBveCArIGx4LCB3eiA9IG96ICsgbHo7XG4gICAgICBjb25zdCBoID0gbG9jYWxTdXJmYWNlKGx4LCBseik7XG4gICAgICBpZiAoaCA8PSBTRUFfTEVWRUwgKyAxKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHNsb3BlID0gbG9jYWxTbG9wZShseCwgbHopO1xuICAgICAgY29uc3QgdG9wID0gbG9jYWxUb3AobHgsIGx6KTtcbiAgICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikgY29udGludWU7XG4gICAgICBjb25zdCBmb3Jlc3QgPSBmb3Jlc3RTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9ja3kgPSByb2NrU2NvcmUod3gsIHd6LCB3b3JsZC5zZWVkKTtcbiAgICAgIGNvbnN0IHJvbGwgPSBybmQoKTtcblxuICAgICAgY29uc3QgdHJlZUNoYW5jZSA9IGZvcmVzdCA+IDAuNTAgPyAwLjcyIDogZm9yZXN0ID4gMC4zMCA/IDAuMjUgOiAwLjA1O1xuICAgICAgaWYgKHRvcCA9PT0gTUFULkdSQVNTICYmIHNsb3BlIDw9IDIgJiYgcm9sbCA8IHRyZWVDaGFuY2UpIHtcbiAgICAgICAgLy8gVGhlIGNhcCBpcyBhIGRldGVybWluaXN0aWMgbmF0dXJhbC1nZW5lcmF0aW9uIHByb3BlcnR5LiBJdCBjYW5ub3RcbiAgICAgICAgLy8gZGVwZW5kIG9uIHdoaWNoIGNodW5rcyBhIHJlbmRlcmVyIGxvYWRlZCBiZWZvcmUgdGhpcyBvbmUuXG4gICAgICAgIGxldCBraW5kOiBFbnRpdHlLaW5kO1xuICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICBjb25zdCBzcGVjaWVzUm9sbCA9IHJuZCgpO1xuICAgICAgICBpZiAoc3BlY2llc1JvbGwgPCAwLjEyKSB7XG4gICAgICAgICAgaWYgKChuYXR1cmFsUGlua1RyZWVzICsgMSkgPiAwLjI1ICogKG5hdHVyYWxUcmVlcyArIDEpKSB7XG4gICAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgICAgICB3b3JsZC5zdGF0cy5waW5rT3ZlcmZsb3crKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfYmxvc3NvbSc7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDIpO1xuICAgICAgICAgICAgbmF0dXJhbFBpbmtUcmVlcysrO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua1RyZWVzKys7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC40MCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3NwaXJlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2UgaWYgKHNwZWNpZXNSb2xsIDwgMC43NCkge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX3RhYmxlJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2NsdXN0ZXInO1xuICAgICAgICAgIHZhcmlhbnQgPSBNYXRoLmZsb29yKHJuZCgpICogMyk7XG4gICAgICAgIH1cbiAgICAgICAgbmF0dXJhbFRyZWVzKys7XG4gICAgICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjg4ICsgcm5kKCkgKiAwLjI0LCB2YXJpYW50LFxuICAgICAgICAgIHJlc291cmNlOiAnd29vZCcsIHJlbWFpbmluZzogMTIsIHlpZWxkUGVySGFydmVzdDogNCxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgcm9ja3kgPiAwLjQ2ICYmIHJvbGwgPCAwLjM4KSB7XG4gICAgICAgIC8vIENvbnN1bWUgdGhlIHJldGlyZWQgc3RvbmUgZm9ybSdzIHJhbmRvbSBkcmF3cyBhbmQgYWxsb2NhdGUgaXRzIG9sZFxuICAgICAgICAvLyBzZXF1ZW5jZSBJRCwgYnV0IGRvIG5vdCBpbnNlcnQgYW4gZW50aXR5LiBMYXRlciBuYXR1cmFsIHBsYWNlbWVudHNcbiAgICAgICAgLy8gdGhlcmVmb3JlIHJlbWFpbiBieXRlLWZvci1ieXRlIGNvbXBhdGlibGUgd2l0aCByZWNvcmRlZCBzYXZlcy5cbiAgICAgICAgY29uc3Qgc2l6ZVJvbGwgPSBybmQoKTtcbiAgICAgICAgY29uc3Qga2luZDogRW50aXR5S2luZCA9IHNpemVSb2xsIDwgMC41NSA/ICdzdHlsX3JvY2tfc21hbGwnXG4gICAgICAgICAgOiBzaXplUm9sbCA8IDAuOTAgPyAnc3R5bF9yb2NrX21lZGl1bScgOiAnc3R5bF9yb2NrX2xhcmdlJztcbiAgICAgICAgY29uc3QgaWQgPSBlbnRpdHlJZChjaHVuay5rZXksIG4rKyk7XG4gICAgICAgIGNvbnN0IHJlY29yZCA9IHtcbiAgICAgICAgICBpZCwga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJlc291cmNlOiAnc3RvbmUnIGFzIGNvbnN0LFxuICAgICAgICAgIHJlbWFpbmluZzoga2luZCA9PT0gJ3N0eWxfcm9ja19zbWFsbCcgPyA0IDoga2luZCA9PT0gJ3N0eWxfcm9ja19tZWRpdW0nID8gOCA6IDEyLFxuICAgICAgICAgIHlpZWxkUGVySGFydmVzdDogMywgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiBmYWxzZSxcbiAgICAgICAgICByb3Q6IE1hdGguZmxvb3Iocm5kKCkgKiAyNCkgKiAoTWF0aC5QSSAvIDEyKSxcbiAgICAgICAgICBzY2FsZTogMC45ICsgcm5kKCkgKiAwLjIsIHZhcmlhbnQ6IE1hdGguZmxvb3Iocm5kKCkgKiAzKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gT25seSBlbnRpdGllcyB0aGF0IGV4aXN0ZWQgaW4gYW4gYWNjZXB0ZWQgb2xkIHNhdmUgZ2V0IHRvbWJzdG9uZXMsXG4gICAgICAgIC8vIGR1cmluZyBleHBsaWNpdCBtaWdyYXRpb24uIE9yZGluYXJ5IGdlbmVyYXRpb24gbXVzdCByZXN0b3JlIGV4YWN0bHkuXG4gICAgICAgIGlmIChpc1N0b25lUmVwbGF5KHdvcmxkKSkgYWRkRW50aXR5KHdvcmxkLCByZWNvcmQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSAmJiByb2NreSA+IDAuNTggJiYgcm9sbCA8IDAuMTgpIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9vcmUnLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMiksXG4gICAgICAgICAgcmVzb3VyY2U6ICdvcmUnLCByZW1haW5pbmc6IDgsIHlpZWxkUGVySGFydmVzdDogMixcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMSAmJiByb2xsIDwgMC4zMCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX3NocnViJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjggKyBybmQoKSAqIDAuNCwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICAgIHJlc291cmNlOiAnZmliZXInLCByZW1haW5pbmc6IDQsIHlpZWxkUGVySGFydmVzdDogMSxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkQXV0aG9yZWRFbnRpdHkod29ybGQ6IFdvcmxkLCBraW5kOiBFbnRpdHlLaW5kLCB4OiBudW1iZXIsIHo6IG51bWJlciwgdmFyaWFudDogbnVtYmVyLCByb3Q6IG51bWJlciwgc2NhbGU6IG51bWJlciwgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGwsIHJlbWFpbmluZzogbnVtYmVyLCB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHkgPD0gU0VBX0xFVkVMKSByZXR1cm47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAvLyBBIGhlcm8gYXNzZXQgb3ducyBpdHMgc3BvdDogY2xlYXIgYW55IGdlbmVyYXRlZCBlbnRpdHkgdGhhdCB3b3VsZCBvdmVybGFwXG4gIC8vIGl0LCByYXRoZXIgdGhhbiBzaWxlbnRseSBkcm9wcGluZyB0aGUgYXV0aG9yZWQgY29tcG9zaXRpb24uXG4gIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXTtcbiAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChraW5kKSAmJiAhaXNTdG9uZVJlcGxheSh3b3JsZCkpIHJldHVybjtcbiAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoZSAmJiBNYXRoLmh5cG90KGUueCAtIHgsIGUueiAtIHopIDwgMi42KSB7XG4gICAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICAgICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICAgICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gICAgfVxuICB9XG4gIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSkpO1xuICAvLyBBdXRob3JlZCBjb21wb3NpdGlvbiBpcyBkdXJhYmxlIHN0YXRlOiBpdCBjYW4gY2xlYXIgb3ZlcmxhcHBpbmcgbmF0dXJhbFxuICAvLyBlbnRpdGllcywgc28gc2F2ZSB0aGUgY29tcGxldGUgYWZmZWN0ZWQgY2h1bmsgcmF0aGVyIHRoYW4gb25seSBpdHMgaGVyb2VzLlxuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmFkZChrZXkpO1xuXG4gIGNvbnN0IGlkID0gYGhlcm86JHtraW5kfToke01hdGgucm91bmQoeCl9OiR7TWF0aC5yb3VuZCh6KX1gO1xuICBjb25zdCBiZWZvcmUgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICBjb25zdCBlbnRpdHk6IEVudGl0eSA9IHtcbiAgICBpZCwga2luZCwgY2h1bms6IGtleSwgeDogeCArIDAuNSwgeSwgejogeiArIDAuNSxcbiAgICByb3QsIHNjYWxlLCB2YXJpYW50LCByZXNvdXJjZSwgcmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiB0cnVlLFxuICB9O1xuICBhZGRFbnRpdHkod29ybGQsIGVudGl0eSk7XG4gIGlmICh3b3JsZC5lbnRpdGllcy5zaXplID4gYmVmb3JlICYmIGtpbmQuc3RhcnRzV2l0aCgnc3R5bF90cmVlJykpIHtcbiAgICB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgIGlmIChraW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMrKztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkOiBXb3JsZCk6IHZvaWQge1xuICBpZiAod29ybGQuYXV0aG9yZWRQbGFjZWQpIHJldHVybjtcbiAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSB0cnVlO1xuXG4gIGNvbnN0IHNpdGVzOiBBcnJheTx7IGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJzsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHJvdDogbnVtYmVyIH0+ID0gW1xuICAgIHsga2luZDogJ3dheXN0b25lJywgeDogLTEwLCB6OiAtMTQsIHJvdDogMCB9LFxuICAgIHsga2luZDogJ21hcmtlcicsIHg6IC0zMiwgejogLTgsIHJvdDogTWF0aC5QSSAvIDIgfSxcbiAgXTtcbiAgZm9yIChjb25zdCBzIG9mIHNpdGVzKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgcy54LCBzLnopO1xuICAgIGlmICh5IDw9IFNFQV9MRVZFTCkgY29udGludWU7XG4gICAgd29ybGQuc2l0ZXMucHVzaCh7XG4gICAgICBpZDogYHNpdGU6JHtzLmtpbmR9YCxcbiAgICAgIGtpbmQ6IHMua2luZCxcbiAgICAgIHg6IHMueCArIDAuNSwgeSwgejogcy56ICsgMC41LFxuICAgICAgcm90OiBzLnJvdCxcbiAgICAgIHByb3Zpc2lvbmFsOiB0cnVlLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gQSBoZXJvIGdyb3ZlIGNvbXBvc2VkIGluIHRoZSBkZWZhdWx0IGNhbWVyYSdzIHZpZXcgZGlyZWN0aW9uLiBUaGVzZSBhcmVcbiAgLy8gU3R5bCBuYXR1cmFsIGFzc2V0cyAoQVMtMDAxIHYyKSwgbm90IE5veGVsIGFyY2hpdGVjdHVyZTsgdGhlIE5veGVsXG4gIC8vIHdheXN0b25lL21hcmtlciBhYm92ZSByZW1haW4gdGhlIGh1bWFuLW1hZGUgbGFuZG1hcmtzLlxuICBjb25zdCBncm92ZTogQXJyYXk8W0VudGl0eUtpbmQsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXT4gPSBbXG4gICAgWydzdHlsX3RyZWVfc3BpcmUnLCAtMjIsIC0yNiwgMCwgMS4wMCwgMF0sXG4gICAgWydzdHlsX3RyZWVfdGFibGUnLCAtMzQsIC0xOCwgMSwgMC45NSwgTWF0aC5QSSAvIDEyXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTE2LCAtMzQsIDIsIDEuMDAsIE1hdGguUEkgLyA2XSxcbiAgICBbJ3N0eWxfdHJlZV9ibG9zc29tJywgLTI4LCAtMzgsIDAsIDAuOTAsIE1hdGguUEkgLyA0XSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC00MCwgLTMwLCAyLCAxLjA1LCBNYXRoLlBJIC8gM10sXG4gICAgWydzdHlsX3RyZWVfY2x1c3RlcicsIC0xMiwgLTI0LCAwLCAwLjkwLCBNYXRoLlBJIC8gMi40XSxcbiAgXTtcbiAgZm9yIChjb25zdCBba2luZCwgeCwgeiwgdmFyaWFudCwgc2NhbGUsIHJvdF0gb2YgZ3JvdmUpIHtcbiAgICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwga2luZCwgeCwgeiwgdmFyaWFudCwgcm90LCBzY2FsZSwgJ3dvb2QnLCAxMiwgNCk7XG4gIH1cbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3JvY2tfbWVkaXVtJywgLTYsIC0xMCwgMCwgMCwgMS4wLCAnc3RvbmUnLCA4LCAzKTtcbiAgYWRkQXV0aG9yZWRFbnRpdHkod29ybGQsICdzdHlsX3NocnViJywgLTE0LCAtOCwgMSwgTWF0aC5QSSAvIDEyLCAxLjEsICdmaWJlcicsIDQsIDEpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfY2Fpcm4nLCAtMjAsIC02LCAwLCAwLCAxLjAsICdzdG9uZScsIDYsIDIpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfb3JlJywgLTM4LCAtNDIsIDAsIE1hdGguUEkgLyA0LCAxLjEsICdvcmUnLCA4LCAyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5lYXJlc3RIYXJ2ZXN0YWJsZShcbiAgd29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgcmFkaXVzOiBudW1iZXIsIHJlc291cmNlPzogUmVzb3VyY2VUeXBlLFxuKTogRW50aXR5IHwgbnVsbCB7XG4gIGxldCBiZXN0OiBFbnRpdHkgfCBudWxsID0gbnVsbDtcbiAgbGV0IGJlc3REID0gcmFkaXVzICogcmFkaXVzO1xuICBmb3IgKGNvbnN0IGUgb2Ygd29ybGQuZW50aXRpZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgfHwgd29ybGQuZW50aXR5UmVtb3ZhbHMuaGFzKGUuaWQpXG4gICAgICB8fCBlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSBjb250aW51ZTtcbiAgICBpZiAocmVzb3VyY2UgJiYgZS5yZXNvdXJjZSAhPT0gcmVzb3VyY2UpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGQgPSAoZS54IC0geCkgKiogMiArIChlLnogLSB6KSAqKiAyO1xuICAgIGlmIChkIDwgYmVzdEQpIHsgYmVzdEQgPSBkOyBiZXN0ID0gZTsgfVxuICB9XG4gIHJldHVybiBiZXN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RSZXN1bHQgeyBlbnRpdHk6IEVudGl0eTsgcmVzb3VyY2U6IFJlc291cmNlVHlwZTsgYW1vdW50OiBudW1iZXI7IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogSGFydmVzdFJlc3VsdCB8IG51bGwge1xuICBjb25zdCBlID0gbGl2ZUVudGl0eSh3b3JsZCwgaWQpO1xuICBpZiAoIWUgfHwgZS5oYXJ2ZXN0ZWQgfHwgIWUucmVzb3VyY2UgfHwgZS5yZW1haW5pbmcgPD0gMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGFtb3VudCA9IE1hdGgubWluKGUueWllbGRQZXJIYXJ2ZXN0LCBlLnJlbWFpbmluZyk7XG4gIGlmICh3b3JsZC5saWZlICYmIE9iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgbikgPT4gc3VtICsgbiwgMCkgKyBhbW91bnQgPiAxMjApIHJldHVybiBudWxsO1xuICBlLnJlbWFpbmluZyAtPSBhbW91bnQ7XG4gIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoZS5jaHVuayk7XG4gIGUuaGFydmVzdGVkT25jZSA9IHRydWU7XG4gIGlmIChlLnJlbWFpbmluZyA8PSAwKSBlLmhhcnZlc3RlZCA9IHRydWU7XG4gIHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA9ICh3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IGVudGl0eTogZSwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCB9O1xufVxuXG4vKiogUmVtb3ZlIGV2ZXJ5IHJldGlyZWQgc291cmNlIGFmdGVyIHZlcmlmaWVkIGhpc3RvcmljYWwgcmVwbGF5LiBUaGlzIG1pZ3JhdGlvblxuICogY3JlYXRlcyBkZXRlcm1pbmlzdGljIHRvbWJzdG9uZXMgYnV0IGlzIG5vdCBhIHBsYXllciBjb21tYW5kIG9yIHJldmlzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJldGlyZVN0b25lRW50aXRpZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZSBvZiBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldKSB7XG4gICAgaWYgKCFpc1JldGlyZWRTdG9uZUtpbmQoZS5raW5kKSkgY29udGludWU7XG4gICAgd29ybGQuZW50aXRpZXMuZGVsZXRlKGUuaWQpO1xuICAgIGlmICghZS5hdXRob3JlZCkgd29ybGQuZW50aXR5UmVtb3ZhbHMuYWRkKGUuaWQpO1xuICAgIHdvcmxkLmVudGl0eUNoYW5nZXMuYWRkKGUuY2h1bmspO1xuICAgIGlmICghd29ybGQuZW50aXR5Q2h1bmtzLmhhcyhlLmNodW5rKSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBbXSk7XG4gIH1cbiAgZm9yIChjb25zdCBba2V5LCBpZHNdIG9mIHdvcmxkLmVudGl0eUNodW5rcykge1xuICAgIGNvbnN0IGFjdGl2ZSA9IGlkcy5maWx0ZXIoKGlkKSA9PiB3b3JsZC5lbnRpdGllcy5oYXMoaWQpKTtcbiAgICBpZiAoYWN0aXZlLmxlbmd0aCA+IDAgfHwgd29ybGQuZW50aXR5Q2hhbmdlcy5oYXMoa2V5KSkgd29ybGQuZW50aXR5Q2h1bmtzLnNldChrZXksIGFjdGl2ZSk7XG4gICAgZWxzZSB3b3JsZC5lbnRpdHlDaHVua3MuZGVsZXRlKGtleSk7XG4gIH1cbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBlcnNpc3RlbmNlIC8gYXV0aG9yaXR5IGJvdW5kYXJ5IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNYW5pZmVzdCB7XG4gIHNjaGVtYTogMTtcbiAgc2VlZDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBwYXJhbXNIYXNoOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGZudjFhKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoID0gMHg4MTFjOWRjNTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgaCBePSB0ZXh0LmNoYXJDb2RlQXQoaSk7XG4gICAgaCA9IE1hdGguaW11bChoLCAweDAxMDAwMTkzKTtcbiAgfVxuICByZXR1cm4gKGggPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ybGRNYW5pZmVzdCh3b3JsZDogV29ybGQpOiBXb3JsZE1hbmlmZXN0IHtcbiAgY29uc3QgcCA9IHdvcmxkLnBhcmFtcztcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAgc2VlZDogd29ybGQuc2VlZCxcbiAgICBnZW5lcmF0b3JWZXJzaW9uOiBwLmdlbmVyYXRvclZlcnNpb24sXG4gICAgc2l6ZTogcC5zaXplLFxuICAgIGNodW5rU2l6ZTogcC5jaHVua1NpemUsXG4gICAgeU1pbjogcC55TWluLFxuICAgIHlNYXg6IHAueU1heCxcbiAgICBzZWFMZXZlbDogcC5zZWFMZXZlbCxcbiAgICBwYXJhbXNIYXNoOiBmbnYxYShKU09OLnN0cmluZ2lmeShwKSksXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxFZGl0IHsgaTogbnVtYmVyOyBtOiBudW1iZXI7IH1cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIHNjaGVtYTogMTtcbiAga2V5OiBzdHJpbmc7XG4gIGJhc2VWZXJzaW9uOiBudW1iZXI7XG4gIGVkaXRzOiBWb3hlbEVkaXRbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cG9ydENodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IENodW5rRGVsdGEge1xuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBrZXksXG4gICAgYmFzZVZlcnNpb246IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIGVkaXRzOiBlZGl0cyA/IFsuLi5lZGl0cy5lbnRyaWVzKCldLm1hcCgoW2ksIG1dKSA9PiAoeyBpLCBtIH0pKS5zb3J0KChhLCBiKSA9PiBhLmkgLSBiLmkpIDogW10sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBkZWx0YTogQ2h1bmtEZWx0YSk6IHZvaWQge1xuICBjb25zdCBbY3gsIGN6XSA9IGRlbHRhLmtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICBmb3IgKGNvbnN0IGUgb2YgZGVsdGEuZWRpdHMpIHtcbiAgICBjb25zdCB5SW5kZXggPSBNYXRoLmZsb29yKGUuaSAvIENIVU5LX0FSRUEpO1xuICAgIGNvbnN0IHJlbSA9IGUuaSAlIENIVU5LX0FSRUE7XG4gICAgY29uc3QgbHogPSBNYXRoLmZsb29yKHJlbSAvIENIVU5LX1NJWkUpO1xuICAgIGNvbnN0IGx4ID0gcmVtICUgQ0hVTktfU0laRTtcbiAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4O1xuICAgIGNvbnN0IHkgPSBZX01JTiArIHlJbmRleDtcbiAgICBjb25zdCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgIHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBlLm0gYXMgTWF0SWQpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gdGltZSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFRpbWVTdGF0ZSB7IHQ6IG51bWJlcjsgZGF5TGVuZ3RoU2VjOiBudW1iZXI7IHBhdXNlZDogYm9vbGVhbjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpbWUoczogVGltZVN0YXRlLCBkdDogbnVtYmVyKTogdm9pZCB7XG4gIGlmIChzLnBhdXNlZCkgcmV0dXJuO1xuICBzLnQgPSAocy50ICsgZHQgLyBzLmRheUxlbmd0aFNlYykgJSAxO1xufVxuIiwgIi8vIFRlcnJhaW4gcXVlcnkgbGF5ZXIgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbiwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDIgU3lzdGVtIDE6IG9uZSBzaGFyZWQsIGNhY2hlZCBjb250cmFjdCBmb3IgY29uc3RydWN0aW9uLCBmYXJtaW5nLFxuLy8gbW92ZW1lbnQsIG5hdmlnYXRpb24gYW5kIHRoZSBBSSBhZ2VudC4gVGhlc2UgcXVlcmllcyBkZXNjcmliZSB0aGVcbi8vIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lOyB0aGV5IG5ldmVyIG11dGF0ZSBpdCBhbmQgbmV2ZXIgY3JlYXRlIGEgc2Vjb25kXG4vLyB0ZXJyYWluIHJlcHJlc2VudGF0aW9uLlxuLy9cbi8vIENvbnZlbnRpb25zOlxuLy8gICAqIHgveiBhcmUgaW50ZWdlciBjb2x1bW4gY29vcmRpbmF0ZXMgaW4gWy0xMDI0LCAxMDI0KS5cbi8vICAgKiB5IGlzIGFuIGludGVnZXIgdm94ZWwgY29vcmRpbmF0ZSBpbiBbLTE2LCAxMTIpLlxuLy8gICAqIHN1cmZhY2VZIGlzIHRoZSBleHBvc2VkIHRvcCBmYWNlICh0b3BTb2xpZCArIDEpLCBtYXRjaGluZyBNMDAxLlxuLy8gICAqIEEgcmVjdCBpcyBpbmNsdXNpdmUgb24gYWxsIGZvdXIgZWRnZXMuXG5pbXBvcnQge1xuICBXb3JsZCwgTWF0SWQsIE1BVCwgU0VBX0xFVkVMLCBZX01JTiwgWV9NQVgsIEhBTEYsXG4gIHN1cmZhY2VBdCwgdG9wTWF0ZXJpYWxBdFdvcmxkLCBnZXRWb3hlbCwgaXNTb2xpZCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIEFjdGl2ZUVudGl0eUtpbmQsIEVudGl0eUtpbmQsIGlzUmV0aXJlZFN0b25lS2luZCxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBpc1N0b25lUmVwbGF5IH0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlY3Qge1xuICB4MDogbnVtYmVyO1xuICB6MDogbnVtYmVyO1xuICB4MTogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsUmVnaW9uIGV4dGVuZHMgUmVjdCB7XG4gIHkwOiBudW1iZXI7XG4gIHkxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVSZWN0KHJlY3Q6IFJlY3QpOiBSZWN0IHtcbiAgcmV0dXJuIHtcbiAgICB4MDogTWF0aC5taW4ocmVjdC54MCwgcmVjdC54MSksXG4gICAgejA6IE1hdGgubWluKHJlY3QuejAsIHJlY3QuejEpLFxuICAgIHgxOiBNYXRoLm1heChyZWN0LngwLCByZWN0LngxKSxcbiAgICB6MTogTWF0aC5tYXgocmVjdC56MCwgcmVjdC56MSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0Q29sdW1ucyhyZWN0OiBSZWN0KTogbnVtYmVyIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIHJldHVybiAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdENvbnRhaW5zKHJlY3Q6IFJlY3QsIHg6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB4ID49IHJlY3QueDAgJiYgeCA8PSByZWN0LngxICYmIHogPj0gcmVjdC56MCAmJiB6IDw9IHJlY3QuejE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBhbmRSZWN0KHJlY3Q6IFJlY3QsIGFtb3VudDogbnVtYmVyKTogUmVjdCB7XG4gIHJldHVybiB7XG4gICAgeDA6IHJlY3QueDAgLSBhbW91bnQsXG4gICAgejA6IHJlY3QuejAgLSBhbW91bnQsXG4gICAgeDE6IHJlY3QueDEgKyBhbW91bnQsXG4gICAgejE6IHJlY3QuejEgKyBhbW91bnQsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0VG9SZWdpb24ocmVjdDogUmVjdCwgeTAgPSBZX01JTiwgeTEgPSBZX01BWCAtIDEpOiBWb3hlbFJlZ2lvbiB7XG4gIHJldHVybiB7IC4uLm5vcm1hbGl6ZVJlY3QocmVjdCksIHkwLCB5MSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaW9uc092ZXJsYXAoYTogVm94ZWxSZWdpb24sIGI6IFZveGVsUmVnaW9uKTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejBcbiAgICAmJiBhLnkwIDw9IGIueTEgJiYgYS55MSA+PSBiLnkwO1xufVxuXG4vKiogSW5jbHVzaXZlIGNvbnRhaW5tZW50IG9mIGEgdm94ZWwgaW4gYSB3b3JrIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVudmVsb3BlQ29udGFpbnMocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10sIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCByIG9mIHJlY3RzKSB7XG4gICAgaWYgKHggPj0gci54MCAmJiB4IDw9IHIueDEgJiYgeSA+PSByLnkwICYmIHkgPD0gci55MSAmJiB6ID49IHIuejAgJiYgeiA8PSByLnoxKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFpbkNvbHVtbiB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogRXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uOyB0aGUgZmlyc3QgYWlyIGNlbGwgYWJvdmUgaXQuICovXG4gIHN1cmZhY2VZOiBudW1iZXI7XG4gIC8qKiBUaGUgaGlnaGVzdCBzb2xpZCB2b3hlbCwgb3IgWV9NSU4gLSAxIGlmIHRoZSBjb2x1bW4gaGFzIG5vIHNvbGlkLiAqL1xuICB0b3BTb2xpZFk6IG51bWJlcjtcbiAgdG9wTWF0ZXJpYWw6IE1hdElkO1xuICBzb2xpZDogYm9vbGVhbjtcbiAgLyoqIFdhdGVyIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlLCB1cCB0byBzZWEgbGV2ZWwuIDAgb24gZHJ5IGxhbmQuICovXG4gIHdhdGVyRGVwdGg6IG51bWJlcjtcbiAgdW5kZXJ3YXRlcjogYm9vbGVhbjtcbiAgLyoqIExhcmdlc3QgNC1uZWlnaGJvdXIgc3VyZmFjZSBzdGVwIGluIG1ldHJlcyAoMSA9IGEgc2luZ2xlIHZveGVsIHJpc2VyKS4gKi9cbiAgc2xvcGU6IG51bWJlcjtcbiAgLyoqIEZyZWUgYWlyIGNlbGxzIGFib3ZlIHRoZSBzdXJmYWNlLCBjYXBwZWQgYXQgQ0xFQVJBTkNFX1BST0JFLiAqL1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IENMRUFSQU5DRV9QUk9CRSA9IDg7XG5cbmZ1bmN0aW9uIHN1cmZhY2VBdFNhZmUod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgZmFsbGJhY2s6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxsYmFjaztcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKiBXYXRlciBkZXB0aCB0aGF0IHJlc3BlY3RzIGEgZHJ5IHBpdCBiZWxvdyBzZWEgbGV2ZWwgKHVubGlrZSBoZWlnaHQgYWxvbmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmIChzdXJmYWNlID49IFNFQV9MRVZFTCkgcmV0dXJuIDA7XG4gIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgU0VBX0xFVkVMIC0gMSwgeikgIT09IE1BVC5XQVRFUikgcmV0dXJuIDA7XG4gIHJldHVybiBTRUFfTEVWRUwgLSBzdXJmYWNlO1xufVxuXG4vKiogVHJ1ZSB3aGVuIGBoZWlnaHRgIGFpciBjZWxscyBhYm92ZSB0aGUgc3VyZmFjZSBhcmUgZnJlZSBvZiBzb2xpZCBvciB3YXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGVhcmFuY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBoZWlnaHQ7IGkrKykge1xuICAgIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgc3VyZmFjZSArIGksIHopICE9PSBNQVQuQUlSKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2x1bW5BdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCBzdXJmYWNlWSA9IHN1cmZhY2VBdCh3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3QgdG9wTWF0ZXJpYWwgPSB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHNvbGlkID0gc3VyZmFjZVkgPiBZX01JTiAmJiBpc1NvbGlkKHRvcE1hdGVyaWFsKTtcbiAgY29uc3Qgd2F0ZXJEZXB0aCA9IHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4IC0gMSwgY3osIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCArIDEsIGN6LCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3gsIGN6IC0gMSwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4LCBjeiArIDEsIHN1cmZhY2VZKSksXG4gICk7XG4gIGxldCBjbGVhcmFuY2UgPSAwO1xuICB3aGlsZSAoY2xlYXJhbmNlIDwgQ0xFQVJBTkNFX1BST0JFICYmIGdldFZveGVsKHdvcmxkLCBjeCwgc3VyZmFjZVkgKyBjbGVhcmFuY2UsIGN6KSA9PT0gTUFULkFJUikge1xuICAgIGNsZWFyYW5jZSsrO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDogY3gsIHo6IGN6LCBzdXJmYWNlWSwgdG9wU29saWRZOiBzdXJmYWNlWSAtIDEsIHRvcE1hdGVyaWFsLFxuICAgIHNvbGlkLCB3YXRlckRlcHRoLCB1bmRlcndhdGVyOiB3YXRlckRlcHRoID4gMCwgc2xvcGUsIGNsZWFyYW5jZSxcbiAgfTtcbn1cblxuLy8gRW50aXR5IGZvb3RwcmludHMgYXJlIGRlbGliZXJhdGVseSBleHBsaWNpdC4gQSB0cmVlIG9jY3VwaWVzIG1vcmUgc2l0ZSB0aGFuXG4vLyBpdHMgdHJ1bms7IGEgcGViYmxlIG9jY3VwaWVzIGxlc3MgdGhhbiBhIGJvdWxkZXIuIFRoZXNlIGFyZSBzaW11bGF0aW9uXG4vLyBjbGVhcmFuY2UgcmFkaWksIG5vdCByZW5kZXIgYm91bmRzLlxuZXhwb3J0IGNvbnN0IE9CU1RSVUNUSU9OX1JBRElVUzogUmVjb3JkPEFjdGl2ZUVudGl0eUtpbmQsIG51bWJlcj4gPSB7XG4gIHN0eWxfdHJlZV9zcGlyZTogMS41LFxuICBzdHlsX3RyZWVfdGFibGU6IDEuOCxcbiAgc3R5bF90cmVlX2NsdXN0ZXI6IDEuOSxcbiAgc3R5bF90cmVlX2Jsb3Nzb206IDEuNixcbiAgc3R5bF9zaHJ1YjogMC42LFxuICBzdHlsX29yZTogMC45LFxuICBzdHlsX2NhaXJuOiAwLjgsXG4gIHdheXN0b25lOiAxLjQsXG4gIG1hcmtlcjogMC41LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBPYnN0cnVjdGlvbiB7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIGtpbmQ6IEVudGl0eUtpbmQ7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByYWRpdXM6IG51bWJlcjtcbiAgLyoqIEZvb3RwcmludCBjZWxscyBvdmVybGFwcGVkIGJ5IHRoaXMgZW50aXR5LiAqL1xuICBjZWxsczogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBlbnRpdHlDaHVua3NGb3JSZWN0KHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCk6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIC8vIEEgcmVjdCBvd25zIHdob2xlIHZveGVsIGNlbGxzLiBJbmNsdWRlIGV2ZXJ5IGNodW5rIHdob3NlIHJvb3QgY291bGQgb3ZlcmxhcFxuICAvLyB0aG9zZSBjZWxscywgd2l0aG91dCBzY2FubmluZyB0aGUgZW50aXJlIDIwNDggbSB3b3JsZC5cbiAgY29uc3QgcmFkaXVzID0gTWF0aC5tYXgoLi4uT2JqZWN0LnZhbHVlcyhPQlNUUlVDVElPTl9SQURJVVMpLCAxLjUpO1xuICBjb25zdCBtaW5DZWxsWCA9IE1hdGguZmxvb3Ioci54MCArIDAuNSAtIHJhZGl1cyk7XG4gIGNvbnN0IG1heENlbGxYID0gTWF0aC5jZWlsKHIueDEgKyAwLjUgKyByYWRpdXMpIC0gMTtcbiAgY29uc3QgbWluQ2VsbFogPSBNYXRoLmZsb29yKHIuejAgKyAwLjUgLSByYWRpdXMpO1xuICBjb25zdCBtYXhDZWxsWiA9IE1hdGguY2VpbChyLnoxICsgMC41ICsgcmFkaXVzKSAtIDE7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1gobWluQ2VsbFgpKSwgY3gxID0gd29ybGRUb0NodW5rWChtYXhDZWxsWCk7XG4gIGNvbnN0IGN6MCA9IE1hdGgubWF4KDAsIHdvcmxkVG9DaHVua1oobWluQ2VsbFopKSwgY3oxID0gd29ybGRUb0NodW5rWihtYXhDZWxsWik7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSBrZXlzLnB1c2goY2h1bmtLZXkoY3gsIGN6KSk7XG4gIH1cbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKiBFbnRpdGllcyB3aG9zZSBzaW11bGF0aW9uIGZvb3RwcmludCBvdmVybGFwcyB0aGUgcmVjdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvYnN0cnVjdGlvbnNJbih3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgb3V0OiBPYnN0cnVjdGlvbltdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIGVudGl0eUNodW5rc0ZvclJlY3Qod29ybGQsIHIpKSB7XG4gICAgY29uc3QgaWRzID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghaWRzKSBjb250aW51ZTtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuICAgICAgaWYgKHNlZW4uaGFzKGlkKSkgY29udGludWU7XG4gICAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICAgIGlmICghZSB8fCAoaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZCkgJiYgIWlzU3RvbmVSZXBsYXkod29ybGQpKSB8fCB3b3JsZC5lbnRpdHlSZW1vdmFscy5oYXMoZS5pZCkpIGNvbnRpbnVlO1xuICAgICAgc2Vlbi5hZGQoaWQpO1xuICAgICAgY29uc3QgcmFkaXVzID0gaXNSZXRpcmVkU3RvbmVLaW5kKGUua2luZClcbiAgICAgICAgPyBlLmtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gMC42IDogZS5raW5kID09PSAnc3R5bF9yb2NrX21lZGl1bScgPyAxLjEgOiAxLjVcbiAgICAgICAgOiBPQlNUUlVDVElPTl9SQURJVVNbZS5raW5kIGFzIEFjdGl2ZUVudGl0eUtpbmRdO1xuICAgICAgbGV0IGNlbGxzID0gMDtcbiAgICAgIGNvbnN0IGV4MCA9IE1hdGgubWF4KHIueDAsIE1hdGguZmxvb3IoZS54IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBleDEgPSBNYXRoLm1pbihyLngxLCBNYXRoLmNlaWwoZS54ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejAgPSBNYXRoLm1heChyLnowLCBNYXRoLmZsb29yKGUueiAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXoxID0gTWF0aC5taW4oci56MSwgTWF0aC5jZWlsKGUueiArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgZm9yIChsZXQgeiA9IGV6MDsgeiA8PSBlejE7IHorKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gZXgwOyB4IDw9IGV4MTsgeCsrKSB7XG4gICAgICAgICAgaWYgKE1hdGguaHlwb3QoZS54IC0gKHggKyAwLjUpLCBlLnogLSAoeiArIDAuNSkpIDw9IHJhZGl1cykgY2VsbHMrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGNlbGxzID4gMCkge1xuICAgICAgICBvdXQucHVzaCh7IGVudGl0eUlkOiBlLmlkLCBraW5kOiBlLmtpbmQsIHg6IGUueCwgejogZS56LCByYWRpdXMsIGNlbGxzIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBvdXQuc29ydCgoYSwgYikgPT4gKGEuZW50aXR5SWQgPCBiLmVudGl0eUlkID8gLTEgOiBhLmVudGl0eUlkID4gYi5lbnRpdHlJZCA/IDEgOiAwKSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXJlYVN0YXRzIHtcbiAgcmVjdDogUmVjdDtcbiAgY29sdW1uczogbnVtYmVyO1xuICBtaW5ZOiBudW1iZXI7XG4gIG1heFk6IG51bWJlcjtcbiAgbWVhblk6IG51bWJlcjtcbiAgcmVsaWVmOiBudW1iZXI7XG4gIG1heFN0ZXA6IG51bWJlcjtcbiAgd2F0ZXJDb2x1bW5zOiBudW1iZXI7XG4gIHN0b25lQ29sdW1uczogbnVtYmVyO1xuICBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj47XG4gIG9ic3RydWN0aW9uczogT2JzdHJ1Y3Rpb25bXTtcbiAgb2JzdHJ1Y3RlZENvbHVtbnM6IG51bWJlcjtcbiAgLyoqIEN1dC9maWxsIHJlbGF0aXZlIHRvIGZsb29yWSB3aGVuIHN1cHBsaWVkLCBvdGhlcndpc2UgMC4gKi9cbiAgZmxvb3JZOiBudW1iZXIgfCBudWxsO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1cHBvcnRTdW1tYXJ5IHtcbiAgdG90YWw6IG51bWJlcjtcbiAgbGV2ZWw6IG51bWJlcjtcbiAgY3V0OiBudW1iZXI7XG4gIGZpbGw6IG51bWJlcjtcbiAgd2F0ZXI6IG51bWJlcjtcbiAgLyoqIEZpbGwgZGVlcGVyIHRoYW4gOCBtOyBhIHZhbGlkYXRvciBtYXkgcmVqZWN0IHRoZXNlIGFzIHVuc3VwcG9ydGVkLiAqL1xuICBkZWVwRmlsbDogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZvb3RwcmludFF1ZXJ5IHtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHN0YXRzOiBBcmVhU3RhdHM7XG4gIHN1cHBvcnQ6IFN1cHBvcnRTdW1tYXJ5O1xuICBvYnN0cnVjdGlvbnM6IE9ic3RydWN0aW9uW107XG4gIC8qKiBDZWxscyBpbiB0aGUgYnVpbGRpbmcgdm9sdW1lIGFib3ZlIHRoZSBwcmVwYXJlZCBmbG9vciB0aGF0IGFyZSBub3QgYWlyLiAqL1xuICBvdmVyaGFuZ0NlbGxzOiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IG1hdGVyaWFsOiBNYXRJZCB9Pjtcbn1cblxuLyoqXG4gKiBDYWNoZWQgcXVlcnkgY29udGV4dC4gQ2FjaGVzIGFyZSBrZXllZCBvbiB3b3JsZC5yZXZpc2lvbjogYSB2b3hlbCBvciBlbnRpdHlcbiAqIGVkaXQgaW52YWxpZGF0ZXMgdGhlbSwgd2hpbGUgbWVzaC9uYXYgcmVidWlsZHMgZG8gbm90LiBVc2Ugb25lIGNvbnRleHQgZm9yIGFcbiAqIHNpdGUgc2VhcmNoIG9yIGEgZm9vdHByaW50IGV2YWx1YXRpb24sIHRoZW4gZGlzY2FyZCBpdC5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlcnJhaW5RdWVyeSB7XG4gIHByaXZhdGUgY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgVGVycmFpbkNvbHVtbj4oKTtcbiAgcHJpdmF0ZSBvYnN0cnVjdGlvbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIE9ic3RydWN0aW9uW10+KCk7XG4gIHByaXZhdGUgcmV2aXNpb246IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgd29ybGQ6IFdvcmxkKSB7XG4gICAgdGhpcy5yZXZpc2lvbiA9IHdvcmxkLnJldmlzaW9uO1xuICB9XG5cbiAgcHJpdmF0ZSBzeW5jKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnJldmlzaW9uICE9PSB0aGlzLndvcmxkLnJldmlzaW9uKSB7XG4gICAgICB0aGlzLmNhY2hlLmNsZWFyKCk7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuY2xlYXIoKTtcbiAgICAgIHRoaXMucmV2aXNpb24gPSB0aGlzLndvcmxkLnJldmlzaW9uO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBDYWNoZWQgZW50aXR5IG9ic3RydWN0aW9ucyBmb3Igb25lIGZvb3RwcmludC4gKi9cbiAgb2JzdHJ1Y3Rpb25zRm9yKHJlY3Q6IFJlY3QpOiBPYnN0cnVjdGlvbltdIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBrZXkgPSBgJHtyLngwfSwke3IuejB9LCR7ci54MX0sJHtyLnoxfWA7XG4gICAgbGV0IGxpc3QgPSB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuZ2V0KGtleSk7XG4gICAgaWYgKCFsaXN0KSB7XG4gICAgICBsaXN0ID0gb2JzdHJ1Y3Rpb25zSW4odGhpcy53b3JsZCwgcik7XG4gICAgICB0aGlzLm9ic3RydWN0aW9uQ2FjaGUuc2V0KGtleSwgbGlzdCk7XG4gICAgfVxuICAgIHJldHVybiBsaXN0O1xuICB9XG5cbiAgY29sdW1uKHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgY3ggPSBNYXRoLmZsb29yKHgpLCBjeiA9IE1hdGguZmxvb3Ioeik7XG4gICAgY29uc3Qga2V5ID0gYCR7Y3h9LCR7Y3p9YDtcbiAgICBsZXQgY29sID0gdGhpcy5jYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAoIWNvbCkge1xuICAgICAgY29sID0gY29sdW1uQXQodGhpcy53b3JsZCwgY3gsIGN6KTtcbiAgICAgIHRoaXMuY2FjaGUuc2V0KGtleSwgY29sKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbDtcbiAgfVxuXG4gIGFyZWEocmVjdDogUmVjdCwgZmxvb3JZPzogbnVtYmVyKTogQXJlYVN0YXRzIHtcbiAgICB0aGlzLnN5bmMoKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBsZXQgbWluWSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgICBsZXQgbWF4WSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgICBsZXQgc3VtID0gMDtcbiAgICBsZXQgbWF4U3RlcCA9IDA7XG4gICAgbGV0IHdhdGVyQ29sdW1ucyA9IDA7XG4gICAgbGV0IHN0b25lQ29sdW1ucyA9IDA7XG4gICAgbGV0IGN1dFZvbHVtZSA9IDA7XG4gICAgbGV0IGZpbGxWb2x1bWUgPSAwO1xuICAgIGxldCBtYXhDdXQgPSAwO1xuICAgIGxldCBtYXhGaWxsID0gMDtcbiAgICBjb25zdCBtYXRlcmlhbHM6IFJlY29yZDxudW1iZXIsIG51bWJlcj4gPSB7fTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgY29sLnN1cmZhY2VZKTtcbiAgICAgICAgbWF4WSA9IE1hdGgubWF4KG1heFksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIHN1bSArPSBjb2wuc3VyZmFjZVk7XG4gICAgICAgIG1heFN0ZXAgPSBNYXRoLm1heChtYXhTdGVwLCBjb2wuc2xvcGUpO1xuICAgICAgICBpZiAoY29sLndhdGVyRGVwdGggPiAwKSB3YXRlckNvbHVtbnMrKztcbiAgICAgICAgaWYgKGNvbC50b3BNYXRlcmlhbCA9PT0gTUFULlNUT05FKSBzdG9uZUNvbHVtbnMrKztcbiAgICAgICAgbWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPSAobWF0ZXJpYWxzW2NvbC50b3BNYXRlcmlhbF0gPz8gMCkgKyAxO1xuICAgICAgICBpZiAoZmxvb3JZICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgICBpZiAoZHkgPiAwKSB7XG4gICAgICAgICAgICBjdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgICBtYXhDdXQgPSBNYXRoLm1heChtYXhDdXQsIGR5KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgICAgZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgICBtYXhGaWxsID0gTWF0aC5tYXgobWF4RmlsbCwgLWR5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBvYnN0cnVjdGlvbnMgPSB0aGlzLm9ic3RydWN0aW9uc0ZvcihyKTtcbiAgICBjb25zdCBvYnN0cnVjdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChjb25zdCBvIG9mIG9ic3RydWN0aW9ucykge1xuICAgICAgY29uc3QgcmFkaXVzID0gby5yYWRpdXM7XG4gICAgICBjb25zdCBleDAgPSBNYXRoLm1heChyLngwLCBNYXRoLmZsb29yKG8ueCAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXgxID0gTWF0aC5taW4oci54MSwgTWF0aC5jZWlsKG8ueCArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXowID0gTWF0aC5tYXgoci56MCwgTWF0aC5mbG9vcihvLnogLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MSA9IE1hdGgubWluKHIuejEsIE1hdGguY2VpbChvLnogKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGZvciAobGV0IHogPSBlejA7IHogPD0gZXoxOyB6KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IGV4MDsgeCA8PSBleDE7IHgrKykge1xuICAgICAgICAgIGlmIChNYXRoLmh5cG90KG8ueCAtICh4ICsgMC41KSwgby56IC0gKHogKyAwLjUpKSA8PSByYWRpdXMpIG9ic3RydWN0ZWQuYWRkKGAke3h9LCR7en1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNvbHVtbnMgPSAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xuICAgIHJldHVybiB7XG4gICAgICByZWN0OiByLFxuICAgICAgY29sdW1ucyxcbiAgICAgIG1pblksIG1heFksXG4gICAgICBtZWFuWTogTWF0aC5yb3VuZCgoc3VtIC8gY29sdW1ucykgKiAxMDAwKSAvIDEwMDAsXG4gICAgICByZWxpZWY6IG1heFkgLSBtaW5ZLFxuICAgICAgbWF4U3RlcCxcbiAgICAgIHdhdGVyQ29sdW1ucyxcbiAgICAgIHN0b25lQ29sdW1ucyxcbiAgICAgIG1hdGVyaWFscyxcbiAgICAgIG9ic3RydWN0aW9ucyxcbiAgICAgIG9ic3RydWN0ZWRDb2x1bW5zOiBvYnN0cnVjdGVkLnNpemUsXG4gICAgICBmbG9vclk6IGZsb29yWSA/PyBudWxsLFxuICAgICAgY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dCxcbiAgICAgIG1heEZpbGwsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFdmFsdWF0ZSBhIGNvbXBsZXRlIGJ1aWxkaW5nIGZvb3RwcmludC4gYGZsb29yWWAgaXMgdGhlIHByZXBhcmVkIHdhbGtpbmdcbiAgICogZmxvb3I6IHRlcnJhaW4gYWJvdmUgaXQgaXMgY3V0LCB0ZXJyYWluIGJlbG93IGl0IGlzIGZpbGxlZC4gVGhlIHJlc3VsdCBpc1xuICAgKiByYXcgc2l0ZSBkYXRhOyBjb25zdHJ1Y3Rpb24gcnVsZXMgbGl2ZSBpbiBjb25zdHJ1Y3Rpb24udHMuXG4gICAqL1xuICBmb290cHJpbnQocmVjdDogUmVjdCwgZmxvb3JZOiBudW1iZXIpOiBGb290cHJpbnRRdWVyeSB7XG4gICAgY29uc3Qgc3RhdHMgPSB0aGlzLmFyZWEocmVjdCwgZmxvb3JZKTtcbiAgICBjb25zdCByID0gbm9ybWFsaXplUmVjdChyZWN0KTtcbiAgICBjb25zdCBzdXBwb3J0OiBTdXBwb3J0U3VtbWFyeSA9IHtcbiAgICAgIHRvdGFsOiBzdGF0cy5jb2x1bW5zLCBsZXZlbDogMCwgY3V0OiAwLCBmaWxsOiAwLCB3YXRlcjogMCwgZGVlcEZpbGw6IDAsXG4gICAgICBtYXhDdXQ6IDAsIG1heEZpbGw6IDAsIGN1dFZvbHVtZTogMCwgZmlsbFZvbHVtZTogMCxcbiAgICB9O1xuICAgIGNvbnN0IG92ZXJoYW5nQ2VsbHM6IEZvb3RwcmludFF1ZXJ5WydvdmVyaGFuZ0NlbGxzJ10gPSBbXTtcblxuICAgIGZvciAobGV0IHogPSByLnowOyB6IDw9IHIuejE7IHorKykge1xuICAgICAgZm9yIChsZXQgeCA9IHIueDA7IHggPD0gci54MTsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IHRoaXMuY29sdW1uKHgsIHopO1xuICAgICAgICBjb25zdCBkeSA9IGNvbC5zdXJmYWNlWSAtIGZsb29yWTtcbiAgICAgICAgaWYgKGR5ID4gMCkge1xuICAgICAgICAgIHN1cHBvcnQuY3V0Kys7XG4gICAgICAgICAgc3VwcG9ydC5jdXRWb2x1bWUgKz0gZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhDdXQgPSBNYXRoLm1heChzdXBwb3J0Lm1heEN1dCwgZHkpO1xuICAgICAgICB9IGVsc2UgaWYgKGR5IDwgMCkge1xuICAgICAgICAgIHN1cHBvcnQuZmlsbCsrO1xuICAgICAgICAgIHN1cHBvcnQuZmlsbFZvbHVtZSArPSAtZHk7XG4gICAgICAgICAgc3VwcG9ydC5tYXhGaWxsID0gTWF0aC5tYXgoc3VwcG9ydC5tYXhGaWxsLCAtZHkpO1xuICAgICAgICAgIGlmICgtZHkgPiA4KSBzdXBwb3J0LmRlZXBGaWxsKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VwcG9ydC5sZXZlbCsrO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb2wud2F0ZXJEZXB0aCA+IDApIHN1cHBvcnQud2F0ZXIrKztcblxuICAgICAgICAvLyBBbiBvdmVyaGFuZyBpcyB0ZXJyYWluIGFib3ZlIHRoZSBmbG9vciB0aGF0IHN1cnZpdmVzIHRoZSBjdXQgcGxhbmUuXG4gICAgICAgIC8vIEZvciBhIGNvbHVtbiBiZWxvdyB0aGUgZmxvb3IsIGl0cyBzb2xpZCBib2R5IGlzIGZpbGwsIG5vdCBvdmVyaGFuZy5cbiAgICAgICAgY29uc3Qgc3RhcnQgPSBNYXRoLm1heChmbG9vclksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIGZvciAobGV0IHkgPSBzdGFydDsgeSA8IHN0YXJ0ICsgNDsgeSsrKSB7XG4gICAgICAgICAgY29uc3QgbSA9IGdldFZveGVsKHRoaXMud29ybGQsIHgsIHksIHopIGFzIE1hdElkO1xuICAgICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSBvdmVyaGFuZ0NlbGxzLnB1c2goeyB4LCB5LCB6LCBtYXRlcmlhbDogbSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IHJlY3Q6IHIsIGZsb29yWSwgc3RhdHMsIHN1cHBvcnQsIG9ic3RydWN0aW9uczogc3RhdHMub2JzdHJ1Y3Rpb25zLCBvdmVyaGFuZ0NlbGxzIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBtb3ZlbWVudCBjb250cmFjdCAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFdhbGtQYXJhbXMge1xuICBtYXhTdGVwVXA6IG51bWJlcjtcbiAgbWF4U3RlcERvd246IG51bWJlcjtcbiAgbWF4V2F0ZXJEZXB0aDogbnVtYmVyO1xuICAvKiogTWF4aW11bSBhZGphY2VudCBzdXJmYWNlIHN0ZXA7IDEuMCBpcyBhIDQ1IGRlZ3JlZSB2b3hlbCByaXNlci4gKi9cbiAgbWF4U2xvcGU6IG51bWJlcjtcbiAgY2xlYXJhbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1dBTEs6IFdhbGtQYXJhbXMgPSB7XG4gIG1heFN0ZXBVcDogMS4wLFxuICBtYXhTdGVwRG93bjogMS41LFxuICBtYXhXYXRlckRlcHRoOiAwLjQsXG4gIG1heFNsb3BlOiAxLjAsXG4gIGNsZWFyYW5jZTogMi4wLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBXYWxrUmVzdWx0IHtcbiAgb2s6IGJvb2xlYW47XG4gIHJlYXNvbjogJ29rJyB8ICdub3RfYWRqYWNlbnQnIHwgJ3N0ZXBfdXAnIHwgJ2ZhbGwnIHwgJ3dhdGVyJyB8ICdzbG9wZScgfCAnY2xlYXJhbmNlJztcbiAgc3RlcDogbnVtYmVyO1xuICB3YXRlckRlcHRoOiBudW1iZXI7XG59XG5cbi8qKiBFdmFsdWF0ZSBvbmUgZ3JpZCBzdGVwLiBQYXRocyBhcmUgdmFsaWRhdGVkIHdpdGggdGhlIHNhbWUgY29udHJhY3QuICovXG5leHBvcnQgZnVuY3Rpb24gd2Fsa1N0ZXAoXG4gIHdvcmxkOiBXb3JsZCwgZnJvbVg6IG51bWJlciwgZnJvbVo6IG51bWJlciwgdG9YOiBudW1iZXIsIHRvWjogbnVtYmVyLFxuICBwYXJhbXM6IFdhbGtQYXJhbXMgPSBERUZBVUxUX1dBTEssXG4pOiBXYWxrUmVzdWx0IHtcbiAgY29uc3QgZHggPSBNYXRoLmFicyhNYXRoLmZsb29yKHRvWCkgLSBNYXRoLmZsb29yKGZyb21YKSk7XG4gIGNvbnN0IGR6ID0gTWF0aC5hYnMoTWF0aC5mbG9vcih0b1opIC0gTWF0aC5mbG9vcihmcm9tWikpO1xuICBpZiAoZHggKyBkeiAhPT0gMSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnbm90X2FkamFjZW50Jywgc3RlcDogMCwgd2F0ZXJEZXB0aDogMCB9O1xuICB9XG4gIGNvbnN0IGZyb20gPSBjb2x1bW5BdCh3b3JsZCwgZnJvbVgsIGZyb21aKTtcbiAgY29uc3QgdG8gPSBjb2x1bW5BdCh3b3JsZCwgdG9YLCB0b1opO1xuICBjb25zdCBzdGVwID0gdG8uc3VyZmFjZVkgLSBmcm9tLnN1cmZhY2VZO1xuICBpZiAoc3RlcCA+IHBhcmFtcy5tYXhTdGVwVXApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RlcF91cCcsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKC1zdGVwID4gcGFyYW1zLm1heFN0ZXBEb3duKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2ZhbGwnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by53YXRlckRlcHRoID4gcGFyYW1zLm1heFdhdGVyRGVwdGgpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnd2F0ZXInLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICh0by5zbG9wZSA+IHBhcmFtcy5tYXhTbG9wZSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzbG9wZScsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbiAgaWYgKCFjbGVhcmFuY2VBdCh3b3JsZCwgdG9YLCB0b1osIHBhcmFtcy5jbGVhcmFuY2UpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdjbGVhcmFuY2UnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIHJlYXNvbjogJ29rJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xufVxuXG4vKiogRWZmZWN0aXZlIGdyYWRlIG9mIGEgc3RyYWlnaHQgcGF0aCBzZWdtZW50LCB1c2VkIGJ5IHBhdGggdmFsaWRhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlZmZlY3RpdmVHcmFkZSh3b3JsZDogV29ybGQsIHgwOiBudW1iZXIsIHowOiBudW1iZXIsIHgxOiBudW1iZXIsIHoxOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBhID0gY29sdW1uQXQod29ybGQsIHgwLCB6MCk7XG4gIGNvbnN0IGIgPSBjb2x1bW5BdCh3b3JsZCwgeDEsIHoxKTtcbiAgY29uc3QgcnVuID0gTWF0aC5oeXBvdCh4MSAtIHgwLCB6MSAtIHowKTtcbiAgaWYgKHJ1biA9PT0gMCkgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKTtcbiAgcmV0dXJuIE1hdGguYWJzKGIuc3VyZmFjZVkgLSBhLnN1cmZhY2VZKSAvIHJ1bjtcbn1cbiIsICIvLyBNMDAyIHNpdGUgdmFsaWRhdGlvbiwgY2FuZGlkYXRlIHNlYXJjaCBhbmQgcHJldmlldyBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLlxuLy9cbi8vIFRoaXMgaXMgdGhlIHNoYXJlZCBnYXRlIGZvciB0aGUgcGxheWVyIGFuZCB0aGUgQUkgYWdlbnQuIE5laXRoZXIgbWF5IHBsYWNlIGFcbi8vIHN0cnVjdHVyZSBieSBhbnkgb3RoZXIgcGF0aDogYm90aCBzdWJtaXQgYSBTaXRlUHJvcG9zYWwsIGJvdGggcmVjZWl2ZSB0aGVcbi8vIHNhbWUgU2l0ZVZhbGlkYXRpb24sIGFuZCBib3RoIG11c3QgcGFzcyB0aGUgQXV0aG9yaXplciBiZWZvcmUgZXhlY3V0aW9uLlxuLy9cbi8vIFRoZSB2YWxpZGF0b3IgZGVzY3JpYmVzIHRoZSBzaXRlIGFzIGl0IGlzLiBJdCBkb2VzIG5vdCBlZGl0IHZveGVscywgcmVtb3ZlXG4vLyBlbnRpdGllcyBvciBzcGVuZCByZXNvdXJjZXMuIFByZXBhcmF0aW9uIGlzIGEgc2VwYXJhdGUsIGF1dGhvcml6ZWQgc3RlcC5cbmltcG9ydCB7IFdvcmxkLCBIQUxGLCBZX01JTiwgWV9NQVgsIHN1cmZhY2VBdCB9IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHtcbiAgUmVjdCwgVm94ZWxSZWdpb24sIEZvb3RwcmludFF1ZXJ5LCBUZXJyYWluUXVlcnksIEFyZWFTdGF0cyxcbiAgbm9ybWFsaXplUmVjdCwgZXhwYW5kUmVjdCwgcmVjdENvbHVtbnMsIGVmZmVjdGl2ZUdyYWRlLCB3YWxrU3RlcCwgV2Fsa1BhcmFtcyxcbiAgREVGQVVMVF9XQUxLLCBjb2x1bW5BdCxcbn0gZnJvbSAnLi90ZXJyYWluJztcblxuZXhwb3J0IHR5cGUgU2l0ZVN0YXRlID0gJ3ZhbGlkJyB8ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJyB8ICdpbnZhbGlkJztcblxuZXhwb3J0IHR5cGUgVmFsaWRhdGlvbkNvZGUgPVxuICB8ICdvdXRfb2ZfYm91bmRzJ1xuICB8ICdmb290cHJpbnRfbWlzbWF0Y2gnXG4gIHwgJ3Nsb3BlX2V4Y2VlZGVkJ1xuICB8ICdzdGVwX2V4Y2VlZGVkJ1xuICB8ICdjdXRfZXhjZWVkZWQnXG4gIHwgJ2ZpbGxfZXhjZWVkZWQnXG4gIHwgJ2N1dF92b2x1bWVfZXhjZWVkZWQnXG4gIHwgJ2ZpbGxfdm9sdW1lX2V4Y2VlZGVkJ1xuICB8ICdmb290cHJpbnRfb2JzdHJ1Y3RlZCdcbiAgfCAnd2F0ZXInXG4gIHwgJ292ZXJoYW5nJ1xuICB8ICduZWVkc19ncmFkaW5nJ1xuICB8ICduZWVkc19jbGVhcmluZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmFsaWRhdGlvblJlYXNvbiB7XG4gIGNvZGU6IFZhbGlkYXRpb25Db2RlO1xuICBzZXZlcml0eTogJ2Vycm9yJyB8ICdwcmVwYXJhdGlvbic7XG4gIG1lc3NhZ2U6IHN0cmluZztcbiAgdmFsdWU/OiBudW1iZXI7XG4gIGxpbWl0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBGb3VuZGF0aW9uVHlwZSA9ICdncmFkZWRfcGFkJyB8ICdzdGVwcGVkX3BsaW50aCcgfCAnZGVjayc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbGRpbmdSdWxlcyB7XG4gIGlkOiBzdHJpbmc7XG4gIHdpZHRoOiBudW1iZXI7XG4gIGRlcHRoOiBudW1iZXI7XG4gIHdhbGxIZWlnaHQ6IG51bWJlcjtcbiAgY2xlYXJhbmNlOiBudW1iZXI7XG4gIC8qKiBSZWxpZWYgYXQgb3IgYmVsb3cgdGhpcyBuZWVkcyBubyBncmFkaW5nIHRvIGJlIGNhbGxlZCB2YWxpZC4gKi9cbiAgbWF4UmVsaWVmTm9QcmVwOiBudW1iZXI7XG4gIC8qKiBSZWxpZWYgYWJvdmUgdGhpcyBjYW5ub3QgYmUgcHJlcGFyZWQgYnkgdGhpcyBidWlsZGluZyB0eXBlLiAqL1xuICBtYXhSZWxpZWZQcmVwYXJlZDogbnVtYmVyO1xuICBtYXhTdGVwOiBudW1iZXI7XG4gIG1heEN1dDogbnVtYmVyO1xuICBtYXhGaWxsOiBudW1iZXI7XG4gIG1heEN1dFZvbHVtZTogbnVtYmVyO1xuICBtYXhGaWxsVm9sdW1lOiBudW1iZXI7XG4gIG1heE9ic3RydWN0aW9uczogbnVtYmVyO1xuICByZXF1aXJlc0RyeTogYm9vbGVhbjtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblR5cGU7XG59XG5cbmV4cG9ydCBjb25zdCBIT1VTRV9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdob3VzZS04eDYnLFxuICB3aWR0aDogOCxcbiAgZGVwdGg6IDYsXG4gIHdhbGxIZWlnaHQ6IDMsXG4gIGNsZWFyYW5jZTogMyxcbiAgbWF4UmVsaWVmTm9QcmVwOiAxLjIsXG4gIG1heFJlbGllZlByZXBhcmVkOiA0LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMixcbiAgbWF4RmlsbDogMixcbiAgbWF4Q3V0Vm9sdW1lOiA0OCxcbiAgbWF4RmlsbFZvbHVtZTogNDgsXG4gIG1heE9ic3RydWN0aW9uczogMCxcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdncmFkZWRfcGFkJyxcbn07XG5cbmV4cG9ydCBjb25zdCBGQVJNX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ2Zhcm0tMTJ4OCcsXG4gIHdpZHRoOiAxMixcbiAgZGVwdGg6IDgsXG4gIHdhbGxIZWlnaHQ6IDAsXG4gIGNsZWFyYW5jZTogMSxcbiAgbWF4UmVsaWVmTm9QcmVwOiAxLjIsXG4gIG1heFJlbGllZlByZXBhcmVkOiA2LjAsXG4gIG1heFN0ZXA6IDEsXG4gIG1heEN1dDogMixcbiAgbWF4RmlsbDogMixcbiAgbWF4Q3V0Vm9sdW1lOiA5NixcbiAgbWF4RmlsbFZvbHVtZTogOTYsXG4gIG1heE9ic3RydWN0aW9uczogNCxcbiAgcmVxdWlyZXNEcnk6IHRydWUsXG4gIGZvdW5kYXRpb246ICdzdGVwcGVkX3BsaW50aCcsXG59O1xuXG5leHBvcnQgY29uc3QgUEFUSF9SVUxFUzogQnVpbGRpbmdSdWxlcyA9IHtcbiAgaWQ6ICdwYXRoLTl4MycsXG4gIHdpZHRoOiA5LFxuICBkZXB0aDogMyxcbiAgd2FsbEhlaWdodDogMCxcbiAgY2xlYXJhbmNlOiAxLFxuICBtYXhSZWxpZWZOb1ByZXA6IDIuMCxcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDQuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAxLFxuICBtYXhGaWxsOiAxLFxuICBtYXhDdXRWb2x1bWU6IDMyLFxuICBtYXhGaWxsVm9sdW1lOiAzMixcbiAgbWF4T2JzdHJ1Y3Rpb25zOiAyLFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ2RlY2snLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBTaXRlUHJvcG9zYWwge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uU3VtbWFyeSB7XG4gIG5lZWRzR3JhZGluZzogYm9vbGVhbjtcbiAgbmVlZHNDbGVhcmluZzogYm9vbGVhbjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25JZHM6IHN0cmluZ1tdO1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uVHlwZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlVmFsaWRhdGlvbiB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW107XG4gIHF1ZXJ5OiBGb290cHJpbnRRdWVyeTtcbiAgcHJlcGFyYXRpb246IFByZXBhcmF0aW9uU3VtbWFyeTtcbn1cblxuZnVuY3Rpb24gZXJyb3IoY29kZTogVmFsaWRhdGlvbkNvZGUsIG1lc3NhZ2U6IHN0cmluZywgdmFsdWU/OiBudW1iZXIsIGxpbWl0PzogbnVtYmVyKTogVmFsaWRhdGlvblJlYXNvbiB7XG4gIHJldHVybiB7IGNvZGUsIHNldmVyaXR5OiAnZXJyb3InLCBtZXNzYWdlLCB2YWx1ZSwgbGltaXQgfTtcbn1cblxuZnVuY3Rpb24gcHJlcChjb2RlOiBWYWxpZGF0aW9uQ29kZSwgbWVzc2FnZTogc3RyaW5nLCB2YWx1ZT86IG51bWJlciwgbGltaXQ/OiBudW1iZXIpOiBWYWxpZGF0aW9uUmVhc29uIHtcbiAgcmV0dXJuIHsgY29kZSwgc2V2ZXJpdHk6ICdwcmVwYXJhdGlvbicsIG1lc3NhZ2UsIHZhbHVlLCBsaW1pdCB9O1xufVxuXG4vKipcbiAqIFZhbGlkYXRlIGEgcHJvcG9zZWQgc2l0ZSBhZ2FpbnN0IGl0cyBidWlsZGluZyBydWxlcy4gUHVyZTogbm8gdm94ZWxzLFxuICogZW50aXRpZXMgb3IgcmVzb3VyY2VzIGNoYW5nZS4gYHF1ZXJ5YCBtYXkgYmUgc3VwcGxpZWQgYnkgYSBzZWFyY2ggdG8gcmV1c2VcbiAqIHRoZSBjYWNoZWQgY29sdW1ucywgYW5kIGBmb290cHJpbnRgIG1heSBiZSBzdXBwbGllZCB3aGVuIHRoZSBjYWxsZXIgYWxyZWFkeVxuICogZXZhbHVhdGVkIHRoZSBzYW1lIHJlY3QvZmxvb3IgcGFpci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlU2l0ZShcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpLFxuICBmb290cHJpbnQ/OiBGb290cHJpbnRRdWVyeSxcbik6IFNpdGVWYWxpZGF0aW9uIHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHJ1bGVzID0gcHJvcG9zYWwucnVsZXM7XG4gIGNvbnN0IHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXSA9IFtdO1xuICBjb25zdCBmcCA9IGZvb3RwcmludCA/PyBxdWVyeS5mb290cHJpbnQocmVjdCwgcHJvcG9zYWwuZmxvb3JZKTtcbiAgY29uc3Qgc3RhdHMgPSBmcC5zdGF0cztcblxuICBpZiAocmVjdC54MCA8IC1IQUxGIHx8IHJlY3QuejAgPCAtSEFMRiB8fCByZWN0LngxID49IEhBTEYgfHwgcmVjdC56MSA+PSBIQUxGKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKCdvdXRfb2ZfYm91bmRzJywgYGZvb3RwcmludCAke3JlY3QueDB9LCR7cmVjdC56MH0uLiR7cmVjdC54MX0sJHtyZWN0LnoxfSBpcyBvdXRzaWRlIHRoZSB3b3JsZGApKTtcbiAgfVxuICBpZiAocmVjdC54MSAtIHJlY3QueDAgKyAxICE9PSBydWxlcy53aWR0aCB8fCByZWN0LnoxIC0gcmVjdC56MCArIDEgIT09IHJ1bGVzLmRlcHRoKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2Zvb3RwcmludF9taXNtYXRjaCcsXG4gICAgICBgZm9vdHByaW50IGlzICR7cmVjdC54MSAtIHJlY3QueDAgKyAxfSB4ICR7cmVjdC56MSAtIHJlY3QuejAgKyAxfSBtLCAke3J1bGVzLndpZHRofSB4ICR7cnVsZXMuZGVwdGh9IG0gcmVxdWlyZWRgLFxuICAgICkpO1xuICB9XG5cbiAgaWYgKHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZlByZXBhcmVkKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3Nsb3BlX2V4Y2VlZGVkJyxcbiAgICAgIGByZWxpZWYgJHtzdGF0cy5yZWxpZWZ9IG0gZXhjZWVkcyB0aGUgJHtydWxlcy5tYXhSZWxpZWZQcmVwYXJlZH0gbSBwcmVwYXJlZCBsaW1pdGAsXG4gICAgICBzdGF0cy5yZWxpZWYsIHJ1bGVzLm1heFJlbGllZlByZXBhcmVkLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhTdGVwID4gcnVsZXMubWF4U3RlcCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdzdGVwX2V4Y2VlZGVkJyxcbiAgICAgIGBzdXJmYWNlIHN0ZXAgJHtzdGF0cy5tYXhTdGVwfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhTdGVwfSBtYCxcbiAgICAgIHN0YXRzLm1heFN0ZXAsIHJ1bGVzLm1heFN0ZXAsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEN1dCA+IHJ1bGVzLm1heEN1dCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdjdXRfZXhjZWVkZWQnLFxuICAgICAgYGN1dCAke3N0YXRzLm1heEN1dH0gbSBleGNlZWRzICR7cnVsZXMubWF4Q3V0fSBtYCxcbiAgICAgIHN0YXRzLm1heEN1dCwgcnVsZXMubWF4Q3V0LFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5tYXhGaWxsID4gcnVsZXMubWF4RmlsbCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmaWxsX2V4Y2VlZGVkJyxcbiAgICAgIGBmaWxsICR7c3RhdHMubWF4RmlsbH0gbSBleGNlZWRzICR7cnVsZXMubWF4RmlsbH0gbWAsXG4gICAgICBzdGF0cy5tYXhGaWxsLCBydWxlcy5tYXhGaWxsLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5jdXRWb2x1bWUgPiBydWxlcy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnY3V0X3ZvbHVtZV9leGNlZWRlZCcsXG4gICAgICBgY3V0IHZvbHVtZSAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4Q3V0Vm9sdW1lfSBtXHUwMEIzYCxcbiAgICAgIHN0YXRzLmN1dFZvbHVtZSwgcnVsZXMubWF4Q3V0Vm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChzdGF0cy5maWxsVm9sdW1lID4gcnVsZXMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmaWxsX3ZvbHVtZV9leGNlZWRlZCcsXG4gICAgICBgZmlsbCB2b2x1bWUgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsVm9sdW1lfSBtXHUwMEIzYCxcbiAgICAgIHN0YXRzLmZpbGxWb2x1bWUsIHJ1bGVzLm1heEZpbGxWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHJ1bGVzLnJlcXVpcmVzRHJ5ICYmIHN0YXRzLndhdGVyQ29sdW1ucyA+IDApIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnd2F0ZXInLFxuICAgICAgYCR7c3RhdHMud2F0ZXJDb2x1bW5zfSBmb290cHJpbnQgY29sdW1ucyBhcmUgdW5kZXJ3YXRlcmAsXG4gICAgICBzdGF0cy53YXRlckNvbHVtbnMsIDAsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPiBydWxlcy5tYXhPYnN0cnVjdGlvbnMpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZm9vdHByaW50X29ic3RydWN0ZWQnLFxuICAgICAgYCR7c3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIGV4Y2VlZCB0aGUgJHtydWxlcy5tYXhPYnN0cnVjdGlvbnN9IGFsbG93YW5jZWAsXG4gICAgICBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoLCBydWxlcy5tYXhPYnN0cnVjdGlvbnMsXG4gICAgKSk7XG4gIH1cbiAgaWYgKGZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RoID4gMCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdvdmVyaGFuZycsXG4gICAgICBgJHtmcC5vdmVyaGFuZ0NlbGxzLmxlbmd0aH0gY2VsbHMgYWJvdmUgdGhlIGZsb29yIGFyZSBibG9ja2VkYCxcbiAgICAgIGZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RoLCAwLFxuICAgICkpO1xuICB9XG5cbiAgY29uc3QgbmVlZHNHcmFkaW5nID0gc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmTm9QcmVwXG4gICAgfHwgc3RhdHMuY3V0Vm9sdW1lID4gMCB8fCBzdGF0cy5maWxsVm9sdW1lID4gMDtcbiAgY29uc3QgbmVlZHNDbGVhcmluZyA9IHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGggPiAwXG4gICAgJiYgc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA8PSBydWxlcy5tYXhPYnN0cnVjdGlvbnM7XG5cbiAgaWYgKG5lZWRzR3JhZGluZykge1xuICAgIHJlYXNvbnMucHVzaChwcmVwKFxuICAgICAgJ25lZWRzX2dyYWRpbmcnLFxuICAgICAgYGdyYWRpbmcgcmVxdWlyZWQ6ICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGN1dCwgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGZpbGxgLFxuICAgICAgc3RhdHMuY3V0Vm9sdW1lICsgc3RhdHMuZmlsbFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAobmVlZHNDbGVhcmluZykge1xuICAgIHJlYXNvbnMucHVzaChwcmVwKFxuICAgICAgJ25lZWRzX2NsZWFyaW5nJyxcbiAgICAgIGAke3N0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyB0byBjbGVhcmAsXG4gICAgICBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoLCBydWxlcy5tYXhPYnN0cnVjdGlvbnMsXG4gICAgKSk7XG4gIH1cblxuICBjb25zdCBoYXNFcnJvciA9IHJlYXNvbnMuc29tZSgocikgPT4gci5zZXZlcml0eSA9PT0gJ2Vycm9yJyk7XG4gIGNvbnN0IGhhc1ByZXAgPSByZWFzb25zLnNvbWUoKHIpID0+IHIuc2V2ZXJpdHkgPT09ICdwcmVwYXJhdGlvbicpO1xuICBjb25zdCBzdGF0ZTogU2l0ZVN0YXRlID0gaGFzRXJyb3IgPyAnaW52YWxpZCcgOiBoYXNQcmVwID8gJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nIDogJ3ZhbGlkJztcblxuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHN0YXRlLFxuICAgIHJlYXNvbnMsXG4gICAgcXVlcnk6IGZwLFxuICAgIHByZXBhcmF0aW9uOiB7XG4gICAgICBuZWVkc0dyYWRpbmcsXG4gICAgICBuZWVkc0NsZWFyaW5nLFxuICAgICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiBzdGF0cy5tYXhDdXQsXG4gICAgICBtYXhGaWxsOiBzdGF0cy5tYXhGaWxsLFxuICAgICAgb2JzdHJ1Y3Rpb25JZHM6IHN0YXRzLm9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpLFxuICAgICAgZm91bmRhdGlvbjogcnVsZXMuZm91bmRhdGlvbixcbiAgICB9LFxuICB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNhbmRpZGF0ZSBzZWFyY2ggLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTZWFyY2hPcHRpb25zIHtcbiAgLyoqIENhbmRpZGF0ZSBncmlkIHN0ZXAgaW4gbWV0cmVzLiBEZWZhdWx0IDIuICovXG4gIHN0ZXA/OiBudW1iZXI7XG4gIG1heFJlc3VsdHM/OiBudW1iZXI7XG4gIGFuY2hvcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgbWF4RGlzdGFuY2U/OiBudW1iZXI7XG4gIC8qKiBIYXJkIGNvbnN0cmFpbnQ6IGNhbmRpZGF0ZSBjZW50cmUgbXVzdCBsaWUgd2l0aGluIHRoaXMgcmFkaXVzIG9mIGEgcG9pbnQuICovXG4gIG5lYXI/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyOyBtYXhEaXN0YW5jZTogbnVtYmVyIH07XG4gIC8qKiBEbyBub3QgcmV0dXJuIHR3byBjYW5kaWRhdGVzIHdob3NlIGZvb3RwcmludHMgb3ZlcmxhcC4gRGVmYXVsdCB0cnVlLiAqL1xuICBkaXN0aW5jdD86IGJvb2xlYW47XG4gIC8qKiBXYWxsLWNsb2NrIGJ1ZGdldCBmb3IgdGhlIHNjYW4uIERlZmF1bHQgMTAwIG1zLiAqL1xuICBidWRnZXRNcz86IG51bWJlcjtcbiAgd2Fsaz86IFdhbGtQYXJhbXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZUNhbmRpZGF0ZSB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgc3RhdGU6ICd2YWxpZCcgfCAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbic7XG4gIHZhbGlkYXRpb246IFNpdGVWYWxpZGF0aW9uO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBvYnN0cnVjdGlvbkNvdW50OiBudW1iZXI7XG4gIGRpc3RhbmNlOiBudW1iZXI7XG4gIHNjb3JlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVNlYXJjaFJlc3VsdCB7XG4gIGNhbmRpZGF0ZXM6IFNpdGVDYW5kaWRhdGVbXTtcbiAgZXZhbHVhdGVkOiBudW1iZXI7XG4gIHJlamVjdGVkOiBudW1iZXI7XG4gIGVsYXBzZWRNczogbnVtYmVyO1xuICBidWRnZXRNczogbnVtYmVyO1xuICAvKiogVHJ1ZSB3aGVuIHRoZSB3YWxsLWNsb2NrIGJ1ZGdldCBzdG9wcGVkIHRoZSBzY2FuIGJlZm9yZSB0aGUgYXJlYSB3YXMgZXhoYXVzdGVkLiAqL1xuICB0cnVuY2F0ZWQ6IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIGZsb29yQ2FuZGlkYXRlcyhzdGF0czogQXJlYVN0YXRzKTogbnVtYmVyW10ge1xuICBjb25zdCBtZWFuID0gTWF0aC5yb3VuZChzdGF0cy5tZWFuWSk7XG4gIGNvbnN0IHNldCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBmb3IgKGxldCBkID0gLTE7IGQgPD0gMTsgZCsrKSBzZXQuYWRkKG1lYW4gKyBkKTtcbiAgc2V0LmFkZChzdGF0cy5taW5ZKTtcbiAgc2V0LmFkZChzdGF0cy5tYXhZKTtcbiAgcmV0dXJuIFsuLi5zZXRdLmZpbHRlcigoeSkgPT4geSA+PSBZX01JTiAmJiB5IDwgWV9NQVgpLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbn1cblxuZnVuY3Rpb24gb3ZlcmxhcHMoYTogUmVjdCwgYjogUmVjdCk6IGJvb2xlYW4ge1xuICByZXR1cm4gYS54MCA8PSBiLngxICYmIGEueDEgPj0gYi54MCAmJiBhLnowIDw9IGIuejEgJiYgYS56MSA+PSBiLnowO1xufVxuXG5mdW5jdGlvbiBjYW5kaWRhdGVTY29yZSh2OiBTaXRlVmFsaWRhdGlvbiwgZGlzdGFuY2U6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHByZXBQZW5hbHR5ID0gdi5zdGF0ZSA9PT0gJ3ZhbGlkJyA/IDAgOiAyNTtcbiAgY29uc3QgZ3JhZGluZyA9IHYucHJlcGFyYXRpb24uY3V0Vm9sdW1lICsgdi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lO1xuICBjb25zdCBjbGVhcmluZyA9IHYucHJlcGFyYXRpb24ub2JzdHJ1Y3Rpb25JZHMubGVuZ3RoICogNDtcbiAgcmV0dXJuIHByZXBQZW5hbHR5ICsgZ3JhZGluZyArIGNsZWFyaW5nICsgZGlzdGFuY2UgKiAwLjI1O1xufVxuXG4vKipcbiAqIFNlYXJjaCBhIGJvdW5kZWQgYXJlYSBmb3IgdmlhYmxlIGZvb3RwcmludHMuIFRoZSBzYW1lIHZhbGlkYXRvciBhbmQgdGhlIHNhbWVcbiAqIGZsb29yLXNlbGVjdGlvbiBwb2xpY3kgYXJlIHVzZWQgYnkgdGhlIEFJIGFnZW50IGFuZCB0aGUgcGxheWVyJ3MgYnVpbGRcbiAqIHByZXZpZXcuIFNlYXJjaCBpcyByZWFkLW9ubHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWFyY2hTaXRlcyhcbiAgd29ybGQ6IFdvcmxkLCBydWxlczogQnVpbGRpbmdSdWxlcywgYXJlYTogUmVjdCwgb3B0aW9uczogU2VhcmNoT3B0aW9ucyA9IHt9LFxuKTogU2l0ZVNlYXJjaFJlc3VsdCB7XG4gIGNvbnN0IHQwID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gIGNvbnN0IHN0ZXAgPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKG9wdGlvbnMuc3RlcCA/PyAyKSk7XG4gIGNvbnN0IG1heFJlc3VsdHMgPSBNYXRoLm1heCgxLCBvcHRpb25zLm1heFJlc3VsdHMgPz8gOCk7XG4gIGNvbnN0IGRpc3RpbmN0ID0gb3B0aW9ucy5kaXN0aW5jdCAhPT0gZmFsc2U7XG4gIGNvbnN0IG1heERpc3RhbmNlID0gb3B0aW9ucy5tYXhEaXN0YW5jZSA/PyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gIGNvbnN0IGJ1ZGdldE1zID0gb3B0aW9ucy5idWRnZXRNcyA/PyAxMDA7XG4gIGNvbnN0IGFuY2hvciA9IG9wdGlvbnMuYW5jaG9yID8/IHsgeDogKGFyZWEueDAgKyBhcmVhLngxKSAvIDIsIHo6IChhcmVhLnowICsgYXJlYS56MSkgLyAyIH07XG4gIGNvbnN0IHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCk7XG4gIGNvbnN0IGFsbDogU2l0ZUNhbmRpZGF0ZVtdID0gW107XG4gIGxldCBldmFsdWF0ZWQgPSAwO1xuICBsZXQgcmVqZWN0ZWQgPSAwO1xuICBsZXQgdHJ1bmNhdGVkID0gZmFsc2U7XG5cbiAgY29uc3QgeDFNYXggPSBhcmVhLngxIC0gcnVsZXMud2lkdGggKyAxO1xuICBjb25zdCB6MU1heCA9IGFyZWEuejEgLSBydWxlcy5kZXB0aCArIDE7XG4gIHNjYW46IGZvciAobGV0IHogPSBhcmVhLnowOyB6IDw9IHoxTWF4OyB6ICs9IHN0ZXApIHtcbiAgICBmb3IgKGxldCB4ID0gYXJlYS54MDsgeCA8PSB4MU1heDsgeCArPSBzdGVwKSB7XG4gICAgICBjb25zdCByZWN0ID0geyB4MDogeCwgejA6IHosIHgxOiB4ICsgcnVsZXMud2lkdGggLSAxLCB6MTogeiArIHJ1bGVzLmRlcHRoIC0gMSB9O1xuICAgICAgY29uc3QgY3ggPSAocmVjdC54MCArIHJlY3QueDEpIC8gMjtcbiAgICAgIGNvbnN0IGN6ID0gKHJlY3QuejAgKyByZWN0LnoxKSAvIDI7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguaHlwb3QoY3ggLSBhbmNob3IueCwgY3ogLSBhbmNob3Iueik7XG4gICAgICBpZiAoZGlzdGFuY2UgPiBtYXhEaXN0YW5jZSkgY29udGludWU7XG4gICAgICBpZiAob3B0aW9ucy5uZWFyKSB7XG4gICAgICAgIGNvbnN0IG5lYXJEaXN0YW5jZSA9IE1hdGguaHlwb3QoY3ggLSBvcHRpb25zLm5lYXIueCwgY3ogLSBvcHRpb25zLm5lYXIueik7XG4gICAgICAgIGlmIChuZWFyRGlzdGFuY2UgPiBvcHRpb25zLm5lYXIubWF4RGlzdGFuY2UpIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzdGF0cyA9IHF1ZXJ5LmFyZWEocmVjdCk7XG4gICAgICBsZXQgYmVzdDogU2l0ZUNhbmRpZGF0ZSB8IG51bGwgPSBudWxsO1xuICAgICAgZm9yIChjb25zdCBmbG9vclkgb2YgZmxvb3JDYW5kaWRhdGVzKHN0YXRzKSkge1xuICAgICAgICBldmFsdWF0ZWQrKztcbiAgICAgICAgY29uc3QgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCA9IHtcbiAgICAgICAgICBzaXRlSWQ6IGAke3J1bGVzLmlkfToke3h9LCR7en0sJHtmbG9vcll9YCxcbiAgICAgICAgICByZWN0LCBmbG9vclksIHJ1bGVzLFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBmb290cHJpbnQgPSBxdWVyeS5mb290cHJpbnQocmVjdCwgZmxvb3JZKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwsIHF1ZXJ5LCBmb290cHJpbnQpO1xuICAgICAgICBpZiAodmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnKSB7XG4gICAgICAgICAgcmVqZWN0ZWQrKztcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzY29yZSA9IGNhbmRpZGF0ZVNjb3JlKHZhbGlkYXRpb24sIGRpc3RhbmNlKTtcbiAgICAgICAgY29uc3QgY2FuZGlkYXRlOiBTaXRlQ2FuZGlkYXRlID0ge1xuICAgICAgICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgICAgICAgIHJlY3QsXG4gICAgICAgICAgZmxvb3JZLFxuICAgICAgICAgIHN0YXRlOiB2YWxpZGF0aW9uLnN0YXRlLFxuICAgICAgICAgIHZhbGlkYXRpb24sXG4gICAgICAgICAgY3V0Vm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmN1dFZvbHVtZSxcbiAgICAgICAgICBmaWxsVm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmZpbGxWb2x1bWUsXG4gICAgICAgICAgb2JzdHJ1Y3Rpb25Db3VudDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcy5sZW5ndGgsXG4gICAgICAgICAgZGlzdGFuY2UsXG4gICAgICAgICAgc2NvcmUsXG4gICAgICAgIH07XG4gICAgICAgIGlmICghYmVzdFxuICAgICAgICAgIHx8IChjYW5kaWRhdGUuc3RhdGUgPT09ICd2YWxpZCcgJiYgYmVzdC5zdGF0ZSAhPT0gJ3ZhbGlkJylcbiAgICAgICAgICB8fCAoY2FuZGlkYXRlLnN0YXRlID09PSBiZXN0LnN0YXRlICYmIGNhbmRpZGF0ZS5zY29yZSA8IGJlc3Quc2NvcmUpKSB7XG4gICAgICAgICAgYmVzdCA9IGNhbmRpZGF0ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGJlc3QpIGFsbC5wdXNoKGJlc3QpO1xuICAgIH1cbiAgICBpZiAocGVyZm9ybWFuY2Uubm93KCkgLSB0MCA+IGJ1ZGdldE1zKSB7XG4gICAgICB0cnVuY2F0ZWQgPSB0cnVlO1xuICAgICAgYnJlYWsgc2NhbjtcbiAgICB9XG4gIH1cblxuICBhbGwuc29ydCgoYSwgYikgPT4gYS5zY29yZSAtIGIuc2NvcmUgfHwgYS5kaXN0YW5jZSAtIGIuZGlzdGFuY2VcbiAgICB8fCBhLnJlY3QueDAgLSBiLnJlY3QueDAgfHwgYS5yZWN0LnowIC0gYi5yZWN0LnowKTtcbiAgY29uc3Qgc2VsZWN0ZWQ6IFNpdGVDYW5kaWRhdGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBhbGwpIHtcbiAgICBpZiAoZGlzdGluY3QgJiYgc2VsZWN0ZWQuc29tZSgocykgPT4gb3ZlcmxhcHMocy5yZWN0LCBjYW5kaWRhdGUucmVjdCkpKSBjb250aW51ZTtcbiAgICBzZWxlY3RlZC5wdXNoKGNhbmRpZGF0ZSk7XG4gICAgaWYgKHNlbGVjdGVkLmxlbmd0aCA+PSBtYXhSZXN1bHRzKSBicmVhaztcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2FuZGlkYXRlczogc2VsZWN0ZWQsXG4gICAgZXZhbHVhdGVkLFxuICAgIHJlamVjdGVkLFxuICAgIGVsYXBzZWRNczogTWF0aC5yb3VuZCgocGVyZm9ybWFuY2Uubm93KCkgLSB0MCkgKiAxMDApIC8gMTAwLFxuICAgIGJ1ZGdldE1zLFxuICAgIHRydW5jYXRlZCxcbiAgfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwcmV2aWV3IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgRm91bmRhdGlvblByZXZpZXcge1xuICB0eXBlOiBGb3VuZGF0aW9uVHlwZTtcbiAgLyoqIFN0b25lIGZsb29yIHNsYWIgcGx1cyBmaWxsIHVuZGVyIHRoZSBwcmVwYXJlZCBmbG9vci4gKi9cbiAgcGxpbnRoQ2VsbHM6IG51bWJlcjtcbiAgLyoqIFBlcmltZXRlciBjZWxscyB0aGF0IG5lZWQgYSByZXRhaW5pbmcgZmFjZSBiZWNhdXNlIG9mIGN1dCBvciBmaWxsLiAqL1xuICByZXRhaW5pbmdXYWxsQ2VsbHM6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBY2Nlc3NQcmV2aWV3IHtcbiAgZG9vcjogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaDogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBkaXN0YW5jZTogbnVtYmVyO1xuICBncmFkZTogbnVtYmVyO1xuICB3YWxrYWJsZTogYm9vbGVhbjtcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVByZXZpZXcge1xuICBzaXRlSWQ6IHN0cmluZztcbiAgc3RhdGU6IFNpdGVTdGF0ZTtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICByZWFzb25zOiBWYWxpZGF0aW9uUmVhc29uW107XG4gIHRlcnJhaW46IHtcbiAgICBtaW5ZOiBudW1iZXI7XG4gICAgbWF4WTogbnVtYmVyO1xuICAgIG1lYW5ZOiBudW1iZXI7XG4gICAgcmVsaWVmOiBudW1iZXI7XG4gICAgbWF4U3RlcDogbnVtYmVyO1xuICAgIGN1dFZvbHVtZTogbnVtYmVyO1xuICAgIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgICBtYXhDdXQ6IG51bWJlcjtcbiAgICBtYXhGaWxsOiBudW1iZXI7XG4gIH07XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25QcmV2aWV3O1xuICBvYnN0cnVjdGlvbnM6IEFycmF5PHtcbiAgICBlbnRpdHlJZDogc3RyaW5nO1xuICAgIGtpbmQ6IHN0cmluZztcbiAgICB4OiBudW1iZXI7XG4gICAgejogbnVtYmVyO1xuICAgIGFjdGlvbjogJ2NsZWFyJyB8ICdibG9ja2VkJztcbiAgfT47XG4gIGFjY2VzczogQWNjZXNzUHJldmlldyB8IG51bGw7XG4gIC8qKiBDb21wbGV0ZSB3b3JrIGVudmVsb3BlIHRoaXMgcHJldmlldyB3b3VsZCBhdXRob3JpemUuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXZpZXdPcHRpb25zIHtcbiAgZG9vcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHdhbGs/OiBXYWxrUGFyYW1zO1xufVxuXG4vKipcbiAqIEJ1aWxkIHRoZSB0aHJlZS1zdGF0ZSBwcmV2aWV3LiBJdCBpcyBkZWxpYmVyYXRlbHkgZGF0YS1vbmx5OiB0aGUgcmVuZGVyZXJcbiAqIGNhbiBkcmF3IGl0LCBidXQgaXQgbmV2ZXIgZWRpdHMgdGVycmFpbiBvciBzcGVuZHMgcmVzb3VyY2VzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJldmlld1NpdGUoXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgb3B0aW9uczogUHJldmlld09wdGlvbnMgPSB7fSxcbik6IFNpdGVQcmV2aWV3IHtcbiAgY29uc3QgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKTtcbiAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwsIHF1ZXJ5KTtcbiAgY29uc3QgZnAgPSB2YWxpZGF0aW9uLnF1ZXJ5O1xuICBjb25zdCBzdGF0cyA9IGZwLnN0YXRzO1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgcnVsZXMgPSBwcm9wb3NhbC5ydWxlcztcblxuICBsZXQgcGVyaW1ldGVyID0gMDtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgICBpZiAoeCAhPT0gcmVjdC54MCAmJiB4ICE9PSByZWN0LngxICYmIHogIT09IHJlY3QuejAgJiYgeiAhPT0gcmVjdC56MSkgY29udGludWU7XG4gICAgICBpZiAoY29sdW1uQXQod29ybGQsIHgsIHopLnN1cmZhY2VZICE9PSBwcm9wb3NhbC5mbG9vclkpIHBlcmltZXRlcisrO1xuICAgIH1cbiAgfVxuICBjb25zdCBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uUHJldmlldyA9IHtcbiAgICB0eXBlOiBydWxlcy5mb3VuZGF0aW9uLFxuICAgIHBsaW50aENlbGxzOiByZWN0Q29sdW1ucyhyZWN0KSArIHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgcmV0YWluaW5nV2FsbENlbGxzOiBwZXJpbWV0ZXIsXG4gICAgY3V0Vm9sdW1lOiBzdGF0cy5jdXRWb2x1bWUsXG4gICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgfTtcblxuICBsZXQgYWNjZXNzOiBBY2Nlc3NQcmV2aWV3IHwgbnVsbCA9IG51bGw7XG4gIGlmIChvcHRpb25zLmRvb3IgJiYgb3B0aW9ucy5hcHByb2FjaCkge1xuICAgIGNvbnN0IGRvb3IgPSBvcHRpb25zLmRvb3I7XG4gICAgY29uc3QgYXBwcm9hY2ggPSBvcHRpb25zLmFwcHJvYWNoO1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLmh5cG90KGRvb3IueCAtIGFwcHJvYWNoLngsIGRvb3IueiAtIGFwcHJvYWNoLnopO1xuICAgIGNvbnN0IHN0ZXBzID0gTWF0aC5tYXgoMSwgTWF0aC5jZWlsKGRpc3RhbmNlKSk7XG4gICAgbGV0IHByZXZYID0gYXBwcm9hY2gueCwgcHJldlogPSBhcHByb2FjaC56O1xuICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IHN0ZXBzOyBpKyspIHtcbiAgICAgIGNvbnN0IHQgPSBpIC8gc3RlcHM7XG4gICAgICBjb25zdCB4ID0gTWF0aC5yb3VuZChhcHByb2FjaC54ICsgKGRvb3IueCAtIGFwcHJvYWNoLngpICogdCk7XG4gICAgICBjb25zdCB6ID0gTWF0aC5yb3VuZChhcHByb2FjaC56ICsgKGRvb3IueiAtIGFwcHJvYWNoLnopICogdCk7XG4gICAgICBpZiAoeCA9PT0gcHJldlggJiYgeiA9PT0gcHJldlopIGNvbnRpbnVlO1xuICAgICAgY29uc3QgcmVzdWx0ID0gd2Fsa1N0ZXAod29ybGQsIHByZXZYLCBwcmV2WiwgeCwgeiwgb3B0aW9ucy53YWxrID8/IERFRkFVTFRfV0FMSyk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmVhc29ucy5wdXNoKGAke3Jlc3VsdC5yZWFzb259IGF0ICR7eH0sJHt6fWApO1xuICAgICAgcHJldlggPSB4OyBwcmV2WiA9IHo7XG4gICAgfVxuICAgIGFjY2VzcyA9IHtcbiAgICAgIGRvb3IsIGFwcHJvYWNoLCBkaXN0YW5jZSxcbiAgICAgIGdyYWRlOiBlZmZlY3RpdmVHcmFkZSh3b3JsZCwgYXBwcm9hY2gueCwgYXBwcm9hY2gueiwgZG9vci54LCBkb29yLnopLFxuICAgICAgd2Fsa2FibGU6IHJlYXNvbnMubGVuZ3RoID09PSAwLFxuICAgICAgcmVhc29ucyxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgeTAgPSBwcm9wb3NhbC5mbG9vclkgLSBNYXRoLm1heCgxLCBzdGF0cy5tYXhDdXQpIC0gMTtcbiAgY29uc3QgeTEgPSBwcm9wb3NhbC5mbG9vclkgKyBNYXRoLm1heChydWxlcy53YWxsSGVpZ2h0LCAxKSArIDE7XG4gIGNvbnN0IGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdID0gW1xuICAgIHtcbiAgICAgIC4uLmV4cGFuZFJlY3QocmVjdCwgMiksXG4gICAgICB5MDogTWF0aC5tYXgoWV9NSU4sIHkwKSxcbiAgICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIHkxKSxcbiAgICB9LFxuICBdO1xuICBpZiAoYWNjZXNzKSB7XG4gICAgY29uc3QgYXgwID0gTWF0aC5taW4oYWNjZXNzLmRvb3IueCwgYWNjZXNzLmFwcHJvYWNoLngpIC0gMTtcbiAgICBjb25zdCBheDEgPSBNYXRoLm1heChhY2Nlc3MuZG9vci54LCBhY2Nlc3MuYXBwcm9hY2gueCkgKyAxO1xuICAgIGNvbnN0IGF6MCA9IE1hdGgubWluKGFjY2Vzcy5kb29yLnosIGFjY2Vzcy5hcHByb2FjaC56KSAtIDE7XG4gICAgY29uc3QgYXoxID0gTWF0aC5tYXgoYWNjZXNzLmRvb3IueiwgYWNjZXNzLmFwcHJvYWNoLnopICsgMTtcbiAgICBjb25zdCBhTWluID0gTWF0aC5taW4oc3VyZmFjZUF0KHdvcmxkLCBheDAsIGF6MCksIHN1cmZhY2VBdCh3b3JsZCwgYXgxLCBhejEpKTtcbiAgICBjb25zdCBhTWF4ID0gTWF0aC5tYXgoc3VyZmFjZUF0KHdvcmxkLCBheDAsIGF6MCksIHN1cmZhY2VBdCh3b3JsZCwgYXgxLCBhejEpKTtcbiAgICBlbnZlbG9wZS5wdXNoKHtcbiAgICAgIHgwOiBheDAsIHgxOiBheDEsIHowOiBhejAsIHoxOiBhejEsXG4gICAgICB5MDogTWF0aC5tYXgoWV9NSU4sIGFNaW4gLSAyKSxcbiAgICAgIHkxOiBNYXRoLm1pbihZX01BWCAtIDEsIGFNYXggKyAyKSxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgc3RhdGU6IHZhbGlkYXRpb24uc3RhdGUsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBydWxlcyxcbiAgICByZWFzb25zOiB2YWxpZGF0aW9uLnJlYXNvbnMsXG4gICAgdGVycmFpbjoge1xuICAgICAgbWluWTogc3RhdHMubWluWSxcbiAgICAgIG1heFk6IHN0YXRzLm1heFksXG4gICAgICBtZWFuWTogc3RhdHMubWVhblksXG4gICAgICByZWxpZWY6IHN0YXRzLnJlbGllZixcbiAgICAgIG1heFN0ZXA6IHN0YXRzLm1heFN0ZXAsXG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgfSxcbiAgICBmb3VuZGF0aW9uLFxuICAgIG9ic3RydWN0aW9uczogc3RhdHMub2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gKHtcbiAgICAgIGVudGl0eUlkOiBvLmVudGl0eUlkLFxuICAgICAga2luZDogby5raW5kLFxuICAgICAgeDogby54LFxuICAgICAgejogby56LFxuICAgICAgYWN0aW9uOiB2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcgPyAnYmxvY2tlZCcgOiAnY2xlYXInLFxuICAgIH0pKSxcbiAgICBhY2Nlc3MsXG4gICAgZW52ZWxvcGUsXG4gIH07XG59XG5cbiIsICIvLyBNMDAyIHN0YWdlIDM6IGJvdW5kZWQsIGF1dGhvcml6ZWQgdGVycmFpbiBwcmVwYXJhdGlvbi5cbi8vXG4vLyBUaGUgcGlwZWxpbmUgaXMgZGVsaWJlcmF0ZWx5IG9uZS13YXkgYW5kIHNoYXJlZCBieSB0aGUgcGxheWVyIGFuZCB0aGUgQUk6XG4vL1xuLy8gICBwcm9wb3NhbCAtPiB2YWxpZGF0ZVNpdGUgLT4gcGxhblByZXBhcmF0aW9uIC0+IEF1dGhvcml6ZXIgLT4gZXhlY3V0ZVxuLy9cbi8vIGBleGVjdXRlUHJlcGFyYXRpb25gIGlzIHRoZSBvbmx5IGZ1bmN0aW9uIGluIE0wMDIgdGhhdCBlZGl0cyB0ZXJyYWluIGZvclxuLy8gY29uc3RydWN0aW9uLiBJdCByZWZ1c2VzIHRvIHJ1biB3aXRob3V0IGFuIGF1dGhvcml6YXRpb24gdG9rZW4gd2hvc2UgZGlnZXN0XG4vLyBtYXRjaGVzIHRoZSBwbGFuLCB3aG9zZSBlbnZlbG9wZSBjb3ZlcnMgZXZlcnkgdm94ZWwgaXQgd291bGQgdG91Y2gsIGFuZCB3aG9zZVxuLy8gYmFzZSByZXZpc2lvbiBzdGlsbCBtYXRjaGVzIHRoZSB3b3JsZC4gQWxsIGVkaXRzIGFyZSBjb21wdXRlZCBhbmQgY2hlY2tlZFxuLy8gYmVmb3JlIHRoZSBmaXJzdCBieXRlIGlzIHdyaXR0ZW4sIHNvIGEgcmVqZWN0ZWQgcGxhbiBjYW5ub3QgbGVhdmUgYSBwYXJ0aWFsXG4vLyBwYWQgYmVoaW5kLlxuLy9cbi8vIFRoZSBhdXRob3JpemVyIGluIHRoaXMgZmlsZSBpcyBhIGxvY2FsIHBvbGljeSBzdHViLiBJdCBwcm92ZXMgdGhhdCB0aGVcbi8vIHBpcGVsaW5lIGFuZCB0aGUgZW52ZWxvcGUgY2hlY2tzIGV4aXN0OyBpdCBpcyBOT1QgTWFnaWNCbG9jayBlbmZvcmNlbWVudC5cbi8vIE5vIGNoYWluIHByb2dyYW0sIFNESyBjYWxsLCBzZXR0bGVtZW50IG9yIHJvbGxiYWNrIGd1YXJhbnRlZSBpcyBwcmVzZW50LlxuaW1wb3J0IHtcbiAgV29ybGQsIE1BVCwgTWF0SWQsIFlfTUlOLCBZX01BWCwgSEFMRiwgaXNTb2xpZCxcbiAgZ2V0Vm94ZWwsIHNldFZveGVsLCByZW1vdmVFbnRpdHksIHN1cmZhY2VBdCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIEVudGl0eUtpbmQsIFJlc291cmNlVHlwZSxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBSZWN0LCBWb3hlbFJlZ2lvbiwgbm9ybWFsaXplUmVjdCwgcmVjdENvbHVtbnMsIGV4cGFuZFJlY3QsXG4gIGVudmVsb3BlQ29udGFpbnMsIG9ic3RydWN0aW9uc0luLFxufSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgU2l0ZVByb3Bvc2FsLCBTaXRlVmFsaWRhdGlvbiwgQnVpbGRpbmdSdWxlcywgdmFsaWRhdGVTaXRlLFxufSBmcm9tICcuL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBpbnZlbnRvcnlTbmFwc2hvdCwgbm9ybWFsaXplRW52ZWxvcGUsXG59IGZyb20gJy4vY2Fub25pY2FsJztcblxuZXhwb3J0IGNvbnN0IExPQ0FMX0FVVEhPUklUWSA9ICdsb2NhbC1zdHViJyBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBMT0NBTF9FTkZPUkNFTUVOVCA9ICdsb2NhbC1zaW11bGF0aW9uLW9ubHknIGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbHVtblRhcmdldCB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGxhbkV4cGVjdGF0aW9uIHtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgb2JzdHJ1Y3Rpb25zOiBudW1iZXI7XG4gIHN1cmZhY2VFZGl0czogbnVtYmVyO1xuICB0b3RhbEVkaXRzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25QbGFuIHtcbiAgaWQ6IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbiAgLyoqIEV4YWN0bHkgb25lIHRhcmdldCB3YWxraW5nIGhlaWdodCBwZXIgZm9vdHByaW50IGNvbHVtbiwgc29ydGVkIGJ5IHosIHguICovXG4gIHRhcmdldHM6IENvbHVtblRhcmdldFtdO1xuICAvKiogQXV0aG9yaXRhdGl2ZSBlbnRpdHkgaWRzIHRoaXMgcGxhbiBtYXkgcmVtb3ZlLiAqL1xuICBjbGVhckVudGl0eUlkczogc3RyaW5nW107XG4gIC8qKiBNYXRlcmlhbCBmb3IgdGhlIHRvcCBzb2xpZCB2b3hlbCBhZnRlciBncmFkaW5nLCBvciBudWxsIHRvIGtlZXAgaXQuICovXG4gIHN1cmZhY2VNYXRlcmlhbDogTWF0SWQgfCBudWxsO1xuICAvKiogVGlnaHQgZW52ZWxvcGUgY292ZXJpbmcgZXZlcnkgcGxhbm5lZCB2b3hlbCBjaGFuZ2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBleHBlY3RlZDogUGxhbkV4cGVjdGF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uT3B0aW9ucyB7XG4gIC8qKiBQZXItY29sdW1uIHRhcmdldHMgZm9yIHRlcnJhY2VzIG9yIHN0ZXBwZWQgcGF0aHMuIERlZmF1bHRzIHRvIGZsb29yWS4gKi9cbiAgdGFyZ2V0cz86IENvbHVtblRhcmdldFtdO1xuICAvKiogYG5vbmVgIGlzIG9ubHkgbGVnYWwgd2hlbiB0aGUgc2l0ZSBoYXMgbm8gb2JzdHJ1Y3Rpb25zLiAqL1xuICBjbGVhcj86ICdvYnN0cnVjdGlvbnMnIHwgJ25vbmUnO1xuICAvKiogU2V0IHRoZSB0b3Agc29saWQgdm94ZWwgb2YgZXZlcnkgdGFyZ2V0IGNvbHVtbiAocGF0aHMsIGZpZWxkcykuICovXG4gIHN1cmZhY2VNYXRlcmlhbD86IE1hdElkO1xuICAvKiogRXhwbGljaXQgd29yayBlbnZlbG9wZS4gRGVmYXVsdHMgdG8gYSB0aWdodCBlbnZlbG9wZSBhcm91bmQgdGhlIGVkaXRzLiAqL1xuICBlbnZlbG9wZT86IFZveGVsUmVnaW9uW107XG59XG5cbi8vIC0tLS0tLS0tLS0gc3RhYmxlIGRpZ2VzdCAtLS0tLS0tLS0tXG5mdW5jdGlvbiBkaWdlc3QoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBhID0gMHg4MTFjOWRjNTtcbiAgbGV0IGIgPSAweDllMzc3OWI5O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYyA9IGlucHV0LmNoYXJDb2RlQXQoaSk7XG4gICAgYSA9IE1hdGguaW11bChhIF4gYywgMHgwMTAwMDE5Myk7XG4gICAgYiA9IE1hdGguaW11bChiIF4gKGMgKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgYiBePSBiID4+PiAxMztcbiAgfVxuICByZXR1cm4gKGEgPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpXG4gICAgKyAoYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG59XG5cbi8qKiBEaWdlc3Qgb2YgZXZlcnl0aGluZyB0aGF0IGNoYW5nZXMgdGhlIHNldCBvZiBlZGl0cyBvciByZW1vdmFscy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFuRGlnZXN0KHBsYW46IFByZXBhcmF0aW9uUGxhbik6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtcbiAgICAnbTAwMjpwcmVwLXBsYW46djEnLFxuICAgIHBsYW4uc2l0ZUlkLFxuICAgIGAke3BsYW4ucmVjdC54MH0sJHtwbGFuLnJlY3QuejB9LCR7cGxhbi5yZWN0LngxfSwke3BsYW4ucmVjdC56MX1gLFxuICAgIFN0cmluZyhwbGFuLmZsb29yWSksXG4gICAgcGxhbi5ydWxlcy5pZCxcbiAgICBTdHJpbmcocGxhbi50YXJnZXRzLmxlbmd0aCksXG4gICAgcGxhbi5zdXJmYWNlTWF0ZXJpYWwgPT09IG51bGwgPyAnc3VyZmFjZTprZWVwJyA6IGBzdXJmYWNlOiR7cGxhbi5zdXJmYWNlTWF0ZXJpYWx9YCxcbiAgXTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykgbGluZXMucHVzaChgdDoke3QueH0sJHt0Lnp9LCR7dC55fWApO1xuICBjb25zdCBjbGVhcnMgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICBsaW5lcy5wdXNoKGBjOiR7Y2xlYXJzLmxlbmd0aH1gKTtcbiAgZm9yIChjb25zdCBpZCBvZiBjbGVhcnMpIGxpbmVzLnB1c2goYGM6JHtpZH1gKTtcbiAgZm9yIChjb25zdCBlIG9mIG5vcm1hbGl6ZUVudmVsb3BlKHBsYW4uZW52ZWxvcGUpKSB7XG4gICAgbGluZXMucHVzaChgZToke2UueDB9LCR7ZS56MH0sJHtlLnkwfSwke2UueDF9LCR7ZS56MX0sJHtlLnkxfWApO1xuICB9XG4gIGNvbnN0IHggPSBwbGFuLmV4cGVjdGVkO1xuICBsaW5lcy5wdXNoKGB4OiR7eC5jdXRWb2x1bWV9LCR7eC5maWxsVm9sdW1lfSwke3gubWF4Q3V0fSwke3gubWF4RmlsbH0sJHt4Lm9ic3RydWN0aW9uc30sJHt4LnN1cmZhY2VFZGl0c30sJHt4LnRvdGFsRWRpdHN9YCk7XG4gIHJldHVybiBkaWdlc3QobGluZXMuam9pbignXFxuJykpO1xufVxuXG4vLyAtLS0tLS0tLS0tIHBsYW5uaW5nIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgUGxhblN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogUHJlcGFyYXRpb25QbGFuO1xuICB2YWxpZGF0aW9uOiBTaXRlVmFsaWRhdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvbkZhaWx1cmUge1xuICBvazogZmFsc2U7XG4gIHN0YWdlOiAncGxhbicgfCAnYXV0aG9yaXplJyB8ICdleGVjdXRlJztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbiAgdmFsaWRhdGlvbj86IFNpdGVWYWxpZGF0aW9uO1xufVxuXG5leHBvcnQgdHlwZSBQbGFuUmVzdWx0ID0gUGxhblN1Y2Nlc3MgfCBQcmVwYXJhdGlvbkZhaWx1cmU7XG5cbmZ1bmN0aW9uIGRlZmF1bHRUYXJnZXRzKHdvcmxkOiBXb3JsZCwgcmVjdDogUmVjdCwgZmxvb3JZOiBudW1iZXIpOiBDb2x1bW5UYXJnZXRbXSB7XG4gIGNvbnN0IG91dDogQ29sdW1uVGFyZ2V0W10gPSBbXTtcbiAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSBvdXQucHVzaCh7IHgsIHosIHk6IGZsb29yWSB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBzb3J0ZWRUYXJnZXRzKHRhcmdldHM6IHJlYWRvbmx5IENvbHVtblRhcmdldFtdKTogQ29sdW1uVGFyZ2V0W10ge1xuICByZXR1cm4gWy4uLnRhcmdldHNdLnNvcnQoKGEsIGIpID0+IGEueiAtIGIueiB8fCBhLnggLSBiLnggfHwgYS55IC0gYi55KTtcbn1cblxuaW50ZXJmYWNlIFRhcmdldFN0YXRzIHtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgcmVsaWVmOiBudW1iZXI7XG59XG5cbi8qKiBDdXQvZmlsbCBpbXBsaWVkIGJ5IGV4cGxpY2l0IHRhcmdldHMsIGluZGVwZW5kZW50IG9mIHRoZSBmbGF0IGZsb29yWS4gKi9cbmZ1bmN0aW9uIHRhcmdldFN0YXRzKHdvcmxkOiBXb3JsZCwgdGFyZ2V0czogcmVhZG9ubHkgQ29sdW1uVGFyZ2V0W10pOiBUYXJnZXRTdGF0cyB7XG4gIGxldCBjdXRWb2x1bWUgPSAwLCBmaWxsVm9sdW1lID0gMCwgbWF4Q3V0ID0gMCwgbWF4RmlsbCA9IDA7XG4gIGxldCBtaW5ZID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhZID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgc3VyZmFjZSwgdC55KTtcbiAgICBtYXhZID0gTWF0aC5tYXgobWF4WSwgc3VyZmFjZSwgdC55KTtcbiAgICBpZiAoc3VyZmFjZSA+IHQueSkge1xuICAgICAgY29uc3QgZCA9IHN1cmZhY2UgLSB0Lnk7XG4gICAgICBjdXRWb2x1bWUgKz0gZDtcbiAgICAgIG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZCk7XG4gICAgfSBlbHNlIGlmIChzdXJmYWNlIDwgdC55KSB7XG4gICAgICBjb25zdCBkID0gdC55IC0gc3VyZmFjZTtcbiAgICAgIGZpbGxWb2x1bWUgKz0gZDtcbiAgICAgIG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCBkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgY3V0Vm9sdW1lLCBmaWxsVm9sdW1lLCBtYXhDdXQsIG1heEZpbGwsIHJlbGllZjogbWF4WSAtIG1pblkgfTtcbn1cblxuZnVuY3Rpb24gdGFyZ2V0UnVsZVJlYXNvbnMoc3RhdHM6IFRhcmdldFN0YXRzLCBydWxlczogQnVpbGRpbmdSdWxlcyk6IHN0cmluZ1tdIHtcbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKHN0YXRzLnJlbGllZiA+IHJ1bGVzLm1heFJlbGllZlByZXBhcmVkKSB7XG4gICAgcmVhc29ucy5wdXNoKGByZWxpZWYgJHtzdGF0cy5yZWxpZWZ9IG0gZXhjZWVkcyB0aGUgJHtydWxlcy5tYXhSZWxpZWZQcmVwYXJlZH0gbSBwcmVwYXJlZCBsaW1pdGApO1xuICB9XG4gIGlmIChzdGF0cy5tYXhDdXQgPiBydWxlcy5tYXhDdXQpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCAke3N0YXRzLm1heEN1dH0gbSBleGNlZWRzICR7cnVsZXMubWF4Q3V0fSBtYCk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEZpbGwgPiBydWxlcy5tYXhGaWxsKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsICR7c3RhdHMubWF4RmlsbH0gbSBleGNlZWRzICR7cnVsZXMubWF4RmlsbH0gbWApO1xuICB9XG4gIGlmIChzdGF0cy5jdXRWb2x1bWUgPiBydWxlcy5tYXhDdXRWb2x1bWUpIHtcbiAgICByZWFzb25zLnB1c2goYGN1dCB2b2x1bWUgJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEN1dFZvbHVtZX0gbVx1MDBCM2ApO1xuICB9XG4gIGlmIChzdGF0cy5maWxsVm9sdW1lID4gcnVsZXMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCB2b2x1bWUgJHtzdGF0cy5maWxsVm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsVm9sdW1lfSBtXHUwMEIzYCk7XG4gIH1cbiAgcmV0dXJuIHJlYXNvbnM7XG59XG5cbi8qKlxuICogVHVybiBhIHByb3Bvc2FsIGludG8gYW4gZXhwbGljaXQsIGNoZWNrYWJsZSBwbGFuLiBSZWFkLW9ubHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFuUHJlcGFyYXRpb24oXG4gIHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFNpdGVQcm9wb3NhbCwgb3B0aW9uczogUHJlcGFyYXRpb25PcHRpb25zID0ge30sXG4pOiBQbGFuUmVzdWx0IHtcbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHZhbGlkYXRpb24gPSB2YWxpZGF0ZVNpdGUod29ybGQsIHByb3Bvc2FsKTtcblxuICBpZiAodmFsaWRhdGlvbi5zdGF0ZSA9PT0gJ2ludmFsaWQnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAnc2l0ZV9pbnZhbGlkJyxcbiAgICAgIHJlYXNvbnM6IHZhbGlkYXRpb24ucmVhc29ucy5tYXAoKHIpID0+IGAke3IuY29kZX06ICR7ci5tZXNzYWdlfWApLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgdGFyZ2V0cyA9IHNvcnRlZFRhcmdldHMob3B0aW9ucy50YXJnZXRzID8/IGRlZmF1bHRUYXJnZXRzKHdvcmxkLCByZWN0LCBwcm9wb3NhbC5mbG9vclkpKTtcbiAgY29uc3QgY29sdW1ucyA9IHJlY3RDb2x1bW5zKHJlY3QpO1xuICBpZiAodGFyZ2V0cy5sZW5ndGggIT09IGNvbHVtbnMpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICd0YXJnZXRfY291bnQnLFxuICAgICAgcmVhc29uczogW2BwbGFuIGhhcyAke3RhcmdldHMubGVuZ3RofSB0YXJnZXRzIGZvciAke2NvbHVtbnN9IGNvbHVtbnNgXSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBrZXkgPSBgJHt0Lnh9LCR7dC56fWA7XG4gICAgaWYgKHNlZW4uaGFzKGtleSkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ2R1cGxpY2F0ZV90YXJnZXQnLFxuICAgICAgICByZWFzb25zOiBbYGR1cGxpY2F0ZSB0YXJnZXQgYXQgJHtrZXl9YF0sIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgICBzZWVuLmFkZChrZXkpO1xuICAgIGlmICh0LnggPCByZWN0LngwIHx8IHQueCA+IHJlY3QueDEgfHwgdC56IDwgcmVjdC56MCB8fCB0LnogPiByZWN0LnoxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICd0YXJnZXRfb3V0c2lkZV9mb290cHJpbnQnLFxuICAgICAgICByZWFzb25zOiBbYHRhcmdldCAke2tleX0gaXMgb3V0c2lkZSAke3JlY3QueDB9LCR7cmVjdC56MH0uLiR7cmVjdC54MX0sJHtyZWN0LnoxfWBdLFxuICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHQueSkgfHwgdC55IDwgWV9NSU4gfHwgdC55ID49IFlfTUFYKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsIHN0YWdlOiAncGxhbicsIGNvZGU6ICd0YXJnZXRfaGVpZ2h0JyxcbiAgICAgICAgcmVhc29uczogW2B0YXJnZXQgJHtrZXl9IGhhcyBpbnZhbGlkIGhlaWdodCAke3QueX1gXSwgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcztcbiAgY29uc3QgY2xlYXIgPSBvcHRpb25zLmNsZWFyID8/ICdvYnN0cnVjdGlvbnMnO1xuICBpZiAoY2xlYXIgPT09ICdub25lJyAmJiBvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3VuY2xlYXJlZF9vYnN0cnVjdGlvbnMnLFxuICAgICAgcmVhc29uczogW2Ake29ic3RydWN0aW9ucy5sZW5ndGh9IG9ic3RydWN0aW9ucyB3b3VsZCByZW1haW5gXSxcbiAgICAgIHZhbGlkYXRpb24sXG4gICAgfTtcbiAgfVxuICBjb25zdCBjbGVhckVudGl0eUlkcyA9IGNsZWFyID09PSAnbm9uZScgPyBbXSA6IFsuLi5uZXcgU2V0KG9ic3RydWN0aW9ucyldLnNvcnQoKTtcbiAgY29uc3Qgc3VyZmFjZU1hdGVyaWFsID0gb3B0aW9ucy5zdXJmYWNlTWF0ZXJpYWwgPz8gbnVsbDtcblxuICBjb25zdCBjdXN0b21UYXJnZXRzID0gb3B0aW9ucy50YXJnZXRzICE9PSB1bmRlZmluZWQ7XG4gIGNvbnN0IHN0YXRzID0gY3VzdG9tVGFyZ2V0c1xuICAgID8gdGFyZ2V0U3RhdHMod29ybGQsIHRhcmdldHMpXG4gICAgOiB7XG4gICAgICBjdXRWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5maWxsVm9sdW1lLFxuICAgICAgbWF4Q3V0OiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ubWF4RmlsbCxcbiAgICAgIHJlbGllZjogdmFsaWRhdGlvbi5xdWVyeS5zdGF0cy5yZWxpZWYsXG4gICAgfTtcbiAgaWYgKGN1c3RvbVRhcmdldHMpIHtcbiAgICBjb25zdCByZWFzb25zID0gdGFyZ2V0UnVsZVJlYXNvbnMoc3RhdHMsIHByb3Bvc2FsLnJ1bGVzKTtcbiAgICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsXG4gICAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICAgIGNvZGU6ICd0YXJnZXRfcnVsZXMnLFxuICAgICAgICByZWFzb25zLFxuICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBsZXQgbG8gPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gIGxldCBoaSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgbG8gPSBNYXRoLm1pbihsbywgc3VyZmFjZSwgdC55KTtcbiAgICBoaSA9IE1hdGgubWF4KGhpLCBzdXJmYWNlIC0gMSwgdC55IC0gMSk7XG4gIH1cbiAgY29uc3QgYnVmZmVyZWQgPSBleHBhbmRSZWN0KHJlY3QsIDEpO1xuICBjb25zdCBkZXJpdmVkOiBWb3hlbFJlZ2lvbiA9IHtcbiAgICB4MDogTWF0aC5tYXgoLUhBTEYsIGJ1ZmZlcmVkLngwKSxcbiAgICB6MDogTWF0aC5tYXgoLUhBTEYsIGJ1ZmZlcmVkLnowKSxcbiAgICB4MTogTWF0aC5taW4oSEFMRiAtIDEsIGJ1ZmZlcmVkLngxKSxcbiAgICB6MTogTWF0aC5taW4oSEFMRiAtIDEsIGJ1ZmZlcmVkLnoxKSxcbiAgICB5MDogTWF0aC5tYXgoWV9NSU4sIGxvIC0gMSksXG4gICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgaGkgKyAxKSxcbiAgfTtcbiAgLy8gQW4gZXhwbGljaXQgZW52ZWxvcGUgcmVwbGFjZXMgdGhlIGRlcml2ZWQgb25lLiBDYWxsZXJzIHRoYXQgcGluIGFuIGV4YWN0XG4gIC8vIHdvcmsgZW52ZWxvcGUgKHBhdGggcHJlcGFyYXRpb24pIG11c3Qgbm90IHNpbGVudGx5IHdpZGVuIGl0IHdpdGggdGhlXG4gIC8vIGRlZmF1bHQgMSBtIGJ1ZmZlci5cbiAgY29uc3QgZW52ZWxvcGUgPSBub3JtYWxpemVFbnZlbG9wZShvcHRpb25zLmVudmVsb3BlID8/IFtkZXJpdmVkXSk7XG4gIGNvbnN0IHN1cmZhY2VFZGl0cyA9IHN1cmZhY2VNYXRlcmlhbCA9PT0gbnVsbCA/IDAgOiB0YXJnZXRzLmxlbmd0aDtcblxuICBjb25zdCBwbGFuOiBQcmVwYXJhdGlvblBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgcnVsZXM6IHByb3Bvc2FsLnJ1bGVzLFxuICAgIHRhcmdldHMsXG4gICAgY2xlYXJFbnRpdHlJZHMsXG4gICAgc3VyZmFjZU1hdGVyaWFsLFxuICAgIGVudmVsb3BlLFxuICAgIGV4cGVjdGVkOiB7XG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgICBvYnN0cnVjdGlvbnM6IGNsZWFyRW50aXR5SWRzLmxlbmd0aCxcbiAgICAgIHN1cmZhY2VFZGl0cyxcbiAgICAgIHRvdGFsRWRpdHM6IHN0YXRzLmN1dFZvbHVtZSArIHN0YXRzLmZpbGxWb2x1bWUgKyBzdXJmYWNlRWRpdHMsXG4gICAgfSxcbiAgfTtcbiAgcGxhbi5pZCA9IGBwcmVwOiR7cGxhbkRpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiwgdmFsaWRhdGlvbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGF1dGhvcml6YXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBBdXRob3JpemF0aW9uTGltaXRzIHtcbiAgbWF4Q3V0Vm9sdW1lOiBudW1iZXI7XG4gIG1heEZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Vm94ZWxFZGl0czogbnVtYmVyO1xuICBtYXhFbnRpdHlSZW1vdmFsczogbnVtYmVyO1xuICBtYXhUYXJnZXRzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0xJTUlUUzogQXV0aG9yaXphdGlvbkxpbWl0cyA9IHtcbiAgbWF4Q3V0Vm9sdW1lOiAyNTYsXG4gIG1heEZpbGxWb2x1bWU6IDI1NixcbiAgbWF4Vm94ZWxFZGl0czogMTAyNCxcbiAgbWF4RW50aXR5UmVtb3ZhbHM6IDE2LFxuICBtYXhUYXJnZXRzOiA1MTIsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmtBdXRob3JpemF0aW9uIHtcbiAgaWQ6IHN0cmluZztcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xuICBiYXNlUmV2aXNpb246IG51bWJlcjtcbiAgbGltaXRzOiBBdXRob3JpemF0aW9uTGltaXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25EZWNpc2lvbiB7XG4gIG9rOiBib29sZWFuO1xuICBhdXRob3JpemF0aW9uOiBXb3JrQXV0aG9yaXphdGlvbiB8IG51bGw7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25Qb2xpY3kge1xuICAvKiogVGhlIG9ubHkgcmVnaW9ucyB0aGlzIGdvdmVybm9yIHBlcm1pdHMgZm9yIHRoZSBmaXJzdCBzbGljZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGxpbWl0cz86IFBhcnRpYWw8QXV0aG9yaXphdGlvbkxpbWl0cz47XG59XG5cbmZ1bmN0aW9uIHJlZ2lvbkNvbnRhaW5lZChyZWdpb246IFZveGVsUmVnaW9uLCBwb2xpY3k6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBib29sZWFuIHtcbiAgcmV0dXJuIHBvbGljeS5zb21lKChwKSA9PiByZWdpb24ueDAgPj0gcC54MCAmJiByZWdpb24ueDEgPD0gcC54MVxuICAgICYmIHJlZ2lvbi56MCA+PSBwLnowICYmIHJlZ2lvbi56MSA8PSBwLnoxXG4gICAgJiYgcmVnaW9uLnkwID49IHAueTAgJiYgcmVnaW9uLnkxIDw9IHAueTEpO1xufVxuXG4vKipcbiAqIExvY2FsIGdvdmVybm9yIHN0dWIuIEl0IGVuZm9yY2VzIGEgZml4ZWQgZW52ZWxvcGUgYW5kIGhhcmQgdm9sdW1lIGxpbWl0cyxcbiAqIGJpbmRzIGEgdG9rZW4gdG8gdGhlIGV4YWN0IHBsYW4gZGlnZXN0IGFuZCB3b3JsZCByZXZpc2lvbiwgYW5kIHJlZnVzZXMgdG9cbiAqIHByZXRlbmQgaXQgaXMgYW4gb24tY2hhaW4gYXV0aG9yaXR5LlxuICovXG5leHBvcnQgY2xhc3MgTG9jYWxBdXRob3JpemVyIHtcbiAgcmVhZG9ubHkgYXV0aG9yaXR5ID0gTE9DQUxfQVVUSE9SSVRZO1xuICByZWFkb25seSBlbmZvcmNlbWVudCA9IExPQ0FMX0VORk9SQ0VNRU5UO1xuICByZWFkb25seSBsaW1pdHM6IEF1dGhvcml6YXRpb25MaW1pdHM7XG5cbiAgY29uc3RydWN0b3IocmVhZG9ubHkgcG9saWN5OiBBdXRob3JpemF0aW9uUG9saWN5KSB7XG4gICAgdGhpcy5saW1pdHMgPSB7IC4uLkRFRkFVTFRfTElNSVRTLCAuLi4ocG9saWN5LmxpbWl0cyA/PyB7fSkgfTtcbiAgfVxuXG4gIGF1dGhvcml6ZSh3b3JsZDogV29ybGQsIHBsYW46IFByZXBhcmF0aW9uUGxhbik6IEF1dGhvcml6YXRpb25EZWNpc2lvbiB7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwbGFuLnJlY3QpO1xuXG4gICAgaWYgKHBsYW4udGFyZ2V0cy5sZW5ndGggIT09IHJlY3RDb2x1bW5zKHJlY3QpKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW4gaGFzICR7cGxhbi50YXJnZXRzLmxlbmd0aH0gdGFyZ2V0cyBmb3IgJHtyZWN0Q29sdW1ucyhyZWN0KX0gY29sdW1uc2ApO1xuICAgIH1cbiAgICBpZiAocGxhbi50YXJnZXRzLmxlbmd0aCA+IHRoaXMubGltaXRzLm1heFRhcmdldHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLnRhcmdldHMubGVuZ3RofSB0YXJnZXRzIGV4Y2VlZCBsaW1pdCAke3RoaXMubGltaXRzLm1heFRhcmdldHN9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLmN1dFZvbHVtZSA+IHRoaXMubGltaXRzLm1heEN1dFZvbHVtZSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBjdXQgJHtwbGFuLmV4cGVjdGVkLmN1dFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heEN1dFZvbHVtZX1gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQuZmlsbFZvbHVtZSA+IHRoaXMubGltaXRzLm1heEZpbGxWb2x1bWUpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZmlsbCAke3BsYW4uZXhwZWN0ZWQuZmlsbFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke3RoaXMubGltaXRzLm1heEZpbGxWb2x1bWV9YCk7XG4gICAgfVxuICAgIGlmIChwbGFuLmV4cGVjdGVkLnRvdGFsRWRpdHMgPiB0aGlzLmxpbWl0cy5tYXhWb3hlbEVkaXRzKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW5uZWQgZWRpdHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4Vm94ZWxFZGl0c31gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aH0gcmVtb3ZhbHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHN9YCk7XG4gICAgfVxuICAgIGlmIChuZXcgU2V0KHBsYW4uY2xlYXJFbnRpdHlJZHMpLnNpemUgIT09IHBsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RoKSB7XG4gICAgICByZWFzb25zLnB1c2goJ2R1cGxpY2F0ZSBlbnRpdHkgcmVtb3ZhbCBpZHMnKTtcbiAgICB9XG5cbiAgICBpZiAocGxhbi5lbnZlbG9wZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gd29yayBlbnZlbG9wZScpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHJlZ2lvbiBvZiBwbGFuLmVudmVsb3BlKSB7XG4gICAgICBpZiAoIXJlZ2lvbkNvbnRhaW5lZChyZWdpb24sIHRoaXMucG9saWN5LmVudmVsb3BlKSkge1xuICAgICAgICByZWFzb25zLnB1c2goYGVudmVsb3BlICR7cmVnaW9uLngwfSwke3JlZ2lvbi56MH0sJHtyZWdpb24ueTB9Li4ke3JlZ2lvbi54MX0sJHtyZWdpb24uejF9LCR7cmVnaW9uLnkxfSBpcyBvdXRzaWRlIHRoZSBsb2NhbCBwb2xpY3lgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykge1xuICAgICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHQueCwgdC55LCB0LnopXG4gICAgICAgIHx8ICh0LnkgPiBZX01JTiAmJiAhZW52ZWxvcGVDb250YWlucyhwbGFuLmVudmVsb3BlLCB0LngsIHQueSAtIDEsIHQueikpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgdGFyZ2V0ICR7dC54fSwke3Quen0sJHt0Lnl9IGlzIG5vdCBjb3ZlcmVkIGJ5IHRoZSB3b3JrIGVudmVsb3BlYCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gRXZlcnkgb2JzdHJ1Y3Rpb24gY3VycmVudGx5IG9uIHRoZSBmb290cHJpbnQgbXVzdCBiZSBpbiB0aGUgcGxhbiwgYW5kXG4gICAgLy8gdGhlIHBsYW4gbWF5IG5vdCByZW1vdmUgYW55dGhpbmcgdGhhdCBpcyBub3QgYW4gb2JzdHJ1Y3Rpb24gdGhlcmUuXG4gICAgY29uc3QgY3VycmVudCA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KS5tYXAoKG8pID0+IG8uZW50aXR5SWQpLnNvcnQoKTtcbiAgICBjb25zdCBwbGFubmVkID0gWy4uLnBsYW4uY2xlYXJFbnRpdHlJZHNdLnNvcnQoKTtcbiAgICBpZiAoY3VycmVudC5sZW5ndGggIT09IHBsYW5uZWQubGVuZ3RoIHx8IGN1cnJlbnQuc29tZSgoaWQsIGkpID0+IGlkICE9PSBwbGFubmVkW2ldKSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBwbGFuIHJlbW92YWxzIFske3BsYW5uZWQuam9pbignLCcpfV0gZG8gbm90IG1hdGNoIGZvb3RwcmludCBvYnN0cnVjdGlvbnMgWyR7Y3VycmVudC5qb2luKCcsJyl9XWApO1xuICAgIH1cblxuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiB7IG9rOiBmYWxzZSwgYXV0aG9yaXphdGlvbjogbnVsbCwgcmVhc29ucyB9O1xuXG4gICAgY29uc3QgdG9rZW46IFdvcmtBdXRob3JpemF0aW9uID0ge1xuICAgICAgaWQ6IGBsb2NhbC1zdHViOiR7cGxhbkRpZ2VzdChwbGFuKX1gLFxuICAgICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgICBwbGFuRGlnZXN0OiBwbGFuRGlnZXN0KHBsYW4pLFxuICAgICAgZW52ZWxvcGU6IG5vcm1hbGl6ZUVudmVsb3BlKHBsYW4uZW52ZWxvcGUpLFxuICAgICAgYmFzZVJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICAgIGxpbWl0czogeyAuLi50aGlzLmxpbWl0cyB9LFxuICAgIH07XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIGF1dGhvcml6YXRpb246IHRva2VuLCByZWFzb25zOiBbXSB9O1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gZXhlY3V0aW9uIC0tLS0tLS0tLS1cbmludGVyZmFjZSBQZW5kaW5nRWRpdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGJlZm9yZTogTWF0SWQ7XG4gIGFmdGVyOiBNYXRJZDtcbiAgLyoqIFRydWUgZm9yIGEgbWF0ZXJpYWwtb25seSB0b3Atc3VyZmFjZSBjaGFuZ2UuICovXG4gIHN1cmZhY2U/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENodW5rRGVsdGEge1xuICBjaHVuazogc3RyaW5nO1xuICBjaGFuZ2VkOiBudW1iZXI7XG4gIGFkZGVkOiBudW1iZXI7XG4gIHJlbW92ZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDbGVhcmVkRW50aXR5IHtcbiAgZW50aXR5SWQ6IHN0cmluZztcbiAga2luZDogRW50aXR5S2luZDtcbiAgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGw7XG4gIGFtb3VudDogbnVtYmVyO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uTGVkZ2VyIHtcbiAgYXV0aG9yaXR5OiB0eXBlb2YgTE9DQUxfQVVUSE9SSVRZO1xuICBlbmZvcmNlbWVudDogdHlwZW9mIExPQ0FMX0VORk9SQ0VNRU5UO1xuICBhdXRob3JpemF0aW9uSWQ6IHN0cmluZztcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG5ldFNwb2lsOiBudW1iZXI7XG4gIGJvcnJvd2VkRmlsbDogbnVtYmVyO1xuICBjdXRCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBmaWxsQnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgdm94ZWxFZGl0czogbnVtYmVyO1xuICBzdXJmYWNlRWRpdHM6IG51bWJlcjtcbiAgZW50aXRpZXNDbGVhcmVkOiBDbGVhcmVkRW50aXR5W107XG4gIHJlc291cmNlc0dhaW5lZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgaW52ZW50b3J5QmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBpbnZlbnRvcnlBZnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgY2h1bmtEZWx0YXM6IENodW5rRGVsdGFbXTtcbiAgcmV2aXNpb25CZWZvcmU6IG51bWJlcjtcbiAgcmV2aXNpb25BZnRlcjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBQcmVwYXJhdGlvblBsYW47XG4gIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uO1xuICBsZWRnZXI6IFByZXBhcmF0aW9uTGVkZ2VyO1xufVxuXG5leHBvcnQgdHlwZSBQcmVwYXJhdGlvbk91dGNvbWUgPSBQcmVwYXJhdGlvblN1Y2Nlc3MgfCBQcmVwYXJhdGlvbkZhaWx1cmU7XG5cbmNvbnN0IE1BVEVSSUFMX05BTUVTOiBSZWNvcmQ8bnVtYmVyLCBzdHJpbmc+ID0ge1xuICBbTUFULkdSQVNTXTogJ2dyYXNzJyxcbiAgW01BVC5TT0lMXTogJ3NvaWwnLFxuICBbTUFULlNBTkRdOiAnc2FuZCcsXG4gIFtNQVQuR1JBVkVMXTogJ2dyYXZlbCcsXG4gIFtNQVQuU1RPTkVdOiAnc3RvbmUnLFxuICBbTUFULk9SRV06ICdvcmUnLFxuICBbTUFULldBVEVSXTogJ3dhdGVyJyxcbiAgW01BVC5CRURST0NLXTogJ2JlZHJvY2snLFxuICBbTUFULk1PU1NdOiAnbW9zcycsXG59O1xuXG5mdW5jdGlvbiBtYXRlcmlhbE5hbWUobTogTWF0SWQpOiBzdHJpbmcge1xuICByZXR1cm4gTUFURVJJQUxfTkFNRVNbbV0gPz8gYG1hdF8ke219YDtcbn1cblxuZnVuY3Rpb24gZmlsbE1hdGVyaWFsKHk6IG51bWJlciwgdGFyZ2V0OiBudW1iZXIpOiBNYXRJZCB7XG4gIHJldHVybiB5ID09PSB0YXJnZXQgLSAxID8gTUFULkdSQVNTIDogTUFULlNPSUw7XG59XG5cbmZ1bmN0aW9uIGZhaWwoc3RhZ2U6IFByZXBhcmF0aW9uRmFpbHVyZVsnc3RhZ2UnXSwgY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IFByZXBhcmF0aW9uRmFpbHVyZSB7XG4gIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhZ2UsIGNvZGUsIHJlYXNvbnMgfTtcbn1cblxuLyoqXG4gKiBBcHBseSBhbiBhdXRob3JpemVkIHBsYW4uIE5vIHZveGVsIGlzIHdyaXR0ZW4gdW50aWwgZXZlcnkgZWRpdCBhbmQgcmVtb3ZhbFxuICogaGFzIGJlZW4gY2hlY2tlZCBhZ2FpbnN0IHRoZSB0b2tlbiwgdGhlIHBsYW4gZW52ZWxvcGUgYW5kIHRoZSBoYXJkIGxpbWl0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4ZWN1dGVQcmVwYXJhdGlvbihcbiAgd29ybGQ6IFdvcmxkLCBwbGFuOiBQcmVwYXJhdGlvblBsYW4sIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uLFxuKTogUHJlcGFyYXRpb25PdXRjb21lIHtcbiAgaWYgKGF1dGhvcml6YXRpb24uYXV0aG9yaXR5ICE9PSBMT0NBTF9BVVRIT1JJVFlcbiAgICB8fCBhdXRob3JpemF0aW9uLmVuZm9yY2VtZW50ICE9PSBMT0NBTF9FTkZPUkNFTUVOVCkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3Vuc3VwcG9ydGVkX2F1dGhvcml0eScsIFtcbiAgICAgIGBhdXRob3JpdHkgJHthdXRob3JpemF0aW9uLmF1dGhvcml0eX0vJHthdXRob3JpemF0aW9uLmVuZm9yY2VtZW50fSBpcyBub3QgdGhlIGxvY2FsIHN0dWJgLFxuICAgIF0pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QgIT09IHBsYW5EaWdlc3QocGxhbikpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdkaWdlc3RfbWlzbWF0Y2gnLCBbJ2F1dGhvcml6YXRpb24gZG9lcyBub3QgbWF0Y2ggdGhpcyBwbGFuJ10pO1xuICB9XG4gIGlmIChhdXRob3JpemF0aW9uLmJhc2VSZXZpc2lvbiAhPT0gd29ybGQucmV2aXNpb24pIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdzdGFsZV9hdXRob3JpemF0aW9uJywgW1xuICAgICAgYGF1dGhvcml6YXRpb24gd2FzIGlzc3VlZCBhdCByZXZpc2lvbiAke2F1dGhvcml6YXRpb24uYmFzZVJldmlzaW9ufSwgd29ybGQgaXMgYXQgJHt3b3JsZC5yZXZpc2lvbn1gLFxuICAgIF0pO1xuICB9XG4gIGlmIChwbGFuLmVudmVsb3BlLnNvbWUoKHIpID0+ICFyZWdpb25Db250YWluZWQociwgYXV0aG9yaXphdGlvbi5lbnZlbG9wZSkpKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZW52ZWxvcGVfbWlzbWF0Y2gnLCBbJ3BsYW4gZW52ZWxvcGUgaXMgd2lkZXIgdGhhbiB0aGUgYXV0aG9yaXphdGlvbiddKTtcbiAgfVxuXG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHBsYW4ucmVjdCk7XG4gIGNvbnN0IGVkaXRzOiBQZW5kaW5nRWRpdFtdID0gW107XG4gIGZvciAoY29uc3QgdCBvZiBwbGFuLnRhcmdldHMpIHtcbiAgICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB0LngsIHQueik7XG4gICAgaWYgKHQueSA8IHN1cmZhY2UpIHtcbiAgICAgIGZvciAobGV0IHkgPSB0Lnk7IHkgPCBzdXJmYWNlOyB5KyspIHtcbiAgICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgeSwgdC56KTtcbiAgICAgICAgaWYgKGlzU29saWQoYmVmb3JlKSkgZWRpdHMucHVzaCh7IHg6IHQueCwgeSwgejogdC56LCBiZWZvcmUsIGFmdGVyOiBNQVQuQUlSIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodC55ID4gc3VyZmFjZSkge1xuICAgICAgZm9yIChsZXQgeSA9IHN1cmZhY2U7IHkgPCB0Lnk7IHkrKykge1xuICAgICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB5LCB0LnopO1xuICAgICAgICBpZiAoIWlzU29saWQoYmVmb3JlKSkge1xuICAgICAgICAgIGNvbnN0IGFmdGVyID0gcGxhbi5zdXJmYWNlTWF0ZXJpYWwgIT09IG51bGwgJiYgeSA9PT0gdC55IC0gMVxuICAgICAgICAgICAgPyBwbGFuLnN1cmZhY2VNYXRlcmlhbFxuICAgICAgICAgICAgOiBmaWxsTWF0ZXJpYWwoeSwgdC55KTtcbiAgICAgICAgICBlZGl0cy5wdXNoKHsgeDogdC54LCB5LCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXIgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gTWF0ZXJpYWwtb25seSBzdXJmYWNlIGNoYW5nZSBmb3IgY3V0IG9yIGFscmVhZHktbGV2ZWwgY29sdW1ucy4gRmlsbFxuICAgIC8vIGNvbHVtbnMgYWxyZWFkeSByZWNlaXZlIHRoZSBzdXJmYWNlIG1hdGVyaWFsIGluIHRoZSBmaWxsIGxvb3AgYWJvdmUuXG4gICAgaWYgKHBsYW4uc3VyZmFjZU1hdGVyaWFsICE9PSBudWxsKSB7XG4gICAgICBjb25zdCB0b3BZID0gdC55IC0gMTtcbiAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHRvcFksIHQueik7XG4gICAgICBpZiAoaXNTb2xpZChiZWZvcmUpICYmIGJlZm9yZSAhPT0gcGxhbi5zdXJmYWNlTWF0ZXJpYWwpIHtcbiAgICAgICAgZWRpdHMucHVzaCh7XG4gICAgICAgICAgeDogdC54LCB5OiB0b3BZLCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXI6IHBsYW4uc3VyZmFjZU1hdGVyaWFsLCBzdXJmYWNlOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBDaGVjayBldmVyeSBlZGl0IGJlZm9yZSBtdXRhdGluZyBhbnl0aGluZy5cbiAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBlIG9mIGVkaXRzKSB7XG4gICAgaWYgKGUueCA8IHJlY3QueDAgfHwgZS54ID4gcmVjdC54MSB8fCBlLnogPCByZWN0LnowIHx8IGUueiA+IHJlY3QuejEpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZWRpdCAke2UueH0sJHtlLnl9LCR7ZS56fSBpcyBvdXRzaWRlIHRoZSBmb290cHJpbnRgKTtcbiAgICB9XG4gICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKGF1dGhvcml6YXRpb24uZW52ZWxvcGUsIGUueCwgZS55LCBlLnopKSB7XG4gICAgICByZWFzb25zLnB1c2goYGVkaXQgJHtlLnh9LCR7ZS55fSwke2Uuen0gaXMgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZWApO1xuICAgIH1cbiAgfVxuICBjb25zdCBjdXRWb2x1bWUgPSBlZGl0cy5maWx0ZXIoKGUpID0+IGUuYWZ0ZXIgPT09IE1BVC5BSVIgJiYgaXNTb2xpZChlLmJlZm9yZSkpLmxlbmd0aDtcbiAgY29uc3QgZmlsbFZvbHVtZSA9IGVkaXRzLmZpbHRlcigoZSkgPT4gZS5hZnRlciAhPT0gTUFULkFJUiAmJiAhaXNTb2xpZChlLmJlZm9yZSkpLmxlbmd0aDtcbiAgaWYgKGN1dFZvbHVtZSA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0ICR7Y3V0Vm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4Q3V0Vm9sdW1lfWApO1xuICB9XG4gIGlmIChmaWxsVm9sdW1lID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4RmlsbFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgZmlsbCAke2ZpbGxWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhGaWxsVm9sdW1lfWApO1xuICB9XG4gIGlmIChlZGl0cy5sZW5ndGggPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhWb3hlbEVkaXRzKSB7XG4gICAgcmVhc29ucy5wdXNoKGAke2VkaXRzLmxlbmd0aH0gZWRpdHMgZXhjZWVkIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4Vm94ZWxFZGl0c31gKTtcbiAgfVxuXG4gIGNvbnN0IGN1cnJlbnQgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCkubWFwKChvKSA9PiBvLmVudGl0eUlkKS5zb3J0KCk7XG4gIGNvbnN0IHBsYW5uZWQgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICBpZiAoY3VycmVudC5sZW5ndGggIT09IHBsYW5uZWQubGVuZ3RoIHx8IGN1cnJlbnQuc29tZSgoaWQsIGkpID0+IGlkICE9PSBwbGFubmVkW2ldKSkge1xuICAgIHJlYXNvbnMucHVzaCgnZm9vdHByaW50IG9ic3RydWN0aW9ucyBjaGFuZ2VkIGFmdGVyIGF1dGhvcml6YXRpb24nKTtcbiAgfVxuICBpZiAocGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGggPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFscykge1xuICAgIHJlYXNvbnMucHVzaChgJHtwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aH0gcmVtb3ZhbHMgZXhjZWVkIGxpbWl0ICR7YXV0aG9yaXphdGlvbi5saW1pdHMubWF4RW50aXR5UmVtb3ZhbHN9YCk7XG4gIH1cbiAgZm9yIChjb25zdCBpZCBvZiBwbGFuLmNsZWFyRW50aXR5SWRzKSB7XG4gICAgaWYgKCF3b3JsZC5lbnRpdGllcy5oYXMoaWQpKSByZWFzb25zLnB1c2goYGVudGl0eSAke2lkfSBubyBsb25nZXIgZXhpc3RzYCk7XG4gIH1cbiAgaWYgKHdvcmxkLmxpZmUpIHtcbiAgICBsZXQgcmVjb3ZlcmVkID0gMDtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIHBsYW4uY2xlYXJFbnRpdHlJZHMpIHtcbiAgICAgIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoZW50aXR5Py5yZXNvdXJjZSAmJiBlbnRpdHkucmVtYWluaW5nID4gMCkgcmVjb3ZlcmVkICs9IGVudGl0eS5yZW1haW5pbmc7XG4gICAgfVxuICAgIC8vIENoZWNrIGJlZm9yZSBhbnkgdm94ZWwgb3IgZW50aXR5IGNoYW5nZXMsIHByZXNlcnZpbmcgbGVnYWN5IHVuYm91bmRlZFxuICAgIC8vIGNvbnN0cnVjdGlvbiBiZWhhdmlvciBhbmQgc2NoZW1hLTMgY2FycmllZC1jYXBhY2l0eSBjb25zZXJ2YXRpb24uXG4gICAgaWYgKE9iamVjdC52YWx1ZXMod29ybGQuaW52ZW50b3J5KS5yZWR1Y2UoKHN1bSwgYW1vdW50KSA9PiBzdW0gKyBhbW91bnQsIDApICsgcmVjb3ZlcmVkID4gMTIwKSB7XG4gICAgICByZWFzb25zLnB1c2goJ3Jlc291cmNlcyByZWNvdmVyZWQgZHVyaW5nIHNpdGUgY2xlYXJpbmcgd291bGQgZXhjZWVkIGNhcnJpZWQgY2FwYWNpdHkgMTIwJyk7XG4gICAgfVxuICB9XG4gIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3VuYXV0aG9yaXplZF9lZGl0cycsIHJlYXNvbnMpO1xuXG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgcmV2aXNpb25CZWZvcmUgPSB3b3JsZC5yZXZpc2lvbjtcbiAgY29uc3QgY2h1bmtEZWx0YXMgPSBuZXcgTWFwPHN0cmluZywgQ2h1bmtEZWx0YT4oKTtcbiAgY29uc3QgY3V0QnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBjb25zdCBmaWxsQnlNYXRlcmlhbDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBsZXQgYXBwbGllZCA9IDA7XG4gIGxldCBzdXJmYWNlRWRpdHMgPSAwO1xuXG4gIGZvciAoY29uc3QgZSBvZiBlZGl0cykge1xuICAgIGlmICghc2V0Vm94ZWwod29ybGQsIGUueCwgZS55LCBlLnosIGUuYWZ0ZXIpKSBjb250aW51ZTtcbiAgICBhcHBsaWVkKys7XG4gICAgaWYgKGUuc3VyZmFjZSkgc3VyZmFjZUVkaXRzKys7XG4gICAgY29uc3Qga2V5ID0gY2h1bmtLZXkod29ybGRUb0NodW5rWChlLngpLCB3b3JsZFRvQ2h1bmtaKGUueikpO1xuICAgIGxldCBkZWx0YSA9IGNodW5rRGVsdGFzLmdldChrZXkpO1xuICAgIGlmICghZGVsdGEpIHtcbiAgICAgIGRlbHRhID0geyBjaHVuazoga2V5LCBjaGFuZ2VkOiAwLCBhZGRlZDogMCwgcmVtb3ZlZDogMCB9O1xuICAgICAgY2h1bmtEZWx0YXMuc2V0KGtleSwgZGVsdGEpO1xuICAgIH1cbiAgICBkZWx0YS5jaGFuZ2VkKys7XG4gICAgY29uc3Qgd2FzU29saWQgPSBpc1NvbGlkKGUuYmVmb3JlKTtcbiAgICBjb25zdCBpc05vd1NvbGlkID0gaXNTb2xpZChlLmFmdGVyKTtcbiAgICBpZiAoIXdhc1NvbGlkICYmIGlzTm93U29saWQpIGRlbHRhLmFkZGVkKys7XG4gICAgaWYgKHdhc1NvbGlkICYmICFpc05vd1NvbGlkKSBkZWx0YS5yZW1vdmVkKys7XG4gICAgY29uc3QgbmFtZSA9IG1hdGVyaWFsTmFtZShlLmJlZm9yZSk7XG4gICAgaWYgKHdhc1NvbGlkICYmICFpc05vd1NvbGlkKSBjdXRCeU1hdGVyaWFsW25hbWVdID0gKGN1dEJ5TWF0ZXJpYWxbbmFtZV0gPz8gMCkgKyAxO1xuICAgIGlmICghd2FzU29saWQgJiYgaXNOb3dTb2xpZCkgZmlsbEJ5TWF0ZXJpYWxbbWF0ZXJpYWxOYW1lKGUuYWZ0ZXIpXSA9IChmaWxsQnlNYXRlcmlhbFttYXRlcmlhbE5hbWUoZS5hZnRlcildID8/IDApICsgMTtcbiAgfVxuXG4gIGNvbnN0IGVudGl0aWVzQ2xlYXJlZDogQ2xlYXJlZEVudGl0eVtdID0gW107XG4gIGNvbnN0IHJlc291cmNlc0dhaW5lZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHt9O1xuICBmb3IgKGNvbnN0IGlkIG9mIFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCkpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoIWUpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGFtb3VudCA9IGUucmVzb3VyY2UgJiYgZS5yZW1haW5pbmcgPiAwID8gZS5yZW1haW5pbmcgOiAwO1xuICAgIGlmIChlLnJlc291cmNlICYmIGFtb3VudCA+IDApIHtcbiAgICAgIHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA9ICh3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gICAgICByZXNvdXJjZXNHYWluZWRbZS5yZXNvdXJjZV0gPSAocmVzb3VyY2VzR2FpbmVkW2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgIH1cbiAgICByZW1vdmVFbnRpdHkod29ybGQsIGlkKTtcbiAgICBlbnRpdGllc0NsZWFyZWQucHVzaCh7XG4gICAgICBlbnRpdHlJZDogaWQsIGtpbmQ6IGUua2luZCwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCwgeDogZS54LCB5OiBlLnksIHo6IGUueixcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IGN1dCA9IGFwcGxpZWQgPiAwID8gT2JqZWN0LnZhbHVlcyhjdXRCeU1hdGVyaWFsKS5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSA6IDA7XG4gIGNvbnN0IGZpbGwgPSBhcHBsaWVkID4gMCA/IE9iamVjdC52YWx1ZXMoZmlsbEJ5TWF0ZXJpYWwpLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIDogMDtcbiAgY29uc3QgbGVkZ2VyOiBQcmVwYXJhdGlvbkxlZGdlciA9IHtcbiAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgYXV0aG9yaXphdGlvbklkOiBhdXRob3JpemF0aW9uLmlkLFxuICAgIHBsYW5EaWdlc3Q6IGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCxcbiAgICBzaXRlSWQ6IHBsYW4uc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwbGFuLmZsb29yWSxcbiAgICBjdXRWb2x1bWU6IGN1dCxcbiAgICBmaWxsVm9sdW1lOiBmaWxsLFxuICAgIG5ldFNwb2lsOiBjdXQgLSBmaWxsLFxuICAgIGJvcnJvd2VkRmlsbDogTWF0aC5tYXgoMCwgZmlsbCAtIGN1dCksXG4gICAgY3V0QnlNYXRlcmlhbCxcbiAgICBmaWxsQnlNYXRlcmlhbCxcbiAgICB2b3hlbEVkaXRzOiBhcHBsaWVkLFxuICAgIHN1cmZhY2VFZGl0cyxcbiAgICBlbnRpdGllc0NsZWFyZWQsXG4gICAgcmVzb3VyY2VzR2FpbmVkLFxuICAgIGludmVudG9yeUJlZm9yZSxcbiAgICBpbnZlbnRvcnlBZnRlcjogaW52ZW50b3J5U25hcHNob3Qod29ybGQpLFxuICAgIGNodW5rRGVsdGFzOiBbLi4uY2h1bmtEZWx0YXMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEuY2h1bmsubG9jYWxlQ29tcGFyZShiLmNodW5rKSksXG4gICAgcmV2aXNpb25CZWZvcmUsXG4gICAgcmV2aXNpb25BZnRlcjogd29ybGQucmV2aXNpb24sXG4gIH07XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCBhdXRob3JpemF0aW9uLCBsZWRnZXIgfTtcbn1cblxuLyoqXG4gKiBUaGUgc2hhcmVkIHBsYXllci9BSSBlbnRyeSBwb2ludC4gVGhlcmUgaXMgbm8gb3RoZXIgY29uc3RydWN0aW9uIHBhdGguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlU2l0ZShcbiAgd29ybGQ6IFdvcmxkLFxuICBhdXRob3JpemVyOiBMb2NhbEF1dGhvcml6ZXIsXG4gIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsXG4gIG9wdGlvbnM6IFByZXBhcmF0aW9uT3B0aW9ucyA9IHt9LFxuKTogUHJlcGFyYXRpb25PdXRjb21lIHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwsIG9wdGlvbnMpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBkZWNpc2lvbiA9IGF1dGhvcml6ZXIuYXV0aG9yaXplKHdvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBpZiAoIWRlY2lzaW9uLm9rIHx8ICFkZWNpc2lvbi5hdXRob3JpemF0aW9uKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2F1dGhvcml6ZScsICdub3RfYXV0aG9yaXplZCcsIGRlY2lzaW9uLnJlYXNvbnMpO1xuICB9XG4gIHJldHVybiBleGVjdXRlUHJlcGFyYXRpb24od29ybGQsIHBsYW5uZWQucGxhbiwgZGVjaXNpb24uYXV0aG9yaXphdGlvbik7XG59XG4iLCAiLy8gTTAwMiBzdGFnZSA0OiBhdXRob3JpdGF0aXZlIGhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlIHN0cnVjdHVyZXMuXG4vL1xuLy8gU3RydWN0dXJlcyBhcmUgc2ltdWxhdGlvbiByZWNvcmRzLCBub3QgcmVuZGVyZXItb25seSBtZXNoZXMuIEEgc3RydWN0dXJlIGlzXG4vLyBwbGFubmVkIGZyb20gdGhlIHByZXBhcmVkIHRlcnJhaW4sIGF1dGhvcml6ZWQgYWdhaW5zdCB0aGUgc2FtZSBsb2NhbCBwb2xpY3lcbi8vIGVudmVsb3BlIGFzIHRlcnJhaW4gcHJlcGFyYXRpb24sIHBhaWQgZm9yIGZyb20gaW52ZW50b3J5LCBhbmQgdGhlbiBzdG9yZWQgaW5cbi8vIFdvcmxkLnN0cnVjdHVyZXMuIFRoZSByZW5kZXJlciByZWFkcyB0aG9zZSByZWNvcmRzOyBpdCBuZXZlciBpbnZlbnRzIGFcbi8vIGJ1aWxkaW5nIHRoYXQgdGhlIHNpbXVsYXRpb24gZG9lcyBub3Qgb3duLlxuaW1wb3J0IHtcbiAgV29ybGQsIFJlc291cmNlVHlwZSwgTUFULCBzdXJmYWNlQXQsIGdldFZveGVsLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBub3JtYWxpemVSZWN0LCBleHBhbmRSZWN0LFxuICBlbnZlbG9wZUNvbnRhaW5zLCBvYnN0cnVjdGlvbnNJbixcbn0gZnJvbSAnLi90ZXJyYWluJztcbmltcG9ydCB7XG4gIEF1dGhvcml6YXRpb25Qb2xpY3ksIExPQ0FMX0FVVEhPUklUWSwgTE9DQUxfRU5GT1JDRU1FTlQsXG59IGZyb20gJy4vcHJlcGFyYXRpb24nO1xuaW1wb3J0IHsgRkFSTV9SVUxFUyB9IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7IGludmVudG9yeVNuYXBzaG90IH0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgdHlwZSBTdHJ1Y3R1cmVLaW5kID0gJ2hvdXNlJyB8ICdwYXRoJyB8ICd0ZXJyYWNlJztcbi8qKiBNMDAyIGRlc2lnbiAxIGlzIGltbXV0YWJsZSByZXBsYXkgY29udGVudDsgZGVzaWduIDIgaXMgdGhlIGZvdW5kZXIgY2FuZGlkYXRlLiAqL1xuZXhwb3J0IGNvbnN0IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gPSAyIGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgU3RydWN0dXJlRGVzaWduVmVyc2lvbiA9IHR5cGVvZiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuXG5leHBvcnQgdHlwZSBNb2R1bGVLaW5kID1cbiAgfCAnZmxvb3InXG4gIHwgJ3dhbGwnXG4gIHwgJ3Bvc3QnXG4gIHwgJ2xpbnRlbCdcbiAgfCAncm9vZidcbiAgfCAncGFyYXBldCdcbiAgfCAnd2luZG93J1xuICB8ICdkb29yJ1xuICB8ICd0aHJlc2hvbGQnXG4gIHwgJ3BhdGgnXG4gIHwgJ2N1cmInXG4gIHwgJ3NvaWxfYmVkJ1xuICB8ICdyZXRhaW5pbmdfd2FsbCdcbiAgfCAnY3JvcF9yb3cnO1xuXG5leHBvcnQgdHlwZSBNb2R1bGVUb25lID1cbiAgfCAnc3RvbmUnXG4gIHwgJ3N0b25lX2InXG4gIHwgJ29jaHJlJ1xuICB8ICd0aW1iZXInXG4gIHwgJ2FjY2VudCdcbiAgfCAnc29pbCdcbiAgfCAnY3JvcCdcbiAgfCAnZ3JhdmVsJztcblxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVNb2R1bGUge1xuICBraW5kOiBNb2R1bGVLaW5kO1xuICAvKiogQ2VudHJlIGluIHdvcmxkIHgveiwgYm90dG9tIGluIHdvcmxkIHkuICovXG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHc6IG51bWJlcjtcbiAgaDogbnVtYmVyO1xuICBkOiBudW1iZXI7XG4gIHJvdD86IG51bWJlcjtcbiAgdG9uZT86IE1vZHVsZVRvbmU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIC8qKiBPcmlnaW46IGNlbnRyZSBvZiB0aGUgcHJlcGFyZWQgZm9vdHByaW50IGF0IGZsb29yIGhlaWdodC4gKi9cbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdO1xuICBjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBidWlsdFJldmlzaW9uOiBudW1iZXI7XG4gIC8qKiBBYnNlbnQgbWVhbnMgbGVnYWN5IE0wMDIgZGVzaWduIDE7IG5ldmVyIGluZmVyIGl0IGZyb20gdGhlIHJlbmRlcmVyLiAqL1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbiAgcHJvdmlzaW9uYWw6IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFjZUJhbmQge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUHJvcG9zYWwge1xuICBzaXRlSWQ6IHN0cmluZztcbiAga2luZDogU3RydWN0dXJlS2luZDtcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIC8qKiBSZXF1aXJlZCBmb3IgaG91c2VzOiB2b3hlbCBjb2x1bW4gb2YgdGhlIGRvb3Igb24gdGhlIGVhc3Qgd2FsbC4gKi9cbiAgZG9vcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgLyoqIE9wdGlvbmFsIHBhdGggbWV0YWRhdGE7IHRoZSBwYXRoIGlzIGxhaWQgYWxvbmcgdGhlIHJlY3QgY2VudHJlbGluZS4gKi9cbiAgYXBwcm9hY2g/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHRlcnJhY2VzPzogbnVtYmVyO1xuICAvKiogRGVsaWJlcmF0ZSBjb250ZW50IHNlbGVjdGlvbiBjYXJyaWVkIGJ5IHNjaGVtYS0yIGNvbW1hbmRzLiAqL1xuICBkZXNpZ25WZXJzaW9uPzogU3RydWN0dXJlRGVzaWduVmVyc2lvbjtcbn1cblxuLyoqXG4gKiBTaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciBzdHJ1Y3R1cmUgY29zdHMuIFRoZSBwbGFubmVycyBhbmQgdGhlIGJ1aWxkIFVJXG4gKiBib3RoIHJlYWQgdGhlc2U7IGEgYnVpbGRpbmcgY2Fubm90IGFkdmVydGlzZSBvbmUgcHJpY2UgYW5kIGNoYXJnZSBhbm90aGVyLlxuICovXG5leHBvcnQgY29uc3QgSE9VU0VfQ09TVDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHsgd29vZDogMTAsIHN0b25lOiAxOCB9O1xuZXhwb3J0IGNvbnN0IFRFUlJBQ0VfQ09TVDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PiA9IHsgd29vZDogNiwgc3RvbmU6IDEyIH07XG5cbi8qKiBBIHBhdGggcGF5cyBvbmUgc3RvbmUgcGVyIG1ldHJlIG9mIGNvcnJpZG9yIHdpZHRoLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhdGhDb3N0KHdpZHRoOiBudW1iZXIpOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+IHtcbiAgcmV0dXJuIHsgc3RvbmU6IHdpZHRoIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VyZmFjZVNhbXBsZSB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlUGxhbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgb3JpZ2luOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgcm90OiBudW1iZXI7XG4gIG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdO1xuICBjb3N0OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgLyoqIEV4cGVjdGVkIHByZXBhcmVkIHN1cmZhY2UsIGNoZWNrZWQgYWdhaW4gYXQgZXhlY3V0aW9uIHRpbWUuICovXG4gIHN1cmZhY2U6IFN1cmZhY2VTYW1wbGVbXTtcbiAgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb247XG4gIHRlcnJhY2VzPzogVGVycmFjZUJhbmRbXTtcbn1cblxuLy8gLS0tLS0tLS0tLSBzdGFibGUgZGlnZXN0IC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGRpZ2VzdChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGEgPSAweDgxMWM5ZGM1O1xuICBsZXQgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaW5wdXQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gaW5wdXQuY2hhckNvZGVBdChpKTtcbiAgICBhID0gTWF0aC5pbXVsKGEgXiBjLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoYyArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICBiIF49IGIgPj4+IDEzO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cnVjdHVyZURpZ2VzdChwbGFuOiBTdHJ1Y3R1cmVQbGFuKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW1xuICAgICdtMDAyOnN0cnVjdHVyZS1wbGFuOnYxJyxcbiAgICBwbGFuLmtpbmQsXG4gICAgcGxhbi5zaXRlSWQsXG4gICAgYCR7cGxhbi5yZWN0LngwfSwke3BsYW4ucmVjdC56MH0sJHtwbGFuLnJlY3QueDF9LCR7cGxhbi5yZWN0LnoxfWAsXG4gICAgU3RyaW5nKHBsYW4uZmxvb3JZKSxcbiAgICBgJHtwbGFuLm9yaWdpbi54fSwke3BsYW4ub3JpZ2luLnl9LCR7cGxhbi5vcmlnaW4uen1gLFxuICAgIFN0cmluZyhwbGFuLnJvdCksXG4gICAgLi4uKHBsYW4uZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTiA/IFsnZGVzaWduOjInXSA6IFtdKSxcbiAgICBgbToke3BsYW4ubW9kdWxlcy5sZW5ndGh9YCxcbiAgXTtcbiAgZm9yIChjb25zdCBtIG9mIHBsYW4ubW9kdWxlcykge1xuICAgIGxpbmVzLnB1c2goYG06JHttLmtpbmR9LCR7bS54fSwke20ueX0sJHttLnp9LCR7bS53fSwke20uaH0sJHttLmR9LCR7bS5yb3QgPz8gMH0sJHttLnRvbmUgPz8gJyd9YCk7XG4gIH1cbiAgY29uc3QgY29zdEtleXMgPSBPYmplY3Qua2V5cyhwbGFuLmNvc3QpLnNvcnQoKTtcbiAgbGluZXMucHVzaChgY29zdDoke2Nvc3RLZXlzLmxlbmd0aH1gKTtcbiAgZm9yIChjb25zdCBrZXkgb2YgY29zdEtleXMpIGxpbmVzLnB1c2goYGNvc3Q6JHtrZXl9LCR7cGxhbi5jb3N0W2tleSBhcyBSZXNvdXJjZVR5cGVdID8/IDB9YCk7XG4gIGZvciAoY29uc3QgcyBvZiBwbGFuLnN1cmZhY2UpIGxpbmVzLnB1c2goYHM6JHtzLnh9LCR7cy56fSwke3MueX1gKTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGVycmFjZXMgPz8gW10pIGxpbmVzLnB1c2goYHQ6JHt0LnowfSwke3QuejF9LCR7dC55fWApO1xuICByZXR1cm4gZGlnZXN0KGxpbmVzLmpvaW4oJ1xcbicpKTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwbGFubmluZyBoZWxwZXJzIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgc3RhZ2U6ICdwbGFuJyB8ICdhdXRob3JpemUnIHwgJ2V4ZWN1dGUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVBsYW5TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFN0cnVjdHVyZVBsYW47XG59XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZVBsYW5SZXN1bHQgPSBTdHJ1Y3R1cmVQbGFuU3VjY2VzcyB8IFN0cnVjdHVyZUZhaWx1cmU7XG5cbmZ1bmN0aW9uIGZhaWwoc3RhZ2U6IFN0cnVjdHVyZUZhaWx1cmVbJ3N0YWdlJ10sIGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBTdHJ1Y3R1cmVGYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGFnZSwgY29kZSwgcmVhc29ucyB9O1xufVxuXG5mdW5jdGlvbiBzdXJmYWNlTWlzbWF0Y2hlcyh3b3JsZDogV29ybGQsIHNhbXBsZXM6IHJlYWRvbmx5IFN1cmZhY2VTYW1wbGVbXSkge1xuICBjb25zdCBvdXQ6IEFycmF5PHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IGV4cGVjdGVkOiBudW1iZXI7IGFjdHVhbDogbnVtYmVyIH0+ID0gW107XG4gIGZvciAoY29uc3QgcyBvZiBzYW1wbGVzKSB7XG4gICAgY29uc3QgYWN0dWFsID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKGFjdHVhbCAhPT0gcy55KSBvdXQucHVzaCh7IHg6IHMueCwgejogcy56LCBleHBlY3RlZDogcy55LCBhY3R1YWwgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gZm9vdHByaW50U3VyZmFjZSh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QsIHk6IG51bWJlcik6IFN1cmZhY2VTYW1wbGVbXSB7XG4gIGNvbnN0IG91dDogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGZvciAobGV0IHogPSByZWN0LnowOyB6IDw9IHJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgb3V0LnB1c2goeyB4LCB6LCB5IH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGZvb3RwcmludEVudmVsb3BlKHJlY3Q6IFJlY3QsIHkwOiBudW1iZXIsIHkxOiBudW1iZXIsIG1hcmdpbiA9IDEpOiBWb3hlbFJlZ2lvbltdIHtcbiAgY29uc3QgciA9IGV4cGFuZFJlY3QocmVjdCwgbWFyZ2luKTtcbiAgcmV0dXJuIFt7IC4uLnIsIHkwLCB5MSB9XTtcbn1cblxuZnVuY3Rpb24gbW9kdWxlQm91bmRzKG06IFN0cnVjdHVyZU1vZHVsZSk6IHsgeDA6IG51bWJlcjsgeDE6IG51bWJlcjsgeTA6IG51bWJlcjsgeTE6IG51bWJlcjsgejA6IG51bWJlcjsgejE6IG51bWJlciB9IHtcbiAgY29uc3QgciA9IE1hdGguaHlwb3QobS53LCBtLmQpIC8gMjtcbiAgY29uc3QgaGFsZlcgPSAobS5yb3QgPz8gMCkgPT09IDAgPyBtLncgLyAyIDogcjtcbiAgY29uc3QgaGFsZkQgPSAobS5yb3QgPz8gMCkgPT09IDAgPyBtLmQgLyAyIDogcjtcbiAgcmV0dXJuIHtcbiAgICB4MDogbS54IC0gaGFsZlcsIHgxOiBtLnggKyBoYWxmVyxcbiAgICB5MDogbS55LCB5MTogbS55ICsgbS5oLFxuICAgIHowOiBtLnogLSBoYWxmRCwgejE6IG0ueiArIGhhbGZELFxuICB9O1xufVxuXG5mdW5jdGlvbiBtb2R1bGVJbnNpZGVFbnZlbG9wZShtOiBTdHJ1Y3R1cmVNb2R1bGUsIGVudmVsb3BlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogYm9vbGVhbiB7XG4gIGNvbnN0IGIgPSBtb2R1bGVCb3VuZHMobSk7XG4gIHJldHVybiBlbnZlbG9wZS5zb21lKChlKSA9PiBiLngwID49IGUueDAgLSAxZS02ICYmIGIueDEgPD0gZS54MSArIDEgKyAxZS02XG4gICAgJiYgYi55MCA+PSBlLnkwIC0gMWUtNiAmJiBiLnkxIDw9IGUueTEgKyAxICsgMWUtNlxuICAgICYmIGIuejAgPj0gZS56MCAtIDFlLTYgJiYgYi56MSA8PSBlLnoxICsgMSArIDFlLTYpO1xufVxuXG5mdW5jdGlvbiBjb3N0VG90YWwoY29zdDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+Pik6IG51bWJlciB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKGNvc3QpLnJlZHVjZSgoYSwgYikgPT4gYSArIChiID8/IDApLCAwKTtcbn1cblxuZnVuY3Rpb24gbWVkaWFuKHZhbHVlczogbnVtYmVyW10pOiBudW1iZXIge1xuICBjb25zdCBzb3J0ZWQgPSBbLi4udmFsdWVzXS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG4gIHJldHVybiBzb3J0ZWRbTWF0aC5mbG9vcihzb3J0ZWQubGVuZ3RoIC8gMildO1xufVxuXG4vLyAtLS0tLS0tLS0tIGhvdXNlIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5Ib3VzZSh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3Qgd2lkdGggPSByZWN0LngxIC0gcmVjdC54MCArIDE7XG4gIGNvbnN0IGRlcHRoID0gcmVjdC56MSAtIHJlY3QuejAgKyAxO1xuICBpZiAod2lkdGggIT09IDggfHwgZGVwdGggIT09IDYpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYGhvdXNlIG5lZWRzIDggeCA2IG0sIGdvdCAke3dpZHRofSB4ICR7ZGVwdGh9IG1gXSk7XG4gIH1cbiAgaWYgKCFwcm9wb3NhbC5kb29yKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnbWlzc2luZ19kb29yJywgWydob3VzZSBwbGFuIG5lZWRzIGEgZG9vciBjb2x1bW4nXSk7XG4gIH1cbiAgaWYgKHByb3Bvc2FsLmRvb3IueiA8IHJlY3QuejAgfHwgcHJvcG9zYWwuZG9vci56ID4gcmVjdC56MSkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ2Rvb3Jfb3V0c2lkZScsIFtgZG9vciB6ICR7cHJvcG9zYWwuZG9vci56fSBpcyBvdXRzaWRlICR7cmVjdC56MH0uLiR7cmVjdC56MX1gXSk7XG4gIH1cblxuICBjb25zdCBzdXJmYWNlID0gZm9vdHByaW50U3VyZmFjZSh3b3JsZCwgcmVjdCwgcHJvcG9zYWwuZmxvb3JZKTtcbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBzdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfbm90X3ByZXBhcmVkJywgbWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3NpdGVfb2JzdHJ1Y3RlZCcsIG9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpKTtcbiAgfVxuXG4gIGNvbnN0IGZsb29yWSA9IHByb3Bvc2FsLmZsb29yWTtcbiAgY29uc3QgeDAgPSByZWN0LngwLCB4MSA9IHJlY3QueDEgKyAxO1xuICBjb25zdCB6MCA9IHJlY3QuejAsIHoxID0gcmVjdC56MSArIDE7XG4gIGNvbnN0IGN4ID0gKHgwICsgeDEpIC8gMjtcbiAgY29uc3QgY3ogPSAoejAgKyB6MSkgLyAyO1xuICBjb25zdCBkb29yWiA9IHByb3Bvc2FsLmRvb3IueiArIDAuNTtcbiAgY29uc3QgZG9vckhhbGYgPSAwLjY7XG4gIGNvbnN0IHdhbGxIID0gMy4wO1xuICBjb25zdCB3YWxsVCA9IDAuNTtcbiAgY29uc3QgZG9vckggPSAyLjI7XG4gIGNvbnN0IG1vZHVsZXM6IFN0cnVjdHVyZU1vZHVsZVtdID0gW107XG5cbiAgLy8gRmxvb3Igc2xhYiBhbmQgcm9vZiBwbGF0ZS5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2Zsb29yJywgeDogY3gsIHk6IGZsb29yWSwgejogY3osIHc6IDguMCwgaDogMC4zLCBkOiA2LjAsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3Jvb2YnLCB4OiBjeCwgeTogZmxvb3JZICsgd2FsbEgsIHo6IGN6LCB3OiA4LjQsIGg6IDAuMywgZDogNi40LCB0b25lOiAnc3RvbmUnIH0pO1xuXG4gIC8vIE5vcnRoIGFuZCBzb3V0aCB3YWxscy5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiBjeCwgeTogZmxvb3JZLCB6OiB6MCArIHdhbGxUIC8gMiwgdzogOC4wLCBoOiB3YWxsSCwgZDogd2FsbFQsIHRvbmU6ICdzdG9uZScgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICd3YWxsJywgeDogY3gsIHk6IGZsb29yWSwgejogejEgLSB3YWxsVCAvIDIsIHc6IDguMCwgaDogd2FsbEgsIGQ6IHdhbGxULCB0b25lOiAnc3RvbmUnIH0pO1xuXG4gIC8vIFdlc3Qgd2FsbC5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3dhbGwnLCB4OiB4MCArIHdhbGxUIC8gMiwgeTogZmxvb3JZLCB6OiBjeiwgdzogd2FsbFQsIGg6IHdhbGxILCBkOiA2LjAsIHRvbmU6ICdzdG9uZScgfSk7XG5cbiAgLy8gRWFzdCB3YWxsIHdpdGggYSByZWFsIGRvb3J3YXkgZ2FwLlxuICBjb25zdCBlYXN0WCA9IHgxIC0gd2FsbFQgLyAyO1xuICBjb25zdCBnYXAwID0gZG9vclogLSBkb29ySGFsZjtcbiAgY29uc3QgZ2FwMSA9IGRvb3JaICsgZG9vckhhbGY7XG4gIGNvbnN0IGxlZnRMZW4gPSBnYXAwIC0gejA7XG4gIGNvbnN0IHJpZ2h0TGVuID0gejEgLSBnYXAxO1xuICBpZiAobGVmdExlbiA+IDAuMDUpIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dhbGwnLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiB6MCArIGxlZnRMZW4gLyAyLFxuICAgICAgdzogd2FsbFQsIGg6IHdhbGxILCBkOiBsZWZ0TGVuLCB0b25lOiAnc3RvbmUnLFxuICAgIH0pO1xuICB9XG4gIGlmIChyaWdodExlbiA+IDAuMDUpIHtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3dhbGwnLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAxICsgcmlnaHRMZW4gLyAyLFxuICAgICAgdzogd2FsbFQsIGg6IHdhbGxILCBkOiByaWdodExlbiwgdG9uZTogJ3N0b25lJyxcbiAgICB9KTtcbiAgfVxuICBtb2R1bGVzLnB1c2goe1xuICAgIGtpbmQ6ICdsaW50ZWwnLCB4OiBlYXN0WCwgeTogZmxvb3JZICsgZG9vckgsIHo6IGRvb3JaLFxuICAgIHc6IHdhbGxULCBoOiB3YWxsSCAtIGRvb3JILCBkOiBkb29ySGFsZiAqIDIsIHRvbmU6ICdzdG9uZV9iJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2Rvb3InLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAwLFxuICAgIHc6IDAuMTgsIGg6IGRvb3JILCBkOiAwLjE2LCB0b25lOiAndGltYmVyJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ2Rvb3InLCB4OiBlYXN0WCwgeTogZmxvb3JZLCB6OiBnYXAxLFxuICAgIHc6IDAuMTgsIGg6IGRvb3JILCBkOiAwLjE2LCB0b25lOiAndGltYmVyJyxcbiAgfSk7XG4gIG1vZHVsZXMucHVzaCh7XG4gICAga2luZDogJ3RocmVzaG9sZCcsIHg6IHgxICsgMC4zNSwgeTogZmxvb3JZLCB6OiBkb29yWixcbiAgICB3OiAwLjksIGg6IDAuMTYsIGQ6IDEuMywgdG9uZTogJ29jaHJlJyxcbiAgfSk7XG5cbiAgLy8gVHdvIHdpbmRvd3Mgb24gdGhlIHNvdXRoIHdhbGwsIHNsaWdodGx5IHByb3VkIG9mIHRoZSBvdXRlciBmYWNlLlxuICBmb3IgKGNvbnN0IHd4IG9mIFtjeCAtIDIuMiwgY3ggKyAyLjJdKSB7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICd3aW5kb3cnLCB4OiB3eCwgeTogZmxvb3JZICsgMS40NSwgejogejEgLSAwLjAyLFxuICAgICAgdzogMS4wLCBoOiAxLjAsIGQ6IDAuMDgsIHRvbmU6ICdhY2NlbnQnLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gUGFyYXBldCBhcm91bmQgdGhlIGZsYXQgTm94ZWwgcm9vZi5cbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCwgeTogZmxvb3JZICsgd2FsbEggKyAwLjMsIHo6IGN6IC0gMy4wNSwgdzogOC40LCBoOiAwLjQsIGQ6IDAuMywgdG9uZTogJ3N0b25lX2InIH0pO1xuICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGFyYXBldCcsIHg6IGN4LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3ogKyAzLjA1LCB3OiA4LjQsIGg6IDAuNCwgZDogMC4zLCB0b25lOiAnc3RvbmVfYicgfSk7XG4gIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXJhcGV0JywgeDogY3ggLSA0LjA1LCB5OiBmbG9vclkgKyB3YWxsSCArIDAuMywgejogY3osIHc6IDAuMywgaDogMC40LCBkOiA2LjQsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgbW9kdWxlcy5wdXNoKHsga2luZDogJ3BhcmFwZXQnLCB4OiBjeCArIDQuMDUsIHk6IGZsb29yWSArIHdhbGxIICsgMC4zLCB6OiBjeiwgdzogMC4zLCBoOiAwLjQsIGQ6IDYuNCwgdG9uZTogJ3N0b25lX2InIH0pO1xuXG4gIGNvbnN0IHBsYW46IFN0cnVjdHVyZVBsYW4gPSB7XG4gICAgaWQ6ICcnLFxuICAgIGtpbmQ6ICdob3VzZScsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclksXG4gICAgb3JpZ2luOiB7IHg6IGN4LCB5OiBmbG9vclksIHo6IGN6IH0sXG4gICAgcm90OiAwLFxuICAgIG1vZHVsZXMsXG4gICAgY29zdDogeyAuLi5IT1VTRV9DT1NUIH0sXG4gICAgZW52ZWxvcGU6IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIGZsb29yWSwgZmxvb3JZICsgNCwgMiksXG4gICAgc3VyZmFjZSxcbiAgfTtcbiAgcGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbil9YDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBsYW4gfTtcbn1cblxuLy8gLS0tLS0tLS0tLSBwYXRoIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5QYXRoKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCB3aWR0aCA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZGVwdGggPSByZWN0LnoxIC0gcmVjdC56MCArIDE7XG4gIGlmIChkZXB0aCAhPT0gMyB8fCB3aWR0aCA8IDMpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYHBhdGggbmVlZHMgYSAzIG0gd2lkZSBjb3JyaWRvciwgZ290ICR7d2lkdGh9IHggJHtkZXB0aH0gbWBdKTtcbiAgfVxuXG4gIGNvbnN0IGNlbnRlclogPSByZWN0LnowICsgMTtcbiAgY29uc3Qgc3VyZmFjZTogU3VyZmFjZVNhbXBsZVtdID0gW107XG4gIGNvbnN0IGhlaWdodHM6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgIGNvbnN0IHkgPSBzdXJmYWNlQXQod29ybGQsIHgsIGNlbnRlclopO1xuICAgIGhlaWdodHMucHVzaCh5KTtcbiAgICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHN1cmZhY2UucHVzaCh7IHgsIHosIHkgfSk7XG4gIH1cbiAgY29uc3QgbWlzbWF0Y2hlcyA9IHN1cmZhY2VNaXNtYXRjaGVzKHdvcmxkLCBzdXJmYWNlKTtcbiAgaWYgKG1pc21hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfbm90X3ByZXBhcmVkJywgbWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBmb3IgKGxldCBpID0gMTsgaSA8IGhlaWdodHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzdGVwID0gaGVpZ2h0c1tpXSAtIGhlaWdodHNbaSAtIDFdO1xuICAgIGlmIChNYXRoLmFicyhzdGVwKSA+IDEpIHtcbiAgICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfc3RlcCcsIFtgc3RlcCAke3N0ZXB9IG0gYXQgeD0ke3JlY3QueDAgKyBpfWBdKTtcbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBzIG9mIHN1cmZhY2UpIHtcbiAgICBjb25zdCB0b3AgPSBnZXRWb3hlbCh3b3JsZCwgcy54LCBzLnkgLSAxLCBzLnopO1xuICAgIGlmICh0b3AgPT09IE1BVC5XQVRFUikge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF93ZXQnLCBbYGNvbHVtbiAke3MueH0sJHtzLnp9IGlzIHdldGBdKTtcbiAgICB9XG4gICAgaWYgKHRvcCAhPT0gTUFULkdSQVZFTCkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAncGF0aF9zdXJmYWNlJywgW1xuICAgICAgICBgY29sdW1uICR7cy54fSwke3Muen0gdG9wIGlzICR7dG9wfSwgZXhwZWN0ZWQgZ3JhdmVsYCxcbiAgICAgIF0pO1xuICAgIH1cbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcmVjdCk7XG4gIGlmIChvYnN0cnVjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiBmYWlsKCdwbGFuJywgJ3BhdGhfb2JzdHJ1Y3RlZCcsIG9ic3RydWN0aW9ucy5tYXAoKG8pID0+IG8uZW50aXR5SWQpKTtcbiAgfVxuXG4gIGNvbnN0IGN6ID0gY2VudGVyWiArIDAuNTtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgZm9yIChsZXQgeCA9IHJlY3QueDA7IHggPD0gcmVjdC54MTsgeCsrKSB7XG4gICAgY29uc3QgeSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgY2VudGVyWik7XG4gICAgY29uc3QgbXggPSB4ICsgMC41O1xuICAgIG1vZHVsZXMucHVzaCh7IGtpbmQ6ICdwYXRoJywgeDogbXgsIHksIHo6IGN6LCB3OiAxLjAsIGg6IDAuMTIsIGQ6IDMuMCwgdG9uZTogJ2dyYXZlbCcgfSk7XG4gICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2N1cmInLCB4OiBteCwgeSwgejogcmVjdC56MCArIDAuMDc1LCB3OiAxLjAsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAnY3VyYicsIHg6IG14LCB5LCB6OiByZWN0LnoxICsgMSAtIDAuMDc1LCB3OiAxLjAsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZV9iJyB9KTtcbiAgfVxuXG4gIGNvbnN0IG1pblkgPSBNYXRoLm1pbiguLi5oZWlnaHRzKTtcbiAgY29uc3QgbWF4WSA9IE1hdGgubWF4KC4uLmhlaWdodHMpO1xuICBjb25zdCBwbGFuOiBTdHJ1Y3R1cmVQbGFuID0ge1xuICAgIGlkOiAnJyxcbiAgICBraW5kOiAncGF0aCcsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBvcmlnaW46IHsgeDogKHJlY3QueDAgKyByZWN0LngxICsgMSkgLyAyLCB5OiBtaW5ZLCB6OiBjeiB9LFxuICAgIHJvdDogMCxcbiAgICBtb2R1bGVzLFxuICAgIGNvc3Q6IHBhdGhDb3N0KHdpZHRoKSxcbiAgICBlbnZlbG9wZTogZm9vdHByaW50RW52ZWxvcGUocmVjdCwgbWluWSAtIDEsIG1heFkgKyAyLCAwKSxcbiAgICBzdXJmYWNlLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHRlcnJhY2VzIC0tLS0tLS0tLS1cbmZ1bmN0aW9uIHBsYW5UZXJyYWNlcyh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3Qgd2lkdGggPSByZWN0LngxIC0gcmVjdC54MCArIDE7XG4gIGNvbnN0IGRlcHRoID0gcmVjdC56MSAtIHJlY3QuejAgKyAxO1xuICBjb25zdCBjb3VudCA9IHByb3Bvc2FsLnRlcnJhY2VzID8/IDM7XG4gIGlmICh3aWR0aCAhPT0gMTIgfHwgZGVwdGggIT09IDgpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICdmb290cHJpbnRfbWlzbWF0Y2gnLCBbYHRlcnJhY2VzIG5lZWQgMTIgeCA4IG0sIGdvdCAke3dpZHRofSB4ICR7ZGVwdGh9IG1gXSk7XG4gIH1cbiAgaWYgKGNvdW50IDwgMiB8fCBjb3VudCA+IDQpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd0ZXJyYWNlX2NvdW50JywgW2Ake2NvdW50fSB0ZXJyYWNlcyBpcyBvdXRzaWRlIDIuLjRgXSk7XG4gIH1cblxuICAvLyBTcGxpdCBkZXB0aCBpbnRvIG5lYXItZXF1YWwgYmFuZHMsIGhpZ2ggc2lkZSBmaXJzdC5cbiAgY29uc3QgYmFzZSA9IE1hdGguZmxvb3IoZGVwdGggLyBjb3VudCk7XG4gIGNvbnN0IGV4dHJhID0gZGVwdGggJSBjb3VudDtcbiAgY29uc3QgYmFuZHM6IFRlcnJhY2VCYW5kW10gPSBbXTtcbiAgbGV0IHogPSByZWN0LnowO1xuICBjb25zdCBtZWRpYW5zOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjb25zdCBzaXplID0gYmFzZSArIChpIDwgZXh0cmEgPyAxIDogMCk7XG4gICAgY29uc3QgejAgPSB6LCB6MSA9IHogKyBzaXplIC0gMTtcbiAgICBjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG4gICAgZm9yIChsZXQgYnogPSB6MDsgYnogPD0gejE7IGJ6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykgdmFsdWVzLnB1c2goc3VyZmFjZUF0KHdvcmxkLCB4LCBieikpO1xuICAgIH1cbiAgICBtZWRpYW5zLnB1c2gobWVkaWFuKHZhbHVlcykpO1xuICAgIGJhbmRzLnB1c2goeyB6MCwgejEsIHk6IDAgfSk7XG4gICAgeiA9IHoxICsgMTtcbiAgfVxuICAvLyBFYWNoIHRlcnJhY2Ugc2l0cyBleGFjdGx5IG9uZSBtZXRyZSBiZWxvdyB0aGUgcHJldmlvdXMgb25lLlxuICBmb3IgKGxldCBpID0gMDsgaSA8IGJhbmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgYmFuZHNbaV0ueSA9IGkgPT09IDAgPyBtZWRpYW5zWzBdIDogTWF0aC5taW4obWVkaWFuc1tpXSwgYmFuZHNbaSAtIDFdLnkgLSAxKTtcbiAgfVxuXG4gIGxldCBtYXhDdXQgPSAwLCBtYXhGaWxsID0gMCwgY3V0Vm9sdW1lID0gMCwgZmlsbFZvbHVtZSA9IDA7XG4gIGNvbnN0IHN1cmZhY2U6IFN1cmZhY2VTYW1wbGVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGIgb2YgYmFuZHMpIHtcbiAgICBmb3IgKGxldCBieiA9IGIuejA7IGJ6IDw9IGIuejE7IGJ6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByZWN0LngwOyB4IDw9IHJlY3QueDE7IHgrKykge1xuICAgICAgICBjb25zdCBzID0gc3VyZmFjZUF0KHdvcmxkLCB4LCBieik7XG4gICAgICAgIHN1cmZhY2UucHVzaCh7IHgsIHo6IGJ6LCB5OiBiLnkgfSk7XG4gICAgICAgIGNvbnN0IGQgPSBzIC0gYi55O1xuICAgICAgICBpZiAoZCA+IDApIHsgY3V0Vm9sdW1lICs9IGQ7IG1heEN1dCA9IE1hdGgubWF4KG1heEN1dCwgZCk7IH1cbiAgICAgICAgaWYgKGQgPCAwKSB7IGZpbGxWb2x1bWUgKz0gLWQ7IG1heEZpbGwgPSBNYXRoLm1heChtYXhGaWxsLCAtZCk7IH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKG1heEN1dCA+IEZBUk1fUlVMRVMubWF4Q3V0IHx8IG1heEZpbGwgPiBGQVJNX1JVTEVTLm1heEZpbGxcbiAgICB8fCBjdXRWb2x1bWUgPiBGQVJNX1JVTEVTLm1heEN1dFZvbHVtZSB8fCBmaWxsVm9sdW1lID4gRkFSTV9SVUxFUy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndGVycmFjZV9lYXJ0aHdvcmsnLCBbXG4gICAgICBgY3V0ICR7Y3V0Vm9sdW1lfSBtXHUwMEIzIC8gZmlsbCAke2ZpbGxWb2x1bWV9IG1cdTAwQjMsIG1heCAke21heEN1dH0vJHttYXhGaWxsfSBtYCxcbiAgICBdKTtcbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHN1cmZhY2UpO1xuICBpZiAobWlzbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9ub3RfcHJlcGFyZWQnLCBtaXNtYXRjaGVzLnNsaWNlKDAsIDQpLm1hcChcbiAgICAgIChtKSA9PiBgY29sdW1uICR7bS54fSwke20uen0gaXMgYXQgJHttLmFjdHVhbH0sIGV4cGVjdGVkICR7bS5leHBlY3RlZH1gLFxuICAgICkpO1xuICB9XG4gIGNvbnN0IG9ic3RydWN0aW9ucyA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAnc2l0ZV9vYnN0cnVjdGVkJywgb2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCkpO1xuICB9XG4gIGZvciAoY29uc3QgcyBvZiBzdXJmYWNlKSB7XG4gICAgY29uc3QgdG9wID0gZ2V0Vm94ZWwod29ybGQsIHMueCwgcy55IC0gMSwgcy56KTtcbiAgICBpZiAodG9wICE9PSBNQVQuU09JTCkge1xuICAgICAgcmV0dXJuIGZhaWwoJ3BsYW4nLCAndGVycmFjZV9zdXJmYWNlJywgW1xuICAgICAgICBgY29sdW1uICR7cy54fSwke3Muen0gdG9wIGlzICR7dG9wfSwgZXhwZWN0ZWQgc29pbGAsXG4gICAgICBdKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBjeCA9IChyZWN0LngwICsgcmVjdC54MSArIDEpIC8gMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgZm9yIChjb25zdCBiIG9mIGJhbmRzKSB7XG4gICAgY29uc3QgYnogPSAoYi56MCArIGIuejEgKyAxKSAvIDI7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6ICdzb2lsX2JlZCcsIHg6IGN4LCB5OiBiLnksIHo6IGJ6LFxuICAgICAgdzogd2lkdGgsIGg6IDAuMTgsIGQ6IGIuejEgLSBiLnowICsgMSwgdG9uZTogJ3NvaWwnLFxuICAgIH0pO1xuICAgIC8vIFRocmVlIGNyb3Agcm93cyBwZXIgdGVycmFjZSwgaW5zZXQgZnJvbSB0aGUgcmV0YWluaW5nIHdhbGxzLlxuICAgIGNvbnN0IHJvd0RlcHRoID0gYi56MSAtIGIuejAgKyAxO1xuICAgIGZvciAobGV0IHIgPSAwOyByIDwgMzsgcisrKSB7XG4gICAgICBjb25zdCB0ID0gKHIgKyAxKSAvIDQ7XG4gICAgICBtb2R1bGVzLnB1c2goe1xuICAgICAgICBraW5kOiAnY3JvcF9yb3cnLCB4OiBjeCwgeTogYi55ICsgMC4xOCwgejogYi56MCArIHJvd0RlcHRoICogdCxcbiAgICAgICAgdzogd2lkdGggLSAxLjIsIGg6IDAuMjgsIGQ6IDAuMzYsIHRvbmU6ICdjcm9wJyxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGxldCBpID0gMTsgaSA8IGJhbmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgdXBwZXIgPSBiYW5kc1tpIC0gMV07XG4gICAgY29uc3QgbG93ZXIgPSBiYW5kc1tpXTtcbiAgICBtb2R1bGVzLnB1c2goe1xuICAgICAga2luZDogJ3JldGFpbmluZ193YWxsJywgeDogY3gsIHk6IGxvd2VyLnksIHo6IHVwcGVyLnoxICsgMC41LFxuICAgICAgdzogd2lkdGgsIGg6IHVwcGVyLnkgLSBsb3dlci55LCBkOiAwLjQsIHRvbmU6ICdzdG9uZV9iJyxcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IG1pblkgPSBNYXRoLm1pbiguLi5iYW5kcy5tYXAoKGIpID0+IGIueSkpO1xuICBjb25zdCBtYXhZID0gTWF0aC5tYXgoLi4uYmFuZHMubWFwKChiKSA9PiBiLnkpKTtcbiAgY29uc3QgcGxhbjogU3RydWN0dXJlUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAga2luZDogJ3RlcnJhY2UnLFxuICAgIHNpdGVJZDogcHJvcG9zYWwuc2l0ZUlkLFxuICAgIHJlY3QsXG4gICAgZmxvb3JZOiBwcm9wb3NhbC5mbG9vclksXG4gICAgb3JpZ2luOiB7IHg6IGN4LCB5OiBtaW5ZLCB6OiAocmVjdC56MCArIHJlY3QuejEgKyAxKSAvIDIgfSxcbiAgICByb3Q6IDAsXG4gICAgbW9kdWxlcyxcbiAgICBjb3N0OiB7IC4uLlRFUlJBQ0VfQ09TVCB9LFxuICAgIGVudmVsb3BlOiBmb290cHJpbnRFbnZlbG9wZShyZWN0LCBtaW5ZIC0gMSwgbWF4WSArIDIsIDEpLFxuICAgIHN1cmZhY2UsXG4gICAgdGVycmFjZXM6IGJhbmRzLFxuICB9O1xuICBwbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFuKX1gO1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhblN0cnVjdHVyZSh3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTdHJ1Y3R1cmVQcm9wb3NhbCk6IFN0cnVjdHVyZVBsYW5SZXN1bHQge1xuICBpZiAocHJvcG9zYWwuZGVzaWduVmVyc2lvbiA9PT0gRk9VTkRFUl9ERVNJR05fVkVSU0lPTikgcmV0dXJuIHBsYW5Gb3VuZGVyRGVzaWduKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmIChwcm9wb3NhbC5kZXNpZ25WZXJzaW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gZmFpbCgncGxhbicsICd1bnN1cHBvcnRlZF9kZXNpZ24nLCBbYHVuc3VwcG9ydGVkIHN0cnVjdHVyZSBkZXNpZ24gJHtTdHJpbmcocHJvcG9zYWwuZGVzaWduVmVyc2lvbil9YF0pO1xuICB9XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAnaG91c2UnKSByZXR1cm4gcGxhbkhvdXNlKHdvcmxkLCBwcm9wb3NhbCk7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAncGF0aCcpIHJldHVybiBwbGFuUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICByZXR1cm4gcGxhblRlcnJhY2VzKHdvcmxkLCBwcm9wb3NhbCk7XG59XG5cbi8vIC0tLS0tLS0tLS0gZGVzaWduIDI6IGJvdW5kZWQgZm91bmRlciBjYW5kaWRhdGUgLS0tLS0tLS0tLVxuLy8gVGhpcyBkZWxpYmVyYXRlbHkgbGVhdmVzIGV2ZXJ5IGxlZ2FjeSBwbGFubmVyIGFib3ZlIHVudG91Y2hlZC4gVGhlIGV4dHJhIHdhbGxcbi8vIHByaW1pdGl2ZXMgcmVwcmVzZW50IHZvaWRzLCBub3QgZGVjb3JhdGl2ZSB3aW5kb3dzOyB0aGVpciBhc3NldC1sZXZlbCB2b2x1bWVcbi8vIGludGVycHJldGF0aW9uIHJlbWFpbnMgUmV2aWV3IFJlcXVpcmVkICh0aGUgZm91bmRlciA0XHUyMDEzOSB2b2x1bWUgdGFyZ2V0KS5cbmZ1bmN0aW9uIHBsYW5Gb3VuZGVyRGVzaWduKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGlmIChwcm9wb3NhbC5raW5kID09PSAncGF0aCcpIHJldHVybiBwbGFuRm91bmRlclBhdGgod29ybGQsIHByb3Bvc2FsKTtcbiAgY29uc3QgcGxhbm5lZCA9IHByb3Bvc2FsLmtpbmQgPT09ICdob3VzZScgPyBwbGFuSG91c2Uod29ybGQsIHByb3Bvc2FsKSA6IHBsYW5UZXJyYWNlcyh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBpZiAocHJvcG9zYWwua2luZCA9PT0gJ3RlcnJhY2UnKSB7XG4gICAgLy8gQ3JvcCByb3dzIHN0YXkgY29tcGFjdCBhdXRob3JpdGF0aXZlIGFnZ3JlZ2F0ZXMuIFRoZWlyIGZhY2V0ZWQgZm9saWFnZSBpc1xuICAgIC8vIGRlcml2ZWQgcHJlc2VudGF0aW9uIG9ubHk7IG5vIHBsYW50LWxldmVsIGV4aXN0ZW5jZSBvciB5aWVsZCBpcyBpbnZlbnRlZC5cbiAgICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gICAgcGxhbm5lZC5wbGFuLmlkID0gYHN0cnVjdHVyZToke3N0cnVjdHVyZURpZ2VzdChwbGFubmVkLnBsYW4pfWA7XG4gICAgcmV0dXJuIHBsYW5uZWQ7XG4gIH1cbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocHJvcG9zYWwucmVjdCk7XG4gIGNvbnN0IHgwID0gcmVjdC54MCwgeDEgPSByZWN0LngxICsgMTtcbiAgY29uc3QgejAgPSByZWN0LnowLCB6MSA9IHJlY3QuejEgKyAxO1xuICBjb25zdCB5ID0gcHJvcG9zYWwuZmxvb3JZLCBjeCA9ICh4MCArIHgxKSAvIDIsIGN6ID0gKHowICsgejEpIC8gMjtcbiAgY29uc3QgdCA9IDAuNiwgaCA9IDMuMjtcbiAgY29uc3QgbW9kdWxlczogU3RydWN0dXJlTW9kdWxlW10gPSBbXTtcbiAgLy8gT25lIHN0cnVjdHVyYWwgc3RvbmUgZmFtaWx5OiBsaWdodGluZywgbm90IHBhaW50ZWQgZmFjZSB2YXJpYXRpb24sIHNoYWRlcyBpdC5cbiAgY29uc3Qgd2FsbCA9ICh4OiBudW1iZXIsIGJvdHRvbTogbnVtYmVyLCB6OiBudW1iZXIsIHc6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGQ6IG51bWJlciwga2luZDogU3RydWN0dXJlTW9kdWxlWydraW5kJ10gPSAnd2FsbCcpID0+IHtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kLCB4LCB5OiBib3R0b20sIHosIHcsIGg6IGhlaWdodCwgZCwgdG9uZTogJ3N0b25lJyB9KTtcbiAgfTtcbiAgd2FsbChjeCwgeSAtIDAuNCwgY3osIDgsIDAuNCwgNiwgJ2Zsb29yJyk7XG4gIHdhbGwoY3gsIHksIHowICsgdCAvIDIsIDgsIGgsIHQpO1xuICBjb25zdCBpbm5lclowID0gejAgKyB0LCBpbm5lcloxID0gejEgLSB0O1xuICB3YWxsKHgwICsgdCAvIDIsIHksIChpbm5lclowICsgaW5uZXJaMSkgLyAyLCB0LCBoLCBpbm5lcloxIC0gaW5uZXJaMCk7XG4gIGNvbnN0IGRvb3JaID0gKHByb3Bvc2FsLmRvb3I/LnogPz8gcmVjdC56MCkgKyAwLjU7XG4gIGNvbnN0IGRvb3IwID0gZG9vclogLSAwLjYsIGRvb3IxID0gZG9vclogKyAwLjY7XG4gIGNvbnN0IGVhc3RYID0geDEgLSB0IC8gMjtcbiAgd2FsbChlYXN0WCwgeSwgKGlubmVyWjAgKyBkb29yMCkgLyAyLCB0LCBoLCBkb29yMCAtIGlubmVyWjApO1xuICB3YWxsKGVhc3RYLCB5LCAoZG9vcjEgKyBpbm5lcloxKSAvIDIsIHQsIGgsIGlubmVyWjEgLSBkb29yMSk7XG4gIHdhbGwoZWFzdFgsIHkgKyAyLjIsIGRvb3JaLCB0LCAwLjQsIDEuMiwgJ2xpbnRlbCcpO1xuICB3YWxsKGVhc3RYLCB5ICsgMi42LCBkb29yWiwgdCwgMC42LCAxLjIpO1xuICBjb25zdCBzb3V0aFogPSB6MSAtIHQgLyAyO1xuICBmb3IgKGNvbnN0IFthLCBiXSBvZiBbW3gwICsgdCwgY3ggLSAyLjZdLCBbY3ggLSAxLjQsIGN4ICsgMS40XSwgW2N4ICsgMi42LCB4MSAtIHRdXSkge1xuICAgIHdhbGwoKGEgKyBiKSAvIDIsIHksIHNvdXRoWiwgYiAtIGEsIGgsIHQpO1xuICB9XG4gIGZvciAoY29uc3Qgd3ggb2YgW2N4IC0gMiwgY3ggKyAyXSkge1xuICAgIHdhbGwod3gsIHksIHNvdXRoWiwgMS4yLCAxLCB0KTtcbiAgICB3YWxsKHd4LCB5ICsgMi40LCBzb3V0aFosIDEuMiwgMC44LCB0LCAnbGludGVsJyk7XG4gIH1cbiAgd2FsbChjeCwgeSArIGgsIGN6LCA4LCAwLjQsIDYsICdyb29mJyk7XG4gIHdhbGwoY3gsIHkgKyBoICsgMC40LCB6MCArIDAuMTUsIDgsIDAuMywgMC4zLCAncGFyYXBldCcpO1xuICB3YWxsKGN4LCB5ICsgaCArIDAuNCwgejEgLSAwLjE1LCA4LCAwLjMsIDAuMywgJ3BhcmFwZXQnKTtcbiAgd2FsbChjeCAtIDMuODUsIHkgKyBoICsgMC40LCBjeiwgMC4zLCAwLjMsIDUuNCwgJ3BhcmFwZXQnKTtcbiAgd2FsbChjeCArIDMuODUsIHkgKyBoICsgMC40LCBjeiwgMC4zLCAwLjMsIDUuNCwgJ3BhcmFwZXQnKTtcbiAgcGxhbm5lZC5wbGFuLm1vZHVsZXMgPSBtb2R1bGVzO1xuICBwbGFubmVkLnBsYW4uZGVzaWduVmVyc2lvbiA9IEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG4gIHBsYW5uZWQucGxhbi5lbnZlbG9wZSA9IGZvb3RwcmludEVudmVsb3BlKHJlY3QsIHkgLSAxLCB5ICsgNCwgMik7XG4gIHBsYW5uZWQucGxhbi5pZCA9IGBzdHJ1Y3R1cmU6JHtzdHJ1Y3R1cmVEaWdlc3QocGxhbm5lZC5wbGFuKX1gO1xuICByZXR1cm4gcGxhbm5lZDtcbn1cblxuZnVuY3Rpb24gcGxhbkZvdW5kZXJQYXRoKHdvcmxkOiBXb3JsZCwgcHJvcG9zYWw6IFN0cnVjdHVyZVByb3Bvc2FsKTogU3RydWN0dXJlUGxhblJlc3VsdCB7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUGF0aCh3b3JsZCwgcHJvcG9zYWwpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybiBwbGFubmVkO1xuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVNb2R1bGVbXSA9IFtdO1xuICBjb25zdCBoZWlnaHRzID0gcGxhbm5lZC5wbGFuLm1vZHVsZXMuZmlsdGVyKChtKSA9PiBtLmtpbmQgPT09ICdwYXRoJykubWFwKChtKSA9PiBtLnkpO1xuICBjb25zdCB6MCA9IHBsYW5uZWQucGxhbi5yZWN0LnowLCB6MSA9IHBsYW5uZWQucGxhbi5yZWN0LnoxICsgMTtcbiAgbGV0IHN0YXJ0ID0gMDtcbiAgZm9yIChsZXQgZW5kID0gMTsgZW5kIDw9IGhlaWdodHMubGVuZ3RoOyBlbmQrKykge1xuICAgIGlmIChlbmQgPCBoZWlnaHRzLmxlbmd0aCAmJiBoZWlnaHRzW2VuZF0gPT09IGhlaWdodHNbc3RhcnRdKSBjb250aW51ZTtcbiAgICBjb25zdCB4ID0gcGxhbm5lZC5wbGFuLnJlY3QueDAgKyBzdGFydCwgd2lkdGggPSBlbmQgLSBzdGFydDtcbiAgICBjb25zdCBjeCA9IHggKyB3aWR0aCAvIDIsIHkgPSBoZWlnaHRzW3N0YXJ0XTtcbiAgICBtb2R1bGVzLnB1c2goeyBraW5kOiAncGF0aCcsIHg6IGN4LCB5LCB6OiAoejAgKyB6MSkgLyAyLCB3OiB3aWR0aCwgaDogMC4xMiwgZDogMywgdG9uZTogJ2dyYXZlbCcgfSk7XG4gICAgZm9yIChjb25zdCB6IG9mIFt6MCArIDAuMDc1LCB6MSAtIDAuMDc1XSkge1xuICAgICAgbW9kdWxlcy5wdXNoKHsga2luZDogJ2N1cmInLCB4OiBjeCwgeSwgeiwgdzogd2lkdGgsIGg6IDAuMjIsIGQ6IDAuMTUsIHRvbmU6ICdzdG9uZScgfSk7XG4gICAgfVxuICAgIHN0YXJ0ID0gZW5kO1xuICB9XG4gIHBsYW5uZWQucGxhbi5tb2R1bGVzID0gbW9kdWxlcztcbiAgcGxhbm5lZC5wbGFuLmRlc2lnblZlcnNpb24gPSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OO1xuICBwbGFubmVkLnBsYW4uaWQgPSBgc3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW5uZWQucGxhbil9YDtcbiAgcmV0dXJuIHBsYW5uZWQ7XG59XG5cblxuLy8gLS0tLS0tLS0tLSBhdXRob3JpemF0aW9uIC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlTGltaXRzIHtcbiAgbWF4TW9kdWxlczogbnVtYmVyO1xuICBtYXhDb3N0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1NUUlVDVFVSRV9MSU1JVFM6IFN0cnVjdHVyZUxpbWl0cyA9IHtcbiAgbWF4TW9kdWxlczogNjQsXG4gIG1heENvc3Q6IDEyOCxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0dXJlQXV0aG9yaXphdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIGF1dGhvcml0eTogdHlwZW9mIExPQ0FMX0FVVEhPUklUWTtcbiAgZW5mb3JjZW1lbnQ6IHR5cGVvZiBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcGxhbkRpZ2VzdDogc3RyaW5nO1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgYmFzZVJldmlzaW9uOiBudW1iZXI7XG4gIGxpbWl0czogU3RydWN0dXJlTGltaXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZURlY2lzaW9uIHtcbiAgb2s6IGJvb2xlYW47XG4gIGF1dGhvcml6YXRpb246IFN0cnVjdHVyZUF1dGhvcml6YXRpb24gfCBudWxsO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciB7XG4gIHJlYWRvbmx5IGF1dGhvcml0eSA9IExPQ0FMX0FVVEhPUklUWTtcbiAgcmVhZG9ubHkgZW5mb3JjZW1lbnQgPSBMT0NBTF9FTkZPUkNFTUVOVDtcbiAgcmVhZG9ubHkgbGltaXRzOiBTdHJ1Y3R1cmVMaW1pdHM7XG5cbiAgY29uc3RydWN0b3IocmVhZG9ubHkgcG9saWN5OiBBdXRob3JpemF0aW9uUG9saWN5LCBsaW1pdHM6IFBhcnRpYWw8U3RydWN0dXJlTGltaXRzPiA9IHt9KSB7XG4gICAgdGhpcy5saW1pdHMgPSB7IC4uLkRFRkFVTFRfU1RSVUNUVVJFX0xJTUlUUywgLi4ubGltaXRzIH07XG4gIH1cblxuICBhdXRob3JpemUod29ybGQ6IFdvcmxkLCBwbGFuOiBTdHJ1Y3R1cmVQbGFuKTogU3RydWN0dXJlRGVjaXNpb24ge1xuICAgIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKHBsYW4ubW9kdWxlcy5sZW5ndGggPT09IDApIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gbW9kdWxlcycpO1xuICAgIGlmIChwbGFuLm1vZHVsZXMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4TW9kdWxlcykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4ubW9kdWxlcy5sZW5ndGh9IG1vZHVsZXMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4TW9kdWxlc31gKTtcbiAgICB9XG4gICAgaWYgKGNvc3RUb3RhbChwbGFuLmNvc3QpID4gdGhpcy5saW1pdHMubWF4Q29zdCkge1xuICAgICAgcmVhc29ucy5wdXNoKGBjb3N0ICR7Y29zdFRvdGFsKHBsYW4uY29zdCl9IGV4Y2VlZHMgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhDb3N0fWApO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhwbGFuLmNvc3QpKSB7XG4gICAgICBpZiAoIU51bWJlci5pc0ludGVnZXIoYW1vdW50KSB8fCAoYW1vdW50ID8/IDApIDwgMCkge1xuICAgICAgICByZWFzb25zLnB1c2goYGNvc3QgJHtyZXNvdXJjZX09JHthbW91bnR9IGlzIG5vdCBhIG5vbi1uZWdhdGl2ZSBpbnRlZ2VyYCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChwbGFuLmVudmVsb3BlLmxlbmd0aCA9PT0gMCkgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyB3b3JrIGVudmVsb3BlJyk7XG4gICAgZm9yIChjb25zdCByZWdpb24gb2YgcGxhbi5lbnZlbG9wZSkge1xuICAgICAgaWYgKCF0aGlzLnBvbGljeS5lbnZlbG9wZS5zb21lKChwKSA9PiByZWdpb24ueDAgPj0gcC54MCAmJiByZWdpb24ueDEgPD0gcC54MVxuICAgICAgICAmJiByZWdpb24uejAgPj0gcC56MCAmJiByZWdpb24uejEgPD0gcC56MVxuICAgICAgICAmJiByZWdpb24ueTAgPj0gcC55MCAmJiByZWdpb24ueTEgPD0gcC55MSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBlbnZlbG9wZSAke3JlZ2lvbi54MH0sJHtyZWdpb24uejB9LCR7cmVnaW9uLnkwfS4uJHtyZWdpb24ueDF9LCR7cmVnaW9uLnoxfSwke3JlZ2lvbi55MX0gaXMgb3V0c2lkZSB0aGUgbG9jYWwgcG9saWN5YCk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgbSBvZiBwbGFuLm1vZHVsZXMpIHtcbiAgICAgIGlmICghbW9kdWxlSW5zaWRlRW52ZWxvcGUobSwgcGxhbi5lbnZlbG9wZSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGBtb2R1bGUgJHttLmtpbmR9IGF0ICR7bS54fSwke20ueX0sJHttLnp9IGlzIG91dHNpZGUgdGhlIHBsYW4gZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHBsYW4uc3VyZmFjZS5sZW5ndGggPT09IDApIHJlYXNvbnMucHVzaCgncGxhbiBoYXMgbm8gc3VyZmFjZSBzYW1wbGVzJyk7XG4gICAgZm9yIChjb25zdCBzIG9mIHBsYW4uc3VyZmFjZSkge1xuICAgICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHMueCwgcy55LCBzLnopKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgc3VyZmFjZSAke3MueH0sJHtzLnp9LCR7cy55fSBpcyBvdXRzaWRlIHRoZSBwbGFuIGVudmVsb3BlYCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiB7IG9rOiBmYWxzZSwgYXV0aG9yaXphdGlvbjogbnVsbCwgcmVhc29ucyB9O1xuXG4gICAgY29uc3QgdG9rZW46IFN0cnVjdHVyZUF1dGhvcml6YXRpb24gPSB7XG4gICAgICBpZDogYGxvY2FsLXN0dWI6c3RydWN0dXJlOiR7c3RydWN0dXJlRGlnZXN0KHBsYW4pfWAsXG4gICAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICAgIHBsYW5EaWdlc3Q6IHN0cnVjdHVyZURpZ2VzdChwbGFuKSxcbiAgICAgIGVudmVsb3BlOiBwbGFuLmVudmVsb3BlLm1hcCgoZSkgPT4gKHsgLi4uZSB9KSksXG4gICAgICBiYXNlUmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgICAgbGltaXRzOiB7IC4uLnRoaXMubGltaXRzIH0sXG4gICAgfTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgYXV0aG9yaXphdGlvbjogdG9rZW4sIHJlYXNvbnM6IFtdIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBleGVjdXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBTdHJ1Y3R1cmVMZWRnZXIge1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIGF1dGhvcml6YXRpb25JZDogc3RyaW5nO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIHN0cnVjdHVyZUlkOiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBraW5kOiBTdHJ1Y3R1cmVLaW5kO1xuICBtb2R1bGVDb3VudDogbnVtYmVyO1xuICBjb3N0UGFpZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgaW52ZW50b3J5QmVmb3JlOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBpbnZlbnRvcnlBZnRlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgcmV2aXNpb25CZWZvcmU6IG51bWJlcjtcbiAgcmV2aXNpb25BZnRlcjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0cnVjdHVyZVN1Y2Nlc3Mge1xuICBvazogdHJ1ZTtcbiAgcGxhbjogU3RydWN0dXJlUGxhbjtcbiAgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbjtcbiAgbGVkZ2VyOiBTdHJ1Y3R1cmVMZWRnZXI7XG59XG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZU91dGNvbWUgPSBTdHJ1Y3R1cmVTdWNjZXNzIHwgU3RydWN0dXJlRmFpbHVyZTtcblxuZXhwb3J0IGZ1bmN0aW9uIGV4ZWN1dGVTdHJ1Y3R1cmUoXG4gIHdvcmxkOiBXb3JsZCwgcGxhbjogU3RydWN0dXJlUGxhbiwgYXV0aG9yaXphdGlvbjogU3RydWN0dXJlQXV0aG9yaXphdGlvbixcbik6IFN0cnVjdHVyZU91dGNvbWUge1xuICBpZiAoYXV0aG9yaXphdGlvbi5hdXRob3JpdHkgIT09IExPQ0FMX0FVVEhPUklUWVxuICAgIHx8IGF1dGhvcml6YXRpb24uZW5mb3JjZW1lbnQgIT09IExPQ0FMX0VORk9SQ0VNRU5UKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5zdXBwb3J0ZWRfYXV0aG9yaXR5JywgW1xuICAgICAgYGF1dGhvcml0eSAke2F1dGhvcml6YXRpb24uYXV0aG9yaXR5fS8ke2F1dGhvcml6YXRpb24uZW5mb3JjZW1lbnR9IGlzIG5vdCB0aGUgbG9jYWwgc3R1YmAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCAhPT0gc3RydWN0dXJlRGlnZXN0KHBsYW4pKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZGlnZXN0X21pc21hdGNoJywgWydhdXRob3JpemF0aW9uIGRvZXMgbm90IG1hdGNoIHRoaXMgc3RydWN0dXJlIHBsYW4nXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24uYmFzZVJldmlzaW9uICE9PSB3b3JsZC5yZXZpc2lvbikge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3N0YWxlX2F1dGhvcml6YXRpb24nLCBbXG4gICAgICBgYXV0aG9yaXphdGlvbiB3YXMgaXNzdWVkIGF0IHJldmlzaW9uICR7YXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb259LCB3b3JsZCBpcyBhdCAke3dvcmxkLnJldmlzaW9ufWAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKHBsYW4uZW52ZWxvcGUuc29tZSgocikgPT4gIWF1dGhvcml6YXRpb24uZW52ZWxvcGUuc29tZSgoYSkgPT4gci54MCA+PSBhLngwXG4gICAgJiYgci54MSA8PSBhLngxICYmIHIuejAgPj0gYS56MCAmJiByLnoxIDw9IGEuejEgJiYgci55MCA+PSBhLnkwICYmIHIueTEgPD0gYS55MSkpKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAnZW52ZWxvcGVfbWlzbWF0Y2gnLCBbJ3BsYW4gZW52ZWxvcGUgaXMgd2lkZXIgdGhhbiB0aGUgYXV0aG9yaXphdGlvbiddKTtcbiAgfVxuXG4gIGNvbnN0IHJlYXNvbnM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgbSBvZiBwbGFuLm1vZHVsZXMpIHtcbiAgICBpZiAoIW1vZHVsZUluc2lkZUVudmVsb3BlKG0sIGF1dGhvcml6YXRpb24uZW52ZWxvcGUpKSB7XG4gICAgICByZWFzb25zLnB1c2goYG1vZHVsZSAke20ua2luZH0gYXQgJHttLnh9LCR7bS55fSwke20uen0gaXMgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZWApO1xuICAgIH1cbiAgfVxuICBjb25zdCBtaXNtYXRjaGVzID0gc3VyZmFjZU1pc21hdGNoZXMod29ybGQsIHBsYW4uc3VyZmFjZSk7XG4gIGlmIChtaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICByZWFzb25zLnB1c2goLi4ubWlzbWF0Y2hlcy5zbGljZSgwLCA0KS5tYXAoXG4gICAgICAobSkgPT4gYGNvbHVtbiAke20ueH0sJHttLnp9IGlzIGF0ICR7bS5hY3R1YWx9LCBleHBlY3RlZCAke20uZXhwZWN0ZWR9YCxcbiAgICApKTtcbiAgfVxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSBvYnN0cnVjdGlvbnNJbih3b3JsZCwgcGxhbi5yZWN0KTtcbiAgaWYgKG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmb290cHJpbnQgaGFzICR7b2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zYCk7XG4gIH1cbiAgaWYgKHdvcmxkLnN0cnVjdHVyZXMuaGFzKHBsYW4uaWQpKSB7XG4gICAgcmVhc29ucy5wdXNoKGBzdHJ1Y3R1cmUgJHtwbGFuLmlkfSBhbHJlYWR5IGV4aXN0c2ApO1xuICB9XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICBjb25zdCBoYXZlID0gd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwO1xuICAgIGlmIChoYXZlIDwgKGFtb3VudCA/PyAwKSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBuZWVkICR7YW1vdW50fSAke3Jlc291cmNlfSwgaGF2ZSAke2hhdmV9YCk7XG4gICAgfVxuICB9XG4gIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3VuYXV0aG9yaXplZF9zdHJ1Y3R1cmUnLCByZWFzb25zKTtcblxuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IHJldmlzaW9uQmVmb3JlID0gd29ybGQucmV2aXNpb247XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHBsYW4uY29zdCkpIHtcbiAgICBjb25zdCBsZWZ0ID0gKHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgLSAoYW1vdW50ID8/IDApO1xuICAgIGlmIChsZWZ0ID4gMCkgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA9IGxlZnQ7XG4gICAgZWxzZSBkZWxldGUgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXTtcbiAgfVxuXG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIGNvbnN0IHN0cnVjdHVyZTogU3RydWN0dXJlID0ge1xuICAgIGlkOiBwbGFuLmlkLFxuICAgIGtpbmQ6IHBsYW4ua2luZCxcbiAgICBzaXRlSWQ6IHBsYW4uc2l0ZUlkLFxuICAgIHg6IHBsYW4ub3JpZ2luLngsXG4gICAgeTogcGxhbi5vcmlnaW4ueSxcbiAgICB6OiBwbGFuLm9yaWdpbi56LFxuICAgIHJvdDogcGxhbi5yb3QsXG4gICAgbW9kdWxlczogcGxhbi5tb2R1bGVzLm1hcCgobSkgPT4gKHsgLi4ubSB9KSksXG4gICAgY29zdDogeyAuLi5wbGFuLmNvc3QgfSxcbiAgICBidWlsdFJldmlzaW9uOiB3b3JsZC5yZXZpc2lvbixcbiAgICAuLi4ocGxhbi5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OID8geyBkZXNpZ25WZXJzaW9uOiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OIH0gOiB7fSksXG4gICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gIH07XG4gIHdvcmxkLnN0cnVjdHVyZXMuc2V0KHN0cnVjdHVyZS5pZCwgc3RydWN0dXJlKTtcblxuICBjb25zdCBsZWRnZXI6IFN0cnVjdHVyZUxlZGdlciA9IHtcbiAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICBlbmZvcmNlbWVudDogTE9DQUxfRU5GT1JDRU1FTlQsXG4gICAgYXV0aG9yaXphdGlvbklkOiBhdXRob3JpemF0aW9uLmlkLFxuICAgIHBsYW5EaWdlc3Q6IGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCxcbiAgICBzdHJ1Y3R1cmVJZDogc3RydWN0dXJlLmlkLFxuICAgIHNpdGVJZDogcGxhbi5zaXRlSWQsXG4gICAga2luZDogcGxhbi5raW5kLFxuICAgIG1vZHVsZUNvdW50OiBzdHJ1Y3R1cmUubW9kdWxlcy5sZW5ndGgsXG4gICAgY29zdFBhaWQ6IHsgLi4ucGxhbi5jb3N0IH0sXG4gICAgaW52ZW50b3J5QmVmb3JlLFxuICAgIGludmVudG9yeUFmdGVyOiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCksXG4gICAgcmV2aXNpb25CZWZvcmUsXG4gICAgcmV2aXNpb25BZnRlcjogd29ybGQucmV2aXNpb24sXG4gIH07XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCBhdXRob3JpemF0aW9uLCBsZWRnZXIgfTtcbn1cblxuLyoqXG4gKiBUaGUgc2hhcmVkIHBsYXllci9BSSBzdHJ1Y3R1cmUgZW50cnkgcG9pbnQuIFRlcnJhaW4gbXVzdCBhbHJlYWR5IGJlIHByZXBhcmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTdHJ1Y3R1cmUoXG4gIHdvcmxkOiBXb3JsZCxcbiAgYXV0aG9yaXplcjogTG9jYWxTdHJ1Y3R1cmVBdXRob3JpemVyLFxuICBwcm9wb3NhbDogU3RydWN0dXJlUHJvcG9zYWwsXG4pOiBTdHJ1Y3R1cmVPdXRjb21lIHtcbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5TdHJ1Y3R1cmUod29ybGQsIHByb3Bvc2FsKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgY29uc3QgZGVjaXNpb24gPSBhdXRob3JpemVyLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgaWYgKCFkZWNpc2lvbi5vayB8fCAhZGVjaXNpb24uYXV0aG9yaXphdGlvbikge1xuICAgIHJldHVybiBmYWlsKCdhdXRob3JpemUnLCAnbm90X2F1dGhvcml6ZWQnLCBkZWNpc2lvbi5yZWFzb25zKTtcbiAgfVxuICByZXR1cm4gZXhlY3V0ZVN0cnVjdHVyZSh3b3JsZCwgcGxhbm5lZC5wbGFuLCBkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcbn1cbiIsICIvLyBDYW5vbmljYWwgc3RhdGUgaGFzaGluZyBcdTIwMTQgcHVyZSBzaW11bGF0aW9uLCBubyB0aHJlZS5qcyBpbXBvcnRzLlxuLy9cbi8vIFRoZSBuby1mbGF0dGVuIHByb29mIGNvbXBhcmVzIHRoZSBhdXRob3JpdGF0aXZlIHZveGVsIHZvbHVtZSBvdXRzaWRlIHRoZVxuLy8gY29tcGxldGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlLiBJdCBkZWxpYmVyYXRlbHkgZG9lcyBub3QgaGFzaCBjaHVua1xuLy8gaGVpZ2h0cy90b3BNYXRlcmlhbHMgKGRlcml2ZWQgY2FjaGVzKSwgbWVzaCBnZW9tZXRyeSwgc3RyZWFtaW5nIHN0YXRlIG9yXG4vLyBuYXZpZ2F0aW9uIGRhdGEuIFRob3NlIGFyZSBjaGVja2VkIHNlcGFyYXRlbHkgYXMgZGVyaXZlZCBzdGF0ZSwgc28gYSBjYWNoZVxuLy8gb3IgbWVzaCByZWJ1aWxkIGNhbiBuZXZlciBiZSBtaXN0YWtlbiBmb3IgYSB0ZXJyYWluIG11dGF0aW9uLlxuaW1wb3J0IHtcbiAgV29ybGQsIFlfTUlOLCBZX01BWCwgSEFMRiwgQ0hVTktfU0laRSwgQ0hVTktfQVJFQSxcbiAgZW5zdXJlQ2h1bmssIHdvcmxkVG9DaHVua1gsIHdvcmxkVG9DaHVua1osIGNodW5rS2V5LFxuICBjaHVua09yaWdpblgsIGNodW5rT3JpZ2luWiwgbG9jYWxJbmRleCwgeVRvSW5kZXgsIGlzU29saWQsXG4gIEVudGl0eSxcbn0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQgeyBWb3hlbFJlZ2lvbiwgZW52ZWxvcGVDb250YWlucyB9IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQgeyBGT1VOREVSX0RFU0lHTl9WRVJTSU9OIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcblxuZXhwb3J0IGludGVyZmFjZSBTdGF0ZUhhc2gge1xuICAvKiogMTYgaGV4IGNoYXJhY3RlcnM6IHR3byBpbmRlcGVuZGVudCAzMi1iaXQgbGFuZXMuICovXG4gIGhhc2g6IHN0cmluZztcbiAgY2VsbHM6IG51bWJlcjtcbiAgZXhjbHVkZWRDZWxsczogbnVtYmVyO1xuICBjaHVua3M6IG51bWJlcjtcbiAgcmVnaW9uOiBWb3hlbFJlZ2lvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYWNoZU1pc21hdGNoIHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGZpZWxkOiAnaGVpZ2h0JyB8ICdtYXRlcmlhbCc7XG4gIGV4cGVjdGVkOiBudW1iZXI7XG4gIGFjdHVhbDogbnVtYmVyO1xufVxuXG5jbGFzcyBIYXNoZXIge1xuICBwcml2YXRlIGEgPSAweDgxMWM5ZGM1O1xuICBwcml2YXRlIGIgPSAweDllMzc3OWI5O1xuXG4gIGJ5dGUodjogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgeCA9IHYgJiAweGZmO1xuICAgIHRoaXMuYSA9IE1hdGguaW11bCh0aGlzLmEgXiB4LCAweDAxMDAwMTkzKTtcbiAgICB0aGlzLmIgPSBNYXRoLmltdWwodGhpcy5iIF4gKHggKyAweDllKSwgMHg4NWViY2E2Yik7XG4gICAgdGhpcy5iIF49IHRoaXMuYiA+Pj4gMTM7XG4gIH1cblxuICB1MzIodjogbnVtYmVyKTogdm9pZCB7XG4gICAgbGV0IG4gPSB2ID4+PiAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG4gICAgICB0aGlzLmJ5dGUobik7XG4gICAgICBuID4+Pj0gODtcbiAgICB9XG4gIH1cblxuICBzdHJpbmcoczogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy51MzIocy5sZW5ndGgpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcy5sZW5ndGg7IGkrKykgdGhpcy5ieXRlKHMuY2hhckNvZGVBdChpKSk7XG4gIH1cblxuICBoZXgoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gKHRoaXMuYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICAgICsgKHRoaXMuYiA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wUmVnaW9uKHJlZ2lvbjogVm94ZWxSZWdpb24pOiBWb3hlbFJlZ2lvbiB7XG4gIGNvbnN0IHI6IFZveGVsUmVnaW9uID0ge1xuICAgIHgwOiBNYXRoLm1heCgtSEFMRiwgTWF0aC5mbG9vcihyZWdpb24ueDApKSxcbiAgICB6MDogTWF0aC5tYXgoLUhBTEYsIE1hdGguZmxvb3IocmVnaW9uLnowKSksXG4gICAgeDE6IE1hdGgubWluKEhBTEYgLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi54MSkpLFxuICAgIHoxOiBNYXRoLm1pbihIQUxGIC0gMSwgTWF0aC5mbG9vcihyZWdpb24uejEpKSxcbiAgICB5MDogTWF0aC5tYXgoWV9NSU4sIE1hdGguZmxvb3IocmVnaW9uLnkwKSksXG4gICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgTWF0aC5mbG9vcihyZWdpb24ueTEpKSxcbiAgfTtcbiAgaWYgKHIueDAgPiByLngxIHx8IHIuejAgPiByLnoxIHx8IHIueTAgPiByLnkxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBlbXB0eSB2b3hlbCByZWdpb24gJHtKU09OLnN0cmluZ2lmeShyZWdpb24pfWApO1xuICB9XG4gIHJldHVybiByO1xufVxuXG4vKiogU29ydCBhbiBlbnZlbG9wZSBzbyBpdHMgaGFzaCBpcyBpbmRlcGVuZGVudCBvZiByZWN0IG9yZGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUVudmVsb3BlKHJlY3RzOiByZWFkb25seSBWb3hlbFJlZ2lvbltdKTogVm94ZWxSZWdpb25bXSB7XG4gIHJldHVybiByZWN0c1xuICAgIC5tYXAoKHIpID0+ICh7XG4gICAgICB4MDogTWF0aC5mbG9vcihyLngwKSwgejA6IE1hdGguZmxvb3Ioci56MCksIHgxOiBNYXRoLmZsb29yKHIueDEpLCB6MTogTWF0aC5mbG9vcihyLnoxKSxcbiAgICAgIHkwOiBNYXRoLmZsb29yKHIueTApLCB5MTogTWF0aC5mbG9vcihyLnkxKSxcbiAgICB9KSlcbiAgICAuc29ydCgoYSwgYikgPT4gYS54MCAtIGIueDAgfHwgYS56MCAtIGIuejAgfHwgYS55MCAtIGIueTBcbiAgICAgIHx8IGEueDEgLSBiLngxIHx8IGEuejEgLSBiLnoxIHx8IGEueTEgLSBiLnkxKTtcbn1cblxuLyoqIE1hdGVyaWFsaXNlIGV2ZXJ5IGNodW5rIHRoYXQgb3ZlcmxhcHMgdGhlIHJlZ2lvbiBhbmQgcmV0dXJuIHNvcnRlZCBrZXlzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZDogV29ybGQsIHJlZ2lvbjogVm94ZWxSZWdpb24pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjeDAgPSB3b3JsZFRvQ2h1bmtYKHIueDApLCBjeDEgPSB3b3JsZFRvQ2h1bmtYKHIueDEpO1xuICBjb25zdCBjejAgPSB3b3JsZFRvQ2h1bmtaKHIuejApLCBjejEgPSB3b3JsZFRvQ2h1bmtaKHIuejEpO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykge1xuICAgICAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgY2h1bmsgJHtjeH0sJHtjen0gaXMgb3V0c2lkZSB0aGUgd29ybGRgKTtcbiAgICAgIGtleXMucHVzaChjaHVua0tleShjeCwgY3opKTtcbiAgICB9XG4gIH1cbiAga2V5cy5zb3J0KCk7XG4gIHJldHVybiBrZXlzO1xufVxuXG4vKipcbiAqIEhhc2ggdGhlIGF1dGhvcml0YXRpdmUgbWF0ZXJpYWwgYnl0ZSBvZiBldmVyeSB2b3hlbCBpbiBgcmVnaW9uYCwgZXhjbHVkaW5nXG4gKiBldmVyeSB2b3hlbCBpbnNpZGUgYGV4Y2x1ZGVgLiBUd28gY2FsbHMgd2l0aCB0aGUgc2FtZSByZWdpb24gYW5kIGVudmVsb3BlXG4gKiBhcmUgZGlyZWN0bHkgY29tcGFyYWJsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbFJlZ2lvbkhhc2goXG4gIHdvcmxkOiBXb3JsZCxcbiAgcmVnaW9uOiBWb3hlbFJlZ2lvbixcbiAgZXhjbHVkZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSA9IFtdLFxuKTogU3RhdGVIYXNoIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGVudmVsb3BlID0gbm9ybWFsaXplRW52ZWxvcGUoZXhjbHVkZSk7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjp2b3hlbC1zdGF0ZTp2MScpO1xuICBoLnUzMihyLngwKTsgaC51MzIoci56MCk7IGgudTMyKHIueDEpOyBoLnUzMihyLnoxKTsgaC51MzIoci55MCk7IGgudTMyKHIueTEpO1xuICBoLnUzMihlbnZlbG9wZS5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IGUgb2YgZW52ZWxvcGUpIHtcbiAgICBoLnUzMihlLngwKTsgaC51MzIoZS56MCk7IGgudTMyKGUueDEpOyBoLnUzMihlLnoxKTsgaC51MzIoZS55MCk7IGgudTMyKGUueTEpO1xuICB9XG5cbiAgbGV0IGNlbGxzID0gMDtcbiAgbGV0IGV4Y2x1ZGVkQ2VsbHMgPSAwO1xuICBjb25zdCB5aTAgPSByLnkwIC0gWV9NSU47XG4gIGNvbnN0IHlpMSA9IHIueTEgLSBZX01JTjtcblxuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2tleX0gd2FzIG5vdCBnZW5lcmF0ZWRgKTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBoLnN0cmluZygnY2h1bmsnKTtcbiAgICBoLnUzMihjaHVuay5jeCk7IGgudTMyKGNodW5rLmN6KTtcbiAgICBmb3IgKGxldCB5aSA9IHlpMDsgeWkgPD0geWkxOyB5aSsrKSB7XG4gICAgICBjb25zdCB5ID0gWV9NSU4gKyB5aTtcbiAgICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgICAgY29uc3QgeiA9IG96ICsgbHo7XG4gICAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgICBjb25zdCB4ID0gb3ggKyBseDtcbiAgICAgICAgICBpZiAoZW52ZWxvcGUubGVuZ3RoID4gMCAmJiBlbnZlbG9wZUNvbnRhaW5zKGVudmVsb3BlLCB4LCB5LCB6KSkge1xuICAgICAgICAgICAgZXhjbHVkZWRDZWxscysrO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGguYnl0ZShjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlpLCBseildKTtcbiAgICAgICAgICBjZWxscysrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgaGFzaDogaC5oZXgoKSwgY2VsbHMsIGV4Y2x1ZGVkQ2VsbHMsIGNodW5rczoga2V5cy5sZW5ndGgsIHJlZ2lvbjogciB9O1xufVxuXG4vKiogQ2Fub25pY2FsIGludmVudG9yeSBoYXNoOyBrZXkgb3JkZXIgY2Fubm90IGFmZmVjdCB0aGUgcmVzdWx0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbEludmVudG9yeUhhc2god29ybGQ6IFdvcmxkKTogc3RyaW5nIHtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6aW52ZW50b3J5OnYxJyk7XG4gIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh3b3JsZC5pbnZlbnRvcnkpLnNvcnQoKTtcbiAgaC51MzIoa2V5cy5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgaC5zdHJpbmcoa2V5KTtcbiAgICBoLnUzMih3b3JsZC5pbnZlbnRvcnlba2V5XSk7XG4gIH1cbiAgcmV0dXJuIGguaGV4KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZDogV29ybGQpOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHdvcmxkLmludmVudG9yeSkuc29ydCgpKSBvdXRba2V5XSA9IHdvcmxkLmludmVudG9yeVtrZXldO1xuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBoYXNoRW50aXR5KGg6IEhhc2hlciwgZTogRW50aXR5KTogdm9pZCB7XG4gIGguc3RyaW5nKGUuaWQpO1xuICBoLnN0cmluZyhlLmtpbmQpO1xuICBoLnN0cmluZyhlLmNodW5rKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnggKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS55ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueiAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnJvdCAqIDEwMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS5zY2FsZSAqIDEwMDApKTtcbiAgaC51MzIoZS52YXJpYW50KTtcbiAgaC5zdHJpbmcoZS5yZXNvdXJjZSA/PyAnJyk7XG4gIGgudTMyKGUucmVtYWluaW5nKTtcbiAgaC51MzIoZS5oYXJ2ZXN0ZWQgPyAxIDogMCk7XG4gIGgudTMyKGUuaGFydmVzdGVkT25jZSA/IDEgOiAwKTtcbn1cblxuLyoqIEhhc2ggZW50aXR5IHN0YXRlOyB3aXRoIGEgcmVnaW9uLCBvbmx5IGVudGl0aWVzIHJvb3RlZCBpbnNpZGUgaXQuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsRW50aXR5SGFzaCh3b3JsZDogV29ybGQsIHJlZ2lvbj86IFZveGVsUmVnaW9uKTogc3RyaW5nIHtcbiAgbGV0IGVudGl0aWVzOiBFbnRpdHlbXTtcbiAgaWYgKHJlZ2lvbikge1xuICAgIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICAgIGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gICAgZW50aXRpZXMgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldLmZpbHRlcihcbiAgICAgIChlKSA9PiBlLnggPj0gci54MCAmJiBlLnggPCByLngxICsgMSAmJiBlLnogPj0gci56MCAmJiBlLnogPCByLnoxICsgMSxcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGVudGl0aWVzID0gWy4uLndvcmxkLmVudGl0aWVzLnZhbHVlcygpXTtcbiAgfVxuICBlbnRpdGllcy5zb3J0KChhLCBiKSA9PiAoYS5pZCA8IGIuaWQgPyAtMSA6IGEuaWQgPiBiLmlkID8gMSA6IDApKTtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6ZW50aXR5LXN0YXRlOnYxJyk7XG4gIGgudTMyKGVudGl0aWVzLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgZSBvZiBlbnRpdGllcykgaGFzaEVudGl0eShoLCBlKTtcbiAgcmV0dXJuIGguaGV4KCk7XG59XG5cbi8qKlxuICogQ2Fub25pY2FsIGhhc2ggb2YgYnVpbHQgc3RydWN0dXJlcy4gTGF5b3V0IG1vZHVsZXMgYW5kIHBhaWQgY29zdHMgYXJlXG4gKiBhdXRob3JpdGF0aXZlIHNpbXVsYXRpb24gc3RhdGU7IHJlbmRlcmVyIG1lc2hlcyBhcmUgbm90LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsU3RydWN0dXJlSGFzaCh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCBzdHJ1Y3R1cmVzID0gWy4uLndvcmxkLnN0cnVjdHVyZXMudmFsdWVzKCldXG4gICAgLnNvcnQoKGEsIGIpID0+IChhLmlkIDwgYi5pZCA/IC0xIDogYS5pZCA+IGIuaWQgPyAxIDogMCkpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjpzdHJ1Y3R1cmUtc3RhdGU6djEnKTtcbiAgaC51MzIoc3RydWN0dXJlcy5sZW5ndGgpO1xuICBmb3IgKGNvbnN0IHMgb2Ygc3RydWN0dXJlcykge1xuICAgIGguc3RyaW5nKHMuaWQpO1xuICAgIGguc3RyaW5nKHMua2luZCk7XG4gICAgaC5zdHJpbmcocy5zaXRlSWQpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy54ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy55ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy56ICogMTAwMCkpO1xuICAgIGgudTMyKE1hdGgucm91bmQocy5yb3QgKiAxMDAwMCkpO1xuICAgIC8vIExlZ2FjeSBoYXNoIGlucHV0IGlzIGJ5dGUtaWRlbnRpY2FsLiBEZXNpZ24gMiBhZGRzIGFuIGV4cGxpY2l0IHRhZy5cbiAgICBpZiAocy5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSBoLnN0cmluZygnZGVzaWduOjInKTtcbiAgICBoLnUzMihzLm1vZHVsZXMubGVuZ3RoKTtcbiAgICBmb3IgKGNvbnN0IG0gb2Ygcy5tb2R1bGVzKSB7XG4gICAgICBoLnN0cmluZyhtLmtpbmQpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnggKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueSAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS56ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLncgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0uaCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS5kICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZCgobS5yb3QgPz8gMCkgKiAxMDAwMCkpO1xuICAgICAgaC5zdHJpbmcobS50b25lID8/ICcnKTtcbiAgICB9XG4gICAgY29uc3QgY29zdEtleXMgPSBPYmplY3Qua2V5cyhzLmNvc3QpLnNvcnQoKTtcbiAgICBoLnUzMihjb3N0S2V5cy5sZW5ndGgpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIGNvc3RLZXlzKSB7XG4gICAgICBoLnN0cmluZyhrZXkpO1xuICAgICAgaC51MzIocy5jb3N0W2tleSBhcyBrZXlvZiB0eXBlb2Ygcy5jb3N0XSA/PyAwKTtcbiAgICB9XG4gICAgaC51MzIocy5idWlsdFJldmlzaW9uKTtcbiAgfVxuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYWNoZUhhc2gge1xuICBoYXNoOiBzdHJpbmc7XG4gIGNvbHVtbnM6IG51bWJlcjtcbiAgY2h1bmtzOiBudW1iZXI7XG59XG5cbi8qKiBEZXJpdmVkIGNvbHVtbi1jYWNoZSBoYXNoLiBOb3QgYXV0aG9yaXRhdGl2ZSB0ZXJyYWluIHN0YXRlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlcml2ZWRDYWNoZUhhc2god29ybGQ6IFdvcmxkLCByZWdpb246IFZveGVsUmVnaW9uKTogQ2FjaGVIYXNoIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjpkZXJpdmVkLWNvbHVtbi1jYWNoZTp2MScpO1xuICBoLnUzMihyLngwKTsgaC51MzIoci56MCk7IGgudTMyKHIueDEpOyBoLnUzMihyLnoxKTtcbiAgbGV0IGNvbHVtbnMgPSAwO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2tleX0gd2FzIG5vdCBnZW5lcmF0ZWRgKTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBseDAgPSBNYXRoLm1heCgwLCByLngwIC0gb3gpLCBseDEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci54MSAtIG94KTtcbiAgICBjb25zdCBsejAgPSBNYXRoLm1heCgwLCByLnowIC0gb3opLCBsejEgPSBNYXRoLm1pbihDSFVOS19TSVpFIC0gMSwgci56MSAtIG96KTtcbiAgICBoLnN0cmluZygnY2h1bmsnKTtcbiAgICBoLnUzMihjaHVuay5jeCk7IGgudTMyKGNodW5rLmN6KTtcbiAgICBmb3IgKGxldCBseiA9IGx6MDsgbHogPD0gbHoxOyBseisrKSB7XG4gICAgICBmb3IgKGxldCBseCA9IGx4MDsgbHggPD0gbHgxOyBseCsrKSB7XG4gICAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuICAgICAgICBoLnUzMihjaHVuay5oZWlnaHRzW2NvbF0pO1xuICAgICAgICBoLnUzMihjaHVuay50b3BNYXRlcmlhbHNbY29sXSk7XG4gICAgICAgIGNvbHVtbnMrKztcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgaGFzaDogaC5oZXgoKSwgY29sdW1ucywgY2h1bmtzOiBrZXlzLmxlbmd0aCB9O1xufVxuXG4vKipcbiAqIFJlY29tcHV0ZSBldmVyeSBjb2x1bW4gY2FjaGUgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbCBkYXRhIGFuZCByZXBvcnRcbiAqIG1pc21hdGNoZXMuIFRoaXMgcHJvdmVzIGhlaWdodHMvdG9wTWF0ZXJpYWxzIGFyZSBkZXJpdmVkLCBub3QgYSBzZWNvbmRcbiAqIHRlcnJhaW4gcmVwcmVzZW50YXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaGVja0Rlcml2ZWRDYWNoZXMod29ybGQ6IFdvcmxkLCByZWdpb246IFZveGVsUmVnaW9uLCBsaW1pdCA9IDY0KTogQ2FjaGVNaXNtYXRjaFtdIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXMgPSBlbnN1cmVSZWdpb25DaHVua3Mod29ybGQsIHIpO1xuICBjb25zdCBvdXQ6IENhY2hlTWlzbWF0Y2hbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgY29uc3QgY2h1bmsgPSB3b3JsZC5jaHVua3MuZ2V0KGtleSk7XG4gICAgaWYgKCFjaHVuaykgY29udGludWU7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgbHgwID0gTWF0aC5tYXgoMCwgci54MCAtIG94KSwgbHgxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIueDEgLSBveCk7XG4gICAgY29uc3QgbHowID0gTWF0aC5tYXgoMCwgci56MCAtIG96KSwgbHoxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIuejEgLSBveik7XG4gICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICAgIGxldCB0b3BNYXQgPSBjaHVuay50b3BNYXRlcmlhbHNbY29sXTtcbiAgICAgICAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgICAgICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgoeSksIGx6KV07XG4gICAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkSGVpZ2h0ID0gdG9wU29saWQgLSBZX01JTjtcbiAgICAgICAgaWYgKGNodW5rLmhlaWdodHNbY29sXSAhPT0gZXhwZWN0ZWRIZWlnaHQpIHtcbiAgICAgICAgICBvdXQucHVzaCh7IHg6IG94ICsgbHgsIHo6IG96ICsgbHosIGZpZWxkOiAnaGVpZ2h0JywgZXhwZWN0ZWQ6IGV4cGVjdGVkSGVpZ2h0LCBhY3R1YWw6IGNodW5rLmhlaWdodHNbY29sXSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gIT09IHRvcE1hdCkge1xuICAgICAgICAgIG91dC5wdXNoKHsgeDogb3ggKyBseCwgejogb3ogKyBseiwgZmllbGQ6ICdtYXRlcmlhbCcsIGV4cGVjdGVkOiB0b3BNYXQsIGFjdHVhbDogY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0gfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG91dC5sZW5ndGggPj0gbGltaXQpIHJldHVybiBvdXQ7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWRpdE91dHNpZGUge1xuICBjaHVuazogc3RyaW5nO1xuICBpbmRleDogbnVtYmVyO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBtYXRlcmlhbDogbnVtYmVyO1xufVxuXG4vKiogRXZlcnkgcmVjb3JkZWQgdm94ZWwgZWRpdCBvdXRzaWRlIHRoZSBhdXRob3JpemVkIHdvcmsgZW52ZWxvcGUuICovXG5leHBvcnQgZnVuY3Rpb24gZWRpdHNPdXRzaWRlRW52ZWxvcGUod29ybGQ6IFdvcmxkLCBlbnZlbG9wZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IEVkaXRPdXRzaWRlW10ge1xuICBjb25zdCBvdXQ6IEVkaXRPdXRzaWRlW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBlZGl0c10gb2Ygd29ybGQuZWRpdHMpIHtcbiAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGN4KSwgb3ogPSBjaHVua09yaWdpblooY3opO1xuICAgIGZvciAoY29uc3QgW2luZGV4LCBtYXRlcmlhbF0gb2YgZWRpdHMpIHtcbiAgICAgIGNvbnN0IGx4ID0gaW5kZXggJSBDSFVOS19TSVpFO1xuICAgICAgY29uc3QgbHogPSBNYXRoLmZsb29yKChpbmRleCAlIENIVU5LX0FSRUEpIC8gQ0hVTktfU0laRSk7XG4gICAgICBjb25zdCB5aSA9IE1hdGguZmxvb3IoaW5kZXggLyBDSFVOS19BUkVBKTtcbiAgICAgIGNvbnN0IHggPSBveCArIGx4LCB6ID0gb3ogKyBseiwgeSA9IFlfTUlOICsgeWk7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMoZW52ZWxvcGUsIHgsIHksIHopKSB7XG4gICAgICAgIG91dC5wdXNoKHsgY2h1bms6IGtleSwgaW5kZXgsIHgsIHksIHosIG1hdGVyaWFsIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBvdXQuc29ydCgoYSwgYikgPT4gYS5jaHVuay5sb2NhbGVDb21wYXJlKGIuY2h1bmspIHx8IGEuaW5kZXggLSBiLmluZGV4KTtcbiAgcmV0dXJuIG91dDtcbn1cblxuLyoqIE5ldyBjaHVua3MgZ2VuZXJhdGVkIHNpbmNlIHRoZSBiYXNlbGluZSB0aGF0IGRvIG5vdCBvdmVybGFwIHRoZSBlbnZlbG9wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBuZXdDaHVua3NPdXRzaWRlRW52ZWxvcGUoXG4gIHdvcmxkOiBXb3JsZCwgYmFzZWxpbmVLZXlzOiBJdGVyYWJsZTxzdHJpbmc+LCBlbnZlbG9wZTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSxcbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgYmFzZWxpbmUgPSBuZXcgU2V0KGJhc2VsaW5lS2V5cyk7XG4gIGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBba2V5LCBjaHVua10gb2Ygd29ybGQuY2h1bmtzKSB7XG4gICAgaWYgKGJhc2VsaW5lLmhhcyhrZXkpKSBjb250aW51ZTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgICBjb25zdCBvdmVybGFwcyA9IGVudmVsb3BlLnNvbWUoXG4gICAgICAocikgPT4gb3ggPD0gci54MSAmJiBveCArIENIVU5LX1NJWkUgLSAxID49IHIueDAgJiYgb3ogPD0gci56MSAmJiBveiArIENIVU5LX1NJWkUgLSAxID49IHIuejAsXG4gICAgKTtcbiAgICBpZiAoIW92ZXJsYXBzKSBvdXQucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiBvdXQuc29ydCgpO1xufVxuXG4vKiogQWxsIGNodW5rIGtleXMgY3VycmVudGx5IG1hdGVyaWFsaXNlZCwgc29ydGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNodW5rS2V5cyh3b3JsZDogV29ybGQpOiBzdHJpbmdbXSB7XG4gIHJldHVybiBbLi4ud29ybGQuY2h1bmtzLmtleXMoKV0uc29ydCgpO1xufVxuXG4vKiogQm91bmRpbmcgdm94ZWwgcmVnaW9uIGNvdmVyaW5nIGV2ZXJ5IG1hdGVyaWFsaXNlZCBjaHVuay4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZENodW5rUmVnaW9uKHdvcmxkOiBXb3JsZCk6IFZveGVsUmVnaW9uIHtcbiAgaWYgKHdvcmxkLmNodW5rcy5zaXplID09PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ3dvcmxkIGhhcyBubyBjaHVua3MnKTtcbiAgbGV0IG1pbkN4ID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhDeCA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgbGV0IG1pbkN6ID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBtYXhDeiA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgZm9yIChjb25zdCBjaHVuayBvZiB3b3JsZC5jaHVua3MudmFsdWVzKCkpIHtcbiAgICBtaW5DeCA9IE1hdGgubWluKG1pbkN4LCBjaHVuay5jeCk7IG1heEN4ID0gTWF0aC5tYXgobWF4Q3gsIGNodW5rLmN4KTtcbiAgICBtaW5DeiA9IE1hdGgubWluKG1pbkN6LCBjaHVuay5jeik7IG1heEN6ID0gTWF0aC5tYXgobWF4Q3osIGNodW5rLmN6KTtcbiAgfVxuICByZXR1cm4ge1xuICAgIHgwOiBjaHVua09yaWdpblgobWluQ3gpLFxuICAgIHowOiBjaHVua09yaWdpbloobWluQ3opLFxuICAgIHgxOiBjaHVua09yaWdpblgobWF4Q3gpICsgQ0hVTktfU0laRSAtIDEsXG4gICAgejE6IGNodW5rT3JpZ2luWihtYXhDeikgKyBDSFVOS19TSVpFIC0gMSxcbiAgICB5MDogWV9NSU4sXG4gICAgeTE6IFlfTUFYIC0gMSxcbiAgfTtcbn1cbiIsICIvLyBNMDAyIGRldGVybWluaXN0aWMgZml4dHVyZSBhbmQgbGl2ZS13b3JsZCBsYXlvdXQuXG4vL1xuLy8gVGhlIGZpeHR1cmUgaXMgYSBib3VuZGVkIHNsaWNlIG9mIHRoZSByZWFsIDIwNDggbSB3b3JsZCAoc2VlZCAxMzM3KSwgbm90IGFcbi8vIHN5bnRoZXRpYyBoZWlnaHRmaWVsZC4gSXQgY29udGFpbnM6XG4vLyAgICogYSByZWplY3RlZCBob3VzZSBzaXRlIG9uIGEgNyBtIHJpdmVyLWJhbmsgc2xvcGU7XG4vLyAgICogYSB2aWFibGUgaG91c2Ugc2hlbGYgMjAgbSBhd2F5IHdpdGggMiBtIHJlbGllZiBhbmQgbm8gY2xlYXJpbmcgbmVlZGVkO1xuLy8gICAqIGEgMyBtIGZhcm0gc2xvcGUgMjcgbSBmcm9tIHRoZSBob3VzZSB3aXRoIGEgbmF0dXJhbCBibG9zc29tIHRyZWUgYW5kIG9yZS5cbi8vXG4vLyBUaGUgc2FtZSBjb29yZGluYXRlcywgcXVlcmllcyBhbmQgdmFsaWRhdG9ycyBhcmUgdXNlZCBieSB0aGUgbGl2ZS13b3JsZFxuLy8gYWNjZXB0YW5jZSB0ZXN0LiBUaGUgb25seSBkaWZmZXJlbmNlIGlzIGhvdyBtYW55IGNodW5rcyBhcmUgbWF0ZXJpYWxpc2VkLlxuaW1wb3J0IHtcbiAgV29ybGQsIGNyZWF0ZVdvcmxkLCBnZW5lcmF0ZVdvcmxkLCBnZW5lcmF0ZUNodW5rLCBwbGFjZUF1dGhvcmVkU2l0ZXMsXG4gIFlfTUlOLCBZX01BWCwgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgUmVjdCwgVm94ZWxSZWdpb24gfSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHsgY2h1bmtLZXlzIH0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTTAwMl9TRUVEID0gMTMzNztcblxuLyoqIFBpbm5lZCBwYXRoIHNpdGUgaWQgZm9yIHRoZSBkb29yLXRvLWFwcHJvYWNoIGNvcnJpZG9yLiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfUEFUSF9TSVRFX0lEID0gJ3BhdGgtaG91c2UtZmFybSc7XG5cbi8qKlxuICogUGlubmVkIHN0ZXBwZWQgcHJvZmlsZSBmb3IgdGhlIDkgbSBwYXRoIGZyb20gdGhlIGhvdXNlIGRvb3IgKHggPSAtNTMpIHRvIHRoZVxuICogYXBwcm9hY2ggKHggPSAtNDUpLiBUaGUgcmlzZSBpcyAyIG0gb3ZlciA4IG07IGV2ZXJ5IHN0ZXAgaXMgYXQgbW9zdCAxIG0uXG4gKi9cbmV4cG9ydCBjb25zdCBNMDAyX1BBVEhfUFJPRklMRSA9IFsxMSwgMTEsIDExLCAxMiwgMTIsIDEyLCAxMiwgMTMsIDEzXSBhcyBjb25zdDtcblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWNlQmFuZFNwZWMge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbi8qKiBQaW5uZWQgZmFybSB0ZXJyYWNlcywgaGlnaCBzaWRlIGZpcnN0LiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfVEVSUkFDRV9CQU5EUzogcmVhZG9ubHkgVGVycmFjZUJhbmRTcGVjW10gPSBbXG4gIHsgejA6IC00MiwgejE6IC00MCwgeTogMTYgfSxcbiAgeyB6MDogLTM5LCB6MTogLTM3LCB5OiAxNSB9LFxuICB7IHowOiAtMzYsIHoxOiAtMzUsIHk6IDE0IH0sXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVTcGVjIHtcbiAgaWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIGRvb3I6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGYXJtU3BlYyB7XG4gIGlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIHRlcnJhY2VzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMkxheW91dCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcmVqZWN0ZWQ6IFNpdGVTcGVjO1xuICBob3VzZTogU2l0ZVNwZWM7XG4gIGZhcm06IEZhcm1TcGVjO1xuICBzZWFyY2hBcmVhOiBSZWN0O1xuICB3b3JrWm9uZTogUmVjdDtcbiAgZml4dHVyZUNodW5rczogeyBjeDA6IG51bWJlcjsgY3owOiBudW1iZXI7IGN4MTogbnVtYmVyOyBjejE6IG51bWJlciB9O1xuICBwcm90ZWN0ZWRSZWdpb246IFZveGVsUmVnaW9uO1xuICAvKiogQ29tcGxldGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlIGZvciB0aGUgZmlyc3Qgc2xpY2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xufVxuXG5jb25zdCBGSVhUVVJFX0NIVU5LUyA9IHsgY3gwOiAyOCwgY3owOiAyOSwgY3gxOiAzMiwgY3oxOiAzMiB9IGFzIGNvbnN0O1xuXG5leHBvcnQgY29uc3QgTTAwMl9MQVlPVVQ6IE0wMDJMYXlvdXQgPSB7XG4gIHNlZWQ6IE0wMDJfU0VFRCxcbiAgcmVqZWN0ZWQ6IHtcbiAgICBpZDogJ3NpdGUtYS1yZWplY3RlZCcsXG4gICAgcmVjdDogeyB4MDogLTc0LCB6MDogLTY2LCB4MTogLTY3LCB6MTogLTYxIH0sXG4gICAgLy8gQSBuYWl2ZSBsb3ctc2lkZSBmbG9vcjogdGhlIHVwaGlsbCBjb3JuZXIgd291bGQgbmVlZCA1IG0gb2YgZXhjYXZhdGlvbi5cbiAgICBmbG9vclk6IDMsXG4gICAgZG9vcjogeyB4OiAtNjcsIHo6IC02MyB9LFxuICAgIGFwcHJvYWNoOiB7IHg6IC02MCwgejogLTYzIH0sXG4gIH0sXG4gIGhvdXNlOiB7XG4gICAgaWQ6ICdzaXRlLWItaG91c2UnLFxuICAgIHJlY3Q6IHsgeDA6IC02MCwgejA6IC00NiwgeDE6IC01MywgejE6IC00MSB9LFxuICAgIGZsb29yWTogMTEsXG4gICAgZG9vcjogeyB4OiAtNTMsIHo6IC00MyB9LFxuICAgIGFwcHJvYWNoOiB7IHg6IC00NSwgejogLTQzIH0sXG4gIH0sXG4gIGZhcm06IHtcbiAgICBpZDogJ2ZpZWxkLWMnLFxuICAgIHJlY3Q6IHsgeDA6IC0zOCwgejA6IC00MiwgeDE6IC0yNywgejE6IC0zNSB9LFxuICAgIHRlcnJhY2VzOiAzLFxuICB9LFxuICBzZWFyY2hBcmVhOiB7IHgwOiAtNzYsIHowOiAtNjgsIHgxOiAtNDAsIHoxOiAtNDAgfSxcbiAgd29ya1pvbmU6IHsgeDA6IC03NiwgejA6IC02OCwgeDE6IC0yMywgejE6IC0zMSB9LFxuICBmaXh0dXJlQ2h1bmtzOiBGSVhUVVJFX0NIVU5LUyxcbiAgcHJvdGVjdGVkUmVnaW9uOiB7XG4gICAgeDA6IGNodW5rT3JpZ2luWChGSVhUVVJFX0NIVU5LUy5jeDApLFxuICAgIHowOiBjaHVua09yaWdpblooRklYVFVSRV9DSFVOS1MuY3owKSxcbiAgICB4MTogY2h1bmtPcmlnaW5YKEZJWFRVUkVfQ0hVTktTLmN4MSkgKyAzMSxcbiAgICB6MTogY2h1bmtPcmlnaW5aKEZJWFRVUkVfQ0hVTktTLmN6MSkgKyAzMSxcbiAgICB5MDogWV9NSU4sXG4gICAgeTE6IFlfTUFYIC0gMSxcbiAgfSxcbiAgZW52ZWxvcGU6IFtcbiAgICAvLyBIb3VzZSBmb290cHJpbnQgcGx1cyBhIDIgbSBwcmVwYXJhdGlvbiBidWZmZXIuXG4gICAgeyB4MDogLTYyLCB6MDogLTQ4LCB4MTogLTUxLCB6MTogLTM5LCB5MDogOCwgeTE6IDE2IH0sXG4gICAgLy8gRG9vci10by1hcHByb2FjaCBwYXRoIGNvcnJpZG9yIHBsdXMgYSAxIG0gYnVmZmVyLlxuICAgIHsgeDA6IC01NCwgejA6IC00NCwgeDE6IC00NCwgejE6IC00MiwgeTA6IDksIHkxOiAxNSB9LFxuICAgIC8vIEZhcm0gZm9vdHByaW50IHBsdXMgYSAyIG0gcHJlcGFyYXRpb24gYnVmZmVyLlxuICAgIHsgeDA6IC00MCwgejA6IC00NCwgeDE6IC0yNSwgejE6IC0zMywgeTA6IDEwLCB5MTogMjAgfSxcbiAgXSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMldvcmxkIHtcbiAgd29ybGQ6IFdvcmxkO1xuICBsYXlvdXQ6IE0wMDJMYXlvdXQ7XG4gIC8qKiBTb3J0ZWQgY2h1bmsga2V5cyBtYXRlcmlhbGlzZWQgYXQgZml4dHVyZSBjcmVhdGlvbi4gKi9cbiAgY2h1bmtLZXlzOiBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBTbWFsbCBkZXRlcm1pbmlzdGljIGZpeHR1cmU6IHRoZSAyMCBjaHVua3MgY292ZXJpbmcgdGhlIHdvcmsgem9uZSBhbmQgaXRzXG4gKiBwcm90ZWN0ZWQgc3Vycm91bmRpbmdzLiBGYXN0IGVub3VnaCBmb3IgdGhlIGZ1bGwgdGVzdCBzdWl0ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU0wMDJGaXh0dXJlKHNlZWQgPSBNMDAyX1NFRUQpOiBNMDAyV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQpO1xuICBjb25zdCB7IGN4MCwgY3owLCBjeDEsIGN6MSB9ID0gTTAwMl9MQVlPVVQuZml4dHVyZUNodW5rcztcbiAgZm9yIChsZXQgY3ogPSBjejA7IGN6IDw9IGN6MTsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY3gwOyBjeCA8PSBjeDE7IGN4KyspIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIH1cbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgcmV0dXJuIHsgd29ybGQsIGxheW91dDogTTAwMl9MQVlPVVQsIGNodW5rS2V5czogY2h1bmtLZXlzKHdvcmxkKSB9O1xufVxuXG4vKipcbiAqIExpdmUtd29ybGQgaW50ZWdyYXRpb24gdGFyZ2V0OiB0aGUgc2FtZSBzZWVkIGFuZCBzaXRlcyB3aXRoIGEgOSB4IDkgY2h1bmtcbiAqIG5laWdoYm91cmhvb2QgKDgxIGNodW5rcykgYXJvdW5kIHRoZSBmb3VuZGVyIHZhbGxleS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU0wMDJMaXZlKHNlZWQgPSBNMDAyX1NFRUQsIHJhZGl1cyA9IDQpOiBNMDAyV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoc2VlZCwgcmFkaXVzKTtcbiAgcmV0dXJuIHsgd29ybGQsIGxheW91dDogTTAwMl9MQVlPVVQsIGNodW5rS2V5czogY2h1bmtLZXlzKHdvcmxkKSB9O1xufVxuIiwgIi8vIE0wMDIgc3RhZ2UgNyBzY2VuYXJpbyB3aXJpbmc6IHRoZSBwaW5uZWQgZmlyc3Qgc2xpY2UsIHJ1biB0aHJvdWdoIHRoZSBzYW1lXG4vLyBwdWJsaWMgc2ltdWxhdGlvbiBwaXBlbGluZSB1c2VkIGJ5IHRoZSBwbGF5ZXIsIHRoZSBBSSBhbmQgdGhlIHRlc3RzLlxuLy9cbi8vIFRoZSBzY2VuYXJpbyBpcyBkZWxpYmVyYXRlbHkgcGxhaW4gZGF0YSBpbiAvIGRhdGEgb3V0LiBJdCBkb2VzIG5vdCB0b3VjaCB0aGVcbi8vIHJlbmRlcmVyLCBhbmQgZXZlcnkgdGVycmFpbiBlZGl0IHN0aWxsIGdvZXMgdGhyb3VnaCBwcmVwYXJlU2l0ZSAtPlxuLy8gTG9jYWxBdXRob3JpemVyIC0+IGV4ZWN1dGVQcmVwYXJhdGlvbi4gU3RydWN0dXJlcyBzdGlsbCBnbyB0aHJvdWdoXG4vLyBidWlsZFN0cnVjdHVyZSAtPiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIgLT4gZXhlY3V0ZVN0cnVjdHVyZS5cbmltcG9ydCB7IE1BVCwgUmVzb3VyY2VUeXBlIH0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBNMDAyV29ybGQsIE0wMDJfTEFZT1VULCBNMDAyX1BBVEhfUFJPRklMRSwgTTAwMl9QQVRIX1NJVEVfSUQsXG4gIE0wMDJfVEVSUkFDRV9CQU5EUyxcbn0gZnJvbSAnLi9tMDAyJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHsgSE9VU0VfUlVMRVMsIFBBVEhfUlVMRVMsIEZBUk1fUlVMRVMgfSBmcm9tICcuL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBDb2x1bW5UYXJnZXQsIExvY2FsQXV0aG9yaXplciwgcHJlcGFyZVNpdGUsIFByZXBhcmF0aW9uTGVkZ2VyLFxufSBmcm9tICcuL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7XG4gIExvY2FsU3RydWN0dXJlQXV0aG9yaXplciwgYnVpbGRTdHJ1Y3R1cmUsIFN0cnVjdHVyZUxlZGdlcixcbn0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcbmltcG9ydCB7XG4gIGNhbm9uaWNhbEVudGl0eUhhc2gsIGNhbm9uaWNhbEludmVudG9yeUhhc2gsIGNhbm9uaWNhbFJlZ2lvbkhhc2gsXG4gIGNhbm9uaWNhbFN0cnVjdHVyZUhhc2gsIGludmVudG9yeVNuYXBzaG90LFxufSBmcm9tICcuL2Nhbm9uaWNhbCc7XG5cbmV4cG9ydCBjb25zdCBNMDAyX1NUQVJURVJfSU5WRU5UT1JZOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBudW1iZXI+PiA9IHtcbiAgd29vZDogMjQsXG4gIHN0b25lOiA0OCxcbn07XG5cbi8qKiBUaGUgOSB4IDMgbSBjb3JyaWRvciBmcm9tIHRoZSBob3VzZSBkb29yIHRvIHRoZSBhcHByb2FjaC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyUGF0aFJlY3QoKTogUmVjdCB7XG4gIGNvbnN0IGRvb3IgPSBNMDAyX0xBWU9VVC5ob3VzZS5kb29yO1xuICBjb25zdCBhcHByb2FjaCA9IE0wMDJfTEFZT1VULmhvdXNlLmFwcHJvYWNoO1xuICByZXR1cm4ge1xuICAgIHgwOiBkb29yLngsXG4gICAgejA6IGRvb3IueiAtIDEsXG4gICAgeDE6IGFwcHJvYWNoLngsXG4gICAgejE6IGRvb3IueiArIDEsXG4gIH07XG59XG5cbi8qKiBPbmUgdGFyZ2V0IHBlciBwYXRoIGNvbHVtbiwgdXNpbmcgdGhlIHBpbm5lZCBzdGVwcGVkIHByb2ZpbGUuICovXG5leHBvcnQgZnVuY3Rpb24gbTAwMlBhdGhUYXJnZXRzKCk6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3QgcmVjdCA9IG0wMDJQYXRoUmVjdCgpO1xuICBjb25zdCB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IE0wMDJfUEFUSF9QUk9GSUxFLmxlbmd0aDsgaSsrKSB7XG4gICAgZm9yIChsZXQgeiA9IHJlY3QuejA7IHogPD0gcmVjdC56MTsgeisrKSB7XG4gICAgICB0YXJnZXRzLnB1c2goeyB4OiByZWN0LngwICsgaSwgeiwgeTogTTAwMl9QQVRIX1BST0ZJTEVbaV0gfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiB0YXJnZXRzO1xufVxuXG4vKiogT25lIHRhcmdldCBwZXIgZmFybSBjb2x1bW4sIHVzaW5nIHRoZSBwaW5uZWQgdGVycmFjZSBiYW5kcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyRmFybVRhcmdldHMoKTogQ29sdW1uVGFyZ2V0W10ge1xuICBjb25zdCByZWN0ID0gTTAwMl9MQVlPVVQuZmFybS5yZWN0O1xuICBjb25zdCB0YXJnZXRzOiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGJhbmQgb2YgTTAwMl9URVJSQUNFX0JBTkRTKSB7XG4gICAgZm9yIChsZXQgeiA9IGJhbmQuejA7IHogPD0gYmFuZC56MTsgeisrKSB7XG4gICAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICAgICAgdGFyZ2V0cy5wdXNoKHsgeCwgeiwgeTogYmFuZC55IH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gdGFyZ2V0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMDAyU2NlbmFyaW9PcHRpb25zIHtcbiAgLyoqIFN0YXJ0ZXIgcmVzb3VyY2VzIGJlZm9yZSB0aGUgc2xpY2UgcnVucy4gRGVmYXVsdHMgdG8gd29vZCAyNCAvIHN0b25lIDQ4LiAqL1xuICBpbnZlbnRvcnk/OiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE0wMDJTY2VuYXJpb1NpdGUge1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25MZWRnZXIgfCBudWxsO1xuICBzdHJ1Y3R1cmU6IFN0cnVjdHVyZUxlZGdlciB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMlNjZW5hcmlvUmVzdWx0IHtcbiAgb2s6IGJvb2xlYW47XG4gIGVycm9yczogc3RyaW5nW107XG4gIGhvdXNlOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBwYXRoOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBmYXJtOiBNMDAyU2NlbmFyaW9TaXRlO1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBoYXNoZXM6IHtcbiAgICB2b3hlbHM6IHN0cmluZztcbiAgICBzdHJ1Y3R1cmVzOiBzdHJpbmc7XG4gICAgaW52ZW50b3J5OiBzdHJpbmc7XG4gICAgZW50aXRpZXM6IHN0cmluZztcbiAgfTtcbn1cblxuZnVuY3Rpb24gZW1wdHlTaXRlKCk6IE0wMDJTY2VuYXJpb1NpdGUge1xuICByZXR1cm4geyBwcmVwYXJhdGlvbjogbnVsbCwgc3RydWN0dXJlOiBudWxsIH07XG59XG5cbmZ1bmN0aW9uIGRlc2NyaWJlRmFpbHVyZShyZXN1bHQ6IHsgY29kZTogc3RyaW5nOyByZWFzb25zOiBzdHJpbmdbXSB9KTogc3RyaW5nIHtcbiAgcmV0dXJuIGAke3Jlc3VsdC5jb2RlfTogJHtyZXN1bHQucmVhc29ucy5qb2luKCc7ICcpfWA7XG59XG5cbi8qKlxuICogUnVuIGhvdXNlLCBwYXRoIGFuZCB0ZXJyYWNlZCBmYXJtIGluIHRoZWlyIHBpbm5lZCBvcmRlci4gQSBmYWlsZWQgc3RlcCBpc1xuICogcmVjb3JkZWQgYW5kIGxhdGVyIGluZGVwZW5kZW50IHN0ZXBzIHN0aWxsIHJ1bjsgYSBzdHJ1Y3R1cmUgaXMgbmV2ZXIgYnVpbHRcbiAqIHVubGVzcyBpdHMgb3duIHRlcnJhaW4gcHJlcGFyYXRpb24gc3VjY2VlZGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcnVuTTAwMlNjZW5hcmlvKFxuICBtMDAyOiBNMDAyV29ybGQsIG9wdGlvbnM6IE0wMDJTY2VuYXJpb09wdGlvbnMgPSB7fSxcbik6IE0wMDJTY2VuYXJpb1Jlc3VsdCB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gbTAwMjtcbiAgY29uc3Qgc3RhcnRlciA9IG9wdGlvbnMuaW52ZW50b3J5ID8/IE0wMDJfU1RBUlRFUl9JTlZFTlRPUlk7XG4gIHdvcmxkLmludmVudG9yeSA9IHt9O1xuICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhzdGFydGVyKSkge1xuICAgIGlmICgoYW1vdW50ID8/IDApID4gMCkgd29ybGQuaW52ZW50b3J5W3Jlc291cmNlXSA9IGFtb3VudCBhcyBudW1iZXI7XG4gIH1cblxuICBjb25zdCBwcmVwQXV0aG9yaXplciA9IG5ldyBMb2NhbEF1dGhvcml6ZXIoeyBlbnZlbG9wZTogbGF5b3V0LmVudmVsb3BlIH0pO1xuICBjb25zdCBzdHJ1Y3R1cmVBdXRob3JpemVyID0gbmV3IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcih7IGVudmVsb3BlOiBsYXlvdXQuZW52ZWxvcGUgfSk7XG4gIGNvbnN0IGludmVudG9yeUJlZm9yZSA9IGludmVudG9yeVNuYXBzaG90KHdvcmxkKTtcbiAgY29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBob3VzZSA9IGVtcHR5U2l0ZSgpO1xuICBjb25zdCBwYXRoID0gZW1wdHlTaXRlKCk7XG4gIGNvbnN0IGZhcm0gPSBlbXB0eVNpdGUoKTtcblxuICBjb25zdCBob3VzZVByZXAgPSBwcmVwYXJlU2l0ZSh3b3JsZCwgcHJlcEF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IGxheW91dC5ob3VzZS5pZCxcbiAgICByZWN0OiBsYXlvdXQuaG91c2UucmVjdCxcbiAgICBmbG9vclk6IGxheW91dC5ob3VzZS5mbG9vclksXG4gICAgcnVsZXM6IEhPVVNFX1JVTEVTLFxuICB9KTtcbiAgaWYgKCFob3VzZVByZXAub2spIHtcbiAgICBlcnJvcnMucHVzaChgaG91c2UgcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKGhvdXNlUHJlcCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgaG91c2UucHJlcGFyYXRpb24gPSBob3VzZVByZXAubGVkZ2VyO1xuICAgIGNvbnN0IGhvdXNlQnVpbGQgPSBidWlsZFN0cnVjdHVyZSh3b3JsZCwgc3RydWN0dXJlQXV0aG9yaXplciwge1xuICAgICAgc2l0ZUlkOiBsYXlvdXQuaG91c2UuaWQsXG4gICAgICBraW5kOiAnaG91c2UnLFxuICAgICAgcmVjdDogbGF5b3V0LmhvdXNlLnJlY3QsXG4gICAgICBmbG9vclk6IGxheW91dC5ob3VzZS5mbG9vclksXG4gICAgICBkb29yOiBsYXlvdXQuaG91c2UuZG9vcixcbiAgICB9KTtcbiAgICBpZiAoIWhvdXNlQnVpbGQub2spIHtcbiAgICAgIGVycm9ycy5wdXNoKGBob3VzZSBzdHJ1Y3R1cmU6ICR7ZGVzY3JpYmVGYWlsdXJlKGhvdXNlQnVpbGQpfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBob3VzZS5zdHJ1Y3R1cmUgPSBob3VzZUJ1aWxkLmxlZGdlcjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBwYXRoUmVjdCA9IG0wMDJQYXRoUmVjdCgpO1xuICBjb25zdCBwYXRoUHJlcCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwge1xuICAgIHNpdGVJZDogTTAwMl9QQVRIX1NJVEVfSUQsXG4gICAgcmVjdDogcGF0aFJlY3QsXG4gICAgZmxvb3JZOiAxMixcbiAgICBydWxlczogUEFUSF9SVUxFUyxcbiAgfSwge1xuICAgIHRhcmdldHM6IG0wMDJQYXRoVGFyZ2V0cygpLFxuICAgIHN1cmZhY2VNYXRlcmlhbDogTUFULkdSQVZFTCxcbiAgICBlbnZlbG9wZTogW2xheW91dC5lbnZlbG9wZVsxXV0sXG4gIH0pO1xuICBpZiAoIXBhdGhQcmVwLm9rKSB7XG4gICAgZXJyb3JzLnB1c2goYHBhdGggcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKHBhdGhQcmVwKX1gKTtcbiAgfSBlbHNlIHtcbiAgICBwYXRoLnByZXBhcmF0aW9uID0gcGF0aFByZXAubGVkZ2VyO1xuICAgIGNvbnN0IHBhdGhCdWlsZCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCB7XG4gICAgICBzaXRlSWQ6IE0wMDJfUEFUSF9TSVRFX0lELFxuICAgICAga2luZDogJ3BhdGgnLFxuICAgICAgcmVjdDogcGF0aFJlY3QsXG4gICAgICBmbG9vclk6IDEyLFxuICAgIH0pO1xuICAgIGlmICghcGF0aEJ1aWxkLm9rKSB7XG4gICAgICBlcnJvcnMucHVzaChgcGF0aCBzdHJ1Y3R1cmU6ICR7ZGVzY3JpYmVGYWlsdXJlKHBhdGhCdWlsZCl9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhdGguc3RydWN0dXJlID0gcGF0aEJ1aWxkLmxlZGdlcjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBmYXJtUHJlcCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwge1xuICAgIHNpdGVJZDogbGF5b3V0LmZhcm0uaWQsXG4gICAgcmVjdDogbGF5b3V0LmZhcm0ucmVjdCxcbiAgICBmbG9vclk6IDE1LFxuICAgIHJ1bGVzOiBGQVJNX1JVTEVTLFxuICB9LCB7XG4gICAgdGFyZ2V0czogbTAwMkZhcm1UYXJnZXRzKCksXG4gICAgc3VyZmFjZU1hdGVyaWFsOiBNQVQuU09JTCxcbiAgICBlbnZlbG9wZTogW2xheW91dC5lbnZlbG9wZVsyXV0sXG4gIH0pO1xuICBpZiAoIWZhcm1QcmVwLm9rKSB7XG4gICAgZXJyb3JzLnB1c2goYGZhcm0gcHJlcGFyYXRpb246ICR7ZGVzY3JpYmVGYWlsdXJlKGZhcm1QcmVwKX1gKTtcbiAgfSBlbHNlIHtcbiAgICBmYXJtLnByZXBhcmF0aW9uID0gZmFybVByZXAubGVkZ2VyO1xuICAgIGNvbnN0IGZhcm1CdWlsZCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCB7XG4gICAgICBzaXRlSWQ6IGxheW91dC5mYXJtLmlkLFxuICAgICAga2luZDogJ3RlcnJhY2UnLFxuICAgICAgcmVjdDogbGF5b3V0LmZhcm0ucmVjdCxcbiAgICAgIGZsb29yWTogMTUsXG4gICAgICB0ZXJyYWNlczogbGF5b3V0LmZhcm0udGVycmFjZXMsXG4gICAgfSk7XG4gICAgaWYgKCFmYXJtQnVpbGQub2spIHtcbiAgICAgIGVycm9ycy5wdXNoKGBmYXJtIHN0cnVjdHVyZTogJHtkZXNjcmliZUZhaWx1cmUoZmFybUJ1aWxkKX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmFybS5zdHJ1Y3R1cmUgPSBmYXJtQnVpbGQubGVkZ2VyO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgb2s6IGVycm9ycy5sZW5ndGggPT09IDAsXG4gICAgZXJyb3JzLFxuICAgIGhvdXNlLFxuICAgIHBhdGgsXG4gICAgZmFybSxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICBoYXNoZXM6IHtcbiAgICAgIHZveGVsczogY2Fub25pY2FsUmVnaW9uSGFzaCh3b3JsZCwgbGF5b3V0LnByb3RlY3RlZFJlZ2lvbikuaGFzaCxcbiAgICAgIHN0cnVjdHVyZXM6IGNhbm9uaWNhbFN0cnVjdHVyZUhhc2god29ybGQpLFxuICAgICAgaW52ZW50b3J5OiBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKHdvcmxkKSxcbiAgICAgIGVudGl0aWVzOiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkLCBsYXlvdXQucHJvdGVjdGVkUmVnaW9uKSxcbiAgICB9LFxuICB9O1xufVxuXG4vKiogVG90YWwgcmVzb3VyY2VzIHBhaWQgdG8gc3RydWN0dXJlcyBpbiBhIHNjZW5hcmlvIHJlc3VsdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtMDAyU3RydWN0dXJlQ29zdHMocmVzdWx0OiBNMDAyU2NlbmFyaW9SZXN1bHQpOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+IHtcbiAgY29uc3QgdG90YWw6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7fTtcbiAgZm9yIChjb25zdCBzaXRlIG9mIFtyZXN1bHQuaG91c2UsIHJlc3VsdC5wYXRoLCByZXN1bHQuZmFybV0pIHtcbiAgICBmb3IgKGNvbnN0IFtyZXNvdXJjZSwgYW1vdW50XSBvZiBPYmplY3QuZW50cmllcyhzaXRlLnN0cnVjdHVyZT8uY29zdFBhaWQgPz8ge30pKSB7XG4gICAgICB0b3RhbFtyZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGVdID0gKHRvdGFsW3Jlc291cmNlIGFzIFJlc291cmNlVHlwZV0gPz8gMCkgKyAoYW1vdW50ID8/IDApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdG90YWw7XG59XG4iLCAiLy8gU2NoZW1hLTMgbGlmZSBsb29wLiBBbGwgcXVhbnRpdGllcyBhcmUgaW50ZWdlcnMgYW5kIGFsbCBtdXRhdGlvbnMgYXJlIGRyaXZlblxuLy8gYnkgYWNjZXB0ZWQgY29tbWFuZHM7IHdhbGwtY2xvY2sgdGltZSBhbmQgcmVuZGVyaW5nIG5ldmVyIGFkdmFuY2UgdGhpcyBzdGF0ZS5cbmltcG9ydCB0eXBlIHsgV29ybGQgfSBmcm9tICcuL3dvcmxkJztcblxuZXhwb3J0IGNvbnN0IExJRkVfUkVTT1VSQ0VTID0gWydmaWJlcicsICdmb29kJywgJ29yZScsICdyYXRpb25zJywgJ3NlZWQnLCAnc3RvbmUnLCAnd29vZCddIGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgTGlmZVJlc291cmNlID0gKHR5cGVvZiBMSUZFX1JFU09VUkNFUylbbnVtYmVyXTtcbmV4cG9ydCBjb25zdCBDQVJSSUVEX0NBUEFDSVRZID0gMTIwO1xuZXhwb3J0IGNvbnN0IFNUT0NLUElMRV9DQVBBQ0lUWSA9IDIwMDtcbmV4cG9ydCBjb25zdCBNQVhfUFJPRFVDVElPTl9KT0JTID0gMTY7XG5leHBvcnQgY29uc3QgTUFYX1RJQ0tTX1BFUl9DT01NQU5EID0gNjQ7XG5leHBvcnQgY29uc3QgQ1JPUF9HUk9XVEhfVElDS1MgPSA0O1xuZXhwb3J0IGNvbnN0IEZPVU5ERVJfU1RPQ0tQSUxFX0lEID0gJ3N0b2NrcGlsZTpmb3VuZGVyJztcbmV4cG9ydCBjb25zdCBGT1VOREVSX1NUT0NLUElMRSA9IHsgaWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCB4OiAtNTAsIHo6IC0zMiwgY2FwYWNpdHk6IFNUT0NLUElMRV9DQVBBQ0lUWSB9IGFzIGNvbnN0O1xuXG5leHBvcnQgdHlwZSBMaWZlUmVzb3VyY2VCYWcgPSBQYXJ0aWFsPFJlY29yZDxMaWZlUmVzb3VyY2UsIG51bWJlcj4+O1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b2NrcGlsZSB7XG4gIGlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICBjYXBhY2l0eTogdHlwZW9mIFNUT0NLUElMRV9DQVBBQ0lUWTtcbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xufVxuXG5leHBvcnQgdHlwZSBSZWNpcGVJZCA9ICdzZWVkJyB8ICdyYXRpb25zJztcbmV4cG9ydCBjb25zdCBSRUNJUEVTOiBSZWNvcmQ8UmVjaXBlSWQsIHsgaW5wdXQ6IExpZmVSZXNvdXJjZUJhZzsgb3V0cHV0OiBMaWZlUmVzb3VyY2VCYWc7IHRpY2tzOiBudW1iZXIgfT4gPSB7XG4gIHNlZWQ6IHsgaW5wdXQ6IHsgZmliZXI6IDIgfSwgb3V0cHV0OiB7IHNlZWQ6IDMgfSwgdGlja3M6IDEgfSxcbiAgcmF0aW9uczogeyBpbnB1dDogeyBmb29kOiAyIH0sIG91dHB1dDogeyByYXRpb25zOiAzIH0sIHRpY2tzOiAyIH0sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFByb2R1Y3Rpb25Kb2Ige1xuICBpZDogc3RyaW5nO1xuICBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICByZWNpcGU6IFJlY2lwZUlkO1xuICByZW1haW5pbmdUaWNrczogbnVtYmVyO1xufVxuXG4vKiogRml4ZWQgcGxvdHMgY29ycmVzcG9uZCB0byB0aGUgbmluZSBhdXRob3JpdGF0aXZlIHRlcnJhY2UgY3JvcC1yb3cgdm9sdW1lcy4gKi9cbmV4cG9ydCBjb25zdCBDUk9QX1BMT1RfSURTID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogOSB9LCAoXywgaSkgPT4gYGNyb3A6JHtpfWApO1xuZXhwb3J0IGludGVyZmFjZSBDcm9wUGxvdCB7XG4gIGlkOiBzdHJpbmc7XG4gIHBsYW50ZWRUaWNrOiBudW1iZXI7XG4gIGdyb3d0aFRpY2tzOiB0eXBlb2YgQ1JPUF9HUk9XVEhfVElDS1M7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlmZVN0YXRlIHtcbiAgc3RvY2twaWxlczogTWFwPHN0cmluZywgU3RvY2twaWxlPjtcbiAgam9iczogTWFwPHN0cmluZywgUHJvZHVjdGlvbkpvYj47XG4gIGNyb3BzOiBNYXA8c3RyaW5nLCBDcm9wUGxvdD47XG4gIHRpY2s6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxpZmVTdGF0ZSgpOiBMaWZlU3RhdGUge1xuICByZXR1cm4ge1xuICAgIHN0b2NrcGlsZXM6IG5ldyBNYXAoW1tGT1VOREVSX1NUT0NLUElMRV9JRCwge1xuICAgICAgaWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCB4OiBGT1VOREVSX1NUT0NLUElMRS54LCB6OiBGT1VOREVSX1NUT0NLUElMRS56LFxuICAgICAgY2FwYWNpdHk6IFNUT0NLUElMRV9DQVBBQ0lUWSwgaW52ZW50b3J5OiB7fSxcbiAgICB9XV0pLCBqb2JzOiBuZXcgTWFwKCksIGNyb3BzOiBuZXcgTWFwKCksIHRpY2s6IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3RhbChiYWc6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pOiBudW1iZXIge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyhiYWcpLnJlZHVjZSgoc3VtLCBhbW91bnQpID0+IHN1bSArIGFtb3VudCwgMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZUJhZyhiYWc6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcbiAgcmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhiYWcpLmZpbHRlcigoWywgYW1vdW50XSkgPT4gYW1vdW50ID4gMClcbiAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGlmZVN0YXRlKHdvcmxkOiBXb3JsZCk6IExpZmVTdGF0ZSB7XG4gIGlmICghd29ybGQubGlmZSkgdGhyb3cgbmV3IEVycm9yKCdsaWZlLWxvb3AgY29tbWFuZHMgcmVxdWlyZSBhIHNjaGVtYS0zIHdvcmxkJyk7XG4gIHJldHVybiB3b3JsZC5saWZlO1xufVxuXG5leHBvcnQgdHlwZSBMaWZlRmFpbHVyZSA9IHsgb2s6IGZhbHNlOyBjb2RlOiBzdHJpbmc7IHJlYXNvbnM6IHN0cmluZ1tdIH07XG5leHBvcnQgdHlwZSBMaWZlU3VjY2VzczxUPiA9IHsgb2s6IHRydWU7IHZhbHVlOiBUIH07XG5leHBvcnQgdHlwZSBMaWZlUmVzdWx0PFQ+ID0gTGlmZVN1Y2Nlc3M8VD4gfCBMaWZlRmFpbHVyZTtcbmZ1bmN0aW9uIHJlamVjdExpZmUoY29kZTogc3RyaW5nLCByZWFzb25zOiBzdHJpbmdbXSk6IExpZmVGYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBjb2RlLCByZWFzb25zIH07XG59XG50eXBlIFBhcnNlZEFtb3VudCA9IHsgb2s6IHRydWU7IHJlc291cmNlOiBMaWZlUmVzb3VyY2U7IGFtb3VudDogbnVtYmVyIH0gfCB7IG9rOiBmYWxzZTsgcmVhc29uczogc3RyaW5nW10gfTtcbmZ1bmN0aW9uIHJlcXVpcmVBbW91bnQoYmFnOiBMaWZlUmVzb3VyY2VCYWcpOiBQYXJzZWRBbW91bnQge1xuICBjb25zdCBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXMoYmFnKTtcbiAgaWYgKGVudHJpZXMubGVuZ3RoICE9PSAxKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbnM6IFsndHJhbnNmZXIgZXhhY3RseSBvbmUgcmVzb3VyY2UgYXQgYSB0aW1lJ10gfTtcbiAgY29uc3QgW3Jlc291cmNlLCBhbW91bnRdID0gZW50cmllc1swXTtcbiAgaWYgKCFMSUZFX1JFU09VUkNFUy5pbmNsdWRlcyhyZXNvdXJjZSBhcyBMaWZlUmVzb3VyY2UpIHx8ICFOdW1iZXIuaXNTYWZlSW50ZWdlcihhbW91bnQpIHx8IChhbW91bnQgPz8gMCkgPD0gMCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uczogWydyZXNvdXJjZSBhbW91bnQgbXVzdCBiZSBhIHBvc2l0aXZlIGludGVnZXInXSB9O1xuICB9XG4gIHJldHVybiB7IG9rOiB0cnVlLCByZXNvdXJjZTogcmVzb3VyY2UgYXMgTGlmZVJlc291cmNlLCBhbW91bnQgfTtcbn1cblxuZnVuY3Rpb24gbW92ZSh3b3JsZDogV29ybGQsIGZyb206IFJlY29yZDxzdHJpbmcsIG51bWJlcj4sIHRvOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+LFxuICByZXF1ZXN0ZWQ6IExpZmVSZXNvdXJjZUJhZywgdG9DYXBhY2l0eTogbnVtYmVyKTogTGlmZVJlc3VsdDxMaWZlUmVzb3VyY2VCYWc+IHtcbiAgY29uc3QgY2hlY2tlZCA9IHJlcXVpcmVBbW91bnQocmVxdWVzdGVkKTtcbiAgaWYgKCFjaGVja2VkLm9rKSByZXR1cm4gcmVqZWN0TGlmZSgnaW52YWxpZF90cmFuc2ZlcicsIFtjaGVja2VkLnJlYXNvbnNbMF1dKTtcbiAgY29uc3QgeyByZXNvdXJjZSwgYW1vdW50IH0gPSBjaGVja2VkO1xuICBpZiAoKGZyb21bcmVzb3VyY2VdID8/IDApIDwgYW1vdW50KSByZXR1cm4gcmVqZWN0TGlmZSgnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsIFtgbmVlZCAke2Ftb3VudH0gJHtTdHJpbmcocmVzb3VyY2UpfSwgaGF2ZSAke2Zyb21bcmVzb3VyY2VdID8/IDB9YF0pO1xuICBpZiAodG90YWwodG8pICsgYW1vdW50ID4gdG9DYXBhY2l0eSkgcmV0dXJuIHJlamVjdExpZmUoJ2NhcGFjaXR5X2V4Y2VlZGVkJywgW2BkZXN0aW5hdGlvbiBjYXBhY2l0eSAke3RvQ2FwYWNpdHl9IHdvdWxkIGJlIGV4Y2VlZGVkYF0pO1xuICBmcm9tW3Jlc291cmNlXSA9IChmcm9tW3Jlc291cmNlXSA/PyAwKSAtIGFtb3VudDtcbiAgaWYgKGZyb21bcmVzb3VyY2VdID09PSAwKSBkZWxldGUgZnJvbVtyZXNvdXJjZV07XG4gIHRvW3Jlc291cmNlXSA9ICh0b1tyZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyBbcmVzb3VyY2VdOiBhbW91bnQgfSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJhbnNmZXIod29ybGQ6IFdvcmxkLCBraW5kOiAnZGVwb3NpdCcgfCAnd2l0aGRyYXcnLCBiYWc6IExpZmVSZXNvdXJjZUJhZyk6IExpZmVSZXN1bHQ8TGlmZVJlc291cmNlQmFnPiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBjb25zdCBzdG9jayA9IGxpZmUuc3RvY2twaWxlcy5nZXQoRk9VTkRFUl9TVE9DS1BJTEVfSUQpO1xuICBpZiAoIXN0b2NrKSByZXR1cm4gcmVqZWN0TGlmZSgnbWlzc2luZ19zdG9ja3BpbGUnLCBbJ2ZvdW5kZXIgc3RvY2twaWxlIGlzIGFic2VudCddKTtcbiAgcmV0dXJuIGtpbmQgPT09ICdkZXBvc2l0J1xuICAgID8gbW92ZSh3b3JsZCwgd29ybGQuaW52ZW50b3J5LCBzdG9jay5pbnZlbnRvcnksIGJhZywgc3RvY2suY2FwYWNpdHkpXG4gICAgOiBtb3ZlKHdvcmxkLCBzdG9jay5pbnZlbnRvcnksIHdvcmxkLmludmVudG9yeSwgYmFnLCBDQVJSSUVEX0NBUEFDSVRZKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0UHJvZHVjdGlvbih3b3JsZDogV29ybGQsIHJlY2lwZUlkOiBSZWNpcGVJZCwgam9iSWQ6IHN0cmluZyk6IExpZmVSZXN1bHQ8UHJvZHVjdGlvbkpvYj4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgY29uc3Qgc3RvY2sgPSBsaWZlLnN0b2NrcGlsZXMuZ2V0KEZPVU5ERVJfU1RPQ0tQSUxFX0lEKTtcbiAgaWYgKCFzdG9jaykgcmV0dXJuIHJlamVjdExpZmUoJ21pc3Npbmdfc3RvY2twaWxlJywgWydmb3VuZGVyIHN0b2NrcGlsZSBpcyBhYnNlbnQnXSk7XG4gIGlmIChsaWZlLmpvYnMuaGFzKGpvYklkKSkgcmV0dXJuIHJlamVjdExpZmUoJ2R1cGxpY2F0ZV9qb2InLCBbJ3Byb2R1Y3Rpb24gam9iIGFscmVhZHkgZXhpc3RzJ10pO1xuICBpZiAobGlmZS5qb2JzLnNpemUgPj0gTUFYX1BST0RVQ1RJT05fSk9CUykgcmV0dXJuIHJlamVjdExpZmUoJ2pvYl9saW1pdCcsIFtgYXQgbW9zdCAke01BWF9QUk9EVUNUSU9OX0pPQlN9IGpvYnMgbWF5IGJlIGFjdGl2ZWBdKTtcbiAgY29uc3QgcmVjaXBlID0gUkVDSVBFU1tyZWNpcGVJZF07XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHJlY2lwZS5pbnB1dCkpIHtcbiAgICBpZiAoKHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMCkgPCAoYW1vdW50ID8/IDApKSB7XG4gICAgICByZXR1cm4gcmVqZWN0TGlmZSgnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsIFtgbmVlZCAke2Ftb3VudH0gJHtTdHJpbmcocmVzb3VyY2UpfSwgaGF2ZSAke3N0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMH1gXSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHJlc2VydmVkT3V0cHV0ID0gWy4uLmxpZmUuam9icy52YWx1ZXMoKV0uZmlsdGVyKChqKSA9PiBqLnN0b2NrcGlsZUlkID09PSBzdG9jay5pZClcbiAgICAucmVkdWNlKChzdW0sIGpvYikgPT4gc3VtICsgdG90YWwoY2xvbmVCYWcoUkVDSVBFU1tqb2IucmVjaXBlXS5vdXRwdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPikpLCAwKTtcbiAgaWYgKHRvdGFsKHN0b2NrLmludmVudG9yeSkgLSB0b3RhbChjbG9uZUJhZyhyZWNpcGUuaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPikpXG4gICAgKyByZXNlcnZlZE91dHB1dCArIHRvdGFsKGNsb25lQmFnKHJlY2lwZS5vdXRwdXQgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPikpID4gc3RvY2suY2FwYWNpdHkpIHtcbiAgICByZXR1cm4gcmVqZWN0TGlmZSgnY2FwYWNpdHlfZXhjZWVkZWQnLCBbJ3Jlc2VydmVkIHByb2R1Y3Rpb24gb3V0cHV0IHdvdWxkIGV4Y2VlZCBzdG9ja3BpbGUgY2FwYWNpdHknXSk7XG4gIH1cbiAgZm9yIChjb25zdCBbcmVzb3VyY2UsIGFtb3VudF0gb2YgT2JqZWN0LmVudHJpZXMocmVjaXBlLmlucHV0KSkge1xuICAgIHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPSAoc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSAtIChhbW91bnQgPz8gMCk7XG4gICAgaWYgKHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPT09IDApIGRlbGV0ZSBzdG9jay5pbnZlbnRvcnlbcmVzb3VyY2VdO1xuICB9XG4gIGNvbnN0IGpvYjogUHJvZHVjdGlvbkpvYiA9IHsgaWQ6IGpvYklkLCBzdG9ja3BpbGVJZDogc3RvY2suaWQsIHJlY2lwZTogcmVjaXBlSWQsIHJlbWFpbmluZ1RpY2tzOiByZWNpcGUudGlja3MgfTtcbiAgbGlmZS5qb2JzLnNldChqb2IuaWQsIGpvYik7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogeyAuLi5qb2IgfSB9O1xufVxuXG4vKiogUGxhbnQgaW50byBhbiBlbXB0eSBmaXhlZCB0ZXJyYWNlIHBsb3QuIFRoZSBmb3VuZGVyIGZhcm0gbXVzdCBhbHJlYWR5IGV4aXN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW50Q3JvcCh3b3JsZDogV29ybGQsIHBsb3RJZDogc3RyaW5nKTogTGlmZVJlc3VsdDxDcm9wUGxvdD4ge1xuICBjb25zdCBsaWZlID0gbGlmZVN0YXRlKHdvcmxkKTtcbiAgaWYgKCFDUk9QX1BMT1RfSURTLmluY2x1ZGVzKHBsb3RJZCkpIHJldHVybiByZWplY3RMaWZlKCdpbnZhbGlkX3Bsb3QnLCBbJ3Vua25vd24gY3JvcCBwbG90J10pO1xuICBpZiAoIVsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb21lKChzKSA9PiBzLmtpbmQgPT09ICd0ZXJyYWNlJykpIHtcbiAgICByZXR1cm4gcmVqZWN0TGlmZSgnZmFybV9yZXF1aXJlZCcsIFsnYnVpbGQgdGhlIGZvdW5kZXIgdGVycmFjZWQgZmFybSBiZWZvcmUgcGxhbnRpbmcnXSk7XG4gIH1cbiAgaWYgKGxpZmUuY3JvcHMuaGFzKHBsb3RJZCkpIHJldHVybiByZWplY3RMaWZlKCdwbG90X29jY3VwaWVkJywgWydjcm9wIHBsb3QgaXMgYWxyZWFkeSBwbGFudGVkJ10pO1xuICBjb25zdCBzdG9jayA9IGxpZmUuc3RvY2twaWxlcy5nZXQoRk9VTkRFUl9TVE9DS1BJTEVfSUQpO1xuICBpZiAoIXN0b2NrIHx8IChzdG9jay5pbnZlbnRvcnkuc2VlZCA/PyAwKSA8IDEpIHJldHVybiByZWplY3RMaWZlKCdpbnN1ZmZpY2llbnRfcmVzb3VyY2VzJywgWyduZWVkIDEgc2VlZCBpbiB0aGUgZm91bmRlciBzdG9ja3BpbGUnXSk7XG4gIHN0b2NrLmludmVudG9yeS5zZWVkIS0tO1xuICBpZiAoc3RvY2suaW52ZW50b3J5LnNlZWQgPT09IDApIGRlbGV0ZSBzdG9jay5pbnZlbnRvcnkuc2VlZDtcbiAgY29uc3QgY3JvcDogQ3JvcFBsb3QgPSB7IGlkOiBwbG90SWQsIHBsYW50ZWRUaWNrOiBsaWZlLnRpY2ssIGdyb3d0aFRpY2tzOiBDUk9QX0dST1dUSF9USUNLUyB9O1xuICBsaWZlLmNyb3BzLnNldChwbG90SWQsIGNyb3ApO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgLi4uY3JvcCB9IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcm9wUmVhZHkoY3JvcDogQ3JvcFBsb3QsIHRpY2s6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gdGljayAtIGNyb3AucGxhbnRlZFRpY2sgPj0gY3JvcC5ncm93dGhUaWNrcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RDcm9wKHdvcmxkOiBXb3JsZCwgcGxvdElkOiBzdHJpbmcpOiBMaWZlUmVzdWx0PHsgZm9vZDogbnVtYmVyOyBmaWJlcjogbnVtYmVyIH0+IHtcbiAgY29uc3QgbGlmZSA9IGxpZmVTdGF0ZSh3b3JsZCk7XG4gIGNvbnN0IGNyb3AgPSBsaWZlLmNyb3BzLmdldChwbG90SWQpO1xuICBpZiAoIWNyb3ApIHJldHVybiByZWplY3RMaWZlKCdub3RfcGxhbnRlZCcsIFsnY3JvcCBwbG90IGlzIGVtcHR5J10pO1xuICBpZiAoIWNyb3BSZWFkeShjcm9wLCBsaWZlLnRpY2spKSByZXR1cm4gcmVqZWN0TGlmZSgnY3JvcF9ub3RfcmVhZHknLCBbYGNyb3AgbmVlZHMgJHtjcm9wLmdyb3d0aFRpY2tzIC0gKGxpZmUudGljayAtIGNyb3AucGxhbnRlZFRpY2spfSBtb3JlIHRpY2tzYF0pO1xuICAvLyBQbGFudCBncm93dGggaXMgdGhlIGV4cGxpY2l0IGJpb2xvZ2ljYWwgc291cmNlOyBldmVyeSBvdGhlciBsaWZlLWxvb3BcbiAgLy8gdHJhbnNmb3JtYXRpb24gY29uc2VydmVzIGl0cyBkZWNsYXJlZCBpbnB1dHMgYW5kIG91dHB1dHMuXG4gIGNvbnN0IHlpZWxkQmFnID0geyBmb29kOiA2LCBmaWJlcjogMSB9O1xuICBpZiAodG90YWwod29ybGQuaW52ZW50b3J5KSArIHlpZWxkQmFnLmZvb2QgKyB5aWVsZEJhZy5maWJlciA+IENBUlJJRURfQ0FQQUNJVFkpIHtcbiAgICByZXR1cm4gcmVqZWN0TGlmZSgnY2FwYWNpdHlfZXhjZWVkZWQnLCBbYGNhcnJpZWQgY2FwYWNpdHkgJHtDQVJSSUVEX0NBUEFDSVRZfSB3b3VsZCBiZSBleGNlZWRlZGBdKTtcbiAgfVxuICB3b3JsZC5pbnZlbnRvcnkuZm9vZCA9ICh3b3JsZC5pbnZlbnRvcnkuZm9vZCA/PyAwKSArIHlpZWxkQmFnLmZvb2Q7XG4gIHdvcmxkLmludmVudG9yeS5maWJlciA9ICh3b3JsZC5pbnZlbnRvcnkuZmliZXIgPz8gMCkgKyB5aWVsZEJhZy5maWJlcjtcbiAgbGlmZS5jcm9wcy5kZWxldGUocGxvdElkKTtcbiAgd29ybGQucmV2aXNpb24rKztcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHZhbHVlOiB5aWVsZEJhZyB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRpY2tPdXRjb21lIHtcbiAgZnJvbVRpY2s6IG51bWJlcjtcbiAgdG9UaWNrOiBudW1iZXI7XG4gIGNvbXBsZXRlZEpvYnM6IEFycmF5PHsgaWQ6IHN0cmluZzsgcmVjaXBlOiBSZWNpcGVJZDsgb3V0cHV0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IH0+O1xuICByZWFkeUNyb3BzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkdmFuY2VUaWNrcyh3b3JsZDogV29ybGQsIGNvdW50OiBudW1iZXIpOiBMaWZlUmVzdWx0PFRpY2tPdXRjb21lPiB7XG4gIGNvbnN0IGxpZmUgPSBsaWZlU3RhdGUod29ybGQpO1xuICBpZiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKGNvdW50KSB8fCBjb3VudCA8IDEgfHwgY291bnQgPiBNQVhfVElDS1NfUEVSX0NPTU1BTkQpIHtcbiAgICByZXR1cm4gcmVqZWN0TGlmZSgnaW52YWxpZF90aWNrX2NvdW50JywgW2B0aWNrcyBtdXN0IGJlIGFuIGludGVnZXIgZnJvbSAxIHRvICR7TUFYX1RJQ0tTX1BFUl9DT01NQU5EfWBdKTtcbiAgfVxuICBjb25zdCBjb21wbGV0ZWQ6IFRpY2tPdXRjb21lWydjb21wbGV0ZWRKb2JzJ10gPSBbXTtcbiAgY29uc3QgZnJvbVRpY2sgPSBsaWZlLnRpY2s7XG4gIC8vIEpvYnMgYXJlIHByb2Nlc3NlZCBpbiBzdGFibGUgaWQgb3JkZXIgYXQgZWFjaCB0aWNrLCBuZXZlciBtYXAgaW5zZXJ0aW9uLFxuICAvLyB3YWxsIHRpbWUsIGZyYW1lIGRlbHRhLCBvciBhc3luY2hyb25vdXMgY29tcGxldGlvbiBvcmRlci5cbiAgZm9yIChsZXQgc3RlcCA9IDA7IHN0ZXAgPCBjb3VudDsgc3RlcCsrKSB7XG4gICAgbGlmZS50aWNrKys7XG4gICAgZm9yIChjb25zdCBqb2Igb2YgWy4uLmxpZmUuam9icy52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKSkge1xuICAgICAgam9iLnJlbWFpbmluZ1RpY2tzLS07XG4gICAgICBpZiAoam9iLnJlbWFpbmluZ1RpY2tzID4gMCkgY29udGludWU7XG4gICAgICBjb25zdCBzdG9jayA9IGxpZmUuc3RvY2twaWxlcy5nZXQoam9iLnN0b2NrcGlsZUlkKTtcbiAgICAgIGlmICghc3RvY2spIHRocm93IG5ldyBFcnJvcignYWN0aXZlIHByb2R1Y3Rpb24gcmVmZXJlbmNlcyBhIG1pc3Npbmcgc3RvY2twaWxlJyk7XG4gICAgICBjb25zdCBvdXRwdXQgPSBjbG9uZUJhZyhSRUNJUEVTW2pvYi5yZWNpcGVdLm91dHB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KTtcbiAgICAgIGlmICh0b3RhbChzdG9jay5pbnZlbnRvcnkpICsgdG90YWwob3V0cHV0KSA+IHN0b2NrLmNhcGFjaXR5KSB0aHJvdyBuZXcgRXJyb3IoJ3Jlc2VydmVkIHByb2R1Y3Rpb24gb3V0cHV0IGV4Y2VlZHMgY2FwYWNpdHknKTtcbiAgICAgIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKG91dHB1dCkpIHN0b2NrLmludmVudG9yeVtyZXNvdXJjZV0gPSAoc3RvY2suaW52ZW50b3J5W3Jlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgICAgIGxpZmUuam9icy5kZWxldGUoam9iLmlkKTtcbiAgICAgIGNvbXBsZXRlZC5wdXNoKHsgaWQ6IGpvYi5pZCwgcmVjaXBlOiBqb2IucmVjaXBlLCBvdXRwdXQgfSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHJlYWR5Q3JvcHMgPSBbLi4ubGlmZS5jcm9wcy52YWx1ZXMoKV0uZmlsdGVyKChjcm9wKSA9PiBjcm9wUmVhZHkoY3JvcCwgbGlmZS50aWNrKVxuICAgICYmIGNyb3AucGxhbnRlZFRpY2sgKyBjcm9wLmdyb3d0aFRpY2tzID4gZnJvbVRpY2spLm1hcCgoY3JvcCkgPT4gY3JvcC5pZCkuc29ydCgpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IHsgZnJvbVRpY2ssIHRvVGljazogbGlmZS50aWNrLCBjb21wbGV0ZWRKb2JzOiBjb21wbGV0ZWQsIHJlYWR5Q3JvcHMgfSB9O1xufVxuIiwgIi8vIFZlcnNpb25lZCwgSlNPTi1zYWZlIHNuYXBzaG90cyBvZiBjb21wbGV0ZSBhdXRob3JpdGF0aXZlIE0wMDIgc3RhdGUuXG4vLyBDaHVuayBieXRlcywgaGVpZ2h0L21hdGVyaWFsIGNhY2hlcywgcmVuZGVyZXIgZGF0YSBhbmQgdGltaW5nIGNvdW50ZXJzIGFyZVxuLy8gcmVnZW5lcmF0ZWQgZnJvbSB0aGUgbWFuaWZlc3QgYW5kIGR1cmFibGUgZWRpdHM7IHRoZXkgYXJlIG5vdCBhIHNlY29uZCBzYXZlLlxuaW1wb3J0IHtcbiAgQ0hVTktfU0laRSwgQ0hVTktfVk9MVU1FLCBDSFVOS1NfUEVSX1NJREUsIEVudGl0eSwgRW50aXR5S2luZCxcbiAgR0VORVJBVE9SX1ZFUlNJT04sIEhBTEYsIE1hdElkLCBSZXNvdXJjZVR5cGUsIFdvcmxkLCBXb3JsZE1hbmlmZXN0LFxuICBjcmVhdGVXb3JsZCwgcGxhY2VBdXRob3JlZFNpdGVzLCB3b3JsZE1hbmlmZXN0LCBlbnN1cmVDaHVuaywgaXNSZXRpcmVkU3RvbmVLaW5kLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04sIFN0cnVjdHVyZSB9IGZyb20gJy4vc3RydWN0dXJlcyc7XG5pbXBvcnQge1xuICBlbmFibGVTdG9uZVJlcGxheSwgZmluaXNoU3RvbmVSZXBsYXksIGlzSGlzdG9yaWNhbFN0b25lSGFzaCwgaXNTdG9uZVJlcGxheSxcbn0gZnJvbSAnLi9zdG9uZS1jb21wYXQnO1xuaW1wb3J0IHtcbiAgQ0FSUklFRF9DQVBBQ0lUWSwgQ1JPUF9HUk9XVEhfVElDS1MsIENST1BfUExPVF9JRFMsIEZPVU5ERVJfU1RPQ0tQSUxFLFxuICBGT1VOREVSX1NUT0NLUElMRV9JRCwgTElGRV9SRVNPVVJDRVMsIE1BWF9QUk9EVUNUSU9OX0pPQlMsIE1BWF9USUNLU19QRVJfQ09NTUFORCxcbiAgUkVDSVBFUywgU1RPQ0tQSUxFX0NBUEFDSVRZLCBjcmVhdGVMaWZlU3RhdGUsXG59IGZyb20gJy4vZWNvbm9teSc7XG5cbmV4cG9ydCBjb25zdCBTTkFQU0hPVF9TQ0hFTUEgPSAxIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IERFU0lHTl9TTkFQU0hPVF9TQ0hFTUEgPSAyIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BID0gMyBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBNQVhfU05BUFNIT1RfSlNPTl9CWVRFUyA9IDI1XzAwMF8wMDA7XG5leHBvcnQgY29uc3QgTUFYX1NOQVBTSE9UX0VESVRTID0gMV8wMDBfMDAwO1xuZXhwb3J0IGNvbnN0IE1BWF9TTkFQU0hPVF9FTlRJVElFUyA9IDUwMF8wMDA7XG5cbmludGVyZmFjZSBCYXNlV29ybGRTbmFwc2hvdCB7XG4gIHNjaGVtYTogdHlwZW9mIFNOQVBTSE9UX1NDSEVNQSB8IHR5cGVvZiBERVNJR05fU05BUFNIT1RfU0NIRU1BIHwgdHlwZW9mIENVUlJFTlRfU05BUFNIT1RfU0NIRU1BO1xuICBtYW5pZmVzdDogV29ybGRNYW5pZmVzdDtcbiAgcmV2aXNpb246IG51bWJlcjtcbiAgZWRpdHM6IEFycmF5PHsgY2h1bms6IHN0cmluZzsgY2VsbHM6IEFycmF5PHsgaTogbnVtYmVyOyBtOiBudW1iZXIgfT4gfT47XG4gIGVudGl0aWVzOiBFbnRpdHlbXTtcbiAgLyoqIENodW5rcyB3aXRoIGR1cmFibGUgZ2VuZXJhdGVkLWVudGl0eSBjaGFuZ2VzOyBwdXJlIHF1ZXJpZXMgYXJlIGV4Y2x1ZGVkLiAqL1xuICBlbnRpdHlDaHVua3M6IHN0cmluZ1tdO1xuICBlbnRpdHlSZW1vdmFsczogc3RyaW5nW107XG4gIGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgc3RydWN0dXJlczogU3RydWN0dXJlW107XG4gIGF1dGhvcmVkUGxhY2VkOiBib29sZWFuO1xuICAvKiogTmV4dCBhY2NlcHRlZCBqb3VybmFsIHNlcXVlbmNlIGF0IHRoaXMgc25hcHNob3QgYm91bmRhcnkuICovXG4gIG5leHRTZXF1ZW5jZTogbnVtYmVyO1xufVxuZXhwb3J0IHR5cGUgV29ybGRTbmFwc2hvdCA9IEJhc2VXb3JsZFNuYXBzaG90ICYgKHtcbiAgc2NoZW1hOiB0eXBlb2YgU05BUFNIT1RfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9TTkFQU0hPVF9TQ0hFTUE7XG59IHwge1xuICBzY2hlbWE6IHR5cGVvZiBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQTtcbiAgdGljazogbnVtYmVyO1xuICBzdG9ja3BpbGVzOiBBcnJheTx7XG4gICAgaWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDsgeDogbnVtYmVyOyB6OiBudW1iZXI7XG4gICAgY2FwYWNpdHk6IHR5cGVvZiBTVE9DS1BJTEVfQ0FQQUNJVFk7IGludmVudG9yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgfT47XG4gIGpvYnM6IEFycmF5PHtcbiAgICBpZDogc3RyaW5nOyBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEO1xuICAgIHJlY2lwZTogJ3NlZWQnIHwgJ3JhdGlvbnMnOyByZW1haW5pbmdUaWNrczogbnVtYmVyO1xuICB9PjtcbiAgY3JvcHM6IEFycmF5PHsgaWQ6IHN0cmluZzsgcGxhbnRlZFRpY2s6IG51bWJlcjsgZ3Jvd3RoVGlja3M6IHR5cGVvZiBDUk9QX0dST1dUSF9USUNLUyB9Pjtcbn0pO1xudHlwZSBMaWZlU25hcHNob3QgPSBFeHRyYWN0PFdvcmxkU25hcHNob3QsIHsgc2NoZW1hOiB0eXBlb2YgQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgfT47XG5cbmZ1bmN0aW9uIGNsb25lRW50aXR5KGU6IEVudGl0eSk6IEVudGl0eSB7XG4gIHJldHVybiB7XG4gICAgaWQ6IGUuaWQsIGtpbmQ6IGUua2luZCwgY2h1bms6IGUuY2h1bmssIHg6IGUueCwgeTogZS55LCB6OiBlLnosXG4gICAgcm90OiBlLnJvdCwgc2NhbGU6IGUuc2NhbGUsIHZhcmlhbnQ6IGUudmFyaWFudCwgcmVzb3VyY2U6IGUucmVzb3VyY2UsXG4gICAgcmVtYWluaW5nOiBlLnJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0OiBlLnlpZWxkUGVySGFydmVzdCwgaGFydmVzdGVkOiBlLmhhcnZlc3RlZCxcbiAgICAuLi4oZS5oYXJ2ZXN0ZWRPbmNlID09PSB1bmRlZmluZWQgPyB7fSA6IHsgaGFydmVzdGVkT25jZTogZS5oYXJ2ZXN0ZWRPbmNlIH0pLFxuICAgIHByb3Zpc2lvbmFsOiBlLnByb3Zpc2lvbmFsLCBhdXRob3JlZDogZS5hdXRob3JlZCxcbiAgfTtcbn1cblxuZnVuY3Rpb24gY2xvbmVTdHJ1Y3R1cmUoczogU3RydWN0dXJlKTogU3RydWN0dXJlIHtcbiAgcmV0dXJuIHtcbiAgICAuLi5zLFxuICAgIG1vZHVsZXM6IHMubW9kdWxlcy5tYXAoKG0pID0+ICh7IC4uLm0gfSkpLFxuICAgIGNvc3Q6IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhzLmNvc3QpLmZpbHRlcigoWywgYW1vdW50XSkgPT4gKGFtb3VudCA/PyAwKSA+IDApXG4gICAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGRTbmFwc2hvdChcbiAgd29ybGQ6IFdvcmxkLCBuZXh0U2VxdWVuY2UgPSAwLFxuICBzY2hlbWE6IFdvcmxkU25hcHNob3RbJ3NjaGVtYSddID0gd29ybGQubGlmZSA/IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BXG4gICAgOiBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV0uc29tZSgocykgPT4gcy5kZXNpZ25WZXJzaW9uID09PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKVxuICAgICAgPyBERVNJR05fU05BUFNIT1RfU0NIRU1BIDogU05BUFNIT1RfU0NIRU1BLFxuKTogV29ybGRTbmFwc2hvdCB7XG4gIGlmIChzY2hlbWEgIT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BICYmICh3b3JsZC5saWZlIHx8IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb21lKFxuICAgIChzKSA9PiBzY2hlbWEgPT09IFNOQVBTSE9UX1NDSEVNQSAmJiBzLmRlc2lnblZlcnNpb24gIT09IHVuZGVmaW5lZCxcbiAgKSkpIHRocm93IG5ldyBFcnJvcignbGVnYWN5IHNuYXBzaG90cyBjYW5ub3QgY29udGFpbiBuZXdlciBhdXRob3JpdGF0aXZlIHN0YXRlJyk7XG4gIGNvbnN0IGJhc2U6IEJhc2VXb3JsZFNuYXBzaG90ID0ge1xuICAgIHNjaGVtYSxcbiAgICBtYW5pZmVzdDogd29ybGRNYW5pZmVzdCh3b3JsZCksXG4gICAgcmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgIGVkaXRzOiBbLi4ud29ybGQuZWRpdHMuZW50cmllcygpXS5zb3J0KChbYV0sIFtiXSkgPT4gYS5sb2NhbGVDb21wYXJlKGIpKS5tYXAoXG4gICAgICAoW2NodW5rLCBjZWxsc10pID0+ICh7XG4gICAgICAgIGNodW5rLFxuICAgICAgICBjZWxsczogWy4uLmNlbGxzLmVudHJpZXMoKV0uc29ydCgoW2FdLCBbYl0pID0+IGEgLSBiKS5tYXAoKFtpLCBtXSkgPT4gKHsgaSwgbSB9KSksXG4gICAgICB9KSxcbiAgICApLFxuICAgIGVudGl0aWVzOiBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldLmZpbHRlcigoZSkgPT4gKGlzSGlzdG9yaWNhbFN0b25lSGFzaCh3b3JsZCkgfHwgIWlzUmV0aXJlZFN0b25lS2luZChlLmtpbmQpKVxuICAgICAgJiYgKGUuYXV0aG9yZWQgfHwgd29ybGQuZW50aXR5Q2hhbmdlcy5oYXMoZS5jaHVuaykpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSkubWFwKGNsb25lRW50aXR5KSxcbiAgICBlbnRpdHlDaHVua3M6IFsuLi53b3JsZC5lbnRpdHlDaGFuZ2VzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLFxuICAgIGVudGl0eVJlbW92YWxzOiBbLi4ud29ybGQuZW50aXR5UmVtb3ZhbHNdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gICAgaW52ZW50b3J5OiBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMod29ybGQuaW52ZW50b3J5KS5maWx0ZXIoKFssIGFtb3VudF0pID0+IGFtb3VudCA+IDApXG4gICAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpLFxuICAgIHN0cnVjdHVyZXM6IFsuLi53b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcChjbG9uZVN0cnVjdHVyZSksXG4gICAgYXV0aG9yZWRQbGFjZWQ6IHdvcmxkLmF1dGhvcmVkUGxhY2VkLFxuICAgIG5leHRTZXF1ZW5jZSxcbiAgfTtcbiAgaWYgKHNjaGVtYSAhPT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEpIHJldHVybiB7IC4uLmJhc2UsIHNjaGVtYSB9IGFzIFdvcmxkU25hcHNob3Q7XG4gIGlmICghd29ybGQubGlmZSkgdGhyb3cgbmV3IEVycm9yKCdzY2hlbWEtMyBzbmFwc2hvdCByZXF1aXJlcyBsaWZlIHN0YXRlJyk7XG4gIHJldHVybiB7XG4gICAgLi4uYmFzZSwgc2NoZW1hLFxuICAgIHRpY2s6IHdvcmxkLmxpZmUudGljayxcbiAgICBzdG9ja3BpbGVzOiBbLi4ud29ybGQubGlmZS5zdG9ja3BpbGVzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcCgocykgPT4gKHtcbiAgICAgIGlkOiBzLmlkLCB4OiBzLngsIHo6IHMueiwgY2FwYWNpdHk6IHMuY2FwYWNpdHksXG4gICAgICBpbnZlbnRvcnk6IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhzLmludmVudG9yeSkuZmlsdGVyKChbLCBhbW91bnRdKSA9PiBhbW91bnQgPiAwKVxuICAgICAgICAuc29ydCgoW2FdLCBbYl0pID0+IGEubG9jYWxlQ29tcGFyZShiKSkpLFxuICAgIH0pKSxcbiAgICBqb2JzOiBbLi4ud29ybGQubGlmZS5qb2JzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcCgoaikgPT4gKHsgLi4uaiB9KSksXG4gICAgY3JvcHM6IFsuLi53b3JsZC5saWZlLmNyb3BzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpLm1hcCgoYykgPT4gKHsgLi4uYyB9KSksXG4gIH07XG59XG5cbi8qKiBUd28gbGFuZXMsIHdpdGggbGVuZ3RoIGluY2x1ZGVkOyBub3QgYSBjcnlwdG9ncmFwaGljIGludGVncml0eSBzaWduYXR1cmUuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsSGFzaCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgYSA9IDB4ODExYzlkYzUsIGIgPSAweDllMzc3OWI5O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIGEgPSBNYXRoLmltdWwoYSBeIGMsIDB4MDEwMDAxOTMpO1xuICAgIGIgPSBNYXRoLmltdWwoYiBeIChjICsgMHg5ZSksIDB4ODVlYmNhNmIpO1xuICAgIGIgXj0gYiA+Pj4gMTM7XG4gIH1cbiAgcmV0dXJuIChhID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKSArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbFdvcmxkSGFzaChcbiAgd29ybGQ6IFdvcmxkLCBuZXh0U2VxdWVuY2UgPSAwLCBzY2hlbWE6IFdvcmxkU25hcHNob3RbJ3NjaGVtYSddID0gREVTSUdOX1NOQVBTSE9UX1NDSEVNQSxcbik6IHN0cmluZyB7XG4gIHJldHVybiBjYW5vbmljYWxIYXNoKEpTT04uc3RyaW5naWZ5KGNyZWF0ZVdvcmxkU25hcHNob3Qod29ybGQsIG5leHRTZXF1ZW5jZSwgc2NoZW1hKSkpO1xufVxuXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB1aW50KHZhbHVlOiB1bmtub3duLCBtYXhpbXVtOiBudW1iZXIpOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNTYWZlSW50ZWdlcih2YWx1ZSkgJiYgdmFsdWUgPj0gMCAmJiB2YWx1ZSA8PSBtYXhpbXVtO1xufVxuXG5mdW5jdGlvbiBmaW5pdGUodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB0ZXh0KHZhbHVlOiB1bmtub3duLCBtYXhpbXVtID0gMjU2KTogdmFsdWUgaXMgc3RyaW5nIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUubGVuZ3RoID4gMCAmJiB2YWx1ZS5sZW5ndGggPD0gbWF4aW11bTtcbn1cblxuZnVuY3Rpb24gdmFsaWRDaHVuayhrZXk6IHVua25vd24pOiBrZXkgaXMgc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiBrZXkgIT09ICdzdHJpbmcnIHx8ICEvXi0/XFxkKywtP1xcZCskLy50ZXN0KGtleSkpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIoY3gpICYmIE51bWJlci5pc0ludGVnZXIoY3opXG4gICAgJiYgY3ggPj0gMCAmJiBjeiA+PSAwICYmIGN4IDwgQ0hVTktTX1BFUl9TSURFICYmIGN6IDwgQ0hVTktTX1BFUl9TSURFO1xufVxuXG4vKiogQSBzdHJpY3QgbGVnYWN5IHNuYXBzaG90IGlzIGFscmVhZHkgY2Fub25pY2FsIGNyZWF0ZVdvcmxkU25hcHNob3Qgb3V0cHV0LlxuICogVmVyaWZ5IGl0cyByZWNvcmRlZCBib3VuZGFyeSBiZWZvcmUgZmlsdGVyaW5nIHRoZSB0aHJlZSByZXRpcmVkIHN0b25lIGZvcm1zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCk6IHN0cmluZyB7XG4gIHJldHVybiBjYW5vbmljYWxIYXNoKEpTT04uc3RyaW5naWZ5KHNuYXBzaG90KSk7XG59XG5cbi8qKiBNaWdyYXRpb24gb25seTogbm8gaW52ZW50b3J5LCBzdHJ1Y3R1cmUsIGxpZmUsIGVkaXQgb3IgY29tbWFuZCBkYXRhIGNoYW5nZXMuICovXG4vKiogQGludGVybmFsIFJldGlyZSBvbmx5IGFmdGVyIHJlY29uc3RydWN0aW5nIHRoZSBvbGQgc3RhdGUgaW4gcmVwbGF5IG1vZGUuICovXG5leHBvcnQgZnVuY3Rpb24gbWlncmF0ZVN0b25lU25hcHNob3Qoc25hcHNob3Q6IFdvcmxkU25hcHNob3QpOiBXb3JsZFNuYXBzaG90IHtcbiAgY29uc3QgcmVtb3ZhbHMgPSBuZXcgU2V0KHNuYXBzaG90LmVudGl0eVJlbW92YWxzKTtcbiAgZm9yIChjb25zdCBlbnRpdHkgb2Ygc25hcHNob3QuZW50aXRpZXMpIHtcbiAgICBpZiAoaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSAmJiAhZW50aXR5LmF1dGhvcmVkKSByZW1vdmFscy5hZGQoZW50aXR5LmlkKTtcbiAgfVxuICBjb25zdCBlbnRpdHlDaHVua3MgPSBuZXcgU2V0KHNuYXBzaG90LmVudGl0eUNodW5rcyk7XG4gIGZvciAoY29uc3QgZW50aXR5IG9mIHNuYXBzaG90LmVudGl0aWVzKSB7XG4gICAgaWYgKGlzUmV0aXJlZFN0b25lS2luZChlbnRpdHkua2luZCkpIHtcbiAgICAgIGVudGl0eUNodW5rcy5hZGQoZW50aXR5LmNodW5rKTtcbiAgICAgIGlmICghZW50aXR5LmF1dGhvcmVkKSByZW1vdmFscy5hZGQoZW50aXR5LmlkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtcbiAgICAuLi5zbmFwc2hvdCxcbiAgICBlbnRpdGllczogc25hcHNob3QuZW50aXRpZXMuZmlsdGVyKChlbnRpdHkpID0+ICFpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSxcbiAgICBlbnRpdHlDaHVua3M6IFsuLi5lbnRpdHlDaHVua3NdLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSksXG4gICAgZW50aXR5UmVtb3ZhbHM6IFsuLi5yZW1vdmFsc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSxcbiAgfTtcbn1cbmNvbnN0IEVOVElUWV9LSU5EUyA9IG5ldyBTZXQ8RW50aXR5S2luZD4oW1xuICAnc3R5bF90cmVlX3NwaXJlJywgJ3N0eWxfdHJlZV90YWJsZScsICdzdHlsX3RyZWVfY2x1c3RlcicsICdzdHlsX3RyZWVfYmxvc3NvbScsXG4gICdzdHlsX3NocnViJywgJ3N0eWxfcm9ja19zbWFsbCcsICdzdHlsX3JvY2tfbWVkaXVtJywgJ3N0eWxfcm9ja19sYXJnZScsXG4gICdzdHlsX29yZScsICdzdHlsX2NhaXJuJywgJ3dheXN0b25lJywgJ21hcmtlcicsXG5dKTtcbmNvbnN0IFJFU09VUkNFUyA9IG5ldyBTZXQ8UmVzb3VyY2VUeXBlPihbJ3dvb2QnLCAnc3RvbmUnLCAnb3JlJywgJ2ZpYmVyJ10pO1xuY29uc3QgUkVDT1JEX1JFU09VUkNFUyA9IG5ldyBTZXQ8c3RyaW5nPihMSUZFX1JFU09VUkNFUyk7XG5jb25zdCBTVFJVQ1RVUkVfS0lORFMgPSBuZXcgU2V0KFsnaG91c2UnLCAncGF0aCcsICd0ZXJyYWNlJ10pO1xuY29uc3QgTU9EVUxFX0tJTkRTID0gbmV3IFNldChbXG4gICdmbG9vcicsICd3YWxsJywgJ3Bvc3QnLCAnbGludGVsJywgJ3Jvb2YnLCAncGFyYXBldCcsICd3aW5kb3cnLCAnZG9vcicsXG4gICd0aHJlc2hvbGQnLCAncGF0aCcsICdjdXJiJywgJ3NvaWxfYmVkJywgJ3JldGFpbmluZ193YWxsJywgJ2Nyb3Bfcm93Jyxcbl0pO1xuY29uc3QgTU9EVUxFX1RPTkVTID0gbmV3IFNldChbJ3N0b25lJywgJ3N0b25lX2InLCAnb2NocmUnLCAndGltYmVyJywgJ2FjY2VudCcsICdzb2lsJywgJ2Nyb3AnLCAnZ3JhdmVsJ10pO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZUVudGl0eSh2YWx1ZTogdW5rbm93biwgaWRzOiBTZXQ8c3RyaW5nPik6IEVudGl0eSB7XG4gIGlmICghaXNPYmplY3QodmFsdWUpIHx8ICF0ZXh0KHZhbHVlLmlkKSB8fCBpZHMuaGFzKHZhbHVlLmlkKVxuICAgIHx8ICF0ZXh0KHZhbHVlLmtpbmQpIHx8ICFFTlRJVFlfS0lORFMuaGFzKHZhbHVlLmtpbmQgYXMgRW50aXR5S2luZClcbiAgICB8fCAhdmFsaWRDaHVuayh2YWx1ZS5jaHVuaylcbiAgICB8fCAhZmluaXRlKHZhbHVlLngpIHx8ICFmaW5pdGUodmFsdWUueSkgfHwgIWZpbml0ZSh2YWx1ZS56KVxuICAgIHx8IHZhbHVlLnggPCAtSEFMRiB8fCB2YWx1ZS54ID49IEhBTEYgfHwgdmFsdWUueiA8IC1IQUxGIHx8IHZhbHVlLnogPj0gSEFMRlxuICAgIHx8ICFmaW5pdGUodmFsdWUucm90KSB8fCAhZmluaXRlKHZhbHVlLnNjYWxlKSB8fCAhdWludCh2YWx1ZS52YXJpYW50LCAxMDAwKVxuICAgIHx8IHZhbHVlLnJlc291cmNlICE9PSBudWxsICYmICEodHlwZW9mIHZhbHVlLnJlc291cmNlID09PSAnc3RyaW5nJyAmJiBSRVNPVVJDRVMuaGFzKHZhbHVlLnJlc291cmNlIGFzIFJlc291cmNlVHlwZSkpXG4gICAgfHwgIXVpbnQodmFsdWUucmVtYWluaW5nLCAxXzAwMF8wMDApIHx8ICF1aW50KHZhbHVlLnlpZWxkUGVySGFydmVzdCwgMV8wMDBfMDAwKVxuICAgIHx8IHR5cGVvZiB2YWx1ZS5oYXJ2ZXN0ZWQgIT09ICdib29sZWFuJyB8fCB0eXBlb2YgdmFsdWUucHJvdmlzaW9uYWwgIT09ICdib29sZWFuJ1xuICAgIHx8IHR5cGVvZiB2YWx1ZS5hdXRob3JlZCAhPT0gJ2Jvb2xlYW4nXG4gICAgfHwgdmFsdWUuaGFydmVzdGVkT25jZSAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiB2YWx1ZS5oYXJ2ZXN0ZWRPbmNlICE9PSAnYm9vbGVhbicpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGNvbnRhaW5zIGFuIGludmFsaWQgb3IgZHVwbGljYXRlIGVudGl0eScpO1xuICB9XG4gIGlkcy5hZGQodmFsdWUuaWQpO1xuICByZXR1cm4ge1xuICAgIGlkOiB2YWx1ZS5pZCwga2luZDogdmFsdWUua2luZCBhcyBFbnRpdHlLaW5kLCBjaHVuazogdmFsdWUuY2h1bmssXG4gICAgeDogdmFsdWUueCwgeTogdmFsdWUueSwgejogdmFsdWUueiwgcm90OiB2YWx1ZS5yb3QsIHNjYWxlOiB2YWx1ZS5zY2FsZSxcbiAgICB2YXJpYW50OiB2YWx1ZS52YXJpYW50LCByZXNvdXJjZTogdmFsdWUucmVzb3VyY2UgYXMgUmVzb3VyY2VUeXBlIHwgbnVsbCxcbiAgICByZW1haW5pbmc6IHZhbHVlLnJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0OiB2YWx1ZS55aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiB2YWx1ZS5oYXJ2ZXN0ZWQsXG4gICAgLi4uKHZhbHVlLmhhcnZlc3RlZE9uY2UgPT09IHVuZGVmaW5lZCA/IHt9IDogeyBoYXJ2ZXN0ZWRPbmNlOiB2YWx1ZS5oYXJ2ZXN0ZWRPbmNlIH0pLFxuICAgIHByb3Zpc2lvbmFsOiB2YWx1ZS5wcm92aXNpb25hbCwgYXV0aG9yZWQ6IHZhbHVlLmF1dGhvcmVkLFxuICB9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUludmVudG9yeSh2YWx1ZTogdW5rbm93bik6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBpZiAoIWlzT2JqZWN0KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBpbnZlbnRvcnkgaXMgaW52YWxpZCcpO1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModmFsdWUpLnNvcnQoKSkge1xuICAgIGlmICghUkVDT1JEX1JFU09VUkNFUy5oYXMoa2V5KSB8fCAhdWludCh2YWx1ZVtrZXldLCAxXzAwMF8wMDBfMDAwKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBzbmFwc2hvdCBoYXMgaW52YWxpZCBpbnZlbnRvcnkgcmVzb3VyY2UgJHtrZXl9YCk7XG4gICAgfVxuICAgIGlmICh2YWx1ZVtrZXldID4gMCkgb3V0W2tleV0gPSB2YWx1ZVtrZXldO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHN0b2NrVG90YWwodmFsdWU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pOiBudW1iZXIge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyh2YWx1ZSkucmVkdWNlKChzdW0sIGFtb3VudCkgPT4gc3VtICsgYW1vdW50LCAwKTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVMaWZlRmllbGRzKHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFBpY2s8TGlmZVNuYXBzaG90LCAndGljaycgfCAnc3RvY2twaWxlcycgfCAnam9icycgfCAnY3JvcHMnPiB7XG4gIGlmICghdWludCh2YWx1ZS50aWNrLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUilcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5zdG9ja3BpbGVzKSB8fCB2YWx1ZS5zdG9ja3BpbGVzLmxlbmd0aCAhPT0gMVxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmpvYnMpIHx8IHZhbHVlLmpvYnMubGVuZ3RoID4gTUFYX1BST0RVQ1RJT05fSk9CU1xuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmNyb3BzKSB8fCB2YWx1ZS5jcm9wcy5sZW5ndGggPiBDUk9QX1BMT1RfSURTLmxlbmd0aCkge1xuICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGludmFsaWQgbGlmZS1sb29wIGZpZWxkcycpO1xuICB9XG4gIGNvbnN0IHN0b2NrcGlsZXM6IE5vbk51bGxhYmxlPExpZmVTbmFwc2hvdFsnc3RvY2twaWxlcyddPiA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiB2YWx1ZS5zdG9ja3BpbGVzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8IHJhdy5pZCAhPT0gRk9VTkRFUl9TVE9DS1BJTEVfSUQgfHwgcmF3LnggIT09IEZPVU5ERVJfU1RPQ0tQSUxFLnhcbiAgICAgIHx8IHJhdy56ICE9PSBGT1VOREVSX1NUT0NLUElMRS56IHx8IHJhdy5jYXBhY2l0eSAhPT0gRk9VTkRFUl9TVE9DS1BJTEUuY2FwYWNpdHkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGFuIHVuc3VwcG9ydGVkIHN0b2NrcGlsZScpO1xuICAgIH1cbiAgICBjb25zdCBpbnZlbnRvcnkgPSB2YWxpZGF0ZUludmVudG9yeShyYXcuaW52ZW50b3J5KTtcbiAgICBpZiAoc3RvY2tUb3RhbChpbnZlbnRvcnkpID4gU1RPQ0tQSUxFX0NBUEFDSVRZKSB0aHJvdyBuZXcgRXJyb3IoJ3N0b2NrcGlsZSBleGNlZWRzIGNhcGFjaXR5Jyk7XG4gICAgc3RvY2twaWxlcy5wdXNoKHsgaWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCB4OiByYXcueCwgejogcmF3LnosXG4gICAgICBjYXBhY2l0eTogU1RPQ0tQSUxFX0NBUEFDSVRZLCBpbnZlbnRvcnkgfSk7XG4gIH1cbiAgbGV0IHJlc2VydmVkID0gc3RvY2tUb3RhbChzdG9ja3BpbGVzWzBdLmludmVudG9yeSk7XG4gIGNvbnN0IGlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCBqb2JzOiBOb25OdWxsYWJsZTxMaWZlU25hcHNob3RbJ2pvYnMnXT4gPSBbXTtcbiAgZm9yIChjb25zdCByYXcgb2YgdmFsdWUuam9icykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCAhdGV4dChyYXcuaWQsIDEyOCkgfHwgIS9eW0EtWmEtejAtOV1bQS1aYS16MC05Ll86JS1dKiQvLnRlc3QocmF3LmlkKVxuICAgICAgfHwgaWRzLmhhcyhyYXcuaWQpIHx8IHJhdy5zdG9ja3BpbGVJZCAhPT0gRk9VTkRFUl9TVE9DS1BJTEVfSURcbiAgICAgIHx8IHJhdy5yZWNpcGUgIT09ICdzZWVkJyAmJiByYXcucmVjaXBlICE9PSAncmF0aW9ucydcbiAgICAgIHx8ICF1aW50KHJhdy5yZW1haW5pbmdUaWNrcywgTUFYX1RJQ0tTX1BFUl9DT01NQU5EKSB8fCByYXcucmVtYWluaW5nVGlja3MgPCAxXG4gICAgICB8fCByYXcucmVtYWluaW5nVGlja3MgPiBSRUNJUEVTW3Jhdy5yZWNpcGVdLnRpY2tzKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGhhcyBhbiBpbnZhbGlkIHByb2R1Y3Rpb24gam9iJyk7XG4gICAgcmVzZXJ2ZWQgKz0gc3RvY2tUb3RhbChSRUNJUEVTW3Jhdy5yZWNpcGVdLm91dHB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KTtcbiAgICBpZHMuYWRkKHJhdy5pZCk7XG4gICAgam9icy5wdXNoKHsgaWQ6IHJhdy5pZCwgc3RvY2twaWxlSWQ6IEZPVU5ERVJfU1RPQ0tQSUxFX0lELCByZWNpcGU6IHJhdy5yZWNpcGUsIHJlbWFpbmluZ1RpY2tzOiByYXcucmVtYWluaW5nVGlja3MgfSk7XG4gIH1cbiAgaWYgKHJlc2VydmVkID4gU1RPQ0tQSUxFX0NBUEFDSVRZKSB0aHJvdyBuZXcgRXJyb3IoJ3N0b2NrcGlsZSByZXNlcnZlZCBvdXRwdXQgZXhjZWVkcyBjYXBhY2l0eScpO1xuICBpZHMuY2xlYXIoKTtcbiAgY29uc3QgY3JvcHM6IE5vbk51bGxhYmxlPExpZmVTbmFwc2hvdFsnY3JvcHMnXT4gPSBbXTtcbiAgZm9yIChjb25zdCByYXcgb2YgdmFsdWUuY3JvcHMpIHtcbiAgICBpZiAoIWlzT2JqZWN0KHJhdykgfHwgIUNST1BfUExPVF9JRFMuaW5jbHVkZXMoU3RyaW5nKHJhdy5pZCkpIHx8IGlkcy5oYXMoU3RyaW5nKHJhdy5pZCkpXG4gICAgICB8fCAhdWludChyYXcucGxhbnRlZFRpY2ssIHZhbHVlLnRpY2spIHx8IHJhdy5ncm93dGhUaWNrcyAhPT0gQ1JPUF9HUk9XVEhfVElDS1MpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzIGFuIGludmFsaWQgY3JvcCBwbG90Jyk7XG4gICAgfVxuICAgIGNvbnN0IHBsb3RJZCA9IFN0cmluZyhyYXcuaWQpO1xuICAgIGlkcy5hZGQocGxvdElkKTtcbiAgICBjcm9wcy5wdXNoKHsgaWQ6IHBsb3RJZCwgcGxhbnRlZFRpY2s6IHJhdy5wbGFudGVkVGljaywgZ3Jvd3RoVGlja3M6IENST1BfR1JPV1RIX1RJQ0tTIH0pO1xuICB9XG4gIHN0b2NrcGlsZXMuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcbiAgam9icy5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICBjcm9wcy5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICByZXR1cm4geyB0aWNrOiB2YWx1ZS50aWNrLCBzdG9ja3BpbGVzLCBqb2JzLCBjcm9wcyB9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNvc3QodmFsdWU6IHVua25vd24pOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+IHtcbiAgY29uc3Qgb3V0ID0gdmFsaWRhdGVJbnZlbnRvcnkodmFsdWUpO1xuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVN0cnVjdHVyZShcbiAgdmFsdWU6IHVua25vd24sIGlkczogU2V0PHN0cmluZz4sIHNjaGVtYTogV29ybGRTbmFwc2hvdFsnc2NoZW1hJ10sXG4pOiBTdHJ1Y3R1cmUge1xuICBpZiAoIWlzT2JqZWN0KHZhbHVlKSB8fCAhdGV4dCh2YWx1ZS5pZCkgfHwgaWRzLmhhcyh2YWx1ZS5pZClcbiAgICB8fCAhdGV4dCh2YWx1ZS5raW5kKSB8fCAhU1RSVUNUVVJFX0tJTkRTLmhhcyh2YWx1ZS5raW5kKVxuICAgIHx8ICF0ZXh0KHZhbHVlLnNpdGVJZClcbiAgICB8fCAhZmluaXRlKHZhbHVlLngpIHx8ICFmaW5pdGUodmFsdWUueSkgfHwgIWZpbml0ZSh2YWx1ZS56KSB8fCAhZmluaXRlKHZhbHVlLnJvdClcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5tb2R1bGVzKSB8fCB2YWx1ZS5tb2R1bGVzLmxlbmd0aCA+IDY0XG4gICAgfHwgIXVpbnQodmFsdWUuYnVpbHRSZXZpc2lvbiwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHx8IHZhbHVlLnByb3Zpc2lvbmFsICE9PSB0cnVlXG4gICAgfHwgc2NoZW1hID09PSBTTkFQU0hPVF9TQ0hFTUEgJiYgdmFsdWUuZGVzaWduVmVyc2lvbiAhPT0gdW5kZWZpbmVkXG4gICAgfHwgc2NoZW1hICE9PSBTTkFQU0hPVF9TQ0hFTUEgJiYgdmFsdWUuZGVzaWduVmVyc2lvbiAhPT0gdW5kZWZpbmVkXG4gICAgICAmJiB2YWx1ZS5kZXNpZ25WZXJzaW9uICE9PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyBhbiBpbnZhbGlkIG9yIGR1cGxpY2F0ZSBzdHJ1Y3R1cmUnKTtcbiAgfVxuICBjb25zdCBtb2R1bGVzOiBTdHJ1Y3R1cmVbJ21vZHVsZXMnXSA9IFtdO1xuICBjb25zdCBtb2R1bGVJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByYXcgb2YgdmFsdWUubW9kdWxlcykge1xuICAgIGlmICghaXNPYmplY3QocmF3KSB8fCAhdGV4dChyYXcua2luZCkgfHwgIU1PRFVMRV9LSU5EUy5oYXMocmF3LmtpbmQpXG4gICAgICB8fCAhZmluaXRlKHJhdy54KSB8fCAhZmluaXRlKHJhdy55KSB8fCAhZmluaXRlKHJhdy56KVxuICAgICAgfHwgIWZpbml0ZShyYXcudykgfHwgcmF3LncgPD0gMCB8fCAhZmluaXRlKHJhdy5oKSB8fCByYXcuaCA8PSAwIHx8ICFmaW5pdGUocmF3LmQpIHx8IHJhdy5kIDw9IDBcbiAgICAgIHx8IHJhdy5yb3QgIT09IHVuZGVmaW5lZCAmJiAhZmluaXRlKHJhdy5yb3QpXG4gICAgICB8fCByYXcudG9uZSAhPT0gdW5kZWZpbmVkICYmICh0eXBlb2YgcmF3LnRvbmUgIT09ICdzdHJpbmcnIHx8ICFNT0RVTEVfVE9ORVMuaGFzKHJhdy50b25lKSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgc3RydWN0dXJlICR7dmFsdWUuaWR9IGNvbnRhaW5zIGFuIGludmFsaWQgbW9kdWxlYCk7XG4gICAgfVxuICAgIGNvbnN0IHNpZ25hdHVyZSA9IEpTT04uc3RyaW5naWZ5KHJhdyk7XG4gICAgaWYgKG1vZHVsZUlkcy5oYXMoc2lnbmF0dXJlKSkgdGhyb3cgbmV3IEVycm9yKGBzdHJ1Y3R1cmUgJHt2YWx1ZS5pZH0gY29udGFpbnMgZHVwbGljYXRlIG1vZHVsZXNgKTtcbiAgICBtb2R1bGVJZHMuYWRkKHNpZ25hdHVyZSk7XG4gICAgbW9kdWxlcy5wdXNoKHtcbiAgICAgIGtpbmQ6IHJhdy5raW5kIGFzIFN0cnVjdHVyZVsnbW9kdWxlcyddW251bWJlcl1bJ2tpbmQnXSxcbiAgICAgIHg6IHJhdy54LCB5OiByYXcueSwgejogcmF3LnosIHc6IHJhdy53LCBoOiByYXcuaCwgZDogcmF3LmQsXG4gICAgICAuLi4ocmF3LnJvdCA9PT0gdW5kZWZpbmVkID8ge30gOiB7IHJvdDogcmF3LnJvdCB9KSxcbiAgICAgIC4uLihyYXcudG9uZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IHRvbmU6IHJhdy50b25lIGFzIFN0cnVjdHVyZVsnbW9kdWxlcyddW251bWJlcl1bJ3RvbmUnXSB9KSxcbiAgICB9KTtcbiAgfVxuICBpZHMuYWRkKHZhbHVlLmlkKTtcbiAgcmV0dXJuIHtcbiAgICBpZDogdmFsdWUuaWQsIGtpbmQ6IHZhbHVlLmtpbmQgYXMgU3RydWN0dXJlWydraW5kJ10sIHNpdGVJZDogdmFsdWUuc2l0ZUlkLFxuICAgIHg6IHZhbHVlLngsIHk6IHZhbHVlLnksIHo6IHZhbHVlLnosIHJvdDogdmFsdWUucm90LFxuICAgIG1vZHVsZXMsIGNvc3Q6IHZhbGlkYXRlQ29zdCh2YWx1ZS5jb3N0KSwgYnVpbHRSZXZpc2lvbjogdmFsdWUuYnVpbHRSZXZpc2lvbixcbiAgICAuLi4odmFsdWUuZGVzaWduVmVyc2lvbiA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGRlc2lnblZlcnNpb246IEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSksXG4gICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gIH07XG59XG5cbi8qKiBTdHJpY3QgcnVudGltZSB2YWxpZGF0aW9uOyBKU09OJ3MgVHlwZVNjcmlwdCBjYXN0cyBhcmUgbmV2ZXIgdHJ1c3RlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVdvcmxkU25hcHNob3QodmFsdWU6IHVua25vd24pOiBXb3JsZFNuYXBzaG90IHtcbiAgaWYgKCFpc09iamVjdCh2YWx1ZSlcbiAgICB8fCB2YWx1ZS5zY2hlbWEgIT09IFNOQVBTSE9UX1NDSEVNQSAmJiB2YWx1ZS5zY2hlbWEgIT09IERFU0lHTl9TTkFQU0hPVF9TQ0hFTUFcbiAgICAmJiB2YWx1ZS5zY2hlbWEgIT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BXG4gICAgfHwgIWlzT2JqZWN0KHZhbHVlLm1hbmlmZXN0KSkge1xuICAgIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgb3IgbWFsZm9ybWVkIHdvcmxkIHNuYXBzaG90Jyk7XG4gIH1cbiAgY29uc3Qgc2NoZW1hID0gdmFsdWUuc2NoZW1hO1xuICBjb25zdCBtID0gdmFsdWUubWFuaWZlc3Q7XG4gIGNvbnN0IHBhcmFtcyA9IHtcbiAgICBzaXplOiAyMDQ4LCBjaHVua1NpemU6IENIVU5LX1NJWkUsIHlNaW46IC0xNiwgeU1heDogMTEyLFxuICAgIHNlYUxldmVsOiAwLCBnZW5lcmF0b3JWZXJzaW9uOiBHRU5FUkFUT1JfVkVSU0lPTixcbiAgfTtcbiAgaWYgKG0uc2NoZW1hICE9PSAxIHx8ICF1aW50KG0uc2VlZCwgMHhmZmZmZmZmZilcbiAgICB8fCBtLmdlbmVyYXRvclZlcnNpb24gIT09IHBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uXG4gICAgfHwgbS5zaXplICE9PSBwYXJhbXMuc2l6ZSB8fCBtLmNodW5rU2l6ZSAhPT0gcGFyYW1zLmNodW5rU2l6ZVxuICAgIHx8IG0ueU1pbiAhPT0gcGFyYW1zLnlNaW4gfHwgbS55TWF4ICE9PSBwYXJhbXMueU1heCB8fCBtLnNlYUxldmVsICE9PSBwYXJhbXMuc2VhTGV2ZWxcbiAgICB8fCAhL15bMC05YS1mXXs4fSQvLnRlc3QoU3RyaW5nKG0ucGFyYW1zSGFzaCkpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBnZW5lcmF0b3IgY29uZmlndXJhdGlvbiBpcyB1bnN1cHBvcnRlZCBvciBpbmNvbXBhdGlibGUnKTtcbiAgfVxuICBpZiAoIXVpbnQodmFsdWUucmV2aXNpb24sIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKVxuICAgIHx8ICF1aW50KHZhbHVlLm5leHRTZXF1ZW5jZSwgMTBfMDAwXzAwMClcbiAgICB8fCB0eXBlb2YgdmFsdWUuYXV0aG9yZWRQbGFjZWQgIT09ICdib29sZWFuJ1xuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVkaXRzKSB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5lbnRpdGllcylcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5lbnRpdHlSZW1vdmFscylcbiAgICB8fCB2YWx1ZS5lbnRpdGllcy5sZW5ndGggPiBNQVhfU05BUFNIT1RfRU5USVRJRVNcbiAgICB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZS5lbnRpdHlDaHVua3MpIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLnN0cnVjdHVyZXMpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBoYXMgaW52YWxpZCBhdXRob3JpdGF0aXZlLXN0YXRlIGZpZWxkcycpO1xuICB9XG4gIGNvbnN0IHdvcmxkID0gY3JlYXRlV29ybGQobS5zZWVkKTtcbiAgLy8gVGhlIG1hbmlmZXN0IGhhc2ggaXMgY2hlY2tlZCBhZ2FpbnN0IHRoZSBhY3R1YWwgcmVzdG9yZWQgY29uZmlndXJhdGlvbi5cbiAgaWYgKHdvcmxkTWFuaWZlc3Qod29ybGQpLnBhcmFtc0hhc2ggIT09IG0ucGFyYW1zSGFzaCkgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBtYW5pZmVzdCBoYXNoIG1pc21hdGNoJyk7XG5cbiAgY29uc3QgZWRpdHM6IFdvcmxkU25hcHNob3RbJ2VkaXRzJ10gPSBbXTtcbiAgbGV0IGVkaXRDb3VudCA9IDA7XG4gIGNvbnN0IGNodW5rSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgcmF3IG9mIHZhbHVlLmVkaXRzKSB7XG4gICAgaWYgKCFpc09iamVjdChyYXcpIHx8ICF2YWxpZENodW5rKHJhdy5jaHVuaykgfHwgY2h1bmtJZHMuaGFzKHJhdy5jaHVuaylcbiAgICAgIHx8ICFBcnJheS5pc0FycmF5KHJhdy5jZWxscykgfHwgcmF3LmNlbGxzLmxlbmd0aCA+IENIVU5LX1ZPTFVNRSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyBpbnZhbGlkIGNodW5rIGVkaXRzJyk7XG4gICAgfVxuICAgIGNvbnN0IGNlbGxJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgICBjb25zdCBjZWxsczogQXJyYXk8eyBpOiBudW1iZXI7IG06IG51bWJlciB9PiA9IFtdO1xuICAgIGZvciAoY29uc3QgY2VsbCBvZiByYXcuY2VsbHMpIHtcbiAgICAgIGlmICghaXNPYmplY3QoY2VsbCkgfHwgIXVpbnQoY2VsbC5pLCBDSFVOS19WT0xVTUUgLSAxKSB8fCBjZWxsSWRzLmhhcyhjZWxsLmkpXG4gICAgICAgIHx8ICF1aW50KGNlbGwubSwgOSkpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgY29udGFpbnMgYW4gaW52YWxpZCB2b3hlbCBlZGl0Jyk7XG4gICAgICBjZWxsSWRzLmFkZChjZWxsLmkpO1xuICAgICAgY2VsbHMucHVzaCh7IGk6IGNlbGwuaSwgbTogY2VsbC5tIH0pO1xuICAgIH1cbiAgICBjZWxsSWRzLmNsZWFyKCk7XG4gICAgY2VsbHMuc29ydCgoYSwgYikgPT4gYS5pIC0gYi5pKTtcbiAgICBlZGl0Q291bnQgKz0gY2VsbHMubGVuZ3RoO1xuICAgIGlmIChlZGl0Q291bnQgPiBNQVhfU05BUFNIT1RfRURJVFMpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZXhjZWVkcyB0aGUgYm91bmRlZCBlZGl0IGxpbWl0Jyk7XG4gICAgY2h1bmtJZHMuYWRkKHJhdy5jaHVuayk7XG4gICAgZWRpdHMucHVzaCh7IGNodW5rOiByYXcuY2h1bmssIGNlbGxzIH0pO1xuICB9XG4gIGVkaXRzLnNvcnQoKGEsIGIpID0+IGEuY2h1bmsubG9jYWxlQ29tcGFyZShiLmNodW5rKSk7XG5cbiAgY29uc3QgZW50aXR5SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IGVudGl0aWVzID0gdmFsdWUuZW50aXRpZXMubWFwKChlKSA9PiB2YWxpZGF0ZUVudGl0eShlLCBlbnRpdHlJZHMpKTtcbiAgY29uc3QgZW50aXR5Q2h1bmtzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBnZW5lcmF0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCBrZXkgb2YgdmFsdWUuZW50aXR5Q2h1bmtzKSB7XG4gICAgaWYgKCF2YWxpZENodW5rKGtleSkgfHwgZ2VuZXJhdGVkLmhhcyhrZXkpKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGdlbmVyYXRlZC1jaHVuayBpbmRleCBpcyBpbnZhbGlkJyk7XG4gICAgZ2VuZXJhdGVkLmFkZChrZXkpO1xuICAgIGVudGl0eUNodW5rcy5wdXNoKGtleSk7XG4gIH1cbiAgZm9yIChjb25zdCBlbnRpdHkgb2YgZW50aXRpZXMpIHtcbiAgICBpZiAoIWVudGl0eS5hdXRob3JlZCAmJiAhZ2VuZXJhdGVkLmhhcyhlbnRpdHkuY2h1bmspKSB0aHJvdyBuZXcgRXJyb3IoYGVudGl0eSAke2VudGl0eS5pZH0gYmVsb25ncyB0byBhbiB1bm1hcmtlZCBjaHVua2ApO1xuICB9XG4gIGVudGl0eUNodW5rcy5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuICBjb25zdCByZW1vdmFscyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IGlkIG9mIHZhbHVlLmVudGl0eVJlbW92YWxzKSB7XG4gICAgaWYgKCF0ZXh0KGlkKSB8fCByZW1vdmFscy5oYXMoaWQpIHx8IGVudGl0eUlkcy5oYXMoaWQpIHx8ICEvXmU6XFxkKyxcXGQrOlxcZCskLy50ZXN0KGlkKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBlbnRpdHkgdG9tYnN0b25lIGlzIGludmFsaWQnKTtcbiAgICB9XG4gICAgcmVtb3ZhbHMuYWRkKGlkKTtcbiAgfVxuICBjb25zdCBlbnRpdHlSZW1vdmFscyA9IFsuLi5yZW1vdmFsc10uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblxuICBjb25zdCBzdHJ1Y3R1cmVJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgc3RydWN0dXJlcyA9IHZhbHVlLnN0cnVjdHVyZXMubWFwKChzKSA9PiB2YWxpZGF0ZVN0cnVjdHVyZShzLCBzdHJ1Y3R1cmVJZHMsIHNjaGVtYSkpXG4gICAgLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG4gIGNvbnN0IGNhcnJpZWQgPSB2YWxpZGF0ZUludmVudG9yeSh2YWx1ZS5pbnZlbnRvcnkpO1xuICBpZiAoc2NoZW1hID09PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSAmJiBzdG9ja1RvdGFsKGNhcnJpZWQpID4gQ0FSUklFRF9DQVBBQ0lUWSkgdGhyb3cgbmV3IEVycm9yKCdjYXJyaWVkIGludmVudG9yeSBleGNlZWRzIGNhcGFjaXR5Jyk7XG4gIGNvbnN0IHNuYXBzaG90OiBCYXNlV29ybGRTbmFwc2hvdCA9IHtcbiAgICBzY2hlbWEsXG4gICAgbWFuaWZlc3Q6IHtcbiAgICAgIHNjaGVtYTogMSwgc2VlZDogbS5zZWVkLCBnZW5lcmF0b3JWZXJzaW9uOiBwYXJhbXMuZ2VuZXJhdG9yVmVyc2lvbixcbiAgICAgIHNpemU6IHBhcmFtcy5zaXplLCBjaHVua1NpemU6IHBhcmFtcy5jaHVua1NpemUsIHlNaW46IHBhcmFtcy55TWluLFxuICAgICAgeU1heDogcGFyYW1zLnlNYXgsIHNlYUxldmVsOiBwYXJhbXMuc2VhTGV2ZWwsIHBhcmFtc0hhc2g6IG0ucGFyYW1zSGFzaCxcbiAgICB9LFxuICAgIHJldmlzaW9uOiB2YWx1ZS5yZXZpc2lvbixcbiAgICBlZGl0cyxcbiAgICBlbnRpdGllcyxcbiAgICBlbnRpdHlDaHVua3MsXG4gICAgZW50aXR5UmVtb3ZhbHMsXG4gICAgaW52ZW50b3J5OiBjYXJyaWVkLFxuICAgIHN0cnVjdHVyZXMsXG4gICAgYXV0aG9yZWRQbGFjZWQ6IHZhbHVlLmF1dGhvcmVkUGxhY2VkLFxuICAgIG5leHRTZXF1ZW5jZTogdmFsdWUubmV4dFNlcXVlbmNlLFxuICB9O1xuICBjb25zdCByZXN1bHQ6IFdvcmxkU25hcHNob3QgPSBzY2hlbWEgPT09IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BXG4gICAgPyB7IC4uLnNuYXBzaG90LCBzY2hlbWE6IENVUlJFTlRfU05BUFNIT1RfU0NIRU1BLCAuLi52YWxpZGF0ZUxpZmVGaWVsZHModmFsdWUpIH1cbiAgICA6IHsgLi4uc25hcHNob3QsIHNjaGVtYTogc2NoZW1hIGFzIHR5cGVvZiBTTkFQU0hPVF9TQ0hFTUEgfCB0eXBlb2YgREVTSUdOX1NOQVBTSE9UX1NDSEVNQSB9O1xuICBpZiAoSlNPTi5zdHJpbmdpZnkocmVzdWx0KSAhPT0gSlNPTi5zdHJpbmdpZnkodmFsdWUpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzbmFwc2hvdCBjb250YWlucyB1bmtub3duLCBub24tY2Fub25pY2FsIG9yIGFtYmlndW91cyBmaWVsZHMnKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlV29ybGRTbmFwc2hvdChqc29uOiBzdHJpbmcpOiBXb3JsZFNuYXBzaG90IHtcbiAgaWYgKGpzb24ubGVuZ3RoID4gTUFYX1NOQVBTSE9UX0pTT05fQllURVMpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgZXhjZWVkcyB0aGUgSlNPTiBzaXplIGxpbWl0Jyk7XG4gIHJldHVybiB2YWxpZGF0ZVdvcmxkU25hcHNob3QoSlNPTi5wYXJzZShqc29uKSk7XG59XG5cbi8qKiBSZXN0b3JlIGluIHBsYWNlIHNvIGNvbnRyb2xsZXJzIHJldGFpbiB0aGUgc2FtZSBXb3JsZCByZWZlcmVuY2UuIEFsbFxuICogdmFsaWRhdGlvbiBoYXBwZW5zIGJlZm9yZSBtdXRhdGlvbiwgc28gYSByZWplY3RlZCBzYXZlIGNhbm5vdCBlcmFzZSB3b3JrLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkOiBXb3JsZCwgaW5wdXQ6IFdvcmxkU25hcHNob3QpOiB2b2lkIHtcbiAgLy8gT3JkaW5hcnkgc25hcHNob3RzIGFuZCB0cmFuc2FjdGlvbmFsIHJvbGxiYWNrcyByZXN0b3JlIHRoZWlyIGV4YWN0IHJlY29yZGVkXG4gIC8vIHN0YXRlLiBSZXRpcmVkIGhpc3RvcmljYWwgZW50aXRpZXMgYXJlIHJlbW92ZWQgb25seSBhZnRlciBHYW1lU2Vzc2lvbiBoYXNcbiAgLy8gYXV0aGVudGljYXRlZCB0aGUgb3JpZ2luYWwgam91cm5hbCBhbmQgZXhwbGljaXRseSBtaWdyYXRlZCB0aGF0IHNhdmUuXG4gIGZpbmlzaFN0b25lUmVwbGF5KHdvcmxkKTtcbiAgcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCh3b3JsZCwgaW5wdXQpO1xufVxuXG4vKiogQGludGVybmFsIEhpc3RvcmljYWwgcmVjb25zdHJ1Y3Rpb24gb3IgZXhhY3QgbmV3LXNuYXBzaG90IHJlc3RvcmF0aW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc3RvcmVXb3JsZFNuYXBzaG90RXhhY3Qod29ybGQ6IFdvcmxkLCBpbnB1dDogV29ybGRTbmFwc2hvdCk6IHZvaWQge1xuICBjb25zdCBzbmFwc2hvdCA9IHZhbGlkYXRlV29ybGRTbmFwc2hvdChpbnB1dCk7XG4gIGlmIChzbmFwc2hvdC5tYW5pZmVzdC5zZWVkICE9PSB3b3JsZC5zZWVkKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IHNlZWQgZG9lcyBub3QgbWF0Y2ggdGhlIHdvcmxkJyk7XG4gIHdvcmxkLnBhcmFtcyA9IHtcbiAgICBzaXplOiBzbmFwc2hvdC5tYW5pZmVzdC5zaXplLFxuICAgIGNodW5rU2l6ZTogc25hcHNob3QubWFuaWZlc3QuY2h1bmtTaXplLFxuICAgIHlNaW46IHNuYXBzaG90Lm1hbmlmZXN0LnlNaW4sXG4gICAgeU1heDogc25hcHNob3QubWFuaWZlc3QueU1heCxcbiAgICBzZWFMZXZlbDogc25hcHNob3QubWFuaWZlc3Quc2VhTGV2ZWwsXG4gICAgZ2VuZXJhdG9yVmVyc2lvbjogc25hcHNob3QubWFuaWZlc3QuZ2VuZXJhdG9yVmVyc2lvbixcbiAgfTtcbiAgd29ybGQuY2h1bmtzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0aWVzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eUNodW5rcy5jbGVhcigpO1xuICB3b3JsZC5lbnRpdHlDaGFuZ2VzLmNsZWFyKCk7XG4gIHdvcmxkLmVudGl0eVJlbW92YWxzLmNsZWFyKCk7XG4gIHdvcmxkLnN0cnVjdHVyZXMuY2xlYXIoKTtcbiAgd29ybGQuZWRpdHMuY2xlYXIoKTtcbiAgd29ybGQuaW52ZW50b3J5ID0geyAuLi5zbmFwc2hvdC5pbnZlbnRvcnkgfTtcbiAgd29ybGQubGlmZSA9IHNuYXBzaG90LnNjaGVtYSA9PT0gQ1VSUkVOVF9TTkFQU0hPVF9TQ0hFTUEgPyBjcmVhdGVMaWZlU3RhdGUoKSA6IHVuZGVmaW5lZDtcbiAgaWYgKHdvcmxkLmxpZmUgJiYgc25hcHNob3Quc2NoZW1hID09PSBDVVJSRU5UX1NOQVBTSE9UX1NDSEVNQSkge1xuICAgIHdvcmxkLmxpZmUudGljayA9IHNuYXBzaG90LnRpY2s7XG4gICAgZm9yIChjb25zdCBzIG9mIHNuYXBzaG90LnN0b2NrcGlsZXMpIHdvcmxkLmxpZmUuc3RvY2twaWxlcy5zZXQocy5pZCwgeyAuLi5zLCBpbnZlbnRvcnk6IHsgLi4ucy5pbnZlbnRvcnkgfSB9KTtcbiAgICBmb3IgKGNvbnN0IGogb2Ygc25hcHNob3Quam9icykgd29ybGQubGlmZS5qb2JzLnNldChqLmlkLCB7IC4uLmogfSk7XG4gICAgZm9yIChjb25zdCBjIG9mIHNuYXBzaG90LmNyb3BzKSB3b3JsZC5saWZlLmNyb3BzLnNldChjLmlkLCB7IC4uLmMgfSk7XG4gIH1cbiAgd29ybGQuZGlydHkuY2xlYXIoKTtcbiAgd29ybGQuc2l0ZXMgPSBbXTtcbiAgd29ybGQuc3RhdHMgPSB7XG4gICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICBlbnRpdGllczogc25hcHNob3QuZW50aXRpZXMubGVuZ3RoLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gIH07XG4gIHdvcmxkLnJldmlzaW9uID0gc25hcHNob3QucmV2aXNpb247XG4gIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gc25hcHNob3QuYXV0aG9yZWRQbGFjZWQ7XG4gIGZvciAoY29uc3Qga2V5IG9mIHNuYXBzaG90LmVudGl0eUNodW5rcykgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcbiAgLy8gQXBwbHkgZHVyYWJsZSB2b3hlbCBlZGl0cyBiZWZvcmUgYW55IGF1dGhvcmVkLXNpdGUgcXVlcnkgY2FuIGdlbmVyYXRlIGFcbiAgLy8gY2h1bmsuIE90aGVyd2lzZSB0aG9zZSBjaHVua3MgY2FjaGUgdGhlIHVuZWRpdGVkIGJhc2UgdGVycmFpbiBwZXJtYW5lbnRseS5cbiAgZm9yIChjb25zdCBkZWx0YSBvZiBzbmFwc2hvdC5lZGl0cykge1xuICAgIHdvcmxkLmVkaXRzLnNldChkZWx0YS5jaHVuaywgbmV3IE1hcChkZWx0YS5jZWxscy5tYXAoKGUpID0+IFtlLmksIGUubSBhcyBNYXRJZF0pKSk7XG4gIH1cbiAgLy8gUmVjcmVhdGUgYXV0aG9yZWQgc2l0ZSByZWNvcmRzLiBTdXBwcmVzcyB0aGVpciBlbnRpdHkgcGxhY2VtZW50IHNvIHRoZVxuICAvLyBleGFjdCBzYXZlZCBlbnRpdHkgcmVjb3JkcyBiZWxvdyBjYW5ub3QgYmUgYWZmZWN0ZWQgYnkgYSBtb2RpZmllZCBjaHVuay5cbiAgaWYgKHdvcmxkLmF1dGhvcmVkUGxhY2VkKSB7XG4gICAgd29ybGQuYXV0aG9yZWRQbGFjZWQgPSBmYWxzZTtcbiAgICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICAgIHdvcmxkLmF1dGhvcmVkUGxhY2VkID0gdHJ1ZTtcbiAgfVxuICAvLyBBdXRob3JlZCBwbGFjZW1lbnQgZGVyaXZlcyBzaXRlL2VudGl0eSBzY2FmZm9sZGluZyBhbmQgbWF5IGFkdmFuY2UgdGhlXG4gIC8vIHJldmlzaW9uLiBUaGUgc2F2ZWQgcmV2aXNpb24gaXMgcmVzdG9yZWQgb25seSBhZnRlciB0aGF0IGRlcml2ZWQgd29yay5cbiAgd29ybGQucmV2aXNpb24gPSBzbmFwc2hvdC5yZXZpc2lvbjtcbiAgLy8gVG9tYnN0b25lcyBtdXN0IGV4aXN0IGJlZm9yZSBhbnkgY2hhbmdlZCBjaHVuayByZWdlbmVyYXRlcyBpdHMgZW50aXRpZXMuXG4gIGZvciAoY29uc3QgaWQgb2Ygc25hcHNob3QuZW50aXR5UmVtb3ZhbHMpIHdvcmxkLmVudGl0eVJlbW92YWxzLmFkZChpZCk7XG4gIC8vIFJlcGxhY2UgZ2VuZXJhdGVkIGVudGl0aWVzIHdpdGggdGhlIGV4YWN0IHNhdmVkIHJlY29yZHMsIGluY2x1ZGluZ1xuICAvLyBoYXJ2ZXN0ZWQvcmVtb3ZlZCBvbmVzLlxuICB3b3JsZC5lbnRpdGllcy5jbGVhcigpO1xuICB3b3JsZC5lbnRpdHlDaHVua3MuY2xlYXIoKTtcbiAgLy8gSW5zdGFsbCBwZXJzaXN0ZWQgZW50aXR5IGRlbHRhcyBkaXJlY3RseS4gVGhpcyBpcyByZWNvbnN0cnVjdGlvbiwgbm90IGFcbiAgLy8gY29tbWFuZDogcmVtb3ZlRW50aXR5IHdvdWxkIGNyZWF0ZSBmcmVzaCB0b21ic3RvbmVzIGFuZCBhZHZhbmNlIHJldmlzaW9uLlxuICBmb3IgKGNvbnN0IGtleSBvZiBzbmFwc2hvdC5lbnRpdHlDaHVua3MpIHtcbiAgICBjb25zdCBbY3gsIGN6XSA9IGtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICAgIGNvbnN0IGNodW5rID0gZW5zdXJlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBzbmFwc2hvdCByZWZlcmVuY2VzIHVuYXZhaWxhYmxlIGNodW5rICR7a2V5fWApO1xuICAgIGNvbnN0IHNhdmVkID0gbmV3IFNldChzbmFwc2hvdC5lbnRpdGllcy5maWx0ZXIoKGUpID0+IGUuY2h1bmsgPT09IGtleSkubWFwKChlKSA9PiBlLmlkKSk7XG4gICAgLy8gQXV0aG9yZWQgZW50aXRpZXMgZm9yIHRoZSBzYW1lIGNodW5rIHN1cnZpdmUgYWxvbmdzaWRlIG5hdHVyYWwgZGVsdGFzLlxuICAgIGNvbnN0IGlkcyA9ICh3b3JsZC5lbnRpdHlDaHVua3MuZ2V0KGtleSkgPz8gW10pLmZpbHRlcigoaWQpID0+IHtcbiAgICAgIGNvbnN0IGVudGl0eSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICByZXR1cm4gIWlkLnN0YXJ0c1dpdGgoJ2U6JykgJiYgISFlbnRpdHlcbiAgICAgICAgJiYgKCFpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpIHx8IGlzU3RvbmVSZXBsYXkod29ybGQpKTtcbiAgICB9KTtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIFsuLi53b3JsZC5lbnRpdGllcy5rZXlzKCldKSB7XG4gICAgICBjb25zdCBlbnRpdHkgPSB3b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xuICAgICAgaWYgKGVudGl0eT8uY2h1bmsgPT09IGtleSAmJiAhZW50aXR5LmF1dGhvcmVkICYmICFzYXZlZC5oYXMoaWQpKSB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGlkIG9mIHNhdmVkKSBpZiAoIWlkcy5pbmNsdWRlcyhpZCkpIGlkcy5wdXNoKGlkKTtcbiAgICB3b3JsZC5lbnRpdHlDaHVua3Muc2V0KGtleSwgaWRzKTtcbiAgfVxuICBmb3IgKGNvbnN0IGUgb2Ygc25hcHNob3QuZW50aXRpZXMpIHtcbiAgICB3b3JsZC5lbnRpdGllcy5zZXQoZS5pZCwgY2xvbmVFbnRpdHkoZSkpO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IG9mIHNuYXBzaG90LmVudGl0eUNodW5rcykgd29ybGQuZW50aXR5Q2hhbmdlcy5hZGQoa2V5KTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICBmb3IgKGNvbnN0IGUgb2Ygd29ybGQuZW50aXRpZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoZS5raW5kLnN0YXJ0c1dpdGgoJ3N0eWxfdHJlZScpKSB3b3JsZC5zdGF0cy50cmVlcysrO1xuICAgIGlmIChlLmtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICB9XG4gIGZvciAoY29uc3QgcyBvZiBzbmFwc2hvdC5zdHJ1Y3R1cmVzKSB3b3JsZC5zdHJ1Y3R1cmVzLnNldChzLmlkLCBjbG9uZVN0cnVjdHVyZShzKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JsZEZyb21TbmFwc2hvdChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCk6IFdvcmxkIHtcbiAgY29uc3QgdmFsaWQgPSB2YWxpZGF0ZVdvcmxkU25hcHNob3Qoc25hcHNob3QpO1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHZhbGlkLm1hbmlmZXN0LnNlZWQpO1xuICByZXN0b3JlV29ybGRTbmFwc2hvdCh3b3JsZCwgdmFsaWQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8qKiBSYXcgb2xkIHN0YXRlIGlzIHVzZWQgb25seSB3aGlsZSB2YWxpZGF0aW5nIGEgcmVjb3JkZWQgYWNjZXB0ZWQgam91cm5hbC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoaXN0b3JpY2FsV29ybGRGcm9tU25hcHNob3Qoc25hcHNob3Q6IFdvcmxkU25hcHNob3QpOiBXb3JsZCB7XG4gIGNvbnN0IHZhbGlkID0gdmFsaWRhdGVXb3JsZFNuYXBzaG90KHNuYXBzaG90KTtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZCh2YWxpZC5tYW5pZmVzdC5zZWVkKTtcbiAgZW5hYmxlU3RvbmVSZXBsYXkod29ybGQpO1xuICByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0KHdvcmxkLCB2YWxpZCk7XG4gIHJldHVybiB3b3JsZDtcbn1cbiIsICIvLyBNMDAyIHBsYXlhYmxlIGZpcnN0IHNsaWNlIFx1MjAxNCB0aGUgdGhyZWUgYXV0aG9yZWQgcHJvamVjdHMgYXMgcGxhaW4gZGF0YS5cbi8vXG4vLyBUaGlzIG1vZHVsZSBpcyBkZWxpYmVyYXRlbHkgRE9NLWZyZWUuIFRoZSBidWlsZCBzaWRlYmFyLCB0aGUgZ2hvc3QgcHJldmlld1xuLy8gYW5kIHRoZSB0ZXN0cyBhbGwgcmVhZCB0aGUgc2FtZSBkZWZpbml0aW9ucyBhbmQgY2FsbCB0aGUgc2FtZSBzaW11bGF0aW9uXG4vLyBlbnRyeSBwb2ludHM7IGEgcHJvamVjdCBjYW5ub3QgYWR2ZXJ0aXNlIG9uZSBmb290cHJpbnQsIHByaWNlIG9yIHByZXBhcmF0aW9uXG4vLyBzdGVwIGFuZCB0aGVuIGV4ZWN1dGUgYW5vdGhlci5cbmltcG9ydCB7IE1BVCwgV29ybGQsIFJlc291cmNlVHlwZSB9IGZyb20gJy4uL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBSZWN0IH0gZnJvbSAnLi4vc2ltL3RlcnJhaW4nO1xuaW1wb3J0IHtcbiAgQnVpbGRpbmdSdWxlcywgSE9VU0VfUlVMRVMsIFBBVEhfUlVMRVMsIEZBUk1fUlVMRVMsXG4gIFNpdGVQcm9wb3NhbCwgU2l0ZVByZXZpZXcsIFNpdGVTdGF0ZSwgVmFsaWRhdGlvblJlYXNvbiwgcHJldmlld1NpdGUsXG59IGZyb20gJy4uL3NpbS9jb25zdHJ1Y3Rpb24nO1xuaW1wb3J0IHtcbiAgTTAwMl9MQVlPVVQsIE0wMDJfUEFUSF9TSVRFX0lELCBNMDAyX1RFUlJBQ0VfQkFORFMsXG59IGZyb20gJy4uL3NpbS9tMDAyJztcbmltcG9ydCB7XG4gIG0wMDJGYXJtVGFyZ2V0cywgbTAwMlBhdGhSZWN0LCBtMDAyUGF0aFRhcmdldHMsXG59IGZyb20gJy4uL3NpbS9zY2VuYXJpbyc7XG5pbXBvcnQge1xuICBDb2x1bW5UYXJnZXQsIExvY2FsQXV0aG9yaXplciwgUHJlcGFyYXRpb25MZWRnZXIsIFByZXBhcmF0aW9uT3B0aW9ucyxcbiAgUGxhblJlc3VsdCwgcGxhblByZXBhcmF0aW9uLCBwcmVwYXJlU2l0ZSxcbn0gZnJvbSAnLi4vc2ltL3ByZXBhcmF0aW9uJztcbmltcG9ydCB7IGNyZWF0ZVdvcmxkU25hcHNob3QsIHJlc3RvcmVXb3JsZFNuYXBzaG90IH0gZnJvbSAnLi4vc2ltL3NuYXBzaG90JztcblxuaW1wb3J0IHtcbiAgSE9VU0VfQ09TVCwgVEVSUkFDRV9DT1NULCBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsIFN0cnVjdHVyZSxcbiAgU3RydWN0dXJlS2luZCwgU3RydWN0dXJlTGVkZ2VyLCBTdHJ1Y3R1cmVQcm9wb3NhbCwgU3RydWN0dXJlRGVzaWduVmVyc2lvbixcbiAgYnVpbGRTdHJ1Y3R1cmUsIHBhdGhDb3N0LFxufSBmcm9tICcuLi9zaW0vc3RydWN0dXJlcyc7XG5cbmV4cG9ydCB0eXBlIE0yUHJvamVjdElkID0gJ2hvdXNlJyB8ICdwYXRoJyB8ICdmYXJtJztcblxuZXhwb3J0IGludGVyZmFjZSBNMkdob3N0QmFuZCB7XG4gIHowOiBudW1iZXI7XG4gIHoxOiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNMlByb2plY3Qge1xuICBpZDogTTJQcm9qZWN0SWQ7XG4gIG5hbWU6IHN0cmluZztcbiAgc3VidGl0bGU6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIGtpbmQ6IFN0cnVjdHVyZUtpbmQ7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBydWxlczogQnVpbGRpbmdSdWxlcztcbiAgY29zdDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+PjtcbiAgZG9vcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIHRlcnJhY2VzPzogbnVtYmVyO1xuICBwcmVwOiBQcmVwYXJhdGlvbk9wdGlvbnM7XG4gIGdob3N0QmFuZHM/OiByZWFkb25seSBNMkdob3N0QmFuZFtdO1xufVxuXG5jb25zdCBwYXRoUmVjdCA9IG0wMDJQYXRoUmVjdCgpO1xuY29uc3QgcGF0aFRhcmdldHM6IENvbHVtblRhcmdldFtdID0gbTAwMlBhdGhUYXJnZXRzKCk7XG5jb25zdCBmYXJtVGFyZ2V0czogQ29sdW1uVGFyZ2V0W10gPSBtMDAyRmFybVRhcmdldHMoKTtcblxuLyoqXG4gKiBUaGUgZmlyc3QgcGxheWFibGUgc2xpY2UgaW4gdGhlIHBpbm5lZCBvcmRlcjogYSBob3VzZSBvbiB0aGUgcHJlcGFyZWQgc2hlbGYsXG4gKiBhIHN0ZXBwZWQgcGF0aCBmcm9tIGl0cyBkb29yLCBhbmQgYSB0ZXJyYWNlZCBmaWVsZCBvbiB0aGUgc2xvcGUgYmVsb3cuXG4gKi9cbmV4cG9ydCBjb25zdCBNMl9QUk9KRUNUUzogcmVhZG9ubHkgTTJQcm9qZWN0W10gPSBbXG4gIHtcbiAgICBpZDogJ2hvdXNlJyxcbiAgICBuYW1lOiBcIkZvdW5kZXIncyBob3VzZVwiLFxuICAgIHN1YnRpdGxlOiAnOCB4IDYgbSBcdTAwQjcgZmxhdCBzdG9uZSBzaGVsZicsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIDE5LW1vZHVsZSBmb3VuZGVyIGNhbmRpZGF0ZSB1c2VzIGEgZmxhdCBzdG9uZSBmb3VuZGF0aW9uLCBhIDMuMiBtIHN0b3JleSwgYSByZWFsIGVhc3QgZG9vcndheSAnXG4gICAgICArICdhbmQgdHdvIG9wZW4gc291dGggd2luZG93cy4gU3RydWN0dXJhbCB3YWxsIHZvaWRzIHJlcXVpcmUgbW9yZSBwcmltaXRpdmVzIHRoYW4gdGhlIHByb3Zpc2lvbmFsICdcbiAgICAgICsgJ2Fzc2V0LXZvbHVtZSB0YXJnZXQ7IHRoaXMgZGVzaWduIHJlbWFpbnMgc3ViamVjdCB0byBhcnQgcmV2aWV3LicsXG4gICAgc2l0ZUlkOiBNMDAyX0xBWU9VVC5ob3VzZS5pZCxcbiAgICBraW5kOiAnaG91c2UnLFxuICAgIHJlY3Q6IE0wMDJfTEFZT1VULmhvdXNlLnJlY3QsXG4gICAgZmxvb3JZOiBNMDAyX0xBWU9VVC5ob3VzZS5mbG9vclksXG4gICAgcnVsZXM6IEhPVVNFX1JVTEVTLFxuICAgIGNvc3Q6IHsgLi4uSE9VU0VfQ09TVCB9LFxuICAgIGRvb3I6IE0wMDJfTEFZT1VULmhvdXNlLmRvb3IsXG4gICAgYXBwcm9hY2g6IE0wMDJfTEFZT1VULmhvdXNlLmFwcHJvYWNoLFxuICAgIHByZXA6IHt9LFxuICB9LFxuICB7XG4gICAgaWQ6ICdwYXRoJyxcbiAgICBuYW1lOiAnRG9vciBwYXRoJyxcbiAgICBzdWJ0aXRsZTogJzkgeCAzIG0gXHUwMEI3IHN0ZXBwZWQgZ3JhdmVsJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdBIG5pbmUtbWV0cmUgY29ycmlkb3IgZnJvbSB0aGUgaG91c2UgZG9vciB0byB0aGUgYXBwcm9hY2guICdcbiAgICAgICsgJ0VhY2ggY29sdW1uIGlzIGN1dCB0byBhIHBpbm5lZCBwcm9maWxlIHNvIHRoZSByaXNlIHN0YXlzIHdhbGthYmxlLicsXG4gICAgc2l0ZUlkOiBNMDAyX1BBVEhfU0lURV9JRCxcbiAgICBraW5kOiAncGF0aCcsXG4gICAgcmVjdDogcGF0aFJlY3QsXG4gICAgZmxvb3JZOiAxMixcbiAgICBydWxlczogUEFUSF9SVUxFUyxcbiAgICBjb3N0OiBwYXRoQ29zdChwYXRoUmVjdC54MSAtIHBhdGhSZWN0LngwICsgMSksXG4gICAgcHJlcDoge1xuICAgICAgdGFyZ2V0czogcGF0aFRhcmdldHMsXG4gICAgICBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5HUkFWRUwsXG4gICAgICBlbnZlbG9wZTogW00wMDJfTEFZT1VULmVudmVsb3BlWzFdXSxcbiAgICB9LFxuICB9LFxuICB7XG4gICAgaWQ6ICdmYXJtJyxcbiAgICBuYW1lOiAnVGVycmFjZWQgZmllbGQnLFxuICAgIHN1YnRpdGxlOiAnMTIgeCA4IG0gXHUwMEI3IHRocmVlIGJhbmRzJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaHJlZSBzb2lsIHRlcnJhY2VzIHN0ZXBwaW5nIGRvd24gdGhlIHNsb3BlLCBoZWxkIGJ5IHN0b25lIHJldGFpbmluZyB3YWxscy4gJ1xuICAgICAgKyAnVGhlIGJsb3Nzb20gdHJlZSBvbiB0aGUgZmllbGQgaXMgY2xlYXJlZCBkdXJpbmcgcHJlcGFyYXRpb24uJyxcbiAgICBzaXRlSWQ6IE0wMDJfTEFZT1VULmZhcm0uaWQsXG4gICAga2luZDogJ3RlcnJhY2UnLFxuICAgIHJlY3Q6IE0wMDJfTEFZT1VULmZhcm0ucmVjdCxcbiAgICBmbG9vclk6IDE1LFxuICAgIHJ1bGVzOiBGQVJNX1JVTEVTLFxuICAgIGNvc3Q6IHsgLi4uVEVSUkFDRV9DT1NUIH0sXG4gICAgdGVycmFjZXM6IE0wMDJfTEFZT1VULmZhcm0udGVycmFjZXMsXG4gICAgcHJlcDoge1xuICAgICAgdGFyZ2V0czogZmFybVRhcmdldHMsXG4gICAgICBzdXJmYWNlTWF0ZXJpYWw6IE1BVC5TT0lMLFxuICAgICAgZW52ZWxvcGU6IFtNMDAyX0xBWU9VVC5lbnZlbG9wZVsyXV0sXG4gICAgfSxcbiAgICBnaG9zdEJhbmRzOiBNMDAyX1RFUlJBQ0VfQkFORFMsXG4gIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdEJ5SWQoaWQ6IE0yUHJvamVjdElkKTogTTJQcm9qZWN0IHtcbiAgY29uc3QgcHJvamVjdCA9IE0yX1BST0pFQ1RTLmZpbmQoKHApID0+IHAuaWQgPT09IGlkKTtcbiAgaWYgKCFwcm9qZWN0KSB0aHJvdyBuZXcgRXJyb3IoYHVua25vd24gTTAwMiBwcm9qZWN0OiAke2lkfWApO1xuICByZXR1cm4gcHJvamVjdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RTaXRlUHJvcG9zYWwocHJvamVjdDogTTJQcm9qZWN0KTogU2l0ZVByb3Bvc2FsIHtcbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb2plY3Quc2l0ZUlkLFxuICAgIHJlY3Q6IHByb2plY3QucmVjdCxcbiAgICBmbG9vclk6IHByb2plY3QuZmxvb3JZLFxuICAgIHJ1bGVzOiBwcm9qZWN0LnJ1bGVzLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdFN0cnVjdHVyZVByb3Bvc2FsKFxuICBwcm9qZWN0OiBNMlByb2plY3QsIGRlc2lnblZlcnNpb24/OiBTdHJ1Y3R1cmVEZXNpZ25WZXJzaW9uLFxuKTogU3RydWN0dXJlUHJvcG9zYWwge1xuICByZXR1cm4ge1xuICAgIHNpdGVJZDogcHJvamVjdC5zaXRlSWQsXG4gICAga2luZDogcHJvamVjdC5raW5kLFxuICAgIHJlY3Q6IHByb2plY3QucmVjdCxcbiAgICBmbG9vclk6IHByb2plY3QuZmxvb3JZLFxuICAgIGRvb3I6IHByb2plY3QuZG9vcixcbiAgICBhcHByb2FjaDogcHJvamVjdC5hcHByb2FjaCxcbiAgICB0ZXJyYWNlczogcHJvamVjdC50ZXJyYWNlcyxcbiAgICAuLi4oZGVzaWduVmVyc2lvbiA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGRlc2lnblZlcnNpb24gfSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Byb2plY3RCdWlsdCh3b3JsZDogV29ybGQsIHByb2plY3Q6IE0yUHJvamVjdCk6IGJvb2xlYW4ge1xuICBmb3IgKGNvbnN0IHN0cnVjdHVyZSBvZiB3b3JsZC5zdHJ1Y3R1cmVzLnZhbHVlcygpKSB7XG4gICAgaWYgKHN0cnVjdHVyZS5zaXRlSWQgPT09IHByb2plY3Quc2l0ZUlkICYmIHN0cnVjdHVyZS5raW5kID09PSBwcm9qZWN0LmtpbmQpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaW5nUmVzb3VyY2Uge1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlO1xuICBuZWVkOiBudW1iZXI7XG4gIGhhdmU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1pc3NpbmdSZXNvdXJjZXMod29ybGQ6IFdvcmxkLCBwcm9qZWN0OiBNMlByb2plY3QpOiBNaXNzaW5nUmVzb3VyY2VbXSB7XG4gIGNvbnN0IG1pc3Npbmc6IE1pc3NpbmdSZXNvdXJjZVtdID0gW107XG4gIGZvciAoY29uc3QgW3Jlc291cmNlLCBhbW91bnRdIG9mIE9iamVjdC5lbnRyaWVzKHByb2plY3QuY29zdCkpIHtcbiAgICBjb25zdCBuZWVkID0gYW1vdW50ID8/IDA7XG4gICAgY29uc3QgaGF2ZSA9IHdvcmxkLmludmVudG9yeVtyZXNvdXJjZV0gPz8gMDtcbiAgICBpZiAoaGF2ZSA8IG5lZWQpIG1pc3NpbmcucHVzaCh7IHJlc291cmNlOiByZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGUsIG5lZWQsIGhhdmUgfSk7XG4gIH1cbiAgcmV0dXJuIG1pc3Npbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvamVjdEluc3BlY3Rpb24ge1xuICBwcm9qZWN0SWQ6IE0yUHJvamVjdElkO1xuICBidWlsdDogYm9vbGVhbjtcbiAgYWZmb3JkYWJsZTogYm9vbGVhbjtcbiAgbWlzc2luZzogTWlzc2luZ1Jlc291cmNlW107XG4gIHN0YXRlOiBTaXRlU3RhdGU7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgcHJldmlldzogU2l0ZVByZXZpZXc7XG4gIHBsYW46IFBsYW5SZXN1bHQ7XG4gIGNhbkJ1aWxkOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJlYWQtb25seSBpbnNwZWN0aW9uIGZvciB0aGUgZ2hvc3QgYW5kIHNpZGViYXIuIEl0IHJ1bnMgdGhlIHNhbWUgdmFsaWRhdG9yXG4gKiBhbmQgdGhlIHNhbWUgcHJlcGFyYXRpb24gcGxhbm5lciB0aGUgYnVpbGQgYnV0dG9uIHdpbGwgcnVuLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zcGVjdFByb2plY3Qod29ybGQ6IFdvcmxkLCBwcm9qZWN0OiBNMlByb2plY3QpOiBQcm9qZWN0SW5zcGVjdGlvbiB7XG4gIGNvbnN0IHByb3Bvc2FsID0gcHJvamVjdFNpdGVQcm9wb3NhbChwcm9qZWN0KTtcbiAgY29uc3QgcHJldmlldyA9IHByZXZpZXdTaXRlKHdvcmxkLCBwcm9wb3NhbCwge1xuICAgIGRvb3I6IHByb2plY3QuZG9vcixcbiAgICBhcHByb2FjaDogcHJvamVjdC5hcHByb2FjaCxcbiAgfSk7XG4gIGNvbnN0IHBsYW4gPSBwbGFuUHJlcGFyYXRpb24od29ybGQsIHByb3Bvc2FsLCBwcm9qZWN0LnByZXApO1xuICBjb25zdCBidWlsdCA9IGlzUHJvamVjdEJ1aWx0KHdvcmxkLCBwcm9qZWN0KTtcbiAgY29uc3QgbWlzc2luZyA9IG1pc3NpbmdSZXNvdXJjZXMod29ybGQsIHByb2plY3QpO1xuICBjb25zdCBzdGF0ZSA9IHBsYW4ub2sgPyBwbGFuLnZhbGlkYXRpb24uc3RhdGUgOiBwcmV2aWV3LnN0YXRlO1xuICBjb25zdCByZWFzb25zID0gcGxhbi5vayA/IHBsYW4udmFsaWRhdGlvbi5yZWFzb25zIDogcHJldmlldy5yZWFzb25zO1xuXG4gIHJldHVybiB7XG4gICAgcHJvamVjdElkOiBwcm9qZWN0LmlkLFxuICAgIGJ1aWx0LFxuICAgIGFmZm9yZGFibGU6IG1pc3NpbmcubGVuZ3RoID09PSAwLFxuICAgIG1pc3NpbmcsXG4gICAgc3RhdGUsXG4gICAgcmVhc29ucyxcbiAgICBwcmV2aWV3LFxuICAgIHBsYW4sXG4gICAgY2FuQnVpbGQ6ICFidWlsdCAmJiBtaXNzaW5nLmxlbmd0aCA9PT0gMCAmJiBwbGFuLm9rICYmIHN0YXRlICE9PSAnaW52YWxpZCcsXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvamVjdEJ1aWxkU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwcm9qZWN0OiBNMlByb2plY3Q7XG4gIHByZXBhcmF0aW9uOiBQcmVwYXJhdGlvbkxlZGdlcjtcbiAgc3RydWN0dXJlOiBTdHJ1Y3R1cmVMZWRnZXI7XG4gIHJlY29yZDogU3RydWN0dXJlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2plY3RCdWlsZEZhaWx1cmUge1xuICBvazogZmFsc2U7XG4gIHByb2plY3Q6IE0yUHJvamVjdDtcbiAgc3RhZ2U6ICdwcmVjaGVjaycgfCAncHJlcGFyZScgfCAnc3RydWN0dXJlJztcbiAgY29kZTogc3RyaW5nO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbiAgcHJlcGFyYXRpb24/OiBQcmVwYXJhdGlvbkxlZGdlcjtcbiAgLyoqIEZhaWxlZCBidWlsZHMgcm9sbCBiYWNrIHRoZSBlbnRpcmUgYXV0aG9yaXRhdGl2ZSBwcmUtYnVpbGQgc25hcHNob3QuICovXG4gIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2U7XG4gIHJldHJ5YWJsZTogdHJ1ZTtcbn1cblxuZXhwb3J0IHR5cGUgUHJvamVjdEJ1aWxkUmVzdWx0ID0gUHJvamVjdEJ1aWxkU3VjY2VzcyB8IFByb2plY3RCdWlsZEZhaWx1cmU7XG5cbi8qKlxuICogUHJlcGFyZSB0aGUgc2l0ZSBhbmQgY29uc3RydWN0IHRoZSBwcm9qZWN0IHRocm91Z2ggdGhlIGF1dGhvcml6ZWQgcGlwZWxpbmUuXG4gKiBUaGUgcmVzb3VyY2UgY2hlY2sgaGFwcGVucyBiZWZvcmUgYW55IHRlcnJhaW4gZWRpdCwgc28gYW4gdW5hZmZvcmRhYmxlIGJ1aWxkXG4gKiBjYW5ub3QgbGVhdmUgYSBncmFkZWQgcGFkIGJlaGluZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUHJvamVjdChcbiAgd29ybGQ6IFdvcmxkLFxuICBwcmVwQXV0aG9yaXplcjogTG9jYWxBdXRob3JpemVyLFxuICBzdHJ1Y3R1cmVBdXRob3JpemVyOiBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsXG4gIHByb2plY3Q6IE0yUHJvamVjdCxcbiAgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZURlc2lnblZlcnNpb24sXG4pOiBQcm9qZWN0QnVpbGRSZXN1bHQge1xuICBpZiAoaXNQcm9qZWN0QnVpbHQod29ybGQsIHByb2plY3QpKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdwcmVjaGVjaycsIGNvZGU6ICdhbHJlYWR5X2J1aWx0JyxcbiAgICAgIHJlYXNvbnM6IFtgJHtwcm9qZWN0Lm5hbWV9IGlzIGFscmVhZHkgYnVpbHRgXSxcbiAgICAgIHN0cnVjdHVyZUZhaWx1cmVSZXRhaW5lZDogZmFsc2UsIHJldHJ5YWJsZTogdHJ1ZSxcbiAgICB9O1xuICB9XG4gIGNvbnN0IG1pc3NpbmcgPSBtaXNzaW5nUmVzb3VyY2VzKHdvcmxkLCBwcm9qZWN0KTtcbiAgaWYgKG1pc3NpbmcubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAncHJlY2hlY2snLCBjb2RlOiAnaW5zdWZmaWNpZW50X3Jlc291cmNlcycsXG4gICAgICByZWFzb25zOiBtaXNzaW5nLm1hcCgobSkgPT4gYG5lZWQgJHttLm5lZWR9ICR7bS5yZXNvdXJjZX0sIGhhdmUgJHttLmhhdmV9YCksXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IGJlZm9yZSA9IGNyZWF0ZVdvcmxkU25hcHNob3Qod29ybGQsIDApO1xuICBjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVTaXRlKHdvcmxkLCBwcmVwQXV0aG9yaXplciwgcHJvamVjdFNpdGVQcm9wb3NhbChwcm9qZWN0KSwgcHJvamVjdC5wcmVwKTtcbiAgaWYgKCFwcmVwYXJlZC5vaykge1xuICAgIHJlc3RvcmVXb3JsZFNuYXBzaG90KHdvcmxkLCBiZWZvcmUpO1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsIHByb2plY3QsIHN0YWdlOiAncHJlcGFyZScsIGNvZGU6IHByZXBhcmVkLmNvZGUsXG4gICAgICByZWFzb25zOiBbLi4ucHJlcGFyZWQucmVhc29ucywgJ05vIHByZXBhcmF0aW9uLCByZXNvdXJjZSBvciBlbnRpdHkgY2hhbmdlcyB3ZXJlIHJldGFpbmVkLiddLFxuICAgICAgc3RydWN0dXJlRmFpbHVyZVJldGFpbmVkOiBmYWxzZSwgcmV0cnlhYmxlOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBidWlsdCA9IGJ1aWxkU3RydWN0dXJlKHdvcmxkLCBzdHJ1Y3R1cmVBdXRob3JpemVyLCBwcm9qZWN0U3RydWN0dXJlUHJvcG9zYWwocHJvamVjdCwgZGVzaWduVmVyc2lvbikpO1xuICBpZiAoIWJ1aWx0Lm9rKSB7XG4gICAgcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQsIGJlZm9yZSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdzdHJ1Y3R1cmUnLCBjb2RlOiBidWlsdC5jb2RlLFxuICAgICAgcmVhc29uczogWy4uLmJ1aWx0LnJlYXNvbnMsXG4gICAgICAgICdBbGwgcHJlcGFyYXRpb24sIHJlc291cmNlIGFuZCBlbnRpdHkgY2hhbmdlcyB3ZXJlIHJvbGxlZCBiYWNrOyB0aGUgYnVpbGQgY2FuIGJlIHJldHJpZWQuJ10sXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHJlY29yZCA9IHdvcmxkLnN0cnVjdHVyZXMuZ2V0KGJ1aWx0LmxlZGdlci5zdHJ1Y3R1cmVJZCk7XG4gIGlmICghcmVjb3JkKSB7XG4gICAgcmVzdG9yZVdvcmxkU25hcHNob3Qod29ybGQsIGJlZm9yZSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSwgcHJvamVjdCwgc3RhZ2U6ICdzdHJ1Y3R1cmUnLCBjb2RlOiAnbWlzc2luZ19yZWNvcmQnLFxuICAgICAgcmVhc29uczogWydzdHJ1Y3R1cmUgbGVkZ2VyIHdhcyB3cml0dGVuIGJ1dCB0aGUgd29ybGQgaGFzIG5vIHJlY29yZCcsXG4gICAgICAgICdBbGwgcHJlcGFyYXRpb24sIHJlc291cmNlIGFuZCBlbnRpdHkgY2hhbmdlcyB3ZXJlIHJvbGxlZCBiYWNrOyB0aGUgYnVpbGQgY2FuIGJlIHJldHJpZWQuJ10sXG4gICAgICBzdHJ1Y3R1cmVGYWlsdXJlUmV0YWluZWQ6IGZhbHNlLCByZXRyeWFibGU6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgcHJvamVjdCxcbiAgICBwcmVwYXJhdGlvbjogcHJlcGFyZWQubGVkZ2VyLFxuICAgIHN0cnVjdHVyZTogYnVpbHQubGVkZ2VyLFxuICAgIHJlY29yZCxcbiAgfTtcbn1cbiIsICIvLyBUaGUgc29sZSB3cml0ZSBib3VuZGFyeSBmb3IgdGhlIHBsYXlhYmxlIE0wMDIgc2xpY2UuIEFjY2VwdGVkIGNvbW1hbmRzIGFyZVxuLy8gZHVyYWJsZSBpbnB1dDsgcmVqZWN0ZWQgYXR0ZW1wdHMsIHJlbmRlcmVyIHdvcmsgYW5kIHRlcnJhaW4gcXVlcmllcyBhcmUgbm90LlxuaW1wb3J0IHtcbiAgRW50aXR5LCBSZXNvdXJjZVR5cGUsIFdvcmxkLCBjcmVhdGVXb3JsZCwgZ2VuZXJhdGVXb3JsZCwgaGFydmVzdEVudGl0eSwgcGxhY2VBdXRob3JlZFNpdGVzLFxuICByZXRpcmVTdG9uZUVudGl0aWVzLCBpc1JldGlyZWRTdG9uZUtpbmQsXG59IGZyb20gJy4uL3NpbS93b3JsZCc7XG5pbXBvcnQgeyBNMDAyX0xBWU9VVCB9IGZyb20gJy4uL3NpbS9tMDAyJztcbmltcG9ydCB7IExvY2FsQXV0aG9yaXplciB9IGZyb20gJy4uL3NpbS9wcmVwYXJhdGlvbic7XG5pbXBvcnQgeyBMb2NhbFN0cnVjdHVyZUF1dGhvcml6ZXIsIEZPVU5ERVJfREVTSUdOX1ZFUlNJT04gfSBmcm9tICcuLi9zaW0vc3RydWN0dXJlcyc7XG5pbXBvcnQgeyBNMDAyX1NUQVJURVJfSU5WRU5UT1JZIH0gZnJvbSAnLi4vc2ltL3NjZW5hcmlvJztcbmltcG9ydCB7XG4gIFdvcmxkU25hcHNob3QsIGNhbm9uaWNhbFdvcmxkSGFzaCwgY3JlYXRlV29ybGRTbmFwc2hvdCxcbiAgbGVnYWN5U3RvbmVIYXNoLCBtaWdyYXRlU3RvbmVTbmFwc2hvdCwgcmVzdG9yZVdvcmxkU25hcHNob3RFeGFjdCwgdmFsaWRhdGVXb3JsZFNuYXBzaG90LCB3b3JsZEZyb21TbmFwc2hvdCxcbn0gZnJvbSAnLi4vc2ltL3NuYXBzaG90JztcbmltcG9ydCB7IGVuYWJsZVN0b25lUmVwbGF5LCBmaW5pc2hTdG9uZVJlcGxheSB9IGZyb20gJy4uL3NpbS9zdG9uZS1jb21wYXQnO1xuaW1wb3J0IHsgTTJQcm9qZWN0SWQsIGJ1aWxkUHJvamVjdCwgcHJvamVjdEJ5SWQgfSBmcm9tICcuL3Byb2plY3RzJztcbmltcG9ydCB7XG4gIEZPVU5ERVJfU1RPQ0tQSUxFX0lELCBMSUZFX1JFU09VUkNFUywgTGlmZVJlc291cmNlLCBMaWZlUmVzb3VyY2VCYWcsIFJFQ0lQRVMsIFJlY2lwZUlkLFxuICBhZHZhbmNlVGlja3MsIGNyZWF0ZUxpZmVTdGF0ZSwgaGFydmVzdENyb3AsIHBsYW50Q3JvcCwgc3RhcnRQcm9kdWN0aW9uLCB0cmFuc2Zlcixcbn0gZnJvbSAnLi4vc2ltL2Vjb25vbXknO1xuXG5leHBvcnQgY29uc3QgSk9VUk5BTF9TQ0hFTUEgPSAxIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IERFU0lHTl9KT1VSTkFMX1NDSEVNQSA9IDIgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSA9IDMgYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgTUFYX0pPVVJOQUxfRU5UUklFUyA9IDEwMF8wMDA7XG5leHBvcnQgdHlwZSBDb21tYW5kID0gTGVnYWN5QnVpbGRDb21tYW5kIHwgQnVpbGRDb21tYW5kIHwgSGFydmVzdENvbW1hbmRcbiAgfCBUcmFuc2ZlckNvbW1hbmQgfCBQcm9kdWNlQ29tbWFuZCB8IFRpY2tDb21tYW5kIHwgUGxhbnRDb21tYW5kIHwgSGFydmVzdENyb3BDb21tYW5kO1xuaW50ZXJmYWNlIENvbW1hbmRFbnZlbG9wZSB7XG4gIHNjaGVtYTogdHlwZW9mIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUE7XG4gIGlkOiBzdHJpbmc7XG4gIGV4cGVjdGVkUmV2aXNpb246IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNmZXJDb21tYW5kIGV4dGVuZHMgQ29tbWFuZEVudmVsb3BlIHtcbiAgdHlwZTogJ2RlcG9zaXQnIHwgJ3dpdGhkcmF3JztcbiAgc3RvY2twaWxlSWQ6IHR5cGVvZiBGT1VOREVSX1NUT0NLUElMRV9JRDtcbiAgcmVzb3VyY2VzOiBMaWZlUmVzb3VyY2VCYWc7XG59XG5leHBvcnQgaW50ZXJmYWNlIFByb2R1Y2VDb21tYW5kIGV4dGVuZHMgQ29tbWFuZEVudmVsb3BlIHtcbiAgdHlwZTogJ3Byb2R1Y2UnOyBzdG9ja3BpbGVJZDogdHlwZW9mIEZPVU5ERVJfU1RPQ0tQSUxFX0lEOyByZWNpcGU6IGtleW9mIHR5cGVvZiBSRUNJUEVTO1xufVxuZXhwb3J0IGludGVyZmFjZSBUaWNrQ29tbWFuZCBleHRlbmRzIENvbW1hbmRFbnZlbG9wZSB7IHR5cGU6ICd0aWNrJzsgdGlja3M6IG51bWJlcjsgfVxuZXhwb3J0IGludGVyZmFjZSBQbGFudENvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUgeyB0eXBlOiAncGxhbnQnOyBwbG90SWQ6IHN0cmluZzsgfVxuZXhwb3J0IGludGVyZmFjZSBIYXJ2ZXN0Q3JvcENvbW1hbmQgZXh0ZW5kcyBDb21tYW5kRW52ZWxvcGUgeyB0eXBlOiAnaGFydmVzdF9jcm9wJzsgcGxvdElkOiBzdHJpbmc7IH1cbmV4cG9ydCBpbnRlcmZhY2UgTGVnYWN5QnVpbGRDb21tYW5kIHtcbiAgc2NoZW1hOiB0eXBlb2YgSk9VUk5BTF9TQ0hFTUE7XG4gIGlkOiBzdHJpbmc7XG4gIHR5cGU6ICdidWlsZCc7XG4gIHByb2plY3RJZDogTTJQcm9qZWN0SWQ7XG4gIGV4cGVjdGVkUmV2aXNpb246IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbGRDb21tYW5kIHtcbiAgc2NoZW1hOiB0eXBlb2YgREVTSUdOX0pPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIENVUlJFTlRfSk9VUk5BTF9TQ0hFTUE7XG4gIGlkOiBzdHJpbmc7XG4gIHR5cGU6ICdidWlsZCc7XG4gIHByb2plY3RJZDogTTJQcm9qZWN0SWQ7XG4gIGV4cGVjdGVkUmV2aXNpb246IG51bWJlcjtcbiAgZGVzaWduVmVyc2lvbjogdHlwZW9mIEZPVU5ERVJfREVTSUdOX1ZFUlNJT047XG59XG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RDb21tYW5kIHtcbiAgc2NoZW1hOiB0eXBlb2YgSk9VUk5BTF9TQ0hFTUEgfCB0eXBlb2YgQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQTtcbiAgaWQ6IHN0cmluZztcbiAgdHlwZTogJ2hhcnZlc3QnO1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBleHBlY3RlZFJldmlzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIENvbW1hbmRPdXRjb21lID0gQnVpbGRPdXRjb21lIHwgSGFydmVzdE91dGNvbWUgfCBUcmFuc2Zlck91dGNvbWUgfCBQcm9kdWNlT3V0Y29tZSB8IFRpY2tPdXRjb21lIHwgUGxhbnRPdXRjb21lIHwgQ3JvcE91dGNvbWU7XG5leHBvcnQgaW50ZXJmYWNlIFRyYW5zZmVyT3V0Y29tZSB7XG4gIHR5cGU6ICdkZXBvc2l0JyB8ICd3aXRoZHJhdyc7IHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gIHJlc291cmNlczogUGFydGlhbDxSZWNvcmQ8TGlmZVJlc291cmNlLCBudW1iZXI+Pjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZHVjZU91dGNvbWUge1xuICB0eXBlOiAncHJvZHVjZSc7IGpvYklkOiBzdHJpbmc7IHN0b2NrcGlsZUlkOiB0eXBlb2YgRk9VTkRFUl9TVE9DS1BJTEVfSUQ7XG4gIHJlY2lwZToga2V5b2YgdHlwZW9mIFJFQ0lQRVM7IHJlbWFpbmluZ1RpY2tzOiBudW1iZXI7XG59XG5leHBvcnQgaW50ZXJmYWNlIFRpY2tPdXRjb21lIHtcbiAgdHlwZTogJ3RpY2snOyBmcm9tVGljazogbnVtYmVyOyB0b1RpY2s6IG51bWJlcjtcbiAgY29tcGxldGVkSm9iczogQXJyYXk8eyBpZDogc3RyaW5nOyByZWNpcGU6IGtleW9mIHR5cGVvZiBSRUNJUEVTOyBvdXRwdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfT47XG4gIHJlYWR5Q3JvcHM6IHN0cmluZ1tdO1xufVxuZXhwb3J0IGludGVyZmFjZSBQbGFudE91dGNvbWUge1xuICB0eXBlOiAncGxhbnQnOyBwbG90SWQ6IHN0cmluZzsgcGxhbnRlZFRpY2s6IG51bWJlcjsgZ3Jvd3RoVGlja3M6IG51bWJlcjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQ3JvcE91dGNvbWUge1xuICB0eXBlOiAnaGFydmVzdF9jcm9wJzsgcGxvdElkOiBzdHJpbmc7IHJlc291cmNlczogeyBmb29kOiBudW1iZXI7IGZpYmVyOiBudW1iZXIgfTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbGRPdXRjb21lIHtcbiAgdHlwZTogJ2J1aWxkJztcbiAgc3RydWN0dXJlSWQ6IHN0cmluZztcbiAgY29zdFBhaWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj47XG4gIHJlc291cmNlc0dhaW5lZDogUGFydGlhbDxSZWNvcmQ8UmVzb3VyY2VUeXBlLCBudW1iZXI+Pjtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSGFydmVzdE91dGNvbWUge1xuICB0eXBlOiAnaGFydmVzdCc7XG4gIGVudGl0eUlkOiBzdHJpbmc7XG4gIHJlc291cmNlOiBSZXNvdXJjZVR5cGU7XG4gIGFtb3VudDogbnVtYmVyO1xufVxuZXhwb3J0IGludGVyZmFjZSBKb3VybmFsRW50cnkge1xuICBjb21tYW5kOiBDb21tYW5kO1xuICBzZXF1ZW5jZTogbnVtYmVyO1xuICByZXZpc2lvbjogbnVtYmVyO1xuICBoYXNoOiBzdHJpbmc7XG4gIG91dGNvbWU6IENvbW1hbmRPdXRjb21lO1xufVxuZXhwb3J0IGludGVyZmFjZSBDb21tYW5kSm91cm5hbCB7XG4gIHNjaGVtYTogdHlwZW9mIEpPVVJOQUxfU0NIRU1BIHwgdHlwZW9mIERFU0lHTl9KT1VSTkFMX1NDSEVNQSB8IHR5cGVvZiBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BO1xuICBzZWVkOiBudW1iZXI7XG4gIHN0YXJ0ZXJJbnZlbnRvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGVudHJpZXM6IEpvdXJuYWxFbnRyeVtdO1xufVxuZXhwb3J0IGludGVyZmFjZSBDb21tYW5kUmVjZWlwdCB7XG4gIG9rOiB0cnVlO1xuICBkdXBsaWNhdGU6IGJvb2xlYW47XG4gIGlkOiBzdHJpbmc7XG4gIHNlcXVlbmNlOiBudW1iZXI7XG4gIHJldmlzaW9uOiBudW1iZXI7XG4gIGhhc2g6IHN0cmluZztcbiAgb3V0Y29tZTogQ29tbWFuZE91dGNvbWU7XG59XG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRSZWplY3Rpb24ge1xuICBvazogZmFsc2U7XG4gIGR1cGxpY2F0ZTogZmFsc2U7XG4gIGlkOiBzdHJpbmc7XG4gIGNvZGU6IHN0cmluZztcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmZ1bmN0aW9uIG9iamVjdCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuZnVuY3Rpb24gdWludCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc1NhZmVJbnRlZ2VyKHZhbHVlKSAmJiB2YWx1ZSA+PSAwO1xufVxuZnVuY3Rpb24gaWQodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiAvXltBLVphLXowLTldW0EtWmEtejAtOS5fOiUtXXswLDEyN30kLy50ZXN0KHZhbHVlKTtcbn1cbmZ1bmN0aW9uIGVudGl0eUlkKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgc3RyaW5nIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUubGVuZ3RoIDw9IDEyOFxuICAgICYmICgvXmU6XFxkKyxcXGQrOlxcZCskLy50ZXN0KHZhbHVlKVxuICAgICAgfHwgL15oZXJvOnN0eWxfW2Etel9dKzotP1xcZCs6LT9cXGQrJC8udGVzdCh2YWx1ZSkpO1xufVxuZnVuY3Rpb24gc2FtZUZpZWxkcyhhOiB1bmtub3duLCBiOiB1bmtub3duKTogYm9vbGVhbiB7XG4gIGlmIChvYmplY3QoYSkgJiYgb2JqZWN0KGIpKSB7XG4gICAgY29uc3QgYUtleXMgPSBPYmplY3Qua2V5cyhhKS5zb3J0KCksIGJLZXlzID0gT2JqZWN0LmtleXMoYikuc29ydCgpO1xuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShhS2V5cykgPT09IEpTT04uc3RyaW5naWZ5KGJLZXlzKVxuICAgICAgJiYgYUtleXMuZXZlcnkoKGtleSkgPT4gc2FtZUZpZWxkcyhhW2tleV0sIGJba2V5XSkpO1xuICB9XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShhKSA9PT0gSlNPTi5zdHJpbmdpZnkoYik7XG59XG5cbmZ1bmN0aW9uIGludmVudG9yeSh2YWx1ZTogdW5rbm93bik6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBpZiAoIW9iamVjdCh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCByZXNvdXJjZSByZWNvcmQnKTtcbiAgY29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHZhbHVlKS5zb3J0KCkpIHtcbiAgICBpZiAoIUxJRkVfUkVTT1VSQ0VTLmluY2x1ZGVzKGtleSBhcyBMaWZlUmVzb3VyY2UpXG4gICAgICB8fCAhdWludCh2YWx1ZVtrZXldKSB8fCB2YWx1ZVtrZXldIDw9IDAgfHwgdmFsdWVba2V5XSA+IDFfMDAwXzAwMF8wMDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignaW52YWxpZCByZXNvdXJjZSByZWNvcmQnKTtcbiAgICB9XG4gICAgcmVzdWx0W2tleV0gPSB2YWx1ZVtrZXldO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKiBDYW5vbmljYWxpemUgYW5kIHJlamVjdCB1bmtub3duLCBhbWJpZ3VvdXMgb3IgbWFsZm9ybWVkIGNvbW1hbmQgZmllbGRzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlQ29tbWFuZCh2YWx1ZTogdW5rbm93bik6IENvbW1hbmQge1xuICBpZiAoIW9iamVjdCh2YWx1ZSkgfHwgKHZhbHVlLnNjaGVtYSAhPT0gSk9VUk5BTF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBERVNJR05fSk9VUk5BTF9TQ0hFTUEgJiYgdmFsdWUuc2NoZW1hICE9PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKVxuICAgIHx8ICFpZCh2YWx1ZS5pZCkgfHwgIXVpbnQodmFsdWUuZXhwZWN0ZWRSZXZpc2lvbikpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBjb21tYW5kIGVudmVsb3BlJyk7XG4gIGlmICh2YWx1ZS50eXBlID09PSAnYnVpbGQnICYmIFsnaG91c2UnLCAncGF0aCcsICdmYXJtJ10uaW5jbHVkZXMoU3RyaW5nKHZhbHVlLnByb2plY3RJZCkpKSB7XG4gICAgY29uc3QgY29tbWFuZDogQ29tbWFuZCA9IHZhbHVlLnNjaGVtYSAhPT0gSk9VUk5BTF9TQ0hFTUEgPyB7XG4gICAgICBzY2hlbWE6IHZhbHVlLnNjaGVtYSwgaWQ6IHZhbHVlLmlkLCB0eXBlOiAnYnVpbGQnLFxuICAgICAgcHJvamVjdElkOiB2YWx1ZS5wcm9qZWN0SWQgYXMgTTJQcm9qZWN0SWQsIGV4cGVjdGVkUmV2aXNpb246IHZhbHVlLmV4cGVjdGVkUmV2aXNpb24sXG4gICAgICBkZXNpZ25WZXJzaW9uOiB2YWx1ZS5kZXNpZ25WZXJzaW9uIGFzIHR5cGVvZiBGT1VOREVSX0RFU0lHTl9WRVJTSU9OLFxuICAgIH0gOiB7XG4gICAgICBzY2hlbWE6IEpPVVJOQUxfU0NIRU1BLCBpZDogdmFsdWUuaWQsIHR5cGU6ICdidWlsZCcsXG4gICAgICBwcm9qZWN0SWQ6IHZhbHVlLnByb2plY3RJZCBhcyBNMlByb2plY3RJZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbixcbiAgICB9O1xuICAgIGlmIChjb21tYW5kLnNjaGVtYSAhPT0gSk9VUk5BTF9TQ0hFTUEgJiYgY29tbWFuZC5kZXNpZ25WZXJzaW9uICE9PSBGT1VOREVSX0RFU0lHTl9WRVJTSU9OKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIHN0cnVjdHVyZSBkZXNpZ24nKTtcbiAgICB9XG4gICAgaWYgKCFzYW1lRmllbGRzKGNvbW1hbmQsIHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGJ1aWxkIGNvbW1hbmQnKTtcbiAgICByZXR1cm4gY29tbWFuZDtcbiAgfVxuICBpZiAodmFsdWUudHlwZSA9PT0gJ2hhcnZlc3QnICYmIHZhbHVlLnNjaGVtYSA9PT0gSk9VUk5BTF9TQ0hFTUEgJiYgZW50aXR5SWQodmFsdWUuZW50aXR5SWQpKSB7XG4gICAgY29uc3QgY29tbWFuZDogQ29tbWFuZCA9IHtcbiAgICAgIHNjaGVtYTogdmFsdWUuc2NoZW1hLCBpZDogdmFsdWUuaWQsIHR5cGU6ICdoYXJ2ZXN0JyxcbiAgICAgIGVudGl0eUlkOiB2YWx1ZS5lbnRpdHlJZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbixcbiAgICB9O1xuICAgIGlmICghc2FtZUZpZWxkcyhjb21tYW5kLCB2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBoYXJ2ZXN0IGNvbW1hbmQnKTtcbiAgICByZXR1cm4gY29tbWFuZDtcbiAgfVxuICBpZiAodmFsdWUuc2NoZW1hID09PSBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BKSB7XG4gICAgY29uc3QgYmFzZSA9IHsgc2NoZW1hOiB2YWx1ZS5zY2hlbWEsIGlkOiB2YWx1ZS5pZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbiB9O1xuICAgIGxldCBjb21tYW5kOiBDb21tYW5kIHwgbnVsbCA9IG51bGw7XG4gICAgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0JyAmJiBlbnRpdHlJZCh2YWx1ZS5lbnRpdHlJZCkpIHtcbiAgICAgIGNvbW1hbmQgPSB7IHNjaGVtYTogdmFsdWUuc2NoZW1hLCBpZDogdmFsdWUuaWQsIHR5cGU6IHZhbHVlLnR5cGUsXG4gICAgICAgIGVudGl0eUlkOiB2YWx1ZS5lbnRpdHlJZCwgZXhwZWN0ZWRSZXZpc2lvbjogdmFsdWUuZXhwZWN0ZWRSZXZpc2lvbiB9O1xuICAgIH0gZWxzZSBpZiAoKHZhbHVlLnR5cGUgPT09ICdkZXBvc2l0JyB8fCB2YWx1ZS50eXBlID09PSAnd2l0aGRyYXcnKSAmJiB2YWx1ZS5zdG9ja3BpbGVJZCA9PT0gRk9VTkRFUl9TVE9DS1BJTEVfSUQpIHtcbiAgICAgIGNvbW1hbmQgPSB7IC4uLmJhc2UsIHR5cGU6IHZhbHVlLnR5cGUsIHN0b2NrcGlsZUlkOiB2YWx1ZS5zdG9ja3BpbGVJZCwgcmVzb3VyY2VzOiBpbnZlbnRvcnkodmFsdWUucmVzb3VyY2VzKSB9O1xuICAgIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3Byb2R1Y2UnICYmIHZhbHVlLnN0b2NrcGlsZUlkID09PSBGT1VOREVSX1NUT0NLUElMRV9JRFxuICAgICAgJiYgKHZhbHVlLnJlY2lwZSA9PT0gJ3NlZWQnIHx8IHZhbHVlLnJlY2lwZSA9PT0gJ3JhdGlvbnMnKSkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLCByZWNpcGU6IHZhbHVlLnJlY2lwZSB9O1xuICAgIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3RpY2snICYmIHVpbnQodmFsdWUudGlja3MpICYmIHZhbHVlLnRpY2tzID4gMCAmJiB2YWx1ZS50aWNrcyA8PSA2NCkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgdGlja3M6IHZhbHVlLnRpY2tzIH07XG4gICAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAncGxhbnQnICYmIHR5cGVvZiB2YWx1ZS5wbG90SWQgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QodmFsdWUucGxvdElkKSkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgcGxvdElkOiB2YWx1ZS5wbG90SWQgfTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnICYmIHR5cGVvZiB2YWx1ZS5wbG90SWQgPT09ICdzdHJpbmcnICYmIC9eY3JvcDpbMC04XSQvLnRlc3QodmFsdWUucGxvdElkKSkge1xuICAgICAgY29tbWFuZCA9IHsgLi4uYmFzZSwgdHlwZTogdmFsdWUudHlwZSwgcGxvdElkOiB2YWx1ZS5wbG90SWQgfTtcbiAgICB9XG4gICAgaWYgKGNvbW1hbmQpIHtcbiAgICAgIGlmICghc2FtZUZpZWxkcyhjb21tYW5kLCB2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBsaWZlLWxvb3AgY29tbWFuZCcpO1xuICAgICAgcmV0dXJuIGNvbW1hbmQ7XG4gICAgfVxuICB9XG4gIHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgY29tbWFuZCcpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZU91dGNvbWUodmFsdWU6IHVua25vd24pOiBDb21tYW5kT3V0Y29tZSB7XG4gIGlmICghb2JqZWN0KHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGNvbW1hbmQgb3V0Y29tZScpO1xuICBpZiAodmFsdWUudHlwZSA9PT0gJ2J1aWxkJyAmJiBpZCh2YWx1ZS5zdHJ1Y3R1cmVJZCkpIHtcbiAgICBjb25zdCBvdXRjb21lOiBDb21tYW5kT3V0Y29tZSA9IHtcbiAgICAgIHR5cGU6ICdidWlsZCcsIHN0cnVjdHVyZUlkOiB2YWx1ZS5zdHJ1Y3R1cmVJZCxcbiAgICAgIGNvc3RQYWlkOiBpbnZlbnRvcnkodmFsdWUuY29zdFBhaWQpLCByZXNvdXJjZXNHYWluZWQ6IGludmVudG9yeSh2YWx1ZS5yZXNvdXJjZXNHYWluZWQpLFxuICAgIH07XG4gICAgaWYgKEpTT04uc3RyaW5naWZ5KG91dGNvbWUpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBidWlsZCBvdXRjb21lJyk7XG4gICAgcmV0dXJuIG91dGNvbWU7XG4gIH1cbiAgaWYgKHZhbHVlLnR5cGUgPT09ICdoYXJ2ZXN0JyAmJiBlbnRpdHlJZCh2YWx1ZS5lbnRpdHlJZClcbiAgICAmJiBbJ3dvb2QnLCAnc3RvbmUnLCAnb3JlJywgJ2ZpYmVyJ10uaW5jbHVkZXMoU3RyaW5nKHZhbHVlLnJlc291cmNlKSlcbiAgICAmJiB1aW50KHZhbHVlLmFtb3VudCkgJiYgdmFsdWUuYW1vdW50ID4gMCAmJiB2YWx1ZS5hbW91bnQgPD0gMV8wMDBfMDAwKSB7XG4gICAgY29uc3Qgb3V0Y29tZTogQ29tbWFuZE91dGNvbWUgPSB7XG4gICAgICB0eXBlOiAnaGFydmVzdCcsIGVudGl0eUlkOiB2YWx1ZS5lbnRpdHlJZCxcbiAgICAgIHJlc291cmNlOiB2YWx1ZS5yZXNvdXJjZSBhcyBSZXNvdXJjZVR5cGUsIGFtb3VudDogdmFsdWUuYW1vdW50LFxuICAgIH07XG4gICAgaWYgKEpTT04uc3RyaW5naWZ5KG91dGNvbWUpICE9PSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIHRocm93IG5ldyBFcnJvcignbm9uLWNhbm9uaWNhbCBoYXJ2ZXN0IG91dGNvbWUnKTtcbiAgICByZXR1cm4gb3V0Y29tZTtcbiAgfVxuICBsZXQgb3V0Y29tZTogQ29tbWFuZE91dGNvbWUgfCBudWxsID0gbnVsbDtcbiAgaWYgKCh2YWx1ZS50eXBlID09PSAnZGVwb3NpdCcgfHwgdmFsdWUudHlwZSA9PT0gJ3dpdGhkcmF3JykgJiYgdmFsdWUuc3RvY2twaWxlSWQgPT09IEZPVU5ERVJfU1RPQ0tQSUxFX0lEKSB7XG4gICAgb3V0Y29tZSA9IHsgdHlwZTogdmFsdWUudHlwZSwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLCByZXNvdXJjZXM6IGludmVudG9yeSh2YWx1ZS5yZXNvdXJjZXMpIH07XG4gIH0gZWxzZSBpZiAodmFsdWUudHlwZSA9PT0gJ3Byb2R1Y2UnICYmIGlkKHZhbHVlLmpvYklkKSAmJiB2YWx1ZS5zdG9ja3BpbGVJZCA9PT0gRk9VTkRFUl9TVE9DS1BJTEVfSURcbiAgICAmJiAodmFsdWUucmVjaXBlID09PSAnc2VlZCcgfHwgdmFsdWUucmVjaXBlID09PSAncmF0aW9ucycpICYmIHVpbnQodmFsdWUucmVtYWluaW5nVGlja3MpICYmIHZhbHVlLnJlbWFpbmluZ1RpY2tzID4gMCkge1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIGpvYklkOiB2YWx1ZS5qb2JJZCwgc3RvY2twaWxlSWQ6IHZhbHVlLnN0b2NrcGlsZUlkLFxuICAgICAgcmVjaXBlOiB2YWx1ZS5yZWNpcGUsIHJlbWFpbmluZ1RpY2tzOiB2YWx1ZS5yZW1haW5pbmdUaWNrcyB9O1xuICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdwbGFudCcgJiYgdHlwZW9mIHZhbHVlLnBsb3RJZCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdCh2YWx1ZS5wbG90SWQpXG4gICAgJiYgdWludCh2YWx1ZS5wbGFudGVkVGljaykgJiYgdmFsdWUuZ3Jvd3RoVGlja3MgPT09IDQpIHtcbiAgICBvdXRjb21lID0geyB0eXBlOiB2YWx1ZS50eXBlLCBwbG90SWQ6IHZhbHVlLnBsb3RJZCwgcGxhbnRlZFRpY2s6IHZhbHVlLnBsYW50ZWRUaWNrLCBncm93dGhUaWNrczogdmFsdWUuZ3Jvd3RoVGlja3MgfTtcbiAgfSBlbHNlIGlmICh2YWx1ZS50eXBlID09PSAnaGFydmVzdF9jcm9wJyAmJiB0eXBlb2YgdmFsdWUucGxvdElkID09PSAnc3RyaW5nJyAmJiAvXmNyb3A6WzAtOF0kLy50ZXN0KHZhbHVlLnBsb3RJZClcbiAgICAmJiBpc1Jlc291cmNlcyh2YWx1ZS5yZXNvdXJjZXMpICYmIHZhbHVlLnJlc291cmNlcy5mb29kID09PSA2ICYmIHZhbHVlLnJlc291cmNlcy5maWJlciA9PT0gMSkge1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIHBsb3RJZDogdmFsdWUucGxvdElkLCByZXNvdXJjZXM6IHsgZm9vZDogNiwgZmliZXI6IDEgfSB9O1xuICB9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICd0aWNrJyAmJiB1aW50KHZhbHVlLmZyb21UaWNrKSAmJiB1aW50KHZhbHVlLnRvVGljaylcbiAgICAmJiB2YWx1ZS50b1RpY2sgPiB2YWx1ZS5mcm9tVGljayAmJiB2YWx1ZS50b1RpY2sgLSB2YWx1ZS5mcm9tVGljayA8PSA2NFxuICAgICYmIEFycmF5LmlzQXJyYXkodmFsdWUuY29tcGxldGVkSm9icykgJiYgQXJyYXkuaXNBcnJheSh2YWx1ZS5yZWFkeUNyb3BzKSkge1xuICAgIGNvbnN0IGNvbXBsZXRlZEpvYnM6IEFycmF5PHsgaWQ6IHN0cmluZzsgcmVjaXBlOiBSZWNpcGVJZDsgb3V0cHV0OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IH0+ID0gdmFsdWUuY29tcGxldGVkSm9icy5tYXAoKHJhdzogdW5rbm93bikgPT4ge1xuICAgICAgaWYgKCFvYmplY3QocmF3KSB8fCAhaWQocmF3LmlkKSB8fCAocmF3LnJlY2lwZSAhPT0gJ3NlZWQnICYmIHJhdy5yZWNpcGUgIT09ICdyYXRpb25zJykpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBjb21wbGV0ZWQgam9iJyk7XG4gICAgICByZXR1cm4geyBpZDogcmF3LmlkLCByZWNpcGU6IHJhdy5yZWNpcGUsIG91dHB1dDogaW52ZW50b3J5KHJhdy5vdXRwdXQpIH07XG4gICAgfSk7XG4gICAgaWYgKCF2YWx1ZS5yZWFkeUNyb3BzLmV2ZXJ5KChwbG90KSA9PiB0eXBlb2YgcGxvdCA9PT0gJ3N0cmluZycgJiYgL15jcm9wOlswLThdJC8udGVzdChwbG90KSkpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCByZWFkeSBjcm9wcycpO1xuICAgIG91dGNvbWUgPSB7IHR5cGU6IHZhbHVlLnR5cGUsIGZyb21UaWNrOiB2YWx1ZS5mcm9tVGljaywgdG9UaWNrOiB2YWx1ZS50b1RpY2ssXG4gICAgICBjb21wbGV0ZWRKb2JzLCByZWFkeUNyb3BzOiBbLi4udmFsdWUucmVhZHlDcm9wc10gfTtcbiAgfVxuICBpZiAob3V0Y29tZSkge1xuICAgIGlmIChKU09OLnN0cmluZ2lmeShvdXRjb21lKSAhPT0gSlNPTi5zdHJpbmdpZnkodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgbGlmZS1sb29wIG91dGNvbWUnKTtcbiAgICByZXR1cm4gb3V0Y29tZTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgY29tbWFuZCBvdXRjb21lJyk7XG59XG5cbmZ1bmN0aW9uIGlzUmVzb3VyY2VzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gIHJldHVybiBvYmplY3QodmFsdWUpICYmIE9iamVjdC52YWx1ZXModmFsdWUpLmV2ZXJ5KChhbW91bnQpID0+IHVpbnQoYW1vdW50KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVKb3VybmFsKHNlZWQgPSAxMzM3LCBzY2hlbWE6IENvbW1hbmRKb3VybmFsWydzY2hlbWEnXSA9IENVUlJFTlRfSk9VUk5BTF9TQ0hFTUEpOiBDb21tYW5kSm91cm5hbCB7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hLCBzZWVkLFxuICAgIHN0YXJ0ZXJJbnZlbnRvcnk6IGludmVudG9yeShNMDAyX1NUQVJURVJfSU5WRU5UT1JZKSwgZW50cmllczogW10sXG4gIH07XG59XG5cbi8qKiBWYWxpZGF0ZSBhbiBlbnRpcmUgam91cm5hbCB3aXRob3V0IGNoYW5naW5nIGEgbGl2ZSBzZXNzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlSm91cm5hbCh2YWx1ZTogdW5rbm93bik6IENvbW1hbmRKb3VybmFsIHtcbiAgaWYgKCFvYmplY3QodmFsdWUpIHx8ICh2YWx1ZS5zY2hlbWEgIT09IEpPVVJOQUxfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gREVTSUdOX0pPVVJOQUxfU0NIRU1BICYmIHZhbHVlLnNjaGVtYSAhPT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSlcbiAgICB8fCAhdWludCh2YWx1ZS5zZWVkKSB8fCB2YWx1ZS5zZWVkID4gMHhmZmZmZmZmZlxuICAgIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudHJpZXMpIHx8IHZhbHVlLmVudHJpZXMubGVuZ3RoID4gTUFYX0pPVVJOQUxfRU5UUklFUykge1xuICAgIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBjb21tYW5kIGpvdXJuYWwnKTtcbiAgfVxuICBjb25zdCBqb3VybmFsOiBDb21tYW5kSm91cm5hbCA9IHtcbiAgICBzY2hlbWE6IHZhbHVlLnNjaGVtYSwgc2VlZDogdmFsdWUuc2VlZCxcbiAgICBzdGFydGVySW52ZW50b3J5OiBpbnZlbnRvcnkodmFsdWUuc3RhcnRlckludmVudG9yeSksIGVudHJpZXM6IFtdLFxuICB9O1xuICBjb25zdCBpZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5lbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcmF3ID0gdmFsdWUuZW50cmllc1tpXTtcbiAgICBpZiAoIW9iamVjdChyYXcpIHx8IHJhdy5zZXF1ZW5jZSAhPT0gaSB8fCAhdWludChyYXcucmV2aXNpb24pXG4gICAgICB8fCB0eXBlb2YgcmF3Lmhhc2ggIT09ICdzdHJpbmcnIHx8ICEvXlswLTlhLWZdezE2fSQvLnRlc3QocmF3Lmhhc2gpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jb250aWd1b3VzIG9yIGludmFsaWQgam91cm5hbCBlbnRyeScpO1xuICAgIGNvbnN0IGVudHJ5OiBKb3VybmFsRW50cnkgPSB7XG4gICAgICBjb21tYW5kOiB2YWxpZGF0ZUNvbW1hbmQocmF3LmNvbW1hbmQpLCBzZXF1ZW5jZTogaSxcbiAgICAgIHJldmlzaW9uOiByYXcucmV2aXNpb24sIGhhc2g6IHJhdy5oYXNoLCBvdXRjb21lOiB2YWxpZGF0ZU91dGNvbWUocmF3Lm91dGNvbWUpLFxuICAgIH07XG4gICAgaWYgKChlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdidWlsZCcgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAnaGFydmVzdCcpXG4gICAgICAmJiBlbnRyeS5jb21tYW5kLnNjaGVtYSAhPT0gdmFsdWUuc2NoZW1hKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2pvdXJuYWwgc2NoZW1hIGFuZCBidWlsZCBjb21tYW5kIHNjaGVtYSBkaWZmZXInKTtcbiAgICB9XG4gICAgaWYgKEpTT04uc3RyaW5naWZ5KGVudHJ5KSAhPT0gSlNPTi5zdHJpbmdpZnkocmF3KSkgdGhyb3cgbmV3IEVycm9yKCdub24tY2Fub25pY2FsIGpvdXJuYWwgZW50cnknKTtcbiAgICBpZiAoaWRzLmhhcyhlbnRyeS5jb21tYW5kLmlkKSkgdGhyb3cgbmV3IEVycm9yKCdkdXBsaWNhdGUgam91cm5hbCBjb21tYW5kIGlkJyk7XG4gICAgaWYgKGVudHJ5LmNvbW1hbmQudHlwZSAhPT0gZW50cnkub3V0Y29tZS50eXBlXG4gICAgICB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0JyAmJiBlbnRyeS5vdXRjb21lLnR5cGUgPT09ICdoYXJ2ZXN0J1xuICAgICAgJiYgZW50cnkuY29tbWFuZC5lbnRpdHlJZCAhPT0gZW50cnkub3V0Y29tZS5lbnRpdHlJZFxuICAgICAgfHwgKGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ3BsYW50JyB8fCBlbnRyeS5jb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0X2Nyb3AnKVxuICAgICAgJiYgZW50cnkuY29tbWFuZC50eXBlID09PSBlbnRyeS5vdXRjb21lLnR5cGUgJiYgZW50cnkuY29tbWFuZC5wbG90SWQgIT09IGVudHJ5Lm91dGNvbWUucGxvdElkXG4gICAgICB8fCAoZW50cnkuY29tbWFuZC50eXBlID09PSAnZGVwb3NpdCcgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAnd2l0aGRyYXcnKVxuICAgICAgJiYgZW50cnkuY29tbWFuZC50eXBlID09PSBlbnRyeS5vdXRjb21lLnR5cGVcbiAgICAgICYmIChlbnRyeS5jb21tYW5kLnN0b2NrcGlsZUlkICE9PSBlbnRyeS5vdXRjb21lLnN0b2NrcGlsZUlkXG4gICAgICAgIHx8IEpTT04uc3RyaW5naWZ5KGVudHJ5LmNvbW1hbmQucmVzb3VyY2VzKSAhPT0gSlNPTi5zdHJpbmdpZnkoZW50cnkub3V0Y29tZS5yZXNvdXJjZXMpKVxuICAgICAgfHwgZW50cnkuY29tbWFuZC50eXBlID09PSAncHJvZHVjZScgJiYgZW50cnkub3V0Y29tZS50eXBlID09PSAncHJvZHVjZSdcbiAgICAgICYmIChlbnRyeS5jb21tYW5kLnN0b2NrcGlsZUlkICE9PSBlbnRyeS5vdXRjb21lLnN0b2NrcGlsZUlkIHx8IGVudHJ5LmNvbW1hbmQucmVjaXBlICE9PSBlbnRyeS5vdXRjb21lLnJlY2lwZSlcbiAgICAgIHx8IGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ3RpY2snICYmIGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ3RpY2snXG4gICAgICAmJiBlbnRyeS5vdXRjb21lLnRvVGljayAtIGVudHJ5Lm91dGNvbWUuZnJvbVRpY2sgIT09IGVudHJ5LmNvbW1hbmQudGlja3MpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignam91cm5hbCBjb21tYW5kIGFuZCBvdXRjb21lIGRpc2FncmVlJyk7XG4gICAgfVxuICAgIGlkcy5hZGQoZW50cnkuY29tbWFuZC5pZCk7XG4gICAgam91cm5hbC5lbnRyaWVzLnB1c2goZW50cnkpO1xuICB9XG4gIGlmIChKU09OLnN0cmluZ2lmeShqb3VybmFsKSAhPT0gSlNPTi5zdHJpbmdpZnkodmFsdWUpKSB0aHJvdyBuZXcgRXJyb3IoJ25vbi1jYW5vbmljYWwgY29tbWFuZCBqb3VybmFsJyk7XG4gIC8vIFRoaXMgc2xpY2UgaGFzIG9uZSBkZXRlcm1pbmlzdGljIGdlbmVzaXMgY29uZmlndXJhdGlvbi4gQSBjaGFuZ2VkIHN0YXJ0ZXJcbiAgLy8gZ3JhbnQgbXVzdCBub3QgcGFzcyB1bm5vdGljZWQgd2hlbiByZXBsYXkgYmVnaW5zIGZyb20gYSBsYXRlciBzbmFwc2hvdC5cbiAgaWYgKEpTT04uc3RyaW5naWZ5KGpvdXJuYWwuc3RhcnRlckludmVudG9yeSkgIT09IEpTT04uc3RyaW5naWZ5KGNyZWF0ZUpvdXJuYWwodmFsdWUuc2VlZCwgdmFsdWUuc2NoZW1hKS5zdGFydGVySW52ZW50b3J5KSkge1xuICAgIHRocm93IG5ldyBFcnJvcignam91cm5hbCBzdGFydGVyIGludmVudG9yeSBpcyBpbmNvbXBhdGlibGUgd2l0aCB0aGlzIHZlcnNpb24nKTtcbiAgfVxuICByZXR1cm4gam91cm5hbDtcbn1cblxuZnVuY3Rpb24gcmVmZXJlbmNlc1JldGlyZWRTdG9uZShlbnRyeTogSm91cm5hbEVudHJ5KTogYm9vbGVhbiB7XG4gIHJldHVybiAvXmhlcm86c3R5bF9yb2NrXyg/OnNtYWxsfG1lZGl1bXxsYXJnZSk6Ly50ZXN0KFxuICAgIGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnID8gZW50cnkuY29tbWFuZC5lbnRpdHlJZCA6IGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ2hhcnZlc3QnID8gZW50cnkub3V0Y29tZS5lbnRpdHlJZCA6ICcnLFxuICApO1xufVxuXG5leHBvcnQgY2xhc3MgR2FtZVNlc3Npb24ge1xuICByZWFkb25seSBqb3VybmFsOiBDb21tYW5kSm91cm5hbDtcbiAgcHJpdmF0ZSByZWFkb25seSBwcmVwQXV0aG9yaXplcjogTG9jYWxBdXRob3JpemVyO1xuICBwcml2YXRlIHJlYWRvbmx5IHN0cnVjdHVyZUF1dGhvcml6ZXI6IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcjtcbiAgcHJpdmF0ZSByZWFkb25seSBpZHMgPSBuZXcgTWFwPHN0cmluZywgSm91cm5hbEVudHJ5PigpO1xuXG4gIHByaXZhdGUgY29uc3RydWN0b3IocmVhZG9ubHkgd29ybGQ6IFdvcmxkLCBqb3VybmFsOiBDb21tYW5kSm91cm5hbCkge1xuICAgIHRoaXMuam91cm5hbCA9IGpvdXJuYWw7XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBqb3VybmFsLmVudHJpZXMpIHRoaXMuaWRzLnNldChlbnRyeS5jb21tYW5kLmlkLCBlbnRyeSk7XG4gICAgdGhpcy5wcmVwQXV0aG9yaXplciA9IG5ldyBMb2NhbEF1dGhvcml6ZXIoeyBlbnZlbG9wZTogTTAwMl9MQVlPVVQuZW52ZWxvcGUgfSk7XG4gICAgdGhpcy5zdHJ1Y3R1cmVBdXRob3JpemVyID0gbmV3IExvY2FsU3RydWN0dXJlQXV0aG9yaXplcih7IGVudmVsb3BlOiBNMDAyX0xBWU9VVC5lbnZlbG9wZSB9KTtcbiAgfVxuXG4gIHN0YXRpYyBnZW5lc2lzKHNlZWQgPSAxMzM3KTogR2FtZVNlc3Npb24ge1xuICAgIHJldHVybiBuZXcgR2FtZVNlc3Npb24oZ2VuZXNpc1dvcmxkKHNlZWQpLCBjcmVhdGVKb3VybmFsKHNlZWQpKTtcbiAgfVxuXG4gIC8qKiBDb21wYXRpYmlsaXR5IGVudHJ5IHBvaW50IGZvciByZWNvcmRlZCBNMDAyIGZpeHR1cmVzIGFuZCBzYXZlZCB3b3JsZHMuICovXG4gIHN0YXRpYyBsZWdhY3lHZW5lc2lzKHNlZWQgPSAxMzM3LCBzY2hlbWE6IHR5cGVvZiBKT1VSTkFMX1NDSEVNQSB8IHR5cGVvZiBERVNJR05fSk9VUk5BTF9TQ0hFTUEgPSBKT1VSTkFMX1NDSEVNQSk6IEdhbWVTZXNzaW9uIHtcbiAgICByZXR1cm4gbmV3IEdhbWVTZXNzaW9uKGdlbmVzaXNXb3JsZChzZWVkLCBpbnZlbnRvcnkoTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSksIHNjaGVtYSksIGNyZWF0ZUpvdXJuYWwoc2VlZCwgc2NoZW1hKSk7XG4gIH1cblxuICAvKiogUmVwbGF5IGFjY2VwdGVkIGNvbW1hbmRzIGluIHRoZWlyIGF1dGhvcml0YXRpdmUgb3JkZXIgZnJvbSBhbiBlbXB0eSB3b3JsZC5cbiAgICogQSBub3JtYWwgcmVwbGF5IGlzIGF0dGVtcHRlZCBmaXJzdDogc3RvbmUgZnJvbSByZXRhaW5lZCBjYWlybnMgYW5kIGJ1aWxkaW5nXG4gICAqIHByZXBhcmF0aW9uIG11c3Qgbm90IGZvcmNlIGhpc3RvcmljYWwgbW9kZS4gUmF3IG9sZCBqb3VybmFscyBlbnRlciBwcml2YXRlXG4gICAqIHJlY29uc3RydWN0aW9uIG9ubHkgd2hlbiB0aGVpciBvcmlnaW5hbCBzdG9uZSBvYnN0cnVjdGlvbnMgcmVxdWlyZWQgaXQuICovXG4gIHN0YXRpYyByZXBsYXkoaW5wdXQ6IHVua25vd24pOiBHYW1lU2Vzc2lvbiB7XG4gICAgY29uc3Qgam91cm5hbCA9IHZhbGlkYXRlSm91cm5hbChpbnB1dCk7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBHYW1lU2Vzc2lvbi5yZXBsYXlDdXJyZW50KGpvdXJuYWwpO1xuICAgIH0gY2F0Y2ggKGN1cnJlbnRFcnJvcikge1xuICAgICAgaWYgKCFqb3VybmFsLmVudHJpZXMuc29tZShjb250YWluc1JldGlyZWRTdG9uZSkpIHRocm93IGN1cnJlbnRFcnJvcjtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBHYW1lU2Vzc2lvbi5yZWNvbnN0cnVjdEhpc3RvcmljYWwoam91cm5hbCkuc2Vzc2lvbjtcbiAgICAgIH0gY2F0Y2ggKGhpc3RvcmljYWxFcnJvcikge1xuICAgICAgICAvLyBBbiBhbHJlYWR5LW1pZ3JhdGVkIGpvdXJuYWwgaGFzIHJld3JpdHRlbiBoYXNoZXM7IHZlcmlmeSBpdHMgcmV0YWluZWRcbiAgICAgICAgLy8gc3RvbmUgY29tbWFuZHMgbm9ybWFsbHkgaW5zdGVhZCBvZiBhY2NlcHRpbmcgdGhlIGZhaWxlZCBvbGQgcmVwbGF5LlxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBHYW1lU2Vzc2lvbi5yZXBsYXlDdXJyZW50KGpvdXJuYWwpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICB0aHJvdyBoaXN0b3JpY2FsRXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKiogUmVzdG9yZSBhIHZhbGlkYXRlZCBzbmFwc2hvdCwgdGhlbiByZXBsYXkgb25seSBpdHMgYWNjZXB0ZWQtY29tbWFuZCB0YWlsLiAqL1xuICBzdGF0aWMgcmVzdG9yZShzbmFwc2hvdElucHV0OiBXb3JsZFNuYXBzaG90LCBqb3VybmFsSW5wdXQ6IHVua25vd24pOiBHYW1lU2Vzc2lvbiB7XG4gICAgY29uc3Qgam91cm5hbCA9IHZhbGlkYXRlSm91cm5hbChqb3VybmFsSW5wdXQpO1xuICAgIGNvbnN0IHNuYXBzaG90ID0gdmFsaWRhdGVXb3JsZFNuYXBzaG90KHNuYXBzaG90SW5wdXQpO1xuICAgIGlmIChzbmFwc2hvdC5zY2hlbWEgIT09IGpvdXJuYWwuc2NoZW1hKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGFuZCBqb3VybmFsIHNjaGVtYXMgZGlmZmVyJyk7XG4gICAgY29uc3QgbmV4dCA9IHNuYXBzaG90Lm5leHRTZXF1ZW5jZTtcbiAgICBpZiAobmV4dCA+IGpvdXJuYWwuZW50cmllcy5sZW5ndGgpIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaXMgYWhlYWQgb2YgdGhlIGpvdXJuYWwnKTtcbiAgICAvLyBDdXJyZW50IHNhdmVzIChpbmNsdWRpbmcgZXZlcnkgbWlncmF0ZWQgYm91bmRhcnkpIGtlZXAgdGhlaXIgZXhhY3QgaGFzaC5cbiAgICAvLyBUcnkgdGhlbSBiZWZvcmUgcmVjb25zdHJ1Y3RpbmcgYSBjb21wYXRpYmxlIG9sZCBqb3VybmFsLiBEZXBvc2l0LW9ubHlcbiAgICAvLyBtaWdyYXRlZCBzYXZlcyBubyBsb25nZXIgY2FycnkgYW4gZXhwbGljaXQgc3RvbmUgY29tbWFuZCB0byBjbGFzc2lmeSB0aGVtLlxuICAgIGlmICghc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgdHJ5IHsgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTsgfSBjYXRjaCB7IC8qIGF1dGhlbnRpY2F0ZWQgbWlncmF0aW9uIGJlbG93ICovIH1cbiAgICB9XG4gICAgaWYgKG5leHQgPiAwIHx8IHNuYXBzaG90LmVudGl0aWVzLnNvbWUoKGVudGl0eSkgPT4gaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSkpIHtcbiAgICAgIC8vIEEgYm91bmRhcnkgYXV0aGVudGljYXRlZCBkdXJpbmcgbWlncmF0aW9uIGlzIGNvbXBhcmVkIHdpdGggdGhlIG1pZ3JhdGVkXG4gICAgICAvLyBzdGF0ZTsgYSByYXcgb2xkIGJvdW5kYXJ5IGlzIGNvbXBhcmVkIHdpdGggdGhlIG9yaWdpbmFsIGhpc3RvcmljYWwgb25lLlxuICAgICAgLy8gQm90aCBwYXRocyBhdXRoZW50aWNhdGUgdGhlIGNvbXBsZXRlIG9yaWdpbmFsIGFjY2VwdGVkIGpvdXJuYWwgZmlyc3QuXG4gICAgICBjb25zdCBoaXN0b3JpY2FsID0gam91cm5hbC5lbnRyaWVzLnNvbWUocmVmZXJlbmNlc1JldGlyZWRTdG9uZSlcbiAgICAgICAgfHwgc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKTtcbiAgICAgIC8vIEEgbWlncmF0ZWQgc2F2ZSBubyBsb25nZXIgY29udGFpbnMgcmV0aXJlZCBlbnRpdGllcy4gSXRzIHJld3JpdHRlblxuICAgICAgLy8gYm91bmRhcnkgaGFzaGVzIGRlc2NyaWJlIHRoZSBmaWx0ZXJlZCBzdGF0ZSwgc28gb3JkaW5hcnkgcmVzdG9yYXRpb25cbiAgICAgIC8vIG11c3Qgc3VjY2VlZCBiZWZvcmUgdHJ5aW5nIHRvIGludGVycHJldCBpdCBhcyByYXcgb2xkLXNhdmUgYnl0ZXMuXG4gICAgICAvLyBBIHJlZmVyZW5jZWQgYXV0aG9yZWQgc3RvbmUgYWxvbmUgZG9lcyAqbm90KiBpbXBseSBhIHJhdyBvbGQgYm91bmRhcnk6XG4gICAgICAvLyBsZWdpdGltYXRlIHNhdmVzIGNhbiBjb250YWluIHVudG91Y2hlZCBuYXR1cmFsIHJldGlyZWQgZGVwb3NpdHMgb25seS5cbiAgICAgIGlmICghc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKSkge1xuICAgICAgICB0cnkgeyByZXR1cm4gR2FtZVNlc3Npb24ucmVzdG9yZUN1cnJlbnQoc25hcHNob3QsIGpvdXJuYWwsIG5leHQpOyB9IGNhdGNoIHsgLyogdHJ5IG9yaWdpbmFsIHJlY29uc3RydWN0aW9uICovIH1cbiAgICAgIH1cbiAgICAgIGlmIChoaXN0b3JpY2FsKSB7XG4gICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWQgPSBHYW1lU2Vzc2lvbi5yZWNvbnN0cnVjdEhpc3RvcmljYWwoam91cm5hbCk7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkID0gcmVjb25zdHJ1Y3RlZC5zbmFwc2hvdHMuZ2V0KG5leHQpO1xuICAgICAgICBjb25zdCBtaWdyYXRlZCA9IGV4cGVjdGVkID8gbWlncmF0ZVN0b25lU25hcHNob3QoZXhwZWN0ZWQpIDogdW5kZWZpbmVkO1xuICAgICAgICBpZiAobWlncmF0ZWQgJiYgbGVnYWN5U3RvbmVIYXNoKHNuYXBzaG90KSA9PT0gbGVnYWN5U3RvbmVIYXNoKG1pZ3JhdGVkKSlcbiAgICAgICAgICByZXR1cm4gcmVjb25zdHJ1Y3RlZC5zZXNzaW9uO1xuICAgICAgICBpZiAoc25hcHNob3QuZW50aXRpZXMuc29tZSgoZW50aXR5KSA9PiBpc1JldGlyZWRTdG9uZUtpbmQoZW50aXR5LmtpbmQpKVxuICAgICAgICAgICYmIGV4cGVjdGVkICYmIGxlZ2FjeVN0b25lSGFzaChzbmFwc2hvdCkgPT09IGxlZ2FjeVN0b25lSGFzaChleHBlY3RlZCkpXG4gICAgICAgICAgcmV0dXJuIHJlY29uc3RydWN0ZWQuc2Vzc2lvbjtcbiAgICAgICAgaWYgKHNuYXBzaG90LmVudGl0aWVzLnNvbWUoKGVudGl0eSkgPT4gaXNSZXRpcmVkU3RvbmVLaW5kKGVudGl0eS5raW5kKSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2hpc3RvcmljYWwgc25hcHNob3QgZG9lcyBub3QgbWF0Y2ggaXRzIG9yaWdpbmFsIGpvdXJuYWwgYm91bmRhcnknKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAobmV4dCA+IDApIHJldHVybiBHYW1lU2Vzc2lvbi5yZXN0b3JlQ3VycmVudChzbmFwc2hvdCwgam91cm5hbCwgbmV4dCk7XG4gICAgY29uc3QgaGlzdG9yaWNhbCA9IGpvdXJuYWwuZW50cmllcy5zb21lKGNvbnRhaW5zUmV0aXJlZFN0b25lKTtcbiAgICBpZiAoaGlzdG9yaWNhbCkge1xuICAgICAgdHJ5IHsgcmV0dXJuIEdhbWVTZXNzaW9uLnJlc3RvcmVDdXJyZW50KHNuYXBzaG90LCBqb3VybmFsLCBuZXh0KTsgfSBjYXRjaCB7IC8qIHJhdyBvciBtaWdyYXRlZCBnZW5lc2lzICovIH1cbiAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWQgPSBHYW1lU2Vzc2lvbi5yZWNvbnN0cnVjdEhpc3RvcmljYWwoam91cm5hbCk7XG4gICAgICBjb25zdCByYXdHZW5lc2lzID0gcmVjb25zdHJ1Y3RlZC5zbmFwc2hvdHMuZ2V0KDApITtcbiAgICAgIGlmIChsZWdhY3lTdG9uZUhhc2goc25hcHNob3QpID09PSBsZWdhY3lTdG9uZUhhc2gocmF3R2VuZXNpcykpIHJldHVybiByZWNvbnN0cnVjdGVkLnNlc3Npb247XG4gICAgfVxuICAgIHJldHVybiBHYW1lU2Vzc2lvbi5yZXN0b3JlQ3VycmVudChzbmFwc2hvdCwgam91cm5hbCwgbmV4dCk7XG4gIH1cblxuICAvKiogUmVwbGF5IGFscmVhZHktYXV0aGVudGljYXRlZCBjdXJyZW50LXN0YXRlIGNvbW1hbmRzLiAqL1xuICBwcml2YXRlIHN0YXRpYyByZXBsYXlDdXJyZW50KGpvdXJuYWw6IENvbW1hbmRKb3VybmFsKTogR2FtZVNlc3Npb24ge1xuICAgIGNvbnN0IHNlc3Npb24gPSBuZXcgR2FtZVNlc3Npb24oXG4gICAgICBnZW5lc2lzV29ybGQoam91cm5hbC5zZWVkLCBqb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnksIGpvdXJuYWwuc2NoZW1hKSxcbiAgICAgIGNyZWF0ZUpvdXJuYWwoam91cm5hbC5zZWVkLCBqb3VybmFsLnNjaGVtYSksXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGpvdXJuYWwuZW50cmllcykgc2Vzc2lvbi5yZXBsYXlFbnRyeShlbnRyeSk7XG4gICAgcmV0dXJuIHNlc3Npb247XG4gIH1cblxuICBwcml2YXRlIHN0YXRpYyByZXN0b3JlQ3VycmVudChzbmFwc2hvdDogV29ybGRTbmFwc2hvdCwgam91cm5hbDogQ29tbWFuZEpvdXJuYWwsIG5leHQ6IG51bWJlcik6IEdhbWVTZXNzaW9uIHtcbiAgICBjb25zdCB3b3JsZCA9IHdvcmxkRnJvbVNuYXBzaG90KHNuYXBzaG90KTtcbiAgICBpZiAod29ybGQuc2VlZCAhPT0gam91cm5hbC5zZWVkKSB0aHJvdyBuZXcgRXJyb3IoJ3NuYXBzaG90IGFuZCBqb3VybmFsIHNlZWRzIGRpZmZlcicpO1xuICAgIGNvbnN0IGdlbmVzaXMgPSBnZW5lc2lzV29ybGQoam91cm5hbC5zZWVkLCBqb3VybmFsLnN0YXJ0ZXJJbnZlbnRvcnksIGpvdXJuYWwuc2NoZW1hKTtcbiAgICBpZiAobmV4dCA9PT0gMCAmJiBsZWdhY3lTdG9uZUhhc2goc25hcHNob3QpICE9PSBjYW5vbmljYWxXb3JsZEhhc2goZ2VuZXNpcywgMCwgam91cm5hbC5zY2hlbWEpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dlbmVzaXMgc25hcHNob3QgZG9lcyBub3QgbWF0Y2ggam91cm5hbCBjb25maWd1cmF0aW9uJyk7XG4gICAgfVxuICAgIGlmIChuZXh0ID4gMCAmJiBsZWdhY3lTdG9uZUhhc2goc25hcHNob3QpICE9PSBqb3VybmFsLmVudHJpZXNbbmV4dCAtIDFdLmhhc2gpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc25hcHNob3QgaGFzaCBkb2VzIG5vdCBtYXRjaCBpdHMgam91cm5hbCBib3VuZGFyeScpO1xuICAgIH1cbiAgICBjb25zdCBzZXNzaW9uID0gR2FtZVNlc3Npb24uZnJvbVZhbGlkYXRlZEJvdW5kYXJ5KHdvcmxkLCB7XG4gICAgICBzY2hlbWE6IGpvdXJuYWwuc2NoZW1hLCBzZWVkOiBqb3VybmFsLnNlZWQsXG4gICAgICBzdGFydGVySW52ZW50b3J5OiB7IC4uLmpvdXJuYWwuc3RhcnRlckludmVudG9yeSB9LCBlbnRyaWVzOiBqb3VybmFsLmVudHJpZXMuc2xpY2UoMCwgbmV4dCksXG4gICAgfSk7XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBqb3VybmFsLmVudHJpZXMuc2xpY2UobmV4dCkpIHNlc3Npb24ucmVwbGF5RW50cnkoZW50cnkpO1xuICAgIHJldHVybiBzZXNzaW9uO1xuICB9XG5cbiAgLyoqIEBpbnRlcm5hbCBBc3NlbWJsZSBhbiBhdXRoZW50aWNhdGVkIHNhdmUgYm91bmRhcnk7IGdhbWVwbGF5IHVzZXMgZGlzcGF0Y2guICovXG4gIHByaXZhdGUgc3RhdGljIGZyb21WYWxpZGF0ZWRCb3VuZGFyeSh3b3JsZDogV29ybGQsIGpvdXJuYWw6IENvbW1hbmRKb3VybmFsKTogR2FtZVNlc3Npb24ge1xuICAgIHJldHVybiBuZXcgR2FtZVNlc3Npb24od29ybGQsIGpvdXJuYWwpO1xuICB9XG5cbiAgLyoqIEBpbnRlcm5hbCBTb3VyY2UgZm9yIGRldGVybWluaXN0aWMgb2xkLXNhdmUgZml4dHVyZXM7IG5vdCBhIGxpdmUgc2Vzc2lvbi4gKi9cbiAgc3RhdGljIGhpc3RvcmljYWxKb3VybmFsKHdvcmxkOiBXb3JsZCk6IEdhbWVTZXNzaW9uIHtcbiAgICByZXR1cm4gbmV3IEdhbWVTZXNzaW9uKHdvcmxkLCBjcmVhdGVKb3VybmFsKHdvcmxkLnNlZWQsIHdvcmxkLmxpZmUgPyBDVVJSRU5UX0pPVVJOQUxfU0NIRU1BXG4gICAgICA6IHdvcmxkLnN0cnVjdHVyZXMuc2l6ZSA+IDAgPyBERVNJR05fSk9VUk5BTF9TQ0hFTUEgOiBKT1VSTkFMX1NDSEVNQSkpO1xuICB9XG5cbiAgLyoqIEBpbnRlcm5hbCBTb3VyY2UgZm9yIGRldGVybWluaXN0aWMgb2xkLXNhdmUgZml4dHVyZXM7IG5vdCBhIGxpdmUgc2Vzc2lvbi4gKi9cbiAgc3RhdGljIGhpc3RvcmljYWxHZW5lc2lzV29ybGQoc2VlZCA9IDEzMzcsIHNjaGVtYTogQ29tbWFuZEpvdXJuYWxbJ3NjaGVtYSddID0gSk9VUk5BTF9TQ0hFTUEpOiBXb3JsZCB7XG4gICAgcmV0dXJuIGhpc3RvcmljYWxHZW5lc2lzV29ybGQoc2VlZCwgaW52ZW50b3J5KE0wMDJfU1RBUlRFUl9JTlZFTlRPUlkpLCBzY2hlbWEpO1xuICB9XG5cbiAgcHJpdmF0ZSBzdGF0aWMgcmVjb25zdHJ1Y3RIaXN0b3JpY2FsKGpvdXJuYWw6IENvbW1hbmRKb3VybmFsKToge1xuICAgIHNlc3Npb246IEdhbWVTZXNzaW9uOyBzbmFwc2hvdHM6IE1hcDxudW1iZXIsIFdvcmxkU25hcHNob3Q+O1xuICB9IHtcbiAgICBjb25zdCBleHBlY3RlZEdlbmVzaXMgPSBoaXN0b3JpY2FsR2VuZXNpc1dvcmxkKGpvdXJuYWwuc2VlZCwgam91cm5hbC5zdGFydGVySW52ZW50b3J5LCBqb3VybmFsLnNjaGVtYSk7XG4gICAgY29uc3Qgc25hcHNob3RzID0gbmV3IE1hcDxudW1iZXIsIFdvcmxkU25hcHNob3Q+KCk7XG4gICAgc25hcHNob3RzLnNldCgwLCBjcmVhdGVXb3JsZFNuYXBzaG90KGV4cGVjdGVkR2VuZXNpcywgMCwgam91cm5hbC5zY2hlbWEpKTtcbiAgICBjb25zdCByZXBsYXkgPSBuZXcgR2FtZVNlc3Npb24oZXhwZWN0ZWRHZW5lc2lzLCBjcmVhdGVKb3VybmFsKGpvdXJuYWwuc2VlZCwgam91cm5hbC5zY2hlbWEpKTtcbiAgICBjb25zdCBtaWdyYXRlZEpvdXJuYWwgPSBjcmVhdGVKb3VybmFsKGpvdXJuYWwuc2VlZCwgam91cm5hbC5zY2hlbWEpO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2Ygam91cm5hbC5lbnRyaWVzKSB7XG4gICAgICByZXBsYXkucmVwbGF5RW50cnkoZW50cnkpO1xuICAgICAgY29uc3Qgc25hcHNob3QgPSBjcmVhdGVXb3JsZFNuYXBzaG90KHJlcGxheS53b3JsZCwgcmVwbGF5Lm5leHRTZXF1ZW5jZSwgam91cm5hbC5zY2hlbWEpO1xuICAgICAgc25hcHNob3RzLnNldChyZXBsYXkubmV4dFNlcXVlbmNlLCBzbmFwc2hvdCk7XG4gICAgICAvLyBLZWVwIHRoZSByZXdyaXR0ZW4gYXV0aGVudGljYXRlZCBib3VuZGFyeSBpbiB0aGUgcmV0dXJuZWQgam91cm5hbC4gQVxuICAgICAgLy8gcmVwbGF5LW9ubHkgam91cm5hbCByZWJ1aWxkIHdvdWxkIHNpbGVudGx5IHB1dCB0aGUgcmF3IGhhc2ggYmFjay5cbiAgICAgIGVudHJ5Lmhhc2ggPSBsZWdhY3lTdG9uZUhhc2gobWlncmF0ZVN0b25lU25hcHNob3Qoc25hcHNob3QpKTtcbiAgICAgIG1pZ3JhdGVkSm91cm5hbC5lbnRyaWVzLnB1c2goZW50cnkpO1xuICAgIH1cbiAgICBjb25zdCBzZXNzaW9uID0gR2FtZVNlc3Npb24uZnJvbVZhbGlkYXRlZEJvdW5kYXJ5KHJlcGxheS53b3JsZCwgbWlncmF0ZWRKb3VybmFsKTtcbiAgICByZXR1cm4geyBzZXNzaW9uOiBzZXNzaW9uLm1pZ3JhdGVSZXRpcmVkU3RvbmVzKCksIHNuYXBzaG90cyB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzbmFwc2hvdFNjaGVtYSgpOiBXb3JsZFNuYXBzaG90WydzY2hlbWEnXSB7IHJldHVybiB0aGlzLmpvdXJuYWwuc2NoZW1hOyB9XG5cbiAgZ2V0IG5leHRTZXF1ZW5jZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5qb3VybmFsLmVudHJpZXMubGVuZ3RoOyB9XG4gIGdldCBzbmFwc2hvdCgpOiBXb3JsZFNuYXBzaG90IHtcbiAgICByZXR1cm4gY3JlYXRlV29ybGRTbmFwc2hvdCh0aGlzLndvcmxkLCB0aGlzLm5leHRTZXF1ZW5jZSwgdGhpcy5zbmFwc2hvdFNjaGVtYSgpKTtcbiAgfVxuICBnZXQgc3RhdGVIYXNoKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGNhbm9uaWNhbFdvcmxkSGFzaCh0aGlzLndvcmxkLCB0aGlzLm5leHRTZXF1ZW5jZSwgdGhpcy5zbmFwc2hvdFNjaGVtYSgpKTtcbiAgfVxuXG4gIGNvbW1hbmRJZChraW5kOiBDb21tYW5kWyd0eXBlJ10sIHRhcmdldDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAvLyBFbnRpdHkgSURzIGNvbnRhaW4gY2h1bmsgY29vcmRpbmF0ZXM7IGVuY29kZSBjb21tYXMgYW5kIG90aGVyIHNlcGFyYXRvcnNcbiAgICAvLyBzbyBnZW5lcmF0ZWQgY29tbWFuZHMgc2F0aXNmeSB0aGUgc2FtZSBlbnZlbG9wZSB2YWxpZGF0aW9uIGFzIGlucHV0LlxuICAgIHJldHVybiBgJHtraW5kfToke3RoaXMubmV4dFNlcXVlbmNlfToke2VuY29kZVVSSUNvbXBvbmVudCh0YXJnZXQpfWA7XG4gIH1cblxuICBlbnRyeShzZXF1ZW5jZTogbnVtYmVyKTogSm91cm5hbEVudHJ5IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuam91cm5hbC5lbnRyaWVzW3NlcXVlbmNlXTsgfVxuXG4gIGRpc3BhdGNoKGlucHV0OiB1bmtub3duKTogQ29tbWFuZFJlY2VpcHQgfCBDb21tYW5kUmVqZWN0aW9uIHtcbiAgICBsZXQgY29tbWFuZDogQ29tbWFuZDtcbiAgICB0cnkgeyBjb21tYW5kID0gdmFsaWRhdGVDb21tYW5kKGlucHV0KTsgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlamVjdChvYmplY3QoaW5wdXQpICYmIHR5cGVvZiBpbnB1dC5pZCA9PT0gJ3N0cmluZycgPyBpbnB1dC5pZCA6ICcnLFxuICAgICAgICAnaW52YWxpZF9jb21tYW5kJywgWyhlcnJvciBhcyBFcnJvcikubWVzc2FnZV0pO1xuICAgIH1cbiAgICBpZiAoKGNvbW1hbmQudHlwZSA9PT0gJ2J1aWxkJyB8fCBjb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0JylcbiAgICAgICYmIGNvbW1hbmQuc2NoZW1hICE9PSB0aGlzLmpvdXJuYWwuc2NoZW1hXG4gICAgICB8fCBjb21tYW5kLnR5cGUgIT09ICdidWlsZCcgJiYgY29tbWFuZC50eXBlICE9PSAnaGFydmVzdCdcbiAgICAgICAgJiYgdGhpcy5qb3VybmFsLnNjaGVtYSAhPT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkge1xuICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsICdzY2hlbWFfbWlzbWF0Y2gnLCBbJ2NvbW1hbmQgc2NoZW1hIGRvZXMgbm90IG1hdGNoIHRoaXMgd29ybGQgam91cm5hbCddKTtcbiAgICB9XG4gICAgY29uc3QgcHJpb3IgPSB0aGlzLmlkcy5nZXQoY29tbWFuZC5pZCk7XG4gICAgaWYgKHByaW9yKSB7XG4gICAgICBpZiAoIXNhbWVGaWVsZHMocHJpb3IuY29tbWFuZCwgY29tbWFuZCkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsICdkdXBsaWNhdGVfY29tbWFuZF9pZCcsIFsnY29tbWFuZCBpZCBhbHJlYWR5IGhhcyBkaWZmZXJlbnQgYWNjZXB0ZWQgaW5wdXQnXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5yZWNlaXB0KHByaW9yLCB0cnVlKTtcbiAgICB9XG4gICAgaWYgKGNvbW1hbmQuZXhwZWN0ZWRSZXZpc2lvbiAhPT0gdGhpcy53b3JsZC5yZXZpc2lvbikge1xuICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsICdzdGFsZV9yZXZpc2lvbicsIFtcbiAgICAgICAgYGNvbW1hbmQgZXhwZWN0cyByZXZpc2lvbiAke2NvbW1hbmQuZXhwZWN0ZWRSZXZpc2lvbn07IHdvcmxkIGlzIGF0ICR7dGhpcy53b3JsZC5yZXZpc2lvbn1gLFxuICAgICAgXSk7XG4gICAgfVxuICAgIGNvbnN0IGJlZm9yZSA9IHRoaXMuc3RhdGVIYXNoO1xuICAgIGxldCBvdXRjb21lOiBDb21tYW5kT3V0Y29tZTtcbiAgICBpZiAoY29tbWFuZC50eXBlID09PSAnYnVpbGQnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBidWlsZFByb2plY3QodGhpcy53b3JsZCwgdGhpcy5wcmVwQXV0aG9yaXplciwgdGhpcy5zdHJ1Y3R1cmVBdXRob3JpemVyLFxuICAgICAgICBwcm9qZWN0QnlJZChjb21tYW5kLnByb2plY3RJZCksXG4gICAgICAgICdkZXNpZ25WZXJzaW9uJyBpbiBjb21tYW5kID8gY29tbWFuZC5kZXNpZ25WZXJzaW9uIDogdW5kZWZpbmVkKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlSGFzaCAhPT0gYmVmb3JlKSB0aHJvdyBuZXcgRXJyb3IoJ3JlamVjdGVkIGJ1aWxkIGNoYW5nZWQgYXV0aG9yaXRhdGl2ZSBzdGF0ZScpO1xuICAgICAgICByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgcmVzdWx0LmNvZGUsIHJlc3VsdC5yZWFzb25zKTtcbiAgICAgIH1cbiAgICAgIG91dGNvbWUgPSB7XG4gICAgICAgIHR5cGU6ICdidWlsZCcsIHN0cnVjdHVyZUlkOiByZXN1bHQucmVjb3JkLmlkLFxuICAgICAgICBjb3N0UGFpZDogaW52ZW50b3J5KHJlc3VsdC5zdHJ1Y3R1cmUuY29zdFBhaWQpLFxuICAgICAgICByZXNvdXJjZXNHYWluZWQ6IGludmVudG9yeShyZXN1bHQucHJlcGFyYXRpb24ucmVzb3VyY2VzR2FpbmVkKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09ICdoYXJ2ZXN0Jykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gaGFydmVzdEVudGl0eSh0aGlzLndvcmxkLCBjb21tYW5kLmVudGl0eUlkKTtcbiAgICAgIGlmICghcmVzdWx0KSByZXR1cm4gdGhpcy5yZWplY3QoY29tbWFuZC5pZCwgJ25vdF9oYXJ2ZXN0YWJsZScsIFsnZW50aXR5IGlzIGFic2VudCwgZGVwbGV0ZWQgb3IgaGFzIG5vIHJlc291cmNlJ10pO1xuICAgICAgb3V0Y29tZSA9IHtcbiAgICAgICAgdHlwZTogJ2hhcnZlc3QnLCBlbnRpdHlJZDogcmVzdWx0LmVudGl0eS5pZCxcbiAgICAgICAgcmVzb3VyY2U6IHJlc3VsdC5yZXNvdXJjZSwgYW1vdW50OiByZXN1bHQuYW1vdW50LFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ2RlcG9zaXQnIHx8IGNvbW1hbmQudHlwZSA9PT0gJ3dpdGhkcmF3Jykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gdHJhbnNmZXIodGhpcy53b3JsZCwgY29tbWFuZC50eXBlLCBjb21tYW5kLnJlc291cmNlcyk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZUhhc2ggIT09IGJlZm9yZSkgdGhyb3cgbmV3IEVycm9yKCdyZWplY3RlZCB0cmFuc2ZlciBjaGFuZ2VkIGF1dGhvcml0YXRpdmUgc3RhdGUnKTtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICB9XG4gICAgICBvdXRjb21lID0geyB0eXBlOiBjb21tYW5kLnR5cGUsIHN0b2NrcGlsZUlkOiBGT1VOREVSX1NUT0NLUElMRV9JRCwgcmVzb3VyY2VzOiByZXN1bHQudmFsdWUgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ3Byb2R1Y2UnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBzdGFydFByb2R1Y3Rpb24odGhpcy53b3JsZCwgY29tbWFuZC5yZWNpcGUsIGNvbW1hbmQuaWQpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgb3V0Y29tZSA9IHsgdHlwZTogJ3Byb2R1Y2UnLCBqb2JJZDogcmVzdWx0LnZhbHVlLmlkLCBzdG9ja3BpbGVJZDogcmVzdWx0LnZhbHVlLnN0b2NrcGlsZUlkLFxuICAgICAgICByZWNpcGU6IHJlc3VsdC52YWx1ZS5yZWNpcGUsIHJlbWFpbmluZ1RpY2tzOiByZXN1bHQudmFsdWUucmVtYWluaW5nVGlja3MgfTtcbiAgICB9IGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gJ3RpY2snKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhZHZhbmNlVGlja3ModGhpcy53b3JsZCwgY29tbWFuZC50aWNrcyk7XG4gICAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHRoaXMucmVqZWN0KGNvbW1hbmQuaWQsIHJlc3VsdC5jb2RlLCByZXN1bHQucmVhc29ucyk7XG4gICAgICBvdXRjb21lID0geyB0eXBlOiAndGljaycsIC4uLnJlc3VsdC52YWx1ZSB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAncGxhbnQnKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBwbGFudENyb3AodGhpcy53b3JsZCwgY29tbWFuZC5wbG90SWQpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgb3V0Y29tZSA9IHsgdHlwZTogJ3BsYW50JywgcGxvdElkOiBjb21tYW5kLnBsb3RJZCxcbiAgICAgICAgcGxhbnRlZFRpY2s6IHJlc3VsdC52YWx1ZS5wbGFudGVkVGljaywgZ3Jvd3RoVGlja3M6IHJlc3VsdC52YWx1ZS5ncm93dGhUaWNrcyB9O1xuICAgIH0gZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSAnaGFydmVzdF9jcm9wJykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gaGFydmVzdENyb3AodGhpcy53b3JsZCwgY29tbWFuZC5wbG90SWQpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHJldHVybiB0aGlzLnJlamVjdChjb21tYW5kLmlkLCByZXN1bHQuY29kZSwgcmVzdWx0LnJlYXNvbnMpO1xuICAgICAgb3V0Y29tZSA9IHsgdHlwZTogJ2hhcnZlc3RfY3JvcCcsIHBsb3RJZDogY29tbWFuZC5wbG90SWQsIHJlc291cmNlczogcmVzdWx0LnZhbHVlIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigndW5oYW5kbGVkIGNvbW1hbmQgdHlwZScpO1xuICAgIH1cbiAgICBjb25zdCBlbnRyeTogSm91cm5hbEVudHJ5ID0ge1xuICAgICAgY29tbWFuZCwgc2VxdWVuY2U6IHRoaXMubmV4dFNlcXVlbmNlLCByZXZpc2lvbjogdGhpcy53b3JsZC5yZXZpc2lvbixcbiAgICAgIC8vIFRoZSBzZXF1ZW5jZSBpcyBwYXJ0IG9mIHRoZSBzdGF0ZSBoYXNoIGF0IHRoaXMgYWNjZXB0ZWQgYm91bmRhcnkuXG4gICAgICBoYXNoOiBjYW5vbmljYWxXb3JsZEhhc2godGhpcy53b3JsZCwgdGhpcy5uZXh0U2VxdWVuY2UgKyAxLCB0aGlzLnNuYXBzaG90U2NoZW1hKCkpLCBvdXRjb21lLFxuICAgIH07XG4gICAgdGhpcy5qb3VybmFsLmVudHJpZXMucHVzaChlbnRyeSk7XG4gICAgdGhpcy5pZHMuc2V0KGNvbW1hbmQuaWQsIGVudHJ5KTtcbiAgICByZXR1cm4gdGhpcy5yZWNlaXB0KGVudHJ5LCBmYWxzZSk7XG4gIH1cblxuICBwcml2YXRlIHJlcGxheUVudHJ5KGVudHJ5OiBKb3VybmFsRW50cnkpOiB2b2lkIHtcbiAgICBpZiAoZW50cnkuc2VxdWVuY2UgIT09IHRoaXMubmV4dFNlcXVlbmNlKSB0aHJvdyBuZXcgRXJyb3IoJ2pvdXJuYWwgc2VxdWVuY2UgZ2FwJyk7XG4gICAgY29uc3QgcmVjZWlwdCA9IHRoaXMuZGlzcGF0Y2goZW50cnkuY29tbWFuZCk7XG4gICAgaWYgKCFyZWNlaXB0Lm9rIHx8IHJlY2VpcHQuZHVwbGljYXRlIHx8IHJlY2VpcHQuaGFzaCAhPT0gZW50cnkuaGFzaFxuICAgICAgfHwgcmVjZWlwdC5yZXZpc2lvbiAhPT0gZW50cnkucmV2aXNpb25cbiAgICAgIHx8IEpTT04uc3RyaW5naWZ5KHJlY2VpcHQub3V0Y29tZSkgIT09IEpTT04uc3RyaW5naWZ5KGVudHJ5Lm91dGNvbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYGpvdXJuYWwgcmVwbGF5IGRpdmVyZ2VkIGF0IHNlcXVlbmNlICR7ZW50cnkuc2VxdWVuY2V9YCk7XG4gICAgfVxuICB9XG5cbiAgLyoqIEhpc3RvcmljYWwgZW50cmllcyBoYXZlIHBhc3NlZCB0aGVpciBvcmlnaW5hbCBvdXRjb21lL2hhc2ggY2hlY2tzLiBUaGVpclxuICAgKiBhY2NlcHRlZCBjb21tYW5kcyBhbmQgc3RvbmUgeWllbGRzIHJlbWFpbjsgb25seSBlbnRpdHkgZXhpc3RlbmNlIGFuZCB0aGVcbiAgICogcmVzdWx0aW5nIGNhbm9uaWNhbCBib3VuZGFyeSBoYXNoZXMgY2hhbmdlLiAqL1xuICBwcml2YXRlIG1pZ3JhdGVSZXRpcmVkU3RvbmVzKCk6IEdhbWVTZXNzaW9uIHtcbiAgICByZXRpcmVTdG9uZUVudGl0aWVzKHRoaXMud29ybGQpO1xuICAgIGZpbmlzaFN0b25lUmVwbGF5KHRoaXMud29ybGQpO1xuICAgIGNvbnN0IG1pZ3JhdGVkID0gY3JlYXRlV29ybGRTbmFwc2hvdCh0aGlzLndvcmxkLCB0aGlzLm5leHRTZXF1ZW5jZSwgdGhpcy5zbmFwc2hvdFNjaGVtYSgpKTtcbiAgICByZXN0b3JlV29ybGRTbmFwc2hvdEV4YWN0KHRoaXMud29ybGQsIG1pZ3JhdGVkKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIHByaXZhdGUgcmVjZWlwdChlbnRyeTogSm91cm5hbEVudHJ5LCBkdXBsaWNhdGU6IGJvb2xlYW4pOiBDb21tYW5kUmVjZWlwdCB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiB0cnVlLCBkdXBsaWNhdGUsIGlkOiBlbnRyeS5jb21tYW5kLmlkLCBzZXF1ZW5jZTogZW50cnkuc2VxdWVuY2UsXG4gICAgICByZXZpc2lvbjogZW50cnkucmV2aXNpb24sIGhhc2g6IGVudHJ5Lmhhc2gsIG91dGNvbWU6IGVudHJ5Lm91dGNvbWUsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgcmVqZWN0KGlkOiBzdHJpbmcsIGNvZGU6IHN0cmluZywgcmVhc29uczogc3RyaW5nW10pOiBDb21tYW5kUmVqZWN0aW9uIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGR1cGxpY2F0ZTogZmFsc2UsIGlkLCBjb2RlLCByZWFzb25zIH07XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVzaXNXb3JsZChzZWVkOiBudW1iZXIsIHN0YXJ0ZXIgPSBpbnZlbnRvcnkoTTAwMl9TVEFSVEVSX0lOVkVOVE9SWSksXG4gIHNjaGVtYTogQ29tbWFuZEpvdXJuYWxbJ3NjaGVtYSddID0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSk6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBnZW5lcmF0ZVdvcmxkKHNlZWQsIDApO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7IC4uLnN0YXJ0ZXIgfTtcbiAgaWYgKHNjaGVtYSA9PT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkgd29ybGQubGlmZSA9IGNyZWF0ZUxpZmVTdGF0ZSgpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbmZ1bmN0aW9uIGhpc3RvcmljYWxHZW5lc2lzV29ybGQoc2VlZDogbnVtYmVyLCBzdGFydGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+LFxuICBzY2hlbWE6IENvbW1hbmRKb3VybmFsWydzY2hlbWEnXSk6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkKTtcbiAgZW5hYmxlU3RvbmVSZXBsYXkod29ybGQpO1xuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICB3b3JsZC5pbnZlbnRvcnkgPSB7IC4uLnN0YXJ0ZXIgfTtcbiAgaWYgKHNjaGVtYSA9PT0gQ1VSUkVOVF9KT1VSTkFMX1NDSEVNQSkgd29ybGQubGlmZSA9IGNyZWF0ZUxpZmVTdGF0ZSgpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbmZ1bmN0aW9uIGNvbnRhaW5zUmV0aXJlZFN0b25lKGVudHJ5OiBKb3VybmFsRW50cnkpOiBib29sZWFuIHtcbiAgaWYgKGVudHJ5LmNvbW1hbmQudHlwZSA9PT0gJ2hhcnZlc3QnKSB7XG4gICAgcmV0dXJuIGVudHJ5Lm91dGNvbWUudHlwZSA9PT0gJ2hhcnZlc3QnXG4gICAgICAmJiAoZW50cnkub3V0Y29tZS5yZXNvdXJjZSA9PT0gJ3N0b25lJ1xuICAgICAgICB8fCAvXmhlcm86c3R5bF9yb2NrXyg/OnNtYWxsfG1lZGl1bXxsYXJnZSk6Ly50ZXN0KGVudHJ5LmNvbW1hbmQuZW50aXR5SWQpKTtcbiAgfVxuICByZXR1cm4gZW50cnkub3V0Y29tZS50eXBlID09PSAnYnVpbGQnICYmIChlbnRyeS5vdXRjb21lLnJlc291cmNlc0dhaW5lZC5zdG9uZSA/PyAwKSA+IDA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXJ2ZXN0ZWRFbnRpdHkoc2Vzc2lvbjogR2FtZVNlc3Npb24sIGlkOiBzdHJpbmcpOiBFbnRpdHkgfCB1bmRlZmluZWQge1xuICByZXR1cm4gc2Vzc2lvbi53b3JsZC5lbnRpdGllcy5nZXQoaWQpO1xufVxuIiwgIi8vIE0wMDIgc3RydWN0dXJlIHJlbmRlcmVyIFx1MjAxNCBOb3hlbCBtYXNzZXMgZnJvbSBhdXRob3JpdGF0aXZlIHN0cnVjdHVyZSBtb2R1bGVzLlxuLy9cbi8vIFRoZSBzaW11bGF0aW9uIG93bnMgZXZlcnkgbW9kdWxlIChwb3NpdGlvbiwgc2l6ZSwgdG9uZSkuIFRoaXMgZmlsZSBvbmx5IHR1cm5zXG4vLyB0aGF0IGxpc3QgaW50byBvbmUgbWVyZ2VkLCBmbGF0LXNoYWRlZCBtZXNoIHBlciBzdHJ1Y3R1cmUuIEl0IG5ldmVyIGRlY2lkZXNcbi8vIHdoYXQgZXhpc3RzLCBhbmQgaXQgbmV2ZXIgZWRpdHMgdGVycmFpbi5cbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCB7IG1lcmdlR2VvbWV0cmllcyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS91dGlscy9CdWZmZXJHZW9tZXRyeVV0aWxzLmpzJztcbmltcG9ydCBwYWxldHRlIGZyb20gJy4uL2RhdGEvcGFsZXR0ZS5qc29uJztcbmltcG9ydCB7IFN0cnVjdHVyZSwgU3RydWN0dXJlTW9kdWxlIH0gZnJvbSAnLi4vc2ltL3N0cnVjdHVyZXMnO1xuaW1wb3J0IHsgU2l0ZVN0YXRlIH0gZnJvbSAnLi4vc2ltL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQgeyBSZWN0IH0gZnJvbSAnLi4vc2ltL3RlcnJhaW4nO1xuY29uc3QgTSA9IHBhbGV0dGUubWF0ZXJpYWxzIGFzIFJlY29yZDxzdHJpbmcsIHsgaGV4OiBzdHJpbmcgfT47XG5jb25zdCBIID0gKGs6IHN0cmluZykgPT4gTVtrXS5oZXg7XG5cbmNvbnN0IFRPTkU6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIHN0b25lOiBIKCdub3hlbF9zdG9uZScpLFxuICBzdG9uZV9iOiBIKCdub3hlbF9zdG9uZV9iJyksXG4gIHRpbWJlcjogSCgnYmFya19kYXJrJyksXG4gIG9jaHJlOiBIKCdzdHJhdGFfb2NocmUnKSxcbiAgYWNjZW50OiBIKCdhY2NlbnRfYmx1ZScpLFxuICBncmF2ZWw6IG5ldyBUSFJFRS5Db2xvcihIKCdzdG9uZV9ib2R5X2InKSkubGVycChuZXcgVEhSRUUuQ29sb3IoSCgnc2FuZCcpKSwgMC4zNSkuZ2V0SGV4U3RyaW5nKCkucGFkU3RhcnQoNiwgJzAnKSxcbiAgc29pbDogSCgnc3RyYXRhX29jaHJlJyksXG4gIGNyb3A6IEgoJ2Nhbm9weV9ncmVlbl9hJyksXG59O1xuXG4vLyBgZ2V0SGV4U3RyaW5nKClgIGRyb3BzIHRoZSBsZWFkaW5nICcjJywgc28gbm9ybWFsaXNlIGl0IGJhY2sgdG8gYSBDU1MgY29sb3VyLlxuZnVuY3Rpb24gdG9uZUNvbG91cih0b25lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuICBjb25zdCByYXcgPSAodG9uZSAmJiBUT05FW3RvbmVdKSB8fCBUT05FLnN0b25lO1xuICByZXR1cm4gcmF3LnN0YXJ0c1dpdGgoJyMnKSA/IHJhdyA6IGAjJHtyYXd9YDtcbn1cblxuY29uc3QgU1RSVUNUVVJFX01BVEVSSUFMID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICB2ZXJ0ZXhDb2xvcnM6IHRydWUsXG4gIGZsYXRTaGFkaW5nOiB0cnVlLFxufSk7XG5jb25zdCBDUk9QX01BVEVSSUFMID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICB2ZXJ0ZXhDb2xvcnM6IHRydWUsXG4gIGZsYXRTaGFkaW5nOiB0cnVlLFxufSk7XG5cbmZ1bmN0aW9uIHBhaW50KGdlb21ldHJ5OiBUSFJFRS5CdWZmZXJHZW9tZXRyeSwgaGV4OiBzdHJpbmcpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XG4gIGNvbnN0IGcgPSBnZW9tZXRyeS5pbmRleCA/IGdlb21ldHJ5LnRvTm9uSW5kZXhlZCgpIDogZ2VvbWV0cnk7XG4gIGcuZGVsZXRlQXR0cmlidXRlKCd1dicpO1xuICBjb25zdCBjb2xvdXIgPSBuZXcgVEhSRUUuQ29sb3IoaGV4KTtcbiAgY29uc3QgbiA9IGcuYXR0cmlidXRlcy5wb3NpdGlvbi5jb3VudDtcbiAgY29uc3QgYXJyID0gbmV3IEZsb2F0MzJBcnJheShuICogMyk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgYXJyW2kgKiAzXSA9IGNvbG91ci5yO1xuICAgIGFycltpICogMyArIDFdID0gY29sb3VyLmc7XG4gICAgYXJyW2kgKiAzICsgMl0gPSBjb2xvdXIuYjtcbiAgfVxuICBnLnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKGFyciwgMykpO1xuICByZXR1cm4gZztcbn1cblxuZnVuY3Rpb24gc3RydWN0dXJlQW5jaG9yKHN0cnVjdHVyZTogU3RydWN0dXJlLCBoZWlnaHQ6IG51bWJlcik6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9IHtcbiAgY29uc3QgYm91bmRzID0gbmV3IFRIUkVFLkJveDMoKTtcbiAgY29uc3QgcG9pbnQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICBmb3IgKGNvbnN0IG0gb2Ygc3RydWN0dXJlLm1vZHVsZXMpIHtcbiAgICAvLyBSb3RhdGlvbiBpcyBhcm91bmQgdGhlIG1vZHVsZSBjZW50cmU7IGEgYm91bmRpbmcgc3BoZXJlIGtlZXBzIHRoZSBhbmNob3JcbiAgICAvLyB2YWxpZCBmb3IgbGVnYWN5IHJvdGF0ZWQgbGludGVscyB3aXRob3V0IGFzc3VtaW5nIGEgcmVjdGFuZ3VsYXIgc2l0ZS5cbiAgICBjb25zdCBleHRlbnQgPSBNYXRoLmh5cG90KG0udywgbS5kKSAvIDI7XG4gICAgYm91bmRzLmV4cGFuZEJ5UG9pbnQocG9pbnQuc2V0KG0ueCAtIGV4dGVudCwgbS55LCBtLnogLSBleHRlbnQpKTtcbiAgICBib3VuZHMuZXhwYW5kQnlQb2ludChwb2ludC5zZXQobS54ICsgZXh0ZW50LCBtLnkgKyBtLmggKyBoZWlnaHQsIG0ueiArIGV4dGVudCkpO1xuICB9XG4gIGNvbnN0IGNlbnRyZSA9IGJvdW5kcy5nZXRDZW50ZXIobmV3IFRIUkVFLlZlY3RvcjMoKSk7XG4gIHJldHVybiB7IHg6IGNlbnRyZS54LCB5OiBjZW50cmUueSArIGhlaWdodCAvIDIsIHo6IGNlbnRyZS56IH07XG59XG5cbmZ1bmN0aW9uIG1vZHVsZUdlb21ldHJ5KG06IFN0cnVjdHVyZU1vZHVsZSwgZGVzaWduVmVyc2lvbj86IFN0cnVjdHVyZVsnZGVzaWduVmVyc2lvbiddKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xuICAvLyBDcm9wIHJvd3MgYXJlIGFnZ3JlZ2F0ZSBwcmVzZW50YXRpb24gdm9sdW1lcywgbmV2ZXIgc2ltdWxhdGlvbiBwbGFudHMuXG4gIC8vIERlc2lnbiAyIHVzZXMgb25lIHJlc3RyYWluZWQgZmFjZXRlZCBzaWxob3VldHRlIGluc2lkZSB0aGUgZXhhY3Qgcm93IGJvdW5kcy5cbiAgaWYgKG0ua2luZCA9PT0gJ2Nyb3Bfcm93JyAmJiBkZXNpZ25WZXJzaW9uID09PSAyKSByZXR1cm4gY3JvcEdlb21ldHJ5KG0pO1xuICBjb25zdCBnID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KG0udywgbS5oLCBtLmQpO1xuICBpZiAobS5yb3QpIGcucm90YXRlWShtLnJvdCk7XG4gIGcudHJhbnNsYXRlKG0ueCwgbS55ICsgbS5oIC8gMiwgbS56KTtcbiAgcmV0dXJuIHBhaW50KGcsIHRvbmVDb2xvdXIobS50b25lKSk7XG59XG5cbi8qKiBEZXRlcm1pbmlzdGljIGxvdy1zaWRlZCBsZWFmIGNhbm9weSwgYm91bmRlZCBieSBhbiBhdXRob3JpdGF0aXZlIGNyb3Agcm93LiAqL1xuZnVuY3Rpb24gY3JvcEdlb21ldHJ5KG06IFN0cnVjdHVyZU1vZHVsZSk6IFRIUkVFLkJ1ZmZlckdlb21ldHJ5IHtcbiAgY29uc3QgbGVhdmVzOiBUSFJFRS5CdWZmZXJHZW9tZXRyeVtdID0gW107XG4gIGNvbnN0IGNvdW50ID0gTWF0aC5tYXgoMywgTWF0aC5yb3VuZChtLncgLyAxLjIpKTtcbiAgY29uc3Qgc2lkZXMgPSA1O1xuICBjb25zdCByYWRpdXMgPSBNYXRoLm1pbihtLmQgLyAyIC0gMC4wMzUsIG0udyAvIGNvdW50IC8gMik7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgIGNvbnN0IGN4ID0gbS54IC0gbS53IC8gMiArIG0udyAqIChpICsgMC41KSAvIGNvdW50O1xuICAgIGNvbnN0IGN6ID0gbS56ICsgKGkgJSAyID09PSAwID8gLTAuMDM1IDogMC4wMzUpO1xuICAgIGNvbnN0IHRvcCA9IG0ueSArIG0uaCAqIChpICUgMyA9PT0gMCA/IDEgOiAwLjgyKTtcbiAgICBjb25zdCBzaG91bGRlciA9IG0ueSArIG0uaCAqIDAuNDY7XG4gICAgY29uc3QgcG9zOiBudW1iZXJbXSA9IFtdO1xuICAgIGNvbnN0IHRyaSA9IChhOiBudW1iZXJbXSwgYjogbnVtYmVyW10sIGM6IG51bWJlcltdKSA9PiBwb3MucHVzaCguLi5hLCAuLi5iLCAuLi5jKTtcbiAgICBjb25zdCBvdXRlclBvaW50ID0gKGs6IG51bWJlcikgPT4ge1xuICAgICAgY29uc3QgYW5nbGUgPSAoayAlIHNpZGVzKSAqIDIgKiBNYXRoLlBJIC8gc2lkZXM7XG4gICAgICByZXR1cm4gW2N4ICsgTWF0aC5jb3MoYW5nbGUpICogcmFkaXVzLCBzaG91bGRlciwgY3ogKyBNYXRoLnNpbihhbmdsZSkgKiByYWRpdXNdO1xuICAgIH07XG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCBzaWRlczsgaysrKSB7XG4gICAgICBjb25zdCBhID0gb3V0ZXJQb2ludChrKSwgYiA9IG91dGVyUG9pbnQoayArIDEpO1xuICAgICAgdHJpKFtjeCwgbS55LCBjel0sIGIsIGEpO1xuICAgICAgdHJpKGEsIGIsIFtjeCwgdG9wLCBjel0pO1xuICAgIH1cbiAgICBjb25zdCBnID0gbmV3IFRIUkVFLkJ1ZmZlckdlb21ldHJ5KCk7XG4gICAgZy5zZXRBdHRyaWJ1dGUoJ3Bvc2l0aW9uJywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUocG9zLCAzKSk7XG4gICAgZy5jb21wdXRlVmVydGV4Tm9ybWFscygpO1xuICAgIGxlYXZlcy5wdXNoKHBhaW50KGcsIHRvbmVDb2xvdXIobS50b25lKSkpO1xuICB9XG4gIGNvbnN0IG1lcmdlZCA9IG1lcmdlR2VvbWV0cmllcyhsZWF2ZXMsIGZhbHNlKTtcbiAgZm9yIChjb25zdCBsZWFmIG9mIGxlYXZlcykgbGVhZi5kaXNwb3NlKCk7XG4gIGlmICghbWVyZ2VkKSB0aHJvdyBuZXcgRXJyb3IoJ2NvdWxkIG5vdCBtZXJnZSBjcm9wLXJvdyBwcmVzZW50YXRpb24nKTtcbiAgbWVyZ2VkLmNvbXB1dGVCb3VuZGluZ0JveCgpO1xuICBtZXJnZWQuY29tcHV0ZUJvdW5kaW5nU3BoZXJlKCk7XG4gIHJldHVybiBtZXJnZWQ7XG59XG5cbi8qKiBPbmUgbWVyZ2VkIG1lc2ggZm9yIGEgZmluaXNoZWQgc3RydWN0dXJlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkU3RydWN0dXJlTWVzaChzdHJ1Y3R1cmU6IFN0cnVjdHVyZSk6IFRIUkVFLk1lc2ggfCBUSFJFRS5Hcm91cCB7XG4gIGlmIChzdHJ1Y3R1cmUuZGVzaWduVmVyc2lvbiA9PT0gMiAmJiBzdHJ1Y3R1cmUua2luZCA9PT0gJ3RlcnJhY2UnKSB7XG4gICAgY29uc3QgZ3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgICBncm91cC5uYW1lID0gYHN0cnVjdHVyZV8ke3N0cnVjdHVyZS5raW5kfWA7XG4gICAgZ3JvdXAudXNlckRhdGEuc3RydWN0dXJlSWQgPSBzdHJ1Y3R1cmUuaWQ7ICAgIGdyb3VwLnVzZXJEYXRhLmluc3BlY3RUYXJnZXQgPSBzdHJ1Y3R1cmVBbmNob3Ioc3RydWN0dXJlLCAwLjYpO1xuICAgIGNvbnN0IGVhcnRoID0gYnVpbGRTdHJ1Y3R1cmVNZXNoKHsgLi4uc3RydWN0dXJlLCBkZXNpZ25WZXJzaW9uOiB1bmRlZmluZWQsXG4gICAgICBtb2R1bGVzOiBzdHJ1Y3R1cmUubW9kdWxlcy5maWx0ZXIoKG0pID0+IG0ua2luZCAhPT0gJ2Nyb3Bfcm93JykgfSk7XG4gICAgaWYgKCEoZWFydGggaW5zdGFuY2VvZiBUSFJFRS5NZXNoKSkgdGhyb3cgbmV3IEVycm9yKCd1bmV4cGVjdGVkIHRlcnJhY2UgZ3JvdXAnKTtcbiAgICBncm91cC5hZGQoZWFydGgpO1xuICAgIGNvbnN0IHBhcnRzID0gc3RydWN0dXJlLm1vZHVsZXMuZmlsdGVyKChtKSA9PiBtLmtpbmQgPT09ICdjcm9wX3JvdycpLm1hcChjcm9wR2VvbWV0cnkpO1xuICAgIGNvbnN0IG1lcmdlZCA9IG1lcmdlR2VvbWV0cmllcyhwYXJ0cywgZmFsc2UpO1xuICAgIGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykgcGFydC5kaXNwb3NlKCk7XG4gICAgaWYgKCFtZXJnZWQpIHRocm93IG5ldyBFcnJvcihgY291bGQgbm90IG1lcmdlIGNyb3Agcm93cyAke3N0cnVjdHVyZS5pZH1gKTtcbiAgICBjb25zdCBmb2xpYWdlID0gbmV3IFRIUkVFLk1lc2gobWVyZ2VkLCBDUk9QX01BVEVSSUFMKTtcbiAgICBmb2xpYWdlLm5hbWUgPSAnY3JvcF9yb3dfZm9saWFnZSc7XG4gICAgZm9saWFnZS5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgICBmb2xpYWdlLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xuICAgIGZvbGlhZ2UudXNlckRhdGEucHJlc2VudGF0aW9uQm91bmRzID0gc3RydWN0dXJlLm1vZHVsZXMuZmlsdGVyKChtKSA9PiBtLmtpbmQgPT09ICdjcm9wX3JvdycpLmxlbmd0aDtcbiAgICBncm91cC5hZGQoZm9saWFnZSk7XG4gICAgcmV0dXJuIGdyb3VwO1xuICB9XG4gIGNvbnN0IHBhcnRzID0gc3RydWN0dXJlLm1vZHVsZXMubWFwKChtKSA9PiBtb2R1bGVHZW9tZXRyeShtLCBzdHJ1Y3R1cmUuZGVzaWduVmVyc2lvbikpO1xuICBjb25zdCBtZXJnZWQgPSBtZXJnZUdlb21ldHJpZXMocGFydHMsIGZhbHNlKTtcbiAgZm9yIChjb25zdCBwYXJ0IG9mIHBhcnRzKSBwYXJ0LmRpc3Bvc2UoKTtcbiAgaWYgKCFtZXJnZWQpIHRocm93IG5ldyBFcnJvcihgY291bGQgbm90IG1lcmdlIHN0cnVjdHVyZSAke3N0cnVjdHVyZS5pZH1gKTtcbiAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKG1lcmdlZCwgU1RSVUNUVVJFX01BVEVSSUFMKTtcbiAgbWVzaC5uYW1lID0gYHN0cnVjdHVyZV8ke3N0cnVjdHVyZS5raW5kfWA7XG4gIG1lc2guY2FzdFNoYWRvdyA9IHRydWU7XG4gIG1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gIG1lc2gudXNlckRhdGEuc3RydWN0dXJlSWQgPSBzdHJ1Y3R1cmUuaWQ7ICBtZXNoLnVzZXJEYXRhLmluc3BlY3RUYXJnZXQgPSBzdHJ1Y3R1cmVBbmNob3Ioc3RydWN0dXJlLCBzdHJ1Y3R1cmUua2luZCA9PT0gJ2hvdXNlJyA/IDAuNiA6IDAuMyk7XG4gIHJldHVybiBtZXNoO1xufVxuXG5jb25zdCBHSE9TVF9DT0xPVVI6IFJlY29yZDxTaXRlU3RhdGUsIHN0cmluZz4gPSB7XG4gIHZhbGlkOiAnIzZGRTM5QScsXG4gIHZhbGlkX3dpdGhfcHJlcGFyYXRpb246ICcjRjJCMzVDJyxcbiAgaW52YWxpZDogJyNFODZBNUUnLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0R2hvc3RTcGVjIHtcbiAga2luZDogJ2hvdXNlJyB8ICdwYXRoJyB8ICd0ZXJyYWNlJztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIGRvb3I/OiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGJhbmRzPzogcmVhZG9ubHkgeyB6MDogbnVtYmVyOyB6MTogbnVtYmVyOyB5OiBudW1iZXIgfVtdO1xufVxuXG5mdW5jdGlvbiBnaG9zdEJveChcbiAgZ3JvdXA6IFRIUkVFLkdyb3VwLFxuICBjeDogbnVtYmVyLCB5OiBudW1iZXIsIGN6OiBudW1iZXIsXG4gIHc6IG51bWJlciwgaDogbnVtYmVyLCBkOiBudW1iZXIsXG4gIGNvbG91cjogc3RyaW5nLFxuKTogdm9pZCB7XG4gIGNvbnN0IGJveCA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSh3LCBoLCBkKTtcbiAgY29uc3QgZmlsbCA9IG5ldyBUSFJFRS5NZXNoKGJveCwgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICBjb2xvcjogY29sb3VyLFxuICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgIG9wYWNpdHk6IDAuMTYsXG4gICAgZGVwdGhXcml0ZTogZmFsc2UsXG4gICAgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcbiAgfSkpO1xuICBmaWxsLnBvc2l0aW9uLnNldChjeCwgeSArIGggLyAyLCBjeik7XG4gIGZpbGwucmVuZGVyT3JkZXIgPSAyO1xuICBncm91cC5hZGQoZmlsbCk7XG5cbiAgY29uc3QgZWRnZXMgPSBuZXcgVEhSRUUuRWRnZXNHZW9tZXRyeShib3gpO1xuICBib3guZGlzcG9zZSgpO1xuICBjb25zdCBsaW5lID0gbmV3IFRIUkVFLkxpbmVTZWdtZW50cyhlZGdlcywgbmV3IFRIUkVFLkxpbmVCYXNpY01hdGVyaWFsKHtcbiAgICBjb2xvcjogY29sb3VyLFxuICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgIG9wYWNpdHk6IDAuOTUsXG4gICAgZGVwdGhXcml0ZTogZmFsc2UsXG4gIH0pKTtcbiAgbGluZS5wb3NpdGlvbi5jb3B5KGZpbGwucG9zaXRpb24pO1xuICBsaW5lLnJlbmRlck9yZGVyID0gMztcbiAgZ3JvdXAuYWRkKGxpbmUpO1xufVxuXG4vKipcbiAqIEZvb3RwcmludCBnaG9zdCBmb3IgYSBwcm9qZWN0LiBIb3VzZXMgZ2V0IGEgbWFzc2luZyBib3g7IHRoZSB0ZXJyYWNlZCBmaWVsZFxuICogZ2V0cyBvbmUgYm94IHBlciBwaW5uZWQgYmFuZCBzbyB0aGUgcHJldmlldyBzaG93cyB0aGUgYWN0dWFsIHN0ZXAgcHJvZmlsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUHJvamVjdEdob3N0KHByb2plY3Q6IFByb2plY3RHaG9zdFNwZWMsIHN0YXRlOiBTaXRlU3RhdGUpOiBUSFJFRS5Hcm91cCB7XG4gIGNvbnN0IGdyb3VwID0gbmV3IFRIUkVFLkdyb3VwKCk7XG4gIGdyb3VwLm5hbWUgPSBgbTJfZ2hvc3RfJHtwcm9qZWN0LmtpbmR9YDtcbiAgY29uc3QgY29sb3VyID0gR0hPU1RfQ09MT1VSW3N0YXRlXTtcbiAgY29uc3QgcmVjdCA9IHByb2plY3QucmVjdDtcbiAgY29uc3QgdyA9IHJlY3QueDEgLSByZWN0LngwICsgMTtcbiAgY29uc3QgZCA9IHJlY3QuejEgLSByZWN0LnowICsgMTtcbiAgY29uc3QgY3ggPSByZWN0LngwICsgdyAvIDI7XG4gIGNvbnN0IGN6ID0gcmVjdC56MCArIGQgLyAyO1xuXG4gIGlmIChwcm9qZWN0LmJhbmRzKSB7XG4gICAgZm9yIChjb25zdCBiYW5kIG9mIHByb2plY3QuYmFuZHMpIHtcbiAgICAgIGNvbnN0IGJkID0gYmFuZC56MSAtIGJhbmQuejAgKyAxO1xuICAgICAgZ2hvc3RCb3goZ3JvdXAsIGN4LCBiYW5kLnksIGJhbmQuejAgKyBiZCAvIDIsIHcsIDAuMzIsIGJkLCBjb2xvdXIpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBoID0gcHJvamVjdC5raW5kID09PSAnaG91c2UnID8gMy42IDogcHJvamVjdC5raW5kID09PSAncGF0aCcgPyAwLjMgOiAwLjU1O1xuICAgIGdob3N0Qm94KGdyb3VwLCBjeCwgcHJvamVjdC5mbG9vclksIGN6LCB3LCBoLCBkLCBjb2xvdXIpO1xuICB9XG5cbiAgaWYgKHByb2plY3QuZG9vcikge1xuICAgIGNvbnN0IGRvb3IgPSBwcm9qZWN0LmRvb3I7XG4gICAgZ2hvc3RCb3goZ3JvdXAsIGRvb3IueCArIDAuNSwgcHJvamVjdC5mbG9vclksIGRvb3IueiArIDAuNSwgMC45LCAyLjIsIDEuMiwgY29sb3VyKTtcbiAgfVxuXG4gIHJldHVybiBncm91cDtcbn1cbiIsICJ7XG4gIFwic2NoZW1hXCI6IFwicGFsZXR0ZV92MlwiLFxuICBcImRhdGVcIjogXCIyMDI2LTEwLTIyXCIsXG4gIFwic3RhdHVzXCI6IFwicHJvcG9zZWRcIixcbiAgXCJzb3VyY2VcIjogXCJSRUYtMDAyIChoeWJyaWQgd29ybGQgcmVmZXJlbmNlKSwgdmFsdWVzIHNhbXBsZWQgYnkgZXllOyBudW1lcmljIHZlcmlmaWNhdGlvbiBwZW5kaW5nXCIsXG4gIFwibm90ZVwiOiBcIk9uZSBtYXRlcmlhbCBwYWxldHRlLiBUaW1lIG9mIGRheSBpcyBleHByZXNzZWQgYnkgdGhlIGxpZ2h0aW5nIHByZXNldHMgYmVsb3csIG5vdCBieSByZXBhaW50aW5nIG1hdGVyaWFscy5cIixcbiAgXCJtYXRlcmlhbHNcIjoge1xuICAgIFwiZ3Jhc3NfdG9wXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzc5Qjk0Q1wiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGxvdyBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19oaWdoXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzhGQzk1RVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIG1pZCBlbGV2YXRpb25cIlxuICAgIH0sXG4gICAgXCJncmFzc19wZWFrXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzlBRDA2QVwiLFxuICAgICAgXCJyb2xlXCI6IFwidGVycmFpbiB0b3AsIGhpZ2ggZWxldmF0aW9uXCJcbiAgICB9LFxuICAgIFwiZ3Jhc3NfY2FwXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVFOTQ0MFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBiYW5kIDAuMC0wLjQgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfb2NocmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQzk5QTVGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJhbmQgMC40LTAuNjIgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdHJhdGFfcnVzdFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNCNDYzM0NcIixcbiAgICAgIFwicm9sZVwiOiBcInNpZGUgYmFuZCAwLjYyLTAuODAgbSBiZWxvdyB0b3BcIlxuICAgIH0sXG4gICAgXCJzdG9uZV90b3BcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZERkNDXCIsXG4gICAgICBcInJvbGVcIjogXCJiYXJlIHN0b25lIHRvcCBzdXJmYWNlXCJcbiAgICB9LFxuICAgIFwic3RvbmVfYm9keV9hXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0RDRDNCRVwiLFxuICAgICAgXCJyb2xlXCI6IFwic2lkZSBib2R5LCBldmVuIDQuNSBtIGJhbmRcIlxuICAgIH0sXG4gICAgXCJzdG9uZV9ib2R5X2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDFDN0FGXCIsXG4gICAgICBcInJvbGVcIjogXCJzaWRlIGJvZHksIG9kZCA0LjUgbSBiYW5kXCJcbiAgICB9LFxuICAgIFwic3RvbmVfc2hhZGVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjQjlBRTk2XCIsXG4gICAgICBcInJvbGVcIjogXCJjcmV2aWNlIC8gcmVjZXNzZWQgc3RvbmUgYWNjZW50XCJcbiAgICB9LFxuICAgIFwic2FuZFwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFM0QzQTZcIixcbiAgICAgIFwicm9sZVwiOiBcInNob3JlIGNlbGxzXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfc2hhbGxvd1wiOiB7XG4gICAgICBcImhleFwiOiBcIiM2N0NGRDhcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoIDw9IDAuNSBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfbWlkXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzNBQUZDNFwiLFxuICAgICAgXCJyb2xlXCI6IFwid2F0ZXIgZGVwdGggfjEuNSBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfZGVlcFwiOiB7XG4gICAgICBcImhleFwiOiBcIiMyQThGQThcIixcbiAgICAgIFwicm9sZVwiOiBcIndhdGVyIGRlcHRoID49IDQuMCBtXCJcbiAgICB9LFxuICAgIFwid2F0ZXJfcmltXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0JGRUFGMFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2hvcmVsaW5lIHJpbSAvIGZvYW0gdGludFwiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9hXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzVGQTgzRlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBzaGFkZSBtYXNzXCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X2dyZWVuX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNkZCODRBXCIsXG4gICAgICBcInJvbGVcIjogXCJncmVlbiBjYW5vcHksIG1haW4gbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9ncmVlbl9jXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzdGQzM1NlwiLFxuICAgICAgXCJyb2xlXCI6IFwiZ3JlZW4gY2Fub3B5LCBoaWdobGlnaHQgbWFzc1wiXG4gICAgfSxcbiAgICBcImNhbm9weV9waW5rXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiI0YyQTZDNFwiLFxuICAgICAgXCJyb2xlXCI6IFwiYmxvc3NvbSBhY2NlbnQgc3BlY2llcyBvbmx5XCJcbiAgICB9LFxuICAgIFwiY2Fub3B5X3BpbmtfYlwiOiB7XG4gICAgICBcImhleFwiOiBcIiNFODhGQjJcIixcbiAgICAgIFwicm9sZVwiOiBcImJsb3Nzb20gc2hhZGUgbWFzc1wiXG4gICAgfSxcbiAgICBcInRydW5rXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzZCNEEzM1wiLFxuICAgICAgXCJyb2xlXCI6IFwidHJlZSB0cnVua3NcIlxuICAgIH0sXG4gICAgXCJiYXJrX2RhcmtcIjoge1xuICAgICAgXCJoZXhcIjogXCIjNEUzNjI2XCIsXG4gICAgICBcInJvbGVcIjogXCJ0cnVuayBzaGFkZSwgc3R1bXBzXCJcbiAgICB9LFxuICAgIFwib3JlX2NyeXN0YWxcIjoge1xuICAgICAgXCJoZXhcIjogXCIjN0I1QUQ2XCIsXG4gICAgICBcInJvbGVcIjogXCJvcmUgZGVwb3NpdCBhY2NlbnQgKHByb3Bvc2VkLCByZXBsYWNlcyB0ZWFsKVwiXG4gICAgfSxcbiAgICBcIm9yZV9jcnlzdGFsX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjOUI3QkU4XCIsXG4gICAgICBcInJvbGVcIjogXCJvcmUgaGlnaGxpZ2h0IGZhY2V0XCJcbiAgICB9LFxuICAgIFwibm94ZWxfc3RvbmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRTZERkNDXCIsXG4gICAgICBcInJvbGVcIjogXCJOb3hlbCBhcmNoaXRlY3R1cmUgbWFpbiBzdG9uZVwiXG4gICAgfSxcbiAgICBcIm5veGVsX3N0b25lX2JcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRDNDOUI0XCIsXG4gICAgICBcInJvbGVcIjogXCJOb3hlbCBzZWNvbmRhcnkgc3RvbmUgLyByZWNlc3NcIlxuICAgIH0sXG4gICAgXCJhY2NlbnRfYmx1ZVwiOiB7XG4gICAgICBcImhleFwiOiBcIiMzRTdGQjhcIixcbiAgICAgIFwicm9sZVwiOiBcImJhbm5lciAvIGNsb3RoIGFjY2VudFwiXG4gICAgfSxcbiAgICBcImFjY2VudF90ZWFsXCI6IHtcbiAgICAgIFwiaGV4XCI6IFwiIzJGQTZBMFwiLFxuICAgICAgXCJyb2xlXCI6IFwic2Vjb25kYXJ5IGFjY2VudFwiXG4gICAgfSxcbiAgICBcImVtaXNzaXZlX2ZpcmVcIjoge1xuICAgICAgXCJoZXhcIjogXCIjRkY5RTRBXCIsXG4gICAgICBcInJvbGVcIjogXCJjYW1wZmlyZSAvIHdhcm0gZW1pc3NpdmUgKGVmZmVjdHMgb25seSlcIlxuICAgIH0sXG4gICAgXCJlbWlzc2l2ZV9tYWdpY1wiOiB7XG4gICAgICBcImhleFwiOiBcIiNEMjRCRkZcIixcbiAgICAgIFwicm9sZVwiOiBcInJlc2VydmVkOiBtYWdpYyBlZmZlY3RzIG9ubHksIG5ldmVyIG1hdGVyaWFsc1wiXG4gICAgfVxuICB9LFxuICBcImxpZ2h0aW5nXCI6IHtcbiAgICBcImRhd25cIjoge1xuICAgICAgXCJzdW5FbGV2YXRpb25EZWdcIjogMTIsXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMTA1LFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkM3OUFcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDIuMixcbiAgICAgIFwiaGVtaVNreVwiOiBcIiM4RkE2QzhcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM0RTVGNkVcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAwLjYsXG4gICAgICBcInNreVwiOiBcIiNBOEJFRDZcIixcbiAgICAgIFwiZm9nXCI6IFwiI0E4QkVENlwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDA1LFxuICAgICAgXCJleHBvc3VyZVwiOiAxLjFcbiAgICB9LFxuICAgIFwibm9vblwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiAzOCxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiA1MCxcbiAgICAgIFwic3VuQ29sb3JcIjogXCIjRkZGNERDXCIsXG4gICAgICBcInN1bkludGVuc2l0eVwiOiAyLjc1LFxuICAgICAgXCJoZW1pU2t5XCI6IFwiI0JGRDlGMlwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzdBOEY1NVwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDAuNTUsXG4gICAgICBcInNreVwiOiBcIiM5RUQyRUVcIixcbiAgICAgIFwiZm9nXCI6IFwiI0RDRUZGOFwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDAyOCxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4wNVxuICAgIH0sXG4gICAgXCJkdXNrXCI6IHtcbiAgICAgIFwic3VuRWxldmF0aW9uRGVnXCI6IDksXG4gICAgICBcInN1bkF6aW11dGhEZWdcIjogMjUwLFxuICAgICAgXCJzdW5Db2xvclwiOiBcIiNGRkIyN0FcIixcbiAgICAgIFwic3VuSW50ZW5zaXR5XCI6IDMuMixcbiAgICAgIFwiaGVtaVNreVwiOiBcIiM4RTdDOUVcIixcbiAgICAgIFwiaGVtaUdyb3VuZFwiOiBcIiM1QTRBNTBcIixcbiAgICAgIFwiaGVtaUludGVuc2l0eVwiOiAxLjEsXG4gICAgICBcInNreVwiOiBcIiNDOThFODZcIixcbiAgICAgIFwiZm9nXCI6IFwiI0MwOTA4QVwiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDAzNixcbiAgICAgIFwiZXhwb3N1cmVcIjogMS4zMlxuICAgIH0sXG4gICAgXCJuaWdodFwiOiB7XG4gICAgICBcInN1bkVsZXZhdGlvbkRlZ1wiOiA0MCxcbiAgICAgIFwic3VuQXppbXV0aERlZ1wiOiAyMjAsXG4gICAgICBcInN1bkNvbG9yXCI6IFwiI0FGQzhGRlwiLFxuICAgICAgXCJzdW5JbnRlbnNpdHlcIjogMS4wLFxuICAgICAgXCJoZW1pU2t5XCI6IFwiIzNBNEM3QVwiLFxuICAgICAgXCJoZW1pR3JvdW5kXCI6IFwiIzFDMjU0MFwiLFxuICAgICAgXCJoZW1pSW50ZW5zaXR5XCI6IDEuMDUsXG4gICAgICBcInNreVwiOiBcIiMxMDE3MzZcIixcbiAgICAgIFwiZm9nXCI6IFwiIzE1MUMzQ1wiLFxuICAgICAgXCJmb2dEZW5zaXR5XCI6IDAuMDA0NSxcbiAgICAgIFwiZXhwb3N1cmVcIjogMS41XG4gICAgfVxuICB9XG59Il0sCiAgIm1hcHBpbmdzIjogIjtBQUFBLE9BQU8sWUFBWTtBQUNuQixPQUFPLFVBQVU7OztBQ09qQixJQUFNLFNBQVMsb0JBQUksUUFBNkI7QUFFekMsU0FBUyxpQkFBaUIsT0FBNEI7QUFDM0QsTUFBSSxRQUFRLE9BQU8sSUFBSSxLQUFLO0FBQzVCLE1BQUksQ0FBQyxPQUFPO0FBQUUsWUFBUSxFQUFFLFFBQVEsT0FBTyxnQkFBZ0IsT0FBTyxVQUFVLE1BQU07QUFBRyxXQUFPLElBQUksT0FBTyxLQUFLO0FBQUEsRUFBRztBQUMzRyxTQUFPO0FBQ1Q7QUFFTyxTQUFTLGtCQUFrQixPQUFxQjtBQUNyRCxRQUFNLFFBQVEsaUJBQWlCLEtBQUs7QUFDcEMsUUFBTSxTQUFTO0FBQ2YsUUFBTSxpQkFBaUI7QUFDdkIsUUFBTSxXQUFXO0FBQ25CO0FBRU8sU0FBUyxjQUFjLE9BQXdCO0FBQ3BELFNBQU8sT0FBTyxJQUFJLEtBQUssR0FBRyxVQUFVO0FBQ3RDO0FBT08sU0FBUyxzQkFBc0IsT0FBd0I7QUFDNUQsU0FBTyxPQUFPLElBQUksS0FBSyxHQUFHLGtCQUFrQjtBQUM5QztBQVlPLFNBQVMsa0JBQWtCLE9BQXFCO0FBQ3JELFFBQU0sUUFBUSxpQkFBaUIsS0FBSztBQUNwQyxRQUFNLFNBQVM7QUFDZixRQUFNLGlCQUFpQjtBQUN2QixRQUFNLFdBQVc7QUFDbkI7OztBQ3BDTyxJQUFNLGFBQWE7QUFDbkIsSUFBTSxPQUFPLGFBQWE7QUFDMUIsSUFBTSxhQUFhO0FBQ25CLElBQU0sa0JBQWtCLGFBQWE7QUFDckMsSUFBTSxRQUFRO0FBQ2QsSUFBTSxRQUFRO0FBQ2QsSUFBTSxlQUFlLFFBQVE7QUFDN0IsSUFBTSxZQUFZO0FBRWxCLElBQU0sb0JBQW9CO0FBQzFCLElBQU0sZUFBZSxhQUFhLGFBQWE7QUFDL0MsSUFBTSxhQUFhLGFBQWE7QUFFaEMsSUFBTSxNQUFNO0FBQUEsRUFDakIsS0FBSztBQUFBLEVBQ0wsT0FBTztBQUFBLEVBQ1AsTUFBTTtBQUFBLEVBQ04sTUFBTTtBQUFBLEVBQ04sUUFBUTtBQUFBLEVBQ1IsT0FBTztBQUFBLEVBQ1AsS0FBSztBQUFBLEVBQ0wsT0FBTztBQUFBLEVBQ1AsU0FBUztBQUFBLEVBQ1QsTUFBTTtBQUNSO0FBR08sSUFBTSxVQUFVLENBQUMsTUFBdUIsTUFBTSxJQUFJLE9BQU8sTUFBTSxJQUFJO0FBR25FLElBQU0sUUFBUSxDQUFDLEdBQVcsR0FBVyxNQUFlLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJO0FBQzVFLElBQU0sT0FBTyxDQUFDLEdBQVcsR0FBVyxNQUFjLEtBQUssSUFBSSxLQUFLO0FBQ3ZFLElBQU0sYUFBYSxDQUFDLElBQVksSUFBWSxNQUFjO0FBQ3hELFFBQU0sSUFBSSxPQUFPLElBQUksT0FBTyxLQUFLLEtBQUssR0FBRyxDQUFDO0FBQzFDLFNBQU8sSUFBSSxLQUFLLElBQUksSUFBSTtBQUMxQjtBQUdPLFNBQVMsT0FBTyxHQUFXLEdBQVcsTUFBc0I7QUFDakUsTUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLEdBQUcsU0FBUyxJQUFJLEtBQUssS0FBSyxHQUFHLFNBQVM7QUFDL0QsTUFBSSxLQUFLLEtBQUssSUFBSyxNQUFNLElBQUssVUFBVTtBQUN4QyxXQUFTLElBQUssTUFBTSxRQUFTLEtBQUs7QUFDcEM7QUFFTyxTQUFTLE9BQU8sR0FBVyxHQUFXLEdBQVcsTUFBc0I7QUFDNUUsTUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLEdBQUcsU0FBUyxJQUFJLEtBQUssS0FBSyxHQUFHLFNBQVMsSUFBSSxLQUFLLEtBQUssR0FBRyxVQUFVO0FBQzFGLE1BQUksS0FBSyxLQUFLLElBQUssTUFBTSxJQUFLLFVBQVU7QUFDeEMsV0FBUyxJQUFLLE1BQU0sUUFBUyxLQUFLO0FBQ3BDO0FBRU8sU0FBUyxXQUFXLE1BQTRCO0FBQ3JELE1BQUksSUFBSSxTQUFTO0FBQ2pCLFNBQU8sTUFBTTtBQUNYLFFBQUssSUFBSSxlQUFnQjtBQUN6QixRQUFJLElBQUk7QUFDUixRQUFJLEtBQUssS0FBSyxJQUFLLE1BQU0sSUFBSyxJQUFJLENBQUM7QUFDbkMsU0FBSyxJQUFJLEtBQUssS0FBSyxJQUFLLE1BQU0sR0FBSSxJQUFJLEVBQUU7QUFDeEMsYUFBUyxJQUFLLE1BQU0sUUFBUyxLQUFLO0FBQUEsRUFDcEM7QUFDRjtBQUVBLElBQU0sU0FBUyxDQUFDLE1BQWMsSUFBSSxLQUFLLElBQUksSUFBSTtBQUUvQyxTQUFTLFlBQVksR0FBVyxHQUFXLE1BQXNCO0FBQy9ELFFBQU0sS0FBSyxLQUFLLE1BQU0sQ0FBQyxHQUFHLEtBQUssS0FBSyxNQUFNLENBQUM7QUFDM0MsUUFBTSxLQUFLLE9BQU8sSUFBSSxFQUFFLEdBQUcsS0FBSyxPQUFPLElBQUksRUFBRTtBQUM3QyxRQUFNLElBQUksT0FBTyxJQUFJLElBQUksSUFBSSxHQUFHLElBQUksT0FBTyxLQUFLLEdBQUcsSUFBSSxJQUFJO0FBQzNELFFBQU0sSUFBSSxPQUFPLElBQUksS0FBSyxHQUFHLElBQUksR0FBRyxJQUFJLE9BQU8sS0FBSyxHQUFHLEtBQUssR0FBRyxJQUFJO0FBQ25FLFFBQU0sTUFBTSxLQUFLLElBQUksS0FBSztBQUMxQixRQUFNLFNBQVMsS0FBSyxJQUFJLEtBQUs7QUFDN0IsU0FBTyxPQUFPLFNBQVMsT0FBTztBQUNoQztBQUVPLFNBQVMsS0FBSyxHQUFXLEdBQVcsTUFBYyxTQUF5QjtBQUNoRixNQUFJLE1BQU0sR0FBRyxNQUFNLEdBQUcsT0FBTyxHQUFHLE9BQU87QUFDdkMsV0FBUyxJQUFJLEdBQUcsSUFBSSxTQUFTLEtBQUs7QUFDaEMsV0FBTyxNQUFNLFlBQVksSUFBSSxNQUFNLElBQUksTUFBTSxPQUFPLElBQUksR0FBRztBQUMzRCxZQUFRO0FBQ1IsV0FBTztBQUFLLFlBQVE7QUFBQSxFQUN0QjtBQUNBLFNBQU8sTUFBTTtBQUNmO0FBRUEsU0FBUyxZQUFZLEdBQVcsR0FBVyxHQUFXLE1BQXNCO0FBQzFFLFFBQU0sS0FBSyxLQUFLLE1BQU0sQ0FBQyxHQUFHLEtBQUssS0FBSyxNQUFNLENBQUMsR0FBRyxLQUFLLEtBQUssTUFBTSxDQUFDO0FBQy9ELFFBQU0sS0FBSyxPQUFPLElBQUksRUFBRSxHQUFHLEtBQUssT0FBTyxJQUFJLEVBQUUsR0FBRyxLQUFLLE9BQU8sSUFBSSxFQUFFO0FBQ2xFLFFBQU0sT0FBTyxPQUFPLElBQUksSUFBSSxJQUFJLElBQUksR0FBRyxPQUFPLE9BQU8sS0FBSyxHQUFHLElBQUksSUFBSSxJQUFJO0FBQ3pFLFFBQU0sT0FBTyxPQUFPLElBQUksS0FBSyxHQUFHLElBQUksSUFBSSxHQUFHLE9BQU8sT0FBTyxLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUksSUFBSTtBQUNqRixRQUFNLE9BQU8sT0FBTyxJQUFJLElBQUksS0FBSyxHQUFHLElBQUksR0FBRyxPQUFPLE9BQU8sS0FBSyxHQUFHLElBQUksS0FBSyxHQUFHLElBQUk7QUFDakYsUUFBTSxPQUFPLE9BQU8sSUFBSSxLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUksR0FBRyxPQUFPLE9BQU8sS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsSUFBSTtBQUN6RixRQUFNLE1BQU0sUUFBUSxPQUFPLFFBQVE7QUFDbkMsUUFBTSxNQUFNLFFBQVEsT0FBTyxRQUFRO0FBQ25DLFFBQU0sTUFBTSxRQUFRLE9BQU8sUUFBUTtBQUNuQyxRQUFNLE1BQU0sUUFBUSxPQUFPLFFBQVE7QUFDbkMsUUFBTSxLQUFLLE9BQU8sTUFBTSxPQUFPO0FBQy9CLFFBQU0sS0FBSyxPQUFPLE1BQU0sT0FBTztBQUMvQixTQUFPLE1BQU0sS0FBSyxNQUFNO0FBQzFCO0FBRUEsU0FBUyxLQUFLLEdBQVcsR0FBVyxHQUFXLE1BQWMsU0FBeUI7QUFDcEYsTUFBSSxNQUFNLEdBQUcsTUFBTSxHQUFHLE9BQU8sR0FBRyxPQUFPO0FBQ3ZDLFdBQVMsSUFBSSxHQUFHLElBQUksU0FBUyxLQUFLO0FBQ2hDLFdBQU8sTUFBTSxZQUFZLElBQUksTUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNLE9BQU8sSUFBSSxHQUFHO0FBQ3JFLFlBQVE7QUFDUixXQUFPO0FBQUssWUFBUTtBQUFBLEVBQ3RCO0FBQ0EsU0FBTyxNQUFNO0FBQ2Y7QUFZTyxJQUFNLGlCQUE4QjtBQUFBLEVBQ3pDLE1BQU07QUFBQSxFQUNOLFdBQVc7QUFBQSxFQUNYLE1BQU07QUFBQSxFQUNOLE1BQU07QUFBQSxFQUNOLFVBQVU7QUFBQSxFQUNWLGtCQUFrQjtBQUNwQjtBQXNCTyxJQUFNLHNCQUFzQixvQkFBSSxJQUFnQjtBQUFBLEVBQ3JEO0FBQUEsRUFBbUI7QUFBQSxFQUFvQjtBQUN6QyxDQUFDO0FBQ00sSUFBTSxxQkFBcUIsQ0FBQyxTQUE4QixvQkFBb0IsSUFBSSxJQUFJO0FBSTdGLFNBQVMsV0FBVyxPQUFjQSxLQUEyQjtBQUMzRCxRQUFNLFNBQVMsTUFBTSxTQUFTLElBQUlBLEdBQUU7QUFDcEMsU0FBTyxDQUFDLFVBQVcsbUJBQW1CLE9BQU8sSUFBSSxLQUFLLENBQUMsY0FBYyxLQUFLLEtBQ3JFLE1BQU0sZUFBZSxJQUFJQSxHQUFFLElBQUksT0FBTztBQUM3QztBQXFHTyxJQUFNLFdBQVcsQ0FBQyxJQUFZLE9BQWUsR0FBRyxFQUFFLElBQUksRUFBRTtBQUN4RCxJQUFNLGVBQWUsQ0FBQyxPQUFlLEtBQUssYUFBYTtBQUN2RCxJQUFNLGVBQWUsQ0FBQyxPQUFlLEtBQUssYUFBYTtBQUN2RCxJQUFNLGFBQWEsQ0FBQyxJQUFZLFFBQWdCLE9BQ3JELEtBQUssS0FBSyxhQUFhLFNBQVM7QUFDM0IsSUFBTSxnQkFBZ0IsQ0FBQyxNQUFjLEtBQUssT0FBTyxJQUFJLFFBQVEsVUFBVTtBQUN2RSxJQUFNLGdCQUFnQixDQUFDLE1BQWMsS0FBSyxPQUFPLElBQUksUUFBUSxVQUFVO0FBQ3ZFLElBQU0sZ0JBQWdCLENBQUMsTUFBYyxLQUFLLGNBQWMsQ0FBQyxJQUFJLGFBQWE7QUFDMUUsSUFBTSxnQkFBZ0IsQ0FBQyxNQUFjLEtBQUssY0FBYyxDQUFDLElBQUksYUFBYTtBQUMxRSxJQUFNLFdBQVcsQ0FBQyxNQUFjLElBQUk7QUFFcEMsU0FBUyxZQUFZLE9BQU8sTUFBYTtBQUM5QyxTQUFPO0FBQUEsSUFDTDtBQUFBLElBQ0EsUUFBUSxFQUFFLEdBQUcsZUFBZTtBQUFBLElBQzVCLFFBQVEsb0JBQUksSUFBSTtBQUFBLElBQ2hCLFVBQVUsb0JBQUksSUFBSTtBQUFBLElBQ2xCLGNBQWMsb0JBQUksSUFBSTtBQUFBLElBQ3RCLGVBQWUsb0JBQUksSUFBSTtBQUFBLElBQ3ZCLGdCQUFnQixvQkFBSSxJQUFJO0FBQUEsSUFDeEIsWUFBWSxvQkFBSSxJQUFJO0FBQUEsSUFDcEIsT0FBTyxDQUFDO0FBQUEsSUFDUixTQUFTO0FBQUEsSUFDVCxPQUFPLG9CQUFJLElBQUk7QUFBQSxJQUNmLFdBQVcsQ0FBQztBQUFBLElBQ1osT0FBTyxvQkFBSSxJQUFJO0FBQUEsSUFDZixPQUFPO0FBQUEsTUFDTCxpQkFBaUI7QUFBQSxNQUFHLGVBQWU7QUFBQSxNQUFHLGNBQWM7QUFBQSxNQUFHLGNBQWM7QUFBQSxNQUNyRSxVQUFVO0FBQUEsTUFBRyxPQUFPO0FBQUEsTUFBRyxXQUFXO0FBQUEsTUFBRyxjQUFjO0FBQUEsSUFDckQ7QUFBQSxJQUNBLGdCQUFnQjtBQUFBLElBQ2hCLFVBQVU7QUFBQSxFQUNaO0FBQ0Y7QUFFTyxTQUFTLGNBQWMsT0FBTyxNQUFNLGdCQUFnQixHQUFVO0FBQ25FLFFBQU0sUUFBUSxZQUFZLElBQUk7QUFDOUIsUUFBTSxTQUFTLEtBQUssTUFBTSxrQkFBa0IsQ0FBQztBQUM3QyxXQUFTLEtBQUssU0FBUyxlQUFlLE1BQU0sU0FBUyxlQUFlLE1BQU07QUFDeEUsYUFBUyxLQUFLLFNBQVMsZUFBZSxNQUFNLFNBQVMsZUFBZSxNQUFNO0FBQ3hFLG9CQUFjLE9BQU8sSUFBSSxFQUFFO0FBQUEsSUFDN0I7QUFBQSxFQUNGO0FBQ0EscUJBQW1CLEtBQUs7QUFDeEIsU0FBTztBQUNUO0FBR08sSUFBTSxVQUF3QjtBQUFBLEVBQ25DLEVBQUUsSUFBSSxXQUFXLE9BQU8sa0JBQWtCLE1BQU0sU0FBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksS0FBSyxJQUFJLEdBQUc7QUFBQSxFQUN2RixFQUFFLElBQUksWUFBWSxPQUFPLFlBQVksTUFBTSxVQUFVLElBQUksS0FBSyxJQUFJLE1BQU0sSUFBSSxLQUFLLElBQUksSUFBSTtBQUFBLEVBQ3pGLEVBQUUsSUFBSSxTQUFTLE9BQU8sbUJBQW1CLE1BQU0sWUFBWSxJQUFJLE1BQU0sSUFBSSxNQUFNLElBQUksS0FBSyxJQUFJLElBQUk7QUFBQSxFQUNoRyxFQUFFLElBQUksUUFBUSxPQUFPLGVBQWUsTUFBTSxTQUFTLElBQUksTUFBTSxJQUFJLE1BQU0sSUFBSSxLQUFLLElBQUksR0FBRztBQUFBLEVBQ3ZGLEVBQUUsSUFBSSxjQUFjLE9BQU8sZUFBZSxNQUFNLFNBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQUEsRUFDNUYsRUFBRSxJQUFJLFlBQVksT0FBTyxhQUFhLE1BQU0sU0FBUyxJQUFJLE1BQU0sSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLElBQUk7QUFBQSxFQUN6RixFQUFFLElBQUksU0FBUyxPQUFPLGdCQUFnQixNQUFNLFNBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQ3RGO0FBRU8sU0FBUyxhQUFhLEdBQW1CO0FBRzlDLFNBQU8sTUFBTSxLQUFLLEtBQUssS0FBSyxJQUFJLE9BQU8sR0FBRyxJQUFJLEtBQUssS0FBSyxLQUFLLElBQUksTUFBTSxFQUFFO0FBQzNFO0FBRU8sU0FBUyxjQUFjLEdBQVcsR0FBbUI7QUFDMUQsU0FBTyxLQUFLLElBQUksSUFBSSxhQUFhLENBQUMsQ0FBQztBQUNyQztBQUVPLFNBQVMsYUFBYSxHQUFXLEdBQW1CO0FBQ3pELFNBQU8sS0FBSyxPQUFPLElBQUksT0FBTyxRQUFRLE1BQU0sSUFBSSxPQUFPLE9BQU8sQ0FBQztBQUNqRTtBQVlPLFNBQVMsZ0JBQWdCLE1BQWMsR0FBVyxHQUFtQjtBQUcxRSxRQUFNLEtBQUssS0FDTixLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPLE9BQy9DLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLE9BQU87QUFDbEQsUUFBTSxLQUFLLEtBQ04sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLE9BQU8sT0FDM0QsS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLE9BQU87QUFFOUQsUUFBTSxTQUFTLEtBQUssTUFBTSxLQUFLLFFBQVEsS0FBSyxLQUFLLFFBQVEsQ0FBQztBQUMxRCxRQUFNLGNBQWMsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDLElBQUksT0FBTyxRQUNoRSxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQ3BELFFBQU0sV0FBVyxJQUFNLFNBQVM7QUFDaEMsUUFBTSxTQUFTLFdBQVcsT0FBTyxNQUFNLFFBQVE7QUFFL0MsUUFBTSxhQUFhLE1BQU0sSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUM7QUFJbkUsUUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUM7QUFDN0QsUUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBQ3hELFFBQU0sUUFBUSxNQUFNLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUNsRCxNQUFNLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQztBQUs1QyxRQUFNLGNBQWMsS0FBSyxLQUFLLE1BQU0sSUFBSSxLQUFLLE1BQU0sR0FBRyxPQUFPLEtBQUssQ0FBQztBQUNuRSxRQUFNLGFBQWEsV0FBVyxLQUFNLE1BQU0sV0FBVztBQUNyRCxRQUFNLFFBQVEsSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDO0FBQzFFLFFBQU0sU0FBUyxJQUFJLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUM7QUFDekUsUUFBTSxTQUFTLEtBQUssSUFBSSxJQUFJLEtBQUssT0FBTyxRQUFRLE1BQU0sS0FBSyxPQUFPLFFBQVEsRUFBRTtBQUM1RSxRQUFNLFFBQVEsS0FBSyxJQUFJLEdBQUcsY0FBYyxNQUFPLE1BQU8sVUFBVSxPQUFPLE1BQU07QUFFN0UsTUFBSSxJQUFJLFFBQVEsUUFBUSxRQUNwQixTQUFTLEtBQUssS0FBSyxRQUFRLFFBQVEsS0FBSztBQUs1QyxRQUFNLE9BQU8sSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDO0FBQ3ZFLFFBQU0sUUFBUSxLQUFLLElBQUksSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxHQUFHLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7QUFDOUYsUUFBTSxPQUFPLFFBQVEsSUFBTSxRQUFRO0FBRW5DLE1BQUksY0FBYyxJQUFJLGNBQWM7QUFDcEMsT0FBSyxNQUFNLFdBQVcsR0FBSyxLQUFNLFFBQVE7QUFNekMsUUFBTSxLQUFLLGNBQWMsSUFBSSxFQUFFO0FBQy9CLFFBQU0sU0FBUyxXQUFXLElBQUksSUFBSSxFQUFFLElBQUksV0FBVyxHQUFLLEtBQU0sUUFBUTtBQUN0RSxRQUFNLGNBQWMsTUFBTSxJQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQztBQUNwRSxNQUFJLEtBQUssR0FBRyxhQUFhLFNBQVMsSUFBSTtBQUN0QyxRQUFNLFNBQVMsSUFBTSxJQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQztBQUsvRCxRQUFNLFVBQVUsV0FBVyxTQUFTLElBQUksU0FBUyxLQUFLLEVBQUU7QUFDeEQsTUFBSSxXQUFXLEVBQUssS0FBSSxLQUFLLEdBQUcsSUFBTSxVQUFVLElBQUk7QUFHcEQsUUFBTSxRQUFRLGFBQWEsSUFBSSxFQUFFLEtBQzVCLElBQUksUUFBUSxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQ2hFLE1BQUksUUFBUSxNQUFNO0FBQ2hCLFVBQU0sV0FBVyxXQUFXLE1BQU0sTUFBTSxLQUFLO0FBQzdDLFFBQUksS0FBSyxHQUFHLE1BQU0sV0FBVyxJQUFJO0FBQUEsRUFDbkM7QUFLQSxRQUFNLFNBQVMsS0FBSyxPQUFPLElBQUksS0FBSyxPQUFPLE1BQU0sSUFBSSxLQUFLLE9BQU8sQ0FBQyxLQUM3RCxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxPQUFPO0FBQ2xELFFBQU0sUUFBUSxXQUFXLE1BQU0sTUFBTSxNQUFNO0FBQzNDLE1BQUksUUFBUSxHQUFHO0FBQ2IsVUFBTSxTQUFTLEtBQU8sTUFBTSxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksT0FBTyxLQUFLLENBQUMsSUFBSSxJQUFJO0FBQ3RFLFFBQUksS0FBSyxHQUFHLFFBQVEsUUFBUSxJQUFJO0FBQUEsRUFDbEM7QUFFQSxTQUFPLEtBQUssTUFBTSxNQUFNLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFDckM7QUFFQSxTQUFTLFFBQVEsTUFBYyxHQUFXLEdBQVcsR0FBbUI7QUFDdEUsU0FBTyxLQUFLO0FBQUEsSUFDVixLQUFLLElBQUksSUFBSSxnQkFBZ0IsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDNUMsS0FBSyxJQUFJLElBQUksZ0JBQWdCLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzVDLEtBQUssSUFBSSxJQUFJLGdCQUFnQixNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUM1QyxLQUFLLElBQUksSUFBSSxnQkFBZ0IsTUFBTSxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQUEsRUFDOUM7QUFDRjtBQUVBLFNBQVMsY0FBYyxNQUFjLEdBQVcsR0FBVyxHQUFXLE9BQWUsV0FBNEI7QUFJL0csTUFBSSxjQUFjLEdBQUcsQ0FBQyxJQUFJLE1BQU0sSUFBSSxZQUFZLEVBQUcsUUFBTyxJQUFJO0FBQzlELE1BQUksS0FBSyxZQUFZLElBQUssUUFBTyxJQUFJO0FBQ3JDLE1BQUksY0FBYyxRQUFXO0FBQzNCLGdCQUNFLGdCQUFnQixNQUFNLElBQUksR0FBRyxDQUFDLElBQUksWUFBWSxLQUM5QyxnQkFBZ0IsTUFBTSxJQUFJLEdBQUcsQ0FBQyxJQUFJLFlBQVksS0FDOUMsZ0JBQWdCLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxZQUFZLEtBQzlDLGdCQUFnQixNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksWUFBWTtBQUFBLEVBQ2xEO0FBQ0EsTUFBSSxhQUFhLEtBQUssWUFBWSxJQUFLLFFBQU8sSUFBSTtBQUNsRCxNQUFJLFNBQVMsRUFBRyxRQUFPLElBQUk7QUFDM0IsTUFBSSxJQUFJLE1BQU0sS0FBSyxJQUFJLElBQUksSUFBSSxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBTSxRQUFPLElBQUk7QUFDckUsTUFBSSxJQUFJLE1BQU0sU0FBUyxFQUFHLFFBQU8sSUFBSTtBQUNyQyxNQUFJLElBQUksTUFBTSxTQUFTLEtBQUssS0FBSyxJQUFJLElBQUksSUFBSSxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBTSxRQUFPLElBQUk7QUFDbkYsU0FBTyxJQUFJO0FBRWI7QUFTQSxTQUFTLFdBQVcsS0FBbUI7QUFDckMsTUFBSSxRQUFRLElBQUksU0FBUyxRQUFRLElBQUksS0FBTSxRQUFPLElBQUk7QUFDdEQsTUFBSSxRQUFRLElBQUksS0FBTSxRQUFPLElBQUk7QUFDakMsTUFBSSxRQUFRLElBQUksT0FBUSxRQUFPLElBQUk7QUFDbkMsU0FBTyxJQUFJO0FBQ2I7QUFFQSxTQUFTLE1BQU0sTUFBYyxHQUFXLEdBQVcsR0FBb0I7QUFDckUsUUFBTSxVQUFVLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQztBQUNsRCxNQUFJLFVBQVUsS0FBTSxRQUFPO0FBQzNCLFFBQU0sSUFBSSxZQUFZLElBQUksTUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNLE9BQU8sR0FBRztBQUM5RCxRQUFNLEtBQUssWUFBWSxJQUFJLE9BQU8sR0FBRyxJQUFJLE1BQU0sSUFBSSxPQUFPLEdBQUcsT0FBTyxHQUFHO0FBQ3ZFLFNBQU8sSUFBSSxPQUFRLEtBQUs7QUFDMUI7QUFFQSxTQUFTLE9BQU8sTUFBYyxHQUFXLEdBQVcsR0FBb0I7QUFDdEUsU0FBTyxLQUFLLElBQUksT0FBTyxJQUFJLE1BQU0sSUFBSSxPQUFPLE9BQU8sS0FBSyxDQUFDLElBQUk7QUFDL0Q7QUFFQSxTQUFTLFdBQVcsTUFBYyxHQUFXLEdBQVcsR0FBb0I7QUFDMUUsU0FBTyxZQUFZLElBQUksTUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNLE9BQU8sR0FBRyxJQUFJO0FBQ2pFO0FBZ0JPLFNBQVMsWUFBWSxPQUFjLElBQVksSUFBK0I7QUFDbkYsTUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLE1BQU0sbUJBQW1CLE1BQU0sZ0JBQWlCLFFBQU87QUFDL0UsUUFBTSxNQUFNLFNBQVMsSUFBSSxFQUFFO0FBQzNCLFFBQU0sV0FBVyxNQUFNLE9BQU8sSUFBSSxHQUFHO0FBQ3JDLE1BQUksU0FBVSxRQUFPO0FBQ3JCLFNBQU8sY0FBYyxPQUFPLElBQUksRUFBRTtBQUNwQztBQUVPLFNBQVMsY0FBYyxPQUFjLElBQVksSUFBK0I7QUFDckYsTUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLE1BQU0sbUJBQW1CLE1BQU0sZ0JBQWlCLFFBQU87QUFDL0UsUUFBTSxNQUFNLFNBQVMsSUFBSSxFQUFFO0FBQzNCLFFBQU0sV0FBVyxNQUFNLE9BQU8sSUFBSSxHQUFHO0FBQ3JDLE1BQUksU0FBVSxRQUFPO0FBRXJCLFFBQU0sS0FBSyxZQUFZLElBQUk7QUFDM0IsUUFBTSxPQUFPLElBQUksV0FBVyxZQUFZO0FBQ3hDLFFBQU0sVUFBVSxJQUFJLFdBQVcsVUFBVTtBQUN6QyxRQUFNLGVBQWUsSUFBSSxXQUFXLFVBQVU7QUFDOUMsUUFBTSxLQUFLLGFBQWEsRUFBRSxHQUFHLEtBQUssYUFBYSxFQUFFO0FBQ2pELFFBQU0sT0FBTyxNQUFNO0FBR25CLFFBQU0sSUFBSTtBQUNWLFFBQU0sS0FBSyxhQUFhLElBQUk7QUFDNUIsUUFBTSxRQUFRLElBQUksV0FBVyxLQUFLLEVBQUU7QUFDcEMsV0FBUyxLQUFLLEdBQUcsS0FBSyxJQUFJLE1BQU07QUFDOUIsYUFBUyxLQUFLLEdBQUcsS0FBSyxJQUFJLE1BQU07QUFDOUIsWUFBTSxLQUFLLEtBQUssRUFBRSxJQUFJLGdCQUFnQixNQUFNLEtBQUssS0FBSyxHQUFHLEtBQUssS0FBSyxDQUFDO0FBQUEsSUFDdEU7QUFBQSxFQUNGO0FBRUEsTUFBSSxTQUFTO0FBQ2IsV0FBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsWUFBTSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUs7QUFDOUIsWUFBTSxJQUFJLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxFQUFFO0FBQ3hDLFlBQU0sUUFBUSxLQUFLO0FBQUEsUUFDakIsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO0FBQUEsUUFDaEQsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO0FBQUEsUUFDaEQsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxDQUFDO0FBQUEsUUFDaEQsS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxDQUFDO0FBQUEsTUFDbEQ7QUFDQSxZQUFNLFlBQ0osT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxJQUFJLFlBQVksS0FDbEQsT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxJQUFJLFlBQVksS0FDbEQsT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxJQUFJLFlBQVksS0FDbEQsT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUssRUFBRSxJQUFJLFlBQVk7QUFDcEQsWUFBTSxNQUFNLGNBQWMsTUFBTSxJQUFJLElBQUksR0FBRyxPQUFPLFNBQVM7QUFDM0QsWUFBTSxNQUFNLFdBQVcsR0FBRztBQUMxQixZQUFNLGVBQWUsS0FBSyxLQUFLLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUk7QUFDN0QsWUFBTSxNQUFNLEtBQUssYUFBYTtBQUU5QixZQUFNLFFBQVE7QUFDZCxZQUFNLE1BQU0sS0FBSyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUM7QUFDckMsZUFBUyxJQUFJLE9BQU8sS0FBSyxLQUFLLEtBQUs7QUFDakMsY0FBTSxRQUFRLElBQUksSUFBSTtBQUN0QixZQUFJO0FBQ0osWUFBSSxNQUFNLE1BQU8sS0FBSSxJQUFJO0FBQUEsaUJBQ2hCLFVBQVUsRUFBRyxLQUFJO0FBQUEsaUJBQ2pCLFNBQVMsRUFBRyxLQUFJO0FBQUEsWUFDcEIsS0FBSSxJQUFJO0FBRWIsWUFBSSxNQUFNLElBQUksU0FBUyxRQUFRLEtBQUssZ0JBQWdCLE1BQU0sTUFBTSxJQUFJLEdBQUcsRUFBRSxHQUFHO0FBQzFFLGNBQUksSUFBSTtBQUFBLFFBQ1Y7QUFJQSxZQUFJLFNBQVMsS0FBSyxTQUFTLEtBQUssV0FBVyxNQUFNLElBQUksR0FBRyxFQUFFLEdBQUc7QUFDM0QsY0FBSSxJQUFJO0FBQUEsUUFDVjtBQUVBLFlBQUksTUFBTSxJQUFJLE9BQU8sUUFBUSxLQUFLLFFBQVEsTUFBTSxPQUFPLE1BQU0sSUFBSSxHQUFHLEVBQUUsR0FBRztBQUN2RSxjQUFJLElBQUk7QUFBQSxRQUNWO0FBRUEsWUFBSSxNQUFNLElBQUksS0FBSztBQUNqQixlQUFLLFdBQVcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSTtBQUN4QztBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBR0EsVUFBSSxJQUFJLFdBQVc7QUFDakIsaUJBQVMsSUFBSSxLQUFLLElBQUksT0FBTyxDQUFDLEdBQUcsSUFBSSxXQUFXLEtBQUs7QUFDbkQsZ0JBQU0sTUFBTSxXQUFXLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRTtBQUMxQyxjQUFJLEtBQUssR0FBRyxNQUFNLElBQUksS0FBSztBQUN6QixpQkFBSyxHQUFHLElBQUksSUFBSTtBQUNoQjtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUVBLFlBQU0sV0FBVyxLQUFLLElBQUksUUFBUSxHQUFHLEtBQUssSUFBSSxPQUFPLElBQUksQ0FBQyxDQUFDO0FBQzNELGNBQVEsR0FBRyxJQUFJLE1BQU0sV0FBVyxPQUFPLEdBQUcsZUFBZSxDQUFDO0FBQzFELG1CQUFhLEdBQUcsSUFBSTtBQUFBLElBQ3RCO0FBQUEsRUFDRjtBQUlBLFdBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNO0FBQ3RDLGFBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNO0FBQ3RDLFlBQU0sSUFBSSxPQUFPLEtBQUssS0FBSyxNQUFNLEtBQUssRUFBRTtBQUN4QyxZQUFNLFFBQVEsS0FBSztBQUFBLFFBQ2pCLEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxJQUFJLEVBQUUsQ0FBQztBQUFBLFFBQ2hELEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxJQUFJLEVBQUUsQ0FBQztBQUFBLFFBQ2hELEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxJQUFJLEtBQUssTUFBTSxLQUFLLEVBQUUsQ0FBQztBQUFBLFFBQ2hELEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxJQUFJLEtBQUssTUFBTSxLQUFLLEVBQUUsQ0FBQztBQUFBLE1BQ2xEO0FBQ0EsVUFBSSxRQUFRLEVBQUc7QUFDZixZQUFNLE9BQWdDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN2RSxpQkFBVyxDQUFDLElBQUksRUFBRSxLQUFLLE1BQU07QUFDM0IsY0FBTSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUs7QUFDOUIsWUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLE1BQU0sY0FBYyxNQUFNLFdBQVk7QUFDOUQsY0FBTSxLQUFLLE9BQU8sS0FBSyxLQUFLLE1BQU0sS0FBSyxFQUFFO0FBQ3pDLFlBQUksSUFBSSxLQUFLLEVBQUc7QUFDaEIsWUFBSSxPQUFPLElBQUksSUFBSSxLQUFLLElBQUksS0FBSyxHQUFHLE9BQU8sR0FBRyxJQUFJLEtBQU07QUFDeEQsY0FBTSxJQUFJLElBQUk7QUFDZCxZQUFJLElBQUksU0FBUyxLQUFLLEVBQUc7QUFDekIsY0FBTSxNQUFNLFdBQVcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFO0FBQzFDLFlBQUksS0FBSyxHQUFHLE1BQU0sSUFBSSxLQUFLO0FBQ3pCLGVBQUssR0FBRyxJQUFJLElBQUk7QUFDaEI7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBSUEsV0FBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsVUFBSSxXQUFXO0FBQ2YsVUFBSSxTQUFpQixhQUFhLEtBQUssYUFBYSxFQUFFO0FBQ3RELGVBQVMsSUFBSSxRQUFRLEdBQUcsS0FBSyxPQUFPLEtBQUs7QUFDdkMsY0FBTSxJQUFJLEtBQUssV0FBVyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUM5QyxZQUFJLFFBQVEsQ0FBQyxHQUFHO0FBQUUscUJBQVc7QUFBRyxtQkFBUztBQUFHO0FBQUEsUUFBTztBQUFBLE1BQ3JEO0FBQ0EsY0FBUSxLQUFLLGFBQWEsRUFBRSxJQUFJLE1BQU0sV0FBVyxPQUFPLEdBQUcsZUFBZSxDQUFDO0FBQzNFLG1CQUFhLEtBQUssYUFBYSxFQUFFLElBQUk7QUFBQSxJQUN2QztBQUFBLEVBQ0Y7QUFFQSxRQUFNLFFBQW9CO0FBQUEsSUFDeEI7QUFBQSxJQUFJO0FBQUEsSUFBSTtBQUFBLElBQUs7QUFBQSxJQUFNO0FBQUEsSUFBUztBQUFBLElBQWM7QUFBQSxJQUMxQyxPQUFPO0FBQUEsSUFDUCxhQUFhLFlBQVksSUFBSTtBQUFBLEVBQy9CO0FBR0EsUUFBTSxRQUFRLE1BQU0sTUFBTSxJQUFJLEdBQUc7QUFDakMsTUFBSSxPQUFPO0FBQ1QsZUFBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLE9BQU87QUFDNUIsWUFBTSxLQUFLLEdBQUcsSUFBSTtBQUFBLElBQ3BCO0FBRUEsYUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU07QUFDdEMsZUFBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLEtBQU0sbUJBQWtCLE9BQU8sSUFBSSxFQUFFO0FBQUEsSUFDekU7QUFBQSxFQUNGO0FBR0EsTUFBSSxlQUFlO0FBQ25CLGFBQVcsWUFBWSxNQUFNLEtBQU0sS0FBSSxhQUFhLElBQUksSUFBSztBQUM3RCxRQUFNLE1BQU0sZ0JBQWdCLGVBQWU7QUFFM0MsUUFBTSxPQUFPLElBQUksS0FBSyxLQUFLO0FBQzNCLFFBQU0sTUFBTTtBQUNaLFFBQU0sTUFBTSxnQkFBZ0I7QUFDNUIsUUFBTSxNQUFNLGdCQUFnQixZQUFZLElBQUksSUFBSTtBQUNoRCxRQUFNLE1BQU0sSUFBSSxHQUFHO0FBRW5CLG1CQUFpQixPQUFPLEtBQUs7QUFDN0IsU0FBTztBQUNUO0FBS0EsSUFBTSxrQkFBa0Isb0JBQUksUUFBK0U7QUFFM0csU0FBUyxZQUFZLE9BQWMsT0FBc0U7QUFDdkcsTUFBSSxRQUFRLGdCQUFnQixJQUFJLEtBQUs7QUFDckMsTUFBSSxDQUFDLE9BQU87QUFBRSxZQUFRLG9CQUFJLElBQUk7QUFBRyxvQkFBZ0IsSUFBSSxPQUFPLEtBQUs7QUFBQSxFQUFHO0FBQ3BFLFFBQU0sU0FBUyxNQUFNLElBQUksTUFBTSxHQUFHO0FBQ2xDLE1BQUksT0FBUSxRQUFPO0FBQ25CLFFBQU0sVUFBVSxFQUFFLFNBQVMsSUFBSSxXQUFXLE1BQU0sT0FBTyxHQUFHLGNBQWMsSUFBSSxXQUFXLE1BQU0sWUFBWSxFQUFFO0FBQzNHLFdBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNO0FBQ3RDLGFBQVMsS0FBSyxHQUFHLEtBQUssWUFBWSxNQUFNO0FBQ3RDLFlBQU0sSUFBSSxhQUFhLE1BQU0sRUFBRSxJQUFJLElBQUksSUFBSSxhQUFhLE1BQU0sRUFBRSxJQUFJO0FBQ3BFLFlBQU0sSUFBSSxnQkFBZ0IsTUFBTSxNQUFNLEdBQUcsQ0FBQztBQUMxQyxZQUFNLFFBQVEsUUFBUSxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUM7QUFDekMsWUFBTSxRQUFRLEtBQUssYUFBYTtBQUNoQyxjQUFRLFFBQVEsS0FBSyxJQUFJLE1BQU0sSUFBSSxPQUFPLEdBQUcsZUFBZSxDQUFDO0FBQzdELGNBQVEsYUFBYSxLQUFLLElBQUksY0FBYyxNQUFNLE1BQU0sR0FBRyxHQUFHLEdBQUcsS0FBSztBQUFBLElBQ3hFO0FBQUEsRUFDRjtBQUNBLFFBQU0sSUFBSSxNQUFNLEtBQUssT0FBTztBQUM1QixTQUFPO0FBQ1Q7QUFZTyxTQUFTLFNBQVMsT0FBYyxHQUFXLEdBQVcsR0FBa0I7QUFDN0UsTUFBSSxJQUFJLE1BQU8sUUFBTyxJQUFJO0FBQzFCLE1BQUksS0FBSyxNQUFPLFFBQU8sSUFBSTtBQUMzQixNQUFJLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxRQUFRLEtBQUssUUFBUSxLQUFLLEtBQU0sUUFBTyxJQUFJO0FBQ2pFLFFBQU0sS0FBSyxjQUFjLENBQUMsR0FBRyxLQUFLLGNBQWMsQ0FBQztBQUNqRCxRQUFNLFFBQVEsWUFBWSxPQUFPLElBQUksRUFBRTtBQUN2QyxNQUFJLENBQUMsTUFBTyxRQUFPLElBQUk7QUFDdkIsU0FBTyxNQUFNLEtBQUssV0FBVyxjQUFjLENBQUMsR0FBRyxTQUFTLENBQUMsR0FBRyxjQUFjLENBQUMsQ0FBQyxDQUFDO0FBQy9FO0FBRU8sU0FBUyxTQUFTLE9BQWMsR0FBVyxHQUFXLEdBQVcsR0FBbUI7QUFDekYsTUFBSSxJQUFJLFNBQVMsS0FBSyxNQUFPLFFBQU87QUFDcEMsTUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsS0FBSyxLQUFNLFFBQU87QUFDN0QsUUFBTSxLQUFLLGNBQWMsQ0FBQyxHQUFHLEtBQUssY0FBYyxDQUFDO0FBQ2pELFFBQU0sTUFBTSxXQUFXLGNBQWMsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxDQUFDO0FBQ3RFLFFBQU0sZUFBZSxNQUFNLE1BQU0sSUFBSSxTQUFTLElBQUksRUFBRSxDQUFDLEdBQUcsSUFBSSxHQUFHO0FBSS9ELE1BQUksaUJBQWlCLEVBQUcsUUFBTztBQUMvQixRQUFNLFFBQVEsWUFBWSxPQUFPLElBQUksRUFBRTtBQUN2QyxNQUFJLENBQUMsTUFBTyxRQUFPO0FBQ25CLE1BQUksUUFBUSxNQUFNLE1BQU0sSUFBSSxNQUFNLEdBQUc7QUFDckMsTUFBSSxDQUFDLE9BQU87QUFBRSxZQUFRLG9CQUFJLElBQUk7QUFBRyxVQUFNLE1BQU0sSUFBSSxNQUFNLEtBQUssS0FBSztBQUFBLEVBQUc7QUFHcEUsTUFBSSxNQUFNLEtBQUssR0FBRyxNQUFNLEdBQUc7QUFDekIsUUFBSSxDQUFDLE1BQU0sSUFBSSxHQUFHLEVBQUcsT0FBTSxJQUFJLEtBQUssQ0FBQztBQUNyQyxXQUFPO0FBQUEsRUFDVDtBQUNBLFFBQU0sS0FBSyxHQUFHLElBQUk7QUFDbEIsUUFBTSxJQUFJLEtBQUssQ0FBQztBQUNoQixRQUFNLFFBQVE7QUFDZCxRQUFNLE1BQU0sSUFBSSxNQUFNLEdBQUc7QUFDekIsUUFBTTtBQUNOLG9CQUFrQixPQUFPLGNBQWMsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxDQUFDO0FBQzNELFNBQU87QUFDVDtBQUVBLFNBQVMsa0JBQWtCLE9BQW1CLElBQVksSUFBa0I7QUFDMUUsTUFBSSxXQUFXO0FBQ2YsV0FBUyxJQUFJLFFBQVEsR0FBRyxLQUFLLE9BQU8sS0FBSztBQUN2QyxRQUFJLFFBQVEsTUFBTSxLQUFLLFdBQVcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHO0FBQUUsaUJBQVc7QUFBRztBQUFBLElBQU87QUFBQSxFQUNuRjtBQUNBLFFBQU0sUUFBUSxLQUFLLGFBQWEsRUFBRSxJQUFJLE1BQU0sV0FBVyxPQUFPLEdBQUcsZUFBZSxDQUFDO0FBQ2pGLFFBQU0sS0FBSyxNQUFNLGFBQWEsS0FBSyxhQUFhLEVBQUU7QUFDbEQsTUFBSSxZQUFZLE9BQU87QUFDckIsVUFBTSxJQUFJLE1BQU0sS0FBSyxXQUFXLElBQUksU0FBUyxRQUFRLEdBQUcsRUFBRSxDQUFDO0FBQzNELFFBQUksTUFBTSxJQUFJLE1BQU8sT0FBTSxhQUFhLEtBQUssYUFBYSxFQUFFLElBQUk7QUFBQSxFQUNsRSxPQUFPO0FBQ0wsVUFBTSxhQUFhLEtBQUssYUFBYSxFQUFFLElBQUk7QUFBQSxFQUM3QztBQUNGO0FBT08sU0FBUyxVQUFVLE9BQWMsR0FBVyxHQUFtQjtBQUNwRSxNQUFJLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxRQUFRLEtBQUssUUFBUSxLQUFLLEtBQU0sUUFBTztBQUM3RCxRQUFNLEtBQUssY0FBYyxDQUFDLEdBQUcsS0FBSyxjQUFjLENBQUM7QUFDakQsUUFBTSxRQUFRLFlBQVksT0FBTyxJQUFJLEVBQUU7QUFDdkMsTUFBSSxDQUFDLE1BQU8sUUFBTztBQUNuQixTQUFPLE1BQU0sUUFBUSxjQUFjLENBQUMsSUFBSSxhQUFhLGNBQWMsQ0FBQyxDQUFDLElBQUksUUFBUTtBQUNuRjtBQUVPLFNBQVMsbUJBQW1CLE9BQWMsR0FBVyxHQUFrQjtBQUM1RSxNQUFJLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxRQUFRLEtBQUssUUFBUSxLQUFLLEtBQU0sUUFBTyxJQUFJO0FBQ2pFLFFBQU0sS0FBSyxjQUFjLENBQUMsR0FBRyxLQUFLLGNBQWMsQ0FBQztBQUNqRCxRQUFNLFFBQVEsWUFBWSxPQUFPLElBQUksRUFBRTtBQUN2QyxNQUFJLENBQUMsTUFBTyxRQUFPLElBQUk7QUFDdkIsU0FBTyxNQUFNLGFBQWEsY0FBYyxDQUFDLElBQUksYUFBYSxjQUFjLENBQUMsQ0FBQztBQUM1RTtBQVlBLFNBQVMsVUFBVSxPQUFjLEdBQWlCO0FBQ2hELE1BQUksTUFBTSxTQUFTLElBQUksRUFBRSxFQUFFLEtBQU0sbUJBQW1CLEVBQUUsSUFBSSxLQUFLLENBQUMsY0FBYyxLQUFLLEtBQzlFLE1BQU0sZUFBZSxJQUFJLEVBQUUsRUFBRSxFQUFHO0FBQ3JDLFFBQU0sU0FBUyxJQUFJLEVBQUUsSUFBSSxDQUFDO0FBQzFCLE1BQUksT0FBTyxNQUFNLGFBQWEsSUFBSSxFQUFFLEtBQUs7QUFDekMsTUFBSSxDQUFDLE1BQU07QUFBRSxXQUFPLENBQUM7QUFBRyxVQUFNLGFBQWEsSUFBSSxFQUFFLE9BQU8sSUFBSTtBQUFBLEVBQUc7QUFDL0QsT0FBSyxLQUFLLEVBQUUsRUFBRTtBQUNkLFFBQU0sTUFBTSxXQUFXLE1BQU0sU0FBUztBQUl4QztBQVFPLFNBQVMsYUFBYSxPQUFjQyxLQUFxQjtBQUM5RCxRQUFNLElBQUksTUFBTSxTQUFTLElBQUlBLEdBQUU7QUFDL0IsTUFBSSxDQUFDLEtBQU0sbUJBQW1CLEVBQUUsSUFBSSxLQUFLLENBQUMsY0FBYyxLQUFLLEVBQUksUUFBTztBQUN4RSxRQUFNLFNBQVMsT0FBT0EsR0FBRTtBQUN4QixRQUFNLE9BQU8sTUFBTSxhQUFhLElBQUksRUFBRSxLQUFLO0FBQzNDLE1BQUksTUFBTTtBQUNSLFVBQU0sSUFBSSxLQUFLLFFBQVFBLEdBQUU7QUFDekIsUUFBSSxLQUFLLEVBQUcsTUFBSyxPQUFPLEdBQUcsQ0FBQztBQUM1QixRQUFJLEtBQUssV0FBVyxFQUFHLE9BQU0sYUFBYSxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFBQSxFQUMzRDtBQUNBLFFBQU0sY0FBYyxJQUFJLEVBQUUsS0FBSztBQUMvQixNQUFJLENBQUMsRUFBRSxTQUFVLE9BQU0sZUFBZSxJQUFJQSxHQUFFO0FBQzVDLE1BQUksRUFBRSxLQUFLLFdBQVcsV0FBVyxFQUFHLE9BQU0sTUFBTSxRQUFRLEtBQUssSUFBSSxHQUFHLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDekYsTUFBSSxFQUFFLFNBQVMsb0JBQXFCLE9BQU0sTUFBTSxZQUFZLEtBQUssSUFBSSxHQUFHLE1BQU0sTUFBTSxZQUFZLENBQUM7QUFDakcsUUFBTSxNQUFNLFdBQVcsTUFBTSxTQUFTO0FBQ3RDLFFBQU07QUFDTixTQUFPO0FBQ1Q7QUFFQSxTQUFTLFNBQVMsT0FBZSxHQUFtQjtBQUNsRCxTQUFPLEtBQUssS0FBSyxJQUFJLENBQUM7QUFDeEI7QUFFQSxTQUFTLFlBQVksSUFBWSxJQUFZLE1BQXNCO0FBQ2pFLFFBQU0sT0FBTyxLQUFLLElBQUksSUFBSSxLQUFLLE9BQU8sUUFBUSxNQUFNLEtBQUssT0FBTyxRQUFRLEVBQUU7QUFDMUUsUUFBTSxRQUFRLEtBQUssSUFBSSxJQUFJLEtBQUssTUFBTSxRQUFRLE1BQU0sS0FBSyxPQUFPLFFBQVEsRUFBRTtBQUMxRSxRQUFNLE9BQU8sS0FBSyxJQUFJLElBQUksS0FBSyxPQUFPLFFBQVEsTUFBTSxLQUFLLE9BQU8sUUFBUSxFQUFFO0FBQzFFLFFBQU0sUUFBUSxLQUFLLElBQUksSUFBSSxLQUFLLE9BQU8sUUFBUSxNQUFNLEtBQUssT0FBTyxRQUFRLEVBQUU7QUFDM0UsUUFBTSxXQUFXLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxPQUFPLEtBQUssQ0FBQztBQUN2RCxRQUFNLFNBQVMsS0FBSyxJQUFJLEdBQUcsS0FBSyxRQUFRLEtBQUssS0FBSyxRQUFRLEVBQUU7QUFDNUQsU0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLE1BQU0sT0FBTyxLQUFNLFFBQVEsSUFBSSxJQUFJLE9BQzdELFdBQVcsT0FBTyxPQUFPLFNBQVM7QUFDeEM7QUFFQSxTQUFTLFVBQVUsSUFBWSxJQUFZLE1BQXNCO0FBQy9ELFFBQU0sV0FBVyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLENBQUM7QUFDdkQsUUFBTSxRQUFRLElBQUksS0FBSyxJQUFJLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQztBQUMxRSxTQUFPLFdBQVcsT0FBTyxRQUFRO0FBQ25DO0FBRUEsU0FBUyxpQkFBaUIsT0FBYyxPQUF5QjtBQUMvRCxzQkFBb0IsT0FBTyxNQUFNLElBQUksTUFBTSxFQUFFO0FBQy9DO0FBR08sU0FBUyxvQkFBb0IsT0FBYyxJQUFZLElBQWtCO0FBQzlFLFFBQU0sTUFBTSxTQUFTLElBQUksRUFBRTtBQUMzQixNQUFJLE1BQU0sYUFBYSxJQUFJLEdBQUcsRUFBRztBQUNqQyxRQUFNLFFBQVEsWUFBWSxPQUFPLElBQUksRUFBRTtBQUN2QyxNQUFJLENBQUMsTUFBTztBQUVaLFFBQU0sTUFBTSxXQUFZLE9BQU8sTUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNLE9BQU8sR0FBRyxJQUFJLGVBQWdCLENBQUM7QUFDeEYsUUFBTSxLQUFLLGFBQWEsTUFBTSxFQUFFLEdBQUcsS0FBSyxhQUFhLE1BQU0sRUFBRTtBQUM3RCxRQUFNLFVBQVUsWUFBWSxPQUFPLEtBQUs7QUFDeEMsTUFBSSxJQUFJO0FBQ1IsTUFBSSxlQUFlO0FBQ25CLE1BQUksbUJBQW1CO0FBRXZCLFFBQU0sZUFBZSxDQUFDLElBQVksT0FBdUI7QUFDdkQsV0FBTyxRQUFRLFFBQVEsS0FBSyxhQUFhLEVBQUUsSUFBSTtBQUFBLEVBQ2pEO0FBQ0EsUUFBTSxXQUFXLENBQUMsSUFBWSxPQUFzQjtBQUNsRCxXQUFPLFFBQVEsYUFBYSxLQUFLLGFBQWEsRUFBRTtBQUFBLEVBQ2xEO0FBQ0EsUUFBTSxhQUFhLENBQUMsSUFBWSxPQUF1QjtBQUNyRCxVQUFNLElBQUksYUFBYSxJQUFJLEVBQUU7QUFDN0IsV0FBTyxLQUFLO0FBQUEsTUFDVixLQUFLLElBQUksSUFBSSxhQUFhLE1BQU0sS0FBSyxHQUFHLEdBQUcsYUFBYSxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQUEsTUFDL0QsS0FBSyxJQUFJLElBQUksYUFBYSxNQUFNLEtBQUssR0FBRyxHQUFHLGFBQWEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUFBLE1BQy9ELEtBQUssSUFBSSxJQUFJLGFBQWEsSUFBSSxNQUFNLEtBQUssR0FBRyxHQUFHLGFBQWEsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUMvRCxLQUFLLElBQUksSUFBSSxhQUFhLElBQUksTUFBTSxLQUFLLEdBQUcsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDakU7QUFBQSxFQUNGO0FBR0EsV0FBUyxLQUFLLEdBQUcsS0FBSyxZQUFZLE1BQU0sR0FBRztBQUN6QyxhQUFTLEtBQUssR0FBRyxLQUFLLFlBQVksTUFBTSxHQUFHO0FBQ3pDLFlBQU0sS0FBSyxNQUFNLEtBQUssTUFBTSxLQUFLLEtBQUssSUFBSSxJQUFJLE9BQU8sQ0FBQyxHQUFHLEdBQUcsYUFBYSxDQUFDO0FBQzFFLFlBQU0sS0FBSyxNQUFNLEtBQUssTUFBTSxLQUFLLEtBQUssSUFBSSxJQUFJLE9BQU8sQ0FBQyxHQUFHLEdBQUcsYUFBYSxDQUFDO0FBQzFFLFlBQU0sS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLO0FBQzlCLFlBQU0sSUFBSSxhQUFhLElBQUksRUFBRTtBQUM3QixVQUFJLEtBQUssWUFBWSxFQUFHO0FBQ3hCLFlBQU0sUUFBUSxXQUFXLElBQUksRUFBRTtBQUMvQixZQUFNLE1BQU0sU0FBUyxJQUFJLEVBQUU7QUFDM0IsVUFBSSxRQUFRLElBQUksTUFBTztBQUN2QixZQUFNLFNBQVMsWUFBWSxJQUFJLElBQUksTUFBTSxJQUFJO0FBQzdDLFlBQU0sUUFBUSxVQUFVLElBQUksSUFBSSxNQUFNLElBQUk7QUFDMUMsWUFBTSxPQUFPLElBQUk7QUFFakIsWUFBTSxhQUFhLFNBQVMsTUFBTyxPQUFPLFNBQVMsTUFBTyxPQUFPO0FBQ2pFLFVBQUksUUFBUSxJQUFJLFNBQVMsU0FBUyxLQUFLLE9BQU8sWUFBWTtBQUd4RCxZQUFJO0FBQ0osWUFBSTtBQUNKLGNBQU0sY0FBYyxJQUFJO0FBQ3hCLFlBQUksY0FBYyxNQUFNO0FBQ3RCLGNBQUssbUJBQW1CLElBQUssUUFBUSxlQUFlLElBQUk7QUFDdEQsbUJBQU87QUFDUCxzQkFBVSxLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUM7QUFDOUIsa0JBQU0sTUFBTTtBQUFBLFVBQ2QsT0FBTztBQUNMLG1CQUFPO0FBQ1Asc0JBQVUsS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDO0FBQzlCO0FBQ0Esa0JBQU0sTUFBTTtBQUFBLFVBQ2Q7QUFBQSxRQUNGLFdBQVcsY0FBYyxLQUFNO0FBQzdCLGlCQUFPO0FBQ1Asb0JBQVUsS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDO0FBQUEsUUFDaEMsV0FBVyxjQUFjLE1BQU07QUFDN0IsaUJBQU87QUFDUCxvQkFBVSxLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUM7QUFBQSxRQUNoQyxPQUFPO0FBQ0wsaUJBQU87QUFDUCxvQkFBVSxLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUM7QUFBQSxRQUNoQztBQUNBO0FBQ0EsY0FBTSxNQUFNO0FBQ1osa0JBQVUsT0FBTztBQUFBLFVBQ2YsSUFBSSxTQUFTLE1BQU0sS0FBSyxHQUFHO0FBQUEsVUFDM0I7QUFBQSxVQUFNLE9BQU8sTUFBTTtBQUFBLFVBQUssR0FBRyxLQUFLO0FBQUEsVUFBSyxHQUFHO0FBQUEsVUFBRyxHQUFHLEtBQUs7QUFBQSxVQUNuRCxLQUFLLEtBQUssTUFBTSxJQUFJLElBQUksRUFBRSxLQUFLLEtBQUssS0FBSztBQUFBLFVBQ3pDLE9BQU8sT0FBTyxJQUFJLElBQUk7QUFBQSxVQUFNO0FBQUEsVUFDNUIsVUFBVTtBQUFBLFVBQVEsV0FBVztBQUFBLFVBQUksaUJBQWlCO0FBQUEsVUFDbEQsV0FBVztBQUFBLFVBQU8sYUFBYTtBQUFBLFVBQU0sVUFBVTtBQUFBLFFBQ2pELENBQUM7QUFDRDtBQUFBLE1BQ0Y7QUFDQSxVQUFJLFFBQVEsSUFBSSxTQUFTLFFBQVEsUUFBUSxPQUFPLE1BQU07QUFJcEQsY0FBTSxXQUFXLElBQUk7QUFDckIsY0FBTSxPQUFtQixXQUFXLE9BQU8sb0JBQ3ZDLFdBQVcsTUFBTyxxQkFBcUI7QUFDM0MsY0FBTUEsTUFBSyxTQUFTLE1BQU0sS0FBSyxHQUFHO0FBQ2xDLGNBQU0sU0FBUztBQUFBLFVBQ2IsSUFBQUE7QUFBQSxVQUFJO0FBQUEsVUFBTSxPQUFPLE1BQU07QUFBQSxVQUFLLEdBQUcsS0FBSztBQUFBLFVBQUssR0FBRztBQUFBLFVBQUcsR0FBRyxLQUFLO0FBQUEsVUFDdkQsVUFBVTtBQUFBLFVBQ1YsV0FBVyxTQUFTLG9CQUFvQixJQUFJLFNBQVMscUJBQXFCLElBQUk7QUFBQSxVQUM5RSxpQkFBaUI7QUFBQSxVQUFHLFdBQVc7QUFBQSxVQUFPLGFBQWE7QUFBQSxVQUFNLFVBQVU7QUFBQSxVQUNuRSxLQUFLLEtBQUssTUFBTSxJQUFJLElBQUksRUFBRSxLQUFLLEtBQUssS0FBSztBQUFBLFVBQ3pDLE9BQU8sTUFBTSxJQUFJLElBQUk7QUFBQSxVQUFLLFNBQVMsS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDO0FBQUEsUUFDekQ7QUFHQSxZQUFJLGNBQWMsS0FBSyxFQUFHLFdBQVUsT0FBTyxNQUFNO0FBQ2pEO0FBQUEsTUFDRjtBQUNBLFVBQUksUUFBUSxJQUFJLFNBQVMsUUFBUSxRQUFRLE9BQU8sTUFBTTtBQUNwRCxrQkFBVSxPQUFPO0FBQUEsVUFDZixJQUFJLFNBQVMsTUFBTSxLQUFLLEdBQUc7QUFBQSxVQUMzQixNQUFNO0FBQUEsVUFBWSxPQUFPLE1BQU07QUFBQSxVQUFLLEdBQUcsS0FBSztBQUFBLFVBQUssR0FBRztBQUFBLFVBQUcsR0FBRyxLQUFLO0FBQUEsVUFDL0QsS0FBSyxLQUFLLE1BQU0sSUFBSSxJQUFJLEVBQUUsS0FBSyxLQUFLLEtBQUs7QUFBQSxVQUN6QyxPQUFPLE1BQU0sSUFBSSxJQUFJO0FBQUEsVUFBSyxTQUFTLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQztBQUFBLFVBQ3ZELFVBQVU7QUFBQSxVQUFPLFdBQVc7QUFBQSxVQUFHLGlCQUFpQjtBQUFBLFVBQ2hELFdBQVc7QUFBQSxVQUFPLGFBQWE7QUFBQSxVQUFNLFVBQVU7QUFBQSxRQUNqRCxDQUFDO0FBQ0Q7QUFBQSxNQUNGO0FBQ0EsVUFBSSxRQUFRLElBQUksU0FBUyxTQUFTLEtBQUssT0FBTyxLQUFNO0FBQ2xELGtCQUFVLE9BQU87QUFBQSxVQUNmLElBQUksU0FBUyxNQUFNLEtBQUssR0FBRztBQUFBLFVBQzNCLE1BQU07QUFBQSxVQUFjLE9BQU8sTUFBTTtBQUFBLFVBQUssR0FBRyxLQUFLO0FBQUEsVUFBSyxHQUFHO0FBQUEsVUFBRyxHQUFHLEtBQUs7QUFBQSxVQUNqRSxLQUFLLEtBQUssTUFBTSxJQUFJLElBQUksRUFBRSxLQUFLLEtBQUssS0FBSztBQUFBLFVBQ3pDLE9BQU8sTUFBTSxJQUFJLElBQUk7QUFBQSxVQUFLLFNBQVMsS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDO0FBQUEsVUFDdkQsVUFBVTtBQUFBLFVBQVMsV0FBVztBQUFBLFVBQUcsaUJBQWlCO0FBQUEsVUFDbEQsV0FBVztBQUFBLFVBQU8sYUFBYTtBQUFBLFVBQU0sVUFBVTtBQUFBLFFBQ2pELENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLFNBQVMsa0JBQWtCLE9BQWMsTUFBa0IsR0FBVyxHQUFXLFNBQWlCLEtBQWEsT0FBZSxVQUErQixXQUFtQixpQkFBK0I7QUFDN00sUUFBTSxJQUFJLFVBQVUsT0FBTyxHQUFHLENBQUM7QUFDL0IsTUFBSSxLQUFLLFVBQVc7QUFDcEIsUUFBTSxLQUFLLGNBQWMsQ0FBQyxHQUFHLEtBQUssY0FBYyxDQUFDO0FBQ2pELFFBQU0sTUFBTSxTQUFTLElBQUksRUFBRTtBQUczQixRQUFNLE1BQU0sTUFBTSxhQUFhLElBQUksR0FBRyxLQUFLLENBQUM7QUFDNUMsTUFBSSxtQkFBbUIsSUFBSSxLQUFLLENBQUMsY0FBYyxLQUFLLEVBQUc7QUFDdkQsYUFBV0EsT0FBTSxLQUFLO0FBQ3BCLFVBQU0sSUFBSSxNQUFNLFNBQVMsSUFBSUEsR0FBRTtBQUMvQixRQUFJLEtBQUssS0FBSyxNQUFNLEVBQUUsSUFBSSxHQUFHLEVBQUUsSUFBSSxDQUFDLElBQUksS0FBSztBQUMzQyxZQUFNLFNBQVMsT0FBT0EsR0FBRTtBQUN4QixVQUFJLEVBQUUsS0FBSyxXQUFXLFdBQVcsRUFBRyxPQUFNLE1BQU0sUUFBUSxLQUFLLElBQUksR0FBRyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ3pGLFVBQUksRUFBRSxTQUFTLG9CQUFxQixPQUFNLE1BQU0sWUFBWSxLQUFLLElBQUksR0FBRyxNQUFNLE1BQU0sWUFBWSxDQUFDO0FBQUEsSUFDbkc7QUFBQSxFQUNGO0FBQ0EsUUFBTSxhQUFhLElBQUksS0FBSyxJQUFJLE9BQU8sQ0FBQ0EsUUFBTyxNQUFNLFNBQVMsSUFBSUEsR0FBRSxDQUFDLENBQUM7QUFHdEUsUUFBTSxjQUFjLElBQUksR0FBRztBQUUzQixRQUFNQSxNQUFLLFFBQVEsSUFBSSxJQUFJLEtBQUssTUFBTSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQ3pELFFBQU0sU0FBUyxNQUFNLFNBQVM7QUFDOUIsUUFBTSxTQUFpQjtBQUFBLElBQ3JCLElBQUFBO0FBQUEsSUFBSTtBQUFBLElBQU0sT0FBTztBQUFBLElBQUssR0FBRyxJQUFJO0FBQUEsSUFBSztBQUFBLElBQUcsR0FBRyxJQUFJO0FBQUEsSUFDNUM7QUFBQSxJQUFLO0FBQUEsSUFBTztBQUFBLElBQVM7QUFBQSxJQUFVO0FBQUEsSUFBVztBQUFBLElBQzFDLFdBQVc7QUFBQSxJQUFPLGFBQWE7QUFBQSxJQUFNLFVBQVU7QUFBQSxFQUNqRDtBQUNBLFlBQVUsT0FBTyxNQUFNO0FBQ3ZCLE1BQUksTUFBTSxTQUFTLE9BQU8sVUFBVSxLQUFLLFdBQVcsV0FBVyxHQUFHO0FBQ2hFLFVBQU0sTUFBTTtBQUNaLFFBQUksU0FBUyxvQkFBcUIsT0FBTSxNQUFNO0FBQUEsRUFDaEQ7QUFDRjtBQUVPLFNBQVMsbUJBQW1CLE9BQW9CO0FBQ3JELE1BQUksTUFBTSxlQUFnQjtBQUMxQixRQUFNLGlCQUFpQjtBQUV2QixRQUFNLFFBQW1GO0FBQUEsSUFDdkYsRUFBRSxNQUFNLFlBQVksR0FBRyxLQUFLLEdBQUcsS0FBSyxLQUFLLEVBQUU7QUFBQSxJQUMzQyxFQUFFLE1BQU0sVUFBVSxHQUFHLEtBQUssR0FBRyxJQUFJLEtBQUssS0FBSyxLQUFLLEVBQUU7QUFBQSxFQUNwRDtBQUNBLGFBQVcsS0FBSyxPQUFPO0FBQ3JCLFVBQU0sSUFBSSxVQUFVLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQztBQUNuQyxRQUFJLEtBQUssVUFBVztBQUNwQixVQUFNLE1BQU0sS0FBSztBQUFBLE1BQ2YsSUFBSSxRQUFRLEVBQUUsSUFBSTtBQUFBLE1BQ2xCLE1BQU0sRUFBRTtBQUFBLE1BQ1IsR0FBRyxFQUFFLElBQUk7QUFBQSxNQUFLO0FBQUEsTUFBRyxHQUFHLEVBQUUsSUFBSTtBQUFBLE1BQzFCLEtBQUssRUFBRTtBQUFBLE1BQ1AsYUFBYTtBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0g7QUFLQSxRQUFNLFFBQXFFO0FBQUEsSUFDekUsQ0FBQyxtQkFBbUIsS0FBSyxLQUFLLEdBQUcsR0FBTSxDQUFDO0FBQUEsSUFDeEMsQ0FBQyxtQkFBbUIsS0FBSyxLQUFLLEdBQUcsTUFBTSxLQUFLLEtBQUssRUFBRTtBQUFBLElBQ25ELENBQUMscUJBQXFCLEtBQUssS0FBSyxHQUFHLEdBQU0sS0FBSyxLQUFLLENBQUM7QUFBQSxJQUNwRCxDQUFDLHFCQUFxQixLQUFLLEtBQUssR0FBRyxLQUFNLEtBQUssS0FBSyxDQUFDO0FBQUEsSUFDcEQsQ0FBQyxtQkFBbUIsS0FBSyxLQUFLLEdBQUcsTUFBTSxLQUFLLEtBQUssQ0FBQztBQUFBLElBQ2xELENBQUMscUJBQXFCLEtBQUssS0FBSyxHQUFHLEtBQU0sS0FBSyxLQUFLLEdBQUc7QUFBQSxFQUN4RDtBQUNBLGFBQVcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxTQUFTLE9BQU8sR0FBRyxLQUFLLE9BQU87QUFDckQsc0JBQWtCLE9BQU8sTUFBTSxHQUFHLEdBQUcsU0FBUyxLQUFLLE9BQU8sUUFBUSxJQUFJLENBQUM7QUFBQSxFQUN6RTtBQUNBLG9CQUFrQixPQUFPLG9CQUFvQixJQUFJLEtBQUssR0FBRyxHQUFHLEdBQUssU0FBUyxHQUFHLENBQUM7QUFDOUUsb0JBQWtCLE9BQU8sY0FBYyxLQUFLLElBQUksR0FBRyxLQUFLLEtBQUssSUFBSSxLQUFLLFNBQVMsR0FBRyxDQUFDO0FBQ25GLG9CQUFrQixPQUFPLGNBQWMsS0FBSyxJQUFJLEdBQUcsR0FBRyxHQUFLLFNBQVMsR0FBRyxDQUFDO0FBQ3hFLG9CQUFrQixPQUFPLFlBQVksS0FBSyxLQUFLLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxPQUFPLEdBQUcsQ0FBQztBQUNqRjtBQW1CTyxTQUFTLGNBQWMsT0FBY0MsS0FBa0M7QUFDNUUsUUFBTSxJQUFJLFdBQVcsT0FBT0EsR0FBRTtBQUM5QixNQUFJLENBQUMsS0FBSyxFQUFFLGFBQWEsQ0FBQyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUcsUUFBTztBQUNqRSxRQUFNLFNBQVMsS0FBSyxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsU0FBUztBQUN0RCxNQUFJLE1BQU0sUUFBUSxPQUFPLE9BQU8sTUFBTSxTQUFTLEVBQUUsT0FBTyxDQUFDLEtBQUssTUFBTSxNQUFNLEdBQUcsQ0FBQyxJQUFJLFNBQVMsSUFBSyxRQUFPO0FBQ3ZHLElBQUUsYUFBYTtBQUNmLE1BQUksQ0FBQyxFQUFFLFNBQVUsT0FBTSxjQUFjLElBQUksRUFBRSxLQUFLO0FBQ2hELElBQUUsZ0JBQWdCO0FBQ2xCLE1BQUksRUFBRSxhQUFhLEVBQUcsR0FBRSxZQUFZO0FBQ3BDLFFBQU0sVUFBVSxFQUFFLFFBQVEsS0FBSyxNQUFNLFVBQVUsRUFBRSxRQUFRLEtBQUssS0FBSztBQUNuRSxRQUFNO0FBQ04sU0FBTyxFQUFFLFFBQVEsR0FBRyxVQUFVLEVBQUUsVUFBVSxPQUFPO0FBQ25EO0FBSU8sU0FBUyxvQkFBb0IsT0FBb0I7QUFDdEQsYUFBVyxLQUFLLENBQUMsR0FBRyxNQUFNLFNBQVMsT0FBTyxDQUFDLEdBQUc7QUFDNUMsUUFBSSxDQUFDLG1CQUFtQixFQUFFLElBQUksRUFBRztBQUNqQyxVQUFNLFNBQVMsT0FBTyxFQUFFLEVBQUU7QUFDMUIsUUFBSSxDQUFDLEVBQUUsU0FBVSxPQUFNLGVBQWUsSUFBSSxFQUFFLEVBQUU7QUFDOUMsVUFBTSxjQUFjLElBQUksRUFBRSxLQUFLO0FBQy9CLFFBQUksQ0FBQyxNQUFNLGFBQWEsSUFBSSxFQUFFLEtBQUssRUFBRyxPQUFNLGFBQWEsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQUEsRUFDMUU7QUFDQSxhQUFXLENBQUMsS0FBSyxHQUFHLEtBQUssTUFBTSxjQUFjO0FBQzNDLFVBQU0sU0FBUyxJQUFJLE9BQU8sQ0FBQ0EsUUFBTyxNQUFNLFNBQVMsSUFBSUEsR0FBRSxDQUFDO0FBQ3hELFFBQUksT0FBTyxTQUFTLEtBQUssTUFBTSxjQUFjLElBQUksR0FBRyxFQUFHLE9BQU0sYUFBYSxJQUFJLEtBQUssTUFBTTtBQUFBLFFBQ3BGLE9BQU0sYUFBYSxPQUFPLEdBQUc7QUFBQSxFQUNwQztBQUNBLFFBQU0sTUFBTSxXQUFXLE1BQU0sU0FBUztBQUN4QztBQWVBLFNBQVMsTUFBTUMsT0FBc0I7QUFDbkMsTUFBSSxJQUFJO0FBQ1IsV0FBUyxJQUFJLEdBQUcsSUFBSUEsTUFBSyxRQUFRLEtBQUs7QUFDcEMsU0FBS0EsTUFBSyxXQUFXLENBQUM7QUFDdEIsUUFBSSxLQUFLLEtBQUssR0FBRyxRQUFVO0FBQUEsRUFDN0I7QUFDQSxVQUFRLE1BQU0sR0FBRyxTQUFTLEVBQUUsRUFBRSxTQUFTLEdBQUcsR0FBRztBQUMvQztBQUVPLFNBQVMsY0FBYyxPQUE2QjtBQUN6RCxRQUFNLElBQUksTUFBTTtBQUNoQixTQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixNQUFNLE1BQU07QUFBQSxJQUNaLGtCQUFrQixFQUFFO0FBQUEsSUFDcEIsTUFBTSxFQUFFO0FBQUEsSUFDUixXQUFXLEVBQUU7QUFBQSxJQUNiLE1BQU0sRUFBRTtBQUFBLElBQ1IsTUFBTSxFQUFFO0FBQUEsSUFDUixVQUFVLEVBQUU7QUFBQSxJQUNaLFlBQVksTUFBTSxLQUFLLFVBQVUsQ0FBQyxDQUFDO0FBQUEsRUFDckM7QUFDRjs7O0FDam5DTyxTQUFTLGNBQWMsTUFBa0I7QUFDOUMsU0FBTztBQUFBLElBQ0wsSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssRUFBRTtBQUFBLElBQzdCLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLEVBQUU7QUFBQSxJQUM3QixJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxFQUFFO0FBQUEsSUFDN0IsSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssRUFBRTtBQUFBLEVBQy9CO0FBQ0Y7QUFFTyxTQUFTLFlBQVksTUFBb0I7QUFDOUMsUUFBTSxJQUFJLGNBQWMsSUFBSTtBQUM1QixVQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLO0FBQzVDO0FBTU8sU0FBUyxXQUFXLE1BQVksUUFBc0I7QUFDM0QsU0FBTztBQUFBLElBQ0wsSUFBSSxLQUFLLEtBQUs7QUFBQSxJQUNkLElBQUksS0FBSyxLQUFLO0FBQUEsSUFDZCxJQUFJLEtBQUssS0FBSztBQUFBLElBQ2QsSUFBSSxLQUFLLEtBQUs7QUFBQSxFQUNoQjtBQUNGO0FBWU8sU0FBUyxpQkFBaUIsT0FBK0IsR0FBVyxHQUFXLEdBQW9CO0FBQ3hHLGFBQVcsS0FBSyxPQUFPO0FBQ3JCLFFBQUksS0FBSyxFQUFFLE1BQU0sS0FBSyxFQUFFLE1BQU0sS0FBSyxFQUFFLE1BQU0sS0FBSyxFQUFFLE1BQU0sS0FBSyxFQUFFLE1BQU0sS0FBSyxFQUFFLEdBQUksUUFBTztBQUFBLEVBQ3pGO0FBQ0EsU0FBTztBQUNUO0FBb0JPLElBQU0sa0JBQWtCO0FBRS9CLFNBQVMsY0FBYyxPQUFjLEdBQVcsR0FBVyxVQUEwQjtBQUNuRixNQUFJLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxRQUFRLEtBQUssUUFBUSxLQUFLLEtBQU0sUUFBTztBQUM3RCxTQUFPLFVBQVUsT0FBTyxHQUFHLENBQUM7QUFDOUI7QUFHTyxTQUFTLG1CQUFtQixPQUFjLEdBQVcsR0FBbUI7QUFDN0UsUUFBTSxVQUFVLFVBQVUsT0FBTyxHQUFHLENBQUM7QUFDckMsTUFBSSxXQUFXLFVBQVcsUUFBTztBQUNqQyxNQUFJLFNBQVMsT0FBTyxHQUFHLFlBQVksR0FBRyxDQUFDLE1BQU0sSUFBSSxNQUFPLFFBQU87QUFDL0QsU0FBTyxZQUFZO0FBQ3JCO0FBV08sU0FBUyxTQUFTLE9BQWMsR0FBVyxHQUEwQjtBQUMxRSxRQUFNLEtBQUssS0FBSyxNQUFNLENBQUMsR0FBRyxLQUFLLEtBQUssTUFBTSxDQUFDO0FBQzNDLFFBQU0sV0FBVyxVQUFVLE9BQU8sSUFBSSxFQUFFO0FBQ3hDLFFBQU0sY0FBYyxtQkFBbUIsT0FBTyxJQUFJLEVBQUU7QUFDcEQsUUFBTSxRQUFRLFdBQVcsU0FBUyxRQUFRLFdBQVc7QUFDckQsUUFBTSxhQUFhLG1CQUFtQixPQUFPLElBQUksRUFBRTtBQUNuRCxRQUFNLFFBQVEsS0FBSztBQUFBLElBQ2pCLEtBQUssSUFBSSxXQUFXLGNBQWMsT0FBTyxLQUFLLEdBQUcsSUFBSSxRQUFRLENBQUM7QUFBQSxJQUM5RCxLQUFLLElBQUksV0FBVyxjQUFjLE9BQU8sS0FBSyxHQUFHLElBQUksUUFBUSxDQUFDO0FBQUEsSUFDOUQsS0FBSyxJQUFJLFdBQVcsY0FBYyxPQUFPLElBQUksS0FBSyxHQUFHLFFBQVEsQ0FBQztBQUFBLElBQzlELEtBQUssSUFBSSxXQUFXLGNBQWMsT0FBTyxJQUFJLEtBQUssR0FBRyxRQUFRLENBQUM7QUFBQSxFQUNoRTtBQUNBLE1BQUksWUFBWTtBQUNoQixTQUFPLFlBQVksbUJBQW1CLFNBQVMsT0FBTyxJQUFJLFdBQVcsV0FBVyxFQUFFLE1BQU0sSUFBSSxLQUFLO0FBQy9GO0FBQUEsRUFDRjtBQUNBLFNBQU87QUFBQSxJQUNMLEdBQUc7QUFBQSxJQUFJLEdBQUc7QUFBQSxJQUFJO0FBQUEsSUFBVSxXQUFXLFdBQVc7QUFBQSxJQUFHO0FBQUEsSUFDakQ7QUFBQSxJQUFPO0FBQUEsSUFBWSxZQUFZLGFBQWE7QUFBQSxJQUFHO0FBQUEsSUFBTztBQUFBLEVBQ3hEO0FBQ0Y7QUFLTyxJQUFNLHFCQUF1RDtBQUFBLEVBQ2xFLGlCQUFpQjtBQUFBLEVBQ2pCLGlCQUFpQjtBQUFBLEVBQ2pCLG1CQUFtQjtBQUFBLEVBQ25CLG1CQUFtQjtBQUFBLEVBQ25CLFlBQVk7QUFBQSxFQUNaLFVBQVU7QUFBQSxFQUNWLFlBQVk7QUFBQSxFQUNaLFVBQVU7QUFBQSxFQUNWLFFBQVE7QUFDVjtBQVlBLFNBQVMsb0JBQW9CLE9BQWMsTUFBc0I7QUFDL0QsUUFBTSxJQUFJLGNBQWMsSUFBSTtBQUc1QixRQUFNLFNBQVMsS0FBSyxJQUFJLEdBQUcsT0FBTyxPQUFPLGtCQUFrQixHQUFHLEdBQUc7QUFDakUsUUFBTSxXQUFXLEtBQUssTUFBTSxFQUFFLEtBQUssTUFBTSxNQUFNO0FBQy9DLFFBQU0sV0FBVyxLQUFLLEtBQUssRUFBRSxLQUFLLE1BQU0sTUFBTSxJQUFJO0FBQ2xELFFBQU0sV0FBVyxLQUFLLE1BQU0sRUFBRSxLQUFLLE1BQU0sTUFBTTtBQUMvQyxRQUFNLFdBQVcsS0FBSyxLQUFLLEVBQUUsS0FBSyxNQUFNLE1BQU0sSUFBSTtBQUNsRCxRQUFNLE9BQWlCLENBQUM7QUFDeEIsUUFBTSxNQUFNLEtBQUssSUFBSSxHQUFHLGNBQWMsUUFBUSxDQUFDLEdBQUcsTUFBTSxjQUFjLFFBQVE7QUFDOUUsUUFBTSxNQUFNLEtBQUssSUFBSSxHQUFHLGNBQWMsUUFBUSxDQUFDLEdBQUcsTUFBTSxjQUFjLFFBQVE7QUFDOUUsV0FBUyxLQUFLLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDbEMsYUFBUyxLQUFLLEtBQUssTUFBTSxLQUFLLEtBQU0sTUFBSyxLQUFLLFNBQVMsSUFBSSxFQUFFLENBQUM7QUFBQSxFQUNoRTtBQUNBLFNBQU87QUFDVDtBQUdPLFNBQVMsZUFBZSxPQUFjLE1BQTJCO0FBQ3RFLFFBQU0sSUFBSSxjQUFjLElBQUk7QUFDNUIsUUFBTSxPQUFPLG9CQUFJLElBQVk7QUFDN0IsUUFBTSxNQUFxQixDQUFDO0FBQzVCLGFBQVcsT0FBTyxvQkFBb0IsT0FBTyxDQUFDLEdBQUc7QUFDL0MsVUFBTSxNQUFNLE1BQU0sYUFBYSxJQUFJLEdBQUc7QUFDdEMsUUFBSSxDQUFDLElBQUs7QUFDVixlQUFXQyxPQUFNLEtBQUs7QUFDcEIsVUFBSSxLQUFLLElBQUlBLEdBQUUsRUFBRztBQUNsQixZQUFNLElBQUksTUFBTSxTQUFTLElBQUlBLEdBQUU7QUFDL0IsVUFBSSxDQUFDLEtBQU0sbUJBQW1CLEVBQUUsSUFBSSxLQUFLLENBQUMsY0FBYyxLQUFLLEtBQU0sTUFBTSxlQUFlLElBQUksRUFBRSxFQUFFLEVBQUc7QUFDbkcsV0FBSyxJQUFJQSxHQUFFO0FBQ1gsWUFBTSxTQUFTLG1CQUFtQixFQUFFLElBQUksSUFDcEMsRUFBRSxTQUFTLG9CQUFvQixNQUFNLEVBQUUsU0FBUyxxQkFBcUIsTUFBTSxNQUMzRSxtQkFBbUIsRUFBRSxJQUF3QjtBQUNqRCxVQUFJLFFBQVE7QUFDWixZQUFNLE1BQU0sS0FBSyxJQUFJLEVBQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxJQUFJLFNBQVMsR0FBRyxDQUFDO0FBQ3pELFlBQU0sTUFBTSxLQUFLLElBQUksRUFBRSxJQUFJLEtBQUssS0FBSyxFQUFFLElBQUksU0FBUyxHQUFHLENBQUM7QUFDeEQsWUFBTSxNQUFNLEtBQUssSUFBSSxFQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUN6RCxZQUFNLE1BQU0sS0FBSyxJQUFJLEVBQUUsSUFBSSxLQUFLLEtBQUssRUFBRSxJQUFJLFNBQVMsR0FBRyxDQUFDO0FBQ3hELGVBQVMsSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQy9CLGlCQUFTLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSztBQUMvQixjQUFJLEtBQUssTUFBTSxFQUFFLEtBQUssSUFBSSxNQUFNLEVBQUUsS0FBSyxJQUFJLElBQUksS0FBSyxPQUFRO0FBQUEsUUFDOUQ7QUFBQSxNQUNGO0FBQ0EsVUFBSSxRQUFRLEdBQUc7QUFDYixZQUFJLEtBQUssRUFBRSxVQUFVLEVBQUUsSUFBSSxNQUFNLEVBQUUsTUFBTSxHQUFHLEVBQUUsR0FBRyxHQUFHLEVBQUUsR0FBRyxRQUFRLE1BQU0sQ0FBQztBQUFBLE1BQzFFO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDQSxNQUFJLEtBQUssQ0FBQyxHQUFHLE1BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxLQUFLLEVBQUUsV0FBVyxFQUFFLFdBQVcsSUFBSSxDQUFFO0FBQ25GLFNBQU87QUFDVDtBQW9ETyxJQUFNLGVBQU4sTUFBbUI7QUFBQSxFQUt4QixZQUE0QixPQUFjO0FBQWQ7QUFDMUIsU0FBSyxXQUFXLE1BQU07QUFBQSxFQUN4QjtBQUFBLEVBRjRCO0FBQUEsRUFKcEIsUUFBUSxvQkFBSSxJQUEyQjtBQUFBLEVBQ3ZDLG1CQUFtQixvQkFBSSxJQUEyQjtBQUFBLEVBQ2xEO0FBQUEsRUFNQSxPQUFhO0FBQ25CLFFBQUksS0FBSyxhQUFhLEtBQUssTUFBTSxVQUFVO0FBQ3pDLFdBQUssTUFBTSxNQUFNO0FBQ2pCLFdBQUssaUJBQWlCLE1BQU07QUFDNUIsV0FBSyxXQUFXLEtBQUssTUFBTTtBQUFBLElBQzdCO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFHQSxnQkFBZ0IsTUFBMkI7QUFDekMsU0FBSyxLQUFLO0FBQ1YsVUFBTSxJQUFJLGNBQWMsSUFBSTtBQUM1QixVQUFNLE1BQU0sR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUU7QUFDM0MsUUFBSSxPQUFPLEtBQUssaUJBQWlCLElBQUksR0FBRztBQUN4QyxRQUFJLENBQUMsTUFBTTtBQUNULGFBQU8sZUFBZSxLQUFLLE9BQU8sQ0FBQztBQUNuQyxXQUFLLGlCQUFpQixJQUFJLEtBQUssSUFBSTtBQUFBLElBQ3JDO0FBQ0EsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE9BQU8sR0FBVyxHQUEwQjtBQUMxQyxTQUFLLEtBQUs7QUFDVixVQUFNLEtBQUssS0FBSyxNQUFNLENBQUMsR0FBRyxLQUFLLEtBQUssTUFBTSxDQUFDO0FBQzNDLFVBQU0sTUFBTSxHQUFHLEVBQUUsSUFBSSxFQUFFO0FBQ3ZCLFFBQUksTUFBTSxLQUFLLE1BQU0sSUFBSSxHQUFHO0FBQzVCLFFBQUksQ0FBQyxLQUFLO0FBQ1IsWUFBTSxTQUFTLEtBQUssT0FBTyxJQUFJLEVBQUU7QUFDakMsV0FBSyxNQUFNLElBQUksS0FBSyxHQUFHO0FBQUEsSUFDekI7QUFDQSxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsS0FBSyxNQUFZLFFBQTRCO0FBQzNDLFNBQUssS0FBSztBQUNWLFVBQU0sSUFBSSxjQUFjLElBQUk7QUFDNUIsUUFBSSxPQUFPLE9BQU87QUFDbEIsUUFBSSxPQUFPLE9BQU87QUFDbEIsUUFBSSxNQUFNO0FBQ1YsUUFBSSxVQUFVO0FBQ2QsUUFBSSxlQUFlO0FBQ25CLFFBQUksZUFBZTtBQUNuQixRQUFJLFlBQVk7QUFDaEIsUUFBSSxhQUFhO0FBQ2pCLFFBQUksU0FBUztBQUNiLFFBQUksVUFBVTtBQUNkLFVBQU0sWUFBb0MsQ0FBQztBQUUzQyxhQUFTLElBQUksRUFBRSxJQUFJLEtBQUssRUFBRSxJQUFJLEtBQUs7QUFDakMsZUFBUyxJQUFJLEVBQUUsSUFBSSxLQUFLLEVBQUUsSUFBSSxLQUFLO0FBQ2pDLGNBQU0sTUFBTSxLQUFLLE9BQU8sR0FBRyxDQUFDO0FBQzVCLGVBQU8sS0FBSyxJQUFJLE1BQU0sSUFBSSxRQUFRO0FBQ2xDLGVBQU8sS0FBSyxJQUFJLE1BQU0sSUFBSSxRQUFRO0FBQ2xDLGVBQU8sSUFBSTtBQUNYLGtCQUFVLEtBQUssSUFBSSxTQUFTLElBQUksS0FBSztBQUNyQyxZQUFJLElBQUksYUFBYSxFQUFHO0FBQ3hCLFlBQUksSUFBSSxnQkFBZ0IsSUFBSSxNQUFPO0FBQ25DLGtCQUFVLElBQUksV0FBVyxLQUFLLFVBQVUsSUFBSSxXQUFXLEtBQUssS0FBSztBQUNqRSxZQUFJLFdBQVcsUUFBVztBQUN4QixnQkFBTSxLQUFLLElBQUksV0FBVztBQUMxQixjQUFJLEtBQUssR0FBRztBQUNWLHlCQUFhO0FBQ2IscUJBQVMsS0FBSyxJQUFJLFFBQVEsRUFBRTtBQUFBLFVBQzlCLFdBQVcsS0FBSyxHQUFHO0FBQ2pCLDBCQUFjLENBQUM7QUFDZixzQkFBVSxLQUFLLElBQUksU0FBUyxDQUFDLEVBQUU7QUFBQSxVQUNqQztBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUVBLFVBQU0sZUFBZSxLQUFLLGdCQUFnQixDQUFDO0FBQzNDLFVBQU0sYUFBYSxvQkFBSSxJQUFZO0FBQ25DLGVBQVcsS0FBSyxjQUFjO0FBQzVCLFlBQU0sU0FBUyxFQUFFO0FBQ2pCLFlBQU0sTUFBTSxLQUFLLElBQUksRUFBRSxJQUFJLEtBQUssTUFBTSxFQUFFLElBQUksU0FBUyxHQUFHLENBQUM7QUFDekQsWUFBTSxNQUFNLEtBQUssSUFBSSxFQUFFLElBQUksS0FBSyxLQUFLLEVBQUUsSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUN4RCxZQUFNLE1BQU0sS0FBSyxJQUFJLEVBQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxJQUFJLFNBQVMsR0FBRyxDQUFDO0FBQ3pELFlBQU0sTUFBTSxLQUFLLElBQUksRUFBRSxJQUFJLEtBQUssS0FBSyxFQUFFLElBQUksU0FBUyxHQUFHLENBQUM7QUFDeEQsZUFBUyxJQUFJLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFDL0IsaUJBQVMsSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQy9CLGNBQUksS0FBSyxNQUFNLEVBQUUsS0FBSyxJQUFJLE1BQU0sRUFBRSxLQUFLLElBQUksSUFBSSxLQUFLLE9BQVEsWUFBVyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtBQUFBLFFBQ3hGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFFQSxVQUFNLFdBQVcsRUFBRSxLQUFLLEVBQUUsS0FBSyxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUs7QUFDbkQsV0FBTztBQUFBLE1BQ0wsTUFBTTtBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFBTTtBQUFBLE1BQ04sT0FBTyxLQUFLLE1BQU8sTUFBTSxVQUFXLEdBQUksSUFBSTtBQUFBLE1BQzVDLFFBQVEsT0FBTztBQUFBLE1BQ2Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxtQkFBbUIsV0FBVztBQUFBLE1BQzlCLFFBQVEsVUFBVTtBQUFBLE1BQ2xCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxVQUFVLE1BQVksUUFBZ0M7QUFDcEQsVUFBTSxRQUFRLEtBQUssS0FBSyxNQUFNLE1BQU07QUFDcEMsVUFBTSxJQUFJLGNBQWMsSUFBSTtBQUM1QixVQUFNLFVBQTBCO0FBQUEsTUFDOUIsT0FBTyxNQUFNO0FBQUEsTUFBUyxPQUFPO0FBQUEsTUFBRyxLQUFLO0FBQUEsTUFBRyxNQUFNO0FBQUEsTUFBRyxPQUFPO0FBQUEsTUFBRyxVQUFVO0FBQUEsTUFDckUsUUFBUTtBQUFBLE1BQUcsU0FBUztBQUFBLE1BQUcsV0FBVztBQUFBLE1BQUcsWUFBWTtBQUFBLElBQ25EO0FBQ0EsVUFBTSxnQkFBaUQsQ0FBQztBQUV4RCxhQUFTLElBQUksRUFBRSxJQUFJLEtBQUssRUFBRSxJQUFJLEtBQUs7QUFDakMsZUFBUyxJQUFJLEVBQUUsSUFBSSxLQUFLLEVBQUUsSUFBSSxLQUFLO0FBQ2pDLGNBQU0sTUFBTSxLQUFLLE9BQU8sR0FBRyxDQUFDO0FBQzVCLGNBQU0sS0FBSyxJQUFJLFdBQVc7QUFDMUIsWUFBSSxLQUFLLEdBQUc7QUFDVixrQkFBUTtBQUNSLGtCQUFRLGFBQWE7QUFDckIsa0JBQVEsU0FBUyxLQUFLLElBQUksUUFBUSxRQUFRLEVBQUU7QUFBQSxRQUM5QyxXQUFXLEtBQUssR0FBRztBQUNqQixrQkFBUTtBQUNSLGtCQUFRLGNBQWMsQ0FBQztBQUN2QixrQkFBUSxVQUFVLEtBQUssSUFBSSxRQUFRLFNBQVMsQ0FBQyxFQUFFO0FBQy9DLGNBQUksQ0FBQyxLQUFLLEVBQUcsU0FBUTtBQUFBLFFBQ3ZCLE9BQU87QUFDTCxrQkFBUTtBQUFBLFFBQ1Y7QUFDQSxZQUFJLElBQUksYUFBYSxFQUFHLFNBQVE7QUFJaEMsY0FBTSxRQUFRLEtBQUssSUFBSSxRQUFRLElBQUksUUFBUTtBQUMzQyxpQkFBUyxJQUFJLE9BQU8sSUFBSSxRQUFRLEdBQUcsS0FBSztBQUN0QyxnQkFBTSxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsR0FBRyxDQUFDO0FBQ3RDLGNBQUksTUFBTSxJQUFJLElBQUssZUFBYyxLQUFLLEVBQUUsR0FBRyxHQUFHLEdBQUcsVUFBVSxFQUFFLENBQUM7QUFBQSxRQUNoRTtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBRUEsV0FBTyxFQUFFLE1BQU0sR0FBRyxRQUFRLE9BQU8sU0FBUyxjQUFjLE1BQU0sY0FBYyxjQUFjO0FBQUEsRUFDNUY7QUFDRjs7O0FDOVdPLElBQU0sY0FBNkI7QUFBQSxFQUN4QyxJQUFJO0FBQUEsRUFDSixPQUFPO0FBQUEsRUFDUCxPQUFPO0FBQUEsRUFDUCxZQUFZO0FBQUEsRUFDWixXQUFXO0FBQUEsRUFDWCxpQkFBaUI7QUFBQSxFQUNqQixtQkFBbUI7QUFBQSxFQUNuQixTQUFTO0FBQUEsRUFDVCxRQUFRO0FBQUEsRUFDUixTQUFTO0FBQUEsRUFDVCxjQUFjO0FBQUEsRUFDZCxlQUFlO0FBQUEsRUFDZixpQkFBaUI7QUFBQSxFQUNqQixhQUFhO0FBQUEsRUFDYixZQUFZO0FBQ2Q7QUFFTyxJQUFNLGFBQTRCO0FBQUEsRUFDdkMsSUFBSTtBQUFBLEVBQ0osT0FBTztBQUFBLEVBQ1AsT0FBTztBQUFBLEVBQ1AsWUFBWTtBQUFBLEVBQ1osV0FBVztBQUFBLEVBQ1gsaUJBQWlCO0FBQUEsRUFDakIsbUJBQW1CO0FBQUEsRUFDbkIsU0FBUztBQUFBLEVBQ1QsUUFBUTtBQUFBLEVBQ1IsU0FBUztBQUFBLEVBQ1QsY0FBYztBQUFBLEVBQ2QsZUFBZTtBQUFBLEVBQ2YsaUJBQWlCO0FBQUEsRUFDakIsYUFBYTtBQUFBLEVBQ2IsWUFBWTtBQUNkO0FBRU8sSUFBTSxhQUE0QjtBQUFBLEVBQ3ZDLElBQUk7QUFBQSxFQUNKLE9BQU87QUFBQSxFQUNQLE9BQU87QUFBQSxFQUNQLFlBQVk7QUFBQSxFQUNaLFdBQVc7QUFBQSxFQUNYLGlCQUFpQjtBQUFBLEVBQ2pCLG1CQUFtQjtBQUFBLEVBQ25CLFNBQVM7QUFBQSxFQUNULFFBQVE7QUFBQSxFQUNSLFNBQVM7QUFBQSxFQUNULGNBQWM7QUFBQSxFQUNkLGVBQWU7QUFBQSxFQUNmLGlCQUFpQjtBQUFBLEVBQ2pCLGFBQWE7QUFBQSxFQUNiLFlBQVk7QUFDZDtBQTRCQSxTQUFTLE1BQU0sTUFBc0IsU0FBaUIsT0FBZ0IsT0FBa0M7QUFDdEcsU0FBTyxFQUFFLE1BQU0sVUFBVSxTQUFTLFNBQVMsT0FBTyxNQUFNO0FBQzFEO0FBRUEsU0FBUyxLQUFLLE1BQXNCLFNBQWlCLE9BQWdCLE9BQWtDO0FBQ3JHLFNBQU8sRUFBRSxNQUFNLFVBQVUsZUFBZSxTQUFTLE9BQU8sTUFBTTtBQUNoRTtBQVFPLFNBQVMsYUFDZCxPQUFjLFVBQXdCLFFBQVEsSUFBSSxhQUFhLEtBQUssR0FDcEUsV0FDZ0I7QUFDaEIsUUFBTSxPQUFPLGNBQWMsU0FBUyxJQUFJO0FBQ3hDLFFBQU0sUUFBUSxTQUFTO0FBQ3ZCLFFBQU0sVUFBOEIsQ0FBQztBQUNyQyxRQUFNLEtBQUssYUFBYSxNQUFNLFVBQVUsTUFBTSxTQUFTLE1BQU07QUFDN0QsUUFBTSxRQUFRLEdBQUc7QUFFakIsTUFBSSxLQUFLLEtBQUssQ0FBQyxRQUFRLEtBQUssS0FBSyxDQUFDLFFBQVEsS0FBSyxNQUFNLFFBQVEsS0FBSyxNQUFNLE1BQU07QUFDNUUsWUFBUSxLQUFLLE1BQU0saUJBQWlCLGFBQWEsS0FBSyxFQUFFLElBQUksS0FBSyxFQUFFLEtBQUssS0FBSyxFQUFFLElBQUksS0FBSyxFQUFFLHVCQUF1QixDQUFDO0FBQUEsRUFDcEg7QUFDQSxNQUFJLEtBQUssS0FBSyxLQUFLLEtBQUssTUFBTSxNQUFNLFNBQVMsS0FBSyxLQUFLLEtBQUssS0FBSyxNQUFNLE1BQU0sT0FBTztBQUNsRixZQUFRLEtBQUs7QUFBQSxNQUNYO0FBQUEsTUFDQSxnQkFBZ0IsS0FBSyxLQUFLLEtBQUssS0FBSyxDQUFDLE1BQU0sS0FBSyxLQUFLLEtBQUssS0FBSyxDQUFDLE9BQU8sTUFBTSxLQUFLLE1BQU0sTUFBTSxLQUFLO0FBQUEsSUFDckcsQ0FBQztBQUFBLEVBQ0g7QUFFQSxNQUFJLE1BQU0sU0FBUyxNQUFNLG1CQUFtQjtBQUMxQyxZQUFRLEtBQUs7QUFBQSxNQUNYO0FBQUEsTUFDQSxVQUFVLE1BQU0sTUFBTSxrQkFBa0IsTUFBTSxpQkFBaUI7QUFBQSxNQUMvRCxNQUFNO0FBQUEsTUFBUSxNQUFNO0FBQUEsSUFDdEIsQ0FBQztBQUFBLEVBQ0g7QUFDQSxNQUFJLE1BQU0sVUFBVSxNQUFNLFNBQVM7QUFDakMsWUFBUSxLQUFLO0FBQUEsTUFDWDtBQUFBLE1BQ0EsZ0JBQWdCLE1BQU0sT0FBTyxjQUFjLE1BQU0sT0FBTztBQUFBLE1BQ3hELE1BQU07QUFBQSxNQUFTLE1BQU07QUFBQSxJQUN2QixDQUFDO0FBQUEsRUFDSDtBQUNBLE1BQUksTUFBTSxTQUFTLE1BQU0sUUFBUTtBQUMvQixZQUFRLEtBQUs7QUFBQSxNQUNYO0FBQUEsTUFDQSxPQUFPLE1BQU0sTUFBTSxjQUFjLE1BQU0sTUFBTTtBQUFBLE1BQzdDLE1BQU07QUFBQSxNQUFRLE1BQU07QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDSDtBQUNBLE1BQUksTUFBTSxVQUFVLE1BQU0sU0FBUztBQUNqQyxZQUFRLEtBQUs7QUFBQSxNQUNYO0FBQUEsTUFDQSxRQUFRLE1BQU0sT0FBTyxjQUFjLE1BQU0sT0FBTztBQUFBLE1BQ2hELE1BQU07QUFBQSxNQUFTLE1BQU07QUFBQSxJQUN2QixDQUFDO0FBQUEsRUFDSDtBQUNBLE1BQUksTUFBTSxZQUFZLE1BQU0sY0FBYztBQUN4QyxZQUFRLEtBQUs7QUFBQSxNQUNYO0FBQUEsTUFDQSxjQUFjLE1BQU0sU0FBUyxrQkFBZSxNQUFNLFlBQVk7QUFBQSxNQUM5RCxNQUFNO0FBQUEsTUFBVyxNQUFNO0FBQUEsSUFDekIsQ0FBQztBQUFBLEVBQ0g7QUFDQSxNQUFJLE1BQU0sYUFBYSxNQUFNLGVBQWU7QUFDMUMsWUFBUSxLQUFLO0FBQUEsTUFDWDtBQUFBLE1BQ0EsZUFBZSxNQUFNLFVBQVUsa0JBQWUsTUFBTSxhQUFhO0FBQUEsTUFDakUsTUFBTTtBQUFBLE1BQVksTUFBTTtBQUFBLElBQzFCLENBQUM7QUFBQSxFQUNIO0FBQ0EsTUFBSSxNQUFNLGVBQWUsTUFBTSxlQUFlLEdBQUc7QUFDL0MsWUFBUSxLQUFLO0FBQUEsTUFDWDtBQUFBLE1BQ0EsR0FBRyxNQUFNLFlBQVk7QUFBQSxNQUNyQixNQUFNO0FBQUEsTUFBYztBQUFBLElBQ3RCLENBQUM7QUFBQSxFQUNIO0FBQ0EsTUFBSSxNQUFNLGFBQWEsU0FBUyxNQUFNLGlCQUFpQjtBQUNyRCxZQUFRLEtBQUs7QUFBQSxNQUNYO0FBQUEsTUFDQSxHQUFHLE1BQU0sYUFBYSxNQUFNLDRCQUE0QixNQUFNLGVBQWU7QUFBQSxNQUM3RSxNQUFNLGFBQWE7QUFBQSxNQUFRLE1BQU07QUFBQSxJQUNuQyxDQUFDO0FBQUEsRUFDSDtBQUNBLE1BQUksR0FBRyxjQUFjLFNBQVMsR0FBRztBQUMvQixZQUFRLEtBQUs7QUFBQSxNQUNYO0FBQUEsTUFDQSxHQUFHLEdBQUcsY0FBYyxNQUFNO0FBQUEsTUFDMUIsR0FBRyxjQUFjO0FBQUEsTUFBUTtBQUFBLElBQzNCLENBQUM7QUFBQSxFQUNIO0FBRUEsUUFBTSxlQUFlLE1BQU0sU0FBUyxNQUFNLG1CQUNyQyxNQUFNLFlBQVksS0FBSyxNQUFNLGFBQWE7QUFDL0MsUUFBTSxnQkFBZ0IsTUFBTSxhQUFhLFNBQVMsS0FDN0MsTUFBTSxhQUFhLFVBQVUsTUFBTTtBQUV4QyxNQUFJLGNBQWM7QUFDaEIsWUFBUSxLQUFLO0FBQUEsTUFDWDtBQUFBLE1BQ0EscUJBQXFCLE1BQU0sU0FBUyxlQUFZLE1BQU0sVUFBVTtBQUFBLE1BQ2hFLE1BQU0sWUFBWSxNQUFNO0FBQUEsSUFDMUIsQ0FBQztBQUFBLEVBQ0g7QUFDQSxNQUFJLGVBQWU7QUFDakIsWUFBUSxLQUFLO0FBQUEsTUFDWDtBQUFBLE1BQ0EsR0FBRyxNQUFNLGFBQWEsTUFBTTtBQUFBLE1BQzVCLE1BQU0sYUFBYTtBQUFBLE1BQVEsTUFBTTtBQUFBLElBQ25DLENBQUM7QUFBQSxFQUNIO0FBRUEsUUFBTSxXQUFXLFFBQVEsS0FBSyxDQUFDLE1BQU0sRUFBRSxhQUFhLE9BQU87QUFDM0QsUUFBTSxVQUFVLFFBQVEsS0FBSyxDQUFDLE1BQU0sRUFBRSxhQUFhLGFBQWE7QUFDaEUsUUFBTSxRQUFtQixXQUFXLFlBQVksVUFBVSwyQkFBMkI7QUFFckYsU0FBTztBQUFBLElBQ0wsUUFBUSxTQUFTO0FBQUEsSUFDakI7QUFBQSxJQUNBO0FBQUEsSUFDQSxPQUFPO0FBQUEsSUFDUCxhQUFhO0FBQUEsTUFDWDtBQUFBLE1BQ0E7QUFBQSxNQUNBLFdBQVcsTUFBTTtBQUFBLE1BQ2pCLFlBQVksTUFBTTtBQUFBLE1BQ2xCLFFBQVEsTUFBTTtBQUFBLE1BQ2QsU0FBUyxNQUFNO0FBQUEsTUFDZixnQkFBZ0IsTUFBTSxhQUFhLElBQUksQ0FBQyxNQUFNLEVBQUUsUUFBUTtBQUFBLE1BQ3hELFlBQVksTUFBTTtBQUFBLElBQ3BCO0FBQUEsRUFDRjtBQUNGOzs7QUN2UE8sSUFBTSxrQkFBa0I7QUFDeEIsSUFBTSxvQkFBb0I7QUErQ2pDLFNBQVMsT0FBTyxPQUF1QjtBQUNyQyxNQUFJLElBQUk7QUFDUixNQUFJLElBQUk7QUFDUixXQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ3JDLFVBQU0sSUFBSSxNQUFNLFdBQVcsQ0FBQztBQUM1QixRQUFJLEtBQUssS0FBSyxJQUFJLEdBQUcsUUFBVTtBQUMvQixRQUFJLEtBQUssS0FBSyxJQUFLLElBQUksS0FBTyxVQUFVO0FBQ3hDLFNBQUssTUFBTTtBQUFBLEVBQ2I7QUFDQSxVQUFRLE1BQU0sR0FBRyxTQUFTLEVBQUUsRUFBRSxTQUFTLEdBQUcsR0FBRyxLQUN4QyxNQUFNLEdBQUcsU0FBUyxFQUFFLEVBQUUsU0FBUyxHQUFHLEdBQUc7QUFDNUM7QUFHTyxTQUFTLFdBQVcsTUFBK0I7QUFDeEQsUUFBTSxRQUFrQjtBQUFBLElBQ3RCO0FBQUEsSUFDQSxLQUFLO0FBQUEsSUFDTCxHQUFHLEtBQUssS0FBSyxFQUFFLElBQUksS0FBSyxLQUFLLEVBQUUsSUFBSSxLQUFLLEtBQUssRUFBRSxJQUFJLEtBQUssS0FBSyxFQUFFO0FBQUEsSUFDL0QsT0FBTyxLQUFLLE1BQU07QUFBQSxJQUNsQixLQUFLLE1BQU07QUFBQSxJQUNYLE9BQU8sS0FBSyxRQUFRLE1BQU07QUFBQSxJQUMxQixLQUFLLG9CQUFvQixPQUFPLGlCQUFpQixXQUFXLEtBQUssZUFBZTtBQUFBLEVBQ2xGO0FBQ0EsYUFBVyxLQUFLLEtBQUssUUFBUyxPQUFNLEtBQUssS0FBSyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRTtBQUNqRSxRQUFNLFNBQVMsQ0FBQyxHQUFHLEtBQUssY0FBYyxFQUFFLEtBQUs7QUFDN0MsUUFBTSxLQUFLLEtBQUssT0FBTyxNQUFNLEVBQUU7QUFDL0IsYUFBV0MsT0FBTSxPQUFRLE9BQU0sS0FBSyxLQUFLQSxHQUFFLEVBQUU7QUFDN0MsYUFBVyxLQUFLLGtCQUFrQixLQUFLLFFBQVEsR0FBRztBQUNoRCxVQUFNLEtBQUssS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRTtBQUFBLEVBQ2hFO0FBQ0EsUUFBTSxJQUFJLEtBQUs7QUFDZixRQUFNLEtBQUssS0FBSyxFQUFFLFNBQVMsSUFBSSxFQUFFLFVBQVUsSUFBSSxFQUFFLE1BQU0sSUFBSSxFQUFFLE9BQU8sSUFBSSxFQUFFLFlBQVksSUFBSSxFQUFFLFlBQVksSUFBSSxFQUFFLFVBQVUsRUFBRTtBQUMxSCxTQUFPLE9BQU8sTUFBTSxLQUFLLElBQUksQ0FBQztBQUNoQztBQW1CQSxTQUFTLGVBQWUsT0FBYyxNQUFZLFFBQWdDO0FBQ2hGLFFBQU0sTUFBc0IsQ0FBQztBQUM3QixXQUFTLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFDdkMsYUFBUyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFLLEtBQUksS0FBSyxFQUFFLEdBQUcsR0FBRyxHQUFHLE9BQU8sQ0FBQztBQUFBLEVBQ3ZFO0FBQ0EsU0FBTztBQUNUO0FBRUEsU0FBUyxjQUFjLFNBQWtEO0FBQ3ZFLFNBQU8sQ0FBQyxHQUFHLE9BQU8sRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDO0FBQ3hFO0FBV0EsU0FBUyxZQUFZLE9BQWMsU0FBK0M7QUFDaEYsTUFBSSxZQUFZLEdBQUcsYUFBYSxHQUFHLFNBQVMsR0FBRyxVQUFVO0FBQ3pELE1BQUksT0FBTyxPQUFPLG1CQUFtQixPQUFPLE9BQU87QUFDbkQsYUFBVyxLQUFLLFNBQVM7QUFDdkIsVUFBTSxVQUFVLFVBQVUsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDO0FBQ3pDLFdBQU8sS0FBSyxJQUFJLE1BQU0sU0FBUyxFQUFFLENBQUM7QUFDbEMsV0FBTyxLQUFLLElBQUksTUFBTSxTQUFTLEVBQUUsQ0FBQztBQUNsQyxRQUFJLFVBQVUsRUFBRSxHQUFHO0FBQ2pCLFlBQU0sSUFBSSxVQUFVLEVBQUU7QUFDdEIsbUJBQWE7QUFDYixlQUFTLEtBQUssSUFBSSxRQUFRLENBQUM7QUFBQSxJQUM3QixXQUFXLFVBQVUsRUFBRSxHQUFHO0FBQ3hCLFlBQU0sSUFBSSxFQUFFLElBQUk7QUFDaEIsb0JBQWM7QUFDZCxnQkFBVSxLQUFLLElBQUksU0FBUyxDQUFDO0FBQUEsSUFDL0I7QUFBQSxFQUNGO0FBQ0EsU0FBTyxFQUFFLFdBQVcsWUFBWSxRQUFRLFNBQVMsUUFBUSxPQUFPLEtBQUs7QUFDdkU7QUFFQSxTQUFTLGtCQUFrQixPQUFvQixPQUFnQztBQUM3RSxRQUFNLFVBQW9CLENBQUM7QUFDM0IsTUFBSSxNQUFNLFNBQVMsTUFBTSxtQkFBbUI7QUFDMUMsWUFBUSxLQUFLLFVBQVUsTUFBTSxNQUFNLGtCQUFrQixNQUFNLGlCQUFpQixtQkFBbUI7QUFBQSxFQUNqRztBQUNBLE1BQUksTUFBTSxTQUFTLE1BQU0sUUFBUTtBQUMvQixZQUFRLEtBQUssT0FBTyxNQUFNLE1BQU0sY0FBYyxNQUFNLE1BQU0sSUFBSTtBQUFBLEVBQ2hFO0FBQ0EsTUFBSSxNQUFNLFVBQVUsTUFBTSxTQUFTO0FBQ2pDLFlBQVEsS0FBSyxRQUFRLE1BQU0sT0FBTyxjQUFjLE1BQU0sT0FBTyxJQUFJO0FBQUEsRUFDbkU7QUFDQSxNQUFJLE1BQU0sWUFBWSxNQUFNLGNBQWM7QUFDeEMsWUFBUSxLQUFLLGNBQWMsTUFBTSxTQUFTLGtCQUFlLE1BQU0sWUFBWSxRQUFLO0FBQUEsRUFDbEY7QUFDQSxNQUFJLE1BQU0sYUFBYSxNQUFNLGVBQWU7QUFDMUMsWUFBUSxLQUFLLGVBQWUsTUFBTSxVQUFVLGtCQUFlLE1BQU0sYUFBYSxRQUFLO0FBQUEsRUFDckY7QUFDQSxTQUFPO0FBQ1Q7QUFLTyxTQUFTLGdCQUNkLE9BQWMsVUFBd0IsVUFBOEIsQ0FBQyxHQUN6RDtBQUNaLFFBQU0sT0FBTyxjQUFjLFNBQVMsSUFBSTtBQUN4QyxRQUFNLGFBQWEsYUFBYSxPQUFPLFFBQVE7QUFFL0MsTUFBSSxXQUFXLFVBQVUsV0FBVztBQUNsQyxXQUFPO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPO0FBQUEsTUFDUCxNQUFNO0FBQUEsTUFDTixTQUFTLFdBQVcsUUFBUSxJQUFJLENBQUMsTUFBTSxHQUFHLEVBQUUsSUFBSSxLQUFLLEVBQUUsT0FBTyxFQUFFO0FBQUEsTUFDaEU7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVBLFFBQU0sVUFBVSxjQUFjLFFBQVEsV0FBVyxlQUFlLE9BQU8sTUFBTSxTQUFTLE1BQU0sQ0FBQztBQUM3RixRQUFNLFVBQVUsWUFBWSxJQUFJO0FBQ2hDLE1BQUksUUFBUSxXQUFXLFNBQVM7QUFDOUIsV0FBTztBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sU0FBUyxDQUFDLFlBQVksUUFBUSxNQUFNLGdCQUFnQixPQUFPLFVBQVU7QUFBQSxNQUNyRTtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBRUEsUUFBTSxPQUFPLG9CQUFJLElBQVk7QUFDN0IsYUFBVyxLQUFLLFNBQVM7QUFDdkIsVUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ3pCLFFBQUksS0FBSyxJQUFJLEdBQUcsR0FBRztBQUNqQixhQUFPO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFBTyxPQUFPO0FBQUEsUUFBUSxNQUFNO0FBQUEsUUFDaEMsU0FBUyxDQUFDLHVCQUF1QixHQUFHLEVBQUU7QUFBQSxRQUFHO0FBQUEsTUFDM0M7QUFBQSxJQUNGO0FBQ0EsU0FBSyxJQUFJLEdBQUc7QUFDWixRQUFJLEVBQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxJQUFJLEtBQUssTUFBTSxFQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsSUFBSSxLQUFLLElBQUk7QUFDcEUsYUFBTztBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQU8sT0FBTztBQUFBLFFBQVEsTUFBTTtBQUFBLFFBQ2hDLFNBQVMsQ0FBQyxVQUFVLEdBQUcsZUFBZSxLQUFLLEVBQUUsSUFBSSxLQUFLLEVBQUUsS0FBSyxLQUFLLEVBQUUsSUFBSSxLQUFLLEVBQUUsRUFBRTtBQUFBLFFBQ2pGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFDQSxRQUFJLENBQUMsT0FBTyxVQUFVLEVBQUUsQ0FBQyxLQUFLLEVBQUUsSUFBSSxTQUFTLEVBQUUsS0FBSyxPQUFPO0FBQ3pELGFBQU87QUFBQSxRQUNMLElBQUk7QUFBQSxRQUFPLE9BQU87QUFBQSxRQUFRLE1BQU07QUFBQSxRQUNoQyxTQUFTLENBQUMsVUFBVSxHQUFHLHVCQUF1QixFQUFFLENBQUMsRUFBRTtBQUFBLFFBQUc7QUFBQSxNQUN4RDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBRUEsUUFBTSxlQUFlLFdBQVcsWUFBWTtBQUM1QyxRQUFNLFFBQVEsUUFBUSxTQUFTO0FBQy9CLE1BQUksVUFBVSxVQUFVLGFBQWEsU0FBUyxHQUFHO0FBQy9DLFdBQU87QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLFNBQVMsQ0FBQyxHQUFHLGFBQWEsTUFBTSw0QkFBNEI7QUFBQSxNQUM1RDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0EsUUFBTSxpQkFBaUIsVUFBVSxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLFlBQVksQ0FBQyxFQUFFLEtBQUs7QUFDL0UsUUFBTSxrQkFBa0IsUUFBUSxtQkFBbUI7QUFFbkQsUUFBTSxnQkFBZ0IsUUFBUSxZQUFZO0FBQzFDLFFBQU0sUUFBUSxnQkFDVixZQUFZLE9BQU8sT0FBTyxJQUMxQjtBQUFBLElBQ0EsV0FBVyxXQUFXLFlBQVk7QUFBQSxJQUNsQyxZQUFZLFdBQVcsWUFBWTtBQUFBLElBQ25DLFFBQVEsV0FBVyxZQUFZO0FBQUEsSUFDL0IsU0FBUyxXQUFXLFlBQVk7QUFBQSxJQUNoQyxRQUFRLFdBQVcsTUFBTSxNQUFNO0FBQUEsRUFDakM7QUFDRixNQUFJLGVBQWU7QUFDakIsVUFBTSxVQUFVLGtCQUFrQixPQUFPLFNBQVMsS0FBSztBQUN2RCxRQUFJLFFBQVEsU0FBUyxHQUFHO0FBQ3RCLGFBQU87QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVBLE1BQUksS0FBSyxPQUFPO0FBQ2hCLE1BQUksS0FBSyxPQUFPO0FBQ2hCLGFBQVcsS0FBSyxTQUFTO0FBQ3ZCLFVBQU0sVUFBVSxVQUFVLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQztBQUN6QyxTQUFLLEtBQUssSUFBSSxJQUFJLFNBQVMsRUFBRSxDQUFDO0FBQzlCLFNBQUssS0FBSyxJQUFJLElBQUksVUFBVSxHQUFHLEVBQUUsSUFBSSxDQUFDO0FBQUEsRUFDeEM7QUFDQSxRQUFNLFdBQVcsV0FBVyxNQUFNLENBQUM7QUFDbkMsUUFBTSxVQUF1QjtBQUFBLElBQzNCLElBQUksS0FBSyxJQUFJLENBQUMsTUFBTSxTQUFTLEVBQUU7QUFBQSxJQUMvQixJQUFJLEtBQUssSUFBSSxDQUFDLE1BQU0sU0FBUyxFQUFFO0FBQUEsSUFDL0IsSUFBSSxLQUFLLElBQUksT0FBTyxHQUFHLFNBQVMsRUFBRTtBQUFBLElBQ2xDLElBQUksS0FBSyxJQUFJLE9BQU8sR0FBRyxTQUFTLEVBQUU7QUFBQSxJQUNsQyxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQztBQUFBLElBQzFCLElBQUksS0FBSyxJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUM7QUFBQSxFQUNoQztBQUlBLFFBQU0sV0FBVyxrQkFBa0IsUUFBUSxZQUFZLENBQUMsT0FBTyxDQUFDO0FBQ2hFLFFBQU0sZUFBZSxvQkFBb0IsT0FBTyxJQUFJLFFBQVE7QUFFNUQsUUFBTSxPQUF3QjtBQUFBLElBQzVCLElBQUk7QUFBQSxJQUNKLFFBQVEsU0FBUztBQUFBLElBQ2pCO0FBQUEsSUFDQSxRQUFRLFNBQVM7QUFBQSxJQUNqQixPQUFPLFNBQVM7QUFBQSxJQUNoQjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsVUFBVTtBQUFBLE1BQ1IsV0FBVyxNQUFNO0FBQUEsTUFDakIsWUFBWSxNQUFNO0FBQUEsTUFDbEIsUUFBUSxNQUFNO0FBQUEsTUFDZCxTQUFTLE1BQU07QUFBQSxNQUNmLGNBQWMsZUFBZTtBQUFBLE1BQzdCO0FBQUEsTUFDQSxZQUFZLE1BQU0sWUFBWSxNQUFNLGFBQWE7QUFBQSxJQUNuRDtBQUFBLEVBQ0Y7QUFDQSxPQUFLLEtBQUssUUFBUSxXQUFXLElBQUksQ0FBQztBQUNsQyxTQUFPLEVBQUUsSUFBSSxNQUFNLE1BQU0sV0FBVztBQUN0QztBQVdPLElBQU0saUJBQXNDO0FBQUEsRUFDakQsY0FBYztBQUFBLEVBQ2QsZUFBZTtBQUFBLEVBQ2YsZUFBZTtBQUFBLEVBQ2YsbUJBQW1CO0FBQUEsRUFDbkIsWUFBWTtBQUNkO0FBd0JBLFNBQVMsZ0JBQWdCLFFBQXFCLFFBQXlDO0FBQ3JGLFNBQU8sT0FBTyxLQUFLLENBQUMsTUFBTSxPQUFPLE1BQU0sRUFBRSxNQUFNLE9BQU8sTUFBTSxFQUFFLE1BQ3pELE9BQU8sTUFBTSxFQUFFLE1BQU0sT0FBTyxNQUFNLEVBQUUsTUFDcEMsT0FBTyxNQUFNLEVBQUUsTUFBTSxPQUFPLE1BQU0sRUFBRSxFQUFFO0FBQzdDO0FBT08sSUFBTSxrQkFBTixNQUFzQjtBQUFBLEVBSzNCLFlBQXFCLFFBQTZCO0FBQTdCO0FBQ25CLFNBQUssU0FBUyxFQUFFLEdBQUcsZ0JBQWdCLEdBQUksT0FBTyxVQUFVLENBQUMsRUFBRztBQUFBLEVBQzlEO0FBQUEsRUFGcUI7QUFBQSxFQUpaLFlBQVk7QUFBQSxFQUNaLGNBQWM7QUFBQSxFQUNkO0FBQUEsRUFNVCxVQUFVLE9BQWMsTUFBOEM7QUFDcEUsVUFBTSxVQUFvQixDQUFDO0FBQzNCLFVBQU0sT0FBTyxjQUFjLEtBQUssSUFBSTtBQUVwQyxRQUFJLEtBQUssUUFBUSxXQUFXLFlBQVksSUFBSSxHQUFHO0FBQzdDLGNBQVEsS0FBSyxZQUFZLEtBQUssUUFBUSxNQUFNLGdCQUFnQixZQUFZLElBQUksQ0FBQyxVQUFVO0FBQUEsSUFDekY7QUFDQSxRQUFJLEtBQUssUUFBUSxTQUFTLEtBQUssT0FBTyxZQUFZO0FBQ2hELGNBQVEsS0FBSyxHQUFHLEtBQUssUUFBUSxNQUFNLHlCQUF5QixLQUFLLE9BQU8sVUFBVSxFQUFFO0FBQUEsSUFDdEY7QUFDQSxRQUFJLEtBQUssU0FBUyxZQUFZLEtBQUssT0FBTyxjQUFjO0FBQ3RELGNBQVEsS0FBSyxPQUFPLEtBQUssU0FBUyxTQUFTLGtCQUFrQixLQUFLLE9BQU8sWUFBWSxFQUFFO0FBQUEsSUFDekY7QUFDQSxRQUFJLEtBQUssU0FBUyxhQUFhLEtBQUssT0FBTyxlQUFlO0FBQ3hELGNBQVEsS0FBSyxRQUFRLEtBQUssU0FBUyxVQUFVLGtCQUFrQixLQUFLLE9BQU8sYUFBYSxFQUFFO0FBQUEsSUFDNUY7QUFDQSxRQUFJLEtBQUssU0FBUyxhQUFhLEtBQUssT0FBTyxlQUFlO0FBQ3hELGNBQVEsS0FBSyw4QkFBOEIsS0FBSyxPQUFPLGFBQWEsRUFBRTtBQUFBLElBQ3hFO0FBQ0EsUUFBSSxLQUFLLGVBQWUsU0FBUyxLQUFLLE9BQU8sbUJBQW1CO0FBQzlELGNBQVEsS0FBSyxHQUFHLEtBQUssZUFBZSxNQUFNLDBCQUEwQixLQUFLLE9BQU8saUJBQWlCLEVBQUU7QUFBQSxJQUNyRztBQUNBLFFBQUksSUFBSSxJQUFJLEtBQUssY0FBYyxFQUFFLFNBQVMsS0FBSyxlQUFlLFFBQVE7QUFDcEUsY0FBUSxLQUFLLDhCQUE4QjtBQUFBLElBQzdDO0FBRUEsUUFBSSxLQUFLLFNBQVMsV0FBVyxHQUFHO0FBQzlCLGNBQVEsS0FBSywyQkFBMkI7QUFBQSxJQUMxQztBQUNBLGVBQVcsVUFBVSxLQUFLLFVBQVU7QUFDbEMsVUFBSSxDQUFDLGdCQUFnQixRQUFRLEtBQUssT0FBTyxRQUFRLEdBQUc7QUFDbEQsZ0JBQVEsS0FBSyxZQUFZLE9BQU8sRUFBRSxJQUFJLE9BQU8sRUFBRSxJQUFJLE9BQU8sRUFBRSxLQUFLLE9BQU8sRUFBRSxJQUFJLE9BQU8sRUFBRSxJQUFJLE9BQU8sRUFBRSw4QkFBOEI7QUFBQSxNQUNwSTtBQUFBLElBQ0Y7QUFDQSxlQUFXLEtBQUssS0FBSyxTQUFTO0FBQzVCLFVBQUksQ0FBQyxpQkFBaUIsS0FBSyxVQUFVLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEtBQzVDLEVBQUUsSUFBSSxTQUFTLENBQUMsaUJBQWlCLEtBQUssVUFBVSxFQUFFLEdBQUcsRUFBRSxJQUFJLEdBQUcsRUFBRSxDQUFDLEdBQUk7QUFDekUsZ0JBQVEsS0FBSyxVQUFVLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxzQ0FBc0M7QUFBQSxNQUNoRjtBQUFBLElBQ0Y7QUFJQSxVQUFNLFVBQVUsZUFBZSxPQUFPLElBQUksRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxLQUFLO0FBQ3hFLFVBQU0sVUFBVSxDQUFDLEdBQUcsS0FBSyxjQUFjLEVBQUUsS0FBSztBQUM5QyxRQUFJLFFBQVEsV0FBVyxRQUFRLFVBQVUsUUFBUSxLQUFLLENBQUNBLEtBQUksTUFBTUEsUUFBTyxRQUFRLENBQUMsQ0FBQyxHQUFHO0FBQ25GLGNBQVEsS0FBSyxrQkFBa0IsUUFBUSxLQUFLLEdBQUcsQ0FBQywwQ0FBMEMsUUFBUSxLQUFLLEdBQUcsQ0FBQyxHQUFHO0FBQUEsSUFDaEg7QUFFQSxRQUFJLFFBQVEsU0FBUyxFQUFHLFFBQU8sRUFBRSxJQUFJLE9BQU8sZUFBZSxNQUFNLFFBQVE7QUFFekUsVUFBTSxRQUEyQjtBQUFBLE1BQy9CLElBQUksY0FBYyxXQUFXLElBQUksQ0FBQztBQUFBLE1BQ2xDLFdBQVc7QUFBQSxNQUNYLGFBQWE7QUFBQSxNQUNiLFlBQVksV0FBVyxJQUFJO0FBQUEsTUFDM0IsVUFBVSxrQkFBa0IsS0FBSyxRQUFRO0FBQUEsTUFDekMsY0FBYyxNQUFNO0FBQUEsTUFDcEIsUUFBUSxFQUFFLEdBQUcsS0FBSyxPQUFPO0FBQUEsSUFDM0I7QUFDQSxXQUFPLEVBQUUsSUFBSSxNQUFNLGVBQWUsT0FBTyxTQUFTLENBQUMsRUFBRTtBQUFBLEVBQ3ZEO0FBQ0Y7QUFnRUEsSUFBTSxpQkFBeUM7QUFBQSxFQUM3QyxDQUFDLElBQUksS0FBSyxHQUFHO0FBQUEsRUFDYixDQUFDLElBQUksSUFBSSxHQUFHO0FBQUEsRUFDWixDQUFDLElBQUksSUFBSSxHQUFHO0FBQUEsRUFDWixDQUFDLElBQUksTUFBTSxHQUFHO0FBQUEsRUFDZCxDQUFDLElBQUksS0FBSyxHQUFHO0FBQUEsRUFDYixDQUFDLElBQUksR0FBRyxHQUFHO0FBQUEsRUFDWCxDQUFDLElBQUksS0FBSyxHQUFHO0FBQUEsRUFDYixDQUFDLElBQUksT0FBTyxHQUFHO0FBQUEsRUFDZixDQUFDLElBQUksSUFBSSxHQUFHO0FBQ2Q7QUFFQSxTQUFTLGFBQWEsR0FBa0I7QUFDdEMsU0FBTyxlQUFlLENBQUMsS0FBSyxPQUFPLENBQUM7QUFDdEM7QUFFQSxTQUFTLGFBQWEsR0FBVyxRQUF1QjtBQUN0RCxTQUFPLE1BQU0sU0FBUyxJQUFJLElBQUksUUFBUSxJQUFJO0FBQzVDO0FBRUEsU0FBUyxLQUFLLE9BQW9DLE1BQWMsU0FBdUM7QUFDckcsU0FBTyxFQUFFLElBQUksT0FBTyxPQUFPLE1BQU0sUUFBUTtBQUMzQztBQU1PLFNBQVMsbUJBQ2QsT0FBYyxNQUF1QixlQUNqQjtBQUNwQixNQUFJLGNBQWMsY0FBYyxtQkFDM0IsY0FBYyxnQkFBZ0IsbUJBQW1CO0FBQ3BELFdBQU8sS0FBSyxXQUFXLHlCQUF5QjtBQUFBLE1BQzlDLGFBQWEsY0FBYyxTQUFTLElBQUksY0FBYyxXQUFXO0FBQUEsSUFDbkUsQ0FBQztBQUFBLEVBQ0g7QUFDQSxNQUFJLGNBQWMsZUFBZSxXQUFXLElBQUksR0FBRztBQUNqRCxXQUFPLEtBQUssV0FBVyxtQkFBbUIsQ0FBQyx3Q0FBd0MsQ0FBQztBQUFBLEVBQ3RGO0FBQ0EsTUFBSSxjQUFjLGlCQUFpQixNQUFNLFVBQVU7QUFDakQsV0FBTyxLQUFLLFdBQVcsdUJBQXVCO0FBQUEsTUFDNUMsd0NBQXdDLGNBQWMsWUFBWSxpQkFBaUIsTUFBTSxRQUFRO0FBQUEsSUFDbkcsQ0FBQztBQUFBLEVBQ0g7QUFDQSxNQUFJLEtBQUssU0FBUyxLQUFLLENBQUMsTUFBTSxDQUFDLGdCQUFnQixHQUFHLGNBQWMsUUFBUSxDQUFDLEdBQUc7QUFDMUUsV0FBTyxLQUFLLFdBQVcscUJBQXFCLENBQUMsK0NBQStDLENBQUM7QUFBQSxFQUMvRjtBQUVBLFFBQU0sT0FBTyxjQUFjLEtBQUssSUFBSTtBQUNwQyxRQUFNLFFBQXVCLENBQUM7QUFDOUIsYUFBVyxLQUFLLEtBQUssU0FBUztBQUM1QixVQUFNLFVBQVUsVUFBVSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDekMsUUFBSSxFQUFFLElBQUksU0FBUztBQUNqQixlQUFTLElBQUksRUFBRSxHQUFHLElBQUksU0FBUyxLQUFLO0FBQ2xDLGNBQU0sU0FBUyxTQUFTLE9BQU8sRUFBRSxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQzFDLFlBQUksUUFBUSxNQUFNLEVBQUcsT0FBTSxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxRQUFRLE9BQU8sSUFBSSxJQUFJLENBQUM7QUFBQSxNQUMvRTtBQUFBLElBQ0YsV0FBVyxFQUFFLElBQUksU0FBUztBQUN4QixlQUFTLElBQUksU0FBUyxJQUFJLEVBQUUsR0FBRyxLQUFLO0FBQ2xDLGNBQU0sU0FBUyxTQUFTLE9BQU8sRUFBRSxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQzFDLFlBQUksQ0FBQyxRQUFRLE1BQU0sR0FBRztBQUNwQixnQkFBTSxRQUFRLEtBQUssb0JBQW9CLFFBQVEsTUFBTSxFQUFFLElBQUksSUFDdkQsS0FBSyxrQkFDTCxhQUFhLEdBQUcsRUFBRSxDQUFDO0FBQ3ZCLGdCQUFNLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLFFBQVEsTUFBTSxDQUFDO0FBQUEsUUFDakQ7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUdBLFFBQUksS0FBSyxvQkFBb0IsTUFBTTtBQUNqQyxZQUFNLE9BQU8sRUFBRSxJQUFJO0FBQ25CLFlBQU0sU0FBUyxTQUFTLE9BQU8sRUFBRSxHQUFHLE1BQU0sRUFBRSxDQUFDO0FBQzdDLFVBQUksUUFBUSxNQUFNLEtBQUssV0FBVyxLQUFLLGlCQUFpQjtBQUN0RCxjQUFNLEtBQUs7QUFBQSxVQUNULEdBQUcsRUFBRTtBQUFBLFVBQUcsR0FBRztBQUFBLFVBQU0sR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQVEsT0FBTyxLQUFLO0FBQUEsVUFBaUIsU0FBUztBQUFBLFFBQ3pFLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFHQSxRQUFNLFVBQW9CLENBQUM7QUFDM0IsYUFBVyxLQUFLLE9BQU87QUFDckIsUUFBSSxFQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxJQUFJLEtBQUssTUFBTSxFQUFFLElBQUksS0FBSyxJQUFJO0FBQ3BFLGNBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQywyQkFBMkI7QUFBQSxJQUNuRTtBQUNBLFFBQUksQ0FBQyxpQkFBaUIsY0FBYyxVQUFVLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUc7QUFDNUQsY0FBUSxLQUFLLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLHFDQUFxQztBQUFBLElBQzdFO0FBQUEsRUFDRjtBQUNBLFFBQU0sWUFBWSxNQUFNLE9BQU8sQ0FBQyxNQUFNLEVBQUUsVUFBVSxJQUFJLE9BQU8sUUFBUSxFQUFFLE1BQU0sQ0FBQyxFQUFFO0FBQ2hGLFFBQU0sYUFBYSxNQUFNLE9BQU8sQ0FBQyxNQUFNLEVBQUUsVUFBVSxJQUFJLE9BQU8sQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLEVBQUU7QUFDbEYsTUFBSSxZQUFZLGNBQWMsT0FBTyxjQUFjO0FBQ2pELFlBQVEsS0FBSyxPQUFPLFNBQVMsa0JBQWtCLGNBQWMsT0FBTyxZQUFZLEVBQUU7QUFBQSxFQUNwRjtBQUNBLE1BQUksYUFBYSxjQUFjLE9BQU8sZUFBZTtBQUNuRCxZQUFRLEtBQUssUUFBUSxVQUFVLGtCQUFrQixjQUFjLE9BQU8sYUFBYSxFQUFFO0FBQUEsRUFDdkY7QUFDQSxNQUFJLE1BQU0sU0FBUyxjQUFjLE9BQU8sZUFBZTtBQUNyRCxZQUFRLEtBQUssR0FBRyxNQUFNLE1BQU0sdUJBQXVCLGNBQWMsT0FBTyxhQUFhLEVBQUU7QUFBQSxFQUN6RjtBQUVBLFFBQU0sVUFBVSxlQUFlLE9BQU8sSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLEtBQUs7QUFDeEUsUUFBTSxVQUFVLENBQUMsR0FBRyxLQUFLLGNBQWMsRUFBRSxLQUFLO0FBQzlDLE1BQUksUUFBUSxXQUFXLFFBQVEsVUFBVSxRQUFRLEtBQUssQ0FBQ0EsS0FBSSxNQUFNQSxRQUFPLFFBQVEsQ0FBQyxDQUFDLEdBQUc7QUFDbkYsWUFBUSxLQUFLLG9EQUFvRDtBQUFBLEVBQ25FO0FBQ0EsTUFBSSxLQUFLLGVBQWUsU0FBUyxjQUFjLE9BQU8sbUJBQW1CO0FBQ3ZFLFlBQVEsS0FBSyxHQUFHLEtBQUssZUFBZSxNQUFNLDBCQUEwQixjQUFjLE9BQU8saUJBQWlCLEVBQUU7QUFBQSxFQUM5RztBQUNBLGFBQVdBLE9BQU0sS0FBSyxnQkFBZ0I7QUFDcEMsUUFBSSxDQUFDLE1BQU0sU0FBUyxJQUFJQSxHQUFFLEVBQUcsU0FBUSxLQUFLLFVBQVVBLEdBQUUsbUJBQW1CO0FBQUEsRUFDM0U7QUFDQSxNQUFJLE1BQU0sTUFBTTtBQUNkLFFBQUksWUFBWTtBQUNoQixlQUFXQSxPQUFNLEtBQUssZ0JBQWdCO0FBQ3BDLFlBQU0sU0FBUyxNQUFNLFNBQVMsSUFBSUEsR0FBRTtBQUNwQyxVQUFJLFFBQVEsWUFBWSxPQUFPLFlBQVksRUFBRyxjQUFhLE9BQU87QUFBQSxJQUNwRTtBQUdBLFFBQUksT0FBTyxPQUFPLE1BQU0sU0FBUyxFQUFFLE9BQU8sQ0FBQyxLQUFLLFdBQVcsTUFBTSxRQUFRLENBQUMsSUFBSSxZQUFZLEtBQUs7QUFDN0YsY0FBUSxLQUFLLDRFQUE0RTtBQUFBLElBQzNGO0FBQUEsRUFDRjtBQUNBLE1BQUksUUFBUSxTQUFTLEVBQUcsUUFBTyxLQUFLLFdBQVcsc0JBQXNCLE9BQU87QUFFNUUsUUFBTSxrQkFBa0Isa0JBQWtCLEtBQUs7QUFDL0MsUUFBTSxpQkFBaUIsTUFBTTtBQUM3QixRQUFNLGNBQWMsb0JBQUksSUFBd0I7QUFDaEQsUUFBTSxnQkFBd0MsQ0FBQztBQUMvQyxRQUFNLGlCQUF5QyxDQUFDO0FBQ2hELE1BQUksVUFBVTtBQUNkLE1BQUksZUFBZTtBQUVuQixhQUFXLEtBQUssT0FBTztBQUNyQixRQUFJLENBQUMsU0FBUyxPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFHO0FBQzlDO0FBQ0EsUUFBSSxFQUFFLFFBQVM7QUFDZixVQUFNLE1BQU0sU0FBUyxjQUFjLEVBQUUsQ0FBQyxHQUFHLGNBQWMsRUFBRSxDQUFDLENBQUM7QUFDM0QsUUFBSSxRQUFRLFlBQVksSUFBSSxHQUFHO0FBQy9CLFFBQUksQ0FBQyxPQUFPO0FBQ1YsY0FBUSxFQUFFLE9BQU8sS0FBSyxTQUFTLEdBQUcsT0FBTyxHQUFHLFNBQVMsRUFBRTtBQUN2RCxrQkFBWSxJQUFJLEtBQUssS0FBSztBQUFBLElBQzVCO0FBQ0EsVUFBTTtBQUNOLFVBQU0sV0FBVyxRQUFRLEVBQUUsTUFBTTtBQUNqQyxVQUFNLGFBQWEsUUFBUSxFQUFFLEtBQUs7QUFDbEMsUUFBSSxDQUFDLFlBQVksV0FBWSxPQUFNO0FBQ25DLFFBQUksWUFBWSxDQUFDLFdBQVksT0FBTTtBQUNuQyxVQUFNLE9BQU8sYUFBYSxFQUFFLE1BQU07QUFDbEMsUUFBSSxZQUFZLENBQUMsV0FBWSxlQUFjLElBQUksS0FBSyxjQUFjLElBQUksS0FBSyxLQUFLO0FBQ2hGLFFBQUksQ0FBQyxZQUFZLFdBQVksZ0JBQWUsYUFBYSxFQUFFLEtBQUssQ0FBQyxLQUFLLGVBQWUsYUFBYSxFQUFFLEtBQUssQ0FBQyxLQUFLLEtBQUs7QUFBQSxFQUN0SDtBQUVBLFFBQU0sa0JBQW1DLENBQUM7QUFDMUMsUUFBTSxrQkFBeUQsQ0FBQztBQUNoRSxhQUFXQSxPQUFNLENBQUMsR0FBRyxLQUFLLGNBQWMsRUFBRSxLQUFLLEdBQUc7QUFDaEQsVUFBTSxJQUFJLE1BQU0sU0FBUyxJQUFJQSxHQUFFO0FBQy9CLFFBQUksQ0FBQyxFQUFHO0FBQ1IsVUFBTSxTQUFTLEVBQUUsWUFBWSxFQUFFLFlBQVksSUFBSSxFQUFFLFlBQVk7QUFDN0QsUUFBSSxFQUFFLFlBQVksU0FBUyxHQUFHO0FBQzVCLFlBQU0sVUFBVSxFQUFFLFFBQVEsS0FBSyxNQUFNLFVBQVUsRUFBRSxRQUFRLEtBQUssS0FBSztBQUNuRSxzQkFBZ0IsRUFBRSxRQUFRLEtBQUssZ0JBQWdCLEVBQUUsUUFBUSxLQUFLLEtBQUs7QUFBQSxJQUNyRTtBQUNBLGlCQUFhLE9BQU9BLEdBQUU7QUFDdEIsb0JBQWdCLEtBQUs7QUFBQSxNQUNuQixVQUFVQTtBQUFBLE1BQUksTUFBTSxFQUFFO0FBQUEsTUFBTSxVQUFVLEVBQUU7QUFBQSxNQUFVO0FBQUEsTUFBUSxHQUFHLEVBQUU7QUFBQSxNQUFHLEdBQUcsRUFBRTtBQUFBLE1BQUcsR0FBRyxFQUFFO0FBQUEsSUFDakYsQ0FBQztBQUFBLEVBQ0g7QUFFQSxRQUFNLE1BQU0sVUFBVSxJQUFJLE9BQU8sT0FBTyxhQUFhLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxJQUFJLEdBQUcsQ0FBQyxJQUFJO0FBQ3BGLFFBQU0sT0FBTyxVQUFVLElBQUksT0FBTyxPQUFPLGNBQWMsRUFBRSxPQUFPLENBQUMsR0FBRyxNQUFNLElBQUksR0FBRyxDQUFDLElBQUk7QUFDdEYsUUFBTSxTQUE0QjtBQUFBLElBQ2hDLFdBQVc7QUFBQSxJQUNYLGFBQWE7QUFBQSxJQUNiLGlCQUFpQixjQUFjO0FBQUEsSUFDL0IsWUFBWSxjQUFjO0FBQUEsSUFDMUIsUUFBUSxLQUFLO0FBQUEsSUFDYjtBQUFBLElBQ0EsUUFBUSxLQUFLO0FBQUEsSUFDYixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixVQUFVLE1BQU07QUFBQSxJQUNoQixjQUFjLEtBQUssSUFBSSxHQUFHLE9BQU8sR0FBRztBQUFBLElBQ3BDO0FBQUEsSUFDQTtBQUFBLElBQ0EsWUFBWTtBQUFBLElBQ1o7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBLGdCQUFnQixrQkFBa0IsS0FBSztBQUFBLElBQ3ZDLGFBQWEsQ0FBQyxHQUFHLFlBQVksT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLE1BQU0sY0FBYyxFQUFFLEtBQUssQ0FBQztBQUFBLElBQ3BGO0FBQUEsSUFDQSxlQUFlLE1BQU07QUFBQSxFQUN2QjtBQUNBLFNBQU8sRUFBRSxJQUFJLE1BQU0sTUFBTSxlQUFlLE9BQU87QUFDakQ7QUFLTyxTQUFTLFlBQ2QsT0FDQSxZQUNBLFVBQ0EsVUFBOEIsQ0FBQyxHQUNYO0FBQ3BCLFFBQU0sVUFBVSxnQkFBZ0IsT0FBTyxVQUFVLE9BQU87QUFDeEQsTUFBSSxDQUFDLFFBQVEsR0FBSSxRQUFPO0FBQ3hCLFFBQU0sV0FBVyxXQUFXLFVBQVUsT0FBTyxRQUFRLElBQUk7QUFDekQsTUFBSSxDQUFDLFNBQVMsTUFBTSxDQUFDLFNBQVMsZUFBZTtBQUMzQyxXQUFPLEtBQUssYUFBYSxrQkFBa0IsU0FBUyxPQUFPO0FBQUEsRUFDN0Q7QUFDQSxTQUFPLG1CQUFtQixPQUFPLFFBQVEsTUFBTSxTQUFTLGFBQWE7QUFDdkU7OztBQzNzQk8sSUFBTSx5QkFBeUI7QUFtRi9CLElBQU0sYUFBb0QsRUFBRSxNQUFNLElBQUksT0FBTyxHQUFHO0FBQ2hGLElBQU0sZUFBc0QsRUFBRSxNQUFNLEdBQUcsT0FBTyxHQUFHO0FBR2pGLFNBQVMsU0FBUyxPQUFzRDtBQUM3RSxTQUFPLEVBQUUsT0FBTyxNQUFNO0FBQ3hCO0FBMEJBLFNBQVNDLFFBQU8sT0FBdUI7QUFDckMsTUFBSSxJQUFJO0FBQ1IsTUFBSSxJQUFJO0FBQ1IsV0FBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUNyQyxVQUFNLElBQUksTUFBTSxXQUFXLENBQUM7QUFDNUIsUUFBSSxLQUFLLEtBQUssSUFBSSxHQUFHLFFBQVU7QUFDL0IsUUFBSSxLQUFLLEtBQUssSUFBSyxJQUFJLEtBQU8sVUFBVTtBQUN4QyxTQUFLLE1BQU07QUFBQSxFQUNiO0FBQ0EsVUFBUSxNQUFNLEdBQUcsU0FBUyxFQUFFLEVBQUUsU0FBUyxHQUFHLEdBQUcsS0FDeEMsTUFBTSxHQUFHLFNBQVMsRUFBRSxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQzVDO0FBRU8sU0FBUyxnQkFBZ0IsTUFBNkI7QUFDM0QsUUFBTSxRQUFrQjtBQUFBLElBQ3RCO0FBQUEsSUFDQSxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxHQUFHLEtBQUssS0FBSyxFQUFFLElBQUksS0FBSyxLQUFLLEVBQUUsSUFBSSxLQUFLLEtBQUssRUFBRSxJQUFJLEtBQUssS0FBSyxFQUFFO0FBQUEsSUFDL0QsT0FBTyxLQUFLLE1BQU07QUFBQSxJQUNsQixHQUFHLEtBQUssT0FBTyxDQUFDLElBQUksS0FBSyxPQUFPLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQztBQUFBLElBQ2xELE9BQU8sS0FBSyxHQUFHO0FBQUEsSUFDZixHQUFJLEtBQUssa0JBQWtCLHlCQUF5QixDQUFDLFVBQVUsSUFBSSxDQUFDO0FBQUEsSUFDcEUsS0FBSyxLQUFLLFFBQVEsTUFBTTtBQUFBLEVBQzFCO0FBQ0EsYUFBVyxLQUFLLEtBQUssU0FBUztBQUM1QixVQUFNLEtBQUssS0FBSyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUU7QUFBQSxFQUNsRztBQUNBLFFBQU0sV0FBVyxPQUFPLEtBQUssS0FBSyxJQUFJLEVBQUUsS0FBSztBQUM3QyxRQUFNLEtBQUssUUFBUSxTQUFTLE1BQU0sRUFBRTtBQUNwQyxhQUFXLE9BQU8sU0FBVSxPQUFNLEtBQUssUUFBUSxHQUFHLElBQUksS0FBSyxLQUFLLEdBQW1CLEtBQUssQ0FBQyxFQUFFO0FBQzNGLGFBQVcsS0FBSyxLQUFLLFFBQVMsT0FBTSxLQUFLLEtBQUssRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUU7QUFDakUsYUFBVyxLQUFLLEtBQUssWUFBWSxDQUFDLEVBQUcsT0FBTSxLQUFLLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUU7QUFDMUUsU0FBT0EsUUFBTyxNQUFNLEtBQUssSUFBSSxDQUFDO0FBQ2hDO0FBaUJBLFNBQVNDLE1BQUssT0FBa0MsTUFBYyxTQUFxQztBQUNqRyxTQUFPLEVBQUUsSUFBSSxPQUFPLE9BQU8sTUFBTSxRQUFRO0FBQzNDO0FBRUEsU0FBUyxrQkFBa0IsT0FBYyxTQUFtQztBQUMxRSxRQUFNLE1BQXlFLENBQUM7QUFDaEYsYUFBVyxLQUFLLFNBQVM7QUFDdkIsVUFBTSxTQUFTLFVBQVUsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDO0FBQ3hDLFFBQUksV0FBVyxFQUFFLEVBQUcsS0FBSSxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsR0FBRyxFQUFFLEdBQUcsVUFBVSxFQUFFLEdBQUcsT0FBTyxDQUFDO0FBQUEsRUFDeEU7QUFDQSxTQUFPO0FBQ1Q7QUFFQSxTQUFTLGlCQUFpQixPQUFjLE1BQVksR0FBNEI7QUFDOUUsUUFBTSxNQUF1QixDQUFDO0FBQzlCLFdBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksS0FBSztBQUN2QyxhQUFTLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLElBQUssS0FBSSxLQUFLLEVBQUUsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUFBLEVBQy9EO0FBQ0EsU0FBTztBQUNUO0FBRUEsU0FBUyxrQkFBa0IsTUFBWSxJQUFZLElBQVksU0FBUyxHQUFrQjtBQUN4RixRQUFNLElBQUksV0FBVyxNQUFNLE1BQU07QUFDakMsU0FBTyxDQUFDLEVBQUUsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDO0FBQzFCO0FBRUEsU0FBUyxhQUFhLEdBQWdHO0FBQ3BILFFBQU0sSUFBSSxLQUFLLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJO0FBQ2pDLFFBQU0sU0FBUyxFQUFFLE9BQU8sT0FBTyxJQUFJLEVBQUUsSUFBSSxJQUFJO0FBQzdDLFFBQU0sU0FBUyxFQUFFLE9BQU8sT0FBTyxJQUFJLEVBQUUsSUFBSSxJQUFJO0FBQzdDLFNBQU87QUFBQSxJQUNMLElBQUksRUFBRSxJQUFJO0FBQUEsSUFBTyxJQUFJLEVBQUUsSUFBSTtBQUFBLElBQzNCLElBQUksRUFBRTtBQUFBLElBQUcsSUFBSSxFQUFFLElBQUksRUFBRTtBQUFBLElBQ3JCLElBQUksRUFBRSxJQUFJO0FBQUEsSUFBTyxJQUFJLEVBQUUsSUFBSTtBQUFBLEVBQzdCO0FBQ0Y7QUFFQSxTQUFTLHFCQUFxQixHQUFvQixVQUEyQztBQUMzRixRQUFNLElBQUksYUFBYSxDQUFDO0FBQ3hCLFNBQU8sU0FBUyxLQUFLLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxLQUFLLFFBQVEsRUFBRSxNQUFNLEVBQUUsS0FBSyxJQUFJLFFBQ2pFLEVBQUUsTUFBTSxFQUFFLEtBQUssUUFBUSxFQUFFLE1BQU0sRUFBRSxLQUFLLElBQUksUUFDMUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxRQUFRLEVBQUUsTUFBTSxFQUFFLEtBQUssSUFBSSxJQUFJO0FBQ3JEO0FBRUEsU0FBUyxVQUFVLE1BQXFEO0FBQ3RFLFNBQU8sT0FBTyxPQUFPLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxNQUFNLEtBQUssS0FBSyxJQUFJLENBQUM7QUFDN0Q7QUFFQSxTQUFTLE9BQU8sUUFBMEI7QUFDeEMsUUFBTSxTQUFTLENBQUMsR0FBRyxNQUFNLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxJQUFJLENBQUM7QUFDL0MsU0FBTyxPQUFPLEtBQUssTUFBTSxPQUFPLFNBQVMsQ0FBQyxDQUFDO0FBQzdDO0FBR0EsU0FBUyxVQUFVLE9BQWMsVUFBa0Q7QUFDakYsUUFBTSxPQUFPLGNBQWMsU0FBUyxJQUFJO0FBQ3hDLFFBQU0sUUFBUSxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQ2xDLFFBQU0sUUFBUSxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQ2xDLE1BQUksVUFBVSxLQUFLLFVBQVUsR0FBRztBQUM5QixXQUFPQSxNQUFLLFFBQVEsc0JBQXNCLENBQUMsNEJBQTRCLEtBQUssTUFBTSxLQUFLLElBQUksQ0FBQztBQUFBLEVBQzlGO0FBQ0EsTUFBSSxDQUFDLFNBQVMsTUFBTTtBQUNsQixXQUFPQSxNQUFLLFFBQVEsZ0JBQWdCLENBQUMsZ0NBQWdDLENBQUM7QUFBQSxFQUN4RTtBQUNBLE1BQUksU0FBUyxLQUFLLElBQUksS0FBSyxNQUFNLFNBQVMsS0FBSyxJQUFJLEtBQUssSUFBSTtBQUMxRCxXQUFPQSxNQUFLLFFBQVEsZ0JBQWdCLENBQUMsVUFBVSxTQUFTLEtBQUssQ0FBQyxlQUFlLEtBQUssRUFBRSxLQUFLLEtBQUssRUFBRSxFQUFFLENBQUM7QUFBQSxFQUNyRztBQUVBLFFBQU0sVUFBVSxpQkFBaUIsT0FBTyxNQUFNLFNBQVMsTUFBTTtBQUM3RCxRQUFNLGFBQWEsa0JBQWtCLE9BQU8sT0FBTztBQUNuRCxNQUFJLFdBQVcsU0FBUyxHQUFHO0FBQ3pCLFdBQU9BLE1BQUssUUFBUSxxQkFBcUIsV0FBVyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQUEsTUFDOUQsQ0FBQyxNQUFNLFVBQVUsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxNQUFNLGNBQWMsRUFBRSxRQUFRO0FBQUEsSUFDdkUsQ0FBQztBQUFBLEVBQ0g7QUFDQSxRQUFNLGVBQWUsZUFBZSxPQUFPLElBQUk7QUFDL0MsTUFBSSxhQUFhLFNBQVMsR0FBRztBQUMzQixXQUFPQSxNQUFLLFFBQVEsbUJBQW1CLGFBQWEsSUFBSSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUM7QUFBQSxFQUM1RTtBQUVBLFFBQU0sU0FBUyxTQUFTO0FBQ3hCLFFBQU0sS0FBSyxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUs7QUFDbkMsUUFBTSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSztBQUNuQyxRQUFNLE1BQU0sS0FBSyxNQUFNO0FBQ3ZCLFFBQU0sTUFBTSxLQUFLLE1BQU07QUFDdkIsUUFBTSxRQUFRLFNBQVMsS0FBSyxJQUFJO0FBQ2hDLFFBQU0sV0FBVztBQUNqQixRQUFNLFFBQVE7QUFDZCxRQUFNLFFBQVE7QUFDZCxRQUFNLFFBQVE7QUFDZCxRQUFNLFVBQTZCLENBQUM7QUFHcEMsVUFBUSxLQUFLLEVBQUUsTUFBTSxTQUFTLEdBQUcsSUFBSSxHQUFHLFFBQVEsR0FBRyxJQUFJLEdBQUcsR0FBSyxHQUFHLEtBQUssR0FBRyxHQUFLLE1BQU0sVUFBVSxDQUFDO0FBQ2hHLFVBQVEsS0FBSyxFQUFFLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxTQUFTLE9BQU8sR0FBRyxJQUFJLEdBQUcsS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLE1BQU0sUUFBUSxDQUFDO0FBR3JHLFVBQVEsS0FBSyxFQUFFLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxRQUFRLEdBQUcsS0FBSyxRQUFRLEdBQUcsR0FBRyxHQUFLLEdBQUcsT0FBTyxHQUFHLE9BQU8sTUFBTSxRQUFRLENBQUM7QUFDN0csVUFBUSxLQUFLLEVBQUUsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLFFBQVEsR0FBRyxLQUFLLFFBQVEsR0FBRyxHQUFHLEdBQUssR0FBRyxPQUFPLEdBQUcsT0FBTyxNQUFNLFFBQVEsQ0FBQztBQUc3RyxVQUFRLEtBQUssRUFBRSxNQUFNLFFBQVEsR0FBRyxLQUFLLFFBQVEsR0FBRyxHQUFHLFFBQVEsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLE9BQU8sR0FBRyxHQUFLLE1BQU0sUUFBUSxDQUFDO0FBRzdHLFFBQU0sUUFBUSxLQUFLLFFBQVE7QUFDM0IsUUFBTSxPQUFPLFFBQVE7QUFDckIsUUFBTSxPQUFPLFFBQVE7QUFDckIsUUFBTSxVQUFVLE9BQU87QUFDdkIsUUFBTSxXQUFXLEtBQUs7QUFDdEIsTUFBSSxVQUFVLE1BQU07QUFDbEIsWUFBUSxLQUFLO0FBQUEsTUFDWCxNQUFNO0FBQUEsTUFBUSxHQUFHO0FBQUEsTUFBTyxHQUFHO0FBQUEsTUFBUSxHQUFHLEtBQUssVUFBVTtBQUFBLE1BQ3JELEdBQUc7QUFBQSxNQUFPLEdBQUc7QUFBQSxNQUFPLEdBQUc7QUFBQSxNQUFTLE1BQU07QUFBQSxJQUN4QyxDQUFDO0FBQUEsRUFDSDtBQUNBLE1BQUksV0FBVyxNQUFNO0FBQ25CLFlBQVEsS0FBSztBQUFBLE1BQ1gsTUFBTTtBQUFBLE1BQVEsR0FBRztBQUFBLE1BQU8sR0FBRztBQUFBLE1BQVEsR0FBRyxPQUFPLFdBQVc7QUFBQSxNQUN4RCxHQUFHO0FBQUEsTUFBTyxHQUFHO0FBQUEsTUFBTyxHQUFHO0FBQUEsTUFBVSxNQUFNO0FBQUEsSUFDekMsQ0FBQztBQUFBLEVBQ0g7QUFDQSxVQUFRLEtBQUs7QUFBQSxJQUNYLE1BQU07QUFBQSxJQUFVLEdBQUc7QUFBQSxJQUFPLEdBQUcsU0FBUztBQUFBLElBQU8sR0FBRztBQUFBLElBQ2hELEdBQUc7QUFBQSxJQUFPLEdBQUcsUUFBUTtBQUFBLElBQU8sR0FBRyxXQUFXO0FBQUEsSUFBRyxNQUFNO0FBQUEsRUFDckQsQ0FBQztBQUNELFVBQVEsS0FBSztBQUFBLElBQ1gsTUFBTTtBQUFBLElBQVEsR0FBRztBQUFBLElBQU8sR0FBRztBQUFBLElBQVEsR0FBRztBQUFBLElBQ3RDLEdBQUc7QUFBQSxJQUFNLEdBQUc7QUFBQSxJQUFPLEdBQUc7QUFBQSxJQUFNLE1BQU07QUFBQSxFQUNwQyxDQUFDO0FBQ0QsVUFBUSxLQUFLO0FBQUEsSUFDWCxNQUFNO0FBQUEsSUFBUSxHQUFHO0FBQUEsSUFBTyxHQUFHO0FBQUEsSUFBUSxHQUFHO0FBQUEsSUFDdEMsR0FBRztBQUFBLElBQU0sR0FBRztBQUFBLElBQU8sR0FBRztBQUFBLElBQU0sTUFBTTtBQUFBLEVBQ3BDLENBQUM7QUFDRCxVQUFRLEtBQUs7QUFBQSxJQUNYLE1BQU07QUFBQSxJQUFhLEdBQUcsS0FBSztBQUFBLElBQU0sR0FBRztBQUFBLElBQVEsR0FBRztBQUFBLElBQy9DLEdBQUc7QUFBQSxJQUFLLEdBQUc7QUFBQSxJQUFNLEdBQUc7QUFBQSxJQUFLLE1BQU07QUFBQSxFQUNqQyxDQUFDO0FBR0QsYUFBVyxNQUFNLENBQUMsS0FBSyxLQUFLLEtBQUssR0FBRyxHQUFHO0FBQ3JDLFlBQVEsS0FBSztBQUFBLE1BQ1gsTUFBTTtBQUFBLE1BQVUsR0FBRztBQUFBLE1BQUksR0FBRyxTQUFTO0FBQUEsTUFBTSxHQUFHLEtBQUs7QUFBQSxNQUNqRCxHQUFHO0FBQUEsTUFBSyxHQUFHO0FBQUEsTUFBSyxHQUFHO0FBQUEsTUFBTSxNQUFNO0FBQUEsSUFDakMsQ0FBQztBQUFBLEVBQ0g7QUFHQSxVQUFRLEtBQUssRUFBRSxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsU0FBUyxRQUFRLEtBQUssR0FBRyxLQUFLLE1BQU0sR0FBRyxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssTUFBTSxVQUFVLENBQUM7QUFDdkgsVUFBUSxLQUFLLEVBQUUsTUFBTSxXQUFXLEdBQUcsSUFBSSxHQUFHLFNBQVMsUUFBUSxLQUFLLEdBQUcsS0FBSyxNQUFNLEdBQUcsS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLE1BQU0sVUFBVSxDQUFDO0FBQ3ZILFVBQVEsS0FBSyxFQUFFLE1BQU0sV0FBVyxHQUFHLEtBQUssTUFBTSxHQUFHLFNBQVMsUUFBUSxLQUFLLEdBQUcsSUFBSSxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsS0FBSyxNQUFNLFVBQVUsQ0FBQztBQUN2SCxVQUFRLEtBQUssRUFBRSxNQUFNLFdBQVcsR0FBRyxLQUFLLE1BQU0sR0FBRyxTQUFTLFFBQVEsS0FBSyxHQUFHLElBQUksR0FBRyxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssTUFBTSxVQUFVLENBQUM7QUFFdkgsUUFBTSxPQUFzQjtBQUFBLElBQzFCLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLFFBQVEsU0FBUztBQUFBLElBQ2pCO0FBQUEsSUFDQTtBQUFBLElBQ0EsUUFBUSxFQUFFLEdBQUcsSUFBSSxHQUFHLFFBQVEsR0FBRyxHQUFHO0FBQUEsSUFDbEMsS0FBSztBQUFBLElBQ0w7QUFBQSxJQUNBLE1BQU0sRUFBRSxHQUFHLFdBQVc7QUFBQSxJQUN0QixVQUFVLGtCQUFrQixNQUFNLFFBQVEsU0FBUyxHQUFHLENBQUM7QUFBQSxJQUN2RDtBQUFBLEVBQ0Y7QUFDQSxPQUFLLEtBQUssYUFBYSxnQkFBZ0IsSUFBSSxDQUFDO0FBQzVDLFNBQU8sRUFBRSxJQUFJLE1BQU0sS0FBSztBQUMxQjtBQUdBLFNBQVMsU0FBUyxPQUFjLFVBQWtEO0FBQ2hGLFFBQU0sT0FBTyxjQUFjLFNBQVMsSUFBSTtBQUN4QyxRQUFNLFFBQVEsS0FBSyxLQUFLLEtBQUssS0FBSztBQUNsQyxRQUFNLFFBQVEsS0FBSyxLQUFLLEtBQUssS0FBSztBQUNsQyxNQUFJLFVBQVUsS0FBSyxRQUFRLEdBQUc7QUFDNUIsV0FBT0EsTUFBSyxRQUFRLHNCQUFzQixDQUFDLHVDQUF1QyxLQUFLLE1BQU0sS0FBSyxJQUFJLENBQUM7QUFBQSxFQUN6RztBQUVBLFFBQU0sVUFBVSxLQUFLLEtBQUs7QUFDMUIsUUFBTSxVQUEyQixDQUFDO0FBQ2xDLFFBQU0sVUFBb0IsQ0FBQztBQUMzQixXQUFTLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFDdkMsVUFBTSxJQUFJLFVBQVUsT0FBTyxHQUFHLE9BQU87QUFDckMsWUFBUSxLQUFLLENBQUM7QUFDZCxhQUFTLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLElBQUssU0FBUSxLQUFLLEVBQUUsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUFBLEVBQ25FO0FBQ0EsUUFBTSxhQUFhLGtCQUFrQixPQUFPLE9BQU87QUFDbkQsTUFBSSxXQUFXLFNBQVMsR0FBRztBQUN6QixXQUFPQSxNQUFLLFFBQVEscUJBQXFCLFdBQVcsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUFBLE1BQzlELENBQUMsTUFBTSxVQUFVLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLEVBQUUsTUFBTSxjQUFjLEVBQUUsUUFBUTtBQUFBLElBQ3ZFLENBQUM7QUFBQSxFQUNIO0FBQ0EsV0FBUyxJQUFJLEdBQUcsSUFBSSxRQUFRLFFBQVEsS0FBSztBQUN2QyxVQUFNLE9BQU8sUUFBUSxDQUFDLElBQUksUUFBUSxJQUFJLENBQUM7QUFDdkMsUUFBSSxLQUFLLElBQUksSUFBSSxJQUFJLEdBQUc7QUFDdEIsYUFBT0EsTUFBSyxRQUFRLGFBQWEsQ0FBQyxRQUFRLElBQUksV0FBVyxLQUFLLEtBQUssQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUN6RTtBQUFBLEVBQ0Y7QUFDQSxhQUFXLEtBQUssU0FBUztBQUN2QixVQUFNLE1BQU0sU0FBUyxPQUFPLEVBQUUsR0FBRyxFQUFFLElBQUksR0FBRyxFQUFFLENBQUM7QUFDN0MsUUFBSSxRQUFRLElBQUksT0FBTztBQUNyQixhQUFPQSxNQUFLLFFBQVEsWUFBWSxDQUFDLFVBQVUsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLFNBQVMsQ0FBQztBQUFBLElBQ2pFO0FBQ0EsUUFBSSxRQUFRLElBQUksUUFBUTtBQUN0QixhQUFPQSxNQUFLLFFBQVEsZ0JBQWdCO0FBQUEsUUFDbEMsVUFBVSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsV0FBVyxHQUFHO0FBQUEsTUFDcEMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNGO0FBQ0EsUUFBTSxlQUFlLGVBQWUsT0FBTyxJQUFJO0FBQy9DLE1BQUksYUFBYSxTQUFTLEdBQUc7QUFDM0IsV0FBT0EsTUFBSyxRQUFRLG1CQUFtQixhQUFhLElBQUksQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDO0FBQUEsRUFDNUU7QUFFQSxRQUFNLEtBQUssVUFBVTtBQUNyQixRQUFNLFVBQTZCLENBQUM7QUFDcEMsV0FBUyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3ZDLFVBQU0sSUFBSSxVQUFVLE9BQU8sR0FBRyxPQUFPO0FBQ3JDLFVBQU0sS0FBSyxJQUFJO0FBQ2YsWUFBUSxLQUFLLEVBQUUsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLEdBQUcsSUFBSSxHQUFHLEdBQUssR0FBRyxNQUFNLEdBQUcsR0FBSyxNQUFNLFNBQVMsQ0FBQztBQUN2RixZQUFRLEtBQUssRUFBRSxNQUFNLFFBQVEsR0FBRyxJQUFJLEdBQUcsR0FBRyxLQUFLLEtBQUssT0FBTyxHQUFHLEdBQUssR0FBRyxNQUFNLEdBQUcsTUFBTSxNQUFNLFVBQVUsQ0FBQztBQUN0RyxZQUFRLEtBQUssRUFBRSxNQUFNLFFBQVEsR0FBRyxJQUFJLEdBQUcsR0FBRyxLQUFLLEtBQUssSUFBSSxPQUFPLEdBQUcsR0FBSyxHQUFHLE1BQU0sR0FBRyxNQUFNLE1BQU0sVUFBVSxDQUFDO0FBQUEsRUFDNUc7QUFFQSxRQUFNLE9BQU8sS0FBSyxJQUFJLEdBQUcsT0FBTztBQUNoQyxRQUFNLE9BQU8sS0FBSyxJQUFJLEdBQUcsT0FBTztBQUNoQyxRQUFNLE9BQXNCO0FBQUEsSUFDMUIsSUFBSTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sUUFBUSxTQUFTO0FBQUEsSUFDakI7QUFBQSxJQUNBLFFBQVEsU0FBUztBQUFBLElBQ2pCLFFBQVEsRUFBRSxJQUFJLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxHQUFHLEdBQUcsTUFBTSxHQUFHLEdBQUc7QUFBQSxJQUN6RCxLQUFLO0FBQUEsSUFDTDtBQUFBLElBQ0EsTUFBTSxTQUFTLEtBQUs7QUFBQSxJQUNwQixVQUFVLGtCQUFrQixNQUFNLE9BQU8sR0FBRyxPQUFPLEdBQUcsQ0FBQztBQUFBLElBQ3ZEO0FBQUEsRUFDRjtBQUNBLE9BQUssS0FBSyxhQUFhLGdCQUFnQixJQUFJLENBQUM7QUFDNUMsU0FBTyxFQUFFLElBQUksTUFBTSxLQUFLO0FBQzFCO0FBR0EsU0FBUyxhQUFhLE9BQWMsVUFBa0Q7QUFDcEYsUUFBTSxPQUFPLGNBQWMsU0FBUyxJQUFJO0FBQ3hDLFFBQU0sUUFBUSxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQ2xDLFFBQU0sUUFBUSxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQ2xDLFFBQU0sUUFBUSxTQUFTLFlBQVk7QUFDbkMsTUFBSSxVQUFVLE1BQU0sVUFBVSxHQUFHO0FBQy9CLFdBQU9BLE1BQUssUUFBUSxzQkFBc0IsQ0FBQywrQkFBK0IsS0FBSyxNQUFNLEtBQUssSUFBSSxDQUFDO0FBQUEsRUFDakc7QUFDQSxNQUFJLFFBQVEsS0FBSyxRQUFRLEdBQUc7QUFDMUIsV0FBT0EsTUFBSyxRQUFRLGlCQUFpQixDQUFDLEdBQUcsS0FBSywyQkFBMkIsQ0FBQztBQUFBLEVBQzVFO0FBR0EsUUFBTSxPQUFPLEtBQUssTUFBTSxRQUFRLEtBQUs7QUFDckMsUUFBTSxRQUFRLFFBQVE7QUFDdEIsUUFBTSxRQUF1QixDQUFDO0FBQzlCLE1BQUksSUFBSSxLQUFLO0FBQ2IsUUFBTSxVQUFvQixDQUFDO0FBQzNCLFdBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxLQUFLO0FBQzlCLFVBQU0sT0FBTyxRQUFRLElBQUksUUFBUSxJQUFJO0FBQ3JDLFVBQU0sS0FBSyxHQUFHLEtBQUssSUFBSSxPQUFPO0FBQzlCLFVBQU0sU0FBbUIsQ0FBQztBQUMxQixhQUFTLEtBQUssSUFBSSxNQUFNLElBQUksTUFBTTtBQUNoQyxlQUFTLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLElBQUssUUFBTyxLQUFLLFVBQVUsT0FBTyxHQUFHLEVBQUUsQ0FBQztBQUFBLElBQzlFO0FBQ0EsWUFBUSxLQUFLLE9BQU8sTUFBTSxDQUFDO0FBQzNCLFVBQU0sS0FBSyxFQUFFLElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUMzQixRQUFJLEtBQUs7QUFBQSxFQUNYO0FBRUEsV0FBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUNyQyxVQUFNLENBQUMsRUFBRSxJQUFJLE1BQU0sSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLElBQUksUUFBUSxDQUFDLEdBQUcsTUFBTSxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUM7QUFBQSxFQUM3RTtBQUVBLE1BQUksU0FBUyxHQUFHLFVBQVUsR0FBRyxZQUFZLEdBQUcsYUFBYTtBQUN6RCxRQUFNLFVBQTJCLENBQUM7QUFDbEMsYUFBVyxLQUFLLE9BQU87QUFDckIsYUFBUyxLQUFLLEVBQUUsSUFBSSxNQUFNLEVBQUUsSUFBSSxNQUFNO0FBQ3BDLGVBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksS0FBSztBQUN2QyxjQUFNLElBQUksVUFBVSxPQUFPLEdBQUcsRUFBRTtBQUNoQyxnQkFBUSxLQUFLLEVBQUUsR0FBRyxHQUFHLElBQUksR0FBRyxFQUFFLEVBQUUsQ0FBQztBQUNqQyxjQUFNLElBQUksSUFBSSxFQUFFO0FBQ2hCLFlBQUksSUFBSSxHQUFHO0FBQUUsdUJBQWE7QUFBRyxtQkFBUyxLQUFLLElBQUksUUFBUSxDQUFDO0FBQUEsUUFBRztBQUMzRCxZQUFJLElBQUksR0FBRztBQUFFLHdCQUFjLENBQUM7QUFBRyxvQkFBVSxLQUFLLElBQUksU0FBUyxDQUFDLENBQUM7QUFBQSxRQUFHO0FBQUEsTUFDbEU7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNBLE1BQUksU0FBUyxXQUFXLFVBQVUsVUFBVSxXQUFXLFdBQ2xELFlBQVksV0FBVyxnQkFBZ0IsYUFBYSxXQUFXLGVBQWU7QUFDakYsV0FBT0EsTUFBSyxRQUFRLHFCQUFxQjtBQUFBLE1BQ3ZDLE9BQU8sU0FBUyxpQkFBYyxVQUFVLGVBQVksTUFBTSxJQUFJLE9BQU87QUFBQSxJQUN2RSxDQUFDO0FBQUEsRUFDSDtBQUNBLFFBQU0sYUFBYSxrQkFBa0IsT0FBTyxPQUFPO0FBQ25ELE1BQUksV0FBVyxTQUFTLEdBQUc7QUFDekIsV0FBT0EsTUFBSyxRQUFRLHFCQUFxQixXQUFXLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFBQSxNQUM5RCxDQUFDLE1BQU0sVUFBVSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxFQUFFLE1BQU0sY0FBYyxFQUFFLFFBQVE7QUFBQSxJQUN2RSxDQUFDO0FBQUEsRUFDSDtBQUNBLFFBQU0sZUFBZSxlQUFlLE9BQU8sSUFBSTtBQUMvQyxNQUFJLGFBQWEsU0FBUyxHQUFHO0FBQzNCLFdBQU9BLE1BQUssUUFBUSxtQkFBbUIsYUFBYSxJQUFJLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQztBQUFBLEVBQzVFO0FBQ0EsYUFBVyxLQUFLLFNBQVM7QUFDdkIsVUFBTSxNQUFNLFNBQVMsT0FBTyxFQUFFLEdBQUcsRUFBRSxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQzdDLFFBQUksUUFBUSxJQUFJLE1BQU07QUFDcEIsYUFBT0EsTUFBSyxRQUFRLG1CQUFtQjtBQUFBLFFBQ3JDLFVBQVUsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLFdBQVcsR0FBRztBQUFBLE1BQ3BDLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRjtBQUVBLFFBQU0sTUFBTSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFDckMsUUFBTSxVQUE2QixDQUFDO0FBQ3BDLGFBQVcsS0FBSyxPQUFPO0FBQ3JCLFVBQU0sTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEtBQUs7QUFDL0IsWUFBUSxLQUFLO0FBQUEsTUFDWCxNQUFNO0FBQUEsTUFBWSxHQUFHO0FBQUEsTUFBSSxHQUFHLEVBQUU7QUFBQSxNQUFHLEdBQUc7QUFBQSxNQUNwQyxHQUFHO0FBQUEsTUFBTyxHQUFHO0FBQUEsTUFBTSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUs7QUFBQSxNQUFHLE1BQU07QUFBQSxJQUMvQyxDQUFDO0FBRUQsVUFBTSxXQUFXLEVBQUUsS0FBSyxFQUFFLEtBQUs7QUFDL0IsYUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDMUIsWUFBTSxLQUFLLElBQUksS0FBSztBQUNwQixjQUFRLEtBQUs7QUFBQSxRQUNYLE1BQU07QUFBQSxRQUFZLEdBQUc7QUFBQSxRQUFJLEdBQUcsRUFBRSxJQUFJO0FBQUEsUUFBTSxHQUFHLEVBQUUsS0FBSyxXQUFXO0FBQUEsUUFDN0QsR0FBRyxRQUFRO0FBQUEsUUFBSyxHQUFHO0FBQUEsUUFBTSxHQUFHO0FBQUEsUUFBTSxNQUFNO0FBQUEsTUFDMUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNGO0FBQ0EsV0FBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUNyQyxVQUFNLFFBQVEsTUFBTSxJQUFJLENBQUM7QUFDekIsVUFBTSxRQUFRLE1BQU0sQ0FBQztBQUNyQixZQUFRLEtBQUs7QUFBQSxNQUNYLE1BQU07QUFBQSxNQUFrQixHQUFHO0FBQUEsTUFBSSxHQUFHLE1BQU07QUFBQSxNQUFHLEdBQUcsTUFBTSxLQUFLO0FBQUEsTUFDekQsR0FBRztBQUFBLE1BQU8sR0FBRyxNQUFNLElBQUksTUFBTTtBQUFBLE1BQUcsR0FBRztBQUFBLE1BQUssTUFBTTtBQUFBLElBQ2hELENBQUM7QUFBQSxFQUNIO0FBRUEsUUFBTSxPQUFPLEtBQUssSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFDOUMsUUFBTSxPQUFPLEtBQUssSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFDOUMsUUFBTSxPQUFzQjtBQUFBLElBQzFCLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLFFBQVEsU0FBUztBQUFBLElBQ2pCO0FBQUEsSUFDQSxRQUFRLFNBQVM7QUFBQSxJQUNqQixRQUFRLEVBQUUsR0FBRyxJQUFJLEdBQUcsTUFBTSxJQUFJLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxFQUFFO0FBQUEsSUFDekQsS0FBSztBQUFBLElBQ0w7QUFBQSxJQUNBLE1BQU0sRUFBRSxHQUFHLGFBQWE7QUFBQSxJQUN4QixVQUFVLGtCQUFrQixNQUFNLE9BQU8sR0FBRyxPQUFPLEdBQUcsQ0FBQztBQUFBLElBQ3ZEO0FBQUEsSUFDQSxVQUFVO0FBQUEsRUFDWjtBQUNBLE9BQUssS0FBSyxhQUFhLGdCQUFnQixJQUFJLENBQUM7QUFDNUMsU0FBTyxFQUFFLElBQUksTUFBTSxLQUFLO0FBQzFCO0FBRU8sU0FBUyxjQUFjLE9BQWMsVUFBa0Q7QUFDNUYsTUFBSSxTQUFTLGtCQUFrQix1QkFBd0IsUUFBTyxrQkFBa0IsT0FBTyxRQUFRO0FBQy9GLE1BQUksU0FBUyxrQkFBa0IsUUFBVztBQUN4QyxXQUFPQSxNQUFLLFFBQVEsc0JBQXNCLENBQUMsZ0NBQWdDLE9BQU8sU0FBUyxhQUFhLENBQUMsRUFBRSxDQUFDO0FBQUEsRUFDOUc7QUFDQSxNQUFJLFNBQVMsU0FBUyxRQUFTLFFBQU8sVUFBVSxPQUFPLFFBQVE7QUFDL0QsTUFBSSxTQUFTLFNBQVMsT0FBUSxRQUFPLFNBQVMsT0FBTyxRQUFRO0FBQzdELFNBQU8sYUFBYSxPQUFPLFFBQVE7QUFDckM7QUFNQSxTQUFTLGtCQUFrQixPQUFjLFVBQWtEO0FBQ3pGLE1BQUksU0FBUyxTQUFTLE9BQVEsUUFBTyxnQkFBZ0IsT0FBTyxRQUFRO0FBQ3BFLFFBQU0sVUFBVSxTQUFTLFNBQVMsVUFBVSxVQUFVLE9BQU8sUUFBUSxJQUFJLGFBQWEsT0FBTyxRQUFRO0FBQ3JHLE1BQUksQ0FBQyxRQUFRLEdBQUksUUFBTztBQUN4QixNQUFJLFNBQVMsU0FBUyxXQUFXO0FBRy9CLFlBQVEsS0FBSyxnQkFBZ0I7QUFDN0IsWUFBUSxLQUFLLEtBQUssYUFBYSxnQkFBZ0IsUUFBUSxJQUFJLENBQUM7QUFDNUQsV0FBTztBQUFBLEVBQ1Q7QUFDQSxRQUFNLE9BQU8sY0FBYyxTQUFTLElBQUk7QUFDeEMsUUFBTSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSztBQUNuQyxRQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLO0FBQ25DLFFBQU0sSUFBSSxTQUFTLFFBQVEsTUFBTSxLQUFLLE1BQU0sR0FBRyxNQUFNLEtBQUssTUFBTTtBQUNoRSxRQUFNLElBQUksS0FBSyxJQUFJO0FBQ25CLFFBQU0sVUFBNkIsQ0FBQztBQUVwQyxRQUFNLE9BQU8sQ0FBQyxHQUFXLFFBQWdCLEdBQVcsR0FBVyxRQUFnQixHQUFXLE9BQWdDLFdBQVc7QUFDbkksWUFBUSxLQUFLLEVBQUUsTUFBTSxHQUFHLEdBQUcsUUFBUSxHQUFHLEdBQUcsR0FBRyxRQUFRLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFBQSxFQUN4RTtBQUNBLE9BQUssSUFBSSxJQUFJLEtBQUssSUFBSSxHQUFHLEtBQUssR0FBRyxPQUFPO0FBQ3hDLE9BQUssSUFBSSxHQUFHLEtBQUssSUFBSSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQy9CLFFBQU0sVUFBVSxLQUFLLEdBQUcsVUFBVSxLQUFLO0FBQ3ZDLE9BQUssS0FBSyxJQUFJLEdBQUcsSUFBSSxVQUFVLFdBQVcsR0FBRyxHQUFHLEdBQUcsVUFBVSxPQUFPO0FBQ3BFLFFBQU0sU0FBUyxTQUFTLE1BQU0sS0FBSyxLQUFLLE1BQU07QUFDOUMsUUFBTSxRQUFRLFFBQVEsS0FBSyxRQUFRLFFBQVE7QUFDM0MsUUFBTSxRQUFRLEtBQUssSUFBSTtBQUN2QixPQUFLLE9BQU8sSUFBSSxVQUFVLFNBQVMsR0FBRyxHQUFHLEdBQUcsUUFBUSxPQUFPO0FBQzNELE9BQUssT0FBTyxJQUFJLFFBQVEsV0FBVyxHQUFHLEdBQUcsR0FBRyxVQUFVLEtBQUs7QUFDM0QsT0FBSyxPQUFPLElBQUksS0FBSyxPQUFPLEdBQUcsS0FBSyxLQUFLLFFBQVE7QUFDakQsT0FBSyxPQUFPLElBQUksS0FBSyxPQUFPLEdBQUcsS0FBSyxHQUFHO0FBQ3ZDLFFBQU0sU0FBUyxLQUFLLElBQUk7QUFDeEIsYUFBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLEdBQUcsS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLEtBQUssS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLEtBQUssS0FBSyxDQUFDLENBQUMsR0FBRztBQUNuRixVQUFNLElBQUksS0FBSyxHQUFHLEdBQUcsUUFBUSxJQUFJLEdBQUcsR0FBRyxDQUFDO0FBQUEsRUFDMUM7QUFDQSxhQUFXLE1BQU0sQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLEdBQUc7QUFDakMsU0FBSyxJQUFJLEdBQUcsUUFBUSxLQUFLLEdBQUcsQ0FBQztBQUM3QixTQUFLLElBQUksSUFBSSxLQUFLLFFBQVEsS0FBSyxLQUFLLEdBQUcsUUFBUTtBQUFBLEVBQ2pEO0FBQ0EsT0FBSyxJQUFJLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSyxHQUFHLE1BQU07QUFDckMsT0FBSyxJQUFJLElBQUksSUFBSSxLQUFLLEtBQUssTUFBTSxHQUFHLEtBQUssS0FBSyxTQUFTO0FBQ3ZELE9BQUssSUFBSSxJQUFJLElBQUksS0FBSyxLQUFLLE1BQU0sR0FBRyxLQUFLLEtBQUssU0FBUztBQUN2RCxPQUFLLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLLFNBQVM7QUFDekQsT0FBSyxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSyxTQUFTO0FBQ3pELFVBQVEsS0FBSyxVQUFVO0FBQ3ZCLFVBQVEsS0FBSyxnQkFBZ0I7QUFDN0IsVUFBUSxLQUFLLFdBQVcsa0JBQWtCLE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQy9ELFVBQVEsS0FBSyxLQUFLLGFBQWEsZ0JBQWdCLFFBQVEsSUFBSSxDQUFDO0FBQzVELFNBQU87QUFDVDtBQUVBLFNBQVMsZ0JBQWdCLE9BQWMsVUFBa0Q7QUFDdkYsUUFBTSxVQUFVLFNBQVMsT0FBTyxRQUFRO0FBQ3hDLE1BQUksQ0FBQyxRQUFRLEdBQUksUUFBTztBQUN4QixRQUFNLFVBQTZCLENBQUM7QUFDcEMsUUFBTSxVQUFVLFFBQVEsS0FBSyxRQUFRLE9BQU8sQ0FBQyxNQUFNLEVBQUUsU0FBUyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBQ3BGLFFBQU0sS0FBSyxRQUFRLEtBQUssS0FBSyxJQUFJLEtBQUssUUFBUSxLQUFLLEtBQUssS0FBSztBQUM3RCxNQUFJLFFBQVE7QUFDWixXQUFTLE1BQU0sR0FBRyxPQUFPLFFBQVEsUUFBUSxPQUFPO0FBQzlDLFFBQUksTUFBTSxRQUFRLFVBQVUsUUFBUSxHQUFHLE1BQU0sUUFBUSxLQUFLLEVBQUc7QUFDN0QsVUFBTSxJQUFJLFFBQVEsS0FBSyxLQUFLLEtBQUssT0FBTyxRQUFRLE1BQU07QUFDdEQsVUFBTSxLQUFLLElBQUksUUFBUSxHQUFHLElBQUksUUFBUSxLQUFLO0FBQzNDLFlBQVEsS0FBSyxFQUFFLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxJQUFJLEtBQUssTUFBTSxHQUFHLEdBQUcsT0FBTyxHQUFHLE1BQU0sR0FBRyxHQUFHLE1BQU0sU0FBUyxDQUFDO0FBQ2xHLGVBQVcsS0FBSyxDQUFDLEtBQUssT0FBTyxLQUFLLEtBQUssR0FBRztBQUN4QyxjQUFRLEtBQUssRUFBRSxNQUFNLFFBQVEsR0FBRyxJQUFJLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxNQUFNLEdBQUcsTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUFBLElBQ3ZGO0FBQ0EsWUFBUTtBQUFBLEVBQ1Y7QUFDQSxVQUFRLEtBQUssVUFBVTtBQUN2QixVQUFRLEtBQUssZ0JBQWdCO0FBQzdCLFVBQVEsS0FBSyxLQUFLLGFBQWEsZ0JBQWdCLFFBQVEsSUFBSSxDQUFDO0FBQzVELFNBQU87QUFDVDtBQVNPLElBQU0sMkJBQTRDO0FBQUEsRUFDdkQsWUFBWTtBQUFBLEVBQ1osU0FBUztBQUNYO0FBa0JPLElBQU0sMkJBQU4sTUFBK0I7QUFBQSxFQUtwQyxZQUFxQixRQUE2QixTQUFtQyxDQUFDLEdBQUc7QUFBcEU7QUFDbkIsU0FBSyxTQUFTLEVBQUUsR0FBRywwQkFBMEIsR0FBRyxPQUFPO0FBQUEsRUFDekQ7QUFBQSxFQUZxQjtBQUFBLEVBSlosWUFBWTtBQUFBLEVBQ1osY0FBYztBQUFBLEVBQ2Q7QUFBQSxFQU1ULFVBQVUsT0FBYyxNQUF3QztBQUM5RCxVQUFNLFVBQW9CLENBQUM7QUFDM0IsUUFBSSxLQUFLLFFBQVEsV0FBVyxFQUFHLFNBQVEsS0FBSyxxQkFBcUI7QUFDakUsUUFBSSxLQUFLLFFBQVEsU0FBUyxLQUFLLE9BQU8sWUFBWTtBQUNoRCxjQUFRLEtBQUssR0FBRyxLQUFLLFFBQVEsTUFBTSx5QkFBeUIsS0FBSyxPQUFPLFVBQVUsRUFBRTtBQUFBLElBQ3RGO0FBQ0EsUUFBSSxVQUFVLEtBQUssSUFBSSxJQUFJLEtBQUssT0FBTyxTQUFTO0FBQzlDLGNBQVEsS0FBSyxRQUFRLFVBQVUsS0FBSyxJQUFJLENBQUMsa0JBQWtCLEtBQUssT0FBTyxPQUFPLEVBQUU7QUFBQSxJQUNsRjtBQUNBLGVBQVcsQ0FBQyxVQUFVLE1BQU0sS0FBSyxPQUFPLFFBQVEsS0FBSyxJQUFJLEdBQUc7QUFDMUQsVUFBSSxDQUFDLE9BQU8sVUFBVSxNQUFNLE1BQU0sVUFBVSxLQUFLLEdBQUc7QUFDbEQsZ0JBQVEsS0FBSyxRQUFRLFFBQVEsSUFBSSxNQUFNLGdDQUFnQztBQUFBLE1BQ3pFO0FBQUEsSUFDRjtBQUNBLFFBQUksS0FBSyxTQUFTLFdBQVcsRUFBRyxTQUFRLEtBQUssMkJBQTJCO0FBQ3hFLGVBQVcsVUFBVSxLQUFLLFVBQVU7QUFDbEMsVUFBSSxDQUFDLEtBQUssT0FBTyxTQUFTLEtBQUssQ0FBQyxNQUFNLE9BQU8sTUFBTSxFQUFFLE1BQU0sT0FBTyxNQUFNLEVBQUUsTUFDckUsT0FBTyxNQUFNLEVBQUUsTUFBTSxPQUFPLE1BQU0sRUFBRSxNQUNwQyxPQUFPLE1BQU0sRUFBRSxNQUFNLE9BQU8sTUFBTSxFQUFFLEVBQUUsR0FBRztBQUM1QyxnQkFBUSxLQUFLLFlBQVksT0FBTyxFQUFFLElBQUksT0FBTyxFQUFFLElBQUksT0FBTyxFQUFFLEtBQUssT0FBTyxFQUFFLElBQUksT0FBTyxFQUFFLElBQUksT0FBTyxFQUFFLDhCQUE4QjtBQUFBLE1BQ3BJO0FBQUEsSUFDRjtBQUNBLGVBQVcsS0FBSyxLQUFLLFNBQVM7QUFDNUIsVUFBSSxDQUFDLHFCQUFxQixHQUFHLEtBQUssUUFBUSxHQUFHO0FBQzNDLGdCQUFRLEtBQUssVUFBVSxFQUFFLElBQUksT0FBTyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsK0JBQStCO0FBQUEsTUFDdEY7QUFBQSxJQUNGO0FBQ0EsUUFBSSxLQUFLLFFBQVEsV0FBVyxFQUFHLFNBQVEsS0FBSyw2QkFBNkI7QUFDekUsZUFBVyxLQUFLLEtBQUssU0FBUztBQUM1QixVQUFJLENBQUMsaUJBQWlCLEtBQUssVUFBVSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHO0FBQ25ELGdCQUFRLEtBQUssV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsK0JBQStCO0FBQUEsTUFDMUU7QUFBQSxJQUNGO0FBQ0EsUUFBSSxRQUFRLFNBQVMsRUFBRyxRQUFPLEVBQUUsSUFBSSxPQUFPLGVBQWUsTUFBTSxRQUFRO0FBRXpFLFVBQU0sUUFBZ0M7QUFBQSxNQUNwQyxJQUFJLHdCQUF3QixnQkFBZ0IsSUFBSSxDQUFDO0FBQUEsTUFDakQsV0FBVztBQUFBLE1BQ1gsYUFBYTtBQUFBLE1BQ2IsWUFBWSxnQkFBZ0IsSUFBSTtBQUFBLE1BQ2hDLFVBQVUsS0FBSyxTQUFTLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUU7QUFBQSxNQUM3QyxjQUFjLE1BQU07QUFBQSxNQUNwQixRQUFRLEVBQUUsR0FBRyxLQUFLLE9BQU87QUFBQSxJQUMzQjtBQUNBLFdBQU8sRUFBRSxJQUFJLE1BQU0sZUFBZSxPQUFPLFNBQVMsQ0FBQyxFQUFFO0FBQUEsRUFDdkQ7QUFDRjtBQTRCTyxTQUFTLGlCQUNkLE9BQWMsTUFBcUIsZUFDakI7QUFDbEIsTUFBSSxjQUFjLGNBQWMsbUJBQzNCLGNBQWMsZ0JBQWdCLG1CQUFtQjtBQUNwRCxXQUFPQSxNQUFLLFdBQVcseUJBQXlCO0FBQUEsTUFDOUMsYUFBYSxjQUFjLFNBQVMsSUFBSSxjQUFjLFdBQVc7QUFBQSxJQUNuRSxDQUFDO0FBQUEsRUFDSDtBQUNBLE1BQUksY0FBYyxlQUFlLGdCQUFnQixJQUFJLEdBQUc7QUFDdEQsV0FBT0EsTUFBSyxXQUFXLG1CQUFtQixDQUFDLGtEQUFrRCxDQUFDO0FBQUEsRUFDaEc7QUFDQSxNQUFJLGNBQWMsaUJBQWlCLE1BQU0sVUFBVTtBQUNqRCxXQUFPQSxNQUFLLFdBQVcsdUJBQXVCO0FBQUEsTUFDNUMsd0NBQXdDLGNBQWMsWUFBWSxpQkFBaUIsTUFBTSxRQUFRO0FBQUEsSUFDbkcsQ0FBQztBQUFBLEVBQ0g7QUFDQSxNQUFJLEtBQUssU0FBUyxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsU0FBUyxLQUFLLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUN2RSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxHQUFHO0FBQ25GLFdBQU9BLE1BQUssV0FBVyxxQkFBcUIsQ0FBQywrQ0FBK0MsQ0FBQztBQUFBLEVBQy9GO0FBRUEsUUFBTSxVQUFvQixDQUFDO0FBQzNCLGFBQVcsS0FBSyxLQUFLLFNBQVM7QUFDNUIsUUFBSSxDQUFDLHFCQUFxQixHQUFHLGNBQWMsUUFBUSxHQUFHO0FBQ3BELGNBQVEsS0FBSyxVQUFVLEVBQUUsSUFBSSxPQUFPLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxxQ0FBcUM7QUFBQSxJQUM1RjtBQUFBLEVBQ0Y7QUFDQSxRQUFNLGFBQWEsa0JBQWtCLE9BQU8sS0FBSyxPQUFPO0FBQ3hELE1BQUksV0FBVyxTQUFTLEdBQUc7QUFDekIsWUFBUSxLQUFLLEdBQUcsV0FBVyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQUEsTUFDckMsQ0FBQyxNQUFNLFVBQVUsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxNQUFNLGNBQWMsRUFBRSxRQUFRO0FBQUEsSUFDdkUsQ0FBQztBQUFBLEVBQ0g7QUFDQSxRQUFNLGVBQWUsZUFBZSxPQUFPLEtBQUssSUFBSTtBQUNwRCxNQUFJLGFBQWEsU0FBUyxHQUFHO0FBQzNCLFlBQVEsS0FBSyxpQkFBaUIsYUFBYSxNQUFNLGVBQWU7QUFBQSxFQUNsRTtBQUNBLE1BQUksTUFBTSxXQUFXLElBQUksS0FBSyxFQUFFLEdBQUc7QUFDakMsWUFBUSxLQUFLLGFBQWEsS0FBSyxFQUFFLGlCQUFpQjtBQUFBLEVBQ3BEO0FBQ0EsYUFBVyxDQUFDLFVBQVUsTUFBTSxLQUFLLE9BQU8sUUFBUSxLQUFLLElBQUksR0FBRztBQUMxRCxVQUFNLE9BQU8sTUFBTSxVQUFVLFFBQVEsS0FBSztBQUMxQyxRQUFJLFFBQVEsVUFBVSxJQUFJO0FBQ3hCLGNBQVEsS0FBSyxRQUFRLE1BQU0sSUFBSSxRQUFRLFVBQVUsSUFBSSxFQUFFO0FBQUEsSUFDekQ7QUFBQSxFQUNGO0FBQ0EsTUFBSSxRQUFRLFNBQVMsRUFBRyxRQUFPQSxNQUFLLFdBQVcsMEJBQTBCLE9BQU87QUFFaEYsUUFBTSxrQkFBa0Isa0JBQWtCLEtBQUs7QUFDL0MsUUFBTSxpQkFBaUIsTUFBTTtBQUM3QixhQUFXLENBQUMsVUFBVSxNQUFNLEtBQUssT0FBTyxRQUFRLEtBQUssSUFBSSxHQUFHO0FBQzFELFVBQU0sUUFBUSxNQUFNLFVBQVUsUUFBUSxLQUFLLE1BQU0sVUFBVTtBQUMzRCxRQUFJLE9BQU8sRUFBRyxPQUFNLFVBQVUsUUFBUSxJQUFJO0FBQUEsUUFDckMsUUFBTyxNQUFNLFVBQVUsUUFBUTtBQUFBLEVBQ3RDO0FBRUEsUUFBTTtBQUNOLFFBQU0sWUFBdUI7QUFBQSxJQUMzQixJQUFJLEtBQUs7QUFBQSxJQUNULE1BQU0sS0FBSztBQUFBLElBQ1gsUUFBUSxLQUFLO0FBQUEsSUFDYixHQUFHLEtBQUssT0FBTztBQUFBLElBQ2YsR0FBRyxLQUFLLE9BQU87QUFBQSxJQUNmLEdBQUcsS0FBSyxPQUFPO0FBQUEsSUFDZixLQUFLLEtBQUs7QUFBQSxJQUNWLFNBQVMsS0FBSyxRQUFRLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUU7QUFBQSxJQUMzQyxNQUFNLEVBQUUsR0FBRyxLQUFLLEtBQUs7QUFBQSxJQUNyQixlQUFlLE1BQU07QUFBQSxJQUNyQixHQUFJLEtBQUssa0JBQWtCLHlCQUF5QixFQUFFLGVBQWUsdUJBQXVCLElBQUksQ0FBQztBQUFBLElBQ2pHLGFBQWE7QUFBQSxFQUNmO0FBQ0EsUUFBTSxXQUFXLElBQUksVUFBVSxJQUFJLFNBQVM7QUFFNUMsUUFBTSxTQUEwQjtBQUFBLElBQzlCLFdBQVc7QUFBQSxJQUNYLGFBQWE7QUFBQSxJQUNiLGlCQUFpQixjQUFjO0FBQUEsSUFDL0IsWUFBWSxjQUFjO0FBQUEsSUFDMUIsYUFBYSxVQUFVO0FBQUEsSUFDdkIsUUFBUSxLQUFLO0FBQUEsSUFDYixNQUFNLEtBQUs7QUFBQSxJQUNYLGFBQWEsVUFBVSxRQUFRO0FBQUEsSUFDL0IsVUFBVSxFQUFFLEdBQUcsS0FBSyxLQUFLO0FBQUEsSUFDekI7QUFBQSxJQUNBLGdCQUFnQixrQkFBa0IsS0FBSztBQUFBLElBQ3ZDO0FBQUEsSUFDQSxlQUFlLE1BQU07QUFBQSxFQUN2QjtBQUNBLFNBQU8sRUFBRSxJQUFJLE1BQU0sTUFBTSxlQUFlLE9BQU87QUFDakQ7QUFLTyxTQUFTLGVBQ2QsT0FDQSxZQUNBLFVBQ2tCO0FBQ2xCLFFBQU0sVUFBVSxjQUFjLE9BQU8sUUFBUTtBQUM3QyxNQUFJLENBQUMsUUFBUSxHQUFJLFFBQU87QUFDeEIsUUFBTSxXQUFXLFdBQVcsVUFBVSxPQUFPLFFBQVEsSUFBSTtBQUN6RCxNQUFJLENBQUMsU0FBUyxNQUFNLENBQUMsU0FBUyxlQUFlO0FBQzNDLFdBQU9BLE1BQUssYUFBYSxrQkFBa0IsU0FBUyxPQUFPO0FBQUEsRUFDN0Q7QUFDQSxTQUFPLGlCQUFpQixPQUFPLFFBQVEsTUFBTSxTQUFTLGFBQWE7QUFDckU7OztBQ3p6QkEsSUFBTSxTQUFOLE1BQWE7QUFBQSxFQUNILElBQUk7QUFBQSxFQUNKLElBQUk7QUFBQSxFQUVaLEtBQUssR0FBaUI7QUFDcEIsVUFBTSxJQUFJLElBQUk7QUFDZCxTQUFLLElBQUksS0FBSyxLQUFLLEtBQUssSUFBSSxHQUFHLFFBQVU7QUFDekMsU0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLLElBQUssSUFBSSxLQUFPLFVBQVU7QUFDbEQsU0FBSyxLQUFLLEtBQUssTUFBTTtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxJQUFJLEdBQWlCO0FBQ25CLFFBQUksSUFBSSxNQUFNO0FBQ2QsYUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDMUIsV0FBSyxLQUFLLENBQUM7QUFDWCxhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE9BQU8sR0FBaUI7QUFDdEIsU0FBSyxJQUFJLEVBQUUsTUFBTTtBQUNqQixhQUFTLElBQUksR0FBRyxJQUFJLEVBQUUsUUFBUSxJQUFLLE1BQUssS0FBSyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDOUQ7QUFBQSxFQUVBLE1BQWM7QUFDWixZQUFRLEtBQUssTUFBTSxHQUFHLFNBQVMsRUFBRSxFQUFFLFNBQVMsR0FBRyxHQUFHLEtBQzdDLEtBQUssTUFBTSxHQUFHLFNBQVMsRUFBRSxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQUEsRUFDakQ7QUFDRjtBQWtCTyxTQUFTLGtCQUFrQixPQUE4QztBQUM5RSxTQUFPLE1BQ0osSUFBSSxDQUFDLE9BQU87QUFBQSxJQUNYLElBQUksS0FBSyxNQUFNLEVBQUUsRUFBRTtBQUFBLElBQUcsSUFBSSxLQUFLLE1BQU0sRUFBRSxFQUFFO0FBQUEsSUFBRyxJQUFJLEtBQUssTUFBTSxFQUFFLEVBQUU7QUFBQSxJQUFHLElBQUksS0FBSyxNQUFNLEVBQUUsRUFBRTtBQUFBLElBQ3JGLElBQUksS0FBSyxNQUFNLEVBQUUsRUFBRTtBQUFBLElBQUcsSUFBSSxLQUFLLE1BQU0sRUFBRSxFQUFFO0FBQUEsRUFDM0MsRUFBRSxFQUNELEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQ2xELEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFO0FBQ2xEO0FBc0ZPLFNBQVMsa0JBQWtCLE9BQXNDO0FBQ3RFLFFBQU0sTUFBOEIsQ0FBQztBQUNyQyxhQUFXLE9BQU8sT0FBTyxLQUFLLE1BQU0sU0FBUyxFQUFFLEtBQUssRUFBRyxLQUFJLEdBQUcsSUFBSSxNQUFNLFVBQVUsR0FBRztBQUNyRixTQUFPO0FBQ1Q7QUEwQ08sU0FBUyx1QkFBdUIsT0FBc0I7QUFDM0QsUUFBTSxhQUFhLENBQUMsR0FBRyxNQUFNLFdBQVcsT0FBTyxDQUFDLEVBQzdDLEtBQUssQ0FBQyxHQUFHLE1BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssSUFBSSxDQUFFO0FBQzFELFFBQU0sSUFBSSxJQUFJLE9BQU87QUFDckIsSUFBRSxPQUFPLHlCQUF5QjtBQUNsQyxJQUFFLElBQUksV0FBVyxNQUFNO0FBQ3ZCLGFBQVcsS0FBSyxZQUFZO0FBQzFCLE1BQUUsT0FBTyxFQUFFLEVBQUU7QUFDYixNQUFFLE9BQU8sRUFBRSxJQUFJO0FBQ2YsTUFBRSxPQUFPLEVBQUUsTUFBTTtBQUNqQixNQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsSUFBSSxHQUFJLENBQUM7QUFDNUIsTUFBRSxJQUFJLEtBQUssTUFBTSxFQUFFLElBQUksR0FBSSxDQUFDO0FBQzVCLE1BQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxJQUFJLEdBQUksQ0FBQztBQUM1QixNQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsTUFBTSxHQUFLLENBQUM7QUFFL0IsUUFBSSxFQUFFLGtCQUFrQix1QkFBd0IsR0FBRSxPQUFPLFVBQVU7QUFDbkUsTUFBRSxJQUFJLEVBQUUsUUFBUSxNQUFNO0FBQ3RCLGVBQVcsS0FBSyxFQUFFLFNBQVM7QUFDekIsUUFBRSxPQUFPLEVBQUUsSUFBSTtBQUNmLFFBQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxJQUFJLEdBQUksQ0FBQztBQUM1QixRQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsSUFBSSxHQUFJLENBQUM7QUFDNUIsUUFBRSxJQUFJLEtBQUssTUFBTSxFQUFFLElBQUksR0FBSSxDQUFDO0FBQzVCLFFBQUUsSUFBSSxLQUFLLE1BQU0sRUFBRSxJQUFJLEdBQUksQ0FBQztBQUM1QixRQUFFLElBQUksS0FBSyxNQUFNLEVBQUUsSUFBSSxHQUFJLENBQUM7QUFDNUIsUUFBRSxJQUFJLEtBQUssTUFBTSxFQUFFLElBQUksR0FBSSxDQUFDO0FBQzVCLFFBQUUsSUFBSSxLQUFLLE9BQU8sRUFBRSxPQUFPLEtBQUssR0FBSyxDQUFDO0FBQ3RDLFFBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRTtBQUFBLElBQ3ZCO0FBQ0EsVUFBTSxXQUFXLE9BQU8sS0FBSyxFQUFFLElBQUksRUFBRSxLQUFLO0FBQzFDLE1BQUUsSUFBSSxTQUFTLE1BQU07QUFDckIsZUFBVyxPQUFPLFVBQVU7QUFDMUIsUUFBRSxPQUFPLEdBQUc7QUFDWixRQUFFLElBQUksRUFBRSxLQUFLLEdBQTBCLEtBQUssQ0FBQztBQUFBLElBQy9DO0FBQ0EsTUFBRSxJQUFJLEVBQUUsYUFBYTtBQUFBLEVBQ3ZCO0FBQ0EsU0FBTyxFQUFFLElBQUk7QUFDZjs7O0FDL09PLElBQU0sWUFBWTtBQUdsQixJQUFNLG9CQUFvQjtBQU0xQixJQUFNLG9CQUFvQixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBUzdELElBQU0scUJBQWlEO0FBQUEsRUFDNUQsRUFBRSxJQUFJLEtBQUssSUFBSSxLQUFLLEdBQUcsR0FBRztBQUFBLEVBQzFCLEVBQUUsSUFBSSxLQUFLLElBQUksS0FBSyxHQUFHLEdBQUc7QUFBQSxFQUMxQixFQUFFLElBQUksS0FBSyxJQUFJLEtBQUssR0FBRyxHQUFHO0FBQzVCO0FBNkJBLElBQU0saUJBQWlCLEVBQUUsS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxHQUFHO0FBRXJELElBQU0sY0FBMEI7QUFBQSxFQUNyQyxNQUFNO0FBQUEsRUFDTixVQUFVO0FBQUEsSUFDUixJQUFJO0FBQUEsSUFDSixNQUFNLEVBQUUsSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQUE7QUFBQSxJQUUzQyxRQUFRO0FBQUEsSUFDUixNQUFNLEVBQUUsR0FBRyxLQUFLLEdBQUcsSUFBSTtBQUFBLElBQ3ZCLFVBQVUsRUFBRSxHQUFHLEtBQUssR0FBRyxJQUFJO0FBQUEsRUFDN0I7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLElBQUk7QUFBQSxJQUNKLE1BQU0sRUFBRSxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLElBQUk7QUFBQSxJQUMzQyxRQUFRO0FBQUEsSUFDUixNQUFNLEVBQUUsR0FBRyxLQUFLLEdBQUcsSUFBSTtBQUFBLElBQ3ZCLFVBQVUsRUFBRSxHQUFHLEtBQUssR0FBRyxJQUFJO0FBQUEsRUFDN0I7QUFBQSxFQUNBLE1BQU07QUFBQSxJQUNKLElBQUk7QUFBQSxJQUNKLE1BQU0sRUFBRSxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLElBQUk7QUFBQSxJQUMzQyxVQUFVO0FBQUEsRUFDWjtBQUFBLEVBQ0EsWUFBWSxFQUFFLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksSUFBSTtBQUFBLEVBQ2pELFVBQVUsRUFBRSxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLElBQUk7QUFBQSxFQUMvQyxlQUFlO0FBQUEsRUFDZixpQkFBaUI7QUFBQSxJQUNmLElBQUksYUFBYSxlQUFlLEdBQUc7QUFBQSxJQUNuQyxJQUFJLGFBQWEsZUFBZSxHQUFHO0FBQUEsSUFDbkMsSUFBSSxhQUFhLGVBQWUsR0FBRyxJQUFJO0FBQUEsSUFDdkMsSUFBSSxhQUFhLGVBQWUsR0FBRyxJQUFJO0FBQUEsSUFDdkMsSUFBSTtBQUFBLElBQ0osSUFBSSxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBQ0EsVUFBVTtBQUFBO0FBQUEsSUFFUixFQUFFLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEdBQUcsSUFBSSxHQUFHO0FBQUE7QUFBQSxJQUVwRCxFQUFFLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEdBQUcsSUFBSSxHQUFHO0FBQUE7QUFBQSxJQUVwRCxFQUFFLElBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLElBQUksSUFBSSxHQUFHO0FBQUEsRUFDdkQ7QUFDRjs7O0FDdEZPLElBQU0seUJBQTJEO0FBQUEsRUFDdEUsTUFBTTtBQUFBLEVBQ04sT0FBTztBQUNUO0FBR08sU0FBUyxlQUFxQjtBQUNuQyxRQUFNLE9BQU8sWUFBWSxNQUFNO0FBQy9CLFFBQU0sV0FBVyxZQUFZLE1BQU07QUFDbkMsU0FBTztBQUFBLElBQ0wsSUFBSSxLQUFLO0FBQUEsSUFDVCxJQUFJLEtBQUssSUFBSTtBQUFBLElBQ2IsSUFBSSxTQUFTO0FBQUEsSUFDYixJQUFJLEtBQUssSUFBSTtBQUFBLEVBQ2Y7QUFDRjtBQUdPLFNBQVMsa0JBQWtDO0FBQ2hELFFBQU0sT0FBTyxhQUFhO0FBQzFCLFFBQU0sVUFBMEIsQ0FBQztBQUNqQyxXQUFTLElBQUksR0FBRyxJQUFJLGtCQUFrQixRQUFRLEtBQUs7QUFDakQsYUFBUyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3ZDLGNBQVEsS0FBSyxFQUFFLEdBQUcsS0FBSyxLQUFLLEdBQUcsR0FBRyxHQUFHLGtCQUFrQixDQUFDLEVBQUUsQ0FBQztBQUFBLElBQzdEO0FBQUEsRUFDRjtBQUNBLFNBQU87QUFDVDtBQUdPLFNBQVMsa0JBQWtDO0FBQ2hELFFBQU0sT0FBTyxZQUFZLEtBQUs7QUFDOUIsUUFBTSxVQUEwQixDQUFDO0FBQ2pDLGFBQVcsUUFBUSxvQkFBb0I7QUFDckMsYUFBUyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3ZDLGVBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksS0FBSztBQUN2QyxnQkFBUSxLQUFLLEVBQUUsR0FBRyxHQUFHLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFBQSxNQUNsQztBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0EsU0FBTztBQUNUOzs7QUM5RE8sSUFBTSxpQkFBaUIsQ0FBQyxTQUFTLFFBQVEsT0FBTyxXQUFXLFFBQVEsU0FBUyxNQUFNO0FBRWxGLElBQU0sbUJBQW1CO0FBQ3pCLElBQU0scUJBQXFCO0FBQzNCLElBQU0sc0JBQXNCO0FBQzVCLElBQU0sd0JBQXdCO0FBQzlCLElBQU0sb0JBQW9CO0FBQzFCLElBQU0sdUJBQXVCO0FBQzdCLElBQU0sb0JBQW9CLEVBQUUsSUFBSSxzQkFBc0IsR0FBRyxLQUFLLEdBQUcsS0FBSyxVQUFVLG1CQUFtQjtBQWFuRyxJQUFNLFVBQWdHO0FBQUEsRUFDM0csTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsR0FBRyxRQUFRLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxFQUFFO0FBQUEsRUFDM0QsU0FBUyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsR0FBRyxRQUFRLEVBQUUsU0FBUyxFQUFFLEdBQUcsT0FBTyxFQUFFO0FBQ2xFO0FBVU8sSUFBTSxnQkFBZ0IsTUFBTSxLQUFLLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxHQUFHLE1BQU0sUUFBUSxDQUFDLEVBQUU7QUFjckUsU0FBUyxrQkFBNkI7QUFDM0MsU0FBTztBQUFBLElBQ0wsWUFBWSxvQkFBSSxJQUFJLENBQUMsQ0FBQyxzQkFBc0I7QUFBQSxNQUMxQyxJQUFJO0FBQUEsTUFBc0IsR0FBRyxrQkFBa0I7QUFBQSxNQUFHLEdBQUcsa0JBQWtCO0FBQUEsTUFDdkUsVUFBVTtBQUFBLE1BQW9CLFdBQVcsQ0FBQztBQUFBLElBQzVDLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFBRyxNQUFNLG9CQUFJLElBQUk7QUFBQSxJQUFHLE9BQU8sb0JBQUksSUFBSTtBQUFBLElBQUcsTUFBTTtBQUFBLEVBQ2pEO0FBQ0Y7QUFFTyxTQUFTLE1BQU0sS0FBcUM7QUFDekQsU0FBTyxPQUFPLE9BQU8sR0FBRyxFQUFFLE9BQU8sQ0FBQyxLQUFLLFdBQVcsTUFBTSxRQUFRLENBQUM7QUFDbkU7QUFFTyxTQUFTLFNBQVMsS0FBcUQ7QUFDNUUsU0FBTyxPQUFPLFlBQVksT0FBTyxRQUFRLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQyxFQUFFLE1BQU0sTUFBTSxTQUFTLENBQUMsRUFDNUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQztBQUMzQztBQUVPLFNBQVMsVUFBVSxPQUF5QjtBQUNqRCxNQUFJLENBQUMsTUFBTSxLQUFNLE9BQU0sSUFBSSxNQUFNLDZDQUE2QztBQUM5RSxTQUFPLE1BQU07QUFDZjtBQUtBLFNBQVMsV0FBVyxNQUFjLFNBQWdDO0FBQ2hFLFNBQU8sRUFBRSxJQUFJLE9BQU8sTUFBTSxRQUFRO0FBQ3BDO0FBRUEsU0FBUyxjQUFjLEtBQW9DO0FBQ3pELFFBQU0sVUFBVSxPQUFPLFFBQVEsR0FBRztBQUNsQyxNQUFJLFFBQVEsV0FBVyxFQUFHLFFBQU8sRUFBRSxJQUFJLE9BQU8sU0FBUyxDQUFDLHlDQUF5QyxFQUFFO0FBQ25HLFFBQU0sQ0FBQyxVQUFVLE1BQU0sSUFBSSxRQUFRLENBQUM7QUFDcEMsTUFBSSxDQUFDLGVBQWUsU0FBUyxRQUF3QixLQUFLLENBQUMsT0FBTyxjQUFjLE1BQU0sTUFBTSxVQUFVLE1BQU0sR0FBRztBQUM3RyxXQUFPLEVBQUUsSUFBSSxPQUFPLFNBQVMsQ0FBQyw0Q0FBNEMsRUFBRTtBQUFBLEVBQzlFO0FBQ0EsU0FBTyxFQUFFLElBQUksTUFBTSxVQUFvQyxPQUFPO0FBQ2hFO0FBRUEsU0FBUyxLQUFLLE9BQWMsTUFBOEIsSUFDeEQsV0FBNEIsWUFBaUQ7QUFDN0UsUUFBTSxVQUFVLGNBQWMsU0FBUztBQUN2QyxNQUFJLENBQUMsUUFBUSxHQUFJLFFBQU8sV0FBVyxvQkFBb0IsQ0FBQyxRQUFRLFFBQVEsQ0FBQyxDQUFDLENBQUM7QUFDM0UsUUFBTSxFQUFFLFVBQVUsT0FBTyxJQUFJO0FBQzdCLE9BQUssS0FBSyxRQUFRLEtBQUssS0FBSyxPQUFRLFFBQU8sV0FBVywwQkFBMEIsQ0FBQyxRQUFRLE1BQU0sSUFBSSxPQUFPLFFBQVEsQ0FBQyxVQUFVLEtBQUssUUFBUSxLQUFLLENBQUMsRUFBRSxDQUFDO0FBQ25KLE1BQUksTUFBTSxFQUFFLElBQUksU0FBUyxXQUFZLFFBQU8sV0FBVyxxQkFBcUIsQ0FBQyx3QkFBd0IsVUFBVSxvQkFBb0IsQ0FBQztBQUNwSSxPQUFLLFFBQVEsS0FBSyxLQUFLLFFBQVEsS0FBSyxLQUFLO0FBQ3pDLE1BQUksS0FBSyxRQUFRLE1BQU0sRUFBRyxRQUFPLEtBQUssUUFBUTtBQUM5QyxLQUFHLFFBQVEsS0FBSyxHQUFHLFFBQVEsS0FBSyxLQUFLO0FBQ3JDLFFBQU07QUFDTixTQUFPLEVBQUUsSUFBSSxNQUFNLE9BQU8sRUFBRSxDQUFDLFFBQVEsR0FBRyxPQUFPLEVBQUU7QUFDbkQ7QUFFTyxTQUFTLFNBQVMsT0FBYyxNQUE4QixLQUFtRDtBQUN0SCxRQUFNLE9BQU8sVUFBVSxLQUFLO0FBQzVCLFFBQU0sUUFBUSxLQUFLLFdBQVcsSUFBSSxvQkFBb0I7QUFDdEQsTUFBSSxDQUFDLE1BQU8sUUFBTyxXQUFXLHFCQUFxQixDQUFDLDZCQUE2QixDQUFDO0FBQ2xGLFNBQU8sU0FBUyxZQUNaLEtBQUssT0FBTyxNQUFNLFdBQVcsTUFBTSxXQUFXLEtBQUssTUFBTSxRQUFRLElBQ2pFLEtBQUssT0FBTyxNQUFNLFdBQVcsTUFBTSxXQUFXLEtBQUssZ0JBQWdCO0FBQ3pFO0FBRU8sU0FBUyxnQkFBZ0IsT0FBYyxVQUFvQixPQUEwQztBQUMxRyxRQUFNLE9BQU8sVUFBVSxLQUFLO0FBQzVCLFFBQU0sUUFBUSxLQUFLLFdBQVcsSUFBSSxvQkFBb0I7QUFDdEQsTUFBSSxDQUFDLE1BQU8sUUFBTyxXQUFXLHFCQUFxQixDQUFDLDZCQUE2QixDQUFDO0FBQ2xGLE1BQUksS0FBSyxLQUFLLElBQUksS0FBSyxFQUFHLFFBQU8sV0FBVyxpQkFBaUIsQ0FBQywrQkFBK0IsQ0FBQztBQUM5RixNQUFJLEtBQUssS0FBSyxRQUFRLG9CQUFxQixRQUFPLFdBQVcsYUFBYSxDQUFDLFdBQVcsbUJBQW1CLHFCQUFxQixDQUFDO0FBQy9ILFFBQU0sU0FBUyxRQUFRLFFBQVE7QUFDL0IsYUFBVyxDQUFDLFVBQVUsTUFBTSxLQUFLLE9BQU8sUUFBUSxPQUFPLEtBQUssR0FBRztBQUM3RCxTQUFLLE1BQU0sVUFBVSxRQUFRLEtBQUssTUFBTSxVQUFVLElBQUk7QUFDcEQsYUFBTyxXQUFXLDBCQUEwQixDQUFDLFFBQVEsTUFBTSxJQUFJLE9BQU8sUUFBUSxDQUFDLFVBQVUsTUFBTSxVQUFVLFFBQVEsS0FBSyxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQzVIO0FBQUEsRUFDRjtBQUNBLFFBQU0saUJBQWlCLENBQUMsR0FBRyxLQUFLLEtBQUssT0FBTyxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsTUFBTSxFQUFFLEVBQ3BGLE9BQU8sQ0FBQyxLQUFLQyxTQUFRLE1BQU0sTUFBTSxTQUFTLFFBQVFBLEtBQUksTUFBTSxFQUFFLE1BQWdDLENBQUMsR0FBRyxDQUFDO0FBQ3RHLE1BQUksTUFBTSxNQUFNLFNBQVMsSUFBSSxNQUFNLFNBQVMsT0FBTyxLQUErQixDQUFDLElBQy9FLGlCQUFpQixNQUFNLFNBQVMsT0FBTyxNQUFnQyxDQUFDLElBQUksTUFBTSxVQUFVO0FBQzlGLFdBQU8sV0FBVyxxQkFBcUIsQ0FBQyw0REFBNEQsQ0FBQztBQUFBLEVBQ3ZHO0FBQ0EsYUFBVyxDQUFDLFVBQVUsTUFBTSxLQUFLLE9BQU8sUUFBUSxPQUFPLEtBQUssR0FBRztBQUM3RCxVQUFNLFVBQVUsUUFBUSxLQUFLLE1BQU0sVUFBVSxRQUFRLEtBQUssTUFBTSxVQUFVO0FBQzFFLFFBQUksTUFBTSxVQUFVLFFBQVEsTUFBTSxFQUFHLFFBQU8sTUFBTSxVQUFVLFFBQVE7QUFBQSxFQUN0RTtBQUNBLFFBQU0sTUFBcUIsRUFBRSxJQUFJLE9BQU8sYUFBYSxNQUFNLElBQUksUUFBUSxVQUFVLGdCQUFnQixPQUFPLE1BQU07QUFDOUcsT0FBSyxLQUFLLElBQUksSUFBSSxJQUFJLEdBQUc7QUFDekIsUUFBTTtBQUNOLFNBQU8sRUFBRSxJQUFJLE1BQU0sT0FBTyxFQUFFLEdBQUcsSUFBSSxFQUFFO0FBQ3ZDO0FBR08sU0FBUyxVQUFVLE9BQWMsUUFBc0M7QUFDNUUsUUFBTSxPQUFPLFVBQVUsS0FBSztBQUM1QixNQUFJLENBQUMsY0FBYyxTQUFTLE1BQU0sRUFBRyxRQUFPLFdBQVcsZ0JBQWdCLENBQUMsbUJBQW1CLENBQUM7QUFDNUYsTUFBSSxDQUFDLENBQUMsR0FBRyxNQUFNLFdBQVcsT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxTQUFTLFNBQVMsR0FBRztBQUNyRSxXQUFPLFdBQVcsaUJBQWlCLENBQUMsaURBQWlELENBQUM7QUFBQSxFQUN4RjtBQUNBLE1BQUksS0FBSyxNQUFNLElBQUksTUFBTSxFQUFHLFFBQU8sV0FBVyxpQkFBaUIsQ0FBQyw4QkFBOEIsQ0FBQztBQUMvRixRQUFNLFFBQVEsS0FBSyxXQUFXLElBQUksb0JBQW9CO0FBQ3RELE1BQUksQ0FBQyxVQUFVLE1BQU0sVUFBVSxRQUFRLEtBQUssRUFBRyxRQUFPLFdBQVcsMEJBQTBCLENBQUMsc0NBQXNDLENBQUM7QUFDbkksUUFBTSxVQUFVO0FBQ2hCLE1BQUksTUFBTSxVQUFVLFNBQVMsRUFBRyxRQUFPLE1BQU0sVUFBVTtBQUN2RCxRQUFNLE9BQWlCLEVBQUUsSUFBSSxRQUFRLGFBQWEsS0FBSyxNQUFNLGFBQWEsa0JBQWtCO0FBQzVGLE9BQUssTUFBTSxJQUFJLFFBQVEsSUFBSTtBQUMzQixRQUFNO0FBQ04sU0FBTyxFQUFFLElBQUksTUFBTSxPQUFPLEVBQUUsR0FBRyxLQUFLLEVBQUU7QUFDeEM7QUFFTyxTQUFTLFVBQVUsTUFBZ0IsTUFBdUI7QUFDL0QsU0FBTyxPQUFPLEtBQUssZUFBZSxLQUFLO0FBQ3pDO0FBRU8sU0FBUyxZQUFZLE9BQWMsUUFBNkQ7QUFDckcsUUFBTSxPQUFPLFVBQVUsS0FBSztBQUM1QixRQUFNLE9BQU8sS0FBSyxNQUFNLElBQUksTUFBTTtBQUNsQyxNQUFJLENBQUMsS0FBTSxRQUFPLFdBQVcsZUFBZSxDQUFDLG9CQUFvQixDQUFDO0FBQ2xFLE1BQUksQ0FBQyxVQUFVLE1BQU0sS0FBSyxJQUFJLEVBQUcsUUFBTyxXQUFXLGtCQUFrQixDQUFDLGNBQWMsS0FBSyxlQUFlLEtBQUssT0FBTyxLQUFLLFlBQVksYUFBYSxDQUFDO0FBR25KLFFBQU0sV0FBVyxFQUFFLE1BQU0sR0FBRyxPQUFPLEVBQUU7QUFDckMsTUFBSSxNQUFNLE1BQU0sU0FBUyxJQUFJLFNBQVMsT0FBTyxTQUFTLFFBQVEsa0JBQWtCO0FBQzlFLFdBQU8sV0FBVyxxQkFBcUIsQ0FBQyxvQkFBb0IsZ0JBQWdCLG9CQUFvQixDQUFDO0FBQUEsRUFDbkc7QUFDQSxRQUFNLFVBQVUsUUFBUSxNQUFNLFVBQVUsUUFBUSxLQUFLLFNBQVM7QUFDOUQsUUFBTSxVQUFVLFNBQVMsTUFBTSxVQUFVLFNBQVMsS0FBSyxTQUFTO0FBQ2hFLE9BQUssTUFBTSxPQUFPLE1BQU07QUFDeEIsUUFBTTtBQUNOLFNBQU8sRUFBRSxJQUFJLE1BQU0sT0FBTyxTQUFTO0FBQ3JDO0FBU08sU0FBUyxhQUFhLE9BQWMsT0FBd0M7QUFDakYsUUFBTSxPQUFPLFVBQVUsS0FBSztBQUM1QixNQUFJLENBQUMsT0FBTyxjQUFjLEtBQUssS0FBSyxRQUFRLEtBQUssUUFBUSx1QkFBdUI7QUFDOUUsV0FBTyxXQUFXLHNCQUFzQixDQUFDLHNDQUFzQyxxQkFBcUIsRUFBRSxDQUFDO0FBQUEsRUFDekc7QUFDQSxRQUFNLFlBQTBDLENBQUM7QUFDakQsUUFBTSxXQUFXLEtBQUs7QUFHdEIsV0FBUyxPQUFPLEdBQUcsT0FBTyxPQUFPLFFBQVE7QUFDdkMsU0FBSztBQUNMLGVBQVcsT0FBTyxDQUFDLEdBQUcsS0FBSyxLQUFLLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxHQUFHLGNBQWMsRUFBRSxFQUFFLENBQUMsR0FBRztBQUNsRixVQUFJO0FBQ0osVUFBSSxJQUFJLGlCQUFpQixFQUFHO0FBQzVCLFlBQU0sUUFBUSxLQUFLLFdBQVcsSUFBSSxJQUFJLFdBQVc7QUFDakQsVUFBSSxDQUFDLE1BQU8sT0FBTSxJQUFJLE1BQU0sa0RBQWtEO0FBQzlFLFlBQU0sU0FBUyxTQUFTLFFBQVEsSUFBSSxNQUFNLEVBQUUsTUFBZ0M7QUFDNUUsVUFBSSxNQUFNLE1BQU0sU0FBUyxJQUFJLE1BQU0sTUFBTSxJQUFJLE1BQU0sU0FBVSxPQUFNLElBQUksTUFBTSw2Q0FBNkM7QUFDMUgsaUJBQVcsQ0FBQyxVQUFVLE1BQU0sS0FBSyxPQUFPLFFBQVEsTUFBTSxFQUFHLE9BQU0sVUFBVSxRQUFRLEtBQUssTUFBTSxVQUFVLFFBQVEsS0FBSyxLQUFLO0FBQ3hILFdBQUssS0FBSyxPQUFPLElBQUksRUFBRTtBQUN2QixnQkFBVSxLQUFLLEVBQUUsSUFBSSxJQUFJLElBQUksUUFBUSxJQUFJLFFBQVEsT0FBTyxDQUFDO0FBQUEsSUFDM0Q7QUFBQSxFQUNGO0FBQ0EsUUFBTSxhQUFhLENBQUMsR0FBRyxLQUFLLE1BQU0sT0FBTyxDQUFDLEVBQUUsT0FBTyxDQUFDLFNBQVMsVUFBVSxNQUFNLEtBQUssSUFBSSxLQUNqRixLQUFLLGNBQWMsS0FBSyxjQUFjLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUyxLQUFLLEVBQUUsRUFBRSxLQUFLO0FBQ2pGLFFBQU07QUFDTixTQUFPLEVBQUUsSUFBSSxNQUFNLE9BQU8sRUFBRSxVQUFVLFFBQVEsS0FBSyxNQUFNLGVBQWUsV0FBVyxXQUFXLEVBQUU7QUFDbEc7OztBQ3ZNTyxJQUFNLGtCQUFrQjtBQUN4QixJQUFNLHlCQUF5QjtBQUMvQixJQUFNLDBCQUEwQjtBQUNoQyxJQUFNLDBCQUEwQjtBQUNoQyxJQUFNLHFCQUFxQjtBQUMzQixJQUFNLHdCQUF3QjtBQWtDckMsU0FBUyxZQUFZLEdBQW1CO0FBQ3RDLFNBQU87QUFBQSxJQUNMLElBQUksRUFBRTtBQUFBLElBQUksTUFBTSxFQUFFO0FBQUEsSUFBTSxPQUFPLEVBQUU7QUFBQSxJQUFPLEdBQUcsRUFBRTtBQUFBLElBQUcsR0FBRyxFQUFFO0FBQUEsSUFBRyxHQUFHLEVBQUU7QUFBQSxJQUM3RCxLQUFLLEVBQUU7QUFBQSxJQUFLLE9BQU8sRUFBRTtBQUFBLElBQU8sU0FBUyxFQUFFO0FBQUEsSUFBUyxVQUFVLEVBQUU7QUFBQSxJQUM1RCxXQUFXLEVBQUU7QUFBQSxJQUFXLGlCQUFpQixFQUFFO0FBQUEsSUFBaUIsV0FBVyxFQUFFO0FBQUEsSUFDekUsR0FBSSxFQUFFLGtCQUFrQixTQUFZLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRSxjQUFjO0FBQUEsSUFDMUUsYUFBYSxFQUFFO0FBQUEsSUFBYSxVQUFVLEVBQUU7QUFBQSxFQUMxQztBQUNGO0FBRUEsU0FBUyxlQUFlLEdBQXlCO0FBQy9DLFNBQU87QUFBQSxJQUNMLEdBQUc7QUFBQSxJQUNILFNBQVMsRUFBRSxRQUFRLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUU7QUFBQSxJQUN4QyxNQUFNLE9BQU8sWUFBWSxPQUFPLFFBQVEsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBRSxNQUFNLE9BQU8sVUFBVSxLQUFLLENBQUMsRUFDckYsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQzNDO0FBQ0Y7QUFFTyxTQUFTLG9CQUNkLE9BQWMsZUFBZSxHQUM3QixTQUFrQyxNQUFNLE9BQU8sMEJBQzNDLENBQUMsR0FBRyxNQUFNLFdBQVcsT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxrQkFBa0Isc0JBQXNCLElBQ25GLHlCQUF5QixpQkFDaEI7QUFDZixNQUFJLFdBQVcsNEJBQTRCLE1BQU0sUUFBUSxDQUFDLEdBQUcsTUFBTSxXQUFXLE9BQU8sQ0FBQyxFQUFFO0FBQUEsSUFDdEYsQ0FBQyxNQUFNLFdBQVcsbUJBQW1CLEVBQUUsa0JBQWtCO0FBQUEsRUFDM0QsR0FBSSxPQUFNLElBQUksTUFBTSwyREFBMkQ7QUFDL0UsUUFBTSxPQUEwQjtBQUFBLElBQzlCO0FBQUEsSUFDQSxVQUFVLGNBQWMsS0FBSztBQUFBLElBQzdCLFVBQVUsTUFBTTtBQUFBLElBQ2hCLE9BQU8sQ0FBQyxHQUFHLE1BQU0sTUFBTSxRQUFRLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQyxFQUFFO0FBQUEsTUFDdkUsQ0FBQyxDQUFDLE9BQU8sS0FBSyxPQUFPO0FBQUEsUUFDbkI7QUFBQSxRQUNBLE9BQU8sQ0FBQyxHQUFHLE1BQU0sUUFBUSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUU7QUFBQSxNQUNsRjtBQUFBLElBQ0Y7QUFBQSxJQUNBLFVBQVUsQ0FBQyxHQUFHLE1BQU0sU0FBUyxPQUFPLENBQUMsRUFBRSxPQUFPLENBQUMsT0FBTyxzQkFBc0IsS0FBSyxLQUFLLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxPQUMxRyxFQUFFLFlBQVksTUFBTSxjQUFjLElBQUksRUFBRSxLQUFLLEVBQUUsRUFDbEQsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEdBQUcsY0FBYyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksV0FBVztBQUFBLElBQzNELGNBQWMsQ0FBQyxHQUFHLE1BQU0sYUFBYSxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQztBQUFBLElBQ3hFLGdCQUFnQixDQUFDLEdBQUcsTUFBTSxjQUFjLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQUEsSUFDM0UsV0FBVyxPQUFPLFlBQVksT0FBTyxRQUFRLE1BQU0sU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDLEVBQUUsTUFBTSxNQUFNLFNBQVMsQ0FBQyxFQUM1RixLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDekMsWUFBWSxDQUFDLEdBQUcsTUFBTSxXQUFXLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxHQUFHLGNBQWMsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLGNBQWM7QUFBQSxJQUN0RyxnQkFBZ0IsTUFBTTtBQUFBLElBQ3RCO0FBQUEsRUFDRjtBQUNBLE1BQUksV0FBVyx3QkFBeUIsUUFBTyxFQUFFLEdBQUcsTUFBTSxPQUFPO0FBQ2pFLE1BQUksQ0FBQyxNQUFNLEtBQU0sT0FBTSxJQUFJLE1BQU0sdUNBQXVDO0FBQ3hFLFNBQU87QUFBQSxJQUNMLEdBQUc7QUFBQSxJQUFNO0FBQUEsSUFDVCxNQUFNLE1BQU0sS0FBSztBQUFBLElBQ2pCLFlBQVksQ0FBQyxHQUFHLE1BQU0sS0FBSyxXQUFXLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxHQUFHLGNBQWMsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ25HLElBQUksRUFBRTtBQUFBLE1BQUksR0FBRyxFQUFFO0FBQUEsTUFBRyxHQUFHLEVBQUU7QUFBQSxNQUFHLFVBQVUsRUFBRTtBQUFBLE1BQ3RDLFdBQVcsT0FBTyxZQUFZLE9BQU8sUUFBUSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQyxFQUFFLE1BQU0sTUFBTSxTQUFTLENBQUMsRUFDeEYsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQztBQUFBLElBQzNDLEVBQUU7QUFBQSxJQUNGLE1BQU0sQ0FBQyxHQUFHLE1BQU0sS0FBSyxLQUFLLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxHQUFHLGNBQWMsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFO0FBQUEsSUFDbEcsT0FBTyxDQUFDLEdBQUcsTUFBTSxLQUFLLE1BQU0sT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEdBQUcsY0FBYyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUU7QUFBQSxFQUN0RztBQUNGO0FBR08sU0FBUyxjQUFjQyxPQUFzQjtBQUNsRCxNQUFJLElBQUksWUFBWSxJQUFJO0FBQ3hCLFdBQVMsSUFBSSxHQUFHLElBQUlBLE1BQUssUUFBUSxLQUFLO0FBQ3BDLFVBQU0sSUFBSUEsTUFBSyxXQUFXLENBQUM7QUFDM0IsUUFBSSxLQUFLLEtBQUssSUFBSSxHQUFHLFFBQVU7QUFDL0IsUUFBSSxLQUFLLEtBQUssSUFBSyxJQUFJLEtBQU8sVUFBVTtBQUN4QyxTQUFLLE1BQU07QUFBQSxFQUNiO0FBQ0EsVUFBUSxNQUFNLEdBQUcsU0FBUyxFQUFFLEVBQUUsU0FBUyxHQUFHLEdBQUcsS0FBSyxNQUFNLEdBQUcsU0FBUyxFQUFFLEVBQUUsU0FBUyxHQUFHLEdBQUc7QUFDekY7QUFFTyxTQUFTLG1CQUNkLE9BQWMsZUFBZSxHQUFHLFNBQWtDLHdCQUMxRDtBQUNSLFNBQU8sY0FBYyxLQUFLLFVBQVUsb0JBQW9CLE9BQU8sY0FBYyxNQUFNLENBQUMsQ0FBQztBQUN2RjtBQUVBLFNBQVMsU0FBUyxPQUFrRDtBQUNsRSxTQUFPLE9BQU8sVUFBVSxZQUFZLFVBQVUsUUFBUSxDQUFDLE1BQU0sUUFBUSxLQUFLO0FBQzVFO0FBRUEsU0FBUyxLQUFLLE9BQWdCLFNBQWtDO0FBQzlELFNBQU8sT0FBTyxVQUFVLFlBQVksT0FBTyxjQUFjLEtBQUssS0FBSyxTQUFTLEtBQUssU0FBUztBQUM1RjtBQUVBLFNBQVMsT0FBTyxPQUFpQztBQUMvQyxTQUFPLE9BQU8sVUFBVSxZQUFZLE9BQU8sU0FBUyxLQUFLO0FBQzNEO0FBRUEsU0FBUyxLQUFLLE9BQWdCLFVBQVUsS0FBc0I7QUFDNUQsU0FBTyxPQUFPLFVBQVUsWUFBWSxNQUFNLFNBQVMsS0FBSyxNQUFNLFVBQVU7QUFDMUU7QUFFQSxTQUFTLFdBQVcsS0FBNkI7QUFDL0MsTUFBSSxPQUFPLFFBQVEsWUFBWSxDQUFDLGdCQUFnQixLQUFLLEdBQUcsRUFBRyxRQUFPO0FBQ2xFLFFBQU0sQ0FBQyxJQUFJLEVBQUUsSUFBSSxJQUFJLE1BQU0sR0FBRyxFQUFFLElBQUksTUFBTTtBQUMxQyxTQUFPLE9BQU8sVUFBVSxFQUFFLEtBQUssT0FBTyxVQUFVLEVBQUUsS0FDN0MsTUFBTSxLQUFLLE1BQU0sS0FBSyxLQUFLLG1CQUFtQixLQUFLO0FBQzFEO0FBSU8sU0FBUyxnQkFBZ0IsVUFBaUM7QUFDL0QsU0FBTyxjQUFjLEtBQUssVUFBVSxRQUFRLENBQUM7QUFDL0M7QUFJTyxTQUFTLHFCQUFxQixVQUF3QztBQUMzRSxRQUFNLFdBQVcsSUFBSSxJQUFJLFNBQVMsY0FBYztBQUNoRCxhQUFXLFVBQVUsU0FBUyxVQUFVO0FBQ3RDLFFBQUksbUJBQW1CLE9BQU8sSUFBSSxLQUFLLENBQUMsT0FBTyxTQUFVLFVBQVMsSUFBSSxPQUFPLEVBQUU7QUFBQSxFQUNqRjtBQUNBLFFBQU0sZUFBZSxJQUFJLElBQUksU0FBUyxZQUFZO0FBQ2xELGFBQVcsVUFBVSxTQUFTLFVBQVU7QUFDdEMsUUFBSSxtQkFBbUIsT0FBTyxJQUFJLEdBQUc7QUFDbkMsbUJBQWEsSUFBSSxPQUFPLEtBQUs7QUFDN0IsVUFBSSxDQUFDLE9BQU8sU0FBVSxVQUFTLElBQUksT0FBTyxFQUFFO0FBQUEsSUFDOUM7QUFBQSxFQUNGO0FBQ0EsU0FBTztBQUFBLElBQ0wsR0FBRztBQUFBLElBQ0gsVUFBVSxTQUFTLFNBQVMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsT0FBTyxJQUFJLENBQUM7QUFBQSxJQUMvRSxjQUFjLENBQUMsR0FBRyxZQUFZLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQUEsSUFDakUsZ0JBQWdCLENBQUMsR0FBRyxRQUFRLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQUEsRUFDakU7QUFDRjtBQUNBLElBQU0sZUFBZSxvQkFBSSxJQUFnQjtBQUFBLEVBQ3ZDO0FBQUEsRUFBbUI7QUFBQSxFQUFtQjtBQUFBLEVBQXFCO0FBQUEsRUFDM0Q7QUFBQSxFQUFjO0FBQUEsRUFBbUI7QUFBQSxFQUFvQjtBQUFBLEVBQ3JEO0FBQUEsRUFBWTtBQUFBLEVBQWM7QUFBQSxFQUFZO0FBQ3hDLENBQUM7QUFDRCxJQUFNLFlBQVksb0JBQUksSUFBa0IsQ0FBQyxRQUFRLFNBQVMsT0FBTyxPQUFPLENBQUM7QUFDekUsSUFBTSxtQkFBbUIsSUFBSSxJQUFZLGNBQWM7QUFDdkQsSUFBTSxrQkFBa0Isb0JBQUksSUFBSSxDQUFDLFNBQVMsUUFBUSxTQUFTLENBQUM7QUFDNUQsSUFBTSxlQUFlLG9CQUFJLElBQUk7QUFBQSxFQUMzQjtBQUFBLEVBQVM7QUFBQSxFQUFRO0FBQUEsRUFBUTtBQUFBLEVBQVU7QUFBQSxFQUFRO0FBQUEsRUFBVztBQUFBLEVBQVU7QUFBQSxFQUNoRTtBQUFBLEVBQWE7QUFBQSxFQUFRO0FBQUEsRUFBUTtBQUFBLEVBQVk7QUFBQSxFQUFrQjtBQUM3RCxDQUFDO0FBQ0QsSUFBTSxlQUFlLG9CQUFJLElBQUksQ0FBQyxTQUFTLFdBQVcsU0FBUyxVQUFVLFVBQVUsUUFBUSxRQUFRLFFBQVEsQ0FBQztBQUV4RyxTQUFTLGVBQWUsT0FBZ0IsS0FBMEI7QUFDaEUsTUFBSSxDQUFDLFNBQVMsS0FBSyxLQUFLLENBQUMsS0FBSyxNQUFNLEVBQUUsS0FBSyxJQUFJLElBQUksTUFBTSxFQUFFLEtBQ3RELENBQUMsS0FBSyxNQUFNLElBQUksS0FBSyxDQUFDLGFBQWEsSUFBSSxNQUFNLElBQWtCLEtBQy9ELENBQUMsV0FBVyxNQUFNLEtBQUssS0FDdkIsQ0FBQyxPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sTUFBTSxDQUFDLEtBQ3ZELE1BQU0sSUFBSSxDQUFDLFFBQVEsTUFBTSxLQUFLLFFBQVEsTUFBTSxJQUFJLENBQUMsUUFBUSxNQUFNLEtBQUssUUFDcEUsQ0FBQyxPQUFPLE1BQU0sR0FBRyxLQUFLLENBQUMsT0FBTyxNQUFNLEtBQUssS0FBSyxDQUFDLEtBQUssTUFBTSxTQUFTLEdBQUksS0FDdkUsTUFBTSxhQUFhLFFBQVEsRUFBRSxPQUFPLE1BQU0sYUFBYSxZQUFZLFVBQVUsSUFBSSxNQUFNLFFBQXdCLE1BQy9HLENBQUMsS0FBSyxNQUFNLFdBQVcsR0FBUyxLQUFLLENBQUMsS0FBSyxNQUFNLGlCQUFpQixHQUFTLEtBQzNFLE9BQU8sTUFBTSxjQUFjLGFBQWEsT0FBTyxNQUFNLGdCQUFnQixhQUNyRSxPQUFPLE1BQU0sYUFBYSxhQUMxQixNQUFNLGtCQUFrQixVQUFhLE9BQU8sTUFBTSxrQkFBa0IsV0FBVztBQUNsRixVQUFNLElBQUksTUFBTSxrREFBa0Q7QUFBQSxFQUNwRTtBQUNBLE1BQUksSUFBSSxNQUFNLEVBQUU7QUFDaEIsU0FBTztBQUFBLElBQ0wsSUFBSSxNQUFNO0FBQUEsSUFBSSxNQUFNLE1BQU07QUFBQSxJQUFvQixPQUFPLE1BQU07QUFBQSxJQUMzRCxHQUFHLE1BQU07QUFBQSxJQUFHLEdBQUcsTUFBTTtBQUFBLElBQUcsR0FBRyxNQUFNO0FBQUEsSUFBRyxLQUFLLE1BQU07QUFBQSxJQUFLLE9BQU8sTUFBTTtBQUFBLElBQ2pFLFNBQVMsTUFBTTtBQUFBLElBQVMsVUFBVSxNQUFNO0FBQUEsSUFDeEMsV0FBVyxNQUFNO0FBQUEsSUFBVyxpQkFBaUIsTUFBTTtBQUFBLElBQ25ELFdBQVcsTUFBTTtBQUFBLElBQ2pCLEdBQUksTUFBTSxrQkFBa0IsU0FBWSxDQUFDLElBQUksRUFBRSxlQUFlLE1BQU0sY0FBYztBQUFBLElBQ2xGLGFBQWEsTUFBTTtBQUFBLElBQWEsVUFBVSxNQUFNO0FBQUEsRUFDbEQ7QUFDRjtBQUVBLFNBQVMsa0JBQWtCLE9BQXdDO0FBQ2pFLE1BQUksQ0FBQyxTQUFTLEtBQUssRUFBRyxPQUFNLElBQUksTUFBTSwrQkFBK0I7QUFDckUsUUFBTSxNQUE4QixDQUFDO0FBQ3JDLGFBQVcsT0FBTyxPQUFPLEtBQUssS0FBSyxFQUFFLEtBQUssR0FBRztBQUMzQyxRQUFJLENBQUMsaUJBQWlCLElBQUksR0FBRyxLQUFLLENBQUMsS0FBSyxNQUFNLEdBQUcsR0FBRyxHQUFhLEdBQUc7QUFDbEUsWUFBTSxJQUFJLE1BQU0sMkNBQTJDLEdBQUcsRUFBRTtBQUFBLElBQ2xFO0FBQ0EsUUFBSSxNQUFNLEdBQUcsSUFBSSxFQUFHLEtBQUksR0FBRyxJQUFJLE1BQU0sR0FBRztBQUFBLEVBQzFDO0FBQ0EsU0FBTztBQUNUO0FBRUEsU0FBUyxXQUFXLE9BQXVDO0FBQ3pELFNBQU8sT0FBTyxPQUFPLEtBQUssRUFBRSxPQUFPLENBQUMsS0FBSyxXQUFXLE1BQU0sUUFBUSxDQUFDO0FBQ3JFO0FBRUEsU0FBUyxtQkFBbUIsT0FBOEY7QUFDeEgsTUFBSSxDQUFDLEtBQUssTUFBTSxNQUFNLE9BQU8sZ0JBQWdCLEtBQ3hDLENBQUMsTUFBTSxRQUFRLE1BQU0sVUFBVSxLQUFLLE1BQU0sV0FBVyxXQUFXLEtBQ2hFLENBQUMsTUFBTSxRQUFRLE1BQU0sSUFBSSxLQUFLLE1BQU0sS0FBSyxTQUFTLHVCQUNsRCxDQUFDLE1BQU0sUUFBUSxNQUFNLEtBQUssS0FBSyxNQUFNLE1BQU0sU0FBUyxjQUFjLFFBQVE7QUFDN0UsVUFBTSxJQUFJLE1BQU0sdUNBQXVDO0FBQUEsRUFDekQ7QUFDQSxRQUFNLGFBQXNELENBQUM7QUFDN0QsYUFBVyxPQUFPLE1BQU0sWUFBWTtBQUNsQyxRQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssSUFBSSxPQUFPLHdCQUF3QixJQUFJLE1BQU0sa0JBQWtCLEtBQ2hGLElBQUksTUFBTSxrQkFBa0IsS0FBSyxJQUFJLGFBQWEsa0JBQWtCLFVBQVU7QUFDakYsWUFBTSxJQUFJLE1BQU0sdUNBQXVDO0FBQUEsSUFDekQ7QUFDQSxVQUFNQyxhQUFZLGtCQUFrQixJQUFJLFNBQVM7QUFDakQsUUFBSSxXQUFXQSxVQUFTLElBQUksbUJBQW9CLE9BQU0sSUFBSSxNQUFNLDRCQUE0QjtBQUM1RixlQUFXLEtBQUs7QUFBQSxNQUFFLElBQUk7QUFBQSxNQUFzQixHQUFHLElBQUk7QUFBQSxNQUFHLEdBQUcsSUFBSTtBQUFBLE1BQzNELFVBQVU7QUFBQSxNQUFvQixXQUFBQTtBQUFBLElBQVUsQ0FBQztBQUFBLEVBQzdDO0FBQ0EsTUFBSSxXQUFXLFdBQVcsV0FBVyxDQUFDLEVBQUUsU0FBUztBQUNqRCxRQUFNLE1BQU0sb0JBQUksSUFBWTtBQUM1QixRQUFNLE9BQTBDLENBQUM7QUFDakQsYUFBVyxPQUFPLE1BQU0sTUFBTTtBQUM1QixRQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxLQUFLLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxpQ0FBaUMsS0FBSyxJQUFJLEVBQUUsS0FDcEYsSUFBSSxJQUFJLElBQUksRUFBRSxLQUFLLElBQUksZ0JBQWdCLHdCQUN2QyxJQUFJLFdBQVcsVUFBVSxJQUFJLFdBQVcsYUFDeEMsQ0FBQyxLQUFLLElBQUksZ0JBQWdCLHFCQUFxQixLQUFLLElBQUksaUJBQWlCLEtBQ3pFLElBQUksaUJBQWlCLFFBQVEsSUFBSSxNQUFNLEVBQUUsTUFBTyxPQUFNLElBQUksTUFBTSx3Q0FBd0M7QUFDN0csZ0JBQVksV0FBVyxRQUFRLElBQUksTUFBTSxFQUFFLE1BQWdDO0FBQzNFLFFBQUksSUFBSSxJQUFJLEVBQUU7QUFDZCxTQUFLLEtBQUssRUFBRSxJQUFJLElBQUksSUFBSSxhQUFhLHNCQUFzQixRQUFRLElBQUksUUFBUSxnQkFBZ0IsSUFBSSxlQUFlLENBQUM7QUFBQSxFQUNySDtBQUNBLE1BQUksV0FBVyxtQkFBb0IsT0FBTSxJQUFJLE1BQU0sNENBQTRDO0FBQy9GLE1BQUksTUFBTTtBQUNWLFFBQU0sUUFBNEMsQ0FBQztBQUNuRCxhQUFXLE9BQU8sTUFBTSxPQUFPO0FBQzdCLFFBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDLGNBQWMsU0FBUyxPQUFPLElBQUksRUFBRSxDQUFDLEtBQUssSUFBSSxJQUFJLE9BQU8sSUFBSSxFQUFFLENBQUMsS0FDbEYsQ0FBQyxLQUFLLElBQUksYUFBYSxNQUFNLElBQUksS0FBSyxJQUFJLGdCQUFnQixtQkFBbUI7QUFDaEYsWUFBTSxJQUFJLE1BQU0sbUNBQW1DO0FBQUEsSUFDckQ7QUFDQSxVQUFNLFNBQVMsT0FBTyxJQUFJLEVBQUU7QUFDNUIsUUFBSSxJQUFJLE1BQU07QUFDZCxVQUFNLEtBQUssRUFBRSxJQUFJLFFBQVEsYUFBYSxJQUFJLGFBQWEsYUFBYSxrQkFBa0IsQ0FBQztBQUFBLEVBQ3pGO0FBQ0EsYUFBVyxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsR0FBRyxjQUFjLEVBQUUsRUFBRSxDQUFDO0FBQ2xELE9BQUssS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEdBQUcsY0FBYyxFQUFFLEVBQUUsQ0FBQztBQUM1QyxRQUFNLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxHQUFHLGNBQWMsRUFBRSxFQUFFLENBQUM7QUFDN0MsU0FBTyxFQUFFLE1BQU0sTUFBTSxNQUFNLFlBQVksTUFBTSxNQUFNO0FBQ3JEO0FBRUEsU0FBUyxhQUFhLE9BQXVEO0FBQzNFLFFBQU0sTUFBTSxrQkFBa0IsS0FBSztBQUNuQyxTQUFPO0FBQ1Q7QUFFQSxTQUFTLGtCQUNQLE9BQWdCLEtBQWtCLFFBQ3ZCO0FBQ1gsTUFBSSxDQUFDLFNBQVMsS0FBSyxLQUFLLENBQUMsS0FBSyxNQUFNLEVBQUUsS0FBSyxJQUFJLElBQUksTUFBTSxFQUFFLEtBQ3RELENBQUMsS0FBSyxNQUFNLElBQUksS0FBSyxDQUFDLGdCQUFnQixJQUFJLE1BQU0sSUFBSSxLQUNwRCxDQUFDLEtBQUssTUFBTSxNQUFNLEtBQ2xCLENBQUMsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxNQUFNLEdBQUcsS0FDN0UsQ0FBQyxNQUFNLFFBQVEsTUFBTSxPQUFPLEtBQUssTUFBTSxRQUFRLFNBQVMsTUFDeEQsQ0FBQyxLQUFLLE1BQU0sZUFBZSxPQUFPLGdCQUFnQixLQUFLLE1BQU0sZ0JBQWdCLFFBQzdFLFdBQVcsbUJBQW1CLE1BQU0sa0JBQWtCLFVBQ3RELFdBQVcsbUJBQW1CLE1BQU0sa0JBQWtCLFVBQ3BELE1BQU0sa0JBQWtCLHdCQUF3QjtBQUNyRCxVQUFNLElBQUksTUFBTSxxREFBcUQ7QUFBQSxFQUN2RTtBQUNBLFFBQU0sVUFBZ0MsQ0FBQztBQUN2QyxRQUFNLFlBQVksb0JBQUksSUFBWTtBQUNsQyxhQUFXLE9BQU8sTUFBTSxTQUFTO0FBQy9CLFFBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssSUFBSSxJQUFJLEtBQUssQ0FBQyxhQUFhLElBQUksSUFBSSxJQUFJLEtBQzlELENBQUMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLElBQUksQ0FBQyxLQUNqRCxDQUFDLE9BQU8sSUFBSSxDQUFDLEtBQUssSUFBSSxLQUFLLEtBQUssQ0FBQyxPQUFPLElBQUksQ0FBQyxLQUFLLElBQUksS0FBSyxLQUFLLENBQUMsT0FBTyxJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssS0FDM0YsSUFBSSxRQUFRLFVBQWEsQ0FBQyxPQUFPLElBQUksR0FBRyxLQUN4QyxJQUFJLFNBQVMsV0FBYyxPQUFPLElBQUksU0FBUyxZQUFZLENBQUMsYUFBYSxJQUFJLElBQUksSUFBSSxJQUFJO0FBQzVGLFlBQU0sSUFBSSxNQUFNLGFBQWEsTUFBTSxFQUFFLDZCQUE2QjtBQUFBLElBQ3BFO0FBQ0EsVUFBTSxZQUFZLEtBQUssVUFBVSxHQUFHO0FBQ3BDLFFBQUksVUFBVSxJQUFJLFNBQVMsRUFBRyxPQUFNLElBQUksTUFBTSxhQUFhLE1BQU0sRUFBRSw2QkFBNkI7QUFDaEcsY0FBVSxJQUFJLFNBQVM7QUFDdkIsWUFBUSxLQUFLO0FBQUEsTUFDWCxNQUFNLElBQUk7QUFBQSxNQUNWLEdBQUcsSUFBSTtBQUFBLE1BQUcsR0FBRyxJQUFJO0FBQUEsTUFBRyxHQUFHLElBQUk7QUFBQSxNQUFHLEdBQUcsSUFBSTtBQUFBLE1BQUcsR0FBRyxJQUFJO0FBQUEsTUFBRyxHQUFHLElBQUk7QUFBQSxNQUN6RCxHQUFJLElBQUksUUFBUSxTQUFZLENBQUMsSUFBSSxFQUFFLEtBQUssSUFBSSxJQUFJO0FBQUEsTUFDaEQsR0FBSSxJQUFJLFNBQVMsU0FBWSxDQUFDLElBQUksRUFBRSxNQUFNLElBQUksS0FBNkM7QUFBQSxJQUM3RixDQUFDO0FBQUEsRUFDSDtBQUNBLE1BQUksSUFBSSxNQUFNLEVBQUU7QUFDaEIsU0FBTztBQUFBLElBQ0wsSUFBSSxNQUFNO0FBQUEsSUFBSSxNQUFNLE1BQU07QUFBQSxJQUEyQixRQUFRLE1BQU07QUFBQSxJQUNuRSxHQUFHLE1BQU07QUFBQSxJQUFHLEdBQUcsTUFBTTtBQUFBLElBQUcsR0FBRyxNQUFNO0FBQUEsSUFBRyxLQUFLLE1BQU07QUFBQSxJQUMvQztBQUFBLElBQVMsTUFBTSxhQUFhLE1BQU0sSUFBSTtBQUFBLElBQUcsZUFBZSxNQUFNO0FBQUEsSUFDOUQsR0FBSSxNQUFNLGtCQUFrQixTQUFZLENBQUMsSUFBSSxFQUFFLGVBQWUsdUJBQXVCO0FBQUEsSUFDckYsYUFBYTtBQUFBLEVBQ2Y7QUFDRjtBQUdPLFNBQVMsc0JBQXNCLE9BQStCO0FBQ25FLE1BQUksQ0FBQyxTQUFTLEtBQUssS0FDZCxNQUFNLFdBQVcsbUJBQW1CLE1BQU0sV0FBVywwQkFDckQsTUFBTSxXQUFXLDJCQUNqQixDQUFDLFNBQVMsTUFBTSxRQUFRLEdBQUc7QUFDOUIsVUFBTSxJQUFJLE1BQU0seUNBQXlDO0FBQUEsRUFDM0Q7QUFDQSxRQUFNLFNBQVMsTUFBTTtBQUNyQixRQUFNLElBQUksTUFBTTtBQUNoQixRQUFNLFNBQVM7QUFBQSxJQUNiLE1BQU07QUFBQSxJQUFNLFdBQVc7QUFBQSxJQUFZLE1BQU07QUFBQSxJQUFLLE1BQU07QUFBQSxJQUNwRCxVQUFVO0FBQUEsSUFBRyxrQkFBa0I7QUFBQSxFQUNqQztBQUNBLE1BQUksRUFBRSxXQUFXLEtBQUssQ0FBQyxLQUFLLEVBQUUsTUFBTSxVQUFVLEtBQ3pDLEVBQUUscUJBQXFCLE9BQU8sb0JBQzlCLEVBQUUsU0FBUyxPQUFPLFFBQVEsRUFBRSxjQUFjLE9BQU8sYUFDakQsRUFBRSxTQUFTLE9BQU8sUUFBUSxFQUFFLFNBQVMsT0FBTyxRQUFRLEVBQUUsYUFBYSxPQUFPLFlBQzFFLENBQUMsZ0JBQWdCLEtBQUssT0FBTyxFQUFFLFVBQVUsQ0FBQyxHQUFHO0FBQ2hELFVBQU0sSUFBSSxNQUFNLGlFQUFpRTtBQUFBLEVBQ25GO0FBQ0EsTUFBSSxDQUFDLEtBQUssTUFBTSxVQUFVLE9BQU8sZ0JBQWdCLEtBQzVDLENBQUMsS0FBSyxNQUFNLGNBQWMsR0FBVSxLQUNwQyxPQUFPLE1BQU0sbUJBQW1CLGFBQ2hDLENBQUMsTUFBTSxRQUFRLE1BQU0sS0FBSyxLQUFLLENBQUMsTUFBTSxRQUFRLE1BQU0sUUFBUSxLQUM1RCxDQUFDLE1BQU0sUUFBUSxNQUFNLGNBQWMsS0FDbkMsTUFBTSxTQUFTLFNBQVMseUJBQ3hCLENBQUMsTUFBTSxRQUFRLE1BQU0sWUFBWSxLQUFLLENBQUMsTUFBTSxRQUFRLE1BQU0sVUFBVSxHQUFHO0FBQzNFLFVBQU0sSUFBSSxNQUFNLGlEQUFpRDtBQUFBLEVBQ25FO0FBQ0EsUUFBTSxRQUFRLFlBQVksRUFBRSxJQUFJO0FBRWhDLE1BQUksY0FBYyxLQUFLLEVBQUUsZUFBZSxFQUFFLFdBQVksT0FBTSxJQUFJLE1BQU0saUNBQWlDO0FBRXZHLFFBQU0sUUFBZ0MsQ0FBQztBQUN2QyxNQUFJLFlBQVk7QUFDaEIsUUFBTSxXQUFXLG9CQUFJLElBQVk7QUFDakMsYUFBVyxPQUFPLE1BQU0sT0FBTztBQUM3QixRQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxXQUFXLElBQUksS0FBSyxLQUFLLFNBQVMsSUFBSSxJQUFJLEtBQUssS0FDakUsQ0FBQyxNQUFNLFFBQVEsSUFBSSxLQUFLLEtBQUssSUFBSSxNQUFNLFNBQVMsY0FBYztBQUNqRSxZQUFNLElBQUksTUFBTSx1Q0FBdUM7QUFBQSxJQUN6RDtBQUNBLFVBQU0sVUFBVSxvQkFBSSxJQUFZO0FBQ2hDLFVBQU0sUUFBeUMsQ0FBQztBQUNoRCxlQUFXLFFBQVEsSUFBSSxPQUFPO0FBQzVCLFVBQUksQ0FBQyxTQUFTLElBQUksS0FBSyxDQUFDLEtBQUssS0FBSyxHQUFHLGVBQWUsQ0FBQyxLQUFLLFFBQVEsSUFBSSxLQUFLLENBQUMsS0FDdkUsQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDLEVBQUcsT0FBTSxJQUFJLE1BQU0seUNBQXlDO0FBQ2hGLGNBQVEsSUFBSSxLQUFLLENBQUM7QUFDbEIsWUFBTSxLQUFLLEVBQUUsR0FBRyxLQUFLLEdBQUcsR0FBRyxLQUFLLEVBQUUsQ0FBQztBQUFBLElBQ3JDO0FBQ0EsWUFBUSxNQUFNO0FBQ2QsVUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUM7QUFDOUIsaUJBQWEsTUFBTTtBQUNuQixRQUFJLFlBQVksbUJBQW9CLE9BQU0sSUFBSSxNQUFNLHlDQUF5QztBQUM3RixhQUFTLElBQUksSUFBSSxLQUFLO0FBQ3RCLFVBQU0sS0FBSyxFQUFFLE9BQU8sSUFBSSxPQUFPLE1BQU0sQ0FBQztBQUFBLEVBQ3hDO0FBQ0EsUUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsTUFBTSxjQUFjLEVBQUUsS0FBSyxDQUFDO0FBRW5ELFFBQU0sWUFBWSxvQkFBSSxJQUFZO0FBQ2xDLFFBQU0sV0FBVyxNQUFNLFNBQVMsSUFBSSxDQUFDLE1BQU0sZUFBZSxHQUFHLFNBQVMsQ0FBQztBQUN2RSxRQUFNLGVBQXlCLENBQUM7QUFDaEMsUUFBTSxZQUFZLG9CQUFJLElBQVk7QUFDbEMsYUFBVyxPQUFPLE1BQU0sY0FBYztBQUNwQyxRQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssVUFBVSxJQUFJLEdBQUcsRUFBRyxPQUFNLElBQUksTUFBTSwyQ0FBMkM7QUFDdkcsY0FBVSxJQUFJLEdBQUc7QUFDakIsaUJBQWEsS0FBSyxHQUFHO0FBQUEsRUFDdkI7QUFDQSxhQUFXLFVBQVUsVUFBVTtBQUM3QixRQUFJLENBQUMsT0FBTyxZQUFZLENBQUMsVUFBVSxJQUFJLE9BQU8sS0FBSyxFQUFHLE9BQU0sSUFBSSxNQUFNLFVBQVUsT0FBTyxFQUFFLCtCQUErQjtBQUFBLEVBQzFIO0FBQ0EsZUFBYSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDOUMsUUFBTSxXQUFXLG9CQUFJLElBQVk7QUFDakMsYUFBV0MsT0FBTSxNQUFNLGdCQUFnQjtBQUNyQyxRQUFJLENBQUMsS0FBS0EsR0FBRSxLQUFLLFNBQVMsSUFBSUEsR0FBRSxLQUFLLFVBQVUsSUFBSUEsR0FBRSxLQUFLLENBQUMsa0JBQWtCLEtBQUtBLEdBQUUsR0FBRztBQUNyRixZQUFNLElBQUksTUFBTSxzQ0FBc0M7QUFBQSxJQUN4RDtBQUNBLGFBQVMsSUFBSUEsR0FBRTtBQUFBLEVBQ2pCO0FBQ0EsUUFBTSxpQkFBaUIsQ0FBQyxHQUFHLFFBQVEsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFFdEUsUUFBTSxlQUFlLG9CQUFJLElBQVk7QUFDckMsUUFBTSxhQUFhLE1BQU0sV0FBVyxJQUFJLENBQUMsTUFBTSxrQkFBa0IsR0FBRyxjQUFjLE1BQU0sQ0FBQyxFQUN0RixLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsR0FBRyxjQUFjLEVBQUUsRUFBRSxDQUFDO0FBQzFDLFFBQU0sVUFBVSxrQkFBa0IsTUFBTSxTQUFTO0FBQ2pELE1BQUksV0FBVywyQkFBMkIsV0FBVyxPQUFPLElBQUksaUJBQWtCLE9BQU0sSUFBSSxNQUFNLG9DQUFvQztBQUN0SSxRQUFNLFdBQThCO0FBQUEsSUFDbEM7QUFBQSxJQUNBLFVBQVU7QUFBQSxNQUNSLFFBQVE7QUFBQSxNQUFHLE1BQU0sRUFBRTtBQUFBLE1BQU0sa0JBQWtCLE9BQU87QUFBQSxNQUNsRCxNQUFNLE9BQU87QUFBQSxNQUFNLFdBQVcsT0FBTztBQUFBLE1BQVcsTUFBTSxPQUFPO0FBQUEsTUFDN0QsTUFBTSxPQUFPO0FBQUEsTUFBTSxVQUFVLE9BQU87QUFBQSxNQUFVLFlBQVksRUFBRTtBQUFBLElBQzlEO0FBQUEsSUFDQSxVQUFVLE1BQU07QUFBQSxJQUNoQjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsV0FBVztBQUFBLElBQ1g7QUFBQSxJQUNBLGdCQUFnQixNQUFNO0FBQUEsSUFDdEIsY0FBYyxNQUFNO0FBQUEsRUFDdEI7QUFDQSxRQUFNLFNBQXdCLFdBQVcsMEJBQ3JDLEVBQUUsR0FBRyxVQUFVLFFBQVEseUJBQXlCLEdBQUcsbUJBQW1CLEtBQUssRUFBRSxJQUM3RSxFQUFFLEdBQUcsVUFBVSxPQUF5RTtBQUM1RixNQUFJLEtBQUssVUFBVSxNQUFNLE1BQU0sS0FBSyxVQUFVLEtBQUssR0FBRztBQUNwRCxVQUFNLElBQUksTUFBTSw4REFBOEQ7QUFBQSxFQUNoRjtBQUNBLFNBQU87QUFDVDtBQUVPLFNBQVMsb0JBQW9CLE1BQTZCO0FBQy9ELE1BQUksS0FBSyxTQUFTLHdCQUF5QixPQUFNLElBQUksTUFBTSxzQ0FBc0M7QUFDakcsU0FBTyxzQkFBc0IsS0FBSyxNQUFNLElBQUksQ0FBQztBQUMvQztBQUlPLFNBQVMscUJBQXFCLE9BQWMsT0FBNEI7QUFJN0Usb0JBQWtCLEtBQUs7QUFDdkIsNEJBQTBCLE9BQU8sS0FBSztBQUN4QztBQUdPLFNBQVMsMEJBQTBCLE9BQWMsT0FBNEI7QUFDbEYsUUFBTSxXQUFXLHNCQUFzQixLQUFLO0FBQzVDLE1BQUksU0FBUyxTQUFTLFNBQVMsTUFBTSxLQUFNLE9BQU0sSUFBSSxNQUFNLHdDQUF3QztBQUNuRyxRQUFNLFNBQVM7QUFBQSxJQUNiLE1BQU0sU0FBUyxTQUFTO0FBQUEsSUFDeEIsV0FBVyxTQUFTLFNBQVM7QUFBQSxJQUM3QixNQUFNLFNBQVMsU0FBUztBQUFBLElBQ3hCLE1BQU0sU0FBUyxTQUFTO0FBQUEsSUFDeEIsVUFBVSxTQUFTLFNBQVM7QUFBQSxJQUM1QixrQkFBa0IsU0FBUyxTQUFTO0FBQUEsRUFDdEM7QUFDQSxRQUFNLE9BQU8sTUFBTTtBQUNuQixRQUFNLFNBQVMsTUFBTTtBQUNyQixRQUFNLGFBQWEsTUFBTTtBQUN6QixRQUFNLGNBQWMsTUFBTTtBQUMxQixRQUFNLGVBQWUsTUFBTTtBQUMzQixRQUFNLFdBQVcsTUFBTTtBQUN2QixRQUFNLE1BQU0sTUFBTTtBQUNsQixRQUFNLFlBQVksRUFBRSxHQUFHLFNBQVMsVUFBVTtBQUMxQyxRQUFNLE9BQU8sU0FBUyxXQUFXLDBCQUEwQixnQkFBZ0IsSUFBSTtBQUMvRSxNQUFJLE1BQU0sUUFBUSxTQUFTLFdBQVcseUJBQXlCO0FBQzdELFVBQU0sS0FBSyxPQUFPLFNBQVM7QUFDM0IsZUFBVyxLQUFLLFNBQVMsV0FBWSxPQUFNLEtBQUssV0FBVyxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsR0FBRyxXQUFXLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxDQUFDO0FBQzVHLGVBQVcsS0FBSyxTQUFTLEtBQU0sT0FBTSxLQUFLLEtBQUssSUFBSSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQztBQUNqRSxlQUFXLEtBQUssU0FBUyxNQUFPLE9BQU0sS0FBSyxNQUFNLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFBQSxFQUNyRTtBQUNBLFFBQU0sTUFBTSxNQUFNO0FBQ2xCLFFBQU0sUUFBUSxDQUFDO0FBQ2YsUUFBTSxRQUFRO0FBQUEsSUFDWixpQkFBaUI7QUFBQSxJQUFHLGVBQWU7QUFBQSxJQUFHLGNBQWM7QUFBQSxJQUFHLGNBQWM7QUFBQSxJQUNyRSxVQUFVLFNBQVMsU0FBUztBQUFBLElBQVEsT0FBTztBQUFBLElBQUcsV0FBVztBQUFBLElBQUcsY0FBYztBQUFBLEVBQzVFO0FBQ0EsUUFBTSxXQUFXLFNBQVM7QUFDMUIsUUFBTSxpQkFBaUIsU0FBUztBQUNoQyxhQUFXLE9BQU8sU0FBUyxhQUFjLE9BQU0sY0FBYyxJQUFJLEdBQUc7QUFHcEUsYUFBVyxTQUFTLFNBQVMsT0FBTztBQUNsQyxVQUFNLE1BQU0sSUFBSSxNQUFNLE9BQU8sSUFBSSxJQUFJLE1BQU0sTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQVUsQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUNuRjtBQUdBLE1BQUksTUFBTSxnQkFBZ0I7QUFDeEIsVUFBTSxpQkFBaUI7QUFDdkIsdUJBQW1CLEtBQUs7QUFDeEIsVUFBTSxpQkFBaUI7QUFBQSxFQUN6QjtBQUdBLFFBQU0sV0FBVyxTQUFTO0FBRTFCLGFBQVdBLE9BQU0sU0FBUyxlQUFnQixPQUFNLGVBQWUsSUFBSUEsR0FBRTtBQUdyRSxRQUFNLFNBQVMsTUFBTTtBQUNyQixRQUFNLGFBQWEsTUFBTTtBQUd6QixhQUFXLE9BQU8sU0FBUyxjQUFjO0FBQ3ZDLFVBQU0sQ0FBQyxJQUFJLEVBQUUsSUFBSSxJQUFJLE1BQU0sR0FBRyxFQUFFLElBQUksTUFBTTtBQUMxQyxVQUFNLFFBQVEsWUFBWSxPQUFPLElBQUksRUFBRTtBQUN2QyxRQUFJLENBQUMsTUFBTyxPQUFNLElBQUksTUFBTSx5Q0FBeUMsR0FBRyxFQUFFO0FBQzFFLFVBQU0sUUFBUSxJQUFJLElBQUksU0FBUyxTQUFTLE9BQU8sQ0FBQyxNQUFNLEVBQUUsVUFBVSxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7QUFFdkYsVUFBTSxPQUFPLE1BQU0sYUFBYSxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsT0FBTyxDQUFDQSxRQUFPO0FBQzdELFlBQU0sU0FBUyxNQUFNLFNBQVMsSUFBSUEsR0FBRTtBQUNwQyxhQUFPLENBQUNBLElBQUcsV0FBVyxJQUFJLEtBQUssQ0FBQyxDQUFDLFdBQzNCLENBQUMsbUJBQW1CLE9BQU8sSUFBSSxLQUFLLGNBQWMsS0FBSztBQUFBLElBQy9ELENBQUM7QUFDRCxlQUFXQSxPQUFNLENBQUMsR0FBRyxNQUFNLFNBQVMsS0FBSyxDQUFDLEdBQUc7QUFDM0MsWUFBTSxTQUFTLE1BQU0sU0FBUyxJQUFJQSxHQUFFO0FBQ3BDLFVBQUksUUFBUSxVQUFVLE9BQU8sQ0FBQyxPQUFPLFlBQVksQ0FBQyxNQUFNLElBQUlBLEdBQUUsRUFBRyxPQUFNLFNBQVMsT0FBT0EsR0FBRTtBQUFBLElBQzNGO0FBQ0EsZUFBV0EsT0FBTSxNQUFPLEtBQUksQ0FBQyxJQUFJLFNBQVNBLEdBQUUsRUFBRyxLQUFJLEtBQUtBLEdBQUU7QUFDMUQsVUFBTSxhQUFhLElBQUksS0FBSyxHQUFHO0FBQUEsRUFDakM7QUFDQSxhQUFXLEtBQUssU0FBUyxVQUFVO0FBQ2pDLFVBQU0sU0FBUyxJQUFJLEVBQUUsSUFBSSxZQUFZLENBQUMsQ0FBQztBQUFBLEVBQ3pDO0FBQ0EsYUFBVyxPQUFPLFNBQVMsYUFBYyxPQUFNLGNBQWMsSUFBSSxHQUFHO0FBQ3BFLFFBQU0sTUFBTSxXQUFXLE1BQU0sU0FBUztBQUN0QyxhQUFXLEtBQUssTUFBTSxTQUFTLE9BQU8sR0FBRztBQUN2QyxRQUFJLEVBQUUsS0FBSyxXQUFXLFdBQVcsRUFBRyxPQUFNLE1BQU07QUFDaEQsUUFBSSxFQUFFLFNBQVMsb0JBQXFCLE9BQU0sTUFBTTtBQUFBLEVBQ2xEO0FBQ0EsYUFBVyxLQUFLLFNBQVMsV0FBWSxPQUFNLFdBQVcsSUFBSSxFQUFFLElBQUksZUFBZSxDQUFDLENBQUM7QUFDbkY7QUFFTyxTQUFTLGtCQUFrQixVQUFnQztBQUNoRSxRQUFNLFFBQVEsc0JBQXNCLFFBQVE7QUFDNUMsUUFBTSxRQUFRLFlBQVksTUFBTSxTQUFTLElBQUk7QUFDN0MsdUJBQXFCLE9BQU8sS0FBSztBQUNqQyxTQUFPO0FBQ1Q7OztBQzVmQSxJQUFNLFdBQVcsYUFBYTtBQUM5QixJQUFNLGNBQThCLGdCQUFnQjtBQUNwRCxJQUFNLGNBQThCLGdCQUFnQjtBQU03QyxJQUFNLGNBQW9DO0FBQUEsRUFDL0M7QUFBQSxJQUNFLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLFVBQVU7QUFBQSxJQUNWLGFBQ0U7QUFBQSxJQUdGLFFBQVEsWUFBWSxNQUFNO0FBQUEsSUFDMUIsTUFBTTtBQUFBLElBQ04sTUFBTSxZQUFZLE1BQU07QUFBQSxJQUN4QixRQUFRLFlBQVksTUFBTTtBQUFBLElBQzFCLE9BQU87QUFBQSxJQUNQLE1BQU0sRUFBRSxHQUFHLFdBQVc7QUFBQSxJQUN0QixNQUFNLFlBQVksTUFBTTtBQUFBLElBQ3hCLFVBQVUsWUFBWSxNQUFNO0FBQUEsSUFDNUIsTUFBTSxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBQ0E7QUFBQSxJQUNFLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLFVBQVU7QUFBQSxJQUNWLGFBQ0U7QUFBQSxJQUVGLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLFFBQVE7QUFBQSxJQUNSLE9BQU87QUFBQSxJQUNQLE1BQU0sU0FBUyxTQUFTLEtBQUssU0FBUyxLQUFLLENBQUM7QUFBQSxJQUM1QyxNQUFNO0FBQUEsTUFDSixTQUFTO0FBQUEsTUFDVCxpQkFBaUIsSUFBSTtBQUFBLE1BQ3JCLFVBQVUsQ0FBQyxZQUFZLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDcEM7QUFBQSxFQUNGO0FBQUEsRUFDQTtBQUFBLElBQ0UsSUFBSTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sVUFBVTtBQUFBLElBQ1YsYUFDRTtBQUFBLElBRUYsUUFBUSxZQUFZLEtBQUs7QUFBQSxJQUN6QixNQUFNO0FBQUEsSUFDTixNQUFNLFlBQVksS0FBSztBQUFBLElBQ3ZCLFFBQVE7QUFBQSxJQUNSLE9BQU87QUFBQSxJQUNQLE1BQU0sRUFBRSxHQUFHLGFBQWE7QUFBQSxJQUN4QixVQUFVLFlBQVksS0FBSztBQUFBLElBQzNCLE1BQU07QUFBQSxNQUNKLFNBQVM7QUFBQSxNQUNULGlCQUFpQixJQUFJO0FBQUEsTUFDckIsVUFBVSxDQUFDLFlBQVksU0FBUyxDQUFDLENBQUM7QUFBQSxJQUNwQztBQUFBLElBQ0EsWUFBWTtBQUFBLEVBQ2Q7QUFDRjtBQUVPLFNBQVMsWUFBWUMsS0FBNEI7QUFDdEQsUUFBTSxVQUFVLFlBQVksS0FBSyxDQUFDLE1BQU0sRUFBRSxPQUFPQSxHQUFFO0FBQ25ELE1BQUksQ0FBQyxRQUFTLE9BQU0sSUFBSSxNQUFNLHlCQUF5QkEsR0FBRSxFQUFFO0FBQzNELFNBQU87QUFDVDtBQUVPLFNBQVMsb0JBQW9CLFNBQWtDO0FBQ3BFLFNBQU87QUFBQSxJQUNMLFFBQVEsUUFBUTtBQUFBLElBQ2hCLE1BQU0sUUFBUTtBQUFBLElBQ2QsUUFBUSxRQUFRO0FBQUEsSUFDaEIsT0FBTyxRQUFRO0FBQUEsRUFDakI7QUFDRjtBQUVPLFNBQVMseUJBQ2QsU0FBb0IsZUFDRDtBQUNuQixTQUFPO0FBQUEsSUFDTCxRQUFRLFFBQVE7QUFBQSxJQUNoQixNQUFNLFFBQVE7QUFBQSxJQUNkLE1BQU0sUUFBUTtBQUFBLElBQ2QsUUFBUSxRQUFRO0FBQUEsSUFDaEIsTUFBTSxRQUFRO0FBQUEsSUFDZCxVQUFVLFFBQVE7QUFBQSxJQUNsQixVQUFVLFFBQVE7QUFBQSxJQUNsQixHQUFJLGtCQUFrQixTQUFZLENBQUMsSUFBSSxFQUFFLGNBQWM7QUFBQSxFQUN6RDtBQUNGO0FBRU8sU0FBUyxlQUFlLE9BQWMsU0FBNkI7QUFDeEUsYUFBVyxhQUFhLE1BQU0sV0FBVyxPQUFPLEdBQUc7QUFDakQsUUFBSSxVQUFVLFdBQVcsUUFBUSxVQUFVLFVBQVUsU0FBUyxRQUFRLEtBQU0sUUFBTztBQUFBLEVBQ3JGO0FBQ0EsU0FBTztBQUNUO0FBUU8sU0FBUyxpQkFBaUIsT0FBYyxTQUF1QztBQUNwRixRQUFNLFVBQTZCLENBQUM7QUFDcEMsYUFBVyxDQUFDLFVBQVUsTUFBTSxLQUFLLE9BQU8sUUFBUSxRQUFRLElBQUksR0FBRztBQUM3RCxVQUFNLE9BQU8sVUFBVTtBQUN2QixVQUFNLE9BQU8sTUFBTSxVQUFVLFFBQVEsS0FBSztBQUMxQyxRQUFJLE9BQU8sS0FBTSxTQUFRLEtBQUssRUFBRSxVQUFvQyxNQUFNLEtBQUssQ0FBQztBQUFBLEVBQ2xGO0FBQ0EsU0FBTztBQUNUO0FBc0VPLFNBQVMsYUFDZCxPQUNBLGdCQUNBLHFCQUNBLFNBQ0EsZUFDb0I7QUFDcEIsTUFBSSxlQUFlLE9BQU8sT0FBTyxHQUFHO0FBQ2xDLFdBQU87QUFBQSxNQUNMLElBQUk7QUFBQSxNQUFPO0FBQUEsTUFBUyxPQUFPO0FBQUEsTUFBWSxNQUFNO0FBQUEsTUFDN0MsU0FBUyxDQUFDLEdBQUcsUUFBUSxJQUFJLG1CQUFtQjtBQUFBLE1BQzVDLDBCQUEwQjtBQUFBLE1BQU8sV0FBVztBQUFBLElBQzlDO0FBQUEsRUFDRjtBQUNBLFFBQU0sVUFBVSxpQkFBaUIsT0FBTyxPQUFPO0FBQy9DLE1BQUksUUFBUSxTQUFTLEdBQUc7QUFDdEIsV0FBTztBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQU87QUFBQSxNQUFTLE9BQU87QUFBQSxNQUFZLE1BQU07QUFBQSxNQUM3QyxTQUFTLFFBQVEsSUFBSSxDQUFDLE1BQU0sUUFBUSxFQUFFLElBQUksSUFBSSxFQUFFLFFBQVEsVUFBVSxFQUFFLElBQUksRUFBRTtBQUFBLE1BQzFFLDBCQUEwQjtBQUFBLE1BQU8sV0FBVztBQUFBLElBQzlDO0FBQUEsRUFDRjtBQUVBLFFBQU0sU0FBUyxvQkFBb0IsT0FBTyxDQUFDO0FBQzNDLFFBQU0sV0FBVyxZQUFZLE9BQU8sZ0JBQWdCLG9CQUFvQixPQUFPLEdBQUcsUUFBUSxJQUFJO0FBQzlGLE1BQUksQ0FBQyxTQUFTLElBQUk7QUFDaEIseUJBQXFCLE9BQU8sTUFBTTtBQUNsQyxXQUFPO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFBTztBQUFBLE1BQVMsT0FBTztBQUFBLE1BQVcsTUFBTSxTQUFTO0FBQUEsTUFDckQsU0FBUyxDQUFDLEdBQUcsU0FBUyxTQUFTLDJEQUEyRDtBQUFBLE1BQzFGLDBCQUEwQjtBQUFBLE1BQU8sV0FBVztBQUFBLElBQzlDO0FBQUEsRUFDRjtBQUVBLFFBQU0sUUFBUSxlQUFlLE9BQU8scUJBQXFCLHlCQUF5QixTQUFTLGFBQWEsQ0FBQztBQUN6RyxNQUFJLENBQUMsTUFBTSxJQUFJO0FBQ2IseUJBQXFCLE9BQU8sTUFBTTtBQUNsQyxXQUFPO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFBTztBQUFBLE1BQVMsT0FBTztBQUFBLE1BQWEsTUFBTSxNQUFNO0FBQUEsTUFDcEQsU0FBUztBQUFBLFFBQUMsR0FBRyxNQUFNO0FBQUEsUUFDakI7QUFBQSxNQUEwRjtBQUFBLE1BQzVGLDBCQUEwQjtBQUFBLE1BQU8sV0FBVztBQUFBLElBQzlDO0FBQUEsRUFDRjtBQUVBLFFBQU0sU0FBUyxNQUFNLFdBQVcsSUFBSSxNQUFNLE9BQU8sV0FBVztBQUM1RCxNQUFJLENBQUMsUUFBUTtBQUNYLHlCQUFxQixPQUFPLE1BQU07QUFDbEMsV0FBTztBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQU87QUFBQSxNQUFTLE9BQU87QUFBQSxNQUFhLE1BQU07QUFBQSxNQUM5QyxTQUFTO0FBQUEsUUFBQztBQUFBLFFBQ1I7QUFBQSxNQUEwRjtBQUFBLE1BQzVGLDBCQUEwQjtBQUFBLE1BQU8sV0FBVztBQUFBLElBQzlDO0FBQUEsRUFDRjtBQUVBLFNBQU87QUFBQSxJQUNMLElBQUk7QUFBQSxJQUNKO0FBQUEsSUFDQSxhQUFhLFNBQVM7QUFBQSxJQUN0QixXQUFXLE1BQU07QUFBQSxJQUNqQjtBQUFBLEVBQ0Y7QUFDRjs7O0FDaFNPLElBQU0saUJBQWlCO0FBQ3ZCLElBQU0sd0JBQXdCO0FBQzlCLElBQU0seUJBQXlCO0FBQy9CLElBQU0sc0JBQXNCO0FBd0duQyxTQUFTLE9BQU8sT0FBa0Q7QUFDaEUsU0FBTyxPQUFPLFVBQVUsWUFBWSxVQUFVLFFBQVEsQ0FBQyxNQUFNLFFBQVEsS0FBSztBQUM1RTtBQUNBLFNBQVNDLE1BQUssT0FBaUM7QUFDN0MsU0FBTyxPQUFPLFVBQVUsWUFBWSxPQUFPLGNBQWMsS0FBSyxLQUFLLFNBQVM7QUFDOUU7QUFDQSxTQUFTLEdBQUcsT0FBaUM7QUFDM0MsU0FBTyxPQUFPLFVBQVUsWUFBWSx1Q0FBdUMsS0FBSyxLQUFLO0FBQ3ZGO0FBQ0EsU0FBU0MsVUFBUyxPQUFpQztBQUNqRCxTQUFPLE9BQU8sVUFBVSxZQUFZLE1BQU0sVUFBVSxRQUM5QyxrQkFBa0IsS0FBSyxLQUFLLEtBQzNCLGtDQUFrQyxLQUFLLEtBQUs7QUFDckQ7QUFDQSxTQUFTLFdBQVcsR0FBWSxHQUFxQjtBQUNuRCxNQUFJLE9BQU8sQ0FBQyxLQUFLLE9BQU8sQ0FBQyxHQUFHO0FBQzFCLFVBQU0sUUFBUSxPQUFPLEtBQUssQ0FBQyxFQUFFLEtBQUssR0FBRyxRQUFRLE9BQU8sS0FBSyxDQUFDLEVBQUUsS0FBSztBQUNqRSxXQUFPLEtBQUssVUFBVSxLQUFLLE1BQU0sS0FBSyxVQUFVLEtBQUssS0FDaEQsTUFBTSxNQUFNLENBQUMsUUFBUSxXQUFXLEVBQUUsR0FBRyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUN0RDtBQUNBLFNBQU8sS0FBSyxVQUFVLENBQUMsTUFBTSxLQUFLLFVBQVUsQ0FBQztBQUMvQztBQUVBLFNBQVMsVUFBVSxPQUF3QztBQUN6RCxNQUFJLENBQUMsT0FBTyxLQUFLLEVBQUcsT0FBTSxJQUFJLE1BQU0seUJBQXlCO0FBQzdELFFBQU0sU0FBaUMsQ0FBQztBQUN4QyxhQUFXLE9BQU8sT0FBTyxLQUFLLEtBQUssRUFBRSxLQUFLLEdBQUc7QUFDM0MsUUFBSSxDQUFDLGVBQWUsU0FBUyxHQUFtQixLQUMzQyxDQUFDRCxNQUFLLE1BQU0sR0FBRyxDQUFDLEtBQUssTUFBTSxHQUFHLEtBQUssS0FBSyxNQUFNLEdBQUcsSUFBSSxLQUFlO0FBQ3ZFLFlBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLElBQzNDO0FBQ0EsV0FBTyxHQUFHLElBQUksTUFBTSxHQUFHO0FBQUEsRUFDekI7QUFDQSxTQUFPO0FBQ1Q7QUFHTyxTQUFTLGdCQUFnQixPQUF5QjtBQUN2RCxNQUFJLENBQUMsT0FBTyxLQUFLLEtBQU0sTUFBTSxXQUFXLGtCQUFrQixNQUFNLFdBQVcseUJBQXlCLE1BQU0sV0FBVywwQkFDaEgsQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLENBQUNBLE1BQUssTUFBTSxnQkFBZ0IsRUFBRyxPQUFNLElBQUksTUFBTSwwQkFBMEI7QUFDL0YsTUFBSSxNQUFNLFNBQVMsV0FBVyxDQUFDLFNBQVMsUUFBUSxNQUFNLEVBQUUsU0FBUyxPQUFPLE1BQU0sU0FBUyxDQUFDLEdBQUc7QUFDekYsVUFBTSxVQUFtQixNQUFNLFdBQVcsaUJBQWlCO0FBQUEsTUFDekQsUUFBUSxNQUFNO0FBQUEsTUFBUSxJQUFJLE1BQU07QUFBQSxNQUFJLE1BQU07QUFBQSxNQUMxQyxXQUFXLE1BQU07QUFBQSxNQUEwQixrQkFBa0IsTUFBTTtBQUFBLE1BQ25FLGVBQWUsTUFBTTtBQUFBLElBQ3ZCLElBQUk7QUFBQSxNQUNGLFFBQVE7QUFBQSxNQUFnQixJQUFJLE1BQU07QUFBQSxNQUFJLE1BQU07QUFBQSxNQUM1QyxXQUFXLE1BQU07QUFBQSxNQUEwQixrQkFBa0IsTUFBTTtBQUFBLElBQ3JFO0FBQ0EsUUFBSSxRQUFRLFdBQVcsa0JBQWtCLFFBQVEsa0JBQWtCLHdCQUF3QjtBQUN6RixZQUFNLElBQUksTUFBTSw4QkFBOEI7QUFBQSxJQUNoRDtBQUNBLFFBQUksQ0FBQyxXQUFXLFNBQVMsS0FBSyxFQUFHLE9BQU0sSUFBSSxNQUFNLDZCQUE2QjtBQUM5RSxXQUFPO0FBQUEsRUFDVDtBQUNBLE1BQUksTUFBTSxTQUFTLGFBQWEsTUFBTSxXQUFXLGtCQUFrQkMsVUFBUyxNQUFNLFFBQVEsR0FBRztBQUMzRixVQUFNLFVBQW1CO0FBQUEsTUFDdkIsUUFBUSxNQUFNO0FBQUEsTUFBUSxJQUFJLE1BQU07QUFBQSxNQUFJLE1BQU07QUFBQSxNQUMxQyxVQUFVLE1BQU07QUFBQSxNQUFVLGtCQUFrQixNQUFNO0FBQUEsSUFDcEQ7QUFDQSxRQUFJLENBQUMsV0FBVyxTQUFTLEtBQUssRUFBRyxPQUFNLElBQUksTUFBTSwrQkFBK0I7QUFDaEYsV0FBTztBQUFBLEVBQ1Q7QUFDQSxNQUFJLE1BQU0sV0FBVyx3QkFBd0I7QUFDM0MsVUFBTSxPQUFPLEVBQUUsUUFBUSxNQUFNLFFBQVEsSUFBSSxNQUFNLElBQUksa0JBQWtCLE1BQU0saUJBQWlCO0FBQzVGLFFBQUksVUFBMEI7QUFDOUIsUUFBSSxNQUFNLFNBQVMsYUFBYUEsVUFBUyxNQUFNLFFBQVEsR0FBRztBQUN4RCxnQkFBVTtBQUFBLFFBQUUsUUFBUSxNQUFNO0FBQUEsUUFBUSxJQUFJLE1BQU07QUFBQSxRQUFJLE1BQU0sTUFBTTtBQUFBLFFBQzFELFVBQVUsTUFBTTtBQUFBLFFBQVUsa0JBQWtCLE1BQU07QUFBQSxNQUFpQjtBQUFBLElBQ3ZFLFlBQVksTUFBTSxTQUFTLGFBQWEsTUFBTSxTQUFTLGVBQWUsTUFBTSxnQkFBZ0Isc0JBQXNCO0FBQ2hILGdCQUFVLEVBQUUsR0FBRyxNQUFNLE1BQU0sTUFBTSxNQUFNLGFBQWEsTUFBTSxhQUFhLFdBQVcsVUFBVSxNQUFNLFNBQVMsRUFBRTtBQUFBLElBQy9HLFdBQVcsTUFBTSxTQUFTLGFBQWEsTUFBTSxnQkFBZ0IseUJBQ3ZELE1BQU0sV0FBVyxVQUFVLE1BQU0sV0FBVyxZQUFZO0FBQzVELGdCQUFVLEVBQUUsR0FBRyxNQUFNLE1BQU0sTUFBTSxNQUFNLGFBQWEsTUFBTSxhQUFhLFFBQVEsTUFBTSxPQUFPO0FBQUEsSUFDOUYsV0FBVyxNQUFNLFNBQVMsVUFBVUQsTUFBSyxNQUFNLEtBQUssS0FBSyxNQUFNLFFBQVEsS0FBSyxNQUFNLFNBQVMsSUFBSTtBQUM3RixnQkFBVSxFQUFFLEdBQUcsTUFBTSxNQUFNLE1BQU0sTUFBTSxPQUFPLE1BQU0sTUFBTTtBQUFBLElBQzVELFdBQVcsTUFBTSxTQUFTLFdBQVcsT0FBTyxNQUFNLFdBQVcsWUFBWSxlQUFlLEtBQUssTUFBTSxNQUFNLEdBQUc7QUFDMUcsZ0JBQVUsRUFBRSxHQUFHLE1BQU0sTUFBTSxNQUFNLE1BQU0sUUFBUSxNQUFNLE9BQU87QUFBQSxJQUM5RCxXQUFXLE1BQU0sU0FBUyxrQkFBa0IsT0FBTyxNQUFNLFdBQVcsWUFBWSxlQUFlLEtBQUssTUFBTSxNQUFNLEdBQUc7QUFDakgsZ0JBQVUsRUFBRSxHQUFHLE1BQU0sTUFBTSxNQUFNLE1BQU0sUUFBUSxNQUFNLE9BQU87QUFBQSxJQUM5RDtBQUNBLFFBQUksU0FBUztBQUNYLFVBQUksQ0FBQyxXQUFXLFNBQVMsS0FBSyxFQUFHLE9BQU0sSUFBSSxNQUFNLGlDQUFpQztBQUNsRixhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFDQSxRQUFNLElBQUksTUFBTSxxQkFBcUI7QUFDdkM7QUFFQSxTQUFTLGdCQUFnQixPQUFnQztBQUN2RCxNQUFJLENBQUMsT0FBTyxLQUFLLEVBQUcsT0FBTSxJQUFJLE1BQU0seUJBQXlCO0FBQzdELE1BQUksTUFBTSxTQUFTLFdBQVcsR0FBRyxNQUFNLFdBQVcsR0FBRztBQUNuRCxVQUFNRSxXQUEwQjtBQUFBLE1BQzlCLE1BQU07QUFBQSxNQUFTLGFBQWEsTUFBTTtBQUFBLE1BQ2xDLFVBQVUsVUFBVSxNQUFNLFFBQVE7QUFBQSxNQUFHLGlCQUFpQixVQUFVLE1BQU0sZUFBZTtBQUFBLElBQ3ZGO0FBQ0EsUUFBSSxLQUFLLFVBQVVBLFFBQU8sTUFBTSxLQUFLLFVBQVUsS0FBSyxFQUFHLE9BQU0sSUFBSSxNQUFNLDZCQUE2QjtBQUNwRyxXQUFPQTtBQUFBLEVBQ1Q7QUFDQSxNQUFJLE1BQU0sU0FBUyxhQUFhRCxVQUFTLE1BQU0sUUFBUSxLQUNsRCxDQUFDLFFBQVEsU0FBUyxPQUFPLE9BQU8sRUFBRSxTQUFTLE9BQU8sTUFBTSxRQUFRLENBQUMsS0FDakVELE1BQUssTUFBTSxNQUFNLEtBQUssTUFBTSxTQUFTLEtBQUssTUFBTSxVQUFVLEtBQVc7QUFDeEUsVUFBTUUsV0FBMEI7QUFBQSxNQUM5QixNQUFNO0FBQUEsTUFBVyxVQUFVLE1BQU07QUFBQSxNQUNqQyxVQUFVLE1BQU07QUFBQSxNQUEwQixRQUFRLE1BQU07QUFBQSxJQUMxRDtBQUNBLFFBQUksS0FBSyxVQUFVQSxRQUFPLE1BQU0sS0FBSyxVQUFVLEtBQUssRUFBRyxPQUFNLElBQUksTUFBTSwrQkFBK0I7QUFDdEcsV0FBT0E7QUFBQSxFQUNUO0FBQ0EsTUFBSSxVQUFpQztBQUNyQyxPQUFLLE1BQU0sU0FBUyxhQUFhLE1BQU0sU0FBUyxlQUFlLE1BQU0sZ0JBQWdCLHNCQUFzQjtBQUN6RyxjQUFVLEVBQUUsTUFBTSxNQUFNLE1BQU0sYUFBYSxNQUFNLGFBQWEsV0FBVyxVQUFVLE1BQU0sU0FBUyxFQUFFO0FBQUEsRUFDdEcsV0FBVyxNQUFNLFNBQVMsYUFBYSxHQUFHLE1BQU0sS0FBSyxLQUFLLE1BQU0sZ0JBQWdCLHlCQUMxRSxNQUFNLFdBQVcsVUFBVSxNQUFNLFdBQVcsY0FBY0YsTUFBSyxNQUFNLGNBQWMsS0FBSyxNQUFNLGlCQUFpQixHQUFHO0FBQ3RILGNBQVU7QUFBQSxNQUFFLE1BQU0sTUFBTTtBQUFBLE1BQU0sT0FBTyxNQUFNO0FBQUEsTUFBTyxhQUFhLE1BQU07QUFBQSxNQUNuRSxRQUFRLE1BQU07QUFBQSxNQUFRLGdCQUFnQixNQUFNO0FBQUEsSUFBZTtBQUFBLEVBQy9ELFdBQVcsTUFBTSxTQUFTLFdBQVcsT0FBTyxNQUFNLFdBQVcsWUFBWSxlQUFlLEtBQUssTUFBTSxNQUFNLEtBQ3BHQSxNQUFLLE1BQU0sV0FBVyxLQUFLLE1BQU0sZ0JBQWdCLEdBQUc7QUFDdkQsY0FBVSxFQUFFLE1BQU0sTUFBTSxNQUFNLFFBQVEsTUFBTSxRQUFRLGFBQWEsTUFBTSxhQUFhLGFBQWEsTUFBTSxZQUFZO0FBQUEsRUFDckgsV0FBVyxNQUFNLFNBQVMsa0JBQWtCLE9BQU8sTUFBTSxXQUFXLFlBQVksZUFBZSxLQUFLLE1BQU0sTUFBTSxLQUMzRyxZQUFZLE1BQU0sU0FBUyxLQUFLLE1BQU0sVUFBVSxTQUFTLEtBQUssTUFBTSxVQUFVLFVBQVUsR0FBRztBQUM5RixjQUFVLEVBQUUsTUFBTSxNQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsV0FBVyxFQUFFLE1BQU0sR0FBRyxPQUFPLEVBQUUsRUFBRTtBQUFBLEVBQ3ZGLFdBQVcsTUFBTSxTQUFTLFVBQVVBLE1BQUssTUFBTSxRQUFRLEtBQUtBLE1BQUssTUFBTSxNQUFNLEtBQ3hFLE1BQU0sU0FBUyxNQUFNLFlBQVksTUFBTSxTQUFTLE1BQU0sWUFBWSxNQUNsRSxNQUFNLFFBQVEsTUFBTSxhQUFhLEtBQUssTUFBTSxRQUFRLE1BQU0sVUFBVSxHQUFHO0FBQzFFLFVBQU0sZ0JBQXlGLE1BQU0sY0FBYyxJQUFJLENBQUMsUUFBaUI7QUFDdkksVUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUMsR0FBRyxJQUFJLEVBQUUsS0FBTSxJQUFJLFdBQVcsVUFBVSxJQUFJLFdBQVcsVUFBWSxPQUFNLElBQUksTUFBTSx1QkFBdUI7QUFDL0gsYUFBTyxFQUFFLElBQUksSUFBSSxJQUFJLFFBQVEsSUFBSSxRQUFRLFFBQVEsVUFBVSxJQUFJLE1BQU0sRUFBRTtBQUFBLElBQ3pFLENBQUM7QUFDRCxRQUFJLENBQUMsTUFBTSxXQUFXLE1BQU0sQ0FBQyxTQUFTLE9BQU8sU0FBUyxZQUFZLGVBQWUsS0FBSyxJQUFJLENBQUMsRUFBRyxPQUFNLElBQUksTUFBTSxxQkFBcUI7QUFDbkksY0FBVTtBQUFBLE1BQUUsTUFBTSxNQUFNO0FBQUEsTUFBTSxVQUFVLE1BQU07QUFBQSxNQUFVLFFBQVEsTUFBTTtBQUFBLE1BQ3BFO0FBQUEsTUFBZSxZQUFZLENBQUMsR0FBRyxNQUFNLFVBQVU7QUFBQSxJQUFFO0FBQUEsRUFDckQ7QUFDQSxNQUFJLFNBQVM7QUFDWCxRQUFJLEtBQUssVUFBVSxPQUFPLE1BQU0sS0FBSyxVQUFVLEtBQUssRUFBRyxPQUFNLElBQUksTUFBTSxpQ0FBaUM7QUFDeEcsV0FBTztBQUFBLEVBQ1Q7QUFDQSxRQUFNLElBQUksTUFBTSx5QkFBeUI7QUFDM0M7QUFFQSxTQUFTLFlBQVksT0FBaUQ7QUFDcEUsU0FBTyxPQUFPLEtBQUssS0FBSyxPQUFPLE9BQU8sS0FBSyxFQUFFLE1BQU0sQ0FBQyxXQUFXQSxNQUFLLE1BQU0sQ0FBQztBQUM3RTtBQUVPLFNBQVMsY0FBYyxPQUFPLE1BQU0sU0FBbUMsd0JBQXdDO0FBQ3BILFNBQU87QUFBQSxJQUNMO0FBQUEsSUFBUTtBQUFBLElBQ1Isa0JBQWtCLFVBQVUsc0JBQXNCO0FBQUEsSUFBRyxTQUFTLENBQUM7QUFBQSxFQUNqRTtBQUNGO0FBR08sU0FBUyxnQkFBZ0IsT0FBZ0M7QUFDOUQsTUFBSSxDQUFDLE9BQU8sS0FBSyxLQUFNLE1BQU0sV0FBVyxrQkFBa0IsTUFBTSxXQUFXLHlCQUF5QixNQUFNLFdBQVcsMEJBQ2hILENBQUNBLE1BQUssTUFBTSxJQUFJLEtBQUssTUFBTSxPQUFPLGNBQ2xDLENBQUMsTUFBTSxRQUFRLE1BQU0sT0FBTyxLQUFLLE1BQU0sUUFBUSxTQUFTLHFCQUFxQjtBQUNoRixVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMzQztBQUNBLFFBQU0sVUFBMEI7QUFBQSxJQUM5QixRQUFRLE1BQU07QUFBQSxJQUFRLE1BQU0sTUFBTTtBQUFBLElBQ2xDLGtCQUFrQixVQUFVLE1BQU0sZ0JBQWdCO0FBQUEsSUFBRyxTQUFTLENBQUM7QUFBQSxFQUNqRTtBQUNBLFFBQU0sTUFBTSxvQkFBSSxJQUFZO0FBQzVCLFdBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxRQUFRLFFBQVEsS0FBSztBQUM3QyxVQUFNLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDM0IsUUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLElBQUksYUFBYSxLQUFLLENBQUNBLE1BQUssSUFBSSxRQUFRLEtBQ3ZELE9BQU8sSUFBSSxTQUFTLFlBQVksQ0FBQyxpQkFBaUIsS0FBSyxJQUFJLElBQUksRUFBRyxPQUFNLElBQUksTUFBTSx5Q0FBeUM7QUFDaEksVUFBTSxRQUFzQjtBQUFBLE1BQzFCLFNBQVMsZ0JBQWdCLElBQUksT0FBTztBQUFBLE1BQUcsVUFBVTtBQUFBLE1BQ2pELFVBQVUsSUFBSTtBQUFBLE1BQVUsTUFBTSxJQUFJO0FBQUEsTUFBTSxTQUFTLGdCQUFnQixJQUFJLE9BQU87QUFBQSxJQUM5RTtBQUNBLFNBQUssTUFBTSxRQUFRLFNBQVMsV0FBVyxNQUFNLFFBQVEsU0FBUyxjQUN6RCxNQUFNLFFBQVEsV0FBVyxNQUFNLFFBQVE7QUFDMUMsWUFBTSxJQUFJLE1BQU0sZ0RBQWdEO0FBQUEsSUFDbEU7QUFDQSxRQUFJLEtBQUssVUFBVSxLQUFLLE1BQU0sS0FBSyxVQUFVLEdBQUcsRUFBRyxPQUFNLElBQUksTUFBTSw2QkFBNkI7QUFDaEcsUUFBSSxJQUFJLElBQUksTUFBTSxRQUFRLEVBQUUsRUFBRyxPQUFNLElBQUksTUFBTSw4QkFBOEI7QUFDN0UsUUFBSSxNQUFNLFFBQVEsU0FBUyxNQUFNLFFBQVEsUUFDcEMsTUFBTSxRQUFRLFNBQVMsYUFBYSxNQUFNLFFBQVEsU0FBUyxhQUMzRCxNQUFNLFFBQVEsYUFBYSxNQUFNLFFBQVEsYUFDeEMsTUFBTSxRQUFRLFNBQVMsV0FBVyxNQUFNLFFBQVEsU0FBUyxtQkFDMUQsTUFBTSxRQUFRLFNBQVMsTUFBTSxRQUFRLFFBQVEsTUFBTSxRQUFRLFdBQVcsTUFBTSxRQUFRLFdBQ25GLE1BQU0sUUFBUSxTQUFTLGFBQWEsTUFBTSxRQUFRLFNBQVMsZUFDNUQsTUFBTSxRQUFRLFNBQVMsTUFBTSxRQUFRLFNBQ3BDLE1BQU0sUUFBUSxnQkFBZ0IsTUFBTSxRQUFRLGVBQzNDLEtBQUssVUFBVSxNQUFNLFFBQVEsU0FBUyxNQUFNLEtBQUssVUFBVSxNQUFNLFFBQVEsU0FBUyxNQUNwRixNQUFNLFFBQVEsU0FBUyxhQUFhLE1BQU0sUUFBUSxTQUFTLGNBQzFELE1BQU0sUUFBUSxnQkFBZ0IsTUFBTSxRQUFRLGVBQWUsTUFBTSxRQUFRLFdBQVcsTUFBTSxRQUFRLFdBQ25HLE1BQU0sUUFBUSxTQUFTLFVBQVUsTUFBTSxRQUFRLFNBQVMsVUFDeEQsTUFBTSxRQUFRLFNBQVMsTUFBTSxRQUFRLGFBQWEsTUFBTSxRQUFRLE9BQU87QUFDMUUsWUFBTSxJQUFJLE1BQU0sc0NBQXNDO0FBQUEsSUFDeEQ7QUFDQSxRQUFJLElBQUksTUFBTSxRQUFRLEVBQUU7QUFDeEIsWUFBUSxRQUFRLEtBQUssS0FBSztBQUFBLEVBQzVCO0FBQ0EsTUFBSSxLQUFLLFVBQVUsT0FBTyxNQUFNLEtBQUssVUFBVSxLQUFLLEVBQUcsT0FBTSxJQUFJLE1BQU0sK0JBQStCO0FBR3RHLE1BQUksS0FBSyxVQUFVLFFBQVEsZ0JBQWdCLE1BQU0sS0FBSyxVQUFVLGNBQWMsTUFBTSxNQUFNLE1BQU0sTUFBTSxFQUFFLGdCQUFnQixHQUFHO0FBQ3pILFVBQU0sSUFBSSxNQUFNLDZEQUE2RDtBQUFBLEVBQy9FO0FBQ0EsU0FBTztBQUNUO0FBRUEsU0FBUyx1QkFBdUIsT0FBOEI7QUFDNUQsU0FBTywwQ0FBMEM7QUFBQSxJQUMvQyxNQUFNLFFBQVEsU0FBUyxZQUFZLE1BQU0sUUFBUSxXQUFXLE1BQU0sUUFBUSxTQUFTLFlBQVksTUFBTSxRQUFRLFdBQVc7QUFBQSxFQUMxSDtBQUNGO0FBRU8sSUFBTSxjQUFOLE1BQU0sYUFBWTtBQUFBLEVBTWYsWUFBcUIsT0FBYyxTQUF5QjtBQUF2QztBQUMzQixTQUFLLFVBQVU7QUFDZixlQUFXLFNBQVMsUUFBUSxRQUFTLE1BQUssSUFBSSxJQUFJLE1BQU0sUUFBUSxJQUFJLEtBQUs7QUFDekUsU0FBSyxpQkFBaUIsSUFBSSxnQkFBZ0IsRUFBRSxVQUFVLFlBQVksU0FBUyxDQUFDO0FBQzVFLFNBQUssc0JBQXNCLElBQUkseUJBQXlCLEVBQUUsVUFBVSxZQUFZLFNBQVMsQ0FBQztBQUFBLEVBQzVGO0FBQUEsRUFMNkI7QUFBQSxFQUxwQjtBQUFBLEVBQ1E7QUFBQSxFQUNBO0FBQUEsRUFDQSxNQUFNLG9CQUFJLElBQTBCO0FBQUEsRUFTckQsT0FBTyxRQUFRLE9BQU8sTUFBbUI7QUFDdkMsV0FBTyxJQUFJLGFBQVksYUFBYSxJQUFJLEdBQUcsY0FBYyxJQUFJLENBQUM7QUFBQSxFQUNoRTtBQUFBO0FBQUEsRUFHQSxPQUFPLGNBQWMsT0FBTyxNQUFNLFNBQStELGdCQUE2QjtBQUM1SCxXQUFPLElBQUksYUFBWSxhQUFhLE1BQU0sVUFBVSxzQkFBc0IsR0FBRyxNQUFNLEdBQUcsY0FBYyxNQUFNLE1BQU0sQ0FBQztBQUFBLEVBQ25IO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE9BQU8sT0FBTyxPQUE2QjtBQUN6QyxVQUFNLFVBQVUsZ0JBQWdCLEtBQUs7QUFDckMsUUFBSTtBQUNGLGFBQU8sYUFBWSxjQUFjLE9BQU87QUFBQSxJQUMxQyxTQUFTLGNBQWM7QUFDckIsVUFBSSxDQUFDLFFBQVEsUUFBUSxLQUFLLG9CQUFvQixFQUFHLE9BQU07QUFDdkQsVUFBSTtBQUNGLGVBQU8sYUFBWSxzQkFBc0IsT0FBTyxFQUFFO0FBQUEsTUFDcEQsU0FBUyxpQkFBaUI7QUFHeEIsWUFBSTtBQUNGLGlCQUFPLGFBQVksY0FBYyxPQUFPO0FBQUEsUUFDMUMsUUFBUTtBQUNOLGdCQUFNO0FBQUEsUUFDUjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFHQSxPQUFPLFFBQVEsZUFBOEIsY0FBb0M7QUFDL0UsVUFBTSxVQUFVLGdCQUFnQixZQUFZO0FBQzVDLFVBQU0sV0FBVyxzQkFBc0IsYUFBYTtBQUNwRCxRQUFJLFNBQVMsV0FBVyxRQUFRLE9BQVEsT0FBTSxJQUFJLE1BQU0scUNBQXFDO0FBQzdGLFVBQU0sT0FBTyxTQUFTO0FBQ3RCLFFBQUksT0FBTyxRQUFRLFFBQVEsT0FBUSxPQUFNLElBQUksTUFBTSxrQ0FBa0M7QUFJckYsUUFBSSxDQUFDLFNBQVMsU0FBUyxLQUFLLENBQUMsV0FBVyxtQkFBbUIsT0FBTyxJQUFJLENBQUMsR0FBRztBQUN4RSxVQUFJO0FBQUUsZUFBTyxhQUFZLGVBQWUsVUFBVSxTQUFTLElBQUk7QUFBQSxNQUFHLFFBQVE7QUFBQSxNQUFzQztBQUFBLElBQ2xIO0FBQ0EsUUFBSSxPQUFPLEtBQUssU0FBUyxTQUFTLEtBQUssQ0FBQyxXQUFXLG1CQUFtQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBSW5GLFlBQU1HLGNBQWEsUUFBUSxRQUFRLEtBQUssc0JBQXNCLEtBQ3pELFNBQVMsU0FBUyxLQUFLLENBQUMsV0FBVyxtQkFBbUIsT0FBTyxJQUFJLENBQUM7QUFNdkUsVUFBSSxDQUFDLFNBQVMsU0FBUyxLQUFLLENBQUMsV0FBVyxtQkFBbUIsT0FBTyxJQUFJLENBQUMsR0FBRztBQUN4RSxZQUFJO0FBQUUsaUJBQU8sYUFBWSxlQUFlLFVBQVUsU0FBUyxJQUFJO0FBQUEsUUFBRyxRQUFRO0FBQUEsUUFBb0M7QUFBQSxNQUNoSDtBQUNBLFVBQUlBLGFBQVk7QUFDZCxjQUFNLGdCQUFnQixhQUFZLHNCQUFzQixPQUFPO0FBQy9ELGNBQU0sV0FBVyxjQUFjLFVBQVUsSUFBSSxJQUFJO0FBQ2pELGNBQU0sV0FBVyxXQUFXLHFCQUFxQixRQUFRLElBQUk7QUFDN0QsWUFBSSxZQUFZLGdCQUFnQixRQUFRLE1BQU0sZ0JBQWdCLFFBQVE7QUFDcEUsaUJBQU8sY0FBYztBQUN2QixZQUFJLFNBQVMsU0FBUyxLQUFLLENBQUMsV0FBVyxtQkFBbUIsT0FBTyxJQUFJLENBQUMsS0FDakUsWUFBWSxnQkFBZ0IsUUFBUSxNQUFNLGdCQUFnQixRQUFRO0FBQ3JFLGlCQUFPLGNBQWM7QUFDdkIsWUFBSSxTQUFTLFNBQVMsS0FBSyxDQUFDLFdBQVcsbUJBQW1CLE9BQU8sSUFBSSxDQUFDLEdBQUc7QUFDdkUsZ0JBQU0sSUFBSSxNQUFNLGtFQUFrRTtBQUFBLFFBQ3BGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFDQSxRQUFJLE9BQU8sRUFBRyxRQUFPLGFBQVksZUFBZSxVQUFVLFNBQVMsSUFBSTtBQUN2RSxVQUFNLGFBQWEsUUFBUSxRQUFRLEtBQUssb0JBQW9CO0FBQzVELFFBQUksWUFBWTtBQUNkLFVBQUk7QUFBRSxlQUFPLGFBQVksZUFBZSxVQUFVLFNBQVMsSUFBSTtBQUFBLE1BQUcsUUFBUTtBQUFBLE1BQWdDO0FBQzFHLFlBQU0sZ0JBQWdCLGFBQVksc0JBQXNCLE9BQU87QUFDL0QsWUFBTSxhQUFhLGNBQWMsVUFBVSxJQUFJLENBQUM7QUFDaEQsVUFBSSxnQkFBZ0IsUUFBUSxNQUFNLGdCQUFnQixVQUFVLEVBQUcsUUFBTyxjQUFjO0FBQUEsSUFDdEY7QUFDQSxXQUFPLGFBQVksZUFBZSxVQUFVLFNBQVMsSUFBSTtBQUFBLEVBQzNEO0FBQUE7QUFBQSxFQUdBLE9BQWUsY0FBYyxTQUFzQztBQUNqRSxVQUFNLFVBQVUsSUFBSTtBQUFBLE1BQ2xCLGFBQWEsUUFBUSxNQUFNLFFBQVEsa0JBQWtCLFFBQVEsTUFBTTtBQUFBLE1BQ25FLGNBQWMsUUFBUSxNQUFNLFFBQVEsTUFBTTtBQUFBLElBQzVDO0FBQ0EsZUFBVyxTQUFTLFFBQVEsUUFBUyxTQUFRLFlBQVksS0FBSztBQUM5RCxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsT0FBZSxlQUFlLFVBQXlCLFNBQXlCLE1BQTJCO0FBQ3pHLFVBQU0sUUFBUSxrQkFBa0IsUUFBUTtBQUN4QyxRQUFJLE1BQU0sU0FBUyxRQUFRLEtBQU0sT0FBTSxJQUFJLE1BQU0sbUNBQW1DO0FBQ3BGLFVBQU0sVUFBVSxhQUFhLFFBQVEsTUFBTSxRQUFRLGtCQUFrQixRQUFRLE1BQU07QUFDbkYsUUFBSSxTQUFTLEtBQUssZ0JBQWdCLFFBQVEsTUFBTSxtQkFBbUIsU0FBUyxHQUFHLFFBQVEsTUFBTSxHQUFHO0FBQzlGLFlBQU0sSUFBSSxNQUFNLHVEQUF1RDtBQUFBLElBQ3pFO0FBQ0EsUUFBSSxPQUFPLEtBQUssZ0JBQWdCLFFBQVEsTUFBTSxRQUFRLFFBQVEsT0FBTyxDQUFDLEVBQUUsTUFBTTtBQUM1RSxZQUFNLElBQUksTUFBTSxtREFBbUQ7QUFBQSxJQUNyRTtBQUNBLFVBQU0sVUFBVSxhQUFZLHNCQUFzQixPQUFPO0FBQUEsTUFDdkQsUUFBUSxRQUFRO0FBQUEsTUFBUSxNQUFNLFFBQVE7QUFBQSxNQUN0QyxrQkFBa0IsRUFBRSxHQUFHLFFBQVEsaUJBQWlCO0FBQUEsTUFBRyxTQUFTLFFBQVEsUUFBUSxNQUFNLEdBQUcsSUFBSTtBQUFBLElBQzNGLENBQUM7QUFDRCxlQUFXLFNBQVMsUUFBUSxRQUFRLE1BQU0sSUFBSSxFQUFHLFNBQVEsWUFBWSxLQUFLO0FBQzFFLFdBQU87QUFBQSxFQUNUO0FBQUE7QUFBQSxFQUdBLE9BQWUsc0JBQXNCLE9BQWMsU0FBc0M7QUFDdkYsV0FBTyxJQUFJLGFBQVksT0FBTyxPQUFPO0FBQUEsRUFDdkM7QUFBQTtBQUFBLEVBR0EsT0FBTyxrQkFBa0IsT0FBMkI7QUFDbEQsV0FBTyxJQUFJLGFBQVksT0FBTyxjQUFjLE1BQU0sTUFBTSxNQUFNLE9BQU8seUJBQ2pFLE1BQU0sV0FBVyxPQUFPLElBQUksd0JBQXdCLGNBQWMsQ0FBQztBQUFBLEVBQ3pFO0FBQUE7QUFBQSxFQUdBLE9BQU8sdUJBQXVCLE9BQU8sTUFBTSxTQUFtQyxnQkFBdUI7QUFDbkcsV0FBTyx1QkFBdUIsTUFBTSxVQUFVLHNCQUFzQixHQUFHLE1BQU07QUFBQSxFQUMvRTtBQUFBLEVBRUEsT0FBZSxzQkFBc0IsU0FFbkM7QUFDQSxVQUFNLGtCQUFrQix1QkFBdUIsUUFBUSxNQUFNLFFBQVEsa0JBQWtCLFFBQVEsTUFBTTtBQUNyRyxVQUFNLFlBQVksb0JBQUksSUFBMkI7QUFDakQsY0FBVSxJQUFJLEdBQUcsb0JBQW9CLGlCQUFpQixHQUFHLFFBQVEsTUFBTSxDQUFDO0FBQ3hFLFVBQU0sU0FBUyxJQUFJLGFBQVksaUJBQWlCLGNBQWMsUUFBUSxNQUFNLFFBQVEsTUFBTSxDQUFDO0FBQzNGLFVBQU0sa0JBQWtCLGNBQWMsUUFBUSxNQUFNLFFBQVEsTUFBTTtBQUNsRSxlQUFXLFNBQVMsUUFBUSxTQUFTO0FBQ25DLGFBQU8sWUFBWSxLQUFLO0FBQ3hCLFlBQU0sV0FBVyxvQkFBb0IsT0FBTyxPQUFPLE9BQU8sY0FBYyxRQUFRLE1BQU07QUFDdEYsZ0JBQVUsSUFBSSxPQUFPLGNBQWMsUUFBUTtBQUczQyxZQUFNLE9BQU8sZ0JBQWdCLHFCQUFxQixRQUFRLENBQUM7QUFDM0Qsc0JBQWdCLFFBQVEsS0FBSyxLQUFLO0FBQUEsSUFDcEM7QUFDQSxVQUFNLFVBQVUsYUFBWSxzQkFBc0IsT0FBTyxPQUFPLGVBQWU7QUFDL0UsV0FBTyxFQUFFLFNBQVMsUUFBUSxxQkFBcUIsR0FBRyxVQUFVO0FBQUEsRUFDOUQ7QUFBQSxFQUVRLGlCQUEwQztBQUFFLFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFBUTtBQUFBLEVBRWhGLElBQUksZUFBdUI7QUFBRSxXQUFPLEtBQUssUUFBUSxRQUFRO0FBQUEsRUFBUTtBQUFBLEVBQ2pFLElBQUksV0FBMEI7QUFDNUIsV0FBTyxvQkFBb0IsS0FBSyxPQUFPLEtBQUssY0FBYyxLQUFLLGVBQWUsQ0FBQztBQUFBLEVBQ2pGO0FBQUEsRUFDQSxJQUFJLFlBQW9CO0FBQ3RCLFdBQU8sbUJBQW1CLEtBQUssT0FBTyxLQUFLLGNBQWMsS0FBSyxlQUFlLENBQUM7QUFBQSxFQUNoRjtBQUFBLEVBRUEsVUFBVSxNQUF1QixRQUF3QjtBQUd2RCxXQUFPLEdBQUcsSUFBSSxJQUFJLEtBQUssWUFBWSxJQUFJLG1CQUFtQixNQUFNLENBQUM7QUFBQSxFQUNuRTtBQUFBLEVBRUEsTUFBTSxVQUE0QztBQUFFLFdBQU8sS0FBSyxRQUFRLFFBQVEsUUFBUTtBQUFBLEVBQUc7QUFBQSxFQUUzRixTQUFTLE9BQW1EO0FBQzFELFFBQUk7QUFDSixRQUFJO0FBQUUsZ0JBQVUsZ0JBQWdCLEtBQUs7QUFBQSxJQUFHLFNBQVNDLFFBQU87QUFDdEQsYUFBTyxLQUFLO0FBQUEsUUFBTyxPQUFPLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxXQUFXLE1BQU0sS0FBSztBQUFBLFFBQzVFO0FBQUEsUUFBbUIsQ0FBRUEsT0FBZ0IsT0FBTztBQUFBLE1BQUM7QUFBQSxJQUNqRDtBQUNBLFNBQUssUUFBUSxTQUFTLFdBQVcsUUFBUSxTQUFTLGNBQzdDLFFBQVEsV0FBVyxLQUFLLFFBQVEsVUFDaEMsUUFBUSxTQUFTLFdBQVcsUUFBUSxTQUFTLGFBQzNDLEtBQUssUUFBUSxXQUFXLHdCQUF3QjtBQUNyRCxhQUFPLEtBQUssT0FBTyxRQUFRLElBQUksbUJBQW1CLENBQUMsa0RBQWtELENBQUM7QUFBQSxJQUN4RztBQUNBLFVBQU0sUUFBUSxLQUFLLElBQUksSUFBSSxRQUFRLEVBQUU7QUFDckMsUUFBSSxPQUFPO0FBQ1QsVUFBSSxDQUFDLFdBQVcsTUFBTSxTQUFTLE9BQU8sR0FBRztBQUN2QyxlQUFPLEtBQUssT0FBTyxRQUFRLElBQUksd0JBQXdCLENBQUMsaURBQWlELENBQUM7QUFBQSxNQUM1RztBQUNBLGFBQU8sS0FBSyxRQUFRLE9BQU8sSUFBSTtBQUFBLElBQ2pDO0FBQ0EsUUFBSSxRQUFRLHFCQUFxQixLQUFLLE1BQU0sVUFBVTtBQUNwRCxhQUFPLEtBQUssT0FBTyxRQUFRLElBQUksa0JBQWtCO0FBQUEsUUFDL0MsNEJBQTRCLFFBQVEsZ0JBQWdCLGlCQUFpQixLQUFLLE1BQU0sUUFBUTtBQUFBLE1BQzFGLENBQUM7QUFBQSxJQUNIO0FBQ0EsVUFBTSxTQUFTLEtBQUs7QUFDcEIsUUFBSTtBQUNKLFFBQUksUUFBUSxTQUFTLFNBQVM7QUFDNUIsWUFBTSxTQUFTO0FBQUEsUUFBYSxLQUFLO0FBQUEsUUFBTyxLQUFLO0FBQUEsUUFBZ0IsS0FBSztBQUFBLFFBQ2hFLFlBQVksUUFBUSxTQUFTO0FBQUEsUUFDN0IsbUJBQW1CLFVBQVUsUUFBUSxnQkFBZ0I7QUFBQSxNQUFTO0FBQ2hFLFVBQUksQ0FBQyxPQUFPLElBQUk7QUFDZCxZQUFJLEtBQUssY0FBYyxPQUFRLE9BQU0sSUFBSSxNQUFNLDRDQUE0QztBQUMzRixlQUFPLEtBQUssT0FBTyxRQUFRLElBQUksT0FBTyxNQUFNLE9BQU8sT0FBTztBQUFBLE1BQzVEO0FBQ0EsZ0JBQVU7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUFTLGFBQWEsT0FBTyxPQUFPO0FBQUEsUUFDMUMsVUFBVSxVQUFVLE9BQU8sVUFBVSxRQUFRO0FBQUEsUUFDN0MsaUJBQWlCLFVBQVUsT0FBTyxZQUFZLGVBQWU7QUFBQSxNQUMvRDtBQUFBLElBQ0YsV0FBVyxRQUFRLFNBQVMsV0FBVztBQUNyQyxZQUFNLFNBQVMsY0FBYyxLQUFLLE9BQU8sUUFBUSxRQUFRO0FBQ3pELFVBQUksQ0FBQyxPQUFRLFFBQU8sS0FBSyxPQUFPLFFBQVEsSUFBSSxtQkFBbUIsQ0FBQywrQ0FBK0MsQ0FBQztBQUNoSCxnQkFBVTtBQUFBLFFBQ1IsTUFBTTtBQUFBLFFBQVcsVUFBVSxPQUFPLE9BQU87QUFBQSxRQUN6QyxVQUFVLE9BQU87QUFBQSxRQUFVLFFBQVEsT0FBTztBQUFBLE1BQzVDO0FBQUEsSUFDRixXQUFXLFFBQVEsU0FBUyxhQUFhLFFBQVEsU0FBUyxZQUFZO0FBQ3BFLFlBQU0sU0FBUyxTQUFTLEtBQUssT0FBTyxRQUFRLE1BQU0sUUFBUSxTQUFTO0FBQ25FLFVBQUksQ0FBQyxPQUFPLElBQUk7QUFDZCxZQUFJLEtBQUssY0FBYyxPQUFRLE9BQU0sSUFBSSxNQUFNLCtDQUErQztBQUM5RixlQUFPLEtBQUssT0FBTyxRQUFRLElBQUksT0FBTyxNQUFNLE9BQU8sT0FBTztBQUFBLE1BQzVEO0FBQ0EsZ0JBQVUsRUFBRSxNQUFNLFFBQVEsTUFBTSxhQUFhLHNCQUFzQixXQUFXLE9BQU8sTUFBTTtBQUFBLElBQzdGLFdBQVcsUUFBUSxTQUFTLFdBQVc7QUFDckMsWUFBTSxTQUFTLGdCQUFnQixLQUFLLE9BQU8sUUFBUSxRQUFRLFFBQVEsRUFBRTtBQUNyRSxVQUFJLENBQUMsT0FBTyxHQUFJLFFBQU8sS0FBSyxPQUFPLFFBQVEsSUFBSSxPQUFPLE1BQU0sT0FBTyxPQUFPO0FBQzFFLGdCQUFVO0FBQUEsUUFBRSxNQUFNO0FBQUEsUUFBVyxPQUFPLE9BQU8sTUFBTTtBQUFBLFFBQUksYUFBYSxPQUFPLE1BQU07QUFBQSxRQUM3RSxRQUFRLE9BQU8sTUFBTTtBQUFBLFFBQVEsZ0JBQWdCLE9BQU8sTUFBTTtBQUFBLE1BQWU7QUFBQSxJQUM3RSxXQUFXLFFBQVEsU0FBUyxRQUFRO0FBQ2xDLFlBQU0sU0FBUyxhQUFhLEtBQUssT0FBTyxRQUFRLEtBQUs7QUFDckQsVUFBSSxDQUFDLE9BQU8sR0FBSSxRQUFPLEtBQUssT0FBTyxRQUFRLElBQUksT0FBTyxNQUFNLE9BQU8sT0FBTztBQUMxRSxnQkFBVSxFQUFFLE1BQU0sUUFBUSxHQUFHLE9BQU8sTUFBTTtBQUFBLElBQzVDLFdBQVcsUUFBUSxTQUFTLFNBQVM7QUFDbkMsWUFBTSxTQUFTLFVBQVUsS0FBSyxPQUFPLFFBQVEsTUFBTTtBQUNuRCxVQUFJLENBQUMsT0FBTyxHQUFJLFFBQU8sS0FBSyxPQUFPLFFBQVEsSUFBSSxPQUFPLE1BQU0sT0FBTyxPQUFPO0FBQzFFLGdCQUFVO0FBQUEsUUFBRSxNQUFNO0FBQUEsUUFBUyxRQUFRLFFBQVE7QUFBQSxRQUN6QyxhQUFhLE9BQU8sTUFBTTtBQUFBLFFBQWEsYUFBYSxPQUFPLE1BQU07QUFBQSxNQUFZO0FBQUEsSUFDakYsV0FBVyxRQUFRLFNBQVMsZ0JBQWdCO0FBQzFDLFlBQU0sU0FBUyxZQUFZLEtBQUssT0FBTyxRQUFRLE1BQU07QUFDckQsVUFBSSxDQUFDLE9BQU8sR0FBSSxRQUFPLEtBQUssT0FBTyxRQUFRLElBQUksT0FBTyxNQUFNLE9BQU8sT0FBTztBQUMxRSxnQkFBVSxFQUFFLE1BQU0sZ0JBQWdCLFFBQVEsUUFBUSxRQUFRLFdBQVcsT0FBTyxNQUFNO0FBQUEsSUFDcEYsT0FBTztBQUNMLFlBQU0sSUFBSSxNQUFNLHdCQUF3QjtBQUFBLElBQzFDO0FBQ0EsVUFBTSxRQUFzQjtBQUFBLE1BQzFCO0FBQUEsTUFBUyxVQUFVLEtBQUs7QUFBQSxNQUFjLFVBQVUsS0FBSyxNQUFNO0FBQUE7QUFBQSxNQUUzRCxNQUFNLG1CQUFtQixLQUFLLE9BQU8sS0FBSyxlQUFlLEdBQUcsS0FBSyxlQUFlLENBQUM7QUFBQSxNQUFHO0FBQUEsSUFDdEY7QUFDQSxTQUFLLFFBQVEsUUFBUSxLQUFLLEtBQUs7QUFDL0IsU0FBSyxJQUFJLElBQUksUUFBUSxJQUFJLEtBQUs7QUFDOUIsV0FBTyxLQUFLLFFBQVEsT0FBTyxLQUFLO0FBQUEsRUFDbEM7QUFBQSxFQUVRLFlBQVksT0FBMkI7QUFDN0MsUUFBSSxNQUFNLGFBQWEsS0FBSyxhQUFjLE9BQU0sSUFBSSxNQUFNLHNCQUFzQjtBQUNoRixVQUFNLFVBQVUsS0FBSyxTQUFTLE1BQU0sT0FBTztBQUMzQyxRQUFJLENBQUMsUUFBUSxNQUFNLFFBQVEsYUFBYSxRQUFRLFNBQVMsTUFBTSxRQUMxRCxRQUFRLGFBQWEsTUFBTSxZQUMzQixLQUFLLFVBQVUsUUFBUSxPQUFPLE1BQU0sS0FBSyxVQUFVLE1BQU0sT0FBTyxHQUFHO0FBQ3RFLFlBQU0sSUFBSSxNQUFNLHVDQUF1QyxNQUFNLFFBQVEsRUFBRTtBQUFBLElBQ3pFO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsdUJBQW9DO0FBQzFDLHdCQUFvQixLQUFLLEtBQUs7QUFDOUIsc0JBQWtCLEtBQUssS0FBSztBQUM1QixVQUFNLFdBQVcsb0JBQW9CLEtBQUssT0FBTyxLQUFLLGNBQWMsS0FBSyxlQUFlLENBQUM7QUFDekYsOEJBQTBCLEtBQUssT0FBTyxRQUFRO0FBQzlDLFdBQU87QUFBQSxFQUNUO0FBQUEsRUFFUSxRQUFRLE9BQXFCLFdBQW9DO0FBQ3ZFLFdBQU87QUFBQSxNQUNMLElBQUk7QUFBQSxNQUFNO0FBQUEsTUFBVyxJQUFJLE1BQU0sUUFBUTtBQUFBLE1BQUksVUFBVSxNQUFNO0FBQUEsTUFDM0QsVUFBVSxNQUFNO0FBQUEsTUFBVSxNQUFNLE1BQU07QUFBQSxNQUFNLFNBQVMsTUFBTTtBQUFBLElBQzdEO0FBQUEsRUFDRjtBQUFBLEVBRVEsT0FBT0MsS0FBWSxNQUFjLFNBQXFDO0FBQzVFLFdBQU8sRUFBRSxJQUFJLE9BQU8sV0FBVyxPQUFPLElBQUFBLEtBQUksTUFBTSxRQUFRO0FBQUEsRUFDMUQ7QUFDRjtBQUVPLFNBQVMsYUFBYSxNQUFjLFVBQVUsVUFBVSxzQkFBc0IsR0FDbkYsU0FBbUMsd0JBQStCO0FBQ2xFLFFBQU0sUUFBUSxjQUFjLE1BQU0sQ0FBQztBQUNuQyxRQUFNLFlBQVksRUFBRSxHQUFHLFFBQVE7QUFDL0IsTUFBSSxXQUFXLHVCQUF3QixPQUFNLE9BQU8sZ0JBQWdCO0FBQ3BFLFNBQU87QUFDVDtBQUVBLFNBQVMsdUJBQXVCLE1BQWMsU0FDNUMsUUFBeUM7QUFDekMsUUFBTSxRQUFRLFlBQVksSUFBSTtBQUM5QixvQkFBa0IsS0FBSztBQUN2QixxQkFBbUIsS0FBSztBQUN4QixRQUFNLFlBQVksRUFBRSxHQUFHLFFBQVE7QUFDL0IsTUFBSSxXQUFXLHVCQUF3QixPQUFNLE9BQU8sZ0JBQWdCO0FBQ3BFLFNBQU87QUFDVDtBQUVBLFNBQVMscUJBQXFCLE9BQThCO0FBQzFELE1BQUksTUFBTSxRQUFRLFNBQVMsV0FBVztBQUNwQyxXQUFPLE1BQU0sUUFBUSxTQUFTLGNBQ3hCLE1BQU0sUUFBUSxhQUFhLFdBQzFCLDBDQUEwQyxLQUFLLE1BQU0sUUFBUSxRQUFRO0FBQUEsRUFDOUU7QUFDQSxTQUFPLE1BQU0sUUFBUSxTQUFTLFlBQVksTUFBTSxRQUFRLGdCQUFnQixTQUFTLEtBQUs7QUFDeEY7OztBQ2hwQkEsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsdUJBQXVCOzs7QUNOaEM7QUFBQSxFQUNFLFFBQVU7QUFBQSxFQUNWLE1BQVE7QUFBQSxFQUNSLFFBQVU7QUFBQSxFQUNWLFFBQVU7QUFBQSxFQUNWLE1BQVE7QUFBQSxFQUNSLFdBQWE7QUFBQSxJQUNYLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxZQUFjO0FBQUEsTUFDWixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsY0FBZ0I7QUFBQSxNQUNkLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxjQUFnQjtBQUFBLE1BQ2QsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxNQUFRO0FBQUEsTUFDTixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZUFBaUI7QUFBQSxNQUNmLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxXQUFhO0FBQUEsTUFDWCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsWUFBYztBQUFBLE1BQ1osS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLFdBQWE7QUFBQSxNQUNYLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxnQkFBa0I7QUFBQSxNQUNoQixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZ0JBQWtCO0FBQUEsTUFDaEIsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGdCQUFrQjtBQUFBLE1BQ2hCLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxhQUFlO0FBQUEsTUFDYixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZUFBaUI7QUFBQSxNQUNmLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxPQUFTO0FBQUEsTUFDUCxLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsV0FBYTtBQUFBLE1BQ1gsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxlQUFpQjtBQUFBLE1BQ2YsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxlQUFpQjtBQUFBLE1BQ2YsS0FBTztBQUFBLE1BQ1AsTUFBUTtBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWU7QUFBQSxNQUNiLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxhQUFlO0FBQUEsTUFDYixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLElBQ0EsZUFBaUI7QUFBQSxNQUNmLEtBQU87QUFBQSxNQUNQLE1BQVE7QUFBQSxJQUNWO0FBQUEsSUFDQSxnQkFBa0I7QUFBQSxNQUNoQixLQUFPO0FBQUEsTUFDUCxNQUFRO0FBQUEsSUFDVjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFVBQVk7QUFBQSxJQUNWLE1BQVE7QUFBQSxNQUNOLGlCQUFtQjtBQUFBLE1BQ25CLGVBQWlCO0FBQUEsTUFDakIsVUFBWTtBQUFBLE1BQ1osY0FBZ0I7QUFBQSxNQUNoQixTQUFXO0FBQUEsTUFDWCxZQUFjO0FBQUEsTUFDZCxlQUFpQjtBQUFBLE1BQ2pCLEtBQU87QUFBQSxNQUNQLEtBQU87QUFBQSxNQUNQLFlBQWM7QUFBQSxNQUNkLFVBQVk7QUFBQSxJQUNkO0FBQUEsSUFDQSxNQUFRO0FBQUEsTUFDTixpQkFBbUI7QUFBQSxNQUNuQixlQUFpQjtBQUFBLE1BQ2pCLFVBQVk7QUFBQSxNQUNaLGNBQWdCO0FBQUEsTUFDaEIsU0FBVztBQUFBLE1BQ1gsWUFBYztBQUFBLE1BQ2QsZUFBaUI7QUFBQSxNQUNqQixLQUFPO0FBQUEsTUFDUCxLQUFPO0FBQUEsTUFDUCxZQUFjO0FBQUEsTUFDZCxVQUFZO0FBQUEsSUFDZDtBQUFBLElBQ0EsTUFBUTtBQUFBLE1BQ04saUJBQW1CO0FBQUEsTUFDbkIsZUFBaUI7QUFBQSxNQUNqQixVQUFZO0FBQUEsTUFDWixjQUFnQjtBQUFBLE1BQ2hCLFNBQVc7QUFBQSxNQUNYLFlBQWM7QUFBQSxNQUNkLGVBQWlCO0FBQUEsTUFDakIsS0FBTztBQUFBLE1BQ1AsS0FBTztBQUFBLE1BQ1AsWUFBYztBQUFBLE1BQ2QsVUFBWTtBQUFBLElBQ2Q7QUFBQSxJQUNBLE9BQVM7QUFBQSxNQUNQLGlCQUFtQjtBQUFBLE1BQ25CLGVBQWlCO0FBQUEsTUFDakIsVUFBWTtBQUFBLE1BQ1osY0FBZ0I7QUFBQSxNQUNoQixTQUFXO0FBQUEsTUFDWCxZQUFjO0FBQUEsTUFDZCxlQUFpQjtBQUFBLE1BQ2pCLEtBQU87QUFBQSxNQUNQLEtBQU87QUFBQSxNQUNQLFlBQWM7QUFBQSxNQUNkLFVBQVk7QUFBQSxJQUNkO0FBQUEsRUFDRjtBQUNGOzs7QUQzS0EsSUFBTSxJQUFJLGdCQUFRO0FBQ2xCLElBQU0sSUFBSSxDQUFDLE1BQWMsRUFBRSxDQUFDLEVBQUU7QUFFOUIsSUFBTSxPQUErQjtBQUFBLEVBQ25DLE9BQU8sRUFBRSxhQUFhO0FBQUEsRUFDdEIsU0FBUyxFQUFFLGVBQWU7QUFBQSxFQUMxQixRQUFRLEVBQUUsV0FBVztBQUFBLEVBQ3JCLE9BQU8sRUFBRSxjQUFjO0FBQUEsRUFDdkIsUUFBUSxFQUFFLGFBQWE7QUFBQSxFQUN2QixRQUFRLElBQVUsWUFBTSxFQUFFLGNBQWMsQ0FBQyxFQUFFLEtBQUssSUFBVSxZQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsSUFBSSxFQUFFLGFBQWEsRUFBRSxTQUFTLEdBQUcsR0FBRztBQUFBLEVBQ2hILE1BQU0sRUFBRSxjQUFjO0FBQUEsRUFDdEIsTUFBTSxFQUFFLGdCQUFnQjtBQUMxQjtBQUdBLFNBQVMsV0FBVyxNQUFrQztBQUNwRCxRQUFNLE1BQU8sUUFBUSxLQUFLLElBQUksS0FBTSxLQUFLO0FBQ3pDLFNBQU8sSUFBSSxXQUFXLEdBQUcsSUFBSSxNQUFNLElBQUksR0FBRztBQUM1QztBQUVBLElBQU0scUJBQXFCLElBQVUsMEJBQW9CO0FBQUEsRUFDdkQsY0FBYztBQUFBLEVBQ2QsYUFBYTtBQUNmLENBQUM7QUFDRCxJQUFNLGdCQUFnQixJQUFVLDBCQUFvQjtBQUFBLEVBQ2xELGNBQWM7QUFBQSxFQUNkLGFBQWE7QUFDZixDQUFDO0FBRUQsU0FBUyxNQUFNLFVBQWdDLEtBQW1DO0FBQ2hGLFFBQU0sSUFBSSxTQUFTLFFBQVEsU0FBUyxhQUFhLElBQUk7QUFDckQsSUFBRSxnQkFBZ0IsSUFBSTtBQUN0QixRQUFNLFNBQVMsSUFBVSxZQUFNLEdBQUc7QUFDbEMsUUFBTSxJQUFJLEVBQUUsV0FBVyxTQUFTO0FBQ2hDLFFBQU0sTUFBTSxJQUFJLGFBQWEsSUFBSSxDQUFDO0FBQ2xDLFdBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQzFCLFFBQUksSUFBSSxDQUFDLElBQUksT0FBTztBQUNwQixRQUFJLElBQUksSUFBSSxDQUFDLElBQUksT0FBTztBQUN4QixRQUFJLElBQUksSUFBSSxDQUFDLElBQUksT0FBTztBQUFBLEVBQzFCO0FBQ0EsSUFBRSxhQUFhLFNBQVMsSUFBVSxzQkFBZ0IsS0FBSyxDQUFDLENBQUM7QUFDekQsU0FBTztBQUNUO0FBRUEsU0FBUyxnQkFBZ0IsV0FBc0IsUUFBcUQ7QUFDbEcsUUFBTSxTQUFTLElBQVUsV0FBSztBQUM5QixRQUFNLFFBQVEsSUFBVSxjQUFRO0FBQ2hDLGFBQVcsS0FBSyxVQUFVLFNBQVM7QUFHakMsVUFBTSxTQUFTLEtBQUssTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUk7QUFDdEMsV0FBTyxjQUFjLE1BQU0sSUFBSSxFQUFFLElBQUksUUFBUSxFQUFFLEdBQUcsRUFBRSxJQUFJLE1BQU0sQ0FBQztBQUMvRCxXQUFPLGNBQWMsTUFBTSxJQUFJLEVBQUUsSUFBSSxRQUFRLEVBQUUsSUFBSSxFQUFFLElBQUksUUFBUSxFQUFFLElBQUksTUFBTSxDQUFDO0FBQUEsRUFDaEY7QUFDQSxRQUFNLFNBQVMsT0FBTyxVQUFVLElBQVUsY0FBUSxDQUFDO0FBQ25ELFNBQU8sRUFBRSxHQUFHLE9BQU8sR0FBRyxHQUFHLE9BQU8sSUFBSSxTQUFTLEdBQUcsR0FBRyxPQUFPLEVBQUU7QUFDOUQ7QUFFQSxTQUFTLGVBQWUsR0FBb0IsZUFBa0U7QUFHNUcsTUFBSSxFQUFFLFNBQVMsY0FBYyxrQkFBa0IsRUFBRyxRQUFPLGFBQWEsQ0FBQztBQUN2RSxRQUFNLElBQUksSUFBVSxrQkFBWSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQztBQUM3QyxNQUFJLEVBQUUsSUFBSyxHQUFFLFFBQVEsRUFBRSxHQUFHO0FBQzFCLElBQUUsVUFBVSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNuQyxTQUFPLE1BQU0sR0FBRyxXQUFXLEVBQUUsSUFBSSxDQUFDO0FBQ3BDO0FBR0EsU0FBUyxhQUFhLEdBQTBDO0FBQzlELFFBQU0sU0FBaUMsQ0FBQztBQUN4QyxRQUFNLFFBQVEsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLEVBQUUsSUFBSSxHQUFHLENBQUM7QUFDL0MsUUFBTSxRQUFRO0FBQ2QsUUFBTSxTQUFTLEtBQUssSUFBSSxFQUFFLElBQUksSUFBSSxPQUFPLEVBQUUsSUFBSSxRQUFRLENBQUM7QUFDeEQsV0FBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLEtBQUs7QUFDOUIsVUFBTSxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksSUFBSSxFQUFFLEtBQUssSUFBSSxPQUFPO0FBQzdDLFVBQU0sS0FBSyxFQUFFLEtBQUssSUFBSSxNQUFNLElBQUksU0FBUztBQUN6QyxVQUFNLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxJQUFJLE1BQU0sSUFBSSxJQUFJO0FBQzNDLFVBQU0sV0FBVyxFQUFFLElBQUksRUFBRSxJQUFJO0FBQzdCLFVBQU0sTUFBZ0IsQ0FBQztBQUN2QixVQUFNLE1BQU0sQ0FBQyxHQUFhLEdBQWEsTUFBZ0IsSUFBSSxLQUFLLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ2hGLFVBQU0sYUFBYSxDQUFDLE1BQWM7QUFDaEMsWUFBTSxRQUFTLElBQUksUUFBUyxJQUFJLEtBQUssS0FBSztBQUMxQyxhQUFPLENBQUMsS0FBSyxLQUFLLElBQUksS0FBSyxJQUFJLFFBQVEsVUFBVSxLQUFLLEtBQUssSUFBSSxLQUFLLElBQUksTUFBTTtBQUFBLElBQ2hGO0FBQ0EsYUFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLEtBQUs7QUFDOUIsWUFBTSxJQUFJLFdBQVcsQ0FBQyxHQUFHLElBQUksV0FBVyxJQUFJLENBQUM7QUFDN0MsVUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxHQUFHLENBQUM7QUFDdkIsVUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDO0FBQUEsSUFDekI7QUFDQSxVQUFNLElBQUksSUFBVSxxQkFBZTtBQUNuQyxNQUFFLGFBQWEsWUFBWSxJQUFVLDZCQUF1QixLQUFLLENBQUMsQ0FBQztBQUNuRSxNQUFFLHFCQUFxQjtBQUN2QixXQUFPLEtBQUssTUFBTSxHQUFHLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUFBLEVBQzFDO0FBQ0EsUUFBTSxTQUFTLGdCQUFnQixRQUFRLEtBQUs7QUFDNUMsYUFBVyxRQUFRLE9BQVEsTUFBSyxRQUFRO0FBQ3hDLE1BQUksQ0FBQyxPQUFRLE9BQU0sSUFBSSxNQUFNLHVDQUF1QztBQUNwRSxTQUFPLG1CQUFtQjtBQUMxQixTQUFPLHNCQUFzQjtBQUM3QixTQUFPO0FBQ1Q7QUFHTyxTQUFTLG1CQUFtQixXQUFnRDtBQUNqRixNQUFJLFVBQVUsa0JBQWtCLEtBQUssVUFBVSxTQUFTLFdBQVc7QUFDakUsVUFBTSxRQUFRLElBQVUsWUFBTTtBQUM5QixVQUFNLE9BQU8sYUFBYSxVQUFVLElBQUk7QUFDeEMsVUFBTSxTQUFTLGNBQWMsVUFBVTtBQUFPLFVBQU0sU0FBUyxnQkFBZ0IsZ0JBQWdCLFdBQVcsR0FBRztBQUMzRyxVQUFNLFFBQVEsbUJBQW1CO0FBQUEsTUFBRSxHQUFHO0FBQUEsTUFBVyxlQUFlO0FBQUEsTUFDOUQsU0FBUyxVQUFVLFFBQVEsT0FBTyxDQUFDLE1BQU0sRUFBRSxTQUFTLFVBQVU7QUFBQSxJQUFFLENBQUM7QUFDbkUsUUFBSSxFQUFFLGlCQUF1QixZQUFPLE9BQU0sSUFBSSxNQUFNLDBCQUEwQjtBQUM5RSxVQUFNLElBQUksS0FBSztBQUNmLFVBQU1DLFNBQVEsVUFBVSxRQUFRLE9BQU8sQ0FBQyxNQUFNLEVBQUUsU0FBUyxVQUFVLEVBQUUsSUFBSSxZQUFZO0FBQ3JGLFVBQU1DLFVBQVMsZ0JBQWdCRCxRQUFPLEtBQUs7QUFDM0MsZUFBVyxRQUFRQSxPQUFPLE1BQUssUUFBUTtBQUN2QyxRQUFJLENBQUNDLFFBQVEsT0FBTSxJQUFJLE1BQU0sNkJBQTZCLFVBQVUsRUFBRSxFQUFFO0FBQ3hFLFVBQU0sVUFBVSxJQUFVLFdBQUtBLFNBQVEsYUFBYTtBQUNwRCxZQUFRLE9BQU87QUFDZixZQUFRLGFBQWE7QUFDckIsWUFBUSxnQkFBZ0I7QUFDeEIsWUFBUSxTQUFTLHFCQUFxQixVQUFVLFFBQVEsT0FBTyxDQUFDLE1BQU0sRUFBRSxTQUFTLFVBQVUsRUFBRTtBQUM3RixVQUFNLElBQUksT0FBTztBQUNqQixXQUFPO0FBQUEsRUFDVDtBQUNBLFFBQU0sUUFBUSxVQUFVLFFBQVEsSUFBSSxDQUFDLE1BQU0sZUFBZSxHQUFHLFVBQVUsYUFBYSxDQUFDO0FBQ3JGLFFBQU0sU0FBUyxnQkFBZ0IsT0FBTyxLQUFLO0FBQzNDLGFBQVcsUUFBUSxNQUFPLE1BQUssUUFBUTtBQUN2QyxNQUFJLENBQUMsT0FBUSxPQUFNLElBQUksTUFBTSw2QkFBNkIsVUFBVSxFQUFFLEVBQUU7QUFDeEUsUUFBTSxPQUFPLElBQVUsV0FBSyxRQUFRLGtCQUFrQjtBQUN0RCxPQUFLLE9BQU8sYUFBYSxVQUFVLElBQUk7QUFDdkMsT0FBSyxhQUFhO0FBQ2xCLE9BQUssZ0JBQWdCO0FBQ3JCLE9BQUssU0FBUyxjQUFjLFVBQVU7QUFBSyxPQUFLLFNBQVMsZ0JBQWdCLGdCQUFnQixXQUFXLFVBQVUsU0FBUyxVQUFVLE1BQU0sR0FBRztBQUMxSSxTQUFPO0FBQ1Q7OztBZHZJQSxTQUFTLE1BQVMsT0FBYTtBQUFFLFNBQU8sS0FBSyxNQUFNLEtBQUssVUFBVSxLQUFLLENBQUM7QUFBRztBQUMzRSxTQUFTLE1BQU0sU0FBc0IsV0FBc0M7QUFDekUsU0FBTyxRQUFRLFNBQVM7QUFBQSxJQUN0QixRQUFRLFFBQVEsUUFBUTtBQUFBLElBQVEsSUFBSSxTQUFTLFNBQVM7QUFBQSxJQUFJLE1BQU07QUFBQSxJQUNoRTtBQUFBLElBQVcsa0JBQWtCLFFBQVEsTUFBTTtBQUFBLElBQzNDLEdBQUksUUFBUSxRQUFRLFVBQVUsSUFBSSxFQUFFLGVBQWUsdUJBQXVCLElBQUksQ0FBQztBQUFBLEVBQ2pGLENBQUM7QUFDSDtBQUNBLFNBQVMsUUFBUSxHQUFvQixHQUE2QjtBQUNoRSxTQUFPLEtBQUssSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLElBQUksSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLFFBQ3hDLEtBQUssSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLElBQUksSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLFFBQ3RDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLFFBQVEsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUk7QUFDbkQ7QUFDQSxTQUFTLGNBQWMsV0FBc0IsU0FBNkM7QUFDeEYsU0FBTztBQUFBLElBQU0sVUFBVSxRQUFRLEtBQUssQ0FBQyxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUM7QUFBQSxJQUFHO0FBQUEsSUFDL0Qsc0JBQXNCLEtBQUssVUFBVSxPQUFPLENBQUM7QUFBQSxFQUFFO0FBQ25EO0FBRUEsS0FBSyx3RUFBd0UsTUFBTTtBQUNqRixRQUFNLFVBQVUsWUFBWSxjQUFjLE1BQU0sQ0FBQztBQUNqRCxTQUFPLE1BQU0sUUFBUSxRQUFRLFFBQVEsQ0FBQztBQUN0QyxTQUFPLE1BQU0sUUFBUSxTQUFTLFFBQVEsQ0FBQztBQUN2QyxRQUFNLFNBQVMsTUFBTSxTQUFTLE9BQU87QUFDckMsU0FBTyxNQUFNLE9BQU8sSUFBSSxNQUFNLEtBQUssVUFBVSxNQUFNLENBQUM7QUFDcEQsU0FBTyxNQUFNLFFBQVEsTUFBTSxXQUFXLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxlQUFlLENBQUM7QUFDN0UsU0FBTyxNQUFNLFFBQVEsU0FBUyxNQUFNLFFBQVEsUUFBUSxRQUFRLENBQUMsRUFBRSxPQUFPLENBQUMsRUFBRSxXQUFXLElBQUk7QUFDeEYsU0FBTyxNQUFNLFFBQVEsU0FBUztBQUFBLElBQzVCLFFBQVE7QUFBQSxJQUFHLElBQUk7QUFBQSxJQUFlLE1BQU07QUFBQSxJQUFTLFdBQVc7QUFBQSxJQUN4RCxrQkFBa0IsUUFBUSxNQUFNO0FBQUEsRUFDbEMsQ0FBQyxFQUFFLE1BQU0saUJBQWlCO0FBQzFCLFNBQU8sT0FBTyxNQUFNLGdCQUFnQjtBQUFBLElBQ2xDLFFBQVE7QUFBQSxJQUFHLElBQUk7QUFBQSxJQUFpQixNQUFNO0FBQUEsSUFBVyxVQUFVO0FBQUEsSUFBYSxrQkFBa0I7QUFBQSxFQUM1RixDQUFDLEdBQUcsYUFBYTtBQUNqQixTQUFPLE9BQU8sTUFBTSxnQkFBZ0I7QUFBQSxJQUNsQyxRQUFRO0FBQUEsSUFBRyxJQUFJO0FBQUEsSUFBYyxNQUFNO0FBQUEsSUFBUyxXQUFXO0FBQUEsSUFDdkQsa0JBQWtCO0FBQUEsSUFBRyxlQUFlO0FBQUEsRUFDdEMsQ0FBQyxHQUFHLFFBQVE7QUFDWixTQUFPLE9BQU8sTUFBTSxnQkFBZ0I7QUFBQSxJQUNsQyxRQUFRO0FBQUEsSUFBRyxJQUFJO0FBQUEsSUFBZ0IsTUFBTTtBQUFBLElBQVMsV0FBVztBQUFBLElBQ3pELGtCQUFrQjtBQUFBLElBQUcsZUFBZTtBQUFBLEVBQ3RDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxLQUFLLDBFQUEwRSxNQUFNO0FBQ25GLFFBQU0sU0FBUyxZQUFZLGNBQWM7QUFDekMsU0FBTyxNQUFNLE9BQU8sU0FBUyxRQUFRLENBQUM7QUFDdEMsU0FBTyxNQUFNLE1BQU0sUUFBUSxPQUFPLEVBQUUsSUFBSSxJQUFJO0FBQzVDLFFBQU0sU0FBUyxPQUFPLE1BQU0sV0FBVyxPQUFPLEVBQUUsS0FBSyxFQUFFO0FBQ3ZELFNBQU8sTUFBTSxPQUFPLGVBQWUsTUFBUztBQUM1QyxTQUFPLE1BQU0sT0FBTyxRQUFRLFFBQVEsRUFBRTtBQUN0QyxTQUFPLE1BQU0sbUJBQW1CLFFBQVEsS0FBSztBQUM3QyxRQUFNLGVBQWUsT0FBTztBQUM1QixRQUFNLGFBQWEsdUJBQXVCLE9BQU8sS0FBSztBQUN0RCxRQUFNLGlCQUFpQixLQUFLLFVBQVUsT0FBTyxRQUFRO0FBQ3JELFFBQU0sU0FBUyxZQUFZLE9BQU8sTUFBTSxPQUFPLE9BQU8sQ0FBQztBQUN2RCxTQUFPLE1BQU0sT0FBTyxNQUFNLFdBQVcsSUFBSSxZQUFZLEdBQUcsZUFBZSxNQUFTO0FBQ2hGLFNBQU8sTUFBTSx1QkFBdUIsT0FBTyxLQUFLLEdBQUcsVUFBVTtBQUM3RCxTQUFPLE1BQU0sS0FBSyxVQUFVLE9BQU8sUUFBUSxHQUFHLGNBQWM7QUFDNUQsU0FBTyxNQUFNLG9CQUFvQixjQUFjLEVBQUUsUUFBUSxDQUFDO0FBQzFELFNBQU8sTUFBTSxPQUFPLFNBQVM7QUFBQSxJQUMzQixRQUFRO0FBQUEsSUFBRyxJQUFJO0FBQUEsSUFBbUIsTUFBTTtBQUFBLElBQVMsV0FBVztBQUFBLElBQzVELGtCQUFrQixPQUFPLE1BQU07QUFBQSxFQUNqQyxDQUFDLEVBQUUsTUFBTSxpQkFBaUI7QUFDNUIsQ0FBQztBQUVELEtBQUssaUZBQWlGLE1BQU07QUFDMUYsUUFBTSxVQUFVLFlBQVksY0FBYyxNQUFNLENBQUM7QUFDakQsU0FBTyxNQUFNLE1BQU0sU0FBUyxPQUFPLEVBQUUsSUFBSSxJQUFJO0FBQzdDLFFBQU0sWUFBWSxDQUFDLEdBQUcsUUFBUSxNQUFNLFdBQVcsT0FBTyxDQUFDLEVBQUUsQ0FBQztBQUMxRCxTQUFPLE1BQU0sVUFBVSxRQUFRLFFBQVEsRUFBRTtBQUN6QyxTQUFPLE1BQU0sVUFBVSxRQUFRLEtBQUssQ0FBQyxNQUFNLEVBQUUsU0FBUyxZQUFZLEVBQUUsU0FBUyxNQUFNLEdBQUcsS0FBSztBQUMzRixTQUFPLE1BQU0sVUFBVSxRQUFRLE1BQU0sQ0FBQyxNQUFNLEVBQUUsU0FBUyxPQUFPLEdBQUcsSUFBSTtBQUNyRSxRQUFNLGNBQWMsVUFBVSxRQUFRLE9BQU8sQ0FBQyxNQUFNLEVBQUUsU0FBUyxVQUFVLEVBQUUsU0FBUyxRQUFRO0FBQzVGLFdBQVMsSUFBSSxHQUFHLElBQUksWUFBWSxRQUFRLEtBQUs7QUFDM0MsYUFBUyxJQUFJLElBQUksR0FBRyxJQUFJLFlBQVksUUFBUSxLQUFLO0FBQy9DLGFBQU87QUFBQSxRQUFNLFFBQVEsWUFBWSxDQUFDLEdBQUcsWUFBWSxDQUFDLENBQUM7QUFBQSxRQUFHO0FBQUEsUUFDcEQsR0FBRyxLQUFLLFVBQVUsWUFBWSxDQUFDLENBQUMsQ0FBQyxhQUFhLEtBQUssVUFBVSxZQUFZLENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFBRTtBQUFBLElBQ2xGO0FBQUEsRUFDRjtBQUNBLFFBQU0sT0FBTyxZQUFZLE9BQU8sRUFBRTtBQUNsQyxRQUFNLFNBQVMsWUFBWSxPQUFPLEVBQUU7QUFDcEMsUUFBTSxRQUFRLEtBQUssS0FBSyxJQUFJO0FBQzVCLFFBQU0sUUFBUSxZQUFZLE9BQU8sRUFBRSxLQUFNLElBQUk7QUFDN0MsZ0JBQWMsV0FBVztBQUFBLElBQ3ZCLE1BQU07QUFBQSxJQUFRLEdBQUc7QUFBQSxJQUFPLEdBQUc7QUFBQSxJQUFRLEdBQUc7QUFBQSxJQUFPLEdBQUc7QUFBQSxJQUFLLEdBQUc7QUFBQSxJQUFLLEdBQUc7QUFBQSxFQUNsRSxDQUFDO0FBQ0QsUUFBTSxTQUFTLEtBQUssS0FBSyxJQUFJLEtBQUssTUFBTSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFDakUsYUFBVyxLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxFQUFHLGVBQWMsV0FBVztBQUFBLElBQ3pELE1BQU07QUFBQSxJQUFRO0FBQUEsSUFBRyxHQUFHLFNBQVM7QUFBQSxJQUFHLEdBQUc7QUFBQSxJQUFRLEdBQUc7QUFBQSxJQUFLLEdBQUc7QUFBQSxJQUFLLEdBQUc7QUFBQSxFQUNoRSxDQUFDO0FBQ0QsYUFBVyxVQUFVLFVBQVUsU0FBUztBQUN0QyxXQUFPLEdBQUcsT0FBTyxJQUFJLE9BQU8sSUFBSSxLQUFLLEtBQUssS0FBSyxJQUFJO0FBQ25ELFdBQU8sR0FBRyxPQUFPLElBQUksT0FBTyxJQUFJLEtBQUssS0FBSyxLQUFLLElBQUksSUFBSTtBQUN2RCxXQUFPLEdBQUcsT0FBTyxJQUFJLE9BQU8sSUFBSSxLQUFLLEtBQUssS0FBSyxJQUFJO0FBQ25ELFdBQU8sR0FBRyxPQUFPLElBQUksT0FBTyxJQUFJLEtBQUssS0FBSyxLQUFLLElBQUksSUFBSTtBQUFBLEVBQ3pEO0FBQ0YsQ0FBQztBQUVELEtBQUssZ0ZBQWdGLE1BQU07QUFDekYsUUFBTSxTQUFTLFlBQVksY0FBYztBQUN6QyxRQUFNLFVBQVUsWUFBWSxRQUFRO0FBQ3BDLFNBQU8sTUFBTSxNQUFNLFFBQVEsTUFBTSxFQUFFLElBQUksSUFBSTtBQUMzQyxTQUFPLE1BQU0sTUFBTSxTQUFTLE1BQU0sRUFBRSxJQUFJLElBQUk7QUFDNUMsUUFBTSxNQUFNLENBQUMsR0FBRyxPQUFPLE1BQU0sV0FBVyxPQUFPLENBQUMsRUFBRSxDQUFDO0FBQ25ELFFBQU0sVUFBVSxDQUFDLEdBQUcsUUFBUSxNQUFNLFdBQVcsT0FBTyxDQUFDLEVBQUUsQ0FBQztBQUN4RCxTQUFPLE1BQU0sSUFBSSxRQUFRLFFBQVEsRUFBRTtBQUNuQyxTQUFPLE1BQU0sUUFBUSxRQUFRLFFBQVEsQ0FBQztBQUN0QyxRQUFNLFdBQVcsSUFBSSxRQUFRLE9BQU8sQ0FBQyxNQUFNLEVBQUUsU0FBUyxNQUFNO0FBQzVELFFBQU0sUUFBUSxRQUFRLFFBQVEsT0FBTyxDQUFDLE1BQU0sRUFBRSxTQUFTLE1BQU07QUFDN0QsYUFBVyxXQUFXLFVBQVU7QUFDOUIsVUFBTSxNQUFNLE1BQU0sS0FBSyxDQUFDLE1BQU0sRUFBRSxNQUFNLFFBQVEsS0FBSyxLQUFLLElBQUksRUFBRSxJQUFJLFFBQVEsQ0FBQyxJQUFJLFFBQzFFLFFBQVEsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLEtBQUssUUFBUSxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztBQUM3RCxXQUFPLEdBQUcsS0FBSyx5QkFBeUIsS0FBSyxVQUFVLE9BQU8sQ0FBQyxFQUFFO0FBQUEsRUFDbkU7QUFDQSxTQUFPLE1BQU0sUUFBUSxRQUFRLE9BQU8sQ0FBQyxNQUFNLEVBQUUsU0FBUyxNQUFNLEVBQUUsUUFBUSxDQUFDO0FBQ3ZFLFNBQU8sR0FBRyxJQUFJLElBQUksTUFBTSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQztBQUNuRCxDQUFDO0FBRUQsS0FBSyw0RUFBNEUsTUFBTTtBQUNyRixRQUFNLE9BQU8sWUFBWSxRQUFRO0FBQ2pDLFNBQU8sTUFBTSxNQUFNLE1BQU0sT0FBTyxFQUFFLElBQUksSUFBSTtBQUMxQyxRQUFNLFdBQVcsTUFBTSxLQUFLLFFBQVE7QUFDcEMsU0FBTyxNQUFNLE1BQU0sTUFBTSxNQUFNLEVBQUUsSUFBSSxJQUFJO0FBQ3pDLFNBQU8sTUFBTSxNQUFNLE1BQU0sTUFBTSxFQUFFLElBQUksSUFBSTtBQUN6QyxRQUFNLE9BQU8sWUFBWSxRQUFRLE1BQU0sUUFBUSxHQUFHLE1BQU0sS0FBSyxPQUFPLENBQUM7QUFDckUsUUFBTSxVQUFVLFlBQVksT0FBTyxNQUFNLEtBQUssT0FBTyxDQUFDO0FBQ3RELGFBQVcsWUFBWSxDQUFDLE1BQU0sT0FBTyxHQUFHO0FBQ3RDLFdBQU8sTUFBTSxTQUFTLFdBQVcsS0FBSyxTQUFTO0FBQy9DLFdBQU8sVUFBVSxTQUFTLFVBQVUsS0FBSyxRQUFRO0FBQ2pELFdBQU8sVUFBVSxTQUFTLFNBQVMsS0FBSyxPQUFPO0FBQUEsRUFDakQ7QUFDQSxhQUFXLGFBQWEsS0FBSyxNQUFNLFdBQVcsT0FBTyxHQUFHO0FBQ3RELFdBQU8sTUFBTSxzQkFBc0IsS0FBSyxRQUFRLEVBQUUsV0FBVyxLQUFLLENBQUMsTUFBTSxFQUFFLE9BQU8sVUFBVSxFQUFFLEdBQUcsZUFBZSxDQUFDO0FBQUEsRUFDbkg7QUFDQSxRQUFNLFNBQVMsTUFBTSxRQUFRO0FBQzdCLFNBQU8sTUFBTSxPQUFPLFdBQVcsUUFBUSxDQUFDO0FBQ3hDLFNBQU8sT0FBTyxNQUFNLHNCQUFzQixFQUFFLEdBQUcsUUFBUSxRQUFRLEVBQVcsQ0FBQyxDQUFDO0FBQzVFLFFBQU0sWUFBWSxNQUFNLFFBQVE7QUFDaEMsUUFBTSxTQUFTLFVBQVUsV0FBVyxDQUFDO0FBQ3JDLFFBQU0sa0JBQTZCO0FBQUEsSUFDakMsSUFBSSxPQUFPO0FBQUEsSUFBSSxNQUFNLE9BQU87QUFBQSxJQUFNLFFBQVEsT0FBTztBQUFBLElBQ2pELEdBQUcsT0FBTztBQUFBLElBQUcsR0FBRyxPQUFPO0FBQUEsSUFBRyxHQUFHLE9BQU87QUFBQSxJQUFHLEtBQUssT0FBTztBQUFBLElBQ25ELFNBQVMsT0FBTztBQUFBLElBQVMsTUFBTSxPQUFPO0FBQUEsSUFBTSxlQUFlLE9BQU87QUFBQSxJQUNsRSxhQUFhO0FBQUEsSUFBTSxlQUFlO0FBQUEsRUFDcEM7QUFDQSxZQUFVLFdBQVcsQ0FBQyxJQUFJO0FBQzFCLFNBQU8sT0FBTyxNQUFNLHNCQUFzQixTQUFTLEdBQUcsV0FBVztBQUNqRSxRQUFNLFNBQVMsTUFBTSxLQUFLLFFBQVE7QUFDbEMsUUFBTSxVQUFVLE1BQU0sS0FBSyxRQUFRO0FBQ25DLFNBQU8sVUFBVSxLQUFLLFVBQVUsTUFBTTtBQUN4QyxDQUFDO0FBRUQsS0FBSyxvRkFBb0YsWUFBWTtBQUNuRyxRQUFNLFVBQVUsWUFBWSxjQUFjLE1BQU0sQ0FBQztBQUNqRCxTQUFPLE1BQU0sTUFBTSxTQUFTLE1BQU0sRUFBRSxJQUFJLElBQUk7QUFDNUMsUUFBTSxPQUFPLENBQUMsR0FBRyxRQUFRLE1BQU0sV0FBVyxPQUFPLENBQUMsRUFBRSxDQUFDO0FBQ3JELFFBQU0sT0FBTyxLQUFLLFFBQVEsT0FBTyxDQUFDLE1BQU0sRUFBRSxTQUFTLFVBQVU7QUFDN0QsU0FBTyxNQUFNLEtBQUssUUFBUSxDQUFDO0FBQzNCLFNBQU8sTUFBTSxLQUFLLFFBQVEsUUFBUSxLQUFLLFNBQVMsQ0FBQztBQUNqRCxRQUFNLFdBQVcsbUJBQW1CLElBQUk7QUFDeEMsU0FBTyxNQUFNLFNBQVMsTUFBTSxPQUFPO0FBQ25DLFFBQU0sVUFBVSxTQUFTLFNBQVMsS0FBSyxDQUFDLFVBQVUsTUFBTSxTQUFTLGtCQUFrQjtBQUNuRixTQUFPLEdBQUcsU0FBUyxNQUFNO0FBQ3pCLFNBQU8sTUFBTSxRQUFRLFlBQVksSUFBSTtBQUNyQyxTQUFPLE1BQU0sUUFBUSxlQUFlLElBQUk7QUFDeEMsUUFBTSxXQUFXLFFBQVEsU0FBUyxhQUFhLFVBQVU7QUFDekQsUUFBTSxVQUFVLEtBQUssSUFBSSxNQUFNLEtBQUs7QUFDcEMsV0FBUyxJQUFJLEdBQUcsSUFBSSxTQUFTLE9BQU8sS0FBSztBQUN2QyxVQUFNLElBQUksU0FBUyxLQUFLLENBQUMsR0FBRyxJQUFJLFNBQVMsS0FBSyxDQUFDLEdBQUcsSUFBSSxTQUFTLEtBQUssQ0FBQztBQUNyRSxVQUFNLFdBQVcsS0FBSyxVQUFVLENBQUMsUUFBUSxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxRQUM3RCxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxRQUFRLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLFFBQzFELEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLFFBQVEsS0FBSyxJQUFJLElBQUksUUFBUSxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksSUFBSTtBQUNwRixXQUFPLEdBQUcsWUFBWSxHQUFHLGdEQUFnRCxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtBQUN0RixZQUFRLFFBQVEsSUFBSTtBQUFBLEVBQ3RCO0FBQ0EsU0FBTyxNQUFNLFFBQVEsTUFBTSxPQUFPLEdBQUcsSUFBSTtBQUN6QyxTQUFPLE1BQU0sQ0FBQyxHQUFHLFFBQVEsTUFBTSxTQUFTLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxXQUFXLE9BQU8sS0FBSyxTQUFTLE1BQU0sQ0FBQyxHQUFHLEtBQUs7QUFDdkcsU0FBTyxNQUFNLFFBQVEsTUFBTSxVQUFVLE1BQU0sRUFBRTtBQUMvQyxDQUFDO0FBRUQsS0FBSyxtREFBbUQsTUFBTTtBQUM1RCxRQUFNLFVBQVUsWUFBWSxjQUFjLE1BQU0sQ0FBQztBQUNqRCxTQUFPLE1BQU0sTUFBTSxTQUFTLE9BQU8sRUFBRSxJQUFJLElBQUk7QUFDN0MsUUFBTSxPQUFPLG1CQUFtQixDQUFDLEdBQUcsUUFBUSxNQUFNLFdBQVcsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3pFLFNBQU8sTUFBTSxLQUFLLE1BQU0sTUFBTTtBQUM5QixTQUFPLE1BQU0sS0FBSyxZQUFZLElBQUk7QUFDbEMsU0FBTyxNQUFNLEtBQUssZUFBZSxJQUFJO0FBQ3ZDLENBQUM7IiwKICAibmFtZXMiOiBbImlkIiwgImlkIiwgImlkIiwgInRleHQiLCAiaWQiLCAiaWQiLCAiZGlnZXN0IiwgImZhaWwiLCAiam9iIiwgInRleHQiLCAiaW52ZW50b3J5IiwgImlkIiwgImlkIiwgInVpbnQiLCAiZW50aXR5SWQiLCAib3V0Y29tZSIsICJoaXN0b3JpY2FsIiwgImVycm9yIiwgImlkIiwgInBhcnRzIiwgIm1lcmdlZCJdCn0K
