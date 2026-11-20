// tests/m002.preparation.test.ts
import test from "node:test";
import assert from "node:assert/strict";

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
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        let topSolid = Y_MIN;
        let topMat = chunk.topMaterials[lz * CHUNK_SIZE + lx];
        for (let y = Y_MAX - 1; y >= Y_MIN; y--) {
          const m = chunk.data[localIndex(lx, yToIndex(y), lz)];
          if (isSolid(m)) {
            topSolid = y;
            topMat = m;
            break;
          }
        }
        chunk.heights[lz * CHUNK_SIZE + lx] = clamp(topSolid - Y_MIN, 0, WORLD_HEIGHT - 1);
        chunk.topMaterials[lz * CHUNK_SIZE + lx] = topMat;
      }
    }
  }
  world.chunks.set(key, chunk);
  world.stats.chunksGenerated++;
  world.stats.voxelsFilled += nonAir;
  world.stats.generationMs += performance.now() - t0;
  world.dirty.add(key);
  generateEntities(world, chunk);
  return chunk;
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
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return false;
  const idx = localIndex(worldToLocalX(x), yToIndex(y), worldToLocalZ(z));
  if (chunk.data[idx] === m) return false;
  chunk.data[idx] = m;
  let edits = world.edits.get(chunk.key);
  if (!edits) {
    edits = /* @__PURE__ */ new Map();
    world.edits.set(chunk.key, edits);
  }
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
  if (world.entities.has(e.id)) return;
  world.entities.set(e.id, e);
  let list = world.entityChunks.get(e.chunk);
  if (!list) {
    list = [];
    world.entityChunks.set(e.chunk, list);
  }
  list.push(e.id);
  world.stats.entities = world.entities.size;
  world.revision++;
}
function removeEntity(world, id) {
  const e = world.entities.get(id);
  if (!e) return false;
  world.entities.delete(id);
  const list = world.entityChunks.get(e.chunk);
  if (list) {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) world.entityChunks.delete(e.chunk);
  }
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
  if (world.entityChunks.has(chunk.key)) return;
  const rnd = mulberry32(hash2i(chunk.cx, chunk.cz, world.seed + 900) * 4294967296 >>> 0);
  const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
  let n = 0;
  const localSurface = (lx, lz) => {
    return chunk.heights[lz * CHUNK_SIZE + lx] + Y_MIN + 1;
  };
  const localTop = (lx, lz) => {
    return chunk.topMaterials[lz * CHUNK_SIZE + lx];
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
          if (world.stats.pinkTrees + 1 > 0.25 * (world.stats.trees + 1)) {
            kind = "styl_tree_cluster";
            variant = Math.floor(rnd() * 3);
            world.stats.pinkOverflow++;
          } else {
            kind = "styl_tree_blossom";
            variant = Math.floor(rnd() * 2);
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
        const remaining = kind === "styl_rock_small" ? 4 : kind === "styl_rock_medium" ? 8 : 12;
        addEntity(world, {
          id: entityId(chunk.key, n++),
          kind,
          chunk: chunk.key,
          x: wx + 0.5,
          y: h,
          z: wz + 0.5,
          rot: Math.floor(rnd() * 24) * (Math.PI / 12),
          scale: 0.9 + rnd() * 0.2,
          variant: Math.floor(rnd() * 3),
          resource: "stone",
          remaining,
          yieldPerHarvest: 3,
          harvested: false,
          provisional: true,
          authored: false
        });
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
  for (const id2 of ids) {
    const e = world.entities.get(id2);
    if (e && Math.hypot(e.x - x, e.z - z) < 2.6) {
      world.entities.delete(id2);
      if (e.kind.startsWith("styl_tree")) world.stats.trees = Math.max(0, world.stats.trees - 1);
      if (e.kind === "styl_tree_blossom") world.stats.pinkTrees = Math.max(0, world.stats.pinkTrees - 1);
    }
  }
  world.entityChunks.set(key, ids.filter((id2) => world.entities.has(id2)));
  const id = `hero:${kind}:${Math.round(x)}:${Math.round(z)}`;
  const before = world.entities.size;
  addEntity(world, {
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
  });
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
  styl_rock_small: 0.6,
  styl_rock_medium: 1,
  styl_rock_large: 1.6,
  styl_ore: 0.9,
  styl_cairn: 0.8,
  waystone: 1.4,
  marker: 0.5
};
function entityChunksForRect(world, rect) {
  const r = normalizeRect(rect);
  const keys = [];
  const cx0 = worldToChunkX(r.x0), cx1 = worldToChunkX(r.x1);
  const cz0 = worldToChunkZ(r.z0), cz1 = worldToChunkZ(r.z1);
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
      if (!e) continue;
      seen.add(id);
      const radius = OBSTRUCTION_RADIUS[e.kind] ?? 1;
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
function error(code, message, value, limit) {
  return { code, severity: "error", message, value, limit };
}
function prep(code, message, value, limit) {
  return { code, severity: "preparation", message, value, limit };
}
function validateSite(world, proposal2, query = new TerrainQuery(world), footprint) {
  const rect = normalizeRect(proposal2.rect);
  const rules = proposal2.rules;
  const reasons = [];
  const fp = footprint ?? query.footprint(rect, proposal2.floorY);
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
    siteId: proposal2.siteId,
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
function planPreparation(world, proposal2, options = {}) {
  const rect = normalizeRect(proposal2.rect);
  const validation = validateSite(world, proposal2);
  if (validation.state === "invalid") {
    return {
      ok: false,
      stage: "plan",
      code: "site_invalid",
      reasons: validation.reasons.map((r) => `${r.code}: ${r.message}`),
      validation
    };
  }
  const targets = sortedTargets(options.targets ?? defaultTargets(world, rect, proposal2.floorY));
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
    const reasons = targetRuleReasons(stats, proposal2.rules);
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
    siteId: proposal2.siteId,
    rect,
    floorY: proposal2.floorY,
    rules: proposal2.rules,
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
function prepareSite(world, authorizer, proposal2, options = {}) {
  const planned = planPreparation(world, proposal2, options);
  if (!planned.ok) return planned;
  const decision = authorizer.authorize(world, planned.plan);
  if (!decision.ok || !decision.authorization) {
    return fail("authorize", "not_authorized", decision.reasons);
  }
  return executePreparation(world, planned.plan, decision.authorization);
}

// tests/m002.preparation.test.ts
function fingerprint(world) {
  return {
    revision: world.revision,
    voxels: canonicalRegionHash(world, M002_LAYOUT.protectedRegion).hash,
    outside: canonicalRegionHash(world, M002_LAYOUT.protectedRegion, M002_LAYOUT.envelope).hash,
    entities: canonicalEntityHash(world, M002_LAYOUT.protectedRegion),
    inventory: canonicalInventoryHash(world)
  };
}
function proposal(siteId, rect = M002_LAYOUT.house.rect, floorY = M002_LAYOUT.house.floorY) {
  return { siteId, rect, floorY, rules: HOUSE_RULES };
}
function housePolicy() {
  return new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
}
test("planning is read-only, deterministic and bounded", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const first = planPreparation(world, proposal(layout.house.id));
  const second = planPreparation(world, proposal(layout.house.id));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.plan.targets.length, 48);
  assert.ok(first.plan.targets.every((t) => t.y === layout.house.floorY));
  assert.deepEqual(first.plan.clearEntityIds, []);
  assert.equal(first.plan.expected.cutVolume, 3);
  assert.equal(first.plan.expected.fillVolume, 18);
  assert.equal(first.plan.expected.obstructions, 0);
  assert.equal(planDigest(first.plan), planDigest(second.plan));
  assert.equal(first.plan.id, second.plan.id);
  assert.equal(first.plan.envelope.length, 1);
  const e = first.plan.envelope[0];
  assert.ok(e.x0 >= -62 && e.x1 <= -51 && e.z0 >= -48 && e.z1 <= -39);
  assert.ok(e.y0 >= 8 && e.y1 <= 16);
  assert.deepEqual(fingerprint(world), before);
  const rejected = planPreparation(world, proposal(
    layout.rejected.id,
    layout.rejected.rect,
    layout.rejected.floorY
  ));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.stage, "plan");
    assert.equal(rejected.code, "site_invalid");
    assert.ok(rejected.reasons.length >= 4);
  }
  assert.deepEqual(fingerprint(world), before);
});
test("house preparation applies exactly the planned voxel edits", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const authorizer = housePolicy();
  const planned = planPreparation(world, proposal(layout.house.id));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const decision = authorizer.authorize(world, planned.plan);
  assert.equal(decision.ok, true);
  assert.ok(decision.authorization);
  const result = executePreparation(world, planned.plan, decision.authorization);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { ledger } = result;
  assert.equal(ledger.authority, "local-stub");
  assert.equal(ledger.enforcement, "local-simulation-only");
  assert.equal(ledger.planDigest, planDigest(planned.plan));
  assert.equal(ledger.cutVolume, 3);
  assert.equal(ledger.fillVolume, 18);
  assert.equal(ledger.netSpoil, -15);
  assert.equal(ledger.borrowedFill, 15);
  assert.equal(ledger.voxelEdits, 21);
  assert.deepEqual(ledger.cutByMaterial, { grass: 3 });
  assert.deepEqual(ledger.fillByMaterial, { grass: 18 });
  assert.deepEqual(ledger.entitiesCleared, []);
  assert.deepEqual(ledger.resourcesGained, {});
  assert.deepEqual(ledger.inventoryBefore, {});
  assert.deepEqual(ledger.inventoryAfter, {});
  assert.equal(ledger.revisionAfter - ledger.revisionBefore, 21);
  assert.equal(ledger.chunkDeltas.length, 1);
  assert.deepEqual(ledger.chunkDeltas[0], {
    chunk: "30,30",
    changed: 21,
    added: 18,
    removed: 3
  });
  for (let z = layout.house.rect.z0; z <= layout.house.rect.z1; z++) {
    for (let x = layout.house.rect.x0; x <= layout.house.rect.x1; x++) {
      assert.equal(surfaceAt(world, x, z), layout.house.floorY, `column ${x},${z}`);
    }
  }
  const after = fingerprint(world);
  assert.equal(after.outside, before.outside);
  assert.equal(after.entities, before.entities);
  assert.equal(after.inventory, before.inventory);
  assert.notEqual(after.voxels, before.voxels);
  assert.deepEqual(editsOutsideEnvelope(world, layout.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, layout.protectedRegion), []);
  assert.ok(world.dirty.has("30,30"));
  const replay = executePreparation(world, planned.plan, decision.authorization);
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.code, "stale_authorization");
  assert.deepEqual(fingerprint(world), after);
});
test("preparation clears authorized obstructions and credits their resources", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const entityCount = world.entities.size;
  const authorizer = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope });
  const result = prepareSite(world, authorizer, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { ledger } = result;
  assert.equal(ledger.cutVolume, 41);
  assert.equal(ledger.fillVolume, 22);
  assert.equal(ledger.voxelEdits, 63);
  assert.deepEqual(ledger.entitiesCleared.map((e) => e.entityId), [
    "hero:styl_ore:-38:-42",
    "hero:styl_tree_blossom:-28:-38"
  ]);
  assert.deepEqual(ledger.resourcesGained, { ore: 8, wood: 12 });
  assert.deepEqual(ledger.inventoryAfter, { ore: 8, wood: 12 });
  assert.equal(world.entities.size, entityCount - 2);
  assert.equal(world.entities.has("hero:styl_ore:-38:-42"), false);
  assert.equal(world.entities.has("hero:styl_tree_blossom:-28:-38"), false);
  const chunkTotals = ledger.chunkDeltas.reduce((sum, d) => ({
    changed: sum.changed + d.changed,
    added: sum.added + d.added,
    removed: sum.removed + d.removed
  }), { changed: 0, added: 0, removed: 0 });
  assert.deepEqual(chunkTotals, { changed: 63, added: 22, removed: 41 });
  for (let z = layout.farm.rect.z0; z <= layout.farm.rect.z1; z++) {
    for (let x = layout.farm.rect.x0; x <= layout.farm.rect.x1; x++) {
      assert.equal(surfaceAt(world, x, z), 15, `column ${x},${z}`);
    }
  }
  const after = fingerprint(world);
  assert.equal(after.outside, before.outside);
  assert.notEqual(after.entities, before.entities);
  assert.notEqual(after.inventory, before.inventory);
  assert.deepEqual(editsOutsideEnvelope(world, layout.envelope), []);
  assert.deepEqual(checkDerivedCaches(world, layout.protectedRegion), []);
});
test("execution rejects forged, stale or over-limit authorization before writing", () => {
  const { world, layout } = createM002Fixture();
  const planned = planPreparation(world, proposal(layout.house.id));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const authorizer = housePolicy();
  const decision = authorizer.authorize(world, planned.plan);
  assert.equal(decision.ok, true);
  const auth = decision.authorization;
  const before = fingerprint(world);
  const forgedDigest = executePreparation(world, planned.plan, {
    ...auth,
    planDigest: "0000000000000000"
  });
  assert.equal(forgedDigest.ok, false);
  if (!forgedDigest.ok) assert.equal(forgedDigest.code, "digest_mismatch");
  const forgedAuthority = executePreparation(world, planned.plan, {
    ...auth,
    authority: "magicblock"
  });
  assert.equal(forgedAuthority.ok, false);
  if (!forgedAuthority.ok) assert.equal(forgedAuthority.code, "unsupported_authority");
  const narrowed = executePreparation(world, planned.plan, {
    ...auth,
    envelope: [{ ...auth.envelope[0], y1: auth.envelope[0].y0 }]
  });
  assert.equal(narrowed.ok, false);
  if (!narrowed.ok) assert.equal(narrowed.code, "envelope_mismatch");
  const limited = new LocalAuthorizer({
    envelope: M002_LAYOUT.envelope,
    limits: { maxCutVolume: 1 }
  }).authorize(world, planned.plan);
  assert.equal(limited.ok, false);
  assert.ok(limited.reasons.some((r) => r.includes("cut 3 exceeds limit 1")));
  const outsidePolicy = new LocalAuthorizer({
    envelope: [M002_LAYOUT.envelope[2]]
  }).authorize(world, planned.plan);
  assert.equal(outsidePolicy.ok, false);
  assert.ok(outsidePolicy.reasons.some((r) => r.includes("outside the local policy")));
  assert.deepEqual(fingerprint(world), before);
  assert.equal(setVoxel(world, -45, surfaceAt(world, -45, -43), -43, MAT.STONE), true);
  const afterManualEdit = fingerprint(world);
  const stale = executePreparation(world, planned.plan, auth);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "stale_authorization");
  assert.deepEqual(fingerprint(world), afterManualEdit);
});
test("preparation is deterministic across independent replays", () => {
  const a = createM002Fixture();
  const b = createM002Fixture();
  const ra = prepareSite(a.world, housePolicy(), proposal(a.layout.house.id));
  const rb = prepareSite(b.world, housePolicy(), proposal(b.layout.house.id));
  assert.equal(ra.ok, true);
  assert.equal(rb.ok, true);
  if (!ra.ok || !rb.ok) return;
  assert.deepEqual(ra.ledger, rb.ledger);
  assert.equal(ra.authorization.id, rb.authorization.id);
  assert.deepEqual(
    canonicalRegionHash(a.world, a.layout.protectedRegion),
    canonicalRegionHash(b.world, b.layout.protectedRegion)
  );
  assert.equal(
    canonicalEntityHash(a.world, a.layout.protectedRegion),
    canonicalEntityHash(b.world, b.layout.protectedRegion)
  );
  assert.equal(canonicalInventoryHash(a.world), canonicalInventoryHash(b.world));
});
test("planning rejects malformed targets and uncleared obstructions", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const base = proposal(layout.house.id);
  const planned = planPreparation(world, base);
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const missing = planPreparation(world, base, {
    targets: planned.plan.targets.slice(0, -1)
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "target_count");
  const duplicate = planPreparation(world, base, {
    targets: planned.plan.targets.map((t, i) => i === 1 ? { ...planned.plan.targets[0] } : t)
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, "duplicate_target");
  const outside = planPreparation(world, base, {
    targets: planned.plan.targets.map((t, i) => i === 0 ? { ...t, x: t.x - 10 } : t)
  });
  assert.equal(outside.ok, false);
  if (!outside.ok) assert.equal(outside.code, "target_outside_footprint");
  const badHeight = planPreparation(world, base, {
    targets: planned.plan.targets.map((t, i) => i === 0 ? { ...t, y: 500 } : t)
  });
  assert.equal(badHeight.ok, false);
  if (!badHeight.ok) assert.equal(badHeight.code, "target_height");
  const uncleared = planPreparation(world, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  }, { clear: "none" });
  assert.equal(uncleared.ok, false);
  if (!uncleared.ok) assert.equal(uncleared.code, "uncleared_obstructions");
  assert.deepEqual(fingerprint(world), before);
});
test("executor refuses a plan whose obstruction set changed after authorization", () => {
  const { world, layout } = createM002Fixture();
  const planned = planPreparation(world, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const auth = new LocalAuthorizer({ envelope: M002_LAYOUT.envelope }).authorize(world, planned.plan);
  assert.equal(auth.ok, true);
  if (!auth.ok) return;
  const extra = {
    id: "test:extra-rock",
    kind: "styl_rock_small",
    chunk: "30,30",
    x: -32.5,
    y: 16,
    z: -38.5,
    rot: 0,
    scale: 1,
    variant: 0,
    resource: "stone",
    remaining: 2,
    yieldPerHarvest: 1,
    harvested: false,
    provisional: false,
    authored: false
  };
  world.entities.set(extra.id, extra);
  world.entityChunks.get("30,30").push(extra.id);
  const before = fingerprint(world);
  const result = executePreparation(world, planned.plan, auth.authorization);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "unauthorized_edits");
  assert.deepEqual(fingerprint(world), before);
});
test("the execution guard rejects a plan that escapes its own envelope", () => {
  const { world, layout } = createM002Fixture();
  const planned = planPreparation(world, proposal(layout.house.id));
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const auth = housePolicy().authorize(world, planned.plan);
  assert.equal(auth.ok, true);
  if (!auth.ok) return;
  const targets = planned.plan.targets.map((t, i) => i === 0 ? { ...t, x: -80 } : t);
  const forged = { ...planned.plan, targets };
  forged.id = `prep:${planDigest(forged)}`;
  const before = fingerprint(world);
  const result = executePreparation(world, forged, {
    ...auth.authorization,
    planDigest: planDigest(forged)
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "unauthorized_edits");
  assert.ok(result.reasons.some((r) => r.includes("outside the footprint") || r.includes("outside the authorized envelope")));
  assert.deepEqual(fingerprint(world), before);
});
test("authorized execution never touches voxels outside the work envelope", () => {
  const { world, layout } = createM002Fixture();
  const before = fingerprint(world);
  const authorizer = housePolicy();
  const house = prepareSite(world, authorizer, proposal(layout.house.id));
  assert.equal(house.ok, true);
  const farm = prepareSite(world, authorizer, {
    siteId: layout.farm.id,
    rect: layout.farm.rect,
    floorY: 15,
    rules: FARM_RULES
  });
  assert.equal(farm.ok, true);
  assert.deepEqual(editsOutsideEnvelope(world, layout.envelope), []);
  assert.equal(
    canonicalRegionHash(world, layout.protectedRegion, layout.envelope).hash,
    before.outside
  );
  assert.equal(surfaceAt(world, layout.house.rect.x0, layout.house.rect.z0), 11);
  assert.equal(surfaceAt(world, layout.farm.rect.x0, layout.farm.rect.z0), 15);
  assert.equal(getVoxel(world, layout.house.rect.x0, 11, layout.house.rect.z0), MAT.AIR);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMi5wcmVwYXJhdGlvbi50ZXN0LnRzIiwgIi4uLy4uL3NyYy9zaW0vd29ybGQudHMiLCAiLi4vLi4vc3JjL3NpbS90ZXJyYWluLnRzIiwgIi4uLy4uL3NyYy9zaW0vY2Fub25pY2FsLnRzIiwgIi4uLy4uL3NyYy9zaW0vbTAwMi50cyIsICIuLi8uLi9zcmMvc2ltL2NvbnN0cnVjdGlvbi50cyIsICIuLi8uLi9zcmMvc2ltL3ByZXBhcmF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBNMDAyIHN0YWdlIDMgZ2F0ZTogcGxhbiAtPiBhdXRob3JpemUgLT4gZXhlY3V0ZSwgd2l0aCBleGFjdCBsZWRnZXIsXG4vLyBjaHVuayBkZWx0YXMgYW5kIGEgbm8tZmxhdHRlbiBwcm9vZiBvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlLlxuaW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JztcbmltcG9ydCBhc3NlcnQgZnJvbSAnbm9kZTphc3NlcnQvc3RyaWN0JztcbmltcG9ydCB7XG4gIE1BVCwgc3VyZmFjZUF0LCBzZXRWb3hlbCwgZ2V0Vm94ZWwsXG59IGZyb20gJy4uL3NyYy9zaW0vd29ybGQnO1xuaW1wb3J0IHtcbiAgY2Fub25pY2FsUmVnaW9uSGFzaCwgY2Fub25pY2FsRW50aXR5SGFzaCwgY2Fub25pY2FsSW52ZW50b3J5SGFzaCxcbiAgY2hlY2tEZXJpdmVkQ2FjaGVzLCBlZGl0c091dHNpZGVFbnZlbG9wZSxcbn0gZnJvbSAnLi4vc3JjL3NpbS9jYW5vbmljYWwnO1xuaW1wb3J0IHsgY3JlYXRlTTAwMkZpeHR1cmUsIE0wMDJfTEFZT1VUIH0gZnJvbSAnLi4vc3JjL3NpbS9tMDAyJztcbmltcG9ydCB7IEhPVVNFX1JVTEVTLCBGQVJNX1JVTEVTLCBTaXRlUHJvcG9zYWwgfSBmcm9tICcuLi9zcmMvc2ltL2NvbnN0cnVjdGlvbic7XG5pbXBvcnQge1xuICBwbGFuUHJlcGFyYXRpb24sIHBsYW5EaWdlc3QsIHByZXBhcmVTaXRlLCBleGVjdXRlUHJlcGFyYXRpb24sXG4gIExvY2FsQXV0aG9yaXplciwgUHJlcGFyYXRpb25QbGFuLFxufSBmcm9tICcuLi9zcmMvc2ltL3ByZXBhcmF0aW9uJztcblxudHlwZSBXb3JsZCA9IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZU0wMDJGaXh0dXJlPlsnd29ybGQnXTtcblxuZnVuY3Rpb24gZmluZ2VycHJpbnQod29ybGQ6IFdvcmxkKSB7XG4gIHJldHVybiB7XG4gICAgcmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgIHZveGVsczogY2Fub25pY2FsUmVnaW9uSGFzaCh3b3JsZCwgTTAwMl9MQVlPVVQucHJvdGVjdGVkUmVnaW9uKS5oYXNoLFxuICAgIG91dHNpZGU6IGNhbm9uaWNhbFJlZ2lvbkhhc2god29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiwgTTAwMl9MQVlPVVQuZW52ZWxvcGUpLmhhc2gsXG4gICAgZW50aXRpZXM6IGNhbm9uaWNhbEVudGl0eUhhc2god29ybGQsIE0wMDJfTEFZT1VULnByb3RlY3RlZFJlZ2lvbiksXG4gICAgaW52ZW50b3J5OiBjYW5vbmljYWxJbnZlbnRvcnlIYXNoKHdvcmxkKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gcHJvcG9zYWwoc2l0ZUlkOiBzdHJpbmcsIHJlY3QgPSBNMDAyX0xBWU9VVC5ob3VzZS5yZWN0LCBmbG9vclkgPSBNMDAyX0xBWU9VVC5ob3VzZS5mbG9vclkpOiBTaXRlUHJvcG9zYWwge1xuICByZXR1cm4geyBzaXRlSWQsIHJlY3QsIGZsb29yWSwgcnVsZXM6IEhPVVNFX1JVTEVTIH07XG59XG5cbmZ1bmN0aW9uIGhvdXNlUG9saWN5KCkge1xuICByZXR1cm4gbmV3IExvY2FsQXV0aG9yaXplcih7IGVudmVsb3BlOiBNMDAyX0xBWU9VVC5lbnZlbG9wZSB9KTtcbn1cblxudGVzdCgncGxhbm5pbmcgaXMgcmVhZC1vbmx5LCBkZXRlcm1pbmlzdGljIGFuZCBib3VuZGVkJywgKCkgPT4ge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG4gIGNvbnN0IGJlZm9yZSA9IGZpbmdlcnByaW50KHdvcmxkKTtcblxuICBjb25zdCBmaXJzdCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwobGF5b3V0LmhvdXNlLmlkKSk7XG4gIGNvbnN0IHNlY29uZCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwobGF5b3V0LmhvdXNlLmlkKSk7XG4gIGFzc2VydC5lcXVhbChmaXJzdC5vaywgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChzZWNvbmQub2ssIHRydWUpO1xuICBpZiAoIWZpcnN0Lm9rIHx8ICFzZWNvbmQub2spIHJldHVybjtcblxuICBhc3NlcnQuZXF1YWwoZmlyc3QucGxhbi50YXJnZXRzLmxlbmd0aCwgNDgpO1xuICBhc3NlcnQub2soZmlyc3QucGxhbi50YXJnZXRzLmV2ZXJ5KCh0KSA9PiB0LnkgPT09IGxheW91dC5ob3VzZS5mbG9vclkpKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChmaXJzdC5wbGFuLmNsZWFyRW50aXR5SWRzLCBbXSk7XG4gIGFzc2VydC5lcXVhbChmaXJzdC5wbGFuLmV4cGVjdGVkLmN1dFZvbHVtZSwgMyk7XG4gIGFzc2VydC5lcXVhbChmaXJzdC5wbGFuLmV4cGVjdGVkLmZpbGxWb2x1bWUsIDE4KTtcbiAgYXNzZXJ0LmVxdWFsKGZpcnN0LnBsYW4uZXhwZWN0ZWQub2JzdHJ1Y3Rpb25zLCAwKTtcbiAgYXNzZXJ0LmVxdWFsKHBsYW5EaWdlc3QoZmlyc3QucGxhbiksIHBsYW5EaWdlc3Qoc2Vjb25kLnBsYW4pKTtcbiAgYXNzZXJ0LmVxdWFsKGZpcnN0LnBsYW4uaWQsIHNlY29uZC5wbGFuLmlkKTtcblxuICAvLyBUaGUgcGxhbiBlbnZlbG9wZSBpcyB0aWdodCBhbmQgaW5zaWRlIHRoZSBwaW5uZWQgTTAwMiB3b3JrIGVudmVsb3BlLlxuICBhc3NlcnQuZXF1YWwoZmlyc3QucGxhbi5lbnZlbG9wZS5sZW5ndGgsIDEpO1xuICBjb25zdCBlID0gZmlyc3QucGxhbi5lbnZlbG9wZVswXTtcbiAgYXNzZXJ0Lm9rKGUueDAgPj0gLTYyICYmIGUueDEgPD0gLTUxICYmIGUuejAgPj0gLTQ4ICYmIGUuejEgPD0gLTM5KTtcbiAgYXNzZXJ0Lm9rKGUueTAgPj0gOCAmJiBlLnkxIDw9IDE2KTtcblxuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYmVmb3JlKTtcblxuICAvLyBBIHJlamVjdGVkIHNpdGUgY2Fubm90IHByb2R1Y2UgYSBwbGFuIG9yIGFuIGVkaXQuXG4gIGNvbnN0IHJlamVjdGVkID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBwcm9wb3NhbChcbiAgICBsYXlvdXQucmVqZWN0ZWQuaWQsIGxheW91dC5yZWplY3RlZC5yZWN0LCBsYXlvdXQucmVqZWN0ZWQuZmxvb3JZLFxuICApKTtcbiAgYXNzZXJ0LmVxdWFsKHJlamVjdGVkLm9rLCBmYWxzZSk7XG4gIGlmICghcmVqZWN0ZWQub2spIHtcbiAgICBhc3NlcnQuZXF1YWwocmVqZWN0ZWQuc3RhZ2UsICdwbGFuJyk7XG4gICAgYXNzZXJ0LmVxdWFsKHJlamVjdGVkLmNvZGUsICdzaXRlX2ludmFsaWQnKTtcbiAgICBhc3NlcnQub2socmVqZWN0ZWQucmVhc29ucy5sZW5ndGggPj0gNCk7XG4gIH1cbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGJlZm9yZSk7XG59KTtcblxudGVzdCgnaG91c2UgcHJlcGFyYXRpb24gYXBwbGllcyBleGFjdGx5IHRoZSBwbGFubmVkIHZveGVsIGVkaXRzJywgKCkgPT4ge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG4gIGNvbnN0IGJlZm9yZSA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3QgYXV0aG9yaXplciA9IGhvdXNlUG9saWN5KCk7XG5cbiAgY29uc3QgcGxhbm5lZCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgcHJvcG9zYWwobGF5b3V0LmhvdXNlLmlkKSk7XG4gIGFzc2VydC5lcXVhbChwbGFubmVkLm9rLCB0cnVlKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm47XG4gIGNvbnN0IGRlY2lzaW9uID0gYXV0aG9yaXplci5hdXRob3JpemUod29ybGQsIHBsYW5uZWQucGxhbik7XG4gIGFzc2VydC5lcXVhbChkZWNpc2lvbi5vaywgdHJ1ZSk7XG4gIGFzc2VydC5vayhkZWNpc2lvbi5hdXRob3JpemF0aW9uKTtcblxuICBjb25zdCByZXN1bHQgPSBleGVjdXRlUHJlcGFyYXRpb24od29ybGQsIHBsYW5uZWQucGxhbiwgZGVjaXNpb24uYXV0aG9yaXphdGlvbiEpO1xuICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCB0cnVlKTtcbiAgaWYgKCFyZXN1bHQub2spIHJldHVybjtcbiAgY29uc3QgeyBsZWRnZXIgfSA9IHJlc3VsdDtcblxuICBhc3NlcnQuZXF1YWwobGVkZ2VyLmF1dGhvcml0eSwgJ2xvY2FsLXN0dWInKTtcbiAgYXNzZXJ0LmVxdWFsKGxlZGdlci5lbmZvcmNlbWVudCwgJ2xvY2FsLXNpbXVsYXRpb24tb25seScpO1xuICBhc3NlcnQuZXF1YWwobGVkZ2VyLnBsYW5EaWdlc3QsIHBsYW5EaWdlc3QocGxhbm5lZC5wbGFuKSk7XG4gIGFzc2VydC5lcXVhbChsZWRnZXIuY3V0Vm9sdW1lLCAzKTtcbiAgYXNzZXJ0LmVxdWFsKGxlZGdlci5maWxsVm9sdW1lLCAxOCk7XG4gIGFzc2VydC5lcXVhbChsZWRnZXIubmV0U3BvaWwsIC0xNSk7XG4gIGFzc2VydC5lcXVhbChsZWRnZXIuYm9ycm93ZWRGaWxsLCAxNSk7XG4gIGFzc2VydC5lcXVhbChsZWRnZXIudm94ZWxFZGl0cywgMjEpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGxlZGdlci5jdXRCeU1hdGVyaWFsLCB7IGdyYXNzOiAzIH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGxlZGdlci5maWxsQnlNYXRlcmlhbCwgeyBncmFzczogMTggfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwobGVkZ2VyLmVudGl0aWVzQ2xlYXJlZCwgW10pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGxlZGdlci5yZXNvdXJjZXNHYWluZWQsIHt9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChsZWRnZXIuaW52ZW50b3J5QmVmb3JlLCB7fSk7XG4gIGFzc2VydC5kZWVwRXF1YWwobGVkZ2VyLmludmVudG9yeUFmdGVyLCB7fSk7XG4gIGFzc2VydC5lcXVhbChsZWRnZXIucmV2aXNpb25BZnRlciAtIGxlZGdlci5yZXZpc2lvbkJlZm9yZSwgMjEpO1xuXG4gIGFzc2VydC5lcXVhbChsZWRnZXIuY2h1bmtEZWx0YXMubGVuZ3RoLCAxKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChsZWRnZXIuY2h1bmtEZWx0YXNbMF0sIHtcbiAgICBjaHVuazogJzMwLDMwJywgY2hhbmdlZDogMjEsIGFkZGVkOiAxOCwgcmVtb3ZlZDogMyxcbiAgfSk7XG5cbiAgLy8gRXZlcnkgZm9vdHByaW50IGNvbHVtbiBub3cgaGFzIHRoZSBwcmVwYXJlZCB3YWxraW5nIGZsb29yLlxuICBmb3IgKGxldCB6ID0gbGF5b3V0LmhvdXNlLnJlY3QuejA7IHogPD0gbGF5b3V0LmhvdXNlLnJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSBsYXlvdXQuaG91c2UucmVjdC54MDsgeCA8PSBsYXlvdXQuaG91c2UucmVjdC54MTsgeCsrKSB7XG4gICAgICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KHdvcmxkLCB4LCB6KSwgbGF5b3V0LmhvdXNlLmZsb29yWSwgYGNvbHVtbiAke3h9LCR7en1gKTtcbiAgICB9XG4gIH1cblxuICAvLyBObyB0ZXJyYWluIG9yIHJlc291cmNlIGNoYW5nZSBvdXRzaWRlIHRoZSBjb21wbGV0ZSBhdXRob3JpemVkIGVudmVsb3BlLlxuICBjb25zdCBhZnRlciA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgYXNzZXJ0LmVxdWFsKGFmdGVyLm91dHNpZGUsIGJlZm9yZS5vdXRzaWRlKTtcbiAgYXNzZXJ0LmVxdWFsKGFmdGVyLmVudGl0aWVzLCBiZWZvcmUuZW50aXRpZXMpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIuaW52ZW50b3J5LCBiZWZvcmUuaW52ZW50b3J5KTtcbiAgYXNzZXJ0Lm5vdEVxdWFsKGFmdGVyLnZveGVscywgYmVmb3JlLnZveGVscyk7XG4gIGFzc2VydC5kZWVwRXF1YWwoZWRpdHNPdXRzaWRlRW52ZWxvcGUod29ybGQsIGxheW91dC5lbnZlbG9wZSksIFtdKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChjaGVja0Rlcml2ZWRDYWNoZXMod29ybGQsIGxheW91dC5wcm90ZWN0ZWRSZWdpb24pLCBbXSk7XG4gIGFzc2VydC5vayh3b3JsZC5kaXJ0eS5oYXMoJzMwLDMwJykpO1xuXG4gIC8vIFJlcGxheWluZyB0aGUgc2FtZSB0b2tlbiBpcyBhIHN0YWxlIG5vLW9wLCBub3QgYSBzZWNvbmQgZXhjYXZhdGlvbi5cbiAgY29uc3QgcmVwbGF5ID0gZXhlY3V0ZVByZXBhcmF0aW9uKHdvcmxkLCBwbGFubmVkLnBsYW4sIGRlY2lzaW9uLmF1dGhvcml6YXRpb24hKTtcbiAgYXNzZXJ0LmVxdWFsKHJlcGxheS5vaywgZmFsc2UpO1xuICBpZiAoIXJlcGxheS5vaykgYXNzZXJ0LmVxdWFsKHJlcGxheS5jb2RlLCAnc3RhbGVfYXV0aG9yaXphdGlvbicpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYWZ0ZXIpO1xufSk7XG5cbnRlc3QoJ3ByZXBhcmF0aW9uIGNsZWFycyBhdXRob3JpemVkIG9ic3RydWN0aW9ucyBhbmQgY3JlZGl0cyB0aGVpciByZXNvdXJjZXMnLCAoKSA9PiB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBlbnRpdHlDb3VudCA9IHdvcmxkLmVudGl0aWVzLnNpemU7XG4gIGNvbnN0IGF1dGhvcml6ZXIgPSBuZXcgTG9jYWxBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pO1xuXG4gIGNvbnN0IHJlc3VsdCA9IHByZXBhcmVTaXRlKHdvcmxkLCBhdXRob3JpemVyLCB7XG4gICAgc2l0ZUlkOiBsYXlvdXQuZmFybS5pZCxcbiAgICByZWN0OiBsYXlvdXQuZmFybS5yZWN0LFxuICAgIGZsb29yWTogMTUsXG4gICAgcnVsZXM6IEZBUk1fUlVMRVMsXG4gIH0pO1xuICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCB0cnVlKTtcbiAgaWYgKCFyZXN1bHQub2spIHJldHVybjtcbiAgY29uc3QgeyBsZWRnZXIgfSA9IHJlc3VsdDtcblxuICBhc3NlcnQuZXF1YWwobGVkZ2VyLmN1dFZvbHVtZSwgNDEpO1xuICBhc3NlcnQuZXF1YWwobGVkZ2VyLmZpbGxWb2x1bWUsIDIyKTtcbiAgYXNzZXJ0LmVxdWFsKGxlZGdlci52b3hlbEVkaXRzLCA2Myk7XG4gIGFzc2VydC5kZWVwRXF1YWwobGVkZ2VyLmVudGl0aWVzQ2xlYXJlZC5tYXAoKGUpID0+IGUuZW50aXR5SWQpLCBbXG4gICAgJ2hlcm86c3R5bF9vcmU6LTM4Oi00MicsXG4gICAgJ2hlcm86c3R5bF90cmVlX2Jsb3Nzb206LTI4Oi0zOCcsXG4gIF0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGxlZGdlci5yZXNvdXJjZXNHYWluZWQsIHsgb3JlOiA4LCB3b29kOiAxMiB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChsZWRnZXIuaW52ZW50b3J5QWZ0ZXIsIHsgb3JlOiA4LCB3b29kOiAxMiB9KTtcbiAgYXNzZXJ0LmVxdWFsKHdvcmxkLmVudGl0aWVzLnNpemUsIGVudGl0eUNvdW50IC0gMik7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5lbnRpdGllcy5oYXMoJ2hlcm86c3R5bF9vcmU6LTM4Oi00MicpLCBmYWxzZSk7XG4gIGFzc2VydC5lcXVhbCh3b3JsZC5lbnRpdGllcy5oYXMoJ2hlcm86c3R5bF90cmVlX2Jsb3Nzb206LTI4Oi0zOCcpLCBmYWxzZSk7XG5cbiAgY29uc3QgY2h1bmtUb3RhbHMgPSBsZWRnZXIuY2h1bmtEZWx0YXMucmVkdWNlKChzdW0sIGQpID0+ICh7XG4gICAgY2hhbmdlZDogc3VtLmNoYW5nZWQgKyBkLmNoYW5nZWQsXG4gICAgYWRkZWQ6IHN1bS5hZGRlZCArIGQuYWRkZWQsXG4gICAgcmVtb3ZlZDogc3VtLnJlbW92ZWQgKyBkLnJlbW92ZWQsXG4gIH0pLCB7IGNoYW5nZWQ6IDAsIGFkZGVkOiAwLCByZW1vdmVkOiAwIH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGNodW5rVG90YWxzLCB7IGNoYW5nZWQ6IDYzLCBhZGRlZDogMjIsIHJlbW92ZWQ6IDQxIH0pO1xuXG4gIGZvciAobGV0IHogPSBsYXlvdXQuZmFybS5yZWN0LnowOyB6IDw9IGxheW91dC5mYXJtLnJlY3QuejE7IHorKykge1xuICAgIGZvciAobGV0IHggPSBsYXlvdXQuZmFybS5yZWN0LngwOyB4IDw9IGxheW91dC5mYXJtLnJlY3QueDE7IHgrKykge1xuICAgICAgYXNzZXJ0LmVxdWFsKHN1cmZhY2VBdCh3b3JsZCwgeCwgeiksIDE1LCBgY29sdW1uICR7eH0sJHt6fWApO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGFmdGVyID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBhc3NlcnQuZXF1YWwoYWZ0ZXIub3V0c2lkZSwgYmVmb3JlLm91dHNpZGUpO1xuICBhc3NlcnQubm90RXF1YWwoYWZ0ZXIuZW50aXRpZXMsIGJlZm9yZS5lbnRpdGllcyk7XG4gIGFzc2VydC5ub3RFcXVhbChhZnRlci5pbnZlbnRvcnksIGJlZm9yZS5pbnZlbnRvcnkpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGVkaXRzT3V0c2lkZUVudmVsb3BlKHdvcmxkLCBsYXlvdXQuZW52ZWxvcGUpLCBbXSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoY2hlY2tEZXJpdmVkQ2FjaGVzKHdvcmxkLCBsYXlvdXQucHJvdGVjdGVkUmVnaW9uKSwgW10pO1xufSk7XG5cbnRlc3QoJ2V4ZWN1dGlvbiByZWplY3RzIGZvcmdlZCwgc3RhbGUgb3Igb3Zlci1saW1pdCBhdXRob3JpemF0aW9uIGJlZm9yZSB3cml0aW5nJywgKCkgPT4ge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUHJlcGFyYXRpb24od29ybGQsIHByb3Bvc2FsKGxheW91dC5ob3VzZS5pZCkpO1xuICBhc3NlcnQuZXF1YWwocGxhbm5lZC5vaywgdHJ1ZSk7XG4gIGlmICghcGxhbm5lZC5vaykgcmV0dXJuO1xuICBjb25zdCBhdXRob3JpemVyID0gaG91c2VQb2xpY3koKTtcbiAgY29uc3QgZGVjaXNpb24gPSBhdXRob3JpemVyLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgYXNzZXJ0LmVxdWFsKGRlY2lzaW9uLm9rLCB0cnVlKTtcbiAgY29uc3QgYXV0aCA9IGRlY2lzaW9uLmF1dGhvcml6YXRpb24hO1xuXG4gIGNvbnN0IGJlZm9yZSA9IGZpbmdlcnByaW50KHdvcmxkKTtcblxuICBjb25zdCBmb3JnZWREaWdlc3QgPSBleGVjdXRlUHJlcGFyYXRpb24od29ybGQsIHBsYW5uZWQucGxhbiwge1xuICAgIC4uLmF1dGgsIHBsYW5EaWdlc3Q6ICcwMDAwMDAwMDAwMDAwMDAwJyxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChmb3JnZWREaWdlc3Qub2ssIGZhbHNlKTtcbiAgaWYgKCFmb3JnZWREaWdlc3Qub2spIGFzc2VydC5lcXVhbChmb3JnZWREaWdlc3QuY29kZSwgJ2RpZ2VzdF9taXNtYXRjaCcpO1xuXG4gIGNvbnN0IGZvcmdlZEF1dGhvcml0eSA9IGV4ZWN1dGVQcmVwYXJhdGlvbih3b3JsZCwgcGxhbm5lZC5wbGFuLCB7XG4gICAgLi4uYXV0aCwgYXV0aG9yaXR5OiAnbWFnaWNibG9jaycgYXMgbmV2ZXIsXG4gIH0pO1xuICBhc3NlcnQuZXF1YWwoZm9yZ2VkQXV0aG9yaXR5Lm9rLCBmYWxzZSk7XG4gIGlmICghZm9yZ2VkQXV0aG9yaXR5Lm9rKSBhc3NlcnQuZXF1YWwoZm9yZ2VkQXV0aG9yaXR5LmNvZGUsICd1bnN1cHBvcnRlZF9hdXRob3JpdHknKTtcblxuICBjb25zdCBuYXJyb3dlZCA9IGV4ZWN1dGVQcmVwYXJhdGlvbih3b3JsZCwgcGxhbm5lZC5wbGFuLCB7XG4gICAgLi4uYXV0aCxcbiAgICBlbnZlbG9wZTogW3sgLi4uYXV0aC5lbnZlbG9wZVswXSwgeTE6IGF1dGguZW52ZWxvcGVbMF0ueTAgfV0sXG4gIH0pO1xuICBhc3NlcnQuZXF1YWwobmFycm93ZWQub2ssIGZhbHNlKTtcbiAgaWYgKCFuYXJyb3dlZC5vaykgYXNzZXJ0LmVxdWFsKG5hcnJvd2VkLmNvZGUsICdlbnZlbG9wZV9taXNtYXRjaCcpO1xuXG4gIGNvbnN0IGxpbWl0ZWQgPSBuZXcgTG9jYWxBdXRob3JpemVyKHtcbiAgICBlbnZlbG9wZTogTTAwMl9MQVlPVVQuZW52ZWxvcGUsXG4gICAgbGltaXRzOiB7IG1heEN1dFZvbHVtZTogMSB9LFxuICB9KS5hdXRob3JpemUod29ybGQsIHBsYW5uZWQucGxhbik7XG4gIGFzc2VydC5lcXVhbChsaW1pdGVkLm9rLCBmYWxzZSk7XG4gIGFzc2VydC5vayhsaW1pdGVkLnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnY3V0IDMgZXhjZWVkcyBsaW1pdCAxJykpKTtcblxuICBjb25zdCBvdXRzaWRlUG9saWN5ID0gbmV3IExvY2FsQXV0aG9yaXplcih7XG4gICAgZW52ZWxvcGU6IFtNMDAyX0xBWU9VVC5lbnZlbG9wZVsyXV0sXG4gIH0pLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgYXNzZXJ0LmVxdWFsKG91dHNpZGVQb2xpY3kub2ssIGZhbHNlKTtcbiAgYXNzZXJ0Lm9rKG91dHNpZGVQb2xpY3kucmVhc29ucy5zb21lKChyKSA9PiByLmluY2x1ZGVzKCdvdXRzaWRlIHRoZSBsb2NhbCBwb2xpY3knKSkpO1xuXG4gIGFzc2VydC5kZWVwRXF1YWwoZmluZ2VycHJpbnQod29ybGQpLCBiZWZvcmUpO1xuXG4gIC8vIEEgc3RhbGUgdG9rZW4gaXMgcmVqZWN0ZWQgZXZlbiB0aG91Z2ggaXQgd2FzIGdlbnVpbmVseSBpc3N1ZWQuXG4gIGFzc2VydC5lcXVhbChzZXRWb3hlbCh3b3JsZCwgLTQ1LCBzdXJmYWNlQXQod29ybGQsIC00NSwgLTQzKSwgLTQzLCBNQVQuU1RPTkUpLCB0cnVlKTtcbiAgY29uc3QgYWZ0ZXJNYW51YWxFZGl0ID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBzdGFsZSA9IGV4ZWN1dGVQcmVwYXJhdGlvbih3b3JsZCwgcGxhbm5lZC5wbGFuLCBhdXRoKTtcbiAgYXNzZXJ0LmVxdWFsKHN0YWxlLm9rLCBmYWxzZSk7XG4gIGlmICghc3RhbGUub2spIGFzc2VydC5lcXVhbChzdGFsZS5jb2RlLCAnc3RhbGVfYXV0aG9yaXphdGlvbicpO1xuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYWZ0ZXJNYW51YWxFZGl0KTtcbn0pO1xuXG50ZXN0KCdwcmVwYXJhdGlvbiBpcyBkZXRlcm1pbmlzdGljIGFjcm9zcyBpbmRlcGVuZGVudCByZXBsYXlzJywgKCkgPT4ge1xuICBjb25zdCBhID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgYiA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG5cbiAgY29uc3QgcmEgPSBwcmVwYXJlU2l0ZShhLndvcmxkLCBob3VzZVBvbGljeSgpLCBwcm9wb3NhbChhLmxheW91dC5ob3VzZS5pZCkpO1xuICBjb25zdCByYiA9IHByZXBhcmVTaXRlKGIud29ybGQsIGhvdXNlUG9saWN5KCksIHByb3Bvc2FsKGIubGF5b3V0LmhvdXNlLmlkKSk7XG4gIGFzc2VydC5lcXVhbChyYS5vaywgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChyYi5vaywgdHJ1ZSk7XG4gIGlmICghcmEub2sgfHwgIXJiLm9rKSByZXR1cm47XG5cbiAgYXNzZXJ0LmRlZXBFcXVhbChyYS5sZWRnZXIsIHJiLmxlZGdlcik7XG4gIGFzc2VydC5lcXVhbChyYS5hdXRob3JpemF0aW9uLmlkLCByYi5hdXRob3JpemF0aW9uLmlkKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChcbiAgICBjYW5vbmljYWxSZWdpb25IYXNoKGEud29ybGQsIGEubGF5b3V0LnByb3RlY3RlZFJlZ2lvbiksXG4gICAgY2Fub25pY2FsUmVnaW9uSGFzaChiLndvcmxkLCBiLmxheW91dC5wcm90ZWN0ZWRSZWdpb24pLFxuICApO1xuICBhc3NlcnQuZXF1YWwoXG4gICAgY2Fub25pY2FsRW50aXR5SGFzaChhLndvcmxkLCBhLmxheW91dC5wcm90ZWN0ZWRSZWdpb24pLFxuICAgIGNhbm9uaWNhbEVudGl0eUhhc2goYi53b3JsZCwgYi5sYXlvdXQucHJvdGVjdGVkUmVnaW9uKSxcbiAgKTtcbiAgYXNzZXJ0LmVxdWFsKGNhbm9uaWNhbEludmVudG9yeUhhc2goYS53b3JsZCksIGNhbm9uaWNhbEludmVudG9yeUhhc2goYi53b3JsZCkpO1xufSk7XG5cbnRlc3QoJ3BsYW5uaW5nIHJlamVjdHMgbWFsZm9ybWVkIHRhcmdldHMgYW5kIHVuY2xlYXJlZCBvYnN0cnVjdGlvbnMnLCAoKSA9PiB7XG4gIGNvbnN0IHsgd29ybGQsIGxheW91dCB9ID0gY3JlYXRlTTAwMkZpeHR1cmUoKTtcbiAgY29uc3QgYmVmb3JlID0gZmluZ2VycHJpbnQod29ybGQpO1xuICBjb25zdCBiYXNlID0gcHJvcG9zYWwobGF5b3V0LmhvdXNlLmlkKTtcblxuICBjb25zdCBwbGFubmVkID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBiYXNlKTtcbiAgYXNzZXJ0LmVxdWFsKHBsYW5uZWQub2ssIHRydWUpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybjtcblxuICBjb25zdCBtaXNzaW5nID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBiYXNlLCB7XG4gICAgdGFyZ2V0czogcGxhbm5lZC5wbGFuLnRhcmdldHMuc2xpY2UoMCwgLTEpLFxuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKG1pc3Npbmcub2ssIGZhbHNlKTtcbiAgaWYgKCFtaXNzaW5nLm9rKSBhc3NlcnQuZXF1YWwobWlzc2luZy5jb2RlLCAndGFyZ2V0X2NvdW50Jyk7XG5cbiAgY29uc3QgZHVwbGljYXRlID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBiYXNlLCB7XG4gICAgdGFyZ2V0czogcGxhbm5lZC5wbGFuLnRhcmdldHMubWFwKCh0LCBpKSA9PiAoaSA9PT0gMSA/IHsgLi4ucGxhbm5lZC5wbGFuLnRhcmdldHNbMF0gfSA6IHQpKSxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChkdXBsaWNhdGUub2ssIGZhbHNlKTtcbiAgaWYgKCFkdXBsaWNhdGUub2spIGFzc2VydC5lcXVhbChkdXBsaWNhdGUuY29kZSwgJ2R1cGxpY2F0ZV90YXJnZXQnKTtcblxuICBjb25zdCBvdXRzaWRlID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBiYXNlLCB7XG4gICAgdGFyZ2V0czogcGxhbm5lZC5wbGFuLnRhcmdldHMubWFwKCh0LCBpKSA9PiAoaSA9PT0gMCA/IHsgLi4udCwgeDogdC54IC0gMTAgfSA6IHQpKSxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChvdXRzaWRlLm9rLCBmYWxzZSk7XG4gIGlmICghb3V0c2lkZS5vaykgYXNzZXJ0LmVxdWFsKG91dHNpZGUuY29kZSwgJ3RhcmdldF9vdXRzaWRlX2Zvb3RwcmludCcpO1xuXG4gIGNvbnN0IGJhZEhlaWdodCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwgYmFzZSwge1xuICAgIHRhcmdldHM6IHBsYW5uZWQucGxhbi50YXJnZXRzLm1hcCgodCwgaSkgPT4gKGkgPT09IDAgPyB7IC4uLnQsIHk6IDUwMCB9IDogdCkpLFxuICB9KTtcbiAgYXNzZXJ0LmVxdWFsKGJhZEhlaWdodC5vaywgZmFsc2UpO1xuICBpZiAoIWJhZEhlaWdodC5vaykgYXNzZXJ0LmVxdWFsKGJhZEhlaWdodC5jb2RlLCAndGFyZ2V0X2hlaWdodCcpO1xuXG4gIGNvbnN0IHVuY2xlYXJlZCA9IHBsYW5QcmVwYXJhdGlvbih3b3JsZCwge1xuICAgIHNpdGVJZDogbGF5b3V0LmZhcm0uaWQsIHJlY3Q6IGxheW91dC5mYXJtLnJlY3QsIGZsb29yWTogMTUsIHJ1bGVzOiBGQVJNX1JVTEVTLFxuICB9LCB7IGNsZWFyOiAnbm9uZScgfSk7XG4gIGFzc2VydC5lcXVhbCh1bmNsZWFyZWQub2ssIGZhbHNlKTtcbiAgaWYgKCF1bmNsZWFyZWQub2spIGFzc2VydC5lcXVhbCh1bmNsZWFyZWQuY29kZSwgJ3VuY2xlYXJlZF9vYnN0cnVjdGlvbnMnKTtcblxuICBhc3NlcnQuZGVlcEVxdWFsKGZpbmdlcnByaW50KHdvcmxkKSwgYmVmb3JlKTtcbn0pO1xuXG50ZXN0KCdleGVjdXRvciByZWZ1c2VzIGEgcGxhbiB3aG9zZSBvYnN0cnVjdGlvbiBzZXQgY2hhbmdlZCBhZnRlciBhdXRob3JpemF0aW9uJywgKCkgPT4ge1xuICBjb25zdCB7IHdvcmxkLCBsYXlvdXQgfSA9IGNyZWF0ZU0wMDJGaXh0dXJlKCk7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUHJlcGFyYXRpb24od29ybGQsIHtcbiAgICBzaXRlSWQ6IGxheW91dC5mYXJtLmlkLCByZWN0OiBsYXlvdXQuZmFybS5yZWN0LCBmbG9vclk6IDE1LCBydWxlczogRkFSTV9SVUxFUyxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChwbGFubmVkLm9rLCB0cnVlKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm47XG4gIGNvbnN0IGF1dGggPSBuZXcgTG9jYWxBdXRob3JpemVyKHsgZW52ZWxvcGU6IE0wMDJfTEFZT1VULmVudmVsb3BlIH0pXG4gICAgLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgYXNzZXJ0LmVxdWFsKGF1dGgub2ssIHRydWUpO1xuICBpZiAoIWF1dGgub2spIHJldHVybjtcblxuICAvLyBBIG5ldyBvYnN0cnVjdGlvbiBhcHBlYXJzIG9uIHRoZSBmb290cHJpbnQgYWZ0ZXIgYXV0aG9yaXphdGlvbi4gUmV2aXNpb25cbiAgLy8gaXMgZGVsaWJlcmF0ZWx5IGxlZnQgdW50b3VjaGVkIHNvIHRoZSB0ZXN0IHJlYWNoZXMgdGhlIGV4ZWN1dG9yJ3Mgc2Vjb25kXG4gIC8vIGd1YXJkOiBpdCByZS1yZWFkcyB0aGUgb2JzdHJ1Y3Rpb24gc2V0IGluc3RlYWQgb2YgdHJ1c3RpbmcgdGhlIHRva2VuLlxuICBjb25zdCBleHRyYSA9IHtcbiAgICBpZDogJ3Rlc3Q6ZXh0cmEtcm9jaycsXG4gICAga2luZDogJ3N0eWxfcm9ja19zbWFsbCcgYXMgY29uc3QsXG4gICAgY2h1bms6ICczMCwzMCcsXG4gICAgeDogLTMyLjUsIHk6IDE2LCB6OiAtMzguNSxcbiAgICByb3Q6IDAsIHNjYWxlOiAxLCB2YXJpYW50OiAwLFxuICAgIHJlc291cmNlOiAnc3RvbmUnIGFzIGNvbnN0LCByZW1haW5pbmc6IDIsIHlpZWxkUGVySGFydmVzdDogMSxcbiAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogZmFsc2UsIGF1dGhvcmVkOiBmYWxzZSxcbiAgfTtcbiAgd29ybGQuZW50aXRpZXMuc2V0KGV4dHJhLmlkLCBleHRyYSk7XG4gIHdvcmxkLmVudGl0eUNodW5rcy5nZXQoJzMwLDMwJykhLnB1c2goZXh0cmEuaWQpO1xuXG4gIGNvbnN0IGJlZm9yZSA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3QgcmVzdWx0ID0gZXhlY3V0ZVByZXBhcmF0aW9uKHdvcmxkLCBwbGFubmVkLnBsYW4sIGF1dGguYXV0aG9yaXphdGlvbiEpO1xuICBhc3NlcnQuZXF1YWwocmVzdWx0Lm9rLCBmYWxzZSk7XG4gIGlmICghcmVzdWx0Lm9rKSBhc3NlcnQuZXF1YWwocmVzdWx0LmNvZGUsICd1bmF1dGhvcml6ZWRfZWRpdHMnKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGJlZm9yZSk7XG59KTtcblxudGVzdCgndGhlIGV4ZWN1dGlvbiBndWFyZCByZWplY3RzIGEgcGxhbiB0aGF0IGVzY2FwZXMgaXRzIG93biBlbnZlbG9wZScsICgpID0+IHtcbiAgY29uc3QgeyB3b3JsZCwgbGF5b3V0IH0gPSBjcmVhdGVNMDAyRml4dHVyZSgpO1xuICBjb25zdCBwbGFubmVkID0gcGxhblByZXBhcmF0aW9uKHdvcmxkLCBwcm9wb3NhbChsYXlvdXQuaG91c2UuaWQpKTtcbiAgYXNzZXJ0LmVxdWFsKHBsYW5uZWQub2ssIHRydWUpO1xuICBpZiAoIXBsYW5uZWQub2spIHJldHVybjtcbiAgY29uc3QgYXV0aCA9IGhvdXNlUG9saWN5KCkuYXV0aG9yaXplKHdvcmxkLCBwbGFubmVkLnBsYW4pO1xuICBhc3NlcnQuZXF1YWwoYXV0aC5vaywgdHJ1ZSk7XG4gIGlmICghYXV0aC5vaykgcmV0dXJuO1xuXG4gIC8vIEZvcmdlIGEgcGxhbiB3aXRoIG9uZSB0YXJnZXQgbW92ZWQgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCBlbnZlbG9wZSB3aGlsZVxuICAvLyBrZWVwaW5nIHRoZSBkaWdlc3QgY29uc2lzdGVudCB3aXRoIHRoZSBmb3JnZWQgcGxhbi5cbiAgY29uc3QgdGFyZ2V0cyA9IHBsYW5uZWQucGxhbi50YXJnZXRzLm1hcCgodCwgaSkgPT4gKGkgPT09IDAgPyB7IC4uLnQsIHg6IC04MCB9IDogdCkpO1xuICBjb25zdCBmb3JnZWQ6IFByZXBhcmF0aW9uUGxhbiA9IHsgLi4ucGxhbm5lZC5wbGFuLCB0YXJnZXRzIH07XG4gIGZvcmdlZC5pZCA9IGBwcmVwOiR7cGxhbkRpZ2VzdChmb3JnZWQpfWA7XG4gIGNvbnN0IGJlZm9yZSA9IGZpbmdlcnByaW50KHdvcmxkKTtcbiAgY29uc3QgcmVzdWx0ID0gZXhlY3V0ZVByZXBhcmF0aW9uKHdvcmxkLCBmb3JnZWQsIHtcbiAgICAuLi5hdXRoLmF1dGhvcml6YXRpb24hLFxuICAgIHBsYW5EaWdlc3Q6IHBsYW5EaWdlc3QoZm9yZ2VkKSxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChyZXN1bHQub2ssIGZhbHNlKTtcbiAgaWYgKCFyZXN1bHQub2spIGFzc2VydC5lcXVhbChyZXN1bHQuY29kZSwgJ3VuYXV0aG9yaXplZF9lZGl0cycpO1xuICBhc3NlcnQub2socmVzdWx0LnJlYXNvbnMuc29tZSgocikgPT4gci5pbmNsdWRlcygnb3V0c2lkZSB0aGUgZm9vdHByaW50JylcbiAgICB8fCByLmluY2x1ZGVzKCdvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlJykpKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChmaW5nZXJwcmludCh3b3JsZCksIGJlZm9yZSk7XG59KTtcblxudGVzdCgnYXV0aG9yaXplZCBleGVjdXRpb24gbmV2ZXIgdG91Y2hlcyB2b3hlbHMgb3V0c2lkZSB0aGUgd29yayBlbnZlbG9wZScsICgpID0+IHtcbiAgY29uc3QgeyB3b3JsZCwgbGF5b3V0IH0gPSBjcmVhdGVNMDAyRml4dHVyZSgpO1xuICBjb25zdCBiZWZvcmUgPSBmaW5nZXJwcmludCh3b3JsZCk7XG4gIGNvbnN0IGF1dGhvcml6ZXIgPSBob3VzZVBvbGljeSgpO1xuXG4gIC8vIEhvdXNlLCBwYXRoLWxpa2UgY29ycmlkb3IgYW5kIGZhcm0gYWxsIGluIG9uZSBzZXNzaW9uOiB0aGUgY29tcGxldGUgTTAwMlxuICAvLyBlbnZlbG9wZSBpcyB0aGUgdW5pb24sIHNvIGVhY2ggYWN0aW9uIG11c3Qgc3RheSBpbnNpZGUgaXRzIG93biBzdWJzZXQuXG4gIGNvbnN0IGhvdXNlID0gcHJlcGFyZVNpdGUod29ybGQsIGF1dGhvcml6ZXIsIHByb3Bvc2FsKGxheW91dC5ob3VzZS5pZCkpO1xuICBhc3NlcnQuZXF1YWwoaG91c2Uub2ssIHRydWUpO1xuICBjb25zdCBmYXJtID0gcHJlcGFyZVNpdGUod29ybGQsIGF1dGhvcml6ZXIsIHtcbiAgICBzaXRlSWQ6IGxheW91dC5mYXJtLmlkLCByZWN0OiBsYXlvdXQuZmFybS5yZWN0LCBmbG9vclk6IDE1LCBydWxlczogRkFSTV9SVUxFUyxcbiAgfSk7XG4gIGFzc2VydC5lcXVhbChmYXJtLm9rLCB0cnVlKTtcblxuICBhc3NlcnQuZGVlcEVxdWFsKGVkaXRzT3V0c2lkZUVudmVsb3BlKHdvcmxkLCBsYXlvdXQuZW52ZWxvcGUpLCBbXSk7XG4gIGFzc2VydC5lcXVhbChcbiAgICBjYW5vbmljYWxSZWdpb25IYXNoKHdvcmxkLCBsYXlvdXQucHJvdGVjdGVkUmVnaW9uLCBsYXlvdXQuZW52ZWxvcGUpLmhhc2gsXG4gICAgYmVmb3JlLm91dHNpZGUsXG4gICk7XG5cbiAgLy8gVGhlIGhvdXNlIHByZXBhcmF0aW9uIGlzIG5vdCBmbGF0dGVuZWQgaW50byB0aGUgZmFybSBhbmQgdmljZSB2ZXJzYS5cbiAgYXNzZXJ0LmVxdWFsKHN1cmZhY2VBdCh3b3JsZCwgbGF5b3V0LmhvdXNlLnJlY3QueDAsIGxheW91dC5ob3VzZS5yZWN0LnowKSwgMTEpO1xuICBhc3NlcnQuZXF1YWwoc3VyZmFjZUF0KHdvcmxkLCBsYXlvdXQuZmFybS5yZWN0LngwLCBsYXlvdXQuZmFybS5yZWN0LnowKSwgMTUpO1xuICBhc3NlcnQuZXF1YWwoZ2V0Vm94ZWwod29ybGQsIGxheW91dC5ob3VzZS5yZWN0LngwLCAxMSwgbGF5b3V0LmhvdXNlLnJlY3QuejApLCBNQVQuQUlSKTtcbn0pO1xuIiwgIi8vIFNpbXVsYXRpb24gbGF5ZXIgXHUyMDE0IHB1cmUgVHlwZVNjcmlwdCwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDEgd29ybGQgZm91bmRhdGlvbjogYSBjaHVua2VkLCBnZW51aW5lbHkgdGhyZWUtZGltZW5zaW9uYWwgdm94ZWwgd29ybGQuXG4vLyBUaGUgc3RvcmVkIHN0YXRlIGlzIG9uZSBtYXRlcmlhbCBieXRlIHBlciBjZWxsICgwID0gYWlyKTsgb2NjdXBhbmN5IGlzXG4vLyBpbXBsaWNpdC4gU3VyZmFjZSBoZWlnaHQgaXMgYSBkZXJpdmVkIHF1ZXJ5LCBub3QgdGhlIHN0b3JhZ2UuIFRoaXMgcmVwbGFjZXNcbi8vIHRoZSBmb3JtZXIgMjU2IHggMjU2IGhlaWdodGZpZWxkIChzZWUgSVItMDA1KS5cbi8vXG4vLyBXb3JsZCBtZXRyZXM6IHgveiBpbiBbLTEwMjQsIDEwMjQpLCB5IGluIFstMTYsIDExMiksIHNlYSBsZXZlbCAwLlxuLy8gQSBjaHVuayBpcyAzMiB4IDMyIHggMTI4IGNlbGxzLiBHZW5lcmF0aW9uIGlzIGEgcHVyZSBmdW5jdGlvbiBvZiB0aGUgc2VlZCxcbi8vIGdlbmVyYXRvciB2ZXJzaW9uLCBwYXJhbWV0ZXJzIGFuZCBjaHVuayBjb29yZGluYXRlczsgZWRpdHMgYXJlIHJlY29yZGVkXG4vLyBzZXBhcmF0ZWx5IGFuZCByZS1hcHBsaWVkIHdoZW4gYSBjaHVuayBpcyByZWdlbmVyYXRlZC5cbmltcG9ydCB0eXBlIHsgU3RydWN0dXJlIH0gZnJvbSAnLi9zdHJ1Y3R1cmVzJztcblxuZXhwb3J0IGNvbnN0IFdPUkxEX1NJWkUgPSAyMDQ4O1xuZXhwb3J0IGNvbnN0IEhBTEYgPSBXT1JMRF9TSVpFIC8gMjtcbmV4cG9ydCBjb25zdCBDSFVOS19TSVpFID0gMzI7XG5leHBvcnQgY29uc3QgQ0hVTktTX1BFUl9TSURFID0gV09STERfU0laRSAvIENIVU5LX1NJWkU7XG5leHBvcnQgY29uc3QgWV9NSU4gPSAtMTY7XG5leHBvcnQgY29uc3QgWV9NQVggPSAxMTI7XG5leHBvcnQgY29uc3QgV09STERfSEVJR0hUID0gWV9NQVggLSBZX01JTjtcbmV4cG9ydCBjb25zdCBTRUFfTEVWRUwgPSAwO1xuZXhwb3J0IGNvbnN0IFdBVEVSID0gU0VBX0xFVkVMO1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRPUl9WRVJTSU9OID0gMTtcbmV4cG9ydCBjb25zdCBDSFVOS19WT0xVTUUgPSBDSFVOS19TSVpFICogQ0hVTktfU0laRSAqIFdPUkxEX0hFSUdIVDtcbmV4cG9ydCBjb25zdCBDSFVOS19BUkVBID0gQ0hVTktfU0laRSAqIENIVU5LX1NJWkU7XG5cbmV4cG9ydCBjb25zdCBNQVQgPSB7XG4gIEFJUjogMCxcbiAgR1JBU1M6IDEsXG4gIFNPSUw6IDIsXG4gIFNBTkQ6IDMsXG4gIEdSQVZFTDogNCxcbiAgU1RPTkU6IDUsXG4gIE9SRTogNixcbiAgV0FURVI6IDcsXG4gIEJFRFJPQ0s6IDgsXG4gIE1PU1M6IDksXG59IGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgTWF0SWQgPSAodHlwZW9mIE1BVClba2V5b2YgdHlwZW9mIE1BVF07XG5cbmV4cG9ydCBjb25zdCBpc1NvbGlkID0gKG06IG51bWJlcik6IGJvb2xlYW4gPT4gbSAhPT0gTUFULkFJUiAmJiBtICE9PSBNQVQuV0FURVI7XG5leHBvcnQgY29uc3QgaXNPcGFxdWUgPSBpc1NvbGlkO1xuXG5leHBvcnQgY29uc3QgY2xhbXAgPSAodjogbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gKHYgPCBhID8gYSA6IHYgPiBiID8gYiA6IHYpO1xuZXhwb3J0IGNvbnN0IGxlcnAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIsIHQ6IG51bWJlcikgPT4gYSArIChiIC0gYSkgKiB0O1xuY29uc3Qgc21vb3Roc3RlcCA9IChlMDogbnVtYmVyLCBlMTogbnVtYmVyLCB4OiBudW1iZXIpID0+IHtcbiAgY29uc3QgdCA9IGNsYW1wKCh4IC0gZTApIC8gKGUxIC0gZTApLCAwLCAxKTtcbiAgcmV0dXJuIHQgKiB0ICogKDMgLSAyICogdCk7XG59O1xuXG4vLyAtLS0tLS0tLS0tIGRldGVybWluaXN0aWMgaGFzaCAvIG5vaXNlIC0tLS0tLS0tLS1cbmV4cG9ydCBmdW5jdGlvbiBoYXNoMmkoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBoID0gc2VlZCBeIE1hdGguaW11bCh4LCAzNzQ3NjEzOTMpIF4gTWF0aC5pbXVsKHksIDY2ODI2NTI2Myk7XG4gIGggPSBNYXRoLmltdWwoaCBeIChoID4+PiAxMyksIDEyNzQxMjYxNzcpO1xuICByZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5Njtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2gzaSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaCA9IHNlZWQgXiBNYXRoLmltdWwoeCwgMzc0NzYxMzkzKSBeIE1hdGguaW11bCh5LCA2NjgyNjUyNjMpIF4gTWF0aC5pbXVsKHosIDIyNDY4MjI1MTkpO1xuICBoID0gTWF0aC5pbXVsKGggXiAoaCA+Pj4gMTMpLCAxMjc0MTI2MTc3KTtcbiAgcmV0dXJuICgoaCBeIChoID4+PiAxNikpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWxiZXJyeTMyKHNlZWQ6IG51bWJlcik6ICgpID0+IG51bWJlciB7XG4gIGxldCBhID0gc2VlZCA+Pj4gMDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBhID0gKGEgKyAweDZkMmI3OWY1KSA+Pj4gMDtcbiAgICBsZXQgdCA9IGE7XG4gICAgdCA9IE1hdGguaW11bCh0IF4gKHQgPj4+IDE1KSwgdCB8IDEpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCB0IHwgNjEpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuXG5jb25zdCBzbW9vdGggPSAodDogbnVtYmVyKSA9PiB0ICogdCAqICgzIC0gMiAqIHQpO1xuXG5mdW5jdGlvbiB2YWx1ZU5vaXNlMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgeGkgPSBNYXRoLmZsb29yKHgpLCB5aSA9IE1hdGguZmxvb3IoeSk7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSk7XG4gIGNvbnN0IGEgPSBoYXNoMmkoeGksIHlpLCBzZWVkKSwgYiA9IGhhc2gyaSh4aSArIDEsIHlpLCBzZWVkKTtcbiAgY29uc3QgYyA9IGhhc2gyaSh4aSwgeWkgKyAxLCBzZWVkKSwgZCA9IGhhc2gyaSh4aSArIDEsIHlpICsgMSwgc2VlZCk7XG4gIGNvbnN0IHRvcCA9IGEgKyAoYiAtIGEpICogeGY7XG4gIGNvbnN0IGJvdHRvbSA9IGMgKyAoZCAtIGMpICogeGY7XG4gIHJldHVybiB0b3AgKyAoYm90dG9tIC0gdG9wKSAqIHlmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmJtMih4OiBudW1iZXIsIHk6IG51bWJlciwgc2VlZDogbnVtYmVyLCBvY3RhdmVzOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgc3VtID0gMCwgYW1wID0gMSwgZnJlcSA9IDEsIG5vcm0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG9jdGF2ZXM7IGkrKykge1xuICAgIHN1bSArPSBhbXAgKiB2YWx1ZU5vaXNlMih4ICogZnJlcSwgeSAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbmZ1bmN0aW9uIHZhbHVlTm9pc2UzKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IHhpID0gTWF0aC5mbG9vcih4KSwgeWkgPSBNYXRoLmZsb29yKHkpLCB6aSA9IE1hdGguZmxvb3Ioeik7XG4gIGNvbnN0IHhmID0gc21vb3RoKHggLSB4aSksIHlmID0gc21vb3RoKHkgLSB5aSksIHpmID0gc21vb3RoKHogLSB6aSk7XG4gIGNvbnN0IGMwMDAgPSBoYXNoM2koeGksIHlpLCB6aSwgc2VlZCksIGMxMDAgPSBoYXNoM2koeGkgKyAxLCB5aSwgemksIHNlZWQpO1xuICBjb25zdCBjMDEwID0gaGFzaDNpKHhpLCB5aSArIDEsIHppLCBzZWVkKSwgYzExMCA9IGhhc2gzaSh4aSArIDEsIHlpICsgMSwgemksIHNlZWQpO1xuICBjb25zdCBjMDAxID0gaGFzaDNpKHhpLCB5aSwgemkgKyAxLCBzZWVkKSwgYzEwMSA9IGhhc2gzaSh4aSArIDEsIHlpLCB6aSArIDEsIHNlZWQpO1xuICBjb25zdCBjMDExID0gaGFzaDNpKHhpLCB5aSArIDEsIHppICsgMSwgc2VlZCksIGMxMTEgPSBoYXNoM2koeGkgKyAxLCB5aSArIDEsIHppICsgMSwgc2VlZCk7XG4gIGNvbnN0IHgwMCA9IGMwMDAgKyAoYzEwMCAtIGMwMDApICogeGY7XG4gIGNvbnN0IHgxMCA9IGMwMTAgKyAoYzExMCAtIGMwMTApICogeGY7XG4gIGNvbnN0IHgwMSA9IGMwMDEgKyAoYzEwMSAtIGMwMDEpICogeGY7XG4gIGNvbnN0IHgxMSA9IGMwMTEgKyAoYzExMSAtIGMwMTEpICogeGY7XG4gIGNvbnN0IHkwID0geDAwICsgKHgxMCAtIHgwMCkgKiB5ZjtcbiAgY29uc3QgeTEgPSB4MDEgKyAoeDExIC0geDAxKSAqIHlmO1xuICByZXR1cm4geTAgKyAoeTEgLSB5MCkgKiB6Zjtcbn1cblxuZnVuY3Rpb24gZmJtMyh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBzZWVkOiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwLCBhbXAgPSAxLCBmcmVxID0gMSwgbm9ybSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG4gICAgc3VtICs9IGFtcCAqIHZhbHVlTm9pc2UzKHggKiBmcmVxLCB5ICogZnJlcSwgeiAqIGZyZXEsIHNlZWQgKyBpICogMTMxKTtcbiAgICBub3JtICs9IGFtcDtcbiAgICBhbXAgKj0gMC41OyBmcmVxICo9IDI7XG4gIH1cbiAgcmV0dXJuIHN1bSAvIG5vcm07XG59XG5cbi8vIC0tLS0tLS0tLS0gd29ybGQgdHlwZXMgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXb3JsZFBhcmFtcyB7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1BBUkFNUzogV29ybGRQYXJhbXMgPSB7XG4gIHNpemU6IFdPUkxEX1NJWkUsXG4gIGNodW5rU2l6ZTogQ0hVTktfU0laRSxcbiAgeU1pbjogWV9NSU4sXG4gIHlNYXg6IFlfTUFYLFxuICBzZWFMZXZlbDogU0VBX0xFVkVMLFxuICBnZW5lcmF0b3JWZXJzaW9uOiBHRU5FUkFUT1JfVkVSU0lPTixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxDaHVuayB7XG4gIGN4OiBudW1iZXI7XG4gIGN6OiBudW1iZXI7XG4gIGtleTogc3RyaW5nO1xuICAvKiogeCArIHoqMzIgKyAoeS1ZX01JTikqMTAyNCAqL1xuICBkYXRhOiBVaW50OEFycmF5O1xuICAvKiogdG9wIHNvbGlkIHksIGVuY29kZWQgYXMgKHkgLSBZX01JTiksIDAuLjEyNzsgMCBtZWFucyBubyBzb2xpZC4gKi9cbiAgaGVpZ2h0czogVWludDhBcnJheTtcbiAgLyoqIHRvcCBtYXRlcmlhbCBwZXIgY29sdW1uLiAqL1xuICB0b3BNYXRlcmlhbHM6IFVpbnQ4QXJyYXk7XG4gIG5vbkFpcjogbnVtYmVyO1xuICBkaXJ0eTogYm9vbGVhbjtcbiAgZ2VuZXJhdGVkQXQ6IG51bWJlcjtcbn1cblxuLy8gTmF0dXJhbCBhc3NldHMgYXJlIHRoZSBwcm9qZWN0J3MgU3R5bCAoYG5hdF9gKSBwaXBlbGluZSAoQVMtMDAxIHYyKSwgbm90XG4vLyBOb3hlbCBhcmNoaXRlY3R1cmUuIE5veGVsIHJlbWFpbnMgdGhlIGh1bWFuLW1hZGUga2l0L3dheXN0b25lL21hcmtlciBzeXN0ZW0uXG5leHBvcnQgdHlwZSBFbnRpdHlLaW5kID1cbiAgfCAnc3R5bF90cmVlX3NwaXJlJ1xuICB8ICdzdHlsX3RyZWVfdGFibGUnXG4gIHwgJ3N0eWxfdHJlZV9jbHVzdGVyJ1xuICB8ICdzdHlsX3RyZWVfYmxvc3NvbSdcbiAgfCAnc3R5bF9zaHJ1YidcbiAgfCAnc3R5bF9yb2NrX3NtYWxsJ1xuICB8ICdzdHlsX3JvY2tfbWVkaXVtJ1xuICB8ICdzdHlsX3JvY2tfbGFyZ2UnXG4gIHwgJ3N0eWxfb3JlJ1xuICB8ICdzdHlsX2NhaXJuJ1xuICB8ICd3YXlzdG9uZSdcbiAgfCAnbWFya2VyJztcblxuZXhwb3J0IHR5cGUgUmVzb3VyY2VUeXBlID0gJ3dvb2QnIHwgJ3N0b25lJyB8ICdvcmUnIHwgJ2ZpYmVyJztcblxuZXhwb3J0IGludGVyZmFjZSBFbnRpdHkge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICBjaHVuazogc3RyaW5nO1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICByb3Q6IG51bWJlcjtcbiAgc2NhbGU6IG51bWJlcjtcbiAgdmFyaWFudDogbnVtYmVyO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgcmVtYWluaW5nOiBudW1iZXI7XG4gIHlpZWxkUGVySGFydmVzdDogbnVtYmVyO1xuICAvKiogVHJ1ZSBvbmNlIHRoZSBlbnRpdHkgaXMgZnVsbHkgZGVwbGV0ZWQuICovXG4gIGhhcnZlc3RlZDogYm9vbGVhbjtcbiAgLyoqIFRydWUgYWZ0ZXIgdGhlIGZpcnN0IHN1Y2Nlc3NmdWwgaGFydmVzdCwgZXZlbiBpZiB5aWVsZCByZW1haW5zLiAqL1xuICBoYXJ2ZXN0ZWRPbmNlPzogYm9vbGVhbjtcbiAgcHJvdmlzaW9uYWw6IGJvb2xlYW47XG4gIGF1dGhvcmVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5veGVsU2l0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6ICd3YXlzdG9uZScgfCAnbWFya2VyJztcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcm90OiBudW1iZXI7XG4gIHByb3Zpc2lvbmFsOiB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZ2lvbkluZm8ge1xuICBpZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICB0eXBlOiAncGxhaW4nIHwgJ2ZvcmVzdCcgfCAnaGlsbHMnIHwgJ2hpZ2hsYW5kJyB8ICd3YXRlcicgfCAncmlkZ2UnO1xuICBjeDogbnVtYmVyO1xuICBjejogbnVtYmVyO1xuICByeDogbnVtYmVyO1xuICByejogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkU3RhdHMge1xuICBjaHVua3NHZW5lcmF0ZWQ6IG51bWJlcjtcbiAgY2h1bmtzRXZpY3RlZDogbnVtYmVyO1xuICB2b3hlbHNGaWxsZWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGlvbk1zOiBudW1iZXI7XG4gIGVudGl0aWVzOiBudW1iZXI7XG4gIHRyZWVzOiBudW1iZXI7XG4gIHBpbmtUcmVlczogbnVtYmVyO1xuICBwaW5rT3ZlcmZsb3c6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcGFyYW1zOiBXb3JsZFBhcmFtcztcbiAgY2h1bmtzOiBNYXA8c3RyaW5nLCBWb3hlbENodW5rPjtcbiAgZW50aXRpZXM6IE1hcDxzdHJpbmcsIEVudGl0eT47XG4gIGVudGl0eUNodW5rczogTWFwPHN0cmluZywgc3RyaW5nW10+O1xuICAvKiogQXV0aG9yaXRhdGl2ZSBidWlsdCBzdHJ1Y3R1cmVzIChob3VzZSwgcGF0aCwgdGVycmFjZXMsIGNyb3BzKS4gKi9cbiAgc3RydWN0dXJlczogTWFwPHN0cmluZywgU3RydWN0dXJlPjtcbiAgc2l0ZXM6IE5veGVsU2l0ZVtdO1xuICByZWdpb25zOiBSZWdpb25JbmZvW107XG4gIC8qKiBjaHVuayBrZXkgLT4gbG9jYWwgdm94ZWwgaW5kZXggLT4gbWF0ZXJpYWwuIER1cmFibGUsIGNvbXBhY3QgZWRpdHMuICovXG4gIGVkaXRzOiBNYXA8c3RyaW5nLCBNYXA8bnVtYmVyLCBudW1iZXI+PjtcbiAgaW52ZW50b3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBkaXJ0eTogU2V0PHN0cmluZz47XG4gIHN0YXRzOiBXb3JsZFN0YXRzO1xuICBhdXRob3JlZFBsYWNlZDogYm9vbGVhbjtcbiAgLyoqXG4gICAqIE1vbm90b25pYyByZXZpc2lvbiBvZiBhdXRob3JpdGF0aXZlIHN0YXRlICh2b3hlbHMgYW5kIGVudGl0aWVzKS4gRGVyaXZlZFxuICAgKiBjYWNoZXMga2V5ZWQgb24gdGhpcyB2YWx1ZSBhcmUgZGlzY2FyZGVkIGFmdGVyIGFuIGVkaXQ7IG1lc2gvbmF2aWdhdGlvblxuICAgKiByZXZpc2lvbnMgYXJlIHNlcGFyYXRlIGJlY2F1c2UgdGhleSBhcmUgZGVyaXZlZCwgbm90IHdvcmxkIHN0YXRlLlxuICAgKi9cbiAgcmV2aXNpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGNodW5rS2V5ID0gKGN4OiBudW1iZXIsIGN6OiBudW1iZXIpID0+IGAke2N4fSwke2N6fWA7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5YID0gKGN4OiBudW1iZXIpID0+IGN4ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgY2h1bmtPcmlnaW5aID0gKGN6OiBudW1iZXIpID0+IGN6ICogQ0hVTktfU0laRSAtIEhBTEY7XG5leHBvcnQgY29uc3QgbG9jYWxJbmRleCA9IChseDogbnVtYmVyLCB5SW5kZXg6IG51bWJlciwgbHo6IG51bWJlcikgPT5cbiAgbHggKyBseiAqIENIVU5LX1NJWkUgKyB5SW5kZXggKiBDSFVOS19BUkVBO1xuZXhwb3J0IGNvbnN0IHdvcmxkVG9DaHVua1ggPSAoeDogbnVtYmVyKSA9PiBNYXRoLmZsb29yKCh4ICsgSEFMRikgLyBDSFVOS19TSVpFKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvQ2h1bmtaID0gKHo6IG51bWJlcikgPT4gTWF0aC5mbG9vcigoeiArIEhBTEYpIC8gQ0hVTktfU0laRSk7XG5leHBvcnQgY29uc3Qgd29ybGRUb0xvY2FsWCA9ICh4OiBudW1iZXIpID0+IHggLSAod29ybGRUb0NodW5rWCh4KSAqIENIVU5LX1NJWkUgLSBIQUxGKTtcbmV4cG9ydCBjb25zdCB3b3JsZFRvTG9jYWxaID0gKHo6IG51bWJlcikgPT4geiAtICh3b3JsZFRvQ2h1bmtaKHopICogQ0hVTktfU0laRSAtIEhBTEYpO1xuZXhwb3J0IGNvbnN0IHlUb0luZGV4ID0gKHk6IG51bWJlcikgPT4geSAtIFlfTUlOO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlV29ybGQoc2VlZCA9IDEzMzcpOiBXb3JsZCB7XG4gIHJldHVybiB7XG4gICAgc2VlZCxcbiAgICBwYXJhbXM6IHsgLi4uREVGQVVMVF9QQVJBTVMgfSxcbiAgICBjaHVua3M6IG5ldyBNYXAoKSxcbiAgICBlbnRpdGllczogbmV3IE1hcCgpLFxuICAgIGVudGl0eUNodW5rczogbmV3IE1hcCgpLFxuICAgIHN0cnVjdHVyZXM6IG5ldyBNYXAoKSxcbiAgICBzaXRlczogW10sXG4gICAgcmVnaW9uczogUkVHSU9OUyxcbiAgICBlZGl0czogbmV3IE1hcCgpLFxuICAgIGludmVudG9yeToge30sXG4gICAgZGlydHk6IG5ldyBTZXQoKSxcbiAgICBzdGF0czoge1xuICAgICAgY2h1bmtzR2VuZXJhdGVkOiAwLCBjaHVua3NFdmljdGVkOiAwLCB2b3hlbHNGaWxsZWQ6IDAsIGdlbmVyYXRpb25NczogMCxcbiAgICAgIGVudGl0aWVzOiAwLCB0cmVlczogMCwgcGlua1RyZWVzOiAwLCBwaW5rT3ZlcmZsb3c6IDAsXG4gICAgfSxcbiAgICBhdXRob3JlZFBsYWNlZDogZmFsc2UsXG4gICAgcmV2aXNpb246IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVdvcmxkKHNlZWQgPSAxMzM3LCBpbml0aWFsUmFkaXVzID0gMCk6IFdvcmxkIHtcbiAgY29uc3Qgd29ybGQgPSBjcmVhdGVXb3JsZChzZWVkKTtcbiAgY29uc3QgY2VudHJlID0gTWF0aC5mbG9vcihDSFVOS1NfUEVSX1NJREUgLyAyKTtcbiAgZm9yIChsZXQgY3ogPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeiA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjZW50cmUgLSBpbml0aWFsUmFkaXVzOyBjeCA8PSBjZW50cmUgKyBpbml0aWFsUmFkaXVzOyBjeCsrKSB7XG4gICAgICBnZW5lcmF0ZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgIH1cbiAgfVxuICBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQpO1xuICByZXR1cm4gd29ybGQ7XG59XG5cbi8vIC0tLS0tLS0tLS0gZ2VvZ3JhcGh5IC0tLS0tLS0tLS1cbmV4cG9ydCBjb25zdCBSRUdJT05TOiBSZWdpb25JbmZvW10gPSBbXG4gIHsgaWQ6ICdmb3VuZGVyJywgbGFiZWw6ICdGb3VuZGVyIHZhbGxleScsIHR5cGU6ICdwbGFpbicsIGN4OiAwLCBjejogMCwgcng6IDExMCwgcno6IDg1IH0sXG4gIHsgaWQ6ICdlYXN0d29vZCcsIGxhYmVsOiAnRWFzdHdvb2QnLCB0eXBlOiAnZm9yZXN0JywgY3g6IDIyMCwgY3o6IC0xMTAsIHJ4OiAyNjAsIHJ6OiAyMjAgfSxcbiAgeyBpZDogJ2Nyb3duJywgbGFiZWw6ICdDcm93biBoaWdobGFuZHMnLCB0eXBlOiAnaGlnaGxhbmQnLCBjeDogLTM2MCwgY3o6IC0zMDAsIHJ4OiAzODAsIHJ6OiAzMDAgfSxcbiAgeyBpZDogJ2xha2UnLCBsYWJlbDogJ01pcnJvciBsYWtlJywgdHlwZTogJ3dhdGVyJywgY3g6IC0yNjAsIGN6OiAtMjMwLCByeDogMTIwLCByejogOTUgfSxcbiAgeyBpZDogJ3NvdXRoZG93bnMnLCBsYWJlbDogJ1NvdXRoIGRvd25zJywgdHlwZTogJ2hpbGxzJywgY3g6IDEyMCwgY3o6IDMzMCwgcng6IDI2MCwgcno6IDE5MCB9LFxuICB7IGlkOiAnd2VzdHJpc2UnLCBsYWJlbDogJ1dlc3QgcmlzZScsIHR5cGU6ICdoaWxscycsIGN4OiAtMzYwLCBjejogMTIwLCByeDogMjIwLCByejogMjEwIH0sXG4gIHsgaWQ6ICdjb2FzdCcsIGxhYmVsOiAnQnJva2VuIGNvYXN0JywgdHlwZTogJ3JpZGdlJywgY3g6IDAsIGN6OiAwLCByeDogNzgwLCByejogNjYwIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcml2ZXJDZW50ZXJYKHo6IG51bWJlcik6IG51bWJlciB7XG4gIC8vIFRoZSByaXZlciBydW5zIG5vcnRoXHUyMDEzc291dGggYWJvdXQgNzBcdTIwMTMxMTAgbSB3ZXN0IG9mIHRoZSBmb3VuZGVyIHNoZWxmLCBzb1xuICAvLyB0aGUgZGVmYXVsdCBub3J0aC13ZXN0IHZpZXcgaGFzIHdhdGVyLCBhIG5lYXIgYmFuayBhbmQgYSBmYXIgYmFuay5cbiAgcmV0dXJuIC05MCArIDU1ICogTWF0aC5zaW4oKHogKyAxMDApIC8gMjQwKSArIDE4ICogTWF0aC5zaW4oKHogLSAyMCkgLyA4MCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByaXZlckRpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguYWJzKHggLSByaXZlckNlbnRlclgoeikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGFrZURpc3RhbmNlKHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGguc3FydCgoKHggKyAyNjApIC8gMTIwKSAqKiAyICsgKCh6ICsgMjMwKSAvIDk1KSAqKiAyKTtcbn1cblxuLyoqXG4gKiBJbnRlZ2VyIHRvcCBzb2xpZCB5IG9mIHRoZSBiYXNlIGdlbmVyYXRlZCBzdXJmYWNlIChubyBlZGl0cy9vdmVyaGFuZ3MpLlxuICpcbiAqIFRoaXMgaXMgdGhlICpzaGFwZSogdGhlIHZveGVsIHZvbHVtZSBpcyBmaWxsZWQgZnJvbSwgbm90IHRoZSBzdG9yZWQgd29ybGQuXG4gKiBUaGUgaW1wb3J0YW50IGNvcnJlY3Rpb24gb3ZlciB0aGUgZmlyc3QgTTAwMSBwYXNzIGlzIHRoYXQgdGhlIGxhbmRzY2FwZSBpc1xuICogbm90IG9uZSBzbW9vdGggcmFkaWFsIGJvd2w6IGl0IGlzIGEgd2FycGVkIG11bHRpLXNjYWxlIHN1cmZhY2Ugd2l0aCBhIGJyb2FkXG4gKiByaXZlciB2YWxsZXksIGEgc21hbGwgYnVpbGRhYmxlIHNoZWxmLCBhbmQgcmlkZ2VkIGhpZ2hsYW5kcy4gQSBzaGFsbG93XG4gKiBzbW9vdGggc3VyZmFjZSBxdWFudGlzZWQgdG8gMSBtIHZveGVscyBpcyB3aGF0IHByb2R1Y2VkIHRoZSBjb25jZW50cmljXG4gKiBjb250b3VyIHJpbmdzOyB2YXJpZWQgcmVsaWVmIGFuZCBhIHJpdmVyIHZhbGxleSBicmVhayB0aGVtIG5hdHVyYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1cmZhY2VIZWlnaHRBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgLy8gVHdvLXNjYWxlIGRvbWFpbiB3YXJwLiBUaGUgYnJvYWQgd2FycCBtb3ZlcyBjb2FzdGxpbmVzIGFuZCBoaWxsczsgdGhlXG4gIC8vIHNtYWxsIHdhcnAga2VlcHMgdGhlIDEgbSBxdWFudGlzYXRpb24gZnJvbSBmb2xsb3dpbmcgY2xlYW4gY29udG91cnMuXG4gIGNvbnN0IHd4ID0geFxuICAgICsgKGZibTIoeCAvIDQyMCwgeiAvIDQyMCwgc2VlZCArIDEwMSwgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUsIHogLyA5NSwgc2VlZCArIDEwMiwgMikgLSAwLjUpICogMzA7XG4gIGNvbnN0IHd6ID0gelxuICAgICsgKGZibTIoeCAvIDQyMCArIDcuMywgeiAvIDQyMCAtIDMuMSwgc2VlZCArIDEwMywgMykgLSAwLjUpICogMjQwXG4gICAgKyAoZmJtMih4IC8gOTUgKyAzLjcsIHogLyA5NSAtIDguMSwgc2VlZCArIDEwNCwgMikgLSAwLjUpICogMzA7XG5cbiAgY29uc3QgcmFkaWFsID0gTWF0aC5zcXJ0KCh3eCAvIDc4MCkgKiogMiArICh3eiAvIDY2MCkgKiogMik7XG4gIGNvbnN0IGNvYXN0Tm9pc2UgPSAoZmJtMih3eCAvIDMwMCwgd3ogLyAzMDAsIHNlZWQgKyAxMDUsIDQpIC0gMC41KSAqIDAuMzRcbiAgICArIChmYm0yKHd4IC8gOTUsIHd6IC8gOTUsIHNlZWQgKyAxMDYsIDIpIC0gMC41KSAqIDAuMTA7XG4gIGNvbnN0IGxhbmRuZXNzID0gMS4wIC0gcmFkaWFsICsgY29hc3ROb2lzZTtcbiAgY29uc3QgaW5sYW5kID0gc21vb3Roc3RlcCgtMC4wMywgMC4xMiwgbGFuZG5lc3MpO1xuXG4gIGNvbnN0IG9jZWFuRmxvb3IgPSAtMTMgKyA2ICogZmJtMih3eCAvIDE3MCwgd3ogLyAxNzAsIHNlZWQgKyAxMDcsIDMpO1xuXG4gIC8vIFJvbGxpbmcgbGFuZCBhdCB0aHJlZSBzY2FsZXMuIFRoZSA0MCBtIGFuZCAxNSBtIGNvbXBvbmVudHMgYXJlIHJlYWxcbiAgLy8gc3VyZmFjZSBoZWlnaHQsIG5vdCBhIHJlbmRlciBkZWNvcmF0aW9uLCBzbyB0aGUgbWFjcm8gc2FtcGxlciBhZ3JlZXMuXG4gIGNvbnN0IHN3ZWxsID0gNCArIDExICogZmJtMih3eCAvIDM0MCwgd3ogLyAzNDAsIHNlZWQgKyAxMDgsIDQpO1xuICBjb25zdCBoaWxscyA9IDggKiBmYm0yKHd4IC8gMTE1LCB3eiAvIDExNSwgc2VlZCArIDEwOSwgMyk7XG4gIGNvbnN0IGJ1bXBzID0gMi4yICogZmJtMih4IC8gNDIsIHogLyA0Miwgc2VlZCArIDExMCwgMilcbiAgICArIDAuOSAqIGZibTIoeCAvIDE1LCB6IC8gMTUsIHNlZWQgKyAxMTEsIDIpO1xuXG4gIC8vIFJpZGdlZCBoaWdobGFuZHMuIFRoZSBtYXNzaWYgbWFzayBpcyByZWdpb25hbCBhbmQgYmlhc2VkIHRvIHRoZVxuICAvLyBub3J0aC13ZXN0OyB3aXRob3V0IHRoZSByZWdpb25hbCBnYXRlIHRoZSBmaXJzdCBNMDAxIHBhc3MgcmFpc2VkIGEgNDggbVxuICAvLyBtb3VudGFpbiBkaXJlY3RseSB1bmRlciB0aGUgZm91bmRlciBzaGVsZi5cbiAgY29uc3QgbWFzc2lmTm9pc2UgPSBmYm0yKHd4IC8gNDgwICsgMTEsIHd6IC8gNDgwIC0gNywgc2VlZCArIDExMiwgNCk7XG4gIGNvbnN0IG1hc3NpZk1hc2sgPSBzbW9vdGhzdGVwKDAuNjAsIDAuNzgsIG1hc3NpZk5vaXNlKTtcbiAgY29uc3QgcmlkZ2UgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyAyMzAsIHd6IC8gMjMwLCBzZWVkICsgMTEzLCA0KSAtIDEpO1xuICBjb25zdCByaWRnZTIgPSAxIC0gTWF0aC5hYnMoMiAqIGZibTIod3ggLyA5MCwgd3ogLyA5MCwgc2VlZCArIDExNCwgMykgLSAxKTtcbiAgY29uc3QgbndCaWFzID0gTWF0aC5leHAoLSgoKHd4ICsgMzYwKSAvIDM4MCkgKiogMiArICgod3ogKyAzMDApIC8gMzIwKSAqKiAyKSk7XG4gIGNvbnN0IG1vdW50ID0gTWF0aC5taW4oMSwgbWFzc2lmTWFzayAqICgwLjMwICsgMC43MCAqIG53QmlhcykgKyAwLjIyICogbndCaWFzKTtcblxuICBsZXQgaCA9IHN3ZWxsICsgaGlsbHMgKyBidW1wc1xuICAgICsgbW91bnQgKiAoMjAgKyA0MCAqIHJpZGdlICogcmlkZ2UgKyAxMiAqIHJpZGdlMik7XG5cbiAgLy8gU3B1cnMgYW5kIGd1bGxpZXMgYXQgMzBcdTIwMTM5MCBtLiBXaXRob3V0IHRoZXNlLCBhIHNtb290aCBoaWxsIHF1YW50aXNlZCB0b1xuICAvLyAxIG0gdm94ZWxzIHJlYWRzIGFzIGNvbmNlbnRyaWMgY29udG91ciByaW5nczsgd2l0aCB0aGVtLCB0aGUgc2FtZSBoaWxsXG4gIC8vIGJyZWFrcyBpbnRvIHJpZGdlcywgc2lkZSB2YWxsZXlzIGFuZCByb2NrIGZhY2VzLlxuICBjb25zdCBzcHVyID0gMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gODUsIHd6IC8gODUsIHNlZWQgKyAxMjAsIDMpIC0gMSk7XG4gIGNvbnN0IGd1bGx5ID0gTWF0aC5wb3coMSAtIE1hdGguYWJzKDIgKiBmYm0yKHd4IC8gNTIgKyAxMywgd3ogLyA1MiAtIDUsIHNlZWQgKyAxMjEsIDMpIC0gMSksIDIpO1xuICBoICs9IChzcHVyIC0gMC41NSkgKiA1LjAgLSBndWxseSAqIDMuMjtcblxuICBoID0gb2NlYW5GbG9vciArIChoIC0gb2NlYW5GbG9vcikgKiBpbmxhbmQ7XG4gIGggKz0gMS42ICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcblxuICAvLyBCcm9hZCByaXZlciB2YWxsZXksIHRoZW4gdGhlIGNoYW5uZWwgaXRzZWxmLiBUaGUgdmFsbGV5IG1hc2sgaXMgZ2F0ZWQgYnlcbiAgLy8gbGFuZG5lc3M6IHdpdGhvdXQgdGhlIGdhdGUgaXQgcHVsbGVkIHRoZSBvY2VhbiBmbG9vciB1cCB0byB0aGUgdmFsbGV5XG4gIC8vIGZsb29yIG91dHNpZGUgdGhlIGlzbGFuZCwgd2hpY2ggdGhlIG1hcCB2aWV3IHNob3dlZCBhcyBwYWxlIHJpdmVyLXNoYXBlZFxuICAvLyBiYXJzIHJ1bm5pbmcgdG8gdGhlIGhvcml6b24uXG4gIGNvbnN0IHJkID0gcml2ZXJEaXN0YW5jZSh3eCwgd3opO1xuICBjb25zdCB2YWxsZXkgPSBzbW9vdGhzdGVwKDk1LCAxMCwgcmQpICogc21vb3Roc3RlcCgwLjAsIDAuMTAsIGxhbmRuZXNzKTtcbiAgY29uc3QgdmFsbGV5Rmxvb3IgPSAyLjUgKyAxLjAgKiBmYm0yKHd4IC8gNjAsIHd6IC8gNjAsIHNlZWQgKyAxMTUsIDIpO1xuICBoID0gbGVycChoLCB2YWxsZXlGbG9vciwgdmFsbGV5ICogMC43NSk7XG4gIGNvbnN0IHJpdmVyVyA9IDUuMCArIDMuMCAqIGZibTIod3ggLyA0NSwgd3ogLyA0NSwgc2VlZCArIDExNiwgMik7XG4gIC8vIEEgd2lkZSwgc2hhbGxvdyBjaGFubmVsIHByb2ZpbGUuIFRoZSBmaXJzdCBwYXNzIGNhcnZlZCBhIDEyIG0gc2xvdCB3aXRoXG4gIC8vIG5lYXItdmVydGljYWwgYmFua3MsIHdoaWNoIHJlYWQgYXMgYSBicmlnaHQgc3RvbmUgcXVhcnJ5IHJhdGhlciB0aGFuIGFcbiAgLy8gcml2ZXIuIFRoZSBvdXRlciBlZGdlIGlzIG5vdyB+MjUgbSBmcm9tIHRoZSBjZW50cmVsaW5lLCBhbmQgdGhlIGJlZCBpc1xuICAvLyBvbmx5IDIgbSBiZWxvdyBzZWEgbGV2ZWwuXG4gIGNvbnN0IGNoYW5uZWwgPSBzbW9vdGhzdGVwKHJpdmVyVyArIDE4LCByaXZlclcgKiAwLjQsIHJkKTtcbiAgaWYgKGxhbmRuZXNzID4gMC4wKSBoID0gbGVycChoLCAtMi4wLCBjaGFubmVsICogMC45NSk7XG5cbiAgLy8gTGFrZSBiYXNpbiBhdCB0aGUgZm9vdCBvZiB0aGUgbm9ydGgtd2VzdCBoaWdobGFuZHMuXG4gIGNvbnN0IGxha2VEID0gbGFrZURpc3RhbmNlKHd4LCB3eilcbiAgICAqICgxICsgMC4xOCAqIChmYm0yKHd4IC8gOTAsIHd6IC8gOTAsIHNlZWQgKyAxMTcsIDIpIC0gMC41KSAqIDIpO1xuICBpZiAobGFrZUQgPCAxLjE1KSB7XG4gICAgY29uc3QgbGFrZU1hc2sgPSBzbW9vdGhzdGVwKDEuMTUsIDAuNTUsIGxha2VEKTtcbiAgICBoID0gbGVycChoLCAtNi41LCBsYWtlTWFzayAqIDAuOTUpO1xuICB9XG5cbiAgLy8gRm91bmRlciBzaGVsZjogYSBzbWFsbCwgaXJyZWd1bGFyIGJ1aWxkYWJsZSB0ZXJyYWNlIG9uIHRoZSBlYXN0IGJhbmsuXG4gIC8vIERlbGliZXJhdGVseSBub3QgYSAyNjAgbSByYWRpYWwgZmxhdHRlbjsgdGhlIHByZXZpb3VzIHBhc3Mgc2hvd2VkIHRoYXQgYVxuICAvLyBsYXJnZSBmbGF0dGVuLXRvLWNvbnN0YW50IGJlY29tZXMgYSB2aXNpYmxlIGJvd2wgb2YgY29udG91ciByaW5ncy5cbiAgY29uc3Qgc2hlbGZEID0gTWF0aC5zcXJ0KCgoeCArIDgpIC8gNjIpICoqIDIgKyAoKHogLSA0KSAvIDQ4KSAqKiAyKVxuICAgICsgKGZibTIoeCAvIDQ1LCB6IC8gNDUsIHNlZWQgKyAxMTgsIDIpIC0gMC41KSAqIDAuNTU7XG4gIGNvbnN0IHNoZWxmID0gc21vb3Roc3RlcCgxLjA1LCAwLjU1LCBzaGVsZkQpO1xuICBpZiAoc2hlbGYgPiAwKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gMTMuMCArIDEuMiAqIGZibTIoeCAvIDM2LCB6IC8gMzYsIHNlZWQgKyAxMTksIDIpICsgeCAqIDAuMDE7XG4gICAgaCA9IGxlcnAoaCwgdGFyZ2V0LCBzaGVsZiAqIDAuNzgpO1xuICB9XG5cbiAgcmV0dXJuIE1hdGgucm91bmQoY2xhbXAoaCwgLTE0LCA5MikpO1xufVxuXG5mdW5jdGlvbiBzbG9wZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAxLCB6KSksXG4gICAgTWF0aC5hYnMoaCAtIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMSwgeikpLFxuICAgIE1hdGguYWJzKGggLSBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDEpKSxcbiAgICBNYXRoLmFicyhoIC0gc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAxKSksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRvcE1hdGVyaWFsQXQoc2VlZDogbnVtYmVyLCB4OiBudW1iZXIsIHo6IG51bWJlciwgaDogbnVtYmVyLCBzbG9wZTogbnVtYmVyLCBuZWFyV2F0ZXI/OiBib29sZWFuKTogTWF0SWQge1xuICAvLyBSaXZlciBiZWQgaXMgZ3JhdmVsOyB0aGUgYmVhY2ggaXMgYSBuYXJyb3cgc2FuZCBiYW5kLCBub3QgdGhlIHdob2xlXG4gIC8vIHZhbGxleSBmbG9vci4gVGhlIGZpcnN0IHBhc3MgbWFya2VkIGV2ZXJ5IGNlbGwgd2l0aGluIDQgbSBvZiBzZWEgbGV2ZWxcbiAgLy8gYXMgc2FuZCwgd2hpY2ggcHJvZHVjZWQgYSBjb25zcGljdW91cyBwYWxlIHN0cmlwIGFsb25nIHRoZSByaXZlci5cbiAgaWYgKHJpdmVyRGlzdGFuY2UoeCwgeikgPCAxMiAmJiBoIDwgU0VBX0xFVkVMICsgMSkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIGlmIChoIDw9IFNFQV9MRVZFTCArIDAuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAobmVhcldhdGVyID09PSB1bmRlZmluZWQpIHtcbiAgICBuZWFyV2F0ZXIgPVxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHggLSAzLCB6KSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgIHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4ICsgMywgeikgPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICBzdXJmYWNlSGVpZ2h0QXQoc2VlZCwgeCwgeiAtIDMpIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgc3VyZmFjZUhlaWdodEF0KHNlZWQsIHgsIHogKyAzKSA8IFNFQV9MRVZFTCArIDE7XG4gIH1cbiAgaWYgKG5lYXJXYXRlciAmJiBoIDw9IFNFQV9MRVZFTCArIDEuNSkgcmV0dXJuIE1BVC5TQU5EO1xuICBpZiAoc2xvcGUgPj0gMykgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA1OCAmJiBmYm0yKHggLyAxOCwgeiAvIDE4LCBzZWVkICsgMTIwLCAyKSA+IDAuNDUpIHJldHVybiBNQVQuU1RPTkU7XG4gIGlmIChoID4gNDggJiYgc2xvcGUgPj0gMikgcmV0dXJuIE1BVC5TVE9ORTtcbiAgaWYgKGggPiA0MCAmJiBzbG9wZSA+PSAyICYmIGZibTIoeCAvIDEyLCB6IC8gMTIsIHNlZWQgKyAxMjEsIDIpID4gMC41NSkgcmV0dXJuIE1BVC5TVE9ORTtcbiAgcmV0dXJuIE1BVC5HUkFTUztcblxufVxuXG4vKiogUHVibGljIGJhc2UtbWF0ZXJpYWwgc2VsZWN0b3IgZm9yIG1hY3JvIExPRCBhbmQgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZVRvcE1hdGVyaWFsKFxuICBzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgejogbnVtYmVyLCBoOiBudW1iZXIsIHNsb3BlOiBudW1iZXIsIG5lYXJXYXRlcjogYm9vbGVhbixcbik6IE1hdElkIHtcbiAgcmV0dXJuIHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG59XG5cbmZ1bmN0aW9uIHN1YnNvaWxGb3IodG9wOiBNYXRJZCk6IE1hdElkIHtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVNTIHx8IHRvcCA9PT0gTUFULk1PU1MpIHJldHVybiBNQVQuU09JTDtcbiAgaWYgKHRvcCA9PT0gTUFULlNBTkQpIHJldHVybiBNQVQuU0FORDtcbiAgaWYgKHRvcCA9PT0gTUFULkdSQVZFTCkgcmV0dXJuIE1BVC5HUkFWRUw7XG4gIHJldHVybiBNQVQuU1RPTkU7XG59XG5cbmZ1bmN0aW9uIG9yZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBjbHVzdGVyID0gZmJtMih4IC8gNTUsIHogLyA1NSwgc2VlZCArIDEzMCwgMik7XG4gIGlmIChjbHVzdGVyIDwgMC41NykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBuID0gdmFsdWVOb2lzZTMoeCAqIDAuMDksIHkgKiAwLjEzLCB6ICogMC4wOSwgc2VlZCArIDEzMSk7XG4gIGNvbnN0IG4yID0gdmFsdWVOb2lzZTMoeCAqIDAuMjIgKyA1LCB5ICogMC4zMSwgeiAqIDAuMjIgLSAzLCBzZWVkICsgMTMyKTtcbiAgcmV0dXJuIG4gPiAwLjcwICYmIG4yID4gMC41MDtcbn1cblxuZnVuY3Rpb24gY2F2ZUF0KHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gZmJtMyh4ICogMC4wNzUsIHkgKiAwLjExLCB6ICogMC4wNzUsIHNlZWQgKyAxNDAsIDIpID4gMC43Mjtcbn1cblxuZnVuY3Rpb24gb3ZlcmhhbmdBdChzZWVkOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHZhbHVlTm9pc2UzKHggKiAwLjE4LCB5ICogMC4yMiwgeiAqIDAuMTgsIHNlZWQgKyAxNDEpID4gMC42Mjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXJmYWNlU2FtcGxlIHtcbiAgeTogbnVtYmVyO1xuICB0b3A6IE1hdElkO1xuICBzbG9wZTogbnVtYmVyO1xufVxuXG4vKiogQmFzZSBzdXJmYWNlIHNhbXBsZSBmb3IgbWFjcm8gTE9ELiBEb2VzIG5vdCBpbmNsdWRlIHZveGVsIGVkaXRzL292ZXJoYW5ncy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW1wbGVTdXJmYWNlKHNlZWQ6IG51bWJlciwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBTdXJmYWNlU2FtcGxlIHtcbiAgY29uc3QgeSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCB4LCB6KTtcbiAgY29uc3Qgc2xvcGUgPSBzbG9wZUF0KHNlZWQsIHgsIHosIHkpO1xuICByZXR1cm4geyB5LCB0b3A6IHRvcE1hdGVyaWFsQXQoc2VlZCwgeCwgeiwgeSwgc2xvcGUpLCBzbG9wZSB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIGNodW5rIGdlbmVyYXRpb24gLS0tLS0tLS0tLVxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcbiAgcmV0dXJuIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUNodW5rKHdvcmxkOiBXb3JsZCwgY3g6IG51bWJlciwgY3o6IG51bWJlcik6IFZveGVsQ2h1bmsgfCBudWxsIHtcbiAgaWYgKGN4IDwgMCB8fCBjeiA8IDAgfHwgY3ggPj0gQ0hVTktTX1BFUl9TSURFIHx8IGN6ID49IENIVU5LU19QRVJfU0lERSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtleSA9IGNodW5rS2V5KGN4LCBjeik7XG4gIGNvbnN0IGV4aXN0aW5nID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcblxuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICBjb25zdCBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoQ0hVTktfVk9MVU1FKTtcbiAgY29uc3QgaGVpZ2h0cyA9IG5ldyBVaW50OEFycmF5KENIVU5LX0FSRUEpO1xuICBjb25zdCB0b3BNYXRlcmlhbHMgPSBuZXcgVWludDhBcnJheShDSFVOS19BUkVBKTtcbiAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY3gpLCBveiA9IGNodW5rT3JpZ2luWihjeik7XG4gIGNvbnN0IHNlZWQgPSB3b3JsZC5zZWVkO1xuXG4gIC8vIFBhZGRlZCBoZWlnaHQgY2FjaGU6IGEgdGhyZWUtY2VsbCBib3JkZXIgY292ZXJzIHNsb3BlLCBiZWFjaCBhbmQgbGVkZ2VzLlxuICBjb25zdCBQID0gMztcbiAgY29uc3QgUFcgPSBDSFVOS19TSVpFICsgUCAqIDI7XG4gIGNvbnN0IGJhc2VIID0gbmV3IEludDE2QXJyYXkoUFcgKiBQVyk7XG4gIGZvciAobGV0IHB6ID0gMDsgcHogPCBQVzsgcHorKykge1xuICAgIGZvciAobGV0IHB4ID0gMDsgcHggPCBQVzsgcHgrKykge1xuICAgICAgYmFzZUhbcHogKiBQVyArIHB4XSA9IHN1cmZhY2VIZWlnaHRBdChzZWVkLCBveCArIHB4IC0gUCwgb3ogKyBweiAtIFApO1xuICAgIH1cbiAgfVxuXG4gIGxldCBub25BaXIgPSAwO1xuICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgIGZvciAobGV0IGx4ID0gMDsgbHggPCBDSFVOS19TSVpFOyBseCsrKSB7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCldO1xuICAgICAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQIC0gMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQICsgMSldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgLSAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICAgTWF0aC5hYnMoaCAtIGJhc2VIWyhseiArIFAgKyAxKSAqIFBXICsgKGx4ICsgUCldKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBuZWFyV2F0ZXIgPVxuICAgICAgICBiYXNlSFsobHogKyBQKSAqIFBXICsgKGx4ICsgUCAtIDMpXSA8IFNFQV9MRVZFTCArIDEgfHxcbiAgICAgICAgYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAzKV0gPCBTRUFfTEVWRUwgKyAxIHx8XG4gICAgICAgIGJhc2VIWyhseiArIFAgLSAzKSAqIFBXICsgKGx4ICsgUCldIDwgU0VBX0xFVkVMICsgMSB8fFxuICAgICAgICBiYXNlSFsobHogKyBQICsgMykgKiBQVyArIChseCArIFApXSA8IFNFQV9MRVZFTCArIDE7XG4gICAgICBjb25zdCB0b3AgPSB0b3BNYXRlcmlhbEF0KHNlZWQsIHd4LCB3eiwgaCwgc2xvcGUsIG5lYXJXYXRlcik7XG4gICAgICBjb25zdCBzdWIgPSBzdWJzb2lsRm9yKHRvcCk7XG4gICAgICBjb25zdCBvcmVQb3RlbnRpYWwgPSBmYm0yKHd4IC8gNTUsIHd6IC8gNTUsIHNlZWQgKyAxMzAsIDIpID4gMC41NztcbiAgICAgIGNvbnN0IGNvbCA9IGx6ICogQ0hVTktfU0laRSArIGx4O1xuXG4gICAgICBjb25zdCBzdGFydCA9IFlfTUlOO1xuICAgICAgY29uc3QgZW5kID0gTWF0aC5taW4oWV9NQVggLSAxLCBoIC0gMSk7XG4gICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPD0gZW5kOyB5KyspIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSBoIC0gMSAtIHk7XG4gICAgICAgIGxldCBtOiBNYXRJZDtcbiAgICAgICAgaWYgKHkgPT09IFlfTUlOKSBtID0gTUFULkJFRFJPQ0s7XG4gICAgICAgIGVsc2UgaWYgKGRlcHRoID09PSAwKSBtID0gdG9wO1xuICAgICAgICBlbHNlIGlmIChkZXB0aCA8PSAyKSBtID0gc3ViO1xuICAgICAgICBlbHNlIG0gPSBNQVQuU1RPTkU7XG5cbiAgICAgICAgaWYgKG0gPT09IE1BVC5TVE9ORSAmJiBkZXB0aCA+IDQgJiYgb3JlUG90ZW50aWFsICYmIG9yZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULk9SRTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNwYXJzZSAzRCBvdmVyaGFuZ3MvdW5kZXJjdXRzIGF0IHN0ZWVwIGZhY2VzLiBUaGlzIGlzIGEgcmVhbFxuICAgICAgICAvLyBvY2N1cGFuY3kgY2hhbmdlLCBub3QgYSBkZWNvcmF0aW9uIG9uIHRvcCBvZiBhIGhlaWdodGZpZWxkLlxuICAgICAgICBpZiAoZGVwdGggPD0gMiAmJiBzbG9wZSA+PSAyICYmIG92ZXJoYW5nQXQoc2VlZCwgd3gsIHksIHd6KSkge1xuICAgICAgICAgIG0gPSBNQVQuQUlSO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlZXAgY2F2ZXMsIGtlcHQgYXdheSBmcm9tIHRoZSBzdXJmYWNlIHNvIHRoZXkgZG8gbm90IGNyZWF0ZSBob2xlcy5cbiAgICAgICAgaWYgKG0gIT09IE1BVC5BSVIgJiYgZGVwdGggPiA3ICYmIGRlcHRoIDwgMjQgJiYgY2F2ZUF0KHNlZWQsIHd4LCB5LCB3eikpIHtcbiAgICAgICAgICBtID0gTUFULkFJUjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtICE9PSBNQVQuQUlSKSB7XG4gICAgICAgICAgZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSA9IG07XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0ZXIgdm9sdW1lOiBldmVyeXRoaW5nIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlIHVwIHRvIHNlYSBsZXZlbC5cbiAgICAgIGlmIChoIDwgU0VBX0xFVkVMKSB7XG4gICAgICAgIGZvciAobGV0IHkgPSBNYXRoLm1heChZX01JTiwgaCk7IHkgPCBTRUFfTEVWRUw7IHkrKykge1xuICAgICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseik7XG4gICAgICAgICAgaWYgKGRhdGFbaWR4XSA9PT0gTUFULkFJUikge1xuICAgICAgICAgICAgZGF0YVtpZHhdID0gTUFULldBVEVSO1xuICAgICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRvcFNvbGlkID0gTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLm1heChZX01JTiwgaCAtIDEpKTtcbiAgICAgIGhlaWdodHNbY29sXSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgdG9wTWF0ZXJpYWxzW2NvbF0gPSB0b3A7XG4gICAgfVxuICB9XG5cbiAgLy8gUHJvdHJ1ZGluZyBsZWRnZXM6IG9uZSBvciB0d28gc3RvbmUgYmxvY2tzIGV4dGVuZCBmcm9tIGEgaGlnaCBjb2x1bW4gb3ZlclxuICAvLyBhIGxvd2VyIG5laWdoYm91ci4gVGhleSBjcmVhdGUgcmVhZGFibGUgb3ZlcmhhbmdzIHdpdGhvdXQgYSBmdWxsIGNhdmUgcGFzcy5cbiAgZm9yIChsZXQgbHogPSAwOyBseiA8IENIVU5LX1NJWkU7IGx6KyspIHtcbiAgICBmb3IgKGxldCBseCA9IDA7IGx4IDwgQ0hVTktfU0laRTsgbHgrKykge1xuICAgICAgY29uc3QgaCA9IGJhc2VIWyhseiArIFApICogUFcgKyAobHggKyBQKV07XG4gICAgICBjb25zdCBzbG9wZSA9IE1hdGgubWF4KFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgLSAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCkgKiBQVyArIChseCArIFAgKyAxKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCAtIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgICBNYXRoLmFicyhoIC0gYmFzZUhbKGx6ICsgUCArIDEpICogUFcgKyAobHggKyBQKV0pLFxuICAgICAgKTtcbiAgICAgIGlmIChzbG9wZSA8IDIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZGlyczogQXJyYXk8W251bWJlciwgbnVtYmVyXT4gPSBbWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dO1xuICAgICAgZm9yIChjb25zdCBbZHgsIGR6XSBvZiBkaXJzKSB7XG4gICAgICAgIGNvbnN0IG54ID0gbHggKyBkeCwgbnogPSBseiArIGR6O1xuICAgICAgICBpZiAobnggPCAwIHx8IG56IDwgMCB8fCBueCA+PSBDSFVOS19TSVpFIHx8IG56ID49IENIVU5LX1NJWkUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBuaCA9IGJhc2VIWyhueiArIFApICogUFcgKyAobnggKyBQKV07XG4gICAgICAgIGlmIChoIC0gbmggPCAyKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGhhc2gzaShseCwgbHosIGR4ICogMyArIGR6ICogNywgc2VlZCArIDE1MCkgPCAwLjU1KSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgeSA9IGggLSAyO1xuICAgICAgICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gaCkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGlkeCA9IGxvY2FsSW5kZXgobngsIHlUb0luZGV4KHkpLCBueik7XG4gICAgICAgIGlmIChkYXRhW2lkeF0gPT09IE1BVC5BSVIpIHtcbiAgICAgICAgICBkYXRhW2lkeF0gPSBNQVQuU1RPTkU7XG4gICAgICAgICAgbm9uQWlyKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZWNvbXB1dGUgdGhlIGNvbHVtbiBjYWNoZSBhZnRlciBsZWRnZXMvY2F2ZXMuIFRoZSBleHBvc2VkIHRvcCBtYXRlcmlhbFxuICAvLyBtdXN0IGNvbWUgZnJvbSB0aGUgYWN0dWFsIHRvcCBzb2xpZCB2b3hlbCwgbm90IHRoZSBwcmUtY2FydmUgZ3Vlc3MuXG4gIGZvciAobGV0IGx6ID0gMDsgbHogPCBDSFVOS19TSVpFOyBseisrKSB7XG4gICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgbGV0IHRvcE1hdDogbnVtYmVyID0gdG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICBjb25zdCBtID0gZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXTtcbiAgICAgICAgaWYgKGlzU29saWQobSkpIHsgdG9wU29saWQgPSB5OyB0b3BNYXQgPSBtOyBicmVhazsgfVxuICAgICAgfVxuICAgICAgaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBjbGFtcCh0b3BTb2xpZCAtIFlfTUlOLCAwLCBXT1JMRF9IRUlHSFQgLSAxKTtcbiAgICAgIHRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0b3BNYXQ7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY2h1bms6IFZveGVsQ2h1bmsgPSB7XG4gICAgY3gsIGN6LCBrZXksIGRhdGEsIGhlaWdodHMsIHRvcE1hdGVyaWFscywgbm9uQWlyLFxuICAgIGRpcnR5OiB0cnVlLFxuICAgIGdlbmVyYXRlZEF0OiBwZXJmb3JtYW5jZS5ub3coKSxcbiAgfTtcblxuICAvLyBBcHBseSBkdXJhYmxlIGVkaXRzIGFmdGVyIGJhc2UgZ2VuZXJhdGlvbi5cbiAgY29uc3QgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoa2V5KTtcbiAgaWYgKGVkaXRzKSB7XG4gICAgZm9yIChjb25zdCBbaWR4LCBtXSBvZiBlZGl0cykge1xuICAgICAgY2h1bmsuZGF0YVtpZHhdID0gbTtcbiAgICB9XG4gICAgLy8gUmVjb21wdXRlIHRoZSBjYWNoZSBmb3IgZWRpdGVkIGNodW5rcy5cbiAgICBmb3IgKGxldCBseiA9IDA7IGx6IDwgQ0hVTktfU0laRTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSAwOyBseCA8IENIVU5LX1NJWkU7IGx4KyspIHtcbiAgICAgICAgbGV0IHRvcFNvbGlkID0gWV9NSU47XG4gICAgICAgIGxldCB0b3BNYXQ6IG51bWJlciA9IGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF07XG4gICAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICAgIGNvbnN0IG0gPSBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildO1xuICAgICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgICAgfVxuICAgICAgICBjaHVuay5oZWlnaHRzW2x6ICogQ0hVTktfU0laRSArIGx4XSA9IGNsYW1wKHRvcFNvbGlkIC0gWV9NSU4sIDAsIFdPUkxEX0hFSUdIVCAtIDEpO1xuICAgICAgICBjaHVuay50b3BNYXRlcmlhbHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gdG9wTWF0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHdvcmxkLmNodW5rcy5zZXQoa2V5LCBjaHVuayk7XG4gIHdvcmxkLnN0YXRzLmNodW5rc0dlbmVyYXRlZCsrO1xuICB3b3JsZC5zdGF0cy52b3hlbHNGaWxsZWQgKz0gbm9uQWlyO1xuICB3b3JsZC5zdGF0cy5nZW5lcmF0aW9uTXMgKz0gcGVyZm9ybWFuY2Uubm93KCkgLSB0MDtcbiAgd29ybGQuZGlydHkuYWRkKGtleSk7XG5cbiAgZ2VuZXJhdGVFbnRpdGllcyh3b3JsZCwgY2h1bmspO1xuICByZXR1cm4gY2h1bms7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBldmljdENodW5rKHdvcmxkOiBXb3JsZCwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCF3b3JsZC5jaHVua3MuaGFzKGtleSkpIHJldHVybiBmYWxzZTtcbiAgd29ybGQuY2h1bmtzLmRlbGV0ZShrZXkpO1xuICB3b3JsZC5zdGF0cy5jaHVua3NFdmljdGVkKys7XG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyAtLS0tLS0tLS0tIHF1ZXJpZXMgLyBlZGl0cyAtLS0tLS0tLS0tXG5leHBvcnQgZnVuY3Rpb24gZ2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKTogTWF0SWQge1xuICBpZiAoeSA8IFlfTUlOKSByZXR1cm4gTUFULkJFRFJPQ0s7XG4gIGlmICh5ID49IFlfTUFYKSByZXR1cm4gTUFULkFJUjtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLmRhdGFbbG9jYWxJbmRleCh3b3JsZFRvTG9jYWxYKHgpLCB5VG9JbmRleCh5KSwgd29ybGRUb0xvY2FsWih6KSldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0Vm94ZWwod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCBtOiBNYXRJZCk6IGJvb2xlYW4ge1xuICBpZiAoeSA8IFlfTUlOIHx8IHkgPj0gWV9NQVgpIHJldHVybiBmYWxzZTtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjeCA9IHdvcmxkVG9DaHVua1goeCksIGN6ID0gd29ybGRUb0NodW5rWih6KTtcbiAgY29uc3QgY2h1bmsgPSBlbnN1cmVDaHVuayh3b3JsZCwgY3gsIGN6KTtcbiAgaWYgKCFjaHVuaykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBpZHggPSBsb2NhbEluZGV4KHdvcmxkVG9Mb2NhbFgoeCksIHlUb0luZGV4KHkpLCB3b3JsZFRvTG9jYWxaKHopKTtcbiAgaWYgKGNodW5rLmRhdGFbaWR4XSA9PT0gbSkgcmV0dXJuIGZhbHNlO1xuICBjaHVuay5kYXRhW2lkeF0gPSBtO1xuICBsZXQgZWRpdHMgPSB3b3JsZC5lZGl0cy5nZXQoY2h1bmsua2V5KTtcbiAgaWYgKCFlZGl0cykgeyBlZGl0cyA9IG5ldyBNYXAoKTsgd29ybGQuZWRpdHMuc2V0KGNodW5rLmtleSwgZWRpdHMpOyB9XG4gIGVkaXRzLnNldChpZHgsIG0pO1xuICBjaHVuay5kaXJ0eSA9IHRydWU7XG4gIHdvcmxkLmRpcnR5LmFkZChjaHVuay5rZXkpO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICB1cGRhdGVDb2x1bW5DYWNoZShjaHVuaywgd29ybGRUb0xvY2FsWCh4KSwgd29ybGRUb0xvY2FsWih6KSk7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDb2x1bW5DYWNoZShjaHVuazogVm94ZWxDaHVuaywgbHg6IG51bWJlciwgbHo6IG51bWJlcik6IHZvaWQge1xuICBsZXQgdG9wU29saWQgPSBZX01JTjtcbiAgZm9yIChsZXQgeSA9IFlfTUFYIC0gMTsgeSA+PSBZX01JTjsgeS0tKSB7XG4gICAgaWYgKGlzU29saWQoY2h1bmsuZGF0YVtsb2NhbEluZGV4KGx4LCB5VG9JbmRleCh5KSwgbHopXSkpIHsgdG9wU29saWQgPSB5OyBicmVhazsgfVxuICB9XG4gIGNodW5rLmhlaWdodHNbbHogKiBDSFVOS19TSVpFICsgbHhdID0gY2xhbXAodG9wU29saWQgLSBZX01JTiwgMCwgV09STERfSEVJR0hUIC0gMSk7XG4gIGNvbnN0IHRtID0gY2h1bmsudG9wTWF0ZXJpYWxzW2x6ICogQ0hVTktfU0laRSArIGx4XTtcbiAgaWYgKHRvcFNvbGlkID49IFlfTUlOKSB7XG4gICAgY29uc3QgbSA9IGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeVRvSW5kZXgodG9wU29saWQpLCBseildO1xuICAgIGlmIChtICE9PSBNQVQuV0FURVIpIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSBtO1xuICB9IGVsc2Uge1xuICAgIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gPSB0bTtcbiAgfVxufVxuXG4vKipcbiAqIFRoZSB5IGNvb3JkaW5hdGUgb2YgdGhlIGV4cG9zZWQgdG9wIGZhY2Ugb2YgdGhlIHNvbGlkIGNvbHVtbiBhdCB4L3ouXG4gKiBBIHNvbGlkIHZveGVsIGF0IHkgb2NjdXBpZXMgW3ksIHkrMSksIHNvIHRoZSB3YWxrYWJsZSBzdXJmYWNlIGlzIHRvcFNvbGlkKzEuXG4gKiBUaGlzIGlzIGEgZGVyaXZlZCBxdWVyeTsgdGhlIGF1dGhvcml0YXRpdmUgc3RhdGUgcmVtYWlucyB0aGUgdm94ZWwgdm9sdW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3VyZmFjZUF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoeCA8IC1IQUxGIHx8IHogPCAtSEFMRiB8fCB4ID49IEhBTEYgfHwgeiA+PSBIQUxGKSByZXR1cm4gWV9NSU47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gWV9NSU47XG4gIHJldHVybiBjaHVuay5oZWlnaHRzW3dvcmxkVG9Mb2NhbFooeikgKiBDSFVOS19TSVpFICsgd29ybGRUb0xvY2FsWCh4KV0gKyBZX01JTiArIDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IE1hdElkIHtcbiAgaWYgKHggPCAtSEFMRiB8fCB6IDwgLUhBTEYgfHwgeCA+PSBIQUxGIHx8IHogPj0gSEFMRikgcmV0dXJuIE1BVC5BSVI7XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICBpZiAoIWNodW5rKSByZXR1cm4gTUFULkFJUjtcbiAgcmV0dXJuIGNodW5rLnRvcE1hdGVyaWFsc1t3b3JsZFRvTG9jYWxaKHopICogQ0hVTktfU0laRSArIHdvcmxkVG9Mb2NhbFgoeCldIGFzIE1hdElkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVpZ2h0QXQod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBzdXJmYWNlQXQod29ybGQsIHgsIHopO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJEZXB0aEF0KHdvcmxkOiBXb3JsZCwgeDogbnVtYmVyLCB6OiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBoID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgcmV0dXJuIGggPCBTRUFfTEVWRUwgPyBTRUFfTEVWRUwgLSBoIDogMDtcbn1cblxuLy8gLS0tLS0tLS0tLSBlbnRpdGllcyAtLS0tLS0tLS0tXG5mdW5jdGlvbiBhZGRFbnRpdHkod29ybGQ6IFdvcmxkLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLmhhcyhlLmlkKSkgcmV0dXJuO1xuICB3b3JsZC5lbnRpdGllcy5zZXQoZS5pZCwgZSk7XG4gIGxldCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKCFsaXN0KSB7IGxpc3QgPSBbXTsgd29ybGQuZW50aXR5Q2h1bmtzLnNldChlLmNodW5rLCBsaXN0KTsgfVxuICBsaXN0LnB1c2goZS5pZCk7XG4gIHdvcmxkLnN0YXRzLmVudGl0aWVzID0gd29ybGQuZW50aXRpZXMuc2l6ZTtcbiAgd29ybGQucmV2aXNpb24rKztcbn1cblxuLyoqXG4gKiBSZW1vdmUgYW4gZW50aXR5IGZyb20gdGhlIGF1dGhvcml0YXRpdmUgd29ybGQuIFVzZWQgd2hlbiBhIHNpdGUgaXMgY2xlYXJlZDpcbiAqIHRoZSByZXNvdXJjZSB5aWVsZCBpcyBhY2NvdW50ZWQgZm9yIGJ5IHRoZSBjYWxsZXIsIGFuZCB0aGUgZW50aXR5IG11c3Qgc3RvcFxuICogZXhpc3RpbmcgZm9yIGNvbGxpc2lvbiwgb2JzdHJ1Y3Rpb24gYW5kIHBlcnNpc3RlbmNlLCBub3QganVzdCBiZSBoaWRkZW4gYnlcbiAqIHRoZSByZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUVudGl0eSh3b3JsZDogV29ybGQsIGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gIGlmICghZSkgcmV0dXJuIGZhbHNlO1xuICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICBjb25zdCBsaXN0ID0gd29ybGQuZW50aXR5Q2h1bmtzLmdldChlLmNodW5rKTtcbiAgaWYgKGxpc3QpIHtcbiAgICBjb25zdCBpID0gbGlzdC5pbmRleE9mKGlkKTtcbiAgICBpZiAoaSA+PSAwKSBsaXN0LnNwbGljZShpLCAxKTtcbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHdvcmxkLmVudGl0eUNodW5rcy5kZWxldGUoZS5jaHVuayk7XG4gIH1cbiAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICBpZiAoZS5raW5kID09PSAnc3R5bF90cmVlX2Jsb3Nzb20nKSB3b3JsZC5zdGF0cy5waW5rVHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy5waW5rVHJlZXMgLSAxKTtcbiAgd29ybGQuc3RhdHMuZW50aXRpZXMgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICB3b3JsZC5yZXZpc2lvbisrO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZW50aXR5SWQoY2h1bms6IHN0cmluZywgaTogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBlOiR7Y2h1bmt9OiR7aX1gO1xufVxuXG5mdW5jdGlvbiBmb3Jlc3RTY29yZSh3eDogbnVtYmVyLCB3ejogbnVtYmVyLCBzZWVkOiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBlYXN0ID0gTWF0aC5leHAoLSgoKHd4IC0gMjIwKSAvIDI2MCkgKiogMiArICgod3ogKyAxMTApIC8gMjIwKSAqKiAyKSk7XG4gIGNvbnN0IG5vcnRoID0gTWF0aC5leHAoLSgoKHd4IC0gMjApIC8gMzAwKSAqKiAyICsgKCh3eiArIDMwMCkgLyAxOTApICoqIDIpKTtcbiAgY29uc3Qgd2VzdCA9IE1hdGguZXhwKC0oKCh3eCArIDM0MCkgLyAyMDApICoqIDIgKyAoKHd6IC0gMTIwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBzb3V0aCA9IE1hdGguZXhwKC0oKCh3eCAtIDEyMCkgLyAyNDApICoqIDIgKyAoKHd6IC0gMzMwKSAvIDE4MCkgKiogMikpO1xuICBjb25zdCBtb2lzdHVyZSA9IGZibTIod3ggLyAyNjAsIHd6IC8gMjYwLCBzZWVkICsgMjAxLCA0KTtcbiAgY29uc3QgdmFsbGV5ID0gTWF0aC5leHAoLSgod3ggLyAxNDApICoqIDIgKyAod3ogLyAxMDUpICoqIDIpKTtcbiAgcmV0dXJuIE1hdGgubWF4KGVhc3QsIG5vcnRoICogMC45Miwgd2VzdCAqIDAuODAsIHNvdXRoICogMC43OCkgKiAwLjgyXG4gICAgKyBtb2lzdHVyZSAqIDAuMzggLSAwLjIyIC0gdmFsbGV5ICogMC4zNDtcbn1cblxuZnVuY3Rpb24gcm9ja1Njb3JlKHd4OiBudW1iZXIsIHd6OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IG1vdW50YWluID0gZmJtMih3eCAvIDMzMCwgd3ogLyAzMzAsIHNlZWQgKyAyMDIsIDMpO1xuICBjb25zdCByaWRnZSA9IDEgLSBNYXRoLmFicygyICogZmJtMih3eCAvIDE0MCwgd3ogLyAxNDAsIHNlZWQgKyAyMDMsIDMpIC0gMSk7XG4gIHJldHVybiBtb3VudGFpbiAqIDAuNTUgKyByaWRnZSAqIDAuNDU7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRW50aXRpZXMod29ybGQ6IFdvcmxkLCBjaHVuazogVm94ZWxDaHVuayk6IHZvaWQge1xuICBpZiAod29ybGQuZW50aXR5Q2h1bmtzLmhhcyhjaHVuay5rZXkpKSByZXR1cm47XG4gIGNvbnN0IHJuZCA9IG11bGJlcnJ5MzIoKGhhc2gyaShjaHVuay5jeCwgY2h1bmsuY3osIHdvcmxkLnNlZWQgKyA5MDApICogNDI5NDk2NzI5NikgPj4+IDApO1xuICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjaHVuay5jeCksIG96ID0gY2h1bmtPcmlnaW5aKGNodW5rLmN6KTtcbiAgbGV0IG4gPSAwO1xuXG4gIGNvbnN0IGxvY2FsU3VyZmFjZSA9IChseDogbnVtYmVyLCBsejogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICByZXR1cm4gY2h1bmsuaGVpZ2h0c1tseiAqIENIVU5LX1NJWkUgKyBseF0gKyBZX01JTiArIDE7XG4gIH07XG4gIGNvbnN0IGxvY2FsVG9wID0gKGx4OiBudW1iZXIsIGx6OiBudW1iZXIpOiBNYXRJZCA9PiB7XG4gICAgcmV0dXJuIGNodW5rLnRvcE1hdGVyaWFsc1tseiAqIENIVU5LX1NJWkUgKyBseF0gYXMgTWF0SWQ7XG4gIH07XG4gIGNvbnN0IGxvY2FsU2xvcGUgPSAobHg6IG51bWJlciwgbHo6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgY29uc3QgaCA9IGxvY2FsU3VyZmFjZShseCwgbHopO1xuICAgIHJldHVybiBNYXRoLm1heChcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UoY2xhbXAobHggLSAxLCAwLCBDSFVOS19TSVpFIC0gMSksIGx6KSksXG4gICAgICBNYXRoLmFicyhoIC0gbG9jYWxTdXJmYWNlKGNsYW1wKGx4ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpLCBseikpLFxuICAgICAgTWF0aC5hYnMoaCAtIGxvY2FsU3VyZmFjZShseCwgY2xhbXAobHogLSAxLCAwLCBDSFVOS19TSVpFIC0gMSkpKSxcbiAgICAgIE1hdGguYWJzKGggLSBsb2NhbFN1cmZhY2UobHgsIGNsYW1wKGx6ICsgMSwgMCwgQ0hVTktfU0laRSAtIDEpKSksXG4gICAgKTtcbiAgfTtcblxuICAvLyBBIGppdHRlcmVkIDggbSBsYXR0aWNlIGdpdmVzIGNvaGVyZW50IG1hc3NlcyBhbmQgYXZvaWRzIHBlci1mcmFtZSBzY2F0dGVyLlxuICBmb3IgKGxldCBneiA9IDA7IGd6IDwgQ0hVTktfU0laRTsgZ3ogKz0gOCkge1xuICAgIGZvciAobGV0IGd4ID0gMDsgZ3ggPCBDSFVOS19TSVpFOyBneCArPSA4KSB7XG4gICAgICBjb25zdCBseCA9IGNsYW1wKE1hdGguZmxvb3IoZ3ggKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCBseiA9IGNsYW1wKE1hdGguZmxvb3IoZ3ogKyAyICsgKHJuZCgpIC0gMC41KSAqIDUpLCAxLCBDSFVOS19TSVpFIC0gMik7XG4gICAgICBjb25zdCB3eCA9IG94ICsgbHgsIHd6ID0gb3ogKyBsejtcbiAgICAgIGNvbnN0IGggPSBsb2NhbFN1cmZhY2UobHgsIGx6KTtcbiAgICAgIGlmIChoIDw9IFNFQV9MRVZFTCArIDEpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qgc2xvcGUgPSBsb2NhbFNsb3BlKGx4LCBseik7XG4gICAgICBjb25zdCB0b3AgPSBsb2NhbFRvcChseCwgbHopO1xuICAgICAgaWYgKHRvcCA9PT0gTUFULldBVEVSKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGZvcmVzdCA9IGZvcmVzdFNjb3JlKHd4LCB3eiwgd29ybGQuc2VlZCk7XG4gICAgICBjb25zdCByb2NreSA9IHJvY2tTY29yZSh3eCwgd3osIHdvcmxkLnNlZWQpO1xuICAgICAgY29uc3Qgcm9sbCA9IHJuZCgpO1xuXG4gICAgICBjb25zdCB0cmVlQ2hhbmNlID0gZm9yZXN0ID4gMC41MCA/IDAuNzIgOiBmb3Jlc3QgPiAwLjMwID8gMC4yNSA6IDAuMDU7XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMiAmJiByb2xsIDwgdHJlZUNoYW5jZSkge1xuICAgICAgICAvLyBTcGVjaWVzIG1peCBmcm9tIEFTLTAwMSBcdTAwQTcxMDogVDEgMjglLCBUMiAzNCUsIFQzIDI2JSwgVDQgMTIlLlxuICAgICAgICAvLyBUaGUgMjUlIHdvcmxkIHBpbmsgY2FwIGlzIGVuZm9yY2VkIHBlciBpbnNlcnRpb24sIHdpdGggVDMgZmFsbGJhY2suXG4gICAgICAgIGxldCBraW5kOiBFbnRpdHlLaW5kO1xuICAgICAgICBsZXQgdmFyaWFudDogbnVtYmVyO1xuICAgICAgICBjb25zdCBzcGVjaWVzUm9sbCA9IHJuZCgpO1xuICAgICAgICBpZiAoc3BlY2llc1JvbGwgPCAwLjEyKSB7XG4gICAgICAgICAgaWYgKCh3b3JsZC5zdGF0cy5waW5rVHJlZXMgKyAxKSA+IDAuMjUgKiAod29ybGQuc3RhdHMudHJlZXMgKyAxKSkge1xuICAgICAgICAgICAga2luZCA9ICdzdHlsX3RyZWVfY2x1c3Rlcic7XG4gICAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICAgICAgd29ybGQuc3RhdHMucGlua092ZXJmbG93Kys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtpbmQgPSAnc3R5bF90cmVlX2Jsb3Nzb20nO1xuICAgICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiAyKTtcbiAgICAgICAgICAgIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNDApIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9zcGlyZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIGlmIChzcGVjaWVzUm9sbCA8IDAuNzQpIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV90YWJsZSc7XG4gICAgICAgICAgdmFyaWFudCA9IE1hdGguZmxvb3Iocm5kKCkgKiA0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBraW5kID0gJ3N0eWxfdHJlZV9jbHVzdGVyJztcbiAgICAgICAgICB2YXJpYW50ID0gTWF0aC5mbG9vcihybmQoKSAqIDMpO1xuICAgICAgICB9XG4gICAgICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgICAgIGFkZEVudGl0eSh3b3JsZCwge1xuICAgICAgICAgIGlkOiBlbnRpdHlJZChjaHVuay5rZXksIG4rKyksXG4gICAgICAgICAga2luZCwgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjg4ICsgcm5kKCkgKiAwLjI0LCB2YXJpYW50LFxuICAgICAgICAgIHJlc291cmNlOiAnd29vZCcsIHJlbWFpbmluZzogMTIsIHlpZWxkUGVySGFydmVzdDogNCxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgcm9ja3kgPiAwLjQ2ICYmIHJvbGwgPCAwLjM4KSB7XG4gICAgICAgIGNvbnN0IHNpemVSb2xsID0gcm5kKCk7XG4gICAgICAgIGNvbnN0IGtpbmQ6IEVudGl0eUtpbmQgPSBzaXplUm9sbCA8IDAuNTUgPyAnc3R5bF9yb2NrX3NtYWxsJ1xuICAgICAgICAgIDogc2l6ZVJvbGwgPCAwLjkwID8gJ3N0eWxfcm9ja19tZWRpdW0nIDogJ3N0eWxfcm9ja19sYXJnZSc7XG4gICAgICAgIGNvbnN0IHJlbWFpbmluZyA9IGtpbmQgPT09ICdzdHlsX3JvY2tfc21hbGwnID8gNCA6IGtpbmQgPT09ICdzdHlsX3JvY2tfbWVkaXVtJyA/IDggOiAxMjtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMyksXG4gICAgICAgICAgcmVzb3VyY2U6ICdzdG9uZScsIHJlbWFpbmluZywgeWllbGRQZXJIYXJ2ZXN0OiAzLFxuICAgICAgICAgIGhhcnZlc3RlZDogZmFsc2UsIHByb3Zpc2lvbmFsOiB0cnVlLCBhdXRob3JlZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICh0b3AgPT09IE1BVC5TVE9ORSAmJiByb2NreSA+IDAuNTggJiYgcm9sbCA8IDAuMTgpIHtcbiAgICAgICAgYWRkRW50aXR5KHdvcmxkLCB7XG4gICAgICAgICAgaWQ6IGVudGl0eUlkKGNodW5rLmtleSwgbisrKSxcbiAgICAgICAgICBraW5kOiAnc3R5bF9vcmUnLCBjaHVuazogY2h1bmsua2V5LCB4OiB3eCArIDAuNSwgeTogaCwgejogd3ogKyAwLjUsXG4gICAgICAgICAgcm90OiBNYXRoLmZsb29yKHJuZCgpICogMjQpICogKE1hdGguUEkgLyAxMiksXG4gICAgICAgICAgc2NhbGU6IDAuOSArIHJuZCgpICogMC4yLCB2YXJpYW50OiBNYXRoLmZsb29yKHJuZCgpICogMiksXG4gICAgICAgICAgcmVzb3VyY2U6ICdvcmUnLCByZW1haW5pbmc6IDgsIHlpZWxkUGVySGFydmVzdDogMixcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAodG9wID09PSBNQVQuR1JBU1MgJiYgc2xvcGUgPD0gMSAmJiByb2xsIDwgMC4zMCkge1xuICAgICAgICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICAgICAgICBpZDogZW50aXR5SWQoY2h1bmsua2V5LCBuKyspLFxuICAgICAgICAgIGtpbmQ6ICdzdHlsX3NocnViJywgY2h1bms6IGNodW5rLmtleSwgeDogd3ggKyAwLjUsIHk6IGgsIHo6IHd6ICsgMC41LFxuICAgICAgICAgIHJvdDogTWF0aC5mbG9vcihybmQoKSAqIDI0KSAqIChNYXRoLlBJIC8gMTIpLFxuICAgICAgICAgIHNjYWxlOiAwLjggKyBybmQoKSAqIDAuNCwgdmFyaWFudDogTWF0aC5mbG9vcihybmQoKSAqIDMpLFxuICAgICAgICAgIHJlc291cmNlOiAnZmliZXInLCByZW1haW5pbmc6IDQsIHlpZWxkUGVySGFydmVzdDogMSxcbiAgICAgICAgICBoYXJ2ZXN0ZWQ6IGZhbHNlLCBwcm92aXNpb25hbDogdHJ1ZSwgYXV0aG9yZWQ6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkQXV0aG9yZWRFbnRpdHkod29ybGQ6IFdvcmxkLCBraW5kOiBFbnRpdHlLaW5kLCB4OiBudW1iZXIsIHo6IG51bWJlciwgdmFyaWFudDogbnVtYmVyLCByb3Q6IG51bWJlciwgc2NhbGU6IG51bWJlciwgcmVzb3VyY2U6IFJlc291cmNlVHlwZSB8IG51bGwsIHJlbWFpbmluZzogbnVtYmVyLCB5aWVsZFBlckhhcnZlc3Q6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgaWYgKHkgPD0gU0VBX0xFVkVMKSByZXR1cm47XG4gIGNvbnN0IGN4ID0gd29ybGRUb0NodW5rWCh4KSwgY3ogPSB3b3JsZFRvQ2h1bmtaKHopO1xuICBjb25zdCBrZXkgPSBjaHVua0tleShjeCwgY3opO1xuICAvLyBBIGhlcm8gYXNzZXQgb3ducyBpdHMgc3BvdDogY2xlYXIgYW55IGdlbmVyYXRlZCBlbnRpdHkgdGhhdCB3b3VsZCBvdmVybGFwXG4gIC8vIGl0LCByYXRoZXIgdGhhbiBzaWxlbnRseSBkcm9wcGluZyB0aGUgYXV0aG9yZWQgY29tcG9zaXRpb24uXG4gIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KSA/PyBbXTtcbiAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgICBpZiAoZSAmJiBNYXRoLmh5cG90KGUueCAtIHgsIGUueiAtIHopIDwgMi42KSB7XG4gICAgICB3b3JsZC5lbnRpdGllcy5kZWxldGUoaWQpO1xuICAgICAgaWYgKGUua2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkgd29ybGQuc3RhdHMudHJlZXMgPSBNYXRoLm1heCgwLCB3b3JsZC5zdGF0cy50cmVlcyAtIDEpO1xuICAgICAgaWYgKGUua2luZCA9PT0gJ3N0eWxfdHJlZV9ibG9zc29tJykgd29ybGQuc3RhdHMucGlua1RyZWVzID0gTWF0aC5tYXgoMCwgd29ybGQuc3RhdHMucGlua1RyZWVzIC0gMSk7XG4gICAgfVxuICB9XG4gIHdvcmxkLmVudGl0eUNodW5rcy5zZXQoa2V5LCBpZHMuZmlsdGVyKChpZCkgPT4gd29ybGQuZW50aXRpZXMuaGFzKGlkKSkpO1xuXG4gIGNvbnN0IGlkID0gYGhlcm86JHtraW5kfToke01hdGgucm91bmQoeCl9OiR7TWF0aC5yb3VuZCh6KX1gO1xuICBjb25zdCBiZWZvcmUgPSB3b3JsZC5lbnRpdGllcy5zaXplO1xuICBhZGRFbnRpdHkod29ybGQsIHtcbiAgICBpZCwga2luZCwgY2h1bms6IGtleSwgeDogeCArIDAuNSwgeSwgejogeiArIDAuNSxcbiAgICByb3QsIHNjYWxlLCB2YXJpYW50LCByZXNvdXJjZSwgcmVtYWluaW5nLCB5aWVsZFBlckhhcnZlc3QsXG4gICAgaGFydmVzdGVkOiBmYWxzZSwgcHJvdmlzaW9uYWw6IHRydWUsIGF1dGhvcmVkOiB0cnVlLFxuICB9KTtcbiAgaWYgKHdvcmxkLmVudGl0aWVzLnNpemUgPiBiZWZvcmUgJiYga2luZC5zdGFydHNXaXRoKCdzdHlsX3RyZWUnKSkge1xuICAgIHdvcmxkLnN0YXRzLnRyZWVzKys7XG4gICAgaWYgKGtpbmQgPT09ICdzdHlsX3RyZWVfYmxvc3NvbScpIHdvcmxkLnN0YXRzLnBpbmtUcmVlcysrO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFjZUF1dGhvcmVkU2l0ZXMod29ybGQ6IFdvcmxkKTogdm9pZCB7XG4gIGlmICh3b3JsZC5hdXRob3JlZFBsYWNlZCkgcmV0dXJuO1xuICB3b3JsZC5hdXRob3JlZFBsYWNlZCA9IHRydWU7XG5cbiAgY29uc3Qgc2l0ZXM6IEFycmF5PHsga2luZDogJ3dheXN0b25lJyB8ICdtYXJrZXInOyB4OiBudW1iZXI7IHo6IG51bWJlcjsgcm90OiBudW1iZXIgfT4gPSBbXG4gICAgeyBraW5kOiAnd2F5c3RvbmUnLCB4OiAtMTAsIHo6IC0xNCwgcm90OiAwIH0sXG4gICAgeyBraW5kOiAnbWFya2VyJywgeDogLTMyLCB6OiAtOCwgcm90OiBNYXRoLlBJIC8gMiB9LFxuICBdO1xuICBmb3IgKGNvbnN0IHMgb2Ygc2l0ZXMpIHtcbiAgICBjb25zdCB5ID0gc3VyZmFjZUF0KHdvcmxkLCBzLngsIHMueik7XG4gICAgaWYgKHkgPD0gU0VBX0xFVkVMKSBjb250aW51ZTtcbiAgICB3b3JsZC5zaXRlcy5wdXNoKHtcbiAgICAgIGlkOiBgc2l0ZToke3Mua2luZH1gLFxuICAgICAga2luZDogcy5raW5kLFxuICAgICAgeDogcy54ICsgMC41LCB5LCB6OiBzLnogKyAwLjUsXG4gICAgICByb3Q6IHMucm90LFxuICAgICAgcHJvdmlzaW9uYWw6IHRydWUsXG4gICAgfSk7XG4gIH1cblxuICAvLyBBIGhlcm8gZ3JvdmUgY29tcG9zZWQgaW4gdGhlIGRlZmF1bHQgY2FtZXJhJ3MgdmlldyBkaXJlY3Rpb24uIFRoZXNlIGFyZVxuICAvLyBTdHlsIG5hdHVyYWwgYXNzZXRzIChBUy0wMDEgdjIpLCBub3QgTm94ZWwgYXJjaGl0ZWN0dXJlOyB0aGUgTm94ZWxcbiAgLy8gd2F5c3RvbmUvbWFya2VyIGFib3ZlIHJlbWFpbiB0aGUgaHVtYW4tbWFkZSBsYW5kbWFya3MuXG4gIGNvbnN0IGdyb3ZlOiBBcnJheTxbRW50aXR5S2luZCwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdPiA9IFtcbiAgICBbJ3N0eWxfdHJlZV9zcGlyZScsIC0yMiwgLTI2LCAwLCAxLjAwLCAwXSxcbiAgICBbJ3N0eWxfdHJlZV90YWJsZScsIC0zNCwgLTE4LCAxLCAwLjk1LCBNYXRoLlBJIC8gMTJdLFxuICAgIFsnc3R5bF90cmVlX2NsdXN0ZXInLCAtMTYsIC0zNCwgMiwgMS4wMCwgTWF0aC5QSSAvIDZdLFxuICAgIFsnc3R5bF90cmVlX2Jsb3Nzb20nLCAtMjgsIC0zOCwgMCwgMC45MCwgTWF0aC5QSSAvIDRdLFxuICAgIFsnc3R5bF90cmVlX3RhYmxlJywgLTQwLCAtMzAsIDIsIDEuMDUsIE1hdGguUEkgLyAzXSxcbiAgICBbJ3N0eWxfdHJlZV9jbHVzdGVyJywgLTEyLCAtMjQsIDAsIDAuOTAsIE1hdGguUEkgLyAyLjRdLFxuICBdO1xuICBmb3IgKGNvbnN0IFtraW5kLCB4LCB6LCB2YXJpYW50LCBzY2FsZSwgcm90XSBvZiBncm92ZSkge1xuICAgIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCBraW5kLCB4LCB6LCB2YXJpYW50LCByb3QsIHNjYWxlLCAnd29vZCcsIDEyLCA0KTtcbiAgfVxuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfcm9ja19tZWRpdW0nLCAtNiwgLTEwLCAwLCAwLCAxLjAsICdzdG9uZScsIDgsIDMpO1xuICBhZGRBdXRob3JlZEVudGl0eSh3b3JsZCwgJ3N0eWxfc2hydWInLCAtMTQsIC04LCAxLCBNYXRoLlBJIC8gMTIsIDEuMSwgJ2ZpYmVyJywgNCwgMSk7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9jYWlybicsIC0yMCwgLTYsIDAsIDAsIDEuMCwgJ3N0b25lJywgNiwgMik7XG4gIGFkZEF1dGhvcmVkRW50aXR5KHdvcmxkLCAnc3R5bF9vcmUnLCAtMzgsIC00MiwgMCwgTWF0aC5QSSAvIDQsIDEuMSwgJ29yZScsIDgsIDIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbmVhcmVzdEhhcnZlc3RhYmxlKFxuICB3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCByYWRpdXM6IG51bWJlciwgcmVzb3VyY2U/OiBSZXNvdXJjZVR5cGUsXG4pOiBFbnRpdHkgfCBudWxsIHtcbiAgbGV0IGJlc3Q6IEVudGl0eSB8IG51bGwgPSBudWxsO1xuICBsZXQgYmVzdEQgPSByYWRpdXMgKiByYWRpdXM7XG4gIGZvciAoY29uc3QgZSBvZiB3b3JsZC5lbnRpdGllcy52YWx1ZXMoKSkge1xuICAgIGlmIChlLmhhcnZlc3RlZCB8fCAhZS5yZXNvdXJjZSB8fCBlLnJlbWFpbmluZyA8PSAwKSBjb250aW51ZTtcbiAgICBpZiAocmVzb3VyY2UgJiYgZS5yZXNvdXJjZSAhPT0gcmVzb3VyY2UpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGQgPSAoZS54IC0geCkgKiogMiArIChlLnogLSB6KSAqKiAyO1xuICAgIGlmIChkIDwgYmVzdEQpIHsgYmVzdEQgPSBkOyBiZXN0ID0gZTsgfVxuICB9XG4gIHJldHVybiBiZXN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhhcnZlc3RSZXN1bHQgeyBlbnRpdHk6IEVudGl0eTsgcmVzb3VyY2U6IFJlc291cmNlVHlwZTsgYW1vdW50OiBudW1iZXI7IH1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhcnZlc3RFbnRpdHkod29ybGQ6IFdvcmxkLCBpZDogc3RyaW5nKTogSGFydmVzdFJlc3VsdCB8IG51bGwge1xuICBjb25zdCBlID0gd29ybGQuZW50aXRpZXMuZ2V0KGlkKTtcbiAgaWYgKCFlIHx8IGUuaGFydmVzdGVkIHx8ICFlLnJlc291cmNlIHx8IGUucmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsO1xuICBjb25zdCBhbW91bnQgPSBNYXRoLm1pbihlLnlpZWxkUGVySGFydmVzdCwgZS5yZW1haW5pbmcpO1xuICBlLnJlbWFpbmluZyAtPSBhbW91bnQ7XG4gIGUuaGFydmVzdGVkT25jZSA9IHRydWU7XG4gIGlmIChlLnJlbWFpbmluZyA8PSAwKSBlLmhhcnZlc3RlZCA9IHRydWU7XG4gIHdvcmxkLmludmVudG9yeVtlLnJlc291cmNlXSA9ICh3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPz8gMCkgKyBhbW91bnQ7XG4gIHdvcmxkLnJldmlzaW9uKys7XG4gIHJldHVybiB7IGVudGl0eTogZSwgcmVzb3VyY2U6IGUucmVzb3VyY2UsIGFtb3VudCB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHBlcnNpc3RlbmNlIC8gYXV0aG9yaXR5IGJvdW5kYXJ5IC0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNYW5pZmVzdCB7XG4gIHNjaGVtYTogMTtcbiAgc2VlZDogbnVtYmVyO1xuICBnZW5lcmF0b3JWZXJzaW9uOiBudW1iZXI7XG4gIHNpemU6IG51bWJlcjtcbiAgY2h1bmtTaXplOiBudW1iZXI7XG4gIHlNaW46IG51bWJlcjtcbiAgeU1heDogbnVtYmVyO1xuICBzZWFMZXZlbDogbnVtYmVyO1xuICBwYXJhbXNIYXNoOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGZudjFhKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoID0gMHg4MTFjOWRjNTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgaCBePSB0ZXh0LmNoYXJDb2RlQXQoaSk7XG4gICAgaCA9IE1hdGguaW11bChoLCAweDAxMDAwMTkzKTtcbiAgfVxuICByZXR1cm4gKGggPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCAnMCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ybGRNYW5pZmVzdCh3b3JsZDogV29ybGQpOiBXb3JsZE1hbmlmZXN0IHtcbiAgY29uc3QgcCA9IHdvcmxkLnBhcmFtcztcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWE6IDEsXG4gICAgc2VlZDogd29ybGQuc2VlZCxcbiAgICBnZW5lcmF0b3JWZXJzaW9uOiBwLmdlbmVyYXRvclZlcnNpb24sXG4gICAgc2l6ZTogcC5zaXplLFxuICAgIGNodW5rU2l6ZTogcC5jaHVua1NpemUsXG4gICAgeU1pbjogcC55TWluLFxuICAgIHlNYXg6IHAueU1heCxcbiAgICBzZWFMZXZlbDogcC5zZWFMZXZlbCxcbiAgICBwYXJhbXNIYXNoOiBmbnYxYShKU09OLnN0cmluZ2lmeShwKSksXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm94ZWxFZGl0IHsgaTogbnVtYmVyOyBtOiBudW1iZXI7IH1cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIHNjaGVtYTogMTtcbiAga2V5OiBzdHJpbmc7XG4gIGJhc2VWZXJzaW9uOiBudW1iZXI7XG4gIGVkaXRzOiBWb3hlbEVkaXRbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cG9ydENodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBrZXk6IHN0cmluZyk6IENodW5rRGVsdGEge1xuICBjb25zdCBlZGl0cyA9IHdvcmxkLmVkaXRzLmdldChrZXkpO1xuICByZXR1cm4ge1xuICAgIHNjaGVtYTogMSxcbiAgICBrZXksXG4gICAgYmFzZVZlcnNpb246IHdvcmxkLnBhcmFtcy5nZW5lcmF0b3JWZXJzaW9uLFxuICAgIGVkaXRzOiBlZGl0cyA/IFsuLi5lZGl0cy5lbnRyaWVzKCldLm1hcCgoW2ksIG1dKSA9PiAoeyBpLCBtIH0pKS5zb3J0KChhLCBiKSA9PiBhLmkgLSBiLmkpIDogW10sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNodW5rRGVsdGEod29ybGQ6IFdvcmxkLCBkZWx0YTogQ2h1bmtEZWx0YSk6IHZvaWQge1xuICBjb25zdCBbY3gsIGN6XSA9IGRlbHRhLmtleS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpO1xuICBmb3IgKGNvbnN0IGUgb2YgZGVsdGEuZWRpdHMpIHtcbiAgICBjb25zdCB5SW5kZXggPSBNYXRoLmZsb29yKGUuaSAvIENIVU5LX0FSRUEpO1xuICAgIGNvbnN0IHJlbSA9IGUuaSAlIENIVU5LX0FSRUE7XG4gICAgY29uc3QgbHogPSBNYXRoLmZsb29yKHJlbSAvIENIVU5LX1NJWkUpO1xuICAgIGNvbnN0IGx4ID0gcmVtICUgQ0hVTktfU0laRTtcbiAgICBjb25zdCB4ID0gY2h1bmtPcmlnaW5YKGN4KSArIGx4O1xuICAgIGNvbnN0IHkgPSBZX01JTiArIHlJbmRleDtcbiAgICBjb25zdCB6ID0gY2h1bmtPcmlnaW5aKGN6KSArIGx6O1xuICAgIHNldFZveGVsKHdvcmxkLCB4LCB5LCB6LCBlLm0gYXMgTWF0SWQpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gdGltZSAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFRpbWVTdGF0ZSB7IHQ6IG51bWJlcjsgZGF5TGVuZ3RoU2VjOiBudW1iZXI7IHBhdXNlZDogYm9vbGVhbjsgfVxuXG5leHBvcnQgZnVuY3Rpb24gYWR2YW5jZVRpbWUoczogVGltZVN0YXRlLCBkdDogbnVtYmVyKTogdm9pZCB7XG4gIGlmIChzLnBhdXNlZCkgcmV0dXJuO1xuICBzLnQgPSAocy50ICsgZHQgLyBzLmRheUxlbmd0aFNlYykgJSAxO1xufVxuIiwgIi8vIFRlcnJhaW4gcXVlcnkgbGF5ZXIgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbiwgbm8gdGhyZWUuanMgaW1wb3J0cyAoRC0wMDUpLlxuLy9cbi8vIE0wMDIgU3lzdGVtIDE6IG9uZSBzaGFyZWQsIGNhY2hlZCBjb250cmFjdCBmb3IgY29uc3RydWN0aW9uLCBmYXJtaW5nLFxuLy8gbW92ZW1lbnQsIG5hdmlnYXRpb24gYW5kIHRoZSBBSSBhZ2VudC4gVGhlc2UgcXVlcmllcyBkZXNjcmliZSB0aGVcbi8vIGF1dGhvcml0YXRpdmUgdm94ZWwgdm9sdW1lOyB0aGV5IG5ldmVyIG11dGF0ZSBpdCBhbmQgbmV2ZXIgY3JlYXRlIGEgc2Vjb25kXG4vLyB0ZXJyYWluIHJlcHJlc2VudGF0aW9uLlxuLy9cbi8vIENvbnZlbnRpb25zOlxuLy8gICAqIHgveiBhcmUgaW50ZWdlciBjb2x1bW4gY29vcmRpbmF0ZXMgaW4gWy0xMDI0LCAxMDI0KS5cbi8vICAgKiB5IGlzIGFuIGludGVnZXIgdm94ZWwgY29vcmRpbmF0ZSBpbiBbLTE2LCAxMTIpLlxuLy8gICAqIHN1cmZhY2VZIGlzIHRoZSBleHBvc2VkIHRvcCBmYWNlICh0b3BTb2xpZCArIDEpLCBtYXRjaGluZyBNMDAxLlxuLy8gICAqIEEgcmVjdCBpcyBpbmNsdXNpdmUgb24gYWxsIGZvdXIgZWRnZXMuXG5pbXBvcnQge1xuICBXb3JsZCwgTWF0SWQsIE1BVCwgU0VBX0xFVkVMLCBZX01JTiwgWV9NQVgsIEhBTEYsXG4gIHN1cmZhY2VBdCwgdG9wTWF0ZXJpYWxBdFdvcmxkLCBnZXRWb3hlbCwgaXNTb2xpZCxcbiAgd29ybGRUb0NodW5rWCwgd29ybGRUb0NodW5rWiwgY2h1bmtLZXksXG4gIEVudGl0eUtpbmQsXG59IGZyb20gJy4vd29ybGQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlY3Qge1xuICB4MDogbnVtYmVyO1xuICB6MDogbnVtYmVyO1xuICB4MTogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZveGVsUmVnaW9uIGV4dGVuZHMgUmVjdCB7XG4gIHkwOiBudW1iZXI7XG4gIHkxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVSZWN0KHJlY3Q6IFJlY3QpOiBSZWN0IHtcbiAgcmV0dXJuIHtcbiAgICB4MDogTWF0aC5taW4ocmVjdC54MCwgcmVjdC54MSksXG4gICAgejA6IE1hdGgubWluKHJlY3QuejAsIHJlY3QuejEpLFxuICAgIHgxOiBNYXRoLm1heChyZWN0LngwLCByZWN0LngxKSxcbiAgICB6MTogTWF0aC5tYXgocmVjdC56MCwgcmVjdC56MSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0Q29sdW1ucyhyZWN0OiBSZWN0KTogbnVtYmVyIHtcbiAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gIHJldHVybiAoci54MSAtIHIueDAgKyAxKSAqIChyLnoxIC0gci56MCArIDEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjdENvbnRhaW5zKHJlY3Q6IFJlY3QsIHg6IG51bWJlciwgejogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB4ID49IHJlY3QueDAgJiYgeCA8PSByZWN0LngxICYmIHogPj0gcmVjdC56MCAmJiB6IDw9IHJlY3QuejE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBhbmRSZWN0KHJlY3Q6IFJlY3QsIGFtb3VudDogbnVtYmVyKTogUmVjdCB7XG4gIHJldHVybiB7XG4gICAgeDA6IHJlY3QueDAgLSBhbW91bnQsXG4gICAgejA6IHJlY3QuejAgLSBhbW91bnQsXG4gICAgeDE6IHJlY3QueDEgKyBhbW91bnQsXG4gICAgejE6IHJlY3QuejEgKyBhbW91bnQsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWN0VG9SZWdpb24ocmVjdDogUmVjdCwgeTAgPSBZX01JTiwgeTEgPSBZX01BWCAtIDEpOiBWb3hlbFJlZ2lvbiB7XG4gIHJldHVybiB7IC4uLm5vcm1hbGl6ZVJlY3QocmVjdCksIHkwLCB5MSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaW9uc092ZXJsYXAoYTogVm94ZWxSZWdpb24sIGI6IFZveGVsUmVnaW9uKTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejBcbiAgICAmJiBhLnkwIDw9IGIueTEgJiYgYS55MSA+PSBiLnkwO1xufVxuXG4vKiogSW5jbHVzaXZlIGNvbnRhaW5tZW50IG9mIGEgdm94ZWwgaW4gYSB3b3JrIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVudmVsb3BlQ29udGFpbnMocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10sIHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCByIG9mIHJlY3RzKSB7XG4gICAgaWYgKHggPj0gci54MCAmJiB4IDw9IHIueDEgJiYgeSA+PSByLnkwICYmIHkgPD0gci55MSAmJiB6ID49IHIuejAgJiYgeiA8PSByLnoxKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVycmFpbkNvbHVtbiB7XG4gIHg6IG51bWJlcjtcbiAgejogbnVtYmVyO1xuICAvKiogRXhwb3NlZCB0b3AgZmFjZSBvZiB0aGUgc29saWQgY29sdW1uOyB0aGUgZmlyc3QgYWlyIGNlbGwgYWJvdmUgaXQuICovXG4gIHN1cmZhY2VZOiBudW1iZXI7XG4gIC8qKiBUaGUgaGlnaGVzdCBzb2xpZCB2b3hlbCwgb3IgWV9NSU4gLSAxIGlmIHRoZSBjb2x1bW4gaGFzIG5vIHNvbGlkLiAqL1xuICB0b3BTb2xpZFk6IG51bWJlcjtcbiAgdG9wTWF0ZXJpYWw6IE1hdElkO1xuICBzb2xpZDogYm9vbGVhbjtcbiAgLyoqIFdhdGVyIGFib3ZlIHRoZSBzb2xpZCBzdXJmYWNlLCB1cCB0byBzZWEgbGV2ZWwuIDAgb24gZHJ5IGxhbmQuICovXG4gIHdhdGVyRGVwdGg6IG51bWJlcjtcbiAgdW5kZXJ3YXRlcjogYm9vbGVhbjtcbiAgLyoqIExhcmdlc3QgNC1uZWlnaGJvdXIgc3VyZmFjZSBzdGVwIGluIG1ldHJlcyAoMSA9IGEgc2luZ2xlIHZveGVsIHJpc2VyKS4gKi9cbiAgc2xvcGU6IG51bWJlcjtcbiAgLyoqIEZyZWUgYWlyIGNlbGxzIGFib3ZlIHRoZSBzdXJmYWNlLCBjYXBwZWQgYXQgQ0xFQVJBTkNFX1BST0JFLiAqL1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IENMRUFSQU5DRV9QUk9CRSA9IDg7XG5cbmZ1bmN0aW9uIHN1cmZhY2VBdFNhZmUod29ybGQ6IFdvcmxkLCB4OiBudW1iZXIsIHo6IG51bWJlciwgZmFsbGJhY2s6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICh4IDwgLUhBTEYgfHwgeiA8IC1IQUxGIHx8IHggPj0gSEFMRiB8fCB6ID49IEhBTEYpIHJldHVybiBmYWxsYmFjaztcbiAgcmV0dXJuIHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG59XG5cbi8qKiBXYXRlciBkZXB0aCB0aGF0IHJlc3BlY3RzIGEgZHJ5IHBpdCBiZWxvdyBzZWEgbGV2ZWwgKHVubGlrZSBoZWlnaHQgYWxvbmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgeCwgeik7XG4gIGlmIChzdXJmYWNlID49IFNFQV9MRVZFTCkgcmV0dXJuIDA7XG4gIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgU0VBX0xFVkVMIC0gMSwgeikgIT09IE1BVC5XQVRFUikgcmV0dXJuIDA7XG4gIHJldHVybiBTRUFfTEVWRUwgLSBzdXJmYWNlO1xufVxuXG4vKiogVHJ1ZSB3aGVuIGBoZWlnaHRgIGFpciBjZWxscyBhYm92ZSB0aGUgc3VyZmFjZSBhcmUgZnJlZSBvZiBzb2xpZCBvciB3YXRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGVhcmFuY2VBdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBzdXJmYWNlID0gc3VyZmFjZUF0KHdvcmxkLCB4LCB6KTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBoZWlnaHQ7IGkrKykge1xuICAgIGlmIChnZXRWb3hlbCh3b3JsZCwgeCwgc3VyZmFjZSArIGksIHopICE9PSBNQVQuQUlSKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2x1bW5BdCh3b3JsZDogV29ybGQsIHg6IG51bWJlciwgejogbnVtYmVyKTogVGVycmFpbkNvbHVtbiB7XG4gIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICBjb25zdCBzdXJmYWNlWSA9IHN1cmZhY2VBdCh3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3QgdG9wTWF0ZXJpYWwgPSB0b3BNYXRlcmlhbEF0V29ybGQod29ybGQsIGN4LCBjeik7XG4gIGNvbnN0IHNvbGlkID0gc3VyZmFjZVkgPiBZX01JTiAmJiBpc1NvbGlkKHRvcE1hdGVyaWFsKTtcbiAgY29uc3Qgd2F0ZXJEZXB0aCA9IHdhdGVyRGVwdGhBdENvbHVtbih3b3JsZCwgY3gsIGN6KTtcbiAgY29uc3Qgc2xvcGUgPSBNYXRoLm1heChcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4IC0gMSwgY3osIHN1cmZhY2VZKSksXG4gICAgTWF0aC5hYnMoc3VyZmFjZVkgLSBzdXJmYWNlQXRTYWZlKHdvcmxkLCBjeCArIDEsIGN6LCBzdXJmYWNlWSkpLFxuICAgIE1hdGguYWJzKHN1cmZhY2VZIC0gc3VyZmFjZUF0U2FmZSh3b3JsZCwgY3gsIGN6IC0gMSwgc3VyZmFjZVkpKSxcbiAgICBNYXRoLmFicyhzdXJmYWNlWSAtIHN1cmZhY2VBdFNhZmUod29ybGQsIGN4LCBjeiArIDEsIHN1cmZhY2VZKSksXG4gICk7XG4gIGxldCBjbGVhcmFuY2UgPSAwO1xuICB3aGlsZSAoY2xlYXJhbmNlIDwgQ0xFQVJBTkNFX1BST0JFICYmIGdldFZveGVsKHdvcmxkLCBjeCwgc3VyZmFjZVkgKyBjbGVhcmFuY2UsIGN6KSA9PT0gTUFULkFJUikge1xuICAgIGNsZWFyYW5jZSsrO1xuICB9XG4gIHJldHVybiB7XG4gICAgeDogY3gsIHo6IGN6LCBzdXJmYWNlWSwgdG9wU29saWRZOiBzdXJmYWNlWSAtIDEsIHRvcE1hdGVyaWFsLFxuICAgIHNvbGlkLCB3YXRlckRlcHRoLCB1bmRlcndhdGVyOiB3YXRlckRlcHRoID4gMCwgc2xvcGUsIGNsZWFyYW5jZSxcbiAgfTtcbn1cblxuLy8gRW50aXR5IGZvb3RwcmludHMgYXJlIGRlbGliZXJhdGVseSBleHBsaWNpdC4gQSB0cmVlIG9jY3VwaWVzIG1vcmUgc2l0ZSB0aGFuXG4vLyBpdHMgdHJ1bms7IGEgcGViYmxlIG9jY3VwaWVzIGxlc3MgdGhhbiBhIGJvdWxkZXIuIFRoZXNlIGFyZSBzaW11bGF0aW9uXG4vLyBjbGVhcmFuY2UgcmFkaWksIG5vdCByZW5kZXIgYm91bmRzLlxuZXhwb3J0IGNvbnN0IE9CU1RSVUNUSU9OX1JBRElVUzogUmVjb3JkPEVudGl0eUtpbmQsIG51bWJlcj4gPSB7XG4gIHN0eWxfdHJlZV9zcGlyZTogMS41LFxuICBzdHlsX3RyZWVfdGFibGU6IDEuOCxcbiAgc3R5bF90cmVlX2NsdXN0ZXI6IDEuOSxcbiAgc3R5bF90cmVlX2Jsb3Nzb206IDEuNixcbiAgc3R5bF9zaHJ1YjogMC42LFxuICBzdHlsX3JvY2tfc21hbGw6IDAuNixcbiAgc3R5bF9yb2NrX21lZGl1bTogMS4wLFxuICBzdHlsX3JvY2tfbGFyZ2U6IDEuNixcbiAgc3R5bF9vcmU6IDAuOSxcbiAgc3R5bF9jYWlybjogMC44LFxuICB3YXlzdG9uZTogMS40LFxuICBtYXJrZXI6IDAuNSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgT2JzdHJ1Y3Rpb24ge1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgcmFkaXVzOiBudW1iZXI7XG4gIC8qKiBGb290cHJpbnQgY2VsbHMgb3ZlcmxhcHBlZCBieSB0aGlzIGVudGl0eS4gKi9cbiAgY2VsbHM6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZW50aXR5Q2h1bmtzRm9yUmVjdCh3b3JsZDogV29ybGQsIHJlY3Q6IFJlY3QpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBjeDAgPSB3b3JsZFRvQ2h1bmtYKHIueDApLCBjeDEgPSB3b3JsZFRvQ2h1bmtYKHIueDEpO1xuICBjb25zdCBjejAgPSB3b3JsZFRvQ2h1bmtaKHIuejApLCBjejEgPSB3b3JsZFRvQ2h1bmtaKHIuejEpO1xuICBmb3IgKGxldCBjeiA9IGN6MDsgY3ogPD0gY3oxOyBjeisrKSB7XG4gICAgZm9yIChsZXQgY3ggPSBjeDA7IGN4IDw9IGN4MTsgY3grKykga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICB9XG4gIHJldHVybiBrZXlzO1xufVxuXG4vKiogRW50aXRpZXMgd2hvc2Ugc2ltdWxhdGlvbiBmb290cHJpbnQgb3ZlcmxhcHMgdGhlIHJlY3QuICovXG5leHBvcnQgZnVuY3Rpb24gb2JzdHJ1Y3Rpb25zSW4od29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0KTogT2JzdHJ1Y3Rpb25bXSB7XG4gIGNvbnN0IHIgPSBub3JtYWxpemVSZWN0KHJlY3QpO1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IG91dDogT2JzdHJ1Y3Rpb25bXSA9IFtdO1xuICBmb3IgKGNvbnN0IGtleSBvZiBlbnRpdHlDaHVua3NGb3JSZWN0KHdvcmxkLCByKSkge1xuICAgIGNvbnN0IGlkcyA9IHdvcmxkLmVudGl0eUNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWlkcykgY29udGludWU7XG4gICAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICAgIGlmIChzZWVuLmhhcyhpZCkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgICBpZiAoIWUpIGNvbnRpbnVlO1xuICAgICAgc2Vlbi5hZGQoaWQpO1xuICAgICAgY29uc3QgcmFkaXVzID0gT0JTVFJVQ1RJT05fUkFESVVTW2Uua2luZF0gPz8gMTtcbiAgICAgIGxldCBjZWxscyA9IDA7XG4gICAgICBjb25zdCBleDAgPSBNYXRoLm1heChyLngwLCBNYXRoLmZsb29yKGUueCAtIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXgxID0gTWF0aC5taW4oci54MSwgTWF0aC5jZWlsKGUueCArIHJhZGl1cyAtIDAuNSkpO1xuICAgICAgY29uc3QgZXowID0gTWF0aC5tYXgoci56MCwgTWF0aC5mbG9vcihlLnogLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MSA9IE1hdGgubWluKHIuejEsIE1hdGguY2VpbChlLnogKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGZvciAobGV0IHogPSBlejA7IHogPD0gZXoxOyB6KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IGV4MDsgeCA8PSBleDE7IHgrKykge1xuICAgICAgICAgIGlmIChNYXRoLmh5cG90KGUueCAtICh4ICsgMC41KSwgZS56IC0gKHogKyAwLjUpKSA8PSByYWRpdXMpIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjZWxscyA+IDApIHtcbiAgICAgICAgb3V0LnB1c2goeyBlbnRpdHlJZDogZS5pZCwga2luZDogZS5raW5kLCB4OiBlLngsIHo6IGUueiwgcmFkaXVzLCBjZWxscyB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgb3V0LnNvcnQoKGEsIGIpID0+IChhLmVudGl0eUlkIDwgYi5lbnRpdHlJZCA/IC0xIDogYS5lbnRpdHlJZCA+IGIuZW50aXR5SWQgPyAxIDogMCkpO1xuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFyZWFTdGF0cyB7XG4gIHJlY3Q6IFJlY3Q7XG4gIGNvbHVtbnM6IG51bWJlcjtcbiAgbWluWTogbnVtYmVyO1xuICBtYXhZOiBudW1iZXI7XG4gIG1lYW5ZOiBudW1iZXI7XG4gIHJlbGllZjogbnVtYmVyO1xuICBtYXhTdGVwOiBudW1iZXI7XG4gIHdhdGVyQ29sdW1uczogbnVtYmVyO1xuICBzdG9uZUNvbHVtbnM6IG51bWJlcjtcbiAgbWF0ZXJpYWxzOiBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+O1xuICBvYnN0cnVjdGlvbnM6IE9ic3RydWN0aW9uW107XG4gIG9ic3RydWN0ZWRDb2x1bW5zOiBudW1iZXI7XG4gIC8qKiBDdXQvZmlsbCByZWxhdGl2ZSB0byBmbG9vclkgd2hlbiBzdXBwbGllZCwgb3RoZXJ3aXNlIDAuICovXG4gIGZsb29yWTogbnVtYmVyIHwgbnVsbDtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdXBwb3J0U3VtbWFyeSB7XG4gIHRvdGFsOiBudW1iZXI7XG4gIGxldmVsOiBudW1iZXI7XG4gIGN1dDogbnVtYmVyO1xuICBmaWxsOiBudW1iZXI7XG4gIHdhdGVyOiBudW1iZXI7XG4gIC8qKiBGaWxsIGRlZXBlciB0aGFuIDggbTsgYSB2YWxpZGF0b3IgbWF5IHJlamVjdCB0aGVzZSBhcyB1bnN1cHBvcnRlZC4gKi9cbiAgZGVlcEZpbGw6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGb290cHJpbnRRdWVyeSB7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBzdGF0czogQXJlYVN0YXRzO1xuICBzdXBwb3J0OiBTdXBwb3J0U3VtbWFyeTtcbiAgb2JzdHJ1Y3Rpb25zOiBPYnN0cnVjdGlvbltdO1xuICAvKiogQ2VsbHMgaW4gdGhlIGJ1aWxkaW5nIHZvbHVtZSBhYm92ZSB0aGUgcHJlcGFyZWQgZmxvb3IgdGhhdCBhcmUgbm90IGFpci4gKi9cbiAgb3ZlcmhhbmdDZWxsczogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyBtYXRlcmlhbDogTWF0SWQgfT47XG59XG5cbi8qKlxuICogQ2FjaGVkIHF1ZXJ5IGNvbnRleHQuIENhY2hlcyBhcmUga2V5ZWQgb24gd29ybGQucmV2aXNpb246IGEgdm94ZWwgb3IgZW50aXR5XG4gKiBlZGl0IGludmFsaWRhdGVzIHRoZW0sIHdoaWxlIG1lc2gvbmF2IHJlYnVpbGRzIGRvIG5vdC4gVXNlIG9uZSBjb250ZXh0IGZvciBhXG4gKiBzaXRlIHNlYXJjaCBvciBhIGZvb3RwcmludCBldmFsdWF0aW9uLCB0aGVuIGRpc2NhcmQgaXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXJyYWluUXVlcnkge1xuICBwcml2YXRlIGNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFRlcnJhaW5Db2x1bW4+KCk7XG4gIHByaXZhdGUgb2JzdHJ1Y3Rpb25DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBPYnN0cnVjdGlvbltdPigpO1xuICBwcml2YXRlIHJldmlzaW9uOiBudW1iZXI7XG5cbiAgY29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHdvcmxkOiBXb3JsZCkge1xuICAgIHRoaXMucmV2aXNpb24gPSB3b3JsZC5yZXZpc2lvbjtcbiAgfVxuXG4gIHByaXZhdGUgc3luYygpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5yZXZpc2lvbiAhPT0gdGhpcy53b3JsZC5yZXZpc2lvbikge1xuICAgICAgdGhpcy5jYWNoZS5jbGVhcigpO1xuICAgICAgdGhpcy5vYnN0cnVjdGlvbkNhY2hlLmNsZWFyKCk7XG4gICAgICB0aGlzLnJldmlzaW9uID0gdGhpcy53b3JsZC5yZXZpc2lvbjtcbiAgICB9XG4gIH1cblxuICAvKiogQ2FjaGVkIGVudGl0eSBvYnN0cnVjdGlvbnMgZm9yIG9uZSBmb290cHJpbnQuICovXG4gIG9ic3RydWN0aW9uc0ZvcihyZWN0OiBSZWN0KTogT2JzdHJ1Y3Rpb25bXSB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgY29uc3Qga2V5ID0gYCR7ci54MH0sJHtyLnowfSwke3IueDF9LCR7ci56MX1gO1xuICAgIGxldCBsaXN0ID0gdGhpcy5vYnN0cnVjdGlvbkNhY2hlLmdldChrZXkpO1xuICAgIGlmICghbGlzdCkge1xuICAgICAgbGlzdCA9IG9ic3RydWN0aW9uc0luKHRoaXMud29ybGQsIHIpO1xuICAgICAgdGhpcy5vYnN0cnVjdGlvbkNhY2hlLnNldChrZXksIGxpc3QpO1xuICAgIH1cbiAgICByZXR1cm4gbGlzdDtcbiAgfVxuXG4gIGNvbHVtbih4OiBudW1iZXIsIHo6IG51bWJlcik6IFRlcnJhaW5Db2x1bW4ge1xuICAgIHRoaXMuc3luYygpO1xuICAgIGNvbnN0IGN4ID0gTWF0aC5mbG9vcih4KSwgY3ogPSBNYXRoLmZsb29yKHopO1xuICAgIGNvbnN0IGtleSA9IGAke2N4fSwke2N6fWA7XG4gICAgbGV0IGNvbCA9IHRoaXMuY2FjaGUuZ2V0KGtleSk7XG4gICAgaWYgKCFjb2wpIHtcbiAgICAgIGNvbCA9IGNvbHVtbkF0KHRoaXMud29ybGQsIGN4LCBjeik7XG4gICAgICB0aGlzLmNhY2hlLnNldChrZXksIGNvbCk7XG4gICAgfVxuICAgIHJldHVybiBjb2w7XG4gIH1cblxuICBhcmVhKHJlY3Q6IFJlY3QsIGZsb29yWT86IG51bWJlcik6IEFyZWFTdGF0cyB7XG4gICAgdGhpcy5zeW5jKCk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgbGV0IG1pblkgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gICAgbGV0IG1heFkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gICAgbGV0IHN1bSA9IDA7XG4gICAgbGV0IG1heFN0ZXAgPSAwO1xuICAgIGxldCB3YXRlckNvbHVtbnMgPSAwO1xuICAgIGxldCBzdG9uZUNvbHVtbnMgPSAwO1xuICAgIGxldCBjdXRWb2x1bWUgPSAwO1xuICAgIGxldCBmaWxsVm9sdW1lID0gMDtcbiAgICBsZXQgbWF4Q3V0ID0gMDtcbiAgICBsZXQgbWF4RmlsbCA9IDA7XG4gICAgY29uc3QgbWF0ZXJpYWxzOiBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+ID0ge307XG5cbiAgICBmb3IgKGxldCB6ID0gci56MDsgeiA8PSByLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByLngwOyB4IDw9IHIueDE7IHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSB0aGlzLmNvbHVtbih4LCB6KTtcbiAgICAgICAgbWluWSA9IE1hdGgubWluKG1pblksIGNvbC5zdXJmYWNlWSk7XG4gICAgICAgIG1heFkgPSBNYXRoLm1heChtYXhZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBzdW0gKz0gY29sLnN1cmZhY2VZO1xuICAgICAgICBtYXhTdGVwID0gTWF0aC5tYXgobWF4U3RlcCwgY29sLnNsb3BlKTtcbiAgICAgICAgaWYgKGNvbC53YXRlckRlcHRoID4gMCkgd2F0ZXJDb2x1bW5zKys7XG4gICAgICAgIGlmIChjb2wudG9wTWF0ZXJpYWwgPT09IE1BVC5TVE9ORSkgc3RvbmVDb2x1bW5zKys7XG4gICAgICAgIG1hdGVyaWFsc1tjb2wudG9wTWF0ZXJpYWxdID0gKG1hdGVyaWFsc1tjb2wudG9wTWF0ZXJpYWxdID8/IDApICsgMTtcbiAgICAgICAgaWYgKGZsb29yWSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgY29uc3QgZHkgPSBjb2wuc3VyZmFjZVkgLSBmbG9vclk7XG4gICAgICAgICAgaWYgKGR5ID4gMCkge1xuICAgICAgICAgICAgY3V0Vm9sdW1lICs9IGR5O1xuICAgICAgICAgICAgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkeSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChkeSA8IDApIHtcbiAgICAgICAgICAgIGZpbGxWb2x1bWUgKz0gLWR5O1xuICAgICAgICAgICAgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIC1keSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgb2JzdHJ1Y3Rpb25zID0gdGhpcy5vYnN0cnVjdGlvbnNGb3Iocik7XG4gICAgY29uc3Qgb2JzdHJ1Y3RlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3QgbyBvZiBvYnN0cnVjdGlvbnMpIHtcbiAgICAgIGNvbnN0IHJhZGl1cyA9IG8ucmFkaXVzO1xuICAgICAgY29uc3QgZXgwID0gTWF0aC5tYXgoci54MCwgTWF0aC5mbG9vcihvLnggLSByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV4MSA9IE1hdGgubWluKHIueDEsIE1hdGguY2VpbChvLnggKyByYWRpdXMgLSAwLjUpKTtcbiAgICAgIGNvbnN0IGV6MCA9IE1hdGgubWF4KHIuejAsIE1hdGguZmxvb3Ioby56IC0gcmFkaXVzIC0gMC41KSk7XG4gICAgICBjb25zdCBlejEgPSBNYXRoLm1pbihyLnoxLCBNYXRoLmNlaWwoby56ICsgcmFkaXVzIC0gMC41KSk7XG4gICAgICBmb3IgKGxldCB6ID0gZXowOyB6IDw9IGV6MTsgeisrKSB7XG4gICAgICAgIGZvciAobGV0IHggPSBleDA7IHggPD0gZXgxOyB4KyspIHtcbiAgICAgICAgICBpZiAoTWF0aC5oeXBvdChvLnggLSAoeCArIDAuNSksIG8ueiAtICh6ICsgMC41KSkgPD0gcmFkaXVzKSBvYnN0cnVjdGVkLmFkZChgJHt4fSwke3p9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBjb2x1bW5zID0gKHIueDEgLSByLngwICsgMSkgKiAoci56MSAtIHIuejAgKyAxKTtcbiAgICByZXR1cm4ge1xuICAgICAgcmVjdDogcixcbiAgICAgIGNvbHVtbnMsXG4gICAgICBtaW5ZLCBtYXhZLFxuICAgICAgbWVhblk6IE1hdGgucm91bmQoKHN1bSAvIGNvbHVtbnMpICogMTAwMCkgLyAxMDAwLFxuICAgICAgcmVsaWVmOiBtYXhZIC0gbWluWSxcbiAgICAgIG1heFN0ZXAsXG4gICAgICB3YXRlckNvbHVtbnMsXG4gICAgICBzdG9uZUNvbHVtbnMsXG4gICAgICBtYXRlcmlhbHMsXG4gICAgICBvYnN0cnVjdGlvbnMsXG4gICAgICBvYnN0cnVjdGVkQ29sdW1uczogb2JzdHJ1Y3RlZC5zaXplLFxuICAgICAgZmxvb3JZOiBmbG9vclkgPz8gbnVsbCxcbiAgICAgIGN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQsXG4gICAgICBtYXhGaWxsLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogRXZhbHVhdGUgYSBjb21wbGV0ZSBidWlsZGluZyBmb290cHJpbnQuIGBmbG9vcllgIGlzIHRoZSBwcmVwYXJlZCB3YWxraW5nXG4gICAqIGZsb29yOiB0ZXJyYWluIGFib3ZlIGl0IGlzIGN1dCwgdGVycmFpbiBiZWxvdyBpdCBpcyBmaWxsZWQuIFRoZSByZXN1bHQgaXNcbiAgICogcmF3IHNpdGUgZGF0YTsgY29uc3RydWN0aW9uIHJ1bGVzIGxpdmUgaW4gY29uc3RydWN0aW9uLnRzLlxuICAgKi9cbiAgZm9vdHByaW50KHJlY3Q6IFJlY3QsIGZsb29yWTogbnVtYmVyKTogRm9vdHByaW50UXVlcnkge1xuICAgIGNvbnN0IHN0YXRzID0gdGhpcy5hcmVhKHJlY3QsIGZsb29yWSk7XG4gICAgY29uc3QgciA9IG5vcm1hbGl6ZVJlY3QocmVjdCk7XG4gICAgY29uc3Qgc3VwcG9ydDogU3VwcG9ydFN1bW1hcnkgPSB7XG4gICAgICB0b3RhbDogc3RhdHMuY29sdW1ucywgbGV2ZWw6IDAsIGN1dDogMCwgZmlsbDogMCwgd2F0ZXI6IDAsIGRlZXBGaWxsOiAwLFxuICAgICAgbWF4Q3V0OiAwLCBtYXhGaWxsOiAwLCBjdXRWb2x1bWU6IDAsIGZpbGxWb2x1bWU6IDAsXG4gICAgfTtcbiAgICBjb25zdCBvdmVyaGFuZ0NlbGxzOiBGb290cHJpbnRRdWVyeVsnb3ZlcmhhbmdDZWxscyddID0gW107XG5cbiAgICBmb3IgKGxldCB6ID0gci56MDsgeiA8PSByLnoxOyB6KyspIHtcbiAgICAgIGZvciAobGV0IHggPSByLngwOyB4IDw9IHIueDE7IHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSB0aGlzLmNvbHVtbih4LCB6KTtcbiAgICAgICAgY29uc3QgZHkgPSBjb2wuc3VyZmFjZVkgLSBmbG9vclk7XG4gICAgICAgIGlmIChkeSA+IDApIHtcbiAgICAgICAgICBzdXBwb3J0LmN1dCsrO1xuICAgICAgICAgIHN1cHBvcnQuY3V0Vm9sdW1lICs9IGR5O1xuICAgICAgICAgIHN1cHBvcnQubWF4Q3V0ID0gTWF0aC5tYXgoc3VwcG9ydC5tYXhDdXQsIGR5KTtcbiAgICAgICAgfSBlbHNlIGlmIChkeSA8IDApIHtcbiAgICAgICAgICBzdXBwb3J0LmZpbGwrKztcbiAgICAgICAgICBzdXBwb3J0LmZpbGxWb2x1bWUgKz0gLWR5O1xuICAgICAgICAgIHN1cHBvcnQubWF4RmlsbCA9IE1hdGgubWF4KHN1cHBvcnQubWF4RmlsbCwgLWR5KTtcbiAgICAgICAgICBpZiAoLWR5ID4gOCkgc3VwcG9ydC5kZWVwRmlsbCsrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN1cHBvcnQubGV2ZWwrKztcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29sLndhdGVyRGVwdGggPiAwKSBzdXBwb3J0LndhdGVyKys7XG5cbiAgICAgICAgLy8gQW4gb3ZlcmhhbmcgaXMgdGVycmFpbiBhYm92ZSB0aGUgZmxvb3IgdGhhdCBzdXJ2aXZlcyB0aGUgY3V0IHBsYW5lLlxuICAgICAgICAvLyBGb3IgYSBjb2x1bW4gYmVsb3cgdGhlIGZsb29yLCBpdHMgc29saWQgYm9keSBpcyBmaWxsLCBub3Qgb3ZlcmhhbmcuXG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gTWF0aC5tYXgoZmxvb3JZLCBjb2wuc3VyZmFjZVkpO1xuICAgICAgICBmb3IgKGxldCB5ID0gc3RhcnQ7IHkgPCBzdGFydCArIDQ7IHkrKykge1xuICAgICAgICAgIGNvbnN0IG0gPSBnZXRWb3hlbCh0aGlzLndvcmxkLCB4LCB5LCB6KSBhcyBNYXRJZDtcbiAgICAgICAgICBpZiAobSAhPT0gTUFULkFJUikgb3ZlcmhhbmdDZWxscy5wdXNoKHsgeCwgeSwgeiwgbWF0ZXJpYWw6IG0gfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4geyByZWN0OiByLCBmbG9vclksIHN0YXRzLCBzdXBwb3J0LCBvYnN0cnVjdGlvbnM6IHN0YXRzLm9ic3RydWN0aW9ucywgb3ZlcmhhbmdDZWxscyB9O1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0gbW92ZW1lbnQgY29udHJhY3QgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBXYWxrUGFyYW1zIHtcbiAgbWF4U3RlcFVwOiBudW1iZXI7XG4gIG1heFN0ZXBEb3duOiBudW1iZXI7XG4gIG1heFdhdGVyRGVwdGg6IG51bWJlcjtcbiAgLyoqIE1heGltdW0gYWRqYWNlbnQgc3VyZmFjZSBzdGVwOyAxLjAgaXMgYSA0NSBkZWdyZWUgdm94ZWwgcmlzZXIuICovXG4gIG1heFNsb3BlOiBudW1iZXI7XG4gIGNsZWFyYW5jZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9XQUxLOiBXYWxrUGFyYW1zID0ge1xuICBtYXhTdGVwVXA6IDEuMCxcbiAgbWF4U3RlcERvd246IDEuNSxcbiAgbWF4V2F0ZXJEZXB0aDogMC40LFxuICBtYXhTbG9wZTogMS4wLFxuICBjbGVhcmFuY2U6IDIuMCxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2Fsa1Jlc3VsdCB7XG4gIG9rOiBib29sZWFuO1xuICByZWFzb246ICdvaycgfCAnbm90X2FkamFjZW50JyB8ICdzdGVwX3VwJyB8ICdmYWxsJyB8ICd3YXRlcicgfCAnc2xvcGUnIHwgJ2NsZWFyYW5jZSc7XG4gIHN0ZXA6IG51bWJlcjtcbiAgd2F0ZXJEZXB0aDogbnVtYmVyO1xufVxuXG4vKiogRXZhbHVhdGUgb25lIGdyaWQgc3RlcC4gUGF0aHMgYXJlIHZhbGlkYXRlZCB3aXRoIHRoZSBzYW1lIGNvbnRyYWN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhbGtTdGVwKFxuICB3b3JsZDogV29ybGQsIGZyb21YOiBudW1iZXIsIGZyb21aOiBudW1iZXIsIHRvWDogbnVtYmVyLCB0b1o6IG51bWJlcixcbiAgcGFyYW1zOiBXYWxrUGFyYW1zID0gREVGQVVMVF9XQUxLLFxuKTogV2Fsa1Jlc3VsdCB7XG4gIGNvbnN0IGR4ID0gTWF0aC5hYnMoTWF0aC5mbG9vcih0b1gpIC0gTWF0aC5mbG9vcihmcm9tWCkpO1xuICBjb25zdCBkeiA9IE1hdGguYWJzKE1hdGguZmxvb3IodG9aKSAtIE1hdGguZmxvb3IoZnJvbVopKTtcbiAgaWYgKGR4ICsgZHogIT09IDEpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ25vdF9hZGphY2VudCcsIHN0ZXA6IDAsIHdhdGVyRGVwdGg6IDAgfTtcbiAgfVxuICBjb25zdCBmcm9tID0gY29sdW1uQXQod29ybGQsIGZyb21YLCBmcm9tWik7XG4gIGNvbnN0IHRvID0gY29sdW1uQXQod29ybGQsIHRvWCwgdG9aKTtcbiAgY29uc3Qgc3RlcCA9IHRvLnN1cmZhY2VZIC0gZnJvbS5zdXJmYWNlWTtcbiAgaWYgKHN0ZXAgPiBwYXJhbXMubWF4U3RlcFVwKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3N0ZXBfdXAnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICgtc3RlcCA+IHBhcmFtcy5tYXhTdGVwRG93bikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdmYWxsJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAodG8ud2F0ZXJEZXB0aCA+IHBhcmFtcy5tYXhXYXRlckRlcHRoKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3dhdGVyJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICBpZiAodG8uc2xvcGUgPiBwYXJhbXMubWF4U2xvcGUpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc2xvcGUnLCBzdGVwLCB3YXRlckRlcHRoOiB0by53YXRlckRlcHRoIH07XG4gIGlmICghY2xlYXJhbmNlQXQod29ybGQsIHRvWCwgdG9aLCBwYXJhbXMuY2xlYXJhbmNlKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnY2xlYXJhbmNlJywgc3RlcCwgd2F0ZXJEZXB0aDogdG8ud2F0ZXJEZXB0aCB9O1xuICB9XG4gIHJldHVybiB7IG9rOiB0cnVlLCByZWFzb246ICdvaycsIHN0ZXAsIHdhdGVyRGVwdGg6IHRvLndhdGVyRGVwdGggfTtcbn1cblxuLyoqIEVmZmVjdGl2ZSBncmFkZSBvZiBhIHN0cmFpZ2h0IHBhdGggc2VnbWVudCwgdXNlZCBieSBwYXRoIHZhbGlkYXRpb24uICovXG5leHBvcnQgZnVuY3Rpb24gZWZmZWN0aXZlR3JhZGUod29ybGQ6IFdvcmxkLCB4MDogbnVtYmVyLCB6MDogbnVtYmVyLCB4MTogbnVtYmVyLCB6MTogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgYSA9IGNvbHVtbkF0KHdvcmxkLCB4MCwgejApO1xuICBjb25zdCBiID0gY29sdW1uQXQod29ybGQsIHgxLCB6MSk7XG4gIGNvbnN0IHJ1biA9IE1hdGguaHlwb3QoeDEgLSB4MCwgejEgLSB6MCk7XG4gIGlmIChydW4gPT09IDApIHJldHVybiBNYXRoLmFicyhiLnN1cmZhY2VZIC0gYS5zdXJmYWNlWSk7XG4gIHJldHVybiBNYXRoLmFicyhiLnN1cmZhY2VZIC0gYS5zdXJmYWNlWSkgLyBydW47XG59XG4iLCAiLy8gQ2Fub25pY2FsIHN0YXRlIGhhc2hpbmcgXHUyMDE0IHB1cmUgc2ltdWxhdGlvbiwgbm8gdGhyZWUuanMgaW1wb3J0cy5cbi8vXG4vLyBUaGUgbm8tZmxhdHRlbiBwcm9vZiBjb21wYXJlcyB0aGUgYXV0aG9yaXRhdGl2ZSB2b3hlbCB2b2x1bWUgb3V0c2lkZSB0aGVcbi8vIGNvbXBsZXRlIGF1dGhvcml6ZWQgd29yayBlbnZlbG9wZS4gSXQgZGVsaWJlcmF0ZWx5IGRvZXMgbm90IGhhc2ggY2h1bmtcbi8vIGhlaWdodHMvdG9wTWF0ZXJpYWxzIChkZXJpdmVkIGNhY2hlcyksIG1lc2ggZ2VvbWV0cnksIHN0cmVhbWluZyBzdGF0ZSBvclxuLy8gbmF2aWdhdGlvbiBkYXRhLiBUaG9zZSBhcmUgY2hlY2tlZCBzZXBhcmF0ZWx5IGFzIGRlcml2ZWQgc3RhdGUsIHNvIGEgY2FjaGVcbi8vIG9yIG1lc2ggcmVidWlsZCBjYW4gbmV2ZXIgYmUgbWlzdGFrZW4gZm9yIGEgdGVycmFpbiBtdXRhdGlvbi5cbmltcG9ydCB7XG4gIFdvcmxkLCBZX01JTiwgWV9NQVgsIEhBTEYsIENIVU5LX1NJWkUsIENIVU5LX0FSRUEsXG4gIGVuc3VyZUNodW5rLCB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosIGxvY2FsSW5kZXgsIHlUb0luZGV4LCBpc1NvbGlkLFxuICBFbnRpdHksXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgVm94ZWxSZWdpb24sIGVudmVsb3BlQ29udGFpbnMgfSBmcm9tICcuL3RlcnJhaW4nO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0YXRlSGFzaCB7XG4gIC8qKiAxNiBoZXggY2hhcmFjdGVyczogdHdvIGluZGVwZW5kZW50IDMyLWJpdCBsYW5lcy4gKi9cbiAgaGFzaDogc3RyaW5nO1xuICBjZWxsczogbnVtYmVyO1xuICBleGNsdWRlZENlbGxzOiBudW1iZXI7XG4gIGNodW5rczogbnVtYmVyO1xuICByZWdpb246IFZveGVsUmVnaW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhY2hlTWlzbWF0Y2gge1xuICB4OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgZmllbGQ6ICdoZWlnaHQnIHwgJ21hdGVyaWFsJztcbiAgZXhwZWN0ZWQ6IG51bWJlcjtcbiAgYWN0dWFsOiBudW1iZXI7XG59XG5cbmNsYXNzIEhhc2hlciB7XG4gIHByaXZhdGUgYSA9IDB4ODExYzlkYzU7XG4gIHByaXZhdGUgYiA9IDB4OWUzNzc5Yjk7XG5cbiAgYnl0ZSh2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCB4ID0gdiAmIDB4ZmY7XG4gICAgdGhpcy5hID0gTWF0aC5pbXVsKHRoaXMuYSBeIHgsIDB4MDEwMDAxOTMpO1xuICAgIHRoaXMuYiA9IE1hdGguaW11bCh0aGlzLmIgXiAoeCArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICB0aGlzLmIgXj0gdGhpcy5iID4+PiAxMztcbiAgfVxuXG4gIHUzMih2OiBudW1iZXIpOiB2b2lkIHtcbiAgICBsZXQgbiA9IHYgPj4+IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA0OyBpKyspIHtcbiAgICAgIHRoaXMuYnl0ZShuKTtcbiAgICAgIG4gPj4+PSA4O1xuICAgIH1cbiAgfVxuXG4gIHN0cmluZyhzOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLnUzMihzLmxlbmd0aCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSsrKSB0aGlzLmJ5dGUocy5jaGFyQ29kZUF0KGkpKTtcbiAgfVxuXG4gIGhleCgpOiBzdHJpbmcge1xuICAgIHJldHVybiAodGhpcy5hID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKVxuICAgICAgKyAodGhpcy5iID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXBSZWdpb24ocmVnaW9uOiBWb3hlbFJlZ2lvbik6IFZveGVsUmVnaW9uIHtcbiAgY29uc3QgcjogVm94ZWxSZWdpb24gPSB7XG4gICAgeDA6IE1hdGgubWF4KC1IQUxGLCBNYXRoLmZsb29yKHJlZ2lvbi54MCkpLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgTWF0aC5mbG9vcihyZWdpb24uejApKSxcbiAgICB4MTogTWF0aC5taW4oSEFMRiAtIDEsIE1hdGguZmxvb3IocmVnaW9uLngxKSksXG4gICAgejE6IE1hdGgubWluKEhBTEYgLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi56MSkpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgTWF0aC5mbG9vcihyZWdpb24ueTApKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBNYXRoLmZsb29yKHJlZ2lvbi55MSkpLFxuICB9O1xuICBpZiAoci54MCA+IHIueDEgfHwgci56MCA+IHIuejEgfHwgci55MCA+IHIueTEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYGVtcHR5IHZveGVsIHJlZ2lvbiAke0pTT04uc3RyaW5naWZ5KHJlZ2lvbil9YCk7XG4gIH1cbiAgcmV0dXJuIHI7XG59XG5cbi8qKiBTb3J0IGFuIGVudmVsb3BlIHNvIGl0cyBoYXNoIGlzIGluZGVwZW5kZW50IG9mIHJlY3Qgb3JkZXIuICovXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplRW52ZWxvcGUocmVjdHM6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBWb3hlbFJlZ2lvbltdIHtcbiAgcmV0dXJuIHJlY3RzXG4gICAgLm1hcCgocikgPT4gKHtcbiAgICAgIHgwOiBNYXRoLmZsb29yKHIueDApLCB6MDogTWF0aC5mbG9vcihyLnowKSwgeDE6IE1hdGguZmxvb3Ioci54MSksIHoxOiBNYXRoLmZsb29yKHIuejEpLFxuICAgICAgeTA6IE1hdGguZmxvb3Ioci55MCksIHkxOiBNYXRoLmZsb29yKHIueTEpLFxuICAgIH0pKVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLngwIC0gYi54MCB8fCBhLnowIC0gYi56MCB8fCBhLnkwIC0gYi55MFxuICAgICAgfHwgYS54MSAtIGIueDEgfHwgYS56MSAtIGIuejEgfHwgYS55MSAtIGIueTEpO1xufVxuXG4vKiogTWF0ZXJpYWxpc2UgZXZlcnkgY2h1bmsgdGhhdCBvdmVybGFwcyB0aGUgcmVnaW9uIGFuZCByZXR1cm4gc29ydGVkIGtleXMuICovXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGN4MCA9IHdvcmxkVG9DaHVua1goci54MCksIGN4MSA9IHdvcmxkVG9DaHVua1goci54MSk7XG4gIGNvbnN0IGN6MCA9IHdvcmxkVG9DaHVua1ooci56MCksIGN6MSA9IHdvcmxkVG9DaHVua1ooci56MSk7XG4gIGZvciAobGV0IGN6ID0gY3owOyBjeiA8PSBjejE7IGN6KyspIHtcbiAgICBmb3IgKGxldCBjeCA9IGN4MDsgY3ggPD0gY3gxOyBjeCsrKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGVuc3VyZUNodW5rKHdvcmxkLCBjeCwgY3opO1xuICAgICAgaWYgKCFjaHVuaykgdGhyb3cgbmV3IEVycm9yKGBjaHVuayAke2N4fSwke2N6fSBpcyBvdXRzaWRlIHRoZSB3b3JsZGApO1xuICAgICAga2V5cy5wdXNoKGNodW5rS2V5KGN4LCBjeikpO1xuICAgIH1cbiAgfVxuICBrZXlzLnNvcnQoKTtcbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKlxuICogSGFzaCB0aGUgYXV0aG9yaXRhdGl2ZSBtYXRlcmlhbCBieXRlIG9mIGV2ZXJ5IHZveGVsIGluIGByZWdpb25gLCBleGNsdWRpbmdcbiAqIGV2ZXJ5IHZveGVsIGluc2lkZSBgZXhjbHVkZWAuIFR3byBjYWxscyB3aXRoIHRoZSBzYW1lIHJlZ2lvbiBhbmQgZW52ZWxvcGVcbiAqIGFyZSBkaXJlY3RseSBjb21wYXJhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsUmVnaW9uSGFzaChcbiAgd29ybGQ6IFdvcmxkLFxuICByZWdpb246IFZveGVsUmVnaW9uLFxuICBleGNsdWRlOiByZWFkb25seSBWb3hlbFJlZ2lvbltdID0gW10sXG4pOiBTdGF0ZUhhc2gge1xuICBjb25zdCByID0gY2xhbXBSZWdpb24ocmVnaW9uKTtcbiAgY29uc3QgZW52ZWxvcGUgPSBub3JtYWxpemVFbnZlbG9wZShleGNsdWRlKTtcbiAgY29uc3Qga2V5cyA9IGVuc3VyZVJlZ2lvbkNodW5rcyh3b3JsZCwgcik7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnZveGVsLXN0YXRlOnYxJyk7XG4gIGgudTMyKHIueDApOyBoLnUzMihyLnowKTsgaC51MzIoci54MSk7IGgudTMyKHIuejEpOyBoLnUzMihyLnkwKTsgaC51MzIoci55MSk7XG4gIGgudTMyKGVudmVsb3BlLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgZSBvZiBlbnZlbG9wZSkge1xuICAgIGgudTMyKGUueDApOyBoLnUzMihlLnowKTsgaC51MzIoZS54MSk7IGgudTMyKGUuejEpOyBoLnUzMihlLnkwKTsgaC51MzIoZS55MSk7XG4gIH1cblxuICBsZXQgY2VsbHMgPSAwO1xuICBsZXQgZXhjbHVkZWRDZWxscyA9IDA7XG4gIGNvbnN0IHlpMCA9IHIueTAgLSBZX01JTjtcbiAgY29uc3QgeWkxID0gci55MSAtIFlfTUlOO1xuXG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBjb25zdCBjaHVuayA9IHdvcmxkLmNodW5rcy5nZXQoa2V5KTtcbiAgICBpZiAoIWNodW5rKSB0aHJvdyBuZXcgRXJyb3IoYGNodW5rICR7a2V5fSB3YXMgbm90IGdlbmVyYXRlZGApO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGguc3RyaW5nKCdjaHVuaycpO1xuICAgIGgudTMyKGNodW5rLmN4KTsgaC51MzIoY2h1bmsuY3opO1xuICAgIGZvciAobGV0IHlpID0geWkwOyB5aSA8PSB5aTE7IHlpKyspIHtcbiAgICAgIGNvbnN0IHkgPSBZX01JTiArIHlpO1xuICAgICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgICBjb25zdCB6ID0gb3ogKyBsejtcbiAgICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICAgIGNvbnN0IHggPSBveCArIGx4O1xuICAgICAgICAgIGlmIChlbnZlbG9wZS5sZW5ndGggPiAwICYmIGVudmVsb3BlQ29udGFpbnMoZW52ZWxvcGUsIHgsIHksIHopKSB7XG4gICAgICAgICAgICBleGNsdWRlZENlbGxzKys7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaC5ieXRlKGNodW5rLmRhdGFbbG9jYWxJbmRleChseCwgeWksIGx6KV0pO1xuICAgICAgICAgIGNlbGxzKys7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBoYXNoOiBoLmhleCgpLCBjZWxscywgZXhjbHVkZWRDZWxscywgY2h1bmtzOiBrZXlzLmxlbmd0aCwgcmVnaW9uOiByIH07XG59XG5cbi8qKiBDYW5vbmljYWwgaW52ZW50b3J5IGhhc2g7IGtleSBvcmRlciBjYW5ub3QgYWZmZWN0IHRoZSByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsSW52ZW50b3J5SGFzaCh3b3JsZDogV29ybGQpOiBzdHJpbmcge1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjppbnZlbnRvcnk6djEnKTtcbiAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHdvcmxkLmludmVudG9yeSkuc29ydCgpO1xuICBoLnUzMihrZXlzLmxlbmd0aCk7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBoLnN0cmluZyhrZXkpO1xuICAgIGgudTMyKHdvcmxkLmludmVudG9yeVtrZXldKTtcbiAgfVxuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGludmVudG9yeVNuYXBzaG90KHdvcmxkOiBXb3JsZCk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMod29ybGQuaW52ZW50b3J5KS5zb3J0KCkpIG91dFtrZXldID0gd29ybGQuaW52ZW50b3J5W2tleV07XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGhhc2hFbnRpdHkoaDogSGFzaGVyLCBlOiBFbnRpdHkpOiB2b2lkIHtcbiAgaC5zdHJpbmcoZS5pZCk7XG4gIGguc3RyaW5nKGUua2luZCk7XG4gIGguc3RyaW5nKGUuY2h1bmspO1xuICBoLnUzMihNYXRoLnJvdW5kKGUueCAqIDEwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnkgKiAxMDAwKSk7XG4gIGgudTMyKE1hdGgucm91bmQoZS56ICogMTAwMCkpO1xuICBoLnUzMihNYXRoLnJvdW5kKGUucm90ICogMTAwMDApKTtcbiAgaC51MzIoTWF0aC5yb3VuZChlLnNjYWxlICogMTAwMCkpO1xuICBoLnUzMihlLnZhcmlhbnQpO1xuICBoLnN0cmluZyhlLnJlc291cmNlID8/ICcnKTtcbiAgaC51MzIoZS5yZW1haW5pbmcpO1xuICBoLnUzMihlLmhhcnZlc3RlZCA/IDEgOiAwKTtcbiAgaC51MzIoZS5oYXJ2ZXN0ZWRPbmNlID8gMSA6IDApO1xufVxuXG4vKiogSGFzaCBlbnRpdHkgc3RhdGU7IHdpdGggYSByZWdpb24sIG9ubHkgZW50aXRpZXMgcm9vdGVkIGluc2lkZSBpdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxFbnRpdHlIYXNoKHdvcmxkOiBXb3JsZCwgcmVnaW9uPzogVm94ZWxSZWdpb24pOiBzdHJpbmcge1xuICBsZXQgZW50aXRpZXM6IEVudGl0eVtdO1xuICBpZiAocmVnaW9uKSB7XG4gICAgY29uc3QgciA9IGNsYW1wUmVnaW9uKHJlZ2lvbik7XG4gICAgZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgICBlbnRpdGllcyA9IFsuLi53b3JsZC5lbnRpdGllcy52YWx1ZXMoKV0uZmlsdGVyKFxuICAgICAgKGUpID0+IGUueCA+PSByLngwICYmIGUueCA8IHIueDEgKyAxICYmIGUueiA+PSByLnowICYmIGUueiA8IHIuejEgKyAxLFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgZW50aXRpZXMgPSBbLi4ud29ybGQuZW50aXRpZXMudmFsdWVzKCldO1xuICB9XG4gIGVudGl0aWVzLnNvcnQoKGEsIGIpID0+IChhLmlkIDwgYi5pZCA/IC0xIDogYS5pZCA+IGIuaWQgPyAxIDogMCkpO1xuICBjb25zdCBoID0gbmV3IEhhc2hlcigpO1xuICBoLnN0cmluZygnbTAwMjplbnRpdHktc3RhdGU6djEnKTtcbiAgaC51MzIoZW50aXRpZXMubGVuZ3RoKTtcbiAgZm9yIChjb25zdCBlIG9mIGVudGl0aWVzKSBoYXNoRW50aXR5KGgsIGUpO1xuICByZXR1cm4gaC5oZXgoKTtcbn1cblxuLyoqXG4gKiBDYW5vbmljYWwgaGFzaCBvZiBidWlsdCBzdHJ1Y3R1cmVzLiBMYXlvdXQgbW9kdWxlcyBhbmQgcGFpZCBjb3N0cyBhcmVcbiAqIGF1dGhvcml0YXRpdmUgc2ltdWxhdGlvbiBzdGF0ZTsgcmVuZGVyZXIgbWVzaGVzIGFyZSBub3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5vbmljYWxTdHJ1Y3R1cmVIYXNoKHdvcmxkOiBXb3JsZCk6IHN0cmluZyB7XG4gIGNvbnN0IHN0cnVjdHVyZXMgPSBbLi4ud29ybGQuc3RydWN0dXJlcy52YWx1ZXMoKV1cbiAgICAuc29ydCgoYSwgYikgPT4gKGEuaWQgPCBiLmlkID8gLTEgOiBhLmlkID4gYi5pZCA/IDEgOiAwKSk7XG4gIGNvbnN0IGggPSBuZXcgSGFzaGVyKCk7XG4gIGguc3RyaW5nKCdtMDAyOnN0cnVjdHVyZS1zdGF0ZTp2MScpO1xuICBoLnUzMihzdHJ1Y3R1cmVzLmxlbmd0aCk7XG4gIGZvciAoY29uc3QgcyBvZiBzdHJ1Y3R1cmVzKSB7XG4gICAgaC5zdHJpbmcocy5pZCk7XG4gICAgaC5zdHJpbmcocy5raW5kKTtcbiAgICBoLnN0cmluZyhzLnNpdGVJZCk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnggKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnkgKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnogKiAxMDAwKSk7XG4gICAgaC51MzIoTWF0aC5yb3VuZChzLnJvdCAqIDEwMDAwKSk7XG4gICAgaC51MzIocy5tb2R1bGVzLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCBtIG9mIHMubW9kdWxlcykge1xuICAgICAgaC5zdHJpbmcobS5raW5kKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS54ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLnkgKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0ueiAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQobS53ICogMTAwMCkpO1xuICAgICAgaC51MzIoTWF0aC5yb3VuZChtLmggKiAxMDAwKSk7XG4gICAgICBoLnUzMihNYXRoLnJvdW5kKG0uZCAqIDEwMDApKTtcbiAgICAgIGgudTMyKE1hdGgucm91bmQoKG0ucm90ID8/IDApICogMTAwMDApKTtcbiAgICAgIGguc3RyaW5nKG0udG9uZSA/PyAnJyk7XG4gICAgfVxuICAgIGNvbnN0IGNvc3RLZXlzID0gT2JqZWN0LmtleXMocy5jb3N0KS5zb3J0KCk7XG4gICAgaC51MzIoY29zdEtleXMubGVuZ3RoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBjb3N0S2V5cykge1xuICAgICAgaC5zdHJpbmcoa2V5KTtcbiAgICAgIGgudTMyKHMuY29zdFtrZXkgYXMga2V5b2YgdHlwZW9mIHMuY29zdF0gPz8gMCk7XG4gICAgfVxuICAgIGgudTMyKHMuYnVpbHRSZXZpc2lvbik7XG4gIH1cbiAgcmV0dXJuIGguaGV4KCk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FjaGVIYXNoIHtcbiAgaGFzaDogc3RyaW5nO1xuICBjb2x1bW5zOiBudW1iZXI7XG4gIGNodW5rczogbnVtYmVyO1xufVxuXG4vKiogRGVyaXZlZCBjb2x1bW4tY2FjaGUgaGFzaC4gTm90IGF1dGhvcml0YXRpdmUgdGVycmFpbiBzdGF0ZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXJpdmVkQ2FjaGVIYXNoKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbik6IENhY2hlSGFzaCB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBrZXlzID0gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgY29uc3QgaCA9IG5ldyBIYXNoZXIoKTtcbiAgaC5zdHJpbmcoJ20wMDI6ZGVyaXZlZC1jb2x1bW4tY2FjaGU6djEnKTtcbiAgaC51MzIoci54MCk7IGgudTMyKHIuejApOyBoLnUzMihyLngxKTsgaC51MzIoci56MSk7XG4gIGxldCBjb2x1bW5zID0gMDtcbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghY2h1bmspIHRocm93IG5ldyBFcnJvcihgY2h1bmsgJHtrZXl9IHdhcyBub3QgZ2VuZXJhdGVkYCk7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3QgbHgwID0gTWF0aC5tYXgoMCwgci54MCAtIG94KSwgbHgxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIueDEgLSBveCk7XG4gICAgY29uc3QgbHowID0gTWF0aC5tYXgoMCwgci56MCAtIG96KSwgbHoxID0gTWF0aC5taW4oQ0hVTktfU0laRSAtIDEsIHIuejEgLSBveik7XG4gICAgaC5zdHJpbmcoJ2NodW5rJyk7XG4gICAgaC51MzIoY2h1bmsuY3gpOyBoLnUzMihjaHVuay5jeik7XG4gICAgZm9yIChsZXQgbHogPSBsejA7IGx6IDw9IGx6MTsgbHorKykge1xuICAgICAgZm9yIChsZXQgbHggPSBseDA7IGx4IDw9IGx4MTsgbHgrKykge1xuICAgICAgICBjb25zdCBjb2wgPSBseiAqIENIVU5LX1NJWkUgKyBseDtcbiAgICAgICAgaC51MzIoY2h1bmsuaGVpZ2h0c1tjb2xdKTtcbiAgICAgICAgaC51MzIoY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF0pO1xuICAgICAgICBjb2x1bW5zKys7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiB7IGhhc2g6IGguaGV4KCksIGNvbHVtbnMsIGNodW5rczoga2V5cy5sZW5ndGggfTtcbn1cblxuLyoqXG4gKiBSZWNvbXB1dGUgZXZlcnkgY29sdW1uIGNhY2hlIGZyb20gdGhlIGF1dGhvcml0YXRpdmUgdm94ZWwgZGF0YSBhbmQgcmVwb3J0XG4gKiBtaXNtYXRjaGVzLiBUaGlzIHByb3ZlcyBoZWlnaHRzL3RvcE1hdGVyaWFscyBhcmUgZGVyaXZlZCwgbm90IGEgc2Vjb25kXG4gKiB0ZXJyYWluIHJlcHJlc2VudGF0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hlY2tEZXJpdmVkQ2FjaGVzKHdvcmxkOiBXb3JsZCwgcmVnaW9uOiBWb3hlbFJlZ2lvbiwgbGltaXQgPSA2NCk6IENhY2hlTWlzbWF0Y2hbXSB7XG4gIGNvbnN0IHIgPSBjbGFtcFJlZ2lvbihyZWdpb24pO1xuICBjb25zdCBrZXlzID0gZW5zdXJlUmVnaW9uQ2h1bmtzKHdvcmxkLCByKTtcbiAgY29uc3Qgb3V0OiBDYWNoZU1pc21hdGNoW10gPSBbXTtcbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIGNvbnN0IGNodW5rID0gd29ybGQuY2h1bmtzLmdldChrZXkpO1xuICAgIGlmICghY2h1bmspIGNvbnRpbnVlO1xuICAgIGNvbnN0IG94ID0gY2h1bmtPcmlnaW5YKGNodW5rLmN4KSwgb3ogPSBjaHVua09yaWdpblooY2h1bmsuY3opO1xuICAgIGNvbnN0IGx4MCA9IE1hdGgubWF4KDAsIHIueDAgLSBveCksIGx4MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLngxIC0gb3gpO1xuICAgIGNvbnN0IGx6MCA9IE1hdGgubWF4KDAsIHIuejAgLSBveiksIGx6MSA9IE1hdGgubWluKENIVU5LX1NJWkUgLSAxLCByLnoxIC0gb3opO1xuICAgIGZvciAobGV0IGx6ID0gbHowOyBseiA8PSBsejE7IGx6KyspIHtcbiAgICAgIGZvciAobGV0IGx4ID0gbHgwOyBseCA8PSBseDE7IGx4KyspIHtcbiAgICAgICAgY29uc3QgY29sID0gbHogKiBDSFVOS19TSVpFICsgbHg7XG4gICAgICAgIGxldCB0b3BTb2xpZCA9IFlfTUlOO1xuICAgICAgICBsZXQgdG9wTWF0ID0gY2h1bmsudG9wTWF0ZXJpYWxzW2NvbF07XG4gICAgICAgIGZvciAobGV0IHkgPSBZX01BWCAtIDE7IHkgPj0gWV9NSU47IHktLSkge1xuICAgICAgICAgIGNvbnN0IG0gPSBjaHVuay5kYXRhW2xvY2FsSW5kZXgobHgsIHlUb0luZGV4KHkpLCBseildO1xuICAgICAgICAgIGlmIChpc1NvbGlkKG0pKSB7IHRvcFNvbGlkID0geTsgdG9wTWF0ID0gbTsgYnJlYWs7IH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBleHBlY3RlZEhlaWdodCA9IHRvcFNvbGlkIC0gWV9NSU47XG4gICAgICAgIGlmIChjaHVuay5oZWlnaHRzW2NvbF0gIT09IGV4cGVjdGVkSGVpZ2h0KSB7XG4gICAgICAgICAgb3V0LnB1c2goeyB4OiBveCArIGx4LCB6OiBveiArIGx6LCBmaWVsZDogJ2hlaWdodCcsIGV4cGVjdGVkOiBleHBlY3RlZEhlaWdodCwgYWN0dWFsOiBjaHVuay5oZWlnaHRzW2NvbF0gfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdICE9PSB0b3BNYXQpIHtcbiAgICAgICAgICBvdXQucHVzaCh7IHg6IG94ICsgbHgsIHo6IG96ICsgbHosIGZpZWxkOiAnbWF0ZXJpYWwnLCBleHBlY3RlZDogdG9wTWF0LCBhY3R1YWw6IGNodW5rLnRvcE1hdGVyaWFsc1tjb2xdIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvdXQubGVuZ3RoID49IGxpbWl0KSByZXR1cm4gb3V0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEVkaXRPdXRzaWRlIHtcbiAgY2h1bms6IHN0cmluZztcbiAgaW5kZXg6IG51bWJlcjtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgbWF0ZXJpYWw6IG51bWJlcjtcbn1cblxuLyoqIEV2ZXJ5IHJlY29yZGVkIHZveGVsIGVkaXQgb3V0c2lkZSB0aGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVkaXRzT3V0c2lkZUVudmVsb3BlKHdvcmxkOiBXb3JsZCwgZW52ZWxvcGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10pOiBFZGl0T3V0c2lkZVtdIHtcbiAgY29uc3Qgb3V0OiBFZGl0T3V0c2lkZVtdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgZWRpdHNdIG9mIHdvcmxkLmVkaXRzKSB7XG4gICAgY29uc3QgW2N4LCBjel0gPSBrZXkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKTtcbiAgICBjb25zdCBveCA9IGNodW5rT3JpZ2luWChjeCksIG96ID0gY2h1bmtPcmlnaW5aKGN6KTtcbiAgICBmb3IgKGNvbnN0IFtpbmRleCwgbWF0ZXJpYWxdIG9mIGVkaXRzKSB7XG4gICAgICBjb25zdCBseCA9IGluZGV4ICUgQ0hVTktfU0laRTtcbiAgICAgIGNvbnN0IGx6ID0gTWF0aC5mbG9vcigoaW5kZXggJSBDSFVOS19BUkVBKSAvIENIVU5LX1NJWkUpO1xuICAgICAgY29uc3QgeWkgPSBNYXRoLmZsb29yKGluZGV4IC8gQ0hVTktfQVJFQSk7XG4gICAgICBjb25zdCB4ID0gb3ggKyBseCwgeiA9IG96ICsgbHosIHkgPSBZX01JTiArIHlpO1xuICAgICAgaWYgKCFlbnZlbG9wZUNvbnRhaW5zKGVudmVsb3BlLCB4LCB5LCB6KSkge1xuICAgICAgICBvdXQucHVzaCh7IGNodW5rOiBrZXksIGluZGV4LCB4LCB5LCB6LCBtYXRlcmlhbCB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgb3V0LnNvcnQoKGEsIGIpID0+IGEuY2h1bmsubG9jYWxlQ29tcGFyZShiLmNodW5rKSB8fCBhLmluZGV4IC0gYi5pbmRleCk7XG4gIHJldHVybiBvdXQ7XG59XG5cbi8qKiBOZXcgY2h1bmtzIGdlbmVyYXRlZCBzaW5jZSB0aGUgYmFzZWxpbmUgdGhhdCBkbyBub3Qgb3ZlcmxhcCB0aGUgZW52ZWxvcGUuICovXG5leHBvcnQgZnVuY3Rpb24gbmV3Q2h1bmtzT3V0c2lkZUVudmVsb3BlKFxuICB3b3JsZDogV29ybGQsIGJhc2VsaW5lS2V5czogSXRlcmFibGU8c3RyaW5nPiwgZW52ZWxvcGU6IHJlYWRvbmx5IFZveGVsUmVnaW9uW10sXG4pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IGJhc2VsaW5lID0gbmV3IFNldChiYXNlbGluZUtleXMpO1xuICBjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgY2h1bmtdIG9mIHdvcmxkLmNodW5rcykge1xuICAgIGlmIChiYXNlbGluZS5oYXMoa2V5KSkgY29udGludWU7XG4gICAgY29uc3Qgb3ggPSBjaHVua09yaWdpblgoY2h1bmsuY3gpLCBveiA9IGNodW5rT3JpZ2luWihjaHVuay5jeik7XG4gICAgY29uc3Qgb3ZlcmxhcHMgPSBlbnZlbG9wZS5zb21lKFxuICAgICAgKHIpID0+IG94IDw9IHIueDEgJiYgb3ggKyBDSFVOS19TSVpFIC0gMSA+PSByLngwICYmIG96IDw9IHIuejEgJiYgb3ogKyBDSFVOS19TSVpFIC0gMSA+PSByLnowLFxuICAgICk7XG4gICAgaWYgKCFvdmVybGFwcykgb3V0LnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4gb3V0LnNvcnQoKTtcbn1cblxuLyoqIEFsbCBjaHVuayBrZXlzIGN1cnJlbnRseSBtYXRlcmlhbGlzZWQsIHNvcnRlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaHVua0tleXMod29ybGQ6IFdvcmxkKTogc3RyaW5nW10ge1xuICByZXR1cm4gWy4uLndvcmxkLmNodW5rcy5rZXlzKCldLnNvcnQoKTtcbn1cblxuLyoqIEJvdW5kaW5nIHZveGVsIHJlZ2lvbiBjb3ZlcmluZyBldmVyeSBtYXRlcmlhbGlzZWQgY2h1bmsuICovXG5leHBvcnQgZnVuY3Rpb24gd29ybGRDaHVua1JlZ2lvbih3b3JsZDogV29ybGQpOiBWb3hlbFJlZ2lvbiB7XG4gIGlmICh3b3JsZC5jaHVua3Muc2l6ZSA9PT0gMCkgdGhyb3cgbmV3IEVycm9yKCd3b3JsZCBoYXMgbm8gY2h1bmtzJyk7XG4gIGxldCBtaW5DeCA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgbWF4Q3ggPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGxldCBtaW5DeiA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgbWF4Q3ogPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgY2h1bmsgb2Ygd29ybGQuY2h1bmtzLnZhbHVlcygpKSB7XG4gICAgbWluQ3ggPSBNYXRoLm1pbihtaW5DeCwgY2h1bmsuY3gpOyBtYXhDeCA9IE1hdGgubWF4KG1heEN4LCBjaHVuay5jeCk7XG4gICAgbWluQ3ogPSBNYXRoLm1pbihtaW5DeiwgY2h1bmsuY3opOyBtYXhDeiA9IE1hdGgubWF4KG1heEN6LCBjaHVuay5jeik7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICB4MDogY2h1bmtPcmlnaW5YKG1pbkN4KSxcbiAgICB6MDogY2h1bmtPcmlnaW5aKG1pbkN6KSxcbiAgICB4MTogY2h1bmtPcmlnaW5YKG1heEN4KSArIENIVU5LX1NJWkUgLSAxLFxuICAgIHoxOiBjaHVua09yaWdpbloobWF4Q3opICsgQ0hVTktfU0laRSAtIDEsXG4gICAgeTA6IFlfTUlOLFxuICAgIHkxOiBZX01BWCAtIDEsXG4gIH07XG59XG4iLCAiLy8gTTAwMiBkZXRlcm1pbmlzdGljIGZpeHR1cmUgYW5kIGxpdmUtd29ybGQgbGF5b3V0LlxuLy9cbi8vIFRoZSBmaXh0dXJlIGlzIGEgYm91bmRlZCBzbGljZSBvZiB0aGUgcmVhbCAyMDQ4IG0gd29ybGQgKHNlZWQgMTMzNyksIG5vdCBhXG4vLyBzeW50aGV0aWMgaGVpZ2h0ZmllbGQuIEl0IGNvbnRhaW5zOlxuLy8gICAqIGEgcmVqZWN0ZWQgaG91c2Ugc2l0ZSBvbiBhIDcgbSByaXZlci1iYW5rIHNsb3BlIHdpdGggYSBuYXR1cmFsIGJvdWxkZXI7XG4vLyAgICogYSB2aWFibGUgaG91c2Ugc2hlbGYgMjAgbSBhd2F5IHdpdGggMiBtIHJlbGllZiBhbmQgYSBuYXR1cmFsIGJvdWxkZXIgdG9cbi8vICAgICBjbGVhciBkdXJpbmcgcHJlcGFyYXRpb247XG4vLyAgICogYSAzIG0gZmFybSBzbG9wZSAyNyBtIGZyb20gdGhlIGhvdXNlIHdpdGggYSBuYXR1cmFsIGJsb3Nzb20gdHJlZS5cbi8vXG4vLyBUaGUgc2FtZSBjb29yZGluYXRlcywgcXVlcmllcyBhbmQgdmFsaWRhdG9ycyBhcmUgdXNlZCBieSB0aGUgbGl2ZS13b3JsZFxuLy8gYWNjZXB0YW5jZSB0ZXN0LiBUaGUgb25seSBkaWZmZXJlbmNlIGlzIGhvdyBtYW55IGNodW5rcyBhcmUgbWF0ZXJpYWxpc2VkLlxuaW1wb3J0IHtcbiAgV29ybGQsIGNyZWF0ZVdvcmxkLCBnZW5lcmF0ZVdvcmxkLCBnZW5lcmF0ZUNodW5rLCBwbGFjZUF1dGhvcmVkU2l0ZXMsXG4gIFlfTUlOLCBZX01BWCwgY2h1bmtPcmlnaW5YLCBjaHVua09yaWdpblosXG59IGZyb20gJy4vd29ybGQnO1xuaW1wb3J0IHsgUmVjdCwgVm94ZWxSZWdpb24gfSBmcm9tICcuL3RlcnJhaW4nO1xuaW1wb3J0IHsgY2h1bmtLZXlzIH0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTTAwMl9TRUVEID0gMTMzNztcblxuLyoqIFBpbm5lZCBwYXRoIHNpdGUgaWQgZm9yIHRoZSBkb29yLXRvLWFwcHJvYWNoIGNvcnJpZG9yLiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfUEFUSF9TSVRFX0lEID0gJ3BhdGgtaG91c2UtZmFybSc7XG5cbi8qKlxuICogUGlubmVkIHN0ZXBwZWQgcHJvZmlsZSBmb3IgdGhlIDkgbSBwYXRoIGZyb20gdGhlIGhvdXNlIGRvb3IgKHggPSAtNTMpIHRvIHRoZVxuICogYXBwcm9hY2ggKHggPSAtNDUpLiBUaGUgcmlzZSBpcyAyIG0gb3ZlciA4IG07IGV2ZXJ5IHN0ZXAgaXMgYXQgbW9zdCAxIG0uXG4gKi9cbmV4cG9ydCBjb25zdCBNMDAyX1BBVEhfUFJPRklMRSA9IFsxMSwgMTEsIDExLCAxMiwgMTIsIDEyLCAxMiwgMTMsIDEzXSBhcyBjb25zdDtcblxuZXhwb3J0IGludGVyZmFjZSBUZXJyYWNlQmFuZFNwZWMge1xuICB6MDogbnVtYmVyO1xuICB6MTogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbi8qKiBQaW5uZWQgZmFybSB0ZXJyYWNlcywgaGlnaCBzaWRlIGZpcnN0LiAqL1xuZXhwb3J0IGNvbnN0IE0wMDJfVEVSUkFDRV9CQU5EUzogcmVhZG9ubHkgVGVycmFjZUJhbmRTcGVjW10gPSBbXG4gIHsgejA6IC00MiwgejE6IC00MCwgeTogMTYgfSxcbiAgeyB6MDogLTM5LCB6MTogLTM3LCB5OiAxNSB9LFxuICB7IHowOiAtMzYsIHoxOiAtMzUsIHk6IDE0IH0sXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVTcGVjIHtcbiAgaWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIGRvb3I6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgYXBwcm9hY2g6IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGYXJtU3BlYyB7XG4gIGlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIHRlcnJhY2VzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMkxheW91dCB7XG4gIHNlZWQ6IG51bWJlcjtcbiAgcmVqZWN0ZWQ6IFNpdGVTcGVjO1xuICBob3VzZTogU2l0ZVNwZWM7XG4gIGZhcm06IEZhcm1TcGVjO1xuICBzZWFyY2hBcmVhOiBSZWN0O1xuICB3b3JrWm9uZTogUmVjdDtcbiAgZml4dHVyZUNodW5rczogeyBjeDA6IG51bWJlcjsgY3owOiBudW1iZXI7IGN4MTogbnVtYmVyOyBjejE6IG51bWJlciB9O1xuICBwcm90ZWN0ZWRSZWdpb246IFZveGVsUmVnaW9uO1xuICAvKiogQ29tcGxldGUgYXV0aG9yaXplZCB3b3JrIGVudmVsb3BlIGZvciB0aGUgZmlyc3Qgc2xpY2UuICovXG4gIGVudmVsb3BlOiBWb3hlbFJlZ2lvbltdO1xufVxuXG5jb25zdCBGSVhUVVJFX0NIVU5LUyA9IHsgY3gwOiAyOCwgY3owOiAyOSwgY3gxOiAzMiwgY3oxOiAzMiB9IGFzIGNvbnN0O1xuXG5leHBvcnQgY29uc3QgTTAwMl9MQVlPVVQ6IE0wMDJMYXlvdXQgPSB7XG4gIHNlZWQ6IE0wMDJfU0VFRCxcbiAgcmVqZWN0ZWQ6IHtcbiAgICBpZDogJ3NpdGUtYS1yZWplY3RlZCcsXG4gICAgcmVjdDogeyB4MDogLTc0LCB6MDogLTY2LCB4MTogLTY3LCB6MTogLTYxIH0sXG4gICAgLy8gQSBuYWl2ZSBsb3ctc2lkZSBmbG9vcjogdGhlIHVwaGlsbCBjb3JuZXIgd291bGQgbmVlZCA1IG0gb2YgZXhjYXZhdGlvbi5cbiAgICBmbG9vclk6IDMsXG4gICAgZG9vcjogeyB4OiAtNjcsIHo6IC02MyB9LFxuICAgIGFwcHJvYWNoOiB7IHg6IC02MCwgejogLTYzIH0sXG4gIH0sXG4gIGhvdXNlOiB7XG4gICAgaWQ6ICdzaXRlLWItaG91c2UnLFxuICAgIHJlY3Q6IHsgeDA6IC02MCwgejA6IC00NiwgeDE6IC01MywgejE6IC00MSB9LFxuICAgIGZsb29yWTogMTEsXG4gICAgZG9vcjogeyB4OiAtNTMsIHo6IC00MyB9LFxuICAgIGFwcHJvYWNoOiB7IHg6IC00NSwgejogLTQzIH0sXG4gIH0sXG4gIGZhcm06IHtcbiAgICBpZDogJ2ZpZWxkLWMnLFxuICAgIHJlY3Q6IHsgeDA6IC0zOCwgejA6IC00MiwgeDE6IC0yNywgejE6IC0zNSB9LFxuICAgIHRlcnJhY2VzOiAzLFxuICB9LFxuICBzZWFyY2hBcmVhOiB7IHgwOiAtNzYsIHowOiAtNjgsIHgxOiAtNDAsIHoxOiAtNDAgfSxcbiAgd29ya1pvbmU6IHsgeDA6IC03NiwgejA6IC02OCwgeDE6IC0yMywgejE6IC0zMSB9LFxuICBmaXh0dXJlQ2h1bmtzOiBGSVhUVVJFX0NIVU5LUyxcbiAgcHJvdGVjdGVkUmVnaW9uOiB7XG4gICAgeDA6IGNodW5rT3JpZ2luWChGSVhUVVJFX0NIVU5LUy5jeDApLFxuICAgIHowOiBjaHVua09yaWdpblooRklYVFVSRV9DSFVOS1MuY3owKSxcbiAgICB4MTogY2h1bmtPcmlnaW5YKEZJWFRVUkVfQ0hVTktTLmN4MSkgKyAzMSxcbiAgICB6MTogY2h1bmtPcmlnaW5aKEZJWFRVUkVfQ0hVTktTLmN6MSkgKyAzMSxcbiAgICB5MDogWV9NSU4sXG4gICAgeTE6IFlfTUFYIC0gMSxcbiAgfSxcbiAgZW52ZWxvcGU6IFtcbiAgICAvLyBIb3VzZSBmb290cHJpbnQgcGx1cyBhIDIgbSBwcmVwYXJhdGlvbiBidWZmZXIuXG4gICAgeyB4MDogLTYyLCB6MDogLTQ4LCB4MTogLTUxLCB6MTogLTM5LCB5MDogOCwgeTE6IDE2IH0sXG4gICAgLy8gRG9vci10by1hcHByb2FjaCBwYXRoIGNvcnJpZG9yIHBsdXMgYSAxIG0gYnVmZmVyLlxuICAgIHsgeDA6IC01NCwgejA6IC00NCwgeDE6IC00NCwgejE6IC00MiwgeTA6IDksIHkxOiAxNSB9LFxuICAgIC8vIEZhcm0gZm9vdHByaW50IHBsdXMgYSAyIG0gcHJlcGFyYXRpb24gYnVmZmVyLlxuICAgIHsgeDA6IC00MCwgejA6IC00NCwgeDE6IC0yNSwgejE6IC0zMywgeTA6IDEwLCB5MTogMjAgfSxcbiAgXSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgTTAwMldvcmxkIHtcbiAgd29ybGQ6IFdvcmxkO1xuICBsYXlvdXQ6IE0wMDJMYXlvdXQ7XG4gIC8qKiBTb3J0ZWQgY2h1bmsga2V5cyBtYXRlcmlhbGlzZWQgYXQgZml4dHVyZSBjcmVhdGlvbi4gKi9cbiAgY2h1bmtLZXlzOiBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBTbWFsbCBkZXRlcm1pbmlzdGljIGZpeHR1cmU6IHRoZSAyMCBjaHVua3MgY292ZXJpbmcgdGhlIHdvcmsgem9uZSBhbmQgaXRzXG4gKiBwcm90ZWN0ZWQgc3Vycm91bmRpbmdzLiBGYXN0IGVub3VnaCBmb3IgdGhlIGZ1bGwgdGVzdCBzdWl0ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU0wMDJGaXh0dXJlKHNlZWQgPSBNMDAyX1NFRUQpOiBNMDAyV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGNyZWF0ZVdvcmxkKHNlZWQpO1xuICBjb25zdCB7IGN4MCwgY3owLCBjeDEsIGN6MSB9ID0gTTAwMl9MQVlPVVQuZml4dHVyZUNodW5rcztcbiAgZm9yIChsZXQgY3ogPSBjejA7IGN6IDw9IGN6MTsgY3orKykge1xuICAgIGZvciAobGV0IGN4ID0gY3gwOyBjeCA8PSBjeDE7IGN4KyspIGdlbmVyYXRlQ2h1bmsod29ybGQsIGN4LCBjeik7XG4gIH1cbiAgcGxhY2VBdXRob3JlZFNpdGVzKHdvcmxkKTtcbiAgcmV0dXJuIHsgd29ybGQsIGxheW91dDogTTAwMl9MQVlPVVQsIGNodW5rS2V5czogY2h1bmtLZXlzKHdvcmxkKSB9O1xufVxuXG4vKipcbiAqIExpdmUtd29ybGQgaW50ZWdyYXRpb24gdGFyZ2V0OiB0aGUgc2FtZSBzZWVkIGFuZCBzaXRlcyB3aXRoIGEgOSB4IDkgY2h1bmtcbiAqIG5laWdoYm91cmhvb2QgKDgxIGNodW5rcykgYXJvdW5kIHRoZSBmb3VuZGVyIHZhbGxleS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU0wMDJMaXZlKHNlZWQgPSBNMDAyX1NFRUQsIHJhZGl1cyA9IDQpOiBNMDAyV29ybGQge1xuICBjb25zdCB3b3JsZCA9IGdlbmVyYXRlV29ybGQoc2VlZCwgcmFkaXVzKTtcbiAgcmV0dXJuIHsgd29ybGQsIGxheW91dDogTTAwMl9MQVlPVVQsIGNodW5rS2V5czogY2h1bmtLZXlzKHdvcmxkKSB9O1xufVxuIiwgIi8vIE0wMDIgc2l0ZSB2YWxpZGF0aW9uLCBjYW5kaWRhdGUgc2VhcmNoIGFuZCBwcmV2aWV3IFx1MjAxNCBwdXJlIHNpbXVsYXRpb24uXG4vL1xuLy8gVGhpcyBpcyB0aGUgc2hhcmVkIGdhdGUgZm9yIHRoZSBwbGF5ZXIgYW5kIHRoZSBBSSBhZ2VudC4gTmVpdGhlciBtYXkgcGxhY2UgYVxuLy8gc3RydWN0dXJlIGJ5IGFueSBvdGhlciBwYXRoOiBib3RoIHN1Ym1pdCBhIFNpdGVQcm9wb3NhbCwgYm90aCByZWNlaXZlIHRoZVxuLy8gc2FtZSBTaXRlVmFsaWRhdGlvbiwgYW5kIGJvdGggbXVzdCBwYXNzIHRoZSBBdXRob3JpemVyIGJlZm9yZSBleGVjdXRpb24uXG4vL1xuLy8gVGhlIHZhbGlkYXRvciBkZXNjcmliZXMgdGhlIHNpdGUgYXMgaXQgaXMuIEl0IGRvZXMgbm90IGVkaXQgdm94ZWxzLCByZW1vdmVcbi8vIGVudGl0aWVzIG9yIHNwZW5kIHJlc291cmNlcy4gUHJlcGFyYXRpb24gaXMgYSBzZXBhcmF0ZSwgYXV0aG9yaXplZCBzdGVwLlxuaW1wb3J0IHsgV29ybGQsIEhBTEYsIFlfTUlOLCBZX01BWCwgc3VyZmFjZUF0IH0gZnJvbSAnLi93b3JsZCc7XG5pbXBvcnQge1xuICBSZWN0LCBWb3hlbFJlZ2lvbiwgRm9vdHByaW50UXVlcnksIFRlcnJhaW5RdWVyeSwgQXJlYVN0YXRzLFxuICBub3JtYWxpemVSZWN0LCBleHBhbmRSZWN0LCByZWN0Q29sdW1ucywgZWZmZWN0aXZlR3JhZGUsIHdhbGtTdGVwLCBXYWxrUGFyYW1zLFxuICBERUZBVUxUX1dBTEssIGNvbHVtbkF0LFxufSBmcm9tICcuL3RlcnJhaW4nO1xuXG5leHBvcnQgdHlwZSBTaXRlU3RhdGUgPSAndmFsaWQnIHwgJ3ZhbGlkX3dpdGhfcHJlcGFyYXRpb24nIHwgJ2ludmFsaWQnO1xuXG5leHBvcnQgdHlwZSBWYWxpZGF0aW9uQ29kZSA9XG4gIHwgJ291dF9vZl9ib3VuZHMnXG4gIHwgJ2Zvb3RwcmludF9taXNtYXRjaCdcbiAgfCAnc2xvcGVfZXhjZWVkZWQnXG4gIHwgJ3N0ZXBfZXhjZWVkZWQnXG4gIHwgJ2N1dF9leGNlZWRlZCdcbiAgfCAnZmlsbF9leGNlZWRlZCdcbiAgfCAnY3V0X3ZvbHVtZV9leGNlZWRlZCdcbiAgfCAnZmlsbF92b2x1bWVfZXhjZWVkZWQnXG4gIHwgJ2Zvb3RwcmludF9vYnN0cnVjdGVkJ1xuICB8ICd3YXRlcidcbiAgfCAnb3ZlcmhhbmcnXG4gIHwgJ25lZWRzX2dyYWRpbmcnXG4gIHwgJ25lZWRzX2NsZWFyaW5nJztcblxuZXhwb3J0IGludGVyZmFjZSBWYWxpZGF0aW9uUmVhc29uIHtcbiAgY29kZTogVmFsaWRhdGlvbkNvZGU7XG4gIHNldmVyaXR5OiAnZXJyb3InIHwgJ3ByZXBhcmF0aW9uJztcbiAgbWVzc2FnZTogc3RyaW5nO1xuICB2YWx1ZT86IG51bWJlcjtcbiAgbGltaXQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIEZvdW5kYXRpb25UeXBlID0gJ2dyYWRlZF9wYWQnIHwgJ3N0ZXBwZWRfcGxpbnRoJyB8ICdkZWNrJztcblxuZXhwb3J0IGludGVyZmFjZSBCdWlsZGluZ1J1bGVzIHtcbiAgaWQ6IHN0cmluZztcbiAgd2lkdGg6IG51bWJlcjtcbiAgZGVwdGg6IG51bWJlcjtcbiAgd2FsbEhlaWdodDogbnVtYmVyO1xuICBjbGVhcmFuY2U6IG51bWJlcjtcbiAgLyoqIFJlbGllZiBhdCBvciBiZWxvdyB0aGlzIG5lZWRzIG5vIGdyYWRpbmcgdG8gYmUgY2FsbGVkIHZhbGlkLiAqL1xuICBtYXhSZWxpZWZOb1ByZXA6IG51bWJlcjtcbiAgLyoqIFJlbGllZiBhYm92ZSB0aGlzIGNhbm5vdCBiZSBwcmVwYXJlZCBieSB0aGlzIGJ1aWxkaW5nIHR5cGUuICovXG4gIG1heFJlbGllZlByZXBhcmVkOiBudW1iZXI7XG4gIG1heFN0ZXA6IG51bWJlcjtcbiAgbWF4Q3V0OiBudW1iZXI7XG4gIG1heEZpbGw6IG51bWJlcjtcbiAgbWF4Q3V0Vm9sdW1lOiBudW1iZXI7XG4gIG1heEZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbWF4T2JzdHJ1Y3Rpb25zOiBudW1iZXI7XG4gIHJlcXVpcmVzRHJ5OiBib29sZWFuO1xuICBmb3VuZGF0aW9uOiBGb3VuZGF0aW9uVHlwZTtcbn1cblxuZXhwb3J0IGNvbnN0IEhPVVNFX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ2hvdXNlLTh4NicsXG4gIHdpZHRoOiA4LFxuICBkZXB0aDogNixcbiAgd2FsbEhlaWdodDogMyxcbiAgY2xlYXJhbmNlOiAzLFxuICBtYXhSZWxpZWZOb1ByZXA6IDEuMixcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDQuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAyLFxuICBtYXhGaWxsOiAyLFxuICBtYXhDdXRWb2x1bWU6IDQ4LFxuICBtYXhGaWxsVm9sdW1lOiA0OCxcbiAgbWF4T2JzdHJ1Y3Rpb25zOiAwLFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ2dyYWRlZF9wYWQnLFxufTtcblxuZXhwb3J0IGNvbnN0IEZBUk1fUlVMRVM6IEJ1aWxkaW5nUnVsZXMgPSB7XG4gIGlkOiAnZmFybS0xMng4JyxcbiAgd2lkdGg6IDEyLFxuICBkZXB0aDogOCxcbiAgd2FsbEhlaWdodDogMCxcbiAgY2xlYXJhbmNlOiAxLFxuICBtYXhSZWxpZWZOb1ByZXA6IDEuMixcbiAgbWF4UmVsaWVmUHJlcGFyZWQ6IDYuMCxcbiAgbWF4U3RlcDogMSxcbiAgbWF4Q3V0OiAyLFxuICBtYXhGaWxsOiAyLFxuICBtYXhDdXRWb2x1bWU6IDk2LFxuICBtYXhGaWxsVm9sdW1lOiA5NixcbiAgbWF4T2JzdHJ1Y3Rpb25zOiA0LFxuICByZXF1aXJlc0RyeTogdHJ1ZSxcbiAgZm91bmRhdGlvbjogJ3N0ZXBwZWRfcGxpbnRoJyxcbn07XG5cbmV4cG9ydCBjb25zdCBQQVRIX1JVTEVTOiBCdWlsZGluZ1J1bGVzID0ge1xuICBpZDogJ3BhdGgtOXgzJyxcbiAgd2lkdGg6IDksXG4gIGRlcHRoOiAzLFxuICB3YWxsSGVpZ2h0OiAwLFxuICBjbGVhcmFuY2U6IDEsXG4gIG1heFJlbGllZk5vUHJlcDogMi4wLFxuICBtYXhSZWxpZWZQcmVwYXJlZDogNC4wLFxuICBtYXhTdGVwOiAxLFxuICBtYXhDdXQ6IDEsXG4gIG1heEZpbGw6IDEsXG4gIG1heEN1dFZvbHVtZTogMzIsXG4gIG1heEZpbGxWb2x1bWU6IDMyLFxuICBtYXhPYnN0cnVjdGlvbnM6IDIsXG4gIHJlcXVpcmVzRHJ5OiB0cnVlLFxuICBmb3VuZGF0aW9uOiAnZGVjaycsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVQcm9wb3NhbCB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25TdW1tYXJ5IHtcbiAgbmVlZHNHcmFkaW5nOiBib29sZWFuO1xuICBuZWVkc0NsZWFyaW5nOiBib29sZWFuO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBvYnN0cnVjdGlvbklkczogc3RyaW5nW107XG4gIGZvdW5kYXRpb246IEZvdW5kYXRpb25UeXBlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpdGVWYWxpZGF0aW9uIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHN0YXRlOiBTaXRlU3RhdGU7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgcXVlcnk6IEZvb3RwcmludFF1ZXJ5O1xuICBwcmVwYXJhdGlvbjogUHJlcGFyYXRpb25TdW1tYXJ5O1xufVxuXG5mdW5jdGlvbiBlcnJvcihjb2RlOiBWYWxpZGF0aW9uQ29kZSwgbWVzc2FnZTogc3RyaW5nLCB2YWx1ZT86IG51bWJlciwgbGltaXQ/OiBudW1iZXIpOiBWYWxpZGF0aW9uUmVhc29uIHtcbiAgcmV0dXJuIHsgY29kZSwgc2V2ZXJpdHk6ICdlcnJvcicsIG1lc3NhZ2UsIHZhbHVlLCBsaW1pdCB9O1xufVxuXG5mdW5jdGlvbiBwcmVwKGNvZGU6IFZhbGlkYXRpb25Db2RlLCBtZXNzYWdlOiBzdHJpbmcsIHZhbHVlPzogbnVtYmVyLCBsaW1pdD86IG51bWJlcik6IFZhbGlkYXRpb25SZWFzb24ge1xuICByZXR1cm4geyBjb2RlLCBzZXZlcml0eTogJ3ByZXBhcmF0aW9uJywgbWVzc2FnZSwgdmFsdWUsIGxpbWl0IH07XG59XG5cbi8qKlxuICogVmFsaWRhdGUgYSBwcm9wb3NlZCBzaXRlIGFnYWluc3QgaXRzIGJ1aWxkaW5nIHJ1bGVzLiBQdXJlOiBubyB2b3hlbHMsXG4gKiBlbnRpdGllcyBvciByZXNvdXJjZXMgY2hhbmdlLiBgcXVlcnlgIG1heSBiZSBzdXBwbGllZCBieSBhIHNlYXJjaCB0byByZXVzZVxuICogdGhlIGNhY2hlZCBjb2x1bW5zLCBhbmQgYGZvb3RwcmludGAgbWF5IGJlIHN1cHBsaWVkIHdoZW4gdGhlIGNhbGxlciBhbHJlYWR5XG4gKiBldmFsdWF0ZWQgdGhlIHNhbWUgcmVjdC9mbG9vciBwYWlyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVTaXRlKFxuICB3b3JsZDogV29ybGQsIHByb3Bvc2FsOiBTaXRlUHJvcG9zYWwsIHF1ZXJ5ID0gbmV3IFRlcnJhaW5RdWVyeSh3b3JsZCksXG4gIGZvb3RwcmludD86IEZvb3RwcmludFF1ZXJ5LFxuKTogU2l0ZVZhbGlkYXRpb24ge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgcnVsZXMgPSBwcm9wb3NhbC5ydWxlcztcbiAgY29uc3QgcmVhc29uczogVmFsaWRhdGlvblJlYXNvbltdID0gW107XG4gIGNvbnN0IGZwID0gZm9vdHByaW50ID8/IHF1ZXJ5LmZvb3RwcmludChyZWN0LCBwcm9wb3NhbC5mbG9vclkpO1xuICBjb25zdCBzdGF0cyA9IGZwLnN0YXRzO1xuXG4gIGlmIChyZWN0LngwIDwgLUhBTEYgfHwgcmVjdC56MCA8IC1IQUxGIHx8IHJlY3QueDEgPj0gSEFMRiB8fCByZWN0LnoxID49IEhBTEYpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoJ291dF9vZl9ib3VuZHMnLCBgZm9vdHByaW50ICR7cmVjdC54MH0sJHtyZWN0LnowfS4uJHtyZWN0LngxfSwke3JlY3QuejF9IGlzIG91dHNpZGUgdGhlIHdvcmxkYCkpO1xuICB9XG4gIGlmIChyZWN0LngxIC0gcmVjdC54MCArIDEgIT09IHJ1bGVzLndpZHRoIHx8IHJlY3QuejEgLSByZWN0LnowICsgMSAhPT0gcnVsZXMuZGVwdGgpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnZm9vdHByaW50X21pc21hdGNoJyxcbiAgICAgIGBmb290cHJpbnQgaXMgJHtyZWN0LngxIC0gcmVjdC54MCArIDF9IHggJHtyZWN0LnoxIC0gcmVjdC56MCArIDF9IG0sICR7cnVsZXMud2lkdGh9IHggJHtydWxlcy5kZXB0aH0gbSByZXF1aXJlZGAsXG4gICAgKSk7XG4gIH1cblxuICBpZiAoc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQpIHtcbiAgICByZWFzb25zLnB1c2goZXJyb3IoXG4gICAgICAnc2xvcGVfZXhjZWVkZWQnLFxuICAgICAgYHJlbGllZiAke3N0YXRzLnJlbGllZn0gbSBleGNlZWRzIHRoZSAke3J1bGVzLm1heFJlbGllZlByZXBhcmVkfSBtIHByZXBhcmVkIGxpbWl0YCxcbiAgICAgIHN0YXRzLnJlbGllZiwgcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heFN0ZXAgPiBydWxlcy5tYXhTdGVwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ3N0ZXBfZXhjZWVkZWQnLFxuICAgICAgYHN1cmZhY2Ugc3RlcCAke3N0YXRzLm1heFN0ZXB9IG0gZXhjZWVkcyAke3J1bGVzLm1heFN0ZXB9IG1gLFxuICAgICAgc3RhdHMubWF4U3RlcCwgcnVsZXMubWF4U3RlcCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4Q3V0ID4gcnVsZXMubWF4Q3V0KSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2N1dF9leGNlZWRlZCcsXG4gICAgICBgY3V0ICR7c3RhdHMubWF4Q3V0fSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXR9IG1gLFxuICAgICAgc3RhdHMubWF4Q3V0LCBydWxlcy5tYXhDdXQsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEZpbGwgPiBydWxlcy5tYXhGaWxsKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2ZpbGxfZXhjZWVkZWQnLFxuICAgICAgYGZpbGwgJHtzdGF0cy5tYXhGaWxsfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsfSBtYCxcbiAgICAgIHN0YXRzLm1heEZpbGwsIHJ1bGVzLm1heEZpbGwsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLmN1dFZvbHVtZSA+IHJ1bGVzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdjdXRfdm9sdW1lX2V4Y2VlZGVkJyxcbiAgICAgIGBjdXQgdm9sdW1lICR7c3RhdHMuY3V0Vm9sdW1lfSBtXHUwMEIzIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXRWb2x1bWV9IG1cdTAwQjNgLFxuICAgICAgc3RhdHMuY3V0Vm9sdW1lLCBydWxlcy5tYXhDdXRWb2x1bWUsXG4gICAgKSk7XG4gIH1cbiAgaWYgKHN0YXRzLmZpbGxWb2x1bWUgPiBydWxlcy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ2ZpbGxfdm9sdW1lX2V4Y2VlZGVkJyxcbiAgICAgIGBmaWxsIHZvbHVtZSAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEZpbGxWb2x1bWV9IG1cdTAwQjNgLFxuICAgICAgc3RhdHMuZmlsbFZvbHVtZSwgcnVsZXMubWF4RmlsbFZvbHVtZSxcbiAgICApKTtcbiAgfVxuICBpZiAocnVsZXMucmVxdWlyZXNEcnkgJiYgc3RhdHMud2F0ZXJDb2x1bW5zID4gMCkge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICd3YXRlcicsXG4gICAgICBgJHtzdGF0cy53YXRlckNvbHVtbnN9IGZvb3RwcmludCBjb2x1bW5zIGFyZSB1bmRlcndhdGVyYCxcbiAgICAgIHN0YXRzLndhdGVyQ29sdW1ucywgMCxcbiAgICApKTtcbiAgfVxuICBpZiAoc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IHJ1bGVzLm1heE9ic3RydWN0aW9ucykge1xuICAgIHJlYXNvbnMucHVzaChlcnJvcihcbiAgICAgICdmb290cHJpbnRfb2JzdHJ1Y3RlZCcsXG4gICAgICBgJHtzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RofSBvYnN0cnVjdGlvbnMgZXhjZWVkIHRoZSAke3J1bGVzLm1heE9ic3RydWN0aW9uc30gYWxsb3dhbmNlYCxcbiAgICAgIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGgsIHJ1bGVzLm1heE9ic3RydWN0aW9ucyxcbiAgICApKTtcbiAgfVxuICBpZiAoZnAub3ZlcmhhbmdDZWxscy5sZW5ndGggPiAwKSB7XG4gICAgcmVhc29ucy5wdXNoKGVycm9yKFxuICAgICAgJ292ZXJoYW5nJyxcbiAgICAgIGAke2ZwLm92ZXJoYW5nQ2VsbHMubGVuZ3RofSBjZWxscyBhYm92ZSB0aGUgZmxvb3IgYXJlIGJsb2NrZWRgLFxuICAgICAgZnAub3ZlcmhhbmdDZWxscy5sZW5ndGgsIDAsXG4gICAgKSk7XG4gIH1cblxuICBjb25zdCBuZWVkc0dyYWRpbmcgPSBzdGF0cy5yZWxpZWYgPiBydWxlcy5tYXhSZWxpZWZOb1ByZXBcbiAgICB8fCBzdGF0cy5jdXRWb2x1bWUgPiAwIHx8IHN0YXRzLmZpbGxWb2x1bWUgPiAwO1xuICBjb25zdCBuZWVkc0NsZWFyaW5nID0gc3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aCA+IDBcbiAgICAmJiBzdGF0cy5vYnN0cnVjdGlvbnMubGVuZ3RoIDw9IHJ1bGVzLm1heE9ic3RydWN0aW9ucztcblxuICBpZiAobmVlZHNHcmFkaW5nKSB7XG4gICAgcmVhc29ucy5wdXNoKHByZXAoXG4gICAgICAnbmVlZHNfZ3JhZGluZycsXG4gICAgICBgZ3JhZGluZyByZXF1aXJlZDogJHtzdGF0cy5jdXRWb2x1bWV9IG1cdTAwQjMgY3V0LCAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZmlsbGAsXG4gICAgICBzdGF0cy5jdXRWb2x1bWUgKyBzdGF0cy5maWxsVm9sdW1lLFxuICAgICkpO1xuICB9XG4gIGlmIChuZWVkc0NsZWFyaW5nKSB7XG4gICAgcmVhc29ucy5wdXNoKHByZXAoXG4gICAgICAnbmVlZHNfY2xlYXJpbmcnLFxuICAgICAgYCR7c3RhdHMub2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIHRvIGNsZWFyYCxcbiAgICAgIHN0YXRzLm9ic3RydWN0aW9ucy5sZW5ndGgsIHJ1bGVzLm1heE9ic3RydWN0aW9ucyxcbiAgICApKTtcbiAgfVxuXG4gIGNvbnN0IGhhc0Vycm9yID0gcmVhc29ucy5zb21lKChyKSA9PiByLnNldmVyaXR5ID09PSAnZXJyb3InKTtcbiAgY29uc3QgaGFzUHJlcCA9IHJlYXNvbnMuc29tZSgocikgPT4gci5zZXZlcml0eSA9PT0gJ3ByZXBhcmF0aW9uJyk7XG4gIGNvbnN0IHN0YXRlOiBTaXRlU3RhdGUgPSBoYXNFcnJvciA/ICdpbnZhbGlkJyA6IGhhc1ByZXAgPyAndmFsaWRfd2l0aF9wcmVwYXJhdGlvbicgOiAndmFsaWQnO1xuXG4gIHJldHVybiB7XG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgc3RhdGUsXG4gICAgcmVhc29ucyxcbiAgICBxdWVyeTogZnAsXG4gICAgcHJlcGFyYXRpb246IHtcbiAgICAgIG5lZWRzR3JhZGluZyxcbiAgICAgIG5lZWRzQ2xlYXJpbmcsXG4gICAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICAgIGZpbGxWb2x1bWU6IHN0YXRzLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHN0YXRzLm1heEN1dCxcbiAgICAgIG1heEZpbGw6IHN0YXRzLm1heEZpbGwsXG4gICAgICBvYnN0cnVjdGlvbklkczogc3RhdHMub2JzdHJ1Y3Rpb25zLm1hcCgobykgPT4gby5lbnRpdHlJZCksXG4gICAgICBmb3VuZGF0aW9uOiBydWxlcy5mb3VuZGF0aW9uLFxuICAgIH0sXG4gIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gY2FuZGlkYXRlIHNlYXJjaCAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIFNlYXJjaE9wdGlvbnMge1xuICAvKiogQ2FuZGlkYXRlIGdyaWQgc3RlcCBpbiBtZXRyZXMuIERlZmF1bHQgMi4gKi9cbiAgc3RlcD86IG51bWJlcjtcbiAgbWF4UmVzdWx0cz86IG51bWJlcjtcbiAgYW5jaG9yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBtYXhEaXN0YW5jZT86IG51bWJlcjtcbiAgLyoqIEhhcmQgY29uc3RyYWludDogY2FuZGlkYXRlIGNlbnRyZSBtdXN0IGxpZSB3aXRoaW4gdGhpcyByYWRpdXMgb2YgYSBwb2ludC4gKi9cbiAgbmVhcj86IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IG1heERpc3RhbmNlOiBudW1iZXIgfTtcbiAgLyoqIERvIG5vdCByZXR1cm4gdHdvIGNhbmRpZGF0ZXMgd2hvc2UgZm9vdHByaW50cyBvdmVybGFwLiBEZWZhdWx0IHRydWUuICovXG4gIGRpc3RpbmN0PzogYm9vbGVhbjtcbiAgLyoqIFdhbGwtY2xvY2sgYnVkZ2V0IGZvciB0aGUgc2Nhbi4gRGVmYXVsdCAxMDAgbXMuICovXG4gIGJ1ZGdldE1zPzogbnVtYmVyO1xuICB3YWxrPzogV2Fsa1BhcmFtcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlQ2FuZGlkYXRlIHtcbiAgc2l0ZUlkOiBzdHJpbmc7XG4gIHJlY3Q6IFJlY3Q7XG4gIGZsb29yWTogbnVtYmVyO1xuICBzdGF0ZTogJ3ZhbGlkJyB8ICd2YWxpZF93aXRoX3ByZXBhcmF0aW9uJztcbiAgdmFsaWRhdGlvbjogU2l0ZVZhbGlkYXRpb247XG4gIGN1dFZvbHVtZTogbnVtYmVyO1xuICBmaWxsVm9sdW1lOiBudW1iZXI7XG4gIG9ic3RydWN0aW9uQ291bnQ6IG51bWJlcjtcbiAgZGlzdGFuY2U6IG51bWJlcjtcbiAgc2NvcmU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlU2VhcmNoUmVzdWx0IHtcbiAgY2FuZGlkYXRlczogU2l0ZUNhbmRpZGF0ZVtdO1xuICBldmFsdWF0ZWQ6IG51bWJlcjtcbiAgcmVqZWN0ZWQ6IG51bWJlcjtcbiAgZWxhcHNlZE1zOiBudW1iZXI7XG4gIGJ1ZGdldE1zOiBudW1iZXI7XG4gIC8qKiBUcnVlIHdoZW4gdGhlIHdhbGwtY2xvY2sgYnVkZ2V0IHN0b3BwZWQgdGhlIHNjYW4gYmVmb3JlIHRoZSBhcmVhIHdhcyBleGhhdXN0ZWQuICovXG4gIHRydW5jYXRlZDogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gZmxvb3JDYW5kaWRhdGVzKHN0YXRzOiBBcmVhU3RhdHMpOiBudW1iZXJbXSB7XG4gIGNvbnN0IG1lYW4gPSBNYXRoLnJvdW5kKHN0YXRzLm1lYW5ZKTtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGZvciAobGV0IGQgPSAtMTsgZCA8PSAxOyBkKyspIHNldC5hZGQobWVhbiArIGQpO1xuICBzZXQuYWRkKHN0YXRzLm1pblkpO1xuICBzZXQuYWRkKHN0YXRzLm1heFkpO1xuICByZXR1cm4gWy4uLnNldF0uZmlsdGVyKCh5KSA9PiB5ID49IFlfTUlOICYmIHkgPCBZX01BWCkuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xufVxuXG5mdW5jdGlvbiBvdmVybGFwcyhhOiBSZWN0LCBiOiBSZWN0KTogYm9vbGVhbiB7XG4gIHJldHVybiBhLngwIDw9IGIueDEgJiYgYS54MSA+PSBiLngwICYmIGEuejAgPD0gYi56MSAmJiBhLnoxID49IGIuejA7XG59XG5cbmZ1bmN0aW9uIGNhbmRpZGF0ZVNjb3JlKHY6IFNpdGVWYWxpZGF0aW9uLCBkaXN0YW5jZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgY29uc3QgcHJlcFBlbmFsdHkgPSB2LnN0YXRlID09PSAndmFsaWQnID8gMCA6IDI1O1xuICBjb25zdCBncmFkaW5nID0gdi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUgKyB2LnByZXBhcmF0aW9uLmZpbGxWb2x1bWU7XG4gIGNvbnN0IGNsZWFyaW5nID0gdi5wcmVwYXJhdGlvbi5vYnN0cnVjdGlvbklkcy5sZW5ndGggKiA0O1xuICByZXR1cm4gcHJlcFBlbmFsdHkgKyBncmFkaW5nICsgY2xlYXJpbmcgKyBkaXN0YW5jZSAqIDAuMjU7XG59XG5cbi8qKlxuICogU2VhcmNoIGEgYm91bmRlZCBhcmVhIGZvciB2aWFibGUgZm9vdHByaW50cy4gVGhlIHNhbWUgdmFsaWRhdG9yIGFuZCB0aGUgc2FtZVxuICogZmxvb3Itc2VsZWN0aW9uIHBvbGljeSBhcmUgdXNlZCBieSB0aGUgQUkgYWdlbnQgYW5kIHRoZSBwbGF5ZXIncyBidWlsZFxuICogcHJldmlldy4gU2VhcmNoIGlzIHJlYWQtb25seS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlYXJjaFNpdGVzKFxuICB3b3JsZDogV29ybGQsIHJ1bGVzOiBCdWlsZGluZ1J1bGVzLCBhcmVhOiBSZWN0LCBvcHRpb25zOiBTZWFyY2hPcHRpb25zID0ge30sXG4pOiBTaXRlU2VhcmNoUmVzdWx0IHtcbiAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3Qgc3RlcCA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3Iob3B0aW9ucy5zdGVwID8/IDIpKTtcbiAgY29uc3QgbWF4UmVzdWx0cyA9IE1hdGgubWF4KDEsIG9wdGlvbnMubWF4UmVzdWx0cyA/PyA4KTtcbiAgY29uc3QgZGlzdGluY3QgPSBvcHRpb25zLmRpc3RpbmN0ICE9PSBmYWxzZTtcbiAgY29uc3QgbWF4RGlzdGFuY2UgPSBvcHRpb25zLm1heERpc3RhbmNlID8/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgY29uc3QgYnVkZ2V0TXMgPSBvcHRpb25zLmJ1ZGdldE1zID8/IDEwMDtcbiAgY29uc3QgYW5jaG9yID0gb3B0aW9ucy5hbmNob3IgPz8geyB4OiAoYXJlYS54MCArIGFyZWEueDEpIC8gMiwgejogKGFyZWEuejAgKyBhcmVhLnoxKSAvIDIgfTtcbiAgY29uc3QgcXVlcnkgPSBuZXcgVGVycmFpblF1ZXJ5KHdvcmxkKTtcbiAgY29uc3QgYWxsOiBTaXRlQ2FuZGlkYXRlW10gPSBbXTtcbiAgbGV0IGV2YWx1YXRlZCA9IDA7XG4gIGxldCByZWplY3RlZCA9IDA7XG4gIGxldCB0cnVuY2F0ZWQgPSBmYWxzZTtcblxuICBjb25zdCB4MU1heCA9IGFyZWEueDEgLSBydWxlcy53aWR0aCArIDE7XG4gIGNvbnN0IHoxTWF4ID0gYXJlYS56MSAtIHJ1bGVzLmRlcHRoICsgMTtcbiAgc2NhbjogZm9yIChsZXQgeiA9IGFyZWEuejA7IHogPD0gejFNYXg7IHogKz0gc3RlcCkge1xuICAgIGZvciAobGV0IHggPSBhcmVhLngwOyB4IDw9IHgxTWF4OyB4ICs9IHN0ZXApIHtcbiAgICAgIGNvbnN0IHJlY3QgPSB7IHgwOiB4LCB6MDogeiwgeDE6IHggKyBydWxlcy53aWR0aCAtIDEsIHoxOiB6ICsgcnVsZXMuZGVwdGggLSAxIH07XG4gICAgICBjb25zdCBjeCA9IChyZWN0LngwICsgcmVjdC54MSkgLyAyO1xuICAgICAgY29uc3QgY3ogPSAocmVjdC56MCArIHJlY3QuejEpIC8gMjtcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5oeXBvdChjeCAtIGFuY2hvci54LCBjeiAtIGFuY2hvci56KTtcbiAgICAgIGlmIChkaXN0YW5jZSA+IG1heERpc3RhbmNlKSBjb250aW51ZTtcbiAgICAgIGlmIChvcHRpb25zLm5lYXIpIHtcbiAgICAgICAgY29uc3QgbmVhckRpc3RhbmNlID0gTWF0aC5oeXBvdChjeCAtIG9wdGlvbnMubmVhci54LCBjeiAtIG9wdGlvbnMubmVhci56KTtcbiAgICAgICAgaWYgKG5lYXJEaXN0YW5jZSA+IG9wdGlvbnMubmVhci5tYXhEaXN0YW5jZSkgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0YXRzID0gcXVlcnkuYXJlYShyZWN0KTtcbiAgICAgIGxldCBiZXN0OiBTaXRlQ2FuZGlkYXRlIHwgbnVsbCA9IG51bGw7XG4gICAgICBmb3IgKGNvbnN0IGZsb29yWSBvZiBmbG9vckNhbmRpZGF0ZXMoc3RhdHMpKSB7XG4gICAgICAgIGV2YWx1YXRlZCsrO1xuICAgICAgICBjb25zdCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsID0ge1xuICAgICAgICAgIHNpdGVJZDogYCR7cnVsZXMuaWR9OiR7eH0sJHt6fSwke2Zsb29yWX1gLFxuICAgICAgICAgIHJlY3QsIGZsb29yWSwgcnVsZXMsXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGZvb3RwcmludCA9IHF1ZXJ5LmZvb3RwcmludChyZWN0LCBmbG9vclkpO1xuICAgICAgICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCwgcXVlcnksIGZvb3RwcmludCk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcpIHtcbiAgICAgICAgICByZWplY3RlZCsrO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHNjb3JlID0gY2FuZGlkYXRlU2NvcmUodmFsaWRhdGlvbiwgZGlzdGFuY2UpO1xuICAgICAgICBjb25zdCBjYW5kaWRhdGU6IFNpdGVDYW5kaWRhdGUgPSB7XG4gICAgICAgICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgICAgICAgcmVjdCxcbiAgICAgICAgICBmbG9vclksXG4gICAgICAgICAgc3RhdGU6IHZhbGlkYXRpb24uc3RhdGUsXG4gICAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgICAgICBjdXRWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uY3V0Vm9sdW1lLFxuICAgICAgICAgIGZpbGxWb2x1bWU6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24uZmlsbFZvbHVtZSxcbiAgICAgICAgICBvYnN0cnVjdGlvbkNvdW50OiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzLmxlbmd0aCxcbiAgICAgICAgICBkaXN0YW5jZSxcbiAgICAgICAgICBzY29yZSxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFiZXN0XG4gICAgICAgICAgfHwgKGNhbmRpZGF0ZS5zdGF0ZSA9PT0gJ3ZhbGlkJyAmJiBiZXN0LnN0YXRlICE9PSAndmFsaWQnKVxuICAgICAgICAgIHx8IChjYW5kaWRhdGUuc3RhdGUgPT09IGJlc3Quc3RhdGUgJiYgY2FuZGlkYXRlLnNjb3JlIDwgYmVzdC5zY29yZSkpIHtcbiAgICAgICAgICBiZXN0ID0gY2FuZGlkYXRlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYmVzdCkgYWxsLnB1c2goYmVzdCk7XG4gICAgfVxuICAgIGlmIChwZXJmb3JtYW5jZS5ub3coKSAtIHQwID4gYnVkZ2V0TXMpIHtcbiAgICAgIHRydW5jYXRlZCA9IHRydWU7XG4gICAgICBicmVhayBzY2FuO1xuICAgIH1cbiAgfVxuXG4gIGFsbC5zb3J0KChhLCBiKSA9PiBhLnNjb3JlIC0gYi5zY29yZSB8fCBhLmRpc3RhbmNlIC0gYi5kaXN0YW5jZVxuICAgIHx8IGEucmVjdC54MCAtIGIucmVjdC54MCB8fCBhLnJlY3QuejAgLSBiLnJlY3QuejApO1xuICBjb25zdCBzZWxlY3RlZDogU2l0ZUNhbmRpZGF0ZVtdID0gW107XG4gIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGFsbCkge1xuICAgIGlmIChkaXN0aW5jdCAmJiBzZWxlY3RlZC5zb21lKChzKSA9PiBvdmVybGFwcyhzLnJlY3QsIGNhbmRpZGF0ZS5yZWN0KSkpIGNvbnRpbnVlO1xuICAgIHNlbGVjdGVkLnB1c2goY2FuZGlkYXRlKTtcbiAgICBpZiAoc2VsZWN0ZWQubGVuZ3RoID49IG1heFJlc3VsdHMpIGJyZWFrO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5kaWRhdGVzOiBzZWxlY3RlZCxcbiAgICBldmFsdWF0ZWQsXG4gICAgcmVqZWN0ZWQsXG4gICAgZWxhcHNlZE1zOiBNYXRoLnJvdW5kKChwZXJmb3JtYW5jZS5ub3coKSAtIHQwKSAqIDEwMCkgLyAxMDAsXG4gICAgYnVkZ2V0TXMsXG4gICAgdHJ1bmNhdGVkLFxuICB9O1xufVxuXG4vLyAtLS0tLS0tLS0tIHByZXZpZXcgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBGb3VuZGF0aW9uUHJldmlldyB7XG4gIHR5cGU6IEZvdW5kYXRpb25UeXBlO1xuICAvKiogU3RvbmUgZmxvb3Igc2xhYiBwbHVzIGZpbGwgdW5kZXIgdGhlIHByZXBhcmVkIGZsb29yLiAqL1xuICBwbGludGhDZWxsczogbnVtYmVyO1xuICAvKiogUGVyaW1ldGVyIGNlbGxzIHRoYXQgbmVlZCBhIHJldGFpbmluZyBmYWNlIGJlY2F1c2Ugb2YgY3V0IG9yIGZpbGwuICovXG4gIHJldGFpbmluZ1dhbGxDZWxsczogbnVtYmVyO1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFjY2Vzc1ByZXZpZXcge1xuICBkb29yOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGFwcHJvYWNoOiB7IHg6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGRpc3RhbmNlOiBudW1iZXI7XG4gIGdyYWRlOiBudW1iZXI7XG4gIHdhbGthYmxlOiBib29sZWFuO1xuICByZWFzb25zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaXRlUHJldmlldyB7XG4gIHNpdGVJZDogc3RyaW5nO1xuICBzdGF0ZTogU2l0ZVN0YXRlO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgcnVsZXM6IEJ1aWxkaW5nUnVsZXM7XG4gIHJlYXNvbnM6IFZhbGlkYXRpb25SZWFzb25bXTtcbiAgdGVycmFpbjoge1xuICAgIG1pblk6IG51bWJlcjtcbiAgICBtYXhZOiBudW1iZXI7XG4gICAgbWVhblk6IG51bWJlcjtcbiAgICByZWxpZWY6IG51bWJlcjtcbiAgICBtYXhTdGVwOiBudW1iZXI7XG4gICAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gICAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICAgIG1heEN1dDogbnVtYmVyO1xuICAgIG1heEZpbGw6IG51bWJlcjtcbiAgfTtcbiAgZm91bmRhdGlvbjogRm91bmRhdGlvblByZXZpZXc7XG4gIG9ic3RydWN0aW9uczogQXJyYXk8e1xuICAgIGVudGl0eUlkOiBzdHJpbmc7XG4gICAga2luZDogc3RyaW5nO1xuICAgIHg6IG51bWJlcjtcbiAgICB6OiBudW1iZXI7XG4gICAgYWN0aW9uOiAnY2xlYXInIHwgJ2Jsb2NrZWQnO1xuICB9PjtcbiAgYWNjZXNzOiBBY2Nlc3NQcmV2aWV3IHwgbnVsbDtcbiAgLyoqIENvbXBsZXRlIHdvcmsgZW52ZWxvcGUgdGhpcyBwcmV2aWV3IHdvdWxkIGF1dGhvcml6ZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJldmlld09wdGlvbnMge1xuICBkb29yPzogeyB4OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBhcHByb2FjaD86IHsgeDogbnVtYmVyOyB6OiBudW1iZXIgfTtcbiAgd2Fsaz86IFdhbGtQYXJhbXM7XG59XG5cbi8qKlxuICogQnVpbGQgdGhlIHRocmVlLXN0YXRlIHByZXZpZXcuIEl0IGlzIGRlbGliZXJhdGVseSBkYXRhLW9ubHk6IHRoZSByZW5kZXJlclxuICogY2FuIGRyYXcgaXQsIGJ1dCBpdCBuZXZlciBlZGl0cyB0ZXJyYWluIG9yIHNwZW5kcyByZXNvdXJjZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmV2aWV3U2l0ZShcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBvcHRpb25zOiBQcmV2aWV3T3B0aW9ucyA9IHt9LFxuKTogU2l0ZVByZXZpZXcge1xuICBjb25zdCBxdWVyeSA9IG5ldyBUZXJyYWluUXVlcnkod29ybGQpO1xuICBjb25zdCB2YWxpZGF0aW9uID0gdmFsaWRhdGVTaXRlKHdvcmxkLCBwcm9wb3NhbCwgcXVlcnkpO1xuICBjb25zdCBmcCA9IHZhbGlkYXRpb24ucXVlcnk7XG4gIGNvbnN0IHN0YXRzID0gZnAuc3RhdHM7XG4gIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHByb3Bvc2FsLnJlY3QpO1xuICBjb25zdCBydWxlcyA9IHByb3Bvc2FsLnJ1bGVzO1xuXG4gIGxldCBwZXJpbWV0ZXIgPSAwO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIHtcbiAgICAgIGlmICh4ICE9PSByZWN0LngwICYmIHggIT09IHJlY3QueDEgJiYgeiAhPT0gcmVjdC56MCAmJiB6ICE9PSByZWN0LnoxKSBjb250aW51ZTtcbiAgICAgIGlmIChjb2x1bW5BdCh3b3JsZCwgeCwgeikuc3VyZmFjZVkgIT09IHByb3Bvc2FsLmZsb29yWSkgcGVyaW1ldGVyKys7XG4gICAgfVxuICB9XG4gIGNvbnN0IGZvdW5kYXRpb246IEZvdW5kYXRpb25QcmV2aWV3ID0ge1xuICAgIHR5cGU6IHJ1bGVzLmZvdW5kYXRpb24sXG4gICAgcGxpbnRoQ2VsbHM6IHJlY3RDb2x1bW5zKHJlY3QpICsgc3RhdHMuZmlsbFZvbHVtZSxcbiAgICByZXRhaW5pbmdXYWxsQ2VsbHM6IHBlcmltZXRlcixcbiAgICBjdXRWb2x1bWU6IHN0YXRzLmN1dFZvbHVtZSxcbiAgICBmaWxsVm9sdW1lOiBzdGF0cy5maWxsVm9sdW1lLFxuICB9O1xuXG4gIGxldCBhY2Nlc3M6IEFjY2Vzc1ByZXZpZXcgfCBudWxsID0gbnVsbDtcbiAgaWYgKG9wdGlvbnMuZG9vciAmJiBvcHRpb25zLmFwcHJvYWNoKSB7XG4gICAgY29uc3QgZG9vciA9IG9wdGlvbnMuZG9vcjtcbiAgICBjb25zdCBhcHByb2FjaCA9IG9wdGlvbnMuYXBwcm9hY2g7XG4gICAgY29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguaHlwb3QoZG9vci54IC0gYXBwcm9hY2gueCwgZG9vci56IC0gYXBwcm9hY2gueik7XG4gICAgY29uc3Qgc3RlcHMgPSBNYXRoLm1heCgxLCBNYXRoLmNlaWwoZGlzdGFuY2UpKTtcbiAgICBsZXQgcHJldlggPSBhcHByb2FjaC54LCBwcmV2WiA9IGFwcHJvYWNoLno7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gc3RlcHM7IGkrKykge1xuICAgICAgY29uc3QgdCA9IGkgLyBzdGVwcztcbiAgICAgIGNvbnN0IHggPSBNYXRoLnJvdW5kKGFwcHJvYWNoLnggKyAoZG9vci54IC0gYXBwcm9hY2gueCkgKiB0KTtcbiAgICAgIGNvbnN0IHogPSBNYXRoLnJvdW5kKGFwcHJvYWNoLnogKyAoZG9vci56IC0gYXBwcm9hY2gueikgKiB0KTtcbiAgICAgIGlmICh4ID09PSBwcmV2WCAmJiB6ID09PSBwcmV2WikgY29udGludWU7XG4gICAgICBjb25zdCByZXN1bHQgPSB3YWxrU3RlcCh3b3JsZCwgcHJldlgsIHByZXZaLCB4LCB6LCBvcHRpb25zLndhbGsgPz8gREVGQVVMVF9XQUxLKTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSByZWFzb25zLnB1c2goYCR7cmVzdWx0LnJlYXNvbn0gYXQgJHt4fSwke3p9YCk7XG4gICAgICBwcmV2WCA9IHg7IHByZXZaID0gejtcbiAgICB9XG4gICAgYWNjZXNzID0ge1xuICAgICAgZG9vciwgYXBwcm9hY2gsIGRpc3RhbmNlLFxuICAgICAgZ3JhZGU6IGVmZmVjdGl2ZUdyYWRlKHdvcmxkLCBhcHByb2FjaC54LCBhcHByb2FjaC56LCBkb29yLngsIGRvb3IueiksXG4gICAgICB3YWxrYWJsZTogcmVhc29ucy5sZW5ndGggPT09IDAsXG4gICAgICByZWFzb25zLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB5MCA9IHByb3Bvc2FsLmZsb29yWSAtIE1hdGgubWF4KDEsIHN0YXRzLm1heEN1dCkgLSAxO1xuICBjb25zdCB5MSA9IHByb3Bvc2FsLmZsb29yWSArIE1hdGgubWF4KHJ1bGVzLndhbGxIZWlnaHQsIDEpICsgMTtcbiAgY29uc3QgZW52ZWxvcGU6IFZveGVsUmVnaW9uW10gPSBbXG4gICAge1xuICAgICAgLi4uZXhwYW5kUmVjdChyZWN0LCAyKSxcbiAgICAgIHkwOiBNYXRoLm1heChZX01JTiwgeTApLFxuICAgICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgeTEpLFxuICAgIH0sXG4gIF07XG4gIGlmIChhY2Nlc3MpIHtcbiAgICBjb25zdCBheDAgPSBNYXRoLm1pbihhY2Nlc3MuZG9vci54LCBhY2Nlc3MuYXBwcm9hY2gueCkgLSAxO1xuICAgIGNvbnN0IGF4MSA9IE1hdGgubWF4KGFjY2Vzcy5kb29yLngsIGFjY2Vzcy5hcHByb2FjaC54KSArIDE7XG4gICAgY29uc3QgYXowID0gTWF0aC5taW4oYWNjZXNzLmRvb3IueiwgYWNjZXNzLmFwcHJvYWNoLnopIC0gMTtcbiAgICBjb25zdCBhejEgPSBNYXRoLm1heChhY2Nlc3MuZG9vci56LCBhY2Nlc3MuYXBwcm9hY2gueikgKyAxO1xuICAgIGNvbnN0IGFNaW4gPSBNYXRoLm1pbihzdXJmYWNlQXQod29ybGQsIGF4MCwgYXowKSwgc3VyZmFjZUF0KHdvcmxkLCBheDEsIGF6MSkpO1xuICAgIGNvbnN0IGFNYXggPSBNYXRoLm1heChzdXJmYWNlQXQod29ybGQsIGF4MCwgYXowKSwgc3VyZmFjZUF0KHdvcmxkLCBheDEsIGF6MSkpO1xuICAgIGVudmVsb3BlLnB1c2goe1xuICAgICAgeDA6IGF4MCwgeDE6IGF4MSwgejA6IGF6MCwgejE6IGF6MSxcbiAgICAgIHkwOiBNYXRoLm1heChZX01JTiwgYU1pbiAtIDIpLFxuICAgICAgeTE6IE1hdGgubWluKFlfTUFYIC0gMSwgYU1heCArIDIpLFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzaXRlSWQ6IHByb3Bvc2FsLnNpdGVJZCxcbiAgICBzdGF0ZTogdmFsaWRhdGlvbi5zdGF0ZSxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcHJvcG9zYWwuZmxvb3JZLFxuICAgIHJ1bGVzLFxuICAgIHJlYXNvbnM6IHZhbGlkYXRpb24ucmVhc29ucyxcbiAgICB0ZXJyYWluOiB7XG4gICAgICBtaW5ZOiBzdGF0cy5taW5ZLFxuICAgICAgbWF4WTogc3RhdHMubWF4WSxcbiAgICAgIG1lYW5ZOiBzdGF0cy5tZWFuWSxcbiAgICAgIHJlbGllZjogc3RhdHMucmVsaWVmLFxuICAgICAgbWF4U3RlcDogc3RhdHMubWF4U3RlcCxcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICB9LFxuICAgIGZvdW5kYXRpb24sXG4gICAgb2JzdHJ1Y3Rpb25zOiBzdGF0cy5vYnN0cnVjdGlvbnMubWFwKChvKSA9PiAoe1xuICAgICAgZW50aXR5SWQ6IG8uZW50aXR5SWQsXG4gICAgICBraW5kOiBvLmtpbmQsXG4gICAgICB4OiBvLngsXG4gICAgICB6OiBvLnosXG4gICAgICBhY3Rpb246IHZhbGlkYXRpb24uc3RhdGUgPT09ICdpbnZhbGlkJyA/ICdibG9ja2VkJyA6ICdjbGVhcicsXG4gICAgfSkpLFxuICAgIGFjY2VzcyxcbiAgICBlbnZlbG9wZSxcbiAgfTtcbn1cblxuIiwgIi8vIE0wMDIgc3RhZ2UgMzogYm91bmRlZCwgYXV0aG9yaXplZCB0ZXJyYWluIHByZXBhcmF0aW9uLlxuLy9cbi8vIFRoZSBwaXBlbGluZSBpcyBkZWxpYmVyYXRlbHkgb25lLXdheSBhbmQgc2hhcmVkIGJ5IHRoZSBwbGF5ZXIgYW5kIHRoZSBBSTpcbi8vXG4vLyAgIHByb3Bvc2FsIC0+IHZhbGlkYXRlU2l0ZSAtPiBwbGFuUHJlcGFyYXRpb24gLT4gQXV0aG9yaXplciAtPiBleGVjdXRlXG4vL1xuLy8gYGV4ZWN1dGVQcmVwYXJhdGlvbmAgaXMgdGhlIG9ubHkgZnVuY3Rpb24gaW4gTTAwMiB0aGF0IGVkaXRzIHRlcnJhaW4gZm9yXG4vLyBjb25zdHJ1Y3Rpb24uIEl0IHJlZnVzZXMgdG8gcnVuIHdpdGhvdXQgYW4gYXV0aG9yaXphdGlvbiB0b2tlbiB3aG9zZSBkaWdlc3Rcbi8vIG1hdGNoZXMgdGhlIHBsYW4sIHdob3NlIGVudmVsb3BlIGNvdmVycyBldmVyeSB2b3hlbCBpdCB3b3VsZCB0b3VjaCwgYW5kIHdob3NlXG4vLyBiYXNlIHJldmlzaW9uIHN0aWxsIG1hdGNoZXMgdGhlIHdvcmxkLiBBbGwgZWRpdHMgYXJlIGNvbXB1dGVkIGFuZCBjaGVja2VkXG4vLyBiZWZvcmUgdGhlIGZpcnN0IGJ5dGUgaXMgd3JpdHRlbiwgc28gYSByZWplY3RlZCBwbGFuIGNhbm5vdCBsZWF2ZSBhIHBhcnRpYWxcbi8vIHBhZCBiZWhpbmQuXG4vL1xuLy8gVGhlIGF1dGhvcml6ZXIgaW4gdGhpcyBmaWxlIGlzIGEgbG9jYWwgcG9saWN5IHN0dWIuIEl0IHByb3ZlcyB0aGF0IHRoZVxuLy8gcGlwZWxpbmUgYW5kIHRoZSBlbnZlbG9wZSBjaGVja3MgZXhpc3Q7IGl0IGlzIE5PVCBNYWdpY0Jsb2NrIGVuZm9yY2VtZW50LlxuLy8gTm8gY2hhaW4gcHJvZ3JhbSwgU0RLIGNhbGwsIHNldHRsZW1lbnQgb3Igcm9sbGJhY2sgZ3VhcmFudGVlIGlzIHByZXNlbnQuXG5pbXBvcnQge1xuICBXb3JsZCwgTUFULCBNYXRJZCwgWV9NSU4sIFlfTUFYLCBIQUxGLCBpc1NvbGlkLFxuICBnZXRWb3hlbCwgc2V0Vm94ZWwsIHJlbW92ZUVudGl0eSwgc3VyZmFjZUF0LFxuICB3b3JsZFRvQ2h1bmtYLCB3b3JsZFRvQ2h1bmtaLCBjaHVua0tleSxcbiAgRW50aXR5S2luZCwgUmVzb3VyY2VUeXBlLFxufSBmcm9tICcuL3dvcmxkJztcbmltcG9ydCB7XG4gIFJlY3QsIFZveGVsUmVnaW9uLCBub3JtYWxpemVSZWN0LCByZWN0Q29sdW1ucywgZXhwYW5kUmVjdCxcbiAgZW52ZWxvcGVDb250YWlucywgb2JzdHJ1Y3Rpb25zSW4sXG59IGZyb20gJy4vdGVycmFpbic7XG5pbXBvcnQge1xuICBTaXRlUHJvcG9zYWwsIFNpdGVWYWxpZGF0aW9uLCBCdWlsZGluZ1J1bGVzLCB2YWxpZGF0ZVNpdGUsXG59IGZyb20gJy4vY29uc3RydWN0aW9uJztcbmltcG9ydCB7XG4gIGludmVudG9yeVNuYXBzaG90LCBub3JtYWxpemVFbnZlbG9wZSxcbn0gZnJvbSAnLi9jYW5vbmljYWwnO1xuXG5leHBvcnQgY29uc3QgTE9DQUxfQVVUSE9SSVRZID0gJ2xvY2FsLXN0dWInIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IExPQ0FMX0VORk9SQ0VNRU5UID0gJ2xvY2FsLXNpbXVsYXRpb24tb25seScgYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29sdW1uVGFyZ2V0IHtcbiAgeDogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQbGFuRXhwZWN0YXRpb24ge1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICBvYnN0cnVjdGlvbnM6IG51bWJlcjtcbiAgc3VyZmFjZUVkaXRzOiBudW1iZXI7XG4gIHRvdGFsRWRpdHM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmVwYXJhdGlvblBsYW4ge1xuICBpZDogc3RyaW5nO1xuICBzaXRlSWQ6IHN0cmluZztcbiAgcmVjdDogUmVjdDtcbiAgZmxvb3JZOiBudW1iZXI7XG4gIHJ1bGVzOiBCdWlsZGluZ1J1bGVzO1xuICAvKiogRXhhY3RseSBvbmUgdGFyZ2V0IHdhbGtpbmcgaGVpZ2h0IHBlciBmb290cHJpbnQgY29sdW1uLCBzb3J0ZWQgYnkgeiwgeC4gKi9cbiAgdGFyZ2V0czogQ29sdW1uVGFyZ2V0W107XG4gIC8qKiBBdXRob3JpdGF0aXZlIGVudGl0eSBpZHMgdGhpcyBwbGFuIG1heSByZW1vdmUuICovXG4gIGNsZWFyRW50aXR5SWRzOiBzdHJpbmdbXTtcbiAgLyoqIE1hdGVyaWFsIGZvciB0aGUgdG9wIHNvbGlkIHZveGVsIGFmdGVyIGdyYWRpbmcsIG9yIG51bGwgdG8ga2VlcCBpdC4gKi9cbiAgc3VyZmFjZU1hdGVyaWFsOiBNYXRJZCB8IG51bGw7XG4gIC8qKiBUaWdodCBlbnZlbG9wZSBjb3ZlcmluZyBldmVyeSBwbGFubmVkIHZveGVsIGNoYW5nZS4gKi9cbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGV4cGVjdGVkOiBQbGFuRXhwZWN0YXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25PcHRpb25zIHtcbiAgLyoqIFBlci1jb2x1bW4gdGFyZ2V0cyBmb3IgdGVycmFjZXMgb3Igc3RlcHBlZCBwYXRocy4gRGVmYXVsdHMgdG8gZmxvb3JZLiAqL1xuICB0YXJnZXRzPzogQ29sdW1uVGFyZ2V0W107XG4gIC8qKiBgbm9uZWAgaXMgb25seSBsZWdhbCB3aGVuIHRoZSBzaXRlIGhhcyBubyBvYnN0cnVjdGlvbnMuICovXG4gIGNsZWFyPzogJ29ic3RydWN0aW9ucycgfCAnbm9uZSc7XG4gIC8qKiBTZXQgdGhlIHRvcCBzb2xpZCB2b3hlbCBvZiBldmVyeSB0YXJnZXQgY29sdW1uIChwYXRocywgZmllbGRzKS4gKi9cbiAgc3VyZmFjZU1hdGVyaWFsPzogTWF0SWQ7XG4gIC8qKiBFeHBsaWNpdCB3b3JrIGVudmVsb3BlLiBEZWZhdWx0cyB0byBhIHRpZ2h0IGVudmVsb3BlIGFyb3VuZCB0aGUgZWRpdHMuICovXG4gIGVudmVsb3BlPzogVm94ZWxSZWdpb25bXTtcbn1cblxuLy8gLS0tLS0tLS0tLSBzdGFibGUgZGlnZXN0IC0tLS0tLS0tLS1cbmZ1bmN0aW9uIGRpZ2VzdChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGEgPSAweDgxMWM5ZGM1O1xuICBsZXQgYiA9IDB4OWUzNzc5Yjk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaW5wdXQubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gaW5wdXQuY2hhckNvZGVBdChpKTtcbiAgICBhID0gTWF0aC5pbXVsKGEgXiBjLCAweDAxMDAwMTkzKTtcbiAgICBiID0gTWF0aC5pbXVsKGIgXiAoYyArIDB4OWUpLCAweDg1ZWJjYTZiKTtcbiAgICBiIF49IGIgPj4+IDEzO1xuICB9XG4gIHJldHVybiAoYSA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJylcbiAgICArIChiID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuLyoqIERpZ2VzdCBvZiBldmVyeXRoaW5nIHRoYXQgY2hhbmdlcyB0aGUgc2V0IG9mIGVkaXRzIG9yIHJlbW92YWxzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW5EaWdlc3QocGxhbjogUHJlcGFyYXRpb25QbGFuKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW1xuICAgICdtMDAyOnByZXAtcGxhbjp2MScsXG4gICAgcGxhbi5zaXRlSWQsXG4gICAgYCR7cGxhbi5yZWN0LngwfSwke3BsYW4ucmVjdC56MH0sJHtwbGFuLnJlY3QueDF9LCR7cGxhbi5yZWN0LnoxfWAsXG4gICAgU3RyaW5nKHBsYW4uZmxvb3JZKSxcbiAgICBwbGFuLnJ1bGVzLmlkLFxuICAgIFN0cmluZyhwbGFuLnRhcmdldHMubGVuZ3RoKSxcbiAgICBwbGFuLnN1cmZhY2VNYXRlcmlhbCA9PT0gbnVsbCA/ICdzdXJmYWNlOmtlZXAnIDogYHN1cmZhY2U6JHtwbGFuLnN1cmZhY2VNYXRlcmlhbH1gLFxuICBdO1xuICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSBsaW5lcy5wdXNoKGB0OiR7dC54fSwke3Quen0sJHt0Lnl9YCk7XG4gIGNvbnN0IGNsZWFycyA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gIGxpbmVzLnB1c2goYGM6JHtjbGVhcnMubGVuZ3RofWApO1xuICBmb3IgKGNvbnN0IGlkIG9mIGNsZWFycykgbGluZXMucHVzaChgYzoke2lkfWApO1xuICBmb3IgKGNvbnN0IGUgb2Ygbm9ybWFsaXplRW52ZWxvcGUocGxhbi5lbnZlbG9wZSkpIHtcbiAgICBsaW5lcy5wdXNoKGBlOiR7ZS54MH0sJHtlLnowfSwke2UueTB9LCR7ZS54MX0sJHtlLnoxfSwke2UueTF9YCk7XG4gIH1cbiAgY29uc3QgeCA9IHBsYW4uZXhwZWN0ZWQ7XG4gIGxpbmVzLnB1c2goYHg6JHt4LmN1dFZvbHVtZX0sJHt4LmZpbGxWb2x1bWV9LCR7eC5tYXhDdXR9LCR7eC5tYXhGaWxsfSwke3gub2JzdHJ1Y3Rpb25zfSwke3guc3VyZmFjZUVkaXRzfSwke3gudG90YWxFZGl0c31gKTtcbiAgcmV0dXJuIGRpZ2VzdChsaW5lcy5qb2luKCdcXG4nKSk7XG59XG5cbi8vIC0tLS0tLS0tLS0gcGxhbm5pbmcgLS0tLS0tLS0tLVxuZXhwb3J0IGludGVyZmFjZSBQbGFuU3VjY2VzcyB7XG4gIG9rOiB0cnVlO1xuICBwbGFuOiBQcmVwYXJhdGlvblBsYW47XG4gIHZhbGlkYXRpb246IFNpdGVWYWxpZGF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByZXBhcmF0aW9uRmFpbHVyZSB7XG4gIG9rOiBmYWxzZTtcbiAgc3RhZ2U6ICdwbGFuJyB8ICdhdXRob3JpemUnIHwgJ2V4ZWN1dGUnO1xuICBjb2RlOiBzdHJpbmc7XG4gIHJlYXNvbnM6IHN0cmluZ1tdO1xuICB2YWxpZGF0aW9uPzogU2l0ZVZhbGlkYXRpb247XG59XG5cbmV4cG9ydCB0eXBlIFBsYW5SZXN1bHQgPSBQbGFuU3VjY2VzcyB8IFByZXBhcmF0aW9uRmFpbHVyZTtcblxuZnVuY3Rpb24gZGVmYXVsdFRhcmdldHMod29ybGQ6IFdvcmxkLCByZWN0OiBSZWN0LCBmbG9vclk6IG51bWJlcik6IENvbHVtblRhcmdldFtdIHtcbiAgY29uc3Qgb3V0OiBDb2x1bW5UYXJnZXRbXSA9IFtdO1xuICBmb3IgKGxldCB6ID0gcmVjdC56MDsgeiA8PSByZWN0LnoxOyB6KyspIHtcbiAgICBmb3IgKGxldCB4ID0gcmVjdC54MDsgeCA8PSByZWN0LngxOyB4KyspIG91dC5wdXNoKHsgeCwgeiwgeTogZmxvb3JZIH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHNvcnRlZFRhcmdldHModGFyZ2V0czogcmVhZG9ubHkgQ29sdW1uVGFyZ2V0W10pOiBDb2x1bW5UYXJnZXRbXSB7XG4gIHJldHVybiBbLi4udGFyZ2V0c10uc29ydCgoYSwgYikgPT4gYS56IC0gYi56IHx8IGEueCAtIGIueCB8fCBhLnkgLSBiLnkpO1xufVxuXG5pbnRlcmZhY2UgVGFyZ2V0U3RhdHMge1xuICBjdXRWb2x1bWU6IG51bWJlcjtcbiAgZmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhDdXQ6IG51bWJlcjtcbiAgbWF4RmlsbDogbnVtYmVyO1xuICByZWxpZWY6IG51bWJlcjtcbn1cblxuLyoqIEN1dC9maWxsIGltcGxpZWQgYnkgZXhwbGljaXQgdGFyZ2V0cywgaW5kZXBlbmRlbnQgb2YgdGhlIGZsYXQgZmxvb3JZLiAqL1xuZnVuY3Rpb24gdGFyZ2V0U3RhdHMod29ybGQ6IFdvcmxkLCB0YXJnZXRzOiByZWFkb25seSBDb2x1bW5UYXJnZXRbXSk6IFRhcmdldFN0YXRzIHtcbiAgbGV0IGN1dFZvbHVtZSA9IDAsIGZpbGxWb2x1bWUgPSAwLCBtYXhDdXQgPSAwLCBtYXhGaWxsID0gMDtcbiAgbGV0IG1pblkgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIG1heFkgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gIGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN1cmZhY2VBdCh3b3JsZCwgdC54LCB0LnopO1xuICAgIG1pblkgPSBNYXRoLm1pbihtaW5ZLCBzdXJmYWNlLCB0LnkpO1xuICAgIG1heFkgPSBNYXRoLm1heChtYXhZLCBzdXJmYWNlLCB0LnkpO1xuICAgIGlmIChzdXJmYWNlID4gdC55KSB7XG4gICAgICBjb25zdCBkID0gc3VyZmFjZSAtIHQueTtcbiAgICAgIGN1dFZvbHVtZSArPSBkO1xuICAgICAgbWF4Q3V0ID0gTWF0aC5tYXgobWF4Q3V0LCBkKTtcbiAgICB9IGVsc2UgaWYgKHN1cmZhY2UgPCB0LnkpIHtcbiAgICAgIGNvbnN0IGQgPSB0LnkgLSBzdXJmYWNlO1xuICAgICAgZmlsbFZvbHVtZSArPSBkO1xuICAgICAgbWF4RmlsbCA9IE1hdGgubWF4KG1heEZpbGwsIGQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4geyBjdXRWb2x1bWUsIGZpbGxWb2x1bWUsIG1heEN1dCwgbWF4RmlsbCwgcmVsaWVmOiBtYXhZIC0gbWluWSB9O1xufVxuXG5mdW5jdGlvbiB0YXJnZXRSdWxlUmVhc29ucyhzdGF0czogVGFyZ2V0U3RhdHMsIHJ1bGVzOiBCdWlsZGluZ1J1bGVzKTogc3RyaW5nW10ge1xuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBpZiAoc3RhdHMucmVsaWVmID4gcnVsZXMubWF4UmVsaWVmUHJlcGFyZWQpIHtcbiAgICByZWFzb25zLnB1c2goYHJlbGllZiAke3N0YXRzLnJlbGllZn0gbSBleGNlZWRzIHRoZSAke3J1bGVzLm1heFJlbGllZlByZXBhcmVkfSBtIHByZXBhcmVkIGxpbWl0YCk7XG4gIH1cbiAgaWYgKHN0YXRzLm1heEN1dCA+IHJ1bGVzLm1heEN1dCkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0ICR7c3RhdHMubWF4Q3V0fSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhDdXR9IG1gKTtcbiAgfVxuICBpZiAoc3RhdHMubWF4RmlsbCA+IHJ1bGVzLm1heEZpbGwpIHtcbiAgICByZWFzb25zLnB1c2goYGZpbGwgJHtzdGF0cy5tYXhGaWxsfSBtIGV4Y2VlZHMgJHtydWxlcy5tYXhGaWxsfSBtYCk7XG4gIH1cbiAgaWYgKHN0YXRzLmN1dFZvbHVtZSA+IHJ1bGVzLm1heEN1dFZvbHVtZSkge1xuICAgIHJlYXNvbnMucHVzaChgY3V0IHZvbHVtZSAke3N0YXRzLmN1dFZvbHVtZX0gbVx1MDBCMyBleGNlZWRzICR7cnVsZXMubWF4Q3V0Vm9sdW1lfSBtXHUwMEIzYCk7XG4gIH1cbiAgaWYgKHN0YXRzLmZpbGxWb2x1bWUgPiBydWxlcy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsIHZvbHVtZSAke3N0YXRzLmZpbGxWb2x1bWV9IG1cdTAwQjMgZXhjZWVkcyAke3J1bGVzLm1heEZpbGxWb2x1bWV9IG1cdTAwQjNgKTtcbiAgfVxuICByZXR1cm4gcmVhc29ucztcbn1cblxuLyoqXG4gKiBUdXJuIGEgcHJvcG9zYWwgaW50byBhbiBleHBsaWNpdCwgY2hlY2thYmxlIHBsYW4uIFJlYWQtb25seS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYW5QcmVwYXJhdGlvbihcbiAgd29ybGQ6IFdvcmxkLCBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLCBvcHRpb25zOiBQcmVwYXJhdGlvbk9wdGlvbnMgPSB7fSxcbik6IFBsYW5SZXN1bHQge1xuICBjb25zdCByZWN0ID0gbm9ybWFsaXplUmVjdChwcm9wb3NhbC5yZWN0KTtcbiAgY29uc3QgdmFsaWRhdGlvbiA9IHZhbGlkYXRlU2l0ZSh3b3JsZCwgcHJvcG9zYWwpO1xuXG4gIGlmICh2YWxpZGF0aW9uLnN0YXRlID09PSAnaW52YWxpZCcpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgIGNvZGU6ICdzaXRlX2ludmFsaWQnLFxuICAgICAgcmVhc29uczogdmFsaWRhdGlvbi5yZWFzb25zLm1hcCgocikgPT4gYCR7ci5jb2RlfTogJHtyLm1lc3NhZ2V9YCksXG4gICAgICB2YWxpZGF0aW9uLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB0YXJnZXRzID0gc29ydGVkVGFyZ2V0cyhvcHRpb25zLnRhcmdldHMgPz8gZGVmYXVsdFRhcmdldHMod29ybGQsIHJlY3QsIHByb3Bvc2FsLmZsb29yWSkpO1xuICBjb25zdCBjb2x1bW5zID0gcmVjdENvbHVtbnMocmVjdCk7XG4gIGlmICh0YXJnZXRzLmxlbmd0aCAhPT0gY29sdW1ucykge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICBzdGFnZTogJ3BsYW4nLFxuICAgICAgY29kZTogJ3RhcmdldF9jb3VudCcsXG4gICAgICByZWFzb25zOiBbYHBsYW4gaGFzICR7dGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZm9yICR7Y29sdW1uc30gY29sdW1uc2BdLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG5cbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IGtleSA9IGAke3QueH0sJHt0Lnp9YDtcbiAgICBpZiAoc2Vlbi5oYXMoa2V5KSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgb2s6IGZhbHNlLCBzdGFnZTogJ3BsYW4nLCBjb2RlOiAnZHVwbGljYXRlX3RhcmdldCcsXG4gICAgICAgIHJlYXNvbnM6IFtgZHVwbGljYXRlIHRhcmdldCBhdCAke2tleX1gXSwgdmFsaWRhdGlvbixcbiAgICAgIH07XG4gICAgfVxuICAgIHNlZW4uYWRkKGtleSk7XG4gICAgaWYgKHQueCA8IHJlY3QueDAgfHwgdC54ID4gcmVjdC54MSB8fCB0LnogPCByZWN0LnowIHx8IHQueiA+IHJlY3QuejEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ3RhcmdldF9vdXRzaWRlX2Zvb3RwcmludCcsXG4gICAgICAgIHJlYXNvbnM6IFtgdGFyZ2V0ICR7a2V5fSBpcyBvdXRzaWRlICR7cmVjdC54MH0sJHtyZWN0LnowfS4uJHtyZWN0LngxfSwke3JlY3QuejF9YF0sXG4gICAgICAgIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIodC55KSB8fCB0LnkgPCBZX01JTiB8fCB0LnkgPj0gWV9NQVgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSwgc3RhZ2U6ICdwbGFuJywgY29kZTogJ3RhcmdldF9oZWlnaHQnLFxuICAgICAgICByZWFzb25zOiBbYHRhcmdldCAke2tleX0gaGFzIGludmFsaWQgaGVpZ2h0ICR7dC55fWBdLCB2YWxpZGF0aW9uLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBvYnN0cnVjdGlvbnMgPSB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLm9ic3RydWN0aW9uSWRzO1xuICBjb25zdCBjbGVhciA9IG9wdGlvbnMuY2xlYXIgPz8gJ29ic3RydWN0aW9ucyc7XG4gIGlmIChjbGVhciA9PT0gJ25vbmUnICYmIG9ic3RydWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIHN0YWdlOiAncGxhbicsXG4gICAgICBjb2RlOiAndW5jbGVhcmVkX29ic3RydWN0aW9ucycsXG4gICAgICByZWFzb25zOiBbYCR7b2JzdHJ1Y3Rpb25zLmxlbmd0aH0gb2JzdHJ1Y3Rpb25zIHdvdWxkIHJlbWFpbmBdLFxuICAgICAgdmFsaWRhdGlvbixcbiAgICB9O1xuICB9XG4gIGNvbnN0IGNsZWFyRW50aXR5SWRzID0gY2xlYXIgPT09ICdub25lJyA/IFtdIDogWy4uLm5ldyBTZXQob2JzdHJ1Y3Rpb25zKV0uc29ydCgpO1xuICBjb25zdCBzdXJmYWNlTWF0ZXJpYWwgPSBvcHRpb25zLnN1cmZhY2VNYXRlcmlhbCA/PyBudWxsO1xuXG4gIGNvbnN0IGN1c3RvbVRhcmdldHMgPSBvcHRpb25zLnRhcmdldHMgIT09IHVuZGVmaW5lZDtcbiAgY29uc3Qgc3RhdHMgPSBjdXN0b21UYXJnZXRzXG4gICAgPyB0YXJnZXRTdGF0cyh3b3JsZCwgdGFyZ2V0cylcbiAgICA6IHtcbiAgICAgIGN1dFZvbHVtZTogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5jdXRWb2x1bWUsXG4gICAgICBmaWxsVm9sdW1lOiB2YWxpZGF0aW9uLnByZXBhcmF0aW9uLmZpbGxWb2x1bWUsXG4gICAgICBtYXhDdXQ6IHZhbGlkYXRpb24ucHJlcGFyYXRpb24ubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogdmFsaWRhdGlvbi5wcmVwYXJhdGlvbi5tYXhGaWxsLFxuICAgICAgcmVsaWVmOiB2YWxpZGF0aW9uLnF1ZXJ5LnN0YXRzLnJlbGllZixcbiAgICB9O1xuICBpZiAoY3VzdG9tVGFyZ2V0cykge1xuICAgIGNvbnN0IHJlYXNvbnMgPSB0YXJnZXRSdWxlUmVhc29ucyhzdGF0cywgcHJvcG9zYWwucnVsZXMpO1xuICAgIGlmIChyZWFzb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgc3RhZ2U6ICdwbGFuJyxcbiAgICAgICAgY29kZTogJ3RhcmdldF9ydWxlcycsXG4gICAgICAgIHJlYXNvbnMsXG4gICAgICAgIHZhbGlkYXRpb24sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGxldCBsbyA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgbGV0IGhpID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICBmb3IgKGNvbnN0IHQgb2YgdGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBsbyA9IE1hdGgubWluKGxvLCBzdXJmYWNlLCB0LnkpO1xuICAgIGhpID0gTWF0aC5tYXgoaGksIHN1cmZhY2UgLSAxLCB0LnkgLSAxKTtcbiAgfVxuICBjb25zdCBidWZmZXJlZCA9IGV4cGFuZFJlY3QocmVjdCwgMSk7XG4gIGNvbnN0IGRlcml2ZWQ6IFZveGVsUmVnaW9uID0ge1xuICAgIHgwOiBNYXRoLm1heCgtSEFMRiwgYnVmZmVyZWQueDApLFxuICAgIHowOiBNYXRoLm1heCgtSEFMRiwgYnVmZmVyZWQuejApLFxuICAgIHgxOiBNYXRoLm1pbihIQUxGIC0gMSwgYnVmZmVyZWQueDEpLFxuICAgIHoxOiBNYXRoLm1pbihIQUxGIC0gMSwgYnVmZmVyZWQuejEpLFxuICAgIHkwOiBNYXRoLm1heChZX01JTiwgbG8gLSAxKSxcbiAgICB5MTogTWF0aC5taW4oWV9NQVggLSAxLCBoaSArIDEpLFxuICB9O1xuICAvLyBBbiBleHBsaWNpdCBlbnZlbG9wZSByZXBsYWNlcyB0aGUgZGVyaXZlZCBvbmUuIENhbGxlcnMgdGhhdCBwaW4gYW4gZXhhY3RcbiAgLy8gd29yayBlbnZlbG9wZSAocGF0aCBwcmVwYXJhdGlvbikgbXVzdCBub3Qgc2lsZW50bHkgd2lkZW4gaXQgd2l0aCB0aGVcbiAgLy8gZGVmYXVsdCAxIG0gYnVmZmVyLlxuICBjb25zdCBlbnZlbG9wZSA9IG5vcm1hbGl6ZUVudmVsb3BlKG9wdGlvbnMuZW52ZWxvcGUgPz8gW2Rlcml2ZWRdKTtcbiAgY29uc3Qgc3VyZmFjZUVkaXRzID0gc3VyZmFjZU1hdGVyaWFsID09PSBudWxsID8gMCA6IHRhcmdldHMubGVuZ3RoO1xuXG4gIGNvbnN0IHBsYW46IFByZXBhcmF0aW9uUGxhbiA9IHtcbiAgICBpZDogJycsXG4gICAgc2l0ZUlkOiBwcm9wb3NhbC5zaXRlSWQsXG4gICAgcmVjdCxcbiAgICBmbG9vclk6IHByb3Bvc2FsLmZsb29yWSxcbiAgICBydWxlczogcHJvcG9zYWwucnVsZXMsXG4gICAgdGFyZ2V0cyxcbiAgICBjbGVhckVudGl0eUlkcyxcbiAgICBzdXJmYWNlTWF0ZXJpYWwsXG4gICAgZW52ZWxvcGUsXG4gICAgZXhwZWN0ZWQ6IHtcbiAgICAgIGN1dFZvbHVtZTogc3RhdHMuY3V0Vm9sdW1lLFxuICAgICAgZmlsbFZvbHVtZTogc3RhdHMuZmlsbFZvbHVtZSxcbiAgICAgIG1heEN1dDogc3RhdHMubWF4Q3V0LFxuICAgICAgbWF4RmlsbDogc3RhdHMubWF4RmlsbCxcbiAgICAgIG9ic3RydWN0aW9uczogY2xlYXJFbnRpdHlJZHMubGVuZ3RoLFxuICAgICAgc3VyZmFjZUVkaXRzLFxuICAgICAgdG90YWxFZGl0czogc3RhdHMuY3V0Vm9sdW1lICsgc3RhdHMuZmlsbFZvbHVtZSArIHN1cmZhY2VFZGl0cyxcbiAgICB9LFxuICB9O1xuICBwbGFuLmlkID0gYHByZXA6JHtwbGFuRGlnZXN0KHBsYW4pfWA7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBwbGFuLCB2YWxpZGF0aW9uIH07XG59XG5cbi8vIC0tLS0tLS0tLS0gYXV0aG9yaXphdGlvbiAtLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvcml6YXRpb25MaW1pdHMge1xuICBtYXhDdXRWb2x1bWU6IG51bWJlcjtcbiAgbWF4RmlsbFZvbHVtZTogbnVtYmVyO1xuICBtYXhWb3hlbEVkaXRzOiBudW1iZXI7XG4gIG1heEVudGl0eVJlbW92YWxzOiBudW1iZXI7XG4gIG1heFRhcmdldHM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfTElNSVRTOiBBdXRob3JpemF0aW9uTGltaXRzID0ge1xuICBtYXhDdXRWb2x1bWU6IDI1NixcbiAgbWF4RmlsbFZvbHVtZTogMjU2LFxuICBtYXhWb3hlbEVkaXRzOiAxMDI0LFxuICBtYXhFbnRpdHlSZW1vdmFsczogMTYsXG4gIG1heFRhcmdldHM6IDUxMixcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ya0F1dGhvcml6YXRpb24ge1xuICBpZDogc3RyaW5nO1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHBsYW5EaWdlc3Q6IHN0cmluZztcbiAgZW52ZWxvcGU6IFZveGVsUmVnaW9uW107XG4gIGJhc2VSZXZpc2lvbjogbnVtYmVyO1xuICBsaW1pdHM6IEF1dGhvcml6YXRpb25MaW1pdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvbkRlY2lzaW9uIHtcbiAgb2s6IGJvb2xlYW47XG4gIGF1dGhvcml6YXRpb246IFdvcmtBdXRob3JpemF0aW9uIHwgbnVsbDtcbiAgcmVhc29uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yaXphdGlvblBvbGljeSB7XG4gIC8qKiBUaGUgb25seSByZWdpb25zIHRoaXMgZ292ZXJub3IgcGVybWl0cyBmb3IgdGhlIGZpcnN0IHNsaWNlLiAqL1xuICBlbnZlbG9wZTogVm94ZWxSZWdpb25bXTtcbiAgbGltaXRzPzogUGFydGlhbDxBdXRob3JpemF0aW9uTGltaXRzPjtcbn1cblxuZnVuY3Rpb24gcmVnaW9uQ29udGFpbmVkKHJlZ2lvbjogVm94ZWxSZWdpb24sIHBvbGljeTogcmVhZG9ubHkgVm94ZWxSZWdpb25bXSk6IGJvb2xlYW4ge1xuICByZXR1cm4gcG9saWN5LnNvbWUoKHApID0+IHJlZ2lvbi54MCA+PSBwLngwICYmIHJlZ2lvbi54MSA8PSBwLngxXG4gICAgJiYgcmVnaW9uLnowID49IHAuejAgJiYgcmVnaW9uLnoxIDw9IHAuejFcbiAgICAmJiByZWdpb24ueTAgPj0gcC55MCAmJiByZWdpb24ueTEgPD0gcC55MSk7XG59XG5cbi8qKlxuICogTG9jYWwgZ292ZXJub3Igc3R1Yi4gSXQgZW5mb3JjZXMgYSBmaXhlZCBlbnZlbG9wZSBhbmQgaGFyZCB2b2x1bWUgbGltaXRzLFxuICogYmluZHMgYSB0b2tlbiB0byB0aGUgZXhhY3QgcGxhbiBkaWdlc3QgYW5kIHdvcmxkIHJldmlzaW9uLCBhbmQgcmVmdXNlcyB0b1xuICogcHJldGVuZCBpdCBpcyBhbiBvbi1jaGFpbiBhdXRob3JpdHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBMb2NhbEF1dGhvcml6ZXIge1xuICByZWFkb25seSBhdXRob3JpdHkgPSBMT0NBTF9BVVRIT1JJVFk7XG4gIHJlYWRvbmx5IGVuZm9yY2VtZW50ID0gTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIHJlYWRvbmx5IGxpbWl0czogQXV0aG9yaXphdGlvbkxpbWl0cztcblxuICBjb25zdHJ1Y3RvcihyZWFkb25seSBwb2xpY3k6IEF1dGhvcml6YXRpb25Qb2xpY3kpIHtcbiAgICB0aGlzLmxpbWl0cyA9IHsgLi4uREVGQVVMVF9MSU1JVFMsIC4uLihwb2xpY3kubGltaXRzID8/IHt9KSB9O1xuICB9XG5cbiAgYXV0aG9yaXplKHdvcmxkOiBXb3JsZCwgcGxhbjogUHJlcGFyYXRpb25QbGFuKTogQXV0aG9yaXphdGlvbkRlY2lzaW9uIHtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHJlY3QgPSBub3JtYWxpemVSZWN0KHBsYW4ucmVjdCk7XG5cbiAgICBpZiAocGxhbi50YXJnZXRzLmxlbmd0aCAhPT0gcmVjdENvbHVtbnMocmVjdCkpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbiBoYXMgJHtwbGFuLnRhcmdldHMubGVuZ3RofSB0YXJnZXRzIGZvciAke3JlY3RDb2x1bW5zKHJlY3QpfSBjb2x1bW5zYCk7XG4gICAgfVxuICAgIGlmIChwbGFuLnRhcmdldHMubGVuZ3RoID4gdGhpcy5saW1pdHMubWF4VGFyZ2V0cykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4udGFyZ2V0cy5sZW5ndGh9IHRhcmdldHMgZXhjZWVkIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4VGFyZ2V0c31gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQuY3V0Vm9sdW1lID4gdGhpcy5saW1pdHMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgICByZWFzb25zLnB1c2goYGN1dCAke3BsYW4uZXhwZWN0ZWQuY3V0Vm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4Q3V0Vm9sdW1lfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5leHBlY3RlZC5maWxsVm9sdW1lID4gdGhpcy5saW1pdHMubWF4RmlsbFZvbHVtZSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBmaWxsICR7cGxhbi5leHBlY3RlZC5maWxsVm9sdW1lfSBleGNlZWRzIGxpbWl0ICR7dGhpcy5saW1pdHMubWF4RmlsbFZvbHVtZX1gKTtcbiAgICB9XG4gICAgaWYgKHBsYW4uZXhwZWN0ZWQudG90YWxFZGl0cyA+IHRoaXMubGltaXRzLm1heFZveGVsRWRpdHMpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgcGxhbm5lZCBlZGl0cyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhWb3hlbEVkaXRzfWApO1xuICAgIH1cbiAgICBpZiAocGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGggPiB0aGlzLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFscykge1xuICAgICAgcmVhc29ucy5wdXNoKGAke3BsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RofSByZW1vdmFscyBleGNlZWQgbGltaXQgJHt0aGlzLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFsc31gKTtcbiAgICB9XG4gICAgaWYgKG5ldyBTZXQocGxhbi5jbGVhckVudGl0eUlkcykuc2l6ZSAhPT0gcGxhbi5jbGVhckVudGl0eUlkcy5sZW5ndGgpIHtcbiAgICAgIHJlYXNvbnMucHVzaCgnZHVwbGljYXRlIGVudGl0eSByZW1vdmFsIGlkcycpO1xuICAgIH1cblxuICAgIGlmIChwbGFuLmVudmVsb3BlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmVhc29ucy5wdXNoKCdwbGFuIGhhcyBubyB3b3JrIGVudmVsb3BlJyk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcmVnaW9uIG9mIHBsYW4uZW52ZWxvcGUpIHtcbiAgICAgIGlmICghcmVnaW9uQ29udGFpbmVkKHJlZ2lvbiwgdGhpcy5wb2xpY3kuZW52ZWxvcGUpKSB7XG4gICAgICAgIHJlYXNvbnMucHVzaChgZW52ZWxvcGUgJHtyZWdpb24ueDB9LCR7cmVnaW9uLnowfSwke3JlZ2lvbi55MH0uLiR7cmVnaW9uLngxfSwke3JlZ2lvbi56MX0sJHtyZWdpb24ueTF9IGlzIG91dHNpZGUgdGhlIGxvY2FsIHBvbGljeWApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IHQgb2YgcGxhbi50YXJnZXRzKSB7XG4gICAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMocGxhbi5lbnZlbG9wZSwgdC54LCB0LnksIHQueilcbiAgICAgICAgfHwgKHQueSA+IFlfTUlOICYmICFlbnZlbG9wZUNvbnRhaW5zKHBsYW4uZW52ZWxvcGUsIHQueCwgdC55IC0gMSwgdC56KSkpIHtcbiAgICAgICAgcmVhc29ucy5wdXNoKGB0YXJnZXQgJHt0Lnh9LCR7dC56fSwke3QueX0gaXMgbm90IGNvdmVyZWQgYnkgdGhlIHdvcmsgZW52ZWxvcGVgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBFdmVyeSBvYnN0cnVjdGlvbiBjdXJyZW50bHkgb24gdGhlIGZvb3RwcmludCBtdXN0IGJlIGluIHRoZSBwbGFuLCBhbmRcbiAgICAvLyB0aGUgcGxhbiBtYXkgbm90IHJlbW92ZSBhbnl0aGluZyB0aGF0IGlzIG5vdCBhbiBvYnN0cnVjdGlvbiB0aGVyZS5cbiAgICBjb25zdCBjdXJyZW50ID0gb2JzdHJ1Y3Rpb25zSW4od29ybGQsIHJlY3QpLm1hcCgobykgPT4gby5lbnRpdHlJZCkuc29ydCgpO1xuICAgIGNvbnN0IHBsYW5uZWQgPSBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpO1xuICAgIGlmIChjdXJyZW50Lmxlbmd0aCAhPT0gcGxhbm5lZC5sZW5ndGggfHwgY3VycmVudC5zb21lKChpZCwgaSkgPT4gaWQgIT09IHBsYW5uZWRbaV0pKSB7XG4gICAgICByZWFzb25zLnB1c2goYHBsYW4gcmVtb3ZhbHMgWyR7cGxhbm5lZC5qb2luKCcsJyl9XSBkbyBub3QgbWF0Y2ggZm9vdHByaW50IG9ic3RydWN0aW9ucyBbJHtjdXJyZW50LmpvaW4oJywnKX1dYCk7XG4gICAgfVxuXG4gICAgaWYgKHJlYXNvbnMubGVuZ3RoID4gMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBhdXRob3JpemF0aW9uOiBudWxsLCByZWFzb25zIH07XG5cbiAgICBjb25zdCB0b2tlbjogV29ya0F1dGhvcml6YXRpb24gPSB7XG4gICAgICBpZDogYGxvY2FsLXN0dWI6JHtwbGFuRGlnZXN0KHBsYW4pfWAsXG4gICAgICBhdXRob3JpdHk6IExPQ0FMX0FVVEhPUklUWSxcbiAgICAgIGVuZm9yY2VtZW50OiBMT0NBTF9FTkZPUkNFTUVOVCxcbiAgICAgIHBsYW5EaWdlc3Q6IHBsYW5EaWdlc3QocGxhbiksXG4gICAgICBlbnZlbG9wZTogbm9ybWFsaXplRW52ZWxvcGUocGxhbi5lbnZlbG9wZSksXG4gICAgICBiYXNlUmV2aXNpb246IHdvcmxkLnJldmlzaW9uLFxuICAgICAgbGltaXRzOiB7IC4uLnRoaXMubGltaXRzIH0sXG4gICAgfTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgYXV0aG9yaXphdGlvbjogdG9rZW4sIHJlYXNvbnM6IFtdIH07XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLSBleGVjdXRpb24gLS0tLS0tLS0tLVxuaW50ZXJmYWNlIFBlbmRpbmdFZGl0IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgYmVmb3JlOiBNYXRJZDtcbiAgYWZ0ZXI6IE1hdElkO1xuICAvKiogVHJ1ZSBmb3IgYSBtYXRlcmlhbC1vbmx5IHRvcC1zdXJmYWNlIGNoYW5nZS4gKi9cbiAgc3VyZmFjZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2h1bmtEZWx0YSB7XG4gIGNodW5rOiBzdHJpbmc7XG4gIGNoYW5nZWQ6IG51bWJlcjtcbiAgYWRkZWQ6IG51bWJlcjtcbiAgcmVtb3ZlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENsZWFyZWRFbnRpdHkge1xuICBlbnRpdHlJZDogc3RyaW5nO1xuICBraW5kOiBFbnRpdHlLaW5kO1xuICByZXNvdXJjZTogUmVzb3VyY2VUeXBlIHwgbnVsbDtcbiAgYW1vdW50OiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25MZWRnZXIge1xuICBhdXRob3JpdHk6IHR5cGVvZiBMT0NBTF9BVVRIT1JJVFk7XG4gIGVuZm9yY2VtZW50OiB0eXBlb2YgTE9DQUxfRU5GT1JDRU1FTlQ7XG4gIGF1dGhvcml6YXRpb25JZDogc3RyaW5nO1xuICBwbGFuRGlnZXN0OiBzdHJpbmc7XG4gIHNpdGVJZDogc3RyaW5nO1xuICByZWN0OiBSZWN0O1xuICBmbG9vclk6IG51bWJlcjtcbiAgY3V0Vm9sdW1lOiBudW1iZXI7XG4gIGZpbGxWb2x1bWU6IG51bWJlcjtcbiAgbmV0U3BvaWw6IG51bWJlcjtcbiAgYm9ycm93ZWRGaWxsOiBudW1iZXI7XG4gIGN1dEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGZpbGxCeU1hdGVyaWFsOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICB2b3hlbEVkaXRzOiBudW1iZXI7XG4gIHN1cmZhY2VFZGl0czogbnVtYmVyO1xuICBlbnRpdGllc0NsZWFyZWQ6IENsZWFyZWRFbnRpdHlbXTtcbiAgcmVzb3VyY2VzR2FpbmVkOiBQYXJ0aWFsPFJlY29yZDxSZXNvdXJjZVR5cGUsIG51bWJlcj4+O1xuICBpbnZlbnRvcnlCZWZvcmU6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGludmVudG9yeUFmdGVyOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBjaHVua0RlbHRhczogQ2h1bmtEZWx0YVtdO1xuICByZXZpc2lvbkJlZm9yZTogbnVtYmVyO1xuICByZXZpc2lvbkFmdGVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJlcGFyYXRpb25TdWNjZXNzIHtcbiAgb2s6IHRydWU7XG4gIHBsYW46IFByZXBhcmF0aW9uUGxhbjtcbiAgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb247XG4gIGxlZGdlcjogUHJlcGFyYXRpb25MZWRnZXI7XG59XG5cbmV4cG9ydCB0eXBlIFByZXBhcmF0aW9uT3V0Y29tZSA9IFByZXBhcmF0aW9uU3VjY2VzcyB8IFByZXBhcmF0aW9uRmFpbHVyZTtcblxuY29uc3QgTUFURVJJQUxfTkFNRVM6IFJlY29yZDxudW1iZXIsIHN0cmluZz4gPSB7XG4gIFtNQVQuR1JBU1NdOiAnZ3Jhc3MnLFxuICBbTUFULlNPSUxdOiAnc29pbCcsXG4gIFtNQVQuU0FORF06ICdzYW5kJyxcbiAgW01BVC5HUkFWRUxdOiAnZ3JhdmVsJyxcbiAgW01BVC5TVE9ORV06ICdzdG9uZScsXG4gIFtNQVQuT1JFXTogJ29yZScsXG4gIFtNQVQuV0FURVJdOiAnd2F0ZXInLFxuICBbTUFULkJFRFJPQ0tdOiAnYmVkcm9jaycsXG4gIFtNQVQuTU9TU106ICdtb3NzJyxcbn07XG5cbmZ1bmN0aW9uIG1hdGVyaWFsTmFtZShtOiBNYXRJZCk6IHN0cmluZyB7XG4gIHJldHVybiBNQVRFUklBTF9OQU1FU1ttXSA/PyBgbWF0XyR7bX1gO1xufVxuXG5mdW5jdGlvbiBmaWxsTWF0ZXJpYWwoeTogbnVtYmVyLCB0YXJnZXQ6IG51bWJlcik6IE1hdElkIHtcbiAgcmV0dXJuIHkgPT09IHRhcmdldCAtIDEgPyBNQVQuR1JBU1MgOiBNQVQuU09JTDtcbn1cblxuZnVuY3Rpb24gZmFpbChzdGFnZTogUHJlcGFyYXRpb25GYWlsdXJlWydzdGFnZSddLCBjb2RlOiBzdHJpbmcsIHJlYXNvbnM6IHN0cmluZ1tdKTogUHJlcGFyYXRpb25GYWlsdXJlIHtcbiAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGFnZSwgY29kZSwgcmVhc29ucyB9O1xufVxuXG4vKipcbiAqIEFwcGx5IGFuIGF1dGhvcml6ZWQgcGxhbi4gTm8gdm94ZWwgaXMgd3JpdHRlbiB1bnRpbCBldmVyeSBlZGl0IGFuZCByZW1vdmFsXG4gKiBoYXMgYmVlbiBjaGVja2VkIGFnYWluc3QgdGhlIHRva2VuLCB0aGUgcGxhbiBlbnZlbG9wZSBhbmQgdGhlIGhhcmQgbGltaXRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXhlY3V0ZVByZXBhcmF0aW9uKFxuICB3b3JsZDogV29ybGQsIHBsYW46IFByZXBhcmF0aW9uUGxhbiwgYXV0aG9yaXphdGlvbjogV29ya0F1dGhvcml6YXRpb24sXG4pOiBQcmVwYXJhdGlvbk91dGNvbWUge1xuICBpZiAoYXV0aG9yaXphdGlvbi5hdXRob3JpdHkgIT09IExPQ0FMX0FVVEhPUklUWVxuICAgIHx8IGF1dGhvcml6YXRpb24uZW5mb3JjZW1lbnQgIT09IExPQ0FMX0VORk9SQ0VNRU5UKSB7XG4gICAgcmV0dXJuIGZhaWwoJ2V4ZWN1dGUnLCAndW5zdXBwb3J0ZWRfYXV0aG9yaXR5JywgW1xuICAgICAgYGF1dGhvcml0eSAke2F1dGhvcml6YXRpb24uYXV0aG9yaXR5fS8ke2F1dGhvcml6YXRpb24uZW5mb3JjZW1lbnR9IGlzIG5vdCB0aGUgbG9jYWwgc3R1YmAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24ucGxhbkRpZ2VzdCAhPT0gcGxhbkRpZ2VzdChwbGFuKSkge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ2RpZ2VzdF9taXNtYXRjaCcsIFsnYXV0aG9yaXphdGlvbiBkb2VzIG5vdCBtYXRjaCB0aGlzIHBsYW4nXSk7XG4gIH1cbiAgaWYgKGF1dGhvcml6YXRpb24uYmFzZVJldmlzaW9uICE9PSB3b3JsZC5yZXZpc2lvbikge1xuICAgIHJldHVybiBmYWlsKCdleGVjdXRlJywgJ3N0YWxlX2F1dGhvcml6YXRpb24nLCBbXG4gICAgICBgYXV0aG9yaXphdGlvbiB3YXMgaXNzdWVkIGF0IHJldmlzaW9uICR7YXV0aG9yaXphdGlvbi5iYXNlUmV2aXNpb259LCB3b3JsZCBpcyBhdCAke3dvcmxkLnJldmlzaW9ufWAsXG4gICAgXSk7XG4gIH1cbiAgaWYgKHBsYW4uZW52ZWxvcGUuc29tZSgocikgPT4gIXJlZ2lvbkNvbnRhaW5lZChyLCBhdXRob3JpemF0aW9uLmVudmVsb3BlKSkpIHtcbiAgICByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICdlbnZlbG9wZV9taXNtYXRjaCcsIFsncGxhbiBlbnZlbG9wZSBpcyB3aWRlciB0aGFuIHRoZSBhdXRob3JpemF0aW9uJ10pO1xuICB9XG5cbiAgY29uc3QgcmVjdCA9IG5vcm1hbGl6ZVJlY3QocGxhbi5yZWN0KTtcbiAgY29uc3QgZWRpdHM6IFBlbmRpbmdFZGl0W10gPSBbXTtcbiAgZm9yIChjb25zdCB0IG9mIHBsYW4udGFyZ2V0cykge1xuICAgIGNvbnN0IHN1cmZhY2UgPSBzdXJmYWNlQXQod29ybGQsIHQueCwgdC56KTtcbiAgICBpZiAodC55IDwgc3VyZmFjZSkge1xuICAgICAgZm9yIChsZXQgeSA9IHQueTsgeSA8IHN1cmZhY2U7IHkrKykge1xuICAgICAgICBjb25zdCBiZWZvcmUgPSBnZXRWb3hlbCh3b3JsZCwgdC54LCB5LCB0LnopO1xuICAgICAgICBpZiAoaXNTb2xpZChiZWZvcmUpKSBlZGl0cy5wdXNoKHsgeDogdC54LCB5LCB6OiB0LnosIGJlZm9yZSwgYWZ0ZXI6IE1BVC5BSVIgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0LnkgPiBzdXJmYWNlKSB7XG4gICAgICBmb3IgKGxldCB5ID0gc3VyZmFjZTsgeSA8IHQueTsgeSsrKSB7XG4gICAgICAgIGNvbnN0IGJlZm9yZSA9IGdldFZveGVsKHdvcmxkLCB0LngsIHksIHQueik7XG4gICAgICAgIGlmICghaXNTb2xpZChiZWZvcmUpKSB7XG4gICAgICAgICAgY29uc3QgYWZ0ZXIgPSBwbGFuLnN1cmZhY2VNYXRlcmlhbCAhPT0gbnVsbCAmJiB5ID09PSB0LnkgLSAxXG4gICAgICAgICAgICA/IHBsYW4uc3VyZmFjZU1hdGVyaWFsXG4gICAgICAgICAgICA6IGZpbGxNYXRlcmlhbCh5LCB0LnkpO1xuICAgICAgICAgIGVkaXRzLnB1c2goeyB4OiB0LngsIHksIHo6IHQueiwgYmVmb3JlLCBhZnRlciB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyBNYXRlcmlhbC1vbmx5IHN1cmZhY2UgY2hhbmdlIGZvciBjdXQgb3IgYWxyZWFkeS1sZXZlbCBjb2x1bW5zLiBGaWxsXG4gICAgLy8gY29sdW1ucyBhbHJlYWR5IHJlY2VpdmUgdGhlIHN1cmZhY2UgbWF0ZXJpYWwgaW4gdGhlIGZpbGwgbG9vcCBhYm92ZS5cbiAgICBpZiAocGxhbi5zdXJmYWNlTWF0ZXJpYWwgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHRvcFkgPSB0LnkgLSAxO1xuICAgICAgY29uc3QgYmVmb3JlID0gZ2V0Vm94ZWwod29ybGQsIHQueCwgdG9wWSwgdC56KTtcbiAgICAgIGlmIChpc1NvbGlkKGJlZm9yZSkgJiYgYmVmb3JlICE9PSBwbGFuLnN1cmZhY2VNYXRlcmlhbCkge1xuICAgICAgICBlZGl0cy5wdXNoKHtcbiAgICAgICAgICB4OiB0LngsIHk6IHRvcFksIHo6IHQueiwgYmVmb3JlLCBhZnRlcjogcGxhbi5zdXJmYWNlTWF0ZXJpYWwsIHN1cmZhY2U6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGV2ZXJ5IGVkaXQgYmVmb3JlIG11dGF0aW5nIGFueXRoaW5nLlxuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGUgb2YgZWRpdHMpIHtcbiAgICBpZiAoZS54IDwgcmVjdC54MCB8fCBlLnggPiByZWN0LngxIHx8IGUueiA8IHJlY3QuejAgfHwgZS56ID4gcmVjdC56MSkge1xuICAgICAgcmVhc29ucy5wdXNoKGBlZGl0ICR7ZS54fSwke2UueX0sJHtlLnp9IGlzIG91dHNpZGUgdGhlIGZvb3RwcmludGApO1xuICAgIH1cbiAgICBpZiAoIWVudmVsb3BlQ29udGFpbnMoYXV0aG9yaXphdGlvbi5lbnZlbG9wZSwgZS54LCBlLnksIGUueikpIHtcbiAgICAgIHJlYXNvbnMucHVzaChgZWRpdCAke2UueH0sJHtlLnl9LCR7ZS56fSBpcyBvdXRzaWRlIHRoZSBhdXRob3JpemVkIGVudmVsb3BlYCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGN1dFZvbHVtZSA9IGVkaXRzLmZpbHRlcigoZSkgPT4gZS5hZnRlciA9PT0gTUFULkFJUiAmJiBpc1NvbGlkKGUuYmVmb3JlKSkubGVuZ3RoO1xuICBjb25zdCBmaWxsVm9sdW1lID0gZWRpdHMuZmlsdGVyKChlKSA9PiBlLmFmdGVyICE9PSBNQVQuQUlSICYmICFpc1NvbGlkKGUuYmVmb3JlKSkubGVuZ3RoO1xuICBpZiAoY3V0Vm9sdW1lID4gYXV0aG9yaXphdGlvbi5saW1pdHMubWF4Q3V0Vm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBjdXQgJHtjdXRWb2x1bWV9IGV4Y2VlZHMgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhDdXRWb2x1bWV9YCk7XG4gIH1cbiAgaWYgKGZpbGxWb2x1bWUgPiBhdXRob3JpemF0aW9uLmxpbWl0cy5tYXhGaWxsVm9sdW1lKSB7XG4gICAgcmVhc29ucy5wdXNoKGBmaWxsICR7ZmlsbFZvbHVtZX0gZXhjZWVkcyBsaW1pdCAke2F1dGhvcml6YXRpb24ubGltaXRzLm1heEZpbGxWb2x1bWV9YCk7XG4gIH1cbiAgaWYgKGVkaXRzLmxlbmd0aCA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heFZveGVsRWRpdHMpIHtcbiAgICByZWFzb25zLnB1c2goYCR7ZWRpdHMubGVuZ3RofSBlZGl0cyBleGNlZWQgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhWb3hlbEVkaXRzfWApO1xuICB9XG5cbiAgY29uc3QgY3VycmVudCA9IG9ic3RydWN0aW9uc0luKHdvcmxkLCByZWN0KS5tYXAoKG8pID0+IG8uZW50aXR5SWQpLnNvcnQoKTtcbiAgY29uc3QgcGxhbm5lZCA9IFsuLi5wbGFuLmNsZWFyRW50aXR5SWRzXS5zb3J0KCk7XG4gIGlmIChjdXJyZW50Lmxlbmd0aCAhPT0gcGxhbm5lZC5sZW5ndGggfHwgY3VycmVudC5zb21lKChpZCwgaSkgPT4gaWQgIT09IHBsYW5uZWRbaV0pKSB7XG4gICAgcmVhc29ucy5wdXNoKCdmb290cHJpbnQgb2JzdHJ1Y3Rpb25zIGNoYW5nZWQgYWZ0ZXIgYXV0aG9yaXphdGlvbicpO1xuICB9XG4gIGlmIChwbGFuLmNsZWFyRW50aXR5SWRzLmxlbmd0aCA+IGF1dGhvcml6YXRpb24ubGltaXRzLm1heEVudGl0eVJlbW92YWxzKSB7XG4gICAgcmVhc29ucy5wdXNoKGAke3BsYW4uY2xlYXJFbnRpdHlJZHMubGVuZ3RofSByZW1vdmFscyBleGNlZWQgbGltaXQgJHthdXRob3JpemF0aW9uLmxpbWl0cy5tYXhFbnRpdHlSZW1vdmFsc31gKTtcbiAgfVxuICBmb3IgKGNvbnN0IGlkIG9mIHBsYW4uY2xlYXJFbnRpdHlJZHMpIHtcbiAgICBpZiAoIXdvcmxkLmVudGl0aWVzLmhhcyhpZCkpIHJlYXNvbnMucHVzaChgZW50aXR5ICR7aWR9IG5vIGxvbmdlciBleGlzdHNgKTtcbiAgfVxuICBpZiAocmVhc29ucy5sZW5ndGggPiAwKSByZXR1cm4gZmFpbCgnZXhlY3V0ZScsICd1bmF1dGhvcml6ZWRfZWRpdHMnLCByZWFzb25zKTtcblxuICBjb25zdCBpbnZlbnRvcnlCZWZvcmUgPSBpbnZlbnRvcnlTbmFwc2hvdCh3b3JsZCk7XG4gIGNvbnN0IHJldmlzaW9uQmVmb3JlID0gd29ybGQucmV2aXNpb247XG4gIGNvbnN0IGNodW5rRGVsdGFzID0gbmV3IE1hcDxzdHJpbmcsIENodW5rRGVsdGE+KCk7XG4gIGNvbnN0IGN1dEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgY29uc3QgZmlsbEJ5TWF0ZXJpYWw6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgbGV0IGFwcGxpZWQgPSAwO1xuICBsZXQgc3VyZmFjZUVkaXRzID0gMDtcblxuICBmb3IgKGNvbnN0IGUgb2YgZWRpdHMpIHtcbiAgICBpZiAoIXNldFZveGVsKHdvcmxkLCBlLngsIGUueSwgZS56LCBlLmFmdGVyKSkgY29udGludWU7XG4gICAgYXBwbGllZCsrO1xuICAgIGlmIChlLnN1cmZhY2UpIHN1cmZhY2VFZGl0cysrO1xuICAgIGNvbnN0IGtleSA9IGNodW5rS2V5KHdvcmxkVG9DaHVua1goZS54KSwgd29ybGRUb0NodW5rWihlLnopKTtcbiAgICBsZXQgZGVsdGEgPSBjaHVua0RlbHRhcy5nZXQoa2V5KTtcbiAgICBpZiAoIWRlbHRhKSB7XG4gICAgICBkZWx0YSA9IHsgY2h1bms6IGtleSwgY2hhbmdlZDogMCwgYWRkZWQ6IDAsIHJlbW92ZWQ6IDAgfTtcbiAgICAgIGNodW5rRGVsdGFzLnNldChrZXksIGRlbHRhKTtcbiAgICB9XG4gICAgZGVsdGEuY2hhbmdlZCsrO1xuICAgIGNvbnN0IHdhc1NvbGlkID0gaXNTb2xpZChlLmJlZm9yZSk7XG4gICAgY29uc3QgaXNOb3dTb2xpZCA9IGlzU29saWQoZS5hZnRlcik7XG4gICAgaWYgKCF3YXNTb2xpZCAmJiBpc05vd1NvbGlkKSBkZWx0YS5hZGRlZCsrO1xuICAgIGlmICh3YXNTb2xpZCAmJiAhaXNOb3dTb2xpZCkgZGVsdGEucmVtb3ZlZCsrO1xuICAgIGNvbnN0IG5hbWUgPSBtYXRlcmlhbE5hbWUoZS5iZWZvcmUpO1xuICAgIGlmICh3YXNTb2xpZCAmJiAhaXNOb3dTb2xpZCkgY3V0QnlNYXRlcmlhbFtuYW1lXSA9IChjdXRCeU1hdGVyaWFsW25hbWVdID8/IDApICsgMTtcbiAgICBpZiAoIXdhc1NvbGlkICYmIGlzTm93U29saWQpIGZpbGxCeU1hdGVyaWFsW21hdGVyaWFsTmFtZShlLmFmdGVyKV0gPSAoZmlsbEJ5TWF0ZXJpYWxbbWF0ZXJpYWxOYW1lKGUuYWZ0ZXIpXSA/PyAwKSArIDE7XG4gIH1cblxuICBjb25zdCBlbnRpdGllc0NsZWFyZWQ6IENsZWFyZWRFbnRpdHlbXSA9IFtdO1xuICBjb25zdCByZXNvdXJjZXNHYWluZWQ6IFBhcnRpYWw8UmVjb3JkPFJlc291cmNlVHlwZSwgbnVtYmVyPj4gPSB7fTtcbiAgZm9yIChjb25zdCBpZCBvZiBbLi4ucGxhbi5jbGVhckVudGl0eUlkc10uc29ydCgpKSB7XG4gICAgY29uc3QgZSA9IHdvcmxkLmVudGl0aWVzLmdldChpZCk7XG4gICAgaWYgKCFlKSBjb250aW51ZTtcbiAgICBjb25zdCBhbW91bnQgPSBlLnJlc291cmNlICYmIGUucmVtYWluaW5nID4gMCA/IGUucmVtYWluaW5nIDogMDtcbiAgICBpZiAoZS5yZXNvdXJjZSAmJiBhbW91bnQgPiAwKSB7XG4gICAgICB3b3JsZC5pbnZlbnRvcnlbZS5yZXNvdXJjZV0gPSAod29ybGQuaW52ZW50b3J5W2UucmVzb3VyY2VdID8/IDApICsgYW1vdW50O1xuICAgICAgcmVzb3VyY2VzR2FpbmVkW2UucmVzb3VyY2VdID0gKHJlc291cmNlc0dhaW5lZFtlLnJlc291cmNlXSA/PyAwKSArIGFtb3VudDtcbiAgICB9XG4gICAgcmVtb3ZlRW50aXR5KHdvcmxkLCBpZCk7XG4gICAgZW50aXRpZXNDbGVhcmVkLnB1c2goe1xuICAgICAgZW50aXR5SWQ6IGlkLCBraW5kOiBlLmtpbmQsIHJlc291cmNlOiBlLnJlc291cmNlLCBhbW91bnQsIHg6IGUueCwgeTogZS55LCB6OiBlLnosXG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBjdXQgPSBhcHBsaWVkID4gMCA/IE9iamVjdC52YWx1ZXMoY3V0QnlNYXRlcmlhbCkucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgOiAwO1xuICBjb25zdCBmaWxsID0gYXBwbGllZCA+IDAgPyBPYmplY3QudmFsdWVzKGZpbGxCeU1hdGVyaWFsKS5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSA6IDA7XG4gIGNvbnN0IGxlZGdlcjogUHJlcGFyYXRpb25MZWRnZXIgPSB7XG4gICAgYXV0aG9yaXR5OiBMT0NBTF9BVVRIT1JJVFksXG4gICAgZW5mb3JjZW1lbnQ6IExPQ0FMX0VORk9SQ0VNRU5ULFxuICAgIGF1dGhvcml6YXRpb25JZDogYXV0aG9yaXphdGlvbi5pZCxcbiAgICBwbGFuRGlnZXN0OiBhdXRob3JpemF0aW9uLnBsYW5EaWdlc3QsXG4gICAgc2l0ZUlkOiBwbGFuLnNpdGVJZCxcbiAgICByZWN0LFxuICAgIGZsb29yWTogcGxhbi5mbG9vclksXG4gICAgY3V0Vm9sdW1lOiBjdXQsXG4gICAgZmlsbFZvbHVtZTogZmlsbCxcbiAgICBuZXRTcG9pbDogY3V0IC0gZmlsbCxcbiAgICBib3Jyb3dlZEZpbGw6IE1hdGgubWF4KDAsIGZpbGwgLSBjdXQpLFxuICAgIGN1dEJ5TWF0ZXJpYWwsXG4gICAgZmlsbEJ5TWF0ZXJpYWwsXG4gICAgdm94ZWxFZGl0czogYXBwbGllZCxcbiAgICBzdXJmYWNlRWRpdHMsXG4gICAgZW50aXRpZXNDbGVhcmVkLFxuICAgIHJlc291cmNlc0dhaW5lZCxcbiAgICBpbnZlbnRvcnlCZWZvcmUsXG4gICAgaW52ZW50b3J5QWZ0ZXI6IGludmVudG9yeVNuYXBzaG90KHdvcmxkKSxcbiAgICBjaHVua0RlbHRhczogWy4uLmNodW5rRGVsdGFzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmNodW5rLmxvY2FsZUNvbXBhcmUoYi5jaHVuaykpLFxuICAgIHJldmlzaW9uQmVmb3JlLFxuICAgIHJldmlzaW9uQWZ0ZXI6IHdvcmxkLnJldmlzaW9uLFxuICB9O1xuICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiwgYXV0aG9yaXphdGlvbiwgbGVkZ2VyIH07XG59XG5cbi8qKlxuICogVGhlIHNoYXJlZCBwbGF5ZXIvQUkgZW50cnkgcG9pbnQuIFRoZXJlIGlzIG5vIG90aGVyIGNvbnN0cnVjdGlvbiBwYXRoLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJlcGFyZVNpdGUoXG4gIHdvcmxkOiBXb3JsZCxcbiAgYXV0aG9yaXplcjogTG9jYWxBdXRob3JpemVyLFxuICBwcm9wb3NhbDogU2l0ZVByb3Bvc2FsLFxuICBvcHRpb25zOiBQcmVwYXJhdGlvbk9wdGlvbnMgPSB7fSxcbik6IFByZXBhcmF0aW9uT3V0Y29tZSB7XG4gIGNvbnN0IHBsYW5uZWQgPSBwbGFuUHJlcGFyYXRpb24od29ybGQsIHByb3Bvc2FsLCBvcHRpb25zKTtcbiAgaWYgKCFwbGFubmVkLm9rKSByZXR1cm4gcGxhbm5lZDtcbiAgY29uc3QgZGVjaXNpb24gPSBhdXRob3JpemVyLmF1dGhvcml6ZSh3b3JsZCwgcGxhbm5lZC5wbGFuKTtcbiAgaWYgKCFkZWNpc2lvbi5vayB8fCAhZGVjaXNpb24uYXV0aG9yaXphdGlvbikge1xuICAgIHJldHVybiBmYWlsKCdhdXRob3JpemUnLCAnbm90X2F1dGhvcml6ZWQnLCBkZWNpc2lvbi5yZWFzb25zKTtcbiAgfVxuICByZXR1cm4gZXhlY3V0ZVByZXBhcmF0aW9uKHdvcmxkLCBwbGFubmVkLnBsYW4sIGRlY2lzaW9uLmF1dGhvcml6YXRpb24pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUVBLE9BQU8sVUFBVTtBQUNqQixPQUFPLFlBQVk7OztBQ1VaLElBQU0sYUFBYTtBQUNuQixJQUFNLE9BQU8sYUFBYTtBQUMxQixJQUFNLGFBQWE7QUFDbkIsSUFBTSxrQkFBa0IsYUFBYTtBQUNyQyxJQUFNLFFBQVE7QUFDZCxJQUFNLFFBQVE7QUFDZCxJQUFNLGVBQWUsUUFBUTtBQUM3QixJQUFNLFlBQVk7QUFFbEIsSUFBTSxvQkFBb0I7QUFDMUIsSUFBTSxlQUFlLGFBQWEsYUFBYTtBQUMvQyxJQUFNLGFBQWEsYUFBYTtBQUVoQyxJQUFNLE1BQU07QUFBQSxFQUNqQixLQUFLO0FBQUEsRUFDTCxPQUFPO0FBQUEsRUFDUCxNQUFNO0FBQUEsRUFDTixNQUFNO0FBQUEsRUFD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
